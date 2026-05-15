"use client";

import Link from "next/link";
import * as React from "react";
import {
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  CircleOff,
  Clock,
  Dumbbell,
  MapPin,
  Plus,
  Save,
  UserMinus,
  UserRound,
  X,
} from "lucide-react";

import {
  assignScheduleBlockCoach,
  cancelScheduleBlock,
  removeScheduleBlockAssignment,
  updateScheduleBlock,
} from "./actions";
import {
  pushRouteStateHref,
  RouteStateButton,
  useRouteQueryParam,
} from "@/components/features/route-state-link";
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
import { Textarea } from "@/components/ui/textarea";
import {
  SCHEDULE_BLOCK_STATUSES,
  formatTimeForInput,
  getUnavailableScheduleCoachAssignments,
  getScheduleAssignmentStatusLabel,
  getScheduleBlockStatusLabel,
  getScheduleCoverageStateLabel,
  isCoverageActiveBlock,
  type ScheduleBlockCoverage,
  type ScheduleBlockStatus,
  type ScheduleCoachUnavailableAssignment,
  type ScheduleCoverageState,
} from "@/lib/schedule-blocks";
import { getRequestsPath } from "@/lib/navigation/app-paths";
import type { Tables } from "@/types/supabase";

type ScheduleBlockRow = Pick<
  Tables<"schedule_blocks">,
  | "center_id"
  | "class_type_id"
  | "end_time"
  | "id"
  | "is_template_exception"
  | "notes"
  | "required_coaches"
  | "service_date"
  | "start_time"
  | "status"
  | "template_block_id"
  | "template_id"
  | "updated_at"
>;

type CenterRow = Pick<Tables<"centers">, "id" | "name" | "status">;

type ClassTypeRow = Pick<
  Tables<"class_types">,
  "category" | "color" | "id" | "name" | "required_coaches" | "status"
>;

type ScheduleBlockAssignmentRow = Pick<
  Tables<"schedule_block_assignments">,
  | "assignment_status"
  | "coach_profile_id"
  | "id"
  | "schedule_block_id"
  | "source"
  | "updated_at"
>;

type CoachDisplay = {
  detail: string;
  id: string;
  isFallback: boolean;
  label: string;
};

type ScheduleFilters = {
  blockStatus: ScheduleBlockStatus | null;
  centerId: string | null;
  classTypeId: string | null;
  coachProfileId: string | null;
  coverageState: string | null;
  mineOnly: boolean;
  risksOnly: boolean;
};

type ScheduleView = "week" | "agenda" | "month";

type ScheduleBlockDetailPanelsProps = {
  assignableCoaches: CoachDisplay[];
  assignments: ScheduleBlockAssignmentRow[];
  basePath: string;
  blocks: ScheduleBlockRow[];
  canManageSchedule: boolean;
  centers: CenterRow[];
  classTypes: ClassTypeRow[];
  coachDisplays: CoachDisplay[];
  coverageByBlock: Array<[string, ScheduleBlockCoverage]>;
  filters: ScheduleFilters;
  initialSelectedBlockId: string | null;
  organizationId: string;
  view: ScheduleView;
  weekEnd: string;
  weekStart: string;
};

function selectClassName(className = "") {
  return [
    "h-11 w-full min-w-0 truncate rounded-md border border-input bg-transparent py-1 pl-3 pr-9 text-sm md:h-9",
    "outline-none transition-colors focus-visible:border-ring",
    "focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
    className,
  ]
    .filter(Boolean)
    .join(" ");
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

function formatTime(value: string) {
  return formatTimeForInput(value) || value;
}

function shortId(value: string) {
  return value.slice(0, 8);
}

function getUnavailableCoachSummaries({
  coachDisplaysById,
  unavailableAssignments,
}: {
  coachDisplaysById: Map<string, CoachDisplay>;
  unavailableAssignments: ScheduleCoachUnavailableAssignment[];
}) {
  const summaries = new Map<string, string>();

  for (const unavailableAssignment of unavailableAssignments) {
    const coachLabel =
      coachDisplaysById.get(unavailableAssignment.coachProfileId)?.label ??
      `Entrenador ${shortId(unavailableAssignment.coachProfileId)}`;
    const summary = `${coachLabel} ${formatTime(
      unavailableAssignment.startTime,
    )}-${formatTime(unavailableAssignment.endTime)}`;

    summaries.set(
      `${unavailableAssignment.coachProfileId}:${unavailableAssignment.scheduleBlockId}`,
      summary,
    );
  }

  return [...summaries.values()];
}

function getSafeColor(value: string | null) {
  return value && /^#[0-9a-f]{6}$/i.test(value) ? value : null;
}

function getScheduleBlockPanelPath({
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

function groupAssignmentsByBlockId(assignments: ScheduleBlockAssignmentRow[]) {
  return assignments.reduce((groups, assignment) => {
    const blockAssignments = groups.get(assignment.schedule_block_id) ?? [];
    blockAssignments.push(assignment);
    groups.set(assignment.schedule_block_id, blockAssignments);

    return groups;
  }, new Map<string, ScheduleBlockAssignmentRow[]>());
}

function usePanelRouteLifecycle({
  closeHref,
  isOpen,
}: {
  closeHref: string;
  isOpen: boolean;
}) {
  React.useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      pushRouteStateHref(closeHref);
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeHref, isOpen]);

  React.useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);
}

function ColorSwatch({ color }: { color: string | null }) {
  const safeColor = getSafeColor(color);

  return (
    <span
      aria-hidden="true"
      className="size-3.5 shrink-0 rounded-full border border-border"
      style={safeColor ? { backgroundColor: safeColor } : undefined}
    />
  );
}

function ScheduleBlockStatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant={
        status === "cancelled"
          ? "destructive"
          : status === "scheduled"
            ? "secondary"
            : "outline"
      }
    >
      {getScheduleBlockStatusLabel(status)}
    </Badge>
  );
}

function getCoverageBadgeVariant(state: ScheduleCoverageState) {
  if (state === "conflict" || state === "uncovered") {
    return "destructive";
  }

  if (state === "covered") {
    return "secondary";
  }

  return "outline";
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

function getAbsenceImpactMessage(coverage: ScheduleBlockCoverage) {
  if (coverage.absenceImpact.coverageNeededCount > 0) {
    return "Impacto de ausencia aprobado: una asignacion sigue en el horario, pero requiere revision de cobertura.";
  }

  if (coverage.absenceImpact.potentialCount > 0) {
    return "Ausencia en revision: puede requerir cobertura si se aprueba.";
  }

  return null;
}

function CoverageBadge({ coverage }: { coverage: ScheduleBlockCoverage }) {
  const icon =
    coverage.state === "covered" ? (
      <CheckCircle2 aria-hidden="true" />
    ) : coverage.state === "conflict" ||
      coverage.state === "insufficient" ||
      coverage.state === "uncovered" ? (
      <AlertTriangle aria-hidden="true" />
    ) : null;
  const absenceImpactLabel = getAbsenceImpactLabel(coverage);

  return (
    <span className="flex flex-wrap gap-2">
      <Badge variant={getCoverageBadgeVariant(coverage.state)}>
        {icon}
        {getScheduleCoverageStateLabel(coverage.state)}
        {coverage.state !== "inactive" && coverage.state !== "not_required"
          ? ` ${coverage.validAssignmentCount}/${coverage.requiredCoaches}`
          : null}
      </Badge>
      {absenceImpactLabel ? (
        <Badge variant="outline">{absenceImpactLabel}</Badge>
      ) : null}
    </span>
  );
}

function CenterSelect({
  centers,
  defaultValue,
  disabled,
}: {
  centers: CenterRow[];
  defaultValue?: string;
  disabled?: boolean;
}) {
  return (
    <select
      className={selectClassName()}
      defaultValue={defaultValue ?? centers[0]?.id ?? ""}
      disabled={disabled}
      name="centerId"
      required
    >
      {centers.length === 0 ? (
        <option value="">Sin centros activos</option>
      ) : null}
      {centers.map((center) => (
        <option key={center.id} value={center.id}>
          {center.name}
          {center.status === "inactive" ? " (inactivo)" : ""}
        </option>
      ))}
    </select>
  );
}

function ClassTypeSelect({
  classTypes,
  defaultValue,
  disabled,
}: {
  classTypes: ClassTypeRow[];
  defaultValue?: string;
  disabled?: boolean;
}) {
  return (
    <select
      className={selectClassName()}
      defaultValue={defaultValue ?? classTypes[0]?.id ?? ""}
      disabled={disabled}
      name="classTypeId"
      required
    >
      {classTypes.length === 0 ? (
        <option value="">Sin tipos activos</option>
      ) : null}
      {classTypes.map((classType) => (
        <option key={classType.id} value={classType.id}>
          {classType.name}
          {classType.status === "inactive" ? " (inactivo)" : ""}
        </option>
      ))}
    </select>
  );
}

function StatusSelect({
  defaultValue,
  disabled,
}: {
  defaultValue?: string;
  disabled?: boolean;
}) {
  return (
    <select
      className={selectClassName()}
      defaultValue={defaultValue ?? "scheduled"}
      disabled={disabled}
      name="status"
    >
      {SCHEDULE_BLOCK_STATUSES.map((status) => (
        <option key={status} value={status}>
          {getScheduleBlockStatusLabel(status)}
        </option>
      ))}
    </select>
  );
}

function ScheduleBlockFields({
  block,
  centers,
  classTypes,
  disabled,
  weekEnd,
  weekStart,
}: {
  block?: ScheduleBlockRow;
  centers: CenterRow[];
  classTypes: ClassTypeRow[];
  disabled?: boolean;
  weekEnd: string;
  weekStart: string;
}) {
  return (
    <>
      <label className="grid min-w-0 gap-2">
        <span className="text-sm font-medium">Fecha</span>
        <Input
          defaultValue={block?.service_date ?? weekStart}
          disabled={disabled}
          max={weekEnd}
          min={weekStart}
          name="serviceDate"
          required
          type="date"
        />
      </label>

      <label className="grid min-w-0 gap-2">
        <span className="text-sm font-medium">Inicio</span>
        <Input
          defaultValue={block ? formatTimeForInput(block.start_time) : ""}
          disabled={disabled}
          name="startTime"
          required
          type="time"
        />
      </label>

      <label className="grid min-w-0 gap-2">
        <span className="text-sm font-medium">Fin</span>
        <Input
          defaultValue={block ? formatTimeForInput(block.end_time) : ""}
          disabled={disabled}
          name="endTime"
          required
          type="time"
        />
      </label>

      <label className="grid min-w-0 gap-2">
        <span className="text-sm font-medium">Centro</span>
        <CenterSelect
          centers={centers}
          defaultValue={block?.center_id}
          disabled={disabled}
        />
      </label>

      <label className="grid min-w-0 gap-2">
        <span className="text-sm font-medium">Tipo de actividad</span>
        <ClassTypeSelect
          classTypes={classTypes}
          defaultValue={block?.class_type_id}
          disabled={disabled}
        />
      </label>

      <label className="grid min-w-0 gap-2">
        <span className="text-sm font-medium">Entrenadores necesarios</span>
        <Input
          defaultValue={block?.required_coaches ?? 1}
          disabled={disabled}
          max="20"
          min="0"
          name="requiredCoaches"
          required
          type="number"
        />
      </label>

      <label className="grid min-w-0 gap-2">
        <span className="text-sm font-medium">Estado</span>
        <StatusSelect defaultValue={block?.status} disabled={disabled} />
      </label>

      <label className="grid min-w-0 gap-2 sm:col-span-2">
        <span className="text-sm font-medium">Notas</span>
        <Textarea
          defaultValue={block?.notes ?? ""}
          disabled={disabled}
          maxLength={1000}
          name="notes"
          placeholder="Contexto operativo del bloque"
        />
      </label>
    </>
  );
}

function ScheduleFilterHiddenInputs({
  day,
  filters,
  view,
}: {
  day?: string | null;
  filters: ScheduleFilters;
  view?: ScheduleView;
}) {
  return (
    <>
      {view ? <input name="view" type="hidden" value={view} /> : null}
      {day ? <input name="day" type="hidden" value={day} /> : null}
      {filters.centerId ? (
        <input name="center_id" type="hidden" value={filters.centerId} />
      ) : null}
      {filters.coachProfileId ? (
        <input
          name="coach_profile_id"
          type="hidden"
          value={filters.coachProfileId}
        />
      ) : null}
      {filters.classTypeId ? (
        <input name="class_type_id" type="hidden" value={filters.classTypeId} />
      ) : null}
      {filters.blockStatus ? (
        <input name="block_status" type="hidden" value={filters.blockStatus} />
      ) : null}
      {filters.coverageState ? (
        <input
          name="coverage_state"
          type="hidden"
          value={filters.coverageState}
        />
      ) : null}
      {filters.mineOnly ? <input name="mine" type="hidden" value="1" /> : null}
      {filters.risksOnly ? (
        <input name="risks_only" type="hidden" value="1" />
      ) : null}
    </>
  );
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

function ScheduleAssignmentPanel({
  assignableCoaches,
  allAssignments,
  assignments,
  block,
  blocks = [block],
  canManageSchedule,
  coachDisplaysById,
  coverage,
  filters,
  organizationId,
  returnPath,
  view,
  weekStart,
}: {
  assignableCoaches: CoachDisplay[];
  allAssignments?: ScheduleBlockAssignmentRow[];
  assignments: ScheduleBlockAssignmentRow[];
  block: ScheduleBlockRow;
  blocks?: ScheduleBlockRow[];
  canManageSchedule: boolean;
  coachDisplaysById: Map<string, CoachDisplay>;
  coverage: ScheduleBlockCoverage;
  filters?: ScheduleFilters;
  organizationId?: string;
  returnPath?: string;
  view?: ScheduleView;
  weekStart?: string;
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
  const unavailableCoachAssignments = getUnavailableScheduleCoachAssignments({
    assignments: allAssignments ?? assignments,
    blocks,
    targetBlock: block,
  });
  const unavailableCoachProfileIds = new Set(
    unavailableCoachAssignments.map((assignment) => assignment.coachProfileId),
  );
  const unavailableCoachSummaries = getUnavailableCoachSummaries({
    coachDisplaysById,
    unavailableAssignments: unavailableCoachAssignments,
  });
  const availableCoaches = assignableCoaches.filter(
    (coach) =>
      !logicalCoachProfileIds.has(coach.id) &&
      !unavailableCoachProfileIds.has(coach.id),
  );
  const assignmentMutationContext =
    canManageSchedule && organizationId && weekStart
      ? { organizationId, weekStart }
      : null;
  const canAssign =
    Boolean(assignmentMutationContext) &&
    isCoverageActiveBlock(block.status) &&
    availableCoaches.length > 0;
  const conflictCoachNames = coverage.conflictCoachProfileIds.map(
    (coachProfileId) =>
      coachDisplaysById.get(coachProfileId)?.label ??
      `Entrenador ${shortId(coachProfileId)}`,
  );
  const absenceImpactMessage = getAbsenceImpactMessage(coverage);

  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <UserRound aria-hidden="true" className="size-4 shrink-0" />
          <h4 className="text-sm font-medium">Asignaciones</h4>
        </div>
        <CoverageBadge coverage={coverage} />
      </div>

      {coverage.state === "conflict" && conflictCoachNames.length > 0 ? (
        <p className="text-sm text-destructive">
          Solapamiento detectado: {conflictCoachNames.join(", ")}.
        </p>
      ) : null}

      {absenceImpactMessage ? (
        <p className="text-sm text-amber-700">{absenceImpactMessage}</p>
      ) : null}

      {activeAssignments.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No hay entrenadores asignados que cuenten para esta fila de trabajo.
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
                        `Entrenador ${shortId(assignment.coach_profile_id)}`}
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

                {organizationId || assignmentMutationContext ? (
                  <div className="flex flex-wrap gap-2">
                    {organizationId ? (
                      <Button asChild size="sm" variant="outline">
                        <Link
                          href={getRequestsPath({
                            assignmentId: assignment.id,
                            blockId: block.id,
                            organizationId,
                          })}
                        >
                          Solicitar cobertura
                          <ArrowRight aria-hidden="true" />
                        </Link>
                      </Button>
                    ) : null}

                    {assignmentMutationContext ? (
                      <form action={removeScheduleBlockAssignment}>
                        <input
                          name="organizationId"
                          type="hidden"
                          value={assignmentMutationContext.organizationId}
                        />
                        <input
                          name="weekStart"
                          type="hidden"
                          value={assignmentMutationContext.weekStart}
                        />
                        {returnPath ? (
                          <input
                            name="returnPath"
                            type="hidden"
                            value={returnPath}
                          />
                        ) : null}
                        {filters ? (
                          <ScheduleFilterHiddenInputs
                            filters={filters}
                            view={view}
                          />
                        ) : null}
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
                  `Entrenador ${shortId(assignment.coach_profile_id)}`}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {assignmentMutationContext && unavailableCoachSummaries.length > 0 ? (
        <details className="rounded-md border border-border/70 bg-muted/25 px-3 py-2 text-sm text-muted-foreground">
          <summary className="cursor-pointer select-none font-medium text-foreground">
            {unavailableCoachProfileIds.size} entrenador
            {unavailableCoachProfileIds.size === 1 ? "" : "es"} no disponible
            {unavailableCoachProfileIds.size === 1 ? "" : "s"} en esta franja
          </summary>
          <ul className="mt-2 grid gap-1">
            {unavailableCoachSummaries.slice(0, 6).map((summary) => (
              <li className="truncate" key={summary}>
                {summary}
              </li>
            ))}
            {unavailableCoachSummaries.length > 6 ? (
              <li>
                +{unavailableCoachSummaries.length - 6} solapamiento
                {unavailableCoachSummaries.length - 6 === 1 ? "" : "s"} más
              </li>
            ) : null}
          </ul>
        </details>
      ) : null}

      {assignmentMutationContext ? (
        <form
          action={assignScheduleBlockCoach}
          className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"
        >
          <input
            name="organizationId"
            type="hidden"
            value={assignmentMutationContext.organizationId}
          />
          <input
            name="weekStart"
            type="hidden"
            value={assignmentMutationContext.weekStart}
          />
          {returnPath ? (
            <input name="returnPath" type="hidden" value={returnPath} />
          ) : null}
          {filters ? (
            <ScheduleFilterHiddenInputs filters={filters} view={view} />
          ) : null}
          <input name="scheduleBlockId" type="hidden" value={block.id} />
          <label className="grid min-w-0 gap-2">
            <span className="text-sm font-medium">Entrenador asignable</span>
            <select
              className={selectClassName()}
              defaultValue={availableCoaches[0]?.id ?? ""}
              disabled={!canAssign}
              name="coachProfileId"
              required
            >
              {availableCoaches.length === 0 ? (
                <option value="">
                  {unavailableCoachProfileIds.size > 0
                    ? "Sin entrenadores libres en esta franja"
                    : "Sin entrenadores asignables disponibles"}
                </option>
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
              Asignar entrenador
            </Button>
          </div>
        </form>
      ) : null}

      {assignmentMutationContext && !isCoverageActiveBlock(block.status) ? (
        <p className="text-sm text-muted-foreground">
          Los bloques cancelados o completados no admiten nuevas asignaciones.
        </p>
      ) : null}
    </div>
  );
}

function ScheduleBlockReadOnlyCard({
  assignableCoaches,
  assignments,
  block,
  center,
  classType,
  coachDisplaysById,
  coverage,
  organizationId,
}: {
  assignableCoaches: CoachDisplay[];
  assignments: ScheduleBlockAssignmentRow[];
  block: ScheduleBlockRow;
  center?: CenterRow;
  classType?: ClassTypeRow;
  coachDisplaysById: Map<string, CoachDisplay>;
  coverage: ScheduleBlockCoverage;
  organizationId: string;
}) {
  return (
    <Card className="border-0 bg-transparent shadow-none ring-0">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <CardTitle className="flex items-center gap-2">
              <Clock aria-hidden="true" className="size-4 shrink-0" />
              <span>
                {formatTime(block.start_time)} - {formatTime(block.end_time)}
              </span>
            </CardTitle>
            <CardDescription>
              {formatServiceDate(block.service_date)}
            </CardDescription>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {block.is_template_exception ? (
              <Badge variant="outline">Excepcion</Badge>
            ) : null}
            <ScheduleBlockStatusBadge status={block.status} />
            <CoverageBadge coverage={coverage} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-5">
          <div className="min-w-0">
            <dt className="text-muted-foreground">Centro</dt>
            <dd className="mt-1 truncate font-medium">
              {center?.name ?? "Centro no disponible"}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted-foreground">Tipo</dt>
            <dd className="mt-1 flex min-w-0 items-center gap-2 font-medium">
              <ColorSwatch color={classType?.color ?? null} />
              <span className="truncate">
                {classType?.name ?? "Tipo no disponible"}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Entrenadores necesarios</dt>
            <dd className="mt-1 font-medium">{block.required_coaches}</dd>
          </div>
          <div className="min-w-0 lg:col-span-2">
            <dt className="text-muted-foreground">Notas</dt>
            <dd className="mt-1 whitespace-pre-wrap break-words">
              {block.notes || "Sin notas"}
            </dd>
          </div>
        </dl>
        <ScheduleAssignmentPanel
          assignableCoaches={assignableCoaches}
          assignments={assignments}
          block={block}
          canManageSchedule={false}
          coachDisplaysById={coachDisplaysById}
          coverage={coverage}
          organizationId={organizationId}
        />
      </CardContent>
    </Card>
  );
}

function ScheduleBlockAdminCard({
  assignableCoaches,
  allAssignments,
  assignments,
  block,
  blocks,
  center,
  centers,
  classType,
  classTypes,
  coachDisplaysById,
  coverage,
  filters,
  organizationId,
  returnPath,
  view,
  weekEnd,
  weekStart,
}: {
  assignableCoaches: CoachDisplay[];
  allAssignments: ScheduleBlockAssignmentRow[];
  assignments: ScheduleBlockAssignmentRow[];
  block: ScheduleBlockRow;
  blocks: ScheduleBlockRow[];
  center?: CenterRow;
  centers: CenterRow[];
  classType?: ClassTypeRow;
  classTypes: ClassTypeRow[];
  coachDisplaysById: Map<string, CoachDisplay>;
  coverage: ScheduleBlockCoverage;
  filters: ScheduleFilters;
  organizationId: string;
  returnPath: string;
  view: ScheduleView;
  weekEnd: string;
  weekStart: string;
}) {
  return (
    <Card className="border-0 bg-transparent shadow-none ring-0">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <CardTitle className="flex items-center gap-2">
              <Clock aria-hidden="true" className="size-4 shrink-0" />
              <span>
                {formatTime(block.start_time)} - {formatTime(block.end_time)}
              </span>
            </CardTitle>
            <CardDescription className="flex flex-wrap items-center gap-2">
              <span>{formatServiceDate(block.service_date)}</span>
              <span aria-hidden="true">/</span>
              <span className="inline-flex min-w-0 items-center gap-1">
                <MapPin aria-hidden="true" className="size-3.5 shrink-0" />
                <span className="truncate">
                  {center?.name ?? "Centro no disponible"}
                </span>
              </span>
              <span aria-hidden="true">/</span>
              <span className="inline-flex min-w-0 items-center gap-1">
                <Dumbbell aria-hidden="true" className="size-3.5 shrink-0" />
                <span className="truncate">
                  {classType?.name ?? "Tipo no disponible"}
                </span>
              </span>
            </CardDescription>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {block.is_template_exception ? (
              <Badge variant="outline">Excepcion</Badge>
            ) : null}
            <ScheduleBlockStatusBadge status={block.status} />
            <CoverageBadge coverage={coverage} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <ScheduleAssignmentPanel
          assignableCoaches={assignableCoaches}
          allAssignments={allAssignments}
          assignments={assignments}
          block={block}
          blocks={blocks}
          canManageSchedule={true}
          coachDisplaysById={coachDisplaysById}
          coverage={coverage}
          filters={filters}
          organizationId={organizationId}
          returnPath={returnPath}
          view={view}
          weekStart={weekStart}
        />

        <form action={updateScheduleBlock} className="grid gap-4 sm:grid-cols-2">
          <input name="organizationId" type="hidden" value={organizationId} />
          <input name="weekStart" type="hidden" value={weekStart} />
          <input name="returnPath" type="hidden" value={returnPath} />
          <ScheduleFilterHiddenInputs filters={filters} view={view} />
          <input name="scheduleBlockId" type="hidden" value={block.id} />
          <ScheduleBlockFields
            block={block}
            centers={centers}
            classTypes={classTypes}
            weekEnd={weekEnd}
            weekStart={weekStart}
          />
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <Button type="submit">
              <Save aria-hidden="true" />
              Guardar bloque
            </Button>
          </div>
        </form>

        {block.status !== "cancelled" ? (
          <form action={cancelScheduleBlock}>
            <input name="organizationId" type="hidden" value={organizationId} />
            <input name="weekStart" type="hidden" value={weekStart} />
            <input name="returnPath" type="hidden" value={returnPath} />
            <ScheduleFilterHiddenInputs filters={filters} view={view} />
            <input name="scheduleBlockId" type="hidden" value={block.id} />
            <Button type="submit" variant="destructive">
              <CircleOff aria-hidden="true" />
              Cancelar bloque
            </Button>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function ScheduleBlockDetailPanels({
  assignableCoaches,
  assignments,
  basePath,
  blocks,
  canManageSchedule,
  centers,
  classTypes,
  coachDisplays,
  coverageByBlock,
  filters,
  initialSelectedBlockId,
  organizationId,
  view,
  weekEnd,
  weekStart,
}: ScheduleBlockDetailPanelsProps) {
  const validBlockIds = React.useMemo(
    () => blocks.map((block) => block.id),
    [blocks],
  );
  const selectedBlockId = useRouteQueryParam({
    initialValue: initialSelectedBlockId,
    paramName: "block_id",
    validValues: validBlockIds,
  });
  const selectedBlock = blocks.find((block) => block.id === selectedBlockId);
  const centersById = React.useMemo(
    () => new Map(centers.map((center) => [center.id, center])),
    [centers],
  );
  const classTypesById = React.useMemo(
    () => new Map(classTypes.map((classType) => [classType.id, classType])),
    [classTypes],
  );
  const assignmentsByBlockId = React.useMemo(
    () => groupAssignmentsByBlockId(assignments),
    [assignments],
  );
  const coverageByBlockId = React.useMemo(
    () => new Map(coverageByBlock),
    [coverageByBlock],
  );
  const coachDisplaysById = React.useMemo(
    () => new Map(coachDisplays.map((coach) => [coach.id, coach])),
    [coachDisplays],
  );
  const closeHref = basePath;

  usePanelRouteLifecycle({
    closeHref,
    isOpen: Boolean(selectedBlock),
  });

  if (!selectedBlock) {
    return null;
  }

  const coverage = coverageByBlockId.get(selectedBlock.id);

  if (!coverage) {
    return null;
  }

  const returnPath = getScheduleBlockPanelPath({
    basePath,
    blockId: selectedBlock.id,
  });

  return (
    <aside className="fixed inset-0 z-50" data-operational-detail-panel="schedule-block">
      <RouteStateButton
        aria-label="Cerrar detalle"
        className="absolute inset-0 z-0 block cursor-default bg-foreground/20 p-0 backdrop-blur-sm"
        href={closeHref}
      />
      <div className="relative z-10 ml-auto flex h-full w-full max-w-2xl flex-col overflow-y-auto bg-background shadow-xl ring-1 ring-border">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border bg-background/95 px-4 py-4 backdrop-blur">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <CoverageBadge coverage={coverage} />
              <ScheduleBlockStatusBadge status={selectedBlock.status} />
            </div>
            <h2 className="truncate text-lg font-semibold tracking-tight">
              {classTypesById.get(selectedBlock.class_type_id)?.name ??
                "Actividad"}
            </h2>
            <p className="truncate text-sm text-muted-foreground">
              {formatServiceDate(selectedBlock.service_date)} /{" "}
              {formatTime(selectedBlock.start_time)}-
              {formatTime(selectedBlock.end_time)}
            </p>
          </div>
          <Button asChild size="icon" variant="ghost">
            <RouteStateButton aria-label="Cerrar detalle" href={closeHref}>
              <X aria-hidden="true" />
            </RouteStateButton>
          </Button>
        </div>

        <div className="p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
          {canManageSchedule ? (
            <ScheduleBlockAdminCard
              assignableCoaches={assignableCoaches}
              allAssignments={assignments}
              assignments={assignmentsByBlockId.get(selectedBlock.id) ?? []}
              block={selectedBlock}
              blocks={blocks}
              center={centersById.get(selectedBlock.center_id)}
              centers={centers}
              classType={classTypesById.get(selectedBlock.class_type_id)}
              classTypes={classTypes}
              coachDisplaysById={coachDisplaysById}
              coverage={coverage}
              filters={filters}
              organizationId={organizationId}
              returnPath={returnPath}
              view={view}
              weekEnd={weekEnd}
              weekStart={weekStart}
            />
          ) : (
            <ScheduleBlockReadOnlyCard
              assignableCoaches={assignableCoaches}
              assignments={assignmentsByBlockId.get(selectedBlock.id) ?? []}
              block={selectedBlock}
              center={centersById.get(selectedBlock.center_id)}
              classType={classTypesById.get(selectedBlock.class_type_id)}
              coachDisplaysById={coachDisplaysById}
              coverage={coverage}
              organizationId={organizationId}
            />
          )}
        </div>
      </div>
    </aside>
  );
}
