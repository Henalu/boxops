"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { getLoginPath } from "@/lib/auth/redirects";
import { canManageTenantSettings } from "@/lib/auth/permissions";
import {
  getActiveMemberships,
  getAuthenticatedUser,
  resolveActiveOrganization,
} from "@/lib/auth/tenant";
import { getSettingsPath } from "@/lib/navigation/app-paths";
import {
  buildOrganizationThemeConfig,
  validateOrganizationSettingsForm,
} from "@/lib/organizations";
import { createClient } from "@/lib/supabase/server";

function getRequiredFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

function getErrorPath(organizationId: string | null, error: string) {
  return getSettingsPath({
    organizationId,
    error,
  });
}

async function getTenantSettingsActionContext(formData: FormData) {
  const organizationId = getRequiredFormString(formData, "organizationId");
  const redirectPath = getSettingsPath({ organizationId });
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect(getLoginPath(redirectPath));
  }

  const memberships = await getActiveMemberships(user.id);
  const resolution = resolveActiveOrganization(memberships, organizationId);

  if (!resolution.ok) {
    redirect(getErrorPath(organizationId, resolution.reason));
  }

  if (!canManageTenantSettings(resolution.membership.role)) {
    redirect(getErrorPath(resolution.organization.id, "forbidden"));
  }

  return {
    organization: resolution.organization,
  };
}

export async function updateOrganizationSettings(formData: FormData) {
  const context = await getTenantSettingsActionContext(formData);
  const validation = validateOrganizationSettingsForm(formData);

  if (!validation.ok) {
    redirect(getErrorPath(context.organization.id, validation.error));
  }

  const themeConfig = buildOrganizationThemeConfig(
    context.organization.theme_config,
    validation.values.accentColor,
  );

  const supabase = await createClient();
  const { error } = await supabase
    .from("organizations")
    .update({
      name: validation.values.name,
      theme_config: themeConfig,
    })
    .eq("id", context.organization.id)
    .select("id")
    .single();

  if (error) {
    redirect(getErrorPath(context.organization.id, "save-failed"));
  }

  revalidatePath("/app", "layout");
  revalidatePath("/app/settings");

  redirect(
    getSettingsPath({
      organizationId: context.organization.id,
      status: "updated",
    }),
  );
}
