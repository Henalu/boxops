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
import { getAvailableSlug } from "@/lib/slugs";
import { createClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

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

async function validateCertificationReference({
  certificationId,
  organizationId,
  supabase,
}: {
  certificationId: string | null;
  organizationId: string;
  supabase: SupabaseClient;
}) {
  if (!certificationId) {
    return true;
  }

  const { data, error } = await supabase
    .from("certifications")
    .select("id")
    .eq("id", certificationId)
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .maybeSingle();

  return !error && Boolean(data);
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

async function getClassTypeSlug({
  name,
  organizationId,
  supabase,
  usedSlugs,
}: {
  name: string;
  organizationId: string;
  supabase: SupabaseClient;
  usedSlugs: Iterable<string>;
}) {
  const { data, error } = await supabase
    .from("class_types")
    .select("slug")
    .eq("organization_id", organizationId);

  if (error) {
    return {
      error,
      ok: false as const,
    };
  }

  return {
    ok: true as const,
    slug: getAvailableSlug({
      fallback: "actividad",
      source: name,
      usedSlugs: [
        ...(data ?? []).map((classType) => classType.slug),
        ...usedSlugs,
      ],
    }),
  };
}

async function insertClassTypeWithUniqueSlug({
  category,
  certificationId,
  color,
  iconKey,
  name,
  organizationId,
  requiredCoaches,
  status,
  supabase,
}: {
  category: string;
  certificationId: string | null;
  color: string | null;
  iconKey: string;
  name: string;
  organizationId: string;
  requiredCoaches: number;
  status: string;
  supabase: SupabaseClient;
}) {
  const attemptedSlugs = new Set<string>();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const slugResult = await getClassTypeSlug({
      name,
      organizationId,
      supabase,
      usedSlugs: attemptedSlugs,
    });

    if (!slugResult.ok) {
      return {
        classType: null,
        error: slugResult.error,
        slug: null,
      };
    }

    attemptedSlugs.add(slugResult.slug);

    const { data: classType, error } = await supabase
      .from("class_types")
      .insert({
        organization_id: organizationId,
        name,
        slug: slugResult.slug,
        category,
        certification_id: certificationId,
        required_coaches: requiredCoaches,
        requires_certification: certificationId !== null,
        color,
        icon_key: iconKey,
        status,
      })
      .select("id")
      .single();

    if (!error && classType) {
      return {
        classType,
        error: null,
        slug: slugResult.slug,
      };
    }

    if (error?.code !== "23505") {
      return {
        classType: null,
        error,
        slug: slugResult.slug,
      };
    }
  }

  return {
    classType: null,
    error: {
      code: "23505",
      message: "Could not generate a unique class type slug.",
    },
    slug: null,
  };
}

async function getExistingClassTypeSlug({
  classTypeId,
  organizationId,
  supabase,
}: {
  classTypeId: string;
  organizationId: string;
  supabase: SupabaseClient;
}) {
  const { data, error } = await supabase
    .from("class_types")
    .select("slug")
    .eq("id", classTypeId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error || !data) {
    return {
      error,
      ok: false as const,
    };
  }

  return {
    ok: true as const,
    slug: data.slug,
  };
}

export async function createClassType(formData: FormData) {
  const context = await getOperationalActionContext(formData);
  const validation = validateClassTypeForm(formData);

  if (!validation.ok) {
    redirect(getErrorPath(context.organization.id, validation.error));
  }

  const supabase = await createClient();
  const isValidCertification = await validateCertificationReference({
    certificationId: validation.values.certificationId,
    organizationId: context.organization.id,
    supabase,
  });

  if (!isValidCertification) {
    redirect(getErrorPath(context.organization.id, "invalid-certification"));
  }

  const { classType, error, slug } = await insertClassTypeWithUniqueSlug({
    category: validation.values.category,
    certificationId: validation.values.certificationId,
    color: validation.values.color,
    iconKey: validation.values.iconKey,
    name: validation.values.name,
    organizationId: context.organization.id,
    requiredCoaches: validation.values.requiredCoaches,
    status: validation.values.status,
    supabase,
  });

  if (error || !classType) {
    redirect(getErrorPath(context.organization.id, getMutationError(error?.code)));
  }

  await recordOperationalAuditEvent({
    action: "created",
    changedFields: {
      category: auditFieldSet(validation.values.category),
      certification_id: auditFieldSet(validation.values.certificationId),
      icon_key: auditFieldSet(validation.values.iconKey),
      name: auditFieldTouched(),
      required_coaches: auditFieldSet(validation.values.requiredCoaches),
      slug: auditFieldSet(slug),
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
  const isValidCertification = await validateCertificationReference({
    certificationId: validation.values.certificationId,
    organizationId: context.organization.id,
    supabase,
  });

  if (!isValidCertification) {
    redirect(getErrorPath(context.organization.id, "invalid-certification"));
  }

  const slugResult = await getExistingClassTypeSlug({
    classTypeId,
    organizationId: context.organization.id,
    supabase,
  });

  if (!slugResult.ok) {
    redirect(getErrorPath(context.organization.id, "class-type-required"));
  }

  const { error } = await supabase.rpc("update_class_type_and_sync_defaults", {
    target_category: validation.values.category,
    target_certification_id: validation.values.certificationId ?? undefined,
    target_class_type_id: classTypeId,
    target_color: validation.values.color as string,
    target_effective_from: getTodayDateString(context.organization.timezone),
    target_icon_key: validation.values.iconKey,
    target_name: validation.values.name,
    target_organization_id: context.organization.id,
    target_required_coaches: validation.values.requiredCoaches,
    target_requires_certification: validation.values.requiresCertification,
    target_slug: slugResult.slug,
    target_status: validation.values.status,
  });

  if (error) {
    redirect(getErrorPath(context.organization.id, getMutationError(error.code)));
  }

  await recordOperationalAuditEvent({
    action: "updated",
    changedFields: {
      category: auditFieldSet(validation.values.category),
      certification_id: auditFieldSet(validation.values.certificationId),
      icon_key: auditFieldSet(validation.values.iconKey),
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
