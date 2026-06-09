-- BoxOps - Allow controlled deletion of planned staff work windows.
--
-- Deactivation keeps a row as inactive planning history. Deletion is a
-- destructive cleanup action for incorrectly created planning windows, including
-- bulk deletion from /app/work-windows. The audit event is recorded by the app
-- before the row is deleted because the audit RPC validates that the entity
-- exists in the tenant at recording time.

DROP POLICY IF EXISTS "Operators can delete staff work windows"
  ON public.staff_work_windows;

CREATE POLICY "Operators can delete staff work windows"
  ON public.staff_work_windows FOR DELETE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner', 'admin', 'manager']));

GRANT DELETE ON public.staff_work_windows TO authenticated;

CREATE OR REPLACE FUNCTION public.operational_audit_entity_action_is_allowed(
  target_entity_type text,
  target_action text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE lower(btrim(COALESCE(target_entity_type, '')))
    WHEN 'centers' THEN
      lower(btrim(COALESCE(target_action, ''))) IN ('created', 'updated', 'reactivated', 'deactivated')
    WHEN 'class_types' THEN
      lower(btrim(COALESCE(target_action, ''))) IN ('created', 'updated', 'reactivated', 'deactivated')
    WHEN 'team_invitations' THEN
      lower(btrim(COALESCE(target_action, ''))) IN ('created', 'resent', 'cancelled', 'accepted')
    WHEN 'organization_memberships' THEN
      lower(btrim(COALESCE(target_action, ''))) IN ('created', 'updated')
    WHEN 'person_profiles' THEN
      lower(btrim(COALESCE(target_action, ''))) IN ('created', 'updated', 'linked_account')
    WHEN 'coach_profiles' THEN
      lower(btrim(COALESCE(target_action, ''))) IN ('created', 'updated', 'linked_account')
    WHEN 'schedule_blocks' THEN
      lower(btrim(COALESCE(target_action, ''))) IN ('created', 'updated', 'cancelled')
    WHEN 'schedule_block_assignments' THEN
      lower(btrim(COALESCE(target_action, ''))) IN ('assigned', 'removed', 'updated')
    WHEN 'schedule_templates' THEN
      lower(btrim(COALESCE(target_action, ''))) IN ('created', 'updated', 'archived', 'restored', 'applied_to_week')
    WHEN 'schedule_template_blocks' THEN
      lower(btrim(COALESCE(target_action, ''))) IN ('created', 'updated', 'removed')
    WHEN 'staff_work_windows' THEN
      lower(btrim(COALESCE(target_action, ''))) IN ('created', 'updated', 'deactivated', 'removed')
    WHEN 'operational_events' THEN
      lower(btrim(COALESCE(target_action, ''))) IN ('created', 'updated', 'cancelled', 'archived', 'reactivated')
    ELSE false
  END;
$$;

REVOKE EXECUTE ON FUNCTION public.operational_audit_entity_action_is_allowed(text, text) FROM PUBLIC;
