"use client";

import * as React from "react";
import { ChevronDown, Eye, EyeOff, X } from "lucide-react";

import { pushRouteStateHref, useRouteQueryParam } from "@/components/features/route-state-link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type StaffWorkWindowHourSummaryItem = {
  details: {
    centerLabel: string;
    dayLabel: string;
    sortKey: string;
    timeRange: string;
  }[];
  id: string;
  name: string;
  tooltip: string;
};

function useWorkWindowsVisibility(initialVisible: boolean) {
  const queryValue = useRouteQueryParam({
    initialValue: initialVisible ? "1" : "0",
    paramName: "work_windows",
    validValues: ["0", "1"],
  });

  if (queryValue === "0") {
    return false;
  }

  if (queryValue === "1") {
    return true;
  }

  return true;
}

export function StaffWorkWindowsVisibilityCard({
  children,
  description,
  hideHref,
  initialVisible,
  showHref,
  summary,
  title,
}: {
  children: React.ReactNode;
  description: string;
  hideHref: string;
  initialVisible: boolean;
  showHref: string;
  summary?: React.ReactNode;
  title: React.ReactNode;
}) {
  const visible = useWorkWindowsVisibility(initialVisible);
  const contentId = React.useId();
  const [expanded, setExpanded] = React.useState(false);

  return (
    <section className="overflow-hidden rounded-xl bg-card text-card-foreground ring-1 ring-foreground/10">
      <div className="flex flex-col gap-2 px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
        <button
          aria-controls={contentId}
          aria-expanded={expanded}
          className="group flex min-h-10 min-w-0 flex-1 items-start gap-3 rounded-lg text-left outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          onClick={() => setExpanded((current) => !current)}
          type="button"
        >
          <span className="min-w-0 flex-1 space-y-1">
            <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 font-heading text-base font-medium leading-snug">
              {title}
              {summary ? (
                <span className="flex shrink-0 flex-wrap items-center gap-1.5">
                  {summary}
                </span>
              ) : null}
            </span>
            <span className="block text-sm text-muted-foreground">
              {description}
            </span>
          </span>
          <span className="inline-flex h-7 shrink-0 items-center gap-1 rounded-lg border border-border bg-background px-2.5 text-[0.8rem] font-medium text-foreground transition-colors group-hover:bg-muted">
            <span>{expanded ? "Contraer" : "Expandir"}</span>
            <ChevronDown
              aria-hidden="true"
              className={cn(
                "size-3.5 transition-transform duration-200 motion-reduce:transition-none",
                expanded ? "rotate-180" : "rotate-0",
              )}
            />
          </span>
        </button>

        <Button
          onClick={() => {
            pushRouteStateHref(visible ? hideHref : showHref);
          }}
          size="sm"
          type="button"
          variant="outline"
        >
          {visible ? (
            <EyeOff aria-hidden="true" />
          ) : (
            <Eye aria-hidden="true" />
          )}
          {visible ? "Ocultar" : "Mostrar"}
        </Button>
      </div>

      {expanded ? (
        <div className="border-t border-border px-4 py-4" id={contentId}>
          {visible ? (
            <div className="space-y-4">{children}</div>
          ) : (
            <div className="rounded-lg border border-dashed border-border bg-background/60 px-4 py-5 text-sm text-muted-foreground">
              Jornada prevista oculta en esta vista.
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}

export function StaffWorkWindowHourSummary({
  items,
  initialVisible,
}: {
  items: StaffWorkWindowHourSummaryItem[];
  initialVisible: boolean;
}) {
  const visible = useWorkWindowsVisibility(initialVisible);
  const [selectedItem, setSelectedItem] =
    React.useState<StaffWorkWindowHourSummaryItem | null>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const visibleItems = items.slice(0, 3);
  const hiddenItemCount = items.length - visibleItems.length;

  React.useEffect(() => {
    if (!selectedItem) {
      return;
    }

    panelRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setSelectedItem(null);
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedItem]);

  if (!visible || items.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 min-w-0 space-y-1">
      <div className="space-y-1">
        {visibleItems.map((item) => (
          <button
            className="block max-w-full cursor-pointer truncate rounded-full border border-border bg-background/90 px-2 py-1 text-left text-[11px] leading-none text-foreground/80 outline-none transition-colors hover:border-primary/40 hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50"
            key={item.id}
            onClick={() => setSelectedItem(item)}
            title={item.tooltip}
            type="button"
          >
            {item.name}
          </button>
        ))}
        {hiddenItemCount > 0 ? (
          <span
            className="block w-fit rounded-full border border-border bg-muted/60 px-2 py-1 text-[11px] leading-none text-muted-foreground"
            title={items
              .slice(visibleItems.length)
              .map((item) => item.name)
              .join(", ")}
          >
            +{hiddenItemCount}
          </span>
        ) : null}
      </div>

      {selectedItem ? (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setSelectedItem(null);
            }
          }}
        >
          <div
            aria-modal="true"
            className="w-[min(calc(100vw-2rem),28rem)] overflow-hidden rounded-xl border border-border bg-background shadow-lg outline-none"
            ref={panelRef}
            role="dialog"
            tabIndex={-1}
          >
            <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
              <div className="min-w-0">
                <h3 className="truncate text-base font-semibold tracking-tight">
                  {selectedItem.name}
                </h3>
                <p className="text-sm text-muted-foreground">
                  Jornada prevista
                </p>
              </div>
              <Button
                aria-label="Cerrar"
                onClick={() => setSelectedItem(null)}
                size="icon"
                type="button"
                variant="ghost"
              >
                <X aria-hidden="true" />
              </Button>
            </div>

            <div className="space-y-3 px-4 py-4">
              <p className="text-sm text-muted-foreground">
                {selectedItem.tooltip}
              </p>
              <div className="divide-y divide-border rounded-lg border border-border">
                {selectedItem.details.map((detail) => (
                  <div
                    className="grid gap-1 px-3 py-2.5 text-sm"
                    key={`${detail.sortKey}-${detail.centerLabel}`}
                  >
                    <div className="font-medium text-foreground">
                      {detail.dayLabel}
                    </div>
                    <div className="text-muted-foreground">
                      {detail.timeRange} / {detail.centerLabel}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function StaffWorkWindowsHiddenInput({
  initialVisible,
}: {
  initialVisible: boolean;
}) {
  const visible = useWorkWindowsVisibility(initialVisible);

  return <input name="work_windows" type="hidden" value={visible ? "1" : "0"} />;
}
