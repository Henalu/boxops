-- Repair existing correction punches that were attached to a record whose
-- local_work_date does not match the punch local date.
--
-- Scope is intentionally narrow:
-- - only punches created by correction flows;
-- - only when the destination record is open/reopened or can be created;
-- - schedule links are inherited from the destination record to avoid keeping
--   a block link from the original day.

DO $$
DECLARE
  mismatch record;
  destination_record public.time_records;
BEGIN
  FOR mismatch IN
    SELECT
      time_punch.id AS punch_id,
      time_punch.organization_id,
      time_punch.time_record_id AS previous_time_record_id,
      time_punch.person_profile_id,
      time_punch.punch_type,
      time_punch.occurred_at,
      time_punch.timezone,
      time_punch.center_id,
      time_punch.created_by_user_id,
      time_punch.created_by_membership_id,
      time_punch.notes,
      time_punch.metadata,
      time_record.local_work_date AS previous_work_date,
      (time_punch.occurred_at AT TIME ZONE time_punch.timezone)::date AS punch_work_date
    FROM public.time_punches time_punch
    JOIN public.time_records time_record
      ON time_record.id = time_punch.time_record_id
     AND time_record.organization_id = time_punch.organization_id
    WHERE time_punch.source = 'correction'
      AND time_punch.status = 'active'
      AND time_record.status IN ('open', 'reopened')
      AND (time_punch.occurred_at AT TIME ZONE time_punch.timezone)::date
        IS DISTINCT FROM time_record.local_work_date
  LOOP
    destination_record := NULL;

    SELECT time_record.*
    INTO destination_record
    FROM public.time_records time_record
    WHERE time_record.organization_id = mismatch.organization_id
      AND time_record.person_profile_id = mismatch.person_profile_id
      AND time_record.local_work_date = mismatch.punch_work_date
    FOR UPDATE;

    IF destination_record.id IS NULL THEN
      INSERT INTO public.time_records (
        organization_id,
        person_profile_id,
        local_work_date,
        timezone,
        center_id,
        status,
        created_by_user_id,
        created_by_membership_id,
        metadata
      )
      VALUES (
        mismatch.organization_id,
        mismatch.person_profile_id,
        mismatch.punch_work_date,
        mismatch.timezone,
        mismatch.center_id,
        'open',
        mismatch.created_by_user_id,
        mismatch.created_by_membership_id,
        jsonb_build_object(
          'createdByMigration', '00031_repair_correction_punch_record_dates',
          'previousTimeRecordId', mismatch.previous_time_record_id,
          'previousWorkDate', mismatch.previous_work_date
        )
      )
      RETURNING * INTO destination_record;
    END IF;

    IF destination_record.status IN ('open', 'reopened') THEN
      INSERT INTO public.time_punches (
        organization_id,
        time_record_id,
        person_profile_id,
        punch_type,
        occurred_at,
        timezone,
        center_id,
        schedule_block_id,
        schedule_block_assignment_id,
        source,
        status,
        created_by_user_id,
        created_by_membership_id,
        notes,
        metadata
      )
      VALUES (
        mismatch.organization_id,
        destination_record.id,
        mismatch.person_profile_id,
        mismatch.punch_type,
        mismatch.occurred_at,
        destination_record.timezone,
        COALESCE(mismatch.center_id, destination_record.center_id),
        destination_record.schedule_block_id,
        destination_record.schedule_block_assignment_id,
        'correction',
        'active',
        mismatch.created_by_user_id,
        mismatch.created_by_membership_id,
        mismatch.notes,
        COALESCE(mismatch.metadata, '{}'::jsonb) || jsonb_build_object(
          'realignedByMigration', '00031_repair_correction_punch_record_dates',
          'previousPunchId', mismatch.punch_id,
          'previousTimeRecordId', mismatch.previous_time_record_id,
          'previousWorkDate', mismatch.previous_work_date,
          'realignedAt', now()
        )
      );

      UPDATE public.time_punches
      SET
        status = 'superseded',
        metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
          'supersededByMigration', '00031_repair_correction_punch_record_dates',
          'realignedAt', now()
        )
      WHERE id = mismatch.punch_id
        AND organization_id = mismatch.organization_id;
    END IF;
  END LOOP;
END;
$$;
