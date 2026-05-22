import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock,
  ShieldAlert,
} from "lucide-react";

import {
  type CoverageBulkAssignment,
  type CoverageBulkBlock,
  type CoverageBulkClassType,
  CoverageBulkResolveList,
  type CoverageBulkRiskItem,
} from "./coverage-bulk-resolve-list";
import { CoverageBlockDetailPanels } from "./coverage-block-detail-panels";
import { OrganizationResolutionState } from "@/components/features/organization-resolution-state";
import {
  EmptyState,
  PageHeader,
  SectionHeader,
  StatCard,
  StatusBadge,
} from "@/components/features/operations-ui";
import { RouteStateButton } from "@/components/features/route-state-link";
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
  canManageAbsenceRequests,
  canManageOperationalData,
  getApplicationRoleLabel,
} from "@/lib/auth/permissions";
import {
  getActiveMemberships,
  getAuthenticatedUser,
  resolveActiveOrganization,
} from "@/lib/auth/tenant";
import { listOperationalAbsenceScheduleImpacts } from "@/lib/absence-requests";
import {
  listCoverageTraceItems,
  type CoverageTraceItem,
} from "@/lib/coverage-traceability";
import { getCoveragePath, getSchedulePath } from "@/lib/navigation/app-paths";
import {
  calculateScheduleCoverageByBlock,
  formatTimeForInput,
  getAdjacentWeekStart,
  getScheduleCoverageStateLabel,
  isScheduleCoverageRisk,
  isScheduleRiskCoverageState,
  isScheduleUuid,
  resolveWeek,
  type ScheduleBlockCoverage,
  type ScheduleCoverageState,
} from "@/lib/schedule-blocks";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/supabase";

export const dynamic = "force-dynamic";

type CoveragePageProps = {
  searchParams: Promise<{
    organizationId?: string | string[];
    block_id?: string | string[];
    error?: string | string[];
    status?: string | string[];
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
type ClassTypeRow = Pick<Tables<"class_types">, "id" | "name" | "status">;
type AssignmentRow = Pick<
  Tables<"schedule_block_assignments">,
  | "assignment_status"
  | "coach_profile_id"
  | "id"
  | "schedule_block_id"
  | "source"
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

type CoverageData = {
  assignments: AssignmentRow[];
  assignableCoaches: CoachDisplay[];
  absenceImpactLoadError: string | null;
  blocks: ScheduleBlockRow[];
  centers: CenterRow[];
  classTypes: ClassTypeRow[];
  coachDisplaysById: Map<string, CoachDisplay>;
  coverageByBlock: Map<string, ScheduleBlockCoverage>;
  coverageTraceByBlock: Map<string, CoverageTraceItem[]>;
  coverageTraceLoadError: string | null;
};

type CoachDisplay = {
  detail: string;
  id: string;
  isFallback: boolean;
  label: string;
};

type RiskItem = {
  block: ScheduleBlockRow;
  coverage: ScheduleBlockCoverage;
};

const riskPriority: Record<ScheduleCoverageState, number> = {
  conflict: 1,
  uncovered: 2,
  insufficient: 3,
  covered: 4,
  inactive: 6,
  not_required: 5,
};

const successMessages: Record<string, string> = {
  "assignment-removed": "Asignación retirada.",
  assigned: "Entrenador asignado.",
  "bulk-assigned": "Entrenador asignado a los bloques seleccionados.",
  "bulk-updated": "Seleccion actualizada.",
};

const errorMessages: Record<string, string> = {
  "assignment-required": "No se ha recibido la asignación a retirar.",
  "block-not-assignable":
    "No se puede asignar entrenador a un bloque cancelado o completado.",
  "block-required": "No se ha recibido el bloque a actualizar.",
  "coach-inactive": "Ese perfil de entrenador no está activo.",
  "coach-membership-inactive":
    "Ese entrenador tiene cuenta vinculada, pero su acceso no está activo.",
  "coach-required": "Selecciona un entrenador para asignar.",
  "coach-unavailable":
    "Ese entrenador ya tiene otro bloque asignado que se solapa con esta franja.",
  "bulk-selection-required": "Selecciona al menos un riesgo para resolver en lote.",
  "bulk-selection-too-large":
    "Selecciona menos bloques para resolverlos en lote.",
  "bulk-update-required": "Elige al menos un cambio para aplicar en lote.",
  "bulk-coach-not-needed":
    "No se puede anadir entrenador comun si dejas los bloques sin requisito.",
  "duplicate-assignment":
    "Ese entrenador ya tiene una asignación lógica en este bloque.",
  forbidden: "Tu rol no permite gestionar la cobertura.",
  "invalid-assignment": "La asignación recibida no es válida.",
  "invalid-assignment-reference":
    "La asignación ya no apunta a un bloque o entrenador válido.",
  "invalid-block": "El bloque recibido no es válido.",
  "invalid-class-type": "El tipo de actividad seleccionado no es valido.",
  "invalid-coach": "El entrenador seleccionado no es válido.",
  "invalid-reference":
    "Alguna referencia del cambio ya no pertenece a esta organizacion.",
  "invalid-required-coaches":
    "El numero de entrenadores debe estar entre 0 y 20.",
  "invalid-person-profile":
    "El perfil visible del entrenador no pertenece a esta organización.",
  "person-profile-inactive": "El perfil visible del entrenador no está activo.",
  "person-profile-internal":
    "Los perfiles internos no pueden asignarse como entrenadores operativos.",
  "save-failed": "No se han podido guardar los cambios.",
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

function getCoverageBlockHref({
  basePath,
  blockId,
}: {
  basePath: string;
  blockId: string;
}) {
  const url = new URL(basePath, "http://boxops.local");
  url.searchParams.set("block_id", blockId);

  return `${url.pathname}${url.search}`;
}

function getCoachDisplay({
  coachProfile,
  membership,
  personProfile,
}: {
  coachProfile: CoachProfileRow;
  membership?: MembershipStatusRow;
  personProfile?: PersonProfileRow;
}): CoachDisplay {
  if (
    personProfile &&
    personProfile.status === "active" &&
    personProfile.visibility_status === "visible"
  ) {
    return {
      detail: membership
        ? `Acceso ${membership.status}`
        : "Persona operativa pendiente de cuenta",
      id: coachProfile.id,
      isFallback: false,
      label: personProfile.display_name,
    };
  }

  if (coachProfile.user_id) {
    return {
      detail: `Cuenta sin persona visible (${shortId(coachProfile.user_id)})`,
      id: coachProfile.id,
      isFallback: true,
      label: `Entrenador sin perfil visible ${shortId(coachProfile.id)}`,
    };
  }

  return {
    detail: `Perfil técnico incompleto ${shortId(coachProfile.id)}`,
    id: coachProfile.id,
    isFallback: true,
    label: `Entrenador sin perfil visible ${shortId(coachProfile.id)}`,
  };
}

function buildCoachDisplays({
  coaches,
  memberships,
  persons,
}: {
  coaches: CoachProfileRow[];
  memberships: MembershipStatusRow[];
  persons: PersonProfileRow[];
}) {
  const membershipsByUserId = new Map(
    memberships.map((membership) => [membership.user_id, membership]),
  );
  const personsById = new Map(persons.map((person) => [person.id, person]));
  const displays = coaches.map((coach) =>
    getCoachDisplay({
      coachProfile: coach,
      membership: coach.user_id
        ? membershipsByUserId.get(coach.user_id)
        : undefined,
      personProfile: coach.person_profile_id
        ? personsById.get(coach.person_profile_id)
        : undefined,
    }),
  );
  const coachDisplaysById = new Map(
    displays.map((display) => [display.id, display]),
  );
  const assignableCoaches = coaches
    .flatMap((coach) => {
      if (coach.status !== "active") {
        return [];
      }

      const personProfile = coach.person_profile_id
        ? personsById.get(coach.person_profile_id)
        : undefined;
      const membership = coach.user_id
        ? membershipsByUserId.get(coach.user_id)
        : undefined;

      if (
        coach.person_profile_id &&
        (!personProfile ||
          personProfile.status !== "active" ||
          personProfile.visibility_status !== "visible")
      ) {
        return [];
      }

      if (coach.user_id && membership?.status !== "active") {
        return [];
      }

      if (!coach.user_id && !personProfile) {
        return [];
      }

      return [
        getCoachDisplay({
          coachProfile: coach,
          membership,
          personProfile,
        }),
      ];
    })
    .sort((first, second) => first.label.localeCompare(second.label, "es"));

  return {
    assignableCoaches,
    coachDisplaysById,
  };
}

async function getCoverageData({
  includeAbsenceImpacts,
  includeCoverageTrace,
  organizationId,
  weekEnd,
  weekStart,
}: {
  includeAbsenceImpacts: boolean;
  includeCoverageTrace: boolean;
  organizationId: string;
  weekEnd: string;
  weekStart: string;
}): Promise<CoverageData> {
  const supabase = await createClient();
  const [blocksResult, centersResult, classTypesResult, coachesResult] =
    await Promise.all([
      supabase
        .from("schedule_blocks")
        .select(
          "id, center_id, class_type_id, service_date, start_time, end_time, required_coaches, status, is_template_exception",
        )
        .eq("organization_id", organizationId)
        .gte("service_date", weekStart)
        .lte("service_date", weekEnd)
        .order("service_date", { ascending: true })
        .order("start_time", { ascending: true }),
      supabase
        .from("centers")
        .select("id, name, status")
        .eq("organization_id", organizationId)
        .order("status", { ascending: true })
        .order("name", { ascending: true }),
      supabase
        .from("class_types")
        .select("id, name, status")
        .eq("organization_id", organizationId)
        .order("status", { ascending: true })
        .order("name", { ascending: true }),
      supabase
        .from("coach_profiles")
        .select("id, user_id, person_profile_id, status, updated_at")
        .eq("organization_id", organizationId)
        .order("status", { ascending: true })
        .order("updated_at", { ascending: false }),
    ]);

  if (blocksResult.error) {
    throw new Error(`Could not load coverage blocks: ${blocksResult.error.message}`);
  }

  if (centersResult.error) {
    throw new Error(`Could not load coverage centers: ${centersResult.error.message}`);
  }

  if (classTypesResult.error) {
    throw new Error(
      `Could not load coverage activity types: ${classTypesResult.error.message}`,
    );
  }

  if (coachesResult.error) {
    throw new Error(`Could not load coverage coaches: ${coachesResult.error.message}`);
  }

  const blocks = blocksResult.data satisfies ScheduleBlockRow[];
  const centers = centersResult.data satisfies CenterRow[];
  const classTypes = classTypesResult.data satisfies ClassTypeRow[];
  const coaches = coachesResult.data satisfies CoachProfileRow[];
  const blockIds = blocks.map((block) => block.id);
  const personProfileIds = [
    ...new Set(
      coaches.flatMap((coach) =>
        coach.person_profile_id ? [coach.person_profile_id] : [],
      ),
    ),
  ];
  const userIds = [
    ...new Set(coaches.flatMap((coach) => (coach.user_id ? [coach.user_id] : []))),
  ];

  const [assignmentsResult, personsResult, membershipsResult] =
    await Promise.all([
      blockIds.length > 0
        ? supabase
            .from("schedule_block_assignments")
            .select(
              "id, schedule_block_id, coach_profile_id, assignment_status, source",
            )
            .eq("organization_id", organizationId)
            .in("schedule_block_id", blockIds)
        : Promise.resolve({ data: [], error: null }),
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

  if (assignmentsResult.error) {
    throw new Error(
      `Could not load coverage assignments: ${assignmentsResult.error.message}`,
    );
  }

  if (personsResult.error) {
    throw new Error(`Could not load coverage people: ${personsResult.error.message}`);
  }

  if (membershipsResult.error) {
    throw new Error(
      `Could not load coverage access state: ${membershipsResult.error.message}`,
    );
  }

  const persons = personsResult.data satisfies PersonProfileRow[];
  const memberships = membershipsResult.data satisfies MembershipStatusRow[];
  const { assignableCoaches, coachDisplaysById } = buildCoachDisplays({
    coaches,
    memberships,
    persons,
  });
  const assignments = assignmentsResult.data satisfies AssignmentRow[];
  const absenceImpactResult =
    includeAbsenceImpacts && blockIds.length > 0
      ? await listOperationalAbsenceScheduleImpacts({
          limit: 200,
          organizationId,
          scheduleBlockIds: blockIds,
          serviceDateFrom: weekStart,
          serviceDateTo: weekEnd,
        })
      : { data: [], ok: true as const };
  const absenceImpacts = absenceImpactResult.ok ? absenceImpactResult.data : [];
  const coverageByBlock = calculateScheduleCoverageByBlock({
    absenceImpacts,
    assignments,
    blocks,
    coaches,
    memberships,
    persons,
  });
  const coverageTraceResult =
    includeCoverageTrace && blockIds.length > 0
      ? await listCoverageTraceItems({
          absenceImpacts,
          limit: 120,
          organizationId,
          scheduleBlockIds: blockIds,
          serviceDateFrom: weekStart,
          serviceDateTo: weekEnd,
        })
      : { data: new Map<string, CoverageTraceItem[]>(), ok: true as const };

  return {
    assignments,
    assignableCoaches,
    absenceImpactLoadError: absenceImpactResult.ok
      ? null
      : absenceImpactResult.error,
    blocks,
    centers,
    classTypes,
    coachDisplaysById,
    coverageByBlock,
    coverageTraceByBlock: coverageTraceResult.ok
      ? coverageTraceResult.data
      : new Map(),
    coverageTraceLoadError: coverageTraceResult.ok
      ? null
      : coverageTraceResult.error,
  };
}

function getRiskItems(data: CoverageData) {
  return data.blocks
    .flatMap((block) => {
      const coverage = data.coverageByBlock.get(block.id);

      if (!coverage || !isScheduleCoverageRisk(coverage)) {
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

function getTone(state: ScheduleCoverageState) {
  if (state === "uncovered" || state === "conflict") {
    return "critical" as const;
  }

  if (state === "insufficient") {
    return "warning" as const;
  }

  if (state === "covered") {
    return "success" as const;
  }

  return "neutral" as const;
}

function getCoverageTone(coverage: ScheduleBlockCoverage | undefined) {
  if (!coverage) {
    return getTone("inactive");
  }

  if (coverage.state === "uncovered" || coverage.state === "conflict") {
    return "critical" as const;
  }

  if (
    coverage.state === "insufficient" ||
    coverage.absenceImpact.coverageNeededCount > 0 ||
    coverage.absenceImpact.potentialCount > 0
  ) {
    return "warning" as const;
  }

  if (coverage.state === "covered") {
    return "success" as const;
  }

  return "neutral" as const;
}

function getAbsenceImpactLabel(coverage: ScheduleBlockCoverage) {
  if (coverage.absenceImpact.coverageNeededCount > 0) {
    return "Impacto de ausencia";
  }

  if (coverage.absenceImpact.potentialCount > 0) {
    return "Ausencia en revision";
  }

  return null;
}

function getRiskStatus(coverage: ScheduleBlockCoverage) {
  const absenceLabel = getAbsenceImpactLabel(coverage);

  if (!isScheduleRiskCoverageState(coverage.state) && absenceLabel) {
    return absenceLabel;
  }

  return getScheduleCoverageStateLabel(coverage.state);
}

function getRiskMeta(coverage: ScheduleBlockCoverage) {
  const absenceLabel = getAbsenceImpactLabel(coverage);
  const coachCount = `${coverage.validAssignmentCount}/${coverage.requiredCoaches} entrenadores`;

  if (!absenceLabel) {
    return coachCount;
  }

  return `${coachCount} / ${absenceLabel.toLowerCase()}`;
}

function getSummary(riskItems: RiskItem[]) {
  return {
    absenceImpact: riskItems.filter(
      (item) =>
        item.coverage.absenceImpact.coverageNeededCount > 0 ||
        item.coverage.absenceImpact.potentialCount > 0,
    ).length,
    conflict: riskItems.filter((item) => item.coverage.state === "conflict")
      .length,
    insufficient: riskItems.filter(
      (item) => item.coverage.state === "insufficient",
    ).length,
    uncovered: riskItems.filter((item) => item.coverage.state === "uncovered")
      .length,
  };
}

function CoverageOverview({
  blockCount,
  riskItems,
}: {
  blockCount: number;
  riskItems: RiskItem[];
}) {
  const summary = getSummary(riskItems);

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <StatCard
        description="Necesitan una decisión."
        icon={ShieldAlert}
        label="Riesgos"
        tone={riskItems.length > 0 ? "critical" : "success"}
        value={riskItems.length}
      />
      <StatCard
        description="Sin entrenador asignado."
        icon={AlertTriangle}
        label="Sin cubrir"
        tone={summary.uncovered > 0 ? "critical" : "success"}
        value={summary.uncovered}
      />
      <StatCard
        description="Asignación solapada."
        icon={Clock}
        label="Conflictos"
        tone={summary.conflict > 0 ? "critical" : "success"}
        value={summary.conflict}
      />
      <StatCard
        description="Aprobada o en revision."
        icon={AlertTriangle}
        label="Impacto ausencia"
        tone={summary.absenceImpact > 0 ? "warning" : "success"}
        value={summary.absenceImpact}
      />
      <StatCard
        description="Bloques de la semana."
        icon={CalendarDays}
        label="Todas las clases"
        value={blockCount}
      />
    </div>
  );
}

function ResolveNow({
  assignments,
  basePath,
  blocks,
  canManageSchedule,
  centersById,
  classTypes,
  classTypesById,
  coachOptions,
  organizationId,
  riskItems,
  weekStart,
}: {
  assignments: AssignmentRow[];
  basePath: string;
  blocks: ScheduleBlockRow[];
  canManageSchedule: boolean;
  centersById: Map<string, CenterRow>;
  classTypes: ClassTypeRow[];
  classTypesById: Map<string, ClassTypeRow>;
  coachOptions: CoachDisplay[];
  organizationId: string;
  riskItems: RiskItem[];
  weekStart: string;
}) {
  const bulkRiskItems = riskItems.map((item) => {
    const classType = classTypesById.get(item.block.class_type_id);
    const center = centersById.get(item.block.center_id);

    return {
      blockId: item.block.id,
      center: center?.name ?? "Centro no disponible",
      href: getCoverageBlockHref({
        basePath,
        blockId: item.block.id,
      }),
      meta: getRiskMeta(item.coverage),
      status: getRiskStatus(item.coverage),
      time: `${formatTime(item.block.start_time)} - ${formatTime(
        item.block.end_time,
      )}`,
      title: `${formatServiceDate(item.block.service_date)} / ${
        classType?.name ?? "Actividad"
      }`,
      tone: getCoverageTone(item.coverage),
    } satisfies CoverageBulkRiskItem;
  });

  return (
    <section className="space-y-3">
      <SectionHeader
        description={
          canManageSchedule
            ? "Selecciona riesgos para editar tipo, requisito o entrenador comun."
            : "Lo primero que debería revisar un rol operativo está arriba."
        }
        title="Resolver ahora"
      />

      {riskItems.length === 0 ? (
        <EmptyState
          action={
            <Button asChild variant="outline">
              <Link href={getSchedulePath({ organizationId, week: weekStart })}>
                Revisar horario
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          }
          description="No hay clases sin cubrir, insuficientes, conflictos ni impacto de ausencia en esta semana."
          title="Todo cubierto para esta semana"
        />
      ) : (
        <CoverageBulkResolveList
          assignments={
            assignments.map((assignment) => ({
              assignment_status: assignment.assignment_status,
              coach_profile_id: assignment.coach_profile_id,
              id: assignment.id,
              schedule_block_id: assignment.schedule_block_id,
            })) satisfies CoverageBulkAssignment[]
          }
          basePath={basePath}
          blocks={
            blocks.map((block) => ({
              end_time: block.end_time,
              id: block.id,
              required_coaches: block.required_coaches,
              service_date: block.service_date,
              start_time: block.start_time,
              status: block.status,
            })) satisfies CoverageBulkBlock[]
          }
          canManageSchedule={canManageSchedule}
          classTypes={
            classTypes.map((classType) => ({
              id: classType.id,
              name: classType.name,
              status: classType.status,
            })) satisfies CoverageBulkClassType[]
          }
          coachOptions={coachOptions}
          items={bulkRiskItems}
          organizationId={organizationId}
          weekStart={weekStart}
        />
      )}
    </section>
  );
}

function AllClasses({
  basePath,
  centersById,
  classTypesById,
  data,
}: {
  basePath: string;
  centersById: Map<string, CenterRow>;
  classTypesById: Map<string, ClassTypeRow>;
  data: CoverageData;
}) {
  return (
    <section className="space-y-3">
      <SectionHeader
        description="Lista compacta con el estado de cobertura de cada bloque."
        title="Todas las clases"
      />
      <Card>
        <CardContent className="divide-y divide-border">
          {data.blocks.length === 0 ? (
            <div className="py-5">
              <CardTitle>No hay bloques esta semana</CardTitle>
              <CardDescription className="mt-1">
                Crea bloques o aplica una plantilla para revisar cobertura.
              </CardDescription>
            </div>
          ) : (
            data.blocks.map((block) => {
              const coverage = data.coverageByBlock.get(block.id);
              const classType = classTypesById.get(block.class_type_id);
              const center = centersById.get(block.center_id);
              const state = coverage?.state ?? "inactive";
              const absenceImpactLabel = coverage
                ? getAbsenceImpactLabel(coverage)
                : null;

              return (
                <div
                  className="grid gap-3 py-4 first:pt-0 last:pb-0 sm:grid-cols-[84px_minmax(0,1fr)_auto] sm:items-center"
                  key={block.id}
                >
                  <p className="font-mono text-sm font-semibold">
                    {formatTime(block.start_time)}
                  </p>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-medium">
                        {classType?.name ?? "Actividad"}
                      </p>
                      <StatusBadge tone={getCoverageTone(coverage)}>
                        {getScheduleCoverageStateLabel(state)}
                      </StatusBadge>
                      {absenceImpactLabel ? (
                        <Badge variant="outline">{absenceImpactLabel}</Badge>
                      ) : null}
                    </div>
                    <p className="mt-1 truncate text-sm text-muted-foreground">
                      {formatServiceDate(block.service_date)} /{" "}
                      {center?.name ?? "Centro no disponible"}
                    </p>
                  </div>
                  <Button asChild className="w-full sm:w-auto" size="sm" variant="outline">
                    <RouteStateButton
                      data-operational-detail-trigger="coverage-block"
                      href={getCoverageBlockHref({
                        basePath,
                        blockId: block.id,
                      })}
                    >
                      Abrir
                    </RouteStateButton>
                  </Button>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </section>
  );
}

export default async function CoveragePage({ searchParams }: CoveragePageProps) {
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect(getLoginPath("/app/coverage"));
  }

  const params = await searchParams;
  const organizationId = getParam(params.organizationId);
  const status = getParam(params.status);
  const error = getParam(params.error);
  const weekParam = getParam(params.week);
  const selectedBlockIdParam = getParam(params.block_id);
  const selectedBlockId =
    selectedBlockIdParam && isScheduleUuid(selectedBlockIdParam)
      ? selectedBlockIdParam
      : null;
  const memberships = await getActiveMemberships(user.id);
  const resolution = resolveActiveOrganization(memberships, organizationId);

  if (!resolution.ok) {
    return (
      <div className="space-y-6">
        <PageHeader title="Cobertura" />
        <OrganizationResolutionState
          basePath="/app/coverage"
          resolution={resolution}
        />
      </div>
    );
  }

  const week = resolveWeek(weekParam, resolution.organization.timezone);
  const currentWeek = resolveWeek(undefined, resolution.organization.timezone);
  const canReviewAbsenceImpact = canManageAbsenceRequests(
    resolution.membership.role,
  );
  const canManageSchedule = canManageOperationalData(
    resolution.membership.role,
  );
  const data = await getCoverageData({
    includeAbsenceImpacts: canReviewAbsenceImpact,
    includeCoverageTrace: canManageSchedule,
    organizationId: resolution.organization.id,
    weekEnd: week.weekEnd,
    weekStart: week.weekStart,
  });
  const riskItems = getRiskItems(data);
  const centersById = new Map(data.centers.map((center) => [center.id, center]));
  const classTypesById = new Map(
    data.classTypes.map((classType) => [classType.id, classType]),
  );
  const roleLabel = getApplicationRoleLabel(resolution.membership.role);
  const coverageBasePath = getCoveragePath({
    organizationId: resolution.organization.id,
    week: week.weekStart,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        actions={
          <div className="hidden flex-wrap gap-2 md:flex">
            <Button asChild variant="outline">
              <Link
                href={getCoveragePath({
                  organizationId: resolution.organization.id,
                  week: getAdjacentWeekStart(week.weekStart, -1),
                })}
              >
                <ArrowLeft aria-hidden="true" />
                Anterior
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link
                href={getCoveragePath({
                  organizationId: resolution.organization.id,
                  week: currentWeek.weekStart,
                })}
              >
                Hoy
              </Link>
            </Button>
            <Button asChild>
              <Link
                href={getCoveragePath({
                  organizationId: resolution.organization.id,
                  week: getAdjacentWeekStart(week.weekStart, 1),
                })}
              >
                Siguiente
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          </div>
        }
        badge="Cobertura"
        description="Riesgos accionables de la semana: clases sin entrenador, cobertura insuficiente, conflictos e impacto de ausencia."
        meta={
          <>
            <Badge variant="outline">{resolution.organization.name}</Badge>
            <Badge variant="outline">{roleLabel}</Badge>
          </>
        }
        title="Cobertura"
      >
        <p className="text-sm text-muted-foreground">
          {formatWeekRange(week.weekStart, week.weekEnd)}
        </p>
      </PageHeader>

      <div className="grid grid-cols-3 gap-2 md:hidden">
        <Button asChild className="min-h-11 md:min-h-10" variant="outline">
          <Link
            href={getCoveragePath({
              organizationId: resolution.organization.id,
              week: getAdjacentWeekStart(week.weekStart, -1),
            })}
          >
            <ArrowLeft aria-hidden="true" />
            Anterior
          </Link>
        </Button>
        <Button asChild className="min-h-11 md:min-h-10" variant="outline">
          <Link
            href={getCoveragePath({
              organizationId: resolution.organization.id,
              week: currentWeek.weekStart,
            })}
          >
            Hoy
          </Link>
        </Button>
        <Button asChild className="min-h-11 md:min-h-10" variant="outline">
          <Link
            href={getCoveragePath({
              organizationId: resolution.organization.id,
              week: getAdjacentWeekStart(week.weekStart, 1),
            })}
          >
            Siguiente
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </div>

      {week.invalidWeekParam ? (
        <Alert>
          <AlertTitle>Semana ajustada</AlertTitle>
          <AlertDescription>
            La fecha recibida no era válida. Se muestra la semana actual.
          </AlertDescription>
        </Alert>
      ) : null}

      {status && successMessages[status] ? (
        <TransientFeedbackBanner
          description="La cola de cobertura ya muestra los datos actuales."
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

      {data.absenceImpactLoadError ? (
        <Alert>
          <AlertTitle>Impacto de ausencia no disponible</AlertTitle>
          <AlertDescription>
            La cobertura se muestra sin cruzar ausencias aprobadas o en revision.
          </AlertDescription>
        </Alert>
      ) : null}

      <CoverageOverview blockCount={data.blocks.length} riskItems={riskItems} />

      <ResolveNow
        assignments={data.assignments}
        basePath={coverageBasePath}
        blocks={data.blocks}
        canManageSchedule={canManageSchedule}
        centersById={centersById}
        classTypes={data.classTypes}
        classTypesById={classTypesById}
        coachOptions={data.assignableCoaches}
        organizationId={resolution.organization.id}
        riskItems={riskItems}
        weekStart={week.weekStart}
      />

      <section className="space-y-3">
        <SectionHeader
          description="Avisos que conviene mirar después de los riesgos críticos."
          title="Pendiente de acción"
        />
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 aria-hidden="true" className="size-4" />
              No hay avisos adicionales
            </CardTitle>
            <CardDescription>
              Ahora la prioridad sale del horario y de ausencias aprobadas o en
              revision, sin resolver cobertura automaticamente.
            </CardDescription>
          </CardHeader>
        </Card>
      </section>

      <AllClasses
        basePath={coverageBasePath}
        centersById={centersById}
        classTypesById={classTypesById}
        data={data}
      />

      <CoverageBlockDetailPanels
        assignableCoaches={data.assignableCoaches}
        assignments={data.assignments}
        basePath={coverageBasePath}
        blocks={data.blocks}
        canManageSchedule={canManageSchedule}
        centers={data.centers}
        classTypes={data.classTypes}
        coachDisplays={[...data.coachDisplaysById.values()]}
        coverageByBlock={[...data.coverageByBlock.entries()]}
        coverageTraceByBlock={[...data.coverageTraceByBlock.entries()]}
        coverageTraceLoadError={Boolean(data.coverageTraceLoadError)}
        initialSelectedBlockId={selectedBlockId}
        organizationId={resolution.organization.id}
        weekStart={week.weekStart}
      />
    </div>
  );
}
