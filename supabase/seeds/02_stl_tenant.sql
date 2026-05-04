-- BoxOps - STL tenant seed
-- STL is the first real tenant/pilot. This seed is data/config only.

INSERT INTO public.organizations (id, name, slug, status, timezone)
VALUES (
  '00000000-0000-0000-0000-000000200001',
  'STL',
  'stl',
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
    '00000000-0000-0000-0000-000000200010',
    '00000000-0000-0000-0000-000000200001',
    'STL Tremañes',
    'stl-tremanes',
    'Europe/Madrid',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000200011',
    '00000000-0000-0000-0000-000000200001',
    'STL City',
    'stl-city',
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
    '00000000-0000-0000-0000-000000200100',
    '00000000-0000-0000-0000-000000200001',
    'WOD',
    'wod',
    'class',
    1,
    false,
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000200101',
    '00000000-0000-0000-0000-000000200001',
    'CrossFit For Fun',
    'crossfit-for-fun',
    'class',
    1,
    false,
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000200102',
    '00000000-0000-0000-0000-000000200001',
    'Wellness',
    'wellness',
    'class',
    1,
    false,
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000200103',
    '00000000-0000-0000-0000-000000200001',
    'Open Box',
    'open-box',
    'class',
    1,
    false,
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000200104',
    '00000000-0000-0000-0000-000000200001',
    'Fundamentals',
    'fundamentals',
    'class',
    1,
    false,
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000200105',
    '00000000-0000-0000-0000-000000200001',
    'Recepcion',
    'recepcion',
    'staffing',
    1,
    false,
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000200106',
    '00000000-0000-0000-0000-000000200001',
    'Evento',
    'evento',
    'event',
    1,
    false,
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000200107',
    '00000000-0000-0000-0000-000000200001',
    'Competicion',
    'competicion',
    'competition',
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

INSERT INTO public.person_profiles (
  id,
  organization_id,
  user_id,
  full_name,
  display_name,
  preferred_alias,
  public_email,
  avatar_url,
  visibility_status,
  status,
  metadata
)
VALUES
  (
    '00000000-0000-0000-0000-000000200500',
    '00000000-0000-0000-0000-000000200001',
    null,
    'Nuria Blanco Perez',
    'Nuria',
    null,
    null,
    null,
    'visible',
    'active',
    '{"auth_account_status":"pending","initial_product_role":"manager","source":"stl_validation_2026_04_30"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000200501',
    '00000000-0000-0000-0000-000000200001',
    null,
    'Juanma Torrontegui',
    'Juanma',
    null,
    'juanmatorronteguiperez@gmail.com',
    null,
    'visible',
    'active',
    '{"auth_account_status":"pending","initial_product_role":"admin","source":"stl_validation_2026_04_30"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000200502',
    '00000000-0000-0000-0000-000000200001',
    null,
    'Lucas Peralta',
    'Lucas',
    null,
    'lucasperaltagijon@gmail.com',
    null,
    'visible',
    'active',
    '{"auth_account_status":"pending","initial_product_role":"coach","source":"stl_validation_2026_04_30"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000200503',
    '00000000-0000-0000-0000-000000200001',
    null,
    'Lucia Fernandez',
    'Lucia',
    null,
    'luciape1994@gmail.com',
    null,
    'visible',
    'active',
    '{"auth_account_status":"pending","initial_product_role":"coach","source":"stl_validation_2026_04_30"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000200504',
    '00000000-0000-0000-0000-000000200001',
    null,
    'Noah Iglesias Mendez',
    'Noah',
    null,
    'iglesiasmendeznoah@gmail.com',
    null,
    'visible',
    'active',
    '{"auth_account_status":"pending","initial_product_role":"coach","source":"stl_validation_2026_04_30"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000200505',
    '00000000-0000-0000-0000-000000200001',
    null,
    'Pedro Gonzalez Lopez',
    'Pedrin',
    'Pedrin',
    'pedro45399@gmail.com',
    null,
    'visible',
    'active',
    '{"auth_account_status":"pending","initial_product_role":"manager","source":"stl_validation_2026_04_30"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000200506',
    '00000000-0000-0000-0000-000000200001',
    null,
    'Roberto Vega',
    'Rober',
    'Rober',
    'robervg1990@gmail.com',
    null,
    'visible',
    'active',
    '{"auth_account_status":"pending","initial_product_role":"admin","source":"stl_validation_2026_04_30"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000200507',
    '00000000-0000-0000-0000-000000200001',
    null,
    'Valentina Oxley',
    'Valentina Oxley',
    null,
    'valentinaoxley302@hotmail.com',
    null,
    'visible',
    'active',
    '{"auth_account_status":"pending","initial_product_role":"coach","source":"stl_validation_2026_04_30"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000200508',
    '00000000-0000-0000-0000-000000200001',
    null,
    'Valentina Rodriguez',
    'Valentina',
    null,
    'valenntnrg@gmail.com',
    null,
    'visible',
    'active',
    '{"auth_account_status":"pending","initial_product_role":"coach","source":"stl_validation_2026_04_30"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000200509',
    '00000000-0000-0000-0000-000000200001',
    null,
    'Henalu Paes de Barros',
    'Henalu Paes de Barros',
    null,
    'henalupaesdebarros@gmail.com',
    null,
    'internal',
    'active',
    '{"auth_account_status":"pending","initial_product_role":"admin","profile_kind":"technical_admin","assignable_as_coach":false,"source":"stl_validation_2026_04_30"}'::jsonb
  )
ON CONFLICT (id) DO UPDATE
SET user_id = EXCLUDED.user_id,
    full_name = EXCLUDED.full_name,
    display_name = EXCLUDED.display_name,
    preferred_alias = EXCLUDED.preferred_alias,
    public_email = EXCLUDED.public_email,
    avatar_url = EXCLUDED.avatar_url,
    visibility_status = EXCLUDED.visibility_status,
    status = EXCLUDED.status,
    metadata = EXCLUDED.metadata;

INSERT INTO public.coach_profiles (
  id,
  organization_id,
  user_id,
  person_profile_id,
  primary_center_id,
  weekly_contracted_hours,
  status,
  notes,
  metadata
)
VALUES
  (
    '00000000-0000-0000-0000-000000200600',
    '00000000-0000-0000-0000-000000200001',
    null,
    '00000000-0000-0000-0000-000000200500',
    '00000000-0000-0000-0000-000000200010',
    20,
    'active',
    'Cuenta Auth: Pendiente. Rol inicial: manager.',
    '{"auth_account_status":"pending","initial_product_role":"manager","source":"stl_validation_2026_04_30"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000200601',
    '00000000-0000-0000-0000-000000200001',
    null,
    '00000000-0000-0000-0000-000000200501',
    '00000000-0000-0000-0000-000000200011',
    20,
    'active',
    'Cuenta Auth: Pendiente. Rol inicial: admin.',
    '{"auth_account_status":"pending","initial_product_role":"admin","source":"stl_validation_2026_04_30"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000200602',
    '00000000-0000-0000-0000-000000200001',
    null,
    '00000000-0000-0000-0000-000000200502',
    '00000000-0000-0000-0000-000000200011',
    20,
    'active',
    'Cuenta Auth: Pendiente. Rol inicial: coach.',
    '{"auth_account_status":"pending","initial_product_role":"coach","source":"stl_validation_2026_04_30"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000200603',
    '00000000-0000-0000-0000-000000200001',
    null,
    '00000000-0000-0000-0000-000000200503',
    '00000000-0000-0000-0000-000000200011',
    20,
    'active',
    'Cuenta Auth: Pendiente. Rol inicial: coach.',
    '{"auth_account_status":"pending","initial_product_role":"coach","source":"stl_validation_2026_04_30"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000200604',
    '00000000-0000-0000-0000-000000200001',
    null,
    '00000000-0000-0000-0000-000000200504',
    '00000000-0000-0000-0000-000000200010',
    20,
    'active',
    'Cuenta Auth: Pendiente. Rol inicial: coach.',
    '{"auth_account_status":"pending","initial_product_role":"coach","source":"stl_validation_2026_04_30"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000200605',
    '00000000-0000-0000-0000-000000200001',
    null,
    '00000000-0000-0000-0000-000000200505',
    '00000000-0000-0000-0000-000000200010',
    20,
    'active',
    'Cuenta Auth: Pendiente. Rol inicial: manager.',
    '{"auth_account_status":"pending","initial_product_role":"manager","source":"stl_validation_2026_04_30"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000200606',
    '00000000-0000-0000-0000-000000200001',
    null,
    '00000000-0000-0000-0000-000000200506',
    '00000000-0000-0000-0000-000000200010',
    20,
    'active',
    'Cuenta Auth: Pendiente. Rol inicial: admin.',
    '{"auth_account_status":"pending","initial_product_role":"admin","source":"stl_validation_2026_04_30"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000200607',
    '00000000-0000-0000-0000-000000200001',
    null,
    '00000000-0000-0000-0000-000000200507',
    '00000000-0000-0000-0000-000000200010',
    20,
    'active',
    'Cuenta Auth: Pendiente. Rol inicial: coach.',
    '{"auth_account_status":"pending","initial_product_role":"coach","source":"stl_validation_2026_04_30"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000200608',
    '00000000-0000-0000-0000-000000200001',
    null,
    '00000000-0000-0000-0000-000000200508',
    '00000000-0000-0000-0000-000000200011',
    20,
    'active',
    'Cuenta Auth: Pendiente. Rol inicial: coach.',
    '{"auth_account_status":"pending","initial_product_role":"coach","source":"stl_validation_2026_04_30"}'::jsonb
  )
ON CONFLICT (id) DO UPDATE
SET user_id = EXCLUDED.user_id,
    person_profile_id = EXCLUDED.person_profile_id,
    primary_center_id = EXCLUDED.primary_center_id,
    weekly_contracted_hours = EXCLUDED.weekly_contracted_hours,
    status = EXCLUDED.status,
    notes = EXCLUDED.notes,
    metadata = EXCLUDED.metadata;

-- No Supabase Auth accounts are created for these people in this seed.
-- The internal technical profile is hidden and intentionally has no coach_profile.
-- Templates, schedules and real assignments stay pending until STL validates
-- the exact seed/configuration flow for the pilot database.
