import { NextResponse, type NextRequest } from "next/server";

import { getLoginPath } from "@/lib/auth/redirects";
import {
  getActiveMemberships,
  getAuthenticatedUser,
  resolveActiveOrganization,
} from "@/lib/auth/tenant";
import { createClient } from "@/lib/supabase/server";
import { isPostgresUuid } from "@/lib/uuid";
import type { Json, Tables } from "@/types/supabase";

export const DOCUMENT_FILES_BUCKET = "document-files";
export const DOCUMENT_FILE_SIGNED_URL_TTL_SECONDS = 60;

type DocumentFileAccessMode = "preview" | "download";

type DocumentVersionFileRow = Pick<
  Tables<"document_versions">,
  | "document_id"
  | "id"
  | "mime_type"
  | "organization_id"
  | "original_filename"
  | "status"
  | "storage_bucket"
  | "storage_path"
>;

type DocumentFileRow = Pick<
  Tables<"documents">,
  "id" | "requires_signature" | "status"
>;

const READABLE_DOCUMENT_STATUSES = new Set(["active", "archived"]);
const READABLE_DOCUMENT_VERSION_STATUSES = new Set(["active", "archived"]);

function getAccessLevel(mode: DocumentFileAccessMode) {
  return mode === "preview" ? "preview" : "download";
}

function getEventType(mode: DocumentFileAccessMode) {
  return mode === "preview" ? "file_preview" : "file_download";
}

function noStoreJson(code: string, status: number) {
  return NextResponse.json(
    {
      error: code,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
      status,
    },
  );
}

function notAvailable() {
  return noStoreJson("document_file_not_available", 404);
}

function redirectToLogin(request: NextRequest) {
  const redirectTo = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  const loginUrl = new URL(getLoginPath(redirectTo), request.url);

  return NextResponse.redirect(loginUrl, 303);
}

async function recordDocumentFileAccessEvent({
  accessLevel,
  documentId,
  documentVersionId,
  eventType,
  metadata = {},
  organizationId,
  result,
}: {
  accessLevel: "preview" | "download";
  documentId: string;
  documentVersionId: string;
  eventType: "file_preview" | "file_download";
  metadata?: Json;
  organizationId: string;
  result: "allowed" | "denied";
}) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_document_access_event", {
    target_access_level: accessLevel,
    target_document_id: documentId,
    target_document_version_id: documentVersionId,
    target_event_type: eventType,
    target_metadata: metadata,
    target_organization_id: organizationId,
    target_result: result,
  });

  return !error;
}

async function recordDeniedDocumentFileAccess({
  accessLevel,
  documentId,
  documentVersionId,
  eventType,
  organizationId,
  reason,
}: {
  accessLevel: "preview" | "download";
  documentId: string;
  documentVersionId: string;
  eventType: "file_preview" | "file_download";
  organizationId: string;
  reason: string;
}) {
  await recordDocumentFileAccessEvent({
    accessLevel,
    documentId,
    documentVersionId,
    eventType,
    metadata: { reason },
    organizationId,
    result: "denied",
  });
}

async function getAccessibleDocumentVersion({
  documentId,
  documentVersionId,
  organizationId,
}: {
  documentId: string;
  documentVersionId: string;
  organizationId: string;
}) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("document_versions")
    .select(
      "id, organization_id, document_id, storage_bucket, storage_path, original_filename, mime_type, status",
    )
    .eq("id", documentVersionId)
    .eq("document_id", documentId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not load document version: ${error.message}`);
  }

  return data satisfies DocumentVersionFileRow | null;
}

async function getAccessibleDocument({
  documentId,
  organizationId,
}: {
  documentId: string;
  organizationId: string;
}) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("documents")
    .select("id, requires_signature, status")
    .eq("id", documentId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not load document: ${error.message}`);
  }

  return data satisfies DocumentFileRow | null;
}

export async function handleDocumentVersionFileAccess({
  documentId,
  documentVersionId,
  mode,
  request,
}: {
  documentId: string;
  documentVersionId: string;
  mode: DocumentFileAccessMode;
  request: NextRequest;
}) {
  if (!isPostgresUuid(documentId) || !isPostgresUuid(documentVersionId)) {
    return notAvailable();
  }

  const user = await getAuthenticatedUser();

  if (!user) {
    return redirectToLogin(request);
  }

  const memberships = await getActiveMemberships(user.id);
  const requestedOrganizationId = request.nextUrl.searchParams.get("organizationId");
  const resolution = resolveActiveOrganization(
    memberships,
    requestedOrganizationId,
  );

  if (!resolution.ok) {
    return noStoreJson(resolution.reason, 400);
  }

  const organizationId = resolution.organization.id;
  const accessLevel = getAccessLevel(mode);
  const eventType = getEventType(mode);
  const supabase = await createClient();
  const { data: canAccess, error: accessError } = await supabase.rpc(
    "can_access_document",
    {
      target_access_level: accessLevel,
      target_document_id: documentId,
      target_document_version_id: documentVersionId,
      target_organization_id: organizationId,
    },
  );

  if (accessError) {
    return notAvailable();
  }

  if (!canAccess) {
    await recordDeniedDocumentFileAccess({
      accessLevel,
      documentId,
      documentVersionId,
      eventType,
      organizationId,
      reason: "insufficient_access",
    });

    return notAvailable();
  }

  const documentVersion = await getAccessibleDocumentVersion({
    documentId,
    documentVersionId,
    organizationId,
  });

  if (!documentVersion) {
    return notAvailable();
  }

  const document = await getAccessibleDocument({
    documentId,
    organizationId,
  });

  if (!document) {
    return notAvailable();
  }

  if (
    document.requires_signature ||
    documentVersion.storage_bucket !== DOCUMENT_FILES_BUCKET ||
    !READABLE_DOCUMENT_STATUSES.has(document.status) ||
    !READABLE_DOCUMENT_VERSION_STATUSES.has(documentVersion.status)
  ) {
    await recordDeniedDocumentFileAccess({
      accessLevel,
      documentId,
      documentVersionId,
      eventType,
      organizationId,
      reason: "document_file_not_readable",
    });

    return notAvailable();
  }

  const { data: signedUrlData, error: signedUrlError } = await supabase.storage
    .from(DOCUMENT_FILES_BUCKET)
    .createSignedUrl(
      documentVersion.storage_path,
      DOCUMENT_FILE_SIGNED_URL_TTL_SECONDS,
      mode === "download"
        ? {
            download: documentVersion.original_filename,
          }
        : undefined,
    );

  if (signedUrlError || !signedUrlData?.signedUrl) {
    return notAvailable();
  }

  const auditRecorded = await recordDocumentFileAccessEvent({
    accessLevel,
    documentId,
    documentVersionId,
    eventType,
    organizationId,
    result: "allowed",
  });

  if (!auditRecorded) {
    return noStoreJson("document_file_audit_required", 500);
  }

  const response = NextResponse.redirect(signedUrlData.signedUrl, 302);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Robots-Tag", "noindex");

  return response;
}
