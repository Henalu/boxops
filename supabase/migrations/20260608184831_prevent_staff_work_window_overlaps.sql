-- BoxOps - Prevent impossible staff work window overlaps.
--
-- Staff work windows are planning context, but one person cannot be planned in
-- two active overlapping windows for the same day and validity dates. Existing
-- legacy overlaps are not backfilled here; new inserts and relevant updates are
-- blocked, while changing a row to inactive remains possible for cleanup.

CREATE INDEX IF NOT EXISTS staff_work_windows_active_overlap_idx
  ON public.staff_work_windows (
    organization_id,
    person_profile_id,
    day_of_week,
    valid_from,
    valid_until,
    start_time,
    end_time
  )
  WHERE status = 'active';

CREATE OR REPLACE FUNCTION public.lock_staff_work_window_person_day(
  target_organization_id uuid,
  target_person_profile_id uuid,
  target_day_of_week smallint
)
RETURNS void
LANGUAGE sql
VOLATILE
SET search_path = public
AS $$
  SELECT pg_advisory_xact_lock(
    hashtext(target_organization_id::text),
    hashtext(target_person_profile_id::text || ':' || target_day_of_week::text)
  );
$$;

CREATE OR REPLACE FUNCTION public.prevent_staff_work_window_overlap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  conflicting_window record;
BEGIN
  IF NEW.status <> 'active' THEN
    RETURN NEW;
  END IF;

  PERFORM public.lock_staff_work_window_person_day(
    NEW.organization_id,
    NEW.person_profile_id,
    NEW.day_of_week
  );

  SELECT
    existing.id,
    existing.day_of_week,
    existing.start_time,
    existing.end_time,
    existing.valid_from,
    existing.valid_until
  INTO conflicting_window
  FROM public.staff_work_windows existing
  WHERE existing.organization_id = NEW.organization_id
    AND existing.person_profile_id = NEW.person_profile_id
    AND existing.day_of_week = NEW.day_of_week
    AND existing.status = 'active'
    AND existing.id <> COALESCE(
      NEW.id,
      '00000000-0000-0000-0000-000000000000'::uuid
    )
    AND existing.start_time < NEW.end_time
    AND NEW.start_time < existing.end_time
    AND existing.valid_from <= COALESCE(NEW.valid_until, 'infinity'::date)
    AND NEW.valid_from <= COALESCE(existing.valid_until, 'infinity'::date)
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'staff-work-window-overlap'
      USING
        ERRCODE = '23P01',
        DETAIL = format(
          'Person %s already has staff work window %s on day %s from %s to %s valid from %s to %s.',
          NEW.person_profile_id,
          conflicting_window.id,
          conflicting_window.day_of_week,
          conflicting_window.start_time,
          conflicting_window.end_time,
          conflicting_window.valid_from,
          COALESCE(conflicting_window.valid_until::text, 'open-ended')
        ),
        HINT = 'Deactivate or move the overlapping staff work window before saving another one.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS staff_work_windows_prevent_overlap
  ON public.staff_work_windows;

CREATE TRIGGER staff_work_windows_prevent_overlap
  BEFORE INSERT OR UPDATE OF
    day_of_week,
    end_time,
    organization_id,
    person_profile_id,
    start_time,
    status,
    valid_from,
    valid_until
  ON public.staff_work_windows
  FOR EACH ROW EXECUTE FUNCTION public.prevent_staff_work_window_overlap();

REVOKE ALL ON FUNCTION public.prevent_staff_work_window_overlap() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lock_staff_work_window_person_day(uuid, uuid, smallint) FROM PUBLIC;
