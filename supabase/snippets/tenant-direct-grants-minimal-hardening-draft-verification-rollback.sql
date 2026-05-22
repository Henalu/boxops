-- BoxOps - S.77 tenant direct grants minimal hardening draft verification
--
-- Run locally with:
--   Get-Content -Raw supabase/snippets/tenant-direct-grants-minimal-hardening-draft-verification-rollback.sql | docker exec -i supabase_db_boxops psql -U postgres -d postgres -v ON_ERROR_STOP=1 -P pager=off
--
-- This verifies the S.77 draft only inside BEGIN/ROLLBACK. It does not apply a
-- migration, does not change real grants, does not update default privileges,
-- does not validate PostgREST/runtime app behavior, and does not reduce
-- authenticated INSERT/UPDATE/DELETE.

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
    RAISE EXCEPTION 'tenant direct grants minimal hardening draft verification failed: %', label;
  END IF;

  RAISE NOTICE 'ok - %', label;
END;
$$;

CREATE TEMP TABLE s77_public_app_tables ON COMMIT DROP AS
SELECT
  c.oid AS table_oid,
  n.nspname AS schema_name,
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  COALESCE(array_to_string(c.relacl, ' | '), '<NULL>') AS relacl
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind IN ('r', 'p')
ORDER BY c.relname;

CREATE TEMP TABLE s77_policy_inventory ON COMMIT DROP AS
SELECT
  schemaname,
  tablename AS table_name,
  policyname,
  cmd,
  roles
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

CREATE TEMP TABLE s77_required_authenticated_dml (
  table_name text NOT NULL,
  privilege_type text NOT NULL
) ON COMMIT DROP;

INSERT INTO s77_required_authenticated_dml (table_name, privilege_type)
VALUES
  ('centers', 'INSERT'),
  ('centers', 'UPDATE'),
  ('class_types', 'INSERT'),
  ('class_types', 'UPDATE'),
  ('coach_profiles', 'INSERT'),
  ('coach_profiles', 'UPDATE'),
  ('organization_memberships', 'INSERT'),
  ('organization_memberships', 'UPDATE'),
  ('organizations', 'UPDATE'),
  ('person_profiles', 'INSERT'),
  ('person_profiles', 'UPDATE'),
  ('schedule_block_assignments', 'INSERT'),
  ('schedule_block_assignments', 'UPDATE'),
  ('schedule_blocks', 'INSERT'),
  ('schedule_blocks', 'UPDATE'),
  ('schedule_blocks', 'DELETE'),
  ('schedule_template_blocks', 'INSERT'),
  ('schedule_template_blocks', 'UPDATE'),
  ('schedule_template_blocks', 'DELETE'),
  ('schedule_templates', 'INSERT'),
  ('schedule_templates', 'UPDATE'),
  ('staff_work_windows', 'INSERT'),
  ('staff_work_windows', 'UPDATE'),
  ('team_invitations', 'INSERT'),
  ('team_invitations', 'UPDATE'),
  ('time_exports', 'INSERT'),
  ('time_exports', 'UPDATE'),
  ('time_record_corrections', 'INSERT'),
  ('time_record_corrections', 'UPDATE');

SELECT pg_temp.assert_true(
  (SELECT count(*) FROM s77_public_app_tables) = 40,
  'catalog inventory currently sees 40 public app tables'
);

SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1
    FROM s77_public_app_tables
    WHERE NOT rls_enabled
  ),
  'all public app tables still have RLS enabled before the draft probe'
);

SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1
    FROM s77_policy_inventory
    WHERE 'anon' = ANY (roles)
  ),
  'anon still has no direct RLS policy role on public app tables'
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*)
    FROM s77_public_app_tables t
    WHERE has_table_privilege('anon', format('%I.%I', t.schema_name, t.table_name), 'TRUNCATE')
  ) = 32,
  'pre-probe local posture still has anon TRUNCATE on 32 public app tables'
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*)
    FROM s77_public_app_tables t
    WHERE has_table_privilege('authenticated', format('%I.%I', t.schema_name, t.table_name), 'TRUNCATE')
  ) = 29,
  'pre-probe local posture still has authenticated TRUNCATE on 29 public app tables'
);

-- Exact draft body from tenant-direct-grants-minimal-hardening-draft.sql.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM authenticated;

SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1
    FROM s77_public_app_tables t
    WHERE has_table_privilege('anon', format('%I.%I', t.schema_name, t.table_name), 'SELECT')
       OR has_table_privilege('anon', format('%I.%I', t.schema_name, t.table_name), 'INSERT')
       OR has_table_privilege('anon', format('%I.%I', t.schema_name, t.table_name), 'UPDATE')
       OR has_table_privilege('anon', format('%I.%I', t.schema_name, t.table_name), 'DELETE')
       OR has_table_privilege('anon', format('%I.%I', t.schema_name, t.table_name), 'TRUNCATE')
       OR has_table_privilege('anon', format('%I.%I', t.schema_name, t.table_name), 'REFERENCES')
       OR has_table_privilege('anon', format('%I.%I', t.schema_name, t.table_name), 'TRIGGER')
  ),
  'draft probe removes all direct table privileges from anon on current public app tables'
);

SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1
    FROM s77_public_app_tables t
    WHERE has_table_privilege('authenticated', format('%I.%I', t.schema_name, t.table_name), 'TRUNCATE')
       OR has_table_privilege('authenticated', format('%I.%I', t.schema_name, t.table_name), 'REFERENCES')
       OR has_table_privilege('authenticated', format('%I.%I', t.schema_name, t.table_name), 'TRIGGER')
  ),
  'draft probe removes TRUNCATE, REFERENCES and TRIGGER from authenticated'
);

SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1
    FROM s77_required_authenticated_dml dml
    WHERE NOT has_table_privilege(
      'authenticated',
      format('%I.%I', 'public', dml.table_name),
      dml.privilege_type
    )
  ),
  'draft probe preserves authenticated INSERT/UPDATE/DELETE required by observed current src direct DML'
);

SELECT pg_temp.assert_true(
  has_function_privilege(
    'anon',
    'public.get_team_invitation_public(uuid,text)',
    'EXECUTE'
  ),
  'draft probe keeps anon EXECUTE on public invitation preview RPC'
);

SELECT pg_temp.assert_true(
  has_function_privilege(
    'authenticated',
    'public.accept_team_invitation(uuid,text)',
    'EXECUTE'
  ),
  'draft probe keeps authenticated EXECUTE on invitation acceptance RPC'
);

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM pg_default_acl
    WHERE defaclnamespace::regnamespace::text = 'public'
      AND defaclobjtype = 'r'
      AND defaclrole::regrole::text = 'postgres'
      AND defaclacl::text LIKE '%anon=arwdDxt%'
      AND defaclacl::text LIKE '%authenticated=arwdDxt%'
  ),
  'draft probe intentionally leaves postgres-owned default table ACL as a separate step'
);

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM pg_default_acl
    WHERE defaclnamespace::regnamespace::text = 'public'
      AND defaclobjtype = 'r'
      AND defaclrole::regrole::text = 'supabase_admin'
      AND defaclacl::text LIKE '%anon=arwdDxt%'
      AND defaclacl::text LIKE '%authenticated=arwdDxt%'
  ),
  'draft probe intentionally leaves supabase_admin-owned default table ACL as a separate owner/operator step'
);

SELECT
  's77-draft-post-revoke-summary' AS section,
  r.role_name,
  count(*) FILTER (
    WHERE has_table_privilege(r.role_name, format('%I.%I', t.schema_name, t.table_name), 'SELECT')
  ) AS select_count,
  count(*) FILTER (
    WHERE has_table_privilege(r.role_name, format('%I.%I', t.schema_name, t.table_name), 'INSERT')
  ) AS insert_count,
  count(*) FILTER (
    WHERE has_table_privilege(r.role_name, format('%I.%I', t.schema_name, t.table_name), 'UPDATE')
  ) AS update_count,
  count(*) FILTER (
    WHERE has_table_privilege(r.role_name, format('%I.%I', t.schema_name, t.table_name), 'DELETE')
  ) AS delete_count,
  count(*) FILTER (
    WHERE has_table_privilege(r.role_name, format('%I.%I', t.schema_name, t.table_name), 'TRUNCATE')
  ) AS truncate_count,
  count(*) FILTER (
    WHERE has_table_privilege(r.role_name, format('%I.%I', t.schema_name, t.table_name), 'REFERENCES')
  ) AS references_count,
  count(*) FILTER (
    WHERE has_table_privilege(r.role_name, format('%I.%I', t.schema_name, t.table_name), 'TRIGGER')
  ) AS trigger_count
FROM s77_public_app_tables t
CROSS JOIN (VALUES ('anon'), ('authenticated')) AS r(role_name)
GROUP BY r.role_name
ORDER BY r.role_name;

SELECT
  's77-not-applied' AS section,
  *
FROM (
  VALUES
    (
      'draft-only',
      'S.77 creates a future migration draft and rollback verifier only; no real grants are changed.'
    ),
    (
      'authenticated-dml-preserved',
      'The draft intentionally does not revoke authenticated INSERT/UPDATE/DELETE because current src still uses direct DML through RLS.'
    ),
    (
      'default-privileges-separate',
      'Default table privileges for postgres and supabase_admin remain a separate owner/operator migration step.'
    ),
    (
      'runtime-still-required',
      'PostgREST, Server Actions, browser, staging, Storage/Auth/SMTP and beta readiness remain unvalidated by this rollback verifier.'
    )
) AS notes(note_type, note);

ROLLBACK;
