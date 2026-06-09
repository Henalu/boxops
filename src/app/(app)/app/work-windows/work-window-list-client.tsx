"use client";

import * as React from "react";
import {
  ArrowUp,
  CalendarOff,
  CheckSquare,
  ListChecks,
  RotateCcw,
  Search,
  Trash2,
} from "lucide-react";

import { deleteStaffWorkWindowsBulk } from "../schedule/actions";
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

export type WorkWindowListFilters = {
  centerId: string;
  dayOfWeek: string;
  personProfileId: string;
  query: string;
  windowStatus: string;
};

export type WorkWindowFilterOption = {
  label: string;
  value: string;
};

export type WorkWindowListItemFilterData = {
  centerId: string | null;
  dayOfWeek: string;
  id: string;
  personProfileId: string;
  searchText: string;
  status: string;
};

const ORGANIZATION_CENTER_FILTER = "organization";
const EMPTY_LIST_FILTERS: WorkWindowListFilters = {
  centerId: "",
  dayOfWeek: "",
  personProfileId: "",
  query: "",
  windowStatus: "",
};

const dayOptions = [
  { label: "Lunes", value: "1" },
  { label: "Martes", value: "2" },
  { label: "Miercoles", value: "3" },
  { label: "Jueves", value: "4" },
  { label: "Viernes", value: "5" },
  { label: "Sabado", value: "6" },
  { label: "Domingo", value: "7" },
];

const selectClassName = [
  "h-11 w-full min-w-0 truncate rounded-lg border border-input bg-background py-1 pl-3 pr-9 text-sm md:h-9",
  "outline-none transition-colors focus-visible:border-ring",
  "focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
].join(" ");
const DELETE_CONFIRMATION_VALUE = "delete-staff-work-windows";

function hasActiveListFilters(filters: WorkWindowListFilters) {
  return Boolean(
    filters.centerId ||
      filters.dayOfWeek ||
      filters.personProfileId ||
      filters.query ||
      filters.windowStatus,
  );
}

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function getWorkWindowsListPath({
  filters = EMPTY_LIST_FILTERS,
  organizationId,
  week,
}: {
  filters?: WorkWindowListFilters;
  organizationId: string;
  week: string;
}) {
  const params = new URLSearchParams({
    organizationId,
    week,
  });

  if (filters.personProfileId) {
    params.set("person_profile_id", filters.personProfileId);
  }

  if (filters.query) {
    params.set("q", filters.query);
  }

  if (filters.centerId) {
    params.set("center_id", filters.centerId);
  }

  if (filters.dayOfWeek) {
    params.set("day", filters.dayOfWeek);
  }

  if (filters.windowStatus) {
    params.set("window_status", filters.windowStatus);
  }

  return `/app/work-windows?${params.toString()}`;
}

function getFiltersFromSearch(search: string) {
  const params = new URLSearchParams(search);

  return {
    centerId: params.get("center_id") ?? "",
    dayOfWeek: params.get("day") ?? "",
    personProfileId: params.get("person_profile_id") ?? "",
    query: params.get("q") ?? "",
    windowStatus: params.get("window_status") ?? "",
  } satisfies WorkWindowListFilters;
}

function normalizeFilters({
  filters,
  hasOrganizationWideWindows,
  items,
}: {
  filters: WorkWindowListFilters;
  hasOrganizationWideWindows: boolean;
  items: WorkWindowListItemFilterData[];
}) {
  const personIds = new Set(items.map((item) => item.personProfileId));
  const centerIds = new Set(
    items.flatMap((item) => (item.centerId ? [item.centerId] : [])),
  );
  const dayOfWeeks = new Set(dayOptions.map((option) => option.value));

  return {
    centerId:
      filters.centerId === ORGANIZATION_CENTER_FILTER &&
      hasOrganizationWideWindows
        ? filters.centerId
        : centerIds.has(filters.centerId)
          ? filters.centerId
          : "",
    dayOfWeek: dayOfWeeks.has(filters.dayOfWeek) ? filters.dayOfWeek : "",
    personProfileId: personIds.has(filters.personProfileId)
      ? filters.personProfileId
      : "",
    query: filters.query.trim().slice(0, 80),
    windowStatus:
      filters.windowStatus === "active" || filters.windowStatus === "inactive"
        ? filters.windowStatus
        : "",
  } satisfies WorkWindowListFilters;
}

function matchesFilters(
  item: WorkWindowListItemFilterData,
  filters: WorkWindowListFilters,
) {
  const query = normalizeSearch(filters.query);

  if (query && !normalizeSearch(item.searchText).includes(query)) {
    return false;
  }

  if (
    filters.personProfileId &&
    item.personProfileId !== filters.personProfileId
  ) {
    return false;
  }

  if (filters.centerId) {
    if (filters.centerId === ORGANIZATION_CENTER_FILTER) {
      if (item.centerId) {
        return false;
      }
    } else if (item.centerId !== filters.centerId) {
      return false;
    }
  }

  if (filters.dayOfWeek && item.dayOfWeek !== filters.dayOfWeek) {
    return false;
  }

  if (filters.windowStatus && item.status !== filters.windowStatus) {
    return false;
  }

  return true;
}

export function WorkWindowDeleteButton({
  ids,
  organizationId,
  returnPath,
  triggerLabel,
  weekStart,
}: {
  ids: string[];
  organizationId: string;
  returnPath: string;
  triggerLabel?: string;
  weekStart: string;
}) {
  const [isOpen, setIsOpen] = React.useState(false);
  const titleId = React.useId();
  const descriptionId = React.useId();
  const count = ids.length;
  const title =
    count === 1
      ? "Eliminar jornada prevista"
      : `Eliminar ${count} jornadas previstas`;
  const resolvedTriggerLabel =
    triggerLabel ?? (count === 1 ? "Eliminar" : `Eliminar ${count}`);

  return (
    <>
      <Button
        disabled={count === 0}
        onClick={() => setIsOpen(true)}
        size="sm"
        type="button"
        variant="destructive"
      >
        <Trash2 aria-hidden="true" />
        {resolvedTriggerLabel}
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
            aria-label="Cerrar confirmación"
            className="absolute inset-0 cursor-default"
            onClick={() => setIsOpen(false)}
            type="button"
          />
          <div className="relative z-10 w-full max-w-lg rounded-xl border border-border bg-background p-5 shadow-xl">
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive ring-1 ring-destructive/20">
                <Trash2 aria-hidden="true" className="size-5" />
              </span>
              <div className="min-w-0">
                <h2 className="text-base font-semibold" id={titleId}>
                  {title}
                </h2>
                <p
                  className="mt-2 text-sm leading-6 text-muted-foreground"
                  id={descriptionId}
                >
                  Esta acción retira la franja de la planificación prevista. No
                  borra fichajes ni otros registros históricos que ya existan.
                </p>
              </div>
            </div>

            <form
              action={deleteStaffWorkWindowsBulk}
              className="mt-5 flex flex-wrap justify-end gap-2"
            >
              <input name="organizationId" type="hidden" value={organizationId} />
              <input name="weekStart" type="hidden" value={weekStart} />
              <input name="returnPath" type="hidden" value={returnPath} />
              <input
                name="deleteConfirmation"
                type="hidden"
                value={DELETE_CONFIRMATION_VALUE}
              />
              {ids.map((id) => (
                <input
                  key={id}
                  name="staffWorkWindowIds"
                  type="hidden"
                  value={id}
                />
              ))}
              <Button
                onClick={() => setIsOpen(false)}
                type="button"
                variant="outline"
              >
                Cancelar
              </Button>
              <Button type="submit" variant="destructive">
                <Trash2 aria-hidden="true" />
                {count === 1 ? "Eliminar jornada" : `Eliminar ${count}`}
              </Button>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function WorkWindowListClient({
  centerOptions,
  children,
  hasOrganizationWideWindows,
  initialFilters,
  items,
  organizationId,
  personOptions,
  weekStart,
}: {
  centerOptions: WorkWindowFilterOption[];
  children: React.ReactNode;
  hasOrganizationWideWindows: boolean;
  initialFilters: WorkWindowListFilters;
  items: WorkWindowListItemFilterData[];
  organizationId: string;
  personOptions: WorkWindowFilterOption[];
  weekStart: string;
}) {
  const [filters, setFilters] = React.useState(() =>
    normalizeFilters({
      filters: initialFilters,
      hasOrganizationWideWindows,
      items,
    }),
  );
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(
    () => new Set(),
  );
  const rowNodes = React.Children.toArray(children);
  const visibleRows = items
    .map((item, index) => ({
      item,
      node: rowNodes[index],
      visible: matchesFilters(item, filters),
    }))
    .filter((row) => row.visible);
  const visibleItemIds = visibleRows.map((row) => row.item.id);
  const selectedVisibleIds = visibleItemIds.filter((id) => selectedIds.has(id));
  const allVisibleSelected =
    visibleItemIds.length > 0 &&
    visibleItemIds.every((id) => selectedIds.has(id));
  const partiallySelected =
    selectedVisibleIds.length > 0 && !allVisibleSelected;
  const hasFilters = hasActiveListFilters(filters);
  const currentPath = getWorkWindowsListPath({
    filters,
    organizationId,
    week: weekStart,
  });

  React.useEffect(() => {
    function handlePopState() {
      setFilters(
        normalizeFilters({
          filters: getFiltersFromSearch(window.location.search),
          hasOrganizationWideWindows,
          items,
        }),
      );
      setSelectedIds(new Set());
    }

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [hasOrganizationWideWindows, items]);

  React.useEffect(() => {
    if (`${window.location.pathname}${window.location.search}` !== currentPath) {
      window.history.replaceState(window.history.state, "", currentPath);
    }

    document
      .querySelectorAll<HTMLInputElement>('input[name="returnPath"]')
      .forEach((input) => {
        input.value = currentPath;
      });

    document
      .querySelectorAll<HTMLAnchorElement>(
        "a[data-work-window-week-link][data-week-start]",
      )
      .forEach((link) => {
        const targetWeek = link.dataset.weekStart;

        if (targetWeek) {
          link.href = getWorkWindowsListPath({
            filters,
            organizationId,
            week: targetWeek,
          });
        }
      });
  }, [currentPath, filters, organizationId]);

  function updateFilter<Key extends keyof WorkWindowListFilters>(
    key: Key,
    value: WorkWindowListFilters[Key],
  ) {
    setFilters((current) =>
      normalizeFilters({
        filters: {
          ...current,
          [key]: value,
        },
        hasOrganizationWideWindows,
        items,
      }),
    );
    setSelectedIds(new Set());
  }

  function toggleSelection(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });
  }

  function toggleVisibleSelection() {
    setSelectedIds((current) => {
      const next = new Set(current);

      if (allVisibleSelected) {
        visibleItemIds.forEach((id) => next.delete(id));
      } else {
        visibleItemIds.forEach((id) => next.add(id));
      }

      return next;
    });
  }

  return (
    <section>
      <Card>
        <CardHeader className="gap-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/10">
                <ListChecks aria-hidden="true" className="size-5" />
              </span>
              <div className="min-w-0">
                <CardTitle>Lista de jornadas</CardTitle>
                <CardDescription className="mt-1">
                  Abre una fila para editar persona, centro, día, horas,
                  vigencia, estado o notas.
                </CardDescription>
              </div>
            </div>

            <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto lg:justify-end">
              <label className="relative min-w-0 flex-1 lg:w-80">
                <span className="sr-only">Buscar jornadas</span>
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  className="pl-9"
                  name="q"
                  onChange={(event) =>
                    updateFilter("query", event.currentTarget.value)
                  }
                  placeholder="Buscar jornadas..."
                  type="search"
                  value={filters.query}
                />
              </label>
              <Badge
                aria-live="polite"
                className="min-h-11 justify-center px-3 md:min-h-9"
                variant="outline"
              >
                {visibleRows.length} visibles / {items.length} total
              </Badge>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <form
            className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(160px,1fr)_minmax(160px,1fr)_minmax(130px,0.75fr)_minmax(130px,0.75fr)_auto]"
            onSubmit={(event) => event.preventDefault()}
          >
            <label className="grid min-w-0 gap-2">
              <span className="text-sm font-medium">Persona</span>
              <select
                className={selectClassName}
                name="person_profile_id"
                onChange={(event) =>
                  updateFilter("personProfileId", event.currentTarget.value)
                }
                value={filters.personProfileId}
              >
                <option value="">Todas</option>
                {personOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid min-w-0 gap-2">
              <span className="text-sm font-medium">Centro</span>
              <select
                className={selectClassName}
                name="center_id"
                onChange={(event) =>
                  updateFilter("centerId", event.currentTarget.value)
                }
                value={filters.centerId}
              >
                <option value="">Todos</option>
                {hasOrganizationWideWindows ? (
                  <option value={ORGANIZATION_CENTER_FILTER}>
                    Toda la organización
                  </option>
                ) : null}
                {centerOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid min-w-0 gap-2">
              <span className="text-sm font-medium">Día</span>
              <select
                className={selectClassName}
                name="day"
                onChange={(event) =>
                  updateFilter("dayOfWeek", event.currentTarget.value)
                }
                value={filters.dayOfWeek}
              >
                <option value="">Todos</option>
                {dayOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid min-w-0 gap-2">
              <span className="text-sm font-medium">Estado</span>
              <select
                className={selectClassName}
                name="window_status"
                onChange={(event) =>
                  updateFilter("windowStatus", event.currentTarget.value)
                }
                value={filters.windowStatus}
              >
                <option value="">Todos</option>
                <option value="active">Activas</option>
                <option value="inactive">Inactivas</option>
              </select>
            </label>

            <div className="flex flex-wrap items-end gap-2">
              {hasFilters ? (
                <Button
                  onClick={() => setFilters(EMPTY_LIST_FILTERS)}
                  type="button"
                  variant="outline"
                >
                  <RotateCcw aria-hidden="true" />
                  Limpiar
                </Button>
              ) : null}
            </div>
          </form>

          {visibleRows.length > 0 ? (
            <div className="flex flex-col gap-3 rounded-xl border border-border bg-background/70 px-3 py-3 md:flex-row md:items-center md:justify-between">
              <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm font-medium">
                <input
                  aria-label="Seleccionar jornadas visibles"
                  checked={allVisibleSelected}
                  className="size-4 shrink-0 rounded border-input accent-primary"
                  onChange={toggleVisibleSelection}
                  type="checkbox"
                />
                <CheckSquare
                  aria-hidden="true"
                  className="size-4 text-muted-foreground"
                />
                <span>
                  {partiallySelected
                    ? `${selectedVisibleIds.length} seleccionada${
                        selectedVisibleIds.length === 1 ? "" : "s"
                      }`
                    : "Seleccionar visibles"}
                </span>
              </label>

              {selectedVisibleIds.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2 md:justify-end">
                  <Badge variant="outline">
                    {selectedVisibleIds.length} seleccionada
                    {selectedVisibleIds.length === 1 ? "" : "s"}
                  </Badge>
                  <WorkWindowDeleteButton
                    ids={selectedVisibleIds}
                    organizationId={organizationId}
                    returnPath={currentPath}
                    weekStart={weekStart}
                  />
                  <Button
                    onClick={() => setSelectedIds(new Set())}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Limpiar selección
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}

          {items.length === 0 ? (
            <div className="flex min-h-80 flex-col items-center justify-center rounded-xl border border-border bg-background/70 px-4 py-10 text-center">
              <span className="flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/10">
                <CalendarOff aria-hidden="true" className="size-8" />
              </span>
              <div className="mt-5 max-w-xl space-y-2">
                <CardTitle>No hay jornadas previstas en esta semana</CardTitle>
                <CardDescription>
                  Crea la primera franja para que Horario y Mi fichaje puedan
                  usar el contexto planificado.
                </CardDescription>
              </div>
              <Button asChild className="mt-5" variant="outline">
                <a href="#crear-franjas">
                  Volver a crear franjas
                  <ArrowUp aria-hidden="true" />
                </a>
              </Button>
              <p className="mt-6 border-t border-border pt-4 text-sm text-muted-foreground">
                Las jornadas creadas aquí serán visibles para Horario y Mi
                fichaje.
              </p>
            </div>
          ) : visibleRows.length === 0 ? (
            <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-background/70 px-4 py-8 text-center">
              <CardTitle>No hay jornadas con esos filtros</CardTitle>
              <CardDescription className="mt-2 max-w-lg">
                Ajusta búsqueda, persona, centro, día o estado para ampliar la
                lista.
              </CardDescription>
              <Button
                className="mt-5"
                onClick={() => setFilters(EMPTY_LIST_FILTERS)}
                type="button"
                variant="outline"
              >
                <RotateCcw aria-hidden="true" />
                Limpiar filtros
              </Button>
            </div>
          ) : (
            <div className="grid gap-2">
              {visibleRows.map(({ item, node }) => (
                <div
                  className="grid min-w-0 gap-2 rounded-xl transition-colors sm:grid-cols-[auto_minmax(0,1fr)]"
                  key={item.id}
                >
                  <label className="flex min-h-12 cursor-pointer items-center justify-center rounded-xl border border-border bg-background/70 px-3 py-2 text-sm transition-colors hover:bg-muted/45 sm:min-h-0">
                    <input
                      aria-label={`Seleccionar jornada ${item.searchText}`}
                      checked={selectedIds.has(item.id)}
                      className="size-4 shrink-0 rounded border-input accent-primary"
                      onChange={() => toggleSelection(item.id)}
                      type="checkbox"
                    />
                  </label>
                  <div className="min-w-0">{node}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
