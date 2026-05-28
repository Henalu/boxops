import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type React from "react";
import {
  AlertCircle,
  Archive,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Database,
  Plus,
  ReceiptText,
  Rocket,
  ShieldCheck,
} from "lucide-react";

import {
  archiveBillingPlanAction,
  createBillingPlanDraftAction,
  publishBillingPlanVersionAction,
} from "@/lib/billing-actions";
import {
  formatPlanLimit,
  formatPlanPrice,
  listConsoleBillingPlanVersions,
  type BillingErrorCode,
  type BillingPlanVersion,
  type BillingPlanStatus,
} from "@/lib/billing";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TransientFeedbackBanner } from "@/components/features/transient-feedback-banner";
import { getLoginPath } from "@/lib/auth/redirects";
import {
  getActivePlatformAdmin,
  type PlatformConsoleErrorCode,
  type PlatformRole,
} from "@/lib/platform-console";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Planes - BoxOps Console",
};

type ConsolePlansPageProps = {
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

const planStatusLabels: Record<BillingPlanStatus, string> = {
  archived: "Archivado",
  draft: "Borrador",
  published: "Publicado",
};

const billingErrorCopy: Partial<Record<BillingErrorCode, string>> = {
  "authentication-required": "Inicia sesion para abrir Console.",
  "billing-catalog-load-failed":
    "No se pudo cargar el catalogo de planes.",
  "billing-change-forbidden": "Tu rol de Console no permite esta accion.",
  "billing-plan-not-found": "No encontramos esa version de plan.",
  "billing-save-failed": "No se pudo guardar el cambio de plan.",
  forbidden: "Tu cuenta no tiene acceso activo a Console.",
  "invalid-features": "Las prestaciones deben ser lineas breves y seguras.",
  "invalid-input": "Revisa los datos enviados.",
  "invalid-limit": "Los limites deben ser numeros enteros positivos.",
  "invalid-plan-code": "El codigo solo puede usar minusculas, numeros y guiones.",
  "invalid-price": "Los precios deben ser importes validos en euros.",
  "invalid-stripe-reference":
    "Las referencias futuras de Stripe deben empezar por prod_ o price_.",
  "invalid-text": "Revisa textos: evita datos sensibles, enlaces o tokens.",
};

const consoleErrorCopy: Partial<Record<PlatformConsoleErrorCode, string>> = {
  "authentication-required": "Inicia sesion para abrir Console.",
  forbidden: "Tu cuenta no tiene acceso activo a Console.",
  "load-failed": "No se pudo cargar Console.",
};

const successMessages: Record<string, string> = {
  "draft-created": "Borrador de version creado.",
  "plan-archived": "Plan archivado.",
  "plan-published": "Version publicada.",
};

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function isBillingErrorCode(
  value: string | undefined,
): value is BillingErrorCode {
  return Boolean(value && value in billingErrorCopy);
}

function isConsoleErrorCode(
  value: string | undefined,
): value is PlatformConsoleErrorCode {
  return Boolean(value && value in consoleErrorCopy);
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

function formatDateTime(value: string | null | undefined) {
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

function getStatusVariant(status: string | undefined) {
  if (status === "published") {
    return "secondary" as const;
  }

  if (status === "archived") {
    return "outline" as const;
  }

  return "default" as const;
}

function groupByPlanCode(plans: BillingPlanVersion[]) {
  const groups = new Map<string, BillingPlanVersion[]>();

  for (const plan of plans) {
    const existing = groups.get(plan.plan_code) ?? [];
    groups.set(plan.plan_code, [...existing, plan]);
  }

  return [...groups.entries()].map(([planCode, versions]) => ({
    planCode,
    versions,
  }));
}

function FeedbackState({
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
        title="No se pudo aplicar el cambio"
        tone="error"
      />
    );
  }

  if (error && isConsoleErrorCode(error)) {
    return (
      <TransientFeedbackBanner
        description={consoleErrorCopy[error]}
        title="No se pudo abrir Console"
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
          <span aria-hidden="true" className="text-destructive">
            *
          </span>
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

function TextAreaField({
  hint,
  label,
  name,
  required = false,
  ...textareaProps
}: React.ComponentProps<typeof Textarea> & {
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
      <Textarea
        aria-describedby={hintId}
        id={name}
        name={name}
        required={required}
        {...textareaProps}
      />
      {hint ? <FieldHint id={hintId}>{hint}</FieldHint> : null}
    </div>
  );
}

function ConsolePlansHeader({
  role,
}: {
  role: PlatformRole;
}) {
  return (
    <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)] lg:items-end">
      <div className="min-w-0">
        <Button asChild className="mb-4" variant="outline">
          <Link href="/console">
            <ArrowLeft aria-hidden="true" />
            Console
          </Link>
        </Button>
        <Badge className="mb-3" variant="secondary">
          Catalogo comercial
        </Badge>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Planes
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
          Versiona founder pricing, publica planes y conserva snapshots por
          organizacion. No hay cobros reales en este corte.
        </p>
      </div>

      <Card size="sm">
        <CardContent>
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ShieldCheck aria-hidden="true" className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium">Rol Console</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {consoleRoleLabels[role]}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge>{role === "platform_owner" ? "Gestion" : "Lectura"}</Badge>
                <Badge variant="outline">Sin cobro real</Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function PlanDraftForm() {
  return (
    <details className="group rounded-lg border border-border bg-card text-card-foreground shadow-xs">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-4 outline-none transition-colors hover:bg-muted/45 focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Plus aria-hidden="true" className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="font-semibold tracking-tight">
              Crear borrador de version
            </p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Los campos con * son obligatorios. Los precios se guardan en
              centimos EUR al enviar.
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

      <form action={createBillingPlanDraftAction}>
        <div className="grid gap-6 border-t border-border p-4">
          <div className="grid gap-4 md:grid-cols-2">
            <TextInputField
              hint="Codigo estable: starter, box, growth..."
              label="Codigo de plan"
              maxLength={64}
              name="planCode"
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              required
            />
            <TextInputField
              hint="Nombre visible para Console y owner billing."
              label="Nombre visible"
              maxLength={80}
              name="displayName"
              required
            />
            <TextAreaField
              className="min-h-24 md:col-span-2"
              hint="Copy comercial breve. No incluyas datos sensibles ni promesas de SLA."
              label="Descripcion"
              maxLength={260}
              minLength={8}
              name="description"
              required
            />
          </div>

          <div className="grid gap-4 border-t border-border pt-5 md:grid-cols-3">
            <TextInputField
              hint="Ej. 69 para 69 EUR/mes. Vacio para custom."
              label="Precio mensual"
              name="monthlyPrice"
              placeholder="69"
            />
            <TextInputField
              hint="Anual equivale a 10 meses pagados."
              label="Precio anual"
              name="annualPrice"
              placeholder="690"
            />
            <TextInputField
              hint="Setup opcional. Vacio si es custom."
              label="Setup"
              name="setupPrice"
              placeholder="199"
            />
            <TextInputField
              className="md:col-span-3"
              hint="Texto visible sobre setup. Evita compromisos no acordados."
              label="Descripcion setup"
              maxLength={160}
              name="setupDescription"
              placeholder="Setup opcional de puesta en marcha."
            />
          </div>

          <div className="grid gap-4 border-t border-border pt-5 md:grid-cols-4">
            <TextInputField
              label="Limite centros"
              min={1}
              name="centerLimit"
              placeholder="2"
              type="number"
            />
            <TextInputField
              label="Personas equipo"
              min={1}
              name="staffSeatLimit"
              placeholder="30"
              type="number"
            />
            <TextInputField
              label="Clientes futuros"
              min={1}
              name="futureClientLimit"
              placeholder="1200"
              type="number"
            />
            <TextInputField
              label="Almacenamiento GB"
              min={1}
              name="storageGb"
              placeholder="10"
              type="number"
            />
            <TextInputField
              className="md:col-span-4"
              hint="No prometas soporte ilimitado ni SLA enterprise en planes bajos."
              label="Nivel de soporte"
              maxLength={100}
              name="supportLevel"
              placeholder="Soporte por email prioritario"
              required
            />
          </div>

          <TextAreaField
            className="min-h-32"
            hint="Una prestacion por linea, maximo 24."
            label="Prestaciones"
            name="features"
            placeholder={"2 centros incluidos\n30 personas del equipo\n10 GB de almacenamiento"}
          />

          <div className="grid gap-4 border-t border-border pt-5 md:grid-cols-3">
            <TextInputField
              hint="Opcional, preparado para el futuro."
              label="Stripe product ref"
              name="stripeProductId"
              placeholder="prod_..."
            />
            <TextInputField
              hint="Opcional, no se usa para cobrar todavia."
              label="Stripe monthly price ref"
              name="stripeMonthlyPriceId"
              placeholder="price_..."
            />
            <TextInputField
              hint="Opcional, no se usa para cobrar todavia."
              label="Stripe annual price ref"
              name="stripeAnnualPriceId"
              placeholder="price_..."
            />
          </div>
        </div>

        <div className="flex flex-col items-stretch gap-3 border-t border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            Crear borrador no cambia organizaciones. Publicar una version nueva
            archivara la publicada anterior del mismo plan.
          </p>
          <Button className="sm:ml-auto" type="submit">
            <Plus aria-hidden="true" />
            Crear borrador
          </Button>
        </div>
      </form>
    </details>
  );
}

function PlanMetric({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium">{value}</p>
    </div>
  );
}

function PlanVersionCard({
  isPlatformOwner,
  plan,
}: {
  isPlatformOwner: boolean;
  plan: BillingPlanVersion;
}) {
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
              <Badge variant={getStatusVariant(plan.status)}>
                {plan.status ? planStatusLabels[plan.status] : "Version"}
              </Badge>
              <Badge variant="outline">v{plan.version}</Badge>
            </div>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
              {plan.description}
            </p>
          </div>
          <div className="text-right">
            <p className="font-semibold">{formatPlanPrice(plan)}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Setup {formatCents(plan.setup_price_cents, "custom")}
            </p>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <PlanMetric label="Centros" value={formatPlanLimit(plan.center_limit)} />
          <PlanMetric
            label="Equipo"
            value={formatPlanLimit(plan.staff_seat_limit)}
          />
          <PlanMetric
            label="Clientes futuros"
            value={formatPlanLimit(plan.future_client_limit)}
          />
          <PlanMetric label="Storage" value={storageLabel} />
        </div>

        <div className="grid gap-3 text-sm text-muted-foreground lg:grid-cols-[minmax(0,1fr)_minmax(240px,0.45fr)]">
          <div>
            <p className="font-medium text-foreground">Prestaciones</p>
            <ul className="mt-2 grid gap-1.5">
              {plan.features.length > 0 ? (
                plan.features.map((feature) => (
                  <li className="flex min-w-0 items-start gap-2" key={feature}>
                    <CheckCircle2
                      aria-hidden="true"
                      className="mt-0.5 size-4 shrink-0 text-primary"
                    />
                    <span>{feature}</span>
                  </li>
                ))
              ) : (
                <li>Sin prestaciones detalladas.</li>
              )}
            </ul>
          </div>
          <dl className="grid gap-2">
            <div>
              <dt className="text-xs text-muted-foreground">Soporte</dt>
              <dd className="mt-1 font-medium text-foreground">
                {plan.support_level}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Publicado</dt>
              <dd className="mt-1">{formatDateTime(plan.published_at)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Stripe refs</dt>
              <dd className="mt-1 font-mono text-xs">
                {plan.stripe_product_id ||
                plan.stripe_monthly_price_id ||
                plan.stripe_annual_price_id
                  ? "refs guardadas"
                  : "sin refs"}
              </dd>
            </div>
          </dl>
        </div>

        {isPlatformOwner ? (
          <div className="flex flex-wrap gap-2 border-t border-border pt-4">
            {plan.status === "draft" ? (
              <form action={publishBillingPlanVersionAction}>
                <input
                  name="billingPlanVersionId"
                  type="hidden"
                  value={plan.billing_plan_version_id}
                />
                <Button type="submit">
                  <Rocket aria-hidden="true" />
                  Publicar version
                </Button>
              </form>
            ) : null}
            {plan.billing_plan_status !== "archived" ? (
              <form action={archiveBillingPlanAction}>
                <input name="planCode" type="hidden" value={plan.plan_code} />
                <Button type="submit" variant="outline">
                  <Archive aria-hidden="true" />
                  Archivar plan
                </Button>
              </form>
            ) : null}
          </div>
        ) : (
          <p className="rounded-lg border border-border bg-muted/25 px-3 py-2 text-sm text-muted-foreground">
            Tu rol puede leer planes y suscripciones, pero no publicar ni
            archivar versiones.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function PlanGroup({
  group,
  isPlatformOwner,
}: {
  group: {
    planCode: string;
    versions: BillingPlanVersion[];
  };
  isPlatformOwner: boolean;
}) {
  const latest = group.versions[0];

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight">
            {latest?.display_name ?? group.planCode}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {group.versions.length} versiones en catalogo. Codigo{" "}
            <span className="font-mono">{group.planCode}</span>.
          </p>
        </div>
        <Badge variant={getStatusVariant(latest?.billing_plan_status)}>
          {latest?.billing_plan_status ?? "plan"}
        </Badge>
      </div>
      <div className="grid gap-3">
        {group.versions.map((plan) => (
          <PlanVersionCard
            isPlatformOwner={isPlatformOwner}
            key={plan.billing_plan_version_id}
            plan={plan}
          />
        ))}
      </div>
    </section>
  );
}

function LoadErrorState() {
  return (
    <Alert variant="destructive">
      <AlertCircle aria-hidden="true" />
      <AlertTitle>No se pudo cargar el catalogo</AlertTitle>
      <AlertDescription>
        Solo platform_owner y billing pueden leer esta superficie. Revisa RLS y
        el rol activo.
      </AlertDescription>
    </Alert>
  );
}

export default async function ConsolePlansPage({
  searchParams,
}: ConsolePlansPageProps) {
  const params = await searchParams;
  const status = getParam(params.status);
  const error = getParam(params.error);
  const adminResult = await getActivePlatformAdmin();

  if (!adminResult.ok) {
    if (adminResult.error === "authentication-required") {
      redirect(getLoginPath("/console/plans"));
    }

    return (
      <div className="space-y-6">
        <FeedbackState error={adminResult.error} />
        <LoadErrorState />
      </div>
    );
  }

  const isPlatformOwner = adminResult.data.role === "platform_owner";
  const canReadCatalog =
    isPlatformOwner || adminResult.data.role === "billing";
  const plansResult = canReadCatalog
    ? await listConsoleBillingPlanVersions()
    : {
        error: "billing-change-forbidden" as const,
        ok: false as const,
      };
  const groups = plansResult.ok ? groupByPlanCode(plansResult.data) : [];

  return (
    <div className="space-y-6">
      <ConsolePlansHeader role={adminResult.data.role} />
      <FeedbackState error={error} status={status} />

      <Alert>
        <Database aria-hidden="true" />
        <AlertTitle>Founder pricing versionable</AlertTitle>
        <AlertDescription>
          Las organizaciones guardan precio, limites y prestaciones como
          snapshot al contratar o cambiar plan. Los IDs futuros de Stripe son
          referencias nullable y no disparan pagos.
        </AlertDescription>
      </Alert>

      {isPlatformOwner ? (
        <section className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">
                Gestion de catalogo
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Crear un borrador no afecta a clientes hasta publicarlo.
              </p>
            </div>
            <Badge variant="secondary">platform_owner</Badge>
          </div>
          <PlanDraftForm />
        </section>
      ) : null}

      {plansResult.ok ? (
        <section className="space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">
                Versiones
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Precios en EUR sin IVA. El anual equivale a 10 meses pagados.
              </p>
            </div>
            <Badge variant="outline">
              <ReceiptText aria-hidden="true" className="size-3" />
              {plansResult.data.length} versiones
            </Badge>
          </div>

          {groups.map((group) => (
            <PlanGroup
              group={group}
              isPlatformOwner={isPlatformOwner}
              key={group.planCode}
            />
          ))}
        </section>
      ) : (
        <LoadErrorState />
      )}
    </div>
  );
}
