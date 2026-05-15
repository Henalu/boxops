-- Allow the short operational audit to record confirmed template-block removal.
-- The event is recorded before the row is deleted because the audit RPC
-- validates that the target entity still exists inside the tenant.

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
    ELSE false
  END;
$$;

REVOKE EXECUTE ON FUNCTION public.operational_audit_entity_action_is_allowed(text, text) FROM PUBLIC;
