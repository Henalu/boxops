import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { getSupabasePublicEnv } from "@/lib/supabase/env";
import type { Database } from "@/types/supabase";

export function createAdminClient() {
  const { supabaseUrl } = getSupabasePublicEnv();
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseServiceRoleKey) {
    throw new Error("Missing Supabase admin environment variables.");
  }

  return createSupabaseClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
