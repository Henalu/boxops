-- BoxOps - staff work window auto time punches verification
--
-- Run locally after applying migration 00047 with:
--   Get-Content -Raw supabase/snippets/time-staff-work-window-auto-verification.sql | docker exec -i supabase_db_boxops psql -U postgres -d postgres -v ON_ERROR_STOP=1
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
    RAISE EXCEPTION 'staff work window auto verification failed: %', label;
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

GRANT EXECUTE ON FUNCTION pg_temp.assert_true(boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.use_auth_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.expect_rejected(text, text) TO authenticated;

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
    '00000000-0000-0000-0000-000000927101',
    'authenticated',
    'authenticated',
    'staff-window-auto-manager@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Staff Window Auto Manager"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000927102',
    'authenticated',
    'authenticated',
    'staff-window-auto-coach@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Staff Window Auto Coach"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000927103',
    'authenticated',
    'authenticated',
    'staff-window-auto-disabled@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Staff Window Auto Disabled"}'::jsonb
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
    '00000000-0000-0000-0000-000000927001',
    'Staff Window Auto Verification',
    'staff-window-auto-verification',
    'active',
    'Europe/Madrid',
    '{"version":1,"correctionApprovalRequired":false,"scheduleAutoPunchesEnabled":true}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000927002',
    'Staff Window Auto Disabled',
    'staff-window-auto-disabled',
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
    '00000000-0000-0000-0000-000000927201',
    '00000000-0000-0000-0000-000000927001',
    '00000000-0000-0000-0000-000000927101',
    'manager',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000927202',
    '00000000-0000-0000-0000-000000927001',
    '00000000-0000-0000-0000-000000927102',
    'coach',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000927203',
    '00000000-0000-0000-0000-000000927002',
    '00000000-0000-0000-0000-000000927103',
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
    '00000000-0000-0000-0000-000000927401',
    '00000000-0000-0000-0000-000000927001',
    '00000000-0000-0000-0000-000000927102',
    'Staff Window Auto Coach',
    'Staff Window Auto Coach',
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
VALUES (
  '00000000-0000-0000-0000-000000927301',
  '00000000-0000-0000-0000-000000927001',
  'Staff Window Auto Center',
  'staff-window-auto-center',
  'Europe/Madrid',
  'active'
);

INSERT INTO public.staff_work_windows (
  id,
  organization_id,
  person_profile_id,
  center_id,
  day_of_week,
  start_time,
  end_time,
  valid_from,
  valid_until,
  status,
  notes
)
VALUES (
  '00000000-0000-0000-0000-000000927601',
  '00000000-0000-0000-0000-000000927001',
  '00000000-0000-0000-0000-000000927401',
  '00000000-0000-0000-0000-000000927301',
  1,
  '09:30',
  '13:30',
  '2026-05-18',
  '2026-06-15',
  'active',
  'Synthetic staff window auto verification'
);

SET LOCAL ROLE authenticated;
SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000927101');

CREATE TEMP TABLE staff_window_auto_start AS
SELECT *
FROM public.generate_staff_work_window_auto_time_punches(
  '00000000-0000-0000-0000-000000927001',
  '2026-05-18',
  '2026-05-18',
  NULL,
  '2026-05-18 10:00:00+02'::timestamptz,
  'manual'
);

SELECT pg_temp.assert_true(
  (SELECT count(*) FROM staff_window_auto_start) = 1,
  'first due run returns the matching staff work window'
);
SELECT pg_temp.assert_true(
  (SELECT bool_and(inserted_clock_in AND NOT inserted_clock_out) FROM staff_window_auto_start),
  'first due run inserts only the due clock-in'
);

CREATE TEMP TABLE staff_window_auto_end AS
SELECT *
FROM public.generate_staff_work_window_auto_time_punches(
  '00000000-0000-0000-0000-000000927001',
  '2026-05-18',
  '2026-05-18',
  NULL,
  '2026-05-18 14:00:00+02'::timestamptz,
  'manual'
);

SELECT pg_temp.assert_true(
  (SELECT bool_and(NOT inserted_clock_in AND inserted_clock_out) FROM staff_window_auto_end),
  'second due run keeps clock-in idempotent and inserts clock-out'
);
SELECT pg_temp.assert_true(
  (
    SELECT count(*)
    FROM public.time_punches
    WHERE organization_id = '00000000-0000-0000-0000-000000927001'
      AND source = 'schedule_auto'
      AND metadata ->> 'generatedFrom' = 'staff_work_window'
  ) = 2,
  'staff work window creates exactly two schedule_auto punches'
);
SELECT pg_temp.assert_true(
  (
    SELECT bool_and((metadata ->> 'presenceVerified') = 'false')
    FROM public.time_punches
    WHERE organization_id = '00000000-0000-0000-0000-000000927001'
      AND source = 'schedule_auto'
      AND metadata ->> 'generatedFrom' = 'staff_work_window'
  ),
  'staff work window punches explicitly do not verify real presence'
);
SELECT pg_temp.assert_true(
  (
    SELECT count(*)
    FROM public.time_punches
    WHERE organization_id = '00000000-0000-0000-0000-000000927001'
      AND source = 'schedule_auto'
      AND metadata ->> 'generatedFrom' = 'staff_work_window'
      AND schedule_block_id IS NULL
      AND schedule_block_assignment_id IS NULL
  ) = 2,
  'staff work window punches do not masquerade as schedule block assignments'
);

CREATE TEMP TABLE staff_window_auto_idempotent AS
SELECT *
FROM public.generate_staff_work_window_auto_time_punches(
  '00000000-0000-0000-0000-000000927001',
  '2026-05-18',
  '2026-05-18',
  NULL,
  '2026-05-18 14:30:00+02'::timestamptz,
  'manual'
);

SELECT pg_temp.assert_true(
  (SELECT bool_and(NOT inserted_clock_in AND NOT inserted_clock_out) FROM staff_window_auto_idempotent),
  'repeating a due run stays idempotent'
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000927102');
SELECT pg_temp.expect_rejected(
  'coach cannot generate staff work window auto punches',
  $statement$
    SELECT *
    FROM public.generate_staff_work_window_auto_time_punches(
      '00000000-0000-0000-0000-000000927001',
      '2026-05-18',
      '2026-05-18',
      NULL,
      '2026-05-18 14:00:00+02'::timestamptz,
      'manual'
    )
  $statement$
);

SELECT pg_temp.expect_rejected(
  'authenticated direct insert cannot forge staff work window schedule_auto source',
  $statement$
    INSERT INTO public.time_punches (
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
      metadata
    )
    SELECT
      '00000000-0000-0000-0000-000000927001',
      time_record.id,
      '00000000-0000-0000-0000-000000927401',
      'clock_in',
      '2026-05-18 09:30:00+02'::timestamptz,
      'Europe/Madrid',
      '00000000-0000-0000-0000-000000927301',
      'schedule_auto',
      'active',
      '00000000-0000-0000-0000-000000927102',
      jsonb_build_object(
        'presenceVerified', false,
        'generatedFrom', 'staff_work_window',
        'staffWorkWindowId', '00000000-0000-0000-0000-000000927601',
        'serviceDate', '2026-05-18',
        'plannedPunchType', 'clock_in'
      )
    FROM public.time_records time_record
    WHERE time_record.organization_id = '00000000-0000-0000-0000-000000927001'
      AND time_record.person_profile_id = '00000000-0000-0000-0000-000000927401'
    LIMIT 1
  $statement$
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000927103');
SELECT pg_temp.expect_rejected(
  'disabled tenant cannot generate staff work window auto punches',
  $statement$
    SELECT *
    FROM public.generate_staff_work_window_auto_time_punches(
      '00000000-0000-0000-0000-000000927002',
      '2026-05-18',
      '2026-05-18',
      NULL,
      '2026-05-18 14:00:00+02'::timestamptz,
      'manual'
    )
  $statement$
);

SELECT pg_temp.expect_rejected(
  'authenticated app roles cannot execute the DB scheduler primitive',
  $statement$
    SELECT *
    FROM public.generate_due_staff_work_window_auto_time_punches(
      '2026-05-18 14:00:00+02'::timestamptz,
      '00000000-0000-0000-0000-000000927001'
    )
  $statement$
);

RESET ROLE;

CREATE TEMP TABLE staff_window_auto_scheduler AS
SELECT *
FROM public.generate_due_staff_work_window_auto_time_punches(
  '2026-05-18 14:00:00+02'::timestamptz,
  '00000000-0000-0000-0000-000000927001'
);

SELECT pg_temp.assert_true(
  (SELECT count(*) FROM staff_window_auto_scheduler) >= 1,
  'DB owner scheduler primitive can run through the due generator'
);

ROLLBACK;
