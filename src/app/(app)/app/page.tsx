import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  Dumbbell,
  MapPin,
  ShieldCheck,
  UsersRound,
} from "lucide-react";

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
import { getLoginPath } from "@/lib/auth/redirects";
import {
  canManageOperationalData,
  getApplicationRoleLabel,
} from "@/lib/auth/permissions";
import {
  getActiveMemberships,
  getAuthenticatedUser,
  resolveActiveOrganization,
} from "@/lib/auth/tenant";
import {
  getCentersPath,
  getClassTypesPath,
  getCoachesPath,
  getCoveragePath,
  getSchedulePath,
  getScheduleTemplatesPath,
} from "@/lib/navigation/app-paths";
import {
  calculateScheduleCoverageByBlock,
  formatTimeForInput,
  getAdjacentWeekStart,
  getScheduleCoverageStateLabel,
  isScheduleRiskCoverageState,
  resolveWeek,
  type ScheduleBlockCoverage,
  type ScheduleCoverageState,
} from "@/lib/schedule-blocks";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/supabase";

export const dynamic = "force-dynamic";

type AppPageProps = {
  searchParams: Promise<{
    organizationId?: string | string[];
    week?: string | string[];
  }>;
};

type ScheduleBlockRow = Pick<
  Tables<"schedule_blocks">,
  | "center_id"
  | "class_type_id"
  | "end_time"
  | "id"
  | "is_template_exception"
  | "required_coaches"
  | "service_date"
  | "start_time"
  | "status"
>;

type CenterRow = Pick<Tables<"centers">, "id" | "name" | "status">;

type ClassTypeRow = Pick<
  Tables<"class_types">,
  "category" | "color" | "id" | "name" | "status"
>;

type ScheduleBlockAssignmentRow = Pick<
  Tables<"schedule_block_assignments">,
  "assignment_status" | "coach_profile_id" | "id" | "schedule_block_id"
>;

type CoachProfileRow = Pick<
  Tables<"coach_profiles">,
  "id" | "person_profile_id" | "status" | "updated_at" | "user_id"
>;

type PersonProfileRow = Pick<
  Tables<"person_profiles">,
  "display_name" | "id" | "status" | "user_id" | "visibility_status"
>;

type MembershipStatusRow = Pick<
  Tables<"organization_memberships">,
  "status" | "user_id"
>;

type CoachDisplay = {
  id: string;
  label: string;
};

type DashboardData = {
  assignments: ScheduleBlockAssignmentRow[];
  blocks: ScheduleBlockRow[];
  centers: CenterRow[];
  classTypes: ClassTypeRow[];
  coachDisplaysById: Map<string, CoachDisplay>;
  coverageByBlock: Map<string, ScheduleBlockCoverage>;
};

type RiskItem = {
  block: ScheduleBlockRow;
  coverage: ScheduleBlockCoverage;
};

const riskPriority: Record<ScheduleCoverageState, number> = {
  uncovered: 1,
  conflict: 2,
  insufficient: 3,
  covered: 4,
  not_required: 5,
  inactive: 6,
};

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
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

function formatTime(value: string) {
  return formatTimeForInput(value) || value;
}

function shortId(value: string) {
  return value.slice(0, 8);
}

function getBlockHref({
  blockId,
  organizationId,
  serviceDate,
  weekStart,
}: {
  blockId: string;
  organizationId: string;
  serviceDate: string;
  weekStart: string;
}) {
  return getSchedulePath({
    blockId,
    day: serviceDate,
    organizationId,
    view: "week",
    week: weekStart,
  });
}

async function getScheduleBlocks({
  organizationId,
  weekEnd,
  weekStart,
}: {
  organizationId: string;
  weekEnd: string;
  weekStart: string;
}) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("schedule_blocks")
    .select(
      "id, center_id, class_type_id, service_date, start_time, end_time, required_coaches, status, is_template_exception",
    )
    .eq("organization_id", organizationId)
    .gte("service_date", weekStart)
    .lte("service_date", weekEnd)
    .order("service_date", { ascending: true })
    .order("start_time", { ascending: true });

  if (error) {
    throw new Error(`Could not load dashboard schedule blocks: ${error.message}`);
  }

  return data satisfies ScheduleBlockRow[];
}

async function getCenters(organizationId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("centers")
    .select("id, name, status")
    .eq("organization_id", organizationId)
    .order("status", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`Could not load dashboard centers: ${error.message}`);
  }

  return data satisfies CenterRow[];
}

async function getClassTypes(organizationId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("class_types")
    .select("id, name, category, color, status")
    .eq("organization_id", organizationId)
    .order("status", { ascending: true })
    .order("category", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`Could not load dashboard class types: ${error.message}`);
  }

  return data satisfies ClassTypeRow[];
}

async function getScheduleBlockAssignments({
  blockIds,
  organizationId,
}: {
  blockIds: string[];
  organizationId: string;
}) {
  if (blockIds.length === 0) {
    return [];
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("schedule_block_assignments")
    .select("id, schedule_block_id, coach_profile_id, assignment_status")
    .eq("organization_id", organizationId)
    .in("schedule_block_id", blockIds);

  if (error) {
    throw new Error(`Could not load dashboard assignments: ${error.message}`);
  }

  return data satisfies ScheduleBlockAssignmentRow[];
}

async function getScheduleCoachContext(organizationId: string) {
  const supabase = await createClient();
  const { data: coachProfiles, error } = await supabase
    .from("coach_profiles")
    .select("id, user_id, person_profile_id, status, updated_at")
    .eq("organization_id", organizationId)
    .order("status", { ascending: true })
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(`Could not load dashboard coach profiles: ${error.message}`);
  }

  const personProfileIds = [
    ...new Set(
      coachProfiles.flatMap((coachProfile) =>
        coachProfile.person_profile_id ? [coachProfile.person_profile_id] : [],
      ),
    ),
  ];
  const userIds = [
    ...new Set(
      coachProfiles.flatMap((coachProfile) =>
        coachProfile.user_id ? [coachProfile.user_id] : [],
      ),
    ),
  ];

  const [personProfilesResult, membershipsResult] = await Promise.all([
    personProfileIds.length > 0
      ? supabase
          .from("person_profiles")
          .select("id, display_name, status, user_id, visibility_status")
          .eq("organization_id", organizationId)
          .in("id", personProfileIds)
      : Promise.resolve({ data: [], error: null }),
    userIds.length > 0
      ? supabase
          .from("organization_memberships")
          .select("user_id, status")
          .eq("organization_id", organizationId)
          .in("user_id", userIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (personProfilesResult.error) {
    throw new Error(
      `Could not load dashboard person profiles: ${personProfilesResult.error.message}`,
    );
  }

  if (membershipsResult.error) {
    throw new Error(
      `Could not load dashboard membership statuses: ${membershipsResult.error.message}`,
    );
  }

  return {
    coachProfiles: coachProfiles satisfies CoachProfileRow[],
    memberships: membershipsResult.data satisfies MembershipStatusRow[],
    personProfiles: personProfilesResult.data satisfies PersonProfileRow[],
  };
}

function buildCoachDisplays({
  coachProfiles,
  personProfiles,
}: {
  coachProfiles: CoachProfileRow[];
  personProfiles: PersonProfileRow[];
}) {
  const personProfilesById = new Map(
    personProfiles.map((personProfile) => [personProfile.id, personProfile]),
  );

  return new Map(
    coachProfiles.map((coachProfile) => {
      const personProfile = coachProfile.person_profile_id
        ? personProfilesById.get(coachProfile.person_profile_id)
        : undefined;

      return [
        coachProfile.id,
        {
          id: coachProfile.id,
          label:
            personProfile &&
            personProfile.status === "active" &&
            personProfile.visibility_status === "visible"
              ? personProfile.display_name
              : `Coach ${shortId(coachProfile.id)}`,
        } satisfies CoachDisplay,
      ];
    }),
  );
}

async function getDashboardData({
  organizationId,
  weekEnd,
  weekStart,
}: {
  organizationId: string;
  weekEnd: string;
  weekStart: string;
}): Promise<DashboardData> {
  const [blocks, centers, classTypes, coachContext] = await Promise.all([
    getScheduleBlocks({ organizationId, weekEnd, weekStart }),
    getCenters(organizationId),
    getClassTypes(organizationId),
    getScheduleCoachContext(organizationId),
  ]);
  const assignments = await getScheduleBlockAssignments({
    blockIds: blocks.map((block) => block.id),
    organizationId,
  });
  const coverageByBlock = calculateScheduleCoverageByBlock({
    assignments,
    blocks,
    coaches: coachContext.coachProfiles,
    memberships: coachContext.memberships,
    persons: coachContext.personProfiles,
  });

  return {
    assignments,
    blocks,
    centers,
    classTypes,
    coachDisplaysById: buildCoachDisplays(coachContext),
    coverageByBlock,
  };
}

function getRiskItems({
  blocks,
  coverageByBlock,
}: {
  blocks: ScheduleBlockRow[];
  coverageByBlock: Map<string, ScheduleBlockCoverage>;
}) {
  return blocks
    .flatMap((block) => {
      const coverage = coverageByBlock.get(block.id);

      if (!coverage || !isScheduleRiskCoverageState(coverage.state)) {
        return [];
      }

      return [{ block, coverage }];
    })
    .sort((first, second) => {
      const priority =
        riskPriority[first.coverage.state] - riskPriority[second.coverage.state];

      if (priority !== 0) {
        return priority;
      }

      return (
        first.block.service_date.localeCompare(second.block.service_date) ||
        first.block.start_time.localeCompare(second.block.start_time)
      );
    });
}

function getRiskSummary(riskItems: RiskItem[]) {
  return {
    conflict: riskItems.filter((item) => item.coverage.state === "conflict")
      .length,
    insufficient: riskItems.filter(
      (item) => item.coverage.state === "insufficient",
    ).length,
    uncovered: riskItems.filter((item) => item.coverage.state === "uncovered")
      .length,
  };
}

function getCenterSummaries({
  centers,
  data,
  riskItems,
}: {
  centers: CenterRow[];
  data: DashboardData;
  riskItems: RiskItem[];
}) {
  const risksByCenterId = new Map<string, number>();
  const blocksByCenterId = new Map<string, number>();

  for (const block of data.blocks) {
    blocksByCenterId.set(
      block.center_id,
      (blocksByCenterId.get(block.center_id) ?? 0) + 1,
    );
  }

  for (const item of riskItems) {
    risksByCenterId.set(
      item.block.center_id,
      (risksByCenterId.get(item.block.center_id) ?? 0) + 1,
    );
  }

  return centers
    .map((center) => ({
      center,
      blockCount: blocksByCenterId.get(center.id) ?? 0,
      riskCount: risksByCenterId.get(center.id) ?? 0,
    }))
    .filter((summary) => summary.blockCount > 0 || summary.riskCount > 0)
    .sort(
      (first, second) =>
        second.riskCount - first.riskCount ||
        first.center.name.localeCompare(second.center.name, "es"),
    );
}

function PageHeader({
  organizationName,
  role,
  weekEnd,
  weekStart,
}: {
  organizationName?: string;
  role?: string;
  weekEnd?: string;
  weekStart?: string;
}) {
  const roleLabel = role ? getApplicationRoleLabel(role) : null;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">Inicio</Badge>
        {organizationName ? (
          <Badge variant="outline">{organizationName}</Badge>
        ) : null}
        {roleLabel ? <Badge variant="outline">{roleLabel}</Badge> : null}
      </div>
      <div className="max-w-3xl space-y-2">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          <ShieldCheck aria-hidden="true" className="size-6 shrink-0" />
          Hola, {roleLabel ?? "equipo"}
        </h1>
        <p className="hidden text-sm leading-6 text-muted-foreground md:block md:text-base">
          Revisa que esta semana esté bajo control y salta rápido a lo que
          tienes que resolver.
        </p>
      </div>
      {weekStart && weekEnd ? (
        <div className="flex items-start gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground lg:max-w-3xl">
          <CalendarDays aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>{formatWeekRange(weekStart, weekEnd)}</span>
        </div>
      ) : null}
    </section>
  );
}

function WeekControls({
  currentWeekStart,
  organizationId,
  weekStart,
}: {
  currentWeekStart: string;
  organizationId: string;
  weekStart: string;
}) {
  return (
    <>
      <div className="grid grid-cols-3 gap-2 md:hidden">
        <Button asChild className="min-h-11 md:min-h-10" variant="outline">
          <Link
            href={getAppPathForDashboard({
              organizationId,
              week: getAdjacentWeekStart(weekStart, -1),
            })}
          >
            <ArrowLeft aria-hidden="true" />
            Anterior
          </Link>
        </Button>
        <Button asChild className="min-h-11 md:min-h-10" variant="outline">
          <Link
            href={getAppPathForDashboard({
              organizationId,
              week: currentWeekStart,
            })}
          >
            Hoy
          </Link>
        </Button>
        <Button asChild className="min-h-11 md:min-h-10" variant="outline">
          <Link
            href={getAppPathForDashboard({
              organizationId,
              week: getAdjacentWeekStart(weekStart, 1),
            })}
          >
            Siguiente
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
        <Button asChild className="col-span-3 min-h-11 md:min-h-10" variant="secondary">
          <Link href={getSchedulePath({ organizationId, week: weekStart })}>
            <CalendarDays aria-hidden="true" />
            Abrir horario
          </Link>
        </Button>
      </div>

      <div className="hidden flex-wrap items-center gap-2 md:flex">
        <Button asChild size="sm" variant="outline">
          <Link
            href={getAppPathForDashboard({
              organizationId,
              week: getAdjacentWeekStart(weekStart, -1),
            })}
          >
            <ArrowLeft aria-hidden="true" />
            Semana anterior
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link
            href={getAppPathForDashboard({
              organizationId,
              week: currentWeekStart,
            })}
          >
            Hoy
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link
            href={getAppPathForDashboard({
              organizationId,
              week: getAdjacentWeekStart(weekStart, 1),
            })}
          >
            Semana siguiente
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
        <Button asChild size="sm" variant="secondary">
          <Link href={getSchedulePath({ organizationId, week: weekStart })}>
            <CalendarDays aria-hidden="true" />
            Abrir horario
          </Link>
        </Button>
      </div>
    </>
  );
}

function getAppPathForDashboard({
  organizationId,
  week,
}: {
  organizationId: string;
  week: string;
}) {
  const params = new URLSearchParams({
    organizationId,
    week,
  });

  return `/app?${params.toString()}`;
}

function SummaryCards({
  data,
}: {
  data: DashboardData;
}) {
  const activeBlockCount = data.blocks.filter(
    (block) => block.status !== "cancelled" && block.status !== "completed",
  ).length;
  const activeCenterCount = data.centers.filter(
    (center) => center.status === "active",
  ).length;
  const activeClassTypeCount = data.classTypes.filter(
    (classType) => classType.status === "active",
  ).length;
  const cards = [
    {
      label: "Centros activos",
      value: activeCenterCount,
      description: "Sedes disponibles para planificar.",
      icon: MapPin,
    },
    {
      label: "Coaches activos",
      value: data.coachDisplaysById.size,
      description: "Equipo operativo visible.",
      icon: UsersRound,
    },
    {
      label: "Tipos de actividad",
      value: activeClassTypeCount,
      description: "Catálogo listo para horarios.",
      icon: Dumbbell,
    },
    {
      label: "Bloques esta semana",
      value: activeBlockCount,
      description: "Bloques no cancelados ni completados.",
      icon: CalendarDays,
    },
  ];

  return (
    <div
      className="grid grid-cols-2 gap-3 lg:grid-cols-4"
      data-tour="dashboard-summary"
    >
      {cards.map((card) => {
        const Icon = card.icon;

        return (
          <Card key={card.label} size="sm">
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-3">
                <span>{card.label}</span>
                <Icon aria-hidden="true" className="size-4 text-muted-foreground" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-mono text-3xl font-semibold">{card.value}</p>
              <p className="mt-1 hidden text-sm text-muted-foreground md:block">
                {card.description}
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function CoverageBadge({ state }: { state: ScheduleCoverageState }) {
  return (
    <Badge
      variant={
        state === "uncovered" || state === "conflict"
          ? "destructive"
          : state === "covered"
            ? "secondary"
            : "outline"
      }
    >
      {getScheduleCoverageStateLabel(state)}
    </Badge>
  );
}

function CoverageHero({
  organizationId,
  riskItems,
  weekStart,
}: {
  organizationId: string;
  riskItems: RiskItem[];
  weekStart: string;
}) {
  const riskSummary = getRiskSummary(riskItems);

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardContent className="grid gap-4 py-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={riskItems.length > 0 ? "destructive" : "secondary"}>
              {riskItems.length > 0 ? "Revisar" : "Todo cubierto"}
            </Badge>
            <Badge variant="outline">{riskSummary.uncovered} sin cubrir</Badge>
          </div>
          <div>
            <h2 className="text-xl font-semibold tracking-tight">
              Cobertura de la semana
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {riskItems.length > 0
                ? "Hay clases o bloques que necesitan una decisión."
                : "No hay riesgos activos con la cobertura actual."}
            </p>
          </div>
        </div>
        <Button asChild className="w-full lg:w-auto">
          <Link href={getCoveragePath({ organizationId, week: weekStart })}>
            Resolver cobertura
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function RiskQueue({
  centersById,
  classTypesById,
  coachDisplaysById,
  organizationId,
  riskItems,
  weekStart,
}: {
  centersById: Map<string, CenterRow>;
  classTypesById: Map<string, ClassTypeRow>;
  coachDisplaysById: Map<string, CoachDisplay>;
  organizationId: string;
  riskItems: RiskItem[];
  weekStart: string;
}) {
  return (
    <Card data-tour="coverage-risks">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle aria-hidden="true" className="size-4" />
          Pendiente
        </CardTitle>
        <CardDescription>
          Clases y bloques que conviene resolver antes de revisar el resto.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {riskItems.length === 0 ? (
          <div className="flex flex-col gap-3 rounded-lg border border-border px-4 py-5">
            <div className="flex items-center gap-2">
              <CheckCircle2 aria-hidden="true" className="size-4" />
              <h2 className="text-sm font-medium">Semana sin riesgos activos</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              No hay clases sin cubrir, cobertura insuficiente ni conflictos
              activos.
            </p>
            <div>
              <Button asChild size="sm" variant="outline">
                <Link href={getSchedulePath({ organizationId, week: weekStart })}>
                  <CalendarDays aria-hidden="true" />
                  Revisar horario
                </Link>
              </Button>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {riskItems.map((item) => {
              const center = centersById.get(item.block.center_id);
              const classType = classTypesById.get(item.block.class_type_id);
              const conflictCoachNames = item.coverage.conflictCoachProfileIds
                .map(
                  (coachProfileId) =>
                    coachDisplaysById.get(coachProfileId)?.label ??
                    `Coach ${shortId(coachProfileId)}`,
                )
                .join(", ");

              return (
                <div
                  className="grid gap-3 py-4 first:pt-0 last:pb-0 lg:grid-cols-[minmax(0,1fr)_auto]"
                  key={item.block.id}
                >
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <CoverageBadge state={item.coverage.state} />
                      {item.block.is_template_exception ? (
                        <Badge variant="outline">Excepción</Badge>
                      ) : null}
                      <Badge variant="outline">
                        {item.coverage.validAssignmentCount}/
                        {item.coverage.requiredCoaches} coaches
                      </Badge>
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-medium">
                        {formatServiceDate(item.block.service_date)} ·{" "}
                        {formatTime(item.block.start_time)} -{" "}
                        {formatTime(item.block.end_time)}
                      </h3>
                      <p className="mt-1 truncate text-sm text-muted-foreground">
                        {classType?.name ?? "Tipo no disponible"} ·{" "}
                        {center?.name ?? "Centro no disponible"}
                      </p>
                    </div>
                    {item.coverage.state === "conflict" &&
                    conflictCoachNames ? (
                      <p className="text-sm text-destructive">
                        Solapamiento: {conflictCoachNames}.
                      </p>
                    ) : item.coverage.state === "uncovered" ? (
                      <p className="text-sm text-muted-foreground">
                        No hay ningún coach asignado.
                      </p>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Faltan coaches para cubrir lo necesario.
                      </p>
                    )}
                  </div>
                  <div className="flex items-start lg:justify-end">
                    <Button asChild className="w-full lg:w-auto" size="sm" variant="outline">
                      <Link
                        href={getBlockHref({
                          blockId: item.block.id,
                          organizationId,
                          serviceDate: item.block.service_date,
                          weekStart,
                        })}
                      >
                        Abrir bloque
                        <ArrowRight aria-hidden="true" />
                      </Link>
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SupportViews({
  centerSummaries,
  organizationId,
  weekStart,
}: {
  centerSummaries: ReturnType<typeof getCenterSummaries>;
  organizationId: string;
  weekStart: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Centros esta semana</CardTitle>
        <CardDescription>
          Atajos para revisar el horario por sede.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {centerSummaries.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Todavía no hay bloques por centro en esta semana.
          </p>
        ) : (
          <div className="grid gap-3">
            {centerSummaries.map((summary) => (
              <div
                className="flex flex-col gap-3 rounded-lg border border-border px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                key={summary.center.id}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {summary.center.name}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {summary.riskCount} riesgo
                    {summary.riskCount === 1 ? "" : "s"} /{" "}
                    {summary.blockCount} bloque
                    {summary.blockCount === 1 ? "" : "s"}
                  </p>
                </div>
                <Button asChild size="sm" variant="outline">
                  <Link
                    href={getSchedulePath({
                      centerId: summary.center.id,
                      organizationId,
                      risksOnly: summary.riskCount > 0,
                      week: weekStart,
                    })}
                  >
                    <MapPin aria-hidden="true" />
                    Abrir
                  </Link>
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EmptyWeekCard({
  organizationId,
  weekStart,
}: {
  organizationId: string;
  weekStart: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>No hay bloques en esta semana</CardTitle>
        <CardDescription>
          Crea bloques o aplica una plantilla para empezar a revisar cobertura.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button asChild>
          <Link href={getSchedulePath({ organizationId, week: weekStart })}>
            <CalendarDays aria-hidden="true" />
            Crear bloque manual
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link
            href={getScheduleTemplatesPath({ organizationId, week: weekStart })}
          >
            <CalendarRange aria-hidden="true" />
            Aplicar plantilla
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function AdminCoverageDashboard({
  data,
  organizationId,
  weekStart,
}: {
  data: DashboardData;
  organizationId: string;
  weekStart: string;
}) {
  const riskItems = getRiskItems({
    blocks: data.blocks,
    coverageByBlock: data.coverageByBlock,
  });
  const centersById = new Map(data.centers.map((center) => [center.id, center]));
  const classTypesById = new Map(
    data.classTypes.map((classType) => [classType.id, classType]),
  );
  const centerSummaries = getCenterSummaries({
    centers: data.centers,
    data,
    riskItems,
  });

  return (
    <div className="space-y-6">
      <CoverageHero
        organizationId={organizationId}
        riskItems={riskItems}
        weekStart={weekStart}
      />

      <SummaryCards data={data} />

      {data.blocks.length === 0 ? (
        <EmptyWeekCard organizationId={organizationId} weekStart={weekStart} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <RiskQueue
            centersById={centersById}
            classTypesById={classTypesById}
            coachDisplaysById={data.coachDisplaysById}
            organizationId={organizationId}
            riskItems={riskItems}
            weekStart={weekStart}
          />
          <SupportViews
            centerSummaries={centerSummaries}
            organizationId={organizationId}
            weekStart={weekStart}
          />
        </div>
      )}
    </div>
  );
}

function ReadOnlyHome({
  organizationId,
  organizationName,
  role,
  timezone,
  weekStart,
}: {
  organizationId: string;
  organizationName: string;
  role: string;
  timezone: string;
  weekStart: string;
}) {
  const roleLabel = getApplicationRoleLabel(role);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck aria-hidden="true" className="size-4" />
            Tu box
          </CardTitle>
          <CardDescription>
            Contexto con el que estás trabajando ahora.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2">
            <div className="min-w-0">
              <dt className="text-sm text-muted-foreground">Nombre</dt>
              <dd className="mt-1 truncate text-sm font-medium">
                {organizationName}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Acceso</dt>
              <dd className="mt-1">
                <Badge variant="outline">{roleLabel}</Badge>
              </dd>
            </div>
            <div className="min-w-0 sm:col-span-2">
              <dt className="text-sm text-muted-foreground">Zona horaria</dt>
              <dd className="mt-1 truncate font-mono text-sm">{timezone}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Accesos de lectura</CardTitle>
          <CardDescription>
            Puedes consultar la semana, plantillas y datos de gestión.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild>
            <Link
              href={getSchedulePath({
                mineOnly: true,
                organizationId,
                week: weekStart,
              })}
            >
              <CalendarDays aria-hidden="true" />
              Mi horario
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={getScheduleTemplatesPath({ organizationId, week: weekStart })}>
              <CalendarRange aria-hidden="true" />
              Plantillas
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function SurfaceLinks({
  organizationId,
  weekStart,
}: {
  organizationId: string;
  weekStart: string;
}) {
  return (
    <Card data-tour="quick-actions">
      <CardHeader>
        <CardTitle>Acciones rápidas</CardTitle>
        <CardDescription>
          Entra directo a las pantallas que se usan para preparar la semana.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-2 md:flex md:flex-wrap">
        <Button asChild className="w-full md:w-auto">
          <Link href={getCoveragePath({ organizationId, week: weekStart })}>
            <AlertTriangle aria-hidden="true" />
            Resolver cobertura
          </Link>
        </Button>
        <Button asChild className="w-full md:w-auto" variant="outline">
          <Link href={getSchedulePath({ organizationId, week: weekStart })}>
            <CalendarDays aria-hidden="true" />
            Abrir horario
          </Link>
        </Button>
        <Button asChild className="w-full md:w-auto" variant="outline">
          <Link href={getCentersPath({ organizationId })}>
            <MapPin aria-hidden="true" />
            Centros
          </Link>
        </Button>
        <Button asChild className="w-full md:w-auto" variant="outline">
          <Link href={getCoachesPath({ organizationId })}>
            <UsersRound aria-hidden="true" />
            Equipo
          </Link>
        </Button>
        <Button asChild className="w-full md:w-auto" variant="outline">
          <Link href={getClassTypesPath({ organizationId })}>
            <Dumbbell aria-hidden="true" />
            Tipos
          </Link>
        </Button>
        <Button asChild className="w-full md:w-auto" variant="outline">
          <Link href={getScheduleTemplatesPath({ organizationId, week: weekStart })}>
            <CalendarRange aria-hidden="true" />
            Plantillas
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export default async function AppPage({ searchParams }: AppPageProps) {
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect(getLoginPath("/app"));
  }

  const params = await searchParams;
  const organizationId = getParam(params.organizationId);
  const memberships = await getActiveMemberships(user.id);
  const resolution = resolveActiveOrganization(memberships, organizationId);

  if (!resolution.ok) {
    return (
      <div className="space-y-6">
        <PageHeader />
        <OrganizationResolutionState basePath="/app" resolution={resolution} />
      </div>
    );
  }

  const weekParam = getParam(params.week);
  const week = resolveWeek(weekParam, resolution.organization.timezone);
  const currentWeek = resolveWeek(undefined, resolution.organization.timezone);
  const canViewOperationalDashboard = canManageOperationalData(
    resolution.membership.role,
  );
  const dashboardData = canViewOperationalDashboard
    ? await getDashboardData({
        organizationId: resolution.organization.id,
        weekEnd: week.weekEnd,
        weekStart: week.weekStart,
      })
    : null;

  return (
    <div className="space-y-6">
      <PageHeader
        organizationName={resolution.organization.name}
        role={resolution.membership.role}
        weekEnd={week.weekEnd}
        weekStart={week.weekStart}
      />

      <WeekControls
        currentWeekStart={currentWeek.weekStart}
        organizationId={resolution.organization.id}
        weekStart={week.weekStart}
      />

      {week.invalidWeekParam ? (
        <Alert>
          <AlertTitle>Semana ajustada</AlertTitle>
          <AlertDescription>
            La fecha recibida no era válida. Se muestra la semana actual.
          </AlertDescription>
        </Alert>
      ) : null}

      {dashboardData ? (
        <AdminCoverageDashboard
          data={dashboardData}
          organizationId={resolution.organization.id}
          weekStart={week.weekStart}
        />
      ) : (
        <ReadOnlyHome
          organizationId={resolution.organization.id}
          organizationName={resolution.organization.name}
          role={resolution.membership.role}
          timezone={resolution.organization.timezone}
          weekStart={week.weekStart}
        />
      )}

      <SurfaceLinks
        organizationId={resolution.organization.id}
        weekStart={week.weekStart}
      />
    </div>
  );
}
