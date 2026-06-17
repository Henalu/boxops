"use client";

import * as React from "react";
import { Save, TriangleAlert, X } from "lucide-react";
import { useFormStatus } from "react-dom";

import { updateScheduleTemplate } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type CenterOption = {
  id: string;
  name: string;
  status: string;
};

type TemplateStatusOption = {
  label: string;
  value: string;
};

type AppliedTemplateWeekSummary = {
  blockCount: number;
  centerIds: string[];
  templateId: string;
  templateName: string;
  weekStart: string;
};

type TemplateApplicationMode = "range" | "week";
type ConflictDecision = "keep" | "replace" | null;

type TemplateMetaFormProps = {
  appliedTemplateWeeks: AppliedTemplateWeekSummary[];
  centerFilterId: string;
  centers: CenterOption[];
  currentWeekStart: string;
  organizationId: string;
  selectedDay: number;
  statusOptions: TemplateStatusOption[];
  template: {
    center_id: string | null;
    id: string;
    name: string;
    status: string;
    valid_from: string | null;
    valid_until: string | null;
  };
  view: string;
  weekStart: string;
  editorSettings: {
    endTime: string;
    startTime: string;
  };
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_APPLICATION_WEEKS = 104;

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

function parseDateInput(value: string) {
  if (!DATE_PATTERN.test(value)) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

function toDateInput(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function addDays(dateString: string, days: number) {
  const date = parseDateInput(dateString);

  if (!date) {
    return null;
  }

  date.setUTCDate(date.getUTCDate() + days);

  return toDateInput(date);
}

function getWeekStartDateString(dateString: string) {
  const date = parseDateInput(dateString);

  if (!date) {
    return null;
  }

  const dayOfWeek = date.getUTCDay();
  const daysSinceMonday = (dayOfWeek + 6) % 7;
  date.setUTCDate(date.getUTCDate() - daysSinceMonday);

  return toDateInput(date);
}

function getWeekEndDateString(weekStart: string) {
  return addDays(weekStart, 6);
}

function getAdjacentWeekStart(weekStart: string, offsetWeeks: number) {
  return addDays(weekStart, offsetWeeks * 7);
}

function getYearEndDate(dateString: string) {
  const date = parseDateInput(dateString);
  const year = date?.getUTCFullYear() ?? new Date().getUTCFullYear();

  return `${year}-12-31`;
}

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat("es-ES", {
      dateStyle: "medium",
      timeZone: "UTC",
    }).format(new Date(`${value}T00:00:00.000Z`));
  } catch {
    return value;
  }
}

function getEffectiveStartWeek(dateString: string, currentWeekStart: string) {
  const startWeek = getWeekStartDateString(dateString);

  if (!startWeek) {
    return null;
  }

  return startWeek < currentWeekStart ? currentWeekStart : startWeek;
}

function getTemplateWeekRange({
  applicationMode,
  currentWeekStart,
  targetWeekStart,
  validFrom,
  validUntil,
}: {
  applicationMode: TemplateApplicationMode;
  currentWeekStart: string;
  targetWeekStart: string;
  validFrom: string;
  validUntil: string;
}) {
  if (applicationMode === "week") {
    const weekStart = getWeekStartDateString(targetWeekStart);
    const weekEnd = weekStart ? getWeekEndDateString(weekStart) : null;
    const effectiveStartWeek = weekStart
      ? weekStart < currentWeekStart
        ? currentWeekStart
        : weekStart
      : null;

    return {
      endDate: weekEnd,
      endWeek: weekStart,
      startWeek: effectiveStartWeek,
    };
  }

  const startWeek = validFrom
    ? getEffectiveStartWeek(validFrom, currentWeekStart)
    : null;
  const endWeek = validUntil ? getWeekStartDateString(validUntil) : null;

  return {
    endDate: validUntil || null,
    endWeek,
    startWeek,
  };
}

function getWeekStartsBetween(startWeek: string, endWeek: string) {
  const weeks: string[] = [];
  let currentWeek: string | null = startWeek;

  while (
    currentWeek &&
    currentWeek <= endWeek &&
    weeks.length < MAX_APPLICATION_WEEKS
  ) {
    weeks.push(currentWeek);
    currentWeek = getAdjacentWeekStart(currentWeek, 1);
  }

  return weeks;
}

function getConflictSummary({
  appliedTemplateWeeks,
  centerId,
  endWeek,
  startWeek,
  templateId,
}: {
  appliedTemplateWeeks: AppliedTemplateWeekSummary[];
  centerId: string | null;
  endWeek: string | null;
  startWeek: string | null;
  templateId: string;
}) {
  if (!startWeek || !endWeek || startWeek > endWeek) {
    return null;
  }

  const targetWeeks = new Set(getWeekStartsBetween(startWeek, endWeek));
  const conflictingWeeks = appliedTemplateWeeks.filter((summary) => {
    if (summary.templateId === templateId || !targetWeeks.has(summary.weekStart)) {
      return false;
    }

    if (!centerId) {
      return true;
    }

    return summary.centerIds.includes(centerId);
  });

  if (conflictingWeeks.length === 0) {
    return null;
  }

  const templateNames = [...new Set(conflictingWeeks.map((week) => week.templateName))];
  const weekStarts = [...new Set(conflictingWeeks.map((week) => week.weekStart))].sort();
  const blockCount = conflictingWeeks.reduce(
    (total, week) => total + week.blockCount,
    0,
  );

  return {
    blockCount,
    templateNames,
    weekCount: weekStarts.length,
    weekStarts,
  };
}

function TemplateSaveButton() {
  const { pending } = useFormStatus();

  return (
    <div className="grid gap-2">
      <Button disabled={pending} type="submit">
        <Save aria-hidden="true" />
        {pending ? "Guardando y sincronizando..." : "Guardar plantilla"}
      </Button>
      {pending ? (
        <p className="text-sm leading-6 text-muted-foreground" role="status">
          Solicitud en curso. Estamos guardando la plantilla y actualizando
          horarios.
        </p>
      ) : null}
    </div>
  );
}

function ConfirmationDialog({
  children,
  title,
  titleId,
  tone = "warning",
  onClose,
}: {
  children: React.ReactNode;
  title: string;
  titleId: string;
  tone?: "warning" | "danger";
  onClose: () => void;
}) {
  return (
    <div
      aria-labelledby={titleId}
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-center bg-background/80 px-4 backdrop-blur-sm"
      role="dialog"
    >
      <div className="w-full max-w-lg rounded-lg border border-border bg-card p-4 text-card-foreground shadow-lg">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span
              className={
                tone === "danger"
                  ? "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive"
                  : "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-800"
              }
            >
              <TriangleAlert aria-hidden="true" className="size-4" />
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-semibold tracking-tight" id={titleId}>
                {title}
              </h2>
              {children}
            </div>
          </div>
          <button
            aria-label="Cerrar"
            className="rounded-md p-2 text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function TemplateMetaForm({
  appliedTemplateWeeks,
  centerFilterId,
  centers,
  currentWeekStart,
  editorSettings,
  organizationId,
  selectedDay,
  statusOptions,
  template,
  view,
  weekStart,
}: TemplateMetaFormProps) {
  const formRef = React.useRef<HTMLFormElement>(null);
  const yearEndTitleId = React.useId();
  const conflictTitleId = React.useId();
  const [applicationMode, setApplicationMode] =
    React.useState<TemplateApplicationMode>("range");
  const [validFrom, setValidFrom] = React.useState(template.valid_from ?? "");
  const [validUntil, setValidUntil] = React.useState(template.valid_until ?? "");
  const [targetWeekStart, setTargetWeekStart] = React.useState(
    template.valid_from ?? weekStart,
  );
  const [showYearEndDialog, setShowYearEndDialog] = React.useState(false);
  const [showConflictDialog, setShowConflictDialog] = React.useState(false);
  const [yearEndDate, setYearEndDate] = React.useState<string | null>(null);
  const [conflictSummary, setConflictSummary] = React.useState<ReturnType<
    typeof getConflictSummary
  > | null>(null);
  const [yearEndConfirmed, setYearEndConfirmed] = React.useState(false);
  const [conflictDecision, setConflictDecision] =
    React.useState<ConflictDecision>(null);
  const resolvedTargetWeekStart =
    getWeekStartDateString(targetWeekStart) ?? targetWeekStart;
  const resolvedTargetWeekEnd =
    getWeekEndDateString(resolvedTargetWeekStart) ?? resolvedTargetWeekStart;

  function resetConfirmations() {
    setYearEndConfirmed(false);
    setConflictDecision(null);
  }

  function requestSubmitAfterStateUpdate() {
    window.setTimeout(() => {
      formRef.current?.requestSubmit();
    }, 0);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    const formData = new FormData(event.currentTarget);
    const status = String(formData.get("status") ?? "");

    if (status !== "active") {
      return;
    }

    const centerValue = String(formData.get("centerId") ?? "");
    const centerId = centerValue && centerValue !== "none" ? centerValue : null;

    let nextValidUntil = validUntil;

    if (applicationMode === "range" && validFrom && !validUntil) {
      nextValidUntil = getYearEndDate(
        validFrom < currentWeekStart ? currentWeekStart : validFrom,
      );

      if (!yearEndConfirmed) {
        event.preventDefault();
        setYearEndDate(nextValidUntil);
        setShowYearEndDialog(true);
        return;
      }
    }

    const range = getTemplateWeekRange({
      applicationMode,
      currentWeekStart,
      targetWeekStart,
      validFrom,
      validUntil: nextValidUntil,
    });
    const nextConflictSummary = getConflictSummary({
      appliedTemplateWeeks,
      centerId,
      endWeek: range.endWeek,
      startWeek: range.startWeek,
      templateId: template.id,
    });

    if (nextConflictSummary && !conflictDecision) {
      event.preventDefault();
      setConflictSummary(nextConflictSummary);
      setShowConflictDialog(true);
    }
  }

  return (
    <>
      <form
        action={updateScheduleTemplate}
        className="grid gap-4 lg:grid-cols-6"
        onSubmit={handleSubmit}
        ref={formRef}
      >
        <input name="centerFilterId" type="hidden" value={centerFilterId} />
        <input name="organizationId" type="hidden" value={organizationId} />
        <input name="day" type="hidden" value={String(selectedDay)} />
        <input name="templateId" type="hidden" value={template.id} />
        <input name="view" type="hidden" value={view} />
        <input name="weekStart" type="hidden" value={weekStart} />
        <input name="applicationMode" type="hidden" value={applicationMode} />
        <input
          name="replaceExisting"
          type="hidden"
          value={conflictDecision === "replace" ? "1" : "0"}
        />
        <input
          name="confirmYearEnd"
          type="hidden"
          value={yearEndConfirmed ? "1" : "0"}
        />

        <label className="grid min-w-0 gap-2 lg:col-span-2">
          <span className="text-sm font-medium">Nombre</span>
          <Input
            defaultValue={template.name}
            maxLength={120}
            name="name"
            required
          />
        </label>

        <label className="grid min-w-0 gap-2 lg:col-span-2">
          <span className="text-sm font-medium">Alcance de centro</span>
          <select
            className={selectClassName()}
            defaultValue={template.center_id ?? "none"}
            name="centerId"
            onChange={resetConfirmations}
          >
            <option value="none">Todos los centros</option>
            {centers.map((center) => (
              <option key={center.id} value={center.id}>
                {center.name}
                {center.status === "inactive" ? " (inactivo)" : ""}
              </option>
            ))}
          </select>
        </label>

        <label className="grid min-w-0 gap-2">
          <span className="text-sm font-medium">Aplicación</span>
          <select
            className={selectClassName()}
            name="applicationModeSelect"
            onChange={(event) => {
              setApplicationMode(event.currentTarget.value as TemplateApplicationMode);
              resetConfirmations();
            }}
            value={applicationMode}
          >
            <option value="range">Rango de fechas</option>
            <option value="week">Semana específica</option>
          </select>
        </label>

        <label className="grid min-w-0 gap-2">
          <span className="text-sm font-medium">Estado</span>
          <select
            className={selectClassName()}
            defaultValue={template.status}
            name="status"
            onChange={resetConfirmations}
          >
            {statusOptions.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </select>
        </label>

        {applicationMode === "range" ? (
          <>
            <label className="grid min-w-0 gap-2">
              <span className="text-sm font-medium">Válida desde</span>
              <Input
                name="validFrom"
                onChange={(event) => {
                  setValidFrom(event.currentTarget.value);
                  resetConfirmations();
                }}
                type="date"
                value={validFrom}
              />
            </label>

            <label className="grid min-w-0 gap-2">
              <span className="text-sm font-medium">Válida hasta</span>
              <Input
                name="validUntil"
                onChange={(event) => {
                  setValidUntil(event.currentTarget.value);
                  resetConfirmations();
                }}
                type="date"
                value={validUntil}
              />
            </label>
          </>
        ) : (
          <>
            <label className="grid min-w-0 gap-2 lg:col-span-2">
              <span className="text-sm font-medium">Semana destino</span>
              <Input
                name="targetWeekStart"
                onChange={(event) => {
                  setTargetWeekStart(event.currentTarget.value);
                  resetConfirmations();
                }}
                required
                type="date"
                value={targetWeekStart}
              />
            </label>
            <input name="validFrom" type="hidden" value={resolvedTargetWeekStart} />
            <input name="validUntil" type="hidden" value={resolvedTargetWeekEnd} />
          </>
        )}

        <label className="grid min-w-0 gap-2">
          <span className="text-sm font-medium">Horario desde</span>
          <Input
            defaultValue={editorSettings.startTime}
            name="editorStartTime"
            required
            type="time"
          />
        </label>

        <label className="grid min-w-0 gap-2">
          <span className="text-sm font-medium">Horario hasta</span>
          <Input
            defaultValue={editorSettings.endTime}
            name="editorEndTime"
            required
            type="time"
          />
        </label>

        <div className="grid gap-2 lg:col-span-6">
          <div className="flex items-end">
            <TemplateSaveButton />
          </div>
          <p className="text-sm leading-6 text-muted-foreground">
            Si la plantilla está activa, al guardar se sincronizan las semanas
            válidas. En borrador solo se guardan los cambios.
          </p>
        </div>
      </form>

      {showYearEndDialog && yearEndDate ? (
        <ConfirmationDialog
          onClose={() => setShowYearEndDialog(false)}
          title="Aplicar hasta final de año"
          titleId={yearEndTitleId}
        >
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            No has indicado &quot;Válida hasta&quot;. Si continúas, guardaremos{" "}
            {formatDate(yearEndDate)} como fecha final y aplicaremos la
            plantilla hasta final del año vigente.
          </p>
          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              onClick={() => setShowYearEndDialog(false)}
              type="button"
              variant="outline"
            >
              Cancelar
            </Button>
            <Button
              onClick={() => {
                setValidUntil(yearEndDate);
                setYearEndConfirmed(true);
                setShowYearEndDialog(false);
                requestSubmitAfterStateUpdate();
              }}
              type="button"
            >
              Aplicar hasta final de año
            </Button>
          </div>
        </ConfirmationDialog>
      ) : null}

      {showConflictDialog && conflictSummary ? (
        <ConfirmationDialog
          onClose={() => setShowConflictDialog(false)}
          title="Ya hay plantillas aplicadas"
          titleId={conflictTitleId}
          tone="danger"
        >
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Hay {conflictSummary.blockCount} bloque
            {conflictSummary.blockCount === 1 ? "" : "s"} de{" "}
            {conflictSummary.templateNames.length === 1
              ? conflictSummary.templateNames[0]
              : `${conflictSummary.templateNames.length} plantillas`}{" "}
            en {conflictSummary.weekCount} semana
            {conflictSummary.weekCount === 1 ? "" : "s"} del rango.
          </p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Puedes conservar esas semanas y aplicar esta plantilla solo donde
            no haya otra, o sustituir las plantillas existentes dentro del
            rango.
          </p>
          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              onClick={() => setShowConflictDialog(false)}
              type="button"
              variant="outline"
            >
              Cancelar
            </Button>
            <Button
              onClick={() => {
                setConflictDecision("keep");
                setShowConflictDialog(false);
                requestSubmitAfterStateUpdate();
              }}
              type="button"
              variant="secondary"
            >
              Conservar existentes
            </Button>
            <Button
              onClick={() => {
                setConflictDecision("replace");
                setShowConflictDialog(false);
                requestSubmitAfterStateUpdate();
              }}
              type="button"
            >
              Sustituir existentes
            </Button>
          </div>
        </ConfirmationDialog>
      ) : null}
    </>
  );
}
