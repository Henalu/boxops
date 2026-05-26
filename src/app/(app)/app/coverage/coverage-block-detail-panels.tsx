"use client";

import Link from "next/link";
import * as React from "react";
import { ArrowRight, History, Plus, UserMinus, UserRound, X } from "lucide-react";

import {
  assignScheduleBlockCoach,
  removeScheduleBlockAssignment,
} from "../schedule/actions";
import {
  pushRouteStateHref,
  RouteStateButton,
  useRouteQueryParam,
} from "@/components/features/route-state-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  getUnavailableScheduleCoachAssignments,
  getScheduleAssignmentStatusLabel,
  getScheduleCoverageStateLabel,
  isCoverageActiveBlock,
  type ScheduleBlockCoverage,
  type ScheduleCoachUnavailableAssignment,
  type ScheduleCoverageState,
} from "@/lib/schedule-blocks";
import { getRequestsPath, getSchedulePath } from "@/lib/navigation/app-paths";
import { cn } from "@/lib/utils";
import type { CoverageTraceItem } from "@/lib/coverage-traceability";
import type { Tables } from "@/types/supabase";

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

type CoachDisplay = {
  detail: string;
  id: string;
  isFallback: boolean;
  label: string;
};

type Tone = "critical" | "neutral" | "success" | "warning";

type CoverageBlockDetailPanelsProps = {
  assignableCoaches: CoachDisplay[];
  assignments: AssignmentRow[];
  basePath: string;
  blocks: ScheduleBlockRow[];
  canManageSchedule: boolean;
  centers: CenterRow[];
  classTypes: ClassTypeRow[];
  coachDisplays: CoachDisplay[];
  coverageByBlock: Array<[string, ScheduleBlockCoverage]>;
  coverageTraceByBlock: Array<[string, CoverageTraceItem[]]>;
  coverageTraceLoadError?: boolean;
  initialSelectedBlockId: string | null;
  organizationId: string;
  weekStart: string;
};

const toneClasses: Record<Tone, string> = {
  critical:
    "border-destructive/35 bg-destructive/10 text-destructive ring-destructive/20",
  neutral: "border-border bg-card text-card-foreground ring-foreground/10",
  success:
    "border-emerald-300/55 bg-emerald-50 text-emerald-800 ring-emerald-200/70",
  warning:
    "border-orange-300/60 bg-orange-50 text-orange-800 ring-orange-200/70",
};

const traceToneClasses: Record<CoverageTraceItem["tone"], string> = {
  neutral: "border-border bg-muted/25 text-foreground",
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warning: "border-orange-200 bg-orange-50 text-orange-800",
};

const traceSourceLabels: Record<CoverageTraceItem["source"], string> = {
  absence_requests: "Ausencias",
  change_request_events: "Solicitudes",
  change_requests: "Solicitudes",
  operational_audit_events: "Cambios",
};

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
  return value.slice(0, 5);
}

function formatTraceDate(value: string | null) {
  if (!value) {
    return "Impacto actual";
  }

  try {
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      month: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function formatTraceMeta(item: CoverageTraceItem) {
  const dateLabel = formatTraceDate(item.occurredAt);

  if (item.source === "operational_audit_events") {
    return dateLabel === "Impacto actual"
      ? "Cambio reciente"
      : `Actualizado el ${dateLabel}`;
  }

  return `${traceSourceLabels[item.source]} / ${dateLabel}`;
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
  return getSchedulePath({
    blockId,
    day: serviceDate,
    organizationId,
    view: "week",
    week: weekStart,
  });
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

function getTone(state: ScheduleCoverageState): Tone {
  if (state === "uncovered" || state === "conflict") {
    return "critical";
  }

  if (state === "insufficient") {
    return "warning";
  }

  if (state === "covered") {
    return "success";
  }

  return "neutral";
}

function getCoverageTone(coverage: ScheduleBlockCoverage): Tone {
  if (coverage.state === "uncovered" || coverage.state === "conflict") {
    return "critical";
  }

  if (
    coverage.state === "insufficient" ||
    coverage.absenceImpact.coverageNeededCount > 0 ||
    coverage.absenceImpact.potentialCount > 0
  ) {
    return "warning";
  }

  return getTone(coverage.state);
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

function StatusBadge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: Tone;
}) {
  return (
    <span
      className={cn(
        "inline-flex min-h-6 items-center rounded-full border px-2.5 text-xs font-medium",
        toneClasses[tone],
      )}
    >
      {children}
    </span>
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

function CoverageTraceList({
  loadError,
  traceItems,
}: {
  loadError?: boolean;
  traceItems: CoverageTraceItem[];
}) {
  if (!loadError && traceItems.length === 0) {
    return null;
  }

  return (
    <div
      className="space-y-2 rounded-lg border border-border/70 bg-muted/20 p-3"
      data-coverage-traceability="true"
    >
      <div className="flex items-center gap-2">
        <History aria-hidden="true" className="size-4 shrink-0" />
        <h4 className="text-sm font-medium">Cambios recientes</h4>
      </div>
      <p className="text-xs leading-5 text-muted-foreground">
        Ultimos movimientos relacionados con este bloque. No cambia el horario
        ni asigna cobertura por si solo.
      </p>
      {loadError ? (
        <p className="text-sm text-muted-foreground">
          No se pudo cargar la trazabilidad reciente.
        </p>
      ) : null}
      {traceItems.length > 0 ? (
        <ul className="grid gap-2">
          {traceItems.map((item) => (
            <li
              className={cn(
                "rounded-md border px-3 py-2 text-sm",
                traceToneClasses[item.tone],
              )}
              key={item.id}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{item.title}</span>
                <span className="text-xs opacity-80">
                  {formatTraceMeta(item)}
                </span>
              </div>
              <p className="mt-1 text-xs leading-5 opacity-90">{item.detail}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function CoverageAssignmentPanel({
  assignableCoaches,
  allAssignments,
  assignments,
  block,
  blocks,
  canManageSchedule,
  coachDisplaysById,
  coverage,
  coverageTraceLoadError,
  organizationId,
  returnPath,
  traceItems,
  weekStart,
}: {
  assignableCoaches: CoachDisplay[];
  allAssignments: AssignmentRow[];
  assignments: AssignmentRow[];
  block: ScheduleBlockRow;
  blocks: ScheduleBlockRow[];
  canManageSchedule: boolean;
  coachDisplaysById: Map<string, CoachDisplay>;
  coverage: ScheduleBlockCoverage;
  coverageTraceLoadError?: boolean;
  organizationId: string;
  returnPath: string;
  traceItems: CoverageTraceItem[];
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
  const unavailableCoachAssignments = getUnavailableScheduleCoachAssignments({
    assignments: allAssignments,
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
  const canAssign =
    canManageSchedule &&
    isCoverageActiveBlock(block.status) &&
    availableCoaches.length > 0;
  const conflictCoachNames = coverage.conflictCoachProfileIds.map(
    (coachProfileId) =>
      coachDisplaysById.get(coachProfileId)?.label ??
      `Entrenador ${shortId(coachProfileId)}`,
  );
  const absenceImpactLabel = getAbsenceImpactLabel(coverage);
  const absenceImpactMessage = getAbsenceImpactMessage(coverage);

  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <UserRound aria-hidden="true" className="size-4 shrink-0" />
          <h3 className="text-sm font-semibold">Asignaciones</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusBadge tone={getCoverageTone(coverage)}>
            {getScheduleCoverageStateLabel(coverage.state)}{" "}
            {coverage.validAssignmentCount}/{coverage.requiredCoaches}
          </StatusBadge>
          {absenceImpactLabel ? (
            <Badge variant="outline">{absenceImpactLabel}</Badge>
          ) : null}
        </div>
      </div>

      {coverage.state === "conflict" && conflictCoachNames.length > 0 ? (
        <p className="text-sm text-destructive">
          Solapamiento detectado: {conflictCoachNames.join(", ")}.
        </p>
      ) : null}

      {absenceImpactMessage ? (
        <p className="text-sm text-orange-700">{absenceImpactMessage}</p>
      ) : null}

      {canManageSchedule ? (
        <CoverageTraceList
          loadError={coverageTraceLoadError}
          traceItems={traceItems}
        />
      ) : null}

      {activeAssignments.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No hay entrenadores asignados que cuenten para este bloque.
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

                <div className="flex flex-wrap gap-2">
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

      {canManageSchedule && unavailableCoachSummaries.length > 0 ? (
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

export function CoverageBlockDetailPanels({
  assignableCoaches,
  assignments,
  basePath,
  blocks,
  canManageSchedule,
  centers,
  classTypes,
  coachDisplays,
  coverageByBlock,
  coverageTraceByBlock,
  coverageTraceLoadError,
  initialSelectedBlockId,
  organizationId,
  weekStart,
}: CoverageBlockDetailPanelsProps) {
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
  const coverageTraceByBlockId = React.useMemo(
    () => new Map(coverageTraceByBlock),
    [coverageTraceByBlock],
  );
  const coachDisplaysById = React.useMemo(
    () => new Map(coachDisplays.map((coach) => [coach.id, coach])),
    [coachDisplays],
  );

  usePanelRouteLifecycle({
    closeHref: basePath,
    isOpen: Boolean(selectedBlock),
  });

  if (!selectedBlock) {
    return null;
  }

  const coverage = coverageByBlockId.get(selectedBlock.id);
  const classType = classTypesById.get(selectedBlock.class_type_id);
  const center = centersById.get(selectedBlock.center_id);
  const returnPath = getCoverageBlockHref({
    basePath,
    blockId: selectedBlock.id,
  });

  if (!coverage) {
    return null;
  }

  const absenceImpactLabel = getAbsenceImpactLabel(coverage);

  return (
    <aside className="fixed inset-0 z-50" data-operational-detail-panel="coverage-block">
      <RouteStateButton
        aria-label="Cerrar detalle"
        className="absolute inset-0 z-0 block cursor-default bg-foreground/20 p-0 backdrop-blur-sm"
        href={basePath}
      />
      <div className="relative z-10 ml-auto flex h-full w-full max-w-2xl flex-col overflow-y-auto bg-background shadow-xl ring-1 ring-border">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border bg-background/95 px-4 py-4 backdrop-blur">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={getCoverageTone(coverage)}>
                {getScheduleCoverageStateLabel(coverage.state)}{" "}
                {coverage.validAssignmentCount}/{coverage.requiredCoaches}
              </StatusBadge>
              {absenceImpactLabel ? (
                <Badge variant="outline">{absenceImpactLabel}</Badge>
              ) : null}
              {selectedBlock.is_template_exception ? (
                <Badge variant="outline">Cambiado</Badge>
              ) : null}
            </div>
            <h2 className="truncate text-lg font-semibold tracking-tight">
              {classType?.name ?? "Actividad"}
            </h2>
            <p className="truncate text-sm text-muted-foreground">
              {formatServiceDate(selectedBlock.service_date)} /{" "}
              {formatTime(selectedBlock.start_time)}-
              {formatTime(selectedBlock.end_time)}
            </p>
          </div>
          <Button asChild size="icon" variant="ghost">
            <RouteStateButton aria-label="Cerrar detalle" href={basePath}>
              <X aria-hidden="true" />
            </RouteStateButton>
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
                entrenadores
              </p>
            </div>
          </div>

          <CoverageAssignmentPanel
            assignableCoaches={assignableCoaches}
            allAssignments={assignments}
            assignments={assignmentsByBlockId.get(selectedBlock.id) ?? []}
            block={selectedBlock}
            blocks={blocks}
            canManageSchedule={canManageSchedule}
            coachDisplaysById={coachDisplaysById}
            coverage={coverage}
            coverageTraceLoadError={coverageTraceLoadError}
            organizationId={organizationId}
            returnPath={returnPath}
            traceItems={coverageTraceByBlockId.get(selectedBlock.id) ?? []}
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
