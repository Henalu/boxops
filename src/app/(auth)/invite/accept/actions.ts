"use server";

import { redirect } from "next/navigation";

import { getSafeRedirectPath, getLoginPath } from "@/lib/auth/redirects";
import { getAuthCallbackUrl } from "@/lib/auth/site-url";
import { validatePasswordPolicy } from "@/lib/auth/password-policy";
import { getAuthenticatedUser } from "@/lib/auth/tenant";
import { getAppPath } from "@/lib/navigation/app-paths";
import {
  auditFieldSet,
  auditFieldTouched,
  recordOperationalAuditEvent,
} from "@/lib/operational-audit";
import { createClient } from "@/lib/supabase/server";
import {
  getInvitationAcceptPath,
  normalizeInvitationEmail,
} from "@/lib/team-invitations";
import { isPostgresUuid } from "@/lib/uuid";

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

function getAcceptPath(
  invitationId: string,
  token: string,
  params: Record<string, string>,
) {
  const path = getInvitationAcceptPath(invitationId, token);
  const urlParams = new URLSearchParams(params);

  return `${path}&${urlParams.toString()}`;
}

function validateInvitationInput(formData: FormData) {
  const invitationId = getFormString(formData, "invitationId");
  const token = getFormString(formData, "token");

  if (!isPostgresUuid(invitationId) || token.length < 32) {
    return null;
  }

  return {
    invitationId,
    token,
  };
}

async function acceptInvitation(invitationId: string, token: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accept_team_invitation", {
    raw_invitation_token: token,
    target_invitation_id: invitationId,
  });

  if (error) {
    return {
      error: "accept-failed" as const,
      organizationId: null,
    };
  }

  const [acceptedInvitation] = data ?? [];
  const organizationId = acceptedInvitation?.organization_id ?? null;

  if (organizationId) {
    await recordOperationalAuditEvent({
      action: "accepted",
      changedFields: {
        accepted_by_user_id: auditFieldTouched(),
        coach_profile_id: auditFieldTouched(),
        membership: auditFieldTouched(),
        person_profile_id: auditFieldTouched(),
        status: auditFieldSet("accepted"),
      },
      entityId: invitationId,
      entityType: "team_invitations",
      organizationId,
      supabase,
    });
  }

  return {
    error: null,
    organizationId,
  };
}

export async function acceptTeamInvitation(formData: FormData) {
  const input = validateInvitationInput(formData);

  if (!input) {
    redirect("/invite/accept?error=invalid-invitation");
  }

  const redirectTo = getInvitationAcceptPath(input.invitationId, input.token);
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect(getLoginPath(redirectTo));
  }

  const result = await acceptInvitation(input.invitationId, input.token);

  if (result.error || !result.organizationId) {
    redirect(
      getAcceptPath(input.invitationId, input.token, {
        error: result.error ?? "accept-failed",
      }),
    );
  }

  redirect(
    getAppPath("/app", {
      organizationId: result.organizationId,
      status: "invitation-accepted",
    }),
  );
}

export async function signUpAndAcceptTeamInvitation(formData: FormData) {
  const input = validateInvitationInput(formData);

  if (!input) {
    redirect("/invite/accept?error=invalid-invitation");
  }

  const password = getFormString(formData, "password");
  const passwordValidation = validatePasswordPolicy(password);

  if (!passwordValidation.ok) {
    redirect(
      getAcceptPath(input.invitationId, input.token, {
        error: passwordValidation.error,
      }),
    );
  }

  const supabase = await createClient();
  const { data: invitationPreview, error: previewError } = await supabase.rpc(
    "get_team_invitation_public",
    {
      raw_invitation_token: input.token,
      target_invitation_id: input.invitationId,
    },
  );
  const [invitation] = invitationPreview ?? [];

  if (previewError || !invitation || invitation.status !== "sent") {
    redirect(
      getAcceptPath(input.invitationId, input.token, {
        error: "invalid-invitation",
      }),
    );
  }

  const email = normalizeInvitationEmail(invitation.email);
  const emailRedirectTo = await getAuthCallbackUrl(
    getSafeRedirectPath(getInvitationAcceptPath(input.invitationId, input.token)),
  );
  const { data: signUpResult, error: signUpError } = await supabase.auth.signUp({
    email,
    options: {
      emailRedirectTo,
    },
    password,
  });

  if (signUpError) {
    redirect(
      getAcceptPath(input.invitationId, input.token, {
        error: "signup-failed",
      }),
    );
  }

  if (!signUpResult.session) {
    redirect(
      getAcceptPath(input.invitationId, input.token, {
        status: "check-email",
      }),
    );
  }

  const result = await acceptInvitation(input.invitationId, input.token);

  if (result.error || !result.organizationId) {
    redirect(
      getAcceptPath(input.invitationId, input.token, {
        error: result.error ?? "accept-failed",
      }),
    );
  }

  redirect(
    getAppPath("/app", {
      organizationId: result.organizationId,
      status: "invitation-accepted",
    }),
  );
}
