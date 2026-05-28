"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getLoginPath } from "@/lib/auth/redirects";
import {
  assignOrganizationBillingPlanManual,
  archiveBillingPlan,
  createBillingPlanDraftVersion,
  publishBillingPlanVersion,
  type BillingErrorCode,
  type BillingPlanDraftInput,
} from "@/lib/billing";
import { getSettingsBillingPath } from "@/lib/navigation/app-paths";
import { isPostgresUuid } from "@/lib/uuid";

const PLAN_CODE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SAFE_STRIPE_PRODUCT_ID_PATTERN = /^prod_[A-Za-z0-9_]+$/;
const SAFE_STRIPE_PRICE_ID_PATTERN = /^price_[A-Za-z0-9_]+$/;

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

function getConsolePlansPath(params?: {
  error?: BillingErrorCode;
  status?: string;
}) {
  const searchParams = new URLSearchParams();

  if (params?.error) {
    searchParams.set("error", params.error);
  }

  if (params?.status) {
    searchParams.set("status", params.status);
  }

  const query = searchParams.toString();

  return query ? `/console/plans?${query}` : "/console/plans";
}

function getConsoleOrganizationPath(
  organizationId: string,
  params?: {
    error?: BillingErrorCode;
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

function getOwnerBillingRedirectPath(
  organizationId: string | null,
  params?: {
    error?: BillingErrorCode;
    status?: string;
  },
) {
  return getSettingsBillingPath({
    error: params?.error,
    organizationId,
    status: params?.status,
  });
}

function parseOptionalInteger(value: string, max: number) {
  if (!value) {
    return null;
  }

  if (!/^\d+$/.test(value)) {
    return undefined;
  }

  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed >= 1 && parsed <= max
    ? parsed
    : undefined;
}

function parseOptionalEuroCents(value: string) {
  if (!value) {
    return null;
  }

  const normalized = value.replace(",", ".").trim();

  if (!/^\d+(?:[.]\d{1,2})?$/.test(normalized)) {
    return undefined;
  }

  const cents = Math.round(Number(normalized) * 100);

  return Number.isInteger(cents) && cents >= 1 ? cents : undefined;
}

function parseOptionalStripeReference(
  value: string,
  pattern: RegExp,
): string | null | undefined {
  if (!value) {
    return null;
  }

  return pattern.test(value) ? value : undefined;
}

function parseFeatures(value: string) {
  const features = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (features.length > 24 || features.some((feature) => feature.length > 120)) {
    return null;
  }

  return features;
}

function getPlanVersion(formData: FormData) {
  const version = parseOptionalInteger(getFormString(formData, "version"), 10000);

  return version === undefined ? null : version;
}

function getSelectedCenterIds(formData: FormData) {
  return formData
    .getAll("keepCenterId")
    .flatMap((value) =>
      typeof value === "string" && value.trim() ? [value.trim()] : [],
    );
}

function validatePlanDraftInput(formData: FormData):
  | {
      input: BillingPlanDraftInput;
      ok: true;
    }
  | {
      error: BillingErrorCode;
      ok: false;
    } {
  const planCode = getFormString(formData, "planCode").toLowerCase();
  const displayName = getFormString(formData, "displayName");
  const description = getFormString(formData, "description");
  const supportLevel = getFormString(formData, "supportLevel");
  const setupDescription = getFormString(formData, "setupDescription") || null;
  const monthlyPriceCents = parseOptionalEuroCents(
    getFormString(formData, "monthlyPrice"),
  );
  const annualPriceCents = parseOptionalEuroCents(
    getFormString(formData, "annualPrice"),
  );
  const setupPriceCents = parseOptionalEuroCents(
    getFormString(formData, "setupPrice"),
  );
  const centerLimit = parseOptionalInteger(
    getFormString(formData, "centerLimit"),
    10000,
  );
  const staffSeatLimit = parseOptionalInteger(
    getFormString(formData, "staffSeatLimit"),
    100000,
  );
  const futureClientLimit = parseOptionalInteger(
    getFormString(formData, "futureClientLimit"),
    1000000,
  );
  const storageGb = parseOptionalInteger(
    getFormString(formData, "storageGb"),
    100000,
  );
  const features = parseFeatures(getFormString(formData, "features"));
  const stripeProductId = parseOptionalStripeReference(
    getFormString(formData, "stripeProductId"),
    SAFE_STRIPE_PRODUCT_ID_PATTERN,
  );
  const stripeMonthlyPriceId = parseOptionalStripeReference(
    getFormString(formData, "stripeMonthlyPriceId"),
    SAFE_STRIPE_PRICE_ID_PATTERN,
  );
  const stripeAnnualPriceId = parseOptionalStripeReference(
    getFormString(formData, "stripeAnnualPriceId"),
    SAFE_STRIPE_PRICE_ID_PATTERN,
  );

  if (!PLAN_CODE_PATTERN.test(planCode) || planCode.length > 64) {
    return {
      error: "invalid-plan-code",
      ok: false,
    };
  }

  if (
    displayName.length < 2 ||
    displayName.length > 80 ||
    description.length < 8 ||
    description.length > 260 ||
    supportLevel.length < 2 ||
    supportLevel.length > 100 ||
    (setupDescription !== null && setupDescription.length > 160)
  ) {
    return {
      error: "invalid-text",
      ok: false,
    };
  }

  if (
    monthlyPriceCents === undefined ||
    annualPriceCents === undefined ||
    setupPriceCents === undefined
  ) {
    return {
      error: "invalid-price",
      ok: false,
    };
  }

  if (
    centerLimit === undefined ||
    staffSeatLimit === undefined ||
    futureClientLimit === undefined ||
    storageGb === undefined
  ) {
    return {
      error: "invalid-limit",
      ok: false,
    };
  }

  if (!features) {
    return {
      error: "invalid-features",
      ok: false,
    };
  }

  if (
    stripeProductId === undefined ||
    stripeMonthlyPriceId === undefined ||
    stripeAnnualPriceId === undefined
  ) {
    return {
      error: "invalid-stripe-reference",
      ok: false,
    };
  }

  return {
    input: {
      annualPriceCents,
      centerLimit,
      description,
      displayName,
      features,
      futureClientLimit,
      monthlyPriceCents,
      planCode,
      setupDescription,
      setupPriceCents,
      staffSeatLimit,
      storageGb,
      stripeAnnualPriceId,
      stripeMonthlyPriceId,
      stripeProductId,
      supportLevel,
    },
    ok: true,
  };
}

export async function createBillingPlanDraftAction(formData: FormData) {
  const validation = validatePlanDraftInput(formData);

  if (!validation.ok) {
    redirect(getConsolePlansPath({ error: validation.error }));
  }

  const result = await createBillingPlanDraftVersion(validation.input);

  if (!result.ok) {
    if (result.error === "authentication-required") {
      redirect(getLoginPath("/console/plans"));
    }

    redirect(getConsolePlansPath({ error: result.error }));
  }

  revalidatePath("/console/plans");
  redirect(getConsolePlansPath({ status: "draft-created" }));
}

export async function publishBillingPlanVersionAction(formData: FormData) {
  const billingPlanVersionId = getFormString(formData, "billingPlanVersionId");

  if (!isPostgresUuid(billingPlanVersionId)) {
    redirect(getConsolePlansPath({ error: "invalid-input" }));
  }

  const result = await publishBillingPlanVersion(billingPlanVersionId);

  if (!result.ok) {
    if (result.error === "authentication-required") {
      redirect(getLoginPath("/console/plans"));
    }

    redirect(getConsolePlansPath({ error: result.error }));
  }

  revalidatePath("/console/plans");
  revalidatePath("/app/settings/billing");
  redirect(getConsolePlansPath({ status: "plan-published" }));
}

export async function archiveBillingPlanAction(formData: FormData) {
  const planCode = getFormString(formData, "planCode");

  const result = await archiveBillingPlan(planCode);

  if (!result.ok) {
    if (result.error === "authentication-required") {
      redirect(getLoginPath("/console/plans"));
    }

    redirect(getConsolePlansPath({ error: result.error }));
  }

  revalidatePath("/console/plans");
  revalidatePath("/app/settings/billing");
  redirect(getConsolePlansPath({ status: "plan-archived" }));
}

export async function assignConsoleOrganizationBillingPlanAction(
  formData: FormData,
) {
  const organizationId = getFormString(formData, "organizationId");
  const planCode = getFormString(formData, "planCode");
  const version = getPlanVersion(formData);
  const keepCenterIds = getSelectedCenterIds(formData);

  if (!isPostgresUuid(organizationId)) {
    redirect(getConsolePlansPath({ error: "invalid-input" }));
  }

  const result = await assignOrganizationBillingPlanManual({
    keepCenterIds,
    organizationId,
    planCode,
    version,
  });

  if (!result.ok) {
    if (result.error === "authentication-required") {
      redirect(getLoginPath(getConsoleOrganizationPath(organizationId)));
    }

    redirect(getConsoleOrganizationPath(organizationId, { error: result.error }));
  }

  revalidatePath("/console");
  revalidatePath(getConsoleOrganizationPath(organizationId));
  revalidatePath("/app/settings/billing");
  redirect(
    getConsoleOrganizationPath(organizationId, {
      status:
        result.data.deactivated_centers_count > 0
          ? "plan-changed-centers-deactivated"
          : "plan-changed",
    }),
  );
}

export async function changeTenantBillingPlanAction(formData: FormData) {
  const organizationId = getFormString(formData, "organizationId");
  const planCode = getFormString(formData, "planCode");
  const version = getPlanVersion(formData);
  const keepCenterIds = getSelectedCenterIds(formData);

  if (!isPostgresUuid(organizationId)) {
    redirect(
      getOwnerBillingRedirectPath(null, {
        error: "invalid-input",
      }),
    );
  }

  const result = await assignOrganizationBillingPlanManual({
    keepCenterIds,
    organizationId,
    planCode,
    version,
  });

  if (!result.ok) {
    if (result.error === "authentication-required") {
      redirect(
        getLoginPath(
          getOwnerBillingRedirectPath(organizationId),
        ),
      );
    }

    redirect(
      getOwnerBillingRedirectPath(organizationId, {
        error: result.error,
      }),
    );
  }

  revalidatePath("/app", "layout");
  revalidatePath("/app/settings/billing");
  revalidatePath("/app/centers");

  redirect(
    getOwnerBillingRedirectPath(organizationId, {
      status:
        result.data.deactivated_centers_count > 0
          ? "plan-changed-centers-deactivated"
          : "plan-changed",
    }),
  );
}
