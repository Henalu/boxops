"use server";

import { redirect } from "next/navigation";

import { getLoginPath } from "@/lib/auth/redirects";
import { canManageOperationalData } from "@/lib/auth/permissions";
import {
  getActiveMemberships,
  getAuthenticatedUser,
  resolveActiveOrganization,
} from "@/lib/auth/tenant";
import { isCenterStatus, validateCenterForm } from "@/lib/centers";
import { getCentersPath } from "@/lib/navigation/app-paths";
import { createClient } from "@/lib/supabase/server";

function getRequiredFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

function getErrorPath(organizationId: string | null, error: string) {
  return getCentersPath({
    organizationId,
    error,
  });
}

async function getOperationalActionContext(formData: FormData) {
  const organizationId = getRequiredFormString(formData, "organizationId");
  const redirectPath = getCentersPath({ organizationId });
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect(getLoginPath(redirectPath));
  }

  const memberships = await getActiveMemberships(user.id);
  const resolution = resolveActiveOrganization(memberships, organizationId);

  if (!resolution.ok) {
    redirect(getErrorPath(organizationId, resolution.reason));
  }

  if (!canManageOperationalData(resolution.membership.role)) {
    redirect(getErrorPath(resolution.organization.id, "forbidden"));
  }

  return {
    organization: resolution.organization,
  };
}

function getMutationError(errorCode?: string) {
  if (errorCode === "23505") {
    return "duplicate-slug";
  }

  return "save-failed";
}

export async function createCenter(formData: FormData) {
  const context = await getOperationalActionContext(formData);
  const validation = validateCenterForm(formData);

  if (!validation.ok) {
    redirect(getErrorPath(context.organization.id, validation.error));
  }

  const supabase = await createClient();
  const { error } = await supabase.from("centers").insert({
    organization_id: context.organization.id,
    name: validation.values.name,
    slug: validation.values.slug,
    timezone: validation.values.timezone,
    status: validation.values.status,
  });

  if (error) {
    redirect(getErrorPath(context.organization.id, getMutationError(error.code)));
  }

  redirect(
    getCentersPath({
      organizationId: context.organization.id,
      status: "created",
    }),
  );
}

export async function updateCenter(formData: FormData) {
  const context = await getOperationalActionContext(formData);
  const centerId = getRequiredFormString(formData, "centerId");
  const validation = validateCenterForm(formData);

  if (!centerId) {
    redirect(getErrorPath(context.organization.id, "center-required"));
  }

  if (!validation.ok) {
    redirect(getErrorPath(context.organization.id, validation.error));
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("centers")
    .update({
      name: validation.values.name,
      slug: validation.values.slug,
      timezone: validation.values.timezone,
      status: validation.values.status,
    })
    .eq("id", centerId)
    .eq("organization_id", context.organization.id)
    .select("id")
    .single();

  if (error) {
    redirect(getErrorPath(context.organization.id, getMutationError(error.code)));
  }

  redirect(
    getCentersPath({
      organizationId: context.organization.id,
      status: "updated",
    }),
  );
}

export async function setCenterStatus(formData: FormData) {
  const context = await getOperationalActionContext(formData);
  const centerId = getRequiredFormString(formData, "centerId");
  const nextStatus = getRequiredFormString(formData, "nextStatus");

  if (!centerId) {
    redirect(getErrorPath(context.organization.id, "center-required"));
  }

  if (!isCenterStatus(nextStatus)) {
    redirect(getErrorPath(context.organization.id, "invalid-status"));
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("centers")
    .update({ status: nextStatus })
    .eq("id", centerId)
    .eq("organization_id", context.organization.id)
    .select("id")
    .single();

  if (error) {
    redirect(getErrorPath(context.organization.id, getMutationError(error.code)));
  }

  redirect(
    getCentersPath({
      organizationId: context.organization.id,
      status: nextStatus === "active" ? "activated" : "deactivated",
    }),
  );
}
