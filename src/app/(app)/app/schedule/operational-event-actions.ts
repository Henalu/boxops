"use server";

import { redirect } from "next/navigation";

import { canManageOperationalEvents } from "@/lib/auth/permissions";
import { getLoginPath } from "@/lib/auth/redirects";
import {
  getActiveMemberships,
  getAuthenticatedUser,
  resolveActiveOrganization,
} from "@/lib/auth/tenant";
import {
  createOperationalEvent,
  OPERATIONAL_EVENT_IMPACT_LEVELS,
  OPERATIONAL_EVENT_TYPES,
  OPERATIONAL_EVENT_VISIBILITIES,
  setOperationalEventStatus,
  updateOperationalEvent,
} from "@/lib/operational-events";
import { getSchedulePath } from "@/lib/navigation/app-paths";
import { isPostgresUuid } from "@/lib/uuid";

type OperationalEventActionContext = {
  organizationId: string;
  returnPath: string;
  timezone: string;
};

const EVENT_STATUSES = new Set(["active", "cancelled", "archived"]);
const DATETIME_LOCAL_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

function getScheduleErrorPath(organizationId: string | null, error: string) {
  return getSchedulePath({
    error,
    organizationId,
  });
}

function getActionResultPath({
  key,
  returnPath,
  value,
}: {
  key: "error" | "status";
  returnPath: string;
  value: string;
}) {
  const url = new URL(returnPath, "http://boxops.local");

  if (key === "error") {
    url.searchParams.delete("status");
  } else {
    url.searchParams.delete("error");
  }

  url.searchParams.set(key, value);

  return `${url.pathname}${url.search}`;
}

function getSafeReturnPath(formData: FormData, fallbackPath: string) {
  const rawReturnPath = getFormString(formData, "returnPath");

  if (!rawReturnPath) {
    return fallbackPath;
  }

  try {
    const url = new URL(rawReturnPath, "http://boxops.local");

    if (url.origin !== "http://boxops.local" || url.pathname !== "/app/schedule") {
      return fallbackPath;
    }

    return `${url.pathname}${url.search}`;
  } catch {
    return fallbackPath;
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

function parseDateInput(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
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

function normalizeTime(value: string, fallback: string) {
  if (!value) {
    return fallback;
  }

  return /^\d{2}:\d{2}$/.test(value) ? value : null;
}

function parseEventInstant({
  date,
  time,
  timezone,
}: {
  date: string;
  time: string;
  timezone: string;
}) {
  const parsedDate = parseDateInput(date);
  const parsedTime = normalizeTime(time, "00:00");

  if (!parsedDate || !parsedTime) {
    return null;
  }

  const instant = parseDateTimeLocalInTimeZone({
    timeZone: timezone,
    value: `${parsedDate}T${parsedTime}`,
  });

  if (!instant) {
    return null;
  }

  return instant;
}

async function getOperationalEventActionContext(
  formData: FormData,
): Promise<OperationalEventActionContext> {
  const organizationId = getFormString(formData, "organizationId");

  if (!organizationId) {
    redirect(getScheduleErrorPath(null, "organization-required"));
  }

  if (!isPostgresUuid(organizationId)) {
    redirect(getScheduleErrorPath(null, "invalid-organization"));
  }

  const fallbackReturnPath = getSchedulePath({
    organizationId,
    week: getFormString(formData, "weekStart") || null,
  });
  const returnPath = getSafeReturnPath(formData, fallbackReturnPath);
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect(getLoginPath(returnPath));
  }

  const memberships = await getActiveMemberships(user.id);
  const resolution = resolveActiveOrganization(memberships, organizationId);

  if (!resolution.ok) {
    redirect(getActionResultPath({ key: "error", returnPath, value: resolution.reason }));
  }

  if (!canManageOperationalEvents(resolution.membership.role)) {
    redirect(
      getActionResultPath({
        key: "error",
        returnPath,
        value: "permission-denied",
      }),
    );
  }

  return {
    organizationId: resolution.organization.id,
    returnPath,
    timezone: resolution.organization.timezone,
  };
}

function getValidatedEventId({
  context,
  formData,
}: {
  context: OperationalEventActionContext;
  formData: FormData;
}) {
  const eventId = getFormString(formData, "operationalEventId");

  if (!isPostgresUuid(eventId)) {
    redirect(
      getActionResultPath({
        key: "error",
        returnPath: context.returnPath,
        value: "invalid-event",
      }),
    );
  }

  return eventId;
}

function getValidatedEventPayload({
  context,
  formData,
}: {
  context: OperationalEventActionContext;
  formData: FormData;
}) {
  const eventType = getFormString(formData, "eventType");
  const impactLevel = getFormString(formData, "impactLevel");
  const visibility = getFormString(formData, "visibility");
  const centerId = getFormString(formData, "centerId");
  const allDay = getFormString(formData, "allDay") === "on";
  const startsOn = getFormString(formData, "startsOn");
  const endsOn = getFormString(formData, "endsOn");
  const startsAtTime = allDay ? "00:00" : getFormString(formData, "startsAtTime");
  const endsAtTime = allDay ? "23:59" : getFormString(formData, "endsAtTime");

  if (
    !OPERATIONAL_EVENT_TYPES.includes(
      eventType as (typeof OPERATIONAL_EVENT_TYPES)[number],
    )
  ) {
    redirect(
      getActionResultPath({
        key: "error",
        returnPath: context.returnPath,
        value: "invalid-event-type",
      }),
    );
  }

  if (
    !OPERATIONAL_EVENT_IMPACT_LEVELS.includes(
      impactLevel as (typeof OPERATIONAL_EVENT_IMPACT_LEVELS)[number],
    )
  ) {
    redirect(
      getActionResultPath({
        key: "error",
        returnPath: context.returnPath,
        value: "invalid-impact-level",
      }),
    );
  }

  if (
    !OPERATIONAL_EVENT_VISIBILITIES.includes(
      visibility as (typeof OPERATIONAL_EVENT_VISIBILITIES)[number],
    )
  ) {
    redirect(
      getActionResultPath({
        key: "error",
        returnPath: context.returnPath,
        value: "invalid-visibility",
      }),
    );
  }

  if (centerId && !isPostgresUuid(centerId)) {
    redirect(
      getActionResultPath({
        key: "error",
        returnPath: context.returnPath,
        value: "invalid-center",
      }),
    );
  }

  const startsAt = parseEventInstant({
    date: startsOn,
    time: startsAtTime,
    timezone: context.timezone,
  });
  const endsAt = endsOn
    ? parseEventInstant({
        date: endsOn,
        time: endsAtTime,
        timezone: context.timezone,
      })
    : null;

  if (!startsAt || (endsOn && !endsAt)) {
    redirect(
      getActionResultPath({
        key: "error",
        returnPath: context.returnPath,
        value: "invalid-timestamp",
      }),
    );
  }

  if (endsAt && endsAt.getTime() <= startsAt.getTime()) {
    redirect(
      getActionResultPath({
        key: "error",
        returnPath: context.returnPath,
        value: "date-range-invalid",
      }),
    );
  }

  return {
    allDay,
    centerId: centerId || null,
    endsAt,
    eventType,
    impactLevel,
    notes: getFormString(formData, "notes") || null,
    organizationId: context.organizationId,
    startsAt,
    timezone: context.timezone,
    title: getFormString(formData, "title"),
    visibility,
  };
}

export async function createOperationalEventFromForm(formData: FormData) {
  const context = await getOperationalEventActionContext(formData);
  const payload = getValidatedEventPayload({ context, formData });
  const result = await createOperationalEvent(payload);

  if (!result.ok) {
    redirect(
      getActionResultPath({
        key: "error",
        returnPath: context.returnPath,
        value: result.error,
      }),
    );
  }

  redirect(
    getActionResultPath({
      key: "status",
      returnPath: context.returnPath,
      value: "operational-event-created",
    }),
  );
}

export async function updateOperationalEventFromForm(formData: FormData) {
  const context = await getOperationalEventActionContext(formData);
  const eventId = getValidatedEventId({ context, formData });
  const payload = getValidatedEventPayload({ context, formData });
  const result = await updateOperationalEvent({
    ...payload,
    eventId,
  });

  if (!result.ok) {
    redirect(
      getActionResultPath({
        key: "error",
        returnPath: context.returnPath,
        value: result.error,
      }),
    );
  }

  redirect(
    getActionResultPath({
      key: "status",
      returnPath: context.returnPath,
      value: "operational-event-updated",
    }),
  );
}

export async function setOperationalEventStatusFromForm(formData: FormData) {
  const context = await getOperationalEventActionContext(formData);
  const eventId = getValidatedEventId({ context, formData });
  const status = getFormString(formData, "eventStatus");

  if (!EVENT_STATUSES.has(status)) {
    redirect(
      getActionResultPath({
        key: "error",
        returnPath: context.returnPath,
        value: "invalid-status",
      }),
    );
  }

  const result = await setOperationalEventStatus({
    eventId,
    organizationId: context.organizationId,
    status,
  });

  if (!result.ok) {
    redirect(
      getActionResultPath({
        key: "error",
        returnPath: context.returnPath,
        value: result.error,
      }),
    );
  }

  redirect(
    getActionResultPath({
      key: "status",
      returnPath: context.returnPath,
      value:
        status === "cancelled"
          ? "operational-event-cancelled"
          : status === "archived"
            ? "operational-event-archived"
            : "operational-event-reactivated",
    }),
  );
}
