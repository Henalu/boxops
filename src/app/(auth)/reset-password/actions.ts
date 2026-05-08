"use server";

import { redirect } from "next/navigation";

import { validatePasswordPolicy } from "@/lib/auth/password-policy";
import { createClient } from "@/lib/supabase/server";

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value : "";
}

function getResetPasswordPath(error: string) {
  const params = new URLSearchParams({ error });

  return `/reset-password?${params.toString()}`;
}

export async function updatePassword(formData: FormData) {
  const password = getFormString(formData, "password");
  const confirmPassword = getFormString(formData, "confirmPassword");
  const validation = validatePasswordPolicy(password);

  if (!validation.ok) {
    redirect(getResetPasswordPath(validation.error));
  }

  if (password !== confirmPassword) {
    redirect(getResetPasswordPath("password-mismatch"));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    redirect(getResetPasswordPath("update-failed"));
  }

  await supabase.auth.signOut();

  redirect("/login?status=password-updated");
}
