-- BoxOps - activate F.12 weekly time close scheduler
--
-- Run manually in the target Supabase database with an operator/DB owner role.
-- Do not call this from app code, a Server Action or UI.
--
-- The cron runs every minute. The function itself only submits organizations
-- whose local organization time is Sunday 23:59, so tenants in different
-- timezones close at their own local boundary.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM cron.job
    WHERE jobname = 'boxops-time-weekly-close'
  ) THEN
    PERFORM cron.unschedule('boxops-time-weekly-close');
  END IF;

  PERFORM cron.schedule(
    'boxops-time-weekly-close',
    '* * * * *',
    $job$
      SELECT public.submit_due_time_weekly_approvals(now());
    $job$
  );
END;
$$;
