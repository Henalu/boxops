"use server";

import { redirect } from "next/navigation";

import { getLoginPath } from "@/lib/auth/redirects";
import {
  canDeleteOperationalTeamProfiles,
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
  validateDirectTeamAccountCreateForm,
  validateMembershipForm,
} from "@/lib/coaches";
import { sendTransactionalEmail } from "@/lib/email/resend";
import { getCoachesPath } from "@/lib/navigation/app-paths";
import {
  addAuditFieldChange,
  auditFieldSet,
  auditFieldTouched,
  recordOperationalAuditEvent,
  type OperationalAuditChangedFields,
} from "@/lib/operational-audit";
import { buildRequiredPasswordChangeAppMetadata } from "@/lib/auth/required-password-change";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  buildTeamInvitationEmail,
  generateInvitationToken,
  getInvitationAcceptUrl,
  getInvitationExpiryDate,
  hashInvitationToken,
  isValidInvitationEmail,
  normalizeInvitationEmail,
  TEAM_INVITATION_INITIAL_ACCESS_STATUSES,
} from "@/lib/team-invitations";
import { isPostgresUuid } from "@/lib/uuid";

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
  permission: "team-access" | "team-profile-delete" | "team-profiles",
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
      : permission === "team-profile-delete"
        ? canDeleteOperationalTeamProfiles(resolution.membership.role)
      : canManageOperationalTeamProfiles(resolution.membership.role);

  if (!canManage) {
    redirect(getErrorPath(resolution.organization.id, "forbidden"));
  }

  return {
    membership: resolution.membership,
    organization: resolution.organization,
    user,
  };
}

function getOptionalFormUuid(formData: FormData, key: string) {
  const value = getRequiredFormString(formData, key);

  if (!value || value === "none") {
    return null;
  }

  return isPostgresUuid(value) ? value : undefined;
}

function parseWeeklyHours(value: string) {
  const normalizedValue = value.replace(",", ".");
  const hours = Number(normalizedValue);

  if (!Number.isFinite(hours) || hours < 0 || hours > 168) {
    return null;
  }

  return Math.round(hours * 100) / 100;
}

function isInitialAccessStatus(value: string) {
  return TEAM_INVITATION_INITIAL_ACCESS_STATUSES.includes(
    value as (typeof TEAM_INVITATION_INITIAL_ACCESS_STATUSES)[number],
  );
}

function getTeamInvitationMutationError(errorCode?: string) {
  if (errorCode === "23505") {
    return "duplicate-invitation";
  }

  if (errorCode === "23503") {
    return "invalid-profile-reference";
  }

  return "save-failed";
}

function getSafeInvitationEmailErrorMessage(errorCode: string) {
  if (errorCode === "email-not-configured") {
    return "El envio de email no esta configurado para este entorno.";
  }

  return "No se pudo entregar el email.";
}

function validateTeamInvitationForm(formData: FormData) {
  const rawEmail = getRequiredFormString(formData, "email");
  const email = normalizeInvitationEmail(rawEmail);
  const rawRole = getRequiredFormString(formData, "role") || "coach";
  const rawInitialAccessStatus =
    getRequiredFormString(formData, "initialAccessStatus") || "active";
  const rawCoachProfileId = getRequiredFormString(formData, "coachProfileId");
  const displayName = getRequiredFormString(formData, "displayName");
  const primaryCenterId = getOptionalFormUuid(formData, "primaryCenterId");
  const weeklyContractedHours = parseWeeklyHours(
    getRequiredFormString(formData, "weeklyContractedHours") || "0",
  );
  const notes = getRequiredFormString(formData, "notes");

  if (!email || !rawRole || !rawInitialAccessStatus || !rawCoachProfileId) {
    return { error: "missing-fields" as const, ok: false as const };
  }

  if (!isValidInvitationEmail(email)) {
    return { error: "invalid-email" as const, ok: false as const };
  }

  if (!isMembershipRole(rawRole)) {
    return { error: "invalid-role" as const, ok: false as const };
  }

  if (!isInitialAccessStatus(rawInitialAccessStatus)) {
    return { error: "invalid-status" as const, ok: false as const };
  }

  if (primaryCenterId === undefined) {
    return { error: "invalid-center" as const, ok: false as const };
  }

  if (weeklyContractedHours === null) {
    return { error: "invalid-hours" as const, ok: false as const };
  }

  if (notes.length > 1000) {
    return { error: "notes-too-long" as const, ok: false as const };
  }

  if (rawCoachProfileId === "new" && !displayName) {
    return { error: "missing-fields" as const, ok: false as const };
  }

  if (rawCoachProfileId !== "new" && !isPostgresUuid(rawCoachProfileId)) {
    return { error: "invalid-profile-id" as const, ok: false as const };
  }

  return {
    ok: true as const,
    values: {
      coachProfileId:
        rawCoachProfileId === "new" ? null : rawCoachProfileId,
      displayName,
      email,
      initialAccessStatus: rawInitialAccessStatus,
      notes: notes || null,
      primaryCenterId,
      role: rawRole,
      weeklyContractedHours,
    },
  };
}

async function ensureCenterBelongsToOrganization(
  organizationId: string,
  centerId: string | null,
) {
  if (!centerId) {
    return true;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("centers")
    .select("id")
    .eq("id", centerId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  return !error && Boolean(data);
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

function getCoachProfileDeleteMutationError(errorCode?: string) {
  if (errorCode === "23503") {
    return "profile-delete-operational-history";
  }

  return getCoachProfileMutationError(errorCode);
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

function getDirectAccountAuthCreateError(error?: {
  message?: string;
  status?: number;
} | null) {
  const message = error?.message?.toLowerCase() ?? "";

  if (
    error?.status === 422 ||
    message.includes("already") ||
    message.includes("exists") ||
    message.includes("registered")
  ) {
    return "account-email-already-exists";
  }

  return "auth-account-create-failed";
}

async function rollbackDirectAccountCreation({
  authAdmin,
  coachProfileId,
  membershipId,
  organizationId,
  personProfileId,
  supabase,
  userId,
}: {
  authAdmin: ReturnType<typeof createAdminClient>;
  coachProfileId: string | null;
  membershipId: string | null;
  organizationId: string;
  personProfileId: string | null;
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
}) {
  let ok = true;

  if (coachProfileId) {
    const { error } = await supabase
      .from("coach_profiles")
      .delete()
      .eq("id", coachProfileId)
      .eq("organization_id", organizationId);

    ok = ok && !error;
  }

  if (personProfileId) {
    const { error } = await supabase
      .from("person_profiles")
      .delete()
      .eq("id", personProfileId)
      .eq("organization_id", organizationId);

    ok = ok && !error;
  }

  if (membershipId) {
    const { error } = await supabase
      .from("organization_memberships")
      .delete()
      .eq("id", membershipId)
      .eq("organization_id", organizationId);

    ok = ok && !error;
  }

  const { error } = await authAdmin.auth.admin.deleteUser(userId);

  return ok && !error;
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

function getCoachProfileAuditFields({
  notesChanged,
  primaryCenterId,
  status,
  weeklyContractedHours,
}: {
  notesChanged?: boolean;
  primaryCenterId: string | null;
  status: string;
  weeklyContractedHours: number;
}): OperationalAuditChangedFields {
  return {
    ...(notesChanged ? { notes: auditFieldTouched() } : {}),
    primary_center_id: auditFieldSet(primaryCenterId),
    status: auditFieldSet(status),
    weekly_contracted_hours: auditFieldSet(weeklyContractedHours),
  };
}

async function sendInvitationEmailAndMarkSent({
  email,
  invitationId,
  invitedByName,
  organizationId,
  organizationName,
  recipientName,
  token,
}: {
  email: string;
  invitationId: string;
  invitedByName: string;
  organizationId: string;
  organizationName: string;
  recipientName: string;
  token: string;
}) {
  const acceptUrl = await getInvitationAcceptUrl(invitationId, token);
  const emailContent = buildTeamInvitationEmail({
    acceptUrl,
    invitedByName,
    organizationName,
    recipientName,
  });
  const sendResult = await sendTransactionalEmail({
    html: emailContent.html,
    subject: emailContent.subject,
    text: emailContent.text,
    to: email,
  });
  const supabase = await createClient();

  if (!sendResult.ok) {
    await supabase
      .from("team_invitations")
      .update({
        last_error: getSafeInvitationEmailErrorMessage(sendResult.code),
        status: "failed",
      })
      .eq("id", invitationId)
      .eq("organization_id", organizationId);

    return sendResult.code;
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("team_invitations")
    .update({
      last_error: null,
      last_sent_at: now,
      provider_message_id: sendResult.id,
      send_count: 1,
      sent_at: now,
      status: "sent",
    })
    .eq("id", invitationId)
    .eq("organization_id", organizationId)
    .select("id")
    .single();

  return error ? "save-failed" : null;
}

export async function createTeamInvitation(formData: FormData) {
  const context = await getCoachActionContext(formData, "team-access");
  const validation = validateTeamInvitationForm(formData);

  if (!validation.ok) {
    redirect(getErrorPath(context.organization.id, validation.error));
  }

  const centerIsValid = await ensureCenterBelongsToOrganization(
    context.organization.id,
    validation.values.primaryCenterId,
  );

  if (!centerIsValid) {
    redirect(getErrorPath(context.organization.id, "invalid-center"));
  }

  const supabase = await createClient();
  const { data: existingInvitation, error: existingInvitationError } =
    await supabase
      .from("team_invitations")
      .select("id")
      .eq("organization_id", context.organization.id)
      .eq("email_normalized", validation.values.email)
      .in("status", ["pending", "sent"])
      .maybeSingle();

  if (existingInvitationError) {
    redirect(getErrorPath(context.organization.id, "save-failed"));
  }

  if (existingInvitation) {
    redirect(getErrorPath(context.organization.id, "duplicate-invitation"));
  }

  let personProfileId: string;
  let coachProfileId: string | null;
  let recipientName: string;

  if (validation.values.coachProfileId) {
    const { data: coachProfile, error: coachProfileError } = await supabase
      .from("coach_profiles")
      .select(
        "id, organization_id, notes, person_profile_id, primary_center_id, status, user_id, weekly_contracted_hours",
      )
      .eq("id", validation.values.coachProfileId)
      .eq("organization_id", context.organization.id)
      .maybeSingle();

    if (coachProfileError || !coachProfile) {
      redirect(getErrorPath(context.organization.id, "profile-required"));
    }

    if (coachProfile.status !== "active") {
      redirect(getErrorPath(context.organization.id, "profile-inactive"));
    }

    if (coachProfile.user_id || !coachProfile.person_profile_id) {
      redirect(getErrorPath(context.organization.id, "account-link-conflict"));
    }

    const { data: personProfile, error: personProfileError } = await supabase
      .from("person_profiles")
      .select("id, display_name, status, user_id, visibility_status")
      .eq("id", coachProfile.person_profile_id)
      .eq("organization_id", context.organization.id)
      .maybeSingle();

    if (personProfileError || !personProfile) {
      redirect(getErrorPath(context.organization.id, "invalid-person-profile"));
    }

    if (personProfile.user_id) {
      redirect(getErrorPath(context.organization.id, "person-user-conflict"));
    }

    if (personProfile.status !== "active") {
      redirect(getErrorPath(context.organization.id, "person-profile-inactive"));
    }

    if (personProfile.visibility_status !== "visible") {
      redirect(getErrorPath(context.organization.id, "person-profile-internal"));
    }

    const { error: coachUpdateError } = await supabase
      .from("coach_profiles")
      .update({
        notes: validation.values.notes,
        primary_center_id: validation.values.primaryCenterId,
        weekly_contracted_hours: validation.values.weeklyContractedHours,
      })
      .eq("id", coachProfile.id)
      .eq("organization_id", context.organization.id)
      .select("id")
      .single();

    if (coachUpdateError) {
      redirect(
        getErrorPath(
          context.organization.id,
          getCoachProfileMutationError(coachUpdateError.code),
        ),
      );
    }

    const changedFields: OperationalAuditChangedFields = {};
    addAuditFieldChange(
      changedFields,
      "primary_center_id",
      coachProfile.primary_center_id,
      validation.values.primaryCenterId,
    );
    addAuditFieldChange(
      changedFields,
      "weekly_contracted_hours",
      Number(coachProfile.weekly_contracted_hours ?? 0),
      validation.values.weeklyContractedHours,
    );

    if ((coachProfile.notes ?? null) !== validation.values.notes) {
      changedFields.notes = auditFieldTouched();
    }

    if (Object.keys(changedFields).length > 0) {
      await recordOperationalAuditEvent({
        action: "updated",
        changedFields,
        entityId: coachProfile.id,
        entityType: "coach_profiles",
        organizationId: context.organization.id,
        supabase,
      });
    }

    personProfileId = personProfile.id;
    coachProfileId = coachProfile.id;
    recipientName = personProfile.display_name;
  } else {
    const { data: personProfile, error: personProfileError } = await supabase
      .from("person_profiles")
      .insert({
        display_name: validation.values.displayName,
        organization_id: context.organization.id,
        status: "active",
        visibility_status: "visible",
      })
      .select("id, display_name")
      .single();

    if (personProfileError || !personProfile) {
      redirect(getErrorPath(context.organization.id, "save-failed"));
    }

    const { data: coachProfile, error: coachProfileError } = await supabase
      .from("coach_profiles")
      .insert({
        notes: validation.values.notes,
        organization_id: context.organization.id,
        person_profile_id: personProfile.id,
        primary_center_id: validation.values.primaryCenterId,
        status: "active",
        weekly_contracted_hours: validation.values.weeklyContractedHours,
      })
      .select("id")
      .single();

    if (coachProfileError || !coachProfile) {
      redirect(
        getErrorPath(
          context.organization.id,
          getCoachProfileMutationError(coachProfileError?.code),
        ),
      );
    }

    personProfileId = personProfile.id;
    coachProfileId = coachProfile.id;
    recipientName = personProfile.display_name;

    await recordOperationalAuditEvent({
      action: "created",
      changedFields: {
        display_name: auditFieldTouched(),
        status: auditFieldSet("active"),
        visibility_status: auditFieldSet("visible"),
      },
      entityId: personProfile.id,
      entityType: "person_profiles",
      organizationId: context.organization.id,
      supabase,
    });

    await recordOperationalAuditEvent({
      action: "created",
      changedFields: getCoachProfileAuditFields({
        notesChanged: Boolean(validation.values.notes),
        primaryCenterId: validation.values.primaryCenterId,
        status: "active",
        weeklyContractedHours: validation.values.weeklyContractedHours,
      }),
      entityId: coachProfile.id,
      entityType: "coach_profiles",
      organizationId: context.organization.id,
      supabase,
    });
  }

  const token = generateInvitationToken();
  const { data: invitation, error: invitationError } = await supabase
    .from("team_invitations")
    .insert({
      coach_profile_id: coachProfileId,
      email: validation.values.email,
      email_normalized: validation.values.email,
      expires_at: getInvitationExpiryDate().toISOString(),
      initial_access_status: validation.values.initialAccessStatus,
      invited_by_membership_id: context.membership.id,
      invited_by_user_id: context.user.id,
      organization_id: context.organization.id,
      person_profile_id: personProfileId,
      role: validation.values.role,
      status: "pending",
      token_hash: hashInvitationToken(token),
    })
    .select("id")
    .single();

  if (invitationError || !invitation) {
    redirect(
      getErrorPath(
        context.organization.id,
        getTeamInvitationMutationError(invitationError?.code),
      ),
    );
  }

  const emailError = await sendInvitationEmailAndMarkSent({
    email: validation.values.email,
    invitationId: invitation.id,
    invitedByName: context.user.email ?? "BoxOps",
    organizationId: context.organization.id,
    organizationName: context.organization.name,
    recipientName,
    token,
  });

  if (emailError) {
    redirect(getErrorPath(context.organization.id, emailError));
  }

  await recordOperationalAuditEvent({
    action: "created",
    changedFields: {
      coach_profile_id: auditFieldSet(coachProfileId),
      initial_access_status: auditFieldSet(
        validation.values.initialAccessStatus,
      ),
      person_profile_id: auditFieldSet(personProfileId),
      role: auditFieldSet(validation.values.role),
      status: auditFieldSet("sent"),
    },
    entityId: invitation.id,
    entityType: "team_invitations",
    organizationId: context.organization.id,
    supabase,
  });

  redirect(
    getCoachesPath({
      organizationId: context.organization.id,
      status: "invitation-sent",
    }),
  );
}

export async function createDirectTeamAccount(formData: FormData) {
  const context = await getCoachActionContext(formData, "team-access");
  const validation = validateDirectTeamAccountCreateForm(formData);

  if (!validation.ok) {
    redirect(getErrorPath(context.organization.id, validation.error));
  }

  const centerIsValid = await ensureCenterBelongsToOrganization(
    context.organization.id,
    validation.values.primaryCenterId,
  );

  if (!centerIsValid) {
    redirect(getErrorPath(context.organization.id, "invalid-center"));
  }

  let authAdmin: ReturnType<typeof createAdminClient>;

  try {
    authAdmin = createAdminClient();
  } catch {
    redirect(getErrorPath(context.organization.id, "auth-admin-not-configured"));
  }

  const { data: authUserData, error: authUserError } =
    await authAdmin.auth.admin.createUser({
      app_metadata: buildRequiredPasswordChangeAppMetadata(),
      email: validation.values.email,
      email_confirm: true,
      password: validation.values.password,
      user_metadata: {
        display_name: validation.values.displayName,
      },
    });

  if (authUserError || !authUserData.user) {
    redirect(
      getErrorPath(
        context.organization.id,
        getDirectAccountAuthCreateError(authUserError),
      ),
    );
  }

  const createdUserId = authUserData.user.id;
  const supabase = await createClient();
  let membershipId: string | null = null;
  let personProfileId: string | null = null;
  let coachProfileId: string | null = null;

  const { data: membership, error: membershipError } = await supabase
    .from("organization_memberships")
    .insert({
      organization_id: context.organization.id,
      role: validation.values.role,
      status: validation.values.initialAccessStatus,
      user_id: createdUserId,
      ...getMembershipTimestamps(validation.values.initialAccessStatus),
    })
    .select("id")
    .single();

  if (membershipError || !membership) {
    await authAdmin.auth.admin.deleteUser(createdUserId);
    redirect(
      getErrorPath(
        context.organization.id,
        getMembershipMutationError(membershipError?.code),
      ),
    );
  }

  membershipId = membership.id;

  const { data: personProfile, error: personProfileError } = await supabase
    .from("person_profiles")
    .insert({
      display_name: validation.values.displayName,
      organization_id: context.organization.id,
      status: "active",
      user_id: createdUserId,
      visibility_status: "visible",
    })
    .select("id")
    .single();

  if (personProfileError || !personProfile) {
    const rollbackOk = await rollbackDirectAccountCreation({
      authAdmin,
      coachProfileId,
      membershipId,
      organizationId: context.organization.id,
      personProfileId,
      supabase,
      userId: createdUserId,
    });

    redirect(
      getErrorPath(
        context.organization.id,
        rollbackOk ? "save-failed" : "account-create-rollback-failed",
      ),
    );
  }

  personProfileId = personProfile.id;

  const { data: coachProfile, error: coachProfileError } = await supabase
    .from("coach_profiles")
    .insert({
      notes: validation.values.notes,
      organization_id: context.organization.id,
      person_profile_id: personProfile.id,
      primary_center_id: validation.values.primaryCenterId,
      status: "active",
      user_id: createdUserId,
      weekly_contracted_hours: validation.values.weeklyContractedHours,
    })
    .select("id")
    .single();

  if (coachProfileError || !coachProfile) {
    const rollbackOk = await rollbackDirectAccountCreation({
      authAdmin,
      coachProfileId,
      membershipId,
      organizationId: context.organization.id,
      personProfileId,
      supabase,
      userId: createdUserId,
    });

    redirect(
      getErrorPath(
        context.organization.id,
        rollbackOk
          ? getCoachProfileMutationError(coachProfileError?.code)
          : "account-create-rollback-failed",
      ),
    );
  }

  coachProfileId = coachProfile.id;

  await recordOperationalAuditEvent({
    action: "created",
    changedFields: {
      role: auditFieldSet(validation.values.role),
      status: auditFieldSet(validation.values.initialAccessStatus),
    },
    entityId: membership.id,
    entityType: "organization_memberships",
    organizationId: context.organization.id,
    supabase,
  });

  await recordOperationalAuditEvent({
    action: "created",
    changedFields: {
      display_name: auditFieldTouched(),
      status: auditFieldSet("active"),
      user_id: auditFieldTouched(),
      visibility_status: auditFieldSet("visible"),
    },
    entityId: personProfile.id,
    entityType: "person_profiles",
    organizationId: context.organization.id,
    supabase,
  });

  await recordOperationalAuditEvent({
    action: "created",
    changedFields: {
      ...getCoachProfileAuditFields({
        notesChanged: Boolean(validation.values.notes),
        primaryCenterId: validation.values.primaryCenterId,
        status: "active",
        weeklyContractedHours: validation.values.weeklyContractedHours,
      }),
      person_profile_id: auditFieldSet(personProfile.id),
      user_id: auditFieldTouched(),
    },
    entityId: coachProfile.id,
    entityType: "coach_profiles",
    organizationId: context.organization.id,
    supabase,
  });

  redirect(
    getCoachesPath({
      organizationId: context.organization.id,
      status: "account-created",
    }),
  );
}

export async function resendTeamInvitation(formData: FormData) {
  const context = await getCoachActionContext(formData, "team-access");
  const invitationId = getRequiredFormString(formData, "invitationId");

  if (!isPostgresUuid(invitationId)) {
    redirect(getErrorPath(context.organization.id, "invalid-invitation-id"));
  }

  const supabase = await createClient();
  const { data: invitation, error: invitationError } = await supabase
    .from("team_invitations")
    .select(
      "id, organization_id, email_normalized, person_profile_id, status, last_sent_at",
    )
    .eq("id", invitationId)
    .eq("organization_id", context.organization.id)
    .maybeSingle();

  if (invitationError || !invitation) {
    redirect(getErrorPath(context.organization.id, "invitation-required"));
  }

  if (invitation.status === "accepted" || invitation.status === "cancelled") {
    redirect(getErrorPath(context.organization.id, "invitation-closed"));
  }

  if (
    invitation.last_sent_at &&
    Date.now() - new Date(invitation.last_sent_at).getTime() < 60_000
  ) {
    redirect(getErrorPath(context.organization.id, "invitation-rate-limited"));
  }

  const { data: personProfile, error: personProfileError } = await supabase
    .from("person_profiles")
    .select("display_name")
    .eq("id", invitation.person_profile_id)
    .eq("organization_id", context.organization.id)
    .maybeSingle();

  if (personProfileError || !personProfile) {
    redirect(getErrorPath(context.organization.id, "invalid-person-profile"));
  }

  const token = generateInvitationToken();
  const { error: tokenUpdateError } = await supabase
    .from("team_invitations")
    .update({
      expires_at: getInvitationExpiryDate().toISOString(),
      last_error: null,
      status: "pending",
      token_hash: hashInvitationToken(token),
    })
    .eq("id", invitation.id)
    .eq("organization_id", context.organization.id)
    .select("id")
    .single();

  if (tokenUpdateError) {
    redirect(getErrorPath(context.organization.id, "save-failed"));
  }

  const emailError = await sendInvitationEmailAndMarkSent({
    email: invitation.email_normalized,
    invitationId: invitation.id,
    invitedByName: context.user.email ?? "BoxOps",
    organizationId: context.organization.id,
    organizationName: context.organization.name,
    recipientName: personProfile.display_name,
    token,
  });

  if (emailError) {
    redirect(getErrorPath(context.organization.id, emailError));
  }

  await recordOperationalAuditEvent({
    action: "resent",
    changedFields: {
      expires_at: auditFieldTouched(),
      last_sent_at: auditFieldTouched(),
      status: auditFieldSet("sent"),
    },
    entityId: invitation.id,
    entityType: "team_invitations",
    organizationId: context.organization.id,
    supabase,
  });

  redirect(
    getCoachesPath({
      organizationId: context.organization.id,
      status: "invitation-resent",
    }),
  );
}

export async function cancelTeamInvitation(formData: FormData) {
  const context = await getCoachActionContext(formData, "team-access");
  const invitationId = getRequiredFormString(formData, "invitationId");

  if (!isPostgresUuid(invitationId)) {
    redirect(getErrorPath(context.organization.id, "invalid-invitation-id"));
  }

  const supabase = await createClient();
  const { data: invitation, error } = await supabase
    .from("team_invitations")
    .update({ status: "cancelled" })
    .eq("id", invitationId)
    .eq("organization_id", context.organization.id)
    .neq("status", "accepted")
    .select("id")
    .single();

  if (error || !invitation) {
    redirect(getErrorPath(context.organization.id, "save-failed"));
  }

  await recordOperationalAuditEvent({
    action: "cancelled",
    changedFields: {
      status: auditFieldSet("cancelled"),
    },
    entityId: invitation.id,
    entityType: "team_invitations",
    organizationId: context.organization.id,
    supabase,
  });

  redirect(
    getCoachesPath({
      organizationId: context.organization.id,
      status: "invitation-cancelled",
    }),
  );
}

export async function createMembership(formData: FormData) {
  const context = await getCoachActionContext(formData, "team-access");
  const validation = validateMembershipForm(formData);

  if (!validation.ok) {
    redirect(getErrorPath(context.organization.id, validation.error));
  }

  const supabase = await createClient();
  const { data: membership, error } = await supabase
    .from("organization_memberships")
    .insert({
      organization_id: context.organization.id,
      user_id: validation.values.userId,
      role: validation.values.role,
      status: validation.values.status,
      ...getMembershipTimestamps(validation.values.status),
    })
    .select("id")
    .single();

  if (error || !membership) {
    redirect(
      getErrorPath(
        context.organization.id,
        getMembershipMutationError(error?.code),
      ),
    );
  }

  await recordOperationalAuditEvent({
    action: "created",
    changedFields: {
      role: auditFieldSet(validation.values.role),
      status: auditFieldSet(validation.values.status),
    },
    entityId: membership.id,
    entityType: "organization_memberships",
    organizationId: context.organization.id,
    supabase,
  });

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
    .select("id, user_id, role, status, invited_at, joined_at")
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

  const membershipChangedFields: OperationalAuditChangedFields = {};
  addAuditFieldChange(
    membershipChangedFields,
    "role",
    existingMembership.role,
    validation.values.role,
  );
  addAuditFieldChange(
    membershipChangedFields,
    "status",
    existingMembership.status,
    validation.values.status,
  );

  await recordOperationalAuditEvent({
    action: "updated",
    changedFields: membershipChangedFields,
    entityId: existingMembership.id,
    entityType: "organization_memberships",
    organizationId: context.organization.id,
    supabase,
  });

  redirect(
    getCoachesPath({
      organizationId: context.organization.id,
      status: "membership-updated",
    }),
  );
}

export async function createCoachProfile(formData: FormData) {
  const context = await getCoachActionContext(formData, "team-access");
  const validation = validateCoachProfileCreateForm(formData);

  if (!validation.ok) {
    redirect(getErrorPath(context.organization.id, validation.error));
  }

  const centerIsValid = await ensureCenterBelongsToOrganization(
    context.organization.id,
    validation.values.primaryCenterId,
  );

  if (!centerIsValid) {
    redirect(getErrorPath(context.organization.id, "invalid-center"));
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

  const { data: existingCoachProfileByUser, error: existingCoachProfileError } =
    await supabase
      .from("coach_profiles")
      .select("id")
      .eq("organization_id", context.organization.id)
      .eq("user_id", validation.values.userId)
      .maybeSingle();

  if (existingCoachProfileError) {
    redirect(getErrorPath(context.organization.id, "save-failed"));
  }

  if (existingCoachProfileByUser) {
    redirect(getErrorPath(context.organization.id, "duplicate-profile"));
  }

  const { data: existingPersonProfile, error: existingPersonProfileError } =
    await supabase
      .from("person_profiles")
      .select("id, display_name, status, user_id, visibility_status")
      .eq("organization_id", context.organization.id)
      .eq("user_id", validation.values.userId)
      .maybeSingle();

  if (existingPersonProfileError) {
    redirect(getErrorPath(context.organization.id, "save-failed"));
  }

  let personProfile = existingPersonProfile;
  let createdPersonProfileId: string | null = null;

  if (personProfile) {
    if (personProfile.status !== "active") {
      redirect(getErrorPath(context.organization.id, "person-profile-inactive"));
    }

    if (personProfile.visibility_status !== "visible") {
      redirect(getErrorPath(context.organization.id, "person-profile-internal"));
    }
  } else {
    if (!validation.values.displayName) {
      redirect(getErrorPath(context.organization.id, "missing-fields"));
    }

    const { data: insertedPersonProfile, error: personProfileError } =
      await supabase
        .from("person_profiles")
        .insert({
          display_name: validation.values.displayName,
          organization_id: context.organization.id,
          status: "active",
          user_id: validation.values.userId,
          visibility_status: "visible",
        })
        .select("id, display_name, status, user_id, visibility_status")
        .single();

    if (personProfileError || !insertedPersonProfile) {
      redirect(getErrorPath(context.organization.id, "save-failed"));
    }

    personProfile = insertedPersonProfile;
    createdPersonProfileId = insertedPersonProfile.id;
  }

  const {
    data: existingCoachProfileByPerson,
    error: existingCoachProfileByPersonError,
  } = await supabase
    .from("coach_profiles")
    .select("id")
    .eq("organization_id", context.organization.id)
    .eq("person_profile_id", personProfile.id)
    .maybeSingle();

  if (existingCoachProfileByPersonError) {
    redirect(getErrorPath(context.organization.id, "save-failed"));
  }

  if (existingCoachProfileByPerson) {
    redirect(getErrorPath(context.organization.id, "duplicate-profile"));
  }

  const { data: coachProfile, error } = await supabase
    .from("coach_profiles")
    .insert({
      organization_id: context.organization.id,
      person_profile_id: personProfile.id,
      user_id: validation.values.userId,
      primary_center_id: validation.values.primaryCenterId,
      weekly_contracted_hours: validation.values.weeklyContractedHours,
      status: validation.values.status,
      notes: validation.values.notes,
    })
    .select("id")
    .single();

  if (error || !coachProfile) {
    redirect(
      getErrorPath(
        context.organization.id,
        getCoachProfileMutationError(error?.code),
      ),
    );
  }

  if (createdPersonProfileId) {
    await recordOperationalAuditEvent({
      action: "created",
      changedFields: {
        display_name: auditFieldTouched(),
        status: auditFieldSet("active"),
        user_id: auditFieldTouched(),
        visibility_status: auditFieldSet("visible"),
      },
      entityId: createdPersonProfileId,
      entityType: "person_profiles",
      organizationId: context.organization.id,
      supabase,
    });
  }

  await recordOperationalAuditEvent({
    action: "created",
    changedFields: {
      ...getCoachProfileAuditFields({
        notesChanged: Boolean(validation.values.notes),
        primaryCenterId: validation.values.primaryCenterId,
        status: validation.values.status,
        weeklyContractedHours: validation.values.weeklyContractedHours,
      }),
      person_profile_id: auditFieldSet(personProfile.id),
      user_id: auditFieldTouched(),
    },
    entityId: coachProfile.id,
    entityType: "coach_profiles",
    organizationId: context.organization.id,
    supabase,
  });

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
  const { data: existingCoachProfile, error: existingCoachProfileError } =
    await supabase
      .from("coach_profiles")
      .select("id, notes, primary_center_id, status, weekly_contracted_hours")
      .eq("id", coachProfileId)
      .eq("organization_id", context.organization.id)
      .maybeSingle();

  if (existingCoachProfileError || !existingCoachProfile) {
    redirect(getErrorPath(context.organization.id, "profile-required"));
  }

  const canManageAccess = canManageTeamAccess(context.membership.role);
  const nextStatus = canManageAccess
    ? validation.values.status
    : existingCoachProfile.status;
  const nextNotes = canManageAccess
    ? validation.values.notes
    : existingCoachProfile.notes;

  const { error } = await supabase
    .from("coach_profiles")
    .update({
      primary_center_id: validation.values.primaryCenterId,
      weekly_contracted_hours: validation.values.weeklyContractedHours,
      status: nextStatus,
      notes: nextNotes,
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

  const changedFields: OperationalAuditChangedFields = {};
  addAuditFieldChange(
    changedFields,
    "primary_center_id",
    existingCoachProfile.primary_center_id,
    validation.values.primaryCenterId,
  );
  addAuditFieldChange(
    changedFields,
    "weekly_contracted_hours",
    Number(existingCoachProfile.weekly_contracted_hours ?? 0),
    validation.values.weeklyContractedHours,
  );
  addAuditFieldChange(
    changedFields,
    "status",
    existingCoachProfile.status,
    nextStatus,
  );

  if ((existingCoachProfile.notes ?? null) !== nextNotes) {
    changedFields.notes = auditFieldTouched();
  }

  await recordOperationalAuditEvent({
    action: "updated",
    changedFields,
    entityId: coachProfileId,
    entityType: "coach_profiles",
    organizationId: context.organization.id,
    supabase,
  });

  redirect(
    getCoachesPath({
      organizationId: context.organization.id,
      status: "profile-updated",
    }),
  );
}

export async function deleteCoachProfile(formData: FormData) {
  const context = await getCoachActionContext(formData, "team-profile-delete");
  const coachProfileId = getRequiredFormString(formData, "coachProfileId");

  if (!coachProfileId) {
    redirect(getErrorPath(context.organization.id, "profile-required"));
  }

  if (!isPostgresUuid(coachProfileId)) {
    redirect(getErrorPath(context.organization.id, "invalid-profile-id"));
  }

  const supabase = await createClient();
  const { data: existingCoachProfile, error: existingCoachProfileError } =
    await supabase
      .from("coach_profiles")
      .select("id, person_profile_id, status, user_id")
      .eq("id", coachProfileId)
      .eq("organization_id", context.organization.id)
      .maybeSingle();

  if (existingCoachProfileError || !existingCoachProfile) {
    redirect(getErrorPath(context.organization.id, "profile-required"));
  }

  const { data: personProfile, error: personProfileError } =
    existingCoachProfile.person_profile_id
      ? await supabase
          .from("person_profiles")
          .select("id, user_id")
          .eq("id", existingCoachProfile.person_profile_id)
          .eq("organization_id", context.organization.id)
          .maybeSingle()
      : { data: null, error: null };

  if (personProfileError) {
    redirect(getErrorPath(context.organization.id, "save-failed"));
  }

  const hasLinkedAccount = Boolean(
    existingCoachProfile.user_id || personProfile?.user_id,
  );

  if (hasLinkedAccount) {
    if (existingCoachProfile.status !== "inactive") {
      const { error: archiveError } = await supabase
        .from("coach_profiles")
        .update({ status: "inactive" })
        .eq("id", coachProfileId)
        .eq("organization_id", context.organization.id)
        .select("id")
        .single();

      if (archiveError) {
        redirect(
          getErrorPath(
            context.organization.id,
            getCoachProfileMutationError(archiveError.code),
          ),
        );
      }

      await recordOperationalAuditEvent({
        action: "updated",
        changedFields: {
          status: auditFieldSet("inactive"),
        },
        entityId: coachProfileId,
        entityType: "coach_profiles",
        organizationId: context.organization.id,
        supabase,
      });
    }

    redirect(
      getCoachesPath({
        organizationId: context.organization.id,
        status: "profile-archived",
      }),
    );
  }

  if (existingCoachProfile.status !== "inactive") {
    redirect(
      getErrorPath(context.organization.id, "profile-delete-requires-inactive"),
    );
  }

  const { data: cleanedInvitations, error: invitationCleanupError } =
    await supabase
      .from("team_invitations")
      .update({ coach_profile_id: null, status: "cancelled" })
      .eq("coach_profile_id", coachProfileId)
      .eq("organization_id", context.organization.id)
      .in("status", ["pending", "sent", "failed", "expired", "cancelled"])
      .select("id");

  if (invitationCleanupError) {
    redirect(getErrorPath(context.organization.id, "save-failed"));
  }

  for (const invitation of cleanedInvitations ?? []) {
    await recordOperationalAuditEvent({
      action: "cancelled",
      changedFields: {
        coach_profile_id: auditFieldSet(null),
        status: auditFieldSet("cancelled"),
      },
      entityId: invitation.id,
      entityType: "team_invitations",
      organizationId: context.organization.id,
      supabase,
    });
  }

  // A template default is reusable configuration, not worked history. Clear it
  // before deleting an unlinked inactive ficha so stale defaults do not pin it.
  const { error: templateDefaultCleanupError } = await supabase
    .from("schedule_template_blocks")
    .update({ default_coach_profile_id: null })
    .eq("default_coach_profile_id", coachProfileId)
    .eq("organization_id", context.organization.id);

  if (templateDefaultCleanupError) {
    redirect(getErrorPath(context.organization.id, "save-failed"));
  }

  const { data: deletedCoachProfile, error } = await supabase
    .from("coach_profiles")
    .delete()
    .eq("id", coachProfileId)
    .eq("organization_id", context.organization.id)
    .select("id")
    .maybeSingle();

  if (error) {
    redirect(
      getErrorPath(
        context.organization.id,
        getCoachProfileDeleteMutationError(error.code),
      ),
    );
  }

  if (!deletedCoachProfile) {
    redirect(getErrorPath(context.organization.id, "profile-required"));
  }

  redirect(
    getCoachesPath({
      organizationId: context.organization.id,
      status: "profile-deleted",
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

  if (!existingMembership) {
    redirect(getErrorPath(context.organization.id, "membership-required"));
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

  if (personProfile.user_id !== validation.values.userId) {
    await recordOperationalAuditEvent({
      action: "linked_account",
      changedFields: {
        user_id: auditFieldTouched(),
      },
      entityId: personProfile.id,
      entityType: "person_profiles",
      organizationId: context.organization.id,
      supabase,
    });
  }

  if (coachProfile.user_id !== validation.values.userId) {
    await recordOperationalAuditEvent({
      action: "linked_account",
      changedFields: {
        person_profile_id: auditFieldSet(personProfile.id),
        user_id: auditFieldTouched(),
      },
      entityId: coachProfile.id,
      entityType: "coach_profiles",
      organizationId: context.organization.id,
      supabase,
    });
  }

  redirect(
    getCoachesPath({
      organizationId: context.organization.id,
      status: "account-linked",
    }),
  );
}
