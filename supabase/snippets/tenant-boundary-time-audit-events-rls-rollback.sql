-- BoxOps - S.72 tenant boundary time_audit_events RLS/trigger rollback verification
--
-- Run locally with:
--   Get-Content -Raw supabase/snippets/tenant-boundary-time-audit-events-rls-rollback.sql | docker exec -i supabase_db_boxops psql -U postgres -d postgres -v ON_ERROR_STOP=1
--
-- The script runs inside a transaction and rolls back all fixture data. It
-- validates a minimal tenant/RLS/trigger case from the negative-test matrix
-- for time tracking audit only: time_audit_events are created through existing
-- DB triggers, readable only by the target person or time-tracking managers,
-- blocked across tenants, metadata-safe by constraint, and not directly
-- insertable/updatable/deletable by authenticated users.
--
-- This intentionally does not validate /app/time Server Actions, browser
-- runtime, POST direct behavior, signature-backed weekly approval, CSV export
-- generation/download, legal retention, payroll, geolocation, Storage, SMTP,
-- staging, evidence from a real tenant, or F.15 beta readiness.

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
    RAISE EXCEPTION 'tenant boundary time audit RLS/trigger verification failed: %', label;
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

CREATE OR REPLACE FUNCTION pg_temp.expect_no_affected_rows(
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
    RAISE EXCEPTION 'statement affected % row(s): %', affected_rows, label;
  END IF;

  RAISE NOTICE 'ok - no rows affected: %', label;
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
    '00000000-0000-0000-0000-000000972101',
    'authenticated',
    'authenticated',
    'tenant-boundary-time-audit-owner-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Tenant Boundary Time Audit Owner A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000972102',
    'authenticated',
    'authenticated',
    'tenant-boundary-time-audit-admin-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Tenant Boundary Time Audit Admin A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000972103',
    'authenticated',
    'authenticated',
    'tenant-boundary-time-audit-manager-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Tenant Boundary Time Audit Manager A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000972104',
    'authenticated',
    'authenticated',
    'tenant-boundary-time-audit-coach-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Tenant Boundary Time Audit Coach A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000972105',
    'authenticated',
    'authenticated',
    'tenant-boundary-time-audit-other-coach-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Tenant Boundary Time Audit Other Coach A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000972106',
    'authenticated',
    'authenticated',
    'tenant-boundary-time-audit-payroll-manager-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Tenant Boundary Time Audit Payroll Manager A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000972107',
    'authenticated',
    'authenticated',
    'tenant-boundary-time-audit-manager-b@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Tenant Boundary Time Audit Manager B"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000972108',
    'authenticated',
    'authenticated',
    'tenant-boundary-time-audit-coach-b@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Tenant Boundary Time Audit Coach B"}'::jsonb
  );

INSERT INTO public.organizations (id, name, slug, status, timezone)
VALUES
  (
    '00000000-0000-0000-0000-000000972001',
    'Tenant Boundary Time Audit A',
    'tenant-boundary-time-audit-a',
    'active',
    'Europe/Madrid'
  ),
  (
    '00000000-0000-0000-0000-000000972002',
    'Tenant Boundary Time Audit B',
    'tenant-boundary-time-audit-b',
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
    '00000000-0000-0000-0000-000000972201',
    '00000000-0000-0000-0000-000000972001',
    '00000000-0000-0000-0000-000000972101',
    'owner',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000972202',
    '00000000-0000-0000-0000-000000972001',
    '00000000-0000-0000-0000-000000972102',
    'admin',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000972203',
    '00000000-0000-0000-0000-000000972001',
    '00000000-0000-0000-0000-000000972103',
    'manager',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000972204',
    '00000000-0000-0000-0000-000000972001',
    '00000000-0000-0000-0000-000000972104',
    'coach',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000972205',
    '00000000-0000-0000-0000-000000972001',
    '00000000-0000-0000-0000-000000972105',
    'coach',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000972206',
    '00000000-0000-0000-0000-000000972001',
    '00000000-0000-0000-0000-000000972106',
    'payroll_manager',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000972207',
    '00000000-0000-0000-0000-000000972002',
    '00000000-0000-0000-0000-000000972107',
    'manager',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000972208',
    '00000000-0000-0000-0000-000000972002',
    '00000000-0000-0000-0000-000000972108',
    'coach',
    'active',
    now()
  );

INSERT INTO public.person_profiles (
  id,
  organization_id,
  user_id,
  full_name,
  display_name,
  visibility_status,
  status
)
VALUES
  (
    '00000000-0000-0000-0000-000000972401',
    '00000000-0000-0000-0000-000000972001',
    '00000000-0000-0000-0000-000000972101',
    'Tenant Boundary Time Audit Owner A',
    'Tenant Boundary Time Audit Owner A',
    'visible',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000972402',
    '00000000-0000-0000-0000-000000972001',
    '00000000-0000-0000-0000-000000972102',
    'Tenant Boundary Time Audit Admin A',
    'Tenant Boundary Time Audit Admin A',
    'visible',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000972403',
    '00000000-0000-0000-0000-000000972001',
    '00000000-0000-0000-0000-000000972103',
    'Tenant Boundary Time Audit Manager A',
    'Tenant Boundary Time Audit Manager A',
    'visible',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000972404',
    '00000000-0000-0000-0000-000000972001',
    '00000000-0000-0000-0000-000000972104',
    'Tenant Boundary Time Audit Coach A',
    'Tenant Boundary Time Audit Coach A',
    'visible',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000972405',
    '00000000-0000-0000-0000-000000972001',
    '00000000-0000-0000-0000-000000972105',
    'Tenant Boundary Time Audit Other Coach A',
    'Tenant Boundary Time Audit Other Coach A',
    'visible',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000972406',
    '00000000-0000-0000-0000-000000972001',
    '00000000-0000-0000-0000-000000972106',
    'Tenant Boundary Time Audit Payroll Manager A',
    'Tenant Boundary Time Audit Payroll Manager A',
    'visible',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000972407',
    '00000000-0000-0000-0000-000000972002',
    '00000000-0000-0000-0000-000000972107',
    'Tenant Boundary Time Audit Manager B',
    'Tenant Boundary Time Audit Manager B',
    'visible',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000972408',
    '00000000-0000-0000-0000-000000972002',
    '00000000-0000-0000-0000-000000972108',
    'Tenant Boundary Time Audit Coach B',
    'Tenant Boundary Time Audit Coach B',
    'visible',
    'active'
  );

SET LOCAL ROLE authenticated;

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000972104');

SELECT public.create_own_time_punch(
  '00000000-0000-0000-0000-000000972001',
  'clock_in',
  '2026-05-18 08:00:00+02'::timestamptz,
  '2026-05-18',
  NULL,
  NULL,
  NULL,
  'Tenant A coach A synthetic punch',
  '{"qa":"S.72"}'::jsonb
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 2
      AND bool_and(actor_user_id = '00000000-0000-0000-0000-000000972104')
      AND bool_and(actor_membership_id = '00000000-0000-0000-0000-000000972204')
      AND bool_and(actor_person_profile_id = '00000000-0000-0000-0000-000000972404')
      AND bool_and(target_person_profile_id = '00000000-0000-0000-0000-000000972404')
      AND count(*) FILTER (WHERE event_type = 'time_record_created') = 1
      AND count(*) FILTER (WHERE event_type = 'time_punch_created') = 1
    FROM public.time_audit_events
    WHERE organization_id = '00000000-0000-0000-0000-000000972001'
  ),
  'own manual punch creates record and punch audit events with derived actor context'
);

SELECT pg_temp.expect_rejected(
  'tenant A coach cannot create own time punch in tenant B',
  $statement$
    SELECT public.create_own_time_punch(
      '00000000-0000-0000-0000-000000972002',
      'clock_in',
      '2026-05-18 08:00:00+02'::timestamptz,
      '2026-05-18',
      NULL,
      NULL,
      NULL,
      NULL,
      '{}'::jsonb
    )
  $statement$
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000972105');

SELECT public.create_own_time_punch(
  '00000000-0000-0000-0000-000000972001',
  'clock_in',
  '2026-05-19 08:00:00+02'::timestamptz,
  '2026-05-19',
  NULL,
  NULL,
  NULL,
  'Tenant A other coach synthetic punch',
  '{"qa":"S.72"}'::jsonb
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000972103');

INSERT INTO public.time_weekly_approvals (
  id,
  organization_id,
  person_profile_id,
  week_start_date,
  status,
  created_by_user_id,
  created_by_membership_id,
  snapshot,
  metadata
)
VALUES
  (
    '00000000-0000-0000-0000-000000972501',
    '00000000-0000-0000-0000-000000972001',
    '00000000-0000-0000-0000-000000972404',
    '2026-05-18',
    'pending',
    '00000000-0000-0000-0000-000000972103',
    '00000000-0000-0000-0000-000000972203',
    '{"qa":"S.72","case":"coach-a-weekly"}'::jsonb,
    '{"qa":"S.72"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000972502',
    '00000000-0000-0000-0000-000000972001',
    '00000000-0000-0000-0000-000000972405',
    '2026-05-18',
    'pending',
    '00000000-0000-0000-0000-000000972103',
    '00000000-0000-0000-0000-000000972203',
    '{"qa":"S.72","case":"other-coach-weekly"}'::jsonb,
    '{"qa":"S.72"}'::jsonb
  );

INSERT INTO public.time_exports (
  id,
  organization_id,
  requested_by_user_id,
  requested_by_membership_id,
  date_from,
  date_to,
  person_profile_id,
  export_format,
  export_scope,
  status,
  metadata
)
VALUES (
  '00000000-0000-0000-0000-000000972601',
  '00000000-0000-0000-0000-000000972001',
  '00000000-0000-0000-0000-000000972103',
  '00000000-0000-0000-0000-000000972203',
  '2026-05-18',
  '2026-05-24',
  NULL,
  'csv',
  'time_records',
  'requested',
  '{"qa":"S.72","legalFinal":false,"payroll":false}'::jsonb
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 7
      AND count(*) FILTER (WHERE event_type = 'time_weekly_approval_submitted') = 2
      AND count(*) FILTER (WHERE event_type = 'time_export_requested') = 1
    FROM public.time_audit_events
    WHERE organization_id = '00000000-0000-0000-0000-000000972001'
  ),
  'tenant A manager can read tenant A audit rows including weekly approval and export audit'
);

SELECT pg_temp.expect_rejected(
  'tenant A manager cannot insert weekly closure directly into tenant B',
  $statement$
    INSERT INTO public.time_weekly_approvals (
      id,
      organization_id,
      person_profile_id,
      week_start_date,
      status,
      created_by_user_id,
      created_by_membership_id,
      snapshot,
      metadata
    )
    VALUES (
      '00000000-0000-0000-0000-000000972599',
      '00000000-0000-0000-0000-000000972002',
      '00000000-0000-0000-0000-000000972408',
      '2026-05-18',
      'pending',
      '00000000-0000-0000-0000-000000972103',
      '00000000-0000-0000-0000-000000972203',
      '{}'::jsonb,
      '{}'::jsonb
    )
  $statement$
);

SELECT pg_temp.expect_rejected(
  'tenant A manager cannot insert time audit rows directly',
  $statement$
    INSERT INTO public.time_audit_events (
      id,
      organization_id,
      event_type,
      result,
      actor_user_id,
      actor_membership_id,
      actor_person_profile_id,
      target_person_profile_id,
      metadata
    )
    VALUES (
      '00000000-0000-0000-0000-000000972701',
      '00000000-0000-0000-0000-000000972001',
      'time_access_denied',
      'denied',
      '00000000-0000-0000-0000-000000972103',
      '00000000-0000-0000-0000-000000972203',
      '00000000-0000-0000-0000-000000972403',
      '00000000-0000-0000-0000-000000972404',
      '{"qa":"S.72","case":"direct-insert"}'::jsonb
    )
  $statement$
);

SELECT pg_temp.expect_no_affected_rows(
  'tenant A manager direct update of time audit rows has no effect',
  $statement$
    UPDATE public.time_audit_events
    SET metadata = '{"qa":"S.72","case":"direct-update"}'::jsonb
    WHERE organization_id = '00000000-0000-0000-0000-000000972001'
  $statement$
);

SELECT pg_temp.expect_no_affected_rows(
  'tenant A manager direct delete of time audit rows has no effect',
  $statement$
    DELETE FROM public.time_audit_events
    WHERE organization_id = '00000000-0000-0000-0000-000000972001'
  $statement$
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000972101');

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 7
    FROM public.time_audit_events
    WHERE organization_id = '00000000-0000-0000-0000-000000972001'
  ),
  'tenant A owner can read tenant A time audit by time tracking management role'
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000972102');

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 7
    FROM public.time_audit_events
    WHERE organization_id = '00000000-0000-0000-0000-000000972001'
  ),
  'tenant A admin can read tenant A time audit by time tracking management role'
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000972104');

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 3
      AND count(*) FILTER (WHERE target_person_profile_id = '00000000-0000-0000-0000-000000972404') = 3
      AND count(*) FILTER (WHERE target_person_profile_id = '00000000-0000-0000-0000-000000972405') = 0
      AND count(*) FILTER (WHERE target_person_profile_id IS NULL) = 0
    FROM public.time_audit_events
    WHERE organization_id = '00000000-0000-0000-0000-000000972001'
  ),
  'tenant A coach reads own audit events only, not other coach or tenant-wide export audit'
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 1
      AND bool_and(person_profile_id = '00000000-0000-0000-0000-000000972404')
    FROM public.time_weekly_approvals
    WHERE organization_id = '00000000-0000-0000-0000-000000972001'
  ),
  'tenant A coach reads own weekly closure row only'
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000972105');

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 3
      AND count(*) FILTER (WHERE target_person_profile_id = '00000000-0000-0000-0000-000000972405') = 3
      AND count(*) FILTER (WHERE target_person_profile_id = '00000000-0000-0000-0000-000000972404') = 0
    FROM public.time_audit_events
    WHERE organization_id = '00000000-0000-0000-0000-000000972001'
  ),
  'same-tenant coach cannot read another coach time audit'
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 1
      AND bool_and(person_profile_id = '00000000-0000-0000-0000-000000972405')
    FROM public.time_weekly_approvals
    WHERE organization_id = '00000000-0000-0000-0000-000000972001'
  ),
  'same-tenant coach reads own weekly closure row only'
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000972106');

SELECT pg_temp.assert_true(
  NOT public.can_manage_time_tracking('00000000-0000-0000-0000-000000972001')
    AND (
      SELECT count(*) = 0
      FROM public.time_audit_events
      WHERE organization_id = '00000000-0000-0000-0000-000000972001'
    )
    AND (
      SELECT count(*) = 0
      FROM public.time_weekly_approvals
      WHERE organization_id = '00000000-0000-0000-0000-000000972001'
    ),
  'payroll_manager does not inherit time audit or weekly closure review access'
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000972108');

SELECT public.create_own_time_punch(
  '00000000-0000-0000-0000-000000972002',
  'clock_in',
  '2026-05-18 08:00:00+02'::timestamptz,
  '2026-05-18',
  NULL,
  NULL,
  NULL,
  'Tenant B coach synthetic punch',
  '{"qa":"S.72"}'::jsonb
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 2
      AND bool_and(organization_id = '00000000-0000-0000-0000-000000972002')
      AND bool_and(target_person_profile_id = '00000000-0000-0000-0000-000000972408')
    FROM public.time_audit_events
    WHERE organization_id = '00000000-0000-0000-0000-000000972002'
  ),
  'tenant B coach can create and read only tenant B own audit rows'
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 0
    FROM public.time_audit_events
    WHERE organization_id = '00000000-0000-0000-0000-000000972001'
  ),
  'tenant B coach cannot read tenant A time audit'
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000972107');

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 2
    FROM public.time_audit_events
    WHERE organization_id = '00000000-0000-0000-0000-000000972002'
  ),
  'tenant B manager can read tenant B time audit'
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 0
    FROM public.time_audit_events
    WHERE organization_id = '00000000-0000-0000-0000-000000972001'
  ),
  'tenant B manager cannot read tenant A time audit'
);

RESET ROLE;

SELECT pg_temp.assert_true(
  NOT public.time_audit_event_metadata_is_safe('{"url":"https://example.test/time.csv"}'::jsonb)
    AND NOT public.time_audit_event_metadata_is_safe('{"token":"redacted-token"}'::jsonb)
    AND NOT public.time_audit_event_metadata_is_safe('{"signature_id":"00000000-0000-0000-0000-000000000000"}'::jsonb)
    AND NOT public.time_audit_event_metadata_is_safe('{"latitude":"40.0"}'::jsonb)
    AND NOT public.time_audit_event_metadata_is_safe(jsonb_build_object('note', repeat('x', 4001))),
  'time audit metadata guard rejects URL token signature location and oversized keys/payloads'
);

SELECT pg_temp.expect_rejected(
  'unsafe time audit metadata is rejected by DB constraint',
  $statement$
    INSERT INTO public.time_audit_events (
      id,
      organization_id,
      event_type,
      result,
      metadata
    )
    VALUES (
      '00000000-0000-0000-0000-000000972702',
      '00000000-0000-0000-0000-000000972001',
      'time_access_denied',
      'denied',
      '{"url":"https://example.test/time.csv"}'::jsonb
    )
  $statement$
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 7
    FROM public.time_audit_events
    WHERE organization_id = '00000000-0000-0000-0000-000000972001'
  ),
  'tenant A time audit rows were created only through trigger paths before rollback'
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 2
    FROM public.time_audit_events
    WHERE organization_id = '00000000-0000-0000-0000-000000972002'
  ),
  'tenant B time audit rows remain tenant B scoped before rollback'
);

SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1
    FROM public.time_audit_events
    WHERE id IN (
      '00000000-0000-0000-0000-000000972701',
      '00000000-0000-0000-0000-000000972702'
    )
  ),
  'forbidden direct time audit inserts were not persisted before rollback'
);

ROLLBACK;
