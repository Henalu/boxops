import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  CalendarRange,
  CircleHelp,
  Dumbbell,
  LogOut,
  MapPin,
  Settings,
  UsersRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { OrganizationResolutionState } from "@/components/features/organization-resolution-state";
import {
  ActionCard,
  PageHeader,
  SectionHeader,
} from "@/components/features/operations-ui";
import { OnboardingLaunchButton } from "@/components/layout/onboarding-tour";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

function MobileHubLink({
  description,
  href,
  icon: Icon,
  title,
}: {
  description: string;
  href: string;
  icon: LucideIcon;
  title: string;
}) {
  return (
    <Link
      className="flex min-h-16 items-center gap-3 rounded-xl bg-card px-4 py-2.5 text-left ring-1 ring-foreground/10 transition-colors hover:bg-muted/45 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:hidden"
      href={href}
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon aria-hidden="true" className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{title}</span>
        <span className="mt-0.5 block truncate text-sm text-muted-foreground">
          {description}
        </span>
      </span>
      <ArrowRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
    </Link>
  );
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
        <PageHeader title="Más" />
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
    <div className="space-y-5 md:space-y-6">
      <PageHeader
        badge="Más"
        description="Gestión del box, ayuda y accesos secundarios."
        meta={<Badge variant="outline">{resolution.organization.name}</Badge>}
        title="Más"
      />

      <section className="space-y-2.5 md:space-y-3">
        <div className="space-y-1">
          <SectionHeader title="Gestión" />
          <p className="hidden text-sm text-muted-foreground md:block">
            Pantallas de administración que no necesitan estar siempre en la
            navegación principal.
          </p>
        </div>
        <div className="grid gap-2.5 md:hidden">
          <MobileHubLink
            description="Sedes y estado operativo"
            href={getCentersPath(baseOptions)}
            icon={MapPin}
            title="Centros"
          />
          <MobileHubLink
            description="Clases y actividades"
            href={getClassTypesPath(baseOptions)}
            icon={Dumbbell}
            title="Tipos de actividad"
          />
          <MobileHubLink
            description="Semanas base reutilizables"
            href={getScheduleTemplatesPath(baseOptions)}
            icon={CalendarRange}
            title="Plantillas"
          />
        </div>
        <div className="hidden gap-3 md:grid md:grid-cols-2">
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
            description="Crea semanas tipo y aplícalas al horario real."
            href={getScheduleTemplatesPath(baseOptions)}
            icon={CalendarRange}
            label="Abrir plantillas"
            title="Plantillas"
          />
        </div>
      </section>

      <section className="space-y-2.5 md:hidden">
        <SectionHeader title="Mi cuenta" />
        <Card size="sm">
          <CardContent className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {resolution.organization.name}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Rol {resolution.membership.role}
                </p>
              </div>
              <Badge variant="outline">Activo</Badge>
            </div>
            <form action="/auth/sign-out" method="post">
              <Button className="w-full" type="submit" variant="outline">
                <LogOut aria-hidden="true" />
                Cerrar sesión
              </Button>
            </form>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <SectionHeader title="Ayuda" />
        <div className="grid gap-3 md:grid-cols-2">
          <Card size="sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CircleHelp aria-hidden="true" className="size-4" />
                Guía inicial
              </CardTitle>
              <CardDescription>
                Vuelve a ver la guía de navegación del MVP.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <OnboardingLaunchButton label="Reiniciar guía" />
            </CardContent>
          </Card>

          <Card className="opacity-80" size="sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings aria-hidden="true" className="size-4" />
                Configuración
              </CardTitle>
              <CardDescription>
                Ajustes avanzados del box. Pendiente de una tarea dedicada.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Badge variant="outline">No disponible todavía</Badge>
            </CardContent>
          </Card>
        </div>
      </section>

      <Card className="hidden md:flex">
        <CardHeader>
          <CardTitle>Acceso actual</CardTitle>
          <CardDescription>
            Estás trabajando en {resolution.organization.name} con rol{" "}
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
