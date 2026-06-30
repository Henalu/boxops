-- BoxWod - schedule_blocks -> boxwod_class_sessions initial sync
--
-- The sync is source-driven and non-destructive:
-- - upserts athlete-facing snapshots by (organization_id, source_schedule_block_id);
-- - never deletes BoxWod sessions when BoxOps source rows disappear;
-- - does not write to BoxOps schedule_blocks;
-- - keeps operational notes out of the athlete-facing snapshot.

DO $$
BEGIN
  IF to_regclass('public.schedule_blocks') IS NULL THEN
    RAISE EXCEPTION 'BoxWod schedule sync requires public.schedule_blocks from BoxOps';
  END IF;

  IF to_regclass('public.boxwod_class_sessions') IS NULL THEN
    RAISE EXCEPTION 'BoxWod schedule sync requires public.boxwod_class_sessions';
  END IF;

  IF to_regclass('public.centers') IS NULL THEN
    RAISE EXCEPTION 'BoxWod schedule sync requires public.centers';
  END IF;

  IF to_regclass('public.class_types') IS NULL THEN
    RAISE EXCEPTION 'BoxWod schedule sync requires public.class_types';
  END IF;

  IF to_regprocedure('public.boxwod_can_manage(uuid)') IS NULL THEN
    RAISE EXCEPTION 'BoxWod schedule sync requires public.boxwod_can_manage(uuid)';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.boxwod_sync_class_sessions_from_schedule_blocks_internal(
  target_organization_id uuid,
  target_start_date date DEFAULT NULL,
  target_end_date date DEFAULT NULL
)
RETURNS TABLE (
  synced_organization_id uuid,
  source_rows integer,
  upserted_rows integer,
  inserted_rows integer,
  updated_rows integer,
  manual_review_rows integer,
  skipped_rows integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF target_organization_id IS NULL THEN
    RAISE EXCEPTION 'target_organization_id is required'
      USING ERRCODE = '22004';
  END IF;

  IF target_start_date IS NOT NULL
    AND target_end_date IS NOT NULL
    AND target_start_date > target_end_date
  THEN
    RAISE EXCEPTION 'target_start_date must be before or equal to target_end_date'
      USING ERRCODE = '22007';
  END IF;

  RETURN QUERY
  WITH source_base AS (
    SELECT
      schedule_block.organization_id,
      schedule_block.id AS source_schedule_block_id,
      schedule_block.center_id,
      center.name AS center_name,
      center.status AS center_status,
      schedule_block.class_type_id,
      class_type.name AS class_name,
      class_type.category AS class_category,
      class_type.color AS class_color,
      class_type.status AS class_type_status,
      schedule_block.service_date,
      schedule_block.start_time,
      schedule_block.end_time,
      schedule_block.status::text AS source_status,
      schedule_block.updated_at AS source_updated_at,
      schedule_block.required_coaches,
      schedule_block.is_template_exception,
      coalesce(schedule_block.metadata, '{}'::jsonb) AS source_metadata,
      CASE
        WHEN jsonb_typeof(coalesce(schedule_block.metadata, '{}'::jsonb) -> 'boxwod_capacity') = 'number'
          THEN coalesce(schedule_block.metadata, '{}'::jsonb) ->> 'boxwod_capacity'
        WHEN (coalesce(schedule_block.metadata, '{}'::jsonb) ->> 'boxwod_capacity') ~ '^\d+(?:\.\d+)?$'
          THEN coalesce(schedule_block.metadata, '{}'::jsonb) ->> 'boxwod_capacity'
        WHEN jsonb_typeof(coalesce(schedule_block.metadata, '{}'::jsonb) -> 'capacity') = 'number'
          THEN coalesce(schedule_block.metadata, '{}'::jsonb) ->> 'capacity'
        WHEN (coalesce(schedule_block.metadata, '{}'::jsonb) ->> 'capacity') ~ '^\d+(?:\.\d+)?$'
          THEN coalesce(schedule_block.metadata, '{}'::jsonb) ->> 'capacity'
        ELSE NULL
      END AS capacity_text
    FROM public.schedule_blocks schedule_block
    LEFT JOIN public.centers center
      ON center.id = schedule_block.center_id
     AND center.organization_id = schedule_block.organization_id
    LEFT JOIN public.class_types class_type
      ON class_type.id = schedule_block.class_type_id
     AND class_type.organization_id = schedule_block.organization_id
    WHERE schedule_block.organization_id = target_organization_id
      AND (target_start_date IS NULL OR schedule_block.service_date >= target_start_date)
      AND (target_end_date IS NULL OR schedule_block.service_date <= target_end_date)
  ),
  source_normalized AS (
    SELECT
      source_base.*,
      CASE
        WHEN source_base.capacity_text ~ '^\d+(?:\.\d+)?$'
          AND source_base.capacity_text::numeric >= 0
          AND source_base.capacity_text::numeric <= 2147483647
          THEN floor(source_base.capacity_text::numeric)::integer
        ELSE NULL
      END AS source_capacity,
      CASE
        WHEN jsonb_typeof(source_base.source_metadata -> 'boxwod_reservation_policy') = 'object'
          THEN source_base.source_metadata -> 'boxwod_reservation_policy'
        ELSE '{}'::jsonb
      END AS source_reservation_policy
    FROM source_base
  ),
  source_with_review AS (
    SELECT
      source_normalized.*,
      array_remove(ARRAY[
        CASE WHEN source_normalized.center_id IS NULL OR source_normalized.center_name IS NULL
          THEN 'missing_center' END,
        CASE WHEN source_normalized.class_type_id IS NULL OR source_normalized.class_name IS NULL
          THEN 'missing_class_type' END,
        CASE WHEN source_normalized.start_time >= source_normalized.end_time
          THEN 'invalid_time_range' END,
        CASE WHEN source_normalized.center_status IS DISTINCT FROM 'active'
          THEN 'inactive_center' END,
        CASE WHEN source_normalized.class_type_status IS DISTINCT FROM 'active'
          THEN 'inactive_class_type' END,
        CASE WHEN source_normalized.source_capacity IS NULL
          THEN 'missing_capacity' END,
        CASE WHEN source_normalized.source_status = 'uncovered'
          THEN 'source_uncovered' END,
        CASE WHEN source_normalized.source_status NOT IN (
          'scheduled',
          'uncovered',
          'changed',
          'cancelled',
          'completed'
        )
          THEN 'unknown_source_status' END
      ], NULL) AS sync_warnings,
      (
        source_normalized.center_id IS NOT NULL
        AND source_normalized.center_name IS NOT NULL
        AND length(btrim(source_normalized.center_name)) > 0
        AND source_normalized.class_type_id IS NOT NULL
        AND source_normalized.class_name IS NOT NULL
        AND length(btrim(source_normalized.class_name)) > 0
        AND source_normalized.start_time < source_normalized.end_time
      ) AS is_insertable
    FROM source_normalized
  ),
  sync_source AS (
    SELECT
      source_with_review.organization_id,
      source_with_review.source_schedule_block_id,
      source_with_review.center_id,
      source_with_review.center_name,
      source_with_review.class_type_id,
      source_with_review.class_name,
      source_with_review.class_category,
      source_with_review.class_color,
      source_with_review.service_date,
      source_with_review.start_time,
      source_with_review.end_time,
      coalesce(source_with_review.source_capacity, 0) AS capacity,
      CASE
        WHEN source_with_review.source_status = 'cancelled' THEN 'cancelled'
        WHEN source_with_review.source_status = 'completed' THEN 'closed'
        WHEN source_with_review.source_status IN ('scheduled', 'changed')
          AND source_with_review.source_capacity IS NOT NULL
          AND source_with_review.center_status = 'active'
          AND source_with_review.class_type_status = 'active'
          THEN 'available'
        ELSE 'closed'
      END AS status,
      source_with_review.source_status,
      source_with_review.source_updated_at,
      CASE
        WHEN cardinality(source_with_review.sync_warnings) > 0 THEN 'manual_review'
        ELSE 'synced'
      END AS sync_status,
      source_with_review.source_reservation_policy AS reservation_policy,
      jsonb_build_object(
        'source_schedule_block',
        jsonb_strip_nulls(jsonb_build_object(
          'status', source_with_review.source_status,
          'updated_at', source_with_review.source_updated_at,
          'required_coaches', source_with_review.required_coaches,
          'is_template_exception', source_with_review.is_template_exception,
          'capacity_source', CASE
            WHEN source_with_review.source_capacity IS NULL THEN 'missing'
            ELSE 'schedule_blocks.metadata'
          END,
          'warnings', to_jsonb(source_with_review.sync_warnings)
        ))
      ) AS metadata
    FROM source_with_review
    WHERE source_with_review.is_insertable
  ),
  prior_sessions AS (
    SELECT class_session.source_schedule_block_id
    FROM public.boxwod_class_sessions class_session
    JOIN sync_source
      ON sync_source.organization_id = class_session.organization_id
     AND sync_source.source_schedule_block_id = class_session.source_schedule_block_id
  ),
  upserted_sessions AS (
    INSERT INTO public.boxwod_class_sessions (
      organization_id,
      source_schedule_block_id,
      center_id,
      center_name,
      class_type_id,
      class_name,
      class_category,
      class_color,
      coach_person_profile_id,
      coach_display_name,
      service_date,
      start_time,
      end_time,
      capacity,
      status,
      booking_opens_at,
      booking_closes_at,
      cancellation_deadline_at,
      source_status,
      source_updated_at,
      sync_status,
      reservation_policy,
      metadata
    )
    SELECT
      sync_source.organization_id,
      sync_source.source_schedule_block_id,
      sync_source.center_id,
      sync_source.center_name,
      sync_source.class_type_id,
      sync_source.class_name,
      sync_source.class_category,
      sync_source.class_color,
      NULL,
      NULL,
      sync_source.service_date,
      sync_source.start_time,
      sync_source.end_time,
      sync_source.capacity,
      sync_source.status,
      NULL,
      NULL,
      NULL,
      sync_source.source_status,
      sync_source.source_updated_at,
      sync_source.sync_status,
      sync_source.reservation_policy,
      sync_source.metadata
    FROM sync_source
    ON CONFLICT (organization_id, source_schedule_block_id)
    DO UPDATE SET
      center_id = EXCLUDED.center_id,
      center_name = EXCLUDED.center_name,
      class_type_id = EXCLUDED.class_type_id,
      class_name = EXCLUDED.class_name,
      class_category = EXCLUDED.class_category,
      class_color = EXCLUDED.class_color,
      coach_person_profile_id = EXCLUDED.coach_person_profile_id,
      coach_display_name = EXCLUDED.coach_display_name,
      service_date = EXCLUDED.service_date,
      start_time = EXCLUDED.start_time,
      end_time = EXCLUDED.end_time,
      capacity = CASE
        WHEN EXCLUDED.metadata #>> '{source_schedule_block,capacity_source}' = 'schedule_blocks.metadata'
          THEN EXCLUDED.capacity
        ELSE public.boxwod_class_sessions.capacity
      END,
      status = EXCLUDED.status,
      source_status = EXCLUDED.source_status,
      source_updated_at = EXCLUDED.source_updated_at,
      sync_status = EXCLUDED.sync_status,
      reservation_policy = CASE
        WHEN EXCLUDED.reservation_policy <> '{}'::jsonb
          THEN EXCLUDED.reservation_policy
        ELSE public.boxwod_class_sessions.reservation_policy
      END,
      metadata = coalesce(public.boxwod_class_sessions.metadata, '{}'::jsonb) || EXCLUDED.metadata
    WHERE
      public.boxwod_class_sessions.center_id IS DISTINCT FROM EXCLUDED.center_id
      OR public.boxwod_class_sessions.center_name IS DISTINCT FROM EXCLUDED.center_name
      OR public.boxwod_class_sessions.class_type_id IS DISTINCT FROM EXCLUDED.class_type_id
      OR public.boxwod_class_sessions.class_name IS DISTINCT FROM EXCLUDED.class_name
      OR public.boxwod_class_sessions.class_category IS DISTINCT FROM EXCLUDED.class_category
      OR public.boxwod_class_sessions.class_color IS DISTINCT FROM EXCLUDED.class_color
      OR public.boxwod_class_sessions.coach_person_profile_id IS DISTINCT FROM EXCLUDED.coach_person_profile_id
      OR public.boxwod_class_sessions.coach_display_name IS DISTINCT FROM EXCLUDED.coach_display_name
      OR public.boxwod_class_sessions.service_date IS DISTINCT FROM EXCLUDED.service_date
      OR public.boxwod_class_sessions.start_time IS DISTINCT FROM EXCLUDED.start_time
      OR public.boxwod_class_sessions.end_time IS DISTINCT FROM EXCLUDED.end_time
      OR (
        EXCLUDED.metadata #>> '{source_schedule_block,capacity_source}' = 'schedule_blocks.metadata'
        AND public.boxwod_class_sessions.capacity IS DISTINCT FROM EXCLUDED.capacity
      )
      OR public.boxwod_class_sessions.status IS DISTINCT FROM EXCLUDED.status
      OR public.boxwod_class_sessions.source_status IS DISTINCT FROM EXCLUDED.source_status
      OR public.boxwod_class_sessions.source_updated_at IS DISTINCT FROM EXCLUDED.source_updated_at
      OR public.boxwod_class_sessions.sync_status IS DISTINCT FROM EXCLUDED.sync_status
      OR (
        EXCLUDED.reservation_policy <> '{}'::jsonb
        AND public.boxwod_class_sessions.reservation_policy IS DISTINCT FROM EXCLUDED.reservation_policy
      )
      OR coalesce(public.boxwod_class_sessions.metadata -> 'source_schedule_block', '{}'::jsonb)
        IS DISTINCT FROM (EXCLUDED.metadata -> 'source_schedule_block')
    RETURNING public.boxwod_class_sessions.source_schedule_block_id
  )
  SELECT
    target_organization_id AS synced_organization_id,
    (SELECT count(*)::integer FROM source_with_review) AS source_rows,
    (SELECT count(*)::integer FROM upserted_sessions) AS upserted_rows,
    (
      SELECT count(*)::integer
      FROM upserted_sessions
      WHERE NOT EXISTS (
        SELECT 1
        FROM prior_sessions
        WHERE prior_sessions.source_schedule_block_id = upserted_sessions.source_schedule_block_id
      )
    ) AS inserted_rows,
    (
      SELECT count(*)::integer
      FROM upserted_sessions
      WHERE EXISTS (
        SELECT 1
        FROM prior_sessions
        WHERE prior_sessions.source_schedule_block_id = upserted_sessions.source_schedule_block_id
      )
    ) AS updated_rows,
    (
      SELECT count(*)::integer
      FROM sync_source
      WHERE sync_source.sync_status = 'manual_review'
    ) AS manual_review_rows,
    (
      SELECT count(*)::integer
      FROM source_with_review
      WHERE NOT source_with_review.is_insertable
    ) AS skipped_rows;
END;
$$;

CREATE OR REPLACE FUNCTION public.boxwod_sync_class_sessions_from_schedule_blocks(
  target_organization_id uuid,
  target_start_date date DEFAULT NULL,
  target_end_date date DEFAULT NULL
)
RETURNS TABLE (
  synced_organization_id uuid,
  source_rows integer,
  upserted_rows integer,
  inserted_rows integer,
  updated_rows integer,
  manual_review_rows integer,
  skipped_rows integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.boxwod_can_manage(target_organization_id) THEN
    RAISE EXCEPTION 'Only BoxWod managers can sync schedule blocks for this organization'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.boxwod_sync_class_sessions_from_schedule_blocks_internal(
    target_organization_id,
    target_start_date,
    target_end_date
  );
END;
$$;

REVOKE ALL ON FUNCTION public.boxwod_sync_class_sessions_from_schedule_blocks_internal(uuid, date, date)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.boxwod_sync_class_sessions_from_schedule_blocks(uuid, date, date)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.boxwod_sync_class_sessions_from_schedule_blocks(uuid, date, date)
  TO authenticated;

COMMENT ON FUNCTION public.boxwod_sync_class_sessions_from_schedule_blocks(uuid, date, date) IS
  'Syncs BoxOps schedule_blocks into BoxWod athlete-facing class session snapshots for one organization. Upserts only; never deletes source or destination rows.';
