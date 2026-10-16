-- Apply one week in a single transaction, including replacement and assignments.
-- Invoker rights preserve tenant RLS; existing constraints and triggers stay active.
CREATE OR REPLACE FUNCTION public.apply_schedule_template_week(
  target_organization_id uuid,
  target_template_id uuid,
  target_week_start date,
  target_replace_existing boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  selected_template public.schedule_templates;
  replacement_ids uuid[];
  inserted_ids uuid[];
  inserted_count integer := 0;
  replaced_count integer := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.has_org_role(target_organization_id, ARRAY['owner', 'admin', 'manager'])
    OR public.has_active_platform_support_session(target_organization_id)
  ) THEN
    RAISE EXCEPTION 'permission-denied' USING ERRCODE = '42501';
  END IF;

  IF target_organization_id IS NULL OR target_template_id IS NULL
    OR target_week_start IS NULL
    OR extract(isodow FROM target_week_start) <> 1 THEN
    RAISE EXCEPTION 'invalid-template-week' USING ERRCODE = '22023';
  END IF;

  -- Serialize applications/replacements for this tenant and week. The template
  -- row lock also coordinates with confirmed ChatGPT template applications.
  PERFORM pg_advisory_xact_lock(
    hashtext('schedule-template-week:' || target_organization_id::text),
    hashtext(target_week_start::text)
  );

  SELECT template.* INTO selected_template
  FROM public.schedule_templates template
  WHERE template.id = target_template_id
    AND template.organization_id = target_organization_id
  FOR UPDATE;

  IF NOT FOUND OR selected_template.template_type <> 'weekly' THEN
    RETURN jsonb_build_object('status', 'invalid-template', 'insertedBlockCount', 0, 'replacedBlockCount', 0);
  END IF;
  IF selected_template.status <> 'active' THEN
    RETURN jsonb_build_object('status', 'template-not-active', 'insertedBlockCount', 0, 'replacedBlockCount', 0);
  END IF;

  PERFORM template_block.id
  FROM public.schedule_template_blocks template_block
  WHERE template_block.organization_id = target_organization_id
    AND template_block.template_id = target_template_id
  ORDER BY template_block.id
  FOR SHARE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'template-empty', 'insertedBlockCount', 0, 'replacedBlockCount', 0);
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.schedule_template_blocks template_block
    LEFT JOIN public.coach_profiles coach
      ON coach.id = template_block.default_coach_profile_id
      AND coach.organization_id = target_organization_id
    LEFT JOIN public.person_profiles person
      ON person.id = coach.person_profile_id
      AND person.organization_id = target_organization_id
    WHERE template_block.organization_id = target_organization_id
      AND template_block.template_id = target_template_id
      AND template_block.required_coaches > 0
      AND template_block.default_coach_profile_id IS NOT NULL
      AND (
        coach.id IS NULL OR coach.status <> 'active'
        OR (coach.user_id IS NULL AND coach.person_profile_id IS NULL)
        OR (coach.person_profile_id IS NOT NULL AND (
          person.id IS NULL OR person.status <> 'active' OR person.visibility_status <> 'visible'
        ))
        OR (coach.user_id IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM public.organization_memberships membership
          WHERE membership.organization_id = target_organization_id
            AND membership.user_id = coach.user_id AND membership.status = 'active'
        ))
      )
  ) THEN
    RETURN jsonb_build_object('status', 'invalid-coach', 'insertedBlockCount', 0, 'replacedBlockCount', 0);
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.schedule_template_blocks template_block
    JOIN public.class_types class_type
      ON class_type.id = template_block.class_type_id
      AND class_type.organization_id = target_organization_id
    WHERE template_block.organization_id = target_organization_id
      AND template_block.template_id = target_template_id
      AND template_block.required_coaches > 0
      AND template_block.default_coach_profile_id IS NOT NULL
      AND class_type.certification_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.coach_certifications certification
        WHERE certification.organization_id = target_organization_id
          AND certification.coach_profile_id = template_block.default_coach_profile_id
          AND certification.certification_id = class_type.certification_id
          AND certification.status = 'active'
      )
  ) THEN
    RETURN jsonb_build_object('status', 'coach-missing-certification', 'insertedBlockCount', 0, 'replacedBlockCount', 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.schedule_template_blocks template_block
    WHERE template_block.organization_id = target_organization_id
      AND template_block.template_id = target_template_id
      AND (selected_template.valid_from IS NULL OR
        target_week_start + template_block.day_of_week - 1 >= selected_template.valid_from)
      AND (selected_template.valid_until IS NULL OR
        target_week_start + template_block.day_of_week - 1 <= selected_template.valid_until)
  ) THEN
    RETURN jsonb_build_object('status', 'template-out-of-range', 'insertedBlockCount', 0, 'replacedBlockCount', 0);
  END IF;

  SELECT coalesce(array_agg(block.id), ARRAY[]::uuid[]) INTO replacement_ids
  FROM public.schedule_blocks block
  WHERE block.organization_id = target_organization_id
    AND block.service_date BETWEEN target_week_start AND target_week_start + 6
    AND block.template_id <> target_template_id
    AND block.status <> 'cancelled'
    AND (selected_template.center_id IS NULL OR block.center_id = selected_template.center_id);

  IF cardinality(replacement_ids) > 0 AND NOT coalesce(target_replace_existing, false) THEN
    RETURN jsonb_build_object('status', 'template-week-has-template', 'insertedBlockCount', 0, 'replacedBlockCount', 0);
  END IF;

  DELETE FROM public.schedule_blocks block
  WHERE block.organization_id = target_organization_id
    AND block.id = ANY(replacement_ids);
  GET DIAGNOSTICS replaced_count = ROW_COUNT;

  IF replaced_count <> cardinality(replacement_ids) THEN
    RAISE EXCEPTION 'template-replacement-denied' USING ERRCODE = '42501';
  END IF;

  WITH inserted AS (
    INSERT INTO public.schedule_blocks (
      organization_id, center_id, template_id, template_block_id, service_date,
      start_time, end_time, class_type_id, required_coaches, status, notes, is_template_exception
    )
    SELECT target_organization_id, template_block.center_id, target_template_id,
      template_block.id, target_week_start + template_block.day_of_week - 1,
      template_block.start_time, template_block.end_time, template_block.class_type_id,
      template_block.required_coaches, 'scheduled', template_block.notes, false
    FROM public.schedule_template_blocks template_block
    WHERE template_block.organization_id = target_organization_id
      AND template_block.template_id = target_template_id
      AND (selected_template.valid_from IS NULL OR
        target_week_start + template_block.day_of_week - 1 >= selected_template.valid_from)
      AND (selected_template.valid_until IS NULL OR
        target_week_start + template_block.day_of_week - 1 <= selected_template.valid_until)
      AND NOT EXISTS (
        SELECT 1 FROM public.schedule_blocks existing
        WHERE existing.organization_id = target_organization_id
          AND existing.template_id = target_template_id
          AND existing.template_block_id = template_block.id
          AND existing.service_date = target_week_start + template_block.day_of_week - 1
          AND existing.status <> 'cancelled'
      )
    ORDER BY template_block.day_of_week, template_block.start_time, template_block.id
    RETURNING id
  )
  SELECT coalesce(array_agg(id), ARRAY[]::uuid[]) INTO inserted_ids FROM inserted;
  inserted_count := cardinality(inserted_ids);

  INSERT INTO public.schedule_block_assignments (
    organization_id, schedule_block_id, coach_profile_id, assignment_status, source
  )
  SELECT target_organization_id, block.id, template_block.default_coach_profile_id, 'assigned', 'template'
  FROM public.schedule_blocks block
  JOIN public.schedule_template_blocks template_block
    ON template_block.id = block.template_block_id
    AND template_block.organization_id = target_organization_id
    AND template_block.template_id = target_template_id
  WHERE block.organization_id = target_organization_id AND block.id = ANY(inserted_ids)
    AND template_block.required_coaches > 0 AND template_block.default_coach_profile_id IS NOT NULL
  ORDER BY template_block.default_coach_profile_id, block.service_date, block.start_time, block.id;

  RETURN jsonb_build_object(
    'status', CASE WHEN inserted_count = 0 THEN 'already-applied' ELSE 'applied' END,
    'insertedBlockCount', inserted_count, 'replacedBlockCount', replaced_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_schedule_template_week(uuid, uuid, date, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_schedule_template_week(uuid, uuid, date, boolean) TO authenticated;
