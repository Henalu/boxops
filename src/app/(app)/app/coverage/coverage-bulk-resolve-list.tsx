"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { CheckSquare, MoreHorizontal, Save, Square, X } from "lucide-react";

import { updateSelectedCoverageBlocks } from "./actions";
import { RouteStateButton } from "@/components/features/route-state-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getUnavailableScheduleCoachAssignments } from "@/lib/schedule-blocks";

type Tone =
  | "critical"
  | "info"
  | "neutral"
  | "pending"
  | "success"
  | "warning";

export type CoverageBulkRiskItem = {
  blockId: string;
  center: string;
  className: string;
  coachDetail: string;
  coachLabel: string;
  date: string;
  href: string;
  meta: string;
  priority: string;
  recommendation: string;
  status: string;
  time: string;
  title: string;
  tone: Tone;
};

export type CoverageBulkBlock = {
  end_time: string;
  id: string;
  required_coaches: number;
  service_date: string;
  start_time: string;
  status: string;
};

export type CoverageBulkAssignment = {
  assignment_status: string;
  coach_profile_id: string;
  id: string | null;
  schedule_block_id: string;
};

export type CoverageBulkClassType = {
  id: string;
  name: string;
  status: string;
};

type CoachOption = {
  id: string;
  isFallback: boolean;
  label: string;
};

const KEEP_VALUE = "keep";

function timeToMinutes(value: string) {
  const [hours, minutes] = value.slice(0, 5).split(":").map(Number);

  return hours * 60 + minutes;
}

function blocksOverlap(first: CoverageBulkBlock, second: CoverageBulkBlock) {
  if (first.service_date !== second.service_date) {
    return false;
  }

  return (
    timeToMinutes(first.start_time) < timeToMinutes(second.end_time) &&
    timeToMinutes(second.start_time) < timeToMinutes(first.end_time)
  );
}

function hasSelectedBlockOverlap(blocks: CoverageBulkBlock[]) {
  for (let index = 0; index < blocks.length; index += 1) {
    for (
      let compareIndex = index + 1;
      compareIndex < blocks.length;
      compareIndex += 1
    ) {
      if (blocksOverlap(blocks[index], blocks[compareIndex])) {
        return true;
      }
    }
  }

  return false;
}

function BulkSubmitButton({
  disabled,
  selectedCount,
}: {
  disabled: boolean;
  selectedCount: number;
}) {
  const { pending } = useFormStatus();

  return (
    <Button disabled={disabled || pending} type="submit">
      {pending ? "Aplicando..." : `Aplicar a ${selectedCount}`}
      <Save aria-hidden="true" />
    </Button>
  );
}

function getPriorityClass(tone: Tone) {
  if (tone === "critical") {
    return "border-destructive/30 bg-destructive/10 text-destructive";
  }

  if (tone === "warning") {
    return "border-amber-300 bg-amber-50 text-amber-700";
  }

  return "border-border bg-muted/40 text-muted-foreground";
}

function getStatusClass(tone: Tone) {
  if (tone === "critical") {
    return "border-destructive/30 bg-destructive/10 text-destructive";
  }

  if (tone === "warning") {
    return "border-amber-300 bg-amber-50 text-amber-700";
  }

  if (tone === "success") {
    return "border-emerald-300 bg-emerald-50 text-emerald-700";
  }

  return "border-border bg-muted/40 text-muted-foreground";
}

export function CoverageBulkResolveList({
  assignments,
  basePath,
  blocks,
  canManageSchedule,
  classTypes,
  coachOptions,
  items,
  organizationId,
  weekStart,
}: {
  assignments: CoverageBulkAssignment[];
  basePath: string;
  blocks: CoverageBulkBlock[];
  canManageSchedule: boolean;
  classTypes: CoverageBulkClassType[];
  coachOptions: CoachOption[];
  items: CoverageBulkRiskItem[];
  organizationId: string;
  weekStart: string;
}) {
  const [bulkClassTypeId, setBulkClassTypeId] = useState(KEEP_VALUE);
  const [bulkCoachProfileId, setBulkCoachProfileId] = useState(KEEP_VALUE);
  const [bulkRequiredCoaches, setBulkRequiredCoaches] = useState("");
  const [selectedBlockIds, setSelectedBlockIds] = useState<Set<string>>(
    () => new Set(),
  );
  const selectedItems = useMemo(
    () => items.filter((item) => selectedBlockIds.has(item.blockId)),
    [items, selectedBlockIds],
  );
  const selectedBlockIdSet = useMemo(
    () => new Set(selectedItems.map((item) => item.blockId)),
    [selectedItems],
  );
  const selectedBlocks = useMemo(
    () => blocks.filter((block) => selectedBlockIdSet.has(block.id)),
    [blocks, selectedBlockIdSet],
  );
  const selectedCount = selectedItems.length;
  const allSelected = selectedCount === items.length && items.length > 0;
  const normalizedRequiredCoaches = bulkRequiredCoaches.trim();
  const requiredCoachesValue =
    normalizedRequiredCoaches === "" ? null : Number(normalizedRequiredCoaches);
  const bulkRemovesRequirement =
    requiredCoachesValue !== null &&
    Number.isInteger(requiredCoachesValue) &&
    requiredCoachesValue === 0;
  const selectedBlocksHaveOverlap = useMemo(
    () => hasSelectedBlockOverlap(selectedBlocks),
    [selectedBlocks],
  );
  const unavailableCoachProfileIds = useMemo(() => {
    const unavailable = new Set<string>();

    if (selectedBlocks.length === 0) {
      return unavailable;
    }

    const assignmentsOutsideSelection = assignments.filter(
      (assignment) => !selectedBlockIdSet.has(assignment.schedule_block_id),
    );

    for (const coach of coachOptions) {
      const isAlreadyAssignedToSelection = assignments.some(
        (assignment) =>
          selectedBlockIdSet.has(assignment.schedule_block_id) &&
          assignment.assignment_status !== "removed" &&
          assignment.coach_profile_id === coach.id,
      );
      const overlapsExistingBlock = selectedBlocks.some((targetBlock) =>
        getUnavailableScheduleCoachAssignments({
          assignments: assignmentsOutsideSelection,
          blocks,
          targetBlock,
        }).some((unavailableBlock) => unavailableBlock.coachProfileId === coach.id),
      );

      if (
        selectedBlocksHaveOverlap ||
        isAlreadyAssignedToSelection ||
        overlapsExistingBlock
      ) {
        unavailable.add(coach.id);
      }
    }

    return unavailable;
  }, [
    assignments,
    blocks,
    coachOptions,
    selectedBlockIdSet,
    selectedBlocks,
    selectedBlocksHaveOverlap,
  ]);
  const selectedCoachUnavailable =
    bulkCoachProfileId !== KEEP_VALUE &&
    unavailableCoachProfileIds.has(bulkCoachProfileId);
  const effectiveBulkCoachProfileId =
    bulkRemovesRequirement || selectedCoachUnavailable
      ? KEEP_VALUE
      : bulkCoachProfileId;
  const hasBulkChange =
    bulkClassTypeId !== KEEP_VALUE ||
    effectiveBulkCoachProfileId !== KEEP_VALUE ||
    normalizedRequiredCoaches !== "";
  const canSubmitBulkEdit =
    canManageSchedule &&
    selectedCount > 0 &&
    hasBulkChange;

  function toggleSelected(blockId: string) {
    setSelectedBlockIds((current) => {
      const next = new Set(current);

      if (next.has(blockId)) {
        next.delete(blockId);
      } else {
        next.add(blockId);
      }

      return next;
    });
  }

  function selectAll() {
    setSelectedBlockIds(new Set(items.map((item) => item.blockId)));
  }

  function clearSelection() {
    setSelectedBlockIds(new Set());
  }

  function updateRequiredCoaches(value: string) {
    setBulkRequiredCoaches(value);

    if (Number(value.trim()) === 0) {
      setBulkCoachProfileId(KEEP_VALUE);
    }
  }

  return (
    <div className="grid gap-3">
      {canManageSchedule ? (
        <div className="rounded-lg border border-border bg-card px-3 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">Editar selección</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Cambia el tipo, el requisito o añade un entrenador común solo si
                está libre en todos los bloques elegidos.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={allSelected}
                onClick={selectAll}
                type="button"
                variant="outline"
              >
                <CheckSquare aria-hidden="true" />
                Seleccionar todos
              </Button>
              <Button
                disabled={selectedCount === 0}
                onClick={clearSelection}
                type="button"
                variant="outline"
              >
                <X aria-hidden="true" />
                Limpiar
              </Button>
            </div>
          </div>

          {selectedCount > 0 ? (
            <form
              action={updateSelectedCoverageBlocks}
              className="mt-3 grid gap-3 border-t border-border pt-3 lg:grid-cols-[minmax(0,1fr)_150px_minmax(0,1fr)_auto]"
            >
              <input name="organizationId" type="hidden" value={organizationId} />
              <input name="weekStart" type="hidden" value={weekStart} />
              <input name="returnPath" type="hidden" value={basePath} />
              {selectedItems.map((item) => (
                <input
                  key={item.blockId}
                  name="scheduleBlockIds"
                  type="hidden"
                  value={item.blockId}
                />
              ))}

              <label className="grid min-w-0 gap-2">
                <span className="text-sm font-medium">Tipo de actividad</span>
                <select
                  className="h-11 w-full min-w-0 truncate rounded-md border border-input bg-transparent py-1 pl-3 pr-9 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:h-9"
                  name="classTypeId"
                  onChange={(event) => setBulkClassTypeId(event.currentTarget.value)}
                  value={bulkClassTypeId}
                >
                  <option value={KEEP_VALUE}>Mantener tipo actual</option>
                  {classTypes.map((classType) => (
                    <option key={classType.id} value={classType.id}>
                      {classType.name}
                      {classType.status === "inactive" ? " (inactivo)" : ""}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid min-w-0 gap-2">
                <span className="text-sm font-medium">Entrenadores</span>
                <Input
                  max="20"
                  min="0"
                  name="requiredCoaches"
                  onChange={(event) => updateRequiredCoaches(event.currentTarget.value)}
                  placeholder="Mantener"
                  type="number"
                  value={bulkRequiredCoaches}
                />
              </label>

              <label className="grid min-w-0 gap-2">
                <span className="text-sm font-medium">Añadir entrenador</span>
                {bulkRemovesRequirement ? (
                  <>
                    <input name="coachProfileId" type="hidden" value={KEEP_VALUE} />
                    <select
                      aria-readonly="true"
                      className="h-11 w-full min-w-0 truncate rounded-md border border-input bg-transparent py-1 pl-3 pr-9 text-sm outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-50 md:h-9"
                      disabled
                      value={KEEP_VALUE}
                    >
                      <option value={KEEP_VALUE}>No añadir con requisito 0</option>
                    </select>
                  </>
                ) : (
                  <select
                    className="h-11 w-full min-w-0 truncate rounded-md border border-input bg-transparent py-1 pl-3 pr-9 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:h-9"
                    disabled={coachOptions.length === 0}
                    name="coachProfileId"
                    onChange={(event) =>
                      setBulkCoachProfileId(event.currentTarget.value)
                    }
                    value={effectiveBulkCoachProfileId}
                  >
                    <option value={KEEP_VALUE}>No añadir entrenador</option>
                    {coachOptions.map((coach) => {
                      const unavailable = unavailableCoachProfileIds.has(coach.id);

                      return (
                        <option
                          disabled={unavailable}
                          key={coach.id}
                          value={coach.id}
                        >
                          {coach.label}
                          {unavailable
                            ? " (ocupado)"
                            : coach.isFallback
                              ? " (sin perfil visible)"
                              : ""}
                        </option>
                      );
                    })}
                  </select>
                )}
              </label>

              <div className="flex flex-wrap items-end gap-2">
                <Badge variant="outline">
                  {selectedCount} seleccionado{selectedCount === 1 ? "" : "s"}
                </Badge>
                <BulkSubmitButton
                  disabled={!canSubmitBulkEdit}
                  selectedCount={selectedCount}
                />
              </div>

              <div className="grid gap-1 text-xs leading-5 text-muted-foreground lg:col-span-4">
                {bulkRemovesRequirement ? (
                  <p>Con 0 entrenadores no se añade un entrenador común.</p>
                ) : null}
                {unavailableCoachProfileIds.size > 0 ? (
                  <p>
                    Los entrenadores ocupados o ya presentes en la selección
                    aparecen desactivados.
                  </p>
                ) : null}
                {!hasBulkChange ? (
                  <p>Elige al menos un cambio para aplicar la selección.</p>
                ) : null}
              </div>
            </form>
          ) : null}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
        <div className="hidden bg-muted/35 px-4 py-3 text-xs font-medium text-muted-foreground lg:grid lg:grid-cols-[116px_136px_minmax(0,1.1fr)_minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,1fr)_auto] lg:gap-4">
          <span>Prioridad</span>
          <span>Día y hora</span>
          <span>Clase</span>
          <span>Centro</span>
          <span>Situación</span>
          <span>Entrenador</span>
          <span>Acción</span>
        </div>

        <div className="divide-y divide-border">
          {items.map((item) => {
            const isSelected = selectedBlockIds.has(item.blockId);

            return (
              <div
                className={[
                  "grid gap-3 px-4 py-4 transition-colors lg:grid-cols-[116px_136px_minmax(0,1.1fr)_minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-center lg:gap-4",
                  isSelected ? "bg-primary/5" : "hover:bg-muted/25",
                ].join(" ")}
                key={item.blockId}
              >
                <div className="flex items-center gap-2">
                  {canManageSchedule ? (
                    <input
                      aria-label={`Seleccionar ${item.title}`}
                      checked={isSelected}
                      className="size-4 rounded border-border accent-primary"
                      onChange={() => toggleSelected(item.blockId)}
                      type="checkbox"
                    />
                  ) : null}
                  <span
                    className={`inline-flex min-h-7 items-center rounded-lg border px-2 text-xs font-medium ${getPriorityClass(
                      item.tone,
                    )}`}
                  >
                    {item.priority}
                  </span>
                </div>

                <div className="min-w-0">
                  <p className="text-sm font-medium">{item.date}</p>
                  <p className="mt-1 font-mono text-sm text-muted-foreground">
                    {item.time}
                  </p>
                </div>

                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {item.className}
                  </p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {item.meta}
                  </p>
                </div>

                <p className="truncate text-sm text-muted-foreground">
                  {item.center}
                </p>

                <div className="min-w-0">
                  <span
                    className={`inline-flex min-h-7 items-center rounded-lg border px-2 text-xs font-medium ${getStatusClass(
                      item.tone,
                    )}`}
                  >
                    {item.status}
                  </span>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {item.recommendation}
                  </p>
                </div>

                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {item.coachLabel}
                  </p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {item.coachDetail}
                  </p>
                </div>

                <div className="flex items-center gap-2 lg:justify-end">
                  <Button asChild size="sm" variant="outline">
                    <RouteStateButton
                      data-operational-detail-trigger="coverage-block"
                      href={item.href}
                    >
                      {canManageSchedule ? "Resolver" : "Abrir"}
                    </RouteStateButton>
                  </Button>
                  <MoreHorizontal
                    aria-hidden="true"
                    className="hidden size-4 text-muted-foreground lg:block"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {canManageSchedule && selectedCount === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Square aria-hidden="true" className="size-4" />
          Marca los bloques que quieras editar juntos.
        </p>
      ) : null}
    </div>
  );
}
