-- BoxOps - Billing plan catalog foundation
-- Versioned founder/early-access commercial plans without real payments.
-- This cut prepares Stripe references for future use, but does not create
-- Checkout, Customer Portal, webhooks, invoices or raw payment data.

-- ============================================================
-- Safe value helpers
-- ============================================================

CREATE OR REPLACE FUNCTION public.billing_plan_text_is_safe(
  target_text text,
  min_length integer,
  max_length integer
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    target_text IS NOT NULL
    AND length(btrim(target_text)) BETWEEN min_length AND max_length
    AND target_text !~* '(https?://|www[.]|data:|base64|token|secret|password|credential|signed-url|signed_url|storage/v1|document-files|profile-assets|profile-signatures|payroll|salary|salario|nomina|iban|bank|card|cvv|mandate|account|routing|swift|bic|payment[_-]?method|dni|nif|ssn|national_id|geolocation|gps|latitude|longitude|coordinate|ubicacion|location|fingerprint|health|medical|diagnostic|diagnostico|baja)';
$$;

CREATE OR REPLACE FUNCTION public.billing_plan_features_are_safe(
  target_features jsonb
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  WITH feature_items AS (
    SELECT value #>> '{}' AS feature_text
    FROM jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(COALESCE(target_features, '[]'::jsonb)) = 'array'
          THEN COALESCE(target_features, '[]'::jsonb)
        ELSE '[]'::jsonb
      END
    ) AS feature(value)
  )
  SELECT
    target_features IS NOT NULL
    AND jsonb_typeof(target_features) = 'array'
    AND jsonb_array_length(target_features) <= 24
    AND NOT EXISTS (
      SELECT 1
      FROM feature_items
      WHERE length(btrim(feature_text)) NOT BETWEEN 1 AND 120
        OR feature_text ~* '(https?://|www[.]|data:|base64|token|secret|password|credential|signed-url|signed_url|storage/v1|payroll|salary|salario|nomina|iban|bank|card|cvv|mandate|account|routing|swift|bic|payment[_-]?method|geolocation|gps|latitude|longitude|coordinate|fingerprint|health|medical)'
    );
$$;

CREATE OR REPLACE FUNCTION public.billing_stripe_product_ref_is_safe(
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
      length(btrim(target_reference)) BETWEEN 8 AND 120
      AND btrim(target_reference) ~ '^prod_[A-Za-z0-9_]+$'
    );
$$;

CREATE OR REPLACE FUNCTION public.billing_stripe_price_ref_is_safe(
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
      length(btrim(target_reference)) BETWEEN 9 AND 120
      AND btrim(target_reference) ~ '^price_[A-Za-z0-9_]+$'
    );
$$;

-- ============================================================
-- Platform audit scope extension
-- ============================================================

ALTER TABLE public.platform_audit_events
  DROP CONSTRAINT IF EXISTS platform_audit_events_entity_type_check;

ALTER TABLE public.platform_audit_events
  ADD CONSTRAINT platform_audit_events_entity_type_check
  CHECK (entity_type IN (
    'platform_admins',
    'organization_subscriptions',
    'platform_support_sessions',
    'organizations',
    'organization_memberships',
    'billing_plans',
    'billing_plan_versions',
    'console_overview'
  ));

-- ============================================================
-- Versioned plan catalog
-- ============================================================

CREATE TABLE public.billing_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_code text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, plan_code),
  CONSTRAINT billing_plans_plan_code_format
    CHECK (
      plan_code ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
      AND length(plan_code) <= 64
    )
);

CREATE TABLE public.billing_plan_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  billing_plan_id uuid NOT NULL,
  plan_code text NOT NULL,
  version integer NOT NULL,
  display_name text NOT NULL,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),
  monthly_price_cents integer,
  annual_price_cents integer,
  setup_price_cents integer,
  setup_description text,
  currency text NOT NULL DEFAULT 'EUR'
    CHECK (currency = 'EUR'),
  center_limit integer,
  staff_seat_limit integer,
  future_client_limit integer,
  storage_gb integer,
  support_level text NOT NULL,
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  stripe_product_id text,
  stripe_monthly_price_id text,
  stripe_annual_price_id text,
  created_by_platform_admin_id uuid,
  updated_by_platform_admin_id uuid,
  published_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (billing_plan_id, version),
  UNIQUE (plan_code, version),
  FOREIGN KEY (billing_plan_id, plan_code)
    REFERENCES public.billing_plans(id, plan_code)
    ON DELETE CASCADE,
  FOREIGN KEY (created_by_platform_admin_id)
    REFERENCES public.platform_admins(id)
    ON DELETE SET NULL,
  FOREIGN KEY (updated_by_platform_admin_id)
    REFERENCES public.platform_admins(id)
    ON DELETE SET NULL,
  CONSTRAINT billing_plan_versions_plan_code_format
    CHECK (
      plan_code ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
      AND length(plan_code) <= 64
    ),
  CONSTRAINT billing_plan_versions_version_range
    CHECK (version BETWEEN 1 AND 10000),
  CONSTRAINT billing_plan_versions_display_name_safe
    CHECK (public.billing_plan_text_is_safe(display_name, 2, 80)),
  CONSTRAINT billing_plan_versions_description_safe
    CHECK (public.billing_plan_text_is_safe(description, 8, 260)),
  CONSTRAINT billing_plan_versions_setup_description_safe
    CHECK (
      setup_description IS NULL
      OR public.billing_plan_text_is_safe(setup_description, 4, 160)
    ),
  CONSTRAINT billing_plan_versions_support_level_safe
    CHECK (public.billing_plan_text_is_safe(support_level, 2, 100)),
  CONSTRAINT billing_plan_versions_price_ranges
    CHECK (
      (monthly_price_cents IS NULL OR monthly_price_cents BETWEEN 1 AND 100000000)
      AND (annual_price_cents IS NULL OR annual_price_cents BETWEEN 1 AND 100000000)
      AND (setup_price_cents IS NULL OR setup_price_cents BETWEEN 1 AND 100000000)
    ),
  CONSTRAINT billing_plan_versions_limits_range
    CHECK (
      (center_limit IS NULL OR center_limit BETWEEN 1 AND 10000)
      AND (staff_seat_limit IS NULL OR staff_seat_limit BETWEEN 1 AND 100000)
      AND (future_client_limit IS NULL OR future_client_limit BETWEEN 1 AND 1000000)
      AND (storage_gb IS NULL OR storage_gb BETWEEN 1 AND 100000)
    ),
  CONSTRAINT billing_plan_versions_features_safe
    CHECK (public.billing_plan_features_are_safe(features)),
  CONSTRAINT billing_plan_versions_stripe_refs_safe
    CHECK (
      public.billing_stripe_product_ref_is_safe(stripe_product_id)
      AND public.billing_stripe_price_ref_is_safe(stripe_monthly_price_id)
      AND public.billing_stripe_price_ref_is_safe(stripe_annual_price_id)
    ),
  CONSTRAINT billing_plan_versions_published_at_present
    CHECK (status <> 'published' OR published_at IS NOT NULL)
);

CREATE INDEX billing_plans_status_idx
  ON public.billing_plans (status, plan_code);

CREATE INDEX billing_plan_versions_plan_status_idx
  ON public.billing_plan_versions (plan_code, status, version DESC);

CREATE INDEX billing_plan_versions_status_idx
  ON public.billing_plan_versions (status, version DESC);

CREATE TRIGGER billing_plans_set_updated_at
  BEFORE UPDATE ON public.billing_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER billing_plan_versions_set_updated_at
  BEFORE UPDATE ON public.billing_plan_versions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- Subscription snapshots
-- ============================================================

ALTER TABLE public.organization_subscriptions
  ADD COLUMN billing_plan_version_id uuid
    REFERENCES public.billing_plan_versions(id)
    ON DELETE SET NULL,
  ADD COLUMN plan_version integer,
  ADD COLUMN plan_display_name text,
  ADD COLUMN plan_description text,
  ADD COLUMN monthly_price_cents integer,
  ADD COLUMN annual_price_cents integer,
  ADD COLUMN setup_price_cents integer,
  ADD COLUMN setup_description text,
  ADD COLUMN currency text NOT NULL DEFAULT 'EUR',
  ADD COLUMN staff_seat_limit integer,
  ADD COLUMN future_client_limit integer,
  ADD COLUMN storage_gb integer,
  ADD COLUMN support_level text,
  ADD COLUMN features jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN stripe_product_id text,
  ADD COLUMN stripe_monthly_price_id text,
  ADD COLUMN stripe_annual_price_id text;

UPDATE public.organization_subscriptions
SET
  staff_seat_limit = COALESCE(staff_seat_limit, seat_limit),
  currency = 'EUR',
  features = COALESCE(features, '[]'::jsonb);

ALTER TABLE public.organization_subscriptions
  ADD CONSTRAINT organization_subscriptions_plan_version_range
    CHECK (plan_version IS NULL OR plan_version BETWEEN 1 AND 10000),
  ADD CONSTRAINT organization_subscriptions_snapshot_text_safe
    CHECK (
      (plan_display_name IS NULL OR public.billing_plan_text_is_safe(plan_display_name, 2, 80))
      AND (plan_description IS NULL OR public.billing_plan_text_is_safe(plan_description, 8, 260))
      AND (setup_description IS NULL OR public.billing_plan_text_is_safe(setup_description, 4, 160))
      AND (support_level IS NULL OR public.billing_plan_text_is_safe(support_level, 2, 100))
    ),
  ADD CONSTRAINT organization_subscriptions_currency_eur
    CHECK (currency = 'EUR'),
  ADD CONSTRAINT organization_subscriptions_snapshot_price_ranges
    CHECK (
      (monthly_price_cents IS NULL OR monthly_price_cents BETWEEN 1 AND 100000000)
      AND (annual_price_cents IS NULL OR annual_price_cents BETWEEN 1 AND 100000000)
      AND (setup_price_cents IS NULL OR setup_price_cents BETWEEN 1 AND 100000000)
    ),
  ADD CONSTRAINT organization_subscriptions_snapshot_limit_ranges
    CHECK (
      (staff_seat_limit IS NULL OR staff_seat_limit BETWEEN 1 AND 100000)
      AND (future_client_limit IS NULL OR future_client_limit BETWEEN 1 AND 1000000)
      AND (storage_gb IS NULL OR storage_gb BETWEEN 1 AND 100000)
    ),
  ADD CONSTRAINT organization_subscriptions_features_safe
    CHECK (public.billing_plan_features_are_safe(features)),
  ADD CONSTRAINT organization_subscriptions_stripe_refs_safe
    CHECK (
      public.billing_stripe_product_ref_is_safe(stripe_product_id)
      AND public.billing_stripe_price_ref_is_safe(stripe_monthly_price_id)
      AND public.billing_stripe_price_ref_is_safe(stripe_annual_price_id)
    );

CREATE INDEX organization_subscriptions_plan_version_idx
  ON public.organization_subscriptions (billing_plan_version_id)
  WHERE billing_plan_version_id IS NOT NULL;

-- ============================================================
-- Initial founder pricing catalog
-- ============================================================

INSERT INTO public.billing_plans (plan_code, status)
VALUES
  ('starter', 'published'),
  ('box', 'published'),
  ('growth', 'published'),
  ('scale', 'published'),
  ('network', 'published'),
  ('franchise', 'published'),
  ('enterprise', 'published')
ON CONFLICT ON CONSTRAINT billing_plans_plan_code_key DO UPDATE
SET status = EXCLUDED.status;

WITH plan_seed AS (
  SELECT *
  FROM (
    VALUES
      (
        'starter',
        1,
        'Starter',
        'Founder pricing para una organizacion que empieza con un centro.',
        3900,
        39000,
        19900,
        'Setup opcional de puesta en marcha.',
        1,
        15,
        600,
        5,
        'Soporte por email basico',
        '["1 centro incluido","15 personas del equipo","600 clientes futuros como semilla contractual","5 GB de almacenamiento","Horario, cobertura y configuracion base"]'::jsonb
      ),
      (
        'box',
        1,
        'Box',
        'Founder pricing para boxes con dos centros o crecimiento inicial.',
        6900,
        69000,
        19900,
        'Setup opcional de puesta en marcha.',
        2,
        30,
        1200,
        10,
        'Soporte por email prioritario',
        '["2 centros incluidos","30 personas del equipo","1200 clientes futuros como semilla contractual","10 GB de almacenamiento","Operativa semanal multi-centro"]'::jsonb
      ),
      (
        'growth',
        1,
        'Growth',
        'Founder pricing para equipos que operan varios centros con mas cobertura.',
        11900,
        119000,
        39900,
        'Setup opcional con acompanamiento de implantacion.',
        5,
        75,
        3000,
        25,
        'Soporte prioritario y onboarding operativo',
        '["5 centros incluidos","75 personas del equipo","3000 clientes futuros como semilla contractual","25 GB de almacenamiento","Acompanamiento inicial de operativa"]'::jsonb
      ),
      (
        'scale',
        1,
        'Scale',
        'Founder pricing para organizaciones con operativa multi-sede consolidada.',
        19900,
        199000,
        39900,
        'Setup opcional con acompanamiento de implantacion.',
        10,
        150,
        6000,
        75,
        'Soporte prioritario y revision operativa',
        '["10 centros incluidos","150 personas del equipo","6000 clientes futuros como semilla contractual","75 GB de almacenamiento","Revision operativa de puesta en marcha"]'::jsonb
      ),
      (
        'network',
        1,
        'Network',
        'Founder pricing para redes de boxes con gestion centralizada.',
        34900,
        349000,
        59900,
        'Setup opcional para red de centros.',
        20,
        300,
        12000,
        150,
        'Acompanamiento de implantacion de red',
        '["20 centros incluidos","300 personas del equipo","12000 clientes futuros como semilla contractual","150 GB de almacenamiento","Operacion centralizada para red"]'::jsonb
      ),
      (
        'franchise',
        1,
        'Franchise',
        'Founder pricing para franquicias o grupos grandes con muchos centros.',
        69900,
        699000,
        59900,
        'Setup opcional para franquicia.',
        50,
        750,
        30000,
        300,
        'Acompanamiento de implantacion avanzado',
        '["50 centros incluidos","750 personas del equipo","30000 clientes futuros como semilla contractual","300 GB de almacenamiento","Base para operacion de franquicia"]'::jsonb
      ),
      (
        'enterprise',
        1,
        'Enterprise',
        'Plan a medida para mas de 50 centros, limites custom y contrato manual.',
        NULL::integer,
        NULL::integer,
        NULL::integer,
        'Setup a medida segun alcance.',
        NULL::integer,
        NULL::integer,
        NULL::integer,
        NULL::integer,
        'Contrato y soporte a medida',
        '["Mas de 50 centros","Limites custom","Contrato manual","Acompanamiento segun alcance","Preparado para referencias Stripe futuras"]'::jsonb
      )
  ) AS seed(
    plan_code,
    version,
    display_name,
    description,
    monthly_price_cents,
    annual_price_cents,
    setup_price_cents,
    setup_description,
    center_limit,
    staff_seat_limit,
    future_client_limit,
    storage_gb,
    support_level,
    features
  )
)
INSERT INTO public.billing_plan_versions (
  billing_plan_id,
  plan_code,
  version,
  display_name,
  description,
  status,
  monthly_price_cents,
  annual_price_cents,
  setup_price_cents,
  setup_description,
  currency,
  center_limit,
  staff_seat_limit,
  future_client_limit,
  storage_gb,
  support_level,
  features,
  published_at
)
SELECT
  billing_plan.id,
  plan_seed.plan_code,
  plan_seed.version,
  plan_seed.display_name,
  plan_seed.description,
  'published',
  plan_seed.monthly_price_cents,
  plan_seed.annual_price_cents,
  plan_seed.setup_price_cents,
  plan_seed.setup_description,
  'EUR',
  plan_seed.center_limit,
  plan_seed.staff_seat_limit,
  plan_seed.future_client_limit,
  plan_seed.storage_gb,
  plan_seed.support_level,
  plan_seed.features,
  now()
FROM plan_seed
INNER JOIN public.billing_plans billing_plan
  ON billing_plan.plan_code = plan_seed.plan_code
ON CONFLICT (plan_code, version) DO UPDATE
SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  status = EXCLUDED.status,
  monthly_price_cents = EXCLUDED.monthly_price_cents,
  annual_price_cents = EXCLUDED.annual_price_cents,
  setup_price_cents = EXCLUDED.setup_price_cents,
  setup_description = EXCLUDED.setup_description,
  currency = EXCLUDED.currency,
  center_limit = EXCLUDED.center_limit,
  staff_seat_limit = EXCLUDED.staff_seat_limit,
  future_client_limit = EXCLUDED.future_client_limit,
  storage_gb = EXCLUDED.storage_gb,
  support_level = EXCLUDED.support_level,
  features = EXCLUDED.features,
  published_at = COALESCE(public.billing_plan_versions.published_at, EXCLUDED.published_at),
  archived_at = NULL;

-- ============================================================
-- Permission helpers
-- ============================================================

CREATE OR REPLACE FUNCTION public.has_any_tenant_billing_role()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_memberships membership
    INNER JOIN public.organizations organization
      ON organization.id = membership.organization_id
    WHERE membership.user_id = (select auth.uid())
      AND membership.status = 'active'
      AND membership.role IN ('owner', 'admin')
      AND organization.status IN ('trialing', 'active')
  );
$$;

CREATE OR REPLACE FUNCTION public.can_read_billing_plan_catalog()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.can_read_platform_subscription_rows()
    OR public.has_any_tenant_billing_role();
$$;

CREATE OR REPLACE FUNCTION public.can_manage_billing_plan_catalog()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_platform_role(ARRAY['platform_owner']);
$$;

CREATE OR REPLACE FUNCTION public.can_read_organization_billing(
  target_organization_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.can_read_platform_subscription_rows()
    OR public.has_org_role(target_organization_id, ARRAY['owner', 'admin']);
$$;

CREATE OR REPLACE FUNCTION public.can_change_organization_billing(
  target_organization_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_platform_role(ARRAY['platform_owner'])
    OR public.has_org_role(target_organization_id, ARRAY['owner']);
$$;

-- ============================================================
-- Catalog and usage RPCs
-- ============================================================

CREATE OR REPLACE FUNCTION public.list_published_billing_plan_versions()
RETURNS TABLE (
  billing_plan_id uuid,
  billing_plan_version_id uuid,
  plan_code text,
  version integer,
  display_name text,
  description text,
  monthly_price_cents integer,
  annual_price_cents integer,
  setup_price_cents integer,
  setup_description text,
  currency text,
  center_limit integer,
  staff_seat_limit integer,
  future_client_limit integer,
  storage_gb integer,
  support_level text,
  features jsonb,
  stripe_product_id text,
  stripe_monthly_price_id text,
  stripe_annual_price_id text,
  published_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (select auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF NOT public.can_read_billing_plan_catalog() THEN
    RAISE EXCEPTION 'billing catalog read role required';
  END IF;

  RETURN QUERY
  SELECT DISTINCT ON (plan_version.plan_code)
    billing_plan.id,
    plan_version.id,
    plan_version.plan_code,
    plan_version.version,
    plan_version.display_name,
    plan_version.description,
    plan_version.monthly_price_cents,
    plan_version.annual_price_cents,
    plan_version.setup_price_cents,
    plan_version.setup_description,
    plan_version.currency,
    plan_version.center_limit,
    plan_version.staff_seat_limit,
    plan_version.future_client_limit,
    plan_version.storage_gb,
    plan_version.support_level,
    plan_version.features,
    plan_version.stripe_product_id,
    plan_version.stripe_monthly_price_id,
    plan_version.stripe_annual_price_id,
    plan_version.published_at
  FROM public.billing_plan_versions plan_version
  INNER JOIN public.billing_plans billing_plan
    ON billing_plan.id = plan_version.billing_plan_id
  WHERE billing_plan.status = 'published'
    AND plan_version.status = 'published'
  ORDER BY plan_version.plan_code, plan_version.version DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_console_billing_plan_versions()
RETURNS TABLE (
  billing_plan_id uuid,
  billing_plan_status text,
  billing_plan_version_id uuid,
  plan_code text,
  version integer,
  display_name text,
  description text,
  status text,
  monthly_price_cents integer,
  annual_price_cents integer,
  setup_price_cents integer,
  setup_description text,
  currency text,
  center_limit integer,
  staff_seat_limit integer,
  future_client_limit integer,
  storage_gb integer,
  support_level text,
  features jsonb,
  stripe_product_id text,
  stripe_monthly_price_id text,
  stripe_annual_price_id text,
  published_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (select auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF NOT public.can_read_platform_subscription_rows() THEN
    RAISE EXCEPTION 'platform billing read role required';
  END IF;

  RETURN QUERY
  SELECT
    billing_plan.id,
    billing_plan.status,
    plan_version.id,
    plan_version.plan_code,
    plan_version.version,
    plan_version.display_name,
    plan_version.description,
    plan_version.status,
    plan_version.monthly_price_cents,
    plan_version.annual_price_cents,
    plan_version.setup_price_cents,
    plan_version.setup_description,
    plan_version.currency,
    plan_version.center_limit,
    plan_version.staff_seat_limit,
    plan_version.future_client_limit,
    plan_version.storage_gb,
    plan_version.support_level,
    plan_version.features,
    plan_version.stripe_product_id,
    plan_version.stripe_monthly_price_id,
    plan_version.stripe_annual_price_id,
    plan_version.published_at,
    plan_version.archived_at,
    plan_version.created_at,
    plan_version.updated_at
  FROM public.billing_plan_versions plan_version
  INNER JOIN public.billing_plans billing_plan
    ON billing_plan.id = plan_version.billing_plan_id
  ORDER BY plan_version.plan_code ASC, plan_version.version DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.calculate_organization_billing_usage(
  target_organization_id uuid
)
RETURNS TABLE (
  organization_id uuid,
  active_centers_count bigint,
  active_staff_count bigint,
  storage_used_gb numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (select auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF NOT public.can_read_organization_billing(target_organization_id) THEN
    RAISE EXCEPTION 'organization billing read role required';
  END IF;

  RETURN QUERY
  SELECT
    organization.id,
    (
      SELECT count(*)
      FROM public.centers center_record
      WHERE center_record.organization_id = organization.id
        AND center_record.status = 'active'
    )::bigint AS active_centers_count,
    (
      SELECT count(*)
      FROM public.organization_memberships membership
      WHERE membership.organization_id = organization.id
        AND membership.status = 'active'
    )::bigint AS active_staff_count,
    NULL::numeric AS storage_used_gb
  FROM public.organizations organization
  WHERE organization.id = target_organization_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_organization_billing_overview(
  target_organization_id uuid
)
RETURNS TABLE (
  organization_id uuid,
  subscription_id uuid,
  subscription_status text,
  plan_code text,
  plan_version integer,
  billing_plan_version_id uuid,
  display_name text,
  description text,
  monthly_price_cents integer,
  annual_price_cents integer,
  setup_price_cents integer,
  setup_description text,
  currency text,
  center_limit integer,
  staff_seat_limit integer,
  future_client_limit integer,
  storage_gb integer,
  effective_center_limit integer,
  effective_staff_seat_limit integer,
  support_level text,
  features jsonb,
  active_centers_count bigint,
  active_staff_count bigint,
  storage_used_gb numeric,
  trial_ends_at timestamptz,
  current_period_ends_at timestamptz,
  billing_email text,
  provider text,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (select auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF NOT public.can_read_organization_billing(target_organization_id) THEN
    RAISE EXCEPTION 'organization billing read role required';
  END IF;

  RETURN QUERY
  SELECT
    organization.id,
    subscription.id,
    COALESCE(subscription.status, 'manual') AS subscription_status,
    COALESCE(subscription.plan_code, 'manual') AS plan_code,
    subscription.plan_version,
    subscription.billing_plan_version_id,
    COALESCE(subscription.plan_display_name, 'Plan manual') AS display_name,
    COALESCE(subscription.plan_description, 'Gestion manual sin cobro conectado todavia.') AS description,
    subscription.monthly_price_cents,
    subscription.annual_price_cents,
    subscription.setup_price_cents,
    subscription.setup_description,
    COALESCE(subscription.currency, 'EUR') AS currency,
    subscription.center_limit,
    COALESCE(subscription.staff_seat_limit, subscription.seat_limit) AS staff_seat_limit,
    subscription.future_client_limit,
    subscription.storage_gb,
    CASE
      WHEN subscription.billing_plan_version_id IS NULL
        AND COALESCE(subscription.status, 'manual') = 'manual' THEN NULL
      ELSE subscription.center_limit
    END AS effective_center_limit,
    CASE
      WHEN subscription.billing_plan_version_id IS NULL
        AND COALESCE(subscription.status, 'manual') = 'manual' THEN NULL
      ELSE COALESCE(subscription.staff_seat_limit, subscription.seat_limit)
    END AS effective_staff_seat_limit,
    subscription.support_level,
    COALESCE(subscription.features, '[]'::jsonb) AS features,
    COALESCE(center_counts.active_centers_count, 0)::bigint,
    COALESCE(staff_counts.active_staff_count, 0)::bigint,
    NULL::numeric AS storage_used_gb,
    subscription.trial_ends_at,
    subscription.current_period_ends_at,
    subscription.billing_email,
    COALESCE(subscription.provider, 'manual') AS provider,
    subscription.updated_at
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
    SELECT count(*) AS active_staff_count
    FROM public.organization_memberships membership
    WHERE membership.organization_id = organization.id
      AND membership.status = 'active'
  ) staff_counts ON true
  WHERE organization.id = target_organization_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_billing_active_centers(
  target_organization_id uuid
)
RETURNS TABLE (
  center_id uuid,
  center_name text,
  center_slug text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (select auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF NOT public.can_read_organization_billing(target_organization_id) THEN
    RAISE EXCEPTION 'organization billing read role required';
  END IF;

  RETURN QUERY
  SELECT
    center_record.id,
    center_record.name,
    center_record.slug
  FROM public.centers center_record
  WHERE center_record.organization_id = target_organization_id
    AND center_record.status = 'active'
  ORDER BY center_record.name ASC, center_record.created_at ASC;
END;
$$;

-- ============================================================
-- Plan management RPCs
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_billing_plan_draft_version(
  target_plan_code text,
  target_display_name text,
  target_description text,
  target_monthly_price_cents integer DEFAULT NULL,
  target_annual_price_cents integer DEFAULT NULL,
  target_setup_price_cents integer DEFAULT NULL,
  target_setup_description text DEFAULT NULL,
  target_center_limit integer DEFAULT NULL,
  target_staff_seat_limit integer DEFAULT NULL,
  target_future_client_limit integer DEFAULT NULL,
  target_storage_gb integer DEFAULT NULL,
  target_support_level text DEFAULT 'Soporte manual',
  target_features jsonb DEFAULT '[]'::jsonb,
  target_stripe_product_id text DEFAULT NULL,
  target_stripe_monthly_price_id text DEFAULT NULL,
  target_stripe_annual_price_id text DEFAULT NULL
)
RETURNS TABLE (
  billing_plan_version_id uuid,
  plan_code text,
  version integer,
  status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := (select auth.uid());
  current_platform_admin public.platform_admins;
  normalized_plan_code text := lower(btrim(COALESCE(target_plan_code, '')));
  normalized_display_name text := btrim(COALESCE(target_display_name, ''));
  normalized_description text := btrim(COALESCE(target_description, ''));
  normalized_setup_description text := NULLIF(btrim(COALESCE(target_setup_description, '')), '');
  normalized_support_level text := btrim(COALESCE(target_support_level, 'Soporte manual'));
  normalized_features jsonb := COALESCE(target_features, '[]'::jsonb);
  target_plan public.billing_plans;
  next_version integer;
  created_version public.billing_plan_versions;
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

  IF current_platform_admin.id IS NULL
    OR current_platform_admin.role <> 'platform_owner' THEN
    RAISE EXCEPTION 'platform_owner required';
  END IF;

  IF normalized_plan_code !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    OR length(normalized_plan_code) > 64 THEN
    RAISE EXCEPTION 'invalid plan code';
  END IF;

  IF NOT public.billing_plan_text_is_safe(normalized_display_name, 2, 80) THEN
    RAISE EXCEPTION 'invalid plan display name';
  END IF;

  IF NOT public.billing_plan_text_is_safe(normalized_description, 8, 260) THEN
    RAISE EXCEPTION 'invalid plan description';
  END IF;

  IF normalized_setup_description IS NOT NULL
    AND NOT public.billing_plan_text_is_safe(normalized_setup_description, 4, 160) THEN
    RAISE EXCEPTION 'invalid setup description';
  END IF;

  IF NOT public.billing_plan_text_is_safe(normalized_support_level, 2, 100) THEN
    RAISE EXCEPTION 'invalid support level';
  END IF;

  IF NOT public.billing_plan_features_are_safe(normalized_features) THEN
    RAISE EXCEPTION 'invalid plan features';
  END IF;

  IF NOT (
    (target_monthly_price_cents IS NULL OR target_monthly_price_cents BETWEEN 1 AND 100000000)
    AND (target_annual_price_cents IS NULL OR target_annual_price_cents BETWEEN 1 AND 100000000)
    AND (target_setup_price_cents IS NULL OR target_setup_price_cents BETWEEN 1 AND 100000000)
    AND (target_center_limit IS NULL OR target_center_limit BETWEEN 1 AND 10000)
    AND (target_staff_seat_limit IS NULL OR target_staff_seat_limit BETWEEN 1 AND 100000)
    AND (target_future_client_limit IS NULL OR target_future_client_limit BETWEEN 1 AND 1000000)
    AND (target_storage_gb IS NULL OR target_storage_gb BETWEEN 1 AND 100000)
  ) THEN
    RAISE EXCEPTION 'invalid plan numeric value';
  END IF;

  IF NOT (
    public.billing_stripe_product_ref_is_safe(target_stripe_product_id)
    AND public.billing_stripe_price_ref_is_safe(target_stripe_monthly_price_id)
    AND public.billing_stripe_price_ref_is_safe(target_stripe_annual_price_id)
  ) THEN
    RAISE EXCEPTION 'invalid stripe reference';
  END IF;

  INSERT INTO public.billing_plans (plan_code, status)
  VALUES (normalized_plan_code, 'draft')
  ON CONFLICT ON CONSTRAINT billing_plans_plan_code_key DO UPDATE
  SET status = CASE
    WHEN public.billing_plans.status = 'archived' THEN 'draft'
    ELSE public.billing_plans.status
  END
  RETURNING *
  INTO target_plan;

  SELECT COALESCE(max(plan_version.version), 0) + 1
  INTO next_version
  FROM public.billing_plan_versions plan_version
  WHERE plan_version.plan_code = normalized_plan_code;

  INSERT INTO public.billing_plan_versions (
    billing_plan_id,
    plan_code,
    version,
    display_name,
    description,
    status,
    monthly_price_cents,
    annual_price_cents,
    setup_price_cents,
    setup_description,
    currency,
    center_limit,
    staff_seat_limit,
    future_client_limit,
    storage_gb,
    support_level,
    features,
    stripe_product_id,
    stripe_monthly_price_id,
    stripe_annual_price_id,
    created_by_platform_admin_id,
    updated_by_platform_admin_id
  )
  VALUES (
    target_plan.id,
    normalized_plan_code,
    next_version,
    normalized_display_name,
    normalized_description,
    'draft',
    target_monthly_price_cents,
    target_annual_price_cents,
    target_setup_price_cents,
    normalized_setup_description,
    'EUR',
    target_center_limit,
    target_staff_seat_limit,
    target_future_client_limit,
    target_storage_gb,
    normalized_support_level,
    normalized_features,
    NULLIF(btrim(COALESCE(target_stripe_product_id, '')), ''),
    NULLIF(btrim(COALESCE(target_stripe_monthly_price_id, '')), ''),
    NULLIF(btrim(COALESCE(target_stripe_annual_price_id, '')), ''),
    current_platform_admin.id,
    current_platform_admin.id
  )
  RETURNING *
  INTO created_version;

  INSERT INTO public.platform_audit_events (
    platform_admin_id,
    actor_user_id,
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
    'billing_plan_versions',
    created_version.id,
    'created',
    'success',
    jsonb_build_object(
      'source', 'console_billing_plans',
      'plan_code', created_version.plan_code,
      'version', created_version.version,
      'status', created_version.status
    ),
    now() + interval '365 days'
  );

  RETURN QUERY
  SELECT
    created_version.id,
    created_version.plan_code,
    created_version.version,
    created_version.status;
END;
$$;

CREATE OR REPLACE FUNCTION public.publish_billing_plan_version(
  target_billing_plan_version_id uuid
)
RETURNS TABLE (
  billing_plan_version_id uuid,
  plan_code text,
  version integer,
  status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := (select auth.uid());
  current_platform_admin public.platform_admins;
  target_version public.billing_plan_versions;
  published_version public.billing_plan_versions;
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

  IF current_platform_admin.id IS NULL
    OR current_platform_admin.role <> 'platform_owner' THEN
    RAISE EXCEPTION 'platform_owner required';
  END IF;

  SELECT plan_version.*
  INTO target_version
  FROM public.billing_plan_versions plan_version
  WHERE plan_version.id = target_billing_plan_version_id
  FOR UPDATE;

  IF target_version.id IS NULL THEN
    RAISE EXCEPTION 'billing plan version not found';
  END IF;

  IF target_version.status = 'archived' THEN
    RAISE EXCEPTION 'archived plan version cannot be published';
  END IF;

  UPDATE public.billing_plan_versions plan_version
  SET
    status = 'archived',
    archived_at = now(),
    updated_by_platform_admin_id = current_platform_admin.id
  WHERE plan_version.plan_code = target_version.plan_code
    AND plan_version.id <> target_version.id
    AND plan_version.status = 'published';

  UPDATE public.billing_plan_versions plan_version
  SET
    status = 'published',
    published_at = COALESCE(plan_version.published_at, now()),
    archived_at = NULL,
    updated_by_platform_admin_id = current_platform_admin.id
  WHERE plan_version.id = target_version.id
  RETURNING *
  INTO published_version;

  UPDATE public.billing_plans billing_plan
  SET status = 'published'
  WHERE billing_plan.id = published_version.billing_plan_id;

  INSERT INTO public.platform_audit_events (
    platform_admin_id,
    actor_user_id,
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
    'billing_plan_versions',
    published_version.id,
    'updated',
    'success',
    jsonb_build_object(
      'source', 'console_billing_plans',
      'plan_code', published_version.plan_code,
      'version', published_version.version,
      'status', 'published'
    ),
    now() + interval '365 days'
  );

  RETURN QUERY
  SELECT
    published_version.id,
    published_version.plan_code,
    published_version.version,
    published_version.status;
END;
$$;

CREATE OR REPLACE FUNCTION public.archive_billing_plan(
  target_plan_code text
)
RETURNS TABLE (
  billing_plan_id uuid,
  plan_code text,
  status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := (select auth.uid());
  current_platform_admin public.platform_admins;
  normalized_plan_code text := lower(btrim(COALESCE(target_plan_code, '')));
  archived_plan public.billing_plans;
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

  IF current_platform_admin.id IS NULL
    OR current_platform_admin.role <> 'platform_owner' THEN
    RAISE EXCEPTION 'platform_owner required';
  END IF;

  IF normalized_plan_code !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    OR length(normalized_plan_code) > 64 THEN
    RAISE EXCEPTION 'invalid plan code';
  END IF;

  UPDATE public.billing_plan_versions plan_version
  SET
    status = 'archived',
    archived_at = COALESCE(plan_version.archived_at, now()),
    updated_by_platform_admin_id = current_platform_admin.id
  WHERE plan_version.plan_code = normalized_plan_code
    AND plan_version.status <> 'archived';

  UPDATE public.billing_plans billing_plan
  SET status = 'archived'
  WHERE billing_plan.plan_code = normalized_plan_code
  RETURNING *
  INTO archived_plan;

  IF archived_plan.id IS NULL THEN
    RAISE EXCEPTION 'billing plan not found';
  END IF;

  INSERT INTO public.platform_audit_events (
    platform_admin_id,
    actor_user_id,
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
    'billing_plans',
    archived_plan.id,
    'updated',
    'success',
    jsonb_build_object(
      'source', 'console_billing_plans',
      'plan_code', archived_plan.plan_code,
      'status', 'archived'
    ),
    now() + interval '365 days'
  );

  RETURN QUERY
  SELECT archived_plan.id, archived_plan.plan_code, archived_plan.status;
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_organization_billing_plan_manual(
  target_organization_id uuid,
  target_plan_code text,
  target_version integer DEFAULT NULL,
  target_keep_center_ids uuid[] DEFAULT ARRAY[]::uuid[]
)
RETURNS TABLE (
  organization_id uuid,
  subscription_id uuid,
  plan_code text,
  plan_version integer,
  active_centers_count bigint,
  deactivated_centers_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := (select auth.uid());
  current_platform_admin public.platform_admins;
  target_organization public.organizations;
  target_plan_version public.billing_plan_versions;
  existing_subscription public.organization_subscriptions;
  updated_subscription public.organization_subscriptions;
  active_center_count integer;
  requested_center_count integer;
  valid_selected_center_count integer;
  deactivated_count integer := 0;
  normalized_plan_code text := lower(btrim(COALESCE(target_plan_code, '')));
  normalized_keep_center_ids uuid[] := COALESCE(target_keep_center_ids, ARRAY[]::uuid[]);
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

  SELECT organization.*
  INTO target_organization
  FROM public.organizations organization
  WHERE organization.id = target_organization_id
  FOR UPDATE;

  IF target_organization.id IS NULL THEN
    RAISE EXCEPTION 'organization not found';
  END IF;

  IF NOT public.can_change_organization_billing(target_organization.id) THEN
    IF current_platform_admin.id IS NOT NULL THEN
      INSERT INTO public.platform_audit_events (
        platform_admin_id,
        actor_user_id,
        target_organization_id,
        entity_type,
        action,
        result,
        metadata,
        retain_until
      )
      VALUES (
        current_platform_admin.id,
        current_user_id,
        target_organization.id,
        'organization_subscriptions',
        'updated',
        'denied',
        jsonb_build_object(
          'source', 'manual_plan_assignment',
          'requested_plan_code', normalized_plan_code
        ),
        now() + interval '365 days'
      );
    END IF;

    RAISE EXCEPTION 'organization billing change role required';
  END IF;

  IF normalized_plan_code !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    OR length(normalized_plan_code) > 64 THEN
    RAISE EXCEPTION 'invalid plan code';
  END IF;

  SELECT plan_version.*
  INTO target_plan_version
  FROM public.billing_plan_versions plan_version
  INNER JOIN public.billing_plans billing_plan
    ON billing_plan.id = plan_version.billing_plan_id
  WHERE plan_version.plan_code = normalized_plan_code
    AND plan_version.status = 'published'
    AND billing_plan.status = 'published'
    AND (target_version IS NULL OR plan_version.version = target_version)
  ORDER BY plan_version.version DESC
  LIMIT 1;

  IF target_plan_version.id IS NULL THEN
    RAISE EXCEPTION 'published plan version not found';
  END IF;

  SELECT count(*)
  INTO active_center_count
  FROM public.centers center_record
  WHERE center_record.organization_id = target_organization.id
    AND center_record.status = 'active';

  IF target_plan_version.center_limit IS NOT NULL
    AND active_center_count > target_plan_version.center_limit THEN
    SELECT count(DISTINCT center_id)
    INTO requested_center_count
    FROM unnest(normalized_keep_center_ids) AS selected(center_id);

    IF requested_center_count IS NULL
      OR requested_center_count < 1
      OR requested_center_count > target_plan_version.center_limit THEN
      RAISE EXCEPTION 'downgrade center selection required';
    END IF;

    SELECT count(DISTINCT center_record.id)
    INTO valid_selected_center_count
    FROM public.centers center_record
    WHERE center_record.organization_id = target_organization.id
      AND center_record.status = 'active'
      AND center_record.id = ANY(normalized_keep_center_ids);

    IF valid_selected_center_count <> requested_center_count THEN
      RAISE EXCEPTION 'downgrade center selection contains invalid centers';
    END IF;

    UPDATE public.centers center_record
    SET status = 'inactive'
    WHERE center_record.organization_id = target_organization.id
      AND center_record.status = 'active'
      AND NOT (center_record.id = ANY(normalized_keep_center_ids));

    GET DIAGNOSTICS deactivated_count = ROW_COUNT;
  END IF;

  SELECT subscription.*
  INTO existing_subscription
  FROM public.organization_subscriptions subscription
  WHERE subscription.organization_id = target_organization.id
  FOR UPDATE;

  INSERT INTO public.organization_subscriptions (
    organization_id,
    plan_code,
    status,
    billing_plan_version_id,
    plan_version,
    plan_display_name,
    plan_description,
    monthly_price_cents,
    annual_price_cents,
    setup_price_cents,
    setup_description,
    currency,
    seat_limit,
    center_limit,
    staff_seat_limit,
    future_client_limit,
    storage_gb,
    support_level,
    features,
    provider,
    stripe_product_id,
    stripe_monthly_price_id,
    stripe_annual_price_id,
    created_by_platform_admin_id,
    updated_by_platform_admin_id
  )
  VALUES (
    target_organization.id,
    target_plan_version.plan_code,
    COALESCE(existing_subscription.status, 'manual'),
    target_plan_version.id,
    target_plan_version.version,
    target_plan_version.display_name,
    target_plan_version.description,
    target_plan_version.monthly_price_cents,
    target_plan_version.annual_price_cents,
    target_plan_version.setup_price_cents,
    target_plan_version.setup_description,
    target_plan_version.currency,
    target_plan_version.staff_seat_limit,
    target_plan_version.center_limit,
    target_plan_version.staff_seat_limit,
    target_plan_version.future_client_limit,
    target_plan_version.storage_gb,
    target_plan_version.support_level,
    target_plan_version.features,
    'manual',
    target_plan_version.stripe_product_id,
    target_plan_version.stripe_monthly_price_id,
    target_plan_version.stripe_annual_price_id,
    current_platform_admin.id,
    current_platform_admin.id
  )
  ON CONFLICT ON CONSTRAINT organization_subscriptions_organization_id_key DO UPDATE
  SET
    plan_code = EXCLUDED.plan_code,
    billing_plan_version_id = EXCLUDED.billing_plan_version_id,
    plan_version = EXCLUDED.plan_version,
    plan_display_name = EXCLUDED.plan_display_name,
    plan_description = EXCLUDED.plan_description,
    monthly_price_cents = EXCLUDED.monthly_price_cents,
    annual_price_cents = EXCLUDED.annual_price_cents,
    setup_price_cents = EXCLUDED.setup_price_cents,
    setup_description = EXCLUDED.setup_description,
    currency = EXCLUDED.currency,
    seat_limit = EXCLUDED.seat_limit,
    center_limit = EXCLUDED.center_limit,
    staff_seat_limit = EXCLUDED.staff_seat_limit,
    future_client_limit = EXCLUDED.future_client_limit,
    storage_gb = EXCLUDED.storage_gb,
    support_level = EXCLUDED.support_level,
    features = EXCLUDED.features,
    provider = 'manual',
    stripe_product_id = EXCLUDED.stripe_product_id,
    stripe_monthly_price_id = EXCLUDED.stripe_monthly_price_id,
    stripe_annual_price_id = EXCLUDED.stripe_annual_price_id,
    updated_by_platform_admin_id = current_platform_admin.id
  RETURNING *
  INTO updated_subscription;

  IF current_platform_admin.id IS NOT NULL THEN
    INSERT INTO public.platform_audit_events (
      platform_admin_id,
      actor_user_id,
      target_organization_id,
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
      target_organization.id,
      'organization_subscriptions',
      updated_subscription.id,
      'updated',
      'success',
      jsonb_build_object(
        'source', 'manual_plan_assignment',
        'plan_code', target_plan_version.plan_code,
        'version', target_plan_version.version,
        'deactivated_centers', deactivated_count
      ),
      now() + interval '365 days'
    );
  END IF;

  SELECT count(*)
  INTO active_center_count
  FROM public.centers center_record
  WHERE center_record.organization_id = target_organization.id
    AND center_record.status = 'active';

  RETURN QUERY
  SELECT
    target_organization.id,
    updated_subscription.id,
    updated_subscription.plan_code,
    updated_subscription.plan_version,
    active_center_count::bigint,
    deactivated_count::bigint;
END;
$$;

-- ============================================================
-- Center limit enforcement
-- ============================================================

CREATE OR REPLACE FUNCTION public.enforce_center_limit_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_subscription public.organization_subscriptions;
  active_center_count integer;
BEGIN
  IF NEW.status <> 'active' THEN
    RETURN NEW;
  END IF;

  SELECT subscription.*
  INTO target_subscription
  FROM public.organization_subscriptions subscription
  WHERE subscription.organization_id = NEW.organization_id;

  IF target_subscription.id IS NULL
    OR target_subscription.billing_plan_version_id IS NULL
    OR target_subscription.center_limit IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*)
  INTO active_center_count
  FROM public.centers center_record
  WHERE center_record.organization_id = NEW.organization_id
    AND center_record.status = 'active';

  IF active_center_count >= target_subscription.center_limit THEN
    RAISE EXCEPTION 'center_limit_reached';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS centers_enforce_billing_center_limit ON public.centers;

CREATE TRIGGER centers_enforce_billing_center_limit
  BEFORE INSERT ON public.centers
  FOR EACH ROW EXECUTE FUNCTION public.enforce_center_limit_on_insert();

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE public.billing_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_plan_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Platform billing can read all billing plans"
  ON public.billing_plans;

CREATE POLICY "Platform billing can read all billing plans"
  ON public.billing_plans FOR SELECT TO authenticated
  USING (public.can_read_platform_subscription_rows());

DROP POLICY IF EXISTS "Tenant billing readers can read published billing plans"
  ON public.billing_plans;

CREATE POLICY "Tenant billing readers can read published billing plans"
  ON public.billing_plans FOR SELECT TO authenticated
  USING (
    status = 'published'
    AND public.has_any_tenant_billing_role()
  );

DROP POLICY IF EXISTS "Platform billing can read all billing plan versions"
  ON public.billing_plan_versions;

CREATE POLICY "Platform billing can read all billing plan versions"
  ON public.billing_plan_versions FOR SELECT TO authenticated
  USING (public.can_read_platform_subscription_rows());

DROP POLICY IF EXISTS "Tenant billing readers can read published billing plan versions"
  ON public.billing_plan_versions;

CREATE POLICY "Tenant billing readers can read published billing plan versions"
  ON public.billing_plan_versions FOR SELECT TO authenticated
  USING (
    status = 'published'
    AND public.has_any_tenant_billing_role()
  );

DROP POLICY IF EXISTS "Tenant billing readers can read own subscription rows"
  ON public.organization_subscriptions;

CREATE POLICY "Tenant billing readers can read own subscription rows"
  ON public.organization_subscriptions FOR SELECT TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner', 'admin']));

-- ============================================================
-- Grants
-- ============================================================

REVOKE ALL ON public.billing_plans FROM PUBLIC;
REVOKE ALL ON public.billing_plan_versions FROM PUBLIC;
REVOKE ALL ON public.billing_plans FROM anon, authenticated;
REVOKE ALL ON public.billing_plan_versions FROM anon, authenticated;

GRANT SELECT ON public.billing_plans TO authenticated;
GRANT SELECT ON public.billing_plan_versions TO authenticated;

REVOKE EXECUTE ON FUNCTION public.billing_plan_text_is_safe(text, integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.billing_plan_features_are_safe(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.billing_stripe_product_ref_is_safe(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.billing_stripe_price_ref_is_safe(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_any_tenant_billing_role() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_read_billing_plan_catalog() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_manage_billing_plan_catalog() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_read_organization_billing(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_change_organization_billing(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.list_published_billing_plan_versions() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.list_console_billing_plan_versions() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.calculate_organization_billing_usage(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_organization_billing_overview(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.list_billing_active_centers(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_billing_plan_draft_version(text, text, text, integer, integer, integer, text, integer, integer, integer, integer, text, jsonb, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.publish_billing_plan_version(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.archive_billing_plan(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.assign_organization_billing_plan_manual(uuid, text, integer, uuid[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enforce_center_limit_on_insert() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.has_any_tenant_billing_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_billing_plan_catalog() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_billing_plan_catalog() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_organization_billing(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_change_organization_billing(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_published_billing_plan_versions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_console_billing_plan_versions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_organization_billing_usage(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_organization_billing_overview(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_billing_active_centers(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_billing_plan_draft_version(text, text, text, integer, integer, integer, text, integer, integer, integer, integer, text, jsonb, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.publish_billing_plan_version(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_billing_plan(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_organization_billing_plan_manual(uuid, text, integer, uuid[]) TO authenticated;
