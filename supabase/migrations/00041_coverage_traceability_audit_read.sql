-- I.25 - Minimal read-only coverage traceability for recent operational changes.
-- This does not mutate schedule, time tracking, absences, or change requests.

CREATE OR REPLACE FUNCTION public.can_read_coverage_trace_events(
  target_organization_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_org_role(target_organization_id, ARRAY['owner', 'admin', 'manager']);
$$;

CREATE OR REPLACE FUNCTION public.list_coverage_trace_audit_events(
  target_organization_id uuid,
  target_schedule_block_ids uuid[] DEFAULT NULL,
  target_limit integer DEFAULT 100
)
RETURNS SETOF public.operational_audit_events
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  bounded_limit integer := LEAST(GREATEST(COALESCE(target_limit, 100), 1), 200);
  normalized_block_ids uuid[] := COALESCE(target_schedule_block_ids, ARRAY[]::uuid[]);
BEGIN
  IF NOT public.can_read_coverage_trace_events(target_organization_id) THEN
    RAISE EXCEPTION 'coverage trace read permission required';
  END IF;

  RETURN QUERY
  SELECT event_record.*
  FROM public.operational_audit_events event_record
  WHERE event_record.organization_id = target_organization_id
    AND event_record.retain_until > now()
    AND event_record.entity_type IN (
      'schedule_blocks',
      'schedule_block_assignments',
      'schedule_template_blocks'
    )
    AND (
      cardinality(normalized_block_ids) = 0
      OR (
        event_record.entity_type = 'schedule_blocks'
        AND event_record.entity_id = ANY(normalized_block_ids)
      )
      OR (
        event_record.entity_type = 'schedule_block_assignments'
        AND EXISTS (
          SELECT 1
          FROM public.schedule_block_assignments assignment
          WHERE assignment.organization_id = target_organization_id
            AND assignment.id = event_record.entity_id
            AND assignment.schedule_block_id = ANY(normalized_block_ids)
        )
      )
      OR (
        event_record.entity_type = 'schedule_template_blocks'
        AND EXISTS (
          SELECT 1
          FROM public.schedule_blocks block
          WHERE block.organization_id = target_organization_id
            AND block.id = ANY(normalized_block_ids)
            AND block.template_block_id = event_record.entity_id
        )
      )
    )
  ORDER BY event_record.created_at DESC, event_record.id DESC
  LIMIT bounded_limit;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.can_read_coverage_trace_events(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.list_coverage_trace_audit_events(uuid, uuid[], integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.can_read_coverage_trace_events(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_coverage_trace_audit_events(uuid, uuid[], integer) TO authenticated;
