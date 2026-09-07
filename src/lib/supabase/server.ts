import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getSupabaseAuthCookieOptions } from "@/lib/supabase/auth-cookie-options";
import { getSupabasePublicEnv } from "@/lib/supabase/env";
import type { Database } from "@/types/supabase";

export async function createClient() {
  const { supabaseUrl, supabaseAnonKey } = getSupabasePublicEnv();
  const cookieStore = await cookies();

  return createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookieOptions: getSupabaseAuthCookieOptions(),
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot always write cookies; proxy/auth will handle this later.
        }
      },
    },
  });
}
