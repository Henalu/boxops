"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CalendarDays, Clock3 } from "lucide-react";

import { NextAssignedCountdown } from "@/components/features/next-assigned-countdown";
import { getSchedulePath } from "@/lib/navigation/app-paths";
import { getNextAssignedLeadCopy } from "@/lib/next-assigned-copy";
import type { OwnNextAssignedScheduleState } from "@/lib/own-schedule";
import { resolveWeek } from "@/lib/schedule-blocks";
import { cn } from "@/lib/utils";

export type NextAssignedShellItem = {
  organizationId: string;
  organizationName: string;
  state: OwnNextAssignedScheduleState;
};

type NextAssignedShellLinkProps = {
  className?: string;
  items: NextAssignedShellItem[];
  placement: "sidebar" | "mobile-header";
};

function getActiveItem({
  items,
  organizationId,
}: {
  items: NextAssignedShellItem[];
  organizationId: string | null;
}) {
  if (organizationId) {
    return items.find((item) => item.organizationId === organizationId) ?? null;
  }

  return items.length === 1 ? items[0] : null;
}

function getScheduleHref(item: NextAssignedShellItem) {
  if (item.state.status !== "matched" || !item.state.nextBlock) {
    return "#";
  }

  const block = item.state.nextBlock;
  const blockWeek = resolveWeek(block.serviceDate, block.timeZone);

  return getSchedulePath({
    mineOnly: true,
    organizationId: item.organizationId,
    week: blockWeek.weekStart,
  });
}

export function NextAssignedShellLink({
  className,
  items,
  placement,
}: NextAssignedShellLinkProps) {
  const searchParams = useSearchParams();

  const item = getActiveItem({
    items,
    organizationId: searchParams.get("organizationId"),
  });
  const block =
    item?.state.status === "matched" ? item.state.nextBlock : null;

  if (!item || !block) {
    return null;
  }

  const leadCopy = getNextAssignedLeadCopy(block);
  const activityName = block.classType?.name ?? "Próxima clase";
  const contextLabel = item.organizationName ? ` en ${item.organizationName}` : "";
  const href = getScheduleHref(item);

  if (placement === "mobile-header") {
    return (
      <Link
        aria-label={`Ver horario de tu próxima clase${contextLabel}: ${activityName}, ${leadCopy}`}
        className={cn(
          "flex min-h-9 min-w-0 flex-1 items-center justify-center gap-1 rounded-full border border-border bg-card px-2 text-xs font-medium text-foreground shadow-sm transition-colors hover:border-primary/30 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
          className,
        )}
        href={href}
      >
        <CalendarDays
          aria-hidden="true"
          className="size-3.5 shrink-0 text-primary"
        />
        <span className="min-w-0 truncate">
          {block.startTime.slice(0, 5)} ·{" "}
          <NextAssignedCountdown
            endAt={block.endAt}
            initialLabel={leadCopy}
            startAt={block.startAt}
          />
        </span>
      </Link>
    );
  }

  return (
    <Link
      aria-label={`Ver horario de tu próxima clase${contextLabel}: ${activityName}, ${leadCopy}`}
      className={cn(
        "group grid gap-1 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2.5 text-sm text-foreground transition-colors hover:border-primary/35 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        className,
      )}
      href={href}
    >
      <span className="flex items-center justify-between gap-2 text-[11px] font-medium text-muted-foreground">
        <span>Próxima clase</span>
        <CalendarDays aria-hidden="true" className="size-3.5 text-primary" />
      </span>
      <span className="truncate font-semibold tracking-tight">
        {activityName}
      </span>
      <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
        <Clock3 aria-hidden="true" className="size-3.5 shrink-0" />
        <span className="truncate">
          {block.startTime.slice(0, 5)} ·{" "}
          <NextAssignedCountdown
            endAt={block.endAt}
            initialLabel={leadCopy}
            startAt={block.startAt}
          />
        </span>
      </span>
    </Link>
  );
}
