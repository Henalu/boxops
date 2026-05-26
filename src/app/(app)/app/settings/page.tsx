import { redirect } from "next/navigation";
import {
  Building2,
  FileClock,
  ImageOff,
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
  CardDescription,
  CardHeader,
  CardTitle,
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
    <form action={updateOrganizationSettings} className="grid gap-4">
      <input name="organizationId" type="hidden" value={organization.id} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <label className="grid gap-2">
          <span className="text-sm font-medium">Nombre visible</span>
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
        <p className="text-sm text-muted-foreground">
          Los colores de estados críticos, errores y foco mantienen la identidad
          visual base de BoxOps.
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
    <Card size="sm">
      <CardContent className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
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
      </CardContent>
    </Card>
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
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Palette aria-hidden="true" className="size-4" />
          Vista de marca ligera
        </CardTitle>
        <CardDescription>
          El color principal se usa como señal de marca de la organización, sin
          cambiar la semántica operativa.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="flex min-h-16 items-center justify-between gap-3 rounded-lg border border-border bg-primary/10 px-3 py-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{organization.name}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Vista de marca con el color principal de la organización.
            </p>
          </div>
          <ColorSwatch color={theme.accentColor} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ThemeStatusBadge theme={theme} />
          <StatusBadge tone="critical">Sin cubrir intacto</StatusBadge>
          <StatusBadge tone="warning">Conflicto intacto</StatusBadge>
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
    <Card size="sm">
      <CardContent className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">Correcciones de fichaje</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {settings.correctionApprovalRequired
              ? "Cada corrección queda pendiente hasta que un perfil autorizado la revise. Una aprobación válida basta antes de aplicarla."
              : "Cada persona corrige directamente sus propios fichajes; el motivo y los cambios quedan auditados."}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {settings.scheduleAutoPunchesEnabled
              ? "El fichaje automatico por planificacion puede generar entradas y salidas desde bloques asignados y franjas de jornada prevista."
              : "El fichaje automatico por planificacion esta desactivado."}
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
              ? "Automatico activado"
              : "Automatico desactivado"}
          </StatusBadge>
        </div>
      </CardContent>
    </Card>
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
    <form action={updateTimeTrackingSettings} className="grid gap-4">
      <input name="organizationId" type="hidden" value={organization.id} />

      <fieldset className="grid gap-3">
        <legend className="text-sm font-medium">Modo de corrección</legend>
        <label className="flex items-start gap-3 rounded-lg border border-border bg-muted/20 p-3">
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
        <label className="flex items-start gap-3 rounded-lg border border-border bg-muted/20 p-3">
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
      </fieldset>

      <fieldset className="grid gap-3">
        <legend className="text-sm font-medium">Fichaje automatico</legend>
        <label className="flex items-start gap-3 rounded-lg border border-border bg-muted/20 p-3">
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
              Generar fichajes desde la planificacion
            </span>
            <span className="mt-1 block text-sm text-muted-foreground">
              Crea entradas y salidas automaticas desde bloques asignados y
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
        <p className="text-sm text-muted-foreground">
          No activa payroll, nómina ni cumplimiento legal definitivo.
        </p>
      </div>
    </form>
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
              ? "La politica de fichaje ya esta disponible."
              : "La identidad de la organizacion ya esta aplicada."
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

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.75fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 aria-hidden="true" className="size-4" />
              Organización
            </CardTitle>
            <CardDescription>
              Nombre visible y color principal guardados en la organización
              activa.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {canManageSettings ? (
              <OrganizationSettingsForm
                organization={resolution.organization}
                theme={theme}
              />
            ) : (
              <OrganizationReadOnlySummary
                organization={resolution.organization}
                theme={theme}
              />
            )}
          </CardContent>
        </Card>

        <ThemePreview organization={resolution.organization} theme={theme} />
      </section>

      <section className="space-y-3">
        <SectionHeader
          description="Política de la organización para decidir si una corrección propia se aplica al enviar o pasa por aprobación."
          title="Fichaje"
        />
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileClock aria-hidden="true" className="size-4" />
              Correcciones
            </CardTitle>
            <CardDescription>
              El modo directo sigue siendo auditable: crea corrección, aplica
              cambios controlados y conserva el histórico operativo.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {canManageTimeSettings ? (
              <TimeTrackingSettingsForm
                organization={resolution.organization}
                settings={timeTrackingSettings}
              />
            ) : (
              <TimeTrackingSettingsSummary settings={timeTrackingSettings} />
            )}
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <SectionHeader
          description="Primera decisión documentada para no abrir un módulo de Storage antes de tiempo."
          title="Logo"
        />
        <Alert>
          <ImageOff aria-hidden="true" className="size-4" />
          <AlertTitle>Subida de logo pendiente</AlertTitle>
          <AlertDescription>
            No se guarda logo real en B.1 porque todavía no hay modelo de asset,
            Storage privado ni permisos de documentos. Se mantiene como
            configuración futura de la organización.
          </AlertDescription>
        </Alert>
      </section>
    </div>
  );
}
