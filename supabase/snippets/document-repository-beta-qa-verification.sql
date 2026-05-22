-- BoxOps - E.12 document repository beta QA verification
--
-- Run locally with:
--   Get-Content -Raw supabase/snippets/document-repository-beta-qa-verification.sql | docker exec -i supabase_db_boxops psql -U postgres -d postgres -v ON_ERROR_STOP=1
--
-- The script runs inside a transaction and rolls back all fixture data. It
-- verifies the minimal visible repository query and document audit RPCs with
-- controlled synthetic data. It does not create real Storage objects, upload
-- documents, expose grants UI, create signable documents or validate legal
-- compliance.
--
-- E.13 evidence closure note:
-- - Keep BEGIN/ROLLBACK for local, QA and staging checks unless a separate
--   reviewed fixture task explicitly asks for persistent data.
-- - In QA/staging, replace the docker target with the controlled psql
--   connection managed outside the repo.
-- - Store only redacted evidence: counts, roles/cases, scopes and outcomes.
--   Do not store passwords, tokens, cookies, signed URLs, private documents or
--   document contents.

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
    RAISE EXCEPTION 'document repository QA verification failed: %', label;
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
    '00000000-0000-0000-0000-000000931101',
    'authenticated',
    'authenticated',
    'document-repository-owner-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Document Repository Owner A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000931102',
    'authenticated',
    'authenticated',
    'document-repository-download-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Document Repository Download A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000931103',
    'authenticated',
    'authenticated',
    'document-repository-metadata-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Document Repository Metadata A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000931104',
    'authenticated',
    'authenticated',
    'document-repository-no-grant-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Document Repository No Grant A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000931105',
    'authenticated',
    'authenticated',
    'document-repository-owner-b@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Document Repository Owner B"}'::jsonb
  );

INSERT INTO public.organizations (id, name, slug, status, timezone)
VALUES
  (
    '00000000-0000-0000-0000-000000931001',
    'Document Repository QA A',
    'document-repository-qa-a',
    'active',
    'Europe/Madrid'
  ),
  (
    '00000000-0000-0000-0000-000000931002',
    'Document Repository QA B',
    'document-repository-qa-b',
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
    '00000000-0000-0000-0000-000000931201',
    '00000000-0000-0000-0000-000000931001',
    '00000000-0000-0000-0000-000000931101',
    'owner',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000931202',
    '00000000-0000-0000-0000-000000931001',
    '00000000-0000-0000-0000-000000931102',
    'coach',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000931203',
    '00000000-0000-0000-0000-000000931001',
    '00000000-0000-0000-0000-000000931103',
    'coach',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000931204',
    '00000000-0000-0000-0000-000000931001',
    '00000000-0000-0000-0000-000000931104',
    'coach',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000931205',
    '00000000-0000-0000-0000-000000931002',
    '00000000-0000-0000-0000-000000931105',
    'owner',
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
    '00000000-0000-0000-0000-000000931401',
    '00000000-0000-0000-0000-000000931001',
    '00000000-0000-0000-0000-000000931101',
    'Document Repository Owner A',
    'Document Repository Owner A',
    'visible',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000931402',
    '00000000-0000-0000-0000-000000931001',
    '00000000-0000-0000-0000-000000931102',
    'Document Repository Download A',
    'Document Repository Download A',
    'visible',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000931403',
    '00000000-0000-0000-0000-000000931001',
    '00000000-0000-0000-0000-000000931103',
    'Document Repository Metadata A',
    'Document Repository Metadata A',
    'visible',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000931404',
    '00000000-0000-0000-0000-000000931001',
    '00000000-0000-0000-0000-000000931104',
    'Document Repository No Grant A',
    'Document Repository No Grant A',
    'visible',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000931405',
    '00000000-0000-0000-0000-000000931002',
    '00000000-0000-0000-0000-000000931105',
    'Document Repository Owner B',
    'Document Repository Owner B',
    'visible',
    'active'
  );

INSERT INTO public.documents (
  id,
  organization_id,
  created_by_user_id,
  title,
  description,
  document_type,
  document_scope,
  sensitivity_level,
  requires_signature,
  status,
  metadata
)
VALUES
  (
    '00000000-0000-0000-0000-000000931901',
    '00000000-0000-0000-0000-000000931001',
    '00000000-0000-0000-0000-000000931101',
    'QA Repository Programming A',
    'Synthetic programming document for repository QA.',
    'programming',
    'programming',
    'restricted',
    false,
    'active',
    '{"qa":"E.12"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000931902',
    '00000000-0000-0000-0000-000000931001',
    '00000000-0000-0000-0000-000000931101',
    'QA Repository Company A',
    'Synthetic company document for repository QA.',
    'company_policy',
    'company',
    'public_internal',
    false,
    'active',
    '{"qa":"E.12"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000931903',
    '00000000-0000-0000-0000-000000931001',
    '00000000-0000-0000-0000-000000931101',
    'QA Repository Sensitive HR A',
    'Synthetic sensitive HR document blocked from the beta repository.',
    'hr_private',
    'person_private',
    'sensitive_hr',
    false,
    'active',
    '{"qa":"E.12"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000931904',
    '00000000-0000-0000-0000-000000931001',
    '00000000-0000-0000-0000-000000931101',
    'QA Repository Payroll A',
    'Synthetic payroll document blocked from the beta repository.',
    'payroll_private',
    'person_private',
    'payroll',
    false,
    'active',
    '{"qa":"E.12"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000931905',
    '00000000-0000-0000-0000-000000931001',
    '00000000-0000-0000-0000-000000931101',
    'QA Repository Signature Evidence A',
    'Synthetic signature evidence document blocked from the beta repository.',
    'signature_evidence',
    'management_private',
    'signature_evidence',
    false,
    'active',
    '{"qa":"E.12"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000931906',
    '00000000-0000-0000-0000-000000931002',
    '00000000-0000-0000-0000-000000931105',
    'QA Repository Company B',
    'Synthetic company document in another tenant.',
    'company_policy',
    'company',
    'public_internal',
    false,
    'active',
    '{"qa":"E.12"}'::jsonb
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
VALUES
  (
    '00000000-0000-0000-0000-000000931911',
    '00000000-0000-0000-0000-000000931001',
    '00000000-0000-0000-0000-000000931901',
    1,
    '00000000-0000-0000-0000-000000931101',
    'document-files',
    'documents/00000000-0000-0000-0000-000000931001/00000000-0000-0000-0000-000000931901/versions/00000000-0000-0000-0000-000000931911/00000000-0000-0000-0000-000000931921.pdf',
    'qa-repository-programming-a.pdf',
    'application/pdf',
    1024,
    repeat('a', 64),
    'active',
    '{"qa":"E.12"}'::jsonb,
    now()
  ),
  (
    '00000000-0000-0000-0000-000000931912',
    '00000000-0000-0000-0000-000000931001',
    '00000000-0000-0000-0000-000000931902',
    1,
    '00000000-0000-0000-0000-000000931101',
    'document-files',
    'documents/00000000-0000-0000-0000-000000931001/00000000-0000-0000-0000-000000931902/versions/00000000-0000-0000-0000-000000931912/00000000-0000-0000-0000-000000931922.pdf',
    'qa-repository-company-a.pdf',
    'application/pdf',
    1024,
    repeat('b', 64),
    'active',
    '{"qa":"E.12"}'::jsonb,
    now()
  ),
  (
    '00000000-0000-0000-0000-000000931913',
    '00000000-0000-0000-0000-000000931001',
    '00000000-0000-0000-0000-000000931903',
    1,
    '00000000-0000-0000-0000-000000931101',
    'document-files',
    'documents/00000000-0000-0000-0000-000000931001/00000000-0000-0000-0000-000000931903/versions/00000000-0000-0000-0000-000000931913/00000000-0000-0000-0000-000000931923.pdf',
    'qa-repository-sensitive-hr-a.pdf',
    'application/pdf',
    1024,
    repeat('c', 64),
    'active',
    '{"qa":"E.12"}'::jsonb,
    now()
  ),
  (
    '00000000-0000-0000-0000-000000931914',
    '00000000-0000-0000-0000-000000931001',
    '00000000-0000-0000-0000-000000931904',
    1,
    '00000000-0000-0000-0000-000000931101',
    'document-files',
    'documents/00000000-0000-0000-0000-000000931001/00000000-0000-0000-0000-000000931904/versions/00000000-0000-0000-0000-000000931914/00000000-0000-0000-0000-000000931924.pdf',
    'qa-repository-payroll-a.pdf',
    'application/pdf',
    1024,
    repeat('d', 64),
    'active',
    '{"qa":"E.12"}'::jsonb,
    now()
  ),
  (
    '00000000-0000-0000-0000-000000931915',
    '00000000-0000-0000-0000-000000931001',
    '00000000-0000-0000-0000-000000931905',
    1,
    '00000000-0000-0000-0000-000000931101',
    'document-files',
    'documents/00000000-0000-0000-0000-000000931001/00000000-0000-0000-0000-000000931905/versions/00000000-0000-0000-0000-000000931915/00000000-0000-0000-0000-000000931925.pdf',
    'qa-repository-signature-evidence-a.pdf',
    'application/pdf',
    1024,
    repeat('e', 64),
    'active',
    '{"qa":"E.12"}'::jsonb,
    now()
  ),
  (
    '00000000-0000-0000-0000-000000931916',
    '00000000-0000-0000-0000-000000931002',
    '00000000-0000-0000-0000-000000931906',
    1,
    '00000000-0000-0000-0000-000000931105',
    'document-files',
    'documents/00000000-0000-0000-0000-000000931002/00000000-0000-0000-0000-000000931906/versions/00000000-0000-0000-0000-000000931916/00000000-0000-0000-0000-000000931926.pdf',
    'qa-repository-company-b.pdf',
    'application/pdf',
    1024,
    repeat('f', 64),
    'active',
    '{"qa":"E.12"}'::jsonb,
    now()
  );

UPDATE public.documents
SET current_version_id = CASE id
  WHEN '00000000-0000-0000-0000-000000931901' THEN '00000000-0000-0000-0000-000000931911'::uuid
  WHEN '00000000-0000-0000-0000-000000931902' THEN '00000000-0000-0000-0000-000000931912'::uuid
  WHEN '00000000-0000-0000-0000-000000931903' THEN '00000000-0000-0000-0000-000000931913'::uuid
  WHEN '00000000-0000-0000-0000-000000931904' THEN '00000000-0000-0000-0000-000000931914'::uuid
  WHEN '00000000-0000-0000-0000-000000931905' THEN '00000000-0000-0000-0000-000000931915'::uuid
  WHEN '00000000-0000-0000-0000-000000931906' THEN '00000000-0000-0000-0000-000000931916'::uuid
END
WHERE id IN (
  '00000000-0000-0000-0000-000000931901',
  '00000000-0000-0000-0000-000000931902',
  '00000000-0000-0000-0000-000000931903',
  '00000000-0000-0000-0000-000000931904',
  '00000000-0000-0000-0000-000000931905',
  '00000000-0000-0000-0000-000000931906'
);

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
    '00000000-0000-0000-0000-000000931951',
    '00000000-0000-0000-0000-000000931001',
    '00000000-0000-0000-0000-000000931901',
    '00000000-0000-0000-0000-000000931911',
    '00000000-0000-0000-0000-000000931402',
    'download',
    'active',
    '00000000-0000-0000-0000-000000931101',
    '{"qa":"E.12","case":"download"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000931952',
    '00000000-0000-0000-0000-000000931001',
    '00000000-0000-0000-0000-000000931902',
    '00000000-0000-0000-0000-000000931912',
    '00000000-0000-0000-0000-000000931402',
    'download',
    'active',
    '00000000-0000-0000-0000-000000931101',
    '{"qa":"E.12","case":"download"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000931953',
    '00000000-0000-0000-0000-000000931001',
    '00000000-0000-0000-0000-000000931901',
    '00000000-0000-0000-0000-000000931911',
    '00000000-0000-0000-0000-000000931403',
    'read_metadata',
    'active',
    '00000000-0000-0000-0000-000000931101',
    '{"qa":"E.12","case":"metadata-only"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000931954',
    '00000000-0000-0000-0000-000000931001',
    '00000000-0000-0000-0000-000000931902',
    '00000000-0000-0000-0000-000000931912',
    '00000000-0000-0000-0000-000000931403',
    'read_metadata',
    'active',
    '00000000-0000-0000-0000-000000931101',
    '{"qa":"E.12","case":"metadata-only"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000931955',
    '00000000-0000-0000-0000-000000931001',
    '00000000-0000-0000-0000-000000931903',
    '00000000-0000-0000-0000-000000931913',
    '00000000-0000-0000-0000-000000931402',
    'download',
    'active',
    '00000000-0000-0000-0000-000000931101',
    '{"qa":"E.12","case":"blocked-sensitive-hr"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000931956',
    '00000000-0000-0000-0000-000000931001',
    '00000000-0000-0000-0000-000000931904',
    '00000000-0000-0000-0000-000000931914',
    '00000000-0000-0000-0000-000000931402',
    'download',
    'active',
    '00000000-0000-0000-0000-000000931101',
    '{"qa":"E.12","case":"blocked-payroll"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000931957',
    '00000000-0000-0000-0000-000000931001',
    '00000000-0000-0000-0000-000000931905',
    '00000000-0000-0000-0000-000000931915',
    '00000000-0000-0000-0000-000000931402',
    'download',
    'active',
    '00000000-0000-0000-0000-000000931101',
    '{"qa":"E.12","case":"blocked-signature-evidence"}'::jsonb
  );

SELECT pg_temp.expect_rejected(
  'requires_signature documents remain blocked before repository listing',
  $statement$
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
      '00000000-0000-0000-0000-000000931907',
      '00000000-0000-0000-0000-000000931001',
      '00000000-0000-0000-0000-000000931101',
      'QA Repository Signable A',
      'signable_policy',
      'company',
      'restricted',
      true,
      'active',
      '{"qa":"E.12"}'::jsonb
    )
  $statement$
);

SET LOCAL ROLE authenticated;

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000931102');
CREATE TEMP TABLE download_entries AS
SELECT *
FROM public.list_accessible_document_versions(
  '00000000-0000-0000-0000-000000931001',
  NULL,
  100
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 2
      AND bool_and(document_id IN (
        '00000000-0000-0000-0000-000000931901',
        '00000000-0000-0000-0000-000000931902'
      ))
      AND bool_and(document_scope IN ('programming', 'company'))
      AND bool_and(can_preview)
      AND bool_and(can_download)
    FROM download_entries
  ),
  'download grant user sees only programming/company repository documents with preview/download'
);

SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1
    FROM download_entries
    WHERE sensitivity_level IN ('sensitive_hr', 'payroll', 'signature_evidence')
  ),
  'sensitive_hr, payroll and signature_evidence stay out of the visible repository even with grants'
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 1
      AND bool_and(document_scope = 'programming')
      AND bool_and(can_preview)
      AND bool_and(can_download)
    FROM public.list_accessible_document_versions(
      '00000000-0000-0000-0000-000000931001',
      'programming',
      100
    )
  ),
  'programming scope filter returns the controlled visible programming document'
);

CREATE TEMP TABLE preview_access_event AS
SELECT *
FROM public.record_document_access_event(
  '00000000-0000-0000-0000-000000931001',
  '00000000-0000-0000-0000-000000931901',
  '00000000-0000-0000-0000-000000931911',
  'file_preview',
  'preview',
  'allowed',
  '{"qa":"E.12"}'::jsonb
);

CREATE TEMP TABLE download_access_event AS
SELECT *
FROM public.record_document_access_event(
  '00000000-0000-0000-0000-000000931001',
  '00000000-0000-0000-0000-000000931901',
  '00000000-0000-0000-0000-000000931911',
  'file_download',
  'download',
  'allowed',
  '{"qa":"E.12"}'::jsonb
);

WITH audit_events AS (
  SELECT *
  FROM preview_access_event
  UNION ALL
  SELECT *
  FROM download_access_event
)
SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 2
      AND bool_and(actor_user_id = '00000000-0000-0000-0000-000000931102')
      AND bool_and(result = 'allowed')
      AND bool_or(event_type = 'file_preview')
      AND bool_or(event_type = 'file_download')
    FROM audit_events
  ),
  'preview/download audit events can be recorded for the granted user'
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000931103');
CREATE TEMP TABLE metadata_entries AS
SELECT *
FROM public.list_accessible_document_versions(
  '00000000-0000-0000-0000-000000931001',
  NULL,
  100
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 2
      AND bool_and(can_preview = false)
      AND bool_and(can_download = false)
      AND bool_and(document_id IN (
        '00000000-0000-0000-0000-000000931901',
        '00000000-0000-0000-0000-000000931902'
      ))
    FROM metadata_entries
  ),
  'read_metadata grant user sees repository metadata without preview/download'
);

SELECT pg_temp.assert_true(
  NOT public.can_access_document(
    '00000000-0000-0000-0000-000000931901',
    '00000000-0000-0000-0000-000000931001',
    '00000000-0000-0000-0000-000000931911',
    'preview'
  ),
  'metadata-only user cannot preview the visible document'
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000931104');
SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 0
    FROM public.list_accessible_document_versions(
      '00000000-0000-0000-0000-000000931001',
      NULL,
      100
    )
  ),
  'user without grant gets empty repository state'
);

SELECT pg_temp.assert_true(
  NOT public.can_access_document(
    '00000000-0000-0000-0000-000000931901',
    '00000000-0000-0000-0000-000000931001',
    '00000000-0000-0000-0000-000000931911',
    'read_metadata'
  ),
  'user without grant cannot read repository metadata'
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000931105');
SELECT pg_temp.expect_rejected(
  'cross-tenant user cannot list tenant A document repository',
  $statement$
    SELECT *
    FROM public.list_accessible_document_versions(
      '00000000-0000-0000-0000-000000931001',
      NULL,
      100
    )
  $statement$
);

SELECT pg_temp.assert_true(
  NOT public.can_access_document(
    '00000000-0000-0000-0000-000000931901',
    '00000000-0000-0000-0000-000000931001',
    '00000000-0000-0000-0000-000000931911',
    'read_metadata'
  ),
  'cross-tenant user cannot read tenant A document metadata'
);

CREATE TEMP TABLE other_tenant_entries AS
SELECT *
FROM public.list_accessible_document_versions(
  '00000000-0000-0000-0000-000000931002',
  NULL,
  100
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 1
      AND bool_and(organization_id = '00000000-0000-0000-0000-000000931002')
      AND bool_and(document_id = '00000000-0000-0000-0000-000000931906')
    FROM other_tenant_entries
  ),
  'cross-tenant owner only lists its own tenant repository documents'
);

RESET ROLE;

ROLLBACK;
