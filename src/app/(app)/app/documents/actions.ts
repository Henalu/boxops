"use server";

import { Buffer } from "node:buffer";
import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { DOCUMENT_FILES_BUCKET } from "@/lib/document-file-access";
import {
  getActiveMemberships,
  getAuthenticatedUser,
  resolveActiveOrganization,
} from "@/lib/auth/tenant";
import { getLoginPath } from "@/lib/auth/redirects";
import {
  getDocumentUploadDocumentType,
  normalizeDocumentUploadScope,
  validateMinimalDocumentUploadFile,
} from "@/lib/documents";
import { getDocumentsPath } from "@/lib/navigation/app-paths";
import { createClient } from "@/lib/supabase/server";

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

function getErrorPath(
  organizationId: string | null,
  error: string,
  scope?: string | null,
) {
  return getDocumentsPath({
    documentScope: scope,
    error,
    organizationId,
  });
}

function getStatusPath(
  organizationId: string,
  status: string,
  scope: string,
) {
  return getDocumentsPath({
    documentScope: scope,
    organizationId,
    status,
  });
}

function getCleanDescription(value: string) {
  if (!value) {
    return null;
  }

  return value.slice(0, 500);
}

async function getDocumentUploadActionContext(formData: FormData) {
  const organizationId = getFormString(formData, "organizationId");
  const redirectPath = getDocumentsPath({ organizationId });
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect(getLoginPath(redirectPath));
  }

  const memberships = await getActiveMemberships(user.id);
  const resolution = resolveActiveOrganization(memberships, organizationId);

  if (!resolution.ok) {
    redirect(getErrorPath(organizationId, resolution.reason));
  }

  return {
    organization: resolution.organization,
    user,
  };
}

async function markDocumentDeleted({
  documentId,
  organizationId,
}: {
  documentId: string;
  organizationId: string;
}) {
  const supabase = await createClient();

  await supabase
    .from("documents")
    .update({ status: "deleted" })
    .eq("id", documentId)
    .eq("organization_id", organizationId);
}

async function cancelPendingDocumentVersion(documentVersionId: string) {
  const supabase = await createClient();

  await supabase.rpc("cancel_document_version_upload", {
    target_document_version_id: documentVersionId,
  });
}

async function cleanupPendingDocumentUpload({
  documentId,
  documentVersionId,
  organizationId,
}: {
  documentId: string;
  documentVersionId?: string;
  organizationId: string;
}) {
  if (documentVersionId) {
    await cancelPendingDocumentVersion(documentVersionId);
  }

  await markDocumentDeleted({ documentId, organizationId });
}

export async function createDocumentWithInitialFileUpload(formData: FormData) {
  const context = await getDocumentUploadActionContext(formData);
  const title = getFormString(formData, "title");
  const description = getCleanDescription(getFormString(formData, "description"));
  const scope = normalizeDocumentUploadScope(getFormString(formData, "scope"));

  if (!scope) {
    redirect(getErrorPath(context.organization.id, "invalid-scope"));
  }

  if (!title || title.length > 160) {
    redirect(getErrorPath(context.organization.id, "invalid-title", scope));
  }

  const rawFile = formData.get("documentFile");
  const file = rawFile instanceof File ? rawFile : null;

  if (!file) {
    redirect(getErrorPath(context.organization.id, "file-empty", scope));
  }

  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const validation = validateMinimalDocumentUploadFile(file, bytes);

  if (!validation.ok) {
    redirect(getErrorPath(context.organization.id, validation.error, scope));
  }

  const supabase = await createClient();
  const { data: canManageMetadata, error: permissionError } = await supabase.rpc(
    "can_manage_document_metadata",
    {
      target_document_scope: scope,
      target_organization_id: context.organization.id,
      target_sensitivity_level: "restricted",
    },
  );

  if (permissionError || !canManageMetadata) {
    redirect(getErrorPath(context.organization.id, "forbidden", scope));
  }

  const documentId = randomUUID();
  const { error: documentError } = await supabase
    .from("documents")
    .insert({
      id: documentId,
      created_by_user_id: context.user.id,
      description,
      document_scope: scope,
      document_type: getDocumentUploadDocumentType(scope),
      metadata: {
        source: "app_documents_minimal_upload",
      },
      organization_id: context.organization.id,
      requires_signature: false,
      sensitivity_level: "restricted",
      status: "draft",
      title,
    });

  if (documentError) {
    redirect(getErrorPath(context.organization.id, "metadata-save-failed", scope));
  }

  const fileBuffer = Buffer.from(arrayBuffer);
  const documentHash = createHash("sha256").update(fileBuffer).digest("hex");
  const { data: pendingVersion, error: beginError } = await supabase.rpc(
    "begin_document_version_upload",
    {
      target_document_hash: documentHash,
      target_document_id: documentId,
      target_file_extension: validation.extension,
      target_metadata: {
        source: "app_documents_minimal_upload",
      },
      target_mime_type: validation.mimeType,
      target_organization_id: context.organization.id,
      target_original_filename: validation.originalFilename,
      target_size_bytes: validation.sizeBytes,
    },
  );

  if (beginError || !pendingVersion) {
    await markDocumentDeleted({
      documentId,
      organizationId: context.organization.id,
    });

    redirect(getErrorPath(context.organization.id, "upload-start-failed", scope));
  }

  const { error: uploadError } = await supabase.storage
    .from(DOCUMENT_FILES_BUCKET)
    .upload(pendingVersion.storage_path, fileBuffer, {
      cacheControl: "3600",
      contentType: validation.mimeType,
      upsert: false,
    });

  if (uploadError) {
    await cleanupPendingDocumentUpload({
      documentId,
      documentVersionId: pendingVersion.id,
      organizationId: context.organization.id,
    });

    redirect(getErrorPath(context.organization.id, "upload-failed", scope));
  }

  const { error: activateError } = await supabase.rpc(
    "activate_document_version_upload",
    {
      target_document_version_id: pendingVersion.id,
    },
  );

  if (activateError) {
    await cleanupPendingDocumentUpload({
      documentId,
      documentVersionId: pendingVersion.id,
      organizationId: context.organization.id,
    });

    redirect(getErrorPath(context.organization.id, "activation-failed", scope));
  }

  const { error: publishError } = await supabase
    .from("documents")
    .update({ status: "active" })
    .eq("id", documentId)
    .eq("organization_id", context.organization.id);

  if (publishError) {
    await cleanupPendingDocumentUpload({
      documentId,
      documentVersionId: pendingVersion.id,
      organizationId: context.organization.id,
    });

    redirect(getErrorPath(context.organization.id, "metadata-save-failed", scope));
  }

  revalidatePath("/app/documents");

  redirect(getStatusPath(context.organization.id, "document-uploaded", scope));
}
