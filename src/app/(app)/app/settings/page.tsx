import { redirect } from "next/navigation";
import {
  Building2,
  Eye,
  FileClock,
  ImageOff,
  Info,
  Palette,
  Save,
  ShieldCheck,
} from "lucide-react";

import {
  updateOrganizationSettings,
  updateTimeTrackingSettings,
} from "./actions";
import {
  PageHeader,
  SectionHeader,
  StatusBadge,
} from "@/components/features/operations-ui";
import { ColorPaletteField } from "@/components/features/color-palette-field";
import { OrganizationResolutionState } from "@/components/features/organization-resolution-state";
import { TransientFeedbackBanner } from "@/components/features/transient-feedback-banner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getLoginPath } from "@/lib/auth/redirects";
import {
  canManageTenantSettings,
  canManageTimeTrackingSettings,
  getApplicationRoleLabel,
} from "@/lib/auth/permissions";
import {
  getActiveMemberships,
  getAuthenticatedUser,
  resolveActiveOrganization,
  type ActiveOrganization,
} from "@/lib/auth/tenant";
import {
  resolveOrganizationTimeTrackingSettings,
  resolveOrganizationTheme,
  type ResolvedOrganizationTimeTrackingSettings,
  type ResolvedOrganizationTheme,
} from "@/lib/organizations";

export const dynamic = "force-dynamic";

type SettingsPageProps = {
  searchParams: Promise<{
    error?: string | string[];
    organizationId?: string | string[];
    status?: string | string[];
  }>;
};

const successMessages: Record<string, string> = {
  "time-tracking-updated": "Configuración de fichaje guardada.",
  updated: "Configuración guardada.",
};

const errorMessages: Record<string, string> = {
  "invalid-time-tracking-config":
    "La configuración de fichaje no tiene un valor válido.",
  forbidden: "Tu rol no permite editar esta configuración.",
  "invalid-accent-color":
    "Usa un color hexadecimal para el color principal, por ejemplo #0f766e.",
  "missing-name": "Indica un nombre visible para la organización.",
  no_active_memberships: "No hay accesos activos para este usuario.",
  organization_not_found: "La organización solicitada no está disponible.",
  organization_required:
    "Elige una organización antes de editar configuración.",
  "save-failed": "No se han podido guardar los cambios.",
};

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function ColorSwatch({ color }: { color: string | null }) {
  return (
    <span
      aria-hidden="true"
      className="size-5 shrink-0 rounded-full border border-border bg-primary"
      style={color ? { backgroundColor: color } : undefined}
    />
  );
}

function ThemeStatusBadge({ theme }: { theme: ResolvedOrganizationTheme }) {
  if (theme.isApplied) {
    return <StatusBadge tone="success">Tema activo</StatusBadge>;
  }

  return <StatusBadge tone="neutral">Fallback BoxOps</StatusBadge>;
}

function OrganizationSettingsForm({
  organization,
  theme,
}: {
  organization: ActiveOrganization;
  theme: ResolvedOrganizationTheme;
}) {
  return (
    <form action={updateOrganizationSettings} className="grid gap-5">
      <input name="organizationId" type="hidden" value={organization.id} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <label className="grid gap-2">
          <span>
            <span className="block text-sm font-medium">Nombre visible</span>
            <span className="mt-1 block text-xs leading-5 text-muted-foreground">
              Se muestra al equipo dentro de BoxOps.
            </span>
          </span>
          <Input
            defaultValue={organization.name}
            maxLength={80}
            name="name"
            placeholder="Nombre del box"
            required
          />
        </label>

        <ColorPaletteField
          defaultValue={theme.accentColor}
          label="Color principal"
          name="accentColor"
          paletteLabel="Paleta de color principal"
          placeholder="#0f766e"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit">
          <Save aria-hidden="true" />
          Guardar configuración
        </Button>
        <p className="inline-flex items-start gap-2 text-sm text-muted-foreground">
          <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>
            Los estados críticos, errores y foco mantienen la identidad visual
            base de BoxOps.
          </span>
        </p>
      </div>
    </form>
  );
}

function OrganizationReadOnlySummary({
  organization,
  theme,
}: {
  organization: ActiveOrganization;
  theme: ResolvedOrganizationTheme;
}) {
  return (
    <div className="grid gap-4 rounded-lg border border-border bg-muted/20 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
      <div className="min-w-0">
        <h3 className="truncate text-base font-semibold tracking-tight">
          {organization.name}
        </h3>
        <p className="mt-1 truncate text-sm text-muted-foreground">
          {organization.slug}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        <ColorSwatch color={theme.accentColor} />
        <ThemeStatusBadge theme={theme} />
      </div>
    </div>
  );
}

function ThemePreview({
  organization,
  theme,
}: {
  organization: ActiveOrganization;
  theme: ResolvedOrganizationTheme;
}) {
  return (
    <div
      className="grid gap-4 border-t border-border pt-5 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0"
      id="vista-marca"
    >
      <div className="space-y-1">
        <h3 className="flex items-center gap-2 text-base font-semibold tracking-tight">
          <Palette aria-hidden="true" className="size-4 text-primary" />
          Vista de marca
        </h3>
        <p className="text-sm text-muted-foreground">
          Así se mostrará tu organización en superficies internas.
        </p>
      </div>

      <div className="grid gap-3">
        <div className="flex min-h-20 items-center justify-between gap-3 rounded-lg border border-border bg-primary/10 px-3 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                {organization.name.trim().charAt(0).toUpperCase() || "B"}
              </span>
              <p className="truncate text-sm font-semibold">
                {organization.name}
              </p>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Vista de marca con el color principal de la organización.
            </p>
          </div>
          <ColorSwatch color={theme.accentColor} />
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Estado de configuración</p>
          <div className="flex flex-wrap items-center gap-2">
            <ThemeStatusBadge theme={theme} />
            <StatusBadge tone="critical">Sin cubrir intacto</StatusBadge>
            <StatusBadge tone="warning">Conflicto intacto</StatusBadge>
          </div>
        </div>
      </div>
    </div>
  );
}

function IdentitySettingsCard({
  canManageSettings,
  organization,
  theme,
}: {
  canManageSettings: boolean;
  organization: ActiveOrganization;
  theme: ResolvedOrganizationTheme;
}) {
  return (
    <Card className="py-0">
      <CardContent className="grid gap-6 p-4 sm:p-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(300px,0.8fr)]">
        <div className="space-y-5">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/10">
              <Building2 aria-hidden="true" className="size-5" />
            </span>
            <div className="min-w-0 space-y-1">
              <h2 className="text-lg font-semibold tracking-tight">
                Identidad de la organización
              </h2>
              <p className="text-sm text-muted-foreground">
                Nombre visible y color principal que representan tu organización
                en BoxOps.
              </p>
            </div>
          </div>

          {canManageSettings ? (
            <OrganizationSettingsForm organization={organization} theme={theme} />
          ) : (
            <OrganizationReadOnlySummary
              organization={organization}
              theme={theme}
            />
          )}
        </div>

        <ThemePreview organization={organization} theme={theme} />
      </CardContent>
    </Card>
  );
}

function LogoSettingsCard() {
  return (
    <Card className="py-0">
      <CardContent className="grid gap-4 p-4 sm:p-5 md:grid-cols-[minmax(0,1fr)_minmax(280px,0.85fr)]">
        <div className="space-y-3">
          <p className="text-sm font-medium">Logotipo actual</p>
          <div className="flex min-h-28 items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 px-4 py-6 text-center">
            <div className="space-y-2">
              <span className="mx-auto flex size-9 items-center justify-center rounded-lg bg-background text-muted-foreground ring-1 ring-foreground/10">
                <ImageOff aria-hidden="true" className="size-5" />
              </span>
              <div>
                <p className="text-sm font-medium">Sin logo configurado</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Se activará cuando exista el modelo de asset.
                </p>
              </div>
            </div>
          </div>
          <Button disabled type="button" variant="outline">
            <ImageOff aria-hidden="true" />
            Subir logo
          </Button>
        </div>

        <div className="flex items-start gap-3 rounded-lg border border-amber-300/70 bg-amber-50/70 p-4 text-amber-950 dark:border-amber-400/30 dark:bg-amber-950/30 dark:text-amber-100">
          <Info
            aria-hidden="true"
            className="mt-0.5 size-5 shrink-0 text-amber-700 dark:text-amber-200"
          />
          <div className="space-y-1">
            <p className="text-sm font-semibold">Subida de logo pendiente</p>
            <p className="text-sm leading-6 text-amber-900/85 dark:text-amber-100/85">
              No se guarda logo real porque todavía no hay modelo de asset,
              Storage privado ni permisos de documentos.
            </p>
            <p className="text-sm leading-6 text-amber-900/85 dark:text-amber-100/85">
              Se mantiene como configuración futura de la organización.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TimeTrackingSettingsSummary({
  settings,
}: {
  settings: ResolvedOrganizationTimeTrackingSettings;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/20 p-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">Correcciones de fichaje</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {settings.correctionApprovalRequired
            ? "Cada corrección queda pendiente hasta que un perfil autorizado la revise. Una aprobación válida basta antes de aplicarla."
            : "Cada persona corrige directamente sus propios fichajes; el motivo y los cambios quedan auditados."}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          {settings.scheduleAutoPunchesEnabled
            ? "El fichaje automático por planificación puede generar entradas y salidas desde bloques asignados y franjas de jornada prevista."
            : "El fichaje automático por planificación está desactivado."}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge
          tone={settings.correctionApprovalRequired ? "warning" : "success"}
        >
          {settings.correctionApprovalRequired
            ? "Con aprobación"
            : "Correcciones directas"}
        </StatusBadge>
        <StatusBadge
          tone={settings.scheduleAutoPunchesEnabled ? "success" : "neutral"}
        >
          {settings.scheduleAutoPunchesEnabled
            ? "Automático activado"
            : "Automático desactivado"}
        </StatusBadge>
      </div>
    </div>
  );
}

function TimeTrackingSettingsForm({
  organization,
  settings,
}: {
  organization: ActiveOrganization;
  settings: ResolvedOrganizationTimeTrackingSettings;
}) {
  return (
    <form action={updateTimeTrackingSettings} className="grid gap-5">
      <input name="organizationId" type="hidden" value={organization.id} />

      <fieldset className="grid gap-3">
        <legend className="text-sm font-medium">Modo de corrección</legend>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="flex min-h-full cursor-pointer items-start gap-3 rounded-lg border border-border bg-muted/20 p-3 transition-colors hover:bg-muted/30 has-[:checked]:border-primary/60 has-[:checked]:bg-primary/5">
            <input
              className="mt-1 size-4 shrink-0 accent-primary"
              defaultChecked={!settings.correctionApprovalRequired}
              name="correctionMode"
              type="radio"
              value="direct"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium">
                Correcciones directas
              </span>
              <span className="mt-1 block text-sm text-muted-foreground">
                La persona corrige su propio fichaje al enviar. BoxOps guarda el
                motivo, la auditoría y los valores antes y después del cambio.
              </span>
            </span>
          </label>
          <label className="flex min-h-full cursor-pointer items-start gap-3 rounded-lg border border-border bg-muted/20 p-3 transition-colors hover:bg-muted/30 has-[:checked]:border-primary/60 has-[:checked]:bg-primary/5">
            <input
              className="mt-1 size-4 shrink-0 accent-primary"
              defaultChecked={settings.correctionApprovalRequired}
              name="correctionMode"
              type="radio"
              value="approval"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium">
                Correcciones con aprobación
              </span>
              <span className="mt-1 block text-sm text-muted-foreground">
                La corrección queda pendiente. Propietario, Administrador o
                Responsable pueden aprobarla; con una aprobación válida basta
                antes de aplicarla.
              </span>
            </span>
          </label>
        </div>
      </fieldset>

      <fieldset className="grid gap-3">
        <legend className="text-sm font-medium">Fichaje automático</legend>
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-muted/20 p-3 transition-colors hover:bg-muted/30 has-[:checked]:border-primary/60 has-[:checked]:bg-primary/5">
          <input
            name="scheduleAutoPunchesEnabled"
            type="hidden"
            value="false"
          />
          <input
            className="mt-1 size-4 shrink-0 accent-primary"
            defaultChecked={settings.scheduleAutoPunchesEnabled}
            name="scheduleAutoPunchesEnabled"
            type="checkbox"
            value="true"
          />
          <span className="min-w-0">
            <span className="block text-sm font-medium">
              Generar fichajes desde la planificación
            </span>
            <span className="mt-1 block text-sm text-muted-foreground">
              Crea entradas y salidas automáticas desde bloques asignados y
              franjas de jornada prevista. No verifica presencia real y siempre
              queda corregible.
            </span>
          </span>
        </label>
      </fieldset>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit">
          <Save aria-hidden="true" />
          Guardar política de fichaje
        </Button>
        <p className="inline-flex items-start gap-2 text-sm text-muted-foreground">
          <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>No activa payroll, nómina ni cumplimiento legal definitivo.</span>
        </p>
      </div>
    </form>
  );
}

function TimeTrackingSettingsCard({
  canManageTimeSettings,
  organization,
  settings,
}: {
  canManageTimeSettings: boolean;
  organization: ActiveOrganization;
  settings: ResolvedOrganizationTimeTrackingSettings;
}) {
  return (
    <Card className="py-0">
      <CardContent className="space-y-5 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/10">
            <FileClock aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0 space-y-1">
            <h3 className="text-base font-semibold tracking-tight">
              Correcciones
            </h3>
            <p className="text-sm text-muted-foreground">
              El modo directo sigue siendo auditable: crea corrección, aplica
              cambios controlados y conserva el histórico operativo.
            </p>
          </div>
        </div>

        {canManageTimeSettings ? (
          <TimeTrackingSettingsForm
            organization={organization}
            settings={settings}
          />
        ) : (
          <TimeTrackingSettingsSummary settings={settings} />
        )}
      </CardContent>
    </Card>
  );
}

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect(getLoginPath("/app/settings"));
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
          badge="Configuración"
          description="Ajustes mínimos de organización y marca ligera."
          title="Configuración"
        />
        <OrganizationResolutionState
          basePath="/app/settings"
          resolution={resolution}
        />
      </div>
    );
  }

  const canManageSettings = canManageTenantSettings(resolution.membership.role);
  const canManageTimeSettings = canManageTimeTrackingSettings(
    resolution.membership.role,
  );
  const theme = resolveOrganizationTheme(resolution.organization.theme_config);
  const timeTrackingSettings = resolveOrganizationTimeTrackingSettings(
    resolution.organization.time_tracking_config,
  );
  const roleLabel = getApplicationRoleLabel(resolution.membership.role);

  return (
    <div className="space-y-6">
      <PageHeader
        actions={
          <Button asChild variant="outline">
            <a href="#vista-marca">
              <Eye aria-hidden="true" />
              Vista previa
            </a>
          </Button>
        }
        badge="Configuración"
        description="Identidad visual básica y reglas de fichaje de la organización activa."
        meta={
          <>
            <Badge variant="secondary">{resolution.organization.name}</Badge>
            <Badge variant="outline">{roleLabel}</Badge>
          </>
        }
        title="Configuración"
      />

      {status && successMessages[status] ? (
        <TransientFeedbackBanner
          description={
            status === "time-tracking-updated"
              ? "La política de fichaje ya está disponible."
              : "La identidad de la organización ya está aplicada."
          }
          title={successMessages[status]}
          tone="success"
        />
      ) : null}

      {error && errorMessages[error] ? (
        <TransientFeedbackBanner
          description={errorMessages[error]}
          title="No se han guardado los cambios"
          tone="error"
        />
      ) : null}

      {!canManageSettings ? (
        <Alert>
          <ShieldCheck aria-hidden="true" className="size-4" />
          <AlertTitle>
            {canManageTimeSettings ? "Identidad visual en lectura" : "Modo lectura"}
          </AlertTitle>
          <AlertDescription>
            {canManageTimeSettings
              ? "Tu rol no puede cambiar la identidad visual ni los ajustes globales de la organización, pero sí puede gestionar la política de fichaje."
              : "Tu rol puede consultar la organización activa, pero no cambiar su configuración."}
          </AlertDescription>
        </Alert>
      ) : null}

      <IdentitySettingsCard
        canManageSettings={canManageSettings}
        organization={resolution.organization}
        theme={theme}
      />

      <section className="space-y-3">
        <SectionHeader
          description="Define cómo se gestionan las correcciones y el fichaje automático en la organización."
          title="Política de fichaje"
        />
        <TimeTrackingSettingsCard
          canManageTimeSettings={canManageTimeSettings}
          organization={resolution.organization}
          settings={timeTrackingSettings}
        />
      </section>

      <section className="space-y-3">
        <SectionHeader
          description="Primera decisión documentada para no abrir un módulo de Storage antes de tiempo."
          title="Logo de la organización"
        />
        <LogoSettingsCard />
      </section>

      <section
        aria-label="Nota importante"
        className="flex items-start gap-3 rounded-lg border border-sky-200 bg-sky-50/80 p-4 text-sky-950 dark:border-sky-400/30 dark:bg-sky-950/30 dark:text-sky-100"
      >
        <Info
          aria-hidden="true"
          className="mt-0.5 size-5 shrink-0 text-sky-700 dark:text-sky-200"
        />
        <div className="space-y-1">
          <h2 className="text-sm font-semibold">Importante</h2>
          <p className="text-sm leading-6 text-sky-900/85 dark:text-sky-100/85">
            Estos ajustes cambian la apariencia y las reglas operativas futuras,
            pero no modifican datos históricos ni estados de fichaje ya
            existentes.
          </p>
        </div>
      </section>
    </div>
  );
}
