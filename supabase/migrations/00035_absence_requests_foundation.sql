-- BoxOps - I.10 absence requests foundation
-- Opens the first tenant-scoped DB/RLS/RPC base for absences, vacations
-- and minimized permissions. No UI, visible Server Actions, legal balances,
-- payroll, medical documents, push, native app or location.
--
-- Schedule impact is intentionally computed on demand through
-- list_absence_schedule_impacts(...). We do not persist
-- absence_schedule_impacts in this cut because the current impact is fully
-- derivable from approved/pending absence periods plus assigned blocks.

-- ============================================================
-- Helpers
-- ============================================================

CREATE OR REPLACE FUNCTION public.absence_request_summary_is_safe(
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
      AND target_summary !~* '(https?://|www[.]|data:|base64|token|secret|password|credential|signed-url|signed_url|storage/v1|document|documento|archivo|justificante|payroll|salary|salario|nomina|iban|bank|dni|nif|ssn|national_id|geolocation|gps|latitude|longitude|coordinate|ubicacion|location|baja|salud|health|medical|medic|diagnostic|sick|illness|familia|familiar|sancion|disciplin)'
    );
$$;

CREATE OR REPLACE FUNCTION public.absence_request_changed_fields_is_safe(
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
        OR lower(key_name) ~ '(content|body|html|raw|base64|url|uri|path|token|secret|signature|document|storage|password|credential|cookie|session|ip|fingerprint|latitude|longitude|coordinate|geolocation|gps|location|payroll|salary|salario|nomina|iban|bank|ssn|national_id|nif|dni|health|medical|diagnostic|diagnostico|baja|family|familia)'
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

CREATE OR REPLACE FUNCTION public.can_manage_absence_requests(
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

CREATE OR REPLACE FUNCTION public.can_use_absence_self_service(
  target_organization_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_org_role(target_organization_id, ARRAY['owner', 'admin', 'manager', 'coach']);
$$;

-- ============================================================
-- Tables
-- ============================================================

CREATE TABLE public.absence_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  subject_person_profile_id uuid NOT NULL,
  subject_coach_profile_id uuid,
  requested_by_user_id uuid NOT NULL,
  requested_by_membership_id uuid NOT NULL,
  requested_by_person_profile_id uuid NOT NULL,
  absence_type text NOT NULL
    CHECK (absence_type IN (
      'vacation',
      'day_off',
      'partial_day',
      'permission',
      'personal_absence',
      'unavailable'
    )),
  status text NOT NULL DEFAULT 'requested'
    CHECK (status IN (
      'requested',
      'pending_review',
      'approved',
      'rejected',
      'cancelled',
      'expired'
    )),
  review_required boolean NOT NULL DEFAULT true,
  reviewed_by_membership_id uuid,
  reviewed_by_person_profile_id uuid,
  reason_summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  requested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  cancelled_at timestamptz,
  expired_at timestamptz,
  resolved_at timestamptz,
  expires_at timestamptz,
  retain_until timestamptz NOT NULL DEFAULT now() + interval '24 months',
  UNIQUE (id, organization_id),
  FOREIGN KEY (subject_person_profile_id, organization_id)
    REFERENCES public.person_profiles(id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (subject_coach_profile_id, organization_id)
    REFERENCES public.coach_profiles(id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, requested_by_user_id)
    REFERENCES public.organization_memberships(organization_id, user_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (requested_by_membership_id, organization_id)
    REFERENCES public.organization_memberships(id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (requested_by_person_profile_id, organization_id)
    REFERENCES public.person_profiles(id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (reviewed_by_membership_id, organization_id)
    REFERENCES public.organization_memberships(id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (reviewed_by_person_profile_id, organization_id)
    REFERENCES public.person_profiles(id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT absence_requests_reason_summary_safe
    CHECK (public.absence_request_summary_is_safe(reason_summary)),
  CONSTRAINT absence_requests_expiry_window
    CHECK (
      expires_at IS NULL
      OR (
        expires_at > created_at
        AND expires_at <= created_at + interval '180 days'
      )
    ),
  CONSTRAINT absence_requests_review_fields
    CHECK (
      status NOT IN ('approved', 'rejected')
      OR (
        reviewed_at IS NOT NULL
        AND reviewed_by_membership_id IS NOT NULL
      )
    ),
  CONSTRAINT absence_requests_cancelled_fields
    CHECK (status <> 'cancelled' OR cancelled_at IS NOT NULL),
  CONSTRAINT absence_requests_expired_fields
    CHECK (status <> 'expired' OR expired_at IS NOT NULL),
  CONSTRAINT absence_requests_retention_candidate
    CHECK (
      retain_until > created_at
      AND retain_until <= GREATEST(
        created_at,
        COALESCE(reviewed_at, created_at),
        COALESCE(cancelled_at, created_at),
        COALESCE(expired_at, created_at),
        COALESCE(resolved_at, created_at)
      ) + interval '24 months' + interval '1 day'
    )
);

CREATE TABLE public.absence_request_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  absence_request_id uuid NOT NULL,
  period_index integer NOT NULL DEFAULT 1 CHECK (period_index BETWEEN 1 AND 50),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  all_day boolean NOT NULL DEFAULT true,
  timezone text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id),
  UNIQUE (organization_id, absence_request_id, period_index),
  FOREIGN KEY (absence_request_id, organization_id)
    REFERENCES public.absence_requests(id, organization_id)
    ON DELETE CASCADE,
  CONSTRAINT absence_request_periods_time_range
    CHECK (
      starts_at < ends_at
      AND ends_at <= starts_at + interval '366 days'
    ),
  CONSTRAINT absence_request_periods_timezone_not_blank
    CHECK (length(btrim(timezone)) > 0 AND length(timezone) <= 80)
);

CREATE TABLE public.absence_request_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  absence_request_id uuid NOT NULL,
  actor_user_id uuid NOT NULL,
  actor_membership_id uuid NOT NULL,
  actor_person_profile_id uuid,
  event_type text NOT NULL
    CHECK (event_type IN (
      'absence_requested',
      'absence_review_requested',
      'absence_approved',
      'absence_rejected',
      'absence_cancelled',
      'absence_expired',
      'coverage_impact_detected'
    )),
  result text NOT NULL DEFAULT 'success'
    CHECK (result IN ('success', 'failed', 'denied')),
  changed_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  retain_until timestamptz NOT NULL,
  UNIQUE (id, organization_id),
  FOREIGN KEY (absence_request_id, organization_id)
    REFERENCES public.absence_requests(id, organization_id)
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
  CONSTRAINT absence_request_events_changed_fields_safe
    CHECK (public.absence_request_changed_fields_is_safe(changed_fields)),
  CONSTRAINT absence_request_events_retain_window
    CHECK (
      retain_until > created_at
      AND retain_until <= created_at + interval '180 days' + interval '1 day'
    )
);

CREATE INDEX absence_requests_org_status_idx
  ON public.absence_requests (organization_id, status, created_at DESC);

CREATE INDEX absence_requests_subject_idx
  ON public.absence_requests (organization_id, subject_person_profile_id, created_at DESC);

CREATE INDEX absence_requests_subject_coach_idx
  ON public.absence_requests (organization_id, subject_coach_profile_id, created_at DESC)
  WHERE subject_coach_profile_id IS NOT NULL;

CREATE INDEX absence_request_periods_request_idx
  ON public.absence_request_periods (organization_id, absence_request_id, starts_at, ends_at);

CREATE INDEX absence_request_events_request_idx
  ON public.absence_request_events (organization_id, absence_request_id, created_at DESC);

CREATE INDEX absence_request_events_actor_idx
  ON public.absence_request_events (organization_id, actor_user_id, created_at DESC);

CREATE INDEX absence_request_events_retain_until_idx
  ON public.absence_request_events (retain_until);

CREATE TRIGGER absence_requests_set_updated_at
  BEFORE UPDATE ON public.absence_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- Validation
-- ============================================================

CREATE OR REPLACE FUNCTION public.validate_absence_request_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  subject_person public.person_profiles;
  subject_coach public.coach_profiles;
  requester_membership public.organization_memberships;
  requester_person public.person_profiles;
  reviewer_membership public.organization_memberships;
  reviewer_person public.person_profiles;
  require_active_subject boolean := NEW.status NOT IN ('rejected', 'cancelled', 'expired');
BEGIN
  SELECT person_profile.*
  INTO subject_person
  FROM public.person_profiles person_profile
  WHERE person_profile.id = NEW.subject_person_profile_id
    AND person_profile.organization_id = NEW.organization_id;

  IF subject_person.id IS NULL THEN
    RAISE EXCEPTION 'subject person profile is required';
  END IF;

  IF require_active_subject
    AND (
      subject_person.status <> 'active'
      OR subject_person.visibility_status <> 'visible'
    ) THEN
    RAISE EXCEPTION 'active visible subject person profile is required';
  END IF;

  IF NEW.subject_coach_profile_id IS NOT NULL THEN
    SELECT coach_profile.*
    INTO subject_coach
    FROM public.coach_profiles coach_profile
    WHERE coach_profile.id = NEW.subject_coach_profile_id
      AND coach_profile.organization_id = NEW.organization_id;

    IF subject_coach.id IS NULL THEN
      RAISE EXCEPTION 'subject coach profile is required';
    END IF;

    IF subject_coach.person_profile_id IS DISTINCT FROM NEW.subject_person_profile_id THEN
      RAISE EXCEPTION 'subject coach must be linked to subject person';
    END IF;

    IF require_active_subject AND subject_coach.status <> 'active' THEN
      RAISE EXCEPTION 'active subject coach profile is required';
    END IF;
  END IF;

  SELECT membership.*
  INTO requester_membership
  FROM public.organization_memberships membership
  WHERE membership.id = NEW.requested_by_membership_id
    AND membership.organization_id = NEW.organization_id;

  IF requester_membership.id IS NULL THEN
    RAISE EXCEPTION 'requester membership is required';
  END IF;

  IF requester_membership.user_id IS DISTINCT FROM NEW.requested_by_user_id THEN
    RAISE EXCEPTION 'requester user must match requester membership';
  END IF;

  SELECT person_profile.*
  INTO requester_person
  FROM public.person_profiles person_profile
  WHERE person_profile.id = NEW.requested_by_person_profile_id
    AND person_profile.organization_id = NEW.organization_id;

  IF requester_person.id IS NULL THEN
    RAISE EXCEPTION 'requester person profile is required';
  END IF;

  IF requester_person.user_id IS DISTINCT FROM requester_membership.user_id THEN
    RAISE EXCEPTION 'requester person must match requester membership';
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

  IF NEW.reviewed_by_person_profile_id IS NOT NULL THEN
    SELECT person_profile.*
    INTO reviewer_person
    FROM public.person_profiles person_profile
    WHERE person_profile.id = NEW.reviewed_by_person_profile_id
      AND person_profile.organization_id = NEW.organization_id;

    IF reviewer_person.id IS NULL THEN
      RAISE EXCEPTION 'reviewer person profile is required';
    END IF;

    IF NEW.reviewed_by_membership_id IS NOT NULL
      AND reviewer_person.user_id IS DISTINCT FROM reviewer_membership.user_id THEN
      RAISE EXCEPTION 'reviewer person must match reviewer membership';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_absence_request_period_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_timezone_names timezone_name
    WHERE timezone_name.name = NEW.timezone
  ) THEN
    RAISE EXCEPTION 'absence period timezone is not valid';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_absence_request_event_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.absence_requests request
    WHERE request.id = NEW.absence_request_id
      AND request.organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'absence request is required for event';
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

CREATE TRIGGER absence_requests_validate_row
  BEFORE INSERT OR UPDATE ON public.absence_requests
  FOR EACH ROW EXECUTE FUNCTION public.validate_absence_request_row();

CREATE TRIGGER absence_request_periods_validate_row
  BEFORE INSERT OR UPDATE ON public.absence_request_periods
  FOR EACH ROW EXECUTE FUNCTION public.validate_absence_request_period_row();

CREATE TRIGGER absence_request_events_validate_row
  BEFORE INSERT OR UPDATE ON public.absence_request_events
  FOR EACH ROW EXECUTE FUNCTION public.validate_absence_request_event_row();

-- ============================================================
-- Read permission helper
-- ============================================================

CREATE OR REPLACE FUNCTION public.can_read_absence_request(
  target_organization_id uuid,
  target_absence_request_id uuid
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

  IF public.can_manage_absence_requests(target_organization_id) THEN
    RETURN true;
  END IF;

  IF NOT public.can_use_absence_self_service(target_organization_id) THEN
    RETURN false;
  END IF;

  own_person_profile_id := public.get_own_person_profile_id(target_organization_id);

  RETURN EXISTS (
    SELECT 1
    FROM public.absence_requests request
    WHERE request.id = target_absence_request_id
      AND request.organization_id = target_organization_id
      AND (
        request.subject_person_profile_id = own_person_profile_id
        OR request.requested_by_person_profile_id = own_person_profile_id
      )
  );
END;
$$;

-- ============================================================
-- Internal event helper
-- ============================================================

CREATE OR REPLACE FUNCTION public.record_absence_request_event_internal(
  target_organization_id uuid,
  target_absence_request_id uuid,
  target_event_type text,
  target_result text,
  target_changed_fields jsonb
)
RETURNS public.absence_request_events
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
  created_event public.absence_request_events;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF normalized_event_type NOT IN (
    'absence_requested',
    'absence_review_requested',
    'absence_approved',
    'absence_rejected',
    'absence_cancelled',
    'absence_expired',
    'coverage_impact_detected'
  ) THEN
    RAISE EXCEPTION 'absence request event type is not allowed';
  END IF;

  IF normalized_result NOT IN ('success', 'failed', 'denied') THEN
    RAISE EXCEPTION 'absence request event result is not allowed';
  END IF;

  IF NOT public.absence_request_changed_fields_is_safe(normalized_changed_fields) THEN
    RAISE EXCEPTION 'absence request event changed fields are not allowed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.absence_requests request
    WHERE request.id = target_absence_request_id
      AND request.organization_id = target_organization_id
  ) THEN
    RAISE EXCEPTION 'absence request was not found in tenant';
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

  INSERT INTO public.absence_request_events (
    organization_id,
    absence_request_id,
    actor_user_id,
    actor_membership_id,
    actor_person_profile_id,
    event_type,
    result,
    changed_fields,
    retain_until
  )
  VALUES (
    target_organization_id,
    target_absence_request_id,
    current_user_id,
    current_membership.id,
    own_person_profile_id,
    normalized_event_type,
    normalized_result,
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

CREATE OR REPLACE FUNCTION public.create_own_absence_request(
  target_organization_id uuid,
  target_absence_type text,
  target_starts_at timestamptz,
  target_ends_at timestamptz,
  target_all_day boolean DEFAULT true,
  target_timezone text DEFAULT NULL,
  target_reason_summary text DEFAULT NULL,
  target_expires_at timestamptz DEFAULT NULL
)
RETURNS public.absence_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := (select auth.uid());
  current_membership_id uuid;
  own_person_profile_id uuid;
  own_coach_profile_id uuid;
  normalized_absence_type text := lower(btrim(COALESCE(target_absence_type, '')));
  normalized_reason_summary text := NULLIF(btrim(COALESCE(target_reason_summary, '')), '');
  normalized_timezone text;
  created_request public.absence_requests;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF NOT public.can_use_absence_self_service(target_organization_id) THEN
    RAISE EXCEPTION 'absence self-service permission required';
  END IF;

  IF normalized_absence_type NOT IN (
    'vacation',
    'day_off',
    'partial_day',
    'permission',
    'personal_absence',
    'unavailable'
  ) THEN
    RAISE EXCEPTION 'absence type is not allowed';
  END IF;

  IF target_starts_at IS NULL
    OR target_ends_at IS NULL
    OR target_starts_at >= target_ends_at
    OR target_ends_at > target_starts_at + interval '366 days' THEN
    RAISE EXCEPTION 'absence period is invalid';
  END IF;

  IF NOT public.absence_request_summary_is_safe(normalized_reason_summary) THEN
    RAISE EXCEPTION 'absence summary is not allowed';
  END IF;

  IF target_expires_at IS NOT NULL
    AND (
      target_expires_at <= now()
      OR target_expires_at > now() + interval '180 days'
    ) THEN
    RAISE EXCEPTION 'absence request expiry is outside the allowed window';
  END IF;

  current_membership_id := public.get_active_membership_id(target_organization_id);
  own_person_profile_id := public.get_own_person_profile_id(target_organization_id);

  IF current_membership_id IS NULL OR own_person_profile_id IS NULL THEN
    RAISE EXCEPTION 'active membership and linked person profile required';
  END IF;

  SELECT COALESCE(NULLIF(btrim(target_timezone), ''), organization.timezone)
  INTO normalized_timezone
  FROM public.organizations organization
  WHERE organization.id = target_organization_id
    AND organization.status = 'active';

  IF normalized_timezone IS NULL THEN
    RAISE EXCEPTION 'active organization timezone is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_timezone_names timezone_name
    WHERE timezone_name.name = normalized_timezone
  ) THEN
    RAISE EXCEPTION 'absence period timezone is not valid';
  END IF;

  SELECT coach_profile.id
  INTO own_coach_profile_id
  FROM public.coach_profiles coach_profile
  WHERE coach_profile.organization_id = target_organization_id
    AND coach_profile.person_profile_id = own_person_profile_id
    AND coach_profile.status = 'active'
  LIMIT 1;

  INSERT INTO public.absence_requests (
    organization_id,
    subject_person_profile_id,
    subject_coach_profile_id,
    requested_by_user_id,
    requested_by_membership_id,
    requested_by_person_profile_id,
    absence_type,
    status,
    review_required,
    reason_summary,
    expires_at
  )
  VALUES (
    target_organization_id,
    own_person_profile_id,
    own_coach_profile_id,
    current_user_id,
    current_membership_id,
    own_person_profile_id,
    normalized_absence_type,
    'requested',
    true,
    normalized_reason_summary,
    target_expires_at
  )
  RETURNING *
  INTO created_request;

  INSERT INTO public.absence_request_periods (
    organization_id,
    absence_request_id,
    period_index,
    starts_at,
    ends_at,
    all_day,
    timezone
  )
  VALUES (
    target_organization_id,
    created_request.id,
    1,
    target_starts_at,
    target_ends_at,
    COALESCE(target_all_day, true),
    normalized_timezone
  );

  PERFORM public.record_absence_request_event_internal(
    target_organization_id,
    created_request.id,
    'absence_requested',
    'success',
    jsonb_build_object(
      'status', 'requested',
      'absence_type', normalized_absence_type,
      'period_count', 1
    )
  );

  UPDATE public.absence_requests
  SET status = 'pending_review'
  WHERE id = created_request.id
    AND organization_id = target_organization_id
  RETURNING *
  INTO created_request;

  PERFORM public.record_absence_request_event_internal(
    target_organization_id,
    created_request.id,
    'absence_review_requested',
    'success',
    jsonb_build_object('status', 'pending_review')
  );

  RETURN created_request;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_absence_request(
  target_organization_id uuid,
  target_absence_request_id uuid,
  target_decision text
)
RETURNS public.absence_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized_decision text := lower(btrim(COALESCE(target_decision, '')));
  current_membership_id uuid;
  own_person_profile_id uuid;
  request_record public.absence_requests;
  updated_request public.absence_requests;
  event_type text;
BEGIN
  IF (select auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF NOT public.can_manage_absence_requests(target_organization_id) THEN
    RAISE EXCEPTION 'absence review permission required';
  END IF;

  IF normalized_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'absence review decision is not allowed';
  END IF;

  current_membership_id := public.get_active_membership_id(target_organization_id);
  own_person_profile_id := public.get_own_person_profile_id(target_organization_id);

  IF current_membership_id IS NULL THEN
    RAISE EXCEPTION 'active reviewer membership required';
  END IF;

  SELECT request.*
  INTO request_record
  FROM public.absence_requests request
  WHERE request.id = target_absence_request_id
    AND request.organization_id = target_organization_id
  FOR UPDATE;

  IF request_record.id IS NULL THEN
    RAISE EXCEPTION 'absence request was not found in tenant';
  END IF;

  IF request_record.status NOT IN ('requested', 'pending_review') THEN
    RAISE EXCEPTION 'absence request is not awaiting review';
  END IF;

  IF request_record.expires_at IS NOT NULL AND request_record.expires_at <= now() THEN
    RAISE EXCEPTION 'absence request has expired';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.absence_request_periods period
    WHERE period.organization_id = target_organization_id
      AND period.absence_request_id = request_record.id
  ) THEN
    RAISE EXCEPTION 'absence request period is required';
  END IF;

  UPDATE public.absence_requests
  SET
    status = normalized_decision,
    reviewed_by_membership_id = current_membership_id,
    reviewed_by_person_profile_id = own_person_profile_id,
    reviewed_at = now(),
    resolved_at = now(),
    retain_until = now() + interval '24 months'
  WHERE id = request_record.id
    AND organization_id = request_record.organization_id
  RETURNING *
  INTO updated_request;

  event_type := CASE
    WHEN normalized_decision = 'approved' THEN 'absence_approved'
    ELSE 'absence_rejected'
  END;

  PERFORM public.record_absence_request_event_internal(
    target_organization_id,
    request_record.id,
    event_type,
    'success',
    jsonb_build_object('status', normalized_decision)
  );

  RETURN updated_request;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_absence_request(
  target_organization_id uuid,
  target_absence_request_id uuid
)
RETURNS public.absence_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  request_record public.absence_requests;
  own_person_profile_id uuid;
  actor_can_self_cancel boolean := false;
  updated_request public.absence_requests;
BEGIN
  IF (select auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT request.*
  INTO request_record
  FROM public.absence_requests request
  WHERE request.id = target_absence_request_id
    AND request.organization_id = target_organization_id
  FOR UPDATE;

  IF request_record.id IS NULL THEN
    RAISE EXCEPTION 'absence request was not found in tenant';
  END IF;

  own_person_profile_id := public.get_own_person_profile_id(target_organization_id);
  actor_can_self_cancel :=
    public.can_use_absence_self_service(target_organization_id)
    AND own_person_profile_id IS NOT NULL
    AND (
      request_record.subject_person_profile_id = own_person_profile_id
      OR request_record.requested_by_person_profile_id = own_person_profile_id
    );

  IF NOT public.can_manage_absence_requests(target_organization_id)
    AND NOT actor_can_self_cancel THEN
    RAISE EXCEPTION 'absence cancellation permission required';
  END IF;

  IF request_record.status IN ('rejected', 'cancelled', 'expired') THEN
    RAISE EXCEPTION 'absence request is already closed';
  END IF;

  IF request_record.status = 'approved'
    AND NOT public.can_manage_absence_requests(target_organization_id) THEN
    RAISE EXCEPTION 'approved absence cancellation requires management permission';
  END IF;

  UPDATE public.absence_requests
  SET
    status = 'cancelled',
    cancelled_at = now(),
    resolved_at = now(),
    retain_until = now() + interval '24 months'
  WHERE id = request_record.id
    AND organization_id = request_record.organization_id
  RETURNING *
  INTO updated_request;

  PERFORM public.record_absence_request_event_internal(
    target_organization_id,
    request_record.id,
    'absence_cancelled',
    'success',
    jsonb_build_object('status', 'cancelled')
  );

  RETURN updated_request;
END;
$$;

CREATE OR REPLACE FUNCTION public.expire_absence_request(
  target_organization_id uuid,
  target_absence_request_id uuid
)
RETURNS public.absence_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  request_record public.absence_requests;
  all_periods_ended boolean := false;
  updated_request public.absence_requests;
BEGIN
  IF (select auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF NOT public.can_read_absence_request(target_organization_id, target_absence_request_id) THEN
    RAISE EXCEPTION 'absence request permission required';
  END IF;

  SELECT request.*
  INTO request_record
  FROM public.absence_requests request
  WHERE request.id = target_absence_request_id
    AND request.organization_id = target_organization_id
  FOR UPDATE;

  IF request_record.id IS NULL THEN
    RAISE EXCEPTION 'absence request was not found in tenant';
  END IF;

  IF request_record.status NOT IN ('requested', 'pending_review') THEN
    RAISE EXCEPTION 'absence request is not expirable';
  END IF;

  SELECT COALESCE(bool_and(period.ends_at <= now()), false)
  INTO all_periods_ended
  FROM public.absence_request_periods period
  WHERE period.organization_id = target_organization_id
    AND period.absence_request_id = request_record.id;

  IF NOT (
    (request_record.expires_at IS NOT NULL AND request_record.expires_at <= now())
    OR all_periods_ended
  ) THEN
    RAISE EXCEPTION 'absence request is not expirable yet';
  END IF;

  UPDATE public.absence_requests
  SET
    status = 'expired',
    expired_at = now(),
    resolved_at = now(),
    retain_until = now() + interval '24 months'
  WHERE id = request_record.id
    AND organization_id = request_record.organization_id
  RETURNING *
  INTO updated_request;

  PERFORM public.record_absence_request_event_internal(
    target_organization_id,
    request_record.id,
    'absence_expired',
    'success',
    jsonb_build_object('status', 'expired')
  );

  RETURN updated_request;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_absence_schedule_impacts(
  target_organization_id uuid,
  target_absence_request_id uuid
)
RETURNS TABLE (
  organization_id uuid,
  absence_request_id uuid,
  absence_request_period_id uuid,
  schedule_block_id uuid,
  schedule_block_assignment_id uuid,
  subject_coach_profile_id uuid,
  impact_status text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (select auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF NOT public.can_read_absence_request(target_organization_id, target_absence_request_id) THEN
    RAISE EXCEPTION 'absence request permission required';
  END IF;

  RETURN QUERY
  SELECT
    request.organization_id,
    request.id AS absence_request_id,
    period.id AS absence_request_period_id,
    block.id AS schedule_block_id,
    assignment.id AS schedule_block_assignment_id,
    request.subject_coach_profile_id,
    CASE
      WHEN request.status IN ('requested', 'pending_review') THEN 'potential'
      WHEN request.status = 'approved' THEN 'coverage_needed'
      ELSE 'none'
    END AS impact_status
  FROM public.absence_requests request
  INNER JOIN public.absence_request_periods period
    ON period.organization_id = request.organization_id
   AND period.absence_request_id = request.id
  INNER JOIN public.schedule_block_assignments assignment
    ON assignment.organization_id = request.organization_id
   AND assignment.coach_profile_id = request.subject_coach_profile_id
   AND assignment.assignment_status = 'assigned'
  INNER JOIN public.schedule_blocks block
    ON block.organization_id = assignment.organization_id
   AND block.id = assignment.schedule_block_id
  INNER JOIN public.centers center_record
    ON center_record.organization_id = block.organization_id
   AND center_record.id = block.center_id
  WHERE request.organization_id = target_organization_id
    AND request.id = target_absence_request_id
    AND request.subject_coach_profile_id IS NOT NULL
    AND request.status IN ('requested', 'pending_review', 'approved')
    AND public.schedule_block_accepts_active_assignment(block.status)
    AND ((block.service_date + block.start_time) AT TIME ZONE COALESCE(NULLIF(center_record.timezone, ''), period.timezone)) < period.ends_at
    AND period.starts_at < ((block.service_date + block.end_time) AT TIME ZONE COALESCE(NULLIF(center_record.timezone, ''), period.timezone));
END;
$$;

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE public.absence_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.absence_request_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.absence_request_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Involved members can read absence requests"
  ON public.absence_requests FOR SELECT TO authenticated
  USING (public.can_read_absence_request(organization_id, id));

CREATE POLICY "Involved members can read absence request periods"
  ON public.absence_request_periods FOR SELECT TO authenticated
  USING (public.can_read_absence_request(organization_id, absence_request_id));

CREATE POLICY "Involved members can read retained absence request events"
  ON public.absence_request_events FOR SELECT TO authenticated
  USING (
    retain_until > now()
    AND public.can_read_absence_request(organization_id, absence_request_id)
  );

-- ============================================================
-- Grants
-- ============================================================

REVOKE ALL ON public.absence_requests FROM PUBLIC;
REVOKE ALL ON public.absence_request_periods FROM PUBLIC;
REVOKE ALL ON public.absence_request_events FROM PUBLIC;
REVOKE ALL ON public.absence_requests FROM authenticated;
REVOKE ALL ON public.absence_request_periods FROM authenticated;
REVOKE ALL ON public.absence_request_events FROM authenticated;

GRANT SELECT ON public.absence_requests TO authenticated;
GRANT SELECT ON public.absence_request_periods TO authenticated;
GRANT SELECT ON public.absence_request_events TO authenticated;

REVOKE ALL ON FUNCTION public.absence_request_summary_is_safe(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.absence_request_changed_fields_is_safe(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_absence_requests(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_use_absence_self_service(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_absence_request_row() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_absence_request_period_row() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_absence_request_event_row() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_read_absence_request(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_absence_request_event_internal(
  uuid,
  uuid,
  text,
  text,
  jsonb
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_own_absence_request(
  uuid,
  text,
  timestamptz,
  timestamptz,
  boolean,
  text,
  text,
  timestamptz
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.review_absence_request(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_absence_request(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.expire_absence_request(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_absence_schedule_impacts(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.can_manage_absence_requests(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_use_absence_self_service(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_absence_request(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_own_absence_request(
  uuid,
  text,
  timestamptz,
  timestamptz,
  boolean,
  text,
  text,
  timestamptz
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_absence_request(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_absence_request(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.expire_absence_request(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_absence_schedule_impacts(uuid, uuid) TO authenticated;
