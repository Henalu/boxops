select email from auth.users
where email in ('e2e.admin@boxops.local', 'e2e.coach@boxops.local');

select role, status, user_id
from public.organization_memberships
where user_id in (
  '00000000-0000-0000-0000-000000100900',
  '00000000-0000-0000-0000-000000100901'
);

select id, service_date, start_time, end_time, required_coaches, status
from public.schedule_blocks
where id between '00000000-0000-0000-0000-000000100400'
             and '00000000-0000-0000-0000-000000100404'
order by start_time;
