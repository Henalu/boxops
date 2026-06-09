import Link from "next/link";
import { redirect } from "next/navigation";
import type React from "react";
import type { LucideIcon } from "lucide-react";
import {
  Award,
  CheckCircle2,
  CircleOff,
  Folder,
  Info,
  ListChecks,
  ListFilter,
  Plus,
  Save,
  Search,
} from "lucide-react";

import {
  createClassType,
  setClassTypeStatus,
  updateClassType,
} from "./actions";
import { ClassTypeIcon } from "@/components/features/class-type-icon";
import { ClassTypeIconSelect } from "@/components/features/class-type-icon-select";
import { ColorPaletteField } from "@/components/features/color-palette-field";
import {
  CollapsibleActionPanel,
  InlineEditDetails,
} from "@/components/features/management-ui";
import {
  EmptyState,
  PageHeader,
  SectionHeader,
  StatusBadge,
} from "@/components/features/operations-ui";
import { OrganizationResolutionState } from "@/components/features/organization-resolution-state";
import { TransientFeedbackBanner } from "@/components/features/transient-feedback-banner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getLoginPath } from "@/lib/auth/redirects";
import {
  canManageOperationalData,
  getApplicationRoleLabel,
} from "@/lib/auth/permissions";
import {
  getActiveMemberships,
  getAuthenticatedUser,
  resolveActiveOrganization,
} from "@/lib/auth/tenant";
import {
  CLASS_TYPE_CATEGORIES,
  CLASS_TYPE_STATUSES,
  getClassTypeCategoryLabel,
  getClassTypeStatusLabel,
  type ClassTypeCategory,
  type ClassTypeStatus,
} from "@/lib/class-types";
import {
  getClassTypeIconLabel,
} from "@/lib/class-type-icons";
import { getClassTypesPath } from "@/lib/navigation/app-paths";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import type { Tables } from "@/types/supabase";

export const dynamic = "force-dynamic";

type ClassTypesPageProps = {
  searchParams: Promise<{
    certification?: string | string[];
    class_type_category?: string | string[];
    class_type_status?: string | string[];
    error?: string | string[];
    organizationId?: string | string[];
    q?: string | string[];
    required_coaches?: string | string[];
    status?: string | string[];
  }>;
};

type ClassTypeRow = Pick<
  Tables<"class_types">,
  | "category"
  | "certification_id"
  | "color"
  | "icon_key"
  | "id"
  | "name"
  | "required_coaches"
  | "requires_certification"
  | "slug"
  | "status"
  | "updated_at"
>;

type CertificationRow = {
  id: string;
  status: string;
  title: string;
};

type ClassTypeCertificationFilter = "all" | "not_required" | "required";

type ClassTypeRequiredCoachesFilter = "all" | "0" | "1" | "2" | "3_plus";

type ClassTypeFilterValues = {
  category: ClassTypeCategory | "all";
  certification: ClassTypeCertificationFilter;
  q: string;
  requiredCoaches: ClassTypeRequiredCoachesFilter;
  status: ClassTypeStatus | "all";
};

const REQUIRED_COACHES_FILTERS: Array<{
  label: string;
  value: ClassTypeRequiredCoachesFilter;
}> = [
  { label: "Todos", value: "all" },
  { label: "Sin requisito", value: "0" },
  { label: "1 entrenador", value: "1" },
  { label: "2 entrenadores", value: "2" },
  { label: "3 o más", value: "3_plus" },
];

const successMessages: Record<string, string> = {
  activated: "Tipo activado.",
  created: "Tipo creado.",
  deactivated: "Tipo desactivado.",
  updated: "Tipo actualizado.",
};

const successDescriptions: Record<string, string> = {
  activated: "Los horarios y plantillas volveran a leer este tipo como activo.",
  created: "Ya puedes usarlo al crear bloques o plantillas.",
  deactivated: "No se elimina ningún bloque histórico vinculado.",
  updated:
    "Todos los bloques de plantilla y los horarios actuales o futuros vinculados se sincronizan sin tocar fechas pasadas.",
};

const errorMessages: Record<string, string> = {
  "class-type-required": "No se ha recibido el tipo a actualizar.",
  "duplicate-slug":
    "No se ha podido crear un identificador interno libre. Prueba con otro nombre.",
  forbidden: "Tu rol no permite gestionar tipos de actividad.",
  "invalid-certification": "La certificación seleccionada no está disponible.",
  "invalid-category": "La categoría seleccionada no es válida.",
  "invalid-color": "Usa un color hexadecimal, por ejemplo #2563eb.",
  "invalid-icon": "El icono seleccionado no está disponible.",
  "invalid-required-coaches":
    "Los entrenadores necesarios deben ser un número entero entre 0 y 20.",
  "invalid-slug":
    "No se ha podido preparar el identificador interno. Prueba con otro nombre.",
  "invalid-status": "El estado seleccionado no es válido.",
  "missing-fields": "Completa el nombre.",
  no_active_memberships: "No hay accesos activos para este usuario.",
  organization_not_found: "La organización solicitada no está disponible.",
  organization_required:
    "Elige una organización antes de gestionar tipos de actividad.",
  "save-failed": "No se han podido guardar los cambios.",
};

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

async function getClassTypes(organizationId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("class_types")
    .select(
      "id, name, slug, category, certification_id, required_coaches, requires_certification, status, color, icon_key, updated_at",
    )
    .eq("organization_id", organizationId)
    .order("status", { ascending: true })
    .order("category", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`Could not load class types: ${error.message}`);
  }

  return data satisfies ClassTypeRow[];
}

async function getCertifications(organizationId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("certifications")
    .select("id, title, status")
    .eq("organization_id", organizationId)
    .order("status", { ascending: true })
    .order("title", { ascending: true });

  if (error) {
    throw new Error(`Could not load certifications: ${error.message}`);
  }

  return (data ?? []) satisfies CertificationRow[];
}

function formatUpdatedAt(value: string, timezone: string) {
  try {
    return new Intl.DateTimeFormat("es-ES", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: timezone,
    }).format(new Date(value));
  } catch {
    return "Fecha no disponible";
  }
}

function getSafeColor(value: string | null) {
  return value && /^#[0-9a-f]{6}$/i.test(value) ? value : null;
}

function getColorAccentStyle(
  value: string | null,
): React.CSSProperties | undefined {
  const safeColor = getSafeColor(value);

  if (!safeColor) {
    return undefined;
  }

  return {
    backgroundColor: `${safeColor}14`,
    borderColor: `${safeColor}33`,
    color: safeColor,
  };
}

function normalizeSearch(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("es-ES")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function parseClassTypeCategoryFilter(
  value?: string,
): ClassTypeFilterValues["category"] {
  if (CLASS_TYPE_CATEGORIES.includes(value as ClassTypeCategory)) {
    return value as ClassTypeCategory;
  }

  return "all";
}

function parseClassTypeStatusFilter(
  value?: string,
): ClassTypeFilterValues["status"] {
  if (CLASS_TYPE_STATUSES.includes(value as ClassTypeStatus)) {
    return value as ClassTypeStatus;
  }

  return "all";
}

function parseCertificationFilter(
  value?: string,
): ClassTypeCertificationFilter {
  return value === "required" || value === "not_required" ? value : "all";
}

function parseRequiredCoachesFilter(
  value?: string,
): ClassTypeRequiredCoachesFilter {
  return REQUIRED_COACHES_FILTERS.some((filter) => filter.value === value)
    ? (value as ClassTypeRequiredCoachesFilter)
    : "all";
}

function getClassTypeFilters(
  params: Awaited<ClassTypesPageProps["searchParams"]>,
): ClassTypeFilterValues {
  return {
    category: parseClassTypeCategoryFilter(getParam(params.class_type_category)),
    certification: parseCertificationFilter(getParam(params.certification)),
    q: getParam(params.q)?.trim() ?? "",
    requiredCoaches: parseRequiredCoachesFilter(
      getParam(params.required_coaches),
    ),
    status: parseClassTypeStatusFilter(getParam(params.class_type_status)),
  };
}

function applyClassTypeFilters(
  classTypes: ClassTypeRow[],
  filters: ClassTypeFilterValues,
) {
  const query = normalizeSearch(filters.q);

  return classTypes.filter((classType) => {
    if (filters.category !== "all" && classType.category !== filters.category) {
      return false;
    }

    if (filters.status !== "all" && classType.status !== filters.status) {
      return false;
    }

    if (
      filters.certification === "required" &&
      !classType.requires_certification
    ) {
      return false;
    }

    if (
      filters.certification === "not_required" &&
      classType.requires_certification
    ) {
      return false;
    }

    if (
      filters.requiredCoaches === "0" &&
      classType.required_coaches !== 0
    ) {
      return false;
    }

    if (
      filters.requiredCoaches === "1" &&
      classType.required_coaches !== 1
    ) {
      return false;
    }

    if (
      filters.requiredCoaches === "2" &&
      classType.required_coaches !== 2
    ) {
      return false;
    }

    if (
      filters.requiredCoaches === "3_plus" &&
      classType.required_coaches < 3
    ) {
      return false;
    }

    if (!query) {
      return true;
    }

    return normalizeSearch(`${classType.name} ${classType.slug}`).includes(
      query,
    );
  });
}

function getActiveFilterCount(filters: ClassTypeFilterValues) {
  return [
    filters.q !== "",
    filters.category !== "all",
    filters.status !== "all",
    filters.certification !== "all",
    filters.requiredCoaches !== "all",
  ].filter(Boolean).length;
}

function selectClassName(className = "") {
  return cn(
    "h-11 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:h-9",
    className,
  );
}

function ClassTypeCategorySelect({ defaultValue }: { defaultValue?: string }) {
  return (
    <select
      className={selectClassName()}
      defaultValue={defaultValue ?? "class"}
      name="category"
    >
      {CLASS_TYPE_CATEGORIES.map((category) => (
        <option key={category} value={category}>
          {getClassTypeCategoryLabel(category)}
        </option>
      ))}
    </select>
  );
}

function ClassTypeStatusSelect({ defaultValue }: { defaultValue?: string }) {
  return (
    <select
      className={selectClassName()}
      defaultValue={defaultValue ?? "active"}
      name="status"
    >
      {CLASS_TYPE_STATUSES.map((status) => (
        <option key={status} value={status}>
          {getClassTypeStatusLabel(status)}
        </option>
      ))}
    </select>
  );
}

function ClassTypeStatusBadge({ status }: { status: string }) {
  return (
    <StatusBadge tone={status === "active" ? "success" : "neutral"}>
      {getClassTypeStatusLabel(status)}
    </StatusBadge>
  );
}

function ColorSwatch({ color }: { color: string | null }) {
  const safeColor = getSafeColor(color);

  return (
    <span
      aria-hidden="true"
      className="size-4 shrink-0 rounded-full border border-border"
      style={safeColor ? { backgroundColor: safeColor } : undefined}
    />
  );
}

function getCertificationTitle({
  certificationId,
  certifications,
}: {
  certificationId: string | null;
  certifications: CertificationRow[];
}) {
  if (!certificationId) {
    return "Ninguna";
  }

  return (
    certifications.find((certification) => certification.id === certificationId)
      ?.title ?? "Certificación no disponible"
  );
}

function ClassTypeCertificationBadge({
  certificationId,
  certifications,
  required,
}: {
  certificationId: string | null;
  certifications: CertificationRow[];
  required: boolean;
}) {
  return (
    <StatusBadge tone={required ? "warning" : "neutral"}>
      {required
        ? getCertificationTitle({ certificationId, certifications })
        : "Ninguna"}
    </StatusBadge>
  );
}

function ClassTypeCertificationSelect({
  certifications,
  defaultValue,
}: {
  certifications: CertificationRow[];
  defaultValue?: string | null;
}) {
  const activeCertifications = certifications.filter(
    (certification) => certification.status === "active",
  );
  const selectedInactiveCertification = certifications.find(
    (certification) =>
      certification.id === defaultValue && certification.status !== "active",
  );

  return (
    <select
      className={selectClassName()}
      defaultValue={defaultValue ?? "none"}
      name="certificationId"
    >
      <option value="none">Ninguna</option>
      {selectedInactiveCertification ? (
        <option value={selectedInactiveCertification.id}>
          {selectedInactiveCertification.title} (inactiva)
        </option>
      ) : null}
      {activeCertifications.map((certification) => (
        <option key={certification.id} value={certification.id}>
          {certification.title}
        </option>
      ))}
    </select>
  );
}

function ClassTypeFormField({
  children,
  className,
  label,
}: {
  children: React.ReactNode;
  className?: string;
  label: string;
}) {
  return (
    <label className={cn("grid min-w-0 gap-2", className)}>
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}

function ClassTypeRequiredCoachesInput({
  defaultValue = 1,
}: {
  defaultValue?: number;
}) {
  return (
    <Input
      defaultValue={defaultValue}
      max="20"
      min="0"
      name="requiredCoaches"
      required
      type="number"
    />
  );
}

function ClassTypeSummaryCard({
  description,
  icon: Icon,
  label,
  tone = "neutral",
  value,
}: {
  description: string;
  icon: LucideIcon;
  label: string;
  tone?: "info" | "neutral" | "success" | "warning";
  value: React.ReactNode;
}) {
  const iconClassName =
    tone === "success"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200/70"
      : tone === "warning"
        ? "bg-amber-50 text-amber-700 ring-amber-200/70"
        : tone === "info"
          ? "bg-blue-50 text-blue-700 ring-blue-200/70"
          : "bg-primary/10 text-primary ring-primary/10";

  return (
    <Card size="sm">
      <CardContent className="space-y-3 px-5 py-1">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <span
            className={cn(
              "flex size-11 shrink-0 items-center justify-center rounded-xl ring-1",
              iconClassName,
            )}
          >
            <Icon aria-hidden="true" className="size-5" />
          </span>
        </div>
        <p className="break-words text-2xl font-semibold leading-tight tracking-tight md:text-3xl">
          {value}
        </p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

function ClassTypeSummary({ classTypes }: { classTypes: ClassTypeRow[] }) {
  const activeClassTypes = classTypes.filter(
    (classType) => classType.status === "active",
  );
  const certifiedClassTypes = classTypes.filter(
    (classType) => classType.requires_certification,
  );
  const categoryCount = new Set(
    classTypes.map((classType) => classType.category),
  ).size;

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <ClassTypeSummaryCard
        description="Tipos configurados"
        icon={ListChecks}
        label="Total de tipos"
        value={classTypes.length}
      />
      <ClassTypeSummaryCard
        description={
          classTypes.length > 0
            ? `${Math.round((activeClassTypes.length / classTypes.length) * 100)}% del total`
            : "Sin catálogo todavía"
        }
        icon={CheckCircle2}
        label="Activos"
        tone="success"
        value={activeClassTypes.length}
      />
      <ClassTypeSummaryCard
        description={
          classTypes.length > 0
            ? `${Math.round((certifiedClassTypes.length / classTypes.length) * 100)}% del total`
            : "Sin requisitos especiales"
        }
        icon={Award}
        label="Requieren certificación"
        tone="warning"
        value={certifiedClassTypes.length}
      />
      <ClassTypeSummaryCard
        description={
          categoryCount === 1 ? "Categoría usada" : "Categorías usadas"
        }
        icon={Folder}
        label="Categorías"
        tone="info"
        value={categoryCount}
      />
    </div>
  );
}

function ClassTypeFilterControls({
  activeFilterCount,
  filters,
  organizationId,
  resetPath,
}: {
  activeFilterCount: number;
  filters: ClassTypeFilterValues;
  organizationId: string;
  resetPath: string;
}) {
  return (
    <Card>
      <CardContent className="py-4">
        <form
          action="/app/class-types"
          className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(14rem,1fr)_repeat(4,minmax(8rem,0.75fr))_auto_auto] xl:items-end"
          method="get"
        >
          <input name="organizationId" type="hidden" value={organizationId} />

          <label className="grid gap-1.5 md:col-span-2 xl:col-span-1">
            <span className="text-xs font-medium text-muted-foreground">
              Buscar
            </span>
            <span className="relative">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                className="pl-9"
                defaultValue={filters.q}
                name="q"
                placeholder="Nombre"
                type="search"
              />
            </span>
          </label>

          <label className="grid gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              Categoría
            </span>
            <select
              className={selectClassName()}
              defaultValue={filters.category}
              name="class_type_category"
            >
              <option value="all">Todas</option>
              {CLASS_TYPE_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {getClassTypeCategoryLabel(category)}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              Estado
            </span>
            <select
              className={selectClassName()}
              defaultValue={filters.status}
              name="class_type_status"
            >
              <option value="all">Todos</option>
              {CLASS_TYPE_STATUSES.map((statusOption) => (
                <option key={statusOption} value={statusOption}>
                  {getClassTypeStatusLabel(statusOption)}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              Certificación
            </span>
            <select
              className={selectClassName()}
              defaultValue={filters.certification}
              name="certification"
            >
              <option value="all">Todas</option>
              <option value="required">Requiere</option>
              <option value="not_required">No requiere</option>
            </select>
          </label>

          <label className="grid gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              Entrenadores necesarios
            </span>
            <select
              className={selectClassName()}
              defaultValue={filters.requiredCoaches}
              name="required_coaches"
            >
              {REQUIRED_COACHES_FILTERS.map((filter) => (
                <option key={filter.value} value={filter.value}>
                  {filter.label}
                </option>
              ))}
            </select>
          </label>

          <Button className="w-full xl:w-auto" type="submit">
            <ListFilter aria-hidden="true" />
            Aplicar
          </Button>

          {activeFilterCount > 0 ? (
            <Button asChild className="w-full xl:w-auto" variant="outline">
              <Link href={resetPath}>Limpiar</Link>
            </Button>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}

function ClassTypeCreateForm({
  certifications,
  organizationId,
}: {
  certifications: CertificationRow[];
  organizationId: string;
}) {
  return (
    <form action={createClassType} className="grid gap-4">
      <input name="organizationId" type="hidden" value={organizationId} />
      <input name="status" type="hidden" value="active" />

      <div className="grid gap-4 lg:grid-cols-[minmax(16rem,1.35fr)_minmax(12rem,0.72fr)_minmax(8rem,0.42fr)]">
        <ClassTypeFormField label="Nombre">
          <Input name="name" placeholder="Open Box" required />
        </ClassTypeFormField>

        <ClassTypeFormField label="Categoría">
          <ClassTypeCategorySelect />
        </ClassTypeFormField>

        <ClassTypeFormField label="Entrenadores">
          <ClassTypeRequiredCoachesInput />
        </ClassTypeFormField>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ClassTypeIconSelect />

        <ClassTypeFormField label="Certificación">
          <ClassTypeCertificationSelect certifications={certifications} />
        </ClassTypeFormField>
      </div>

      <ColorPaletteField
        label="Color"
        layout="compact"
        name="color"
        placeholder="#2563eb"
      />

      <div className="flex flex-wrap gap-2">
        <Button className="w-full sm:w-auto" type="submit">
          <Plus aria-hidden="true" />
          Crear tipo
        </Button>
      </div>
    </form>
  );
}

function ClassTypeIdentity({ classType }: { classType: ClassTypeRow }) {
  return (
    <div className="flex min-w-0 items-start gap-4">
      <span
        className="flex size-12 shrink-0 items-center justify-center rounded-xl border bg-primary/10 text-primary ring-1 ring-primary/10"
        style={getColorAccentStyle(classType.color)}
        title={getClassTypeIconLabel(classType.icon_key)}
      >
        <ClassTypeIcon className="size-5" iconKey={classType.icon_key} />
      </span>

      <div className="min-w-0 space-y-2">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold tracking-tight md:text-lg">
            {classType.name}
          </h3>
        </div>
        <div className="xl:hidden">
          <ClassTypeStatusBadge status={classType.status} />
        </div>
      </div>
    </div>
  );
}

function ClassTypeMetaField({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <div className="min-w-0 space-y-1">
      <dt className="text-xs font-medium text-muted-foreground xl:sr-only">
        {label}
      </dt>
      <dd className="truncate text-sm font-medium">{children}</dd>
    </div>
  );
}

function ClassTypeColorPill({ classType }: { classType: ClassTypeRow }) {
  return (
    <span className="inline-flex max-w-full items-center gap-2 rounded-full border border-border bg-muted/35 px-2.5 py-1 text-xs font-medium">
      <ColorSwatch color={classType.color} />
      <span className="truncate font-mono">
        {getSafeColor(classType.color) ?? "Sin color"}
      </span>
    </span>
  );
}

function ClassTypeCardSummary({
  classType,
  certifications,
  timezone,
}: {
  classType: ClassTypeRow;
  certifications: CertificationRow[];
  timezone: string;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(14rem,1.35fr)_minmax(7rem,0.7fr)_minmax(7rem,0.65fr)_minmax(8rem,0.7fr)_minmax(8rem,0.85fr)_minmax(8rem,0.85fr)_auto] xl:items-center">
      <ClassTypeIdentity classType={classType} />
      <dl className="contents">
        <ClassTypeMetaField label="Categoría">
          {getClassTypeCategoryLabel(classType.category)}
        </ClassTypeMetaField>
        <ClassTypeMetaField label="Entrenadores">
          {classType.required_coaches}
        </ClassTypeMetaField>
        <ClassTypeMetaField label="Certificación">
          <ClassTypeCertificationBadge
            certificationId={classType.certification_id}
            certifications={certifications}
            required={classType.requires_certification}
          />
        </ClassTypeMetaField>
        <ClassTypeMetaField label="Color">
          <ClassTypeColorPill classType={classType} />
        </ClassTypeMetaField>
        <ClassTypeMetaField label="Actualizado">
          {formatUpdatedAt(classType.updated_at, timezone)}
        </ClassTypeMetaField>
      </dl>
      <div className="hidden justify-end xl:flex">
        <ClassTypeStatusBadge status={classType.status} />
      </div>
    </div>
  );
}

function ClassTypeListHeader() {
  return (
    <div className="hidden rounded-xl bg-card px-5 py-3 text-xs font-medium text-muted-foreground ring-1 ring-foreground/10 xl:grid xl:grid-cols-[minmax(14rem,1.35fr)_minmax(7rem,0.7fr)_minmax(7rem,0.65fr)_minmax(8rem,0.7fr)_minmax(8rem,0.85fr)_minmax(8rem,0.85fr)_auto] xl:items-center">
      <span>Tipo de actividad</span>
      <span>Categoría</span>
      <span>Entrenadores</span>
      <span>Certificación</span>
      <span>Color</span>
      <span>Actualizado</span>
      <span className="text-right">Estado</span>
    </div>
  );
}

function ClassTypeReadOnlyCard({
  classType,
  certifications,
  timezone,
}: {
  classType: ClassTypeRow;
  certifications: CertificationRow[];
  timezone: string;
}) {
  return (
    <Card size="sm">
      <CardContent className="px-5 py-2">
        <ClassTypeCardSummary
          certifications={certifications}
          classType={classType}
          timezone={timezone}
        />
      </CardContent>
    </Card>
  );
}

function ClassTypeAdminCard({
  classType,
  certifications,
  organizationId,
  timezone,
}: {
  classType: ClassTypeRow;
  certifications: CertificationRow[];
  organizationId: string;
  timezone: string;
}) {
  const nextStatus: ClassTypeStatus =
    classType.status === "active" ? "inactive" : "active";

  return (
    <Card size="sm">
      <CardContent className="space-y-4 px-5 py-2">
        <ClassTypeCardSummary
          certifications={certifications}
          classType={classType}
          timezone={timezone}
        />

        <div className="border-t border-border pt-4">
          <InlineEditDetails label="Gestionar">
            <div className="space-y-4">
              <form action={updateClassType} className="grid gap-4">
                <input
                  name="organizationId"
                  type="hidden"
                  value={organizationId}
                />
                <input name="classTypeId" type="hidden" value={classType.id} />

                <div className="grid gap-4 lg:grid-cols-[minmax(16rem,1.35fr)_minmax(12rem,0.72fr)_minmax(8rem,0.42fr)]">
                  <ClassTypeFormField label="Nombre">
                    <Input name="name" required defaultValue={classType.name} />
                  </ClassTypeFormField>

                  <ClassTypeFormField label="Categoría">
                    <ClassTypeCategorySelect defaultValue={classType.category} />
                  </ClassTypeFormField>

                  <ClassTypeFormField label="Entrenadores">
                    <ClassTypeRequiredCoachesInput
                      defaultValue={classType.required_coaches}
                    />
                  </ClassTypeFormField>
                </div>

                <div className="grid gap-4 lg:grid-cols-3">
                  <ClassTypeIconSelect defaultValue={classType.icon_key} />

                  <ClassTypeFormField label="Certificación">
                    <ClassTypeCertificationSelect
                      certifications={certifications}
                      defaultValue={classType.certification_id}
                    />
                  </ClassTypeFormField>

                  <ClassTypeFormField label="Estado">
                    <ClassTypeStatusSelect defaultValue={classType.status} />
                  </ClassTypeFormField>
                </div>

                <ColorPaletteField
                  defaultValue={classType.color}
                  label="Color"
                  layout="compact"
                  name="color"
                  placeholder="#2563eb"
                />

                <div className="flex flex-wrap gap-2">
                  <Button type="submit">
                    <Save aria-hidden="true" />
                    Guardar cambios
                  </Button>
                </div>
              </form>

              <form action={setClassTypeStatus}>
                <input
                  name="organizationId"
                  type="hidden"
                  value={organizationId}
                />
                <input name="classTypeId" type="hidden" value={classType.id} />
                <input name="nextStatus" type="hidden" value={nextStatus} />
                <Button
                  type="submit"
                  variant={
                    nextStatus === "inactive" ? "destructive" : "outline"
                  }
                >
                  <CircleOff aria-hidden="true" />
                  {nextStatus === "inactive"
                    ? "Desactivar tipo"
                    : "Activar tipo"}
                </Button>
              </form>
            </div>
          </InlineEditDetails>
        </div>
      </CardContent>
    </Card>
  );
}

function ClassTypesInfoCard() {
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 py-5 sm:flex-row sm:items-start">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/10">
          <Info aria-hidden="true" className="size-5" />
        </span>
        <div className="max-w-3xl space-y-1">
          <h2 className="font-semibold tracking-tight">
            ¿Qué es un tipo de actividad?
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">
            Es la unidad básica que representa una clase, sesión o bloque
            operativo. Define cómo se planifica, qué recursos requiere y cómo se
            lee después en horarios, plantillas y cobertura.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export default async function ClassTypesPage({
  searchParams,
}: ClassTypesPageProps) {
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect(getLoginPath("/app/class-types"));
  }

  const params = await searchParams;
  const organizationId = getParam(params.organizationId);
  const status = getParam(params.status);
  const error = getParam(params.error);
  const memberships = await getActiveMemberships(user.id);
  const resolution = resolveActiveOrganization(memberships, organizationId);

  if (!resolution.ok) {
    return (
      <div className="space-y-6">
        <PageHeader
          badge="Tipos de actividad"
          title="Tipos de actividad"
          description="Define las clases y actividades que se usaran en horarios y plantillas."
        />
        <OrganizationResolutionState
          basePath="/app/class-types"
          resolution={resolution}
        />
      </div>
    );
  }

  const [classTypes, certifications] = await Promise.all([
    getClassTypes(resolution.organization.id),
    getCertifications(resolution.organization.id),
  ]);
  const canManageClassTypes = canManageOperationalData(
    resolution.membership.role,
  );
  const classTypeFilters = getClassTypeFilters(params);
  const filteredClassTypes = applyClassTypeFilters(
    classTypes,
    classTypeFilters,
  );
  const activeFilterCount = getActiveFilterCount(classTypeFilters);
  const filterResetPath = getClassTypesPath({
    organizationId: resolution.organization.id,
  });
  const roleLabel = getApplicationRoleLabel(resolution.membership.role);

  return (
    <div className="space-y-6">
      <PageHeader
        badge="Tipos de actividad"
        description="Mantiene el catálogo operativo que alimenta horarios, plantillas y cobertura."
        meta={
          <>
            <Badge variant="secondary">{resolution.organization.name}</Badge>
            <Badge variant="outline">{roleLabel}</Badge>
          </>
        }
        title="Tipos de actividad"
      />

      {status && successMessages[status] ? (
        <TransientFeedbackBanner
          description={successDescriptions[status]}
          title={successMessages[status]}
          tone="success"
        />
      ) : null}

      {error && errorMessages[error] ? (
        <TransientFeedbackBanner
          description={errorMessages[error]}
          title="No se han guardado los cambios"
          tone="error"
        />
      ) : null}

      <ClassTypeSummary classTypes={classTypes} />

      {canManageClassTypes ? (
        <CollapsibleActionPanel
          actionLabel="Crear"
          description="Añade clases, recepción u otras actividades que luego se programan como bloques."
          featured
          icon={Plus}
          title="Crear tipo de actividad"
        >
          <ClassTypeCreateForm
            certifications={certifications}
            organizationId={resolution.organization.id}
          />
        </CollapsibleActionPanel>
      ) : (
        <Alert>
          <AlertTitle>Modo lectura</AlertTitle>
          <AlertDescription>
            Tu rol puede consultar el catálogo, pero no crear ni editar tipos
            de actividad.
          </AlertDescription>
        </Alert>
      )}

      <section className="space-y-4">
        {classTypes.length > 0 ? (
          <ClassTypeFilterControls
            activeFilterCount={activeFilterCount}
            filters={classTypeFilters}
            organizationId={resolution.organization.id}
            resetPath={filterResetPath}
          />
        ) : null}

        <SectionHeader
          action={
            <Badge variant="outline">
              {activeFilterCount > 0
                ? `${filteredClassTypes.length} de ${classTypes.length}`
                : `${classTypes.length} tipos`}
            </Badge>
          }
          description="Nombre, categoría, entrenadores necesarios, certificación, color y estado."
          title="Catálogo"
        />

        {classTypes.length === 0 ? (
          <EmptyState
            description={
              canManageClassTypes
                ? "Crea el primer tipo para preparar horarios y plantillas."
                : "Un rol operativo debe crear el catálogo antes de que aparezca aquí."
            }
            title="No hay tipos de actividad todavía"
          />
        ) : filteredClassTypes.length === 0 ? (
          <EmptyState
            action={
              <Button asChild variant="outline">
                <Link href={filterResetPath}>Limpiar filtros</Link>
              </Button>
            }
            description="No hay tipos que coincidan con la búsqueda o los filtros actuales."
            title="Sin resultados"
          />
        ) : (
          <div className="grid gap-2">
            <ClassTypeListHeader />
            {filteredClassTypes.map((classType) =>
              canManageClassTypes ? (
                <ClassTypeAdminCard
                  certifications={certifications}
                  classType={classType}
                  key={classType.id}
                  organizationId={resolution.organization.id}
                  timezone={resolution.organization.timezone}
                />
              ) : (
                <ClassTypeReadOnlyCard
                  certifications={certifications}
                  classType={classType}
                  key={classType.id}
                  timezone={resolution.organization.timezone}
                />
              ),
            )}
          </div>
        )}
      </section>

      <ClassTypesInfoCard />
    </div>
  );
}
