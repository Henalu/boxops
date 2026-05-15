-- BoxOps - Fase E.3 private document file storage
-- Opens the private `document-files` bucket and connects Storage access to
-- document_versions metadata. This does not create UI, signable documents,
-- signature requests, signature evidences or document access audit events.

-- ============================================================
-- Private Storage bucket
-- ============================================================

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'document-files',
  'document-files',
  false,
  10485760,
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'text/plain',
    'text/csv',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ============================================================
-- File validation helpers
-- ============================================================

CREATE OR REPLACE FUNCTION public.document_file_extension_matches_mime(
  target_mime_type text,
  target_file_extension text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE lower(target_mime_type)
    WHEN 'application/pdf' THEN lower(target_file_extension) = 'pdf'
    WHEN 'image/jpeg' THEN lower(target_file_extension) IN ('jpg', 'jpeg')
    WHEN 'image/png' THEN lower(target_file_extension) = 'png'
    WHEN 'image/webp' THEN lower(target_file_extension) = 'webp'
    WHEN 'text/plain' THEN lower(target_file_extension) = 'txt'
    WHEN 'text/csv' THEN lower(target_file_extension) = 'csv'
    WHEN 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' THEN lower(target_file_extension) = 'docx'
    WHEN 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' THEN lower(target_file_extension) = 'xlsx'
    ELSE false
  END;
$$;

ALTER TABLE public.document_versions
  ADD CONSTRAINT document_versions_mime_type_allowed
  CHECK (
    mime_type IN (
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
      'text/plain',
      'text/csv',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )
  );

ALTER TABLE public.document_versions
  ADD CONSTRAINT document_versions_private_storage_size_limit
  CHECK (size_bytes > 0 AND size_bytes <= 10485760);

ALTER TABLE public.document_versions
  ADD CONSTRAINT document_versions_storage_path_allowed_extension
  CHECK (storage_path ~ '\.(csv|docx|jpeg|jpg|pdf|png|txt|webp|xlsx)$');

CREATE OR REPLACE FUNCTION public.validate_document_version_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := (select auth.uid());
  expected_prefix text;
  storage_extension text;
  parent_document public.documents;
BEGIN
  IF current_user_id IS NOT NULL
    AND TG_OP = 'INSERT'
    AND NEW.uploaded_by_user_id <> current_user_id THEN
    RAISE EXCEPTION 'document version uploader must be the authenticated user';
  END IF;

  SELECT document.*
  INTO parent_document
  FROM public.documents document
  WHERE document.id = NEW.document_id
    AND document.organization_id = NEW.organization_id;

  IF parent_document.id IS NULL THEN
    RAISE EXCEPTION 'document version parent document was not found';
  END IF;

  IF parent_document.requires_signature THEN
    RAISE EXCEPTION 'signable document files are out of scope for this migration';
  END IF;

  IF NEW.status IN ('pending', 'active')
    AND parent_document.status NOT IN ('draft', 'active') THEN
    RAISE EXCEPTION 'document version cannot be pending or active for this document status';
  END IF;

  expected_prefix :=
    'documents/' ||
    NEW.organization_id::text ||
    '/' ||
    NEW.document_id::text ||
    '/versions/' ||
    NEW.id::text ||
    '/';

  IF position(expected_prefix in NEW.storage_path) <> 1 THEN
    RAISE EXCEPTION 'document version storage path does not match its tenant, document and version';
  END IF;

  storage_extension := lower(substring(NEW.storage_path from '\.([a-z0-9]{1,12})$'));

  IF storage_extension IS NULL THEN
    RAISE EXCEPTION 'document version storage path extension is required';
  END IF;

  IF NOT public.document_file_extension_matches_mime(NEW.mime_type, storage_extension) THEN
    RAISE EXCEPTION 'document version file extension does not match mime type';
  END IF;

  IF NEW.size_bytes IS NULL OR NEW.size_bytes <= 0 OR NEW.size_bytes > 10485760 THEN
    RAISE EXCEPTION 'document version file size is not allowed';
  END IF;

  IF NEW.document_hash IS NULL OR NEW.document_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'document version hash is not valid';
  END IF;

  IF NEW.status = 'active' AND NEW.activated_at IS NULL THEN
    NEW.activated_at = now();
  END IF;

  IF NEW.status = 'archived' AND NEW.archived_at IS NULL THEN
    NEW.archived_at = now();
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.id <> OLD.id
      OR NEW.organization_id <> OLD.organization_id
      OR NEW.document_id <> OLD.document_id
      OR NEW.version_number <> OLD.version_number
      OR NEW.uploaded_by_user_id <> OLD.uploaded_by_user_id
      OR NEW.storage_bucket <> OLD.storage_bucket
      OR NEW.storage_path <> OLD.storage_path
      OR NEW.original_filename <> OLD.original_filename
      OR NEW.mime_type <> OLD.mime_type
      OR NEW.size_bytes <> OLD.size_bytes
      OR NEW.document_hash <> OLD.document_hash
      OR NEW.created_at <> OLD.created_at THEN
      RAISE EXCEPTION 'document version immutable fields cannot be changed';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================
-- Controlled document version upload RPCs
-- ============================================================

CREATE OR REPLACE FUNCTION public.begin_document_version_upload(
  target_organization_id uuid,
  target_document_id uuid,
  target_original_filename text,
  target_mime_type text,
  target_size_bytes integer,
  target_document_hash text,
  target_file_extension text,
  target_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS public.document_versions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := (select auth.uid());
  normalized_extension text := lower(btrim(target_file_extension, '. '));
  normalized_mime_type text := lower(btrim(target_mime_type));
  target_document public.documents;
  next_version_number integer;
  new_document_version_id uuid := gen_random_uuid();
  new_asset_id uuid := gen_random_uuid();
  new_storage_path text;
  new_document_version public.document_versions;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF NOT public.is_org_member(target_organization_id) THEN
    RAISE EXCEPTION 'active membership required';
  END IF;

  SELECT document.*
  INTO target_document
  FROM public.documents document
  WHERE document.id = target_document_id
    AND document.organization_id = target_organization_id
  FOR UPDATE;

  IF target_document.id IS NULL THEN
    RAISE EXCEPTION 'document not found';
  END IF;

  IF target_document.status NOT IN ('draft', 'active') THEN
    RAISE EXCEPTION 'document status does not allow uploads';
  END IF;

  IF target_document.requires_signature THEN
    RAISE EXCEPTION 'signable documents are out of scope for this migration';
  END IF;

  IF NOT public.can_manage_document_by_id(target_document.id, target_document.organization_id) THEN
    RAISE EXCEPTION 'document management permission required';
  END IF;

  IF target_original_filename IS NULL
    OR length(btrim(target_original_filename)) = 0
    OR target_original_filename ~ '[/\\]'
    OR length(target_original_filename) > 255 THEN
    RAISE EXCEPTION 'document original filename is not valid';
  END IF;

  IF target_size_bytes IS NULL OR target_size_bytes <= 0 OR target_size_bytes > 10485760 THEN
    RAISE EXCEPTION 'document file size is not allowed';
  END IF;

  IF target_document_hash IS NULL OR target_document_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'document hash is not valid';
  END IF;

  IF normalized_extension IS NULL
    OR normalized_extension !~ '^[a-z0-9]{1,12}$'
    OR NOT public.document_file_extension_matches_mime(normalized_mime_type, normalized_extension) THEN
    RAISE EXCEPTION 'document file extension does not match mime type';
  END IF;

  IF target_metadata IS NULL OR jsonb_typeof(target_metadata) <> 'object' THEN
    RAISE EXCEPTION 'document version metadata must be an object';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext(target_organization_id::text),
    hashtext(target_document_id::text)
  );

  SELECT COALESCE(MAX(document_version.version_number), 0) + 1
  INTO next_version_number
  FROM public.document_versions document_version
  WHERE document_version.organization_id = target_organization_id
    AND document_version.document_id = target_document_id;

  new_storage_path :=
    'documents/' ||
    target_organization_id::text ||
    '/' ||
    target_document_id::text ||
    '/versions/' ||
    new_document_version_id::text ||
    '/' ||
    new_asset_id::text ||
    '.' ||
    normalized_extension;

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
    new_document_version_id,
    target_organization_id,
    target_document_id,
    next_version_number,
    current_user_id,
    'document-files',
    new_storage_path,
    target_original_filename,
    normalized_mime_type,
    target_size_bytes,
    target_document_hash,
    'pending',
    target_metadata
  )
  RETURNING *
  INTO new_document_version;

  RETURN new_document_version;
END;
$$;

CREATE OR REPLACE FUNCTION public.activate_document_version_upload(
  target_document_version_id uuid
)
RETURNS public.document_versions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := (select auth.uid());
  pending_document_version public.document_versions;
  activated_document_version public.document_versions;
  target_document public.documents;
  object_metadata jsonb;
  object_size_text text;
  object_size_bytes integer;
  object_mime_type text;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT document_version.*
  INTO pending_document_version
  FROM public.document_versions document_version
  WHERE document_version.id = target_document_version_id
    AND document_version.status = 'pending'
    AND document_version.uploaded_by_user_id = current_user_id
  FOR UPDATE;

  IF pending_document_version.id IS NULL THEN
    RAISE EXCEPTION 'pending document version not found';
  END IF;

  SELECT document.*
  INTO target_document
  FROM public.documents document
  WHERE document.id = pending_document_version.document_id
    AND document.organization_id = pending_document_version.organization_id
  FOR UPDATE;

  IF target_document.id IS NULL THEN
    RAISE EXCEPTION 'document not found';
  END IF;

  IF target_document.status NOT IN ('draft', 'active') THEN
    RAISE EXCEPTION 'document status does not allow activation';
  END IF;

  IF target_document.requires_signature THEN
    RAISE EXCEPTION 'signable documents are out of scope for this migration';
  END IF;

  IF NOT public.can_manage_document_by_id(target_document.id, target_document.organization_id) THEN
    RAISE EXCEPTION 'document management permission required';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext(pending_document_version.organization_id::text),
    hashtext(pending_document_version.document_id::text)
  );

  SELECT storage_object.metadata
  INTO object_metadata
  FROM storage.objects storage_object
  WHERE storage_object.bucket_id = pending_document_version.storage_bucket
    AND storage_object.name = pending_document_version.storage_path;

  IF object_metadata IS NULL THEN
    RAISE EXCEPTION 'document object was not uploaded';
  END IF;

  object_size_text := COALESCE(
    object_metadata->>'size',
    object_metadata->>'contentLength'
  );

  IF object_size_text IS NULL OR object_size_text !~ '^[0-9]+$' THEN
    RAISE EXCEPTION 'document object size metadata is missing';
  END IF;

  object_size_bytes := object_size_text::integer;

  IF object_size_bytes <> pending_document_version.size_bytes THEN
    RAISE EXCEPTION 'document object size does not match version metadata';
  END IF;

  object_mime_type := COALESCE(
    object_metadata->>'mimetype',
    object_metadata->>'mimeType',
    object_metadata->>'contentType'
  );

  IF object_mime_type IS NULL THEN
    RAISE EXCEPTION 'document object mime metadata is missing';
  END IF;

  IF lower(object_mime_type) <> lower(pending_document_version.mime_type) THEN
    RAISE EXCEPTION 'document object mime type does not match version metadata';
  END IF;

  IF pending_document_version.document_hash IS NULL
    OR pending_document_version.document_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'document hash is not valid';
  END IF;

  UPDATE public.document_versions
  SET
    status = 'archived',
    archived_at = COALESCE(archived_at, now())
  WHERE organization_id = pending_document_version.organization_id
    AND document_id = pending_document_version.document_id
    AND status = 'active'
    AND id <> pending_document_version.id;

  UPDATE public.document_versions
  SET
    status = 'active',
    activated_at = now()
  WHERE id = pending_document_version.id
  RETURNING *
  INTO activated_document_version;

  UPDATE public.documents
  SET current_version_id = activated_document_version.id
  WHERE id = activated_document_version.document_id
    AND organization_id = activated_document_version.organization_id;

  RETURN activated_document_version;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_document_version_upload(
  target_document_version_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := (select auth.uid());
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  UPDATE public.document_versions document_version
  SET status = 'deleted'
  FROM public.documents document
  WHERE document_version.document_id = document.id
    AND document_version.organization_id = document.organization_id
    AND document_version.id = target_document_version_id
    AND document_version.status = 'pending'
    AND document_version.uploaded_by_user_id = current_user_id
    AND document.status IN ('draft', 'active')
    AND document.requires_signature = false
    AND public.can_manage_document_by_id(document.id, document.organization_id);
END;
$$;

-- ============================================================
-- Row Level Security and Storage policies
-- ============================================================

DROP POLICY IF EXISTS "Document managers can create document versions" ON public.document_versions;
DROP POLICY IF EXISTS "Document managers can update document versions" ON public.document_versions;

DROP POLICY IF EXISTS "Document managers can upload pending document files" ON storage.objects;
DROP POLICY IF EXISTS "Users can read accessible document files" ON storage.objects;

CREATE POLICY "Document managers can upload pending document files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'document-files'
    AND EXISTS (
      SELECT 1
      FROM public.document_versions document_version
      INNER JOIN public.documents document
        ON document.id = document_version.document_id
        AND document.organization_id = document_version.organization_id
      WHERE document_version.storage_bucket = bucket_id
        AND document_version.storage_path = name
        AND document_version.status = 'pending'
        AND document_version.uploaded_by_user_id = (select auth.uid())
        AND document.status IN ('draft', 'active')
        AND document.requires_signature = false
        AND public.can_manage_document_by_id(document.id, document.organization_id)
    )
  );

CREATE POLICY "Users can read accessible document files"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'document-files'
    AND EXISTS (
      SELECT 1
      FROM public.document_versions document_version
      INNER JOIN public.documents document
        ON document.id = document_version.document_id
        AND document.organization_id = document_version.organization_id
      WHERE document_version.storage_bucket = bucket_id
        AND document_version.storage_path = name
        AND document_version.status IN ('active', 'archived')
        AND document.status IN ('active', 'archived')
        AND document.requires_signature = false
        AND public.can_access_document(
          document_version.document_id,
          document_version.organization_id,
          document_version.id,
          'preview'
        )
    )
  );

-- Path-level fallback documentation: document_versions.storage_path is
-- constrained to documents/{organization_id}/{document_id}/versions/{version_id}/{asset_id}.{ext};
-- Storage policies above require exact pending metadata before upload and
-- active/archived accessible metadata before reads.

-- ============================================================
-- Grants
-- ============================================================

REVOKE INSERT, UPDATE ON public.document_versions FROM authenticated;
GRANT SELECT ON public.document_versions TO authenticated;

GRANT EXECUTE ON FUNCTION public.document_file_extension_matches_mime(text, text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.begin_document_version_upload(
  uuid,
  uuid,
  text,
  text,
  integer,
  text,
  text,
  jsonb
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.activate_document_version_upload(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_document_version_upload(uuid) TO authenticated;
