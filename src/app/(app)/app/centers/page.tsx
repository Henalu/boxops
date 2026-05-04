import { redirect } from "next/navigation";
import { Building2, CircleOff, Plus, Save } from "lucide-react";

import { createCenter, setCenterStatus, updateCenter } from "./actions";
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
  CENTER_STATUSES,
  getCenterStatusLabel,
  type CenterStatus,
} from "@/lib/centers";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/supabase";

export const dynamic = "force-dynamic";

type CentersPageProps = {
  searchParams: Promise<{
    organizationId?: string | string[];
    status?: string | string[];
    error?: string | string[];
  }>;
};

type CenterRow = Pick<
  Tables<"centers">,
  "id" | "name" | "slug" | "timezone" | "status" | "updated_at"
>;

const successMessages: Record<string, string> = {
  created: "Centro creado.",
  updated: "Centro actualizado.",
  activated: "Centro activado.",
  deactivated: "Centro desactivado.",
};

const errorMessages: Record<string, string> = {
  "missing-fields": "Completa nombre, slug y zona horaria.",
  "invalid-slug": "Usa un slug en minusculas, numeros y guiones.",
  "invalid-status": "El estado del centro no es valido.",
  "duplicate-slug": "Ya existe un centro con ese slug en esta organizacion.",
  "save-failed": "No se han podido guardar los cambios.",
  "center-required": "No se ha recibido el centro a actualizar.",
  forbidden: "Tu rol no permite gestionar centros.",
  organization_required: "Elige una organizacion antes de gestionar centros.",
  organization_not_found: "La organizacion solicitada no esta disponible.",
  no_active_memberships: "No hay accesos activos para este usuario.",
};

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

async function getCenters(organizationId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("centers")
    .select("id, name, slug, timezone, status, updated_at")
    .eq("organization_id", organizationId)
    .order("status", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`Could not load centers: ${error.message}`);
  }

  return data satisfies CenterRow[];
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

function StatusSelect({
  defaultValue,
}: {
  defaultValue: string;
}) {
  return (
    <select
      className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      defaultValue={defaultValue}
      name="status"
    >
      {CENTER_STATUSES.map((status) => (
        <option key={status} value={status}>
          {getCenterStatusLabel(status)}
        </option>
      ))}
    </select>
  );
}

function CenterBadge({ status }: { status: string }) {
  return (
    <Badge variant={status === "active" ? "secondary" : "outline"}>
      {getCenterStatusLabel(status)}
    </Badge>
  );
}

function CenterCreateForm({
  organizationId,
  timezone,
}: {
  organizationId: string;
  timezone: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Plus aria-hidden="true" className="size-4" />
          Crear centro
        </CardTitle>
        <CardDescription>
          Gestiona una sede del box. El identificador ayuda a mantenerla unica.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={createCenter} className="grid gap-4 lg:grid-cols-4">
          <input name="organizationId" type="hidden" value={organizationId} />
          <input name="status" type="hidden" value="active" />

          <label className="grid gap-2">
            <span className="text-sm font-medium">Nombre</span>
            <Input name="name" placeholder="Centro principal" required />
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-medium">Slug</span>
            <Input name="slug" placeholder="centro-principal" />
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-medium">Zona horaria</span>
            <Input name="timezone" required defaultValue={timezone} />
          </label>

          <div className="flex items-end">
            <Button className="w-full" type="submit">
              <Plus aria-hidden="true" />
              Crear centro
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function CenterReadOnlyCard({ center }: { center: CenterRow }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="truncate">{center.name}</CardTitle>
            <CardDescription className="truncate">
              {center.slug}
            </CardDescription>
          </div>
          <CenterBadge status={center.status} />
        </div>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="min-w-0">
            <dt className="text-muted-foreground">Zona horaria</dt>
            <dd className="mt-1 truncate font-mono">{center.timezone}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted-foreground">Ultima actualizacion</dt>
            <dd className="mt-1 truncate">
              {formatUpdatedAt(center.updated_at, center.timezone)}
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}

function CenterAdminCard({
  center,
  organizationId,
}: {
  center: CenterRow;
  organizationId: string;
}) {
  const nextStatus: CenterStatus =
    center.status === "active" ? "inactive" : "active";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="truncate">{center.name}</CardTitle>
            <CardDescription className="truncate">
              Actualizado {formatUpdatedAt(center.updated_at, center.timezone)}
            </CardDescription>
          </div>
          <CenterBadge status={center.status} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <form action={updateCenter} className="grid gap-4 lg:grid-cols-4">
          <input name="organizationId" type="hidden" value={organizationId} />
          <input name="centerId" type="hidden" value={center.id} />

          <label className="grid gap-2">
            <span className="text-sm font-medium">Nombre</span>
            <Input name="name" required defaultValue={center.name} />
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-medium">Slug</span>
            <Input name="slug" required defaultValue={center.slug} />
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-medium">Zona horaria</span>
            <Input name="timezone" required defaultValue={center.timezone} />
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-medium">Estado</span>
            <StatusSelect defaultValue={center.status} />
          </label>

          <div className="flex flex-col gap-2 sm:flex-row lg:col-span-4">
            <Button type="submit">
              <Save aria-hidden="true" />
              Guardar cambios
            </Button>
          </div>
        </form>

        <form action={setCenterStatus}>
          <input name="organizationId" type="hidden" value={organizationId} />
          <input name="centerId" type="hidden" value={center.id} />
          <input name="nextStatus" type="hidden" value={nextStatus} />
          <Button
            type="submit"
            variant={nextStatus === "inactive" ? "destructive" : "outline"}
          >
            <CircleOff aria-hidden="true" />
            {nextStatus === "inactive" ? "Desactivar centro" : "Activar centro"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export default async function CentersPage({ searchParams }: CentersPageProps) {
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect(getLoginPath("/app/centers"));
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
          basePath="/app/centers"
          resolution={resolution}
        />
      </div>
    );
  }

  const centers = await getCenters(resolution.organization.id);
  const canManageCenters = resolution.membership.role === "admin";

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
            La lista ya muestra los datos actuales.
          </AlertDescription>
        </Alert>
      ) : null}

      {error && errorMessages[error] ? (
        <Alert variant="destructive">
          <AlertTitle>No se han guardado los cambios</AlertTitle>
          <AlertDescription>{errorMessages[error]}</AlertDescription>
        </Alert>
      ) : null}

      {canManageCenters ? (
        <CenterCreateForm
          organizationId={resolution.organization.id}
          timezone={resolution.organization.timezone}
        />
      ) : (
        <Alert>
          <AlertTitle>Modo lectura</AlertTitle>
          <AlertDescription>
            Tu rol coach puede consultar centros, pero no crearlos ni editarlos.
          </AlertDescription>
        </Alert>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight">
            Centros del box
          </h2>
          <Badge variant="outline">{centers.length} total</Badge>
        </div>

        {centers.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>No hay centros todavia</CardTitle>
              <CardDescription>
                {canManageCenters
                  ? "Crea el primer centro para que el box tenga una sede operativa."
                  : "Un admin debe crear los centros antes de que aparezcan aqui."}
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <div className="grid gap-4">
            {centers.map((center) =>
              canManageCenters ? (
                <CenterAdminCard
                  center={center}
                  key={center.id}
                  organizationId={resolution.organization.id}
                />
              ) : (
                <CenterReadOnlyCard center={center} key={center.id} />
              ),
            )}
          </div>
        )}
      </section>
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
        <Badge variant="outline">Centros</Badge>
        {organizationName ? (
          <Badge variant="secondary">{organizationName}</Badge>
        ) : null}
        {role ? <Badge variant="outline">Rol {role}</Badge> : null}
      </div>
      <div className="max-w-3xl space-y-2">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          <Building2 aria-hidden="true" className="size-6" />
          Centros
        </h1>
        <p className="text-sm leading-6 text-muted-foreground sm:text-base">
          Gestiona las sedes del box y su estado operativo.
        </p>
      </div>
    </section>
  );
}
