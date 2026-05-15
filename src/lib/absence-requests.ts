import {
  canManageAbsenceRequests,
  canUseAbsenceSelfService,
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
import type { Json } from "@/types/supabase";

export const ABSENCE_REQUEST_TYPES = [
  "vacation",
  "day_off",
  "partial_day",
  "permission",
  "personal_absence",
  "unavailable",
] as const;
export const ABSENCE_REQUEST_STATUSES = [
  "requested",
  "pending_review",
  "approved",
  "rejected",
  "cancelled",
  "expired",
] as const;
export const ABSENCE_REVIEW_DECISIONS = ["approved", "rejected"] as const;
export const ABSENCE_REQUEST_EVENT_TYPES = [
  "absence_requested",
  "absence_review_requested",
  "absence_approved",
  "absence_rejected",
  "absence_cancelled",
  "absence_expired",
  "coverage_impact_detected",
] as const;
export const ABSENCE_REQUEST_EVENT_RESULTS = [
  "success",
  "failed",
  "denied",
] as const;
export const ABSENCE_SCHEDULE_IMPACT_STATUSES = [
  "none",
  "potential",
  "coverage_needed",
] as const;

export type AbsenceRequestType = (typeof ABSENCE_REQUEST_TYPES)[number];
export type AbsenceRequestStatus = (typeof ABSENCE_REQUEST_STATUSES)[number];
export type AbsenceReviewDecision = (typeof ABSENCE_REVIEW_DECISIONS)[number];
export type AbsenceRequestEventType =
  (typeof ABSENCE_REQUEST_EVENT_TYPES)[number];
export type AbsenceRequestEventResult =
  (typeof ABSENCE_REQUEST_EVENT_RESULTS)[number];
export type AbsenceScheduleImpactStatus =
  (typeof ABSENCE_SCHEDULE_IMPACT_STATUSES)[number];

export type AbsenceRequestRow = {
  absence_type: AbsenceRequestType;
  cancelled_at: string | null;
  created_at: string;
  expired_at: string | null;
  expires_at: string | null;
  id: string;
  organization_id: string;
  reason_summary: string | null;
  requested_at: string;
  requested_by_membership_id: string;
  requested_by_person_profile_id: string;
  requested_by_user_id: string;
  resolved_at: string | null;
  retain_until: string;
  review_required: boolean;
  reviewed_at: string | null;
  reviewed_by_membership_id: string | null;
  reviewed_by_person_profile_id: string | null;
  status: AbsenceRequestStatus;
  subject_coach_profile_id: string | null;
  subject_person_profile_id: string;
  updated_at: string;
};

export type AbsenceRequestPeriodRow = {
  absence_request_id: string;
  all_day: boolean;
  created_at: string;
  ends_at: string;
  id: string;
  organization_id: string;
  period_index: number;
  starts_at: string;
  timezone: string;
};

export type AbsenceRequestEventRow = {
  absence_request_id: string;
  actor_membership_id: string;
  actor_person_profile_id: string | null;
  actor_user_id: string;
  changed_fields: Json;
  created_at: string;
  event_type: AbsenceRequestEventType;
  id: string;
  organization_id: string;
  result: AbsenceRequestEventResult;
  retain_until: string;
};

export type AbsenceScheduleImpactRow = {
  absence_request_id: string;
  absence_request_period_id: string;
  impact_status: AbsenceScheduleImpactStatus;
  organization_id: string;
  schedule_block_assignment_id: string;
  schedule_block_id: string;
  subject_coach_profile_id: string;
};

export type AbsenceRequestErrorCode =
  | "authentication-required"
  | "date-range-invalid"
  | "forbidden"
  | "invalid-absence-request"
  | "invalid-absence-type"
  | "invalid-decision"
  | "invalid-input"
  | "invalid-limit"
  | "invalid-organization"
  | "invalid-period"
  | "invalid-reason-summary"
  | "invalid-status"
  | "invalid-timezone"
  | "invalid-timestamp"
  | "load-failed"
  | "no-active-memberships"
  | "not-actionable"
  | "not-found"
  | "organization-not-found"
  | "organization-required"
  | "permission-denied"
  | "profile-missing"
  | "save-failed";

export type AbsenceRequestResult<T> =
  | {
      data: T;
      ok: true;
    }
  | {
      error: AbsenceRequestErrorCode;
      ok: false;
    };

export type AbsenceRequestListItem = {
  events: AbsenceRequestEventRow[];
  periods: AbsenceRequestPeriodRow[];
  request: AbsenceRequestRow;
};

export type ListOwnAbsenceRequestsInput = {
  absenceType?: AbsenceRequestType | string | null;
  includeEvents?: boolean | null;
  limit?: number | null;
  organizationId: string;
  statuses?: readonly (AbsenceRequestStatus | string)[] | null;
};

export type ListAbsenceReviewQueueInput = {
  absenceType?: AbsenceRequestType | string | null;
  includeEvents?: boolean | null;
  limit?: number | null;
  organizationId: string;
  statuses?: readonly (AbsenceRequestStatus | string)[] | null;
  subjectCoachProfileId?: string | null;
};

export type CreateOwnAbsenceRequestInput = {
  absenceType: AbsenceRequestType | string;
  allDay?: boolean | null;
  endsAt: Date | string;
  expiresAt?: Date | string | null;
  organizationId: string;
  reasonSummary?: string | null;
  startsAt: Date | string;
  timezone?: string | null;
};

export type AbsenceRequestOperationInput = {
  absenceRequestId: string;
  organizationId: string;
};

export type ReviewAbsenceRequestInput = AbsenceRequestOperationInput & {
  decision: AbsenceReviewDecision | string;
};

export type ListAbsenceRequestEventsInput = AbsenceRequestOperationInput & {
  limit?: number | null;
};

export type ListOperationalAbsenceScheduleImpactsInput = {
  limit?: number | null;
  organizationId: string;
  scheduleBlockIds?: readonly string[] | null;
  serviceDateFrom: string;
  serviceDateTo: string;
};

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
type ValidationResult<T> =
  | {
      ok: true;
      value: T;
    }
  | {
      error: AbsenceRequestErrorCode;
      ok: false;
    };
type AbsenceRequestContext = {
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
type QueryResponse<T> = {
  data: T | null;
  error: DatabaseErrorLike | null;
};
type UntypedSelectQuery<T> = PromiseLike<QueryResponse<T[]>> & {
  eq(column: string, value: unknown): UntypedSelectQuery<T>;
  gt(column: string, value: unknown): UntypedSelectQuery<T>;
  in(column: string, values: readonly unknown[]): UntypedSelectQuery<T>;
  limit(count: number): UntypedSelectQuery<T>;
  lt(column: string, value: unknown): UntypedSelectQuery<T>;
  maybeSingle(): Promise<QueryResponse<T | null>>;
  or(filters: string): UntypedSelectQuery<T>;
  order(
    column: string,
    options?: {
      ascending?: boolean;
    },
  ): UntypedSelectQuery<T>;
};
type UntypedTableBuilder = {
  select<T>(columns?: string): UntypedSelectQuery<T>;
};
type UntypedAbsenceClient = {
  from(table: string): UntypedTableBuilder;
  rpc<T>(
    fn: string,
    args?: Record<string, unknown>,
  ): Promise<QueryResponse<T>>;
};

const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 200;
const MAX_REASON_SUMMARY_LENGTH = 160;
const MAX_TIMEZONE_LENGTH = 80;
const MAX_ABSENCE_DAYS = 366;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_REVIEW_QUEUE_STATUSES: AbsenceRequestStatus[] = [
  "requested",
  "pending_review",
];
const SELF_CANCELLABLE_STATUSES: AbsenceRequestStatus[] = [
  "requested",
  "pending_review",
];
const ISO_TIMESTAMP_WITH_OFFSET_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:\d{2})$/;
const FORBIDDEN_REASON_SUMMARY_PATTERN =
  /(https?:\/\/|www[.]|data:|base64|token|secret|password|credential|signed-url|signed_url|storage\/v1|document|documento|archivo|justificante|payroll|salary|salario|nomina|iban|bank|dni|nif|ssn|national_id|gps|latitude|longitude|coordinate|ubicacion|location|baja|salud|health|medical|medic|diagnostic|sick|illness|familia|familiar|sancion|disciplin)/i;

function success<T>(data: T): AbsenceRequestResult<T> {
  return {
    data,
    ok: true,
  };
}

function failure(error: AbsenceRequestErrorCode): AbsenceRequestResult<never> {
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

function invalid(error: AbsenceRequestErrorCode): ValidationResult<never> {
  return {
    error,
    ok: false,
  };
}

function getAbsenceClient(
  supabase: SupabaseServerClient,
): UntypedAbsenceClient {
  return supabase as unknown as UntypedAbsenceClient;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeRequiredUuid(
  value: unknown,
  error: AbsenceRequestErrorCode,
): ValidationResult<string> {
  if (typeof value !== "string") {
    return invalid(error);
  }

  const trimmed = value.trim();

  return isPostgresUuid(trimmed) ? valid(trimmed) : invalid(error);
}

function normalizeOptionalUuid(
  value: unknown,
  error: AbsenceRequestErrorCode,
): ValidationResult<string | null> {
  if (value === undefined || value === null || value === "") {
    return valid(null);
  }

  return normalizeRequiredUuid(value, error);
}

function normalizeRequiredTimestamp(value: unknown): ValidationResult<string> {
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

function normalizeOptionalTimestamp(
  value: unknown,
): ValidationResult<string | null> {
  if (value === undefined || value === null || value === "") {
    return valid(null);
  }

  return normalizeRequiredTimestamp(value);
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

function parseDateInput(value: unknown): ValidationResult<Date> {
  if (typeof value !== "string" || !DATE_PATTERN.test(value.trim())) {
    return invalid("invalid-period");
  }

  const [year, month, day] = value.trim().split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return invalid("invalid-period");
  }

  return valid(date);
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setUTCDate(nextDate.getUTCDate() + days);

  return nextDate;
}

function normalizeOptionalText({
  error,
  maxLength,
  value,
}: {
  error: AbsenceRequestErrorCode;
  maxLength: number;
  value: unknown;
}): ValidationResult<string | null> {
  if (value === undefined || value === null || value === "") {
    return valid(null);
  }

  if (typeof value !== "string") {
    return invalid(error);
  }

  const trimmed = value.trim();

  if (!trimmed || trimmed.length > maxLength) {
    return invalid(error);
  }

  return valid(trimmed);
}

function normalizeOptionalBoolean(
  value: unknown,
): ValidationResult<boolean | null> {
  if (value === undefined || value === null) {
    return valid(null);
  }

  return typeof value === "boolean" ? valid(value) : invalid("invalid-input");
}

function isAbsenceRequestType(value: unknown): value is AbsenceRequestType {
  return ABSENCE_REQUEST_TYPES.includes(value as AbsenceRequestType);
}

function isAbsenceRequestStatus(value: unknown): value is AbsenceRequestStatus {
  return ABSENCE_REQUEST_STATUSES.includes(value as AbsenceRequestStatus);
}

function isAbsenceReviewDecision(
  value: unknown,
): value is AbsenceReviewDecision {
  return ABSENCE_REVIEW_DECISIONS.includes(value as AbsenceReviewDecision);
}

function normalizeOptionalAbsenceType(
  value: unknown,
): ValidationResult<AbsenceRequestType | null> {
  if (value === undefined || value === null || value === "") {
    return valid(null);
  }

  return isAbsenceRequestType(value)
    ? valid(value)
    : invalid("invalid-absence-type");
}

function normalizeRequiredAbsenceType(
  value: unknown,
): ValidationResult<AbsenceRequestType> {
  return isAbsenceRequestType(value)
    ? valid(value)
    : invalid("invalid-absence-type");
}

function normalizeStatuses(
  values: readonly (AbsenceRequestStatus | string)[] | null | undefined,
): ValidationResult<AbsenceRequestStatus[]> {
  if (!values || values.length === 0) {
    return valid([]);
  }

  const statuses = new Set<AbsenceRequestStatus>();

  for (const value of values) {
    if (!isAbsenceRequestStatus(value)) {
      return invalid("invalid-status");
    }

    statuses.add(value);
  }

  return valid([...statuses]);
}

function normalizeReasonSummary(
  value: unknown,
): ValidationResult<string | null> {
  const summary = normalizeOptionalText({
    error: "invalid-reason-summary",
    maxLength: MAX_REASON_SUMMARY_LENGTH,
    value,
  });

  if (!summary.ok) {
    return summary;
  }

  if (
    summary.value &&
    FORBIDDEN_REASON_SUMMARY_PATTERN.test(summary.value)
  ) {
    return invalid("invalid-reason-summary");
  }

  return summary;
}

function mapResolutionReason(
  reason: "no_active_memberships" | "organization_not_found" | "organization_required",
): AbsenceRequestErrorCode {
  if (reason === "no_active_memberships") {
    return "no-active-memberships";
  }

  if (reason === "organization_not_found") {
    return "organization-not-found";
  }

  return "organization-required";
}

export function mapAbsenceRequestDatabaseError(
  error: DatabaseErrorLike,
  fallback: AbsenceRequestErrorCode = "save-failed",
): AbsenceRequestErrorCode {
  const message = error.message?.toLowerCase() ?? "";

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

  if (
    message.includes("self-service") ||
    message.includes("active membership")
  ) {
    return "forbidden";
  }

  if (message.includes("linked person profile")) {
    return "profile-missing";
  }

  if (message.includes("summary")) {
    return "invalid-reason-summary";
  }

  if (message.includes("timezone")) {
    return "invalid-timezone";
  }

  if (message.includes("period")) {
    return "invalid-period";
  }

  if (message.includes("absence type")) {
    return "invalid-absence-type";
  }

  if (message.includes("decision")) {
    return "invalid-decision";
  }

  if (
    message.includes("not found") ||
    message.includes("was not found in tenant")
  ) {
    return "not-found";
  }

  if (
    message.includes("already closed") ||
    message.includes("awaiting review") ||
    message.includes("has expired") ||
    message.includes("not expirable") ||
    message.includes("not expirable yet") ||
    message.includes("approved absence cancellation")
  ) {
    return "not-actionable";
  }

  return fallback;
}

async function resolveAbsenceRequestContext({
  organizationId,
  requireManagement = false,
  requireOwnPersonProfile = false,
  requireSelfService = false,
}: {
  organizationId: unknown;
  requireManagement?: boolean;
  requireOwnPersonProfile?: boolean;
  requireSelfService?: boolean;
}): Promise<AbsenceRequestResult<AbsenceRequestContext>> {
  const normalizedOrganizationId = normalizeRequiredUuid(
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
    requireSelfService &&
    !canUseAbsenceSelfService(resolution.membership.role)
  ) {
    return failure("forbidden");
  }

  if (
    requireManagement &&
    !canManageAbsenceRequests(resolution.membership.role)
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
  input: ListOwnAbsenceRequestsInput | ListAbsenceReviewQueueInput,
): ValidationResult<{
  absenceType: AbsenceRequestType | null;
  includeEvents: boolean;
  limit: number;
  organizationId: string;
  statuses: AbsenceRequestStatus[];
  subjectCoachProfileId: string | null;
}> {
  if (!isRecord(input)) {
    return invalid("invalid-input");
  }

  const organizationId = normalizeRequiredUuid(
    input.organizationId,
    "invalid-organization",
  );

  if (!organizationId.ok) {
    return organizationId;
  }

  const absenceType = normalizeOptionalAbsenceType(input.absenceType);

  if (!absenceType.ok) {
    return absenceType;
  }

  const statuses = normalizeStatuses(input.statuses);

  if (!statuses.ok) {
    return statuses;
  }

  const limit = normalizeLimit(input.limit);

  if (!limit.ok) {
    return limit;
  }

  const includeEvents = normalizeOptionalBoolean(input.includeEvents);

  if (!includeEvents.ok) {
    return includeEvents;
  }

  const subjectCoachProfileId = normalizeOptionalUuid(
    "subjectCoachProfileId" in input ? input.subjectCoachProfileId : null,
    "invalid-input",
  );

  if (!subjectCoachProfileId.ok) {
    return subjectCoachProfileId;
  }

  return valid({
    absenceType: absenceType.value,
    includeEvents: includeEvents.value ?? false,
    limit: limit.value,
    organizationId: organizationId.value,
    statuses: statuses.value,
    subjectCoachProfileId: subjectCoachProfileId.value,
  });
}

function validateCreateInput(
  input: CreateOwnAbsenceRequestInput,
): ValidationResult<{
  absenceType: AbsenceRequestType;
  allDay: boolean;
  endsAt: string;
  expiresAt: string | null;
  organizationId: string;
  reasonSummary: string | null;
  startsAt: string;
  timezone: string | null;
}> {
  if (!isRecord(input)) {
    return invalid("invalid-input");
  }

  const organizationId = normalizeRequiredUuid(
    input.organizationId,
    "invalid-organization",
  );

  if (!organizationId.ok) {
    return organizationId;
  }

  const absenceType = normalizeRequiredAbsenceType(input.absenceType);

  if (!absenceType.ok) {
    return absenceType;
  }

  const startsAt = normalizeRequiredTimestamp(input.startsAt);

  if (!startsAt.ok) {
    return startsAt;
  }

  const endsAt = normalizeRequiredTimestamp(input.endsAt);

  if (!endsAt.ok) {
    return endsAt;
  }

  const startsAtMs = Date.parse(startsAt.value);
  const endsAtMs = Date.parse(endsAt.value);
  const maxDurationMs = MAX_ABSENCE_DAYS * 24 * 60 * 60 * 1000;

  if (endsAtMs <= startsAtMs || endsAtMs > startsAtMs + maxDurationMs) {
    return invalid("date-range-invalid");
  }

  const allDay = normalizeOptionalBoolean(input.allDay);

  if (!allDay.ok) {
    return allDay;
  }

  const timezone = normalizeOptionalText({
    error: "invalid-timezone",
    maxLength: MAX_TIMEZONE_LENGTH,
    value: input.timezone,
  });

  if (!timezone.ok) {
    return timezone;
  }

  const reasonSummary = normalizeReasonSummary(input.reasonSummary);

  if (!reasonSummary.ok) {
    return reasonSummary;
  }

  const expiresAt = normalizeOptionalTimestamp(input.expiresAt);

  if (!expiresAt.ok) {
    return expiresAt;
  }

  return valid({
    absenceType: absenceType.value,
    allDay: allDay.value ?? true,
    endsAt: endsAt.value,
    expiresAt: expiresAt.value,
    organizationId: organizationId.value,
    reasonSummary: reasonSummary.value,
    startsAt: startsAt.value,
    timezone: timezone.value,
  });
}

function validateOperationInput(
  input: AbsenceRequestOperationInput,
): ValidationResult<{
  absenceRequestId: string;
  organizationId: string;
}> {
  if (!isRecord(input)) {
    return invalid("invalid-input");
  }

  const organizationId = normalizeRequiredUuid(
    input.organizationId,
    "invalid-organization",
  );

  if (!organizationId.ok) {
    return organizationId;
  }

  const absenceRequestId = normalizeRequiredUuid(
    input.absenceRequestId,
    "invalid-absence-request",
  );

  if (!absenceRequestId.ok) {
    return absenceRequestId;
  }

  return valid({
    absenceRequestId: absenceRequestId.value,
    organizationId: organizationId.value,
  });
}

function validateReviewInput(
  input: ReviewAbsenceRequestInput,
): ValidationResult<{
  absenceRequestId: string;
  decision: AbsenceReviewDecision;
  organizationId: string;
}> {
  const operation = validateOperationInput(input);

  if (!operation.ok) {
    return operation;
  }

  if (!isAbsenceReviewDecision(input.decision)) {
    return invalid("invalid-decision");
  }

  return valid({
    ...operation.value,
    decision: input.decision,
  });
}

function validateEventsInput(
  input: ListAbsenceRequestEventsInput,
): ValidationResult<{
  absenceRequestId: string;
  limit: number;
  organizationId: string;
}> {
  const operation = validateOperationInput(input);

  if (!operation.ok) {
    return operation;
  }

  const limit = normalizeLimit(input.limit);

  if (!limit.ok) {
    return limit;
  }

  return valid({
    ...operation.value,
    limit: limit.value,
  });
}

function validateOperationalAbsenceImpactInput(
  input: ListOperationalAbsenceScheduleImpactsInput,
): ValidationResult<{
  limit: number;
  organizationId: string;
  scheduleBlockIds: string[];
  serviceDateFrom: string;
  serviceDateTo: string;
  windowEndsAt: string;
  windowStartsAt: string;
}> {
  if (!isRecord(input)) {
    return invalid("invalid-input");
  }

  const organizationId = normalizeRequiredUuid(
    input.organizationId,
    "invalid-organization",
  );

  if (!organizationId.ok) {
    return organizationId;
  }

  const serviceDateFrom = parseDateInput(input.serviceDateFrom);
  const serviceDateTo = parseDateInput(input.serviceDateTo);

  if (!serviceDateFrom.ok) {
    return serviceDateFrom;
  }

  if (!serviceDateTo.ok) {
    return serviceDateTo;
  }

  const dayMs = 24 * 60 * 60 * 1000;
  const rangeDays =
    (serviceDateTo.value.getTime() - serviceDateFrom.value.getTime()) / dayMs +
    1;

  if (rangeDays < 1 || rangeDays > MAX_ABSENCE_DAYS) {
    return invalid("date-range-invalid");
  }

  const limit = normalizeLimit(input.limit);

  if (!limit.ok) {
    return limit;
  }

  const scheduleBlockIds = new Set<string>();

  if (input.scheduleBlockIds) {
    if (!Array.isArray(input.scheduleBlockIds)) {
      return invalid("invalid-input");
    }

    for (const scheduleBlockId of input.scheduleBlockIds) {
      const normalizedScheduleBlockId = normalizeRequiredUuid(
        scheduleBlockId,
        "invalid-input",
      );

      if (!normalizedScheduleBlockId.ok) {
        return normalizedScheduleBlockId;
      }

      scheduleBlockIds.add(normalizedScheduleBlockId.value);
    }
  }

  return valid({
    limit: limit.value,
    organizationId: organizationId.value,
    scheduleBlockIds: [...scheduleBlockIds],
    serviceDateFrom: input.serviceDateFrom.trim(),
    serviceDateTo: input.serviceDateTo.trim(),
    windowEndsAt: addDays(serviceDateTo.value, 3).toISOString(),
    windowStartsAt: addDays(serviceDateFrom.value, -2).toISOString(),
  });
}

async function findReadableAbsenceRequest({
  absenceRequestId,
  context,
}: {
  absenceRequestId: string;
  context: AbsenceRequestContext;
}): Promise<AbsenceRequestResult<AbsenceRequestRow>> {
  const db = getAbsenceClient(context.supabase);
  const { data, error } = await db
    .from("absence_requests")
    .select<AbsenceRequestRow>("*")
    .eq("id", absenceRequestId)
    .eq("organization_id", context.organization.id)
    .maybeSingle();

  if (error) {
    return failure(mapAbsenceRequestDatabaseError(error, "load-failed"));
  }

  if (!data) {
    return failure("not-found");
  }

  return success(data);
}

async function loadAbsenceRequestItems({
  context,
  includeEvents,
  requests,
}: {
  context: AbsenceRequestContext;
  includeEvents: boolean;
  requests: AbsenceRequestRow[];
}): Promise<AbsenceRequestResult<AbsenceRequestListItem[]>> {
  if (requests.length === 0) {
    return success([]);
  }

  const db = getAbsenceClient(context.supabase);
  const requestIds = requests.map((request) => request.id);
  const [periodsResult, eventsResult] = await Promise.all([
    db
      .from("absence_request_periods")
      .select<AbsenceRequestPeriodRow>("*")
      .eq("organization_id", context.organization.id)
      .in("absence_request_id", requestIds)
      .order("period_index", { ascending: true }),
    includeEvents
      ? db
          .from("absence_request_events")
          .select<AbsenceRequestEventRow>("*")
          .eq("organization_id", context.organization.id)
          .in("absence_request_id", requestIds)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (periodsResult.error || eventsResult.error) {
    return failure("load-failed");
  }

  const periodsByRequestId = new Map<string, AbsenceRequestPeriodRow[]>();
  const eventsByRequestId = new Map<string, AbsenceRequestEventRow[]>();

  for (const period of periodsResult.data ?? []) {
    const periods = periodsByRequestId.get(period.absence_request_id) ?? [];
    periods.push(period);
    periodsByRequestId.set(period.absence_request_id, periods);
  }

  for (const event of eventsResult.data ?? []) {
    const events = eventsByRequestId.get(event.absence_request_id) ?? [];
    events.push(event);
    eventsByRequestId.set(event.absence_request_id, events);
  }

  return success(
    requests.map((request) => ({
      events: eventsByRequestId.get(request.id) ?? [],
      periods: periodsByRequestId.get(request.id) ?? [],
      request,
    })),
  );
}

export async function listOwnAbsenceRequests(
  input: ListOwnAbsenceRequestsInput,
): Promise<AbsenceRequestResult<AbsenceRequestListItem[]>> {
  const validation = validateListInput(input);

  if (!validation.ok) {
    return failure(validation.error);
  }

  const context = await resolveAbsenceRequestContext({
    organizationId: validation.value.organizationId,
    requireOwnPersonProfile: true,
    requireSelfService: true,
  });

  if (!context.ok) {
    return context;
  }

  const db = getAbsenceClient(context.data.supabase);
  let query = db
    .from("absence_requests")
    .select<AbsenceRequestRow>("*")
    .eq("organization_id", context.data.organization.id)
    .or(
      `subject_person_profile_id.eq.${context.data.ownPersonProfileId},requested_by_person_profile_id.eq.${context.data.ownPersonProfileId}`,
    );

  if (validation.value.absenceType) {
    query = query.eq("absence_type", validation.value.absenceType);
  }

  if (validation.value.statuses.length > 0) {
    query = query.in("status", validation.value.statuses);
  }

  const { data, error } = await query
    .order("requested_at", { ascending: false })
    .limit(validation.value.limit);

  if (error) {
    return failure(mapAbsenceRequestDatabaseError(error, "load-failed"));
  }

  return loadAbsenceRequestItems({
    context: context.data,
    includeEvents: validation.value.includeEvents,
    requests: data ?? [],
  });
}

export async function listAbsenceReviewQueue(
  input: ListAbsenceReviewQueueInput,
): Promise<AbsenceRequestResult<AbsenceRequestListItem[]>> {
  const validation = validateListInput(input);

  if (!validation.ok) {
    return failure(validation.error);
  }

  const context = await resolveAbsenceRequestContext({
    organizationId: validation.value.organizationId,
    requireManagement: true,
  });

  if (!context.ok) {
    return context;
  }

  const db = getAbsenceClient(context.data.supabase);
  let query = db
    .from("absence_requests")
    .select<AbsenceRequestRow>("*")
    .eq("organization_id", context.data.organization.id)
    .in(
      "status",
      validation.value.statuses.length > 0
        ? validation.value.statuses
        : DEFAULT_REVIEW_QUEUE_STATUSES,
    );

  if (validation.value.absenceType) {
    query = query.eq("absence_type", validation.value.absenceType);
  }

  if (validation.value.subjectCoachProfileId) {
    query = query.eq(
      "subject_coach_profile_id",
      validation.value.subjectCoachProfileId,
    );
  }

  const { data, error } = await query
    .order("requested_at", { ascending: true })
    .limit(validation.value.limit);

  if (error) {
    return failure(mapAbsenceRequestDatabaseError(error, "load-failed"));
  }

  return loadAbsenceRequestItems({
    context: context.data,
    includeEvents: validation.value.includeEvents,
    requests: data ?? [],
  });
}

export async function createOwnAbsenceRequest(
  input: CreateOwnAbsenceRequestInput,
): Promise<AbsenceRequestResult<AbsenceRequestRow>> {
  const validation = validateCreateInput(input);

  if (!validation.ok) {
    return failure(validation.error);
  }

  const context = await resolveAbsenceRequestContext({
    organizationId: validation.value.organizationId,
    requireOwnPersonProfile: true,
    requireSelfService: true,
  });

  if (!context.ok) {
    return context;
  }

  const db = getAbsenceClient(context.data.supabase);
  const { data, error } = await db.rpc<AbsenceRequestRow>(
    "create_own_absence_request",
    {
      target_absence_type: validation.value.absenceType,
      target_all_day: validation.value.allDay,
      target_ends_at: validation.value.endsAt,
      target_expires_at: validation.value.expiresAt ?? undefined,
      target_organization_id: context.data.organization.id,
      target_reason_summary: validation.value.reasonSummary ?? undefined,
      target_starts_at: validation.value.startsAt,
      target_timezone: validation.value.timezone ?? undefined,
    },
  );

  if (error || !data) {
    return failure(mapAbsenceRequestDatabaseError(error ?? {}, "save-failed"));
  }

  return success(data);
}

export async function cancelOwnAbsenceRequest(
  input: AbsenceRequestOperationInput,
): Promise<AbsenceRequestResult<AbsenceRequestRow>> {
  const validation = validateOperationInput(input);

  if (!validation.ok) {
    return failure(validation.error);
  }

  const context = await resolveAbsenceRequestContext({
    organizationId: validation.value.organizationId,
    requireOwnPersonProfile: true,
    requireSelfService: true,
  });

  if (!context.ok) {
    return context;
  }

  const request = await findReadableAbsenceRequest({
    absenceRequestId: validation.value.absenceRequestId,
    context: context.data,
  });

  if (!request.ok) {
    return request;
  }

  const isOwnRequest =
    request.data.subject_person_profile_id === context.data.ownPersonProfileId ||
    request.data.requested_by_person_profile_id === context.data.ownPersonProfileId;

  if (!isOwnRequest) {
    return failure("forbidden");
  }

  if (!SELF_CANCELLABLE_STATUSES.includes(request.data.status)) {
    return failure("not-actionable");
  }

  const db = getAbsenceClient(context.data.supabase);
  const { data, error } = await db.rpc<AbsenceRequestRow>(
    "cancel_absence_request",
    {
      target_absence_request_id: validation.value.absenceRequestId,
      target_organization_id: context.data.organization.id,
    },
  );

  if (error || !data) {
    return failure(mapAbsenceRequestDatabaseError(error ?? {}, "save-failed"));
  }

  return success(data);
}

export async function reviewAbsenceRequest(
  input: ReviewAbsenceRequestInput,
): Promise<AbsenceRequestResult<AbsenceRequestRow>> {
  const validation = validateReviewInput(input);

  if (!validation.ok) {
    return failure(validation.error);
  }

  const context = await resolveAbsenceRequestContext({
    organizationId: validation.value.organizationId,
    requireManagement: true,
  });

  if (!context.ok) {
    return context;
  }

  const db = getAbsenceClient(context.data.supabase);
  const { data, error } = await db.rpc<AbsenceRequestRow>(
    "review_absence_request",
    {
      target_absence_request_id: validation.value.absenceRequestId,
      target_decision: validation.value.decision,
      target_organization_id: context.data.organization.id,
    },
  );

  if (error || !data) {
    return failure(mapAbsenceRequestDatabaseError(error ?? {}, "save-failed"));
  }

  return success(data);
}

export async function expireAbsenceRequest(
  input: AbsenceRequestOperationInput,
): Promise<AbsenceRequestResult<AbsenceRequestRow>> {
  const validation = validateOperationInput(input);

  if (!validation.ok) {
    return failure(validation.error);
  }

  const context = await resolveAbsenceRequestContext({
    organizationId: validation.value.organizationId,
  });

  if (!context.ok) {
    return context;
  }

  const request = await findReadableAbsenceRequest({
    absenceRequestId: validation.value.absenceRequestId,
    context: context.data,
  });

  if (!request.ok) {
    return request;
  }

  const db = getAbsenceClient(context.data.supabase);
  const { data, error } = await db.rpc<AbsenceRequestRow>(
    "expire_absence_request",
    {
      target_absence_request_id: validation.value.absenceRequestId,
      target_organization_id: context.data.organization.id,
    },
  );

  if (error || !data) {
    return failure(mapAbsenceRequestDatabaseError(error ?? {}, "save-failed"));
  }

  return success(data);
}

export async function listAbsenceRequestEvents(
  input: ListAbsenceRequestEventsInput,
): Promise<AbsenceRequestResult<AbsenceRequestEventRow[]>> {
  const validation = validateEventsInput(input);

  if (!validation.ok) {
    return failure(validation.error);
  }

  const context = await resolveAbsenceRequestContext({
    organizationId: validation.value.organizationId,
  });

  if (!context.ok) {
    return context;
  }

  const request = await findReadableAbsenceRequest({
    absenceRequestId: validation.value.absenceRequestId,
    context: context.data,
  });

  if (!request.ok) {
    return request;
  }

  const db = getAbsenceClient(context.data.supabase);
  const { data, error } = await db
    .from("absence_request_events")
    .select<AbsenceRequestEventRow>("*")
    .eq("organization_id", context.data.organization.id)
    .eq("absence_request_id", validation.value.absenceRequestId)
    .order("created_at", { ascending: true })
    .limit(validation.value.limit);

  if (error) {
    return failure(mapAbsenceRequestDatabaseError(error, "load-failed"));
  }

  return success(data ?? []);
}

export async function listAbsenceScheduleImpacts(
  input: AbsenceRequestOperationInput,
): Promise<AbsenceRequestResult<AbsenceScheduleImpactRow[]>> {
  const validation = validateOperationInput(input);

  if (!validation.ok) {
    return failure(validation.error);
  }

  const context = await resolveAbsenceRequestContext({
    organizationId: validation.value.organizationId,
  });

  if (!context.ok) {
    return context;
  }

  const request = await findReadableAbsenceRequest({
    absenceRequestId: validation.value.absenceRequestId,
    context: context.data,
  });

  if (!request.ok) {
    return request;
  }

  const db = getAbsenceClient(context.data.supabase);
  const { data, error } = await db.rpc<AbsenceScheduleImpactRow[]>(
    "list_absence_schedule_impacts",
    {
      target_absence_request_id: validation.value.absenceRequestId,
      target_organization_id: context.data.organization.id,
    },
  );

  if (error) {
    return failure(mapAbsenceRequestDatabaseError(error, "load-failed"));
  }

  return success(data ?? []);
}

export async function listOperationalAbsenceScheduleImpacts(
  input: ListOperationalAbsenceScheduleImpactsInput,
): Promise<AbsenceRequestResult<AbsenceScheduleImpactRow[]>> {
  const validation = validateOperationalAbsenceImpactInput(input);

  if (!validation.ok) {
    return failure(validation.error);
  }

  const context = await resolveAbsenceRequestContext({
    organizationId: validation.value.organizationId,
    requireManagement: true,
  });

  if (!context.ok) {
    return context;
  }

  const db = getAbsenceClient(context.data.supabase);
  const { data: periods, error: periodsError } = await db
    .from("absence_request_periods")
    .select<AbsenceRequestPeriodRow>("absence_request_id")
    .eq("organization_id", context.data.organization.id)
    .lt("starts_at", validation.value.windowEndsAt)
    .gt("ends_at", validation.value.windowStartsAt)
    .order("starts_at", { ascending: true })
    .limit(validation.value.limit * 4);

  if (periodsError) {
    return failure(mapAbsenceRequestDatabaseError(periodsError, "load-failed"));
  }

  const requestIds = [
    ...new Set((periods ?? []).map((period) => period.absence_request_id)),
  ].slice(0, validation.value.limit);

  if (requestIds.length === 0) {
    return success([]);
  }

  const { data: requests, error: requestsError } = await db
    .from("absence_requests")
    .select<AbsenceRequestRow>("id")
    .eq("organization_id", context.data.organization.id)
    .in("id", requestIds)
    .in("status", ["pending_review", "approved"])
    .limit(validation.value.limit);

  if (requestsError) {
    return failure(mapAbsenceRequestDatabaseError(requestsError, "load-failed"));
  }

  if (!requests || requests.length === 0) {
    return success([]);
  }

  const scheduleBlockIds = new Set(validation.value.scheduleBlockIds);
  const impactResults = await Promise.all(
    requests.map((request) =>
      db.rpc<AbsenceScheduleImpactRow[]>("list_absence_schedule_impacts", {
        target_absence_request_id: request.id,
        target_organization_id: context.data.organization.id,
      }),
    ),
  );

  const impacts: AbsenceScheduleImpactRow[] = [];

  for (const result of impactResults) {
    if (result.error) {
      return failure(mapAbsenceRequestDatabaseError(result.error, "load-failed"));
    }

    for (const impact of result.data ?? []) {
      if (
        impact.impact_status !== "coverage_needed" &&
        impact.impact_status !== "potential"
      ) {
        continue;
      }

      if (
        scheduleBlockIds.size > 0 &&
        !scheduleBlockIds.has(impact.schedule_block_id)
      ) {
        continue;
      }

      impacts.push(impact);
    }
  }

  return success(impacts);
}
