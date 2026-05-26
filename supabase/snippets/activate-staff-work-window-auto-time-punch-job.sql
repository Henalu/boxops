-- BoxOps - activate staff work window automatic time punch scheduler
--
-- Run manually in the target Supabase database with an operator/DB owner role.
-- Do not call this from app code, a Server Action or UI.
--
-- The cron runs every minute. The function itself only inserts punches whose
-- planned staff work window time is already due. Generated punches keep
-- source = schedule_auto and presenceVerified = false.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM cron.job
    WHERE jobname = 'boxops-staff-work-window-auto-punches'
  ) THEN
    PERFORM cron.unschedule('boxops-staff-work-window-auto-punches');
  END IF;

  PERFORM cron.schedule(
    'boxops-staff-work-window-auto-punches',
    '* * * * *',
    $job$
      SELECT public.generate_due_staff_work_window_auto_time_punches(now());
    $job$
  );
END;
$$;
