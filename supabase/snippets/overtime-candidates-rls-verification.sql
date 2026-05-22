-- BoxOps - I.22 overtime candidates RLS/RPC verification
--
-- Run locally with:
--   Get-Content -Raw supabase/snippets/overtime-candidates-rls-verification.sql | docker exec -i supabase_db_boxops psql -U postgres -d postgres -v ON_ERROR_STOP=1
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
    RAISE EXCEPTION 'overtime candidates verification failed: %', label;
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
    '00000000-0000-0000-0000-000000922101',
    'authenticated',
    'authenticated',
    'overtime-owner-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Overtime Owner A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000922102',
    'authenticated',
    'authenticated',
    'overtime-admin-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Overtime Admin A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000922103',
    'authenticated',
    'authenticated',
    'overtime-manager-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Overtime Manager A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000922104',
    'authenticated',
    'authenticated',
    'overtime-coach-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Overtime Coach A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000922105',
    'authenticated',
    'authenticated',
    'overtime-other-coach-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Overtime Other Coach A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000922106',
    'authenticated',
    'authenticated',
    'overtime-payroll-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Overtime Payroll A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000922107',
    'authenticated',
    'authenticated',
    'overtime-owner-b@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Overtime Owner B"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000922108',
    'authenticated',
    'authenticated',
    'overtime-coach-b@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Overtime Coach B"}'::jsonb
  );

INSERT INTO public.organizations (id, name, slug, status, timezone)
VALUES
  (
    '00000000-0000-0000-0000-000000922001',
    'Overtime Verification A',
    'overtime-verification-a',
    'active',
    'Europe/Madrid'
  ),
  (
    '00000000-0000-0000-0000-000000922002',
    'Overtime Verification B',
    'overtime-verification-b',
    'active',
    'Europe/Madrid'
  );

INSERT INTO public.centers (id, organization_id, name, slug, timezone, status)
VALUES
  (
    '00000000-0000-0000-0000-000000922301',
    '00000000-0000-0000-0000-000000922001',
    'Overtime Center A',
    'overtime-center-a',
    'Europe/Madrid',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000922302',
    '00000000-0000-0000-0000-000000922002',
    'Overtime Center B',
    'overtime-center-b',
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
    '00000000-0000-0000-0000-000000922201',
    '00000000-0000-0000-0000-000000922001',
    '00000000-0000-0000-0000-000000922101',
    'owner',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000922202',
    '00000000-0000-0000-0000-000000922001',
    '00000000-0000-0000-0000-000000922102',
    'admin',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000922203',
    '00000000-0000-0000-0000-000000922001',
    '00000000-0000-0000-0000-000000922103',
    'manager',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000922204',
    '00000000-0000-0000-0000-000000922001',
    '00000000-0000-0000-0000-000000922104',
    'coach',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000922205',
    '00000000-0000-0000-0000-000000922001',
    '00000000-0000-0000-0000-000000922105',
    'coach',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000922206',
    '00000000-0000-0000-0000-000000922001',
    '00000000-0000-0000-0000-000000922106',
    'payroll_manager',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000922207',
    '00000000-0000-0000-0000-000000922002',
    '00000000-0000-0000-0000-000000922107',
    'owner',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000922208',
    '00000000-0000-0000-0000-000000922002',
    '00000000-0000-0000-0000-000000922108',
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
    '00000000-0000-0000-0000-000000922401',
    '00000000-0000-0000-0000-000000922001',
    '00000000-0000-0000-0000-000000922101',
    'Overtime Owner A',
    'Overtime Owner A',
    'visible',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000922402',
    '00000000-0000-0000-0000-000000922001',
    '00000000-0000-0000-0000-000000922102',
    'Overtime Admin A',
    'Overtime Admin A',
    'visible',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000922403',
    '00000000-0000-0000-0000-000000922001',
    '00000000-0000-0000-0000-000000922103',
    'Overtime Manager A',
    'Overtime Manager A',
    'visible',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000922404',
    '00000000-0000-0000-0000-000000922001',
    '00000000-0000-0000-0000-000000922104',
    'Overtime Coach A',
    'Overtime Coach A',
    'visible',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000922405',
    '00000000-0000-0000-0000-000000922001',
    '00000000-0000-0000-0000-000000922105',
    'Overtime Other Coach A',
    'Overtime Other Coach A',
    'visible',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000922406',
    '00000000-0000-0000-0000-000000922001',
    '00000000-0000-0000-0000-000000922106',
    'Overtime Payroll A',
    'Overtime Payroll A',
    'visible',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000922407',
    '00000000-0000-0000-0000-000000922002',
    '00000000-0000-0000-0000-000000922107',
    'Overtime Owner B',
    'Overtime Owner B',
    'visible',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000922408',
    '00000000-0000-0000-0000-000000922002',
    '00000000-0000-0000-0000-000000922108',
    'Overtime Coach B',
    'Overtime Coach B',
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
    '00000000-0000-0000-0000-000000922501',
    '00000000-0000-0000-0000-000000922001',
    '00000000-0000-0000-0000-000000922104',
    '00000000-0000-0000-0000-000000922404',
    '00000000-0000-0000-0000-000000922301',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000922502',
    '00000000-0000-0000-0000-000000922001',
    '00000000-0000-0000-0000-000000922105',
    '00000000-0000-0000-0000-000000922405',
    '00000000-0000-0000-0000-000000922301',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000922503',
    '00000000-0000-0000-0000-000000922002',
    '00000000-0000-0000-0000-000000922108',
    '00000000-0000-0000-0000-000000922408',
    '00000000-0000-0000-0000-000000922302',
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
    '00000000-0000-0000-0000-000000922701',
    '00000000-0000-0000-0000-000000922001',
    'Overtime Class A',
    'overtime-class-a',
    'class',
    1,
    false,
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000922702',
    '00000000-0000-0000-0000-000000922002',
    'Overtime Class B',
    'overtime-class-b',
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
    '00000000-0000-0000-0000-000000922601',
    '00000000-0000-0000-0000-000000922001',
    '00000000-0000-0000-0000-000000922301',
    '2026-05-18',
    '09:00',
    '10:00',
    '00000000-0000-0000-0000-000000922701',
    1,
    'scheduled',
    'Overtime verification source block A'
  ),
  (
    '00000000-0000-0000-0000-000000922602',
    '00000000-0000-0000-0000-000000922001',
    '00000000-0000-0000-0000-000000922301',
    '2026-05-18',
    '11:00',
    '12:00',
    '00000000-0000-0000-0000-000000922701',
    1,
    'scheduled',
    'Overtime verification other person block A'
  ),
  (
    '00000000-0000-0000-0000-000000922603',
    '00000000-0000-0000-0000-000000922002',
    '00000000-0000-0000-0000-000000922302',
    '2026-05-18',
    '09:00',
    '10:00',
    '00000000-0000-0000-0000-000000922702',
    1,
    'scheduled',
    'Overtime verification source block B'
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
    '00000000-0000-0000-0000-000000922801',
    '00000000-0000-0000-0000-000000922001',
    '00000000-0000-0000-0000-000000922601',
    '00000000-0000-0000-0000-000000922501',
    'assigned',
    'manual'
  ),
  (
    '00000000-0000-0000-0000-000000922802',
    '00000000-0000-0000-0000-000000922001',
    '00000000-0000-0000-0000-000000922602',
    '00000000-0000-0000-0000-000000922502',
    'assigned',
    'manual'
  ),
  (
    '00000000-0000-0000-0000-000000922803',
    '00000000-0000-0000-0000-000000922002',
    '00000000-0000-0000-0000-000000922603',
    '00000000-0000-0000-0000-000000922503',
    'assigned',
    'manual'
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
  status,
  notes
)
VALUES
  (
    '00000000-0000-0000-0000-000000922901',
    '00000000-0000-0000-0000-000000922001',
    '00000000-0000-0000-0000-000000922404',
    '00000000-0000-0000-0000-000000922301',
    1,
    '08:30',
    '10:30',
    '2026-05-18',
    'active',
    'Overtime verification own window'
  ),
  (
    '00000000-0000-0000-0000-000000922902',
    '00000000-0000-0000-0000-000000922001',
    '00000000-0000-0000-0000-000000922405',
    '00000000-0000-0000-0000-000000922301',
    1,
    '10:30',
    '12:30',
    '2026-05-18',
    'active',
    'Overtime verification other window'
  );

INSERT INTO public.operational_events (
  id,
  organization_id,
  center_id,
  title,
  event_type,
  starts_at,
  ends_at,
  timezone,
  status,
  visibility,
  impact_level,
  created_by_membership_id,
  updated_by_membership_id
)
VALUES
  (
    '00000000-0000-0000-0000-000000922911',
    '00000000-0000-0000-0000-000000922001',
    '00000000-0000-0000-0000-000000922301',
    'Overtime Verification Event A',
    'internal_event',
    '2026-05-18 08:00:00+00',
    '2026-05-18 13:00:00+00',
    'Europe/Madrid',
    'active',
    'staff',
    'context_only',
    '00000000-0000-0000-0000-000000922201',
    '00000000-0000-0000-0000-000000922201'
  ),
  (
    '00000000-0000-0000-0000-000000922912',
    '00000000-0000-0000-0000-000000922002',
    '00000000-0000-0000-0000-000000922302',
    'Overtime Verification Event B',
    'internal_event',
    '2026-05-18 08:00:00+00',
    '2026-05-18 13:00:00+00',
    'Europe/Madrid',
    'active',
    'staff',
    'context_only',
    '00000000-0000-0000-0000-000000922207',
    '00000000-0000-0000-0000-000000922207'
  );

INSERT INTO public.time_records (
  id,
  organization_id,
  person_profile_id,
  local_work_date,
  timezone,
  center_id,
  schedule_block_id,
  schedule_block_assignment_id,
  planned_start_at,
  planned_end_at,
  status,
  created_by_user_id,
  created_by_membership_id,
  metadata
)
VALUES
  (
    '00000000-0000-0000-0000-000000922921',
    '00000000-0000-0000-0000-000000922001',
    '00000000-0000-0000-0000-000000922404',
    '2026-05-18',
    'Europe/Madrid',
    '00000000-0000-0000-0000-000000922301',
    '00000000-0000-0000-0000-000000922601',
    '00000000-0000-0000-0000-000000922801',
    '2026-05-18 07:00:00+00',
    '2026-05-18 08:00:00+00',
    'open',
    '00000000-0000-0000-0000-000000922104',
    '00000000-0000-0000-0000-000000922204',
    '{}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000922922',
    '00000000-0000-0000-0000-000000922001',
    '00000000-0000-0000-0000-000000922405',
    '2026-05-18',
    'Europe/Madrid',
    '00000000-0000-0000-0000-000000922301',
    '00000000-0000-0000-0000-000000922602',
    '00000000-0000-0000-0000-000000922802',
    '2026-05-18 09:00:00+00',
    '2026-05-18 10:00:00+00',
    'open',
    '00000000-0000-0000-0000-000000922105',
    '00000000-0000-0000-0000-000000922205',
    '{}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000922923',
    '00000000-0000-0000-0000-000000922002',
    '00000000-0000-0000-0000-000000922408',
    '2026-05-18',
    'Europe/Madrid',
    '00000000-0000-0000-0000-000000922302',
    '00000000-0000-0000-0000-000000922603',
    '00000000-0000-0000-0000-000000922803',
    '2026-05-18 07:00:00+00',
    '2026-05-18 08:00:00+00',
    'open',
    '00000000-0000-0000-0000-000000922108',
    '00000000-0000-0000-0000-000000922208',
    '{}'::jsonb
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
  schedule_block_id,
  schedule_block_assignment_id,
  source,
  status,
  created_by_user_id,
  created_by_membership_id,
  metadata
)
VALUES
  (
    '00000000-0000-0000-0000-000000922931',
    '00000000-0000-0000-0000-000000922001',
    '00000000-0000-0000-0000-000000922921',
    '00000000-0000-0000-0000-000000922404',
    'clock_in',
    '2026-05-18 06:50:00+00',
    'Europe/Madrid',
    '00000000-0000-0000-0000-000000922301',
    '00000000-0000-0000-0000-000000922601',
    '00000000-0000-0000-0000-000000922801',
    'manual',
    'active',
    '00000000-0000-0000-0000-000000922104',
    '00000000-0000-0000-0000-000000922204',
    '{}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000922932',
    '00000000-0000-0000-0000-000000922001',
    '00000000-0000-0000-0000-000000922922',
    '00000000-0000-0000-0000-000000922405',
    'clock_in',
    '2026-05-18 08:50:00+00',
    'Europe/Madrid',
    '00000000-0000-0000-0000-000000922301',
    '00000000-0000-0000-0000-000000922602',
    '00000000-0000-0000-0000-000000922802',
    'manual',
    'active',
    '00000000-0000-0000-0000-000000922105',
    '00000000-0000-0000-0000-000000922205',
    '{}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000922933',
    '00000000-0000-0000-0000-000000922002',
    '00000000-0000-0000-0000-000000922923',
    '00000000-0000-0000-0000-000000922408',
    'clock_in',
    '2026-05-18 06:50:00+00',
    'Europe/Madrid',
    '00000000-0000-0000-0000-000000922302',
    '00000000-0000-0000-0000-000000922603',
    '00000000-0000-0000-0000-000000922803',
    'manual',
    'active',
    '00000000-0000-0000-0000-000000922108',
    '00000000-0000-0000-0000-000000922208',
    '{}'::jsonb
  );

CREATE TEMP TABLE source_table_snapshot AS
SELECT
  (SELECT jsonb_agg(jsonb_build_object('id', id, 'status', status, 'notes', notes) ORDER BY id)
   FROM public.schedule_blocks
   WHERE organization_id IN (
     '00000000-0000-0000-0000-000000922001',
     '00000000-0000-0000-0000-000000922002'
   )) AS schedule_blocks,
  (SELECT jsonb_agg(jsonb_build_object('id', id, 'assignment_status', assignment_status, 'source', source) ORDER BY id)
   FROM public.schedule_block_assignments
   WHERE organization_id IN (
     '00000000-0000-0000-0000-000000922001',
     '00000000-0000-0000-0000-000000922002'
   )) AS schedule_block_assignments,
  (SELECT jsonb_agg(jsonb_build_object('id', id, 'status', status, 'metadata', metadata) ORDER BY id)
   FROM public.time_records
   WHERE organization_id IN (
     '00000000-0000-0000-0000-000000922001',
     '00000000-0000-0000-0000-000000922002'
   )) AS time_records,
  (SELECT jsonb_agg(jsonb_build_object('id', id, 'status', status, 'source', source, 'metadata', metadata) ORDER BY id)
   FROM public.time_punches
   WHERE organization_id IN (
     '00000000-0000-0000-0000-000000922001',
     '00000000-0000-0000-0000-000000922002'
   )) AS time_punches;

SET LOCAL ROLE authenticated;

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000922101');
SELECT pg_temp.assert_true(
  public.can_review_overtime_candidates('00000000-0000-0000-0000-000000922001'),
  'owner can review overtime candidates'
);
CREATE TEMP TABLE owner_candidate AS
SELECT *
FROM public.create_overtime_candidate_signal(
  '00000000-0000-0000-0000-000000922001',
  '00000000-0000-0000-0000-000000922404',
  '2026-05-18',
  '2026-05-18',
  NULL,
  60,
  95,
  'manual_signal'
);
SELECT pg_temp.assert_true(
  (
    SELECT status = 'detected'
      AND candidate_minutes = 35
      AND created_by_membership_id = '00000000-0000-0000-0000-000000922201'
    FROM owner_candidate
  ),
  'owner can create candidate signal with derived membership and generated candidate minutes'
);

SELECT *
FROM public.add_overtime_candidate_source(
  '00000000-0000-0000-0000-000000922001',
  (SELECT id FROM owner_candidate),
  'time_record',
  '00000000-0000-0000-0000-000000922921'
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000922102');
SELECT pg_temp.assert_true(
  public.can_review_overtime_candidates('00000000-0000-0000-0000-000000922001'),
  'admin can review overtime candidates'
);
CREATE TEMP TABLE admin_candidate AS
SELECT *
FROM public.create_overtime_candidate_signal(
  '00000000-0000-0000-0000-000000922001',
  '00000000-0000-0000-0000-000000922404',
  '2026-05-19',
  '2026-05-19',
  'Europe/Madrid',
  45,
  75,
  'time_difference'
);
SELECT *
FROM public.add_overtime_candidate_source(
  '00000000-0000-0000-0000-000000922001',
  (SELECT id FROM owner_candidate),
  'schedule_block_assignment',
  '00000000-0000-0000-0000-000000922801'
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000922103');
SELECT pg_temp.assert_true(
  public.can_review_overtime_candidates('00000000-0000-0000-0000-000000922001'),
  'manager can review overtime candidates'
);
CREATE TEMP TABLE manager_candidate AS
SELECT *
FROM public.create_overtime_candidate_signal(
  '00000000-0000-0000-0000-000000922001',
  '00000000-0000-0000-0000-000000922404',
  '2026-05-20',
  '2026-05-20',
  'Europe/Madrid',
  30,
  50,
  'schedule_difference'
);
SELECT *
FROM public.add_overtime_candidate_source(
  '00000000-0000-0000-0000-000000922001',
  (SELECT id FROM owner_candidate),
  'staff_work_window',
  '00000000-0000-0000-0000-000000922901'
);
SELECT *
FROM public.add_overtime_candidate_source(
  '00000000-0000-0000-0000-000000922001',
  (SELECT id FROM owner_candidate),
  'manual_context',
  NULL
);
SELECT *
FROM public.set_overtime_candidate_status(
  '00000000-0000-0000-0000-000000922001',
  (SELECT id FROM owner_candidate),
  'under_review'
);
SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 3
    FROM public.list_overtime_candidates(
      '00000000-0000-0000-0000-000000922001',
      NULL,
      NULL,
      NULL,
      NULL,
      20
    )
  ),
  'manager can list tenant candidates'
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000922101');
SELECT *
FROM public.add_overtime_candidate_source(
  '00000000-0000-0000-0000-000000922001',
  (SELECT id FROM manager_candidate),
  'operational_event',
  '00000000-0000-0000-0000-000000922911'
);
SELECT pg_temp.expect_rejected(
  'personal time_record source must belong to affected person',
  $statement$
    SELECT public.add_overtime_candidate_source(
      '00000000-0000-0000-0000-000000922001',
      (SELECT id FROM manager_candidate),
      'time_record',
      '00000000-0000-0000-0000-000000922922'
    )
  $statement$
);
SELECT pg_temp.expect_rejected(
  'personal time_punch source must belong to affected person',
  $statement$
    SELECT public.add_overtime_candidate_source(
      '00000000-0000-0000-0000-000000922001',
      (SELECT id FROM manager_candidate),
      'time_punch',
      '00000000-0000-0000-0000-000000922932'
    )
  $statement$
);
SELECT pg_temp.expect_rejected(
  'personal schedule assignment source must belong to affected person',
  $statement$
    SELECT public.add_overtime_candidate_source(
      '00000000-0000-0000-0000-000000922001',
      (SELECT id FROM manager_candidate),
      'schedule_block_assignment',
      '00000000-0000-0000-0000-000000922802'
    )
  $statement$
);
SELECT pg_temp.expect_rejected(
  'personal staff window source must belong to affected person',
  $statement$
    SELECT public.add_overtime_candidate_source(
      '00000000-0000-0000-0000-000000922001',
      (SELECT id FROM manager_candidate),
      'staff_work_window',
      '00000000-0000-0000-0000-000000922902'
    )
  $statement$
);
SELECT pg_temp.expect_rejected(
  'source from another tenant is rejected',
  $statement$
    SELECT public.add_overtime_candidate_source(
      '00000000-0000-0000-0000-000000922001',
      (SELECT id FROM manager_candidate),
      'time_record',
      '00000000-0000-0000-0000-000000922923'
    )
  $statement$
);
SELECT pg_temp.expect_rejected(
  'operational event source from another tenant is rejected',
  $statement$
    SELECT public.add_overtime_candidate_source(
      '00000000-0000-0000-0000-000000922001',
      (SELECT id FROM manager_candidate),
      'operational_event',
      '00000000-0000-0000-0000-000000922912'
    )
  $statement$
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000922104');
SELECT pg_temp.assert_true(
  NOT public.can_review_overtime_candidates('00000000-0000-0000-0000-000000922001'),
  'coach cannot review overtime candidates'
);
SELECT pg_temp.assert_true(
  (SELECT count(*) FROM public.overtime_candidates WHERE organization_id = '00000000-0000-0000-0000-000000922001') = 3,
  'affected coach can read own candidates through RLS'
);
SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 3
    FROM public.list_overtime_candidates(
      '00000000-0000-0000-0000-000000922001',
      NULL,
      NULL,
      NULL,
      NULL,
      20
    )
  ),
  'affected coach can list own candidates through RPC'
);
SELECT pg_temp.expect_rejected(
  'affected coach cannot ask for another person candidates',
  $statement$
    SELECT *
    FROM public.list_overtime_candidates(
      '00000000-0000-0000-0000-000000922001',
      NULL,
      '00000000-0000-0000-0000-000000922405',
      NULL,
      NULL,
      20
    )
  $statement$
);
SELECT pg_temp.expect_rejected(
  'coach cannot create candidate signals',
  $statement$
    SELECT public.create_overtime_candidate_signal(
      '00000000-0000-0000-0000-000000922001',
      '00000000-0000-0000-0000-000000922404',
      '2026-05-21',
      '2026-05-21',
      'Europe/Madrid',
      10,
      20,
      'manual_signal'
    )
  $statement$
);
SELECT pg_temp.expect_rejected(
  'coach cannot add candidate sources',
  $statement$
    SELECT public.add_overtime_candidate_source(
      '00000000-0000-0000-0000-000000922001',
      (SELECT id FROM manager_candidate),
      'time_punch',
      '00000000-0000-0000-0000-000000922931'
    )
  $statement$
);
SELECT pg_temp.expect_rejected(
  'coach cannot change candidate status',
  $statement$
    SELECT public.set_overtime_candidate_status(
      '00000000-0000-0000-0000-000000922001',
      (SELECT id FROM manager_candidate),
      'needs_review'
    )
  $statement$
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000922105');
SELECT pg_temp.assert_true(
  (SELECT count(*) FROM public.overtime_candidates WHERE organization_id = '00000000-0000-0000-0000-000000922001') = 0,
  'same-tenant coach cannot read another person candidates through RLS'
);
SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 0
    FROM public.list_overtime_candidates(
      '00000000-0000-0000-0000-000000922001',
      NULL,
      NULL,
      NULL,
      NULL,
      20
    )
  ),
  'same-tenant coach only lists own candidates'
);
SELECT pg_temp.expect_rejected(
  'same-tenant coach cannot force target person filter',
  $statement$
    SELECT *
    FROM public.list_overtime_candidates(
      '00000000-0000-0000-0000-000000922001',
      NULL,
      '00000000-0000-0000-0000-000000922404',
      NULL,
      NULL,
      20
    )
  $statement$
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000922106');
SELECT pg_temp.assert_true(
  NOT public.can_review_overtime_candidates('00000000-0000-0000-0000-000000922001'),
  'payroll_manager does not inherit review permission'
);
SELECT pg_temp.assert_true(
  (SELECT count(*) FROM public.overtime_candidates WHERE organization_id = '00000000-0000-0000-0000-000000922001') = 0,
  'payroll_manager does not inherit tenant-wide read access'
);
SELECT pg_temp.expect_rejected(
  'payroll_manager cannot force target person filter',
  $statement$
    SELECT *
    FROM public.list_overtime_candidates(
      '00000000-0000-0000-0000-000000922001',
      NULL,
      '00000000-0000-0000-0000-000000922404',
      NULL,
      NULL,
      20
    )
  $statement$
);
SELECT pg_temp.expect_rejected(
  'payroll_manager cannot create candidate signals',
  $statement$
    SELECT public.create_overtime_candidate_signal(
      '00000000-0000-0000-0000-000000922001',
      '00000000-0000-0000-0000-000000922404',
      '2026-05-21',
      '2026-05-21',
      'Europe/Madrid',
      10,
      20,
      'manual_signal'
    )
  $statement$
);
SELECT pg_temp.expect_rejected(
  'payroll_manager cannot add candidate sources',
  $statement$
    SELECT public.add_overtime_candidate_source(
      '00000000-0000-0000-0000-000000922001',
      (SELECT id FROM manager_candidate),
      'time_punch',
      '00000000-0000-0000-0000-000000922931'
    )
  $statement$
);
SELECT pg_temp.expect_rejected(
  'payroll_manager cannot change candidate status',
  $statement$
    SELECT public.set_overtime_candidate_status(
      '00000000-0000-0000-0000-000000922001',
      (SELECT id FROM manager_candidate),
      'needs_review'
    )
  $statement$
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000922107');
SELECT pg_temp.assert_true(
  (SELECT count(*) FROM public.overtime_candidates WHERE organization_id = '00000000-0000-0000-0000-000000922001') = 0,
  'other tenant owner cannot read tenant A candidates through RLS'
);
SELECT pg_temp.assert_true(
  (SELECT count(*) FROM public.overtime_candidate_sources WHERE organization_id = '00000000-0000-0000-0000-000000922001') = 0,
  'other tenant owner cannot read tenant A candidate sources through RLS'
);
SELECT pg_temp.assert_true(
  (SELECT count(*) FROM public.overtime_candidate_events WHERE organization_id = '00000000-0000-0000-0000-000000922001') = 0,
  'other tenant owner cannot read tenant A candidate events through RLS'
);
SELECT pg_temp.expect_rejected(
  'other tenant owner cannot list tenant A candidates',
  $statement$
    SELECT *
    FROM public.list_overtime_candidates(
      '00000000-0000-0000-0000-000000922001',
      NULL,
      NULL,
      NULL,
      NULL,
      20
    )
  $statement$
);
SELECT pg_temp.expect_rejected(
  'other tenant owner cannot reference tenant A candidate',
  $statement$
    SELECT public.add_overtime_candidate_source(
      '00000000-0000-0000-0000-000000922001',
      (SELECT id FROM manager_candidate),
      'time_punch',
      '00000000-0000-0000-0000-000000922931'
    )
  $statement$
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000922101');
SELECT *
FROM public.set_overtime_candidate_status(
  '00000000-0000-0000-0000-000000922001',
  (SELECT id FROM owner_candidate),
  'closed'
);
SELECT pg_temp.expect_rejected(
  'closed candidates cannot receive new sources',
  $statement$
    SELECT public.add_overtime_candidate_source(
      '00000000-0000-0000-0000-000000922001',
      (SELECT id FROM owner_candidate),
      'operational_event',
      '00000000-0000-0000-0000-000000922911'
    )
  $statement$
);
SELECT pg_temp.expect_rejected(
  'closed candidates cannot change status again',
  $statement$
    SELECT public.set_overtime_candidate_status(
      '00000000-0000-0000-0000-000000922001',
      (SELECT id FROM owner_candidate),
      'under_review'
    )
  $statement$
);

SELECT *
FROM public.set_overtime_candidate_status(
  '00000000-0000-0000-0000-000000922001',
  (SELECT id FROM admin_candidate),
  'superseded'
);
SELECT pg_temp.expect_rejected(
  'superseded candidates cannot receive new sources',
  $statement$
    SELECT public.add_overtime_candidate_source(
      '00000000-0000-0000-0000-000000922001',
      (SELECT id FROM admin_candidate),
      'manual_context',
      NULL
    )
  $statement$
);
SELECT pg_temp.expect_rejected(
  'superseded candidates cannot change status again',
  $statement$
    SELECT public.set_overtime_candidate_status(
      '00000000-0000-0000-0000-000000922001',
      (SELECT id FROM admin_candidate),
      'needs_review'
    )
  $statement$
);

SELECT pg_temp.expect_rejected(
  'direct insert on overtime_candidates is blocked for authenticated',
  $statement$
    INSERT INTO public.overtime_candidates (
      organization_id,
      person_profile_id,
      period_start_date,
      period_end_date,
      timezone,
      planned_minutes_snapshot,
      worked_minutes_snapshot,
      created_by_membership_id
    )
    VALUES (
      '00000000-0000-0000-0000-000000922001',
      '00000000-0000-0000-0000-000000922404',
      '2026-05-22',
      '2026-05-22',
      'Europe/Madrid',
      10,
      20,
      '00000000-0000-0000-0000-000000922201'
    )
  $statement$
);
SELECT pg_temp.expect_rejected(
  'direct update on overtime_candidates is blocked for authenticated',
  $statement$
    UPDATE public.overtime_candidates
    SET status = 'closed'
    WHERE id = (SELECT id FROM manager_candidate)
      AND organization_id = '00000000-0000-0000-0000-000000922001'
  $statement$
);
SELECT pg_temp.expect_rejected(
  'direct delete on overtime_candidates is blocked for authenticated',
  $statement$
    DELETE FROM public.overtime_candidates
    WHERE id = (SELECT id FROM manager_candidate)
      AND organization_id = '00000000-0000-0000-0000-000000922001'
  $statement$
);
SELECT pg_temp.expect_rejected(
  'direct insert on overtime_candidate_sources is blocked for authenticated',
  $statement$
    INSERT INTO public.overtime_candidate_sources (
      organization_id,
      overtime_candidate_id,
      source_type,
      source_id,
      created_by_membership_id
    )
    VALUES (
      '00000000-0000-0000-0000-000000922001',
      (SELECT id FROM manager_candidate),
      'manual_context',
      NULL,
      '00000000-0000-0000-0000-000000922201'
    )
  $statement$
);
SELECT pg_temp.expect_rejected(
  'direct update on overtime_candidate_sources is blocked for authenticated',
  $statement$
    UPDATE public.overtime_candidate_sources
    SET source_type = 'manual_context'
    WHERE organization_id = '00000000-0000-0000-0000-000000922001'
  $statement$
);
SELECT pg_temp.expect_rejected(
  'direct delete on overtime_candidate_sources is blocked for authenticated',
  $statement$
    DELETE FROM public.overtime_candidate_sources
    WHERE organization_id = '00000000-0000-0000-0000-000000922001'
  $statement$
);
SELECT pg_temp.expect_rejected(
  'direct insert on overtime_candidate_events is blocked for authenticated',
  $statement$
    INSERT INTO public.overtime_candidate_events (
      organization_id,
      overtime_candidate_id,
      actor_user_id,
      actor_membership_id,
      event_type,
      result,
      changed_fields,
      retain_until
    )
    VALUES (
      '00000000-0000-0000-0000-000000922001',
      (SELECT id FROM manager_candidate),
      '00000000-0000-0000-0000-000000922101',
      '00000000-0000-0000-0000-000000922201',
      'status_changed',
      'success',
      '{}'::jsonb,
      now() + interval '180 days'
    )
  $statement$
);
SELECT pg_temp.expect_rejected(
  'direct update on overtime_candidate_events is blocked for authenticated',
  $statement$
    UPDATE public.overtime_candidate_events
    SET result = 'failed'
    WHERE organization_id = '00000000-0000-0000-0000-000000922001'
  $statement$
);
SELECT pg_temp.expect_rejected(
  'direct delete on overtime_candidate_events is blocked for authenticated',
  $statement$
    DELETE FROM public.overtime_candidate_events
    WHERE organization_id = '00000000-0000-0000-0000-000000922001'
  $statement$
);

SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN (
        'overtime_candidates',
        'overtime_candidate_sources',
        'overtime_candidate_events'
      )
      AND column_name ~* '(salary|salario|nomina|amount|importe|currency|compensation|bank|iban)'
  ),
  'overtime candidate tables do not expose payroll or amount columns'
);

RESET ROLE;

SELECT pg_temp.assert_true(
  (SELECT schedule_blocks FROM source_table_snapshot) = (
    SELECT jsonb_agg(jsonb_build_object('id', id, 'status', status, 'notes', notes) ORDER BY id)
    FROM public.schedule_blocks
    WHERE organization_id IN (
      '00000000-0000-0000-0000-000000922001',
      '00000000-0000-0000-0000-000000922002'
    )
  ),
  'overtime candidate operations did not mutate schedule_blocks'
);
SELECT pg_temp.assert_true(
  (SELECT schedule_block_assignments FROM source_table_snapshot) = (
    SELECT jsonb_agg(jsonb_build_object('id', id, 'assignment_status', assignment_status, 'source', source) ORDER BY id)
    FROM public.schedule_block_assignments
    WHERE organization_id IN (
      '00000000-0000-0000-0000-000000922001',
      '00000000-0000-0000-0000-000000922002'
    )
  ),
  'overtime candidate operations did not mutate schedule_block_assignments'
);
SELECT pg_temp.assert_true(
  (SELECT time_records FROM source_table_snapshot) = (
    SELECT jsonb_agg(jsonb_build_object('id', id, 'status', status, 'metadata', metadata) ORDER BY id)
    FROM public.time_records
    WHERE organization_id IN (
      '00000000-0000-0000-0000-000000922001',
      '00000000-0000-0000-0000-000000922002'
    )
  ),
  'overtime candidate operations did not mutate time_records'
);
SELECT pg_temp.assert_true(
  (SELECT time_punches FROM source_table_snapshot) = (
    SELECT jsonb_agg(jsonb_build_object('id', id, 'status', status, 'source', source, 'metadata', metadata) ORDER BY id)
    FROM public.time_punches
    WHERE organization_id IN (
      '00000000-0000-0000-0000-000000922001',
      '00000000-0000-0000-0000-000000922002'
    )
  ),
  'overtime candidate operations did not mutate time_punches'
);

ROLLBACK;
