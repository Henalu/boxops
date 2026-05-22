-- BoxOps - S.60 tenant boundary schedule_blocks RLS rollback verification
--
-- Run locally with:
--   Get-Content -Raw supabase/snippets/tenant-boundary-schedule-blocks-rls-rollback.sql | docker exec -i supabase_db_boxops psql -U postgres -d postgres -v ON_ERROR_STOP=1
--
-- The script runs inside a transaction and rolls back all fixture data. It
-- validates a minimal tenant/RLS case from the negative-test matrix: a high
-- operational role in tenant A cannot create or update tenant A schedule
-- blocks with tenant B centers/class types, cannot mutate tenant B blocks, and
-- cannot move an existing schedule block across organizations.

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
    RAISE EXCEPTION 'tenant boundary schedule_blocks RLS verification failed: %', label;
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
    '00000000-0000-0000-0000-000000960101',
    'authenticated',
    'authenticated',
    'tenant-boundary-schedule-manager-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Tenant Boundary Schedule Manager A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000960102',
    'authenticated',
    'authenticated',
    'tenant-boundary-schedule-manager-b@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Tenant Boundary Schedule Manager B"}'::jsonb
  );

INSERT INTO public.organizations (id, name, slug, status, timezone)
VALUES
  (
    '00000000-0000-0000-0000-000000960001',
    'Tenant Boundary Schedule A',
    'tenant-boundary-schedule-a',
    'active',
    'Europe/Madrid'
  ),
  (
    '00000000-0000-0000-0000-000000960002',
    'Tenant Boundary Schedule B',
    'tenant-boundary-schedule-b',
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
    '00000000-0000-0000-0000-000000960201',
    '00000000-0000-0000-0000-000000960001',
    '00000000-0000-0000-0000-000000960101',
    'manager',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000960202',
    '00000000-0000-0000-0000-000000960002',
    '00000000-0000-0000-0000-000000960102',
    'manager',
    'active',
    now()
  );

INSERT INTO public.centers (id, organization_id, name, slug, timezone, status)
VALUES
  (
    '00000000-0000-0000-0000-000000960301',
    '00000000-0000-0000-0000-000000960001',
    'Tenant Boundary Schedule Center A',
    'tenant-boundary-schedule-center-a',
    'Europe/Madrid',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000960302',
    '00000000-0000-0000-0000-000000960002',
    'Tenant Boundary Schedule Center B',
    'tenant-boundary-schedule-center-b',
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
    '00000000-0000-0000-0000-000000960401',
    '00000000-0000-0000-0000-000000960001',
    'Tenant Boundary Schedule Type A',
    'tenant-boundary-schedule-type-a',
    'class',
    1,
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000960402',
    '00000000-0000-0000-0000-000000960002',
    'Tenant Boundary Schedule Type B',
    'tenant-boundary-schedule-type-b',
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
VALUES (
  '00000000-0000-0000-0000-000000960502',
  '00000000-0000-0000-0000-000000960002',
  '00000000-0000-0000-0000-000000960302',
  DATE '2026-05-19',
  TIME '10:00',
  TIME '11:00',
  '00000000-0000-0000-0000-000000960402',
  1,
  'scheduled',
  'Tenant B baseline block'
);

SET LOCAL ROLE authenticated;

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000960101');

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
VALUES (
  '00000000-0000-0000-0000-000000960501',
  '00000000-0000-0000-0000-000000960001',
  '00000000-0000-0000-0000-000000960301',
  DATE '2026-05-19',
  TIME '09:00',
  TIME '10:00',
  '00000000-0000-0000-0000-000000960401',
  1,
  'scheduled',
  'Tenant A allowed block'
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 1
    FROM public.schedule_blocks
    WHERE id = '00000000-0000-0000-0000-000000960501'
      AND organization_id = '00000000-0000-0000-0000-000000960001'
  ),
  'tenant A manager can create a valid tenant A schedule block'
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 0
    FROM public.schedule_blocks
    WHERE id = '00000000-0000-0000-0000-000000960502'
  ),
  'tenant A manager cannot read tenant B schedule block'
);

SELECT pg_temp.expect_rejected(
  'tenant A manager cannot create tenant A schedule block with tenant B center',
  $statement$
    INSERT INTO public.schedule_blocks (
      id,
      organization_id,
      center_id,
      service_date,
      start_time,
      end_time,
      class_type_id,
      required_coaches,
      status
    )
    VALUES (
      '00000000-0000-0000-0000-000000960503',
      '00000000-0000-0000-0000-000000960001',
      '00000000-0000-0000-0000-000000960302',
      DATE '2026-05-19',
      TIME '11:00',
      TIME '12:00',
      '00000000-0000-0000-0000-000000960401',
      1,
      'scheduled'
    )
  $statement$
);

SELECT pg_temp.expect_rejected(
  'tenant A manager cannot create tenant A schedule block with tenant B class type',
  $statement$
    INSERT INTO public.schedule_blocks (
      id,
      organization_id,
      center_id,
      service_date,
      start_time,
      end_time,
      class_type_id,
      required_coaches,
      status
    )
    VALUES (
      '00000000-0000-0000-0000-000000960504',
      '00000000-0000-0000-0000-000000960001',
      '00000000-0000-0000-0000-000000960301',
      DATE '2026-05-19',
      TIME '12:00',
      TIME '13:00',
      '00000000-0000-0000-0000-000000960402',
      1,
      'scheduled'
    )
  $statement$
);

SELECT pg_temp.expect_no_updated_rows(
  'tenant A manager cannot update tenant B schedule block',
  $statement$
    UPDATE public.schedule_blocks
    SET notes = 'Forbidden cross-tenant schedule update'
    WHERE id = '00000000-0000-0000-0000-000000960502'
  $statement$
);

SELECT pg_temp.expect_rejected(
  'tenant A manager cannot update tenant A schedule block to tenant B center',
  $statement$
    UPDATE public.schedule_blocks
    SET center_id = '00000000-0000-0000-0000-000000960302'
    WHERE id = '00000000-0000-0000-0000-000000960501'
  $statement$
);

SELECT pg_temp.expect_rejected(
  'tenant A manager cannot update tenant A schedule block to tenant B class type',
  $statement$
    UPDATE public.schedule_blocks
    SET class_type_id = '00000000-0000-0000-0000-000000960402'
    WHERE id = '00000000-0000-0000-0000-000000960501'
  $statement$
);

SELECT pg_temp.expect_rejected(
  'tenant A manager cannot move tenant A schedule block into tenant B',
  $statement$
    UPDATE public.schedule_blocks
    SET organization_id = '00000000-0000-0000-0000-000000960002'
    WHERE id = '00000000-0000-0000-0000-000000960501'
  $statement$
);

SELECT pg_temp.expect_rejected(
  'tenant A manager cannot insert schedule block directly into tenant B',
  $statement$
    INSERT INTO public.schedule_blocks (
      id,
      organization_id,
      center_id,
      service_date,
      start_time,
      end_time,
      class_type_id,
      required_coaches,
      status
    )
    VALUES (
      '00000000-0000-0000-0000-000000960505',
      '00000000-0000-0000-0000-000000960002',
      '00000000-0000-0000-0000-000000960302',
      DATE '2026-05-19',
      TIME '13:00',
      TIME '14:00',
      '00000000-0000-0000-0000-000000960402',
      1,
      'scheduled'
    )
  $statement$
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000960102');

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 0
    FROM public.schedule_blocks
    WHERE id = '00000000-0000-0000-0000-000000960501'
  ),
  'tenant B manager cannot read tenant A schedule block'
);

SELECT pg_temp.expect_no_updated_rows(
  'tenant B manager cannot update tenant A schedule block',
  $statement$
    UPDATE public.schedule_blocks
    SET notes = 'Forbidden tenant B manager update'
    WHERE id = '00000000-0000-0000-0000-000000960501'
  $statement$
);

RESET ROLE;

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM public.schedule_blocks
    WHERE id = '00000000-0000-0000-0000-000000960501'
      AND organization_id = '00000000-0000-0000-0000-000000960001'
      AND center_id = '00000000-0000-0000-0000-000000960301'
      AND class_type_id = '00000000-0000-0000-0000-000000960401'
  ),
  'tenant A schedule block keeps tenant A references before rollback'
);

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM public.schedule_blocks
    WHERE id = '00000000-0000-0000-0000-000000960502'
      AND organization_id = '00000000-0000-0000-0000-000000960002'
      AND center_id = '00000000-0000-0000-0000-000000960302'
      AND class_type_id = '00000000-0000-0000-0000-000000960402'
      AND notes = 'Tenant B baseline block'
  ),
  'tenant B schedule block remains unchanged before rollback'
);

SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1
    FROM public.schedule_blocks
    WHERE id IN (
      '00000000-0000-0000-0000-000000960503',
      '00000000-0000-0000-0000-000000960504',
      '00000000-0000-0000-0000-000000960505'
    )
  ),
  'forbidden schedule block inserts were not persisted before rollback'
);

ROLLBACK;
