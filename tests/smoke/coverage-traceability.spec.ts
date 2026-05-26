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

test.describe("coverage traceability I.25 source guardrails", () => {
  test("keeps coverage traceability read-only, tenant-scoped, and role-bounded", () => {
    const migration = readProjectFile(
      "supabase/migrations/00041_coverage_traceability_audit_read.sql",
    );
    const helper = readProjectFile("src/lib/coverage-traceability.ts");
    const permissions = readProjectFile("src/lib/auth/permissions.ts");
    const schedulePage = readProjectFile("src/app/(app)/app/schedule/page.tsx");
    const coveragePage = readProjectFile("src/app/(app)/app/coverage/page.tsx");
    const schedulePanel = readProjectFile(
      "src/app/(app)/app/schedule/schedule-block-detail-panels.tsx",
    );
    const coveragePanel = readProjectFile(
      "src/app/(app)/app/coverage/coverage-block-detail-panels.tsx",
    );
    const source = collectSourceFiles(path.join(process.cwd(), "src"))
      .map((filePath) => readFileSync(filePath, "utf8"))
      .join("\n");
    const traceUi = `${schedulePanel}\n${coveragePanel}`;
    const traceSurfaces = `${schedulePage}\n${coveragePage}\n${traceUi}`;

    expect(migration).toContain("can_read_coverage_trace_events");
    expect(migration).toContain("list_coverage_trace_audit_events");
    expect(migration).toContain("organization_id = target_organization_id");
    expect(migration).toContain("retain_until > now()");
    expect(migration).toContain("ARRAY['owner', 'admin', 'manager']");
    expect(migration).toContain("'schedule_blocks'");
    expect(migration).toContain("'schedule_block_assignments'");
    expect(migration).toContain("'schedule_template_blocks'");
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.list_coverage_trace_audit_events",
    );
    expect(migration).not.toContain("payroll_manager");
    expect(migration).not.toContain("coach");

    expect(helper).toContain("listCoverageTraceItems");
    expect(helper).toContain("canManageOperationalData");
    expect(helper).toContain("resolveActiveOrganization");
    expect(helper).toContain("listOperationalAbsenceScheduleImpacts");
    expect(helper).toContain('.from("schedule_blocks")');
    expect(helper).toContain('.from("schedule_block_assignments")');
    expect(helper).toContain('.from("change_requests")');
    expect(helper).toContain('.from("change_request_events")');
    expect(helper).toContain('"list_coverage_trace_audit_events"');
    expect(helper).toContain("Motivo y datos sensibles no se muestran aqui");
    expect(helper).not.toMatch(/\breason_summary\b/);

    expect(permissions).toContain(
      'const OPERATIONAL_MANAGEMENT_ROLES: ApplicationRole[] = [\n  "owner",\n  "admin",\n  "manager",\n];',
    );
    expect(schedulePage).toContain("canManageSchedule && scheduleView !== \"month\"");
    expect(coveragePage).toContain("includeCoverageTrace: canManageSchedule");
    expect(helper).toContain("Cambio guardado");
    expect(helper).toContain("Entrenador por defecto actualizado");
    expect(helper).not.toContain("Campos minimizados");
    expect(helper).not.toContain("Cambio operativo reciente");

    expect(schedulePanel).toContain("Historial de asignaciones");
    expect(schedulePanel).toContain("ScheduleCoachAssignForm");
    expect(schedulePanel).not.toContain("Entrenador asignable");

    const scheduleAdminCard = schedulePanel.slice(
      schedulePanel.indexOf("function ScheduleBlockAdminCard"),
      schedulePanel.indexOf("export function ScheduleBlockDetailPanels"),
    );
    const scheduleAssignmentPanel = schedulePanel.slice(
      schedulePanel.indexOf("function ScheduleAssignmentPanel"),
      schedulePanel.indexOf("function ScheduleBlockReadOnlyCard"),
    );

    expect(scheduleAdminCard).toContain("<ScheduleCoachAssignForm");
    expect(scheduleAdminCard).toContain("<StaffWorkWindowContext");
    expect(scheduleAdminCard).toContain("<ScheduleAssignmentPanel");
    expect(scheduleAdminCard.indexOf("<ScheduleCoachAssignForm")).toBeLessThan(
      scheduleAdminCard.indexOf("<StaffWorkWindowContext"),
    );
    expect(scheduleAdminCard.indexOf("<StaffWorkWindowContext")).toBeLessThan(
      scheduleAdminCard.indexOf("<ScheduleAssignmentPanel"),
    );
    expect(scheduleAssignmentPanel).not.toContain("StaffWorkWindowContext");

    expect(traceSurfaces).toContain("Cambios recientes");
    expect(traceSurfaces).toContain("Actualizado el");
    expect(traceSurfaces).toContain("data-coverage-traceability");
    expect(traceSurfaces).toContain("No cambia el horario");
    expect(traceSurfaces).not.toContain("Trazabilidad operativa");
    expect(traceSurfaces).not.toContain("Auditoria");
    expect(traceSurfaces).not.toContain("Campos minimizados");
    expect(traceSurfaces).not.toContain("default_coach_profile_id");
    expect(traceSurfaces).not.toMatch(/\breason_summary\b/);

    for (const table of [
      "schedule_blocks",
      "schedule_block_assignments",
      "time_records",
      "time_punches",
      "absence_requests",
      "absence_request_periods",
      "absence_request_events",
      "change_requests",
      "change_request_events",
    ]) {
      expect(migration).not.toMatch(
        new RegExp(
          `\\b(?:INSERT INTO|UPDATE|DELETE FROM)\\s+public\\.${table}\\b`,
          "i",
        ),
      );
      expect(helper).not.toMatch(
        new RegExp(
          `\\.from\\(["']${table}["']\\)[\\s\\S]{0,220}\\.(?:insert|update|upsert|delete)\\(`,
          "i",
        ),
      );
    }

    expect(source).not.toMatch(/\bservice_role\b/);
    expect(source).not.toMatch(/\bSTL\b/);
    expect(source).not.toMatch(/\bnavigator\.geolocation\b/);
    expect(source).not.toMatch(/\bPushManager\b|\bNotification\b/);
    expect(source).not.toMatch(/\bcaches\.|\bCacheStorage\b|serviceWorker/);
  });
});
