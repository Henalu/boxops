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

test.describe("coverage absence impact I.16 source guardrails", () => {
  test("keeps absence impact derived and read-only for coverage surfaces", () => {
    const scheduleBlocks = readProjectFile("src/lib/schedule-blocks.ts");
    const absenceHelper = readProjectFile("src/lib/absence-requests.ts");
    const coverageSurfaces = [
      "src/app/(app)/app/coverage/page.tsx",
      "src/app/(app)/app/coverage/coverage-block-detail-panels.tsx",
      "src/app/(app)/app/page.tsx",
      "src/app/(app)/app/schedule/page.tsx",
      "src/app/(app)/app/schedule/schedule-block-detail-panels.tsx",
      "src/app/(app)/app/stats/page.tsx",
    ]
      .map(readProjectFile)
      .join("\n");
    const source = collectSourceFiles(path.join(process.cwd(), "src"))
      .map((filePath) => readFileSync(filePath, "utf8"))
      .join("\n");

    expect(scheduleBlocks).toContain("absenceImpacts");
    expect(scheduleBlocks).toContain("coverageNeededAssignmentIds");
    expect(scheduleBlocks).toContain("hasCoverageNeededAbsenceImpact");
    expect(scheduleBlocks).toContain("isScheduleCoverageRisk");

    expect(absenceHelper).toContain("listOperationalAbsenceScheduleImpacts");
    expect(absenceHelper).toContain('.from("absence_request_periods")');
    expect(absenceHelper).toContain('"pending_review", "approved"');
    expect(absenceHelper).toContain('"list_absence_schedule_impacts"');
    expect(absenceHelper).not.toContain('"applied"');

    expect(coverageSurfaces).toContain("listOperationalAbsenceScheduleImpacts");
    expect(coverageSurfaces).toContain("isScheduleCoverageRisk");
    expect(coverageSurfaces).toContain("Impacto de ausencia");
    expect(coverageSurfaces).toContain("Ausencia en revision");
    expect(coverageSurfaces).not.toMatch(/\breason_summary\b/);

    expect(source).not.toMatch(/\.from\(["']absence_schedule_impacts["']\)/);
    expect(source).not.toMatch(
      /\.from\(["']absence_(?:requests|request_periods|request_events)["']\)[\s\S]{0,160}\.(?:insert|update|upsert|delete)\(/,
    );
    expect(source).not.toMatch(/\bservice_role\b/);
    expect(source).not.toMatch(/\bSTL\b/);
  });
});
