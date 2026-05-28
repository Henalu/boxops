import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  CreditCard,
  Database,
  MapPin,
  ReceiptText,
  ShieldCheck,
} from "lucide-react";

import { changeTenantBillingPlanAction } from "@/lib/billing-actions";
import {
  formatPlanLimit,
  formatPlanPrice,
  getOrganizationBillingOverview,
  listBillingActiveCenters,
  listPublishedBillingPlans,
  type BillingCenterOption,
  type BillingErrorCode,
  type BillingPlanVersion,
  type OrganizationBillingOverview,
} from "@/lib/billing";
import {
  PageHeader,
  SectionHeader,
} from "@/components/features/operations-ui";
import { OrganizationResolutionState } from "@/components/features/organization-resolution-state";
import { TransientFeedbackBanner } from "@/components/features/transient-feedback-banner";
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
import { getLoginPath } from "@/lib/auth/redirects";
import {
  canReadTenantBilling,
  getApplicationRoleLabel,
} from "@/lib/auth/permissions";
import {
  getActiveMemberships,
  getAuthenticatedUser,
  resolveActiveOrganization,
} from "@/lib/auth/tenant";
import { getCentersPath } from "@/lib/navigation/app-paths";

export const dynamic = "force-dynamic";

type BillingSettingsPageProps = {
  searchParams: Promise<{
    error?: string | string[];
    organizationId?: string | string[];
    status?: string | string[];
  }>;
};

const planOrder = [
  "starter",
  "box",
  "growth",
  "scale",
  "network",
  "franchise",
  "enterprise",
] as const;

const successMessages: Record<string, string> = {
  "plan-changed":
    "Plan actualizado. La organizacion ya usa el nuevo snapshot comercial.",
  "plan-changed-centers-deactivated":
    "Plan actualizado. Los centros no seleccionados han quedado inactivos.",
};

const errorMessages: Partial<Record<BillingErrorCode, string>> = {
  "authentication-required": "Inicia sesion para revisar el plan.",
  "billing-catalog-load-failed":
    "No se pudo cargar la informacion comercial de la organizacion.",
  "billing-change-forbidden": "Tu rol no permite cambiar el plan.",
  "billing-plan-not-found": "Ese plan ya no esta disponible.",
  "billing-save-failed": "No se pudo guardar el cambio de plan.",
  "downgrade-selection-invalid":
    "La seleccion de centros no pertenece a esta organizacion.",
  "downgrade-selection-required":
    "El nuevo plan incluye menos centros activos. Elige cuales se mantienen activos.",
  forbidden: "Tu rol no permite ver la facturacion.",
  "invalid-input": "La solicitud no tiene datos validos.",
  "invalid-plan-code": "El codigo de plan no es valido.",
};

const subscriptionStatusLabels: Record<string, string> = {
  active: "Activa",
  cancelled: "Cancelada",
  manual: "Manual",
  past_due: "Con incidencia",
  paused: "Pausada",
  trialing: "Prueba",
};

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function isBillingErrorCode(
  value: string | undefined,
): value is BillingErrorCode {
  return Boolean(value && value in errorMessages);
}

function getStatusVariant(status: string) {
  if (status === "active" || status === "trialing" || status === "manual") {
    return "secondary" as const;
  }

  if (status === "past_due" || status === "cancelled") {
    return "destructive" as const;
  }

  return "outline" as const;
}

function formatCents(value: number | null, fallback = "A medida") {
  if (value === null) {
    return fallback;
  }

  return new Intl.NumberFormat("es-ES", {
    currency: "EUR",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value / 100);
}

function formatUsage(value: number) {
  return new Intl.NumberFormat("es-ES").format(value);
}

function sortPlans(plans: BillingPlanVersion[]) {
  return [...plans].sort((left, right) => {
    const leftIndex = planOrder.indexOf(
      left.plan_code as (typeof planOrder)[number],
    );
    const rightIndex = planOrder.indexOf(
      right.plan_code as (typeof planOrder)[number],
    );

    return (
      (leftIndex === -1 ? 999 : leftIndex) -
      (rightIndex === -1 ? 999 : rightIndex)
    );
  });
}

function BillingFeedback({
  error,
  status,
}: {
  error?: string;
  status?: string;
}) {
  if (error && isBillingErrorCode(error)) {
    return (
      <TransientFeedbackBanner
        description={errorMessages[error]}
        title="No se pudo cambiar el plan"
        tone="error"
      />
    );
  }

  if (status && successMessages[status]) {
    return (
      <TransientFeedbackBanner
        description={successMessages[status]}
        title="Cambio guardado"
        tone="success"
      />
    );
  }

  return null;
}

function UsageLine({
  description,
  label,
  limit,
  used,
}: {
  description?: string;
  label: string;
  limit: number | null;
  used: number | null;
}) {
  return (
    <div className="grid gap-2 rounded-lg border border-border bg-muted/20 p-3">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">{label}</p>
        <p className="font-mono text-sm">
          {used === null ? "Pendiente" : formatUsage(used)} /{" "}
          {formatPlanLimit(limit)}
        </p>
      </div>
      {description ? (
        <p className="text-xs leading-5 text-muted-foreground">
          {description}
        </p>
      ) : null}
    </div>
  );
}

function CurrentPlanCard({
  overview,
}: {
  overview: OrganizationBillingOverview;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard aria-hidden="true" className="size-4" />
          Plan actual
        </CardTitle>
        <CardDescription>
          Snapshot efectivo de precio y limites. Si el catalogo cambia, esta
          organizacion conserva estos valores hasta cambiar de plan.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-xl font-semibold tracking-tight">
              {overview.display_name}
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
              {overview.description}
            </p>
          </div>
          <Badge variant={getStatusVariant(overview.subscription_status)}>
            {subscriptionStatusLabels[overview.subscription_status] ??
              overview.subscription_status}
          </Badge>
        </div>

        <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div className="min-w-0">
            <dt className="text-muted-foreground">Precio</dt>
            <dd className="mt-1 font-medium">{formatPlanPrice(overview)}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted-foreground">Version</dt>
            <dd className="mt-1 font-mono text-xs">
              {overview.plan_version ?? "legacy"}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted-foreground">Setup</dt>
            <dd className="mt-1 font-medium">
              {formatCents(overview.setup_price_cents, "A medida")}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted-foreground">Soporte</dt>
            <dd className="mt-1 font-medium">
              {overview.support_level ?? "Manual"}
            </dd>
          </div>
        </dl>

        <p className="text-xs leading-5 text-muted-foreground">
          Precios founder sin IVA. El pago se conectara mas adelante; no hay
          datos bancarios ni cobro real en este corte.
        </p>
      </CardContent>
    </Card>
  );
}

function UsageCard({
  centersPath,
  overview,
}: {
  centersPath: string;
  overview: OrganizationBillingOverview;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin aria-hidden="true" className="size-4" />
          Uso y limites
        </CardTitle>
        <CardDescription>
          Los centros activos ya se aplican al crear nuevos centros. El resto de
          limites queda preparado como contrato comercial.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <UsageLine
          label="Centros activos"
          limit={overview.effective_center_limit}
          used={overview.active_centers_count}
        />
        <UsageLine
          label="Personas del equipo"
          limit={overview.effective_staff_seat_limit}
          used={overview.active_staff_count}
        />
        <UsageLine
          description="Semilla contractual para el modulo futuro de clientes. No se aplica todavia."
          label="Clientes futuros"
          limit={overview.future_client_limit}
          used={0}
        />
        <UsageLine
          description="La medicion real de almacenamiento se conectara cuando exista una fuente fiable."
          label="Almacenamiento"
          limit={overview.storage_gb}
          used={overview.storage_used_gb}
        />

        <Button asChild className="w-full sm:w-fit" variant="outline">
          <Link href={centersPath}>
            Ver centros
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function DowngradeCenterSelector({
  activeCenters,
  limit,
  planCode,
}: {
  activeCenters: BillingCenterOption[];
  limit: number;
  planCode: string;
}) {
  return (
    <div className="grid gap-3 rounded-lg border border-orange-300/60 bg-orange-50 p-3 text-orange-950">
      <div className="flex items-start gap-2">
        <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-medium">
            Este cambio exige elegir centros activos
          </p>
          <p className="mt-1 text-xs leading-5 text-orange-900/85">
            El plan {planCode} permite {formatPlanLimit(limit)} centros. Los no
            seleccionados pasaran a inactivos: no admitiran nueva operativa ni
            reservas futuras, pero conservaran historico, horarios,
            asignaciones y documentos vinculados.
          </p>
        </div>
      </div>
      <fieldset className="grid gap-2">
        <legend className="text-xs font-medium">
          Selecciona hasta {formatPlanLimit(limit)} centros
        </legend>
        <div className="grid gap-2">
          {activeCenters.map((center) => (
            <label
              className="flex min-w-0 items-start gap-2 rounded-lg border border-orange-200 bg-background/80 p-2 text-sm"
              key={center.center_id}
            >
              <input
                className="mt-1 size-4 shrink-0 accent-primary"
                name="keepCenterId"
                type="checkbox"
                value={center.center_id}
              />
              <span className="min-w-0">
                <span className="block truncate font-medium">
                  {center.center_name}
                </span>
                <span className="mt-0.5 block truncate font-mono text-xs text-muted-foreground">
                  {center.center_slug}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

function PlanOptionCard({
  activeCenters,
  canChangePlan,
  organizationId,
  overview,
  plan,
}: {
  activeCenters: BillingCenterOption[];
  canChangePlan: boolean;
  organizationId: string;
  overview: OrganizationBillingOverview;
  plan: BillingPlanVersion;
}) {
  const isCurrentPlan =
    overview.plan_code === plan.plan_code &&
    overview.plan_version === plan.version;
  const requiresCenterSelection =
    plan.center_limit !== null &&
    overview.active_centers_count > plan.center_limit;
  const storageLabel =
    plan.storage_gb === null ? "A medida" : `${formatPlanLimit(plan.storage_gb)} GB`;

  return (
    <Card size="sm">
      <CardContent className="grid gap-4">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold tracking-tight">
                {plan.display_name}
              </h3>
              {isCurrentPlan ? <Badge>Actual</Badge> : null}
              <Badge variant="outline">v{plan.version}</Badge>
            </div>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
              {plan.description}
            </p>
          </div>
          <div className="text-right">
            <p className="font-semibold">{formatPlanPrice(plan)}</p>
            <p className="mt-1 text-xs text-muted-foreground">sin IVA</p>
          </div>
        </div>

        <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-muted-foreground">Centros</dt>
            <dd className="mt-1 font-medium">
              {formatPlanLimit(plan.center_limit)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Equipo</dt>
            <dd className="mt-1 font-medium">
              {formatPlanLimit(plan.staff_seat_limit)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Clientes futuros</dt>
            <dd className="mt-1 font-medium">
              {formatPlanLimit(plan.future_client_limit)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Almacenamiento</dt>
            <dd className="mt-1 font-medium">{storageLabel}</dd>
          </div>
        </dl>

        <div className="grid gap-2 text-sm text-muted-foreground">
          <p>
            Setup: {formatCents(plan.setup_price_cents, "A medida")}
            {plan.setup_description ? ` - ${plan.setup_description}` : ""}
          </p>
          <p>{plan.support_level}</p>
        </div>

        {plan.features.length > 0 ? (
          <ul className="grid gap-1.5 text-sm text-muted-foreground sm:grid-cols-2">
            {plan.features.slice(0, 6).map((feature) => (
              <li className="flex min-w-0 items-start gap-2" key={feature}>
                <CheckCircle2
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 text-primary"
                />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        ) : null}

        {!canChangePlan ? (
          <p className="rounded-lg border border-border bg-muted/25 px-3 py-2 text-sm text-muted-foreground">
            Tu rol puede revisar planes, pero solo el propietario puede cambiar
            el plan de la organizacion.
          </p>
        ) : (
          <form action={changeTenantBillingPlanAction} className="grid gap-3">
            <input name="organizationId" type="hidden" value={organizationId} />
            <input name="planCode" type="hidden" value={plan.plan_code} />
            <input name="version" type="hidden" value={plan.version} />

            {requiresCenterSelection && plan.center_limit !== null ? (
              <DowngradeCenterSelector
                activeCenters={activeCenters}
                limit={plan.center_limit}
                planCode={plan.display_name}
              />
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <Button disabled={isCurrentPlan} type="submit">
                <ReceiptText aria-hidden="true" />
                {isCurrentPlan ? "Plan actual" : "Solicitar cambio manual"}
              </Button>
              <p className="text-xs leading-5 text-muted-foreground">
                El cambio queda manual hasta conectar el pago. El precio anual
                equivale a 10 meses.
              </p>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

function BillingLoadError() {
  return (
    <Alert variant="destructive">
      <AlertCircle aria-hidden="true" />
      <AlertTitle>No se pudo cargar la facturacion</AlertTitle>
      <AlertDescription>
        Revisa la base local o los permisos de la organizacion activa.
      </AlertDescription>
    </Alert>
  );
}

export default async function BillingSettingsPage({
  searchParams,
}: BillingSettingsPageProps) {
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect(getLoginPath("/app/settings/billing"));
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
          badge="Plan"
          description="Plan comercial, limites y uso de la organizacion."
          title="Plan y facturacion"
        />
        <OrganizationResolutionState
          basePath="/app/settings/billing"
          resolution={resolution}
        />
      </div>
    );
  }

  const roleLabel = getApplicationRoleLabel(resolution.membership.role);
  const canReadBilling = canReadTenantBilling(resolution.membership.role);
  const canChangePlan = resolution.membership.role === "owner";

  if (!canReadBilling) {
    return (
      <div className="space-y-6">
        <PageHeader
          badge="Plan"
          meta={
            <>
              <Badge variant="secondary">{resolution.organization.name}</Badge>
              <Badge variant="outline">{roleLabel}</Badge>
            </>
          }
          title="Plan y facturacion"
        />
        <Alert>
          <ShieldCheck aria-hidden="true" />
          <AlertTitle>Modo lectura no disponible</AlertTitle>
          <AlertDescription>
            Esta informacion comercial esta reservada al propietario de la
            organizacion y administradores autorizados.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const [overviewResult, plansResult, activeCentersResult] = await Promise.all([
    getOrganizationBillingOverview(resolution.organization.id),
    listPublishedBillingPlans(),
    listBillingActiveCenters(resolution.organization.id),
  ]);

  const overview = overviewResult.ok ? overviewResult.data : null;
  const plans = plansResult.ok ? sortPlans(plansResult.data) : [];
  const activeCenters = activeCentersResult.ok ? activeCentersResult.data : [];
  const centersPath = getCentersPath({
    organizationId: resolution.organization.id,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        badge="Plan"
        description="Founder pricing sin IVA, limites efectivos y cambios manuales mientras Stripe queda preparado para mas adelante."
        meta={
          <>
            <Badge variant="secondary">{resolution.organization.name}</Badge>
            <Badge variant="outline">{roleLabel}</Badge>
          </>
        }
        title="Plan y facturacion"
      />

      <BillingFeedback error={error} status={status} />

      {!overview || !plansResult.ok ? (
        <BillingLoadError />
      ) : (
        <>
          <section className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)]">
            <CurrentPlanCard overview={overview} />
            <UsageCard centersPath={centersPath} overview={overview} />
          </section>

          <section className="space-y-3">
            <SectionHeader
              action={
                <Badge variant="outline">
                  <Database aria-hidden="true" className="size-3" />
                  Catalogo versionado
                </Badge>
              }
              description="Cada cambio aplica un snapshot de precio y limites a esta organizacion. No se piden datos de tarjeta."
              title="Planes disponibles"
            />

            {activeCentersResult.ok ? null : (
              <Alert>
                <AlertCircle aria-hidden="true" />
                <AlertTitle>Seleccion de centros no disponible</AlertTitle>
                <AlertDescription>
                  Puedes revisar planes, pero un downgrade con menos centros
                  necesitara volver a cargar la lista de centros activos.
                </AlertDescription>
              </Alert>
            )}

            <div className="grid gap-3">
              {plans.map((plan) => (
                <PlanOptionCard
                  activeCenters={activeCenters}
                  canChangePlan={canChangePlan}
                  key={`${plan.plan_code}-${plan.version}`}
                  organizationId={resolution.organization.id}
                  overview={overview}
                  plan={plan}
                />
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
