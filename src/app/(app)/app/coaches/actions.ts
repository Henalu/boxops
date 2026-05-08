"use server";

import { redirect } from "next/navigation";

import { getLoginPath } from "@/lib/auth/redirects";
import {
  canManageOperationalTeamProfiles,
  canManageTeamAccess,
} from "@/lib/auth/permissions";
import {
  getActiveMemberships,
  getAuthenticatedUser,
  resolveActiveOrganization,
} from "@/lib/auth/tenant";
import {
  isMembershipRole,
  validateCoachAccountLinkForm,
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

async function getCoachActionContext(
  formData: FormData,
  permission: "team-access" | "team-profiles",
) {
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

  const canManage =
    permission === "team-access"
      ? canManageTeamAccess(resolution.membership.role)
      : canManageOperationalTeamProfiles(resolution.membership.role);

  if (!canManage) {
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

function getCoachAccountLinkMutationError(errorCode?: string) {
  if (errorCode === "23505") {
    return "account-link-conflict";
  }

  if (errorCode === "23503") {
    return "auth-user-not-found";
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
  const context = await getCoachActionContext(formData, "team-access");
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
  const context = await getCoachActionContext(formData, "team-access");
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
  const context = await getCoachActionContext(formData, "team-profiles");
  const validation = validateCoachProfileCreateForm(formData);

  if (!validation.ok) {
    redirect(getErrorPath(context.organization.id, validation.error));
  }

  const supabase = await createClient();
  const { data: membership, error: membershipError } = await supabase
    .from("organization_memberships")
    .select("id, role")
    .eq("organization_id", context.organization.id)
    .eq("user_id", validation.values.userId)
    .maybeSingle();

  if (membershipError || !membership) {
    redirect(getErrorPath(context.organization.id, "membership-required"));
  }

  if (!isMembershipRole(membership.role)) {
    redirect(getErrorPath(context.organization.id, "invalid-role"));
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
  const context = await getCoachActionContext(formData, "team-profiles");
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

export async function linkCoachProfileToExistingAccount(formData: FormData) {
  const context = await getCoachActionContext(formData, "team-access");
  const validation = validateCoachAccountLinkForm(formData);

  if (!validation.ok) {
    redirect(getErrorPath(context.organization.id, validation.error));
  }

  const supabase = await createClient();
  const { data: coachProfile, error: coachProfileError } = await supabase
    .from("coach_profiles")
    .select("id, organization_id, person_profile_id, status, user_id")
    .eq("id", validation.values.coachProfileId)
    .eq("organization_id", context.organization.id)
    .maybeSingle();

  if (coachProfileError || !coachProfile) {
    redirect(getErrorPath(context.organization.id, "profile-required"));
  }

  if (!coachProfile.person_profile_id) {
    redirect(getErrorPath(context.organization.id, "profile-without-person"));
  }

  if (coachProfile.status !== "active") {
    redirect(getErrorPath(context.organization.id, "profile-inactive"));
  }

  const { data: personProfile, error: personProfileError } = await supabase
    .from("person_profiles")
    .select("id, status, user_id, visibility_status")
    .eq("id", coachProfile.person_profile_id)
    .eq("organization_id", context.organization.id)
    .maybeSingle();

  if (personProfileError || !personProfile) {
    redirect(getErrorPath(context.organization.id, "invalid-person-profile"));
  }

  if (personProfile.status !== "active") {
    redirect(getErrorPath(context.organization.id, "person-profile-inactive"));
  }

  if (personProfile.visibility_status !== "visible") {
    redirect(getErrorPath(context.organization.id, "person-profile-internal"));
  }

  if (
    personProfile.user_id &&
    personProfile.user_id !== validation.values.userId
  ) {
    redirect(getErrorPath(context.organization.id, "person-user-conflict"));
  }

  if (coachProfile.user_id && coachProfile.user_id !== validation.values.userId) {
    redirect(getErrorPath(context.organization.id, "coach-user-conflict"));
  }

  const [
    existingMembershipResult,
    conflictingPersonResult,
    conflictingCoachResult,
  ] = await Promise.all([
    supabase
      .from("organization_memberships")
      .select("id, user_id, role, status, invited_at, joined_at")
      .eq("organization_id", context.organization.id)
      .eq("user_id", validation.values.userId)
      .maybeSingle(),
    supabase
      .from("person_profiles")
      .select("id")
      .eq("organization_id", context.organization.id)
      .eq("user_id", validation.values.userId)
      .neq("id", personProfile.id)
      .maybeSingle(),
    supabase
      .from("coach_profiles")
      .select("id")
      .eq("organization_id", context.organization.id)
      .eq("user_id", validation.values.userId)
      .neq("id", coachProfile.id)
      .maybeSingle(),
  ]);

  if (existingMembershipResult.error) {
    redirect(getErrorPath(context.organization.id, "save-failed"));
  }

  if (conflictingPersonResult.error) {
    redirect(getErrorPath(context.organization.id, "save-failed"));
  }

  if (conflictingCoachResult.error) {
    redirect(getErrorPath(context.organization.id, "save-failed"));
  }

  if (conflictingPersonResult.data) {
    redirect(
      getErrorPath(context.organization.id, "account-linked-to-other-person"),
    );
  }

  if (conflictingCoachResult.data) {
    redirect(
      getErrorPath(context.organization.id, "account-linked-to-other-coach"),
    );
  }

  const existingMembership = existingMembershipResult.data;

  if (existingMembership) {
    const protectsCurrentAdmin = existingMembership.user_id === context.user.id;
    const wouldChangeOwnMembership =
      existingMembership.role !== validation.values.role ||
      existingMembership.status !== validation.values.status;

    if (protectsCurrentAdmin && wouldChangeOwnMembership) {
      redirect(getErrorPath(context.organization.id, "self-membership"));
    }

    if (!protectsCurrentAdmin) {
      const { error: membershipUpdateError } = await supabase
        .from("organization_memberships")
        .update({
          role: validation.values.role,
          status: validation.values.status,
          ...getMembershipTimestamps(
            validation.values.status,
            existingMembership,
          ),
        })
        .eq("id", existingMembership.id)
        .eq("organization_id", context.organization.id)
        .select("id")
        .single();

      if (membershipUpdateError) {
        redirect(
          getErrorPath(
            context.organization.id,
            getCoachAccountLinkMutationError(membershipUpdateError.code),
          ),
        );
      }
    }
  } else {
    const { error: membershipInsertError } = await supabase
      .from("organization_memberships")
      .insert({
        organization_id: context.organization.id,
        user_id: validation.values.userId,
        role: validation.values.role,
        status: validation.values.status,
        ...getMembershipTimestamps(validation.values.status),
      });

    if (membershipInsertError) {
      redirect(
        getErrorPath(
          context.organization.id,
          getCoachAccountLinkMutationError(membershipInsertError.code),
        ),
      );
    }
  }

  if (personProfile.user_id !== validation.values.userId) {
    const { error: personProfileUpdateError } = await supabase
      .from("person_profiles")
      .update({ user_id: validation.values.userId })
      .eq("id", personProfile.id)
      .eq("organization_id", context.organization.id)
      .select("id")
      .single();

    if (personProfileUpdateError) {
      redirect(
        getErrorPath(
          context.organization.id,
          getCoachAccountLinkMutationError(personProfileUpdateError.code),
        ),
      );
    }
  }

  if (coachProfile.user_id !== validation.values.userId) {
    const { error: coachProfileUpdateError } = await supabase
      .from("coach_profiles")
      .update({ user_id: validation.values.userId })
      .eq("id", coachProfile.id)
      .eq("organization_id", context.organization.id)
      .select("id")
      .single();

    if (coachProfileUpdateError) {
      redirect(
        getErrorPath(
          context.organization.id,
          getCoachAccountLinkMutationError(coachProfileUpdateError.code),
        ),
      );
    }
  }

  redirect(
    getCoachesPath({
      organizationId: context.organization.id,
      status: "account-linked",
    }),
  );
}
