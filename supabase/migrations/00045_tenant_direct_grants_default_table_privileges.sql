-- BoxOps - S.102 tenant direct grants default table privileges hardening
-- Keep this migration reset-safe for the local Supabase CLI path, which applies
-- migrations as postgres. The supabase_admin owner/operator statements live in
-- supabase/snippets/tenant-direct-grants-supabase-admin-default-table-privileges-operator.sql.
-- Sequence/function defaults remain undecided.

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM authenticated;
