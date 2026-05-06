"use client";

import { useMemo, useState } from "react";
import { Pencil, Save, X } from "lucide-react";

import { updateScheduleTemplateBlock } from "./actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatTimeForInput } from "@/lib/schedule-blocks";
import {
  SCHEDULE_TEMPLATE_DAYS,
  getScheduleTemplateDayLabel,
} from "@/lib/schedule-templates";
import { cn } from "@/lib/utils";
import type { Tables } from "@/types/supabase";

type TemplateDay = (typeof SCHEDULE_TEMPLATE_DAYS)[number];
type TemplateView = "agenda" | "week";

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
    "h-11 w-full rounded-md border border-input bg-transparent px-2.5 text-sm md:h-9",
    "outline-none transition-colors focus-visible:border-ring",
    "focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
    className,
  );
}

function formatTime(value: string) {
  return formatTimeForInput(value) || value;
}

function getSafeColor(value: string | null) {
  return value && /^#[0-9a-f]{6}$/i.test(value) ? value : null;
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
}: {
  coaches: CoachDisplay[];
  defaultValue?: string | null;
}) {
  return (
    <select
      className={selectClassName()}
      defaultValue={defaultValue ?? "none"}
      name="defaultCoachProfileId"
    >
      <option value="none">Sin coach por defecto (vacante)</option>
      {coaches.map((coach) => (
        <option key={coach.id} value={coach.id}>
          {coach.label}
          {coach.isFallback ? " (sin perfil visible)" : ""}
        </option>
      ))}
    </select>
  );
}

function DaySelect({ defaultValue }: { defaultValue?: number }) {
  return (
    <select
      className={selectClassName()}
      defaultValue={defaultValue ?? 1}
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

function TemplateBlockEditForm({
  assignableCoaches,
  block,
  centers,
  classTypes,
  onCancel,
  organizationId,
  selectedDay,
  view,
  weekStart,
}: {
  assignableCoaches: CoachDisplay[];
  block: ScheduleTemplateBlockRow;
  centers: CenterRow[];
  classTypes: ClassTypeRow[];
  onCancel: () => void;
  organizationId: string;
  selectedDay: TemplateDay;
  view: TemplateView;
  weekStart: string;
}) {
  return (
    <form action={updateScheduleTemplateBlock} className="grid gap-4 lg:grid-cols-6">
      <input name="organizationId" type="hidden" value={organizationId} />
      <input name="day" type="hidden" value={String(selectedDay)} />
      <input name="templateId" type="hidden" value={block.template_id} />
      <input name="templateBlockId" type="hidden" value={block.id} />
      <input name="view" type="hidden" value={view} />
      <input name="weekStart" type="hidden" value={weekStart} />

      <label className="grid gap-2">
        <span className="text-sm font-medium">Dia</span>
        <DaySelect defaultValue={block.day_of_week} />
      </label>

      <label className="grid gap-2">
        <span className="text-sm font-medium">Inicio</span>
        <Input
          defaultValue={formatTime(block.start_time)}
          name="startTime"
          required
          type="time"
        />
      </label>

      <label className="grid gap-2">
        <span className="text-sm font-medium">Fin</span>
        <Input
          defaultValue={formatTime(block.end_time)}
          name="endTime"
          required
          type="time"
        />
      </label>

      <label className="grid gap-2">
        <span className="text-sm font-medium">Centro</span>
        <CenterSelect centers={centers} defaultValue={block.center_id} />
      </label>

      <label className="grid gap-2">
        <span className="text-sm font-medium">Tipo de actividad</span>
        <ClassTypeSelect
          classTypes={classTypes}
          defaultValue={block.class_type_id}
        />
      </label>

      <label className="grid gap-2">
        <span className="text-sm font-medium">Coaches necesarios</span>
        <Input
          defaultValue={block.required_coaches}
          max="20"
          min="0"
          name="requiredCoaches"
          required
          type="number"
        />
      </label>

      <label className="grid gap-2 lg:col-span-2">
        <span className="text-sm font-medium">Coach por defecto</span>
        <CoachSelect
          coaches={assignableCoaches}
          defaultValue={block.default_coach_profile_id}
        />
        <span className="text-xs leading-5 text-muted-foreground">
          Se asignara al horario cuando apliques la plantilla.
        </span>
      </label>

      <label className="grid gap-2 lg:col-span-6">
        <span className="text-sm font-medium">Notas</span>
        <Textarea
          defaultValue={block.notes ?? ""}
          maxLength={1000}
          name="notes"
          placeholder="Notas que se copiaran al bloque real"
        />
      </label>

      <div className="flex flex-wrap items-end gap-2 lg:col-span-6">
        <Button type="submit">
          <Save aria-hidden="true" />
          Guardar bloque
        </Button>
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
  isEditing,
  onEdit,
}: {
  block: ScheduleTemplateBlockRow;
  centersById: Map<string, CenterRow>;
  classTypesById: Map<string, ClassTypeRow>;
  coachDisplaysById: Map<string, CoachDisplay>;
  isEditing: boolean;
  onEdit: () => void;
}) {
  const defaultCoach = block.default_coach_profile_id
    ? coachDisplaysById.get(block.default_coach_profile_id)
    : null;
  const center = centersById.get(block.center_id);
  const classType = classTypesById.get(block.class_type_id);

  return (
    <div
      className={cn(
        "min-w-0 overflow-hidden rounded-md border border-border bg-background px-2 py-2 text-xs",
        isEditing ? "ring-2 ring-ring/30" : "",
      )}
    >
      <div className="flex min-w-0 items-start justify-between gap-1.5">
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-[11px] font-medium text-muted-foreground">
            {formatTime(block.start_time)} - {formatTime(block.end_time)}
          </p>
          <h4 className="mt-1 flex min-w-0 items-center gap-1.5 text-xs font-semibold tracking-tight">
            <ColorSwatch color={classType?.color ?? null} />
            <span className="truncate">
              {classType?.name ?? "Tipo no disponible"}
            </span>
          </h4>
        </div>
        <Badge
          className="h-5 max-w-16 shrink-0 px-1.5 text-[11px]"
          variant={block.default_coach_profile_id ? "secondary" : "outline"}
        >
          {defaultCoach ? "Con coach" : "Vacante"}
        </Badge>
      </div>

      <div className="mt-1.5 grid min-w-0 gap-0.5 text-[11px] leading-5 text-muted-foreground">
        <p className="truncate">
          <span className="font-medium text-foreground">
            {center?.name ?? "Centro no disponible"}
          </span>
        </p>
        <p>
          {block.required_coaches} coach
          {block.required_coaches === 1 ? "" : "es"}
        </p>
        {defaultCoach ? <p className="truncate">{defaultCoach.label}</p> : null}
      </div>

      <Button
        className="mt-2 h-6 w-full min-w-0 justify-center px-2 text-xs"
        onClick={onEdit}
        size="xs"
        type="button"
        variant={isEditing ? "secondary" : "outline"}
      >
        {isEditing ? <X aria-hidden="true" /> : <Pencil aria-hidden="true" />}
        {isEditing ? "Cerrar" : "Editar"}
      </Button>
    </div>
  );
}

function AgendaBlockRow({
  block,
  centersById,
  classTypesById,
  coachDisplaysById,
  isEditing,
  onEdit,
}: {
  block: ScheduleTemplateBlockRow;
  centersById: Map<string, CenterRow>;
  classTypesById: Map<string, ClassTypeRow>;
  coachDisplaysById: Map<string, CoachDisplay>;
  isEditing: boolean;
  onEdit: () => void;
}) {
  const defaultCoach = block.default_coach_profile_id
    ? coachDisplaysById.get(block.default_coach_profile_id)
    : null;
  const center = centersById.get(block.center_id);
  const classType = classTypesById.get(block.class_type_id);

  return (
    <div
      className={cn(
        "space-y-4 rounded-lg border border-border p-4",
        isEditing ? "ring-2 ring-ring/30" : "",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h4 className="text-sm font-medium">
            {getScheduleTemplateDayLabel(block.day_of_week)} /{" "}
            {formatTime(block.start_time)} - {formatTime(block.end_time)}
          </h4>
          <p className="text-sm text-muted-foreground">
            {block.required_coaches} coach
            {block.required_coaches === 1 ? "" : "es"} necesario
            {block.required_coaches === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Badge variant={block.default_coach_profile_id ? "secondary" : "outline"}>
            {defaultCoach ? `Por defecto: ${defaultCoach.label}` : "Vacante"}
          </Badge>
          <Button
            onClick={onEdit}
            size="sm"
            type="button"
            variant={isEditing ? "secondary" : "outline"}
          >
            {isEditing ? <X aria-hidden="true" /> : <Pencil aria-hidden="true" />}
            {isEditing ? "Cerrar" : "Editar"}
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
        <div className="min-w-0">
          <dt className="text-muted-foreground">Coach por defecto</dt>
          <dd className="mt-1 truncate font-medium">
            {defaultCoach?.label ?? "Vacante"}
          </dd>
        </div>
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
  centers,
  classTypes,
  classTypesById,
  onClose,
  organizationId,
  selectedDay,
  view,
  weekStart,
}: {
  assignableCoaches: CoachDisplay[];
  block: ScheduleTemplateBlockRow;
  centers: CenterRow[];
  classTypes: ClassTypeRow[];
  classTypesById: Map<string, ClassTypeRow>;
  onClose: () => void;
  organizationId: string;
  selectedDay: TemplateDay;
  view: TemplateView;
  weekStart: string;
}) {
  const classType = classTypesById.get(block.class_type_id);

  return (
    <aside className="fixed inset-0 z-50 hidden md:block">
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
            centers={centers}
            classTypes={classTypes}
            onCancel={onClose}
            organizationId={organizationId}
            selectedDay={selectedDay}
            view={view}
            weekStart={weekStart}
          />
        </div>
      </div>
    </aside>
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
  view: TemplateView;
  weekStart: string;
}) {
  const [activeDay, setActiveDay] = useState<TemplateDay>(initialSelectedDay);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(
    initialEditBlockId && blocks.some((block) => block.id === initialEditBlockId)
      ? initialEditBlockId
      : null,
  );
  const blocksByDay = useMemo(() => groupTemplateBlocksByDay(blocks), [blocks]);
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
    ? blocks.find((block) => block.id === selectedBlockId) ?? null
    : null;

  function toggleBlock(block: ScheduleTemplateBlockRow) {
    setSelectedBlockId((current) => (current === block.id ? null : block.id));
  }

  function closeEditor() {
    setSelectedBlockId(null);
  }

  if (mode === "agenda") {
    return (
      <div className="grid gap-3">
        {selectedBlock ? (
          <DesktopEditPanel
            assignableCoaches={assignableCoaches}
            block={selectedBlock}
            centers={centers}
            classTypes={classTypes}
            classTypesById={classTypesById}
            onClose={closeEditor}
            organizationId={organizationId}
            selectedDay={selectedBlock.day_of_week as TemplateDay}
            view={view}
            weekStart={weekStart}
          />
        ) : null}

        {blocks.map((block) => {
          const isEditing = selectedBlockId === block.id;

          return (
            <div className="space-y-3" key={block.id}>
              <AgendaBlockRow
                block={block}
                centersById={centersById}
                classTypesById={classTypesById}
                coachDisplaysById={coachDisplaysById}
                isEditing={isEditing}
                onEdit={() => toggleBlock(block)}
              />
              {isEditing ? (
                <div className="rounded-lg border border-border bg-muted/25 p-4 md:hidden">
                  <TemplateBlockEditForm
                    assignableCoaches={assignableCoaches}
                    block={block}
                    centers={centers}
                    classTypes={classTypes}
                    onCancel={closeEditor}
                    organizationId={organizationId}
                    selectedDay={block.day_of_week as TemplateDay}
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

  const activeDayBlocks = blocksByDay.get(activeDay) ?? [];

  return (
    <div className="space-y-3">
      {selectedBlock ? (
        <DesktopEditPanel
          assignableCoaches={assignableCoaches}
          block={selectedBlock}
          centers={centers}
          classTypes={classTypes}
          classTypesById={classTypesById}
          onClose={closeEditor}
          organizationId={organizationId}
          selectedDay={activeDay}
          view={view}
          weekStart={weekStart}
        />
      ) : null}

      <div className="md:hidden">
        <div className="grid grid-cols-7 gap-1.5">
          {SCHEDULE_TEMPLATE_DAYS.map((day) => {
            const dayBlocks = blocksByDay.get(day) ?? [];
            const active = activeDay === day;

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
                  closeEditor();
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
            {getScheduleTemplateDayLabel(activeDay)}
          </h4>
          <Badge variant="outline">
            {activeDayBlocks.length} bloque
            {activeDayBlocks.length === 1 ? "" : "s"}
          </Badge>
        </div>

        {activeDayBlocks.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-background/70 px-4 py-6 text-sm text-muted-foreground">
            Sin bloques.
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
                    coachDisplaysById={coachDisplaysById}
                    isEditing={isEditing}
                    onEdit={() => toggleBlock(block)}
                  />
                  {isEditing ? (
                    <div className="rounded-lg border border-border bg-muted/25 p-4">
                      <TemplateBlockEditForm
                        assignableCoaches={assignableCoaches}
                        block={block}
                        centers={centers}
                        classTypes={classTypes}
                        onCancel={closeEditor}
                        organizationId={organizationId}
                        selectedDay={activeDay}
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
                      Sin bloques.
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-2 p-2">
                    {dayBlocks.map((block) => (
                      <TemplateBlockCard
                        block={block}
                        centersById={centersById}
                        classTypesById={classTypesById}
                        coachDisplaysById={coachDisplaysById}
                        isEditing={selectedBlockId === block.id}
                        key={block.id}
                        onEdit={() => toggleBlock(block)}
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
