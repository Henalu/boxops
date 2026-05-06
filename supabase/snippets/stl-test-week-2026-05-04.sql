-- BoxOps - STL test week fixture for Fase A validation.
-- This is tenant test data, not a product rule and not an automatic seed.
-- It loads the received Monday-Friday schedule into STL Tremanes because
-- center per block was not provided. Coaches stay vacant on purpose.

create extension if not exists pgcrypto with schema extensions;

begin;

delete from public.schedule_block_assignments
where schedule_block_id in (
  select id
  from public.schedule_blocks
  where organization_id = '00000000-0000-0000-0000-000000200001'
    and metadata->>'source' = 'stl_test_week_2026_05_04'
);

delete from public.schedule_blocks
where organization_id = '00000000-0000-0000-0000-000000200001'
  and metadata->>'source' = 'stl_test_week_2026_05_04';

delete from public.schedule_template_blocks
where organization_id = '00000000-0000-0000-0000-000000200001'
  and metadata->>'source' = 'stl_test_week_2026_05_04';

delete from public.schedule_templates
where id = '00000000-0000-0000-0000-000000201000';

insert into public.class_types (
  id,
  organization_id,
  name,
  slug,
  category,
  required_coaches,
  requires_certification,
  status,
  metadata
)
values
  (
    '00000000-0000-0000-0000-000000200101',
    '00000000-0000-0000-0000-000000200001',
    'CrossFit 4Fun',
    'crossfit-4fun',
    'class',
    1,
    false,
    'active',
    '{"source":"stl_test_week_2026_05_04","aliases":["CF4Fun","CrossFit For Fun"]}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000200108',
    '00000000-0000-0000-0000-000000200001',
    'CrossFit',
    'crossfit',
    'class',
    1,
    false,
    'active',
    '{"source":"stl_test_week_2026_05_04"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000200109',
    '00000000-0000-0000-0000-000000200001',
    'Halterofilia Mix',
    'halterofilia-mix',
    'class',
    1,
    false,
    'active',
    '{"source":"stl_test_week_2026_05_04"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000200110',
    '00000000-0000-0000-0000-000000200001',
    'CrossFit Teens',
    'crossfit-teens',
    'class',
    1,
    false,
    'active',
    '{"source":"stl_test_week_2026_05_04","duration_minutes":90}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000200111',
    '00000000-0000-0000-0000-000000200001',
    'Halterofilia Avanzados',
    'halterofilia-avanzados',
    'class',
    1,
    false,
    'active',
    '{"source":"stl_test_week_2026_05_04"}'::jsonb
  )
on conflict (id) do update
set name = excluded.name,
    slug = excluded.slug,
    category = excluded.category,
    required_coaches = excluded.required_coaches,
    requires_certification = excluded.requires_certification,
    status = excluded.status,
    metadata = public.class_types.metadata || excluded.metadata,
    updated_at = now();

insert into public.schedule_templates (
  id,
  organization_id,
  center_id,
  name,
  template_type,
  valid_from,
  valid_until,
  status,
  metadata
)
values (
  '00000000-0000-0000-0000-000000201000',
  '00000000-0000-0000-0000-000000200001',
  '00000000-0000-0000-0000-000000200010',
  'Semana prueba STL L-V',
  'weekly',
  '2026-05-04',
  null,
  'active',
  '{
    "source":"stl_test_week_2026_05_04",
    "scope":"tenant_test_fixture",
    "center_assignment":"stl_tremanes_until_center_per_block_is_confirmed",
    "coach_assignment":"vacant_by_default"
  }'::jsonb
);

with weekdays(day_of_week) as (
  values (1), (2), (3), (4), (5)
),
daily_slots(slot_order, start_time, end_time, class_type_slug) as (
  values
    (1,  '07:00'::time, '08:00'::time, 'wellness'),
    (2,  '07:00'::time, '08:00'::time, 'open-box'),
    (3,  '08:00'::time, '09:00'::time, 'crossfit-4fun'),
    (4,  '08:00'::time, '09:00'::time, 'open-box'),
    (5,  '08:00'::time, '09:00'::time, 'wellness'),
    (6,  '09:30'::time, '10:30'::time, 'wellness'),
    (7,  '09:30'::time, '10:30'::time, 'open-box'),
    (8,  '10:00'::time, '11:00'::time, 'open-box'),
    (9,  '10:00'::time, '11:00'::time, 'halterofilia-mix'),
    (10, '11:00'::time, '12:00'::time, 'wellness'),
    (11, '11:15'::time, '12:15'::time, 'crossfit'),
    (12, '11:15'::time, '12:15'::time, 'open-box'),
    (13, '12:30'::time, '13:30'::time, 'open-box'),
    (14, '14:00'::time, '15:00'::time, 'open-box'),
    (15, '14:00'::time, '15:00'::time, 'crossfit-4fun'),
    (16, '15:00'::time, '16:00'::time, 'open-box'),
    (17, '15:15'::time, '16:15'::time, 'wellness'),
    (18, '16:00'::time, '17:30'::time, 'crossfit-teens'),
    (19, '16:30'::time, '17:30'::time, 'wellness'),
    (20, '16:30'::time, '17:30'::time, 'crossfit-4fun'),
    (21, '16:30'::time, '17:30'::time, 'open-box'),
    (22, '17:35'::time, '18:35'::time, 'halterofilia-avanzados'),
    (23, '17:35'::time, '18:35'::time, 'wellness'),
    (24, '17:35'::time, '18:35'::time, 'crossfit-4fun'),
    (25, '18:40'::time, '19:40'::time, 'crossfit'),
    (26, '18:40'::time, '19:40'::time, 'wellness'),
    (27, '18:40'::time, '19:40'::time, 'halterofilia-mix'),
    (28, '19:50'::time, '20:50'::time, 'crossfit'),
    (29, '19:50'::time, '20:50'::time, 'halterofilia-mix'),
    (30, '19:50'::time, '20:50'::time, 'wellness'),
    (31, '21:00'::time, '22:00'::time, 'crossfit'),
    (32, '21:00'::time, '22:00'::time, 'wellness'),
    (33, '21:00'::time, '22:00'::time, 'open-box')
)
insert into public.schedule_template_blocks (
  organization_id,
  template_id,
  day_of_week,
  start_time,
  end_time,
  center_id,
  class_type_id,
  required_coaches,
  default_coach_profile_id,
  notes,
  metadata
)
select
  '00000000-0000-0000-0000-000000200001',
  '00000000-0000-0000-0000-000000201000',
  weekdays.day_of_week,
  daily_slots.start_time,
  daily_slots.end_time,
  '00000000-0000-0000-0000-000000200010',
  class_types.id,
  1,
  null,
  'Fixture de prueba STL L-V; coach pendiente.',
  jsonb_build_object(
    'source', 'stl_test_week_2026_05_04',
    'slot_order', daily_slots.slot_order,
    'coach_assignment', 'vacant_by_default',
    'center_assignment', 'stl_tremanes_until_center_per_block_is_confirmed'
  )
from weekdays
cross join daily_slots
join public.class_types
  on class_types.organization_id = '00000000-0000-0000-0000-000000200001'
 and class_types.slug = daily_slots.class_type_slug;

insert into public.schedule_blocks (
  organization_id,
  center_id,
  template_id,
  template_block_id,
  service_date,
  start_time,
  end_time,
  class_type_id,
  required_coaches,
  status,
  notes,
  is_template_exception,
  metadata
)
select
  template_blocks.organization_id,
  template_blocks.center_id,
  template_blocks.template_id,
  template_blocks.id,
  ('2026-05-04'::date + (template_blocks.day_of_week - 1)),
  template_blocks.start_time,
  template_blocks.end_time,
  template_blocks.class_type_id,
  template_blocks.required_coaches,
  'scheduled',
  'Fixture de prueba STL L-V; asignacion pendiente.',
  false,
  template_blocks.metadata || jsonb_build_object(
    'source', 'stl_test_week_2026_05_04',
    'fixture_week_start', '2026-05-04',
    'loaded_from_template', true
  )
from public.schedule_template_blocks template_blocks
where template_blocks.organization_id = '00000000-0000-0000-0000-000000200001'
  and template_blocks.template_id = '00000000-0000-0000-0000-000000201000'
  and template_blocks.metadata->>'source' = 'stl_test_week_2026_05_04';

commit;
