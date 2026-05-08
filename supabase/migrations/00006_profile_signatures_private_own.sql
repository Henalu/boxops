-- BoxOps - Fase D.5 private reusable profile signatures
-- Creates tenant-scoped signature metadata and a private Storage bucket for
-- own reusable internal signatures. This does not implement document signing.

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
  'profile-signatures',
  'profile-signatures',
  false,
  524288,
  ARRAY['image/png']::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ============================================================
-- Profile signatures metadata
-- ============================================================

CREATE TABLE public.profile_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  person_profile_id uuid NOT NULL,
  uploaded_by_user_id uuid NOT NULL,
  storage_bucket text NOT NULL DEFAULT 'profile-signatures'
    CHECK (storage_bucket = 'profile-signatures'),
  storage_path text NOT NULL,
  mime_type text NOT NULL DEFAULT 'image/png'
    CHECK (mime_type = 'image/png'),
  size_bytes integer NOT NULL
    CHECK (size_bytes > 0 AND size_bytes <= 524288),
  width integer
    CHECK (width IS NULL OR width > 0),
  height integer
    CHECK (height IS NULL OR height > 0),
  signature_hash text NOT NULL,
  signature_version integer NOT NULL
    CHECK (signature_version > 0),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'replaced', 'deleted')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  activated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id),
  UNIQUE (storage_bucket, storage_path),
  UNIQUE (organization_id, person_profile_id, signature_version),
  FOREIGN KEY (person_profile_id, organization_id)
    REFERENCES public.person_profiles(id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, uploaded_by_user_id)
    REFERENCES public.organization_memberships(organization_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT profile_signatures_storage_path_format
    CHECK (
      storage_path ~
      '^signatures/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$'
    ),
  CONSTRAINT profile_signatures_hash_format
    CHECK (signature_hash ~ '^[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX profile_signatures_one_active_idx
  ON public.profile_signatures (organization_id, person_profile_id)
  WHERE status = 'active';

CREATE INDEX profile_signatures_person_status_idx
  ON public.profile_signatures (organization_id, person_profile_id, status, created_at DESC);

CREATE INDEX profile_signatures_uploaded_by_idx
  ON public.profile_signatures (uploaded_by_user_id);

CREATE TRIGGER profile_signatures_set_updated_at
  BEFORE UPDATE ON public.profile_signatures
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- Validation helpers
-- ============================================================

CREATE OR REPLACE FUNCTION public.validate_profile_signature_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  owner_user_id uuid;
  expected_prefix text;
BEGIN
  SELECT person_profile.user_id
  INTO owner_user_id
  FROM public.person_profiles person_profile
  WHERE person_profile.id = NEW.person_profile_id
    AND person_profile.organization_id = NEW.organization_id;

  IF owner_user_id IS NULL THEN
    RAISE EXCEPTION 'profile signature requires a linked person profile';
  END IF;

  IF NEW.uploaded_by_user_id <> owner_user_id THEN
    RAISE EXCEPTION 'profile signature uploader must be the linked user';
  END IF;

  expected_prefix :=
    'signatures/' ||
    NEW.organization_id::text ||
    '/' ||
    NEW.person_profile_id::text ||
    '/';

  IF position(expected_prefix in NEW.storage_path) <> 1 THEN
    RAISE EXCEPTION 'profile signature storage path does not match its tenant and person';
  END IF;

  IF NEW.status = 'active' AND NEW.activated_at IS NULL THEN
    NEW.activated_at = now();
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.id <> OLD.id
      OR NEW.organization_id <> OLD.organization_id
      OR NEW.person_profile_id <> OLD.person_profile_id
      OR NEW.uploaded_by_user_id <> OLD.uploaded_by_user_id
      OR NEW.storage_bucket <> OLD.storage_bucket
      OR NEW.storage_path <> OLD.storage_path
      OR NEW.mime_type <> OLD.mime_type
      OR NEW.size_bytes <> OLD.size_bytes
      OR NEW.width IS DISTINCT FROM OLD.width
      OR NEW.height IS DISTINCT FROM OLD.height
      OR NEW.signature_hash <> OLD.signature_hash
      OR NEW.signature_version <> OLD.signature_version
      OR NEW.created_at <> OLD.created_at THEN
      RAISE EXCEPTION 'profile signature immutable fields cannot be changed';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER profile_signatures_validate_row
  BEFORE INSERT OR UPDATE ON public.profile_signatures
  FOR EACH ROW EXECUTE FUNCTION public.validate_profile_signature_row();

CREATE OR REPLACE FUNCTION public.begin_own_profile_signature_upload(
  target_organization_id uuid,
  target_size_bytes integer,
  target_signature_hash text,
  target_width integer DEFAULT NULL,
  target_height integer DEFAULT NULL
)
RETURNS public.profile_signatures
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := (select auth.uid());
  own_person_profile_id uuid;
  next_signature_version integer;
  new_signature_id uuid := gen_random_uuid();
  new_storage_path text;
  new_signature public.profile_signatures;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF NOT public.is_org_member(target_organization_id) THEN
    RAISE EXCEPTION 'active membership required';
  END IF;

  IF target_size_bytes IS NULL OR target_size_bytes <= 0 OR target_size_bytes > 524288 THEN
    RAISE EXCEPTION 'signature file size is not allowed';
  END IF;

  IF target_signature_hash IS NULL OR target_signature_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'signature hash is not valid';
  END IF;

  IF target_width IS NOT NULL AND (target_width < 240 OR target_width > 2000) THEN
    RAISE EXCEPTION 'signature width is not allowed';
  END IF;

  IF target_height IS NOT NULL AND (target_height < 100 OR target_height > 1000) THEN
    RAISE EXCEPTION 'signature height is not allowed';
  END IF;

  SELECT person_profile.id
  INTO own_person_profile_id
  FROM public.person_profiles person_profile
  WHERE person_profile.organization_id = target_organization_id
    AND person_profile.user_id = current_user_id
    AND person_profile.status = 'active';

  IF own_person_profile_id IS NULL THEN
    RAISE EXCEPTION 'linked person profile required';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext(target_organization_id::text),
    hashtext(own_person_profile_id::text)
  );

  SELECT COALESCE(MAX(profile_signature.signature_version), 0) + 1
  INTO next_signature_version
  FROM public.profile_signatures profile_signature
  WHERE profile_signature.organization_id = target_organization_id
    AND profile_signature.person_profile_id = own_person_profile_id;

  new_storage_path :=
    'signatures/' ||
    target_organization_id::text ||
    '/' ||
    own_person_profile_id::text ||
    '/' ||
    new_signature_id::text ||
    '.png';

  INSERT INTO public.profile_signatures (
    id,
    organization_id,
    person_profile_id,
    uploaded_by_user_id,
    storage_bucket,
    storage_path,
    mime_type,
    size_bytes,
    width,
    height,
    signature_hash,
    signature_version,
    status
  )
  VALUES (
    new_signature_id,
    target_organization_id,
    own_person_profile_id,
    current_user_id,
    'profile-signatures',
    new_storage_path,
    'image/png',
    target_size_bytes,
    target_width,
    target_height,
    target_signature_hash,
    next_signature_version,
    'pending'
  )
  RETURNING *
  INTO new_signature;

  RETURN new_signature;
END;
$$;

CREATE OR REPLACE FUNCTION public.activate_own_profile_signature(
  target_signature_id uuid
)
RETURNS public.profile_signatures
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := (select auth.uid());
  pending_signature public.profile_signatures;
  activated_signature public.profile_signatures;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT profile_signature.*
  INTO pending_signature
  FROM public.profile_signatures profile_signature
  INNER JOIN public.person_profiles person_profile
    ON person_profile.id = profile_signature.person_profile_id
    AND person_profile.organization_id = profile_signature.organization_id
  WHERE profile_signature.id = target_signature_id
    AND profile_signature.status = 'pending'
    AND profile_signature.uploaded_by_user_id = current_user_id
    AND person_profile.user_id = current_user_id
    AND public.is_org_member(profile_signature.organization_id)
  FOR UPDATE;

  IF pending_signature.id IS NULL THEN
    RAISE EXCEPTION 'pending profile signature not found';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext(pending_signature.organization_id::text),
    hashtext(pending_signature.person_profile_id::text)
  );

  IF NOT EXISTS (
    SELECT 1
    FROM storage.objects storage_object
    WHERE storage_object.bucket_id = pending_signature.storage_bucket
      AND storage_object.name = pending_signature.storage_path
  ) THEN
    RAISE EXCEPTION 'profile signature object was not uploaded';
  END IF;

  UPDATE public.profile_signatures
  SET status = 'replaced'
  WHERE organization_id = pending_signature.organization_id
    AND person_profile_id = pending_signature.person_profile_id
    AND status = 'active'
    AND id <> pending_signature.id;

  UPDATE public.profile_signatures
  SET
    status = 'active',
    activated_at = now()
  WHERE id = pending_signature.id
  RETURNING *
  INTO activated_signature;

  RETURN activated_signature;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_own_profile_signature_upload(
  target_signature_id uuid
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

  UPDATE public.profile_signatures profile_signature
  SET status = 'deleted'
  FROM public.person_profiles person_profile
  WHERE profile_signature.person_profile_id = person_profile.id
    AND profile_signature.organization_id = person_profile.organization_id
    AND profile_signature.id = target_signature_id
    AND profile_signature.status = 'pending'
    AND profile_signature.uploaded_by_user_id = current_user_id
    AND person_profile.user_id = current_user_id
    AND public.is_org_member(profile_signature.organization_id);
END;
$$;

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE public.profile_signatures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Linked users can view own profile signatures"
  ON public.profile_signatures FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.person_profiles person_profile
      WHERE person_profile.id = profile_signatures.person_profile_id
        AND person_profile.organization_id = profile_signatures.organization_id
        AND person_profile.user_id = (select auth.uid())
        AND public.is_org_member(profile_signatures.organization_id)
    )
  );

DROP POLICY IF EXISTS "Users can upload own profile signatures" ON storage.objects;
DROP POLICY IF EXISTS "Users can read own profile signatures" ON storage.objects;

CREATE POLICY "Users can upload own profile signatures"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'profile-signatures'
    AND EXISTS (
      SELECT 1
      FROM public.profile_signatures profile_signature
      INNER JOIN public.person_profiles person_profile
        ON person_profile.id = profile_signature.person_profile_id
        AND person_profile.organization_id = profile_signature.organization_id
      WHERE profile_signature.storage_bucket = bucket_id
        AND profile_signature.storage_path = name
        AND profile_signature.status = 'pending'
        AND profile_signature.uploaded_by_user_id = (select auth.uid())
        AND person_profile.user_id = (select auth.uid())
        AND public.is_org_member(profile_signature.organization_id)
    )
  );

CREATE POLICY "Users can read own profile signatures"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'profile-signatures'
    AND EXISTS (
      SELECT 1
      FROM public.profile_signatures profile_signature
      INNER JOIN public.person_profiles person_profile
        ON person_profile.id = profile_signature.person_profile_id
        AND person_profile.organization_id = profile_signature.organization_id
      WHERE profile_signature.storage_bucket = bucket_id
        AND profile_signature.storage_path = name
        AND profile_signature.status = 'active'
        AND person_profile.user_id = (select auth.uid())
        AND public.is_org_member(profile_signature.organization_id)
    )
  );

-- Path-level fallback documentation: profile_signatures.storage_path is
-- constrained to signatures/{organization_id}/{person_profile_id}/{signature_id}.png;
-- Storage policies above require matching metadata before accepting reads or uploads.

-- ============================================================
-- Grants
-- ============================================================

GRANT SELECT ON public.profile_signatures TO authenticated;

GRANT EXECUTE ON FUNCTION public.begin_own_profile_signature_upload(
  uuid,
  integer,
  text,
  integer,
  integer
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.activate_own_profile_signature(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_own_profile_signature_upload(uuid) TO authenticated;
