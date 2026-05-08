export const PROFILE_ASSETS_BUCKET = "profile-assets";
export const AVATAR_MAX_SIZE_BYTES = 2 * 1024 * 1024;
export const AVATAR_SIGNED_URL_TTL_SECONDS = 120;

const AVATAR_MIME_CONFIG = {
  "image/jpeg": {
    extension: "jpg",
    label: "JPG",
  },
  "image/png": {
    extension: "png",
    label: "PNG",
  },
  "image/webp": {
    extension: "webp",
    label: "WebP",
  },
} as const;

export type AvatarMimeType = keyof typeof AVATAR_MIME_CONFIG;

export type AvatarValidationResult =
  | {
      ok: true;
      extension: (typeof AVATAR_MIME_CONFIG)[AvatarMimeType]["extension"];
      mimeType: AvatarMimeType;
      sizeBytes: number;
    }
  | {
      ok: false;
      error:
        | "avatar-empty"
        | "avatar-invalid-file"
        | "avatar-invalid-signature"
        | "avatar-too-large"
        | "avatar-unsupported-type";
    };

export function getAvatarMimeLabel(mimeType: string) {
  return AVATAR_MIME_CONFIG[mimeType as AvatarMimeType]?.label ?? mimeType;
}

export function formatAvatarFileSize(sizeBytes: number) {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }

  if (sizeBytes < 1024 * 1024) {
    return `${Math.round(sizeBytes / 1024)} KB`;
  }

  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function detectImageMimeType(bytes: Uint8Array): AvatarMimeType | null {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }

  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }

  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }

  return null;
}

export function validateAvatarUploadFile(
  file: File | null,
  bytes: Uint8Array,
): AvatarValidationResult {
  if (!file || file.size === 0) {
    return {
      ok: false,
      error: "avatar-empty",
    };
  }

  if (!(file.type in AVATAR_MIME_CONFIG)) {
    return {
      ok: false,
      error: "avatar-unsupported-type",
    };
  }

  if (file.size > AVATAR_MAX_SIZE_BYTES) {
    return {
      ok: false,
      error: "avatar-too-large",
    };
  }

  if (bytes.byteLength !== file.size) {
    return {
      ok: false,
      error: "avatar-invalid-file",
    };
  }

  const detectedMimeType = detectImageMimeType(bytes);

  if (!detectedMimeType || detectedMimeType !== file.type) {
    return {
      ok: false,
      error: "avatar-invalid-signature",
    };
  }

  return {
    ok: true,
    extension: AVATAR_MIME_CONFIG[detectedMimeType].extension,
    mimeType: detectedMimeType,
    sizeBytes: file.size,
  };
}
