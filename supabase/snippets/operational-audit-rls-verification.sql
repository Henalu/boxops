-- BoxOps - S.1.1 operational audit RLS verification
--
-- Run locally with:
--   Get-Content -Raw supabase/snippets/operational-audit-rls-verification.sql | docker exec -i supabase_db_boxops psql -U postgres -d postgres -v ON_ERROR_STOP=1
--
-- The script runs inside a transaction and rolls back all fixture data.

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
    RAISE EXCEPTION 'audit RLS verification failed: %', label;
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

CREATE OR REPLACE FUNCTION pg_temp.expect_list_rejected(
  label text,
  target_organization_id uuid
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  got_error boolean := false;
BEGIN
  BEGIN
    PERFORM *
    FROM public.list_operational_audit_events(target_organization_id, NULL, 10);
  EXCEPTION WHEN others THEN
    got_error := true;
    RAISE NOTICE 'ok - rejected list: % (%: %)', label, SQLSTATE, SQLERRM;
  END;

  IF NOT got_error THEN
    RAISE EXCEPTION 'audit list was not rejected: %', label;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.expect_record_rejected(
  label text,
  target_organization_id uuid,
  target_entity_id uuid,
  target_changed_fields jsonb
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  got_error boolean := false;
BEGIN
  BEGIN
    PERFORM public.record_operational_audit_event(
      target_organization_id,
      'schedule_blocks',
      target_entity_id,
      'updated',
      'success',
      target_changed_fields
    );
  EXCEPTION WHEN others THEN
    got_error := true;
    RAISE NOTICE 'ok - rejected record: % (%: %)', label, SQLSTATE, SQLERRM;
  END;

  IF NOT got_error THEN
    RAISE EXCEPTION 'audit record was not rejected: %', label;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.expect_direct_insert_rejected()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  got_error boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.operational_audit_events (
      id,
      organization_id,
      actor_user_id,
      actor_membership_id,
      actor_person_profile_id,
      entity_type,
      entity_id,
      action,
      result,
      changed_fields,
      created_at,
      retain_until
    )
    VALUES (
      '00000000-0000-0000-0000-000000900980',
      '00000000-0000-0000-0000-000000900001',
      '00000000-0000-0000-0000-000000900102',
      '00000000-0000-0000-0000-000000900202',
      '00000000-0000-0000-0000-000000900402',
      'schedule_blocks',
      '00000000-0000-0000-0000-000000900601',
      'updated',
      'success',
      '{"status":{"to":"changed"}}'::jsonb,
      now(),
      now() + interval '15 days'
    );
  EXCEPTION WHEN others THEN
    got_error := true;
    RAISE NOTICE 'ok - rejected direct insert with forged actor (%: %)', SQLSTATE, SQLERRM;
  END;

  IF NOT got_error THEN
    RAISE EXCEPTION 'direct audit insert with forged actor was not rejected';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.expect_purge_rejected()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  got_error boolean := false;
BEGIN
  BEGIN
    PERFORM public.purge_expired_operational_audit_events(100);
  EXCEPTION WHEN others THEN
    got_error := true;
    RAISE NOTICE 'ok - rejected purge from authenticated role (%: %)', SQLSTATE, SQLERRM;
  END;

  IF NOT got_error THEN
    RAISE EXCEPTION 'purge function was exposed to authenticated role';
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
    '00000000-0000-0000-0000-000000900101',
    'authenticated',
    'authenticated',
    'audit-owner-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Audit Owner A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000900102',
    'authenticated',
    'authenticated',
    'audit-admin-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Audit Admin A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000900103',
    'authenticated',
    'authenticated',
    'audit-manager-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Audit Manager A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000900104',
    'authenticated',
    'authenticated',
    'audit-coach-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Audit Coach A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000900105',
    'authenticated',
    'authenticated',
    'audit-staff-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Audit Staff A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000900106',
    'authenticated',
    'authenticated',
    'audit-owner-b@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Audit Owner B"}'::jsonb
  );

INSERT INTO public.organizations (id, name, slug, status, timezone)
VALUES
  (
    '00000000-0000-0000-0000-000000900001',
    'Audit Test A',
    'audit-test-a',
    'active',
    'Europe/Madrid'
  ),
  (
    '00000000-0000-0000-0000-000000900002',
    'Audit Test B',
    'audit-test-b',
    'active',
    'Europe/Madrid'
  );

INSERT INTO public.centers (id, organization_id, name, slug, timezone, status)
VALUES
  (
    '00000000-0000-0000-0000-000000900501',
    '00000000-0000-0000-0000-000000900001',
    'Audit Center A',
    'audit-center-a',
    'Europe/Madrid',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000900502',
    '00000000-0000-0000-0000-000000900002',
    'Audit Center B',
    'audit-center-b',
    'Europe/Madrid',
    'active'
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
    '00000000-0000-0000-0000-000000900201',
    '00000000-0000-0000-0000-000000900001',
    '00000000-0000-0000-0000-000000900101',
    'owner',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000900202',
    '00000000-0000-0000-0000-000000900001',
    '00000000-0000-0000-0000-000000900102',
    'admin',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000900203',
    '00000000-0000-0000-0000-000000900001',
    '00000000-0000-0000-0000-000000900103',
    'manager',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000900204',
    '00000000-0000-0000-0000-000000900001',
    '00000000-0000-0000-0000-000000900104',
    'coach',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000900205',
    '00000000-0000-0000-0000-000000900001',
    '00000000-0000-0000-0000-000000900105',
    'staff',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000900206',
    '00000000-0000-0000-0000-000000900002',
    '00000000-0000-0000-0000-000000900106',
    'owner',
    'active',
    now()
  );

INSERT INTO public.person_profiles (
  id,
  organization_id,
  user_id,
  display_name,
  full_name,
  visibility_status,
  status
)
VALUES
  (
    '00000000-0000-0000-0000-000000900401',
    '00000000-0000-0000-0000-000000900001',
    '00000000-0000-0000-0000-000000900101',
    'Audit Owner A',
    'Audit Owner A',
    'visible',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000900402',
    '00000000-0000-0000-0000-000000900001',
    '00000000-0000-0000-0000-000000900102',
    'Audit Admin A',
    'Audit Admin A',
    'visible',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000900406',
    '00000000-0000-0000-0000-000000900002',
    '00000000-0000-0000-0000-000000900106',
    'Audit Owner B',
    'Audit Owner B',
    'visible',
    'active'
  );

INSERT INTO public.class_types (
  id,
  organization_id,
  name,
  slug,
  category,
  required_coaches,
  requires_certification,
  status
)
VALUES
  (
    '00000000-0000-0000-0000-000000900701',
    '00000000-0000-0000-0000-000000900001',
    'Audit Class A',
    'audit-class-a',
    'class',
    1,
    false,
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000900702',
    '00000000-0000-0000-0000-000000900002',
    'Audit Class B',
    'audit-class-b',
    'class',
    1,
    false,
    'active'
  );

INSERT INTO public.schedule_blocks (
  id,
  organization_id,
  center_id,
  service_date,
  start_time,
  end_time,
  class_type_id,
  required_coaches,
  status,
  notes
)
VALUES
  (
    '00000000-0000-0000-0000-000000900601',
    '00000000-0000-0000-0000-000000900001',
    '00000000-0000-0000-0000-000000900501',
    '2026-05-12',
    '10:00',
    '11:00',
    '00000000-0000-0000-0000-000000900701',
    1,
    'scheduled',
    'Audit verification block A'
  ),
  (
    '00000000-0000-0000-0000-000000900602',
    '00000000-0000-0000-0000-000000900002',
    '00000000-0000-0000-0000-000000900502',
    '2026-05-12',
    '10:00',
    '11:00',
    '00000000-0000-0000-0000-000000900702',
    1,
    'scheduled',
    'Audit verification block B'
  );

SET LOCAL ROLE authenticated;
SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000900101');

DO $$
DECLARE
  created_event public.operational_audit_events;
BEGIN
  SELECT *
  INTO created_event
  FROM public.record_operational_audit_event(
    '00000000-0000-0000-0000-000000900001',
    'schedule_blocks',
    '00000000-0000-0000-0000-000000900601',
    'updated',
    'success',
    '{"status":{"from":"scheduled","to":"changed"},"notes":{"changed":true}}'::jsonb
  );

  PERFORM pg_temp.assert_true(
    created_event.organization_id = '00000000-0000-0000-0000-000000900001',
    'event organization is derived from allowed target tenant'
  );
  PERFORM pg_temp.assert_true(
    created_event.actor_user_id = '00000000-0000-0000-0000-000000900101',
    'event actor_user_id is derived from auth.uid()'
  );
  PERFORM pg_temp.assert_true(
    created_event.actor_membership_id = '00000000-0000-0000-0000-000000900201',
    'event actor_membership_id is derived from tenant membership'
  );
  PERFORM pg_temp.assert_true(
    created_event.actor_person_profile_id = '00000000-0000-0000-0000-000000900401',
    'event actor_person_profile_id is derived from linked person'
  );
END;
$$;

SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1
    FROM pg_proc procedure
    JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.proname = 'record_operational_audit_event'
      AND pg_get_function_arguments(procedure.oid) ~* '(actor|membership|person|retain|created_at)'
  ),
  'record RPC does not expose actor, membership, person or retention parameters'
);

SELECT pg_temp.assert_true(
  (SELECT count(*) FROM public.operational_audit_events WHERE organization_id = '00000000-0000-0000-0000-000000900001') = 1,
  'owner can read tenant operational audit events through RLS'
);

SELECT pg_temp.assert_true(
  (SELECT count(*) FROM public.list_operational_audit_events('00000000-0000-0000-0000-000000900001', NULL, 10)) = 1,
  'owner can read tenant operational audit events through RPC'
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000900102');
SELECT pg_temp.assert_true(
  (SELECT count(*) FROM public.operational_audit_events WHERE organization_id = '00000000-0000-0000-0000-000000900001') = 1,
  'admin can read tenant operational audit events through RLS'
);
SELECT pg_temp.assert_true(
  (SELECT count(*) FROM public.list_operational_audit_events('00000000-0000-0000-0000-000000900001', NULL, 10)) = 1,
  'admin can read tenant operational audit events through RPC'
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000900103');
SELECT pg_temp.assert_true(
  (SELECT count(*) FROM public.operational_audit_events WHERE organization_id = '00000000-0000-0000-0000-000000900001') = 0,
  'manager cannot read operational audit events in S.1'
);
SELECT pg_temp.expect_list_rejected(
  'manager cannot call audit list RPC',
  '00000000-0000-0000-0000-000000900001'
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000900104');
SELECT pg_temp.assert_true(
  (SELECT count(*) FROM public.operational_audit_events WHERE organization_id = '00000000-0000-0000-0000-000000900001') = 0,
  'coach cannot read operational audit events'
);
SELECT pg_temp.expect_list_rejected(
  'coach cannot call audit list RPC',
  '00000000-0000-0000-0000-000000900001'
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000900105');
SELECT pg_temp.assert_true(
  (SELECT count(*) FROM public.operational_audit_events WHERE organization_id = '00000000-0000-0000-0000-000000900001') = 0,
  'staff cannot read operational audit events'
);
SELECT pg_temp.expect_list_rejected(
  'staff cannot call audit list RPC',
  '00000000-0000-0000-0000-000000900001'
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000900106');
SELECT pg_temp.assert_true(
  (SELECT count(*) FROM public.operational_audit_events WHERE organization_id = '00000000-0000-0000-0000-000000900001') = 0,
  'other tenant owner cannot read tenant A operational audit events'
);
SELECT pg_temp.expect_list_rejected(
  'other tenant owner cannot call audit list RPC for tenant A',
  '00000000-0000-0000-0000-000000900001'
);

SELECT pg_temp.expect_record_rejected(
  'tenant B owner cannot record tenant A entity while claiming tenant B',
  '00000000-0000-0000-0000-000000900002',
  '00000000-0000-0000-0000-000000900601',
  '{"status":{"to":"changed"}}'::jsonb
);
SELECT pg_temp.expect_record_rejected(
  'tenant B owner cannot record tenant A entity while claiming tenant A',
  '00000000-0000-0000-0000-000000900001',
  '00000000-0000-0000-0000-000000900601',
  '{"status":{"to":"changed"}}'::jsonb
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000900101');
SELECT pg_temp.expect_record_rejected(
  'tenant A owner cannot force organization_id to tenant B',
  '00000000-0000-0000-0000-000000900002',
  '00000000-0000-0000-0000-000000900602',
  '{"status":{"to":"changed"}}'::jsonb
);
SELECT pg_temp.expect_record_rejected(
  'tenant A owner cannot record tenant B entity while claiming tenant A',
  '00000000-0000-0000-0000-000000900001',
  '00000000-0000-0000-0000-000000900602',
  '{"status":{"to":"changed"}}'::jsonb
);

SELECT pg_temp.expect_direct_insert_rejected();

SELECT pg_temp.expect_record_rejected(
  'changed_fields rejects token key',
  '00000000-0000-0000-0000-000000900001',
  '00000000-0000-0000-0000-000000900601',
  '{"token":{"to":"redacted"}}'::jsonb
);
SELECT pg_temp.expect_record_rejected(
  'changed_fields rejects URL value',
  '00000000-0000-0000-0000-000000900001',
  '00000000-0000-0000-0000-000000900601',
  '{"status":{"to":"https://example.test/audit"}}'::jsonb
);
SELECT pg_temp.expect_record_rejected(
  'changed_fields rejects IP key',
  '00000000-0000-0000-0000-000000900001',
  '00000000-0000-0000-0000-000000900601',
  '{"ip_address":{"to":"127.0.0.1"}}'::jsonb
);
SELECT pg_temp.expect_record_rejected(
  'changed_fields rejects IP value',
  '00000000-0000-0000-0000-000000900001',
  '00000000-0000-0000-0000-000000900601',
  '{"status":{"to":"192.168.0.1"}}'::jsonb
);
SELECT pg_temp.expect_record_rejected(
  'changed_fields rejects geolocation key',
  '00000000-0000-0000-0000-000000900001',
  '00000000-0000-0000-0000-000000900601',
  '{"geolocation":{"to":"near center"}}'::jsonb
);
SELECT pg_temp.expect_record_rejected(
  'changed_fields rejects document key',
  '00000000-0000-0000-0000-000000900001',
  '00000000-0000-0000-0000-000000900601',
  '{"document_id":{"to":"00000000-0000-0000-0000-000000000001"}}'::jsonb
);
SELECT pg_temp.expect_record_rejected(
  'changed_fields rejects salary key',
  '00000000-0000-0000-0000-000000900001',
  '00000000-0000-0000-0000-000000900601',
  '{"salary":{"to":1000}}'::jsonb
);
SELECT pg_temp.expect_record_rejected(
  'changed_fields rejects payroll value',
  '00000000-0000-0000-0000-000000900001',
  '00000000-0000-0000-0000-000000900601',
  '{"status":{"to":"payroll adjustment"}}'::jsonb
);
SELECT pg_temp.expect_record_rejected(
  'changed_fields rejects long payload',
  '00000000-0000-0000-0000-000000900001',
  '00000000-0000-0000-0000-000000900601',
  jsonb_build_object('notes', jsonb_build_object('to', repeat('x', 129)))
);

SELECT pg_temp.expect_purge_rejected();

RESET ROLE;

INSERT INTO public.operational_audit_events (
  id,
  organization_id,
  actor_user_id,
  actor_membership_id,
  actor_person_profile_id,
  entity_type,
  entity_id,
  action,
  result,
  changed_fields,
  created_at,
  retain_until
)
VALUES (
  '00000000-0000-0000-0000-000000900990',
  '00000000-0000-0000-0000-000000900001',
  '00000000-0000-0000-0000-000000900101',
  '00000000-0000-0000-0000-000000900201',
  '00000000-0000-0000-0000-000000900401',
  'schedule_blocks',
  '00000000-0000-0000-0000-000000900601',
  'updated',
  'success',
  '{"status":{"to":"changed"}}'::jsonb,
  now() - interval '16 days',
  now() - interval '1 day'
);

SELECT pg_temp.assert_true(
  public.purge_expired_operational_audit_events(100) = 1,
  'purge deletes exactly one expired operational audit event'
);
SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1
    FROM public.operational_audit_events
    WHERE id = '00000000-0000-0000-0000-000000900990'
  ),
  'purge removed expired operational audit event'
);
SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM public.operational_audit_events
    WHERE entity_id = '00000000-0000-0000-0000-000000900601'
      AND retain_until > now()
  ),
  'purge keeps retained operational audit events'
);

ROLLBACK;
