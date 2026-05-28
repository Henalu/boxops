import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type React from "react";
import {
  AlertCircle,
  ArrowRight,
  Building2,
  ChevronDown,
  CreditCard,
  KeyRound,
  LifeBuoy,
  LockKeyhole,
  MapPin,
  Plus,
  ReceiptText,
  ShieldCheck,
  UserCog,
  UsersRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { createPlatformOrganizationAction } from "@/lib/platform-console-actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { TransientFeedbackBanner } from "@/components/features/transient-feedback-banner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getLoginPath } from "@/lib/auth/redirects";
import { cn } from "@/lib/utils";
import {
  getActivePlatformAdmin,
  listPlatformOrganizationSummaries,
  type PlatformAdminRow,
  type PlatformConsoleErrorCode,
  type PlatformOrganizationSummary,
  type PlatformRole,
} from "@/lib/platform-console";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Console - BoxOps",
};

type ConsolePageProps = {
  searchParams: Promise<{
    error?: string | string[];
    organizationId?: string | string[];
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

const consoleErrorCopy: Record<PlatformConsoleErrorCode, string> = {
  "access-change-confirmation-required":
    "Marca la confirmacion para suspender el acceso. Es una accion deliberada.",
  "account-create-rollback-failed":
    "La organizacion no se termino de crear y la cuenta de acceso no pudo revertirse. Revisala antes de intentarlo otra vez.",
  "account-email-already-exists":
    "Ese email ya tiene cuenta de acceso. Deja vacia la contrasena temporal para reutilizarla.",
  "auth-account-create-failed":
    "No se pudo crear la cuenta de acceso del propietario inicial.",
  "auth-admin-not-configured":
    "Falta la clave server-only de Supabase Auth para crear cuentas en este entorno.",
  "authentication-required": "Inicia sesion para abrir Console.",
  "display-name-too-long": "El nombre visible del propietario no puede superar 80 caracteres.",
  "duplicate-slug": "Ese slug ya esta en uso. Elige otro antes de guardar.",
  forbidden: "Tu cuenta no tiene acceso activo a Console.",
  "invalid-email": "El email del propietario inicial no es valido.",
  "invalid-duration": "Elige una duracion valida para la sesion de soporte.",
  "invalid-input": "Revisa los datos enviados. Hay algun campo no valido.",
  "invalid-limit": "Los limites deben ser numeros enteros positivos.",
  "invalid-name": "El nombre de la organizacion no es valido.",
  "invalid-organization-status": "El estado de la organizacion no es valido.",
  "invalid-plan-code": "El plan solo puede usar minusculas, numeros y guiones.",
  "invalid-reason":
    "El motivo debe ser breve y no incluir enlaces, tokens ni datos sensibles.",
  "invalid-role": "El rol de Console no es valido.",
  "invalid-slug": "El slug solo puede usar minusculas, numeros y guiones.",
  "invalid-subscription-status": "El estado comercial no es valido.",
  "invalid-timezone": "La zona horaria no es valida.",
  "load-failed":
    "No se pudo cargar Console. Comprueba la base local y vuelve a intentarlo.",
  "missing-fields": "Completa los campos obligatorios antes de crear la organizacion.",
  "owner-auth-user-not-found":
    "No hay cuenta de acceso para ese email. Anade una contrasena temporal o usa otro propietario.",
  "owner-confirmation-required":
    "Estas usando tu propia cuenta como propietario inicial. Marca la casilla solo si esta organizacion es tuya.",
  "organization-not-found":
    "No encontramos esa organizacion en Console.",
  "password-mismatch": "Las contrasenas temporales no coinciden.",
  "password-missing-letter": "La contrasena temporal debe incluir al menos una letra.",
  "password-missing-number": "La contrasena temporal debe incluir al menos un numero.",
  "password-too-short": "La contrasena temporal debe tener al menos 8 caracteres.",
  "permission-denied": "Tu rol de Console no permite esta accion.",
  "save-failed": "No se pudo guardar la organizacion. Revisa los datos y vuelve a intentarlo.",
  "support-session-confirmation-required":
    "Confirma que el soporte temporal no crea accesos permanentes.",
  "support-session-not-found":
    "La sesion de soporte ya no esta activa.",
  "support-session-start-failed":
    "No se pudo abrir la sesion de soporte. La organizacion no se ha modificado.",
};

const successMessages: Record<string, string> = {
  "organization-created":
    "Organizacion creada. Se registro el propietario inicial y la suscripcion manual.",
};

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function isConsoleErrorCode(value: string | undefined): value is PlatformConsoleErrorCode {
  return Boolean(value && value in consoleErrorCopy);
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
  return planCode
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "Manual";
}

function formatLimit(value: number | null) {
  return value === null
    ? "Sin limite"
    : new Intl.NumberFormat("es-ES").format(value);
}

function shortId(value: string) {
  return value.slice(0, 8);
}

function getConsoleOrganizationPath(organizationId: string) {
  return `/console/organizations/${organizationId}`;
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

function getTotals(summaries: PlatformOrganizationSummary[]) {
  return summaries.reduce(
    (totals, summary) => ({
      activeCenters: totals.activeCenters + summary.active_centers_count,
      activeCoaches: totals.activeCoaches + summary.active_coaches_count,
      activeOrganizations:
        totals.activeOrganizations +
        (summary.organization_status === "active" ||
        summary.organization_status === "trialing"
          ? 1
          : 0),
      activeUsers: totals.activeUsers + summary.active_users_count,
    }),
    {
      activeCenters: 0,
      activeCoaches: 0,
      activeOrganizations: 0,
      activeUsers: 0,
    },
  );
}

function ErrorState({ error }: { error: PlatformConsoleErrorCode }) {
  return (
    <Alert variant="destructive">
      <AlertCircle aria-hidden="true" />
      <AlertTitle>No se pudo cargar Console</AlertTitle>
      <AlertDescription>{consoleErrorCopy[error]}</AlertDescription>
    </Alert>
  );
}

function FeedbackState({
  error,
  organizationId,
  status,
}: {
  error?: string;
  organizationId?: string;
  status?: string;
}) {
  if (error && isConsoleErrorCode(error)) {
    return (
      <TransientFeedbackBanner
        clearParams={["error", "organizationId", "status"]}
        description={consoleErrorCopy[error]}
        title="No se pudo aplicar el cambio"
        tone="error"
      />
    );
  }

  if (status && successMessages[status]) {
    return (
      <TransientFeedbackBanner
        clearParams={["error", "organizationId", "status"]}
        description={
          <>
            {successMessages[status]}
            {organizationId ? (
              <>
                {" "}
                ID de organizacion:{" "}
                <span className="font-mono">{shortId(organizationId)}</span>.
              </>
            ) : null}
          </>
        }
        title="Cambio guardado"
        tone="success"
      />
    );
  }

  return null;
}

function AccessDeniedState({ error }: { error: PlatformConsoleErrorCode }) {
  return (
    <section className="grid min-h-[calc(100vh-9rem)] place-items-center">
      <Card className="w-full max-w-lg">
        <CardContent className="space-y-4">
          <div className="flex size-10 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
            <LockKeyhole aria-hidden="true" className="size-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Sin acceso a Console
            </h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {consoleErrorCopy[error]}
            </p>
          </div>
          <p className="rounded-lg border border-border bg-muted/45 px-3 py-2 text-sm text-muted-foreground">
            Pide a un propietario de plataforma que active tu acceso interno.
          </p>
        </CardContent>
      </Card>
    </section>
  );
}

function ConsolePageHeader({ admin }: { admin: PlatformAdminRow }) {
  return (
    <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)] lg:items-end">
      <div className="min-w-0">
        <Badge className="mb-3" variant="secondary">
          Operacion interna
        </Badge>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          BoxOps Console
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
          Controla altas, estado comercial y soporte auditado de cada
          organizacion sin mezclarlo con la app diaria del tenant.
        </p>
      </div>

      <Card size="sm">
        <CardContent>
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ShieldCheck aria-hidden="true" className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium">Sesion actual</p>
              <p className="mt-1 truncate text-sm text-muted-foreground">
                {admin.display_name ?? admin.user_id}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge>{consoleRoleLabels[admin.role]}</Badge>
                <Badge variant="outline">Activo</Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function ConsoleInternalNav({ isPlatformOwner }: { isPlatformOwner: boolean }) {
  const items: {
    href: string;
    icon: LucideIcon;
    label: string;
  }[] = [
    {
      href: "#organizations",
      icon: Building2,
      label: "Organizaciones",
    },
    ...(isPlatformOwner
      ? [
          {
            href: "#create-organization",
            icon: Plus,
            label: "Alta de organizacion",
          },
        ]
      : []),
    {
      href: "#support",
      icon: LifeBuoy,
      label: "Soporte",
    },
    {
      href: "#billing",
      icon: ReceiptText,
      label: "Facturacion",
    },
  ];

  return (
    <nav
      aria-label="Navegacion interna de Console"
      className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4"
    >
      {items.map((item) => {
        const Icon = item.icon;

        return (
          <a
            className="flex min-h-14 min-w-0 items-center gap-3 rounded-xl bg-card px-4 py-3 text-sm font-medium ring-1 ring-foreground/10 transition-colors hover:bg-muted/45 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            href={item.href}
            key={item.href}
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon aria-hidden="true" className="size-4" />
            </span>
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
          </a>
        );
      })}
    </nav>
  );
}

function MetricCard({
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

function OrganizationMobileList({
  summaries,
}: {
  summaries: PlatformOrganizationSummary[];
}) {
  return (
    <div className="grid gap-3 md:hidden">
      {summaries.map((summary) => (
        <article
          className="rounded-xl bg-card p-4 ring-1 ring-foreground/10"
          key={summary.organization_id}
        >
          <div className="min-w-0">
            <Link
              className="block truncate text-base font-semibold underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              href={getConsoleOrganizationPath(summary.organization_id)}
            >
              {summary.organization_name}
            </Link>
            <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
              {summary.organization_slug}
            </p>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Badge variant={getStatusVariant(summary.organization_status)}>
              {organizationStatusLabels[summary.organization_status] ??
                summary.organization_status}
            </Badge>
            <Badge variant={getStatusVariant(summary.subscription_status)}>
              {subscriptionStatusLabels[summary.subscription_status] ??
                summary.subscription_status}
            </Badge>
          </div>

          <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Centros</dt>
              <dd className="mt-1 font-mono font-medium">
                {summary.active_centers_count}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Usuarios</dt>
              <dd className="mt-1 font-mono font-medium">
                {summary.active_users_count}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Coaches</dt>
              <dd className="mt-1 font-mono font-medium">
                {summary.active_coaches_count}
              </dd>
            </div>
          </dl>

          <dl className="mt-4 grid gap-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Plan</dt>
              <dd className="mt-1 font-medium">{formatPlan(summary.plan_code)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Limites</dt>
              <dd className="mt-1 text-muted-foreground">
                {formatLimit(summary.seat_limit)} usuarios /{" "}
                {formatLimit(summary.center_limit)} centros
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Alta</dt>
              <dd className="mt-1 text-muted-foreground">
                {formatDateTime(summary.organization_created_at)}
              </dd>
            </div>
          </dl>

          <div className="mt-4">
            <Button asChild className="w-full" variant="outline">
              <Link href={getConsoleOrganizationPath(summary.organization_id)}>
                Revisar organizacion
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </article>
      ))}
    </div>
  );
}

function OrganizationTable({
  summaries,
}: {
  summaries: PlatformOrganizationSummary[];
}) {
  return (
    <div className="hidden overflow-x-auto rounded-xl bg-card ring-1 ring-foreground/10 md:block">
      <table className="w-full min-w-[920px] text-left text-sm">
        <caption className="sr-only">
          Resumen de organizaciones de BoxOps Console
        </caption>
        <thead className="border-b border-border text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-medium" scope="col">
              Organizacion
            </th>
            <th className="px-4 py-3 font-medium" scope="col">
              Plan
            </th>
            <th className="px-4 py-3 font-medium" scope="col">
              Suscripcion
            </th>
            <th className="px-4 py-3 text-right font-medium" scope="col">
              Centros
            </th>
            <th className="px-4 py-3 text-right font-medium" scope="col">
              Usuarios
            </th>
            <th className="px-4 py-3 text-right font-medium" scope="col">
              Coaches
            </th>
            <th className="px-4 py-3 font-medium" scope="col">
              Alta
            </th>
            <th className="px-4 py-3 text-right font-medium" scope="col">
              Accion
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {summaries.map((summary) => (
            <tr className="align-top" key={summary.organization_id}>
              <td className="max-w-[280px] px-4 py-4">
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <Link
                      className="truncate font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                      href={getConsoleOrganizationPath(summary.organization_id)}
                    >
                      {summary.organization_name}
                    </Link>
                    <Badge variant={getStatusVariant(summary.organization_status)}>
                      {organizationStatusLabels[summary.organization_status] ??
                        summary.organization_status}
                    </Badge>
                  </div>
                  <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                    {summary.organization_slug}
                  </p>
                </div>
              </td>
              <td className="px-4 py-4">
                <p className="font-medium">{formatPlan(summary.plan_code)}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatLimit(summary.seat_limit)} usuarios /{" "}
                  {formatLimit(summary.center_limit)} centros
                </p>
              </td>
              <td className="px-4 py-4">
                <Badge variant={getStatusVariant(summary.subscription_status)}>
                  {subscriptionStatusLabels[summary.subscription_status] ??
                    summary.subscription_status}
                </Badge>
                {summary.current_period_ends_at ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Hasta {formatDateTime(summary.current_period_ends_at)}
                  </p>
                ) : null}
              </td>
              <td className="px-4 py-4 text-right font-mono">
                {summary.active_centers_count}
              </td>
              <td className="px-4 py-4 text-right font-mono">
                {summary.active_users_count}
              </td>
              <td className="px-4 py-4 text-right font-mono">
                {summary.active_coaches_count}
              </td>
              <td className="px-4 py-4 text-muted-foreground">
                {formatDateTime(summary.organization_created_at)}
              </td>
              <td className="px-4 py-4 text-right">
                <Button asChild size="sm" variant="outline">
                  <Link href={getConsoleOrganizationPath(summary.organization_id)}>
                    Revisar
                  </Link>
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmptyOrganizationsState({ canCreate }: { canCreate: boolean }) {
  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Building2 aria-hidden="true" className="size-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Sin organizaciones</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Aun no hay organizaciones visibles en Console.
            {canCreate
              ? " Abre el alta controlada para crear la primera."
              : " Cuando existan datos, tu rol podra revisarlos aqui."}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function OrganizationSummarySurface({
  canCreate,
  summaries,
}: {
  canCreate: boolean;
  summaries: PlatformOrganizationSummary[];
}) {
  const totals = getTotals(summaries);

  if (summaries.length === 0) {
    return <EmptyOrganizationsState canCreate={canCreate} />;
  }

  return (
    <section className="space-y-4" id="organizations">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          icon={Building2}
          label="Organizaciones activas"
          value={totals.activeOrganizations}
        />
        <MetricCard
          icon={MapPin}
          label="Centros activos"
          value={totals.activeCenters}
        />
        <MetricCard
          icon={UsersRound}
          label="Usuarios activos"
          value={totals.activeUsers}
        />
        <MetricCard
          icon={UserCog}
          label="Coaches activos"
          value={totals.activeCoaches}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight">
            Organizaciones
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Acceso, plan, limites y volumen operativo por organizacion.
          </p>
        </div>
        <Badge variant="outline">
          <ReceiptText aria-hidden="true" className="size-3" />
          Suscripcion manual
        </Badge>
      </div>

      <OrganizationMobileList summaries={summaries} />
      <OrganizationTable summaries={summaries} />
    </section>
  );
}

function SelectField({
  children,
  defaultValue,
  hint,
  label,
  name,
  required = false,
}: {
  children: React.ReactNode;
  defaultValue: string;
  hint?: string;
  label: string;
  name: string;
  required?: boolean;
}) {
  const hintId = hint ? `${name}-hint` : undefined;

  return (
    <div className="grid gap-2">
      <Label htmlFor={name}>
        <FieldLabelText required={required}>{label}</FieldLabelText>
      </Label>
      <select
        aria-describedby={hintId}
        className="h-11 min-w-0 rounded-lg border border-input bg-background px-3 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:h-8 md:text-sm"
        defaultValue={defaultValue}
        id={name}
        name={name}
        required={required}
      >
        {children}
      </select>
      {hint ? <FieldHint id={hintId}>{hint}</FieldHint> : null}
    </div>
  );
}

function RequiredMark() {
  return (
    <span className="text-destructive" aria-hidden="true">
      *
    </span>
  );
}

function FieldLabelText({
  children,
  required = false,
}: {
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1">
      <span className="truncate">{children}</span>
      {required ? (
        <>
          <RequiredMark />
          <span className="sr-only">obligatorio</span>
        </>
      ) : null}
    </span>
  );
}

function FieldHint({
  children,
  id,
}: {
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <p className="text-xs leading-5 text-muted-foreground" id={id}>
      {children}
    </p>
  );
}

function TextInputField({
  hint,
  label,
  name,
  required = false,
  ...inputProps
}: React.ComponentProps<typeof Input> & {
  hint?: string;
  label: string;
  name: string;
  required?: boolean;
}) {
  const hintId = hint ? `${name}-hint` : undefined;

  return (
    <div className="grid gap-2">
      <Label htmlFor={name}>
        <FieldLabelText required={required}>{label}</FieldLabelText>
      </Label>
      <Input
        aria-describedby={hintId}
        id={name}
        name={name}
        required={required}
        {...inputProps}
      />
      {hint ? <FieldHint id={hintId}>{hint}</FieldHint> : null}
    </div>
  );
}

function CreateOrganizationSection() {
  return (
    <section className="space-y-3 scroll-mt-20" id="create-organization">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            Alta de organizacion
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
            Crea una organizacion con propietario inicial y suscripcion manual.
            Usa este flujo solo cuando el alta ya este revisada.
          </p>
        </div>
        <Badge variant="secondary">Solo propietario plataforma</Badge>
      </div>

      <details className="group rounded-lg border border-border bg-card text-card-foreground shadow-xs">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-4 outline-none transition-colors hover:bg-muted/45 focus-visible:ring-3 focus-visible:ring-ring/50 sm:px-5 [&::-webkit-details-marker]:hidden">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Plus aria-hidden="true" className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="font-semibold tracking-tight">Datos de alta</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Completa lo minimo para que la organizacion pueda entrar y
                operar. Los campos con * son obligatorios.
              </p>
            </div>
          </div>
          <span
            className={cn(
              buttonVariants({ size: "sm", variant: "outline" }),
              "min-h-11 shrink-0 px-3 md:min-h-0 md:px-2.5",
            )}
          >
            <span className="group-open:hidden">Abrir</span>
            <span className="hidden group-open:inline">Cerrar</span>
            <ChevronDown
              aria-hidden="true"
              className="size-3.5 transition-transform group-open:rotate-180"
            />
          </span>
        </summary>

        <form action={createPlatformOrganizationAction}>
          <div className="space-y-6 border-t border-border p-4 sm:p-5">
            <div className="grid gap-4">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Building2 aria-hidden="true" className="size-4" />
                </span>
                <div className="min-w-0">
                  <h3 className="font-semibold">Organizacion</h3>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    Nombre, slug y zona horaria que usara el tenant.
                  </p>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <TextInputField
                  hint="Nombre visible en Console y en la app."
                  label="Nombre de organizacion"
                  maxLength={120}
                  name="organizationName"
                  placeholder="Box Norte"
                  required
                />
                <TextInputField
                  hint="Identificador unico. Usa minusculas, numeros y guiones."
                  label="Slug"
                  maxLength={64}
                  name="organizationSlug"
                  pattern="[a-z0-9]+(-[a-z0-9]+)*"
                  placeholder="box-norte"
                  required
                  title="Usa solo minusculas, numeros y guiones, sin guion inicial ni final."
                />
                <SelectField
                  defaultValue="trialing"
                  hint="Prueba permite validar el alta; Activa deja la organizacion operativa desde el inicio."
                  label="Estado inicial"
                  name="organizationStatus"
                  required
                >
                  <option value="trialing">Prueba</option>
                  <option value="active">Activa</option>
                </SelectField>
                <TextInputField
                  defaultValue="Europe/Madrid"
                  hint="Zona horaria IANA. En Espana normalmente Europe/Madrid."
                  label="Zona horaria"
                  maxLength={64}
                  name="organizationTimezone"
                  required
                />
              </div>
            </div>

            <div className="grid gap-4 border-t border-border pt-5">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <KeyRound aria-hidden="true" className="size-4" />
                </span>
                <div className="min-w-0">
                  <h3 className="font-semibold">Propietario de la organizacion</h3>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    Cuenta que administrara el primer acceso del tenant.
                  </p>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <TextInputField
                  autoComplete="email"
                  hint="Si el email ya tiene cuenta de acceso, la reutilizamos."
                  label="Email del propietario"
                  maxLength={254}
                  name="ownerEmail"
                  placeholder="owner@box.com"
                  required
                  type="email"
                />
                <TextInputField
                  hint="Si lo dejas vacio, se usara el email."
                  label="Nombre visible"
                  maxLength={80}
                  name="ownerDisplayName"
                  placeholder="Opcional"
                />
                <TextInputField
                  autoComplete="new-password"
                  hint="Solo si hay que crear la cuenta de acceso. Minimo 8 caracteres, con letra y numero."
                  label="Contrasena temporal"
                  minLength={8}
                  name="temporaryPassword"
                  type="password"
                />
                <TextInputField
                  autoComplete="new-password"
                  hint="Repitela para evitar errores al crear el acceso."
                  label="Confirmar contrasena temporal"
                  minLength={8}
                  name="confirmTemporaryPassword"
                  type="password"
                />
                <label className="flex gap-3 rounded-lg border border-border bg-muted/30 p-3 text-sm md:col-span-2">
                  <input
                    className="mt-1 size-4 shrink-0 accent-primary"
                    name="allowPlatformActorAsOwner"
                    type="checkbox"
                  />
                  <span className="min-w-0">
                    <span className="block font-medium">
                      Estoy usando mi cuenta como propietario
                    </span>
                    <span className="mt-1 block text-muted-foreground">
                      Solo para una organizacion propia de prueba. No lo
                      marques para clientes ni soporte.
                    </span>
                  </span>
                </label>
              </div>
            </div>

            <div className="grid gap-4 border-t border-border pt-5">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <ReceiptText aria-hidden="true" className="size-4" />
                </span>
                <div className="min-w-0">
                  <h3 className="font-semibold">
                    Plan manual inicial
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    Registro comercial interno. No crea cobros ni datos de
                    pago.
                  </p>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <TextInputField
                  defaultValue="manual"
                  hint="Codigo interno del plan, por ejemplo manual o trial-local."
                  label="Plan"
                  maxLength={64}
                  name="planCode"
                  pattern="[a-z0-9]+(-[a-z0-9]+)*"
                  required
                  title="Usa solo minusculas, numeros y guiones."
                />
                <SelectField
                  defaultValue="manual"
                  hint="Estado de seguimiento mientras no haya proveedor de pago."
                  label="Estado comercial"
                  name="subscriptionStatus"
                  required
                >
                  <option value="manual">Manual</option>
                  <option value="trialing">Prueba</option>
                  <option value="active">Activa</option>
                  <option value="paused">Pausada</option>
                </SelectField>
                <TextInputField
                  defaultValue="20"
                  hint="Maximo de usuarios activos incluidos en el alta."
                  label="Limite usuarios"
                  max={10000}
                  min={1}
                  name="seatLimit"
                  required
                  type="number"
                />
                <TextInputField
                  defaultValue="1"
                  hint="Maximo de centros operativos incluidos en el alta."
                  label="Limite centros"
                  max={1000}
                  min={1}
                  name="centerLimit"
                  required
                  type="number"
                />
              </div>
            </div>
          </div>
          <div className="flex flex-col items-stretch gap-3 border-t border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              Antes de guardar se vuelve a validar tu rol y los datos minimos.
              No se crean cobros ni permisos ocultos.
            </p>
            <Button className="sm:ml-auto" type="submit">
              <Plus aria-hidden="true" />
              Crear organizacion
            </Button>
          </div>
        </form>
      </details>
    </section>
  );
}

function PlaceholderCard({
  description,
  icon: Icon,
  id,
  items,
  title,
}: {
  description: string;
  icon: LucideIcon;
  id: string;
  items: string[];
  title: string;
}) {
  return (
    <Card id={id}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon aria-hidden="true" className="size-4" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-2 text-sm text-muted-foreground">
          {items.map((item) => (
            <li className="flex min-w-0 items-start gap-2" key={item}>
              <ArrowRight
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0"
              />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function PlatformOperationsPlaceholders() {
  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <PlaceholderCard
        description="Abre una sesion tecnica desde la ficha de la organizacion."
        icon={LifeBuoy}
        id="support"
        items={[
          "La sesion temporal queda auditada.",
          "Caduca sola y muestra un indicador visible.",
          "No crea usuarios permanentes ni da acceso a documentos o nominas.",
        ]}
        title="Soporte"
      />
      <PlaceholderCard
        description="Planes versionados, snapshots y cambios manuales sin cobro real."
        icon={CreditCard}
        id="billing"
        items={[
          "El catalogo vive en Planes.",
          "Cada cambio manual aplica un snapshot por organizacion.",
          "No se guardan tarjetas ni datos bancarios.",
        ]}
        title="Facturacion"
      />
    </section>
  );
}

export default async function ConsolePage({ searchParams }: ConsolePageProps) {
  const params = await searchParams;
  const status = getParam(params.status);
  const error = getParam(params.error);
  const organizationId = getParam(params.organizationId);
  let adminResult: Awaited<ReturnType<typeof getActivePlatformAdmin>>;

  try {
    adminResult = await getActivePlatformAdmin();
  } catch {
    return (
      <div className="space-y-6">
        <ErrorState error="load-failed" />
      </div>
    );
  }

  if (!adminResult.ok) {
    if (adminResult.error === "authentication-required") {
      redirect(getLoginPath("/console"));
    }

    return <AccessDeniedState error={adminResult.error} />;
  }

  let summariesResult: Awaited<
    ReturnType<typeof listPlatformOrganizationSummaries>
  >;

  try {
    summariesResult = await listPlatformOrganizationSummaries({
      limit: 100,
    });
  } catch {
    summariesResult = {
      error: "load-failed",
      ok: false,
    };
  }

  const isPlatformOwner = adminResult.data.role === "platform_owner";

  return (
    <div className="space-y-6">
      <ConsolePageHeader admin={adminResult.data} />
      <FeedbackState
        error={error}
        organizationId={organizationId}
        status={status}
      />
      <ConsoleInternalNav isPlatformOwner={isPlatformOwner} />

      {summariesResult.ok ? (
        <OrganizationSummarySurface
          canCreate={isPlatformOwner}
          summaries={summariesResult.data}
        />
      ) : (
        <ErrorState error={summariesResult.error} />
      )}

      {isPlatformOwner ? <CreateOrganizationSection /> : null}
      <PlatformOperationsPlaceholders />
    </div>
  );
}
