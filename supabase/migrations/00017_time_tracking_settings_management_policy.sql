-- BoxOps - Fase F.11 operational management of time correction policy
-- Owner, admin and manager can manage the correction approval mode without
-- opening full organization settings to manager.

ALTER TABLE public.time_audit_events
  DROP CONSTRAINT IF EXISTS time_audit_events_event_type_check;

ALTER TABLE public.time_audit_events
  ADD CONSTRAINT time_audit_events_event_type_check
  CHECK (event_type IN (
    'time_record_created',
    'time_punch_created',
    'time_punch_updated',
    'time_correction_requested',
    'time_correction_updated',
    'time_weekly_approval_created',
    'time_weekly_approval_updated',
    'time_export_requested',
    'time_export_updated',
    'time_settings_updated',
    'time_access_denied'
  ));

CREATE OR REPLACE FUNCTION public.validate_organization_time_tracking_config_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := (select auth.uid());
BEGIN
  IF jsonb_typeof(NEW.time_tracking_config) <> 'object' THEN
    RAISE EXCEPTION 'time tracking config must be a JSON object';
  END IF;

  IF NEW.time_tracking_config IS DISTINCT FROM OLD.time_tracking_config
    AND current_user_id IS NOT NULL
    AND NOT public.can_manage_time_tracking(NEW.id) THEN
    RAISE EXCEPTION 'time tracking manager role is required to update time tracking config';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_organization_time_tracking_config_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_membership_id uuid;
  actor_person_profile_id uuid;
  current_user_id uuid := (select auth.uid());
BEGIN
  actor_membership_id := public.get_active_membership_id(NEW.id);
  actor_person_profile_id := public.get_own_person_profile_id(NEW.id);

  INSERT INTO public.time_audit_events (
    organization_id,
    event_type,
    result,
    actor_user_id,
    actor_membership_id,
    actor_person_profile_id,
    metadata
  )
  VALUES (
    NEW.id,
    'time_settings_updated',
    'allowed',
    current_user_id,
    actor_membership_id,
    actor_person_profile_id,
    jsonb_build_object(
      'schemaVersion',
      1,
      'setting',
      'correctionApprovalRequired',
      'previousCorrectionApprovalRequired',
      COALESCE(
        CASE
          WHEN jsonb_typeof(OLD.time_tracking_config -> 'correctionApprovalRequired') = 'boolean'
            THEN (OLD.time_tracking_config ->> 'correctionApprovalRequired')::boolean
          ELSE false
        END,
        false
      ),
      'nextCorrectionApprovalRequired',
      COALESCE(
        CASE
          WHEN jsonb_typeof(NEW.time_tracking_config -> 'correctionApprovalRequired') = 'boolean'
            THEN (NEW.time_tracking_config ->> 'correctionApprovalRequired')::boolean
          ELSE false
        END,
        false
      )
    )
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_organization_time_tracking_config(
  target_organization_id uuid,
  target_time_tracking_config jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  previous_time_tracking_config jsonb;
BEGIN
  IF target_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization is required';
  END IF;

  IF target_time_tracking_config IS NULL
    OR jsonb_typeof(target_time_tracking_config) <> 'object' THEN
    RAISE EXCEPTION 'time tracking config must be a JSON object';
  END IF;

  IF NOT public.can_manage_time_tracking(target_organization_id) THEN
    RAISE EXCEPTION 'time tracking manager role is required to update time tracking config';
  END IF;

  SELECT organization.time_tracking_config
  INTO previous_time_tracking_config
  FROM public.organizations organization
  WHERE organization.id = target_organization_id
  FOR UPDATE;

  IF previous_time_tracking_config IS NULL THEN
    RAISE EXCEPTION 'organization was not found';
  END IF;

  IF previous_time_tracking_config IS NOT DISTINCT FROM target_time_tracking_config THEN
    RETURN;
  END IF;

  UPDATE public.organizations
  SET time_tracking_config = target_time_tracking_config
  WHERE id = target_organization_id;
END;
$$;

DROP TRIGGER IF EXISTS organizations_audit_time_tracking_config_update
  ON public.organizations;

CREATE TRIGGER organizations_audit_time_tracking_config_update
  AFTER UPDATE OF time_tracking_config ON public.organizations
  FOR EACH ROW
  WHEN (OLD.time_tracking_config IS DISTINCT FROM NEW.time_tracking_config)
  EXECUTE FUNCTION public.audit_organization_time_tracking_config_update();

REVOKE ALL ON FUNCTION public.validate_organization_time_tracking_config_update()
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.audit_organization_time_tracking_config_update()
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_organization_time_tracking_config(uuid, jsonb)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_organization_time_tracking_config(uuid, jsonb)
  TO authenticated;
