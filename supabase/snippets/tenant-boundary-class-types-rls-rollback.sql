-- BoxOps - S.64 tenant boundary class_types RLS rollback verification
--
-- Run locally with:
--   Get-Content -Raw supabase/snippets/tenant-boundary-class-types-rls-rollback.sql | docker exec -i supabase_db_boxops psql -U postgres -d postgres -v ON_ERROR_STOP=1
--
-- The script runs inside a transaction and rolls back all fixture data. It
-- validates a minimal tenant/RLS case from the negative-test matrix: high
-- operational roles in tenant A can manage valid tenant A class/activity types,
-- cannot read or mutate tenant B class/activity types, cannot insert directly
-- into tenant B, and cannot move an existing class/activity type across
-- organizations.
--
-- This intentionally does not validate update_class_type_and_sync_defaults(...)
-- or default synchronization into schedule blocks/templates. That path uses
-- product runtime/RPC behavior and remains outside this local SQL rollback cut.
-- DB constraints covered here are the constraints that exist on class_types
-- itself, including category enum and required_coaches >= 0. The application/RPC
-- upper bound required_coaches <= 20 remains outside this direct table check.

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
    RAISE EXCEPTION 'tenant boundary class_types RLS verification failed: %', label;
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
    '00000000-0000-0000-0000-000000964101',
    'authenticated',
    'authenticated',
    'tenant-boundary-class-types-owner-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Tenant Boundary Class Types Owner A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000964102',
    'authenticated',
    'authenticated',
    'tenant-boundary-class-types-admin-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Tenant Boundary Class Types Admin A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000964103',
    'authenticated',
    'authenticated',
    'tenant-boundary-class-types-manager-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Tenant Boundary Class Types Manager A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000964104',
    'authenticated',
    'authenticated',
    'tenant-boundary-class-types-coach-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Tenant Boundary Class Types Coach A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000964105',
    'authenticated',
    'authenticated',
    'tenant-boundary-class-types-manager-b@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Tenant Boundary Class Types Manager B"}'::jsonb
  );

INSERT INTO public.organizations (id, name, slug, status, timezone)
VALUES
  (
    '00000000-0000-0000-0000-000000964001',
    'Tenant Boundary Class Types A',
    'tenant-boundary-class-types-a',
    'active',
    'Europe/Madrid'
  ),
  (
    '00000000-0000-0000-0000-000000964002',
    'Tenant Boundary Class Types B',
    'tenant-boundary-class-types-b',
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
    '00000000-0000-0000-0000-000000964201',
    '00000000-0000-0000-0000-000000964001',
    '00000000-0000-0000-0000-000000964101',
    'owner',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000964202',
    '00000000-0000-0000-0000-000000964001',
    '00000000-0000-0000-0000-000000964102',
    'admin',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000964203',
    '00000000-0000-0000-0000-000000964001',
    '00000000-0000-0000-0000-000000964103',
    'manager',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000964204',
    '00000000-0000-0000-0000-000000964001',
    '00000000-0000-0000-0000-000000964104',
    'coach',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000964205',
    '00000000-0000-0000-0000-000000964002',
    '00000000-0000-0000-0000-000000964105',
    'manager',
    'active',
    now()
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
  '00000000-0000-0000-0000-000000964402',
  '00000000-0000-0000-0000-000000964002',
  'Tenant B baseline class type',
  'tenant-b-baseline-class-type',
  'class',
  1,
  'active'
);

SET LOCAL ROLE authenticated;

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000964101');

INSERT INTO public.class_types (
  id,
  organization_id,
  name,
  slug,
  category,
  required_coaches,
  requires_certification,
  color,
  status
)
VALUES (
  '00000000-0000-0000-0000-000000964401',
  '00000000-0000-0000-0000-000000964001',
  'Tenant A owner class type',
  'tenant-a-owner-class-type',
  'class',
  1,
  false,
  '#2563eb',
  'active'
);

UPDATE public.class_types
SET
  name = 'Tenant A owner class type updated',
  required_coaches = 2
WHERE id = '00000000-0000-0000-0000-000000964401';

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM public.class_types
    WHERE id = '00000000-0000-0000-0000-000000964401'
      AND organization_id = '00000000-0000-0000-0000-000000964001'
      AND name = 'Tenant A owner class type updated'
      AND required_coaches = 2
  ),
  'tenant A owner can create and update a valid tenant A class type'
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000964102');

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
  '00000000-0000-0000-0000-000000964403',
  '00000000-0000-0000-0000-000000964001',
  'Tenant A admin class type',
  'tenant-a-admin-class-type',
  'staffing',
  0,
  'active'
);

UPDATE public.class_types
SET
  category = 'event',
  status = 'inactive'
WHERE id = '00000000-0000-0000-0000-000000964403';

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM public.class_types
    WHERE id = '00000000-0000-0000-0000-000000964403'
      AND organization_id = '00000000-0000-0000-0000-000000964001'
      AND category = 'event'
      AND status = 'inactive'
  ),
  'tenant A admin can create and update a valid tenant A class type'
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000964103');

INSERT INTO public.class_types (
  id,
  organization_id,
  name,
  slug,
  category,
  required_coaches,
  requires_certification,
  color,
  status
)
VALUES (
  '00000000-0000-0000-0000-000000964404',
  '00000000-0000-0000-0000-000000964001',
  'Tenant A manager class type',
  'tenant-a-manager-class-type',
  'competition',
  1,
  true,
  '#dc2626',
  'active'
);

UPDATE public.class_types
SET
  requires_certification = false,
  color = '#16a34a'
WHERE id = '00000000-0000-0000-0000-000000964404';

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM public.class_types
    WHERE id = '00000000-0000-0000-0000-000000964404'
      AND organization_id = '00000000-0000-0000-0000-000000964001'
      AND requires_certification = false
      AND color = '#16a34a'
  ),
  'tenant A manager can create and update a valid tenant A class type'
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 0
    FROM public.class_types
    WHERE id = '00000000-0000-0000-0000-000000964402'
  ),
  'tenant A manager cannot read tenant B class type'
);

SELECT pg_temp.expect_no_updated_rows(
  'tenant A manager cannot update tenant B class type',
  $statement$
    UPDATE public.class_types
    SET name = 'Forbidden cross-tenant class type update'
    WHERE id = '00000000-0000-0000-0000-000000964402'
  $statement$
);

SELECT pg_temp.expect_rejected(
  'tenant A manager cannot insert class type directly into tenant B',
  $statement$
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
      '00000000-0000-0000-0000-000000964405',
      '00000000-0000-0000-0000-000000964002',
      'Forbidden tenant B class type',
      'forbidden-tenant-b-class-type',
      'class',
      1,
      'active'
    )
  $statement$
);

SELECT pg_temp.expect_rejected(
  'tenant A manager cannot move tenant A class type into tenant B',
  $statement$
    UPDATE public.class_types
    SET
      organization_id = '00000000-0000-0000-0000-000000964002',
      slug = 'tenant-a-manager-class-type-moved'
    WHERE id = '00000000-0000-0000-0000-000000964404'
  $statement$
);

SELECT pg_temp.expect_rejected(
  'class_types rejects negative required_coaches on update',
  $statement$
    UPDATE public.class_types
    SET required_coaches = -1
    WHERE id = '00000000-0000-0000-0000-000000964404'
  $statement$
);

SELECT pg_temp.expect_rejected(
  'class_types rejects invalid category on update',
  $statement$
    UPDATE public.class_types
    SET category = 'not-a-category'
    WHERE id = '00000000-0000-0000-0000-000000964404'
  $statement$
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000964104');

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 3
    FROM public.class_types
    WHERE organization_id = '00000000-0000-0000-0000-000000964001'
  ),
  'tenant A coach can read tenant A class type catalog'
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 0
    FROM public.class_types
    WHERE id = '00000000-0000-0000-0000-000000964402'
  ),
  'tenant A coach cannot read tenant B class type'
);

SELECT pg_temp.expect_no_updated_rows(
  'tenant A coach cannot update tenant A class type',
  $statement$
    UPDATE public.class_types
    SET name = 'Forbidden coach class type update'
    WHERE id = '00000000-0000-0000-0000-000000964401'
  $statement$
);

SELECT pg_temp.expect_rejected(
  'tenant A coach cannot create tenant A class type',
  $statement$
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
      '00000000-0000-0000-0000-000000964406',
      '00000000-0000-0000-0000-000000964001',
      'Forbidden coach class type',
      'forbidden-coach-class-type',
      'class',
      1,
      'active'
    )
  $statement$
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000964105');

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 0
    FROM public.class_types
    WHERE id = '00000000-0000-0000-0000-000000964401'
  ),
  'tenant B manager cannot read tenant A class type'
);

SELECT pg_temp.expect_no_updated_rows(
  'tenant B manager cannot update tenant A class type',
  $statement$
    UPDATE public.class_types
    SET name = 'Forbidden tenant B manager class type update'
    WHERE id = '00000000-0000-0000-0000-000000964401'
  $statement$
);

RESET ROLE;

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM public.class_types
    WHERE id = '00000000-0000-0000-0000-000000964401'
      AND organization_id = '00000000-0000-0000-0000-000000964001'
      AND name = 'Tenant A owner class type updated'
      AND required_coaches = 2
  ),
  'tenant A owner class type remains in tenant A before rollback'
);

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM public.class_types
    WHERE id = '00000000-0000-0000-0000-000000964402'
      AND organization_id = '00000000-0000-0000-0000-000000964002'
      AND name = 'Tenant B baseline class type'
  ),
  'tenant B class type remains unchanged before rollback'
);

SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1
    FROM public.class_types
    WHERE id IN (
      '00000000-0000-0000-0000-000000964405',
      '00000000-0000-0000-0000-000000964406'
    )
  ),
  'forbidden class type inserts were not persisted before rollback'
);

ROLLBACK;
