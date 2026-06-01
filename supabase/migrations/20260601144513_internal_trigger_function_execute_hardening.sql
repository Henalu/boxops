-- BoxOps - internal trigger function execute hardening.
--
-- These SECURITY DEFINER functions are trigger entrypoints, not application
-- RPC endpoints. Keep the triggers usable while removing direct execution from
-- signed-in API callers.

REVOKE EXECUTE ON FUNCTION public.audit_organization_time_tracking_config_update()
  FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_person_profile_update_permissions()
  FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_schedule_assignment_overlap()
  FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_schedule_block_assignment_overlap()
  FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.record_time_audit_event_from_trigger()
  FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_center_time_location_setting_row()
  FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_document_access_grant_row()
  FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_document_programming_link_row()
  FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_document_row()
  FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_document_version_row()
  FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_organization_time_tracking_config_update()
  FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_time_export_row()
  FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_time_location_event_row()
  FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_time_punch_row()
  FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_time_record_correction_row()
  FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_time_record_row()
  FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_time_weekly_approval_row()
  FROM authenticated;
