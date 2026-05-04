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
  slug: string;
  category: ClassTypeCategory;
  requiredCoaches: number;
  requiresCertification: boolean;
  color: string | null;
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
        | "invalid-color"
        | "invalid-required-coaches"
        | "invalid-slug"
        | "invalid-status";
    };

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
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
    competition: "Competicion",
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
  const rawSlug = getFormString(formData, "slug");
  const rawCategory = getFormString(formData, "category") || "class";
  const rawRequiredCoaches = getFormString(formData, "requiredCoaches") || "1";
  const rawStatus = getFormString(formData, "status") || "active";
  const rawColor = getFormString(formData, "color");
  const requiresCertification = formData.get("requiresCertification") === "on";
  const slug = rawSlug ? toClassTypeSlug(rawSlug) : toClassTypeSlug(name);
  const requiredCoaches = parseRequiredCoaches(rawRequiredCoaches);
  const color = parseColor(rawColor);

  if (!name || !slug) {
    return {
      ok: false,
      error: "missing-fields",
    };
  }

  if (!SLUG_PATTERN.test(slug)) {
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
      slug,
      category: rawCategory,
      requiredCoaches,
      requiresCertification,
      color,
      status: rawStatus,
    },
  };
}
