import {
  getActiveMemberships,
  getAuthenticatedUser,
  resolveActiveOrganization,
  type ActiveMembership,
  type ActiveOrganization,
} from "@/lib/auth/tenant";
import { createClient } from "@/lib/supabase/server";
import { isPostgresUuid } from "@/lib/uuid";

export const DOCUMENT_REPOSITORY_SCOPES = [
  "company",
  "programming",
  "person_private",
  "certification",
  "management_private",
] as const;

export type DocumentRepositoryScope =
  (typeof DOCUMENT_REPOSITORY_SCOPES)[number];

export const DOCUMENT_UPLOAD_SCOPES = ["company", "programming"] as const;

export type DocumentUploadScope = (typeof DOCUMENT_UPLOAD_SCOPES)[number];

export const DOCUMENT_UPLOAD_MAX_SIZE_BYTES = 5 * 1024 * 1024;

export const DOCUMENT_UPLOAD_ACCEPT =
  "application/pdf,image/jpeg,image/png,image/webp,text/plain,text/csv";

export type DocumentUploadFileErrorCode =
  | "file-content-mismatch"
  | "file-empty"
  | "file-extension-mismatch"
  | "file-name-invalid"
  | "file-read-failed"
  | "file-too-large"
  | "file-type-not-allowed";

export type DocumentUploadFileValidation =
  | {
      extension: string;
      mimeType: string;
      ok: true;
      originalFilename: string;
      sizeBytes: number;
    }
  | {
      error: DocumentUploadFileErrorCode;
      ok: false;
    };

export type DocumentRepositoryEntry = {
  activated_at: string | null;
  archived_at: string | null;
  can_download: boolean;
  can_preview: boolean;
  description: string | null;
  document_id: string;
  document_scope: DocumentRepositoryScope;
  document_status: string;
  document_type: string;
  document_updated_at: string;
  document_version_id: string;
  mime_type: string;
  organization_id: string;
  original_filename: string;
  sensitivity_level: string;
  size_bytes: number;
  title: string;
  version_number: number;
  version_status: string;
  version_updated_at: string;
};

export type DocumentRepositoryErrorCode =
  | "authentication-required"
  | "forbidden"
  | "invalid-input"
  | "invalid-limit"
  | "invalid-organization"
  | "invalid-scope"
  | "load-failed"
  | "no-active-memberships"
  | "organization-not-found"
  | "organization-required"
  | "permission-denied";

export type DocumentRepositoryResult<T> =
  | {
      data: T;
      ok: true;
    }
  | {
      error: DocumentRepositoryErrorCode;
      ok: false;
    };

type DocumentRepositoryContext = {
  membership: ActiveMembership;
  organization: ActiveOrganization;
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
};

type ValidationResult<T> =
  | {
      ok: true;
      value: T;
    }
  | {
      error: DocumentRepositoryErrorCode;
      ok: false;
    };

type QueryResponse<T> = {
  data: T | null;
  error: {
    message?: string;
  } | null;
};

type UntypedDocumentRepositoryClient = {
  rpc<T>(
    fn: string,
    args?: Record<string, unknown>,
  ): Promise<QueryResponse<T>>;
};

const DEFAULT_LIST_LIMIT = 100;
const MAX_LIST_LIMIT = 200;
const DOCUMENT_UPLOAD_ALLOWED_EXTENSIONS: Record<string, readonly string[]> = {
  "application/pdf": ["pdf"],
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
  "text/csv": ["csv"],
  "text/plain": ["txt"],
};
const DOCUMENT_UPLOAD_MANAGEMENT_ROLES = new Set([
  "admin",
  "document_admin",
  "owner",
]);

function success<T>(data: T): DocumentRepositoryResult<T> {
  return {
    data,
    ok: true,
  };
}

function failure(
  error: DocumentRepositoryErrorCode,
): DocumentRepositoryResult<never> {
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

function invalid(error: DocumentRepositoryErrorCode): ValidationResult<never> {
  return {
    error,
    ok: false,
  };
}

function invalidUpload(
  error: DocumentUploadFileErrorCode,
): DocumentUploadFileValidation {
  return {
    error,
    ok: false,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function getDocumentRepositoryClient(
  supabase: Awaited<ReturnType<typeof createClient>>,
): UntypedDocumentRepositoryClient {
  return supabase as unknown as UntypedDocumentRepositoryClient;
}

function mapResolutionReason(
  reason: "no_active_memberships" | "organization_not_found" | "organization_required",
): DocumentRepositoryErrorCode {
  if (reason === "no_active_memberships") {
    return "no-active-memberships";
  }

  if (reason === "organization_not_found") {
    return "organization-not-found";
  }

  return "organization-required";
}

function normalizeOrganizationId(value: unknown): ValidationResult<string> {
  if (typeof value !== "string" || !isPostgresUuid(value.trim())) {
    return invalid("invalid-organization");
  }

  return valid(value.trim());
}

export function isDocumentRepositoryScope(
  value: string,
): value is DocumentRepositoryScope {
  return DOCUMENT_REPOSITORY_SCOPES.includes(value as DocumentRepositoryScope);
}

export function normalizeDocumentRepositoryScope(
  value: unknown,
): DocumentRepositoryScope | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  return isDocumentRepositoryScope(normalized) ? normalized : null;
}

export function isDocumentUploadScope(
  value: string,
): value is DocumentUploadScope {
  return DOCUMENT_UPLOAD_SCOPES.includes(value as DocumentUploadScope);
}

export function normalizeDocumentUploadScope(
  value: unknown,
): DocumentUploadScope | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  return isDocumentUploadScope(normalized) ? normalized : null;
}

export function canCreateMinimalDocumentUpload(role: string) {
  return DOCUMENT_UPLOAD_MANAGEMENT_ROLES.has(role);
}

export function getDocumentUploadDocumentType(scope: DocumentUploadScope) {
  return scope === "programming"
    ? "programming_document"
    : "company_document";
}

function getFilenameExtension(filename: string) {
  const extension = filename.toLowerCase().match(/\.([a-z0-9]{1,12})$/)?.[1];

  return extension ?? "";
}

function startsWithBytes(bytes: Uint8Array, expected: readonly number[]) {
  if (bytes.length < expected.length) {
    return false;
  }

  return expected.every((byte, index) => bytes[index] === byte);
}

function looksLikeText(bytes: Uint8Array) {
  if (bytes.length === 0) {
    return false;
  }

  const sample = bytes.slice(0, Math.min(bytes.length, 4096));
  let controlBytes = 0;

  for (const byte of sample) {
    if (byte === 0) {
      return false;
    }

    if (byte < 8 || (byte > 13 && byte < 32)) {
      controlBytes += 1;
    }
  }

  return controlBytes <= Math.max(1, Math.floor(sample.length * 0.02));
}

function documentBytesMatchMimeType(mimeType: string, bytes: Uint8Array) {
  if (mimeType === "application/pdf") {
    return startsWithBytes(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]);
  }

  if (mimeType === "image/jpeg") {
    return startsWithBytes(bytes, [0xff, 0xd8, 0xff]);
  }

  if (mimeType === "image/png") {
    return startsWithBytes(bytes, [
      0x89,
      0x50,
      0x4e,
      0x47,
      0x0d,
      0x0a,
      0x1a,
      0x0a,
    ]);
  }

  if (mimeType === "image/webp") {
    return (
      startsWithBytes(bytes, [0x52, 0x49, 0x46, 0x46]) &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50
    );
  }

  if (mimeType === "text/plain" || mimeType === "text/csv") {
    return looksLikeText(bytes);
  }

  return false;
}

export function validateMinimalDocumentUploadFile(
  file: File,
  bytes: Uint8Array,
): DocumentUploadFileValidation {
  const originalFilename = file.name.trim();
  const mimeType = file.type.trim().toLowerCase();
  const extension = getFilenameExtension(originalFilename);
  const allowedExtensions = DOCUMENT_UPLOAD_ALLOWED_EXTENSIONS[mimeType];

  if (
    !originalFilename ||
    originalFilename.length > 255 ||
    /[/\\]/.test(originalFilename)
  ) {
    return invalidUpload("file-name-invalid");
  }

  if (file.size <= 0 || bytes.length <= 0) {
    return invalidUpload("file-empty");
  }

  if (file.size !== bytes.length) {
    return invalidUpload("file-read-failed");
  }

  if (file.size > DOCUMENT_UPLOAD_MAX_SIZE_BYTES) {
    return invalidUpload("file-too-large");
  }

  if (!allowedExtensions) {
    return invalidUpload("file-type-not-allowed");
  }

  if (!allowedExtensions.includes(extension)) {
    return invalidUpload("file-extension-mismatch");
  }

  if (!documentBytesMatchMimeType(mimeType, bytes)) {
    return invalidUpload("file-content-mismatch");
  }

  return {
    extension,
    mimeType,
    ok: true,
    originalFilename,
    sizeBytes: file.size,
  };
}

function validateScope(value: unknown): ValidationResult<DocumentRepositoryScope | null> {
  if (value === undefined || value === null || value === "") {
    return valid(null);
  }

  if (typeof value !== "string") {
    return invalid("invalid-scope");
  }

  const normalized = value.trim().toLowerCase();

  return isDocumentRepositoryScope(normalized)
    ? valid(normalized)
    : invalid("invalid-scope");
}

function validateLimit(value: unknown): ValidationResult<number> {
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

function validateListInput(input: {
  limit?: number | null;
  organizationId: string;
  scope?: string | null;
}): ValidationResult<{
  limit: number;
  organizationId: string;
  scope: DocumentRepositoryScope | null;
}> {
  if (!isRecord(input)) {
    return invalid("invalid-input");
  }

  const organizationId = normalizeOrganizationId(input.organizationId);

  if (!organizationId.ok) {
    return organizationId;
  }

  const scope = validateScope(input.scope);

  if (!scope.ok) {
    return scope;
  }

  const limit = validateLimit(input.limit);

  if (!limit.ok) {
    return limit;
  }

  return valid({
    limit: limit.value,
    organizationId: organizationId.value,
    scope: scope.value,
  });
}

function mapDatabaseError(message: string | undefined): DocumentRepositoryErrorCode {
  const normalized = message?.toLowerCase() ?? "";

  if (normalized.includes("authentication")) {
    return "authentication-required";
  }

  if (normalized.includes("membership")) {
    return "forbidden";
  }

  if (normalized.includes("permission") || normalized.includes("rls")) {
    return "permission-denied";
  }

  if (normalized.includes("scope")) {
    return "invalid-scope";
  }

  return "load-failed";
}

async function resolveDocumentRepositoryContext(
  organizationId: string,
): Promise<DocumentRepositoryResult<DocumentRepositoryContext>> {
  const user = await getAuthenticatedUser();

  if (!user) {
    return failure("authentication-required");
  }

  const memberships = await getActiveMemberships(user.id);
  const resolution = resolveActiveOrganization(memberships, organizationId);

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

export async function listAccessibleDocumentVersions(input: {
  limit?: number | null;
  organizationId: string;
  scope?: string | null;
}): Promise<DocumentRepositoryResult<DocumentRepositoryEntry[]>> {
  const validation = validateListInput(input);

  if (!validation.ok) {
    return failure(validation.error);
  }

  const context = await resolveDocumentRepositoryContext(
    validation.value.organizationId,
  );

  if (!context.ok) {
    return context;
  }

  const db = getDocumentRepositoryClient(context.data.supabase);
  const { data, error } = await db.rpc<DocumentRepositoryEntry[]>(
    "list_accessible_document_versions",
    {
      target_document_scope: validation.value.scope,
      target_limit: validation.value.limit,
      target_organization_id: context.data.organization.id,
    },
  );

  if (error) {
    return failure(mapDatabaseError(error.message));
  }

  return success(data ?? []);
}
