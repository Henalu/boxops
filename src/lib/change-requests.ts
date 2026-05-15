import {
  canManageChangeRequests,
  canUsePersonalFeatures,
} from "@/lib/auth/permissions";
import {
  getActiveMemberships,
  getAuthenticatedUser,
  resolveActiveOrganization,
  type ActiveMembership,
  type ActiveOrganization,
} from "@/lib/auth/tenant";
import { createClient } from "@/lib/supabase/server";
import { isPostgresUuid } from "@/lib/uuid";
import type { Json, Tables } from "@/types/supabase";

export const CHANGE_REQUEST_TYPES = [
  "own_block_change",
  "direct_coverage_request",
  "open_coverage_request",
  "coverage_request",
  "offer_block",
] as const;
export const CHANGE_REQUEST_STATUSES = [
  "draft",
  "pending",
  "offered",
  "accepted_by_coach",
  "rejected_by_coach",
  "pending_approval",
  "approved",
  "rejected",
  "applied",
  "cancelled",
  "expired",
] as const;
export const CHANGE_REQUEST_TARGET_TYPES = [
  "direct_coach",
  "open_candidate",
  "suggested_candidate",
] as const;
export const CHANGE_REQUEST_TARGET_RESPONSES = [
  "accepted",
  "rejected",
] as const;

export type ChangeRequestType = (typeof CHANGE_REQUEST_TYPES)[number];
export type ChangeRequestStatus = (typeof CHANGE_REQUEST_STATUSES)[number];
export type ChangeRequestTargetType =
  (typeof CHANGE_REQUEST_TARGET_TYPES)[number];
export type ChangeRequestTargetResponse =
  (typeof CHANGE_REQUEST_TARGET_RESPONSES)[number];

export type ChangeRequestRow = Tables<"change_requests">;
export type ChangeRequestTargetRow = Tables<"change_request_targets">;
export type ChangeRequestEventRow = Tables<"change_request_events">;

export type ChangeRequestErrorCode =
  | "authentication-required"
  | "coach-unavailable"
  | "expired"
  | "forbidden"
  | "invalid-change-request"
  | "invalid-change-request-target"
  | "invalid-coach-profile"
  | "invalid-input"
  | "invalid-limit"
  | "invalid-organization"
  | "invalid-request-type"
  | "invalid-response"
  | "invalid-schedule-block"
  | "invalid-schedule-block-assignment"
  | "invalid-status"
  | "invalid-summary"
  | "invalid-target-type"
  | "invalid-timestamp"
  | "load-failed"
  | "no-active-memberships"
  | "not-actionable"
  | "not-approved"
  | "not-found"
  | "organization-not-found"
  | "organization-required"
  | "permission-denied"
  | "profile-missing"
  | "save-failed";

export type ChangeRequestResult<T> =
  | {
      data: T;
      ok: true;
    }
  | {
      error: ChangeRequestErrorCode;
      ok: false;
    };

export type ChangeRequestListItem = {
  events: ChangeRequestEventRow[];
  request: ChangeRequestRow;
  targets: ChangeRequestTargetRow[];
};

export type ListVisibleChangeRequestsInput = {
  includeEvents?: boolean;
  limit?: number | null;
  organizationId?: string | null;
  requesterCoachProfileId?: string | null;
  scheduleBlockId?: string | null;
  status?: ChangeRequestStatus | string | null;
  statuses?: readonly (ChangeRequestStatus | string)[] | null;
};

export type CreateOwnChangeRequestInput = {
  expiresAt?: Date | string | null;
  organizationId?: string | null;
  reasonSummary?: string | null;
  requestType?: ChangeRequestType | string | null;
  scheduleBlockAssignmentId: string;
  scheduleBlockId: string;
};

export type CreateChangeRequestWithTargetsInput =
  CreateOwnChangeRequestInput & {
    targetCoachProfileIds: readonly string[];
  };

export type OfferChangeRequestToCoachInput = {
  changeRequestId: string;
  coachProfileId: string;
  expiresAt?: Date | string | null;
  organizationId?: string | null;
  targetType?: ChangeRequestTargetType | string | null;
};

export type RespondToChangeRequestTargetInput = {
  changeRequestTargetId: string;
  organizationId?: string | null;
  response: ChangeRequestTargetResponse | string;
  responseNoteSummary?: string | null;
};

export type ChangeRequestOperationInput = {
  changeRequestId: string;
  organizationId?: string | null;
};

export type ListChangeRequestCreationOptionsInput = {
  organizationId?: string | null;
  scheduleBlockId?: string | null;
};

export type ChangeRequestCreationAssignmentOption = {
  assignmentId: string;
  blockId: string;
  centerName: string;
  classTypeName: string;
  coachName: string;
  coachProfileId: string;
  endTime: string;
  serviceDate: string;
  startTime: string;
  status: string;
  targetRestrictions: ChangeRequestCreationTargetRestriction[];
};

export type ChangeRequestCreationTargetOption = {
  coachProfileId: string;
  displayName: string;
  detail: string;
};

export type ChangeRequestCreationTargetRestrictionReason =
  | "already-assigned"
  | "overlap"
  | "source-coach";

export type ChangeRequestCreationTargetRestriction = {
  coachProfileId: string;
  reason: ChangeRequestCreationTargetRestrictionReason;
};

export type ChangeRequestCreationOptions = {
  assignmentOptions: ChangeRequestCreationAssignmentOption[];
  canManage: boolean;
  targetOptions: ChangeRequestCreationTargetOption[];
};

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
type ValidationResult<T> =
  | {
      ok: true;
      value: T;
    }
  | {
      error: ChangeRequestErrorCode;
      ok: false;
    };
type ChangeRequestContext = {
  membership: ActiveMembership;
  organization: ActiveOrganization;
  ownPersonProfileId?: string;
  supabase: SupabaseServerClient;
  userId: string;
};
type DatabaseErrorLike = {
  code?: string;
  message?: string;
};

const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 200;
const MAX_SUMMARY_LENGTH = 160;
const MAX_CREATION_TARGETS = 10;
const MAX_CREATION_OPTIONS = 100;
const ISO_TIMESTAMP_WITH_OFFSET_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:\d{2})$/;
const FORBIDDEN_SUMMARY_PATTERN =
  /(https?:\/\/|www[.]|data:|base64|token|secret|password|credential|signed-url|signed_url|storage\/v1|document|documento|payroll|salary|nomina|iban|dni|nif|ssn|national_id|geolocation|gps|latitude|longitude|coordinate|ubicacion|location|vacacion|permiso|baja|salud|health|medical)/i;

function success<T>(data: T): ChangeRequestResult<T> {
  return {
    data,
    ok: true,
  };
}

function failure(error: ChangeRequestErrorCode): ChangeRequestResult<never> {
  return {
    error,
    ok: false,
  };
}

function valid<T>(value: T): ValidationResult<T> {
  return {
    ok: true,
    value,
  };
}

function invalid(error: ChangeRequestErrorCode): ValidationResult<never> {
  return {
    error,
    ok: false,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeRequiredUuid(
  value: unknown,
  error: ChangeRequestErrorCode,
): ValidationResult<string> {
  if (typeof value !== "string") {
    return invalid(error);
  }

  const trimmed = value.trim();

  return isPostgresUuid(trimmed) ? valid(trimmed) : invalid(error);
}

function normalizeOptionalUuid(
  value: unknown,
  error: ChangeRequestErrorCode,
): ValidationResult<string | null> {
  if (value === undefined || value === null || value === "") {
    return valid(null);
  }

  return normalizeRequiredUuid(value, error);
}

function normalizeOptionalTimestamp(
  value: unknown,
): ValidationResult<string | null> {
  if (value === undefined || value === null || value === "") {
    return valid(null);
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? invalid("invalid-timestamp")
      : valid(value.toISOString());
  }

  if (typeof value !== "string") {
    return invalid("invalid-timestamp");
  }

  const trimmed = value.trim();

  if (!ISO_TIMESTAMP_WITH_OFFSET_PATTERN.test(trimmed)) {
    return invalid("invalid-timestamp");
  }

  const parsed = new Date(trimmed);

  return Number.isNaN(parsed.getTime())
    ? invalid("invalid-timestamp")
    : valid(parsed.toISOString());
}

function normalizeLimit(value: unknown): ValidationResult<number> {
  if (value === undefined || value === null) {
    return valid(DEFAULT_LIST_LIMIT);
  }

  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > MAX_LIST_LIMIT
  ) {
    return invalid("invalid-limit");
  }

  return valid(value);
}

function normalizeOptionalSummary(
  value: unknown,
): ValidationResult<string | null> {
  if (value === undefined || value === null || value === "") {
    return valid(null);
  }

  if (typeof value !== "string") {
    return invalid("invalid-summary");
  }

  const trimmed = value.trim();

  if (
    !trimmed ||
    trimmed.length > MAX_SUMMARY_LENGTH ||
    FORBIDDEN_SUMMARY_PATTERN.test(trimmed)
  ) {
    return invalid("invalid-summary");
  }

  return valid(trimmed);
}

function isChangeRequestType(value: unknown): value is ChangeRequestType {
  return CHANGE_REQUEST_TYPES.includes(value as ChangeRequestType);
}

function isChangeRequestStatus(value: unknown): value is ChangeRequestStatus {
  return CHANGE_REQUEST_STATUSES.includes(value as ChangeRequestStatus);
}

function isChangeRequestTargetType(
  value: unknown,
): value is ChangeRequestTargetType {
  return CHANGE_REQUEST_TARGET_TYPES.includes(value as ChangeRequestTargetType);
}

function isChangeRequestTargetResponse(
  value: unknown,
): value is ChangeRequestTargetResponse {
  return CHANGE_REQUEST_TARGET_RESPONSES.includes(
    value as ChangeRequestTargetResponse,
  );
}

function normalizeOptionalRequestType(
  value: unknown,
): ValidationResult<ChangeRequestType> {
  if (value === undefined || value === null || value === "") {
    return valid("coverage_request");
  }

  return isChangeRequestType(value) ? valid(value) : invalid("invalid-request-type");
}

function normalizeOptionalTargetType(
  value: unknown,
): ValidationResult<ChangeRequestTargetType> {
  if (value === undefined || value === null || value === "") {
    return valid("direct_coach");
  }

  return isChangeRequestTargetType(value)
    ? valid(value)
    : invalid("invalid-target-type");
}

function normalizeOptionalStatus(
  value: unknown,
): ValidationResult<ChangeRequestStatus | null> {
  if (value === undefined || value === null || value === "") {
    return valid(null);
  }

  return isChangeRequestStatus(value) ? valid(value) : invalid("invalid-status");
}

function normalizeStatuses(
  values: readonly (ChangeRequestStatus | string)[] | null | undefined,
): ValidationResult<ChangeRequestStatus[]> {
  if (!values || values.length === 0) {
    return valid([]);
  }

  const statuses = new Set<ChangeRequestStatus>();

  for (const value of values) {
    if (!isChangeRequestStatus(value)) {
      return invalid("invalid-status");
    }

    statuses.add(value);
  }

  return valid([...statuses]);
}

function normalizeTargetCoachProfileIds(
  values: unknown,
): ValidationResult<string[]> {
  if (!Array.isArray(values)) {
    return invalid("invalid-coach-profile");
  }

  if (values.length < 1 || values.length > MAX_CREATION_TARGETS) {
    return invalid("invalid-coach-profile");
  }

  const targetCoachProfileIds: string[] = [];
  const seenCoachProfileIds = new Set<string>();

  for (const value of values) {
    const coachProfileId = normalizeRequiredUuid(value, "invalid-coach-profile");

    if (!coachProfileId.ok) {
      return coachProfileId;
    }

    if (seenCoachProfileIds.has(coachProfileId.value)) {
      return invalid("invalid-coach-profile");
    }

    seenCoachProfileIds.add(coachProfileId.value);
    targetCoachProfileIds.push(coachProfileId.value);
  }

  return valid(targetCoachProfileIds);
}

function mapResolutionReason(
  reason: "no_active_memberships" | "organization_not_found" | "organization_required",
): ChangeRequestErrorCode {
  if (reason === "no_active_memberships") {
    return "no-active-memberships";
  }

  if (reason === "organization_not_found") {
    return "organization-not-found";
  }

  return "organization-required";
}

export function mapChangeRequestApplicationFailureCode(
  failureCode: unknown,
): ChangeRequestErrorCode {
  if (typeof failureCode !== "string") {
    return "not-actionable";
  }

  const normalized = failureCode.trim().toLowerCase();

  if (normalized === "coach-unavailable") {
    return "coach-unavailable";
  }

  if (normalized === "request-not-approved") {
    return "not-approved";
  }

  if (normalized === "request-expired" || normalized === "target-expired") {
    return "expired";
  }

  if (
    normalized === "schedule-block-not-actionable" ||
    normalized === "schedule-block-missing" ||
    normalized === "source-assignment-invalid" ||
    normalized === "accepted-target-invalid" ||
    normalized === "target-coach-not-assignable" ||
    normalized === "swap-not-implemented"
  ) {
    return "not-actionable";
  }

  return "not-actionable";
}

export function mapChangeRequestDatabaseError(
  error: DatabaseErrorLike,
  fallback: ChangeRequestErrorCode = "save-failed",
): ChangeRequestErrorCode {
  const message = error.message?.toLowerCase() ?? "";

  if (error.code === "23P01" || message.includes("coach-unavailable")) {
    return "coach-unavailable";
  }

  if (message.includes("authentication required")) {
    return "authentication-required";
  }

  if (
    message.includes("permission") ||
    message.includes("row-level security") ||
    message.includes("rls")
  ) {
    return "permission-denied";
  }

  if (message.includes("expired")) {
    return "expired";
  }

  if (
    message.includes("not approved") ||
    message.includes("not-approved") ||
    message.includes("not awaiting approval") ||
    message.includes("request-not-approved")
  ) {
    return "not-approved";
  }

  if (
    message.includes("target coach") ||
    message.includes("too many target") ||
    message.includes("duplicate target")
  ) {
    return "invalid-coach-profile";
  }

  if (
    message.includes("not actionable") ||
    message.includes("not open") ||
    message.includes("not awaiting") ||
    message.includes("not expirable yet") ||
    message.includes("already closed") ||
    message.includes("already assigned") ||
    message.includes("not assignable")
  ) {
    return "not-actionable";
  }

  if (
    message.includes("not found in tenant") ||
    message.includes("was not found") ||
    message.includes("is required")
  ) {
    return "not-found";
  }

  return fallback;
}

async function resolveChangeRequestContext({
  organizationId,
  requireManagement = false,
  requireOwnPersonProfile = false,
  requirePersonalAccess = false,
}: {
  organizationId: unknown;
  requireManagement?: boolean;
  requireOwnPersonProfile?: boolean;
  requirePersonalAccess?: boolean;
}): Promise<ChangeRequestResult<ChangeRequestContext>> {
  const normalizedOrganizationId = normalizeOptionalUuid(
    organizationId,
    "invalid-organization",
  );

  if (!normalizedOrganizationId.ok) {
    return normalizedOrganizationId;
  }

  const user = await getAuthenticatedUser();

  if (!user) {
    return failure("authentication-required");
  }

  const memberships = await getActiveMemberships(user.id);
  const resolution = resolveActiveOrganization(
    memberships,
    normalizedOrganizationId.value,
  );

  if (!resolution.ok) {
    return failure(mapResolutionReason(resolution.reason));
  }

  if (
    requirePersonalAccess &&
    !canUsePersonalFeatures(resolution.membership.role)
  ) {
    return failure("forbidden");
  }

  if (
    requireManagement &&
    !canManageChangeRequests(resolution.membership.role)
  ) {
    return failure("forbidden");
  }

  const supabase = await createClient();
  let ownPersonProfileId: string | undefined;

  if (requireOwnPersonProfile) {
    const { data: profile, error } = await supabase
      .from("person_profiles")
      .select("id")
      .eq("organization_id", resolution.organization.id)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();

    if (error) {
      return failure("load-failed");
    }

    if (!profile) {
      return failure("profile-missing");
    }

    ownPersonProfileId = profile.id;
  }

  return success({
    membership: resolution.membership,
    organization: resolution.organization,
    ownPersonProfileId,
    supabase,
    userId: user.id,
  });
}

function validateListInput(
  input: ListVisibleChangeRequestsInput,
): ValidationResult<{
  limit: number;
  organizationId: string | null;
  requesterCoachProfileId: string | null;
  scheduleBlockId: string | null;
  status: ChangeRequestStatus | null;
  statuses: ChangeRequestStatus[];
}> {
  if (!isRecord(input)) {
    return invalid("invalid-input");
  }

  const organizationId = normalizeOptionalUuid(
    input.organizationId,
    "invalid-organization",
  );

  if (!organizationId.ok) {
    return organizationId;
  }

  const status = normalizeOptionalStatus(input.status);

  if (!status.ok) {
    return status;
  }

  const statuses = normalizeStatuses(input.statuses);

  if (!statuses.ok) {
    return statuses;
  }

  if (status.value && statuses.value.length > 0) {
    return invalid("invalid-status");
  }

  const scheduleBlockId = normalizeOptionalUuid(
    input.scheduleBlockId,
    "invalid-schedule-block",
  );

  if (!scheduleBlockId.ok) {
    return scheduleBlockId;
  }

  const requesterCoachProfileId = normalizeOptionalUuid(
    input.requesterCoachProfileId,
    "invalid-coach-profile",
  );

  if (!requesterCoachProfileId.ok) {
    return requesterCoachProfileId;
  }

  const limit = normalizeLimit(input.limit);

  if (!limit.ok) {
    return limit;
  }

  return valid({
    limit: limit.value,
    organizationId: organizationId.value,
    requesterCoachProfileId: requesterCoachProfileId.value,
    scheduleBlockId: scheduleBlockId.value,
    status: status.value,
    statuses: statuses.value,
  });
}

function validateListCreationOptionsInput(
  input: ListChangeRequestCreationOptionsInput,
): ValidationResult<{
  organizationId: string | null;
  scheduleBlockId: string | null;
}> {
  if (!isRecord(input)) {
    return invalid("invalid-input");
  }

  const organizationId = normalizeOptionalUuid(
    input.organizationId,
    "invalid-organization",
  );

  if (!organizationId.ok) {
    return organizationId;
  }

  const scheduleBlockId = normalizeOptionalUuid(
    input.scheduleBlockId,
    "invalid-schedule-block",
  );

  if (!scheduleBlockId.ok) {
    return scheduleBlockId;
  }

  return valid({
    organizationId: organizationId.value,
    scheduleBlockId: scheduleBlockId.value,
  });
}

function validateCreateOwnInput(
  input: CreateOwnChangeRequestInput,
): ValidationResult<{
  expiresAt: string | null;
  organizationId: string | null;
  reasonSummary: string | null;
  requestType: ChangeRequestType;
  scheduleBlockAssignmentId: string;
  scheduleBlockId: string;
}> {
  if (!isRecord(input)) {
    return invalid("invalid-input");
  }

  const organizationId = normalizeOptionalUuid(
    input.organizationId,
    "invalid-organization",
  );

  if (!organizationId.ok) {
    return organizationId;
  }

  const scheduleBlockId = normalizeRequiredUuid(
    input.scheduleBlockId,
    "invalid-schedule-block",
  );

  if (!scheduleBlockId.ok) {
    return scheduleBlockId;
  }

  const scheduleBlockAssignmentId = normalizeRequiredUuid(
    input.scheduleBlockAssignmentId,
    "invalid-schedule-block-assignment",
  );

  if (!scheduleBlockAssignmentId.ok) {
    return scheduleBlockAssignmentId;
  }

  const requestType = normalizeOptionalRequestType(input.requestType);

  if (!requestType.ok) {
    return requestType;
  }

  const reasonSummary = normalizeOptionalSummary(input.reasonSummary);

  if (!reasonSummary.ok) {
    return reasonSummary;
  }

  const expiresAt = normalizeOptionalTimestamp(input.expiresAt);

  if (!expiresAt.ok) {
    return expiresAt;
  }

  return valid({
    expiresAt: expiresAt.value,
    organizationId: organizationId.value,
    reasonSummary: reasonSummary.value,
    requestType: requestType.value,
    scheduleBlockAssignmentId: scheduleBlockAssignmentId.value,
    scheduleBlockId: scheduleBlockId.value,
  });
}

function validateCreateWithTargetsInput(
  input: CreateChangeRequestWithTargetsInput,
): ValidationResult<{
  expiresAt: string | null;
  organizationId: string | null;
  reasonSummary: string | null;
  requestType: ChangeRequestType;
  scheduleBlockAssignmentId: string;
  scheduleBlockId: string;
  targetCoachProfileIds: string[];
}> {
  const baseValidation = validateCreateOwnInput(input);

  if (!baseValidation.ok) {
    return baseValidation;
  }

  const targetCoachProfileIds = normalizeTargetCoachProfileIds(
    input.targetCoachProfileIds,
  );

  if (!targetCoachProfileIds.ok) {
    return targetCoachProfileIds;
  }

  return valid({
    ...baseValidation.value,
    targetCoachProfileIds: targetCoachProfileIds.value,
  });
}

function validateOfferInput(
  input: OfferChangeRequestToCoachInput,
): ValidationResult<{
  changeRequestId: string;
  coachProfileId: string;
  expiresAt: string | null;
  organizationId: string | null;
  targetType: ChangeRequestTargetType;
}> {
  if (!isRecord(input)) {
    return invalid("invalid-input");
  }

  const organizationId = normalizeOptionalUuid(
    input.organizationId,
    "invalid-organization",
  );

  if (!organizationId.ok) {
    return organizationId;
  }

  const changeRequestId = normalizeRequiredUuid(
    input.changeRequestId,
    "invalid-change-request",
  );

  if (!changeRequestId.ok) {
    return changeRequestId;
  }

  const coachProfileId = normalizeRequiredUuid(
    input.coachProfileId,
    "invalid-coach-profile",
  );

  if (!coachProfileId.ok) {
    return coachProfileId;
  }

  const targetType = normalizeOptionalTargetType(input.targetType);

  if (!targetType.ok) {
    return targetType;
  }

  const expiresAt = normalizeOptionalTimestamp(input.expiresAt);

  if (!expiresAt.ok) {
    return expiresAt;
  }

  return valid({
    changeRequestId: changeRequestId.value,
    coachProfileId: coachProfileId.value,
    expiresAt: expiresAt.value,
    organizationId: organizationId.value,
    targetType: targetType.value,
  });
}

function validateRespondInput(
  input: RespondToChangeRequestTargetInput,
): ValidationResult<{
  changeRequestTargetId: string;
  organizationId: string | null;
  response: ChangeRequestTargetResponse;
  responseNoteSummary: string | null;
}> {
  if (!isRecord(input)) {
    return invalid("invalid-input");
  }

  const organizationId = normalizeOptionalUuid(
    input.organizationId,
    "invalid-organization",
  );

  if (!organizationId.ok) {
    return organizationId;
  }

  const changeRequestTargetId = normalizeRequiredUuid(
    input.changeRequestTargetId,
    "invalid-change-request-target",
  );

  if (!changeRequestTargetId.ok) {
    return changeRequestTargetId;
  }

  if (!isChangeRequestTargetResponse(input.response)) {
    return invalid("invalid-response");
  }

  const responseNoteSummary = normalizeOptionalSummary(input.responseNoteSummary);

  if (!responseNoteSummary.ok) {
    return responseNoteSummary;
  }

  return valid({
    changeRequestTargetId: changeRequestTargetId.value,
    organizationId: organizationId.value,
    response: input.response,
    responseNoteSummary: responseNoteSummary.value,
  });
}

function validateOperationInput(
  input: ChangeRequestOperationInput,
): ValidationResult<{
  changeRequestId: string;
  organizationId: string | null;
}> {
  if (!isRecord(input)) {
    return invalid("invalid-input");
  }

  const organizationId = normalizeOptionalUuid(
    input.organizationId,
    "invalid-organization",
  );

  if (!organizationId.ok) {
    return organizationId;
  }

  const changeRequestId = normalizeRequiredUuid(
    input.changeRequestId,
    "invalid-change-request",
  );

  if (!changeRequestId.ok) {
    return changeRequestId;
  }

  return valid({
    changeRequestId: changeRequestId.value,
    organizationId: organizationId.value,
  });
}

async function ensureOwnSourceAssignmentReference({
  context,
  scheduleBlockAssignmentId,
  scheduleBlockId,
}: {
  context: ChangeRequestContext;
  scheduleBlockAssignmentId: string;
  scheduleBlockId: string;
}): Promise<ChangeRequestErrorCode | null> {
  const { data, error } = await context.supabase
    .from("schedule_block_assignments")
    .select("id")
    .eq("id", scheduleBlockAssignmentId)
    .eq("organization_id", context.organization.id)
    .eq("schedule_block_id", scheduleBlockId)
    .maybeSingle();

  if (error) {
    return "load-failed";
  }

  return data ? null : "invalid-schedule-block-assignment";
}

async function ensureCoachProfileIsAssignable({
  coachProfileId,
  context,
}: {
  coachProfileId: string;
  context: ChangeRequestContext;
}): Promise<ChangeRequestErrorCode | null> {
  const { data, error } = await context.supabase.rpc(
    "change_request_coach_is_assignable",
    {
      target_coach_profile_id: coachProfileId,
      target_organization_id: context.organization.id,
    },
  );

  if (error) {
    return mapChangeRequestDatabaseError(error, "load-failed");
  }

  return data ? null : "invalid-coach-profile";
}

async function ensureCoachProfilesAreAssignable({
  coachProfileIds,
  context,
}: {
  coachProfileIds: readonly string[];
  context: ChangeRequestContext;
}): Promise<ChangeRequestErrorCode | null> {
  for (const coachProfileId of coachProfileIds) {
    const targetError = await ensureCoachProfileIsAssignable({
      coachProfileId,
      context,
    });

    if (targetError) {
      return targetError;
    }
  }

  return null;
}

function getJsonStringProperty(value: Json, propertyName: string) {
  if (!isRecord(value)) {
    return null;
  }

  const property = value[propertyName];

  return typeof property === "string" ? property : null;
}

function shortId(value: string) {
  return value.slice(0, 8);
}

function timeWindowsOverlap(
  left: Pick<Tables<"schedule_blocks">, "end_time" | "service_date" | "start_time">,
  right: Pick<Tables<"schedule_blocks">, "end_time" | "service_date" | "start_time">,
) {
  return (
    left.service_date === right.service_date &&
    left.start_time < right.end_time &&
    right.start_time < left.end_time
  );
}

async function getLatestApplicationFailureCode({
  changeRequestId,
  context,
}: {
  changeRequestId: string;
  context: ChangeRequestContext;
}): Promise<ChangeRequestErrorCode | null> {
  const { data, error } = await context.supabase
    .from("change_request_events")
    .select("changed_fields")
    .eq("organization_id", context.organization.id)
    .eq("change_request_id", changeRequestId)
    .eq("event_type", "application_failed")
    .eq("result", "failed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const failureCode = getJsonStringProperty(data.changed_fields, "failure_code");

  return failureCode
    ? mapChangeRequestApplicationFailureCode(failureCode)
    : "not-actionable";
}

export async function listChangeRequestCreationOptions(
  input: ListChangeRequestCreationOptionsInput = {},
): Promise<ChangeRequestResult<ChangeRequestCreationOptions>> {
  const validation = validateListCreationOptionsInput(input);

  if (!validation.ok) {
    return failure(validation.error);
  }

  const context = await resolveChangeRequestContext({
    organizationId: validation.value.organizationId,
  });

  if (!context.ok) {
    return context;
  }

  const canManage = canManageChangeRequests(context.data.membership.role);

  if (!canManage && !canUsePersonalFeatures(context.data.membership.role)) {
    return failure("forbidden");
  }

  type AssignmentRow = Pick<
    Tables<"schedule_block_assignments">,
    | "assignment_status"
    | "coach_profile_id"
    | "id"
    | "schedule_block_id"
  >;
  type BlockRow = Pick<
    Tables<"schedule_blocks">,
    | "center_id"
    | "class_type_id"
    | "end_time"
    | "id"
    | "service_date"
    | "start_time"
    | "status"
  >;
  type CoachRow = Pick<
    Tables<"coach_profiles">,
    "id" | "person_profile_id" | "primary_center_id" | "status" | "user_id"
  >;
  type PersonRow = Pick<
    Tables<"person_profiles">,
    "display_name" | "id" | "status" | "user_id" | "visibility_status"
  >;
  type MembershipRow = Pick<Tables<"organization_memberships">, "user_id">;
  type CenterRow = Pick<Tables<"centers">, "id" | "name">;
  type ClassTypeRow = Pick<Tables<"class_types">, "id" | "name">;
  type TargetAssignmentRow = Pick<
    Tables<"schedule_block_assignments">,
    "coach_profile_id" | "schedule_block_id"
  >;
  type TargetBlockRow = Pick<
    Tables<"schedule_blocks">,
    "end_time" | "id" | "service_date" | "start_time" | "status"
  >;

  const supabase = context.data.supabase;
  const [ownPersonProfilesResult, coachesResult, blocksResult] =
    await Promise.all([
      supabase
        .from("person_profiles")
        .select("id")
        .eq("organization_id", context.data.organization.id)
        .eq("user_id", context.data.userId)
        .eq("status", "active"),
      supabase
        .from("coach_profiles")
        .select("id, person_profile_id, primary_center_id, status, user_id")
        .eq("organization_id", context.data.organization.id)
        .eq("status", "active")
        .limit(200),
      (() => {
        let query = supabase
          .from("schedule_blocks")
          .select(
            "id, center_id, class_type_id, service_date, start_time, end_time, status",
          )
          .eq("organization_id", context.data.organization.id)
          .not("status", "in", "(cancelled,completed)")
          .order("service_date", { ascending: true })
          .order("start_time", { ascending: true })
          .limit(MAX_CREATION_OPTIONS);

        if (validation.value.scheduleBlockId) {
          query = query.eq("id", validation.value.scheduleBlockId);
        }

        return query;
      })(),
    ]);

  if (
    ownPersonProfilesResult.error ||
    coachesResult.error ||
    blocksResult.error
  ) {
    return failure("load-failed");
  }

  const ownPersonProfileIds = new Set(
    (ownPersonProfilesResult.data ?? []).map((profile) => profile.id),
  );
  const coaches = (coachesResult.data ?? []) as CoachRow[];
  const personProfileIds = [
    ...new Set(
      coaches.flatMap((coach) =>
        coach.person_profile_id ? [coach.person_profile_id] : [],
      ),
    ),
  ];

  const peopleResult =
    personProfileIds.length > 0
      ? await supabase
          .from("person_profiles")
          .select("id, display_name, status, user_id, visibility_status")
          .eq("organization_id", context.data.organization.id)
          .in("id", personProfileIds)
      : { data: [], error: null };

  if (peopleResult.error) {
    return failure("load-failed");
  }

  const people = (peopleResult.data ?? []) as PersonRow[];
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const membershipUserIds = [
    ...new Set(
      coaches.flatMap((coach) => {
        const person = coach.person_profile_id
          ? peopleById.get(coach.person_profile_id)
          : undefined;

        return [coach.user_id, person?.user_id].filter(
          (userId): userId is string => Boolean(userId),
        );
      }),
    ),
  ];

  const membershipsResult =
    membershipUserIds.length > 0
      ? await supabase
          .from("organization_memberships")
          .select("user_id")
          .eq("organization_id", context.data.organization.id)
          .eq("status", "active")
          .in("user_id", membershipUserIds)
      : { data: [], error: null };

  if (membershipsResult.error) {
    return failure("load-failed");
  }

  const activeMembershipUserIds = new Set(
    ((membershipsResult.data ?? []) as MembershipRow[]).map(
      (membership) => membership.user_id,
    ),
  );
  const assignableCoaches = coaches.filter((coach) => {
    const person = coach.person_profile_id
      ? peopleById.get(coach.person_profile_id)
      : undefined;
    const hasVisiblePerson =
      !coach.person_profile_id ||
      (person?.status === "active" && person.visibility_status === "visible");
    const hasActiveMembership =
      (coach.user_id ? activeMembershipUserIds.has(coach.user_id) : false) ||
      (person?.user_id
        ? activeMembershipUserIds.has(person.user_id)
        : false);

    return coach.status === "active" && hasVisiblePerson && hasActiveMembership;
  });
  const assignableCoachesById = new Map(
    assignableCoaches.map((coach) => [coach.id, coach]),
  );
  const ownCoachProfileIds = new Set(
    assignableCoaches
      .filter(
        (coach) =>
          coach.user_id === context.data.userId ||
          (coach.person_profile_id
            ? ownPersonProfileIds.has(coach.person_profile_id)
            : false),
      )
      .map((coach) => coach.id),
  );
  const visibleTargetCoaches = canManage
    ? assignableCoaches
    : assignableCoaches.filter((coach) => !ownCoachProfileIds.has(coach.id));
  const toTargetOption = (
    coach: CoachRow,
  ): ChangeRequestCreationTargetOption => {
    const person = coach.person_profile_id
      ? peopleById.get(coach.person_profile_id)
      : undefined;

    return {
      coachProfileId: coach.id,
      detail: coach.primary_center_id
        ? `Centro principal ${shortId(coach.primary_center_id)}`
        : "Coach asignable",
      displayName: person?.display_name ?? `Coach ${shortId(coach.id)}`,
    };
  };
  const blocks = (blocksResult.data ?? []) as BlockRow[];
  const blockIds = blocks.map((block) => block.id);

  if (blockIds.length === 0) {
    return success({
      assignmentOptions: [],
      canManage,
      targetOptions: visibleTargetCoaches.map(toTargetOption),
    });
  }

  let assignmentsQuery = supabase
    .from("schedule_block_assignments")
    .select("id, schedule_block_id, coach_profile_id, assignment_status")
    .eq("organization_id", context.data.organization.id)
    .eq("assignment_status", "assigned")
    .in("schedule_block_id", blockIds)
    .limit(MAX_CREATION_OPTIONS);

  if (!canManage) {
    if (ownCoachProfileIds.size === 0) {
      return success({
        assignmentOptions: [],
        canManage,
        targetOptions: visibleTargetCoaches.map(toTargetOption),
      });
    }

    assignmentsQuery = assignmentsQuery.in(
      "coach_profile_id",
      [...ownCoachProfileIds],
    );
  }

  const assignmentsResult = await assignmentsQuery;

  if (assignmentsResult.error) {
    return failure("load-failed");
  }

  const assignments = ((assignmentsResult.data ?? []) as AssignmentRow[]).filter(
    (assignment) => assignableCoachesById.has(assignment.coach_profile_id),
  );
  const centersResult =
    blocks.length > 0
      ? await supabase
          .from("centers")
          .select("id, name")
          .eq("organization_id", context.data.organization.id)
          .in("id", [...new Set(blocks.map((block) => block.center_id))])
      : { data: [], error: null };
  const classTypesResult =
    blocks.length > 0
      ? await supabase
          .from("class_types")
          .select("id, name")
          .eq("organization_id", context.data.organization.id)
          .in("id", [...new Set(blocks.map((block) => block.class_type_id))])
      : { data: [], error: null };

  if (centersResult.error || classTypesResult.error) {
    return failure("load-failed");
  }

  const blocksById = new Map(blocks.map((block) => [block.id, block]));
  const centersById = new Map(
    ((centersResult.data ?? []) as CenterRow[]).map((center) => [
      center.id,
      center,
    ]),
  );
  const classTypesById = new Map(
    ((classTypesResult.data ?? []) as ClassTypeRow[]).map((classType) => [
      classType.id,
      classType,
    ]),
  );

  const targetOptions = visibleTargetCoaches
    .map(toTargetOption)
    .sort((left, right) => left.displayName.localeCompare(right.displayName));
  const candidateTargetCoachIds = targetOptions.map(
    (target) => target.coachProfileId,
  );
  const targetServiceDates = [
    ...new Set(blocks.map((block) => block.service_date)),
  ];

  const targetBlocksResult =
    targetServiceDates.length > 0
      ? await supabase
          .from("schedule_blocks")
          .select("id, service_date, start_time, end_time, status")
          .eq("organization_id", context.data.organization.id)
          .not("status", "in", "(cancelled,completed)")
          .in("service_date", targetServiceDates)
          .limit(5000)
      : { data: [], error: null };

  if (targetBlocksResult.error) {
    return failure("load-failed");
  }

  const targetBlocks = (targetBlocksResult.data ?? []) as TargetBlockRow[];
  const targetBlocksById = new Map(
    targetBlocks.map((block) => [block.id, block]),
  );
  const targetBlockIds = targetBlocks.map((block) => block.id);
  const targetAssignmentsResult =
    targetBlockIds.length > 0 && candidateTargetCoachIds.length > 0
      ? await supabase
          .from("schedule_block_assignments")
          .select("schedule_block_id, coach_profile_id")
          .eq("organization_id", context.data.organization.id)
          .eq("assignment_status", "assigned")
          .in("schedule_block_id", targetBlockIds)
          .in("coach_profile_id", candidateTargetCoachIds)
          .limit(5000)
      : { data: [], error: null };

  if (targetAssignmentsResult.error) {
    return failure("load-failed");
  }

  const targetAssignmentsByCoachId = new Map<string, TargetAssignmentRow[]>();

  for (const assignment of (targetAssignmentsResult.data ??
    []) as TargetAssignmentRow[]) {
    const coachAssignments =
      targetAssignmentsByCoachId.get(assignment.coach_profile_id) ?? [];

    coachAssignments.push(assignment);
    targetAssignmentsByCoachId.set(assignment.coach_profile_id, coachAssignments);
  }

  const getTargetRestrictions = (
    assignment: AssignmentRow,
    block: BlockRow,
  ): ChangeRequestCreationTargetRestriction[] => {
    const restrictions = new Map<
      string,
      ChangeRequestCreationTargetRestrictionReason
    >();

    for (const target of targetOptions) {
      if (target.coachProfileId === assignment.coach_profile_id) {
        restrictions.set(target.coachProfileId, "source-coach");
        continue;
      }

      const targetAssignments =
        targetAssignmentsByCoachId.get(target.coachProfileId) ?? [];

      for (const targetAssignment of targetAssignments) {
        const targetBlock = targetBlocksById.get(
          targetAssignment.schedule_block_id,
        );

        if (!targetBlock) {
          continue;
        }

        if (targetBlock.id === block.id) {
          restrictions.set(target.coachProfileId, "already-assigned");
          break;
        }

        if (timeWindowsOverlap(block, targetBlock)) {
          restrictions.set(target.coachProfileId, "overlap");
          break;
        }
      }
    }

    return [...restrictions].map(([coachProfileId, reason]) => ({
      coachProfileId,
      reason,
    }));
  };

  const assignmentOptions = assignments
    .map((assignment) => {
      const block = blocksById.get(assignment.schedule_block_id);
      const coach = assignableCoachesById.get(assignment.coach_profile_id);
      const coachPerson = coach?.person_profile_id
        ? peopleById.get(coach.person_profile_id)
        : undefined;

      if (!block || !coach) {
        return null;
      }

      return {
        assignmentId: assignment.id,
        blockId: block.id,
        centerName:
          centersById.get(block.center_id)?.name ??
          `Centro ${shortId(block.center_id)}`,
        classTypeName:
          classTypesById.get(block.class_type_id)?.name ??
          "Bloque operativo",
        coachName: coachPerson?.display_name ?? `Coach ${shortId(coach.id)}`,
        coachProfileId: coach.id,
        endTime: block.end_time,
        serviceDate: block.service_date,
        startTime: block.start_time,
        status: block.status,
        targetRestrictions: getTargetRestrictions(assignment, block),
      } satisfies ChangeRequestCreationAssignmentOption;
    })
    .filter(
      (option): option is ChangeRequestCreationAssignmentOption =>
        option !== null,
    );

  return success({
    assignmentOptions,
    canManage,
    targetOptions,
  });
}

export async function listVisibleChangeRequests(
  input: ListVisibleChangeRequestsInput = {},
): Promise<ChangeRequestResult<ChangeRequestListItem[]>> {
  const validation = validateListInput(input);

  if (!validation.ok) {
    return failure(validation.error);
  }

  const context = await resolveChangeRequestContext({
    organizationId: validation.value.organizationId,
  });

  if (!context.ok) {
    return context;
  }

  let query = context.data.supabase
    .from("change_requests")
    .select("*")
    .eq("organization_id", context.data.organization.id);

  if (validation.value.status) {
    query = query.eq("status", validation.value.status);
  }

  if (validation.value.statuses.length > 0) {
    query = query.in("status", validation.value.statuses);
  }

  if (validation.value.scheduleBlockId) {
    query = query.eq("schedule_block_id", validation.value.scheduleBlockId);
  }

  if (validation.value.requesterCoachProfileId) {
    query = query.eq(
      "requester_coach_profile_id",
      validation.value.requesterCoachProfileId,
    );
  }

  const { data: requestsData, error: requestsError } = await query
    .order("created_at", { ascending: false })
    .limit(validation.value.limit);

  if (requestsError) {
    return failure(mapChangeRequestDatabaseError(requestsError, "load-failed"));
  }

  const requests = requestsData ?? [];
  const requestIds = requests.map((request) => request.id);

  if (requestIds.length === 0) {
    return success([]);
  }

  const [targetsResult, eventsResult] = await Promise.all([
    context.data.supabase
      .from("change_request_targets")
      .select("*")
      .eq("organization_id", context.data.organization.id)
      .in("change_request_id", requestIds)
      .order("offered_at", { ascending: true }),
    input.includeEvents
      ? context.data.supabase
          .from("change_request_events")
          .select("*")
          .eq("organization_id", context.data.organization.id)
          .in("change_request_id", requestIds)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (targetsResult.error || eventsResult.error) {
    return failure("load-failed");
  }

  const targetsByRequestId = new Map<string, ChangeRequestTargetRow[]>();
  const eventsByRequestId = new Map<string, ChangeRequestEventRow[]>();

  for (const target of targetsResult.data ?? []) {
    const targets = targetsByRequestId.get(target.change_request_id) ?? [];
    targets.push(target);
    targetsByRequestId.set(target.change_request_id, targets);
  }

  for (const event of eventsResult.data ?? []) {
    const events = eventsByRequestId.get(event.change_request_id) ?? [];
    events.push(event);
    eventsByRequestId.set(event.change_request_id, events);
  }

  return success(
    requests.map((request) => ({
      events: eventsByRequestId.get(request.id) ?? [],
      request,
      targets: targetsByRequestId.get(request.id) ?? [],
    })),
  );
}

export async function createOwnChangeRequest(
  input: CreateOwnChangeRequestInput,
): Promise<ChangeRequestResult<ChangeRequestRow>> {
  const validation = validateCreateOwnInput(input);

  if (!validation.ok) {
    return failure(validation.error);
  }

  const context = await resolveChangeRequestContext({
    organizationId: validation.value.organizationId,
    requirePersonalAccess: true,
  });

  if (!context.ok) {
    return context;
  }

  const referenceError = await ensureOwnSourceAssignmentReference({
    context: context.data,
    scheduleBlockAssignmentId: validation.value.scheduleBlockAssignmentId,
    scheduleBlockId: validation.value.scheduleBlockId,
  });

  if (referenceError) {
    return failure(referenceError);
  }

  const { data, error } = await context.data.supabase.rpc(
    "create_own_change_request",
    {
      target_expires_at: validation.value.expiresAt ?? undefined,
      target_organization_id: context.data.organization.id,
      target_reason_summary: validation.value.reasonSummary ?? undefined,
      target_request_type: validation.value.requestType,
      target_schedule_block_assignment_id:
        validation.value.scheduleBlockAssignmentId,
      target_schedule_block_id: validation.value.scheduleBlockId,
    },
  );

  if (error || !data) {
    return failure(mapChangeRequestDatabaseError(error ?? {}, "save-failed"));
  }

  return success(data);
}

export async function createChangeRequestWithTargets(
  input: CreateChangeRequestWithTargetsInput,
): Promise<ChangeRequestResult<ChangeRequestRow>> {
  const validation = validateCreateWithTargetsInput(input);

  if (!validation.ok) {
    return failure(validation.error);
  }

  const context = await resolveChangeRequestContext({
    organizationId: validation.value.organizationId,
  });

  if (!context.ok) {
    return context;
  }

  const canManage = canManageChangeRequests(context.data.membership.role);
  let operationContext = context.data;

  if (!canManage) {
    const personalContext = await resolveChangeRequestContext({
      organizationId: validation.value.organizationId,
      requireOwnPersonProfile: true,
      requirePersonalAccess: true,
    });

    if (!personalContext.ok) {
      return personalContext;
    }

    operationContext = personalContext.data;
  }

  const referenceError = await ensureOwnSourceAssignmentReference({
    context: operationContext,
    scheduleBlockAssignmentId: validation.value.scheduleBlockAssignmentId,
    scheduleBlockId: validation.value.scheduleBlockId,
  });

  if (referenceError) {
    return failure(referenceError);
  }

  const targetsError = await ensureCoachProfilesAreAssignable({
    coachProfileIds: validation.value.targetCoachProfileIds,
    context: operationContext,
  });

  if (targetsError) {
    return failure(targetsError);
  }

  const rpcArgs = {
    target_expires_at: validation.value.expiresAt ?? undefined,
    target_organization_id: operationContext.organization.id,
    target_reason_summary: validation.value.reasonSummary ?? undefined,
    target_request_type: validation.value.requestType,
    target_schedule_block_assignment_id:
      validation.value.scheduleBlockAssignmentId,
    target_schedule_block_id: validation.value.scheduleBlockId,
    target_target_coach_profile_ids: validation.value.targetCoachProfileIds,
  };
  const { data, error } = canManage
    ? await operationContext.supabase.rpc(
        "create_managed_change_request_with_targets",
        rpcArgs,
      )
    : await operationContext.supabase.rpc(
        "create_own_change_request_with_targets",
        rpcArgs,
      );

  if (error || !data) {
    return failure(mapChangeRequestDatabaseError(error ?? {}, "save-failed"));
  }

  return success(data);
}

export async function offerChangeRequestToCoach(
  input: OfferChangeRequestToCoachInput,
): Promise<ChangeRequestResult<ChangeRequestTargetRow>> {
  const validation = validateOfferInput(input);

  if (!validation.ok) {
    return failure(validation.error);
  }

  const context = await resolveChangeRequestContext({
    organizationId: validation.value.organizationId,
  });

  if (!context.ok) {
    return context;
  }

  const targetError = await ensureCoachProfileIsAssignable({
    coachProfileId: validation.value.coachProfileId,
    context: context.data,
  });

  if (targetError) {
    return failure(targetError);
  }

  const { data, error } = await context.data.supabase.rpc(
    "offer_change_request_to_coach",
    {
      target_change_request_id: validation.value.changeRequestId,
      target_coach_profile_id: validation.value.coachProfileId,
      target_expires_at: validation.value.expiresAt ?? undefined,
      target_organization_id: context.data.organization.id,
      target_target_type: validation.value.targetType,
    },
  );

  if (error || !data) {
    return failure(mapChangeRequestDatabaseError(error ?? {}, "save-failed"));
  }

  return success(data);
}

export async function respondToChangeRequestTarget(
  input: RespondToChangeRequestTargetInput,
): Promise<ChangeRequestResult<ChangeRequestTargetRow>> {
  const validation = validateRespondInput(input);

  if (!validation.ok) {
    return failure(validation.error);
  }

  const context = await resolveChangeRequestContext({
    organizationId: validation.value.organizationId,
    requireOwnPersonProfile: true,
    requirePersonalAccess: true,
  });

  if (!context.ok) {
    return context;
  }

  const { data, error } = await context.data.supabase.rpc(
    "respond_to_change_request_target",
    {
      target_change_request_target_id: validation.value.changeRequestTargetId,
      target_organization_id: context.data.organization.id,
      target_response: validation.value.response,
      target_response_note_summary:
        validation.value.responseNoteSummary ?? undefined,
    },
  );

  if (error || !data) {
    return failure(mapChangeRequestDatabaseError(error ?? {}, "save-failed"));
  }

  return success(data);
}

export async function approveChangeRequest(
  input: ChangeRequestOperationInput,
): Promise<ChangeRequestResult<ChangeRequestRow>> {
  const validation = validateOperationInput(input);

  if (!validation.ok) {
    return failure(validation.error);
  }

  const context = await resolveChangeRequestContext({
    organizationId: validation.value.organizationId,
    requireManagement: true,
  });

  if (!context.ok) {
    return context;
  }

  const { data, error } = await context.data.supabase.rpc(
    "approve_change_request",
    {
      target_change_request_id: validation.value.changeRequestId,
      target_organization_id: context.data.organization.id,
    },
  );

  if (error || !data) {
    return failure(mapChangeRequestDatabaseError(error ?? {}, "save-failed"));
  }

  return success(data);
}

export async function rejectChangeRequest(
  input: ChangeRequestOperationInput,
): Promise<ChangeRequestResult<ChangeRequestRow>> {
  const validation = validateOperationInput(input);

  if (!validation.ok) {
    return failure(validation.error);
  }

  const context = await resolveChangeRequestContext({
    organizationId: validation.value.organizationId,
    requireManagement: true,
  });

  if (!context.ok) {
    return context;
  }

  const { data, error } = await context.data.supabase.rpc(
    "reject_change_request",
    {
      target_change_request_id: validation.value.changeRequestId,
      target_organization_id: context.data.organization.id,
    },
  );

  if (error || !data) {
    return failure(mapChangeRequestDatabaseError(error ?? {}, "save-failed"));
  }

  return success(data);
}

export async function cancelChangeRequest(
  input: ChangeRequestOperationInput,
): Promise<ChangeRequestResult<ChangeRequestRow>> {
  const validation = validateOperationInput(input);

  if (!validation.ok) {
    return failure(validation.error);
  }

  const context = await resolveChangeRequestContext({
    organizationId: validation.value.organizationId,
  });

  if (!context.ok) {
    return context;
  }

  const { data, error } = await context.data.supabase.rpc(
    "cancel_change_request",
    {
      target_change_request_id: validation.value.changeRequestId,
      target_organization_id: context.data.organization.id,
    },
  );

  if (error || !data) {
    return failure(mapChangeRequestDatabaseError(error ?? {}, "save-failed"));
  }

  return success(data);
}

export async function expireChangeRequest(
  input: ChangeRequestOperationInput,
): Promise<ChangeRequestResult<ChangeRequestRow>> {
  const validation = validateOperationInput(input);

  if (!validation.ok) {
    return failure(validation.error);
  }

  const context = await resolveChangeRequestContext({
    organizationId: validation.value.organizationId,
  });

  if (!context.ok) {
    return context;
  }

  const { data, error } = await context.data.supabase.rpc(
    "expire_change_request",
    {
      target_change_request_id: validation.value.changeRequestId,
      target_organization_id: context.data.organization.id,
    },
  );

  if (error || !data) {
    return failure(mapChangeRequestDatabaseError(error ?? {}, "save-failed"));
  }

  return success(data);
}

export async function applyApprovedChangeRequest(
  input: ChangeRequestOperationInput,
): Promise<ChangeRequestResult<ChangeRequestRow>> {
  const validation = validateOperationInput(input);

  if (!validation.ok) {
    return failure(validation.error);
  }

  const context = await resolveChangeRequestContext({
    organizationId: validation.value.organizationId,
    requireManagement: true,
  });

  if (!context.ok) {
    return context;
  }

  const { data, error } = await context.data.supabase.rpc(
    "apply_approved_change_request",
    {
      target_change_request_id: validation.value.changeRequestId,
      target_organization_id: context.data.organization.id,
    },
  );

  if (error || !data) {
    return failure(mapChangeRequestDatabaseError(error ?? {}, "save-failed"));
  }

  if (data.status !== "applied") {
    const applicationFailure = await getLatestApplicationFailureCode({
      changeRequestId: validation.value.changeRequestId,
      context: context.data,
    });

    return failure(applicationFailure ?? "not-actionable");
  }

  return success(data);
}
