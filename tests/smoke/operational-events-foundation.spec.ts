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

test.describe("operational events I.18 source guardrails", () => {
  test("keeps events tenant-scoped and separate from schedule mutations", () => {
    const migration = readProjectFile(
      "supabase/migrations/00037_operational_events_foundation.sql",
    );
    const helper = readProjectFile("src/lib/operational-events.ts");
    const permissions = readProjectFile("src/lib/auth/permissions.ts");
    const source = collectSourceFiles(path.join(process.cwd(), "src"))
      .map((filePath) => readFileSync(filePath, "utf8"))
      .join("\n");

    expect(migration).toContain("CREATE TABLE public.operational_events");
    expect(migration).toContain("organization_id uuid NOT NULL");
    expect(migration).toContain("FOREIGN KEY (center_id, organization_id)");
    expect(migration).toContain("can_manage_operational_events");
    expect(migration).toContain("can_read_operational_event");
    expect(migration).toContain("status IN ('active', 'cancelled', 'archived')");
    expect(migration).toContain("visibility IN ('management', 'staff', 'all_staff')");
    expect(migration).toContain("public.record_operational_audit_event");
    expect(migration).toContain("GRANT SELECT ON public.operational_events");
    expect(migration).not.toMatch(
      /\b(?:INSERT INTO|UPDATE|DELETE FROM)\s+public\.schedule_blocks\b/i,
    );
    expect(migration).not.toMatch(
      /\b(?:INSERT INTO|UPDATE|DELETE FROM)\s+public\.schedule_block_assignments\b/i,
    );

    expect(helper).toContain("listOperationalEvents");
    expect(helper).toContain('"create_operational_event"');
    expect(helper).toContain('"update_operational_event"');
    expect(helper).toContain('"set_operational_event_status"');
    expect(helper).not.toMatch(
      /\.from\(["']operational_events["']\)[\s\S]{0,160}\.(?:insert|update|upsert|delete)\(/,
    );
    expect(helper).not.toContain("schedule_blocks");
    expect(helper).not.toContain("schedule_block_assignments");
    expect(helper).not.toContain("time_records");
    expect(helper).not.toContain("time_punches");

    expect(permissions).toContain("canManageOperationalEvents");
    expect(permissions).toContain("canReadOperationalEvents");

    expect(source).not.toMatch(/\bservice_role\b/);
    expect(source).not.toMatch(/\bSTL\b/);
    expect(source).not.toMatch(/\bnavigator\.geolocation\b/);
    expect(source).not.toMatch(/\bPushManager\b|\bNotification\b/);
    expect(source).not.toMatch(/\bcaches\.|\bCacheStorage\b|serviceWorker/);
  });
});
