-- Staff planned work windows are operational planning context.
-- They are not schedule blocks, assignments, punches, payroll, or legal time records.

CREATE TABLE public.staff_work_windows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  person_profile_id uuid NOT NULL,
  center_id uuid,
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  start_time time NOT NULL,
  end_time time NOT NULL,
  valid_from date NOT NULL,
  valid_until date,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive')),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 240),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id),
  FOREIGN KEY (person_profile_id, organization_id)
    REFERENCES public.person_profiles(id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (center_id, organization_id)
    REFERENCES public.centers(id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT staff_work_windows_time_range
    CHECK (start_time < end_time),
  CONSTRAINT staff_work_windows_validity_range
    CHECK (valid_until IS NULL OR valid_from <= valid_until)
);

CREATE INDEX staff_work_windows_org_window_idx
  ON public.staff_work_windows (
    organization_id,
    status,
    day_of_week,
    valid_from,
    valid_until
  );

CREATE INDEX staff_work_windows_person_idx
  ON public.staff_work_windows (organization_id, person_profile_id, status);

CREATE INDEX staff_work_windows_center_idx
  ON public.staff_work_windows (organization_id, center_id, status)
  WHERE center_id IS NOT NULL;

CREATE TRIGGER staff_work_windows_set_updated_at
  BEFORE UPDATE ON public.staff_work_windows
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.staff_work_windows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Operators can view staff work windows"
  ON public.staff_work_windows FOR SELECT TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner', 'admin', 'manager']));

CREATE POLICY "Coaches can view own staff work windows"
  ON public.staff_work_windows FOR SELECT TO authenticated
  USING (
    public.has_org_role(organization_id, ARRAY['coach'])
    AND EXISTS (
      SELECT 1
      FROM public.person_profiles person_profile
      WHERE person_profile.id = staff_work_windows.person_profile_id
        AND person_profile.organization_id = staff_work_windows.organization_id
        AND person_profile.user_id = (select auth.uid())
        AND person_profile.status = 'active'
        AND person_profile.visibility_status = 'visible'
    )
  );

CREATE POLICY "Operators can create staff work windows"
  ON public.staff_work_windows FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(organization_id, ARRAY['owner', 'admin', 'manager']));

CREATE POLICY "Operators can update staff work windows"
  ON public.staff_work_windows FOR UPDATE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner', 'admin', 'manager']))
  WITH CHECK (public.has_org_role(organization_id, ARRAY['owner', 'admin', 'manager']));

REVOKE ALL ON public.staff_work_windows FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.staff_work_windows TO authenticated;

ALTER TABLE public.operational_audit_events
  DROP CONSTRAINT IF EXISTS operational_audit_events_entity_type_check;

ALTER TABLE public.operational_audit_events
  ADD CONSTRAINT operational_audit_events_entity_type_check
  CHECK (entity_type IN (
    'team_invitations',
    'organization_memberships',
    'person_profiles',
    'coach_profiles',
    'schedule_blocks',
    'schedule_block_assignments',
    'schedule_templates',
    'schedule_template_blocks',
    'staff_work_windows'
  ));

CREATE OR REPLACE FUNCTION public.operational_audit_entity_action_is_allowed(
  target_entity_type text,
  target_action text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE lower(btrim(COALESCE(target_entity_type, '')))
    WHEN 'team_invitations' THEN
      lower(btrim(COALESCE(target_action, ''))) IN ('created', 'resent', 'cancelled', 'accepted')
    WHEN 'organization_memberships' THEN
      lower(btrim(COALESCE(target_action, ''))) IN ('created', 'updated')
    WHEN 'person_profiles' THEN
      lower(btrim(COALESCE(target_action, ''))) IN ('created', 'updated', 'linked_account')
    WHEN 'coach_profiles' THEN
      lower(btrim(COALESCE(target_action, ''))) IN ('created', 'updated', 'linked_account')
    WHEN 'schedule_blocks' THEN
      lower(btrim(COALESCE(target_action, ''))) IN ('created', 'updated', 'cancelled')
    WHEN 'schedule_block_assignments' THEN
      lower(btrim(COALESCE(target_action, ''))) IN ('assigned', 'removed', 'updated')
    WHEN 'schedule_templates' THEN
      lower(btrim(COALESCE(target_action, ''))) IN ('created', 'updated', 'archived', 'restored', 'applied_to_week')
    WHEN 'schedule_template_blocks' THEN
      lower(btrim(COALESCE(target_action, ''))) IN ('created', 'updated', 'removed')
    WHEN 'staff_work_windows' THEN
      lower(btrim(COALESCE(target_action, ''))) IN ('created', 'updated', 'deactivated')
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.operational_audit_retention_days(
  target_entity_type text
)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE lower(btrim(COALESCE(target_entity_type, '')))
    WHEN 'team_invitations' THEN 30
    WHEN 'organization_memberships' THEN 30
    WHEN 'person_profiles' THEN 30
    WHEN 'coach_profiles' THEN 30
    ELSE 15
  END;
$$;

CREATE OR REPLACE FUNCTION public.operational_audit_entity_exists(
  target_organization_id uuid,
  target_entity_type text,
  target_entity_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  CASE lower(btrim(COALESCE(target_entity_type, '')))
    WHEN 'team_invitations' THEN
      RETURN EXISTS (
        SELECT 1
        FROM public.team_invitations entity
        WHERE entity.id = target_entity_id
          AND entity.organization_id = target_organization_id
      );
    WHEN 'organization_memberships' THEN
      RETURN EXISTS (
        SELECT 1
        FROM public.organization_memberships entity
        WHERE entity.id = target_entity_id
          AND entity.organization_id = target_organization_id
      );
    WHEN 'person_profiles' THEN
      RETURN EXISTS (
        SELECT 1
        FROM public.person_profiles entity
        WHERE entity.id = target_entity_id
          AND entity.organization_id = target_organization_id
      );
    WHEN 'coach_profiles' THEN
      RETURN EXISTS (
        SELECT 1
        FROM public.coach_profiles entity
        WHERE entity.id = target_entity_id
          AND entity.organization_id = target_organization_id
      );
    WHEN 'schedule_blocks' THEN
      RETURN EXISTS (
        SELECT 1
        FROM public.schedule_blocks entity
        WHERE entity.id = target_entity_id
          AND entity.organization_id = target_organization_id
      );
    WHEN 'schedule_block_assignments' THEN
      RETURN EXISTS (
        SELECT 1
        FROM public.schedule_block_assignments entity
        WHERE entity.id = target_entity_id
          AND entity.organization_id = target_organization_id
      );
    WHEN 'schedule_templates' THEN
      RETURN EXISTS (
        SELECT 1
        FROM public.schedule_templates entity
        WHERE entity.id = target_entity_id
          AND entity.organization_id = target_organization_id
      );
    WHEN 'schedule_template_blocks' THEN
      RETURN EXISTS (
        SELECT 1
        FROM public.schedule_template_blocks entity
        WHERE entity.id = target_entity_id
          AND entity.organization_id = target_organization_id
      );
    WHEN 'staff_work_windows' THEN
      RETURN EXISTS (
        SELECT 1
        FROM public.staff_work_windows entity
        WHERE entity.id = target_entity_id
          AND entity.organization_id = target_organization_id
      );
    ELSE
      RETURN false;
  END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_operational_audit_events(
  target_organization_id uuid,
  target_entity_type text DEFAULT NULL,
  target_limit integer DEFAULT 100
)
RETURNS SETOF public.operational_audit_events
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized_entity_type text := NULLIF(lower(btrim(COALESCE(target_entity_type, ''))), '');
  bounded_limit integer := LEAST(GREATEST(COALESCE(target_limit, 100), 1), 500);
BEGIN
  IF NOT public.can_read_operational_audit_events(target_organization_id) THEN
    RAISE EXCEPTION 'operational audit read permission required';
  END IF;

  IF normalized_entity_type IS NOT NULL
    AND normalized_entity_type NOT IN (
      'team_invitations',
      'organization_memberships',
      'person_profiles',
      'coach_profiles',
      'schedule_blocks',
      'schedule_block_assignments',
      'schedule_templates',
      'schedule_template_blocks',
      'staff_work_windows'
    ) THEN
    RAISE EXCEPTION 'operational audit entity type is not allowed';
  END IF;

  RETURN QUERY
  SELECT event_record.*
  FROM public.operational_audit_events event_record
  WHERE event_record.organization_id = target_organization_id
    AND event_record.retain_until > now()
    AND (
      normalized_entity_type IS NULL
      OR event_record.entity_type = normalized_entity_type
    )
  ORDER BY event_record.created_at DESC, event_record.id DESC
  LIMIT bounded_limit;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.operational_audit_entity_action_is_allowed(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.operational_audit_retention_days(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.operational_audit_entity_exists(uuid, text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.list_operational_audit_events(uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_operational_audit_events(uuid, text, integer) TO authenticated;
