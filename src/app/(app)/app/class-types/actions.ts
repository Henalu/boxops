"use server";

import { redirect } from "next/navigation";

import { getLoginPath } from "@/lib/auth/redirects";
import {
  getActiveMemberships,
  getAuthenticatedUser,
  resolveActiveOrganization,
} from "@/lib/auth/tenant";
import {
  isClassTypeStatus,
  validateClassTypeForm,
} from "@/lib/class-types";
import { getClassTypesPath } from "@/lib/navigation/app-paths";
import { createClient } from "@/lib/supabase/server";

function getRequiredFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

function getErrorPath(organizationId: string | null, error: string) {
  return getClassTypesPath({
    organizationId,
    error,
  });
}

async function getAdminActionContext(formData: FormData) {
  const organizationId = getRequiredFormString(formData, "organizationId");
  const redirectPath = getClassTypesPath({ organizationId });
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect(getLoginPath(redirectPath));
  }

  const memberships = await getActiveMemberships(user.id);
  const resolution = resolveActiveOrganization(memberships, organizationId);

  if (!resolution.ok) {
    redirect(getErrorPath(organizationId, resolution.reason));
  }

  if (resolution.membership.role !== "admin") {
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

export async function createClassType(formData: FormData) {
  const context = await getAdminActionContext(formData);
  const validation = validateClassTypeForm(formData);

  if (!validation.ok) {
    redirect(getErrorPath(context.organization.id, validation.error));
  }

  const supabase = await createClient();
  const { error } = await supabase.from("class_types").insert({
    organization_id: context.organization.id,
    name: validation.values.name,
    slug: validation.values.slug,
    category: validation.values.category,
    required_coaches: validation.values.requiredCoaches,
    requires_certification: validation.values.requiresCertification,
    color: validation.values.color,
    status: validation.values.status,
  });

  if (error) {
    redirect(getErrorPath(context.organization.id, getMutationError(error.code)));
  }

  redirect(
    getClassTypesPath({
      organizationId: context.organization.id,
      status: "created",
    }),
  );
}

export async function updateClassType(formData: FormData) {
  const context = await getAdminActionContext(formData);
  const classTypeId = getRequiredFormString(formData, "classTypeId");
  const validation = validateClassTypeForm(formData);

  if (!classTypeId) {
    redirect(getErrorPath(context.organization.id, "class-type-required"));
  }

  if (!validation.ok) {
    redirect(getErrorPath(context.organization.id, validation.error));
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("class_types")
    .update({
      name: validation.values.name,
      slug: validation.values.slug,
      category: validation.values.category,
      required_coaches: validation.values.requiredCoaches,
      requires_certification: validation.values.requiresCertification,
      color: validation.values.color,
      status: validation.values.status,
    })
    .eq("id", classTypeId)
    .eq("organization_id", context.organization.id)
    .select("id")
    .single();

  if (error) {
    redirect(getErrorPath(context.organization.id, getMutationError(error.code)));
  }

  redirect(
    getClassTypesPath({
      organizationId: context.organization.id,
      status: "updated",
    }),
  );
}

export async function setClassTypeStatus(formData: FormData) {
  const context = await getAdminActionContext(formData);
  const classTypeId = getRequiredFormString(formData, "classTypeId");
  const nextStatus = getRequiredFormString(formData, "nextStatus");

  if (!classTypeId) {
    redirect(getErrorPath(context.organization.id, "class-type-required"));
  }

  if (!isClassTypeStatus(nextStatus)) {
    redirect(getErrorPath(context.organization.id, "invalid-status"));
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("class_types")
    .update({ status: nextStatus })
    .eq("id", classTypeId)
    .eq("organization_id", context.organization.id)
    .select("id")
    .single();

  if (error) {
    redirect(getErrorPath(context.organization.id, getMutationError(error.code)));
  }

  redirect(
    getClassTypesPath({
      organizationId: context.organization.id,
      status: nextStatus === "active" ? "activated" : "deactivated",
    }),
  );
}
