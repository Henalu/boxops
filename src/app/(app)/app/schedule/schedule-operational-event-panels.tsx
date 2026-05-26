"use client";

import * as React from "react";
import {
  Archive,
  CalendarClock,
  CircleOff,
  RotateCcw,
  Save,
  X,
} from "lucide-react";

import {
  setOperationalEventStatusFromForm,
  updateOperationalEventFromForm,
} from "./operational-event-actions";
import {
  pushRouteStateHref,
  RouteStateButton,
  useRouteQueryParam,
} from "@/components/features/route-state-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { OperationalEventRow } from "@/lib/operational-events";
import { cn } from "@/lib/utils";
import type { Tables } from "@/types/supabase";

type CenterOption = Pick<Tables<"centers">, "id" | "name" | "status">;

type ScheduleOperationalEventPanelsProps = {
  basePath: string;
  canManageEvents: boolean;
  centers: CenterOption[];
  initialSelectedEventId: string | null;
  operationalEvents: OperationalEventRow[];
  organizationId: string;
  timezone: string;
  weekStart: string;
};

const eventTypeLabels: Record<string, string> = {
  closure: "Cierre",
  community_event: "Comunidad",
  competition: "Competicion",
  external_event: "Evento externo",
  holiday: "Festivo",
  internal_event: "Evento interno",
  maintenance: "Mantenimiento",
  open_day: "Jornada abierta",
  seminar: "Seminario",
};

const eventTypeOptions = [
  "holiday",
  "closure",
  "competition",
  "seminar",
  "open_day",
  "internal_event",
  "external_event",
  "maintenance",
  "community_event",
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

function getOperationalEventPanelPath({
  basePath,
  eventId,
}: {
  basePath: string;
  eventId: string;
}) {
  const url = new URL(basePath, "http://boxops.local");
  url.searchParams.delete("block_id");
  url.searchParams.set("event_id", eventId);

  return `${url.pathname}${url.search}`;
}

function getLocalParts(value: string, timezone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    timeZone: timezone,
    year: "numeric",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(new Date(value)).map((part) => [
      part.type,
      part.value,
    ]),
  );

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

function formatEventSummary(event: OperationalEventRow, timezone: string) {
  if (event.all_day) {
    return "Todo el dia";
  }

  const start = getLocalParts(event.starts_at, timezone);
  const end = event.ends_at ? getLocalParts(event.ends_at, timezone) : null;

  return end ? `${start.time}-${end.time}` : start.time;
}

function EventHiddenInputs({
  event,
  organizationId,
  returnPath,
  weekStart,
}: {
  event: OperationalEventRow;
  organizationId: string;
  returnPath: string;
  weekStart: string;
}) {
  return (
    <>
      <input name="organizationId" type="hidden" value={organizationId} />
      <input name="operationalEventId" type="hidden" value={event.id} />
      <input name="returnPath" type="hidden" value={returnPath} />
      <input name="weekStart" type="hidden" value={weekStart} />
    </>
  );
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

    return () => window.removeEventListener("keydown", handleKeyDown);
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

export function ScheduleOperationalEventPanels({
  basePath,
  canManageEvents,
  centers,
  initialSelectedEventId,
  operationalEvents,
  organizationId,
  timezone,
  weekStart,
}: ScheduleOperationalEventPanelsProps) {
  const validEventIds = React.useMemo(
    () => operationalEvents.map((event) => event.id),
    [operationalEvents],
  );
  const selectedEventId = useRouteQueryParam({
    initialValue: initialSelectedEventId,
    paramName: "event_id",
    validValues: validEventIds,
  });
  const selectedEvent = operationalEvents.find(
    (event) => event.id === selectedEventId,
  );
  const centersById = React.useMemo(
    () => new Map(centers.map((center) => [center.id, center])),
    [centers],
  );
  const closeHref = basePath;

  usePanelRouteLifecycle({
    closeHref,
    isOpen: Boolean(selectedEvent),
  });

  if (!selectedEvent) {
    return null;
  }

  const eventTimezone = selectedEvent.timezone || timezone;
  const startParts = getLocalParts(selectedEvent.starts_at, eventTimezone);
  const endParts = selectedEvent.ends_at
    ? getLocalParts(selectedEvent.ends_at, eventTimezone)
    : null;
  const eventHref = getOperationalEventPanelPath({
    basePath,
    eventId: selectedEvent.id,
  });
  const center = selectedEvent.center_id
    ? centersById.get(selectedEvent.center_id)
    : undefined;

  return (
    <aside
      className="fixed inset-0 z-50"
      data-operational-detail-panel="operational-event"
    >
      <RouteStateButton
        aria-label="Cerrar evento"
        className="absolute inset-0 z-0 block cursor-default bg-foreground/20 p-0 backdrop-blur-sm"
        href={closeHref}
      />
      <div className="relative z-10 ml-auto flex h-full w-full max-w-2xl flex-col overflow-y-auto bg-background shadow-xl ring-1 ring-border">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border bg-background/95 px-4 py-4 backdrop-blur">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">
                {eventTypeLabels[selectedEvent.event_type] ?? "Evento"}
              </Badge>
              <Badge variant="outline">
                {formatEventSummary(selectedEvent, eventTimezone)}
              </Badge>
            </div>
            <h2 className="truncate text-lg font-semibold tracking-tight">
              {selectedEvent.title}
            </h2>
            <p className="truncate text-sm text-muted-foreground">
              {startParts.date}
              {center ? ` / ${center.name}` : " / Toda la organizacion"}
            </p>
          </div>
          <Button asChild size="icon" variant="ghost">
            <RouteStateButton aria-label="Cerrar evento" href={closeHref}>
              <X aria-hidden="true" />
            </RouteStateButton>
          </Button>
        </div>

        <div className="grid gap-4 p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
          {canManageEvents ? (
            <form
              action={updateOperationalEventFromForm}
              className="grid gap-3 md:grid-cols-4"
            >
              <EventHiddenInputs
                event={selectedEvent}
                organizationId={organizationId}
                returnPath={eventHref}
                weekStart={weekStart}
              />

              <label className="grid min-w-0 gap-2 md:col-span-2">
                <span className="text-sm font-medium">Titulo</span>
                <Input
                  defaultValue={selectedEvent.title}
                  maxLength={120}
                  name="title"
                  required
                />
              </label>
              <label className="grid min-w-0 gap-2">
                <span className="text-sm font-medium">Tipo</span>
                <select
                  className={selectClassName()}
                  defaultValue={selectedEvent.event_type}
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
              <label className="grid min-w-0 gap-2">
                <span className="text-sm font-medium">Centro</span>
                <select
                  className={selectClassName()}
                  defaultValue={selectedEvent.center_id ?? ""}
                  name="centerId"
                >
                  <option value="">Toda la organizacion</option>
                  {centers.map((centerOption) => (
                    <option key={centerOption.id} value={centerOption.id}>
                      {centerOption.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid min-w-0 gap-2">
                <span className="text-sm font-medium">Fecha inicio</span>
                <Input
                  defaultValue={startParts.date}
                  name="startsOn"
                  required
                  type="date"
                />
              </label>
              <label className="grid min-w-0 gap-2">
                <span className="text-sm font-medium">Hora inicio</span>
                <Input
                  defaultValue={startParts.time}
                  name="startsAtTime"
                  type="time"
                />
              </label>
              <label className="grid min-w-0 gap-2">
                <span className="text-sm font-medium">Fecha fin</span>
                <Input
                  defaultValue={endParts?.date ?? ""}
                  name="endsOn"
                  type="date"
                />
              </label>
              <label className="grid min-w-0 gap-2">
                <span className="text-sm font-medium">Hora fin</span>
                <Input
                  defaultValue={endParts?.time ?? ""}
                  name="endsAtTime"
                  type="time"
                />
              </label>
              <label className="grid min-w-0 gap-2">
                <span className="text-sm font-medium">Visibilidad</span>
                <select
                  className={selectClassName()}
                  defaultValue={selectedEvent.visibility}
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
                  defaultValue={selectedEvent.impact_level}
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
                  defaultChecked={selectedEvent.all_day}
                  name="allDay"
                  type="checkbox"
                />
                <span>Todo el dia</span>
              </label>
              <label className="grid min-w-0 gap-2 md:col-span-4">
                <span className="text-sm font-medium">Notas</span>
                <Textarea
                  defaultValue={selectedEvent.notes ?? ""}
                  maxLength={500}
                  name="notes"
                  placeholder="Nota operativa corta, sin datos sensibles"
                />
              </label>
              <div className="flex flex-wrap gap-2 md:col-span-4">
                <Button type="submit">
                  <Save aria-hidden="true" />
                  Guardar evento
                </Button>
              </div>
            </form>
          ) : (
            <div className="rounded-xl border border-border bg-muted/20 p-4 text-sm">
              <div className="flex items-start gap-3">
                <CalendarClock
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                />
                <div className="min-w-0 space-y-1">
                  <p className="font-medium">Contexto operativo</p>
                  <p className="text-muted-foreground">
                    Tu rol puede consultar este evento, pero no editarlo.
                  </p>
                </div>
              </div>
            </div>
          )}

          {canManageEvents ? (
            <div className="flex flex-wrap gap-2 border-t border-border pt-4">
              <form action={setOperationalEventStatusFromForm}>
                <EventHiddenInputs
                  event={selectedEvent}
                  organizationId={organizationId}
                  returnPath={closeHref}
                  weekStart={weekStart}
                />
                <input name="eventStatus" type="hidden" value="cancelled" />
                <Button type="submit" variant="destructive">
                  <CircleOff aria-hidden="true" />
                  Cancelar
                </Button>
              </form>
              <form action={setOperationalEventStatusFromForm}>
                <EventHiddenInputs
                  event={selectedEvent}
                  organizationId={organizationId}
                  returnPath={closeHref}
                  weekStart={weekStart}
                />
                <input name="eventStatus" type="hidden" value="archived" />
                <Button type="submit" variant="outline">
                  <Archive aria-hidden="true" />
                  Archivar
                </Button>
              </form>
              {selectedEvent.status !== "active" ? (
                <form action={setOperationalEventStatusFromForm}>
                  <EventHiddenInputs
                    event={selectedEvent}
                    organizationId={organizationId}
                    returnPath={eventHref}
                    weekStart={weekStart}
                  />
                  <input name="eventStatus" type="hidden" value="active" />
                  <Button type="submit" variant="outline">
                    <RotateCcw aria-hidden="true" />
                    Reactivar
                  </Button>
                </form>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
