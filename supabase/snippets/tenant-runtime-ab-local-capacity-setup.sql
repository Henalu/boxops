-- BoxOps - local synthetic tenant A/B runtime capacity setup
--
-- Purpose:
--   Prepare the minimum local-only Auth/membership capacity needed before a
--   later runtime validation phase. This does not apply S.77, does not create
--   migration 00044, does not change grants/default privileges, and does not
--   touch product code.
--
-- Scope:
--   - Assert tenant A already has confirmed active owner/admin/manager/coach.
--   - Assert tenant B already has confirmed active owner/coach and usable
--     operational catalog data.
--   - Create or refresh synthetic local tenant B admin/manager Auth users.
--   - Create active tenant B memberships and visible person profiles for those
--     two synthetic users.
--   - Leave all changes rolled back unless commit_changes=1 is passed.
--
-- Safety:
--   - Local-only, opt-in guard required: allow_local_synthetic_e2e_setup=local-only
--   - No real emails, real names, production secrets, tokens, cookies, DB URLs,
--     signed URLs or Storage paths should be passed to this snippet.
--   - Use @boxops.local synthetic emails and a local disposable password.
--   - Do not paste real secrets into this file, terminal screenshots or commits.
--
-- Dry run example:
--   Get-Content -Raw supabase/snippets/tenant-runtime-ab-local-capacity-setup.sql |
--     docker exec -i supabase_db_boxops psql -U postgres -d postgres -v ON_ERROR_STOP=1 `
--       -v allow_local_synthetic_e2e_setup=local-only `
--       -v tenant_a_id=<tenant-a-uuid> `
--       -v tenant_b_id=<tenant-b-uuid> `
--       -v tenant_b_admin_email=boxops-e2e-admin-b@boxops.local `
--       -v tenant_b_admin_password=<local-disposable-password> `
--       -v tenant_b_manager_email=boxops-e2e-manager-b@boxops.local `
--       -v tenant_b_manager_password=<local-disposable-password>
--
-- Persistent local setup:
--   Add -v commit_changes=1 to the same command only after the dry run passes.

\if :{?allow_local_synthetic_e2e_setup}
\else
\echo 'Missing required psql variable: allow_local_synthetic_e2e_setup'
\quit 1
\endif

\if :{?tenant_a_id}
\else
\echo 'Missing required psql variable: tenant_a_id'
\quit 1
\endif

\if :{?tenant_b_id}
\else
\echo 'Missing required psql variable: tenant_b_id'
\quit 1
\endif

\if :{?tenant_b_admin_email}
\else
\echo 'Missing required psql variable: tenant_b_admin_email'
\quit 1
\endif

\if :{?tenant_b_admin_password}
\else
\echo 'Missing required psql variable: tenant_b_admin_password'
\quit 1
\endif

\if :{?tenant_b_manager_email}
\else
\echo 'Missing required psql variable: tenant_b_manager_email'
\quit 1
\endif

\if :{?tenant_b_manager_password}
\else
\echo 'Missing required psql variable: tenant_b_manager_password'
\quit 1
\endif

\if :{?commit_changes}
\else
\set commit_changes 0
\endif

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assert_true(
  condition boolean,
  label text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF condition IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'tenant runtime A/B local capacity setup failed: %', label;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.required_text(
  value text,
  label text
)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  normalized text := btrim(coalesce(value, ''));
BEGIN
  IF normalized = '' THEN
    RAISE EXCEPTION 'missing required value: %', label;
  END IF;

  RETURN normalized;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_synthetic_email(
  value text,
  label text
)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  normalized text := lower(pg_temp.required_text(value, label));
BEGIN
  IF normalized !~ '^[a-z0-9._%+-]+@boxops\.local$' THEN
    RAISE EXCEPTION '% must be a synthetic @boxops.local email', label;
  END IF;

  RETURN normalized;
END;
$$;

CREATE TEMP TABLE runtime_capacity_input (
  tenant_a_id uuid NOT NULL,
  tenant_b_id uuid NOT NULL,
  role text NOT NULL,
  email text NOT NULL,
  password text NOT NULL,
  display_name text NOT NULL
) ON COMMIT DROP;

INSERT INTO runtime_capacity_input (
  tenant_a_id,
  tenant_b_id,
  role,
  email,
  password,
  display_name
)
VALUES
  (
    :'tenant_a_id'::uuid,
    :'tenant_b_id'::uuid,
    'admin',
    pg_temp.assert_synthetic_email(:'tenant_b_admin_email', 'tenant_b_admin_email'),
    pg_temp.required_text(:'tenant_b_admin_password', 'tenant_b_admin_password'),
    'E2E Tenant B Admin'
  ),
  (
    :'tenant_a_id'::uuid,
    :'tenant_b_id'::uuid,
    'manager',
    pg_temp.assert_synthetic_email(:'tenant_b_manager_email', 'tenant_b_manager_email'),
    pg_temp.required_text(:'tenant_b_manager_password', 'tenant_b_manager_password'),
    'E2E Tenant B Manager'
  );

SELECT pg_temp.assert_true(
  :'allow_local_synthetic_e2e_setup' = 'local-only',
  'allow_local_synthetic_e2e_setup must be local-only'
);

SELECT pg_temp.assert_true(
  (SELECT tenant_a_id <> tenant_b_id FROM runtime_capacity_input LIMIT 1),
  'tenant_a_id and tenant_b_id must be different'
);

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM public.organizations organization
    WHERE organization.id = (SELECT tenant_a_id FROM runtime_capacity_input LIMIT 1)
      AND organization.status IN ('trialing', 'active')
  ),
  'tenant A must exist and be trialing or active'
);

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM public.organizations organization
    WHERE organization.id = (SELECT tenant_b_id FROM runtime_capacity_input LIMIT 1)
      AND organization.status IN ('trialing', 'active')
  ),
  'tenant B must exist and be trialing or active'
);

WITH expected_roles(role) AS (
  VALUES ('owner'), ('admin'), ('manager'), ('coach')
),
tenant_a_readiness AS (
  SELECT
    expected_roles.role,
    count(*) FILTER (
      WHERE membership.id IS NOT NULL
        AND membership.status = 'active'
        AND auth_user.email_confirmed_at IS NOT NULL
    ) AS ready_count
  FROM expected_roles
  LEFT JOIN public.organization_memberships membership
    ON membership.organization_id = (SELECT tenant_a_id FROM runtime_capacity_input LIMIT 1)
   AND membership.role = expected_roles.role
   AND membership.status = 'active'
  LEFT JOIN auth.users auth_user
    ON auth_user.id = membership.user_id
  GROUP BY expected_roles.role
)
SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1
    FROM tenant_a_readiness
    WHERE ready_count = 0
  ),
  'tenant A must already have confirmed active owner/admin/manager/coach'
);

WITH expected_roles(role) AS (
  VALUES ('owner'), ('coach')
),
tenant_b_baseline AS (
  SELECT
    expected_roles.role,
    count(*) FILTER (
      WHERE membership.id IS NOT NULL
        AND membership.status = 'active'
        AND auth_user.email_confirmed_at IS NOT NULL
    ) AS ready_count
  FROM expected_roles
  LEFT JOIN public.organization_memberships membership
    ON membership.organization_id = (SELECT tenant_b_id FROM runtime_capacity_input LIMIT 1)
   AND membership.role = expected_roles.role
   AND membership.status = 'active'
  LEFT JOIN auth.users auth_user
    ON auth_user.id = membership.user_id
  GROUP BY expected_roles.role
)
SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1
    FROM tenant_b_baseline
    WHERE ready_count = 0
  ),
  'tenant B must already have confirmed active owner and coach'
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*)
    FROM public.centers center
    WHERE center.organization_id = (SELECT tenant_b_id FROM runtime_capacity_input LIMIT 1)
      AND center.status = 'active'
  ) >= 1,
  'tenant B must have at least one active center'
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*)
    FROM public.class_types class_type
    WHERE class_type.organization_id = (SELECT tenant_b_id FROM runtime_capacity_input LIMIT 1)
      AND class_type.status = 'active'
  ) >= 1,
  'tenant B must have at least one active class type'
);

WITH upserted_users AS (
  INSERT INTO auth.users (
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    created_at,
    updated_at,
    raw_app_meta_data,
    raw_user_meta_data,
    is_sso_user,
    is_anonymous
  )
  SELECT
    gen_random_uuid(),
    'authenticated',
    'authenticated',
    input.email,
    extensions.crypt(input.password, extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('name', input.display_name, 'boxopsSyntheticLocal', true),
    false,
    false
  FROM runtime_capacity_input input
  ON CONFLICT (email) WHERE is_sso_user = false
  DO UPDATE SET
    encrypted_password = EXCLUDED.encrypted_password,
    email_confirmed_at = COALESCE(auth.users.email_confirmed_at, now()),
    raw_app_meta_data = EXCLUDED.raw_app_meta_data,
    raw_user_meta_data = EXCLUDED.raw_user_meta_data,
    updated_at = now()
  RETURNING id, email, raw_user_meta_data
)
INSERT INTO auth.identities (
  provider_id,
  user_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
)
SELECT
  upserted_users.id::text,
  upserted_users.id,
  jsonb_build_object(
    'sub', upserted_users.id::text,
    'email', upserted_users.email,
    'email_verified', true,
    'phone_verified', false
  ),
  'email',
  NULL,
  now(),
  now()
FROM upserted_users
ON CONFLICT (provider_id, provider)
DO UPDATE SET
  identity_data = EXCLUDED.identity_data,
  updated_at = now();

INSERT INTO public.organization_memberships (
  organization_id,
  user_id,
  role,
  status,
  joined_at
)
SELECT
  input.tenant_b_id,
  auth_user.id,
  input.role,
  'active',
  now()
FROM runtime_capacity_input input
JOIN auth.users auth_user
  ON auth_user.email = input.email
ON CONFLICT (organization_id, user_id)
DO UPDATE SET
  role = EXCLUDED.role,
  status = 'active',
  joined_at = COALESCE(public.organization_memberships.joined_at, now()),
  updated_at = now();

INSERT INTO public.person_profiles (
  organization_id,
  user_id,
  full_name,
  display_name,
  preferred_alias,
  public_email,
  visibility_status,
  status,
  metadata
)
SELECT
  input.tenant_b_id,
  auth_user.id,
  input.display_name,
  input.display_name,
  NULL,
  NULL,
  'visible',
  'active',
  jsonb_build_object('syntheticLocalE2E', true, 'role', input.role)
FROM runtime_capacity_input input
JOIN auth.users auth_user
  ON auth_user.email = input.email
ON CONFLICT (organization_id, user_id) WHERE user_id IS NOT NULL
DO UPDATE SET
  full_name = EXCLUDED.full_name,
  display_name = EXCLUDED.display_name,
  visibility_status = 'visible',
  status = 'active',
  metadata = public.person_profiles.metadata || EXCLUDED.metadata,
  updated_at = now();

WITH expected_roles(role) AS (
  VALUES ('owner'), ('admin'), ('manager'), ('coach')
),
tenant_b_readiness AS (
  SELECT
    expected_roles.role,
    count(*) FILTER (
      WHERE membership.id IS NOT NULL
        AND membership.status = 'active'
        AND auth_user.email_confirmed_at IS NOT NULL
    ) AS ready_count
  FROM expected_roles
  LEFT JOIN public.organization_memberships membership
    ON membership.organization_id = (SELECT tenant_b_id FROM runtime_capacity_input LIMIT 1)
   AND membership.role = expected_roles.role
   AND membership.status = 'active'
  LEFT JOIN auth.users auth_user
    ON auth_user.id = membership.user_id
  GROUP BY expected_roles.role
)
SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1
    FROM tenant_b_readiness
    WHERE ready_count = 0
  ),
  'tenant B must have confirmed active owner/admin/manager/coach after setup'
);

WITH org_readiness AS (
  SELECT
    organization.id AS organization_id,
    right(organization.id::text, 6) AS organization_suffix,
    count(DISTINCT center.id) FILTER (WHERE center.status = 'active') AS active_centers,
    count(DISTINCT class_type.id) FILTER (WHERE class_type.status = 'active') AS active_class_types,
    count(DISTINCT membership.id) FILTER (
      WHERE membership.status = 'active'
        AND membership.role = 'owner'
        AND auth_user.email_confirmed_at IS NOT NULL
    ) AS owner_confirmed,
    count(DISTINCT membership.id) FILTER (
      WHERE membership.status = 'active'
        AND membership.role = 'admin'
        AND auth_user.email_confirmed_at IS NOT NULL
    ) AS admin_confirmed,
    count(DISTINCT membership.id) FILTER (
      WHERE membership.status = 'active'
        AND membership.role = 'manager'
        AND auth_user.email_confirmed_at IS NOT NULL
    ) AS manager_confirmed,
    count(DISTINCT membership.id) FILTER (
      WHERE membership.status = 'active'
        AND membership.role = 'coach'
        AND auth_user.email_confirmed_at IS NOT NULL
    ) AS coach_confirmed
  FROM public.organizations organization
  LEFT JOIN public.centers center
    ON center.organization_id = organization.id
  LEFT JOIN public.class_types class_type
    ON class_type.organization_id = organization.id
  LEFT JOIN public.organization_memberships membership
    ON membership.organization_id = organization.id
  LEFT JOIN auth.users auth_user
    ON auth_user.id = membership.user_id
  WHERE organization.id IN (
    (SELECT tenant_a_id FROM runtime_capacity_input LIMIT 1),
    (SELECT tenant_b_id FROM runtime_capacity_input LIMIT 1)
  )
  GROUP BY organization.id
)
SELECT jsonb_pretty(
  jsonb_agg(
    jsonb_build_object(
      'organization_suffix', organization_suffix,
      'active_centers', active_centers,
      'active_class_types', active_class_types,
      'owner_confirmed', owner_confirmed,
      'admin_confirmed', admin_confirmed,
      'manager_confirmed', manager_confirmed,
      'coach_confirmed', coach_confirmed
    )
    ORDER BY organization_suffix
  )
) AS redacted_local_runtime_capacity_summary
FROM org_readiness;

\if :commit_changes
COMMIT;
\echo 'COMMIT complete: synthetic local tenant B admin/manager capacity was persisted.'
\else
ROLLBACK;
\echo 'ROLLBACK complete: dry run only; no synthetic local tenant data was persisted.'
\endif
