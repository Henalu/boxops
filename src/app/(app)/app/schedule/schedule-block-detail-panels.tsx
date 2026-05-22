"use client";

import Link from "next/link";
import * as React from "react";
import {
  ArrowRight,
  AlertTriangle,
  BriefcaseBusiness,
  CheckCircle2,
  CircleOff,
  Download,
  Eye,
  FileText,
  History,
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
import { StaffWorkWindowsHiddenInput } from "./staff-work-windows-visibility";
import {
  pushRouteStateHref,
  RouteStateButton,
  useRouteQueryParam,
} from "@/components/features/route-state-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  formatTimeForInput,
  getUnavailableScheduleCoachAssignments,
  getScheduleAssignmentStatusLabel,
  getScheduleBlockStatusLabel,
  getScheduleCoverageStateLabel,
  isCoverageActiveBlock,
  type ScheduleBlockCoverage,
  type ScheduleCoachUnavailableAssignment,
  type ScheduleCoverageState,
} from "@/lib/schedule-blocks";
import { getRequestsPath } from "@/lib/navigation/app-paths";
import { cn } from "@/lib/utils";
import type { StaffWorkWindowOccurrence } from "@/lib/staff-work-windows";
import type { CoverageTraceItem } from "@/lib/coverage-traceability";
import type { DocumentProgrammingEntry } from "@/lib/document-programming";
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
  personProfileId: string | null;
};

type ScheduleFilters = {
  centerId: string | null;
  classTypeId: string | null;
  coachProfileId: string | null;
  coverageState: string | null;
  mineOnly: boolean;
  risksOnly: boolean;
  showWorkWindows: boolean;
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
  coverageTraceByBlock: Array<[string, CoverageTraceItem[]]>;
  coverageTraceLoadError?: boolean;
  documentProgrammingByBlock: Array<[string, DocumentProgrammingEntry[]]>;
  documentProgrammingLoadError?: boolean;
  filters: ScheduleFilters;
  initialSelectedBlockId: string | null;
  organizationId: string;
  staffWorkWindows: StaffWorkWindowOccurrence[];
  view: ScheduleView;
  weekEnd: string;
  weekStart: string;
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
  operational_audit_events: "Auditoria",
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

function formatDocumentDate(value: string) {
  try {
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "short",
      timeZone: "UTC",
      year: "numeric",
    }).format(new Date(value.includes("T") ? value : `${value}T12:00:00.000Z`));
  } catch {
    return value;
  }
}

function formatProgrammingRange(entry: DocumentProgrammingEntry) {
  if (entry.starts_on === entry.ends_on) {
    return `Vigente el ${formatDocumentDate(entry.starts_on)}`;
  }

  return `Vigente ${formatDocumentDate(entry.starts_on)} - ${formatDocumentDate(
    entry.ends_on,
  )}`;
}

function timeToMinutes(value: string) {
  const [hours, minutes] = value.slice(0, 5).split(":").map(Number);

  return hours * 60 + minutes;
}

function timeRangesOverlap(
  firstStart: string,
  firstEnd: string,
  secondStart: string,
  secondEnd: string,
) {
  return (
    timeToMinutes(firstStart) < timeToMinutes(secondEnd) &&
    timeToMinutes(secondStart) < timeToMinutes(firstEnd)
  );
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

function getDocumentVersionRouteHref({
  documentId,
  documentVersionId,
  mode,
  organizationId,
}: {
  documentId: string;
  documentVersionId: string;
  mode: "download" | "preview";
  organizationId: string;
}) {
  const params = new URLSearchParams({ organizationId });

  return `/app/documents/${documentId}/versions/${documentVersionId}/${mode}?${params.toString()}`;
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
  if (status === "scheduled") {
    return null;
  }

  return (
    <Badge
      variant={status === "cancelled" ? "destructive" : "outline"}
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
      <input name="status" type="hidden" value={block?.status ?? "scheduled"} />

      <label className="grid min-w-0 gap-2 sm:col-span-2">
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

      <label className="grid min-w-0 gap-2 sm:col-span-2">
        <span className="text-sm font-medium">Inicio</span>
        <Input
          defaultValue={block ? formatTimeForInput(block.start_time) : ""}
          disabled={disabled}
          name="startTime"
          required
          type="time"
        />
      </label>

      <label className="grid min-w-0 gap-2 sm:col-span-2">
        <span className="text-sm font-medium">Fin</span>
        <Input
          defaultValue={block ? formatTimeForInput(block.end_time) : ""}
          disabled={disabled}
          name="endTime"
          required
          type="time"
        />
      </label>

      <label className="grid min-w-0 gap-2 sm:col-span-3">
        <span className="text-sm font-medium">Centro</span>
        <CenterSelect
          centers={centers}
          defaultValue={block?.center_id}
          disabled={disabled}
        />
      </label>

      <label className="grid min-w-0 gap-2 sm:col-span-3">
        <span className="text-sm font-medium">Tipo de actividad</span>
        <ClassTypeSelect
          classTypes={classTypes}
          defaultValue={block?.class_type_id}
          disabled={disabled}
        />
      </label>

      <label className="grid min-w-0 gap-2 sm:col-span-2">
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

      <label className="grid min-w-0 gap-2 sm:col-span-4">
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
      <StaffWorkWindowsHiddenInput initialVisible={filters.showWorkWindows} />
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

function DocumentProgrammingPanel({
  entries,
  loadError,
  organizationId,
}: {
  entries: DocumentProgrammingEntry[];
  loadError?: boolean;
  organizationId: string;
}) {
  return (
    <div
      className="space-y-3 rounded-lg border border-border/70 bg-muted/10 p-3"
      data-document-programming-surface="schedule-block"
    >
      <div className="flex min-w-0 items-center gap-2">
        <FileText aria-hidden="true" className="size-4 shrink-0" />
        <h4 className="text-sm font-medium">Programacion autorizada</h4>
      </div>
      <p className="text-xs leading-5 text-muted-foreground">
        Fuente documental versionada para preparar este bloque. El horario no
        copia contenido documental.
      </p>

      {loadError ? (
        <p className="text-sm text-muted-foreground">
          No se pudo consultar la programacion autorizada para este bloque.
        </p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No hay programacion disponible para tu permiso en este bloque.
        </p>
      ) : (
        <ul className="grid gap-2">
          {entries.map((entry) => {
            const previewHref = getDocumentVersionRouteHref({
              documentId: entry.document_id,
              documentVersionId: entry.document_version_id,
              mode: "preview",
              organizationId,
            });
            const downloadHref = getDocumentVersionRouteHref({
              documentId: entry.document_id,
              documentVersionId: entry.document_version_id,
              mode: "download",
              organizationId,
            });

            return (
              <li
                className="rounded-md border border-border/70 bg-background/70 px-3 py-2"
                key={entry.programming_link_id}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <p className="truncate text-sm font-medium">
                      {entry.document_title}
                    </p>
                    <p className="break-words text-xs text-muted-foreground">
                      Fuente: {entry.original_filename || entry.document_type}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Version {entry.version_number} /{" "}
                      {formatDocumentDate(entry.updated_at)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatProgrammingRange(entry)}
                    </p>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {entry.can_preview ? (
                        <Badge variant="secondary">Preview disponible</Badge>
                      ) : null}
                      {entry.can_download ? (
                        <Badge variant="outline">Descarga disponible</Badge>
                      ) : null}
                      {!entry.can_preview && !entry.can_download ? (
                        <Badge variant="outline">Solo metadata</Badge>
                      ) : null}
                    </div>
                  </div>

                  {entry.can_preview || entry.can_download ? (
                    <div className="flex shrink-0 flex-wrap gap-2">
                      {entry.can_preview ? (
                        <Button asChild size="sm" variant="outline">
                          <a
                            href={previewHref}
                            rel="noopener noreferrer"
                            target="_blank"
                          >
                            <Eye aria-hidden="true" />
                            Preview
                          </a>
                        </Button>
                      ) : null}
                      {entry.can_download ? (
                        <Button asChild size="sm" variant="outline">
                          <a href={downloadHref}>
                            <Download aria-hidden="true" />
                            Descargar
                          </a>
                        </Button>
                      ) : null}
                    </div>
                  ) : (
                    <p className="text-xs leading-5 text-muted-foreground sm:max-w-36">
                      Tu permiso no habilita preview ni descarga.
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
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
        <h4 className="text-sm font-medium">Trazabilidad operativa</h4>
      </div>
      <p className="text-xs leading-5 text-muted-foreground">
        Lectura reciente de cambios, solicitudes y ausencias. No modifica
        horario ni resuelve cobertura.
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
                  {traceSourceLabels[item.source]} /{" "}
                  {formatTraceDate(item.occurredAt)}
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

function getStaffWorkWindowsForBlock({
  block,
  staffWorkWindows,
}: {
  block: ScheduleBlockRow;
  staffWorkWindows: StaffWorkWindowOccurrence[];
}) {
  return staffWorkWindows.filter(
    (window) =>
      window.status === "active" &&
      window.serviceDate === block.service_date &&
      (!window.center_id || window.center_id === block.center_id) &&
      timeRangesOverlap(
        window.start_time,
        window.end_time,
        block.start_time,
        block.end_time,
      ),
  );
}

function StaffWorkWindowContext({
  activeAssignments,
  block,
  coachDisplaysById,
  staffWorkWindows,
}: {
  activeAssignments: ScheduleBlockAssignmentRow[];
  block: ScheduleBlockRow;
  coachDisplaysById: Map<string, CoachDisplay>;
  staffWorkWindows: StaffWorkWindowOccurrence[];
}) {
  const expectedWindows = getStaffWorkWindowsForBlock({
    block,
    staffWorkWindows,
  });
  const expectedPeopleById = new Map(
    expectedWindows.map((window) => [window.person_profile_id, window]),
  );
  const assignedOutsideWorkWindow = activeAssignments.flatMap((assignment) => {
    const coachDisplay = coachDisplaysById.get(assignment.coach_profile_id);
    const personProfileId = coachDisplay?.personProfileId;

    if (!personProfileId) {
      return [];
    }

    const hasAnyWindow = staffWorkWindows.some(
      (window) => window.person_profile_id === personProfileId,
    );

    if (!hasAnyWindow || expectedPeopleById.has(personProfileId)) {
      return [];
    }

    return [coachDisplay?.label ?? `Entrenador ${shortId(assignment.coach_profile_id)}`];
  });
  const uniqueExpectedWindows = [
    ...new Map(
      expectedWindows.map((window) => [window.person_profile_id, window]),
    ).values(),
  ];

  return (
    <div className="rounded-md bg-muted/30 px-3 py-2 text-sm">
      <div className="flex items-center gap-2 font-medium">
        <BriefcaseBusiness aria-hidden="true" className="size-4 shrink-0" />
        <span>Jornada prevista</span>
      </div>
      {uniqueExpectedWindows.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <span className="text-muted-foreground">
            Personal previsto en esta franja:
          </span>
          {uniqueExpectedWindows.map((window) => (
            <span
              className="rounded-full border border-border bg-background/70 px-2 py-0.5 text-xs font-medium"
              key={`${window.id}-${window.serviceDate}`}
            >
              {window.personDisplayName}
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-muted-foreground">
          Nadie previsto en esta franja.
        </p>
      )}
      {assignedOutsideWorkWindow.length > 0 ? (
        <p className="mt-2 text-amber-700">
          Asignado fuera de jornada prevista:{" "}
          {[...new Set(assignedOutsideWorkWindow)].join(", ")}. Aviso
          informativo, sin bloqueo.
        </p>
      ) : null}
    </div>
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
  coverageTraceLoadError,
  filters,
  organizationId,
  returnPath,
  staffWorkWindows,
  traceItems,
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
  coverageTraceLoadError?: boolean;
  filters?: ScheduleFilters;
  organizationId?: string;
  returnPath?: string;
  staffWorkWindows: StaffWorkWindowOccurrence[];
  traceItems?: CoverageTraceItem[];
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
    <div className="space-y-3 rounded-lg border border-border/70 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <UserRound aria-hidden="true" className="size-4 shrink-0" />
          <h4 className="text-sm font-medium">Asignaciones</h4>
        </div>
      </div>

      {coverage.state === "conflict" && conflictCoachNames.length > 0 ? (
        <p className="text-sm text-destructive">
          Solapamiento detectado: {conflictCoachNames.join(", ")}.
        </p>
      ) : null}

      {absenceImpactMessage ? (
        <p className="text-sm text-amber-700">{absenceImpactMessage}</p>
      ) : null}

      {canManageSchedule ? (
        <CoverageTraceList
          loadError={coverageTraceLoadError}
          traceItems={traceItems ?? []}
        />
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

      <StaffWorkWindowContext
        activeAssignments={activeAssignments}
        block={block}
        coachDisplaysById={coachDisplaysById}
        staffWorkWindows={staffWorkWindows}
      />

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
  documentProgrammingEntries,
  documentProgrammingLoadError,
  organizationId,
  staffWorkWindows,
}: {
  assignableCoaches: CoachDisplay[];
  assignments: ScheduleBlockAssignmentRow[];
  block: ScheduleBlockRow;
  center?: CenterRow;
  classType?: ClassTypeRow;
  coachDisplaysById: Map<string, CoachDisplay>;
  coverage: ScheduleBlockCoverage;
  documentProgrammingEntries: DocumentProgrammingEntry[];
  documentProgrammingLoadError?: boolean;
  organizationId: string;
  staffWorkWindows: StaffWorkWindowOccurrence[];
}) {
  return (
    <Card className="border-0 bg-transparent shadow-none ring-0">
      <CardContent className="space-y-4 pt-0">
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
        <DocumentProgrammingPanel
          entries={documentProgrammingEntries}
          loadError={documentProgrammingLoadError}
          organizationId={organizationId}
        />
        <ScheduleAssignmentPanel
          assignableCoaches={assignableCoaches}
          assignments={assignments}
          block={block}
          canManageSchedule={false}
          coachDisplaysById={coachDisplaysById}
          coverage={coverage}
          organizationId={organizationId}
          staffWorkWindows={staffWorkWindows}
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
  centers,
  classTypes,
  coachDisplaysById,
  coverage,
  coverageTraceLoadError,
  documentProgrammingEntries,
  documentProgrammingLoadError,
  filters,
  organizationId,
  returnPath,
  staffWorkWindows,
  traceItems,
  view,
  weekEnd,
  weekStart,
}: {
  assignableCoaches: CoachDisplay[];
  allAssignments: ScheduleBlockAssignmentRow[];
  assignments: ScheduleBlockAssignmentRow[];
  block: ScheduleBlockRow;
  blocks: ScheduleBlockRow[];
  centers: CenterRow[];
  classTypes: ClassTypeRow[];
  coachDisplaysById: Map<string, CoachDisplay>;
  coverage: ScheduleBlockCoverage;
  coverageTraceLoadError?: boolean;
  documentProgrammingEntries: DocumentProgrammingEntry[];
  documentProgrammingLoadError?: boolean;
  filters: ScheduleFilters;
  organizationId: string;
  returnPath: string;
  staffWorkWindows: StaffWorkWindowOccurrence[];
  traceItems: CoverageTraceItem[];
  view: ScheduleView;
  weekEnd: string;
  weekStart: string;
}) {
  return (
    <Card className="border-0 bg-transparent shadow-none ring-0">
      <CardContent className="space-y-5 pt-0">
        <form
          action={updateScheduleBlock}
          className="grid gap-4 sm:grid-cols-6"
        >
          <input name="organizationId" type="hidden" value={organizationId} />
          <input name="weekStart" type="hidden" value={weekStart} />
          <input name="returnPath" type="hidden" value={returnPath} />
          <ScheduleFilterHiddenInputs filters={filters} view={view} />
          <input name="scheduleBlockId" type="hidden" value={block.id} />
          <div className="min-w-0 sm:col-span-6">
            <h3 className="text-sm font-semibold">Editar bloque</h3>
          </div>
          <ScheduleBlockFields
            block={block}
            centers={centers}
            classTypes={classTypes}
            weekEnd={weekEnd}
            weekStart={weekStart}
          />
          <div className="flex flex-wrap gap-2 sm:col-span-6">
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

        <DocumentProgrammingPanel
          entries={documentProgrammingEntries}
          loadError={documentProgrammingLoadError}
          organizationId={organizationId}
        />

        <ScheduleAssignmentPanel
          assignableCoaches={assignableCoaches}
          allAssignments={allAssignments}
          assignments={assignments}
          block={block}
          blocks={blocks}
          canManageSchedule={true}
          coachDisplaysById={coachDisplaysById}
          coverage={coverage}
          coverageTraceLoadError={coverageTraceLoadError}
          filters={filters}
          organizationId={organizationId}
          returnPath={returnPath}
          staffWorkWindows={staffWorkWindows}
          traceItems={traceItems}
          view={view}
          weekStart={weekStart}
        />
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
  coverageTraceByBlock,
  coverageTraceLoadError,
  documentProgrammingByBlock,
  documentProgrammingLoadError,
  filters,
  initialSelectedBlockId,
  organizationId,
  staffWorkWindows,
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
  const coverageTraceByBlockId = React.useMemo(
    () => new Map(coverageTraceByBlock),
    [coverageTraceByBlock],
  );
  const documentProgrammingByBlockId = React.useMemo(
    () => new Map(documentProgrammingByBlock),
    [documentProgrammingByBlock],
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
      <div className="relative z-10 ml-auto flex h-full w-full max-w-3xl flex-col overflow-y-auto bg-background shadow-xl ring-1 ring-border">
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
              centers={centers}
              classTypes={classTypes}
              coachDisplaysById={coachDisplaysById}
              coverage={coverage}
              coverageTraceLoadError={coverageTraceLoadError}
              documentProgrammingEntries={
                documentProgrammingByBlockId.get(selectedBlock.id) ?? []
              }
              documentProgrammingLoadError={documentProgrammingLoadError}
              filters={filters}
              organizationId={organizationId}
              returnPath={returnPath}
              staffWorkWindows={staffWorkWindows}
              traceItems={coverageTraceByBlockId.get(selectedBlock.id) ?? []}
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
              documentProgrammingEntries={
                documentProgrammingByBlockId.get(selectedBlock.id) ?? []
              }
              documentProgrammingLoadError={documentProgrammingLoadError}
              organizationId={organizationId}
              staffWorkWindows={staffWorkWindows}
            />
          )}
        </div>
      </div>
    </aside>
  );
}
