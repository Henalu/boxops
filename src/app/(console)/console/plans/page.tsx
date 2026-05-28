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
  getBillingPlanMonthlySortValue,
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
  title: "Planes comerciales - BoxOps Console",
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
  "billing-catalog-load-failed": "No se pudo cargar el catalogo de planes.",
  "billing-change-forbidden":
    "Tu rol de Console puede consultar planes, pero no modificarlos.",
  "billing-plan-not-found": "Esa version ya no esta disponible.",
  "billing-save-failed":
    "No se pudo guardar el plan. Revisa los datos e intentalo otra vez.",
  forbidden: "Tu cuenta no tiene acceso activo a Console.",
  "invalid-features":
    "Escribe una prestacion por linea. Evita enlaces o datos sensibles.",
  "invalid-input": "Revisa los campos del formulario.",
  "invalid-limit": "Los limites deben ser numeros enteros positivos.",
  "invalid-plan-code":
    "El codigo solo puede usar minusculas, numeros y guiones.",
  "invalid-price": "Los precios deben ser importes validos en euros.",
  "invalid-stripe-reference":
    "Las referencias futuras deben tener formato prod_ o price_.",
  "invalid-text": "Usa textos breves y evita datos sensibles, enlaces o tokens.",
};

const consoleErrorCopy: Partial<Record<PlatformConsoleErrorCode, string>> = {
  "authentication-required": "Inicia sesion para abrir Console.",
  forbidden: "Tu cuenta no tiene acceso activo a Console.",
  "load-failed": "No se pudo cargar Console.",
};

const successMessages: Record<string, string> = {
  "draft-created": "Borrador creado. Aun no afecta a ninguna organizacion.",
  "plan-archived":
    "Plan archivado. Las suscripciones existentes conservan su snapshot.",
  "plan-published":
    "Version publicada. Las organizaciones no cambian hasta asignarles el plan.",
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

function getPlanLifecycleStatus(plan: BillingPlanVersion) {
  return plan.status ?? plan.billing_plan_status;
}

function getPlanStatusWeight(plan: BillingPlanVersion) {
  const status = getPlanLifecycleStatus(plan);

  if (status === "published") {
    return 0;
  }

  if (status === "draft") {
    return 1;
  }

  if (status === "archived") {
    return 2;
  }

  return 3;
}

function sortPlanVersions(versions: BillingPlanVersion[]) {
  return [...versions].sort((left, right) => {
    const statusDifference =
      getPlanStatusWeight(left) - getPlanStatusWeight(right);

    if (statusDifference !== 0) {
      return statusDifference;
    }

    return right.version - left.version;
  });
}

function getGroupSortPrice(versions: BillingPlanVersion[]) {
  const [representative] = versions;

  return representative
    ? getBillingPlanMonthlySortValue(representative)
    : Number.POSITIVE_INFINITY;
}

function groupByPlanCode(plans: BillingPlanVersion[]) {
  const groups = new Map<string, BillingPlanVersion[]>();

  for (const plan of plans) {
    const existing = groups.get(plan.plan_code) ?? [];
    groups.set(plan.plan_code, [...existing, plan]);
  }

  return [...groups.entries()]
    .map(([planCode, versions]) => ({
      planCode,
      versions: sortPlanVersions(versions),
    }))
    .sort((left, right) => {
      const priceDifference =
        getGroupSortPrice(left.versions) - getGroupSortPrice(right.versions);

      if (priceDifference !== 0) {
        return priceDifference;
      }

      const leftName = left.versions[0]?.display_name ?? left.planCode;
      const rightName = right.versions[0]?.display_name ?? right.planCode;

      return leftName.localeCompare(rightName, "es");
    });
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
          Catalogo de planes
        </Badge>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Planes comerciales
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
          Gestiona precios, limites y versiones para aplicar snapshots por
          organizacion. Esta superficie no cobra ni abre portales de pago.
        </p>
      </div>

      <Card size="sm">
        <CardContent>
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ShieldCheck aria-hidden="true" className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium">Rol en Console</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {consoleRoleLabels[role]}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge>
                  {role === "platform_owner" ? "Puede gestionar" : "Solo lectura"}
                </Badge>
                <Badge variant="outline">Sin pagos</Badge>
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
              Nuevo borrador de plan
            </p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Crea una version para revisar antes de publicarla. Los campos con
              * son obligatorios.
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
              hint="Nombre visible para Console y para el propietario del tenant."
              label="Nombre visible"
              maxLength={80}
              name="displayName"
              required
            />
            <TextAreaField
              className="min-h-24 md:col-span-2"
              hint="Texto comercial breve. No incluyas datos sensibles ni promesas de SLA."
              label="Descripcion"
              maxLength={260}
              minLength={8}
              name="description"
              required
            />
          </div>

          <div className="grid gap-4 border-t border-border pt-5 md:grid-cols-3">
            <TextInputField
              hint="Ej. 69 para 69 EUR/mes. Vacio para plan a medida."
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
              hint="Setup opcional. Vacio si es a medida."
              label="Setup"
              name="setupPrice"
              placeholder="199"
            />
            <TextInputField
              className="md:col-span-3"
              hint="Texto visible sobre el setup. Evita compromisos no acordados."
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
              label="Personas del equipo"
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
            placeholder={
              "2 centros incluidos\n30 personas del equipo\n10 GB de almacenamiento"
            }
          />

          <div className="grid gap-4 border-t border-border pt-5 md:grid-cols-3">
            <TextInputField
              hint="Opcional. Formato prod_; no inicia cobros."
              label="Referencia de producto futura"
              name="stripeProductId"
              placeholder="prod_..."
            />
            <TextInputField
              hint="Opcional. Formato price_; no inicia cobros."
              label="Referencia mensual futura"
              name="stripeMonthlyPriceId"
              placeholder="price_..."
            />
            <TextInputField
              hint="Opcional. Formato price_; no inicia cobros."
              label="Referencia anual futura"
              name="stripeAnnualPriceId"
              placeholder="price_..."
            />
          </div>
        </div>

        <div className="flex flex-col items-stretch gap-3 border-t border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            Crear un borrador no cambia organizaciones. Al publicar, la version
            publicada anterior del mismo plan queda archivada.
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
    plan.storage_gb === null
      ? "A medida"
      : `${formatPlanLimit(plan.storage_gb)} GB`;

  return (
    <article className="grid gap-4 rounded-lg border border-border bg-background p-4">
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
        <div className="text-left sm:text-right">
          <p className="font-semibold">{formatPlanPrice(plan)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Setup {formatCents(plan.setup_price_cents)}
          </p>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <PlanMetric label="Centros" value={formatPlanLimit(plan.center_limit)} />
        <PlanMetric
          label="Personas"
          value={formatPlanLimit(plan.staff_seat_limit)}
        />
        <PlanMetric
          label="Clientes futuros"
          value={formatPlanLimit(plan.future_client_limit)}
        />
        <PlanMetric label="Almacenamiento" value={storageLabel} />
      </div>

      <div className="grid gap-3 text-sm text-muted-foreground lg:grid-cols-[minmax(0,1fr)_minmax(240px,0.45fr)]">
        <div>
          <p className="font-medium text-foreground">Incluye</p>
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
          <div className="min-w-0">
            <dt className="text-xs text-muted-foreground">Publicado</dt>
            <dd className="mt-1">{formatDateTime(plan.published_at)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">
              Referencias futuras
            </dt>
            <dd className="mt-1 font-medium text-foreground">
              {plan.stripe_product_id ||
              plan.stripe_monthly_price_id ||
              plan.stripe_annual_price_id
                ? "Preparadas"
                : "Sin referencias"}
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
                Publicar esta version
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
          Solo lectura: tu rol permite revisar, no publicar ni archivar planes.
        </p>
      )}
    </article>
  );
}

function PlanGroup({
  defaultOpen = false,
  group,
  isPlatformOwner,
}: {
  defaultOpen?: boolean;
  group: {
    planCode: string;
    versions: BillingPlanVersion[];
  };
  isPlatformOwner: boolean;
}) {
  const latest = group.versions[0];
  const versionLabel =
    group.versions.length === 1
      ? "1 version"
      : `${group.versions.length} versiones`;

  return (
    <details
      className="group rounded-lg border border-border bg-card text-card-foreground shadow-xs"
      open={defaultOpen}
    >
      <summary className="flex cursor-pointer list-none items-start justify-between gap-4 px-4 py-4 outline-none transition-colors hover:bg-muted/45 focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ReceiptText aria-hidden="true" className="size-4" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold tracking-tight">
              {latest?.display_name ?? group.planCode}
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {latest ? formatPlanPrice(latest) : "Precio no disponible"} -{" "}
              {versionLabel} - Codigo{" "}
              <span className="font-mono">{group.planCode}</span>
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant={getStatusVariant(latest?.billing_plan_status)}>
            {latest?.billing_plan_status
              ? planStatusLabels[latest.billing_plan_status]
              : "Plan"}
          </Badge>
          <span
            aria-hidden="true"
            className={cn(
              buttonVariants({ size: "sm", variant: "outline" }),
              "min-h-11 px-3 md:min-h-0 md:px-2.5",
            )}
          >
            <span className="group-open:hidden">Ver</span>
            <span className="hidden group-open:inline">Ocultar</span>
            <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" />
          </span>
        </div>
      </summary>
      <div className="grid gap-3 border-t border-border p-4">
        {group.versions.map((plan) => (
          <PlanVersionCard
            isPlatformOwner={isPlatformOwner}
            key={plan.billing_plan_version_id}
            plan={plan}
          />
        ))}
      </div>
    </details>
  );
}

function LoadErrorState() {
  return (
    <Alert variant="destructive">
      <AlertCircle aria-hidden="true" />
      <AlertTitle>No se pudo cargar el catalogo</AlertTitle>
      <AlertDescription>
        Tu rol de Console no puede leer el catalogo o la base no devolvio los
        datos esperados.
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
        <AlertTitle>Catalogo sin cobro real</AlertTitle>
        <AlertDescription>
          Publicar actualiza las opciones disponibles. Cada organizacion
          mantiene su snapshot hasta que se le asigna otro plan.
        </AlertDescription>
      </Alert>

      {isPlatformOwner ? (
        <section className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">
                Crear version
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Prepara un borrador y publicalo cuando el precio y los limites
                esten revisados.
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
                Planes disponibles
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Ordenados por precio mensual ascendente. Los planes a medida
                quedan al final.
              </p>
            </div>
            <Badge variant="outline">
              <ReceiptText aria-hidden="true" className="size-3" />
              {plansResult.data.length} versiones
            </Badge>
          </div>

          {groups.map((group, index) => (
            <PlanGroup
              defaultOpen={index < 3}
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
