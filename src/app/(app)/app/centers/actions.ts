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
import {
  auditFieldSet,
  auditFieldTouched,
  recordOperationalAuditEvent,
} from "@/lib/operational-audit";
import { getAvailableSlug } from "@/lib/slugs";
import { createClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

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

function getMutationError(error?: { code?: string; message?: string }) {
  if (error?.message?.toLowerCase().includes("center_limit_reached")) {
    return "center-limit-reached";
  }

  if (error?.code === "23505") {
    return "duplicate-slug";
  }

  return "save-failed";
}

async function getCenterSlug({
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
    .from("centers")
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
      fallback: "centro",
      source: name,
      usedSlugs: [...(data ?? []).map((center) => center.slug), ...usedSlugs],
    }),
  };
}

async function insertCenterWithUniqueSlug({
  name,
  organizationId,
  status,
  supabase,
  timezone,
}: {
  name: string;
  organizationId: string;
  status: string;
  supabase: SupabaseClient;
  timezone: string;
}) {
  const attemptedSlugs = new Set<string>();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const slugResult = await getCenterSlug({
      name,
      organizationId,
      supabase,
      usedSlugs: attemptedSlugs,
    });

    if (!slugResult.ok) {
      return {
        center: null,
        error: slugResult.error,
        slug: null,
      };
    }

    attemptedSlugs.add(slugResult.slug);

    const { data: center, error } = await supabase
      .from("centers")
      .insert({
        organization_id: organizationId,
        name,
        slug: slugResult.slug,
        timezone,
        status,
      })
      .select("id")
      .single();

    if (!error && center) {
      return {
        center,
        error: null,
        slug: slugResult.slug,
      };
    }

    if (error?.code !== "23505") {
      return {
        center: null,
        error,
        slug: slugResult.slug,
      };
    }
  }

  return {
    center: null,
    error: {
      code: "23505",
      message: "Could not generate a unique center slug.",
    },
    slug: null,
  };
}

export async function createCenter(formData: FormData) {
  const context = await getOperationalActionContext(formData);
  const validation = validateCenterForm(formData);

  if (!validation.ok) {
    redirect(getErrorPath(context.organization.id, validation.error));
  }

  const supabase = await createClient();
  const { center, error, slug } = await insertCenterWithUniqueSlug({
    name: validation.values.name,
    organizationId: context.organization.id,
    status: validation.values.status,
    supabase,
    timezone: validation.values.timezone,
  });

  if (error || !center) {
    redirect(getErrorPath(context.organization.id, getMutationError(error ?? undefined)));
  }

  await recordOperationalAuditEvent({
    action: "created",
    changedFields: {
      name: auditFieldTouched(),
      slug: auditFieldSet(slug),
      status: auditFieldSet(validation.values.status),
      timezone: auditFieldSet(validation.values.timezone),
    },
    entityId: center.id,
    entityType: "centers",
    organizationId: context.organization.id,
    supabase,
  });

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
  const { data: center, error } = await supabase
    .from("centers")
    .update({
      name: validation.values.name,
      timezone: validation.values.timezone,
      status: validation.values.status,
    })
    .eq("id", centerId)
    .eq("organization_id", context.organization.id)
    .select("id")
    .single();

  if (error || !center) {
    redirect(getErrorPath(context.organization.id, getMutationError(error ?? undefined)));
  }

  await recordOperationalAuditEvent({
    action: "updated",
    changedFields: {
      name: auditFieldTouched(),
      status: auditFieldSet(validation.values.status),
      timezone: auditFieldSet(validation.values.timezone),
    },
    entityId: center.id,
    entityType: "centers",
    organizationId: context.organization.id,
    supabase,
  });

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
  const { data: center, error } = await supabase
    .from("centers")
    .update({ status: nextStatus })
    .eq("id", centerId)
    .eq("organization_id", context.organization.id)
    .select("id")
    .single();

  if (error || !center) {
    redirect(getErrorPath(context.organization.id, getMutationError(error ?? undefined)));
  }

  await recordOperationalAuditEvent({
    action: nextStatus === "active" ? "reactivated" : "deactivated",
    changedFields: {
      status: auditFieldSet(nextStatus),
    },
    entityId: center.id,
    entityType: "centers",
    organizationId: context.organization.id,
    supabase,
  });

  redirect(
    getCentersPath({
      organizationId: context.organization.id,
      status: nextStatus === "active" ? "activated" : "deactivated",
    }),
  );
}
