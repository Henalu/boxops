-- BoxOps - I.3 change request operational decisions and application
-- Adds bounded RPCs for approving, rejecting, cancelling, expiring and
-- applying accepted change/coverage requests to the real schedule.
-- No UI, seeds, absences, payroll, overtime, AI, push or location.

-- ============================================================
-- Validation refinements for operational closure
-- ============================================================

CREATE OR REPLACE FUNCTION public.validate_change_request_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  requester_membership record;
  requester_person record;
  requester_coach record;
  source_assignment record;
  accepted_target_request_id uuid;
  applied_assignment_block_id uuid;
  require_active_requester boolean := NEW.status NOT IN ('rejected', 'cancelled', 'expired');
BEGIN
  SELECT membership.*
  INTO requester_membership
  FROM public.organization_memberships membership
  WHERE membership.id = NEW.requester_membership_id
    AND membership.organization_id = NEW.organization_id;

  IF requester_membership.id IS NULL THEN
    RAISE EXCEPTION 'requester membership is required';
  END IF;

  IF require_active_requester AND requester_membership.status <> 'active' THEN
    RAISE EXCEPTION 'active requester membership is required';
  END IF;

  SELECT person_profile.*
  INTO requester_person
  FROM public.person_profiles person_profile
  WHERE person_profile.id = NEW.requester_person_profile_id
    AND person_profile.organization_id = NEW.organization_id;

  IF requester_person.id IS NULL THEN
    RAISE EXCEPTION 'requester person profile is required';
  END IF;

  IF require_active_requester
    AND (
      requester_person.status <> 'active'
      OR requester_person.visibility_status <> 'visible'
    ) THEN
    RAISE EXCEPTION 'active requester person profile is required';
  END IF;

  IF requester_person.user_id IS DISTINCT FROM requester_membership.user_id THEN
    RAISE EXCEPTION 'requester person must match requester membership';
  END IF;

  SELECT coach_profile.*
  INTO requester_coach
  FROM public.coach_profiles coach_profile
  WHERE coach_profile.id = NEW.requester_coach_profile_id
    AND coach_profile.organization_id = NEW.organization_id;

  IF requester_coach.id IS NULL THEN
    RAISE EXCEPTION 'requester coach profile is required';
  END IF;

  IF require_active_requester AND requester_coach.status <> 'active' THEN
    RAISE EXCEPTION 'active requester coach profile is required';
  END IF;

  IF requester_coach.person_profile_id IS DISTINCT FROM NEW.requester_person_profile_id THEN
    RAISE EXCEPTION 'requester coach must be linked to requester person';
  END IF;

  SELECT assignment.*
  INTO source_assignment
  FROM public.schedule_block_assignments assignment
  WHERE assignment.id = NEW.schedule_block_assignment_id
    AND assignment.organization_id = NEW.organization_id;

  IF source_assignment.id IS NULL THEN
    RAISE EXCEPTION 'source assignment is required';
  END IF;

  IF source_assignment.schedule_block_id <> NEW.schedule_block_id THEN
    RAISE EXCEPTION 'source assignment must belong to the requested block';
  END IF;

  IF source_assignment.coach_profile_id <> NEW.requester_coach_profile_id THEN
    RAISE EXCEPTION 'source assignment must belong to requester coach';
  END IF;

  IF NEW.accepted_target_id IS NOT NULL THEN
    SELECT target.change_request_id
    INTO accepted_target_request_id
    FROM public.change_request_targets target
    WHERE target.id = NEW.accepted_target_id
      AND target.organization_id = NEW.organization_id;

    IF accepted_target_request_id IS DISTINCT FROM NEW.id THEN
      RAISE EXCEPTION 'accepted target must belong to the request';
    END IF;
  END IF;

  IF NEW.applied_schedule_block_assignment_id IS NOT NULL THEN
    SELECT assignment.schedule_block_id
    INTO applied_assignment_block_id
    FROM public.schedule_block_assignments assignment
    WHERE assignment.id = NEW.applied_schedule_block_assignment_id
      AND assignment.organization_id = NEW.organization_id;

    IF applied_assignment_block_id IS DISTINCT FROM NEW.schedule_block_id THEN
      RAISE EXCEPTION 'applied assignment must belong to the requested block';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_change_request_target_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  request_record public.change_requests;
BEGIN
  SELECT request.*
  INTO request_record
  FROM public.change_requests request
  WHERE request.id = NEW.change_request_id
    AND request.organization_id = NEW.organization_id;

  IF request_record.id IS NULL THEN
    RAISE EXCEPTION 'change request is required';
  END IF;

  IF NEW.target_coach_profile_id = request_record.requester_coach_profile_id THEN
    RAISE EXCEPTION 'requester coach cannot be a target';
  END IF;

  IF NEW.status IN ('offered', 'accepted')
    AND NOT public.change_request_coach_is_assignable(
      NEW.organization_id,
      NEW.target_coach_profile_id
    ) THEN
    RAISE EXCEPTION 'target coach is not assignable';
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================
-- Internal helpers
-- ============================================================

CREATE OR REPLACE FUNCTION public.record_change_request_application_failure_internal(
  target_organization_id uuid,
  target_change_request_id uuid,
  target_change_request_target_id uuid,
  target_failure_code text,
  target_failure_stage text,
  target_changed_fields jsonb DEFAULT '{}'::jsonb
)
RETURNS public.change_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized_failure_code text := lower(btrim(COALESCE(target_failure_code, 'application-failed')));
  normalized_failure_stage text := lower(btrim(COALESCE(target_failure_stage, 'application')));
  normalized_changed_fields jsonb := COALESCE(target_changed_fields, '{}'::jsonb);
  request_record public.change_requests;
BEGIN
  PERFORM public.record_change_request_event_internal(
    target_organization_id,
    target_change_request_id,
    target_change_request_target_id,
    'application_failed',
    'failed',
    jsonb_build_object(
      'failure_code', normalized_failure_code,
      'failure_stage', normalized_failure_stage
    ) || normalized_changed_fields,
    NULL
  );

  SELECT request.*
  INTO request_record
  FROM public.change_requests request
  WHERE request.id = target_change_request_id
    AND request.organization_id = target_organization_id;

  RETURN request_record;
END;
$$;

CREATE OR REPLACE FUNCTION public.change_request_current_actor_is_requester(
  target_organization_id uuid,
  target_change_request_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.change_requests request
    WHERE request.id = target_change_request_id
      AND request.organization_id = target_organization_id
      AND public.change_request_coach_belongs_to_current_user(
        request.organization_id,
        request.requester_coach_profile_id
      )
  );
$$;

-- ============================================================
-- Operational decision RPCs
-- ============================================================

CREATE OR REPLACE FUNCTION public.approve_change_request(
  target_organization_id uuid,
  target_change_request_id uuid
)
RETURNS public.change_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  request_record public.change_requests;
  accepted_target public.change_request_targets;
  target_block record;
  source_assignment record;
  updated_request public.change_requests;
BEGIN
  IF (select auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF NOT public.can_manage_change_requests(target_organization_id) THEN
    RAISE EXCEPTION 'change request management permission required';
  END IF;

  SELECT request.*
  INTO request_record
  FROM public.change_requests request
  WHERE request.id = target_change_request_id
    AND request.organization_id = target_organization_id
  FOR UPDATE;

  IF request_record.id IS NULL THEN
    RAISE EXCEPTION 'change request was not found in tenant';
  END IF;

  IF request_record.status NOT IN ('pending_approval', 'accepted_by_coach') THEN
    RAISE EXCEPTION 'change request is not awaiting approval';
  END IF;

  IF request_record.accepted_target_id IS NULL THEN
    RAISE EXCEPTION 'accepted target is required for approval';
  END IF;

  IF request_record.expires_at IS NOT NULL AND request_record.expires_at <= now() THEN
    RAISE EXCEPTION 'change request has expired';
  END IF;

  SELECT target.*
  INTO accepted_target
  FROM public.change_request_targets target
  WHERE target.id = request_record.accepted_target_id
    AND target.organization_id = target_organization_id
    AND target.change_request_id = request_record.id
  FOR SHARE;

  IF accepted_target.id IS NULL OR accepted_target.status <> 'accepted' THEN
    RAISE EXCEPTION 'accepted target is not valid';
  END IF;

  IF accepted_target.expires_at IS NOT NULL AND accepted_target.expires_at <= now() THEN
    RAISE EXCEPTION 'accepted target has expired';
  END IF;

  IF NOT public.change_request_coach_is_assignable(
    target_organization_id,
    accepted_target.target_coach_profile_id
  ) THEN
    RAISE EXCEPTION 'target coach is not assignable';
  END IF;

  SELECT
    block.id,
    block.status
  INTO target_block
  FROM public.schedule_blocks block
  WHERE block.id = request_record.schedule_block_id
    AND block.organization_id = target_organization_id
  FOR SHARE;

  IF target_block.id IS NULL THEN
    RAISE EXCEPTION 'schedule block was not found in tenant';
  END IF;

  IF NOT public.schedule_block_accepts_active_assignment(target_block.status) THEN
    RAISE EXCEPTION 'schedule block is not actionable';
  END IF;

  SELECT assignment.*
  INTO source_assignment
  FROM public.schedule_block_assignments assignment
  WHERE assignment.id = request_record.schedule_block_assignment_id
    AND assignment.organization_id = target_organization_id
    AND assignment.schedule_block_id = request_record.schedule_block_id
    AND assignment.coach_profile_id = request_record.requester_coach_profile_id
    AND assignment.assignment_status = 'assigned'
  FOR SHARE;

  IF source_assignment.id IS NULL THEN
    RAISE EXCEPTION 'assigned source assignment was not found in tenant';
  END IF;

  UPDATE public.change_requests
  SET
    status = 'approved',
    resolved_at = now()
  WHERE id = request_record.id
    AND organization_id = request_record.organization_id
  RETURNING *
  INTO updated_request;

  PERFORM public.record_change_request_event_internal(
    target_organization_id,
    request_record.id,
    accepted_target.id,
    'request_approved',
    'success',
    jsonb_build_object(
      'status', 'approved',
      'target_coach_profile_id', accepted_target.target_coach_profile_id
    ),
    NULL
  );

  RETURN updated_request;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_change_request(
  target_organization_id uuid,
  target_change_request_id uuid
)
RETURNS public.change_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  request_record public.change_requests;
  updated_request public.change_requests;
BEGIN
  IF (select auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF NOT public.can_manage_change_requests(target_organization_id) THEN
    RAISE EXCEPTION 'change request management permission required';
  END IF;

  SELECT request.*
  INTO request_record
  FROM public.change_requests request
  WHERE request.id = target_change_request_id
    AND request.organization_id = target_organization_id
  FOR UPDATE;

  IF request_record.id IS NULL THEN
    RAISE EXCEPTION 'change request was not found in tenant';
  END IF;

  IF request_record.status IN ('rejected', 'cancelled', 'expired', 'applied') THEN
    RAISE EXCEPTION 'change request is already closed';
  END IF;

  UPDATE public.change_request_targets
  SET status = 'withdrawn'
  WHERE organization_id = target_organization_id
    AND change_request_id = request_record.id
    AND status = 'offered';

  UPDATE public.change_requests
  SET
    status = 'rejected',
    resolved_at = now()
  WHERE id = request_record.id
    AND organization_id = request_record.organization_id
  RETURNING *
  INTO updated_request;

  PERFORM public.record_change_request_event_internal(
    target_organization_id,
    request_record.id,
    request_record.accepted_target_id,
    'request_rejected',
    'success',
    jsonb_build_object('status', 'rejected'),
    NULL
  );

  RETURN updated_request;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_change_request(
  target_organization_id uuid,
  target_change_request_id uuid
)
RETURNS public.change_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  request_record public.change_requests;
  actor_is_requester boolean := false;
  actor_coach_profile_id uuid;
  updated_request public.change_requests;
BEGIN
  IF (select auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT request.*
  INTO request_record
  FROM public.change_requests request
  WHERE request.id = target_change_request_id
    AND request.organization_id = target_organization_id
  FOR UPDATE;

  IF request_record.id IS NULL THEN
    RAISE EXCEPTION 'change request was not found in tenant';
  END IF;

  actor_is_requester := public.change_request_current_actor_is_requester(
    target_organization_id,
    request_record.id
  );

  IF NOT public.can_manage_change_requests(target_organization_id)
    AND NOT actor_is_requester THEN
    RAISE EXCEPTION 'change request cancellation permission required';
  END IF;

  IF request_record.status IN ('rejected', 'cancelled', 'expired', 'applied') THEN
    RAISE EXCEPTION 'change request is already closed';
  END IF;

  IF request_record.status = 'approved'
    AND NOT public.can_manage_change_requests(target_organization_id) THEN
    RAISE EXCEPTION 'approved change request cancellation requires management permission';
  END IF;

  UPDATE public.change_request_targets
  SET status = 'withdrawn'
  WHERE organization_id = target_organization_id
    AND change_request_id = request_record.id
    AND status = 'offered';

  UPDATE public.change_requests
  SET
    status = 'cancelled',
    resolved_at = now()
  WHERE id = request_record.id
    AND organization_id = request_record.organization_id
  RETURNING *
  INTO updated_request;

  actor_coach_profile_id := CASE
    WHEN actor_is_requester THEN request_record.requester_coach_profile_id
    ELSE NULL
  END;

  PERFORM public.record_change_request_event_internal(
    target_organization_id,
    request_record.id,
    request_record.accepted_target_id,
    'request_cancelled',
    'success',
    jsonb_build_object('status', 'cancelled'),
    actor_coach_profile_id
  );

  RETURN updated_request;
END;
$$;

CREATE OR REPLACE FUNCTION public.expire_change_request(
  target_organization_id uuid,
  target_change_request_id uuid
)
RETURNS public.change_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  request_record public.change_requests;
  accepted_target public.change_request_targets;
  target_block record;
  has_active_targets boolean := false;
  can_expire boolean := false;
  updated_request public.change_requests;
BEGIN
  IF (select auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF NOT public.can_read_change_request(
    target_organization_id,
    target_change_request_id
  ) THEN
    RAISE EXCEPTION 'change request permission required';
  END IF;

  SELECT request.*
  INTO request_record
  FROM public.change_requests request
  WHERE request.id = target_change_request_id
    AND request.organization_id = target_organization_id
  FOR UPDATE;

  IF request_record.id IS NULL THEN
    RAISE EXCEPTION 'change request was not found in tenant';
  END IF;

  IF request_record.status IN ('rejected', 'cancelled', 'expired', 'applied') THEN
    RAISE EXCEPTION 'change request is already closed';
  END IF;

  SELECT
    block.id,
    block.status
  INTO target_block
  FROM public.schedule_blocks block
  WHERE block.id = request_record.schedule_block_id
    AND block.organization_id = target_organization_id
  FOR SHARE;

  IF target_block.id IS NULL THEN
    RAISE EXCEPTION 'schedule block was not found in tenant';
  END IF;

  UPDATE public.change_request_targets
  SET status = 'expired'
  WHERE organization_id = target_organization_id
    AND change_request_id = request_record.id
    AND status = 'offered'
    AND expires_at IS NOT NULL
    AND expires_at <= now();

  IF request_record.accepted_target_id IS NOT NULL THEN
    SELECT target.*
    INTO accepted_target
    FROM public.change_request_targets target
    WHERE target.id = request_record.accepted_target_id
      AND target.organization_id = target_organization_id
      AND target.change_request_id = request_record.id
    FOR SHARE;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.change_request_targets target
    WHERE target.organization_id = target_organization_id
      AND target.change_request_id = request_record.id
      AND target.status IN ('offered', 'accepted')
      AND (
        target.expires_at IS NULL
        OR target.expires_at > now()
      )
  )
  INTO has_active_targets;

  can_expire :=
    (request_record.expires_at IS NOT NULL AND request_record.expires_at <= now())
    OR NOT public.schedule_block_accepts_active_assignment(target_block.status)
    OR (
      accepted_target.id IS NOT NULL
      AND accepted_target.expires_at IS NOT NULL
      AND accepted_target.expires_at <= now()
    )
    OR (
      request_record.status = 'offered'
      AND NOT has_active_targets
    );

  IF NOT can_expire THEN
    RAISE EXCEPTION 'change request is not expirable yet';
  END IF;

  UPDATE public.change_requests
  SET
    status = 'expired',
    resolved_at = now()
  WHERE id = request_record.id
    AND organization_id = request_record.organization_id
  RETURNING *
  INTO updated_request;

  PERFORM public.record_change_request_event_internal(
    target_organization_id,
    request_record.id,
    request_record.accepted_target_id,
    'request_expired',
    'success',
    jsonb_build_object(
      'status', 'expired',
      'block_status', target_block.status
    ),
    NULL
  );

  RETURN updated_request;
END;
$$;

-- ============================================================
-- Transactional application RPC
-- ============================================================

CREATE OR REPLACE FUNCTION public.apply_approved_change_request(
  target_organization_id uuid,
  target_change_request_id uuid
)
RETURNS public.change_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  request_record public.change_requests;
  target_record public.change_request_targets;
  target_block record;
  source_assignment public.schedule_block_assignments;
  destination_assignment public.schedule_block_assignments;
  updated_request public.change_requests;
  actor_failure_context jsonb := '{}'::jsonb;
BEGIN
  IF (select auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF NOT public.can_manage_change_requests(target_organization_id) THEN
    RAISE EXCEPTION 'change request application permission required';
  END IF;

  SELECT request.*
  INTO request_record
  FROM public.change_requests request
  WHERE request.id = target_change_request_id
    AND request.organization_id = target_organization_id
  FOR UPDATE;

  IF request_record.id IS NULL THEN
    RAISE EXCEPTION 'change request was not found in tenant';
  END IF;

  actor_failure_context := jsonb_build_object(
    'status', request_record.status,
    'schedule_block_id', request_record.schedule_block_id,
    'source_assignment_id', request_record.schedule_block_assignment_id
  );

  IF request_record.status <> 'approved' THEN
    RETURN public.record_change_request_application_failure_internal(
      target_organization_id,
      request_record.id,
      request_record.accepted_target_id,
      'request-not-approved',
      'request_status',
      actor_failure_context
    );
  END IF;

  IF request_record.request_type = 'swap' THEN
    RETURN public.record_change_request_application_failure_internal(
      target_organization_id,
      request_record.id,
      request_record.accepted_target_id,
      'swap-not-implemented',
      'request_type',
      actor_failure_context || jsonb_build_object('request_type', request_record.request_type)
    );
  END IF;

  IF request_record.expires_at IS NOT NULL AND request_record.expires_at <= now() THEN
    RETURN public.record_change_request_application_failure_internal(
      target_organization_id,
      request_record.id,
      request_record.accepted_target_id,
      'request-expired',
      'request_expiry',
      actor_failure_context
    );
  END IF;

  SELECT target.*
  INTO target_record
  FROM public.change_request_targets target
  WHERE target.id = request_record.accepted_target_id
    AND target.organization_id = target_organization_id
    AND target.change_request_id = request_record.id
  FOR UPDATE;

  IF target_record.id IS NULL OR target_record.status <> 'accepted' THEN
    RETURN public.record_change_request_application_failure_internal(
      target_organization_id,
      request_record.id,
      request_record.accepted_target_id,
      'accepted-target-invalid',
      'target',
      actor_failure_context
    );
  END IF;

  actor_failure_context := actor_failure_context || jsonb_build_object(
    'target_id', target_record.id,
    'target_coach_profile_id', target_record.target_coach_profile_id
  );

  IF target_record.expires_at IS NOT NULL AND target_record.expires_at <= now() THEN
    RETURN public.record_change_request_application_failure_internal(
      target_organization_id,
      request_record.id,
      target_record.id,
      'target-expired',
      'target_expiry',
      actor_failure_context
    );
  END IF;

  SELECT
    block.id,
    block.organization_id,
    block.service_date,
    block.start_time,
    block.end_time,
    block.status
  INTO target_block
  FROM public.schedule_blocks block
  WHERE block.id = request_record.schedule_block_id
    AND block.organization_id = target_organization_id
  FOR UPDATE;

  IF target_block.id IS NULL THEN
    RETURN public.record_change_request_application_failure_internal(
      target_organization_id,
      request_record.id,
      target_record.id,
      'schedule-block-missing',
      'block',
      actor_failure_context
    );
  END IF;

  IF NOT public.schedule_block_accepts_active_assignment(target_block.status) THEN
    RETURN public.record_change_request_application_failure_internal(
      target_organization_id,
      request_record.id,
      target_record.id,
      'schedule-block-not-actionable',
      'block',
      actor_failure_context || jsonb_build_object('block_status', target_block.status)
    );
  END IF;

  SELECT assignment.*
  INTO source_assignment
  FROM public.schedule_block_assignments assignment
  WHERE assignment.id = request_record.schedule_block_assignment_id
    AND assignment.organization_id = target_organization_id
    AND assignment.schedule_block_id = request_record.schedule_block_id
    AND assignment.coach_profile_id = request_record.requester_coach_profile_id
  FOR UPDATE;

  IF source_assignment.id IS NULL
    OR source_assignment.assignment_status <> 'assigned' THEN
    RETURN public.record_change_request_application_failure_internal(
      target_organization_id,
      request_record.id,
      target_record.id,
      'source-assignment-invalid',
      'source_assignment',
      actor_failure_context
    );
  END IF;

  IF NOT public.change_request_coach_is_assignable(
    target_organization_id,
    target_record.target_coach_profile_id
  ) THEN
    RETURN public.record_change_request_application_failure_internal(
      target_organization_id,
      request_record.id,
      target_record.id,
      'target-coach-not-assignable',
      'target_coach',
      actor_failure_context
    );
  END IF;

  PERFORM public.lock_schedule_coach_assignment_window(
    target_organization_id,
    target_record.target_coach_profile_id,
    target_block.service_date
  );

  IF public.change_request_coach_has_block_overlap(
    target_organization_id,
    target_record.target_coach_profile_id,
    request_record.schedule_block_id
  ) THEN
    RETURN public.record_change_request_application_failure_internal(
      target_organization_id,
      request_record.id,
      target_record.id,
      'coach-unavailable',
      'availability',
      actor_failure_context
    );
  END IF;

  BEGIN
    INSERT INTO public.schedule_block_assignments (
      organization_id,
      schedule_block_id,
      coach_profile_id,
      assignment_status,
      source
    )
    VALUES (
      target_organization_id,
      request_record.schedule_block_id,
      target_record.target_coach_profile_id,
      'assigned',
      'change_request'
    )
    ON CONFLICT (schedule_block_id, coach_profile_id)
    DO UPDATE SET
      assignment_status = 'assigned',
      source = 'change_request'
    RETURNING *
    INTO destination_assignment;
  EXCEPTION
    WHEN SQLSTATE '23P01' THEN
      RETURN public.record_change_request_application_failure_internal(
        target_organization_id,
        request_record.id,
        target_record.id,
        'coach-unavailable',
        'assignment_upsert',
        actor_failure_context
      );
  END;

  UPDATE public.schedule_block_assignments
  SET assignment_status = 'removed'
  WHERE id = source_assignment.id
    AND organization_id = target_organization_id
  RETURNING *
  INTO source_assignment;

  PERFORM public.record_operational_audit_event(
    target_organization_id,
    'schedule_block_assignments',
    destination_assignment.id,
    'assigned',
    'success',
    jsonb_build_object(
      'assignment_status', jsonb_build_object('to', 'assigned'),
      'source', jsonb_build_object('to', 'change_request'),
      'schedule_block_id', request_record.schedule_block_id,
      'coach_profile_id', target_record.target_coach_profile_id,
      'change_request_id', request_record.id
    )
  );

  PERFORM public.record_operational_audit_event(
    target_organization_id,
    'schedule_block_assignments',
    source_assignment.id,
    'removed',
    'success',
    jsonb_build_object(
      'assignment_status', jsonb_build_object('from', 'assigned', 'to', 'removed'),
      'schedule_block_id', request_record.schedule_block_id,
      'coach_profile_id', request_record.requester_coach_profile_id,
      'change_request_id', request_record.id
    )
  );

  UPDATE public.change_requests
  SET
    status = 'applied',
    applied_schedule_block_assignment_id = destination_assignment.id,
    applied_at = now(),
    resolved_at = COALESCE(resolved_at, now())
  WHERE id = request_record.id
    AND organization_id = request_record.organization_id
  RETURNING *
  INTO updated_request;

  PERFORM public.record_change_request_event_internal(
    target_organization_id,
    request_record.id,
    target_record.id,
    'request_applied',
    'success',
    jsonb_build_object(
      'status', 'applied',
      'schedule_block_id', request_record.schedule_block_id,
      'source_assignment_id', source_assignment.id,
      'applied_assignment_id', destination_assignment.id,
      'target_coach_profile_id', target_record.target_coach_profile_id
    ),
    NULL
  );

  RETURN updated_request;
END;
$$;

-- ============================================================
-- Grants
-- ============================================================

REVOKE ALL ON FUNCTION public.record_change_request_application_failure_internal(
  uuid,
  uuid,
  uuid,
  text,
  text,
  jsonb
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.change_request_current_actor_is_requester(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.approve_change_request(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_change_request(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_change_request(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.expire_change_request(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_approved_change_request(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.approve_change_request(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_change_request(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_change_request(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.expire_change_request(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_approved_change_request(uuid, uuid) TO authenticated;
