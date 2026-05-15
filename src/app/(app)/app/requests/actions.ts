"use server";

import { redirect } from "next/navigation";

import {
  approveChangeRequest,
  applyApprovedChangeRequest,
  cancelChangeRequest,
  createChangeRequestWithTargets,
  expireChangeRequest,
  rejectChangeRequest,
  respondToChangeRequestTarget,
  type ChangeRequestType,
  type ChangeRequestErrorCode,
} from "@/lib/change-requests";
import { canManageChangeRequests } from "@/lib/auth/permissions";
import {
  getActiveMemberships,
  getAuthenticatedUser,
  resolveActiveOrganization,
} from "@/lib/auth/tenant";
import { getRequestsPath } from "@/lib/navigation/app-paths";
import { createClient } from "@/lib/supabase/server";
import { isPostgresUuid } from "@/lib/uuid";

type RequestsActionContext = {
  canManage: boolean;
  organizationId: string;
  ownCoachProfileIds: Set<string>;
  supabase: Awaited<ReturnType<typeof createClient>>;
};

const CLOSED_REQUEST_STATUSES = new Set([
  "rejected",
  "cancelled",
  "expired",
  "applied",
]);
const OPEN_TARGET_STATUSES = new Set(["accepted", "offered"]);
const CREATION_REQUEST_TYPES = new Set<ChangeRequestType>([
  "coverage_request",
  "direct_coverage_request",
  "offer_block",
  "open_coverage_request",
  "own_block_change",
]);

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

function getFormStrings(formData: FormData, key: string) {
  return formData
    .getAll(key)
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);
}

function getRequestsErrorPath(organizationId: string | null, error: string) {
  return getRequestsPath({
    error,
    organizationId,
  });
}

function getRequestsStatusPath(organizationId: string, status: string) {
  return getRequestsPath({
    organizationId,
    status,
  });
}

async function resolveRequestsActionContext(
  organizationId: string,
): Promise<
  | {
      data: RequestsActionContext;
      ok: true;
    }
  | {
      error: ChangeRequestErrorCode;
      ok: false;
    }
> {
  const user = await getAuthenticatedUser();

  if (!user) {
    return {
      error: "authentication-required",
      ok: false,
    };
  }

  const memberships = await getActiveMemberships(user.id);
  const resolution = resolveActiveOrganization(memberships, organizationId);

  if (!resolution.ok) {
    return {
      error:
        resolution.reason === "no_active_memberships"
          ? "no-active-memberships"
          : resolution.reason === "organization_not_found"
            ? "organization-not-found"
            : "organization-required",
      ok: false,
    };
  }

  const supabase = await createClient();
  const { data: ownPersonProfiles, error: personError } = await supabase
    .from("person_profiles")
    .select("id")
    .eq("organization_id", resolution.organization.id)
    .eq("user_id", user.id)
    .eq("status", "active");

  if (personError) {
    return {
      error: "load-failed",
      ok: false,
    };
  }

  const ownPersonProfileIds = new Set(
    (ownPersonProfiles ?? []).map((profile) => profile.id),
  );
  const { data: coachProfiles, error: coachError } = await supabase
    .from("coach_profiles")
    .select("id, person_profile_id, user_id")
    .eq("organization_id", resolution.organization.id);

  if (coachError) {
    return {
      error: "load-failed",
      ok: false,
    };
  }

  const ownCoachProfileIds = new Set(
    (coachProfiles ?? [])
      .filter(
        (coach) =>
          coach.user_id === user.id ||
          (coach.person_profile_id
            ? ownPersonProfileIds.has(coach.person_profile_id)
            : false),
      )
      .map((coach) => coach.id),
  );

  return {
    data: {
      canManage: canManageChangeRequests(resolution.membership.role),
      organizationId: resolution.organization.id,
      ownCoachProfileIds,
      supabase,
    },
    ok: true,
  };
}

async function getValidatedContext(formData: FormData) {
  const organizationId = getFormString(formData, "organizationId");

  if (!organizationId) {
    redirect(getRequestsErrorPath(null, "organization-required"));
  }

  if (!isPostgresUuid(organizationId)) {
    redirect(getRequestsErrorPath(organizationId, "invalid-organization"));
  }

  const context = await resolveRequestsActionContext(organizationId);

  if (!context.ok) {
    redirect(getRequestsErrorPath(organizationId, context.error));
  }

  return context.data;
}

function getValidatedUuid({
  context,
  formData,
  key,
  message,
}: {
  context: RequestsActionContext;
  formData: FormData;
  key: string;
  message: string;
}) {
  const value = getFormString(formData, key);

  if (!isPostgresUuid(value)) {
    redirect(getRequestsErrorPath(context.organizationId, message));
  }

  return value;
}

function normalizeOptionalDateTimeLocal({
  context,
  value,
}: {
  context: RequestsActionContext;
  value: string;
}) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    redirect(getRequestsErrorPath(context.organizationId, "invalid-timestamp"));
  }

  return parsed.toISOString();
}

function isPastTimestamp(value: string | null) {
  if (!value) {
    return false;
  }

  const timestamp = new Date(value).getTime();

  return Number.isFinite(timestamp) && timestamp <= Date.now();
}

function blockIsNotActionable(status: string | null | undefined) {
  return status === "cancelled" || status === "completed";
}

function getValidatedTargetCoachProfileIds({
  context,
  formData,
}: {
  context: RequestsActionContext;
  formData: FormData;
}) {
  const values = getFormStrings(formData, "targetCoachProfileIds");

  if (values.length < 1 || values.length > 10) {
    redirect(getRequestsErrorPath(context.organizationId, "invalid-coach-profile"));
  }

  const uniqueValues = new Set<string>();

  for (const value of values) {
    if (!isPostgresUuid(value) || uniqueValues.has(value)) {
      redirect(
        getRequestsErrorPath(context.organizationId, "invalid-coach-profile"),
      );
    }

    uniqueValues.add(value);
  }

  return [...uniqueValues];
}

async function ensureManagementContext(formData: FormData) {
  const context = await getValidatedContext(formData);

  if (!context.canManage) {
    redirect(getRequestsErrorPath(context.organizationId, "forbidden"));
  }

  return context;
}

async function runManagementOperation(
  formData: FormData,
  operation:
    | "approve"
    | "apply"
    | "reject",
) {
  const context = await ensureManagementContext(formData);
  const changeRequestId = getValidatedUuid({
    context,
    formData,
    key: "changeRequestId",
    message: "invalid-change-request",
  });
  const input = {
    changeRequestId,
    organizationId: context.organizationId,
  };
  const result =
    operation === "approve"
      ? await approveChangeRequest(input)
      : operation === "reject"
        ? await rejectChangeRequest(input)
        : await applyApprovedChangeRequest(input);

  if (!result.ok) {
    redirect(getRequestsErrorPath(context.organizationId, result.error));
  }

  redirect(
    getRequestsStatusPath(
      context.organizationId,
      operation === "approve"
        ? "request-approved"
        : operation === "reject"
          ? "request-rejected"
          : "request-applied",
    ),
  );
}

export async function expireChangeRequestFromForm(formData: FormData) {
  const context = await getValidatedContext(formData);
  const changeRequestId = getValidatedUuid({
    context,
    formData,
    key: "changeRequestId",
    message: "invalid-change-request",
  });
  const { data: request, error: requestError } = await context.supabase
    .from("change_requests")
    .select("id, status, expires_at, accepted_target_id, schedule_block_id")
    .eq("organization_id", context.organizationId)
    .eq("id", changeRequestId)
    .maybeSingle();

  if (requestError) {
    redirect(getRequestsErrorPath(context.organizationId, "load-failed"));
  }

  if (!request) {
    redirect(getRequestsErrorPath(context.organizationId, "not-found"));
  }

  if (CLOSED_REQUEST_STATUSES.has(request.status)) {
    redirect(getRequestsErrorPath(context.organizationId, "not-actionable"));
  }

  const [blockResult, targetsResult] = await Promise.all([
    context.supabase
      .from("schedule_blocks")
      .select("id, status")
      .eq("organization_id", context.organizationId)
      .eq("id", request.schedule_block_id)
      .maybeSingle(),
    context.supabase
      .from("change_request_targets")
      .select("id, status, expires_at")
      .eq("organization_id", context.organizationId)
      .eq("change_request_id", request.id),
  ]);

  if (blockResult.error || targetsResult.error) {
    redirect(getRequestsErrorPath(context.organizationId, "load-failed"));
  }

  const targets = targetsResult.data ?? [];
  const acceptedTarget = request.accepted_target_id
    ? targets.find((target) => target.id === request.accepted_target_id)
    : null;
  const hasActiveTargets = targets.some(
    (target) =>
      OPEN_TARGET_STATUSES.has(target.status) &&
      !isPastTimestamp(target.expires_at),
  );
  const canExpire =
    isPastTimestamp(request.expires_at) ||
    blockIsNotActionable(blockResult.data?.status) ||
    (acceptedTarget ? isPastTimestamp(acceptedTarget.expires_at) : false) ||
    (request.status === "offered" && !hasActiveTargets);

  if (!canExpire) {
    redirect(getRequestsErrorPath(context.organizationId, "not-actionable"));
  }

  const result = await expireChangeRequest({
    changeRequestId,
    organizationId: context.organizationId,
  });

  if (!result.ok) {
    redirect(getRequestsErrorPath(context.organizationId, result.error));
  }

  redirect(getRequestsStatusPath(context.organizationId, "request-expired"));
}

export async function createChangeRequestFromForm(formData: FormData) {
  const context = await getValidatedContext(formData);
  const scheduleBlockAssignmentId = getValidatedUuid({
    context,
    formData,
    key: "scheduleBlockAssignmentId",
    message: "invalid-schedule-block-assignment",
  });
  const requestType = getFormString(formData, "requestType");
  const reasonSummary = getFormString(formData, "reasonSummary");
  const expiresAt = normalizeOptionalDateTimeLocal({
    context,
    value: getFormString(formData, "expiresAt"),
  });
  const targetCoachProfileIds = getValidatedTargetCoachProfileIds({
    context,
    formData,
  });

  if (getFormString(formData, "creationConfirmed") !== "on") {
    redirect(getRequestsErrorPath(context.organizationId, "confirmation-required"));
  }

  if (!CREATION_REQUEST_TYPES.has(requestType as ChangeRequestType)) {
    redirect(getRequestsErrorPath(context.organizationId, "invalid-request-type"));
  }

  const { data: assignment, error: assignmentError } = await context.supabase
    .from("schedule_block_assignments")
    .select("id, schedule_block_id, coach_profile_id, assignment_status")
    .eq("organization_id", context.organizationId)
    .eq("id", scheduleBlockAssignmentId)
    .maybeSingle();

  if (assignmentError) {
    redirect(getRequestsErrorPath(context.organizationId, "load-failed"));
  }

  if (!assignment || assignment.assignment_status !== "assigned") {
    redirect(
      getRequestsErrorPath(
        context.organizationId,
        "invalid-schedule-block-assignment",
      ),
    );
  }

  if (
    !context.canManage &&
    !context.ownCoachProfileIds.has(assignment.coach_profile_id)
  ) {
    redirect(getRequestsErrorPath(context.organizationId, "forbidden"));
  }

  if (targetCoachProfileIds.includes(assignment.coach_profile_id)) {
    redirect(getRequestsErrorPath(context.organizationId, "invalid-coach-profile"));
  }

  const [blockResult, targetsResult] = await Promise.all([
    context.supabase
      .from("schedule_blocks")
      .select("id, status")
      .eq("organization_id", context.organizationId)
      .eq("id", assignment.schedule_block_id)
      .maybeSingle(),
    context.supabase
      .from("coach_profiles")
      .select("id")
      .eq("organization_id", context.organizationId)
      .eq("status", "active")
      .in("id", targetCoachProfileIds),
  ]);

  if (blockResult.error || targetsResult.error) {
    redirect(getRequestsErrorPath(context.organizationId, "load-failed"));
  }

  if (
    !blockResult.data ||
    blockResult.data.status === "cancelled" ||
    blockResult.data.status === "completed"
  ) {
    redirect(getRequestsErrorPath(context.organizationId, "not-actionable"));
  }

  if ((targetsResult.data ?? []).length !== targetCoachProfileIds.length) {
    redirect(getRequestsErrorPath(context.organizationId, "invalid-coach-profile"));
  }

  const result = await createChangeRequestWithTargets({
    expiresAt,
    organizationId: context.organizationId,
    reasonSummary,
    requestType,
    scheduleBlockAssignmentId,
    scheduleBlockId: assignment.schedule_block_id,
    targetCoachProfileIds,
  });

  if (!result.ok) {
    redirect(getRequestsErrorPath(context.organizationId, result.error));
  }

  redirect(getRequestsStatusPath(context.organizationId, "request-created"));
}

export async function respondToChangeRequestTargetFromForm(formData: FormData) {
  const context = await getValidatedContext(formData);
  const changeRequestTargetId = getValidatedUuid({
    context,
    formData,
    key: "changeRequestTargetId",
    message: "invalid-change-request-target",
  });
  const response = getFormString(formData, "response");

  if (response !== "accepted" && response !== "rejected") {
    redirect(getRequestsErrorPath(context.organizationId, "invalid-response"));
  }

  const { data: target, error } = await context.supabase
    .from("change_request_targets")
    .select("id, status, target_coach_profile_id")
    .eq("organization_id", context.organizationId)
    .eq("id", changeRequestTargetId)
    .maybeSingle();

  if (error) {
    redirect(getRequestsErrorPath(context.organizationId, "load-failed"));
  }

  if (!target) {
    redirect(getRequestsErrorPath(context.organizationId, "not-found"));
  }

  if (!context.ownCoachProfileIds.has(target.target_coach_profile_id)) {
    redirect(getRequestsErrorPath(context.organizationId, "forbidden"));
  }

  if (target.status !== "offered") {
    redirect(getRequestsErrorPath(context.organizationId, "not-actionable"));
  }

  const result = await respondToChangeRequestTarget({
    changeRequestTargetId,
    organizationId: context.organizationId,
    response,
  });

  if (!result.ok) {
    redirect(getRequestsErrorPath(context.organizationId, result.error));
  }

  redirect(
    getRequestsStatusPath(
      context.organizationId,
      response === "accepted" ? "target-accepted" : "target-rejected",
    ),
  );
}

export async function cancelOwnChangeRequestFromForm(formData: FormData) {
  const context = await getValidatedContext(formData);
  const changeRequestId = getValidatedUuid({
    context,
    formData,
    key: "changeRequestId",
    message: "invalid-change-request",
  });
  const { data: request, error } = await context.supabase
    .from("change_requests")
    .select("id, requester_coach_profile_id, status")
    .eq("organization_id", context.organizationId)
    .eq("id", changeRequestId)
    .maybeSingle();

  if (error) {
    redirect(getRequestsErrorPath(context.organizationId, "load-failed"));
  }

  if (!request) {
    redirect(getRequestsErrorPath(context.organizationId, "not-found"));
  }

  if (!context.ownCoachProfileIds.has(request.requester_coach_profile_id)) {
    redirect(getRequestsErrorPath(context.organizationId, "forbidden"));
  }

  if (
    CLOSED_REQUEST_STATUSES.has(request.status) ||
    request.status === "approved"
  ) {
    redirect(getRequestsErrorPath(context.organizationId, "not-actionable"));
  }

  const result = await cancelChangeRequest({
    changeRequestId,
    organizationId: context.organizationId,
  });

  if (!result.ok) {
    redirect(getRequestsErrorPath(context.organizationId, result.error));
  }

  redirect(getRequestsStatusPath(context.organizationId, "request-cancelled"));
}

export async function approveChangeRequestFromForm(formData: FormData) {
  await runManagementOperation(formData, "approve");
}

export async function rejectChangeRequestFromForm(formData: FormData) {
  await runManagementOperation(formData, "reject");
}

export async function applyApprovedChangeRequestFromForm(formData: FormData) {
  await runManagementOperation(formData, "apply");
}
