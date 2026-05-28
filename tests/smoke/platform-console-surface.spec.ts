import { expect, test } from "@playwright/test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import {
  hasCredentials,
  platformAdminCredentials,
} from "./helpers/env";
import { expectNoFrameworkError, loginAs } from "./helpers/session";

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

    return /\.(ts|tsx)$/.test(entry) ? [fullPath] : [];
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
  usingExpression: string,
) {
  const normalizedSource = source.replace(/\r\n/g, "\n");
  const dropStatement = `DROP POLICY IF EXISTS "${policyName}"\n  ON public.${tableName};`;
  const createStatement = `CREATE POLICY "${policyName}"\n  ON public.${tableName} FOR SELECT TO authenticated\n  USING (${usingExpression});`;
  const dropIndex = normalizedSource.indexOf(dropStatement);
  const createIndex = normalizedSource.indexOf(createStatement);

  expect(dropIndex, `${policyName} drop statement`).toBeGreaterThanOrEqual(0);
  expect(createIndex, `${policyName} create statement`).toBeGreaterThanOrEqual(0);
  expect(createIndex, `${policyName} create after drop`).toBeGreaterThan(dropIndex);
}

test.describe("BoxOps Console visible surface guardrails", () => {
  test("anonymous users are redirected from /console to login", async ({
    baseURL,
    request,
  }) => {
    const response = await request.get("/console", { maxRedirects: 0 });

    expect([302, 303, 307, 308]).toContain(response.status());

    const location = response.headers().location;
    expect(location).toBeTruthy();

    const redirectUrl = new URL(location!, baseURL);
    expect(redirectUrl.pathname).toBe("/login");
    expect(redirectUrl.searchParams.get("redirectTo")).toBe("/console");
  });

  test("anonymous users are redirected from organization review to login", async ({
    baseURL,
    request,
  }) => {
    const reviewPath =
      "/console/organizations/00000000-0000-4000-8000-000000000000";
    const response = await request.get(reviewPath, { maxRedirects: 0 });

    expect([302, 303, 307, 308]).toContain(response.status());

    const location = response.headers().location;
    expect(location).toBeTruthy();

    const redirectUrl = new URL(location!, baseURL);
    expect(redirectUrl.pathname).toBe("/login");
    expect(redirectUrl.searchParams.get("redirectTo")).toBe(reviewPath);
  });

  test("keeps role copy removed and creation flow visually integrated", () => {
    const consoleSource = readSourceTree("src/app/(console)");

    expect(consoleSource).not.toContain("Alcance de rol");
    expect(consoleSource).not.toContain(
      "Platform owner puede crear organizaciones, asignar owner inicial y registrar suscripcion manual. Las acciones quedan auditadas.",
    );
    expect(consoleSource).toContain("<details");
    expect(consoleSource).toContain("Datos de alta");
    expect(consoleSource).toContain("Abrir");
    expect(consoleSource).toContain("Cerrar");
    expect(consoleSource).toContain("Los campos con * son obligatorios");
    expect(consoleSource).toContain("FieldLabelText");
    expect(consoleSource).not.toMatch(/CardTitle[\s\S]{0,160}Crear organizacion/);
    expect(consoleSource).toMatch(/type="submit"[\s\S]+Crear organizacion/);
    expect(consoleSource).toContain(
      "{isPlatformOwner ? <CreateOrganizationSection /> : null}",
    );

    for (const fieldName of [
      "organizationName",
      "organizationSlug",
      "organizationStatus",
      "organizationTimezone",
      "ownerEmail",
      "planCode",
      "subscriptionStatus",
      "seatLimit",
      "centerLimit",
    ]) {
      expect(consoleSource).toMatch(
        new RegExp(`name="${fieldName}"[\\s\\S]{0,500}required`),
      );
    }
  });

  test("renders Console action feedback as transient banners", () => {
    const consoleListPage = readProjectFile("src/app/(console)/console/page.tsx");
    const organizationReviewPage = readProjectFile(
      "src/app/(console)/console/organizations/[organizationId]/page.tsx",
    );
    const consoleFeedbackState = consoleListPage.slice(
      consoleListPage.indexOf("function FeedbackState"),
      consoleListPage.indexOf("function AccessDeniedState"),
    );
    const reviewFeedbackState = organizationReviewPage.slice(
      organizationReviewPage.indexOf("function ReviewFeedbackState"),
      organizationReviewPage.indexOf("function OrganizationReviewHeader"),
    );

    expect(consoleFeedbackState).toContain("TransientFeedbackBanner");
    expect(consoleFeedbackState).not.toContain("<Alert");
    expect(consoleFeedbackState).toContain(
      'clearParams={["error", "organizationId", "status"]}',
    );
    expect(reviewFeedbackState).toContain("TransientFeedbackBanner");
    expect(reviewFeedbackState).not.toContain("<Alert");
  });

  test("keeps Console SSR/RLS-only and separated from tenant app navigation", () => {
    const consoleSource = readSourceTree("src/app/(console)");
    const tenantAppSource = readSourceTree("src/app/(app)");
    const appLayoutSource = readProjectFile("src/app/(app)/app/layout.tsx");
    const appMoreSource = readProjectFile("src/app/(app)/app/more/page.tsx");
    const appNavigationSource = readProjectFile(
      "src/components/layout/app-navigation.tsx",
    );
    const proxySource = readProjectFile("src/proxy.ts");
    const packageManifest = readProjectFile("package.json");
    const sourceWithoutAllowedAdminHelper = collectSourceFiles(
      path.join(process.cwd(), "src"),
    )
      .filter(
        (filePath) =>
          path.relative(process.cwd(), filePath).replace(/\\/g, "/") !==
          "src/lib/supabase/admin.ts",
      )
      .map((filePath) => readFileSync(filePath, "utf8"))
      .join("\n");

    expect(proxySource).toContain('"/console/:path*"');

    expect(consoleSource).toContain("getActivePlatformAdmin");
    expect(consoleSource).toContain("listPlatformOrganizationSummaries");
    expect(consoleSource).toContain("getPlatformOrganizationReview");
    expect(consoleSource).toContain("createPlatformOrganizationAction");
    expect(consoleSource).not.toMatch(
      /createClient|createServerClient|\.from\(|\.rpc\(/,
    );
    expect(consoleSource).not.toMatch(
      /createAdminClient|auth\.admin|SUPABASE_SERVICE_ROLE|service_role/i,
    );
    expect(consoleSource).not.toMatch(
      /from\s+["']stripe["']|require\(["']stripe["']\)|process\.env\.STRIPE|checkout|webhook|customer\s*portal/i,
    );
    expect(consoleSource).not.toMatch(
      /\b(?:iban|bank_account|account_number|routing|swift|bic|cvv|mandate|payment_method|card_number)\b/i,
    );

    expect(sourceWithoutAllowedAdminHelper).not.toMatch(
      /\bservice_role\b|SUPABASE_SERVICE_ROLE/,
    );
    expect(sourceWithoutAllowedAdminHelper).not.toMatch(
      /from\s+["']stripe["']|require\(["']stripe["']\)|process\.env\.STRIPE|stripe\.webhooks|checkout\.sessions|customerPortal|customer\s*portal/i,
    );
    expect(packageManifest).not.toMatch(/"stripe"\s*:/i);

    expect(appLayoutSource).toContain("getActivePlatformAdmin");
    expect(appLayoutSource).toMatch(/canOpenConsole[\s\S]+href="\/console"/);
    expect(appMoreSource).toContain("getActivePlatformAdmin");
    expect(appMoreSource).toMatch(/canOpenConsole[\s\S]+href="\/console"/);
    expect(appNavigationSource).not.toContain("/console");
    expect(tenantAppSource).not.toMatch(/getAppPath\(["']\/console/);
    expect(
      existsSync(
        path.join(process.cwd(), "src/app/(app)/app/settings/billing"),
      ),
    ).toBe(true);
    expect(readSourceTree("src/app/(app)/app/settings")).toContain(
      "changeTenantBillingPlanAction",
    );
  });

  test("keeps tenant creation behind platform_owner helper, action and RPC", () => {
    const consoleSource = readSourceTree("src/app/(console)");
    const platformAction = readProjectFile("src/lib/platform-console-actions.ts");
    const platformHelper = readProjectFile("src/lib/platform-console.ts");
    const migration = readProjectFile(
      findMigrationWith("create_platform_organization_with_owner"),
    );

    expect(consoleSource).toContain("createPlatformOrganizationAction");
    expect(consoleSource).toContain(
      'adminResult.data.role === "platform_owner"',
    );
    expect(consoleSource).toContain(
      "{isPlatformOwner ? <CreateOrganizationSection /> : null}",
    );
    expect(consoleSource).not.toMatch(/\.from\(|\.rpc\(|createClient/);

    expect(platformAction).toContain("getActivePlatformAdmin");
    expect(platformAction).toContain(
      'adminResult.data.role !== "platform_owner"',
    );
    expect(platformAction).toContain("createPlatformOrganizationWithOwner");
    expect(platformAction).toContain("createAdminClient");
    expect(platformAction).toContain(
      "buildRequiredPasswordChangeAppMetadata",
    );
    expect(platformAction).not.toMatch(/SUPABASE_SERVICE_ROLE|service_role/i);

    expect(platformHelper).toContain("createPlatformOrganizationWithOwner");
    expect(platformHelper).toContain(
      'context.data.admin.role !== "platform_owner"',
    );
    expect(platformHelper).toContain('"create_platform_organization_with_owner"');

    expect(migration).toContain("current_platform_admin.role <> 'platform_owner'");
    expect(migration).toContain("INSERT INTO public.organizations");
    expect(migration).toContain("INSERT INTO public.organization_memberships");
    expect(migration).toContain("'owner'");
    expect(migration).toContain("INSERT INTO public.person_profiles");
    expect(migration).toContain("INSERT INTO public.organization_subscriptions");
    expect(migration).toContain("INSERT INTO public.platform_audit_events");
    expect(migration).toContain("'organizations'");
    expect(migration).toContain("'organization_memberships'");
    expect(migration).toContain("'organization_subscriptions'");
    expect(migration).toContain("target_allow_platform_actor_as_owner");
    expect(migration).not.toMatch(
      /\b(?:card_number|iban|mandate|account_number|routing|swift|bic|cvv|payment_method)\b/i,
    );
  });

  test("exposes controlled organization review without tenant membership side effects", () => {
    const consoleSource = readSourceTree("src/app/(console)");
    const consoleListPage = readProjectFile("src/app/(console)/console/page.tsx");
    const organizationReviewPage = readProjectFile(
      "src/app/(console)/console/organizations/[organizationId]/page.tsx",
    );
    const platformHelper = readProjectFile("src/lib/platform-console.ts");
    const platformAction = readProjectFile("src/lib/platform-console-actions.ts");

    expect(consoleSource).toContain("Revisar organizacion");
    expect(consoleSource).toContain("/console/organizations/${organizationId}");
    expect(consoleSource).toContain("getPlatformOrganizationReview");
    expect(consoleSource).toContain("createPlatformSupportSessionAction");
    expect(consoleSource).toContain("Abrir soporte temporal");
    expect(consoleSource).toContain('name="durationMinutes"');
    expect(consoleSource).toContain("sesion tecnica auditada");
    expect(consoleSource).toContain("No crea usuarios permanentes");
    expect(consoleSource).not.toMatch(/href=["']\/app[/?'"]/);
    expect(consoleSource).not.toMatch(/INSERT INTO public\.organization_memberships/i);
    expect(consoleListPage).not.toContain("Suspender acceso");
    expect(consoleListPage).not.toContain("Reactivar");
    expect(organizationReviewPage).toContain(
      "updatePlatformOrganizationAccessAction",
    );
    expect(organizationReviewPage).toContain("Suspender acceso");
    expect(organizationReviewPage).toContain("Reactivar");
    expect(organizationReviewPage).toContain(
      'adminResult.data.role === "platform_owner"',
    );
    expect(organizationReviewPage).toMatch(
      /No\s+borra datos ni cambia\s+usuarios\./,
    );
    expect(organizationReviewPage).toContain(
      'name="confirmOrganizationAccessChange"',
    );
    expect(organizationReviewPage).toContain("maxLength={160}");

    expect(platformHelper).toContain("getPlatformOrganizationReview");
    expect(platformHelper).toContain("setPlatformOrganizationAccessStatus");
    expect(platformHelper).toContain(
      'context.data.admin.role !== "platform_owner"',
    );
    expect(platformHelper).toContain(
      '"set_platform_organization_access_status"',
    );
    expect(platformHelper).toContain("isPlatformOrganizationId");
    expect(platformHelper).toContain("listPlatformOrganizationSummaries");
    expect(platformHelper).not.toMatch(/createAdminClient|auth\.admin/i);
    expect(platformAction).not.toMatch(/imperson/i);
  });

  test("creates audited support sessions without permanent tenant membership", () => {
    const consoleSource = readSourceTree("src/app/(console)");
    const appLayout = readProjectFile("src/app/(app)/app/layout.tsx");
    const appNavigation = readProjectFile(
      "src/components/layout/app-navigation.tsx",
    );
    const tenantHelper = readProjectFile("src/lib/auth/tenant.ts");
    const platformHelper = readProjectFile("src/lib/platform-console.ts");
    const platformAction = readProjectFile("src/lib/platform-console-actions.ts");
    const migration = readProjectFile(
      findMigrationWith("create_platform_support_session"),
    );

    expect(consoleSource).toContain("createPlatformSupportSessionAction");
    expect(consoleSource).toContain("Abrir soporte temporal");
    expect(consoleSource).toContain("Motivo de soporte");
    expect(consoleSource).toContain("Revision tecnica solicitada por la organizacion.");
    expect(consoleSource).toContain("Duracion de la sesion");
    expect(consoleSource).toContain("abre otra");
    expect(consoleSource).toContain("sesion tecnica auditada");
    expect(consoleSource).not.toContain('name="confirmSupportSession"');

    expect(platformAction).toContain("createPlatformSupportSessionAction");
    expect(platformAction).toContain("DEFAULT_SUPPORT_SESSION_REASON");
    expect(platformAction).toContain("getActivePlatformAdmin");
    expect(platformAction).toContain(
      'adminResult.data.role !== "platform_owner"',
    );
    expect(platformAction).toContain('adminResult.data.role !== "support"');
    expect(platformAction).toContain("PLATFORM_SUPPORT_SESSION_COOKIE_NAME");
    expect(platformAction).toContain("endPlatformSupportSessionAction");
    expect(platformAction).not.toMatch(/createAdminClient\(\)[\s\S]+createPlatformSupportSessionAction/);

    expect(platformHelper).toContain("createPlatformSupportSession");
    expect(platformHelper).toContain("support-session-start-failed");
    expect(platformHelper).toContain("endPlatformSupportSession");
    expect(platformHelper).toContain('"create_platform_support_session"');
    expect(platformHelper).toContain('"end_platform_support_session"');
    expect(platformHelper).toContain("platform_owner");
    expect(platformHelper).toContain("support");

    expect(tenantHelper).toContain("get_active_platform_support_session");
    expect(tenantHelper).toContain("accessMode: \"platform_support\"");
    expect(tenantHelper).toContain("PLATFORM_SUPPORT_ACCESS_ROLE");
    expect(tenantHelper).toContain("supportMembership,");
    expect(tenantHelper).toContain(
      "membership.organization_id !== supportMembership.organization_id",
    );
    expect(tenantHelper).not.toContain(
      "existingOrganizationIds.has(supportSession.organization_id)",
    );
    expect(appLayout).toContain("PlatformSupportModeBanner");
    expect(appLayout).toContain("Modo soporte BoxOps activo");
    expect(appLayout).toContain("endPlatformSupportSessionAction");
    expect(appNavigation).toContain("PLATFORM_SUPPORT_ACCESS_ROLE");

    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.create_platform_support_session",
    );
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.end_platform_support_session",
    );
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.get_active_platform_support_session",
    );
    expect(migration).toContain("public.has_active_platform_support_session");
    expect(migration).toContain("'support_started'");
    expect(migration).toContain("'support_ended'");
    expect(migration).toContain("INSERT INTO public.platform_support_sessions");
    expect(migration).toContain("INSERT INTO public.platform_audit_events");
    expect(migration).toContain("'source', 'console_support'");
    expect(migration).not.toContain("'source', 'console_support_session'");
    expect(migration).toContain("organization.status IN ('trialing', 'active')");
    expect(migration).toContain("current_platform_admin.role NOT IN ('platform_owner', 'support')");
    expect(migration).toContain(
      "Platform support sessions can read schedule blocks",
    );
    expect(migration).toContain(
      "Platform support sessions can read schedule assignments",
    );
    expect(migration).not.toMatch(/INSERT INTO public\.organization_memberships/i);
    expect(migration).not.toMatch(/DELETE FROM public\.organization_memberships/i);
    expect(migration).not.toMatch(/service_role|SUPABASE_SERVICE_ROLE/i);
    expect(migration).not.toMatch(
      /stripe|checkout|webhook|customer\s*portal|\/app\/settings\/billing/i,
    );
    expect(migration).not.toContain(
      "Platform support sessions can read documents",
    );
    expect(migration).not.toContain(
      "Platform support sessions can read time records",
    );
  });

  test("keeps support-session RLS policies idempotent without widening access", () => {
    const migration = readProjectFile(
      findMigrationWith("has_active_platform_support_session"),
    );

    expectPolicyDropBeforeCreate(
      migration,
      "Platform support sessions can read organizations",
      "organizations",
      "public.has_active_platform_support_session(id)",
    );

    for (const [policyName, tableName] of [
      ["Platform support sessions can read centers", "centers"],
      ["Platform support sessions can read memberships", "organization_memberships"],
      ["Platform support sessions can read coach profiles", "coach_profiles"],
      [
        "Platform support sessions can read coach center assignments",
        "coach_center_assignments",
      ],
      ["Platform support sessions can read person profiles", "person_profiles"],
      ["Platform support sessions can read class types", "class_types"],
      ["Platform support sessions can read schedule templates", "schedule_templates"],
      [
        "Platform support sessions can read template blocks",
        "schedule_template_blocks",
      ],
      ["Platform support sessions can read schedule blocks", "schedule_blocks"],
      [
        "Platform support sessions can read schedule assignments",
        "schedule_block_assignments",
      ],
      ["Platform support sessions can read operational events", "operational_events"],
    ] as const) {
      expectPolicyDropBeforeCreate(
        migration,
        policyName,
        tableName,
        "public.has_active_platform_support_session(organization_id)",
      );
    }

    expect(migration).not.toMatch(
      /CREATE POLICY "Platform support sessions can read[\s\S]{0,180}FOR\s+(?:ALL|INSERT|UPDATE|DELETE)\s+TO authenticated/i,
    );
    expect(migration).not.toMatch(
      /Platform support sessions can read (?:documents|time records|payroll|signatures)/i,
    );
  });

  test("keeps manual tenant suspension audited and away from memberships", () => {
    const platformHelper = readProjectFile("src/lib/platform-console.ts");
    const platformAction = readProjectFile("src/lib/platform-console-actions.ts");
    const tenantHelper = readProjectFile("src/lib/auth/tenant.ts");
    const migration = readProjectFile(
      findMigrationWith("set_platform_organization_access_status"),
    );

    expect(tenantHelper).toContain(
      'const ACTIVE_ORGANIZATION_STATUSES = ["trialing", "active"] as const;',
    );
    expect(tenantHelper).toContain("isUsableOrganizationStatus");
    expect(tenantHelper).toContain(
      ".filter((organization) => isUsableOrganizationStatus(organization.status))",
    );
    expect(tenantHelper).not.toMatch(/suspended["'][\s\S]{0,120}ACTIVE_ORGANIZATION_STATUSES/);
    expect(tenantHelper).not.toMatch(/inactive["'][\s\S]{0,120}ACTIVE_ORGANIZATION_STATUSES/);

    expect(platformAction).toContain("updatePlatformOrganizationAccessAction");
    expect(platformAction).toContain("getActivePlatformAdmin");
    expect(platformAction).toContain("getAuthenticatedUser");
    expect(platformAction).toContain("setPlatformOrganizationAccessStatus");
    expect(platformAction).toContain(
      'adminResult.data.role !== "platform_owner"',
    );
    expect(platformAction).toContain(
      'getFormString(formData, "confirmOrganizationAccessChange") !== "1"',
    );
    expect(platformAction).not.toMatch(/createAdminClient\(\)[\s\S]+updatePlatformOrganizationAccessAction/);

    expect(platformHelper).toContain("setPlatformOrganizationAccessStatus");
    expect(platformHelper).toContain(
      'context.data.admin.role !== "platform_owner"',
    );
    expect(platformHelper).toContain(
      '"set_platform_organization_access_status"',
    );

    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.set_platform_organization_access_status",
    );
    expect(migration).toContain("current_platform_admin.role <> 'platform_owner'");
    expect(migration).toContain("UPDATE public.organizations");
    expect(migration).toContain("SET status = normalized_next_status");
    expect(migration).toContain("INSERT INTO public.platform_audit_events");
    expect(migration).toContain("'suspended'");
    expect(migration).toContain("'activated'");
    expect(migration).toContain("'success'");
    expect(migration).toContain("'denied'");
    expect(migration).toContain("'previous_status'");
    expect(migration).toContain("'new_status'");
    expect(migration).toContain("'reason'");
    expect(migration).not.toMatch(/INSERT INTO public\.organization_memberships/i);
    expect(migration).not.toMatch(/DELETE FROM public\.organization_memberships/i);
    expect(migration).not.toMatch(/auth\.users|service_role|SUPABASE_SERVICE_ROLE/i);
    expect(migration).not.toMatch(
      /stripe|checkout|webhook|customer\s*portal|\/app\/settings\/billing/i,
    );
  });
});

test.describe("BoxOps Console authenticated smoke", () => {
  test.setTimeout(120_000);

  test.skip(
    !hasCredentials(platformAdminCredentials),
    "Configura E2E_PLATFORM_ADMIN_EMAIL y E2E_PLATFORM_ADMIN_PASSWORD para ejecutar el smoke autenticado de Console.",
  );

  test("active platform admin can reach the operational Console dashboard", async ({
    page,
  }) => {
    await loginAs(page, platformAdminCredentials!);

    await page.goto("/console", { waitUntil: "domcontentloaded" });
    await expectNoFrameworkError(page);

    await expect(
      page.getByRole("heading", { name: /BoxOps Console/i }).first(),
    ).toBeVisible();
    await expect(page.getByText(/Operacion interna/i).first()).toBeVisible();
    await expect(page.getByText(/Organizaciones/i).first()).toBeVisible();
    await expect(page.getByText(/Soporte/i).first()).toBeVisible();
    await expect(page.getByText(/Facturacion/i).first()).toBeVisible();
    await expect(page.getByText(/Alcance de rol/i)).toHaveCount(0);
    await expect(page.getByText(/Stripe|Checkout|Customer Portal/i)).toHaveCount(
      0,
    );
  });
});
