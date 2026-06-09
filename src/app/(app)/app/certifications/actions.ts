"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getLoginPath } from "@/lib/auth/redirects";
import { canManageCertifications } from "@/lib/auth/permissions";
import {
  getActiveMemberships,
  getAuthenticatedUser,
  resolveActiveOrganization,
} from "@/lib/auth/tenant";
import {
  isUuid,
  validateCertificationForm,
} from "@/lib/certifications";
import { getCertificationsPath } from "@/lib/navigation/app-paths";
import { createClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

function getRequiredFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

function getErrorPath(organizationId: string | null, error: string) {
  return getCertificationsPath({
    organizationId,
    error,
  });
}

async function getCertificationActionContext(formData: FormData) {
  const organizationId = getRequiredFormString(formData, "organizationId");
  const redirectPath = getCertificationsPath({ organizationId });
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect(getLoginPath(redirectPath));
  }

  const memberships = await getActiveMemberships(user.id);
  const resolution = resolveActiveOrganization(memberships, organizationId);

  if (!resolution.ok) {
    redirect(getErrorPath(organizationId, resolution.reason));
  }

  if (!canManageCertifications(resolution.membership.role)) {
    redirect(getErrorPath(resolution.organization.id, "forbidden"));
  }

  return {
    organization: resolution.organization,
  };
}

function getMutationError(
  error?: { code?: string | null; message?: string | null } | null,
) {
  if (error?.code === "23505") {
    return "duplicate-title";
  }

  if (error?.code === "23503" || error?.message?.includes("coach")) {
    return "invalid-coach";
  }

  if (error?.code === "42501") {
    return "forbidden";
  }

  return "save-failed";
}

function getSelectedCoachProfileIds(formData: FormData) {
  const selected = new Set<string>();

  for (const value of formData.getAll("coachProfileId")) {
    if (typeof value !== "string") {
      return null;
    }

    const normalized = value.trim();

    if (!isUuid(normalized)) {
      return null;
    }

    selected.add(normalized);
  }

  return selected;
}

async function ensureCoachProfilesExist({
  coachProfileIds,
  organizationId,
  supabase,
}: {
  coachProfileIds: Set<string>;
  organizationId: string;
  supabase: SupabaseClient;
}) {
  if (coachProfileIds.size === 0) {
    return {
      ok: true as const,
    };
  }

  const { data, error } = await supabase
    .from("coach_profiles")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .in("id", [...coachProfileIds]);

  if (error) {
    return {
      error,
      ok: false as const,
    };
  }

  if ((data ?? []).length !== coachProfileIds.size) {
    return {
      error: null,
      ok: false as const,
    };
  }

  return {
    ok: true as const,
  };
}

async function syncCoachCertificationAssignments({
  certificationId,
  coachProfileIds,
  organizationId,
  supabase,
}: {
  certificationId: string;
  coachProfileIds: Set<string>;
  organizationId: string;
  supabase: SupabaseClient;
}) {
  const validation = await ensureCoachProfilesExist({
    coachProfileIds,
    organizationId,
    supabase,
  });

  if (!validation.ok) {
    return {
      error: validation.error,
      ok: false as const,
    };
  }

  const { data: existingRows, error: loadError } = await supabase
    .from("coach_certifications")
    .select("id, coach_profile_id, status")
    .eq("organization_id", organizationId)
    .eq("certification_id", certificationId);

  if (loadError) {
    return {
      error: loadError,
      ok: false as const,
    };
  }

  const existingByCoachId = new Map(
    (existingRows ?? []).map((row) => [row.coach_profile_id, row]),
  );
  const rowsToInsert = [...coachProfileIds]
    .filter((coachProfileId) => !existingByCoachId.has(coachProfileId))
    .map((coachProfileId) => ({
      certification_id: certificationId,
      coach_profile_id: coachProfileId,
      organization_id: organizationId,
      status: "active",
    }));
  const rowsToActivate = (existingRows ?? [])
    .filter(
      (row) =>
        coachProfileIds.has(row.coach_profile_id) && row.status !== "active",
    )
    .map((row) => row.id);
  const rowsToDeactivate = (existingRows ?? [])
    .filter(
      (row) =>
        !coachProfileIds.has(row.coach_profile_id) && row.status === "active",
    )
    .map((row) => row.id);

  if (rowsToInsert.length > 0) {
    const { error } = await supabase
      .from("coach_certifications")
      .insert(rowsToInsert);

    if (error) {
      return {
        error,
        ok: false as const,
      };
    }
  }

  if (rowsToActivate.length > 0) {
    const { error } = await supabase
      .from("coach_certifications")
      .update({ status: "active" })
      .eq("organization_id", organizationId)
      .in("id", rowsToActivate);

    if (error) {
      return {
        error,
        ok: false as const,
      };
    }
  }

  if (rowsToDeactivate.length > 0) {
    const { error } = await supabase
      .from("coach_certifications")
      .update({ status: "inactive" })
      .eq("organization_id", organizationId)
      .in("id", rowsToDeactivate);

    if (error) {
      return {
        error,
        ok: false as const,
      };
    }
  }

  return {
    ok: true as const,
  };
}

function revalidateCertificationDependants() {
  revalidatePath("/app", "layout");
  revalidatePath("/app/certifications");
  revalidatePath("/app/class-types");
  revalidatePath("/app/schedule");
  revalidatePath("/app/templates");
}

export async function createCertification(formData: FormData) {
  const context = await getCertificationActionContext(formData);
  const validation = validateCertificationForm(formData);
  const coachProfileIds = getSelectedCoachProfileIds(formData);

  if (!validation.ok) {
    redirect(getErrorPath(context.organization.id, validation.error));
  }

  if (coachProfileIds === null) {
    redirect(getErrorPath(context.organization.id, "invalid-coach"));
  }

  const supabase = await createClient();
  const { data: certification, error } = await supabase
    .from("certifications")
    .insert({
      description: validation.values.description,
      organization_id: context.organization.id,
      status: validation.values.status,
      title: validation.values.title,
    })
    .select("id")
    .single();

  if (error || !certification) {
    redirect(getErrorPath(context.organization.id, getMutationError(error)));
  }

  const syncResult = await syncCoachCertificationAssignments({
    certificationId: certification.id,
    coachProfileIds,
    organizationId: context.organization.id,
    supabase,
  });

  if (!syncResult.ok) {
    redirect(
      getErrorPath(context.organization.id, getMutationError(syncResult.error)),
    );
  }

  revalidateCertificationDependants();

  redirect(
    getCertificationsPath({
      organizationId: context.organization.id,
      status: "created",
    }),
  );
}

export async function updateCertification(formData: FormData) {
  const context = await getCertificationActionContext(formData);
  const certificationId = getRequiredFormString(formData, "certificationId");
  const validation = validateCertificationForm(formData);
  const coachProfileIds = getSelectedCoachProfileIds(formData);

  if (!isUuid(certificationId)) {
    redirect(getErrorPath(context.organization.id, "invalid-certification"));
  }

  if (!validation.ok) {
    redirect(getErrorPath(context.organization.id, validation.error));
  }

  if (coachProfileIds === null) {
    redirect(getErrorPath(context.organization.id, "invalid-coach"));
  }

  const supabase = await createClient();
  const { data: certification, error } = await supabase
    .from("certifications")
    .update({
      description: validation.values.description,
      status: validation.values.status,
      title: validation.values.title,
    })
    .eq("id", certificationId)
    .eq("organization_id", context.organization.id)
    .select("id")
    .single();

  if (error || !certification) {
    redirect(getErrorPath(context.organization.id, getMutationError(error)));
  }

  const syncResult = await syncCoachCertificationAssignments({
    certificationId,
    coachProfileIds,
    organizationId: context.organization.id,
    supabase,
  });

  if (!syncResult.ok) {
    redirect(
      getErrorPath(context.organization.id, getMutationError(syncResult.error)),
    );
  }

  revalidateCertificationDependants();

  redirect(
    getCertificationsPath({
      organizationId: context.organization.id,
      status: "updated",
    }),
  );
}
