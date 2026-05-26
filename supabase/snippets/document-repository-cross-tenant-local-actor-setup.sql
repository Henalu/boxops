-- BoxOps - E.25 local cross-tenant document route actor setup
--
-- Purpose:
--   Prepare exactly one temporary, synthetic local Auth actor that belongs to
--   one active/trialing tenant B and does not belong to tenant A. This exists
--   only to unblock the opt-in E.23/E.24 document preview/download backend
--   route smoke from a reproducible local procedure.
--
-- Scope:
--   - Local-only and opt-in guarded.
--   - Requires tenant A id, synthetic @boxops.local email and disposable
--     password through psql variables.
--   - Selects one active/trialing tenant B different from tenant A.
--   - Creates confirmed Auth user, email identity, active membership and a
--     minimal visible person profile in tenant B.
--   - Can clean up the same synthetic actor explicitly by email.
--
-- Safety:
--   - Do not use real emails, real names, production secrets, tokens, cookies,
--     DB URLs, signed URLs, Storage paths or document contents with this file.
--   - Do not write E2E_CROSS_TENANT_* to .env.local. Pass credentials only as
--     process variables for the smoke command that needs them.
--   - The default mode is a transaction rollback. Add commit_changes=1 only
--     for the short local window needed to run the smoke, then run cleanup.
--
-- Dry run example:
--   Get-Content -Raw supabase/snippets/document-repository-cross-tenant-local-actor-setup.sql |
--     docker exec -i supabase_db_boxops psql -U postgres -d postgres -v ON_ERROR_STOP=1 `
--       -v allow_local_synthetic_e2e_setup=local-only `
--       -v tenant_a_id=<tenant-a-uuid> `
--       -v synthetic_email=boxops-e25-cross-tenant@boxops.local `
--       -v synthetic_password=<local-disposable-password>
--
-- Persistent local setup:
--   Add -v commit_changes=1 to the same command only after the dry run passes.
--
-- Cleanup:
--   Re-run with the same guard/email/password/tenant_a_id plus:
--     -v cleanup_synthetic_actor=1 -v commit_changes=1

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

\if :{?synthetic_email}
\else
\echo 'Missing required psql variable: synthetic_email'
\quit 1
\endif

\if :{?synthetic_password}
\else
\echo 'Missing required psql variable: synthetic_password'
\quit 1
\endif

\if :{?commit_changes}
\else
\set commit_changes 0
\endif

\if :{?cleanup_synthetic_actor}
\else
\set cleanup_synthetic_actor 0
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
    RAISE EXCEPTION 'document repository cross-tenant local actor setup failed: %', label;
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

CREATE TEMP TABLE synthetic_actor_input (
  tenant_a_id uuid NOT NULL,
  email text NOT NULL,
  password text NOT NULL,
  role text NOT NULL,
  display_name text NOT NULL
) ON COMMIT DROP;

INSERT INTO synthetic_actor_input (
  tenant_a_id,
  email,
  password,
  role,
  display_name
)
VALUES (
  :'tenant_a_id'::uuid,
  pg_temp.assert_synthetic_email(:'synthetic_email', 'synthetic_email'),
  pg_temp.required_text(:'synthetic_password', 'synthetic_password'),
  'manager',
  'E25 Cross-Tenant Actor'
);

SELECT pg_temp.assert_true(
  :'allow_local_synthetic_e2e_setup' = 'local-only',
  'allow_local_synthetic_e2e_setup must be local-only'
);

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM public.organizations organization
    WHERE organization.id = (SELECT tenant_a_id FROM synthetic_actor_input)
      AND organization.status IN ('trialing', 'active')
  ),
  'tenant A must exist and be trialing or active'
);

CREATE TEMP TABLE target_synthetic_auth_users
ON COMMIT DROP
AS
SELECT auth_user.id, auth_user.email
FROM auth.users auth_user
WHERE lower(auth_user.email) = (SELECT email FROM synthetic_actor_input);

\if :cleanup_synthetic_actor
\else
SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1
    FROM public.organization_memberships membership
    INNER JOIN target_synthetic_auth_users target_user
      ON target_user.id = membership.user_id
    WHERE membership.organization_id = (SELECT tenant_a_id FROM synthetic_actor_input)
      AND membership.status = 'active'
  ),
  'synthetic email must not have an active membership in tenant A before setup'
);
\endif

CREATE TEMP TABLE synthetic_actor_cleanup_counts (
  relation_name text PRIMARY KEY,
  deleted_count integer NOT NULL
) ON COMMIT DROP;

WITH deleted_rows AS (
  DELETE FROM public.person_profiles person_profile
  USING target_synthetic_auth_users target_user
  WHERE person_profile.user_id = target_user.id
  RETURNING person_profile.id
)
INSERT INTO synthetic_actor_cleanup_counts (relation_name, deleted_count)
SELECT 'person_profiles', count(*)::integer
FROM deleted_rows;

WITH deleted_rows AS (
  DELETE FROM public.organization_memberships membership
  USING target_synthetic_auth_users target_user
  WHERE membership.user_id = target_user.id
  RETURNING membership.id
)
INSERT INTO synthetic_actor_cleanup_counts (relation_name, deleted_count)
SELECT 'organization_memberships', count(*)::integer
FROM deleted_rows;

WITH deleted_rows AS (
  DELETE FROM auth.identities identity
  USING target_synthetic_auth_users target_user
  WHERE identity.user_id = target_user.id
  RETURNING identity.id
)
INSERT INTO synthetic_actor_cleanup_counts (relation_name, deleted_count)
SELECT 'auth_identities', count(*)::integer
FROM deleted_rows;

WITH deleted_rows AS (
  DELETE FROM auth.users auth_user
  USING target_synthetic_auth_users target_user
  WHERE auth_user.id = target_user.id
  RETURNING auth_user.id
)
INSERT INTO synthetic_actor_cleanup_counts (relation_name, deleted_count)
SELECT 'auth_users', count(*)::integer
FROM deleted_rows;

\if :cleanup_synthetic_actor
SELECT jsonb_pretty(
  jsonb_build_object(
    'mode', 'cleanup',
    'synthetic_email', (SELECT email FROM synthetic_actor_input),
    'deleted_counts', (
      SELECT jsonb_object_agg(relation_name, deleted_count ORDER BY relation_name)
      FROM synthetic_actor_cleanup_counts
    ),
    'remaining_auth_users', (
      SELECT count(*)
      FROM auth.users auth_user
      WHERE lower(auth_user.email) = (SELECT email FROM synthetic_actor_input)
    )
  )
) AS redacted_local_cross_tenant_actor_cleanup;
\else
CREATE TEMP TABLE selected_tenant_b
ON COMMIT DROP
AS
SELECT
  organization.id,
  right(organization.id::text, 6) AS organization_suffix,
  organization.status
FROM public.organizations organization
WHERE organization.id <> (SELECT tenant_a_id FROM synthetic_actor_input)
  AND organization.status IN ('trialing', 'active')
ORDER BY
  CASE organization.status WHEN 'active' THEN 0 ELSE 1 END,
  organization.created_at,
  organization.id
LIMIT 1;

SELECT pg_temp.assert_true(
  (SELECT count(*) FROM selected_tenant_b) = 1,
  'exactly one tenant B candidate must be selected from active/trialing tenants'
);

WITH inserted_user AS (
  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change,
    is_super_admin,
    created_at,
    updated_at,
    email_change_token_current,
    email_change_confirm_status,
    reauthentication_token,
    raw_app_meta_data,
    raw_user_meta_data,
    is_sso_user,
    is_anonymous
  )
  SELECT
    '00000000-0000-0000-0000-000000000000'::uuid,
    gen_random_uuid(),
    'authenticated',
    'authenticated',
    input.email,
    extensions.crypt(input.password, extensions.gen_salt('bf')),
    now(),
    '',
    '',
    '',
    '',
    false,
    now(),
    now(),
    '',
    0,
    '',
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object(
      'name', input.display_name,
      'boxopsSyntheticLocal', true,
      'source', 'document-repository-cross-tenant-local-actor-setup'
    ),
    false,
    false
  FROM synthetic_actor_input input
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
  inserted_user.id::text,
  inserted_user.id,
  jsonb_build_object(
    'sub', inserted_user.id::text,
    'email', inserted_user.email,
    'email_verified', true,
    'phone_verified', false
  ),
  'email',
  NULL,
  now(),
  now()
FROM inserted_user;

INSERT INTO public.organization_memberships (
  organization_id,
  user_id,
  role,
  status,
  joined_at
)
SELECT
  selected_tenant_b.id,
  auth_user.id,
  input.role,
  'active',
  now()
FROM synthetic_actor_input input
CROSS JOIN selected_tenant_b
INNER JOIN auth.users auth_user
  ON lower(auth_user.email) = input.email;

INSERT INTO public.person_profiles (
  organization_id,
  user_id,
  full_name,
  display_name,
  visibility_status,
  status,
  metadata
)
SELECT
  selected_tenant_b.id,
  auth_user.id,
  input.display_name,
  input.display_name,
  'visible',
  'active',
  jsonb_build_object(
    'syntheticLocalE2E', true,
    'source', 'document-repository-cross-tenant-local-actor-setup',
    'role', input.role
  )
FROM synthetic_actor_input input
CROSS JOIN selected_tenant_b
INNER JOIN auth.users auth_user
  ON lower(auth_user.email) = input.email;

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM auth.users auth_user
    WHERE lower(auth_user.email) = (SELECT email FROM synthetic_actor_input)
      AND auth_user.email_confirmed_at IS NOT NULL
      AND auth_user.confirmed_at IS NOT NULL
  ),
  'synthetic Auth user must be confirmed'
);

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM auth.users auth_user
    INNER JOIN auth.identities identity
      ON identity.user_id = auth_user.id
     AND identity.provider = 'email'
    WHERE lower(auth_user.email) = (SELECT email FROM synthetic_actor_input)
  ),
  'synthetic Auth user must have an email identity'
);

SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1
    FROM public.organization_memberships membership
    INNER JOIN auth.users auth_user
      ON auth_user.id = membership.user_id
    WHERE lower(auth_user.email) = (SELECT email FROM synthetic_actor_input)
      AND membership.organization_id = (SELECT tenant_a_id FROM synthetic_actor_input)
      AND membership.status = 'active'
  ),
  'synthetic actor must not be active in tenant A after setup'
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 1
    FROM public.organization_memberships membership
    INNER JOIN auth.users auth_user
      ON auth_user.id = membership.user_id
    WHERE lower(auth_user.email) = (SELECT email FROM synthetic_actor_input)
      AND membership.organization_id = (SELECT id FROM selected_tenant_b)
      AND membership.status = 'active'
      AND membership.role = (SELECT role FROM synthetic_actor_input)
  ),
  'synthetic actor must have exactly one active membership in selected tenant B'
);

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM public.person_profiles person_profile
    INNER JOIN auth.users auth_user
      ON auth_user.id = person_profile.user_id
    WHERE lower(auth_user.email) = (SELECT email FROM synthetic_actor_input)
      AND person_profile.organization_id = (SELECT id FROM selected_tenant_b)
      AND person_profile.visibility_status = 'visible'
      AND person_profile.status = 'active'
  ),
  'synthetic actor must have a minimal visible active person profile in tenant B'
);

SELECT jsonb_pretty(
  jsonb_build_object(
    'mode', 'setup',
    'synthetic_email', (SELECT email FROM synthetic_actor_input),
    'tenant_b_suffix', (SELECT organization_suffix FROM selected_tenant_b),
    'tenant_b_status', (SELECT status FROM selected_tenant_b),
    'role', (SELECT role FROM synthetic_actor_input),
    'stale_cleanup_counts', (
      SELECT jsonb_object_agg(relation_name, deleted_count ORDER BY relation_name)
      FROM synthetic_actor_cleanup_counts
    )
  )
) AS redacted_local_cross_tenant_actor_setup;
\endif

\if :commit_changes
COMMIT;
\if :cleanup_synthetic_actor
\echo 'COMMIT complete: synthetic local cross-tenant actor cleanup was persisted.'
\else
\echo 'COMMIT complete: synthetic local cross-tenant actor was persisted.'
\endif
\else
ROLLBACK;
\echo 'ROLLBACK complete: dry run only; no synthetic local cross-tenant actor changes were persisted.'
\endif
