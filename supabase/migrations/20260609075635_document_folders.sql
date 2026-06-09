-- BoxOps - Document folders with inherited visibility.
--
-- Folders are tenant-scoped containers for the minimal document repository.
-- A document without folder keeps the previous document-level access model.
-- A document inside a folder inherits folder visibility for non-managers.

CREATE TABLE public.document_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  parent_folder_id uuid,
  created_by_user_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id),
  FOREIGN KEY (parent_folder_id, organization_id)
    REFERENCES public.document_folders(id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, created_by_user_id)
    REFERENCES public.organization_memberships(organization_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT document_folders_name_length
    CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  CONSTRAINT document_folders_description_length
    CHECK (description IS NULL OR char_length(description) <= 500),
  CONSTRAINT document_folders_not_own_parent
    CHECK (parent_folder_id IS NULL OR parent_folder_id <> id),
  CONSTRAINT document_folders_metadata_object
    CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE UNIQUE INDEX document_folders_active_name_unique_idx
  ON public.document_folders (organization_id, lower(btrim(name)))
  WHERE status = 'active';

CREATE INDEX document_folders_org_status_idx
  ON public.document_folders (organization_id, status, name);

CREATE INDEX document_folders_parent_idx
  ON public.document_folders (organization_id, parent_folder_id)
  WHERE parent_folder_id IS NOT NULL;

CREATE TABLE public.document_folder_access_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  folder_id uuid NOT NULL,
  target_type text NOT NULL
    CHECK (target_type IN ('all_members', 'role', 'person')),
  person_profile_id uuid,
  role text,
  access_level text NOT NULL DEFAULT 'download'
    CHECK (access_level IN (
      'read_metadata',
      'preview',
      'download',
      'manage'
    )),
  grant_status text NOT NULL DEFAULT 'active'
    CHECK (grant_status IN ('active', 'revoked')),
  granted_by_user_id uuid NOT NULL,
  expires_at timestamptz,
  revoked_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id),
  FOREIGN KEY (folder_id, organization_id)
    REFERENCES public.document_folders(id, organization_id)
    ON DELETE CASCADE,
  FOREIGN KEY (person_profile_id, organization_id)
    REFERENCES public.person_profiles(id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, granted_by_user_id)
    REFERENCES public.organization_memberships(organization_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT document_folder_access_grants_single_target
    CHECK (
      (
        target_type = 'all_members'
        AND person_profile_id IS NULL
        AND role IS NULL
      )
      OR (
        target_type = 'role'
        AND person_profile_id IS NULL
        AND role IN (
          'owner',
          'admin',
          'manager',
          'center_manager',
          'document_admin',
          'payroll_manager',
          'coach',
          'staff'
        )
      )
      OR (
        target_type = 'person'
        AND person_profile_id IS NOT NULL
        AND role IS NULL
      )
    ),
  CONSTRAINT document_folder_access_grants_revocation_state
    CHECK (
      (grant_status = 'active' AND revoked_at IS NULL)
      OR (grant_status = 'revoked' AND revoked_at IS NOT NULL)
    ),
  CONSTRAINT document_folder_access_grants_expiry_after_creation
    CHECK (expires_at IS NULL OR expires_at > created_at),
  CONSTRAINT document_folder_access_grants_metadata_object
    CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX document_folder_access_grants_folder_idx
  ON public.document_folder_access_grants (
    organization_id,
    folder_id,
    grant_status,
    access_level
  );

CREATE INDEX document_folder_access_grants_person_idx
  ON public.document_folder_access_grants (organization_id, person_profile_id)
  WHERE person_profile_id IS NOT NULL AND grant_status = 'active';

CREATE INDEX document_folder_access_grants_role_idx
  ON public.document_folder_access_grants (organization_id, role)
  WHERE role IS NOT NULL AND grant_status = 'active';

CREATE UNIQUE INDEX document_folder_access_grants_all_active_unique_idx
  ON public.document_folder_access_grants (organization_id, folder_id)
  WHERE target_type = 'all_members' AND grant_status = 'active';

CREATE UNIQUE INDEX document_folder_access_grants_role_active_unique_idx
  ON public.document_folder_access_grants (organization_id, folder_id, role)
  WHERE target_type = 'role' AND grant_status = 'active';

CREATE UNIQUE INDEX document_folder_access_grants_person_active_unique_idx
  ON public.document_folder_access_grants (
    organization_id,
    folder_id,
    person_profile_id
  )
  WHERE target_type = 'person' AND grant_status = 'active';

ALTER TABLE public.documents
  ADD COLUMN folder_id uuid,
  ADD CONSTRAINT documents_folder_fk
    FOREIGN KEY (folder_id, organization_id)
    REFERENCES public.document_folders(id, organization_id)
    ON DELETE RESTRICT;

CREATE INDEX documents_folder_idx
  ON public.documents (organization_id, folder_id, status)
  WHERE folder_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.can_manage_document_folder_metadata(
  target_organization_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_org_role(
    target_organization_id,
    ARRAY['owner', 'admin', 'document_admin']
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_document_folder_by_id(
  target_folder_id uuid,
  target_organization_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT public.can_manage_document_folder_metadata(folder.organization_id)
    FROM public.document_folders folder
    WHERE folder.id = target_folder_id
      AND folder.organization_id = target_organization_id
  ), false);
$$;

CREATE OR REPLACE FUNCTION public.can_access_document_folder(
  target_folder_id uuid,
  target_organization_id uuid,
  target_access_level text DEFAULT 'read_metadata'
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := (select auth.uid());
  current_membership public.organization_memberships;
  own_person_profile_id uuid;
  requested_rank integer := public.document_access_level_rank(target_access_level);
  target_folder public.document_folders;
BEGIN
  IF current_user_id IS NULL OR requested_rank = 0 THEN
    RETURN false;
  END IF;

  SELECT membership.*
  INTO current_membership
  FROM public.organization_memberships membership
  WHERE membership.organization_id = target_organization_id
    AND membership.user_id = current_user_id
    AND membership.status = 'active';

  IF current_membership.id IS NULL THEN
    RETURN false;
  END IF;

  SELECT folder.*
  INTO target_folder
  FROM public.document_folders folder
  WHERE folder.id = target_folder_id
    AND folder.organization_id = target_organization_id;

  IF target_folder.id IS NULL THEN
    RETURN false;
  END IF;

  IF public.can_manage_document_folder_metadata(target_organization_id) THEN
    RETURN true;
  END IF;

  IF target_folder.status <> 'active' THEN
    RETURN false;
  END IF;

  own_person_profile_id := public.get_own_person_profile_id(target_organization_id);

  RETURN EXISTS (
    SELECT 1
    FROM public.document_folder_access_grants folder_grant
    WHERE folder_grant.folder_id = target_folder_id
      AND folder_grant.organization_id = target_organization_id
      AND folder_grant.grant_status = 'active'
      AND (folder_grant.expires_at IS NULL OR folder_grant.expires_at > now())
      AND public.document_access_level_rank(folder_grant.access_level) >= requested_rank
      AND (
        folder_grant.target_type = 'all_members'
        OR folder_grant.role = current_membership.role
        OR (
          own_person_profile_id IS NOT NULL
          AND folder_grant.person_profile_id = own_person_profile_id
        )
      )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.can_access_document(
  target_document_id uuid,
  target_organization_id uuid,
  target_document_version_id uuid DEFAULT NULL,
  target_access_level text DEFAULT 'read_metadata'
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := (select auth.uid());
  own_person_profile_id uuid;
  requested_rank integer := public.document_access_level_rank(target_access_level);
  target_document public.documents;
BEGIN
  IF current_user_id IS NULL OR requested_rank = 0 THEN
    RETURN false;
  END IF;

  IF NOT public.is_org_member(target_organization_id) THEN
    RETURN false;
  END IF;

  SELECT document.*
  INTO target_document
  FROM public.documents document
  WHERE document.id = target_document_id
    AND document.organization_id = target_organization_id
    AND document.status <> 'deleted';

  IF target_document.id IS NULL THEN
    RETURN false;
  END IF;

  IF public.can_manage_document_metadata(
    target_document.organization_id,
    target_document.document_scope,
    target_document.sensitivity_level
  ) THEN
    RETURN true;
  END IF;

  IF target_document.folder_id IS NOT NULL THEN
    RETURN public.can_access_document_folder(
      target_document.folder_id,
      target_document.organization_id,
      target_access_level
    );
  END IF;

  own_person_profile_id := public.get_own_person_profile_id(target_organization_id);

  IF requested_rank <= public.document_access_level_rank('download')
    AND own_person_profile_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.document_subjects document_subject
      WHERE document_subject.document_id = target_document_id
        AND document_subject.organization_id = target_organization_id
        AND document_subject.subject_type = 'person'
        AND document_subject.person_profile_id = own_person_profile_id
        AND document_subject.status = 'active'
    ) THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.document_access_grants grant_record
    INNER JOIN public.organization_memberships membership
      ON membership.organization_id = grant_record.organization_id
      AND membership.user_id = current_user_id
      AND membership.status = 'active'
    WHERE grant_record.document_id = target_document_id
      AND grant_record.organization_id = target_organization_id
      AND grant_record.grant_status = 'active'
      AND (grant_record.expires_at IS NULL OR grant_record.expires_at > now())
      AND (
        target_document_version_id IS NULL
        OR grant_record.document_version_id IS NULL
        OR grant_record.document_version_id = target_document_version_id
      )
      AND public.document_access_level_rank(grant_record.access_level) >= requested_rank
      AND (
        (own_person_profile_id IS NOT NULL AND grant_record.person_profile_id = own_person_profile_id)
        OR grant_record.organization_membership_id = membership.id
        OR grant_record.role = membership.role
        OR (
          grant_record.capability IS NOT NULL
          AND public.has_document_capability(target_organization_id, grant_record.capability)
        )
      )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_document_folder_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := (select auth.uid());
BEGIN
  IF current_user_id IS NOT NULL
    AND TG_OP = 'INSERT'
    AND NEW.created_by_user_id <> current_user_id THEN
    RAISE EXCEPTION 'document folder creator must be the authenticated user';
  END IF;

  IF NEW.description IS NOT NULL THEN
    NEW.description = NULLIF(btrim(NEW.description), '');
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.id <> OLD.id
      OR NEW.organization_id <> OLD.organization_id
      OR NEW.created_by_user_id <> OLD.created_by_user_id
      OR NEW.created_at <> OLD.created_at THEN
      RAISE EXCEPTION 'document folder immutable fields cannot be changed';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_document_folder_access_grant_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := (select auth.uid());
BEGIN
  IF current_user_id IS NOT NULL
    AND TG_OP = 'INSERT'
    AND NEW.granted_by_user_id <> current_user_id THEN
    RAISE EXCEPTION 'document folder grant creator must be the authenticated user';
  END IF;

  IF NEW.grant_status = 'revoked' AND NEW.revoked_at IS NULL THEN
    NEW.revoked_at = now();
  END IF;

  IF NEW.grant_status = 'active' THEN
    NEW.revoked_at = NULL;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.id <> OLD.id
      OR NEW.organization_id <> OLD.organization_id
      OR NEW.folder_id <> OLD.folder_id
      OR NEW.target_type <> OLD.target_type
      OR NEW.person_profile_id IS DISTINCT FROM OLD.person_profile_id
      OR NEW.role IS DISTINCT FROM OLD.role
      OR NEW.granted_by_user_id <> OLD.granted_by_user_id
      OR NEW.created_at <> OLD.created_at THEN
      RAISE EXCEPTION 'document folder grant immutable fields cannot be changed';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_document_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := (select auth.uid());
BEGIN
  IF NEW.requires_signature THEN
    RAISE EXCEPTION 'signable documents are out of scope for this migration';
  END IF;

  IF current_user_id IS NOT NULL
    AND TG_OP = 'INSERT'
    AND NEW.created_by_user_id <> current_user_id THEN
    RAISE EXCEPTION 'document creator must be the authenticated user';
  END IF;

  IF NEW.folder_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.document_folders folder
      WHERE folder.id = NEW.folder_id
        AND folder.organization_id = NEW.organization_id
        AND folder.status = 'active'
    ) THEN
    RAISE EXCEPTION 'document folder is not active or does not belong to the organization';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.id <> OLD.id
      OR NEW.organization_id <> OLD.organization_id
      OR NEW.created_by_user_id <> OLD.created_by_user_id
      OR NEW.created_at <> OLD.created_at THEN
      RAISE EXCEPTION 'document immutable fields cannot be changed';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER document_folders_set_updated_at
  BEFORE UPDATE ON public.document_folders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER document_folder_access_grants_set_updated_at
  BEFORE UPDATE ON public.document_folder_access_grants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER document_folders_validate_row
  BEFORE INSERT OR UPDATE ON public.document_folders
  FOR EACH ROW EXECUTE FUNCTION public.validate_document_folder_row();

CREATE TRIGGER document_folder_access_grants_validate_row
  BEFORE INSERT OR UPDATE ON public.document_folder_access_grants
  FOR EACH ROW EXECUTE FUNCTION public.validate_document_folder_access_grant_row();

ALTER TABLE public.document_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_folder_access_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view accessible document folders"
  ON public.document_folders FOR SELECT TO authenticated
  USING (
    public.can_manage_document_folder_metadata(organization_id)
    OR public.can_access_document_folder(id, organization_id, 'read_metadata')
  );

CREATE POLICY "Document managers can create folders"
  ON public.document_folders FOR INSERT TO authenticated
  WITH CHECK (
    public.can_manage_document_folder_metadata(organization_id)
    AND created_by_user_id = (select auth.uid())
  );

CREATE POLICY "Document managers can update folders"
  ON public.document_folders FOR UPDATE TO authenticated
  USING (public.can_manage_document_folder_by_id(id, organization_id))
  WITH CHECK (public.can_manage_document_folder_by_id(id, organization_id));

CREATE POLICY "Document managers can view folder grants"
  ON public.document_folder_access_grants FOR SELECT TO authenticated
  USING (
    public.can_manage_document_folder_metadata(organization_id)
    OR public.can_manage_document_folder_by_id(folder_id, organization_id)
  );

CREATE POLICY "Document managers can create folder grants"
  ON public.document_folder_access_grants FOR INSERT TO authenticated
  WITH CHECK (
    (
      public.can_manage_document_folder_metadata(organization_id)
      OR public.can_manage_document_folder_by_id(folder_id, organization_id)
    )
    AND granted_by_user_id = (select auth.uid())
  );

CREATE POLICY "Document managers can update folder grants"
  ON public.document_folder_access_grants FOR UPDATE TO authenticated
  USING (public.can_manage_document_folder_by_id(folder_id, organization_id))
  WITH CHECK (public.can_manage_document_folder_by_id(folder_id, organization_id));

DROP FUNCTION IF EXISTS public.list_accessible_document_versions(uuid, text, integer);

CREATE OR REPLACE FUNCTION public.list_accessible_document_versions(
  target_organization_id uuid,
  target_document_scope text DEFAULT NULL,
  target_limit integer DEFAULT 100,
  target_folder_id uuid DEFAULT NULL
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
  folder_id uuid,
  folder_name text,
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

  IF target_folder_id IS NOT NULL
    AND NOT public.can_access_document_folder(
      target_folder_id,
      target_organization_id,
      'read_metadata'
    ) THEN
    RAISE EXCEPTION 'document folder is not accessible';
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
    document.folder_id,
    folder.name AS folder_name,
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
  LEFT JOIN public.document_folders folder
    ON folder.id = document.folder_id
   AND folder.organization_id = document.organization_id
  WHERE document.organization_id = target_organization_id
    AND (normalized_scope IS NULL OR document.document_scope = normalized_scope)
    AND (
      target_folder_id IS NULL
      OR document.folder_id = target_folder_id
    )
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
    COALESCE(folder.name, 'zzzzzzzz') ASC,
    document.updated_at DESC,
    document.title ASC,
    document_version.version_number DESC
  LIMIT bounded_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_accessible_document_folders(
  target_organization_id uuid
)
RETURNS TABLE (
  folder_id uuid,
  parent_folder_id uuid,
  organization_id uuid,
  name text,
  description text,
  status text,
  document_count integer,
  can_manage boolean,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := (select auth.uid());
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF NOT public.is_org_member(target_organization_id) THEN
    RAISE EXCEPTION 'active membership required';
  END IF;

  RETURN QUERY
  SELECT
    folder.id AS folder_id,
    folder.parent_folder_id,
    folder.organization_id,
    folder.name,
    folder.description,
    folder.status,
    (
      SELECT count(*)::integer
      FROM public.documents document
      WHERE document.organization_id = folder.organization_id
        AND document.folder_id = folder.id
        AND document.status IN ('active', 'archived')
        AND public.can_access_document(
          document.id,
          document.organization_id,
          NULL,
          'read_metadata'
        )
    ) AS document_count,
    public.can_manage_document_folder_by_id(
      folder.id,
      folder.organization_id
    ) AS can_manage,
    folder.created_at,
    folder.updated_at
  FROM public.document_folders folder
  WHERE folder.organization_id = target_organization_id
    AND folder.status = 'active'
    AND public.can_access_document_folder(
      folder.id,
      folder.organization_id,
      'read_metadata'
    )
  ORDER BY lower(folder.name), folder.created_at;
END;
$$;

GRANT SELECT, INSERT, UPDATE ON public.document_folders TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.document_folder_access_grants TO authenticated;

REVOKE EXECUTE ON FUNCTION public.validate_document_folder_row() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_document_folder_access_grant_row() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_manage_document_folder_metadata(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_manage_document_folder_by_id(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_access_document_folder(uuid, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_access_document(uuid, uuid, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.list_accessible_document_versions(uuid, text, integer, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.list_accessible_document_folders(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.can_manage_document_folder_metadata(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_document_folder_by_id(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_document_folder(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_document(uuid, uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_accessible_document_versions(uuid, text, integer, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_accessible_document_folders(uuid) TO authenticated;
