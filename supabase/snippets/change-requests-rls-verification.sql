-- BoxOps - I.4 change requests RLS/RPC verification
--
-- Run locally with:
--   Get-Content -Raw supabase/snippets/change-requests-rls-verification.sql | docker exec -i supabase_db_boxops psql -U postgres -d postgres -v ON_ERROR_STOP=1
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
    RAISE EXCEPTION 'change requests verification failed: %', label;
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
    '00000000-0000-0000-0000-000000928101',
    'authenticated',
    'authenticated',
    'change-owner-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Change Owner A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000928102',
    'authenticated',
    'authenticated',
    'change-admin-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Change Admin A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000928103',
    'authenticated',
    'authenticated',
    'change-manager-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Change Manager A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000928104',
    'authenticated',
    'authenticated',
    'change-requester-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Change Requester A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000928105',
    'authenticated',
    'authenticated',
    'change-target-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Change Target A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000928106',
    'authenticated',
    'authenticated',
    'change-other-coach-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Change Other Coach A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000928107',
    'authenticated',
    'authenticated',
    'change-staff-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Change Staff A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000928108',
    'authenticated',
    'authenticated',
    'change-owner-b@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Change Owner B"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000928109',
    'authenticated',
    'authenticated',
    'change-coach-b@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Change Coach B"}'::jsonb
  );

INSERT INTO public.organizations (
  id,
  name,
  slug,
  status,
  timezone
)
VALUES
  (
    '00000000-0000-0000-0000-000000928001',
    'Change Verification A',
    'change-verification-a',
    'active',
    'Europe/Madrid'
  ),
  (
    '00000000-0000-0000-0000-000000928002',
    'Change Verification B',
    'change-verification-b',
    'active',
    'Europe/Madrid'
  );

INSERT INTO public.centers (
  id,
  organization_id,
  name,
  slug,
  timezone,
  status
)
VALUES
  (
    '00000000-0000-0000-0000-000000928301',
    '00000000-0000-0000-0000-000000928001',
    'Change Center A',
    'change-center-a',
    'Europe/Madrid',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000928302',
    '00000000-0000-0000-0000-000000928002',
    'Change Center B',
    'change-center-b',
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
    '00000000-0000-0000-0000-000000928201',
    '00000000-0000-0000-0000-000000928001',
    '00000000-0000-0000-0000-000000928101',
    'owner',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000928202',
    '00000000-0000-0000-0000-000000928001',
    '00000000-0000-0000-0000-000000928102',
    'admin',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000928203',
    '00000000-0000-0000-0000-000000928001',
    '00000000-0000-0000-0000-000000928103',
    'manager',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000928204',
    '00000000-0000-0000-0000-000000928001',
    '00000000-0000-0000-0000-000000928104',
    'coach',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000928205',
    '00000000-0000-0000-0000-000000928001',
    '00000000-0000-0000-0000-000000928105',
    'coach',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000928206',
    '00000000-0000-0000-0000-000000928001',
    '00000000-0000-0000-0000-000000928106',
    'coach',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000928207',
    '00000000-0000-0000-0000-000000928001',
    '00000000-0000-0000-0000-000000928107',
    'staff',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000928208',
    '00000000-0000-0000-0000-000000928002',
    '00000000-0000-0000-0000-000000928108',
    'owner',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000928209',
    '00000000-0000-0000-0000-000000928002',
    '00000000-0000-0000-0000-000000928109',
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
    '00000000-0000-0000-0000-000000928401',
    '00000000-0000-0000-0000-000000928001',
    '00000000-0000-0000-0000-000000928101',
    'Change Owner A',
    'Change Owner A',
    'visible',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000928402',
    '00000000-0000-0000-0000-000000928001',
    '00000000-0000-0000-0000-000000928102',
    'Change Admin A',
    'Change Admin A',
    'visible',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000928403',
    '00000000-0000-0000-0000-000000928001',
    '00000000-0000-0000-0000-000000928103',
    'Change Manager A',
    'Change Manager A',
    'visible',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000928404',
    '00000000-0000-0000-0000-000000928001',
    '00000000-0000-0000-0000-000000928104',
    'Change Requester A',
    'Change Requester A',
    'visible',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000928405',
    '00000000-0000-0000-0000-000000928001',
    '00000000-0000-0000-0000-000000928105',
    'Change Target A',
    'Change Target A',
    'visible',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000928406',
    '00000000-0000-0000-0000-000000928001',
    '00000000-0000-0000-0000-000000928106',
    'Change Other Coach A',
    'Change Other Coach A',
    'visible',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000928407',
    '00000000-0000-0000-0000-000000928001',
    '00000000-0000-0000-0000-000000928107',
    'Change Staff A',
    'Change Staff A',
    'visible',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000928408',
    '00000000-0000-0000-0000-000000928002',
    '00000000-0000-0000-0000-000000928108',
    'Change Owner B',
    'Change Owner B',
    'visible',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000928409',
    '00000000-0000-0000-0000-000000928002',
    '00000000-0000-0000-0000-000000928109',
    'Change Coach B',
    'Change Coach B',
    'visible',
    'active'
  );

INSERT INTO public.coach_profiles (
  id,
  organization_id,
  user_id,
  person_profile_id,
  primary_center_id,
  status
)
VALUES
  (
    '00000000-0000-0000-0000-000000928501',
    '00000000-0000-0000-0000-000000928001',
    '00000000-0000-0000-0000-000000928104',
    '00000000-0000-0000-0000-000000928404',
    '00000000-0000-0000-0000-000000928301',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000928502',
    '00000000-0000-0000-0000-000000928001',
    '00000000-0000-0000-0000-000000928105',
    '00000000-0000-0000-0000-000000928405',
    '00000000-0000-0000-0000-000000928301',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000928503',
    '00000000-0000-0000-0000-000000928001',
    '00000000-0000-0000-0000-000000928106',
    '00000000-0000-0000-0000-000000928406',
    '00000000-0000-0000-0000-000000928301',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000928504',
    '00000000-0000-0000-0000-000000928002',
    '00000000-0000-0000-0000-000000928109',
    '00000000-0000-0000-0000-000000928409',
    '00000000-0000-0000-0000-000000928302',
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
    '00000000-0000-0000-0000-000000928701',
    '00000000-0000-0000-0000-000000928001',
    'Change Class A',
    'change-class-a',
    'class',
    1,
    false,
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000928702',
    '00000000-0000-0000-0000-000000928002',
    'Change Class B',
    'change-class-b',
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
    '00000000-0000-0000-0000-000000928601',
    '00000000-0000-0000-0000-000000928001',
    '00000000-0000-0000-0000-000000928301',
    '2026-05-20',
    '09:00',
    '10:00',
    '00000000-0000-0000-0000-000000928701',
    1,
    'scheduled',
    'Change positive apply block'
  ),
  (
    '00000000-0000-0000-0000-000000928602',
    '00000000-0000-0000-0000-000000928001',
    '00000000-0000-0000-0000-000000928301',
    '2026-05-20',
    '11:00',
    '12:00',
    '00000000-0000-0000-0000-000000928701',
    1,
    'scheduled',
    'Change requester cancellation block'
  ),
  (
    '00000000-0000-0000-0000-000000928603',
    '00000000-0000-0000-0000-000000928001',
    '00000000-0000-0000-0000-000000928301',
    '2026-05-20',
    '12:30',
    '13:30',
    '00000000-0000-0000-0000-000000928701',
    1,
    'scheduled',
    'Change admin rejection block'
  ),
  (
    '00000000-0000-0000-0000-000000928604',
    '00000000-0000-0000-0000-000000928001',
    '00000000-0000-0000-0000-000000928301',
    '2026-05-21',
    '09:00',
    '10:00',
    '00000000-0000-0000-0000-000000928701',
    1,
    'cancelled',
    'Change cancelled block'
  ),
  (
    '00000000-0000-0000-0000-000000928605',
    '00000000-0000-0000-0000-000000928001',
    '00000000-0000-0000-0000-000000928301',
    '2026-05-21',
    '11:00',
    '12:00',
    '00000000-0000-0000-0000-000000928701',
    1,
    'completed',
    'Change completed block'
  ),
  (
    '00000000-0000-0000-0000-000000928606',
    '00000000-0000-0000-0000-000000928001',
    '00000000-0000-0000-0000-000000928301',
    '2026-05-22',
    '09:00',
    '10:00',
    '00000000-0000-0000-0000-000000928701',
    1,
    'scheduled',
    'Change not approved apply block'
  ),
  (
    '00000000-0000-0000-0000-000000928607',
    '00000000-0000-0000-0000-000000928001',
    '00000000-0000-0000-0000-000000928301',
    '2026-05-22',
    '11:00',
    '12:00',
    '00000000-0000-0000-0000-000000928701',
    1,
    'scheduled',
    'Change double acceptance block'
  ),
  (
    '00000000-0000-0000-0000-000000928608',
    '00000000-0000-0000-0000-000000928001',
    '00000000-0000-0000-0000-000000928301',
    '2026-05-23',
    '09:00',
    '10:00',
    '00000000-0000-0000-0000-000000928701',
    1,
    'scheduled',
    'Change expired request block'
  ),
  (
    '00000000-0000-0000-0000-000000928609',
    '00000000-0000-0000-0000-000000928001',
    '00000000-0000-0000-0000-000000928301',
    '2026-05-23',
    '11:00',
    '12:00',
    '00000000-0000-0000-0000-000000928701',
    1,
    'scheduled',
    'Change expired target block'
  ),
  (
    '00000000-0000-0000-0000-000000928610',
    '00000000-0000-0000-0000-000000928001',
    '00000000-0000-0000-0000-000000928301',
    '2026-05-24',
    '09:00',
    '10:00',
    '00000000-0000-0000-0000-000000928701',
    1,
    'scheduled',
    'Change receiver overlap apply block'
  ),
  (
    '00000000-0000-0000-0000-000000928611',
    '00000000-0000-0000-0000-000000928001',
    '00000000-0000-0000-0000-000000928301',
    '2026-05-24',
    '09:30',
    '10:30',
    '00000000-0000-0000-0000-000000928701',
    1,
    'scheduled',
    'Change receiver overlap conflict block'
  ),
  (
    '00000000-0000-0000-0000-000000928612',
    '00000000-0000-0000-0000-000000928002',
    '00000000-0000-0000-0000-000000928302',
    '2026-05-20',
    '09:00',
    '10:00',
    '00000000-0000-0000-0000-000000928702',
    1,
    'scheduled',
    'Change other tenant block'
  ),
  (
    '00000000-0000-0000-0000-000000928613',
    '00000000-0000-0000-0000-000000928001',
    '00000000-0000-0000-0000-000000928301',
    '2026-05-25',
    '09:00',
    '10:00',
    '00000000-0000-0000-0000-000000928701',
    1,
    'scheduled',
    'Change cancelled block blocks offer'
  ),
  (
    '00000000-0000-0000-0000-000000928614',
    '00000000-0000-0000-0000-000000928001',
    '00000000-0000-0000-0000-000000928301',
    '2026-05-25',
    '11:00',
    '12:00',
    '00000000-0000-0000-0000-000000928701',
    1,
    'scheduled',
    'Change completed block blocks acceptance'
  ),
  (
    '00000000-0000-0000-0000-000000928615',
    '00000000-0000-0000-0000-000000928001',
    '00000000-0000-0000-0000-000000928301',
    '2026-05-25',
    '13:00',
    '14:00',
    '00000000-0000-0000-0000-000000928701',
    1,
    'scheduled',
    'Change cancelled block blocks application'
  ),
  (
    '00000000-0000-0000-0000-000000928616',
    '00000000-0000-0000-0000-000000928001',
    '00000000-0000-0000-0000-000000928301',
    '2026-05-26',
    '09:00',
    '10:00',
    '00000000-0000-0000-0000-000000928701',
    1,
    'scheduled',
    'Change atomic managed creation block'
  ),
  (
    '00000000-0000-0000-0000-000000928617',
    '00000000-0000-0000-0000-000000928001',
    '00000000-0000-0000-0000-000000928301',
    '2026-05-26',
    '11:00',
    '12:00',
    '00000000-0000-0000-0000-000000928701',
    1,
    'scheduled',
    'Change atomic own creation block'
  ),
  (
    '00000000-0000-0000-0000-000000928618',
    '00000000-0000-0000-0000-000000928001',
    '00000000-0000-0000-0000-000000928301',
    '2026-05-26',
    '13:00',
    '14:00',
    '00000000-0000-0000-0000-000000928701',
    1,
    'scheduled',
    'Change atomic rollback block'
  );

INSERT INTO public.schedule_block_assignments (
  id,
  organization_id,
  schedule_block_id,
  coach_profile_id,
  assignment_status,
  source
)
VALUES
  (
    '00000000-0000-0000-0000-000000928801',
    '00000000-0000-0000-0000-000000928001',
    '00000000-0000-0000-0000-000000928601',
    '00000000-0000-0000-0000-000000928501',
    'assigned',
    'manual'
  ),
  (
    '00000000-0000-0000-0000-000000928802',
    '00000000-0000-0000-0000-000000928001',
    '00000000-0000-0000-0000-000000928602',
    '00000000-0000-0000-0000-000000928501',
    'assigned',
    'manual'
  ),
  (
    '00000000-0000-0000-0000-000000928803',
    '00000000-0000-0000-0000-000000928001',
    '00000000-0000-0000-0000-000000928603',
    '00000000-0000-0000-0000-000000928501',
    'assigned',
    'manual'
  ),
  (
    '00000000-0000-0000-0000-000000928804',
    '00000000-0000-0000-0000-000000928001',
    '00000000-0000-0000-0000-000000928604',
    '00000000-0000-0000-0000-000000928501',
    'assigned',
    'manual'
  ),
  (
    '00000000-0000-0000-0000-000000928805',
    '00000000-0000-0000-0000-000000928001',
    '00000000-0000-0000-0000-000000928605',
    '00000000-0000-0000-0000-000000928501',
    'assigned',
    'manual'
  ),
  (
    '00000000-0000-0000-0000-000000928806',
    '00000000-0000-0000-0000-000000928001',
    '00000000-0000-0000-0000-000000928606',
    '00000000-0000-0000-0000-000000928501',
    'assigned',
    'manual'
  ),
  (
    '00000000-0000-0000-0000-000000928807',
    '00000000-0000-0000-0000-000000928001',
    '00000000-0000-0000-0000-000000928607',
    '00000000-0000-0000-0000-000000928501',
    'assigned',
    'manual'
  ),
  (
    '00000000-0000-0000-0000-000000928808',
    '00000000-0000-0000-0000-000000928001',
    '00000000-0000-0000-0000-000000928608',
    '00000000-0000-0000-0000-000000928501',
    'assigned',
    'manual'
  ),
  (
    '00000000-0000-0000-0000-000000928809',
    '00000000-0000-0000-0000-000000928001',
    '00000000-0000-0000-0000-000000928609',
    '00000000-0000-0000-0000-000000928501',
    'assigned',
    'manual'
  ),
  (
    '00000000-0000-0000-0000-000000928810',
    '00000000-0000-0000-0000-000000928001',
    '00000000-0000-0000-0000-000000928610',
    '00000000-0000-0000-0000-000000928501',
    'assigned',
    'manual'
  ),
  (
    '00000000-0000-0000-0000-000000928811',
    '00000000-0000-0000-0000-000000928002',
    '00000000-0000-0000-0000-000000928612',
    '00000000-0000-0000-0000-000000928504',
    'assigned',
    'manual'
  ),
  (
    '00000000-0000-0000-0000-000000928813',
    '00000000-0000-0000-0000-000000928001',
    '00000000-0000-0000-0000-000000928613',
    '00000000-0000-0000-0000-000000928501',
    'assigned',
    'manual'
  ),
  (
    '00000000-0000-0000-0000-000000928814',
    '00000000-0000-0000-0000-000000928001',
    '00000000-0000-0000-0000-000000928614',
    '00000000-0000-0000-0000-000000928501',
    'assigned',
    'manual'
  ),
  (
    '00000000-0000-0000-0000-000000928815',
    '00000000-0000-0000-0000-000000928001',
    '00000000-0000-0000-0000-000000928615',
    '00000000-0000-0000-0000-000000928501',
    'assigned',
    'manual'
  ),
  (
    '00000000-0000-0000-0000-000000928816',
    '00000000-0000-0000-0000-000000928001',
    '00000000-0000-0000-0000-000000928616',
    '00000000-0000-0000-0000-000000928501',
    'assigned',
    'manual'
  ),
  (
    '00000000-0000-0000-0000-000000928817',
    '00000000-0000-0000-0000-000000928001',
    '00000000-0000-0000-0000-000000928617',
    '00000000-0000-0000-0000-000000928501',
    'assigned',
    'manual'
  ),
  (
    '00000000-0000-0000-0000-000000928818',
    '00000000-0000-0000-0000-000000928001',
    '00000000-0000-0000-0000-000000928618',
    '00000000-0000-0000-0000-000000928501',
    'assigned',
    'manual'
  );

SET LOCAL ROLE authenticated;

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000928101');
SELECT pg_temp.assert_true(
  public.can_manage_change_requests('00000000-0000-0000-0000-000000928001'),
  'owner can manage change requests'
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000928102');
SELECT pg_temp.assert_true(
  public.can_manage_change_requests('00000000-0000-0000-0000-000000928001'),
  'admin can manage change requests'
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000928103');
SELECT pg_temp.assert_true(
  public.can_manage_change_requests('00000000-0000-0000-0000-000000928001'),
  'manager can manage change requests'
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000928107');
SELECT pg_temp.assert_true(
  NOT public.can_manage_change_requests('00000000-0000-0000-0000-000000928001'),
  'staff cannot manage change requests'
);

SELECT pg_temp.assert_true(
  (
    SELECT bool_and(table_record.relrowsecurity)
    FROM pg_class table_record
    JOIN pg_namespace namespace_record ON namespace_record.oid = table_record.relnamespace
    WHERE namespace_record.nspname = 'public'
      AND table_record.relname IN (
        'change_requests',
        'change_request_targets',
        'change_request_events'
      )
  ),
  'change request workflow tables keep row level security enabled'
);

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM pg_trigger trigger_record
    JOIN pg_class table_record ON table_record.oid = trigger_record.tgrelid
    JOIN pg_namespace namespace_record ON namespace_record.oid = table_record.relnamespace
    WHERE namespace_record.nspname = 'public'
      AND table_record.relname = 'schedule_block_assignments'
      AND trigger_record.tgname = 'schedule_block_assignments_prevent_overlap'
      AND NOT trigger_record.tgisinternal
      AND trigger_record.tgenabled <> 'D'
  ),
  'schedule assignment overlap trigger remains enabled'
);

SELECT pg_temp.assert_true(
  has_function_privilege(
    'authenticated',
    to_regprocedure('public.create_own_change_request_with_targets(uuid,uuid,uuid,uuid[],text,text,timestamp with time zone)'),
    'EXECUTE'
  ),
  'authenticated can execute own atomic creation RPC'
);
SELECT pg_temp.assert_true(
  has_function_privilege(
    'authenticated',
    to_regprocedure('public.create_managed_change_request_with_targets(uuid,uuid,uuid,uuid[],text,text,timestamp with time zone)'),
    'EXECUTE'
  ),
  'authenticated can execute managed atomic creation RPC'
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000928103');
CREATE TEMP TABLE atomic_managed_request AS
SELECT *
FROM public.create_managed_change_request_with_targets(
  '00000000-0000-0000-0000-000000928001',
  '00000000-0000-0000-0000-000000928616',
  '00000000-0000-0000-0000-000000928816',
  ARRAY[
    '00000000-0000-0000-0000-000000928502'::uuid,
    '00000000-0000-0000-0000-000000928503'::uuid
  ],
  'coverage_request',
  'Managed coverage request.',
  now() + interval '7 days'
);

SELECT pg_temp.assert_true(
  (
    SELECT
      status = 'offered'
      AND requester_coach_profile_id = '00000000-0000-0000-0000-000000928501'
    FROM atomic_managed_request
  ),
  'manager can create managed request and offers atomically'
);
SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 2
    FROM public.change_request_targets
    WHERE organization_id = '00000000-0000-0000-0000-000000928001'
      AND change_request_id = (SELECT id FROM atomic_managed_request)
      AND status = 'offered'
  ),
  'managed atomic creation stores all initial targets'
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000928104');
CREATE TEMP TABLE atomic_own_request AS
SELECT *
FROM public.create_own_change_request_with_targets(
  '00000000-0000-0000-0000-000000928001',
  '00000000-0000-0000-0000-000000928617',
  '00000000-0000-0000-0000-000000928817',
  ARRAY['00000000-0000-0000-0000-000000928502'::uuid],
  'coverage_request',
  'Need coverage.',
  now() + interval '7 days'
);

SELECT pg_temp.assert_true(
  (
    SELECT
      status = 'offered'
      AND requester_coach_profile_id = '00000000-0000-0000-0000-000000928501'
    FROM atomic_own_request
  ),
  'requester coach can create own request and offer atomically'
);
SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 1
    FROM public.change_request_targets
    WHERE organization_id = '00000000-0000-0000-0000-000000928001'
      AND change_request_id = (SELECT id FROM atomic_own_request)
      AND target_coach_profile_id = '00000000-0000-0000-0000-000000928502'
  ),
  'own atomic creation stores target in same transaction'
);

SELECT pg_temp.expect_rejected(
  'own atomic creation rolls back when target is requester',
  $statement$
    SELECT *
    FROM public.create_own_change_request_with_targets(
      '00000000-0000-0000-0000-000000928001',
      '00000000-0000-0000-0000-000000928618',
      '00000000-0000-0000-0000-000000928818',
      ARRAY['00000000-0000-0000-0000-000000928501'::uuid],
      'coverage_request',
      NULL,
      now() + interval '7 days'
    )
  $statement$
);
SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1
    FROM public.change_requests
    WHERE organization_id = '00000000-0000-0000-0000-000000928001'
      AND schedule_block_assignment_id = '00000000-0000-0000-0000-000000928818'
  ),
  'failed own atomic creation leaves no partial request'
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000928107');
SELECT pg_temp.expect_rejected(
  'staff cannot use managed atomic creation',
  $statement$
    SELECT *
    FROM public.create_managed_change_request_with_targets(
      '00000000-0000-0000-0000-000000928001',
      '00000000-0000-0000-0000-000000928618',
      '00000000-0000-0000-0000-000000928818',
      ARRAY['00000000-0000-0000-0000-000000928502'::uuid],
      'coverage_request',
      NULL,
      now() + interval '7 days'
    )
  $statement$
);
SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1
    FROM public.change_requests
    WHERE organization_id = '00000000-0000-0000-0000-000000928001'
      AND schedule_block_assignment_id = '00000000-0000-0000-0000-000000928818'
  ),
  'failed managed atomic creation leaves no partial request'
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000928104');

CREATE TEMP TABLE positive_request AS
SELECT *
FROM public.create_own_change_request(
  '00000000-0000-0000-0000-000000928001',
  '00000000-0000-0000-0000-000000928601',
  '00000000-0000-0000-0000-000000928801',
  'coverage_request',
  'Need coverage for this block.',
  now() + interval '7 days'
);

SELECT pg_temp.assert_true(
  (
    SELECT
      organization_id = '00000000-0000-0000-0000-000000928001'
      AND requester_coach_profile_id = '00000000-0000-0000-0000-000000928501'
      AND status = 'pending'
    FROM positive_request
  ),
  'requester coach can create own change request for assigned active block'
);

SELECT pg_temp.expect_rejected(
  'coach cannot create request from cancelled block',
  $statement$
    SELECT *
    FROM public.create_own_change_request(
      '00000000-0000-0000-0000-000000928001',
      '00000000-0000-0000-0000-000000928604',
      '00000000-0000-0000-0000-000000928804',
      'coverage_request',
      NULL,
      NULL
    )
  $statement$
);

SELECT pg_temp.expect_rejected(
  'coach cannot create request from completed block',
  $statement$
    SELECT *
    FROM public.create_own_change_request(
      '00000000-0000-0000-0000-000000928001',
      '00000000-0000-0000-0000-000000928605',
      '00000000-0000-0000-0000-000000928805',
      'coverage_request',
      NULL,
      NULL
    )
  $statement$
);

CREATE TEMP TABLE cancelled_offer_request AS
SELECT *
FROM public.create_own_change_request(
  '00000000-0000-0000-0000-000000928001',
  '00000000-0000-0000-0000-000000928613',
  '00000000-0000-0000-0000-000000928813',
  'coverage_request',
  NULL,
  now() + interval '7 days'
);

RESET ROLE;
UPDATE public.schedule_blocks
SET status = 'cancelled'
WHERE id = '00000000-0000-0000-0000-000000928613'
  AND organization_id = '00000000-0000-0000-0000-000000928001';

SET LOCAL ROLE authenticated;
SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000928104');
SELECT pg_temp.expect_rejected(
  'cancelled block blocks offering a target',
  $statement$
    SELECT public.offer_change_request_to_coach(
      '00000000-0000-0000-0000-000000928001',
      (SELECT id FROM cancelled_offer_request),
      '00000000-0000-0000-0000-000000928502',
      'direct_coach',
      now() + interval '6 days'
    )
  $statement$
);

CREATE TEMP TABLE completed_acceptance_request AS
SELECT *
FROM public.create_own_change_request(
  '00000000-0000-0000-0000-000000928001',
  '00000000-0000-0000-0000-000000928614',
  '00000000-0000-0000-0000-000000928814',
  'coverage_request',
  NULL,
  now() + interval '7 days'
);

SELECT public.offer_change_request_to_coach(
  '00000000-0000-0000-0000-000000928001',
  (SELECT id FROM completed_acceptance_request),
  '00000000-0000-0000-0000-000000928502',
  'direct_coach',
  now() + interval '6 days'
);

RESET ROLE;
UPDATE public.schedule_blocks
SET status = 'completed'
WHERE id = '00000000-0000-0000-0000-000000928614'
  AND organization_id = '00000000-0000-0000-0000-000000928001';

SET LOCAL ROLE authenticated;
SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000928105');
SELECT pg_temp.expect_rejected(
  'completed block blocks target acceptance',
  $statement$
    SELECT public.respond_to_change_request_target(
      '00000000-0000-0000-0000-000000928001',
      (
        SELECT id
        FROM public.change_request_targets
        WHERE change_request_id = (SELECT id FROM completed_acceptance_request)
          AND target_coach_profile_id = '00000000-0000-0000-0000-000000928502'
      ),
      'accepted',
      NULL
    )
  $statement$
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000928104');
CREATE TEMP TABLE cancelled_application_request AS
SELECT *
FROM public.create_own_change_request(
  '00000000-0000-0000-0000-000000928001',
  '00000000-0000-0000-0000-000000928615',
  '00000000-0000-0000-0000-000000928815',
  'coverage_request',
  NULL,
  now() + interval '7 days'
);

SELECT public.offer_change_request_to_coach(
  '00000000-0000-0000-0000-000000928001',
  (SELECT id FROM cancelled_application_request),
  '00000000-0000-0000-0000-000000928502',
  'direct_coach',
  now() + interval '6 days'
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000928105');
SELECT public.respond_to_change_request_target(
  '00000000-0000-0000-0000-000000928001',
  (
    SELECT id
    FROM public.change_request_targets
    WHERE change_request_id = (SELECT id FROM cancelled_application_request)
      AND target_coach_profile_id = '00000000-0000-0000-0000-000000928502'
  ),
  'accepted',
  NULL
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000928101');
SELECT public.approve_change_request(
  '00000000-0000-0000-0000-000000928001',
  (SELECT id FROM cancelled_application_request)
);

RESET ROLE;
UPDATE public.schedule_blocks
SET status = 'cancelled'
WHERE id = '00000000-0000-0000-0000-000000928615'
  AND organization_id = '00000000-0000-0000-0000-000000928001';

SET LOCAL ROLE authenticated;
SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000928103');
SELECT public.apply_approved_change_request(
  '00000000-0000-0000-0000-000000928001',
  (SELECT id FROM cancelled_application_request)
);

SELECT pg_temp.assert_true(
  (
    SELECT status = 'approved'
    FROM public.change_requests
    WHERE id = (SELECT id FROM cancelled_application_request)
      AND organization_id = '00000000-0000-0000-0000-000000928001'
  ),
  'cancelled block does not mark approved request applied'
);

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM public.change_request_events
    WHERE organization_id = '00000000-0000-0000-0000-000000928001'
      AND change_request_id = (SELECT id FROM cancelled_application_request)
      AND event_type = 'application_failed'
      AND changed_fields ->> 'failure_code' = 'schedule-block-not-actionable'
  ),
  'cancelled block application records schedule-block-not-actionable failure'
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000928104');

CREATE TEMP TABLE cancel_request AS
SELECT *
FROM public.create_own_change_request(
  '00000000-0000-0000-0000-000000928001',
  '00000000-0000-0000-0000-000000928602',
  '00000000-0000-0000-0000-000000928802',
  'coverage_request',
  NULL,
  now() + interval '7 days'
);

SELECT public.cancel_change_request(
  '00000000-0000-0000-0000-000000928001',
  (SELECT id FROM cancel_request)
);

SELECT pg_temp.assert_true(
  (
    SELECT status = 'cancelled'
    FROM public.change_requests
    WHERE id = (SELECT id FROM cancel_request)
      AND organization_id = '00000000-0000-0000-0000-000000928001'
  ),
  'requester coach can cancel own open request'
);

SELECT public.offer_change_request_to_coach(
  '00000000-0000-0000-0000-000000928001',
  (SELECT id FROM positive_request),
  '00000000-0000-0000-0000-000000928502',
  'direct_coach',
  now() + interval '6 days'
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000928106');
SELECT pg_temp.expect_rejected(
  'non-candidate coach cannot respond to another coach target',
  $statement$
    SELECT public.respond_to_change_request_target(
      '00000000-0000-0000-0000-000000928001',
      (
        SELECT id
        FROM public.change_request_targets
        WHERE change_request_id = (SELECT id FROM positive_request)
          AND target_coach_profile_id = '00000000-0000-0000-0000-000000928502'
      ),
      'accepted',
      NULL
    )
  $statement$
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000928105');
SELECT public.respond_to_change_request_target(
  '00000000-0000-0000-0000-000000928001',
  (
    SELECT id
    FROM public.change_request_targets
    WHERE change_request_id = (SELECT id FROM positive_request)
      AND target_coach_profile_id = '00000000-0000-0000-0000-000000928502'
  ),
  'accepted',
  'I can cover it.'
);

SELECT pg_temp.assert_true(
  (
    SELECT
      request.status = 'pending_approval'
      AND target.status = 'accepted'
    FROM public.change_requests request
    JOIN public.change_request_targets target
      ON target.id = request.accepted_target_id
     AND target.organization_id = request.organization_id
    WHERE request.id = (SELECT id FROM positive_request)
      AND request.organization_id = '00000000-0000-0000-0000-000000928001'
  ),
  'target coach can accept own target and request moves to pending approval'
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000928107');
SELECT pg_temp.expect_rejected(
  'staff cannot approve change request',
  $statement$
    SELECT public.approve_change_request(
      '00000000-0000-0000-0000-000000928001',
      (SELECT id FROM positive_request)
    )
  $statement$
);
SELECT pg_temp.expect_rejected(
  'staff cannot reject change request',
  $statement$
    SELECT public.reject_change_request(
      '00000000-0000-0000-0000-000000928001',
      (SELECT id FROM positive_request)
    )
  $statement$
);
SELECT pg_temp.expect_rejected(
  'staff cannot apply change request',
  $statement$
    SELECT public.apply_approved_change_request(
      '00000000-0000-0000-0000-000000928001',
      (SELECT id FROM positive_request)
    )
  $statement$
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000928101');
SELECT public.approve_change_request(
  '00000000-0000-0000-0000-000000928001',
  (SELECT id FROM positive_request)
);

SELECT pg_temp.assert_true(
  (
    SELECT status = 'approved'
    FROM public.change_requests
    WHERE id = (SELECT id FROM positive_request)
      AND organization_id = '00000000-0000-0000-0000-000000928001'
  ),
  'owner can approve accepted tenant request'
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000928104');
SELECT pg_temp.expect_rejected(
  'requester cannot cancel an approved request',
  $statement$
    SELECT public.cancel_change_request(
      '00000000-0000-0000-0000-000000928001',
      (SELECT id FROM positive_request)
    )
  $statement$
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000928103');
SELECT public.apply_approved_change_request(
  '00000000-0000-0000-0000-000000928001',
  (SELECT id FROM positive_request)
);

SELECT pg_temp.assert_true(
  (
    SELECT
      request.status = 'applied'
      AND request.applied_schedule_block_assignment_id IS NOT NULL
      AND destination.assignment_status = 'assigned'
      AND destination.source = 'change_request'
      AND source_assignment.assignment_status = 'removed'
    FROM public.change_requests request
    JOIN public.schedule_block_assignments destination
      ON destination.id = request.applied_schedule_block_assignment_id
     AND destination.organization_id = request.organization_id
    JOIN public.schedule_block_assignments source_assignment
      ON source_assignment.id = request.schedule_block_assignment_id
     AND source_assignment.organization_id = request.organization_id
    WHERE request.id = (SELECT id FROM positive_request)
      AND request.organization_id = '00000000-0000-0000-0000-000000928001'
  ),
  'manager can apply approved request and real schedule assignment changes transactionally'
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000928104');
CREATE TEMP TABLE rejection_request AS
SELECT *
FROM public.create_own_change_request(
  '00000000-0000-0000-0000-000000928001',
  '00000000-0000-0000-0000-000000928603',
  '00000000-0000-0000-0000-000000928803',
  'coverage_request',
  NULL,
  now() + interval '7 days'
);

SELECT public.offer_change_request_to_coach(
  '00000000-0000-0000-0000-000000928001',
  (SELECT id FROM rejection_request),
  '00000000-0000-0000-0000-000000928502',
  'direct_coach',
  now() + interval '6 days'
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000928105');
SELECT public.respond_to_change_request_target(
  '00000000-0000-0000-0000-000000928001',
  (
    SELECT id
    FROM public.change_request_targets
    WHERE change_request_id = (SELECT id FROM rejection_request)
      AND target_coach_profile_id = '00000000-0000-0000-0000-000000928502'
  ),
  'accepted',
  NULL
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000928102');
SELECT public.reject_change_request(
  '00000000-0000-0000-0000-000000928001',
  (SELECT id FROM rejection_request)
);

SELECT pg_temp.assert_true(
  (
    SELECT status = 'rejected'
    FROM public.change_requests
    WHERE id = (SELECT id FROM rejection_request)
      AND organization_id = '00000000-0000-0000-0000-000000928001'
  ),
  'admin can reject tenant request'
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000928108');
SELECT pg_temp.assert_true(
  (SELECT count(*) FROM public.change_requests WHERE organization_id = '00000000-0000-0000-0000-000000928001') = 0,
  'other tenant owner cannot read tenant A change requests'
);
SELECT pg_temp.assert_true(
  (SELECT count(*) FROM public.change_request_targets WHERE organization_id = '00000000-0000-0000-0000-000000928001') = 0,
  'other tenant owner cannot read tenant A change request targets'
);
SELECT pg_temp.assert_true(
  (SELECT count(*) FROM public.change_request_events WHERE organization_id = '00000000-0000-0000-0000-000000928001') = 0,
  'other tenant owner cannot read tenant A change request events'
);
SELECT pg_temp.expect_rejected(
  'other tenant owner cannot approve tenant A request',
  $statement$
    SELECT public.approve_change_request(
      '00000000-0000-0000-0000-000000928001',
      (SELECT id FROM positive_request)
    )
  $statement$
);
SELECT pg_temp.expect_rejected(
  'other tenant owner cannot record tenant A change failure',
  $statement$
    SELECT public.record_change_request_event(
      '00000000-0000-0000-0000-000000928001',
      (SELECT id FROM positive_request),
      'application_failed',
      'denied',
      '{"failure_code":"tenant-denied"}'::jsonb,
      NULL
    )
  $statement$
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000928104');
CREATE TEMP TABLE not_approved_request AS
SELECT *
FROM public.create_own_change_request(
  '00000000-0000-0000-0000-000000928001',
  '00000000-0000-0000-0000-000000928606',
  '00000000-0000-0000-0000-000000928806',
  'coverage_request',
  NULL,
  now() + interval '7 days'
);

SELECT public.offer_change_request_to_coach(
  '00000000-0000-0000-0000-000000928001',
  (SELECT id FROM not_approved_request),
  '00000000-0000-0000-0000-000000928502',
  'direct_coach',
  now() + interval '6 days'
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000928105');
SELECT public.respond_to_change_request_target(
  '00000000-0000-0000-0000-000000928001',
  (
    SELECT id
    FROM public.change_request_targets
    WHERE change_request_id = (SELECT id FROM not_approved_request)
      AND target_coach_profile_id = '00000000-0000-0000-0000-000000928502'
  ),
  'accepted',
  NULL
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000928103');
SELECT public.apply_approved_change_request(
  '00000000-0000-0000-0000-000000928001',
  (SELECT id FROM not_approved_request)
);

SELECT pg_temp.assert_true(
  (
    SELECT status = 'pending_approval'
    FROM public.change_requests
    WHERE id = (SELECT id FROM not_approved_request)
      AND organization_id = '00000000-0000-0000-0000-000000928001'
  ),
  'application without approved status does not mark request applied'
);
SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM public.change_request_events
    WHERE organization_id = '00000000-0000-0000-0000-000000928001'
      AND change_request_id = (SELECT id FROM not_approved_request)
      AND event_type = 'application_failed'
      AND result = 'failed'
      AND changed_fields ->> 'failure_code' = 'request-not-approved'
  ),
  'application without approved status records a minimized failure'
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000928104');
CREATE TEMP TABLE double_accept_request AS
SELECT *
FROM public.create_own_change_request(
  '00000000-0000-0000-0000-000000928001',
  '00000000-0000-0000-0000-000000928607',
  '00000000-0000-0000-0000-000000928807',
  'coverage_request',
  NULL,
  now() + interval '7 days'
);

SELECT public.offer_change_request_to_coach(
  '00000000-0000-0000-0000-000000928001',
  (SELECT id FROM double_accept_request),
  '00000000-0000-0000-0000-000000928502',
  'direct_coach',
  now() + interval '6 days'
);
SELECT public.offer_change_request_to_coach(
  '00000000-0000-0000-0000-000000928001',
  (SELECT id FROM double_accept_request),
  '00000000-0000-0000-0000-000000928503',
  'suggested_candidate',
  now() + interval '6 days'
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000928105');
SELECT public.respond_to_change_request_target(
  '00000000-0000-0000-0000-000000928001',
  (
    SELECT id
    FROM public.change_request_targets
    WHERE change_request_id = (SELECT id FROM double_accept_request)
      AND target_coach_profile_id = '00000000-0000-0000-0000-000000928502'
  ),
  'accepted',
  NULL
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000928106');
SELECT pg_temp.expect_rejected(
  'second target cannot accept after first acceptance withdrew open targets',
  $statement$
    SELECT public.respond_to_change_request_target(
      '00000000-0000-0000-0000-000000928001',
      (
        SELECT id
        FROM public.change_request_targets
        WHERE change_request_id = (SELECT id FROM double_accept_request)
          AND target_coach_profile_id = '00000000-0000-0000-0000-000000928503'
      ),
      'accepted',
      NULL
    )
  $statement$
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*) FILTER (WHERE status = 'accepted') = 1
      AND count(*) FILTER (WHERE status = 'withdrawn') = 1
    FROM public.change_request_targets
    WHERE organization_id = '00000000-0000-0000-0000-000000928001'
      AND change_request_id = (SELECT id FROM double_accept_request)
  ),
  'double acceptance leaves exactly one accepted target and withdraws the other'
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000928104');
CREATE TEMP TABLE expired_request AS
SELECT *
FROM public.create_own_change_request(
  '00000000-0000-0000-0000-000000928001',
  '00000000-0000-0000-0000-000000928608',
  '00000000-0000-0000-0000-000000928808',
  'coverage_request',
  NULL,
  now() + interval '7 days'
);
SELECT public.offer_change_request_to_coach(
  '00000000-0000-0000-0000-000000928001',
  (SELECT id FROM expired_request),
  '00000000-0000-0000-0000-000000928502',
  'direct_coach',
  now() + interval '6 days'
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000928105');
SELECT public.respond_to_change_request_target(
  '00000000-0000-0000-0000-000000928001',
  (
    SELECT id
    FROM public.change_request_targets
    WHERE change_request_id = (SELECT id FROM expired_request)
      AND target_coach_profile_id = '00000000-0000-0000-0000-000000928502'
  ),
  'accepted',
  NULL
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000928101');
SELECT public.approve_change_request(
  '00000000-0000-0000-0000-000000928001',
  (SELECT id FROM expired_request)
);

RESET ROLE;
UPDATE public.change_requests
SET
  created_at = now() - interval '2 days',
  expires_at = now() - interval '1 day'
WHERE id = (SELECT id FROM expired_request)
  AND organization_id = '00000000-0000-0000-0000-000000928001';

SET LOCAL ROLE authenticated;
SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000928103');
SELECT public.apply_approved_change_request(
  '00000000-0000-0000-0000-000000928001',
  (SELECT id FROM expired_request)
);
SELECT pg_temp.assert_true(
  (
    SELECT status = 'approved'
    FROM public.change_requests
    WHERE id = (SELECT id FROM expired_request)
      AND organization_id = '00000000-0000-0000-0000-000000928001'
  ),
  'expired approved request cannot be applied'
);
SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM public.change_request_events
    WHERE organization_id = '00000000-0000-0000-0000-000000928001'
      AND change_request_id = (SELECT id FROM expired_request)
      AND event_type = 'application_failed'
      AND changed_fields ->> 'failure_code' = 'request-expired'
  ),
  'expired approved request records request-expired failure'
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000928104');
CREATE TEMP TABLE expired_target_request AS
SELECT *
FROM public.create_own_change_request(
  '00000000-0000-0000-0000-000000928001',
  '00000000-0000-0000-0000-000000928609',
  '00000000-0000-0000-0000-000000928809',
  'coverage_request',
  NULL,
  now() + interval '7 days'
);
SELECT public.offer_change_request_to_coach(
  '00000000-0000-0000-0000-000000928001',
  (SELECT id FROM expired_target_request),
  '00000000-0000-0000-0000-000000928502',
  'direct_coach',
  now() + interval '6 days'
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000928105');
SELECT public.respond_to_change_request_target(
  '00000000-0000-0000-0000-000000928001',
  (
    SELECT id
    FROM public.change_request_targets
    WHERE change_request_id = (SELECT id FROM expired_target_request)
      AND target_coach_profile_id = '00000000-0000-0000-0000-000000928502'
  ),
  'accepted',
  NULL
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000928101');
SELECT public.approve_change_request(
  '00000000-0000-0000-0000-000000928001',
  (SELECT id FROM expired_target_request)
);

RESET ROLE;
UPDATE public.change_request_targets
SET
  offered_at = now() - interval '2 days',
  responded_at = now() - interval '1 day',
  expires_at = now() - interval '1 day'
WHERE change_request_id = (SELECT id FROM expired_target_request)
  AND organization_id = '00000000-0000-0000-0000-000000928001'
  AND target_coach_profile_id = '00000000-0000-0000-0000-000000928502';

SET LOCAL ROLE authenticated;
SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000928103');
SELECT public.apply_approved_change_request(
  '00000000-0000-0000-0000-000000928001',
  (SELECT id FROM expired_target_request)
);
SELECT pg_temp.assert_true(
  (
    SELECT status = 'approved'
    FROM public.change_requests
    WHERE id = (SELECT id FROM expired_target_request)
      AND organization_id = '00000000-0000-0000-0000-000000928001'
  ),
  'expired accepted target cannot be applied'
);
SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM public.change_request_events
    WHERE organization_id = '00000000-0000-0000-0000-000000928001'
      AND change_request_id = (SELECT id FROM expired_target_request)
      AND event_type = 'application_failed'
      AND changed_fields ->> 'failure_code' = 'target-expired'
  ),
  'expired accepted target records target-expired failure'
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000928104');
CREATE TEMP TABLE overlap_request AS
SELECT *
FROM public.create_own_change_request(
  '00000000-0000-0000-0000-000000928001',
  '00000000-0000-0000-0000-000000928610',
  '00000000-0000-0000-0000-000000928810',
  'coverage_request',
  NULL,
  now() + interval '7 days'
);
SELECT public.offer_change_request_to_coach(
  '00000000-0000-0000-0000-000000928001',
  (SELECT id FROM overlap_request),
  '00000000-0000-0000-0000-000000928502',
  'direct_coach',
  now() + interval '6 days'
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000928105');
SELECT public.respond_to_change_request_target(
  '00000000-0000-0000-0000-000000928001',
  (
    SELECT id
    FROM public.change_request_targets
    WHERE change_request_id = (SELECT id FROM overlap_request)
      AND target_coach_profile_id = '00000000-0000-0000-0000-000000928502'
  ),
  'accepted',
  NULL
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000928101');
SELECT public.approve_change_request(
  '00000000-0000-0000-0000-000000928001',
  (SELECT id FROM overlap_request)
);

RESET ROLE;
INSERT INTO public.schedule_block_assignments (
  id,
  organization_id,
  schedule_block_id,
  coach_profile_id,
  assignment_status,
  source
)
VALUES (
  '00000000-0000-0000-0000-000000928812',
  '00000000-0000-0000-0000-000000928001',
  '00000000-0000-0000-0000-000000928611',
  '00000000-0000-0000-0000-000000928502',
  'assigned',
  'manual'
);

SET LOCAL ROLE authenticated;
SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000928103');
SELECT public.apply_approved_change_request(
  '00000000-0000-0000-0000-000000928001',
  (SELECT id FROM overlap_request)
);

SELECT pg_temp.assert_true(
  (
    SELECT status = 'approved'
    FROM public.change_requests
    WHERE id = (SELECT id FROM overlap_request)
      AND organization_id = '00000000-0000-0000-0000-000000928001'
  ),
  'receiver overlap does not mark request applied'
);
SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1
    FROM public.schedule_block_assignments
    WHERE organization_id = '00000000-0000-0000-0000-000000928001'
      AND schedule_block_id = '00000000-0000-0000-0000-000000928610'
      AND coach_profile_id = '00000000-0000-0000-0000-000000928502'
      AND assignment_status = 'assigned'
  ),
  'receiver overlap does not create a real assigned destination'
);
SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM public.change_request_events
    WHERE organization_id = '00000000-0000-0000-0000-000000928001'
      AND change_request_id = (SELECT id FROM overlap_request)
      AND event_type = 'application_failed'
      AND changed_fields ->> 'failure_code' = 'coach-unavailable'
  ),
  'receiver overlap records coach-unavailable failure'
);

SELECT pg_temp.expect_rejected(
  'Postgres guardrail still rejects direct overlapping assigned insert',
  $statement$
    INSERT INTO public.schedule_block_assignments (
      id,
      organization_id,
      schedule_block_id,
      coach_profile_id,
      assignment_status,
      source
    )
    VALUES (
      '00000000-0000-0000-0000-000000928899',
      '00000000-0000-0000-0000-000000928001',
      '00000000-0000-0000-0000-000000928610',
      '00000000-0000-0000-0000-000000928502',
      'assigned',
      'manual'
    )
  $statement$
);

SELECT pg_temp.expect_rejected(
  'direct insert on change_requests is blocked for authenticated',
  $statement$
    INSERT INTO public.change_requests (
      organization_id,
      requester_membership_id,
      requester_person_profile_id,
      requester_coach_profile_id,
      schedule_block_id,
      schedule_block_assignment_id,
      request_type,
      status
    )
    VALUES (
      '00000000-0000-0000-0000-000000928001',
      '00000000-0000-0000-0000-000000928204',
      '00000000-0000-0000-0000-000000928404',
      '00000000-0000-0000-0000-000000928501',
      '00000000-0000-0000-0000-000000928602',
      '00000000-0000-0000-0000-000000928802',
      'coverage_request',
      'pending'
    )
  $statement$
);
UPDATE public.change_requests
SET status = 'cancelled'
WHERE id = (SELECT id FROM overlap_request)
  AND organization_id = '00000000-0000-0000-0000-000000928001';

SELECT pg_temp.assert_true(
  (
    SELECT status = 'approved'
    FROM public.change_requests
    WHERE id = (SELECT id FROM overlap_request)
      AND organization_id = '00000000-0000-0000-0000-000000928001'
  ),
  'direct update on change_requests has no effect for authenticated'
);
SELECT pg_temp.expect_rejected(
  'direct insert on change_request_targets is blocked for authenticated',
  $statement$
    INSERT INTO public.change_request_targets (
      organization_id,
      change_request_id,
      target_coach_profile_id,
      target_type,
      status
    )
    VALUES (
      '00000000-0000-0000-0000-000000928001',
      (SELECT id FROM overlap_request),
      '00000000-0000-0000-0000-000000928503',
      'direct_coach',
      'offered'
    )
  $statement$
);
UPDATE public.change_request_targets
SET status = 'rejected'
WHERE change_request_id = (SELECT id FROM overlap_request)
  AND organization_id = '00000000-0000-0000-0000-000000928001';

SELECT pg_temp.assert_true(
  (
    SELECT count(*) FILTER (WHERE status = 'accepted') = 1
      AND count(*) FILTER (WHERE status = 'rejected') = 0
    FROM public.change_request_targets
    WHERE change_request_id = (SELECT id FROM overlap_request)
      AND organization_id = '00000000-0000-0000-0000-000000928001'
  ),
  'direct update on change_request_targets has no effect for authenticated'
);
SELECT pg_temp.expect_rejected(
  'direct insert on change_request_events is blocked for authenticated',
  $statement$
    INSERT INTO public.change_request_events (
      organization_id,
      change_request_id,
      actor_user_id,
      actor_membership_id,
      event_type,
      result,
      changed_fields,
      retain_until
    )
    VALUES (
      '00000000-0000-0000-0000-000000928001',
      (SELECT id FROM overlap_request),
      '00000000-0000-0000-0000-000000928103',
      '00000000-0000-0000-0000-000000928203',
      'request_applied',
      'success',
      '{}'::jsonb,
      now() + interval '90 days'
    )
  $statement$
);
CREATE TEMP TABLE change_request_event_count_before_direct_delete AS
SELECT count(*) AS event_count
FROM public.change_request_events
WHERE organization_id = '00000000-0000-0000-0000-000000928001'
  AND change_request_id = (SELECT id FROM overlap_request);

DELETE FROM public.change_request_events
WHERE organization_id = '00000000-0000-0000-0000-000000928001'
  AND change_request_id = (SELECT id FROM overlap_request);

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = (
      SELECT event_count
      FROM change_request_event_count_before_direct_delete
    )
    FROM public.change_request_events
    WHERE organization_id = '00000000-0000-0000-0000-000000928001'
      AND change_request_id = (SELECT id FROM overlap_request)
  ),
  'direct delete on change_request_events has no effect for authenticated'
);

RESET ROLE;

ROLLBACK;
