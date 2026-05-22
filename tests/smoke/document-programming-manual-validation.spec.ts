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

test.describe("document programming E.10/I.31 manual validation guardrails", () => {
  test("keeps manual validation operational, rollback-safe and outside product UI", () => {
    const runbook = readProjectFile(
      "docs/operations/document-programming-manual-validation-runbook.md",
    );
    const tasks = readProjectFile("TASKS.md");
    const roadmap = readProjectFile("docs/product/roadmap.md");
    const domainModel = readProjectFile("docs/architecture/domain-model.md");
    const securityBaseline = readProjectFile(
      "docs/architecture/security-baseline.md",
    );
    const permissions = readProjectFile(
      "docs/architecture/personal-data-permissions.md",
    );
    const legal = readProjectFile(
      "docs/operations/legal-and-privacy-notes.md",
    );
    const ux = readProjectFile("docs/product/ux-principles.md");
    const qaSnippet = readProjectFile(
      "supabase/snippets/document-programming-schedule-qa-verification.sql",
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

    expect(runbook).toContain("E.10/I.31");
    expect(runbook).toContain("preparacion operativa interna para local/QA");
    expect(runbook).toContain("No es IA");
    expect(runbook).toContain("documents");
    expect(runbook).toContain("document_versions");
    expect(runbook).toContain("document_access_grants");
    expect(runbook).toContain("document_programming_links");
    expect(runbook).toContain("schedule_blocks");
    expect(runbook).toContain("`schedule_block_assignments` queda fuera");
    expect(runbook).toContain("rutas backend E.5 de preview/descarga");
    expect(runbook).toContain("Usuario A: grant `download` o `preview`");
    expect(runbook).toContain("Usuario B: grant `read_metadata`");
    expect(runbook).toContain("Usuario C: sin grant documental");
    expect(runbook).toContain("Usuario D: membership activa en otro tenant");
    expect(runbook).toContain("BEGIN;");
    expect(runbook).toContain("ROLLBACK;");
    expect(runbook).toContain("list_document_programming_for_block");
    expect(runbook).toContain("can_preview IS TRUE");
    expect(runbook).toContain("can_download IS FALSE");
    expect(runbook).toContain("other tenant cannot read programming links");
    expect(runbook).toContain("No abrir subida visible");
    expect(runbook).toContain("No crear asociaciones visibles desde UI");
    expect(runbook).toContain("No generar signed URLs desde cliente");

    expect(qaSnippet).toContain("BEGIN;");
    expect(qaSnippet).toContain("ROLLBACK;");
    expect(qaSnippet).toContain("document_access_grants");
    expect(qaSnippet).toContain("schedule_block_assignments does not grant document access");

    expect(tasks).toContain("E.10 / I.31");
    expect(tasks).toContain("document-programming-manual-validation-runbook.md");
    expect(tasks).toContain("tests/smoke/document-programming-manual-validation.spec.ts");
    expect(roadmap).toContain("Decision E.10/I.31");
    expect(domainModel).toContain("E.10/I.31");
    expect(securityBaseline).toContain("E.10/I.31");
    expect(permissions).toContain("E.10/I.31");
    expect(legal).toContain("E.10/I.31");
    expect(ux).toContain("E.10/I.31");

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
