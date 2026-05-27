import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  CreditCard,
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  getActivePlatformAdmin,
  getPlatformOrganizationReview,
  type PlatformConsoleErrorCode,
  type PlatformOrganizationSummary,
  type PlatformRole,
} from "@/lib/platform-console";

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
    <Card size="sm">
      <CardContent>
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">{label}</p>
          <Icon aria-hidden="true" className="size-4 text-muted-foreground" />
        </div>
        <p className="mt-3 font-mono text-2xl font-semibold tracking-normal">
          {new Intl.NumberFormat("es-ES").format(value)}
        </p>
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
    <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(260px,340px)] lg:items-end">
      <div className="min-w-0">
        <Button asChild className="mb-4" variant="outline">
          <Link href="/console">
            <ArrowLeft aria-hidden="true" />
            Console
          </Link>
        </Button>
        <Badge className="mb-3" variant="secondary">
          Revision de organizacion
        </Badge>
        <h1 className="truncate text-3xl font-semibold tracking-tight sm:text-4xl">
          {summary.organization_name}
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
          Revisa estado, limites y soporte sin entrar como usuario del cliente
          ni tocar su equipo.
        </p>
      </div>

      <Card size="sm">
        <CardContent>
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ShieldCheck aria-hidden="true" className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium">Revision actual</p>
              <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                {shortId(summary.organization_id)}
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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {tenantAccessAllowed ? (
            <ShieldOff aria-hidden="true" className="size-4" />
          ) : (
            <ShieldCheck aria-hidden="true" className="size-4" />
          )}
          Acceso de la organizacion
        </CardTitle>
        <CardDescription>
          Estado actual:{" "}
          <span className="font-medium text-foreground">
            {organizationStatusLabels[status] ?? status}
          </span>
          . Solo Prueba y Activa permiten entrar en la app.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert variant={tenantAccessAllowed ? "default" : "destructive"}>
          {tenantAccessAllowed ? (
            <ShieldCheck aria-hidden="true" />
          ) : (
            <LockKeyhole aria-hidden="true" />
          )}
          <AlertTitle>
            {tenantAccessAllowed
              ? "Acceso abierto"
              : "Acceso bloqueado"}
          </AlertTitle>
          <AlertDescription>
            Suspender impide entrar en BoxOps. No borra datos ni cambia
            usuarios.
          </AlertDescription>
        </Alert>

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
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}

function OrganizationCommercialCard({
  summary,
}: {
  summary: PlatformOrganizationSummary;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard aria-hidden="true" className="size-4" />
          Suscripcion manual
        </CardTitle>
        <CardDescription>
          Plan, estado comercial y limites acordados para esta organizacion.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div className="min-w-0">
            <dt className="text-muted-foreground">Plan</dt>
            <dd className="mt-1 font-medium">{formatPlan(summary.plan_code)}</dd>
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
          <div className="min-w-0">
            <dt className="text-muted-foreground">Fin de trial</dt>
            <dd className="mt-1 text-muted-foreground">
              {formatDateTime(summary.trial_ends_at)}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted-foreground">Fin de periodo</dt>
            <dd className="mt-1 text-muted-foreground">
              {formatDateTime(summary.current_period_ends_at)}
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}

function OrganizationIdentityCard({
  summary,
}: {
  summary: PlatformOrganizationSummary;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 aria-hidden="true" className="size-4" />
          Datos de organizacion
        </CardTitle>
        <CardDescription>
          Identificacion basica para confirmar que estas revisando la entrada
          correcta.
        </CardDescription>
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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LifeBuoy aria-hidden="true" className="size-4" />
          Soporte temporal
        </CardTitle>
        <CardDescription>
          Abre la app con una sesion tecnica auditada.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm leading-6 text-muted-foreground">
        <p>
          Usalo solo para revisar configuracion u operativa cuando el cliente
          pida ayuda. La sesion caduca, muestra un aviso visible y no concede
          documentos, nominas ni datos sensibles.
        </p>

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
            className="grid gap-4 pt-2"
          >
            <input
              name="organizationId"
              type="hidden"
              value={summary.organization_id}
            />
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
            <div className="grid gap-2 sm:max-w-xs">
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
            <Button className="w-full sm:w-fit" type="submit">
              <LifeBuoy aria-hidden="true" />
              Abrir soporte temporal
            </Button>
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
  const canPrepareSupportSession =
    isPlatformOwner || adminResult.data.role === "support";

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

      <section className="grid gap-4 lg:grid-cols-2">
        <OrganizationIdentityCard summary={summary} />
        <OrganizationCommercialCard summary={summary} />
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
