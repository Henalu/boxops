-- BoxOps - Fase F.7 approved time correction application
-- Applies already-approved corrections through a single tenant-safe RPC.
-- This keeps historical changes explicit, audited and reversible in concept.

ALTER TABLE public.time_audit_events
  DROP CONSTRAINT IF EXISTS time_audit_events_event_type_check;

ALTER TABLE public.time_audit_events
  ADD CONSTRAINT time_audit_events_event_type_check
  CHECK (event_type IN (
    'time_record_created',
    'time_punch_created',
    'time_punch_updated',
    'time_correction_requested',
    'time_correction_updated',
    'time_weekly_approval_created',
    'time_weekly_approval_updated',
    'time_export_requested',
    'time_export_updated',
    'time_access_denied'
  ));

CREATE OR REPLACE FUNCTION public.is_time_correction_application_context()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT current_setting('boxops.time_correction_application', true) = 'on';
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
  target_record public.time_records;
  application_context boolean := public.is_time_correction_application_context();
BEGIN
  IF current_user_id IS NOT NULL THEN
    current_membership_id := public.get_active_membership_id(NEW.organization_id);

    IF current_membership_id IS NULL THEN
      RAISE EXCEPTION 'active membership is required for time punches';
    END IF;

    IF application_context AND NOT public.can_manage_time_tracking(NEW.organization_id) THEN
      RAISE EXCEPTION 'time correction application permission required';
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
    RAISE EXCEPTION 'time punch record is not open for manual punches';
  END IF;

  IF target_record.center_id IS NOT NULL
    AND NEW.center_id IS NOT NULL
    AND target_record.center_id <> NEW.center_id THEN
    RAISE EXCEPTION 'time punch center must match its record when both are set';
  END IF;

  IF target_record.schedule_block_id IS NOT NULL
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

CREATE OR REPLACE FUNCTION public.validate_time_record_correction_row()
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
BEGIN
  IF current_user_id IS NOT NULL THEN
    current_membership_id := public.get_active_membership_id(NEW.organization_id);
    current_person_profile_id := public.get_own_person_profile_id(NEW.organization_id);

    IF current_membership_id IS NULL THEN
      RAISE EXCEPTION 'active membership is required for time corrections';
    END IF;
  END IF;

  SELECT time_record.*
  INTO target_record
  FROM public.time_records time_record
  WHERE time_record.id = NEW.time_record_id
    AND time_record.organization_id = NEW.organization_id;

  IF target_record.id IS NULL THEN
    RAISE EXCEPTION 'time correction record was not found';
  END IF;

  IF target_record.person_profile_id <> NEW.person_profile_id THEN
    RAISE EXCEPTION 'time correction person must match its record';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF current_user_id IS NOT NULL THEN
      NEW.requested_by_user_id := COALESCE(NEW.requested_by_user_id, current_user_id);
      NEW.requested_by_membership_id := COALESCE(NEW.requested_by_membership_id, current_membership_id);
      NEW.requested_by_person_profile_id := COALESCE(
        NEW.requested_by_person_profile_id,
        current_person_profile_id
      );

      IF NEW.requested_by_user_id <> current_user_id THEN
        RAISE EXCEPTION 'time correction requester must be the authenticated user';
      END IF;

      IF NEW.status <> 'pending' THEN
        RAISE EXCEPTION 'time corrections must start pending';
      END IF;
    END IF;
  ELSE
    IF NEW.id <> OLD.id
      OR NEW.organization_id <> OLD.organization_id
      OR NEW.time_record_id <> OLD.time_record_id
      OR NEW.time_punch_id IS DISTINCT FROM OLD.time_punch_id
      OR NEW.person_profile_id <> OLD.person_profile_id
      OR NEW.correction_type <> OLD.correction_type
      OR NEW.reason <> OLD.reason
      OR NEW.before_snapshot <> OLD.before_snapshot
      OR NEW.after_snapshot <> OLD.after_snapshot
      OR NEW.requested_by_user_id <> OLD.requested_by_user_id
      OR NEW.requested_by_membership_id IS DISTINCT FROM OLD.requested_by_membership_id
      OR NEW.requested_by_person_profile_id IS DISTINCT FROM OLD.requested_by_person_profile_id
      OR NEW.created_at <> OLD.created_at THEN
      RAISE EXCEPTION 'time correction immutable fields cannot be changed';
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status
      AND NOT (
        (OLD.status = 'pending' AND NEW.status IN ('approved', 'rejected'))
        OR (OLD.status = 'approved' AND NEW.status = 'applied')
      ) THEN
      RAISE EXCEPTION 'time correction status transition is not allowed';
    END IF;

    IF NEW.status IN ('approved', 'rejected') AND OLD.status = 'pending' THEN
      IF current_user_id IS NOT NULL THEN
        IF NOT public.can_manage_time_tracking(NEW.organization_id) THEN
          RAISE EXCEPTION 'time correction review permission required';
        END IF;

        NEW.reviewed_by_user_id := COALESCE(NEW.reviewed_by_user_id, current_user_id);
        NEW.reviewed_by_membership_id := COALESCE(NEW.reviewed_by_membership_id, current_membership_id);
        NEW.reviewed_by_person_profile_id := COALESCE(
          NEW.reviewed_by_person_profile_id,
          current_person_profile_id
        );
        NEW.reviewed_at := COALESCE(NEW.reviewed_at, now());

        IF NEW.reviewed_by_user_id <> current_user_id THEN
          RAISE EXCEPTION 'time correction reviewer must be the authenticated user';
        END IF;
      END IF;
    ELSIF NEW.status = 'applied' AND OLD.status = 'approved' THEN
      IF current_user_id IS NOT NULL AND NOT public.can_manage_time_tracking(NEW.organization_id) THEN
        RAISE EXCEPTION 'time correction application permission required';
      END IF;
    END IF;

    IF NEW.status IN ('approved', 'rejected', 'applied') THEN
      IF NEW.reviewed_by_user_id IS NULL OR NEW.reviewed_at IS NULL THEN
        RAISE EXCEPTION 'reviewed corrections require reviewer and timestamp';
      END IF;
    END IF;
  END IF;

  IF NEW.status = 'applied' AND NEW.applied_at IS NULL THEN
    NEW.applied_at := now();
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_time_audit_event_from_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_organization_id uuid;
  actor_user_id uuid;
  actor_membership_id uuid;
  actor_person_profile_id uuid;
  target_person_profile_id uuid;
  target_record_id uuid;
  target_punch_id uuid;
  target_correction_id uuid;
  target_weekly_approval_id uuid;
  target_export_id uuid;
  audit_event_type text;
BEGIN
  target_organization_id := COALESCE(NEW.organization_id, OLD.organization_id);
  actor_user_id := (select auth.uid());
  actor_membership_id := public.get_active_membership_id(target_organization_id);
  actor_person_profile_id := public.get_own_person_profile_id(target_organization_id);

  IF TG_TABLE_NAME = 'time_records' THEN
    audit_event_type := 'time_record_created';
    target_person_profile_id := NEW.person_profile_id;
    target_record_id := NEW.id;
  ELSIF TG_TABLE_NAME = 'time_punches' THEN
    IF TG_OP = 'INSERT' THEN
      audit_event_type := 'time_punch_created';
    ELSE
      audit_event_type := 'time_punch_updated';
    END IF;

    target_person_profile_id := NEW.person_profile_id;
    target_record_id := NEW.time_record_id;
    target_punch_id := NEW.id;
  ELSIF TG_TABLE_NAME = 'time_record_corrections' THEN
    IF TG_OP = 'INSERT' THEN
      audit_event_type := 'time_correction_requested';
    ELSE
      audit_event_type := 'time_correction_updated';
    END IF;

    target_person_profile_id := NEW.person_profile_id;
    target_record_id := NEW.time_record_id;
    target_punch_id := NEW.time_punch_id;
    target_correction_id := NEW.id;
  ELSIF TG_TABLE_NAME = 'time_weekly_approvals' THEN
    IF TG_OP = 'INSERT' THEN
      audit_event_type := 'time_weekly_approval_created';
    ELSE
      audit_event_type := 'time_weekly_approval_updated';
    END IF;

    target_person_profile_id := NEW.person_profile_id;
    target_weekly_approval_id := NEW.id;
  ELSIF TG_TABLE_NAME = 'time_exports' THEN
    IF TG_OP = 'INSERT' THEN
      audit_event_type := 'time_export_requested';
    ELSE
      audit_event_type := 'time_export_updated';
    END IF;

    target_person_profile_id := NEW.person_profile_id;
    target_export_id := NEW.id;
  ELSE
    RAISE EXCEPTION 'unsupported time audit trigger table';
  END IF;

  INSERT INTO public.time_audit_events (
    organization_id,
    event_type,
    result,
    actor_user_id,
    actor_membership_id,
    actor_person_profile_id,
    target_person_profile_id,
    time_record_id,
    time_punch_id,
    time_record_correction_id,
    time_weekly_approval_id,
    time_export_id,
    metadata
  )
  VALUES (
    target_organization_id,
    audit_event_type,
    'allowed',
    actor_user_id,
    actor_membership_id,
    actor_person_profile_id,
    target_person_profile_id,
    target_record_id,
    target_punch_id,
    target_correction_id,
    target_weekly_approval_id,
    target_export_id,
    '{}'::jsonb
  );

  RETURN NEW;
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
  applied_correction public.time_record_corrections;
  requested_local_value text;
  requested_timezone text;
  normalized_occurred_at timestamptz;
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
      target_record.id,
      target_record.person_profile_id,
      normalized_punch_type,
      normalized_occurred_at,
      target_record.timezone,
      target_record.center_id,
      target_record.schedule_block_id,
      target_record.schedule_block_assignment_id,
      'correction',
      'active',
      current_user_id,
      current_membership_id,
      target_correction.reason,
      jsonb_build_object(
        'applicationVersion', 'boxops.time-correction-application.v1',
        'correctionId', target_correction.id,
        'source', 'approved_time_correction'
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
        target_record.id,
        target_record.person_profile_id,
        target_punch.punch_type,
        normalized_occurred_at,
        target_punch.timezone,
        target_punch.center_id,
        target_punch.schedule_block_id,
        target_punch.schedule_block_assignment_id,
        'correction',
        'active',
        current_user_id,
        current_membership_id,
        target_correction.reason,
        jsonb_build_object(
          'applicationVersion', 'boxops.time-correction-application.v1',
          'correctionId', target_correction.id,
          'replacesPunchId', target_punch.id,
          'source', 'approved_time_correction'
        )
      );
    END IF;
  ELSIF target_correction.correction_type = 'record_update' THEN
    -- The current time_records model has status/metadata but no safe operational
    -- note field for corrections. F.7 marks the approved correction as applied
    -- without mutating jornada fields; docs capture this limitation.
    NULL;
  ELSE
    RAISE EXCEPTION 'time correction type is not supported';
  END IF;

  application_metadata := COALESCE(target_correction.metadata, '{}'::jsonb)
    || jsonb_build_object(
      'appliedByMembershipId', current_membership_id,
      'applicationVersion', 'boxops.time-correction-application.v1',
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

DROP TRIGGER IF EXISTS time_punches_audit_update ON public.time_punches;

CREATE TRIGGER time_punches_audit_update
  AFTER UPDATE OF status ON public.time_punches
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.record_time_audit_event_from_trigger();

GRANT EXECUTE ON FUNCTION public.is_time_correction_application_context() TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_time_record_correction(uuid, uuid) TO authenticated;
