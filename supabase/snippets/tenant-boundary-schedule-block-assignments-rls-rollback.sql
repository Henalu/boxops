-- BoxOps - S.61 tenant boundary schedule_block_assignments RLS rollback verification
--
-- Run locally with:
--   Get-Content -Raw supabase/snippets/tenant-boundary-schedule-block-assignments-rls-rollback.sql | docker exec -i supabase_db_boxops psql -U postgres -d postgres -v ON_ERROR_STOP=1
--
-- The script runs inside a transaction and rolls back all fixture data. It
-- validates a minimal tenant/RLS case from the negative-test matrix: a high
-- operational role in tenant A cannot create or update tenant A schedule block
-- assignments with tenant B schedule blocks or coach profiles, cannot mutate
-- tenant B assignments, and cannot move an existing assignment across
-- organizations.
--
-- This intentionally does not validate the "inactive coach" product rule. The
-- current durable DB/RLS boundary guarantees tenant-safe references; coach
-- assignability/status checks live in application/RPC runtime and need their
-- own harness.

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
    RAISE EXCEPTION 'tenant boundary schedule_block_assignments RLS verification failed: %', label;
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

CREATE OR REPLACE FUNCTION pg_temp.expect_no_updated_rows(
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
    RAISE EXCEPTION 'statement updated % row(s): %', affected_rows, label;
  END IF;

  RAISE NOTICE 'ok - no rows updated: %', label;
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
    '00000000-0000-0000-0000-000000961101',
    'authenticated',
    'authenticated',
    'tenant-boundary-assignment-manager-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Tenant Boundary Assignment Manager A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000961102',
    'authenticated',
    'authenticated',
    'tenant-boundary-assignment-coach-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Tenant Boundary Assignment Coach A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000961103',
    'authenticated',
    'authenticated',
    'tenant-boundary-assignment-manager-b@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Tenant Boundary Assignment Manager B"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000961104',
    'authenticated',
    'authenticated',
    'tenant-boundary-assignment-coach-b@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Tenant Boundary Assignment Coach B"}'::jsonb
  );

INSERT INTO public.organizations (id, name, slug, status, timezone)
VALUES
  (
    '00000000-0000-0000-0000-000000961001',
    'Tenant Boundary Assignment A',
    'tenant-boundary-assignment-a',
    'active',
    'Europe/Madrid'
  ),
  (
    '00000000-0000-0000-0000-000000961002',
    'Tenant Boundary Assignment B',
    'tenant-boundary-assignment-b',
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
    '00000000-0000-0000-0000-000000961201',
    '00000000-0000-0000-0000-000000961001',
    '00000000-0000-0000-0000-000000961101',
    'manager',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000961202',
    '00000000-0000-0000-0000-000000961001',
    '00000000-0000-0000-0000-000000961102',
    'coach',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000961203',
    '00000000-0000-0000-0000-000000961002',
    '00000000-0000-0000-0000-000000961103',
    'manager',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000961204',
    '00000000-0000-0000-0000-000000961002',
    '00000000-0000-0000-0000-000000961104',
    'coach',
    'active',
    now()
  );

INSERT INTO public.centers (id, organization_id, name, slug, timezone, status)
VALUES
  (
    '00000000-0000-0000-0000-000000961301',
    '00000000-0000-0000-0000-000000961001',
    'Tenant Boundary Assignment Center A',
    'tenant-boundary-assignment-center-a',
    'Europe/Madrid',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000961302',
    '00000000-0000-0000-0000-000000961002',
    'Tenant Boundary Assignment Center B',
    'tenant-boundary-assignment-center-b',
    'Europe/Madrid',
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
VALUES
  (
    '00000000-0000-0000-0000-000000961401',
    '00000000-0000-0000-0000-000000961001',
    'Tenant Boundary Assignment Type A',
    'tenant-boundary-assignment-type-a',
    'class',
    1,
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000961402',
    '00000000-0000-0000-0000-000000961002',
    'Tenant Boundary Assignment Type B',
    'tenant-boundary-assignment-type-b',
    'class',
    1,
    'active'
  );

INSERT INTO public.coach_profiles (
  id,
  organization_id,
  user_id,
  primary_center_id,
  weekly_contracted_hours,
  status,
  notes
)
VALUES
  (
    '00000000-0000-0000-0000-000000961501',
    '00000000-0000-0000-0000-000000961001',
    '00000000-0000-0000-0000-000000961102',
    '00000000-0000-0000-0000-000000961301',
    0,
    'active',
    'Tenant A active coach'
  ),
  (
    '00000000-0000-0000-0000-000000961502',
    '00000000-0000-0000-0000-000000961002',
    '00000000-0000-0000-0000-000000961104',
    '00000000-0000-0000-0000-000000961302',
    0,
    'active',
    'Tenant B active coach'
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
    '00000000-0000-0000-0000-000000961601',
    '00000000-0000-0000-0000-000000961001',
    '00000000-0000-0000-0000-000000961301',
    DATE '2026-05-19',
    TIME '09:00',
    TIME '10:00',
    '00000000-0000-0000-0000-000000961401',
    1,
    'scheduled',
    'Tenant A baseline block'
  ),
  (
    '00000000-0000-0000-0000-000000961602',
    '00000000-0000-0000-0000-000000961002',
    '00000000-0000-0000-0000-000000961302',
    DATE '2026-05-19',
    TIME '09:00',
    TIME '10:00',
    '00000000-0000-0000-0000-000000961402',
    1,
    'scheduled',
    'Tenant B baseline block'
  ),
  (
    '00000000-0000-0000-0000-000000961603',
    '00000000-0000-0000-0000-000000961002',
    '00000000-0000-0000-0000-000000961302',
    DATE '2026-05-19',
    TIME '12:00',
    TIME '13:00',
    '00000000-0000-0000-0000-000000961402',
    1,
    'scheduled',
    'Tenant B extra block'
  );

INSERT INTO public.schedule_block_assignments (
  id,
  organization_id,
  schedule_block_id,
  coach_profile_id,
  assignment_status,
  source,
  notes
)
VALUES (
  '00000000-0000-0000-0000-000000961702',
  '00000000-0000-0000-0000-000000961002',
  '00000000-0000-0000-0000-000000961602',
  '00000000-0000-0000-0000-000000961502',
  'assigned',
  'manual',
  'Tenant B baseline assignment'
);

SET LOCAL ROLE authenticated;

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000961101');

INSERT INTO public.schedule_block_assignments (
  id,
  organization_id,
  schedule_block_id,
  coach_profile_id,
  assignment_status,
  source,
  notes
)
VALUES (
  '00000000-0000-0000-0000-000000961701',
  '00000000-0000-0000-0000-000000961001',
  '00000000-0000-0000-0000-000000961601',
  '00000000-0000-0000-0000-000000961501',
  'assigned',
  'manual',
  'Tenant A allowed assignment'
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 1
    FROM public.schedule_block_assignments
    WHERE id = '00000000-0000-0000-0000-000000961701'
      AND organization_id = '00000000-0000-0000-0000-000000961001'
  ),
  'tenant A manager can create a valid tenant A assignment'
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 0
    FROM public.schedule_block_assignments
    WHERE id = '00000000-0000-0000-0000-000000961702'
  ),
  'tenant A manager cannot read tenant B assignment'
);

UPDATE public.schedule_block_assignments
SET notes = 'Tenant A allowed assignment updated'
WHERE id = '00000000-0000-0000-0000-000000961701';

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM public.schedule_block_assignments
    WHERE id = '00000000-0000-0000-0000-000000961701'
      AND organization_id = '00000000-0000-0000-0000-000000961001'
      AND notes = 'Tenant A allowed assignment updated'
  ),
  'tenant A manager can update allowed tenant A assignment fields'
);

SELECT pg_temp.expect_rejected(
  'tenant A manager cannot create tenant A assignment with tenant B schedule block',
  $statement$
    INSERT INTO public.schedule_block_assignments (
      id,
      organization_id,
      schedule_block_id,
      coach_profile_id,
      assignment_status,
      source
    )
    VALUES (
      '00000000-0000-0000-0000-000000961703',
      '00000000-0000-0000-0000-000000961001',
      '00000000-0000-0000-0000-000000961602',
      '00000000-0000-0000-0000-000000961501',
      'assigned',
      'manual'
    )
  $statement$
);

SELECT pg_temp.expect_rejected(
  'tenant A manager cannot create tenant A assignment with tenant B coach profile',
  $statement$
    INSERT INTO public.schedule_block_assignments (
      id,
      organization_id,
      schedule_block_id,
      coach_profile_id,
      assignment_status,
      source
    )
    VALUES (
      '00000000-0000-0000-0000-000000961704',
      '00000000-0000-0000-0000-000000961001',
      '00000000-0000-0000-0000-000000961601',
      '00000000-0000-0000-0000-000000961502',
      'assigned',
      'manual'
    )
  $statement$
);

SELECT pg_temp.expect_no_updated_rows(
  'tenant A manager cannot update tenant B assignment',
  $statement$
    UPDATE public.schedule_block_assignments
    SET notes = 'Forbidden cross-tenant assignment update'
    WHERE id = '00000000-0000-0000-0000-000000961702'
  $statement$
);

SELECT pg_temp.expect_rejected(
  'tenant A manager cannot update tenant A assignment to tenant B schedule block',
  $statement$
    UPDATE public.schedule_block_assignments
    SET schedule_block_id = '00000000-0000-0000-0000-000000961602'
    WHERE id = '00000000-0000-0000-0000-000000961701'
  $statement$
);

SELECT pg_temp.expect_rejected(
  'tenant A manager cannot update tenant A assignment to tenant B coach profile',
  $statement$
    UPDATE public.schedule_block_assignments
    SET coach_profile_id = '00000000-0000-0000-0000-000000961502'
    WHERE id = '00000000-0000-0000-0000-000000961701'
  $statement$
);

SELECT pg_temp.expect_rejected(
  'tenant A manager cannot move tenant A assignment into tenant B',
  $statement$
    UPDATE public.schedule_block_assignments
    SET organization_id = '00000000-0000-0000-0000-000000961002'
    WHERE id = '00000000-0000-0000-0000-000000961701'
  $statement$
);

SELECT pg_temp.expect_rejected(
  'tenant A manager cannot insert assignment directly into tenant B',
  $statement$
    INSERT INTO public.schedule_block_assignments (
      id,
      organization_id,
      schedule_block_id,
      coach_profile_id,
      assignment_status,
      source
    )
    VALUES (
      '00000000-0000-0000-0000-000000961705',
      '00000000-0000-0000-0000-000000961002',
      '00000000-0000-0000-0000-000000961603',
      '00000000-0000-0000-0000-000000961502',
      'assigned',
      'manual'
    )
  $statement$
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000961103');

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 0
    FROM public.schedule_block_assignments
    WHERE id = '00000000-0000-0000-0000-000000961701'
  ),
  'tenant B manager cannot read tenant A assignment'
);

SELECT pg_temp.expect_no_updated_rows(
  'tenant B manager cannot update tenant A assignment',
  $statement$
    UPDATE public.schedule_block_assignments
    SET notes = 'Forbidden tenant B manager update'
    WHERE id = '00000000-0000-0000-0000-000000961701'
  $statement$
);

RESET ROLE;

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM public.schedule_block_assignments
    WHERE id = '00000000-0000-0000-0000-000000961701'
      AND organization_id = '00000000-0000-0000-0000-000000961001'
      AND schedule_block_id = '00000000-0000-0000-0000-000000961601'
      AND coach_profile_id = '00000000-0000-0000-0000-000000961501'
      AND notes = 'Tenant A allowed assignment updated'
  ),
  'tenant A assignment keeps tenant A references before rollback'
);

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM public.schedule_block_assignments
    WHERE id = '00000000-0000-0000-0000-000000961702'
      AND organization_id = '00000000-0000-0000-0000-000000961002'
      AND schedule_block_id = '00000000-0000-0000-0000-000000961602'
      AND coach_profile_id = '00000000-0000-0000-0000-000000961502'
      AND notes = 'Tenant B baseline assignment'
  ),
  'tenant B assignment remains unchanged before rollback'
);

SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1
    FROM public.schedule_block_assignments
    WHERE id IN (
      '00000000-0000-0000-0000-000000961703',
      '00000000-0000-0000-0000-000000961704',
      '00000000-0000-0000-0000-000000961705'
    )
  ),
  'forbidden assignment inserts were not persisted before rollback'
);

ROLLBACK;
