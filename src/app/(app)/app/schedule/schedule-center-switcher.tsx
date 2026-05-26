"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";

import { getSchedulePath } from "@/lib/navigation/app-paths";
import { cn } from "@/lib/utils";

type ScheduleView = "week" | "agenda" | "month";

type ScheduleCenterOption = {
  id: string;
  name: string;
  status: string;
};

type ScheduleCenterFilters = {
  classTypeId: string | null;
  coachProfileId: string | null;
  coverageState: string | null;
  mineOnly: boolean;
  risksOnly: boolean;
  showWorkWindows: boolean;
};

type ScheduleCenterSwitcherProps = {
  centers: ScheduleCenterOption[];
  defaultCenterId: string | null;
  filters: ScheduleCenterFilters;
  organizationId: string;
  selectedCenterId: string | null;
  selectedDay: string | null;
  view: ScheduleView;
  weekStart: string;
};

export function ScheduleCenterSwitcher({
  centers,
  defaultCenterId,
  filters,
  organizationId,
  selectedCenterId,
  selectedDay,
  view,
  weekStart,
}: ScheduleCenterSwitcherProps) {
  const router = useRouter();
  const validCenterIds = React.useMemo(
    () => new Set(centers.map((center) => center.id)),
    [centers],
  );
  const activeCenterId =
    selectedCenterId && validCenterIds.has(selectedCenterId)
      ? selectedCenterId
      : defaultCenterId;
  const selectedCenter = centers.find((center) => center.id === activeCenterId);

  const getCenterHref = React.useCallback(
    (centerId: string) =>
      getSchedulePath({
        centerId,
        classTypeId: filters.classTypeId,
        coachProfileId: filters.coachProfileId,
        coverageState: filters.coverageState,
        day: selectedDay,
        mineOnly: filters.mineOnly,
        organizationId,
        risksOnly: filters.risksOnly,
        showWorkWindows: filters.showWorkWindows,
        view,
        week: weekStart,
      }),
    [
      filters.classTypeId,
      filters.coachProfileId,
      filters.coverageState,
      filters.mineOnly,
      filters.risksOnly,
      filters.showWorkWindows,
      organizationId,
      selectedDay,
      view,
      weekStart,
    ],
  );

  if (centers.length === 0 || !activeCenterId || !selectedCenter) {
    return (
      <span className="inline-flex min-h-8 items-center rounded-full border border-border bg-background px-3 text-xs font-medium text-muted-foreground">
        Sin centro
      </span>
    );
  }

  if (centers.length > 4) {
    return (
      <label className="flex max-w-full items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          Centro
        </span>
        <span className="relative min-w-0">
          <select
            aria-label="Centro del calendario"
            className="h-8 max-w-[18rem] appearance-none truncate rounded-full border border-primary/30 bg-primary/10 px-3 pr-8 text-xs font-medium text-primary outline-none transition-colors hover:bg-primary/15 focus-visible:ring-2 focus-visible:ring-ring"
            onChange={(event) => {
              const nextCenterId = event.currentTarget.value;

              router.push(getCenterHref(nextCenterId), { scroll: false });
            }}
            value={activeCenterId}
          >
            {centers.map((center) => (
              <option key={center.id} value={center.id}>
                {center.name}
                {center.status === "inactive" ? " (inactivo)" : ""}
              </option>
            ))}
          </select>
          <ChevronDown
            aria-hidden="true"
            className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-primary"
          />
        </span>
      </label>
    );
  }

  return (
    <nav
      aria-label="Centro del calendario"
      className="flex max-w-full flex-wrap items-center justify-end gap-1.5"
    >
      <span className="text-xs font-medium text-muted-foreground">Centro</span>
      {centers.map((center) => {
        const active = center.id === activeCenterId;

        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex h-8 max-w-[13rem] items-center rounded-full border px-3 text-xs font-medium transition-colors",
              active
                ? "border-primary bg-primary text-primary-foreground shadow-sm"
                : "border-border bg-background text-foreground hover:border-primary/40 hover:bg-primary/10 hover:text-primary",
            )}
            href={getCenterHref(center.id)}
            key={center.id}
            prefetch={false}
            scroll={false}
            title={center.name}
          >
            <span className="truncate">{center.name}</span>
          </Link>
        );
      })}
    </nav>
  );
}
