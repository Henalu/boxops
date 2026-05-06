import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock,
  Plus,
  ShieldAlert,
  UserMinus,
  UserRound,
  X,
} from "lucide-react";

import {
  assignScheduleBlockCoach,
  removeScheduleBlockAssignment,
} from "../schedule/actions";
import { OrganizationResolutionState } from "@/components/features/organization-resolution-state";
import {
  CoverageRiskCard,
  EmptyState,
  PageHeader,
  SectionHeader,
  StatCard,
  StatusBadge,
} from "@/components/features/operations-ui";
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
  getActiveMemberships,
  getAuthenticatedUser,
  resolveActiveOrganization,
} from "@/lib/auth/tenant";
import { getCoveragePath, getSchedulePath } from "@/lib/navigation/app-paths";
import {
  calculateScheduleCoverageByBlock,
  formatTimeForInput,
  getAdjacentWeekStart,
  getScheduleAssignmentStatusLabel,
  getScheduleCoverageStateLabel,
  isCoverageActiveBlock,
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
  blocks: ScheduleBlockRow[];
  centers: CenterRow[];
  classTypes: ClassTypeRow[];
  coachDisplaysById: Map<string, CoachDisplay>;
  coverageByBlock: Map<string, ScheduleBlockCoverage>;
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
  assigned: "Coach asignado.",
};

const errorMessages: Record<string, string> = {
  "assignment-required": "No se ha recibido la asignación a retirar.",
  "block-not-assignable":
    "No se puede asignar coach a un bloque cancelado o completado.",
  "block-required": "No se ha recibido el bloque a actualizar.",
  "coach-inactive": "Ese perfil de coach no está activo.",
  "coach-membership-inactive":
    "Ese coach tiene cuenta vinculada, pero su acceso no está activo.",
  "coach-required": "Selecciona un coach para asignar.",
  "duplicate-assignment":
    "Ese coach ya tiene una asignación lógica en este bloque.",
  forbidden: "Tu rol no permite gestionar la cobertura.",
  "invalid-assignment": "La asignación recibida no es válida.",
  "invalid-assignment-reference":
    "La asignación ya no apunta a un bloque o coach válido.",
  "invalid-block": "El bloque recibido no es válido.",
  "invalid-coach": "El coach seleccionado no es válido.",
  "invalid-person-profile":
    "El perfil visible del coach no pertenece a esta organización.",
  "person-profile-inactive": "El perfil visible del coach no está activo.",
  "person-profile-internal":
    "Los perfiles internos no pueden asignarse como coaches operativos.",
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

function getScheduleBlockHref({
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
  return `${getSchedulePath({
    blockId,
    day: serviceDate,
    organizationId,
    view: "week",
    week: weekStart,
  })}`;
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
      label: `Coach sin perfil visible ${shortId(coachProfile.id)}`,
    };
  }

  return {
    detail: `Perfil técnico incompleto ${shortId(coachProfile.id)}`,
    id: coachProfile.id,
    isFallback: true,
    label: `Coach sin perfil visible ${shortId(coachProfile.id)}`,
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
  organizationId,
  weekEnd,
  weekStart,
}: {
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
  const coverageByBlock = calculateScheduleCoverageByBlock({
    assignments,
    blocks,
    coaches,
    memberships,
    persons,
  });

  return {
    assignments,
    assignableCoaches,
    blocks,
    centers,
    classTypes,
    coachDisplaysById,
    coverageByBlock,
  };
}

function getRiskItems(data: CoverageData) {
  return data.blocks
    .flatMap((block) => {
      const coverage = data.coverageByBlock.get(block.id);

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

function getSummary(riskItems: RiskItem[]) {
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

function selectClassName(className = "") {
  return [
    "h-11 w-full rounded-lg border border-input bg-background px-3 text-sm md:h-10",
    "outline-none transition-colors focus-visible:border-ring",
    "focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
    className,
  ]
    .filter(Boolean)
    .join(" ");
}

function groupAssignmentsByBlockId(assignments: AssignmentRow[]) {
  return assignments.reduce((groups, assignment) => {
    const blockAssignments = groups.get(assignment.schedule_block_id) ?? [];
    blockAssignments.push(assignment);
    groups.set(assignment.schedule_block_id, blockAssignments);

    return groups;
  }, new Map<string, AssignmentRow[]>());
}

function AssignmentStatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant={
        status === "assigned"
          ? "secondary"
          : status === "declined"
            ? "destructive"
            : "outline"
      }
    >
      {getScheduleAssignmentStatusLabel(status)}
    </Badge>
  );
}

function CoverageAssignmentPanel({
  assignableCoaches,
  assignments,
  block,
  canManageSchedule,
  coachDisplaysById,
  coverage,
  organizationId,
  returnPath,
  weekStart,
}: {
  assignableCoaches: CoachDisplay[];
  assignments: AssignmentRow[];
  block: ScheduleBlockRow;
  canManageSchedule: boolean;
  coachDisplaysById: Map<string, CoachDisplay>;
  coverage: ScheduleBlockCoverage;
  organizationId: string;
  returnPath: string;
  weekStart: string;
}) {
  const activeAssignments = assignments.filter(
    (assignment) => assignment.assignment_status !== "removed",
  );
  const removedAssignments = assignments.filter(
    (assignment) => assignment.assignment_status === "removed",
  );
  const logicalCoachProfileIds = new Set(
    activeAssignments.map((assignment) => assignment.coach_profile_id),
  );
  const availableCoaches = assignableCoaches.filter(
    (coach) => !logicalCoachProfileIds.has(coach.id),
  );
  const canAssign =
    canManageSchedule &&
    isCoverageActiveBlock(block.status) &&
    availableCoaches.length > 0;
  const conflictCoachNames = coverage.conflictCoachProfileIds.map(
    (coachProfileId) =>
      coachDisplaysById.get(coachProfileId)?.label ??
      `Coach ${shortId(coachProfileId)}`,
  );

  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <UserRound aria-hidden="true" className="size-4 shrink-0" />
          <h3 className="text-sm font-semibold">Asignaciones</h3>
        </div>
        <StatusBadge tone={getTone(coverage.state)}>
          {getScheduleCoverageStateLabel(coverage.state)}{" "}
          {coverage.validAssignmentCount}/{coverage.requiredCoaches}
        </StatusBadge>
      </div>

      {coverage.state === "conflict" && conflictCoachNames.length > 0 ? (
        <p className="text-sm text-destructive">
          Solapamiento detectado: {conflictCoachNames.join(", ")}.
        </p>
      ) : null}

      {activeAssignments.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No hay coaches asignados que cuenten para este bloque.
        </p>
      ) : (
        <div className="grid gap-2">
          {activeAssignments.map((assignment) => {
            const coachDisplay = coachDisplaysById.get(
              assignment.coach_profile_id,
            );

            return (
              <div
                className="flex flex-col gap-2 rounded-md border border-border/70 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                key={assignment.id}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium">
                      {coachDisplay?.label ??
                        `Coach ${shortId(assignment.coach_profile_id)}`}
                    </span>
                    <AssignmentStatusBadge
                      status={assignment.assignment_status}
                    />
                    <Badge variant="outline">{assignment.source}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {coachDisplay?.detail ?? "Perfil técnico sin nombre visible"}
                  </p>
                </div>

                {canManageSchedule ? (
                  <form action={removeScheduleBlockAssignment}>
                    <input
                      name="organizationId"
                      type="hidden"
                      value={organizationId}
                    />
                    <input name="weekStart" type="hidden" value={weekStart} />
                    <input name="returnPath" type="hidden" value={returnPath} />
                    <input
                      name="assignmentId"
                      type="hidden"
                      value={assignment.id}
                    />
                    <Button size="sm" type="submit" variant="outline">
                      <UserMinus aria-hidden="true" />
                      Retirar
                    </Button>
                  </form>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {removedAssignments.length > 0 ? (
        <details className="text-sm text-muted-foreground">
          <summary className="cursor-pointer select-none">
            {removedAssignments.length} retirada
            {removedAssignments.length === 1 ? "" : "s"} conservada
            {removedAssignments.length === 1 ? "" : "s"}
          </summary>
          <ul className="mt-2 grid gap-1">
            {removedAssignments.map((assignment) => (
              <li className="truncate" key={assignment.id}>
                {coachDisplaysById.get(assignment.coach_profile_id)?.label ??
                  `Coach ${shortId(assignment.coach_profile_id)}`}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {canManageSchedule ? (
        <form
          action={assignScheduleBlockCoach}
          className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"
        >
          <input name="organizationId" type="hidden" value={organizationId} />
          <input name="weekStart" type="hidden" value={weekStart} />
          <input name="returnPath" type="hidden" value={returnPath} />
          <input name="scheduleBlockId" type="hidden" value={block.id} />
          <label className="grid gap-2">
            <span className="text-sm font-medium">Coach asignable</span>
            <select
              className={selectClassName()}
              defaultValue={availableCoaches[0]?.id ?? ""}
              disabled={!canAssign}
              name="coachProfileId"
              required
            >
              {availableCoaches.length === 0 ? (
                <option value="">Sin coaches asignables disponibles</option>
              ) : null}
              {availableCoaches.map((coach) => (
                <option key={coach.id} value={coach.id}>
                  {coach.label}
                  {coach.isFallback ? " (sin perfil visible)" : ""}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <Button disabled={!canAssign} type="submit">
              <Plus aria-hidden="true" />
              Asignar coach
            </Button>
          </div>
        </form>
      ) : (
        <p className="text-sm text-muted-foreground">
          Tu rol puede consultar cobertura, pero no modificar asignaciones.
        </p>
      )}

      {canManageSchedule && !isCoverageActiveBlock(block.status) ? (
        <p className="text-sm text-muted-foreground">
          Los bloques cancelados o completados no admiten nuevas asignaciones.
        </p>
      ) : null}
    </div>
  );
}

function CoverageBlockDetailPanels({
  basePath,
  canManageSchedule,
  centersById,
  classTypesById,
  data,
  organizationId,
  selectedBlockId,
  weekStart,
}: {
  basePath: string;
  canManageSchedule: boolean;
  centersById: Map<string, CenterRow>;
  classTypesById: Map<string, ClassTypeRow>;
  data: CoverageData;
  organizationId: string;
  selectedBlockId: string | null;
  weekStart: string;
}) {
  if (!selectedBlockId) {
    return null;
  }

  const selectedBlock = data.blocks.find((block) => block.id === selectedBlockId);

  if (!selectedBlock) {
    return null;
  }

  const assignmentsByBlockId = groupAssignmentsByBlockId(data.assignments);
  const coverage = data.coverageByBlock.get(selectedBlock.id);
  const classType = classTypesById.get(selectedBlock.class_type_id);
  const center = centersById.get(selectedBlock.center_id);
  const returnPath = getCoverageBlockHref({
    basePath,
    blockId: selectedBlock.id,
  });

  if (!coverage) {
    throw new Error("Missing coverage state for coverage block.");
  }

  return (
    <aside className="fixed inset-0 z-50">
      <Link
        aria-label="Cerrar detalle"
        className="absolute inset-0 z-0 block cursor-default bg-foreground/20 backdrop-blur-sm"
        href={basePath}
        scroll={false}
      />
      <div className="relative z-10 ml-auto flex h-full w-full max-w-2xl flex-col overflow-y-auto bg-background shadow-xl ring-1 ring-border">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border bg-background/95 px-4 py-4 backdrop-blur">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={getTone(coverage.state)}>
                {getScheduleCoverageStateLabel(coverage.state)}{" "}
                {coverage.validAssignmentCount}/{coverage.requiredCoaches}
              </StatusBadge>
              {selectedBlock.is_template_exception ? (
                <Badge variant="outline">Cambiado</Badge>
              ) : null}
            </div>
            <h2 className="truncate text-lg font-semibold tracking-tight">
              {classType?.name ?? "Actividad"}
            </h2>
            <p className="truncate text-sm text-muted-foreground">
              {formatServiceDate(selectedBlock.service_date)} /{" "}
              {formatTime(selectedBlock.start_time)}-{formatTime(selectedBlock.end_time)}
            </p>
          </div>
          <Button asChild size="icon" variant="ghost">
            <Link aria-label="Cerrar detalle" href={basePath} scroll={false}>
              <X aria-hidden="true" />
            </Link>
          </Button>
        </div>

        <div className="space-y-4 p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
          <div className="grid gap-3 rounded-lg border border-border bg-muted/25 p-4 text-sm sm:grid-cols-2">
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground">
                Centro
              </p>
              <p className="mt-1 truncate font-medium">
                {center?.name ?? "Centro no disponible"}
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground">
                Cobertura
              </p>
              <p className="mt-1 font-medium">
                {coverage.validAssignmentCount}/{coverage.requiredCoaches}{" "}
                coaches
              </p>
            </div>
          </div>

          <CoverageAssignmentPanel
            assignableCoaches={data.assignableCoaches}
            assignments={assignmentsByBlockId.get(selectedBlock.id) ?? []}
            block={selectedBlock}
            canManageSchedule={canManageSchedule}
            coachDisplaysById={data.coachDisplaysById}
            coverage={coverage}
            organizationId={organizationId}
            returnPath={returnPath}
            weekStart={weekStart}
          />

          <Button asChild variant="outline">
            <Link
              href={getScheduleBlockHref({
                blockId: selectedBlock.id,
                organizationId,
                serviceDate: selectedBlock.service_date,
                weekStart,
              })}
            >
              Ver en horario
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </div>
    </aside>
  );
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
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard
        description="Necesitan una decisión."
        icon={ShieldAlert}
        label="Riesgos"
        tone={riskItems.length > 0 ? "critical" : "success"}
        value={riskItems.length}
      />
      <StatCard
        description="Sin coach asignado."
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
        description="Bloques de la semana."
        icon={CalendarDays}
        label="Todas las clases"
        value={blockCount}
      />
    </div>
  );
}

function ResolveNow({
  basePath,
  canManageSchedule,
  centersById,
  classTypesById,
  organizationId,
  riskItems,
  weekStart,
}: {
  basePath: string;
  canManageSchedule: boolean;
  centersById: Map<string, CenterRow>;
  classTypesById: Map<string, ClassTypeRow>;
  organizationId: string;
  riskItems: RiskItem[];
  weekStart: string;
}) {
  return (
    <section className="space-y-3">
      <SectionHeader
        description="Lo primero que debería revisar un admin está arriba."
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
          description="No hay clases sin cubrir, insuficientes ni conflictos en esta semana."
          title="Todo cubierto para esta semana"
        />
      ) : (
        <div className="grid gap-3">
          {riskItems.map((item) => {
            const classType = classTypesById.get(item.block.class_type_id);
            const center = centersById.get(item.block.center_id);

            return (
              <CoverageRiskCard
                actionLabel={canManageSchedule ? "Resolver" : "Abrir"}
                center={center?.name ?? "Centro no disponible"}
                href={getCoverageBlockHref({
                  basePath,
                  blockId: item.block.id,
                })}
                scroll={false}
                key={item.block.id}
                meta={`${item.coverage.validAssignmentCount}/${item.coverage.requiredCoaches} coaches`}
                status={getScheduleCoverageStateLabel(item.coverage.state)}
                time={`${formatTime(item.block.start_time)} - ${formatTime(item.block.end_time)}`}
                title={`${formatServiceDate(item.block.service_date)} / ${
                  classType?.name ?? "Actividad"
                }`}
                tone={getTone(item.coverage.state)}
              />
            );
          })}
        </div>
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
                      <StatusBadge tone={getTone(state)}>
                        {getScheduleCoverageStateLabel(state)}
                      </StatusBadge>
                    </div>
                    <p className="mt-1 truncate text-sm text-muted-foreground">
                      {formatServiceDate(block.service_date)} /{" "}
                      {center?.name ?? "Centro no disponible"}
                    </p>
                  </div>
                  <Button asChild className="w-full sm:w-auto" size="sm" variant="outline">
                    <Link
                      href={getCoverageBlockHref({
                        basePath,
                        blockId: block.id,
                      })}
                      scroll={false}
                    >
                      Abrir
                    </Link>
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
  const data = await getCoverageData({
    organizationId: resolution.organization.id,
    weekEnd: week.weekEnd,
    weekStart: week.weekStart,
  });
  const riskItems = getRiskItems(data);
  const centersById = new Map(data.centers.map((center) => [center.id, center]));
  const classTypesById = new Map(
    data.classTypes.map((classType) => [classType.id, classType]),
  );
  const canManageSchedule = resolution.membership.role === "admin";
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
        description="Riesgos accionables de la semana: clases sin coach, cobertura insuficiente y conflictos."
        meta={<Badge variant="outline">{resolution.organization.name}</Badge>}
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
        <Alert>
          <AlertTitle>{successMessages[status]}</AlertTitle>
          <AlertDescription>
            La cola de cobertura ya muestra los datos actuales.
          </AlertDescription>
        </Alert>
      ) : null}

      {error && errorMessages[error] ? (
        <Alert variant="destructive">
          <AlertTitle>No se han guardado los cambios</AlertTitle>
          <AlertDescription>{errorMessages[error]}</AlertDescription>
        </Alert>
      ) : null}

      <CoverageOverview blockCount={data.blocks.length} riskItems={riskItems} />

      <ResolveNow
        basePath={coverageBasePath}
        canManageSchedule={canManageSchedule}
        centersById={centersById}
        classTypesById={classTypesById}
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
              Ahora la prioridad sale del horario: clases sin coach, cobertura
              insuficiente y conflictos.
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
        basePath={coverageBasePath}
        canManageSchedule={canManageSchedule}
        centersById={centersById}
        classTypesById={classTypesById}
        data={data}
        organizationId={resolution.organization.id}
        selectedBlockId={selectedBlockId}
        weekStart={week.weekStart}
      />
    </div>
  );
}
