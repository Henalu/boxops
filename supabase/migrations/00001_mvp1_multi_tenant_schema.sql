-- BoxOps - MVP 1 multi-tenant schema
-- Scope: organizations, centers, memberships, coaches, class/activity types,
-- schedule templates, schedule blocks and coach assignments.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- Shared helpers
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ============================================================
-- Organizations and centers
-- ============================================================

CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('trialing', 'active', 'inactive', 'suspended')),
  timezone text NOT NULL DEFAULT 'Europe/Madrid',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organizations_slug_format
    CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

CREATE TABLE public.centers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  address text,
  timezone text NOT NULL DEFAULT 'Europe/Madrid',
  latitude numeric(9,6),
  longitude numeric(9,6),
  geofence_radius_meters integer NOT NULL DEFAULT 100
    CHECK (geofence_radius_meters > 0),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, slug),
  UNIQUE (id, organization_id),
  CONSTRAINT centers_slug_format
    CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  CONSTRAINT centers_latitude_range
    CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  CONSTRAINT centers_longitude_range
    CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180)
);

-- ============================================================
-- Memberships and coaches
-- ============================================================

CREATE TABLE public.organization_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'coach'
    CHECK (role IN (
      'owner',
      'admin',
      'manager',
      'center_manager',
      'document_admin',
      'payroll_manager',
      'coach',
      'staff'
    )),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('invited', 'active', 'inactive', 'suspended')),
  invited_at timestamptz,
  joined_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id),
  UNIQUE (id, organization_id)
);

CREATE OR REPLACE FUNCTION public.is_org_member(target_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_memberships membership
    WHERE membership.organization_id = target_organization_id
      AND membership.user_id = (select auth.uid())
      AND membership.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.has_org_role(
  target_organization_id uuid,
  allowed_roles text[]
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_memberships membership
    WHERE membership.organization_id = target_organization_id
      AND membership.user_id = (select auth.uid())
      AND membership.status = 'active'
      AND membership.role = ANY(allowed_roles)
  );
$$;

CREATE TABLE public.coach_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  primary_center_id uuid,
  weekly_contracted_hours numeric(5,2) NOT NULL DEFAULT 0
    CHECK (weekly_contracted_hours >= 0),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive')),
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id),
  UNIQUE (id, organization_id),
  FOREIGN KEY (organization_id, user_id)
    REFERENCES public.organization_memberships(organization_id, user_id)
    ON DELETE CASCADE,
  FOREIGN KEY (primary_center_id, organization_id)
    REFERENCES public.centers(id, organization_id)
    ON DELETE RESTRICT
);

CREATE TABLE public.coach_center_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  coach_profile_id uuid NOT NULL,
  center_id uuid NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (coach_profile_id, center_id),
  FOREIGN KEY (coach_profile_id, organization_id)
    REFERENCES public.coach_profiles(id, organization_id)
    ON DELETE CASCADE,
  FOREIGN KEY (center_id, organization_id)
    REFERENCES public.centers(id, organization_id)
    ON DELETE CASCADE
);

CREATE UNIQUE INDEX coach_center_assignments_one_primary
  ON public.coach_center_assignments (coach_profile_id)
  WHERE is_primary = true AND status = 'active';

-- ============================================================
-- Class/activity types
-- ============================================================

CREATE TABLE public.class_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  category text NOT NULL DEFAULT 'class'
    CHECK (category IN ('class', 'staffing', 'event', 'competition', 'holiday', 'other')),
  required_coaches integer NOT NULL DEFAULT 1
    CHECK (required_coaches >= 0),
  requires_certification boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive')),
  color text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, slug),
  UNIQUE (id, organization_id),
  CONSTRAINT class_types_slug_format
    CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

-- ============================================================
-- Schedule templates and blocks
-- ============================================================

CREATE TABLE public.schedule_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  center_id uuid,
  name text NOT NULL,
  template_type text NOT NULL DEFAULT 'weekly'
    CHECK (template_type IN ('weekly', 'monthly')),
  valid_from date,
  valid_until date,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'archived')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id),
  FOREIGN KEY (center_id, organization_id)
    REFERENCES public.centers(id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT schedule_templates_valid_range
    CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from)
);

CREATE TABLE public.schedule_template_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  template_id uuid NOT NULL,
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  start_time time NOT NULL,
  end_time time NOT NULL,
  center_id uuid NOT NULL,
  class_type_id uuid NOT NULL,
  required_coaches integer NOT NULL DEFAULT 1
    CHECK (required_coaches >= 0),
  default_coach_profile_id uuid,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id),
  FOREIGN KEY (template_id, organization_id)
    REFERENCES public.schedule_templates(id, organization_id)
    ON DELETE CASCADE,
  FOREIGN KEY (center_id, organization_id)
    REFERENCES public.centers(id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (class_type_id, organization_id)
    REFERENCES public.class_types(id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (default_coach_profile_id, organization_id)
    REFERENCES public.coach_profiles(id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT schedule_template_blocks_time_range
    CHECK (start_time < end_time)
);

CREATE TABLE public.schedule_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  center_id uuid NOT NULL,
  template_id uuid,
  template_block_id uuid,
  service_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  class_type_id uuid NOT NULL,
  required_coaches integer NOT NULL DEFAULT 1
    CHECK (required_coaches >= 0),
  status text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'uncovered', 'changed', 'cancelled', 'completed')),
  notes text,
  is_template_exception boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id),
  FOREIGN KEY (center_id, organization_id)
    REFERENCES public.centers(id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (template_id, organization_id)
    REFERENCES public.schedule_templates(id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (template_block_id, organization_id)
    REFERENCES public.schedule_template_blocks(id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (class_type_id, organization_id)
    REFERENCES public.class_types(id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT schedule_blocks_time_range
    CHECK (start_time < end_time)
);

CREATE TABLE public.schedule_block_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  schedule_block_id uuid NOT NULL,
  coach_profile_id uuid NOT NULL,
  assignment_status text NOT NULL DEFAULT 'assigned'
    CHECK (assignment_status IN ('assigned', 'pending', 'declined', 'removed')),
  source text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'template', 'change_request', 'import')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (schedule_block_id, coach_profile_id),
  FOREIGN KEY (schedule_block_id, organization_id)
    REFERENCES public.schedule_blocks(id, organization_id)
    ON DELETE CASCADE,
  FOREIGN KEY (coach_profile_id, organization_id)
    REFERENCES public.coach_profiles(id, organization_id)
    ON DELETE RESTRICT
);

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX organizations_status_idx
  ON public.organizations (status);

CREATE INDEX centers_organization_idx
  ON public.centers (organization_id);

CREATE INDEX organization_memberships_user_idx
  ON public.organization_memberships (user_id);

CREATE INDEX organization_memberships_org_role_idx
  ON public.organization_memberships (organization_id, role, status);

CREATE INDEX coach_profiles_org_user_idx
  ON public.coach_profiles (organization_id, user_id);

CREATE INDEX coach_profiles_primary_center_idx
  ON public.coach_profiles (primary_center_id);

CREATE INDEX coach_center_assignments_center_idx
  ON public.coach_center_assignments (center_id);

CREATE INDEX class_types_org_category_idx
  ON public.class_types (organization_id, category, status);

CREATE INDEX schedule_templates_org_status_idx
  ON public.schedule_templates (organization_id, status);

CREATE INDEX schedule_template_blocks_template_idx
  ON public.schedule_template_blocks (template_id, day_of_week, start_time);

CREATE INDEX schedule_blocks_org_date_idx
  ON public.schedule_blocks (organization_id, service_date);

CREATE INDEX schedule_blocks_center_date_idx
  ON public.schedule_blocks (center_id, service_date);

CREATE INDEX schedule_blocks_class_type_idx
  ON public.schedule_blocks (class_type_id);

CREATE INDEX schedule_block_assignments_block_idx
  ON public.schedule_block_assignments (schedule_block_id);

CREATE INDEX schedule_block_assignments_coach_idx
  ON public.schedule_block_assignments (coach_profile_id);

-- ============================================================
-- Updated_at triggers
-- ============================================================

CREATE TRIGGER organizations_set_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER centers_set_updated_at
  BEFORE UPDATE ON public.centers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER organization_memberships_set_updated_at
  BEFORE UPDATE ON public.organization_memberships
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER coach_profiles_set_updated_at
  BEFORE UPDATE ON public.coach_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER coach_center_assignments_set_updated_at
  BEFORE UPDATE ON public.coach_center_assignments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER class_types_set_updated_at
  BEFORE UPDATE ON public.class_types
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER schedule_templates_set_updated_at
  BEFORE UPDATE ON public.schedule_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER schedule_template_blocks_set_updated_at
  BEFORE UPDATE ON public.schedule_template_blocks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER schedule_blocks_set_updated_at
  BEFORE UPDATE ON public.schedule_blocks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER schedule_block_assignments_set_updated_at
  BEFORE UPDATE ON public.schedule_block_assignments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_center_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_template_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_block_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view organizations"
  ON public.organizations FOR SELECT TO authenticated
  USING (public.is_org_member(id));

CREATE POLICY "Owners and admins can update organizations"
  ON public.organizations FOR UPDATE TO authenticated
  USING (public.has_org_role(id, ARRAY['owner', 'admin']))
  WITH CHECK (public.has_org_role(id, ARRAY['owner', 'admin']));

CREATE POLICY "Members can view centers"
  ON public.centers FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

CREATE POLICY "Operators can manage centers"
  ON public.centers FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(organization_id, ARRAY['owner', 'admin', 'manager', 'center_manager']));

CREATE POLICY "Operators can update centers"
  ON public.centers FOR UPDATE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner', 'admin', 'manager', 'center_manager']))
  WITH CHECK (public.has_org_role(organization_id, ARRAY['owner', 'admin', 'manager', 'center_manager']));

CREATE POLICY "Operators can delete centers"
  ON public.centers FOR DELETE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner', 'admin', 'manager', 'center_manager']));

CREATE POLICY "Members can view relevant memberships"
  ON public.organization_memberships FOR SELECT TO authenticated
  USING (
    user_id = (select auth.uid())
    OR public.has_org_role(organization_id, ARRAY['owner', 'admin', 'manager', 'center_manager'])
  );

CREATE POLICY "Owners and admins can manage memberships"
  ON public.organization_memberships FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(organization_id, ARRAY['owner', 'admin']));

CREATE POLICY "Owners and admins can update memberships"
  ON public.organization_memberships FOR UPDATE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner', 'admin']))
  WITH CHECK (public.has_org_role(organization_id, ARRAY['owner', 'admin']));

CREATE POLICY "Owners and admins can delete memberships"
  ON public.organization_memberships FOR DELETE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner', 'admin']));

CREATE POLICY "Members can view coach profiles"
  ON public.coach_profiles FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

CREATE POLICY "Operators can manage coach profiles"
  ON public.coach_profiles FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(organization_id, ARRAY['owner', 'admin', 'manager', 'center_manager']));

CREATE POLICY "Operators can update coach profiles"
  ON public.coach_profiles FOR UPDATE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner', 'admin', 'manager', 'center_manager']))
  WITH CHECK (public.has_org_role(organization_id, ARRAY['owner', 'admin', 'manager', 'center_manager']));

CREATE POLICY "Operators can delete coach profiles"
  ON public.coach_profiles FOR DELETE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner', 'admin', 'manager', 'center_manager']));

CREATE POLICY "Members can view coach center assignments"
  ON public.coach_center_assignments FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

CREATE POLICY "Operators can manage coach center assignments"
  ON public.coach_center_assignments FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(organization_id, ARRAY['owner', 'admin', 'manager', 'center_manager']));

CREATE POLICY "Operators can update coach center assignments"
  ON public.coach_center_assignments FOR UPDATE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner', 'admin', 'manager', 'center_manager']))
  WITH CHECK (public.has_org_role(organization_id, ARRAY['owner', 'admin', 'manager', 'center_manager']));

CREATE POLICY "Operators can delete coach center assignments"
  ON public.coach_center_assignments FOR DELETE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner', 'admin', 'manager', 'center_manager']));

CREATE POLICY "Members can view class types"
  ON public.class_types FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

CREATE POLICY "Operators can manage class types"
  ON public.class_types FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(organization_id, ARRAY['owner', 'admin', 'manager', 'center_manager']));

CREATE POLICY "Operators can update class types"
  ON public.class_types FOR UPDATE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner', 'admin', 'manager', 'center_manager']))
  WITH CHECK (public.has_org_role(organization_id, ARRAY['owner', 'admin', 'manager', 'center_manager']));

CREATE POLICY "Operators can delete class types"
  ON public.class_types FOR DELETE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner', 'admin', 'manager', 'center_manager']));

CREATE POLICY "Members can view schedule templates"
  ON public.schedule_templates FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

CREATE POLICY "Operators can manage schedule templates"
  ON public.schedule_templates FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(organization_id, ARRAY['owner', 'admin', 'manager', 'center_manager']));

CREATE POLICY "Operators can update schedule templates"
  ON public.schedule_templates FOR UPDATE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner', 'admin', 'manager', 'center_manager']))
  WITH CHECK (public.has_org_role(organization_id, ARRAY['owner', 'admin', 'manager', 'center_manager']));

CREATE POLICY "Operators can delete schedule templates"
  ON public.schedule_templates FOR DELETE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner', 'admin', 'manager', 'center_manager']));

CREATE POLICY "Members can view schedule template blocks"
  ON public.schedule_template_blocks FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

CREATE POLICY "Operators can manage schedule template blocks"
  ON public.schedule_template_blocks FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(organization_id, ARRAY['owner', 'admin', 'manager', 'center_manager']));

CREATE POLICY "Operators can update schedule template blocks"
  ON public.schedule_template_blocks FOR UPDATE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner', 'admin', 'manager', 'center_manager']))
  WITH CHECK (public.has_org_role(organization_id, ARRAY['owner', 'admin', 'manager', 'center_manager']));

CREATE POLICY "Operators can delete schedule template blocks"
  ON public.schedule_template_blocks FOR DELETE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner', 'admin', 'manager', 'center_manager']));

CREATE POLICY "Members can view schedule blocks"
  ON public.schedule_blocks FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

CREATE POLICY "Operators can manage schedule blocks"
  ON public.schedule_blocks FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(organization_id, ARRAY['owner', 'admin', 'manager', 'center_manager']));

CREATE POLICY "Operators can update schedule blocks"
  ON public.schedule_blocks FOR UPDATE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner', 'admin', 'manager', 'center_manager']))
  WITH CHECK (public.has_org_role(organization_id, ARRAY['owner', 'admin', 'manager', 'center_manager']));

CREATE POLICY "Operators can delete schedule blocks"
  ON public.schedule_blocks FOR DELETE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner', 'admin', 'manager', 'center_manager']));

CREATE POLICY "Members can view schedule block assignments"
  ON public.schedule_block_assignments FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

CREATE POLICY "Operators can manage schedule block assignments"
  ON public.schedule_block_assignments FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(organization_id, ARRAY['owner', 'admin', 'manager', 'center_manager']));

CREATE POLICY "Operators can update schedule block assignments"
  ON public.schedule_block_assignments FOR UPDATE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner', 'admin', 'manager', 'center_manager']))
  WITH CHECK (public.has_org_role(organization_id, ARRAY['owner', 'admin', 'manager', 'center_manager']));

CREATE POLICY "Operators can delete schedule block assignments"
  ON public.schedule_block_assignments FOR DELETE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner', 'admin', 'manager', 'center_manager']));

-- ============================================================
-- Grants
-- ============================================================

GRANT USAGE ON SCHEMA public TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.centers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_memberships TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coach_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coach_center_assignments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_types TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_template_blocks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_blocks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_block_assignments TO authenticated;

GRANT EXECUTE ON FUNCTION public.is_org_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_org_role(uuid, text[]) TO authenticated;
