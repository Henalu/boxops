-- BoxOps - S.100 tenant direct grants default privileges readiness rollback
--
-- Run locally against the disposable Supabase DB with an owner/operator role:
--   Get-Content -Raw supabase/snippets/tenant-direct-grants-default-privileges-readiness-rollback.sql | docker exec -e PGPASSWORD=postgres -i supabase_db_boxops psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -P pager=off
--
-- This inventories public default privileges owned by postgres and
-- supabase_admin, proves that future public objects would currently recreate
-- broad grants for anon/authenticated, then simulates the minimum table default
-- privilege revokes that mirror migration 00044. The transaction always rolls
-- back: no default privileges, objects, grants or migrations are persisted.
--
-- This does not reduce authenticated to SELECT/RPC, does not change current
-- table grants, does not touch migration 00044, and does not decide future
-- sequence/function default privilege policy.

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
    RAISE EXCEPTION 'tenant direct grants default privileges readiness failed: %', label;
  END IF;

  RAISE NOTICE 'ok - %', label;
END;
$$;

SELECT pg_temp.assert_true(
  current_user = 'supabase_admin',
  'run this readiness probe as supabase_admin locally so both postgres and supabase_admin owner defaults can be simulated'
);

CREATE TEMP TABLE s100_default_acl_raw ON COMMIT DROP AS
SELECT
  d.defaclrole::regrole::text AS owner_role,
  COALESCE(n.nspname, '<global>') AS schema_name,
  CASE d.defaclobjtype
    WHEN 'r' THEN 'tables'
    WHEN 'S' THEN 'sequences'
    WHEN 'f' THEN 'functions'
    ELSE d.defaclobjtype::text
  END AS object_type,
  COALESCE(d.defaclacl::text, '<NULL>') AS default_acl
FROM pg_default_acl d
LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace
WHERE (d.defaclnamespace = 0 OR n.nspname = 'public')
  AND d.defaclobjtype IN ('r', 'S', 'f')
ORDER BY owner_role, schema_name, object_type;

CREATE TEMP TABLE s100_default_acl_detail ON COMMIT DROP AS
SELECT
  d.defaclrole::regrole::text AS owner_role,
  COALESCE(n.nspname, '<global>') AS schema_name,
  CASE d.defaclobjtype
    WHEN 'r' THEN 'tables'
    WHEN 'S' THEN 'sequences'
    WHEN 'f' THEN 'functions'
    ELSE d.defaclobjtype::text
  END AS object_type,
  CASE WHEN x.grantor = 0 THEN 'PUBLIC' ELSE x.grantor::regrole::text END AS grantor,
  CASE WHEN x.grantee = 0 THEN 'PUBLIC' ELSE x.grantee::regrole::text END AS grantee,
  x.privilege_type,
  x.is_grantable
FROM pg_default_acl d
LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace
JOIN LATERAL aclexplode(d.defaclacl) AS x ON true
WHERE (d.defaclnamespace = 0 OR n.nspname = 'public')
  AND d.defaclobjtype IN ('r', 'S', 'f')
  AND (x.grantee = 0 OR x.grantee::regrole::text IN ('anon', 'authenticated'))
ORDER BY owner_role, schema_name, object_type, grantee, privilege_type;

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM s100_default_acl_raw
    WHERE owner_role = 'postgres'
      AND schema_name = 'public'
      AND object_type = 'tables'
      AND default_acl LIKE '%anon=arwdDxt%'
      AND default_acl LIKE '%authenticated=arwdDxt%'
  ),
  'postgres-owned public table defaults currently grant broad table privileges to anon/authenticated'
);

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM s100_default_acl_raw
    WHERE owner_role = 'supabase_admin'
      AND schema_name = 'public'
      AND object_type = 'tables'
      AND default_acl LIKE '%anon=arwdDxt%'
      AND default_acl LIKE '%authenticated=arwdDxt%'
  ),
  'supabase_admin-owned public table defaults currently grant broad table privileges to anon/authenticated'
);

SELECT
  's100-default-acl-raw-before' AS section,
  owner_role,
  schema_name,
  object_type,
  default_acl
FROM s100_default_acl_raw;

SELECT
  's100-default-acl-detail-before' AS section,
  owner_role,
  schema_name,
  object_type,
  grantor,
  grantee,
  privilege_type,
  is_grantable
FROM s100_default_acl_detail
WHERE grantee IN ('anon', 'authenticated', 'PUBLIC');

DROP FUNCTION IF EXISTS public.s100_acl_before_postgres_fn();
DROP FUNCTION IF EXISTS public.s100_acl_before_supabase_admin_fn();
DROP FUNCTION IF EXISTS public.s100_acl_after_postgres_fn();
DROP FUNCTION IF EXISTS public.s100_acl_after_supabase_admin_fn();
DROP SEQUENCE IF EXISTS public.s100_acl_before_postgres_seq;
DROP SEQUENCE IF EXISTS public.s100_acl_before_supabase_admin_seq;
DROP TABLE IF EXISTS public.s100_acl_before_postgres_table;
DROP TABLE IF EXISTS public.s100_acl_before_supabase_admin_table;
DROP TABLE IF EXISTS public.s100_acl_after_postgres_table;
DROP TABLE IF EXISTS public.s100_acl_after_supabase_admin_table;

SET LOCAL ROLE postgres;
CREATE TABLE public.s100_acl_before_postgres_table (id integer PRIMARY KEY);
CREATE SEQUENCE public.s100_acl_before_postgres_seq;
CREATE FUNCTION public.s100_acl_before_postgres_fn()
RETURNS integer
LANGUAGE sql
AS $fn$ SELECT 1; $fn$;
RESET ROLE;

CREATE TABLE public.s100_acl_before_supabase_admin_table (id integer PRIMARY KEY);
CREATE SEQUENCE public.s100_acl_before_supabase_admin_seq;
CREATE FUNCTION public.s100_acl_before_supabase_admin_fn()
RETURNS integer
LANGUAGE sql
AS $fn$ SELECT 1; $fn$;

CREATE TEMP TABLE s100_before_table_probe ON COMMIT DROP AS
SELECT
  t.owner_role,
  t.table_name,
  r.role_name,
  has_table_privilege(r.role_name, format('%I.%I', 'public', t.table_name), 'SELECT') AS can_select,
  has_table_privilege(r.role_name, format('%I.%I', 'public', t.table_name), 'INSERT') AS can_insert,
  has_table_privilege(r.role_name, format('%I.%I', 'public', t.table_name), 'UPDATE') AS can_update,
  has_table_privilege(r.role_name, format('%I.%I', 'public', t.table_name), 'DELETE') AS can_delete,
  has_table_privilege(r.role_name, format('%I.%I', 'public', t.table_name), 'TRUNCATE') AS can_truncate,
  has_table_privilege(r.role_name, format('%I.%I', 'public', t.table_name), 'REFERENCES') AS can_references,
  has_table_privilege(r.role_name, format('%I.%I', 'public', t.table_name), 'TRIGGER') AS can_trigger
FROM (
  VALUES
    ('postgres', 's100_acl_before_postgres_table'),
    ('supabase_admin', 's100_acl_before_supabase_admin_table')
) AS t(owner_role, table_name)
CROSS JOIN (VALUES ('anon'), ('authenticated')) AS r(role_name);

CREATE TEMP TABLE s100_before_sequence_probe ON COMMIT DROP AS
SELECT
  s.owner_role,
  s.sequence_name,
  r.role_name,
  has_sequence_privilege(r.role_name, format('%I.%I', 'public', s.sequence_name), 'USAGE') AS can_usage,
  has_sequence_privilege(r.role_name, format('%I.%I', 'public', s.sequence_name), 'SELECT') AS can_select,
  has_sequence_privilege(r.role_name, format('%I.%I', 'public', s.sequence_name), 'UPDATE') AS can_update
FROM (
  VALUES
    ('postgres', 's100_acl_before_postgres_seq'),
    ('supabase_admin', 's100_acl_before_supabase_admin_seq')
) AS s(owner_role, sequence_name)
CROSS JOIN (VALUES ('anon'), ('authenticated')) AS r(role_name);

CREATE TEMP TABLE s100_before_function_probe ON COMMIT DROP AS
SELECT
  f.owner_role,
  f.function_name,
  r.role_name,
  has_function_privilege(r.role_name, format('%I.%I()', 'public', f.function_name), 'EXECUTE') AS can_execute
FROM (
  VALUES
    ('postgres', 's100_acl_before_postgres_fn'),
    ('supabase_admin', 's100_acl_before_supabase_admin_fn')
) AS f(owner_role, function_name)
CROSS JOIN (VALUES ('anon'), ('authenticated')) AS r(role_name);

SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1
    FROM s100_before_table_probe
    WHERE NOT (
      can_select
      AND can_insert
      AND can_update
      AND can_delete
      AND can_truncate
      AND can_references
      AND can_trigger
    )
  ),
  'current table defaults recreate broad table grants for anon/authenticated on postgres and supabase_admin owned future tables'
);

SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1
    FROM s100_before_sequence_probe
    WHERE NOT (can_usage AND can_select AND can_update)
  ),
  'current sequence defaults recreate USAGE/SELECT/UPDATE for anon/authenticated on postgres and supabase_admin owned future sequences'
);

SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1
    FROM s100_before_function_probe
    WHERE NOT can_execute
  ),
  'current function defaults recreate EXECUTE for anon/authenticated on postgres and supabase_admin owned future functions'
);

SELECT
  's100-before-table-probe' AS section,
  *
FROM s100_before_table_probe
ORDER BY owner_role, table_name, role_name;

SELECT
  's100-before-sequence-probe' AS section,
  *
FROM s100_before_sequence_probe
ORDER BY owner_role, sequence_name, role_name;

SELECT
  's100-before-function-probe' AS section,
  *
FROM s100_before_function_probe
ORDER BY owner_role, function_name, role_name;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM authenticated;

SET LOCAL ROLE postgres;
CREATE TABLE public.s100_acl_after_postgres_table (id integer PRIMARY KEY);
RESET ROLE;

CREATE TABLE public.s100_acl_after_supabase_admin_table (id integer PRIMARY KEY);

CREATE TEMP TABLE s100_after_table_probe ON COMMIT DROP AS
SELECT
  t.owner_role,
  t.table_name,
  r.role_name,
  has_table_privilege(r.role_name, format('%I.%I', 'public', t.table_name), 'SELECT') AS can_select,
  has_table_privilege(r.role_name, format('%I.%I', 'public', t.table_name), 'INSERT') AS can_insert,
  has_table_privilege(r.role_name, format('%I.%I', 'public', t.table_name), 'UPDATE') AS can_update,
  has_table_privilege(r.role_name, format('%I.%I', 'public', t.table_name), 'DELETE') AS can_delete,
  has_table_privilege(r.role_name, format('%I.%I', 'public', t.table_name), 'TRUNCATE') AS can_truncate,
  has_table_privilege(r.role_name, format('%I.%I', 'public', t.table_name), 'REFERENCES') AS can_references,
  has_table_privilege(r.role_name, format('%I.%I', 'public', t.table_name), 'TRIGGER') AS can_trigger
FROM (
  VALUES
    ('postgres', 's100_acl_after_postgres_table'),
    ('supabase_admin', 's100_acl_after_supabase_admin_table')
) AS t(owner_role, table_name)
CROSS JOIN (VALUES ('anon'), ('authenticated')) AS r(role_name);

SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1
    FROM s100_after_table_probe
    WHERE role_name = 'anon'
      AND (
        can_select
        OR can_insert
        OR can_update
        OR can_delete
        OR can_truncate
        OR can_references
        OR can_trigger
      )
  ),
  'simulated default table privilege revokes remove all future direct table grants from anon'
);

SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1
    FROM s100_after_table_probe
    WHERE role_name = 'authenticated'
      AND (can_truncate OR can_references OR can_trigger)
  ),
  'simulated default table privilege revokes remove future TRUNCATE/REFERENCES/TRIGGER from authenticated'
);

SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1
    FROM s100_after_table_probe
    WHERE role_name = 'authenticated'
      AND NOT (can_select AND can_insert AND can_update AND can_delete)
  ),
  'simulated default table privilege revokes preserve future authenticated SELECT/INSERT/UPDATE/DELETE'
);

SELECT
  's100-after-table-probe' AS section,
  *
FROM s100_after_table_probe
ORDER BY owner_role, table_name, role_name;

SELECT
  's100-simulated-scope' AS section,
  *
FROM (
  VALUES
    (
      'tables',
      'Simulated changes mirror migration 00044 for future public tables owned by postgres or supabase_admin.'
    ),
    (
      'sequences',
      'Current sequence defaults still grant USAGE/SELECT/UPDATE to anon/authenticated; this snippet inventories but does not decide or simulate sequence policy.'
    ),
    (
      'functions',
      'Current function defaults still grant EXECUTE to anon/authenticated; this snippet inventories but does not decide or simulate function policy.'
    ),
    (
      'rollback',
      'All probe objects and ALTER DEFAULT PRIVILEGES changes are rolled back.'
    )
) AS notes(note_type, note);

ROLLBACK;
