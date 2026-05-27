-- BoxOps - Console platform foundation
-- Internal SaaS operations layer for manual subscriptions and platform support.
-- This cut creates no visible /console route, no payment integration, no
-- webhooks and no raw banking data.

-- ============================================================
-- Helpers
-- ============================================================

CREATE OR REPLACE FUNCTION public.platform_metadata_is_safe(
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
        WHEN jsonb_typeof(COALESCE(target_metadata, '{}'::jsonb)) = 'object' THEN COALESCE(target_metadata, '{}'::jsonb)
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
      WHERE length(key_name) > 64
        OR lower(key_name) ~ '(content|body|html|raw|base64|url|uri|path|token|secret|signature|storage|password|credential|cookie|session|ip|fingerprint|latitude|longitude|coordinate|geolocation|gps|location|salary|payroll|nomina|iban|bank|card|cvv|mandate|account|routing|swift|bic|payment_method|payment-method)'
        OR jsonb_typeof(value) = 'array'
        OR (
          jsonb_typeof(value) = 'string'
          AND (
            length(value #>> '{}') > 160
            OR (value #>> '{}') ~* '(https?://|data:|storage/v1|base64|-----BEGIN|signed-url|signed_url|@[^[:space:]]+[.][^[:space:]]+|\m(token|secret|password|credential|cookie|session|bearer|jwt|api[_-]?key|signed[_-]?url|salary|payroll|nomina|iban|bank|card|cvv|mandate|account|routing|swift|bic|payment[_-]?method|geolocation|latitude|longitude|coordinate|gps|ip|fingerprint)\M)'
          )
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.platform_reason_is_safe(
  target_reason text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    target_reason IS NOT NULL
    AND length(btrim(target_reason)) BETWEEN 8 AND 240
    AND target_reason !~* '(https?://|www[.]|data:|base64|token|secret|password|credential|signed-url|signed_url|storage/v1|document-files|profile-assets|profile-signatures|payroll|salary|salario|nomina|iban|bank|card|cvv|mandate|account|routing|swift|bic|payment[_-]?method|dni|nif|ssn|national_id|geolocation|gps|latitude|longitude|coordinate|ubicacion|location|ip|fingerprint|health|medical|diagnostic|diagnostico|baja)';
$$;

CREATE OR REPLACE FUNCTION public.platform_ref_is_safe(
  target_reference text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    target_reference IS NULL
    OR (
      length(btrim(target_reference)) BETWEEN 1 AND 160
      AND btrim(target_reference) ~ '^[A-Za-z0-9._:-]+$'
      AND btrim(target_reference) !~* '(token|secret|password|credential|key|iban|bank|card|cvv|mandate|account|routing|swift|bic|payment[_-]?method)'
    );
$$;

-- ============================================================
-- Tables
-- ============================================================

CREATE TABLE public.platform_admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL
    CHECK (role IN ('platform_owner', 'support', 'billing', 'viewer')),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'suspended')),
  display_name text,
  notes text,
  created_by_platform_admin_id uuid,
  updated_by_platform_admin_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id),
  UNIQUE (id, user_id),
  FOREIGN KEY (created_by_platform_admin_id)
    REFERENCES public.platform_admins(id)
    ON DELETE SET NULL,
  FOREIGN KEY (updated_by_platform_admin_id)
    REFERENCES public.platform_admins(id)
    ON DELETE SET NULL,
  CONSTRAINT platform_admins_display_name_safe
    CHECK (
      display_name IS NULL
      OR (
        length(btrim(display_name)) BETWEEN 1 AND 120
        AND display_name !~* '(https?://|www[.]|data:|base64|token|secret|password|credential|signed-url|signed_url|storage/v1)'
      )
    ),
  CONSTRAINT platform_admins_notes_safe
    CHECK (notes IS NULL OR public.platform_reason_is_safe(notes))
);

CREATE TABLE public.organization_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  plan_code text NOT NULL DEFAULT 'manual'
    CHECK (plan_code ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' AND length(plan_code) <= 64),
  status text NOT NULL DEFAULT 'manual'
    CHECK (status IN ('manual', 'trialing', 'active', 'past_due', 'paused', 'cancelled')),
  trial_ends_at timestamptz,
  current_period_ends_at timestamptz,
  seat_limit integer
    CHECK (seat_limit IS NULL OR seat_limit BETWEEN 1 AND 10000),
  center_limit integer
    CHECK (center_limit IS NULL OR center_limit BETWEEN 1 AND 1000),
  billing_email text,
  provider text NOT NULL DEFAULT 'manual'
    CHECK (provider IN ('manual', 'external_provider')),
  provider_customer_ref text,
  provider_subscription_ref text,
  commercial_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_platform_admin_id uuid,
  updated_by_platform_admin_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id),
  UNIQUE (id, organization_id),
  FOREIGN KEY (created_by_platform_admin_id)
    REFERENCES public.platform_admins(id)
    ON DELETE SET NULL,
  FOREIGN KEY (updated_by_platform_admin_id)
    REFERENCES public.platform_admins(id)
    ON DELETE SET NULL,
  CONSTRAINT organization_subscriptions_period_order
    CHECK (
      trial_ends_at IS NULL
      OR current_period_ends_at IS NULL
      OR current_period_ends_at >= trial_ends_at
    ),
  CONSTRAINT organization_subscriptions_billing_email_safe
    CHECK (
      billing_email IS NULL
      OR (
        length(btrim(billing_email)) BETWEEN 3 AND 254
        AND btrim(billing_email) = lower(btrim(billing_email))
        AND btrim(billing_email) ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
      )
    ),
  CONSTRAINT organization_subscriptions_provider_refs_safe
    CHECK (
      public.platform_ref_is_safe(provider_customer_ref)
      AND public.platform_ref_is_safe(provider_subscription_ref)
    ),
  CONSTRAINT organization_subscriptions_metadata_safe
    CHECK (public.platform_metadata_is_safe(commercial_metadata))
);

CREATE TABLE public.platform_support_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_admin_id uuid NOT NULL,
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'ended', 'expired', 'revoked')),
  support_scope text NOT NULL DEFAULT 'tenant_overview'
    CHECK (support_scope IN ('tenant_overview', 'app_support')),
  reason text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '2 hours',
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (id, organization_id),
  FOREIGN KEY (platform_admin_id, actor_user_id)
    REFERENCES public.platform_admins(id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT platform_support_sessions_reason_safe
    CHECK (public.platform_reason_is_safe(reason)),
  CONSTRAINT platform_support_sessions_metadata_safe
    CHECK (public.platform_metadata_is_safe(metadata)),
  CONSTRAINT platform_support_sessions_time_window
    CHECK (
      expires_at > started_at
      AND expires_at <= started_at + interval '8 hours'
    ),
  CONSTRAINT platform_support_sessions_ended_status
    CHECK (status = 'active' OR ended_at IS NOT NULL)
);

CREATE TABLE public.platform_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_admin_id uuid NOT NULL,
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  target_organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  support_session_id uuid,
  entity_type text NOT NULL
    CHECK (entity_type IN (
      'platform_admins',
      'organization_subscriptions',
      'platform_support_sessions',
      'organizations',
      'console_overview'
    )),
  entity_id uuid,
  action text NOT NULL
    CHECK (action IN (
      'viewed',
      'created',
      'updated',
      'activated',
      'suspended',
      'deactivated',
      'support_started',
      'support_ended',
      'support_revoked'
    )),
  result text NOT NULL DEFAULT 'success'
    CHECK (result IN ('success', 'failed', 'denied')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  retain_until timestamptz NOT NULL DEFAULT now() + interval '365 days',
  FOREIGN KEY (platform_admin_id, actor_user_id)
    REFERENCES public.platform_admins(id, user_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (support_session_id, target_organization_id)
    REFERENCES public.platform_support_sessions(id, organization_id)
    ON DELETE SET NULL,
  CONSTRAINT platform_audit_events_metadata_safe
    CHECK (public.platform_metadata_is_safe(metadata)),
  CONSTRAINT platform_audit_events_support_session_scope
    CHECK (support_session_id IS NULL OR target_organization_id IS NOT NULL),
  CONSTRAINT platform_audit_events_retain_window
    CHECK (
      retain_until > created_at
      AND retain_until <= created_at + interval '365 days' + interval '1 day'
    )
);

CREATE INDEX platform_admins_user_status_idx
  ON public.platform_admins (user_id, status);

CREATE INDEX platform_admins_role_status_idx
  ON public.platform_admins (role, status);

CREATE INDEX organization_subscriptions_org_status_idx
  ON public.organization_subscriptions (organization_id, status);

CREATE INDEX organization_subscriptions_plan_status_idx
  ON public.organization_subscriptions (plan_code, status);

CREATE INDEX platform_support_sessions_admin_idx
  ON public.platform_support_sessions (platform_admin_id, status, started_at DESC);

CREATE INDEX platform_support_sessions_org_idx
  ON public.platform_support_sessions (organization_id, status, started_at DESC);

CREATE INDEX platform_support_sessions_active_idx
  ON public.platform_support_sessions (organization_id, expires_at)
  WHERE status = 'active';

CREATE INDEX platform_audit_events_admin_idx
  ON public.platform_audit_events (platform_admin_id, created_at DESC);

CREATE INDEX platform_audit_events_target_org_idx
  ON public.platform_audit_events (target_organization_id, created_at DESC)
  WHERE target_organization_id IS NOT NULL;

CREATE INDEX platform_audit_events_retain_until_idx
  ON public.platform_audit_events (retain_until);

CREATE TRIGGER platform_admins_set_updated_at
  BEFORE UPDATE ON public.platform_admins
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER organization_subscriptions_set_updated_at
  BEFORE UPDATE ON public.organization_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER platform_support_sessions_set_updated_at
  BEFORE UPDATE ON public.platform_support_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- Permission helpers
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_active_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.platform_admins platform_admin
    WHERE platform_admin.user_id = (select auth.uid())
      AND platform_admin.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.has_platform_role(
  allowed_roles text[]
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.platform_admins platform_admin
    WHERE platform_admin.user_id = (select auth.uid())
      AND platform_admin.status = 'active'
      AND platform_admin.role = ANY(allowed_roles)
  );
$$;

CREATE OR REPLACE FUNCTION public.get_active_platform_admin_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT platform_admin.id
  FROM public.platform_admins platform_admin
  WHERE platform_admin.user_id = (select auth.uid())
    AND platform_admin.status = 'active'
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.can_read_platform_admin_row(
  target_platform_admin_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_platform_role(ARRAY['platform_owner'])
    OR (
      public.is_active_platform_admin()
      AND target_platform_admin_user_id = (select auth.uid())
    );
$$;

CREATE OR REPLACE FUNCTION public.can_read_platform_subscription_rows()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_platform_role(ARRAY['platform_owner', 'billing']);
$$;

CREATE OR REPLACE FUNCTION public.can_read_platform_support_sessions()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_platform_role(ARRAY['platform_owner', 'support']);
$$;

CREATE OR REPLACE FUNCTION public.can_read_platform_audit_events()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_platform_role(ARRAY['platform_owner', 'support']);
$$;

-- ============================================================
-- RPCs
-- ============================================================

CREATE OR REPLACE FUNCTION public.list_platform_organization_summaries(
  target_status text DEFAULT NULL,
  target_subscription_status text DEFAULT NULL,
  target_limit integer DEFAULT 100
)
RETURNS TABLE (
  organization_id uuid,
  organization_name text,
  organization_slug text,
  organization_status text,
  organization_created_at timestamptz,
  plan_code text,
  subscription_status text,
  trial_ends_at timestamptz,
  current_period_ends_at timestamptz,
  seat_limit integer,
  center_limit integer,
  active_centers_count bigint,
  active_users_count bigint,
  active_coaches_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized_status text := NULLIF(lower(btrim(COALESCE(target_status, ''))), '');
  normalized_subscription_status text := NULLIF(lower(btrim(COALESCE(target_subscription_status, ''))), '');
  bounded_limit integer := LEAST(GREATEST(COALESCE(target_limit, 100), 1), 500);
BEGIN
  IF (select auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF NOT public.is_active_platform_admin() THEN
    RAISE EXCEPTION 'active platform admin required';
  END IF;

  IF normalized_status IS NOT NULL
    AND normalized_status NOT IN ('trialing', 'active', 'inactive', 'suspended') THEN
    RAISE EXCEPTION 'organization status is not allowed';
  END IF;

  IF normalized_subscription_status IS NOT NULL
    AND normalized_subscription_status NOT IN ('manual', 'trialing', 'active', 'past_due', 'paused', 'cancelled') THEN
    RAISE EXCEPTION 'subscription status is not allowed';
  END IF;

  RETURN QUERY
  SELECT
    organization.id AS organization_id,
    organization.name AS organization_name,
    organization.slug AS organization_slug,
    organization.status AS organization_status,
    organization.created_at AS organization_created_at,
    COALESCE(subscription.plan_code, 'manual') AS plan_code,
    COALESCE(subscription.status, 'manual') AS subscription_status,
    subscription.trial_ends_at,
    subscription.current_period_ends_at,
    subscription.seat_limit,
    subscription.center_limit,
    COALESCE(center_counts.active_centers_count, 0)::bigint AS active_centers_count,
    COALESCE(user_counts.active_users_count, 0)::bigint AS active_users_count,
    COALESCE(coach_counts.active_coaches_count, 0)::bigint AS active_coaches_count
  FROM public.organizations organization
  LEFT JOIN public.organization_subscriptions subscription
    ON subscription.organization_id = organization.id
  LEFT JOIN LATERAL (
    SELECT count(*) AS active_centers_count
    FROM public.centers center_record
    WHERE center_record.organization_id = organization.id
      AND center_record.status = 'active'
  ) center_counts ON true
  LEFT JOIN LATERAL (
    SELECT count(*) AS active_users_count
    FROM public.organization_memberships membership
    WHERE membership.organization_id = organization.id
      AND membership.status = 'active'
  ) user_counts ON true
  LEFT JOIN LATERAL (
    SELECT count(*) AS active_coaches_count
    FROM public.coach_profiles coach_profile
    WHERE coach_profile.organization_id = organization.id
      AND coach_profile.status = 'active'
  ) coach_counts ON true
  WHERE (normalized_status IS NULL OR organization.status = normalized_status)
    AND (
      normalized_subscription_status IS NULL
      OR COALESCE(subscription.status, 'manual') = normalized_subscription_status
    )
  ORDER BY organization.created_at DESC, organization.name ASC
  LIMIT bounded_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_platform_audit_event(
  target_entity_type text,
  target_action text,
  target_result text DEFAULT 'success',
  target_target_organization_id uuid DEFAULT NULL,
  target_entity_id uuid DEFAULT NULL,
  target_support_session_id uuid DEFAULT NULL,
  target_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS public.platform_audit_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := (select auth.uid());
  current_platform_admin public.platform_admins;
  normalized_entity_type text := lower(btrim(COALESCE(target_entity_type, '')));
  normalized_action text := lower(btrim(COALESCE(target_action, '')));
  normalized_result text := lower(btrim(COALESCE(target_result, 'success')));
  normalized_metadata jsonb := COALESCE(target_metadata, '{}'::jsonb);
  created_event public.platform_audit_events;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT platform_admin.*
  INTO current_platform_admin
  FROM public.platform_admins platform_admin
  WHERE platform_admin.user_id = current_user_id
    AND platform_admin.status = 'active'
  LIMIT 1;

  IF current_platform_admin.id IS NULL THEN
    RAISE EXCEPTION 'active platform admin required';
  END IF;

  IF normalized_entity_type NOT IN (
    'platform_admins',
    'organization_subscriptions',
    'platform_support_sessions',
    'organizations',
    'console_overview'
  ) THEN
    RAISE EXCEPTION 'platform audit entity type is not allowed';
  END IF;

  IF normalized_action NOT IN (
    'viewed',
    'created',
    'updated',
    'activated',
    'suspended',
    'deactivated',
    'support_started',
    'support_ended',
    'support_revoked'
  ) THEN
    RAISE EXCEPTION 'platform audit action is not allowed';
  END IF;

  IF normalized_result NOT IN ('success', 'failed', 'denied') THEN
    RAISE EXCEPTION 'platform audit result is not allowed';
  END IF;

  IF NOT public.platform_metadata_is_safe(normalized_metadata) THEN
    RAISE EXCEPTION 'platform audit metadata is not allowed';
  END IF;

  INSERT INTO public.platform_audit_events (
    platform_admin_id,
    actor_user_id,
    target_organization_id,
    support_session_id,
    entity_type,
    entity_id,
    action,
    result,
    metadata,
    retain_until
  )
  VALUES (
    current_platform_admin.id,
    current_user_id,
    target_target_organization_id,
    target_support_session_id,
    normalized_entity_type,
    target_entity_id,
    normalized_action,
    normalized_result,
    normalized_metadata,
    now() + interval '365 days'
  )
  RETURNING *
  INTO created_event;

  RETURN created_event;
END;
$$;

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_support_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins can read permitted platform admin rows"
  ON public.platform_admins FOR SELECT TO authenticated
  USING (public.can_read_platform_admin_row(user_id));

CREATE POLICY "Platform owners and billing can read subscription rows"
  ON public.organization_subscriptions FOR SELECT TO authenticated
  USING (public.can_read_platform_subscription_rows());

CREATE POLICY "Platform owners and support can read support sessions"
  ON public.platform_support_sessions FOR SELECT TO authenticated
  USING (public.can_read_platform_support_sessions());

CREATE POLICY "Platform owners and support can read platform audit events"
  ON public.platform_audit_events FOR SELECT TO authenticated
  USING (
    retain_until > now()
    AND public.can_read_platform_audit_events()
  );

-- ============================================================
-- Grants
-- ============================================================

REVOKE ALL ON public.platform_admins FROM PUBLIC;
REVOKE ALL ON public.organization_subscriptions FROM PUBLIC;
REVOKE ALL ON public.platform_support_sessions FROM PUBLIC;
REVOKE ALL ON public.platform_audit_events FROM PUBLIC;
REVOKE ALL ON public.platform_admins FROM anon, authenticated;
REVOKE ALL ON public.organization_subscriptions FROM anon, authenticated;
REVOKE ALL ON public.platform_support_sessions FROM anon, authenticated;
REVOKE ALL ON public.platform_audit_events FROM anon, authenticated;

GRANT SELECT ON public.platform_admins TO authenticated;
GRANT SELECT ON public.organization_subscriptions TO authenticated;
GRANT SELECT ON public.platform_support_sessions TO authenticated;
GRANT SELECT ON public.platform_audit_events TO authenticated;

REVOKE EXECUTE ON FUNCTION public.platform_metadata_is_safe(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.platform_reason_is_safe(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.platform_ref_is_safe(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_active_platform_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_platform_role(text[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_active_platform_admin_id() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_read_platform_admin_row(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_read_platform_subscription_rows() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_read_platform_support_sessions() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_read_platform_audit_events() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.list_platform_organization_summaries(text, text, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_platform_audit_event(text, text, text, uuid, uuid, uuid, jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.is_active_platform_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_platform_role(text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_platform_admin_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_platform_admin_row(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_platform_subscription_rows() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_platform_support_sessions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_platform_audit_events() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_platform_organization_summaries(text, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_platform_audit_event(text, text, text, uuid, uuid, uuid, jsonb) TO authenticated;
