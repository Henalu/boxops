"use server";

import { redirect } from "next/navigation";

import {
  getRequiredPasswordChangePath,
  isPasswordChangeRequired,
} from "@/lib/auth/required-password-change";
import { getSafeRedirectPath } from "@/lib/auth/redirects";
import { createClient } from "@/lib/supabase/server";

function getErrorRedirect(error: string, redirectTo: string) {
  const params = new URLSearchParams({
    error,
    redirectTo,
  });

  return `/login?${params.toString()}`;
}

export async function signInWithPassword(formData: FormData) {
  const email = formData.get("email");
  const password = formData.get("password");
  const redirectTo = getSafeRedirectPath(formData.get("redirectTo"));

  if (typeof email !== "string" || typeof password !== "string") {
    redirect(getErrorRedirect("missing-credentials", redirectTo));
  }

  const normalizedEmail = email.trim();

  if (!normalizedEmail || !password) {
    redirect(getErrorRedirect("missing-credentials", redirectTo));
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: normalizedEmail,
    password,
  });

  if (error) {
    redirect(getErrorRedirect("invalid-credentials", redirectTo));
  }

  if (data.user && isPasswordChangeRequired(data.user)) {
    redirect(getRequiredPasswordChangePath());
  }

  redirect(redirectTo);
}
