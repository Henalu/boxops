-- BoxOps - S.103 owner/operator SQL for supabase_admin default sequence/function privileges
-- Execute only in an authorized local/QA/staging/prod maintenance window with a
-- database role that is supabase_admin or a member of supabase_admin.
-- This is intentionally not a normal migration because npm run supabase:reset
-- applies migrations with the local postgres role, which cannot alter default
-- privileges owned by supabase_admin.
-- The PUBLIC function default is global in Postgres; the schema-scoped role
-- revokes below keep public future functions closed for app roles.
-- This does not change existing objects or table defaults.

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON SEQUENCES FROM authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
