"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";

import { getScheduleTemplatesPath } from "@/lib/navigation/app-paths";
import { cn } from "@/lib/utils";

type TemplateCenterFocusView = "week" | "agenda";

type TemplateCenterFocusOption = {
  id: string;
  name: string;
  status: string;
};

type TemplateCenterFocusSwitcherProps = {
  centers: TemplateCenterFocusOption[];
  editBlockId?: string | null;
  organizationId: string;
  selectedCenterValue: string;
  selectedDay: string;
  view: TemplateCenterFocusView;
  weekStart: string;
};

const ALL_CENTERS_VALUE = "all";

export function TemplateCenterFocusSwitcher({
  centers,
  editBlockId,
  organizationId,
  selectedCenterValue,
  selectedDay,
  view,
  weekStart,
}: TemplateCenterFocusSwitcherProps) {
  const router = useRouter();
  const options = [
    { id: ALL_CENTERS_VALUE, name: "Todas", status: "active" },
    ...centers,
  ];
  const activeValue = options.some((option) => option.id === selectedCenterValue)
    ? selectedCenterValue
    : ALL_CENTERS_VALUE;

  const getCenterHref = (centerId: string) =>
    getScheduleTemplatesPath({
      centerId,
      day: selectedDay,
      editTemplateBlockId: editBlockId,
      organizationId,
      view,
      week: weekStart,
    });

  if (centers.length === 0) {
    return (
      <span className="inline-flex min-h-8 items-center rounded-full border border-border bg-background px-3 text-xs font-medium text-muted-foreground">
        Todas
      </span>
    );
  }

  if (centers.length > 2) {
    return (
      <label className="flex max-w-full items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          Centro
        </span>
        <span className="relative min-w-0">
          <select
            aria-label="Centro de las plantillas"
            className="h-8 max-w-[18rem] appearance-none truncate rounded-full border border-primary/30 bg-primary/10 px-3 pr-8 text-xs font-medium text-primary outline-none transition-colors hover:bg-primary/15 focus-visible:ring-2 focus-visible:ring-ring"
            onChange={(event) => {
              router.push(getCenterHref(event.currentTarget.value), {
                scroll: false,
              });
            }}
            value={activeValue}
          >
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
                {option.status === "inactive" ? " (inactivo)" : ""}
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
      aria-label="Centro de las plantillas"
      className="flex max-w-full flex-wrap items-center justify-end gap-1.5"
    >
      <span className="text-xs font-medium text-muted-foreground">Centro</span>
      {options.map((option) => {
        const active = option.id === activeValue;

        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex h-8 max-w-[13rem] items-center rounded-full border px-3 text-xs font-medium transition-colors",
              active
                ? "border-primary bg-primary text-primary-foreground shadow-sm"
                : "border-border bg-background text-foreground hover:border-primary/40 hover:bg-primary/10 hover:text-primary",
            )}
            href={getCenterHref(option.id)}
            key={option.id}
            prefetch={false}
            scroll={false}
            title={option.name}
          >
            <span className="truncate">{option.name}</span>
          </Link>
        );
      })}
    </nav>
  );
}
