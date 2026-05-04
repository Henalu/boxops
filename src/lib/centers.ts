export const CENTER_STATUSES = ["active", "inactive"] as const;

export type CenterStatus = (typeof CENTER_STATUSES)[number];

export type CenterFormValues = {
  name: string;
  slug: string;
  timezone: string;
  status: CenterStatus;
};

export type CenterValidationResult =
  | {
      ok: true;
      values: CenterFormValues;
    }
  | {
      ok: false;
      error: "missing-fields" | "invalid-slug" | "invalid-status";
    };

export function isCenterStatus(value: string): value is CenterStatus {
  return CENTER_STATUSES.includes(value as CenterStatus);
}

export function getCenterStatusLabel(status: string) {
  return status === "inactive" ? "Inactivo" : "Activo";
}

export function toCenterSlug(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

export function validateCenterForm(formData: FormData): CenterValidationResult {
  const name = getFormString(formData, "name");
  const rawSlug = getFormString(formData, "slug");
  const timezone = getFormString(formData, "timezone");
  const rawStatus = getFormString(formData, "status") || "active";
  const slug = rawSlug ? toCenterSlug(rawSlug) : toCenterSlug(name);

  if (!name || !slug || !timezone) {
    return {
      ok: false,
      error: "missing-fields",
    };
  }

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return {
      ok: false,
      error: "invalid-slug",
    };
  }

  if (!isCenterStatus(rawStatus)) {
    return {
      ok: false,
      error: "invalid-status",
    };
  }

  return {
    ok: true,
    values: {
      name,
      slug,
      timezone,
      status: rawStatus,
    },
  };
}
