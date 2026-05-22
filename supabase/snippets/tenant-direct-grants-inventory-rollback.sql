-- BoxOps - S.74 tenant direct table grants inventory rollback
--
-- Run locally with:
--   Get-Content -Raw supabase/snippets/tenant-direct-grants-inventory-rollback.sql | docker exec -i supabase_db_boxops psql -U postgres -d postgres -v ON_ERROR_STOP=1
--
-- The script runs inside a transaction and rolls back. It inventories the
-- current direct table grants for anon/authenticated on public tenant-scoped
-- tables, compares them with RLS/policy posture from the catalog, and confirms
-- the known direct SQL TRUNCATE behavior discovered after S.73.
--
-- This intentionally does not revoke grants, create a migration, validate
-- /app runtime, Server Actions, POST direct behavior, browser behavior,
-- Storage, SMTP, staging, evidence from a real tenant, F.15 beta readiness,
-- legal compliance, or production hardening. It separates grant posture from
-- RLS behavior: RLS can still deny normal row-level DML while broad table
-- privileges such as TRUNCATE, REFERENCES or TRIGGER remain granted.

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
    RAISE EXCEPTION 'tenant direct grants inventory failed: %', label;
  END IF;

  RAISE NOTICE 'ok - %', label;
END;
$$;

CREATE TEMP TABLE s74_public_app_tables ON COMMIT DROP AS
SELECT
  c.oid AS table_oid,
  n.nspname AS schema_name,
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS force_rls,
  COALESCE(array_to_string(c.relacl, ' | '), '<NULL>') AS relacl,
  EXISTS (
    SELECT 1
    FROM information_schema.columns col
    WHERE col.table_schema = n.nspname
      AND col.table_name = c.relname
      AND col.column_name = 'organization_id'
  ) AS has_organization_id,
  (
    SELECT count(*)
    FROM pg_policy policy
    WHERE policy.polrelid = c.oid
  ) AS policy_count
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind IN ('r', 'p')
ORDER BY c.relname;

CREATE TEMP TABLE s74_role_table_privileges ON COMMIT DROP AS
SELECT
  r.role_name,
  t.schema_name,
  t.table_name,
  t.rls_enabled,
  t.force_rls,
  t.has_organization_id,
  t.policy_count,
  has_table_privilege(r.role_name, format('%I.%I', t.schema_name, t.table_name), 'SELECT') AS can_select,
  has_table_privilege(r.role_name, format('%I.%I', t.schema_name, t.table_name), 'INSERT') AS can_insert,
  has_table_privilege(r.role_name, format('%I.%I', t.schema_name, t.table_name), 'UPDATE') AS can_update,
  has_table_privilege(r.role_name, format('%I.%I', t.schema_name, t.table_name), 'DELETE') AS can_delete,
  has_table_privilege(r.role_name, format('%I.%I', t.schema_name, t.table_name), 'TRUNCATE') AS can_truncate,
  has_table_privilege(r.role_name, format('%I.%I', t.schema_name, t.table_name), 'REFERENCES') AS can_references,
  has_table_privilege(r.role_name, format('%I.%I', t.schema_name, t.table_name), 'TRIGGER') AS can_trigger,
  t.relacl
FROM s74_public_app_tables t
CROSS JOIN (VALUES ('anon'), ('authenticated')) AS r(role_name)
ORDER BY r.role_name, t.table_name;

CREATE TEMP TABLE s74_policy_inventory ON COMMIT DROP AS
SELECT
  schemaname,
  tablename AS table_name,
  policyname,
  cmd,
  roles,
  qual IS NOT NULL AS has_using,
  with_check IS NOT NULL AS has_with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

CREATE TEMP TABLE s74_default_acl_inventory ON COMMIT DROP AS
SELECT
  defaclrole::regrole::text AS owner_role,
  defaclnamespace::regnamespace::text AS schema_name,
  defaclobjtype AS object_type,
  defaclacl::text AS default_acl
FROM pg_default_acl
WHERE defaclnamespace::regnamespace::text = 'public'
  AND defaclobjtype = 'r'
ORDER BY owner_role, schema_name, object_type;

SELECT pg_temp.assert_true(
  (SELECT count(*) FROM s74_public_app_tables) = 40,
  'catalog inventory currently sees 40 public app tables'
);

SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1
    FROM s74_public_app_tables
    WHERE NOT rls_enabled
  ),
  'all public app tables still have RLS enabled'
);

SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1
    FROM s74_policy_inventory
    WHERE 'anon' = ANY (roles)
  ),
  'anon has no direct RLS policy role on public app tables'
);

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM s74_default_acl_inventory
    WHERE default_acl LIKE '%anon=arwdDxt%'
      AND default_acl LIKE '%authenticated=arwdDxt%'
  ),
  'public default table ACL currently grants broad table privileges to anon/authenticated'
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*)
    FROM s74_role_table_privileges
    WHERE role_name = 'anon'
      AND can_insert
      AND can_update
      AND can_delete
      AND can_truncate
      AND can_references
      AND can_trigger
  ) = 32,
  'anon currently has broad direct table privileges on 32 public app tables'
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*)
    FROM s74_role_table_privileges
    WHERE role_name = 'authenticated'
      AND (
        can_insert
        OR can_update
        OR can_delete
        OR can_truncate
        OR can_references
        OR can_trigger
      )
  ) = 30,
  'authenticated currently has at least one high-risk direct table privilege on 30 public app tables'
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*)
    FROM s74_role_table_privileges
    WHERE role_name = 'authenticated'
      AND can_truncate
  ) = 29,
  'authenticated currently has TRUNCATE on 29 public app tables'
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*)
    FROM s74_role_table_privileges
    WHERE role_name = 'authenticated'
      AND can_truncate
      AND table_name IN ('time_records', 'time_punches')
  ) = 2,
  'authenticated still has TRUNCATE on time_records and time_punches'
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*)
    FROM s74_role_table_privileges
    WHERE role_name = 'anon'
      AND can_truncate
      AND table_name IN ('time_records', 'time_punches')
  ) = 2,
  'anon also has TRUNCATE on time_records and time_punches'
);

SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1
    FROM s74_role_table_privileges
    WHERE role_name = 'authenticated'
      AND table_name IN (
        'absence_requests',
        'absence_request_periods',
        'absence_request_events',
        'document_access_events',
        'document_programming_links',
        'operational_audit_events',
        'operational_events',
        'overtime_candidates',
        'overtime_candidate_sources',
        'overtime_candidate_events'
      )
      AND (
        can_insert
        OR can_update
        OR can_delete
        OR can_truncate
        OR can_references
        OR can_trigger
      )
  ),
  'later sensitive tables remain reduced to SELECT for authenticated where expected'
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*)
    FROM s74_role_table_privileges
    WHERE role_name = 'anon'
      AND table_name IN (
        'absence_requests',
        'absence_request_periods',
        'absence_request_events'
      )
      AND can_truncate
  ) = 3,
  'absence tables are SELECT-only for authenticated but still broad for anon in the current local DB'
);

SELECT
  's74-default-acl' AS section,
  owner_role,
  schema_name,
  object_type,
  default_acl
FROM s74_default_acl_inventory;

SELECT
  's74-grant-summary' AS section,
  role_name,
  count(*) AS table_count,
  count(*) FILTER (WHERE can_select) AS select_count,
  count(*) FILTER (WHERE can_insert) AS insert_count,
  count(*) FILTER (WHERE can_update) AS update_count,
  count(*) FILTER (WHERE can_delete) AS delete_count,
  count(*) FILTER (WHERE can_truncate) AS truncate_count,
  count(*) FILTER (WHERE can_references) AS references_count,
  count(*) FILTER (WHERE can_trigger) AS trigger_count
FROM s74_role_table_privileges
GROUP BY role_name
ORDER BY role_name;

SELECT
  's74-high-risk-direct-grants' AS section,
  role_name,
  table_name,
  rls_enabled,
  policy_count,
  array_to_string(
    array_remove(ARRAY[
      CASE WHEN can_insert THEN 'INSERT' END,
      CASE WHEN can_update THEN 'UPDATE' END,
      CASE WHEN can_delete THEN 'DELETE' END,
      CASE WHEN can_truncate THEN 'TRUNCATE' END,
      CASE WHEN can_references THEN 'REFERENCES' END,
      CASE WHEN can_trigger THEN 'TRIGGER' END
    ], NULL),
    ','
  ) AS high_risk_direct_privileges,
  relacl
FROM s74_role_table_privileges
WHERE can_insert
   OR can_update
   OR can_delete
   OR can_truncate
   OR can_references
   OR can_trigger
ORDER BY role_name, table_name;

SELECT
  's74-rls-policy-summary' AS section,
  table_name,
  string_agg(cmd || ':' || array_to_string(roles, ','), ' | ' ORDER BY cmd, policyname) AS policies
FROM s74_policy_inventory
GROUP BY table_name
ORDER BY table_name;

-- Behavior probe for the direct SQL privilege, intentionally inside the
-- rollback transaction. TRUNCATE bypasses row-level policies; this is grant
-- posture, not normal RLS row visibility.
SET LOCAL ROLE authenticated;
TRUNCATE TABLE public.time_records CASCADE;
RESET ROLE;

SET LOCAL ROLE anon;
TRUNCATE TABLE public.time_records CASCADE;
RESET ROLE;

SELECT pg_temp.assert_true(
  true,
  'direct TRUNCATE probes for authenticated and anon succeeded inside rollback transaction'
);

ROLLBACK;
