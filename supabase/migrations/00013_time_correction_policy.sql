-- BoxOps - Fase F.8 time correction approval policy
-- Default: own corrections are applied directly through an auditable RPC.
-- Tenant owners can require approval to keep the F.6/F.7 request-review-apply flow.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS time_tracking_config jsonb NOT NULL
  DEFAULT '{"version":1,"correctionApprovalRequired":false}'::jsonb;

ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS organizations_time_tracking_config_is_object;

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_time_tracking_config_is_object
  CHECK (jsonb_typeof(time_tracking_config) = 'object');

CREATE OR REPLACE FUNCTION public.time_correction_approval_is_required(
  target_organization_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    CASE
      WHEN jsonb_typeof(organization.time_tracking_config -> 'correctionApprovalRequired') = 'boolean'
        THEN (organization.time_tracking_config ->> 'correctionApprovalRequired')::boolean
      ELSE false
    END,
    false
  )
  FROM public.organizations organization
  WHERE organization.id = target_organization_id;
$$;

CREATE OR REPLACE FUNCTION public.is_time_correction_direct_application_context()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT current_setting('boxops.time_correction_direct_application', true) = 'on';
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
  direct_application_context boolean := public.is_time_correction_direct_application_context();
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
        OR (
          direct_application_context
          AND OLD.status = 'pending'
          AND NEW.status = 'applied'
        )
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
    ELSIF NEW.status = 'applied'
      AND OLD.status = 'pending'
      AND direct_application_context THEN
      IF current_user_id IS NOT NULL THEN
        IF public.time_correction_approval_is_required(NEW.organization_id) THEN
          RAISE EXCEPTION 'time correction approval is required';
        END IF;

        IF NEW.requested_by_user_id <> current_user_id THEN
          RAISE EXCEPTION 'direct time correction requester must be the authenticated user';
        END IF;

        IF current_person_profile_id IS NULL OR NEW.person_profile_id <> current_person_profile_id THEN
          RAISE EXCEPTION 'direct time correction person must be the authenticated user';
        END IF;

        NEW.reviewed_by_user_id := COALESCE(NEW.reviewed_by_user_id, current_user_id);
        NEW.reviewed_by_membership_id := COALESCE(NEW.reviewed_by_membership_id, current_membership_id);
        NEW.reviewed_by_person_profile_id := COALESCE(
          NEW.reviewed_by_person_profile_id,
          current_person_profile_id
        );
        NEW.reviewed_at := COALESCE(NEW.reviewed_at, now());
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
  created_correction public.time_record_corrections;
  applied_correction public.time_record_corrections;
  normalized_metadata jsonb := COALESCE(target_metadata, '{}'::jsonb);
  requested_local_value text;
  requested_timezone text;
  normalized_occurred_at timestamptz;
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
      own_person_profile_id,
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
      target_reason,
      jsonb_build_object(
        'applicationVersion', 'boxops.time-correction-direct-application.v1',
        'correctionId', created_correction.id,
        'source', 'own_direct_time_correction'
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
      target_record.id,
      own_person_profile_id,
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
      target_reason,
      jsonb_build_object(
        'applicationVersion', 'boxops.time-correction-direct-application.v1',
        'correctionId', created_correction.id,
        'replacesPunchId', target_punch.id,
        'source', 'own_direct_time_correction'
      )
    );
  ELSIF target_correction_type = 'record_update' THEN
    -- The current time_records model has no safe operational note field for
    -- applying record-only corrections. The correction is still marked applied
    -- and documented/audited without mutating jornada fields.
    NULL;
  END IF;

  application_metadata := COALESCE(created_correction.metadata, '{}'::jsonb)
    || jsonb_build_object(
      'appliedByMembershipId', current_membership_id,
      'applicationVersion', 'boxops.time-correction-direct-application.v1',
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

REVOKE ALL ON FUNCTION public.time_correction_approval_is_required(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_time_correction_direct_application_context() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_and_apply_own_time_record_correction(
  uuid,
  uuid,
  uuid,
  text,
  text,
  jsonb,
  jsonb,
  jsonb
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.time_correction_approval_is_required(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_time_correction_direct_application_context() TO authenticated;
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
