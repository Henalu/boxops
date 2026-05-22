-- BoxOps - S.70 tenant boundary document metadata RLS/RPC rollback verification
--
-- Run locally with:
--   Get-Content -Raw supabase/snippets/tenant-boundary-document-metadata-rls-rollback.sql | docker exec -i supabase_db_boxops psql -U postgres -d postgres -v ON_ERROR_STOP=1
--
-- The script runs inside a transaction and rolls back all fixture data. It
-- validates a minimal tenant/RLS/RPC case from the negative-test matrix for
-- document metadata only: documents, document_versions metadata visibility,
-- document_access_grants, document_subjects and begin/cancel version metadata
-- RPCs.
--
-- This intentionally does not validate real Storage objects, effective signed
-- URLs, preview/download route redirects, browser runtime, Server Actions,
-- SMTP, staging, grants UI, visible uploads, signable documents, payroll, AI,
-- native app, geolocation or data from a real tenant.

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
    RAISE EXCEPTION 'tenant boundary document metadata RLS/RPC verification failed: %', label;
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
    '00000000-0000-0000-0000-000000970101',
    'authenticated',
    'authenticated',
    'tenant-boundary-documents-owner-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Tenant Boundary Documents Owner A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000970102',
    'authenticated',
    'authenticated',
    'tenant-boundary-documents-manager-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Tenant Boundary Documents Manager A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000970103',
    'authenticated',
    'authenticated',
    'tenant-boundary-documents-download-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Tenant Boundary Documents Download A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000970104',
    'authenticated',
    'authenticated',
    'tenant-boundary-documents-preview-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Tenant Boundary Documents Preview A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000970105',
    'authenticated',
    'authenticated',
    'tenant-boundary-documents-metadata-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Tenant Boundary Documents Metadata A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000970106',
    'authenticated',
    'authenticated',
    'tenant-boundary-documents-subject-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Tenant Boundary Documents Subject A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000970107',
    'authenticated',
    'authenticated',
    'tenant-boundary-documents-no-grant-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Tenant Boundary Documents No Grant A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000970108',
    'authenticated',
    'authenticated',
    'tenant-boundary-documents-owner-b@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Tenant Boundary Documents Owner B"}'::jsonb
  );

INSERT INTO public.organizations (id, name, slug, status, timezone)
VALUES
  (
    '00000000-0000-0000-0000-000000970001',
    'Tenant Boundary Documents A',
    'tenant-boundary-documents-a',
    'active',
    'Europe/Madrid'
  ),
  (
    '00000000-0000-0000-0000-000000970002',
    'Tenant Boundary Documents B',
    'tenant-boundary-documents-b',
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
    '00000000-0000-0000-0000-000000970201',
    '00000000-0000-0000-0000-000000970001',
    '00000000-0000-0000-0000-000000970101',
    'owner',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000970202',
    '00000000-0000-0000-0000-000000970001',
    '00000000-0000-0000-0000-000000970102',
    'manager',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000970203',
    '00000000-0000-0000-0000-000000970001',
    '00000000-0000-0000-0000-000000970103',
    'coach',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000970204',
    '00000000-0000-0000-0000-000000970001',
    '00000000-0000-0000-0000-000000970104',
    'coach',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000970205',
    '00000000-0000-0000-0000-000000970001',
    '00000000-0000-0000-0000-000000970105',
    'coach',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000970206',
    '00000000-0000-0000-0000-000000970001',
    '00000000-0000-0000-0000-000000970106',
    'coach',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000970207',
    '00000000-0000-0000-0000-000000970001',
    '00000000-0000-0000-0000-000000970107',
    'coach',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000970208',
    '00000000-0000-0000-0000-000000970002',
    '00000000-0000-0000-0000-000000970108',
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
    '00000000-0000-0000-0000-000000970401',
    '00000000-0000-0000-0000-000000970001',
    '00000000-0000-0000-0000-000000970101',
    'Tenant Boundary Documents Owner A',
    'Tenant Boundary Documents Owner A',
    'visible',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000970402',
    '00000000-0000-0000-0000-000000970001',
    '00000000-0000-0000-0000-000000970102',
    'Tenant Boundary Documents Manager A',
    'Tenant Boundary Documents Manager A',
    'visible',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000970403',
    '00000000-0000-0000-0000-000000970001',
    '00000000-0000-0000-0000-000000970103',
    'Tenant Boundary Documents Download A',
    'Tenant Boundary Documents Download A',
    'visible',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000970404',
    '00000000-0000-0000-0000-000000970001',
    '00000000-0000-0000-0000-000000970104',
    'Tenant Boundary Documents Preview A',
    'Tenant Boundary Documents Preview A',
    'visible',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000970405',
    '00000000-0000-0000-0000-000000970001',
    '00000000-0000-0000-0000-000000970105',
    'Tenant Boundary Documents Metadata A',
    'Tenant Boundary Documents Metadata A',
    'visible',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000970406',
    '00000000-0000-0000-0000-000000970001',
    '00000000-0000-0000-0000-000000970106',
    'Tenant Boundary Documents Subject A',
    'Tenant Boundary Documents Subject A',
    'visible',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000970407',
    '00000000-0000-0000-0000-000000970001',
    '00000000-0000-0000-0000-000000970107',
    'Tenant Boundary Documents No Grant A',
    'Tenant Boundary Documents No Grant A',
    'visible',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000970408',
    '00000000-0000-0000-0000-000000970002',
    '00000000-0000-0000-0000-000000970108',
    'Tenant Boundary Documents Owner B',
    'Tenant Boundary Documents Owner B',
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
    '00000000-0000-0000-0000-000000970901',
    '00000000-0000-0000-0000-000000970001',
    '00000000-0000-0000-0000-000000970101',
    'Tenant A document metadata',
    'Synthetic tenant A document metadata fixture.',
    'company_policy',
    'company',
    'restricted',
    false,
    'active',
    '{"qa":"S.70","case":"grants"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000970902',
    '00000000-0000-0000-0000-000000970001',
    '00000000-0000-0000-0000-000000970101',
    'Tenant A subject document metadata',
    'Synthetic tenant A subject metadata fixture.',
    'company_notice',
    'company',
    'restricted',
    false,
    'active',
    '{"qa":"S.70","case":"subject"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000970903',
    '00000000-0000-0000-0000-000000970002',
    '00000000-0000-0000-0000-000000970108',
    'Tenant B document metadata',
    'Synthetic tenant B document metadata fixture.',
    'company_policy',
    'company',
    'restricted',
    false,
    'active',
    '{"qa":"S.70","case":"tenant-b"}'::jsonb
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
    '00000000-0000-0000-0000-000000970911',
    '00000000-0000-0000-0000-000000970001',
    '00000000-0000-0000-0000-000000970901',
    1,
    '00000000-0000-0000-0000-000000970101',
    'document-files',
    'documents/00000000-0000-0000-0000-000000970001/00000000-0000-0000-0000-000000970901/versions/00000000-0000-0000-0000-000000970911/00000000-0000-0000-0000-000000970921.pdf',
    'tenant-a-document-metadata.pdf',
    'application/pdf',
    1024,
    repeat('a', 64),
    'active',
    '{"qa":"S.70","case":"grants"}'::jsonb,
    now()
  ),
  (
    '00000000-0000-0000-0000-000000970912',
    '00000000-0000-0000-0000-000000970001',
    '00000000-0000-0000-0000-000000970902',
    1,
    '00000000-0000-0000-0000-000000970101',
    'document-files',
    'documents/00000000-0000-0000-0000-000000970001/00000000-0000-0000-0000-000000970902/versions/00000000-0000-0000-0000-000000970912/00000000-0000-0000-0000-000000970922.pdf',
    'tenant-a-subject-document-metadata.pdf',
    'application/pdf',
    1024,
    repeat('b', 64),
    'active',
    '{"qa":"S.70","case":"subject"}'::jsonb,
    now()
  ),
  (
    '00000000-0000-0000-0000-000000970913',
    '00000000-0000-0000-0000-000000970002',
    '00000000-0000-0000-0000-000000970903',
    1,
    '00000000-0000-0000-0000-000000970108',
    'document-files',
    'documents/00000000-0000-0000-0000-000000970002/00000000-0000-0000-0000-000000970903/versions/00000000-0000-0000-0000-000000970913/00000000-0000-0000-0000-000000970923.pdf',
    'tenant-b-document-metadata.pdf',
    'application/pdf',
    1024,
    repeat('c', 64),
    'active',
    '{"qa":"S.70","case":"tenant-b"}'::jsonb,
    now()
  );

UPDATE public.documents
SET current_version_id = CASE id
  WHEN '00000000-0000-0000-0000-000000970901' THEN '00000000-0000-0000-0000-000000970911'::uuid
  WHEN '00000000-0000-0000-0000-000000970902' THEN '00000000-0000-0000-0000-000000970912'::uuid
  WHEN '00000000-0000-0000-0000-000000970903' THEN '00000000-0000-0000-0000-000000970913'::uuid
END
WHERE id IN (
  '00000000-0000-0000-0000-000000970901',
  '00000000-0000-0000-0000-000000970902',
  '00000000-0000-0000-0000-000000970903'
);

INSERT INTO public.document_subjects (
  id,
  organization_id,
  document_id,
  subject_type,
  person_profile_id,
  status,
  metadata
)
VALUES (
  '00000000-0000-0000-0000-000000970961',
  '00000000-0000-0000-0000-000000970001',
  '00000000-0000-0000-0000-000000970902',
  'person',
  '00000000-0000-0000-0000-000000970406',
  'active',
  '{"qa":"S.70","case":"subject-access"}'::jsonb
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
  expires_at,
  revoked_at,
  metadata,
  created_at
)
VALUES
  (
    '00000000-0000-0000-0000-000000970951',
    '00000000-0000-0000-0000-000000970001',
    '00000000-0000-0000-0000-000000970901',
    '00000000-0000-0000-0000-000000970911',
    '00000000-0000-0000-0000-000000970403',
    'download',
    'active',
    '00000000-0000-0000-0000-000000970101',
    NULL,
    NULL,
    '{"qa":"S.70","case":"download"}'::jsonb,
    now()
  ),
  (
    '00000000-0000-0000-0000-000000970952',
    '00000000-0000-0000-0000-000000970001',
    '00000000-0000-0000-0000-000000970901',
    '00000000-0000-0000-0000-000000970911',
    '00000000-0000-0000-0000-000000970404',
    'preview',
    'active',
    '00000000-0000-0000-0000-000000970101',
    NULL,
    NULL,
    '{"qa":"S.70","case":"preview"}'::jsonb,
    now()
  ),
  (
    '00000000-0000-0000-0000-000000970953',
    '00000000-0000-0000-0000-000000970001',
    '00000000-0000-0000-0000-000000970901',
    '00000000-0000-0000-0000-000000970911',
    '00000000-0000-0000-0000-000000970405',
    'read_metadata',
    'active',
    '00000000-0000-0000-0000-000000970101',
    NULL,
    NULL,
    '{"qa":"S.70","case":"metadata"}'::jsonb,
    now()
  ),
  (
    '00000000-0000-0000-0000-000000970954',
    '00000000-0000-0000-0000-000000970001',
    '00000000-0000-0000-0000-000000970901',
    '00000000-0000-0000-0000-000000970911',
    '00000000-0000-0000-0000-000000970407',
    'download',
    'revoked',
    '00000000-0000-0000-0000-000000970101',
    NULL,
    now(),
    '{"qa":"S.70","case":"revoked"}'::jsonb,
    now()
  ),
  (
    '00000000-0000-0000-0000-000000970955',
    '00000000-0000-0000-0000-000000970001',
    '00000000-0000-0000-0000-000000970902',
    '00000000-0000-0000-0000-000000970912',
    '00000000-0000-0000-0000-000000970407',
    'download',
    'active',
    '00000000-0000-0000-0000-000000970101',
    now() - interval '1 day',
    NULL,
    '{"qa":"S.70","case":"expired"}'::jsonb,
    now() - interval '2 days'
  );

SET LOCAL ROLE authenticated;

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000970101');

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 2
    FROM public.documents
    WHERE organization_id = '00000000-0000-0000-0000-000000970001'
      AND id IN (
        '00000000-0000-0000-0000-000000970901',
        '00000000-0000-0000-0000-000000970902'
      )
  ),
  'tenant A owner can read manageable tenant A document metadata'
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 0
    FROM public.documents
    WHERE id = '00000000-0000-0000-0000-000000970903'
  ),
  'tenant A owner cannot read tenant B document metadata'
);

UPDATE public.documents
SET title = 'Tenant A document metadata updated'
WHERE id = '00000000-0000-0000-0000-000000970901';

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM public.documents
    WHERE id = '00000000-0000-0000-0000-000000970901'
      AND organization_id = '00000000-0000-0000-0000-000000970001'
      AND title = 'Tenant A document metadata updated'
  ),
  'tenant A owner can update allowed tenant A document metadata fields'
);

SELECT pg_temp.expect_no_updated_rows(
  'tenant A owner cannot update tenant B document metadata',
  $statement$
    UPDATE public.documents
    SET title = 'Forbidden tenant B document update'
    WHERE id = '00000000-0000-0000-0000-000000970903'
  $statement$
);

SELECT pg_temp.expect_rejected(
  'tenant A owner cannot move tenant A document metadata into tenant B',
  $statement$
    UPDATE public.documents
    SET organization_id = '00000000-0000-0000-0000-000000970002'
    WHERE id = '00000000-0000-0000-0000-000000970901'
  $statement$
);

SELECT pg_temp.expect_rejected(
  'tenant A owner cannot insert document metadata directly into tenant B',
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
      '00000000-0000-0000-0000-000000970904',
      '00000000-0000-0000-0000-000000970002',
      '00000000-0000-0000-0000-000000970101',
      'Forbidden tenant B document metadata',
      'company_policy',
      'company',
      'restricted',
      false,
      'draft',
      '{"qa":"S.70","case":"forbidden"}'::jsonb
    )
  $statement$
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
  '00000000-0000-0000-0000-000000970905',
  '00000000-0000-0000-0000-000000970001',
  '00000000-0000-0000-0000-000000970101',
  'Tenant A owner-created draft document metadata',
  'company_policy',
  'company',
  'restricted',
  false,
  'draft',
  '{"qa":"S.70","case":"owner-create"}'::jsonb
);

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM public.documents
    WHERE id = '00000000-0000-0000-0000-000000970905'
      AND organization_id = '00000000-0000-0000-0000-000000970001'
      AND status = 'draft'
  ),
  'tenant A owner can create allowed tenant A document metadata'
);

CREATE TEMP TABLE owner_pending_version AS
SELECT *
FROM public.begin_document_version_upload(
  '00000000-0000-0000-0000-000000970001',
  '00000000-0000-0000-0000-000000970901',
  'tenant-a-document-metadata-v2.pdf',
  'application/pdf',
  2048,
  repeat('1', 64),
  'pdf',
  '{"qa":"S.70","case":"begin-upload-metadata"}'::jsonb
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 1
      AND bool_and(organization_id = '00000000-0000-0000-0000-000000970001')
      AND bool_and(document_id = '00000000-0000-0000-0000-000000970901')
      AND bool_and(status = 'pending')
      AND bool_and(storage_bucket = 'document-files')
      AND bool_and(storage_path LIKE 'documents/00000000-0000-0000-0000-000000970001/00000000-0000-0000-0000-000000970901/versions/%')
    FROM owner_pending_version
  ),
  'tenant A owner can begin a tenant A document version metadata upload without creating a Storage object'
);

SELECT public.cancel_document_version_upload((SELECT id FROM owner_pending_version));

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM public.document_versions
    WHERE id = (SELECT id FROM owner_pending_version)
      AND organization_id = '00000000-0000-0000-0000-000000970001'
      AND document_id = '00000000-0000-0000-0000-000000970901'
      AND status = 'deleted'
  ),
  'tenant A owner can cancel the pending document version metadata upload'
);

SELECT pg_temp.expect_rejected(
  'tenant A owner cannot begin a version metadata upload in tenant B',
  $statement$
    SELECT public.begin_document_version_upload(
      '00000000-0000-0000-0000-000000970002',
      '00000000-0000-0000-0000-000000970903',
      'forbidden-tenant-b-document.pdf',
      'application/pdf',
      2048,
      repeat('2', 64),
      'pdf',
      '{"qa":"S.70","case":"forbidden-tenant-b"}'::jsonb
    )
  $statement$
);

SELECT pg_temp.expect_rejected(
  'tenant A owner cannot insert document version metadata directly into tenant B',
  $statement$
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
      metadata
    )
    VALUES (
      '00000000-0000-0000-0000-000000970914',
      '00000000-0000-0000-0000-000000970002',
      '00000000-0000-0000-0000-000000970903',
      2,
      '00000000-0000-0000-0000-000000970101',
      'document-files',
      'documents/00000000-0000-0000-0000-000000970002/00000000-0000-0000-0000-000000970903/versions/00000000-0000-0000-0000-000000970914/00000000-0000-0000-0000-000000970924.pdf',
      'forbidden-tenant-b-version.pdf',
      'application/pdf',
      2048,
      repeat('3', 64),
      'pending',
      '{"qa":"S.70","case":"forbidden-version"}'::jsonb
    )
  $statement$
);

SELECT pg_temp.expect_rejected(
  'tenant A owner cannot move document version metadata into tenant B',
  $statement$
    UPDATE public.document_versions
    SET organization_id = '00000000-0000-0000-0000-000000970002'
    WHERE id = '00000000-0000-0000-0000-000000970911'
  $statement$
);

INSERT INTO public.document_subjects (
  id,
  organization_id,
  document_id,
  subject_type,
  person_profile_id,
  status,
  metadata
)
VALUES (
  '00000000-0000-0000-0000-000000970962',
  '00000000-0000-0000-0000-000000970001',
  '00000000-0000-0000-0000-000000970901',
  'person',
  '00000000-0000-0000-0000-000000970401',
  'active',
  '{"qa":"S.70","case":"owner-subject-create"}'::jsonb
);

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM public.document_subjects
    WHERE id = '00000000-0000-0000-0000-000000970962'
      AND organization_id = '00000000-0000-0000-0000-000000970001'
      AND document_id = '00000000-0000-0000-0000-000000970901'
      AND person_profile_id = '00000000-0000-0000-0000-000000970401'
  ),
  'tenant A owner can create an allowed tenant A document subject'
);

SELECT pg_temp.expect_rejected(
  'tenant A owner cannot create tenant A document subject with tenant B person',
  $statement$
    INSERT INTO public.document_subjects (
      id,
      organization_id,
      document_id,
      subject_type,
      person_profile_id,
      status,
      metadata
    )
    VALUES (
      '00000000-0000-0000-0000-000000970963',
      '00000000-0000-0000-0000-000000970001',
      '00000000-0000-0000-0000-000000970901',
      'person',
      '00000000-0000-0000-0000-000000970408',
      'active',
      '{"qa":"S.70","case":"forbidden-person"}'::jsonb
    )
  $statement$
);

SELECT pg_temp.expect_rejected(
  'tenant A owner cannot create tenant A subject for tenant B document',
  $statement$
    INSERT INTO public.document_subjects (
      id,
      organization_id,
      document_id,
      subject_type,
      person_profile_id,
      status,
      metadata
    )
    VALUES (
      '00000000-0000-0000-0000-000000970964',
      '00000000-0000-0000-0000-000000970001',
      '00000000-0000-0000-0000-000000970903',
      'person',
      '00000000-0000-0000-0000-000000970401',
      'active',
      '{"qa":"S.70","case":"forbidden-document"}'::jsonb
    )
  $statement$
);

SELECT pg_temp.expect_rejected(
  'tenant A owner cannot create ambiguous document subject metadata',
  $statement$
    INSERT INTO public.document_subjects (
      id,
      organization_id,
      document_id,
      subject_type,
      status,
      metadata
    )
    VALUES (
      '00000000-0000-0000-0000-000000970965',
      '00000000-0000-0000-0000-000000970001',
      '00000000-0000-0000-0000-000000970901',
      'person',
      'active',
      '{"qa":"S.70","case":"missing-person"}'::jsonb
    )
  $statement$
);

SELECT pg_temp.expect_rejected(
  'tenant A owner cannot move document subject into tenant B',
  $statement$
    UPDATE public.document_subjects
    SET
      organization_id = '00000000-0000-0000-0000-000000970002',
      person_profile_id = '00000000-0000-0000-0000-000000970408'
    WHERE id = '00000000-0000-0000-0000-000000970962'
  $statement$
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
VALUES (
  '00000000-0000-0000-0000-000000970956',
  '00000000-0000-0000-0000-000000970001',
  '00000000-0000-0000-0000-000000970901',
  '00000000-0000-0000-0000-000000970911',
  '00000000-0000-0000-0000-000000970401',
  'preview',
  'active',
  '00000000-0000-0000-0000-000000970101',
  '{"qa":"S.70","case":"owner-grant-create"}'::jsonb
);

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM public.document_access_grants
    WHERE id = '00000000-0000-0000-0000-000000970956'
      AND organization_id = '00000000-0000-0000-0000-000000970001'
      AND document_id = '00000000-0000-0000-0000-000000970901'
      AND person_profile_id = '00000000-0000-0000-0000-000000970401'
      AND access_level = 'preview'
  ),
  'tenant A owner can create an allowed tenant A document access grant'
);

SELECT pg_temp.expect_rejected(
  'tenant A owner cannot create grant to tenant B person',
  $statement$
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
    VALUES (
      '00000000-0000-0000-0000-000000970957',
      '00000000-0000-0000-0000-000000970001',
      '00000000-0000-0000-0000-000000970901',
      '00000000-0000-0000-0000-000000970911',
      '00000000-0000-0000-0000-000000970408',
      'read_metadata',
      'active',
      '00000000-0000-0000-0000-000000970101',
      '{"qa":"S.70","case":"forbidden-person"}'::jsonb
    )
  $statement$
);

SELECT pg_temp.expect_rejected(
  'tenant A owner cannot create grant to tenant B membership',
  $statement$
    INSERT INTO public.document_access_grants (
      id,
      organization_id,
      document_id,
      document_version_id,
      organization_membership_id,
      access_level,
      grant_status,
      granted_by_user_id,
      metadata
    )
    VALUES (
      '00000000-0000-0000-0000-000000970958',
      '00000000-0000-0000-0000-000000970001',
      '00000000-0000-0000-0000-000000970901',
      '00000000-0000-0000-0000-000000970911',
      '00000000-0000-0000-0000-000000970208',
      'read_metadata',
      'active',
      '00000000-0000-0000-0000-000000970101',
      '{"qa":"S.70","case":"forbidden-membership"}'::jsonb
    )
  $statement$
);

SELECT pg_temp.expect_rejected(
  'tenant A owner cannot create tenant A grant for tenant B document',
  $statement$
    INSERT INTO public.document_access_grants (
      id,
      organization_id,
      document_id,
      person_profile_id,
      access_level,
      grant_status,
      granted_by_user_id,
      metadata
    )
    VALUES (
      '00000000-0000-0000-0000-000000970959',
      '00000000-0000-0000-0000-000000970001',
      '00000000-0000-0000-0000-000000970903',
      '00000000-0000-0000-0000-000000970401',
      'read_metadata',
      'active',
      '00000000-0000-0000-0000-000000970101',
      '{"qa":"S.70","case":"forbidden-document"}'::jsonb
    )
  $statement$
);

SELECT pg_temp.expect_rejected(
  'tenant A owner cannot create tenant A grant using tenant B document version',
  $statement$
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
    VALUES (
      '00000000-0000-0000-0000-000000970960',
      '00000000-0000-0000-0000-000000970001',
      '00000000-0000-0000-0000-000000970901',
      '00000000-0000-0000-0000-000000970913',
      '00000000-0000-0000-0000-000000970401',
      'read_metadata',
      'active',
      '00000000-0000-0000-0000-000000970101',
      '{"qa":"S.70","case":"forbidden-version"}'::jsonb
    )
  $statement$
);

SELECT pg_temp.expect_rejected(
  'tenant A owner cannot create ambiguous document access grant',
  $statement$
    INSERT INTO public.document_access_grants (
      id,
      organization_id,
      document_id,
      document_version_id,
      person_profile_id,
      role,
      access_level,
      grant_status,
      granted_by_user_id,
      metadata
    )
    VALUES (
      '00000000-0000-0000-0000-000000970966',
      '00000000-0000-0000-0000-000000970001',
      '00000000-0000-0000-0000-000000970901',
      '00000000-0000-0000-0000-000000970911',
      '00000000-0000-0000-0000-000000970401',
      'coach',
      'read_metadata',
      'active',
      '00000000-0000-0000-0000-000000970101',
      '{"qa":"S.70","case":"ambiguous-grant"}'::jsonb
    )
  $statement$
);

SELECT pg_temp.expect_rejected(
  'tenant A owner cannot move immutable document access grant target to tenant B person',
  $statement$
    UPDATE public.document_access_grants
    SET person_profile_id = '00000000-0000-0000-0000-000000970408'
    WHERE id = '00000000-0000-0000-0000-000000970956'
  $statement$
);

SELECT pg_temp.expect_rejected(
  'tenant A owner cannot move document access grant into tenant B',
  $statement$
    UPDATE public.document_access_grants
    SET organization_id = '00000000-0000-0000-0000-000000970002'
    WHERE id = '00000000-0000-0000-0000-000000970956'
  $statement$
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000970103');

CREATE TEMP TABLE download_entries AS
SELECT *
FROM public.list_accessible_document_versions(
  '00000000-0000-0000-0000-000000970001',
  NULL,
  100
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 1
      AND bool_and(document_id = '00000000-0000-0000-0000-000000970901')
      AND bool_and(document_version_id = '00000000-0000-0000-0000-000000970911')
      AND bool_and(can_preview)
      AND bool_and(can_download)
    FROM download_entries
  ),
  'download grant user sees only authorized document metadata with preview/download flags'
);

SELECT pg_temp.assert_true(
  public.can_access_document(
    '00000000-0000-0000-0000-000000970901',
    '00000000-0000-0000-0000-000000970001',
    '00000000-0000-0000-0000-000000970911',
    'download'
  ),
  'download grant user has download capability at metadata/RPC level'
);

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM public.document_versions
    WHERE id = '00000000-0000-0000-0000-000000970911'
  ),
  'download grant user can read authorized version metadata through RLS'
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 0
    FROM public.document_access_grants
    WHERE document_id = '00000000-0000-0000-0000-000000970901'
  ),
  'download grant user cannot read document grants without manage_grants'
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000970104');

CREATE TEMP TABLE preview_entries AS
SELECT *
FROM public.list_accessible_document_versions(
  '00000000-0000-0000-0000-000000970001',
  NULL,
  100
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 1
      AND bool_and(document_id = '00000000-0000-0000-0000-000000970901')
      AND bool_and(can_preview)
      AND bool_and(can_download = false)
    FROM preview_entries
  ),
  'preview grant user sees authorized document metadata with preview but no download flag'
);

SELECT pg_temp.assert_true(
  public.can_access_document(
    '00000000-0000-0000-0000-000000970901',
    '00000000-0000-0000-0000-000000970001',
    '00000000-0000-0000-0000-000000970911',
    'preview'
  )
  AND NOT public.can_access_document(
    '00000000-0000-0000-0000-000000970901',
    '00000000-0000-0000-0000-000000970001',
    '00000000-0000-0000-0000-000000970911',
    'download'
  ),
  'preview grant user cannot upgrade to download at metadata/RPC level'
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000970105');

CREATE TEMP TABLE metadata_entries AS
SELECT *
FROM public.list_accessible_document_versions(
  '00000000-0000-0000-0000-000000970001',
  NULL,
  100
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 1
      AND bool_and(document_id = '00000000-0000-0000-0000-000000970901')
      AND bool_and(can_preview = false)
      AND bool_and(can_download = false)
    FROM metadata_entries
  ),
  'read_metadata grant user sees only authorized metadata without file capabilities'
);

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM public.documents
    WHERE id = '00000000-0000-0000-0000-000000970901'
  ),
  'read_metadata grant user can read the authorized document row'
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 0
    FROM public.document_versions
    WHERE id = '00000000-0000-0000-0000-000000970911'
  ),
  'read_metadata grant user cannot read file version rows directly through preview-gated RLS'
);

SELECT pg_temp.assert_true(
  NOT public.can_access_document(
    '00000000-0000-0000-0000-000000970901',
    '00000000-0000-0000-0000-000000970001',
    '00000000-0000-0000-0000-000000970911',
    'preview'
  ),
  'read_metadata grant user cannot preview at metadata/RPC level'
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 0
    FROM public.document_access_grants
    WHERE document_id = '00000000-0000-0000-0000-000000970901'
  ),
  'read_metadata grant user cannot read document grants'
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000970106');

CREATE TEMP TABLE subject_entries AS
SELECT *
FROM public.list_accessible_document_versions(
  '00000000-0000-0000-0000-000000970001',
  NULL,
  100
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 1
      AND bool_and(document_id = '00000000-0000-0000-0000-000000970902')
      AND bool_and(can_preview)
      AND bool_and(can_download)
    FROM subject_entries
  ),
  'person document subject grants the subject user metadata and file capabilities up to download'
);

SELECT pg_temp.assert_true(
  public.can_access_document(
    '00000000-0000-0000-0000-000000970902',
    '00000000-0000-0000-0000-000000970001',
    '00000000-0000-0000-0000-000000970912',
    'download'
  )
  AND NOT public.can_access_document(
    '00000000-0000-0000-0000-000000970902',
    '00000000-0000-0000-0000-000000970001',
    '00000000-0000-0000-0000-000000970912',
    'manage'
  ),
  'person document subject does not grant manage access'
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 0
    FROM public.document_access_grants
    WHERE document_id = '00000000-0000-0000-0000-000000970902'
  ),
  'person document subject does not grant visibility into grant rows'
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000970107');

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 0
    FROM public.list_accessible_document_versions(
      '00000000-0000-0000-0000-000000970001',
      NULL,
      100
    )
  ),
  'user with only revoked or expired grants gets empty document metadata'
);

SELECT pg_temp.assert_true(
  NOT public.can_access_document(
    '00000000-0000-0000-0000-000000970901',
    '00000000-0000-0000-0000-000000970001',
    '00000000-0000-0000-0000-000000970911',
    'read_metadata'
  )
  AND NOT public.can_access_document(
    '00000000-0000-0000-0000-000000970902',
    '00000000-0000-0000-0000-000000970001',
    '00000000-0000-0000-0000-000000970912',
    'read_metadata'
  ),
  'revoked and expired grants are ignored by can_access_document'
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000970102');

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 0
    FROM public.list_accessible_document_versions(
      '00000000-0000-0000-0000-000000970001',
      NULL,
      100
    )
  ),
  'tenant A manager without document grant or capability gets empty document metadata'
);

SELECT pg_temp.assert_true(
  NOT public.can_access_document(
    '00000000-0000-0000-0000-000000970901',
    '00000000-0000-0000-0000-000000970001',
    '00000000-0000-0000-0000-000000970911',
    'read_metadata'
  )
  AND NOT public.has_document_capability(
    '00000000-0000-0000-0000-000000970001',
    'document_grant_manage'
  ),
  'tenant A manager does not inherit document metadata or grant management access'
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 0
    FROM public.documents
    WHERE id IN (
      '00000000-0000-0000-0000-000000970901',
      '00000000-0000-0000-0000-000000970902'
    )
  ),
  'tenant A manager cannot read document rows without grant or capability'
);

SELECT pg_temp.expect_rejected(
  'tenant A manager cannot create document metadata',
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
      '00000000-0000-0000-0000-000000970906',
      '00000000-0000-0000-0000-000000970001',
      '00000000-0000-0000-0000-000000970102',
      'Forbidden manager document metadata',
      'company_policy',
      'company',
      'restricted',
      false,
      'draft',
      '{"qa":"S.70","case":"forbidden-manager"}'::jsonb
    )
  $statement$
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000970108');

CREATE TEMP TABLE tenant_b_entries AS
SELECT *
FROM public.list_accessible_document_versions(
  '00000000-0000-0000-0000-000000970002',
  NULL,
  100
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 1
      AND bool_and(organization_id = '00000000-0000-0000-0000-000000970002')
      AND bool_and(document_id = '00000000-0000-0000-0000-000000970903')
    FROM tenant_b_entries
  ),
  'tenant B owner can read only tenant B document metadata'
);

SELECT pg_temp.expect_rejected(
  'tenant B owner cannot list tenant A document metadata repository',
  $statement$
    SELECT *
    FROM public.list_accessible_document_versions(
      '00000000-0000-0000-0000-000000970001',
      NULL,
      100
    )
  $statement$
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 0
    FROM public.documents
    WHERE id IN (
      '00000000-0000-0000-0000-000000970901',
      '00000000-0000-0000-0000-000000970902'
    )
  ),
  'tenant B owner cannot read tenant A document rows through RLS'
);

SELECT pg_temp.expect_no_updated_rows(
  'tenant B owner cannot update tenant A document metadata',
  $statement$
    UPDATE public.documents
    SET title = 'Forbidden tenant A document update from tenant B'
    WHERE id = '00000000-0000-0000-0000-000000970901'
  $statement$
);

RESET ROLE;

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM public.documents
    WHERE id = '00000000-0000-0000-0000-000000970901'
      AND organization_id = '00000000-0000-0000-0000-000000970001'
      AND title = 'Tenant A document metadata updated'
  ),
  'tenant A document remains in tenant A before rollback'
);

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM public.documents
    WHERE id = '00000000-0000-0000-0000-000000970903'
      AND organization_id = '00000000-0000-0000-0000-000000970002'
      AND title = 'Tenant B document metadata'
  ),
  'tenant B document remains unchanged before rollback'
);

SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1
    FROM public.documents
    WHERE id IN (
      '00000000-0000-0000-0000-000000970904',
      '00000000-0000-0000-0000-000000970906'
    )
  ),
  'forbidden document metadata inserts were not persisted before rollback'
);

ROLLBACK;
