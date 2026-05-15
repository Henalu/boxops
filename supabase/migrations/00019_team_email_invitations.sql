-- BoxOps - Team email invitations
-- Adds tenant-scoped invitations that link Auth accounts to operational people.

CREATE TABLE public.team_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  email_normalized text NOT NULL,
  token_hash text NOT NULL,
  person_profile_id uuid NOT NULL,
  coach_profile_id uuid,
  role text NOT NULL DEFAULT 'coach'
    CHECK (role IN ('owner', 'admin', 'manager', 'coach')),
  initial_access_status text NOT NULL DEFAULT 'active'
    CHECK (initial_access_status IN ('active', 'inactive', 'suspended')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'accepted', 'cancelled', 'expired', 'failed')),
  invited_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_by_membership_id uuid,
  accepted_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sent_at timestamptz,
  last_sent_at timestamptz,
  accepted_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  send_count integer NOT NULL DEFAULT 0 CHECK (send_count >= 0),
  provider_message_id text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id),
  FOREIGN KEY (person_profile_id, organization_id)
    REFERENCES public.person_profiles(id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (coach_profile_id, organization_id)
    REFERENCES public.coach_profiles(id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (invited_by_membership_id, organization_id)
    REFERENCES public.organization_memberships(id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT team_invitations_email_not_blank
    CHECK (length(btrim(email)) > 0),
  CONSTRAINT team_invitations_email_normalized_format
    CHECK (email_normalized ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  CONSTRAINT team_invitations_email_matches_normalized
    CHECK (email_normalized = lower(btrim(email))),
  CONSTRAINT team_invitations_token_hash_sha256_hex
    CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT team_invitations_provider_message_not_blank
    CHECK (provider_message_id IS NULL OR length(btrim(provider_message_id)) > 0),
  CONSTRAINT team_invitations_last_error_not_blank
    CHECK (last_error IS NULL OR length(btrim(last_error)) > 0)
);

CREATE UNIQUE INDEX team_invitations_active_email_unique
  ON public.team_invitations (organization_id, email_normalized)
  WHERE status IN ('pending', 'sent');

CREATE UNIQUE INDEX team_invitations_active_person_unique
  ON public.team_invitations (organization_id, person_profile_id)
  WHERE status IN ('pending', 'sent');

CREATE UNIQUE INDEX team_invitations_token_hash_unique
  ON public.team_invitations (token_hash);

CREATE INDEX team_invitations_organization_status_idx
  ON public.team_invitations (organization_id, status, created_at DESC);

CREATE INDEX team_invitations_expires_idx
  ON public.team_invitations (expires_at)
  WHERE status IN ('pending', 'sent');

CREATE TRIGGER team_invitations_set_updated_at
  BEFORE UPDATE ON public.team_invitations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Accepting an invitation is a controlled system transition: a user with a
-- matching email can attach themselves to the prepared person/coach rows.
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

  IF current_setting('boxops.accepting_team_invitation', true) = 'on' THEN
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

CREATE OR REPLACE FUNCTION public.get_team_invitation_public(
  target_invitation_id uuid,
  raw_invitation_token text
)
RETURNS TABLE (
  id uuid,
  organization_id uuid,
  organization_name text,
  email text,
  display_name text,
  status text,
  expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  expected_hash text;
BEGIN
  IF raw_invitation_token IS NULL OR length(raw_invitation_token) < 32 THEN
    RETURN;
  END IF;

  expected_hash := encode(digest(raw_invitation_token, 'sha256'), 'hex');

  RETURN QUERY
  SELECT
    invitation.id,
    invitation.organization_id,
    organization.name,
    invitation.email_normalized,
    person_profile.display_name,
    CASE
      WHEN invitation.status IN ('pending', 'sent') AND invitation.expires_at < now()
        THEN 'expired'
      ELSE invitation.status
    END,
    invitation.expires_at
  FROM public.team_invitations invitation
  INNER JOIN public.organizations organization
    ON organization.id = invitation.organization_id
  INNER JOIN public.person_profiles person_profile
    ON person_profile.id = invitation.person_profile_id
    AND person_profile.organization_id = invitation.organization_id
  WHERE invitation.id = target_invitation_id
    AND invitation.token_hash = expected_hash
  LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_team_invitation(
  target_invitation_id uuid,
  raw_invitation_token text
)
RETURNS TABLE (organization_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := (select auth.uid());
  current_email text;
  expected_hash text;
  target_invitation public.team_invitations;
  existing_membership public.organization_memberships;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT lower(btrim(auth_user.email))
  INTO current_email
  FROM auth.users auth_user
  WHERE auth_user.id = current_user_id;

  IF current_email IS NULL THEN
    RAISE EXCEPTION 'authenticated user email is required';
  END IF;

  IF raw_invitation_token IS NULL OR length(raw_invitation_token) < 32 THEN
    RAISE EXCEPTION 'invalid invitation token';
  END IF;

  expected_hash := encode(digest(raw_invitation_token, 'sha256'), 'hex');

  SELECT *
  INTO target_invitation
  FROM public.team_invitations invitation
  WHERE invitation.id = target_invitation_id
    AND invitation.token_hash = expected_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invitation not found';
  END IF;

  IF target_invitation.status NOT IN ('pending', 'sent') THEN
    RAISE EXCEPTION 'invitation is not pending';
  END IF;

  IF target_invitation.expires_at < now() THEN
    UPDATE public.team_invitations
    SET status = 'expired'
    WHERE id = target_invitation.id;

    RAISE EXCEPTION 'invitation has expired';
  END IF;

  IF target_invitation.email_normalized <> current_email THEN
    RAISE EXCEPTION 'invitation email does not match authenticated user';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.person_profiles person_profile
    WHERE person_profile.organization_id = target_invitation.organization_id
      AND person_profile.user_id = current_user_id
      AND person_profile.id <> target_invitation.person_profile_id
  ) THEN
    RAISE EXCEPTION 'account already linked to another person in this organization';
  END IF;

  IF target_invitation.coach_profile_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.coach_profiles coach_profile
    WHERE coach_profile.organization_id = target_invitation.organization_id
      AND coach_profile.user_id = current_user_id
      AND coach_profile.id <> target_invitation.coach_profile_id
  ) THEN
    RAISE EXCEPTION 'account already linked to another coach in this organization';
  END IF;

  SELECT *
  INTO existing_membership
  FROM public.organization_memberships membership
  WHERE membership.organization_id = target_invitation.organization_id
    AND membership.user_id = current_user_id
  FOR UPDATE;

  IF FOUND THEN
    UPDATE public.organization_memberships
    SET
      role = target_invitation.role,
      status = target_invitation.initial_access_status,
      invited_at = COALESCE(existing_membership.invited_at, target_invitation.sent_at, target_invitation.created_at),
      joined_at = CASE
        WHEN target_invitation.initial_access_status = 'active'
          THEN COALESCE(existing_membership.joined_at, now())
        ELSE existing_membership.joined_at
      END
    WHERE id = existing_membership.id
      AND organization_id = target_invitation.organization_id;
  ELSE
    INSERT INTO public.organization_memberships (
      organization_id,
      user_id,
      role,
      status,
      invited_at,
      joined_at
    )
    VALUES (
      target_invitation.organization_id,
      current_user_id,
      target_invitation.role,
      target_invitation.initial_access_status,
      COALESCE(target_invitation.sent_at, target_invitation.created_at),
      CASE
        WHEN target_invitation.initial_access_status = 'active' THEN now()
        ELSE NULL
      END
    );
  END IF;

  PERFORM set_config('boxops.accepting_team_invitation', 'on', true);

  UPDATE public.person_profiles
  SET user_id = current_user_id
  WHERE id = target_invitation.person_profile_id
    AND organization_id = target_invitation.organization_id
    AND (user_id IS NULL OR user_id = current_user_id);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'person profile could not be linked';
  END IF;

  IF target_invitation.coach_profile_id IS NOT NULL THEN
    UPDATE public.coach_profiles
    SET user_id = current_user_id
    WHERE id = target_invitation.coach_profile_id
      AND organization_id = target_invitation.organization_id
      AND (user_id IS NULL OR user_id = current_user_id);

    IF NOT FOUND THEN
      RAISE EXCEPTION 'coach profile could not be linked';
    END IF;
  END IF;

  UPDATE public.team_invitations
  SET
    status = 'accepted',
    accepted_by_user_id = current_user_id,
    accepted_at = now()
  WHERE id = target_invitation.id;

  RETURN QUERY SELECT target_invitation.organization_id;
END;
$$;

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE public.team_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team access managers can view team invitations"
  ON public.team_invitations FOR SELECT TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner', 'admin']));

CREATE POLICY "Team access managers can create team invitations"
  ON public.team_invitations FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(organization_id, ARRAY['owner', 'admin']));

CREATE POLICY "Team access managers can update team invitations"
  ON public.team_invitations FOR UPDATE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner', 'admin']))
  WITH CHECK (public.has_org_role(organization_id, ARRAY['owner', 'admin']));

-- ============================================================
-- Grants
-- ============================================================

GRANT SELECT, INSERT, UPDATE ON public.team_invitations TO authenticated;

REVOKE ALL ON FUNCTION public.get_team_invitation_public(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_team_invitation_public(uuid, text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.accept_team_invitation(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_team_invitation(uuid, text) TO authenticated;
