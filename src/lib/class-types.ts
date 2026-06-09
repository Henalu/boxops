import { isSlug, toSlug } from "@/lib/slugs";
import {
  DEFAULT_CLASS_TYPE_ICON_KEY,
  isClassTypeIconKey,
} from "@/lib/class-type-icons";
import { parseOptionalCertificationId } from "@/lib/certifications";

export const CLASS_TYPE_CATEGORIES = [
  "class",
  "staffing",
  "event",
  "competition",
  "holiday",
  "other",
] as const;

export const CLASS_TYPE_STATUSES = ["active", "inactive"] as const;

export type ClassTypeCategory = (typeof CLASS_TYPE_CATEGORIES)[number];
export type ClassTypeStatus = (typeof CLASS_TYPE_STATUSES)[number];

export type ClassTypeFormValues = {
  name: string;
  category: ClassTypeCategory;
  certificationId: string | null;
  requiredCoaches: number;
  requiresCertification: boolean;
  color: string | null;
  iconKey: string;
  status: ClassTypeStatus;
};

export type ClassTypeValidationResult =
  | {
      ok: true;
      values: ClassTypeFormValues;
    }
  | {
      ok: false;
      error:
        | "missing-fields"
        | "invalid-category"
        | "invalid-certification"
        | "invalid-color"
        | "invalid-icon"
        | "invalid-required-coaches"
        | "invalid-slug"
        | "invalid-status";
    };

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/;

export function isClassTypeCategory(
  value: string,
): value is ClassTypeCategory {
  return CLASS_TYPE_CATEGORIES.includes(value as ClassTypeCategory);
}

export function isClassTypeStatus(value: string): value is ClassTypeStatus {
  return CLASS_TYPE_STATUSES.includes(value as ClassTypeStatus);
}

export function getClassTypeCategoryLabel(category: string) {
  const labels: Record<ClassTypeCategory, string> = {
    class: "Clase",
    competition: "Competición",
    event: "Evento",
    holiday: "Festivo",
    other: "Otra actividad",
    staffing: "Staffing",
  };

  return isClassTypeCategory(category) ? labels[category] : category;
}

export function getClassTypeStatusLabel(status: string) {
  return status === "inactive" ? "Inactivo" : "Activo";
}

export function toClassTypeSlug(value: string) {
  return toSlug(value, "actividad");
}

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

function parseRequiredCoaches(value: string) {
  const requiredCoaches = Number(value);

  if (
    !Number.isInteger(requiredCoaches) ||
    requiredCoaches < 0 ||
    requiredCoaches > 20
  ) {
    return null;
  }

  return requiredCoaches;
}

function parseColor(value: string) {
  if (!value) {
    return null;
  }

  const normalized = value.startsWith("#") ? value.toLowerCase() : `#${value}`;

  return HEX_COLOR_PATTERN.test(normalized) ? normalized : undefined;
}

export function validateClassTypeForm(
  formData: FormData,
): ClassTypeValidationResult {
  const name = getFormString(formData, "name");
  const rawCategory = getFormString(formData, "category") || "class";
  const rawRequiredCoaches = getFormString(formData, "requiredCoaches") || "1";
  const rawStatus = getFormString(formData, "status") || "active";
  const rawColor = getFormString(formData, "color");
  const rawIconKey =
    getFormString(formData, "iconKey") || DEFAULT_CLASS_TYPE_ICON_KEY;
  const certificationId = parseOptionalCertificationId(
    formData.get("certificationId"),
  );
  const requiredCoaches = parseRequiredCoaches(rawRequiredCoaches);
  const color = parseColor(rawColor);

  if (!name) {
    return {
      ok: false,
      error: "missing-fields",
    };
  }

  if (!isSlug(toClassTypeSlug(name))) {
    return {
      ok: false,
      error: "invalid-slug",
    };
  }

  if (!isClassTypeCategory(rawCategory)) {
    return {
      ok: false,
      error: "invalid-category",
    };
  }

  if (certificationId === undefined) {
    return {
      ok: false,
      error: "invalid-certification",
    };
  }

  if (requiredCoaches === null) {
    return {
      ok: false,
      error: "invalid-required-coaches",
    };
  }

  if (color === undefined) {
    return {
      ok: false,
      error: "invalid-color",
    };
  }

  if (!isClassTypeIconKey(rawIconKey)) {
    return {
      ok: false,
      error: "invalid-icon",
    };
  }

  if (!isClassTypeStatus(rawStatus)) {
    return {
      ok: false,
      error: "invalid-status",
    };
  }

  return {
    ok: true,
    values: {
      name,
      category: rawCategory,
      certificationId,
      requiredCoaches,
      requiresCertification: certificationId !== null,
      color,
      iconKey: rawIconKey,
      status: rawStatus,
    },
  };
}
