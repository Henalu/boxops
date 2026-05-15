import { expect, test } from "@playwright/test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import {
  adminCredentials,
  coachCredentials,
  hasCredentials,
  managerCredentials,
  ownerCredentials,
  type SmokeCredentials,
} from "./helpers/env";
import {
  buildProtectedPath,
  expectNoFrameworkError,
  loginAs,
} from "./helpers/session";

type ManagementCase = {
  credentials: SmokeCredentials | null;
  envPrefix: string;
  label: string;
};

const absenceFilterQuery = {
  absence_status: "pending_review",
  absence_type: "vacation",
  view: "review",
};

const managementCases: ManagementCase[] = [
  {
    credentials: ownerCredentials,
    envPrefix: "E2E_OWNER",
    label: "owner",
  },
  {
    credentials: adminCredentials,
    envPrefix: "E2E_ADMIN",
    label: "admin",
  },
  {
    credentials: managerCredentials,
    envPrefix: "E2E_MANAGER",
    label: "manager",
  },
];

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

test.describe("absences I.15 source guardrails", () => {
  test("keeps own creation routed through the helper/RPC boundary", () => {
    const actions = readProjectFile("src/app/(app)/app/absences/actions.ts");
    const page = readProjectFile("src/app/(app)/app/absences/page.tsx");
    const helper = readProjectFile("src/lib/absence-requests.ts");
    const source = collectSourceFiles(path.join(process.cwd(), "src"))
      .map((filePath) => readFileSync(filePath, "utf8"))
      .join("\n");

    expect(actions).toContain("createOwnAbsenceRequest");
    expect(actions).toMatch(
      /createOwnAbsenceRequest\(\{[\s\S]*organizationId: context\.organizationId/,
    );
    expect(helper).toContain('"create_own_absence_request"');
    expect(page).toContain('type AbsenceViewFilter = "all" | "own" | "review"');
    expect(page).toContain('name="view"');
    expect(page).toContain('name="absence_type"');
    expect(page).toContain('name="absence_status"');

    expect(actions).not.toMatch(
      /getFormString\(formData,\s*["'](?:personProfileId|person_profile_id|coachProfileId|coach_profile_id)["']\)/,
    );
    expect(source).not.toMatch(
      /\.from\(["']absence_(?:requests|request_periods|request_events)["']\)[\s\S]{0,120}\.(?:insert|update|upsert|delete)\(/,
    );
    expect(source).not.toMatch(/\bservice_role\b/);
    expect(source).not.toMatch(/\bSTL\b/);
  });
});

test.describe("coach absences regression smoke", () => {
  test.setTimeout(120_000);

  test.skip(
    !hasCredentials(coachCredentials),
    "Configura E2E_COACH_EMAIL y E2E_COACH_PASSWORD para ejecutar el smoke coach.",
  );

  test("coach cannot see the operational review queue from query string filters", async ({
    page,
  }) => {
    await loginAs(page, coachCredentials!);
    await page.goto(buildProtectedPath("/app/absences", absenceFilterQuery), {
      waitUntil: "domcontentloaded",
    });

    await expectNoFrameworkError(page);
    await expect(
      page.getByRole("heading", { name: /^Ausencias$/i }).first(),
    ).toBeVisible();
    await expect(page.locator('select[name="absence_type"]')).toHaveValue(
      "vacation",
    );
    await expect(page.locator('select[name="absence_status"]')).toHaveValue(
      "pending_review",
    );
    await expect(page.locator('select[name="view"]')).toHaveValue("all");
    await expect(page.getByText(/Revision operativa ignorada/i)).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /Revision operativa/i }),
    ).toHaveCount(0);
    await expect(
      page.locator(
        'input[name="person_profile_id"], input[name="personProfileId"], input[name="coach_profile_id"], input[name="coachProfileId"]',
      ),
    ).toHaveCount(0);
  });
});

for (const managementCase of managementCases) {
  test.describe(`${managementCase.label} absences regression smoke`, () => {
    test.setTimeout(120_000);

    test.skip(
      !hasCredentials(managementCase.credentials),
      `Configura ${managementCase.envPrefix}_EMAIL y ${managementCase.envPrefix}_PASSWORD para ejecutar este smoke.`,
    );

    test("can see the operational review surface with query string filters", async ({
      page,
    }) => {
      await loginAs(page, managementCase.credentials!);
      await page.goto(buildProtectedPath("/app/absences", absenceFilterQuery), {
        waitUntil: "domcontentloaded",
      });

      await expectNoFrameworkError(page);
      await expect(
        page.getByRole("heading", { name: /^Ausencias$/i }).first(),
      ).toBeVisible();
      await expect(page.locator('select[name="view"]')).toHaveValue("review");
      await expect(page.locator('select[name="absence_type"]')).toHaveValue(
        "vacation",
      );
      await expect(page.locator('select[name="absence_status"]')).toHaveValue(
        "pending_review",
      );
      await expect(
        page.getByRole("heading", { name: /Revision operativa/i }),
      ).toBeVisible();
      await expect(page.getByText(/Revision operativa ignorada/i)).toHaveCount(
        0,
      );
      await expect(
        page.locator(
          'input[name="person_profile_id"], input[name="personProfileId"], input[name="coach_profile_id"], input[name="coachProfileId"]',
        ),
      ).toHaveCount(0);
    });
  });
}
