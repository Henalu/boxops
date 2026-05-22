-- BoxOps - Fase E.11 minimal visible document repository
-- Lists only document versions visible to the authenticated user through
-- can_access_document. It does not open uploads, grant management, signable
-- documents, sensitive HR documents, signature evidence, payroll documents or
-- client-side signed URLs.

CREATE OR REPLACE FUNCTION public.list_accessible_document_versions(
  target_organization_id uuid,
  target_document_scope text DEFAULT NULL,
  target_limit integer DEFAULT 100
)
RETURNS TABLE (
  document_id uuid,
  document_version_id uuid,
  organization_id uuid,
  title text,
  description text,
  document_type text,
  document_scope text,
  sensitivity_level text,
  document_status text,
  version_number integer,
  version_status text,
  original_filename text,
  mime_type text,
  size_bytes integer,
  activated_at timestamptz,
  archived_at timestamptz,
  document_updated_at timestamptz,
  version_updated_at timestamptz,
  can_preview boolean,
  can_download boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := (select auth.uid());
  normalized_scope text := NULLIF(lower(btrim(COALESCE(target_document_scope, ''))), '');
  bounded_limit integer := LEAST(GREATEST(COALESCE(target_limit, 100), 1), 200);
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF NOT public.is_org_member(target_organization_id) THEN
    RAISE EXCEPTION 'active membership required';
  END IF;

  IF normalized_scope IS NOT NULL
    AND normalized_scope NOT IN (
      'company',
      'person_private',
      'management_private',
      'certification',
      'programming'
    ) THEN
    RAISE EXCEPTION 'document scope is not allowed';
  END IF;

  RETURN QUERY
  SELECT
    document.id AS document_id,
    document_version.id AS document_version_id,
    document.organization_id,
    document.title,
    document.description,
    document.document_type,
    document.document_scope,
    document.sensitivity_level,
    document.status AS document_status,
    document_version.version_number,
    document_version.status AS version_status,
    document_version.original_filename,
    document_version.mime_type,
    document_version.size_bytes,
    document_version.activated_at,
    document_version.archived_at,
    document.updated_at AS document_updated_at,
    document_version.updated_at AS version_updated_at,
    public.can_access_document(
      document.id,
      document.organization_id,
      document_version.id,
      'preview'
    ) AS can_preview,
    public.can_access_document(
      document.id,
      document.organization_id,
      document_version.id,
      'download'
    ) AS can_download
  FROM public.documents document
  INNER JOIN public.document_versions document_version
    ON document_version.document_id = document.id
   AND document_version.organization_id = document.organization_id
  WHERE document.organization_id = target_organization_id
    AND (normalized_scope IS NULL OR document.document_scope = normalized_scope)
    AND document.status IN ('active', 'archived')
    AND document.requires_signature = false
    AND document.sensitivity_level NOT IN (
      'sensitive_hr',
      'payroll',
      'signature_evidence'
    )
    AND document_version.status IN ('active', 'archived')
    AND document_version.storage_bucket = 'document-files'
    AND public.can_access_document(
      document.id,
      document.organization_id,
      document_version.id,
      'read_metadata'
    )
  ORDER BY
    document.updated_at DESC,
    document.title ASC,
    document_version.version_number DESC
  LIMIT bounded_limit;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.list_accessible_document_versions(uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_accessible_document_versions(uuid, text, integer) TO authenticated;
