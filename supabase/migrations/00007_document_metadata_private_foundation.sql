-- BoxOps - Fase E.2 private document metadata foundation
-- Creates tenant-scoped document metadata, file versions, affected subjects and
-- explicit grants. It does not create Storage buckets, upload flows, UI,
-- signable documents, signature requests or audit events.

-- ============================================================
-- Document headers
-- ============================================================

CREATE TABLE public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by_user_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  document_type text NOT NULL DEFAULT 'general',
  document_scope text NOT NULL
    CHECK (document_scope IN (
      'company',
      'person_private',
      'management_private',
      'certification',
      'programming'
    )),
  sensitivity_level text NOT NULL DEFAULT 'restricted'
    CHECK (sensitivity_level IN (
      'public_internal',
      'restricted',
      'sensitive_hr',
      'payroll',
      'signature_evidence'
    )),
  current_version_id uuid,
  requires_signature boolean NOT NULL DEFAULT false
    CHECK (requires_signature = false),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'archived', 'deleted')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id),
  FOREIGN KEY (organization_id, created_by_user_id)
    REFERENCES public.organization_memberships(organization_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT documents_title_not_blank
    CHECK (length(btrim(title)) > 0),
  CONSTRAINT documents_description_not_blank
    CHECK (description IS NULL OR length(btrim(description)) > 0),
  CONSTRAINT documents_document_type_format
    CHECK (document_type ~ '^[a-z][a-z0-9_]{1,63}$'),
  CONSTRAINT documents_metadata_object
    CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT documents_payroll_scope_private
    CHECK (sensitivity_level <> 'payroll' OR document_scope = 'person_private'),
  CONSTRAINT documents_signature_evidence_scope_private
    CHECK (
      sensitivity_level <> 'signature_evidence'
      OR document_scope = 'management_private'
    ),
  CONSTRAINT documents_sensitive_hr_scope_private
    CHECK (
      sensitivity_level <> 'sensitive_hr'
      OR document_scope IN ('person_private', 'management_private', 'certification')
    )
);

-- ============================================================
-- Document file versions
-- ============================================================

CREATE TABLE public.document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  document_id uuid NOT NULL,
  version_number integer NOT NULL
    CHECK (version_number > 0),
  uploaded_by_user_id uuid NOT NULL,
  storage_bucket text NOT NULL DEFAULT 'document-files'
    CHECK (storage_bucket = 'document-files'),
  storage_path text NOT NULL,
  original_filename text NOT NULL,
  mime_type text NOT NULL,
  size_bytes integer NOT NULL
    CHECK (size_bytes > 0 AND size_bytes <= 52428800),
  document_hash text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'archived', 'deleted')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  activated_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id),
  UNIQUE (id, document_id, organization_id),
  UNIQUE (organization_id, document_id, version_number),
  UNIQUE (storage_bucket, storage_path),
  FOREIGN KEY (document_id, organization_id)
    REFERENCES public.documents(id, organization_id)
    ON DELETE CASCADE,
  FOREIGN KEY (organization_id, uploaded_by_user_id)
    REFERENCES public.organization_memberships(organization_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT document_versions_storage_path_format
    CHECK (
      storage_path ~
      '^documents/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/versions/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{1,12}$'
    ),
  CONSTRAINT document_versions_original_filename_not_blank
    CHECK (
      length(btrim(original_filename)) > 0
      AND original_filename !~ '[/\\]'
      AND length(original_filename) <= 255
    ),
  CONSTRAINT document_versions_mime_type_not_blank
    CHECK (length(btrim(mime_type)) > 0),
  CONSTRAINT document_versions_hash_format
    CHECK (document_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT document_versions_metadata_object
    CHECK (jsonb_typeof(metadata) = 'object')
);

ALTER TABLE public.documents
  ADD CONSTRAINT documents_current_version_id_document_id_organization_id_fkey
  FOREIGN KEY (current_version_id, id, organization_id)
  REFERENCES public.document_versions(id, document_id, organization_id)
  ON DELETE NO ACTION
  DEFERRABLE INITIALLY IMMEDIATE;

-- ============================================================
-- Document subjects
-- ============================================================

CREATE TABLE public.document_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  document_id uuid NOT NULL,
  subject_type text NOT NULL
    CHECK (subject_type IN (
      'person',
      'center',
      'coach',
      'schedule_block',
      'class_type'
    )),
  person_profile_id uuid,
  center_id uuid,
  coach_profile_id uuid,
  schedule_block_id uuid,
  class_type_id uuid,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'removed')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id),
  FOREIGN KEY (document_id, organization_id)
    REFERENCES public.documents(id, organization_id)
    ON DELETE CASCADE,
  FOREIGN KEY (person_profile_id, organization_id)
    REFERENCES public.person_profiles(id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (center_id, organization_id)
    REFERENCES public.centers(id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (coach_profile_id, organization_id)
    REFERENCES public.coach_profiles(id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (schedule_block_id, organization_id)
    REFERENCES public.schedule_blocks(id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (class_type_id, organization_id)
    REFERENCES public.class_types(id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT document_subjects_target_matches_type
    CHECK (
      (
        subject_type = 'person'
        AND person_profile_id IS NOT NULL
        AND num_nonnulls(center_id, coach_profile_id, schedule_block_id, class_type_id) = 0
      )
      OR (
        subject_type = 'center'
        AND center_id IS NOT NULL
        AND num_nonnulls(person_profile_id, coach_profile_id, schedule_block_id, class_type_id) = 0
      )
      OR (
        subject_type = 'coach'
        AND coach_profile_id IS NOT NULL
        AND num_nonnulls(person_profile_id, center_id, schedule_block_id, class_type_id) = 0
      )
      OR (
        subject_type = 'schedule_block'
        AND schedule_block_id IS NOT NULL
        AND num_nonnulls(person_profile_id, center_id, coach_profile_id, class_type_id) = 0
      )
      OR (
        subject_type = 'class_type'
        AND class_type_id IS NOT NULL
        AND num_nonnulls(person_profile_id, center_id, coach_profile_id, schedule_block_id) = 0
      )
    ),
  CONSTRAINT document_subjects_metadata_object
    CHECK (jsonb_typeof(metadata) = 'object')
);

-- ============================================================
-- Explicit document access grants
-- ============================================================

CREATE TABLE public.document_access_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  document_id uuid NOT NULL,
  document_version_id uuid,
  person_profile_id uuid,
  organization_membership_id uuid,
  role text,
  capability text,
  access_level text NOT NULL DEFAULT 'read_metadata'
    CHECK (access_level IN (
      'read_metadata',
      'preview',
      'download',
      'manage',
      'manage_grants'
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
  FOREIGN KEY (document_id, organization_id)
    REFERENCES public.documents(id, organization_id)
    ON DELETE CASCADE,
  FOREIGN KEY (document_version_id, document_id, organization_id)
    REFERENCES public.document_versions(id, document_id, organization_id)
    ON DELETE CASCADE,
  FOREIGN KEY (person_profile_id, organization_id)
    REFERENCES public.person_profiles(id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (organization_membership_id, organization_id)
    REFERENCES public.organization_memberships(id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, granted_by_user_id)
    REFERENCES public.organization_memberships(organization_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT document_access_grants_single_target
    CHECK (num_nonnulls(person_profile_id, organization_membership_id, role, capability) = 1),
  CONSTRAINT document_access_grants_role_value
    CHECK (
      role IS NULL
      OR role IN (
        'owner',
        'admin',
        'manager',
        'center_manager',
        'document_admin',
        'payroll_manager',
        'coach',
        'staff'
      )
    ),
  CONSTRAINT document_access_grants_capability_value
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
        'signature_request_manage',
        'document_sign_self',
        'signature_evidence_read',
        'document_access_audit_read',
        'payroll_private_manage'
      )
    ),
  CONSTRAINT document_access_grants_revocation_state
    CHECK (
      (grant_status = 'active' AND revoked_at IS NULL)
      OR (grant_status = 'revoked' AND revoked_at IS NOT NULL)
    ),
  CONSTRAINT document_access_grants_expiry_after_creation
    CHECK (expires_at IS NULL OR expires_at > created_at),
  CONSTRAINT document_access_grants_metadata_object
    CHECK (jsonb_typeof(metadata) = 'object')
);

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX documents_org_scope_status_idx
  ON public.documents (organization_id, document_scope, sensitivity_level, status);

CREATE INDEX documents_created_by_idx
  ON public.documents (created_by_user_id);

CREATE UNIQUE INDEX document_versions_one_active_idx
  ON public.document_versions (organization_id, document_id)
  WHERE status = 'active';

CREATE INDEX document_versions_document_status_idx
  ON public.document_versions (organization_id, document_id, status, version_number DESC);

CREATE INDEX document_versions_uploaded_by_idx
  ON public.document_versions (uploaded_by_user_id);

CREATE UNIQUE INDEX document_subjects_one_active_person_idx
  ON public.document_subjects (document_id, person_profile_id)
  WHERE person_profile_id IS NOT NULL AND status = 'active';

CREATE UNIQUE INDEX document_subjects_one_active_center_idx
  ON public.document_subjects (document_id, center_id)
  WHERE center_id IS NOT NULL AND status = 'active';

CREATE UNIQUE INDEX document_subjects_one_active_coach_idx
  ON public.document_subjects (document_id, coach_profile_id)
  WHERE coach_profile_id IS NOT NULL AND status = 'active';

CREATE UNIQUE INDEX document_subjects_one_active_schedule_block_idx
  ON public.document_subjects (document_id, schedule_block_id)
  WHERE schedule_block_id IS NOT NULL AND status = 'active';

CREATE UNIQUE INDEX document_subjects_one_active_class_type_idx
  ON public.document_subjects (document_id, class_type_id)
  WHERE class_type_id IS NOT NULL AND status = 'active';

CREATE INDEX document_subjects_person_idx
  ON public.document_subjects (organization_id, person_profile_id, status)
  WHERE person_profile_id IS NOT NULL;

CREATE INDEX document_access_grants_document_idx
  ON public.document_access_grants (organization_id, document_id, document_version_id, grant_status);

CREATE INDEX document_access_grants_person_idx
  ON public.document_access_grants (organization_id, person_profile_id, grant_status)
  WHERE person_profile_id IS NOT NULL;

CREATE INDEX document_access_grants_membership_idx
  ON public.document_access_grants (organization_id, organization_membership_id, grant_status)
  WHERE organization_membership_id IS NOT NULL;

CREATE INDEX document_access_grants_role_idx
  ON public.document_access_grants (organization_id, role, grant_status)
  WHERE role IS NOT NULL;

CREATE INDEX document_access_grants_capability_idx
  ON public.document_access_grants (organization_id, capability, grant_status)
  WHERE capability IS NOT NULL;

-- ============================================================
-- Access helpers
-- ============================================================

CREATE OR REPLACE FUNCTION public.document_access_level_rank(target_access_level text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE target_access_level
    WHEN 'read_metadata' THEN 10
    WHEN 'preview' THEN 20
    WHEN 'download' THEN 30
    WHEN 'manage' THEN 40
    WHEN 'manage_grants' THEN 50
    ELSE 0
  END;
$$;

CREATE OR REPLACE FUNCTION public.get_own_person_profile_id(target_organization_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT person_profile.id
  FROM public.person_profiles person_profile
  WHERE person_profile.organization_id = target_organization_id
    AND person_profile.user_id = (select auth.uid())
    AND person_profile.status = 'active'
  LIMIT 1;
$$;

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

CREATE OR REPLACE FUNCTION public.can_manage_document_metadata(
  target_organization_id uuid,
  target_document_scope text,
  target_sensitivity_level text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN target_sensitivity_level = 'payroll' THEN
      public.has_org_role(target_organization_id, ARRAY['payroll_manager'])
    WHEN target_document_scope = 'person_private' THEN
      public.has_org_role(target_organization_id, ARRAY['document_admin'])
    WHEN target_document_scope = 'management_private' THEN
      public.has_org_role(target_organization_id, ARRAY['document_admin'])
    WHEN target_sensitivity_level IN ('sensitive_hr', 'signature_evidence') THEN
      public.has_org_role(target_organization_id, ARRAY['document_admin'])
    ELSE
      public.has_org_role(target_organization_id, ARRAY['owner', 'admin', 'document_admin'])
  END;
$$;

CREATE OR REPLACE FUNCTION public.can_manage_document_by_id(
  target_document_id uuid,
  target_organization_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT public.can_manage_document_metadata(
      document.organization_id,
      document.document_scope,
      document.sensitivity_level
    )
    FROM public.documents document
    WHERE document.id = target_document_id
      AND document.organization_id = target_organization_id
      AND document.status <> 'deleted'
  ), false);
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

-- ============================================================
-- Validation helpers
-- ============================================================

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

CREATE OR REPLACE FUNCTION public.validate_document_version_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := (select auth.uid());
  expected_prefix text;
BEGIN
  IF current_user_id IS NOT NULL
    AND TG_OP = 'INSERT'
    AND NEW.uploaded_by_user_id <> current_user_id THEN
    RAISE EXCEPTION 'document version uploader must be the authenticated user';
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

CREATE OR REPLACE FUNCTION public.validate_document_access_grant_row()
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
    RAISE EXCEPTION 'document access grant creator must be the authenticated user';
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
      OR NEW.document_id <> OLD.document_id
      OR NEW.document_version_id IS DISTINCT FROM OLD.document_version_id
      OR NEW.person_profile_id IS DISTINCT FROM OLD.person_profile_id
      OR NEW.organization_membership_id IS DISTINCT FROM OLD.organization_membership_id
      OR NEW.role IS DISTINCT FROM OLD.role
      OR NEW.capability IS DISTINCT FROM OLD.capability
      OR NEW.granted_by_user_id <> OLD.granted_by_user_id
      OR NEW.created_at <> OLD.created_at THEN
      RAISE EXCEPTION 'document access grant immutable fields cannot be changed';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================
-- Updated_at and validation triggers
-- ============================================================

CREATE TRIGGER documents_set_updated_at
  BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER document_versions_set_updated_at
  BEFORE UPDATE ON public.document_versions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER document_subjects_set_updated_at
  BEFORE UPDATE ON public.document_subjects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER document_access_grants_set_updated_at
  BEFORE UPDATE ON public.document_access_grants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER documents_validate_row
  BEFORE INSERT OR UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.validate_document_row();

CREATE TRIGGER document_versions_validate_row
  BEFORE INSERT OR UPDATE ON public.document_versions
  FOR EACH ROW EXECUTE FUNCTION public.validate_document_version_row();

CREATE TRIGGER document_access_grants_validate_row
  BEFORE INSERT OR UPDATE ON public.document_access_grants
  FOR EACH ROW EXECUTE FUNCTION public.validate_document_access_grant_row();

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_access_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view accessible documents"
  ON public.documents FOR SELECT TO authenticated
  USING (public.can_access_document(id, organization_id, NULL, 'read_metadata'));

CREATE POLICY "Document managers can create documents"
  ON public.documents FOR INSERT TO authenticated
  WITH CHECK (
    public.can_manage_document_metadata(organization_id, document_scope, sensitivity_level)
    AND created_by_user_id = (select auth.uid())
    AND requires_signature = false
  );

CREATE POLICY "Document managers can update documents"
  ON public.documents FOR UPDATE TO authenticated
  USING (public.can_manage_document_by_id(id, organization_id))
  WITH CHECK (
    public.can_manage_document_metadata(organization_id, document_scope, sensitivity_level)
    AND requires_signature = false
  );

CREATE POLICY "Users can view accessible document versions"
  ON public.document_versions FOR SELECT TO authenticated
  USING (public.can_access_document(document_id, organization_id, id, 'preview'));

CREATE POLICY "Document managers can create document versions"
  ON public.document_versions FOR INSERT TO authenticated
  WITH CHECK (
    public.can_manage_document_by_id(document_id, organization_id)
    AND uploaded_by_user_id = (select auth.uid())
  );

CREATE POLICY "Document managers can update document versions"
  ON public.document_versions FOR UPDATE TO authenticated
  USING (public.can_manage_document_by_id(document_id, organization_id))
  WITH CHECK (public.can_manage_document_by_id(document_id, organization_id));

CREATE POLICY "Users can view accessible document subjects"
  ON public.document_subjects FOR SELECT TO authenticated
  USING (public.can_access_document(document_id, organization_id, NULL, 'read_metadata'));

CREATE POLICY "Document managers can create document subjects"
  ON public.document_subjects FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_document_by_id(document_id, organization_id));

CREATE POLICY "Document managers can update document subjects"
  ON public.document_subjects FOR UPDATE TO authenticated
  USING (public.can_manage_document_by_id(document_id, organization_id))
  WITH CHECK (public.can_manage_document_by_id(document_id, organization_id));

CREATE POLICY "Document grant managers can view grants"
  ON public.document_access_grants FOR SELECT TO authenticated
  USING (public.can_access_document(document_id, organization_id, document_version_id, 'manage_grants'));

CREATE POLICY "Document grant managers can create grants"
  ON public.document_access_grants FOR INSERT TO authenticated
  WITH CHECK (
    public.can_access_document(document_id, organization_id, document_version_id, 'manage_grants')
    AND granted_by_user_id = (select auth.uid())
  );

CREATE POLICY "Document grant managers can update grants"
  ON public.document_access_grants FOR UPDATE TO authenticated
  USING (public.can_access_document(document_id, organization_id, document_version_id, 'manage_grants'))
  WITH CHECK (public.can_access_document(document_id, organization_id, document_version_id, 'manage_grants'));

-- ============================================================
-- Grants
-- ============================================================

GRANT SELECT, INSERT, UPDATE ON public.documents TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.document_versions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.document_subjects TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.document_access_grants TO authenticated;

GRANT EXECUTE ON FUNCTION public.document_access_level_rank(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_own_person_profile_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_document_capability(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_document_metadata(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_document_by_id(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_document(uuid, uuid, uuid, text) TO authenticated;
