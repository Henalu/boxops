import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  BarChart3,
  CalendarClock,
  CalendarDays,
  CalendarOff,
  CalendarRange,
  CircleHelp,
  Dumbbell,
  FileText,
  Inbox,
  LogOut,
  MapPin,
  ReceiptText,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Timer,
  UserRound,
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
  CardTitle,
} from "@/components/ui/card";
import { getLoginPath } from "@/lib/auth/redirects";
import {
  canManageStaffWorkWindows,
  canManageOperationalData,
  canReadTenantBilling,
  getApplicationRoleLabel,
} from "@/lib/auth/permissions";
import {
  getActiveMemberships,
  getAuthenticatedUser,
  resolveActiveOrganization,
} from "@/lib/auth/tenant";
import { PLATFORM_SUPPORT_ACCESS_ROLE } from "@/lib/platform-support-session-cookie";
import { getActivePlatformAdmin } from "@/lib/platform-console";
import {
  getAbsencesPath,
  getAccountPath,
  getCentersPath,
  getClassTypesPath,
  getCoachesPath,
  getDocumentsPath,
  getRequestsPath,
  getSchedulePath,
  getScheduleTemplatesPath,
  getSettingsPath,
  getSettingsBillingPath,
  getStatsPath,
  getTimePath,
  getWorkWindowsPath,
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

function MoreSectionHeader({
  description,
  icon: Icon,
  title,
}: {
  description?: string;
  icon: LucideIcon;
  title: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/10">
        <Icon aria-hidden="true" className="size-4" />
      </span>
      <div className="min-w-0">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {description ? (
          <p className="mt-1 hidden text-sm text-muted-foreground md:block">
            {description}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function FeaturedHubLink({
  description,
  href,
  icon: Icon,
  label,
  title,
}: {
  description: string;
  href: string;
  icon: LucideIcon;
  label: string;
  title: string;
}) {
  return (
    <Link
      className="group flex min-h-24 flex-col gap-4 rounded-xl bg-primary/5 p-4 text-left text-sm text-card-foreground ring-1 ring-primary/20 transition-[background-color,box-shadow] hover:bg-primary/10 hover:shadow-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:flex-row md:items-center md:justify-between"
      href={href}
    >
      <span className="flex min-w-0 items-start gap-4">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
          <Icon aria-hidden="true" className="size-5" />
        </span>
        <span className="min-w-0">
          <span className="block font-semibold leading-snug">{title}</span>
          <span className="mt-1 block max-w-2xl text-sm leading-5 text-muted-foreground">
            {description}
          </span>
        </span>
      </span>
      <span className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-primary/25 bg-background px-3 text-sm font-medium text-primary transition-colors group-hover:bg-background/80">
        {label}
        <ArrowRight
          aria-hidden="true"
          className="size-3.5 transition-transform group-hover:translate-x-0.5"
        />
      </span>
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
  const roleLabel = getApplicationRoleLabel(resolution.membership.role);
  const isSupportMode = resolution.membership.role === PLATFORM_SUPPORT_ACCESS_ROLE;
  const canManageOperational = canManageOperationalData(
    resolution.membership.role,
  );
  const canManageWorkWindows = canManageStaffWorkWindows(
    resolution.membership.role,
  );
  const canReadBilling = canReadTenantBilling(resolution.membership.role);
  const activePlatformAdminResult = await getActivePlatformAdmin().catch(
    () => null,
  );
  const canOpenConsole = activePlatformAdminResult?.ok === true;

  return (
    <div className="space-y-5 md:space-y-6">
      <PageHeader
        badge="Más"
        description={
          canManageOperational
            ? "Gestión del box, ayuda y accesos secundarios."
            : isSupportMode
              ? "Revision operativa temporal, separada de acciones personales."
            : "Tus accesos personales, consulta operativa y ayuda."
        }
        meta={
          <>
            <Badge variant="outline">{resolution.organization.name}</Badge>
            <Badge variant="outline">{roleLabel}</Badge>
          </>
        }
        title="Más"
      />

      {canManageOperational ? (
        <section className="space-y-2.5 md:space-y-3">
          <MoreSectionHeader
            description="Pantallas de administración que no necesitan estar siempre en la navegación principal."
            icon={SlidersHorizontal}
            title="Gestión"
          />
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
            {canManageWorkWindows ? (
              <MobileHubLink
                description="Franjas previstas del equipo"
                href={getWorkWindowsPath(baseOptions)}
                icon={CalendarClock}
                title="Jornadas"
              />
            ) : null}
            <MobileHubLink
              description="Carga, clases y cobertura"
              href={getStatsPath(baseOptions)}
              icon={BarChart3}
              title="Estadísticas"
            />
            <MobileHubLink
              description="Marca y organización"
              href={getSettingsPath(baseOptions)}
              icon={Settings}
              title="Configuración"
            />
            {canReadBilling ? (
              <MobileHubLink
                description="Plan, límites y uso"
                href={getSettingsBillingPath(baseOptions)}
                icon={ReceiptText}
                title="Plan y facturacion"
              />
            ) : null}
          </div>
          <div className="hidden gap-3 md:grid md:grid-cols-2 xl:grid-cols-3">
            <ActionCard
              description="Gestiona sedes activas e inactivas del box."
              href={getCentersPath(baseOptions)}
              icon={MapPin}
              label="Abrir centros"
              title="Centros"
            />
            <ActionCard
              description="Revisa accesos, roles y fichas operativas de entrenadores."
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
            {canManageWorkWindows ? (
              <ActionCard
                description="Gestiona franjas previstas por persona, día, centro y vigencia."
                href={getWorkWindowsPath(baseOptions)}
                icon={CalendarClock}
                label="Abrir jornadas"
                title="Jornadas"
              />
            ) : null}
            <ActionCard
              description="Compara carga de coaches, tipos de clase y riesgos de cobertura."
              href={getStatsPath(baseOptions)}
              icon={BarChart3}
              label="Abrir estadísticas"
              title="Estadísticas"
            />
            <ActionCard
              description="Ajusta nombre visible y marca ligera de la organización."
              href={getSettingsPath(baseOptions)}
              icon={Settings}
              label="Abrir configuración"
              title="Configuración"
            />
            {canReadBilling ? (
              <ActionCard
                description="Revisa plan, límites incluidos y uso actual de la organización."
                href={getSettingsBillingPath(baseOptions)}
                icon={ReceiptText}
                label="Abrir plan"
                title="Plan y facturacion"
              />
            ) : null}
          </div>
        </section>
      ) : isSupportMode ? (
        <section className="space-y-2.5 md:space-y-3">
          <SectionHeader
            description="Sesion temporal auditada para revisar contexto operativo. No abre acciones personales ni soporte sobre datos sensibles."
            title="Soporte"
          />
          <div className="grid gap-2.5 md:hidden">
            <MobileHubLink
              description="Semana y bloques"
              href={getSchedulePath(baseOptions)}
              icon={CalendarDays}
              title="Horario"
            />
            <MobileHubLink
              description="Personas y fichas visibles"
              href={getCoachesPath(baseOptions)}
              icon={UsersRound}
              title="Equipo"
            />
            <MobileHubLink
              description="Sedes disponibles"
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
          </div>
          <div className="hidden gap-3 md:grid md:grid-cols-2">
            <ActionCard
              description="Revisa la semana y el contexto de bloques sin editar."
              href={getSchedulePath(baseOptions)}
              icon={CalendarDays}
              label="Abrir horario"
              title="Horario"
            />
            <ActionCard
              description="Consulta personas, fichas visibles y datos de equipo."
              href={getCoachesPath(baseOptions)}
              icon={UsersRound}
              label="Abrir equipo"
              title="Equipo"
            />
            <ActionCard
              description="Revisa sedes disponibles y contexto basico de centros."
              href={getCentersPath(baseOptions)}
              icon={MapPin}
              label="Abrir centros"
              title="Centros"
            />
            <ActionCard
              description="Consulta el catálogo operativo de clases y actividades."
              href={getClassTypesPath(baseOptions)}
              icon={Dumbbell}
              label="Abrir tipos"
              title="Tipos de actividad"
            />
          </div>
        </section>
      ) : (
        <>
          <section className="space-y-2.5 md:space-y-3">
            <SectionHeader
              description="Accesos centrados en tu jornada, tus próximas clases y tu información personal."
              title="Mi actividad"
            />
            <div className="grid gap-2.5 md:hidden">
              <MobileHubLink
                description="Clases asignadas"
                href={getSchedulePath({ ...baseOptions, mineOnly: true })}
                icon={CalendarDays}
                title="Próximas clases"
              />
              <MobileHubLink
                description="Semana, avisos y correcciones"
                href={getTimePath(baseOptions)}
                icon={BarChart3}
                title="Estadísticas personales"
              />
              <MobileHubLink
                description="Versiones visibles por permiso"
                href={getDocumentsPath(baseOptions)}
                icon={FileText}
                title="Documentos"
              />
            </div>
            <div className="hidden gap-3 md:grid md:grid-cols-2">
              <ActionCard
                description="Consulta solo tus bloques asignados y abre el detalle de la semana."
                href={getSchedulePath({ ...baseOptions, mineOnly: true })}
                icon={CalendarDays}
                label="Abrir mi horario"
                title="Próximas clases"
              />
              <ActionCard
                description="Revisa tu semana de fichaje, avisos personales y correcciones."
                href={getTimePath(baseOptions)}
                icon={BarChart3}
                label="Abrir fichaje"
                title="Estadísticas personales"
              />
              <ActionCard
                description="Consulta versiones documentales visibles por grants, sujetos o capacidades."
                href={getDocumentsPath(baseOptions)}
                icon={FileText}
                label="Abrir documentos"
                title="Documentos"
              />
            </div>
          </section>
          <section className="space-y-2.5 md:space-y-3">
            <SectionHeader
              description="Datos de la organización que un entrenador puede consultar en modo lectura."
              title="Consulta"
            />
            <div className="grid gap-2.5 md:hidden">
              <MobileHubLink
                description="Personas y fichas visibles"
                href={getCoachesPath(baseOptions)}
                icon={UsersRound}
                title="Equipo"
              />
              <MobileHubLink
                description="Sedes disponibles"
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
            </div>
            <div className="hidden gap-3 md:grid md:grid-cols-2">
              <ActionCard
                description="Consulta personas, fichas visibles y datos de equipo en modo lectura."
                href={getCoachesPath(baseOptions)}
                icon={UsersRound}
                label="Abrir equipo"
                title="Equipo"
              />
              <ActionCard
                description="Revisa sedes disponibles y contexto básico de centros."
                href={getCentersPath(baseOptions)}
                icon={MapPin}
                label="Abrir centros"
                title="Centros"
              />
              <ActionCard
                description="Consulta el catálogo de clases y actividades usadas en el horario."
                href={getClassTypesPath(baseOptions)}
                icon={Dumbbell}
                label="Abrir tipos"
                title="Tipos de actividad"
              />
            </div>
          </section>
        </>
      )}

      {!isSupportMode ? (
      <section className="space-y-2.5 md:hidden">
        <SectionHeader title="Personal" />
        <MobileHubLink
          description="Vacaciones y permisos"
          href={getAbsencesPath(baseOptions)}
          icon={CalendarOff}
          title="Ausencias"
        />
        <MobileHubLink
          description="Cambios y cobertura"
          href={getRequestsPath(baseOptions)}
          icon={Inbox}
          title="Solicitudes"
        />
        <MobileHubLink
          description="Versiones visibles"
          href={getDocumentsPath(baseOptions)}
          icon={FileText}
          title="Documentos"
        />
        <MobileHubLink
          description="Perfil visible y cuenta"
          href={getAccountPath(baseOptions)}
          icon={UserRound}
          title="Mi cuenta"
        />
        <MobileHubLink
          description="Entrada, salida y registros"
          href={getTimePath(baseOptions)}
          icon={Timer}
          title="Mi fichaje"
        />
        <Card size="sm">
          <CardContent className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {resolution.organization.name}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {roleLabel}
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
      ) : null}

      {!isSupportMode ? (
      <section className="hidden space-y-3 md:block">
        <SectionHeader title="Personal" />
        <div className="grid gap-3 md:grid-cols-2">
          <ActionCard
            description="Consulta tus ausencias y, si gestionas el box, revisa pendientes minimizados."
            href={getAbsencesPath(baseOptions)}
            icon={CalendarOff}
            label="Abrir ausencias"
            title="Ausencias"
          />
          <ActionCard
            description="Revisa cambios de bloque y cobertura propios o recibidos."
            href={getRequestsPath(baseOptions)}
            icon={Inbox}
            label="Abrir solicitudes"
            title="Solicitudes"
          />
          <ActionCard
            description="Consulta las versiones documentales visibles para tu permiso."
            href={getDocumentsPath(baseOptions)}
            icon={FileText}
            label="Abrir documentos"
            title="Documentos"
          />
          <ActionCard
            description="Revisa tu cuenta, perfil visible y frontera personal segura."
            href={getAccountPath(baseOptions)}
            icon={UserRound}
            label="Abrir Mi cuenta"
            title="Mi cuenta"
          />
          <ActionCard
            description="Registra entrada o salida manual y consulta tus jornadas recientes."
            href={getTimePath(baseOptions)}
            icon={Timer}
            label="Abrir fichaje"
            title="Mi fichaje"
          />
        </div>
      </section>
      ) : null}

      {canOpenConsole ? (
        <section className="space-y-2.5 md:space-y-3">
          <MoreSectionHeader
            description="Acceso interno de plataforma separado de la gestión diaria del box."
            icon={ShieldCheck}
            title="Plataforma"
          />
          <div className="grid gap-2.5 md:hidden">
            <MobileHubLink
              description="Consola SaaS interna"
              href="/console"
              icon={ShieldCheck}
              title="BoxOps Console"
            />
          </div>
          <div className="hidden md:block">
            <FeaturedHubLink
              description="Abre el dashboard interno de plataforma para organizaciones, soporte y suscripciones."
              href="/console"
              icon={ShieldCheck}
              label="Abrir Console"
              title="BoxOps Console"
            />
          </div>
        </section>
      ) : null}

      <section className="space-y-3">
        <MoreSectionHeader
          description="Recursos para empezar y acceder a lo que necesitas."
          icon={CircleHelp}
          title="Ayuda"
        />
        <div className="grid gap-3 md:grid-cols-2">
          <Card className="min-h-36" size="sm">
            <CardContent className="flex h-full flex-col gap-4">
              <div className="flex items-start gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/10">
                  <CircleHelp aria-hidden="true" className="size-5" />
                </span>
                <div className="min-w-0">
                  <CardTitle>Guía inicial</CardTitle>
                  <CardDescription className="mt-1">
                    Vuelve a ver la guía de navegación del MVP.
                  </CardDescription>
                </div>
              </div>
              <div className="mt-auto">
                <OnboardingLaunchButton label="Reiniciar guía" />
              </div>
            </CardContent>
          </Card>

          {canManageOperational ? (
            <Card className="min-h-36" size="sm">
              <CardContent className="flex h-full flex-col gap-4">
                <div>
                  <CardTitle>Acceso actual</CardTitle>
                  <CardDescription className="mt-1">
                    Estás trabajando en {resolution.organization.name} con rol{" "}
                    {roleLabel}.
                  </CardDescription>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="min-w-0 rounded-lg bg-muted/45 p-3">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <MapPin aria-hidden="true" className="size-3.5" />
                      Organización
                    </div>
                    <p className="mt-1 truncate text-sm font-medium">
                      {resolution.organization.name}
                    </p>
                  </div>
                  <div className="min-w-0 rounded-lg bg-muted/45 p-3">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <ShieldCheck aria-hidden="true" className="size-3.5" />
                      Rol
                    </div>
                    <p className="mt-1 truncate text-sm font-medium">
                      {roleLabel}
                    </p>
                  </div>
                </div>
                <Link
                  className="mt-auto inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
                  href={getScheduleTemplatesPath(baseOptions)}
                >
                  Ir a plantillas semanales
                  <ArrowRight aria-hidden="true" className="size-3.5" />
                </Link>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </section>
    </div>
  );
}
