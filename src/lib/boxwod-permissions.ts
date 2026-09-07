import { createClient } from "@/lib/supabase/server";

export async function canProgramBoxWod(organizationId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("boxwod_can_program", {
    target_organization_id: organizationId,
  });

  return !error && data === true;
}
