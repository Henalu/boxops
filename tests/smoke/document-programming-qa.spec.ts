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

test.describe("document programming E.9/I.30 QA guardrails", () => {
  test("keeps operational verification internal, rollback-safe and permission-gated", () => {
    const snippet = readProjectFile(
      "supabase/snippets/document-programming-schedule-qa-verification.sql",
    );
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
      .filter((filePath) => filePath.split(path.sep).includes("documents"))
      .map((filePath) =>
        path.relative(process.cwd(), filePath).replaceAll(path.sep, "/"),
      )
      .sort();

    expect(snippet).toContain("E.9/I.30 document programming schedule QA verification");
    expect(snippet).toContain("BEGIN;");
    expect(snippet).toContain("ROLLBACK;");
    expect(snippet).toContain("pg_temp.use_auth_user");
    expect(snippet).toContain("SET LOCAL ROLE authenticated");
    expect(snippet).toContain("document_access_grants");
    expect(snippet).toContain("document_programming_links");
    expect(snippet).toContain("list_document_programming_for_block");
    expect(snippet).toContain("list_document_programming_for_context");
    expect(snippet).toContain("can_access_document");
    expect(snippet).toContain("can_preview");
    expect(snippet).toContain("can_download");
    expect(snippet).toContain("read_metadata");
    expect(snippet).toContain("download");
    expect(snippet).toContain(
      "schedule_block_assignments does not grant document access",
    );
    expect(snippet).toContain(
      "assigned coach without grant gets empty programming state",
    );
    expect(snippet).toContain(
      "read_metadata grant returns metadata only without preview/download actions",
    );
    expect(snippet).toContain(
      "other tenant owner cannot list tenant A programming for block",
    );
    expect(snippet).toContain("did not mutate schedule_blocks");
    expect(snippet).toContain("did not mutate schedule_block_assignments");

    expect(schedulePage).toContain("listDocumentProgrammingForBlock");
    expect(schedulePanel).toContain(
      'data-document-programming-surface="schedule-block"',
    );
    expect(schedulePanel).toContain(
      "No hay programacion disponible para tu permiso en este bloque.",
    );
    expect(schedulePanel).toContain("Solo metadata");
    expect(schedulePanel).toContain("entry.can_preview");
    expect(schedulePanel).toContain("entry.can_download");
    expect(schedulePanel).toContain(
      "/app/documents/${documentId}/versions/${documentVersionId}/${mode}",
    );

    expect(appSource).not.toContain("createDocumentProgrammingLink");
    expect(appSource).not.toContain("setDocumentProgrammingLinkStatus");
    expect(appSource).not.toMatch(
      /begin_document_version_upload|activate_document_version_upload|cancel_document_version_upload/,
    );
    expect(documentRouteFiles).toEqual([
      "src/app/(app)/app/documents/[documentId]/versions/[documentVersionId]/download/route.ts",
      "src/app/(app)/app/documents/[documentId]/versions/[documentVersionId]/preview/route.ts",
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
