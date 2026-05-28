import Link from "next/link";
import { redirect } from "next/navigation";
import { CircleOff, Plus, Save } from "lucide-react";

import { createCenter, setCenterStatus, updateCenter } from "./actions";
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
  CENTER_STATUSES,
  getCenterStatusLabel,
  type CenterStatus,
} from "@/lib/centers";
import {
  formatPlanLimit,
  getOrganizationBillingOverview,
} from "@/lib/billing";
import { getSettingsBillingPath } from "@/lib/navigation/app-paths";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/supabase";

export const dynamic = "force-dynamic";

type CentersPageProps = {
  searchParams: Promise<{
    error?: string | string[];
    organizationId?: string | string[];
    status?: string | string[];
  }>;
};

type CenterRow = Pick<
  Tables<"centers">,
  "id" | "name" | "slug" | "status" | "timezone" | "updated_at"
>;

const successMessages: Record<string, string> = {
  activated: "Centro activado.",
  created: "Centro creado.",
  deactivated: "Centro desactivado.",
  updated: "Centro actualizado.",
};

const errorMessages: Record<string, string> = {
  "center-required": "No se ha recibido el centro a actualizar.",
  "center-limit-reached":
    "Has llegado al limite de centros activos incluido en tu plan.",
  "duplicate-slug": "Ya existe un centro con ese slug en esta organización.",
  forbidden: "Tu rol no permite gestionar centros.",
  "invalid-slug": "Usa un slug en minúsculas, números y guiones.",
  "invalid-status": "El estado del centro no es válido.",
  "missing-fields": "Completa nombre, slug y zona horaria.",
  no_active_memberships: "No hay accesos activos para este usuario.",
  organization_not_found: "La organización solicitada no está disponible.",
  organization_required: "Elige una organización antes de gestionar centros.",
  "save-failed": "No se han podido guardar los cambios.",
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

function StatusSelect({ defaultValue }: { defaultValue: string }) {
  return (
    <select
      className="h-11 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:h-8"
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
    <form action={createCenter} className="grid gap-4 lg:grid-cols-4">
      <input name="organizationId" type="hidden" value={organizationId} />
      <input name="status" type="hidden" value="active" />

      <label className="grid gap-2">
        <span className="text-sm font-medium">Nombre</span>
        <Input name="name" placeholder="Centro principal" required />
      </label>

      <label className="grid gap-2">
        <span className="text-sm font-medium">Slug interno</span>
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
  );
}

function CenterReadOnlyCard({ center }: { center: CenterRow }) {
  return (
    <Card size="sm">
      <CardContent className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)_auto] lg:items-start">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold tracking-tight">
            {center.name}
          </h3>
          <p className="mt-1 truncate text-sm text-muted-foreground">
            {center.slug}
          </p>
        </div>
        <MetaGrid className="lg:grid-cols-2">
          <MetaItem label="Zona horaria" mono>
            {center.timezone}
          </MetaItem>
          <MetaItem label="Actualizado">
            {formatUpdatedAt(center.updated_at, center.timezone)}
          </MetaItem>
        </MetaGrid>
        <div className="flex justify-start lg:justify-end">
          <CenterBadge status={center.status} />
        </div>
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
    <Card size="sm">
      <CardContent className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)_auto] lg:items-start">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold tracking-tight">
              {center.name}
            </h3>
            <p className="mt-1 truncate text-sm text-muted-foreground">
              {center.slug}
            </p>
          </div>
          <MetaGrid className="lg:grid-cols-2">
            <MetaItem label="Zona horaria" mono>
              {center.timezone}
            </MetaItem>
            <MetaItem label="Actualizado">
              {formatUpdatedAt(center.updated_at, center.timezone)}
            </MetaItem>
          </MetaGrid>
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <CenterBadge status={center.status} />
          </div>
        </div>
        <InlineEditDetails label="Gestionar">
          <div className="space-y-4">
            <form action={updateCenter} className="grid gap-4 lg:grid-cols-4">
              <input
                name="organizationId"
                type="hidden"
                value={organizationId}
              />
              <input name="centerId" type="hidden" value={center.id} />

              <label className="grid gap-2">
                <span className="text-sm font-medium">Nombre</span>
                <Input name="name" required defaultValue={center.name} />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-medium">Slug interno</span>
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

              <div className="flex flex-wrap gap-2 lg:col-span-4">
                <Button type="submit">
                  <Save aria-hidden="true" />
                  Guardar cambios
                </Button>
              </div>
            </form>

            <form action={setCenterStatus}>
              <input
                name="organizationId"
                type="hidden"
                value={organizationId}
              />
              <input name="centerId" type="hidden" value={center.id} />
              <input name="nextStatus" type="hidden" value={nextStatus} />
              <Button
                type="submit"
                variant={nextStatus === "inactive" ? "destructive" : "outline"}
              >
                <CircleOff aria-hidden="true" />
                {nextStatus === "inactive"
                  ? "Desactivar centro"
                  : "Activar centro"}
              </Button>
            </form>
          </div>
        </InlineEditDetails>
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
        <PageHeader
          badge="Centros"
          title="Centros"
          description="Gestiona las sedes del box y su estado operativo."
        />
        <OrganizationResolutionState
          basePath="/app/centers"
          resolution={resolution}
        />
      </div>
    );
  }

  const centers = await getCenters(resolution.organization.id);
  const billingOverviewResult = await getOrganizationBillingOverview(
    resolution.organization.id,
  );
  const billingOverview = billingOverviewResult.ok
    ? billingOverviewResult.data
    : null;
  const effectiveCenterLimit = billingOverview?.effective_center_limit ?? null;
  const activeCentersCount = billingOverview?.active_centers_count ?? 0;
  const centerLimitReached =
    effectiveCenterLimit !== null && activeCentersCount >= effectiveCenterLimit;
  const canManageCenters = canManageOperationalData(resolution.membership.role);
  const roleLabel = getApplicationRoleLabel(resolution.membership.role);
  const billingPath = getSettingsBillingPath({
    organizationId: resolution.organization.id,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        badge="Centros"
        description="Gestiona sedes, zona horaria y estado sin perder el contexto de la organización."
        meta={
          <>
            <Badge variant="secondary">{resolution.organization.name}</Badge>
            <Badge variant="outline">{roleLabel}</Badge>
          </>
        }
        title="Centros"
      />

      {status && successMessages[status] ? (
        <TransientFeedbackBanner
          description="La lista ya muestra los datos actuales."
          title={successMessages[status]}
          tone="success"
        />
      ) : null}

      {error === "center-limit-reached" ? (
        <TransientFeedbackBanner
          description={
            <>
              Has llegado al limite de centros activos de tu plan.{" "}
              <Link className="font-medium underline" href={billingPath}>
                Revisar plan
              </Link>
              .
            </>
          }
          title="No se ha creado el centro"
          tone="error"
        />
      ) : error && errorMessages[error] ? (
        <TransientFeedbackBanner
          description={errorMessages[error]}
          title="No se han guardado los cambios"
          tone="error"
        />
      ) : null}

      {canManageCenters ? (
        <CollapsibleActionPanel
          actionLabel="Crear"
          description="Añade una sede cuando el box tenga un nuevo espacio operativo."
          icon={Plus}
          title="Crear centro"
        >
          {centerLimitReached ? (
            <Alert>
              <AlertTitle>Limite de centros alcanzado</AlertTitle>
              <AlertDescription>
                Tu organizacion tiene {activeCentersCount} centros activos y el
                plan actual incluye {formatPlanLimit(effectiveCenterLimit)}. No
                se bloquea la edicion de centros existentes. Para anadir otro,
                revisa{" "}
                <Link className="font-medium underline" href={billingPath}>
                  Plan y facturacion
                </Link>
                .
              </AlertDescription>
            </Alert>
          ) : (
            <CenterCreateForm
              organizationId={resolution.organization.id}
              timezone={resolution.organization.timezone}
            />
          )}
        </CollapsibleActionPanel>
      ) : (
        <Alert>
          <AlertTitle>Modo lectura</AlertTitle>
          <AlertDescription>
            Tu rol puede consultar centros, pero no crear ni editar datos
            operativos.
          </AlertDescription>
        </Alert>
      )}

      <section className="space-y-3">
        <SectionHeader
          action={<Badge variant="outline">{centers.length} total</Badge>}
          description="Vista principal de sedes activas e inactivas."
          title="Lista de centros"
        />

        {centers.length === 0 ? (
          <EmptyState
            description={
              canManageCenters
                ? "Crea el primer centro para que el box tenga una sede operativa."
                : "Un rol operativo debe crear los centros antes de que aparezcan aquí."
            }
            title="No hay centros todavía"
          />
        ) : (
          <div className="grid gap-3">
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
