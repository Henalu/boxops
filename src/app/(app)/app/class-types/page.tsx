import { redirect } from "next/navigation";
import {
  CircleOff,
  Dumbbell,
  Plus,
  Save,
} from "lucide-react";

import {
  createClassType,
  setClassTypeStatus,
  updateClassType,
} from "./actions";
import { OrganizationResolutionState } from "@/components/features/organization-resolution-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getLoginPath } from "@/lib/auth/redirects";
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
    organizationId?: string | string[];
    status?: string | string[];
    error?: string | string[];
  }>;
};

type ClassTypeRow = Pick<
  Tables<"class_types">,
  | "id"
  | "name"
  | "slug"
  | "category"
  | "required_coaches"
  | "requires_certification"
  | "status"
  | "color"
  | "updated_at"
>;

const successMessages: Record<string, string> = {
  activated: "Tipo activado.",
  created: "Tipo creado.",
  deactivated: "Tipo desactivado.",
  updated: "Tipo actualizado.",
};

const errorMessages: Record<string, string> = {
  "class-type-required": "No se ha recibido el tipo a actualizar.",
  "duplicate-slug": "Ya existe un tipo con ese slug en esta organizacion.",
  forbidden: "Tu rol no permite gestionar tipos de actividad.",
  "invalid-category": "La categoria seleccionada no es valida.",
  "invalid-color": "Usa un color hexadecimal, por ejemplo #2563eb.",
  "invalid-required-coaches":
    "Los coaches necesarios deben ser un numero entero entre 0 y 20.",
  "invalid-slug": "Usa un slug en minusculas, numeros y guiones.",
  "invalid-status": "El estado seleccionado no es valido.",
  "missing-fields": "Completa nombre y slug.",
  "save-failed": "No se han podido guardar los cambios.",
  no_active_memberships: "No hay accesos activos para este usuario.",
  organization_not_found: "La organizacion solicitada no esta disponible.",
  organization_required:
    "Elige una organizacion antes de gestionar tipos de actividad.",
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
    "h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm",
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
    <label className="flex min-h-9 items-center gap-2 rounded-md border border-border px-2.5 text-sm">
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

function ColorField({ defaultValue }: { defaultValue?: string | null }) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-medium">Color</span>
      <div className="flex items-center gap-2">
        <ColorSwatch color={defaultValue ?? null} />
        <Input
          defaultValue={defaultValue ?? ""}
          maxLength={7}
          name="color"
          pattern="#?[0-9a-fA-F]{6}"
          placeholder="#2563eb"
        />
      </div>
    </label>
  );
}

function ClassTypeCreateForm({ organizationId }: { organizationId: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Plus aria-hidden="true" className="size-4" />
          Crear tipo de actividad
        </CardTitle>
        <CardDescription>
          Define una clase o actividad para usarla en horarios y plantillas.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={createClassType} className="grid gap-4 lg:grid-cols-6">
          <input name="organizationId" type="hidden" value={organizationId} />
          <input name="status" type="hidden" value="active" />

          <label className="grid gap-2 lg:col-span-2">
            <span className="text-sm font-medium">Nombre</span>
            <Input name="name" placeholder="Open Box" required />
          </label>

          <label className="grid gap-2 lg:col-span-2">
            <span className="text-sm font-medium">Slug</span>
            <Input name="slug" placeholder="open-box" />
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-medium">Categoria</span>
            <ClassTypeCategorySelect />
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-medium">Coaches</span>
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
            <ColorField />
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
      </CardContent>
    </Card>
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
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2">
              <ColorSwatch color={classType.color} />
              <span className="truncate">{classType.name}</span>
            </CardTitle>
            <CardDescription className="truncate">
              {classType.slug}
            </CardDescription>
          </div>
          <ClassTypeStatusBadge status={classType.status} />
        </div>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-3 text-sm sm:grid-cols-4">
          <div className="min-w-0">
            <dt className="text-muted-foreground">Categoria</dt>
            <dd className="mt-1 truncate font-medium">
              {getClassTypeCategoryLabel(classType.category)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Coaches</dt>
            <dd className="mt-1 font-medium">{classType.required_coaches}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Certificacion</dt>
            <dd className="mt-1 font-medium">
              {classType.requires_certification ? "Si" : "No"}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted-foreground">Ultima actualizacion</dt>
            <dd className="mt-1 truncate">
              {formatUpdatedAt(classType.updated_at, timezone)}
            </dd>
          </div>
        </dl>
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
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2">
              <ColorSwatch color={classType.color} />
              <span className="truncate">{classType.name}</span>
            </CardTitle>
            <CardDescription className="truncate">
              Actualizado {formatUpdatedAt(classType.updated_at, timezone)}
            </CardDescription>
          </div>
          <ClassTypeStatusBadge status={classType.status} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <form action={updateClassType} className="grid gap-4 lg:grid-cols-6">
          <input name="organizationId" type="hidden" value={organizationId} />
          <input name="classTypeId" type="hidden" value={classType.id} />

          <label className="grid gap-2 lg:col-span-2">
            <span className="text-sm font-medium">Nombre</span>
            <Input name="name" required defaultValue={classType.name} />
          </label>

          <label className="grid gap-2 lg:col-span-2">
            <span className="text-sm font-medium">Slug</span>
            <Input name="slug" required defaultValue={classType.slug} />
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-medium">Categoria</span>
            <ClassTypeCategorySelect defaultValue={classType.category} />
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-medium">Coaches</span>
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
            <ColorField defaultValue={classType.color} />
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
          <input name="organizationId" type="hidden" value={organizationId} />
          <input name="classTypeId" type="hidden" value={classType.id} />
          <input name="nextStatus" type="hidden" value={nextStatus} />
          <Button
            type="submit"
            variant={nextStatus === "inactive" ? "destructive" : "outline"}
          >
            <CircleOff aria-hidden="true" />
            {nextStatus === "inactive" ? "Desactivar tipo" : "Activar tipo"}
          </Button>
        </form>
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
        <PageHeader />
        <OrganizationResolutionState
          basePath="/app/class-types"
          resolution={resolution}
        />
      </div>
    );
  }

  const classTypes = await getClassTypes(resolution.organization.id);
  const canManageClassTypes = resolution.membership.role === "admin";

  return (
    <div className="space-y-6">
      <PageHeader
        organizationName={resolution.organization.name}
        role={resolution.membership.role}
      />

      {status && successMessages[status] ? (
        <Alert>
          <AlertTitle>{successMessages[status]}</AlertTitle>
          <AlertDescription>
            El catalogo ya muestra los tipos actuales.
          </AlertDescription>
        </Alert>
      ) : null}

      {error && errorMessages[error] ? (
        <Alert variant="destructive">
          <AlertTitle>No se han guardado los cambios</AlertTitle>
          <AlertDescription>{errorMessages[error]}</AlertDescription>
        </Alert>
      ) : null}

      {canManageClassTypes ? (
        <ClassTypeCreateForm organizationId={resolution.organization.id} />
      ) : (
        <Alert>
          <AlertTitle>Modo lectura</AlertTitle>
          <AlertDescription>
            Tu rol coach puede consultar el catalogo, pero no crear ni editar
            tipos de actividad.
          </AlertDescription>
        </Alert>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              Catalogo
            </h2>
            <p className="text-sm text-muted-foreground">
              Nombre, categoria, coaches necesarios, certificacion y color.
            </p>
          </div>
          <Badge variant="outline">{classTypes.length} tipos</Badge>
        </div>

        {classTypes.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>No hay tipos de actividad todavia</CardTitle>
              <CardDescription>
                {canManageClassTypes
                  ? "Crea el primer tipo para preparar horarios y plantillas."
                  : "Un admin debe crear el catalogo antes de que aparezca aqui."}
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <div className="grid gap-4">
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
          Esta pantalla solo define el catalogo de actividades. El horario y la
          cobertura se gestionan en sus secciones.
        </AlertDescription>
      </Alert>
    </div>
  );
}

function PageHeader({
  organizationName,
  role,
}: {
  organizationName?: string;
  role?: string;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">Tipos de actividad</Badge>
        {organizationName ? (
          <Badge variant="secondary">{organizationName}</Badge>
        ) : null}
        {role ? <Badge variant="outline">Rol {role}</Badge> : null}
      </div>
      <div className="max-w-3xl space-y-2">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          <Dumbbell aria-hidden="true" className="size-6" />
          Tipos de actividad
        </h1>
        <p className="text-sm leading-6 text-muted-foreground sm:text-base">
          Define las clases y actividades que se usaran en horarios y
          plantillas.
        </p>
      </div>
    </section>
  );
}
