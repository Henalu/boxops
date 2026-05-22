-- BoxOps - S.75 tenant direct grants hardening impact analysis rollback
--
-- Run locally with:
--   Get-Content -Raw supabase/snippets/tenant-direct-grants-hardening-impact-analysis-rollback.sql | docker exec -i supabase_db_boxops psql -U postgres -d postgres -v ON_ERROR_STOP=1
--
-- This is not a hardening migration. It classifies current direct table grants
-- by blast radius, contrasts them with observed src DML/RPC usage, and simulates
-- a minimal candidate inside a rollback transaction:
--
--   1. revoke all direct table privileges from anon on public app tables;
--   2. revoke TRUNCATE, REFERENCES and TRIGGER from authenticated;
--   3. revoke future default table privileges for anon/authenticated;
--   4. keep authenticated SELECT/INSERT/UPDATE/DELETE where current src still
--      uses direct DML through RLS.
--
-- The simulation intentionally does not validate PostgREST runtime, Server
-- Actions, browser behavior, Storage, SMTP, staging, F.15, legal compliance, or
-- production hardening. It separates direct SQL grant posture from RLS behavior,
-- PostgREST/app runtime behavior, and SECURITY DEFINER RPC behavior.

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
    RAISE EXCEPTION 'tenant direct grants hardening impact analysis failed: %', label;
  END IF;

  RAISE NOTICE 'ok - %', label;
END;
$$;

CREATE TEMP TABLE s75_public_app_tables ON COMMIT DROP AS
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

CREATE TEMP TABLE s75_current_privileges ON COMMIT DROP AS
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
FROM s75_public_app_tables t
CROSS JOIN (VALUES ('anon'), ('authenticated')) AS r(role_name)
ORDER BY r.role_name, t.table_name;

CREATE TEMP TABLE s75_table_classification (
  table_name text PRIMARY KEY,
  candidate_group text NOT NULL,
  src_dml_ops text[] NOT NULL DEFAULT ARRAY[]::text[],
  src_usage_evidence text NOT NULL,
  auth_posture_plan text NOT NULL,
  anon_posture_plan text NOT NULL,
  default_privileges_plan text NOT NULL
) ON COMMIT DROP;

INSERT INTO s75_table_classification (
  table_name,
  candidate_group,
  src_dml_ops,
  src_usage_evidence,
  auth_posture_plan,
  anon_posture_plan,
  default_privileges_plan
)
VALUES
  ('absence_request_events', 'rpc-or-select-only', ARRAY[]::text[], 'absence mutations use RPC/internal events; src has no direct DML', 'authenticated already SELECT-only locally; keep that floor', 'revoke anon table grants after runtime smoke', 'future default ACL fix in separate migration'),
  ('absence_request_periods', 'rpc-or-select-only', ARRAY[]::text[], 'absence periods are created through absence RPCs; src has no direct DML', 'authenticated already SELECT-only locally; keep that floor', 'revoke anon table grants after runtime smoke', 'future default ACL fix in separate migration'),
  ('absence_requests', 'rpc-or-select-only', ARRAY[]::text[], 'absence workflow uses create/review/cancel/expire RPCs; src has no direct DML', 'authenticated already SELECT-only locally; keep that floor', 'revoke anon table grants after runtime smoke', 'future default ACL fix in separate migration'),
  ('center_time_location_settings', 'rpc-or-select-only', ARRAY[]::text[], 'time-location writes use upsert/status RPCs; web location remains inactive', 'candidate to reduce authenticated to SELECT after dedicated runtime check', 'revoke anon table grants after runtime smoke', 'future default ACL fix in separate migration'),
  ('centers', 'direct-dml-runtime', ARRAY['INSERT','UPDATE']::text[], 'src/app/(app)/app/centers/actions.ts uses direct insert/update through RLS', 'do not revoke authenticated INSERT/UPDATE yet; only TRUNCATE/REFERENCES/TRIGGER are low-risk candidates', 'revoke anon table grants after runtime smoke', 'future default ACL fix in separate migration'),
  ('change_request_events', 'rpc-or-select-only', ARRAY[]::text[], 'change workflow writes through SECURITY DEFINER RPCs; src has no direct table DML', 'candidate to reduce authenticated to SELECT after change-request runtime check', 'revoke anon table grants after runtime smoke', 'future default ACL fix in separate migration'),
  ('change_request_targets', 'rpc-or-select-only', ARRAY[]::text[], 'change workflow writes through SECURITY DEFINER RPCs; src has no direct table DML', 'candidate to reduce authenticated to SELECT after change-request runtime check', 'revoke anon table grants after runtime smoke', 'future default ACL fix in separate migration'),
  ('change_requests', 'rpc-or-select-only', ARRAY[]::text[], 'change workflow writes through SECURITY DEFINER RPCs; src has no direct table DML', 'candidate to reduce authenticated to SELECT after change-request runtime check', 'revoke anon table grants after runtime smoke', 'future default ACL fix in separate migration'),
  ('class_types', 'direct-dml-runtime', ARRAY['INSERT','UPDATE']::text[], 'src creates class types directly and still updates status directly; default sync edit uses RPC', 'do not revoke authenticated INSERT/UPDATE yet; only TRUNCATE/REFERENCES/TRIGGER are low-risk candidates', 'revoke anon table grants after runtime smoke', 'future default ACL fix in separate migration'),
  ('coach_center_assignments', 'unused-or-legacy-direct-table', ARRAY[]::text[], 'no current src DML hit found; legacy MVP table still has broad policies/grants', 'candidate to reduce authenticated after confirming no runtime or migration dependency', 'revoke anon table grants after runtime smoke', 'future default ACL fix in separate migration'),
  ('coach_profiles', 'direct-dml-runtime', ARRAY['INSERT','UPDATE']::text[], 'src/app/(app)/app/coaches/actions.ts uses direct insert/update through RLS', 'do not revoke authenticated INSERT/UPDATE yet; only TRUNCATE/REFERENCES/TRIGGER are low-risk candidates', 'revoke anon table grants after runtime smoke', 'future default ACL fix in separate migration'),
  ('document_access_events', 'rpc-or-select-only', ARRAY[]::text[], 'document audit writes through record_document_access_event RPC; direct reads are capability gated', 'authenticated already SELECT-only locally; keep that floor', 'no anon table grants currently expected; keep none', 'future default ACL fix in separate migration'),
  ('document_access_grants', 'document-metadata-future-manage', ARRAY[]::text[], 'current visible app has no grants UI/direct DML; migration originally allowed metadata management by RLS', 'candidate only after document-management decision; do not mix with runtime repo validation', 'revoke anon table grants after runtime smoke', 'future default ACL fix in separate migration'),
  ('document_programming_links', 'rpc-or-select-only', ARRAY[]::text[], 'document programming link writes use RPCs; visible surfaces only list authorized metadata', 'authenticated already SELECT-only locally; keep that floor', 'no anon table grants currently expected; keep none', 'future default ACL fix in separate migration'),
  ('document_subjects', 'document-metadata-future-manage', ARRAY[]::text[], 'current visible app has no subject-management UI/direct DML; metadata rollback covers DB behavior', 'candidate only after document-management decision; do not mix with runtime repo validation', 'revoke anon table grants after runtime smoke', 'future default ACL fix in separate migration'),
  ('document_versions', 'document-metadata-future-manage', ARRAY[]::text[], 'upload lifecycle uses begin/activate/cancel RPCs; visible app lists metadata only', 'candidate to remove DELETE/TRUNCATE/REFERENCES/TRIGGER; INSERT/UPDATE already revoked locally', 'revoke anon table grants after runtime smoke', 'future default ACL fix in separate migration'),
  ('documents', 'document-metadata-future-manage', ARRAY[]::text[], 'current visible app has no document-management UI/direct DML; repository lists via RPC', 'candidate only after document-management decision; do not mix with runtime repo validation', 'revoke anon table grants after runtime smoke', 'future default ACL fix in separate migration'),
  ('operational_audit_events', 'rpc-or-select-only', ARRAY[]::text[], 'operational audit writes through record_operational_audit_event RPC; list RPC reads', 'authenticated already SELECT-only locally; keep that floor', 'no anon table grants currently expected; keep none', 'future default ACL fix in separate migration'),
  ('operational_events', 'rpc-or-select-only', ARRAY[]::text[], 'operational event mutations use create/update/status RPCs', 'authenticated already SELECT-only locally; keep that floor', 'no anon table grants currently expected; keep none', 'future default ACL fix in separate migration'),
  ('organization_memberships', 'direct-dml-runtime', ARRAY['INSERT','UPDATE']::text[], 'src/app/(app)/app/coaches/actions.ts uses direct membership insert/update through RLS', 'do not revoke authenticated INSERT/UPDATE yet; only TRUNCATE/REFERENCES/TRIGGER are low-risk candidates', 'revoke anon table grants after runtime smoke', 'future default ACL fix in separate migration'),
  ('organizations', 'direct-dml-runtime', ARRAY['UPDATE']::text[], 'src/app/(app)/app/settings/actions.ts updates organization settings directly', 'do not revoke authenticated UPDATE yet; only TRUNCATE/REFERENCES/TRIGGER are low-risk candidates', 'revoke anon table grants after runtime smoke', 'future default ACL fix in separate migration'),
  ('overtime_candidate_events', 'rpc-or-select-only', ARRAY[]::text[], 'overtime candidate writes use RPCs/internal events; src has no direct table DML', 'authenticated already SELECT-only locally; keep that floor', 'no anon table grants currently expected; keep none', 'future default ACL fix in separate migration'),
  ('overtime_candidate_sources', 'rpc-or-select-only', ARRAY[]::text[], 'overtime candidate source writes use RPCs; src has no direct table DML', 'authenticated already SELECT-only locally; keep that floor', 'no anon table grants currently expected; keep none', 'future default ACL fix in separate migration'),
  ('overtime_candidates', 'rpc-or-select-only', ARRAY[]::text[], 'overtime candidate status/signal/list operations use RPCs', 'authenticated already SELECT-only locally; keep that floor', 'no anon table grants currently expected; keep none', 'future default ACL fix in separate migration'),
  ('person_profiles', 'direct-dml-runtime', ARRAY['INSERT','UPDATE']::text[], 'src account/coaches actions still use direct person profile insert/update through RLS', 'do not revoke authenticated INSERT/UPDATE yet; only TRUNCATE/REFERENCES/TRIGGER are low-risk candidates', 'revoke anon table grants after runtime smoke', 'future default ACL fix in separate migration'),
  ('profile_assets', 'rpc-or-select-only', ARRAY[]::text[], 'avatar lifecycle uses own-profile RPCs; visible app only needs reads/signed URL helpers', 'candidate to reduce authenticated to SELECT after account/avatar runtime check', 'revoke anon table grants after runtime smoke', 'future default ACL fix in separate migration'),
  ('profile_signatures', 'rpc-or-select-only', ARRAY[]::text[], 'signature lifecycle uses own-profile RPCs; visible app only needs reads/signed URL helpers', 'candidate to reduce authenticated to SELECT after account/signature runtime check', 'revoke anon table grants after runtime smoke', 'future default ACL fix in separate migration'),
  ('schedule_block_assignments', 'direct-dml-runtime', ARRAY['INSERT','UPDATE']::text[], 'schedule, coverage and template application use direct assignment insert/update through RLS', 'do not revoke authenticated INSERT/UPDATE yet; only TRUNCATE/REFERENCES/TRIGGER are low-risk candidates', 'revoke anon table grants after runtime smoke', 'future default ACL fix in separate migration'),
  ('schedule_blocks', 'direct-dml-runtime', ARRAY['INSERT','UPDATE','DELETE']::text[], 'schedule, coverage and template application use direct block insert/update/upsert/delete through RLS', 'do not revoke authenticated INSERT/UPDATE/DELETE yet; only TRUNCATE/REFERENCES/TRIGGER are low-risk candidates', 'revoke anon table grants after runtime smoke', 'future default ACL fix in separate migration'),
  ('schedule_template_blocks', 'direct-dml-runtime', ARRAY['INSERT','UPDATE','DELETE']::text[], 'templates use direct block insert/update/delete through RLS', 'do not revoke authenticated INSERT/UPDATE/DELETE yet; only TRUNCATE/REFERENCES/TRIGGER are low-risk candidates', 'revoke anon table grants after runtime smoke', 'future default ACL fix in separate migration'),
  ('schedule_templates', 'direct-dml-runtime', ARRAY['INSERT','UPDATE']::text[], 'templates use direct header insert/update through RLS', 'do not revoke authenticated INSERT/UPDATE yet; only TRUNCATE/REFERENCES/TRIGGER are low-risk candidates', 'revoke anon table grants after runtime smoke', 'future default ACL fix in separate migration'),
  ('staff_work_windows', 'direct-dml-runtime', ARRAY['INSERT','UPDATE']::text[], 'schedule actions use direct staff_work_windows insert/update through RLS', 'do not revoke authenticated INSERT/UPDATE yet; current table already lacks TRUNCATE/REFERENCES/TRIGGER', 'no anon table grants currently expected; keep none', 'future default ACL fix in separate migration'),
  ('team_invitations', 'direct-dml-runtime', ARRAY['INSERT','UPDATE']::text[], 'team invitation actions use direct insert/update plus public preview/accept RPCs', 'do not revoke authenticated INSERT/UPDATE yet; only TRUNCATE/REFERENCES/TRIGGER are low-risk candidates', 'revoke anon table grants after checking public invitation RPC still works', 'future default ACL fix in separate migration'),
  ('time_audit_events', 'rpc-or-select-only', ARRAY[]::text[], 'time audit writes are trigger/RPC driven; app reads through controlled helpers', 'candidate to reduce authenticated to SELECT after time runtime check', 'revoke anon table grants after runtime smoke', 'future default ACL fix in separate migration'),
  ('time_exports', 'direct-dml-runtime', ARRAY['INSERT','UPDATE']::text[], 'time export generation inserts/updates time_exports directly through RLS', 'do not revoke authenticated INSERT/UPDATE yet; only TRUNCATE/REFERENCES/TRIGGER are low-risk candidates', 'revoke anon table grants after runtime smoke', 'future default ACL fix in separate migration'),
  ('time_location_events', 'rpc-or-select-only', ARRAY[]::text[], 'time-location event writes/lists use RPCs; feature remains inactive for web beta', 'candidate to reduce authenticated to SELECT after time-location runtime check if feature stays dormant', 'revoke anon table grants after runtime smoke', 'future default ACL fix in separate migration'),
  ('time_punches', 'rpc-or-select-only', ARRAY[]::text[], 'src creates punches through create_own_time_punch/generate_schedule_auto RPCs; export reads directly', 'candidate to reduce authenticated after F.15/runtime check; keep SELECT until then', 'revoke anon table grants after runtime smoke', 'future default ACL fix in separate migration'),
  ('time_record_corrections', 'direct-dml-runtime', ARRAY['INSERT','UPDATE']::text[], 'time correction request/review uses direct insert/update through RLS; apply also has RPC path', 'do not revoke authenticated INSERT/UPDATE yet; only TRUNCATE/REFERENCES/TRIGGER are low-risk candidates', 'revoke anon table grants after runtime smoke', 'future default ACL fix in separate migration'),
  ('time_records', 'rpc-or-select-only', ARRAY[]::text[], 'src creates records through create_own_time_punch/generate_schedule_auto RPCs; export/corrections read directly', 'candidate to reduce authenticated after F.15/runtime check; keep SELECT until then', 'revoke anon table grants after runtime smoke', 'future default ACL fix in separate migration'),
  ('time_weekly_approvals', 'rpc-or-select-only', ARRAY[]::text[], 'weekly submit/approve/reject/reopen use RPCs; export/dashboard read directly', 'candidate to reduce authenticated after F.15/runtime check; keep SELECT until then', 'revoke anon table grants after runtime smoke', 'future default ACL fix in separate migration');

SELECT pg_temp.assert_true(
  (SELECT count(*) FROM s75_public_app_tables) = 40,
  'catalog inventory currently sees 40 public app tables'
);

SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1
    FROM s75_public_app_tables
    WHERE NOT rls_enabled
  ),
  'all classified public app tables still have RLS enabled'
);

SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND 'anon' = ANY (roles)
  ),
  'anon still has no direct RLS policy role on public app tables'
);

SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1
    FROM s75_public_app_tables t
    LEFT JOIN s75_table_classification c ON c.table_name = t.table_name
    WHERE c.table_name IS NULL
  ),
  'all public app tables have an S.75 hardening impact classification'
);

SELECT pg_temp.assert_true(
  (SELECT count(*) FROM s75_table_classification WHERE candidate_group = 'direct-dml-runtime') = 14,
  '14 tables are classified as current src direct DML runtime dependencies'
);

SELECT pg_temp.assert_true(
  (SELECT count(*) FROM s75_table_classification WHERE candidate_group = 'rpc-or-select-only') = 21,
  '21 tables are classified as RPC-mediated or SELECT-only from current src'
);

SELECT pg_temp.assert_true(
  (SELECT count(*) FROM s75_table_classification WHERE candidate_group = 'document-metadata-future-manage') = 4,
  '4 document metadata tables need a separate future-management decision'
);

SELECT pg_temp.assert_true(
  (SELECT count(*) FROM s75_table_classification WHERE candidate_group = 'unused-or-legacy-direct-table') = 1,
  '1 table is classified as unused or legacy direct table pending confirmation'
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*)
    FROM s75_current_privileges
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
    FROM s75_current_privileges
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
  'authenticated currently has at least one risky direct table privilege on 30 public app tables'
);

SELECT
  's75-current-classification' AS section,
  c.table_name,
  c.candidate_group,
  array_to_string(c.src_dml_ops, ',') AS src_dml_ops,
  array_to_string(
    array_remove(ARRAY[
      CASE WHEN p_auth.can_insert THEN 'INSERT' END,
      CASE WHEN p_auth.can_update THEN 'UPDATE' END,
      CASE WHEN p_auth.can_delete THEN 'DELETE' END,
      CASE WHEN p_auth.can_truncate THEN 'TRUNCATE' END,
      CASE WHEN p_auth.can_references THEN 'REFERENCES' END,
      CASE WHEN p_auth.can_trigger THEN 'TRIGGER' END
    ], NULL),
    ','
  ) AS current_authenticated_risky_privileges,
  array_to_string(
    array_remove(ARRAY[
      CASE WHEN p_anon.can_select THEN 'SELECT' END,
      CASE WHEN p_anon.can_insert THEN 'INSERT' END,
      CASE WHEN p_anon.can_update THEN 'UPDATE' END,
      CASE WHEN p_anon.can_delete THEN 'DELETE' END,
      CASE WHEN p_anon.can_truncate THEN 'TRUNCATE' END,
      CASE WHEN p_anon.can_references THEN 'REFERENCES' END,
      CASE WHEN p_anon.can_trigger THEN 'TRIGGER' END
    ], NULL),
    ','
  ) AS current_anon_privileges,
  c.auth_posture_plan,
  c.anon_posture_plan
FROM s75_table_classification c
JOIN s75_current_privileges p_auth
  ON p_auth.table_name = c.table_name
 AND p_auth.role_name = 'authenticated'
JOIN s75_current_privileges p_anon
  ON p_anon.table_name = c.table_name
 AND p_anon.role_name = 'anon'
ORDER BY c.candidate_group, c.table_name;

SELECT
  's75-default-acl-current' AS section,
  defaclrole::regrole::text AS owner_role,
  defaclnamespace::regnamespace::text AS schema_name,
  defaclobjtype AS object_type,
  defaclacl::text AS default_acl
FROM pg_default_acl
WHERE defaclnamespace::regnamespace::text = 'public'
  AND defaclobjtype = 'r'
ORDER BY owner_role, schema_name, object_type;

-- Simulate the minimal candidate only inside this transaction.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;

-- The local postgres role is not a member of supabase_admin, so this rollback
-- can prove the syntax/effect for postgres-owned future tables only. The
-- supabase_admin default ACL remains an operator/migration-owner item, not a
-- false local pass.

SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1
    FROM s75_public_app_tables t
    WHERE has_table_privilege('anon', format('%I.%I', t.schema_name, t.table_name), 'SELECT')
       OR has_table_privilege('anon', format('%I.%I', t.schema_name, t.table_name), 'INSERT')
       OR has_table_privilege('anon', format('%I.%I', t.schema_name, t.table_name), 'UPDATE')
       OR has_table_privilege('anon', format('%I.%I', t.schema_name, t.table_name), 'DELETE')
       OR has_table_privilege('anon', format('%I.%I', t.schema_name, t.table_name), 'TRUNCATE')
       OR has_table_privilege('anon', format('%I.%I', t.schema_name, t.table_name), 'REFERENCES')
       OR has_table_privilege('anon', format('%I.%I', t.schema_name, t.table_name), 'TRIGGER')
  ),
  'simulation removes direct table privileges from anon on current public app tables'
);

SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1
    FROM s75_public_app_tables t
    WHERE has_table_privilege('authenticated', format('%I.%I', t.schema_name, t.table_name), 'TRUNCATE')
       OR has_table_privilege('authenticated', format('%I.%I', t.schema_name, t.table_name), 'REFERENCES')
       OR has_table_privilege('authenticated', format('%I.%I', t.schema_name, t.table_name), 'TRIGGER')
  ),
  'simulation removes TRUNCATE, REFERENCES and TRIGGER from authenticated on current public app tables'
);

SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1
    FROM s75_table_classification c
    CROSS JOIN LATERAL unnest(c.src_dml_ops) AS required(required_op)
    WHERE NOT has_table_privilege(
      'authenticated',
      format('%I.%I', 'public', c.table_name),
      required.required_op
    )
  ),
  'simulation preserves observed authenticated direct DML operations used by current src'
);

SELECT pg_temp.assert_true(
  has_function_privilege(
    'anon',
    'public.get_team_invitation_public(uuid,text)',
    'EXECUTE'
  ),
  'simulation keeps anon EXECUTE on the public invitation preview RPC'
);

SELECT pg_temp.assert_true(
  has_function_privilege(
    'authenticated',
    'public.accept_team_invitation(uuid,text)',
    'EXECUTE'
  ),
  'simulation keeps authenticated EXECUTE on the invitation acceptance RPC'
);

SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1
    FROM pg_default_acl
    WHERE defaclnamespace::regnamespace::text = 'public'
      AND defaclobjtype = 'r'
      AND defaclrole::regrole::text = 'postgres'
      AND (
        defaclacl::text LIKE '%anon=%'
        OR defaclacl::text LIKE '%authenticated=%'
      )
  ),
  'simulation removes postgres-owned future default table ACL grants for anon/authenticated in public'
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
  'supabase_admin-owned default table ACL still requires a separate owner/operator migration step'
);

SELECT
  's75-post-simulation-summary' AS section,
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
FROM s75_public_app_tables t
CROSS JOIN (VALUES ('anon'), ('authenticated')) AS r(role_name)
GROUP BY r.role_name
ORDER BY r.role_name;

SELECT
  's75-next-actions' AS section,
  *
FROM (
  VALUES
    (
      'documentation-and-rollback-only',
      'S.75 should not apply a migration in this cut; it adds table-by-table impact analysis and a rollback simulation only.'
    ),
    (
      'candidate-minimal-migration',
      'A future migration can consider anon table revokes plus authenticated TRUNCATE/REFERENCES/TRIGGER revokes first, because current src direct DML operations remain granted in the simulation.'
    ),
    (
      'candidate-auth-select-only',
      'RPC/select-only tables can be reduced further table by table only after route/RPC/runtime smoke proves no PostgREST direct DML dependency.'
    ),
    (
      'future-default-privileges',
      'Default table privileges for postgres/supabase_admin should be corrected in a separate migration, with future migrations granting explicit table privileges intentionally.'
    )
) AS actions(action_type, decision);

ROLLBACK;
