import type React from "react";
import type { LucideIcon } from "lucide-react";
import { ChevronDown, Pencil } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function CollapsibleActionPanel({
  actionLabel,
  children,
  description,
  icon: Icon,
  title,
}: {
  actionLabel: string;
  children: React.ReactNode;
  description: string;
  icon: LucideIcon;
  title: string;
}) {
  return (
    <details className="group rounded-xl bg-card text-card-foreground ring-1 ring-foreground/10">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-4 outline-none transition-colors hover:bg-muted/45 focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon aria-hidden="true" className="size-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold tracking-tight">
              {title}
            </span>
            <span className="mt-1 block text-sm leading-5 text-muted-foreground">
              {description}
            </span>
          </span>
        </div>
        <span
          className={cn(
            buttonVariants({ size: "sm" }),
            "shrink-0 group-open:bg-secondary group-open:text-secondary-foreground",
          )}
        >
          {actionLabel}
          <ChevronDown
            aria-hidden="true"
            className="size-3.5 transition-transform group-open:rotate-180"
          />
        </span>
      </summary>
      <div className="border-t border-border px-4 py-4">{children}</div>
    </details>
  );
}

export function InlineEditDetails({
  children,
  label = "Editar",
}: {
  children: React.ReactNode;
  label?: string;
}) {
  return (
    <details className="group">
      <summary className="inline-flex cursor-pointer list-none outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
        <span
          className={cn(
            buttonVariants({ size: "sm", variant: "outline" }),
            "group-open:bg-muted",
          )}
        >
          <Pencil aria-hidden="true" className="size-3.5" />
          {label}
          <ChevronDown
            aria-hidden="true"
            className="size-3.5 transition-transform group-open:rotate-180"
          />
        </span>
      </summary>
      <div className="mt-4 rounded-lg border border-border bg-muted/25 p-4">
        {children}
      </div>
    </details>
  );
}

export function MetaGrid({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <dl
      className={cn(
        "grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4",
        className,
      )}
    >
      {children}
    </dl>
  );
}

export function MetaItem({
  children,
  label,
  mono,
}: {
  children: React.ReactNode;
  label: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "mt-1 truncate font-medium",
          mono ? "font-mono text-xs" : "",
        )}
      >
        {children}
      </dd>
    </div>
  );
}
