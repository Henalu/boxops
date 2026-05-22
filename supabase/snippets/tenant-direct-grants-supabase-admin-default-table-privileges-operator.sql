-- BoxOps - S.102 owner/operator SQL for supabase_admin default table privileges
-- Execute only in an authorized local/QA/staging/prod maintenance window with a
-- database role that is supabase_admin or a member of supabase_admin.
-- This is intentionally not a normal migration because npm run supabase:reset
-- applies migrations with the local postgres role, which cannot alter default
-- privileges owned by supabase_admin.
-- Sequence/function defaults remain out of scope for this cut.

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM authenticated;
