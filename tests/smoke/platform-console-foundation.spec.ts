import { expect, test } from "@playwright/test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

function readProjectFile(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

function collectSourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const fullPath = path.join(directory, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      return collectSourceFiles(fullPath);
    }

    return /\.(ts|tsx)$/.test(entry) ? [fullPath] : [];
  });
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

function getCreateTableBlock(source: string, tableName: string) {
  const match = source.match(
    new RegExp(
      `CREATE TABLE public\\.${tableName} \\([\\s\\S]+?\\n\\);`,
      "i",
    ),
  );

  expect(match, `CREATE TABLE public.${tableName}`).not.toBeNull();

  return match?.[0] ?? "";
}

test.describe("BoxOps Console foundation source guardrails", () => {
  test("keeps platform schema internal, RLS-protected and payment-provider-neutral", () => {
    const migrationPath = findMigrationWith(
      "CREATE TABLE public.platform_admins",
    );
    const migration = readProjectFile(migrationPath);
    const helper = readProjectFile("src/lib/platform-console.ts");
    const bootstrapSnippet = readProjectFile(
      "supabase/snippets/bootstrap-platform-owner-placeholder.sql",
    );
    const packageManifest = readProjectFile("package.json");
    const sourceFiles = collectSourceFiles(path.join(process.cwd(), "src"));
    const sourceWithoutAllowedAdminHelper = sourceFiles
      .filter(
        (filePath) =>
          path.relative(process.cwd(), filePath).replace(/\\/g, "/") !==
          "src/lib/supabase/admin.ts",
      )
      .map((filePath) => readFileSync(filePath, "utf8"))
      .join("\n");
    const tenantAppSource = collectSourceFiles(
      path.join(process.cwd(), "src/app/(app)"),
    )
      .map((filePath) => readFileSync(filePath, "utf8"))
      .join("\n");

    for (const table of [
      "platform_admins",
      "organization_subscriptions",
      "platform_support_sessions",
      "platform_audit_events",
    ]) {
      expect(migration).toContain(`CREATE TABLE public.${table}`);
      expect(migration).toContain(
        `ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`,
      );
      expect(migration).toContain(`REVOKE ALL ON public.${table} FROM PUBLIC;`);
      expect(migration).toContain(
        `REVOKE ALL ON public.${table} FROM anon, authenticated;`,
      );
      expect(migration).toContain(`GRANT SELECT ON public.${table} TO authenticated;`);
      expect(migration).not.toMatch(
        new RegExp(
          `GRANT\\s+(?:INSERT|UPDATE|DELETE|ALL)[^;]+ON\\s+public\\.${table}\\s+TO\\s+authenticated`,
          "i",
        ),
      );
    }

    expect(migration).toContain("is_active_platform_admin");
    expect(migration).toContain("has_platform_role");
    expect(migration).toContain("list_platform_organization_summaries");
    expect(migration).toContain("record_platform_audit_event");
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.can_read_platform_admin_row(uuid) TO authenticated;",
    );
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.can_read_platform_subscription_rows() TO authenticated;",
    );
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.can_read_platform_support_sessions() TO authenticated;",
    );
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.can_read_platform_audit_events() TO authenticated;",
    );
    expect(migration).toContain(
      "role IN ('platform_owner', 'support', 'billing', 'viewer')",
    );
    expect(migration).toContain(
      "public.has_platform_role(ARRAY['platform_owner', 'billing'])",
    );
    expect(migration).toContain(
      "public.has_platform_role(ARRAY['platform_owner', 'support'])",
    );
    expect(migration).toContain("active_centers_count");
    expect(migration).toContain("active_users_count");
    expect(migration).toContain("active_coaches_count");
    expect(migration).toContain("platform_metadata_is_safe");
    expect(migration).toContain("platform_reason_is_safe");

    const subscriptionTable = getCreateTableBlock(
      migration,
      "organization_subscriptions",
    );
    expect(subscriptionTable).toContain("provider_customer_ref text");
    expect(subscriptionTable).toContain("provider_subscription_ref text");
    expect(subscriptionTable).not.toMatch(
      /\b(?:card|iban|mandate|bank_account|account_number|routing|swift|bic|cvv|payment_method)\b/i,
    );

    expect(helper).toContain("getActivePlatformAdmin");
    expect(helper).toContain("hasActivePlatformRole");
    expect(helper).toContain("listPlatformOrganizationSummaries");
    expect(helper).toContain('"platform_admins"');
    expect(helper).toContain('"list_platform_organization_summaries"');
    expect(helper).not.toMatch(
      /\.from\(["'](?:platform_admins|organization_subscriptions|platform_support_sessions|platform_audit_events)["']\)[\s\S]{0,200}\.(?:insert|update|upsert|delete)\(/,
    );
    expect(helper).not.toMatch(/createAdminClient|auth\.admin|SUPABASE_SERVICE_ROLE|service_role/);
    expect(helper).not.toMatch(/stripe|STRIPE_|checkout|webhook|portal/i);
    expect(helper).not.toMatch(/\b(?:card|iban|mandate|bank|cvv|routing|swift|bic)\b/i);

    expect(sourceWithoutAllowedAdminHelper).not.toMatch(
      /\bservice_role\b|SUPABASE_SERVICE_ROLE/,
    );
    expect(sourceWithoutAllowedAdminHelper).not.toMatch(
      /from\s+["']stripe["']|require\(["']stripe["']\)|STRIPE_|stripe\.webhooks|checkout\.sessions|customerPortal/i,
    );
    expect(packageManifest).not.toMatch(/"stripe"\s*:/i);
    expect(tenantAppSource).toContain("getActivePlatformAdmin");
    expect(readProjectFile("src/components/layout/app-navigation.tsx")).not.toContain(
      "/console",
    );

    expect(bootstrapSnippet).toContain("<AUTH_USER_ID_UUID>");
    expect(bootstrapSnippet).toContain("'platform_owner'");
    expect(bootstrapSnippet).toContain("ROLLBACK;");
    expect(bootstrapSnippet).not.toMatch(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i,
    );
    expect(bootstrapSnippet).not.toMatch(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  });
});
