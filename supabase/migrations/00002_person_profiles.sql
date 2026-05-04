-- BoxOps - Task 009 visible person profiles
-- Adds tenant-scoped operational people that can exist before auth.users.

-- ============================================================
-- Person profiles
-- ============================================================

CREATE TABLE public.person_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid,
  full_name text,
  display_name text NOT NULL,
  preferred_alias text,
  public_email text,
  avatar_url text,
  visibility_status text NOT NULL DEFAULT 'visible'
    CHECK (visibility_status IN ('visible', 'internal')),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id),
  FOREIGN KEY (organization_id, user_id)
    REFERENCES public.organization_memberships(organization_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT person_profiles_display_name_not_blank
    CHECK (length(btrim(display_name)) > 0),
  CONSTRAINT person_profiles_full_name_not_blank
    CHECK (full_name IS NULL OR length(btrim(full_name)) > 0),
  CONSTRAINT person_profiles_preferred_alias_not_blank
    CHECK (preferred_alias IS NULL OR length(btrim(preferred_alias)) > 0),
  CONSTRAINT person_profiles_public_email_format
    CHECK (
      public_email IS NULL
      OR public_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    ),
  CONSTRAINT person_profiles_avatar_url_not_blank
    CHECK (avatar_url IS NULL OR length(btrim(avatar_url)) > 0)
);

CREATE UNIQUE INDEX person_profiles_org_user_unique
  ON public.person_profiles (organization_id, user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX person_profiles_organization_visibility_idx
  ON public.person_profiles (organization_id, visibility_status, status);

CREATE INDEX person_profiles_organization_display_name_idx
  ON public.person_profiles (organization_id, display_name);

CREATE INDEX person_profiles_user_idx
  ON public.person_profiles (user_id)
  WHERE user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.enforce_person_profile_update_permissions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := (select auth.uid());
BEGIN
  -- Seeds, migrations and service contexts do not carry an auth.uid().
  IF current_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.has_org_role(OLD.organization_id, ARRAY['owner', 'admin']) THEN
    RETURN NEW;
  END IF;

  IF OLD.user_id IS NOT NULL
    AND OLD.user_id = current_user_id
    AND NEW.id = OLD.id
    AND NEW.organization_id = OLD.organization_id
    AND NEW.user_id IS NOT DISTINCT FROM OLD.user_id
    AND NEW.visibility_status = OLD.visibility_status
    AND NEW.status = OLD.status
    AND NEW.metadata = OLD.metadata
    AND NEW.created_at = OLD.created_at THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'person profile update is not allowed for this user';
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_person_profile_coach_links()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.coach_profiles coach_profile
    WHERE coach_profile.organization_id = NEW.organization_id
      AND coach_profile.person_profile_id = NEW.id
      AND coach_profile.user_id IS NOT NULL
      AND coach_profile.user_id <> NEW.user_id
  ) THEN
    RAISE EXCEPTION 'linked coach profile user_id must match person profile user_id';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER person_profiles_set_updated_at
  BEFORE UPDATE ON public.person_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER person_profiles_enforce_update_permissions
  BEFORE UPDATE ON public.person_profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_person_profile_update_permissions();

CREATE TRIGGER person_profiles_validate_coach_links
  BEFORE UPDATE ON public.person_profiles
  FOR EACH ROW EXECUTE FUNCTION public.validate_person_profile_coach_links();

-- ============================================================
-- Coach profiles can now point to visible people before Auth
-- ============================================================

ALTER TABLE public.coach_profiles
  ADD COLUMN person_profile_id uuid;

ALTER TABLE public.coach_profiles
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.coach_profiles
  ADD CONSTRAINT coach_profiles_person_or_user_required
  CHECK (user_id IS NOT NULL OR person_profile_id IS NOT NULL);

ALTER TABLE public.coach_profiles
  ADD CONSTRAINT coach_profiles_person_profile_id_organization_id_fkey
  FOREIGN KEY (person_profile_id, organization_id)
  REFERENCES public.person_profiles(id, organization_id)
  ON DELETE RESTRICT;

CREATE UNIQUE INDEX coach_profiles_org_person_profile_unique
  ON public.coach_profiles (organization_id, person_profile_id)
  WHERE person_profile_id IS NOT NULL;

CREATE INDEX coach_profiles_org_person_profile_idx
  ON public.coach_profiles (organization_id, person_profile_id)
  WHERE person_profile_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.validate_coach_profile_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  linked_user_id uuid;
BEGIN
  IF NEW.user_id IS NULL AND NEW.person_profile_id IS NULL THEN
    RAISE EXCEPTION 'coach profile requires user_id or person_profile_id';
  END IF;

  IF NEW.person_profile_id IS NOT NULL THEN
    SELECT person_profile.user_id
    INTO linked_user_id
    FROM public.person_profiles person_profile
    WHERE person_profile.id = NEW.person_profile_id
      AND person_profile.organization_id = NEW.organization_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'person profile must belong to the same organization';
    END IF;

    IF NEW.user_id IS NOT NULL
      AND linked_user_id IS NOT NULL
      AND NEW.user_id <> linked_user_id THEN
      RAISE EXCEPTION 'coach profile user_id must match linked person profile user_id';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER coach_profiles_validate_identity
  BEFORE INSERT OR UPDATE ON public.coach_profiles
  FOR EACH ROW EXECUTE FUNCTION public.validate_coach_profile_identity();

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE public.person_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view visible person profiles"
  ON public.person_profiles FOR SELECT TO authenticated
  USING (
    visibility_status = 'visible'
    AND public.is_org_member(organization_id)
  );

CREATE POLICY "Linked users can view own person profile"
  ON public.person_profiles FOR SELECT TO authenticated
  USING (
    user_id = (select auth.uid())
    AND public.is_org_member(organization_id)
  );

CREATE POLICY "Admins can view person profiles"
  ON public.person_profiles FOR SELECT TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner', 'admin']));

CREATE POLICY "Admins can create person profiles"
  ON public.person_profiles FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(organization_id, ARRAY['owner', 'admin']));

CREATE POLICY "Admins can update person profiles"
  ON public.person_profiles FOR UPDATE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner', 'admin']))
  WITH CHECK (public.has_org_role(organization_id, ARRAY['owner', 'admin']));

CREATE POLICY "Linked users can update own basic person profile"
  ON public.person_profiles FOR UPDATE TO authenticated
  USING (
    user_id = (select auth.uid())
    AND public.is_org_member(organization_id)
  )
  WITH CHECK (
    user_id = (select auth.uid())
    AND public.is_org_member(organization_id)
  );

CREATE POLICY "Admins can delete person profiles"
  ON public.person_profiles FOR DELETE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner', 'admin']));

-- ============================================================
-- Grants
-- ============================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.person_profiles TO authenticated;
