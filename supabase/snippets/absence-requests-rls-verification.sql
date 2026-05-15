-- BoxOps - I.10 absence requests RLS/RPC verification
--
-- Run locally with:
--   Get-Content -Raw supabase/snippets/absence-requests-rls-verification.sql | docker exec -i supabase_db_boxops psql -U postgres -d postgres -v ON_ERROR_STOP=1
--
-- The script runs inside a transaction and rolls back all fixture data.

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assert_true(
  condition boolean,
  label text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF condition IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'absence requests verification failed: %', label;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.use_auth_user(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', target_user_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.expect_rejected(
  label text,
  statement text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  got_error boolean := false;
BEGIN
  BEGIN
    EXECUTE statement;
  EXCEPTION WHEN others THEN
    got_error := true;
    RAISE NOTICE 'ok - rejected: % (%: %)', label, SQLSTATE, SQLERRM;
  END;

  IF NOT got_error THEN
    RAISE EXCEPTION 'statement was not rejected: %', label;
  END IF;
END;
$$;

INSERT INTO auth.users (
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data
)
VALUES
  (
    '00000000-0000-0000-0000-000000929101',
    'authenticated',
    'authenticated',
    'absence-owner-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Absence Owner A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000929102',
    'authenticated',
    'authenticated',
    'absence-manager-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Absence Manager A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000929103',
    'authenticated',
    'authenticated',
    'absence-coach-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Absence Coach A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000929104',
    'authenticated',
    'authenticated',
    'absence-other-coach-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Absence Other Coach A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000929105',
    'authenticated',
    'authenticated',
    'absence-staff-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Absence Staff A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000929106',
    'authenticated',
    'authenticated',
    'absence-owner-b@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Absence Owner B"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000929107',
    'authenticated',
    'authenticated',
    'absence-coach-b@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Absence Coach B"}'::jsonb
  );

INSERT INTO public.organizations (
  id,
  name,
  slug,
  status,
  timezone
)
VALUES
  (
    '00000000-0000-0000-0000-000000929001',
    'Absence Verification A',
    'absence-verification-a',
    'active',
    'Europe/Madrid'
  ),
  (
    '00000000-0000-0000-0000-000000929002',
    'Absence Verification B',
    'absence-verification-b',
    'active',
    'Europe/Madrid'
  );

INSERT INTO public.centers (
  id,
  organization_id,
  name,
  slug,
  timezone,
  status
)
VALUES
  (
    '00000000-0000-0000-0000-000000929301',
    '00000000-0000-0000-0000-000000929001',
    'Absence Center A',
    'absence-center-a',
    'Europe/Madrid',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000929302',
    '00000000-0000-0000-0000-000000929002',
    'Absence Center B',
    'absence-center-b',
    'Europe/Madrid',
    'active'
  );

INSERT INTO public.organization_memberships (
  id,
  organization_id,
  user_id,
  role,
  status,
  joined_at
)
VALUES
  (
    '00000000-0000-0000-0000-000000929201',
    '00000000-0000-0000-0000-000000929001',
    '00000000-0000-0000-0000-000000929101',
    'owner',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000929202',
    '00000000-0000-0000-0000-000000929001',
    '00000000-0000-0000-0000-000000929102',
    'manager',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000929203',
    '00000000-0000-0000-0000-000000929001',
    '00000000-0000-0000-0000-000000929103',
    'coach',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000929204',
    '00000000-0000-0000-0000-000000929001',
    '00000000-0000-0000-0000-000000929104',
    'coach',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000929205',
    '00000000-0000-0000-0000-000000929001',
    '00000000-0000-0000-0000-000000929105',
    'staff',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000929206',
    '00000000-0000-0000-0000-000000929002',
    '00000000-0000-0000-0000-000000929106',
    'owner',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000929207',
    '00000000-0000-0000-0000-000000929002',
    '00000000-0000-0000-0000-000000929107',
    'coach',
    'active',
    now()
  );

INSERT INTO public.person_profiles (
  id,
  organization_id,
  user_id,
  full_name,
  display_name,
  visibility_status,
  status
)
VALUES
  (
    '00000000-0000-0000-0000-000000929401',
    '00000000-0000-0000-0000-000000929001',
    '00000000-0000-0000-0000-000000929101',
    'Absence Owner A',
    'Absence Owner A',
    'visible',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000929402',
    '00000000-0000-0000-0000-000000929001',
    '00000000-0000-0000-0000-000000929102',
    'Absence Manager A',
    'Absence Manager A',
    'visible',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000929403',
    '00000000-0000-0000-0000-000000929001',
    '00000000-0000-0000-0000-000000929103',
    'Absence Coach A',
    'Absence Coach A',
    'visible',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000929404',
    '00000000-0000-0000-0000-000000929001',
    '00000000-0000-0000-0000-000000929104',
    'Absence Other Coach A',
    'Absence Other Coach A',
    'visible',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000929405',
    '00000000-0000-0000-0000-000000929001',
    '00000000-0000-0000-0000-000000929105',
    'Absence Staff A',
    'Absence Staff A',
    'visible',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000929406',
    '00000000-0000-0000-0000-000000929002',
    '00000000-0000-0000-0000-000000929106',
    'Absence Owner B',
    'Absence Owner B',
    'visible',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000929407',
    '00000000-0000-0000-0000-000000929002',
    '00000000-0000-0000-0000-000000929107',
    'Absence Coach B',
    'Absence Coach B',
    'visible',
    'active'
  );

INSERT INTO public.coach_profiles (
  id,
  organization_id,
  user_id,
  person_profile_id,
  primary_center_id,
  status
)
VALUES
  (
    '00000000-0000-0000-0000-000000929501',
    '00000000-0000-0000-0000-000000929001',
    '00000000-0000-0000-0000-000000929103',
    '00000000-0000-0000-0000-000000929403',
    '00000000-0000-0000-0000-000000929301',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000929502',
    '00000000-0000-0000-0000-000000929001',
    '00000000-0000-0000-0000-000000929104',
    '00000000-0000-0000-0000-000000929404',
    '00000000-0000-0000-0000-000000929301',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000929503',
    '00000000-0000-0000-0000-000000929002',
    '00000000-0000-0000-0000-000000929107',
    '00000000-0000-0000-0000-000000929407',
    '00000000-0000-0000-0000-000000929302',
    'active'
  );

INSERT INTO public.class_types (
  id,
  organization_id,
  name,
  slug,
  category,
  required_coaches,
  requires_certification,
  status
)
VALUES
  (
    '00000000-0000-0000-0000-000000929701',
    '00000000-0000-0000-0000-000000929001',
    'Absence Class A',
    'absence-class-a',
    'class',
    1,
    false,
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000929702',
    '00000000-0000-0000-0000-000000929002',
    'Absence Class B',
    'absence-class-b',
    'class',
    1,
    false,
    'active'
  );

INSERT INTO public.schedule_blocks (
  id,
  organization_id,
  center_id,
  service_date,
  start_time,
  end_time,
  class_type_id,
  required_coaches,
  status,
  notes
)
VALUES
  (
    '00000000-0000-0000-0000-000000929601',
    '00000000-0000-0000-0000-000000929001',
    '00000000-0000-0000-0000-000000929301',
    '2026-06-02',
    '09:00',
    '10:00',
    '00000000-0000-0000-0000-000000929701',
    1,
    'scheduled',
    'Absence impact block A'
  ),
  (
    '00000000-0000-0000-0000-000000929602',
    '00000000-0000-0000-0000-000000929002',
    '00000000-0000-0000-0000-000000929302',
    '2026-06-02',
    '09:00',
    '10:00',
    '00000000-0000-0000-0000-000000929702',
    1,
    'scheduled',
    'Absence cross-tenant block B'
  );

INSERT INTO public.schedule_block_assignments (
  id,
  organization_id,
  schedule_block_id,
  coach_profile_id,
  assignment_status,
  source
)
VALUES
  (
    '00000000-0000-0000-0000-000000929801',
    '00000000-0000-0000-0000-000000929001',
    '00000000-0000-0000-0000-000000929601',
    '00000000-0000-0000-0000-000000929501',
    'assigned',
    'manual'
  ),
  (
    '00000000-0000-0000-0000-000000929802',
    '00000000-0000-0000-0000-000000929002',
    '00000000-0000-0000-0000-000000929602',
    '00000000-0000-0000-0000-000000929503',
    'assigned',
    'manual'
  );

SET LOCAL ROLE authenticated;

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000929105');
SELECT pg_temp.assert_true(
  (SELECT count(*) FROM public.absence_requests WHERE organization_id = '00000000-0000-0000-0000-000000929001') = 0,
  'staff cannot read tenant absence requests by inheritance'
);
SELECT pg_temp.expect_rejected(
  'staff cannot create own absence request without absence self-service role',
  $statement$
    SELECT public.create_own_absence_request(
      '00000000-0000-0000-0000-000000929001',
      'vacation',
      '2026-06-02 00:00:00+02'::timestamptz,
      '2026-06-03 00:00:00+02'::timestamptz,
      true,
      'Europe/Madrid',
      NULL,
      now() + interval '14 days'
    )
  $statement$
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000929103');
CREATE TEMP TABLE own_absence_request AS
SELECT *
FROM public.create_own_absence_request(
  '00000000-0000-0000-0000-000000929001',
  'vacation',
  '2026-06-02 00:00:00+02'::timestamptz,
  '2026-06-03 00:00:00+02'::timestamptz,
  true,
  'Europe/Madrid',
  NULL,
  now() + interval '14 days'
);

SELECT pg_temp.assert_true(
  (
    SELECT
      status = 'pending_review'
      AND subject_person_profile_id = '00000000-0000-0000-0000-000000929403'
      AND subject_coach_profile_id = '00000000-0000-0000-0000-000000929501'
      AND requested_by_person_profile_id = '00000000-0000-0000-0000-000000929403'
      AND subject_person_profile_id <> '00000000-0000-0000-0000-000000929404'
    FROM own_absence_request
  ),
  'own absence request derives subject person and coach from auth user, not from client supplied person ids'
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 1
    FROM public.absence_request_periods
    WHERE organization_id = '00000000-0000-0000-0000-000000929001'
      AND absence_request_id = (SELECT id FROM own_absence_request)
      AND timezone = 'Europe/Madrid'
  ),
  'own absence request creates a tenant-scoped period'
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*) >= 2
    FROM public.absence_request_events
    WHERE organization_id = '00000000-0000-0000-0000-000000929001'
      AND absence_request_id = (SELECT id FROM own_absence_request)
      AND event_type IN ('absence_requested', 'absence_review_requested')
      AND changed_fields ? 'status'
      AND NOT changed_fields ? 'reason_summary'
  ),
  'own absence request records minimized own events'
);

SELECT pg_temp.expect_rejected(
  'invalid absence period is rejected',
  $statement$
    SELECT public.create_own_absence_request(
      '00000000-0000-0000-0000-000000929001',
      'day_off',
      '2026-06-03 00:00:00+02'::timestamptz,
      '2026-06-02 00:00:00+02'::timestamptz,
      true,
      'Europe/Madrid',
      NULL,
      NULL
    )
  $statement$
);

SELECT pg_temp.expect_rejected(
  'sensitive absence summary is rejected',
  $statement$
    SELECT public.create_own_absence_request(
      '00000000-0000-0000-0000-000000929001',
      'permission',
      '2026-06-04 00:00:00+02'::timestamptz,
      '2026-06-05 00:00:00+02'::timestamptz,
      true,
      'Europe/Madrid',
      'medical document attached',
      NULL
    )
  $statement$
);

CREATE TEMP TABLE cancellable_absence_request AS
SELECT *
FROM public.create_own_absence_request(
  '00000000-0000-0000-0000-000000929001',
  'day_off',
  '2026-06-05 00:00:00+02'::timestamptz,
  '2026-06-06 00:00:00+02'::timestamptz,
  true,
  'Europe/Madrid',
  NULL,
  NULL
);

SELECT public.cancel_absence_request(
  '00000000-0000-0000-0000-000000929001',
  (SELECT id FROM cancellable_absence_request)
);

SELECT pg_temp.assert_true(
  (
    SELECT status = 'cancelled'
    FROM public.absence_requests
    WHERE id = (SELECT id FROM cancellable_absence_request)
      AND organization_id = '00000000-0000-0000-0000-000000929001'
  ),
  'coach can cancel own pending absence request'
);

CREATE TEMP TABLE expirable_absence_request AS
SELECT *
FROM public.create_own_absence_request(
  '00000000-0000-0000-0000-000000929001',
  'unavailable',
  '2026-05-01 00:00:00+02'::timestamptz,
  '2026-05-02 00:00:00+02'::timestamptz,
  true,
  'Europe/Madrid',
  NULL,
  NULL
);

SELECT public.expire_absence_request(
  '00000000-0000-0000-0000-000000929001',
  (SELECT id FROM expirable_absence_request)
);

SELECT pg_temp.assert_true(
  (
    SELECT status = 'expired'
    FROM public.absence_requests
    WHERE id = (SELECT id FROM expirable_absence_request)
      AND organization_id = '00000000-0000-0000-0000-000000929001'
  ),
  'coach can expire own objectively past pending absence request'
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000929102');
SELECT public.review_absence_request(
  '00000000-0000-0000-0000-000000929001',
  (SELECT id FROM own_absence_request),
  'approved'
);

SELECT pg_temp.assert_true(
  (
    SELECT
      status = 'approved'
      AND reviewed_by_membership_id = '00000000-0000-0000-0000-000000929202'
      AND reviewed_by_person_profile_id = '00000000-0000-0000-0000-000000929402'
    FROM public.absence_requests
    WHERE id = (SELECT id FROM own_absence_request)
      AND organization_id = '00000000-0000-0000-0000-000000929001'
  ),
  'manager can approve a tenant absence request with actor derived from auth'
);

CREATE TEMP TABLE computed_absence_impacts AS
SELECT *
FROM public.list_absence_schedule_impacts(
  '00000000-0000-0000-0000-000000929001',
  (SELECT id FROM own_absence_request)
);

SELECT pg_temp.assert_true(
  (
    SELECT
      count(*) = 1
      AND bool_and(organization_id = '00000000-0000-0000-0000-000000929001')
      AND bool_and(schedule_block_id = '00000000-0000-0000-0000-000000929601')
      AND bool_and(schedule_block_assignment_id = '00000000-0000-0000-0000-000000929801')
      AND bool_and(impact_status = 'coverage_needed')
    FROM computed_absence_impacts
  ),
  'approved absence impact is computed from same-tenant assigned schedule blocks'
);

SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1
    FROM computed_absence_impacts
    WHERE schedule_block_id = '00000000-0000-0000-0000-000000929602'
      OR schedule_block_assignment_id = '00000000-0000-0000-0000-000000929802'
  ),
  'computed absence impact never crosses into another tenant schedule'
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000929106');
SELECT pg_temp.assert_true(
  (SELECT count(*) FROM public.absence_requests WHERE organization_id = '00000000-0000-0000-0000-000000929001') = 0,
  'other tenant owner cannot read tenant A absence requests'
);
SELECT pg_temp.assert_true(
  (SELECT count(*) FROM public.absence_request_periods WHERE organization_id = '00000000-0000-0000-0000-000000929001') = 0,
  'other tenant owner cannot read tenant A absence periods'
);
SELECT pg_temp.assert_true(
  (SELECT count(*) FROM public.absence_request_events WHERE organization_id = '00000000-0000-0000-0000-000000929001') = 0,
  'other tenant owner cannot read tenant A absence events'
);
SELECT pg_temp.expect_rejected(
  'other tenant owner cannot review tenant A absence request',
  $statement$
    SELECT public.review_absence_request(
      '00000000-0000-0000-0000-000000929001',
      (SELECT id FROM own_absence_request),
      'rejected'
    )
  $statement$
);
SELECT pg_temp.expect_rejected(
  'other tenant owner cannot compute tenant A absence impacts',
  $statement$
    SELECT *
    FROM public.list_absence_schedule_impacts(
      '00000000-0000-0000-0000-000000929001',
      (SELECT id FROM own_absence_request)
    )
  $statement$
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000929103');
SELECT pg_temp.expect_rejected(
  'direct insert on absence_requests with another person is blocked for authenticated',
  $statement$
    INSERT INTO public.absence_requests (
      organization_id,
      subject_person_profile_id,
      subject_coach_profile_id,
      requested_by_user_id,
      requested_by_membership_id,
      requested_by_person_profile_id,
      absence_type,
      status
    )
    VALUES (
      '00000000-0000-0000-0000-000000929001',
      '00000000-0000-0000-0000-000000929404',
      '00000000-0000-0000-0000-000000929502',
      '00000000-0000-0000-0000-000000929103',
      '00000000-0000-0000-0000-000000929203',
      '00000000-0000-0000-0000-000000929403',
      'vacation',
      'pending_review'
    )
  $statement$
);
SELECT pg_temp.expect_rejected(
  'direct update on absence_requests is blocked for authenticated',
  $statement$
    UPDATE public.absence_requests
    SET status = 'cancelled'
    WHERE id = (SELECT id FROM own_absence_request)
      AND organization_id = '00000000-0000-0000-0000-000000929001'
  $statement$
);
SELECT pg_temp.expect_rejected(
  'direct insert on absence_request_periods is blocked for authenticated',
  $statement$
    INSERT INTO public.absence_request_periods (
      organization_id,
      absence_request_id,
      starts_at,
      ends_at,
      all_day,
      timezone
    )
    VALUES (
      '00000000-0000-0000-0000-000000929001',
      (SELECT id FROM own_absence_request),
      '2026-06-07 00:00:00+02'::timestamptz,
      '2026-06-08 00:00:00+02'::timestamptz,
      true,
      'Europe/Madrid'
    )
  $statement$
);
SELECT pg_temp.expect_rejected(
  'direct insert on absence_request_events is blocked for authenticated',
  $statement$
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
      '00000000-0000-0000-0000-000000929001',
      (SELECT id FROM own_absence_request),
      '00000000-0000-0000-0000-000000929103',
      '00000000-0000-0000-0000-000000929203',
      '00000000-0000-0000-0000-000000929403',
      'absence_cancelled',
      'success',
      '{}'::jsonb,
      now() + interval '180 days'
    )
  $statement$
);
SELECT pg_temp.expect_rejected(
  'direct delete on absence_request_events is blocked for authenticated',
  $statement$
    DELETE FROM public.absence_request_events
    WHERE organization_id = '00000000-0000-0000-0000-000000929001'
      AND absence_request_id = (SELECT id FROM own_absence_request)
  $statement$
);

RESET ROLE;

ROLLBACK;
