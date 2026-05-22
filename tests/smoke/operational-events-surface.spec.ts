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

test.describe("operational events I.19 schedule surface guardrails", () => {
  test("keeps the visible surface minimal and role-gated", () => {
    const schedulePage = readProjectFile(
      "src/app/(app)/app/schedule/page.tsx",
    );
    const actions = readProjectFile(
      "src/app/(app)/app/schedule/operational-event-actions.ts",
    );
    const helper = readProjectFile("src/lib/operational-events.ts");
    const permissions = readProjectFile("src/lib/auth/permissions.ts");
    const source = collectSourceFiles(path.join(process.cwd(), "src"))
      .map((filePath) => readFileSync(filePath, "utf8"))
      .join("\n");

    expect(schedulePage).toContain("listOperationalEvents");
    expect(schedulePage).toContain("OperationalEventsCard");
    expect(schedulePage).toContain(
      "canManageOperationalEvents(resolution.membership.role)",
    );
    expect(schedulePage).toContain("canManage={canManageEvents}");
    expect(schedulePage).toContain("Eventos y festivos");
    expect(schedulePage).toContain("Crear evento");
    expect(schedulePage).toContain("Gestionar evento");
    expect(schedulePage).toContain("events.length === 0 && !canManage");

    expect(actions).toContain('"use server"');
    expect(actions).toContain("canManageOperationalEvents");
    expect(actions).toContain("createOperationalEvent(");
    expect(actions).toContain("updateOperationalEvent(");
    expect(actions).toContain("setOperationalEventStatus(");
    expect(actions).toContain("permission-denied");
    expect(actions).not.toContain("schedule_blocks");
    expect(actions).not.toContain("schedule_block_assignments");

    expect(helper).not.toContain("schedule_blocks");
    expect(helper).not.toContain("schedule_block_assignments");
    expect(helper).not.toContain("time_records");
    expect(helper).not.toContain("time_punches");

    expect(permissions).toContain("OPERATIONAL_EVENT_READ_ROLES");
    expect(permissions).toContain('"coach"');
    expect(permissions).toContain("OPERATIONAL_EVENT_MANAGEMENT_ROLES");
    expect(permissions).toMatch(
      /OPERATIONAL_EVENT_MANAGEMENT_ROLES[\s\S]*"owner"[\s\S]*"admin"[\s\S]*"manager"/,
    );

    expect(source).not.toMatch(/\bservice_role\b/);
    expect(source).not.toMatch(/\bSTL\b/);
    expect(source).not.toMatch(/\bnavigator\.geolocation\b/);
    expect(source).not.toMatch(/\bPushManager\b|\bNotification\b/);
    expect(source).not.toMatch(/\bcaches\.|\bCacheStorage\b|serviceWorker/);
  });
});
