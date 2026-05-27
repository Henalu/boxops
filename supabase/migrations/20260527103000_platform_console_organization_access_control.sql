-- BoxOps - Console organization access control
-- Adds a manual platform-owner mutation to suspend/reactivate tenant access.
-- This does not create support sessions, tenant memberships, payment flows or
-- provider integrations.

CREATE OR REPLACE FUNCTION public.set_platform_organization_access_status(
  target_organization_id uuid,
  target_next_status text,
  target_reason text
)
RETURNS TABLE (
  organization_id uuid,
  previous_status text,
  new_status text,
  audit_event_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := (select auth.uid());
  current_platform_admin public.platform_admins;
  normalized_next_status text := lower(btrim(COALESCE(target_next_status, '')));
  normalized_reason text := btrim(COALESCE(target_reason, ''));
  target_organization public.organizations;
  updated_organization public.organizations;
  audit_action text;
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

  IF normalized_next_status NOT IN ('active', 'suspended') THEN
    RAISE EXCEPTION 'invalid organization access status';
  END IF;

  IF NOT public.platform_reason_is_safe(normalized_reason)
    OR length(normalized_reason) > 160
    OR normalized_reason ~* '(document|documento|archivo|file|url)' THEN
    RAISE EXCEPTION 'platform reason is not allowed';
  END IF;

  SELECT organization.*
  INTO target_organization
  FROM public.organizations organization
  WHERE organization.id = target_organization_id
  FOR UPDATE;

  IF target_organization.id IS NULL THEN
    RAISE EXCEPTION 'organization not found';
  END IF;

  audit_action := CASE
    WHEN normalized_next_status = 'suspended' THEN 'suspended'
    ELSE 'activated'
  END;

  IF current_platform_admin.role <> 'platform_owner' THEN
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
      'organizations',
      target_organization.id,
      audit_action,
      'denied',
      jsonb_build_object(
        'source', 'console_organization_access_control',
        'previous_status', target_organization.status,
        'requested_status', normalized_next_status
      ),
      now() + interval '365 days'
    );

    RAISE EXCEPTION 'platform_owner required';
  END IF;

  IF normalized_next_status = 'suspended'
    AND target_organization.status NOT IN ('trialing', 'active') THEN
    RAISE EXCEPTION 'organization status is not transitionable';
  END IF;

  IF normalized_next_status = 'active'
    AND target_organization.status NOT IN ('inactive', 'suspended') THEN
    RAISE EXCEPTION 'organization status is not transitionable';
  END IF;

  UPDATE public.organizations organization
  SET status = normalized_next_status
  WHERE organization.id = target_organization.id
  RETURNING *
  INTO updated_organization;

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
    updated_organization.id,
    'organizations',
    updated_organization.id,
    audit_action,
    'success',
    jsonb_build_object(
      'source', 'console_organization_access_control',
      'previous_status', target_organization.status,
      'new_status', updated_organization.status,
      'reason', normalized_reason
    ),
    now() + interval '365 days'
  )
  RETURNING *
  INTO created_event;

  RETURN QUERY
  SELECT
    updated_organization.id,
    target_organization.status,
    updated_organization.status,
    created_event.id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_platform_organization_access_status(
  uuid,
  text,
  text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.set_platform_organization_access_status(
  uuid,
  text,
  text
) TO authenticated;
