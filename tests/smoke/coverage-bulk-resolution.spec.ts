import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

function readProjectFile(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

test.describe("coverage bulk resolution source guardrails", () => {
  test("keeps bulk coverage resolution explicit and assignment-scoped", () => {
    const coveragePage = readProjectFile("src/app/(app)/app/coverage/page.tsx");
    const bulkList = readProjectFile(
      "src/app/(app)/app/coverage/coverage-bulk-resolve-list.tsx",
    );
    const actions = readProjectFile("src/app/(app)/app/coverage/actions.ts");
    const operationsUi = readProjectFile(
      "src/components/features/operations-ui.tsx",
    );

    expect(coveragePage).toContain("CoverageBulkResolveList");
    expect(coveragePage).toContain("bulk-assigned");

    expect(bulkList).toContain("scheduleBlockIds");
    expect(bulkList).toContain("assignCoachToSelectedCoverageBlocks");
    expect(bulkList).toContain("Seleccionar todos");
    expect(bulkList).toContain("checked={isSelected}");

    expect(operationsUi).toContain("leading?: React.ReactNode");
    expect(operationsUi).toContain("selected?: boolean");

    expect(actions).toContain('"use server"');
    expect(actions).toContain("canManageOperationalData");
    expect(actions).toContain("resolveActiveOrganization");
    expect(actions).toContain('from("schedule_block_assignments")');
    expect(actions).toContain("recordOperationalAuditEvent");
    expect(actions).toContain("coach-unavailable");

    expect(actions).not.toMatch(
      /\.from\(["']schedule_blocks["']\)[\s\S]{0,180}\.(?:insert|update|upsert|delete)\(/,
    );
    expect(actions).not.toMatch(
      /\.from\(["']absence_(?:requests|request_periods|request_events|schedule_impacts)["']\)[\s\S]{0,180}\.(?:insert|update|upsert|delete)\(/,
    );
    expect(actions).not.toMatch(/\bservice_role\b/);
    expect(actions).not.toMatch(/\bSTL\b/);
  });
});
