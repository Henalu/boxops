-- BoxOps - S.103 tenant direct grants default sequence/function privileges
-- Keep this migration reset-safe for the local Supabase CLI path, which applies
-- migrations as postgres. The supabase_admin owner/operator statements live in
-- supabase/snippets/tenant-direct-grants-supabase-admin-default-sequence-function-privileges-operator.sql.
-- The PUBLIC function default is global in Postgres; the schema-scoped role
-- revokes below keep public future functions closed for app roles.
-- This does not change existing objects or table defaults.

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
