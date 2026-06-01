"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import {
  BriefcaseBusiness,
  CalendarClock,
  ChevronLeft,
  Gift,
  Plus,
  X,
} from "lucide-react";

import { createScheduleBlock } from "./actions";
import { createOperationalEventFromForm } from "./operational-event-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

type CenterOption = {
  id: string;
  name: string;
  status: string;
};

type ClassTypeOption = {
  id: string;
  name: string;
  required_coaches: number;
  status: string;
};

type ScheduleSlotFilters = {
  centerId: string | null;
  classTypeId: string | null;
  coachProfileId: string | null;
  coverageState: string | null;
  mineOnly: boolean;
  risksOnly: boolean;
  showWorkWindows: boolean;
};

type CreationMode = "event" | "holiday" | "work";
type ScheduleSlotTriggerVariant = "button" | "slot";

type ScheduleSlotCreateDialogProps = {
  activeCenters: CenterOption[];
  activeClassTypes: ClassTypeOption[];
  canCreateEvents: boolean;
  canCreateScheduleBlocks: boolean;
  className?: string;
  dialogTitle?: string;
  defaultEndTime: string;
  defaultStartTime: string;
  filters: ScheduleSlotFilters;
  organizationId: string;
  returnPath: string;
  serviceDate: string;
  tooltipLabel?: string;
  triggerLabel?: string;
  triggerVariant?: ScheduleSlotTriggerVariant;
  view: string;
  weekStart: string;
};

const eventTypeLabels = {
  closure: "Cierre",
  community_event: "Comunidad",
  competition: "Competicion",
  external_event: "Evento externo",
  internal_event: "Evento interno",
  maintenance: "Mantenimiento",
  open_day: "Jornada abierta",
  seminar: "Seminario",
} as const;

const eventTypeOptions = [
  "internal_event",
  "external_event",
  "competition",
  "seminar",
  "open_day",
  "maintenance",
  "community_event",
  "closure",
] as const;

const impactOptions = [
  ["context_only", "Solo contexto"],
  ["schedule_review_needed", "Revisar horario"],
  ["coverage_review_needed", "Revisar cobertura"],
  ["staffing_needed", "Necesita personal"],
] as const;

const visibilityOptions = [
  ["staff", "Staff"],
  ["all_staff", "Todo el staff"],
  ["management", "Gestion"],
] as const;

function selectClassName(className = "") {
  return cn(
    "h-11 w-full min-w-0 truncate rounded-md border border-input bg-transparent py-1 pl-3 pr-9 text-sm md:h-9",
    "outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
    "disabled:cursor-not-allowed disabled:opacity-50",
    className,
  );
}

function formatSlotLabel(serviceDate: string, startTime: string, endTime: string) {
  return `${serviceDate} · ${startTime}-${endTime}`;
}

function ScheduleRedirectHiddenInputs({
  filters,
  view,
}: {
  filters: ScheduleSlotFilters;
  view: string;
}) {
  return (
    <>
      <input name="view" type="hidden" value={view} />
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
      <input
        name="work_windows"
        type="hidden"
        value={filters.showWorkWindows ? "1" : "0"}
      />
    </>
  );
}

function DialogHiddenInputs({
  filters,
  organizationId,
  returnPath,
  serviceDate,
  view,
  weekStart,
}: {
  filters: ScheduleSlotFilters;
  organizationId: string;
  returnPath: string;
  serviceDate: string;
  view: string;
  weekStart: string;
}) {
  return (
    <>
      <input name="organizationId" type="hidden" value={organizationId} />
      <input name="weekStart" type="hidden" value={weekStart} />
      <input name="returnPath" type="hidden" value={returnPath} />
      <input name="day" type="hidden" value={serviceDate} />
      <ScheduleRedirectHiddenInputs filters={filters} view={view} />
    </>
  );
}

export function ScheduleSlotCreateDialog({
  activeCenters,
  activeClassTypes,
  canCreateEvents,
  canCreateScheduleBlocks,
  className,
  dialogTitle,
  defaultEndTime,
  defaultStartTime,
  filters,
  organizationId,
  returnPath,
  serviceDate,
  tooltipLabel,
  triggerLabel,
  triggerVariant = "slot",
  view,
  weekStart,
}: ScheduleSlotCreateDialogProps) {
  const [mode, setMode] = React.useState<CreationMode | null>(null);
  const [open, setOpen] = React.useState(false);
  const [tooltipVisible, setTooltipVisible] = React.useState(false);
  const [tooltipPosition, setTooltipPosition] = React.useState({
    x: 0,
    y: 0,
  });
  const titleId = React.useId();
  const panelRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const tooltipTimerRef = React.useRef<number | null>(null);
  const canCreateWork =
    canCreateScheduleBlocks &&
    activeCenters.length > 0 &&
    activeClassTypes.length > 0;
  const canCreateAny = canCreateEvents || canCreateWork;
  const defaultCenterId =
    filters.centerId &&
    activeCenters.some((center) => center.id === filters.centerId)
      ? filters.centerId
      : activeCenters[0]?.id;
  const portalRoot =
    typeof document === "undefined" ? null : document.body;
  const formattedSlotLabel = formatSlotLabel(
    serviceDate,
    defaultStartTime,
    defaultEndTime,
  );
  const effectiveDialogTitle =
    dialogTitle ??
    (triggerVariant === "button"
      ? "Crear desde horario"
      : "Crear en franja libre");
  const effectiveTooltipLabel =
    tooltipLabel ??
    (triggerVariant === "button"
      ? "Crear bloque, evento o festivo"
      : "Haz doble clic para crear un bloque nuevo");
  const effectiveTriggerLabel =
    triggerLabel ??
    (triggerVariant === "button"
      ? "Crear bloque, evento o festivo"
      : `Crear desde franja libre ${formattedSlotLabel}`);

  const clearTooltipTimer = React.useCallback(() => {
    if (tooltipTimerRef.current !== null) {
      window.clearTimeout(tooltipTimerRef.current);
      tooltipTimerRef.current = null;
    }
  }, []);

  const closeDialog = React.useCallback(() => {
    setOpen(false);
    setMode(null);
    window.requestAnimationFrame(() => {
      triggerRef.current?.focus();
    });
  }, []);

  const scheduleTooltip = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      clearTooltipTimer();
      setTooltipVisible(false);
      setTooltipPosition({ x: event.clientX, y: event.clientY });
      tooltipTimerRef.current = window.setTimeout(() => {
        setTooltipVisible(true);
      }, 650);
    },
    [clearTooltipTimer],
  );

  React.useEffect(() => {
    return clearTooltipTimer;
  }, [clearTooltipTimer]);

  React.useEffect(() => {
    if (!open) {
      return;
    }

    const panel = panelRef.current;
    panel?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDialog();
        return;
      }

      if (event.key !== "Tab" || !panel) {
        return;
      }

      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((element) => !element.hasAttribute("disabled"));

      if (focusable.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const firstElement = focusable[0];
      const lastElement = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeDialog, open]);

  function openDialog() {
    if (!canCreateAny) {
      return;
    }

    clearTooltipTimer();
    setTooltipVisible(false);
    setMode(null);
    setOpen(true);
  }

  return (
    <>
      {triggerVariant === "button" ? (
        <Button
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label={effectiveTriggerLabel}
          className={cn("cursor-pointer", className)}
          disabled={!canCreateAny}
          onClick={openDialog}
          onMouseEnter={scheduleTooltip}
          onMouseLeave={() => {
            clearTooltipTimer();
            setTooltipVisible(false);
          }}
          onMouseMove={scheduleTooltip}
          ref={triggerRef}
          size="icon"
          type="button"
          variant="outline"
        >
          <Plus aria-hidden="true" />
        </Button>
      ) : (
        <button
          aria-label={effectiveTriggerLabel}
          className={cn(
            "h-full min-h-20 w-full cursor-pointer rounded-md border border-dashed border-border/70 bg-background/20 text-left transition-colors",
            "hover:border-primary/45 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
            !canCreateAny &&
              "cursor-default opacity-70 hover:border-border/70 hover:bg-background/20",
            className,
          )}
          disabled={!canCreateAny}
          onDoubleClick={openDialog}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              openDialog();
            }
          }}
          onMouseEnter={scheduleTooltip}
          onMouseLeave={() => {
            clearTooltipTimer();
            setTooltipVisible(false);
          }}
          onMouseMove={scheduleTooltip}
          ref={triggerRef}
          type="button"
        >
          <span className="sr-only">{effectiveTooltipLabel}</span>
        </button>
      )}

      {tooltipVisible && !open ? (
        <div
          className="pointer-events-none fixed z-50 rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs font-medium text-popover-foreground shadow-sm"
          style={{
            left: tooltipPosition.x + 14,
            top: tooltipPosition.y + 14,
          }}
        >
          {effectiveTooltipLabel}
        </div>
      ) : null}

      {open && portalRoot ? createPortal((
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 px-3 py-6 backdrop-blur-sm sm:p-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeDialog();
            }
          }}
        >
          <div
            aria-labelledby={titleId}
            aria-modal="true"
            className="max-h-[calc(100dvh-3rem)] w-full max-w-4xl overflow-y-auto rounded-xl border border-border bg-background shadow-lg outline-none"
            ref={panelRef}
            role="dialog"
            tabIndex={-1}
          >
            <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
              <div className="min-w-0">
                <h3
                  className="text-base font-semibold tracking-tight"
                  id={titleId}
                >
                  {effectiveDialogTitle}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {formattedSlotLabel}
                </p>
              </div>
              <Button
                aria-label="Cerrar"
                onClick={closeDialog}
                size="icon"
                type="button"
                variant="ghost"
              >
                <X aria-hidden="true" />
              </Button>
            </div>

            <div className="space-y-4 px-4 py-4">
              {!mode ? (
                <div className="grid gap-3 sm:grid-cols-3">
                  <button
                    className="flex min-h-28 flex-col items-start gap-2 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!canCreateWork}
                    onClick={() => setMode("work")}
                    type="button"
                  >
                    <BriefcaseBusiness aria-hidden="true" className="size-4" />
                    <span className="font-medium">Bloque de trabajo</span>
                    <span className="text-sm text-muted-foreground">
                      Clase, open box u otra actividad con cobertura.
                    </span>
                  </button>
                  <button
                    className="flex min-h-28 flex-col items-start gap-2 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!canCreateEvents}
                    onClick={() => setMode("event")}
                    type="button"
                  >
                    <CalendarClock aria-hidden="true" className="size-4" />
                    <span className="font-medium">Evento</span>
                    <span className="text-sm text-muted-foreground">
                      Contexto operativo sin crear cobertura de clase.
                    </span>
                  </button>
                  <button
                    className="flex min-h-28 flex-col items-start gap-2 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!canCreateEvents}
                    onClick={() => setMode("holiday")}
                    type="button"
                  >
                    <Gift aria-hidden="true" className="size-4" />
                    <span className="font-medium">Festivo</span>
                    <span className="text-sm text-muted-foreground">
                      Cierre o día especial visible como contexto.
                    </span>
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <Button
                    onClick={() => setMode(null)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <ChevronLeft aria-hidden="true" />
                    Cambiar tipo
                  </Button>

                  {mode === "work" ? (
                    <form
                      action={createScheduleBlock}
                      className="grid gap-4 sm:grid-cols-6"
                    >
                      <DialogHiddenInputs
                        filters={filters}
                        organizationId={organizationId}
                        returnPath={returnPath}
                        serviceDate={serviceDate}
                        view={view}
                        weekStart={weekStart}
                      />
                      <input name="status" type="hidden" value="scheduled" />

                      <label className="grid min-w-0 gap-2 sm:col-span-2">
                        <span className="text-sm font-medium">Fecha</span>
                        <Input
                          defaultValue={serviceDate}
                          name="serviceDate"
                          required
                          type="date"
                        />
                      </label>
                      <label className="grid min-w-0 gap-2 sm:col-span-2">
                        <span className="text-sm font-medium">Inicio</span>
                        <Input
                          defaultValue={defaultStartTime}
                          name="startTime"
                          required
                          type="time"
                        />
                      </label>
                      <label className="grid min-w-0 gap-2 sm:col-span-2">
                        <span className="text-sm font-medium">Fin</span>
                        <Input
                          defaultValue={defaultEndTime}
                          name="endTime"
                          required
                          type="time"
                        />
                      </label>
                      <label className="grid min-w-0 gap-2 sm:col-span-3">
                        <span className="text-sm font-medium">Centro</span>
                        <select
                          className={selectClassName()}
                          defaultValue={defaultCenterId}
                          name="centerId"
                          required
                        >
                          {activeCenters.map((center) => (
                            <option key={center.id} value={center.id}>
                              {center.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="grid min-w-0 gap-2 sm:col-span-3">
                        <span className="text-sm font-medium">
                          Tipo de actividad
                        </span>
                        <select
                          className={selectClassName()}
                          name="classTypeId"
                          required
                        >
                          {activeClassTypes.map((classType) => (
                            <option key={classType.id} value={classType.id}>
                              {classType.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="grid min-w-0 gap-2 sm:col-span-2">
                        <span className="text-sm font-medium">
                          Entrenadores necesarios
                        </span>
                        <Input
                          defaultValue={
                            activeClassTypes[0]?.required_coaches ?? 1
                          }
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
                          maxLength={1000}
                          name="notes"
                          placeholder="Contexto operativo del bloque"
                        />
                      </label>
                      <div className="flex items-end sm:col-span-6">
                        <Button type="submit">
                          <Plus aria-hidden="true" />
                          Crear bloque
                        </Button>
                      </div>
                    </form>
                  ) : (
                    <form
                      action={createOperationalEventFromForm}
                      className="grid gap-3 md:grid-cols-4"
                    >
                      <DialogHiddenInputs
                        filters={filters}
                        organizationId={organizationId}
                        returnPath={returnPath}
                        serviceDate={serviceDate}
                        view={view}
                        weekStart={weekStart}
                      />
                      <label className="grid min-w-0 gap-2 md:col-span-2">
                        <span className="text-sm font-medium">Titulo</span>
                        <Input
                          maxLength={120}
                          name="title"
                          placeholder={
                            mode === "holiday"
                              ? "Festivo o cierre"
                              : "Evento operativo"
                          }
                          required
                        />
                      </label>
                      {mode === "holiday" ? (
                        <input name="eventType" type="hidden" value="holiday" />
                      ) : (
                        <label className="grid min-w-0 gap-2">
                          <span className="text-sm font-medium">Tipo</span>
                          <select
                            className={selectClassName()}
                            defaultValue="internal_event"
                            name="eventType"
                            required
                          >
                            {eventTypeOptions.map((type) => (
                              <option key={type} value={type}>
                                {eventTypeLabels[type]}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      <label className="grid min-w-0 gap-2">
                        <span className="text-sm font-medium">Centro</span>
                        <select
                          className={selectClassName()}
                          defaultValue={defaultCenterId ?? ""}
                          name="centerId"
                        >
                          <option value="">Toda la organización</option>
                          {activeCenters.map((center) => (
                            <option key={center.id} value={center.id}>
                              {center.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="grid min-w-0 gap-2">
                        <span className="text-sm font-medium">Fecha</span>
                        <Input
                          defaultValue={serviceDate}
                          name="startsOn"
                          required
                          type="date"
                        />
                      </label>
                      <label className="grid min-w-0 gap-2">
                        <span className="text-sm font-medium">Hora inicio</span>
                        <Input
                          defaultValue={defaultStartTime}
                          name="startsAtTime"
                          type="time"
                        />
                      </label>
                      <label className="grid min-w-0 gap-2">
                        <span className="text-sm font-medium">Fin</span>
                        <Input
                          defaultValue={serviceDate}
                          name="endsOn"
                          type="date"
                        />
                      </label>
                      <label className="grid min-w-0 gap-2">
                        <span className="text-sm font-medium">Hora fin</span>
                        <Input
                          defaultValue={defaultEndTime}
                          name="endsAtTime"
                          type="time"
                        />
                      </label>
                      <label className="grid min-w-0 gap-2">
                        <span className="text-sm font-medium">Visibilidad</span>
                        <select
                          className={selectClassName()}
                          defaultValue="staff"
                          name="visibility"
                          required
                        >
                          {visibilityOptions.map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="grid min-w-0 gap-2">
                        <span className="text-sm font-medium">Impacto</span>
                        <select
                          className={selectClassName()}
                          defaultValue={
                            mode === "holiday"
                              ? "schedule_review_needed"
                              : "context_only"
                          }
                          name="impactLevel"
                          required
                        >
                          {impactOptions.map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="flex min-h-11 items-center gap-2 self-end rounded-md border border-input px-3 py-2 text-sm md:min-h-9">
                        <input
                          className="size-4 accent-primary"
                          defaultChecked={mode === "holiday"}
                          name="allDay"
                          type="checkbox"
                        />
                        <span>Todo el día</span>
                      </label>
                      <label className="grid min-w-0 gap-2 md:col-span-4">
                        <span className="text-sm font-medium">Notas</span>
                        <Textarea
                          maxLength={500}
                          name="notes"
                          placeholder="Nota operativa corta, sin datos sensibles"
                        />
                      </label>
                      <div className="flex items-end md:col-span-4">
                        <Button type="submit">
                          <Plus aria-hidden="true" />
                          {mode === "holiday" ? "Crear festivo" : "Crear evento"}
                        </Button>
                      </div>
                    </form>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      ), portalRoot) : null}
    </>
  );
}
