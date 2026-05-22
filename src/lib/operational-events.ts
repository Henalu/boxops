import {
  canManageOperationalEvents,
  canReadOperationalEvents,
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

export const OPERATIONAL_EVENT_TYPES = [
  "holiday",
  "closure",
  "competition",
  "seminar",
  "open_day",
  "internal_event",
  "external_event",
  "maintenance",
  "community_event",
] as const;
export const OPERATIONAL_EVENT_STATUSES = [
  "active",
  "cancelled",
  "archived",
] as const;
export const OPERATIONAL_EVENT_VISIBILITIES = [
  "management",
  "staff",
  "all_staff",
] as const;
export const OPERATIONAL_EVENT_IMPACT_LEVELS = [
  "context_only",
  "schedule_review_needed",
  "coverage_review_needed",
  "staffing_needed",
] as const;

export type OperationalEventType =
  (typeof OPERATIONAL_EVENT_TYPES)[number];
export type OperationalEventStatus =
  (typeof OPERATIONAL_EVENT_STATUSES)[number];
export type OperationalEventVisibility =
  (typeof OPERATIONAL_EVENT_VISIBILITIES)[number];
export type OperationalEventImpactLevel =
  (typeof OPERATIONAL_EVENT_IMPACT_LEVELS)[number];

export type OperationalEventRow = Tables<"operational_events">;

export type OperationalEventErrorCode =
  | "authentication-required"
  | "date-range-invalid"
  | "forbidden"
  | "invalid-center"
  | "invalid-event"
  | "invalid-event-type"
  | "invalid-impact-level"
  | "invalid-input"
  | "invalid-limit"
  | "invalid-notes"
  | "invalid-organization"
  | "invalid-status"
  | "invalid-timezone"
  | "invalid-timestamp"
  | "invalid-title"
  | "invalid-visibility"
  | "load-failed"
  | "no-active-memberships"
  | "not-actionable"
  | "not-found"
  | "organization-not-found"
  | "organization-required"
  | "permission-denied"
  | "save-failed";

export type OperationalEventResult<T> =
  | {
      data: T;
      ok: true;
    }
  | {
      error: OperationalEventErrorCode;
      ok: false;
    };

export type ListOperationalEventsInput = {
  centerId?: string | null;
  eventTypes?: readonly (OperationalEventType | string)[] | null;
  includeArchived?: boolean | null;
  limit?: number | null;
  organizationId: string;
  rangeEnd?: Date | string | null;
  rangeStart?: Date | string | null;
  statuses?: readonly (OperationalEventStatus | string)[] | null;
  visibilities?: readonly (OperationalEventVisibility | string)[] | null;
};

export type CreateOperationalEventInput = {
  allDay?: boolean | null;
  centerId?: string | null;
  endsAt?: Date | string | null;
  eventType: OperationalEventType | string;
  impactLevel?: OperationalEventImpactLevel | string | null;
  notes?: string | null;
  organizationId: string;
  startsAt: Date | string;
  timezone?: string | null;
  title: string;
  visibility?: OperationalEventVisibility | string | null;
};

export type UpdateOperationalEventInput = {
  allDay?: boolean | null;
  centerId?: string | null;
  endsAt?: Date | string | null;
  eventId: string;
  eventType?: OperationalEventType | string | null;
  impactLevel?: OperationalEventImpactLevel | string | null;
  notes?: string | null;
  organizationId: string;
  startsAt?: Date | string | null;
  timezone?: string | null;
  title?: string | null;
  visibility?: OperationalEventVisibility | string | null;
};

export type SetOperationalEventStatusInput = {
  eventId: string;
  organizationId: string;
  status: OperationalEventStatus | string;
};

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
type ValidationResult<T> =
  | {
      ok: true;
      value: T;
    }
  | {
      error: OperationalEventErrorCode;
      ok: false;
    };
type OperationalEventContext = {
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
  neq(column: string, value: unknown): UntypedSelectQuery<T>;
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
type UntypedOperationalEventsClient = {
  from(table: string): UntypedTableBuilder;
  rpc<T>(
    fn: string,
    args?: Record<string, unknown>,
  ): Promise<QueryResponse<T>>;
};

const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 200;
const MAX_TITLE_LENGTH = 120;
const MAX_NOTES_LENGTH = 500;
const MAX_TIMEZONE_LENGTH = 80;
const MAX_EVENT_DAYS = 366;
const ISO_TIMESTAMP_WITH_OFFSET_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:\d{2})$/;
const FORBIDDEN_TEXT_PATTERN =
  /(https?:\/\/|www[.]|data:|base64|token|secret|password|credential|signed-url|signed_url|storage\/v1|document|documento|archivo|justificante|payroll|salary|salario|nomina|iban|bank|dni|nif|ssn|national_id|geolocation|gps|latitude|longitude|coordinate|ubicacion|location|\bip\b|fingerprint|baja|salud|health|medical|medic|diagnostic|diagnostico|sick|illness|familia|familiar|sancion|disciplin)/i;
const FORBIDDEN_TITLE_PATTERN =
  /(https?:\/\/|www[.]|data:|base64|token|secret|password|credential|signed-url|signed_url|storage\/v1)/i;

function success<T>(data: T): OperationalEventResult<T> {
  return {
    data,
    ok: true,
  };
}

function failure(
  error: OperationalEventErrorCode,
): OperationalEventResult<never> {
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
  error: OperationalEventErrorCode,
): ValidationResult<never> {
  return {
    error,
    ok: false,
  };
}

function getOperationalEventsClient(
  supabase: SupabaseServerClient,
): UntypedOperationalEventsClient {
  return supabase as unknown as UntypedOperationalEventsClient;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(value: object, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function normalizeRequiredUuid(
  value: unknown,
  error: OperationalEventErrorCode,
): ValidationResult<string> {
  if (typeof value !== "string") {
    return invalid(error);
  }

  const trimmed = value.trim();

  return isPostgresUuid(trimmed) ? valid(trimmed) : invalid(error);
}

function normalizeOptionalUuid(
  value: unknown,
  error: OperationalEventErrorCode,
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

function normalizeOptionalBoolean(
  value: unknown,
): ValidationResult<boolean | null> {
  if (value === undefined || value === null) {
    return valid(null);
  }

  return typeof value === "boolean" ? valid(value) : invalid("invalid-input");
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

function normalizeTitle(value: unknown): ValidationResult<string> {
  if (typeof value !== "string") {
    return invalid("invalid-title");
  }

  const trimmed = value.trim();

  if (
    !trimmed ||
    trimmed.length > MAX_TITLE_LENGTH ||
    FORBIDDEN_TITLE_PATTERN.test(trimmed)
  ) {
    return invalid("invalid-title");
  }

  return valid(trimmed);
}

function normalizeOptionalNotes(
  value: unknown,
): ValidationResult<string | null> {
  if (value === undefined || value === null || value === "") {
    return valid(null);
  }

  if (typeof value !== "string") {
    return invalid("invalid-notes");
  }

  const trimmed = value.trim();

  if (
    !trimmed ||
    trimmed.length > MAX_NOTES_LENGTH ||
    FORBIDDEN_TEXT_PATTERN.test(trimmed)
  ) {
    return invalid("invalid-notes");
  }

  return valid(trimmed);
}

function normalizeTimezone(
  value: unknown,
  fallbackTimezone: string,
): ValidationResult<string> {
  if (value === undefined || value === null || value === "") {
    return valid(fallbackTimezone);
  }

  if (typeof value !== "string") {
    return invalid("invalid-timezone");
  }

  const trimmed = value.trim();

  if (!trimmed || trimmed.length > MAX_TIMEZONE_LENGTH) {
    return invalid("invalid-timezone");
  }

  return valid(trimmed);
}

function isOperationalEventType(
  value: unknown,
): value is OperationalEventType {
  return OPERATIONAL_EVENT_TYPES.includes(value as OperationalEventType);
}

function isOperationalEventStatus(
  value: unknown,
): value is OperationalEventStatus {
  return OPERATIONAL_EVENT_STATUSES.includes(value as OperationalEventStatus);
}

function isOperationalEventVisibility(
  value: unknown,
): value is OperationalEventVisibility {
  return OPERATIONAL_EVENT_VISIBILITIES.includes(
    value as OperationalEventVisibility,
  );
}

function isOperationalEventImpactLevel(
  value: unknown,
): value is OperationalEventImpactLevel {
  return OPERATIONAL_EVENT_IMPACT_LEVELS.includes(
    value as OperationalEventImpactLevel,
  );
}

function normalizeOperationalEventType(
  value: unknown,
): ValidationResult<OperationalEventType> {
  if (typeof value !== "string") {
    return invalid("invalid-event-type");
  }

  const normalized = value.trim().toLowerCase();

  return isOperationalEventType(normalized)
    ? valid(normalized)
    : invalid("invalid-event-type");
}

function normalizeOperationalEventStatus(
  value: unknown,
): ValidationResult<OperationalEventStatus> {
  if (typeof value !== "string") {
    return invalid("invalid-status");
  }

  const normalized = value.trim().toLowerCase();

  return isOperationalEventStatus(normalized)
    ? valid(normalized)
    : invalid("invalid-status");
}

function normalizeOperationalEventVisibility(
  value: unknown,
  fallback: OperationalEventVisibility,
): ValidationResult<OperationalEventVisibility> {
  if (value === undefined || value === null || value === "") {
    return valid(fallback);
  }

  if (typeof value !== "string") {
    return invalid("invalid-visibility");
  }

  const normalized = value.trim().toLowerCase();

  return isOperationalEventVisibility(normalized)
    ? valid(normalized)
    : invalid("invalid-visibility");
}

function normalizeOperationalEventImpactLevel(
  value: unknown,
  fallback: OperationalEventImpactLevel,
): ValidationResult<OperationalEventImpactLevel> {
  if (value === undefined || value === null || value === "") {
    return valid(fallback);
  }

  if (typeof value !== "string") {
    return invalid("invalid-impact-level");
  }

  const normalized = value.trim().toLowerCase();

  return isOperationalEventImpactLevel(normalized)
    ? valid(normalized)
    : invalid("invalid-impact-level");
}

function normalizeStringList<T extends string>({
  error,
  isAllowed,
  values,
}: {
  error: OperationalEventErrorCode;
  isAllowed: (value: string) => value is T;
  values: readonly (T | string)[] | null | undefined;
}): ValidationResult<T[]> {
  if (!values || values.length === 0) {
    return valid([]);
  }

  const normalizedValues = new Set<T>();

  for (const value of values) {
    if (typeof value !== "string") {
      return invalid(error);
    }

    const normalized = value.trim().toLowerCase();

    if (!isAllowed(normalized)) {
      return invalid(error);
    }

    normalizedValues.add(normalized);
  }

  return valid([...normalizedValues]);
}

function validateTimeRange({
  endsAt,
  startsAt,
}: {
  endsAt: string | null;
  startsAt: string;
}): OperationalEventErrorCode | null {
  if (!endsAt) {
    return null;
  }

  const startsAtMs = new Date(startsAt).getTime();
  const endsAtMs = new Date(endsAt).getTime();
  const rangeDays = (endsAtMs - startsAtMs) / (24 * 60 * 60 * 1000);

  if (endsAtMs <= startsAtMs || rangeDays > MAX_EVENT_DAYS) {
    return "date-range-invalid";
  }

  return null;
}

function mapResolutionReason(
  reason: "no_active_memberships" | "organization_not_found" | "organization_required",
): OperationalEventErrorCode {
  if (reason === "no_active_memberships") {
    return "no-active-memberships";
  }

  if (reason === "organization_not_found") {
    return "organization-not-found";
  }

  return "organization-required";
}

export function mapOperationalEventDatabaseError(
  error: DatabaseErrorLike,
  fallback: OperationalEventErrorCode = "save-failed",
): OperationalEventErrorCode {
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

  if (message.includes("title")) {
    return "invalid-title";
  }

  if (message.includes("notes")) {
    return "invalid-notes";
  }

  if (message.includes("timezone")) {
    return "invalid-timezone";
  }

  if (message.includes("center")) {
    return "invalid-center";
  }

  if (message.includes("type")) {
    return "invalid-event-type";
  }

  if (message.includes("visibility")) {
    return "invalid-visibility";
  }

  if (message.includes("impact")) {
    return "invalid-impact-level";
  }

  if (message.includes("time range")) {
    return "date-range-invalid";
  }

  if (
    message.includes("not found") ||
    message.includes("was not found in tenant")
  ) {
    return "not-found";
  }

  if (
    message.includes("archived") ||
    message.includes("cannot be edited") ||
    message.includes("cannot be reopened")
  ) {
    return "not-actionable";
  }

  return fallback;
}

async function resolveOperationalEventContext({
  organizationId,
  requireManagement = false,
}: {
  organizationId: unknown;
  requireManagement?: boolean;
}): Promise<OperationalEventResult<OperationalEventContext>> {
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

  if (!canReadOperationalEvents(resolution.membership.role)) {
    return failure("forbidden");
  }

  if (
    requireManagement &&
    !canManageOperationalEvents(resolution.membership.role)
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
  input: ListOperationalEventsInput,
): ValidationResult<{
  centerId: string | null;
  eventTypes: OperationalEventType[];
  includeArchived: boolean;
  limit: number;
  organizationId: string;
  rangeEnd: string | null;
  rangeStart: string | null;
  statuses: OperationalEventStatus[];
  visibilities: OperationalEventVisibility[];
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

  const centerId = normalizeOptionalUuid(input.centerId, "invalid-center");

  if (!centerId.ok) {
    return centerId;
  }

  const rangeStart = normalizeOptionalTimestamp(input.rangeStart);

  if (!rangeStart.ok) {
    return rangeStart;
  }

  const rangeEnd = normalizeOptionalTimestamp(input.rangeEnd);

  if (!rangeEnd.ok) {
    return rangeEnd;
  }

  if (rangeStart.value && rangeEnd.value) {
    const rangeError = validateTimeRange({
      endsAt: rangeEnd.value,
      startsAt: rangeStart.value,
    });

    if (rangeError) {
      return invalid(rangeError);
    }
  }

  const limit = normalizeLimit(input.limit);

  if (!limit.ok) {
    return limit;
  }

  const eventTypes = normalizeStringList({
    error: "invalid-event-type",
    isAllowed: isOperationalEventType,
    values: input.eventTypes,
  });

  if (!eventTypes.ok) {
    return eventTypes;
  }

  const statuses = normalizeStringList({
    error: "invalid-status",
    isAllowed: isOperationalEventStatus,
    values: input.statuses,
  });

  if (!statuses.ok) {
    return statuses;
  }

  const visibilities = normalizeStringList({
    error: "invalid-visibility",
    isAllowed: isOperationalEventVisibility,
    values: input.visibilities,
  });

  if (!visibilities.ok) {
    return visibilities;
  }

  return valid({
    centerId: centerId.value,
    eventTypes: eventTypes.value,
    includeArchived: input.includeArchived === true,
    limit: limit.value,
    organizationId: organizationId.value,
    rangeEnd: rangeEnd.value,
    rangeStart: rangeStart.value,
    statuses: statuses.value,
    visibilities: visibilities.value,
  });
}

function validateCreateInput(
  input: CreateOperationalEventInput,
  fallbackTimezone: string,
): ValidationResult<{
  allDay: boolean;
  centerId: string | null;
  endsAt: string | null;
  eventType: OperationalEventType;
  impactLevel: OperationalEventImpactLevel;
  notes: string | null;
  organizationId: string;
  startsAt: string;
  timezone: string;
  title: string;
  visibility: OperationalEventVisibility;
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

  const centerId = normalizeOptionalUuid(input.centerId, "invalid-center");

  if (!centerId.ok) {
    return centerId;
  }

  const title = normalizeTitle(input.title);

  if (!title.ok) {
    return title;
  }

  const eventType = normalizeOperationalEventType(input.eventType);

  if (!eventType.ok) {
    return eventType;
  }

  const startsAt = normalizeRequiredTimestamp(input.startsAt);

  if (!startsAt.ok) {
    return startsAt;
  }

  const endsAt = normalizeOptionalTimestamp(input.endsAt);

  if (!endsAt.ok) {
    return endsAt;
  }

  const rangeError = validateTimeRange({
    endsAt: endsAt.value,
    startsAt: startsAt.value,
  });

  if (rangeError) {
    return invalid(rangeError);
  }

  const timezone = normalizeTimezone(input.timezone, fallbackTimezone);

  if (!timezone.ok) {
    return timezone;
  }

  const visibility = normalizeOperationalEventVisibility(
    input.visibility,
    "management",
  );

  if (!visibility.ok) {
    return visibility;
  }

  const impactLevel = normalizeOperationalEventImpactLevel(
    input.impactLevel,
    "context_only",
  );

  if (!impactLevel.ok) {
    return impactLevel;
  }

  const notes = normalizeOptionalNotes(input.notes);

  if (!notes.ok) {
    return notes;
  }

  const allDay = normalizeOptionalBoolean(input.allDay);

  if (!allDay.ok) {
    return allDay;
  }

  return valid({
    allDay: allDay.value ?? false,
    centerId: centerId.value,
    endsAt: endsAt.value,
    eventType: eventType.value,
    impactLevel: impactLevel.value,
    notes: notes.value,
    organizationId: organizationId.value,
    startsAt: startsAt.value,
    timezone: timezone.value,
    title: title.value,
    visibility: visibility.value,
  });
}

function validateOperationInput(
  input: { eventId: string; organizationId: string },
): ValidationResult<{
  eventId: string;
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

  const eventId = normalizeRequiredUuid(input.eventId, "invalid-event");

  if (!eventId.ok) {
    return eventId;
  }

  return valid({
    eventId: eventId.value,
    organizationId: organizationId.value,
  });
}

function validateUpdateInput({
  currentEvent,
  fallbackTimezone,
  input,
}: {
  currentEvent: OperationalEventRow;
  fallbackTimezone: string;
  input: UpdateOperationalEventInput;
}): ValidationResult<{
  allDay: boolean;
  centerId: string | null;
  endsAt: string | null;
  eventType: OperationalEventType;
  impactLevel: OperationalEventImpactLevel;
  notes: string | null;
  organizationId: string;
  startsAt: string;
  timezone: string;
  title: string;
  visibility: OperationalEventVisibility;
}> {
  if (!isRecord(input)) {
    return invalid("invalid-input");
  }

  const operation = validateOperationInput(input);

  if (!operation.ok) {
    return operation;
  }

  const title = normalizeTitle(
    hasOwn(input, "title") ? input.title : currentEvent.title,
  );

  if (!title.ok) {
    return title;
  }

  const eventType = normalizeOperationalEventType(
    hasOwn(input, "eventType") ? input.eventType : currentEvent.event_type,
  );

  if (!eventType.ok) {
    return eventType;
  }

  const startsAt = hasOwn(input, "startsAt")
    ? normalizeRequiredTimestamp(input.startsAt)
    : valid(currentEvent.starts_at);

  if (!startsAt.ok) {
    return startsAt;
  }

  const endsAt = hasOwn(input, "endsAt")
    ? normalizeOptionalTimestamp(input.endsAt)
    : valid(currentEvent.ends_at);

  if (!endsAt.ok) {
    return endsAt;
  }

  const rangeError = validateTimeRange({
    endsAt: endsAt.value,
    startsAt: startsAt.value,
  });

  if (rangeError) {
    return invalid(rangeError);
  }

  const timezone = normalizeTimezone(
    hasOwn(input, "timezone") ? input.timezone : currentEvent.timezone,
    fallbackTimezone,
  );

  if (!timezone.ok) {
    return timezone;
  }

  const centerId = hasOwn(input, "centerId")
    ? normalizeOptionalUuid(input.centerId, "invalid-center")
    : valid(currentEvent.center_id);

  if (!centerId.ok) {
    return centerId;
  }

  const visibility = normalizeOperationalEventVisibility(
    hasOwn(input, "visibility")
      ? input.visibility
      : currentEvent.visibility,
    "management",
  );

  if (!visibility.ok) {
    return visibility;
  }

  const impactLevel = normalizeOperationalEventImpactLevel(
    hasOwn(input, "impactLevel")
      ? input.impactLevel
      : currentEvent.impact_level,
    "context_only",
  );

  if (!impactLevel.ok) {
    return impactLevel;
  }

  const notes = hasOwn(input, "notes")
    ? normalizeOptionalNotes(input.notes)
    : valid(currentEvent.notes);

  if (!notes.ok) {
    return notes;
  }

  const allDay = normalizeOptionalBoolean(
    hasOwn(input, "allDay") ? input.allDay : currentEvent.all_day,
  );

  if (!allDay.ok) {
    return allDay;
  }

  return valid({
    allDay: allDay.value ?? false,
    centerId: centerId.value,
    endsAt: endsAt.value,
    eventType: eventType.value,
    impactLevel: impactLevel.value,
    notes: notes.value,
    organizationId: operation.value.organizationId,
    startsAt: startsAt.value,
    timezone: timezone.value,
    title: title.value,
    visibility: visibility.value,
  });
}

async function findOperationalEvent({
  context,
  eventId,
}: {
  context: OperationalEventContext;
  eventId: string;
}): Promise<OperationalEventResult<OperationalEventRow>> {
  const db = getOperationalEventsClient(context.supabase);
  const { data, error } = await db
    .from("operational_events")
    .select<OperationalEventRow>("*")
    .eq("organization_id", context.organization.id)
    .eq("id", eventId)
    .maybeSingle();

  if (error) {
    return failure(mapOperationalEventDatabaseError(error, "load-failed"));
  }

  if (!data) {
    return failure("not-found");
  }

  return success(data);
}

export async function listOperationalEvents(
  input: ListOperationalEventsInput,
): Promise<OperationalEventResult<OperationalEventRow[]>> {
  const validation = validateListInput(input);

  if (!validation.ok) {
    return failure(validation.error);
  }

  const context = await resolveOperationalEventContext({
    organizationId: validation.value.organizationId,
  });

  if (!context.ok) {
    return context;
  }

  const canManage = canManageOperationalEvents(context.data.membership.role);
  const db = getOperationalEventsClient(context.data.supabase);
  let query = db
    .from("operational_events")
    .select<OperationalEventRow>("*")
    .eq("organization_id", context.data.organization.id);

  if (validation.value.centerId) {
    query = query.eq("center_id", validation.value.centerId);
  }

  if (validation.value.eventTypes.length > 0) {
    query = query.in("event_type", validation.value.eventTypes);
  }

  if (validation.value.rangeEnd) {
    query = query.lte("starts_at", validation.value.rangeEnd);
  }

  if (validation.value.rangeStart) {
    query = query.or(
      [
        `ends_at.gte.${validation.value.rangeStart}`,
        `and(ends_at.is.null,starts_at.gte.${validation.value.rangeStart})`,
      ].join(","),
    );
  }

  if (canManage) {
    if (!validation.value.includeArchived) {
      query = query.neq("status", "archived");
    }

    if (validation.value.statuses.length > 0) {
      query = query.in("status", validation.value.statuses);
    }

    if (validation.value.visibilities.length > 0) {
      query = query.in("visibility", validation.value.visibilities);
    }
  } else {
    query = query
      .eq("status", "active")
      .in("visibility", ["staff", "all_staff"]);
  }

  const { data, error } = await query
    .order("starts_at", { ascending: true })
    .limit(validation.value.limit);

  if (error) {
    return failure(mapOperationalEventDatabaseError(error, "load-failed"));
  }

  return success(data ?? []);
}

export async function createOperationalEvent(
  input: CreateOperationalEventInput,
): Promise<OperationalEventResult<OperationalEventRow>> {
  const organizationId = isRecord(input) ? input.organizationId : undefined;
  const context = await resolveOperationalEventContext({
    organizationId,
    requireManagement: true,
  });

  if (!context.ok) {
    return context;
  }

  const validation = validateCreateInput(
    input,
    context.data.organization.timezone,
  );

  if (!validation.ok) {
    return failure(validation.error);
  }

  const db = getOperationalEventsClient(context.data.supabase);
  const { data, error } = await db.rpc<OperationalEventRow>(
    "create_operational_event",
    {
      target_all_day: validation.value.allDay,
      target_center_id: validation.value.centerId,
      target_ends_at: validation.value.endsAt,
      target_event_type: validation.value.eventType,
      target_impact_level: validation.value.impactLevel,
      target_notes: validation.value.notes,
      target_organization_id: context.data.organization.id,
      target_starts_at: validation.value.startsAt,
      target_timezone: validation.value.timezone,
      target_title: validation.value.title,
      target_visibility: validation.value.visibility,
    },
  );

  if (error || !data) {
    return failure(mapOperationalEventDatabaseError(error ?? {}, "save-failed"));
  }

  return success(data);
}

export async function updateOperationalEvent(
  input: UpdateOperationalEventInput,
): Promise<OperationalEventResult<OperationalEventRow>> {
  const operation = validateOperationInput(input);

  if (!operation.ok) {
    return failure(operation.error);
  }

  const context = await resolveOperationalEventContext({
    organizationId: operation.value.organizationId,
    requireManagement: true,
  });

  if (!context.ok) {
    return context;
  }

  const currentEvent = await findOperationalEvent({
    context: context.data,
    eventId: operation.value.eventId,
  });

  if (!currentEvent.ok) {
    return currentEvent;
  }

  const validation = validateUpdateInput({
    currentEvent: currentEvent.data,
    fallbackTimezone: context.data.organization.timezone,
    input,
  });

  if (!validation.ok) {
    return failure(validation.error);
  }

  const db = getOperationalEventsClient(context.data.supabase);
  const { data, error } = await db.rpc<OperationalEventRow>(
    "update_operational_event",
    {
      target_all_day: validation.value.allDay,
      target_center_id: validation.value.centerId,
      target_ends_at: validation.value.endsAt,
      target_event_type: validation.value.eventType,
      target_impact_level: validation.value.impactLevel,
      target_notes: validation.value.notes,
      target_operational_event_id: operation.value.eventId,
      target_organization_id: context.data.organization.id,
      target_starts_at: validation.value.startsAt,
      target_timezone: validation.value.timezone,
      target_title: validation.value.title,
      target_visibility: validation.value.visibility,
    },
  );

  if (error || !data) {
    return failure(mapOperationalEventDatabaseError(error ?? {}, "save-failed"));
  }

  return success(data);
}

export async function setOperationalEventStatus(
  input: SetOperationalEventStatusInput,
): Promise<OperationalEventResult<OperationalEventRow>> {
  const operation = validateOperationInput(input);

  if (!operation.ok) {
    return failure(operation.error);
  }

  const status = normalizeOperationalEventStatus(input.status);

  if (!status.ok) {
    return failure(status.error);
  }

  const context = await resolveOperationalEventContext({
    organizationId: operation.value.organizationId,
    requireManagement: true,
  });

  if (!context.ok) {
    return context;
  }

  const db = getOperationalEventsClient(context.data.supabase);
  const { data, error } = await db.rpc<OperationalEventRow>(
    "set_operational_event_status",
    {
      target_operational_event_id: operation.value.eventId,
      target_organization_id: context.data.organization.id,
      target_status: status.value,
    },
  );

  if (error || !data) {
    return failure(mapOperationalEventDatabaseError(error ?? {}, "save-failed"));
  }

  return success(data);
}
