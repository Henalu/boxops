-- BoxOps - E.9/I.30 document programming schedule QA verification
--
-- Run locally with:
--   Get-Content -Raw supabase/snippets/document-programming-schedule-qa-verification.sql | docker exec -i supabase_db_boxops psql -U postgres -d postgres -v ON_ERROR_STOP=1
--
-- The script runs inside a transaction and rolls back all fixture data. It is
-- intended for local/QA verification of authorized programming associations,
-- not for production seed data.

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
    RAISE EXCEPTION 'document programming QA verification failed: %', label;
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
    '00000000-0000-0000-0000-000000930101',
    'authenticated',
    'authenticated',
    'document-programming-owner-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Document Programming Owner A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000930102',
    'authenticated',
    'authenticated',
    'document-programming-preview-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Document Programming Preview A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000930103',
    'authenticated',
    'authenticated',
    'document-programming-metadata-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Document Programming Metadata A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000930104',
    'authenticated',
    'authenticated',
    'document-programming-no-grant-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Document Programming No Grant A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000930105',
    'authenticated',
    'authenticated',
    'document-programming-owner-b@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Document Programming Owner B"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000930106',
    'authenticated',
    'authenticated',
    'document-programming-coach-b@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Document Programming Coach B"}'::jsonb
  );

INSERT INTO public.organizations (id, name, slug, status, timezone)
VALUES
  (
    '00000000-0000-0000-0000-000000930001',
    'Document Programming QA A',
    'document-programming-qa-a',
    'active',
    'Europe/Madrid'
  ),
  (
    '00000000-0000-0000-0000-000000930002',
    'Document Programming QA B',
    'document-programming-qa-b',
    'active',
    'Europe/Madrid'
  );

INSERT INTO public.centers (id, organization_id, name, slug, timezone, status)
VALUES
  (
    '00000000-0000-0000-0000-000000930301',
    '00000000-0000-0000-0000-000000930001',
    'Programming Center A',
    'programming-center-a',
    'Europe/Madrid',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000930302',
    '00000000-0000-0000-0000-000000930002',
    'Programming Center B',
    'programming-center-b',
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
    '00000000-0000-0000-0000-000000930201',
    '00000000-0000-0000-0000-000000930001',
    '00000000-0000-0000-0000-000000930101',
    'owner',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000930202',
    '00000000-0000-0000-0000-000000930001',
    '00000000-0000-0000-0000-000000930102',
    'coach',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000930203',
    '00000000-0000-0000-0000-000000930001',
    '00000000-0000-0000-0000-000000930103',
    'coach',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000930204',
    '00000000-0000-0000-0000-000000930001',
    '00000000-0000-0000-0000-000000930104',
    'coach',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000930205',
    '00000000-0000-0000-0000-000000930002',
    '00000000-0000-0000-0000-000000930105',
    'owner',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000930206',
    '00000000-0000-0000-0000-000000930002',
    '00000000-0000-0000-0000-000000930106',
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
    '00000000-0000-0000-0000-000000930401',
    '00000000-0000-0000-0000-000000930001',
    '00000000-0000-0000-0000-000000930101',
    'Document Programming Owner A',
    'Document Programming Owner A',
    'visible',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000930402',
    '00000000-0000-0000-0000-000000930001',
    '00000000-0000-0000-0000-000000930102',
    'Document Programming Preview A',
    'Document Programming Preview A',
    'visible',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000930403',
    '00000000-0000-0000-0000-000000930001',
    '00000000-0000-0000-0000-000000930103',
    'Document Programming Metadata A',
    'Document Programming Metadata A',
    'visible',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000930404',
    '00000000-0000-0000-0000-000000930001',
    '00000000-0000-0000-0000-000000930104',
    'Document Programming No Grant A',
    'Document Programming No Grant A',
    'visible',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000930405',
    '00000000-0000-0000-0000-000000930002',
    '00000000-0000-0000-0000-000000930105',
    'Document Programming Owner B',
    'Document Programming Owner B',
    'visible',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000930406',
    '00000000-0000-0000-0000-000000930002',
    '00000000-0000-0000-0000-000000930106',
    'Document Programming Coach B',
    'Document Programming Coach B',
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
    '00000000-0000-0000-0000-000000930501',
    '00000000-0000-0000-0000-000000930001',
    '00000000-0000-0000-0000-000000930102',
    '00000000-0000-0000-0000-000000930402',
    '00000000-0000-0000-0000-000000930301',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000930502',
    '00000000-0000-0000-0000-000000930001',
    '00000000-0000-0000-0000-000000930103',
    '00000000-0000-0000-0000-000000930403',
    '00000000-0000-0000-0000-000000930301',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000930503',
    '00000000-0000-0000-0000-000000930001',
    '00000000-0000-0000-0000-000000930104',
    '00000000-0000-0000-0000-000000930404',
    '00000000-0000-0000-0000-000000930301',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000930504',
    '00000000-0000-0000-0000-000000930002',
    '00000000-0000-0000-0000-000000930106',
    '00000000-0000-0000-0000-000000930406',
    '00000000-0000-0000-0000-000000930302',
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
    '00000000-0000-0000-0000-000000930701',
    '00000000-0000-0000-0000-000000930001',
    'Programming Class A',
    'programming-class-a',
    'class',
    3,
    false,
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000930702',
    '00000000-0000-0000-0000-000000930002',
    'Programming Class B',
    'programming-class-b',
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
    '00000000-0000-0000-0000-000000930601',
    '00000000-0000-0000-0000-000000930001',
    '00000000-0000-0000-0000-000000930301',
    '2026-06-10',
    '09:00',
    '10:00',
    '00000000-0000-0000-0000-000000930701',
    3,
    'scheduled',
    'Document programming QA block A'
  ),
  (
    '00000000-0000-0000-0000-000000930602',
    '00000000-0000-0000-0000-000000930002',
    '00000000-0000-0000-0000-000000930302',
    '2026-06-10',
    '09:00',
    '10:00',
    '00000000-0000-0000-0000-000000930702',
    1,
    'scheduled',
    'Document programming QA block B'
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
    '00000000-0000-0000-0000-000000930801',
    '00000000-0000-0000-0000-000000930001',
    '00000000-0000-0000-0000-000000930601',
    '00000000-0000-0000-0000-000000930501',
    'assigned',
    'manual'
  ),
  (
    '00000000-0000-0000-0000-000000930802',
    '00000000-0000-0000-0000-000000930001',
    '00000000-0000-0000-0000-000000930601',
    '00000000-0000-0000-0000-000000930502',
    'assigned',
    'manual'
  ),
  (
    '00000000-0000-0000-0000-000000930803',
    '00000000-0000-0000-0000-000000930001',
    '00000000-0000-0000-0000-000000930601',
    '00000000-0000-0000-0000-000000930503',
    'assigned',
    'manual'
  ),
  (
    '00000000-0000-0000-0000-000000930804',
    '00000000-0000-0000-0000-000000930002',
    '00000000-0000-0000-0000-000000930602',
    '00000000-0000-0000-0000-000000930504',
    'assigned',
    'manual'
  );

INSERT INTO public.documents (
  id,
  organization_id,
  created_by_user_id,
  title,
  document_type,
  document_scope,
  sensitivity_level,
  requires_signature,
  status,
  metadata
)
VALUES (
  '00000000-0000-0000-0000-000000930901',
  '00000000-0000-0000-0000-000000930001',
  '00000000-0000-0000-0000-000000930101',
  'QA Programming Plan A',
  'programming',
  'programming',
  'restricted',
  false,
  'active',
  '{"qa":"E.9/I.30"}'::jsonb
);

INSERT INTO public.document_versions (
  id,
  organization_id,
  document_id,
  version_number,
  uploaded_by_user_id,
  storage_bucket,
  storage_path,
  original_filename,
  mime_type,
  size_bytes,
  document_hash,
  status,
  metadata,
  activated_at
)
VALUES (
  '00000000-0000-0000-0000-000000930911',
  '00000000-0000-0000-0000-000000930001',
  '00000000-0000-0000-0000-000000930901',
  1,
  '00000000-0000-0000-0000-000000930101',
  'document-files',
  'documents/00000000-0000-0000-0000-000000930001/00000000-0000-0000-0000-000000930901/versions/00000000-0000-0000-0000-000000930911/00000000-0000-0000-0000-000000930921.pdf',
  'qa-programming-plan-a.pdf',
  'application/pdf',
  1024,
  repeat('a', 64),
  'active',
  '{"qa":"E.9/I.30"}'::jsonb,
  now()
);

UPDATE public.documents
SET current_version_id = '00000000-0000-0000-0000-000000930911'
WHERE id = '00000000-0000-0000-0000-000000930901'
  AND organization_id = '00000000-0000-0000-0000-000000930001';

INSERT INTO public.document_access_grants (
  id,
  organization_id,
  document_id,
  document_version_id,
  person_profile_id,
  access_level,
  grant_status,
  granted_by_user_id,
  metadata
)
VALUES
  (
    '00000000-0000-0000-0000-000000930951',
    '00000000-0000-0000-0000-000000930001',
    '00000000-0000-0000-0000-000000930901',
    '00000000-0000-0000-0000-000000930911',
    '00000000-0000-0000-0000-000000930402',
    'download',
    'active',
    '00000000-0000-0000-0000-000000930101',
    '{"qa":"preview-and-download"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000930952',
    '00000000-0000-0000-0000-000000930001',
    '00000000-0000-0000-0000-000000930901',
    '00000000-0000-0000-0000-000000930911',
    '00000000-0000-0000-0000-000000930403',
    'read_metadata',
    'active',
    '00000000-0000-0000-0000-000000930101',
    '{"qa":"metadata-only"}'::jsonb
  );

CREATE TEMP TABLE source_table_snapshot AS
SELECT
  (SELECT jsonb_agg(jsonb_build_object('id', id, 'status', status, 'notes', notes) ORDER BY id)
   FROM public.schedule_blocks
   WHERE organization_id IN (
     '00000000-0000-0000-0000-000000930001',
     '00000000-0000-0000-0000-000000930002'
   )) AS schedule_blocks,
  (SELECT jsonb_agg(jsonb_build_object('id', id, 'assignment_status', assignment_status, 'source', source) ORDER BY id)
   FROM public.schedule_block_assignments
   WHERE organization_id IN (
     '00000000-0000-0000-0000-000000930001',
     '00000000-0000-0000-0000-000000930002'
   )) AS schedule_block_assignments;

SET LOCAL ROLE authenticated;

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000930101');
CREATE TEMP TABLE created_programming_link AS
SELECT *
FROM public.create_document_programming_link(
  '00000000-0000-0000-0000-000000930001',
  '00000000-0000-0000-0000-000000930901',
  '00000000-0000-0000-0000-000000930911',
  '2026-06-10',
  '2026-06-10',
  '00000000-0000-0000-0000-000000930701',
  '00000000-0000-0000-0000-000000930301',
  '00000000-0000-0000-0000-000000930601'
);

SELECT pg_temp.assert_true(
  (
    SELECT status = 'active'
      AND document_id = '00000000-0000-0000-0000-000000930901'
      AND document_version_id = '00000000-0000-0000-0000-000000930911'
      AND starts_on = '2026-06-10'
      AND ends_on = '2026-06-10'
      AND schedule_block_id = '00000000-0000-0000-0000-000000930601'
    FROM created_programming_link
  ),
  'active association is created for the intended block context'
);

SELECT pg_temp.expect_rejected(
  'cross-tenant schedule block cannot be linked to tenant A programming',
  $statement$
    SELECT public.create_document_programming_link(
      '00000000-0000-0000-0000-000000930001',
      '00000000-0000-0000-0000-000000930901',
      '00000000-0000-0000-0000-000000930911',
      '2026-06-10',
      '2026-06-10',
      NULL,
      NULL,
      '00000000-0000-0000-0000-000000930602'
    )
  $statement$
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000930102');
CREATE TEMP TABLE preview_block_entries AS
SELECT *
FROM public.list_document_programming_for_block(
  '00000000-0000-0000-0000-000000930001',
  '00000000-0000-0000-0000-000000930601',
  'read_metadata',
  20
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 1
      AND bool_and(document_id = '00000000-0000-0000-0000-000000930901')
      AND bool_and(document_version_id = '00000000-0000-0000-0000-000000930911')
      AND bool_and(document_title = 'QA Programming Plan A')
      AND bool_and(can_preview)
      AND bool_and(can_download)
    FROM preview_block_entries
  ),
  'document grant with download access appears from block detail with preview/download flags'
);

CREATE TEMP TABLE preview_context_entries AS
SELECT *
FROM public.list_document_programming_for_context(
  '00000000-0000-0000-0000-000000930001',
  '2026-06-10',
  '00000000-0000-0000-0000-000000930701',
  '00000000-0000-0000-0000-000000930301',
  'read_metadata',
  20
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 1
      AND bool_and(programming_link_id = (SELECT id FROM created_programming_link))
    FROM preview_context_entries
  ),
  'active block association is discoverable through date/type/center context'
);

SELECT pg_temp.assert_true(
  public.can_access_document(
    '00000000-0000-0000-0000-000000930901',
    '00000000-0000-0000-0000-000000930001',
    '00000000-0000-0000-0000-000000930911',
    'download'
  ),
  'document_access_grants is the real permission for file actions'
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000930103');
CREATE TEMP TABLE metadata_block_entries AS
SELECT *
FROM public.list_document_programming_for_block(
  '00000000-0000-0000-0000-000000930001',
  '00000000-0000-0000-0000-000000930601',
  'read_metadata',
  20
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 1
      AND bool_and(can_preview = false)
      AND bool_and(can_download = false)
    FROM metadata_block_entries
  ),
  'read_metadata grant returns metadata only without preview/download actions'
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 0
    FROM public.list_document_programming_for_block(
      '00000000-0000-0000-0000-000000930001',
      '00000000-0000-0000-0000-000000930601',
      'preview',
      20
    )
  ),
  'metadata-only grant cannot upgrade itself to preview'
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000930104');
SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM public.schedule_block_assignments
    WHERE organization_id = '00000000-0000-0000-0000-000000930001'
      AND schedule_block_id = '00000000-0000-0000-0000-000000930601'
      AND coach_profile_id = '00000000-0000-0000-0000-000000930503'
      AND assignment_status = 'assigned'
  ),
  'no-grant coach is assigned to the schedule block'
);

SELECT pg_temp.assert_true(
  NOT public.can_access_document(
    '00000000-0000-0000-0000-000000930901',
    '00000000-0000-0000-0000-000000930001',
    '00000000-0000-0000-0000-000000930911',
    'read_metadata'
  ),
  'schedule_block_assignments does not grant document access'
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 0
    FROM public.list_document_programming_for_block(
      '00000000-0000-0000-0000-000000930001',
      '00000000-0000-0000-0000-000000930601',
      'read_metadata',
      20
    )
  ),
  'assigned coach without grant gets empty programming state'
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 0
    FROM public.document_programming_links
    WHERE organization_id = '00000000-0000-0000-0000-000000930001'
  ),
  'RLS hides programming links from assigned coach without document grant'
);

SELECT pg_temp.expect_rejected(
  'assigned coach without grant cannot manage programming links',
  $statement$
    SELECT public.set_document_programming_link_status(
      '00000000-0000-0000-0000-000000930001',
      (SELECT id FROM created_programming_link),
      'removed'
    )
  $statement$
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000930105');
SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 0
    FROM public.document_programming_links
    WHERE organization_id = '00000000-0000-0000-0000-000000930001'
  ),
  'other tenant owner cannot read tenant A programming links through RLS'
);

SELECT pg_temp.expect_rejected(
  'other tenant owner cannot list tenant A programming for block',
  $statement$
    SELECT *
    FROM public.list_document_programming_for_block(
      '00000000-0000-0000-0000-000000930001',
      '00000000-0000-0000-0000-000000930601',
      'read_metadata',
      20
    )
  $statement$
);

SELECT pg_temp.expect_rejected(
  'other tenant owner cannot use tenant A context lookup',
  $statement$
    SELECT *
    FROM public.list_document_programming_for_context(
      '00000000-0000-0000-0000-000000930001',
      '2026-06-10',
      '00000000-0000-0000-0000-000000930701',
      '00000000-0000-0000-0000-000000930301',
      'read_metadata',
      20
    )
  $statement$
);

SELECT pg_temp.expect_rejected(
  'direct insert on document_programming_links is blocked for authenticated',
  $statement$
    INSERT INTO public.document_programming_links (
      organization_id,
      document_id,
      document_version_id,
      starts_on,
      ends_on,
      created_by_user_id,
      updated_by_user_id
    )
    VALUES (
      '00000000-0000-0000-0000-000000930001',
      '00000000-0000-0000-0000-000000930901',
      '00000000-0000-0000-0000-000000930911',
      '2026-06-10',
      '2026-06-10',
      '00000000-0000-0000-0000-000000930105',
      '00000000-0000-0000-0000-000000930105'
    )
  $statement$
);

RESET ROLE;

SELECT pg_temp.assert_true(
  (SELECT schedule_blocks FROM source_table_snapshot) = (
    SELECT jsonb_agg(jsonb_build_object('id', id, 'status', status, 'notes', notes) ORDER BY id)
    FROM public.schedule_blocks
    WHERE organization_id IN (
      '00000000-0000-0000-0000-000000930001',
      '00000000-0000-0000-0000-000000930002'
    )
  ),
  'document programming QA did not mutate schedule_blocks'
);

SELECT pg_temp.assert_true(
  (SELECT schedule_block_assignments FROM source_table_snapshot) = (
    SELECT jsonb_agg(jsonb_build_object('id', id, 'assignment_status', assignment_status, 'source', source) ORDER BY id)
    FROM public.schedule_block_assignments
    WHERE organization_id IN (
      '00000000-0000-0000-0000-000000930001',
      '00000000-0000-0000-0000-000000930002'
    )
  ),
  'document programming QA did not mutate schedule_block_assignments'
);

ROLLBACK;
