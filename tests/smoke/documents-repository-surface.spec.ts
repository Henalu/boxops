import { expect, test, type Page } from "@playwright/test";
import { Buffer } from "node:buffer";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import {
  adminCredentials,
  coachCredentials,
  hasCredentials,
  managerCredentials,
  organizationId,
  type SmokeCredentials,
} from "./helpers/env";
import {
  buildProtectedPath,
  expectNoFrameworkError,
  loginAs,
} from "./helpers/session";

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

type LocalDocumentUploadEvidence = {
  currentVersionMatches: boolean;
  documentId: string;
  documentScope: string;
  documentStatus: string;
  documentType: string;
  documentVersionId: string;
  downloadEventCount: number;
  organizationId: string;
  previewEventCount: number;
  sensitivityLevel: string;
  storageBucket: string;
  storageBucketIsPublic: boolean;
  storageObjectCount: number;
  versionStatus: string;
};

type LocalDeniedDocumentFileAccessEvidence = {
  downloadDeniedCount: number;
  previewDeniedCount: number;
};

type UploadedDocumentRouteEvidence = LocalDocumentUploadEvidence & {
  downloadHref: string;
  previewHref: string;
  title: string;
};

const shouldRunDocumentUploadRuntimeSmoke =
  process.env.E2E_DOCUMENT_UPLOAD_RUNTIME === "1";

function quoteSqlLiteral(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

function runLocalPsql(sql: string) {
  return execFileSync(
    "docker",
    [
      "exec",
      "supabase_db_boxops",
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-tA",
      "-F",
      "|",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      sql,
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
    },
  ).trim();
}

function getLocalDocumentUploadEvidence({
  orgId,
  title,
}: {
  orgId: string;
  title: string;
}): LocalDocumentUploadEvidence {
  const output = runLocalPsql(`
    SELECT
      document.id::text,
      document_version.id::text,
      document.organization_id::text,
      document.document_scope,
      document.document_type,
      document.sensitivity_level,
      document.status,
      document_version.status,
      CASE WHEN document.current_version_id = document_version.id THEN 'true' ELSE 'false' END,
      document_version.storage_bucket,
      COALESCE(storage_bucket_state.is_public, true)::text,
      COALESCE(storage_object_count.total, 0)::text,
      COALESCE(preview_event_count.total, 0)::text,
      COALESCE(download_event_count.total, 0)::text
    FROM public.documents document
    INNER JOIN public.document_versions document_version
      ON document_version.id = document.current_version_id
     AND document_version.document_id = document.id
     AND document_version.organization_id = document.organization_id
    LEFT JOIN LATERAL (
      SELECT storage_bucket.public AS is_public
      FROM storage.buckets storage_bucket
      WHERE storage_bucket.id = document_version.storage_bucket
    ) storage_bucket_state ON true
    LEFT JOIN LATERAL (
      SELECT count(*) AS total
      FROM storage.objects storage_object
      WHERE storage_object.bucket_id = document_version.storage_bucket
        AND storage_object.name = document_version.storage_path
    ) storage_object_count ON true
    LEFT JOIN LATERAL (
      SELECT count(*) AS total
      FROM public.document_access_events event
      WHERE event.document_id = document.id
        AND event.document_version_id = document_version.id
        AND event.organization_id = document.organization_id
        AND event.event_type = 'file_preview'
        AND event.result = 'allowed'
    ) preview_event_count ON true
    LEFT JOIN LATERAL (
      SELECT count(*) AS total
      FROM public.document_access_events event
      WHERE event.document_id = document.id
        AND event.document_version_id = document_version.id
        AND event.organization_id = document.organization_id
        AND event.event_type = 'file_download'
        AND event.result = 'allowed'
    ) download_event_count ON true
    WHERE document.organization_id = ${quoteSqlLiteral(orgId)}::uuid
      AND document.title = ${quoteSqlLiteral(title)}
    ORDER BY document.created_at DESC
    LIMIT 1;
  `);

  if (!output) {
    throw new Error("No local document upload evidence row found.");
  }

  const [
    documentId,
    documentVersionId,
    resolvedOrganizationId,
    documentScope,
    documentType,
    sensitivityLevel,
    documentStatus,
    versionStatus,
    currentVersionMatches,
    storageBucket,
    storageBucketIsPublic,
    storageObjectCount,
    previewEventCount,
    downloadEventCount,
  ] = output.split("|");

  return {
    currentVersionMatches: currentVersionMatches === "true",
    documentId,
    documentScope,
    documentStatus,
    documentType,
    documentVersionId,
    downloadEventCount: Number(downloadEventCount),
    organizationId: resolvedOrganizationId,
    previewEventCount: Number(previewEventCount),
    sensitivityLevel,
    storageBucket,
    storageBucketIsPublic: storageBucketIsPublic === "true",
    storageObjectCount: Number(storageObjectCount),
    versionStatus,
  };
}

function getLocalDeniedDocumentFileAccessEvidence({
  actorEmail,
  documentId,
  documentVersionId,
  orgId,
  role,
}: {
  actorEmail: string;
  documentId: string;
  documentVersionId: string;
  orgId: string;
  role: "coach" | "manager";
}): LocalDeniedDocumentFileAccessEvidence {
  const output = runLocalPsql(`
    SELECT
      count(*) FILTER (WHERE event.event_type = 'file_preview')::text,
      count(*) FILTER (WHERE event.event_type = 'file_download')::text
    FROM public.document_access_events event
    INNER JOIN public.organization_memberships membership
      ON membership.id = event.organization_membership_id
     AND membership.organization_id = event.organization_id
    INNER JOIN auth.users auth_user
      ON auth_user.id = event.actor_user_id
    WHERE event.organization_id = ${quoteSqlLiteral(orgId)}::uuid
      AND event.document_id = ${quoteSqlLiteral(documentId)}::uuid
      AND event.document_version_id = ${quoteSqlLiteral(documentVersionId)}::uuid
      AND event.result = 'denied'
      AND event.metadata->>'reason' = 'insufficient_access'
      AND membership.role = ${quoteSqlLiteral(role)}
      AND lower(auth_user.email) = lower(${quoteSqlLiteral(actorEmail)});
  `);

  const [previewDeniedCount, downloadDeniedCount] = output.split("|");

  return {
    downloadDeniedCount: Number(downloadDeniedCount),
    previewDeniedCount: Number(previewDeniedCount),
  };
}

function cleanupLocalDocumentUpload({
  orgId,
  title,
}: {
  orgId: string;
  title: string;
}) {
  runLocalPsql(`
    WITH target_versions AS (
      SELECT document_version.id
      FROM public.documents document
      INNER JOIN public.document_versions document_version
        ON document_version.document_id = document.id
       AND document_version.organization_id = document.organization_id
      WHERE document.organization_id = ${quoteSqlLiteral(orgId)}::uuid
        AND document.title = ${quoteSqlLiteral(title)}
    ),
    marked_versions AS (
      UPDATE public.document_versions document_version
      SET status = 'deleted'
      FROM target_versions target_version
      WHERE document_version.id = target_version.id
      RETURNING document_version.id
    )
    UPDATE public.documents document
    SET status = 'deleted'
    WHERE document.organization_id = ${quoteSqlLiteral(orgId)}::uuid
      AND document.title = ${quoteSqlLiteral(title)};
  `);
}

async function createSyntheticDocumentWithBackendRouteEvidence({
  expectedDocumentType,
  page,
  scope,
  scopeLabel,
  syntheticFileName,
  title,
}: {
  expectedDocumentType: string;
  page: Page;
  scope: "company" | "programming";
  scopeLabel: string;
  syntheticFileName: string;
  title: string;
}): Promise<UploadedDocumentRouteEvidence> {
  if (!hasCredentials(adminCredentials) || !organizationId) {
    throw new Error("Missing admin credentials or organization id for upload smoke.");
  }

  await loginAs(page, adminCredentials);
  await page.goto(buildProtectedPath("/app/documents"), {
    waitUntil: "domcontentloaded",
  });
  await expectNoFrameworkError(page);
  await expect(
    page.getByRole("heading", { name: /^Documentos$/ }).first(),
  ).toBeVisible();

  await page
    .locator("details")
    .filter({ hasText: "Subir documento" })
    .locator("summary")
    .click();
  await page.getByLabel("Titulo").fill(title);
  await page.getByLabel("Ambito").selectOption(scope);
  await page
    .getByLabel("Descripcion opcional")
    .fill(`Archivo sintetico no sensible para smoke local E.19 ${scope}.`);
  await page.getByLabel("Archivo").setInputFiles({
    buffer: Buffer.from(`BoxOps E19 ${scope} smoke synthetic file\n`, "utf8"),
    mimeType: "text/plain",
    name: syntheticFileName,
  });

  await page.getByRole("button", { name: /Crear y subir/i }).click();
  await page.waitForURL(/status=document-uploaded/);
  await expect(page.getByText("Documento creado y archivo adjuntado.")).toBeVisible();

  const titleHeading = page.getByRole("heading", { name: title });
  await expect(titleHeading).toBeVisible();

  const card = titleHeading.locator(
    "xpath=ancestor::*[contains(@class, 'bg-card')][1]",
  );
  await expect(card).toContainText(scopeLabel);
  await expect(card).toContainText(syntheticFileName);

  const pageMarkup = await page.content();
  expect(pageMarkup).not.toMatch(
    /signedUrl|storage_path|storage_bucket|document-files|\/storage|storage\/v1/i,
  );

  const previewHref = await card
    .getByRole("link", { name: /Preview/i })
    .getAttribute("href");
  const downloadHref = await card
    .getByRole("link", { name: /Descargar/i })
    .getAttribute("href");

  if (!previewHref || !downloadHref) {
    throw new Error("Missing backend preview/download hrefs for synthetic document.");
  }

  expect(previewHref).toMatch(
    /^\/app\/documents\/[0-9a-f-]+\/versions\/[0-9a-f-]+\/preview\?organizationId=/,
  );
  expect(downloadHref).toMatch(
    /^\/app\/documents\/[0-9a-f-]+\/versions\/[0-9a-f-]+\/download\?organizationId=/,
  );
  expect(`${previewHref}\n${downloadHref}`).not.toMatch(
    /signedUrl|storage_path|storage_bucket|document-files|\/storage|storage\/v1/i,
  );

  const previewResponse = await page.request.get(
    new URL(previewHref, page.url()).toString(),
    { maxRedirects: 0 },
  );
  const downloadResponse = await page.request.get(
    new URL(downloadHref, page.url()).toString(),
    { maxRedirects: 0 },
  );

  expect(previewResponse.status()).toBe(302);
  expect(downloadResponse.status()).toBe(302);
  expect(previewResponse.headers()["cache-control"]).toContain("no-store");
  expect(downloadResponse.headers()["cache-control"]).toContain("no-store");

  const uploadEvidence = getLocalDocumentUploadEvidence({
    orgId: organizationId,
    title,
  });

  expect(uploadEvidence).toMatchObject({
    currentVersionMatches: true,
    documentScope: scope,
    documentStatus: "active",
    documentType: expectedDocumentType,
    downloadEventCount: 1,
    organizationId,
    previewEventCount: 1,
    sensitivityLevel: "restricted",
    storageBucket: "document-files",
    storageBucketIsPublic: false,
    storageObjectCount: 1,
    versionStatus: "active",
  });

  return {
    ...uploadEvidence,
    downloadHref,
    previewHref,
    title,
  };
}

async function runControlledDocumentUploadSmoke({
  expectedDocumentType,
  page,
  scope,
  scopeLabel,
}: {
  expectedDocumentType: string;
  page: Page;
  scope: "company" | "programming";
  scopeLabel: string;
}) {
  test.setTimeout(90_000);

  if (
    !shouldRunDocumentUploadRuntimeSmoke ||
    !hasCredentials(adminCredentials) ||
    !organizationId
  ) {
    test.skip(true, "Missing local document upload runtime smoke credentials.");
    return;
  }

  const timestamp = Date.now();
  const title = `E19 ${scope} smoke synthetic ${timestamp}`;
  const syntheticFileName = `e19-${scope}-smoke-${timestamp}.txt`;

  try {
    await createSyntheticDocumentWithBackendRouteEvidence({
      expectedDocumentType,
      page,
      scope,
      scopeLabel,
      syntheticFileName,
      title,
    });
  } finally {
    try {
      cleanupLocalDocumentUpload({ orgId: organizationId ?? "", title });
    } catch {
      // Best-effort cleanup: the synthetic title keeps any leftover local row identifiable.
    }
  }
}

async function expectNoMinimalDocumentUploadForm({
  page,
  credentials,
}: {
  credentials: SmokeCredentials;
  page: Page;
}) {
  await loginAs(page, credentials);
  await page.goto(buildProtectedPath("/app/documents"), {
    waitUntil: "domcontentloaded",
  });
  await expectNoFrameworkError(page);
  await expect(
    page.getByRole("heading", { name: /^Documentos$/ }).first(),
  ).toBeVisible();
  await expect(page.locator('input[name="documentFile"]')).toHaveCount(0);
  await expect(page.locator('form[enctype="multipart/form-data"]')).toHaveCount(0);
  await expect(page.getByText("Subir documento")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Crear y subir/i })).toHaveCount(0);
}

async function signOutCurrentSession(page: Page) {
  const response = await page.request.post("/auth/sign-out", {
    maxRedirects: 0,
  });

  expect(response.status()).toBe(303);
}

async function expectDirectDocumentFileRoutesDeniedForRole({
  credentials,
  page,
  role,
}: {
  credentials: SmokeCredentials | null;
  page: Page;
  role: "coach" | "manager";
}) {
  test.setTimeout(120_000);

  if (
    !shouldRunDocumentUploadRuntimeSmoke ||
    !hasCredentials(adminCredentials) ||
    !organizationId
  ) {
    test.skip(
      true,
      "Set E2E_DOCUMENT_UPLOAD_RUNTIME=1 with E2E_ADMIN_* and E2E_ORGANIZATION_ID to run the controlled local backend denial smoke.",
    );
    return;
  }

  if (!hasCredentials(credentials)) {
    test.skip(
      true,
      `Set E2E_${role.toUpperCase()}_* to run the controlled local ${role} backend denial smoke.`,
    );
    return;
  }

  const timestamp = Date.now();
  const title = `E20 ${role} programming negative smoke synthetic ${timestamp}`;
  const syntheticFileName = `e20-${role}-programming-negative-smoke-${timestamp}.txt`;

  try {
    const uploadEvidence = await createSyntheticDocumentWithBackendRouteEvidence({
      expectedDocumentType: "programming_document",
      page,
      scope: "programming",
      scopeLabel: "Programacion",
      syntheticFileName,
      title,
    });

    await signOutCurrentSession(page);
    await loginAs(page, credentials);

    const previewResponse = await page.request.get(
      new URL(uploadEvidence.previewHref, page.url()).toString(),
      { maxRedirects: 0 },
    );
    const downloadResponse = await page.request.get(
      new URL(uploadEvidence.downloadHref, page.url()).toString(),
      { maxRedirects: 0 },
    );

    expect(previewResponse.status()).toBe(404);
    expect(downloadResponse.status()).toBe(404);
    expect(previewResponse.headers()["cache-control"]).toContain("no-store");
    expect(downloadResponse.headers()["cache-control"]).toContain("no-store");
    expect(await previewResponse.json()).toMatchObject({
      error: "document_file_not_available",
    });
    expect(await downloadResponse.json()).toMatchObject({
      error: "document_file_not_available",
    });

    expect(
      getLocalDeniedDocumentFileAccessEvidence({
        actorEmail: credentials.email,
        documentId: uploadEvidence.documentId,
        documentVersionId: uploadEvidence.documentVersionId,
        orgId: organizationId,
        role,
      }),
    ).toMatchObject({
      downloadDeniedCount: 1,
      previewDeniedCount: 1,
    });
  } finally {
    try {
      cleanupLocalDocumentUpload({ orgId: organizationId ?? "", title });
    } catch {
      // Best-effort cleanup: the synthetic title keeps any leftover local row identifiable.
    }
  }
}

test.describe("documents minimal repository guardrails", () => {
  test("keeps the repository visible, permission-gated and backend-file-routed", () => {
    const page = readProjectFile("src/app/(app)/app/documents/page.tsx");
    const actions = readProjectFile("src/app/(app)/app/documents/actions.ts");
    const submitButton = readProjectFile(
      "src/app/(app)/app/documents/document-upload-submit-button.tsx",
    );
    const helper = readProjectFile("src/lib/documents.ts");
    const navigation = readProjectFile("src/components/layout/app-navigation.tsx");
    const morePage = readProjectFile("src/app/(app)/app/more/page.tsx");
    const nextConfig = readProjectFile("next.config.ts");
    const migration = readProjectFile(
      "supabase/migrations/00043_document_repository_minimal_visible.sql",
    );
    const source = collectSourceFiles(path.join(process.cwd(), "src"))
      .map((filePath) => readFileSync(filePath, "utf8"))
      .join("\n");

    expect(page).toContain('data-document-repository-surface="minimal"');
    expect(page).toContain("listAccessibleDocumentVersions");
    expect(page).toContain("entry.can_preview");
    expect(page).toContain("entry.can_download");
    expect(page).toContain(
      "/app/documents/${documentId}/versions/${documentVersionId}/${mode}",
    );
    expect(page).toContain("Sin documentos visibles");
    expect(page).toContain("createDocumentWithInitialFileUpload");
    expect(page).toContain('name="organizationId"');
    expect(page).toContain('name="documentFile"');
    expect(page).toContain("DOCUMENT_UPLOAD_ACCEPT");
    expect(page).not.toMatch(/\bFirmar\b|requires_signature = true/);

    expect(helper).toContain("list_accessible_document_versions");
    expect(helper).toContain("DOCUMENT_UPLOAD_SCOPES");
    expect(helper).toContain("DOCUMENT_UPLOAD_MAX_SIZE_BYTES = 5 * 1024 * 1024");
    expect(helper).toContain("validateMinimalDocumentUploadFile");
    expect(helper).toContain("documentBytesMatchMimeType");
    expect(migration).toContain("public.can_access_document");
    expect(migration).toContain("document.requires_signature = false");
    expect(migration).toContain("document.sensitivity_level NOT IN");
    expect(migration).toContain("'sensitive_hr'");
    expect(migration).toContain("'payroll'");
    expect(migration).toContain("'signature_evidence'");

    expect(navigation).toContain('href: "/app/documents"');
    expect(morePage).toContain("getDocumentsPath");
    expect(morePage).toContain("Abrir documentos");
    expect(nextConfig).toContain("serverActions");
    expect(nextConfig).toContain('bodySizeLimit: "6mb"');

    expect(actions).toContain("can_manage_document_metadata");
    expect(actions).toContain("begin_document_version_upload");
    expect(actions).toContain("activate_document_version_upload");
    expect(actions).toContain("cancel_document_version_upload");
    expect(actions).toContain("DOCUMENT_FILES_BUCKET");
    expect(actions).toContain("validateMinimalDocumentUploadFile");
    expect(actions).toContain("createHash(\"sha256\")");
    expect(actions).toContain('status: "draft"');
    expect(actions).toContain('status: "active"');
    expect(actions).not.toMatch(
      /createSignedUrl|signedUrl|document_access_grants|manage_grants|requires_signature:\s*true/,
    );
    expect(submitButton).toContain("useFormStatus");

    expect(source).not.toMatch(/\bservice_role\b/);
    expect(source).not.toMatch(/\bSTL\b/);
    expect(source).not.toMatch(/\bnavigator\.geolocation\b/);
    expect(source).not.toMatch(/\bPushManager\b|\bNotification\b/);
    expect(source).not.toMatch(/\bcaches\.|\bCacheStorage\b|serviceWorker/);
    expect(source).not.toMatch(
      /\b(?:OpenAI|openai|anthropic|embeddings|vector|pgvector)\b|ai_/,
    );
  });

  test("keeps E.12 controlled QA rollback-only and evidence-focused", () => {
    const tasks = readProjectFile("TASKS.md");
    const runbook = readProjectFile(
      "docs/operations/document-repository-beta-readiness-runbook.md",
    );
    const roadmap = readProjectFile("docs/product/roadmap.md");
    const snippet = readProjectFile(
      "supabase/snippets/document-repository-beta-qa-verification.sql",
    );

    expect(tasks).toContain(
      "#### E.12 - Validacion QA/Staging Controlada Del Repositorio Documental Visible Minimo",
    );
    expect(tasks).toContain(
      "supabase/snippets/document-repository-beta-qa-verification.sql",
    );
    expect(runbook).toContain("E.12");
    expect(runbook).toContain("Validacion E.12 QA/Staging");
    expect(roadmap).toContain("Decision E.12");

    expect(snippet).toMatch(/(?:^|\n)BEGIN;\s/);
    expect(snippet.trimEnd()).toMatch(/ROLLBACK;$/);
    expect(snippet).toContain("list_accessible_document_versions");
    expect(snippet).toContain("record_document_access_event");
    expect(snippet).toContain("file_preview");
    expect(snippet).toContain("file_download");
    expect(snippet).toContain("read_metadata");
    expect(snippet).toContain("download");
    expect(snippet).toContain("metadata-only");
    expect(snippet).toContain("no-grant");
    expect(snippet).toContain("cross-tenant");
    expect(snippet).toContain("'programming'");
    expect(snippet).toContain("'company'");
    expect(snippet).toContain("'sensitive_hr'");
    expect(snippet).toContain("'payroll'");
    expect(snippet).toContain("'signature_evidence'");
    expect(snippet).toContain("requires_signature");

    expect(runbook).toContain("rol probado");
    expect(runbook).toContain("organizacion activa");
    expect(runbook).toContain("documento/version redacted");
    expect(runbook).toContain("resultado de listado");
    expect(runbook).toContain("file_preview");
    expect(runbook).toContain("file_download");
    expect(runbook).toContain("cross-tenant");
    expect(runbook).toContain("solo metadata");
    expect(runbook).toContain("estado vacio");

    expect(snippet).not.toMatch(
      /begin_document_version_upload|activate_document_version_upload|cancel_document_version_upload/,
    );
  });

  test("keeps E.13 evidence closure redacted and environment-bound", () => {
    const tasks = readProjectFile("TASKS.md");
    const runbook = readProjectFile(
      "docs/operations/document-repository-beta-readiness-runbook.md",
    );
    const roadmap = readProjectFile("docs/product/roadmap.md");
    const snippet = readProjectFile(
      "supabase/snippets/document-repository-beta-qa-verification.sql",
    );

    expect(tasks).toContain(
      "#### E.13 - Cierre De Evidencia QA/Staging Del Repositorio Documental Visible Minimo",
    );
    expect(tasks).toContain("bloqueada por falta de acceso/credenciales");
    expect(tasks).toContain("no hay `SUPABASE_ACCESS_TOKEN`");
    expect(tasks).toContain("archivo `document-files` sintetico");

    expect(roadmap).toContain("Decision E.13");
    expect(runbook).toContain("## Cierre QA/Staging E.13");
    expect(runbook).toContain("## Plantilla De Evidencia Redacted E.13");
    expect(runbook).toContain("Estado correcto: `bloqueado por acceso/entorno`");
    expect(runbook).toContain("No hay `SUPABASE_ACCESS_TOKEN`");
    expect(runbook).toContain("project ref");
    expect(runbook).toContain("DB URL real/staging");

    [
      "Fecha",
      "Entorno",
      "Organizacion",
      "Rol probado",
      "Usuario/caso redacted",
      "Documento/version redacted",
      "Resultado de listado",
      "Resultado de preview",
      "Resultado de download",
      "Auditoria `file_preview`/`file_download`",
      "Denegacion cross-tenant",
      "Estado solo metadata",
      "Estado vacio sin grant",
      "Exclusion `sensitive_hr`",
      "Exclusion `payroll`",
      "Exclusion `signature_evidence`",
      "Exclusion `requires_signature`",
      "Bloqueos o deuda",
    ].forEach((field) => {
      expect(runbook).toContain(field);
    });

    expect(runbook).toContain("No rellenar campos con contrasenas");
    expect(runbook).toContain("signed URLs");
    expect(runbook).toContain("contenido documental");
    expect(snippet).toContain("E.13 evidence closure note");
    expect(snippet).toContain("Keep BEGIN/ROLLBACK");
  });
});

test.describe("documents minimal upload runtime smoke", () => {
  test("creates a synthetic company document with active version and backend file routes", async ({
    page,
  }) => {
    await runControlledDocumentUploadSmoke({
      expectedDocumentType: "company_document",
      page,
      scope: "company",
      scopeLabel: "Empresa",
    });
  });

  test("creates a synthetic programming document with active version and backend file routes", async ({
    page,
  }) => {
    await runControlledDocumentUploadSmoke({
      expectedDocumentType: "programming_document",
      page,
      scope: "programming",
      scopeLabel: "Programacion",
    });
  });

  test("does not expose the minimal document upload form to manager", async ({
    page,
  }) => {
    if (
      !shouldRunDocumentUploadRuntimeSmoke ||
      !hasCredentials(managerCredentials) ||
      !organizationId
    ) {
      test.skip(
        true,
        "Set E2E_DOCUMENT_UPLOAD_RUNTIME=1 with E2E_MANAGER_* and E2E_ORGANIZATION_ID to run the controlled local manager negative smoke.",
      );
      return;
    }

    await expectNoMinimalDocumentUploadForm({
      credentials: managerCredentials,
      page,
    });
  });

  test("does not expose the minimal document upload form to coach", async ({
    page,
  }) => {
    if (
      !shouldRunDocumentUploadRuntimeSmoke ||
      !hasCredentials(coachCredentials) ||
      !organizationId
    ) {
      test.skip(
        true,
        "Set E2E_DOCUMENT_UPLOAD_RUNTIME=1 with E2E_COACH_* and E2E_ORGANIZATION_ID to run the controlled local coach negative smoke.",
      );
      return;
    }

    await expectNoMinimalDocumentUploadForm({
      credentials: coachCredentials,
      page,
    });
  });

  test("denies direct programming preview/download backend routes to manager", async ({
    page,
  }) => {
    await expectDirectDocumentFileRoutesDeniedForRole({
      credentials: managerCredentials,
      page,
      role: "manager",
    });
  });

  test("denies direct programming preview/download backend routes to coach", async ({
    page,
  }) => {
    await expectDirectDocumentFileRoutesDeniedForRole({
      credentials: coachCredentials,
      page,
      role: "coach",
    });
  });
});
