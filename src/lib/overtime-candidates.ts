import {
  canReadOvertimeCandidates,
  canReviewOvertimeCandidates,
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

export const OVERTIME_CANDIDATE_STATUSES = [
  "detected",
  "needs_review",
  "under_review",
  "operationally_validated",
  "operationally_rejected",
  "superseded",
  "closed",
] as const;
export const OVERTIME_CANDIDATE_REVIEW_STATUSES = [
  "needs_review",
  "under_review",
  "operationally_validated",
  "operationally_rejected",
  "superseded",
  "closed",
] as const;
export const OVERTIME_CANDIDATE_DETECTION_SOURCES = [
  "manual_signal",
  "time_difference",
  "schedule_difference",
  "weekly_review",
  "event_context",
  "absence_context",
  "staff_work_window_context",
] as const;
export const OVERTIME_CANDIDATE_SOURCE_TYPES = [
  "time_record",
  "time_punch",
  "time_weekly_approval",
  "schedule_block",
  "schedule_block_assignment",
  "staff_work_window",
  "absence_request",
  "absence_request_period",
  "operational_event",
  "manual_context",
] as const;

export type OvertimeCandidateStatus =
  (typeof OVERTIME_CANDIDATE_STATUSES)[number];
export type OvertimeCandidateReviewStatus =
  (typeof OVERTIME_CANDIDATE_REVIEW_STATUSES)[number];
export type OvertimeCandidateDetectionSource =
  (typeof OVERTIME_CANDIDATE_DETECTION_SOURCES)[number];
export type OvertimeCandidateSourceType =
  (typeof OVERTIME_CANDIDATE_SOURCE_TYPES)[number];

export type OvertimeCandidateRow = {
  candidate_minutes: number;
  closed_at: string | null;
  created_at: string;
  created_by_membership_id: string;
  detection_source: OvertimeCandidateDetectionSource;
  id: string;
  organization_id: string;
  period_end_date: string;
  period_start_date: string;
  person_profile_id: string;
  planned_minutes_snapshot: number;
  retain_until: string;
  reviewed_at: string | null;
  reviewed_by_membership_id: string | null;
  status: OvertimeCandidateStatus;
  timezone: string;
  updated_at: string;
  worked_minutes_snapshot: number;
};

export type OvertimeCandidateSourceRow = {
  created_at: string;
  created_by_membership_id: string;
  id: string;
  organization_id: string;
  overtime_candidate_id: string;
  source_id: string | null;
  source_type: OvertimeCandidateSourceType;
};

export type OvertimeCandidateEventRow = {
  actor_membership_id: string;
  actor_person_profile_id: string | null;
  actor_user_id: string;
  changed_fields: Json;
  created_at: string;
  event_type: string;
  id: string;
  new_status: OvertimeCandidateStatus | null;
  organization_id: string;
  overtime_candidate_id: string;
  previous_status: OvertimeCandidateStatus | null;
  result: string;
  retain_until: string;
};

export type OvertimeCandidateErrorCode =
  | "authentication-required"
  | "date-range-invalid"
  | "forbidden"
  | "invalid-candidate"
  | "invalid-detection-source"
  | "invalid-input"
  | "invalid-limit"
  | "invalid-minutes"
  | "invalid-organization"
  | "invalid-period"
  | "invalid-person-profile"
  | "invalid-source"
  | "invalid-source-type"
  | "invalid-status"
  | "invalid-timezone"
  | "load-failed"
  | "no-active-memberships"
  | "not-actionable"
  | "not-found"
  | "organization-not-found"
  | "organization-required"
  | "permission-denied"
  | "save-failed";

export type OvertimeCandidateResult<T> =
  | {
      data: T;
      ok: true;
    }
  | {
      error: OvertimeCandidateErrorCode;
      ok: false;
    };

export type ListOvertimeCandidatesInput = {
  limit?: number | null;
  organizationId: string;
  periodEndDate?: string | null;
  periodStartDate?: string | null;
  personProfileId?: string | null;
  status?: OvertimeCandidateStatus | string | null;
};

export type CreateOvertimeCandidateSignalInput = {
  detectionSource?: OvertimeCandidateDetectionSource | string | null;
  organizationId: string;
  periodEndDate: string;
  periodStartDate: string;
  personProfileId: string;
  plannedMinutes: number;
  timezone?: string | null;
  workedMinutes: number;
};

export type SetOvertimeCandidateStatusInput = {
  candidateId: string;
  organizationId: string;
  status: OvertimeCandidateReviewStatus | string;
};

export type AddOvertimeCandidateSourceInput = {
  candidateId: string;
  organizationId: string;
  sourceId?: string | null;
  sourceType: OvertimeCandidateSourceType | string;
};

export type ListOvertimeCandidateSourcesInput = {
  candidateId: string;
  organizationId: string;
};

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
type ValidationResult<T> =
  | {
      ok: true;
      value: T;
    }
  | {
      error: OvertimeCandidateErrorCode;
      ok: false;
    };
type OvertimeCandidateContext = {
  membership: ActiveMembership;
  organization: ActiveOrganization;
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
  gte(column: string, value: unknown): UntypedSelectQuery<T>;
  in(column: string, values: readonly unknown[]): UntypedSelectQuery<T>;
  limit(count: number): UntypedSelectQuery<T>;
  lte(column: string, value: unknown): UntypedSelectQuery<T>;
  maybeSingle(): Promise<QueryResponse<T | null>>;
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
type UntypedOvertimeCandidateClient = {
  from(table: string): UntypedTableBuilder;
  rpc<T>(
    fn: string,
    args?: Record<string, unknown>,
  ): Promise<QueryResponse<T>>;
};

const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 200;
const MAX_TIMEZONE_LENGTH = 80;
const MAX_PERIOD_DAYS = 366;
const MAX_MINUTES_SNAPSHOT = 527040;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function success<T>(data: T): OvertimeCandidateResult<T> {
  return {
    data,
    ok: true,
  };
}

function failure(
  error: OvertimeCandidateErrorCode,
): OvertimeCandidateResult<never> {
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

function invalid(
  error: OvertimeCandidateErrorCode,
): ValidationResult<never> {
  return {
    error,
    ok: false,
  };
}

function getOvertimeCandidateClient(
  supabase: SupabaseServerClient,
): UntypedOvertimeCandidateClient {
  return supabase as unknown as UntypedOvertimeCandidateClient;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeRequiredUuid(
  value: unknown,
  error: OvertimeCandidateErrorCode,
): ValidationResult<string> {
  if (typeof value !== "string") {
    return invalid(error);
  }

  const trimmed = value.trim();

  return isPostgresUuid(trimmed) ? valid(trimmed) : invalid(error);
}

function normalizeOptionalUuid(
  value: unknown,
  error: OvertimeCandidateErrorCode,
): ValidationResult<string | null> {
  if (value === undefined || value === null || value === "") {
    return valid(null);
  }

  return normalizeRequiredUuid(value, error);
}

function parseDateInput(
  value: unknown,
  error: OvertimeCandidateErrorCode = "invalid-period",
): ValidationResult<string> {
  if (typeof value !== "string" || !DATE_PATTERN.test(value.trim())) {
    return invalid(error);
  }

  const [year, month, day] = value.trim().split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return invalid(error);
  }

  return valid(value.trim());
}

function daysBetween(startDate: string, endDate: string) {
  const start = Date.parse(`${startDate}T00:00:00.000Z`);
  const end = Date.parse(`${endDate}T00:00:00.000Z`);

  return Math.round((end - start) / (24 * 60 * 60 * 1000)) + 1;
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

function normalizeTimezone(
  value: unknown,
): ValidationResult<string | null> {
  if (value === undefined || value === null || value === "") {
    return valid(null);
  }

  if (typeof value !== "string") {
    return invalid("invalid-timezone");
  }

  const trimmed = value.trim();

  return trimmed && trimmed.length <= MAX_TIMEZONE_LENGTH
    ? valid(trimmed)
    : invalid("invalid-timezone");
}

function normalizeMinutes(value: unknown): ValidationResult<number> {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > MAX_MINUTES_SNAPSHOT
  ) {
    return invalid("invalid-minutes");
  }

  return valid(value);
}

function isOvertimeCandidateStatus(
  value: unknown,
): value is OvertimeCandidateStatus {
  return OVERTIME_CANDIDATE_STATUSES.includes(
    value as OvertimeCandidateStatus,
  );
}

function isOvertimeCandidateReviewStatus(
  value: unknown,
): value is OvertimeCandidateReviewStatus {
  return OVERTIME_CANDIDATE_REVIEW_STATUSES.includes(
    value as OvertimeCandidateReviewStatus,
  );
}

function isOvertimeCandidateDetectionSource(
  value: unknown,
): value is OvertimeCandidateDetectionSource {
  return OVERTIME_CANDIDATE_DETECTION_SOURCES.includes(
    value as OvertimeCandidateDetectionSource,
  );
}

function isOvertimeCandidateSourceType(
  value: unknown,
): value is OvertimeCandidateSourceType {
  return OVERTIME_CANDIDATE_SOURCE_TYPES.includes(
    value as OvertimeCandidateSourceType,
  );
}

function normalizeOptionalStatus(
  value: unknown,
): ValidationResult<OvertimeCandidateStatus | null> {
  if (value === undefined || value === null || value === "") {
    return valid(null);
  }

  if (typeof value !== "string") {
    return invalid("invalid-status");
  }

  const normalized = value.trim().toLowerCase();

  return isOvertimeCandidateStatus(normalized)
    ? valid(normalized)
    : invalid("invalid-status");
}

function normalizeReviewStatus(
  value: unknown,
): ValidationResult<OvertimeCandidateReviewStatus> {
  if (typeof value !== "string") {
    return invalid("invalid-status");
  }

  const normalized = value.trim().toLowerCase();

  return isOvertimeCandidateReviewStatus(normalized)
    ? valid(normalized)
    : invalid("invalid-status");
}

function normalizeDetectionSource(
  value: unknown,
): ValidationResult<OvertimeCandidateDetectionSource> {
  if (value === undefined || value === null || value === "") {
    return valid("manual_signal");
  }

  if (typeof value !== "string") {
    return invalid("invalid-detection-source");
  }

  const normalized = value.trim().toLowerCase();

  return isOvertimeCandidateDetectionSource(normalized)
    ? valid(normalized)
    : invalid("invalid-detection-source");
}

function normalizeSourceType(
  value: unknown,
): ValidationResult<OvertimeCandidateSourceType> {
  if (typeof value !== "string") {
    return invalid("invalid-source-type");
  }

  const normalized = value.trim().toLowerCase();

  return isOvertimeCandidateSourceType(normalized)
    ? valid(normalized)
    : invalid("invalid-source-type");
}

function mapResolutionReason(
  reason: "no_active_memberships" | "organization_not_found" | "organization_required",
): OvertimeCandidateErrorCode {
  if (reason === "no_active_memberships") {
    return "no-active-memberships";
  }

  if (reason === "organization_not_found") {
    return "organization-not-found";
  }

  return "organization-required";
}

export function mapOvertimeCandidateDatabaseError(
  error: DatabaseErrorLike,
  fallback: OvertimeCandidateErrorCode = "save-failed",
): OvertimeCandidateErrorCode {
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

  if (message.includes("active membership")) {
    return "forbidden";
  }

  if (message.includes("person")) {
    return "invalid-person-profile";
  }

  if (message.includes("timezone")) {
    return "invalid-timezone";
  }

  if (message.includes("period")) {
    return "invalid-period";
  }

  if (message.includes("minute")) {
    return "invalid-minutes";
  }

  if (message.includes("source type")) {
    return "invalid-source-type";
  }

  if (message.includes("source")) {
    return "invalid-source";
  }

  if (message.includes("status")) {
    return "invalid-status";
  }

  if (
    message.includes("closed overtime candidates") ||
    message.includes("cannot be changed")
  ) {
    return "not-actionable";
  }

  if (
    message.includes("not found") ||
    message.includes("was not found in tenant")
  ) {
    return "not-found";
  }

  return fallback;
}

async function resolveOvertimeCandidateContext({
  organizationId,
  requireReview = false,
}: {
  organizationId: unknown;
  requireReview?: boolean;
}): Promise<OvertimeCandidateResult<OvertimeCandidateContext>> {
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

  if (!canReadOvertimeCandidates(resolution.membership.role)) {
    return failure("forbidden");
  }

  if (
    requireReview &&
    !canReviewOvertimeCandidates(resolution.membership.role)
  ) {
    return failure("forbidden");
  }

  const supabase = await createClient();

  return success({
    membership: resolution.membership,
    organization: resolution.organization,
    supabase,
    userId: user.id,
  });
}

function validateListInput(
  input: ListOvertimeCandidatesInput,
): ValidationResult<{
  limit: number;
  organizationId: string;
  periodEndDate: string | null;
  periodStartDate: string | null;
  personProfileId: string | null;
  status: OvertimeCandidateStatus | null;
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

  const personProfileId = normalizeOptionalUuid(
    input.personProfileId,
    "invalid-person-profile",
  );

  if (!personProfileId.ok) {
    return personProfileId;
  }

  const status = normalizeOptionalStatus(input.status);

  if (!status.ok) {
    return status;
  }

  const periodStartDate =
    input.periodStartDate === undefined ||
    input.periodStartDate === null ||
    input.periodStartDate === ""
      ? valid(null)
      : parseDateInput(input.periodStartDate);

  if (!periodStartDate.ok) {
    return periodStartDate;
  }

  const periodEndDate =
    input.periodEndDate === undefined ||
    input.periodEndDate === null ||
    input.periodEndDate === ""
      ? valid(null)
      : parseDateInput(input.periodEndDate);

  if (!periodEndDate.ok) {
    return periodEndDate;
  }

  if (
    periodStartDate.value &&
    periodEndDate.value &&
    periodStartDate.value > periodEndDate.value
  ) {
    return invalid("date-range-invalid");
  }

  const limit = normalizeLimit(input.limit);

  if (!limit.ok) {
    return limit;
  }

  return valid({
    limit: limit.value,
    organizationId: organizationId.value,
    periodEndDate: periodEndDate.value,
    periodStartDate: periodStartDate.value,
    personProfileId: personProfileId.value,
    status: status.value,
  });
}

function validateCreateInput(
  input: CreateOvertimeCandidateSignalInput,
): ValidationResult<{
  detectionSource: OvertimeCandidateDetectionSource;
  organizationId: string;
  periodEndDate: string;
  periodStartDate: string;
  personProfileId: string;
  plannedMinutes: number;
  timezone: string | null;
  workedMinutes: number;
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

  const personProfileId = normalizeRequiredUuid(
    input.personProfileId,
    "invalid-person-profile",
  );

  if (!personProfileId.ok) {
    return personProfileId;
  }

  const periodStartDate = parseDateInput(input.periodStartDate);

  if (!periodStartDate.ok) {
    return periodStartDate;
  }

  const periodEndDate = parseDateInput(input.periodEndDate);

  if (!periodEndDate.ok) {
    return periodEndDate;
  }

  const periodDays = daysBetween(periodStartDate.value, periodEndDate.value);

  if (periodDays < 1 || periodDays > MAX_PERIOD_DAYS) {
    return invalid("date-range-invalid");
  }

  const plannedMinutes = normalizeMinutes(input.plannedMinutes);

  if (!plannedMinutes.ok) {
    return plannedMinutes;
  }

  const workedMinutes = normalizeMinutes(input.workedMinutes);

  if (!workedMinutes.ok) {
    return workedMinutes;
  }

  if (workedMinutes.value <= plannedMinutes.value) {
    return invalid("invalid-minutes");
  }

  const detectionSource = normalizeDetectionSource(input.detectionSource);

  if (!detectionSource.ok) {
    return detectionSource;
  }

  const timezone = normalizeTimezone(input.timezone);

  if (!timezone.ok) {
    return timezone;
  }

  return valid({
    detectionSource: detectionSource.value,
    organizationId: organizationId.value,
    periodEndDate: periodEndDate.value,
    periodStartDate: periodStartDate.value,
    personProfileId: personProfileId.value,
    plannedMinutes: plannedMinutes.value,
    timezone: timezone.value,
    workedMinutes: workedMinutes.value,
  });
}

function validateStatusInput(
  input: SetOvertimeCandidateStatusInput,
): ValidationResult<{
  candidateId: string;
  organizationId: string;
  status: OvertimeCandidateReviewStatus;
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

  const candidateId = normalizeRequiredUuid(
    input.candidateId,
    "invalid-candidate",
  );

  if (!candidateId.ok) {
    return candidateId;
  }

  const status = normalizeReviewStatus(input.status);

  if (!status.ok) {
    return status;
  }

  return valid({
    candidateId: candidateId.value,
    organizationId: organizationId.value,
    status: status.value,
  });
}

function validateSourceInput(
  input: AddOvertimeCandidateSourceInput,
): ValidationResult<{
  candidateId: string;
  organizationId: string;
  sourceId: string | null;
  sourceType: OvertimeCandidateSourceType;
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

  const candidateId = normalizeRequiredUuid(
    input.candidateId,
    "invalid-candidate",
  );

  if (!candidateId.ok) {
    return candidateId;
  }

  const sourceType = normalizeSourceType(input.sourceType);

  if (!sourceType.ok) {
    return sourceType;
  }

  const sourceId = normalizeOptionalUuid(input.sourceId, "invalid-source");

  if (!sourceId.ok) {
    return sourceId;
  }

  if (
    (sourceType.value === "manual_context" && sourceId.value !== null) ||
    (sourceType.value !== "manual_context" && sourceId.value === null)
  ) {
    return invalid("invalid-source");
  }

  return valid({
    candidateId: candidateId.value,
    organizationId: organizationId.value,
    sourceId: sourceId.value,
    sourceType: sourceType.value,
  });
}

function validateSourcesListInput(
  input: ListOvertimeCandidateSourcesInput,
): ValidationResult<{
  candidateId: string;
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

  const candidateId = normalizeRequiredUuid(
    input.candidateId,
    "invalid-candidate",
  );

  if (!candidateId.ok) {
    return candidateId;
  }

  return valid({
    candidateId: candidateId.value,
    organizationId: organizationId.value,
  });
}

async function findReadableCandidate({
  candidateId,
  context,
}: {
  candidateId: string;
  context: OvertimeCandidateContext;
}): Promise<OvertimeCandidateResult<OvertimeCandidateRow>> {
  const db = getOvertimeCandidateClient(context.supabase);
  const { data, error } = await db
    .from("overtime_candidates")
    .select<OvertimeCandidateRow>("*")
    .eq("id", candidateId)
    .eq("organization_id", context.organization.id)
    .maybeSingle();

  if (error) {
    return failure(mapOvertimeCandidateDatabaseError(error, "load-failed"));
  }

  if (!data) {
    return failure("not-found");
  }

  return success(data);
}

async function validateSubjectPerson({
  context,
  personProfileId,
}: {
  context: OvertimeCandidateContext;
  personProfileId: string;
}): Promise<OvertimeCandidateErrorCode | null> {
  const { data, error } = await context.supabase
    .from("person_profiles")
    .select("id, status, visibility_status")
    .eq("id", personProfileId)
    .eq("organization_id", context.organization.id)
    .maybeSingle();

  if (error) {
    return "load-failed";
  }

  if (!data) {
    return "invalid-person-profile";
  }

  if (data.status !== "active" || data.visibility_status !== "visible") {
    return "forbidden";
  }

  return null;
}

export async function listOvertimeCandidates(
  input: ListOvertimeCandidatesInput,
): Promise<OvertimeCandidateResult<OvertimeCandidateRow[]>> {
  const validation = validateListInput(input);

  if (!validation.ok) {
    return failure(validation.error);
  }

  const context = await resolveOvertimeCandidateContext({
    organizationId: validation.value.organizationId,
  });

  if (!context.ok) {
    return context;
  }

  const db = getOvertimeCandidateClient(context.data.supabase);
  const { data, error } = await db.rpc<OvertimeCandidateRow[]>(
    "list_overtime_candidates",
    {
      target_limit: validation.value.limit,
      target_organization_id: context.data.organization.id,
      target_period_end_date: validation.value.periodEndDate,
      target_period_start_date: validation.value.periodStartDate,
      target_person_profile_id: validation.value.personProfileId,
      target_status: validation.value.status,
    },
  );

  if (error) {
    return failure(mapOvertimeCandidateDatabaseError(error, "load-failed"));
  }

  return success(data ?? []);
}

export async function createOvertimeCandidateSignal(
  input: CreateOvertimeCandidateSignalInput,
): Promise<OvertimeCandidateResult<OvertimeCandidateRow>> {
  const validation = validateCreateInput(input);

  if (!validation.ok) {
    return failure(validation.error);
  }

  const context = await resolveOvertimeCandidateContext({
    organizationId: validation.value.organizationId,
    requireReview: true,
  });

  if (!context.ok) {
    return context;
  }

  const subjectError = await validateSubjectPerson({
    context: context.data,
    personProfileId: validation.value.personProfileId,
  });

  if (subjectError) {
    return failure(subjectError);
  }

  const db = getOvertimeCandidateClient(context.data.supabase);
  const { data, error } = await db.rpc<OvertimeCandidateRow>(
    "create_overtime_candidate_signal",
    {
      target_detection_source: validation.value.detectionSource,
      target_organization_id: context.data.organization.id,
      target_period_end_date: validation.value.periodEndDate,
      target_period_start_date: validation.value.periodStartDate,
      target_person_profile_id: validation.value.personProfileId,
      target_planned_minutes: validation.value.plannedMinutes,
      target_timezone: validation.value.timezone,
      target_worked_minutes: validation.value.workedMinutes,
    },
  );

  if (error || !data) {
    return failure(mapOvertimeCandidateDatabaseError(error ?? {}, "save-failed"));
  }

  return success(data);
}

export async function setOvertimeCandidateStatus(
  input: SetOvertimeCandidateStatusInput,
): Promise<OvertimeCandidateResult<OvertimeCandidateRow>> {
  const validation = validateStatusInput(input);

  if (!validation.ok) {
    return failure(validation.error);
  }

  const context = await resolveOvertimeCandidateContext({
    organizationId: validation.value.organizationId,
    requireReview: true,
  });

  if (!context.ok) {
    return context;
  }

  const currentCandidate = await findReadableCandidate({
    candidateId: validation.value.candidateId,
    context: context.data,
  });

  if (!currentCandidate.ok) {
    return currentCandidate;
  }

  if (
    currentCandidate.data.status === "closed" ||
    currentCandidate.data.status === "superseded"
  ) {
    return failure("not-actionable");
  }

  const db = getOvertimeCandidateClient(context.data.supabase);
  const { data, error } = await db.rpc<OvertimeCandidateRow>(
    "set_overtime_candidate_status",
    {
      target_overtime_candidate_id: validation.value.candidateId,
      target_organization_id: context.data.organization.id,
      target_status: validation.value.status,
    },
  );

  if (error || !data) {
    return failure(mapOvertimeCandidateDatabaseError(error ?? {}, "save-failed"));
  }

  return success(data);
}

export async function addOvertimeCandidateSource(
  input: AddOvertimeCandidateSourceInput,
): Promise<OvertimeCandidateResult<OvertimeCandidateSourceRow>> {
  const validation = validateSourceInput(input);

  if (!validation.ok) {
    return failure(validation.error);
  }

  const context = await resolveOvertimeCandidateContext({
    organizationId: validation.value.organizationId,
    requireReview: true,
  });

  if (!context.ok) {
    return context;
  }

  const currentCandidate = await findReadableCandidate({
    candidateId: validation.value.candidateId,
    context: context.data,
  });

  if (!currentCandidate.ok) {
    return currentCandidate;
  }

  if (
    currentCandidate.data.status === "closed" ||
    currentCandidate.data.status === "superseded"
  ) {
    return failure("not-actionable");
  }

  const db = getOvertimeCandidateClient(context.data.supabase);
  const { data, error } = await db.rpc<OvertimeCandidateSourceRow>(
    "add_overtime_candidate_source",
    {
      target_organization_id: context.data.organization.id,
      target_overtime_candidate_id: validation.value.candidateId,
      target_source_id: validation.value.sourceId,
      target_source_type: validation.value.sourceType,
    },
  );

  if (error || !data) {
    return failure(mapOvertimeCandidateDatabaseError(error ?? {}, "save-failed"));
  }

  return success(data);
}

export async function listOvertimeCandidateSources(
  input: ListOvertimeCandidateSourcesInput,
): Promise<OvertimeCandidateResult<OvertimeCandidateSourceRow[]>> {
  const validation = validateSourcesListInput(input);

  if (!validation.ok) {
    return failure(validation.error);
  }

  const context = await resolveOvertimeCandidateContext({
    organizationId: validation.value.organizationId,
  });

  if (!context.ok) {
    return context;
  }

  const currentCandidate = await findReadableCandidate({
    candidateId: validation.value.candidateId,
    context: context.data,
  });

  if (!currentCandidate.ok) {
    return currentCandidate;
  }

  const db = getOvertimeCandidateClient(context.data.supabase);
  const { data, error } = await db
    .from("overtime_candidate_sources")
    .select<OvertimeCandidateSourceRow>("*")
    .eq("organization_id", context.data.organization.id)
    .eq("overtime_candidate_id", validation.value.candidateId)
    .order("created_at", { ascending: true });

  if (error) {
    return failure(mapOvertimeCandidateDatabaseError(error, "load-failed"));
  }

  return success(data ?? []);
}
