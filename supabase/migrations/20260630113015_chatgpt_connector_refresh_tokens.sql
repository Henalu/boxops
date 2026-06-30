-- BoxOps - ChatGPT connector refresh token rotation.
--
-- CG.4C adds refresh tokens for ChatGPT account linking while preserving
-- opaque connector credentials, token hashing, revocation and user-RLS runtime.

ALTER TABLE public.chatgpt_connector_oauth_codes
  ADD COLUMN encrypted_supabase_refresh_token text
    CHECK (
      encrypted_supabase_refresh_token IS NULL
      OR char_length(encrypted_supabase_refresh_token) BETWEEN 32 AND 8192
    );

CREATE TABLE public.chatgpt_connector_refresh_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE
    CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'revoked', 'rotated', 'expired')),
  actor_user_id uuid NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  membership_id uuid NOT NULL,
  client_id text NOT NULL CHECK (char_length(client_id) BETWEEN 1 AND 512),
  resource text NOT NULL CHECK (char_length(resource) BETWEEN 8 AND 2048),
  scopes text[] NOT NULL
    CHECK (public.chatgpt_connector_oauth_scopes_are_valid(scopes)),
  encrypted_supabase_refresh_token text NOT NULL
    CHECK (char_length(encrypted_supabase_refresh_token) BETWEEN 32 AND 8192),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  rotated_at timestamptz,
  replaced_by_refresh_token_id uuid,
  last_used_at timestamptz,
  request_id text CHECK (request_id IS NULL OR char_length(request_id) <= 80),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (
      jsonb_typeof(metadata) = 'object'
      AND pg_column_size(metadata) <= 4096
    ),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id),
  FOREIGN KEY (membership_id, organization_id)
    REFERENCES public.organization_memberships(id, organization_id)
    ON DELETE CASCADE,
  FOREIGN KEY (organization_id, actor_user_id)
    REFERENCES public.organization_memberships(organization_id, user_id)
    ON DELETE CASCADE,
  FOREIGN KEY (replaced_by_refresh_token_id)
    REFERENCES public.chatgpt_connector_refresh_tokens(id)
    ON DELETE SET NULL,
  CONSTRAINT chatgpt_connector_refresh_tokens_expiry_order
    CHECK (created_at < expires_at)
);

CREATE INDEX chatgpt_connector_refresh_tokens_active_idx
  ON public.chatgpt_connector_refresh_tokens (expires_at)
  WHERE status = 'active';

CREATE INDEX chatgpt_connector_refresh_tokens_actor_idx
  ON public.chatgpt_connector_refresh_tokens (
    organization_id,
    actor_user_id,
    created_at DESC
  );

CREATE TRIGGER chatgpt_connector_refresh_tokens_set_updated_at
  BEFORE UPDATE ON public.chatgpt_connector_refresh_tokens
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.chatgpt_connector_refresh_tokens ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.chatgpt_connector_refresh_tokens FROM anon, authenticated;

ALTER TABLE public.chatgpt_connector_access_tokens
  ADD COLUMN refresh_token_id uuid
    REFERENCES public.chatgpt_connector_refresh_tokens(id)
    ON DELETE SET NULL;

CREATE INDEX chatgpt_connector_access_tokens_refresh_idx
  ON public.chatgpt_connector_access_tokens (refresh_token_id)
  WHERE refresh_token_id IS NOT NULL;

DROP FUNCTION IF EXISTS public.exchange_chatgpt_connector_oauth_code(
  text,
  text,
  text,
  text,
  text,
  text,
  timestamptz,
  text
);

CREATE OR REPLACE FUNCTION public.exchange_chatgpt_connector_oauth_code(
  target_code_hash text,
  target_access_token_hash text,
  target_refresh_token_hash text,
  target_client_id text,
  target_redirect_uri text,
  target_resource text,
  target_code_challenge text,
  target_access_expires_at timestamptz,
  target_refresh_expires_at timestamptz,
  target_request_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_code public.chatgpt_connector_oauth_codes;
  current_membership public.organization_memberships;
  current_organization public.organizations;
  effective_access_expires_at timestamptz;
  effective_refresh_expires_at timestamptz;
  inserted_access_token_id uuid;
  inserted_refresh_token_id uuid;
BEGIN
  SELECT *
  INTO target_code
  FROM public.chatgpt_connector_oauth_codes code
  WHERE code.code_hash = target_code_hash
  FOR UPDATE;

  IF target_code.id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'invalid_grant',
      'reason', 'code_not_found'
    );
  END IF;

  IF target_code.status <> 'pending'
    OR target_code.consumed_at IS NOT NULL
    OR target_code.expires_at <= now()
  THEN
    UPDATE public.chatgpt_connector_oauth_codes
    SET status = CASE
      WHEN expires_at <= now() THEN 'expired'
      ELSE status
    END
    WHERE id = target_code.id;

    RETURN jsonb_build_object(
      'ok', false,
      'code', 'invalid_grant',
      'reason', 'code_not_usable'
    );
  END IF;

  IF target_code.encrypted_supabase_refresh_token IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'invalid_grant',
      'reason', 'refresh_credential_missing'
    );
  END IF;

  IF target_code.client_id <> target_client_id
    OR target_code.redirect_uri <> target_redirect_uri
    OR target_code.resource <> target_resource
    OR target_code.code_challenge <> target_code_challenge
  THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'invalid_grant',
      'reason', 'code_binding_mismatch'
    );
  END IF;

  SELECT *
  INTO current_membership
  FROM public.organization_memberships membership
  WHERE membership.id = target_code.membership_id
    AND membership.organization_id = target_code.organization_id
    AND membership.user_id = target_code.actor_user_id
    AND membership.status = 'active'
    AND membership.role IN (
      'owner',
      'admin',
      'manager',
      'center_manager',
      'document_admin',
      'coach',
      'staff'
    );

  IF current_membership.id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'access_denied',
      'reason', 'membership_not_active'
    );
  END IF;

  SELECT *
  INTO current_organization
  FROM public.organizations organization
  WHERE organization.id = target_code.organization_id
    AND organization.status IN ('trialing', 'active');

  IF current_organization.id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'access_denied',
      'reason', 'organization_not_active'
    );
  END IF;

  effective_access_expires_at := LEAST(
    target_access_expires_at,
    target_code.supabase_access_token_expires_at,
    now() + interval '1 hour'
  );
  effective_refresh_expires_at := LEAST(
    target_refresh_expires_at,
    now() + interval '30 days'
  );

  IF effective_access_expires_at <= now() + interval '30 seconds' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'invalid_grant',
      'reason', 'linked_session_too_short'
    );
  END IF;

  IF effective_refresh_expires_at <= now() + interval '5 minutes' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'invalid_grant',
      'reason', 'refresh_session_too_short'
    );
  END IF;

  INSERT INTO public.chatgpt_connector_refresh_tokens (
    token_hash,
    actor_user_id,
    organization_id,
    membership_id,
    client_id,
    resource,
    scopes,
    encrypted_supabase_refresh_token,
    expires_at,
    request_id,
    metadata
  )
  VALUES (
    target_refresh_token_hash,
    target_code.actor_user_id,
    target_code.organization_id,
    target_code.membership_id,
    target_code.client_id,
    target_code.resource,
    target_code.scopes,
    target_code.encrypted_supabase_refresh_token,
    effective_refresh_expires_at,
    target_request_id,
    jsonb_build_object(
      'source', 'chatgpt_connector',
      'grant_type', 'authorization_code',
      'oauth_code_id', target_code.id
    )
  )
  RETURNING id INTO inserted_refresh_token_id;

  INSERT INTO public.chatgpt_connector_access_tokens (
    token_hash,
    refresh_token_id,
    actor_user_id,
    organization_id,
    membership_id,
    client_id,
    resource,
    scopes,
    encrypted_supabase_access_token,
    supabase_access_token_expires_at,
    expires_at,
    request_id,
    metadata
  )
  VALUES (
    target_access_token_hash,
    inserted_refresh_token_id,
    target_code.actor_user_id,
    target_code.organization_id,
    target_code.membership_id,
    target_code.client_id,
    target_code.resource,
    target_code.scopes,
    target_code.encrypted_supabase_access_token,
    target_code.supabase_access_token_expires_at,
    effective_access_expires_at,
    target_request_id,
    jsonb_build_object(
      'source', 'chatgpt_connector',
      'grant_type', 'authorization_code',
      'oauth_code_id', target_code.id,
      'refresh_token_id', inserted_refresh_token_id
    )
  )
  RETURNING id INTO inserted_access_token_id;

  UPDATE public.chatgpt_connector_oauth_codes
  SET
    status = 'consumed',
    consumed_at = now(),
    access_token_id = inserted_access_token_id
  WHERE id = target_code.id;

  RETURN jsonb_build_object(
    'ok', true,
    'access_token_id', inserted_access_token_id,
    'refresh_token_id', inserted_refresh_token_id,
    'actor_user_id', target_code.actor_user_id,
    'organization_id', target_code.organization_id,
    'membership_id', target_code.membership_id,
    'scope', array_to_string(target_code.scopes, ' '),
    'expires_at', effective_access_expires_at,
    'refresh_expires_at', effective_refresh_expires_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.prepare_chatgpt_connector_refresh_token(
  target_refresh_token_hash text,
  target_client_id text,
  target_resource text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_refresh public.chatgpt_connector_refresh_tokens;
  current_membership public.organization_memberships;
  current_organization public.organizations;
BEGIN
  SELECT *
  INTO target_refresh
  FROM public.chatgpt_connector_refresh_tokens refresh_token
  WHERE refresh_token.token_hash = target_refresh_token_hash
  FOR UPDATE;

  IF target_refresh.id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'invalid_grant',
      'reason', 'refresh_token_not_found'
    );
  END IF;

  IF target_refresh.status <> 'active'
    OR target_refresh.revoked_at IS NOT NULL
    OR target_refresh.rotated_at IS NOT NULL
    OR target_refresh.expires_at <= now()
  THEN
    UPDATE public.chatgpt_connector_refresh_tokens
    SET status = CASE
      WHEN status = 'active' AND expires_at <= now() THEN 'expired'
      ELSE status
    END
    WHERE id = target_refresh.id;

    RETURN jsonb_build_object(
      'ok', false,
      'code', 'invalid_grant',
      'reason', 'refresh_token_not_active'
    );
  END IF;

  IF target_refresh.client_id <> target_client_id
    OR target_refresh.resource <> target_resource
  THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'invalid_grant',
      'reason', 'refresh_binding_mismatch'
    );
  END IF;

  SELECT *
  INTO current_membership
  FROM public.organization_memberships membership
  WHERE membership.id = target_refresh.membership_id
    AND membership.organization_id = target_refresh.organization_id
    AND membership.user_id = target_refresh.actor_user_id
    AND membership.status = 'active'
    AND membership.role IN (
      'owner',
      'admin',
      'manager',
      'center_manager',
      'document_admin',
      'coach',
      'staff'
    );

  IF current_membership.id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'access_denied',
      'reason', 'membership_not_active'
    );
  END IF;

  SELECT *
  INTO current_organization
  FROM public.organizations organization
  WHERE organization.id = target_refresh.organization_id
    AND organization.status IN ('trialing', 'active');

  IF current_organization.id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'access_denied',
      'reason', 'organization_not_active'
    );
  END IF;

  UPDATE public.chatgpt_connector_refresh_tokens
  SET last_used_at = now()
  WHERE id = target_refresh.id;

  RETURN jsonb_build_object(
    'ok', true,
    'refresh_token_id', target_refresh.id,
    'actor_user_id', target_refresh.actor_user_id,
    'organization_id', target_refresh.organization_id,
    'membership_id', current_membership.id,
    'client_id', target_refresh.client_id,
    'resource', target_refresh.resource,
    'role', current_membership.role,
    'organization_timezone', current_organization.timezone,
    'scope', array_to_string(target_refresh.scopes, ' '),
    'expires_at', target_refresh.expires_at,
    'encrypted_supabase_refresh_token', target_refresh.encrypted_supabase_refresh_token
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.rotate_chatgpt_connector_refresh_token(
  target_refresh_token_hash text,
  target_new_refresh_token_hash text,
  target_access_token_hash text,
  target_encrypted_supabase_access_token text,
  target_encrypted_supabase_refresh_token text,
  target_supabase_access_token_expires_at timestamptz,
  target_access_expires_at timestamptz,
  target_refresh_expires_at timestamptz,
  target_request_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_refresh public.chatgpt_connector_refresh_tokens;
  current_membership public.organization_memberships;
  current_organization public.organizations;
  effective_access_expires_at timestamptz;
  effective_refresh_expires_at timestamptz;
  inserted_access_token_id uuid;
  inserted_refresh_token_id uuid;
BEGIN
  SELECT *
  INTO target_refresh
  FROM public.chatgpt_connector_refresh_tokens refresh_token
  WHERE refresh_token.token_hash = target_refresh_token_hash
  FOR UPDATE;

  IF target_refresh.id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'invalid_grant',
      'reason', 'refresh_token_not_found'
    );
  END IF;

  IF target_refresh.status <> 'active'
    OR target_refresh.revoked_at IS NOT NULL
    OR target_refresh.rotated_at IS NOT NULL
    OR target_refresh.expires_at <= now()
  THEN
    UPDATE public.chatgpt_connector_refresh_tokens
    SET status = CASE
      WHEN status = 'active' AND expires_at <= now() THEN 'expired'
      ELSE status
    END
    WHERE id = target_refresh.id;

    RETURN jsonb_build_object(
      'ok', false,
      'code', 'invalid_grant',
      'reason', 'refresh_token_not_active'
    );
  END IF;

  SELECT *
  INTO current_membership
  FROM public.organization_memberships membership
  WHERE membership.id = target_refresh.membership_id
    AND membership.organization_id = target_refresh.organization_id
    AND membership.user_id = target_refresh.actor_user_id
    AND membership.status = 'active'
    AND membership.role IN (
      'owner',
      'admin',
      'manager',
      'center_manager',
      'document_admin',
      'coach',
      'staff'
    );

  IF current_membership.id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'access_denied',
      'reason', 'membership_not_active'
    );
  END IF;

  SELECT *
  INTO current_organization
  FROM public.organizations organization
  WHERE organization.id = target_refresh.organization_id
    AND organization.status IN ('trialing', 'active');

  IF current_organization.id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'access_denied',
      'reason', 'organization_not_active'
    );
  END IF;

  effective_access_expires_at := LEAST(
    target_access_expires_at,
    target_supabase_access_token_expires_at,
    now() + interval '1 hour'
  );
  effective_refresh_expires_at := LEAST(
    target_refresh_expires_at,
    now() + interval '30 days'
  );

  IF effective_access_expires_at <= now() + interval '30 seconds' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'invalid_grant',
      'reason', 'linked_session_too_short'
    );
  END IF;

  IF effective_refresh_expires_at <= now() + interval '5 minutes' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'invalid_grant',
      'reason', 'refresh_session_too_short'
    );
  END IF;

  INSERT INTO public.chatgpt_connector_refresh_tokens (
    token_hash,
    actor_user_id,
    organization_id,
    membership_id,
    client_id,
    resource,
    scopes,
    encrypted_supabase_refresh_token,
    expires_at,
    request_id,
    metadata
  )
  VALUES (
    target_new_refresh_token_hash,
    target_refresh.actor_user_id,
    target_refresh.organization_id,
    target_refresh.membership_id,
    target_refresh.client_id,
    target_refresh.resource,
    target_refresh.scopes,
    target_encrypted_supabase_refresh_token,
    effective_refresh_expires_at,
    target_request_id,
    jsonb_build_object(
      'source', 'chatgpt_connector',
      'grant_type', 'refresh_token',
      'previous_refresh_token_id', target_refresh.id
    )
  )
  RETURNING id INTO inserted_refresh_token_id;

  UPDATE public.chatgpt_connector_refresh_tokens
  SET
    status = 'rotated',
    rotated_at = now(),
    replaced_by_refresh_token_id = inserted_refresh_token_id
  WHERE id = target_refresh.id;

  UPDATE public.chatgpt_connector_access_tokens
  SET
    status = 'revoked',
    revoked_at = COALESCE(revoked_at, now())
  WHERE refresh_token_id = target_refresh.id
    AND status = 'active';

  INSERT INTO public.chatgpt_connector_access_tokens (
    token_hash,
    refresh_token_id,
    actor_user_id,
    organization_id,
    membership_id,
    client_id,
    resource,
    scopes,
    encrypted_supabase_access_token,
    supabase_access_token_expires_at,
    expires_at,
    request_id,
    metadata
  )
  VALUES (
    target_access_token_hash,
    inserted_refresh_token_id,
    target_refresh.actor_user_id,
    target_refresh.organization_id,
    target_refresh.membership_id,
    target_refresh.client_id,
    target_refresh.resource,
    target_refresh.scopes,
    target_encrypted_supabase_access_token,
    target_supabase_access_token_expires_at,
    effective_access_expires_at,
    target_request_id,
    jsonb_build_object(
      'source', 'chatgpt_connector',
      'grant_type', 'refresh_token',
      'previous_refresh_token_id', target_refresh.id,
      'refresh_token_id', inserted_refresh_token_id
    )
  )
  RETURNING id INTO inserted_access_token_id;

  RETURN jsonb_build_object(
    'ok', true,
    'access_token_id', inserted_access_token_id,
    'refresh_token_id', inserted_refresh_token_id,
    'actor_user_id', target_refresh.actor_user_id,
    'organization_id', target_refresh.organization_id,
    'membership_id', current_membership.id,
    'scope', array_to_string(target_refresh.scopes, ' '),
    'expires_at', effective_access_expires_at,
    'refresh_expires_at', effective_refresh_expires_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_chatgpt_connector_oauth_token(
  target_access_token_hash text DEFAULT NULL,
  target_refresh_token_hash text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected_refresh_token_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  WITH revoked_access AS (
    UPDATE public.chatgpt_connector_access_tokens
    SET
      status = 'revoked',
      revoked_at = COALESCE(revoked_at, now())
    WHERE target_access_token_hash IS NOT NULL
      AND token_hash = target_access_token_hash
      AND status = 'active'
    RETURNING refresh_token_id
  )
  SELECT COALESCE(array_agg(refresh_token_id), ARRAY[]::uuid[])
  INTO affected_refresh_token_ids
  FROM revoked_access
  WHERE refresh_token_id IS NOT NULL;

  WITH revoked_refresh AS (
    UPDATE public.chatgpt_connector_refresh_tokens
    SET
      status = 'revoked',
      revoked_at = COALESCE(revoked_at, now())
    WHERE (
        id = ANY(affected_refresh_token_ids)
        OR (
          target_refresh_token_hash IS NOT NULL
          AND token_hash = target_refresh_token_hash
        )
      )
      AND status = 'active'
    RETURNING id
  )
  SELECT COALESCE(
    affected_refresh_token_ids || array_agg(id),
    affected_refresh_token_ids
  )
  INTO affected_refresh_token_ids
  FROM revoked_refresh;

  UPDATE public.chatgpt_connector_access_tokens
  SET
    status = 'revoked',
    revoked_at = COALESCE(revoked_at, now())
  WHERE refresh_token_id = ANY(affected_refresh_token_ids)
    AND status = 'active';

  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_chatgpt_connector_access_token(
  target_token_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.revoke_chatgpt_connector_oauth_token(
    target_access_token_hash := target_token_hash,
    target_refresh_token_hash := NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.exchange_chatgpt_connector_oauth_code(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  timestamptz,
  timestamptz,
  text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prepare_chatgpt_connector_refresh_token(
  text,
  text,
  text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rotate_chatgpt_connector_refresh_token(
  text,
  text,
  text,
  text,
  text,
  timestamptz,
  timestamptz,
  timestamptz,
  text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_chatgpt_connector_oauth_token(
  text,
  text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_chatgpt_connector_access_token(text)
  FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.exchange_chatgpt_connector_oauth_code(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  timestamptz,
  timestamptz,
  text
) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_chatgpt_connector_refresh_token(
  text,
  text,
  text
) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rotate_chatgpt_connector_refresh_token(
  text,
  text,
  text,
  text,
  text,
  timestamptz,
  timestamptz,
  timestamptz,
  text
) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_chatgpt_connector_oauth_token(
  text,
  text
) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_chatgpt_connector_access_token(text)
  TO anon, authenticated;

COMMENT ON TABLE public.chatgpt_connector_refresh_tokens IS
  'Rotating scoped ChatGPT connector refresh tokens. Raw token values are never persisted; encrypted Supabase refresh credentials are server-only connector material.';
