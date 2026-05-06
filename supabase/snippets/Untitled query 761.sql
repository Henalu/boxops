create extension if not exists pgcrypto with schema extensions;

insert into auth.users (
  id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
)
values
  (
    '00000000-0000-0000-0000-000000100900',
    'authenticated',
    'authenticated',
    'e2e.admin@boxops.local',
    extensions.crypt('BoxOpsE2E!2026', extensions.gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"E2E Admin"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000100901',
    'authenticated',
    'authenticated',
    'e2e.coach@boxops.local',
    extensions.crypt('BoxOpsE2E!2026', extensions.gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"E2E Coach"}'::jsonb
  )
on conflict (id) do update
set email = excluded.email,
    encrypted_password = excluded.encrypted_password,
    email_confirmed_at = excluded.email_confirmed_at,
    updated_at = now(),
    raw_app_meta_data = excluded.raw_app_meta_data,
    raw_user_meta_data = excluded.raw_user_meta_data;

insert into auth.identities (
  user_id, provider_id, provider, identity_data,
  last_sign_in_at, created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-000000100900',
    '00000000-0000-0000-0000-000000100900',
    'email',
    '{"sub":"00000000-0000-0000-0000-000000100900","email":"e2e.admin@boxops.local"}'::jsonb,
    now(), now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000100901',
    '00000000-0000-0000-0000-000000100901',
    'email',
    '{"sub":"00000000-0000-0000-0000-000000100901","email":"e2e.coach@boxops.local"}'::jsonb,
    now(), now(), now()
  )
on conflict (provider, provider_id) do update
set identity_data = excluded.identity_data,
    updated_at = now();

insert into public.organization_memberships (
  organization_id, user_id, role, status, joined_at
)
values
  (
    '00000000-0000-0000-0000-000000100001',
    '00000000-0000-0000-0000-000000100900',
    'admin',
    'active',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000100001',
    '00000000-0000-0000-0000-000000100901',
    'coach',
    'active',
    now()
  )
on conflict (organization_id, user_id) do update
set role = excluded.role,
    status = 'active',
    joined_at = coalesce(public.organization_memberships.joined_at, now()),
    updated_at = now();

insert into public.person_profiles (
  id, organization_id, user_id, display_name, full_name, public_email,
  visibility_status, status
)
values
  (
    '00000000-0000-0000-0000-000000100910',
    '00000000-0000-0000-0000-000000100001',
    '00000000-0000-0000-0000-000000100901',
    'E2E Coach',
    'E2E Coach',
    'e2e.coach@boxops.local',
    'visible',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000100911',
    '00000000-0000-0000-0000-000000100001',
    null,
    'E2E Reserve Coach',
    'E2E Reserve Coach',
    null,
    'visible',
    'active'
  )
on conflict (id) do update
set user_id = excluded.user_id,
    display_name = excluded.display_name,
    full_name = excluded.full_name,
    public_email = excluded.public_email,
    visibility_status = 'visible',
    status = 'active',
    updated_at = now();

insert into public.coach_profiles (
  id, organization_id, user_id, person_profile_id,
  primary_center_id, weekly_contracted_hours, status, notes
)
values
  (
    '00000000-0000-0000-0000-000000100920',
    '00000000-0000-0000-0000-000000100001',
    '00000000-0000-0000-0000-000000100901',
    '00000000-0000-0000-0000-000000100910',
    '00000000-0000-0000-0000-000000100010',
    20,
    'active',
    'E2E coach profile'
  ),
  (
    '00000000-0000-0000-0000-000000100921',
    '00000000-0000-0000-0000-000000100001',
    null,
    '00000000-0000-0000-0000-000000100911',
    '00000000-0000-0000-0000-000000100010',
    10,
    'active',
    'E2E reserve coach profile'
  )
on conflict (id) do update
set user_id = excluded.user_id,
    person_profile_id = excluded.person_profile_id,
    primary_center_id = excluded.primary_center_id,
    weekly_contracted_hours = excluded.weekly_contracted_hours,
    status = 'active',
    updated_at = now();

update public.schedule_blocks
set required_coaches = 2,
    status = 'scheduled',
    updated_at = now()
where id = '00000000-0000-0000-0000-000000100401';

insert into public.schedule_blocks (
  id, organization_id, center_id, service_date, start_time, end_time,
  class_type_id, required_coaches, status, notes
)
values
  (
    '00000000-0000-0000-0000-000000100402',
    '00000000-0000-0000-0000-000000100001',
    '00000000-0000-0000-0000-000000100010',
    '2026-05-04',
    '12:00',
    '13:00',
    '00000000-0000-0000-0000-000000100100',
    1,
    'scheduled',
    'E2E covered block'
  ),
  (
    '00000000-0000-0000-0000-000000100403',
    '00000000-0000-0000-0000-000000100001',
    '00000000-0000-0000-0000-000000100010',
    '2026-05-04',
    '19:00',
    '20:00',
    '00000000-0000-0000-0000-000000100100',
    1,
    'scheduled',
    'E2E conflict block A'
  ),
  (
    '00000000-0000-0000-0000-000000100404',
    '00000000-0000-0000-0000-000000100001',
    '00000000-0000-0000-0000-000000100010',
    '2026-05-04',
    '19:30',
    '20:30',
    '00000000-0000-0000-0000-000000100100',
    1,
    'scheduled',
    'E2E conflict block B'
  )
on conflict (id) do update
set service_date = excluded.service_date,
    start_time = excluded.start_time,
    end_time = excluded.end_time,
    class_type_id = excluded.class_type_id,
    required_coaches = excluded.required_coaches,
    status = excluded.status,
    notes = excluded.notes,
    updated_at = now();

insert into public.schedule_block_assignments (
  organization_id, schedule_block_id, coach_profile_id, assignment_status, source
)
values
  (
    '00000000-0000-0000-0000-000000100001',
    '00000000-0000-0000-0000-000000100401',
    '00000000-0000-0000-0000-000000100920',
    'assigned',
    'manual'
  ),
  (
    '00000000-0000-0000-0000-000000100001',
    '00000000-0000-0000-0000-000000100402',
    '00000000-0000-0000-0000-000000100921',
    'assigned',
    'manual'
  ),
  (
    '00000000-0000-0000-0000-000000100001',
    '00000000-0000-0000-0000-000000100403',
    '00000000-0000-0000-0000-000000100920',
    'assigned',
    'manual'
  ),
  (
    '00000000-0000-0000-0000-000000100001',
    '00000000-0000-0000-0000-000000100404',
    '00000000-0000-0000-0000-000000100920',
    'assigned',
    'manual'
  )
on conflict (schedule_block_id, coach_profile_id) do update
set assignment_status = 'assigned',
    source = 'manual',
    updated_at = now();
