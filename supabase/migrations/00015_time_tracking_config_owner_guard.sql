-- BoxOps - Fase F.8 owner-only guard for time tracking configuration
-- Existing organization RLS lets owner/admin update tenant settings. This trigger
-- keeps the time correction approval policy owner-only at the database layer.

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
    AND NOT public.has_org_role(NEW.id, ARRAY['owner']) THEN
    RAISE EXCEPTION 'owner role is required to update time tracking config';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS organizations_validate_time_tracking_config_update
  ON public.organizations;

CREATE TRIGGER organizations_validate_time_tracking_config_update
  BEFORE UPDATE OF time_tracking_config ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_organization_time_tracking_config_update();
