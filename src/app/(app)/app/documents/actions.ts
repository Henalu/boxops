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
import { isPostgresUuid } from "@/lib/uuid";

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

function getFormStringArray(formData: FormData, key: string) {
  return formData
    .getAll(key)
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);
}

function getErrorPath(
  folderId: string | null,
  organizationId: string | null,
  error: string,
  scope?: string | null,
) {
  return getDocumentsPath({
    documentFolderId: folderId,
    documentScope: scope,
    error,
    organizationId,
  });
}

function getStatusPath(
  folderId: string | null,
  organizationId: string,
  status: string,
  scope: string,
) {
  return getDocumentsPath({
    documentFolderId: folderId,
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
    redirect(getErrorPath(null, organizationId, resolution.reason));
  }

  return {
    organization: resolution.organization,
    user,
  };
}

function getCleanFolderName(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, 120);
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
  const rawFolderId = getFormString(formData, "folderId");
  const folderId = rawFolderId || null;

  if (!scope) {
    redirect(getErrorPath(folderId, context.organization.id, "invalid-scope"));
  }

  if (!title || title.length > 160) {
    redirect(getErrorPath(folderId, context.organization.id, "invalid-title", scope));
  }

  if (folderId && !isPostgresUuid(folderId)) {
    redirect(getErrorPath(null, context.organization.id, "invalid-folder", scope));
  }

  const rawFile = formData.get("documentFile");
  const file = rawFile instanceof File ? rawFile : null;

  if (!file) {
    redirect(getErrorPath(folderId, context.organization.id, "file-empty", scope));
  }

  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const validation = validateMinimalDocumentUploadFile(file, bytes);

  if (!validation.ok) {
    redirect(getErrorPath(folderId, context.organization.id, validation.error, scope));
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
    redirect(getErrorPath(folderId, context.organization.id, "forbidden", scope));
  }

  if (folderId) {
    const { data: canManageFolder, error: folderPermissionError } =
      await supabase.rpc("can_manage_document_folder_by_id", {
        target_folder_id: folderId,
        target_organization_id: context.organization.id,
      });

    if (folderPermissionError || !canManageFolder) {
      redirect(getErrorPath(null, context.organization.id, "invalid-folder", scope));
    }
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
      folder_id: folderId,
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
    redirect(
      getErrorPath(folderId, context.organization.id, "metadata-save-failed", scope),
    );
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

    redirect(
      getErrorPath(folderId, context.organization.id, "upload-start-failed", scope),
    );
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

    redirect(getErrorPath(folderId, context.organization.id, "upload-failed", scope));
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

    redirect(
      getErrorPath(folderId, context.organization.id, "activation-failed", scope),
    );
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

    redirect(
      getErrorPath(folderId, context.organization.id, "metadata-save-failed", scope),
    );
  }

  revalidatePath("/app/documents");

  redirect(
    getStatusPath(folderId, context.organization.id, "document-uploaded", scope),
  );
}

async function createDocumentFolderRedirectPath(formData: FormData) {
  const context = await getDocumentUploadActionContext(formData);
  const name = getCleanFolderName(getFormString(formData, "folderName"));
  const description = getCleanDescription(
    getFormString(formData, "folderDescription"),
  );
  const visibility = getFormString(formData, "folderVisibility");
  const selectedPersonIds = Array.from(
    new Set(
      getFormStringArray(formData, "personProfileIds").filter(isPostgresUuid),
    ),
  );
  const scope = normalizeDocumentUploadScope(getFormString(formData, "scope"));

  if (!name) {
    return getErrorPath(null, context.organization.id, "invalid-folder-name", scope);
  }

  if (!["management", "all", "people"].includes(visibility)) {
    return getErrorPath(
      null,
      context.organization.id,
      "invalid-folder-permission",
      scope,
    );
  }

  if (visibility === "people" && selectedPersonIds.length === 0) {
    return getErrorPath(
      null,
      context.organization.id,
      "invalid-folder-people",
      scope,
    );
  }

  const supabase = await createClient();
  const { data: canManageFolders, error: permissionError } = await supabase.rpc(
    "can_manage_document_folder_metadata",
    {
      target_organization_id: context.organization.id,
    },
  );

  if (permissionError || !canManageFolders) {
    return getErrorPath(null, context.organization.id, "forbidden", scope);
  }

  const { data: folder, error: folderError } = await supabase
    .from("document_folders")
    .insert({
      created_by_user_id: context.user.id,
      description,
      metadata: {
        source: "app_documents_folder_create",
        visibility,
      },
      name,
      organization_id: context.organization.id,
      status: "active",
    })
    .select("id")
    .single();

  if (folderError || !folder) {
    return getErrorPath(
      null,
      context.organization.id,
      "folder-create-failed",
      scope,
    );
  }

  const grantRows =
    visibility === "all"
      ? [
          {
            access_level: "download",
            folder_id: folder.id,
            grant_status: "active",
            granted_by_user_id: context.user.id,
            metadata: { source: "app_documents_folder_create" },
            organization_id: context.organization.id,
            target_type: "all_members",
          },
        ]
      : visibility === "management"
        ? ["owner", "admin", "manager", "center_manager", "document_admin"].map(
            (role) => ({
              access_level: "download",
              folder_id: folder.id,
              grant_status: "active",
              granted_by_user_id: context.user.id,
              metadata: { source: "app_documents_folder_create" },
              organization_id: context.organization.id,
              role,
              target_type: "role",
            }),
          )
        : selectedPersonIds.map((personProfileId) => ({
            access_level: "download",
            folder_id: folder.id,
            grant_status: "active",
            granted_by_user_id: context.user.id,
            metadata: { source: "app_documents_folder_create" },
            organization_id: context.organization.id,
            person_profile_id: personProfileId,
            target_type: "person",
          }));

  const { error: grantsError } = await supabase
    .from("document_folder_access_grants")
    .insert(grantRows);

  if (grantsError) {
    await supabase
      .from("document_folders")
      .update({ status: "archived" })
      .eq("id", folder.id)
      .eq("organization_id", context.organization.id);

    return getErrorPath(
      null,
      context.organization.id,
      "folder-grants-failed",
      scope,
    );
  }

  revalidatePath("/app/documents");

  return getStatusPath(
    folder.id,
    context.organization.id,
    "folder-created",
    scope ?? "company",
  );
}

export async function createDocumentFolder(formData: FormData) {
  redirect(await createDocumentFolderRedirectPath(formData));
}

export async function createDocumentFolderFromClient(formData: FormData) {
  return {
    path: await createDocumentFolderRedirectPath(formData),
  };
}
