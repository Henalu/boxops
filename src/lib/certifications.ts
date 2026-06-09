export const CERTIFICATION_STATUSES = ["active", "inactive"] as const;

export type CertificationStatus = (typeof CERTIFICATION_STATUSES)[number];

export type CertificationFormValues = {
  description: string | null;
  status: CertificationStatus;
  title: string;
};

export type CertificationValidationResult =
  | {
      ok: true;
      values: CertificationFormValues;
    }
  | {
      ok: false;
      error:
        | "invalid-certification"
        | "invalid-status"
        | "missing-fields";
    };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isCertificationStatus(
  value: string,
): value is CertificationStatus {
  return CERTIFICATION_STATUSES.includes(value as CertificationStatus);
}

export function getCertificationStatusLabel(status: string) {
  return status === "inactive" ? "Inactiva" : "Activa";
}

export function isUuid(value: string) {
  return UUID_PATTERN.test(value);
}

export function parseOptionalCertificationId(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();

  if (!normalized || normalized === "none") {
    return null;
  }

  return isUuid(normalized) ? normalized : undefined;
}

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

export function validateCertificationForm(
  formData: FormData,
): CertificationValidationResult {
  const title = getFormString(formData, "title");
  const description = getFormString(formData, "description");
  const rawStatus = getFormString(formData, "status") || "active";

  if (!title) {
    return {
      ok: false,
      error: "missing-fields",
    };
  }

  if (!isCertificationStatus(rawStatus)) {
    return {
      ok: false,
      error: "invalid-status",
    };
  }

  return {
    ok: true,
    values: {
      description: description || null,
      status: rawStatus,
      title,
    },
  };
}
