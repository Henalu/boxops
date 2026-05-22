-- BoxOps - S.62 tenant boundary schedule_template_blocks RLS rollback verification
--
-- Run locally with:
--   Get-Content -Raw supabase/snippets/tenant-boundary-schedule-template-blocks-rls-rollback.sql | docker exec -i supabase_db_boxops psql -U postgres -d postgres -v ON_ERROR_STOP=1
--
-- The script runs inside a transaction and rolls back all fixture data. It
-- validates a minimal tenant/RLS case from the negative-test matrix: a high
-- operational role in tenant A cannot create or update tenant A schedule
-- template blocks with tenant B templates, centers, class types or default
-- coach profiles; cannot mutate tenant B template blocks; and cannot move an
-- existing template block across organizations.
--
-- This intentionally does not apply a template to a real week. That path uses
-- product runtime/helpers and remains outside this local SQL rollback cut.

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
    RAISE EXCEPTION 'tenant boundary schedule_template_blocks RLS verification failed: %', label;
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
    '00000000-0000-0000-0000-000000962101',
    'authenticated',
    'authenticated',
    'tenant-boundary-template-manager-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Tenant Boundary Template Manager A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000962102',
    'authenticated',
    'authenticated',
    'tenant-boundary-template-coach-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Tenant Boundary Template Coach A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000962103',
    'authenticated',
    'authenticated',
    'tenant-boundary-template-manager-b@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Tenant Boundary Template Manager B"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000962104',
    'authenticated',
    'authenticated',
    'tenant-boundary-template-coach-b@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Tenant Boundary Template Coach B"}'::jsonb
  );

INSERT INTO public.organizations (id, name, slug, status, timezone)
VALUES
  (
    '00000000-0000-0000-0000-000000962001',
    'Tenant Boundary Template A',
    'tenant-boundary-template-a',
    'active',
    'Europe/Madrid'
  ),
  (
    '00000000-0000-0000-0000-000000962002',
    'Tenant Boundary Template B',
    'tenant-boundary-template-b',
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
    '00000000-0000-0000-0000-000000962201',
    '00000000-0000-0000-0000-000000962001',
    '00000000-0000-0000-0000-000000962101',
    'manager',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000962202',
    '00000000-0000-0000-0000-000000962001',
    '00000000-0000-0000-0000-000000962102',
    'coach',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000962203',
    '00000000-0000-0000-0000-000000962002',
    '00000000-0000-0000-0000-000000962103',
    'manager',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000962204',
    '00000000-0000-0000-0000-000000962002',
    '00000000-0000-0000-0000-000000962104',
    'coach',
    'active',
    now()
  );

INSERT INTO public.centers (id, organization_id, name, slug, timezone, status)
VALUES
  (
    '00000000-0000-0000-0000-000000962301',
    '00000000-0000-0000-0000-000000962001',
    'Tenant Boundary Template Center A',
    'tenant-boundary-template-center-a',
    'Europe/Madrid',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000962302',
    '00000000-0000-0000-0000-000000962002',
    'Tenant Boundary Template Center B',
    'tenant-boundary-template-center-b',
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
    '00000000-0000-0000-0000-000000962401',
    '00000000-0000-0000-0000-000000962001',
    'Tenant Boundary Template Type A',
    'tenant-boundary-template-type-a',
    'class',
    1,
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000962402',
    '00000000-0000-0000-0000-000000962002',
    'Tenant Boundary Template Type B',
    'tenant-boundary-template-type-b',
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
    '00000000-0000-0000-0000-000000962501',
    '00000000-0000-0000-0000-000000962001',
    '00000000-0000-0000-0000-000000962102',
    '00000000-0000-0000-0000-000000962301',
    0,
    'active',
    'Tenant A default coach'
  ),
  (
    '00000000-0000-0000-0000-000000962502',
    '00000000-0000-0000-0000-000000962002',
    '00000000-0000-0000-0000-000000962104',
    '00000000-0000-0000-0000-000000962302',
    0,
    'active',
    'Tenant B default coach'
  );

INSERT INTO public.schedule_templates (
  id,
  organization_id,
  center_id,
  name,
  template_type,
  valid_from,
  valid_until,
  status
)
VALUES
  (
    '00000000-0000-0000-0000-000000962601',
    '00000000-0000-0000-0000-000000962001',
    '00000000-0000-0000-0000-000000962301',
    'Tenant Boundary Template A',
    'weekly',
    DATE '2026-05-18',
    DATE '2026-05-24',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000962602',
    '00000000-0000-0000-0000-000000962002',
    '00000000-0000-0000-0000-000000962302',
    'Tenant Boundary Template B',
    'weekly',
    DATE '2026-05-18',
    DATE '2026-05-24',
    'active'
  );

INSERT INTO public.schedule_template_blocks (
  id,
  organization_id,
  template_id,
  day_of_week,
  start_time,
  end_time,
  center_id,
  class_type_id,
  required_coaches,
  default_coach_profile_id,
  notes
)
VALUES (
  '00000000-0000-0000-0000-000000962702',
  '00000000-0000-0000-0000-000000962002',
  '00000000-0000-0000-0000-000000962602',
  1,
  TIME '10:00',
  TIME '11:00',
  '00000000-0000-0000-0000-000000962302',
  '00000000-0000-0000-0000-000000962402',
  1,
  '00000000-0000-0000-0000-000000962502',
  'Tenant B baseline template block'
);

SET LOCAL ROLE authenticated;

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000962101');

INSERT INTO public.schedule_template_blocks (
  id,
  organization_id,
  template_id,
  day_of_week,
  start_time,
  end_time,
  center_id,
  class_type_id,
  required_coaches,
  default_coach_profile_id,
  notes
)
VALUES (
  '00000000-0000-0000-0000-000000962701',
  '00000000-0000-0000-0000-000000962001',
  '00000000-0000-0000-0000-000000962601',
  1,
  TIME '09:00',
  TIME '10:00',
  '00000000-0000-0000-0000-000000962301',
  '00000000-0000-0000-0000-000000962401',
  1,
  '00000000-0000-0000-0000-000000962501',
  'Tenant A allowed template block'
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 1
    FROM public.schedule_template_blocks
    WHERE id = '00000000-0000-0000-0000-000000962701'
      AND organization_id = '00000000-0000-0000-0000-000000962001'
  ),
  'tenant A manager can create a valid tenant A template block'
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 0
    FROM public.schedule_template_blocks
    WHERE id = '00000000-0000-0000-0000-000000962702'
  ),
  'tenant A manager cannot read tenant B template block'
);

UPDATE public.schedule_template_blocks
SET notes = 'Tenant A allowed template block updated'
WHERE id = '00000000-0000-0000-0000-000000962701';

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM public.schedule_template_blocks
    WHERE id = '00000000-0000-0000-0000-000000962701'
      AND organization_id = '00000000-0000-0000-0000-000000962001'
      AND notes = 'Tenant A allowed template block updated'
  ),
  'tenant A manager can update allowed tenant A template block fields'
);

SELECT pg_temp.expect_rejected(
  'tenant A manager cannot create tenant A template block with tenant B template',
  $statement$
    INSERT INTO public.schedule_template_blocks (
      id,
      organization_id,
      template_id,
      day_of_week,
      start_time,
      end_time,
      center_id,
      class_type_id,
      required_coaches,
      default_coach_profile_id
    )
    VALUES (
      '00000000-0000-0000-0000-000000962703',
      '00000000-0000-0000-0000-000000962001',
      '00000000-0000-0000-0000-000000962602',
      2,
      TIME '09:00',
      TIME '10:00',
      '00000000-0000-0000-0000-000000962301',
      '00000000-0000-0000-0000-000000962401',
      1,
      '00000000-0000-0000-0000-000000962501'
    )
  $statement$
);

SELECT pg_temp.expect_rejected(
  'tenant A manager cannot create tenant A template block with tenant B center',
  $statement$
    INSERT INTO public.schedule_template_blocks (
      id,
      organization_id,
      template_id,
      day_of_week,
      start_time,
      end_time,
      center_id,
      class_type_id,
      required_coaches,
      default_coach_profile_id
    )
    VALUES (
      '00000000-0000-0000-0000-000000962704',
      '00000000-0000-0000-0000-000000962001',
      '00000000-0000-0000-0000-000000962601',
      2,
      TIME '10:00',
      TIME '11:00',
      '00000000-0000-0000-0000-000000962302',
      '00000000-0000-0000-0000-000000962401',
      1,
      '00000000-0000-0000-0000-000000962501'
    )
  $statement$
);

SELECT pg_temp.expect_rejected(
  'tenant A manager cannot create tenant A template block with tenant B class type',
  $statement$
    INSERT INTO public.schedule_template_blocks (
      id,
      organization_id,
      template_id,
      day_of_week,
      start_time,
      end_time,
      center_id,
      class_type_id,
      required_coaches,
      default_coach_profile_id
    )
    VALUES (
      '00000000-0000-0000-0000-000000962705',
      '00000000-0000-0000-0000-000000962001',
      '00000000-0000-0000-0000-000000962601',
      2,
      TIME '11:00',
      TIME '12:00',
      '00000000-0000-0000-0000-000000962301',
      '00000000-0000-0000-0000-000000962402',
      1,
      '00000000-0000-0000-0000-000000962501'
    )
  $statement$
);

SELECT pg_temp.expect_rejected(
  'tenant A manager cannot create tenant A template block with tenant B default coach',
  $statement$
    INSERT INTO public.schedule_template_blocks (
      id,
      organization_id,
      template_id,
      day_of_week,
      start_time,
      end_time,
      center_id,
      class_type_id,
      required_coaches,
      default_coach_profile_id
    )
    VALUES (
      '00000000-0000-0000-0000-000000962706',
      '00000000-0000-0000-0000-000000962001',
      '00000000-0000-0000-0000-000000962601',
      2,
      TIME '12:00',
      TIME '13:00',
      '00000000-0000-0000-0000-000000962301',
      '00000000-0000-0000-0000-000000962401',
      1,
      '00000000-0000-0000-0000-000000962502'
    )
  $statement$
);

SELECT pg_temp.expect_no_updated_rows(
  'tenant A manager cannot update tenant B template block',
  $statement$
    UPDATE public.schedule_template_blocks
    SET notes = 'Forbidden cross-tenant template block update'
    WHERE id = '00000000-0000-0000-0000-000000962702'
  $statement$
);

SELECT pg_temp.expect_rejected(
  'tenant A manager cannot update tenant A template block to tenant B template',
  $statement$
    UPDATE public.schedule_template_blocks
    SET template_id = '00000000-0000-0000-0000-000000962602'
    WHERE id = '00000000-0000-0000-0000-000000962701'
  $statement$
);

SELECT pg_temp.expect_rejected(
  'tenant A manager cannot update tenant A template block to tenant B center',
  $statement$
    UPDATE public.schedule_template_blocks
    SET center_id = '00000000-0000-0000-0000-000000962302'
    WHERE id = '00000000-0000-0000-0000-000000962701'
  $statement$
);

SELECT pg_temp.expect_rejected(
  'tenant A manager cannot update tenant A template block to tenant B class type',
  $statement$
    UPDATE public.schedule_template_blocks
    SET class_type_id = '00000000-0000-0000-0000-000000962402'
    WHERE id = '00000000-0000-0000-0000-000000962701'
  $statement$
);

SELECT pg_temp.expect_rejected(
  'tenant A manager cannot update tenant A template block to tenant B default coach',
  $statement$
    UPDATE public.schedule_template_blocks
    SET default_coach_profile_id = '00000000-0000-0000-0000-000000962502'
    WHERE id = '00000000-0000-0000-0000-000000962701'
  $statement$
);

SELECT pg_temp.expect_rejected(
  'tenant A manager cannot move tenant A template block into tenant B',
  $statement$
    UPDATE public.schedule_template_blocks
    SET organization_id = '00000000-0000-0000-0000-000000962002'
    WHERE id = '00000000-0000-0000-0000-000000962701'
  $statement$
);

SELECT pg_temp.expect_rejected(
  'tenant A manager cannot insert template block directly into tenant B',
  $statement$
    INSERT INTO public.schedule_template_blocks (
      id,
      organization_id,
      template_id,
      day_of_week,
      start_time,
      end_time,
      center_id,
      class_type_id,
      required_coaches,
      default_coach_profile_id
    )
    VALUES (
      '00000000-0000-0000-0000-000000962707',
      '00000000-0000-0000-0000-000000962002',
      '00000000-0000-0000-0000-000000962602',
      2,
      TIME '13:00',
      TIME '14:00',
      '00000000-0000-0000-0000-000000962302',
      '00000000-0000-0000-0000-000000962402',
      1,
      '00000000-0000-0000-0000-000000962502'
    )
  $statement$
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000962103');

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 0
    FROM public.schedule_template_blocks
    WHERE id = '00000000-0000-0000-0000-000000962701'
  ),
  'tenant B manager cannot read tenant A template block'
);

SELECT pg_temp.expect_no_updated_rows(
  'tenant B manager cannot update tenant A template block',
  $statement$
    UPDATE public.schedule_template_blocks
    SET notes = 'Forbidden tenant B manager update'
    WHERE id = '00000000-0000-0000-0000-000000962701'
  $statement$
);

RESET ROLE;

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM public.schedule_template_blocks
    WHERE id = '00000000-0000-0000-0000-000000962701'
      AND organization_id = '00000000-0000-0000-0000-000000962001'
      AND template_id = '00000000-0000-0000-0000-000000962601'
      AND center_id = '00000000-0000-0000-0000-000000962301'
      AND class_type_id = '00000000-0000-0000-0000-000000962401'
      AND default_coach_profile_id = '00000000-0000-0000-0000-000000962501'
      AND notes = 'Tenant A allowed template block updated'
  ),
  'tenant A template block keeps tenant A references before rollback'
);

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM public.schedule_template_blocks
    WHERE id = '00000000-0000-0000-0000-000000962702'
      AND organization_id = '00000000-0000-0000-0000-000000962002'
      AND template_id = '00000000-0000-0000-0000-000000962602'
      AND center_id = '00000000-0000-0000-0000-000000962302'
      AND class_type_id = '00000000-0000-0000-0000-000000962402'
      AND default_coach_profile_id = '00000000-0000-0000-0000-000000962502'
      AND notes = 'Tenant B baseline template block'
  ),
  'tenant B template block remains unchanged before rollback'
);

SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1
    FROM public.schedule_template_blocks
    WHERE id IN (
      '00000000-0000-0000-0000-000000962703',
      '00000000-0000-0000-0000-000000962704',
      '00000000-0000-0000-0000-000000962705',
      '00000000-0000-0000-0000-000000962706',
      '00000000-0000-0000-0000-000000962707'
    )
  ),
  'forbidden template block inserts were not persisted before rollback'
);

ROLLBACK;
