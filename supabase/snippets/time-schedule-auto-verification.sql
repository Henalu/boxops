-- BoxOps - F.11 schedule auto time punches verification
--
-- Run locally with:
--   Get-Content -Raw supabase/snippets/time-schedule-auto-verification.sql | docker exec -i supabase_db_boxops psql -U postgres -d postgres -v ON_ERROR_STOP=1
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
    RAISE EXCEPTION 'schedule auto verification failed: %', label;
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
    '00000000-0000-0000-0000-000000925101',
    'authenticated',
    'authenticated',
    'schedule-auto-manager-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Schedule Auto Manager A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000925102',
    'authenticated',
    'authenticated',
    'schedule-auto-coach-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Schedule Auto Coach A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000925103',
    'authenticated',
    'authenticated',
    'schedule-auto-manager-disabled@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Schedule Auto Manager Disabled"}'::jsonb
  );

INSERT INTO public.organizations (
  id,
  name,
  slug,
  status,
  timezone,
  time_tracking_config
)
VALUES
  (
    '00000000-0000-0000-0000-000000925001',
    'Schedule Auto Verification A',
    'schedule-auto-verification-a',
    'active',
    'Europe/Madrid',
    '{"version":1,"correctionApprovalRequired":false,"scheduleAutoPunchesEnabled":true}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000925002',
    'Schedule Auto Verification Disabled',
    'schedule-auto-verification-disabled',
    'active',
    'Europe/Madrid',
    '{"version":1,"correctionApprovalRequired":false,"scheduleAutoPunchesEnabled":false}'::jsonb
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
    '00000000-0000-0000-0000-000000925201',
    '00000000-0000-0000-0000-000000925001',
    '00000000-0000-0000-0000-000000925101',
    'manager',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000925202',
    '00000000-0000-0000-0000-000000925001',
    '00000000-0000-0000-0000-000000925102',
    'coach',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000925203',
    '00000000-0000-0000-0000-000000925002',
    '00000000-0000-0000-0000-000000925103',
    'manager',
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
    '00000000-0000-0000-0000-000000925401',
    '00000000-0000-0000-0000-000000925001',
    '00000000-0000-0000-0000-000000925102',
    'Schedule Auto Coach A',
    'Schedule Auto Coach A',
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
    '00000000-0000-0000-0000-000000925301',
    '00000000-0000-0000-0000-000000925001',
    'Schedule Auto Center A',
    'schedule-auto-center-a',
    'Europe/Madrid',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000925302',
    '00000000-0000-0000-0000-000000925002',
    'Schedule Auto Center Disabled',
    'schedule-auto-center-disabled',
    'Europe/Madrid',
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
VALUES (
  '00000000-0000-0000-0000-000000925501',
  '00000000-0000-0000-0000-000000925001',
  '00000000-0000-0000-0000-000000925102',
  '00000000-0000-0000-0000-000000925401',
  '00000000-0000-0000-0000-000000925301',
  'active'
);

INSERT INTO public.class_types (
  id,
  organization_id,
  name,
  slug,
  category,
  required_coaches,
  status
)
VALUES (
  '00000000-0000-0000-0000-000000925701',
  '00000000-0000-0000-0000-000000925001',
  'Schedule Auto Class A',
  'schedule-auto-class-a',
  'class',
  1,
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
    '00000000-0000-0000-0000-000000925601',
    '00000000-0000-0000-0000-000000925001',
    '00000000-0000-0000-0000-000000925301',
    '2026-05-18',
    '09:00',
    '10:00',
    '00000000-0000-0000-0000-000000925701',
    1,
    'scheduled',
    'Schedule auto verification active block'
  ),
  (
    '00000000-0000-0000-0000-000000925602',
    '00000000-0000-0000-0000-000000925001',
    '00000000-0000-0000-0000-000000925301',
    '2026-05-18',
    '11:00',
    '12:00',
    '00000000-0000-0000-0000-000000925701',
    1,
    'cancelled',
    'Schedule auto verification cancelled block'
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
    '00000000-0000-0000-0000-000000925801',
    '00000000-0000-0000-0000-000000925001',
    '00000000-0000-0000-0000-000000925601',
    '00000000-0000-0000-0000-000000925501',
    'assigned',
    'manual'
  ),
  (
    '00000000-0000-0000-0000-000000925802',
    '00000000-0000-0000-0000-000000925001',
    '00000000-0000-0000-0000-000000925602',
    '00000000-0000-0000-0000-000000925501',
    'assigned',
    'manual'
  );

SET LOCAL ROLE authenticated;
SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000925101');

CREATE TEMP TABLE schedule_auto_first_run AS
SELECT *
FROM public.generate_schedule_auto_time_punches(
  '00000000-0000-0000-0000-000000925001',
  '2026-05-18',
  '2026-05-18',
  NULL
);

SELECT pg_temp.assert_true(
  (SELECT count(*) FROM schedule_auto_first_run) = 1,
  'first run returns only the active assigned block'
);
SELECT pg_temp.assert_true(
  (SELECT bool_and(inserted_clock_in AND inserted_clock_out) FROM schedule_auto_first_run),
  'first run inserts both planned punches'
);
SELECT pg_temp.assert_true(
  (
    SELECT count(*)
    FROM public.time_punches
    WHERE organization_id = '00000000-0000-0000-0000-000000925001'
      AND source = 'schedule_auto'
  ) = 2,
  'first run creates exactly two schedule_auto punches'
);
SELECT pg_temp.assert_true(
  (
    SELECT bool_and((metadata ->> 'presenceVerified') = 'false')
    FROM public.time_punches
    WHERE organization_id = '00000000-0000-0000-0000-000000925001'
      AND source = 'schedule_auto'
  ),
  'schedule_auto punches explicitly do not verify real presence'
);
SELECT pg_temp.assert_true(
  (
    SELECT count(*)
    FROM public.time_punches
    WHERE schedule_block_assignment_id = '00000000-0000-0000-0000-000000925802'
      AND source = 'schedule_auto'
  ) = 0,
  'cancelled assigned blocks do not generate punches'
);

CREATE TEMP TABLE schedule_auto_second_run AS
SELECT *
FROM public.generate_schedule_auto_time_punches(
  '00000000-0000-0000-0000-000000925001',
  '2026-05-18',
  '2026-05-18',
  NULL
);

SELECT pg_temp.assert_true(
  (SELECT bool_and(NOT inserted_clock_in AND NOT inserted_clock_out) FROM schedule_auto_second_run),
  'second run is idempotent and does not insert again'
);
SELECT pg_temp.assert_true(
  (
    SELECT count(*)
    FROM public.time_punches
    WHERE organization_id = '00000000-0000-0000-0000-000000925001'
      AND source = 'schedule_auto'
  ) = 2,
  'second run keeps the schedule_auto punch count stable'
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000925102');
SELECT pg_temp.expect_rejected(
  'coach cannot generate schedule auto punches for tenant',
  $statement$
    SELECT *
    FROM public.generate_schedule_auto_time_punches(
      '00000000-0000-0000-0000-000000925001',
      '2026-05-18',
      '2026-05-18',
      NULL
    )
  $statement$
);

SELECT pg_temp.expect_rejected(
  'authenticated direct insert cannot forge schedule_auto source',
  $statement$
    INSERT INTO public.time_punches (
      organization_id,
      time_record_id,
      person_profile_id,
      punch_type,
      occurred_at,
      timezone,
      source,
      status,
      created_by_user_id,
      metadata
    )
    SELECT
      '00000000-0000-0000-0000-000000925001',
      time_record.id,
      '00000000-0000-0000-0000-000000925401',
      'clock_in',
      now(),
      'Europe/Madrid',
      'schedule_auto',
      'active',
      '00000000-0000-0000-0000-000000925102',
      '{"presenceVerified":false}'::jsonb
    FROM public.time_records time_record
    WHERE time_record.organization_id = '00000000-0000-0000-0000-000000925001'
      AND time_record.person_profile_id = '00000000-0000-0000-0000-000000925401'
    LIMIT 1
  $statement$
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000925103');
SELECT pg_temp.expect_rejected(
  'disabled tenant cannot generate schedule auto punches',
  $statement$
    SELECT *
    FROM public.generate_schedule_auto_time_punches(
      '00000000-0000-0000-0000-000000925002',
      '2026-05-18',
      '2026-05-18',
      NULL
    )
  $statement$
);

RESET ROLE;

ROLLBACK;

