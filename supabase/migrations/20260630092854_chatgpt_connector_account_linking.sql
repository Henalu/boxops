-- BoxOps - ChatGPT connector account linking.
--
-- CG.4B adds the minimum OAuth 2.1 account-linking state needed by
-- ChatGPT Apps SDK/MCP without exposing service-role credentials or direct
-- operational data access.

CREATE OR REPLACE FUNCTION public.chatgpt_connector_oauth_scopes_are_valid(
  target_scopes text[]
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    target_scopes IS NOT NULL
    AND array_length(target_scopes, 1) > 0
    AND NOT EXISTS (
      SELECT 1
      FROM unnest(target_scopes) AS requested(scope)
      WHERE requested.scope <> ALL (ARRAY[
        'boxops.schedule.read',
        'boxops.templates.write',
        'boxops.templates.apply'
      ])
    );
$$;

CREATE TABLE public.chatgpt_connector_oauth_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash text NOT NULL UNIQUE
    CHECK (code_hash ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'consumed', 'expired')),
  actor_user_id uuid NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  membership_id uuid NOT NULL,
  client_id text NOT NULL CHECK (char_length(client_id) BETWEEN 1 AND 512),
  redirect_uri text NOT NULL CHECK (char_length(redirect_uri) BETWEEN 8 AND 2048),
  resource text NOT NULL CHECK (char_length(resource) BETWEEN 8 AND 2048),
  code_challenge text NOT NULL CHECK (code_challenge ~ '^[A-Za-z0-9_-]{43,128}$'),
  code_challenge_method text NOT NULL DEFAULT 'S256'
    CHECK (code_challenge_method = 'S256'),
  scopes text[] NOT NULL
    CHECK (public.chatgpt_connector_oauth_scopes_are_valid(scopes)),
  encrypted_supabase_access_token text NOT NULL
    CHECK (char_length(encrypted_supabase_access_token) BETWEEN 32 AND 8192),
  supabase_access_token_expires_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  access_token_id uuid,
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
  CONSTRAINT chatgpt_connector_oauth_codes_expiry_order
    CHECK (created_at < expires_at),
  CONSTRAINT chatgpt_connector_oauth_codes_supabase_expiry_order
    CHECK (created_at < supabase_access_token_expires_at)
);

CREATE INDEX chatgpt_connector_oauth_codes_pending_idx
  ON public.chatgpt_connector_oauth_codes (expires_at)
  WHERE status = 'pending';

CREATE INDEX chatgpt_connector_oauth_codes_actor_idx
  ON public.chatgpt_connector_oauth_codes (
    organization_id,
    actor_user_id,
    created_at DESC
  );

CREATE TRIGGER chatgpt_connector_oauth_codes_set_updated_at
  BEFORE UPDATE ON public.chatgpt_connector_oauth_codes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.chatgpt_connector_oauth_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Operators can create own connector oauth codes"
  ON public.chatgpt_connector_oauth_codes FOR INSERT TO authenticated
  WITH CHECK (
    actor_user_id = (select auth.uid())
    AND public.is_org_member(organization_id)
  );

REVOKE ALL ON TABLE public.chatgpt_connector_oauth_codes FROM anon, authenticated;
GRANT INSERT ON public.chatgpt_connector_oauth_codes TO authenticated;

CREATE TABLE public.chatgpt_connector_access_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE
    CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'revoked', 'expired')),
  actor_user_id uuid NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  membership_id uuid NOT NULL,
  client_id text NOT NULL CHECK (char_length(client_id) BETWEEN 1 AND 512),
  resource text NOT NULL CHECK (char_length(resource) BETWEEN 8 AND 2048),
  scopes text[] NOT NULL
    CHECK (public.chatgpt_connector_oauth_scopes_are_valid(scopes)),
  encrypted_supabase_access_token text NOT NULL
    CHECK (char_length(encrypted_supabase_access_token) BETWEEN 32 AND 8192),
  supabase_access_token_expires_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
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
  CONSTRAINT chatgpt_connector_access_tokens_expiry_order
    CHECK (created_at < expires_at),
  CONSTRAINT chatgpt_connector_access_tokens_supabase_expiry_order
    CHECK (created_at < supabase_access_token_expires_at)
);

CREATE INDEX chatgpt_connector_access_tokens_active_idx
  ON public.chatgpt_connector_access_tokens (expires_at)
  WHERE status = 'active';

CREATE INDEX chatgpt_connector_access_tokens_actor_idx
  ON public.chatgpt_connector_access_tokens (
    organization_id,
    actor_user_id,
    created_at DESC
  );

CREATE TRIGGER chatgpt_connector_access_tokens_set_updated_at
  BEFORE UPDATE ON public.chatgpt_connector_access_tokens
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.chatgpt_connector_access_tokens ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.chatgpt_connector_access_tokens FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.exchange_chatgpt_connector_oauth_code(
  target_code_hash text,
  target_access_token_hash text,
  target_client_id text,
  target_redirect_uri text,
  target_resource text,
  target_code_challenge text,
  target_expires_at timestamptz,
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
  effective_expires_at timestamptz;
  inserted_access_token_id uuid;
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

  effective_expires_at := LEAST(
    target_expires_at,
    target_code.supabase_access_token_expires_at,
    now() + interval '1 hour'
  );

  IF effective_expires_at <= now() + interval '30 seconds' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'invalid_grant',
      'reason', 'linked_session_too_short'
    );
  END IF;

  INSERT INTO public.chatgpt_connector_access_tokens (
    token_hash,
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
    target_code.actor_user_id,
    target_code.organization_id,
    target_code.membership_id,
    target_code.client_id,
    target_code.resource,
    target_code.scopes,
    target_code.encrypted_supabase_access_token,
    target_code.supabase_access_token_expires_at,
    effective_expires_at,
    target_request_id,
    jsonb_build_object(
      'source', 'chatgpt_connector',
      'grant_type', 'authorization_code',
      'oauth_code_id', target_code.id
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
    'actor_user_id', target_code.actor_user_id,
    'organization_id', target_code.organization_id,
    'membership_id', target_code.membership_id,
    'scope', array_to_string(target_code.scopes, ' '),
    'expires_at', effective_expires_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_chatgpt_connector_access_token(
  target_token_hash text,
  target_resource text,
  target_required_scopes text[] DEFAULT ARRAY[]::text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_token public.chatgpt_connector_access_tokens;
  current_membership public.organization_memberships;
  current_organization public.organizations;
BEGIN
  SELECT *
  INTO target_token
  FROM public.chatgpt_connector_access_tokens token
  WHERE token.token_hash = target_token_hash
  FOR UPDATE;

  IF target_token.id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'invalid_token',
      'reason', 'token_not_found'
    );
  END IF;

  IF target_token.status <> 'active'
    OR target_token.revoked_at IS NOT NULL
    OR target_token.expires_at <= now()
    OR target_token.supabase_access_token_expires_at <= now() + interval '30 seconds'
  THEN
    UPDATE public.chatgpt_connector_access_tokens
    SET status = CASE
      WHEN status = 'active' AND expires_at <= now() THEN 'expired'
      ELSE status
    END
    WHERE id = target_token.id;

    RETURN jsonb_build_object(
      'ok', false,
      'code', 'invalid_token',
      'reason', 'token_not_active'
    );
  END IF;

  IF target_token.resource <> target_resource THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'invalid_token',
      'reason', 'resource_mismatch'
    );
  END IF;

  IF target_required_scopes IS NOT NULL
    AND array_length(target_required_scopes, 1) > 0
    AND NOT target_required_scopes <@ target_token.scopes
  THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'insufficient_scope',
      'reason', 'scope_not_allowed',
      'scope', array_to_string(target_token.scopes, ' ')
    );
  END IF;

  SELECT *
  INTO current_membership
  FROM public.organization_memberships membership
  WHERE membership.id = target_token.membership_id
    AND membership.organization_id = target_token.organization_id
    AND membership.user_id = target_token.actor_user_id
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
      'code', 'invalid_token',
      'reason', 'membership_not_active'
    );
  END IF;

  SELECT *
  INTO current_organization
  FROM public.organizations organization
  WHERE organization.id = target_token.organization_id
    AND organization.status IN ('trialing', 'active');

  IF current_organization.id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'invalid_token',
      'reason', 'organization_not_active'
    );
  END IF;

  UPDATE public.chatgpt_connector_access_tokens
  SET last_used_at = now()
  WHERE id = target_token.id;

  RETURN jsonb_build_object(
    'ok', true,
    'access_token_id', target_token.id,
    'actor_user_id', target_token.actor_user_id,
    'organization_id', target_token.organization_id,
    'membership_id', current_membership.id,
    'role', current_membership.role,
    'organization_timezone', current_organization.timezone,
    'scope', array_to_string(target_token.scopes, ' '),
    'expires_at', target_token.expires_at,
    'encrypted_supabase_access_token', target_token.encrypted_supabase_access_token,
    'supabase_access_token_expires_at', target_token.supabase_access_token_expires_at
  );
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
  UPDATE public.chatgpt_connector_access_tokens
  SET
    status = 'revoked',
    revoked_at = COALESCE(revoked_at, now())
  WHERE token_hash = target_token_hash
    AND status = 'active';

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.exchange_chatgpt_connector_oauth_code(
  text,
  text,
  text,
  text,
  text,
  text,
  timestamptz,
  text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_chatgpt_connector_access_token(
  text,
  text,
  text[]
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_chatgpt_connector_access_token(text)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.chatgpt_connector_oauth_scopes_are_valid(text[])
  FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.exchange_chatgpt_connector_oauth_code(
  text,
  text,
  text,
  text,
  text,
  text,
  timestamptz,
  text
) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_chatgpt_connector_access_token(
  text,
  text,
  text[]
) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_chatgpt_connector_access_token(text)
  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chatgpt_connector_oauth_scopes_are_valid(text[])
  TO authenticated;

COMMENT ON TABLE public.chatgpt_connector_oauth_codes IS
  'One-use OAuth authorization codes for ChatGPT connector account linking. Stores only code hashes and encrypted short-lived Supabase user credentials.';

COMMENT ON TABLE public.chatgpt_connector_access_tokens IS
  'Scoped opaque ChatGPT connector access tokens. Raw token values are never persisted; token hashes are validated through RPC.';
