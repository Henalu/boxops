-- Allow platform owners to edit draft plan versions without mutating published versions.

DROP FUNCTION IF EXISTS public.update_billing_plan_draft_version(
  uuid,
  text,
  text,
  text,
  integer,
  integer,
  integer,
  text,
  integer,
  integer,
  integer,
  integer,
  text,
  jsonb,
  text,
  text,
  text
);

CREATE OR REPLACE FUNCTION public.update_billing_plan_draft_version(
  target_billing_plan_version_id uuid,
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
  target_version public.billing_plan_versions;
  updated_version public.billing_plan_versions;
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

  IF target_billing_plan_version_id IS NULL THEN
    RAISE EXCEPTION 'draft plan version not found';
  END IF;

  SELECT plan_version.*
  INTO target_version
  FROM public.billing_plan_versions plan_version
  WHERE plan_version.id = target_billing_plan_version_id
  FOR UPDATE;

  IF target_version.id IS NULL OR target_version.status <> 'draft' THEN
    RAISE EXCEPTION 'draft plan version not found';
  END IF;

  IF normalized_plan_code <> target_version.plan_code THEN
    RAISE EXCEPTION 'plan code cannot change for draft update';
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

  UPDATE public.billing_plan_versions plan_version
  SET
    display_name = normalized_display_name,
    description = normalized_description,
    monthly_price_cents = target_monthly_price_cents,
    annual_price_cents = target_annual_price_cents,
    setup_price_cents = target_setup_price_cents,
    setup_description = normalized_setup_description,
    center_limit = target_center_limit,
    staff_seat_limit = target_staff_seat_limit,
    future_client_limit = target_future_client_limit,
    storage_gb = target_storage_gb,
    support_level = normalized_support_level,
    features = normalized_features,
    stripe_product_id = NULLIF(btrim(COALESCE(target_stripe_product_id, '')), ''),
    stripe_monthly_price_id = NULLIF(btrim(COALESCE(target_stripe_monthly_price_id, '')), ''),
    stripe_annual_price_id = NULLIF(btrim(COALESCE(target_stripe_annual_price_id, '')), ''),
    updated_by_platform_admin_id = current_platform_admin.id
  WHERE plan_version.id = target_version.id
    AND plan_version.status = 'draft'
  RETURNING *
  INTO updated_version;

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
    updated_version.id,
    'updated',
    'success',
    jsonb_build_object(
      'source', 'console_billing_plans',
      'plan_code', updated_version.plan_code,
      'version', updated_version.version,
      'status', updated_version.status
    ),
    now() + interval '365 days'
  );

  RETURN QUERY
  SELECT
    updated_version.id,
    updated_version.plan_code,
    updated_version.version,
    updated_version.status;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_billing_plan_draft_version(
  uuid,
  text,
  text,
  text,
  integer,
  integer,
  integer,
  text,
  integer,
  integer,
  integer,
  integer,
  text,
  jsonb,
  text,
  text,
  text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.update_billing_plan_draft_version(
  uuid,
  text,
  text,
  text,
  integer,
  integer,
  integer,
  text,
  integer,
  integer,
  integer,
  integer,
  text,
  jsonb,
  text,
  text,
  text
) TO authenticated;
