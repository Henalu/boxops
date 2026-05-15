-- Keep class/activity type edits and derived schedule defaults in one transaction.
-- Display data such as name, category, color and status remains referenced by
-- class_type_id. The copied default that must be synchronized is required_coaches.

CREATE OR REPLACE FUNCTION public.update_class_type_and_sync_defaults(
  target_organization_id uuid,
  target_class_type_id uuid,
  target_name text,
  target_slug text,
  target_category text,
  target_required_coaches integer,
  target_requires_certification boolean,
  target_color text,
  target_status text,
  target_effective_from date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  previous_required_coaches integer;
  schedule_blocks_updated integer := 0;
  template_blocks_updated integer := 0;
  effective_from date := COALESCE(target_effective_from, CURRENT_DATE);
BEGIN
  IF NOT public.has_org_role(target_organization_id, ARRAY['owner', 'admin', 'manager']) THEN
    RAISE EXCEPTION 'forbidden'
      USING ERRCODE = '42501';
  END IF;

  IF target_name IS NULL OR btrim(target_name) = '' THEN
    RAISE EXCEPTION 'invalid_name'
      USING ERRCODE = '22023';
  END IF;

  IF target_slug IS NULL OR target_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' THEN
    RAISE EXCEPTION 'invalid_slug'
      USING ERRCODE = '22023';
  END IF;

  IF target_category NOT IN ('class', 'staffing', 'event', 'competition', 'holiday', 'other') THEN
    RAISE EXCEPTION 'invalid_category'
      USING ERRCODE = '22023';
  END IF;

  IF target_required_coaches IS NULL OR target_required_coaches < 0 OR target_required_coaches > 20 THEN
    RAISE EXCEPTION 'invalid_required_coaches'
      USING ERRCODE = '22023';
  END IF;

  IF target_status NOT IN ('active', 'inactive') THEN
    RAISE EXCEPTION 'invalid_status'
      USING ERRCODE = '22023';
  END IF;

  IF target_color IS NOT NULL AND target_color !~ '^#[0-9a-fA-F]{6}$' THEN
    RAISE EXCEPTION 'invalid_color'
      USING ERRCODE = '22023';
  END IF;

  SELECT class_type.required_coaches
  INTO previous_required_coaches
  FROM public.class_types class_type
  WHERE class_type.id = target_class_type_id
    AND class_type.organization_id = target_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'class_type_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.class_types
  SET
    name = btrim(target_name),
    slug = target_slug,
    category = target_category,
    required_coaches = target_required_coaches,
    requires_certification = COALESCE(target_requires_certification, false),
    color = lower(target_color),
    status = target_status
  WHERE id = target_class_type_id
    AND organization_id = target_organization_id;

  IF previous_required_coaches IS DISTINCT FROM target_required_coaches THEN
    UPDATE public.schedule_template_blocks template_block
    SET required_coaches = target_required_coaches
    WHERE template_block.organization_id = target_organization_id
      AND template_block.class_type_id = target_class_type_id
      AND template_block.required_coaches = previous_required_coaches;

    GET DIAGNOSTICS template_blocks_updated = ROW_COUNT;

    UPDATE public.schedule_blocks schedule_block
    SET required_coaches = target_required_coaches
    WHERE schedule_block.organization_id = target_organization_id
      AND schedule_block.class_type_id = target_class_type_id
      AND schedule_block.service_date >= effective_from
      AND schedule_block.status NOT IN ('cancelled', 'completed')
      AND schedule_block.required_coaches = previous_required_coaches;

    GET DIAGNOSTICS schedule_blocks_updated = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'classTypeId', target_class_type_id,
    'effectiveFrom', effective_from,
    'previousRequiredCoaches', previous_required_coaches,
    'requiredCoaches', target_required_coaches,
    'scheduleBlocksUpdated', schedule_blocks_updated,
    'templateBlocksUpdated', template_blocks_updated
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_class_type_and_sync_defaults(
  uuid,
  uuid,
  text,
  text,
  text,
  integer,
  boolean,
  text,
  text,
  date
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.update_class_type_and_sync_defaults(
  uuid,
  uuid,
  text,
  text,
  text,
  integer,
  boolean,
  text,
  text,
  date
) TO authenticated;
