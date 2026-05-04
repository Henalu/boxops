import Link from "next/link";
import { redirect } from "next/navigation";
import {
  CalendarRange,
  CircleHelp,
  Dumbbell,
  MapPin,
  Settings,
  UsersRound,
} from "lucide-react";

import { OrganizationResolutionState } from "@/components/features/organization-resolution-state";
import {
  ActionCard,
  PageHeader,
  SectionHeader,
} from "@/components/features/operations-ui";
import { OnboardingLaunchButton } from "@/components/layout/onboarding-tour";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getLoginPath } from "@/lib/auth/redirects";
import {
  getActiveMemberships,
  getAuthenticatedUser,
  resolveActiveOrganization,
} from "@/lib/auth/tenant";
import {
  getCentersPath,
  getClassTypesPath,
  getCoachesPath,
  getScheduleTemplatesPath,
} from "@/lib/navigation/app-paths";
import { resolveWeek } from "@/lib/schedule-blocks";

export const dynamic = "force-dynamic";

type MorePageProps = {
  searchParams: Promise<{
    organizationId?: string | string[];
    week?: string | string[];
  }>;
};

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function MorePage({ searchParams }: MorePageProps) {
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect(getLoginPath("/app/more"));
  }

  const params = await searchParams;
  const organizationId = getParam(params.organizationId);
  const weekParam = getParam(params.week);
  const memberships = await getActiveMemberships(user.id);
  const resolution = resolveActiveOrganization(memberships, organizationId);

  if (!resolution.ok) {
    return (
      <div className="space-y-6">
        <PageHeader title="Mas" />
        <OrganizationResolutionState basePath="/app/more" resolution={resolution} />
      </div>
    );
  }

  const week = resolveWeek(weekParam, resolution.organization.timezone);
  const baseOptions = {
    organizationId: resolution.organization.id,
    week: week.weekStart,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        badge="Mas"
        description="Gestion del box, ayuda y accesos secundarios."
        meta={<Badge variant="outline">{resolution.organization.name}</Badge>}
        title="Mas"
      />

      <section className="space-y-3">
        <SectionHeader
          description="Pantallas de administracion que no necesitan estar siempre en la navegacion principal."
          title="Gestion"
        />
        <div className="grid gap-3 md:grid-cols-2">
          <ActionCard
            description="Gestiona sedes activas e inactivas del box."
            href={getCentersPath(baseOptions)}
            icon={MapPin}
            label="Abrir centros"
            title="Centros"
          />
          <ActionCard
            description="Revisa accesos, roles y fichas operativas de coaches."
            href={getCoachesPath(baseOptions)}
            icon={UsersRound}
            label="Abrir equipo"
            title="Equipo"
          />
          <ActionCard
            description="Define las clases y actividades usadas en horario y plantillas."
            href={getClassTypesPath(baseOptions)}
            icon={Dumbbell}
            label="Abrir tipos"
            title="Tipos de actividad"
          />
          <ActionCard
            description="Crea semanas tipo y aplicalas al horario real."
            href={getScheduleTemplatesPath(baseOptions)}
            icon={CalendarRange}
            label="Abrir plantillas"
            title="Plantillas"
          />
        </div>
      </section>

      <section className="space-y-3">
        <SectionHeader title="Ayuda" />
        <div className="grid gap-3 md:grid-cols-2">
          <Card size="sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CircleHelp aria-hidden="true" className="size-4" />
                Guia inicial
              </CardTitle>
              <CardDescription>
                Vuelve a ver la guia de navegacion del MVP.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <OnboardingLaunchButton label="Reiniciar guia" />
            </CardContent>
          </Card>

          <Card className="opacity-80" size="sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings aria-hidden="true" className="size-4" />
                Configuracion
              </CardTitle>
              <CardDescription>
                Ajustes avanzados del box. Pendiente de una tarea dedicada.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Badge variant="outline">No disponible todavia</Badge>
            </CardContent>
          </Card>
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Acceso actual</CardTitle>
          <CardDescription>
            Estas trabajando en {resolution.organization.name} con rol{" "}
            {resolution.membership.role}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            className="text-sm font-medium underline underline-offset-4"
            href={getScheduleTemplatesPath(baseOptions)}
          >
            Ir a plantillas semanales
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
