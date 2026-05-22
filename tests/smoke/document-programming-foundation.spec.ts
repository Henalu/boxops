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

test.describe("document programming E.7/I.28 foundation guardrails", () => {
  test("keeps programming links internal, tenant-scoped and permission-gated", () => {
    const migration = readProjectFile(
      "supabase/migrations/00042_document_programming_schedule_links.sql",
    );
    const helper = readProjectFile("src/lib/document-programming.ts");
    const appSource = collectSourceFiles(path.join(process.cwd(), "src/app"))
      .map((filePath) => readFileSync(filePath, "utf8"))
      .join("\n");
    const source = collectSourceFiles(path.join(process.cwd(), "src"))
      .map((filePath) => readFileSync(filePath, "utf8"))
      .join("\n");

    expect(migration).toContain("CREATE TABLE public.document_programming_links");
    expect(migration).toContain("organization_id uuid NOT NULL");
    expect(migration).toContain("document_id uuid NOT NULL");
    expect(migration).toContain("document_version_id uuid NOT NULL");
    expect(migration).toContain("starts_on date NOT NULL");
    expect(migration).toContain("ends_on date NOT NULL");
    expect(migration).toContain("class_type_id uuid");
    expect(migration).toContain("center_id uuid");
    expect(migration).toContain("schedule_block_id uuid");
    expect(migration).toContain("document_scope = 'programming'");
    expect(migration).toContain("ALTER TABLE public.document_programming_links ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("public.can_access_document(document_id, organization_id, document_version_id, 'read_metadata')");
    expect(migration).toContain("REVOKE ALL ON public.document_programming_links FROM anon, authenticated");
    expect(migration).toContain("GRANT SELECT ON public.document_programming_links TO authenticated");
    expect(migration).toContain("create_document_programming_link");
    expect(migration).toContain("set_document_programming_link_status");
    expect(migration).toContain("list_document_programming_for_block");
    expect(migration).toContain("list_document_programming_for_context");
    expect(migration).toContain("programming_content_read");
    expect(migration).toContain("programming_content_manage");
    expect(migration).not.toMatch(
      /GRANT\s+(?:INSERT|UPDATE|DELETE|ALL)[^;]+ON\s+public\.document_programming_links\s+TO\s+authenticated/i,
    );

    expect(helper).toContain("listDocumentProgrammingForBlock");
    expect(helper).toContain("listDocumentProgrammingForDateContext");
    expect(helper).toContain("createDocumentProgrammingLink");
    expect(helper).toContain("setDocumentProgrammingLinkStatus");
    expect(helper).toContain('"list_document_programming_for_block"');
    expect(helper).toContain('"list_document_programming_for_context"');
    expect(helper).toContain('"create_document_programming_link"');
    expect(helper).toContain('"set_document_programming_link_status"');
    expect(helper).not.toMatch(
      /\.from\(["']document_programming_links["']\)[\s\S]{0,180}\.(?:insert|update|upsert|delete)\(/,
    );

    expect(migration).not.toContain("schedule_block_assignments");
    expect(helper).not.toContain("schedule_block_assignments");
    expect(appSource).toContain("listDocumentProgrammingForBlock");
    expect(appSource).toContain("data-document-programming-surface");
    expect(appSource).not.toContain("createDocumentProgrammingLink");
    expect(appSource).not.toContain("setDocumentProgrammingLinkStatus");
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
