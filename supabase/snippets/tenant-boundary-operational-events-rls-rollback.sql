-- BoxOps - S.69 tenant boundary operational_events RLS/RPC rollback verification
--
-- Run locally with:
--   Get-Content -Raw supabase/snippets/tenant-boundary-operational-events-rls-rollback.sql | docker exec -i supabase_db_boxops psql -U postgres -d postgres -v ON_ERROR_STOP=1
--
-- The script runs inside a transaction and rolls back all fixture data. It
-- validates a minimal tenant/RLS/RPC case from the negative-test matrix:
-- owner/admin/manager in tenant A can create, update, cancel and archive valid
-- tenant A operational events through the current RPC path; coach can read only
-- active visible tenant A events; roles without event management cannot manage
-- events; tenant A/B cannot read or mutate each other's events; tenant A cannot
-- insert directly into tenant B, move an event across organizations, or use a
-- center_id from tenant B.
--
-- This intentionally does not validate /app/schedule Server Actions, browser
-- runtime, POST direct behavior, operational audit persistence details, real
-- credentials, staging, Storage, SMTP or data from a real tenant. Events remain
-- context only and do not mutate schedule blocks, assignments, time tracking,
-- documents, overtime/payroll or legal balances.

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
    RAISE EXCEPTION 'tenant boundary operational_events RLS/RPC verification failed: %', label;
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
    '00000000-0000-0000-0000-000000969101',
    'authenticated',
    'authenticated',
    'tenant-boundary-operational-events-owner-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Tenant Boundary Operational Events Owner A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000969102',
    'authenticated',
    'authenticated',
    'tenant-boundary-operational-events-admin-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Tenant Boundary Operational Events Admin A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000969103',
    'authenticated',
    'authenticated',
    'tenant-boundary-operational-events-manager-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Tenant Boundary Operational Events Manager A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000969104',
    'authenticated',
    'authenticated',
    'tenant-boundary-operational-events-coach-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Tenant Boundary Operational Events Coach A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000969105',
    'authenticated',
    'authenticated',
    'tenant-boundary-operational-events-staff-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Tenant Boundary Operational Events Staff A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000969106',
    'authenticated',
    'authenticated',
    'tenant-boundary-operational-events-manager-b@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Tenant Boundary Operational Events Manager B"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000969107',
    'authenticated',
    'authenticated',
    'tenant-boundary-operational-events-coach-b@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Tenant Boundary Operational Events Coach B"}'::jsonb
  );

INSERT INTO public.organizations (id, name, slug, status, timezone)
VALUES
  (
    '00000000-0000-0000-0000-000000969001',
    'Tenant Boundary Operational Events A',
    'tenant-boundary-operational-events-a',
    'active',
    'Europe/Madrid'
  ),
  (
    '00000000-0000-0000-0000-000000969002',
    'Tenant Boundary Operational Events B',
    'tenant-boundary-operational-events-b',
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
    '00000000-0000-0000-0000-000000969201',
    '00000000-0000-0000-0000-000000969001',
    '00000000-0000-0000-0000-000000969101',
    'owner',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000969202',
    '00000000-0000-0000-0000-000000969001',
    '00000000-0000-0000-0000-000000969102',
    'admin',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000969203',
    '00000000-0000-0000-0000-000000969001',
    '00000000-0000-0000-0000-000000969103',
    'manager',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000969204',
    '00000000-0000-0000-0000-000000969001',
    '00000000-0000-0000-0000-000000969104',
    'coach',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000969205',
    '00000000-0000-0000-0000-000000969001',
    '00000000-0000-0000-0000-000000969105',
    'staff',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000969206',
    '00000000-0000-0000-0000-000000969002',
    '00000000-0000-0000-0000-000000969106',
    'manager',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000969207',
    '00000000-0000-0000-0000-000000969002',
    '00000000-0000-0000-0000-000000969107',
    'coach',
    'active',
    now()
  );

INSERT INTO public.centers (id, organization_id, name, slug, timezone, status)
VALUES
  (
    '00000000-0000-0000-0000-000000969301',
    '00000000-0000-0000-0000-000000969001',
    'Tenant Boundary Operational Events Center A',
    'tenant-boundary-operational-events-center-a',
    'Europe/Madrid',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000969302',
    '00000000-0000-0000-0000-000000969002',
    'Tenant Boundary Operational Events Center B',
    'tenant-boundary-operational-events-center-b',
    'Europe/Madrid',
    'active'
  );

INSERT INTO public.operational_events (
  id,
  organization_id,
  center_id,
  title,
  event_type,
  starts_at,
  ends_at,
  all_day,
  timezone,
  status,
  visibility,
  impact_level,
  notes,
  retain_until
)
VALUES
  (
    '00000000-0000-0000-0000-000000969401',
    '00000000-0000-0000-0000-000000969001',
    '00000000-0000-0000-0000-000000969301',
    'Tenant A active staff event',
    'internal_event',
    now() + interval '7 days',
    now() + interval '7 days 2 hours',
    false,
    'Europe/Madrid',
    'active',
    'staff',
    'context_only',
    'Tenant A visible event fixture',
    public.operational_event_retain_until(now() + interval '7 days', now() + interval '7 days 2 hours', 'active')
  ),
  (
    '00000000-0000-0000-0000-000000969402',
    '00000000-0000-0000-0000-000000969001',
    NULL,
    'Tenant A active all staff event',
    'competition',
    now() + interval '8 days',
    now() + interval '8 days 3 hours',
    false,
    'Europe/Madrid',
    'active',
    'all_staff',
    'coverage_review_needed',
    'Tenant A all staff visible event fixture',
    public.operational_event_retain_until(now() + interval '8 days', now() + interval '8 days 3 hours', 'active')
  ),
  (
    '00000000-0000-0000-0000-000000969403',
    '00000000-0000-0000-0000-000000969001',
    '00000000-0000-0000-0000-000000969301',
    'Tenant A active management event',
    'seminar',
    now() + interval '9 days',
    now() + interval '9 days 2 hours',
    false,
    'Europe/Madrid',
    'active',
    'management',
    'schedule_review_needed',
    'Tenant A management event fixture',
    public.operational_event_retain_until(now() + interval '9 days', now() + interval '9 days 2 hours', 'active')
  ),
  (
    '00000000-0000-0000-0000-000000969404',
    '00000000-0000-0000-0000-000000969001',
    NULL,
    'Tenant A cancelled staff event',
    'maintenance',
    now() + interval '10 days',
    now() + interval '10 days 2 hours',
    false,
    'Europe/Madrid',
    'cancelled',
    'staff',
    'context_only',
    'Tenant A cancelled event fixture',
    public.operational_event_retain_until(now() + interval '10 days', now() + interval '10 days 2 hours', 'cancelled', now())
  ),
  (
    '00000000-0000-0000-0000-000000969405',
    '00000000-0000-0000-0000-000000969001',
    '00000000-0000-0000-0000-000000969301',
    'Tenant A center guard event',
    'open_day',
    now() + interval '11 days',
    now() + interval '11 days 2 hours',
    false,
    'Europe/Madrid',
    'active',
    'management',
    'context_only',
    'Tenant A center guard fixture',
    public.operational_event_retain_until(now() + interval '11 days', now() + interval '11 days 2 hours', 'active')
  ),
  (
    '00000000-0000-0000-0000-000000969406',
    '00000000-0000-0000-0000-000000969002',
    '00000000-0000-0000-0000-000000969302',
    'Tenant B baseline visible event',
    'internal_event',
    now() + interval '7 days',
    now() + interval '7 days 2 hours',
    false,
    'Europe/Madrid',
    'active',
    'all_staff',
    'context_only',
    'Tenant B visible event fixture',
    public.operational_event_retain_until(now() + interval '7 days', now() + interval '7 days 2 hours', 'active')
  );

UPDATE public.operational_events
SET cancelled_at = now()
WHERE id = '00000000-0000-0000-0000-000000969404';

SET LOCAL ROLE authenticated;

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000969101');

DO $$
DECLARE
  cancelled_event public.operational_events;
  archived_event public.operational_events;
BEGIN
  cancelled_event := public.create_operational_event(
    target_organization_id := '00000000-0000-0000-0000-000000969001',
    target_title := 'Tenant A owner event to cancel',
    target_event_type := 'closure',
    target_starts_at := now() + interval '12 days',
    target_ends_at := now() + interval '12 days 3 hours',
    target_timezone := 'Europe/Madrid',
    target_center_id := '00000000-0000-0000-0000-000000969301',
    target_visibility := 'management',
    target_impact_level := 'schedule_review_needed',
    target_notes := 'Owner event created through RPC',
    target_all_day := false
  );
  cancelled_event := public.update_operational_event(
    target_organization_id := '00000000-0000-0000-0000-000000969001',
    target_operational_event_id := cancelled_event.id,
    target_title := 'Tenant A owner event updated before cancel',
    target_event_type := 'closure',
    target_starts_at := now() + interval '12 days',
    target_ends_at := now() + interval '12 days 4 hours',
    target_timezone := 'Europe/Madrid',
    target_center_id := '00000000-0000-0000-0000-000000969301',
    target_visibility := 'staff',
    target_impact_level := 'coverage_review_needed',
    target_notes := 'Owner event updated through RPC',
    target_all_day := false
  );
  cancelled_event := public.set_operational_event_status(
    '00000000-0000-0000-0000-000000969001',
    cancelled_event.id,
    'cancelled'
  );
  PERFORM pg_temp.assert_true(
    cancelled_event.status = 'cancelled'
      AND cancelled_event.title = 'Tenant A owner event updated before cancel'
      AND cancelled_event.organization_id = '00000000-0000-0000-0000-000000969001',
    'tenant A owner can create update and cancel a tenant A operational event through RPC'
  );

  archived_event := public.create_operational_event(
    target_organization_id := '00000000-0000-0000-0000-000000969001',
    target_title := 'Tenant A owner event to archive',
    target_event_type := 'seminar',
    target_starts_at := now() + interval '13 days',
    target_ends_at := now() + interval '13 days 2 hours',
    target_timezone := 'Europe/Madrid',
    target_center_id := NULL,
    target_visibility := 'management',
    target_impact_level := 'context_only',
    target_notes := 'Owner archive event through RPC',
    target_all_day := false
  );
  archived_event := public.set_operational_event_status(
    '00000000-0000-0000-0000-000000969001',
    archived_event.id,
    'archived'
  );
  PERFORM pg_temp.assert_true(
    archived_event.status = 'archived'
      AND archived_event.organization_id = '00000000-0000-0000-0000-000000969001',
    'tenant A owner can archive a tenant A operational event through RPC'
  );
END $$;

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 0
    FROM public.operational_events
    WHERE id = '00000000-0000-0000-0000-000000969406'
  ),
  'tenant A owner cannot read tenant B operational events'
);

SELECT pg_temp.expect_rejected(
  'tenant A owner cannot create operational event through RPC in tenant B',
  $statement$
    SELECT public.create_operational_event(
      '00000000-0000-0000-0000-000000969002',
      'Forbidden tenant B operational event',
      'internal_event',
      now() + interval '14 days',
      now() + interval '14 days 2 hours',
      'Europe/Madrid',
      '00000000-0000-0000-0000-000000969302',
      'staff',
      'context_only',
      'Forbidden cross tenant RPC create',
      false
    )
  $statement$
);

SELECT pg_temp.expect_rejected(
  'tenant A owner cannot insert operational event directly into tenant B',
  $statement$
    INSERT INTO public.operational_events (
      id,
      organization_id,
      center_id,
      title,
      event_type,
      starts_at,
      ends_at,
      timezone,
      status,
      visibility,
      impact_level
    )
    VALUES (
      '00000000-0000-0000-0000-000000969499',
      '00000000-0000-0000-0000-000000969002',
      '00000000-0000-0000-0000-000000969302',
      'Forbidden direct tenant B operational event',
      'internal_event',
      now() + interval '14 days',
      now() + interval '14 days 2 hours',
      'Europe/Madrid',
      'active',
      'staff',
      'context_only'
    )
  $statement$
);

SELECT pg_temp.expect_rejected(
  'tenant A owner cannot move a tenant A operational event into tenant B',
  $statement$
    UPDATE public.operational_events
    SET
      organization_id = '00000000-0000-0000-0000-000000969002',
      center_id = '00000000-0000-0000-0000-000000969302'
    WHERE id = '00000000-0000-0000-0000-000000969405'
  $statement$
);

SELECT pg_temp.expect_rejected(
  'tenant A owner cannot create tenant A operational event with tenant B center',
  $statement$
    SELECT public.create_operational_event(
      '00000000-0000-0000-0000-000000969001',
      'Forbidden tenant B center operational event',
      'open_day',
      now() + interval '15 days',
      now() + interval '15 days 2 hours',
      'Europe/Madrid',
      '00000000-0000-0000-0000-000000969302',
      'staff',
      'context_only',
      'Forbidden cross tenant center create',
      false
    )
  $statement$
);

SELECT pg_temp.expect_rejected(
  'tenant A owner cannot update tenant A operational event to tenant B center',
  $statement$
    SELECT public.update_operational_event(
      '00000000-0000-0000-0000-000000969001',
      '00000000-0000-0000-0000-000000969405',
      'Forbidden tenant B center update',
      'open_day',
      now() + interval '11 days',
      now() + interval '11 days 3 hours',
      'Europe/Madrid',
      '00000000-0000-0000-0000-000000969302',
      'management',
      'context_only',
      'Forbidden cross tenant center update',
      false
    )
  $statement$
);

SELECT pg_temp.expect_rejected(
  'tenant A owner cannot update tenant B operational event through tenant A RPC scope',
  $statement$
    SELECT public.update_operational_event(
      '00000000-0000-0000-0000-000000969001',
      '00000000-0000-0000-0000-000000969406',
      'Forbidden tenant B event update',
      'internal_event',
      now() + interval '7 days',
      now() + interval '7 days 3 hours',
      'Europe/Madrid',
      '00000000-0000-0000-0000-000000969301',
      'staff',
      'context_only',
      'Forbidden tenant B event update',
      false
    )
  $statement$
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000969102');

DO $$
DECLARE
  cancelled_event public.operational_events;
  archived_event public.operational_events;
BEGIN
  cancelled_event := public.create_operational_event(
    target_organization_id := '00000000-0000-0000-0000-000000969001',
    target_title := 'Tenant A admin event to cancel',
    target_event_type := 'internal_event',
    target_starts_at := now() + interval '16 days',
    target_ends_at := now() + interval '16 days 2 hours',
    target_timezone := 'Europe/Madrid',
    target_center_id := '00000000-0000-0000-0000-000000969301',
    target_visibility := 'management',
    target_impact_level := 'context_only',
    target_notes := 'Admin event created through RPC',
    target_all_day := false
  );
  cancelled_event := public.update_operational_event(
    target_organization_id := '00000000-0000-0000-0000-000000969001',
    target_operational_event_id := cancelled_event.id,
    target_title := 'Tenant A admin event updated before cancel',
    target_event_type := 'maintenance',
    target_starts_at := now() + interval '16 days',
    target_ends_at := now() + interval '16 days 3 hours',
    target_timezone := 'Europe/Madrid',
    target_center_id := '00000000-0000-0000-0000-000000969301',
    target_visibility := 'staff',
    target_impact_level := 'staffing_needed',
    target_notes := 'Admin event updated through RPC',
    target_all_day := false
  );
  cancelled_event := public.set_operational_event_status(
    '00000000-0000-0000-0000-000000969001',
    cancelled_event.id,
    'cancelled'
  );
  PERFORM pg_temp.assert_true(
    cancelled_event.status = 'cancelled'
      AND cancelled_event.title = 'Tenant A admin event updated before cancel'
      AND cancelled_event.organization_id = '00000000-0000-0000-0000-000000969001',
    'tenant A admin can create update and cancel a tenant A operational event through RPC'
  );

  archived_event := public.create_operational_event(
    target_organization_id := '00000000-0000-0000-0000-000000969001',
    target_title := 'Tenant A admin event to archive',
    target_event_type := 'competition',
    target_starts_at := now() + interval '17 days',
    target_ends_at := now() + interval '17 days 2 hours',
    target_timezone := 'Europe/Madrid',
    target_center_id := NULL,
    target_visibility := 'management',
    target_impact_level := 'coverage_review_needed',
    target_notes := 'Admin archive event through RPC',
    target_all_day := false
  );
  archived_event := public.set_operational_event_status(
    '00000000-0000-0000-0000-000000969001',
    archived_event.id,
    'archived'
  );
  PERFORM pg_temp.assert_true(
    archived_event.status = 'archived'
      AND archived_event.organization_id = '00000000-0000-0000-0000-000000969001',
    'tenant A admin can archive a tenant A operational event through RPC'
  );
END $$;

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000969103');

DO $$
DECLARE
  cancelled_event public.operational_events;
  archived_event public.operational_events;
BEGIN
  cancelled_event := public.create_operational_event(
    target_organization_id := '00000000-0000-0000-0000-000000969001',
    target_title := 'Tenant A manager event to cancel',
    target_event_type := 'community_event',
    target_starts_at := now() + interval '18 days',
    target_ends_at := now() + interval '18 days 2 hours',
    target_timezone := 'Europe/Madrid',
    target_center_id := '00000000-0000-0000-0000-000000969301',
    target_visibility := 'management',
    target_impact_level := 'context_only',
    target_notes := 'Manager event created through RPC',
    target_all_day := false
  );
  cancelled_event := public.update_operational_event(
    target_organization_id := '00000000-0000-0000-0000-000000969001',
    target_operational_event_id := cancelled_event.id,
    target_title := 'Tenant A manager event updated before cancel',
    target_event_type := 'community_event',
    target_starts_at := now() + interval '18 days',
    target_ends_at := now() + interval '18 days 3 hours',
    target_timezone := 'Europe/Madrid',
    target_center_id := '00000000-0000-0000-0000-000000969301',
    target_visibility := 'staff',
    target_impact_level := 'schedule_review_needed',
    target_notes := 'Manager event updated through RPC',
    target_all_day := false
  );
  cancelled_event := public.set_operational_event_status(
    '00000000-0000-0000-0000-000000969001',
    cancelled_event.id,
    'cancelled'
  );
  PERFORM pg_temp.assert_true(
    cancelled_event.status = 'cancelled'
      AND cancelled_event.title = 'Tenant A manager event updated before cancel'
      AND cancelled_event.organization_id = '00000000-0000-0000-0000-000000969001',
    'tenant A manager can create update and cancel a tenant A operational event through RPC'
  );

  archived_event := public.create_operational_event(
    target_organization_id := '00000000-0000-0000-0000-000000969001',
    target_title := 'Tenant A manager event to archive',
    target_event_type := 'external_event',
    target_starts_at := now() + interval '19 days',
    target_ends_at := now() + interval '19 days 2 hours',
    target_timezone := 'Europe/Madrid',
    target_center_id := NULL,
    target_visibility := 'management',
    target_impact_level := 'context_only',
    target_notes := 'Manager archive event through RPC',
    target_all_day := false
  );
  archived_event := public.set_operational_event_status(
    '00000000-0000-0000-0000-000000969001',
    archived_event.id,
    'archived'
  );
  PERFORM pg_temp.assert_true(
    archived_event.status = 'archived'
      AND archived_event.organization_id = '00000000-0000-0000-0000-000000969001',
    'tenant A manager can archive a tenant A operational event through RPC'
  );
END $$;

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 0
    FROM public.operational_events
    WHERE id = '00000000-0000-0000-0000-000000969406'
  ),
  'tenant A manager cannot read tenant B operational events'
);

SELECT pg_temp.expect_rejected(
  'tenant A manager cannot update tenant B operational event through tenant B RPC scope',
  $statement$
    SELECT public.update_operational_event(
      '00000000-0000-0000-0000-000000969002',
      '00000000-0000-0000-0000-000000969406',
      'Forbidden manager cross tenant event update',
      'internal_event',
      now() + interval '7 days',
      now() + interval '7 days 3 hours',
      'Europe/Madrid',
      '00000000-0000-0000-0000-000000969302',
      'staff',
      'context_only',
      'Forbidden manager cross tenant event update',
      false
    )
  $statement$
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000969104');

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 2
    FROM public.operational_events
    WHERE organization_id = '00000000-0000-0000-0000-000000969001'
  ),
  'tenant A coach can read only active staff/all_staff tenant A operational events'
);

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM public.operational_events
    WHERE id = '00000000-0000-0000-0000-000000969401'
  ),
  'tenant A coach can read active staff operational event'
);

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM public.operational_events
    WHERE id = '00000000-0000-0000-0000-000000969402'
  ),
  'tenant A coach can read active all_staff operational event'
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 0
    FROM public.operational_events
    WHERE id IN (
      '00000000-0000-0000-0000-000000969403',
      '00000000-0000-0000-0000-000000969404',
      '00000000-0000-0000-0000-000000969406'
    )
  ),
  'tenant A coach cannot read management cancelled or tenant B operational events'
);

SELECT pg_temp.expect_rejected(
  'tenant A coach cannot create tenant A operational event through RPC',
  $statement$
    SELECT public.create_operational_event(
      '00000000-0000-0000-0000-000000969001',
      'Forbidden coach operational event',
      'internal_event',
      now() + interval '20 days',
      now() + interval '20 days 2 hours',
      'Europe/Madrid',
      NULL,
      'staff',
      'context_only',
      'Forbidden coach create',
      false
    )
  $statement$
);

SELECT pg_temp.expect_rejected(
  'tenant A coach cannot update tenant A operational event through RPC',
  $statement$
    SELECT public.update_operational_event(
      '00000000-0000-0000-0000-000000969001',
      '00000000-0000-0000-0000-000000969401',
      'Forbidden coach update',
      'internal_event',
      now() + interval '7 days',
      now() + interval '7 days 3 hours',
      'Europe/Madrid',
      '00000000-0000-0000-0000-000000969301',
      'staff',
      'context_only',
      'Forbidden coach update',
      false
    )
  $statement$
);

SELECT pg_temp.expect_rejected(
  'tenant A coach cannot cancel tenant A operational event through RPC',
  $statement$
    SELECT public.set_operational_event_status(
      '00000000-0000-0000-0000-000000969001',
      '00000000-0000-0000-0000-000000969401',
      'cancelled'
    )
  $statement$
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000969105');

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 0
    FROM public.operational_events
    WHERE organization_id = '00000000-0000-0000-0000-000000969001'
  ),
  'tenant A staff role cannot read operational events under current DB policy'
);

SELECT pg_temp.expect_rejected(
  'tenant A staff role cannot create tenant A operational event through RPC',
  $statement$
    SELECT public.create_operational_event(
      '00000000-0000-0000-0000-000000969001',
      'Forbidden staff operational event',
      'internal_event',
      now() + interval '21 days',
      now() + interval '21 days 2 hours',
      'Europe/Madrid',
      NULL,
      'staff',
      'context_only',
      'Forbidden staff create',
      false
    )
  $statement$
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000969106');

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM public.operational_events
    WHERE id = '00000000-0000-0000-0000-000000969406'
      AND organization_id = '00000000-0000-0000-0000-000000969002'
  ),
  'tenant B manager can read tenant B operational event'
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 0
    FROM public.operational_events
    WHERE id = '00000000-0000-0000-0000-000000969401'
  ),
  'tenant B manager cannot read tenant A operational events'
);

SELECT pg_temp.expect_rejected(
  'tenant B manager cannot update tenant A operational event through tenant A RPC scope',
  $statement$
    SELECT public.update_operational_event(
      '00000000-0000-0000-0000-000000969001',
      '00000000-0000-0000-0000-000000969401',
      'Forbidden tenant B manager update',
      'internal_event',
      now() + interval '7 days',
      now() + interval '7 days 3 hours',
      'Europe/Madrid',
      '00000000-0000-0000-0000-000000969301',
      'staff',
      'context_only',
      'Forbidden tenant B manager update',
      false
    )
  $statement$
);

RESET ROLE;

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM public.operational_events
    WHERE id = '00000000-0000-0000-0000-000000969405'
      AND organization_id = '00000000-0000-0000-0000-000000969001'
      AND center_id = '00000000-0000-0000-0000-000000969301'
      AND title = 'Tenant A center guard event'
      AND status = 'active'
  ),
  'tenant A center guard event remains in tenant A before rollback'
);

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM public.operational_events
    WHERE id = '00000000-0000-0000-0000-000000969406'
      AND organization_id = '00000000-0000-0000-0000-000000969002'
      AND center_id = '00000000-0000-0000-0000-000000969302'
      AND title = 'Tenant B baseline visible event'
      AND status = 'active'
  ),
  'tenant B operational event remains unchanged before rollback'
);

SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1
    FROM public.operational_events
    WHERE id = '00000000-0000-0000-0000-000000969499'
  ),
  'forbidden direct tenant B operational event insert was not persisted before rollback'
);

ROLLBACK;
