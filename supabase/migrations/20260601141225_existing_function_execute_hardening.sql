-- BoxOps - existing public function execute hardening.
--
-- Public functions had accumulated broad anon/PUBLIC EXECUTE grants from older
-- defaults. Keep authenticated RPC behavior intact and leave only the minimized
-- invitation preview callable before login.

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon;

GRANT EXECUTE ON FUNCTION public.get_team_invitation_public(uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_team_invitation_public(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_team_invitation(uuid, text) TO authenticated;

ALTER FUNCTION public.set_schedule_template_archive_retention()
  SET search_path = public;
