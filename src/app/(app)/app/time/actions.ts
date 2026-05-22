"use server";

import { redirect } from "next/navigation";

import {
  applyTimeCorrectionAction,
  createAndApplyOwnTimeCorrectionAction,
  createOwnTimePunchAction,
  requestOwnTimeCorrectionAction,
  reviewTimeCorrectionAction,
} from "@/lib/time-tracking-actions";
import {
  setOvertimeCandidateStatus,
  type OvertimeCandidateReviewStatus,
} from "@/lib/overtime-candidates";
import { detectOperationalOvertimeCandidates } from "@/lib/overtime-candidate-detection";
import { canUsePersonalFeatures } from "@/lib/auth/permissions";
import {
  getActiveMemberships,
  getAuthenticatedUser,
  resolveActiveOrganization,
} from "@/lib/auth/tenant";
import { getTimePath } from "@/lib/navigation/app-paths";
import { resolveOrganizationTimeTrackingSettings } from "@/lib/organizations";
import { createClient } from "@/lib/supabase/server";
import type {
  TimeCorrectionReviewDecision,
  TimeCorrectionType,
  TimePunchType,
} from "@/lib/time-tracking";
import { isPostgresUuid } from "@/lib/uuid";
import type { Json, Tables } from "@/types/supabase";

type JsonObject = { [key: string]: Json | undefined };
type CorrectionRecord = Pick<
  Tables<"time_records">,
  | "center_id"
  | "id"
  | "local_work_date"
  | "planned_end_at"
  | "planned_start_at"
  | "schedule_block_assignment_id"
  | "schedule_block_id"
  | "status"
  | "timezone"
>;
type CorrectionPunch = Pick<
  Tables<"time_punches">,
  | "center_id"
  | "id"
  | "notes"
  | "occurred_at"
  | "punch_type"
  | "schedule_block_assignment_id"
  | "schedule_block_id"
  | "status"
  | "timezone"
>;

const CORRECTION_SNAPSHOT_VERSION = "boxops.time-correction.v1";
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL_DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;
const TIME_PATTERN = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;
const APP_TIME_CORRECTION_TYPES = [
  "punch_update",
  "punch_void",
] as const satisfies readonly TimeCorrectionType[];
const TIME_PUNCH_TYPES = [
  "clock_in",
  "clock_out",
] as const satisfies readonly TimePunchType[];
const TIME_CORRECTION_REVIEW_DECISIONS = [
  "approved",
  "rejected",
] as const satisfies readonly TimeCorrectionReviewDecision[];
const OVERTIME_CANDIDATE_REVIEW_STATUSES = [
  "needs_review",
  "under_review",
  "operationally_validated",
  "operationally_rejected",
  "closed",
] as const satisfies readonly OvertimeCandidateReviewStatus[];
type AppOvertimeCandidateReviewStatus =
  (typeof OVERTIME_CANDIDATE_REVIEW_STATUSES)[number];
const MAX_CORRECTION_NOTE_LENGTH = 1000;

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

function isDateInput(value: string) {
  if (!DATE_PATTERN.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function getRedirectWeekStart(formData: FormData) {
  const weekStart = getFormString(formData, "weekStart");

  return isDateInput(weekStart) ? weekStart : null;
}

function addDaysToDateInput(dateValue: string, days: number) {
  if (!isDateInput(dateValue)) {
    return null;
  }

  const [year, month, day] = dateValue.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));

  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function getTimeErrorPath(
  organizationId: string | null,
  error: string,
  weekStart?: string | null,
) {
  return getTimePath({
    organizationId,
    error,
    week: weekStart,
  });
}

function getTimeStatusPath(
  organizationId: string,
  status: string,
  weekStart?: string | null,
) {
  return getTimePath({
    organizationId,
    status,
    week: weekStart,
  });
}

function isAppTimeCorrectionType(value: string): value is TimeCorrectionType {
  return APP_TIME_CORRECTION_TYPES.includes(
    value as (typeof APP_TIME_CORRECTION_TYPES)[number],
  );
}

function isTimePunchType(value: string): value is TimePunchType {
  return TIME_PUNCH_TYPES.includes(value as TimePunchType);
}

function isTimeCorrectionReviewDecision(
  value: string,
): value is TimeCorrectionReviewDecision {
  return TIME_CORRECTION_REVIEW_DECISIONS.includes(
    value as TimeCorrectionReviewDecision,
  );
}

function isOvertimeCandidateReviewStatus(
  value: string,
): value is AppOvertimeCandidateReviewStatus {
  return OVERTIME_CANDIDATE_REVIEW_STATUSES.includes(
    value as AppOvertimeCandidateReviewStatus,
  );
}

function parseLocalDateTime(value: string) {
  const match = LOCAL_DATE_TIME_PATTERN.exec(value);

  if (!match) {
    return null;
  }

  const [, yearValue, monthValue, dayValue, hourValue, minuteValue, secondValue] =
    match;
  const year = Number(yearValue);
  const month = Number(monthValue);
  const day = Number(dayValue);
  const hour = Number(hourValue);
  const minute = Number(minuteValue);
  const second = secondValue ? Number(secondValue) : 0;
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute ||
    date.getUTCSeconds() !== second
  ) {
    return null;
  }

  return {
    date: `${yearValue}-${monthValue}-${dayValue}`,
    time: `${hourValue}:${minuteValue}`,
    value: `${yearValue}-${monthValue}-${dayValue}T${hourValue}:${minuteValue}`,
  };
}

function parseLocalDateAndTime(dateValue: string, timeValue: string) {
  if (!isDateInput(dateValue)) {
    return null;
  }

  const match = TIME_PATTERN.exec(timeValue);

  if (!match) {
    return null;
  }

  const [, hourValue, minuteValue, secondValue] = match;
  const hour = Number(hourValue);
  const minute = Number(minuteValue);
  const second = secondValue ? Number(secondValue) : 0;

  if (
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 59
  ) {
    return null;
  }

  return {
    date: dateValue,
    time: `${hourValue}:${minuteValue}`,
  };
}

function getSafeTimeZone(timeZone: string | null | undefined) {
  if (!timeZone) {
    return "UTC";
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return timeZone;
  } catch {
    return "UTC";
  }
}

function getDatePartsInTimeZone(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone,
    year: "numeric",
  });
  const parts = formatter.formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, part.value]));

  return {
    day: Number(values.get("day")),
    hour: Number(values.get("hour")),
    minute: Number(values.get("minute")),
    month: Number(values.get("month")),
    second: Number(values.get("second")),
    year: Number(values.get("year")),
  };
}

function getCurrentLocalDateAndTime(timeZone: string) {
  const parts = getDatePartsInTimeZone(new Date(), timeZone);

  return {
    date: `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(
      parts.day,
    ).padStart(2, "0")}`,
    time: `${String(parts.hour).padStart(2, "0")}:${String(
      parts.minute,
    ).padStart(2, "0")}`,
  };
}

function getTimeZoneOffsetMs(timeZone: string, date: Date) {
  const parts = getDatePartsInTimeZone(date, timeZone);
  const zonedAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );

  return zonedAsUtc - date.getTime();
}

function getWallTimeInstant({
  date,
  time,
  timeZone,
}: {
  date: string;
  time: string;
  timeZone: string;
}) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);

  if (
    !year ||
    !month ||
    !day ||
    hour === undefined ||
    minute === undefined ||
    Number.isNaN(hour) ||
    Number.isNaN(minute)
  ) {
    return null;
  }

  const utcWallTime = Date.UTC(year, month - 1, day, hour, minute);
  let instant = new Date(
    utcWallTime - getTimeZoneOffsetMs(timeZone, new Date(utcWallTime)),
  );
  instant = new Date(utcWallTime - getTimeZoneOffsetMs(timeZone, instant));

  return Number.isNaN(instant.getTime()) ? null : instant;
}

function getRecordSnapshot(record: CorrectionRecord): JsonObject {
  return {
    centerId: record.center_id,
    id: record.id,
    localWorkDate: record.local_work_date,
    plannedEndAt: record.planned_end_at,
    plannedStartAt: record.planned_start_at,
    scheduleBlockAssignmentId: record.schedule_block_assignment_id,
    scheduleBlockId: record.schedule_block_id,
    status: record.status,
    timezone: record.timezone,
  };
}

function getPunchSnapshot(punch: CorrectionPunch | null): JsonObject | null {
  if (!punch) {
    return null;
  }

  return {
    centerId: punch.center_id,
    id: punch.id,
    notes: punch.notes,
    occurredAt: punch.occurred_at,
    punchType: punch.punch_type,
    scheduleBlockAssignmentId: punch.schedule_block_assignment_id,
    scheduleBlockId: punch.schedule_block_id,
    status: punch.status,
    timezone: punch.timezone,
  };
}

function getBeforeSnapshot({
  punch,
  record,
}: {
  punch: CorrectionPunch | null;
  record: CorrectionRecord;
}): JsonObject {
  return {
    punch: getPunchSnapshot(punch),
    record: getRecordSnapshot(record),
    schemaVersion: CORRECTION_SNAPSHOT_VERSION,
  };
}

function getAfterSnapshot({
  correctionNote,
  correctionType,
  occurredAtLocal,
  punch,
  punchType,
  record,
}: {
  correctionNote: string;
  correctionType: TimeCorrectionType;
  occurredAtLocal: ReturnType<typeof parseLocalDateTime> | null;
  punch: CorrectionPunch | null;
  punchType: TimePunchType | null;
  record: CorrectionRecord;
}): JsonObject {
  const recordSnapshot = getRecordSnapshot(record);

  if (correctionType === "record_update") {
    return {
      change: {
        note: correctionNote,
      },
      record: recordSnapshot,
      schemaVersion: CORRECTION_SNAPSHOT_VERSION,
      type: "record_update",
    };
  }

  if (correctionType === "punch_void") {
    return {
      punch: {
        ...(getPunchSnapshot(punch) ?? {}),
        requestedStatus: "voided",
      },
      record: recordSnapshot,
      schemaVersion: CORRECTION_SNAPSHOT_VERSION,
      type: "punch_void",
    };
  }

  if (correctionType === "punch_update") {
    return {
      punch: {
        ...(getPunchSnapshot(punch) ?? {}),
        requestedOccurredAtLocal: occurredAtLocal?.value ?? null,
        requestedTimezone: punch?.timezone ?? record.timezone,
      },
      record: recordSnapshot,
      schemaVersion: CORRECTION_SNAPSHOT_VERSION,
      type: "punch_update",
    };
  }

  return {
    punch: {
      centerId: record.center_id,
      occurredAtLocal: occurredAtLocal?.value ?? null,
      punchType,
      requestedStatus: "active",
      scheduleBlockAssignmentId: record.schedule_block_assignment_id,
      scheduleBlockId: record.schedule_block_id,
      source: "correction",
      timezone: record.timezone,
    },
    record: recordSnapshot,
    schemaVersion: CORRECTION_SNAPSHOT_VERSION,
    type: "punch_add",
  };
}

async function resolveOwnCorrectionContext(organizationId: string) {
  const user = await getAuthenticatedUser();

  if (!user) {
    return {
      error: "authentication_required",
      ok: false as const,
    };
  }

  const memberships = await getActiveMemberships(user.id);
  const resolution = resolveActiveOrganization(memberships, organizationId);

  if (!resolution.ok) {
    return {
      error: resolution.reason,
      ok: false as const,
    };
  }

  if (!canUsePersonalFeatures(resolution.membership.role)) {
    return {
      error: "forbidden",
      ok: false as const,
    };
  }

  const supabase = await createClient();
  const { data: profile, error } = await supabase
    .from("person_profiles")
    .select("id")
    .eq("organization_id", resolution.organization.id)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    return {
      error: "load_failed",
      ok: false as const,
    };
  }

  if (!profile) {
    return {
      error: "profile_missing",
      ok: false as const,
    };
  }

  return {
    data: {
      organization: resolution.organization,
      organizationId: resolution.organization.id,
      personProfileId: profile.id,
      supabase,
    },
    ok: true as const,
  };
}

async function resolveOwnTimeFormContext(organizationId: string) {
  const user = await getAuthenticatedUser();

  if (!user) {
    return {
      error: "authentication_required",
      ok: false as const,
    };
  }

  const memberships = await getActiveMemberships(user.id);
  const resolution = resolveActiveOrganization(memberships, organizationId);

  if (!resolution.ok) {
    return {
      error: resolution.reason,
      ok: false as const,
    };
  }

  if (!canUsePersonalFeatures(resolution.membership.role)) {
    return {
      error: "forbidden",
      ok: false as const,
    };
  }

  return {
    data: {
      organization: resolution.organization,
      userId: user.id,
    },
    ok: true as const,
  };
}

export async function createOwnTimePunchFromForm(formData: FormData) {
  const organizationId = getFormString(formData, "organizationId");
  const punchType = getFormString(formData, "punchType");
  const centerId = getFormString(formData, "centerId");
  const punchDate = getFormString(formData, "punchDate");
  const punchTime = getFormString(formData, "punchTime");
  const notes = getFormString(formData, "notes");
  const redirectWithError = (code: string, weekStart?: string | null): never => {
    redirect(getTimeErrorPath(organizationId || null, code, weekStart));
  };

  if (!organizationId) {
    redirectWithError("organization_required");
  }

  if (!isPostgresUuid(organizationId)) {
    redirectWithError("invalid_organization");
  }

  const context = await resolveOwnTimeFormContext(organizationId);

  if (!context.ok) {
    redirectWithError(context.error);
  }

  const timeFormContext = context.ok
    ? context.data
    : redirectWithError(context.error);
  const timeZone = getSafeTimeZone(timeFormContext.organization.timezone);
  const requestedLocalDateTime =
    punchDate || punchTime
      ? parseLocalDateAndTime(punchDate, punchTime)
      : getCurrentLocalDateAndTime(timeZone);

  if (!requestedLocalDateTime) {
    redirectWithError("invalid_timestamp");
  }

  const safeRequestedLocalDateTime =
    requestedLocalDateTime ?? redirectWithError("invalid_timestamp");
  const occurredAt = getWallTimeInstant({
    date: safeRequestedLocalDateTime.date,
    time: safeRequestedLocalDateTime.time,
    timeZone,
  });

  if (!occurredAt) {
    redirectWithError("invalid_timestamp", safeRequestedLocalDateTime.date);
  }

  const safeOccurredAt =
    occurredAt ??
    redirectWithError("invalid_timestamp", safeRequestedLocalDateTime.date);
  const result = await createOwnTimePunchAction({
    centerId: centerId || null,
    localWorkDate: safeRequestedLocalDateTime.date,
    metadata: {
      requestedLocalDate: safeRequestedLocalDateTime.date,
      requestedLocalTime: safeRequestedLocalDateTime.time,
      requestedTimezone: timeZone,
      source: "app_time_punch_form",
    },
    notes: notes || null,
    occurredAt: safeOccurredAt,
    organizationId,
    punchType,
  });

  if (!result.ok) {
    redirectWithError(result.error, safeRequestedLocalDateTime.date);
  }

  redirect(
    getTimeStatusPath(
      organizationId,
      punchType === "clock_in" ? "clock-in-created" : "clock-out-created",
      safeRequestedLocalDateTime.date,
    ),
  );
}

export async function submitOwnTimeCorrectionFromForm(formData: FormData) {
  const organizationId = getFormString(formData, "organizationId");
  const timeRecordId = getFormString(formData, "timeRecordId");
  const timePunchId = getFormString(formData, "timePunchId");
  const correctionType = getFormString(formData, "correctionType");
  const punchType = getFormString(formData, "punchType");
  const occurredAtLocalValue = getFormString(formData, "occurredAtLocal");
  const correctionNote = getFormString(formData, "correctionNote");
  const reason = getFormString(formData, "reason");
  const weekStart = getRedirectWeekStart(formData);
  const redirectWithError = (code: string): never => {
    redirect(getTimeErrorPath(organizationId || null, code, weekStart));
  };

  if (!organizationId) {
    redirectWithError("organization_required");
  }

  if (!isPostgresUuid(organizationId)) {
    redirectWithError("invalid_organization");
  }

  if (!isPostgresUuid(timeRecordId)) {
    redirectWithError("invalid_time_record");
  }

  const normalizedCorrectionType = isAppTimeCorrectionType(correctionType)
    ? correctionType
    : null;

  if (!normalizedCorrectionType) {
    redirectWithError("invalid_correction_type");
  }

  const safeCorrectionType =
    normalizedCorrectionType ?? redirectWithError("invalid_correction_type");

  if (!reason) {
    redirectWithError("invalid_reason");
  }

  const requiresPunch =
    safeCorrectionType === "punch_update" ||
    safeCorrectionType === "punch_void";
  const requiresLocalDateTime =
    safeCorrectionType === "punch_add" ||
    safeCorrectionType === "punch_update";

  if (requiresPunch && !isPostgresUuid(timePunchId)) {
    redirectWithError("invalid_time_punch");
  }

  if (!requiresPunch && timePunchId) {
    redirectWithError("invalid_correction");
  }

  const parsedLocalDateTime = requiresLocalDateTime
    ? parseLocalDateTime(occurredAtLocalValue)
    : null;

  if (requiresLocalDateTime && !parsedLocalDateTime) {
    redirectWithError("invalid_timestamp");
  }

  const normalizedPunchType =
    safeCorrectionType === "punch_add" && isTimePunchType(punchType)
      ? punchType
      : null;

  if (safeCorrectionType === "punch_add" && !normalizedPunchType) {
    redirectWithError("invalid_punch_type");
  }

  if (
    safeCorrectionType === "record_update" &&
    (!correctionNote || correctionNote.length > MAX_CORRECTION_NOTE_LENGTH)
  ) {
    redirectWithError("invalid_correction");
  }

  const context = await resolveOwnCorrectionContext(organizationId);

  if (!context.ok) {
    redirectWithError(context.error);
  }

  const ownContext = context.ok
    ? context.data
    : redirectWithError(context.error);

  const { data: record, error: recordError } = await ownContext.supabase
    .from("time_records")
    .select(
      "id, local_work_date, timezone, center_id, schedule_block_id, schedule_block_assignment_id, planned_start_at, planned_end_at, status",
    )
    .eq("id", timeRecordId)
    .eq("organization_id", ownContext.organizationId)
    .eq("person_profile_id", ownContext.personProfileId)
    .maybeSingle();

  if (recordError) {
    redirectWithError("load_failed");
  }

  if (!record) {
    redirectWithError("invalid_time_record");
  }

  const timeRecord = record ?? redirectWithError("invalid_time_record");
  let punch: CorrectionPunch | null = null;

  if (requiresPunch) {
    const { data: punchResult, error: punchError } = await ownContext.supabase
      .from("time_punches")
      .select(
        "id, occurred_at, punch_type, timezone, center_id, schedule_block_id, schedule_block_assignment_id, status, notes",
      )
      .eq("id", timePunchId)
      .eq("time_record_id", timeRecord.id)
      .eq("organization_id", ownContext.organizationId)
      .eq("person_profile_id", ownContext.personProfileId)
      .maybeSingle();

    if (punchError) {
      redirectWithError("load_failed");
    }

    if (!punchResult) {
      redirectWithError("invalid_time_punch");
    }

    punch = punchResult;
  }

  const correctionInput = {
    afterSnapshot: getAfterSnapshot({
      correctionNote,
      correctionType: safeCorrectionType,
      occurredAtLocal: parsedLocalDateTime,
      punch,
      punchType: normalizedPunchType,
      record: timeRecord,
    }),
    beforeSnapshot: getBeforeSnapshot({
      punch,
      record: timeRecord,
    }),
    correctionType: safeCorrectionType,
    metadata: {
      schemaVersion: CORRECTION_SNAPSHOT_VERSION,
      source: "app_time_correction_form",
    },
    organizationId,
    reason,
    timePunchId: punch?.id ?? null,
    timeRecordId: timeRecord.id,
  };

  const timeTrackingSettings = resolveOrganizationTimeTrackingSettings(
    ownContext.organization.time_tracking_config,
  );
  const result = timeTrackingSettings.correctionApprovalRequired
    ? await requestOwnTimeCorrectionAction(correctionInput)
    : await createAndApplyOwnTimeCorrectionAction(correctionInput);

  if (!result.ok) {
    redirectWithError(result.error);
  }

  redirect(
    getTimeStatusPath(
      organizationId,
      timeTrackingSettings.correctionApprovalRequired
        ? "correction-requested"
        : "correction-applied-direct",
      weekStart,
    ),
  );
}

export async function reviewTimeCorrectionFromForm(formData: FormData) {
  const organizationId = getFormString(formData, "organizationId");
  const correctionId = getFormString(formData, "correctionId");
  const decision = getFormString(formData, "decision");
  const reviewNote = getFormString(formData, "reviewNote");

  if (!organizationId) {
    redirect(getTimeErrorPath(null, "organization_required"));
  }

  if (!isPostgresUuid(organizationId)) {
    redirect(getTimeErrorPath(organizationId, "invalid_organization"));
  }

  if (!isPostgresUuid(correctionId)) {
    redirect(getTimeErrorPath(organizationId, "invalid_correction"));
  }

  if (!isTimeCorrectionReviewDecision(decision)) {
    redirect(getTimeErrorPath(organizationId, "invalid_correction_decision"));
  }

  if (decision === "rejected" && !reviewNote) {
    redirect(getTimeErrorPath(organizationId, "invalid_notes"));
  }

  const result = await reviewTimeCorrectionAction({
    correctionId,
    decision,
    organizationId,
    reviewNote: reviewNote || null,
  });

  if (!result.ok) {
    redirect(getTimeErrorPath(organizationId, result.error));
  }

  redirect(
    getTimeStatusPath(
      organizationId,
      decision === "approved" ? "correction-approved" : "correction-rejected",
    ),
  );
}

export async function applyTimeCorrectionFromForm(formData: FormData) {
  const organizationId = getFormString(formData, "organizationId");
  const correctionId = getFormString(formData, "correctionId");

  if (!organizationId) {
    redirect(getTimeErrorPath(null, "organization_required"));
  }

  if (!isPostgresUuid(organizationId)) {
    redirect(getTimeErrorPath(organizationId, "invalid_organization"));
  }

  if (!isPostgresUuid(correctionId)) {
    redirect(getTimeErrorPath(organizationId, "invalid_correction"));
  }

  const result = await applyTimeCorrectionAction({
    correctionId,
    organizationId,
  });

  if (!result.ok) {
    redirect(getTimeErrorPath(organizationId, result.error));
  }

  redirect(getTimeStatusPath(organizationId, "correction-applied"));
}

export async function detectOvertimeCandidatesFromForm(formData: FormData) {
  const organizationId = getFormString(formData, "organizationId");
  const weekStart = getRedirectWeekStart(formData);
  const redirectWithError = (code: string): never => {
    redirect(getTimeErrorPath(organizationId || null, code, weekStart));
  };

  if (!organizationId) {
    redirectWithError("organization_required");
  }

  if (!isPostgresUuid(organizationId)) {
    redirectWithError("invalid_organization");
  }

  if (!weekStart) {
    redirectWithError("invalid_date");
  }

  const periodEndDate = addDaysToDateInput(
    weekStart ?? redirectWithError("invalid_date"),
    6,
  );

  if (!periodEndDate) {
    redirectWithError("invalid_date");
  }

  const result = await detectOperationalOvertimeCandidates({
    organizationId,
    periodEndDate: periodEndDate ?? redirectWithError("invalid_date"),
    periodStartDate: weekStart ?? redirectWithError("invalid_date"),
  });

  if (!result.ok) {
    redirectWithError(`overtime_detection_${result.error.replaceAll("-", "_")}`);
  }

  const detectionSummary = result.ok
    ? result.data
    : redirectWithError("overtime_detection_save_failed");

  redirect(
    getTimePath({
      organizationId,
      overtimeCreated: detectionSummary.created,
      overtimeExisting: detectionSummary.existing,
      overtimeIgnored: detectionSummary.ignoredInsufficientData,
      status: "overtime-detection-complete",
      week: weekStart,
    }),
  );
}

export async function setOvertimeCandidateStatusFromForm(formData: FormData) {
  const organizationId = getFormString(formData, "organizationId");
  const candidateId = getFormString(formData, "candidateId");
  const status = getFormString(formData, "overtimeCandidateStatus");
  const weekStart = getRedirectWeekStart(formData);
  const redirectWithError = (code: string): never => {
    redirect(getTimeErrorPath(organizationId || null, code, weekStart));
  };

  if (!organizationId) {
    redirectWithError("organization_required");
  }

  if (!isPostgresUuid(organizationId)) {
    redirectWithError("invalid_organization");
  }

  if (!isPostgresUuid(candidateId)) {
    redirectWithError("invalid_overtime_candidate");
  }

  if (!isOvertimeCandidateReviewStatus(status)) {
    redirectWithError("invalid_overtime_candidate_status");
  }

  const result = await setOvertimeCandidateStatus({
    candidateId,
    organizationId,
    status,
  });

  if (!result.ok) {
    redirectWithError(`overtime_${result.error.replaceAll("-", "_")}`);
  }

  redirect(
    getTimeStatusPath(
      organizationId,
      "overtime-candidate-updated",
      weekStart,
    ),
  );
}
