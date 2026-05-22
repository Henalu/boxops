-- BoxOps - S.65 tenant boundary coach_profiles RLS rollback verification
--
-- Run locally with:
--   Get-Content -Raw supabase/snippets/tenant-boundary-coach-profiles-rls-rollback.sql | docker exec -i supabase_db_boxops psql -U postgres -d postgres -v ON_ERROR_STOP=1
--
-- The script runs inside a transaction and rolls back all fixture data. It
-- validates a minimal tenant/RLS case from the negative-test matrix:
-- owner/admin/manager in tenant A can manage valid tenant A coach profiles
-- under the current DB policies, coaches can read tenant profiles but cannot
-- manage them, tenant A cannot read or mutate tenant B coach profiles, cannot
-- insert directly into tenant B, cannot move a coach profile across
-- organizations, and cannot use tenant B primary_center_id, person_profile_id
-- or user_id references.
--
-- This intentionally does not validate invitations, Auth email acceptance,
-- /app/coaches Server Actions, runtime-only "active/assignable" product rules
-- or membership role changes. Those paths need their own harness or real
-- environment and remain outside this local SQL rollback cut.

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
    RAISE EXCEPTION 'tenant boundary coach_profiles RLS verification failed: %', label;
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
    '00000000-0000-0000-0000-000000965101',
    'authenticated',
    'authenticated',
    'tenant-boundary-coach-profiles-owner-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Tenant Boundary Coach Profiles Owner A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000965102',
    'authenticated',
    'authenticated',
    'tenant-boundary-coach-profiles-admin-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Tenant Boundary Coach Profiles Admin A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000965103',
    'authenticated',
    'authenticated',
    'tenant-boundary-coach-profiles-manager-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Tenant Boundary Coach Profiles Manager A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000965104',
    'authenticated',
    'authenticated',
    'tenant-boundary-coach-profiles-coach-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Tenant Boundary Coach Profiles Coach A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000965105',
    'authenticated',
    'authenticated',
    'tenant-boundary-coach-profiles-manager-b@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Tenant Boundary Coach Profiles Manager B"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000965106',
    'authenticated',
    'authenticated',
    'tenant-boundary-coach-profiles-coach-b@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Tenant Boundary Coach Profiles Coach B"}'::jsonb
  );

INSERT INTO public.organizations (id, name, slug, status, timezone)
VALUES
  (
    '00000000-0000-0000-0000-000000965001',
    'Tenant Boundary Coach Profiles A',
    'tenant-boundary-coach-profiles-a',
    'active',
    'Europe/Madrid'
  ),
  (
    '00000000-0000-0000-0000-000000965002',
    'Tenant Boundary Coach Profiles B',
    'tenant-boundary-coach-profiles-b',
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
    '00000000-0000-0000-0000-000000965201',
    '00000000-0000-0000-0000-000000965001',
    '00000000-0000-0000-0000-000000965101',
    'owner',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000965202',
    '00000000-0000-0000-0000-000000965001',
    '00000000-0000-0000-0000-000000965102',
    'admin',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000965203',
    '00000000-0000-0000-0000-000000965001',
    '00000000-0000-0000-0000-000000965103',
    'manager',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000965204',
    '00000000-0000-0000-0000-000000965001',
    '00000000-0000-0000-0000-000000965104',
    'coach',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000965205',
    '00000000-0000-0000-0000-000000965002',
    '00000000-0000-0000-0000-000000965105',
    'manager',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000965206',
    '00000000-0000-0000-0000-000000965002',
    '00000000-0000-0000-0000-000000965106',
    'coach',
    'active',
    now()
  );

INSERT INTO public.centers (id, organization_id, name, slug, timezone, status)
VALUES
  (
    '00000000-0000-0000-0000-000000965301',
    '00000000-0000-0000-0000-000000965001',
    'Tenant Boundary Coach Profiles Center A',
    'tenant-boundary-coach-profiles-center-a',
    'Europe/Madrid',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000965302',
    '00000000-0000-0000-0000-000000965002',
    'Tenant Boundary Coach Profiles Center B',
    'tenant-boundary-coach-profiles-center-b',
    'Europe/Madrid',
    'active'
  );

INSERT INTO public.person_profiles (
  id,
  organization_id,
  display_name,
  visibility_status,
  status
)
VALUES
  (
    '00000000-0000-0000-0000-000000965401',
    '00000000-0000-0000-0000-000000965001',
    'Tenant Boundary Pending Coach A One',
    'visible',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000965402',
    '00000000-0000-0000-0000-000000965001',
    'Tenant Boundary Pending Coach A Two',
    'visible',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000965404',
    '00000000-0000-0000-0000-000000965001',
    'Tenant Boundary Pending Coach A Three',
    'visible',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000965405',
    '00000000-0000-0000-0000-000000965001',
    'Tenant Boundary Pending Coach A Four',
    'visible',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000965403',
    '00000000-0000-0000-0000-000000965002',
    'Tenant Boundary Pending Coach B',
    'visible',
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
VALUES (
  '00000000-0000-0000-0000-000000965502',
  '00000000-0000-0000-0000-000000965002',
  '00000000-0000-0000-0000-000000965106',
  '00000000-0000-0000-0000-000000965302',
  0,
  'active',
  'Tenant B baseline coach profile'
);

SET LOCAL ROLE authenticated;

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000965101');

INSERT INTO public.coach_profiles (
  id,
  organization_id,
  user_id,
  primary_center_id,
  weekly_contracted_hours,
  status,
  notes
)
VALUES (
  '00000000-0000-0000-0000-000000965501',
  '00000000-0000-0000-0000-000000965001',
  '00000000-0000-0000-0000-000000965104',
  '00000000-0000-0000-0000-000000965301',
  5,
  'active',
  'Tenant A owner-created coach profile'
);

UPDATE public.coach_profiles
SET
  weekly_contracted_hours = 6,
  notes = 'Tenant A owner-updated coach profile'
WHERE id = '00000000-0000-0000-0000-000000965501';

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM public.coach_profiles
    WHERE id = '00000000-0000-0000-0000-000000965501'
      AND organization_id = '00000000-0000-0000-0000-000000965001'
      AND user_id = '00000000-0000-0000-0000-000000965104'
      AND primary_center_id = '00000000-0000-0000-0000-000000965301'
      AND weekly_contracted_hours = 6
      AND notes = 'Tenant A owner-updated coach profile'
  ),
  'tenant A owner can create and update a valid tenant A coach profile'
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000965102');

INSERT INTO public.coach_profiles (
  id,
  organization_id,
  person_profile_id,
  primary_center_id,
  weekly_contracted_hours,
  status,
  notes
)
VALUES (
  '00000000-0000-0000-0000-000000965503',
  '00000000-0000-0000-0000-000000965001',
  '00000000-0000-0000-0000-000000965401',
  '00000000-0000-0000-0000-000000965301',
  3.5,
  'active',
  'Tenant A admin-created pending coach profile'
);

UPDATE public.coach_profiles
SET status = 'inactive'
WHERE id = '00000000-0000-0000-0000-000000965503';

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM public.coach_profiles
    WHERE id = '00000000-0000-0000-0000-000000965503'
      AND organization_id = '00000000-0000-0000-0000-000000965001'
      AND person_profile_id = '00000000-0000-0000-0000-000000965401'
      AND status = 'inactive'
  ),
  'tenant A admin can create and update a valid pending tenant A coach profile'
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000965103');

INSERT INTO public.coach_profiles (
  id,
  organization_id,
  person_profile_id,
  primary_center_id,
  weekly_contracted_hours,
  status,
  notes
)
VALUES (
  '00000000-0000-0000-0000-000000965504',
  '00000000-0000-0000-0000-000000965001',
  '00000000-0000-0000-0000-000000965402',
  '00000000-0000-0000-0000-000000965301',
  2,
  'active',
  'Tenant A manager-created pending coach profile'
);

UPDATE public.coach_profiles
SET
  weekly_contracted_hours = 4,
  notes = 'Tenant A manager-updated pending coach profile'
WHERE id = '00000000-0000-0000-0000-000000965504';

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM public.coach_profiles
    WHERE id = '00000000-0000-0000-0000-000000965504'
      AND organization_id = '00000000-0000-0000-0000-000000965001'
      AND person_profile_id = '00000000-0000-0000-0000-000000965402'
      AND weekly_contracted_hours = 4
      AND notes = 'Tenant A manager-updated pending coach profile'
  ),
  'tenant A manager can manage coach profiles because current DB policies allow it'
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 0
    FROM public.coach_profiles
    WHERE id = '00000000-0000-0000-0000-000000965502'
  ),
  'tenant A manager cannot read tenant B coach profile'
);

SELECT pg_temp.expect_no_updated_rows(
  'tenant A manager cannot update tenant B coach profile',
  $statement$
    UPDATE public.coach_profiles
    SET notes = 'Forbidden cross-tenant coach profile update'
    WHERE id = '00000000-0000-0000-0000-000000965502'
  $statement$
);

SELECT pg_temp.expect_rejected(
  'tenant A manager cannot insert coach profile directly into tenant B',
  $statement$
    INSERT INTO public.coach_profiles (
      id,
      organization_id,
      user_id,
      primary_center_id,
      weekly_contracted_hours,
      status
    )
    VALUES (
      '00000000-0000-0000-0000-000000965505',
      '00000000-0000-0000-0000-000000965002',
      '00000000-0000-0000-0000-000000965105',
      '00000000-0000-0000-0000-000000965302',
      1,
      'active'
    )
  $statement$
);

SELECT pg_temp.expect_rejected(
  'tenant A manager cannot move tenant A coach profile into tenant B',
  $statement$
    UPDATE public.coach_profiles
    SET
      organization_id = '00000000-0000-0000-0000-000000965002',
      user_id = '00000000-0000-0000-0000-000000965105',
      person_profile_id = NULL,
      primary_center_id = '00000000-0000-0000-0000-000000965302',
      notes = 'Forbidden moved coach profile'
    WHERE id = '00000000-0000-0000-0000-000000965504'
  $statement$
);

SELECT pg_temp.expect_rejected(
  'tenant A manager cannot create tenant A coach profile with tenant B primary center',
  $statement$
    INSERT INTO public.coach_profiles (
      id,
      organization_id,
      person_profile_id,
      primary_center_id,
      weekly_contracted_hours,
      status
    )
    VALUES (
      '00000000-0000-0000-0000-000000965506',
      '00000000-0000-0000-0000-000000965001',
      '00000000-0000-0000-0000-000000965404',
      '00000000-0000-0000-0000-000000965302',
      1,
      'active'
    )
  $statement$
);

SELECT pg_temp.expect_rejected(
  'tenant A manager cannot create tenant A coach profile with tenant B person profile',
  $statement$
    INSERT INTO public.coach_profiles (
      id,
      organization_id,
      person_profile_id,
      primary_center_id,
      weekly_contracted_hours,
      status
    )
    VALUES (
      '00000000-0000-0000-0000-000000965507',
      '00000000-0000-0000-0000-000000965001',
      '00000000-0000-0000-0000-000000965403',
      '00000000-0000-0000-0000-000000965301',
      1,
      'active'
    )
  $statement$
);

SELECT pg_temp.expect_rejected(
  'tenant A manager cannot create tenant A coach profile with tenant B user membership',
  $statement$
    INSERT INTO public.coach_profiles (
      id,
      organization_id,
      user_id,
      primary_center_id,
      weekly_contracted_hours,
      status
    )
    VALUES (
      '00000000-0000-0000-0000-000000965508',
      '00000000-0000-0000-0000-000000965001',
      '00000000-0000-0000-0000-000000965106',
      '00000000-0000-0000-0000-000000965301',
      1,
      'active'
    )
  $statement$
);

SELECT pg_temp.expect_rejected(
  'tenant A manager cannot update tenant A coach profile to tenant B primary center',
  $statement$
    UPDATE public.coach_profiles
    SET primary_center_id = '00000000-0000-0000-0000-000000965302'
    WHERE id = '00000000-0000-0000-0000-000000965504'
  $statement$
);

SELECT pg_temp.expect_rejected(
  'tenant A manager cannot update tenant A coach profile to tenant B person profile',
  $statement$
    UPDATE public.coach_profiles
    SET person_profile_id = '00000000-0000-0000-0000-000000965403'
    WHERE id = '00000000-0000-0000-0000-000000965504'
  $statement$
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000965104');

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 3
    FROM public.coach_profiles
    WHERE organization_id = '00000000-0000-0000-0000-000000965001'
  ),
  'tenant A coach can read tenant A coach profiles'
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 0
    FROM public.coach_profiles
    WHERE id = '00000000-0000-0000-0000-000000965502'
  ),
  'tenant A coach cannot read tenant B coach profile'
);

SELECT pg_temp.expect_no_updated_rows(
  'tenant A coach cannot update tenant A coach profile',
  $statement$
    UPDATE public.coach_profiles
    SET notes = 'Forbidden coach update'
    WHERE id = '00000000-0000-0000-0000-000000965501'
  $statement$
);

SELECT pg_temp.expect_rejected(
  'tenant A coach cannot create tenant A coach profile',
  $statement$
    INSERT INTO public.coach_profiles (
      id,
      organization_id,
      person_profile_id,
      primary_center_id,
      weekly_contracted_hours,
      status
    )
    VALUES (
      '00000000-0000-0000-0000-000000965509',
      '00000000-0000-0000-0000-000000965001',
      '00000000-0000-0000-0000-000000965405',
      '00000000-0000-0000-0000-000000965301',
      1,
      'active'
    )
  $statement$
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000965105');

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 0
    FROM public.coach_profiles
    WHERE id = '00000000-0000-0000-0000-000000965501'
  ),
  'tenant B manager cannot read tenant A coach profile'
);

SELECT pg_temp.expect_no_updated_rows(
  'tenant B manager cannot update tenant A coach profile',
  $statement$
    UPDATE public.coach_profiles
    SET notes = 'Forbidden tenant B manager coach profile update'
    WHERE id = '00000000-0000-0000-0000-000000965501'
  $statement$
);

RESET ROLE;

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM public.coach_profiles
    WHERE id = '00000000-0000-0000-0000-000000965501'
      AND organization_id = '00000000-0000-0000-0000-000000965001'
      AND user_id = '00000000-0000-0000-0000-000000965104'
      AND primary_center_id = '00000000-0000-0000-0000-000000965301'
      AND notes = 'Tenant A owner-updated coach profile'
  ),
  'tenant A user-linked coach profile keeps tenant A references before rollback'
);

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM public.coach_profiles
    WHERE id = '00000000-0000-0000-0000-000000965504'
      AND organization_id = '00000000-0000-0000-0000-000000965001'
      AND person_profile_id = '00000000-0000-0000-0000-000000965402'
      AND primary_center_id = '00000000-0000-0000-0000-000000965301'
      AND notes = 'Tenant A manager-updated pending coach profile'
  ),
  'tenant A pending coach profile keeps tenant A references before rollback'
);

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM public.coach_profiles
    WHERE id = '00000000-0000-0000-0000-000000965502'
      AND organization_id = '00000000-0000-0000-0000-000000965002'
      AND user_id = '00000000-0000-0000-0000-000000965106'
      AND primary_center_id = '00000000-0000-0000-0000-000000965302'
      AND notes = 'Tenant B baseline coach profile'
  ),
  'tenant B coach profile remains unchanged before rollback'
);

SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1
    FROM public.coach_profiles
    WHERE id IN (
      '00000000-0000-0000-0000-000000965505',
      '00000000-0000-0000-0000-000000965506',
      '00000000-0000-0000-0000-000000965507',
      '00000000-0000-0000-0000-000000965508',
      '00000000-0000-0000-0000-000000965509'
    )
  ),
  'forbidden coach profile inserts were not persisted before rollback'
);

ROLLBACK;
