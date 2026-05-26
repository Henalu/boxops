"use client";

import * as React from "react";
import { RotateCcw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export type WorkWindowListFilters = {
  centerId: string;
  dayOfWeek: string;
  personProfileId: string;
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
  status: string;
};

const ORGANIZATION_CENTER_FILTER = "organization";
const EMPTY_LIST_FILTERS: WorkWindowListFilters = {
  centerId: "",
  dayOfWeek: "",
  personProfileId: "",
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
  "h-11 w-full min-w-0 truncate rounded-md border border-input bg-background py-1 pl-3 pr-9 text-sm md:h-9",
  "outline-none transition-colors focus-visible:border-ring",
  "focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
].join(" ");

function hasActiveListFilters(filters: WorkWindowListFilters) {
  return Boolean(
    filters.centerId ||
      filters.dayOfWeek ||
      filters.personProfileId ||
      filters.windowStatus,
  );
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
  if (filters.personProfileId && item.personProfileId !== filters.personProfileId) {
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
  const rowNodes = React.Children.toArray(children);
  const visibleRows = items
    .map((item, index) => ({
      item,
      node: rowNodes[index],
      visible: matchesFilters(item, filters),
    }))
    .filter((row) => row.visible);
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
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight">
            Lista de jornadas
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Abre una fila para editar persona, centro, dia, horas, vigencia,
            estado o notas.
          </p>
        </div>
        <Badge aria-live="polite" variant="outline">
          {visibleRows.length} visibles / {items.length} total
        </Badge>
      </div>

      <Card size="sm">
        <CardContent>
          <form
            className="grid gap-3 lg:grid-cols-[minmax(160px,1fr)_minmax(160px,1fr)_minmax(130px,0.75fr)_minmax(130px,0.75fr)_auto]"
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
                    Toda la organizacion
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
              <span className="text-sm font-medium">Dia</span>
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

            {hasFilters ? (
              <div className="flex flex-wrap items-end gap-2">
                <Button
                  onClick={() => setFilters(EMPTY_LIST_FILTERS)}
                  type="button"
                  variant="ghost"
                >
                  <RotateCcw aria-hidden="true" />
                  Limpiar
                </Button>
              </div>
            ) : null}
          </form>
        </CardContent>
      </Card>

      {items.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No hay jornadas previstas en esta semana</CardTitle>
            <CardDescription>
              Crea la primera franja para que Horario y Mi fichaje puedan usar
              el contexto planificado.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : visibleRows.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No hay jornadas con esos filtros</CardTitle>
            <CardDescription>
              Ajusta persona, centro, dia o estado para ampliar la lista.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-2">
          {visibleRows.map(({ item, node }) => (
            <React.Fragment key={item.id}>{node}</React.Fragment>
          ))}
        </div>
      )}
    </section>
  );
}
