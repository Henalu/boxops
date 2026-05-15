-- BoxOps - I.2 safe change request foundation
-- Creates the first tenant-scoped workflow base for coach change/coverage
-- requests. This does not apply changes to the real schedule yet.

-- ============================================================
-- Helpers
-- ============================================================

CREATE OR REPLACE FUNCTION public.change_request_summary_is_safe(
  target_summary text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    target_summary IS NULL
    OR (
      length(btrim(target_summary)) BETWEEN 1 AND 160
      AND target_summary !~* '(https?://|www[.]|data:|base64|token|secret|password|credential|signed-url|signed_url|storage/v1|document|documento|payroll|salary|nomina|iban|dni|nif|ssn|national_id|geolocation|gps|latitude|longitude|coordinate|ubicacion|location|vacacion|permiso|baja|salud|health|medical)'
    );
$$;

CREATE OR REPLACE FUNCTION public.change_request_changed_fields_is_safe(
  target_changed_fields jsonb
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  WITH RECURSIVE walk(key_name, value) AS (
    SELECT entry.key, entry.value
    FROM jsonb_each(
      CASE
        WHEN jsonb_typeof(target_changed_fields) = 'object' THEN target_changed_fields
        ELSE '{}'::jsonb
      END
    ) AS entry(key, value)

    UNION ALL

    SELECT nested.key, nested.value
    FROM walk
    CROSS JOIN LATERAL jsonb_each(
      CASE
        WHEN jsonb_typeof(walk.value) = 'object' THEN walk.value
        ELSE '{}'::jsonb
      END
    ) AS nested(key, value)
  )
  SELECT
    target_changed_fields IS NOT NULL
    AND jsonb_typeof(target_changed_fields) = 'object'
    AND pg_column_size(target_changed_fields) <= 2048
    AND NOT EXISTS (
      SELECT 1
      FROM walk
      WHERE length(key_name) > 64
        OR lower(key_name) ~ '(content|body|html|raw|base64|url|uri|path|token|secret|signature|document|storage|password|credential|cookie|session|ip|fingerprint|latitude|longitude|coordinate|geolocation|gps|location|payroll|salary|iban|bank|ssn|national_id|nif|dni)'
        OR jsonb_typeof(value) = 'array'
        OR (
          jsonb_typeof(value) = 'string'
          AND (
            length(value #>> '{}') > 128
            OR (value #>> '{}') ~* '(https?://|data:|storage/v1|base64|-----BEGIN|signed-url|signed_url|@[^[:space:]]+[.][^[:space:]]+)'
          )
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_change_requests(
  target_organization_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_org_role(target_organization_id, ARRAY['owner', 'admin', 'manager']);
$$;

CREATE OR REPLACE FUNCTION public.change_request_coach_is_assignable(
  target_organization_id uuid,
  target_coach_profile_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.coach_profiles coach_profile
    LEFT JOIN public.person_profiles person_profile
      ON person_profile.id = coach_profile.person_profile_id
     AND person_profile.organization_id = coach_profile.organization_id
    WHERE coach_profile.organization_id = target_organization_id
      AND coach_profile.id = target_coach_profile_id
      AND coach_profile.status = 'active'
      AND (
        coach_profile.person_profile_id IS NULL
        OR (
          person_profile.id IS NOT NULL
          AND person_profile.status = 'active'
          AND person_profile.visibility_status = 'visible'
        )
      )
      AND EXISTS (
        SELECT 1
        FROM public.organization_memberships membership
        WHERE membership.organization_id = target_organization_id
          AND membership.status = 'active'
          AND (
            (coach_profile.user_id IS NOT NULL AND membership.user_id = coach_profile.user_id)
            OR (person_profile.user_id IS NOT NULL AND membership.user_id = person_profile.user_id)
          )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.change_request_coach_belongs_to_current_user(
  target_organization_id uuid,
  target_coach_profile_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.coach_profiles coach_profile
    LEFT JOIN public.person_profiles person_profile
      ON person_profile.id = coach_profile.person_profile_id
     AND person_profile.organization_id = coach_profile.organization_id
    WHERE coach_profile.organization_id = target_organization_id
      AND coach_profile.id = target_coach_profile_id
      AND coach_profile.status = 'active'
      AND (
        coach_profile.user_id = (select auth.uid())
        OR person_profile.user_id = (select auth.uid())
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.change_request_coach_has_block_overlap(
  target_organization_id uuid,
  target_coach_profile_id uuid,
  target_schedule_block_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH target_block AS (
    SELECT
      block.id,
      block.service_date,
      block.start_time,
      block.end_time
    FROM public.schedule_blocks block
    WHERE block.organization_id = target_organization_id
      AND block.id = target_schedule_block_id
      AND public.schedule_block_accepts_active_assignment(block.status)
  )
  SELECT EXISTS (
    SELECT 1
    FROM target_block
    INNER JOIN public.schedule_block_assignments assignment
      ON assignment.organization_id = target_organization_id
     AND assignment.coach_profile_id = target_coach_profile_id
     AND assignment.assignment_status = 'assigned'
    INNER JOIN public.schedule_blocks block
      ON block.id = assignment.schedule_block_id
     AND block.organization_id = assignment.organization_id
    WHERE assignment.schedule_block_id <> target_block.id
      AND public.schedule_block_accepts_active_assignment(block.status)
      AND block.service_date = target_block.service_date
      AND block.start_time < target_block.end_time
      AND target_block.start_time < block.end_time
  );
$$;

-- ============================================================
-- Tables
-- ============================================================

CREATE TABLE public.change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  requester_membership_id uuid NOT NULL,
  requester_person_profile_id uuid NOT NULL,
  requester_coach_profile_id uuid NOT NULL,
  schedule_block_id uuid NOT NULL,
  schedule_block_assignment_id uuid NOT NULL,
  request_type text NOT NULL
    CHECK (request_type IN (
      'own_block_change',
      'direct_coverage_request',
      'open_coverage_request',
      'coverage_request',
      'swap',
      'offer_block'
    )),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'draft',
      'pending',
      'offered',
      'accepted_by_coach',
      'rejected_by_coach',
      'pending_approval',
      'approved',
      'rejected',
      'applied',
      'cancelled',
      'expired'
    )),
  approval_required boolean NOT NULL DEFAULT true,
  accepted_target_id uuid,
  applied_schedule_block_assignment_id uuid,
  reason_summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  resolved_at timestamptz,
  applied_at timestamptz,
  UNIQUE (id, organization_id),
  FOREIGN KEY (requester_membership_id, organization_id)
    REFERENCES public.organization_memberships(id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (requester_person_profile_id, organization_id)
    REFERENCES public.person_profiles(id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (requester_coach_profile_id, organization_id)
    REFERENCES public.coach_profiles(id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (schedule_block_id, organization_id)
    REFERENCES public.schedule_blocks(id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (schedule_block_assignment_id, organization_id)
    REFERENCES public.schedule_block_assignments(id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (applied_schedule_block_assignment_id, organization_id)
    REFERENCES public.schedule_block_assignments(id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT change_requests_reason_summary_safe
    CHECK (public.change_request_summary_is_safe(reason_summary)),
  CONSTRAINT change_requests_expiry_window
    CHECK (
      expires_at IS NULL
      OR (
        expires_at > created_at
        AND expires_at <= created_at + interval '30 days'
      )
    ),
  CONSTRAINT change_requests_accepted_target_required
    CHECK (
      status NOT IN ('accepted_by_coach', 'pending_approval', 'approved', 'applied')
      OR accepted_target_id IS NOT NULL
    ),
  CONSTRAINT change_requests_applied_fields_required
    CHECK (
      status <> 'applied'
      OR (
        applied_at IS NOT NULL
        AND applied_schedule_block_assignment_id IS NOT NULL
      )
    )
);

CREATE TABLE public.change_request_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  change_request_id uuid NOT NULL,
  target_coach_profile_id uuid NOT NULL,
  target_type text NOT NULL DEFAULT 'direct_coach'
    CHECK (target_type IN ('direct_coach', 'open_candidate', 'suggested_candidate')),
  status text NOT NULL DEFAULT 'offered'
    CHECK (status IN ('offered', 'accepted', 'rejected', 'withdrawn', 'expired')),
  response_note_summary text,
  offered_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  expires_at timestamptz,
  UNIQUE (id, organization_id),
  UNIQUE (organization_id, change_request_id, target_coach_profile_id),
  FOREIGN KEY (change_request_id, organization_id)
    REFERENCES public.change_requests(id, organization_id)
    ON DELETE CASCADE,
  FOREIGN KEY (target_coach_profile_id, organization_id)
    REFERENCES public.coach_profiles(id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT change_request_targets_response_note_safe
    CHECK (public.change_request_summary_is_safe(response_note_summary)),
  CONSTRAINT change_request_targets_response_timestamp
    CHECK (
      (status IN ('accepted', 'rejected') AND responded_at IS NOT NULL)
      OR (status NOT IN ('accepted', 'rejected'))
    ),
  CONSTRAINT change_request_targets_expiry_window
    CHECK (
      expires_at IS NULL
      OR (
        expires_at > offered_at
        AND expires_at <= offered_at + interval '30 days'
      )
    )
);

CREATE TABLE public.change_request_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  change_request_id uuid NOT NULL,
  change_request_target_id uuid,
  actor_user_id uuid NOT NULL,
  actor_membership_id uuid NOT NULL,
  actor_person_profile_id uuid,
  actor_coach_profile_id uuid,
  event_type text NOT NULL
    CHECK (event_type IN (
      'request_created',
      'request_offered',
      'target_accepted',
      'target_rejected',
      'approval_requested',
      'request_approved',
      'request_rejected',
      'request_cancelled',
      'request_expired',
      'request_applied',
      'application_failed'
    )),
  result text NOT NULL DEFAULT 'success'
    CHECK (result IN ('success', 'failed', 'denied')),
  changed_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  retain_until timestamptz NOT NULL,
  UNIQUE (id, organization_id),
  FOREIGN KEY (change_request_id, organization_id)
    REFERENCES public.change_requests(id, organization_id)
    ON DELETE CASCADE,
  FOREIGN KEY (change_request_target_id, organization_id)
    REFERENCES public.change_request_targets(id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, actor_user_id)
    REFERENCES public.organization_memberships(organization_id, user_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (actor_membership_id, organization_id)
    REFERENCES public.organization_memberships(id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (actor_person_profile_id, organization_id)
    REFERENCES public.person_profiles(id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (actor_coach_profile_id, organization_id)
    REFERENCES public.coach_profiles(id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT change_request_events_changed_fields_safe
    CHECK (public.change_request_changed_fields_is_safe(changed_fields)),
  CONSTRAINT change_request_events_retain_window
    CHECK (
      retain_until > created_at
      AND retain_until <= created_at + interval '90 days'
    )
);

CREATE INDEX change_requests_org_status_idx
  ON public.change_requests (organization_id, status, created_at DESC);

CREATE INDEX change_requests_block_idx
  ON public.change_requests (organization_id, schedule_block_id, created_at DESC);

CREATE INDEX change_requests_requester_idx
  ON public.change_requests (organization_id, requester_coach_profile_id, created_at DESC);

CREATE INDEX change_request_targets_request_idx
  ON public.change_request_targets (organization_id, change_request_id, status);

CREATE INDEX change_request_targets_coach_idx
  ON public.change_request_targets (organization_id, target_coach_profile_id, status, offered_at DESC);

CREATE INDEX change_request_events_request_idx
  ON public.change_request_events (organization_id, change_request_id, created_at DESC);

CREATE INDEX change_request_events_actor_idx
  ON public.change_request_events (organization_id, actor_user_id, created_at DESC);

CREATE INDEX change_request_events_retain_until_idx
  ON public.change_request_events (retain_until);

CREATE TRIGGER change_requests_set_updated_at
  BEFORE UPDATE ON public.change_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- Validation
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
BEGIN
  SELECT membership.*
  INTO requester_membership
  FROM public.organization_memberships membership
  WHERE membership.id = NEW.requester_membership_id
    AND membership.organization_id = NEW.organization_id
    AND membership.status = 'active';

  IF requester_membership.id IS NULL THEN
    RAISE EXCEPTION 'active requester membership is required';
  END IF;

  SELECT person_profile.*
  INTO requester_person
  FROM public.person_profiles person_profile
  WHERE person_profile.id = NEW.requester_person_profile_id
    AND person_profile.organization_id = NEW.organization_id
    AND person_profile.status = 'active'
    AND person_profile.visibility_status = 'visible';

  IF requester_person.id IS NULL THEN
    RAISE EXCEPTION 'active requester person profile is required';
  END IF;

  IF requester_person.user_id IS DISTINCT FROM requester_membership.user_id THEN
    RAISE EXCEPTION 'requester person must match requester membership';
  END IF;

  SELECT coach_profile.*
  INTO requester_coach
  FROM public.coach_profiles coach_profile
  WHERE coach_profile.id = NEW.requester_coach_profile_id
    AND coach_profile.organization_id = NEW.organization_id
    AND coach_profile.status = 'active';

  IF requester_coach.id IS NULL THEN
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

  IF NOT public.change_request_coach_is_assignable(
    NEW.organization_id,
    NEW.target_coach_profile_id
  ) THEN
    RAISE EXCEPTION 'target coach is not assignable';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_change_request_event_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  target_request_id uuid;
BEGIN
  IF NEW.change_request_target_id IS NOT NULL THEN
    SELECT target.change_request_id
    INTO target_request_id
    FROM public.change_request_targets target
    WHERE target.id = NEW.change_request_target_id
      AND target.organization_id = NEW.organization_id;

    IF target_request_id IS DISTINCT FROM NEW.change_request_id THEN
      RAISE EXCEPTION 'event target must belong to the event request';
    END IF;
  END IF;

  IF NEW.actor_person_profile_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.person_profiles person_profile
      WHERE person_profile.id = NEW.actor_person_profile_id
        AND person_profile.organization_id = NEW.organization_id
        AND person_profile.user_id = NEW.actor_user_id
    ) THEN
    RAISE EXCEPTION 'event actor person must match actor user';
  END IF;

  IF NEW.actor_coach_profile_id IS NOT NULL
    AND NOT public.change_request_coach_belongs_to_current_user(
      NEW.organization_id,
      NEW.actor_coach_profile_id
    ) THEN
    RAISE EXCEPTION 'event actor coach must match current user';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER change_requests_validate_row
  BEFORE INSERT OR UPDATE ON public.change_requests
  FOR EACH ROW EXECUTE FUNCTION public.validate_change_request_row();

CREATE TRIGGER change_request_targets_validate_row
  BEFORE INSERT OR UPDATE ON public.change_request_targets
  FOR EACH ROW EXECUTE FUNCTION public.validate_change_request_target_row();

CREATE TRIGGER change_request_events_validate_row
  BEFORE INSERT OR UPDATE ON public.change_request_events
  FOR EACH ROW EXECUTE FUNCTION public.validate_change_request_event_row();

-- ============================================================
-- Read permission helper
-- ============================================================

CREATE OR REPLACE FUNCTION public.can_read_change_request(
  target_organization_id uuid,
  target_change_request_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := (select auth.uid());
  own_person_profile_id uuid;
BEGIN
  IF current_user_id IS NULL THEN
    RETURN false;
  END IF;

  IF public.can_manage_change_requests(target_organization_id) THEN
    RETURN true;
  END IF;

  own_person_profile_id := public.get_own_person_profile_id(target_organization_id);

  RETURN EXISTS (
    SELECT 1
    FROM public.change_requests request
    WHERE request.id = target_change_request_id
      AND request.organization_id = target_organization_id
      AND (
        request.requester_person_profile_id = own_person_profile_id
        OR EXISTS (
          SELECT 1
          FROM public.change_request_targets target
          WHERE target.organization_id = request.organization_id
            AND target.change_request_id = request.id
            AND public.change_request_coach_belongs_to_current_user(
              target.organization_id,
              target.target_coach_profile_id
            )
        )
      )
  );
END;
$$;

-- ============================================================
-- Internal event helper
-- ============================================================

CREATE OR REPLACE FUNCTION public.record_change_request_event_internal(
  target_organization_id uuid,
  target_change_request_id uuid,
  target_change_request_target_id uuid,
  target_event_type text,
  target_result text,
  target_changed_fields jsonb,
  target_actor_coach_profile_id uuid
)
RETURNS public.change_request_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := (select auth.uid());
  current_membership public.organization_memberships;
  own_person_profile_id uuid;
  normalized_event_type text := lower(btrim(COALESCE(target_event_type, '')));
  normalized_result text := lower(btrim(COALESCE(target_result, 'success')));
  normalized_changed_fields jsonb := COALESCE(target_changed_fields, '{}'::jsonb);
  created_event public.change_request_events;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF normalized_event_type NOT IN (
    'request_created',
    'request_offered',
    'target_accepted',
    'target_rejected',
    'approval_requested',
    'request_approved',
    'request_rejected',
    'request_cancelled',
    'request_expired',
    'request_applied',
    'application_failed'
  ) THEN
    RAISE EXCEPTION 'change request event type is not allowed';
  END IF;

  IF normalized_result NOT IN ('success', 'failed', 'denied') THEN
    RAISE EXCEPTION 'change request event result is not allowed';
  END IF;

  IF NOT public.change_request_changed_fields_is_safe(normalized_changed_fields) THEN
    RAISE EXCEPTION 'change request event changed fields are not allowed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.change_requests request
    WHERE request.id = target_change_request_id
      AND request.organization_id = target_organization_id
  ) THEN
    RAISE EXCEPTION 'change request was not found in tenant';
  END IF;

  IF target_change_request_target_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.change_request_targets target
      WHERE target.id = target_change_request_target_id
        AND target.organization_id = target_organization_id
        AND target.change_request_id = target_change_request_id
    ) THEN
    RAISE EXCEPTION 'change request target was not found in tenant';
  END IF;

  SELECT membership.*
  INTO current_membership
  FROM public.organization_memberships membership
  WHERE membership.organization_id = target_organization_id
    AND membership.user_id = current_user_id
    AND membership.status = 'active'
  LIMIT 1;

  IF current_membership.id IS NULL THEN
    RAISE EXCEPTION 'active membership required';
  END IF;

  IF target_actor_coach_profile_id IS NOT NULL
    AND NOT public.change_request_coach_belongs_to_current_user(
      target_organization_id,
      target_actor_coach_profile_id
    ) THEN
    RAISE EXCEPTION 'actor coach does not belong to current user';
  END IF;

  own_person_profile_id := public.get_own_person_profile_id(target_organization_id);

  INSERT INTO public.change_request_events (
    organization_id,
    change_request_id,
    change_request_target_id,
    actor_user_id,
    actor_membership_id,
    actor_person_profile_id,
    actor_coach_profile_id,
    event_type,
    result,
    changed_fields,
    retain_until
  )
  VALUES (
    target_organization_id,
    target_change_request_id,
    target_change_request_target_id,
    current_user_id,
    current_membership.id,
    own_person_profile_id,
    target_actor_coach_profile_id,
    normalized_event_type,
    normalized_result,
    normalized_changed_fields,
    now() + interval '90 days'
  )
  RETURNING *
  INTO created_event;

  RETURN created_event;
END;
$$;

-- ============================================================
-- RPCs
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_own_change_request(
  target_organization_id uuid,
  target_schedule_block_id uuid,
  target_schedule_block_assignment_id uuid,
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
  current_user_id uuid := (select auth.uid());
  current_membership_id uuid;
  own_person_profile_id uuid;
  normalized_request_type text := lower(btrim(COALESCE(target_request_type, 'coverage_request')));
  normalized_reason_summary text := NULLIF(btrim(COALESCE(target_reason_summary, '')), '');
  source_assignment record;
  target_block record;
  created_request public.change_requests;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  current_membership_id := public.get_active_membership_id(target_organization_id);
  own_person_profile_id := public.get_own_person_profile_id(target_organization_id);

  IF current_membership_id IS NULL OR own_person_profile_id IS NULL THEN
    RAISE EXCEPTION 'active membership and linked person profile required';
  END IF;

  IF normalized_request_type NOT IN (
    'own_block_change',
    'direct_coverage_request',
    'open_coverage_request',
    'coverage_request',
    'offer_block'
  ) THEN
    RAISE EXCEPTION 'change request type is not enabled for own requests';
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

  SELECT
    assignment.id,
    assignment.organization_id,
    assignment.schedule_block_id,
    assignment.coach_profile_id,
    assignment.assignment_status
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

  IF NOT public.change_request_coach_belongs_to_current_user(
    target_organization_id,
    source_assignment.coach_profile_id
  ) THEN
    RAISE EXCEPTION 'source assignment does not belong to current coach';
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
  WHERE block.id = target_schedule_block_id
    AND block.organization_id = target_organization_id
  FOR SHARE;

  IF target_block.id IS NULL THEN
    RAISE EXCEPTION 'schedule block was not found in tenant';
  END IF;

  IF NOT public.schedule_block_accepts_active_assignment(target_block.status) THEN
    RAISE EXCEPTION 'schedule block is not actionable';
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
    current_membership_id,
    own_person_profile_id,
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
      'schedule_block_assignment_id', target_schedule_block_assignment_id
    ),
    source_assignment.coach_profile_id
  );

  RETURN created_request;
END;
$$;

CREATE OR REPLACE FUNCTION public.offer_change_request_to_coach(
  target_organization_id uuid,
  target_change_request_id uuid,
  target_coach_profile_id uuid,
  target_target_type text DEFAULT 'direct_coach',
  target_expires_at timestamptz DEFAULT NULL
)
RETURNS public.change_request_targets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  request_record public.change_requests;
  normalized_target_type text := lower(btrim(COALESCE(target_target_type, 'direct_coach')));
  target_block record;
  actor_coach_profile_id uuid;
  created_target public.change_request_targets;
BEGIN
  IF (select auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF normalized_target_type NOT IN ('direct_coach', 'open_candidate', 'suggested_candidate') THEN
    RAISE EXCEPTION 'change request target type is not allowed';
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

  IF request_record.status NOT IN ('pending', 'offered') THEN
    RAISE EXCEPTION 'change request is not open for targets';
  END IF;

  IF request_record.expires_at IS NOT NULL AND request_record.expires_at <= now() THEN
    RAISE EXCEPTION 'change request has expired';
  END IF;

  IF NOT public.can_manage_change_requests(target_organization_id)
    AND NOT public.change_request_coach_belongs_to_current_user(
      target_organization_id,
      request_record.requester_coach_profile_id
    ) THEN
    RAISE EXCEPTION 'change request offer permission required';
  END IF;

  IF target_coach_profile_id = request_record.requester_coach_profile_id THEN
    RAISE EXCEPTION 'requester coach cannot be a target';
  END IF;

  IF NOT public.change_request_coach_is_assignable(
    target_organization_id,
    target_coach_profile_id
  ) THEN
    RAISE EXCEPTION 'target coach is not assignable';
  END IF;

  SELECT
    block.id,
    block.service_date,
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

  IF EXISTS (
    SELECT 1
    FROM public.schedule_block_assignments assignment
    WHERE assignment.organization_id = target_organization_id
      AND assignment.schedule_block_id = request_record.schedule_block_id
      AND assignment.coach_profile_id = target_coach_profile_id
      AND assignment.assignment_status = 'assigned'
  ) THEN
    RAISE EXCEPTION 'target coach is already assigned to this block';
  END IF;

  IF public.change_request_coach_has_block_overlap(
    target_organization_id,
    target_coach_profile_id,
    request_record.schedule_block_id
  ) THEN
    RAISE EXCEPTION 'coach-unavailable'
      USING ERRCODE = '23P01';
  END IF;

  IF target_expires_at IS NOT NULL
    AND (
      target_expires_at <= now()
      OR target_expires_at > now() + interval '30 days'
      OR (
        request_record.expires_at IS NOT NULL
        AND target_expires_at > request_record.expires_at
      )
    ) THEN
    RAISE EXCEPTION 'change request target expiry is outside the allowed window';
  END IF;

  INSERT INTO public.change_request_targets (
    organization_id,
    change_request_id,
    target_coach_profile_id,
    target_type,
    status,
    expires_at
  )
  VALUES (
    target_organization_id,
    target_change_request_id,
    target_coach_profile_id,
    normalized_target_type,
    'offered',
    target_expires_at
  )
  RETURNING *
  INTO created_target;

  UPDATE public.change_requests
  SET status = 'offered'
  WHERE id = request_record.id
    AND organization_id = request_record.organization_id;

  actor_coach_profile_id := CASE
    WHEN public.change_request_coach_belongs_to_current_user(
      target_organization_id,
      request_record.requester_coach_profile_id
    )
    THEN request_record.requester_coach_profile_id
    ELSE NULL
  END;

  PERFORM public.record_change_request_event_internal(
    target_organization_id,
    target_change_request_id,
    created_target.id,
    'request_offered',
    'success',
    jsonb_build_object(
      'status', 'offered',
      'target_type', normalized_target_type,
      'target_coach_profile_id', target_coach_profile_id
    ),
    actor_coach_profile_id
  );

  RETURN created_target;
END;
$$;

CREATE OR REPLACE FUNCTION public.respond_to_change_request_target(
  target_organization_id uuid,
  target_change_request_target_id uuid,
  target_response text,
  target_response_note_summary text DEFAULT NULL
)
RETURNS public.change_request_targets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized_response text := lower(btrim(COALESCE(target_response, '')));
  normalized_note_summary text := NULLIF(btrim(COALESCE(target_response_note_summary, '')), '');
  target_record public.change_request_targets;
  request_record public.change_requests;
  target_block record;
  remaining_open_targets integer;
  updated_target public.change_request_targets;
BEGIN
  IF (select auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF normalized_response NOT IN ('accepted', 'rejected') THEN
    RAISE EXCEPTION 'change request response is not allowed';
  END IF;

  IF NOT public.change_request_summary_is_safe(normalized_note_summary) THEN
    RAISE EXCEPTION 'change request response note is not allowed';
  END IF;

  SELECT target.*
  INTO target_record
  FROM public.change_request_targets target
  WHERE target.id = target_change_request_target_id
    AND target.organization_id = target_organization_id
  FOR UPDATE;

  IF target_record.id IS NULL THEN
    RAISE EXCEPTION 'change request target was not found in tenant';
  END IF;

  SELECT request.*
  INTO request_record
  FROM public.change_requests request
  WHERE request.id = target_record.change_request_id
    AND request.organization_id = target_organization_id
  FOR UPDATE;

  IF request_record.id IS NULL THEN
    RAISE EXCEPTION 'change request was not found in tenant';
  END IF;

  IF target_record.status <> 'offered' THEN
    RAISE EXCEPTION 'change request target is not awaiting response';
  END IF;

  IF request_record.status NOT IN ('pending', 'offered') THEN
    RAISE EXCEPTION 'change request is not awaiting coach response';
  END IF;

  IF request_record.expires_at IS NOT NULL AND request_record.expires_at <= now() THEN
    RAISE EXCEPTION 'change request has expired';
  END IF;

  IF target_record.expires_at IS NOT NULL AND target_record.expires_at <= now() THEN
    RAISE EXCEPTION 'change request target has expired';
  END IF;

  IF NOT public.change_request_coach_belongs_to_current_user(
    target_organization_id,
    target_record.target_coach_profile_id
  ) THEN
    RAISE EXCEPTION 'change request target does not belong to current coach';
  END IF;

  IF normalized_response = 'accepted' THEN
    SELECT
      block.id,
      block.service_date,
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

    PERFORM public.lock_schedule_coach_assignment_window(
      target_organization_id,
      target_record.target_coach_profile_id,
      target_block.service_date
    );

    IF EXISTS (
      SELECT 1
      FROM public.schedule_block_assignments assignment
      WHERE assignment.organization_id = target_organization_id
        AND assignment.schedule_block_id = request_record.schedule_block_id
        AND assignment.coach_profile_id = target_record.target_coach_profile_id
        AND assignment.assignment_status = 'assigned'
    ) THEN
      RAISE EXCEPTION 'target coach is already assigned to this block';
    END IF;

    IF public.change_request_coach_has_block_overlap(
      target_organization_id,
      target_record.target_coach_profile_id,
      request_record.schedule_block_id
    ) THEN
      RAISE EXCEPTION 'coach-unavailable'
        USING ERRCODE = '23P01';
    END IF;

    UPDATE public.change_request_targets
    SET
      status = 'accepted',
      response_note_summary = normalized_note_summary,
      responded_at = now()
    WHERE id = target_record.id
      AND organization_id = target_record.organization_id
    RETURNING *
    INTO updated_target;

    UPDATE public.change_request_targets
    SET status = 'withdrawn'
    WHERE organization_id = target_organization_id
      AND change_request_id = request_record.id
      AND id <> target_record.id
      AND status = 'offered';

    UPDATE public.change_requests
    SET
      accepted_target_id = target_record.id,
      status = CASE
        WHEN approval_required THEN 'pending_approval'
        ELSE 'accepted_by_coach'
      END
    WHERE id = request_record.id
      AND organization_id = request_record.organization_id;

    PERFORM public.record_change_request_event_internal(
      target_organization_id,
      request_record.id,
      target_record.id,
      'target_accepted',
      'success',
      jsonb_build_object(
        'status', 'accepted',
        'target_coach_profile_id', target_record.target_coach_profile_id
      ),
      target_record.target_coach_profile_id
    );

    IF request_record.approval_required THEN
      PERFORM public.record_change_request_event_internal(
        target_organization_id,
        request_record.id,
        target_record.id,
        'approval_requested',
        'success',
        jsonb_build_object('status', 'pending_approval'),
        target_record.target_coach_profile_id
      );
    END IF;

    RETURN updated_target;
  END IF;

  UPDATE public.change_request_targets
  SET
    status = 'rejected',
    response_note_summary = normalized_note_summary,
    responded_at = now()
  WHERE id = target_record.id
    AND organization_id = target_record.organization_id
  RETURNING *
  INTO updated_target;

  SELECT count(*)
  INTO remaining_open_targets
  FROM public.change_request_targets target
  WHERE target.organization_id = target_organization_id
    AND target.change_request_id = request_record.id
    AND target.status = 'offered';

  IF remaining_open_targets = 0 THEN
    UPDATE public.change_requests
    SET
      status = 'rejected_by_coach',
      resolved_at = now()
    WHERE id = request_record.id
      AND organization_id = request_record.organization_id;
  END IF;

  PERFORM public.record_change_request_event_internal(
    target_organization_id,
    request_record.id,
    target_record.id,
    'target_rejected',
    'success',
    jsonb_build_object(
      'status', 'rejected',
      'target_coach_profile_id', target_record.target_coach_profile_id
    ),
    target_record.target_coach_profile_id
  );

  RETURN updated_target;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_change_request_event(
  target_organization_id uuid,
  target_change_request_id uuid,
  target_event_type text,
  target_result text DEFAULT 'failed',
  target_changed_fields jsonb DEFAULT '{}'::jsonb,
  target_change_request_target_id uuid DEFAULT NULL
)
RETURNS public.change_request_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized_event_type text := lower(btrim(COALESCE(target_event_type, '')));
  normalized_result text := lower(btrim(COALESCE(target_result, 'failed')));
BEGIN
  IF normalized_event_type <> 'application_failed' THEN
    RAISE EXCEPTION 'only minimized failure events can be recorded directly';
  END IF;

  IF normalized_result NOT IN ('failed', 'denied') THEN
    RAISE EXCEPTION 'direct change request events must be failed or denied';
  END IF;

  IF NOT public.can_read_change_request(
    target_organization_id,
    target_change_request_id
  ) THEN
    RAISE EXCEPTION 'change request event permission required';
  END IF;

  RETURN public.record_change_request_event_internal(
    target_organization_id,
    target_change_request_id,
    target_change_request_target_id,
    normalized_event_type,
    normalized_result,
    target_changed_fields,
    NULL
  );
END;
$$;

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE public.change_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.change_request_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.change_request_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Involved members can read change requests"
  ON public.change_requests FOR SELECT TO authenticated
  USING (public.can_read_change_request(organization_id, id));

CREATE POLICY "Involved members can read change request targets"
  ON public.change_request_targets FOR SELECT TO authenticated
  USING (public.can_read_change_request(organization_id, change_request_id));

CREATE POLICY "Involved members can read retained change request events"
  ON public.change_request_events FOR SELECT TO authenticated
  USING (
    retain_until > now()
    AND public.can_read_change_request(organization_id, change_request_id)
  );

-- ============================================================
-- Grants
-- ============================================================

REVOKE ALL ON public.change_requests FROM PUBLIC;
REVOKE ALL ON public.change_request_targets FROM PUBLIC;
REVOKE ALL ON public.change_request_events FROM PUBLIC;

GRANT SELECT ON public.change_requests TO authenticated;
GRANT SELECT ON public.change_request_targets TO authenticated;
GRANT SELECT ON public.change_request_events TO authenticated;

REVOKE ALL ON FUNCTION public.change_request_summary_is_safe(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.change_request_changed_fields_is_safe(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_change_requests(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.change_request_coach_is_assignable(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.change_request_coach_belongs_to_current_user(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.change_request_coach_has_block_overlap(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_change_request_row() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_change_request_target_row() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_change_request_event_row() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_read_change_request(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_change_request_event_internal(
  uuid,
  uuid,
  uuid,
  text,
  text,
  jsonb,
  uuid
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_own_change_request(
  uuid,
  uuid,
  uuid,
  text,
  text,
  timestamptz
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.offer_change_request_to_coach(
  uuid,
  uuid,
  uuid,
  text,
  timestamptz
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.respond_to_change_request_target(
  uuid,
  uuid,
  text,
  text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_change_request_event(
  uuid,
  uuid,
  text,
  text,
  jsonb,
  uuid
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.can_manage_change_requests(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_change_request(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_own_change_request(
  uuid,
  uuid,
  uuid,
  text,
  text,
  timestamptz
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.offer_change_request_to_coach(
  uuid,
  uuid,
  uuid,
  text,
  timestamptz
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_to_change_request_target(
  uuid,
  uuid,
  text,
  text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_change_request_event(
  uuid,
  uuid,
  text,
  text,
  jsonb,
  uuid
) TO authenticated;
