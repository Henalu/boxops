import { expect, test } from "@playwright/test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import {
  hasCredentials,
  ownerCredentials,
  platformAdminCredentials,
} from "./helpers/env";
import {
  buildProtectedPath,
  expectNoFrameworkError,
  loginAs,
} from "./helpers/session";

function readProjectFile(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

function collectSourceFiles(directory: string): string[] {
  if (!existsSync(directory)) {
    return [];
  }

  return readdirSync(directory).flatMap((entry) => {
    const fullPath = path.join(directory, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      return collectSourceFiles(fullPath);
    }

    return /\.(ts|tsx|sql)$/.test(entry) ? [fullPath] : [];
  });
}

function readSourceTree(relativeDirectory: string) {
  return collectSourceFiles(path.join(process.cwd(), relativeDirectory))
    .map((filePath) => readFileSync(filePath, "utf8"))
    .join("\n");
}

function findMigrationWith(needle: string) {
  const migrationsDirectory = path.join(process.cwd(), "supabase/migrations");
  const matches = readdirSync(migrationsDirectory)
    .filter((entry) => entry.endsWith(".sql"))
    .filter((entry) =>
      readFileSync(path.join(migrationsDirectory, entry), "utf8").includes(
        needle,
      ),
    )
    .sort();

  expect(matches, `migration containing ${needle}`).toHaveLength(1);

  return `supabase/migrations/${matches[0]}`;
}

function expectPolicyDropBeforeCreate(
  source: string,
  policyName: string,
  tableName: string,
) {
  const normalizedSource = source.replace(/\r\n/g, "\n");
  const dropStatement = `DROP POLICY IF EXISTS "${policyName}"\n  ON public.${tableName};`;
  const createStatement = `CREATE POLICY "${policyName}"\n  ON public.${tableName} FOR SELECT TO authenticated`;
  const dropIndex = normalizedSource.indexOf(dropStatement);
  const createIndex = normalizedSource.indexOf(createStatement);

  expect(dropIndex, `${policyName} drop statement`).toBeGreaterThanOrEqual(0);
  expect(createIndex, `${policyName} create statement`).toBeGreaterThanOrEqual(0);
  expect(createIndex, `${policyName} create after drop`).toBeGreaterThan(dropIndex);
}

test.describe("billing plans foundation guardrails", () => {
  test("adds versioned catalog, snapshots, RLS and founder pricing seeds", () => {
    const migration = readProjectFile(
      findMigrationWith("CREATE TABLE public.billing_plans"),
    );

    expect(migration).toContain("CREATE TABLE public.billing_plans");
    expect(migration).toContain("CREATE TABLE public.billing_plan_versions");
    expect(migration).toContain(
      "ALTER TABLE public.billing_plans ENABLE ROW LEVEL SECURITY;",
    );
    expect(migration).toContain(
      "ALTER TABLE public.billing_plan_versions ENABLE ROW LEVEL SECURITY;",
    );
    expect(migration).toContain(
      "Platform billing can read all billing plan versions",
    );
    expect(migration).toContain(
      "Tenant billing readers can read published billing plan versions",
    );
    expect(migration).toContain(
      "Tenant billing readers can read own subscription rows",
    );
    expect(migration).toContain(
      "public.has_org_role(target_organization_id, ARRAY['owner']);",
    );

    for (const column of [
      "billing_plan_version_id",
      "plan_version",
      "plan_display_name",
      "monthly_price_cents",
      "annual_price_cents",
      "setup_price_cents",
      "staff_seat_limit",
      "future_client_limit",
      "storage_gb",
      "support_level",
      "stripe_product_id",
      "stripe_monthly_price_id",
      "stripe_annual_price_id",
    ]) {
      expect(migration).toContain(column);
    }

    for (const seed of [
      "'starter'",
      "3900",
      "39000",
      "'box'",
      "6900",
      "69000",
      "'growth'",
      "11900",
      "119000",
      "'scale'",
      "19900",
      "199000",
      "'network'",
      "34900",
      "349000",
      "'franchise'",
      "69900",
      "699000",
      "'enterprise'",
    ]) {
      expect(migration).toContain(seed);
    }

    expect(migration).toContain("19900");
    expect(migration).toContain("39900");
    expect(migration).toContain("59900");
    expect(migration).toContain("'EUR'");
    expect(migration).toContain("list_published_billing_plan_versions");
    expect(migration).toContain("list_console_billing_plan_versions");
    expect(migration).toContain("calculate_organization_billing_usage");
    expect(migration).toContain("assign_organization_billing_plan_manual");
  });

  test("enforces center limit on create and downgrades by inactivating centers", () => {
    const migration = readProjectFile(
      findMigrationWith("enforce_center_limit_on_insert"),
    );
    const centersAction = readProjectFile("src/app/(app)/app/centers/actions.ts");
    const centersPage = readProjectFile("src/app/(app)/app/centers/page.tsx");
    const ownerBillingPage = readProjectFile(
      "src/app/(app)/app/settings/billing/page.tsx",
    );
    const consoleOrgPage = readProjectFile(
      "src/app/(console)/console/organizations/[organizationId]/page.tsx",
    );

    expect(migration).toContain("centers_enforce_billing_center_limit");
    expect(migration).toContain("center_limit_reached");
    expect(migration).toContain("BEFORE INSERT ON public.centers");
    expect(migration).toContain("UPDATE public.centers center_record");
    expect(migration).toContain("SET status = 'inactive'");
    expect(migration).not.toMatch(/DELETE FROM public\.centers/i);

    expect(centersAction).toContain("center_limit_reached");
    expect(centersPage).toContain("center-limit-reached");
    expect(centersPage).toContain("Plan y facturacion");
    expect(ownerBillingPage).toContain('name="keepCenterId"');
    expect(ownerBillingPage).toMatch(
      /Los no\s+seleccionados pasaran a inactivos/,
    );
    expect(consoleOrgPage).toContain("ConsoleDowngradeSelector");
    expect(consoleOrgPage).toContain('name="keepCenterId"');
    expect(consoleOrgPage).toContain("assignConsoleOrganizationBillingPlanAction");
  });

  test("keeps billing RLS policies idempotent and read-scoped", () => {
    const migration = readProjectFile(
      findMigrationWith("CREATE TABLE public.billing_plans"),
    );

    for (const [policyName, tableName] of [
      ["Platform billing can read all billing plans", "billing_plans"],
      [
        "Tenant billing readers can read published billing plans",
        "billing_plans",
      ],
      [
        "Platform billing can read all billing plan versions",
        "billing_plan_versions",
      ],
      [
        "Tenant billing readers can read published billing plan versions",
        "billing_plan_versions",
      ],
      [
        "Tenant billing readers can read own subscription rows",
        "organization_subscriptions",
      ],
    ] as const) {
      expectPolicyDropBeforeCreate(migration, policyName, tableName);
    }

    expect(migration).toContain(
      "USING (public.can_read_platform_subscription_rows());",
    );
    expect(migration).toContain("AND public.has_any_tenant_billing_role()");
    expect(migration).toContain(
      "USING (public.has_org_role(organization_id, ARRAY['owner', 'admin']));",
    );
    expect(migration).not.toMatch(
      /CREATE POLICY "(?:Platform billing|Tenant billing)[\s\S]{0,180}FOR\s+(?:ALL|INSERT|UPDATE|DELETE)\s+TO authenticated/i,
    );
  });

  test("exposes owner billing and console plans without real payment flows", () => {
    const ownerBillingPage = readProjectFile(
      "src/app/(app)/app/settings/billing/page.tsx",
    );
    const consolePlansPage = readProjectFile(
      "src/app/(console)/console/plans/page.tsx",
    );
    const billingActions = readProjectFile("src/lib/billing-actions.ts");
    const source = readSourceTree("src");

    expect(
      existsSync(
        path.join(process.cwd(), "src/app/(app)/app/settings/billing/page.tsx"),
      ),
    ).toBe(true);
    expect(
      existsSync(
        path.join(process.cwd(), "src/app/(console)/console/plans/page.tsx"),
      ),
    ).toBe(true);

    expect(ownerBillingPage).toContain("listPublishedBillingPlans");
    expect(ownerBillingPage).toContain("changeTenantBillingPlanAction");
    expect(ownerBillingPage).toContain("Precios founder sin IVA");
    expect(ownerBillingPage).toContain("El pago se conectara mas adelante");

    expect(consolePlansPage).toContain("createBillingPlanDraftAction");
    expect(consolePlansPage).toContain("publishBillingPlanVersionAction");
    expect(consolePlansPage).toContain("archiveBillingPlanAction");
    expect(consolePlansPage).toContain(
      'adminResult.data.role === "platform_owner"',
    );
    expect(consolePlansPage).toContain('adminResult.data.role === "billing"');
    expect(consolePlansPage).toContain("no publicar ni");

    expect(billingActions).toContain("SAFE_STRIPE_PRODUCT_ID_PATTERN");
    expect(billingActions).toContain("SAFE_STRIPE_PRICE_ID_PATTERN");
    expect(source).not.toMatch(
      /from\s+["']stripe["']|require\(["']stripe["']\)|process\.env\.STRIPE|checkout\.sessions|stripe\.webhooks|customerPortal|customer\s*portal/i,
    );
    expect(source).not.toMatch(
      /name=["'](?:card|cardNumber|iban|bank_account|account_number|routing|swift|bic|cvv|mandate|payment_method)["']/i,
    );
  });
});

test.describe("billing plans visual smoke", () => {
  test.setTimeout(120_000);

  test("platform admin can open console plans without payment surfaces", async ({
    page,
  }) => {
    test.skip(
      !hasCredentials(platformAdminCredentials),
      "Configura E2E_PLATFORM_ADMIN_EMAIL y E2E_PLATFORM_ADMIN_PASSWORD para smoke visual de /console/plans.",
    );

    await loginAs(page, platformAdminCredentials!);
    await page.goto("/console/plans", { waitUntil: "domcontentloaded" });
    await expectNoFrameworkError(page);

    await expect(page.getByRole("heading", { name: /^Planes$/i })).toBeVisible();
    await expect(page.getByText(/Catalogo comercial/i).first()).toBeVisible();
    await expect(page.getByText(/Checkout|Customer Portal|IBAN|tarjeta/i)).toHaveCount(
      0,
    );
  });

  test("owner can open billing settings without payment forms", async ({
    page,
  }) => {
    test.skip(
      !hasCredentials(ownerCredentials),
      "Configura E2E_OWNER_EMAIL y E2E_OWNER_PASSWORD para smoke visual de /app/settings/billing.",
    );

    await loginAs(page, ownerCredentials!);
    await page.goto(buildProtectedPath("/app/settings/billing"), {
      waitUntil: "domcontentloaded",
    });
    await expectNoFrameworkError(page);

    await expect(
      page.getByRole("heading", { name: /Plan y facturacion/i }).first(),
    ).toBeVisible();
    test.skip(
      await page
        .getByText(/No se pudo cargar la facturacion/i)
        .first()
        .isVisible()
        .catch(() => false),
      "La DB local no tiene aplicada la migracion de billing; el smoke visual autenticado queda bloqueado por datos, no por UI.",
    );
    await expect(page.getByText(/Planes disponibles/i).first()).toBeVisible();
    await expect(page.locator('input[name="card"], input[name="iban"]')).toHaveCount(
      0,
    );
  });
});
