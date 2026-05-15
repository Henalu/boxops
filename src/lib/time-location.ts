import {
  canActivateTimeLocationSettings,
  canManageTimeLocationSettings,
  canReviewTimeTracking,
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
import type { Tables } from "@/types/supabase";

export const TIME_LOCATION_SETTING_STATUSES = [
  "draft",
  "active",
  "inactive",
  "archived",
] as const;
export const TIME_LOCATION_PURPOSES = [
  "clock_in",
  "clock_out",
  "context_check",
] as const;
export const TIME_LOCATION_AVAILABILITY_STATUSES = [
  "available",
  "permission_denied",
  "unavailable",
  "timeout",
  "unsupported",
  "inaccurate",
] as const;
export const TIME_LOCATION_ASSIST_RESULTS = [
  "inside_radius",
  "outside_radius",
  "unknown",
  "manual_fallback",
] as const;
export const TIME_LOCATION_ACCURACY_BUCKETS = [
  "lte_25m",
  "lte_50m",
  "lte_100m",
  "lte_250m",
  "gt_250m",
  "unknown",
] as const;
export const TIME_LOCATION_DISTANCE_BUCKETS = [
  "inside_radius",
  "outside_lte_25m",
  "outside_lte_100m",
  "outside_gt_100m",
  "unknown",
] as const;
export const TIME_LOCATION_FALLBACK_REASONS = [
  "permission_denied",
  "location_unavailable",
  "timeout",
  "unsupported",
  "precision_insufficient",
  "outside_radius",
  "manual_override",
  "not_configured",
  "other",
] as const;

export type TimeLocationSettingStatus =
  (typeof TIME_LOCATION_SETTING_STATUSES)[number];
export type TimeLocationPurpose = (typeof TIME_LOCATION_PURPOSES)[number];
export type TimeLocationAvailabilityStatus =
  (typeof TIME_LOCATION_AVAILABILITY_STATUSES)[number];
export type TimeLocationAssistResult =
  (typeof TIME_LOCATION_ASSIST_RESULTS)[number];
export type TimeLocationAccuracyBucket =
  (typeof TIME_LOCATION_ACCURACY_BUCKETS)[number];
export type TimeLocationDistanceBucket =
  (typeof TIME_LOCATION_DISTANCE_BUCKETS)[number];
export type TimeLocationFallbackReason =
  (typeof TIME_LOCATION_FALLBACK_REASONS)[number];

export type CenterTimeLocationSettingRow =
  Tables<"center_time_location_settings">;
export type TimeLocationEventRow = Tables<"time_location_events">;

export type TimeLocationErrorCode =
  | "authentication_required"
  | "date_range_invalid"
  | "forbidden"
  | "invalid_accuracy_bucket"
  | "invalid_assist_result"
  | "invalid_availability_status"
  | "invalid_center"
  | "invalid_change_reason"
  | "invalid_distance_bucket"
  | "invalid_fallback_reason"
  | "invalid_input"
  | "invalid_limit"
  | "invalid_notice"
  | "invalid_organization"
  | "invalid_policy_version"
  | "invalid_purpose"
  | "invalid_radius"
  | "invalid_retention"
  | "invalid_setting_status"
  | "invalid_time_punch"
  | "invalid_time_record"
  | "invalid_timestamp"
  | "invalid_timezone"
  | "load_failed"
  | "no_active_memberships"
  | "organization_not_found"
  | "organization_required"
  | "profile_missing"
  | "save_failed";

export type TimeLocationResult<T> =
  | {
      data: T;
      ok: true;
    }
  | {
      error: TimeLocationErrorCode;
      ok: false;
    };

export type GetCenterTimeLocationSettingsInput = {
  centerId?: string | null;
  limit?: number | null;
  organizationId: string;
  status?: TimeLocationSettingStatus | string | null;
};

export type UpsertCenterTimeLocationSettingInput = {
  centerId: string;
  centerLatitude: number;
  centerLongitude: number;
  changeReason?: string | null;
  fallbackRetentionDays?: number | null;
  maxAccuracyMeters: number;
  noticeText: string;
  organizationId: string;
  policyVersion: number;
  radiusMeters: number;
  retentionDays?: number | null;
  status: TimeLocationSettingStatus | string;
  timezone: string;
};

export type SetCenterTimeLocationSettingStatusInput = {
  centerId: string;
  changeReason?: string | null;
  organizationId: string;
  status: TimeLocationSettingStatus | string;
};

export type RecordOwnTimeLocationEventInput = {
  accuracyBucket?: TimeLocationAccuracyBucket | string | null;
  assistResult: TimeLocationAssistResult | string;
  availabilityStatus: TimeLocationAvailabilityStatus | string;
  capturedAt?: Date | string | null;
  centerId?: string | null;
  distanceBucket?: TimeLocationDistanceBucket | string | null;
  fallbackReason?: TimeLocationFallbackReason | string | null;
  organizationId: string;
  purpose?: TimeLocationPurpose | string | null;
  timePunchId?: string | null;
  timeRecordId?: string | null;
};

export type ListOwnTimeLocationEventsInput = {
  capturedFrom?: Date | string | null;
  capturedTo?: Date | string | null;
  limit?: number | null;
  organizationId: string;
};

export type ListTimeLocationEventsForRecordInput = {
  limit?: number | null;
  organizationId: string;
  timeRecordId: string;
};

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
type ValidationResult<T> =
  | {
      ok: true;
      value: T;
    }
  | {
      error: TimeLocationErrorCode;
      ok: false;
    };

type TimeLocationContext = {
  membership: ActiveMembership;
  organization: ActiveOrganization;
  ownPersonProfileId?: string;
  supabase: SupabaseServerClient;
  userId: string;
};

const ISO_TIMESTAMP_WITH_OFFSET_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:\d{2})$/;
const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 200;
const MAX_NOTICE_TEXT_LENGTH = 4000;
const MAX_CHANGE_REASON_LENGTH = 1000;
const MAX_TIMEZONE_LENGTH = 100;

function success<T>(data: T): TimeLocationResult<T> {
  return {
    data,
    ok: true,
  };
}

function failure(error: TimeLocationErrorCode): TimeLocationResult<never> {
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

function invalid(error: TimeLocationErrorCode): ValidationResult<never> {
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
  error: TimeLocationErrorCode,
): ValidationResult<string> {
  if (typeof value !== "string") {
    return invalid(error);
  }

  const trimmed = value.trim();

  return isPostgresUuid(trimmed) ? valid(trimmed) : invalid(error);
}

function normalizeOptionalUuid(
  value: unknown,
  error: TimeLocationErrorCode,
): ValidationResult<string | null> {
  if (value === undefined || value === null || value === "") {
    return valid(null);
  }

  return normalizeRequiredUuid(value, error);
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

function normalizeRequiredInteger({
  error,
  max,
  min,
  value,
}: {
  error: TimeLocationErrorCode;
  max: number;
  min: number;
  value: unknown;
}): ValidationResult<number> {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < min ||
    value > max
  ) {
    return invalid(error);
  }

  return valid(value);
}

function normalizeRequiredText({
  error,
  maxLength,
  value,
}: {
  error: TimeLocationErrorCode;
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

function normalizeOptionalText({
  error,
  maxLength,
  value,
}: {
  error: TimeLocationErrorCode;
  maxLength: number;
  value: unknown;
}): ValidationResult<string | null> {
  if (value === undefined || value === null || value === "") {
    return valid(null);
  }

  return normalizeRequiredText({ error, maxLength, value });
}

function normalizeCenterLatitude(value: unknown): ValidationResult<number> {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return invalid("invalid_input");
  }

  return value >= -90 && value <= 90 ? valid(value) : invalid("invalid_input");
}

function normalizeCenterLongitude(value: unknown): ValidationResult<number> {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return invalid("invalid_input");
  }

  return value >= -180 && value <= 180 ? valid(value) : invalid("invalid_input");
}

function isTimeLocationSettingStatus(
  value: unknown,
): value is TimeLocationSettingStatus {
  return TIME_LOCATION_SETTING_STATUSES.includes(
    value as TimeLocationSettingStatus,
  );
}

function isTimeLocationPurpose(value: unknown): value is TimeLocationPurpose {
  return TIME_LOCATION_PURPOSES.includes(value as TimeLocationPurpose);
}

function isTimeLocationAvailabilityStatus(
  value: unknown,
): value is TimeLocationAvailabilityStatus {
  return TIME_LOCATION_AVAILABILITY_STATUSES.includes(
    value as TimeLocationAvailabilityStatus,
  );
}

function isTimeLocationAssistResult(
  value: unknown,
): value is TimeLocationAssistResult {
  return TIME_LOCATION_ASSIST_RESULTS.includes(
    value as TimeLocationAssistResult,
  );
}

function isTimeLocationAccuracyBucket(
  value: unknown,
): value is TimeLocationAccuracyBucket {
  return TIME_LOCATION_ACCURACY_BUCKETS.includes(
    value as TimeLocationAccuracyBucket,
  );
}

function isTimeLocationDistanceBucket(
  value: unknown,
): value is TimeLocationDistanceBucket {
  return TIME_LOCATION_DISTANCE_BUCKETS.includes(
    value as TimeLocationDistanceBucket,
  );
}

function isTimeLocationFallbackReason(
  value: unknown,
): value is TimeLocationFallbackReason {
  return TIME_LOCATION_FALLBACK_REASONS.includes(
    value as TimeLocationFallbackReason,
  );
}

function normalizeOptionalStatus<T extends string>({
  error,
  isAllowed,
  value,
}: {
  error: TimeLocationErrorCode;
  isAllowed: (candidate: unknown) => candidate is T;
  value: unknown;
}): ValidationResult<T | null> {
  if (value === undefined || value === null || value === "") {
    return valid(null);
  }

  return isAllowed(value) ? valid(value) : invalid(error);
}

async function resolveTimeLocationContext({
  organizationId,
  requireOwnPersonProfile = false,
  requirePersonalAccess = false,
  requireReviewAccess = false,
  requireSettingsAccess = false,
}: {
  organizationId: unknown;
  requireOwnPersonProfile?: boolean;
  requirePersonalAccess?: boolean;
  requireReviewAccess?: boolean;
  requireSettingsAccess?: boolean;
}): Promise<TimeLocationResult<TimeLocationContext>> {
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

  if (
    requireSettingsAccess &&
    !canManageTimeLocationSettings(resolution.membership.role)
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

async function getCurrentSettingStatus({
  centerId,
  organizationId,
  supabase,
}: {
  centerId: string;
  organizationId: string;
  supabase: SupabaseServerClient;
}): Promise<TimeLocationResult<TimeLocationSettingStatus | null>> {
  const { data, error } = await supabase
    .from("center_time_location_settings")
    .select("status")
    .eq("center_id", centerId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    return failure("load_failed");
  }

  if (!data) {
    return success(null);
  }

  return isTimeLocationSettingStatus(data.status)
    ? success(data.status)
    : failure("load_failed");
}

async function validateCenterReference({
  centerId,
  organizationId,
  supabase,
}: {
  centerId: string;
  organizationId: string;
  supabase: SupabaseServerClient;
}): Promise<TimeLocationErrorCode | null> {
  const centerExists = await ensureCenterBelongsToTenant({
    centerId,
    organizationId,
    supabase,
  });

  return centerExists ? null : "invalid_center";
}

function validateSettingsQuery(
  input: GetCenterTimeLocationSettingsInput,
): ValidationResult<{
  centerId: string | null;
  limit: number;
  organizationId: string;
  status: TimeLocationSettingStatus | null;
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

  const centerId = normalizeOptionalUuid(input.centerId, "invalid_center");

  if (!centerId.ok) {
    return centerId;
  }

  const status = normalizeOptionalStatus({
    error: "invalid_setting_status",
    isAllowed: isTimeLocationSettingStatus,
    value: input.status,
  });

  if (!status.ok) {
    return status;
  }

  const limit = normalizeLimit(input.limit);

  if (!limit.ok) {
    return limit;
  }

  return valid({
    centerId: centerId.value,
    limit: limit.value,
    organizationId: organizationId.value,
    status: status.value,
  });
}

function validateUpsertCenterTimeLocationSettingInput(
  input: UpsertCenterTimeLocationSettingInput,
): ValidationResult<{
  centerId: string;
  centerLatitude: number;
  centerLongitude: number;
  changeReason: string | null;
  fallbackRetentionDays: number;
  maxAccuracyMeters: number;
  noticeText: string;
  organizationId: string;
  policyVersion: number;
  radiusMeters: number;
  retentionDays: number;
  status: TimeLocationSettingStatus;
  timezone: string;
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

  const centerId = normalizeRequiredUuid(input.centerId, "invalid_center");

  if (!centerId.ok) {
    return centerId;
  }

  if (!isTimeLocationSettingStatus(input.status)) {
    return invalid("invalid_setting_status");
  }

  const centerLatitude = normalizeCenterLatitude(input.centerLatitude);

  if (!centerLatitude.ok) {
    return centerLatitude;
  }

  const centerLongitude = normalizeCenterLongitude(input.centerLongitude);

  if (!centerLongitude.ok) {
    return centerLongitude;
  }

  const radiusMeters = normalizeRequiredInteger({
    error: "invalid_radius",
    max: 5000,
    min: 10,
    value: input.radiusMeters,
  });

  if (!radiusMeters.ok) {
    return radiusMeters;
  }

  const maxAccuracyMeters = normalizeRequiredInteger({
    error: "invalid_radius",
    max: 5000,
    min: 5,
    value: input.maxAccuracyMeters,
  });

  if (!maxAccuracyMeters.ok) {
    return maxAccuracyMeters;
  }

  const policyVersion = normalizeRequiredInteger({
    error: "invalid_policy_version",
    max: Number.MAX_SAFE_INTEGER,
    min: 1,
    value: input.policyVersion,
  });

  if (!policyVersion.ok) {
    return policyVersion;
  }

  const timezone = normalizeRequiredText({
    error: "invalid_timezone",
    maxLength: MAX_TIMEZONE_LENGTH,
    value: input.timezone,
  });

  if (!timezone.ok) {
    return timezone;
  }

  const noticeText = normalizeRequiredText({
    error: "invalid_notice",
    maxLength: MAX_NOTICE_TEXT_LENGTH,
    value: input.noticeText,
  });

  if (!noticeText.ok) {
    return noticeText;
  }

  const retentionDays = normalizeRequiredInteger({
    error: "invalid_retention",
    max: 730,
    min: 1,
    value: input.retentionDays ?? 90,
  });

  if (!retentionDays.ok) {
    return retentionDays;
  }

  const fallbackRetentionDays = normalizeRequiredInteger({
    error: "invalid_retention",
    max: 730,
    min: 1,
    value: input.fallbackRetentionDays ?? 30,
  });

  if (!fallbackRetentionDays.ok) {
    return fallbackRetentionDays;
  }

  if (fallbackRetentionDays.value > retentionDays.value) {
    return invalid("invalid_retention");
  }

  const changeReason = normalizeOptionalText({
    error: "invalid_change_reason",
    maxLength: MAX_CHANGE_REASON_LENGTH,
    value: input.changeReason,
  });

  if (!changeReason.ok) {
    return changeReason;
  }

  return valid({
    centerId: centerId.value,
    centerLatitude: centerLatitude.value,
    centerLongitude: centerLongitude.value,
    changeReason: changeReason.value,
    fallbackRetentionDays: fallbackRetentionDays.value,
    maxAccuracyMeters: maxAccuracyMeters.value,
    noticeText: noticeText.value,
    organizationId: organizationId.value,
    policyVersion: policyVersion.value,
    radiusMeters: radiusMeters.value,
    retentionDays: retentionDays.value,
    status: input.status,
    timezone: timezone.value,
  });
}

function validateSetCenterTimeLocationSettingStatusInput(
  input: SetCenterTimeLocationSettingStatusInput,
): ValidationResult<{
  centerId: string;
  changeReason: string | null;
  organizationId: string;
  status: TimeLocationSettingStatus;
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

  const centerId = normalizeRequiredUuid(input.centerId, "invalid_center");

  if (!centerId.ok) {
    return centerId;
  }

  if (!isTimeLocationSettingStatus(input.status)) {
    return invalid("invalid_setting_status");
  }

  const changeReason = normalizeOptionalText({
    error: "invalid_change_reason",
    maxLength: MAX_CHANGE_REASON_LENGTH,
    value: input.changeReason,
  });

  if (!changeReason.ok) {
    return changeReason;
  }

  return valid({
    centerId: centerId.value,
    changeReason: changeReason.value,
    organizationId: organizationId.value,
    status: input.status,
  });
}

function validateRecordOwnTimeLocationEventInput(
  input: RecordOwnTimeLocationEventInput,
): ValidationResult<{
  accuracyBucket: TimeLocationAccuracyBucket;
  assistResult: TimeLocationAssistResult;
  availabilityStatus: TimeLocationAvailabilityStatus;
  capturedAt: string | null;
  centerId: string | null;
  distanceBucket: TimeLocationDistanceBucket;
  fallbackReason: TimeLocationFallbackReason | null;
  organizationId: string;
  purpose: TimeLocationPurpose | null;
  timePunchId: string | null;
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

  if (!isTimeLocationAvailabilityStatus(input.availabilityStatus)) {
    return invalid("invalid_availability_status");
  }

  if (!isTimeLocationAssistResult(input.assistResult)) {
    return invalid("invalid_assist_result");
  }

  const purpose = normalizeOptionalStatus({
    error: "invalid_purpose",
    isAllowed: isTimeLocationPurpose,
    value: input.purpose,
  });

  if (!purpose.ok) {
    return purpose;
  }

  const centerId = normalizeOptionalUuid(input.centerId, "invalid_center");

  if (!centerId.ok) {
    return centerId;
  }

  const timeRecordId = normalizeOptionalUuid(
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

  const accuracyBucket = normalizeOptionalStatus({
    error: "invalid_accuracy_bucket",
    isAllowed: isTimeLocationAccuracyBucket,
    value: input.accuracyBucket ?? "unknown",
  });

  if (!accuracyBucket.ok || !accuracyBucket.value) {
    return invalid("invalid_accuracy_bucket");
  }

  const distanceBucket = normalizeOptionalStatus({
    error: "invalid_distance_bucket",
    isAllowed: isTimeLocationDistanceBucket,
    value: input.distanceBucket ?? "unknown",
  });

  if (!distanceBucket.ok || !distanceBucket.value) {
    return invalid("invalid_distance_bucket");
  }

  const fallbackReason = normalizeOptionalStatus({
    error: "invalid_fallback_reason",
    isAllowed: isTimeLocationFallbackReason,
    value: input.fallbackReason,
  });

  if (!fallbackReason.ok) {
    return fallbackReason;
  }

  const capturedAt = normalizeOptionalTimestamp(input.capturedAt);

  if (!capturedAt.ok) {
    return capturedAt;
  }

  if (
    input.availabilityStatus !== "available" &&
    !["manual_fallback", "unknown"].includes(input.assistResult)
  ) {
    return invalid("invalid_assist_result");
  }

  if (
    (input.availabilityStatus !== "available" ||
      input.assistResult === "manual_fallback") &&
    !fallbackReason.value
  ) {
    return invalid("invalid_fallback_reason");
  }

  return valid({
    accuracyBucket: accuracyBucket.value,
    assistResult: input.assistResult,
    availabilityStatus: input.availabilityStatus,
    capturedAt: capturedAt.value,
    centerId: centerId.value,
    distanceBucket: distanceBucket.value,
    fallbackReason: fallbackReason.value,
    organizationId: organizationId.value,
    purpose: purpose.value,
    timePunchId: timePunchId.value,
    timeRecordId: timeRecordId.value,
  });
}

function validateOwnEventsQuery(
  input: ListOwnTimeLocationEventsInput,
): ValidationResult<{
  capturedFrom: string | null;
  capturedTo: string | null;
  limit: number;
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

  const capturedFrom = normalizeOptionalTimestamp(input.capturedFrom);

  if (!capturedFrom.ok) {
    return capturedFrom;
  }

  const capturedTo = normalizeOptionalTimestamp(input.capturedTo);

  if (!capturedTo.ok) {
    return capturedTo;
  }

  if (
    capturedFrom.value &&
    capturedTo.value &&
    capturedTo.value < capturedFrom.value
  ) {
    return invalid("date_range_invalid");
  }

  const limit = normalizeLimit(input.limit);

  if (!limit.ok) {
    return limit;
  }

  return valid({
    capturedFrom: capturedFrom.value,
    capturedTo: capturedTo.value,
    limit: limit.value,
    organizationId: organizationId.value,
  });
}

function validateEventsForRecordQuery(
  input: ListTimeLocationEventsForRecordInput,
): ValidationResult<{
  limit: number;
  organizationId: string;
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

  const limit = normalizeLimit(input.limit);

  if (!limit.ok) {
    return limit;
  }

  return valid({
    limit: limit.value,
    organizationId: organizationId.value,
    timeRecordId: timeRecordId.value,
  });
}

async function ensureSettingActivationAllowed({
  context,
  requestedStatus,
  targetCenterId,
}: {
  context: TimeLocationContext;
  requestedStatus: TimeLocationSettingStatus;
  targetCenterId: string;
}): Promise<TimeLocationErrorCode | null> {
  if (requestedStatus !== "active") {
    return null;
  }

  const currentStatus = await getCurrentSettingStatus({
    centerId: targetCenterId,
    organizationId: context.organization.id,
    supabase: context.supabase,
  });

  if (!currentStatus.ok) {
    return currentStatus.error;
  }

  if (
    currentStatus.data !== "active" &&
    !canActivateTimeLocationSettings(context.membership.role)
  ) {
    return "forbidden";
  }

  return null;
}

async function validateOwnEventReferences({
  centerId,
  context,
  purpose,
  timePunchId,
  timeRecordId,
}: {
  centerId: string | null;
  context: TimeLocationContext;
  purpose: TimeLocationPurpose | null;
  timePunchId: string | null;
  timeRecordId: string | null;
}): Promise<
  TimeLocationResult<{
    centerId: string | null;
    purpose: TimeLocationPurpose | null;
    timeRecordId: string | null;
  }>
> {
  let effectiveCenterId = centerId;
  let effectivePurpose = purpose;
  let effectiveRecordId = timeRecordId;

  if (centerId) {
    const centerError = await validateCenterReference({
      centerId,
      organizationId: context.organization.id,
      supabase: context.supabase,
    });

    if (centerError) {
      return failure(centerError);
    }
  }

  if (timeRecordId) {
    const { data: record, error } = await context.supabase
      .from("time_records")
      .select("id, center_id, person_profile_id")
      .eq("id", timeRecordId)
      .eq("organization_id", context.organization.id)
      .eq("person_profile_id", context.ownPersonProfileId ?? "")
      .maybeSingle();

    if (error) {
      return failure("load_failed");
    }

    if (!record) {
      return failure("invalid_time_record");
    }

    if (effectiveCenterId && record.center_id && effectiveCenterId !== record.center_id) {
      return failure("invalid_center");
    }

    effectiveCenterId = effectiveCenterId ?? record.center_id;
  }

  if (timePunchId) {
    const { data: punch, error } = await context.supabase
      .from("time_punches")
      .select("id, center_id, person_profile_id, punch_type, time_record_id")
      .eq("id", timePunchId)
      .eq("organization_id", context.organization.id)
      .eq("person_profile_id", context.ownPersonProfileId ?? "")
      .maybeSingle();

    if (error) {
      return failure("load_failed");
    }

    if (!punch) {
      return failure("invalid_time_punch");
    }

    if (effectiveRecordId && effectiveRecordId !== punch.time_record_id) {
      return failure("invalid_time_record");
    }

    if (effectiveCenterId && punch.center_id && effectiveCenterId !== punch.center_id) {
      return failure("invalid_center");
    }

    if (
      effectivePurpose &&
      (punch.punch_type === "clock_in" || punch.punch_type === "clock_out") &&
      effectivePurpose !== punch.punch_type
    ) {
      return failure("invalid_purpose");
    }

    effectiveRecordId = effectiveRecordId ?? punch.time_record_id;
    effectiveCenterId = effectiveCenterId ?? punch.center_id;
    effectivePurpose =
      effectivePurpose ??
      (punch.punch_type === "clock_in" || punch.punch_type === "clock_out"
        ? punch.punch_type
        : null);
  }

  return success({
    centerId: effectiveCenterId,
    purpose: effectivePurpose,
    timeRecordId: effectiveRecordId,
  });
}

export async function getCenterTimeLocationSettings(
  input: GetCenterTimeLocationSettingsInput,
): Promise<TimeLocationResult<CenterTimeLocationSettingRow[]>> {
  const validation = validateSettingsQuery(input);

  if (!validation.ok) {
    return failure(validation.error);
  }

  const context = await resolveTimeLocationContext({
    organizationId: validation.value.organizationId,
    requireSettingsAccess: true,
  });

  if (!context.ok) {
    return context;
  }

  if (validation.value.centerId) {
    const centerError = await validateCenterReference({
      centerId: validation.value.centerId,
      organizationId: context.data.organization.id,
      supabase: context.data.supabase,
    });

    if (centerError) {
      return failure(centerError);
    }
  }

  let query = context.data.supabase
    .from("center_time_location_settings")
    .select("*")
    .eq("organization_id", context.data.organization.id);

  if (validation.value.centerId) {
    query = query.eq("center_id", validation.value.centerId);
  }

  if (validation.value.status) {
    query = query.eq("status", validation.value.status);
  }

  const { data, error } = await query
    .order("center_id", { ascending: true })
    .limit(validation.value.limit);

  if (error) {
    return failure("load_failed");
  }

  return success(data ?? []);
}

export async function upsertCenterTimeLocationSetting(
  input: UpsertCenterTimeLocationSettingInput,
): Promise<TimeLocationResult<CenterTimeLocationSettingRow>> {
  const validation = validateUpsertCenterTimeLocationSettingInput(input);

  if (!validation.ok) {
    return failure(validation.error);
  }

  const context = await resolveTimeLocationContext({
    organizationId: validation.value.organizationId,
    requireSettingsAccess: true,
  });

  if (!context.ok) {
    return context;
  }

  const centerError = await validateCenterReference({
    centerId: validation.value.centerId,
    organizationId: context.data.organization.id,
    supabase: context.data.supabase,
  });

  if (centerError) {
    return failure(centerError);
  }

  const activationError = await ensureSettingActivationAllowed({
    context: context.data,
    requestedStatus: validation.value.status,
    targetCenterId: validation.value.centerId,
  });

  if (activationError) {
    return failure(activationError);
  }

  const { data, error } = await context.data.supabase.rpc(
    "upsert_center_time_location_setting",
    {
      target_center_id: validation.value.centerId,
      target_center_latitude: validation.value.centerLatitude,
      target_center_longitude: validation.value.centerLongitude,
      target_change_reason: validation.value.changeReason ?? undefined,
      target_fallback_retention_days: validation.value.fallbackRetentionDays,
      target_max_accuracy_meters: validation.value.maxAccuracyMeters,
      target_notice_text: validation.value.noticeText,
      target_organization_id: context.data.organization.id,
      target_policy_version: validation.value.policyVersion,
      target_radius_meters: validation.value.radiusMeters,
      target_retention_days: validation.value.retentionDays,
      target_status: validation.value.status,
      target_timezone: validation.value.timezone,
    },
  );

  if (error || !data) {
    return failure("save_failed");
  }

  return success(data);
}

export async function setCenterTimeLocationSettingStatus(
  input: SetCenterTimeLocationSettingStatusInput,
): Promise<TimeLocationResult<CenterTimeLocationSettingRow>> {
  const validation = validateSetCenterTimeLocationSettingStatusInput(input);

  if (!validation.ok) {
    return failure(validation.error);
  }

  const context = await resolveTimeLocationContext({
    organizationId: validation.value.organizationId,
    requireSettingsAccess: true,
  });

  if (!context.ok) {
    return context;
  }

  const centerError = await validateCenterReference({
    centerId: validation.value.centerId,
    organizationId: context.data.organization.id,
    supabase: context.data.supabase,
  });

  if (centerError) {
    return failure(centerError);
  }

  const currentStatus = await getCurrentSettingStatus({
    centerId: validation.value.centerId,
    organizationId: context.data.organization.id,
    supabase: context.data.supabase,
  });

  if (!currentStatus.ok) {
    return currentStatus;
  }

  if (!currentStatus.data) {
    return failure("load_failed");
  }

  const activationError = await ensureSettingActivationAllowed({
    context: context.data,
    requestedStatus: validation.value.status,
    targetCenterId: validation.value.centerId,
  });

  if (activationError) {
    return failure(activationError);
  }

  const { data, error } = await context.data.supabase.rpc(
    "set_center_time_location_setting_status",
    {
      target_center_id: validation.value.centerId,
      target_change_reason: validation.value.changeReason ?? undefined,
      target_organization_id: context.data.organization.id,
      target_status: validation.value.status,
    },
  );

  if (error || !data) {
    return failure("save_failed");
  }

  return success(data);
}

export async function recordOwnTimeLocationEvent(
  input: RecordOwnTimeLocationEventInput,
): Promise<TimeLocationResult<TimeLocationEventRow>> {
  const validation = validateRecordOwnTimeLocationEventInput(input);

  if (!validation.ok) {
    return failure(validation.error);
  }

  const context = await resolveTimeLocationContext({
    organizationId: validation.value.organizationId,
    requireOwnPersonProfile: true,
    requirePersonalAccess: true,
  });

  if (!context.ok) {
    return context;
  }

  const references = await validateOwnEventReferences({
    centerId: validation.value.centerId,
    context: context.data,
    purpose: validation.value.purpose,
    timePunchId: validation.value.timePunchId,
    timeRecordId: validation.value.timeRecordId,
  });

  if (!references.ok) {
    return references;
  }

  if (
    ["inside_radius", "outside_radius"].includes(validation.value.assistResult) &&
    !references.data.centerId
  ) {
    return failure("invalid_center");
  }

  const { data, error } = await context.data.supabase.rpc(
    "record_own_time_location_event",
    {
      target_accuracy_bucket: validation.value.accuracyBucket,
      target_assist_result: validation.value.assistResult,
      target_availability_status: validation.value.availabilityStatus,
      target_captured_at: validation.value.capturedAt ?? undefined,
      target_center_id: references.data.centerId ?? undefined,
      target_distance_bucket: validation.value.distanceBucket,
      target_fallback_reason: validation.value.fallbackReason ?? undefined,
      target_organization_id: context.data.organization.id,
      target_purpose: references.data.purpose ?? undefined,
      target_time_punch_id: validation.value.timePunchId ?? undefined,
      target_time_record_id: references.data.timeRecordId ?? undefined,
    },
  );

  if (error || !data) {
    return failure("save_failed");
  }

  return success(data);
}

export async function listOwnTimeLocationEvents(
  input: ListOwnTimeLocationEventsInput,
): Promise<TimeLocationResult<TimeLocationEventRow[]>> {
  const validation = validateOwnEventsQuery(input);

  if (!validation.ok) {
    return failure(validation.error);
  }

  const context = await resolveTimeLocationContext({
    organizationId: validation.value.organizationId,
    requireOwnPersonProfile: true,
    requirePersonalAccess: true,
  });

  if (!context.ok) {
    return context;
  }

  const { data, error } = await context.data.supabase.rpc(
    "list_own_time_location_events",
    {
      target_captured_from: validation.value.capturedFrom ?? undefined,
      target_captured_to: validation.value.capturedTo ?? undefined,
      target_limit: validation.value.limit,
      target_organization_id: context.data.organization.id,
    },
  );

  if (error) {
    return failure("load_failed");
  }

  return success(data ?? []);
}

export async function listTimeLocationEventsForRecord(
  input: ListTimeLocationEventsForRecordInput,
): Promise<TimeLocationResult<TimeLocationEventRow[]>> {
  const validation = validateEventsForRecordQuery(input);

  if (!validation.ok) {
    return failure(validation.error);
  }

  const context = await resolveTimeLocationContext({
    organizationId: validation.value.organizationId,
  });

  if (!context.ok) {
    return context;
  }

  const { data: record, error: recordError } = await context.data.supabase
    .from("time_records")
    .select("id")
    .eq("id", validation.value.timeRecordId)
    .eq("organization_id", context.data.organization.id)
    .maybeSingle();

  if (recordError) {
    return failure("load_failed");
  }

  if (!record) {
    return failure("invalid_time_record");
  }

  const { data, error } = await context.data.supabase.rpc(
    "list_time_location_events_for_record",
    {
      target_limit: validation.value.limit,
      target_organization_id: context.data.organization.id,
      target_time_record_id: validation.value.timeRecordId,
    },
  );

  if (error) {
    return failure(
      error.message.includes("manager role") ? "forbidden" : "load_failed",
    );
  }

  return success(data ?? []);
}
