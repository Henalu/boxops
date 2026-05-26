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

test.describe("staff work windows source guardrails", () => {
  test("keeps planned presence separate from schedule blocks and safely linked to time automation", () => {
    const migration = readProjectFile(
      "supabase/migrations/00036_staff_work_windows.sql",
    );
    const sharedReadMigration = readProjectFile(
      "supabase/migrations/00038_staff_work_windows_shared_read.sql",
    );
    const autoTimePunchMigration = readProjectFile(
      "supabase/migrations/00047_staff_work_window_auto_time_punches.sql",
    );
    const helper = readProjectFile("src/lib/staff-work-windows.ts");
    const actions = readProjectFile("src/app/(app)/app/schedule/actions.ts");
    const appPaths = readProjectFile("src/lib/navigation/app-paths.ts");
    const schedulePage = readProjectFile("src/app/(app)/app/schedule/page.tsx");
    const workWindowsPage = readProjectFile(
      "src/app/(app)/app/work-windows/page.tsx",
    );
    const visibilityControls = readProjectFile(
      "src/app/(app)/app/schedule/staff-work-windows-visibility.tsx",
    );
    const detailPanel = readProjectFile(
      "src/app/(app)/app/schedule/schedule-block-detail-panels.tsx",
    );
    const source = collectSourceFiles(path.join(process.cwd(), "src"))
      .map((filePath) => readFileSync(filePath, "utf8"))
      .join("\n");

    expect(migration).toContain("CREATE TABLE public.staff_work_windows");
    expect(migration).toContain("organization_id uuid NOT NULL");
    expect(migration).toContain("FOREIGN KEY (person_profile_id, organization_id)");
    expect(sharedReadMigration).toContain(
      "Members can view active staff work windows",
    );
    expect(sharedReadMigration).toContain("status = 'active'");
    expect(sharedReadMigration).toContain("public.is_org_member(organization_id)");
    expect(sharedReadMigration).toContain(
      "Operators can view all staff work windows",
    );
    expect(migration).toContain("owner', 'admin', 'manager");
    expect(migration).not.toMatch(/\bEXCLUDE\b|tsrange|tstzrange/i);
    expect(autoTimePunchMigration).toContain(
      "generate_staff_work_window_auto_time_punches",
    );
    expect(autoTimePunchMigration).toContain(
      "generate_due_staff_work_window_auto_time_punches",
    );
    expect(autoTimePunchMigration).toContain(
      "metadata ->> 'generatedFrom' = 'staff_work_window'",
    );
    expect(autoTimePunchMigration).toContain("'presenceVerified'");
    expect(autoTimePunchMigration).toContain("false");
    expect(autoTimePunchMigration).toContain(
      "Generated from planned staff work window; does not verify real presence.",
    );
    expect(autoTimePunchMigration).not.toMatch(
      /navigator\.geolocation|latitude|longitude|gps|payroll_|salary|compensation|document-files|service_role/i,
    );

    expect(helper).toContain("listStaffWorkWindowsForWeek");
    expect(helper).toContain("expandStaffWorkWindow");
    expect(helper).toContain("validateStaffWorkWindowForm");
    expect(helper).toContain("person-profile-without-active-coach");
    expect(helper).toMatch(
      /export async function listStaffWorkWindowPersonOptions[\s\S]+\.from\("coach_profiles"\)[\s\S]+\.eq\("status", "active"\)[\s\S]+\.not\("person_profile_id", "is", null\)[\s\S]+\.from\("person_profiles"\)[\s\S]+\.eq\("status", "active"\)[\s\S]+\.eq\("visibility_status", "visible"\)/,
    );
    expect(helper).not.toContain("schedule_blocks");
    expect(helper).not.toContain("schedule_block_assignments");
    expect(helper).not.toContain("time_records");
    expect(helper).not.toContain("time_punches");

    expect(actions).toContain("createStaffWorkWindow");
    expect(actions).toContain("updateStaffWorkWindow");
    expect(actions).toContain("deactivateStaffWorkWindow");
    expect(actions).toContain("canManageStaffWorkWindows");
    expect(actions).toContain('"/app/work-windows"');

    expect(appPaths).toContain("getWorkWindowsPath");
    // Horario conserva la lectura contextual de jornadas previstas, pero la
    // gestion vive en /app/work-windows para no duplicar secciones.
    expect(schedulePage).toContain("listStaffWorkWindowsForWeek");
    expect(schedulePage).toContain("includeInactive: false");
    expect(schedulePage).toContain("StaffWorkWindowHourSummary");
    expect(schedulePage).not.toContain("Gestionar jornadas");
    expect(schedulePage).not.toContain("getWorkWindowsPath");
    expect(workWindowsPage).toContain("Jornadas previstas");
    expect(workWindowsPage).toContain("canManageStaffWorkWindows");
    expect(workWindowsPage).toContain("listStaffWorkWindowsForWeek");
    expect(workWindowsPage).toContain("includeInactive: true");
    expect(workWindowsPage).toContain("updateStaffWorkWindow");
    expect(workWindowsPage).toContain("deactivateStaffWorkWindow");
    expect(schedulePage).toContain("work_windows");
    expect(visibilityControls).toContain("StaffWorkWindowHourSummary");
    expect(visibilityControls).toContain("Jornada");
    expect(detailPanel).toContain("Personal previsto en esta franja");
    expect(detailPanel).toContain("Nadie previsto en esta franja");
    expect(detailPanel).toContain("Asignado fuera de jornada prevista");

    expect(source).not.toMatch(
      /\.from\(["']staff_work_windows["']\)[\s\S]{0,160}\.delete\(/,
    );
    expect(source).not.toMatch(/\bservice_role\b/);
    expect(source).not.toMatch(/\bSTL\b/);
    expect(source).not.toMatch(/\bnavigator\.geolocation\b/);
    expect(source).not.toMatch(/\bPushManager\b|\bNotification\b/);
    expect(source).not.toMatch(/\bcaches\.|\bCacheStorage\b|serviceWorker/);
  });
});
