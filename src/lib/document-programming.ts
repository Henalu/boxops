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

export const DOCUMENT_PROGRAMMING_ACCESS_LEVELS = [
  "read_metadata",
  "preview",
  "download",
] as const;
export const DOCUMENT_PROGRAMMING_LINK_STATUSES = [
  "active",
  "removed",
] as const;

export type DocumentProgrammingAccessLevel =
  (typeof DOCUMENT_PROGRAMMING_ACCESS_LEVELS)[number];
export type DocumentProgrammingLinkStatus =
  (typeof DOCUMENT_PROGRAMMING_LINK_STATUSES)[number];

export type DocumentProgrammingLinkRow =
  Tables<"document_programming_links">;

export type DocumentProgrammingEntry = {
  can_download: boolean;
  can_preview: boolean;
  center_id: string | null;
  class_type_id: string | null;
  created_at: string;
  document_id: string;
  document_status: string;
  document_title: string;
  document_type: string;
  document_version_id: string;
  ends_on: string;
  link_status: DocumentProgrammingLinkStatus;
  mime_type: string;
  organization_id: string;
  original_filename: string;
  programming_link_id: string;
  schedule_block_id: string | null;
  size_bytes: number;
  starts_on: string;
  updated_at: string;
  version_number: number;
  version_status: string;
};

export type DocumentProgrammingErrorCode =
  | "authentication-required"
  | "date-range-invalid"
  | "forbidden"
  | "invalid-access-level"
  | "invalid-center"
  | "invalid-class-type"
  | "invalid-document"
  | "invalid-document-version"
  | "invalid-input"
  | "invalid-limit"
  | "invalid-link"
  | "invalid-organization"
  | "invalid-schedule-block"
  | "invalid-status"
  | "load-failed"
  | "no-active-memberships"
  | "not-found"
  | "organization-not-found"
  | "organization-required"
  | "permission-denied"
  | "save-failed";

export type DocumentProgrammingResult<T> =
  | {
      data: T;
      ok: true;
    }
  | {
      error: DocumentProgrammingErrorCode;
      ok: false;
    };

export type ListDocumentProgrammingForBlockInput = {
  accessLevel?: DocumentProgrammingAccessLevel | string | null;
  limit?: number | null;
  organizationId: string;
  scheduleBlockId: string;
};

export type ListDocumentProgrammingForDateContextInput = {
  accessLevel?: DocumentProgrammingAccessLevel | string | null;
  centerId?: string | null;
  classTypeId?: string | null;
  limit?: number | null;
  organizationId: string;
  serviceDate: string;
};

export type CreateDocumentProgrammingLinkInput = {
  centerId?: string | null;
  classTypeId?: string | null;
  documentId: string;
  documentVersionId: string;
  endsOn?: string | null;
  organizationId: string;
  scheduleBlockId?: string | null;
  startsOn: string;
};

export type SetDocumentProgrammingLinkStatusInput = {
  linkId: string;
  organizationId: string;
  status: DocumentProgrammingLinkStatus | string;
};

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
type ValidationResult<T> =
  | {
      ok: true;
      value: T;
    }
  | {
      error: DocumentProgrammingErrorCode;
      ok: false;
    };
type DocumentProgrammingContext = {
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
type UntypedDocumentProgrammingClient = {
  rpc<T>(
    fn: string,
    args?: Record<string, unknown>,
  ): Promise<QueryResponse<T>>;
};

const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 200;
const MAX_RANGE_DAYS = 367;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function success<T>(data: T): DocumentProgrammingResult<T> {
  return {
    data,
    ok: true,
  };
}

function failure(
  error: DocumentProgrammingErrorCode,
): DocumentProgrammingResult<never> {
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
  error: DocumentProgrammingErrorCode,
): ValidationResult<never> {
  return {
    error,
    ok: false,
  };
}

function getDocumentProgrammingClient(
  supabase: SupabaseServerClient,
): UntypedDocumentProgrammingClient {
  return supabase as unknown as UntypedDocumentProgrammingClient;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeRequiredUuid(
  value: unknown,
  error: DocumentProgrammingErrorCode,
): ValidationResult<string> {
  if (typeof value !== "string") {
    return invalid(error);
  }

  const trimmed = value.trim();

  return isPostgresUuid(trimmed) ? valid(trimmed) : invalid(error);
}

function normalizeOptionalUuid(
  value: unknown,
  error: DocumentProgrammingErrorCode,
): ValidationResult<string | null> {
  if (value === undefined || value === null || value === "") {
    return valid(null);
  }

  return normalizeRequiredUuid(value, error);
}

function parseDateInput(
  value: unknown,
  error: DocumentProgrammingErrorCode = "date-range-invalid",
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

function isDocumentProgrammingAccessLevel(
  value: string,
): value is DocumentProgrammingAccessLevel {
  return DOCUMENT_PROGRAMMING_ACCESS_LEVELS.includes(
    value as DocumentProgrammingAccessLevel,
  );
}

function normalizeAccessLevel(
  value: unknown,
): ValidationResult<DocumentProgrammingAccessLevel> {
  if (value === undefined || value === null || value === "") {
    return valid("read_metadata");
  }

  if (typeof value !== "string") {
    return invalid("invalid-access-level");
  }

  const normalized = value.trim().toLowerCase();

  return isDocumentProgrammingAccessLevel(normalized)
    ? valid(normalized)
    : invalid("invalid-access-level");
}

function isDocumentProgrammingLinkStatus(
  value: string,
): value is DocumentProgrammingLinkStatus {
  return DOCUMENT_PROGRAMMING_LINK_STATUSES.includes(
    value as DocumentProgrammingLinkStatus,
  );
}

function normalizeStatus(
  value: unknown,
): ValidationResult<DocumentProgrammingLinkStatus> {
  if (typeof value !== "string") {
    return invalid("invalid-status");
  }

  const normalized = value.trim().toLowerCase();

  return isDocumentProgrammingLinkStatus(normalized)
    ? valid(normalized)
    : invalid("invalid-status");
}

function mapResolutionReason(
  reason: "no_active_memberships" | "organization_not_found" | "organization_required",
): DocumentProgrammingErrorCode {
  if (reason === "no_active_memberships") {
    return "no-active-memberships";
  }

  if (reason === "organization_not_found") {
    return "organization-not-found";
  }

  return "organization-required";
}

export function mapDocumentProgrammingDatabaseError(
  error: DatabaseErrorLike,
  fallback: DocumentProgrammingErrorCode = "save-failed",
): DocumentProgrammingErrorCode {
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

  if (message.includes("access level")) {
    return "invalid-access-level";
  }

  if (message.includes("date range") || message.includes("service date")) {
    return "date-range-invalid";
  }

  if (message.includes("schedule block")) {
    return "invalid-schedule-block";
  }

  if (message.includes("class type")) {
    return "invalid-class-type";
  }

  if (message.includes("center")) {
    return "invalid-center";
  }

  if (message.includes("version")) {
    return "invalid-document-version";
  }

  if (message.includes("document programming link status")) {
    return "invalid-status";
  }

  if (message.includes("document programming link")) {
    return "invalid-link";
  }

  if (message.includes("document")) {
    return "invalid-document";
  }

  if (message.includes("not found") || message.includes("was not found")) {
    return "not-found";
  }

  return fallback;
}

async function resolveDocumentProgrammingContext(
  organizationId: unknown,
): Promise<DocumentProgrammingResult<DocumentProgrammingContext>> {
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

  const supabase = await createClient();

  return success({
    membership: resolution.membership,
    organization: resolution.organization,
    supabase,
    userId: user.id,
  });
}

function validateListForBlockInput(
  input: ListDocumentProgrammingForBlockInput,
): ValidationResult<{
  accessLevel: DocumentProgrammingAccessLevel;
  limit: number;
  organizationId: string;
  scheduleBlockId: string;
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

  const scheduleBlockId = normalizeRequiredUuid(
    input.scheduleBlockId,
    "invalid-schedule-block",
  );

  if (!scheduleBlockId.ok) {
    return scheduleBlockId;
  }

  const accessLevel = normalizeAccessLevel(input.accessLevel);

  if (!accessLevel.ok) {
    return accessLevel;
  }

  const limit = normalizeLimit(input.limit);

  if (!limit.ok) {
    return limit;
  }

  return valid({
    accessLevel: accessLevel.value,
    limit: limit.value,
    organizationId: organizationId.value,
    scheduleBlockId: scheduleBlockId.value,
  });
}

function validateListForDateContextInput(
  input: ListDocumentProgrammingForDateContextInput,
): ValidationResult<{
  accessLevel: DocumentProgrammingAccessLevel;
  centerId: string | null;
  classTypeId: string | null;
  limit: number;
  organizationId: string;
  serviceDate: string;
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

  const serviceDate = parseDateInput(input.serviceDate);

  if (!serviceDate.ok) {
    return serviceDate;
  }

  const centerId = normalizeOptionalUuid(input.centerId, "invalid-center");

  if (!centerId.ok) {
    return centerId;
  }

  const classTypeId = normalizeOptionalUuid(
    input.classTypeId,
    "invalid-class-type",
  );

  if (!classTypeId.ok) {
    return classTypeId;
  }

  const accessLevel = normalizeAccessLevel(input.accessLevel);

  if (!accessLevel.ok) {
    return accessLevel;
  }

  const limit = normalizeLimit(input.limit);

  if (!limit.ok) {
    return limit;
  }

  return valid({
    accessLevel: accessLevel.value,
    centerId: centerId.value,
    classTypeId: classTypeId.value,
    limit: limit.value,
    organizationId: organizationId.value,
    serviceDate: serviceDate.value,
  });
}

function validateCreateInput(
  input: CreateDocumentProgrammingLinkInput,
): ValidationResult<{
  centerId: string | null;
  classTypeId: string | null;
  documentId: string;
  documentVersionId: string;
  endsOn: string;
  organizationId: string;
  scheduleBlockId: string | null;
  startsOn: string;
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

  const documentId = normalizeRequiredUuid(
    input.documentId,
    "invalid-document",
  );

  if (!documentId.ok) {
    return documentId;
  }

  const documentVersionId = normalizeRequiredUuid(
    input.documentVersionId,
    "invalid-document-version",
  );

  if (!documentVersionId.ok) {
    return documentVersionId;
  }

  const startsOn = parseDateInput(input.startsOn);

  if (!startsOn.ok) {
    return startsOn;
  }

  const endsOn =
    input.endsOn === undefined || input.endsOn === null || input.endsOn === ""
      ? valid(startsOn.value)
      : parseDateInput(input.endsOn);

  if (!endsOn.ok) {
    return endsOn;
  }

  const rangeDays = daysBetween(startsOn.value, endsOn.value);

  if (rangeDays < 1 || rangeDays > MAX_RANGE_DAYS) {
    return invalid("date-range-invalid");
  }

  const centerId = normalizeOptionalUuid(input.centerId, "invalid-center");

  if (!centerId.ok) {
    return centerId;
  }

  const classTypeId = normalizeOptionalUuid(
    input.classTypeId,
    "invalid-class-type",
  );

  if (!classTypeId.ok) {
    return classTypeId;
  }

  const scheduleBlockId = normalizeOptionalUuid(
    input.scheduleBlockId,
    "invalid-schedule-block",
  );

  if (!scheduleBlockId.ok) {
    return scheduleBlockId;
  }

  return valid({
    centerId: centerId.value,
    classTypeId: classTypeId.value,
    documentId: documentId.value,
    documentVersionId: documentVersionId.value,
    endsOn: endsOn.value,
    organizationId: organizationId.value,
    scheduleBlockId: scheduleBlockId.value,
    startsOn: startsOn.value,
  });
}

function validateStatusInput(
  input: SetDocumentProgrammingLinkStatusInput,
): ValidationResult<{
  linkId: string;
  organizationId: string;
  status: DocumentProgrammingLinkStatus;
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

  const linkId = normalizeRequiredUuid(input.linkId, "invalid-link");

  if (!linkId.ok) {
    return linkId;
  }

  const status = normalizeStatus(input.status);

  if (!status.ok) {
    return status;
  }

  return valid({
    linkId: linkId.value,
    organizationId: organizationId.value,
    status: status.value,
  });
}

export async function listDocumentProgrammingForBlock(
  input: ListDocumentProgrammingForBlockInput,
): Promise<DocumentProgrammingResult<DocumentProgrammingEntry[]>> {
  const validation = validateListForBlockInput(input);

  if (!validation.ok) {
    return failure(validation.error);
  }

  const context = await resolveDocumentProgrammingContext(
    validation.value.organizationId,
  );

  if (!context.ok) {
    return context;
  }

  const db = getDocumentProgrammingClient(context.data.supabase);
  const { data, error } = await db.rpc<DocumentProgrammingEntry[]>(
    "list_document_programming_for_block",
    {
      target_access_level: validation.value.accessLevel,
      target_limit: validation.value.limit,
      target_organization_id: context.data.organization.id,
      target_schedule_block_id: validation.value.scheduleBlockId,
    },
  );

  if (error) {
    return failure(mapDocumentProgrammingDatabaseError(error, "load-failed"));
  }

  return success(data ?? []);
}

export async function listDocumentProgrammingForDateContext(
  input: ListDocumentProgrammingForDateContextInput,
): Promise<DocumentProgrammingResult<DocumentProgrammingEntry[]>> {
  const validation = validateListForDateContextInput(input);

  if (!validation.ok) {
    return failure(validation.error);
  }

  const context = await resolveDocumentProgrammingContext(
    validation.value.organizationId,
  );

  if (!context.ok) {
    return context;
  }

  const db = getDocumentProgrammingClient(context.data.supabase);
  const { data, error } = await db.rpc<DocumentProgrammingEntry[]>(
    "list_document_programming_for_context",
    {
      target_access_level: validation.value.accessLevel,
      target_center_id: validation.value.centerId,
      target_class_type_id: validation.value.classTypeId,
      target_limit: validation.value.limit,
      target_organization_id: context.data.organization.id,
      target_service_date: validation.value.serviceDate,
    },
  );

  if (error) {
    return failure(mapDocumentProgrammingDatabaseError(error, "load-failed"));
  }

  return success(data ?? []);
}

export async function createDocumentProgrammingLink(
  input: CreateDocumentProgrammingLinkInput,
): Promise<DocumentProgrammingResult<DocumentProgrammingLinkRow>> {
  const validation = validateCreateInput(input);

  if (!validation.ok) {
    return failure(validation.error);
  }

  const context = await resolveDocumentProgrammingContext(
    validation.value.organizationId,
  );

  if (!context.ok) {
    return context;
  }

  const db = getDocumentProgrammingClient(context.data.supabase);
  const { data, error } = await db.rpc<DocumentProgrammingLinkRow>(
    "create_document_programming_link",
    {
      target_center_id: validation.value.centerId,
      target_class_type_id: validation.value.classTypeId,
      target_document_id: validation.value.documentId,
      target_document_version_id: validation.value.documentVersionId,
      target_ends_on: validation.value.endsOn,
      target_organization_id: context.data.organization.id,
      target_schedule_block_id: validation.value.scheduleBlockId,
      target_starts_on: validation.value.startsOn,
    },
  );

  if (error || !data) {
    return failure(mapDocumentProgrammingDatabaseError(error ?? {}, "save-failed"));
  }

  return success(data);
}

export async function setDocumentProgrammingLinkStatus(
  input: SetDocumentProgrammingLinkStatusInput,
): Promise<DocumentProgrammingResult<DocumentProgrammingLinkRow>> {
  const validation = validateStatusInput(input);

  if (!validation.ok) {
    return failure(validation.error);
  }

  const context = await resolveDocumentProgrammingContext(
    validation.value.organizationId,
  );

  if (!context.ok) {
    return context;
  }

  const db = getDocumentProgrammingClient(context.data.supabase);
  const { data, error } = await db.rpc<DocumentProgrammingLinkRow>(
    "set_document_programming_link_status",
    {
      target_document_programming_link_id: validation.value.linkId,
      target_organization_id: context.data.organization.id,
      target_status: validation.value.status,
    },
  );

  if (error || !data) {
    return failure(mapDocumentProgrammingDatabaseError(error ?? {}, "save-failed"));
  }

  return success(data);
}
