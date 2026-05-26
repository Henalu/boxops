import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowLeft,
  BriefcaseBusiness,
  CalendarClock,
  CircleOff,
  Plus,
  Save,
  UsersRound,
} from "lucide-react";

import { OrganizationResolutionState } from "@/components/features/organization-resolution-state";
import {
  PageHeader,
  SectionHeader,
  StatCard,
} from "@/components/features/operations-ui";
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
import { getLoginPath } from "@/lib/auth/redirects";
import {
  canManageStaffWorkWindows,
  getApplicationRoleLabel,
} from "@/lib/auth/permissions";
import {
  getActiveMemberships,
  getAuthenticatedUser,
  resolveActiveOrganization,
} from "@/lib/auth/tenant";
import { getSchedulePath } from "@/lib/navigation/app-paths";
import {
  getAdjacentWeekStart,
  getTodayDateString,
  resolveWeek,
} from "@/lib/schedule-blocks";
import {
  formatStaffWorkWindowTime,
  getStaffWorkWindowDayLabel,
  getStaffWorkWindowStatusLabel,
  listStaffWorkWindowPersonOptions,
  listStaffWorkWindowsForWeek,
  type StaffWorkWindowCenterOption,
  type StaffWorkWindowDisplay,
  type StaffWorkWindowOccurrence,
  type StaffWorkWindowPersonOption,
} from "@/lib/staff-work-windows";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/supabase";

import {
  createStaffWorkWindow,
  deactivateStaffWorkWindow,
  updateStaffWorkWindow,
} from "../schedule/actions";
import { StaffWorkWindowFields } from "../schedule/staff-work-window-form-fields";
import { WorkWindowListClient } from "./work-window-list-client";

export const dynamic = "force-dynamic";

type WorkWindowsPageProps = {
  searchParams: Promise<{
    error?: string | string[];
    center_id?: string | string[];
    day?: string | string[];
    organizationId?: string | string[];
    person_profile_id?: string | string[];
    status?: string | string[];
    week?: string | string[];
    window_status?: string | string[];
  }>;
};

type CenterRow = Pick<Tables<"centers">, "id" | "name" | "status">;
type WorkWindowListFilters = {
  centerId: string;
  dayOfWeek: string;
  personProfileId: string;
  windowStatus: string;
};
type WorkWindowFilterOption = {
  label: string;
  value: string;
};

const ORGANIZATION_CENTER_FILTER = "organization";
const EMPTY_LIST_FILTERS: WorkWindowListFilters = {
  centerId: "",
  dayOfWeek: "",
  personProfileId: "",
  windowStatus: "",
};

const successMessages: Record<string, string> = {
  "work-window-created": "Jornada prevista creada.",
  "work-windows-created": "Jornadas previstas creadas.",
  "work-window-deactivated": "Jornada prevista desactivada.",
  "work-window-updated": "Jornada prevista actualizada.",
};

const successDescriptions: Partial<Record<keyof typeof successMessages, string>> = {
  "work-window-created":
    "La franja queda como presencia prevista, sin crear bloques ni fichajes.",
  "work-windows-created":
    "Las franjas quedan como presencia prevista, sin crear bloques ni fichajes.",
  "work-window-deactivated":
    "La franja deja de mostrarse como activa, sin borrar historial operativo.",
  "work-window-updated":
    "La semana se recalcula al vuelo con la nueva planificacion prevista.",
};

const errorMessages: Record<string, string> = {
  "authentication-required": "Vuelve a iniciar sesion para continuar.",
  "center-inactive": "El centro seleccionado no esta activo.",
  forbidden: "Tu rol no permite gestionar jornadas previstas.",
  "invalid-center": "El centro seleccionado no es valido.",
  "invalid-date": "La fecha de vigencia no es valida.",
  "invalid-day": "El dia de la jornada prevista no es valido.",
  "invalid-notes":
    "Las notas no pueden incluir datos sensibles, URLs ni identificadores privados.",
  "invalid-person-profile":
    "El perfil visible seleccionado no pertenece a esta organizacion.",
  "invalid-reference":
    "El centro o la persona seleccionada ya no estan disponibles.",
  "invalid-status": "El estado seleccionado no es valido.",
  "invalid-time": "La hora de inicio debe ser anterior a la hora de fin.",
  "missing-fields": "Completa los campos obligatorios.",
  "no-active-memberships": "No hay accesos activos para este usuario.",
  no_active_memberships: "No hay accesos activos para este usuario.",
  "notes-too-long": "Las notas no pueden superar 240 caracteres.",
  "organization-not-found": "La organizacion solicitada no esta disponible.",
  organization_not_found: "La organizacion solicitada no esta disponible.",
  "organization-required":
    "Elige una organizacion antes de gestionar jornadas previstas.",
  organization_required:
    "Elige una organizacion antes de gestionar jornadas previstas.",
  "person-profile-inactive": "El perfil visible seleccionado no esta activo.",
  "person-profile-internal":
    "Los perfiles internos no pueden usarse como jornada operativa.",
  "person-profile-without-active-coach":
    "Elige una ficha de entrenador activa para crear jornadas previstas.",
  "save-failed": "No se han podido guardar los cambios.",
  "work-window-required": "No se ha recibido la jornada prevista.",
};

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function getListFilters(params: Awaited<WorkWindowsPageProps["searchParams"]>) {
  return {
    centerId: getParam(params.center_id) ?? "",
    dayOfWeek: getParam(params.day) ?? "",
    personProfileId: getParam(params.person_profile_id) ?? "",
    windowStatus: getParam(params.window_status) ?? "",
  } satisfies WorkWindowListFilters;
}

function normalizeListFilters({
  filters,
  windows,
}: {
  filters: WorkWindowListFilters;
  windows: StaffWorkWindowDisplay[];
}) {
  const personIds = new Set(windows.map((window) => window.person_profile_id));
  const centerIds = new Set(
    windows.flatMap((window) => (window.center_id ? [window.center_id] : [])),
  );
  const hasOrganizationWideWindows = windows.some((window) => !window.center_id);
  const dayOfWeeks = new Set(
    Array.from({ length: 7 }, (_, index) => String(index + 1)),
  );

  return {
    centerId:
      filters.centerId === ORGANIZATION_CENTER_FILTER &&
      hasOrganizationWideWindows
        ? filters.centerId
        : centerIds.has(filters.centerId)
          ? filters.centerId
          : "",
    dayOfWeek: dayOfWeeks.has(filters.dayOfWeek) ? filters.dayOfWeek : "",
    personProfileId: personIds.has(filters.personProfileId)
      ? filters.personProfileId
      : "",
    windowStatus:
      filters.windowStatus === "active" || filters.windowStatus === "inactive"
        ? filters.windowStatus
        : "",
  } satisfies WorkWindowListFilters;
}

function getListPersonOptions(windows: StaffWorkWindowDisplay[]) {
  const optionsById = new Map<string, WorkWindowFilterOption>();

  for (const window of windows) {
    if (!optionsById.has(window.person_profile_id)) {
      optionsById.set(window.person_profile_id, {
        label: window.personDisplayName,
        value: window.person_profile_id,
      });
    }
  }

  return [...optionsById.values()].sort((left, right) =>
    left.label.localeCompare(right.label, "es"),
  );
}

function getListCenterOptions(windows: StaffWorkWindowDisplay[]) {
  const optionsById = new Map<string, WorkWindowFilterOption>();

  for (const window of windows) {
    if (!window.center_id || optionsById.has(window.center_id)) {
      continue;
    }

    optionsById.set(window.center_id, {
      label: window.centerName ?? `Centro ${window.center_id.slice(0, 8)}`,
      value: window.center_id,
    });
  }

  return [...optionsById.values()].sort((left, right) =>
    left.label.localeCompare(right.label, "es"),
  );
}

function getWorkWindowsListPath({
  filters = EMPTY_LIST_FILTERS,
  organizationId,
  week,
}: {
  filters?: WorkWindowListFilters;
  organizationId: string;
  week: string;
}) {
  const params = new URLSearchParams({
    organizationId,
    week,
  });

  if (filters.personProfileId) {
    params.set("person_profile_id", filters.personProfileId);
  }

  if (filters.centerId) {
    params.set("center_id", filters.centerId);
  }

  if (filters.dayOfWeek) {
    params.set("day", filters.dayOfWeek);
  }

  if (filters.windowStatus) {
    params.set("window_status", filters.windowStatus);
  }

  return `/app/work-windows?${params.toString()}`;
}

async function getCenters(organizationId: string): Promise<CenterRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("centers")
    .select("id, name, status")
    .eq("organization_id", organizationId)
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`Could not load work window centers: ${error.message}`);
  }

  return (data ?? []) satisfies CenterRow[];
}

function formatServiceDate(value: string) {
  try {
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "short",
      timeZone: "UTC",
      weekday: "short",
    }).format(new Date(`${value}T12:00:00.000Z`));
  } catch {
    return value;
  }
}

function formatWeekRange(weekStart: string, weekEnd: string) {
  return `${formatServiceDate(weekStart)} - ${formatServiceDate(weekEnd)}`;
}

function groupOccurrencesByDate(occurrences: StaffWorkWindowOccurrence[]) {
  return occurrences.reduce((groups, occurrence) => {
    const dayOccurrences = groups.get(occurrence.serviceDate) ?? [];
    dayOccurrences.push(occurrence);
    groups.set(occurrence.serviceDate, dayOccurrences);

    return groups;
  }, new Map<string, StaffWorkWindowOccurrence[]>());
}

function WorkWindowActionHiddenInputs({
  organizationId,
  returnPath,
  weekStart,
}: {
  organizationId: string;
  returnPath: string;
  weekStart: string;
}) {
  return (
    <>
      <input name="organizationId" type="hidden" value={organizationId} />
      <input name="weekStart" type="hidden" value={weekStart} />
      <input name="returnPath" type="hidden" value={returnPath} />
    </>
  );
}

function WeekControls({
  currentWeekStart,
  filters,
  organizationId,
  weekEnd,
  weekStart,
}: {
  currentWeekStart: string;
  filters: WorkWindowListFilters;
  organizationId: string;
  weekEnd: string;
  weekStart: string;
}) {
  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium">Semana de gestion</p>
          <p className="text-sm text-muted-foreground">
            {formatWeekRange(weekStart, weekEnd)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <Link
              data-week-start={getAdjacentWeekStart(weekStart, -1)}
              data-work-window-week-link="true"
              href={getWorkWindowsListPath({
                filters,
                organizationId,
                week: getAdjacentWeekStart(weekStart, -1),
              })}
            >
              <ArrowLeft aria-hidden="true" />
              Anterior
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link
              data-week-start={currentWeekStart}
              data-work-window-week-link="true"
              href={getWorkWindowsListPath({
                filters,
                organizationId,
                week: currentWeekStart,
              })}
            >
              Hoy
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link
              data-week-start={getAdjacentWeekStart(weekStart, 1)}
              data-work-window-week-link="true"
              href={getWorkWindowsListPath({
                filters,
                organizationId,
                week: getAdjacentWeekStart(weekStart, 1),
              })}
            >
              Siguiente
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function WeekPresenceSummary({
  days,
  occurrences,
}: {
  days: string[];
  occurrences: StaffWorkWindowOccurrence[];
}) {
  const occurrencesByDate = groupOccurrencesByDate(occurrences);

  return (
    <div className="grid gap-2 md:grid-cols-7">
      {days.map((day) => {
        const dayOccurrences = occurrencesByDate.get(day) ?? [];

        return (
          <div
            className="min-h-24 rounded-lg border border-border/70 bg-background/70 p-3"
            key={day}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold">
                  {formatServiceDate(day)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {dayOccurrences.length === 0
                    ? "Sin jornada"
                    : `${dayOccurrences.length} prevista${
                        dayOccurrences.length === 1 ? "" : "s"
                      }`}
                </p>
              </div>
              <Badge variant="outline">{dayOccurrences.length}</Badge>
            </div>
            <div className="mt-3 space-y-1">
              {dayOccurrences.slice(0, 2).map((occurrence) => (
                <p
                  className="truncate rounded-md bg-muted/45 px-2 py-1 text-xs"
                  key={`${occurrence.id}-${occurrence.serviceDate}`}
                  title={`${occurrence.personDisplayName} ${formatStaffWorkWindowTime(
                    occurrence.start_time,
                  )}-${formatStaffWorkWindowTime(occurrence.end_time)}`}
                >
                  {occurrence.personDisplayName}
                </p>
              ))}
              {dayOccurrences.length > 2 ? (
                <p className="text-xs text-muted-foreground">
                  +{dayOccurrences.length - 2}
                </p>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function WorkWindowListItem({
  activeCenters,
  organizationId,
  people,
  returnPath,
  weekStart,
  window,
}: {
  activeCenters: StaffWorkWindowCenterOption[];
  organizationId: string;
  people: StaffWorkWindowPersonOption[];
  returnPath: string;
  weekStart: string;
  window: StaffWorkWindowDisplay;
}) {
  return (
    <details className="group min-w-0 overflow-hidden rounded-lg border border-border/70 bg-background/70">
      <summary className="flex min-w-0 cursor-pointer list-none flex-col gap-3 px-3 py-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:flex-row md:items-center md:justify-between [&::-webkit-details-marker]:hidden">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold">
              {window.personDisplayName}
            </p>
            <Badge variant={window.status === "active" ? "secondary" : "outline"}>
              {getStaffWorkWindowStatusLabel(window.status)}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {getStaffWorkWindowDayLabel(window.day_of_week)} /{" "}
            {formatStaffWorkWindowTime(window.start_time)}-
            {formatStaffWorkWindowTime(window.end_time)} /{" "}
            {window.centerName ?? "Toda la organizacion"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">
            Desde {formatServiceDate(window.valid_from)}
          </Badge>
          {window.valid_until ? (
            <Badge variant="outline">
              Hasta {formatServiceDate(window.valid_until)}
            </Badge>
          ) : null}
        </div>
      </summary>
      <div className="space-y-3 border-t border-border/70 p-3">
        <form
          action={updateStaffWorkWindow}
          className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"
        >
          <WorkWindowActionHiddenInputs
            organizationId={organizationId}
            returnPath={returnPath}
            weekStart={weekStart}
          />
          <input name="staffWorkWindowId" type="hidden" value={window.id} />
          <StaffWorkWindowFields
            activeCenters={activeCenters}
            people={people}
            window={window}
          />
          <div className="flex flex-wrap items-end gap-2 xl:col-span-4">
            <Button type="submit" variant="outline">
              <Save aria-hidden="true" />
              Guardar
            </Button>
          </div>
        </form>

        {window.status === "active" ? (
          <form action={deactivateStaffWorkWindow}>
            <WorkWindowActionHiddenInputs
              organizationId={organizationId}
              returnPath={returnPath}
              weekStart={weekStart}
            />
            <input name="staffWorkWindowId" type="hidden" value={window.id} />
            <Button size="sm" type="submit" variant="outline">
              <CircleOff aria-hidden="true" />
              Desactivar
            </Button>
          </form>
        ) : null}
      </div>
    </details>
  );
}

export default async function WorkWindowsPage({
  searchParams,
}: WorkWindowsPageProps) {
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect(getLoginPath("/app/work-windows"));
  }

  const params = await searchParams;
  const organizationId = getParam(params.organizationId);
  const status = getParam(params.status);
  const error = getParam(params.error);
  const weekParam = getParam(params.week);
  const rawListFilters = getListFilters(params);
  const memberships = await getActiveMemberships(user.id);
  const resolution = resolveActiveOrganization(memberships, organizationId);

  if (!resolution.ok) {
    return (
      <div className="space-y-6">
        <PageHeader title="Jornadas previstas" />
        <OrganizationResolutionState
          basePath="/app/work-windows"
          resolution={resolution}
        />
      </div>
    );
  }

  const roleLabel = getApplicationRoleLabel(resolution.membership.role);
  const canManage = canManageStaffWorkWindows(resolution.membership.role);
  const week = resolveWeek(weekParam, resolution.organization.timezone);
  const currentWeek = resolveWeek(undefined, resolution.organization.timezone);
  const currentDate = getTodayDateString(resolution.organization.timezone);

  if (!canManage) {
    return (
      <div className="space-y-6">
        <PageHeader
          badge="Gestion"
          description="La gestion de jornadas previstas queda limitada a roles operativos autorizados."
          meta={
            <>
              <Badge variant="outline">{resolution.organization.name}</Badge>
              <Badge variant="outline">{roleLabel}</Badge>
            </>
          }
          title="Jornadas previstas"
        />
        <Alert>
          <AlertTitle>Sin permisos de gestion</AlertTitle>
          <AlertDescription>
            Puedes consultar el contexto de jornada desde Horario si tu rol
            tiene acceso operativo, pero no editar las franjas previstas.
          </AlertDescription>
        </Alert>
        <Button asChild variant="outline">
          <Link
            href={getSchedulePath({
              organizationId: resolution.organization.id,
              week: week.weekStart,
            })}
          >
            <ArrowLeft aria-hidden="true" />
            Volver a Horario
          </Link>
        </Button>
      </div>
    );
  }

  const [centers, people, windowsResult] = await Promise.all([
    getCenters(resolution.organization.id),
    listStaffWorkWindowPersonOptions({
      organizationId: resolution.organization.id,
    }).catch(() => []),
    listStaffWorkWindowsForWeek({
      currentDate,
      includeInactive: true,
      organizationId: resolution.organization.id,
      weekEnd: week.weekEnd,
      weekStart: week.weekStart,
    })
      .then((data) => ({ data, ok: true as const }))
      .catch(() => ({
        data: { occurrences: [], windows: [] },
        ok: false as const,
      })),
  ]);
  const activeCenters = centers.filter(
    (center) => center.status === "active",
  ) satisfies StaffWorkWindowCenterOption[];
  const windows = windowsResult.data.windows;
  const listFilters = normalizeListFilters({
    filters: rawListFilters,
    windows,
  });
  const personFilterOptions = getListPersonOptions(windows);
  const centerFilterOptions = getListCenterOptions(windows);
  const hasOrganizationWideWindows = windows.some((window) => !window.center_id);
  const returnPath = getWorkWindowsListPath({
    filters: listFilters,
    organizationId: resolution.organization.id,
    week: week.weekStart,
  });
  const activeWindows = windows.filter((window) => window.status === "active");
  const activePeopleCount = new Set(
    activeWindows.map((window) => window.person_profile_id),
  ).size;
  const organizationWideCount = activeWindows.filter(
    (window) => !window.center_id,
  ).length;

  return (
    <div className="space-y-6">
      <PageHeader
        actions={
          <Button asChild variant="outline">
            <Link
              href={getSchedulePath({
                organizationId: resolution.organization.id,
                week: week.weekStart,
              })}
            >
              <ArrowLeft aria-hidden="true" />
              Horario
            </Link>
          </Button>
        }
        badge="Gestion"
        description="Administra franjas previstas por persona, dia, centro y vigencia sin mezclarlo con el tablero semanal."
        meta={
          <>
            <Badge variant="outline">{resolution.organization.name}</Badge>
            <Badge variant="outline">{roleLabel}</Badge>
          </>
        }
        title="Jornadas previstas"
      />

      <WeekControls
        currentWeekStart={currentWeek.weekStart}
        filters={listFilters}
        organizationId={resolution.organization.id}
        weekEnd={week.weekEnd}
        weekStart={week.weekStart}
      />

      {week.invalidWeekParam ? (
        <Alert>
          <AlertTitle>Semana ajustada</AlertTitle>
          <AlertDescription>
            La fecha recibida no era valida. Se muestra la semana actual.
          </AlertDescription>
        </Alert>
      ) : null}

      {status && successMessages[status] ? (
        <TransientFeedbackBanner
          description={
            successDescriptions[status] ??
            "La lista ya muestra las jornadas actuales."
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

      {!windowsResult.ok ? (
        <Alert>
          <AlertTitle>Jornadas no disponibles</AlertTitle>
          <AlertDescription>
            No se ha podido cargar la planificacion de esta semana.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-3 md:grid-cols-3">
        <StatCard
          description="Franjas activas que cruzan la semana visible."
          icon={BriefcaseBusiness}
          label="Activas"
          tone="success"
          value={activeWindows.length}
        />
        <StatCard
          description="Personas con al menos una franja activa esta semana."
          icon={UsersRound}
          label="Personas"
          tone="info"
          value={activePeopleCount}
        />
        <StatCard
          description="Franjas sin centro concreto, aplicadas a toda la organizacion."
          icon={CalendarClock}
          label="Toda la organizacion"
          value={organizationWideCount}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Crear franjas</CardTitle>
          <CardDescription>
            Alta rapida con selector de varios dias para repetir horario sin
            crear filas una a una.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            action={createStaffWorkWindow}
            className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"
          >
            <WorkWindowActionHiddenInputs
              organizationId={resolution.organization.id}
              returnPath={returnPath}
              weekStart={week.weekStart}
            />
            <StaffWorkWindowFields
              activeCenters={activeCenters}
              defaultDayOfWeek={1}
              defaultValidFrom={week.weekStart}
              multiDay
              people={people}
            />
            <div className="flex items-end xl:col-span-4">
              <Button disabled={people.length === 0} type="submit">
                <Plus aria-hidden="true" />
                Crear franjas
              </Button>
            </div>
          </form>
          {people.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Hace falta al menos una ficha de entrenador activa antes de crear
              jornadas previstas.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <section className="space-y-3">
        <SectionHeader
          description="Vista compacta de presencia prevista activa. La edicion vive en la lista inferior."
          title="Resumen semanal"
        />
        <WeekPresenceSummary
          days={week.days}
          occurrences={windowsResult.data.occurrences}
        />
      </section>

      <WorkWindowListClient
        centerOptions={centerFilterOptions}
        hasOrganizationWideWindows={hasOrganizationWideWindows}
        initialFilters={listFilters}
        items={windows.map((window) => ({
          centerId: window.center_id,
          dayOfWeek: String(window.day_of_week),
          id: window.id,
          personProfileId: window.person_profile_id,
          status: window.status,
        }))}
        organizationId={resolution.organization.id}
        personOptions={personFilterOptions}
        weekStart={week.weekStart}
      >
        {windows.map((window) => (
          <WorkWindowListItem
            activeCenters={activeCenters}
            key={window.id}
            organizationId={resolution.organization.id}
            people={people}
            returnPath={returnPath}
            weekStart={week.weekStart}
            window={window}
          />
        ))}
      </WorkWindowListClient>

    </div>
  );
}
