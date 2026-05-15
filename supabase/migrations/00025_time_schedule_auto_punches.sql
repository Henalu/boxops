-- BoxOps - Fase F.11 schedule-based automatic web time punches
--
-- Generates clock-in/out punches from assigned schedule blocks only.
-- This does not use geolocation, maps, IP/Wi-Fi/Bluetooth, geofencing,
-- payroll, automatic overtime or real-presence proof.

ALTER TABLE public.organizations
  ALTER COLUMN time_tracking_config SET DEFAULT
    '{"version":1,"correctionApprovalRequired":false,"scheduleAutoPunchesEnabled":false}'::jsonb;

CREATE OR REPLACE FUNCTION public.time_tracking_config_boolean(
  target_config jsonb,
  target_key text,
  default_value boolean DEFAULT false
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    CASE
      WHEN target_config IS NOT NULL
        AND jsonb_typeof(target_config) = 'object'
        AND jsonb_typeof(target_config -> target_key) = 'boolean'
        THEN (target_config ->> target_key)::boolean
      ELSE default_value
    END,
    default_value
  );
$$;

CREATE OR REPLACE FUNCTION public.time_schedule_auto_is_enabled(
  target_organization_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    public.time_tracking_config_boolean(
      organization.time_tracking_config,
      'scheduleAutoPunchesEnabled',
      false
    ),
    false
  )
  FROM public.organizations organization
  WHERE organization.id = target_organization_id;
$$;

CREATE OR REPLACE FUNCTION public.validate_organization_time_tracking_config_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := (select auth.uid());
BEGIN
  IF jsonb_typeof(NEW.time_tracking_config) <> 'object' THEN
    RAISE EXCEPTION 'time tracking config must be a JSON object';
  END IF;

  IF NEW.time_tracking_config ? 'correctionApprovalRequired'
    AND jsonb_typeof(NEW.time_tracking_config -> 'correctionApprovalRequired') <> 'boolean' THEN
    RAISE EXCEPTION 'time tracking correction approval flag must be boolean';
  END IF;

  IF NEW.time_tracking_config ? 'scheduleAutoPunchesEnabled'
    AND jsonb_typeof(NEW.time_tracking_config -> 'scheduleAutoPunchesEnabled') <> 'boolean' THEN
    RAISE EXCEPTION 'time tracking schedule auto flag must be boolean';
  END IF;

  IF NEW.time_tracking_config IS DISTINCT FROM OLD.time_tracking_config
    AND current_user_id IS NOT NULL
    AND NOT public.can_manage_time_tracking(NEW.id) THEN
    RAISE EXCEPTION 'time tracking manager role is required to update time tracking config';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_organization_time_tracking_config_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_membership_id uuid;
  actor_person_profile_id uuid;
  current_user_id uuid := (select auth.uid());
  previous_correction_approval_required boolean;
  next_correction_approval_required boolean;
  previous_schedule_auto_enabled boolean;
  next_schedule_auto_enabled boolean;
BEGIN
  actor_membership_id := public.get_active_membership_id(NEW.id);
  actor_person_profile_id := public.get_own_person_profile_id(NEW.id);
  previous_correction_approval_required :=
    public.time_tracking_config_boolean(OLD.time_tracking_config, 'correctionApprovalRequired', false);
  next_correction_approval_required :=
    public.time_tracking_config_boolean(NEW.time_tracking_config, 'correctionApprovalRequired', false);
  previous_schedule_auto_enabled :=
    public.time_tracking_config_boolean(OLD.time_tracking_config, 'scheduleAutoPunchesEnabled', false);
  next_schedule_auto_enabled :=
    public.time_tracking_config_boolean(NEW.time_tracking_config, 'scheduleAutoPunchesEnabled', false);

  INSERT INTO public.time_audit_events (
    organization_id,
    event_type,
    result,
    actor_user_id,
    actor_membership_id,
    actor_person_profile_id,
    metadata
  )
  VALUES (
    NEW.id,
    'time_settings_updated',
    'allowed',
    current_user_id,
    actor_membership_id,
    actor_person_profile_id,
    jsonb_build_object(
      'schemaVersion',
      1,
      'setting',
      'timeTrackingConfig',
      'previousCorrectionApprovalRequired',
      previous_correction_approval_required,
      'nextCorrectionApprovalRequired',
      next_correction_approval_required,
      'previousScheduleAutoPunchesEnabled',
      previous_schedule_auto_enabled,
      'nextScheduleAutoPunchesEnabled',
      next_schedule_auto_enabled
    )
  );

  RETURN NEW;
END;
$$;

ALTER TABLE public.time_punches
  DROP CONSTRAINT IF EXISTS time_punches_source_check;

ALTER TABLE public.time_punches
  ADD CONSTRAINT time_punches_source_check
  CHECK (source IN ('manual', 'correction', 'schedule_auto'));

CREATE UNIQUE INDEX IF NOT EXISTS time_punches_schedule_auto_assignment_type_unique
  ON public.time_punches (
    organization_id,
    schedule_block_assignment_id,
    punch_type
  )
  WHERE source = 'schedule_auto'
    AND schedule_block_assignment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS time_punches_schedule_auto_assignment_idx
  ON public.time_punches (
    organization_id,
    schedule_block_assignment_id,
    occurred_at
  )
  WHERE source = 'schedule_auto';

CREATE OR REPLACE FUNCTION public.is_schedule_auto_generation_context()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT current_setting('boxops.schedule_auto_generation', true) = 'on';
$$;

CREATE OR REPLACE FUNCTION public.validate_time_punch_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := (select auth.uid());
  current_membership_id uuid;
  current_person_profile_id uuid;
  target_record public.time_records;
  application_context boolean := public.is_time_correction_application_context();
  direct_application_context boolean := public.is_time_correction_direct_application_context();
  schedule_auto_context boolean := public.is_schedule_auto_generation_context();
BEGIN
  IF current_user_id IS NOT NULL THEN
    current_membership_id := public.get_active_membership_id(NEW.organization_id);
    current_person_profile_id := public.get_own_person_profile_id(NEW.organization_id);

    IF current_membership_id IS NULL THEN
      RAISE EXCEPTION 'active membership is required for time punches';
    END IF;

    IF application_context AND NOT public.can_manage_time_tracking(NEW.organization_id) THEN
      IF NOT (
        direct_application_context
        AND current_person_profile_id IS NOT NULL
        AND NEW.person_profile_id = current_person_profile_id
        AND NOT public.time_correction_approval_is_required(NEW.organization_id)
      ) THEN
        RAISE EXCEPTION 'time correction application permission required';
      END IF;
    END IF;

    IF schedule_auto_context AND NOT public.can_manage_time_tracking(NEW.organization_id) THEN
      RAISE EXCEPTION 'time schedule auto generation permission required';
    END IF;

    IF TG_OP = 'INSERT' THEN
      NEW.created_by_user_id := COALESCE(NEW.created_by_user_id, current_user_id);
      NEW.created_by_membership_id := COALESCE(NEW.created_by_membership_id, current_membership_id);

      IF NEW.created_by_user_id <> current_user_id THEN
        RAISE EXCEPTION 'time punch creator must be the authenticated user';
      END IF;

      IF application_context THEN
        IF NEW.source <> 'correction' OR NEW.status <> 'active' THEN
          RAISE EXCEPTION 'correction time punches must be active and correction-sourced';
        END IF;
      ELSIF schedule_auto_context THEN
        IF NEW.source <> 'schedule_auto' OR NEW.status <> 'active' THEN
          RAISE EXCEPTION 'schedule auto time punches must be active and schedule-sourced';
        END IF;

        IF NEW.schedule_block_id IS NULL OR NEW.schedule_block_assignment_id IS NULL THEN
          RAISE EXCEPTION 'schedule auto time punches require schedule context';
        END IF;

        IF COALESCE(NEW.metadata ->> 'presenceVerified', 'true') <> 'false' THEN
          RAISE EXCEPTION 'schedule auto time punches must declare no real presence verification';
        END IF;
      ELSIF NEW.source <> 'manual' OR NEW.status <> 'active' THEN
        RAISE EXCEPTION 'manual time punches must be active and manual';
      END IF;
    END IF;
  END IF;

  SELECT time_record.*
  INTO target_record
  FROM public.time_records time_record
  WHERE time_record.id = NEW.time_record_id
    AND time_record.organization_id = NEW.organization_id;

  IF target_record.id IS NULL THEN
    RAISE EXCEPTION 'time punch record was not found';
  END IF;

  IF target_record.person_profile_id <> NEW.person_profile_id THEN
    RAISE EXCEPTION 'time punch person must match its record';
  END IF;

  IF target_record.status NOT IN ('open', 'reopened') AND NOT application_context THEN
    RAISE EXCEPTION 'time punch record is not open for manual or schedule auto punches';
  END IF;

  IF NOT schedule_auto_context
    AND NEW.source <> 'schedule_auto'
    AND target_record.center_id IS NOT NULL
    AND NEW.center_id IS NOT NULL
    AND target_record.center_id <> NEW.center_id THEN
    RAISE EXCEPTION 'time punch center must match its record when both are set';
  END IF;

  IF NOT schedule_auto_context
    AND NEW.source <> 'schedule_auto'
    AND target_record.schedule_block_id IS NOT NULL
    AND NEW.schedule_block_id IS NOT NULL
    AND target_record.schedule_block_id <> NEW.schedule_block_id THEN
    RAISE EXCEPTION 'time punch schedule block must match its record when both are set';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.id <> OLD.id
      OR NEW.organization_id <> OLD.organization_id
      OR NEW.time_record_id <> OLD.time_record_id
      OR NEW.person_profile_id <> OLD.person_profile_id
      OR NEW.punch_type <> OLD.punch_type
      OR NEW.occurred_at <> OLD.occurred_at
      OR NEW.timezone <> OLD.timezone
      OR NEW.center_id IS DISTINCT FROM OLD.center_id
      OR NEW.schedule_block_id IS DISTINCT FROM OLD.schedule_block_id
      OR NEW.schedule_block_assignment_id IS DISTINCT FROM OLD.schedule_block_assignment_id
      OR NEW.source <> OLD.source
      OR NEW.created_by_user_id <> OLD.created_by_user_id
      OR NEW.created_by_membership_id IS DISTINCT FROM OLD.created_by_membership_id
      OR NEW.created_at <> OLD.created_at THEN
      RAISE EXCEPTION 'time punch immutable fields cannot be changed';
    END IF;

    IF application_context
      AND (OLD.status <> 'active' OR NEW.status NOT IN ('superseded', 'voided')) THEN
      RAISE EXCEPTION 'correction application can only retire active punches';
    END IF;
  END IF;

  IF NOT public.time_schedule_context_is_valid(
    NEW.organization_id,
    NEW.person_profile_id,
    NEW.center_id,
    NEW.schedule_block_id,
    NEW.schedule_block_assignment_id
  ) THEN
    RAISE EXCEPTION 'time punch schedule context is not valid for this tenant/person';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_schedule_auto_time_punches(
  target_organization_id uuid,
  target_date_from date,
  target_date_to date,
  target_person_profile_id uuid DEFAULT NULL
)
RETURNS TABLE (
  schedule_block_assignment_id uuid,
  time_record_id uuid,
  clock_in_punch_id uuid,
  clock_out_punch_id uuid,
  inserted_clock_in boolean,
  inserted_clock_out boolean,
  skipped_reason text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := (select auth.uid());
  current_membership_id uuid;
  candidate record;
  existing_record public.time_records;
  effective_timezone text;
  planned_start_at timestamptz;
  planned_end_at timestamptz;
  punch_snapshot jsonb;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication is required for schedule auto time punches';
  END IF;

  current_membership_id := public.get_active_membership_id(target_organization_id);

  IF current_membership_id IS NULL THEN
    RAISE EXCEPTION 'active membership is required for schedule auto time punches';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.organizations organization
    WHERE organization.id = target_organization_id
      AND organization.status IN ('trialing', 'active')
  ) THEN
    RAISE EXCEPTION 'organization is not available for schedule auto time punches';
  END IF;

  IF NOT public.can_manage_time_tracking(target_organization_id) THEN
    RAISE EXCEPTION 'time tracking manager role is required for schedule auto time punches';
  END IF;

  IF NOT public.time_schedule_auto_is_enabled(target_organization_id) THEN
    RAISE EXCEPTION 'schedule auto time punches are not enabled for this organization';
  END IF;

  IF target_date_from IS NULL OR target_date_to IS NULL THEN
    RAISE EXCEPTION 'date range is required for schedule auto time punches';
  END IF;

  IF target_date_to < target_date_from THEN
    RAISE EXCEPTION 'date range is invalid for schedule auto time punches';
  END IF;

  IF target_date_to - target_date_from > 31 THEN
    RAISE EXCEPTION 'date range is too large for schedule auto time punches';
  END IF;

  IF target_person_profile_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.person_profiles person_profile
    WHERE person_profile.id = target_person_profile_id
      AND person_profile.organization_id = target_organization_id
      AND person_profile.status = 'active'
  ) THEN
    RAISE EXCEPTION 'target person profile is not valid for this organization';
  END IF;

  PERFORM set_config('boxops.schedule_auto_generation', 'on', true);

  FOR candidate IN
    SELECT
      assignment.id AS assignment_id,
      assignment.assignment_status,
      assignment.coach_profile_id,
      schedule_block.id AS block_id,
      schedule_block.center_id,
      schedule_block.class_type_id,
      schedule_block.service_date,
      schedule_block.start_time,
      schedule_block.end_time,
      schedule_block.status AS block_status,
      center_record.timezone AS center_timezone,
      organization.timezone AS organization_timezone,
      person_profile.id AS person_profile_id
    FROM public.schedule_block_assignments assignment
    INNER JOIN public.schedule_blocks schedule_block
      ON schedule_block.id = assignment.schedule_block_id
      AND schedule_block.organization_id = assignment.organization_id
    INNER JOIN public.coach_profiles coach_profile
      ON coach_profile.id = assignment.coach_profile_id
      AND coach_profile.organization_id = assignment.organization_id
    INNER JOIN public.centers center_record
      ON center_record.id = schedule_block.center_id
      AND center_record.organization_id = schedule_block.organization_id
    INNER JOIN public.organizations organization
      ON organization.id = assignment.organization_id
    INNER JOIN LATERAL (
      SELECT linked_person_profile.id
      FROM public.person_profiles linked_person_profile
      WHERE linked_person_profile.organization_id = assignment.organization_id
        AND linked_person_profile.status = 'active'
        AND linked_person_profile.visibility_status = 'visible'
        AND (
          (
            coach_profile.person_profile_id IS NOT NULL
            AND linked_person_profile.id = coach_profile.person_profile_id
          )
          OR (
            coach_profile.person_profile_id IS NULL
            AND coach_profile.user_id IS NOT NULL
            AND linked_person_profile.user_id = coach_profile.user_id
          )
        )
      ORDER BY
        CASE
          WHEN linked_person_profile.id = coach_profile.person_profile_id THEN 0
          ELSE 1
        END
      LIMIT 1
    ) person_profile ON true
    WHERE assignment.organization_id = target_organization_id
      AND assignment.assignment_status = 'assigned'
      AND coach_profile.status = 'active'
      AND schedule_block.status <> 'cancelled'
      AND schedule_block.service_date >= target_date_from
      AND schedule_block.service_date <= target_date_to
      AND (
        target_person_profile_id IS NULL
        OR person_profile.id = target_person_profile_id
      )
    ORDER BY schedule_block.service_date, schedule_block.start_time, assignment.id
  LOOP
    effective_timezone := COALESCE(
      NULLIF(candidate.center_timezone, ''),
      NULLIF(candidate.organization_timezone, ''),
      'Europe/Madrid'
    );
    planned_start_at :=
      (candidate.service_date + candidate.start_time) AT TIME ZONE effective_timezone;
    planned_end_at :=
      (candidate.service_date + candidate.end_time) AT TIME ZONE effective_timezone;
    schedule_block_assignment_id := candidate.assignment_id;
    time_record_id := NULL;
    clock_in_punch_id := NULL;
    clock_out_punch_id := NULL;
    inserted_clock_in := false;
    inserted_clock_out := false;
    skipped_reason := NULL;

    SELECT time_record.*
    INTO existing_record
    FROM public.time_records time_record
    WHERE time_record.organization_id = target_organization_id
      AND time_record.person_profile_id = candidate.person_profile_id
      AND time_record.local_work_date = candidate.service_date
    FOR UPDATE;

    IF existing_record.id IS NOT NULL
      AND existing_record.status NOT IN ('open', 'reopened') THEN
      time_record_id := existing_record.id;
      skipped_reason := 'time_record_not_open';
      RETURN NEXT;
      CONTINUE;
    END IF;

    IF existing_record.id IS NULL THEN
      INSERT INTO public.time_records (
        organization_id,
        person_profile_id,
        local_work_date,
        timezone,
        status,
        created_by_user_id,
        created_by_membership_id,
        metadata
      )
      VALUES (
        target_organization_id,
        candidate.person_profile_id,
        candidate.service_date,
        effective_timezone,
        'open',
        current_user_id,
        current_membership_id,
        jsonb_build_object(
          'schemaVersion',
          1,
          'source',
          'schedule_auto',
          'presenceVerified',
          false
        )
      )
      RETURNING * INTO existing_record;
    END IF;

    time_record_id := existing_record.id;
    punch_snapshot := jsonb_build_object(
      'schemaVersion',
      1,
      'source',
      'schedule_auto',
      'scheduleAutoVersion',
      'boxops.schedule-auto.v1',
      'presenceVerified',
      false,
      'generatedFrom',
      'schedule_block_assignment',
      'scheduleBlockId',
      candidate.block_id,
      'scheduleBlockAssignmentId',
      candidate.assignment_id,
      'coachProfileId',
      candidate.coach_profile_id,
      'centerId',
      candidate.center_id,
      'classTypeId',
      candidate.class_type_id,
      'serviceDate',
      candidate.service_date::text,
      'plannedStartTime',
      candidate.start_time::text,
      'plannedEndTime',
      candidate.end_time::text,
      'plannedStartAt',
      planned_start_at,
      'plannedEndAt',
      planned_end_at,
      'timezone',
      effective_timezone,
      'blockStatus',
      candidate.block_status,
      'assignmentStatus',
      candidate.assignment_status
    );

    BEGIN
      INSERT INTO public.time_punches (
        organization_id,
        time_record_id,
        person_profile_id,
        punch_type,
        occurred_at,
        timezone,
        center_id,
        schedule_block_id,
        schedule_block_assignment_id,
        source,
        status,
        created_by_user_id,
        created_by_membership_id,
        notes,
        metadata
      )
      VALUES (
        target_organization_id,
        existing_record.id,
        candidate.person_profile_id,
        'clock_in',
        planned_start_at,
        effective_timezone,
        candidate.center_id,
        candidate.block_id,
        candidate.assignment_id,
        'schedule_auto',
        'active',
        current_user_id,
        current_membership_id,
        'Generated from assigned schedule; does not verify real presence.',
        punch_snapshot || jsonb_build_object('plannedPunchType', 'clock_in')
      )
      RETURNING id INTO clock_in_punch_id;
    EXCEPTION WHEN unique_violation THEN
      clock_in_punch_id := NULL;
    END;

    inserted_clock_in := clock_in_punch_id IS NOT NULL;

    IF clock_in_punch_id IS NULL THEN
      SELECT time_punch.id
      INTO clock_in_punch_id
      FROM public.time_punches time_punch
      WHERE time_punch.organization_id = target_organization_id
        AND time_punch.schedule_block_assignment_id = candidate.assignment_id
        AND time_punch.punch_type = 'clock_in'
        AND time_punch.source = 'schedule_auto'
      LIMIT 1;
    END IF;

    BEGIN
      INSERT INTO public.time_punches (
        organization_id,
        time_record_id,
        person_profile_id,
        punch_type,
        occurred_at,
        timezone,
        center_id,
        schedule_block_id,
        schedule_block_assignment_id,
        source,
        status,
        created_by_user_id,
        created_by_membership_id,
        notes,
        metadata
      )
      VALUES (
        target_organization_id,
        existing_record.id,
        candidate.person_profile_id,
        'clock_out',
        planned_end_at,
        effective_timezone,
        candidate.center_id,
        candidate.block_id,
        candidate.assignment_id,
        'schedule_auto',
        'active',
        current_user_id,
        current_membership_id,
        'Generated from assigned schedule; does not verify real presence.',
        punch_snapshot || jsonb_build_object('plannedPunchType', 'clock_out')
      )
      RETURNING id INTO clock_out_punch_id;
    EXCEPTION WHEN unique_violation THEN
      clock_out_punch_id := NULL;
    END;

    inserted_clock_out := clock_out_punch_id IS NOT NULL;

    IF clock_out_punch_id IS NULL THEN
      SELECT time_punch.id
      INTO clock_out_punch_id
      FROM public.time_punches time_punch
      WHERE time_punch.organization_id = target_organization_id
        AND time_punch.schedule_block_assignment_id = candidate.assignment_id
        AND time_punch.punch_type = 'clock_out'
        AND time_punch.source = 'schedule_auto'
      LIMIT 1;
    END IF;

    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.time_tracking_config_boolean(jsonb, text, boolean)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.time_schedule_auto_is_enabled(uuid)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_schedule_auto_generation_context()
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.generate_schedule_auto_time_punches(uuid, date, date, uuid)
  FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.time_tracking_config_boolean(jsonb, text, boolean)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.time_schedule_auto_is_enabled(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_schedule_auto_generation_context()
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_schedule_auto_time_punches(uuid, date, date, uuid)
  TO authenticated;
