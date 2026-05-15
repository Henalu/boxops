-- Align correction-created punches with the time record for the punch local date.
-- A correction can move a punch to a different day. In that case the new punch
-- must not stay attached to the original day's time_record, otherwise daily
-- overview balances drift while weekly totals still look correct.

CREATE OR REPLACE FUNCTION public.resolve_time_record_for_correction_punch(
  target_organization_id uuid,
  target_person_profile_id uuid,
  target_local_work_date date,
  target_timezone text,
  target_center_id uuid,
  target_user_id uuid,
  target_membership_id uuid,
  target_correction_id uuid,
  target_source text
)
RETURNS public.time_records
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  resolved_record public.time_records;
BEGIN
  IF target_organization_id IS NULL
    OR target_person_profile_id IS NULL
    OR target_local_work_date IS NULL
    OR target_timezone IS NULL
    OR length(btrim(target_timezone)) = 0
    OR target_user_id IS NULL THEN
    RAISE EXCEPTION 'time correction punch record context is not valid';
  END IF;

  SELECT time_record.*
  INTO resolved_record
  FROM public.time_records time_record
  WHERE time_record.organization_id = target_organization_id
    AND time_record.person_profile_id = target_person_profile_id
    AND time_record.local_work_date = target_local_work_date
  FOR UPDATE;

  IF resolved_record.id IS NOT NULL THEN
    IF resolved_record.status NOT IN ('open', 'reopened') THEN
      RAISE EXCEPTION 'target time record is not open for correction punches';
    END IF;

    RETURN resolved_record;
  END IF;

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
    target_person_profile_id,
    target_local_work_date,
    target_timezone,
    target_center_id,
    'open',
    target_user_id,
    target_membership_id,
    jsonb_build_object(
      'createdByCorrectionId', target_correction_id,
      'source', COALESCE(target_source, 'time_correction_punch_alignment')
    )
  )
  RETURNING * INTO resolved_record;

  RETURN resolved_record;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_time_record_correction(
  target_organization_id uuid,
  target_correction_id uuid
)
RETURNS public.time_record_corrections
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := (select auth.uid());
  current_membership_id uuid;
  target_correction public.time_record_corrections;
  target_record public.time_records;
  target_punch public.time_punches;
  application_record public.time_records;
  applied_correction public.time_record_corrections;
  requested_local_value text;
  requested_timezone text;
  normalized_occurred_at timestamptz;
  normalized_work_date date;
  normalized_punch_type text;
  application_metadata jsonb;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication is required for time correction application';
  END IF;

  current_membership_id := public.get_active_membership_id(target_organization_id);

  IF current_membership_id IS NULL THEN
    RAISE EXCEPTION 'active membership is required for time correction application';
  END IF;

  IF NOT public.can_manage_time_tracking(target_organization_id) THEN
    RAISE EXCEPTION 'time correction application permission required';
  END IF;

  SELECT correction.*
  INTO target_correction
  FROM public.time_record_corrections correction
  WHERE correction.id = target_correction_id
    AND correction.organization_id = target_organization_id
  FOR UPDATE;

  IF target_correction.id IS NULL THEN
    RAISE EXCEPTION 'time correction was not found';
  END IF;

  IF target_correction.status <> 'approved' THEN
    RAISE EXCEPTION 'only approved time corrections can be applied';
  END IF;

  SELECT time_record.*
  INTO target_record
  FROM public.time_records time_record
  WHERE time_record.id = target_correction.time_record_id
    AND time_record.organization_id = target_organization_id
  FOR UPDATE;

  IF target_record.id IS NULL THEN
    RAISE EXCEPTION 'time correction record was not found';
  END IF;

  IF target_record.person_profile_id <> target_correction.person_profile_id THEN
    RAISE EXCEPTION 'time correction person must match its record';
  END IF;

  PERFORM set_config('boxops.time_correction_application', 'on', true);

  IF target_correction.correction_type = 'punch_add' THEN
    normalized_punch_type := target_correction.after_snapshot #>> '{punch,punchType}';
    requested_local_value := target_correction.after_snapshot #>> '{punch,occurredAtLocal}';
    requested_timezone := COALESCE(
      target_correction.after_snapshot #>> '{punch,timezone}',
      target_record.timezone
    );

    IF normalized_punch_type NOT IN ('clock_in', 'clock_out') THEN
      RAISE EXCEPTION 'time correction requested punch type is not valid';
    END IF;

    IF requested_local_value IS NULL
      OR requested_local_value !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$' THEN
      RAISE EXCEPTION 'time correction requested timestamp is not valid';
    END IF;

    IF requested_timezone IS DISTINCT FROM target_record.timezone THEN
      RAISE EXCEPTION 'time correction timezone does not match the record';
    END IF;

    normalized_occurred_at := requested_local_value::timestamp AT TIME ZONE requested_timezone;
    normalized_work_date := (normalized_occurred_at AT TIME ZONE requested_timezone)::date;
    application_record := target_record;

    IF normalized_work_date IS DISTINCT FROM target_record.local_work_date THEN
      application_record := public.resolve_time_record_for_correction_punch(
        target_organization_id,
        target_record.person_profile_id,
        normalized_work_date,
        target_record.timezone,
        target_record.center_id,
        current_user_id,
        current_membership_id,
        target_correction.id,
        'approved_time_correction'
      );
    END IF;

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
      application_record.id,
      application_record.person_profile_id,
      normalized_punch_type,
      normalized_occurred_at,
      application_record.timezone,
      application_record.center_id,
      application_record.schedule_block_id,
      application_record.schedule_block_assignment_id,
      'correction',
      'active',
      current_user_id,
      current_membership_id,
      target_correction.reason,
      jsonb_build_object(
        'applicationVersion', 'boxops.time-correction-application.v2',
        'correctionId', target_correction.id,
        'source', 'approved_time_correction',
        'timeRecordId', application_record.id
      )
    );
  ELSIF target_correction.correction_type IN ('punch_update', 'punch_void') THEN
    IF target_correction.time_punch_id IS NULL THEN
      RAISE EXCEPTION 'time correction requires a linked punch';
    END IF;

    SELECT time_punch.*
    INTO target_punch
    FROM public.time_punches time_punch
    WHERE time_punch.id = target_correction.time_punch_id
      AND time_punch.time_record_id = target_record.id
      AND time_punch.organization_id = target_organization_id
    FOR UPDATE;

    IF target_punch.id IS NULL THEN
      RAISE EXCEPTION 'time correction punch was not found';
    END IF;

    IF target_punch.person_profile_id <> target_record.person_profile_id THEN
      RAISE EXCEPTION 'time correction punch person must match its record';
    END IF;

    IF target_punch.status <> 'active' THEN
      RAISE EXCEPTION 'only active punches can be changed by a correction';
    END IF;

    IF target_correction.correction_type = 'punch_void' THEN
      UPDATE public.time_punches
      SET
        status = 'voided',
        metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
          'voidedByCorrectionId', target_correction.id,
          'voidedAt', now()
        )
      WHERE id = target_punch.id
        AND organization_id = target_organization_id;
    ELSE
      requested_local_value := COALESCE(
        target_correction.after_snapshot #>> '{punch,requestedOccurredAtLocal}',
        target_correction.after_snapshot #>> '{punch,occurredAtLocal}'
      );
      requested_timezone := COALESCE(
        target_correction.after_snapshot #>> '{punch,requestedTimezone}',
        target_correction.after_snapshot #>> '{punch,timezone}',
        target_punch.timezone
      );

      IF requested_local_value IS NULL
        OR requested_local_value !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$' THEN
        RAISE EXCEPTION 'time correction requested timestamp is not valid';
      END IF;

      IF requested_timezone IS DISTINCT FROM target_punch.timezone THEN
        RAISE EXCEPTION 'time correction timezone does not match the punch';
      END IF;

      normalized_occurred_at := requested_local_value::timestamp AT TIME ZONE requested_timezone;
      normalized_work_date := (normalized_occurred_at AT TIME ZONE requested_timezone)::date;
      application_record := target_record;

      IF normalized_work_date IS DISTINCT FROM target_record.local_work_date THEN
        application_record := public.resolve_time_record_for_correction_punch(
          target_organization_id,
          target_record.person_profile_id,
          normalized_work_date,
          target_punch.timezone,
          target_punch.center_id,
          current_user_id,
          current_membership_id,
          target_correction.id,
          'approved_time_correction'
        );
      END IF;

      UPDATE public.time_punches
      SET
        status = 'superseded',
        metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
          'supersededByCorrectionId', target_correction.id,
          'supersededAt', now()
        )
      WHERE id = target_punch.id
        AND organization_id = target_organization_id;

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
        application_record.id,
        application_record.person_profile_id,
        target_punch.punch_type,
        normalized_occurred_at,
        application_record.timezone,
        COALESCE(target_punch.center_id, application_record.center_id),
        application_record.schedule_block_id,
        application_record.schedule_block_assignment_id,
        'correction',
        'active',
        current_user_id,
        current_membership_id,
        target_correction.reason,
        jsonb_build_object(
          'applicationVersion', 'boxops.time-correction-application.v2',
          'correctionId', target_correction.id,
          'replacesPunchId', target_punch.id,
          'source', 'approved_time_correction',
          'timeRecordId', application_record.id
        )
      );
    END IF;
  ELSIF target_correction.correction_type = 'record_update' THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'time correction type is not supported';
  END IF;

  application_metadata := COALESCE(target_correction.metadata, '{}'::jsonb)
    || jsonb_build_object(
      'appliedByMembershipId', current_membership_id,
      'applicationVersion', 'boxops.time-correction-application.v2',
      'applicationResult',
      CASE
        WHEN target_correction.correction_type = 'record_update'
          THEN 'marked_applied_without_record_mutation'
        ELSE 'punch_history_updated'
      END
    );

  UPDATE public.time_record_corrections
  SET
    applied_at = now(),
    metadata = application_metadata,
    status = 'applied'
  WHERE id = target_correction.id
    AND organization_id = target_organization_id
  RETURNING * INTO applied_correction;

  RETURN applied_correction;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_and_apply_own_time_record_correction(
  target_organization_id uuid,
  target_time_record_id uuid,
  target_time_punch_id uuid,
  target_correction_type text,
  target_reason text,
  target_before_snapshot jsonb,
  target_after_snapshot jsonb,
  target_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS public.time_record_corrections
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := (select auth.uid());
  current_membership_id uuid;
  own_person_profile_id uuid;
  target_record public.time_records;
  target_punch public.time_punches;
  application_record public.time_records;
  created_correction public.time_record_corrections;
  applied_correction public.time_record_corrections;
  normalized_metadata jsonb := COALESCE(target_metadata, '{}'::jsonb);
  requested_local_value text;
  requested_timezone text;
  normalized_occurred_at timestamptz;
  normalized_work_date date;
  normalized_punch_type text;
  application_metadata jsonb;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication is required for direct time corrections';
  END IF;

  current_membership_id := public.get_active_membership_id(target_organization_id);
  own_person_profile_id := public.get_own_person_profile_id(target_organization_id);

  IF current_membership_id IS NULL THEN
    RAISE EXCEPTION 'active membership is required for direct time corrections';
  END IF;

  IF own_person_profile_id IS NULL THEN
    RAISE EXCEPTION 'active person profile is required for direct time corrections';
  END IF;

  IF public.time_correction_approval_is_required(target_organization_id) THEN
    RAISE EXCEPTION 'time correction approval is required';
  END IF;

  IF target_correction_type NOT IN (
    'record_update',
    'punch_add',
    'punch_update',
    'punch_void'
  ) THEN
    RAISE EXCEPTION 'time correction type is not supported';
  END IF;

  IF target_reason IS NULL
    OR length(btrim(target_reason)) = 0
    OR length(target_reason) > 2000 THEN
    RAISE EXCEPTION 'time correction reason is required';
  END IF;

  IF target_before_snapshot IS NULL
    OR target_after_snapshot IS NULL
    OR jsonb_typeof(target_before_snapshot) <> 'object'
    OR jsonb_typeof(target_after_snapshot) <> 'object'
    OR length(target_before_snapshot::text) > 4000
    OR length(target_after_snapshot::text) > 4000 THEN
    RAISE EXCEPTION 'time correction snapshots are not valid';
  END IF;

  IF jsonb_typeof(normalized_metadata) <> 'object'
    OR length(normalized_metadata::text) > 2000 THEN
    RAISE EXCEPTION 'time correction metadata is not valid';
  END IF;

  SELECT time_record.*
  INTO target_record
  FROM public.time_records time_record
  WHERE time_record.id = target_time_record_id
    AND time_record.organization_id = target_organization_id
    AND time_record.person_profile_id = own_person_profile_id
  FOR UPDATE;

  IF target_record.id IS NULL THEN
    RAISE EXCEPTION 'time correction record was not found';
  END IF;

  IF target_correction_type IN ('punch_update', 'punch_void') THEN
    IF target_time_punch_id IS NULL THEN
      RAISE EXCEPTION 'time correction requires a linked punch';
    END IF;

    SELECT time_punch.*
    INTO target_punch
    FROM public.time_punches time_punch
    WHERE time_punch.id = target_time_punch_id
      AND time_punch.time_record_id = target_record.id
      AND time_punch.organization_id = target_organization_id
      AND time_punch.person_profile_id = own_person_profile_id
    FOR UPDATE;

    IF target_punch.id IS NULL THEN
      RAISE EXCEPTION 'time correction punch was not found';
    END IF;

    IF target_punch.status <> 'active' THEN
      RAISE EXCEPTION 'only active punches can be changed by a correction';
    END IF;
  ELSIF target_time_punch_id IS NOT NULL THEN
    RAISE EXCEPTION 'time correction punch link is not valid for this type';
  END IF;

  INSERT INTO public.time_record_corrections (
    organization_id,
    time_record_id,
    time_punch_id,
    person_profile_id,
    correction_type,
    reason,
    status,
    before_snapshot,
    after_snapshot,
    requested_by_user_id,
    requested_by_membership_id,
    requested_by_person_profile_id,
    metadata
  )
  VALUES (
    target_organization_id,
    target_record.id,
    target_time_punch_id,
    own_person_profile_id,
    target_correction_type,
    target_reason,
    'pending',
    target_before_snapshot,
    target_after_snapshot,
    current_user_id,
    current_membership_id,
    own_person_profile_id,
    normalized_metadata || jsonb_build_object(
      'approvalMode', 'direct',
      'source', COALESCE(normalized_metadata ->> 'source', 'own_direct_time_correction')
    )
  )
  RETURNING * INTO created_correction;

  PERFORM set_config('boxops.time_correction_application', 'on', true);
  PERFORM set_config('boxops.time_correction_direct_application', 'on', true);

  IF target_correction_type = 'punch_add' THEN
    normalized_punch_type := target_after_snapshot #>> '{punch,punchType}';
    requested_local_value := target_after_snapshot #>> '{punch,occurredAtLocal}';
    requested_timezone := COALESCE(
      target_after_snapshot #>> '{punch,timezone}',
      target_record.timezone
    );

    IF normalized_punch_type NOT IN ('clock_in', 'clock_out') THEN
      RAISE EXCEPTION 'time correction requested punch type is not valid';
    END IF;

    IF requested_local_value IS NULL
      OR requested_local_value !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$' THEN
      RAISE EXCEPTION 'time correction requested timestamp is not valid';
    END IF;

    IF requested_timezone IS DISTINCT FROM target_record.timezone THEN
      RAISE EXCEPTION 'time correction timezone does not match the record';
    END IF;

    normalized_occurred_at := requested_local_value::timestamp AT TIME ZONE requested_timezone;
    normalized_work_date := (normalized_occurred_at AT TIME ZONE requested_timezone)::date;
    application_record := target_record;

    IF normalized_work_date IS DISTINCT FROM target_record.local_work_date THEN
      application_record := public.resolve_time_record_for_correction_punch(
        target_organization_id,
        own_person_profile_id,
        normalized_work_date,
        target_record.timezone,
        target_record.center_id,
        current_user_id,
        current_membership_id,
        created_correction.id,
        'own_direct_time_correction'
      );
    END IF;

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
      application_record.id,
      own_person_profile_id,
      normalized_punch_type,
      normalized_occurred_at,
      application_record.timezone,
      application_record.center_id,
      application_record.schedule_block_id,
      application_record.schedule_block_assignment_id,
      'correction',
      'active',
      current_user_id,
      current_membership_id,
      target_reason,
      jsonb_build_object(
        'applicationVersion', 'boxops.time-correction-direct-application.v2',
        'correctionId', created_correction.id,
        'source', 'own_direct_time_correction',
        'timeRecordId', application_record.id
      )
    );
  ELSIF target_correction_type = 'punch_void' THEN
    UPDATE public.time_punches
    SET
      status = 'voided',
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
        'voidedByCorrectionId', created_correction.id,
        'voidedAt', now()
      )
    WHERE id = target_punch.id
      AND organization_id = target_organization_id;
  ELSIF target_correction_type = 'punch_update' THEN
    requested_local_value := COALESCE(
      target_after_snapshot #>> '{punch,requestedOccurredAtLocal}',
      target_after_snapshot #>> '{punch,occurredAtLocal}'
    );
    requested_timezone := COALESCE(
      target_after_snapshot #>> '{punch,requestedTimezone}',
      target_after_snapshot #>> '{punch,timezone}',
      target_punch.timezone
    );

    IF requested_local_value IS NULL
      OR requested_local_value !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$' THEN
      RAISE EXCEPTION 'time correction requested timestamp is not valid';
    END IF;

    IF requested_timezone IS DISTINCT FROM target_punch.timezone THEN
      RAISE EXCEPTION 'time correction timezone does not match the punch';
    END IF;

    normalized_occurred_at := requested_local_value::timestamp AT TIME ZONE requested_timezone;
    normalized_work_date := (normalized_occurred_at AT TIME ZONE requested_timezone)::date;
    application_record := target_record;

    IF normalized_work_date IS DISTINCT FROM target_record.local_work_date THEN
      application_record := public.resolve_time_record_for_correction_punch(
        target_organization_id,
        own_person_profile_id,
        normalized_work_date,
        target_punch.timezone,
        target_punch.center_id,
        current_user_id,
        current_membership_id,
        created_correction.id,
        'own_direct_time_correction'
      );
    END IF;

    UPDATE public.time_punches
    SET
      status = 'superseded',
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
        'supersededByCorrectionId', created_correction.id,
        'supersededAt', now()
      )
    WHERE id = target_punch.id
      AND organization_id = target_organization_id;

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
      application_record.id,
      own_person_profile_id,
      target_punch.punch_type,
      normalized_occurred_at,
      application_record.timezone,
      COALESCE(target_punch.center_id, application_record.center_id),
      application_record.schedule_block_id,
      application_record.schedule_block_assignment_id,
      'correction',
      'active',
      current_user_id,
      current_membership_id,
      target_reason,
      jsonb_build_object(
        'applicationVersion', 'boxops.time-correction-direct-application.v2',
        'correctionId', created_correction.id,
        'replacesPunchId', target_punch.id,
        'source', 'own_direct_time_correction',
        'timeRecordId', application_record.id
      )
    );
  ELSIF target_correction_type = 'record_update' THEN
    NULL;
  END IF;

  application_metadata := COALESCE(created_correction.metadata, '{}'::jsonb)
    || jsonb_build_object(
      'appliedByMembershipId', current_membership_id,
      'applicationVersion', 'boxops.time-correction-direct-application.v2',
      'applicationResult',
      CASE
        WHEN target_correction_type = 'record_update'
          THEN 'marked_applied_without_record_mutation'
        ELSE 'punch_history_updated'
      END
    );

  UPDATE public.time_record_corrections
  SET
    applied_at = now(),
    metadata = application_metadata,
    review_note = 'Correccion directa aplicada por politica del tenant.',
    reviewed_at = now(),
    reviewed_by_membership_id = current_membership_id,
    reviewed_by_person_profile_id = own_person_profile_id,
    reviewed_by_user_id = current_user_id,
    status = 'applied'
  WHERE id = created_correction.id
    AND organization_id = target_organization_id
  RETURNING * INTO applied_correction;

  RETURN applied_correction;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_time_record_for_correction_punch(
  uuid,
  uuid,
  date,
  text,
  uuid,
  uuid,
  uuid,
  uuid,
  text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.apply_time_record_correction(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_and_apply_own_time_record_correction(
  uuid,
  uuid,
  uuid,
  text,
  text,
  jsonb,
  jsonb,
  jsonb
) TO authenticated;
