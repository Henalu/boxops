-- BoxOps - Fase D.4 private profile avatars
-- Creates tenant-scoped profile asset metadata and a private Storage bucket for
-- own avatar uploads. The app must never persist public avatar URLs.

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
  'profile-assets',
  'profile-assets',
  false,
  2097152,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ============================================================
-- Profile assets metadata
-- ============================================================

CREATE TABLE public.profile_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  person_profile_id uuid NOT NULL,
  asset_type text NOT NULL DEFAULT 'avatar'
    CHECK (asset_type IN ('avatar')),
  uploaded_by_user_id uuid NOT NULL,
  storage_bucket text NOT NULL DEFAULT 'profile-assets'
    CHECK (storage_bucket = 'profile-assets'),
  storage_path text NOT NULL,
  mime_type text NOT NULL
    CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes integer NOT NULL
    CHECK (size_bytes > 0 AND size_bytes <= 2097152),
  width integer
    CHECK (width IS NULL OR width > 0),
  height integer
    CHECK (height IS NULL OR height > 0),
  asset_hash text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'replaced', 'deleted')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id),
  UNIQUE (storage_bucket, storage_path),
  FOREIGN KEY (person_profile_id, organization_id)
    REFERENCES public.person_profiles(id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, uploaded_by_user_id)
    REFERENCES public.organization_memberships(organization_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT profile_assets_storage_path_format
    CHECK (
      storage_path ~
      '^avatars/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'
    ),
  CONSTRAINT profile_assets_hash_format
    CHECK (asset_hash ~ '^[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX profile_assets_one_active_avatar_idx
  ON public.profile_assets (organization_id, person_profile_id, asset_type)
  WHERE status = 'active';

CREATE INDEX profile_assets_person_status_idx
  ON public.profile_assets (organization_id, person_profile_id, asset_type, status, created_at DESC);

CREATE INDEX profile_assets_uploaded_by_idx
  ON public.profile_assets (uploaded_by_user_id);

CREATE TRIGGER profile_assets_set_updated_at
  BEFORE UPDATE ON public.profile_assets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- Validation helpers
-- ============================================================

CREATE OR REPLACE FUNCTION public.validate_profile_asset_row()
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
    RAISE EXCEPTION 'profile asset requires a linked person profile';
  END IF;

  IF NEW.uploaded_by_user_id <> owner_user_id THEN
    RAISE EXCEPTION 'profile asset uploader must be the linked user';
  END IF;

  expected_prefix :=
    'avatars/' ||
    NEW.organization_id::text ||
    '/' ||
    NEW.person_profile_id::text ||
    '/';

  IF position(expected_prefix in NEW.storage_path) <> 1 THEN
    RAISE EXCEPTION 'profile asset storage path does not match its tenant and person';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.id <> OLD.id
      OR NEW.organization_id <> OLD.organization_id
      OR NEW.person_profile_id <> OLD.person_profile_id
      OR NEW.asset_type <> OLD.asset_type
      OR NEW.uploaded_by_user_id <> OLD.uploaded_by_user_id
      OR NEW.storage_bucket <> OLD.storage_bucket
      OR NEW.storage_path <> OLD.storage_path
      OR NEW.mime_type <> OLD.mime_type
      OR NEW.size_bytes <> OLD.size_bytes
      OR NEW.width IS DISTINCT FROM OLD.width
      OR NEW.height IS DISTINCT FROM OLD.height
      OR NEW.asset_hash <> OLD.asset_hash
      OR NEW.created_at <> OLD.created_at THEN
      RAISE EXCEPTION 'profile asset immutable fields cannot be changed';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER profile_assets_validate_row
  BEFORE INSERT OR UPDATE ON public.profile_assets
  FOR EACH ROW EXECUTE FUNCTION public.validate_profile_asset_row();

CREATE OR REPLACE FUNCTION public.begin_own_profile_avatar_upload(
  target_organization_id uuid,
  target_mime_type text,
  target_size_bytes integer,
  target_asset_hash text,
  target_file_extension text,
  target_width integer DEFAULT NULL,
  target_height integer DEFAULT NULL
)
RETURNS public.profile_assets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := (select auth.uid());
  normalized_extension text := lower(target_file_extension);
  own_person_profile_id uuid;
  new_asset_id uuid := gen_random_uuid();
  new_storage_path text;
  new_asset public.profile_assets;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF NOT public.is_org_member(target_organization_id) THEN
    RAISE EXCEPTION 'active membership required';
  END IF;

  IF target_mime_type NOT IN ('image/jpeg', 'image/png', 'image/webp') THEN
    RAISE EXCEPTION 'avatar mime type is not allowed';
  END IF;

  IF target_size_bytes IS NULL OR target_size_bytes <= 0 OR target_size_bytes > 2097152 THEN
    RAISE EXCEPTION 'avatar file size is not allowed';
  END IF;

  IF target_asset_hash IS NULL OR target_asset_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'avatar hash is not valid';
  END IF;

  IF (
    (target_mime_type = 'image/jpeg' AND normalized_extension <> 'jpg')
    OR (target_mime_type = 'image/png' AND normalized_extension <> 'png')
    OR (target_mime_type = 'image/webp' AND normalized_extension <> 'webp')
  ) THEN
    RAISE EXCEPTION 'avatar file extension does not match mime type';
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

  new_storage_path :=
    'avatars/' ||
    target_organization_id::text ||
    '/' ||
    own_person_profile_id::text ||
    '/' ||
    new_asset_id::text ||
    '.' ||
    normalized_extension;

  INSERT INTO public.profile_assets (
    id,
    organization_id,
    person_profile_id,
    asset_type,
    uploaded_by_user_id,
    storage_bucket,
    storage_path,
    mime_type,
    size_bytes,
    width,
    height,
    asset_hash,
    status
  )
  VALUES (
    new_asset_id,
    target_organization_id,
    own_person_profile_id,
    'avatar',
    current_user_id,
    'profile-assets',
    new_storage_path,
    target_mime_type,
    target_size_bytes,
    target_width,
    target_height,
    target_asset_hash,
    'pending'
  )
  RETURNING *
  INTO new_asset;

  RETURN new_asset;
END;
$$;

CREATE OR REPLACE FUNCTION public.activate_own_profile_avatar_asset(
  target_asset_id uuid
)
RETURNS public.profile_assets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := (select auth.uid());
  pending_asset public.profile_assets;
  activated_asset public.profile_assets;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT profile_asset.*
  INTO pending_asset
  FROM public.profile_assets profile_asset
  INNER JOIN public.person_profiles person_profile
    ON person_profile.id = profile_asset.person_profile_id
    AND person_profile.organization_id = profile_asset.organization_id
  WHERE profile_asset.id = target_asset_id
    AND profile_asset.asset_type = 'avatar'
    AND profile_asset.status = 'pending'
    AND profile_asset.uploaded_by_user_id = current_user_id
    AND person_profile.user_id = current_user_id
    AND public.is_org_member(profile_asset.organization_id)
  FOR UPDATE;

  IF pending_asset.id IS NULL THEN
    RAISE EXCEPTION 'pending avatar asset not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM storage.objects storage_object
    WHERE storage_object.bucket_id = pending_asset.storage_bucket
      AND storage_object.name = pending_asset.storage_path
  ) THEN
    RAISE EXCEPTION 'avatar object was not uploaded';
  END IF;

  UPDATE public.profile_assets
  SET status = 'replaced'
  WHERE organization_id = pending_asset.organization_id
    AND person_profile_id = pending_asset.person_profile_id
    AND asset_type = 'avatar'
    AND status = 'active'
    AND id <> pending_asset.id;

  UPDATE public.profile_assets
  SET status = 'active'
  WHERE id = pending_asset.id
  RETURNING *
  INTO activated_asset;

  RETURN activated_asset;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_own_profile_avatar_upload(
  target_asset_id uuid
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

  UPDATE public.profile_assets profile_asset
  SET status = 'deleted'
  FROM public.person_profiles person_profile
  WHERE profile_asset.person_profile_id = person_profile.id
    AND profile_asset.organization_id = person_profile.organization_id
    AND profile_asset.id = target_asset_id
    AND profile_asset.status = 'pending'
    AND profile_asset.uploaded_by_user_id = current_user_id
    AND person_profile.user_id = current_user_id
    AND public.is_org_member(profile_asset.organization_id);
END;
$$;

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE public.profile_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Linked users can view own profile assets"
  ON public.profile_assets FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.person_profiles person_profile
      WHERE person_profile.id = profile_assets.person_profile_id
        AND person_profile.organization_id = profile_assets.organization_id
        AND person_profile.user_id = (select auth.uid())
        AND public.is_org_member(profile_assets.organization_id)
    )
  );

DROP POLICY IF EXISTS "Users can upload own profile avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can read own profile avatars" ON storage.objects;

CREATE POLICY "Users can upload own profile avatars"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'profile-assets'
    AND EXISTS (
      SELECT 1
      FROM public.profile_assets profile_asset
      INNER JOIN public.person_profiles person_profile
        ON person_profile.id = profile_asset.person_profile_id
        AND person_profile.organization_id = profile_asset.organization_id
      WHERE profile_asset.storage_bucket = bucket_id
        AND profile_asset.storage_path = name
        AND profile_asset.asset_type = 'avatar'
        AND profile_asset.status = 'pending'
        AND profile_asset.uploaded_by_user_id = (select auth.uid())
        AND person_profile.user_id = (select auth.uid())
        AND public.is_org_member(profile_asset.organization_id)
    )
  );

CREATE POLICY "Users can read own profile avatars"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'profile-assets'
    AND EXISTS (
      SELECT 1
      FROM public.profile_assets profile_asset
      INNER JOIN public.person_profiles person_profile
        ON person_profile.id = profile_asset.person_profile_id
        AND person_profile.organization_id = profile_asset.organization_id
      WHERE profile_asset.storage_bucket = bucket_id
        AND profile_asset.storage_path = name
        AND profile_asset.asset_type = 'avatar'
        AND profile_asset.status = 'active'
        AND person_profile.user_id = (select auth.uid())
        AND public.is_org_member(profile_asset.organization_id)
    )
  );

-- Path-level fallback documentation: profile_assets.storage_path is constrained
-- to avatars/{organization_id}/{person_profile_id}/{asset_id}.{ext}; Storage
-- policies above require matching metadata before accepting reads or uploads.

-- ============================================================
-- Grants
-- ============================================================

GRANT SELECT ON public.profile_assets TO authenticated;

GRANT EXECUTE ON FUNCTION public.begin_own_profile_avatar_upload(
  uuid,
  text,
  integer,
  text,
  text,
  integer,
  integer
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.activate_own_profile_avatar_asset(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_own_profile_avatar_upload(uuid) TO authenticated;
