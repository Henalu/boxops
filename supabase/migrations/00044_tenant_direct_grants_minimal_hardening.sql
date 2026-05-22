-- BoxOps - S.98 tenant direct grants minimal hardening
-- Keep this migration intentionally limited to the two table-grant revokes
-- validated locally in S.97. Default privileges and authenticated DML remain
-- separate follow-up work.

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM authenticated;
