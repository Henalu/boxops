"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getLoginPath } from "@/lib/auth/redirects";
import { canManageOperationalData } from "@/lib/auth/permissions";
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
import {
  auditFieldSet,
  auditFieldTouched,
  recordOperationalAuditEvent,
} from "@/lib/operational-audit";
import { getTodayDateString } from "@/lib/schedule-blocks";
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

async function getOperationalActionContext(formData: FormData) {
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

  if (errorCode === "42501") {
    return "forbidden";
  }

  if (errorCode === "P0002") {
    return "class-type-required";
  }

  return "save-failed";
}

function revalidateClassTypeDependants() {
  revalidatePath("/app", "layout");
  revalidatePath("/app");
  revalidatePath("/app/class-types");
  revalidatePath("/app/coverage");
  revalidatePath("/app/schedule");
  revalidatePath("/app/stats");
  revalidatePath("/app/templates");
}

export async function createClassType(formData: FormData) {
  const context = await getOperationalActionContext(formData);
  const validation = validateClassTypeForm(formData);

  if (!validation.ok) {
    redirect(getErrorPath(context.organization.id, validation.error));
  }

  const supabase = await createClient();
  const { data: classType, error } = await supabase
    .from("class_types")
    .insert({
      organization_id: context.organization.id,
      name: validation.values.name,
      slug: validation.values.slug,
      category: validation.values.category,
      required_coaches: validation.values.requiredCoaches,
      requires_certification: validation.values.requiresCertification,
      color: validation.values.color,
      status: validation.values.status,
    })
    .select("id")
    .single();

  if (error || !classType) {
    redirect(getErrorPath(context.organization.id, getMutationError(error?.code)));
  }

  await recordOperationalAuditEvent({
    action: "created",
    changedFields: {
      category: auditFieldSet(validation.values.category),
      name: auditFieldTouched(),
      required_coaches: auditFieldSet(validation.values.requiredCoaches),
      status: auditFieldSet(validation.values.status),
    },
    entityId: classType.id,
    entityType: "class_types",
    organizationId: context.organization.id,
    supabase,
  });

  revalidateClassTypeDependants();

  redirect(
    getClassTypesPath({
      organizationId: context.organization.id,
      status: "created",
    }),
  );
}

export async function updateClassType(formData: FormData) {
  const context = await getOperationalActionContext(formData);
  const classTypeId = getRequiredFormString(formData, "classTypeId");
  const validation = validateClassTypeForm(formData);

  if (!classTypeId) {
    redirect(getErrorPath(context.organization.id, "class-type-required"));
  }

  if (!validation.ok) {
    redirect(getErrorPath(context.organization.id, validation.error));
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_class_type_and_sync_defaults", {
    target_category: validation.values.category,
    target_class_type_id: classTypeId,
    target_color: validation.values.color as string,
    target_effective_from: getTodayDateString(context.organization.timezone),
    target_name: validation.values.name,
    target_organization_id: context.organization.id,
    target_required_coaches: validation.values.requiredCoaches,
    target_requires_certification: validation.values.requiresCertification,
    target_slug: validation.values.slug,
    target_status: validation.values.status,
  });

  if (error) {
    redirect(getErrorPath(context.organization.id, getMutationError(error.code)));
  }

  await recordOperationalAuditEvent({
    action: "updated",
    changedFields: {
      category: auditFieldSet(validation.values.category),
      name: auditFieldTouched(),
      required_coaches: auditFieldSet(validation.values.requiredCoaches),
      status: auditFieldSet(validation.values.status),
    },
    entityId: classTypeId,
    entityType: "class_types",
    organizationId: context.organization.id,
    supabase,
  });

  revalidateClassTypeDependants();

  redirect(
    getClassTypesPath({
      organizationId: context.organization.id,
      status: "updated",
    }),
  );
}

export async function setClassTypeStatus(formData: FormData) {
  const context = await getOperationalActionContext(formData);
  const classTypeId = getRequiredFormString(formData, "classTypeId");
  const nextStatus = getRequiredFormString(formData, "nextStatus");

  if (!classTypeId) {
    redirect(getErrorPath(context.organization.id, "class-type-required"));
  }

  if (!isClassTypeStatus(nextStatus)) {
    redirect(getErrorPath(context.organization.id, "invalid-status"));
  }

  const supabase = await createClient();
  const { data: classType, error } = await supabase
    .from("class_types")
    .update({ status: nextStatus })
    .eq("id", classTypeId)
    .eq("organization_id", context.organization.id)
    .select("id")
    .single();

  if (error || !classType) {
    redirect(getErrorPath(context.organization.id, getMutationError(error?.code)));
  }

  await recordOperationalAuditEvent({
    action: nextStatus === "active" ? "reactivated" : "deactivated",
    changedFields: {
      status: auditFieldSet(nextStatus),
    },
    entityId: classType.id,
    entityType: "class_types",
    organizationId: context.organization.id,
    supabase,
  });

  revalidateClassTypeDependants();

  redirect(
    getClassTypesPath({
      organizationId: context.organization.id,
      status: nextStatus === "active" ? "activated" : "deactivated",
    }),
  );
}
