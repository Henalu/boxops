-- BoxOps - S.73 tenant boundary time_records/time_punches RLS rollback verification
--
-- Run locally with:
--   Get-Content -Raw supabase/snippets/tenant-boundary-time-records-punches-rls-rollback.sql | docker exec -i supabase_db_boxops psql -U postgres -d postgres -v ON_ERROR_STOP=1
--
-- The script runs inside a transaction and rolls back all fixture data. It
-- validates a minimal tenant/RLS case from the negative-test matrix for the
-- canonical time-tracking rows only: workers can create/read their own
-- records and punches under the current DB policies, managers can read tenant
-- rows, payroll_manager does not inherit time-tracking review access, tenant
-- A/B stay isolated, cross-tenant references are rejected, and normal direct
-- UPDATE/DELETE attempts do not affect rows under RLS.
--
-- This intentionally does not validate /app/time Server Actions, browser
-- runtime, POST direct behavior, approval/reopening with real profile
-- signature, CSV generation/download, scheduler behavior, legal retention,
-- payroll, geolocation, Storage, SMTP, staging, evidence from a real tenant,
-- or F.15 beta readiness. It also does not claim to close direct SQL TRUNCATE
-- grant posture; that is separate grant-hardening work, not RLS behavior.

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
    RAISE EXCEPTION 'tenant boundary time records/punches RLS verification failed: %', label;
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

CREATE OR REPLACE FUNCTION pg_temp.expect_no_affected_rows(
  label text,
  statement text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  affected_rows integer := 0;
BEGIN
  EXECUTE statement;
  GET DIAGNOSTICS affected_rows = ROW_COUNT;

  IF affected_rows <> 0 THEN
    RAISE EXCEPTION 'statement affected % row(s): %', affected_rows, label;
  END IF;

  RAISE NOTICE 'ok - no rows affected: %', label;
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
    '00000000-0000-0000-0000-000000973101',
    'authenticated',
    'authenticated',
    'tenant-boundary-time-records-owner-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Tenant Boundary Time Records Owner A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000973102',
    'authenticated',
    'authenticated',
    'tenant-boundary-time-records-admin-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Tenant Boundary Time Records Admin A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000973103',
    'authenticated',
    'authenticated',
    'tenant-boundary-time-records-manager-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Tenant Boundary Time Records Manager A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000973104',
    'authenticated',
    'authenticated',
    'tenant-boundary-time-records-coach-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Tenant Boundary Time Records Coach A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000973105',
    'authenticated',
    'authenticated',
    'tenant-boundary-time-records-other-coach-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Tenant Boundary Time Records Other Coach A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000973106',
    'authenticated',
    'authenticated',
    'tenant-boundary-time-records-payroll-manager-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Tenant Boundary Time Records Payroll Manager A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000973107',
    'authenticated',
    'authenticated',
    'tenant-boundary-time-records-manager-b@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Tenant Boundary Time Records Manager B"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000973108',
    'authenticated',
    'authenticated',
    'tenant-boundary-time-records-coach-b@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Tenant Boundary Time Records Coach B"}'::jsonb
  );

INSERT INTO public.organizations (id, name, slug, status, timezone)
VALUES
  (
    '00000000-0000-0000-0000-000000973001',
    'Tenant Boundary Time Records A',
    'tenant-boundary-time-records-a',
    'active',
    'Europe/Madrid'
  ),
  (
    '00000000-0000-0000-0000-000000973002',
    'Tenant Boundary Time Records B',
    'tenant-boundary-time-records-b',
    'active',
    'Europe/Madrid'
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
    '00000000-0000-0000-0000-000000973201',
    '00000000-0000-0000-0000-000000973001',
    '00000000-0000-0000-0000-000000973101',
    'owner',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000973202',
    '00000000-0000-0000-0000-000000973001',
    '00000000-0000-0000-0000-000000973102',
    'admin',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000973203',
    '00000000-0000-0000-0000-000000973001',
    '00000000-0000-0000-0000-000000973103',
    'manager',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000973204',
    '00000000-0000-0000-0000-000000973001',
    '00000000-0000-0000-0000-000000973104',
    'coach',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000973205',
    '00000000-0000-0000-0000-000000973001',
    '00000000-0000-0000-0000-000000973105',
    'coach',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000973206',
    '00000000-0000-0000-0000-000000973001',
    '00000000-0000-0000-0000-000000973106',
    'payroll_manager',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000973207',
    '00000000-0000-0000-0000-000000973002',
    '00000000-0000-0000-0000-000000973107',
    'manager',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000973208',
    '00000000-0000-0000-0000-000000973002',
    '00000000-0000-0000-0000-000000973108',
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
    '00000000-0000-0000-0000-000000973401',
    '00000000-0000-0000-0000-000000973001',
    '00000000-0000-0000-0000-000000973101',
    'Tenant Boundary Time Records Owner A',
    'Tenant Boundary Time Records Owner A',
    'visible',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000973402',
    '00000000-0000-0000-0000-000000973001',
    '00000000-0000-0000-0000-000000973102',
    'Tenant Boundary Time Records Admin A',
    'Tenant Boundary Time Records Admin A',
    'visible',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000973403',
    '00000000-0000-0000-0000-000000973001',
    '00000000-0000-0000-0000-000000973103',
    'Tenant Boundary Time Records Manager A',
    'Tenant Boundary Time Records Manager A',
    'visible',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000973404',
    '00000000-0000-0000-0000-000000973001',
    '00000000-0000-0000-0000-000000973104',
    'Tenant Boundary Time Records Coach A',
    'Tenant Boundary Time Records Coach A',
    'visible',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000973405',
    '00000000-0000-0000-0000-000000973001',
    '00000000-0000-0000-0000-000000973105',
    'Tenant Boundary Time Records Other Coach A',
    'Tenant Boundary Time Records Other Coach A',
    'visible',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000973406',
    '00000000-0000-0000-0000-000000973001',
    '00000000-0000-0000-0000-000000973106',
    'Tenant Boundary Time Records Payroll Manager A',
    'Tenant Boundary Time Records Payroll Manager A',
    'visible',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000973407',
    '00000000-0000-0000-0000-000000973002',
    '00000000-0000-0000-0000-000000973107',
    'Tenant Boundary Time Records Manager B',
    'Tenant Boundary Time Records Manager B',
    'visible',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000973408',
    '00000000-0000-0000-0000-000000973002',
    '00000000-0000-0000-0000-000000973108',
    'Tenant Boundary Time Records Coach B',
    'Tenant Boundary Time Records Coach B',
    'visible',
    'active'
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
    '00000000-0000-0000-0000-000000973301',
    '00000000-0000-0000-0000-000000973001',
    'Tenant Boundary Time Records Center A',
    'tenant-boundary-time-records-center-a',
    'Europe/Madrid',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000973302',
    '00000000-0000-0000-0000-000000973002',
    'Tenant Boundary Time Records Center B',
    'tenant-boundary-time-records-center-b',
    'Europe/Madrid',
    'active'
  );

SET LOCAL ROLE authenticated;

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000973104');

INSERT INTO public.time_records (
  id,
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
  '00000000-0000-0000-0000-000000973501',
  '00000000-0000-0000-0000-000000973001',
  '00000000-0000-0000-0000-000000973404',
  '2026-05-18',
  'Europe/Madrid',
  '00000000-0000-0000-0000-000000973301',
  'open',
  '00000000-0000-0000-0000-000000973104',
  '00000000-0000-0000-0000-000000973204',
  '{"qa":"S.73","case":"direct-own-record"}'::jsonb
);

INSERT INTO public.time_punches (
  id,
  organization_id,
  time_record_id,
  person_profile_id,
  punch_type,
  occurred_at,
  timezone,
  center_id,
  source,
  status,
  created_by_user_id,
  created_by_membership_id,
  notes,
  metadata
)
VALUES (
  '00000000-0000-0000-0000-000000973601',
  '00000000-0000-0000-0000-000000973001',
  '00000000-0000-0000-0000-000000973501',
  '00000000-0000-0000-0000-000000973404',
  'clock_in',
  '2026-05-18 08:00:00+02'::timestamptz,
  'Europe/Madrid',
  '00000000-0000-0000-0000-000000973301',
  'manual',
  'active',
  '00000000-0000-0000-0000-000000973104',
  '00000000-0000-0000-0000-000000973204',
  'Tenant A coach A synthetic punch',
  '{"qa":"S.73","case":"direct-own-punch"}'::jsonb
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 1
      AND bool_and(person_profile_id = '00000000-0000-0000-0000-000000973404')
    FROM public.time_records
    WHERE organization_id = '00000000-0000-0000-0000-000000973001'
  ),
  'tenant A coach can directly create and read own time record under current DB policies'
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 1
      AND bool_and(person_profile_id = '00000000-0000-0000-0000-000000973404')
      AND bool_and(source = 'manual')
      AND bool_and(status = 'active')
    FROM public.time_punches
    WHERE organization_id = '00000000-0000-0000-0000-000000973001'
  ),
  'tenant A coach can directly create and read own manual active time punch under current DB policies'
);

SELECT pg_temp.expect_rejected(
  'tenant A coach cannot directly create time record for another same-tenant person',
  $statement$
    INSERT INTO public.time_records (
      id,
      organization_id,
      person_profile_id,
      local_work_date,
      timezone,
      status,
      created_by_user_id,
      created_by_membership_id,
      metadata
    )
    VALUES (
      '00000000-0000-0000-0000-000000973502',
      '00000000-0000-0000-0000-000000973001',
      '00000000-0000-0000-0000-000000973405',
      '2026-05-18',
      'Europe/Madrid',
      'open',
      '00000000-0000-0000-0000-000000973104',
      '00000000-0000-0000-0000-000000973204',
      '{"qa":"S.73","case":"other-person-record"}'::jsonb
    )
  $statement$
);

SELECT pg_temp.expect_rejected(
  'tenant A coach cannot directly create own time record with tenant B center',
  $statement$
    INSERT INTO public.time_records (
      id,
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
      '00000000-0000-0000-0000-000000973503',
      '00000000-0000-0000-0000-000000973001',
      '00000000-0000-0000-0000-000000973404',
      '2026-05-19',
      'Europe/Madrid',
      '00000000-0000-0000-0000-000000973302',
      'open',
      '00000000-0000-0000-0000-000000973104',
      '00000000-0000-0000-0000-000000973204',
      '{"qa":"S.73","case":"tenant-b-center"}'::jsonb
    )
  $statement$
);

SELECT pg_temp.expect_rejected(
  'tenant A coach cannot directly create own time punch with tenant B center',
  $statement$
    INSERT INTO public.time_punches (
      id,
      organization_id,
      time_record_id,
      person_profile_id,
      punch_type,
      occurred_at,
      timezone,
      center_id,
      source,
      status,
      created_by_user_id,
      created_by_membership_id,
      metadata
    )
    VALUES (
      '00000000-0000-0000-0000-000000973602',
      '00000000-0000-0000-0000-000000973001',
      '00000000-0000-0000-0000-000000973501',
      '00000000-0000-0000-0000-000000973404',
      'clock_out',
      '2026-05-18 09:00:00+02'::timestamptz,
      'Europe/Madrid',
      '00000000-0000-0000-0000-000000973302',
      'manual',
      'active',
      '00000000-0000-0000-0000-000000973104',
      '00000000-0000-0000-0000-000000973204',
      '{"qa":"S.73","case":"tenant-b-center"}'::jsonb
    )
  $statement$
);

SELECT pg_temp.expect_rejected(
  'tenant A coach cannot directly create record in tenant B',
  $statement$
    INSERT INTO public.time_records (
      id,
      organization_id,
      person_profile_id,
      local_work_date,
      timezone,
      status,
      created_by_user_id,
      created_by_membership_id,
      metadata
    )
    VALUES (
      '00000000-0000-0000-0000-000000973504',
      '00000000-0000-0000-0000-000000973002',
      '00000000-0000-0000-0000-000000973408',
      '2026-05-18',
      'Europe/Madrid',
      'open',
      '00000000-0000-0000-0000-000000973104',
      '00000000-0000-0000-0000-000000973204',
      '{"qa":"S.73","case":"tenant-b-record"}'::jsonb
    )
  $statement$
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000973105');

SELECT public.create_own_time_punch(
  '00000000-0000-0000-0000-000000973001',
  'clock_in',
  '2026-05-19 08:00:00+02'::timestamptz,
  '2026-05-19',
  NULL,
  NULL,
  NULL,
  'Tenant A other coach synthetic punch',
  '{"qa":"S.73","case":"other-coach-rpc-fixture"}'::jsonb
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000973104');

SELECT pg_temp.expect_no_affected_rows(
  'tenant A coach direct punch insert from another person record has no effect',
  $statement$
    INSERT INTO public.time_punches (
      id,
      organization_id,
      time_record_id,
      person_profile_id,
      punch_type,
      occurred_at,
      timezone,
      source,
      status,
      created_by_user_id,
      created_by_membership_id,
      metadata
    )
    SELECT
      '00000000-0000-0000-0000-000000973603',
      '00000000-0000-0000-0000-000000973001',
      time_record.id,
      '00000000-0000-0000-0000-000000973405',
      'clock_out',
      '2026-05-19 09:00:00+02'::timestamptz,
      'Europe/Madrid',
      'manual',
      'active',
      '00000000-0000-0000-0000-000000973104',
      '00000000-0000-0000-0000-000000973204',
      '{"qa":"S.73","case":"other-person-punch"}'::jsonb
    FROM public.time_records time_record
    WHERE time_record.organization_id = '00000000-0000-0000-0000-000000973001'
      AND time_record.person_profile_id = '00000000-0000-0000-0000-000000973405'
    LIMIT 1
  $statement$
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 1
      AND bool_and(person_profile_id = '00000000-0000-0000-0000-000000973404')
    FROM public.time_records
    WHERE organization_id = '00000000-0000-0000-0000-000000973001'
  ),
  'tenant A coach sees only own time records after another coach fixture exists'
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 1
      AND bool_and(person_profile_id = '00000000-0000-0000-0000-000000973404')
    FROM public.time_punches
    WHERE organization_id = '00000000-0000-0000-0000-000000973001'
  ),
  'tenant A coach sees only own time punches after another coach fixture exists'
);

SELECT pg_temp.expect_no_affected_rows(
  'tenant A coach direct update of time records has no effect',
  $statement$
    UPDATE public.time_records
    SET metadata = '{"qa":"S.73","case":"direct-update-record"}'::jsonb
    WHERE organization_id = '00000000-0000-0000-0000-000000973001'
  $statement$
);

SELECT pg_temp.expect_no_affected_rows(
  'tenant A coach direct update of time punches has no effect',
  $statement$
    UPDATE public.time_punches
    SET status = 'voided'
    WHERE organization_id = '00000000-0000-0000-0000-000000973001'
  $statement$
);

SELECT pg_temp.expect_no_affected_rows(
  'tenant A coach direct delete of time punches has no effect',
  $statement$
    DELETE FROM public.time_punches
    WHERE organization_id = '00000000-0000-0000-0000-000000973001'
  $statement$
);

SELECT pg_temp.expect_no_affected_rows(
  'tenant A coach direct delete of time records has no effect',
  $statement$
    DELETE FROM public.time_records
    WHERE organization_id = '00000000-0000-0000-0000-000000973001'
  $statement$
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000973101');

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 2
    FROM public.time_records
    WHERE organization_id = '00000000-0000-0000-0000-000000973001'
  ),
  'tenant A owner can read all tenant A time records'
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000973102');

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 2
    FROM public.time_punches
    WHERE organization_id = '00000000-0000-0000-0000-000000973001'
  ),
  'tenant A admin can read all tenant A time punches'
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000973103');

SELECT pg_temp.assert_true(
  public.can_manage_time_tracking('00000000-0000-0000-0000-000000973001')
    AND (
      SELECT count(*) = 2
      FROM public.time_records
      WHERE organization_id = '00000000-0000-0000-0000-000000973001'
    )
    AND (
      SELECT count(*) = 2
      FROM public.time_punches
      WHERE organization_id = '00000000-0000-0000-0000-000000973001'
    ),
  'tenant A manager can read all tenant A time records and punches'
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000973106');

SELECT pg_temp.assert_true(
  NOT public.can_manage_time_tracking('00000000-0000-0000-0000-000000973001')
    AND (
      SELECT count(*) = 0
      FROM public.time_records
      WHERE organization_id = '00000000-0000-0000-0000-000000973001'
    )
    AND (
      SELECT count(*) = 0
      FROM public.time_punches
      WHERE organization_id = '00000000-0000-0000-0000-000000973001'
    ),
  'payroll_manager does not inherit time record or punch review access'
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000973108');

SELECT public.create_own_time_punch(
  '00000000-0000-0000-0000-000000973002',
  'clock_in',
  '2026-05-18 08:00:00+02'::timestamptz,
  '2026-05-18',
  NULL,
  NULL,
  NULL,
  'Tenant B coach synthetic punch',
  '{"qa":"S.73","case":"tenant-b-rpc-fixture"}'::jsonb
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 1
      AND bool_and(organization_id = '00000000-0000-0000-0000-000000973002')
      AND bool_and(person_profile_id = '00000000-0000-0000-0000-000000973408')
    FROM public.time_records
    WHERE organization_id = '00000000-0000-0000-0000-000000973002'
  ),
  'tenant B coach can create and read only tenant B own time record'
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 0
    FROM public.time_records
    WHERE organization_id = '00000000-0000-0000-0000-000000973001'
  ),
  'tenant B coach cannot read tenant A time records'
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000973107');

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 1
    FROM public.time_records
    WHERE organization_id = '00000000-0000-0000-0000-000000973002'
  ),
  'tenant B manager can read tenant B time records'
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 0
    FROM public.time_records
    WHERE organization_id = '00000000-0000-0000-0000-000000973001'
  ),
  'tenant B manager cannot read tenant A time records'
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 0
    FROM public.time_punches
    WHERE organization_id = '00000000-0000-0000-0000-000000973001'
  ),
  'tenant B manager cannot read tenant A time punches'
);

RESET ROLE;

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 2
    FROM public.time_records
    WHERE organization_id = '00000000-0000-0000-0000-000000973001'
  )
    AND (
      SELECT count(*) = 2
      FROM public.time_punches
      WHERE organization_id = '00000000-0000-0000-0000-000000973001'
    )
    AND (
      SELECT count(*) = 1
      FROM public.time_records
      WHERE organization_id = '00000000-0000-0000-0000-000000973002'
    )
    AND (
      SELECT count(*) = 1
      FROM public.time_punches
      WHERE organization_id = '00000000-0000-0000-0000-000000973002'
    ),
  'tenant A/B time records and punches remain scoped before rollback'
);

SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1
    FROM public.time_records
    WHERE id IN (
      '00000000-0000-0000-0000-000000973502',
      '00000000-0000-0000-0000-000000973503',
      '00000000-0000-0000-0000-000000973504'
    )
  )
    AND NOT EXISTS (
      SELECT 1
      FROM public.time_punches
      WHERE id IN (
        '00000000-0000-0000-0000-000000973602',
        '00000000-0000-0000-0000-000000973603'
      )
    ),
  'forbidden direct time record and punch inserts were not persisted before rollback'
);

ROLLBACK;
