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

test.describe("document programming E.8/I.29 schedule surface guardrails", () => {
  test("keeps the visible surface minimal, authorized and schedule-scoped", () => {
    const schedulePage = readProjectFile("src/app/(app)/app/schedule/page.tsx");
    const schedulePanel = readProjectFile(
      "src/app/(app)/app/schedule/schedule-block-detail-panels.tsx",
    );
    const appFiles = collectSourceFiles(path.join(process.cwd(), "src/app"));
    const appSource = appFiles
      .map((filePath) => readFileSync(filePath, "utf8"))
      .join("\n");
    const source = collectSourceFiles(path.join(process.cwd(), "src"))
      .map((filePath) => readFileSync(filePath, "utf8"))
      .join("\n");
    const documentRouteFiles = appFiles
      .filter((filePath) =>
        filePath
          .split(path.sep)
          .includes("documents"),
      )
      .map((filePath) =>
        path.relative(process.cwd(), filePath).replaceAll(path.sep, "/"),
      )
      .sort();

    expect(schedulePage).toContain("listDocumentProgrammingForBlock");
    expect(schedulePage).toContain("getScheduleDocumentProgrammingByBlock");
    expect(schedulePanel).toContain(
      'data-document-programming-surface="schedule-block"',
    );
    expect(schedulePanel).toContain("Material de apoyo");
    expect(schedulePanel).toContain(
      "No hay material visible para esta sesion.",
    );
    expect(schedulePanel).toContain("can_preview");
    expect(schedulePanel).toContain("can_download");
    expect(schedulePanel).toContain(
      "/app/documents/${documentId}/versions/${documentVersionId}/${mode}",
    );
    expect(schedulePanel).toContain("organizationId");
    expect(schedulePanel).toContain("Archivos para preparar esta sesion");
    expect(schedulePanel).toContain("Solo informacion");
    expect(schedulePanel).not.toContain("Programacion autorizada");
    expect(schedulePanel).not.toContain("Fuente documental versionada");
    expect(schedulePanel).not.toContain("Solo metadata");

    expect(appSource).not.toContain("createDocumentProgrammingLink");
    expect(appSource).not.toContain("setDocumentProgrammingLinkStatus");
    expect(`${schedulePage}\n${schedulePanel}`).not.toMatch(
      /begin_document_version_upload|activate_document_version_upload|cancel_document_version_upload/,
    );
    expect(documentRouteFiles).toEqual([
      "src/app/(app)/app/documents/[documentId]/versions/[documentVersionId]/download/route.ts",
      "src/app/(app)/app/documents/[documentId]/versions/[documentVersionId]/preview/route.ts",
      "src/app/(app)/app/documents/actions.ts",
      "src/app/(app)/app/documents/document-upload-submit-button.tsx",
      "src/app/(app)/app/documents/page.tsx",
    ]);
    expect(source).not.toMatch(/\bservice_role\b/);
    expect(source).not.toMatch(/\bSTL\b/);
    expect(source).not.toMatch(/\bnavigator\.geolocation\b/);
    expect(source).not.toMatch(/\bPushManager\b|\bNotification\b/);
    expect(source).not.toMatch(/\bcaches\.|\bCacheStorage\b|serviceWorker/);
    expect(source).not.toMatch(
      /\b(?:OpenAI|openai|anthropic|embeddings|vector|pgvector)\b|ai_/,
    );
  });
});
