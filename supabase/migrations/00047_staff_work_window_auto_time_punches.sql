-- BoxOps - Staff work window automatic time punches
--
-- Staff work windows can now feed schedule_auto punches when the tenant enables
-- scheduleAutoPunchesEnabled. They still do not verify real presence, payroll,
-- overtime approval, legal compliance, or geolocation.

CREATE UNIQUE INDEX IF NOT EXISTS time_punches_staff_work_window_auto_type_unique
  ON public.time_punches (
    organization_id,
    person_profile_id,
    ((metadata ->> 'staffWorkWindowId')),
    ((metadata ->> 'serviceDate')),
    punch_type
  )
  WHERE source = 'schedule_auto'
    AND status = 'active'
    AND metadata ->> 'generatedFrom' = 'staff_work_window';

CREATE INDEX IF NOT EXISTS time_punches_staff_work_window_auto_idx
  ON public.time_punches (
    organization_id,
    person_profile_id,
    occurred_at
  )
  WHERE source = 'schedule_auto'
    AND metadata ->> 'generatedFrom' = 'staff_work_window';

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
  schedule_auto_generated_from text :=
    COALESCE(NULLIF(NEW.metadata ->> 'generatedFrom', ''), 'schedule_block_assignment');
  staff_work_window_id uuid;
  staff_work_window_record public.staff_work_windows;
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
      ELSIF NEW.source <> 'manual' OR NEW.status <> 'active' THEN
        RAISE EXCEPTION 'manual time punches must be active and manual';
      END IF;
    END IF;
  END IF;

  IF NEW.source = 'schedule_auto' THEN
    IF COALESCE(NEW.metadata ->> 'presenceVerified', 'true') <> 'false' THEN
      RAISE EXCEPTION 'schedule auto time punches must declare no real presence verification';
    END IF;

    IF schedule_auto_generated_from = 'staff_work_window' THEN
      IF NEW.schedule_block_id IS NOT NULL OR NEW.schedule_block_assignment_id IS NOT NULL THEN
        RAISE EXCEPTION 'staff work window auto punches must not use schedule block context';
      END IF;

      IF COALESCE(NEW.metadata ->> 'staffWorkWindowId', '') !~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        RAISE EXCEPTION 'staff work window auto punches require staff work window context';
      END IF;

      IF COALESCE(NEW.metadata ->> 'serviceDate', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
        RAISE EXCEPTION 'staff work window auto punches require service date context';
      END IF;

      IF COALESCE(NEW.metadata ->> 'plannedPunchType', '') <> NEW.punch_type THEN
        RAISE EXCEPTION 'staff work window auto punch type metadata must match the punch';
      END IF;

      staff_work_window_id := (NEW.metadata ->> 'staffWorkWindowId')::uuid;

      SELECT work_window.*
      INTO staff_work_window_record
      FROM public.staff_work_windows work_window
      WHERE work_window.id = staff_work_window_id
        AND work_window.organization_id = NEW.organization_id;

      IF staff_work_window_record.id IS NULL THEN
        RAISE EXCEPTION 'staff work window auto punch context was not found';
      END IF;

      IF staff_work_window_record.person_profile_id <> NEW.person_profile_id THEN
        RAISE EXCEPTION 'staff work window auto punch person must match its window';
      END IF;

      IF staff_work_window_record.center_id IS NOT NULL
        AND NEW.center_id IS DISTINCT FROM staff_work_window_record.center_id THEN
        RAISE EXCEPTION 'staff work window auto punch center must match its window';
      END IF;
    ELSE
      IF NEW.schedule_block_id IS NULL OR NEW.schedule_block_assignment_id IS NULL THEN
        RAISE EXCEPTION 'schedule auto time punches require schedule context';
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

  IF NOT public.is_time_weekly_approval_management_context()
    AND public.time_week_is_approved(
      NEW.organization_id,
      NEW.person_profile_id,
      target_record.local_work_date
    ) THEN
    RAISE EXCEPTION 'approved time weeks cannot be changed without reopening';
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

CREATE OR REPLACE FUNCTION public.generate_staff_work_window_auto_time_punches(
  target_organization_id uuid,
  target_date_from date,
  target_date_to date,
  target_person_profile_id uuid DEFAULT NULL,
  target_due_at timestamptz DEFAULT NULL,
  target_invocation_source text DEFAULT 'manual'
)
RETURNS TABLE (
  staff_work_window_id uuid,
  local_work_date date,
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
  actor_record record;
  candidate record;
  existing_record public.time_records;
  effective_timezone text;
  planned_start_at timestamptz;
  planned_end_at timestamptz;
  punch_snapshot jsonb;
  clock_in_due boolean;
  clock_out_due boolean;
  normalized_invocation_source text :=
    COALESCE(NULLIF(target_invocation_source, ''), 'manual');
BEGIN
  IF normalized_invocation_source NOT IN ('manual', 'scheduler', 'system') THEN
    RAISE EXCEPTION 'staff work window auto invocation source is not allowed';
  END IF;

  IF current_user_id IS NULL AND normalized_invocation_source = 'manual' THEN
    RAISE EXCEPTION 'authentication is required for staff work window auto time punches';
  END IF;

  IF target_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization is required for staff work window auto time punches';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.organizations organization
    WHERE organization.id = target_organization_id
      AND organization.status IN ('trialing', 'active')
  ) THEN
    RAISE EXCEPTION 'organization is not available for staff work window auto time punches';
  END IF;

  IF current_user_id IS NOT NULL THEN
    current_membership_id := public.get_active_membership_id(target_organization_id);

    IF current_membership_id IS NULL THEN
      RAISE EXCEPTION 'active membership is required for staff work window auto time punches';
    END IF;

    IF NOT public.can_manage_time_tracking(target_organization_id) THEN
      RAISE EXCEPTION 'time tracking manager role is required for staff work window auto time punches';
    END IF;
  ELSE
    SELECT
      membership.id,
      membership.user_id
    INTO actor_record
    FROM public.organization_memberships membership
    WHERE membership.organization_id = target_organization_id
      AND membership.status = 'active'
      AND membership.role IN ('owner', 'admin', 'manager')
    ORDER BY
      CASE membership.role
        WHEN 'owner' THEN 0
        WHEN 'admin' THEN 1
        ELSE 2
      END,
      membership.joined_at,
      membership.id
    LIMIT 1;

    IF actor_record.id IS NULL THEN
      RAISE EXCEPTION 'staff work window auto time punches require an active manager membership actor';
    END IF;

    current_user_id := actor_record.user_id;
    current_membership_id := actor_record.id;
  END IF;

  IF NOT public.time_schedule_auto_is_enabled(target_organization_id) THEN
    RAISE EXCEPTION 'schedule auto time punches are not enabled for this organization';
  END IF;

  IF target_date_from IS NULL OR target_date_to IS NULL THEN
    RAISE EXCEPTION 'date range is required for staff work window auto time punches';
  END IF;

  IF target_date_to < target_date_from THEN
    RAISE EXCEPTION 'date range is invalid for staff work window auto time punches';
  END IF;

  IF target_date_to - target_date_from > 31 THEN
    RAISE EXCEPTION 'date range is too large for staff work window auto time punches';
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
      work_window.id AS work_window_id,
      work_window.person_profile_id,
      work_window.center_id,
      work_window.day_of_week,
      work_window.start_time,
      work_window.end_time,
      work_window.valid_from,
      work_window.valid_until,
      work_window.status AS work_window_status,
      service_day.service_date,
      center_record.timezone AS center_timezone,
      organization.timezone AS organization_timezone
    FROM public.staff_work_windows work_window
    INNER JOIN public.organizations organization
      ON organization.id = work_window.organization_id
    INNER JOIN public.person_profiles person_profile
      ON person_profile.id = work_window.person_profile_id
      AND person_profile.organization_id = work_window.organization_id
    LEFT JOIN public.centers center_record
      ON center_record.id = work_window.center_id
      AND center_record.organization_id = work_window.organization_id
    CROSS JOIN LATERAL (
      SELECT generated_date::date AS service_date
      FROM generate_series(
        target_date_from::timestamp,
        target_date_to::timestamp,
        interval '1 day'
      ) AS generated_date
    ) service_day
    WHERE work_window.organization_id = target_organization_id
      AND work_window.status = 'active'
      AND person_profile.status = 'active'
      AND person_profile.visibility_status = 'visible'
      AND work_window.valid_from <= service_day.service_date
      AND (
        work_window.valid_until IS NULL
        OR work_window.valid_until >= service_day.service_date
      )
      AND work_window.day_of_week = extract(isodow from service_day.service_date)::smallint
      AND (
        target_person_profile_id IS NULL
        OR work_window.person_profile_id = target_person_profile_id
      )
    ORDER BY service_day.service_date, work_window.start_time, work_window.id
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
    clock_in_due := target_due_at IS NULL OR target_due_at >= planned_start_at;
    clock_out_due := target_due_at IS NULL OR target_due_at >= planned_end_at;

    IF NOT clock_in_due AND NOT clock_out_due THEN
      CONTINUE;
    END IF;

    staff_work_window_id := candidate.work_window_id;
    local_work_date := candidate.service_date;
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
        center_id,
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
        candidate.center_id,
        'open',
        current_user_id,
        current_membership_id,
        jsonb_build_object(
          'schemaVersion',
          1,
          'source',
          'schedule_auto',
          'generatedFrom',
          'staff_work_window',
          'presenceVerified',
          false,
          'staffWorkWindowAutoVersion',
          'boxops.staff-work-window-auto.v1'
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
      'boxops.staff-work-window-auto.v1',
      'presenceVerified',
      false,
      'generatedFrom',
      'staff_work_window',
      'staffWorkWindowId',
      candidate.work_window_id,
      'centerId',
      candidate.center_id,
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
      'invocationSource',
      normalized_invocation_source
    );

    IF clock_in_due THEN
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
          NULL,
          NULL,
          'schedule_auto',
          'active',
          current_user_id,
          current_membership_id,
          'Generated from planned staff work window; does not verify real presence.',
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
          AND time_punch.person_profile_id = candidate.person_profile_id
          AND time_punch.punch_type = 'clock_in'
          AND time_punch.source = 'schedule_auto'
          AND time_punch.status = 'active'
          AND time_punch.metadata ->> 'generatedFrom' = 'staff_work_window'
          AND time_punch.metadata ->> 'staffWorkWindowId' = candidate.work_window_id::text
          AND time_punch.metadata ->> 'serviceDate' = candidate.service_date::text
        LIMIT 1;
      END IF;
    END IF;

    IF clock_out_due THEN
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
          NULL,
          NULL,
          'schedule_auto',
          'active',
          current_user_id,
          current_membership_id,
          'Generated from planned staff work window; does not verify real presence.',
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
          AND time_punch.person_profile_id = candidate.person_profile_id
          AND time_punch.punch_type = 'clock_out'
          AND time_punch.source = 'schedule_auto'
          AND time_punch.status = 'active'
          AND time_punch.metadata ->> 'generatedFrom' = 'staff_work_window'
          AND time_punch.metadata ->> 'staffWorkWindowId' = candidate.work_window_id::text
          AND time_punch.metadata ->> 'serviceDate' = candidate.service_date::text
        LIMIT 1;
      END IF;
    END IF;

    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_due_staff_work_window_auto_time_punches(
  target_now timestamptz DEFAULT now(),
  target_organization_id uuid DEFAULT NULL
)
RETURNS TABLE (
  organization_id uuid,
  staff_work_window_id uuid,
  local_work_date date,
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
  organization_record record;
  local_today date;
  generation_row record;
BEGIN
  IF target_now IS NULL THEN
    RAISE EXCEPTION 'target timestamp is required for staff work window auto scheduler';
  END IF;

  FOR organization_record IN
    SELECT organization.id, organization.timezone
    FROM public.organizations organization
    WHERE organization.status IN ('trialing', 'active')
      AND (target_organization_id IS NULL OR organization.id = target_organization_id)
      AND public.time_schedule_auto_is_enabled(organization.id)
    ORDER BY organization.id
  LOOP
    local_today :=
      (target_now AT TIME ZONE COALESCE(NULLIF(organization_record.timezone, ''), 'Europe/Madrid'))::date;

    BEGIN
      FOR generation_row IN
        SELECT *
        FROM public.generate_staff_work_window_auto_time_punches(
          organization_record.id,
          local_today - 1,
          local_today + 1,
          NULL,
          target_now,
          'scheduler'
        )
      LOOP
        organization_id := organization_record.id;
        staff_work_window_id := generation_row.staff_work_window_id;
        local_work_date := generation_row.local_work_date;
        time_record_id := generation_row.time_record_id;
        clock_in_punch_id := generation_row.clock_in_punch_id;
        clock_out_punch_id := generation_row.clock_out_punch_id;
        inserted_clock_in := generation_row.inserted_clock_in;
        inserted_clock_out := generation_row.inserted_clock_out;
        skipped_reason := generation_row.skipped_reason;
        RETURN NEXT;
      END LOOP;
    EXCEPTION WHEN others THEN
      organization_id := organization_record.id;
      staff_work_window_id := NULL;
      local_work_date := local_today;
      time_record_id := NULL;
      clock_in_punch_id := NULL;
      clock_out_punch_id := NULL;
      inserted_clock_in := false;
      inserted_clock_out := false;
      skipped_reason := SQLERRM;
      RETURN NEXT;
    END;
  END LOOP;

  RETURN;
END;
$$;

COMMENT ON FUNCTION public.generate_staff_work_window_auto_time_punches(uuid, date, date, uuid, timestamptz, text)
  IS 'Generates idempotent schedule_auto punches from active staff_work_windows. presenceVerified is always false; intended for controlled manager catch-up or scheduler internals.';

COMMENT ON FUNCTION public.generate_due_staff_work_window_auto_time_punches(timestamptz, uuid)
  IS 'DB-scheduler primitive for staff work window automatic punches. Intended for a database job that runs every minute and only inserts punches whose planned time is due. Not granted to normal app roles.';

REVOKE ALL ON FUNCTION public.generate_staff_work_window_auto_time_punches(uuid, date, date, uuid, timestamptz, text)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.generate_due_staff_work_window_auto_time_punches(timestamptz, uuid)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.generate_due_staff_work_window_auto_time_punches(timestamptz, uuid)
  FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION public.generate_staff_work_window_auto_time_punches(uuid, date, date, uuid, timestamptz, text)
  TO authenticated;

-- Intentionally not granted to authenticated/anon:
-- public.generate_due_staff_work_window_auto_time_punches(timestamptz, uuid)
