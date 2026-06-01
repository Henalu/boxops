import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  CreditCard,
  Database,
  LifeBuoy,
  LockKeyhole,
  MapPin,
  ShieldOff,
  ShieldCheck,
  UserCog,
  UsersRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import {
  createPlatformSupportSessionAction,
  updatePlatformOrganizationAccessAction,
} from "@/lib/platform-console-actions";
import { assignConsoleOrganizationBillingPlanAction } from "@/lib/billing-actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { TransientFeedbackBanner } from "@/components/features/transient-feedback-banner";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getLoginPath } from "@/lib/auth/redirects";
import {
  formatPlanLimit,
  formatPlanPrice,
  getOrganizationBillingOverview,
  listBillingActiveCenters,
  listPublishedBillingPlans,
  sortBillingPlansByPrice,
  type BillingCenterOption,
  type BillingErrorCode,
  type BillingPlanVersion,
  type OrganizationBillingOverview,
} from "@/lib/billing";
import {
  getActivePlatformAdmin,
  getPlatformOrganizationReview,
  type PlatformConsoleErrorCode,
  type PlatformOrganizationSummary,
  type PlatformRole,
} from "@/lib/platform-console";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Revision de organizacion - BoxOps Console",
};

type OrganizationReviewPageProps = {
  params: Promise<{
    organizationId: string;
  }>;
  searchParams: Promise<{
    error?: string | string[];
    status?: string | string[];
  }>;
};

const consoleRoleLabels: Record<PlatformRole, string> = {
  billing: "Facturacion",
  platform_owner: "Propietario de plataforma",
  support: "Soporte",
  viewer: "Lectura",
};

const organizationStatusLabels: Record<string, string> = {
  active: "Activa",
  inactive: "Inactiva",
  suspended: "Suspendida",
  trialing: "Prueba",
};

const subscriptionStatusLabels: Record<string, string> = {
  active: "Activa",
  cancelled: "Cancelada",
  manual: "Manual",
  past_due: "Con incidencia",
  paused: "Pausada",
  trialing: "Prueba",
};

const billingErrorCopy: Partial<Record<BillingErrorCode, string>> = {
  "authentication-required": "Inicia sesion para abrir Console.",
  "billing-catalog-load-failed":
    "No se pudo cargar el catalogo comercial.",
  "billing-change-forbidden":
    "Tu rol puede revisar la facturacion, pero no cambiar planes.",
  "billing-plan-not-found": "Ese plan ya no esta publicado.",
  "billing-save-failed":
    "No se pudo guardar el cambio de plan. Revisa la seleccion e intentalo otra vez.",
  "downgrade-selection-invalid":
    "La seleccion de centros no pertenece a esta organizacion.",
  "downgrade-selection-required":
    "El nuevo plan permite menos centros. Elige cuales siguen activos.",
  "invalid-input": "Revisa la seleccion enviada.",
  "invalid-plan-code": "El codigo de plan no es valido.",
};

const reviewErrorCopy: Partial<Record<PlatformConsoleErrorCode, string>> = {
  "access-change-confirmation-required":
    "Marca la confirmacion para suspender el acceso. Es una accion deliberada.",
  "authentication-required": "Inicia sesion para abrir Console.",
  forbidden: "Tu cuenta no tiene acceso activo a Console.",
  "invalid-input": "La organizacion solicitada no tiene un identificador valido.",
  "invalid-duration": "Elige una duracion valida para la sesion de soporte.",
  "load-failed":
    "No se pudo cargar la revision de esta organizacion.",
  "invalid-organization-status":
    "El estado actual no permite ese cambio de acceso.",
  "invalid-reason":
    "Indica un motivo breve, sin enlaces, tokens ni datos sensibles.",
  "organization-not-found":
    "No encontramos esa organizacion en Console.",
  "permission-denied": "Tu rol de Console no permite esta accion.",
  "save-failed":
    "No se pudo guardar el cambio. Revisa el estado y vuelve a intentarlo.",
  "support-session-confirmation-required":
    "Confirma que el soporte temporal no crea accesos permanentes.",
  "support-session-not-found":
    "La sesion de soporte ya no esta activa.",
  "support-session-start-failed":
    "No se pudo abrir la sesion de soporte. La organizacion no se ha modificado.",
};

const reviewSuccessMessages: Record<string, string> = {
  "organization-activated":
    "Acceso reactivado. Los usuarios activos pueden volver a entrar.",
  "organization-suspended":
    "Acceso suspendido. La organizacion queda fuera de la app hasta reactivarla.",
  "plan-changed":
    "Plan manual actualizado. La organizacion conserva el snapshot aplicado.",
  "plan-changed-centers-deactivated":
    "Plan manual actualizado. Los centros no seleccionados han quedado inactivos.",
  "support-session-ended":
    "Sesion de soporte cerrada. La auditoria queda guardada.",
};

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function isReviewErrorCode(
  value: string | undefined,
): value is PlatformConsoleErrorCode {
  return Boolean(value && value in reviewErrorCopy);
}

function isBillingErrorCode(
  value: string | undefined,
): value is BillingErrorCode {
  return Boolean(value && value in billingErrorCopy);
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "Sin fecha";
  }

  try {
    return new Intl.DateTimeFormat("es-ES", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Europe/Madrid",
    }).format(new Date(value));
  } catch {
    return "Fecha no disponible";
  }
}

function formatPlan(planCode: string) {
  return (
    planCode
      .split("-")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ") || "Manual"
  );
}

function formatLimit(value: number | null) {
  return value === null
    ? "Sin limite"
    : new Intl.NumberFormat("es-ES").format(value);
}

function getStatusVariant(status: string) {
  if (status === "active") {
    return "secondary" as const;
  }

  if (status === "suspended" || status === "cancelled" || status === "past_due") {
    return "destructive" as const;
  }

  return "outline" as const;
}

function shortId(value: string) {
  return value.slice(0, 8);
}

function OrganizationReviewBreadcrumb() {
  return (
    <nav
      aria-label="Miga de pan"
      className="flex min-w-0 flex-wrap items-center gap-2 text-sm text-muted-foreground"
    >
      <Link
        className="inline-flex min-w-0 items-center gap-1.5 rounded-md font-medium text-primary outline-none transition-colors hover:text-primary/80 focus-visible:ring-3 focus-visible:ring-ring/50"
        href="/console"
      >
        <ArrowLeft aria-hidden="true" className="size-3.5 shrink-0" />
        Console
      </Link>
      <ChevronRight aria-hidden="true" className="size-3.5 shrink-0" />
      <span className="truncate text-foreground">Revision de organizacion</span>
    </nav>
  );
}

function ReviewMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
}) {
  return (
    <Card className="shadow-xs" size="sm">
      <CardContent>
        <div className="flex min-w-0 items-center gap-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">
              {new Intl.NumberFormat("es-ES").format(value)}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ReviewErrorState({ error }: { error: PlatformConsoleErrorCode }) {
  return (
    <div className="space-y-4">
      <Button asChild variant="outline">
        <Link href="/console">
          <ArrowLeft aria-hidden="true" />
          Volver a Console
        </Link>
      </Button>
      <Alert variant="destructive">
        <AlertCircle aria-hidden="true" />
        <AlertTitle>No se puede abrir la revision</AlertTitle>
        <AlertDescription>
          {reviewErrorCopy[error] ?? reviewErrorCopy["load-failed"]}
        </AlertDescription>
      </Alert>
    </div>
  );
}

function ReviewFeedbackState({
  error,
  status,
}: {
  error?: string;
  status?: string;
}) {
  if (error && isBillingErrorCode(error)) {
    return (
      <TransientFeedbackBanner
        description={billingErrorCopy[error]}
        title="No se pudo cambiar el plan"
        tone="error"
      />
    );
  }

  if (error && isReviewErrorCode(error)) {
    return (
      <TransientFeedbackBanner
        description={reviewErrorCopy[error] ?? reviewErrorCopy["load-failed"]}
        title="No se pudo aplicar el cambio"
        tone="error"
      />
    );
  }

  if (status && reviewSuccessMessages[status]) {
    return (
      <TransientFeedbackBanner
        description={reviewSuccessMessages[status]}
        title="Cambio guardado"
        tone="success"
      />
    );
  }

  return null;
}

function OrganizationReviewHeader({
  role,
  summary,
}: {
  role: PlatformRole;
  summary: PlatformOrganizationSummary;
}) {
  return (
    <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(300px,360px)] lg:items-end">
      <div className="min-w-0">
        <OrganizationReviewBreadcrumb />
        <Badge className="mb-3 mt-6" variant="secondary">
          Revision de organizacion
        </Badge>
        <h1 className="truncate text-3xl font-semibold tracking-tight sm:text-4xl">
          {summary.organization_name}
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
          Revisa estado, uso, plan y soporte sin convertirte en miembro del
          tenant.
        </p>
      </div>

      <Card className="shadow-xs" size="sm">
        <CardContent>
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <ShieldCheck aria-hidden="true" className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="text-base font-semibold tracking-tight">
                Revision actual
              </p>
              <p className="mt-1 truncate text-sm text-muted-foreground">
                ID {shortId(summary.organization_id)}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge>{consoleRoleLabels[role]}</Badge>
                <Badge variant={getStatusVariant(summary.organization_status)}>
                  {organizationStatusLabels[summary.organization_status] ??
                    summary.organization_status}
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function OrganizationAccessControlCard({
  isPlatformOwner,
  summary,
}: {
  isPlatformOwner: boolean;
  summary: PlatformOrganizationSummary;
}) {
  const status = summary.organization_status;
  const tenantAccessAllowed = status === "trialing" || status === "active";
  const tenantAccessBlocked = status === "suspended" || status === "inactive";
  const reasonId = `access-reason-${summary.organization_id}`;
  const confirmationId = `access-confirmation-${summary.organization_id}`;

  return (
    <Card className="shadow-xs">
      <CardHeader className="gap-4 sm:flex sm:flex-row sm:items-start">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <ShieldCheck aria-hidden="true" className="size-5" />
        </span>
        <div className="min-w-0">
          <CardTitle>Acceso de la organizacion</CardTitle>
          <CardDescription>
            Gestiona si los usuarios activos de esta organizacion pueden
            entrar en BoxOps.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          className={cn(
            "grid gap-3 rounded-xl border p-4 sm:grid-cols-[auto_1fr]",
            tenantAccessAllowed
              ? "border-primary/30 bg-primary/5"
              : "border-destructive/30 bg-destructive/5",
          )}
        >
          <span
            className={cn(
              "flex size-11 shrink-0 items-center justify-center rounded-xl",
              tenantAccessAllowed
                ? "bg-primary/10 text-primary"
                : "bg-destructive/10 text-destructive",
            )}
          >
            {tenantAccessAllowed ? (
              <ShieldCheck aria-hidden="true" className="size-5" />
            ) : (
              <LockKeyhole aria-hidden="true" className="size-5" />
            )}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-muted-foreground">
              Estado actual
            </p>
            <p className="mt-1 text-lg font-semibold tracking-tight">
              {tenantAccessAllowed ? "Acceso abierto" : "Acceso bloqueado"}
            </p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {tenantAccessAllowed
                ? "Prueba y Activa permiten entrar en la app diaria del tenant."
                : "La organizacion queda fuera de la app hasta que se reactive."}
            </p>
          </div>
        </div>

        {!isPlatformOwner ? (
          <p className="rounded-lg border border-border bg-muted/35 px-3 py-2 text-sm text-muted-foreground">
            Solo un propietario de plataforma puede cambiar el acceso. Tu rol
            puede revisar el estado.
          </p>
        ) : null}

        {isPlatformOwner && (tenantAccessAllowed || tenantAccessBlocked) ? (
          <form
            action={updatePlatformOrganizationAccessAction}
            className="grid gap-4"
          >
            <input
              name="organizationId"
              type="hidden"
              value={summary.organization_id}
            />
            <input
              name="accessAction"
              type="hidden"
              value={tenantAccessAllowed ? "suspend" : "activate"}
            />

            <div className="grid gap-2">
              <p className="text-sm font-medium">Cambiar estado de acceso</p>
              <div className="grid gap-3 md:grid-cols-2">
                <div
                  className={cn(
                    "flex min-w-0 items-start gap-3 rounded-xl border p-3 text-sm",
                    tenantAccessAllowed
                      ? "border-primary/50 bg-primary/5"
                      : "border-border bg-muted/20",
                  )}
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <ShieldCheck aria-hidden="true" className="size-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-medium">
                      {tenantAccessAllowed ? "Actual: abierto" : "Abrir acceso"}
                    </span>
                    <span className="mt-1 block text-muted-foreground">
                      Usuarios activos pueden entrar.
                    </span>
                  </span>
                </div>
                <div
                  className={cn(
                    "flex min-w-0 items-start gap-3 rounded-xl border p-3 text-sm",
                    tenantAccessAllowed
                      ? "border-border bg-muted/20"
                      : "border-destructive/40 bg-destructive/5",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-lg",
                      tenantAccessAllowed
                        ? "bg-muted text-muted-foreground"
                        : "bg-destructive/10 text-destructive",
                    )}
                  >
                    <LockKeyhole aria-hidden="true" className="size-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-medium">
                      {tenantAccessAllowed
                        ? "Suspender acceso"
                        : "Actual: suspendido"}
                    </span>
                    <span className="mt-1 block text-muted-foreground">
                      Nadie podra entrar hasta que se reactive.
                    </span>
                  </span>
                </div>
              </div>

              <Label htmlFor={reasonId}>Motivo del cambio</Label>
              <Textarea
                id={reasonId}
                maxLength={160}
                minLength={8}
                name="reason"
                placeholder={
                  tenantAccessAllowed
                    ? "Ej. Pausa acordada con la organizacion."
                    : "Ej. Revision completada; acceso aprobado."
                }
                required
                rows={3}
              />
              <p className="text-xs leading-5 text-muted-foreground">
                Deja una nota operativa breve. Evita enlaces, tokens y datos
                sensibles.
              </p>
            </div>

            {tenantAccessAllowed ? (
              <label
                className="flex gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm"
                htmlFor={confirmationId}
              >
                <input
                  className="mt-1 size-4 shrink-0 accent-destructive"
                  id={confirmationId}
                  name="confirmOrganizationAccessChange"
                  required
                  type="checkbox"
                  value="1"
                />
                <span className="min-w-0">
                  <span className="block font-medium text-destructive">
                    Confirmo la suspension
                  </span>
                  <span className="mt-1 block text-muted-foreground">
                    La organizacion no podra entrar hasta que se reactive
                    desde Console.
                  </span>
                  </span>
                </label>
            ) : null}

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button
                className="w-full sm:w-fit"
                type="submit"
                variant={tenantAccessAllowed ? "destructive" : "default"}
              >
                {tenantAccessAllowed ? (
                  <>
                    <ShieldOff aria-hidden="true" />
                    Suspender acceso
                  </>
                ) : (
                  <>
                    <ShieldCheck aria-hidden="true" />
                    Reactivar acceso
                  </>
                )}
              </Button>
              <span className="text-xs leading-5 text-muted-foreground">
                No borra datos ni cambia usuarios.
              </span>
            </div>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
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

function CommercialFactItem({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 items-start gap-2 text-sm">
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
      <span className="min-w-0">
        <span className="block text-muted-foreground">{label}</span>
        <span className="mt-1 block truncate font-medium">{value}</span>
      </span>
    </div>
  );
}

function CommercialUsageItem({
  icon: Icon,
  label,
  limit,
  used,
}: {
  icon: LucideIcon;
  label: string;
  limit: number | null;
  used: number | null;
}) {
  return (
    <div className="flex min-w-0 items-start gap-3 rounded-lg border border-border bg-background/70 p-3">
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-sm font-medium">
          {used === null ? "Pendiente" : formatLimit(used)} /{" "}
          {formatPlanLimit(limit)}
        </p>
      </div>
    </div>
  );
}

function ConsoleDowngradeSelector({
  activeCenters,
  limit,
}: {
  activeCenters: BillingCenterOption[];
  limit: number;
}) {
  return (
    <div className="grid gap-2 rounded-lg border border-orange-300/60 bg-orange-50 p-3 text-orange-950">
      <p className="text-sm font-medium">
        Elige los centros que siguen activos
      </p>
      <p className="text-xs leading-5 text-orange-900/85">
        Este plan permite {formatPlanLimit(limit)}. Los centros no
        seleccionados pasan a inactivos: conservan historico, horarios,
        asignaciones y documentos vinculados.
      </p>
      <div className="grid gap-2">
        {activeCenters.map((center) => (
          <label
            className="flex min-w-0 items-start gap-2 rounded-lg border border-orange-200 bg-background/85 p-2 text-sm"
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
    </div>
  );
}

function ConsolePlanAssignmentRow({
  activeCenters,
  organizationId,
  overview,
  plan,
}: {
  activeCenters: BillingCenterOption[];
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

  return (
    <form
      action={assignConsoleOrganizationBillingPlanAction}
      className={cn(
        "grid gap-3 rounded-lg border p-3 transition-colors",
        isCurrentPlan || requiresCenterSelection
          ? "border-primary/50 bg-primary/5"
          : "border-border bg-background/70",
      )}
    >
      <input name="organizationId" type="hidden" value={organizationId} />
      <input name="planCode" type="hidden" value={plan.plan_code} />
      <input name="version" type="hidden" value={plan.version} />

      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{plan.display_name}</p>
            <Badge variant="outline">v{plan.version}</Badge>
            {isCurrentPlan ? <Badge>Actual</Badge> : null}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatPlanLimit(plan.center_limit)} centros /{" "}
            {formatPlanLimit(plan.staff_seat_limit)} personas del equipo
          </p>
        </div>
        <p className="text-sm font-medium sm:text-right">
          {formatPlanPrice(plan)}
        </p>
      </div>

      {requiresCenterSelection && plan.center_limit !== null ? (
        <ConsoleDowngradeSelector
          activeCenters={activeCenters}
          limit={plan.center_limit}
        />
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
        <Button disabled={isCurrentPlan} size="sm" type="submit">
          <CreditCard aria-hidden="true" />
          {isCurrentPlan ? "Asignado" : "Asignar manualmente"}
        </Button>
        <span className="text-xs text-muted-foreground">
          Aplica snapshot comercial; no cobra ni abre portal de pago.
        </span>
      </div>
    </form>
  );
}

function OrganizationCommercialCard({
  activeCenters,
  billingOverview,
  billingPlans,
  canManageBilling,
  canReadBilling,
  summary,
}: {
  activeCenters: BillingCenterOption[];
  billingOverview: OrganizationBillingOverview | null;
  billingPlans: BillingPlanVersion[];
  canManageBilling: boolean;
  canReadBilling: boolean;
  summary: PlatformOrganizationSummary;
}) {
  if (!canReadBilling || !billingOverview) {
    return (
      <Card className="shadow-xs">
        <CardHeader className="gap-4 sm:flex sm:flex-row sm:items-start">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <CreditCard aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0">
            <CardTitle>Suscripcion manual</CardTitle>
            <CardDescription>
              Resumen comercial basico visible desde Console.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div className="min-w-0">
              <dt className="text-muted-foreground">Plan</dt>
              <dd className="mt-1 font-medium">
                {formatPlan(summary.plan_code)}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-muted-foreground">Estado comercial</dt>
              <dd className="mt-1">
                <Badge variant={getStatusVariant(summary.subscription_status)}>
                  {subscriptionStatusLabels[summary.subscription_status] ??
                    summary.subscription_status}
                </Badge>
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-muted-foreground">Limite usuarios</dt>
              <dd className="mt-1 font-medium">
                {formatLimit(summary.seat_limit)}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-muted-foreground">Limite centros</dt>
              <dd className="mt-1 font-medium">
                {formatLimit(summary.center_limit)}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    );
  }

  return (
    <section className="space-y-4">
      <Card className="shadow-xs">
        <CardHeader className="gap-4 sm:flex sm:flex-row sm:items-start">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <CreditCard aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0">
            <CardTitle>Plan y suscripcion</CardTitle>
            <CardDescription>
              Snapshot comercial aplicado a esta organizacion. Cambiar el
              catalogo no altera este contrato hasta asignar otro plan.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-lg font-semibold">
                {billingOverview.display_name}
              </h3>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {billingOverview.description}
              </p>
            </div>
            <Badge variant={getStatusVariant(billingOverview.subscription_status)}>
              {subscriptionStatusLabels[billingOverview.subscription_status] ??
                billingOverview.subscription_status}
            </Badge>
          </div>

          <div className="grid gap-4 border-y border-border py-4 sm:grid-cols-2 lg:grid-cols-4">
            <CommercialFactItem
              icon={CreditCard}
              label="Precio"
              value={formatPlanPrice(billingOverview)}
            />
            <CommercialFactItem
              icon={CreditCard}
              label="Setup"
              value={formatCents(billingOverview.setup_price_cents)}
            />
            <CommercialFactItem
              icon={Clock3}
              label="Version"
              value={
                billingOverview.plan_version === null
                  ? "Legacy"
                  : `v${billingOverview.plan_version}`
              }
            />
            <CommercialFactItem
              icon={LifeBuoy}
              label="Soporte"
              value={billingOverview.support_level ?? "Manual"}
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <CommercialUsageItem
              icon={Building2}
              label="Centros activos"
              limit={billingOverview.effective_center_limit}
              used={billingOverview.active_centers_count}
            />
            <CommercialUsageItem
              icon={UsersRound}
              label="Personas activas"
              limit={billingOverview.effective_staff_seat_limit}
              used={billingOverview.active_staff_count}
            />
            <CommercialUsageItem
              icon={UserCog}
              label="Clientes futuros"
              limit={billingOverview.future_client_limit}
              used={0}
            />
            <CommercialUsageItem
              icon={Database}
              label="Storage"
              limit={billingOverview.storage_gb}
              used={billingOverview.storage_used_gb}
            />
          </div>
        </CardContent>
      </Card>

      <details
        className="group rounded-xl border border-border bg-card text-card-foreground shadow-xs"
        open={canManageBilling}
      >
        <summary className="flex cursor-pointer list-none items-start justify-between gap-4 px-4 py-4 outline-none transition-colors hover:bg-muted/45 focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
          <div className="min-w-0">
            <h3 className="font-semibold tracking-tight">
              Cambiar plan manual
            </h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Si el nuevo limite de centros es menor, primero eliges cuales
              siguen activos.
            </p>
          </div>
          <span
            aria-hidden="true"
            className={cn(
              buttonVariants({ size: "sm", variant: "outline" }),
              "shrink-0 px-2.5",
            )}
          >
            <span className="group-open:hidden">Abrir</span>
            <span className="hidden group-open:inline">Cerrar</span>
            <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" />
          </span>
        </summary>
        <div className="grid gap-3 border-t border-border p-4">
          {!canManageBilling ? (
            <p className="rounded-lg border border-border bg-muted/25 px-3 py-2 text-sm text-muted-foreground">
              Solo platform_owner puede asignar planes; tu rol queda en
              lectura.
            </p>
          ) : null}

          {billingPlans.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No hay planes publicados para asignar.
            </p>
          ) : (
            billingPlans.map((plan) =>
              canManageBilling ? (
                <ConsolePlanAssignmentRow
                  activeCenters={activeCenters}
                  key={`${plan.plan_code}-${plan.version}`}
                  organizationId={summary.organization_id}
                  overview={billingOverview}
                  plan={plan}
                />
              ) : (
                <div
                  className="rounded-lg border border-border bg-muted/20 p-3"
                  key={`${plan.plan_code}-${plan.version}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{plan.display_name}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {formatPlanLimit(plan.center_limit)} centros /{" "}
                        {formatPlanLimit(plan.staff_seat_limit)} personas
                      </p>
                    </div>
                    <p className="text-sm font-medium">
                      {formatPlanPrice(plan)}
                    </p>
                  </div>
                </div>
              ),
            )
          )}
        </div>
      </details>
    </section>
  );
}

function OrganizationIdentityCard({
  summary,
}: {
  summary: PlatformOrganizationSummary;
}) {
  return (
    <Card className="shadow-xs">
      <CardHeader className="gap-4 sm:flex sm:flex-row sm:items-start">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Building2 aria-hidden="true" className="size-5" />
        </span>
        <div className="min-w-0">
          <CardTitle>Datos de organizacion</CardTitle>
          <CardDescription>
            Identificacion basica para confirmar que estas revisando la entrada
            correcta.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div className="min-w-0">
            <dt className="text-muted-foreground">Nombre</dt>
            <dd className="mt-1 truncate font-medium">
              {summary.organization_name}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted-foreground">Slug</dt>
            <dd className="mt-1 truncate font-mono text-xs text-muted-foreground">
              {summary.organization_slug}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted-foreground">Estado</dt>
            <dd className="mt-1">
              <Badge variant={getStatusVariant(summary.organization_status)}>
                {organizationStatusLabels[summary.organization_status] ??
                  summary.organization_status}
              </Badge>
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted-foreground">Alta</dt>
            <dd className="mt-1 text-muted-foreground">
              {formatDateTime(summary.organization_created_at)}
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}

function SupportAssuranceItem({
  description,
  icon: Icon,
  title,
}: {
  description: string;
  icon: LucideIcon;
  title: string;
}) {
  return (
    <div className="flex min-w-0 items-start gap-3 text-sm">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon aria-hidden="true" className="size-4" />
      </span>
      <span className="min-w-0">
        <span className="block font-medium text-foreground">{title}</span>
        <span className="mt-1 block leading-5 text-muted-foreground">
          {description}
        </span>
      </span>
    </div>
  );
}

function ControlledSupportEntry({
  canPrepareSupportSession,
  summary,
}: {
  canPrepareSupportSession: boolean;
  summary: PlatformOrganizationSummary;
}) {
  const tenantAccessAllowed =
    summary.organization_status === "trialing" ||
    summary.organization_status === "active";

  return (
    <Card className="shadow-xs">
      <CardHeader className="gap-4 sm:flex sm:flex-row sm:items-start">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <LifeBuoy aria-hidden="true" className="size-5" />
        </span>
        <div className="min-w-0">
          <CardTitle>Soporte temporal</CardTitle>
          <CardDescription>
            Abre la app con una sesion tecnica auditada para revisar o ayudar
            en operativa permitida.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 rounded-xl border border-primary/20 bg-primary/5 p-4 md:grid-cols-3">
          <SupportAssuranceItem
            description="Toda actividad operativa queda registrada para trazabilidad."
            icon={ShieldCheck}
            title="Auditado"
          />
          <SupportAssuranceItem
            description="La sesion expira al finalizar el tiempo seleccionado."
            icon={Clock3}
            title="Caduca automaticamente"
          />
          <SupportAssuranceItem
            description="Sin documentos, fichaje, nominas ni RRHH sensible."
            icon={LockKeyhole}
            title="Sin acceso sensible"
          />
        </div>

        {!tenantAccessAllowed ? (
          <Alert variant="destructive">
            <LockKeyhole aria-hidden="true" />
            <AlertTitle>Soporte bloqueado</AlertTitle>
            <AlertDescription>
              La organizacion esta{" "}
              {organizationStatusLabels[summary.organization_status] ??
                summary.organization_status}
              . Reactiva el acceso antes de abrir una sesion de soporte.
            </AlertDescription>
          </Alert>
        ) : null}

        {canPrepareSupportSession && tenantAccessAllowed ? (
          <form
            action={createPlatformSupportSessionAction}
            className="grid gap-4 pt-1 lg:grid-cols-[minmax(0,1fr)_minmax(260px,320px)]"
          >
            <input
              name="organizationId"
              type="hidden"
              value={summary.organization_id}
            />
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="support-reason">Motivo de soporte</Label>
                <Textarea
                  defaultValue="Revision tecnica solicitada por la organizacion."
                  id="support-reason"
                  maxLength={160}
                  minLength={8}
                  name="reason"
                  placeholder="Ej. Revisar incidencia de horario comunicada por el propietario."
                  required
                  rows={3}
                />
                <p className="text-xs leading-5 text-muted-foreground">
                  Puedes dejar el motivo por defecto si no hace falta mas
                  contexto. No incluyas enlaces, tokens ni datos sensibles.
                </p>
              </div>

              <Button className="w-full sm:w-fit" type="submit">
                <LifeBuoy aria-hidden="true" />
                Abrir soporte temporal
              </Button>
            </div>
            <div className="grid gap-3">
              <div className="grid gap-2">
                <Label htmlFor="support-duration">
                  Duracion de la sesion
                </Label>
                <select
                  className="h-11 min-w-0 rounded-lg border border-input bg-background px-3 text-base text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:h-9 md:text-sm"
                  defaultValue="120"
                  id="support-duration"
                  name="durationMinutes"
                  required
                >
                  <option value="30">30 minutos</option>
                  <option value="60">60 minutos</option>
                  <option value="120">120 minutos</option>
                </select>
                <p className="text-xs leading-5 text-muted-foreground">
                  La sesion caduca sola. Si necesitas mas tiempo, abre otra
                  desde Console.
                </p>
              </div>
              <div className="grid gap-2 rounded-lg border border-border bg-muted/20 p-3 text-sm">
                <p className="flex min-w-0 items-center gap-2 font-medium">
                  <CheckCircle2
                    aria-hidden="true"
                    className="size-4 shrink-0 text-primary"
                  />
                  Registro completo de actividad
                </p>
                <p className="flex min-w-0 items-center gap-2 font-medium">
                  <CheckCircle2
                    aria-hidden="true"
                    className="size-4 shrink-0 text-primary"
                  />
                  Sin acceso a documentos ni nominas
                </p>
              </div>
            </div>
          </form>
        ) : null}
      </CardContent>
      <CardFooter className="flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-2 text-sm text-muted-foreground">
          <LockKeyhole aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>
            {canPrepareSupportSession
              ? "Disponible para propietario de plataforma y soporte."
              : "Tu rol solo puede revisar la informacion visible."}
          </span>
        </div>
      </CardFooter>
    </Card>
  );
}

export default async function OrganizationReviewPage({
  params,
  searchParams,
}: OrganizationReviewPageProps) {
  const { organizationId } = await params;
  const queryParams = await searchParams;
  const error = getParam(queryParams.error);
  const status = getParam(queryParams.status);
  const routePath = `/console/organizations/${organizationId}`;
  const adminResult = await getActivePlatformAdmin();

  if (!adminResult.ok) {
    if (adminResult.error === "authentication-required") {
      redirect(getLoginPath(routePath));
    }

    return <ReviewErrorState error={adminResult.error} />;
  }

  const reviewResult = await getPlatformOrganizationReview(organizationId);

  if (!reviewResult.ok) {
    return <ReviewErrorState error={reviewResult.error} />;
  }

  const summary = reviewResult.data;
  const isPlatformOwner = adminResult.data.role === "platform_owner";
  const canReadBilling =
    isPlatformOwner || adminResult.data.role === "billing";
  const canPrepareSupportSession =
    isPlatformOwner || adminResult.data.role === "support";
  let billingOverview: OrganizationBillingOverview | null = null;
  let billingPlans: BillingPlanVersion[] = [];
  let activeBillingCenters: BillingCenterOption[] = [];

  if (canReadBilling) {
    const [billingOverviewResult, billingPlansResult, billingCentersResult] =
      await Promise.all([
        getOrganizationBillingOverview(summary.organization_id),
        listPublishedBillingPlans(),
        listBillingActiveCenters(summary.organization_id),
      ]);

    billingOverview = billingOverviewResult.ok
      ? billingOverviewResult.data
      : null;
    billingPlans = billingPlansResult.ok
      ? sortBillingPlansByPrice(billingPlansResult.data)
      : [];
    activeBillingCenters = billingCentersResult.ok
      ? billingCentersResult.data
      : [];
  }

  return (
    <div className="space-y-6">
      <OrganizationReviewHeader role={adminResult.data.role} summary={summary} />
      <ReviewFeedbackState error={error} status={status} />

      <section className="grid gap-3 sm:grid-cols-3">
        <ReviewMetric
          icon={MapPin}
          label="Centros activos"
          value={summary.active_centers_count}
        />
        <ReviewMetric
          icon={UsersRound}
          label="Usuarios activos"
          value={summary.active_users_count}
        />
        <ReviewMetric
          icon={UserCog}
          label="Coaches activos"
          value={summary.active_coaches_count}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(280px,380px)_minmax(0,1fr)] lg:items-start">
        <OrganizationIdentityCard summary={summary} />
        <OrganizationCommercialCard
          activeCenters={activeBillingCenters}
          billingOverview={billingOverview}
          billingPlans={billingPlans}
          canManageBilling={isPlatformOwner}
          canReadBilling={canReadBilling}
          summary={summary}
        />
      </section>

      <OrganizationAccessControlCard
        isPlatformOwner={isPlatformOwner}
        summary={summary}
      />

      <ControlledSupportEntry
        canPrepareSupportSession={canPrepareSupportSession}
        summary={summary}
      />
    </div>
  );
}
