-- BoxOps - S.66 tenant boundary person_profiles RLS rollback verification
--
-- Run locally with:
--   Get-Content -Raw supabase/snippets/tenant-boundary-person-profiles-rls-rollback.sql | docker exec -i supabase_db_boxops psql -U postgres -d postgres -v ON_ERROR_STOP=1
--
-- The script runs inside a transaction and rolls back all fixture data. It
-- validates a minimal tenant/RLS case from the negative-test matrix:
-- owner/admin in tenant A can manage valid tenant A person profiles under the
-- current DB policies, manager does not manage person_profiles because the
-- current policies do not grant it, members can read visible profiles in their
-- tenant, linked users can read and update their own basic profile fields,
-- internal profiles remain hidden from other non-admin members, tenant A/B
-- cannot read or mutate each other's person_profiles, tenant A cannot insert
-- directly into tenant B or move a profile across organizations, and tenant A
-- cannot link a tenant B user_id through the tenant-safe membership FK.
--
-- This intentionally does not validate invitations, Auth email acceptance,
-- /app/account or /app/coaches Server Actions, Storage-backed avatar/firma
-- flows, profile assets, SMTP, browser runtime, or product-only field limits.
-- Those paths need their own harness or real environment and remain outside
-- this local SQL rollback cut.

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
    RAISE EXCEPTION 'tenant boundary person_profiles RLS verification failed: %', label;
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
    '00000000-0000-0000-0000-000000966101',
    'authenticated',
    'authenticated',
    'tenant-boundary-person-profiles-owner-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Tenant Boundary Person Profiles Owner A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000966102',
    'authenticated',
    'authenticated',
    'tenant-boundary-person-profiles-admin-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Tenant Boundary Person Profiles Admin A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000966103',
    'authenticated',
    'authenticated',
    'tenant-boundary-person-profiles-manager-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Tenant Boundary Person Profiles Manager A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000966104',
    'authenticated',
    'authenticated',
    'tenant-boundary-person-profiles-coach-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Tenant Boundary Person Profiles Coach A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000966105',
    'authenticated',
    'authenticated',
    'tenant-boundary-person-profiles-manager-b@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Tenant Boundary Person Profiles Manager B"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000966106',
    'authenticated',
    'authenticated',
    'tenant-boundary-person-profiles-coach-b@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Tenant Boundary Person Profiles Coach B"}'::jsonb
  );

INSERT INTO public.organizations (id, name, slug, status, timezone)
VALUES
  (
    '00000000-0000-0000-0000-000000966001',
    'Tenant Boundary Person Profiles A',
    'tenant-boundary-person-profiles-a',
    'active',
    'Europe/Madrid'
  ),
  (
    '00000000-0000-0000-0000-000000966002',
    'Tenant Boundary Person Profiles B',
    'tenant-boundary-person-profiles-b',
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
    '00000000-0000-0000-0000-000000966201',
    '00000000-0000-0000-0000-000000966001',
    '00000000-0000-0000-0000-000000966101',
    'owner',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000966202',
    '00000000-0000-0000-0000-000000966001',
    '00000000-0000-0000-0000-000000966102',
    'admin',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000966203',
    '00000000-0000-0000-0000-000000966001',
    '00000000-0000-0000-0000-000000966103',
    'manager',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000966204',
    '00000000-0000-0000-0000-000000966001',
    '00000000-0000-0000-0000-000000966104',
    'coach',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000966205',
    '00000000-0000-0000-0000-000000966002',
    '00000000-0000-0000-0000-000000966105',
    'manager',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000966206',
    '00000000-0000-0000-0000-000000966002',
    '00000000-0000-0000-0000-000000966106',
    'coach',
    'active',
    now()
  );

INSERT INTO public.person_profiles (
  id,
  organization_id,
  user_id,
  display_name,
  visibility_status,
  status
)
VALUES
  (
    '00000000-0000-0000-0000-000000966402',
    '00000000-0000-0000-0000-000000966002',
    NULL,
    'Tenant B visible baseline person profile',
    'visible',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000966403',
    '00000000-0000-0000-0000-000000966002',
    '00000000-0000-0000-0000-000000966106',
    'Tenant B internal linked person profile',
    'internal',
    'active'
  );

SET LOCAL ROLE authenticated;

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000966101');

INSERT INTO public.person_profiles (
  id,
  organization_id,
  display_name,
  preferred_alias,
  public_email,
  visibility_status,
  status
)
VALUES (
  '00000000-0000-0000-0000-000000966401',
  '00000000-0000-0000-0000-000000966001',
  'Tenant A owner-created person profile',
  'Owner Created',
  'owner-created-person@boxops.local',
  'visible',
  'active'
);

UPDATE public.person_profiles
SET
  display_name = 'Tenant A owner-updated visible person profile',
  preferred_alias = 'Owner Updated'
WHERE id = '00000000-0000-0000-0000-000000966401';

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM public.person_profiles
    WHERE id = '00000000-0000-0000-0000-000000966401'
      AND organization_id = '00000000-0000-0000-0000-000000966001'
      AND display_name = 'Tenant A owner-updated visible person profile'
      AND preferred_alias = 'Owner Updated'
      AND visibility_status = 'visible'
  ),
  'tenant A owner can create and update a valid tenant A visible person profile'
);

SELECT pg_temp.expect_rejected(
  'tenant A owner cannot insert person profile directly into tenant B',
  $statement$
    INSERT INTO public.person_profiles (
      id,
      organization_id,
      display_name,
      visibility_status,
      status
    )
    VALUES (
      '00000000-0000-0000-0000-000000966407',
      '00000000-0000-0000-0000-000000966002',
      'Forbidden tenant B person profile',
      'visible',
      'active'
    )
  $statement$
);

SELECT pg_temp.expect_rejected(
  'tenant A owner cannot move tenant A person profile into tenant B',
  $statement$
    UPDATE public.person_profiles
    SET organization_id = '00000000-0000-0000-0000-000000966002'
    WHERE id = '00000000-0000-0000-0000-000000966401'
  $statement$
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000966102');

INSERT INTO public.person_profiles (
  id,
  organization_id,
  user_id,
  display_name,
  preferred_alias,
  public_email,
  visibility_status,
  status
)
VALUES (
  '00000000-0000-0000-0000-000000966404',
  '00000000-0000-0000-0000-000000966001',
  '00000000-0000-0000-0000-000000966104',
  'Tenant A coach own internal person profile',
  'Coach Own',
  'coach-own-person@boxops.local',
  'internal',
  'active'
);

UPDATE public.person_profiles
SET public_email = 'coach-own-updated-person@boxops.local'
WHERE id = '00000000-0000-0000-0000-000000966404';

INSERT INTO public.person_profiles (
  id,
  organization_id,
  display_name,
  visibility_status,
  status
)
VALUES (
  '00000000-0000-0000-0000-000000966405',
  '00000000-0000-0000-0000-000000966001',
  'Tenant A other internal person profile',
  'internal',
  'active'
);

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM public.person_profiles
    WHERE id = '00000000-0000-0000-0000-000000966404'
      AND organization_id = '00000000-0000-0000-0000-000000966001'
      AND user_id = '00000000-0000-0000-0000-000000966104'
      AND public_email = 'coach-own-updated-person@boxops.local'
      AND visibility_status = 'internal'
  ),
  'tenant A admin can create and update a valid linked internal person profile'
);

SELECT pg_temp.expect_rejected(
  'tenant A admin cannot create tenant A person profile with tenant B user membership',
  $statement$
    INSERT INTO public.person_profiles (
      id,
      organization_id,
      user_id,
      display_name,
      visibility_status,
      status
    )
    VALUES (
      '00000000-0000-0000-0000-000000966408',
      '00000000-0000-0000-0000-000000966001',
      '00000000-0000-0000-0000-000000966106',
      'Forbidden tenant B user linked person profile',
      'visible',
      'active'
    )
  $statement$
);

SELECT pg_temp.expect_rejected(
  'tenant A admin cannot update tenant A person profile to tenant B user_id',
  $statement$
    UPDATE public.person_profiles
    SET user_id = '00000000-0000-0000-0000-000000966106'
    WHERE id = '00000000-0000-0000-0000-000000966401'
  $statement$
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000966103');

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM public.person_profiles
    WHERE id = '00000000-0000-0000-0000-000000966401'
  ),
  'tenant A manager can read visible tenant A person profiles as a member'
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 0
    FROM public.person_profiles
    WHERE id IN (
      '00000000-0000-0000-0000-000000966404',
      '00000000-0000-0000-0000-000000966405'
    )
  ),
  'tenant A manager cannot read internal tenant A person profiles that are not own'
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 0
    FROM public.person_profiles
    WHERE id IN (
      '00000000-0000-0000-0000-000000966402',
      '00000000-0000-0000-0000-000000966403'
    )
  ),
  'tenant A manager cannot read tenant B person profiles'
);

SELECT pg_temp.expect_rejected(
  'tenant A manager cannot create tenant A person profile because current policies do not grant it',
  $statement$
    INSERT INTO public.person_profiles (
      id,
      organization_id,
      display_name,
      visibility_status,
      status
    )
    VALUES (
      '00000000-0000-0000-0000-000000966406',
      '00000000-0000-0000-0000-000000966001',
      'Forbidden manager person profile',
      'visible',
      'active'
    )
  $statement$
);

SELECT pg_temp.expect_no_updated_rows(
  'tenant A manager cannot update tenant A person profile because current policies do not grant it',
  $statement$
    UPDATE public.person_profiles
    SET display_name = 'Forbidden manager person profile update'
    WHERE id = '00000000-0000-0000-0000-000000966401'
  $statement$
);

SELECT pg_temp.expect_no_updated_rows(
  'tenant A manager cannot update tenant B person profile',
  $statement$
    UPDATE public.person_profiles
    SET display_name = 'Forbidden tenant B person profile update'
    WHERE id = '00000000-0000-0000-0000-000000966402'
  $statement$
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000966104');

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM public.person_profiles
    WHERE id = '00000000-0000-0000-0000-000000966401'
  ),
  'tenant A coach can read visible tenant A person profiles as a member'
);

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM public.person_profiles
    WHERE id = '00000000-0000-0000-0000-000000966404'
  ),
  'tenant A linked coach can read own internal person profile'
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 0
    FROM public.person_profiles
    WHERE id = '00000000-0000-0000-0000-000000966405'
  ),
  'tenant A coach cannot read another internal tenant A person profile'
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 0
    FROM public.person_profiles
    WHERE id IN (
      '00000000-0000-0000-0000-000000966402',
      '00000000-0000-0000-0000-000000966403'
    )
  ),
  'tenant A coach cannot read tenant B person profiles'
);

UPDATE public.person_profiles
SET
  display_name = 'Tenant A coach self-updated person profile',
  preferred_alias = 'Coach Self',
  public_email = 'coach-self-updated-person@boxops.local'
WHERE id = '00000000-0000-0000-0000-000000966404';

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM public.person_profiles
    WHERE id = '00000000-0000-0000-0000-000000966404'
      AND organization_id = '00000000-0000-0000-0000-000000966001'
      AND user_id = '00000000-0000-0000-0000-000000966104'
      AND display_name = 'Tenant A coach self-updated person profile'
      AND preferred_alias = 'Coach Self'
      AND public_email = 'coach-self-updated-person@boxops.local'
      AND visibility_status = 'internal'
      AND status = 'active'
  ),
  'tenant A linked coach can update own basic person profile fields allowed by current RLS and trigger'
);

SELECT pg_temp.expect_rejected(
  'tenant A linked coach cannot update own administrative status field',
  $statement$
    UPDATE public.person_profiles
    SET status = 'inactive'
    WHERE id = '00000000-0000-0000-0000-000000966404'
  $statement$
);

SELECT pg_temp.expect_rejected(
  'tenant A linked coach cannot update own visibility field',
  $statement$
    UPDATE public.person_profiles
    SET visibility_status = 'visible'
    WHERE id = '00000000-0000-0000-0000-000000966404'
  $statement$
);

SELECT pg_temp.expect_rejected(
  'tenant A linked coach cannot update own metadata field',
  $statement$
    UPDATE public.person_profiles
    SET metadata = '{"forbidden":"coach-self-metadata"}'::jsonb
    WHERE id = '00000000-0000-0000-0000-000000966404'
  $statement$
);

SELECT pg_temp.expect_no_updated_rows(
  'tenant A coach cannot update another tenant A person profile',
  $statement$
    UPDATE public.person_profiles
    SET display_name = 'Forbidden coach update of another person profile'
    WHERE id = '00000000-0000-0000-0000-000000966401'
  $statement$
);

SELECT pg_temp.expect_no_updated_rows(
  'tenant A coach cannot update tenant B person profile',
  $statement$
    UPDATE public.person_profiles
    SET display_name = 'Forbidden coach cross-tenant update'
    WHERE id = '00000000-0000-0000-0000-000000966402'
  $statement$
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000966105');

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 0
    FROM public.person_profiles
    WHERE id = '00000000-0000-0000-0000-000000966401'
  ),
  'tenant B manager cannot read tenant A visible person profile'
);

SELECT pg_temp.expect_no_updated_rows(
  'tenant B manager cannot update tenant A person profile',
  $statement$
    UPDATE public.person_profiles
    SET display_name = 'Forbidden tenant B manager person profile update'
    WHERE id = '00000000-0000-0000-0000-000000966401'
  $statement$
);

RESET ROLE;

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM public.person_profiles
    WHERE id = '00000000-0000-0000-0000-000000966401'
      AND organization_id = '00000000-0000-0000-0000-000000966001'
      AND user_id IS NULL
      AND display_name = 'Tenant A owner-updated visible person profile'
      AND preferred_alias = 'Owner Updated'
      AND visibility_status = 'visible'
      AND status = 'active'
  ),
  'tenant A owner-managed person profile remains unchanged before rollback'
);

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM public.person_profiles
    WHERE id = '00000000-0000-0000-0000-000000966404'
      AND organization_id = '00000000-0000-0000-0000-000000966001'
      AND user_id = '00000000-0000-0000-0000-000000966104'
      AND display_name = 'Tenant A coach self-updated person profile'
      AND preferred_alias = 'Coach Self'
      AND public_email = 'coach-self-updated-person@boxops.local'
      AND visibility_status = 'internal'
      AND status = 'active'
      AND metadata = '{}'::jsonb
  ),
  'tenant A linked own profile keeps only allowed self updates before rollback'
);

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM public.person_profiles
    WHERE id = '00000000-0000-0000-0000-000000966402'
      AND organization_id = '00000000-0000-0000-0000-000000966002'
      AND display_name = 'Tenant B visible baseline person profile'
  ),
  'tenant B visible person profile remains unchanged before rollback'
);

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM public.person_profiles
    WHERE id = '00000000-0000-0000-0000-000000966403'
      AND organization_id = '00000000-0000-0000-0000-000000966002'
      AND user_id = '00000000-0000-0000-0000-000000966106'
      AND display_name = 'Tenant B internal linked person profile'
      AND visibility_status = 'internal'
  ),
  'tenant B internal linked person profile remains unchanged before rollback'
);

SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1
    FROM public.person_profiles
    WHERE id IN (
      '00000000-0000-0000-0000-000000966406',
      '00000000-0000-0000-0000-000000966407',
      '00000000-0000-0000-0000-000000966408'
    )
  ),
  'forbidden person profile inserts were not persisted before rollback'
);

ROLLBACK;
