-- BoxOps - I.21 overtime candidates foundation
-- Tenant-scoped technical base for operational excess signals. This cut keeps
-- planning, time records and future finalization separated.

-- ============================================================
-- Helpers
-- ============================================================

CREATE OR REPLACE FUNCTION public.can_review_overtime_candidates(
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

CREATE OR REPLACE FUNCTION public.overtime_candidate_changed_fields_is_safe(
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
        OR lower(key_name) ~ '(content|body|html|raw|base64|url|uri|path|token|secret|signature|storage|password|credential|cookie|session|ip|fingerprint|latitude|longitude|coordinate|geolocation|gps|location)'
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

-- ============================================================
-- Tables
-- ============================================================

CREATE TABLE public.overtime_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  person_profile_id uuid NOT NULL,
  period_start_date date NOT NULL,
  period_end_date date NOT NULL,
  timezone text NOT NULL,
  detection_source text NOT NULL DEFAULT 'manual_signal'
    CHECK (detection_source IN (
      'manual_signal',
      'time_difference',
      'schedule_difference',
      'weekly_review',
      'event_context',
      'absence_context',
      'staff_work_window_context'
    )),
  planned_minutes_snapshot integer NOT NULL
    CHECK (planned_minutes_snapshot BETWEEN 0 AND 527040),
  worked_minutes_snapshot integer NOT NULL
    CHECK (worked_minutes_snapshot BETWEEN 0 AND 527040),
  candidate_minutes integer GENERATED ALWAYS AS (
    GREATEST(worked_minutes_snapshot - planned_minutes_snapshot, 0)
  ) STORED,
  status text NOT NULL DEFAULT 'detected'
    CHECK (status IN (
      'detected',
      'needs_review',
      'under_review',
      'operationally_validated',
      'operationally_rejected',
      'superseded',
      'closed'
    )),
  created_by_membership_id uuid NOT NULL,
  reviewed_by_membership_id uuid,
  reviewed_at timestamptz,
  closed_at timestamptz,
  retain_until timestamptz NOT NULL DEFAULT now() + interval '24 months',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id),
  FOREIGN KEY (person_profile_id, organization_id)
    REFERENCES public.person_profiles(id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (created_by_membership_id, organization_id)
    REFERENCES public.organization_memberships(id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (reviewed_by_membership_id, organization_id)
    REFERENCES public.organization_memberships(id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT overtime_candidates_date_range
    CHECK (
      period_start_date <= period_end_date
      AND period_end_date <= period_start_date + 366
    ),
  CONSTRAINT overtime_candidates_timezone_not_blank
    CHECK (length(btrim(timezone)) > 0 AND length(timezone) <= 80),
  CONSTRAINT overtime_candidates_positive_difference
    CHECK (worked_minutes_snapshot > planned_minutes_snapshot),
  CONSTRAINT overtime_candidates_review_fields
    CHECK (
      status NOT IN (
        'under_review',
        'operationally_validated',
        'operationally_rejected',
        'superseded',
        'closed'
      )
      OR reviewed_by_membership_id IS NOT NULL
    ),
  CONSTRAINT overtime_candidates_reviewed_timestamp
    CHECK (
      status NOT IN ('operationally_validated', 'operationally_rejected')
      OR reviewed_at IS NOT NULL
    ),
  CONSTRAINT overtime_candidates_closed_timestamp
    CHECK (status NOT IN ('superseded', 'closed') OR closed_at IS NOT NULL),
  CONSTRAINT overtime_candidates_retain_window
    CHECK (
      retain_until > created_at
      AND retain_until <= created_at + interval '24 months' + interval '1 day'
    )
);

CREATE TABLE public.overtime_candidate_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  overtime_candidate_id uuid NOT NULL,
  source_type text NOT NULL
    CHECK (source_type IN (
      'time_record',
      'time_punch',
      'time_weekly_approval',
      'schedule_block',
      'schedule_block_assignment',
      'staff_work_window',
      'absence_request',
      'absence_request_period',
      'operational_event',
      'manual_context'
    )),
  source_id uuid,
  created_by_membership_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id),
  FOREIGN KEY (overtime_candidate_id, organization_id)
    REFERENCES public.overtime_candidates(id, organization_id)
    ON DELETE CASCADE,
  FOREIGN KEY (created_by_membership_id, organization_id)
    REFERENCES public.organization_memberships(id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT overtime_candidate_sources_reference_shape
    CHECK (
      (source_type = 'manual_context' AND source_id IS NULL)
      OR (source_type <> 'manual_context' AND source_id IS NOT NULL)
    )
);

CREATE UNIQUE INDEX overtime_candidate_sources_unique_source
  ON public.overtime_candidate_sources (
    organization_id,
    overtime_candidate_id,
    source_type,
    source_id
  )
  WHERE source_id IS NOT NULL;

CREATE UNIQUE INDEX overtime_candidate_sources_one_manual_context
  ON public.overtime_candidate_sources (organization_id, overtime_candidate_id)
  WHERE source_type = 'manual_context';

CREATE TABLE public.overtime_candidate_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  overtime_candidate_id uuid NOT NULL,
  actor_user_id uuid NOT NULL,
  actor_membership_id uuid NOT NULL,
  actor_person_profile_id uuid,
  event_type text NOT NULL
    CHECK (event_type IN (
      'candidate_detected',
      'source_added',
      'review_started',
      'status_changed',
      'operationally_validated',
      'operationally_rejected',
      'candidate_superseded',
      'candidate_closed'
    )),
  result text NOT NULL DEFAULT 'success'
    CHECK (result IN ('success', 'failed', 'denied')),
  previous_status text,
  new_status text,
  changed_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  retain_until timestamptz NOT NULL DEFAULT now() + interval '180 days',
  UNIQUE (id, organization_id),
  FOREIGN KEY (overtime_candidate_id, organization_id)
    REFERENCES public.overtime_candidates(id, organization_id)
    ON DELETE CASCADE,
  FOREIGN KEY (organization_id, actor_user_id)
    REFERENCES public.organization_memberships(organization_id, user_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (actor_membership_id, organization_id)
    REFERENCES public.organization_memberships(id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (actor_person_profile_id, organization_id)
    REFERENCES public.person_profiles(id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT overtime_candidate_events_status_values
    CHECK (
      (
        previous_status IS NULL
        OR previous_status IN (
          'detected',
          'needs_review',
          'under_review',
          'operationally_validated',
          'operationally_rejected',
          'superseded',
          'closed'
        )
      )
      AND (
        new_status IS NULL
        OR new_status IN (
          'detected',
          'needs_review',
          'under_review',
          'operationally_validated',
          'operationally_rejected',
          'superseded',
          'closed'
        )
      )
    ),
  CONSTRAINT overtime_candidate_events_changed_fields_safe
    CHECK (public.overtime_candidate_changed_fields_is_safe(changed_fields)),
  CONSTRAINT overtime_candidate_events_retain_window
    CHECK (
      retain_until > created_at
      AND retain_until <= created_at + interval '180 days' + interval '1 day'
    )
);

CREATE INDEX overtime_candidates_org_period_idx
  ON public.overtime_candidates (organization_id, period_start_date, period_end_date);

CREATE INDEX overtime_candidates_org_status_idx
  ON public.overtime_candidates (organization_id, status, created_at DESC);

CREATE INDEX overtime_candidates_person_idx
  ON public.overtime_candidates (organization_id, person_profile_id, period_start_date DESC);

CREATE INDEX overtime_candidates_retain_until_idx
  ON public.overtime_candidates (retain_until);

CREATE INDEX overtime_candidate_sources_candidate_idx
  ON public.overtime_candidate_sources (organization_id, overtime_candidate_id, source_type);

CREATE INDEX overtime_candidate_events_candidate_idx
  ON public.overtime_candidate_events (organization_id, overtime_candidate_id, created_at DESC);

CREATE INDEX overtime_candidate_events_retain_until_idx
  ON public.overtime_candidate_events (retain_until);

CREATE TRIGGER overtime_candidates_set_updated_at
  BEFORE UPDATE ON public.overtime_candidates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- Validation
-- ============================================================

CREATE OR REPLACE FUNCTION public.validate_overtime_candidate_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  subject_person public.person_profiles;
  creator_membership public.organization_memberships;
  reviewer_membership public.organization_memberships;
BEGIN
  SELECT person_profile.*
  INTO subject_person
  FROM public.person_profiles person_profile
  WHERE person_profile.id = NEW.person_profile_id
    AND person_profile.organization_id = NEW.organization_id;

  IF subject_person.id IS NULL THEN
    RAISE EXCEPTION 'overtime candidate subject person is required';
  END IF;

  IF subject_person.status <> 'active'
    OR subject_person.visibility_status <> 'visible' THEN
    RAISE EXCEPTION 'active visible subject person is required';
  END IF;

  SELECT membership.*
  INTO creator_membership
  FROM public.organization_memberships membership
  WHERE membership.id = NEW.created_by_membership_id
    AND membership.organization_id = NEW.organization_id
    AND membership.status = 'active';

  IF creator_membership.id IS NULL THEN
    RAISE EXCEPTION 'active creator membership is required';
  END IF;

  IF NEW.reviewed_by_membership_id IS NOT NULL THEN
    SELECT membership.*
    INTO reviewer_membership
    FROM public.organization_memberships membership
    WHERE membership.id = NEW.reviewed_by_membership_id
      AND membership.organization_id = NEW.organization_id
      AND membership.status = 'active';

    IF reviewer_membership.id IS NULL THEN
      RAISE EXCEPTION 'active reviewer membership is required';
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.organizations organization
    WHERE organization.id = NEW.organization_id
      AND organization.status IN ('trialing', 'active')
  ) THEN
    RAISE EXCEPTION 'active organization is required';
  END IF;

  NEW.timezone := btrim(NEW.timezone);

  IF NOT EXISTS (
    SELECT 1
    FROM pg_timezone_names timezone_name
    WHERE timezone_name.name = NEW.timezone
  ) THEN
    RAISE EXCEPTION 'overtime candidate timezone is not valid';
  END IF;

  IF NEW.status IN ('superseded', 'closed') AND NEW.closed_at IS NULL THEN
    NEW.closed_at := now();
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.overtime_candidate_source_belongs_to_org(
  target_organization_id uuid,
  target_overtime_candidate_id uuid,
  target_source_type text,
  target_source_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  candidate_person_profile_id uuid;
  normalized_source_type text := lower(btrim(COALESCE(target_source_type, '')));
BEGIN
  SELECT candidate.person_profile_id
  INTO candidate_person_profile_id
  FROM public.overtime_candidates candidate
  WHERE candidate.id = target_overtime_candidate_id
    AND candidate.organization_id = target_organization_id;

  IF candidate_person_profile_id IS NULL THEN
    RETURN false;
  END IF;

  IF normalized_source_type = 'manual_context' THEN
    RETURN target_source_id IS NULL;
  END IF;

  IF target_source_id IS NULL THEN
    RETURN false;
  END IF;

  CASE normalized_source_type
    WHEN 'time_record' THEN
      RETURN EXISTS (
        SELECT 1
        FROM public.time_records record
        WHERE record.id = target_source_id
          AND record.organization_id = target_organization_id
          AND record.person_profile_id = candidate_person_profile_id
          AND record.status <> 'voided'
      );
    WHEN 'time_punch' THEN
      RETURN EXISTS (
        SELECT 1
        FROM public.time_punches punch
        WHERE punch.id = target_source_id
          AND punch.organization_id = target_organization_id
          AND punch.person_profile_id = candidate_person_profile_id
          AND punch.status = 'active'
      );
    WHEN 'time_weekly_approval' THEN
      RETURN EXISTS (
        SELECT 1
        FROM public.time_weekly_approvals weekly_approval
        WHERE weekly_approval.id = target_source_id
          AND weekly_approval.organization_id = target_organization_id
          AND weekly_approval.person_profile_id = candidate_person_profile_id
      );
    WHEN 'schedule_block' THEN
      RETURN EXISTS (
        SELECT 1
        FROM public.schedule_blocks block
        WHERE block.id = target_source_id
          AND block.organization_id = target_organization_id
          AND public.schedule_block_accepts_active_assignment(block.status)
      );
    WHEN 'schedule_block_assignment' THEN
      RETURN EXISTS (
        SELECT 1
        FROM public.schedule_block_assignments assignment
        INNER JOIN public.coach_profiles coach_profile
          ON coach_profile.id = assignment.coach_profile_id
         AND coach_profile.organization_id = assignment.organization_id
        INNER JOIN public.schedule_blocks block
          ON block.id = assignment.schedule_block_id
         AND block.organization_id = assignment.organization_id
        WHERE assignment.id = target_source_id
          AND assignment.organization_id = target_organization_id
          AND assignment.assignment_status = 'assigned'
          AND coach_profile.person_profile_id = candidate_person_profile_id
          AND public.schedule_block_accepts_active_assignment(block.status)
      );
    WHEN 'staff_work_window' THEN
      RETURN EXISTS (
        SELECT 1
        FROM public.staff_work_windows work_window
        WHERE work_window.id = target_source_id
          AND work_window.organization_id = target_organization_id
          AND work_window.person_profile_id = candidate_person_profile_id
      );
    WHEN 'absence_request' THEN
      RETURN EXISTS (
        SELECT 1
        FROM public.absence_requests request
        WHERE request.id = target_source_id
          AND request.organization_id = target_organization_id
          AND request.subject_person_profile_id = candidate_person_profile_id
      );
    WHEN 'absence_request_period' THEN
      RETURN EXISTS (
        SELECT 1
        FROM public.absence_request_periods period
        INNER JOIN public.absence_requests request
          ON request.id = period.absence_request_id
         AND request.organization_id = period.organization_id
        WHERE period.id = target_source_id
          AND period.organization_id = target_organization_id
          AND request.subject_person_profile_id = candidate_person_profile_id
      );
    WHEN 'operational_event' THEN
      RETURN EXISTS (
        SELECT 1
        FROM public.operational_events event_record
        WHERE event_record.id = target_source_id
          AND event_record.organization_id = target_organization_id
      );
    ELSE
      RETURN false;
  END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_overtime_candidate_source_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  creator_membership public.organization_memberships;
BEGIN
  SELECT membership.*
  INTO creator_membership
  FROM public.organization_memberships membership
  WHERE membership.id = NEW.created_by_membership_id
    AND membership.organization_id = NEW.organization_id
    AND membership.status = 'active';

  IF creator_membership.id IS NULL THEN
    RAISE EXCEPTION 'active source creator membership is required';
  END IF;

  IF NOT public.overtime_candidate_source_belongs_to_org(
    NEW.organization_id,
    NEW.overtime_candidate_id,
    NEW.source_type,
    NEW.source_id
  ) THEN
    RAISE EXCEPTION 'overtime candidate source is not allowed';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_overtime_candidate_event_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.overtime_candidates candidate
    WHERE candidate.id = NEW.overtime_candidate_id
      AND candidate.organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'overtime candidate is required for event';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.organization_memberships membership
    WHERE membership.id = NEW.actor_membership_id
      AND membership.organization_id = NEW.organization_id
      AND membership.user_id = NEW.actor_user_id
      AND membership.status = 'active'
  ) THEN
    RAISE EXCEPTION 'active event actor membership is required';
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

  RETURN NEW;
END;
$$;

CREATE TRIGGER overtime_candidates_validate_row
  BEFORE INSERT OR UPDATE ON public.overtime_candidates
  FOR EACH ROW EXECUTE FUNCTION public.validate_overtime_candidate_row();

CREATE TRIGGER overtime_candidate_sources_validate_row
  BEFORE INSERT OR UPDATE ON public.overtime_candidate_sources
  FOR EACH ROW EXECUTE FUNCTION public.validate_overtime_candidate_source_row();

CREATE TRIGGER overtime_candidate_events_validate_row
  BEFORE INSERT OR UPDATE ON public.overtime_candidate_events
  FOR EACH ROW EXECUTE FUNCTION public.validate_overtime_candidate_event_row();

-- ============================================================
-- Read permission helper
-- ============================================================

CREATE OR REPLACE FUNCTION public.can_read_overtime_candidate(
  target_organization_id uuid,
  target_overtime_candidate_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  own_person_profile_id uuid;
BEGIN
  IF (select auth.uid()) IS NULL THEN
    RETURN false;
  END IF;

  IF public.can_review_overtime_candidates(target_organization_id) THEN
    RETURN true;
  END IF;

  IF NOT public.is_org_member(target_organization_id) THEN
    RETURN false;
  END IF;

  own_person_profile_id := public.get_own_person_profile_id(target_organization_id);

  RETURN EXISTS (
    SELECT 1
    FROM public.overtime_candidates candidate
    WHERE candidate.id = target_overtime_candidate_id
      AND candidate.organization_id = target_organization_id
      AND candidate.person_profile_id = own_person_profile_id
  );
END;
$$;

-- ============================================================
-- Internal event helper
-- ============================================================

CREATE OR REPLACE FUNCTION public.record_overtime_candidate_event_internal(
  target_organization_id uuid,
  target_overtime_candidate_id uuid,
  target_event_type text,
  target_result text DEFAULT 'success',
  target_previous_status text DEFAULT NULL,
  target_new_status text DEFAULT NULL,
  target_changed_fields jsonb DEFAULT '{}'::jsonb
)
RETURNS public.overtime_candidate_events
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
  normalized_previous_status text := NULLIF(lower(btrim(COALESCE(target_previous_status, ''))), '');
  normalized_new_status text := NULLIF(lower(btrim(COALESCE(target_new_status, ''))), '');
  normalized_changed_fields jsonb := COALESCE(target_changed_fields, '{}'::jsonb);
  created_event public.overtime_candidate_events;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF normalized_event_type NOT IN (
    'candidate_detected',
    'source_added',
    'review_started',
    'status_changed',
    'operationally_validated',
    'operationally_rejected',
    'candidate_superseded',
    'candidate_closed'
  ) THEN
    RAISE EXCEPTION 'overtime candidate event type is not allowed';
  END IF;

  IF normalized_result NOT IN ('success', 'failed', 'denied') THEN
    RAISE EXCEPTION 'overtime candidate event result is not allowed';
  END IF;

  IF NOT public.overtime_candidate_changed_fields_is_safe(normalized_changed_fields) THEN
    RAISE EXCEPTION 'overtime candidate event changed fields are not allowed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.overtime_candidates candidate
    WHERE candidate.id = target_overtime_candidate_id
      AND candidate.organization_id = target_organization_id
  ) THEN
    RAISE EXCEPTION 'overtime candidate was not found in tenant';
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

  own_person_profile_id := public.get_own_person_profile_id(target_organization_id);

  INSERT INTO public.overtime_candidate_events (
    organization_id,
    overtime_candidate_id,
    actor_user_id,
    actor_membership_id,
    actor_person_profile_id,
    event_type,
    result,
    previous_status,
    new_status,
    changed_fields,
    retain_until
  )
  VALUES (
    target_organization_id,
    target_overtime_candidate_id,
    current_user_id,
    current_membership.id,
    own_person_profile_id,
    normalized_event_type,
    normalized_result,
    normalized_previous_status,
    normalized_new_status,
    normalized_changed_fields,
    now() + interval '180 days'
  )
  RETURNING *
  INTO created_event;

  RETURN created_event;
END;
$$;

-- ============================================================
-- RPCs
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_overtime_candidate_signal(
  target_organization_id uuid,
  target_person_profile_id uuid,
  target_period_start_date date,
  target_period_end_date date,
  target_timezone text DEFAULT NULL,
  target_planned_minutes integer DEFAULT 0,
  target_worked_minutes integer DEFAULT 0,
  target_detection_source text DEFAULT 'manual_signal'
)
RETURNS public.overtime_candidates
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_membership_id uuid;
  normalized_timezone text;
  normalized_detection_source text := lower(btrim(COALESCE(target_detection_source, 'manual_signal')));
  created_candidate public.overtime_candidates;
BEGIN
  IF (select auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF NOT public.can_review_overtime_candidates(target_organization_id) THEN
    RAISE EXCEPTION 'overtime candidate review permission required';
  END IF;

  current_membership_id := public.get_active_membership_id(target_organization_id);

  IF current_membership_id IS NULL THEN
    RAISE EXCEPTION 'active membership required';
  END IF;

  IF normalized_detection_source NOT IN (
    'manual_signal',
    'time_difference',
    'schedule_difference',
    'weekly_review',
    'event_context',
    'absence_context',
    'staff_work_window_context'
  ) THEN
    RAISE EXCEPTION 'overtime candidate detection source is not allowed';
  END IF;

  IF target_period_start_date IS NULL
    OR target_period_end_date IS NULL
    OR target_period_start_date > target_period_end_date
    OR target_period_end_date > target_period_start_date + 366 THEN
    RAISE EXCEPTION 'overtime candidate period is invalid';
  END IF;

  IF target_planned_minutes IS NULL
    OR target_worked_minutes IS NULL
    OR target_planned_minutes < 0
    OR target_worked_minutes < 0
    OR target_planned_minutes > 527040
    OR target_worked_minutes > 527040
    OR target_worked_minutes <= target_planned_minutes THEN
    RAISE EXCEPTION 'overtime candidate minute snapshots are invalid';
  END IF;

  SELECT COALESCE(NULLIF(btrim(target_timezone), ''), organization.timezone)
  INTO normalized_timezone
  FROM public.organizations organization
  WHERE organization.id = target_organization_id
    AND organization.status IN ('trialing', 'active');

  IF normalized_timezone IS NULL THEN
    RAISE EXCEPTION 'active organization timezone is required';
  END IF;

  INSERT INTO public.overtime_candidates (
    organization_id,
    person_profile_id,
    period_start_date,
    period_end_date,
    timezone,
    detection_source,
    planned_minutes_snapshot,
    worked_minutes_snapshot,
    status,
    created_by_membership_id
  )
  VALUES (
    target_organization_id,
    target_person_profile_id,
    target_period_start_date,
    target_period_end_date,
    normalized_timezone,
    normalized_detection_source,
    target_planned_minutes,
    target_worked_minutes,
    'detected',
    current_membership_id
  )
  RETURNING *
  INTO created_candidate;

  PERFORM public.record_overtime_candidate_event_internal(
    target_organization_id,
    created_candidate.id,
    'candidate_detected',
    'success',
    NULL,
    'detected',
    jsonb_build_object(
      'detection_source', normalized_detection_source,
      'planned_minutes_snapshot', target_planned_minutes,
      'worked_minutes_snapshot', target_worked_minutes,
      'candidate_minutes', created_candidate.candidate_minutes
    )
  );

  RETURN created_candidate;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_overtime_candidate_source(
  target_organization_id uuid,
  target_overtime_candidate_id uuid,
  target_source_type text,
  target_source_id uuid DEFAULT NULL
)
RETURNS public.overtime_candidate_sources
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_membership_id uuid;
  candidate_record public.overtime_candidates;
  normalized_source_type text := lower(btrim(COALESCE(target_source_type, '')));
  created_source public.overtime_candidate_sources;
BEGIN
  IF (select auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF NOT public.can_review_overtime_candidates(target_organization_id) THEN
    RAISE EXCEPTION 'overtime candidate review permission required';
  END IF;

  current_membership_id := public.get_active_membership_id(target_organization_id);

  IF current_membership_id IS NULL THEN
    RAISE EXCEPTION 'active membership required';
  END IF;

  IF normalized_source_type NOT IN (
    'time_record',
    'time_punch',
    'time_weekly_approval',
    'schedule_block',
    'schedule_block_assignment',
    'staff_work_window',
    'absence_request',
    'absence_request_period',
    'operational_event',
    'manual_context'
  ) THEN
    RAISE EXCEPTION 'overtime candidate source type is not allowed';
  END IF;

  SELECT candidate.*
  INTO candidate_record
  FROM public.overtime_candidates candidate
  WHERE candidate.id = target_overtime_candidate_id
    AND candidate.organization_id = target_organization_id
  FOR UPDATE;

  IF candidate_record.id IS NULL THEN
    RAISE EXCEPTION 'overtime candidate was not found in tenant';
  END IF;

  IF candidate_record.status IN ('superseded', 'closed') THEN
    RAISE EXCEPTION 'closed overtime candidates cannot receive sources';
  END IF;

  IF NOT public.overtime_candidate_source_belongs_to_org(
    target_organization_id,
    target_overtime_candidate_id,
    normalized_source_type,
    target_source_id
  ) THEN
    RAISE EXCEPTION 'overtime candidate source is not allowed';
  END IF;

  INSERT INTO public.overtime_candidate_sources (
    organization_id,
    overtime_candidate_id,
    source_type,
    source_id,
    created_by_membership_id
  )
  VALUES (
    target_organization_id,
    target_overtime_candidate_id,
    normalized_source_type,
    target_source_id,
    current_membership_id
  )
  RETURNING *
  INTO created_source;

  PERFORM public.record_overtime_candidate_event_internal(
    target_organization_id,
    target_overtime_candidate_id,
    'source_added',
    'success',
    candidate_record.status,
    candidate_record.status,
    jsonb_build_object(
      'source_type', normalized_source_type,
      'source_id_present', target_source_id IS NOT NULL
    )
  );

  RETURN created_source;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_overtime_candidate_status(
  target_organization_id uuid,
  target_overtime_candidate_id uuid,
  target_status text
)
RETURNS public.overtime_candidates
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_membership_id uuid;
  candidate_record public.overtime_candidates;
  updated_candidate public.overtime_candidates;
  normalized_status text := lower(btrim(COALESCE(target_status, '')));
  event_type text;
  status_changed boolean := false;
BEGIN
  IF (select auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF NOT public.can_review_overtime_candidates(target_organization_id) THEN
    RAISE EXCEPTION 'overtime candidate review permission required';
  END IF;

  IF normalized_status NOT IN (
    'needs_review',
    'under_review',
    'operationally_validated',
    'operationally_rejected',
    'superseded',
    'closed'
  ) THEN
    RAISE EXCEPTION 'overtime candidate status is not allowed';
  END IF;

  current_membership_id := public.get_active_membership_id(target_organization_id);

  IF current_membership_id IS NULL THEN
    RAISE EXCEPTION 'active membership required';
  END IF;

  SELECT candidate.*
  INTO candidate_record
  FROM public.overtime_candidates candidate
  WHERE candidate.id = target_overtime_candidate_id
    AND candidate.organization_id = target_organization_id
  FOR UPDATE;

  IF candidate_record.id IS NULL THEN
    RAISE EXCEPTION 'overtime candidate was not found in tenant';
  END IF;

  IF candidate_record.status IN ('superseded', 'closed') THEN
    RAISE EXCEPTION 'closed overtime candidates cannot be changed';
  END IF;

  status_changed := candidate_record.status IS DISTINCT FROM normalized_status;

  UPDATE public.overtime_candidates
  SET
    status = normalized_status,
    reviewed_by_membership_id = current_membership_id,
    reviewed_at = CASE
      WHEN normalized_status IN (
        'under_review',
        'operationally_validated',
        'operationally_rejected',
        'needs_review'
      ) THEN now()
      ELSE reviewed_at
    END,
    closed_at = CASE
      WHEN normalized_status IN ('superseded', 'closed') THEN now()
      ELSE NULL
    END,
    retain_until = now() + interval '24 months'
  WHERE id = candidate_record.id
    AND organization_id = candidate_record.organization_id
  RETURNING *
  INTO updated_candidate;

  IF status_changed THEN
    event_type := CASE normalized_status
      WHEN 'under_review' THEN 'review_started'
      WHEN 'operationally_validated' THEN 'operationally_validated'
      WHEN 'operationally_rejected' THEN 'operationally_rejected'
      WHEN 'superseded' THEN 'candidate_superseded'
      WHEN 'closed' THEN 'candidate_closed'
      ELSE 'status_changed'
    END;

    PERFORM public.record_overtime_candidate_event_internal(
      target_organization_id,
      updated_candidate.id,
      event_type,
      'success',
      candidate_record.status,
      updated_candidate.status,
      jsonb_build_object('status', updated_candidate.status)
    );
  END IF;

  RETURN updated_candidate;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_overtime_candidates(
  target_organization_id uuid,
  target_status text DEFAULT NULL,
  target_person_profile_id uuid DEFAULT NULL,
  target_period_start_date date DEFAULT NULL,
  target_period_end_date date DEFAULT NULL,
  target_limit integer DEFAULT 100
)
RETURNS SETOF public.overtime_candidates
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized_status text := NULLIF(lower(btrim(COALESCE(target_status, ''))), '');
  bounded_limit integer := LEAST(GREATEST(COALESCE(target_limit, 100), 1), 200);
  own_person_profile_id uuid;
  can_review boolean := false;
BEGIN
  IF (select auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF NOT public.is_org_member(target_organization_id) THEN
    RAISE EXCEPTION 'active membership required';
  END IF;

  IF normalized_status IS NOT NULL
    AND normalized_status NOT IN (
      'detected',
      'needs_review',
      'under_review',
      'operationally_validated',
      'operationally_rejected',
      'superseded',
      'closed'
    ) THEN
    RAISE EXCEPTION 'overtime candidate status is not allowed';
  END IF;

  IF target_period_start_date IS NOT NULL
    AND target_period_end_date IS NOT NULL
    AND target_period_start_date > target_period_end_date THEN
    RAISE EXCEPTION 'overtime candidate period is invalid';
  END IF;

  can_review := public.can_review_overtime_candidates(target_organization_id);
  own_person_profile_id := public.get_own_person_profile_id(target_organization_id);

  IF NOT can_review AND own_person_profile_id IS NULL THEN
    RAISE EXCEPTION 'linked person profile required';
  END IF;

  IF NOT can_review
    AND target_person_profile_id IS NOT NULL
    AND target_person_profile_id IS DISTINCT FROM own_person_profile_id THEN
    RAISE EXCEPTION 'overtime candidate read permission required';
  END IF;

  RETURN QUERY
  SELECT candidate.*
  FROM public.overtime_candidates candidate
  WHERE candidate.organization_id = target_organization_id
    AND (
      normalized_status IS NULL
      OR candidate.status = normalized_status
    )
    AND (
      CASE
        WHEN can_review THEN
          target_person_profile_id IS NULL
          OR candidate.person_profile_id = target_person_profile_id
        ELSE
          candidate.person_profile_id = own_person_profile_id
      END
    )
    AND (
      target_period_start_date IS NULL
      OR candidate.period_end_date >= target_period_start_date
    )
    AND (
      target_period_end_date IS NULL
      OR candidate.period_start_date <= target_period_end_date
    )
  ORDER BY candidate.period_start_date DESC, candidate.created_at DESC
  LIMIT bounded_limit;
END;
$$;

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE public.overtime_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.overtime_candidate_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.overtime_candidate_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitted members can read overtime candidates"
  ON public.overtime_candidates FOR SELECT TO authenticated
  USING (public.can_read_overtime_candidate(organization_id, id));

CREATE POLICY "Permitted members can read overtime candidate sources"
  ON public.overtime_candidate_sources FOR SELECT TO authenticated
  USING (public.can_read_overtime_candidate(organization_id, overtime_candidate_id));

CREATE POLICY "Permitted members can read retained overtime candidate events"
  ON public.overtime_candidate_events FOR SELECT TO authenticated
  USING (
    retain_until > now()
    AND public.can_read_overtime_candidate(organization_id, overtime_candidate_id)
  );

-- ============================================================
-- Grants
-- ============================================================

REVOKE ALL ON public.overtime_candidates FROM PUBLIC;
REVOKE ALL ON public.overtime_candidate_sources FROM PUBLIC;
REVOKE ALL ON public.overtime_candidate_events FROM PUBLIC;
REVOKE ALL ON public.overtime_candidates FROM anon, authenticated;
REVOKE ALL ON public.overtime_candidate_sources FROM anon, authenticated;
REVOKE ALL ON public.overtime_candidate_events FROM anon, authenticated;

GRANT SELECT ON public.overtime_candidates TO authenticated;
GRANT SELECT ON public.overtime_candidate_sources TO authenticated;
GRANT SELECT ON public.overtime_candidate_events TO authenticated;

REVOKE EXECUTE ON FUNCTION public.can_review_overtime_candidates(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.overtime_candidate_changed_fields_is_safe(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_overtime_candidate_row() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.overtime_candidate_source_belongs_to_org(uuid, uuid, text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_overtime_candidate_source_row() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_overtime_candidate_event_row() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_read_overtime_candidate(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_overtime_candidate_event_internal(uuid, uuid, text, text, text, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_overtime_candidate_signal(uuid, uuid, date, date, text, integer, integer, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.add_overtime_candidate_source(uuid, uuid, text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_overtime_candidate_status(uuid, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.list_overtime_candidates(uuid, text, uuid, date, date, integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.can_review_overtime_candidates(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_overtime_candidate(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_overtime_candidate_signal(uuid, uuid, date, date, text, integer, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_overtime_candidate_source(uuid, uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_overtime_candidate_status(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_overtime_candidates(uuid, text, uuid, date, date, integer) TO authenticated;
