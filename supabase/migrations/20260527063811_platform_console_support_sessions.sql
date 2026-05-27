-- BoxOps - Console audited support sessions
-- Opens a temporary, audited platform support mode for operational tenant
-- review. This does not create tenant memberships, impersonate users, add
-- payment flows or grant document/payroll-sensitive access.

-- ============================================================
-- Support session helpers
-- ============================================================

CREATE OR REPLACE FUNCTION public.has_active_platform_support_session(
  target_organization_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.platform_support_sessions support_session
    INNER JOIN public.platform_admins platform_admin
      ON platform_admin.id = support_session.platform_admin_id
      AND platform_admin.user_id = support_session.actor_user_id
    INNER JOIN public.organizations organization
      ON organization.id = support_session.organization_id
    WHERE support_session.organization_id = target_organization_id
      AND support_session.actor_user_id = (select auth.uid())
      AND support_session.status = 'active'
      AND support_session.support_scope = 'app_support'
      AND support_session.expires_at > now()
      AND platform_admin.status = 'active'
      AND platform_admin.role IN ('platform_owner', 'support')
      AND organization.status IN ('trialing', 'active')
  );
$$;

CREATE OR REPLACE FUNCTION public.get_active_platform_support_session(
  target_support_session_id uuid
)
RETURNS TABLE (
  support_session_id uuid,
  platform_admin_id uuid,
  actor_user_id uuid,
  platform_role text,
  organization_id uuid,
  organization_name text,
  organization_slug text,
  organization_status text,
  organization_timezone text,
  organization_theme_config jsonb,
  organization_time_tracking_config jsonb,
  support_scope text,
  started_at timestamptz,
  expires_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := (select auth.uid());
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  RETURN QUERY
  SELECT
    support_session.id AS support_session_id,
    platform_admin.id AS platform_admin_id,
    support_session.actor_user_id,
    platform_admin.role AS platform_role,
    organization.id AS organization_id,
    organization.name AS organization_name,
    organization.slug AS organization_slug,
    organization.status AS organization_status,
    organization.timezone AS organization_timezone,
    organization.theme_config AS organization_theme_config,
    organization.time_tracking_config AS organization_time_tracking_config,
    support_session.support_scope,
    support_session.started_at,
    support_session.expires_at
  FROM public.platform_support_sessions support_session
  INNER JOIN public.platform_admins platform_admin
    ON platform_admin.id = support_session.platform_admin_id
    AND platform_admin.user_id = support_session.actor_user_id
  INNER JOIN public.organizations organization
    ON organization.id = support_session.organization_id
  WHERE support_session.id = target_support_session_id
    AND support_session.actor_user_id = current_user_id
    AND support_session.status = 'active'
    AND support_session.support_scope = 'app_support'
    AND support_session.expires_at > now()
    AND platform_admin.status = 'active'
    AND platform_admin.role IN ('platform_owner', 'support')
    AND organization.status IN ('trialing', 'active')
  LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_platform_support_session(
  target_organization_id uuid,
  target_reason text,
  target_duration_minutes integer DEFAULT 60
)
RETURNS TABLE (
  support_session_id uuid,
  organization_id uuid,
  organization_name text,
  started_at timestamptz,
  expires_at timestamptz,
  audit_event_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := (select auth.uid());
  current_platform_admin public.platform_admins;
  normalized_reason text := btrim(COALESCE(target_reason, ''));
  bounded_duration_minutes integer := COALESCE(target_duration_minutes, 60);
  target_organization public.organizations;
  created_session public.platform_support_sessions;
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

  IF current_platform_admin.role NOT IN ('platform_owner', 'support') THEN
    RAISE EXCEPTION 'platform support role required';
  END IF;

  IF bounded_duration_minutes NOT IN (30, 60, 120) THEN
    RAISE EXCEPTION 'platform support duration is not allowed';
  END IF;

  IF NOT public.platform_reason_is_safe(normalized_reason)
    OR length(normalized_reason) > 160
    OR normalized_reason ~* '(document|documento|archivo|file|url)' THEN
    RAISE EXCEPTION 'platform reason is not allowed';
  END IF;

  SELECT organization.*
  INTO target_organization
  FROM public.organizations organization
  WHERE organization.id = target_organization_id;

  IF target_organization.id IS NULL THEN
    RAISE EXCEPTION 'organization not found';
  END IF;

  IF target_organization.status NOT IN ('trialing', 'active') THEN
    RAISE EXCEPTION 'organization status is not allowed for support';
  END IF;

  INSERT INTO public.platform_support_sessions (
    platform_admin_id,
    actor_user_id,
    organization_id,
    status,
    support_scope,
    reason,
    started_at,
    expires_at,
    metadata
  )
  VALUES (
    current_platform_admin.id,
    current_user_id,
    target_organization.id,
    'active',
    'app_support',
    normalized_reason,
    now(),
    now() + make_interval(mins => bounded_duration_minutes),
    jsonb_build_object(
      'source', 'console_support',
      'duration_minutes', bounded_duration_minutes
    )
  )
  RETURNING *
  INTO created_session;

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
    target_organization.id,
    created_session.id,
    'platform_support_sessions',
    created_session.id,
    'support_started',
    'success',
    jsonb_build_object(
      'source', 'console_support',
      'support_scope', 'app_support',
      'duration_minutes', bounded_duration_minutes,
      'expires_at', created_session.expires_at
    ),
    now() + interval '365 days'
  )
  RETURNING *
  INTO created_event;

  RETURN QUERY
  SELECT
    created_session.id,
    target_organization.id,
    target_organization.name,
    created_session.started_at,
    created_session.expires_at,
    created_event.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.end_platform_support_session(
  target_support_session_id uuid
)
RETURNS TABLE (
  support_session_id uuid,
  organization_id uuid,
  ended_status text,
  ended_at timestamptz,
  audit_event_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := (select auth.uid());
  current_platform_admin public.platform_admins;
  target_session public.platform_support_sessions;
  updated_session public.platform_support_sessions;
  next_status text;
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

  IF current_platform_admin.role NOT IN ('platform_owner', 'support') THEN
    RAISE EXCEPTION 'platform support role required';
  END IF;

  SELECT support_session.*
  INTO target_session
  FROM public.platform_support_sessions support_session
  WHERE support_session.id = target_support_session_id
    AND support_session.actor_user_id = current_user_id
    AND support_session.status = 'active'
    AND support_session.support_scope = 'app_support'
  FOR UPDATE;

  IF target_session.id IS NULL THEN
    RAISE EXCEPTION 'support session not found';
  END IF;

  next_status := CASE
    WHEN target_session.expires_at <= now() THEN 'expired'
    ELSE 'ended'
  END;

  UPDATE public.platform_support_sessions support_session
  SET
    status = next_status,
    ended_at = now()
  WHERE support_session.id = target_session.id
  RETURNING *
  INTO updated_session;

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
    updated_session.organization_id,
    updated_session.id,
    'platform_support_sessions',
    updated_session.id,
    'support_ended',
    'success',
    jsonb_build_object(
      'source', 'app_support_banner',
      'ended_status', updated_session.status
    ),
    now() + interval '365 days'
  )
  RETURNING *
  INTO created_event;

  RETURN QUERY
  SELECT
    updated_session.id,
    updated_session.organization_id,
    updated_session.status,
    updated_session.ended_at,
    created_event.id;
END;
$$;

-- ============================================================
-- RLS: operational read access for active support sessions
-- ============================================================

CREATE POLICY "Platform support sessions can read organizations"
  ON public.organizations FOR SELECT TO authenticated
  USING (public.has_active_platform_support_session(id));

CREATE POLICY "Platform support sessions can read centers"
  ON public.centers FOR SELECT TO authenticated
  USING (public.has_active_platform_support_session(organization_id));

CREATE POLICY "Platform support sessions can read memberships"
  ON public.organization_memberships FOR SELECT TO authenticated
  USING (public.has_active_platform_support_session(organization_id));

CREATE POLICY "Platform support sessions can read coach profiles"
  ON public.coach_profiles FOR SELECT TO authenticated
  USING (public.has_active_platform_support_session(organization_id));

CREATE POLICY "Platform support sessions can read coach center assignments"
  ON public.coach_center_assignments FOR SELECT TO authenticated
  USING (public.has_active_platform_support_session(organization_id));

CREATE POLICY "Platform support sessions can read person profiles"
  ON public.person_profiles FOR SELECT TO authenticated
  USING (public.has_active_platform_support_session(organization_id));

CREATE POLICY "Platform support sessions can read class types"
  ON public.class_types FOR SELECT TO authenticated
  USING (public.has_active_platform_support_session(organization_id));

CREATE POLICY "Platform support sessions can read schedule templates"
  ON public.schedule_templates FOR SELECT TO authenticated
  USING (public.has_active_platform_support_session(organization_id));

CREATE POLICY "Platform support sessions can read template blocks"
  ON public.schedule_template_blocks FOR SELECT TO authenticated
  USING (public.has_active_platform_support_session(organization_id));

CREATE POLICY "Platform support sessions can read schedule blocks"
  ON public.schedule_blocks FOR SELECT TO authenticated
  USING (public.has_active_platform_support_session(organization_id));

CREATE POLICY "Platform support sessions can read schedule assignments"
  ON public.schedule_block_assignments FOR SELECT TO authenticated
  USING (public.has_active_platform_support_session(organization_id));

CREATE POLICY "Platform support sessions can read operational events"
  ON public.operational_events FOR SELECT TO authenticated
  USING (public.has_active_platform_support_session(organization_id));

-- ============================================================
-- Grants
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.has_active_platform_support_session(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_active_platform_support_session(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_platform_support_session(uuid, text, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.end_platform_support_session(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.has_active_platform_support_session(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_platform_support_session(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_platform_support_session(uuid, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.end_platform_support_session(uuid) TO authenticated;
