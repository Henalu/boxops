-- BoxOps - S.71 tenant boundary document_access_events RLS/RPC rollback verification
--
-- Run locally with:
--   Get-Content -Raw supabase/snippets/tenant-boundary-document-access-audit-rls-rollback.sql | docker exec -i supabase_db_boxops psql -U postgres -d postgres -v ON_ERROR_STOP=1
--
-- The script runs inside a transaction and rolls back all fixture data. It
-- validates a minimal tenant/RLS/RPC case from the negative-test matrix for
-- document access audit metadata only: document_access_events,
-- record_document_access_event, list_document_access_events_for_document,
-- can_read_document_access_events and metadata minimization.
--
-- This intentionally does not validate real Storage objects, effective signed
-- URLs, preview/download route redirects, browser runtime, Server Actions,
-- SMTP, staging, grants UI, visible uploads, signable documents, payroll
-- product flows, AI, native app, geolocation or data from a real tenant.

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
    RAISE EXCEPTION 'tenant boundary document access audit RLS/RPC verification failed: %', label;
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
    '00000000-0000-0000-0000-000000971101',
    'authenticated',
    'authenticated',
    'tenant-boundary-document-audit-owner-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Tenant Boundary Document Audit Owner A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000971102',
    'authenticated',
    'authenticated',
    'tenant-boundary-document-audit-admin-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Tenant Boundary Document Audit Admin A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000971103',
    'authenticated',
    'authenticated',
    'tenant-boundary-document-audit-manager-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Tenant Boundary Document Audit Manager A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000971104',
    'authenticated',
    'authenticated',
    'tenant-boundary-document-audit-document-admin-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Tenant Boundary Document Audit Document Admin A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000971105',
    'authenticated',
    'authenticated',
    'tenant-boundary-document-audit-payroll-manager-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Tenant Boundary Document Audit Payroll Manager A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000971106',
    'authenticated',
    'authenticated',
    'tenant-boundary-document-audit-metadata-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Tenant Boundary Document Audit Metadata A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000971107',
    'authenticated',
    'authenticated',
    'tenant-boundary-document-audit-download-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Tenant Boundary Document Audit Download A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000971108',
    'authenticated',
    'authenticated',
    'tenant-boundary-document-audit-no-grant-a@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Tenant Boundary Document Audit No Grant A"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000971109',
    'authenticated',
    'authenticated',
    'tenant-boundary-document-audit-document-admin-b@boxops.local',
    extensions.crypt('not-used', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Tenant Boundary Document Audit Document Admin B"}'::jsonb
  );

INSERT INTO public.organizations (id, name, slug, status, timezone)
VALUES
  (
    '00000000-0000-0000-0000-000000971001',
    'Tenant Boundary Document Audit A',
    'tenant-boundary-document-audit-a',
    'active',
    'Europe/Madrid'
  ),
  (
    '00000000-0000-0000-0000-000000971002',
    'Tenant Boundary Document Audit B',
    'tenant-boundary-document-audit-b',
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
    '00000000-0000-0000-0000-000000971201',
    '00000000-0000-0000-0000-000000971001',
    '00000000-0000-0000-0000-000000971101',
    'owner',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000971202',
    '00000000-0000-0000-0000-000000971001',
    '00000000-0000-0000-0000-000000971102',
    'admin',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000971203',
    '00000000-0000-0000-0000-000000971001',
    '00000000-0000-0000-0000-000000971103',
    'manager',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000971204',
    '00000000-0000-0000-0000-000000971001',
    '00000000-0000-0000-0000-000000971104',
    'document_admin',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000971205',
    '00000000-0000-0000-0000-000000971001',
    '00000000-0000-0000-0000-000000971105',
    'payroll_manager',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000971206',
    '00000000-0000-0000-0000-000000971001',
    '00000000-0000-0000-0000-000000971106',
    'coach',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000971207',
    '00000000-0000-0000-0000-000000971001',
    '00000000-0000-0000-0000-000000971107',
    'coach',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000971208',
    '00000000-0000-0000-0000-000000971001',
    '00000000-0000-0000-0000-000000971108',
    'coach',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000971209',
    '00000000-0000-0000-0000-000000971002',
    '00000000-0000-0000-0000-000000971109',
    'document_admin',
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
    '00000000-0000-0000-0000-000000971401',
    '00000000-0000-0000-0000-000000971001',
    '00000000-0000-0000-0000-000000971101',
    'Tenant Boundary Document Audit Owner A',
    'Tenant Boundary Document Audit Owner A',
    'visible',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000971402',
    '00000000-0000-0000-0000-000000971001',
    '00000000-0000-0000-0000-000000971102',
    'Tenant Boundary Document Audit Admin A',
    'Tenant Boundary Document Audit Admin A',
    'visible',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000971403',
    '00000000-0000-0000-0000-000000971001',
    '00000000-0000-0000-0000-000000971103',
    'Tenant Boundary Document Audit Manager A',
    'Tenant Boundary Document Audit Manager A',
    'visible',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000971404',
    '00000000-0000-0000-0000-000000971001',
    '00000000-0000-0000-0000-000000971104',
    'Tenant Boundary Document Audit Document Admin A',
    'Tenant Boundary Document Audit Document Admin A',
    'visible',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000971405',
    '00000000-0000-0000-0000-000000971001',
    '00000000-0000-0000-0000-000000971105',
    'Tenant Boundary Document Audit Payroll Manager A',
    'Tenant Boundary Document Audit Payroll Manager A',
    'visible',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000971406',
    '00000000-0000-0000-0000-000000971001',
    '00000000-0000-0000-0000-000000971106',
    'Tenant Boundary Document Audit Metadata A',
    'Tenant Boundary Document Audit Metadata A',
    'visible',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000971407',
    '00000000-0000-0000-0000-000000971001',
    '00000000-0000-0000-0000-000000971107',
    'Tenant Boundary Document Audit Download A',
    'Tenant Boundary Document Audit Download A',
    'visible',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000971408',
    '00000000-0000-0000-0000-000000971001',
    '00000000-0000-0000-0000-000000971108',
    'Tenant Boundary Document Audit No Grant A',
    'Tenant Boundary Document Audit No Grant A',
    'visible',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000971409',
    '00000000-0000-0000-0000-000000971002',
    '00000000-0000-0000-0000-000000971109',
    'Tenant Boundary Document Audit Document Admin B',
    'Tenant Boundary Document Audit Document Admin B',
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
    '00000000-0000-0000-0000-000000971901',
    '00000000-0000-0000-0000-000000971001',
    '00000000-0000-0000-0000-000000971104',
    'Tenant A document audit fixture',
    'Synthetic tenant A document audit fixture.',
    'company_policy',
    'company',
    'restricted',
    false,
    'active',
    '{"qa":"S.71","case":"restricted-a"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000971902',
    '00000000-0000-0000-0000-000000971001',
    '00000000-0000-0000-0000-000000971105',
    'Tenant A payroll document audit fixture',
    'Synthetic tenant A payroll document audit fixture.',
    'payroll_private',
    'person_private',
    'payroll',
    false,
    'active',
    '{"qa":"S.71","case":"payroll-a"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000971903',
    '00000000-0000-0000-0000-000000971002',
    '00000000-0000-0000-0000-000000971109',
    'Tenant B document audit fixture',
    'Synthetic tenant B document audit fixture.',
    'company_policy',
    'company',
    'restricted',
    false,
    'active',
    '{"qa":"S.71","case":"restricted-b"}'::jsonb
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
    '00000000-0000-0000-0000-000000971911',
    '00000000-0000-0000-0000-000000971001',
    '00000000-0000-0000-0000-000000971901',
    1,
    '00000000-0000-0000-0000-000000971104',
    'document-files',
    'documents/00000000-0000-0000-0000-000000971001/00000000-0000-0000-0000-000000971901/versions/00000000-0000-0000-0000-000000971911/00000000-0000-0000-0000-000000971921.pdf',
    'tenant-a-document-audit.pdf',
    'application/pdf',
    1024,
    repeat('a', 64),
    'active',
    '{"qa":"S.71","case":"restricted-a"}'::jsonb,
    now()
  ),
  (
    '00000000-0000-0000-0000-000000971912',
    '00000000-0000-0000-0000-000000971001',
    '00000000-0000-0000-0000-000000971902',
    1,
    '00000000-0000-0000-0000-000000971105',
    'document-files',
    'documents/00000000-0000-0000-0000-000000971001/00000000-0000-0000-0000-000000971902/versions/00000000-0000-0000-0000-000000971912/00000000-0000-0000-0000-000000971922.pdf',
    'tenant-a-payroll-document-audit.pdf',
    'application/pdf',
    1024,
    repeat('b', 64),
    'active',
    '{"qa":"S.71","case":"payroll-a"}'::jsonb,
    now()
  ),
  (
    '00000000-0000-0000-0000-000000971913',
    '00000000-0000-0000-0000-000000971002',
    '00000000-0000-0000-0000-000000971903',
    1,
    '00000000-0000-0000-0000-000000971109',
    'document-files',
    'documents/00000000-0000-0000-0000-000000971002/00000000-0000-0000-0000-000000971903/versions/00000000-0000-0000-0000-000000971913/00000000-0000-0000-0000-000000971923.pdf',
    'tenant-b-document-audit.pdf',
    'application/pdf',
    1024,
    repeat('c', 64),
    'active',
    '{"qa":"S.71","case":"restricted-b"}'::jsonb,
    now()
  );

UPDATE public.documents
SET current_version_id = CASE id
  WHEN '00000000-0000-0000-0000-000000971901' THEN '00000000-0000-0000-0000-000000971911'::uuid
  WHEN '00000000-0000-0000-0000-000000971902' THEN '00000000-0000-0000-0000-000000971912'::uuid
  WHEN '00000000-0000-0000-0000-000000971903' THEN '00000000-0000-0000-0000-000000971913'::uuid
END
WHERE id IN (
  '00000000-0000-0000-0000-000000971901',
  '00000000-0000-0000-0000-000000971902',
  '00000000-0000-0000-0000-000000971903'
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
    '00000000-0000-0000-0000-000000971951',
    '00000000-0000-0000-0000-000000971001',
    '00000000-0000-0000-0000-000000971901',
    '00000000-0000-0000-0000-000000971911',
    '00000000-0000-0000-0000-000000971406',
    'read_metadata',
    'active',
    '00000000-0000-0000-0000-000000971104',
    '{"qa":"S.71","case":"metadata-grant"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000971952',
    '00000000-0000-0000-0000-000000971001',
    '00000000-0000-0000-0000-000000971901',
    '00000000-0000-0000-0000-000000971911',
    '00000000-0000-0000-0000-000000971407',
    'download',
    'active',
    '00000000-0000-0000-0000-000000971104',
    '{"qa":"S.71","case":"download-grant"}'::jsonb
  );

SET LOCAL ROLE authenticated;

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000971106');

WITH inserted_event AS (
  SELECT *
  FROM public.record_document_access_event(
    '00000000-0000-0000-0000-000000971001',
    '00000000-0000-0000-0000-000000971901',
    '00000000-0000-0000-0000-000000971911',
    'metadata_read',
    'read_metadata',
    'allowed',
    '{"qa":"S.71","case":"metadata-allowed"}'::jsonb
  )
)
SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 1
      AND bool_and(organization_id = '00000000-0000-0000-0000-000000971001')
      AND bool_and(document_id = '00000000-0000-0000-0000-000000971901')
      AND bool_and(actor_user_id = '00000000-0000-0000-0000-000000971106')
      AND bool_and(actor_person_profile_id = '00000000-0000-0000-0000-000000971406')
      AND bool_and(organization_membership_id = '00000000-0000-0000-0000-000000971206')
      AND bool_and(event_type = 'metadata_read')
      AND bool_and(access_level = 'read_metadata')
      AND bool_and(result = 'allowed')
    FROM inserted_event
  ),
  'read_metadata grant user can record allowed metadata_read with derived actor context'
);

SELECT pg_temp.expect_rejected(
  'read_metadata grant user cannot record allowed file_preview without preview access',
  $statement$
    SELECT public.record_document_access_event(
      '00000000-0000-0000-0000-000000971001',
      '00000000-0000-0000-0000-000000971901',
      '00000000-0000-0000-0000-000000971911',
      'file_preview',
      'preview',
      'allowed',
      '{"qa":"S.71","case":"metadata-user-preview-denied"}'::jsonb
    )
  $statement$
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000971104');

WITH inserted_event AS (
  SELECT *
  FROM public.record_document_access_event(
    '00000000-0000-0000-0000-000000971001',
    '00000000-0000-0000-0000-000000971901',
    '00000000-0000-0000-0000-000000971911',
    'file_preview',
    'preview',
    'allowed',
    '{"qa":"S.71","case":"document-admin-preview"}'::jsonb
  )
)
SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 1
      AND bool_and(actor_user_id = '00000000-0000-0000-0000-000000971104')
      AND bool_and(event_type = 'file_preview')
      AND bool_and(access_level = 'preview')
      AND bool_and(result = 'allowed')
    FROM inserted_event
  ),
  'document_admin can record allowed preview audit for manageable non-payroll document without Storage access'
);

SELECT pg_temp.assert_true(
  public.can_read_document_access_events(
    '00000000-0000-0000-0000-000000971901',
    '00000000-0000-0000-0000-000000971001'
  )
  AND NOT public.can_read_document_access_events(
    '00000000-0000-0000-0000-000000971902',
    '00000000-0000-0000-0000-000000971001'
  ),
  'document_admin can read non-payroll document audit but not payroll audit'
);

SELECT pg_temp.expect_rejected(
  'document_admin cannot record unsafe URL metadata',
  $statement$
    SELECT public.record_document_access_event(
      '00000000-0000-0000-0000-000000971001',
      '00000000-0000-0000-0000-000000971901',
      '00000000-0000-0000-0000-000000971911',
      'metadata_read',
      'read_metadata',
      'allowed',
      '{"reference":"https://example.test/document.pdf"}'::jsonb
    )
  $statement$
);

SELECT pg_temp.expect_rejected(
  'document_admin cannot record unsafe signed URL metadata',
  $statement$
    SELECT public.record_document_access_event(
      '00000000-0000-0000-0000-000000971001',
      '00000000-0000-0000-0000-000000971901',
      '00000000-0000-0000-0000-000000971911',
      'metadata_read',
      'read_metadata',
      'allowed',
      '{"note":"signed-url was redacted"}'::jsonb
    )
  $statement$
);

SELECT pg_temp.expect_rejected(
  'document_admin cannot record unsafe Storage path metadata',
  $statement$
    SELECT public.record_document_access_event(
      '00000000-0000-0000-0000-000000971001',
      '00000000-0000-0000-0000-000000971901',
      '00000000-0000-0000-0000-000000971911',
      'metadata_read',
      'read_metadata',
      'allowed',
      '{"storage_path":"documents/tenant/document/file.pdf"}'::jsonb
    )
  $statement$
);

SELECT pg_temp.expect_rejected(
  'document_admin cannot record unsafe token metadata',
  $statement$
    SELECT public.record_document_access_event(
      '00000000-0000-0000-0000-000000971001',
      '00000000-0000-0000-0000-000000971901',
      '00000000-0000-0000-0000-000000971911',
      'metadata_read',
      'read_metadata',
      'allowed',
      '{"token":"redacted-token"}'::jsonb
    )
  $statement$
);

SELECT pg_temp.expect_rejected(
  'document_admin cannot record unsafe secret metadata',
  $statement$
    SELECT public.record_document_access_event(
      '00000000-0000-0000-0000-000000971001',
      '00000000-0000-0000-0000-000000971901',
      '00000000-0000-0000-0000-000000971911',
      'metadata_read',
      'read_metadata',
      'allowed',
      '{"secret":"redacted-secret"}'::jsonb
    )
  $statement$
);

SELECT pg_temp.expect_rejected(
  'document_admin cannot record unsafe document payload metadata',
  $statement$
    SELECT public.record_document_access_event(
      '00000000-0000-0000-0000-000000971001',
      '00000000-0000-0000-0000-000000971901',
      '00000000-0000-0000-0000-000000971911',
      'metadata_read',
      'read_metadata',
      'allowed',
      '{"raw_document_payload":"redacted-content"}'::jsonb
    )
  $statement$
);

SELECT pg_temp.expect_rejected(
  'document_admin cannot record unsafe signature metadata',
  $statement$
    SELECT public.record_document_access_event(
      '00000000-0000-0000-0000-000000971001',
      '00000000-0000-0000-0000-000000971901',
      '00000000-0000-0000-0000-000000971911',
      'metadata_read',
      'read_metadata',
      'allowed',
      '{"signature_id":"00000000-0000-0000-0000-000000000000"}'::jsonb
    )
  $statement$
);

SELECT pg_temp.expect_rejected(
  'document_admin cannot record unsafe document hash metadata',
  $statement$
    SELECT public.record_document_access_event(
      '00000000-0000-0000-0000-000000971001',
      '00000000-0000-0000-0000-000000971901',
      '00000000-0000-0000-0000-000000971911',
      'metadata_read',
      'read_metadata',
      'allowed',
      '{"document_hash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}'::jsonb
    )
  $statement$
);

SELECT pg_temp.expect_rejected(
  'document_admin cannot record unsafe array metadata',
  $statement$
    SELECT public.record_document_access_event(
      '00000000-0000-0000-0000-000000971001',
      '00000000-0000-0000-0000-000000971901',
      '00000000-0000-0000-0000-000000971911',
      'metadata_read',
      'read_metadata',
      'allowed',
      '{"scopes":["read_metadata"]}'::jsonb
    )
  $statement$
);

SELECT pg_temp.expect_rejected(
  'document_admin cannot record unsafe long text metadata',
  $statement$
    SELECT public.record_document_access_event(
      '00000000-0000-0000-0000-000000971001',
      '00000000-0000-0000-0000-000000971901',
      '00000000-0000-0000-0000-000000971911',
      'metadata_read',
      'read_metadata',
      'allowed',
      jsonb_build_object('note', repeat('x', 513))
    )
  $statement$
);

SELECT pg_temp.expect_rejected(
  'document_admin cannot insert document access audit rows directly',
  $statement$
    INSERT INTO public.document_access_events (
      id,
      organization_id,
      document_id,
      document_version_id,
      actor_user_id,
      actor_person_profile_id,
      organization_membership_id,
      event_type,
      access_level,
      result,
      metadata
    )
    VALUES (
      '00000000-0000-0000-0000-000000971981',
      '00000000-0000-0000-0000-000000971001',
      '00000000-0000-0000-0000-000000971901',
      '00000000-0000-0000-0000-000000971911',
      '00000000-0000-0000-0000-000000971104',
      '00000000-0000-0000-0000-000000971404',
      '00000000-0000-0000-0000-000000971204',
      'metadata_read',
      'read_metadata',
      'allowed',
      '{"qa":"S.71","case":"direct-insert"}'::jsonb
    )
  $statement$
);

SELECT pg_temp.expect_rejected(
  'document_admin cannot update document access audit rows directly',
  $statement$
    UPDATE public.document_access_events
    SET metadata = '{"qa":"S.71","case":"direct-update"}'::jsonb
    WHERE document_id = '00000000-0000-0000-0000-000000971901'
  $statement$
);

SELECT pg_temp.expect_rejected(
  'document_admin cannot delete document access audit rows directly',
  $statement$
    DELETE FROM public.document_access_events
    WHERE document_id = '00000000-0000-0000-0000-000000971901'
  $statement$
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000971107');

WITH inserted_event AS (
  SELECT *
  FROM public.record_document_access_event(
    '00000000-0000-0000-0000-000000971001',
    '00000000-0000-0000-0000-000000971901',
    '00000000-0000-0000-0000-000000971911',
    'file_download',
    'download',
    'allowed',
    '{"qa":"S.71","case":"download-allowed"}'::jsonb
  )
)
SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 1
      AND bool_and(actor_user_id = '00000000-0000-0000-0000-000000971107')
      AND bool_and(event_type = 'file_download')
      AND bool_and(access_level = 'download')
      AND bool_and(result = 'allowed')
    FROM inserted_event
  ),
  'download grant user can record allowed file_download audit without Storage access'
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000971108');

SELECT pg_temp.expect_rejected(
  'no-grant user cannot record allowed metadata_read audit',
  $statement$
    SELECT public.record_document_access_event(
      '00000000-0000-0000-0000-000000971001',
      '00000000-0000-0000-0000-000000971901',
      '00000000-0000-0000-0000-000000971911',
      'metadata_read',
      'read_metadata',
      'allowed',
      '{"qa":"S.71","case":"no-grant-allowed"}'::jsonb
    )
  $statement$
);

WITH inserted_event AS (
  SELECT *
  FROM public.record_document_access_event(
    '00000000-0000-0000-0000-000000971001',
    '00000000-0000-0000-0000-000000971901',
    NULL::uuid,
    'metadata_read',
    'read_metadata',
    'denied',
    '{"qa":"S.71","case":"metadata-denied"}'::jsonb
  )
)
SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 1
      AND bool_and(actor_user_id = '00000000-0000-0000-0000-000000971108')
      AND bool_and(event_type = 'metadata_read')
      AND bool_and(access_level = 'read_metadata')
      AND bool_and(result = 'denied')
    FROM inserted_event
  ),
  'no-grant user can record bounded denied metadata_read audit without gaining access'
);

WITH inserted_event AS (
  SELECT *
  FROM public.record_document_access_event(
    '00000000-0000-0000-0000-000000971001',
    '00000000-0000-0000-0000-000000971901',
    '00000000-0000-0000-0000-000000971911',
    'file_preview',
    'preview',
    'denied',
    '{"qa":"S.71","case":"preview-denied"}'::jsonb
  )
)
SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 1
      AND bool_and(actor_user_id = '00000000-0000-0000-0000-000000971108')
      AND bool_and(event_type = 'file_preview')
      AND bool_and(access_level = 'preview')
      AND bool_and(result = 'denied')
    FROM inserted_event
  ),
  'no-grant user can record bounded denied file_preview audit without gaining access'
);

WITH inserted_event AS (
  SELECT *
  FROM public.record_document_access_event(
    '00000000-0000-0000-0000-000000971001',
    '00000000-0000-0000-0000-000000971901',
    '00000000-0000-0000-0000-000000971911',
    'file_download',
    'download',
    'denied',
    '{"qa":"S.71","case":"download-denied"}'::jsonb
  )
)
SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 1
      AND bool_and(actor_user_id = '00000000-0000-0000-0000-000000971108')
      AND bool_and(event_type = 'file_download')
      AND bool_and(access_level = 'download')
      AND bool_and(result = 'denied')
    FROM inserted_event
  ),
  'no-grant user can record bounded denied file_download audit without gaining access'
);

SELECT pg_temp.assert_true(
  NOT public.can_access_document(
    '00000000-0000-0000-0000-000000971901',
    '00000000-0000-0000-0000-000000971001',
    '00000000-0000-0000-0000-000000971911',
    'read_metadata'
  )
  AND (
    SELECT count(*) = 0
    FROM public.list_accessible_document_versions(
      '00000000-0000-0000-0000-000000971001',
      NULL,
      100
    )
  )
  AND (
    SELECT count(*) = 0
    FROM public.document_access_events
    WHERE document_id = '00000000-0000-0000-0000-000000971901'
  ),
  'recording denied audit events does not grant document metadata or audit visibility'
);

SELECT pg_temp.expect_rejected(
  'denied grant_created audit events are out of scope',
  $statement$
    SELECT public.record_document_access_event(
      '00000000-0000-0000-0000-000000971001',
      '00000000-0000-0000-0000-000000971901',
      NULL::uuid,
      'grant_created',
      NULL,
      'denied',
      '{"qa":"S.71","case":"denied-change-event"}'::jsonb
    )
  $statement$
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000971101');

SELECT pg_temp.assert_true(
  NOT public.can_read_document_access_events(
    '00000000-0000-0000-0000-000000971901',
    '00000000-0000-0000-0000-000000971001'
  )
  AND (
    SELECT count(*) = 0
    FROM public.document_access_events
    WHERE document_id = '00000000-0000-0000-0000-000000971901'
  ),
  'owner does not read document audit by operational inheritance'
);

SELECT pg_temp.expect_rejected(
  'owner cannot list document audit without audit capability',
  $statement$
    SELECT *
    FROM public.list_document_access_events_for_document(
      '00000000-0000-0000-0000-000000971001',
      '00000000-0000-0000-0000-000000971901',
      100
    )
  $statement$
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000971102');

SELECT pg_temp.assert_true(
  NOT public.can_read_document_access_events(
    '00000000-0000-0000-0000-000000971901',
    '00000000-0000-0000-0000-000000971001'
  )
  AND (
    SELECT count(*) = 0
    FROM public.document_access_events
    WHERE document_id = '00000000-0000-0000-0000-000000971901'
  ),
  'admin does not read document audit by operational inheritance'
);

SELECT pg_temp.expect_rejected(
  'admin cannot list document audit without audit capability',
  $statement$
    SELECT *
    FROM public.list_document_access_events_for_document(
      '00000000-0000-0000-0000-000000971001',
      '00000000-0000-0000-0000-000000971901',
      100
    )
  $statement$
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000971103');

SELECT pg_temp.assert_true(
  NOT public.can_read_document_access_events(
    '00000000-0000-0000-0000-000000971901',
    '00000000-0000-0000-0000-000000971001'
  )
  AND (
    SELECT count(*) = 0
    FROM public.document_access_events
    WHERE document_id = '00000000-0000-0000-0000-000000971901'
  ),
  'manager does not read document audit by operational inheritance'
);

SELECT pg_temp.expect_rejected(
  'manager cannot list document audit without audit capability',
  $statement$
    SELECT *
    FROM public.list_document_access_events_for_document(
      '00000000-0000-0000-0000-000000971001',
      '00000000-0000-0000-0000-000000971901',
      100
    )
  $statement$
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000971104');

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 6
    FROM public.list_document_access_events_for_document(
      '00000000-0000-0000-0000-000000971001',
      '00000000-0000-0000-0000-000000971901',
      100
    )
  )
  AND (
    SELECT count(*) = 6
    FROM public.document_access_events
    WHERE document_id = '00000000-0000-0000-0000-000000971901'
  ),
  'document_admin can list non-payroll document audit events for tenant A'
);

SELECT pg_temp.expect_rejected(
  'document_admin cannot list payroll document audit',
  $statement$
    SELECT *
    FROM public.list_document_access_events_for_document(
      '00000000-0000-0000-0000-000000971001',
      '00000000-0000-0000-0000-000000971902',
      100
    )
  $statement$
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000971105');

WITH inserted_event AS (
  SELECT *
  FROM public.record_document_access_event(
    '00000000-0000-0000-0000-000000971001',
    '00000000-0000-0000-0000-000000971902',
    '00000000-0000-0000-0000-000000971912',
    'metadata_read',
    'read_metadata',
    'allowed',
    '{"qa":"S.71","case":"payroll-audit-allowed"}'::jsonb
  )
)
SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 1
      AND bool_and(actor_user_id = '00000000-0000-0000-0000-000000971105')
      AND bool_and(document_id = '00000000-0000-0000-0000-000000971902')
      AND bool_and(result = 'allowed')
    FROM inserted_event
  ),
  'payroll_manager can record allowed payroll document audit under current DB policy'
);

SELECT pg_temp.assert_true(
  public.can_read_document_access_events(
    '00000000-0000-0000-0000-000000971902',
    '00000000-0000-0000-0000-000000971001'
  )
  AND NOT public.can_read_document_access_events(
    '00000000-0000-0000-0000-000000971901',
    '00000000-0000-0000-0000-000000971001'
  ),
  'payroll_manager reads only payroll document audit under current DB policy'
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 1
    FROM public.list_document_access_events_for_document(
      '00000000-0000-0000-0000-000000971001',
      '00000000-0000-0000-0000-000000971902',
      100
    )
  )
  AND (
    SELECT count(*) = 0
    FROM public.document_access_events
    WHERE document_id = '00000000-0000-0000-0000-000000971901'
  ),
  'payroll_manager can list payroll audit but not non-payroll audit'
);

SELECT pg_temp.expect_rejected(
  'payroll_manager cannot list non-payroll document audit',
  $statement$
    SELECT *
    FROM public.list_document_access_events_for_document(
      '00000000-0000-0000-0000-000000971001',
      '00000000-0000-0000-0000-000000971901',
      100
    )
  $statement$
);

SELECT pg_temp.use_auth_user('00000000-0000-0000-0000-000000971109');

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 0
    FROM public.document_access_events
    WHERE document_id IN (
      '00000000-0000-0000-0000-000000971901',
      '00000000-0000-0000-0000-000000971902'
    )
  ),
  'tenant B document_admin cannot read tenant A document audit through RLS'
);

SELECT pg_temp.expect_rejected(
  'tenant B document_admin cannot list tenant A document audit',
  $statement$
    SELECT *
    FROM public.list_document_access_events_for_document(
      '00000000-0000-0000-0000-000000971001',
      '00000000-0000-0000-0000-000000971901',
      100
    )
  $statement$
);

SELECT pg_temp.expect_rejected(
  'tenant B document_admin cannot record denied audit for tenant A document',
  $statement$
    SELECT public.record_document_access_event(
      '00000000-0000-0000-0000-000000971001',
      '00000000-0000-0000-0000-000000971901',
      NULL::uuid,
      'metadata_read',
      'read_metadata',
      'denied',
      '{"qa":"S.71","case":"tenant-b-cross-record"}'::jsonb
    )
  $statement$
);

WITH inserted_event AS (
  SELECT *
  FROM public.record_document_access_event(
    '00000000-0000-0000-0000-000000971002',
    '00000000-0000-0000-0000-000000971903',
    '00000000-0000-0000-0000-000000971913',
    'metadata_read',
    'read_metadata',
    'allowed',
    '{"qa":"S.71","case":"tenant-b-own-audit"}'::jsonb
  )
)
SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 1
      AND bool_and(organization_id = '00000000-0000-0000-0000-000000971002')
      AND bool_and(document_id = '00000000-0000-0000-0000-000000971903')
      AND bool_and(actor_user_id = '00000000-0000-0000-0000-000000971109')
    FROM inserted_event
  ),
  'tenant B document_admin can record tenant B document audit only inside tenant B'
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 1
    FROM public.list_document_access_events_for_document(
      '00000000-0000-0000-0000-000000971002',
      '00000000-0000-0000-0000-000000971903',
      100
    )
  ),
  'tenant B document_admin can list tenant B document audit'
);

RESET ROLE;

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 7
    FROM public.document_access_events
    WHERE organization_id = '00000000-0000-0000-0000-000000971001'
  ),
  'tenant A document audit events were created only through allowed RPC paths before rollback'
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 1
    FROM public.document_access_events
    WHERE organization_id = '00000000-0000-0000-0000-000000971002'
  ),
  'tenant B document audit event remains tenant B scoped before rollback'
);

SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1
    FROM public.document_access_events
    WHERE id = '00000000-0000-0000-0000-000000971981'
  ),
  'forbidden direct document access audit insert was not persisted before rollback'
);

ROLLBACK;
