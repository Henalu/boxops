"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { validatePasswordPolicy } from "@/lib/auth/password-policy";
import { buildRequiredPasswordChangeAppMetadata } from "@/lib/auth/required-password-change";
import { getLoginPath } from "@/lib/auth/redirects";
import { getAuthenticatedUser } from "@/lib/auth/tenant";
import {
  ORGANIZATION_SUBSCRIPTION_STATUSES,
  PLATFORM_SUPPORT_SESSION_DURATIONS,
  createPlatformSupportSession,
  createPlatformOrganizationWithOwner,
  endPlatformSupportSession,
  getActivePlatformAdmin,
  isPlatformOrganizationId,
  setPlatformOrganizationAccessStatus,
  type OrganizationSubscriptionStatus,
  type PlatformConsoleErrorCode,
  type PlatformOrganizationAccessStatus,
  type PlatformSupportSessionDurationMinutes,
} from "@/lib/platform-console";
import { PLATFORM_SUPPORT_SESSION_COOKIE_NAME } from "@/lib/platform-support-session-cookie";
import { createAdminClient } from "@/lib/supabase/admin";

const ORGANIZATION_CREATE_STATUSES = ["trialing", "active"] as const;
const ORGANIZATION_ACCESS_ACTIONS = ["activate", "suspend"] as const;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PLAN_CODE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TIMEZONE_PATTERN = /^[A-Za-z0-9_+.-]+(?:\/[A-Za-z0-9_+.-]+)*$/;
const ACCESS_REASON_MIN_LENGTH = 8;
const ACCESS_REASON_MAX_LENGTH = 160;
const ACCESS_REASON_SENSITIVE_PATTERN =
  /(https?:\/\/|www[.]|data:|base64|token|secret|password|credential|signed-url|signed_url|storage\/v1|document-files|documento|document|archivo|file|payroll|salary|salario|nomina|iban|bank|card|cvv|mandate|account|routing|swift|bic|payment[_-]?method|dni|nif|ssn|national_id|geolocation|gps|latitude|longitude|coordinate|ubicacion|location|ip|fingerprint|health|medical|salud|diagnostic|diagnostico|baja)/i;
const DEFAULT_SUPPORT_SESSION_REASON =
  "Revisión técnica solicitada por la organización.";

function getConsolePath(params: {
  error?: PlatformConsoleErrorCode;
  organizationId?: string;
  status?: string;
}) {
  const searchParams = new URLSearchParams();

  if (params.error) {
    searchParams.set("error", params.error);
  }

  if (params.organizationId) {
    searchParams.set("organizationId", params.organizationId);
  }

  if (params.status) {
    searchParams.set("status", params.status);
  }

  const query = searchParams.toString();

  return query ? `/console?${query}` : "/console";
}

function getOrganizationReviewPath(
  organizationId: string,
  params?: {
    error?: PlatformConsoleErrorCode;
    status?: string;
  },
) {
  const searchParams = new URLSearchParams();

  if (params?.error) {
    searchParams.set("error", params.error);
  }

  if (params?.status) {
    searchParams.set("status", params.status);
  }

  const query = searchParams.toString();
  const path = `/console/organizations/${organizationId}`;

  return query ? `${path}?${query}` : path;
}

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

function getFormBoolean(formData: FormData, key: string) {
  return formData.get(key) === "on";
}

function parseLimit(value: string, max: number) {
  if (!/^\d+$/.test(value)) {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) {
    return null;
  }

  return parsed;
}

function isOrganizationCreateStatus(
  value: string,
): value is (typeof ORGANIZATION_CREATE_STATUSES)[number] {
  return ORGANIZATION_CREATE_STATUSES.includes(
    value as (typeof ORGANIZATION_CREATE_STATUSES)[number],
  );
}

function isSubscriptionStatus(
  value: string,
): value is OrganizationSubscriptionStatus {
  return ORGANIZATION_SUBSCRIPTION_STATUSES.includes(
    value as OrganizationSubscriptionStatus,
  );
}

function isOrganizationAccessAction(
  value: string,
): value is (typeof ORGANIZATION_ACCESS_ACTIONS)[number] {
  return ORGANIZATION_ACCESS_ACTIONS.includes(
    value as (typeof ORGANIZATION_ACCESS_ACTIONS)[number],
  );
}

function normalizeAccessReason(value: string) {
  const normalized = value.trim().replace(/\s+/g, " ");

  if (
    normalized.length < ACCESS_REASON_MIN_LENGTH ||
    normalized.length > ACCESS_REASON_MAX_LENGTH ||
    ACCESS_REASON_SENSITIVE_PATTERN.test(normalized)
  ) {
    return null;
  }

  return normalized;
}

function normalizeSupportSessionDuration(
  value: string,
): PlatformSupportSessionDurationMinutes | null {
  if (!/^\d+$/.test(value)) {
    return null;
  }

  const duration = Number(value);

  return PLATFORM_SUPPORT_SESSION_DURATIONS.includes(
    duration as PlatformSupportSessionDurationMinutes,
  )
    ? (duration as PlatformSupportSessionDurationMinutes)
    : null;
}

function getSupportSessionCookieMaxAgeSeconds(
  expiresAt: string,
  fallbackDurationMinutes: number,
) {
  const expiresAtMs = Date.parse(expiresAt);

  if (Number.isNaN(expiresAtMs)) {
    return fallbackDurationMinutes * 60;
  }

  return Math.max(60, Math.floor((expiresAtMs - Date.now()) / 1000));
}

function getAuthCreateError(error?: {
  message?: string;
  status?: number;
} | null): PlatformConsoleErrorCode {
  const message = error?.message?.toLowerCase() ?? "";

  if (
    error?.status === 422 ||
    message.includes("already") ||
    message.includes("exists") ||
    message.includes("registered")
  ) {
    return "account-email-already-exists";
  }

  return "auth-account-create-failed";
}

export async function updatePlatformOrganizationAccessAction(formData: FormData) {
  const organizationId = getFormString(formData, "organizationId");
  const accessAction = getFormString(formData, "accessAction");
  const reason = normalizeAccessReason(getFormString(formData, "reason"));

  if (!isPlatformOrganizationId(organizationId)) {
    redirect(getConsolePath({ error: "invalid-input" }));
  }

  const reviewPath = getOrganizationReviewPath(organizationId);

  if (!isOrganizationAccessAction(accessAction)) {
    redirect(
      getOrganizationReviewPath(organizationId, {
        error: "invalid-organization-status",
      }),
    );
  }

  if (!reason) {
    redirect(
      getOrganizationReviewPath(organizationId, {
        error: "invalid-reason",
      }),
    );
  }

  if (
    accessAction === "suspend" &&
    getFormString(formData, "confirmOrganizationAccessChange") !== "1"
  ) {
    redirect(
      getOrganizationReviewPath(organizationId, {
        error: "access-change-confirmation-required",
      }),
    );
  }

  const adminResult = await getActivePlatformAdmin();

  if (!adminResult.ok) {
    if (adminResult.error === "authentication-required") {
      redirect(getLoginPath(reviewPath));
    }

    redirect(
      getOrganizationReviewPath(organizationId, {
        error: adminResult.error,
      }),
    );
  }

  if (adminResult.data.role !== "platform_owner") {
    redirect(
      getOrganizationReviewPath(organizationId, {
        error: "permission-denied",
      }),
    );
  }

  const user = await getAuthenticatedUser();

  if (!user) {
    redirect(getLoginPath(reviewPath));
  }

  const nextStatus = (
    accessAction === "suspend" ? "suspended" : "active"
  ) satisfies PlatformOrganizationAccessStatus;
  const updateResult = await setPlatformOrganizationAccessStatus({
    nextStatus,
    organizationId,
    reason,
  });

  if (!updateResult.ok) {
    redirect(
      getOrganizationReviewPath(organizationId, {
        error: updateResult.error,
      }),
    );
  }

  revalidatePath("/console");
  revalidatePath(reviewPath);
  redirect(
    getOrganizationReviewPath(organizationId, {
      status:
        updateResult.data.new_status === "suspended"
          ? "organization-suspended"
          : "organization-activated",
    }),
  );
}

export async function createPlatformSupportSessionAction(formData: FormData) {
  const organizationId = getFormString(formData, "organizationId");
  const rawReason = getFormString(formData, "reason");
  const reason = normalizeAccessReason(
    rawReason || DEFAULT_SUPPORT_SESSION_REASON,
  );
  const durationMinutes = normalizeSupportSessionDuration(
    getFormString(formData, "durationMinutes"),
  );

  if (!isPlatformOrganizationId(organizationId)) {
    redirect(getConsolePath({ error: "invalid-input" }));
  }

  const reviewPath = getOrganizationReviewPath(organizationId);

  if (!reason) {
    redirect(
      getOrganizationReviewPath(organizationId, {
        error: "invalid-reason",
      }),
    );
  }

  if (!durationMinutes) {
    redirect(
      getOrganizationReviewPath(organizationId, {
        error: "invalid-duration",
      }),
    );
  }

  const adminResult = await getActivePlatformAdmin();

  if (!adminResult.ok) {
    if (adminResult.error === "authentication-required") {
      redirect(getLoginPath(reviewPath));
    }

    redirect(
      getOrganizationReviewPath(organizationId, {
        error: adminResult.error,
      }),
    );
  }

  if (
    adminResult.data.role !== "platform_owner" &&
    adminResult.data.role !== "support"
  ) {
    redirect(
      getOrganizationReviewPath(organizationId, {
        error: "permission-denied",
      }),
    );
  }

  const user = await getAuthenticatedUser();

  if (!user) {
    redirect(getLoginPath(reviewPath));
  }

  const supportSessionResult = await createPlatformSupportSession({
    durationMinutes,
    organizationId,
    reason,
  });

  if (!supportSessionResult.ok) {
    redirect(
      getOrganizationReviewPath(organizationId, {
        error: supportSessionResult.error,
      }),
    );
  }

  const cookieStore = await cookies();
  cookieStore.set(
    PLATFORM_SUPPORT_SESSION_COOKIE_NAME,
    supportSessionResult.data.support_session_id,
    {
      httpOnly: true,
      maxAge: getSupportSessionCookieMaxAgeSeconds(
        supportSessionResult.data.expires_at,
        durationMinutes,
      ),
      path: "/app",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    },
  );

  revalidatePath("/console");
  revalidatePath(reviewPath);
  redirect(`/app?organizationId=${encodeURIComponent(organizationId)}`);
}

export async function endPlatformSupportSessionAction(formData: FormData) {
  const supportSessionId = getFormString(formData, "supportSessionId");
  const organizationId = getFormString(formData, "organizationId");
  const cookieStore = await cookies();

  cookieStore.set(PLATFORM_SUPPORT_SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    maxAge: 0,
    path: "/app",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  if (!isPlatformOrganizationId(supportSessionId)) {
    redirect(
      isPlatformOrganizationId(organizationId)
        ? getOrganizationReviewPath(organizationId, {
            error: "support-session-not-found",
          })
        : getConsolePath({ error: "support-session-not-found" }),
    );
  }

  const endResult = await endPlatformSupportSession(supportSessionId);

  if (!endResult.ok) {
    redirect(
      isPlatformOrganizationId(organizationId)
        ? getOrganizationReviewPath(organizationId, {
            error: endResult.error,
          })
        : getConsolePath({ error: endResult.error }),
    );
  }

  revalidatePath("/app");
  revalidatePath("/console");
  revalidatePath(
    getOrganizationReviewPath(endResult.data.organization_id),
  );

  redirect(
    getOrganizationReviewPath(endResult.data.organization_id, {
      status: "support-session-ended",
    }),
  );
}

export async function createPlatformOrganizationAction(formData: FormData) {
  const adminResult = await getActivePlatformAdmin();

  if (!adminResult.ok) {
    if (adminResult.error === "authentication-required") {
      redirect(getLoginPath("/console"));
    }

    redirect(getConsolePath({ error: adminResult.error }));
  }

  if (adminResult.data.role !== "platform_owner") {
    redirect(getConsolePath({ error: "permission-denied" }));
  }

  const user = await getAuthenticatedUser();

  if (!user) {
    redirect(getLoginPath("/console"));
  }

  const organizationName = getFormString(formData, "organizationName");
  const organizationSlug = getFormString(formData, "organizationSlug").toLowerCase();
  const organizationStatus =
    getFormString(formData, "organizationStatus") || "trialing";
  const organizationTimezone =
    getFormString(formData, "organizationTimezone") || "Europe/Madrid";
  const ownerEmail = getFormString(formData, "ownerEmail").toLowerCase();
  const ownerDisplayName = getFormString(formData, "ownerDisplayName");
  const temporaryPassword = getFormString(formData, "temporaryPassword");
  const confirmTemporaryPassword = getFormString(
    formData,
    "confirmTemporaryPassword",
  );
  const allowPlatformActorAsOwner = getFormBoolean(
    formData,
    "allowPlatformActorAsOwner",
  );
  const planCode = getFormString(formData, "planCode").toLowerCase() || "manual";
  const subscriptionStatus =
    getFormString(formData, "subscriptionStatus") || "manual";
  const seatLimit = parseLimit(getFormString(formData, "seatLimit"), 10000);
  const centerLimit = parseLimit(getFormString(formData, "centerLimit"), 1000);

  if (!organizationName || !organizationSlug || !ownerEmail) {
    redirect(getConsolePath({ error: "missing-fields" }));
  }

  if (organizationName.length > 120) {
    redirect(getConsolePath({ error: "invalid-name" }));
  }

  if (!SLUG_PATTERN.test(organizationSlug) || organizationSlug.length > 64) {
    redirect(getConsolePath({ error: "invalid-slug" }));
  }

  if (!isOrganizationCreateStatus(organizationStatus)) {
    redirect(getConsolePath({ error: "invalid-organization-status" }));
  }

  if (
    organizationTimezone.length > 64 ||
    !TIMEZONE_PATTERN.test(organizationTimezone)
  ) {
    redirect(getConsolePath({ error: "invalid-timezone" }));
  }

  if (!EMAIL_PATTERN.test(ownerEmail) || ownerEmail.length > 254) {
    redirect(getConsolePath({ error: "invalid-email" }));
  }

  if (ownerDisplayName.length > 80) {
    redirect(getConsolePath({ error: "display-name-too-long" }));
  }

  if (!PLAN_CODE_PATTERN.test(planCode) || planCode.length > 64) {
    redirect(getConsolePath({ error: "invalid-plan-code" }));
  }

  if (!isSubscriptionStatus(subscriptionStatus)) {
    redirect(getConsolePath({ error: "invalid-subscription-status" }));
  }

  if (seatLimit === null || centerLimit === null) {
    redirect(getConsolePath({ error: "invalid-limit" }));
  }

  if (
    user.email?.toLowerCase() === ownerEmail &&
    !allowPlatformActorAsOwner
  ) {
    redirect(getConsolePath({ error: "owner-confirmation-required" }));
  }

  if (temporaryPassword || confirmTemporaryPassword) {
    const passwordValidation = validatePasswordPolicy(temporaryPassword);

    if (!passwordValidation.ok) {
      redirect(getConsolePath({ error: passwordValidation.error }));
    }

    if (temporaryPassword !== confirmTemporaryPassword) {
      redirect(getConsolePath({ error: "password-mismatch" }));
    }
  }

  let authAdmin: ReturnType<typeof createAdminClient> | null = null;
  let createdOwnerUserId: string | null = null;

  if (temporaryPassword) {
    try {
      authAdmin = createAdminClient();
    } catch {
      redirect(getConsolePath({ error: "auth-admin-not-configured" }));
    }

    const { data: authUserData, error: authUserError } =
      await authAdmin.auth.admin.createUser({
        app_metadata: buildRequiredPasswordChangeAppMetadata(),
        email: ownerEmail,
        email_confirm: true,
        password: temporaryPassword,
        user_metadata: {
          display_name: ownerDisplayName || ownerEmail,
        },
      });

    if (authUserError || !authUserData.user) {
      redirect(
        getConsolePath({
          error: getAuthCreateError(authUserError),
        }),
      );
    }

    createdOwnerUserId = authUserData.user.id;
  }

  const creationResult = await createPlatformOrganizationWithOwner({
    allowPlatformActorAsOwner,
    centerLimit,
    organizationName,
    organizationSlug,
    organizationStatus,
    organizationTimezone,
    ownerDisplayName: ownerDisplayName || null,
    ownerEmail,
    ownerUserId: createdOwnerUserId,
    planCode,
    seatLimit,
    subscriptionStatus,
  });

  if (!creationResult.ok) {
    if (createdOwnerUserId && authAdmin) {
      const { error: deleteError } =
        await authAdmin.auth.admin.deleteUser(createdOwnerUserId);

      redirect(
        getConsolePath({
          error: deleteError
            ? "account-create-rollback-failed"
            : creationResult.error,
        }),
      );
    }

    redirect(getConsolePath({ error: creationResult.error }));
  }

  revalidatePath("/console");
  redirect(
    getConsolePath({
      organizationId: creationResult.data.created_organization_id,
      status: "organization-created",
    }),
  );
}
