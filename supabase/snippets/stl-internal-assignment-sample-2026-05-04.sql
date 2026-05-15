-- Internal QA fixture for the STL tenant test week.
--
-- Purpose:
-- - Keep the product generic while giving local smoke tests representative data.
-- - Link the existing local E2E coach Auth user to one operational coach profile.
-- - Add a small editable assignment sample with covered, vacant and
--   insufficient blocks. Overlapping assigned coaches are blocked by the
--   database guardrail and should not be seeded as a normal QA fixture.
--
-- This is not a production seed and it is not an official STL validation import.

begin;

do $$
declare
  stl_org_id constant uuid := '00000000-0000-0000-0000-000000200001';
  e2e_admin_user_id constant uuid := '00000000-0000-0000-0000-000000100900';
  e2e_coach_user_id constant uuid := '00000000-0000-0000-0000-000000100901';
  lucas_coach_profile_id constant uuid := '00000000-0000-0000-0000-000000200602';
  lucas_person_profile_id constant uuid := '00000000-0000-0000-0000-000000200502';
begin
  if exists (select 1 from auth.users where id = e2e_admin_user_id) then
    insert into public.organization_memberships (
      organization_id,
      user_id,
      role,
      status,
      joined_at
    )
    values (
      stl_org_id,
      e2e_admin_user_id,
      'admin',
      'active',
      now()
    )
    on conflict (organization_id, user_id)
    do update set
      role = 'admin',
      status = 'active',
      joined_at = coalesce(public.organization_memberships.joined_at, excluded.joined_at);
  end if;

  if exists (select 1 from auth.users where id = e2e_coach_user_id) then
    if exists (
      select 1
      from public.person_profiles person_profile
      where person_profile.organization_id = stl_org_id
        and person_profile.user_id = e2e_coach_user_id
        and person_profile.id <> lucas_person_profile_id
    ) then
      raise exception 'E2E coach user is already linked to another STL person profile';
    end if;

    if exists (
      select 1
      from public.coach_profiles coach_profile
      where coach_profile.organization_id = stl_org_id
        and coach_profile.user_id = e2e_coach_user_id
        and coach_profile.id <> lucas_coach_profile_id
    ) then
      raise exception 'E2E coach user is already linked to another STL coach profile';
    end if;

    if exists (
      select 1
      from public.person_profiles person_profile
      where person_profile.organization_id = stl_org_id
        and person_profile.id = lucas_person_profile_id
        and person_profile.user_id is not null
        and person_profile.user_id <> e2e_coach_user_id
    ) then
      raise exception 'Lucas person profile is already linked to a different Auth user';
    end if;

    if exists (
      select 1
      from public.coach_profiles coach_profile
      where coach_profile.organization_id = stl_org_id
        and coach_profile.id = lucas_coach_profile_id
        and coach_profile.user_id is not null
        and coach_profile.user_id <> e2e_coach_user_id
    ) then
      raise exception 'Lucas coach profile is already linked to a different Auth user';
    end if;

    insert into public.organization_memberships (
      organization_id,
      user_id,
      role,
      status,
      joined_at
    )
    values (
      stl_org_id,
      e2e_coach_user_id,
      'coach',
      'active',
      now()
    )
    on conflict (organization_id, user_id)
    do update set
      role = 'coach',
      status = 'active',
      joined_at = coalesce(public.organization_memberships.joined_at, excluded.joined_at);

    update public.person_profiles
    set
      user_id = e2e_coach_user_id,
      metadata = metadata || jsonb_build_object(
        'qa_auth_link', 'stl_internal_assignment_sample_2026_05_04'
      )
    where organization_id = stl_org_id
      and id = lucas_person_profile_id;

    update public.coach_profiles
    set
      user_id = e2e_coach_user_id,
      metadata = metadata || jsonb_build_object(
        'qa_auth_link', 'stl_internal_assignment_sample_2026_05_04'
      )
    where organization_id = stl_org_id
      and id = lucas_coach_profile_id;
  else
    raise notice 'Local E2E coach Auth user not found; skipping Auth link for Lucas.';
  end if;
end $$;

delete from public.schedule_block_assignments assignment
using public.schedule_blocks block
where assignment.organization_id = '00000000-0000-0000-0000-000000200001'
  and assignment.schedule_block_id = block.id
  and block.organization_id = assignment.organization_id
  and block.metadata->>'fixture_week_start' = '2026-05-04'
  and block.metadata->>'source' = 'stl_test_week_2026_05_04'
  and assignment.source = 'import'
  and assignment.notes = 'Fixture interno QA: muestra representativa de asignaciones.';

update public.schedule_template_blocks
set
  center_id = '00000000-0000-0000-0000-000000200010',
  required_coaches = 1,
  default_coach_profile_id = null,
  notes = 'Fixture de prueba STL L-V; coach pendiente.',
  metadata = (metadata - 'qa_assignment_sample') || jsonb_build_object(
    'coach_assignment', 'vacant_by_default'
  )
where organization_id = '00000000-0000-0000-0000-000000200001'
  and template_id = '00000000-0000-0000-0000-000000201000'
  and metadata->>'qa_assignment_sample' = 'stl_internal_assignment_sample_2026_05_04';

update public.schedule_blocks
set
  center_id = '00000000-0000-0000-0000-000000200010',
  required_coaches = 1,
  notes = 'Fixture de prueba STL L-V; asignacion pendiente.',
  metadata = metadata - 'qa_assignment_sample'
where organization_id = '00000000-0000-0000-0000-000000200001'
  and metadata->>'fixture_week_start' = '2026-05-04'
  and metadata->>'source' = 'stl_test_week_2026_05_04'
  and metadata->>'qa_assignment_sample' = 'stl_internal_assignment_sample_2026_05_04';

with sample_assignments (
  day_of_week,
  slot_order,
  center_id,
  coach_profile_id,
  required_coaches
) as (
  values
    (1, 3,  '00000000-0000-0000-0000-000000200011'::uuid, '00000000-0000-0000-0000-000000200602'::uuid, 1),
    (1, 10, '00000000-0000-0000-0000-000000200010'::uuid, '00000000-0000-0000-0000-000000200600'::uuid, 1),
    (1, 18, '00000000-0000-0000-0000-000000200010'::uuid, '00000000-0000-0000-0000-000000200606'::uuid, 1),
    (1, 20, '00000000-0000-0000-0000-000000200010'::uuid, '00000000-0000-0000-0000-000000200607'::uuid, 1),
    (1, 25, '00000000-0000-0000-0000-000000200010'::uuid, '00000000-0000-0000-0000-000000200605'::uuid, 2),
    (1, 31, '00000000-0000-0000-0000-000000200010'::uuid, '00000000-0000-0000-0000-000000200604'::uuid, 1),
    (2, 3,  '00000000-0000-0000-0000-000000200011'::uuid, '00000000-0000-0000-0000-000000200602'::uuid, 1),
    (2, 10, '00000000-0000-0000-0000-000000200011'::uuid, '00000000-0000-0000-0000-000000200601'::uuid, 1),
    (2, 19, '00000000-0000-0000-0000-000000200011'::uuid, '00000000-0000-0000-0000-000000200608'::uuid, 1),
    (2, 28, '00000000-0000-0000-0000-000000200010'::uuid, '00000000-0000-0000-0000-000000200607'::uuid, 1),
    (3, 1,  '00000000-0000-0000-0000-000000200011'::uuid, '00000000-0000-0000-0000-000000200603'::uuid, 1),
    (3, 11, '00000000-0000-0000-0000-000000200010'::uuid, '00000000-0000-0000-0000-000000200605'::uuid, 1),
    (3, 24, '00000000-0000-0000-0000-000000200010'::uuid, '00000000-0000-0000-0000-000000200604'::uuid, 1),
    (3, 31, '00000000-0000-0000-0000-000000200010'::uuid, '00000000-0000-0000-0000-000000200606'::uuid, 1),
    (4, 3,  '00000000-0000-0000-0000-000000200011'::uuid, '00000000-0000-0000-0000-000000200602'::uuid, 1),
    (4, 9,  '00000000-0000-0000-0000-000000200011'::uuid, '00000000-0000-0000-0000-000000200601'::uuid, 1),
    (4, 25, '00000000-0000-0000-0000-000000200011'::uuid, '00000000-0000-0000-0000-000000200608'::uuid, 1),
    (5, 6,  '00000000-0000-0000-0000-000000200010'::uuid, '00000000-0000-0000-0000-000000200600'::uuid, 1),
    (5, 15, '00000000-0000-0000-0000-000000200011'::uuid, '00000000-0000-0000-0000-000000200602'::uuid, 1),
    (5, 28, '00000000-0000-0000-0000-000000200010'::uuid, '00000000-0000-0000-0000-000000200607'::uuid, 1)
)
update public.schedule_template_blocks template_block
set
  center_id = sample_assignments.center_id,
  required_coaches = sample_assignments.required_coaches,
  default_coach_profile_id = sample_assignments.coach_profile_id,
  notes = 'Fixture interno QA: coach por defecto representativo.',
  metadata = template_block.metadata || jsonb_build_object(
    'qa_assignment_sample', 'stl_internal_assignment_sample_2026_05_04',
    'coach_assignment', 'representative_sample'
  )
from sample_assignments
where template_block.organization_id = '00000000-0000-0000-0000-000000200001'
  and template_block.template_id = '00000000-0000-0000-0000-000000201000'
  and template_block.day_of_week = sample_assignments.day_of_week
  and (template_block.metadata->>'slot_order')::integer = sample_assignments.slot_order;

with sample_assignments (
  day_of_week,
  slot_order,
  center_id,
  coach_profile_id,
  required_coaches
) as (
  values
    (1, 3,  '00000000-0000-0000-0000-000000200011'::uuid, '00000000-0000-0000-0000-000000200602'::uuid, 1),
    (1, 10, '00000000-0000-0000-0000-000000200010'::uuid, '00000000-0000-0000-0000-000000200600'::uuid, 1),
    (1, 18, '00000000-0000-0000-0000-000000200010'::uuid, '00000000-0000-0000-0000-000000200606'::uuid, 1),
    (1, 20, '00000000-0000-0000-0000-000000200010'::uuid, '00000000-0000-0000-0000-000000200607'::uuid, 1),
    (1, 25, '00000000-0000-0000-0000-000000200010'::uuid, '00000000-0000-0000-0000-000000200605'::uuid, 2),
    (1, 31, '00000000-0000-0000-0000-000000200010'::uuid, '00000000-0000-0000-0000-000000200604'::uuid, 1),
    (2, 3,  '00000000-0000-0000-0000-000000200011'::uuid, '00000000-0000-0000-0000-000000200602'::uuid, 1),
    (2, 10, '00000000-0000-0000-0000-000000200011'::uuid, '00000000-0000-0000-0000-000000200601'::uuid, 1),
    (2, 19, '00000000-0000-0000-0000-000000200011'::uuid, '00000000-0000-0000-0000-000000200608'::uuid, 1),
    (2, 28, '00000000-0000-0000-0000-000000200010'::uuid, '00000000-0000-0000-0000-000000200607'::uuid, 1),
    (3, 1,  '00000000-0000-0000-0000-000000200011'::uuid, '00000000-0000-0000-0000-000000200603'::uuid, 1),
    (3, 11, '00000000-0000-0000-0000-000000200010'::uuid, '00000000-0000-0000-0000-000000200605'::uuid, 1),
    (3, 24, '00000000-0000-0000-0000-000000200010'::uuid, '00000000-0000-0000-0000-000000200604'::uuid, 1),
    (3, 31, '00000000-0000-0000-0000-000000200010'::uuid, '00000000-0000-0000-0000-000000200606'::uuid, 1),
    (4, 3,  '00000000-0000-0000-0000-000000200011'::uuid, '00000000-0000-0000-0000-000000200602'::uuid, 1),
    (4, 9,  '00000000-0000-0000-0000-000000200011'::uuid, '00000000-0000-0000-0000-000000200601'::uuid, 1),
    (4, 25, '00000000-0000-0000-0000-000000200011'::uuid, '00000000-0000-0000-0000-000000200608'::uuid, 1),
    (5, 6,  '00000000-0000-0000-0000-000000200010'::uuid, '00000000-0000-0000-0000-000000200600'::uuid, 1),
    (5, 15, '00000000-0000-0000-0000-000000200011'::uuid, '00000000-0000-0000-0000-000000200602'::uuid, 1),
    (5, 28, '00000000-0000-0000-0000-000000200010'::uuid, '00000000-0000-0000-0000-000000200607'::uuid, 1)
)
update public.schedule_blocks block
set
  center_id = sample_assignments.center_id,
  required_coaches = sample_assignments.required_coaches,
  notes = 'Fixture interno QA: bloque con asignacion representativa.',
  metadata = block.metadata || jsonb_build_object(
    'qa_assignment_sample', 'stl_internal_assignment_sample_2026_05_04'
  )
from sample_assignments
where block.organization_id = '00000000-0000-0000-0000-000000200001'
  and block.metadata->>'fixture_week_start' = '2026-05-04'
  and block.metadata->>'source' = 'stl_test_week_2026_05_04'
  and block.service_date = '2026-05-04'::date + (sample_assignments.day_of_week - 1)
  and (block.metadata->>'slot_order')::integer = sample_assignments.slot_order;

with sample_assignments (
  day_of_week,
  slot_order,
  coach_profile_id
) as (
  values
    (1, 3,  '00000000-0000-0000-0000-000000200602'::uuid),
    (1, 10, '00000000-0000-0000-0000-000000200600'::uuid),
    (1, 18, '00000000-0000-0000-0000-000000200606'::uuid),
    (1, 20, '00000000-0000-0000-0000-000000200607'::uuid),
    (1, 25, '00000000-0000-0000-0000-000000200605'::uuid),
    (1, 31, '00000000-0000-0000-0000-000000200604'::uuid),
    (2, 3,  '00000000-0000-0000-0000-000000200602'::uuid),
    (2, 10, '00000000-0000-0000-0000-000000200601'::uuid),
    (2, 19, '00000000-0000-0000-0000-000000200608'::uuid),
    (2, 28, '00000000-0000-0000-0000-000000200607'::uuid),
    (3, 1,  '00000000-0000-0000-0000-000000200603'::uuid),
    (3, 11, '00000000-0000-0000-0000-000000200605'::uuid),
    (3, 24, '00000000-0000-0000-0000-000000200604'::uuid),
    (3, 31, '00000000-0000-0000-0000-000000200606'::uuid),
    (4, 3,  '00000000-0000-0000-0000-000000200602'::uuid),
    (4, 9,  '00000000-0000-0000-0000-000000200601'::uuid),
    (4, 25, '00000000-0000-0000-0000-000000200608'::uuid),
    (5, 6,  '00000000-0000-0000-0000-000000200600'::uuid),
    (5, 15, '00000000-0000-0000-0000-000000200602'::uuid),
    (5, 28, '00000000-0000-0000-0000-000000200607'::uuid)
)
insert into public.schedule_block_assignments (
  organization_id,
  schedule_block_id,
  coach_profile_id,
  assignment_status,
  source,
  notes
)
select
  block.organization_id,
  block.id,
  sample_assignments.coach_profile_id,
  'assigned',
  'import',
  'Fixture interno QA: muestra representativa de asignaciones.'
from sample_assignments
join public.schedule_blocks block
  on block.organization_id = '00000000-0000-0000-0000-000000200001'
 and block.metadata->>'fixture_week_start' = '2026-05-04'
 and block.metadata->>'source' = 'stl_test_week_2026_05_04'
 and block.service_date = '2026-05-04'::date + (sample_assignments.day_of_week - 1)
 and (block.metadata->>'slot_order')::integer = sample_assignments.slot_order
on conflict (schedule_block_id, coach_profile_id)
do update set
  assignment_status = 'assigned',
  source = 'import',
  notes = 'Fixture interno QA: muestra representativa de asignaciones.';

commit;
