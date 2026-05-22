-- BoxOps - S.67 tenant boundary organization_memberships RLS rollback verification
--
-- Run locally with:
--   Get-Content -Raw supabase/snippets/tenant-boundary-organization-memberships-rls-rollback.sql | docker exec -i supabase_db_boxops psql -U postgres -d postgres -v ON_ERROR_STOP=1
--
-- The script runs inside a transaction and rolls back all fixture data. It
-- validates a minimal tenant/RLS case from the negative-test matrix:
-- owner/admin in tenant A can create and update a valid tenant A membership
-- under the current DB policies, manager can read tenant memberships because
-- the current SELECT policy allows it but cannot manage access, coach can read
-- only its own membership, tenant A/B cannot read or mutate each other's
-- memberships, tenant A cannot insert directly into tenant B, and tenant A
-- cannot move a membership across organizations by changing organization_id.
--
-- This intentionally does not validate invitations, Auth email acceptance,
-- /app/coaches Server Actions, Resend/Supabase Auth, browser runtime, or
-- product-only invitation flows. The current schema/policies allow owner/admin
-- to add an existing auth.users.id to their own tenant; this snippet treats
-- that as allowed DB behavior and leaves runtime invitation policy to the app.

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
    RAISE EXCEPTION 'tenant boundary organization_memberships RLS verification failed: %', label;
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
    '00000000-0000-0000-0000-000000967101',
    'authenticated',
    'authenticated',
    'tenant-boundary-memberships-owner-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Tenant Boundary Memberships Owner A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000967102',
    'authenticated',
    'authenticated',
    'tenant-boundary-memberships-admin-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Tenant Boundary Memberships Admin A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000967103',
    'authenticated',
    'authenticated',
    'tenant-boundary-memberships-manager-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Tenant Boundary Memberships Manager A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000967104',
    'authenticated',
    'authenticated',
    'tenant-boundary-memberships-coach-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Tenant Boundary Memberships Coach A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000967105',
    'authenticated',
    'authenticated',
    'tenant-boundary-memberships-member-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Tenant Boundary Memberships Member A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000967106',
    'authenticated',
    'authenticated',
    'tenant-boundary-memberships-owner-b@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Tenant Boundary Memberships Owner B"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000967107',
    'authenticated',
    'authenticated',
    'tenant-boundary-memberships-coach-b@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Tenant Boundary Memberships Coach B"}'::jsonb
  );

INSERT INTO public.organizations (id, name, slug, status, timezone)
VALUES
  (
    '00000000-0000-0000-0000-000000967001',
    'Tenant Boundary Memberships A',
    'tenant-boundary-memberships-a',
    'active',
    'Europe/Madrid'
  ),
  (
    '00000000-0000-0000-0000-000000967002',
    'Tenant Boundary Memberships B',
    'tenant-boundary-memberships-b',
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
    '00000000-0000-0000-0000-000000967201',
    '00000000-0000-0000-0000-000000967001',
    '00000000-0000-0000-0000-000000967101',
    'owner',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000967202',
    '00000000-0000-0000-0000-000000967001',
    '00000000-0000-0000-0000-000000967102',
    'admin',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000967203',
    '00000000-0000-0000-0000-000000967001',
    '00000000-0000-0000-0000-000000967103',
    'manager',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000967204',
    '00000000-0000-0000-0000-000000967001',
    '00000000-0000-0000-0000-000000967104',
    'coach',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000967205',
    '00000000-0000-0000-0000-000000967002',
    '00000000-0000-0000-0000-000000967106',
    'owner',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000967206',
    '00000000-0000-0000-0000-000000967002',
    '00000000-0000-0000-0000-000000967107',
    'coach',
    'active',
    now()
  );

SET LOCAL ROLE authenticated;

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000967102');

INSERT INTO public.organization_memberships (
  id,
  organization_id,
  user_id,
  role,
  status,
  invited_at
)
VALUES (
  '00000000-0000-0000-0000-000000967207',
  '00000000-0000-0000-0000-000000967001',
  '00000000-0000-0000-0000-000000967105',
  'coach',
  'invited',
  now()
);

UPDATE public.organization_memberships
SET
  role = 'manager',
  status = 'active',
  joined_at = now()
WHERE id = '00000000-0000-0000-0000-000000967207';

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM public.organization_memberships
    WHERE id = '00000000-0000-0000-0000-000000967207'
      AND organization_id = '00000000-0000-0000-0000-000000967001'
      AND user_id = '00000000-0000-0000-0000-000000967105'
      AND role = 'manager'
      AND status = 'active'
  ),
  'tenant A admin can create and update a valid tenant A membership'
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000967101');

UPDATE public.organization_memberships
SET
  role = 'staff',
  status = 'inactive'
WHERE id = '00000000-0000-0000-0000-000000967207';

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM public.organization_memberships
    WHERE id = '00000000-0000-0000-0000-000000967207'
      AND organization_id = '00000000-0000-0000-0000-000000967001'
      AND user_id = '00000000-0000-0000-0000-000000967105'
      AND role = 'staff'
      AND status = 'inactive'
  ),
  'tenant A owner can update role and status inside tenant A under current policies'
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 0
    FROM public.organization_memberships
    WHERE organization_id = '00000000-0000-0000-0000-000000967002'
  ),
  'tenant A owner cannot read tenant B memberships'
);

SELECT pg_temp.expect_no_updated_rows(
  'tenant A owner cannot update tenant B membership',
  $statement$
    UPDATE public.organization_memberships
    SET status = 'inactive'
    WHERE id = '00000000-0000-0000-0000-000000967206'
  $statement$
);

SELECT pg_temp.expect_rejected(
  'tenant A owner cannot insert membership directly into tenant B',
  $statement$
    INSERT INTO public.organization_memberships (
      id,
      organization_id,
      user_id,
      role,
      status,
      joined_at
    )
    VALUES (
      '00000000-0000-0000-0000-000000967208',
      '00000000-0000-0000-0000-000000967002',
      '00000000-0000-0000-0000-000000967105',
      'coach',
      'active',
      now()
    )
  $statement$
);

SELECT pg_temp.expect_rejected(
  'tenant A owner cannot move tenant A membership into tenant B',
  $statement$
    UPDATE public.organization_memberships
    SET
      organization_id = '00000000-0000-0000-0000-000000967002',
      user_id = '00000000-0000-0000-0000-000000967105',
      role = 'coach',
      status = 'active'
    WHERE id = '00000000-0000-0000-0000-000000967207'
  $statement$
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000967103');

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 5
    FROM public.organization_memberships
    WHERE organization_id = '00000000-0000-0000-0000-000000967001'
  ),
  'tenant A manager can read tenant A memberships under current SELECT policy'
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 0
    FROM public.organization_memberships
    WHERE organization_id = '00000000-0000-0000-0000-000000967002'
  ),
  'tenant A manager cannot read tenant B memberships'
);

SELECT pg_temp.expect_no_updated_rows(
  'tenant A manager cannot elevate role or change status of another membership',
  $statement$
    UPDATE public.organization_memberships
    SET
      role = 'owner',
      status = 'active'
    WHERE id = '00000000-0000-0000-0000-000000967204'
  $statement$
);

SELECT pg_temp.expect_rejected(
  'tenant A manager cannot create membership in tenant A',
  $statement$
    INSERT INTO public.organization_memberships (
      id,
      organization_id,
      user_id,
      role,
      status,
      invited_at
    )
    VALUES (
      '00000000-0000-0000-0000-000000967209',
      '00000000-0000-0000-0000-000000967001',
      '00000000-0000-0000-0000-000000967106',
      'coach',
      'invited',
      now()
    )
  $statement$
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000967104');

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 1
    FROM public.organization_memberships
    WHERE organization_id = '00000000-0000-0000-0000-000000967001'
  ),
  'tenant A coach can only read own tenant A membership'
);

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM public.organization_memberships
    WHERE id = '00000000-0000-0000-0000-000000967204'
      AND user_id = '00000000-0000-0000-0000-000000967104'
  ),
  'tenant A coach can read own membership row'
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 0
    FROM public.organization_memberships
    WHERE id IN (
      '00000000-0000-0000-0000-000000967201',
      '00000000-0000-0000-0000-000000967202',
      '00000000-0000-0000-0000-000000967203',
      '00000000-0000-0000-0000-000000967207'
    )
  ),
  'tenant A coach cannot read other tenant A memberships'
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 0
    FROM public.organization_memberships
    WHERE organization_id = '00000000-0000-0000-0000-000000967002'
  ),
  'tenant A coach cannot read tenant B memberships'
);

SELECT pg_temp.expect_no_updated_rows(
  'tenant A coach cannot update own membership role or status',
  $statement$
    UPDATE public.organization_memberships
    SET
      role = 'manager',
      status = 'active'
    WHERE id = '00000000-0000-0000-0000-000000967204'
  $statement$
);

SELECT pg_temp.expect_rejected(
  'tenant A coach cannot create tenant A membership',
  $statement$
    INSERT INTO public.organization_memberships (
      id,
      organization_id,
      user_id,
      role,
      status,
      invited_at
    )
    VALUES (
      '00000000-0000-0000-0000-000000967210',
      '00000000-0000-0000-0000-000000967001',
      '00000000-0000-0000-0000-000000967106',
      'coach',
      'invited',
      now()
    )
  $statement$
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000967106');

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 2
    FROM public.organization_memberships
    WHERE organization_id = '00000000-0000-0000-0000-000000967002'
  ),
  'tenant B owner can read tenant B memberships'
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 0
    FROM public.organization_memberships
    WHERE organization_id = '00000000-0000-0000-0000-000000967001'
  ),
  'tenant B owner cannot read tenant A memberships'
);

SELECT pg_temp.expect_no_updated_rows(
  'tenant B owner cannot update tenant A membership',
  $statement$
    UPDATE public.organization_memberships
    SET status = 'inactive'
    WHERE id = '00000000-0000-0000-0000-000000967204'
  $statement$
);

RESET ROLE;

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM public.organization_memberships
    WHERE id = '00000000-0000-0000-0000-000000967207'
      AND organization_id = '00000000-0000-0000-0000-000000967001'
      AND user_id = '00000000-0000-0000-0000-000000967105'
      AND role = 'staff'
      AND status = 'inactive'
  ),
  'tenant A membership remains in tenant A before rollback'
);

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM public.organization_memberships
    WHERE id = '00000000-0000-0000-0000-000000967206'
      AND organization_id = '00000000-0000-0000-0000-000000967002'
      AND user_id = '00000000-0000-0000-0000-000000967107'
      AND role = 'coach'
      AND status = 'active'
  ),
  'tenant B membership remains unchanged before rollback'
);

SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1
    FROM public.organization_memberships
    WHERE id IN (
      '00000000-0000-0000-0000-000000967208',
      '00000000-0000-0000-0000-000000967209',
      '00000000-0000-0000-0000-000000967210'
    )
  ),
  'forbidden membership inserts were not persisted before rollback'
);

ROLLBACK;
