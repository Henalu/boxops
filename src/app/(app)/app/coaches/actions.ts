"use server";

import { redirect } from "next/navigation";

import { getLoginPath } from "@/lib/auth/redirects";
import {
  getActiveMemberships,
  getAuthenticatedUser,
  resolveActiveOrganization,
} from "@/lib/auth/tenant";
import {
  validateCoachProfileCreateForm,
  validateCoachProfileUpdateForm,
  validateMembershipForm,
} from "@/lib/coaches";
import { getCoachesPath } from "@/lib/navigation/app-paths";
import { createClient } from "@/lib/supabase/server";

function getRequiredFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

function getErrorPath(organizationId: string | null, error: string) {
  return getCoachesPath({
    organizationId,
    error,
  });
}

async function getAdminActionContext(formData: FormData) {
  const organizationId = getRequiredFormString(formData, "organizationId");
  const redirectPath = getCoachesPath({ organizationId });
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
    user,
  };
}

function getMembershipMutationError(errorCode?: string) {
  if (errorCode === "23505") {
    return "duplicate-membership";
  }

  if (errorCode === "23503") {
    return "auth-user-not-found";
  }

  return "save-failed";
}

function getCoachProfileMutationError(errorCode?: string) {
  if (errorCode === "23505") {
    return "duplicate-profile";
  }

  if (errorCode === "23503") {
    return "invalid-profile-reference";
  }

  return "save-failed";
}

function getMembershipTimestamps(status: string, existing?: {
  invited_at: string | null;
  joined_at: string | null;
}) {
  const now = new Date().toISOString();

  return {
    invited_at:
      status === "invited" ? (existing?.invited_at ?? now) : existing?.invited_at,
    joined_at:
      status === "active" ? (existing?.joined_at ?? now) : existing?.joined_at,
  };
}

export async function createMembership(formData: FormData) {
  const context = await getAdminActionContext(formData);
  const validation = validateMembershipForm(formData);

  if (!validation.ok) {
    redirect(getErrorPath(context.organization.id, validation.error));
  }

  const supabase = await createClient();
  const { error } = await supabase.from("organization_memberships").insert({
    organization_id: context.organization.id,
    user_id: validation.values.userId,
    role: validation.values.role,
    status: validation.values.status,
    ...getMembershipTimestamps(validation.values.status),
  });

  if (error) {
    redirect(
      getErrorPath(
        context.organization.id,
        getMembershipMutationError(error.code),
      ),
    );
  }

  redirect(
    getCoachesPath({
      organizationId: context.organization.id,
      status: "membership-created",
    }),
  );
}

export async function updateMembership(formData: FormData) {
  const context = await getAdminActionContext(formData);
  const membershipId = getRequiredFormString(formData, "membershipId");
  const validation = validateMembershipForm(formData);

  if (!membershipId) {
    redirect(getErrorPath(context.organization.id, "membership-required"));
  }

  if (!validation.ok) {
    redirect(getErrorPath(context.organization.id, validation.error));
  }

  const supabase = await createClient();
  const { data: existingMembership, error: existingError } = await supabase
    .from("organization_memberships")
    .select("id, user_id, invited_at, joined_at")
    .eq("id", membershipId)
    .eq("organization_id", context.organization.id)
    .single();

  if (existingError || !existingMembership) {
    redirect(getErrorPath(context.organization.id, "membership-required"));
  }

  if (existingMembership.user_id === context.user.id) {
    redirect(getErrorPath(context.organization.id, "self-membership"));
  }

  const { error } = await supabase
    .from("organization_memberships")
    .update({
      role: validation.values.role,
      status: validation.values.status,
      ...getMembershipTimestamps(validation.values.status, existingMembership),
    })
    .eq("id", membershipId)
    .eq("organization_id", context.organization.id)
    .select("id")
    .single();

  if (error) {
    redirect(
      getErrorPath(
        context.organization.id,
        getMembershipMutationError(error.code),
      ),
    );
  }

  redirect(
    getCoachesPath({
      organizationId: context.organization.id,
      status: "membership-updated",
    }),
  );
}

export async function createCoachProfile(formData: FormData) {
  const context = await getAdminActionContext(formData);
  const validation = validateCoachProfileCreateForm(formData);

  if (!validation.ok) {
    redirect(getErrorPath(context.organization.id, validation.error));
  }

  const supabase = await createClient();
  const { data: membership, error: membershipError } = await supabase
    .from("organization_memberships")
    .select("id")
    .eq("organization_id", context.organization.id)
    .eq("user_id", validation.values.userId)
    .maybeSingle();

  if (membershipError || !membership) {
    redirect(getErrorPath(context.organization.id, "membership-required"));
  }

  const { error } = await supabase.from("coach_profiles").insert({
    organization_id: context.organization.id,
    user_id: validation.values.userId,
    primary_center_id: validation.values.primaryCenterId,
    weekly_contracted_hours: validation.values.weeklyContractedHours,
    status: validation.values.status,
    notes: validation.values.notes,
  });

  if (error) {
    redirect(
      getErrorPath(
        context.organization.id,
        getCoachProfileMutationError(error.code),
      ),
    );
  }

  redirect(
    getCoachesPath({
      organizationId: context.organization.id,
      status: "profile-created",
    }),
  );
}

export async function updateCoachProfile(formData: FormData) {
  const context = await getAdminActionContext(formData);
  const coachProfileId = getRequiredFormString(formData, "coachProfileId");
  const validation = validateCoachProfileUpdateForm(formData);

  if (!coachProfileId) {
    redirect(getErrorPath(context.organization.id, "profile-required"));
  }

  if (!validation.ok) {
    redirect(getErrorPath(context.organization.id, validation.error));
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("coach_profiles")
    .update({
      primary_center_id: validation.values.primaryCenterId,
      weekly_contracted_hours: validation.values.weeklyContractedHours,
      status: validation.values.status,
      notes: validation.values.notes,
    })
    .eq("id", coachProfileId)
    .eq("organization_id", context.organization.id)
    .select("id")
    .single();

  if (error) {
    redirect(
      getErrorPath(
        context.organization.id,
        getCoachProfileMutationError(error.code),
      ),
    );
  }

  redirect(
    getCoachesPath({
      organizationId: context.organization.id,
      status: "profile-updated",
    }),
  );
}
