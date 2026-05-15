"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { ArrowRight, CheckSquare, Square, X } from "lucide-react";

import { assignCoachToSelectedCoverageBlocks } from "./actions";
import { CoverageRiskCard } from "@/components/features/operations-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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
  href: string;
  meta: string;
  status: string;
  time: string;
  title: string;
  tone: Tone;
};

type CoachOption = {
  id: string;
  isFallback: boolean;
  label: string;
};

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
      {pending ? "Asignando..." : `Asignar a ${selectedCount}`}
      <ArrowRight aria-hidden="true" />
    </Button>
  );
}

export function CoverageBulkResolveList({
  basePath,
  canManageSchedule,
  coachOptions,
  items,
  organizationId,
  weekStart,
}: {
  basePath: string;
  canManageSchedule: boolean;
  coachOptions: CoachOption[];
  items: CoverageBulkRiskItem[];
  organizationId: string;
  weekStart: string;
}) {
  const [selectedBlockIds, setSelectedBlockIds] = useState<Set<string>>(
    () => new Set(),
  );
  const selectedItems = useMemo(
    () => items.filter((item) => selectedBlockIds.has(item.blockId)),
    [items, selectedBlockIds],
  );
  const selectedCount = selectedItems.length;
  const allSelected = selectedCount === items.length && items.length > 0;
  const canBulkAssign = canManageSchedule && coachOptions.length > 0;

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

  return (
    <div className="grid gap-3">
      {canManageSchedule ? (
        <div className="rounded-lg border border-border bg-card px-3 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">Resolver en lote</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Selecciona varios riesgos y asigna un mismo entrenador si está
                libre en todas las franjas.
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
              action={assignCoachToSelectedCoverageBlocks}
              className="mt-3 grid gap-3 border-t border-border pt-3 md:grid-cols-[minmax(0,1fr)_auto]"
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
                <span className="text-sm font-medium">
                  Entrenador para los seleccionados
                </span>
                <select
                  className="h-11 w-full min-w-0 truncate rounded-md border border-input bg-transparent py-1 pl-3 pr-9 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:h-9"
                  disabled={!canBulkAssign}
                  name="coachProfileId"
                  required
                >
                  {coachOptions.length === 0 ? (
                    <option value="">Sin entrenadores asignables</option>
                  ) : null}
                  {coachOptions.map((coach) => (
                    <option key={coach.id} value={coach.id}>
                      {coach.label}
                      {coach.isFallback ? " (sin perfil visible)" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex flex-wrap items-end gap-2">
                <Badge variant="outline">
                  {selectedCount} seleccionado{selectedCount === 1 ? "" : "s"}
                </Badge>
                <BulkSubmitButton
                  disabled={!canBulkAssign}
                  selectedCount={selectedCount}
                />
              </div>
            </form>
          ) : null}
        </div>
      ) : null}

      {items.map((item) => {
        const isSelected = selectedBlockIds.has(item.blockId);

        return (
          <CoverageRiskCard
            actionLabel={canManageSchedule ? "Resolver" : "Abrir"}
            center={item.center}
            detailTrigger="coverage-block"
            href={item.href}
            key={item.blockId}
            leading={
              canManageSchedule ? (
                <input
                  aria-label={`Seleccionar ${item.title}`}
                  checked={isSelected}
                  className="size-4 rounded border-border accent-primary"
                  onChange={() => toggleSelected(item.blockId)}
                  type="checkbox"
                />
              ) : undefined
            }
            meta={item.meta}
            preserveRouteState
            scroll={false}
            selected={isSelected}
            status={item.status}
            time={item.time}
            title={item.title}
            tone={item.tone}
          />
        );
      })}

      {canManageSchedule && selectedCount === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Square aria-hidden="true" className="size-4" />
          Marca los bloques que quieras resolver juntos.
        </p>
      ) : null}
    </div>
  );
}
