-- Certifications are tenant-scoped requirements that can be attached to
-- activity types and assigned to coach profiles.

CREATE TABLE public.certifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id),
  CONSTRAINT certifications_title_length
    CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
  CONSTRAINT certifications_description_length
    CHECK (description IS NULL OR char_length(description) <= 1000)
);

CREATE UNIQUE INDEX certifications_org_title_unique_idx
  ON public.certifications (organization_id, lower(btrim(title)));

CREATE INDEX certifications_org_status_idx
  ON public.certifications (organization_id, status, title);

CREATE TABLE public.coach_certifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  coach_profile_id uuid NOT NULL,
  certification_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id),
  UNIQUE (organization_id, coach_profile_id, certification_id),
  FOREIGN KEY (coach_profile_id, organization_id)
    REFERENCES public.coach_profiles(id, organization_id)
    ON DELETE CASCADE,
  FOREIGN KEY (certification_id, organization_id)
    REFERENCES public.certifications(id, organization_id)
    ON DELETE CASCADE
);

CREATE INDEX coach_certifications_certification_idx
  ON public.coach_certifications (organization_id, certification_id, status);

CREATE INDEX coach_certifications_active_lookup_idx
  ON public.coach_certifications (organization_id, coach_profile_id, certification_id)
  WHERE status = 'active';

ALTER TABLE public.class_types
  ADD COLUMN certification_id uuid;

INSERT INTO public.certifications (
  organization_id,
  title,
  description,
  status,
  metadata
)
SELECT DISTINCT
  class_type.organization_id,
  'Certificación requerida',
  'Migrada desde el requisito genérico anterior.',
  'active',
  jsonb_build_object('source', 'requires_certification_migration')
FROM public.class_types class_type
WHERE class_type.requires_certification = true
ON CONFLICT DO NOTHING;

UPDATE public.class_types class_type
SET certification_id = certification.id
FROM public.certifications certification
WHERE class_type.requires_certification = true
  AND class_type.certification_id IS NULL
  AND certification.organization_id = class_type.organization_id
  AND certification.title = 'Certificación requerida';

ALTER TABLE public.class_types
  ADD CONSTRAINT class_types_certification_fk
    FOREIGN KEY (certification_id, organization_id)
    REFERENCES public.certifications(id, organization_id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT class_types_certification_sync
    CHECK (requires_certification = (certification_id IS NOT NULL));

CREATE INDEX class_types_certification_idx
  ON public.class_types (organization_id, certification_id);

CREATE TRIGGER certifications_set_updated_at
  BEFORE UPDATE ON public.certifications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER coach_certifications_set_updated_at
  BEFORE UPDATE ON public.coach_certifications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.certifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_certifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view certifications"
  ON public.certifications FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

CREATE POLICY "Owners and admins can create certifications"
  ON public.certifications FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(organization_id, ARRAY['owner', 'admin']));

CREATE POLICY "Owners and admins can update certifications"
  ON public.certifications FOR UPDATE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner', 'admin']))
  WITH CHECK (public.has_org_role(organization_id, ARRAY['owner', 'admin']));

CREATE POLICY "Owners and admins can delete certifications"
  ON public.certifications FOR DELETE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner', 'admin']));

CREATE POLICY "Members can view coach certifications"
  ON public.coach_certifications FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

CREATE POLICY "Owners and admins can create coach certifications"
  ON public.coach_certifications FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(organization_id, ARRAY['owner', 'admin']));

CREATE POLICY "Owners and admins can update coach certifications"
  ON public.coach_certifications FOR UPDATE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner', 'admin']))
  WITH CHECK (public.has_org_role(organization_id, ARRAY['owner', 'admin']));

CREATE POLICY "Owners and admins can delete coach certifications"
  ON public.coach_certifications FOR DELETE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner', 'admin']));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.certifications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coach_certifications TO authenticated;

CREATE OR REPLACE FUNCTION public.has_active_coach_certification(
  target_organization_id uuid,
  target_coach_profile_id uuid,
  target_certification_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT target_certification_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.coach_certifications coach_certification
      WHERE coach_certification.organization_id = target_organization_id
        AND coach_certification.coach_profile_id = target_coach_profile_id
        AND coach_certification.certification_id = target_certification_id
        AND coach_certification.status = 'active'
    );
$$;

CREATE OR REPLACE FUNCTION public.enforce_template_block_default_coach_certification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  required_certification_id uuid;
BEGIN
  IF NEW.default_coach_profile_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT class_type.certification_id
  INTO required_certification_id
  FROM public.class_types class_type
  WHERE class_type.organization_id = NEW.organization_id
    AND class_type.id = NEW.class_type_id;

  IF required_certification_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT public.has_active_coach_certification(
    NEW.organization_id,
    NEW.default_coach_profile_id,
    required_certification_id
  ) THEN
    RAISE EXCEPTION 'coach-missing-certification'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER schedule_template_blocks_certification_check
  BEFORE INSERT OR UPDATE OF class_type_id, default_coach_profile_id
  ON public.schedule_template_blocks
  FOR EACH ROW EXECUTE FUNCTION public.enforce_template_block_default_coach_certification();

CREATE OR REPLACE FUNCTION public.enforce_schedule_assignment_certification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  required_certification_id uuid;
BEGIN
  IF NEW.assignment_status NOT IN ('assigned', 'pending') THEN
    RETURN NEW;
  END IF;

  SELECT class_type.certification_id
  INTO required_certification_id
  FROM public.schedule_blocks schedule_block
  JOIN public.class_types class_type
    ON class_type.organization_id = schedule_block.organization_id
   AND class_type.id = schedule_block.class_type_id
  WHERE schedule_block.organization_id = NEW.organization_id
    AND schedule_block.id = NEW.schedule_block_id;

  IF required_certification_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT public.has_active_coach_certification(
    NEW.organization_id,
    NEW.coach_profile_id,
    required_certification_id
  ) THEN
    RAISE EXCEPTION 'coach-missing-certification'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER schedule_block_assignments_certification_check
  BEFORE INSERT OR UPDATE OF schedule_block_id, coach_profile_id, assignment_status
  ON public.schedule_block_assignments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_schedule_assignment_certification();

DROP FUNCTION IF EXISTS public.update_class_type_and_sync_defaults(
  uuid,
  uuid,
  text,
  text,
  text,
  integer,
  boolean,
  text,
  text,
  text,
  date
);

CREATE OR REPLACE FUNCTION public.update_class_type_and_sync_defaults(
  target_organization_id uuid,
  target_class_type_id uuid,
  target_name text,
  target_slug text,
  target_category text,
  target_required_coaches integer,
  target_requires_certification boolean,
  target_color text,
  target_status text,
  target_certification_id uuid DEFAULT NULL,
  target_icon_key text DEFAULT 'activity',
  target_effective_from date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  previous_required_coaches integer;
  schedule_blocks_updated integer := 0;
  template_blocks_updated integer := 0;
  effective_from date := COALESCE(target_effective_from, CURRENT_DATE);
BEGIN
  IF NOT (
    public.has_org_role(target_organization_id, ARRAY['owner', 'admin', 'manager'])
    OR public.has_active_platform_support_session(target_organization_id)
  ) THEN
    RAISE EXCEPTION 'forbidden'
      USING ERRCODE = '42501';
  END IF;

  IF target_name IS NULL OR btrim(target_name) = '' THEN
    RAISE EXCEPTION 'invalid_name'
      USING ERRCODE = '22023';
  END IF;

  IF target_slug IS NULL OR target_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' THEN
    RAISE EXCEPTION 'invalid_slug'
      USING ERRCODE = '22023';
  END IF;

  IF target_category NOT IN ('class', 'staffing', 'event', 'competition', 'holiday', 'other') THEN
    RAISE EXCEPTION 'invalid_category'
      USING ERRCODE = '22023';
  END IF;

  IF target_required_coaches IS NULL OR target_required_coaches < 0 OR target_required_coaches > 20 THEN
    RAISE EXCEPTION 'invalid_required_coaches'
      USING ERRCODE = '22023';
  END IF;

  IF target_status NOT IN ('active', 'inactive') THEN
    RAISE EXCEPTION 'invalid_status'
      USING ERRCODE = '22023';
  END IF;

  IF target_color IS NOT NULL AND target_color !~ '^#[0-9a-fA-F]{6}$' THEN
    RAISE EXCEPTION 'invalid_color'
      USING ERRCODE = '22023';
  END IF;

  IF target_certification_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.certifications certification
      WHERE certification.id = target_certification_id
        AND certification.organization_id = target_organization_id
        AND certification.status = 'active'
    )
  THEN
    RAISE EXCEPTION 'invalid_certification'
      USING ERRCODE = '22023';
  END IF;

  IF target_icon_key NOT IN (
    'activity',
    'biceps-flexed',
    'bike',
    'calendar-days',
    'clipboard-check',
    'dumbbell',
    'flame',
    'footprints',
    'gauge',
    'heart-pulse',
    'medal',
    'moon',
    'party-popper',
    'shield-check',
    'stretch-horizontal',
    'sun',
    'target',
    'timer',
    'trophy',
    'users',
    'waves',
    'zap'
  ) THEN
    RAISE EXCEPTION 'invalid_icon'
      USING ERRCODE = '22023';
  END IF;

  SELECT class_type.required_coaches
  INTO previous_required_coaches
  FROM public.class_types class_type
  WHERE class_type.id = target_class_type_id
    AND class_type.organization_id = target_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'class_type_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.class_types
  SET
    name = btrim(target_name),
    slug = target_slug,
    category = target_category,
    required_coaches = target_required_coaches,
    certification_id = target_certification_id,
    requires_certification = target_certification_id IS NOT NULL,
    color = lower(target_color),
    icon_key = target_icon_key,
    status = target_status
  WHERE id = target_class_type_id
    AND organization_id = target_organization_id;

  UPDATE public.schedule_template_blocks template_block
  SET required_coaches = target_required_coaches
  WHERE template_block.organization_id = target_organization_id
    AND template_block.class_type_id = target_class_type_id
    AND template_block.required_coaches IS DISTINCT FROM target_required_coaches;

  GET DIAGNOSTICS template_blocks_updated = ROW_COUNT;

  UPDATE public.schedule_blocks schedule_block
  SET required_coaches = target_required_coaches
  WHERE schedule_block.organization_id = target_organization_id
    AND schedule_block.class_type_id = target_class_type_id
    AND schedule_block.service_date >= effective_from
    AND schedule_block.status NOT IN ('cancelled', 'completed')
    AND schedule_block.required_coaches IS DISTINCT FROM target_required_coaches;

  GET DIAGNOSTICS schedule_blocks_updated = ROW_COUNT;

  RETURN jsonb_build_object(
    'classTypeId', target_class_type_id,
    'effectiveFrom', effective_from,
    'previousRequiredCoaches', previous_required_coaches,
    'requiredCoaches', target_required_coaches,
    'certificationId', target_certification_id,
    'requiresCertification', target_certification_id IS NOT NULL,
    'scheduleBlocksUpdated', schedule_blocks_updated,
    'templateBlocksUpdated', template_blocks_updated
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_class_type_and_sync_defaults(
  uuid,
  uuid,
  text,
  text,
  text,
  integer,
  boolean,
  text,
  text,
  uuid,
  text,
  date
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.update_class_type_and_sync_defaults(
  uuid,
  uuid,
  text,
  text,
  text,
  integer,
  boolean,
  text,
  text,
  uuid,
  text,
  date
) TO authenticated;
