"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { getLoginPath } from "@/lib/auth/redirects";
import {
  canManageTenantSettings,
  canManageTimeTrackingSettings,
} from "@/lib/auth/permissions";
import {
  getActiveMemberships,
  getAuthenticatedUser,
  resolveActiveOrganization,
} from "@/lib/auth/tenant";
import { getSettingsPath } from "@/lib/navigation/app-paths";
import {
  buildOrganizationTimeTrackingConfig,
  buildOrganizationThemeConfig,
  validateOrganizationTimeTrackingSettingsForm,
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

async function getTenantSettingsActionContext(
  formData: FormData,
  options?: {
    requireTimeTrackingSettings?: boolean;
  },
) {
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

  const canManage = options?.requireTimeTrackingSettings
    ? canManageTimeTrackingSettings(resolution.membership.role)
    : canManageTenantSettings(resolution.membership.role);

  if (!canManage) {
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

export async function updateTimeTrackingSettings(formData: FormData) {
  const context = await getTenantSettingsActionContext(formData, {
    requireTimeTrackingSettings: true,
  });
  const validation = validateOrganizationTimeTrackingSettingsForm(formData);

  if (!validation.ok) {
    redirect(getErrorPath(context.organization.id, validation.error));
  }

  const timeTrackingConfig = buildOrganizationTimeTrackingConfig(
    context.organization.time_tracking_config,
    validation.values,
  );

  const supabase = await createClient();
  const { error } = await supabase.rpc(
    "update_organization_time_tracking_config",
    {
      target_organization_id: context.organization.id,
      target_time_tracking_config: timeTrackingConfig,
    },
  );

  if (error) {
    redirect(getErrorPath(context.organization.id, "save-failed"));
  }

  revalidatePath("/app", "layout");
  revalidatePath("/app/settings");
  revalidatePath("/app/time");

  redirect(
    getSettingsPath({
      organizationId: context.organization.id,
      status: "time-tracking-updated",
    }),
  );
}
