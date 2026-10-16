import { createBrowserClient } from "@supabase/ssr";

import { getSupabaseAuthCookieOptions } from "@/lib/supabase/auth-cookie-options";
import { getSupabasePublicEnv } from "@/lib/supabase/env";
import type { Database } from "@/types/supabase";

export function createClient() {
  const { supabaseUrl, supabaseAnonKey } = getSupabasePublicEnv();

  return createBrowserClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookieOptions: getSupabaseAuthCookieOptions(),
  });
}
