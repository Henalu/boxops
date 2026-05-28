import { getAuthenticatedUser } from "@/lib/auth/tenant";
import { createClient } from "@/lib/supabase/server";
import { isPostgresUuid } from "@/lib/uuid";

export const BILLING_PLAN_STATUSES = [
  "draft",
  "published",
  "archived",
] as const;

export const BILLING_SUBSCRIPTION_STATUSES = [
  "manual",
  "trialing",
  "active",
  "past_due",
  "paused",
  "cancelled",
] as const;

export type BillingPlanStatus = (typeof BILLING_PLAN_STATUSES)[number];
export type BillingSubscriptionStatus =
  (typeof BILLING_SUBSCRIPTION_STATUSES)[number];

export type BillingErrorCode =
  | "authentication-required"
  | "billing-catalog-load-failed"
  | "billing-change-forbidden"
  | "billing-plan-not-found"
  | "billing-save-failed"
  | "center-limit-reached"
  | "downgrade-selection-invalid"
  | "downgrade-selection-required"
  | "forbidden"
  | "invalid-features"
  | "invalid-input"
  | "invalid-limit"
  | "invalid-plan-code"
  | "invalid-price"
  | "invalid-stripe-reference"
  | "invalid-text";

export type BillingResult<T> =
  | {
      data: T;
      ok: true;
    }
  | {
      error: BillingErrorCode;
      ok: false;
    };

export type BillingPlanVersion = {
  annual_price_cents: number | null;
  archived_at?: string | null;
  billing_plan_id: string;
  billing_plan_status?: BillingPlanStatus;
  billing_plan_version_id: string;
  center_limit: number | null;
  created_at?: string;
  currency: "EUR";
  description: string;
  display_name: string;
  features: string[];
  future_client_limit: number | null;
  monthly_price_cents: number | null;
  plan_code: string;
  published_at: string | null;
  setup_description: string | null;
  setup_price_cents: number | null;
  staff_seat_limit: number | null;
  status?: BillingPlanStatus;
  storage_gb: number | null;
  stripe_annual_price_id: string | null;
  stripe_monthly_price_id: string | null;
  stripe_product_id: string | null;
  support_level: string;
  updated_at?: string;
  version: number;
};

export type OrganizationBillingOverview = {
  active_centers_count: number;
  active_staff_count: number;
  annual_price_cents: number | null;
  billing_email: string | null;
  billing_plan_version_id: string | null;
  center_limit: number | null;
  currency: "EUR";
  current_period_ends_at: string | null;
  description: string;
  display_name: string;
  effective_center_limit: number | null;
  effective_staff_seat_limit: number | null;
  features: string[];
  future_client_limit: number | null;
  monthly_price_cents: number | null;
  organization_id: string;
  plan_code: string;
  plan_version: number | null;
  provider: string;
  setup_description: string | null;
  setup_price_cents: number | null;
  staff_seat_limit: number | null;
  storage_gb: number | null;
  storage_used_gb: number | null;
  subscription_id: string | null;
  subscription_status: BillingSubscriptionStatus;
  support_level: string | null;
  trial_ends_at: string | null;
  updated_at: string | null;
};

export type BillingCenterOption = {
  center_id: string;
  center_name: string;
  center_slug: string;
};

export type BillingPlanDraftInput = {
  annualPriceCents: number | null;
  centerLimit: number | null;
  description: string;
  displayName: string;
  features: string[];
  futureClientLimit: number | null;
  monthlyPriceCents: number | null;
  planCode: string;
  setupDescription: string | null;
  setupPriceCents: number | null;
  staffSeatLimit: number | null;
  storageGb: number | null;
  stripeAnnualPriceId: string | null;
  stripeMonthlyPriceId: string | null;
  stripeProductId: string | null;
  supportLevel: string;
};

export type BillingPlanVersionMutation = {
  billing_plan_id?: string;
  billing_plan_version_id?: string;
  plan_code: string;
  status: BillingPlanStatus;
  version?: number;
};

export type BillingPlanChange = {
  active_centers_count: number;
  deactivated_centers_count: number;
  organization_id: string;
  plan_code: string;
  plan_version: number;
  subscription_id: string;
};

type DatabaseErrorLike = {
  code?: string;
  message?: string;
};

type QueryResponse<T> = {
  data: T | null;
  error: DatabaseErrorLike | null;
};

type UntypedBillingClient = {
  rpc<T>(
    fn: string,
    args?: Record<string, unknown>,
  ): Promise<QueryResponse<T>>;
};

function success<T>(data: T): BillingResult<T> {
  return {
    data,
    ok: true,
  };
}

function failure(error: BillingErrorCode): BillingResult<never> {
  return {
    error,
    ok: false,
  };
}

function getBillingClient(
  supabase: Awaited<ReturnType<typeof createClient>>,
): UntypedBillingClient {
  return supabase as unknown as UntypedBillingClient;
}

function normalizeJsonStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) =>
    typeof item === "string" && item.trim() ? [item.trim()] : [],
  );
}

function normalizePlanVersion(
  value: Record<string, unknown>,
): BillingPlanVersion {
  return {
    annual_price_cents: getNullableNumber(value.annual_price_cents),
    archived_at: getNullableString(value.archived_at),
    billing_plan_id: String(value.billing_plan_id),
    billing_plan_status: normalizeBillingPlanStatus(value.billing_plan_status),
    billing_plan_version_id: String(value.billing_plan_version_id),
    center_limit: getNullableNumber(value.center_limit),
    created_at: getNullableString(value.created_at) ?? undefined,
    currency: "EUR",
    description: String(value.description ?? ""),
    display_name: String(value.display_name ?? ""),
    features: normalizeJsonStringArray(value.features),
    future_client_limit: getNullableNumber(value.future_client_limit),
    monthly_price_cents: getNullableNumber(value.monthly_price_cents),
    plan_code: String(value.plan_code ?? ""),
    published_at: getNullableString(value.published_at),
    setup_description: getNullableString(value.setup_description),
    setup_price_cents: getNullableNumber(value.setup_price_cents),
    staff_seat_limit: getNullableNumber(value.staff_seat_limit),
    status: normalizeBillingPlanStatus(value.status),
    storage_gb: getNullableNumber(value.storage_gb),
    stripe_annual_price_id: getNullableString(value.stripe_annual_price_id),
    stripe_monthly_price_id: getNullableString(value.stripe_monthly_price_id),
    stripe_product_id: getNullableString(value.stripe_product_id),
    support_level: String(value.support_level ?? ""),
    updated_at: getNullableString(value.updated_at) ?? undefined,
    version: Number(value.version ?? 0),
  };
}

function normalizeOverview(
  value: Record<string, unknown>,
): OrganizationBillingOverview {
  const subscriptionStatus = String(
    value.subscription_status ?? "manual",
  ) as BillingSubscriptionStatus;

  return {
    active_centers_count: Number(value.active_centers_count ?? 0),
    active_staff_count: Number(value.active_staff_count ?? 0),
    annual_price_cents: getNullableNumber(value.annual_price_cents),
    billing_email: getNullableString(value.billing_email),
    billing_plan_version_id: getNullableString(value.billing_plan_version_id),
    center_limit: getNullableNumber(value.center_limit),
    currency: "EUR",
    current_period_ends_at: getNullableString(value.current_period_ends_at),
    description: String(value.description ?? ""),
    display_name: String(value.display_name ?? "Plan manual"),
    effective_center_limit: getNullableNumber(value.effective_center_limit),
    effective_staff_seat_limit: getNullableNumber(
      value.effective_staff_seat_limit,
    ),
    features: normalizeJsonStringArray(value.features),
    future_client_limit: getNullableNumber(value.future_client_limit),
    monthly_price_cents: getNullableNumber(value.monthly_price_cents),
    organization_id: String(value.organization_id ?? ""),
    plan_code: String(value.plan_code ?? "manual"),
    plan_version: getNullableNumber(value.plan_version),
    provider: String(value.provider ?? "manual"),
    setup_description: getNullableString(value.setup_description),
    setup_price_cents: getNullableNumber(value.setup_price_cents),
    staff_seat_limit: getNullableNumber(value.staff_seat_limit),
    storage_gb: getNullableNumber(value.storage_gb),
    storage_used_gb: getNullableNumber(value.storage_used_gb),
    subscription_id: getNullableString(value.subscription_id),
    subscription_status: BILLING_SUBSCRIPTION_STATUSES.includes(
      subscriptionStatus,
    )
      ? subscriptionStatus
      : "manual",
    support_level: getNullableString(value.support_level),
    trial_ends_at: getNullableString(value.trial_ends_at),
    updated_at: getNullableString(value.updated_at),
  };
}

function normalizeBillingPlanStatus(value: unknown) {
  const status = String(value ?? "");

  return BILLING_PLAN_STATUSES.includes(status as BillingPlanStatus)
    ? (status as BillingPlanStatus)
    : undefined;
}

function getNullableNumber(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  const numberValue = Number(value);

  return Number.isFinite(numberValue) ? numberValue : null;
}

function getNullableString(value: unknown) {
  return typeof value === "string" && value ? value : null;
}

function mapBillingDatabaseError(
  error: DatabaseErrorLike | null | undefined,
  fallback: BillingErrorCode,
): BillingErrorCode {
  const message = error?.message?.toLowerCase() ?? "";

  if (message.includes("authentication")) {
    return "authentication-required";
  }

  if (
    message.includes("platform_owner") ||
    message.includes("forbidden") ||
    message.includes("role required") ||
    message.includes("row-level security") ||
    message.includes("permission")
  ) {
    return "billing-change-forbidden";
  }

  if (message.includes("center_limit_reached")) {
    return "center-limit-reached";
  }

  if (message.includes("downgrade center selection required")) {
    return "downgrade-selection-required";
  }

  if (message.includes("downgrade center selection contains invalid centers")) {
    return "downgrade-selection-invalid";
  }

  if (message.includes("plan code")) {
    return "invalid-plan-code";
  }

  if (message.includes("published plan version not found")) {
    return "billing-plan-not-found";
  }

  if (message.includes("stripe reference")) {
    return "invalid-stripe-reference";
  }

  if (message.includes("features")) {
    return "invalid-features";
  }

  if (message.includes("numeric") || message.includes("price")) {
    return "invalid-price";
  }

  if (message.includes("text") || message.includes("description")) {
    return "invalid-text";
  }

  return fallback;
}

async function getAuthenticatedBillingClient(): Promise<
  BillingResult<UntypedBillingClient>
> {
  const user = await getAuthenticatedUser();

  if (!user) {
    return failure("authentication-required");
  }

  const supabase = await createClient();

  return success(getBillingClient(supabase));
}

export async function listPublishedBillingPlans(): Promise<
  BillingResult<BillingPlanVersion[]>
> {
  const clientResult = await getAuthenticatedBillingClient();

  if (!clientResult.ok) {
    return clientResult;
  }

  const { data, error } = await clientResult.data.rpc<Record<string, unknown>[]>(
    "list_published_billing_plan_versions",
  );

  if (error) {
    return failure(
      mapBillingDatabaseError(error, "billing-catalog-load-failed"),
    );
  }

  return success((data ?? []).map(normalizePlanVersion));
}

export async function listConsoleBillingPlanVersions(): Promise<
  BillingResult<BillingPlanVersion[]>
> {
  const clientResult = await getAuthenticatedBillingClient();

  if (!clientResult.ok) {
    return clientResult;
  }

  const { data, error } = await clientResult.data.rpc<Record<string, unknown>[]>(
    "list_console_billing_plan_versions",
  );

  if (error) {
    return failure(
      mapBillingDatabaseError(error, "billing-catalog-load-failed"),
    );
  }

  return success((data ?? []).map(normalizePlanVersion));
}

export async function getOrganizationBillingOverview(
  organizationId: string,
): Promise<BillingResult<OrganizationBillingOverview>> {
  if (!isPostgresUuid(organizationId)) {
    return failure("invalid-input");
  }

  const clientResult = await getAuthenticatedBillingClient();

  if (!clientResult.ok) {
    return clientResult;
  }

  const { data, error } = await clientResult.data.rpc<Record<string, unknown>[]>(
    "get_organization_billing_overview",
    {
      target_organization_id: organizationId,
    },
  );

  if (error) {
    return failure(mapBillingDatabaseError(error, "billing-catalog-load-failed"));
  }

  const [overview] = data ?? [];

  if (!overview) {
    return failure("billing-catalog-load-failed");
  }

  return success(normalizeOverview(overview));
}

export async function listBillingActiveCenters(
  organizationId: string,
): Promise<BillingResult<BillingCenterOption[]>> {
  if (!isPostgresUuid(organizationId)) {
    return failure("invalid-input");
  }

  const clientResult = await getAuthenticatedBillingClient();

  if (!clientResult.ok) {
    return clientResult;
  }

  const { data, error } = await clientResult.data.rpc<BillingCenterOption[]>(
    "list_billing_active_centers",
    {
      target_organization_id: organizationId,
    },
  );

  if (error) {
    return failure(mapBillingDatabaseError(error, "billing-catalog-load-failed"));
  }

  return success(data ?? []);
}

export async function createBillingPlanDraftVersion(
  input: BillingPlanDraftInput,
): Promise<BillingResult<BillingPlanVersionMutation>> {
  const clientResult = await getAuthenticatedBillingClient();

  if (!clientResult.ok) {
    return clientResult;
  }

  const { data, error } =
    await clientResult.data.rpc<BillingPlanVersionMutation[]>(
      "create_billing_plan_draft_version",
      {
        target_annual_price_cents: input.annualPriceCents,
        target_center_limit: input.centerLimit,
        target_description: input.description,
        target_display_name: input.displayName,
        target_features: input.features,
        target_future_client_limit: input.futureClientLimit,
        target_monthly_price_cents: input.monthlyPriceCents,
        target_plan_code: input.planCode,
        target_setup_description: input.setupDescription,
        target_setup_price_cents: input.setupPriceCents,
        target_staff_seat_limit: input.staffSeatLimit,
        target_storage_gb: input.storageGb,
        target_stripe_annual_price_id: input.stripeAnnualPriceId,
        target_stripe_monthly_price_id: input.stripeMonthlyPriceId,
        target_stripe_product_id: input.stripeProductId,
        target_support_level: input.supportLevel,
      },
    );

  if (error) {
    return failure(mapBillingDatabaseError(error, "billing-save-failed"));
  }

  const [created] = data ?? [];

  return created ? success(created) : failure("billing-save-failed");
}

export async function publishBillingPlanVersion(
  billingPlanVersionId: string,
): Promise<BillingResult<BillingPlanVersionMutation>> {
  if (!isPostgresUuid(billingPlanVersionId)) {
    return failure("invalid-input");
  }

  const clientResult = await getAuthenticatedBillingClient();

  if (!clientResult.ok) {
    return clientResult;
  }

  const { data, error } =
    await clientResult.data.rpc<BillingPlanVersionMutation[]>(
      "publish_billing_plan_version",
      {
        target_billing_plan_version_id: billingPlanVersionId,
      },
    );

  if (error) {
    return failure(mapBillingDatabaseError(error, "billing-save-failed"));
  }

  const [published] = data ?? [];

  return published ? success(published) : failure("billing-save-failed");
}

export async function archiveBillingPlan(
  planCode: string,
): Promise<BillingResult<BillingPlanVersionMutation>> {
  const normalizedPlanCode = planCode.trim().toLowerCase();

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalizedPlanCode)) {
    return failure("invalid-plan-code");
  }

  const clientResult = await getAuthenticatedBillingClient();

  if (!clientResult.ok) {
    return clientResult;
  }

  const { data, error } =
    await clientResult.data.rpc<BillingPlanVersionMutation[]>(
      "archive_billing_plan",
      {
        target_plan_code: normalizedPlanCode,
      },
    );

  if (error) {
    return failure(mapBillingDatabaseError(error, "billing-save-failed"));
  }

  const [archived] = data ?? [];

  return archived ? success(archived) : failure("billing-save-failed");
}

export async function assignOrganizationBillingPlanManual(input: {
  keepCenterIds: string[];
  organizationId: string;
  planCode: string;
  version: number | null;
}): Promise<BillingResult<BillingPlanChange>> {
  if (!isPostgresUuid(input.organizationId)) {
    return failure("invalid-input");
  }

  const keepCenterIds = input.keepCenterIds.map((id) => id.trim());

  if (keepCenterIds.some((id) => !isPostgresUuid(id))) {
    return failure("downgrade-selection-invalid");
  }

  const clientResult = await getAuthenticatedBillingClient();

  if (!clientResult.ok) {
    return clientResult;
  }

  const { data, error } = await clientResult.data.rpc<BillingPlanChange[]>(
    "assign_organization_billing_plan_manual",
    {
      target_keep_center_ids: keepCenterIds,
      target_organization_id: input.organizationId,
      target_plan_code: input.planCode,
      target_version: input.version,
    },
  );

  if (error) {
    return failure(mapBillingDatabaseError(error, "billing-save-failed"));
  }

  const [changed] = data ?? [];

  return changed ? success(changed) : failure("billing-save-failed");
}

export function formatPlanPrice(plan: {
  annual_price_cents?: number | null;
  currency?: string | null;
  monthly_price_cents?: number | null;
}) {
  if (plan.monthly_price_cents === null || plan.monthly_price_cents === undefined) {
    return "Hablemos";
  }

  const monthly = new Intl.NumberFormat("es-ES", {
    currency: plan.currency ?? "EUR",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(plan.monthly_price_cents / 100);

  const annual =
    plan.annual_price_cents === null || plan.annual_price_cents === undefined
      ? null
      : new Intl.NumberFormat("es-ES", {
          currency: plan.currency ?? "EUR",
          maximumFractionDigits: 0,
          style: "currency",
        }).format(plan.annual_price_cents / 100);

  return annual ? `${monthly}/mes o ${annual}/ano` : `${monthly}/mes`;
}

export function formatPlanLimit(value: number | null, customLabel = "A medida") {
  return value === null
    ? customLabel
    : new Intl.NumberFormat("es-ES").format(value);
}
