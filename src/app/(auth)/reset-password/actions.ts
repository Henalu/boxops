"use server";

import { redirect } from "next/navigation";

import { validatePasswordPolicy } from "@/lib/auth/password-policy";
import {
  clearRequiredPasswordChangeAppMetadata,
  isPasswordChangeRequired,
} from "@/lib/auth/required-password-change";
import { createAdminClient } from "@/lib/supabase/admin";
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
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect(getResetPasswordPath("callback"));
  }

  const passwordChangeRequired = isPasswordChangeRequired(user);
  let authAdmin: ReturnType<typeof createAdminClient> | null = null;

  if (passwordChangeRequired) {
    try {
      authAdmin = createAdminClient();
    } catch {
      redirect(getResetPasswordPath("admin-client"));
    }
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    redirect(getResetPasswordPath("update-failed"));
  }

  if (passwordChangeRequired && authAdmin) {
    const { error: metadataError } = await authAdmin.auth.admin.updateUserById(
      user.id,
      {
        app_metadata: clearRequiredPasswordChangeAppMetadata(user.app_metadata),
      },
    );

    if (metadataError) {
      redirect(getResetPasswordPath("metadata-failed"));
    }
  }

  await supabase.auth.signOut();

  redirect("/login?status=password-updated");
}
