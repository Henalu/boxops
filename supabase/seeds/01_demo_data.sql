-- BoxOps - Generic demo seed
-- Safe to run multiple times. Does not create auth users.

INSERT INTO public.organizations (id, name, slug, status, timezone)
VALUES (
  '00000000-0000-0000-0000-000000100001',
  'Demo Box',
  'demo-box',
  'trialing',
  'Europe/Madrid'
)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    slug = EXCLUDED.slug,
    status = EXCLUDED.status,
    timezone = EXCLUDED.timezone;

INSERT INTO public.centers (id, organization_id, name, slug, timezone, status)
VALUES
  (
    '00000000-0000-0000-0000-000000100010',
    '00000000-0000-0000-0000-000000100001',
    'Demo Downtown',
    'demo-downtown',
    'Europe/Madrid',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000100011',
    '00000000-0000-0000-0000-000000100001',
    'Demo North',
    'demo-north',
    'Europe/Madrid',
    'active'
  )
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    slug = EXCLUDED.slug,
    timezone = EXCLUDED.timezone,
    status = EXCLUDED.status;

INSERT INTO public.class_types (
  id,
  organization_id,
  name,
  slug,
  category,
  required_coaches,
  requires_certification,
  status
)
VALUES
  (
    '00000000-0000-0000-0000-000000100100',
    '00000000-0000-0000-0000-000000100001',
    'WOD',
    'wod',
    'class',
    1,
    false,
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000100101',
    '00000000-0000-0000-0000-000000100001',
    'Open Box',
    'open-box',
    'class',
    1,
    false,
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000100102',
    '00000000-0000-0000-0000-000000100001',
    'Recepcion',
    'recepcion',
    'staffing',
    1,
    false,
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000100103',
    '00000000-0000-0000-0000-000000100001',
    'Evento',
    'evento',
    'event',
    1,
    false,
    'active'
  )
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    slug = EXCLUDED.slug,
    category = EXCLUDED.category,
    required_coaches = EXCLUDED.required_coaches,
    requires_certification = EXCLUDED.requires_certification,
    status = EXCLUDED.status;

INSERT INTO public.schedule_templates (
  id,
  organization_id,
  center_id,
  name,
  template_type,
  status
)
VALUES (
  '00000000-0000-0000-0000-000000100200',
  '00000000-0000-0000-0000-000000100001',
  '00000000-0000-0000-0000-000000100010',
  'Demo Standard Week',
  'weekly',
  'active'
)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    template_type = EXCLUDED.template_type,
    status = EXCLUDED.status;

INSERT INTO public.schedule_template_blocks (
  id,
  organization_id,
  template_id,
  day_of_week,
  start_time,
  end_time,
  center_id,
  class_type_id,
  required_coaches,
  notes
)
VALUES
  (
    '00000000-0000-0000-0000-000000100300',
    '00000000-0000-0000-0000-000000100001',
    '00000000-0000-0000-0000-000000100200',
    1,
    '07:00',
    '08:00',
    '00000000-0000-0000-0000-000000100010',
    '00000000-0000-0000-0000-000000100100',
    1,
    'Morning WOD demo block'
  ),
  (
    '00000000-0000-0000-0000-000000100301',
    '00000000-0000-0000-0000-000000100001',
    '00000000-0000-0000-0000-000000100200',
    1,
    '17:00',
    '18:00',
    '00000000-0000-0000-0000-000000100010',
    '00000000-0000-0000-0000-000000100101',
    1,
    'Evening Open Box demo block'
  )
ON CONFLICT (id) DO UPDATE
SET day_of_week = EXCLUDED.day_of_week,
    start_time = EXCLUDED.start_time,
    end_time = EXCLUDED.end_time,
    center_id = EXCLUDED.center_id,
    class_type_id = EXCLUDED.class_type_id,
    required_coaches = EXCLUDED.required_coaches,
    notes = EXCLUDED.notes;

INSERT INTO public.schedule_blocks (
  id,
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
  notes
)
VALUES
  (
    '00000000-0000-0000-0000-000000100400',
    '00000000-0000-0000-0000-000000100001',
    '00000000-0000-0000-0000-000000100010',
    '00000000-0000-0000-0000-000000100200',
    '00000000-0000-0000-0000-000000100300',
    '2026-05-04',
    '07:00',
    '08:00',
    '00000000-0000-0000-0000-000000100100',
    1,
    'uncovered',
    'Generated from demo template; intentionally uncovered'
  ),
  (
    '00000000-0000-0000-0000-000000100401',
    '00000000-0000-0000-0000-000000100001',
    '00000000-0000-0000-0000-000000100010',
    '00000000-0000-0000-0000-000000100200',
    '00000000-0000-0000-0000-000000100301',
    '2026-05-04',
    '17:00',
    '18:00',
    '00000000-0000-0000-0000-000000100101',
    1,
    'uncovered',
    'Generated from demo template; intentionally uncovered'
  )
ON CONFLICT (id) DO UPDATE
SET service_date = EXCLUDED.service_date,
    start_time = EXCLUDED.start_time,
    end_time = EXCLUDED.end_time,
    class_type_id = EXCLUDED.class_type_id,
    required_coaches = EXCLUDED.required_coaches,
    status = EXCLUDED.status,
    notes = EXCLUDED.notes;

-- Memberships and coach profiles are intentionally not seeded because they
-- require real Supabase auth.users ids. Promote a real user after signup with:
--
-- INSERT INTO public.organization_memberships (organization_id, user_id, role, status, joined_at)
-- VALUES ('00000000-0000-0000-0000-000000100001', '<auth_user_uuid>', 'admin', 'active', now());
