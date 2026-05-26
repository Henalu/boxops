import { expect, test, type APIResponse, type Page } from "@playwright/test";
import { Buffer } from "node:buffer";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import {
  adminCredentials,
  coachCredentials,
  crossTenantCredentials,
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

type LocalDocumentFileAccessAuditEvidence = {
  downloadAllowedCount: number;
  downloadDeniedCount: number;
  previewAllowedCount: number;
  previewDeniedCount: number;
};

type LocalDocumentGrantAccessLevel = "download" | "preview" | "read_metadata";

type LocalDocumentGrantActorRole = "coach" | "manager";

type LocalDocumentGrantActor = {
  credentials: SmokeCredentials;
  email: string;
  membershipId: string;
  role: LocalDocumentGrantActorRole;
};

type LocalCrossTenantDocumentActor = {
  credentials: SmokeCredentials;
  email: string;
  membershipId: string;
  organizationId: string;
  role: string;
  source: string;
};

type LocalDocumentGrantEvidence = {
  accessLevel: string;
  grantId: string;
  grantStatus: string;
  targetRole: string;
};

type UploadedDocumentRouteEvidence = LocalDocumentUploadEvidence & {
  downloadHref: string;
  previewHref: string;
  title: string;
};

const shouldRunDocumentUploadRuntimeSmoke =
  process.env.E2E_DOCUMENT_UPLOAD_RUNTIME === "1";

async function expectNoDocumentFileInternalsInUi(page: Page) {
  expect(await page.content()).not.toMatch(
    /signedUrl|storage_path|storage_bucket|document-files|\/storage|storage\/v1/i,
  );
}

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

function tryRunLocalPsql(sql: string) {
  try {
    return runLocalPsql(sql);
  } catch {
    return null;
  }
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

function getLocalGrantActorMembership({
  actorEmail,
  orgId,
  role,
}: {
  actorEmail: string;
  orgId: string;
  role: LocalDocumentGrantActorRole;
}) {
  return tryRunLocalPsql(`
    SELECT membership.id::text
    FROM public.organization_memberships membership
    INNER JOIN auth.users auth_user
      ON auth_user.id = membership.user_id
    WHERE membership.organization_id = ${quoteSqlLiteral(orgId)}::uuid
      AND membership.status = 'active'
      AND membership.role = ${quoteSqlLiteral(role)}
      AND lower(auth_user.email) = lower(${quoteSqlLiteral(actorEmail)})
    LIMIT 1;
  `);
}

function getLocalDocumentGrantActor(
  orgId: string,
): LocalDocumentGrantActor | null {
  const candidates: Array<{
    credentials: SmokeCredentials | null;
    role: LocalDocumentGrantActorRole;
  }> = [
    { credentials: managerCredentials, role: "manager" },
    { credentials: coachCredentials, role: "coach" },
  ];

  for (const candidate of candidates) {
    const credentials = candidate.credentials;

    if (!hasCredentials(credentials)) {
      continue;
    }

    const membershipId = getLocalGrantActorMembership({
      actorEmail: credentials.email,
      orgId,
      role: candidate.role,
    });

    if (membershipId) {
      return {
        credentials,
        email: credentials.email,
        membershipId,
        role: candidate.role,
      };
    }
  }

  return null;
}

function getLocalCrossTenantDocumentActor(
  orgId: string,
): LocalCrossTenantDocumentActor | null {
  const credentials = crossTenantCredentials;

  if (!hasCredentials(credentials)) {
    return null;
  }

  const output = tryRunLocalPsql(`
    WITH target_user AS (
      SELECT auth_user.id, auth_user.email
      FROM auth.users auth_user
      WHERE lower(auth_user.email) = lower(${quoteSqlLiteral(credentials.email)})
      LIMIT 1
    ),
    tenant_a_membership AS (
      SELECT 1
      FROM public.organization_memberships membership
      INNER JOIN target_user
        ON target_user.id = membership.user_id
      WHERE membership.organization_id = ${quoteSqlLiteral(orgId)}::uuid
        AND membership.status = 'active'
      LIMIT 1
    ),
    cross_membership AS (
      SELECT
        membership.id,
        membership.organization_id,
        membership.role
      FROM public.organization_memberships membership
      INNER JOIN target_user
        ON target_user.id = membership.user_id
      INNER JOIN public.organizations organization
        ON organization.id = membership.organization_id
      WHERE membership.organization_id <> ${quoteSqlLiteral(orgId)}::uuid
        AND membership.status = 'active'
        AND organization.status IN ('trialing', 'active')
        AND NOT EXISTS (SELECT 1 FROM tenant_a_membership)
      ORDER BY
        CASE membership.role
          WHEN 'owner' THEN 1
          WHEN 'admin' THEN 2
          WHEN 'document_admin' THEN 3
          WHEN 'manager' THEN 4
          WHEN 'coach' THEN 5
          ELSE 6
        END,
        membership.created_at
      LIMIT 1
    )
    SELECT
      target_user.email,
      cross_membership.id::text,
      cross_membership.organization_id::text,
      cross_membership.role
    FROM target_user
    CROSS JOIN cross_membership;
  `);

  if (!output) {
    return null;
  }

  const [email, membershipId, crossOrganizationId, role] = output.split("|");

  return {
    credentials,
    email,
    membershipId,
    organizationId: crossOrganizationId,
    role,
    source: "cross_tenant",
  };
}

function createLocalDocumentGrant({
  accessLevel,
  actor,
  documentId,
  documentVersionId,
  orgId,
  source,
  title,
}: {
  accessLevel: LocalDocumentGrantAccessLevel;
  actor: LocalDocumentGrantActor;
  documentId: string;
  documentVersionId: string;
  orgId: string;
  source: string;
  title: string;
}): LocalDocumentGrantEvidence | null {
  if (!hasCredentials(adminCredentials)) {
    return null;
  }

  const output = tryRunLocalPsql(`
    WITH admin_user AS (
      SELECT auth_user.id
      FROM auth.users auth_user
      INNER JOIN public.organization_memberships membership
        ON membership.organization_id = ${quoteSqlLiteral(orgId)}::uuid
       AND membership.user_id = auth_user.id
       AND membership.status = 'active'
      WHERE lower(auth_user.email) = lower(${quoteSqlLiteral(adminCredentials.email)})
      LIMIT 1
    ),
    target_membership AS (
      SELECT membership.id, membership.role
      FROM public.organization_memberships membership
      INNER JOIN auth.users auth_user
        ON auth_user.id = membership.user_id
      WHERE membership.organization_id = ${quoteSqlLiteral(orgId)}::uuid
        AND membership.id = ${quoteSqlLiteral(actor.membershipId)}::uuid
        AND membership.status = 'active'
        AND membership.role = ${quoteSqlLiteral(actor.role)}
        AND lower(auth_user.email) = lower(${quoteSqlLiteral(actor.email)})
      LIMIT 1
    ),
    target_document AS (
      SELECT document.id, document.organization_id, document.document_scope
      FROM public.documents document
      WHERE document.organization_id = ${quoteSqlLiteral(orgId)}::uuid
        AND document.id = ${quoteSqlLiteral(documentId)}::uuid
        AND document.title = ${quoteSqlLiteral(title)}
        AND document.document_scope = 'programming'
        AND document.status = 'active'
      LIMIT 1
    ),
    target_version AS (
      SELECT document_version.id, document_version.document_id
      FROM public.document_versions document_version
      WHERE document_version.organization_id = ${quoteSqlLiteral(orgId)}::uuid
        AND document_version.document_id = ${quoteSqlLiteral(documentId)}::uuid
        AND document_version.id = ${quoteSqlLiteral(documentVersionId)}::uuid
        AND document_version.status = 'active'
      LIMIT 1
    ),
    inserted AS (
      INSERT INTO public.document_access_grants (
        organization_id,
        document_id,
        document_version_id,
        organization_membership_id,
        access_level,
        grant_status,
        granted_by_user_id,
        metadata
      )
      SELECT
        target_document.organization_id,
        target_document.id,
        target_version.id,
        target_membership.id,
        ${quoteSqlLiteral(accessLevel)},
        'active',
        admin_user.id,
        jsonb_build_object(
          'source',
          ${quoteSqlLiteral(source)},
          'scope',
          target_document.document_scope,
          'target_role',
          target_membership.role
        )
      FROM admin_user
      CROSS JOIN target_membership
      CROSS JOIN target_document
      CROSS JOIN target_version
      RETURNING id, access_level, grant_status
    )
    SELECT
      inserted.id::text,
      inserted.access_level,
      inserted.grant_status,
      target_membership.role
    FROM inserted
    CROSS JOIN target_membership;
  `);

  if (!output) {
    return null;
  }

  const [grantId, resolvedAccessLevel, grantStatus, targetRole] =
    output.split("|");

  return {
    accessLevel: resolvedAccessLevel,
    grantId,
    grantStatus,
    targetRole,
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

function getLocalDocumentFileAccessAuditEvidence({
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
  role: LocalDocumentGrantActorRole;
}): LocalDocumentFileAccessAuditEvidence {
  const output = runLocalPsql(`
    SELECT
      count(*) FILTER (
        WHERE event.event_type = 'file_preview'
          AND event.result = 'allowed'
      )::text,
      count(*) FILTER (
        WHERE event.event_type = 'file_download'
          AND event.result = 'allowed'
      )::text,
      count(*) FILTER (
        WHERE event.event_type = 'file_preview'
          AND event.result = 'denied'
          AND event.metadata->>'reason' = 'insufficient_access'
      )::text,
      count(*) FILTER (
        WHERE event.event_type = 'file_download'
          AND event.result = 'denied'
          AND event.metadata->>'reason' = 'insufficient_access'
      )::text
    FROM public.document_access_events event
    INNER JOIN public.organization_memberships membership
      ON membership.id = event.organization_membership_id
     AND membership.organization_id = event.organization_id
    INNER JOIN auth.users auth_user
      ON auth_user.id = event.actor_user_id
    WHERE event.organization_id = ${quoteSqlLiteral(orgId)}::uuid
      AND event.document_id = ${quoteSqlLiteral(documentId)}::uuid
      AND event.document_version_id = ${quoteSqlLiteral(documentVersionId)}::uuid
      AND membership.role = ${quoteSqlLiteral(role)}
      AND lower(auth_user.email) = lower(${quoteSqlLiteral(actorEmail)});
  `);

  const [
    previewAllowedCount,
    downloadAllowedCount,
    previewDeniedCount,
    downloadDeniedCount,
  ] = output.split("|");

  return {
    downloadAllowedCount: Number(downloadAllowedCount),
    downloadDeniedCount: Number(downloadDeniedCount),
    previewAllowedCount: Number(previewAllowedCount),
    previewDeniedCount: Number(previewDeniedCount),
  };
}

function getLocalDocumentFileAccessEventCountForActor({
  actorEmail,
  documentId,
  documentVersionId,
  orgId,
}: {
  actorEmail: string;
  documentId: string;
  documentVersionId: string;
  orgId: string;
}) {
  const output = runLocalPsql(`
    SELECT count(*)::text
    FROM public.document_access_events event
    INNER JOIN auth.users auth_user
      ON auth_user.id = event.actor_user_id
    WHERE event.organization_id = ${quoteSqlLiteral(orgId)}::uuid
      AND event.document_id = ${quoteSqlLiteral(documentId)}::uuid
      AND event.document_version_id = ${quoteSqlLiteral(documentVersionId)}::uuid
      AND lower(auth_user.email) = lower(${quoteSqlLiteral(actorEmail)});
  `);

  return Number(output);
}

function cleanupLocalDocumentUpload({
  orgId,
  title,
}: {
  orgId: string;
  title: string;
}) {
  runLocalPsql(`
    WITH target_documents AS (
      SELECT document.id, document.organization_id
      FROM public.documents document
      WHERE document.organization_id = ${quoteSqlLiteral(orgId)}::uuid
        AND document.title = ${quoteSqlLiteral(title)}
    ),
    revoked_grants AS (
      UPDATE public.document_access_grants grant_record
      SET grant_status = 'revoked'
      FROM target_documents target_document
      WHERE grant_record.document_id = target_document.id
        AND grant_record.organization_id = target_document.organization_id
        AND grant_record.grant_status = 'active'
      RETURNING grant_record.id
    ),
    target_versions AS (
      SELECT document_version.id
      FROM target_documents document
      INNER JOIN public.document_versions document_version
        ON document_version.document_id = document.id
       AND document_version.organization_id = document.organization_id
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

async function expectPrudentDocumentFileDenialResponse({
  documentId,
  documentVersionId,
  response,
}: {
  documentId: string;
  documentVersionId: string;
  response: APIResponse;
}) {
  expect([400, 404]).toContain(response.status());
  expect(response.headers()["cache-control"]).toContain("no-store");

  const responseText = await response.text();
  const responseJson = JSON.parse(responseText) as { error?: string };

  expect(Object.keys(responseJson)).toEqual(["error"]);
  expect([
    "document_file_not_available",
    "organization_not_found",
    "organization_required",
  ]).toContain(responseJson.error);
  expect(responseText).not.toContain(documentId);
  expect(responseText).not.toContain(documentVersionId);
  expect(responseText).not.toMatch(
    /signedUrl|storage_path|storage_bucket|document-files|\/storage|storage\/v1/i,
  );
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

async function expectReadMetadataGrantKeepsFileRoutesDenied({
  page,
}: {
  page: Page;
}) {
  test.setTimeout(120_000);

  if (
    !shouldRunDocumentUploadRuntimeSmoke ||
    !hasCredentials(adminCredentials) ||
    !organizationId
  ) {
    test.skip(
      true,
      "Set E2E_DOCUMENT_UPLOAD_RUNTIME=1 with E2E_ADMIN_* and E2E_ORGANIZATION_ID to run the controlled local metadata-only grant smoke.",
    );
    return;
  }

  const actor = getLocalDocumentGrantActor(organizationId);

  if (!actor) {
    test.skip(
      true,
      "Set E2E_MANAGER_* or E2E_COACH_* for an active local membership that can receive a controlled read_metadata grant.",
    );
    return;
  }

  const timestamp = Date.now();
  const title = `E21 ${actor.role} read metadata programming smoke synthetic ${timestamp}`;
  const syntheticFileName = `e21-${actor.role}-read-metadata-programming-smoke-${timestamp}.txt`;

  try {
    const uploadEvidence = await createSyntheticDocumentWithBackendRouteEvidence({
      expectedDocumentType: "programming_document",
      page,
      scope: "programming",
      scopeLabel: "Programacion",
      syntheticFileName,
      title,
    });
    const grantEvidence = createLocalDocumentGrant({
      accessLevel: "read_metadata",
      actor,
      documentId: uploadEvidence.documentId,
      documentVersionId: uploadEvidence.documentVersionId,
      orgId: organizationId,
      source: "documents-repository-surface-e21",
      title,
    });

    if (!grantEvidence) {
      test.skip(
        true,
        "Local DB did not allow preparing the controlled read_metadata grant.",
      );
      return;
    }

    expect(grantEvidence).toMatchObject({
      accessLevel: "read_metadata",
      grantStatus: "active",
      targetRole: actor.role,
    });

    await signOutCurrentSession(page);
    await loginAs(page, actor.credentials);
    await page.goto(buildProtectedPath("/app/documents", { scope: "programming" }), {
      waitUntil: "domcontentloaded",
    });
    await expectNoFrameworkError(page);

    const titleHeading = page.getByRole("heading", { name: title });
    await expect(titleHeading).toBeVisible();

    const card = titleHeading.locator(
      "xpath=ancestor::*[contains(@class, 'bg-card')][1]",
    );
    await expect(card).toContainText("Programacion");
    await expect(card).toContainText("Solo metadata");
    await expect(card).toContainText("Sin archivo para tu permiso");
    await expect(card.getByRole("link", { name: /Preview/i })).toHaveCount(0);
    await expect(card.getByRole("link", { name: /Descargar/i })).toHaveCount(0);

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
        actorEmail: actor.email,
        documentId: uploadEvidence.documentId,
        documentVersionId: uploadEvidence.documentVersionId,
        orgId: organizationId,
        role: actor.role,
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

async function expectPreviewGrantAllowsPreviewOnly({ page }: { page: Page }) {
  test.setTimeout(120_000);

  if (
    !shouldRunDocumentUploadRuntimeSmoke ||
    !hasCredentials(adminCredentials) ||
    !organizationId
  ) {
    test.skip(
      true,
      "Set E2E_DOCUMENT_UPLOAD_RUNTIME=1 with E2E_ADMIN_* and E2E_ORGANIZATION_ID to run the controlled local preview grant smoke.",
    );
    return;
  }

  const actor = getLocalDocumentGrantActor(organizationId);

  if (!actor) {
    test.skip(
      true,
      "Set E2E_MANAGER_* or E2E_COACH_* for an active local membership that can receive a controlled preview grant.",
    );
    return;
  }

  const timestamp = Date.now();
  const title = `E22 ${actor.role} preview grant programming smoke synthetic ${timestamp}`;
  const syntheticFileName = `e22-${actor.role}-preview-grant-programming-smoke-${timestamp}.txt`;

  try {
    const uploadEvidence = await createSyntheticDocumentWithBackendRouteEvidence({
      expectedDocumentType: "programming_document",
      page,
      scope: "programming",
      scopeLabel: "Programacion",
      syntheticFileName,
      title,
    });
    const grantEvidence = createLocalDocumentGrant({
      accessLevel: "preview",
      actor,
      documentId: uploadEvidence.documentId,
      documentVersionId: uploadEvidence.documentVersionId,
      orgId: organizationId,
      source: "documents-repository-surface-e22-preview",
      title,
    });

    if (!grantEvidence) {
      test.skip(
        true,
        "Local DB did not allow preparing the controlled preview grant.",
      );
      return;
    }

    expect(grantEvidence).toMatchObject({
      accessLevel: "preview",
      grantStatus: "active",
      targetRole: actor.role,
    });

    await signOutCurrentSession(page);
    await loginAs(page, actor.credentials);
    await page.goto(buildProtectedPath("/app/documents", { scope: "programming" }), {
      waitUntil: "domcontentloaded",
    });
    await expectNoFrameworkError(page);
    await expectNoDocumentFileInternalsInUi(page);

    const titleHeading = page.getByRole("heading", { name: title });
    await expect(titleHeading).toBeVisible();

    const card = titleHeading.locator(
      "xpath=ancestor::*[contains(@class, 'bg-card')][1]",
    );
    await expect(card).toContainText("Programacion");
    await expect(card).toContainText("Preview");
    await expect(card.getByRole("link", { name: /Preview/i })).toHaveCount(1);
    await expect(card.getByRole("link", { name: /Descargar/i })).toHaveCount(0);
    await expect(card.getByText("Sin archivo para tu permiso")).toHaveCount(0);

    const previewHref = await card
      .getByRole("link", { name: /Preview/i })
      .getAttribute("href");

    if (!previewHref) {
      throw new Error("Missing preview href for controlled preview grant.");
    }

    expect(previewHref).toBe(uploadEvidence.previewHref);
    expect(previewHref).not.toMatch(
      /signedUrl|storage_path|storage_bucket|document-files|\/storage|storage\/v1/i,
    );

    const previewResponse = await page.request.get(
      new URL(previewHref, page.url()).toString(),
      { maxRedirects: 0 },
    );
    const downloadResponse = await page.request.get(
      new URL(uploadEvidence.downloadHref, page.url()).toString(),
      { maxRedirects: 0 },
    );

    expect(previewResponse.status()).toBe(302);
    expect(downloadResponse.status()).toBe(404);
    expect(previewResponse.headers()["cache-control"]).toContain("no-store");
    expect(downloadResponse.headers()["cache-control"]).toContain("no-store");
    expect(await downloadResponse.json()).toMatchObject({
      error: "document_file_not_available",
    });

    expect(
      getLocalDocumentFileAccessAuditEvidence({
        actorEmail: actor.email,
        documentId: uploadEvidence.documentId,
        documentVersionId: uploadEvidence.documentVersionId,
        orgId: organizationId,
        role: actor.role,
      }),
    ).toMatchObject({
      downloadAllowedCount: 0,
      downloadDeniedCount: 1,
      previewAllowedCount: 1,
      previewDeniedCount: 0,
    });
  } finally {
    try {
      cleanupLocalDocumentUpload({ orgId: organizationId ?? "", title });
    } catch {
      // Best-effort cleanup: the synthetic title keeps any leftover local row identifiable.
    }
  }
}

async function expectDownloadGrantAllowsDownload({ page }: { page: Page }) {
  test.setTimeout(120_000);

  if (
    !shouldRunDocumentUploadRuntimeSmoke ||
    !hasCredentials(adminCredentials) ||
    !organizationId
  ) {
    test.skip(
      true,
      "Set E2E_DOCUMENT_UPLOAD_RUNTIME=1 with E2E_ADMIN_* and E2E_ORGANIZATION_ID to run the controlled local download grant smoke.",
    );
    return;
  }

  const actor = getLocalDocumentGrantActor(organizationId);

  if (!actor) {
    test.skip(
      true,
      "Set E2E_MANAGER_* or E2E_COACH_* for an active local membership that can receive a controlled download grant.",
    );
    return;
  }

  const timestamp = Date.now();
  const title = `E22 ${actor.role} download grant programming smoke synthetic ${timestamp}`;
  const syntheticFileName = `e22-${actor.role}-download-grant-programming-smoke-${timestamp}.txt`;

  try {
    const uploadEvidence = await createSyntheticDocumentWithBackendRouteEvidence({
      expectedDocumentType: "programming_document",
      page,
      scope: "programming",
      scopeLabel: "Programacion",
      syntheticFileName,
      title,
    });
    const grantEvidence = createLocalDocumentGrant({
      accessLevel: "download",
      actor,
      documentId: uploadEvidence.documentId,
      documentVersionId: uploadEvidence.documentVersionId,
      orgId: organizationId,
      source: "documents-repository-surface-e22-download",
      title,
    });

    if (!grantEvidence) {
      test.skip(
        true,
        "Local DB did not allow preparing the controlled download grant.",
      );
      return;
    }

    expect(grantEvidence).toMatchObject({
      accessLevel: "download",
      grantStatus: "active",
      targetRole: actor.role,
    });

    await signOutCurrentSession(page);
    await loginAs(page, actor.credentials);
    await page.goto(buildProtectedPath("/app/documents", { scope: "programming" }), {
      waitUntil: "domcontentloaded",
    });
    await expectNoFrameworkError(page);
    await expectNoDocumentFileInternalsInUi(page);

    const titleHeading = page.getByRole("heading", { name: title });
    await expect(titleHeading).toBeVisible();

    const card = titleHeading.locator(
      "xpath=ancestor::*[contains(@class, 'bg-card')][1]",
    );
    await expect(card).toContainText("Programacion");
    await expect(card).toContainText("Descarga");
    await expect(card.getByRole("link", { name: /Preview/i })).toHaveCount(1);
    await expect(card.getByRole("link", { name: /Descargar/i })).toHaveCount(1);

    const downloadHref = await card
      .getByRole("link", { name: /Descargar/i })
      .getAttribute("href");

    if (!downloadHref) {
      throw new Error("Missing download href for controlled download grant.");
    }

    expect(downloadHref).toBe(uploadEvidence.downloadHref);
    expect(downloadHref).not.toMatch(
      /signedUrl|storage_path|storage_bucket|document-files|\/storage|storage\/v1/i,
    );

    const downloadResponse = await page.request.get(
      new URL(downloadHref, page.url()).toString(),
      { maxRedirects: 0 },
    );

    expect(downloadResponse.status()).toBe(302);
    expect(downloadResponse.headers()["cache-control"]).toContain("no-store");

    expect(
      getLocalDocumentFileAccessAuditEvidence({
        actorEmail: actor.email,
        documentId: uploadEvidence.documentId,
        documentVersionId: uploadEvidence.documentVersionId,
        orgId: organizationId,
        role: actor.role,
      }),
    ).toMatchObject({
      downloadAllowedCount: 1,
      downloadDeniedCount: 0,
      previewDeniedCount: 0,
    });
  } finally {
    try {
      cleanupLocalDocumentUpload({ orgId: organizationId ?? "", title });
    } catch {
      // Best-effort cleanup: the synthetic title keeps any leftover local row identifiable.
    }
  }
}

async function expectCrossTenantDirectFileRoutesDenied({
  page,
}: {
  page: Page;
}) {
  test.setTimeout(150_000);

  if (
    !shouldRunDocumentUploadRuntimeSmoke ||
    !hasCredentials(adminCredentials) ||
    !organizationId
  ) {
    test.skip(
      true,
      "Set E2E_DOCUMENT_UPLOAD_RUNTIME=1 with E2E_ADMIN_* and E2E_ORGANIZATION_ID to run the controlled local cross-tenant route denial smoke.",
    );
    return;
  }

  const tenantActor = getLocalDocumentGrantActor(organizationId);

  if (!tenantActor) {
    test.skip(
      true,
      "Set E2E_MANAGER_* or E2E_COACH_* for an active tenant A membership that can receive a controlled download grant.",
    );
    return;
  }

  const crossTenantActor = getLocalCrossTenantDocumentActor(organizationId);

  if (!crossTenantActor) {
    test.skip(
      true,
      "Set E2E_CROSS_TENANT_EMAIL and E2E_CROSS_TENANT_PASSWORD as process variables for a confirmed local user with an active membership only in another tenant. Do not persist them in .env.local.",
    );
    return;
  }

  const timestamp = Date.now();
  const title = `E23 ${tenantActor.role} cross tenant programming smoke synthetic ${timestamp}`;
  const syntheticFileName = `e23-${tenantActor.role}-cross-tenant-programming-smoke-${timestamp}.txt`;

  try {
    const uploadEvidence = await createSyntheticDocumentWithBackendRouteEvidence({
      expectedDocumentType: "programming_document",
      page,
      scope: "programming",
      scopeLabel: "Programacion",
      syntheticFileName,
      title,
    });
    const grantEvidence = createLocalDocumentGrant({
      accessLevel: "download",
      actor: tenantActor,
      documentId: uploadEvidence.documentId,
      documentVersionId: uploadEvidence.documentVersionId,
      orgId: organizationId,
      source: "documents-repository-surface-e23-download",
      title,
    });

    if (!grantEvidence) {
      test.skip(
        true,
        "Local DB did not allow preparing the controlled tenant A download grant.",
      );
      return;
    }

    expect(grantEvidence).toMatchObject({
      accessLevel: "download",
      grantStatus: "active",
      targetRole: tenantActor.role,
    });

    await signOutCurrentSession(page);
    await loginAs(page, tenantActor.credentials);
    await page.goto(buildProtectedPath("/app/documents", { scope: "programming" }), {
      waitUntil: "domcontentloaded",
    });
    await expectNoFrameworkError(page);
    await expectNoDocumentFileInternalsInUi(page);

    const titleHeading = page.getByRole("heading", { name: title });
    await expect(titleHeading).toBeVisible();

    const card = titleHeading.locator(
      "xpath=ancestor::*[contains(@class, 'bg-card')][1]",
    );
    await expect(card).toContainText("Programacion");
    await expect(card).toContainText("Descarga");
    await expect(card.getByRole("link", { name: /Preview/i })).toHaveCount(1);
    await expect(card.getByRole("link", { name: /Descargar/i })).toHaveCount(1);

    const tenantPreviewResponse = await page.request.get(
      new URL(uploadEvidence.previewHref, page.url()).toString(),
      { maxRedirects: 0 },
    );
    const tenantDownloadResponse = await page.request.get(
      new URL(uploadEvidence.downloadHref, page.url()).toString(),
      { maxRedirects: 0 },
    );

    expect(tenantPreviewResponse.status()).toBe(302);
    expect(tenantDownloadResponse.status()).toBe(302);
    expect(tenantPreviewResponse.headers()["cache-control"]).toContain(
      "no-store",
    );
    expect(tenantDownloadResponse.headers()["cache-control"]).toContain(
      "no-store",
    );
    expect(
      getLocalDocumentFileAccessAuditEvidence({
        actorEmail: tenantActor.email,
        documentId: uploadEvidence.documentId,
        documentVersionId: uploadEvidence.documentVersionId,
        orgId: organizationId,
        role: tenantActor.role,
      }),
    ).toMatchObject({
      downloadAllowedCount: 1,
      downloadDeniedCount: 0,
      previewAllowedCount: 1,
      previewDeniedCount: 0,
    });

    await signOutCurrentSession(page);
    await loginAs(page, crossTenantActor.credentials);
    await page.goto(buildProtectedPath("/app/documents", { scope: "programming" }), {
      waitUntil: "domcontentloaded",
    });
    await expectNoFrameworkError(page);
    await expectNoDocumentFileInternalsInUi(page);
    await expect(page.getByRole("heading", { name: title })).toHaveCount(0);

    const crossTenantPreviewResponse = await page.request.get(
      new URL(uploadEvidence.previewHref, page.url()).toString(),
      { maxRedirects: 0 },
    );
    const crossTenantDownloadResponse = await page.request.get(
      new URL(uploadEvidence.downloadHref, page.url()).toString(),
      { maxRedirects: 0 },
    );

    await expectPrudentDocumentFileDenialResponse({
      documentId: uploadEvidence.documentId,
      documentVersionId: uploadEvidence.documentVersionId,
      response: crossTenantPreviewResponse,
    });
    await expectPrudentDocumentFileDenialResponse({
      documentId: uploadEvidence.documentId,
      documentVersionId: uploadEvidence.documentVersionId,
      response: crossTenantDownloadResponse,
    });
    expect(
      getLocalDocumentFileAccessEventCountForActor({
        actorEmail: crossTenantActor.email,
        documentId: uploadEvidence.documentId,
        documentVersionId: uploadEvidence.documentVersionId,
        orgId: organizationId,
      }),
    ).toBe(0);
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

  test("keeps E.25 cross-tenant actor setup local-only, reversible and secret-free", () => {
    const tasks = readProjectFile("TASKS.md");
    const snippetPath =
      "supabase/snippets/document-repository-cross-tenant-local-actor-setup.sql";
    const snippet = readProjectFile(snippetPath);

    expect(tasks).toContain(
      "#### E.26 - Guardrail Local Estatico Para Procedimiento Cross-Tenant E.25",
    );
    expect(tasks).toContain(snippetPath);
    expect(snippet).toContain(
      "BoxOps - E.25 local cross-tenant document route actor setup",
    );

    [
      "allow_local_synthetic_e2e_setup",
      "tenant_a_id",
      "synthetic_email",
      "synthetic_password",
    ].forEach((variableName) => {
      expect(snippet).toContain(`\\if :{?${variableName}}`);
      expect(snippet).toContain(
        `Missing required psql variable: ${variableName}`,
      );
    });

    expect(snippet).toContain(
      ":'allow_local_synthetic_e2e_setup' = 'local-only'",
    );
    expect(snippet).toContain(
      "pg_temp.assert_synthetic_email(:'synthetic_email', 'synthetic_email')",
    );
    expect(snippet).toContain("@boxops\\.local$");
    expect(snippet).toContain("CREATE TEMP TABLE selected_tenant_b");
    expect(snippet).toContain(
      "organization.id <> (SELECT tenant_a_id FROM synthetic_actor_input)",
    );
    expect(snippet).toContain("organization.status IN ('trialing', 'active')");
    expect(snippet).toContain(
      "exactly one tenant B candidate must be selected from active/trialing tenants",
    );

    expect(snippet).toContain("INSERT INTO auth.users");
    expect(snippet).toContain("email_confirmed_at");
    expect(snippet).toContain("auth_user.email_confirmed_at IS NOT NULL");
    expect(snippet).toContain("auth_user.confirmed_at IS NOT NULL");
    expect(snippet).toContain("INSERT INTO auth.identities");
    expect(snippet).toContain("identity.provider = 'email'");
    expect(snippet).toContain("INSERT INTO public.organization_memberships");
    expect(snippet).toContain("membership.status = 'active'");
    expect(snippet).toContain("INSERT INTO public.person_profiles");
    expect(snippet).toContain("person_profile.visibility_status = 'visible'");
    expect(snippet).toContain("person_profile.status = 'active'");

    expect(snippet).toContain("cleanup_synthetic_actor=1");
    expect(snippet).toContain("\\if :cleanup_synthetic_actor");
    expect(snippet).toContain("remaining_auth_users");
    expect(snippet).toContain("\\set commit_changes 0");
    expect(snippet).toMatch(
      /\\if :commit_changes[\s\S]*COMMIT;[\s\S]*\\else[\s\S]*ROLLBACK;/,
    );
    expect(snippet).toContain("commit_changes=1");
    expect(snippet).toContain(
      "Do not write E2E_CROSS_TENANT_* to .env.local",
    );
    expect(snippet).not.toMatch(
      /(?:Set-Content|Add-Content|Out-File|tee|>>|>)\s+[^\n]*\.env\.local/i,
    );

    expect(snippet).not.toContain("/app/documents");
    expect(snippet).not.toMatch(/\bservice_role\b/i);
    expect(snippet).not.toMatch(
      /createSignedUrl|signedUrl|signed_url|X-Amz-Signature|token=/i,
    );
    expect(snippet).not.toMatch(
      /document-files\/|storage\/v1|storage_path|storage_bucket|bucket_id/i,
    );
    expect(snippet).not.toMatch(
      /sb_secret_|SUPABASE_SERVICE_ROLE|SUPABASE_ACCESS_TOKEN|eyJ[a-zA-Z0-9_-]{20,}|postgres(?:ql)?:\/\/|https?:\/\//i,
    );
  });

  test("keeps E.23-E.25 cross-tenant smoke credentials process-only", () => {
    const tasks = readProjectFile("TASKS.md");
    const envHelper = readProjectFile("tests/smoke/helpers/env.ts");
    const smoke = readProjectFile(
      "tests/smoke/documents-repository-surface.spec.ts",
    );
    const snippet = readProjectFile(
      "supabase/snippets/document-repository-cross-tenant-local-actor-setup.sql",
    );
    const persistentEnvWritePattern =
      /(?:Set-Content|Add-Content|Out-File|tee|>>|>)\s+[^\n]*\.env\.local/i;
    const normalRoleFallbackHint = [
      "or provide another",
      "E2E role credential",
    ].join(" ");

    expect(tasks).toContain(
      "#### E.27 - Guardrail Local Para Credenciales Cross-Tenant Process-Only",
    );
    expect(envHelper).toContain("const envFileValues = readEnvFile();");
    expect(envHelper).toContain(
      "const value = process.env[name]?.trim() ?? envFileValues.get(name)?.trim();",
    );
    expect(envHelper).toContain(
      'export const adminCredentials = readCredentials("E2E_ADMIN");',
    );
    expect(envHelper).toContain(
      'export const managerCredentials = readCredentials("E2E_MANAGER");',
    );
    expect(envHelper).toContain(
      "function readProcessEnv(name: string): string | null",
    );
    expect(envHelper).toContain("function readProcessCredentials(");
    expect(envHelper).toMatch(
      /export const crossTenantCredentials = readProcessCredentials\(\s*"E2E_CROSS_TENANT_EMAIL",\s*"E2E_CROSS_TENANT_PASSWORD",\s*\);/,
    );
    expect(envHelper).not.toContain(
      'crossTenantCredentials = readCredentials("E2E_CROSS_TENANT")',
    );
    expect(envHelper).not.toMatch(
      /envFileValues\.get\(\s*["'`]E2E_CROSS_TENANT/,
    );

    expect(smoke).toContain("crossTenantCredentials");
    expect(smoke).toContain(
      "Set E2E_CROSS_TENANT_EMAIL and E2E_CROSS_TENANT_PASSWORD as process variables",
    );
    expect(smoke).not.toContain(normalRoleFallbackHint);
    expect(snippet).toContain(
      "Do not write E2E_CROSS_TENANT_* to .env.local",
    );
    expect(snippet).toContain("process variables");

    [envHelper, smoke, snippet].forEach((source) => {
      expect(source).not.toMatch(persistentEnvWritePattern);
    });
  });

  test("keeps E.28 cross-tenant actor selection explicit and process-only", () => {
    const tasks = readProjectFile("TASKS.md");
    const envHelper = readProjectFile("tests/smoke/helpers/env.ts");
    const smoke = readProjectFile(
      "tests/smoke/documents-repository-surface.spec.ts",
    );
    const snippet = readProjectFile(
      "supabase/snippets/document-repository-cross-tenant-local-actor-setup.sql",
    );
    const actorSelectionSource =
      smoke.match(
        /function getLocalCrossTenantDocumentActor\([\s\S]*?\n}\n\nfunction createLocalDocumentGrant/,
      )?.[0] ?? "";
    const normalRoleFallbackHint = [
      "or provide another",
      "E2E role credential",
    ].join(" ");

    expect(tasks).toContain(
      "#### E.28 - Actor Cross-Tenant Documental Solo Desde Credenciales Explicitas Process-Only",
    );
    expect(actorSelectionSource).not.toBe("");
    expect(actorSelectionSource).toContain(
      "const credentials = crossTenantCredentials;",
    );
    expect(actorSelectionSource).toContain('source: "cross_tenant"');
    expect(actorSelectionSource).not.toContain("const candidates");
    expect(actorSelectionSource).not.toMatch(
      /\b(?:ownerCredentials|adminCredentials|managerCredentials|coachCredentials|payrollManagerCredentials)\b/,
    );
    expect(actorSelectionSource).not.toMatch(
      /\bsource:\s*"(?:owner|admin|manager|coach|payroll_manager)"/,
    );

    expect(envHelper).toMatch(
      /export const crossTenantCredentials = readProcessCredentials\(\s*"E2E_CROSS_TENANT_EMAIL",\s*"E2E_CROSS_TENANT_PASSWORD",\s*\);/,
    );
    expect(envHelper).not.toMatch(
      /envFileValues\.get\(\s*["'`]E2E_CROSS_TENANT/,
    );
    expect(smoke).toContain(
      "Set E2E_CROSS_TENANT_EMAIL and E2E_CROSS_TENANT_PASSWORD as process variables",
    );
    expect(smoke).toContain("Do not persist them in .env.local");
    expect(smoke).not.toContain(normalRoleFallbackHint);
    expect(snippet).toContain(
      "Do not write E2E_CROSS_TENANT_* to .env.local",
    );
    expect(snippet).toContain("process variables");
  });

  test("keeps E.29 local cross-tenant actor runbook guidance explicit", () => {
    const tasks = readProjectFile("TASKS.md");
    const envHelper = readProjectFile("tests/smoke/helpers/env.ts");
    const smoke = readProjectFile(
      "tests/smoke/documents-repository-surface.spec.ts",
    );
    const runbook = readProjectFile(
      "docs/operations/document-repository-beta-readiness-runbook.md",
    );
    const snippet = readProjectFile(
      "supabase/snippets/document-repository-cross-tenant-local-actor-setup.sql",
    );

    expect(tasks).toContain(
      "#### E.29 - Runbook Local Del Actor Cross-Tenant Documental Process-Only",
    );
    expect(runbook).toContain(
      "## Nota Local E.23-E.28: Actor Cross-Tenant Documental",
    );
    expect(runbook).toContain(
      "El actor cross-tenant local solo puede venir de `E2E_CROSS_TENANT_EMAIL` / `E2E_CROSS_TENANT_PASSWORD`.",
    );
    expect(runbook).toContain(
      "Esas variables se pasan solo como variables de proceso durante la ventana corta del smoke.",
    );
    expect(runbook).toContain(
      "No escribir `E2E_CROSS_TENANT_*` en `.env.local` ni en ningun archivo persistente.",
    );
    expect(runbook).toContain(
      "No sustituir el actor por credenciales normales de rol E2E",
    );
    expect(runbook).toContain(
      "El actor E.25 es sintetico, temporal, local-only y process-only",
    );
    expect(runbook).toContain("cleanup_synthetic_actor=1");
    expect(runbook).toContain("remaining_auth_users=0");

    expect(envHelper).toMatch(
      /export const crossTenantCredentials = readProcessCredentials\(\s*"E2E_CROSS_TENANT_EMAIL",\s*"E2E_CROSS_TENANT_PASSWORD",\s*\);/,
    );
    expect(smoke).toContain(
      "Set E2E_CROSS_TENANT_EMAIL and E2E_CROSS_TENANT_PASSWORD as process variables",
    );
    expect(snippet).toContain(
      "Do not write E2E_CROSS_TENANT_* to .env.local",
    );
    expect(snippet).toContain("cleanup_synthetic_actor=1");
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

  test("allows metadata-only grant listing while denying direct programming file routes", async ({
    page,
  }) => {
    await expectReadMetadataGrantKeepsFileRoutesDenied({ page });
  });

  test("allows preview grant file preview while denying direct download", async ({
    page,
  }) => {
    await expectPreviewGrantAllowsPreviewOnly({ page });
  });

  test("allows download grant file download through backend route", async ({
    page,
  }) => {
    await expectDownloadGrantAllowsDownload({ page });
  });

  test("denies cross-tenant direct programming file routes while tenant grant remains scoped", async ({
    page,
  }) => {
    await expectCrossTenantDirectFileRoutesDenied({ page });
  });
});
