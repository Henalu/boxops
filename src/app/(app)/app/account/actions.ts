"use server";

import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getLoginPath } from "@/lib/auth/redirects";
import { canUsePersonalFeatures } from "@/lib/auth/permissions";
import {
  getActiveMemberships,
  getAuthenticatedUser,
  resolveActiveOrganization,
} from "@/lib/auth/tenant";
import { getAccountPath } from "@/lib/navigation/app-paths";
import { validatePersonalProfileForm } from "@/lib/personal-profile";
import {
  PROFILE_ASSETS_BUCKET,
  validateAvatarUploadFile,
} from "@/lib/profile-assets";
import {
  PROFILE_SIGNATURES_BUCKET,
  validateSignatureDataUrl,
} from "@/lib/profile-signatures";
import { createClient } from "@/lib/supabase/server";

function getRequiredFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

function getErrorPath(organizationId: string | null, error: string) {
  return getAccountPath({
    organizationId,
    error,
  });
}

async function getPersonalAccountActionContext(formData: FormData) {
  const organizationId = getRequiredFormString(formData, "organizationId");
  const redirectPath = getAccountPath({ organizationId });
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect(getLoginPath(redirectPath));
  }

  const memberships = await getActiveMemberships(user.id);
  const resolution = resolveActiveOrganization(memberships, organizationId);

  if (!resolution.ok) {
    redirect(getErrorPath(organizationId, resolution.reason));
  }

  if (!canUsePersonalFeatures(resolution.membership.role)) {
    redirect(getErrorPath(resolution.organization.id, "forbidden"));
  }

  return {
    organization: resolution.organization,
    user,
  };
}

export async function updateOwnPersonProfile(formData: FormData) {
  const context = await getPersonalAccountActionContext(formData);
  const validation = validatePersonalProfileForm(formData);

  if (!validation.ok) {
    redirect(getErrorPath(context.organization.id, validation.error));
  }

  const supabase = await createClient();
  const { data: profile, error: profileError } = await supabase
    .from("person_profiles")
    .select("id")
    .eq("organization_id", context.organization.id)
    .eq("user_id", context.user.id)
    .maybeSingle();

  if (profileError) {
    redirect(getErrorPath(context.organization.id, "save-failed"));
  }

  if (!profile) {
    redirect(getErrorPath(context.organization.id, "profile-missing"));
  }

  const { error } = await supabase
    .from("person_profiles")
    .update({
      display_name: validation.values.displayName,
      preferred_alias: validation.values.preferredAlias,
      public_email: validation.values.publicEmail,
    })
    .eq("id", profile.id)
    .eq("organization_id", context.organization.id)
    .eq("user_id", context.user.id)
    .select("id")
    .single();

  if (error) {
    redirect(getErrorPath(context.organization.id, "save-failed"));
  }

  revalidatePath("/app/account");
  revalidatePath("/app/coaches");
  revalidatePath("/app/schedule");

  redirect(
    getAccountPath({
      organizationId: context.organization.id,
      status: "profile-updated",
    }),
  );
}

export async function updateOwnAvatar(formData: FormData) {
  const context = await getPersonalAccountActionContext(formData);
  const rawFile = formData.get("avatar");
  const file = rawFile instanceof File ? rawFile : null;

  if (!file || file.size === 0) {
    redirect(getErrorPath(context.organization.id, "avatar-empty"));
  }

  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const validation = validateAvatarUploadFile(file, bytes);

  if (!validation.ok) {
    redirect(getErrorPath(context.organization.id, validation.error));
  }

  const supabase = await createClient();
  const { data: profile, error: profileError } = await supabase
    .from("person_profiles")
    .select("id")
    .eq("organization_id", context.organization.id)
    .eq("user_id", context.user.id)
    .maybeSingle();

  if (profileError) {
    redirect(getErrorPath(context.organization.id, "avatar-save-failed"));
  }

  if (!profile) {
    redirect(getErrorPath(context.organization.id, "profile-missing"));
  }

  const assetHash = createHash("sha256").update(bytes).digest("hex");
  const { data: pendingAsset, error: beginError } = await supabase.rpc(
    "begin_own_profile_avatar_upload",
    {
      target_asset_hash: assetHash,
      target_file_extension: validation.extension,
      target_mime_type: validation.mimeType,
      target_organization_id: context.organization.id,
      target_size_bytes: validation.sizeBytes,
    },
  );

  if (beginError || !pendingAsset) {
    redirect(getErrorPath(context.organization.id, "avatar-save-failed"));
  }

  const fileBuffer = Buffer.from(arrayBuffer);
  const { error: uploadError } = await supabase.storage
    .from(PROFILE_ASSETS_BUCKET)
    .upload(pendingAsset.storage_path, fileBuffer, {
      cacheControl: "3600",
      contentType: validation.mimeType,
      upsert: false,
    });

  if (uploadError) {
    await supabase.rpc("cancel_own_profile_avatar_upload", {
      target_asset_id: pendingAsset.id,
    });

    redirect(getErrorPath(context.organization.id, "avatar-upload-failed"));
  }

  const { error: activateError } = await supabase.rpc(
    "activate_own_profile_avatar_asset",
    {
      target_asset_id: pendingAsset.id,
    },
  );

  if (activateError) {
    await supabase.rpc("cancel_own_profile_avatar_upload", {
      target_asset_id: pendingAsset.id,
    });

    redirect(getErrorPath(context.organization.id, "avatar-save-failed"));
  }

  revalidatePath("/app/account");

  redirect(
    getAccountPath({
      organizationId: context.organization.id,
      status: "avatar-updated",
    }),
  );
}

export async function updateOwnSignature(formData: FormData) {
  const context = await getPersonalAccountActionContext(formData);
  const signatureDataUrl = getRequiredFormString(formData, "signatureDataUrl");
  const validation = validateSignatureDataUrl(signatureDataUrl);

  if (!validation.ok) {
    redirect(getErrorPath(context.organization.id, validation.error));
  }

  const supabase = await createClient();
  const { data: profile, error: profileError } = await supabase
    .from("person_profiles")
    .select("id")
    .eq("organization_id", context.organization.id)
    .eq("user_id", context.user.id)
    .maybeSingle();

  if (profileError) {
    redirect(getErrorPath(context.organization.id, "signature-save-failed"));
  }

  if (!profile) {
    redirect(getErrorPath(context.organization.id, "profile-missing"));
  }

  const fileBuffer = Buffer.from(validation.bytes);
  const signatureHash = createHash("sha256").update(fileBuffer).digest("hex");
  const { data: pendingSignature, error: beginError } = await supabase.rpc(
    "begin_own_profile_signature_upload",
    {
      target_height: validation.height,
      target_organization_id: context.organization.id,
      target_signature_hash: signatureHash,
      target_size_bytes: validation.sizeBytes,
      target_width: validation.width,
    },
  );

  if (beginError || !pendingSignature) {
    redirect(getErrorPath(context.organization.id, "signature-save-failed"));
  }

  const { error: uploadError } = await supabase.storage
    .from(PROFILE_SIGNATURES_BUCKET)
    .upload(pendingSignature.storage_path, fileBuffer, {
      cacheControl: "3600",
      contentType: validation.mimeType,
      upsert: false,
    });

  if (uploadError) {
    await supabase.rpc("cancel_own_profile_signature_upload", {
      target_signature_id: pendingSignature.id,
    });

    redirect(getErrorPath(context.organization.id, "signature-upload-failed"));
  }

  const { error: activateError } = await supabase.rpc(
    "activate_own_profile_signature",
    {
      target_signature_id: pendingSignature.id,
    },
  );

  if (activateError) {
    await supabase.rpc("cancel_own_profile_signature_upload", {
      target_signature_id: pendingSignature.id,
    });

    redirect(getErrorPath(context.organization.id, "signature-save-failed"));
  }

  revalidatePath("/app/account");

  redirect(
    getAccountPath({
      organizationId: context.organization.id,
      status: "signature-updated",
    }),
  );
}
