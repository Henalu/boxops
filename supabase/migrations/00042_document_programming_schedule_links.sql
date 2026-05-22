-- BoxOps - E.7/I.28 document programming schedule links foundation
-- Creates an internal tenant-scoped association between existing programming
-- documents/versions and schedule context. This does not create visible UI,
-- document upload, signable documents, AI, embeddings, vector search, jobs or cron.

-- ============================================================
-- Programming document capabilities in explicit grants
-- ============================================================

ALTER TABLE public.document_access_grants
  DROP CONSTRAINT document_access_grants_capability_value;

ALTER TABLE public.document_access_grants
  ADD CONSTRAINT document_access_grants_capability_value
  CHECK (
    capability IS NULL
    OR capability IN (
      'document_company_read',
      'document_company_manage',
      'document_personal_self_read',
      'document_personal_manage',
      'document_management_read',
      'document_management_manage',
      'document_grant_manage',
      'certification_self_submit',
      'certification_manage',
      'programming_content_read',
      'programming_content_manage',
      'signature_request_manage',
      'document_sign_self',
      'signature_evidence_read',
      'document_access_audit_read',
      'payroll_private_manage'
    )
  );

CREATE OR REPLACE FUNCTION public.has_document_capability(
  target_organization_id uuid,
  target_capability text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE target_capability
    WHEN 'document_company_read' THEN
      public.has_org_role(target_organization_id, ARRAY['owner', 'admin', 'document_admin'])
    WHEN 'document_company_manage' THEN
      public.has_org_role(target_organization_id, ARRAY['owner', 'admin', 'document_admin'])
    WHEN 'document_personal_manage' THEN
      public.has_org_role(target_organization_id, ARRAY['document_admin'])
    WHEN 'document_management_read' THEN
      public.has_org_role(target_organization_id, ARRAY['document_admin'])
    WHEN 'document_management_manage' THEN
      public.has_org_role(target_organization_id, ARRAY['document_admin'])
    WHEN 'document_grant_manage' THEN
      public.has_org_role(target_organization_id, ARRAY['document_admin'])
    WHEN 'certification_manage' THEN
      public.has_org_role(target_organization_id, ARRAY['document_admin'])
    WHEN 'programming_content_read' THEN
      public.has_org_role(target_organization_id, ARRAY['owner', 'admin', 'manager', 'coach', 'document_admin'])
    WHEN 'programming_content_manage' THEN
      public.has_org_role(target_organization_id, ARRAY['owner', 'admin', 'document_admin'])
    WHEN 'signature_request_manage' THEN
      false
    WHEN 'document_sign_self' THEN
      false
    WHEN 'signature_evidence_read' THEN
      false
    WHEN 'document_access_audit_read' THEN
      public.has_org_role(target_organization_id, ARRAY['document_admin'])
    WHEN 'payroll_private_manage' THEN
      public.has_org_role(target_organization_id, ARRAY['payroll_manager'])
    ELSE
      false
  END;
$$;

-- ============================================================
-- Schedule/context links for programming document versions
-- ============================================================

CREATE TABLE public.document_programming_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  document_id uuid NOT NULL,
  document_version_id uuid NOT NULL,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  class_type_id uuid,
  center_id uuid,
  schedule_block_id uuid,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'removed')),
  created_by_user_id uuid NOT NULL,
  updated_by_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id),
  FOREIGN KEY (document_id, organization_id)
    REFERENCES public.documents(id, organization_id)
    ON DELETE CASCADE,
  FOREIGN KEY (document_version_id, document_id, organization_id)
    REFERENCES public.document_versions(id, document_id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (class_type_id, organization_id)
    REFERENCES public.class_types(id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (center_id, organization_id)
    REFERENCES public.centers(id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (schedule_block_id, organization_id)
    REFERENCES public.schedule_blocks(id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, created_by_user_id)
    REFERENCES public.organization_memberships(organization_id, user_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, updated_by_user_id)
    REFERENCES public.organization_memberships(organization_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT document_programming_links_date_range
    CHECK (
      starts_on <= ends_on
      AND ends_on <= starts_on + 366
    )
);

CREATE INDEX document_programming_links_org_dates_idx
  ON public.document_programming_links (organization_id, starts_on, ends_on, status);

CREATE INDEX document_programming_links_document_idx
  ON public.document_programming_links (organization_id, document_id, document_version_id, status);

CREATE INDEX document_programming_links_block_idx
  ON public.document_programming_links (organization_id, schedule_block_id, status)
  WHERE schedule_block_id IS NOT NULL;

CREATE INDEX document_programming_links_center_type_idx
  ON public.document_programming_links (organization_id, center_id, class_type_id, status);

CREATE UNIQUE INDEX document_programming_links_unique_active_context_idx
  ON public.document_programming_links (
    organization_id,
    document_version_id,
    starts_on,
    ends_on,
    COALESCE(center_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(class_type_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(schedule_block_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  WHERE status = 'active';

CREATE TRIGGER document_programming_links_set_updated_at
  BEFORE UPDATE ON public.document_programming_links
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- Validation helpers
-- ============================================================

CREATE OR REPLACE FUNCTION public.validate_document_programming_link_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  linked_document public.documents;
  linked_version public.document_versions;
  linked_block public.schedule_blocks;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id <> OLD.id
      OR NEW.organization_id <> OLD.organization_id
      OR NEW.document_id <> OLD.document_id
      OR NEW.document_version_id <> OLD.document_version_id
      OR NEW.starts_on <> OLD.starts_on
      OR NEW.ends_on <> OLD.ends_on
      OR NEW.class_type_id IS DISTINCT FROM OLD.class_type_id
      OR NEW.center_id IS DISTINCT FROM OLD.center_id
      OR NEW.schedule_block_id IS DISTINCT FROM OLD.schedule_block_id
      OR NEW.created_by_user_id <> OLD.created_by_user_id
      OR NEW.created_at <> OLD.created_at THEN
      RAISE EXCEPTION 'document programming link immutable fields cannot be changed';
    END IF;
  END IF;

  SELECT document.*
  INTO linked_document
  FROM public.documents document
  WHERE document.id = NEW.document_id
    AND document.organization_id = NEW.organization_id;

  IF linked_document.id IS NULL THEN
    RAISE EXCEPTION 'programming document was not found in tenant';
  END IF;

  IF linked_document.document_scope <> 'programming' THEN
    RAISE EXCEPTION 'document programming links require document_scope programming';
  END IF;

  IF linked_document.status NOT IN ('active', 'archived') THEN
    RAISE EXCEPTION 'programming document status is not linkable';
  END IF;

  IF linked_document.requires_signature THEN
    RAISE EXCEPTION 'signable programming documents are out of scope';
  END IF;

  SELECT document_version.*
  INTO linked_version
  FROM public.document_versions document_version
  WHERE document_version.id = NEW.document_version_id
    AND document_version.document_id = NEW.document_id
    AND document_version.organization_id = NEW.organization_id;

  IF linked_version.id IS NULL THEN
    RAISE EXCEPTION 'programming document version was not found in tenant';
  END IF;

  IF linked_version.status NOT IN ('active', 'archived') THEN
    RAISE EXCEPTION 'programming document version status is not linkable';
  END IF;

  IF TG_OP = 'INSERT'
    AND NOT EXISTS (
    SELECT 1
    FROM public.organization_memberships membership
    WHERE membership.organization_id = NEW.organization_id
      AND membership.user_id = NEW.created_by_user_id
      AND membership.status = 'active'
  ) THEN
    RAISE EXCEPTION 'active creator membership is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.organization_memberships membership
    WHERE membership.organization_id = NEW.organization_id
      AND membership.user_id = NEW.updated_by_user_id
      AND membership.status = 'active'
  ) THEN
    RAISE EXCEPTION 'active updater membership is required';
  END IF;

  IF NEW.schedule_block_id IS NOT NULL THEN
    SELECT block.*
    INTO linked_block
    FROM public.schedule_blocks block
    WHERE block.id = NEW.schedule_block_id
      AND block.organization_id = NEW.organization_id;

    IF linked_block.id IS NULL THEN
      RAISE EXCEPTION 'schedule block was not found in tenant';
    END IF;

    IF linked_block.service_date < NEW.starts_on
      OR linked_block.service_date > NEW.ends_on THEN
      RAISE EXCEPTION 'schedule block date must be inside programming link date range';
    END IF;

    IF NEW.center_id IS NOT NULL
      AND NEW.center_id <> linked_block.center_id THEN
      RAISE EXCEPTION 'programming link center must match schedule block center';
    END IF;

    IF NEW.class_type_id IS NOT NULL
      AND NEW.class_type_id <> linked_block.class_type_id THEN
      RAISE EXCEPTION 'programming link class type must match schedule block class type';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER document_programming_links_validate_row
  BEFORE INSERT OR UPDATE ON public.document_programming_links
  FOR EACH ROW EXECUTE FUNCTION public.validate_document_programming_link_row();

CREATE OR REPLACE FUNCTION public.can_manage_document_programming_link(
  target_organization_id uuid,
  target_document_id uuid,
  target_document_version_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.can_access_document(
      target_document_id,
      target_organization_id,
      target_document_version_id,
      'manage'
    )
    AND EXISTS (
      SELECT 1
      FROM public.documents document
      INNER JOIN public.document_versions document_version
        ON document_version.document_id = document.id
       AND document_version.organization_id = document.organization_id
      WHERE document.id = target_document_id
        AND document.organization_id = target_organization_id
        AND document.document_scope = 'programming'
        AND document.status IN ('active', 'archived')
        AND document.requires_signature = false
        AND document_version.id = target_document_version_id
        AND document_version.status IN ('active', 'archived')
    );
$$;

-- ============================================================
-- RPCs
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_document_programming_link(
  target_organization_id uuid,
  target_document_id uuid,
  target_document_version_id uuid,
  target_starts_on date,
  target_ends_on date DEFAULT NULL,
  target_class_type_id uuid DEFAULT NULL,
  target_center_id uuid DEFAULT NULL,
  target_schedule_block_id uuid DEFAULT NULL
)
RETURNS public.document_programming_links
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := (select auth.uid());
  normalized_ends_on date := COALESCE(target_ends_on, target_starts_on);
  created_link public.document_programming_links;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF NOT public.is_org_member(target_organization_id) THEN
    RAISE EXCEPTION 'active membership required';
  END IF;

  IF NOT public.can_manage_document_programming_link(
    target_organization_id,
    target_document_id,
    target_document_version_id
  ) THEN
    RAISE EXCEPTION 'document programming management permission required';
  END IF;

  IF target_starts_on IS NULL
    OR normalized_ends_on IS NULL
    OR target_starts_on > normalized_ends_on
    OR normalized_ends_on > target_starts_on + 366 THEN
    RAISE EXCEPTION 'document programming date range is invalid';
  END IF;

  INSERT INTO public.document_programming_links (
    organization_id,
    document_id,
    document_version_id,
    starts_on,
    ends_on,
    class_type_id,
    center_id,
    schedule_block_id,
    status,
    created_by_user_id,
    updated_by_user_id
  )
  VALUES (
    target_organization_id,
    target_document_id,
    target_document_version_id,
    target_starts_on,
    normalized_ends_on,
    target_class_type_id,
    target_center_id,
    target_schedule_block_id,
    'active',
    current_user_id,
    current_user_id
  )
  RETURNING *
  INTO created_link;

  RETURN created_link;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_document_programming_link_status(
  target_organization_id uuid,
  target_document_programming_link_id uuid,
  target_status text
)
RETURNS public.document_programming_links
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := (select auth.uid());
  existing_link public.document_programming_links;
  normalized_status text := lower(btrim(COALESCE(target_status, '')));
  updated_link public.document_programming_links;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF normalized_status NOT IN ('active', 'removed') THEN
    RAISE EXCEPTION 'document programming link status is not allowed';
  END IF;

  SELECT link.*
  INTO existing_link
  FROM public.document_programming_links link
  WHERE link.id = target_document_programming_link_id
    AND link.organization_id = target_organization_id
  FOR UPDATE;

  IF existing_link.id IS NULL THEN
    RAISE EXCEPTION 'document programming link was not found in tenant';
  END IF;

  IF NOT public.can_manage_document_programming_link(
    target_organization_id,
    existing_link.document_id,
    existing_link.document_version_id
  ) THEN
    RAISE EXCEPTION 'document programming management permission required';
  END IF;

  UPDATE public.document_programming_links
  SET
    status = normalized_status,
    updated_by_user_id = current_user_id
  WHERE id = existing_link.id
    AND organization_id = existing_link.organization_id
  RETURNING *
  INTO updated_link;

  RETURN updated_link;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_document_programming_for_block(
  target_organization_id uuid,
  target_schedule_block_id uuid,
  target_access_level text DEFAULT 'read_metadata',
  target_limit integer DEFAULT 50
)
RETURNS TABLE (
  programming_link_id uuid,
  organization_id uuid,
  document_id uuid,
  document_version_id uuid,
  document_title text,
  document_type text,
  document_status text,
  version_number integer,
  version_status text,
  original_filename text,
  mime_type text,
  size_bytes integer,
  starts_on date,
  ends_on date,
  center_id uuid,
  class_type_id uuid,
  schedule_block_id uuid,
  link_status text,
  created_at timestamptz,
  updated_at timestamptz,
  can_preview boolean,
  can_download boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized_access_level text := lower(btrim(COALESCE(target_access_level, 'read_metadata')));
  requested_rank integer := public.document_access_level_rank(normalized_access_level);
  bounded_limit integer := LEAST(GREATEST(COALESCE(target_limit, 50), 1), 200);
  block_service_date date;
  block_center_id uuid;
  block_class_type_id uuid;
BEGIN
  IF (select auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF requested_rank = 0 OR normalized_access_level NOT IN ('read_metadata', 'preview', 'download') THEN
    RAISE EXCEPTION 'document programming access level is not allowed';
  END IF;

  IF NOT public.is_org_member(target_organization_id) THEN
    RAISE EXCEPTION 'active membership required';
  END IF;

  SELECT block.service_date, block.center_id, block.class_type_id
  INTO block_service_date, block_center_id, block_class_type_id
  FROM public.schedule_blocks block
  WHERE block.id = target_schedule_block_id
    AND block.organization_id = target_organization_id;

  IF block_service_date IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    link.id AS programming_link_id,
    link.organization_id,
    link.document_id,
    link.document_version_id,
    document.title AS document_title,
    document.document_type,
    document.status AS document_status,
    document_version.version_number,
    document_version.status AS version_status,
    document_version.original_filename,
    document_version.mime_type,
    document_version.size_bytes,
    link.starts_on,
    link.ends_on,
    link.center_id,
    link.class_type_id,
    link.schedule_block_id,
    link.status AS link_status,
    link.created_at,
    link.updated_at,
    public.can_access_document(link.document_id, link.organization_id, link.document_version_id, 'preview') AS can_preview,
    public.can_access_document(link.document_id, link.organization_id, link.document_version_id, 'download') AS can_download
  FROM public.document_programming_links link
  INNER JOIN public.documents document
    ON document.id = link.document_id
   AND document.organization_id = link.organization_id
  INNER JOIN public.document_versions document_version
    ON document_version.id = link.document_version_id
   AND document_version.document_id = link.document_id
   AND document_version.organization_id = link.organization_id
  WHERE link.organization_id = target_organization_id
    AND link.status = 'active'
    AND document.document_scope = 'programming'
    AND document.status IN ('active', 'archived')
    AND document.requires_signature = false
    AND document_version.status IN ('active', 'archived')
    AND link.starts_on <= block_service_date
    AND link.ends_on >= block_service_date
    AND (
      link.schedule_block_id = target_schedule_block_id
      OR (
        link.schedule_block_id IS NULL
        AND (link.center_id IS NULL OR link.center_id = block_center_id)
        AND (link.class_type_id IS NULL OR link.class_type_id = block_class_type_id)
      )
    )
    AND public.can_access_document(
      link.document_id,
      link.organization_id,
      link.document_version_id,
      normalized_access_level
    )
  ORDER BY
    CASE WHEN link.schedule_block_id = target_schedule_block_id THEN 0 ELSE 1 END,
    CASE
      WHEN link.center_id = block_center_id AND link.class_type_id = block_class_type_id THEN 0
      WHEN link.center_id = block_center_id OR link.class_type_id = block_class_type_id THEN 1
      ELSE 2
    END,
    link.starts_on DESC,
    document.title ASC,
    document_version.version_number DESC
  LIMIT bounded_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_document_programming_for_context(
  target_organization_id uuid,
  target_service_date date,
  target_class_type_id uuid DEFAULT NULL,
  target_center_id uuid DEFAULT NULL,
  target_access_level text DEFAULT 'read_metadata',
  target_limit integer DEFAULT 50
)
RETURNS TABLE (
  programming_link_id uuid,
  organization_id uuid,
  document_id uuid,
  document_version_id uuid,
  document_title text,
  document_type text,
  document_status text,
  version_number integer,
  version_status text,
  original_filename text,
  mime_type text,
  size_bytes integer,
  starts_on date,
  ends_on date,
  center_id uuid,
  class_type_id uuid,
  schedule_block_id uuid,
  link_status text,
  created_at timestamptz,
  updated_at timestamptz,
  can_preview boolean,
  can_download boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized_access_level text := lower(btrim(COALESCE(target_access_level, 'read_metadata')));
  requested_rank integer := public.document_access_level_rank(normalized_access_level);
  bounded_limit integer := LEAST(GREATEST(COALESCE(target_limit, 50), 1), 200);
BEGIN
  IF (select auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF requested_rank = 0 OR normalized_access_level NOT IN ('read_metadata', 'preview', 'download') THEN
    RAISE EXCEPTION 'document programming access level is not allowed';
  END IF;

  IF target_service_date IS NULL THEN
    RAISE EXCEPTION 'document programming service date is required';
  END IF;

  IF NOT public.is_org_member(target_organization_id) THEN
    RAISE EXCEPTION 'active membership required';
  END IF;

  IF target_center_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.centers center_record
      WHERE center_record.id = target_center_id
        AND center_record.organization_id = target_organization_id
    ) THEN
    RETURN;
  END IF;

  IF target_class_type_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.class_types class_type
      WHERE class_type.id = target_class_type_id
        AND class_type.organization_id = target_organization_id
    ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    link.id AS programming_link_id,
    link.organization_id,
    link.document_id,
    link.document_version_id,
    document.title AS document_title,
    document.document_type,
    document.status AS document_status,
    document_version.version_number,
    document_version.status AS version_status,
    document_version.original_filename,
    document_version.mime_type,
    document_version.size_bytes,
    link.starts_on,
    link.ends_on,
    link.center_id,
    link.class_type_id,
    link.schedule_block_id,
    link.status AS link_status,
    link.created_at,
    link.updated_at,
    public.can_access_document(link.document_id, link.organization_id, link.document_version_id, 'preview') AS can_preview,
    public.can_access_document(link.document_id, link.organization_id, link.document_version_id, 'download') AS can_download
  FROM public.document_programming_links link
  INNER JOIN public.documents document
    ON document.id = link.document_id
   AND document.organization_id = link.organization_id
  INNER JOIN public.document_versions document_version
    ON document_version.id = link.document_version_id
   AND document_version.document_id = link.document_id
   AND document_version.organization_id = link.organization_id
  LEFT JOIN public.schedule_blocks block
    ON block.id = link.schedule_block_id
   AND block.organization_id = link.organization_id
  WHERE link.organization_id = target_organization_id
    AND link.status = 'active'
    AND document.document_scope = 'programming'
    AND document.status IN ('active', 'archived')
    AND document.requires_signature = false
    AND document_version.status IN ('active', 'archived')
    AND link.starts_on <= target_service_date
    AND link.ends_on >= target_service_date
    AND (
      (
        link.schedule_block_id IS NULL
        AND (target_center_id IS NULL OR link.center_id IS NULL OR link.center_id = target_center_id)
        AND (target_class_type_id IS NULL OR link.class_type_id IS NULL OR link.class_type_id = target_class_type_id)
      )
      OR (
        link.schedule_block_id IS NOT NULL
        AND block.service_date = target_service_date
        AND (target_center_id IS NULL OR block.center_id = target_center_id)
        AND (target_class_type_id IS NULL OR block.class_type_id = target_class_type_id)
      )
    )
    AND public.can_access_document(
      link.document_id,
      link.organization_id,
      link.document_version_id,
      normalized_access_level
    )
  ORDER BY
    CASE WHEN link.schedule_block_id IS NULL THEN 1 ELSE 0 END,
    CASE
      WHEN target_center_id IS NOT NULL AND link.center_id = target_center_id THEN 0
      WHEN link.center_id IS NULL THEN 1
      ELSE 2
    END,
    CASE
      WHEN target_class_type_id IS NOT NULL AND link.class_type_id = target_class_type_id THEN 0
      WHEN link.class_type_id IS NULL THEN 1
      ELSE 2
    END,
    link.starts_on DESC,
    document.title ASC,
    document_version.version_number DESC
  LIMIT bounded_limit;
END;
$$;

-- ============================================================
-- Row Level Security and grants
-- ============================================================

ALTER TABLE public.document_programming_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view authorized active document programming links"
  ON public.document_programming_links FOR SELECT TO authenticated
  USING (
    status = 'active'
    AND public.can_access_document(document_id, organization_id, document_version_id, 'read_metadata')
  );

REVOKE ALL ON public.document_programming_links FROM PUBLIC;
REVOKE ALL ON public.document_programming_links FROM anon, authenticated;
GRANT SELECT ON public.document_programming_links TO authenticated;

REVOKE EXECUTE ON FUNCTION public.has_document_capability(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_document_programming_link_row() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_manage_document_programming_link(uuid, uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_document_programming_link(uuid, uuid, uuid, date, date, uuid, uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_document_programming_link_status(uuid, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.list_document_programming_for_block(uuid, uuid, text, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.list_document_programming_for_context(uuid, date, uuid, uuid, text, integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.has_document_capability(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_document_programming_link(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_document_programming_link(uuid, uuid, uuid, date, date, uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_document_programming_link_status(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_document_programming_for_block(uuid, uuid, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_document_programming_for_context(uuid, date, uuid, uuid, text, integer) TO authenticated;
