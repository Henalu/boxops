-- BoxOps - S.59 tenant boundary centers RLS rollback verification
--
-- Run locally with:
--   Get-Content -Raw supabase/snippets/tenant-boundary-centers-rls-rollback.sql | docker exec -i supabase_db_boxops psql -U postgres -d postgres -v ON_ERROR_STOP=1
--
-- The script runs inside a transaction and rolls back all fixture data. It
-- validates one minimal tenant/RLS case from the negative-test matrix: a high
-- role in tenant A cannot read or mutate tenant B centers and cannot move an
-- existing center across organizations by changing organization_id.

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
    RAISE EXCEPTION 'tenant boundary centers RLS verification failed: %', label;
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
    '00000000-0000-0000-0000-000000959101',
    'authenticated',
    'authenticated',
    'tenant-boundary-owner-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Tenant Boundary Owner A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000959102',
    'authenticated',
    'authenticated',
    'tenant-boundary-coach-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Tenant Boundary Coach A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000959103',
    'authenticated',
    'authenticated',
    'tenant-boundary-owner-b@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Tenant Boundary Owner B"}'::jsonb
  );

INSERT INTO public.organizations (id, name, slug, status, timezone)
VALUES
  (
    '00000000-0000-0000-0000-000000959001',
    'Tenant Boundary A',
    'tenant-boundary-a',
    'active',
    'Europe/Madrid'
  ),
  (
    '00000000-0000-0000-0000-000000959002',
    'Tenant Boundary B',
    'tenant-boundary-b',
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
    '00000000-0000-0000-0000-000000959201',
    '00000000-0000-0000-0000-000000959001',
    '00000000-0000-0000-0000-000000959101',
    'owner',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000959202',
    '00000000-0000-0000-0000-000000959001',
    '00000000-0000-0000-0000-000000959102',
    'coach',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000959203',
    '00000000-0000-0000-0000-000000959002',
    '00000000-0000-0000-0000-000000959103',
    'owner',
    'active',
    now()
  );

INSERT INTO public.centers (id, organization_id, name, slug, timezone, status)
VALUES
  (
    '00000000-0000-0000-0000-000000959301',
    '00000000-0000-0000-0000-000000959001',
    'Tenant Boundary Center A',
    'tenant-boundary-center-a',
    'Europe/Madrid',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000959302',
    '00000000-0000-0000-0000-000000959002',
    'Tenant Boundary Center B',
    'tenant-boundary-center-b',
    'Europe/Madrid',
    'active'
  );

SET LOCAL ROLE authenticated;

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000959101');

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 1
    FROM public.centers
    WHERE id = '00000000-0000-0000-0000-000000959301'
  ),
  'tenant A owner can read tenant A center'
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 0
    FROM public.centers
    WHERE id = '00000000-0000-0000-0000-000000959302'
  ),
  'tenant A owner cannot read tenant B center'
);

UPDATE public.centers
SET name = 'Tenant Boundary Center A Updated'
WHERE id = '00000000-0000-0000-0000-000000959301';

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM public.centers
    WHERE id = '00000000-0000-0000-0000-000000959301'
      AND organization_id = '00000000-0000-0000-0000-000000959001'
      AND name = 'Tenant Boundary Center A Updated'
  ),
  'tenant A owner can update allowed tenant A center fields'
);

SELECT pg_temp.expect_no_updated_rows(
  'tenant A owner cannot update tenant B center',
  $statement$
    UPDATE public.centers
    SET name = 'Forbidden Cross Tenant Update'
    WHERE id = '00000000-0000-0000-0000-000000959302'
  $statement$
);

SELECT pg_temp.expect_rejected(
  'tenant A owner cannot move tenant A center into tenant B',
  $statement$
    UPDATE public.centers
    SET
      organization_id = '00000000-0000-0000-0000-000000959002',
      slug = 'tenant-boundary-center-a-moved'
    WHERE id = '00000000-0000-0000-0000-000000959301'
  $statement$
);

SELECT pg_temp.expect_rejected(
  'tenant A owner cannot insert a center into tenant B',
  $statement$
    INSERT INTO public.centers (
      id,
      organization_id,
      name,
      slug,
      timezone,
      status
    )
    VALUES (
      '00000000-0000-0000-0000-000000959303',
      '00000000-0000-0000-0000-000000959002',
      'Forbidden Tenant B Center',
      'forbidden-tenant-b-center',
      'Europe/Madrid',
      'active'
    )
  $statement$
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000959102');

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 1
    FROM public.centers
    WHERE id = '00000000-0000-0000-0000-000000959301'
  ),
  'tenant A coach can read tenant A center'
);

SELECT pg_temp.expect_no_updated_rows(
  'tenant A coach cannot update tenant A center',
  $statement$
    UPDATE public.centers
    SET name = 'Forbidden Coach Update'
    WHERE id = '00000000-0000-0000-0000-000000959301'
  $statement$
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000959103');

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 0
    FROM public.centers
    WHERE id = '00000000-0000-0000-0000-000000959301'
  ),
  'tenant B owner cannot read tenant A center'
);

SELECT pg_temp.expect_no_updated_rows(
  'tenant B owner cannot update tenant A center',
  $statement$
    UPDATE public.centers
    SET name = 'Forbidden Tenant B Owner Update'
    WHERE id = '00000000-0000-0000-0000-000000959301'
  $statement$
);

RESET ROLE;

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM public.centers
    WHERE id = '00000000-0000-0000-0000-000000959301'
      AND organization_id = '00000000-0000-0000-0000-000000959001'
  ),
  'tenant A center remains in tenant A before rollback'
);

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM public.centers
    WHERE id = '00000000-0000-0000-0000-000000959302'
      AND organization_id = '00000000-0000-0000-0000-000000959002'
      AND name = 'Tenant Boundary Center B'
  ),
  'tenant B center remains unchanged before rollback'
);

ROLLBACK;
