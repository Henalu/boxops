import { getAuthenticatedUser } from "@/lib/auth/tenant";
import { createClient } from "@/lib/supabase/server";
import { isPostgresUuid } from "@/lib/uuid";

export const PLATFORM_ROLES = [
  "platform_owner",
  "support",
  "billing",
  "viewer",
] as const;

export const PLATFORM_ADMIN_STATUSES = [
  "active",
  "inactive",
  "suspended",
] as const;

export const ORGANIZATION_SUBSCRIPTION_STATUSES = [
  "manual",
  "trialing",
  "active",
  "past_due",
  "paused",
  "cancelled",
] as const;

export type PlatformRole = (typeof PLATFORM_ROLES)[number];
export type PlatformAdminStatus = (typeof PLATFORM_ADMIN_STATUSES)[number];
export type OrganizationSubscriptionStatus =
  (typeof ORGANIZATION_SUBSCRIPTION_STATUSES)[number];

export type PlatformAdminRow = {
  created_at: string;
  display_name: string | null;
  id: string;
  role: PlatformRole;
  status: PlatformAdminStatus;
  updated_at: string;
  user_id: string;
};

export type PlatformOrganizationSummary = {
  active_centers_count: number;
  active_coaches_count: number;
  active_users_count: number;
  center_limit: number | null;
  current_period_ends_at: string | null;
  organization_created_at: string;
  organization_id: string;
  organization_name: string;
  organization_slug: string;
  organization_status: string;
  plan_code: string;
  seat_limit: number | null;
  subscription_status: OrganizationSubscriptionStatus;
  trial_ends_at: string | null;
};

export type PlatformConsoleErrorCode =
  | "access-change-confirmation-required"
  | "account-create-rollback-failed"
  | "account-email-already-exists"
  | "auth-account-create-failed"
  | "auth-admin-not-configured"
  | "authentication-required"
  | "display-name-too-long"
  | "duplicate-slug"
  | "forbidden"
  | "invalid-email"
  | "invalid-duration"
  | "invalid-input"
  | "invalid-limit"
  | "invalid-name"
  | "invalid-organization-status"
  | "invalid-plan-code"
  | "invalid-reason"
  | "invalid-role"
  | "invalid-slug"
  | "invalid-subscription-status"
  | "invalid-timezone"
  | "load-failed"
  | "missing-fields"
  | "owner-auth-user-not-found"
  | "owner-confirmation-required"
  | "organization-not-found"
  | "password-mismatch"
  | "password-missing-letter"
  | "password-missing-number"
  | "password-too-short"
  | "permission-denied"
  | "save-failed"
  | "support-session-confirmation-required"
  | "support-session-not-found"
  | "support-session-start-failed";

export type PlatformConsoleResult<T> =
  | {
      data: T;
      ok: true;
    }
  | {
      error: PlatformConsoleErrorCode;
      ok: false;
    };

export type PlatformOrganizationCreateInput = {
  allowPlatformActorAsOwner: boolean;
  centerLimit: number;
  organizationName: string;
  organizationSlug: string;
  organizationStatus: "active" | "trialing";
  organizationTimezone: string;
  ownerDisplayName: string | null;
  ownerEmail: string;
  ownerUserId: string | null;
  planCode: string;
  seatLimit: number;
  subscriptionStatus: OrganizationSubscriptionStatus;
};

export type PlatformOrganizationCreated = {
  created_membership_id: string;
  created_organization_id: string;
  created_person_profile_id: string;
  created_subscription_id: string;
  resolved_owner_user_id: string;
};

export type PlatformOrganizationAccessStatus = "active" | "suspended";

export type PlatformOrganizationAccessChangeInput = {
  nextStatus: PlatformOrganizationAccessStatus;
  organizationId: string;
  reason: string;
};

export type PlatformOrganizationAccessChange = {
  audit_event_id: string;
  new_status: PlatformOrganizationAccessStatus;
  organization_id: string;
  previous_status: string;
};

export const PLATFORM_SUPPORT_SESSION_DURATIONS = [30, 60, 120] as const;

export type PlatformSupportSessionDurationMinutes =
  (typeof PLATFORM_SUPPORT_SESSION_DURATIONS)[number];

export type PlatformSupportSessionCreateInput = {
  durationMinutes: PlatformSupportSessionDurationMinutes;
  organizationId: string;
  reason: string;
};

export type PlatformSupportSessionCreated = {
  audit_event_id: string;
  expires_at: string;
  organization_id: string;
  organization_name: string;
  started_at: string;
  support_session_id: string;
};

export type PlatformSupportSessionEnded = {
  audit_event_id: string;
  ended_at: string;
  ended_status: "ended" | "expired";
  organization_id: string;
  support_session_id: string;
};

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
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
  maybeSingle(): Promise<QueryResponse<T | null>>;
};
type UntypedTableBuilder = {
  select<T>(columns?: string): UntypedSelectQuery<T>;
};
type UntypedPlatformConsoleClient = {
  from(table: string): UntypedTableBuilder;
  rpc<T>(
    fn: string,
    args?: Record<string, unknown>,
  ): Promise<QueryResponse<T>>;
};
type ValidationResult<T> =
  | {
      ok: true;
      value: T;
    }
  | {
      error: PlatformConsoleErrorCode;
      ok: false;
    };
type PlatformConsoleContext = {
  admin: PlatformAdminRow;
  supabase: SupabaseServerClient;
  userId: string;
};

const DEFAULT_SUMMARY_LIMIT = 100;
const MAX_SUMMARY_LIMIT = 500;
const ORGANIZATION_STATUSES = [
  "trialing",
  "active",
  "inactive",
  "suspended",
] as const;
const ORGANIZATION_ACCESS_TARGET_STATUSES = ["active", "suspended"] as const;
const PLATFORM_ACTION_REASON_MAX_LENGTH = 160;
const PLATFORM_ACTION_REASON_MIN_LENGTH = 8;

function success<T>(data: T): PlatformConsoleResult<T> {
  return {
    data,
    ok: true,
  };
}

function failure(
  error: PlatformConsoleErrorCode,
): PlatformConsoleResult<never> {
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

function invalid(error: PlatformConsoleErrorCode): ValidationResult<never> {
  return {
    error,
    ok: false,
  };
}

function getPlatformConsoleClient(
  supabase: SupabaseServerClient,
): UntypedPlatformConsoleClient {
  return supabase as unknown as UntypedPlatformConsoleClient;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isPlatformRole(value: string): value is PlatformRole {
  return PLATFORM_ROLES.includes(value as PlatformRole);
}

function isActivePlatformAdmin(
  admin: Pick<PlatformAdminRow, "role" | "status"> | null,
): admin is PlatformAdminRow {
  return Boolean(admin && admin.status === "active" && isPlatformRole(admin.role));
}

function normalizeLimit(value: unknown): ValidationResult<number> {
  if (value === undefined || value === null) {
    return valid(DEFAULT_SUMMARY_LIMIT);
  }

  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > MAX_SUMMARY_LIMIT
  ) {
    return invalid("invalid-limit");
  }

  return valid(value);
}

function normalizeOptionalOrganizationStatus(
  value: unknown,
): ValidationResult<string | null> {
  if (value === undefined || value === null || value === "") {
    return valid(null);
  }

  if (typeof value !== "string") {
    return invalid("invalid-organization-status");
  }

  const normalized = value.trim().toLowerCase();

  return ORGANIZATION_STATUSES.includes(
    normalized as (typeof ORGANIZATION_STATUSES)[number],
  )
    ? valid(normalized)
    : invalid("invalid-organization-status");
}

function normalizeOptionalSubscriptionStatus(
  value: unknown,
): ValidationResult<OrganizationSubscriptionStatus | null> {
  if (value === undefined || value === null || value === "") {
    return valid(null);
  }

  if (typeof value !== "string") {
    return invalid("invalid-subscription-status");
  }

  const normalized = value.trim().toLowerCase();

  return ORGANIZATION_SUBSCRIPTION_STATUSES.includes(
    normalized as OrganizationSubscriptionStatus,
  )
    ? valid(normalized as OrganizationSubscriptionStatus)
    : invalid("invalid-subscription-status");
}

function normalizeOrganizationAccessNextStatus(
  value: unknown,
): ValidationResult<PlatformOrganizationAccessStatus> {
  if (typeof value !== "string") {
    return invalid("invalid-organization-status");
  }

  const normalized = value.trim().toLowerCase();

  return ORGANIZATION_ACCESS_TARGET_STATUSES.includes(
    normalized as PlatformOrganizationAccessStatus,
  )
    ? valid(normalized as PlatformOrganizationAccessStatus)
    : invalid("invalid-organization-status");
}

function normalizePlatformActionReason(
  value: unknown,
): ValidationResult<string> {
  if (typeof value !== "string") {
    return invalid("invalid-reason");
  }

  const normalized = value.trim().replace(/\s+/g, " ");

  if (
    normalized.length < PLATFORM_ACTION_REASON_MIN_LENGTH ||
    normalized.length > PLATFORM_ACTION_REASON_MAX_LENGTH
  ) {
    return invalid("invalid-reason");
  }

  return valid(normalized);
}

function normalizeSupportSessionDuration(
  value: unknown,
): ValidationResult<PlatformSupportSessionDurationMinutes> {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return invalid("invalid-duration");
  }

  return PLATFORM_SUPPORT_SESSION_DURATIONS.includes(
    value as PlatformSupportSessionDurationMinutes,
  )
    ? valid(value as PlatformSupportSessionDurationMinutes)
    : invalid("invalid-duration");
}

function normalizePlatformRoles(
  roles: readonly (PlatformRole | string)[],
): ValidationResult<PlatformRole[]> {
  if (!Array.isArray(roles) || roles.length === 0) {
    return invalid("invalid-role");
  }

  const normalizedRoles = new Set<PlatformRole>();

  for (const role of roles) {
    if (typeof role !== "string") {
      return invalid("invalid-role");
    }

    const normalized = role.trim().toLowerCase();

    if (!isPlatformRole(normalized)) {
      return invalid("invalid-role");
    }

    normalizedRoles.add(normalized);
  }

  return valid([...normalizedRoles]);
}

function mapDatabaseError(
  error: DatabaseErrorLike | null | undefined,
  fallback: PlatformConsoleErrorCode = "load-failed",
): PlatformConsoleErrorCode {
  const message = error?.message?.toLowerCase() ?? "";
  const code = error?.code?.toLowerCase() ?? "";

  if (message.includes("authentication")) {
    return "authentication-required";
  }

  if (code === "23505" || message.includes("duplicate key")) {
    return "duplicate-slug";
  }

  if (
    message.includes("active platform admin") ||
    message.includes("platform_owner required") ||
    message.includes("platform support role") ||
    message.includes("permission") ||
    message.includes("row-level security") ||
    message.includes("rls")
  ) {
    return "permission-denied";
  }

  if (message.includes("organization name")) {
    return "invalid-name";
  }

  if (message.includes("organization slug")) {
    return "invalid-slug";
  }

  if (message.includes("organization status")) {
    return "invalid-organization-status";
  }

  if (
    message.includes("organization access status") ||
    message.includes("transitionable")
  ) {
    return "invalid-organization-status";
  }

  if (message.includes("organization timezone")) {
    return "invalid-timezone";
  }

  if (message.includes("owner email")) {
    return "invalid-email";
  }

  if (message.includes("owner display name")) {
    return "display-name-too-long";
  }

  if (message.includes("platform reason")) {
    return "invalid-reason";
  }

  if (message.includes("support duration")) {
    return "invalid-duration";
  }

  if (message.includes("support session not found")) {
    return "support-session-not-found";
  }

  if (message.includes("plan code")) {
    return "invalid-plan-code";
  }

  if (message.includes("subscription status")) {
    return "invalid-subscription-status";
  }

  if (message.includes("seat limit") || message.includes("center limit")) {
    return "invalid-limit";
  }

  if (message.includes("owner auth user not found")) {
    return "owner-auth-user-not-found";
  }

  if (message.includes("platform actor owner")) {
    return "owner-confirmation-required";
  }

  return fallback;
}

async function resolvePlatformConsoleContext(): Promise<
  PlatformConsoleResult<PlatformConsoleContext>
> {
  const user = await getAuthenticatedUser();

  if (!user) {
    return failure("authentication-required");
  }

  const supabase = await createClient();
  const db = getPlatformConsoleClient(supabase);
  const { data, error } = await db
    .from("platform_admins")
    .select<PlatformAdminRow>(
      "id, user_id, role, status, display_name, created_at, updated_at",
    )
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    return failure(mapDatabaseError(error));
  }

  if (!isActivePlatformAdmin(data)) {
    return failure("forbidden");
  }

  return success({
    admin: data,
    supabase,
    userId: user.id,
  });
}

export async function getActivePlatformAdmin(): Promise<
  PlatformConsoleResult<PlatformAdminRow>
> {
  const context = await resolvePlatformConsoleContext();

  if (!context.ok) {
    return context;
  }

  return success(context.data.admin);
}

export async function hasActivePlatformRole(
  roles: readonly (PlatformRole | string)[],
): Promise<PlatformConsoleResult<boolean>> {
  const normalizedRoles = normalizePlatformRoles(roles);

  if (!normalizedRoles.ok) {
    return failure(normalizedRoles.error);
  }

  const context = await resolvePlatformConsoleContext();

  if (!context.ok) {
    return context;
  }

  return success(normalizedRoles.value.includes(context.data.admin.role));
}

export async function listPlatformOrganizationSummaries(input?: {
  limit?: number | null;
  organizationStatus?: string | null;
  subscriptionStatus?: string | null;
}): Promise<PlatformConsoleResult<PlatformOrganizationSummary[]>> {
  if (input !== undefined && !isRecord(input)) {
    return failure("invalid-input");
  }

  const organizationStatus = normalizeOptionalOrganizationStatus(
    input?.organizationStatus,
  );

  if (!organizationStatus.ok) {
    return failure(organizationStatus.error);
  }

  const subscriptionStatus = normalizeOptionalSubscriptionStatus(
    input?.subscriptionStatus,
  );

  if (!subscriptionStatus.ok) {
    return failure(subscriptionStatus.error);
  }

  const limit = normalizeLimit(input?.limit);

  if (!limit.ok) {
    return failure(limit.error);
  }

  const context = await resolvePlatformConsoleContext();

  if (!context.ok) {
    return context;
  }

  const db = getPlatformConsoleClient(context.data.supabase);
  const { data, error } = await db.rpc<PlatformOrganizationSummary[]>(
    "list_platform_organization_summaries",
    {
      target_limit: limit.value,
      target_status: organizationStatus.value,
      target_subscription_status: subscriptionStatus.value,
    },
  );

  if (error) {
    return failure(mapDatabaseError(error));
  }

  return success(
    (data ?? []).map((summary) => ({
      ...summary,
      active_centers_count: Number(summary.active_centers_count),
      active_coaches_count: Number(summary.active_coaches_count),
      active_users_count: Number(summary.active_users_count),
    })),
  );
}

export async function getPlatformOrganizationReview(
  organizationId: string,
): Promise<PlatformConsoleResult<PlatformOrganizationSummary>> {
  const normalizedOrganizationId = organizationId.trim();

  if (!isPlatformOrganizationId(normalizedOrganizationId)) {
    return failure("invalid-input");
  }

  const summaries = await listPlatformOrganizationSummaries({
    limit: MAX_SUMMARY_LIMIT,
  });

  if (!summaries.ok) {
    return summaries;
  }

  const summary = summaries.data.find(
    (item) => item.organization_id === normalizedOrganizationId,
  );

  if (!summary) {
    return failure("organization-not-found");
  }

  return success(summary);
}

export async function createPlatformOrganizationWithOwner(
  input: PlatformOrganizationCreateInput,
): Promise<PlatformConsoleResult<PlatformOrganizationCreated>> {
  const context = await resolvePlatformConsoleContext();

  if (!context.ok) {
    return context;
  }

  if (context.data.admin.role !== "platform_owner") {
    return failure("permission-denied");
  }

  const db = getPlatformConsoleClient(context.data.supabase);
  const { data, error } = await db.rpc<PlatformOrganizationCreated[]>(
    "create_platform_organization_with_owner",
    {
      target_allow_platform_actor_as_owner: input.allowPlatformActorAsOwner,
      target_center_limit: input.centerLimit,
      target_organization_name: input.organizationName,
      target_organization_slug: input.organizationSlug,
      target_organization_status: input.organizationStatus,
      target_organization_timezone: input.organizationTimezone,
      target_owner_display_name: input.ownerDisplayName,
      target_owner_email: input.ownerEmail,
      target_owner_user_id: input.ownerUserId,
      target_plan_code: input.planCode,
      target_seat_limit: input.seatLimit,
      target_subscription_status: input.subscriptionStatus,
    },
  );

  if (error) {
    return failure(mapDatabaseError(error, "save-failed"));
  }

  const [createdOrganization] = data ?? [];

  if (!createdOrganization) {
    return failure("save-failed");
  }

  return success(createdOrganization);
}

export async function setPlatformOrganizationAccessStatus(
  input: PlatformOrganizationAccessChangeInput,
): Promise<PlatformConsoleResult<PlatformOrganizationAccessChange>> {
  const normalizedOrganizationId = input.organizationId.trim();

  if (!isPlatformOrganizationId(normalizedOrganizationId)) {
    return failure("invalid-input");
  }

  const nextStatus = normalizeOrganizationAccessNextStatus(input.nextStatus);

  if (!nextStatus.ok) {
    return failure(nextStatus.error);
  }

  const reason = normalizePlatformActionReason(input.reason);

  if (!reason.ok) {
    return failure(reason.error);
  }

  const context = await resolvePlatformConsoleContext();

  if (!context.ok) {
    return context;
  }

  if (context.data.admin.role !== "platform_owner") {
    return failure("permission-denied");
  }

  const db = getPlatformConsoleClient(context.data.supabase);
  const { data, error } = await db.rpc<PlatformOrganizationAccessChange[]>(
    "set_platform_organization_access_status",
    {
      target_next_status: nextStatus.value,
      target_organization_id: normalizedOrganizationId,
      target_reason: reason.value,
    },
  );

  if (error) {
    return failure(mapDatabaseError(error, "save-failed"));
  }

  const [updatedOrganization] = data ?? [];

  if (!updatedOrganization) {
    return failure("save-failed");
  }

  return success(updatedOrganization);
}

export async function createPlatformSupportSession(
  input: PlatformSupportSessionCreateInput,
): Promise<PlatformConsoleResult<PlatformSupportSessionCreated>> {
  const normalizedOrganizationId = input.organizationId.trim();

  if (!isPlatformOrganizationId(normalizedOrganizationId)) {
    return failure("invalid-input");
  }

  const reason = normalizePlatformActionReason(input.reason);

  if (!reason.ok) {
    return failure(reason.error);
  }

  const duration = normalizeSupportSessionDuration(input.durationMinutes);

  if (!duration.ok) {
    return failure(duration.error);
  }

  const context = await resolvePlatformConsoleContext();

  if (!context.ok) {
    return context;
  }

  if (
    context.data.admin.role !== "platform_owner" &&
    context.data.admin.role !== "support"
  ) {
    return failure("permission-denied");
  }

  const db = getPlatformConsoleClient(context.data.supabase);
  const { data, error } = await db.rpc<PlatformSupportSessionCreated[]>(
    "create_platform_support_session",
    {
      target_duration_minutes: duration.value,
      target_organization_id: normalizedOrganizationId,
      target_reason: reason.value,
    },
  );

  if (error) {
    return failure(mapDatabaseError(error, "support-session-start-failed"));
  }

  const [createdSession] = data ?? [];

  if (!createdSession) {
    return failure("support-session-start-failed");
  }

  return success(createdSession);
}

export async function endPlatformSupportSession(
  supportSessionId: string,
): Promise<PlatformConsoleResult<PlatformSupportSessionEnded>> {
  const normalizedSupportSessionId = supportSessionId.trim();

  if (!isPlatformOrganizationId(normalizedSupportSessionId)) {
    return failure("invalid-input");
  }

  const context = await resolvePlatformConsoleContext();

  if (!context.ok) {
    return context;
  }

  if (
    context.data.admin.role !== "platform_owner" &&
    context.data.admin.role !== "support"
  ) {
    return failure("permission-denied");
  }

  const db = getPlatformConsoleClient(context.data.supabase);
  const { data, error } = await db.rpc<PlatformSupportSessionEnded[]>(
    "end_platform_support_session",
    {
      target_support_session_id: normalizedSupportSessionId,
    },
  );

  if (error) {
    return failure(mapDatabaseError(error, "save-failed"));
  }

  const [endedSession] = data ?? [];

  if (!endedSession) {
    return failure("support-session-not-found");
  }

  return success(endedSession);
}

export function isPlatformOrganizationId(value: unknown): value is string {
  return typeof value === "string" && isPostgresUuid(value.trim());
}
