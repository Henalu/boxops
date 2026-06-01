import type React from "react";
import type { LucideIcon } from "lucide-react";
import { ChevronDown, Pencil } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function CollapsibleActionPanel({
  actionLabel,
  children,
  description,
  featured = false,
  icon: Icon,
  title,
}: {
  actionLabel: string;
  children: React.ReactNode;
  description: string;
  featured?: boolean;
  icon: LucideIcon;
  title: string;
}) {
  return (
    <details
      className={cn(
        "group rounded-xl bg-card text-card-foreground ring-1 ring-foreground/10",
        featured ? "shadow-sm" : "",
      )}
    >
      <summary
        className={cn(
          "flex cursor-pointer list-none items-center justify-between gap-4 outline-none transition-colors hover:bg-muted/45 focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden",
          featured ? "min-h-28 px-5 py-5" : "px-4 py-4",
        )}
      >
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={cn(
              "flex shrink-0 items-center justify-center bg-primary/10 text-primary ring-1 ring-primary/10",
              featured ? "size-14 rounded-xl" : "size-9 rounded-lg",
            )}
          >
            <Icon
              aria-hidden="true"
              className={featured ? "size-6" : "size-4"}
            />
          </span>
          <span className="min-w-0">
            <span
              className={cn(
                "block font-semibold tracking-tight",
                featured ? "text-base" : "text-sm",
              )}
            >
              {title}
            </span>
            <span className="mt-1 block text-sm leading-5 text-muted-foreground">
              {description}
            </span>
          </span>
        </div>
        <span
          className={cn(
            buttonVariants({ size: featured ? "lg" : "sm" }),
            "min-h-11 shrink-0 px-3 md:min-h-0 md:px-2.5 group-open:bg-secondary group-open:text-secondary-foreground",
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
            "min-h-11 px-3 md:min-h-0 md:px-2.5 group-open:bg-muted",
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
