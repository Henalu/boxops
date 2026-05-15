-- BoxOps - F.12 weekly time closure verification
--
-- Run locally with:
--   Get-Content -Raw supabase/snippets/time-weekly-closure-verification.sql | docker exec -i supabase_db_boxops psql -U postgres -d postgres -v ON_ERROR_STOP=1
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
    RAISE EXCEPTION 'weekly closure verification failed: %', label;
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
    '00000000-0000-0000-0000-000000926101',
    'authenticated',
    'authenticated',
    'weekly-close-manager@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Weekly Close Manager"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000926102',
    'authenticated',
    'authenticated',
    'weekly-close-coach@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Weekly Close Coach"}'::jsonb
  );

INSERT INTO public.organizations (
  id,
  name,
  slug,
  status,
  timezone,
  time_tracking_config
)
VALUES (
  '00000000-0000-0000-0000-000000926001',
  'Weekly Close Verification',
  'weekly-close-verification',
  'active',
  'Europe/Madrid',
  '{"version":1,"correctionApprovalRequired":false,"scheduleAutoPunchesEnabled":true}'::jsonb
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
    '00000000-0000-0000-0000-000000926201',
    '00000000-0000-0000-0000-000000926001',
    '00000000-0000-0000-0000-000000926101',
    'manager',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000926202',
    '00000000-0000-0000-0000-000000926001',
    '00000000-0000-0000-0000-000000926102',
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
    '00000000-0000-0000-0000-000000926401',
    '00000000-0000-0000-0000-000000926001',
    '00000000-0000-0000-0000-000000926101',
    'Weekly Close Manager',
    'Weekly Close Manager',
    'visible',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000926402',
    '00000000-0000-0000-0000-000000926001',
    '00000000-0000-0000-0000-000000926102',
    'Weekly Close Coach',
    'Weekly Close Coach',
    'visible',
    'active'
  );

INSERT INTO public.centers (
  id,
  organization_id,
  name,
  slug,
  timezone,
  status
)
VALUES (
  '00000000-0000-0000-0000-000000926301',
  '00000000-0000-0000-0000-000000926001',
  'Weekly Close Center',
  'weekly-close-center',
  'Europe/Madrid',
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
VALUES (
  '00000000-0000-0000-0000-000000926501',
  '00000000-0000-0000-0000-000000926001',
  '00000000-0000-0000-0000-000000926102',
  '00000000-0000-0000-0000-000000926402',
  '00000000-0000-0000-0000-000000926301',
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
VALUES (
  '00000000-0000-0000-0000-000000926701',
  '00000000-0000-0000-0000-000000926001',
  'Weekly Close Class',
  'weekly-close-class',
  'class',
  1,
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
VALUES (
  '00000000-0000-0000-0000-000000926601',
  '00000000-0000-0000-0000-000000926001',
  '00000000-0000-0000-0000-000000926301',
  '2026-05-11',
  '09:00',
  '10:00',
  '00000000-0000-0000-0000-000000926701',
  1,
  'scheduled',
  'Weekly close verification block'
);

INSERT INTO public.schedule_block_assignments (
  id,
  organization_id,
  schedule_block_id,
  coach_profile_id,
  assignment_status,
  source
)
VALUES (
  '00000000-0000-0000-0000-000000926801',
  '00000000-0000-0000-0000-000000926001',
  '00000000-0000-0000-0000-000000926601',
  '00000000-0000-0000-0000-000000926501',
  'assigned',
  'manual'
);

CREATE TEMP TABLE weekly_scheduler_run AS
SELECT *
FROM public.submit_due_time_weekly_approvals(
  '2026-05-17 21:59:00+00'::timestamptz,
  '00000000-0000-0000-0000-000000926001'
);

SELECT pg_temp.assert_true(
  (SELECT count(*) FROM weekly_scheduler_run) = 1,
  'scheduler submits the assigned coach week at organization-local Sunday 23:59'
);

SELECT pg_temp.assert_true(
  (
    SELECT status = 'submitted'
    FROM weekly_scheduler_run
    LIMIT 1
  ),
  'scheduler-created weekly approval starts submitted'
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*)
    FROM public.time_weekly_approvals
    WHERE organization_id = '00000000-0000-0000-0000-000000926001'
      AND person_profile_id = '00000000-0000-0000-0000-000000926402'
      AND week_start_date = '2026-05-11'
  ) = 1,
  'weekly submission is idempotent per person and week'
);

SET LOCAL ROLE authenticated;
SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000926101');

SELECT pg_temp.expect_rejected(
  'authenticated app role cannot call scheduler primitive',
  $statement$
    SELECT *
    FROM public.submit_due_time_weekly_approvals(
      '2026-05-17 21:59:00+00'::timestamptz,
      '00000000-0000-0000-0000-000000926001'
    )
  $statement$
);

SELECT pg_temp.expect_rejected(
  'manager cannot approve weekly closure without own signature',
  $statement$
    SELECT public.approve_time_weekly_approval(
      '00000000-0000-0000-0000-000000926001',
      (
        SELECT id
        FROM public.time_weekly_approvals
        WHERE organization_id = '00000000-0000-0000-0000-000000926001'
          AND person_profile_id = '00000000-0000-0000-0000-000000926402'
          AND week_start_date = '2026-05-11'
      ),
      NULL
    )
  $statement$
);

SELECT pg_temp.expect_rejected(
  'weekly rejection requires a note',
  $statement$
    SELECT public.reject_time_weekly_approval(
      '00000000-0000-0000-0000-000000926001',
      (
        SELECT id
        FROM public.time_weekly_approvals
        WHERE organization_id = '00000000-0000-0000-0000-000000926001'
          AND person_profile_id = '00000000-0000-0000-0000-000000926402'
          AND week_start_date = '2026-05-11'
      ),
      '',
      'correction_required'
    )
  $statement$
);

SELECT public.reject_time_weekly_approval(
  '00000000-0000-0000-0000-000000926001',
  (
    SELECT id
    FROM public.time_weekly_approvals
    WHERE organization_id = '00000000-0000-0000-0000-000000926001'
      AND person_profile_id = '00000000-0000-0000-0000-000000926402'
      AND week_start_date = '2026-05-11'
  ),
  'Falta corregir una salida.',
  'correction_required'
);

SELECT pg_temp.assert_true(
  (
    SELECT status = 'correction_required' AND rejection_note = 'Falta corregir una salida.'
    FROM public.time_weekly_approvals
    WHERE organization_id = '00000000-0000-0000-0000-000000926001'
      AND person_profile_id = '00000000-0000-0000-0000-000000926402'
      AND week_start_date = '2026-05-11'
  ),
  'manager rejection stores mandatory correction note'
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000926102');

SELECT public.submit_time_weekly_approval(
  '00000000-0000-0000-0000-000000926001',
  '00000000-0000-0000-0000-000000926402',
  '2026-05-11',
  'resubmission'
);

SELECT pg_temp.assert_true(
  (
    SELECT status = 'resubmitted'
    FROM public.time_weekly_approvals
    WHERE organization_id = '00000000-0000-0000-0000-000000926001'
      AND person_profile_id = '00000000-0000-0000-0000-000000926402'
      AND week_start_date = '2026-05-11'
  ),
  'coach can resubmit own correction-required week'
);

SELECT pg_temp.expect_rejected(
  'coach cannot approve weekly closure',
  $statement$
    SELECT public.approve_time_weekly_approval(
      '00000000-0000-0000-0000-000000926001',
      (
        SELECT id
        FROM public.time_weekly_approvals
        WHERE organization_id = '00000000-0000-0000-0000-000000926001'
          AND person_profile_id = '00000000-0000-0000-0000-000000926402'
          AND week_start_date = '2026-05-11'
      ),
      NULL
    )
  $statement$
);

RESET ROLE;

INSERT INTO public.profile_signatures (
  id,
  organization_id,
  person_profile_id,
  uploaded_by_user_id,
  storage_bucket,
  storage_path,
  mime_type,
  size_bytes,
  width,
  height,
  signature_hash,
  signature_version,
  status
)
VALUES (
  '00000000-0000-0000-0000-000000926901',
  '00000000-0000-0000-0000-000000926001',
  '00000000-0000-0000-0000-000000926401',
  '00000000-0000-0000-0000-000000926101',
  'profile-signatures',
  'signatures/00000000-0000-0000-0000-000000926001/00000000-0000-0000-0000-000000926401/00000000-0000-0000-0000-000000926901.png',
  'image/png',
  1024,
  400,
  180,
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  1,
  'active'
);

SET LOCAL ROLE authenticated;
SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000926101');

SELECT public.approve_time_weekly_approval(
  '00000000-0000-0000-0000-000000926001',
  (
    SELECT id
    FROM public.time_weekly_approvals
    WHERE organization_id = '00000000-0000-0000-0000-000000926001'
      AND person_profile_id = '00000000-0000-0000-0000-000000926402'
      AND week_start_date = '2026-05-11'
  ),
  'Cierre interno revisado.'
);

SELECT pg_temp.assert_true(
  (
    SELECT
      status = 'approved'
      AND approved_by_person_profile_id = '00000000-0000-0000-0000-000000926401'
      AND approval_signature_profile_signature_id = '00000000-0000-0000-0000-000000926901'
      AND approval_signature_snapshot ->> 'personProfileId' = '00000000-0000-0000-0000-000000926401'
    FROM public.time_weekly_approvals
    WHERE organization_id = '00000000-0000-0000-0000-000000926001'
      AND person_profile_id = '00000000-0000-0000-0000-000000926402'
      AND week_start_date = '2026-05-11'
  ),
  'approval uses the approver own signature snapshot, not the target person signature'
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000926102');

SELECT pg_temp.expect_rejected(
  'approved week blocks normal own manual punch creation',
  $statement$
    SELECT public.create_own_time_punch(
      '00000000-0000-0000-0000-000000926001',
      'clock_in',
      '2026-05-12 08:00:00+02'::timestamptz,
      '2026-05-12',
      NULL,
      NULL,
      NULL,
      NULL,
      '{}'::jsonb
    )
  $statement$
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000926101');

SELECT public.reopen_time_weekly_approval(
  '00000000-0000-0000-0000-000000926001',
  (
    SELECT id
    FROM public.time_weekly_approvals
    WHERE organization_id = '00000000-0000-0000-0000-000000926001'
      AND person_profile_id = '00000000-0000-0000-0000-000000926402'
      AND week_start_date = '2026-05-11'
  ),
  'Reapertura controlada para correccion.'
);

SELECT pg_temp.assert_true(
  (
    SELECT status = 'reopened'
    FROM public.time_weekly_approvals
    WHERE organization_id = '00000000-0000-0000-0000-000000926001'
      AND person_profile_id = '00000000-0000-0000-0000-000000926402'
      AND week_start_date = '2026-05-11'
  ),
  'manager can reopen approved week with a reason'
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*) FILTER (WHERE event_type = 'time_weekly_approval_submitted') >= 1
      AND count(*) FILTER (WHERE event_type = 'time_weekly_approval_rejected') >= 1
      AND count(*) FILTER (WHERE event_type = 'time_weekly_approval_approved') >= 1
      AND count(*) FILTER (WHERE event_type = 'time_weekly_approval_reopened') >= 1
    FROM public.time_audit_events
    WHERE organization_id = '00000000-0000-0000-0000-000000926001'
      AND target_person_profile_id = '00000000-0000-0000-0000-000000926402'
  ),
  'submission, rejection, approval and reopening are audited'
);

RESET ROLE;

ROLLBACK;
