-- BoxOps - Console controlled tenant creation
-- Adds the first operational platform mutation without a real payment provider
-- integration or sensitive payment details.

-- ============================================================
-- Audit event scope extension
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
    'console_overview'
  ));

-- ============================================================
-- Controlled organization creation
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_platform_organization_with_owner(
  target_organization_name text,
  target_organization_slug text,
  target_organization_status text,
  target_organization_timezone text,
  target_owner_email text,
  target_owner_user_id uuid DEFAULT NULL,
  target_owner_display_name text DEFAULT NULL,
  target_allow_platform_actor_as_owner boolean DEFAULT false,
  target_plan_code text DEFAULT 'manual',
  target_subscription_status text DEFAULT 'manual',
  target_seat_limit integer DEFAULT NULL,
  target_center_limit integer DEFAULT NULL
)
RETURNS TABLE (
  created_organization_id uuid,
  resolved_owner_user_id uuid,
  created_membership_id uuid,
  created_person_profile_id uuid,
  created_subscription_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := (select auth.uid());
  current_platform_admin public.platform_admins;
  normalized_organization_name text := btrim(COALESCE(target_organization_name, ''));
  normalized_organization_slug text := lower(btrim(COALESCE(target_organization_slug, '')));
  normalized_organization_status text := lower(btrim(COALESCE(target_organization_status, 'trialing')));
  normalized_organization_timezone text := btrim(COALESCE(target_organization_timezone, 'Europe/Madrid'));
  normalized_owner_email text := lower(btrim(COALESCE(target_owner_email, '')));
  normalized_owner_display_name text := NULLIF(btrim(COALESCE(target_owner_display_name, '')), '');
  normalized_plan_code text := lower(btrim(COALESCE(target_plan_code, 'manual')));
  normalized_subscription_status text := lower(btrim(COALESCE(target_subscription_status, 'manual')));
  owner_source text := 'existing_auth_user';
  owner_user_id uuid;
  created_organization public.organizations;
  created_membership public.organization_memberships;
  created_person_profile public.person_profiles;
  created_subscription public.organization_subscriptions;
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

  IF length(normalized_organization_name) < 2
    OR length(normalized_organization_name) > 120
    OR normalized_organization_name ~* '(https?://|www[.]|data:|base64|token|secret|password|credential|signed-url|signed_url|storage/v1)' THEN
    RAISE EXCEPTION 'invalid organization name';
  END IF;

  IF normalized_organization_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    OR length(normalized_organization_slug) > 64 THEN
    RAISE EXCEPTION 'invalid organization slug';
  END IF;

  IF normalized_organization_status NOT IN ('trialing', 'active') THEN
    RAISE EXCEPTION 'invalid organization status';
  END IF;

  IF length(normalized_organization_timezone) < 2
    OR length(normalized_organization_timezone) > 64
    OR normalized_organization_timezone !~ '^[A-Za-z0-9_+.-]+(?:/[A-Za-z0-9_+.-]+)*$' THEN
    RAISE EXCEPTION 'invalid organization timezone';
  END IF;

  IF length(normalized_owner_email) < 3
    OR length(normalized_owner_email) > 254
    OR normalized_owner_email !~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' THEN
    RAISE EXCEPTION 'invalid owner email';
  END IF;

  IF normalized_owner_display_name IS NULL THEN
    normalized_owner_display_name := split_part(normalized_owner_email, '@', 1);
  END IF;

  IF length(normalized_owner_display_name) < 1
    OR length(normalized_owner_display_name) > 80
    OR normalized_owner_display_name ~* '(https?://|www[.]|data:|base64|token|secret|password|credential|signed-url|signed_url|storage/v1)' THEN
    RAISE EXCEPTION 'invalid owner display name';
  END IF;

  IF normalized_plan_code !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    OR length(normalized_plan_code) > 64 THEN
    RAISE EXCEPTION 'invalid plan code';
  END IF;

  IF normalized_subscription_status NOT IN (
    'manual',
    'trialing',
    'active',
    'past_due',
    'paused',
    'cancelled'
  ) THEN
    RAISE EXCEPTION 'invalid subscription status';
  END IF;

  IF target_seat_limit IS NULL
    OR target_seat_limit < 1
    OR target_seat_limit > 10000 THEN
    RAISE EXCEPTION 'invalid seat limit';
  END IF;

  IF target_center_limit IS NULL
    OR target_center_limit < 1
    OR target_center_limit > 1000 THEN
    RAISE EXCEPTION 'invalid center limit';
  END IF;

  IF target_owner_user_id IS NULL THEN
    SELECT auth_user.id
    INTO owner_user_id
    FROM auth.users auth_user
    WHERE lower(auth_user.email) = normalized_owner_email
    LIMIT 1;
  ELSE
    owner_source := 'created_auth_user';

    SELECT auth_user.id
    INTO owner_user_id
    FROM auth.users auth_user
    WHERE auth_user.id = target_owner_user_id
      AND lower(auth_user.email) = normalized_owner_email
    LIMIT 1;
  END IF;

  IF owner_user_id IS NULL THEN
    RAISE EXCEPTION 'owner auth user not found';
  END IF;

  IF owner_user_id = current_user_id
    AND NOT target_allow_platform_actor_as_owner THEN
    RAISE EXCEPTION 'platform actor owner requires explicit confirmation';
  END IF;

  INSERT INTO public.organizations (
    name,
    slug,
    status,
    timezone,
    metadata
  )
  VALUES (
    normalized_organization_name,
    normalized_organization_slug,
    normalized_organization_status,
    normalized_organization_timezone,
    jsonb_build_object('created_from', 'boxops_console')
  )
  RETURNING *
  INTO created_organization;

  INSERT INTO public.organization_subscriptions (
    organization_id,
    plan_code,
    status,
    seat_limit,
    center_limit,
    provider,
    commercial_metadata,
    created_by_platform_admin_id,
    updated_by_platform_admin_id
  )
  VALUES (
    created_organization.id,
    normalized_plan_code,
    normalized_subscription_status,
    target_seat_limit,
    target_center_limit,
    'manual',
    '{}'::jsonb,
    current_platform_admin.id,
    current_platform_admin.id
  )
  RETURNING *
  INTO created_subscription;

  INSERT INTO public.organization_memberships (
    organization_id,
    user_id,
    role,
    status,
    joined_at
  )
  VALUES (
    created_organization.id,
    owner_user_id,
    'owner',
    'active',
    now()
  )
  RETURNING *
  INTO created_membership;

  INSERT INTO public.person_profiles (
    organization_id,
    user_id,
    display_name,
    visibility_status,
    status
  )
  VALUES (
    created_organization.id,
    owner_user_id,
    normalized_owner_display_name,
    'visible',
    'active'
  )
  RETURNING *
  INTO created_person_profile;

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
  VALUES
  (
    current_platform_admin.id,
    current_user_id,
    created_organization.id,
    'organizations',
    created_organization.id,
    'created',
    'success',
    jsonb_build_object(
      'source', 'console_create_organization',
      'organization_status', normalized_organization_status,
      'timezone', normalized_organization_timezone
    ),
    now() + interval '365 days'
  ),
  (
    current_platform_admin.id,
    current_user_id,
    created_organization.id,
    'organization_memberships',
    created_membership.id,
    'created',
    'success',
    jsonb_build_object(
      'source', 'console_initial_owner',
      'role', 'owner',
      'status', 'active',
      'owner_source', owner_source,
      'person_profile_id', created_person_profile.id
    ),
    now() + interval '365 days'
  ),
  (
    current_platform_admin.id,
    current_user_id,
    created_organization.id,
    'organization_subscriptions',
    created_subscription.id,
    'created',
    'success',
    jsonb_build_object(
      'source', 'console_manual_subscription',
      'plan_code', normalized_plan_code,
      'subscription_status', normalized_subscription_status,
      'seat_limit', target_seat_limit,
      'center_limit', target_center_limit
    ),
    now() + interval '365 days'
  );

  RETURN QUERY
  SELECT
    created_organization.id,
    owner_user_id,
    created_membership.id,
    created_person_profile.id,
    created_subscription.id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_platform_organization_with_owner(
  text,
  text,
  text,
  text,
  text,
  uuid,
  text,
  boolean,
  text,
  text,
  integer,
  integer
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_platform_organization_with_owner(
  text,
  text,
  text,
  text,
  text,
  uuid,
  text,
  boolean,
  text,
  text,
  integer,
  integer
) TO authenticated;
