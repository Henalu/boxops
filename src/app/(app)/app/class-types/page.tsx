import { redirect } from "next/navigation";
import { CircleOff, Plus, Save } from "lucide-react";

import {
  createClassType,
  setClassTypeStatus,
  updateClassType,
} from "./actions";
import { ColorPaletteField } from "@/components/features/color-palette-field";
import {
  CollapsibleActionPanel,
  InlineEditDetails,
  MetaGrid,
  MetaItem,
} from "@/components/features/management-ui";
import {
  EmptyState,
  PageHeader,
  SectionHeader,
} from "@/components/features/operations-ui";
import { OrganizationResolutionState } from "@/components/features/organization-resolution-state";
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
  type ClassTypeStatus,
} from "@/lib/class-types";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/supabase";

export const dynamic = "force-dynamic";

type ClassTypesPageProps = {
  searchParams: Promise<{
    error?: string | string[];
    organizationId?: string | string[];
    status?: string | string[];
  }>;
};

type ClassTypeRow = Pick<
  Tables<"class_types">,
  | "category"
  | "color"
  | "id"
  | "name"
  | "required_coaches"
  | "requires_certification"
  | "slug"
  | "status"
  | "updated_at"
>;

const successMessages: Record<string, string> = {
  activated: "Tipo activado.",
  created: "Tipo creado.",
  deactivated: "Tipo desactivado.",
  updated: "Tipo actualizado.",
};

const successDescriptions: Record<string, string> = {
  activated: "Los horarios y plantillas volveran a leer este tipo como activo.",
  created: "Ya puedes usarlo al crear bloques o plantillas.",
  deactivated: "No se elimina ningun bloque historico vinculado.",
  updated:
    "Todos los bloques de plantilla y los horarios actuales o futuros vinculados se sincronizan sin tocar fechas pasadas.",
};

const errorMessages: Record<string, string> = {
  "class-type-required": "No se ha recibido el tipo a actualizar.",
  "duplicate-slug": "Ya existe un tipo con ese slug en esta organización.",
  forbidden: "Tu rol no permite gestionar tipos de actividad.",
  "invalid-category": "La categoría seleccionada no es válida.",
  "invalid-color": "Usa un color hexadecimal, por ejemplo #2563eb.",
  "invalid-required-coaches":
    "Los entrenadores necesarios deben ser un número entero entre 0 y 20.",
  "invalid-slug": "Usa un slug en minúsculas, números y guiones.",
  "invalid-status": "El estado seleccionado no es válido.",
  "missing-fields": "Completa nombre y slug.",
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
      "id, name, slug, category, required_coaches, requires_certification, status, color, updated_at",
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

function selectClassName(className = "") {
  return [
    "h-11 w-full rounded-md border border-input bg-transparent px-2.5 text-sm md:h-9",
    "outline-none transition-colors focus-visible:border-ring",
    "focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
    className,
  ]
    .filter(Boolean)
    .join(" ");
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
    <Badge variant={status === "active" ? "secondary" : "outline"}>
      {getClassTypeStatusLabel(status)}
    </Badge>
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

function CertificationCheckbox({
  defaultChecked,
}: {
  defaultChecked?: boolean;
}) {
  return (
    <label className="flex min-h-11 items-center gap-2 rounded-md border border-border px-2.5 text-sm md:min-h-9">
      <input
        className="size-4 rounded border-input text-primary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        defaultChecked={defaultChecked}
        name="requiresCertification"
        type="checkbox"
      />
      <span>Requiere certificacion</span>
    </label>
  );
}

function ClassTypeCreateForm({ organizationId }: { organizationId: string }) {
  return (
    <form action={createClassType} className="grid gap-4 lg:grid-cols-6">
      <input name="organizationId" type="hidden" value={organizationId} />
      <input name="status" type="hidden" value="active" />

      <label className="grid gap-2 lg:col-span-2">
        <span className="text-sm font-medium">Nombre</span>
        <Input name="name" placeholder="Open Box" required />
      </label>

      <label className="grid gap-2 lg:col-span-2">
        <span className="text-sm font-medium">Slug interno</span>
        <Input name="slug" placeholder="open-box" />
      </label>

      <label className="grid gap-2">
        <span className="text-sm font-medium">Categoría</span>
        <ClassTypeCategorySelect />
      </label>

      <label className="grid gap-2">
        <span className="text-sm font-medium">Entrenadores</span>
        <Input
          defaultValue="1"
          max="20"
          min="0"
          name="requiredCoaches"
          required
          type="number"
        />
      </label>

      <div className="lg:col-span-2">
        <ColorPaletteField label="Color" name="color" placeholder="#2563eb" />
      </div>

      <div className="flex items-end lg:col-span-2">
        <CertificationCheckbox />
      </div>

      <div className="flex items-end lg:col-span-2">
        <Button className="w-full sm:w-auto" type="submit">
          <Plus aria-hidden="true" />
          Crear tipo
        </Button>
      </div>
    </form>
  );
}

function ClassTypeReadOnlyCard({
  classType,
  timezone,
}: {
  classType: ClassTypeRow;
  timezone: string;
}) {
  return (
    <Card size="sm">
      <CardContent className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,2.2fr)_auto] lg:items-start">
        <div className="min-w-0">
          <h3 className="flex min-w-0 items-center gap-2 text-base font-semibold tracking-tight">
            <ColorSwatch color={classType.color} />
            <span className="truncate">{classType.name}</span>
          </h3>
          <p className="mt-1 truncate text-sm text-muted-foreground">
            {classType.slug}
          </p>
        </div>
        <MetaGrid className="lg:grid-cols-4">
          <MetaItem label="Categoría">
            {getClassTypeCategoryLabel(classType.category)}
          </MetaItem>
          <MetaItem label="Entrenadores">{classType.required_coaches}</MetaItem>
          <MetaItem label="Certificacion">
            {classType.requires_certification ? "Si" : "No"}
          </MetaItem>
          <MetaItem label="Actualizado">
            {formatUpdatedAt(classType.updated_at, timezone)}
          </MetaItem>
        </MetaGrid>
        <div className="flex justify-start lg:justify-end">
          <ClassTypeStatusBadge status={classType.status} />
        </div>
      </CardContent>
    </Card>
  );
}

function ClassTypeAdminCard({
  classType,
  organizationId,
  timezone,
}: {
  classType: ClassTypeRow;
  organizationId: string;
  timezone: string;
}) {
  const nextStatus: ClassTypeStatus =
    classType.status === "active" ? "inactive" : "active";

  return (
    <Card size="sm">
      <CardContent className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,2.2fr)_auto] lg:items-start">
          <div className="min-w-0">
            <h3 className="flex min-w-0 items-center gap-2 text-base font-semibold tracking-tight">
              <ColorSwatch color={classType.color} />
              <span className="truncate">{classType.name}</span>
            </h3>
            <p className="mt-1 truncate text-sm text-muted-foreground">
              {classType.slug}
            </p>
          </div>
          <MetaGrid className="lg:grid-cols-4">
            <MetaItem label="Categoría">
              {getClassTypeCategoryLabel(classType.category)}
            </MetaItem>
            <MetaItem label="Entrenadores">{classType.required_coaches}</MetaItem>
            <MetaItem label="Certificacion">
              {classType.requires_certification ? "Si" : "No"}
            </MetaItem>
            <MetaItem label="Actualizado">
              {formatUpdatedAt(classType.updated_at, timezone)}
            </MetaItem>
          </MetaGrid>
          <div className="flex justify-start lg:justify-end">
            <ClassTypeStatusBadge status={classType.status} />
          </div>
        </div>

        <InlineEditDetails label="Gestionar">
          <div className="space-y-4">
            <form
              action={updateClassType}
              className="grid gap-4 lg:grid-cols-6"
            >
              <input
                name="organizationId"
                type="hidden"
                value={organizationId}
              />
              <input name="classTypeId" type="hidden" value={classType.id} />

              <label className="grid gap-2 lg:col-span-2">
                <span className="text-sm font-medium">Nombre</span>
                <Input name="name" required defaultValue={classType.name} />
              </label>

              <label className="grid gap-2 lg:col-span-2">
                <span className="text-sm font-medium">Slug interno</span>
                <Input name="slug" required defaultValue={classType.slug} />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-medium">Categoría</span>
                <ClassTypeCategorySelect defaultValue={classType.category} />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-medium">Entrenadores</span>
                <Input
                  defaultValue={classType.required_coaches}
                  max="20"
                  min="0"
                  name="requiredCoaches"
                  required
                  type="number"
                />
              </label>

              <div className="lg:col-span-2">
                <ColorPaletteField
                  defaultValue={classType.color}
                  label="Color"
                  name="color"
                  placeholder="#2563eb"
                />
              </div>

              <label className="grid gap-2">
                <span className="text-sm font-medium">Estado</span>
                <ClassTypeStatusSelect defaultValue={classType.status} />
              </label>

              <div className="flex items-end lg:col-span-2">
                <CertificationCheckbox
                  defaultChecked={classType.requires_certification}
                />
              </div>

              <div className="flex flex-wrap gap-2 lg:col-span-6">
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
                variant={nextStatus === "inactive" ? "destructive" : "outline"}
              >
                <CircleOff aria-hidden="true" />
                {nextStatus === "inactive"
                  ? "Desactivar tipo"
                  : "Activar tipo"}
              </Button>
            </form>
          </div>
        </InlineEditDetails>
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

  const classTypes = await getClassTypes(resolution.organization.id);
  const canManageClassTypes = canManageOperationalData(
    resolution.membership.role,
  );
  const roleLabel = getApplicationRoleLabel(resolution.membership.role);

  return (
    <div className="space-y-6">
      <PageHeader
        badge="Tipos de actividad"
        description="Mantiene el catálogo operativo que alimenta horarios, plantillas y cobertura."
        meta={
          <>
            <Badge variant="secondary">{resolution.organization.name}</Badge>
            <Badge variant="outline">Rol {roleLabel}</Badge>
          </>
        }
        title="Tipos de actividad"
      />

      {status && successMessages[status] ? (
        <Alert>
          <AlertTitle>{successMessages[status]}</AlertTitle>
          <AlertDescription>{successDescriptions[status]}</AlertDescription>
        </Alert>
      ) : null}

      {error && errorMessages[error] ? (
        <Alert variant="destructive">
          <AlertTitle>No se han guardado los cambios</AlertTitle>
          <AlertDescription>{errorMessages[error]}</AlertDescription>
        </Alert>
      ) : null}

      {canManageClassTypes ? (
        <CollapsibleActionPanel
          actionLabel="Crear"
          description="Añade clases, recepción u otras actividades que luego se programan como bloques."
          icon={Plus}
          title="Crear tipo de actividad"
        >
          <ClassTypeCreateForm organizationId={resolution.organization.id} />
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

      <section className="space-y-3">
        <SectionHeader
          action={<Badge variant="outline">{classTypes.length} tipos</Badge>}
          description="Nombre, categoría, entrenadores necesarios, certificación y color."
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
        ) : (
          <div className="grid gap-3">
            {classTypes.map((classType) =>
              canManageClassTypes ? (
                <ClassTypeAdminCard
                  classType={classType}
                  key={classType.id}
                  organizationId={resolution.organization.id}
                  timezone={resolution.organization.timezone}
                />
              ) : (
                <ClassTypeReadOnlyCard
                  classType={classType}
                  key={classType.id}
                  timezone={resolution.organization.timezone}
                />
              ),
            )}
          </div>
        )}
      </section>

      <Alert>
        <CircleOff aria-hidden="true" className="size-4" />
        <AlertTitle>Fuera de este corte</AlertTitle>
        <AlertDescription>
          Esta pantalla solo define el catálogo de actividades. El horario y la
          cobertura se gestionan en sus secciones.
        </AlertDescription>
      </Alert>
    </div>
  );
}
