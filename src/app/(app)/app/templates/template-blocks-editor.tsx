"use client";

import { type CSSProperties, useId, useMemo, useState } from "react";
import {
  ListFilter,
  Pencil,
  Save,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";

import {
  deleteScheduleTemplateBlock,
  deleteScheduleTemplateBlocksBulk,
  updateScheduleTemplateBlock,
  updateScheduleTemplateBlocksBulk,
} from "./actions";
import {
  pushRouteStateHref,
  RouteStateLink,
  useRouteQueryParam,
} from "@/components/features/route-state-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getScheduleTemplatesPath } from "@/lib/navigation/app-paths";
import { formatTimeForInput } from "@/lib/schedule-blocks";
import {
  SCHEDULE_TEMPLATE_DAYS,
  getScheduleTemplateDefaultCoachDetail,
  getScheduleTemplateDefaultCoachLabel,
  getUnavailableScheduleTemplateCoachBlocks,
  getScheduleTemplateDayLabel,
  getScheduleTemplateRequiredCoachesLabel,
  scheduleTemplateBlockRequiresCoach,
} from "@/lib/schedule-templates";
import { cn } from "@/lib/utils";
import type { Tables } from "@/types/supabase";

type TemplateDay = (typeof SCHEDULE_TEMPLATE_DAYS)[number];
type TemplateView = "agenda" | "week";
type AssignmentFilter = "all" | "assigned" | "unassigned";

type ScheduleTemplateBlockRow = Pick<
  Tables<"schedule_template_blocks">,
  | "center_id"
  | "class_type_id"
  | "day_of_week"
  | "default_coach_profile_id"
  | "end_time"
  | "id"
  | "notes"
  | "required_coaches"
  | "start_time"
  | "template_id"
  | "updated_at"
>;

type CenterRow = Pick<Tables<"centers">, "id" | "name" | "status">;

type ClassTypeRow = Pick<
  Tables<"class_types">,
  "category" | "color" | "id" | "name" | "required_coaches" | "status"
>;

type CoachDisplay = {
  detail: string;
  id: string;
  isFallback: boolean;
  label: string;
};

const templateDayShortLabels: Record<TemplateDay, string> = {
  1: "L",
  2: "M",
  3: "X",
  4: "J",
  5: "V",
  6: "S",
  7: "D",
};

function selectClassName(className = "") {
  return cn(
    "h-11 w-full min-w-0 truncate rounded-md border border-input bg-transparent py-1 pl-3 pr-9 text-sm md:h-9",
    "outline-none transition-colors focus-visible:border-ring",
    "focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
    className,
  );
}

function formatTime(value: string) {
  return formatTimeForInput(value) || value;
}

function getUnavailableCoachSummaries({
  coachDisplaysById,
  unavailableBlocks,
}: {
  coachDisplaysById: Map<string, CoachDisplay>;
  unavailableBlocks: ReturnType<
    typeof getUnavailableScheduleTemplateCoachBlocks
  >;
}) {
  const summaries = new Map<string, string>();

  for (const unavailableBlock of unavailableBlocks) {
    const coachLabel =
      coachDisplaysById.get(unavailableBlock.coachProfileId)?.label ??
      `Entrenador ${unavailableBlock.coachProfileId.slice(0, 8)}`;
    const timeLabel = `${formatTime(unavailableBlock.startTime)}-${formatTime(
      unavailableBlock.endTime,
    )}`;

    summaries.set(
      `${unavailableBlock.coachProfileId}:${unavailableBlock.templateBlockId}`,
      `${coachLabel}: ${getScheduleTemplateDayLabel(
        unavailableBlock.dayOfWeek,
      )} ${timeLabel}`,
    );
  }

  return [...summaries.values()];
}

function getSafeColor(value: string | null) {
  return value && /^#[0-9a-f]{6}$/i.test(value) ? value : null;
}

function getClassTypeCardStyle(color: string | null): CSSProperties | undefined {
  const safeColor = getSafeColor(color);

  if (!safeColor) {
    return undefined;
  }

  return {
    backgroundColor: `color-mix(in oklch, ${safeColor} 8%, var(--background))`,
    borderColor: `color-mix(in oklch, ${safeColor} 32%, var(--border))`,
    borderLeftColor: safeColor,
    borderLeftWidth: "3px",
  };
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

function groupTemplateBlocksByDay(blocks: ScheduleTemplateBlockRow[]) {
  const groups = new Map<number, ScheduleTemplateBlockRow[]>(
    SCHEDULE_TEMPLATE_DAYS.map((day) => [day, [] as ScheduleTemplateBlockRow[]]),
  );

  for (const block of blocks) {
    const group = groups.get(block.day_of_week) ?? [];
    group.push(block);
    groups.set(block.day_of_week, group);
  }

  for (const [day, dayBlocks] of groups.entries()) {
    groups.set(
      day,
      [...dayBlocks].sort((first, second) =>
        `${first.start_time}-${first.end_time}-${first.id}`.localeCompare(
          `${second.start_time}-${second.end_time}-${second.id}`,
        ),
      ),
    );
  }

  return groups;
}

function filterTemplateBlocks({
  assignmentFilter,
  blocks,
  classTypeFilter,
}: {
  assignmentFilter: AssignmentFilter;
  blocks: ScheduleTemplateBlockRow[];
  classTypeFilter: string;
}) {
  return blocks.filter((block) => {
    const requiresCoach = scheduleTemplateBlockRequiresCoach(
      block.required_coaches,
    );

    if (
      assignmentFilter === "unassigned" &&
      (!requiresCoach || block.default_coach_profile_id)
    ) {
      return false;
    }

    if (
      assignmentFilter === "assigned" &&
      (!requiresCoach || !block.default_coach_profile_id)
    ) {
      return false;
    }

    if (classTypeFilter !== "all" && block.class_type_id !== classTypeFilter) {
      return false;
    }

    return true;
  });
}

function CenterSelect({
  centers,
  defaultValue,
}: {
  centers: CenterRow[];
  defaultValue?: string;
}) {
  return (
    <select
      className={selectClassName()}
      defaultValue={defaultValue ?? centers[0]?.id ?? ""}
      name="centerId"
      required
    >
      {centers.length === 0 ? <option value="">Sin centros activos</option> : null}
      {centers.map((center) => (
        <option key={center.id} value={center.id}>
          {center.name}
          {center.status === "inactive" ? " (inactivo)" : ""}
        </option>
      ))}
    </select>
  );
}

function CenterReadOnlyField({
  center,
}: {
  center: CenterRow | undefined;
}) {
  return (
    <div className="grid gap-2">
      <input name="centerId" type="hidden" value={center?.id ?? ""} />
      <Input
        aria-readonly="true"
        readOnly
        value={center?.name ?? "Centro no disponible"}
      />
    </div>
  );
}

function ClassTypeSelect({
  classTypes,
  defaultValue,
}: {
  classTypes: ClassTypeRow[];
  defaultValue?: string;
}) {
  return (
    <select
      className={selectClassName()}
      defaultValue={defaultValue ?? classTypes[0]?.id ?? ""}
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

function CoachSelect({
  coaches,
  defaultValue,
  requiredCoaches,
  unavailableCoachProfileIds,
}: {
  coaches: CoachDisplay[];
  defaultValue?: string | null;
  requiredCoaches: number;
  unavailableCoachProfileIds?: Set<string>;
}) {
  if (!scheduleTemplateBlockRequiresCoach(requiredCoaches)) {
    return (
      <>
        <input name="defaultCoachProfileId" type="hidden" value="none" />
        <select
          aria-readonly="true"
          className={selectClassName()}
          disabled
          value="none"
        >
          <option value="none">No requiere entrenador</option>
        </select>
      </>
    );
  }

  return (
    <select
      className={selectClassName()}
      defaultValue={defaultValue ?? "none"}
      name="defaultCoachProfileId"
    >
      <option value="none">Sin entrenador por defecto (vacante)</option>
      {coaches.map((coach) => (
        <option
          disabled={unavailableCoachProfileIds?.has(coach.id)}
          key={coach.id}
          value={coach.id}
        >
          {coach.label}
          {unavailableCoachProfileIds?.has(coach.id)
            ? " (ocupado)"
            : coach.isFallback
              ? " (sin perfil visible)"
              : ""}
        </option>
      ))}
    </select>
  );
}

function DaySelect({
  defaultValue,
  onChange,
  value,
}: {
  defaultValue?: number;
  onChange?: (value: TemplateDay) => void;
  value?: TemplateDay;
}) {
  const valueProps =
    value === undefined ? { defaultValue: defaultValue ?? 1 } : { value };

  return (
    <select
      className={selectClassName()}
      onChange={(event) =>
        onChange?.(Number(event.currentTarget.value) as TemplateDay)
      }
      {...valueProps}
      name="dayOfWeek"
      required
    >
      {SCHEDULE_TEMPLATE_DAYS.map((day) => (
        <option key={day} value={day}>
          {getScheduleTemplateDayLabel(day)}
        </option>
      ))}
    </select>
  );
}

function TemplateBlockDeleteSubmit({
  blockCount,
  formAction,
}: {
  blockCount: number;
  formAction: (formData: FormData) => void | Promise<void>;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const titleId = useId();
  const descriptionId = useId();
  const blockLabel =
    blockCount === 1 ? "este bloque" : `estos ${blockCount} bloques`;
  const dependencyLabel = blockCount === 1 ? "ese bloque" : "esos bloques";
  const removalVerb = blockCount === 1 ? "retirara" : "retiraran";
  const title =
    blockCount === 1
      ? "Eliminar bloque de plantilla"
      : `Eliminar ${blockCount} bloques de plantilla`;
  const triggerLabel =
    blockCount === 1 ? "Eliminar bloque" : `Eliminar ${blockCount} bloques`;

  return (
    <>
      <Button
        onClick={() => setIsOpen(true)}
        type="button"
        variant="destructive"
      >
        <Trash2 aria-hidden="true" />
        {triggerLabel}
      </Button>

      {isOpen ? (
        <div
          aria-describedby={descriptionId}
          aria-labelledby={titleId}
          aria-modal="true"
          className="fixed inset-0 z-[70] grid place-items-center bg-background/80 px-4 backdrop-blur-sm"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setIsOpen(false);
            }
          }}
          role="dialog"
        >
          <button
            aria-label="Cerrar confirmacion"
            className="absolute inset-0 cursor-default"
            onClick={() => setIsOpen(false)}
            type="button"
          />
          <div className="relative w-full max-w-lg rounded-lg border border-border bg-card p-4 text-card-foreground shadow-lg">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                  <TriangleAlert aria-hidden="true" className="size-4" />
                </span>
                <div className="min-w-0">
                  <h2
                    className="text-base font-semibold tracking-tight"
                    id={titleId}
                  >
                    {title}
                  </h2>
                  <p
                    className="mt-2 text-sm leading-6 text-muted-foreground"
                    id={descriptionId}
                  >
                    Se {removalVerb} {blockLabel} del patron semanal y tambien
                    los horarios generados activos que dependan de{" "}
                    {dependencyLabel}.
                  </p>
                  <p className="mt-2 rounded-md border border-border bg-muted/35 px-3 py-2 text-sm leading-6 text-muted-foreground">
                    Los bloques completados, cancelados o marcados como
                    excepcion se conservan como historial operativo.
                  </p>
                </div>
              </div>
              <button
                aria-label="Cerrar"
                className="rounded-md p-2 text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                onClick={() => setIsOpen(false)}
                type="button"
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            </div>

            <input
              name="confirmTemplateBlockDelete"
              type="hidden"
              value="1"
            />

            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                onClick={() => setIsOpen(false)}
                type="button"
                variant="outline"
              >
                Cancelar
              </Button>
              <Button
                formAction={formAction}
                formNoValidate
                type="submit"
                variant="destructive"
              >
                <Trash2 aria-hidden="true" />
                {triggerLabel}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function TemplateBlockEditForm({
  assignableCoaches,
  block,
  blocks,
  centers,
  classTypes,
  coachDisplaysById,
  onCancel,
  organizationId,
  selectedDay,
  templateCenterId,
  view,
  weekStart,
}: {
  assignableCoaches: CoachDisplay[];
  block: ScheduleTemplateBlockRow;
  blocks: ScheduleTemplateBlockRow[];
  centers: CenterRow[];
  classTypes: ClassTypeRow[];
  coachDisplaysById: Map<string, CoachDisplay>;
  onCancel: () => void;
  organizationId: string;
  selectedDay: TemplateDay;
  templateCenterId?: string | null;
  view: TemplateView;
  weekStart: string;
}) {
  const templateCenter = templateCenterId
    ? centers.find((center) => center.id === templateCenterId)
    : undefined;
  const [dayOfWeek, setDayOfWeek] = useState(
    block.day_of_week as TemplateDay,
  );
  const [startTime, setStartTime] = useState(formatTime(block.start_time));
  const [endTime, setEndTime] = useState(formatTime(block.end_time));
  const [requiredCoaches, setRequiredCoaches] = useState(
    block.required_coaches,
  );
  const requiresCoach = scheduleTemplateBlockRequiresCoach(requiredCoaches);
  const unavailableCoachBlocks = useMemo(
    () =>
      getUnavailableScheduleTemplateCoachBlocks({
        blocks,
        targetBlock: {
          day_of_week: dayOfWeek,
          end_time: endTime,
          id: block.id,
          start_time: startTime,
        },
      }),
    [block.id, blocks, dayOfWeek, endTime, startTime],
  );
  const unavailableCoachProfileIds = useMemo(
    () =>
      new Set(
        unavailableCoachBlocks.map(
          (unavailableBlock) => unavailableBlock.coachProfileId,
        ),
      ),
    [unavailableCoachBlocks],
  );
  const unavailableCoachSummaries = useMemo(
    () =>
      getUnavailableCoachSummaries({
        coachDisplaysById,
        unavailableBlocks: unavailableCoachBlocks,
      }),
    [coachDisplaysById, unavailableCoachBlocks],
  );

  return (
    <form
      action={updateScheduleTemplateBlock}
      className="grid gap-4 sm:grid-cols-2"
    >
      <input name="organizationId" type="hidden" value={organizationId} />
      <input name="day" type="hidden" value={String(selectedDay)} />
      <input name="templateId" type="hidden" value={block.template_id} />
      <input name="templateBlockId" type="hidden" value={block.id} />
      <input name="view" type="hidden" value={view} />
      <input name="weekStart" type="hidden" value={weekStart} />

      <label className="grid min-w-0 gap-2">
        <span className="text-sm font-medium">Día</span>
        <DaySelect onChange={setDayOfWeek} value={dayOfWeek} />
      </label>

      <label className="grid min-w-0 gap-2">
        <span className="text-sm font-medium">Inicio</span>
        <Input
          name="startTime"
          onChange={(event) => setStartTime(event.currentTarget.value)}
          required
          type="time"
          value={startTime}
        />
      </label>

      <label className="grid min-w-0 gap-2">
        <span className="text-sm font-medium">Fin</span>
        <Input
          name="endTime"
          onChange={(event) => setEndTime(event.currentTarget.value)}
          required
          type="time"
          value={endTime}
        />
      </label>

      <label className="grid min-w-0 gap-2">
        <span className="text-sm font-medium">Centro</span>
        {templateCenterId ? (
          <CenterReadOnlyField center={templateCenter} />
        ) : (
          <CenterSelect centers={centers} defaultValue={block.center_id} />
        )}
        {templateCenterId ? (
          <span className="text-xs leading-5 text-muted-foreground">
            Lo marca el alcance de la plantilla.
          </span>
        ) : null}
      </label>

      <label className="grid min-w-0 gap-2">
        <span className="text-sm font-medium">Tipo de actividad</span>
        <ClassTypeSelect
          classTypes={classTypes}
          defaultValue={block.class_type_id}
        />
      </label>

      <label className="grid min-w-0 gap-2">
        <span className="text-sm font-medium">Entrenadores necesarios</span>
        <Input
          max="20"
          min="0"
          name="requiredCoaches"
          onChange={(event) => {
            const nextValue = Number(event.currentTarget.value);

            setRequiredCoaches(Number.isNaN(nextValue) ? 0 : nextValue);
          }}
          required
          type="number"
          value={requiredCoaches}
        />
      </label>

      <label className="grid min-w-0 gap-2 sm:col-span-2">
        <span className="text-sm font-medium">Entrenador por defecto</span>
        <CoachSelect
          coaches={assignableCoaches}
          defaultValue={block.default_coach_profile_id}
          requiredCoaches={requiredCoaches}
          unavailableCoachProfileIds={unavailableCoachProfileIds}
        />
        {requiresCoach && unavailableCoachSummaries.length > 0 ? (
          <details className="rounded-md border border-border/70 bg-muted/25 px-3 py-2 text-sm text-muted-foreground">
            <summary className="cursor-pointer select-none font-medium text-foreground">
              {unavailableCoachProfileIds.size} entrenador
              {unavailableCoachProfileIds.size === 1 ? "" : "es"} ocupado
              {unavailableCoachProfileIds.size === 1 ? "" : "s"} en esta
              franja
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
      </label>

      <label className="grid min-w-0 gap-2 sm:col-span-2">
        <span className="text-sm font-medium">Notas</span>
        <Textarea
          defaultValue={block.notes ?? ""}
          maxLength={1000}
          name="notes"
          placeholder="Notas que se copiaran al bloque real"
        />
      </label>

      <div className="flex flex-wrap items-end gap-2 sm:col-span-2">
        <Button type="submit">
          <Save aria-hidden="true" />
          Guardar bloque
        </Button>
        <Button onClick={onCancel} type="button" variant="outline">
          <X aria-hidden="true" />
          Cerrar
        </Button>
        <TemplateBlockDeleteSubmit
          blockCount={1}
          formAction={deleteScheduleTemplateBlock}
        />
      </div>
    </form>
  );
}

function BulkCoachSelect({
  coaches,
  disabledByNoRequirement,
  unavailableCoachProfileIds,
}: {
  coaches: CoachDisplay[];
  disabledByNoRequirement: boolean;
  unavailableCoachProfileIds: Set<string>;
}) {
  if (disabledByNoRequirement) {
    return (
      <>
        <input name="defaultCoachProfileId" type="hidden" value="none" />
        <select
          aria-readonly="true"
          className={selectClassName()}
          disabled
          value="none"
        >
          <option value="none">No requiere entrenador</option>
        </select>
      </>
    );
  }

  return (
    <select
      className={selectClassName()}
      defaultValue="keep"
      name="defaultCoachProfileId"
    >
      <option value="keep">Mantener entrenador actual</option>
      <option value="none">Dejar vacante</option>
      {coaches.map((coach) => (
        <option
          disabled={unavailableCoachProfileIds.has(coach.id)}
          key={coach.id}
          value={coach.id}
        >
          {coach.label}
          {unavailableCoachProfileIds.has(coach.id)
            ? " (ocupado)"
            : coach.isFallback
              ? " (sin perfil visible)"
              : ""}
        </option>
      ))}
    </select>
  );
}

function BulkCenterSelect({ centers }: { centers: CenterRow[] }) {
  return (
    <select className={selectClassName()} defaultValue="keep" name="centerId">
      <option value="keep">Mantener centro actual</option>
      {centers.map((center) => (
        <option key={center.id} value={center.id}>
          {center.name}
          {center.status === "inactive" ? " (inactivo)" : ""}
        </option>
      ))}
    </select>
  );
}

function TemplateBlocksBulkEditForm({
  assignableCoaches,
  blocks,
  centers,
  onCancel,
  organizationId,
  selectedBlocks,
  selectedDay,
  templateCenterId,
  view,
  weekStart,
}: {
  assignableCoaches: CoachDisplay[];
  blocks: ScheduleTemplateBlockRow[];
  centers: CenterRow[];
  onCancel: () => void;
  organizationId: string;
  selectedBlocks: ScheduleTemplateBlockRow[];
  selectedDay: TemplateDay;
  templateCenterId?: string | null;
  view: TemplateView;
  weekStart: string;
}) {
  const templateCenter = templateCenterId
    ? centers.find((center) => center.id === templateCenterId)
    : undefined;
  const templateId = selectedBlocks[0]?.template_id ?? "";
  const selectedBlockIds = useMemo(
    () => new Set(selectedBlocks.map((block) => block.id)),
    [selectedBlocks],
  );
  const [bulkRequiredCoaches, setBulkRequiredCoaches] = useState("");
  const normalizedBulkRequiredCoaches = bulkRequiredCoaches.trim();
  const bulkRequiredCoachesValue =
    normalizedBulkRequiredCoaches === ""
      ? null
      : Number(normalizedBulkRequiredCoaches);
  const bulkRemovesRequirement =
    bulkRequiredCoachesValue !== null &&
    Number.isInteger(bulkRequiredCoachesValue) &&
    bulkRequiredCoachesValue === 0;
  const bulkUnavailableCoachProfileIds = useMemo(() => {
    const unavailable = new Set<string>();

    for (const coach of assignableCoaches) {
      const candidateBlocks = blocks.map((block) => ({
        ...block,
        default_coach_profile_id: selectedBlockIds.has(block.id)
          ? coach.id
          : block.default_coach_profile_id,
      }));
      const hasOverlap = selectedBlocks.some((block) =>
        getUnavailableScheduleTemplateCoachBlocks({
          blocks: candidateBlocks,
          targetBlock: {
            day_of_week: block.day_of_week,
            end_time: block.end_time,
            id: block.id,
            start_time: block.start_time,
          },
        }).some((unavailableBlock) => unavailableBlock.coachProfileId === coach.id),
      );

      if (hasOverlap) {
        unavailable.add(coach.id);
      }
    }

    return unavailable;
  }, [assignableCoaches, blocks, selectedBlockIds, selectedBlocks]);

  return (
    <form
      action={updateScheduleTemplateBlocksBulk}
      className="grid gap-4 sm:grid-cols-2"
    >
      <input name="organizationId" type="hidden" value={organizationId} />
      <input name="day" type="hidden" value={String(selectedDay)} />
      <input name="templateId" type="hidden" value={templateId} />
      <input name="view" type="hidden" value={view} />
      <input name="weekStart" type="hidden" value={weekStart} />
      {selectedBlocks.map((block) => (
        <input
          key={block.id}
          name="templateBlockIds"
          type="hidden"
          value={block.id}
        />
      ))}

      {templateCenterId ? (
        <label className="grid min-w-0 gap-2">
          <span className="text-sm font-medium">Centro</span>
          <CenterReadOnlyField center={templateCenter} />
          <span className="text-xs leading-5 text-muted-foreground">
            El centro lo marca el alcance de la plantilla.
          </span>
        </label>
      ) : (
        <label className="grid min-w-0 gap-2">
          <span className="text-sm font-medium">Centro</span>
          <BulkCenterSelect centers={centers} />
        </label>
      )}

      <label className="grid min-w-0 gap-2">
        <span className="text-sm font-medium">Entrenador por defecto</span>
        <BulkCoachSelect
          coaches={assignableCoaches}
          disabledByNoRequirement={bulkRemovesRequirement}
          unavailableCoachProfileIds={bulkUnavailableCoachProfileIds}
        />
        {bulkUnavailableCoachProfileIds.size > 0 && !bulkRemovesRequirement ? (
          <span className="text-xs leading-5 text-muted-foreground">
            Los entrenadores ocupados se desactivan para esta selección.
          </span>
        ) : null}
      </label>

      <label className="grid min-w-0 gap-2">
        <span className="text-sm font-medium">Entrenadores necesarios</span>
        <Input
          max="20"
          min="0"
          name="requiredCoaches"
          onChange={(event) => setBulkRequiredCoaches(event.currentTarget.value)}
          placeholder="Sin cambios"
          type="number"
          value={bulkRequiredCoaches}
        />
      </label>

      <label className="grid min-w-0 gap-2">
        <span className="text-sm font-medium">Qué hacer con las notas</span>
        <select className={selectClassName()} defaultValue="keep" name="notesMode">
          <option value="keep">Mantener notas actuales</option>
          <option value="replace">Reemplazar por estas notas</option>
          <option value="clear">Borrar notas</option>
        </select>
      </label>

      <label className="grid min-w-0 gap-2 sm:col-span-2">
        <span className="text-sm font-medium">Notas comunes</span>
        <Textarea
          maxLength={1000}
          name="notes"
          placeholder="Solo se aplican si eliges reemplazar notas"
        />
      </label>

      <div className="flex flex-wrap items-end gap-2 sm:col-span-2">
        <Button type="submit">
          <Save aria-hidden="true" />
          Aplicar a {selectedBlocks.length} bloque
          {selectedBlocks.length === 1 ? "" : "s"}
        </Button>
        <TemplateBlockDeleteSubmit
          blockCount={selectedBlocks.length}
          formAction={deleteScheduleTemplateBlocksBulk}
        />
        <Button onClick={onCancel} type="button" variant="outline">
          <X aria-hidden="true" />
          Cerrar
        </Button>
      </div>
    </form>
  );
}

function TemplateBlockCard({
  block,
  centersById,
  classTypesById,
  coachDisplaysById,
  closeHref,
  editHref,
  isEditing,
  isSelected,
  onEdit,
  onToggleSelected,
}: {
  block: ScheduleTemplateBlockRow;
  centersById: Map<string, CenterRow>;
  classTypesById: Map<string, ClassTypeRow>;
  coachDisplaysById: Map<string, CoachDisplay>;
  closeHref: string;
  editHref: string;
  isEditing: boolean;
  isSelected: boolean;
  onEdit: () => void;
  onToggleSelected: () => void;
}) {
  const defaultCoach = block.default_coach_profile_id
    ? coachDisplaysById.get(block.default_coach_profile_id)
    : null;
  const center = centersById.get(block.center_id);
  const classType = classTypesById.get(block.class_type_id);
  const requiresCoach = scheduleTemplateBlockRequiresCoach(
    block.required_coaches,
  );
  const defaultCoachLabel = getScheduleTemplateDefaultCoachLabel({
    defaultCoachLabel: defaultCoach?.label,
    requiredCoaches: block.required_coaches,
  });
  const defaultCoachDetail = getScheduleTemplateDefaultCoachDetail({
    defaultCoachLabel: defaultCoach?.label,
    requiredCoaches: block.required_coaches,
  });

  return (
    <div
      className={cn(
        "min-w-0 overflow-hidden rounded-md border border-border bg-background px-2.5 py-2.5 text-xs",
        "min-h-[9.25rem] transition-colors",
        isEditing ? "ring-2 ring-ring/30" : "",
      )}
      style={getClassTypeCardStyle(classType?.color ?? null)}
    >
      <div className="flex min-w-0 items-center justify-between gap-2">
        <p className="min-w-0 truncate font-mono text-[11px] font-medium text-muted-foreground">
          {formatTime(block.start_time)} - {formatTime(block.end_time)}
        </p>
        <Badge
          className="h-5 max-w-24 shrink-0 px-1.5 text-[11px]"
          variant={requiresCoach && defaultCoach ? "secondary" : "outline"}
        >
          {requiresCoach && defaultCoach ? "Asignado" : defaultCoachLabel}
        </Badge>
      </div>

      <h4 className="mt-2 flex min-w-0 items-start gap-1.5 text-xs font-semibold leading-snug tracking-tight">
        <input
          aria-label={`Seleccionar bloque ${formatTime(block.start_time)} ${
            classType?.name ?? ""
          }`}
          checked={isSelected}
          className="mt-0.5 size-4 shrink-0 rounded border-border accent-primary"
          onChange={onToggleSelected}
          type="checkbox"
        />
        <ColorSwatch color={classType?.color ?? null} />
        <span className="min-w-0 break-words">
          {classType?.name ?? "Tipo no disponible"}
        </span>
      </h4>

      <div className="mt-1.5 grid min-w-0 gap-0.5 text-[11px] leading-5 text-muted-foreground">
        <p className="truncate">
          <span className="font-medium text-foreground">
            {center?.name ?? "Centro no disponible"}
          </span>
        </p>
        <p>{getScheduleTemplateRequiredCoachesLabel(block.required_coaches)}</p>
        {requiresCoach ? (
          <p className="truncate">{defaultCoachDetail}</p>
        ) : null}
      </div>

      <Button
        asChild
        className="mt-2 h-6 w-full min-w-0 justify-center px-2 text-xs"
        size="xs"
        variant={isEditing ? "secondary" : "outline"}
      >
        <RouteStateLink
          data-template-block-edit-trigger="true"
          href={isEditing ? closeHref : editHref}
          onClick={onEdit}
        >
          {isEditing ? <X aria-hidden="true" /> : <Pencil aria-hidden="true" />}
          {isEditing ? "Cerrar" : "Editar"}
        </RouteStateLink>
      </Button>
    </div>
  );
}

function AgendaBlockRow({
  block,
  centersById,
  classTypesById,
  coachDisplaysById,
  closeHref,
  editHref,
  isEditing,
  isSelected,
  onEdit,
  onToggleSelected,
}: {
  block: ScheduleTemplateBlockRow;
  centersById: Map<string, CenterRow>;
  classTypesById: Map<string, ClassTypeRow>;
  coachDisplaysById: Map<string, CoachDisplay>;
  closeHref: string;
  editHref: string;
  isEditing: boolean;
  isSelected: boolean;
  onEdit: () => void;
  onToggleSelected: () => void;
}) {
  const defaultCoach = block.default_coach_profile_id
    ? coachDisplaysById.get(block.default_coach_profile_id)
    : null;
  const center = centersById.get(block.center_id);
  const classType = classTypesById.get(block.class_type_id);
  const requiresCoach = scheduleTemplateBlockRequiresCoach(
    block.required_coaches,
  );
  const defaultCoachLabel = getScheduleTemplateDefaultCoachLabel({
    defaultCoachLabel: defaultCoach?.label,
    requiredCoaches: block.required_coaches,
  });
  const defaultCoachDetail = getScheduleTemplateDefaultCoachDetail({
    defaultCoachLabel: defaultCoach?.label,
    requiredCoaches: block.required_coaches,
  });

  return (
    <div
      className={cn(
        "space-y-4 rounded-lg border border-border p-4",
        isEditing ? "ring-2 ring-ring/30" : "",
      )}
      style={getClassTypeCardStyle(classType?.color ?? null)}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <input
            aria-label={`Seleccionar bloque de ${getScheduleTemplateDayLabel(
              block.day_of_week,
            )} ${formatTime(block.start_time)}`}
            checked={isSelected}
            className="mt-1 size-4 shrink-0 rounded border-border accent-primary"
            onChange={onToggleSelected}
            type="checkbox"
          />
          <div className="min-w-0 space-y-1">
            <h4 className="text-sm font-medium">
              {getScheduleTemplateDayLabel(block.day_of_week)} /{" "}
              {formatTime(block.start_time)} - {formatTime(block.end_time)}
            </h4>
            <p className="text-sm text-muted-foreground">
              {getScheduleTemplateRequiredCoachesLabel(block.required_coaches)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Badge variant={requiresCoach && defaultCoach ? "secondary" : "outline"}>
            {requiresCoach && defaultCoach
              ? `Por defecto: ${defaultCoach.label}`
              : defaultCoachLabel}
          </Badge>
          <Button
            asChild
            size="sm"
            variant={isEditing ? "secondary" : "outline"}
          >
            <RouteStateLink
              data-template-block-edit-trigger="true"
              href={isEditing ? closeHref : editHref}
              onClick={onEdit}
            >
              {isEditing ? <X aria-hidden="true" /> : <Pencil aria-hidden="true" />}
              {isEditing ? "Cerrar" : "Editar"}
            </RouteStateLink>
          </Button>
        </div>
      </div>

      <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div className="min-w-0">
          <dt className="text-muted-foreground">Centro</dt>
          <dd className="mt-1 truncate font-medium">
            {center?.name ?? "Centro no disponible"}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-muted-foreground">Actividad</dt>
          <dd className="mt-1 flex min-w-0 items-center gap-2 font-medium">
            <ColorSwatch color={classType?.color ?? null} />
            <span className="truncate">
              {classType?.name ?? "Tipo no disponible"}
            </span>
          </dd>
        </div>
        {requiresCoach ? (
          <div className="min-w-0">
            <dt className="text-muted-foreground">Entrenador por defecto</dt>
            <dd className="mt-1 truncate font-medium">
              {defaultCoachDetail}
            </dd>
          </div>
        ) : null}
        <div className="min-w-0">
          <dt className="text-muted-foreground">Notas</dt>
          <dd className="mt-1 whitespace-pre-wrap break-words">
            {block.notes || "Sin notas"}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function DesktopEditPanel({
  assignableCoaches,
  block,
  blocks,
  centers,
  classTypes,
  classTypesById,
  coachDisplaysById,
  onClose,
  organizationId,
  selectedDay,
  templateCenterId,
  view,
  weekStart,
}: {
  assignableCoaches: CoachDisplay[];
  block: ScheduleTemplateBlockRow;
  blocks: ScheduleTemplateBlockRow[];
  centers: CenterRow[];
  classTypes: ClassTypeRow[];
  classTypesById: Map<string, ClassTypeRow>;
  coachDisplaysById: Map<string, CoachDisplay>;
  onClose: () => void;
  organizationId: string;
  selectedDay: TemplateDay;
  templateCenterId?: string | null;
  view: TemplateView;
  weekStart: string;
}) {
  const classType = classTypesById.get(block.class_type_id);

  return (
    <aside
      className="fixed inset-0 z-50 hidden md:block"
      data-template-block-edit-panel="true"
    >
      <button
        aria-label="Cerrar editor"
        className="absolute inset-0 z-0 block cursor-default bg-foreground/20 backdrop-blur-sm"
        onClick={onClose}
        type="button"
      />
      <div className="relative z-10 ml-auto flex h-full w-full max-w-2xl flex-col overflow-y-auto bg-background shadow-xl ring-1 ring-border">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border bg-background/95 px-4 py-4 backdrop-blur">
          <div className="min-w-0 space-y-1">
            <Badge variant="outline">
              {getScheduleTemplateDayLabel(block.day_of_week)}
            </Badge>
            <h2 className="truncate text-lg font-semibold tracking-tight">
              {classType?.name ?? "Bloque de plantilla"}
            </h2>
            <p className="truncate text-sm text-muted-foreground">
              {formatTime(block.start_time)} - {formatTime(block.end_time)}
            </p>
          </div>
          <Button
            aria-label="Cerrar editor"
            onClick={onClose}
            size="icon"
            type="button"
            variant="ghost"
          >
            <X aria-hidden="true" />
          </Button>
        </div>

        <div className="space-y-4 p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
          <TemplateBlockEditForm
            assignableCoaches={assignableCoaches}
            block={block}
            blocks={blocks}
            centers={centers}
            classTypes={classTypes}
            coachDisplaysById={coachDisplaysById}
            key={block.id}
            onCancel={onClose}
            organizationId={organizationId}
            selectedDay={selectedDay}
            templateCenterId={templateCenterId}
            view={view}
            weekStart={weekStart}
          />
        </div>
      </div>
    </aside>
  );
}

function TemplateBlockFilters({
  assignmentFilter,
  classTypeFilter,
  classTypes,
  filteredBlockCount,
  filtersOpen,
  hasActiveFilters,
  onAssignmentFilterChange,
  onClassTypeFilterChange,
  onClearFilters,
  onFiltersOpenChange,
  totalBlockCount,
}: {
  assignmentFilter: AssignmentFilter;
  classTypeFilter: string;
  classTypes: ClassTypeRow[];
  filteredBlockCount: number;
  filtersOpen: boolean;
  hasActiveFilters: boolean;
  onAssignmentFilterChange: (value: AssignmentFilter) => void;
  onClassTypeFilterChange: (value: string) => void;
  onClearFilters: () => void;
  onFiltersOpenChange: (value: boolean) => void;
  totalBlockCount: number;
}) {
  return (
    <details
      className="group rounded-lg border border-border bg-background"
      onToggle={(event) =>
        onFiltersOpenChange(event.currentTarget.open)
      }
      open={filtersOpen}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-3 outline-none transition-colors hover:bg-muted/35 focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
        <div className="flex min-w-0 items-start gap-2">
          <ListFilter
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
          />
          <div className="min-w-0">
            <span className="block text-sm font-semibold tracking-tight">
              Filtros de bloques
            </span>
            <span className="mt-1 block truncate text-sm text-muted-foreground">
              {hasActiveFilters
                ? `${filteredBlockCount} de ${totalBlockCount} visibles`
                : "Filtra por vacantes o tipo de actividad cuando lo necesites."}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {hasActiveFilters ? (
            <Badge variant="secondary">
              {filteredBlockCount}/{totalBlockCount}
            </Badge>
          ) : null}
          <span className="rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium">
            <span className="group-open:hidden">Mostrar</span>
            <span className="hidden group-open:inline">Ocultar</span>
          </span>
        </div>
      </summary>

      <div className="grid gap-3 border-t border-border px-3 py-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto]">
        <label className="grid min-w-0 gap-2">
          <span className="text-sm font-medium">Asignación</span>
          <select
            className={selectClassName()}
            onChange={(event) =>
              onAssignmentFilterChange(
                event.currentTarget.value as AssignmentFilter,
              )
            }
            value={assignmentFilter}
          >
            <option value="all">Todos los bloques</option>
            <option value="unassigned">Sin asignar</option>
            <option value="assigned">Asignados</option>
          </select>
        </label>

        <label className="grid min-w-0 gap-2">
          <span className="text-sm font-medium">Tipo de actividad</span>
          <select
            className={selectClassName()}
            onChange={(event) =>
              onClassTypeFilterChange(event.currentTarget.value)
            }
            value={classTypeFilter}
          >
            <option value="all">Todos los tipos</option>
            {classTypes.map((classType) => (
              <option key={classType.id} value={classType.id}>
                {classType.name}
                {classType.status === "inactive" ? " (inactivo)" : ""}
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-end">
          <Button
            disabled={!hasActiveFilters}
            onClick={onClearFilters}
            type="button"
            variant="outline"
          >
            <X aria-hidden="true" />
            Limpiar
          </Button>
        </div>
      </div>
    </details>
  );
}

export function TemplateBlocksEditor({
  assignableCoaches,
  blocks,
  centers,
  classTypes,
  coachDisplays,
  initialEditBlockId,
  initialSelectedDay,
  mode,
  organizationId,
  templateCenterId,
  view,
  weekStart,
}: {
  assignableCoaches: CoachDisplay[];
  blocks: ScheduleTemplateBlockRow[];
  centers: CenterRow[];
  classTypes: ClassTypeRow[];
  coachDisplays: CoachDisplay[];
  initialEditBlockId?: string | null;
  initialSelectedDay: TemplateDay;
  mode: TemplateView;
  organizationId: string;
  templateCenterId?: string | null;
  view: TemplateView;
  weekStart: string;
}) {
  const [activeDay, setActiveDay] = useState<TemplateDay>(initialSelectedDay);
  const [assignmentFilter, setAssignmentFilter] =
    useState<AssignmentFilter>("all");
  const [bulkEditorOpen, setBulkEditorOpen] = useState(false);
  const [classTypeFilter, setClassTypeFilter] = useState("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedBlockIds, setSelectedBlockIds] = useState<Set<string>>(
    () => new Set(),
  );
  const classTypeIdsWithBlocks = useMemo(
    () => new Set(blocks.map((block) => block.class_type_id)),
    [blocks],
  );
  const filterableClassTypes = useMemo(
    () => classTypes.filter((classType) => classTypeIdsWithBlocks.has(classType.id)),
    [classTypeIdsWithBlocks, classTypes],
  );
  const filteredBlocks = useMemo(
    () =>
      filterTemplateBlocks({
        assignmentFilter,
        blocks,
        classTypeFilter,
      }),
    [assignmentFilter, blocks, classTypeFilter],
  );
  const hasActiveFilters =
    assignmentFilter !== "all" || classTypeFilter !== "all";
  const validBlockIds = useMemo(
    () => filteredBlocks.map((block) => block.id),
    [filteredBlocks],
  );
  const routeEditBlockId = useRouteQueryParam({
    initialValue: initialEditBlockId ?? null,
    paramName: "edit_block_id",
    validValues: validBlockIds,
  });
  const selectedBlockId = routeEditBlockId;
  const blocksByDay = useMemo(
    () => groupTemplateBlocksByDay(filteredBlocks),
    [filteredBlocks],
  );
  const centersById = useMemo(
    () => new Map(centers.map((center) => [center.id, center])),
    [centers],
  );
  const classTypesById = useMemo(
    () => new Map(classTypes.map((classType) => [classType.id, classType])),
    [classTypes],
  );
  const coachDisplaysById = useMemo(
    () => new Map(coachDisplays.map((coach) => [coach.id, coach])),
    [coachDisplays],
  );
  const selectedBlock = selectedBlockId
    ? filteredBlocks.find((block) => block.id === selectedBlockId) ?? null
    : null;
  const selectedBlocks = useMemo(
    () => filteredBlocks.filter((block) => selectedBlockIds.has(block.id)),
    [filteredBlocks, selectedBlockIds],
  );
  const displayedDay = selectedBlock
    ? (selectedBlock.day_of_week as TemplateDay)
    : activeDay;

  function getEditorHref(block: ScheduleTemplateBlockRow) {
    return getScheduleTemplatesPath({
      day: String(block.day_of_week),
      editTemplateBlockId: block.id,
      organizationId,
      view,
      week: weekStart,
    });
  }

  function getCloseHref(day: TemplateDay = displayedDay) {
    return getScheduleTemplatesPath({
      day: String(day),
      organizationId,
      view,
      week: weekStart,
    });
  }

  function toggleBlock(block: ScheduleTemplateBlockRow) {
    setActiveDay(block.day_of_week as TemplateDay);
    setBulkEditorOpen(false);
  }

  function closeEditorForDay(day: TemplateDay = displayedDay) {
    pushRouteStateHref(getCloseHref(day), true);
  }

  function closeEditor() {
    closeEditorForDay();
  }

  function toggleSelectedBlock(blockId: string) {
    const shouldCloseBulkEditor =
      selectedBlockIds.has(blockId) && selectedBlockIds.size === 1;

    setSelectedBlockIds((current) => {
      const next = new Set(current);

      if (next.has(blockId)) {
        next.delete(blockId);
      } else {
        next.add(blockId);
      }

      return next;
    });

    if (shouldCloseBulkEditor) {
      setBulkEditorOpen(false);
    }
  }

  function clearSelection() {
    setSelectedBlockIds(new Set());
    setBulkEditorOpen(false);
  }

  function pruneSelectionForFilters({
    nextAssignmentFilter,
    nextClassTypeFilter,
  }: {
    nextAssignmentFilter: AssignmentFilter;
    nextClassTypeFilter: string;
  }) {
    if (selectedBlockIds.size === 0) {
      return;
    }

    const nextVisibleBlockIds = new Set(
      filterTemplateBlocks({
        assignmentFilter: nextAssignmentFilter,
        blocks,
        classTypeFilter: nextClassTypeFilter,
      }).map((block) => block.id),
    );
    const nextSelectedBlockIds = new Set(
      [...selectedBlockIds].filter((blockId) =>
        nextVisibleBlockIds.has(blockId),
      ),
    );

    if (nextSelectedBlockIds.size !== selectedBlockIds.size) {
      setSelectedBlockIds(nextSelectedBlockIds);
    }

    if (nextSelectedBlockIds.size === 0) {
      setBulkEditorOpen(false);
    }
  }

  function updateAssignmentFilter(value: AssignmentFilter) {
    setAssignmentFilter(value);
    pruneSelectionForFilters({
      nextAssignmentFilter: value,
      nextClassTypeFilter: classTypeFilter,
    });
  }

  function updateClassTypeFilter(value: string) {
    setClassTypeFilter(value);
    pruneSelectionForFilters({
      nextAssignmentFilter: assignmentFilter,
      nextClassTypeFilter: value,
    });
  }

  function clearFilters() {
    setAssignmentFilter("all");
    setClassTypeFilter("all");
  }

  const filterPanel = (
    <TemplateBlockFilters
      assignmentFilter={assignmentFilter}
      classTypeFilter={classTypeFilter}
      classTypes={filterableClassTypes}
      filteredBlockCount={filteredBlocks.length}
      filtersOpen={filtersOpen}
      hasActiveFilters={hasActiveFilters}
      onAssignmentFilterChange={updateAssignmentFilter}
      onClassTypeFilterChange={updateClassTypeFilter}
      onClearFilters={clearFilters}
      onFiltersOpenChange={setFiltersOpen}
      totalBlockCount={blocks.length}
    />
  );

  const bulkSelectionPanel =
    selectedBlocks.length > 0 ? (
      <div className="space-y-3 rounded-lg border border-border bg-background px-3 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">
              {selectedBlocks.length} bloque
              {selectedBlocks.length === 1 ? "" : "s"} seleccionado
              {selectedBlocks.length === 1 ? "" : "s"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Edición masiva limitada a entrenador, notas
              {templateCenterId ? "" : ", centro"} y entrenadores necesarios.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => {
                closeEditor();
                setBulkEditorOpen((current) => !current);
              }}
              type="button"
              variant={bulkEditorOpen ? "secondary" : "default"}
            >
              <Pencil aria-hidden="true" />
              {bulkEditorOpen ? "Ocultar edición" : "Editar selección"}
            </Button>
            <Button onClick={clearSelection} type="button" variant="outline">
              Limpiar
            </Button>
          </div>
        </div>
        {bulkEditorOpen ? (
          <div className="border-t border-border pt-3">
            <TemplateBlocksBulkEditForm
              assignableCoaches={assignableCoaches}
              blocks={blocks}
              centers={centers}
              onCancel={() => setBulkEditorOpen(false)}
              organizationId={organizationId}
              selectedBlocks={selectedBlocks}
              selectedDay={displayedDay}
              templateCenterId={templateCenterId}
              view={view}
              weekStart={weekStart}
            />
          </div>
        ) : null}
      </div>
    ) : null;

  if (mode === "agenda") {
    return (
      <div className="grid gap-3">
        {filterPanel}
        {bulkSelectionPanel}
        {selectedBlock ? (
          <DesktopEditPanel
            assignableCoaches={assignableCoaches}
            block={selectedBlock}
            blocks={blocks}
            centers={centers}
            classTypes={classTypes}
            classTypesById={classTypesById}
            coachDisplaysById={coachDisplaysById}
            onClose={closeEditor}
            organizationId={organizationId}
            selectedDay={selectedBlock.day_of_week as TemplateDay}
            templateCenterId={templateCenterId}
            view={view}
            weekStart={weekStart}
          />
        ) : null}

        {filteredBlocks.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-background/70 px-4 py-6 text-sm text-muted-foreground">
            No hay bloques con estos filtros.
          </div>
        ) : null}

        {filteredBlocks.map((block) => {
          const isEditing = selectedBlockId === block.id;

          return (
            <div className="space-y-3" key={block.id}>
              <AgendaBlockRow
                block={block}
                centersById={centersById}
                classTypesById={classTypesById}
                closeHref={getCloseHref(block.day_of_week as TemplateDay)}
                coachDisplaysById={coachDisplaysById}
                editHref={getEditorHref(block)}
                isEditing={isEditing}
                isSelected={selectedBlockIds.has(block.id)}
                onEdit={() => toggleBlock(block)}
                onToggleSelected={() => toggleSelectedBlock(block.id)}
              />
              {isEditing ? (
                <div
                  className="rounded-lg border border-border bg-muted/25 p-4 md:hidden"
                  data-template-block-edit-panel="true"
                >
                  <TemplateBlockEditForm
                    assignableCoaches={assignableCoaches}
                    block={block}
                    blocks={blocks}
                    centers={centers}
                    classTypes={classTypes}
                    coachDisplaysById={coachDisplaysById}
                    onCancel={closeEditor}
                    organizationId={organizationId}
                    selectedDay={block.day_of_week as TemplateDay}
                    templateCenterId={templateCenterId}
                    view={view}
                    weekStart={weekStart}
                  />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  }

  const activeDayBlocks = blocksByDay.get(displayedDay) ?? [];

  return (
    <div className="space-y-3">
      {filterPanel}
      {bulkSelectionPanel}
      {selectedBlock ? (
        <DesktopEditPanel
          assignableCoaches={assignableCoaches}
          block={selectedBlock}
          blocks={blocks}
          centers={centers}
          classTypes={classTypes}
          classTypesById={classTypesById}
          coachDisplaysById={coachDisplaysById}
          onClose={closeEditor}
          organizationId={organizationId}
          selectedDay={displayedDay}
          templateCenterId={templateCenterId}
          view={view}
          weekStart={weekStart}
        />
      ) : null}

      <div className="md:hidden">
        <div className="grid grid-cols-7 gap-1.5">
          {SCHEDULE_TEMPLATE_DAYS.map((day) => {
            const dayBlocks = blocksByDay.get(day) ?? [];
            const active = displayedDay === day;

            return (
              <button
                aria-current={active ? "date" : undefined}
                aria-label={`${getScheduleTemplateDayLabel(day)}. ${
                  dayBlocks.length
                } bloque${dayBlocks.length === 1 ? "" : "s"}`}
                className={cn(
                  "flex h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl border text-center outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
                  active
                    ? "border-primary/60 bg-primary/15 text-primary shadow-sm ring-1 ring-primary/20"
                    : "border-border bg-card text-foreground hover:bg-muted/45",
                )}
                key={day}
                onClick={() => {
                  setActiveDay(day);
                  closeEditorForDay(day);
                }}
                type="button"
              >
                <span className="text-sm font-semibold">
                  {templateDayShortLabels[day]}
                </span>
                <span className="font-mono text-xs font-medium leading-none text-muted-foreground">
                  {dayBlocks.length}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <section className="space-y-3 md:hidden">
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-base font-semibold tracking-tight">
            {getScheduleTemplateDayLabel(displayedDay)}
          </h4>
          <Badge variant="outline">
            {activeDayBlocks.length} bloque
            {activeDayBlocks.length === 1 ? "" : "s"}
          </Badge>
        </div>

        {activeDayBlocks.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-background/70 px-4 py-6 text-sm text-muted-foreground">
            {hasActiveFilters ? "Sin bloques con estos filtros." : "Sin bloques."}
          </div>
        ) : (
          <div className="grid gap-2">
            {activeDayBlocks.map((block) => {
              const isEditing = selectedBlockId === block.id;

              return (
                <div className="space-y-3" key={block.id}>
                  <TemplateBlockCard
                    block={block}
                    centersById={centersById}
                    classTypesById={classTypesById}
                    closeHref={getCloseHref(block.day_of_week as TemplateDay)}
                    coachDisplaysById={coachDisplaysById}
                    editHref={getEditorHref(block)}
                    isEditing={isEditing}
                    isSelected={selectedBlockIds.has(block.id)}
                    onEdit={() => toggleBlock(block)}
                    onToggleSelected={() => toggleSelectedBlock(block.id)}
                  />
                  {isEditing ? (
                    <div
                      className="rounded-lg border border-border bg-muted/25 p-4"
                      data-template-block-edit-panel="true"
                    >
                      <TemplateBlockEditForm
                        assignableCoaches={assignableCoaches}
                        block={block}
                        blocks={blocks}
                        centers={centers}
                        classTypes={classTypes}
                        coachDisplaysById={coachDisplaysById}
                        onCancel={closeEditor}
                        organizationId={organizationId}
                        selectedDay={displayedDay}
                        templateCenterId={templateCenterId}
                        view={view}
                        weekStart={weekStart}
                      />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className="hidden overflow-x-auto rounded-lg border border-border bg-muted/20 md:block">
        <div className="grid min-w-[1120px] grid-cols-7 divide-x divide-border">
          {SCHEDULE_TEMPLATE_DAYS.map((day) => {
            const dayBlocks = blocksByDay.get(day) ?? [];

            return (
              <section className="min-w-0 scroll-mt-24" key={day}>
                <div className="border-b border-border bg-background px-3 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-sm font-semibold tracking-tight">
                      {getScheduleTemplateDayLabel(day)}
                    </h4>
                    <Badge variant="outline">{dayBlocks.length}</Badge>
                  </div>
                </div>

                {dayBlocks.length === 0 ? (
                  <div className="p-2">
                    <div className="rounded-lg border border-dashed border-border bg-background/70 px-3 py-5 text-sm text-muted-foreground">
                      {hasActiveFilters
                        ? "Sin bloques con estos filtros."
                        : "Sin bloques."}
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-2 p-2">
                    {dayBlocks.map((block) => (
                      <TemplateBlockCard
                        block={block}
                        centersById={centersById}
                        classTypesById={classTypesById}
                        closeHref={getCloseHref(block.day_of_week as TemplateDay)}
                        coachDisplaysById={coachDisplaysById}
                        editHref={getEditorHref(block)}
                        isEditing={selectedBlockId === block.id}
                        key={block.id}
                        isSelected={selectedBlockIds.has(block.id)}
                        onEdit={() => toggleBlock(block)}
                        onToggleSelected={() => toggleSelectedBlock(block.id)}
                      />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
