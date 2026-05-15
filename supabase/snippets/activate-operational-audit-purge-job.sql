-- BoxOps S.4 - activate operational audit purge job.
--
-- Run this manually in the target Supabase/Postgres environment with a DB
-- operator role. Do not call it from app code, a Server Action or UI.
--
-- Expected job:
--   daily at 03:17 scheduler time
--   select public.purge_expired_operational_audit_events(1000);

create extension if not exists pg_cron;

do $$
declare
  expected_job_name constant text := 'boxops-purge-operational-audit-events';
  expected_schedule constant text := '17 3 * * *';
  expected_command constant text := 'select public.purge_expired_operational_audit_events(1000);';
  existing_job record;
begin
  if to_regclass('cron.job') is null then
    raise exception 'pg_cron is not installed or cron.job is not visible in this database';
  end if;

  select jobid, schedule, command
  into existing_job
  from cron.job
  where jobname = expected_job_name
  limit 1;

  if not found then
    perform cron.schedule(expected_job_name, expected_schedule, expected_command);
    raise notice 'scheduled %', expected_job_name;
    return;
  end if;

  if existing_job.schedule = expected_schedule
    and existing_job.command = expected_command then
    raise notice 'job % already scheduled with expected command', expected_job_name;
    return;
  end if;

  raise exception
    'job % already exists with a different schedule or command; review cron.job before changing it',
    expected_job_name;
end;
$$;
