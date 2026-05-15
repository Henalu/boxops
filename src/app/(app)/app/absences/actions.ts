"use server";

import { redirect } from "next/navigation";

import {
  ABSENCE_REQUEST_TYPES,
  cancelOwnAbsenceRequest,
  createOwnAbsenceRequest,
  expireAbsenceRequest,
  reviewAbsenceRequest,
  type AbsenceRequestType,
  type AbsenceRequestErrorCode,
} from "@/lib/absence-requests";
import {
  canManageAbsenceRequests,
  canUseAbsenceSelfService,
} from "@/lib/auth/permissions";
import {
  getActiveMemberships,
  getAuthenticatedUser,
  resolveActiveOrganization,
} from "@/lib/auth/tenant";
import { getAbsencesPath } from "@/lib/navigation/app-paths";
import { isPostgresUuid } from "@/lib/uuid";

type AbsencesActionContext = {
  canManage: boolean;
  canUseSelfService: boolean;
  organizationId: string;
  timezone: string;
};

const CREATION_ABSENCE_TYPES = new Set<AbsenceRequestType>([
  ...ABSENCE_REQUEST_TYPES,
]);
const MAX_REASON_SUMMARY_LENGTH = 160;
const MAX_ABSENCE_DURATION_MS = 366 * 24 * 60 * 60 * 1000;
const DATETIME_LOCAL_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;
const SENSITIVE_REASON_PATTERN =
  /\b(salud|diagnostic[a-z]*|medic[a-z]*|baja medica|justificante[a-z]*|document[a-z]*|familia[a-z]*|sancion[a-z]*|sanciones|salario[a-z]*|payroll|ubicacion|geolocalizacion|token[a-z]*|fingerprint|ip)\b/;
const URL_REASON_PATTERN = /\b(https?:\/\/|www\.)\S+/i;
const IPV4_REASON_PATTERN = /\b(?:\d{1,3}\.){3}\d{1,3}\b/;

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

function normalizeSensitiveScanValue(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function hasSensitiveReasonSignal(value: string) {
  if (!value) {
    return false;
  }

  const normalizedValue = normalizeSensitiveScanValue(value);

  return (
    SENSITIVE_REASON_PATTERN.test(normalizedValue) ||
    URL_REASON_PATTERN.test(value) ||
    IPV4_REASON_PATTERN.test(value)
  );
}

function getAbsencesErrorPath(organizationId: string | null, error: string) {
  return getAbsencesPath({
    error,
    organizationId,
  });
}

function getAbsencesStatusPath(organizationId: string, status: string) {
  return getAbsencesPath({
    organizationId,
    status,
  });
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
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value]),
  );

  return {
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    month: Number(parts.month),
    second: Number(parts.second),
    year: Number(parts.year),
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

function parseDateTimeLocalInTimeZone({
  timeZone,
  value,
}: {
  timeZone: string;
  value: string;
}) {
  const match = DATETIME_LOCAL_PATTERN.exec(value);

  if (!match) {
    return null;
  }

  const [, year, month, day, hour, minute, second = "00"] = match;
  const expected = {
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute),
    month: Number(month),
    second: Number(second),
    year: Number(year),
  };
  const utcWallTime = Date.UTC(
    expected.year,
    expected.month - 1,
    expected.day,
    expected.hour,
    expected.minute,
    expected.second,
  );

  if (
    expected.month < 1 ||
    expected.month > 12 ||
    expected.day < 1 ||
    expected.day > 31 ||
    expected.hour > 23 ||
    expected.minute > 59 ||
    expected.second > 59 ||
    Number.isNaN(utcWallTime)
  ) {
    return null;
  }

  let instant = new Date(
    utcWallTime - getTimeZoneOffsetMs(timeZone, new Date(utcWallTime)),
  );
  instant = new Date(utcWallTime - getTimeZoneOffsetMs(timeZone, instant));

  const actual = getDatePartsInTimeZone(instant, timeZone);

  if (
    actual.year !== expected.year ||
    actual.month !== expected.month ||
    actual.day !== expected.day ||
    actual.hour !== expected.hour ||
    actual.minute !== expected.minute ||
    actual.second !== expected.second
  ) {
    return null;
  }

  return instant;
}

async function resolveAbsencesActionContext(organizationId: string): Promise<
  | {
      data: AbsencesActionContext;
      ok: true;
    }
  | {
      error: AbsenceRequestErrorCode;
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

  return {
    data: {
      canManage: canManageAbsenceRequests(resolution.membership.role),
      canUseSelfService: canUseAbsenceSelfService(resolution.membership.role),
      organizationId: resolution.organization.id,
      timezone: resolution.organization.timezone,
    },
    ok: true,
  };
}

async function getValidatedContext(formData: FormData) {
  const organizationId = getFormString(formData, "organizationId");

  if (!organizationId) {
    redirect(getAbsencesErrorPath(null, "organization-required"));
  }

  if (!isPostgresUuid(organizationId)) {
    redirect(getAbsencesErrorPath(organizationId, "invalid-organization"));
  }

  const context = await resolveAbsencesActionContext(organizationId);

  if (!context.ok) {
    redirect(getAbsencesErrorPath(organizationId, context.error));
  }

  return context.data;
}

function getValidatedAbsenceRequestId({
  context,
  formData,
}: {
  context: AbsencesActionContext;
  formData: FormData;
}) {
  const value = getFormString(formData, "absenceRequestId");

  if (!isPostgresUuid(value)) {
    redirect(
      getAbsencesErrorPath(context.organizationId, "invalid-absence-request"),
    );
  }

  return value;
}

async function ensureManagementContext(formData: FormData) {
  const context = await getValidatedContext(formData);

  if (!context.canManage) {
    redirect(getAbsencesErrorPath(context.organizationId, "forbidden"));
  }

  return context;
}

async function runManagementReview(
  formData: FormData,
  decision: "approved" | "rejected",
) {
  const context = await ensureManagementContext(formData);
  const absenceRequestId = getValidatedAbsenceRequestId({
    context,
    formData,
  });
  const result = await reviewAbsenceRequest({
    absenceRequestId,
    decision,
    organizationId: context.organizationId,
  });

  if (!result.ok) {
    redirect(getAbsencesErrorPath(context.organizationId, result.error));
  }

  redirect(
    getAbsencesStatusPath(
      context.organizationId,
      decision === "approved" ? "absence-approved" : "absence-rejected",
    ),
  );
}

function normalizeRequiredDateTimeLocal({
  context,
  value,
}: {
  context: AbsencesActionContext;
  value: string;
}) {
  if (!value) {
    redirect(getAbsencesErrorPath(context.organizationId, "invalid-timestamp"));
  }

  try {
    const parsed = parseDateTimeLocalInTimeZone({
      timeZone: context.timezone,
      value,
    });

    if (parsed) {
      return parsed;
    }
  } catch {
    redirect(getAbsencesErrorPath(context.organizationId, "invalid-timezone"));
  }

  redirect(getAbsencesErrorPath(context.organizationId, "invalid-timestamp"));
}

function ensureSensitiveSummaryConfirmation({
  context,
  formData,
}: {
  context: AbsencesActionContext;
  formData: FormData;
}) {
  if (getFormString(formData, "sensitiveSummaryConfirmation") !== "on") {
    redirect(
      getAbsencesErrorPath(context.organizationId, "confirmation-required"),
    );
  }
}

export async function createOwnAbsenceRequestFromForm(formData: FormData) {
  const context = await getValidatedContext(formData);

  if (!context.canUseSelfService) {
    redirect(getAbsencesErrorPath(context.organizationId, "forbidden"));
  }

  ensureSensitiveSummaryConfirmation({
    context,
    formData,
  });

  const absenceType = getFormString(formData, "absenceType");
  const startsAt = normalizeRequiredDateTimeLocal({
    context,
    value: getFormString(formData, "startsAt"),
  });
  const endsAt = normalizeRequiredDateTimeLocal({
    context,
    value: getFormString(formData, "endsAt"),
  });
  const reasonSummary = getFormString(formData, "reasonSummary");

  if (!CREATION_ABSENCE_TYPES.has(absenceType as AbsenceRequestType)) {
    redirect(
      getAbsencesErrorPath(context.organizationId, "invalid-absence-type"),
    );
  }

  if (
    endsAt.getTime() <= startsAt.getTime() ||
    endsAt.getTime() > startsAt.getTime() + MAX_ABSENCE_DURATION_MS
  ) {
    redirect(
      getAbsencesErrorPath(context.organizationId, "date-range-invalid"),
    );
  }

  if (reasonSummary.length > MAX_REASON_SUMMARY_LENGTH) {
    redirect(
      getAbsencesErrorPath(context.organizationId, "invalid-reason-summary"),
    );
  }

  if (hasSensitiveReasonSignal(reasonSummary)) {
    redirect(getAbsencesErrorPath(context.organizationId, "sensitive-summary"));
  }

  const result = await createOwnAbsenceRequest({
    absenceType,
    allDay: getFormString(formData, "allDay") === "on",
    endsAt,
    organizationId: context.organizationId,
    reasonSummary,
    startsAt,
    timezone: context.timezone,
  });

  if (!result.ok) {
    redirect(getAbsencesErrorPath(context.organizationId, result.error));
  }

  redirect(
    getAbsencesStatusPath(
      context.organizationId,
      `absence-created-${result.data.status}`,
    ),
  );
}

export async function cancelOwnAbsenceRequestFromForm(formData: FormData) {
  const context = await getValidatedContext(formData);

  if (!context.canUseSelfService) {
    redirect(getAbsencesErrorPath(context.organizationId, "forbidden"));
  }

  const absenceRequestId = getValidatedAbsenceRequestId({
    context,
    formData,
  });
  const result = await cancelOwnAbsenceRequest({
    absenceRequestId,
    organizationId: context.organizationId,
  });

  if (!result.ok) {
    redirect(getAbsencesErrorPath(context.organizationId, result.error));
  }

  redirect(getAbsencesStatusPath(context.organizationId, "absence-cancelled"));
}

export async function expireAbsenceRequestFromForm(formData: FormData) {
  const context = await getValidatedContext(formData);

  if (!context.canManage && !context.canUseSelfService) {
    redirect(getAbsencesErrorPath(context.organizationId, "forbidden"));
  }

  const absenceRequestId = getValidatedAbsenceRequestId({
    context,
    formData,
  });
  const result = await expireAbsenceRequest({
    absenceRequestId,
    organizationId: context.organizationId,
  });

  if (!result.ok) {
    redirect(getAbsencesErrorPath(context.organizationId, result.error));
  }

  redirect(getAbsencesStatusPath(context.organizationId, "absence-expired"));
}

export async function approveAbsenceRequestFromForm(formData: FormData) {
  await runManagementReview(formData, "approved");
}

export async function rejectAbsenceRequestFromForm(formData: FormData) {
  await runManagementReview(formData, "rejected");
}
