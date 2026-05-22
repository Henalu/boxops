import { expect, test } from "@playwright/test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import {
  adminCredentials,
  coachCredentials,
  hasCredentials,
  managerCredentials,
  ownerCredentials,
  payrollManagerCredentials,
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

test.describe("overtime candidates I.21-I.24 source guardrails", () => {
  test("keeps candidates operational and separated from schedule and time mutations", () => {
    const migration = [
      "supabase/migrations/00039_overtime_candidates_foundation.sql",
      "supabase/migrations/00040_overtime_candidates_retention_guard.sql",
    ]
      .map(readProjectFile)
      .join("\n");
    const helper = readProjectFile("src/lib/overtime-candidates.ts");
    const detectionHelper = readProjectFile(
      "src/lib/overtime-candidate-detection.ts",
    );
    const permissions = readProjectFile("src/lib/auth/permissions.ts");
    const rlsVerification = readProjectFile(
      "supabase/snippets/overtime-candidates-rls-verification.sql",
    );
    const timePage = readProjectFile("src/app/(app)/app/time/page.tsx");
    const timeActions = readProjectFile("src/app/(app)/app/time/actions.ts");
    const overtimeSurface = timePage.slice(
      timePage.indexOf("function OvertimeCandidateReviewSection"),
      timePage.indexOf("function SnapshotSummary"),
    );
    const source = collectSourceFiles(path.join(process.cwd(), "src"))
      .map((filePath) => readFileSync(filePath, "utf8"))
      .join("\n");
    const appSource = collectSourceFiles(path.join(process.cwd(), "src/app"))
      .map((filePath) => readFileSync(filePath, "utf8"))
      .join("\n");

    expect(migration).toContain("CREATE TABLE public.overtime_candidates");
    expect(migration).toContain("organization_id uuid NOT NULL");
    expect(migration).toContain("CREATE TABLE public.overtime_candidate_sources");
    expect(migration).toContain("CREATE TABLE public.overtime_candidate_events");
    expect(migration).toContain("can_review_overtime_candidates");
    expect(migration).toContain("can_read_overtime_candidate");
    expect(migration).toContain(
      "ARRAY['owner', 'admin', 'manager']",
    );
    expect(migration).toContain(
      "worked_minutes_snapshot > planned_minutes_snapshot",
    );
    expect(migration).toContain(
      "FOREIGN KEY (person_profile_id, organization_id)",
    );
    expect(migration).toContain(
      "GRANT SELECT ON public.overtime_candidates",
    );
    expect(migration).toContain(
      "REVOKE ALL ON public.overtime_candidates FROM anon, authenticated",
    );
    expect(migration).toContain(
      "REVOKE ALL ON public.overtime_candidate_sources FROM anon, authenticated",
    );
    expect(migration).toContain(
      "REVOKE ALL ON public.overtime_candidate_events FROM anon, authenticated",
    );
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.create_overtime_candidate_signal",
    );
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.add_overtime_candidate_source",
    );
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.set_overtime_candidate_status",
    );
    expect(migration).not.toMatch(
      /GRANT\s+(?:INSERT|UPDATE|DELETE|ALL)[^;]+ON\s+public\.overtime_candidates\s+TO\s+authenticated/i,
    );
    expect(migration).not.toMatch(
      /GRANT\s+(?:INSERT|UPDATE|DELETE|ALL)[^;]+ON\s+public\.overtime_candidate_sources\s+TO\s+authenticated/i,
    );
    expect(migration).not.toMatch(
      /GRANT\s+(?:INSERT|UPDATE|DELETE|ALL)[^;]+ON\s+public\.overtime_candidate_events\s+TO\s+authenticated/i,
    );

    for (const table of [
      "schedule_blocks",
      "schedule_block_assignments",
      "staff_work_windows",
      "time_record_corrections",
      "time_records",
      "time_punches",
      "time_weekly_approvals",
    ]) {
      expect(migration).not.toMatch(
        new RegExp(
          `\\b(?:INSERT INTO|UPDATE|DELETE FROM)\\s+public\\.${table}\\b`,
          "i",
        ),
      );
      expect(helper).not.toMatch(
        new RegExp(
          `\\.from\\(["']${table}["']\\)[\\s\\S]{0,180}\\.(?:insert|update|upsert|delete)\\(`,
          "i",
        ),
      );
      expect(detectionHelper).not.toMatch(
        new RegExp(
          `\\.from\\(["']${table}["']\\)[\\s\\S]{0,180}\\.(?:insert|update|upsert|delete)\\(`,
          "i",
        ),
      );
    }

    expect(helper).toContain("listOvertimeCandidates");
    expect(helper).toContain("createOvertimeCandidateSignal");
    expect(helper).toContain("addOvertimeCandidateSource");
    expect(helper).toContain("setOvertimeCandidateStatus");
    expect(helper).toContain('"create_overtime_candidate_signal"');
    expect(helper).toContain('"add_overtime_candidate_source"');
    expect(helper).toContain('"set_overtime_candidate_status"');
    expect(detectionHelper).toContain("detectOperationalOvertimeCandidates");
    expect(detectionHelper).toContain("createOvertimeCandidateSignal");
    expect(detectionHelper).toContain("addOvertimeCandidateSource");
    expect(detectionHelper).toContain("setOvertimeCandidateStatus");
    expect(detectionHelper).toContain('"time_records"');
    expect(detectionHelper).toContain('"time_punches"');
    expect(detectionHelper).toContain('"time_weekly_approvals"');
    expect(detectionHelper).toContain('"schedule_blocks"');
    expect(detectionHelper).toContain('"schedule_block_assignments"');
    expect(detectionHelper).toContain('"staff_work_windows"');
    expect(helper).not.toMatch(
      /\.from\(["']overtime_candidates["']\)[\s\S]{0,180}\.(?:insert|update|upsert|delete)\(/,
    );
    expect(helper).not.toMatch(
      /\.from\(["']overtime_candidate_sources["']\)[\s\S]{0,180}\.(?:insert|update|upsert|delete)\(/,
    );
    expect(helper).not.toMatch(
      /\.from\(["']overtime_candidate_events["']\)[\s\S]{0,180}\.(?:insert|update|upsert|delete)\(/,
    );
    for (const table of [
      "overtime_candidates",
      "overtime_candidate_sources",
      "overtime_candidate_events",
    ]) {
      expect(source).not.toMatch(
        new RegExp(
          `\\.from\\(["']${table}["']\\)[\\s\\S]{0,180}\\.(?:insert|update|upsert|delete)\\(`,
          "i",
        ),
      );
    }

    expect(permissions).toContain("canReviewOvertimeCandidates");
    expect(permissions).toContain(
      'const OVERTIME_CANDIDATE_REVIEW_ROLES: ApplicationRole[] = [\n  "owner",\n  "admin",\n  "manager",\n];',
    );

    expect(rlsVerification).toContain("BEGIN;");
    expect(rlsVerification).toContain("ROLLBACK;");
    expect(rlsVerification).not.toContain("COMMIT;");
    expect(rlsVerification).toContain("payroll_manager");
    expect(rlsVerification).toContain("closed candidates cannot receive new sources");
    expect(rlsVerification).toContain("superseded candidates cannot receive new sources");
    expect(rlsVerification).toContain("source from another tenant is rejected");
    expect(rlsVerification).toContain("personal time_record source must belong to affected person");
    expect(rlsVerification).toContain(
      "direct insert on overtime_candidates is blocked for authenticated",
    );
    expect(rlsVerification).toContain(
      "overtime candidate operations did not mutate schedule_blocks",
    );
    expect(rlsVerification).toContain(
      "overtime candidate operations did not mutate schedule_block_assignments",
    );
    expect(rlsVerification).toContain(
      "overtime candidate operations did not mutate time_records",
    );
    expect(rlsVerification).toContain(
      "overtime candidate operations did not mutate time_punches",
    );
    expect(timePage).toContain("OvertimeCandidateReviewSection");
    expect(timePage).toContain("data-overtime-candidates-review");
    expect(timePage).toContain("data-overtime-candidate-detection-form");
    expect(timePage).toContain("Detectar posibles excesos");
    expect(timePage).toContain("ignorados por datos insuficientes");
    expect(timePage).toContain("listOvertimeCandidates");
    expect(timePage).toContain("canReviewOvertimeCandidates");
    expect(timePage).toContain("Candidatos operativos de posible exceso");
    expect(timePage).toContain("posible exceso");
    expect(timePage).toContain("candidato operativo");
    expect(timePage).toContain("pendiente de revisi");
    expect(timePage).toContain("overtimeCandidateTerminalStatuses");
    expect(timePage).toContain("Sin acciones");
    expect(timePage).toContain("No modifica fichajes, bloques ni");
    expect(timeActions).toContain("setOvertimeCandidateStatusFromForm");
    expect(timeActions).toContain("detectOvertimeCandidatesFromForm");
    expect(timeActions).toContain("detectOperationalOvertimeCandidates");
    expect(timeActions).toContain("setOvertimeCandidateStatus({");
    expect(timeActions).toContain("isOvertimeCandidateReviewStatus");
    expect(timeActions).not.toContain("createOvertimeCandidateSignal");
    expect(appSource).not.toMatch(
      /createOvertimeCandidateSignal\(|addOvertimeCandidateSource\(/,
    );
    expect(overtimeSurface).not.toMatch(
      /\b(?:payroll|nomina|n[oó]mina|importe|importes|salary|amount|currency|compensation|iban|bank)\b/i,
    );
    expect(overtimeSurface).not.toMatch(
      /hora extra aprobada|aprobaci[oó]n legal|aprobado legal/i,
    );
    expect(`${migration}\n${helper}`).not.toMatch(
      /\b(?:salary|salario|nomina|importe|importes|amount|currency|compensation|iban|bank)\b/i,
    );
    expect(`${migration}\n${helper}`).not.toMatch(/\bapproved_overtime\b/i);
    expect(source).not.toMatch(/\bservice_role\b/);
    expect(source).not.toMatch(/\bSTL\b/);
    expect(source).not.toMatch(/\bnavigator\.geolocation\b/);
    expect(source).not.toMatch(/\bPushManager\b|\bNotification\b/);
    expect(source).not.toMatch(/\bcaches\.|\bCacheStorage\b|serviceWorker/);
  });
});

for (const managementCase of managementCases) {
  test.describe(`${managementCase.label} overtime candidate review smoke`, () => {
    test.setTimeout(120_000);

    test.skip(
      !hasCredentials(managementCase.credentials),
      `Configura ${managementCase.envPrefix}_EMAIL y ${managementCase.envPrefix}_PASSWORD para ejecutar este smoke.`,
    );

    test("can see the minimal operational review surface in time tracking", async ({
      page,
    }) => {
      await loginAs(page, managementCase.credentials!);
      await page.goto(buildProtectedPath("/app/time"), {
        waitUntil: "domcontentloaded",
      });

      await expectNoFrameworkError(page);
      await expect(
        page.getByRole("heading", { name: /^Mi fichaje$/i }).first(),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", {
          name: /Candidatos operativos de posible exceso/i,
        }),
      ).toBeVisible();
      await expect(page.getByText(/posible exceso/i).first()).toBeVisible();
      await expect(page.getByText(/candidato operativo/i).first()).toBeVisible();
      await expect(
        page
          .locator("[data-overtime-candidates-review]")
          .getByText(/payroll|nomina|importe|hora extra aprobada/i),
      ).toHaveCount(0);
      const reviewSurface = page.locator("[data-overtime-candidates-review]");
      await expect(
        reviewSurface
          .locator("[data-overtime-candidate-status-form]")
          .or(reviewSurface.getByText(/Sin candidatos operativos pendientes/i))
          .or(reviewSurface.getByText(/Sin acciones/i))
          .first(),
      ).toBeVisible();
    });
  });
}

test.describe("coach overtime candidate review smoke", () => {
  test.setTimeout(120_000);

  test.skip(
    !hasCredentials(coachCredentials),
    "Configura E2E_COACH_EMAIL y E2E_COACH_PASSWORD para ejecutar el smoke coach.",
  );

  test("coach does not see the tenant-wide review queue or actions", async ({
    page,
  }) => {
    await loginAs(page, coachCredentials!);
    await page.goto(buildProtectedPath("/app/time"), {
      waitUntil: "domcontentloaded",
    });

    await expectNoFrameworkError(page);
    await expect(
      page.getByRole("heading", {
        name: /Candidatos operativos de posible exceso/i,
      }),
    ).toHaveCount(0);
    await expect(
      page.locator("[data-overtime-candidate-status-form]"),
    ).toHaveCount(0);
  });
});

test.describe("payroll manager overtime candidate review smoke", () => {
  test.setTimeout(120_000);

  test.skip(
    !hasCredentials(payrollManagerCredentials),
    "Configura E2E_PAYROLL_MANAGER_EMAIL y E2E_PAYROLL_MANAGER_PASSWORD para ejecutar este smoke.",
  );

  test("payroll_manager does not inherit tenant-wide review access", async ({
    page,
  }) => {
    await loginAs(page, payrollManagerCredentials!);
    await page.goto(buildProtectedPath("/app/time"), {
      waitUntil: "domcontentloaded",
    });

    await expectNoFrameworkError(page);
    await expect(
      page.getByRole("heading", { name: /^Mi fichaje$/i }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: /Candidatos operativos de posible exceso/i,
      }),
    ).toHaveCount(0);
    await expect(
      page.locator("[data-overtime-candidate-status-form]"),
    ).toHaveCount(0);
  });
});
