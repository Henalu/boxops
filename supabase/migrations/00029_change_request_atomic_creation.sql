-- BoxOps - I.7 atomic change request creation
-- Adds bounded RPCs to create a change/coverage request together with its
-- initial targets in one transaction. No UI assumptions, swap, absences,
-- payroll, push, service worker or location.

CREATE OR REPLACE FUNCTION public.create_own_change_request_with_targets(
  target_organization_id uuid,
  target_schedule_block_id uuid,
  target_schedule_block_assignment_id uuid,
  target_target_coach_profile_ids uuid[],
  target_request_type text DEFAULT 'coverage_request',
  target_reason_summary text DEFAULT NULL,
  target_expires_at timestamptz DEFAULT NULL
)
RETURNS public.change_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized_target_ids uuid[];
  target_profile_id uuid;
  unique_target_count integer;
  created_request public.change_requests;
BEGIN
  SELECT COALESCE(array_agg(target_id), ARRAY[]::uuid[])
  INTO normalized_target_ids
  FROM unnest(COALESCE(target_target_coach_profile_ids, ARRAY[]::uuid[])) AS target_ids(target_id)
  WHERE target_id IS NOT NULL;

  IF cardinality(normalized_target_ids) < 1 THEN
    RAISE EXCEPTION 'at least one target coach is required';
  END IF;

  IF cardinality(normalized_target_ids) > 10 THEN
    RAISE EXCEPTION 'too many target coaches';
  END IF;

  SELECT count(DISTINCT target_id)
  INTO unique_target_count
  FROM unnest(normalized_target_ids) AS target_ids(target_id);

  IF unique_target_count <> cardinality(normalized_target_ids) THEN
    RAISE EXCEPTION 'duplicate target coaches are not allowed';
  END IF;

  created_request := public.create_own_change_request(
    target_organization_id,
    target_schedule_block_id,
    target_schedule_block_assignment_id,
    target_request_type,
    target_reason_summary,
    target_expires_at
  );

  FOREACH target_profile_id IN ARRAY normalized_target_ids LOOP
    PERFORM public.offer_change_request_to_coach(
      target_organization_id,
      created_request.id,
      target_profile_id,
      'direct_coach',
      target_expires_at
    );
  END LOOP;

  SELECT request.*
  INTO created_request
  FROM public.change_requests request
  WHERE request.id = created_request.id
    AND request.organization_id = target_organization_id;

  RETURN created_request;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_managed_change_request_with_targets(
  target_organization_id uuid,
  target_schedule_block_id uuid,
  target_schedule_block_assignment_id uuid,
  target_target_coach_profile_ids uuid[],
  target_request_type text DEFAULT 'coverage_request',
  target_reason_summary text DEFAULT NULL,
  target_expires_at timestamptz DEFAULT NULL
)
RETURNS public.change_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized_request_type text := lower(btrim(COALESCE(target_request_type, 'coverage_request')));
  normalized_reason_summary text := NULLIF(btrim(COALESCE(target_reason_summary, '')), '');
  normalized_target_ids uuid[];
  target_profile_id uuid;
  unique_target_count integer;
  source_assignment record;
  source_coach record;
  source_person record;
  source_membership_id uuid;
  target_block record;
  actor_coach_profile_id uuid;
  created_request public.change_requests;
BEGIN
  IF (select auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF NOT public.can_manage_change_requests(target_organization_id) THEN
    RAISE EXCEPTION 'change request management permission required';
  END IF;

  IF normalized_request_type NOT IN (
    'own_block_change',
    'direct_coverage_request',
    'open_coverage_request',
    'coverage_request',
    'offer_block'
  ) THEN
    RAISE EXCEPTION 'change request type is not enabled for managed requests';
  END IF;

  IF NOT public.change_request_summary_is_safe(normalized_reason_summary) THEN
    RAISE EXCEPTION 'change request reason is not allowed';
  END IF;

  IF target_expires_at IS NOT NULL
    AND (
      target_expires_at <= now()
      OR target_expires_at > now() + interval '30 days'
    ) THEN
    RAISE EXCEPTION 'change request expiry is outside the allowed window';
  END IF;

  SELECT COALESCE(array_agg(target_id), ARRAY[]::uuid[])
  INTO normalized_target_ids
  FROM unnest(COALESCE(target_target_coach_profile_ids, ARRAY[]::uuid[])) AS target_ids(target_id)
  WHERE target_id IS NOT NULL;

  IF cardinality(normalized_target_ids) < 1 THEN
    RAISE EXCEPTION 'at least one target coach is required';
  END IF;

  IF cardinality(normalized_target_ids) > 10 THEN
    RAISE EXCEPTION 'too many target coaches';
  END IF;

  SELECT count(DISTINCT target_id)
  INTO unique_target_count
  FROM unnest(normalized_target_ids) AS target_ids(target_id);

  IF unique_target_count <> cardinality(normalized_target_ids) THEN
    RAISE EXCEPTION 'duplicate target coaches are not allowed';
  END IF;

  SELECT assignment.*
  INTO source_assignment
  FROM public.schedule_block_assignments assignment
  WHERE assignment.id = target_schedule_block_assignment_id
    AND assignment.organization_id = target_organization_id
    AND assignment.schedule_block_id = target_schedule_block_id
    AND assignment.assignment_status = 'assigned'
  FOR SHARE;

  IF source_assignment.id IS NULL THEN
    RAISE EXCEPTION 'assigned source assignment was not found in tenant';
  END IF;

  SELECT block.*
  INTO target_block
  FROM public.schedule_blocks block
  WHERE block.id = target_schedule_block_id
    AND block.organization_id = target_organization_id
  FOR SHARE;

  IF target_block.id IS NULL THEN
    RAISE EXCEPTION 'schedule block was not found in tenant';
  END IF;

  IF NOT public.schedule_block_accepts_active_assignment(target_block.status) THEN
    RAISE EXCEPTION 'schedule block is not actionable';
  END IF;

  SELECT coach_profile.*
  INTO source_coach
  FROM public.coach_profiles coach_profile
  WHERE coach_profile.id = source_assignment.coach_profile_id
    AND coach_profile.organization_id = target_organization_id
    AND coach_profile.status = 'active';

  IF source_coach.id IS NULL THEN
    RAISE EXCEPTION 'source coach is not active';
  END IF;

  SELECT person_profile.*
  INTO source_person
  FROM public.person_profiles person_profile
  WHERE person_profile.id = source_coach.person_profile_id
    AND person_profile.organization_id = target_organization_id
    AND person_profile.status = 'active'
    AND person_profile.visibility_status = 'visible';

  IF source_person.id IS NULL OR source_person.user_id IS NULL THEN
    RAISE EXCEPTION 'source coach linked person is required';
  END IF;

  SELECT membership.id
  INTO source_membership_id
  FROM public.organization_memberships membership
  WHERE membership.organization_id = target_organization_id
    AND membership.user_id = source_person.user_id
    AND membership.status = 'active'
  LIMIT 1;

  IF source_membership_id IS NULL THEN
    RAISE EXCEPTION 'source coach active membership is required';
  END IF;

  INSERT INTO public.change_requests (
    organization_id,
    requester_membership_id,
    requester_person_profile_id,
    requester_coach_profile_id,
    schedule_block_id,
    schedule_block_assignment_id,
    request_type,
    status,
    approval_required,
    reason_summary,
    expires_at
  )
  VALUES (
    target_organization_id,
    source_membership_id,
    source_person.id,
    source_assignment.coach_profile_id,
    target_schedule_block_id,
    target_schedule_block_assignment_id,
    normalized_request_type,
    'pending',
    true,
    normalized_reason_summary,
    target_expires_at
  )
  RETURNING *
  INTO created_request;

  actor_coach_profile_id := CASE
    WHEN public.change_request_coach_belongs_to_current_user(
      target_organization_id,
      source_assignment.coach_profile_id
    )
    THEN source_assignment.coach_profile_id
    ELSE NULL
  END;

  PERFORM public.record_change_request_event_internal(
    target_organization_id,
    created_request.id,
    NULL,
    'request_created',
    'success',
    jsonb_build_object(
      'status', 'pending',
      'request_type', normalized_request_type,
      'schedule_block_id', target_schedule_block_id,
      'schedule_block_assignment_id', target_schedule_block_assignment_id,
      'created_by_management', true
    ),
    actor_coach_profile_id
  );

  FOREACH target_profile_id IN ARRAY normalized_target_ids LOOP
    PERFORM public.offer_change_request_to_coach(
      target_organization_id,
      created_request.id,
      target_profile_id,
      'direct_coach',
      target_expires_at
    );
  END LOOP;

  SELECT request.*
  INTO created_request
  FROM public.change_requests request
  WHERE request.id = created_request.id
    AND request.organization_id = target_organization_id;

  RETURN created_request;
END;
$$;

REVOKE ALL ON FUNCTION public.create_own_change_request_with_targets(
  uuid,
  uuid,
  uuid,
  uuid[],
  text,
  text,
  timestamptz
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_managed_change_request_with_targets(
  uuid,
  uuid,
  uuid,
  uuid[],
  text,
  text,
  timestamptz
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_own_change_request_with_targets(
  uuid,
  uuid,
  uuid,
  uuid[],
  text,
  text,
  timestamptz
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_managed_change_request_with_targets(
  uuid,
  uuid,
  uuid,
  uuid[],
  text,
  text,
  timestamptz
) TO authenticated;
