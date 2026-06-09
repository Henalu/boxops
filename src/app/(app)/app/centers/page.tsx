import Link from "next/link";
import { redirect } from "next/navigation";
import type React from "react";
import type { LucideIcon } from "lucide-react";
import {
  Building2,
  CalendarDays,
  CheckCircle2,
  CircleOff,
  Globe2,
  Info,
  ListFilter,
  Plus,
  Save,
  Search,
} from "lucide-react";

import { createCenter, setCenterStatus, updateCenter } from "./actions";
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
  CENTER_STATUSES,
  getCenterStatusLabel,
  type CenterStatus,
} from "@/lib/centers";
import {
  formatPlanLimit,
  getOrganizationBillingOverview,
} from "@/lib/billing";
import {
  getCentersPath,
  getSettingsBillingPath,
} from "@/lib/navigation/app-paths";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import type { Tables } from "@/types/supabase";

export const dynamic = "force-dynamic";

type CentersPageProps = {
  searchParams: Promise<{
    error?: string | string[];
    center_status?: string | string[];
    organizationId?: string | string[];
    q?: string | string[];
    status?: string | string[];
    timezone?: string | string[];
  }>;
};

type CenterRow = Pick<
  Tables<"centers">,
  "created_at" | "id" | "name" | "slug" | "status" | "timezone" | "updated_at"
>;

type CenterFilterValues = {
  q: string;
  status: CenterStatus | "all";
  timezone: string;
};

const successMessages: Record<string, string> = {
  activated: "Centro activado.",
  created: "Centro creado.",
  deactivated: "Centro desactivado.",
  updated: "Centro actualizado.",
};

const errorMessages: Record<string, string> = {
  "center-required": "No se ha recibido el centro a actualizar.",
  "center-limit-reached":
    "Has llegado al límite de centros activos incluido en tu plan.",
  "duplicate-slug":
    "No se ha podido crear un identificador interno libre. Prueba con otro nombre.",
  forbidden: "Tu rol no permite gestionar centros.",
  "invalid-slug":
    "No se ha podido preparar el identificador interno. Prueba con otro nombre.",
  "invalid-status": "El estado del centro no es válido.",
  "missing-fields": "Completa nombre y zona horaria.",
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
    .select("id, name, slug, timezone, status, created_at, updated_at")
    .eq("organization_id", organizationId)
    .order("status", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`Could not load centers: ${error.message}`);
  }

  return data satisfies CenterRow[];
}

function selectClassName(className = "") {
  return cn(
    "h-11 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:h-9",
    className,
  );
}

function formatDateTime(value: string, timezone: string) {
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

function normalizeSearch(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("es-ES")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function getTimezoneOptions(centers: CenterRow[], defaultTimezone: string) {
  return Array.from(
    new Set(
      [defaultTimezone, ...centers.map((center) => center.timezone)].filter(
        Boolean,
      ),
    ),
  ).sort((a, b) => a.localeCompare(b, "es"));
}

function parseCenterStatusFilter(value?: string): CenterFilterValues["status"] {
  if (CENTER_STATUSES.includes(value as CenterStatus)) {
    return value as CenterStatus;
  }

  return "all";
}

function getCenterFilters(
  params: Awaited<CentersPageProps["searchParams"]>,
  timezoneOptions: string[],
): CenterFilterValues {
  const timezone = getParam(params.timezone);
  const safeTimezone =
    timezone && timezoneOptions.includes(timezone) ? timezone : "all";

  return {
    q: getParam(params.q)?.trim() ?? "",
    status: parseCenterStatusFilter(getParam(params.center_status)),
    timezone: safeTimezone,
  };
}

function applyCenterFilters(centers: CenterRow[], filters: CenterFilterValues) {
  const query = normalizeSearch(filters.q);

  return centers.filter((center) => {
    if (filters.status !== "all" && center.status !== filters.status) {
      return false;
    }

    if (filters.timezone !== "all" && center.timezone !== filters.timezone) {
      return false;
    }

    if (!query) {
      return true;
    }

    return normalizeSearch(`${center.name} ${center.slug}`).includes(query);
  });
}

function getActiveFilterCount(filters: CenterFilterValues) {
  return [
    filters.q !== "",
    filters.status !== "all",
    filters.timezone !== "all",
  ].filter(Boolean).length;
}

function StatusSelect({ defaultValue }: { defaultValue: string }) {
  return (
    <select
      className={selectClassName("md:h-8")}
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
    <StatusBadge tone={status === "active" ? "success" : "neutral"}>
      {getCenterStatusLabel(status)}
    </StatusBadge>
  );
}

function CenterSummaryCard({
  description,
  icon: Icon,
  label,
  tone = "neutral",
  value,
}: {
  description: string;
  icon: LucideIcon;
  label: string;
  tone?: "neutral" | "success" | "warning";
  value: React.ReactNode;
}) {
  const iconClassName =
    tone === "success"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200/70"
      : tone === "warning"
        ? "bg-muted text-muted-foreground ring-foreground/10"
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

function CenterSummary({
  centers,
  primaryTimezone,
}: {
  centers: CenterRow[];
  primaryTimezone: string;
}) {
  const activeCenters = centers.filter((center) => center.status === "active");
  const inactiveCenters = centers.filter(
    (center) => center.status !== "active",
  );

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <CenterSummaryCard
        description="Sedes activas e inactivas"
        icon={Building2}
        label="Total de centros"
        value={centers.length}
      />
      <CenterSummaryCard
        description="Operativos actualmente"
        icon={CheckCircle2}
        label="Centros activos"
        tone="success"
        value={activeCenters.length}
      />
      <CenterSummaryCard
        description="No operativos"
        icon={CircleOff}
        label="Centros inactivos"
        tone="warning"
        value={inactiveCenters.length}
      />
      <CenterSummaryCard
        description="Predeterminada de la organización"
        icon={Globe2}
        label="Zona horaria principal"
        value={<span className="text-xl md:text-2xl">{primaryTimezone}</span>}
      />
    </div>
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
    <form
      action={createCenter}
      className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(14rem,0.7fr)_auto] lg:items-end"
    >
      <input name="organizationId" type="hidden" value={organizationId} />
      <input name="status" type="hidden" value="active" />

      <label className="grid gap-2">
        <span className="text-sm font-medium">Nombre</span>
        <Input name="name" placeholder="Centro principal" required />
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

function CenterFilterControls({
  activeFilterCount,
  filters,
  organizationId,
  resetPath,
  timezoneOptions,
}: {
  activeFilterCount: number;
  filters: CenterFilterValues;
  organizationId: string;
  resetPath: string;
  timezoneOptions: string[];
}) {
  return (
    <Card>
      <CardContent className="py-4">
        <form
          action="/app/centers"
          className="grid gap-3 lg:grid-cols-[minmax(18rem,1fr)_12rem_15rem_auto_auto] lg:items-end"
          method="get"
        >
          <input name="organizationId" type="hidden" value={organizationId} />

          <label className="grid gap-1.5">
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
                placeholder="Nombre del centro"
              />
            </span>
          </label>

          <label className="grid gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              Estado
            </span>
            <select
              className={selectClassName()}
              defaultValue={filters.status}
              name="center_status"
            >
              <option value="all">Todos</option>
              {CENTER_STATUSES.map((statusOption) => (
                <option key={statusOption} value={statusOption}>
                  {getCenterStatusLabel(statusOption)}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              Zona horaria
            </span>
            <select
              className={selectClassName()}
              defaultValue={filters.timezone}
              name="timezone"
            >
              <option value="all">Todas</option>
              {timezoneOptions.map((timezone) => (
                <option key={timezone} value={timezone}>
                  {timezone}
                </option>
              ))}
            </select>
          </label>

          <Button className="w-full lg:w-auto" type="submit">
            <ListFilter aria-hidden="true" />
            Aplicar
          </Button>

          {activeFilterCount > 0 ? (
            <Button
              asChild
              className="w-full lg:w-auto"
              variant="outline"
            >
              <Link href={resetPath}>Limpiar</Link>
            </Button>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}

function CenterIdentity({ center }: { center: CenterRow }) {
  const isActive = center.status === "active";

  return (
    <div className="flex min-w-0 items-start gap-4">
      <span className="relative flex size-14 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/10">
        <Building2 aria-hidden="true" className="size-6" />
        <span
          aria-hidden="true"
          className={cn(
            "absolute -right-0.5 bottom-1 size-3.5 rounded-full ring-2 ring-card",
            isActive ? "bg-emerald-500" : "bg-muted-foreground/45",
          )}
        />
      </span>

      <div className="min-w-0 space-y-2">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold tracking-tight md:text-lg">
            {center.name}
          </h3>
        </div>
        <CenterBadge status={center.status} />
      </div>
    </div>
  );
}

function CenterMeta({
  icon: Icon,
  label,
  mono = false,
  value,
}: {
  icon: LucideIcon;
  label: string;
  mono?: boolean;
  value: string;
}) {
  return (
    <div className="min-w-0 space-y-1">
      <dt className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon aria-hidden="true" className="size-3.5" />
        {label}
      </dt>
      <dd
        className={cn(
          "truncate text-sm font-medium",
          mono ? "font-mono text-xs" : "",
        )}
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}

function CenterCardSummary({ center }: { center: CenterRow }) {
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,2fr)] xl:items-center">
      <CenterIdentity center={center} />
      <dl className="grid min-w-0 gap-3 sm:grid-cols-3">
        <CenterMeta
          icon={Globe2}
          label="Zona horaria"
          mono
          value={center.timezone}
        />
        <CenterMeta
          icon={CalendarDays}
          label="Actualizado"
          value={formatDateTime(center.updated_at, center.timezone)}
        />
        <CenterMeta
          icon={CalendarDays}
          label="Creado"
          value={formatDateTime(center.created_at, center.timezone)}
        />
      </dl>
    </div>
  );
}

function CenterReadOnlyCard({ center }: { center: CenterRow }) {
  return (
    <Card size="sm">
      <CardContent className="px-5 py-2">
        <CenterCardSummary center={center} />
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
      <CardContent className="space-y-4 px-5 py-2">
        <CenterCardSummary center={center} />

        <div className="border-t border-border pt-4">
          <InlineEditDetails label="Gestionar">
            <div className="space-y-4">
              <form action={updateCenter} className="grid gap-4 lg:grid-cols-3">
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
                  <span className="text-sm font-medium">Zona horaria</span>
                  <Input
                    name="timezone"
                    required
                    defaultValue={center.timezone}
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-sm font-medium">Estado</span>
                  <StatusSelect defaultValue={center.status} />
                </label>

                <div className="flex flex-wrap gap-2 lg:col-span-3">
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
                  variant={
                    nextStatus === "inactive" ? "destructive" : "outline"
                  }
                >
                  <CircleOff aria-hidden="true" />
                  {nextStatus === "inactive"
                    ? "Desactivar centro"
                    : "Activar centro"}
                </Button>
              </form>
            </div>
          </InlineEditDetails>
        </div>
      </CardContent>
    </Card>
  );
}

function CentersInfoCard() {
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 py-5 sm:flex-row sm:items-start">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/10">
          <Info aria-hidden="true" className="size-5" />
        </span>
        <div className="max-w-3xl space-y-1">
          <h2 className="font-semibold tracking-tight">¿Qué es un centro?</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            Un centro representa una sede física donde se imparten clases y se
            gestiona el horario. Mantenerlo actualizado ayuda a filtrar
            horarios, equipo, plantillas y cobertura por ubicación.
          </p>
        </div>
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
  const timezoneOptions = getTimezoneOptions(
    centers,
    resolution.organization.timezone,
  );
  const centerFilters = getCenterFilters(params, timezoneOptions);
  const filteredCenters = applyCenterFilters(centers, centerFilters);
  const activeFilterCount = getActiveFilterCount(centerFilters);
  const filterResetPath = getCentersPath({
    organizationId: resolution.organization.id,
  });
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
              Has llegado al límite de centros activos de tu plan.{" "}
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

      <CenterSummary
        centers={centers}
        primaryTimezone={resolution.organization.timezone}
      />

      {canManageCenters ? (
        <CollapsibleActionPanel
          actionLabel="Crear"
          description="Añade una sede cuando el box tenga un nuevo espacio operativo."
          featured
          icon={Plus}
          title="Crear centro"
        >
          {centerLimitReached ? (
            <Alert>
              <AlertTitle>Limite de centros alcanzado</AlertTitle>
              <AlertDescription>
                Tu organización tiene {activeCentersCount} centros activos y el
                plan actual incluye {formatPlanLimit(effectiveCenterLimit)}. No
                se bloquea la edición de centros existentes. Para añadir otro,
                revisa{" "}
                <Link className="font-medium underline" href={billingPath}>
                  Plan y facturación
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

      <section className="space-y-4">
        {centers.length > 0 ? (
          <CenterFilterControls
            activeFilterCount={activeFilterCount}
            filters={centerFilters}
            organizationId={resolution.organization.id}
            resetPath={filterResetPath}
            timezoneOptions={timezoneOptions}
          />
        ) : null}

        <SectionHeader
          action={
            <Badge variant="outline">
              {activeFilterCount > 0
                ? `${filteredCenters.length} de ${centers.length}`
                : `${centers.length} centros`}
            </Badge>
          }
          description="Vista principal de sedes activas e inactivas."
          title="Centros"
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
        ) : filteredCenters.length === 0 ? (
          <EmptyState
            action={
              <Button asChild variant="outline">
                <Link href={filterResetPath}>Limpiar filtros</Link>
              </Button>
            }
            description="No hay centros que coincidan con la búsqueda o los filtros actuales."
            title="Sin resultados"
          />
        ) : (
          <div className="grid gap-3">
            {filteredCenters.map((center) =>
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

      <CentersInfoCard />
    </div>
  );
}
