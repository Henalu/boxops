export const PROFILE_SIGNATURES_BUCKET = "profile-signatures";
export const SIGNATURE_MAX_SIZE_BYTES = 512 * 1024;
export const SIGNATURE_MIME_TYPE = "image/png";
export const SIGNATURE_SIGNED_URL_TTL_SECONDS = 120;

const SIGNATURE_DATA_URL_PREFIX = "data:image/png;base64,";
const SIGNATURE_MAX_BASE64_LENGTH =
  Math.ceil(SIGNATURE_MAX_SIZE_BYTES / 3) * 4;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export type SignatureValidationResult =
  | {
      ok: true;
      bytes: Uint8Array;
      height: number;
      mimeType: typeof SIGNATURE_MIME_TYPE;
      sizeBytes: number;
      width: number;
    }
  | {
      ok: false;
      error:
        | "signature-empty"
        | "signature-invalid-data"
        | "signature-invalid-dimensions"
        | "signature-invalid-signature"
        | "signature-too-large";
    };

export function formatSignatureFileSize(sizeBytes: number) {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }

  if (sizeBytes < 1024 * 1024) {
    return `${Math.round(sizeBytes / 1024)} KB`;
  }

  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function hasPngSignature(bytes: Uint8Array) {
  for (const [index, byte] of PNG_SIGNATURE.entries()) {
    if (bytes[index] !== byte) {
      return false;
    }
  }

  return true;
}

function readAscii(bytes: Uint8Array, offset: number, length: number) {
  let value = "";

  for (let index = offset; index < offset + length; index += 1) {
    value += String.fromCharCode(bytes[index]);
  }

  return value;
}

function hasValidPngChunkStructure(bytes: Uint8Array, view: DataView) {
  let offset = PNG_SIGNATURE.length;
  let hasIhdr = false;

  while (offset + 12 <= bytes.length) {
    const chunkLength = view.getUint32(offset);
    const chunkTypeOffset = offset + 4;
    const chunkDataOffset = offset + 8;
    const chunkCrcOffset = chunkDataOffset + chunkLength;
    const nextOffset = chunkCrcOffset + 4;

    if (chunkLength > bytes.length || nextOffset > bytes.length) {
      return false;
    }

    const chunkType = readAscii(bytes, chunkTypeOffset, 4);

    if (!/^[A-Za-z]{4}$/.test(chunkType)) {
      return false;
    }

    if (!hasIhdr) {
      if (chunkType !== "IHDR" || chunkLength !== 13) {
        return false;
      }

      hasIhdr = true;
    }

    if (chunkType === "IEND") {
      return chunkLength === 0 && nextOffset === bytes.length;
    }

    offset = nextOffset;
  }

  return false;
}

function parsePngDimensions(bytes: Uint8Array) {
  if (bytes.length < 33 || !hasPngSignature(bytes)) {
    return null;
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  if (
    view.getUint32(8) !== 13 ||
    bytes[12] !== 0x49 ||
    bytes[13] !== 0x48 ||
    bytes[14] !== 0x44 ||
    bytes[15] !== 0x52
  ) {
    return null;
  }

  if (!hasValidPngChunkStructure(bytes, view)) {
    return null;
  }

  return {
    height: view.getUint32(20),
    width: view.getUint32(16),
  };
}

function decodeBase64ToBytes(base64: string) {
  try {
    const binary = globalThis.atob(base64);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    return bytes;
  } catch {
    return null;
  }
}

export function validateSignatureDataUrl(
  value: string,
): SignatureValidationResult {
  const dataUrl = value.trim();

  if (!dataUrl) {
    return {
      ok: false,
      error: "signature-empty",
    };
  }

  if (!dataUrl.startsWith(SIGNATURE_DATA_URL_PREFIX)) {
    return {
      ok: false,
      error: "signature-invalid-data",
    };
  }

  const base64 = dataUrl.slice(SIGNATURE_DATA_URL_PREFIX.length);

  if (!base64 || !/^[A-Za-z0-9+/=]+$/.test(base64)) {
    return {
      ok: false,
      error: "signature-invalid-data",
    };
  }

  if (base64.length > SIGNATURE_MAX_BASE64_LENGTH) {
    return {
      ok: false,
      error: "signature-too-large",
    };
  }

  const bytes = decodeBase64ToBytes(base64);

  if (!bytes || bytes.byteLength === 0) {
    return {
      ok: false,
      error: "signature-invalid-data",
    };
  }

  if (bytes.byteLength > SIGNATURE_MAX_SIZE_BYTES) {
    return {
      ok: false,
      error: "signature-too-large",
    };
  }

  const dimensions = parsePngDimensions(bytes);

  if (!dimensions) {
    return {
      ok: false,
      error: "signature-invalid-signature",
    };
  }

  if (
    dimensions.width < 240 ||
    dimensions.width > 2000 ||
    dimensions.height < 100 ||
    dimensions.height > 1000
  ) {
    return {
      ok: false,
      error: "signature-invalid-dimensions",
    };
  }

  return {
    ok: true,
    bytes,
    height: dimensions.height,
    mimeType: SIGNATURE_MIME_TYPE,
    sizeBytes: bytes.byteLength,
    width: dimensions.width,
  };
}
