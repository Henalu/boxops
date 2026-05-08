import { redirect } from "next/navigation";
import { Building2, ImageOff, Palette, Save, ShieldCheck } from "lucide-react";

import { updateOrganizationSettings } from "./actions";
import {
  PageHeader,
  SectionHeader,
  StatusBadge,
} from "@/components/features/operations-ui";
import { OrganizationResolutionState } from "@/components/features/organization-resolution-state";
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
  getApplicationRoleLabel,
} from "@/lib/auth/permissions";
import {
  getActiveMemberships,
  getAuthenticatedUser,
  resolveActiveOrganization,
  type ActiveOrganization,
} from "@/lib/auth/tenant";
import {
  resolveOrganizationTheme,
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
  updated: "Configuración guardada.",
};

const errorMessages: Record<string, string> = {
  forbidden: "Tu rol no permite editar la configuración de la organización.",
  "invalid-accent-color": "Usa un color hexadecimal, por ejemplo #0f766e.",
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

        <label className="grid gap-2">
          <span className="text-sm font-medium">Color de acento</span>
          <div className="flex items-center gap-2">
            <ColorSwatch color={theme.accentColor} />
            <Input
              defaultValue={theme.accentColor ?? ""}
              maxLength={7}
              name="accentColor"
              pattern="#?[0-9a-fA-F]{6}"
              placeholder="#0f766e"
            />
          </div>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit">
          <Save aria-hidden="true" />
          Guardar configuración
        </Button>
        <p className="text-sm text-muted-foreground">
          Los estados críticos, error y foco conservan los tokens de BoxOps.
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
          El acento se usa como señal secundaria de tenant, sin cambiar la
          semántica operativa.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="flex min-h-16 items-center justify-between gap-3 rounded-lg border border-border bg-primary/10 px-3 py-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{organization.name}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Identidad BoxOps con acento del cliente.
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
          description="Ajustes mínimos de tenant y marca ligera."
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
  const theme = resolveOrganizationTheme(resolution.organization.theme_config);
  const roleLabel = getApplicationRoleLabel(resolution.membership.role);

  return (
    <div className="space-y-6">
      <PageHeader
        badge="Configuración"
        description="Control visual básico de la organización activa, con fallbacks de BoxOps."
        meta={
          <>
            <Badge variant="secondary">{resolution.organization.name}</Badge>
            <Badge variant="outline">Rol {roleLabel}</Badge>
          </>
        }
        title="Configuración"
      />

      {status && successMessages[status] ? (
        <Alert>
          <AlertTitle>{successMessages[status]}</AlertTitle>
          <AlertDescription>
            La identidad ligera del tenant ya está aplicada en esta sesión.
          </AlertDescription>
        </Alert>
      ) : null}

      {error && errorMessages[error] ? (
        <Alert variant="destructive">
          <AlertTitle>No se han guardado los cambios</AlertTitle>
          <AlertDescription>{errorMessages[error]}</AlertDescription>
        </Alert>
      ) : null}

      {!canManageSettings ? (
        <Alert>
          <ShieldCheck aria-hidden="true" className="size-4" />
          <AlertTitle>Modo lectura</AlertTitle>
          <AlertDescription>
            Tu rol puede consultar la organización activa, pero solo owner y
            admin compatible pueden cambiar configuración en este corte.
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
              Nombre visible y acento principal guardados en el tenant activo.
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
          description="Primera decision documentada para no abrir un modulo de Storage antes de tiempo."
          title="Logo"
        />
        <Alert>
          <ImageOff aria-hidden="true" className="size-4" />
          <AlertTitle>Subida de logo pendiente</AlertTitle>
          <AlertDescription>
            No se guarda logo real en B.1 porque todavía no hay modelo de asset,
            Storage privado ni permisos de documentos. Se mantiene como
            configuración futura del tenant.
          </AlertDescription>
        </Alert>
      </section>
    </div>
  );
}
