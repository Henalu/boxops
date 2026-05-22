-- BoxOps - S.68 tenant boundary staff_work_windows RLS rollback verification
--
-- Run locally with:
--   Get-Content -Raw supabase/snippets/tenant-boundary-staff-work-windows-rls-rollback.sql | docker exec -i supabase_db_boxops psql -U postgres -d postgres -v ON_ERROR_STOP=1
--
-- The script runs inside a transaction and rolls back all fixture data. It
-- validates a minimal tenant/RLS case from the negative-test matrix:
-- owner/admin/manager in tenant A can create, update and deactivate valid
-- tenant A staff work windows under the current DB policies; active members
-- without management can read active windows in their tenant but cannot manage
-- them; inactive windows stay visible only to operators; tenant A/B cannot read
-- or mutate each other's staff work windows; tenant A cannot insert directly
-- into tenant B, move a window across organizations, or use tenant B
-- person_profile_id / center_id references.
--
-- This intentionally does not validate /app/schedule Server Actions, browser
-- runtime, product-only active/visible person filters, active-center product
-- rules, operational audit writes, real credentials, staging, Storage, SMTP or
-- data from a real tenant.

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
    RAISE EXCEPTION 'tenant boundary staff_work_windows RLS verification failed: %', label;
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
    '00000000-0000-0000-0000-000000968101',
    'authenticated',
    'authenticated',
    'tenant-boundary-staff-work-windows-owner-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Tenant Boundary Staff Work Windows Owner A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000968102',
    'authenticated',
    'authenticated',
    'tenant-boundary-staff-work-windows-admin-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Tenant Boundary Staff Work Windows Admin A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000968103',
    'authenticated',
    'authenticated',
    'tenant-boundary-staff-work-windows-manager-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Tenant Boundary Staff Work Windows Manager A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000968104',
    'authenticated',
    'authenticated',
    'tenant-boundary-staff-work-windows-coach-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Tenant Boundary Staff Work Windows Coach A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000968105',
    'authenticated',
    'authenticated',
    'tenant-boundary-staff-work-windows-staff-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Tenant Boundary Staff Work Windows Staff A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000968106',
    'authenticated',
    'authenticated',
    'tenant-boundary-staff-work-windows-manager-b@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Tenant Boundary Staff Work Windows Manager B"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000968107',
    'authenticated',
    'authenticated',
    'tenant-boundary-staff-work-windows-coach-b@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Tenant Boundary Staff Work Windows Coach B"}'::jsonb
  );

INSERT INTO public.organizations (id, name, slug, status, timezone)
VALUES
  (
    '00000000-0000-0000-0000-000000968001',
    'Tenant Boundary Staff Work Windows A',
    'tenant-boundary-staff-work-windows-a',
    'active',
    'Europe/Madrid'
  ),
  (
    '00000000-0000-0000-0000-000000968002',
    'Tenant Boundary Staff Work Windows B',
    'tenant-boundary-staff-work-windows-b',
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
    '00000000-0000-0000-0000-000000968201',
    '00000000-0000-0000-0000-000000968001',
    '00000000-0000-0000-0000-000000968101',
    'owner',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000968202',
    '00000000-0000-0000-0000-000000968001',
    '00000000-0000-0000-0000-000000968102',
    'admin',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000968203',
    '00000000-0000-0000-0000-000000968001',
    '00000000-0000-0000-0000-000000968103',
    'manager',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000968204',
    '00000000-0000-0000-0000-000000968001',
    '00000000-0000-0000-0000-000000968104',
    'coach',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000968205',
    '00000000-0000-0000-0000-000000968001',
    '00000000-0000-0000-0000-000000968105',
    'staff',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000968206',
    '00000000-0000-0000-0000-000000968002',
    '00000000-0000-0000-0000-000000968106',
    'manager',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000968207',
    '00000000-0000-0000-0000-000000968002',
    '00000000-0000-0000-0000-000000968107',
    'coach',
    'active',
    now()
  );

INSERT INTO public.centers (id, organization_id, name, slug, timezone, status)
VALUES
  (
    '00000000-0000-0000-0000-000000968301',
    '00000000-0000-0000-0000-000000968001',
    'Tenant Boundary Staff Work Windows Center A',
    'tenant-boundary-staff-work-windows-center-a',
    'Europe/Madrid',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000968302',
    '00000000-0000-0000-0000-000000968002',
    'Tenant Boundary Staff Work Windows Center B',
    'tenant-boundary-staff-work-windows-center-b',
    'Europe/Madrid',
    'active'
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
    '00000000-0000-0000-0000-000000968401',
    '00000000-0000-0000-0000-000000968001',
    NULL,
    'Tenant A staff work window person one',
    'visible',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000968402',
    '00000000-0000-0000-0000-000000968001',
    '00000000-0000-0000-0000-000000968104',
    'Tenant A staff work window coach person',
    'visible',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000968403',
    '00000000-0000-0000-0000-000000968001',
    '00000000-0000-0000-0000-000000968105',
    'Tenant A staff work window staff person',
    'visible',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000968404',
    '00000000-0000-0000-0000-000000968002',
    '00000000-0000-0000-0000-000000968107',
    'Tenant B staff work window coach person',
    'visible',
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
  status,
  notes
)
VALUES (
  '00000000-0000-0000-0000-000000968504',
  '00000000-0000-0000-0000-000000968002',
  '00000000-0000-0000-0000-000000968404',
  '00000000-0000-0000-0000-000000968302',
  2,
  '08:00',
  '12:00',
  DATE '2026-05-18',
  'active',
  'Tenant B baseline staff work window'
);

SET LOCAL ROLE authenticated;

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000968101');

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
  '00000000-0000-0000-0000-000000968501',
  '00000000-0000-0000-0000-000000968001',
  '00000000-0000-0000-0000-000000968401',
  '00000000-0000-0000-0000-000000968301',
  1,
  '07:00',
  '10:00',
  DATE '2026-05-18',
  NULL,
  'active',
  'Tenant A owner-created staff work window'
);

UPDATE public.staff_work_windows
SET
  notes = 'Tenant A owner-updated staff work window',
  status = 'inactive'
WHERE id = '00000000-0000-0000-0000-000000968501';

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM public.staff_work_windows
    WHERE id = '00000000-0000-0000-0000-000000968501'
      AND organization_id = '00000000-0000-0000-0000-000000968001'
      AND status = 'inactive'
      AND notes = 'Tenant A owner-updated staff work window'
  ),
  'tenant A owner can create update and deactivate a valid tenant A staff work window'
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 0
    FROM public.staff_work_windows
    WHERE id = '00000000-0000-0000-0000-000000968504'
  ),
  'tenant A owner cannot read tenant B staff work windows'
);

SELECT pg_temp.expect_no_updated_rows(
  'tenant A owner cannot update tenant B staff work window',
  $statement$
    UPDATE public.staff_work_windows
    SET notes = 'Forbidden tenant A owner cross-tenant update'
    WHERE id = '00000000-0000-0000-0000-000000968504'
  $statement$
);

SELECT pg_temp.expect_rejected(
  'tenant A owner cannot insert staff work window directly into tenant B',
  $statement$
    INSERT INTO public.staff_work_windows (
      id,
      organization_id,
      person_profile_id,
      center_id,
      day_of_week,
      start_time,
      end_time,
      valid_from,
      status
    )
    VALUES (
      '00000000-0000-0000-0000-000000968510',
      '00000000-0000-0000-0000-000000968002',
      '00000000-0000-0000-0000-000000968404',
      '00000000-0000-0000-0000-000000968302',
      3,
      '09:00',
      '11:00',
      DATE '2026-05-18',
      'active'
    )
  $statement$
);

SELECT pg_temp.expect_rejected(
  'tenant A owner cannot move tenant A staff work window into tenant B',
  $statement$
    UPDATE public.staff_work_windows
    SET
      organization_id = '00000000-0000-0000-0000-000000968002',
      person_profile_id = '00000000-0000-0000-0000-000000968404',
      center_id = '00000000-0000-0000-0000-000000968302'
    WHERE id = '00000000-0000-0000-0000-000000968501'
  $statement$
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000968102');

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
VALUES (
  '00000000-0000-0000-0000-000000968502',
  '00000000-0000-0000-0000-000000968001',
  '00000000-0000-0000-0000-000000968402',
  '00000000-0000-0000-0000-000000968301',
  2,
  '10:00',
  '13:00',
  DATE '2026-05-18',
  'active',
  'Tenant A admin-created staff work window'
);

UPDATE public.staff_work_windows
SET
  end_time = '14:00',
  status = 'inactive'
WHERE id = '00000000-0000-0000-0000-000000968502';

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM public.staff_work_windows
    WHERE id = '00000000-0000-0000-0000-000000968502'
      AND organization_id = '00000000-0000-0000-0000-000000968001'
      AND end_time = '14:00'
      AND status = 'inactive'
  ),
  'tenant A admin can create update and deactivate a valid tenant A staff work window'
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000968103');

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
VALUES (
  '00000000-0000-0000-0000-000000968503',
  '00000000-0000-0000-0000-000000968001',
  '00000000-0000-0000-0000-000000968403',
  '00000000-0000-0000-0000-000000968301',
  3,
  '16:00',
  '20:00',
  DATE '2026-05-18',
  'active',
  'Tenant A manager-created staff work window'
);

UPDATE public.staff_work_windows
SET
  notes = 'Tenant A manager-updated staff work window',
  status = 'inactive'
WHERE id = '00000000-0000-0000-0000-000000968503';

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
VALUES (
  '00000000-0000-0000-0000-000000968505',
  '00000000-0000-0000-0000-000000968001',
  '00000000-0000-0000-0000-000000968402',
  '00000000-0000-0000-0000-000000968301',
  4,
  '09:00',
  '12:00',
  DATE '2026-05-18',
  'active',
  'Tenant A active staff work window for member read'
);

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM public.staff_work_windows
    WHERE id = '00000000-0000-0000-0000-000000968503'
      AND organization_id = '00000000-0000-0000-0000-000000968001'
      AND status = 'inactive'
      AND notes = 'Tenant A manager-updated staff work window'
  ),
  'tenant A manager can create update and deactivate a valid tenant A staff work window'
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 4
    FROM public.staff_work_windows
    WHERE organization_id = '00000000-0000-0000-0000-000000968001'
  ),
  'tenant A manager can read active and inactive tenant A staff work windows'
);

SELECT pg_temp.expect_rejected(
  'tenant A manager cannot create tenant A staff work window with tenant B person profile',
  $statement$
    INSERT INTO public.staff_work_windows (
      id,
      organization_id,
      person_profile_id,
      center_id,
      day_of_week,
      start_time,
      end_time,
      valid_from,
      status
    )
    VALUES (
      '00000000-0000-0000-0000-000000968511',
      '00000000-0000-0000-0000-000000968001',
      '00000000-0000-0000-0000-000000968404',
      '00000000-0000-0000-0000-000000968301',
      5,
      '09:00',
      '11:00',
      DATE '2026-05-18',
      'active'
    )
  $statement$
);

SELECT pg_temp.expect_rejected(
  'tenant A manager cannot create tenant A staff work window with tenant B center',
  $statement$
    INSERT INTO public.staff_work_windows (
      id,
      organization_id,
      person_profile_id,
      center_id,
      day_of_week,
      start_time,
      end_time,
      valid_from,
      status
    )
    VALUES (
      '00000000-0000-0000-0000-000000968512',
      '00000000-0000-0000-0000-000000968001',
      '00000000-0000-0000-0000-000000968401',
      '00000000-0000-0000-0000-000000968302',
      5,
      '09:00',
      '11:00',
      DATE '2026-05-18',
      'active'
    )
  $statement$
);

SELECT pg_temp.expect_rejected(
  'tenant A manager cannot update tenant A staff work window to tenant B person profile',
  $statement$
    UPDATE public.staff_work_windows
    SET person_profile_id = '00000000-0000-0000-0000-000000968404'
    WHERE id = '00000000-0000-0000-0000-000000968505'
  $statement$
);

SELECT pg_temp.expect_rejected(
  'tenant A manager cannot update tenant A staff work window to tenant B center',
  $statement$
    UPDATE public.staff_work_windows
    SET center_id = '00000000-0000-0000-0000-000000968302'
    WHERE id = '00000000-0000-0000-0000-000000968505'
  $statement$
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000968104');

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM public.staff_work_windows
    WHERE id = '00000000-0000-0000-0000-000000968505'
      AND status = 'active'
  ),
  'tenant A coach can read active tenant A staff work windows as shared context'
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 0
    FROM public.staff_work_windows
    WHERE id IN (
      '00000000-0000-0000-0000-000000968501',
      '00000000-0000-0000-0000-000000968502',
      '00000000-0000-0000-0000-000000968503'
    )
  ),
  'tenant A coach cannot read inactive tenant A staff work windows'
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 0
    FROM public.staff_work_windows
    WHERE id = '00000000-0000-0000-0000-000000968504'
  ),
  'tenant A coach cannot read tenant B staff work windows'
);

SELECT pg_temp.expect_rejected(
  'tenant A coach cannot create tenant A staff work window',
  $statement$
    INSERT INTO public.staff_work_windows (
      id,
      organization_id,
      person_profile_id,
      center_id,
      day_of_week,
      start_time,
      end_time,
      valid_from,
      status
    )
    VALUES (
      '00000000-0000-0000-0000-000000968513',
      '00000000-0000-0000-0000-000000968001',
      '00000000-0000-0000-0000-000000968402',
      '00000000-0000-0000-0000-000000968301',
      6,
      '09:00',
      '11:00',
      DATE '2026-05-18',
      'active'
    )
  $statement$
);

SELECT pg_temp.expect_no_updated_rows(
  'tenant A coach cannot update tenant A staff work window',
  $statement$
    UPDATE public.staff_work_windows
    SET notes = 'Forbidden coach staff work window update'
    WHERE id = '00000000-0000-0000-0000-000000968505'
  $statement$
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000968105');

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM public.staff_work_windows
    WHERE id = '00000000-0000-0000-0000-000000968505'
      AND status = 'active'
  ),
  'tenant A staff member can read active tenant A staff work windows as shared context'
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 0
    FROM public.staff_work_windows
    WHERE id = '00000000-0000-0000-0000-000000968504'
  ),
  'tenant A staff member cannot read tenant B staff work windows'
);

SELECT pg_temp.expect_rejected(
  'tenant A staff member cannot create tenant A staff work window',
  $statement$
    INSERT INTO public.staff_work_windows (
      id,
      organization_id,
      person_profile_id,
      center_id,
      day_of_week,
      start_time,
      end_time,
      valid_from,
      status
    )
    VALUES (
      '00000000-0000-0000-0000-000000968514',
      '00000000-0000-0000-0000-000000968001',
      '00000000-0000-0000-0000-000000968403',
      '00000000-0000-0000-0000-000000968301',
      6,
      '09:00',
      '11:00',
      DATE '2026-05-18',
      'active'
    )
  $statement$
);

SELECT pg_temp.expect_no_updated_rows(
  'tenant A staff member cannot update tenant A staff work window',
  $statement$
    UPDATE public.staff_work_windows
    SET notes = 'Forbidden staff member staff work window update'
    WHERE id = '00000000-0000-0000-0000-000000968505'
  $statement$
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000968106');

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM public.staff_work_windows
    WHERE id = '00000000-0000-0000-0000-000000968504'
      AND organization_id = '00000000-0000-0000-0000-000000968002'
  ),
  'tenant B manager can read tenant B staff work window'
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 0
    FROM public.staff_work_windows
    WHERE id = '00000000-0000-0000-0000-000000968505'
  ),
  'tenant B manager cannot read tenant A staff work windows'
);

SELECT pg_temp.expect_no_updated_rows(
  'tenant B manager cannot update tenant A staff work window',
  $statement$
    UPDATE public.staff_work_windows
    SET notes = 'Forbidden tenant B manager cross-tenant update'
    WHERE id = '00000000-0000-0000-0000-000000968505'
  $statement$
);

RESET ROLE;

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM public.staff_work_windows
    WHERE id = '00000000-0000-0000-0000-000000968501'
      AND organization_id = '00000000-0000-0000-0000-000000968001'
      AND person_profile_id = '00000000-0000-0000-0000-000000968401'
      AND center_id = '00000000-0000-0000-0000-000000968301'
      AND status = 'inactive'
  ),
  'tenant A owner-created staff work window remains in tenant A before rollback'
);

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM public.staff_work_windows
    WHERE id = '00000000-0000-0000-0000-000000968505'
      AND organization_id = '00000000-0000-0000-0000-000000968001'
      AND person_profile_id = '00000000-0000-0000-0000-000000968402'
      AND center_id = '00000000-0000-0000-0000-000000968301'
      AND status = 'active'
      AND notes = 'Tenant A active staff work window for member read'
  ),
  'tenant A active member-readable staff work window keeps tenant A references before rollback'
);

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM public.staff_work_windows
    WHERE id = '00000000-0000-0000-0000-000000968504'
      AND organization_id = '00000000-0000-0000-0000-000000968002'
      AND person_profile_id = '00000000-0000-0000-0000-000000968404'
      AND center_id = '00000000-0000-0000-0000-000000968302'
      AND notes = 'Tenant B baseline staff work window'
  ),
  'tenant B staff work window remains unchanged before rollback'
);

SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1
    FROM public.staff_work_windows
    WHERE id IN (
      '00000000-0000-0000-0000-000000968510',
      '00000000-0000-0000-0000-000000968511',
      '00000000-0000-0000-0000-000000968512',
      '00000000-0000-0000-0000-000000968513',
      '00000000-0000-0000-0000-000000968514'
    )
  ),
  'forbidden staff work window inserts were not persisted before rollback'
);

ROLLBACK;
