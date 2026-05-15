-- BoxOps - Prevent impossible coach assignment overlaps.
--
-- The application can still surface availability hints, but the durable rule
-- lives in Postgres: a coach cannot be assigned to two active blocks whose
-- date and time ranges overlap inside the same organization.

CREATE INDEX IF NOT EXISTS schedule_block_assignments_assigned_coach_idx
  ON public.schedule_block_assignments (
    organization_id,
    coach_profile_id,
    schedule_block_id
  )
  WHERE assignment_status = 'assigned';

CREATE INDEX IF NOT EXISTS schedule_blocks_active_date_time_idx
  ON public.schedule_blocks (
    organization_id,
    service_date,
    start_time,
    end_time,
    id
  )
  WHERE status NOT IN ('cancelled', 'completed');

CREATE OR REPLACE FUNCTION public.schedule_block_accepts_active_assignment(
  target_status text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT target_status NOT IN ('cancelled', 'completed');
$$;

CREATE OR REPLACE FUNCTION public.lock_schedule_coach_assignment_window(
  target_organization_id uuid,
  target_coach_profile_id uuid,
  target_service_date date
)
RETURNS void
LANGUAGE sql
VOLATILE
SET search_path = public
AS $$
  SELECT pg_advisory_xact_lock(
    hashtext(target_organization_id::text),
    hashtext(target_coach_profile_id::text || ':' || target_service_date::text)
  );
$$;

CREATE OR REPLACE FUNCTION public.prevent_schedule_assignment_overlap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  conflicting_assignment record;
  target_block record;
BEGIN
  IF NEW.assignment_status <> 'assigned' THEN
    RETURN NEW;
  END IF;

  SELECT
    block.id,
    block.organization_id,
    block.service_date,
    block.start_time,
    block.end_time,
    block.status
  INTO target_block
  FROM public.schedule_blocks block
  WHERE block.id = NEW.schedule_block_id
    AND block.organization_id = NEW.organization_id
  FOR SHARE;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF NOT public.schedule_block_accepts_active_assignment(target_block.status) THEN
    RETURN NEW;
  END IF;

  PERFORM public.lock_schedule_coach_assignment_window(
    NEW.organization_id,
    NEW.coach_profile_id,
    target_block.service_date
  );

  SELECT
    assignment.id,
    assignment.schedule_block_id,
    block.service_date,
    block.start_time,
    block.end_time
  INTO conflicting_assignment
  FROM public.schedule_block_assignments assignment
  INNER JOIN public.schedule_blocks block
    ON block.id = assignment.schedule_block_id
   AND block.organization_id = assignment.organization_id
  WHERE assignment.organization_id = NEW.organization_id
    AND assignment.coach_profile_id = NEW.coach_profile_id
    AND assignment.assignment_status = 'assigned'
    AND assignment.id <> COALESCE(
      NEW.id,
      '00000000-0000-0000-0000-000000000000'::uuid
    )
    AND public.schedule_block_accepts_active_assignment(block.status)
    AND block.service_date = target_block.service_date
    AND block.start_time < target_block.end_time
    AND target_block.start_time < block.end_time
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'coach-unavailable'
      USING
        ERRCODE = '23P01',
        DETAIL = format(
          'Coach %s is already assigned to block %s on %s from %s to %s.',
          NEW.coach_profile_id,
          conflicting_assignment.schedule_block_id,
          conflicting_assignment.service_date,
          conflicting_assignment.start_time,
          conflicting_assignment.end_time
        ),
        HINT = 'Remove the overlapping assignment or choose another coach.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_schedule_block_assignment_overlap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  assigned_coach_id uuid;
  conflicting_assignment record;
BEGIN
  IF TG_OP = 'UPDATE'
    AND NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id
    AND NEW.service_date IS NOT DISTINCT FROM OLD.service_date
    AND NEW.start_time IS NOT DISTINCT FROM OLD.start_time
    AND NEW.end_time IS NOT DISTINCT FROM OLD.end_time
    AND NEW.status IS NOT DISTINCT FROM OLD.status
  THEN
    RETURN NEW;
  END IF;

  IF NOT public.schedule_block_accepts_active_assignment(NEW.status) THEN
    RETURN NEW;
  END IF;

  FOR assigned_coach_id IN
    SELECT DISTINCT assignment.coach_profile_id
    FROM public.schedule_block_assignments assignment
    WHERE assignment.organization_id = NEW.organization_id
      AND assignment.schedule_block_id = NEW.id
      AND assignment.assignment_status = 'assigned'
    ORDER BY assignment.coach_profile_id
  LOOP
    PERFORM public.lock_schedule_coach_assignment_window(
      NEW.organization_id,
      assigned_coach_id,
      NEW.service_date
    );

    SELECT
      assignment.id,
      assignment.schedule_block_id,
      block.service_date,
      block.start_time,
      block.end_time
    INTO conflicting_assignment
    FROM public.schedule_block_assignments assignment
    INNER JOIN public.schedule_blocks block
      ON block.id = assignment.schedule_block_id
     AND block.organization_id = assignment.organization_id
    WHERE assignment.organization_id = NEW.organization_id
      AND assignment.coach_profile_id = assigned_coach_id
      AND assignment.assignment_status = 'assigned'
      AND assignment.schedule_block_id <> NEW.id
      AND public.schedule_block_accepts_active_assignment(block.status)
      AND block.service_date = NEW.service_date
      AND block.start_time < NEW.end_time
      AND NEW.start_time < block.end_time
    LIMIT 1;

    IF FOUND THEN
      RAISE EXCEPTION 'coach-unavailable'
        USING
          ERRCODE = '23P01',
          DETAIL = format(
            'Coach %s is already assigned to block %s on %s from %s to %s.',
            assigned_coach_id,
            conflicting_assignment.schedule_block_id,
            conflicting_assignment.service_date,
            conflicting_assignment.start_time,
            conflicting_assignment.end_time
          ),
          HINT = 'Move the block outside the overlapping assignment or remove the coach first.';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS schedule_block_assignments_prevent_overlap
  ON public.schedule_block_assignments;

CREATE TRIGGER schedule_block_assignments_prevent_overlap
  BEFORE INSERT OR UPDATE OF
    assignment_status,
    coach_profile_id,
    organization_id,
    schedule_block_id
  ON public.schedule_block_assignments
  FOR EACH ROW EXECUTE FUNCTION public.prevent_schedule_assignment_overlap();

DROP TRIGGER IF EXISTS schedule_blocks_prevent_assignment_overlap
  ON public.schedule_blocks;

CREATE TRIGGER schedule_blocks_prevent_assignment_overlap
  BEFORE UPDATE OF
    end_time,
    organization_id,
    service_date,
    start_time,
    status
  ON public.schedule_blocks
  FOR EACH ROW EXECUTE FUNCTION public.prevent_schedule_block_assignment_overlap();

REVOKE ALL ON FUNCTION public.prevent_schedule_assignment_overlap() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prevent_schedule_block_assignment_overlap() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lock_schedule_coach_assignment_window(uuid, uuid, date) FROM PUBLIC;
