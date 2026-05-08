"use server";

import { redirect } from "next/navigation";

import { getAuthCallbackUrl } from "@/lib/auth/site-url";
import { createClient } from "@/lib/supabase/server";

const GENERIC_RESET_SENT_PATH = "/forgot-password?status=sent";

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

export async function requestPasswordReset(formData: FormData) {
  const email = getFormString(formData, "email");

  if (email) {
    try {
      const supabase = await createClient();
      const redirectTo = await getAuthCallbackUrl("/reset-password");

      await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    } catch {
      // Keep the user-facing response generic to avoid account enumeration.
    }
  }

  redirect(GENERIC_RESET_SENT_PATH);
}
