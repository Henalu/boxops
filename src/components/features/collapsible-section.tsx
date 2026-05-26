"use client";

import { ChevronDown } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

type CollapsibleSectionTone = "action" | "default" | "history" | "review";

const toneClassNames: Record<CollapsibleSectionTone, string> = {
  action: "border-primary/20 bg-primary/5",
  default: "border-border bg-card",
  history: "border-border bg-card",
  review: "border-border bg-card",
};

const contentClassNames: Record<CollapsibleSectionTone, string> = {
  action: "bg-card/80",
  default: "bg-background/40",
  history: "bg-background/40",
  review: "bg-background/40",
};

export function CollapsibleSection({
  action,
  children,
  className,
  contentClassName,
  dataCollapsibleSection,
  dataTimeCollapsibleDetails,
  dataTimeCollapsibleQueue,
  defaultOpen = false,
  description,
  summary,
  title,
  tone = "default",
}: {
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  dataCollapsibleSection?: string;
  dataTimeCollapsibleDetails?: string;
  dataTimeCollapsibleQueue?: string;
  defaultOpen?: boolean;
  description?: string;
  summary?: ReactNode;
  title: string;
  tone?: CollapsibleSectionTone;
}) {
  const contentId = useId();
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section
      className={cn(
        "overflow-hidden rounded-xl border text-card-foreground shadow-sm",
        toneClassNames[tone],
        className,
      )}
      data-collapsible-section={dataCollapsibleSection}
      data-time-collapsible-details={dataTimeCollapsibleDetails}
      data-time-collapsible-queue={dataTimeCollapsibleQueue}
    >
      <div className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-4">
        <h2 className="min-w-0 flex-1">
          <button
            aria-controls={contentId}
            aria-expanded={open}
            className="group flex min-h-10 w-full min-w-0 items-center gap-3 rounded-lg text-left outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
            onClick={() => setOpen((current) => !current)}
            type="button"
          >
            <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
              <span className="min-w-0 truncate text-sm font-semibold tracking-tight sm:text-base">
                {title}
              </span>
              {summary ? (
                <span className="flex shrink-0 flex-wrap items-center gap-1.5">
                  {summary}
                </span>
              ) : null}
              {description ? (
                <span className="basis-full truncate text-xs font-normal leading-5 text-muted-foreground sm:text-sm">
                  {description}
                </span>
              ) : null}
            </span>
            <ChevronDown
              aria-hidden="true"
              className={cn(
                "size-4 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none",
                open ? "rotate-180" : "rotate-0",
              )}
            />
          </button>
        </h2>

        {action ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
            {action}
          </div>
        ) : null}
      </div>

      <div
        aria-hidden={!open}
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
        id={contentId}
        inert={open ? undefined : true}
      >
        <div className="min-h-0 overflow-hidden">
          <div
            className={cn(
              "border-t border-border px-3 py-3 sm:px-4",
              contentClassNames[tone],
              contentClassName,
            )}
          >
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}
