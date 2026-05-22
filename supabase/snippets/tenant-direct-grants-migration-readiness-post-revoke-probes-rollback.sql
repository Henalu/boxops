-- BoxOps - S.76 tenant direct grants migration readiness / post-revoke probes
--
-- Run locally with:
--   Get-Content -Raw supabase/snippets/tenant-direct-grants-migration-readiness-post-revoke-probes-rollback.sql | docker exec -i supabase_db_boxops psql -U postgres -d postgres -v ON_ERROR_STOP=1 -P pager=off
--
-- This is not a migration and does not harden the database persistently. It is
-- a rollback-only readiness review for a future minimal table-grant migration:
--
--   1. REVOKE ALL direct table privileges from anon on current public app tables;
--   2. REVOKE TRUNCATE, REFERENCES and TRIGGER from authenticated;
--   3. keep current authenticated SELECT/INSERT/UPDATE/DELETE where src still
--      uses direct DML through RLS;
--   4. keep SECURITY DEFINER RPC EXECUTE grants separate from table grants;
--   5. leave default privileges as a separate owner/operator migration item.
--
-- The probes intentionally do not validate PostgREST runtime, Server Actions,
-- browser behavior, Storage, Auth/SMTP, staging, F.15, legal compliance or beta
-- readiness. They separate:
--
--   - RLS behavior: row-level policies still decide normal row visibility/DML;
--   - direct SQL grant posture: table privileges such as TRUNCATE are separate;
--   - PostgREST/runtime app behavior: needs route/action smoke before applying;
--   - SECURITY DEFINER RPC behavior: function EXECUTE grants are probed apart.

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
    RAISE EXCEPTION 'tenant direct grants migration readiness failed: %', label;
  END IF;

  RAISE NOTICE 'ok - %', label;
END;
$$;

CREATE TEMP TABLE s76_public_app_tables ON COMMIT DROP AS
SELECT
  c.oid AS table_oid,
  n.nspname AS schema_name,
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS force_rls,
  COALESCE(array_to_string(c.relacl, ' | '), '<NULL>') AS relacl
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind IN ('r', 'p')
ORDER BY c.relname;

CREATE TEMP TABLE s76_role_table_grants ON COMMIT DROP AS
SELECT
  grantee,
  table_schema,
  table_name,
  privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee IN ('anon', 'authenticated')
ORDER BY grantee, table_name, privilege_type;

CREATE TEMP TABLE s76_policy_inventory ON COMMIT DROP AS
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

CREATE TEMP TABLE s76_default_acl_inventory ON COMMIT DROP AS
SELECT
  defaclrole::regrole::text AS owner_role,
  defaclnamespace::regnamespace::text AS schema_name,
  defaclobjtype AS object_type,
  defaclacl::text AS default_acl
FROM pg_default_acl
WHERE defaclnamespace::regnamespace::text = 'public'
  AND defaclobjtype = 'r'
ORDER BY owner_role, schema_name, object_type;

CREATE TEMP TABLE s76_current_privileges ON COMMIT DROP AS
SELECT
  r.role_name,
  t.schema_name,
  t.table_name,
  has_table_privilege(r.role_name, format('%I.%I', t.schema_name, t.table_name), 'SELECT') AS can_select,
  has_table_privilege(r.role_name, format('%I.%I', t.schema_name, t.table_name), 'INSERT') AS can_insert,
  has_table_privilege(r.role_name, format('%I.%I', t.schema_name, t.table_name), 'UPDATE') AS can_update,
  has_table_privilege(r.role_name, format('%I.%I', t.schema_name, t.table_name), 'DELETE') AS can_delete,
  has_table_privilege(r.role_name, format('%I.%I', t.schema_name, t.table_name), 'TRUNCATE') AS can_truncate,
  has_table_privilege(r.role_name, format('%I.%I', t.schema_name, t.table_name), 'REFERENCES') AS can_references,
  has_table_privilege(r.role_name, format('%I.%I', t.schema_name, t.table_name), 'TRIGGER') AS can_trigger
FROM s76_public_app_tables t
CROSS JOIN (VALUES ('anon'), ('authenticated')) AS r(role_name)
ORDER BY r.role_name, t.table_name;

CREATE TEMP TABLE s76_readiness_checklist (
  table_name text PRIMARY KEY,
  app_usage_group text NOT NULL,
  observed_auth_dml_ops text[] NOT NULL DEFAULT ARRAY[]::text[],
  minimum_revoke_readiness text NOT NULL,
  authenticated_dml_readiness text NOT NULL,
  rpc_runtime_readiness text NOT NULL,
  default_privileges_readiness text NOT NULL
) ON COMMIT DROP;

INSERT INTO s76_readiness_checklist (
  table_name,
  app_usage_group,
  observed_auth_dml_ops,
  minimum_revoke_readiness,
  authenticated_dml_readiness,
  rpc_runtime_readiness,
  default_privileges_readiness
)
VALUES
  ('absence_request_events', 'rpc-or-select-only', ARRAY[]::text[], 'probe anon table revoke plus authenticated TRUNCATE/REFERENCES/TRIGGER revoke', 'future: reduce authenticated to SELECT-only after absence runtime harness', 'mutations are SECURITY DEFINER RPC mediated; runtime smoke still required', 'separate default ACL owner/operator migration'),
  ('absence_request_periods', 'rpc-or-select-only', ARRAY[]::text[], 'probe anon table revoke plus authenticated TRUNCATE/REFERENCES/TRIGGER revoke', 'future: reduce authenticated to SELECT-only after absence runtime harness', 'mutations are SECURITY DEFINER RPC mediated; runtime smoke still required', 'separate default ACL owner/operator migration'),
  ('absence_requests', 'rpc-or-select-only', ARRAY[]::text[], 'probe anon table revoke plus authenticated TRUNCATE/REFERENCES/TRIGGER revoke', 'future: reduce authenticated to SELECT-only after absence runtime harness', 'mutations are SECURITY DEFINER RPC mediated; runtime smoke still required', 'separate default ACL owner/operator migration'),
  ('center_time_location_settings', 'rpc-or-select-only', ARRAY[]::text[], 'probe anon table revoke plus authenticated TRUNCATE/REFERENCES/TRIGGER revoke', 'future: reduce authenticated to SELECT-only after time-location runtime harness', 'RPC mediated; web location remains inactive', 'separate default ACL owner/operator migration'),
  ('centers', 'direct-dml-current', ARRAY['INSERT','UPDATE']::text[], 'probably safe for minimal revoke only', 'not safe to revoke authenticated INSERT/UPDATE yet', 'not RPC-only today; PostgREST/action runtime smoke required before applying', 'separate default ACL owner/operator migration'),
  ('change_request_events', 'rpc-or-select-only', ARRAY[]::text[], 'probe anon table revoke plus authenticated TRUNCATE/REFERENCES/TRIGGER revoke', 'future: reduce authenticated to SELECT-only after change-request runtime harness', 'mutations are SECURITY DEFINER RPC mediated; runtime smoke still required', 'separate default ACL owner/operator migration'),
  ('change_request_targets', 'rpc-or-select-only', ARRAY[]::text[], 'probe anon table revoke plus authenticated TRUNCATE/REFERENCES/TRIGGER revoke', 'future: reduce authenticated to SELECT-only after change-request runtime harness', 'mutations are SECURITY DEFINER RPC mediated; runtime smoke still required', 'separate default ACL owner/operator migration'),
  ('change_requests', 'rpc-or-select-only', ARRAY[]::text[], 'probe anon table revoke plus authenticated TRUNCATE/REFERENCES/TRIGGER revoke', 'future: reduce authenticated to SELECT-only after change-request runtime harness', 'mutations are SECURITY DEFINER RPC mediated; runtime smoke still required', 'separate default ACL owner/operator migration'),
  ('class_types', 'direct-dml-current', ARRAY['INSERT','UPDATE']::text[], 'probably safe for minimal revoke only', 'not safe to revoke authenticated INSERT/UPDATE yet', 'mixed direct DML plus sync RPC; runtime smoke required before applying', 'separate default ACL owner/operator migration'),
  ('coach_center_assignments', 'legacy-confirm-first', ARRAY[]::text[], 'probably safe for minimal revoke only after confirming legacy use', 'confirm unused/legacy status before reducing authenticated DML', 'no current src use observed; still not runtime proof', 'separate default ACL owner/operator migration'),
  ('coach_profiles', 'direct-dml-current', ARRAY['INSERT','UPDATE']::text[], 'probably safe for minimal revoke only', 'not safe to revoke authenticated INSERT/UPDATE yet', 'not RPC-only today; PostgREST/action runtime smoke required before applying', 'separate default ACL owner/operator migration'),
  ('document_access_events', 'rpc-or-select-only', ARRAY[]::text[], 'probe anon table revoke plus authenticated TRUNCATE/REFERENCES/TRIGGER revoke', 'future: keep/reduce to SELECT-only after document audit runtime harness', 'record/list RPCs remain the behavior boundary', 'separate default ACL owner/operator migration'),
  ('document_access_grants', 'document-metadata-decision', ARRAY[]::text[], 'probably safe for minimal revoke only', 'do not reduce authenticated metadata DML until document/grants management is designed', 'not a visible grants UI today; management decision required', 'separate default ACL owner/operator migration'),
  ('document_programming_links', 'rpc-or-select-only', ARRAY[]::text[], 'probe anon table revoke plus authenticated TRUNCATE/REFERENCES/TRIGGER revoke', 'future: keep/reduce to SELECT-only after programming-document runtime harness', 'link management is SECURITY DEFINER RPC mediated', 'separate default ACL owner/operator migration'),
  ('document_subjects', 'document-metadata-decision', ARRAY[]::text[], 'probably safe for minimal revoke only', 'do not reduce authenticated metadata DML until document subject management is designed', 'not visible subject management today; management decision required', 'separate default ACL owner/operator migration'),
  ('document_versions', 'document-metadata-decision', ARRAY[]::text[], 'probably safe for minimal revoke only', 'future upload lifecycle hardening must stay separate from repository runtime validation', 'begin/activate/cancel RPCs are the upload boundary', 'separate default ACL owner/operator migration'),
  ('documents', 'document-metadata-decision', ARRAY[]::text[], 'probably safe for minimal revoke only', 'do not reduce authenticated metadata DML until document management is designed', 'repository lists through RPC; management decision required', 'separate default ACL owner/operator migration'),
  ('operational_audit_events', 'rpc-or-select-only', ARRAY[]::text[], 'probe anon table revoke plus authenticated TRUNCATE/REFERENCES/TRIGGER revoke', 'future: keep/reduce to SELECT-only after audit runtime harness', 'record/list RPCs remain the behavior boundary', 'separate default ACL owner/operator migration'),
  ('operational_events', 'rpc-or-select-only', ARRAY[]::text[], 'probe anon table revoke plus authenticated TRUNCATE/REFERENCES/TRIGGER revoke', 'future: keep/reduce to SELECT-only after operational-events runtime harness', 'mutations are SECURITY DEFINER RPC mediated', 'separate default ACL owner/operator migration'),
  ('organization_memberships', 'direct-dml-current', ARRAY['INSERT','UPDATE']::text[], 'probably safe for minimal revoke only', 'not safe to revoke authenticated INSERT/UPDATE yet', 'team access still uses direct DML plus invitation RPCs', 'separate default ACL owner/operator migration'),
  ('organizations', 'direct-dml-current', ARRAY['UPDATE']::text[], 'probably safe for minimal revoke only', 'not safe to revoke authenticated UPDATE yet', 'settings runtime still uses direct DML', 'separate default ACL owner/operator migration'),
  ('overtime_candidate_events', 'rpc-or-select-only', ARRAY[]::text[], 'probe anon table revoke plus authenticated TRUNCATE/REFERENCES/TRIGGER revoke', 'future: reduce authenticated to SELECT-only after overtime runtime harness', 'mutations are SECURITY DEFINER RPC mediated', 'separate default ACL owner/operator migration'),
  ('overtime_candidate_sources', 'rpc-or-select-only', ARRAY[]::text[], 'probe anon table revoke plus authenticated TRUNCATE/REFERENCES/TRIGGER revoke', 'future: reduce authenticated to SELECT-only after overtime runtime harness', 'mutations are SECURITY DEFINER RPC mediated', 'separate default ACL owner/operator migration'),
  ('overtime_candidates', 'rpc-or-select-only', ARRAY[]::text[], 'probe anon table revoke plus authenticated TRUNCATE/REFERENCES/TRIGGER revoke', 'future: reduce authenticated to SELECT-only after overtime runtime harness', 'mutations are SECURITY DEFINER RPC mediated', 'separate default ACL owner/operator migration'),
  ('person_profiles', 'direct-dml-current', ARRAY['INSERT','UPDATE']::text[], 'probably safe for minimal revoke only', 'not safe to revoke authenticated INSERT/UPDATE yet', 'account/team runtime still uses direct DML', 'separate default ACL owner/operator migration'),
  ('profile_assets', 'rpc-or-select-only', ARRAY[]::text[], 'probe anon table revoke plus authenticated TRUNCATE/REFERENCES/TRIGGER revoke', 'future: reduce authenticated to SELECT-only after avatar runtime harness', 'own-avatar lifecycle is RPC/Storage mediated', 'separate default ACL owner/operator migration'),
  ('profile_signatures', 'rpc-or-select-only', ARRAY[]::text[], 'probe anon table revoke plus authenticated TRUNCATE/REFERENCES/TRIGGER revoke', 'future: reduce authenticated to SELECT-only after signature runtime harness', 'own-signature lifecycle is RPC/Storage mediated', 'separate default ACL owner/operator migration'),
  ('schedule_block_assignments', 'direct-dml-current', ARRAY['INSERT','UPDATE']::text[], 'probably safe for minimal revoke only', 'not safe to revoke authenticated INSERT/UPDATE yet', 'schedule/coverage/templates still use direct DML', 'separate default ACL owner/operator migration'),
  ('schedule_blocks', 'direct-dml-current', ARRAY['INSERT','UPDATE','DELETE']::text[], 'probably safe for minimal revoke only', 'not safe to revoke authenticated INSERT/UPDATE/DELETE yet', 'schedule/coverage/templates still use direct DML/upsert/delete', 'separate default ACL owner/operator migration'),
  ('schedule_template_blocks', 'direct-dml-current', ARRAY['INSERT','UPDATE','DELETE']::text[], 'probably safe for minimal revoke only', 'not safe to revoke authenticated INSERT/UPDATE/DELETE yet', 'templates still use direct DML/delete', 'separate default ACL owner/operator migration'),
  ('schedule_templates', 'direct-dml-current', ARRAY['INSERT','UPDATE']::text[], 'probably safe for minimal revoke only', 'not safe to revoke authenticated INSERT/UPDATE yet', 'templates still use direct DML', 'separate default ACL owner/operator migration'),
  ('staff_work_windows', 'direct-dml-current', ARRAY['INSERT','UPDATE']::text[], 'probably safe for minimal revoke only', 'not safe to revoke authenticated INSERT/UPDATE yet', 'schedule staff windows still use direct DML', 'separate default ACL owner/operator migration'),
  ('team_invitations', 'direct-dml-current', ARRAY['INSERT','UPDATE']::text[], 'probably safe for minimal revoke only', 'not safe to revoke authenticated INSERT/UPDATE yet', 'direct DML plus public/accept invitation RPCs', 'separate default ACL owner/operator migration'),
  ('time_audit_events', 'rpc-or-select-only', ARRAY[]::text[], 'probe anon table revoke plus authenticated TRUNCATE/REFERENCES/TRIGGER revoke', 'future: reduce authenticated to SELECT-only after time runtime harness', 'audit is trigger/RPC mediated', 'separate default ACL owner/operator migration'),
  ('time_exports', 'direct-dml-current', ARRAY['INSERT','UPDATE']::text[], 'probably safe for minimal revoke only', 'not safe to revoke authenticated INSERT/UPDATE yet', 'CSV export metadata still uses direct DML', 'separate default ACL owner/operator migration'),
  ('time_location_events', 'rpc-or-select-only', ARRAY[]::text[], 'probe anon table revoke plus authenticated TRUNCATE/REFERENCES/TRIGGER revoke', 'future: reduce authenticated to SELECT-only after time-location runtime harness', 'RPC mediated; web location remains inactive', 'separate default ACL owner/operator migration'),
  ('time_punches', 'rpc-or-select-only', ARRAY[]::text[], 'probe anon table revoke plus authenticated TRUNCATE/REFERENCES/TRIGGER revoke', 'future: reduce authenticated after F.15/runtime harness; keep SELECT until then', 'punch writes are RPC mediated; export reads directly', 'separate default ACL owner/operator migration'),
  ('time_record_corrections', 'direct-dml-current', ARRAY['INSERT','UPDATE']::text[], 'probably safe for minimal revoke only', 'not safe to revoke authenticated INSERT/UPDATE yet', 'correction request/review still uses direct DML', 'separate default ACL owner/operator migration'),
  ('time_records', 'rpc-or-select-only', ARRAY[]::text[], 'probe anon table revoke plus authenticated TRUNCATE/REFERENCES/TRIGGER revoke', 'future: reduce authenticated after F.15/runtime harness; keep SELECT until then', 'record writes are RPC mediated; export/corrections read directly', 'separate default ACL owner/operator migration'),
  ('time_weekly_approvals', 'rpc-or-select-only', ARRAY[]::text[], 'probe anon table revoke plus authenticated TRUNCATE/REFERENCES/TRIGGER revoke', 'future: reduce authenticated after F.15/runtime harness; keep SELECT until then', 'weekly closure writes are SECURITY DEFINER RPC mediated', 'separate default ACL owner/operator migration');

SELECT pg_temp.assert_true(
  (SELECT count(*) FROM s76_public_app_tables) = 40,
  'catalog inventory currently sees 40 public app tables'
);

SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1
    FROM s76_public_app_tables
    WHERE NOT rls_enabled
  ),
  'all public app tables still have RLS enabled'
);

SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1
    FROM s76_policy_inventory
    WHERE 'anon' = ANY (roles)
  ),
  'anon still has no direct RLS policy role on public app tables'
);

SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1
    FROM s76_public_app_tables t
    LEFT JOIN s76_readiness_checklist c ON c.table_name = t.table_name
    WHERE c.table_name IS NULL
  ),
  'all current public app tables have an S.76 readiness checklist row'
);

SELECT pg_temp.assert_true(
  (SELECT count(*) FROM s76_readiness_checklist WHERE app_usage_group = 'direct-dml-current') = 14,
  '14 tables remain unsafe for authenticated DML revokes because src uses direct DML today'
);

SELECT pg_temp.assert_true(
  (SELECT count(*) FROM s76_readiness_checklist WHERE app_usage_group = 'rpc-or-select-only') = 21,
  '21 tables are RPC-mediated or SELECT-only candidates for future table-by-table reduction'
);

SELECT pg_temp.assert_true(
  (SELECT count(*) FROM s76_readiness_checklist WHERE app_usage_group = 'document-metadata-decision') = 4,
  '4 document metadata tables require a separate management/grants decision'
);

SELECT pg_temp.assert_true(
  (SELECT count(*) FROM s76_readiness_checklist WHERE app_usage_group = 'legacy-confirm-first') = 1,
  '1 legacy table requires confirmation before authenticated DML reduction'
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*)
    FROM s76_current_privileges
    WHERE role_name = 'anon'
      AND can_insert
      AND can_update
      AND can_delete
      AND can_truncate
      AND can_references
      AND can_trigger
  ) = 32,
  'current local posture still gives anon broad direct table privileges on 32 public app tables'
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*)
    FROM s76_current_privileges
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
  'current local posture still gives authenticated at least one risky direct table privilege on 30 public app tables'
);

SELECT
  's76-readiness-checklist' AS section,
  c.table_name,
  c.app_usage_group,
  array_to_string(c.observed_auth_dml_ops, ',') AS observed_auth_dml_ops,
  c.minimum_revoke_readiness,
  c.authenticated_dml_readiness,
  c.rpc_runtime_readiness,
  c.default_privileges_readiness
FROM s76_readiness_checklist c
ORDER BY c.app_usage_group, c.table_name;

SELECT
  's76-current-grant-summary' AS section,
  role_name,
  count(*) AS table_count,
  count(*) FILTER (WHERE can_select) AS select_count,
  count(*) FILTER (WHERE can_insert) AS insert_count,
  count(*) FILTER (WHERE can_update) AS update_count,
  count(*) FILTER (WHERE can_delete) AS delete_count,
  count(*) FILTER (WHERE can_truncate) AS truncate_count,
  count(*) FILTER (WHERE can_references) AS references_count,
  count(*) FILTER (WHERE can_trigger) AS trigger_count
FROM s76_current_privileges
GROUP BY role_name
ORDER BY role_name;

SELECT
  's76-default-acl-readiness' AS section,
  owner_role,
  schema_name,
  object_type,
  default_acl,
  CASE
    WHEN owner_role = 'supabase_admin' THEN 'separate owner/operator step; do not claim local pass from postgres session'
    WHEN owner_role = 'postgres' THEN 'separate migration-owner step; not part of minimal table-grant probe'
    ELSE 'review owner before future migration'
  END AS readiness_note
FROM s76_default_acl_inventory
ORDER BY owner_role;

-- Minimal future migration candidate, executed only inside this rollback.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM authenticated;

SELECT pg_temp.assert_true(
  true,
  'minimal table revokes executed inside rollback'
);

SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1
    FROM s76_public_app_tables t
    WHERE has_table_privilege('anon', format('%I.%I', t.schema_name, t.table_name), 'SELECT')
       OR has_table_privilege('anon', format('%I.%I', t.schema_name, t.table_name), 'INSERT')
       OR has_table_privilege('anon', format('%I.%I', t.schema_name, t.table_name), 'UPDATE')
       OR has_table_privilege('anon', format('%I.%I', t.schema_name, t.table_name), 'DELETE')
       OR has_table_privilege('anon', format('%I.%I', t.schema_name, t.table_name), 'TRUNCATE')
       OR has_table_privilege('anon', format('%I.%I', t.schema_name, t.table_name), 'REFERENCES')
       OR has_table_privilege('anon', format('%I.%I', t.schema_name, t.table_name), 'TRIGGER')
  ),
  'post-revoke probe: anon has no direct table privileges on current public app tables'
);

SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1
    FROM s76_public_app_tables t
    WHERE has_table_privilege('authenticated', format('%I.%I', t.schema_name, t.table_name), 'TRUNCATE')
       OR has_table_privilege('authenticated', format('%I.%I', t.schema_name, t.table_name), 'REFERENCES')
       OR has_table_privilege('authenticated', format('%I.%I', t.schema_name, t.table_name), 'TRIGGER')
  ),
  'post-revoke probe: authenticated has no TRUNCATE, REFERENCES or TRIGGER on current public app tables'
);

SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1
    FROM s76_readiness_checklist c
    CROSS JOIN LATERAL unnest(c.observed_auth_dml_ops) AS required(required_op)
    WHERE NOT has_table_privilege(
      'authenticated',
      format('%I.%I', 'public', c.table_name),
      required.required_op
    )
  ),
  'post-revoke probe: observed authenticated direct DML operations from src still have table privilege'
);

SELECT pg_temp.assert_true(
  has_function_privilege(
    'anon',
    'public.get_team_invitation_public(uuid,text)',
    'EXECUTE'
  ),
  'post-revoke probe: anon still has EXECUTE on public invitation preview RPC'
);

SELECT pg_temp.assert_true(
  has_function_privilege(
    'authenticated',
    'public.accept_team_invitation(uuid,text)',
    'EXECUTE'
  ),
  'post-revoke probe: authenticated still has EXECUTE on invitation acceptance RPC'
);

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM s76_default_acl_inventory
    WHERE owner_role = 'supabase_admin'
      AND default_acl LIKE '%anon=arwdDxt%'
      AND default_acl LIKE '%authenticated=arwdDxt%'
  ),
  'default privileges remain separate: supabase_admin-owned table ACL cannot be closed by this postgres-session probe'
);

SELECT
  's76-post-revoke-probe-summary' AS section,
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
FROM s76_public_app_tables t
CROSS JOIN (VALUES ('anon'), ('authenticated')) AS r(role_name)
GROUP BY r.role_name
ORDER BY r.role_name;

SELECT
  's76-not-a-migration' AS section,
  *
FROM (
  VALUES
    (
      'minimal-revokes-ready-for-draft-only',
      'The rollback probes support drafting a future minimal migration for anon table revokes and authenticated TRUNCATE/REFERENCES/TRIGGER revokes, not applying it here.'
    ),
    (
      'authenticated-dml-not-ready',
      'Authenticated INSERT/UPDATE/DELETE revokes remain unsafe on the 14 current direct-DML tables until runtime/action harness proves replacements.'
    ),
    (
      'rpc-select-only-future',
      'RPC-only or SELECT-only tables can be reduced further only table by table with runtime/RPC/PostgREST evidence.'
    ),
    (
      'default-privileges-separate',
      'postgres and supabase_admin default table privileges need a separate owner/operator migration plan; this snippet only reports that readiness gap.'
    )
) AS decisions(decision_type, decision);

ROLLBACK;
