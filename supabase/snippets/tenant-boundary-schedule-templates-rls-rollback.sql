-- BoxOps - S.63 tenant boundary schedule_templates RLS rollback verification
--
-- Run locally with:
--   Get-Content -Raw supabase/snippets/tenant-boundary-schedule-templates-rls-rollback.sql | docker exec -i supabase_db_boxops psql -U postgres -d postgres -v ON_ERROR_STOP=1
--
-- The script runs inside a transaction and rolls back all fixture data. It
-- validates a minimal tenant/RLS case from the negative-test matrix: a high
-- operational role in tenant A cannot create or update tenant A schedule
-- templates with tenant B centers, cannot mutate tenant B templates, and
-- cannot move an existing schedule template across organizations.
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
    RAISE EXCEPTION 'tenant boundary schedule_templates RLS verification failed: %', label;
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
    '00000000-0000-0000-0000-000000963101',
    'authenticated',
    'authenticated',
    'tenant-boundary-template-header-manager-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Tenant Boundary Template Header Manager A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000963102',
    'authenticated',
    'authenticated',
    'tenant-boundary-template-header-manager-b@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Tenant Boundary Template Header Manager B"}'::jsonb
  );

INSERT INTO public.organizations (id, name, slug, status, timezone)
VALUES
  (
    '00000000-0000-0000-0000-000000963001',
    'Tenant Boundary Template Header A',
    'tenant-boundary-template-header-a',
    'active',
    'Europe/Madrid'
  ),
  (
    '00000000-0000-0000-0000-000000963002',
    'Tenant Boundary Template Header B',
    'tenant-boundary-template-header-b',
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
    '00000000-0000-0000-0000-000000963201',
    '00000000-0000-0000-0000-000000963001',
    '00000000-0000-0000-0000-000000963101',
    'manager',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000963202',
    '00000000-0000-0000-0000-000000963002',
    '00000000-0000-0000-0000-000000963102',
    'manager',
    'active',
    now()
  );

INSERT INTO public.centers (id, organization_id, name, slug, timezone, status)
VALUES
  (
    '00000000-0000-0000-0000-000000963301',
    '00000000-0000-0000-0000-000000963001',
    'Tenant Boundary Template Header Center A',
    'tenant-boundary-template-header-center-a',
    'Europe/Madrid',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000963302',
    '00000000-0000-0000-0000-000000963002',
    'Tenant Boundary Template Header Center B',
    'tenant-boundary-template-header-center-b',
    'Europe/Madrid',
    'active'
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
VALUES (
  '00000000-0000-0000-0000-000000963402',
  '00000000-0000-0000-0000-000000963002',
  '00000000-0000-0000-0000-000000963302',
  'Tenant B baseline schedule template',
  'weekly',
  DATE '2026-05-18',
  DATE '2026-05-24',
  'active'
);

SET LOCAL ROLE authenticated;

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000963101');

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
VALUES (
  '00000000-0000-0000-0000-000000963401',
  '00000000-0000-0000-0000-000000963001',
  '00000000-0000-0000-0000-000000963301',
  'Tenant A allowed schedule template',
  'weekly',
  DATE '2026-05-18',
  DATE '2026-05-24',
  'draft'
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 1
    FROM public.schedule_templates
    WHERE id = '00000000-0000-0000-0000-000000963401'
      AND organization_id = '00000000-0000-0000-0000-000000963001'
  ),
  'tenant A manager can create a valid tenant A schedule template'
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 0
    FROM public.schedule_templates
    WHERE id = '00000000-0000-0000-0000-000000963402'
  ),
  'tenant A manager cannot read tenant B schedule template'
);

UPDATE public.schedule_templates
SET
  name = 'Tenant A allowed schedule template updated',
  status = 'active'
WHERE id = '00000000-0000-0000-0000-000000963401';

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM public.schedule_templates
    WHERE id = '00000000-0000-0000-0000-000000963401'
      AND organization_id = '00000000-0000-0000-0000-000000963001'
      AND name = 'Tenant A allowed schedule template updated'
      AND status = 'active'
  ),
  'tenant A manager can update allowed tenant A schedule template fields'
);

UPDATE public.schedule_templates
SET center_id = NULL
WHERE id = '00000000-0000-0000-0000-000000963401';

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM public.schedule_templates
    WHERE id = '00000000-0000-0000-0000-000000963401'
      AND organization_id = '00000000-0000-0000-0000-000000963001'
      AND center_id IS NULL
  ),
  'tenant A manager can keep schedule template center optional'
);

UPDATE public.schedule_templates
SET center_id = '00000000-0000-0000-0000-000000963301'
WHERE id = '00000000-0000-0000-0000-000000963401';

SELECT pg_temp.expect_rejected(
  'tenant A manager cannot create tenant A schedule template with tenant B center',
  $statement$
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
    VALUES (
      '00000000-0000-0000-0000-000000963403',
      '00000000-0000-0000-0000-000000963001',
      '00000000-0000-0000-0000-000000963302',
      'Forbidden tenant B center schedule template',
      'weekly',
      DATE '2026-05-18',
      DATE '2026-05-24',
      'draft'
    )
  $statement$
);

SELECT pg_temp.expect_no_updated_rows(
  'tenant A manager cannot update tenant B schedule template',
  $statement$
    UPDATE public.schedule_templates
    SET name = 'Forbidden cross-tenant schedule template update'
    WHERE id = '00000000-0000-0000-0000-000000963402'
  $statement$
);

SELECT pg_temp.expect_rejected(
  'tenant A manager cannot update tenant A schedule template to tenant B center',
  $statement$
    UPDATE public.schedule_templates
    SET center_id = '00000000-0000-0000-0000-000000963302'
    WHERE id = '00000000-0000-0000-0000-000000963401'
  $statement$
);

SELECT pg_temp.expect_rejected(
  'tenant A manager cannot move tenant A schedule template into tenant B',
  $statement$
    UPDATE public.schedule_templates
    SET organization_id = '00000000-0000-0000-0000-000000963002'
    WHERE id = '00000000-0000-0000-0000-000000963401'
  $statement$
);

SELECT pg_temp.expect_rejected(
  'tenant A manager cannot insert schedule template directly into tenant B',
  $statement$
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
    VALUES (
      '00000000-0000-0000-0000-000000963404',
      '00000000-0000-0000-0000-000000963002',
      '00000000-0000-0000-0000-000000963302',
      'Forbidden direct tenant B schedule template',
      'weekly',
      DATE '2026-05-18',
      DATE '2026-05-24',
      'draft'
    )
  $statement$
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000963102');

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 0
    FROM public.schedule_templates
    WHERE id = '00000000-0000-0000-0000-000000963401'
  ),
  'tenant B manager cannot read tenant A schedule template'
);

SELECT pg_temp.expect_no_updated_rows(
  'tenant B manager cannot update tenant A schedule template',
  $statement$
    UPDATE public.schedule_templates
    SET name = 'Forbidden tenant B manager update'
    WHERE id = '00000000-0000-0000-0000-000000963401'
  $statement$
);

RESET ROLE;

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM public.schedule_templates
    WHERE id = '00000000-0000-0000-0000-000000963401'
      AND organization_id = '00000000-0000-0000-0000-000000963001'
      AND center_id = '00000000-0000-0000-0000-000000963301'
      AND name = 'Tenant A allowed schedule template updated'
      AND status = 'active'
  ),
  'tenant A schedule template keeps tenant A references before rollback'
);

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM public.schedule_templates
    WHERE id = '00000000-0000-0000-0000-000000963402'
      AND organization_id = '00000000-0000-0000-0000-000000963002'
      AND center_id = '00000000-0000-0000-0000-000000963302'
      AND name = 'Tenant B baseline schedule template'
  ),
  'tenant B schedule template remains unchanged before rollback'
);

SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1
    FROM public.schedule_templates
    WHERE id IN (
      '00000000-0000-0000-0000-000000963403',
      '00000000-0000-0000-0000-000000963404'
    )
  ),
  'forbidden schedule template inserts were not persisted before rollback'
);

ROLLBACK;
