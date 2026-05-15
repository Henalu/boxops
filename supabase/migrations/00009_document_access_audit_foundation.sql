-- BoxOps - Fase E.4 minimal private document access audit
-- Creates tenant-scoped audit metadata for document access/change events. It
-- does not create document UI, signed URLs, signable documents, signature
-- requests, signature evidences, payroll, time tracking or geolocation.

-- ============================================================
-- Metadata minimization helper
-- ============================================================

CREATE OR REPLACE FUNCTION public.document_access_event_metadata_is_safe(
  target_metadata jsonb
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  WITH RECURSIVE walk(key_name, value) AS (
    SELECT entry.key, entry.value
    FROM jsonb_each(
      CASE
        WHEN jsonb_typeof(target_metadata) = 'object' THEN target_metadata
        ELSE '{}'::jsonb
      END
    ) AS entry(key, value)

    UNION ALL

    SELECT nested.key, nested.value
    FROM walk
    CROSS JOIN LATERAL jsonb_each(
      CASE
        WHEN jsonb_typeof(walk.value) = 'object' THEN walk.value
        ELSE '{}'::jsonb
      END
    ) AS nested(key, value)
  )
  SELECT
    target_metadata IS NOT NULL
    AND jsonb_typeof(target_metadata) = 'object'
    AND pg_column_size(target_metadata) <= 4096
    AND NOT EXISTS (
      SELECT 1
      FROM walk
      WHERE lower(key_name) ~ '(content|body|html|raw|base64|url|uri|path|token|secret|signature|document_hash|storage)'
        OR jsonb_typeof(value) = 'array'
        OR (
          jsonb_typeof(value) = 'string'
          AND (
            length(value #>> '{}') > 512
            OR (value #>> '{}') ~* '(https?://|data:|storage/v1|base64|-----BEGIN|signed-url|signed_url)'
          )
        )
    );
$$;

-- ============================================================
-- Document access/change audit events
-- ============================================================

CREATE TABLE public.document_access_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  document_id uuid NOT NULL,
  document_version_id uuid,
  actor_user_id uuid NOT NULL,
  actor_person_profile_id uuid,
  organization_membership_id uuid NOT NULL,
  event_type text NOT NULL
    CHECK (event_type IN (
      'metadata_read',
      'file_preview',
      'file_download',
      'version_created',
      'version_activated',
      'version_archived',
      'grant_created',
      'grant_revoked',
      'subject_added',
      'subject_removed'
    )),
  access_level text
    CHECK (
      access_level IS NULL
      OR access_level IN (
        'read_metadata',
        'preview',
        'download',
        'manage',
        'manage_grants'
      )
    ),
  result text NOT NULL DEFAULT 'allowed'
    CHECK (result IN ('allowed', 'denied')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id),
  FOREIGN KEY (document_id, organization_id)
    REFERENCES public.documents(id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (document_version_id, document_id, organization_id)
    REFERENCES public.document_versions(id, document_id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, actor_user_id)
    REFERENCES public.organization_memberships(organization_id, user_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (actor_person_profile_id, organization_id)
    REFERENCES public.person_profiles(id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (organization_membership_id, organization_id)
    REFERENCES public.organization_memberships(id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT document_access_events_metadata_safe
    CHECK (public.document_access_event_metadata_is_safe(metadata)),
  CONSTRAINT document_access_events_file_event_version_required
    CHECK (
      event_type NOT IN ('file_preview', 'file_download', 'version_created', 'version_activated', 'version_archived')
      OR document_version_id IS NOT NULL
    ),
  CONSTRAINT document_access_events_denied_only_for_access
    CHECK (
      result = 'allowed'
      OR event_type IN ('metadata_read', 'file_preview', 'file_download')
    )
);

CREATE INDEX document_access_events_document_idx
  ON public.document_access_events (organization_id, document_id, created_at DESC);

CREATE INDEX document_access_events_version_idx
  ON public.document_access_events (organization_id, document_version_id, created_at DESC)
  WHERE document_version_id IS NOT NULL;

CREATE INDEX document_access_events_actor_idx
  ON public.document_access_events (organization_id, actor_user_id, created_at DESC);

CREATE INDEX document_access_events_type_result_idx
  ON public.document_access_events (organization_id, event_type, result, created_at DESC);

-- ============================================================
-- Audit access helpers
-- ============================================================

CREATE OR REPLACE FUNCTION public.can_read_document_access_events(
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
    SELECT CASE
      WHEN document.sensitivity_level = 'payroll' THEN
        public.has_org_role(target_organization_id, ARRAY['payroll_manager'])
      ELSE
        public.has_document_capability(target_organization_id, 'document_access_audit_read')
    END
    FROM public.documents document
    WHERE document.id = target_document_id
      AND document.organization_id = target_organization_id
      AND document.status <> 'deleted'
  ), false);
$$;

CREATE OR REPLACE FUNCTION public.record_document_access_event(
  target_organization_id uuid,
  target_document_id uuid,
  target_document_version_id uuid,
  target_event_type text,
  target_access_level text DEFAULT NULL,
  target_result text DEFAULT 'allowed',
  target_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS public.document_access_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := (select auth.uid());
  current_membership public.organization_memberships;
  own_person_profile_id uuid;
  target_document public.documents;
  normalized_event_type text := lower(btrim(COALESCE(target_event_type, '')));
  normalized_access_level text := NULLIF(lower(btrim(COALESCE(target_access_level, ''))), '');
  normalized_result text := NULLIF(lower(btrim(COALESCE(target_result, 'allowed'))), '');
  normalized_metadata jsonb := COALESCE(target_metadata, '{}'::jsonb);
  required_access_level text;
  created_event public.document_access_events;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT membership.*
  INTO current_membership
  FROM public.organization_memberships membership
  WHERE membership.organization_id = target_organization_id
    AND membership.user_id = current_user_id
    AND membership.status = 'active';

  IF current_membership.id IS NULL THEN
    RAISE EXCEPTION 'active membership required';
  END IF;

  SELECT document.*
  INTO target_document
  FROM public.documents document
  WHERE document.id = target_document_id
    AND document.organization_id = target_organization_id
    AND document.status <> 'deleted';

  IF target_document.id IS NULL THEN
    RAISE EXCEPTION 'document not found';
  END IF;

  IF normalized_result IS NULL THEN
    normalized_result := 'allowed';
  END IF;

  IF normalized_result NOT IN ('allowed', 'denied') THEN
    RAISE EXCEPTION 'document audit result is not allowed';
  END IF;

  IF normalized_event_type NOT IN (
    'metadata_read',
    'file_preview',
    'file_download',
    'version_created',
    'version_activated',
    'version_archived',
    'grant_created',
    'grant_revoked',
    'subject_added',
    'subject_removed'
  ) THEN
    RAISE EXCEPTION 'document audit event type is not allowed';
  END IF;

  IF normalized_event_type IN ('file_preview', 'file_download', 'version_created', 'version_activated', 'version_archived')
    AND target_document_version_id IS NULL THEN
    RAISE EXCEPTION 'document version is required for this audit event';
  END IF;

  IF target_document_version_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.document_versions document_version
      WHERE document_version.id = target_document_version_id
        AND document_version.document_id = target_document_id
        AND document_version.organization_id = target_organization_id
    ) THEN
    RAISE EXCEPTION 'document version not found';
  END IF;

  IF normalized_event_type = 'metadata_read' AND normalized_access_level IS NULL THEN
    normalized_access_level := 'read_metadata';
  ELSIF normalized_event_type = 'file_preview' AND normalized_access_level IS NULL THEN
    normalized_access_level := 'preview';
  ELSIF normalized_event_type = 'file_download' AND normalized_access_level IS NULL THEN
    normalized_access_level := 'download';
  END IF;

  IF normalized_access_level IS NOT NULL
    AND public.document_access_level_rank(normalized_access_level) = 0 THEN
    RAISE EXCEPTION 'document audit access level is not allowed';
  END IF;

  IF normalized_result = 'denied'
    AND normalized_event_type NOT IN ('metadata_read', 'file_preview', 'file_download') THEN
    RAISE EXCEPTION 'denied document change events are out of scope';
  END IF;

  IF NOT public.document_access_event_metadata_is_safe(normalized_metadata) THEN
    RAISE EXCEPTION 'document audit metadata is not allowed';
  END IF;

  IF normalized_result = 'allowed' THEN
    IF normalized_event_type IN ('metadata_read', 'file_preview', 'file_download') THEN
      required_access_level := COALESCE(normalized_access_level, 'read_metadata');

      IF NOT public.can_access_document(
        target_document_id,
        target_organization_id,
        target_document_version_id,
        required_access_level
      ) THEN
        RAISE EXCEPTION 'document access permission required';
      END IF;
    ELSIF normalized_event_type IN ('grant_created', 'grant_revoked') THEN
      IF NOT public.can_access_document(
        target_document_id,
        target_organization_id,
        target_document_version_id,
        'manage_grants'
      ) THEN
        RAISE EXCEPTION 'document grant management permission required';
      END IF;
    ELSE
      IF NOT public.can_manage_document_by_id(target_document_id, target_organization_id) THEN
        RAISE EXCEPTION 'document management permission required';
      END IF;
    END IF;
  END IF;

  own_person_profile_id := public.get_own_person_profile_id(target_organization_id);

  INSERT INTO public.document_access_events (
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
    target_organization_id,
    target_document_id,
    target_document_version_id,
    current_user_id,
    own_person_profile_id,
    current_membership.id,
    normalized_event_type,
    normalized_access_level,
    normalized_result,
    normalized_metadata
  )
  RETURNING *
  INTO created_event;

  RETURN created_event;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_document_access_events_for_document(
  target_organization_id uuid,
  target_document_id uuid,
  target_limit integer DEFAULT 100
)
RETURNS SETOF public.document_access_events
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  bounded_limit integer := LEAST(GREATEST(COALESCE(target_limit, 100), 1), 500);
BEGIN
  IF NOT public.can_read_document_access_events(target_document_id, target_organization_id) THEN
    RAISE EXCEPTION 'document audit permission required';
  END IF;

  RETURN QUERY
  SELECT event_record.*
  FROM public.document_access_events event_record
  WHERE event_record.organization_id = target_organization_id
    AND event_record.document_id = target_document_id
  ORDER BY event_record.created_at DESC, event_record.id DESC
  LIMIT bounded_limit;
END;
$$;

-- ============================================================
-- Connect version activation to audit
-- ============================================================

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
  archived_version_ids uuid[] := ARRAY[]::uuid[];
  archived_version_id uuid;
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

  SELECT COALESCE(array_agg(document_version.id), ARRAY[]::uuid[])
  INTO archived_version_ids
  FROM public.document_versions document_version
  WHERE document_version.organization_id = pending_document_version.organization_id
    AND document_version.document_id = pending_document_version.document_id
    AND document_version.status = 'active'
    AND document_version.id <> pending_document_version.id;

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

  FOREACH archived_version_id IN ARRAY archived_version_ids LOOP
    PERFORM public.record_document_access_event(
      activated_document_version.organization_id,
      activated_document_version.document_id,
      archived_version_id,
      'version_archived',
      NULL,
      'allowed',
      jsonb_build_object(
        'reason', 'superseded_by_activation',
        'replacement_document_version_id', activated_document_version.id
      )
    );
  END LOOP;

  PERFORM public.record_document_access_event(
    activated_document_version.organization_id,
    activated_document_version.document_id,
    activated_document_version.id,
    'version_activated',
    NULL,
    'allowed',
    jsonb_build_object(
      'version_number', activated_document_version.version_number
    )
  );

  RETURN activated_document_version;
END;
$$;

-- ============================================================
-- Row Level Security and grants
-- ============================================================

ALTER TABLE public.document_access_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Document audit readers can view permitted document events"
  ON public.document_access_events FOR SELECT TO authenticated
  USING (public.can_read_document_access_events(document_id, organization_id));

REVOKE ALL ON TABLE public.document_access_events FROM anon, authenticated;
GRANT SELECT ON public.document_access_events TO authenticated;

REVOKE EXECUTE ON FUNCTION public.document_access_event_metadata_is_safe(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_read_document_access_events(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_document_access_event(uuid, uuid, uuid, text, text, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.list_document_access_events_for_document(uuid, uuid, integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.can_read_document_access_events(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_document_access_event(uuid, uuid, uuid, text, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_document_access_events_for_document(uuid, uuid, integer) TO authenticated;
