import { canReviewTimeTracking, canUsePersonalFeatures } from "@/lib/auth/permissions";
import {
  resolveOrganizationTimeTrackingSettings,
} from "@/lib/organizations";
import {
  getActiveMemberships,
  getAuthenticatedUser,
  resolveActiveOrganization,
  type ActiveMembership,
  type ActiveOrganization,
} from "@/lib/auth/tenant";
import { createClient } from "@/lib/supabase/server";
import { isPostgresUuid } from "@/lib/uuid";
import type { Json, Tables, TablesInsert, TablesUpdate } from "@/types/supabase";

export const TIME_PUNCH_TYPES = ["clock_in", "clock_out"] as const;
export const TIME_RECORD_STATUSES = [
  "open",
  "submitted",
  "approved",
  "reopened",
  "voided",
] as const;
export const TIME_PUNCH_STATUSES = ["active", "superseded", "voided"] as const;
export const TIME_PUNCH_SOURCES = [
  "manual",
  "correction",
  "schedule_auto",
] as const;
export const TIME_CORRECTION_TYPES = [
  "record_update",
  "punch_add",
  "punch_update",
  "punch_void",
] as const;
export const TIME_CORRECTION_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "cancelled",
  "applied",
] as const;
export const TIME_CORRECTION_REVIEW_DECISIONS = [
  "approved",
  "rejected",
] as const;
export const TIME_WEEKLY_APPROVAL_STATUSES = [
  "open",
  "pending",
  "submitted",
  "approved",
  "rejected",
  "correction_required",
  "resubmitted",
  "reopened",
  "voided",
] as const;
export const TIME_WEEKLY_APPROVAL_REJECTION_STATUSES = [
  "rejected",
  "correction_required",
] as const;

export type TimePunchType = (typeof TIME_PUNCH_TYPES)[number];
export type TimeRecordStatus = (typeof TIME_RECORD_STATUSES)[number];
export type TimePunchStatus = (typeof TIME_PUNCH_STATUSES)[number];
export type TimePunchSource = (typeof TIME_PUNCH_SOURCES)[number];
export type TimeCorrectionType = (typeof TIME_CORRECTION_TYPES)[number];
export type TimeCorrectionStatus = (typeof TIME_CORRECTION_STATUSES)[number];
export type TimeCorrectionReviewDecision =
  (typeof TIME_CORRECTION_REVIEW_DECISIONS)[number];
export type TimeWeeklyApprovalStatus =
  (typeof TIME_WEEKLY_APPROVAL_STATUSES)[number];
export type TimeWeeklyApprovalRejectionStatus =
  (typeof TIME_WEEKLY_APPROVAL_REJECTION_STATUSES)[number];

export type TimeRecordRow = Tables<"time_records">;
export type TimePunchRow = Tables<"time_punches">;
export type TimeRecordCorrectionRow = Tables<"time_record_corrections">;
export type TimeWeeklyApprovalRow = Tables<"time_weekly_approvals">;
export type TimeExportRow = Tables<"time_exports">;
type ScheduleBlockRow = Tables<"schedule_blocks">;

export type ScheduleAutoTimePunchGenerationRow = {
  clock_in_punch_id: string | null;
  clock_out_punch_id: string | null;
  inserted_clock_in: boolean | null;
  inserted_clock_out: boolean | null;
  schedule_block_assignment_id: string | null;
  skipped_reason: string | null;
  time_record_id: string | null;
};

export type TimeTrackingErrorCode =
  | "authentication_required"
  | "apply_failed"
  | "approval_required"
  | "date_range_invalid"
  | "export_failed"
  | "forbidden"
  | "invalid_center"
  | "invalid_correction"
  | "invalid_correction_decision"
  | "invalid_correction_status"
  | "invalid_correction_type"
  | "invalid_date"
  | "invalid_input"
  | "invalid_limit"
  | "invalid_metadata"
  | "invalid_notes"
  | "invalid_organization"
  | "invalid_person_profile"
  | "invalid_punch_type"
  | "invalid_reason"
  | "invalid_schedule_block"
  | "invalid_schedule_block_assignment"
  | "invalid_schedule_context"
  | "invalid_snapshot"
  | "invalid_time_punch"
  | "invalid_time_punch_status"
  | "invalid_time_record"
  | "invalid_time_record_status"
  | "invalid_timestamp"
  | "invalid_weekly_approval"
  | "invalid_weekly_approval_rejection_status"
  | "invalid_weekly_approval_status"
  | "load_failed"
  | "no_active_memberships"
  | "organization_not_found"
  | "organization_required"
  | "profile_missing"
  | "reopen_failed"
  | "review_failed"
  | "signature_required"
  | "schedule_auto_disabled"
  | "schedule_auto_failed"
  | "save_failed"
  | "submission_failed"
  | "time_punch_failed";

export type TimeTrackingResult<T> =
  | {
      data: T;
      ok: true;
    }
  | {
      error: TimeTrackingErrorCode;
      ok: false;
    };

export type CreateOwnTimePunchInput = {
  centerId?: string | null;
  localWorkDate?: string | null;
  metadata?: Json;
  notes?: string | null;
  occurredAt: Date | string;
  organizationId: string;
  punchType: TimePunchType | string;
  scheduleBlockAssignmentId?: string | null;
  scheduleBlockId?: string | null;
};

export type OwnTimeRecordsQuery = {
  dateFrom?: string | null;
  dateTo?: string | null;
  limit?: number | null;
  organizationId: string;
  status?: TimeRecordStatus | string | null;
};

export type OwnTimePunchesQuery = {
  limit?: number | null;
  occurredFrom?: Date | string | null;
  occurredTo?: Date | string | null;
  organizationId: string;
  status?: TimePunchStatus | string | null;
  timeRecordId?: string | null;
};

export type OwnTimeCorrectionsQuery = {
  limit?: number | null;
  organizationId: string;
  status?: TimeCorrectionStatus | string | null;
};

export type OwnTimeWeeklyApprovalsQuery = {
  limit?: number | null;
  organizationId: string;
  status?: TimeWeeklyApprovalStatus | string | null;
  statuses?: readonly (TimeWeeklyApprovalStatus | string)[] | null;
  weekStartFrom?: string | null;
  weekStartTo?: string | null;
};

export type OwnTimeWeekOverviewQuery = {
  organizationId: string;
  weekStart: string;
};

export type GenerateScheduleAutoTimePunchesInput = {
  dateFrom: string;
  dateTo: string;
  organizationId: string;
  personProfileId?: string | null;
};

export type TimeWeekDayStatus =
  | "correct"
  | "empty"
  | "excess"
  | "missing"
  | "open"
  | "unassigned_worked";

export type TimeWeekDayOverview = {
  assignedBlockCount: number;
  assignedMinutes: number;
  balanceMinutes: number;
  date: string;
  hasOpenPunch: boolean;
  punchCount: number;
  punchIds: string[];
  recordIds: string[];
  status: TimeWeekDayStatus;
  workedMinutes: number;
};

export type OwnTimeWeekOverview = {
  activeCoachProfileCount: number;
  assignedBlockCount: number;
  days: TimeWeekDayOverview[];
  punches: TimePunchRow[];
  records: TimeRecordRow[];
  totals: {
    assignedMinutes: number;
    balanceMinutes: number;
    status: TimeWeekDayStatus;
    warningCount: number;
    weeklyContractedMinutes: number | null;
    workedMinutes: number;
  };
  weekEnd: string;
  weekStart: string;
};

export type ReviewTimeRecordsQuery = OwnTimeRecordsQuery & {
  centerId?: string | null;
  personProfileId?: string | null;
};

export type ReviewTimePunchesQuery = Omit<OwnTimePunchesQuery, "timeRecordId"> & {
  centerId?: string | null;
  personProfileId?: string | null;
  timeRecordId?: string | null;
};

export type ReviewTimeCorrectionsQuery = OwnTimeCorrectionsQuery & {
  personProfileId?: string | null;
};

export type ReviewTimeWeeklyApprovalsQuery = OwnTimeWeeklyApprovalsQuery & {
  personProfileId?: string | null;
};

export type RequestOwnTimeCorrectionInput = {
  afterSnapshot: Json;
  beforeSnapshot?: Json;
  correctionType?: TimeCorrectionType | string;
  metadata?: Json;
  organizationId: string;
  reason: string;
  timePunchId?: string | null;
  timeRecordId: string;
};

export type ReviewTimeCorrectionInput = {
  correctionId: string;
  decision: TimeCorrectionReviewDecision | string;
  organizationId: string;
  reviewNote?: string | null;
};

export type ApplyTimeCorrectionInput = {
  correctionId: string;
  organizationId: string;
};

export type CreateAndApplyOwnTimeCorrectionInput = RequestOwnTimeCorrectionInput;

export type SubmitTimeWeeklyApprovalInput = {
  organizationId: string;
  personProfileId: string;
  submissionSource?: "manual" | "resubmission";
  weekStart: string;
};

export type ApproveTimeWeeklyApprovalInput = {
  approvalNote?: string | null;
  organizationId: string;
  weeklyApprovalId: string;
};

export type RejectTimeWeeklyApprovalInput = {
  organizationId: string;
  rejectionNote: string;
  rejectionStatus?: TimeWeeklyApprovalRejectionStatus | string;
  weeklyApprovalId: string;
};

export type ReopenTimeWeeklyApprovalInput = {
  organizationId: string;
  reopenReason: string;
  weeklyApprovalId: string;
};

export type TimeRecordsCsvExportInput = {
  dateFrom: string;
  dateTo: string;
  organizationId: string;
  personProfileId?: string | null;
};

export type TimeRecordsCsvExportData = {
  csv: string;
  dateFrom: string;
  dateTo: string;
  exportId: string;
  filename: string;
  rowCount: number;
};

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
type JsonObject = { [key: string]: Json | undefined };
type ValidationResult<T> =
  | {
      ok: true;
      value: T;
    }
  | {
      error: TimeTrackingErrorCode;
      ok: false;
    };

type TimeTrackingContext = {
  membership: ActiveMembership;
  organization: ActiveOrganization;
  ownPersonProfileId?: string;
  supabase: SupabaseServerClient;
  userId: string;
};

const ISO_TIMESTAMP_WITH_OFFSET_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:\d{2})$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_LIST_LIMIT = 200;
const DEFAULT_LIST_LIMIT = 50;
const MAX_TIME_EXPORT_RANGE_DAYS = 93;
const MAX_TIME_EXPORT_ROWS = 1000;
const TIME_EXPORT_BATCH_SIZE = 100;
const TIME_RECORDS_CSV_EXPORT_SCHEMA_VERSION = "boxops.time-export.csv.v1";
const MAX_NOTES_LENGTH = 1000;
const MAX_REASON_LENGTH = 2000;
const MAX_REVIEW_NOTE_LENGTH = 2000;
const MAX_METADATA_JSON_LENGTH = 2000;
const MAX_SNAPSHOT_JSON_LENGTH = 4000;
const FORBIDDEN_JSON_KEY_PATTERN =
  /(content|body|html|raw|base64|url|uri|path|token|secret|signature|storage|document_hash|latitude|longitude|coordinate|geolocation|gps)/i;

function success<T>(data: T): TimeTrackingResult<T> {
  return {
    data,
    ok: true,
  };
}

function failure(error: TimeTrackingErrorCode): TimeTrackingResult<never> {
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

function invalid(error: TimeTrackingErrorCode): ValidationResult<never> {
  return {
    error,
    ok: false,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isPlainObject(value: unknown): value is JsonObject {
  if (!isRecord(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
}

function hasForbiddenJsonKey(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => hasForbiddenJsonKey(item));
  }

  if (!isPlainObject(value)) {
    return false;
  }

  return Object.entries(value).some(([key, nestedValue]) => {
    return FORBIDDEN_JSON_KEY_PATTERN.test(key) || hasForbiddenJsonKey(nestedValue);
  });
}

function normalizeRequiredUuid(
  value: unknown,
  error: TimeTrackingErrorCode,
): ValidationResult<string> {
  if (typeof value !== "string") {
    return invalid(error);
  }

  const trimmed = value.trim();

  return isPostgresUuid(trimmed) ? valid(trimmed) : invalid(error);
}

function normalizeOptionalUuid(
  value: unknown,
  error: TimeTrackingErrorCode,
): ValidationResult<string | null> {
  if (value === undefined || value === null || value === "") {
    return valid(null);
  }

  return normalizeRequiredUuid(value, error);
}

function parseDateInput(value: string) {
  if (!DATE_PATTERN.test(value)) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return value;
}

function normalizeOptionalDate(value: unknown): ValidationResult<string | null> {
  if (value === undefined || value === null || value === "") {
    return valid(null);
  }

  if (typeof value !== "string") {
    return invalid("invalid_date");
  }

  const parsed = parseDateInput(value.trim());

  return parsed ? valid(parsed) : invalid("invalid_date");
}

function normalizeRequiredTimestamp(value: unknown): ValidationResult<string> {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? invalid("invalid_timestamp")
      : valid(value.toISOString());
  }

  if (typeof value !== "string") {
    return invalid("invalid_timestamp");
  }

  const trimmed = value.trim();

  if (!ISO_TIMESTAMP_WITH_OFFSET_PATTERN.test(trimmed)) {
    return invalid("invalid_timestamp");
  }

  const parsed = new Date(trimmed);

  return Number.isNaN(parsed.getTime())
    ? invalid("invalid_timestamp")
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

function normalizeOptionalText({
  error,
  maxLength,
  value,
}: {
  error: TimeTrackingErrorCode;
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

function normalizeRequiredText({
  error,
  maxLength,
  value,
}: {
  error: TimeTrackingErrorCode;
  maxLength: number;
  value: unknown;
}): ValidationResult<string> {
  if (typeof value !== "string") {
    return invalid(error);
  }

  const trimmed = value.trim();

  if (!trimmed || trimmed.length > maxLength) {
    return invalid(error);
  }

  return valid(trimmed);
}

function normalizeJsonObject({
  defaultValue,
  error,
  maxLength,
  required = false,
  value,
}: {
  defaultValue?: JsonObject;
  error: TimeTrackingErrorCode;
  maxLength: number;
  required?: boolean;
  value: unknown;
}): ValidationResult<JsonObject> {
  if (value === undefined || value === null) {
    return required ? invalid(error) : valid(defaultValue ?? {});
  }

  if (!isPlainObject(value) || hasForbiddenJsonKey(value)) {
    return invalid(error);
  }

  const serialized = JSON.stringify(value);

  if (!serialized || serialized.length > maxLength) {
    return invalid(error);
  }

  return valid(value);
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
    return invalid("invalid_limit");
  }

  return valid(value);
}

function normalizeDateRange(input: {
  dateFrom?: unknown;
  dateTo?: unknown;
}): ValidationResult<{ dateFrom: string | null; dateTo: string | null }> {
  const dateFrom = normalizeOptionalDate(input.dateFrom);

  if (!dateFrom.ok) {
    return dateFrom;
  }

  const dateTo = normalizeOptionalDate(input.dateTo);

  if (!dateTo.ok) {
    return dateTo;
  }

  if (dateFrom.value && dateTo.value && dateFrom.value > dateTo.value) {
    return invalid("date_range_invalid");
  }

  return valid({
    dateFrom: dateFrom.value,
    dateTo: dateTo.value,
  });
}

function normalizeRequiredDate(
  value: unknown,
  error: TimeTrackingErrorCode,
): ValidationResult<string> {
  if (typeof value !== "string") {
    return invalid(error);
  }

  const parsed = parseDateInput(value.trim());

  return parsed ? valid(parsed) : invalid(error);
}

function addDaysToDateString(dateString: string, days: number) {
  const parsed = parseDateInput(dateString);

  if (!parsed) {
    return null;
  }

  const [year, month, day] = parsed.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));

  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function getDateRangeDayCount(dateFrom: string, dateTo: string) {
  const from = parseDateInput(dateFrom);
  const to = parseDateInput(dateTo);

  if (!from || !to) {
    return 0;
  }

  const [fromYear, fromMonth, fromDay] = from.split("-").map(Number);
  const [toYear, toMonth, toDay] = to.split("-").map(Number);
  const fromDate = new Date(Date.UTC(fromYear, fromMonth - 1, fromDay));
  const toDate = new Date(Date.UTC(toYear, toMonth - 1, toDay));

  return Math.floor((toDate.getTime() - fromDate.getTime()) / 86_400_000) + 1;
}

function getWeekStartDateString(dateString: string) {
  const parsed = parseDateInput(dateString);

  if (!parsed) {
    return null;
  }

  const [year, month, day] = parsed.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const dayIndex = (date.getUTCDay() + 6) % 7;

  date.setUTCDate(date.getUTCDate() - dayIndex);

  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function chunkArray<T>(values: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}

function isMondayDateString(dateString: string) {
  const parsed = parseDateInput(dateString);

  if (!parsed) {
    return false;
  }

  const [year, month, day] = parsed.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return date.getUTCDay() === 1;
}

function timeStringToMinutes(value: string) {
  const [hoursValue, minutesValue] = value.slice(0, 5).split(":");
  const hours = Number(hoursValue);
  const minutes = Number(minutesValue);

  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

  return hours * 60 + minutes;
}

function getScheduleBlockDurationMinutes(
  block: Pick<ScheduleBlockRow, "end_time" | "start_time">,
) {
  const start = timeStringToMinutes(block.start_time);
  const end = timeStringToMinutes(block.end_time);

  if (start === null || end === null) {
    return 0;
  }

  const duration = end > start ? end - start : end + 24 * 60 - start;

  return duration > 0 ? duration : 0;
}

function getWorkedMinutesFromPunches(
  punches: Array<Pick<TimePunchRow, "occurred_at" | "punch_type" | "status">>,
) {
  const activePunches = punches
    .filter((punch) => punch.status === "active")
    .sort((first, second) => first.occurred_at.localeCompare(second.occurred_at));
  let openStartedAt: Date | null = null;
  let workedMinutes = 0;

  for (const punch of activePunches) {
    const occurredAt = new Date(punch.occurred_at);

    if (Number.isNaN(occurredAt.getTime())) {
      continue;
    }

    if (punch.punch_type === "clock_in") {
      openStartedAt = occurredAt;
      continue;
    }

    if (punch.punch_type === "clock_out" && openStartedAt) {
      const diffMinutes = Math.max(
        0,
        Math.round((occurredAt.getTime() - openStartedAt.getTime()) / 60000),
      );

      workedMinutes += diffMinutes;
      openStartedAt = null;
    }
  }

  return {
    hasOpenPunch: Boolean(openStartedAt),
    workedMinutes,
  };
}

function getDateStringInTimeZone(value: string, timezone: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      day: "2-digit",
      month: "2-digit",
      timeZone: timezone,
      year: "numeric",
    }).formatToParts(date);
    const values = new Map(parts.map((part) => [part.type, part.value]));
    const year = values.get("year");
    const month = values.get("month");
    const day = values.get("day");

    return year && month && day ? `${year}-${month}-${day}` : null;
  } catch {
    return null;
  }
}

function formatExportDateTime(value: string, timezone: string) {
  try {
    return new Intl.DateTimeFormat("sv-SE", {
      day: "2-digit",
      hour: "2-digit",
      hour12: false,
      minute: "2-digit",
      month: "2-digit",
      timeZone: timezone,
      year: "numeric",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function escapeCsvValue(value: string | number | null | undefined) {
  const text = value === null || value === undefined ? "" : String(value);

  return `"${text.replaceAll('"', '""')}"`;
}

function buildCsvLine(values: Array<string | number | null | undefined>) {
  return values.map(escapeCsvValue).join(",");
}

function countBy<T extends string>(values: T[]) {
  const counts = new Map<T, number>();

  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([value, count]) => `${value}=${count}`)
    .join("; ");
}

function getTimeWeekDayStatus({
  assignedMinutes,
  hasOpenPunch,
  workedMinutes,
}: {
  assignedMinutes: number;
  hasOpenPunch: boolean;
  workedMinutes: number;
}): TimeWeekDayStatus {
  if (hasOpenPunch) {
    return "open";
  }

  if (assignedMinutes === 0 && workedMinutes === 0) {
    return "empty";
  }

  if (assignedMinutes === 0 && workedMinutes > 0) {
    return "unassigned_worked";
  }

  const balance = workedMinutes - assignedMinutes;

  if (Math.abs(balance) <= 5) {
    return "correct";
  }

  return balance > 0 ? "excess" : "missing";
}

function normalizeTimestampRange(input: {
  occurredFrom?: unknown;
  occurredTo?: unknown;
}): ValidationResult<{ occurredFrom: string | null; occurredTo: string | null }> {
  const occurredFrom = normalizeOptionalTimestamp(input.occurredFrom);

  if (!occurredFrom.ok) {
    return occurredFrom;
  }

  const occurredTo = normalizeOptionalTimestamp(input.occurredTo);

  if (!occurredTo.ok) {
    return occurredTo;
  }

  if (
    occurredFrom.value &&
    occurredTo.value &&
    occurredFrom.value > occurredTo.value
  ) {
    return invalid("date_range_invalid");
  }

  return valid({
    occurredFrom: occurredFrom.value,
    occurredTo: occurredTo.value,
  });
}

function isTimePunchType(value: unknown): value is TimePunchType {
  return TIME_PUNCH_TYPES.includes(value as TimePunchType);
}

function isTimeRecordStatus(value: unknown): value is TimeRecordStatus {
  return TIME_RECORD_STATUSES.includes(value as TimeRecordStatus);
}

function isTimePunchStatus(value: unknown): value is TimePunchStatus {
  return TIME_PUNCH_STATUSES.includes(value as TimePunchStatus);
}

function isTimeCorrectionType(value: unknown): value is TimeCorrectionType {
  return TIME_CORRECTION_TYPES.includes(value as TimeCorrectionType);
}

function isTimeCorrectionStatus(value: unknown): value is TimeCorrectionStatus {
  return TIME_CORRECTION_STATUSES.includes(value as TimeCorrectionStatus);
}

function isTimeCorrectionReviewDecision(
  value: unknown,
): value is TimeCorrectionReviewDecision {
  return TIME_CORRECTION_REVIEW_DECISIONS.includes(
    value as TimeCorrectionReviewDecision,
  );
}

function isTimeWeeklyApprovalStatus(
  value: unknown,
): value is TimeWeeklyApprovalStatus {
  return TIME_WEEKLY_APPROVAL_STATUSES.includes(
    value as TimeWeeklyApprovalStatus,
  );
}

function isTimeWeeklyApprovalRejectionStatus(
  value: unknown,
): value is TimeWeeklyApprovalRejectionStatus {
  return TIME_WEEKLY_APPROVAL_REJECTION_STATUSES.includes(
    value as TimeWeeklyApprovalRejectionStatus,
  );
}

function normalizeOptionalStatus<T extends string>({
  error,
  isAllowed,
  value,
}: {
  error: TimeTrackingErrorCode;
  isAllowed: (candidate: unknown) => candidate is T;
  value: unknown;
}): ValidationResult<T | null> {
  if (value === undefined || value === null || value === "") {
    return valid(null);
  }

  return isAllowed(value) ? valid(value) : invalid(error);
}

function normalizeOptionalStatusList<T extends string>({
  error,
  isAllowed,
  value,
}: {
  error: TimeTrackingErrorCode;
  isAllowed: (candidate: unknown) => candidate is T;
  value: unknown;
}): ValidationResult<T[] | null> {
  if (value === undefined || value === null) {
    return valid(null);
  }

  if (!Array.isArray(value)) {
    return invalid(error);
  }

  const normalized: T[] = [];

  for (const candidate of value) {
    if (!isAllowed(candidate)) {
      return invalid(error);
    }

    if (!normalized.includes(candidate)) {
      normalized.push(candidate);
    }
  }

  return valid(normalized.length > 0 ? normalized : null);
}

async function resolveTimeTrackingContext({
  organizationId,
  requireOwnPersonProfile = false,
  requirePersonalAccess = false,
  requireReviewAccess = false,
}: {
  organizationId: unknown;
  requireOwnPersonProfile?: boolean;
  requirePersonalAccess?: boolean;
  requireReviewAccess?: boolean;
}): Promise<TimeTrackingResult<TimeTrackingContext>> {
  const normalizedOrganizationId = normalizeRequiredUuid(
    organizationId,
    "invalid_organization",
  );

  if (!normalizedOrganizationId.ok) {
    return normalizedOrganizationId;
  }

  const user = await getAuthenticatedUser();

  if (!user) {
    return failure("authentication_required");
  }

  const memberships = await getActiveMemberships(user.id);
  const resolution = resolveActiveOrganization(
    memberships,
    normalizedOrganizationId.value,
  );

  if (!resolution.ok) {
    return failure(resolution.reason);
  }

  if (requirePersonalAccess && !canUsePersonalFeatures(resolution.membership.role)) {
    return failure("forbidden");
  }

  if (requireReviewAccess && !canReviewTimeTracking(resolution.membership.role)) {
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
      return failure("load_failed");
    }

    if (!profile) {
      return failure("profile_missing");
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

async function ensureCenterBelongsToTenant({
  centerId,
  organizationId,
  supabase,
}: {
  centerId: string;
  organizationId: string;
  supabase: SupabaseServerClient;
}) {
  const { data, error } = await supabase
    .from("centers")
    .select("id")
    .eq("id", centerId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  return !error && Boolean(data);
}

async function ensurePersonBelongsToTenant({
  organizationId,
  personProfileId,
  supabase,
}: {
  organizationId: string;
  personProfileId: string;
  supabase: SupabaseServerClient;
}) {
  const { data, error } = await supabase
    .from("person_profiles")
    .select("id")
    .eq("id", personProfileId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  return !error && Boolean(data);
}

async function validateReviewReferenceFilters({
  centerId,
  organizationId,
  personProfileId,
  supabase,
}: {
  centerId?: string | null;
  organizationId: string;
  personProfileId?: string | null;
  supabase: SupabaseServerClient;
}): Promise<TimeTrackingErrorCode | null> {
  if (centerId) {
    const centerExists = await ensureCenterBelongsToTenant({
      centerId,
      organizationId,
      supabase,
    });

    if (!centerExists) {
      return "invalid_center";
    }
  }

  if (personProfileId) {
    const personExists = await ensurePersonBelongsToTenant({
      organizationId,
      personProfileId,
      supabase,
    });

    if (!personExists) {
      return "invalid_person_profile";
    }
  }

  return null;
}

async function validateOwnPunchReferences({
  centerId,
  localWorkDate,
  organizationId,
  ownPersonProfileId,
  scheduleBlockAssignmentId,
  scheduleBlockId,
  supabase,
  userId,
}: {
  centerId: string | null;
  localWorkDate: string | null;
  organizationId: string;
  ownPersonProfileId: string;
  scheduleBlockAssignmentId: string | null;
  scheduleBlockId: string | null;
  supabase: SupabaseServerClient;
  userId: string;
}): Promise<TimeTrackingErrorCode | null> {
  if (centerId) {
    const centerExists = await ensureCenterBelongsToTenant({
      centerId,
      organizationId,
      supabase,
    });

    if (!centerExists) {
      return "invalid_center";
    }
  }

  let linkedScheduleBlockId = scheduleBlockId;

  if (scheduleBlockAssignmentId) {
    const { data: assignment, error: assignmentError } = await supabase
      .from("schedule_block_assignments")
      .select("id, assignment_status, coach_profile_id, schedule_block_id")
      .eq("id", scheduleBlockAssignmentId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (
      assignmentError ||
      !assignment ||
      assignment.assignment_status !== "assigned"
    ) {
      return "invalid_schedule_block_assignment";
    }

    const { data: coachProfile, error: coachError } = await supabase
      .from("coach_profiles")
      .select("id, person_profile_id, status, user_id")
      .eq("id", assignment.coach_profile_id)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (
      coachError ||
      !coachProfile ||
      coachProfile.status !== "active" ||
      (coachProfile.person_profile_id !== ownPersonProfileId &&
        coachProfile.user_id !== userId)
    ) {
      return "invalid_schedule_context";
    }

    if (scheduleBlockId && assignment.schedule_block_id !== scheduleBlockId) {
      return "invalid_schedule_context";
    }

    linkedScheduleBlockId = assignment.schedule_block_id;
  }

  if (linkedScheduleBlockId) {
    const { data: scheduleBlock, error: blockError } = await supabase
      .from("schedule_blocks")
      .select("id, center_id, service_date")
      .eq("id", linkedScheduleBlockId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (blockError || !scheduleBlock) {
      return "invalid_schedule_block";
    }

    if (centerId && scheduleBlock.center_id !== centerId) {
      return "invalid_schedule_context";
    }

    if (localWorkDate && scheduleBlock.service_date !== localWorkDate) {
      return "invalid_date";
    }
  }

  return null;
}

function validateCreateOwnTimePunchInput(
  input: CreateOwnTimePunchInput,
): ValidationResult<{
  centerId: string | null;
  localWorkDate: string | null;
  metadata: JsonObject;
  notes: string | null;
  occurredAt: string;
  organizationId: string;
  punchType: TimePunchType;
  scheduleBlockAssignmentId: string | null;
  scheduleBlockId: string | null;
}> {
  if (!isRecord(input)) {
    return invalid("invalid_input");
  }

  const organizationId = normalizeRequiredUuid(
    input.organizationId,
    "invalid_organization",
  );

  if (!organizationId.ok) {
    return organizationId;
  }

  if (!isTimePunchType(input.punchType)) {
    return invalid("invalid_punch_type");
  }

  const occurredAt = normalizeRequiredTimestamp(input.occurredAt);

  if (!occurredAt.ok) {
    return occurredAt;
  }

  const localWorkDate = normalizeOptionalDate(input.localWorkDate);

  if (!localWorkDate.ok) {
    return localWorkDate;
  }

  const centerId = normalizeOptionalUuid(input.centerId, "invalid_center");

  if (!centerId.ok) {
    return centerId;
  }

  const scheduleBlockId = normalizeOptionalUuid(
    input.scheduleBlockId,
    "invalid_schedule_block",
  );

  if (!scheduleBlockId.ok) {
    return scheduleBlockId;
  }

  const scheduleBlockAssignmentId = normalizeOptionalUuid(
    input.scheduleBlockAssignmentId,
    "invalid_schedule_block_assignment",
  );

  if (!scheduleBlockAssignmentId.ok) {
    return scheduleBlockAssignmentId;
  }

  const notes = normalizeOptionalText({
    error: "invalid_notes",
    maxLength: MAX_NOTES_LENGTH,
    value: input.notes,
  });

  if (!notes.ok) {
    return notes;
  }

  const metadata = normalizeJsonObject({
    error: "invalid_metadata",
    maxLength: MAX_METADATA_JSON_LENGTH,
    value: input.metadata,
  });

  if (!metadata.ok) {
    return metadata;
  }

  return valid({
    centerId: centerId.value,
    localWorkDate: localWorkDate.value,
    metadata: metadata.value,
    notes: notes.value,
    occurredAt: occurredAt.value,
    organizationId: organizationId.value,
    punchType: input.punchType,
    scheduleBlockAssignmentId: scheduleBlockAssignmentId.value,
    scheduleBlockId: scheduleBlockId.value,
  });
}

export async function createOwnTimePunch(
  input: CreateOwnTimePunchInput,
): Promise<TimeTrackingResult<TimePunchRow>> {
  const validation = validateCreateOwnTimePunchInput(input);

  if (!validation.ok) {
    return failure(validation.error);
  }

  const context = await resolveTimeTrackingContext({
    organizationId: validation.value.organizationId,
    requireOwnPersonProfile: true,
    requirePersonalAccess: true,
  });

  if (!context.ok) {
    return context;
  }

  const ownPersonProfileId = context.data.ownPersonProfileId;

  if (!ownPersonProfileId) {
    return failure("profile_missing");
  }

  const referenceError = await validateOwnPunchReferences({
    centerId: validation.value.centerId,
    localWorkDate: validation.value.localWorkDate,
    organizationId: context.data.organization.id,
    ownPersonProfileId,
    scheduleBlockAssignmentId: validation.value.scheduleBlockAssignmentId,
    scheduleBlockId: validation.value.scheduleBlockId,
    supabase: context.data.supabase,
    userId: context.data.userId,
  });

  if (referenceError) {
    return failure(referenceError);
  }

  const { data, error } = await context.data.supabase.rpc(
    "create_own_time_punch",
    {
      punch_metadata: validation.value.metadata,
      punch_notes: validation.value.notes ?? undefined,
      target_center_id: validation.value.centerId ?? undefined,
      target_local_work_date: validation.value.localWorkDate ?? undefined,
      target_occurred_at: validation.value.occurredAt,
      target_organization_id: context.data.organization.id,
      target_punch_type: validation.value.punchType,
      target_schedule_block_assignment_id:
        validation.value.scheduleBlockAssignmentId ?? undefined,
      target_schedule_block_id: validation.value.scheduleBlockId ?? undefined,
    },
  );

  if (error || !data) {
    return failure("time_punch_failed");
  }

  return success(data);
}

function validateGenerateScheduleAutoTimePunchesInput(
  input: GenerateScheduleAutoTimePunchesInput,
): ValidationResult<{
  dateFrom: string;
  dateTo: string;
  organizationId: string;
  personProfileId: string | null;
}> {
  if (!isRecord(input)) {
    return invalid("invalid_input");
  }

  const organizationId = normalizeRequiredUuid(
    input.organizationId,
    "invalid_organization",
  );

  if (!organizationId.ok) {
    return organizationId;
  }

  const dateFrom = normalizeRequiredDate(input.dateFrom, "invalid_date");

  if (!dateFrom.ok) {
    return dateFrom;
  }

  const dateTo = normalizeRequiredDate(input.dateTo, "invalid_date");

  if (!dateTo.ok) {
    return dateTo;
  }

  if (dateFrom.value > dateTo.value) {
    return invalid("date_range_invalid");
  }

  const personProfileId = normalizeOptionalUuid(
    input.personProfileId,
    "invalid_person_profile",
  );

  if (!personProfileId.ok) {
    return personProfileId;
  }

  return valid({
    dateFrom: dateFrom.value,
    dateTo: dateTo.value,
    organizationId: organizationId.value,
    personProfileId: personProfileId.value,
  });
}

export async function generateScheduleAutoTimePunches(
  input: GenerateScheduleAutoTimePunchesInput,
): Promise<TimeTrackingResult<ScheduleAutoTimePunchGenerationRow[]>> {
  const validation = validateGenerateScheduleAutoTimePunchesInput(input);

  if (!validation.ok) {
    return failure(validation.error);
  }

  const context = await resolveTimeTrackingContext({
    organizationId: validation.value.organizationId,
    requireReviewAccess: true,
  });

  if (!context.ok) {
    return context;
  }

  const settings = resolveOrganizationTimeTrackingSettings(
    context.data.organization.time_tracking_config,
  );

  if (!settings.scheduleAutoPunchesEnabled) {
    return failure("schedule_auto_disabled");
  }

  if (validation.value.personProfileId) {
    const personExists = await ensurePersonBelongsToTenant({
      organizationId: context.data.organization.id,
      personProfileId: validation.value.personProfileId,
      supabase: context.data.supabase,
    });

    if (!personExists) {
      return failure("invalid_person_profile");
    }
  }

  const { data, error } = await context.data.supabase.rpc(
    "generate_schedule_auto_time_punches",
    {
      target_date_from: validation.value.dateFrom,
      target_date_to: validation.value.dateTo,
      target_organization_id: context.data.organization.id,
      target_person_profile_id: validation.value.personProfileId ?? undefined,
    },
  );

  if (error || !data) {
    return failure(
      error?.message.includes("not enabled")
        ? "schedule_auto_disabled"
        : "schedule_auto_failed",
    );
  }

  return success(data);
}

function validateOwnRecordsQuery(
  input: OwnTimeRecordsQuery,
): ValidationResult<{
  dateFrom: string | null;
  dateTo: string | null;
  limit: number;
  organizationId: string;
  status: TimeRecordStatus | null;
}> {
  if (!isRecord(input)) {
    return invalid("invalid_input");
  }

  const organizationId = normalizeRequiredUuid(
    input.organizationId,
    "invalid_organization",
  );

  if (!organizationId.ok) {
    return organizationId;
  }

  const range = normalizeDateRange(input);

  if (!range.ok) {
    return range;
  }

  const limit = normalizeLimit(input.limit);

  if (!limit.ok) {
    return limit;
  }

  const status = normalizeOptionalStatus({
    error: "invalid_time_record_status",
    isAllowed: isTimeRecordStatus,
    value: input.status,
  });

  if (!status.ok) {
    return status;
  }

  return valid({
    dateFrom: range.value.dateFrom,
    dateTo: range.value.dateTo,
    limit: limit.value,
    organizationId: organizationId.value,
    status: status.value,
  });
}

export async function listOwnTimeRecords(
  input: OwnTimeRecordsQuery,
): Promise<TimeTrackingResult<TimeRecordRow[]>> {
  const validation = validateOwnRecordsQuery(input);

  if (!validation.ok) {
    return failure(validation.error);
  }

  const context = await resolveTimeTrackingContext({
    organizationId: validation.value.organizationId,
    requireOwnPersonProfile: true,
    requirePersonalAccess: true,
  });

  if (!context.ok) {
    return context;
  }

  let query = context.data.supabase
    .from("time_records")
    .select("*")
    .eq("organization_id", context.data.organization.id)
    .eq("person_profile_id", context.data.ownPersonProfileId ?? "");

  if (validation.value.dateFrom) {
    query = query.gte("local_work_date", validation.value.dateFrom);
  }

  if (validation.value.dateTo) {
    query = query.lte("local_work_date", validation.value.dateTo);
  }

  if (validation.value.status) {
    query = query.eq("status", validation.value.status);
  }

  const { data, error } = await query
    .order("local_work_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(validation.value.limit);

  if (error) {
    return failure("load_failed");
  }

  return success(data ?? []);
}

function validateOwnPunchesQuery(
  input: OwnTimePunchesQuery,
): ValidationResult<{
  limit: number;
  occurredFrom: string | null;
  occurredTo: string | null;
  organizationId: string;
  status: TimePunchStatus | null;
  timeRecordId: string | null;
}> {
  if (!isRecord(input)) {
    return invalid("invalid_input");
  }

  const organizationId = normalizeRequiredUuid(
    input.organizationId,
    "invalid_organization",
  );

  if (!organizationId.ok) {
    return organizationId;
  }

  const timeRecordId = normalizeOptionalUuid(
    input.timeRecordId,
    "invalid_time_record",
  );

  if (!timeRecordId.ok) {
    return timeRecordId;
  }

  const range = normalizeTimestampRange(input);

  if (!range.ok) {
    return range;
  }

  const limit = normalizeLimit(input.limit);

  if (!limit.ok) {
    return limit;
  }

  const status = normalizeOptionalStatus({
    error: "invalid_time_punch_status",
    isAllowed: isTimePunchStatus,
    value: input.status,
  });

  if (!status.ok) {
    return status;
  }

  return valid({
    limit: limit.value,
    occurredFrom: range.value.occurredFrom,
    occurredTo: range.value.occurredTo,
    organizationId: organizationId.value,
    status: status.value,
    timeRecordId: timeRecordId.value,
  });
}

export async function listOwnTimePunches(
  input: OwnTimePunchesQuery,
): Promise<TimeTrackingResult<TimePunchRow[]>> {
  const validation = validateOwnPunchesQuery(input);

  if (!validation.ok) {
    return failure(validation.error);
  }

  const context = await resolveTimeTrackingContext({
    organizationId: validation.value.organizationId,
    requireOwnPersonProfile: true,
    requirePersonalAccess: true,
  });

  if (!context.ok) {
    return context;
  }

  let query = context.data.supabase
    .from("time_punches")
    .select("*")
    .eq("organization_id", context.data.organization.id)
    .eq("person_profile_id", context.data.ownPersonProfileId ?? "");

  if (validation.value.timeRecordId) {
    query = query.eq("time_record_id", validation.value.timeRecordId);
  }

  if (validation.value.occurredFrom) {
    query = query.gte("occurred_at", validation.value.occurredFrom);
  }

  if (validation.value.occurredTo) {
    query = query.lte("occurred_at", validation.value.occurredTo);
  }

  if (validation.value.status) {
    query = query.eq("status", validation.value.status);
  }

  const { data, error } = await query
    .order("occurred_at", { ascending: false })
    .limit(validation.value.limit);

  if (error) {
    return failure("load_failed");
  }

  return success(data ?? []);
}

function validateOwnCorrectionsQuery(
  input: OwnTimeCorrectionsQuery,
): ValidationResult<{
  limit: number;
  organizationId: string;
  status: TimeCorrectionStatus | null;
}> {
  if (!isRecord(input)) {
    return invalid("invalid_input");
  }

  const organizationId = normalizeRequiredUuid(
    input.organizationId,
    "invalid_organization",
  );

  if (!organizationId.ok) {
    return organizationId;
  }

  const limit = normalizeLimit(input.limit);

  if (!limit.ok) {
    return limit;
  }

  const status = normalizeOptionalStatus({
    error: "invalid_correction_status",
    isAllowed: isTimeCorrectionStatus,
    value: input.status,
  });

  if (!status.ok) {
    return status;
  }

  return valid({
    limit: limit.value,
    organizationId: organizationId.value,
    status: status.value,
  });
}

export async function listOwnTimeCorrections(
  input: OwnTimeCorrectionsQuery,
): Promise<TimeTrackingResult<TimeRecordCorrectionRow[]>> {
  const validation = validateOwnCorrectionsQuery(input);

  if (!validation.ok) {
    return failure(validation.error);
  }

  const context = await resolveTimeTrackingContext({
    organizationId: validation.value.organizationId,
    requireOwnPersonProfile: true,
    requirePersonalAccess: true,
  });

  if (!context.ok) {
    return context;
  }

  let query = context.data.supabase
    .from("time_record_corrections")
    .select("*")
    .eq("organization_id", context.data.organization.id)
    .eq("person_profile_id", context.data.ownPersonProfileId ?? "");

  if (validation.value.status) {
    query = query.eq("status", validation.value.status);
  }

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(validation.value.limit);

  if (error) {
    return failure("load_failed");
  }

  return success(data ?? []);
}

function validateOwnWeeklyApprovalsQuery(
  input: OwnTimeWeeklyApprovalsQuery,
): ValidationResult<{
  limit: number;
  organizationId: string;
  statuses: TimeWeeklyApprovalStatus[] | null;
  weekStartFrom: string | null;
  weekStartTo: string | null;
}> {
  if (!isRecord(input)) {
    return invalid("invalid_input");
  }

  const organizationId = normalizeRequiredUuid(
    input.organizationId,
    "invalid_organization",
  );

  if (!organizationId.ok) {
    return organizationId;
  }

  const range = normalizeDateRange({
    dateFrom: input.weekStartFrom,
    dateTo: input.weekStartTo,
  });

  if (!range.ok) {
    return range;
  }

  const limit = normalizeLimit(input.limit);

  if (!limit.ok) {
    return limit;
  }

  const status = normalizeOptionalStatus({
    error: "invalid_weekly_approval_status",
    isAllowed: isTimeWeeklyApprovalStatus,
    value: input.status,
  });

  if (!status.ok) {
    return status;
  }

  const statuses = normalizeOptionalStatusList({
    error: "invalid_weekly_approval_status",
    isAllowed: isTimeWeeklyApprovalStatus,
    value: input.statuses,
  });

  if (!statuses.ok) {
    return statuses;
  }

  const normalizedStatuses = statuses.value ? [...statuses.value] : [];

  if (status.value && !normalizedStatuses.includes(status.value)) {
    normalizedStatuses.unshift(status.value);
  }

  return valid({
    limit: limit.value,
    organizationId: organizationId.value,
    statuses: normalizedStatuses.length > 0 ? normalizedStatuses : null,
    weekStartFrom: range.value.dateFrom,
    weekStartTo: range.value.dateTo,
  });
}

export async function listOwnTimeWeeklyApprovals(
  input: OwnTimeWeeklyApprovalsQuery,
): Promise<TimeTrackingResult<TimeWeeklyApprovalRow[]>> {
  const validation = validateOwnWeeklyApprovalsQuery(input);

  if (!validation.ok) {
    return failure(validation.error);
  }

  const context = await resolveTimeTrackingContext({
    organizationId: validation.value.organizationId,
    requireOwnPersonProfile: true,
    requirePersonalAccess: true,
  });

  if (!context.ok) {
    return context;
  }

  let query = context.data.supabase
    .from("time_weekly_approvals")
    .select("*")
    .eq("organization_id", context.data.organization.id)
    .eq("person_profile_id", context.data.ownPersonProfileId ?? "");

  if (validation.value.weekStartFrom) {
    query = query.gte("week_start_date", validation.value.weekStartFrom);
  }

  if (validation.value.weekStartTo) {
    query = query.lte("week_start_date", validation.value.weekStartTo);
  }

  if (validation.value.statuses?.length === 1) {
    query = query.eq("status", validation.value.statuses[0]);
  } else if (validation.value.statuses?.length) {
    query = query.in("status", validation.value.statuses);
  }

  const { data, error } = await query
    .order("week_start_date", { ascending: false })
    .limit(validation.value.limit);

  if (error) {
    return failure("load_failed");
  }

  return success(data ?? []);
}

function validateOwnWeekOverviewQuery(
  input: OwnTimeWeekOverviewQuery,
): ValidationResult<{
  days: string[];
  organizationId: string;
  weekEnd: string;
  weekStart: string;
}> {
  if (!isRecord(input)) {
    return invalid("invalid_input");
  }

  const organizationId = normalizeRequiredUuid(
    input.organizationId,
    "invalid_organization",
  );

  if (!organizationId.ok) {
    return organizationId;
  }

  const weekStart = normalizeRequiredDate(input.weekStart, "invalid_date");

  if (!weekStart.ok) {
    return weekStart;
  }

  const weekEnd = addDaysToDateString(weekStart.value, 6);

  if (!weekEnd) {
    return invalid("invalid_date");
  }

  const days = Array.from({ length: 7 }, (_, index) =>
    addDaysToDateString(weekStart.value, index),
  );

  if (days.some((day) => !day)) {
    return invalid("invalid_date");
  }

  return valid({
    days: days as string[],
    organizationId: organizationId.value,
    weekEnd,
    weekStart: weekStart.value,
  });
}

export async function getOwnTimeWeekOverview(
  input: OwnTimeWeekOverviewQuery,
): Promise<TimeTrackingResult<OwnTimeWeekOverview>> {
  const validation = validateOwnWeekOverviewQuery(input);

  if (!validation.ok) {
    return failure(validation.error);
  }

  const context = await resolveTimeTrackingContext({
    organizationId: validation.value.organizationId,
    requireOwnPersonProfile: true,
    requirePersonalAccess: true,
  });

  if (!context.ok) {
    return context;
  }

  const ownPersonProfileId = context.data.ownPersonProfileId;

  if (!ownPersonProfileId) {
    return failure("profile_missing");
  }

  const [coachProfilesResult, blocksResult, recordsResult] = await Promise.all([
    context.data.supabase
      .from("coach_profiles")
      .select("id, weekly_contracted_hours")
      .eq("organization_id", context.data.organization.id)
      .eq("status", "active")
      .or(`person_profile_id.eq.${ownPersonProfileId},user_id.eq.${context.data.userId}`),
    context.data.supabase
      .from("schedule_blocks")
      .select("id, service_date, start_time, end_time, status")
      .eq("organization_id", context.data.organization.id)
      .gte("service_date", validation.value.weekStart)
      .lte("service_date", validation.value.weekEnd)
      .neq("status", "cancelled"),
    context.data.supabase
      .from("time_records")
      .select("*")
      .eq("organization_id", context.data.organization.id)
      .eq("person_profile_id", ownPersonProfileId)
      .gte("local_work_date", validation.value.weekStart)
      .lte("local_work_date", validation.value.weekEnd)
      .order("local_work_date", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);

  if (
    coachProfilesResult.error ||
    blocksResult.error ||
    recordsResult.error
  ) {
    return failure("load_failed");
  }

  const coachProfiles = coachProfilesResult.data ?? [];
  const blocks = blocksResult.data ?? [];
  const records = recordsResult.data ?? [];
  const coachProfileIds = coachProfiles.map((profile) => profile.id);
  const blockIds = blocks.map((block) => block.id);
  const recordIds = records.map((record) => record.id);
  const [assignmentsResult, punchesResult] = await Promise.all([
    coachProfileIds.length > 0 && blockIds.length > 0
      ? context.data.supabase
          .from("schedule_block_assignments")
          .select("id, schedule_block_id, coach_profile_id, assignment_status")
          .eq("organization_id", context.data.organization.id)
          .eq("assignment_status", "assigned")
          .in("coach_profile_id", coachProfileIds)
          .in("schedule_block_id", blockIds)
      : Promise.resolve({ data: [], error: null }),
    recordIds.length > 0
      ? context.data.supabase
          .from("time_punches")
          .select("*")
          .eq("organization_id", context.data.organization.id)
          .eq("person_profile_id", ownPersonProfileId)
          .in("time_record_id", recordIds)
          .order("occurred_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (assignmentsResult.error || punchesResult.error) {
    return failure("load_failed");
  }

  const blocksById = new Map(blocks.map((block) => [block.id, block]));
  const assignedByDate = new Map<
    string,
    { assignedBlockCount: number; assignedMinutes: number }
  >();

  for (const assignment of assignmentsResult.data ?? []) {
    const block = blocksById.get(assignment.schedule_block_id);

    if (!block) {
      continue;
    }

    const current = assignedByDate.get(block.service_date) ?? {
      assignedBlockCount: 0,
      assignedMinutes: 0,
    };

    current.assignedBlockCount += 1;
    current.assignedMinutes += getScheduleBlockDurationMinutes(block);
    assignedByDate.set(block.service_date, current);
  }

  const recordsByDate = new Map<string, TimeRecordRow[]>();

  for (const record of records) {
    const dayRecords = recordsByDate.get(record.local_work_date) ?? [];
    dayRecords.push(record);
    recordsByDate.set(record.local_work_date, dayRecords);
  }

  const punches = (punchesResult.data ?? []) as TimePunchRow[];
  const validDaySet = new Set(validation.value.days);
  const recordsById = new Map(records.map((record) => [record.id, record]));
  const punchesByRecordId = new Map<string, TimePunchRow[]>();
  const punchesByEffectiveDate = new Map<string, TimePunchRow[]>();
  const recordIdsByEffectivePunchDate = new Map<string, Set<string>>();

  for (const punch of punches) {
    const recordPunches = punchesByRecordId.get(punch.time_record_id) ?? [];
    recordPunches.push(punch);
    punchesByRecordId.set(punch.time_record_id, recordPunches);

    const record = recordsById.get(punch.time_record_id);
    const effectiveDate =
      getDateStringInTimeZone(punch.occurred_at, punch.timezone) ??
      record?.local_work_date;

    if (!effectiveDate || !validDaySet.has(effectiveDate)) {
      continue;
    }

    const datePunches = punchesByEffectiveDate.get(effectiveDate) ?? [];
    datePunches.push(punch);
    punchesByEffectiveDate.set(effectiveDate, datePunches);

    const dateRecordIds =
      recordIdsByEffectivePunchDate.get(effectiveDate) ?? new Set<string>();
    dateRecordIds.add(punch.time_record_id);
    recordIdsByEffectivePunchDate.set(effectiveDate, dateRecordIds);
  }

  const days: TimeWeekDayOverview[] = validation.value.days.map((date) => {
    const assigned = assignedByDate.get(date) ?? {
      assignedBlockCount: 0,
      assignedMinutes: 0,
    };
    const dayRecords = recordsByDate.get(date) ?? [];
    const dayPunches = punchesByEffectiveDate.get(date) ?? [];
    const visibleDayPunches = dayPunches.filter(
      (punch) => punch.status === "active",
    );
    const dayRecordIds = Array.from(
      new Set([
        ...dayRecords.map((record) => record.id),
        ...(recordIdsByEffectivePunchDate.get(date) ?? []),
      ]),
    );
    const worked = getWorkedMinutesFromPunches(dayPunches);
    const status = getTimeWeekDayStatus({
      assignedMinutes: assigned.assignedMinutes,
      hasOpenPunch: worked.hasOpenPunch,
      workedMinutes: worked.workedMinutes,
    });

    return {
      assignedBlockCount: assigned.assignedBlockCount,
      assignedMinutes: assigned.assignedMinutes,
      balanceMinutes: worked.workedMinutes - assigned.assignedMinutes,
      date,
      hasOpenPunch: worked.hasOpenPunch,
      punchCount: visibleDayPunches.length,
      punchIds: visibleDayPunches.map((punch) => punch.id),
      recordIds: dayRecordIds,
      status,
      workedMinutes: worked.workedMinutes,
    };
  });

  const assignedMinutes = days.reduce(
    (total, day) => total + day.assignedMinutes,
    0,
  );
  const workedMinutes = days.reduce(
    (total, day) => total + day.workedMinutes,
    0,
  );
  const hasOpenPunch = days.some((day) => day.hasOpenPunch);
  const weeklyContractedMinutesCandidates = coachProfiles
    .map((profile) => Number(profile.weekly_contracted_hours ?? 0))
    .filter((hours) => Number.isFinite(hours) && hours > 0)
    .map((hours) => Math.round(hours * 60));
  const weeklyContractedMinutes =
    weeklyContractedMinutesCandidates.length > 0
      ? Math.max(...weeklyContractedMinutesCandidates)
      : null;

  return success({
    activeCoachProfileCount: coachProfileIds.length,
    assignedBlockCount: days.reduce(
      (total, day) => total + day.assignedBlockCount,
      0,
    ),
    days,
    punches,
    records,
    totals: {
      assignedMinutes,
      balanceMinutes: workedMinutes - assignedMinutes,
      status: hasOpenPunch
        ? "open"
        : getTimeWeekDayStatus({
            assignedMinutes,
            hasOpenPunch: false,
            workedMinutes,
          }),
      warningCount: days.filter(
        (day) => day.status !== "correct" && day.status !== "empty",
      ).length,
      weeklyContractedMinutes,
      workedMinutes,
    },
    weekEnd: validation.value.weekEnd,
    weekStart: validation.value.weekStart,
  });
}

function validateRequestOwnCorrectionInput(
  input: RequestOwnTimeCorrectionInput,
): ValidationResult<{
  afterSnapshot: JsonObject;
  beforeSnapshot: JsonObject;
  correctionType: TimeCorrectionType;
  metadata: JsonObject;
  organizationId: string;
  reason: string;
  timePunchId: string | null;
  timeRecordId: string;
}> {
  if (!isRecord(input)) {
    return invalid("invalid_input");
  }

  const organizationId = normalizeRequiredUuid(
    input.organizationId,
    "invalid_organization",
  );

  if (!organizationId.ok) {
    return organizationId;
  }

  const timeRecordId = normalizeRequiredUuid(
    input.timeRecordId,
    "invalid_time_record",
  );

  if (!timeRecordId.ok) {
    return timeRecordId;
  }

  const timePunchId = normalizeOptionalUuid(
    input.timePunchId,
    "invalid_time_punch",
  );

  if (!timePunchId.ok) {
    return timePunchId;
  }

  const correctionType = input.correctionType ?? "record_update";

  if (!isTimeCorrectionType(correctionType)) {
    return invalid("invalid_correction_type");
  }

  const reason = normalizeOptionalText({
    error: "invalid_reason",
    maxLength: MAX_REASON_LENGTH,
    value: input.reason,
  });

  if (!reason.ok || !reason.value) {
    return invalid("invalid_reason");
  }

  const beforeSnapshot = normalizeJsonObject({
    error: "invalid_snapshot",
    maxLength: MAX_SNAPSHOT_JSON_LENGTH,
    value: input.beforeSnapshot ?? {},
  });

  if (!beforeSnapshot.ok) {
    return beforeSnapshot;
  }

  const afterSnapshot = normalizeJsonObject({
    error: "invalid_snapshot",
    maxLength: MAX_SNAPSHOT_JSON_LENGTH,
    required: true,
    value: input.afterSnapshot,
  });

  if (!afterSnapshot.ok) {
    return afterSnapshot;
  }

  const metadata = normalizeJsonObject({
    error: "invalid_metadata",
    maxLength: MAX_METADATA_JSON_LENGTH,
    value: input.metadata,
  });

  if (!metadata.ok) {
    return metadata;
  }

  return valid({
    afterSnapshot: afterSnapshot.value,
    beforeSnapshot: beforeSnapshot.value,
    correctionType,
    metadata: metadata.value,
    organizationId: organizationId.value,
    reason: reason.value,
    timePunchId: timePunchId.value,
    timeRecordId: timeRecordId.value,
  });
}

export async function requestOwnTimeCorrection(
  input: RequestOwnTimeCorrectionInput,
): Promise<TimeTrackingResult<TimeRecordCorrectionRow>> {
  const validation = validateRequestOwnCorrectionInput(input);

  if (!validation.ok) {
    return failure(validation.error);
  }

  const context = await resolveTimeTrackingContext({
    organizationId: validation.value.organizationId,
    requireOwnPersonProfile: true,
    requirePersonalAccess: true,
  });

  if (!context.ok) {
    return context;
  }

  const ownPersonProfileId = context.data.ownPersonProfileId;

  if (!ownPersonProfileId) {
    return failure("profile_missing");
  }

  const { data: timeRecord, error: recordError } = await context.data.supabase
    .from("time_records")
    .select("id")
    .eq("id", validation.value.timeRecordId)
    .eq("organization_id", context.data.organization.id)
    .eq("person_profile_id", ownPersonProfileId)
    .maybeSingle();

  if (recordError) {
    return failure("load_failed");
  }

  if (!timeRecord) {
    return failure("invalid_time_record");
  }

  if (validation.value.timePunchId) {
    const { data: timePunch, error: punchError } = await context.data.supabase
      .from("time_punches")
      .select("id")
      .eq("id", validation.value.timePunchId)
      .eq("time_record_id", validation.value.timeRecordId)
      .eq("organization_id", context.data.organization.id)
      .eq("person_profile_id", ownPersonProfileId)
      .maybeSingle();

    if (punchError) {
      return failure("load_failed");
    }

    if (!timePunch) {
      return failure("invalid_time_punch");
    }
  }

  const insertPayload: TablesInsert<"time_record_corrections"> = {
    after_snapshot: validation.value.afterSnapshot,
    before_snapshot: validation.value.beforeSnapshot,
    correction_type: validation.value.correctionType,
    metadata: validation.value.metadata,
    organization_id: context.data.organization.id,
    person_profile_id: ownPersonProfileId,
    reason: validation.value.reason,
    requested_by_membership_id: context.data.membership.id,
    requested_by_person_profile_id: ownPersonProfileId,
    requested_by_user_id: context.data.userId,
    status: "pending",
    time_punch_id: validation.value.timePunchId,
    time_record_id: validation.value.timeRecordId,
  };

  const { data, error } = await context.data.supabase
    .from("time_record_corrections")
    .insert(insertPayload)
    .select("*")
    .single();

  if (error || !data) {
    return failure("save_failed");
  }

  return success(data);
}

export async function createAndApplyOwnTimeCorrection(
  input: CreateAndApplyOwnTimeCorrectionInput,
): Promise<TimeTrackingResult<TimeRecordCorrectionRow>> {
  const validation = validateRequestOwnCorrectionInput(input);

  if (!validation.ok) {
    return failure(validation.error);
  }

  const context = await resolveTimeTrackingContext({
    organizationId: validation.value.organizationId,
    requireOwnPersonProfile: true,
    requirePersonalAccess: true,
  });

  if (!context.ok) {
    return context;
  }

  const settings = resolveOrganizationTimeTrackingSettings(
    context.data.organization.time_tracking_config,
  );

  if (settings.correctionApprovalRequired) {
    return failure("approval_required");
  }

  const ownPersonProfileId = context.data.ownPersonProfileId;

  if (!ownPersonProfileId) {
    return failure("profile_missing");
  }

  const { data: timeRecord, error: recordError } = await context.data.supabase
    .from("time_records")
    .select("id")
    .eq("id", validation.value.timeRecordId)
    .eq("organization_id", context.data.organization.id)
    .eq("person_profile_id", ownPersonProfileId)
    .maybeSingle();

  if (recordError) {
    return failure("load_failed");
  }

  if (!timeRecord) {
    return failure("invalid_time_record");
  }

  if (validation.value.timePunchId) {
    const { data: timePunch, error: punchError } = await context.data.supabase
      .from("time_punches")
      .select("id, status")
      .eq("id", validation.value.timePunchId)
      .eq("time_record_id", validation.value.timeRecordId)
      .eq("organization_id", context.data.organization.id)
      .eq("person_profile_id", ownPersonProfileId)
      .maybeSingle();

    if (punchError) {
      return failure("load_failed");
    }

    if (!timePunch) {
      return failure("invalid_time_punch");
    }

    if (timePunch.status !== "active") {
      return failure("invalid_time_punch_status");
    }
  }

  const { data, error } = await context.data.supabase.rpc(
    "create_and_apply_own_time_record_correction",
    {
      target_after_snapshot: validation.value.afterSnapshot,
      target_before_snapshot: validation.value.beforeSnapshot,
      target_correction_type: validation.value.correctionType,
      target_metadata: validation.value.metadata,
      target_organization_id: context.data.organization.id,
      target_reason: validation.value.reason,
      target_time_punch_id: validation.value.timePunchId as string,
      target_time_record_id: validation.value.timeRecordId,
    },
  );

  if (error || !data) {
    return failure(
      error?.message.includes("approval is required")
        ? "approval_required"
        : "apply_failed",
    );
  }

  return success(data);
}

function validateReviewTimeCorrectionInput(
  input: ReviewTimeCorrectionInput,
): ValidationResult<{
  correctionId: string;
  decision: TimeCorrectionReviewDecision;
  organizationId: string;
  reviewNote: string | null;
}> {
  if (!isRecord(input)) {
    return invalid("invalid_input");
  }

  const organizationId = normalizeRequiredUuid(
    input.organizationId,
    "invalid_organization",
  );

  if (!organizationId.ok) {
    return organizationId;
  }

  const correctionId = normalizeRequiredUuid(
    input.correctionId,
    "invalid_correction",
  );

  if (!correctionId.ok) {
    return correctionId;
  }

  if (!isTimeCorrectionReviewDecision(input.decision)) {
    return invalid("invalid_correction_decision");
  }

  const reviewNote = normalizeOptionalText({
    error: "invalid_notes",
    maxLength: MAX_REVIEW_NOTE_LENGTH,
    value: input.reviewNote,
  });

  if (!reviewNote.ok) {
    return reviewNote;
  }

  if (input.decision === "rejected" && !reviewNote.value) {
    return invalid("invalid_notes");
  }

  return valid({
    correctionId: correctionId.value,
    decision: input.decision,
    organizationId: organizationId.value,
    reviewNote: reviewNote.value,
  });
}

export async function reviewTimeCorrection(
  input: ReviewTimeCorrectionInput,
): Promise<TimeTrackingResult<TimeRecordCorrectionRow>> {
  const validation = validateReviewTimeCorrectionInput(input);

  if (!validation.ok) {
    return failure(validation.error);
  }

  const context = await resolveTimeTrackingContext({
    organizationId: validation.value.organizationId,
    requireReviewAccess: true,
  });

  if (!context.ok) {
    return context;
  }

  const { data: correction, error: correctionError } = await context.data.supabase
    .from("time_record_corrections")
    .select("id, status")
    .eq("id", validation.value.correctionId)
    .eq("organization_id", context.data.organization.id)
    .maybeSingle();

  if (correctionError) {
    return failure("load_failed");
  }

  if (!correction) {
    return failure("invalid_correction");
  }

  if (correction.status !== "pending") {
    return failure("invalid_correction_status");
  }

  const updatePayload: TablesUpdate<"time_record_corrections"> = {
    review_note: validation.value.reviewNote,
    status: validation.value.decision,
  };

  const { data, error } = await context.data.supabase
    .from("time_record_corrections")
    .update(updatePayload)
    .eq("id", validation.value.correctionId)
    .eq("organization_id", context.data.organization.id)
    .select("*")
    .single();

  if (error || !data) {
    return failure("review_failed");
  }

  return success(data);
}

function validateApplyTimeCorrectionInput(
  input: ApplyTimeCorrectionInput,
): ValidationResult<{
  correctionId: string;
  organizationId: string;
}> {
  if (!isRecord(input)) {
    return invalid("invalid_input");
  }

  const organizationId = normalizeRequiredUuid(
    input.organizationId,
    "invalid_organization",
  );

  if (!organizationId.ok) {
    return organizationId;
  }

  const correctionId = normalizeRequiredUuid(
    input.correctionId,
    "invalid_correction",
  );

  if (!correctionId.ok) {
    return correctionId;
  }

  return valid({
    correctionId: correctionId.value,
    organizationId: organizationId.value,
  });
}

export async function applyTimeCorrection(
  input: ApplyTimeCorrectionInput,
): Promise<TimeTrackingResult<TimeRecordCorrectionRow>> {
  const validation = validateApplyTimeCorrectionInput(input);

  if (!validation.ok) {
    return failure(validation.error);
  }

  const context = await resolveTimeTrackingContext({
    organizationId: validation.value.organizationId,
    requireReviewAccess: true,
  });

  if (!context.ok) {
    return context;
  }

  const { data: correction, error: correctionError } = await context.data.supabase
    .from("time_record_corrections")
    .select("id, status")
    .eq("id", validation.value.correctionId)
    .eq("organization_id", context.data.organization.id)
    .maybeSingle();

  if (correctionError) {
    return failure("load_failed");
  }

  if (!correction) {
    return failure("invalid_correction");
  }

  if (correction.status !== "approved") {
    return failure("invalid_correction_status");
  }

  const { data, error } = await context.data.supabase.rpc(
    "apply_time_record_correction",
    {
      target_correction_id: validation.value.correctionId,
      target_organization_id: context.data.organization.id,
    },
  );

  if (error || !data) {
    return failure("apply_failed");
  }

  return success(data);
}

function validateSubmitTimeWeeklyApprovalInput(
  input: SubmitTimeWeeklyApprovalInput,
): ValidationResult<{
  organizationId: string;
  personProfileId: string;
  submissionSource: "manual" | "resubmission";
  weekStart: string;
}> {
  if (!isRecord(input)) {
    return invalid("invalid_input");
  }

  const organizationId = normalizeRequiredUuid(
    input.organizationId,
    "invalid_organization",
  );

  if (!organizationId.ok) {
    return organizationId;
  }

  const personProfileId = normalizeRequiredUuid(
    input.personProfileId,
    "invalid_person_profile",
  );

  if (!personProfileId.ok) {
    return personProfileId;
  }

  const weekStart = normalizeRequiredDate(input.weekStart, "invalid_date");

  if (!weekStart.ok) {
    return weekStart;
  }

  if (!isMondayDateString(weekStart.value)) {
    return invalid("invalid_date");
  }

  const submissionSource = input.submissionSource ?? "manual";

  if (submissionSource !== "manual" && submissionSource !== "resubmission") {
    return invalid("invalid_input");
  }

  return valid({
    organizationId: organizationId.value,
    personProfileId: personProfileId.value,
    submissionSource,
    weekStart: weekStart.value,
  });
}

export async function submitTimeWeeklyApproval(
  input: SubmitTimeWeeklyApprovalInput,
): Promise<TimeTrackingResult<TimeWeeklyApprovalRow>> {
  const validation = validateSubmitTimeWeeklyApprovalInput(input);

  if (!validation.ok) {
    return failure(validation.error);
  }

  const context = await resolveTimeTrackingContext({
    organizationId: validation.value.organizationId,
    requireOwnPersonProfile: true,
    requirePersonalAccess: true,
  });

  if (!context.ok) {
    return context;
  }

  if (
    validation.value.personProfileId !== context.data.ownPersonProfileId &&
    !canReviewTimeTracking(context.data.membership.role)
  ) {
    return failure("forbidden");
  }

  const personExists = await ensurePersonBelongsToTenant({
    organizationId: context.data.organization.id,
    personProfileId: validation.value.personProfileId,
    supabase: context.data.supabase,
  });

  if (!personExists) {
    return failure("invalid_person_profile");
  }

  const { data, error } = await context.data.supabase.rpc(
    "submit_time_weekly_approval",
    {
      target_organization_id: context.data.organization.id,
      target_person_profile_id: validation.value.personProfileId,
      target_submission_source: validation.value.submissionSource,
      target_week_start_date: validation.value.weekStart,
    },
  );

  if (error || !data) {
    return failure("submission_failed");
  }

  return success(data);
}

function validateApproveTimeWeeklyApprovalInput(
  input: ApproveTimeWeeklyApprovalInput,
): ValidationResult<{
  approvalNote: string | null;
  organizationId: string;
  weeklyApprovalId: string;
}> {
  if (!isRecord(input)) {
    return invalid("invalid_input");
  }

  const organizationId = normalizeRequiredUuid(
    input.organizationId,
    "invalid_organization",
  );

  if (!organizationId.ok) {
    return organizationId;
  }

  const weeklyApprovalId = normalizeRequiredUuid(
    input.weeklyApprovalId,
    "invalid_weekly_approval",
  );

  if (!weeklyApprovalId.ok) {
    return weeklyApprovalId;
  }

  const approvalNote = normalizeOptionalText({
    error: "invalid_notes",
    maxLength: MAX_NOTES_LENGTH,
    value: input.approvalNote,
  });

  if (!approvalNote.ok) {
    return approvalNote;
  }

  return valid({
    approvalNote: approvalNote.value,
    organizationId: organizationId.value,
    weeklyApprovalId: weeklyApprovalId.value,
  });
}

export async function approveTimeWeeklyApproval(
  input: ApproveTimeWeeklyApprovalInput,
): Promise<TimeTrackingResult<TimeWeeklyApprovalRow>> {
  const validation = validateApproveTimeWeeklyApprovalInput(input);

  if (!validation.ok) {
    return failure(validation.error);
  }

  const context = await resolveTimeTrackingContext({
    organizationId: validation.value.organizationId,
    requireReviewAccess: true,
  });

  if (!context.ok) {
    return context;
  }

  const { data, error } = await context.data.supabase.rpc(
    "approve_time_weekly_approval",
    {
      target_approval_note: validation.value.approvalNote ?? undefined,
      target_organization_id: context.data.organization.id,
      target_weekly_approval_id: validation.value.weeklyApprovalId,
    },
  );

  if (error || !data) {
    return failure(
      error?.message.includes("profile signature")
        ? "signature_required"
        : "review_failed",
    );
  }

  return success(data);
}

function validateRejectTimeWeeklyApprovalInput(
  input: RejectTimeWeeklyApprovalInput,
): ValidationResult<{
  organizationId: string;
  rejectionNote: string;
  rejectionStatus: TimeWeeklyApprovalRejectionStatus;
  weeklyApprovalId: string;
}> {
  if (!isRecord(input)) {
    return invalid("invalid_input");
  }

  const organizationId = normalizeRequiredUuid(
    input.organizationId,
    "invalid_organization",
  );

  if (!organizationId.ok) {
    return organizationId;
  }

  const weeklyApprovalId = normalizeRequiredUuid(
    input.weeklyApprovalId,
    "invalid_weekly_approval",
  );

  if (!weeklyApprovalId.ok) {
    return weeklyApprovalId;
  }

  const rejectionNote = normalizeRequiredText({
    error: "invalid_notes",
    maxLength: MAX_REVIEW_NOTE_LENGTH,
    value: input.rejectionNote,
  });

  if (!rejectionNote.ok) {
    return rejectionNote;
  }

  const rejectionStatus = input.rejectionStatus ?? "correction_required";

  if (!isTimeWeeklyApprovalRejectionStatus(rejectionStatus)) {
    return invalid("invalid_weekly_approval_rejection_status");
  }

  return valid({
    organizationId: organizationId.value,
    rejectionNote: rejectionNote.value,
    rejectionStatus,
    weeklyApprovalId: weeklyApprovalId.value,
  });
}

export async function rejectTimeWeeklyApproval(
  input: RejectTimeWeeklyApprovalInput,
): Promise<TimeTrackingResult<TimeWeeklyApprovalRow>> {
  const validation = validateRejectTimeWeeklyApprovalInput(input);

  if (!validation.ok) {
    return failure(validation.error);
  }

  const context = await resolveTimeTrackingContext({
    organizationId: validation.value.organizationId,
    requireReviewAccess: true,
  });

  if (!context.ok) {
    return context;
  }

  const { data, error } = await context.data.supabase.rpc(
    "reject_time_weekly_approval",
    {
      target_organization_id: context.data.organization.id,
      target_rejection_note: validation.value.rejectionNote,
      target_rejection_status: validation.value.rejectionStatus,
      target_weekly_approval_id: validation.value.weeklyApprovalId,
    },
  );

  if (error || !data) {
    return failure("review_failed");
  }

  return success(data);
}

function validateReopenTimeWeeklyApprovalInput(
  input: ReopenTimeWeeklyApprovalInput,
): ValidationResult<{
  organizationId: string;
  reopenReason: string;
  weeklyApprovalId: string;
}> {
  if (!isRecord(input)) {
    return invalid("invalid_input");
  }

  const organizationId = normalizeRequiredUuid(
    input.organizationId,
    "invalid_organization",
  );

  if (!organizationId.ok) {
    return organizationId;
  }

  const weeklyApprovalId = normalizeRequiredUuid(
    input.weeklyApprovalId,
    "invalid_weekly_approval",
  );

  if (!weeklyApprovalId.ok) {
    return weeklyApprovalId;
  }

  const reopenReason = normalizeRequiredText({
    error: "invalid_reason",
    maxLength: MAX_REASON_LENGTH,
    value: input.reopenReason,
  });

  if (!reopenReason.ok) {
    return reopenReason;
  }

  return valid({
    organizationId: organizationId.value,
    reopenReason: reopenReason.value,
    weeklyApprovalId: weeklyApprovalId.value,
  });
}

export async function reopenTimeWeeklyApproval(
  input: ReopenTimeWeeklyApprovalInput,
): Promise<TimeTrackingResult<TimeWeeklyApprovalRow>> {
  const validation = validateReopenTimeWeeklyApprovalInput(input);

  if (!validation.ok) {
    return failure(validation.error);
  }

  const context = await resolveTimeTrackingContext({
    organizationId: validation.value.organizationId,
    requireReviewAccess: true,
  });

  if (!context.ok) {
    return context;
  }

  const { data, error } = await context.data.supabase.rpc(
    "reopen_time_weekly_approval",
    {
      target_organization_id: context.data.organization.id,
      target_reopen_reason: validation.value.reopenReason,
      target_weekly_approval_id: validation.value.weeklyApprovalId,
    },
  );

  if (error || !data) {
    return failure("reopen_failed");
  }

  return success(data);
}

export async function listTimeRecordsForReview(
  input: ReviewTimeRecordsQuery,
): Promise<TimeTrackingResult<TimeRecordRow[]>> {
  const validation = validateOwnRecordsQuery(input);

  if (!validation.ok) {
    return failure(validation.error);
  }

  const centerId = normalizeOptionalUuid(input.centerId, "invalid_center");

  if (!centerId.ok) {
    return failure(centerId.error);
  }

  const personProfileId = normalizeOptionalUuid(
    input.personProfileId,
    "invalid_person_profile",
  );

  if (!personProfileId.ok) {
    return failure(personProfileId.error);
  }

  const context = await resolveTimeTrackingContext({
    organizationId: validation.value.organizationId,
    requireReviewAccess: true,
  });

  if (!context.ok) {
    return context;
  }

  const referenceError = await validateReviewReferenceFilters({
    centerId: centerId.value,
    organizationId: context.data.organization.id,
    personProfileId: personProfileId.value,
    supabase: context.data.supabase,
  });

  if (referenceError) {
    return failure(referenceError);
  }

  let query = context.data.supabase
    .from("time_records")
    .select("*")
    .eq("organization_id", context.data.organization.id);

  if (validation.value.dateFrom) {
    query = query.gte("local_work_date", validation.value.dateFrom);
  }

  if (validation.value.dateTo) {
    query = query.lte("local_work_date", validation.value.dateTo);
  }

  if (validation.value.status) {
    query = query.eq("status", validation.value.status);
  }

  if (centerId.value) {
    query = query.eq("center_id", centerId.value);
  }

  if (personProfileId.value) {
    query = query.eq("person_profile_id", personProfileId.value);
  }

  const { data, error } = await query
    .order("local_work_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(validation.value.limit);

  if (error) {
    return failure("load_failed");
  }

  return success(data ?? []);
}

export async function listTimePunchesForReview(
  input: ReviewTimePunchesQuery,
): Promise<TimeTrackingResult<TimePunchRow[]>> {
  const validation = validateOwnPunchesQuery(input);

  if (!validation.ok) {
    return failure(validation.error);
  }

  const centerId = normalizeOptionalUuid(input.centerId, "invalid_center");

  if (!centerId.ok) {
    return failure(centerId.error);
  }

  const personProfileId = normalizeOptionalUuid(
    input.personProfileId,
    "invalid_person_profile",
  );

  if (!personProfileId.ok) {
    return failure(personProfileId.error);
  }

  const context = await resolveTimeTrackingContext({
    organizationId: validation.value.organizationId,
    requireReviewAccess: true,
  });

  if (!context.ok) {
    return context;
  }

  const referenceError = await validateReviewReferenceFilters({
    centerId: centerId.value,
    organizationId: context.data.organization.id,
    personProfileId: personProfileId.value,
    supabase: context.data.supabase,
  });

  if (referenceError) {
    return failure(referenceError);
  }

  let query = context.data.supabase
    .from("time_punches")
    .select("*")
    .eq("organization_id", context.data.organization.id);

  if (validation.value.timeRecordId) {
    query = query.eq("time_record_id", validation.value.timeRecordId);
  }

  if (validation.value.occurredFrom) {
    query = query.gte("occurred_at", validation.value.occurredFrom);
  }

  if (validation.value.occurredTo) {
    query = query.lte("occurred_at", validation.value.occurredTo);
  }

  if (validation.value.status) {
    query = query.eq("status", validation.value.status);
  }

  if (centerId.value) {
    query = query.eq("center_id", centerId.value);
  }

  if (personProfileId.value) {
    query = query.eq("person_profile_id", personProfileId.value);
  }

  const { data, error } = await query
    .order("occurred_at", { ascending: false })
    .limit(validation.value.limit);

  if (error) {
    return failure("load_failed");
  }

  return success(data ?? []);
}

export async function listTimeCorrectionsForReview(
  input: ReviewTimeCorrectionsQuery,
): Promise<TimeTrackingResult<TimeRecordCorrectionRow[]>> {
  const validation = validateOwnCorrectionsQuery(input);

  if (!validation.ok) {
    return failure(validation.error);
  }

  const personProfileId = normalizeOptionalUuid(
    input.personProfileId,
    "invalid_person_profile",
  );

  if (!personProfileId.ok) {
    return failure(personProfileId.error);
  }

  const context = await resolveTimeTrackingContext({
    organizationId: validation.value.organizationId,
    requireReviewAccess: true,
  });

  if (!context.ok) {
    return context;
  }

  const referenceError = await validateReviewReferenceFilters({
    organizationId: context.data.organization.id,
    personProfileId: personProfileId.value,
    supabase: context.data.supabase,
  });

  if (referenceError) {
    return failure(referenceError);
  }

  let query = context.data.supabase
    .from("time_record_corrections")
    .select("*")
    .eq("organization_id", context.data.organization.id);

  if (validation.value.status) {
    query = query.eq("status", validation.value.status);
  }

  if (personProfileId.value) {
    query = query.eq("person_profile_id", personProfileId.value);
  }

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(validation.value.limit);

  if (error) {
    return failure("load_failed");
  }

  return success(data ?? []);
}

export async function listTimeWeeklyApprovalsForReview(
  input: ReviewTimeWeeklyApprovalsQuery,
): Promise<TimeTrackingResult<TimeWeeklyApprovalRow[]>> {
  const validation = validateOwnWeeklyApprovalsQuery(input);

  if (!validation.ok) {
    return failure(validation.error);
  }

  const personProfileId = normalizeOptionalUuid(
    input.personProfileId,
    "invalid_person_profile",
  );

  if (!personProfileId.ok) {
    return failure(personProfileId.error);
  }

  const context = await resolveTimeTrackingContext({
    organizationId: validation.value.organizationId,
    requireReviewAccess: true,
  });

  if (!context.ok) {
    return context;
  }

  const referenceError = await validateReviewReferenceFilters({
    organizationId: context.data.organization.id,
    personProfileId: personProfileId.value,
    supabase: context.data.supabase,
  });

  if (referenceError) {
    return failure(referenceError);
  }

  let query = context.data.supabase
    .from("time_weekly_approvals")
    .select("*")
    .eq("organization_id", context.data.organization.id);

  if (validation.value.weekStartFrom) {
    query = query.gte("week_start_date", validation.value.weekStartFrom);
  }

  if (validation.value.weekStartTo) {
    query = query.lte("week_start_date", validation.value.weekStartTo);
  }

  if (validation.value.statuses?.length === 1) {
    query = query.eq("status", validation.value.statuses[0]);
  } else if (validation.value.statuses?.length) {
    query = query.in("status", validation.value.statuses);
  }

  if (personProfileId.value) {
    query = query.eq("person_profile_id", personProfileId.value);
  }

  const { data, error } = await query
    .order("week_start_date", { ascending: false })
    .limit(validation.value.limit);

  if (error) {
    return failure("load_failed");
  }

  return success(data ?? []);
}

type TimeExportRecordRow = Pick<
  TimeRecordRow,
  "id" | "local_work_date" | "person_profile_id" | "status" | "timezone"
>;
type TimeExportPunchRow = Pick<
  TimePunchRow,
  | "id"
  | "notes"
  | "occurred_at"
  | "punch_type"
  | "status"
  | "time_record_id"
  | "timezone"
>;
type TimeExportCorrectionRow = Pick<
  TimeRecordCorrectionRow,
  "correction_type" | "id" | "status" | "time_record_id"
>;
type TimeExportWeeklyApprovalRow = Pick<
  TimeWeeklyApprovalRow,
  "person_profile_id" | "status" | "week_start_date"
>;
type TimeExportPersonRow = Pick<
  Tables<"person_profiles">,
  "display_name" | "full_name" | "id" | "preferred_alias"
>;

function validateTimeRecordsCsvExportInput(
  input: TimeRecordsCsvExportInput,
): ValidationResult<{
  dateFrom: string;
  dateTo: string;
  organizationId: string;
  personProfileId: string | null;
}> {
  if (!isRecord(input)) {
    return invalid("invalid_input");
  }

  const organizationId = normalizeRequiredUuid(
    input.organizationId,
    "invalid_organization",
  );

  if (!organizationId.ok) {
    return organizationId;
  }

  const dateFrom = normalizeRequiredDate(input.dateFrom, "invalid_date");

  if (!dateFrom.ok) {
    return dateFrom;
  }

  const dateTo = normalizeRequiredDate(input.dateTo, "invalid_date");

  if (!dateTo.ok) {
    return dateTo;
  }

  if (dateTo.value < dateFrom.value) {
    return invalid("date_range_invalid");
  }

  const dayCount = getDateRangeDayCount(dateFrom.value, dateTo.value);

  if (dayCount < 1 || dayCount > MAX_TIME_EXPORT_RANGE_DAYS) {
    return invalid("date_range_invalid");
  }

  const personProfileId = normalizeOptionalUuid(
    input.personProfileId,
    "invalid_person_profile",
  );

  if (!personProfileId.ok) {
    return personProfileId;
  }

  return valid({
    dateFrom: dateFrom.value,
    dateTo: dateTo.value,
    organizationId: organizationId.value,
    personProfileId: personProfileId.value,
  });
}

async function markTimeExportFailed({
  exportId,
  organizationId,
  reason,
  supabase,
}: {
  exportId: string;
  organizationId: string;
  reason: string;
  supabase: SupabaseServerClient;
}) {
  await supabase
    .from("time_exports")
    .update({
      failure_reason: reason,
      status: "failed",
    })
    .eq("id", exportId)
    .eq("organization_id", organizationId);
}

function getTimeExportPersonLabel(person: TimeExportPersonRow | undefined) {
  if (!person) {
    return "Persona no disponible";
  }

  return (
    person.preferred_alias?.trim() ||
    person.display_name?.trim() ||
    person.full_name?.trim() ||
    "Persona sin nombre visible"
  );
}

function getTimeExportCorrectionSummary(corrections: TimeExportCorrectionRow[]) {
  if (corrections.length === 0) {
    return "sin correcciones";
  }

  const byStatus = countBy(corrections.map((correction) => correction.status));
  const byType = countBy(
    corrections.map((correction) => correction.correction_type),
  );

  return `${corrections.length}; estados: ${byStatus}; tipos: ${byType}`;
}

async function loadTimeExportPunches({
  organizationId,
  recordIds,
  supabase,
}: {
  organizationId: string;
  recordIds: string[];
  supabase: SupabaseServerClient;
}) {
  if (recordIds.length === 0) {
    return {
      data: [] as TimeExportPunchRow[],
      ok: true as const,
    };
  }

  const results = await Promise.all(
    chunkArray(recordIds, TIME_EXPORT_BATCH_SIZE).map((batch) =>
      supabase
        .from("time_punches")
        .select(
          "id, time_record_id, punch_type, occurred_at, timezone, status, notes",
        )
        .eq("organization_id", organizationId)
        .in("time_record_id", batch)
        .order("occurred_at", { ascending: true }),
    ),
  );
  const failed = results.find((result) => result.error);

  if (failed?.error) {
    return {
      error: failed.error,
      ok: false as const,
    };
  }

  return {
    data: results.flatMap((result) => result.data ?? []) as TimeExportPunchRow[],
    ok: true as const,
  };
}

async function loadTimeExportCorrections({
  organizationId,
  recordIds,
  supabase,
}: {
  organizationId: string;
  recordIds: string[];
  supabase: SupabaseServerClient;
}) {
  if (recordIds.length === 0) {
    return {
      data: [] as TimeExportCorrectionRow[],
      ok: true as const,
    };
  }

  const results = await Promise.all(
    chunkArray(recordIds, TIME_EXPORT_BATCH_SIZE).map((batch) =>
      supabase
        .from("time_record_corrections")
        .select("id, time_record_id, correction_type, status")
        .eq("organization_id", organizationId)
        .in("time_record_id", batch),
    ),
  );
  const failed = results.find((result) => result.error);

  if (failed?.error) {
    return {
      error: failed.error,
      ok: false as const,
    };
  }

  return {
    data: results.flatMap((result) => result.data ?? []) as TimeExportCorrectionRow[],
    ok: true as const,
  };
}

function buildTimeRecordsCsv({
  approvals,
  corrections,
  dateFrom,
  dateTo,
  organizationName,
  people,
  punches,
  records,
}: {
  approvals: TimeExportWeeklyApprovalRow[];
  corrections: TimeExportCorrectionRow[];
  dateFrom: string;
  dateTo: string;
  organizationName: string;
  people: TimeExportPersonRow[];
  punches: TimeExportPunchRow[];
  records: TimeExportRecordRow[];
}) {
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const punchesByRecordId = new Map<string, TimeExportPunchRow[]>();
  const correctionsByRecordId = new Map<string, TimeExportCorrectionRow[]>();
  const approvalsByPersonWeek = new Map<string, TimeExportWeeklyApprovalRow>();

  for (const punch of punches) {
    const recordPunches = punchesByRecordId.get(punch.time_record_id) ?? [];
    recordPunches.push(punch);
    punchesByRecordId.set(punch.time_record_id, recordPunches);
  }

  for (const correction of corrections) {
    const recordCorrections =
      correctionsByRecordId.get(correction.time_record_id) ?? [];
    recordCorrections.push(correction);
    correctionsByRecordId.set(correction.time_record_id, recordCorrections);
  }

  for (const approval of approvals) {
    approvalsByPersonWeek.set(
      `${approval.person_profile_id}:${approval.week_start_date}`,
      approval,
    );
  }

  const lines = [
    buildCsvLine([
      "organizacion",
      "persona",
      "fecha_local",
      "estado_registro",
      "entradas_activas",
      "salidas_activas",
      "minutos_trabajados",
      "fichaje_abierto",
      "estado_cierre_semanal",
      "notas_fichajes_activas",
      "correcciones_resumen",
      "alcance",
    ]),
  ];

  for (const record of records) {
    const recordPunches = punchesByRecordId.get(record.id) ?? [];
    const activePunches = recordPunches.filter(
      (punch) => punch.status === "active",
    );
    const worked = getWorkedMinutesFromPunches(recordPunches);
    const activeClockIns = activePunches
      .filter((punch) => punch.punch_type === "clock_in")
      .map((punch) => formatExportDateTime(punch.occurred_at, punch.timezone))
      .join(" | ");
    const activeClockOuts = activePunches
      .filter((punch) => punch.punch_type === "clock_out")
      .map((punch) => formatExportDateTime(punch.occurred_at, punch.timezone))
      .join(" | ");
    const activeNotesCount = activePunches.filter((punch) =>
      punch.notes?.trim(),
    ).length;
    const weekStart = getWeekStartDateString(record.local_work_date);
    const approval = weekStart
      ? approvalsByPersonWeek.get(`${record.person_profile_id}:${weekStart}`)
      : null;

    lines.push(
      buildCsvLine([
        organizationName,
        getTimeExportPersonLabel(peopleById.get(record.person_profile_id)),
        record.local_work_date,
        record.status,
        activeClockIns || "sin entradas activas",
        activeClockOuts || "sin salidas activas",
        worked.workedMinutes,
        worked.hasOpenPunch ? "si" : "no",
        approval?.status ?? "sin cierre semanal",
        activeNotesCount,
        getTimeExportCorrectionSummary(
          correctionsByRecordId.get(record.id) ?? [],
        ),
        "exporte interno revisable; no payroll; no cumplimiento legal definitivo",
      ]),
    );
  }

  if (records.length === 0) {
    lines.push(
      buildCsvLine([
        organizationName,
        "sin registros",
        `${dateFrom}..${dateTo}`,
        "sin datos",
        "",
        "",
        0,
        "no",
        "sin cierre semanal",
        0,
        "sin correcciones",
        "exporte interno revisable; no payroll; no cumplimiento legal definitivo",
      ]),
    );
  }

  return `${lines.join("\r\n")}\r\n`;
}

export async function generateTimeRecordsCsvExport(
  input: TimeRecordsCsvExportInput,
): Promise<TimeTrackingResult<TimeRecordsCsvExportData>> {
  const validation = validateTimeRecordsCsvExportInput(input);

  if (!validation.ok) {
    return failure(validation.error);
  }

  const context = await resolveTimeTrackingContext({
    organizationId: validation.value.organizationId,
    requireReviewAccess: true,
  });

  if (!context.ok) {
    return context;
  }

  if (validation.value.personProfileId) {
    const referenceError = await validateReviewReferenceFilters({
      organizationId: context.data.organization.id,
      personProfileId: validation.value.personProfileId,
      supabase: context.data.supabase,
    });

    if (referenceError) {
      return failure(referenceError);
    }
  }

  const exportMetadata = {
    internalReviewOnly: true,
    legalFinal: false,
    notesTextIncluded: false,
    payroll: false,
    schemaVersion: TIME_RECORDS_CSV_EXPORT_SCHEMA_VERSION,
    snapshotsIncluded: false,
  } satisfies JsonObject;
  const { data: exportRow, error: exportInsertError } =
    await context.data.supabase
      .from("time_exports")
      .insert({
        date_from: validation.value.dateFrom,
        date_to: validation.value.dateTo,
        export_format: "csv",
        export_scope: "time_records",
        metadata: exportMetadata,
        organization_id: context.data.organization.id,
        person_profile_id: validation.value.personProfileId,
        requested_by_membership_id: context.data.membership.id,
        requested_by_user_id: context.data.userId,
        status: "requested",
      })
      .select("*")
      .single();

  if (exportInsertError || !exportRow) {
    return failure("export_failed");
  }

  let recordsQuery = context.data.supabase
    .from("time_records")
    .select("id, local_work_date, person_profile_id, status, timezone")
    .eq("organization_id", context.data.organization.id)
    .gte("local_work_date", validation.value.dateFrom)
    .lte("local_work_date", validation.value.dateTo)
    .order("local_work_date", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(MAX_TIME_EXPORT_ROWS + 1);

  if (validation.value.personProfileId) {
    recordsQuery = recordsQuery.eq(
      "person_profile_id",
      validation.value.personProfileId,
    );
  }

  const { data: recordsData, error: recordsError } = await recordsQuery;

  if (recordsError) {
    await markTimeExportFailed({
      exportId: exportRow.id,
      organizationId: context.data.organization.id,
      reason: "records_load_failed",
      supabase: context.data.supabase,
    });

    return failure("load_failed");
  }

  const records = (recordsData ?? []) as TimeExportRecordRow[];

  if (records.length > MAX_TIME_EXPORT_ROWS) {
    await markTimeExportFailed({
      exportId: exportRow.id,
      organizationId: context.data.organization.id,
      reason: "too_many_rows",
      supabase: context.data.supabase,
    });

    return failure("invalid_limit");
  }

  const recordIds = records.map((record) => record.id);
  const personIds = Array.from(
    new Set(records.map((record) => record.person_profile_id)),
  );
  const weekStartFrom = getWeekStartDateString(validation.value.dateFrom);
  const weekStartTo = getWeekStartDateString(validation.value.dateTo);
  const [peopleResult, punchesResult, correctionsResult, approvalsResult] =
    await Promise.all([
      personIds.length > 0
        ? context.data.supabase
            .from("person_profiles")
            .select("id, display_name, preferred_alias, full_name")
            .eq("organization_id", context.data.organization.id)
            .in("id", personIds)
        : Promise.resolve({ data: [], error: null }),
      loadTimeExportPunches({
        organizationId: context.data.organization.id,
        recordIds,
        supabase: context.data.supabase,
      }),
      loadTimeExportCorrections({
        organizationId: context.data.organization.id,
        recordIds,
        supabase: context.data.supabase,
      }),
      personIds.length > 0 && weekStartFrom && weekStartTo
        ? context.data.supabase
            .from("time_weekly_approvals")
            .select("person_profile_id, week_start_date, status")
            .eq("organization_id", context.data.organization.id)
            .gte("week_start_date", weekStartFrom)
            .lte("week_start_date", weekStartTo)
            .in("person_profile_id", personIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

  if (
    peopleResult.error ||
    !punchesResult.ok ||
    !correctionsResult.ok ||
    approvalsResult.error
  ) {
    await markTimeExportFailed({
      exportId: exportRow.id,
      organizationId: context.data.organization.id,
      reason: "references_load_failed",
      supabase: context.data.supabase,
    });

    return failure("load_failed");
  }

  const csv = buildTimeRecordsCsv({
    approvals: (approvalsResult.data ?? []) as TimeExportWeeklyApprovalRow[],
    corrections: correctionsResult.data,
    dateFrom: validation.value.dateFrom,
    dateTo: validation.value.dateTo,
    organizationName: context.data.organization.name,
    people: (peopleResult.data ?? []) as TimeExportPersonRow[],
    punches: punchesResult.data,
    records,
  });
  const { data: generatedExportRow, error: generatedError } =
    await context.data.supabase
      .from("time_exports")
      .update({
        generated_at: new Date().toISOString(),
        metadata: {
          ...exportMetadata,
          rowCount: records.length,
        },
        row_count: records.length,
        status: "generated",
      })
      .eq("id", exportRow.id)
      .eq("organization_id", context.data.organization.id)
      .select("*")
      .single();

  if (generatedError || !generatedExportRow) {
    return failure("export_failed");
  }

  const filename = [
    "boxops-time-export",
    validation.value.dateFrom,
    validation.value.dateTo,
    generatedExportRow.id.slice(0, 8),
  ].join("-");

  return success({
    csv,
    dateFrom: validation.value.dateFrom,
    dateTo: validation.value.dateTo,
    exportId: generatedExportRow.id,
    filename: `${filename}.csv`,
    rowCount: records.length,
  });
}
