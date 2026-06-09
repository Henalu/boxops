import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  Database,
  MapPin,
  ReceiptText,
  ShieldCheck,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

import { changeTenantBillingPlanAction } from "@/lib/billing-actions";
import {
  formatPlanLimit,
  formatPlanPrice,
  getOrganizationBillingOverview,
  getPlanAnnualDiscountPercent,
  listBillingActiveCenters,
  listPublishedBillingPlans,
  type BillingCenterOption,
  type BillingErrorCode,
  type BillingPlanVersion,
  type OrganizationBillingOverview,
} from "@/lib/billing";
import { PageHeader } from "@/components/features/operations-ui";
import { OrganizationResolutionState } from "@/components/features/organization-resolution-state";
import { TransientFeedbackBanner } from "@/components/features/transient-feedback-banner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { getAppPath, getCentersPath } from "@/lib/navigation/app-paths";
import { cn } from "@/lib/utils";

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
    "Plan actualizado. La organización ya usa el nuevo snapshot comercial.",
  "plan-changed-centers-deactivated":
    "Plan actualizado. Los centros no seleccionados han quedado inactivos.",
};

const errorMessages: Partial<Record<BillingErrorCode, string>> = {
  "authentication-required": "Inicia sesión para revisar el plan.",
  "billing-catalog-load-failed":
    "No se pudo cargar la información comercial de la organización.",
  "billing-change-forbidden": "Tu rol no permite cambiar el plan.",
  "billing-plan-not-found": "Ese plan ya no está disponible.",
  "billing-save-failed": "No se pudo guardar el cambio de plan.",
  "downgrade-selection-invalid":
    "La selección de centros no pertenece a esta organización.",
  "downgrade-selection-required":
    "El nuevo plan incluye menos centros activos. Elige cuales se mantienen activos.",
  forbidden: "Tu rol no permite ver la facturacion.",
  "invalid-input": "La solicitud no tiene datos válidos.",
  "invalid-plan-code": "El código de plan no es válido.",
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

function formatStorageLimit(value: number | null) {
  return value === null ? "A medida" : `${formatPlanLimit(value)} GB`;
}

function BillingPlansHero({
  organizationId,
  organizationName,
  roleLabel,
}: {
  organizationId: string;
  organizationName: string;
  roleLabel: string;
}) {
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav
          aria-label="Ruta"
          className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground"
        >
          <Link
            className="rounded-md outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
            href={getAppPath("/app", { organizationId })}
          >
            Inicio
          </Link>
          <ChevronRight aria-hidden="true" className="size-3.5 shrink-0" />
          <span className="min-w-0 truncate text-foreground">
            Plan y facturación
          </span>
        </nav>
        <Badge className="min-h-7 px-2.5" variant="outline">
          <ReceiptText aria-hidden="true" className="size-3.5" />
          Catalogo versionado
        </Badge>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold leading-tight">
            <span className="sr-only">Plan y facturación - </span>
            Planes disponibles
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            Cada cambio aplica un snapshot de precio y límites a esta
            organización. No se piden datos de tarjeta.
          </p>
        </div>
        <div className="flex min-w-0 flex-wrap gap-2">
          <Badge variant="secondary">{organizationName}</Badge>
          <Badge variant="outline">{roleLabel}</Badge>
        </div>
      </div>
    </section>
  );
}

function PlanLimitMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="grid min-w-0 justify-items-center gap-1 text-center">
      <Icon aria-hidden="true" className="size-4 text-muted-foreground" />
      <p className="max-w-full truncate font-semibold">{value}</p>
      <p className="max-w-full truncate text-xs text-muted-foreground">
        {label}
      </p>
    </div>
  );
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
  const percent =
    typeof used === "number" && typeof limit === "number" && limit > 0
      ? Math.min(100, Math.round((used / limit) * 100))
      : null;

  return (
    <div className="grid gap-2 rounded-lg border border-border bg-muted/20 p-3">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">{label}</p>
        <p className="font-mono text-sm">
          {used === null ? "Pendiente" : formatUsage(used)} /{" "}
          {formatPlanLimit(limit)}
        </p>
      </div>
      {percent !== null ? (
        <div
          aria-label={`${label}: ${percent}% usado`}
          className="h-1.5 overflow-hidden rounded-full bg-muted"
          role="meter"
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={percent}
        >
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${percent}%` }}
          />
        </div>
      ) : null}
      {description ? (
        <p className="text-xs leading-5 text-muted-foreground">
          {description}
        </p>
      ) : null}
    </div>
  );
}

function CurrentPlanPanel({
  overview,
}: {
  overview: OrganizationBillingOverview;
}) {
  const annualDiscountPercent = getPlanAnnualDiscountPercent(overview);

  return (
    <article className="rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <CreditCard aria-hidden="true" className="size-4" />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">Plan actual</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Snapshot efectivo de precio y límites. Si el catálogo cambia,
              esta organización conserva estos valores hasta cambiar de plan.
            </p>
          </div>
        </div>
        <Badge variant={getStatusVariant(overview.subscription_status)}>
          {subscriptionStatusLabels[overview.subscription_status] ??
            overview.subscription_status}
        </Badge>
      </div>

      <div className="mt-5 min-w-0">
        <h3 className="truncate text-xl font-semibold">
          {overview.display_name}
        </h3>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          {overview.description}
        </p>
      </div>

      <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
        <div className="min-w-0 rounded-lg bg-muted/30 p-3">
          <dt className="text-muted-foreground">Precio</dt>
          <dd className="mt-1 font-medium">{formatPlanPrice(overview)}</dd>
          {annualDiscountPercent ? (
            <dd className="mt-1 text-xs text-primary">
              Ahorro anual {annualDiscountPercent}%
            </dd>
          ) : null}
        </div>
        <div className="min-w-0 rounded-lg bg-muted/30 p-3">
          <dt className="text-muted-foreground">Version</dt>
          <dd className="mt-1 font-mono text-xs">
            {overview.plan_version ?? "legacy"}
          </dd>
        </div>
        <div className="min-w-0 rounded-lg bg-muted/30 p-3">
          <dt className="text-muted-foreground">Setup</dt>
          <dd className="mt-1 font-medium">
            {formatCents(overview.setup_price_cents, "A medida")}
          </dd>
        </div>
        <div className="min-w-0 rounded-lg bg-muted/30 p-3">
          <dt className="text-muted-foreground">Soporte</dt>
          <dd className="mt-1 font-medium">
            {overview.support_level ?? "Manual"}
          </dd>
        </div>
      </dl>

      <p className="mt-4 text-xs leading-5 text-muted-foreground">
        Precios founder sin IVA. El pago se conectara mas adelante; no hay
        datos bancarios ni cobro real en este corte.
      </p>
    </article>
  );
}

function UsagePanel({
  centersPath,
  overview,
}: {
  centersPath: string;
  overview: OrganizationBillingOverview;
}) {
  return (
    <article className="rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <MapPin aria-hidden="true" className="size-4" />
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">Uso y límites</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Los centros activos ya se aplican al crear nuevos centros. El resto
            de límites queda preparado como contrato comercial.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-3">
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
      </div>
    </article>
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
            seleccionados pasarán a inactivos: no admitirán nueva operativa ni
            reservas futuras, pero conservarán histórico, horarios,
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

function DowngradePlanRequestDisclosure({
  activeCenters,
  featured,
  limit,
  planCode,
}: {
  activeCenters: BillingCenterOption[];
  featured: boolean;
  limit: number;
  planCode: string;
}) {
  return (
    <details className="group grid gap-3">
      <summary className="list-none rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
        <span
          className={cn(
            buttonVariants({
              className: "w-full cursor-pointer",
              variant: featured ? "default" : "outline",
            }),
          )}
        >
          <ReceiptText aria-hidden="true" />
          Solicitar cambio manual
        </span>
      </summary>

      <div className="grid gap-3 pt-3">
        <DowngradeCenterSelector
          activeCenters={activeCenters}
          limit={limit}
          planCode={planCode}
        />
        <Button className="w-full" type="submit">
          <ReceiptText aria-hidden="true" />
          Confirmar cambio manual
        </Button>
      </div>
    </details>
  );
}

function PlanOptionCard({
  activeCenters,
  canChangePlan,
  featured,
  organizationId,
  overview,
  plan,
}: {
  activeCenters: BillingCenterOption[];
  canChangePlan: boolean;
  featured: boolean;
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
  const isCustomPrice = plan.monthly_price_cents === null;
  const monthlyPrice = formatCents(plan.monthly_price_cents);
  const annualPrice =
    plan.annual_price_cents === null
      ? null
      : formatCents(plan.annual_price_cents);
  const annualDiscountPercent = getPlanAnnualDiscountPercent(plan);

  return (
    <article
      className={cn(
        "flex h-full flex-col rounded-xl border bg-card p-4 text-card-foreground shadow-sm",
        "transition-colors hover:border-primary/35 sm:p-5",
        featured || isCurrentPlan
          ? "border-primary/45 ring-1 ring-primary/25"
          : "border-border",
      )}
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {featured ? (
              <Badge className="bg-primary/10 text-primary" variant="secondary">
                Más popular
              </Badge>
            ) : null}
            {isCurrentPlan ? <Badge>Actual</Badge> : null}
            <Badge variant="outline">v{plan.version}</Badge>
          </div>
          <div className="min-w-0">
            <h3 className="text-xl font-semibold">{plan.display_name}</h3>
            <p className="mt-2 min-h-12 text-sm leading-6 text-muted-foreground">
              {plan.description}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-6">
        {isCustomPrice ? (
          <p className="text-3xl font-semibold">A medida</p>
        ) : (
          <p className="flex flex-wrap items-baseline gap-2">
            <span className="text-3xl font-semibold">{monthlyPrice}</span>
            <span className="text-lg text-muted-foreground">/mes</span>
          </p>
        )}
        <p className="mt-2 text-sm font-medium">
          {annualPrice ? `o ${annualPrice}/año` : "Contrato manual"}
          <Badge className="ml-2 align-middle" variant="secondary">
            sin IVA
          </Badge>
        </p>
        {annualDiscountPercent ? (
          <p className="mt-1 text-sm font-medium text-primary">
            Ahorro anual {annualDiscountPercent}%
          </p>
        ) : null}
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 border-y border-border py-4 text-sm sm:grid-cols-4">
        <PlanLimitMetric
          icon={MapPin}
          label="Centros"
          value={formatPlanLimit(plan.center_limit)}
        />
        <PlanLimitMetric
          icon={UsersRound}
          label="Equipo"
          value={formatPlanLimit(plan.staff_seat_limit)}
        />
        <PlanLimitMetric
          icon={ShieldCheck}
          label="Clientes futuros"
          value={formatPlanLimit(plan.future_client_limit)}
        />
        <PlanLimitMetric
          icon={Database}
          label="Almacenamiento"
          value={formatStorageLimit(plan.storage_gb)}
        />
      </div>

      <div className="mt-5 grid gap-2 text-sm text-muted-foreground">
        <p>
          Setup: {formatCents(plan.setup_price_cents, "A medida")}
          {plan.setup_description ? ` - ${plan.setup_description}` : ""}
        </p>
        <p>{plan.support_level}</p>
      </div>

      {plan.features.length > 0 ? (
        <ul className="mt-5 grid gap-2 text-sm text-muted-foreground">
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

      <div className="mt-auto pt-6">
        {!canChangePlan ? (
          <Button className="w-full" disabled variant="outline">
            <ReceiptText aria-hidden="true" />
            Solo propietario
          </Button>
        ) : (
          <form action={changeTenantBillingPlanAction} className="grid gap-3">
            <input name="organizationId" type="hidden" value={organizationId} />
            <input name="planCode" type="hidden" value={plan.plan_code} />
            <input name="version" type="hidden" value={plan.version} />

            {isCurrentPlan ? (
              <Button className="w-full" disabled type="submit">
                <ReceiptText aria-hidden="true" />
                Plan actual
              </Button>
            ) : requiresCenterSelection && plan.center_limit !== null ? (
              <DowngradePlanRequestDisclosure
                activeCenters={activeCenters}
                featured={featured}
                limit={plan.center_limit}
                planCode={plan.display_name}
              />
            ) : (
              <Button
                className="w-full"
                type="submit"
                variant={featured ? "default" : "outline"}
              >
                <ReceiptText aria-hidden="true" />
                Solicitar cambio manual
              </Button>
            )}
          </form>
        )}
        <p className="mt-3 text-center text-xs leading-5 text-muted-foreground">
          El cambio queda manual hasta conectar el pago. El ahorro anual se
          conserva en el snapshot contratado.
        </p>
      </div>
    </article>
  );
}

function PlanGuidanceCard() {
  return (
    <section className="rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ShieldCheck aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold">
              No sabes que plan elegir?
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Compara los planes en detalle o contacta con nuestro equipo para
              asesorarte.
            </p>
          </div>
        </div>
        <Button asChild className="w-full sm:w-auto" variant="outline">
          <a href="#plan-comparison">
            Ver comparacion
            <ArrowRight aria-hidden="true" />
          </a>
        </Button>
      </div>
    </section>
  );
}

function PlanComparisonSection({
  overview,
  plans,
}: {
  overview: OrganizationBillingOverview;
  plans: BillingPlanVersion[];
}) {
  return (
    <section className="scroll-mt-24 space-y-3" id="plan-comparison">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">Comparacion de planes</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Límites publicados del catálogo. El plan actual conserva su
            snapshot hasta que se solicita otro cambio.
          </p>
        </div>
        <Badge variant="secondary">Actual: {overview.display_name}</Badge>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Plan</TableHead>
              <TableHead>Precio</TableHead>
              <TableHead>Centros</TableHead>
              <TableHead>Equipo</TableHead>
              <TableHead>Clientes futuros</TableHead>
              <TableHead>Storage</TableHead>
              <TableHead>Soporte</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {plans.map((plan) => {
              const isCurrentPlan =
                overview.plan_code === plan.plan_code &&
                overview.plan_version === plan.version;

              return (
                <TableRow key={`${plan.plan_code}-${plan.version}`}>
                  <TableCell className="font-medium">
                    <span className="inline-flex min-w-0 items-center gap-2">
                      <span>{plan.display_name}</span>
                      {isCurrentPlan ? <Badge>Actual</Badge> : null}
                    </span>
                  </TableCell>
                  <TableCell>{formatPlanPrice(plan)}</TableCell>
                  <TableCell>{formatPlanLimit(plan.center_limit)}</TableCell>
                  <TableCell>
                    {formatPlanLimit(plan.staff_seat_limit)}
                  </TableCell>
                  <TableCell>
                    {formatPlanLimit(plan.future_client_limit)}
                  </TableCell>
                  <TableCell>{formatStorageLimit(plan.storage_gb)}</TableCell>
                  <TableCell>{plan.support_level}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

function BillingSummarySection({
  centersPath,
  overview,
}: {
  centersPath: string;
  overview: OrganizationBillingOverview;
}) {
  return (
    <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(340px,0.82fr)]">
      <CurrentPlanPanel overview={overview} />
      <UsagePanel centersPath={centersPath} overview={overview} />
    </section>
  );
}

function BillingLoadError() {
  return (
    <Alert variant="destructive">
      <AlertCircle aria-hidden="true" />
      <AlertTitle>No se pudo cargar la facturacion</AlertTitle>
      <AlertDescription>
        Revisa la base local o los permisos de la organización activa.
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
          description="Plan comercial, límites y uso de la organización."
          title="Plan y facturación"
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
          title="Plan y facturación"
        />
        <Alert>
          <ShieldCheck aria-hidden="true" />
          <AlertTitle>Modo lectura no disponible</AlertTitle>
          <AlertDescription>
            Esta información comercial está reservada al propietario de la
            organización y administradores autorizados.
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
  const featuredPlanCode = plans.some((plan) => plan.plan_code === "starter")
    ? "starter"
    : plans[0]?.plan_code;

  return (
    <div className="space-y-6">
      <BillingPlansHero
        organizationId={resolution.organization.id}
        organizationName={resolution.organization.name}
        roleLabel={roleLabel}
      />

      <BillingFeedback error={error} status={status} />

      {!overview || !plansResult.ok ? (
        <BillingLoadError />
      ) : (
        <>
          <section className="space-y-3">
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

            {plans.length === 0 ? (
              <Alert>
                <ReceiptText aria-hidden="true" />
                <AlertTitle>Catalogo sin planes publicados</AlertTitle>
                <AlertDescription>
                  Publica una versión desde Console para mostrar opciones de
                  cambio a la organización.
                </AlertDescription>
              </Alert>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {plans.map((plan) => (
                <PlanOptionCard
                  activeCenters={activeCenters}
                  canChangePlan={canChangePlan}
                  featured={plan.plan_code === featuredPlanCode}
                  key={`${plan.plan_code}-${plan.version}`}
                  organizationId={resolution.organization.id}
                  overview={overview}
                  plan={plan}
                />
              ))}
            </div>
          </section>

          {plans.length > 0 ? (
            <>
              <PlanGuidanceCard />
              <PlanComparisonSection overview={overview} plans={plans} />
            </>
          ) : null}
          <BillingSummarySection centersPath={centersPath} overview={overview} />
        </>
      )}
    </div>
  );
}
