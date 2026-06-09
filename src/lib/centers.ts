import { isSlug, toSlug } from "@/lib/slugs";

export const CENTER_STATUSES = ["active", "inactive"] as const;

export type CenterStatus = (typeof CENTER_STATUSES)[number];

export type CenterFormValues = {
  name: string;
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
  return toSlug(value, "centro");
}

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

export function validateCenterForm(formData: FormData): CenterValidationResult {
  const name = getFormString(formData, "name");
  const timezone = getFormString(formData, "timezone");
  const rawStatus = getFormString(formData, "status") || "active";

  if (!name || !timezone) {
    return {
      ok: false,
      error: "missing-fields",
    };
  }

  if (!isSlug(toCenterSlug(name))) {
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
      timezone,
      status: rawStatus,
    },
  };
}
