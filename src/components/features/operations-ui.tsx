import Link from "next/link";
import type React from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, CheckCircle2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Tone =
  | "critical"
  | "info"
  | "neutral"
  | "pending"
  | "success"
  | "warning";

const toneClasses: Record<Tone, string> = {
  critical:
    "border-destructive/35 bg-destructive/10 text-destructive ring-destructive/20",
  info: "border-primary/25 bg-primary/10 text-primary ring-primary/15",
  neutral: "border-border bg-card text-card-foreground ring-foreground/10",
  pending: "border-amber-300/60 bg-amber-50 text-amber-800 ring-amber-200/70",
  success:
    "border-emerald-300/55 bg-emerald-50 text-emerald-800 ring-emerald-200/70",
  warning:
    "border-orange-300/60 bg-orange-50 text-orange-800 ring-orange-200/70",
};

export function PageHeader({
  actions,
  badge,
  children,
  description,
  meta,
  title,
}: {
  actions?: React.ReactNode;
  badge?: string;
  children?: React.ReactNode;
  description?: string;
  meta?: React.ReactNode;
  title: string;
}) {
  return (
    <section className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {badge ? <Badge variant="secondary">{badge}</Badge> : null}
          {meta}
        </div>
        <div className="space-y-1.5">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {title}
          </h1>
          {description ? (
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
              {description}
            </p>
          ) : null}
        </div>
        {children}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      ) : null}
    </section>
  );
}

export function SectionHeader({
  action,
  description,
  title,
}: {
  action?: React.ReactNode;
  description?: string;
  title: string;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function StatusBadge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: Tone;
}) {
  return (
    <span
      className={cn(
        "inline-flex min-h-6 items-center rounded-full border px-2.5 text-xs font-medium",
        toneClasses[tone],
      )}
    >
      {children}
    </span>
  );
}

export function StatCard({
  description,
  icon: Icon,
  label,
  tone = "neutral",
  value,
}: {
  description?: string;
  icon?: LucideIcon;
  label: string;
  tone?: Tone;
  value: React.ReactNode;
}) {
  return (
    <Card size="sm">
      <CardContent className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          {Icon ? (
            <span
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-lg border",
                toneClasses[tone],
              )}
            >
              <Icon aria-hidden="true" className="size-4" />
            </span>
          ) : null}
        </div>
        <p className="font-mono text-3xl font-semibold tracking-tight">
          {value}
        </p>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function ActionCard({
  description,
  href,
  icon: Icon,
  label,
  title,
}: {
  description: string;
  href: string;
  icon: LucideIcon;
  label: string;
  title: string;
}) {
  return (
    <Card size="sm">
      <CardContent className="flex h-full flex-col gap-4">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon aria-hidden="true" className="size-4" />
          </span>
          <div className="min-w-0">
            <h3 className="font-medium">{title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          </div>
        </div>
        <div className="mt-auto">
          <Button asChild variant="outline">
            <Link href={href}>
              {label}
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function EmptyState({
  action,
  description,
  title,
}: {
  action?: React.ReactNode;
  description: string;
  title: string;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-start gap-3 py-6">
        <span className="flex size-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
          <CheckCircle2 aria-hidden="true" className="size-5" />
        </span>
        <div className="space-y-1">
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        {action}
      </CardContent>
    </Card>
  );
}

export function CoverageRiskCard({
  center,
  href,
  meta,
  status,
  time,
  title,
  tone,
}: {
  center: string;
  href: string;
  meta: string;
  status: string;
  time: string;
  title: string;
  tone: Tone;
}) {
  return (
    <Card className={cn("ring-1", toneClasses[tone])} size="sm">
      <CardContent className="grid gap-4 sm:grid-cols-[72px_minmax(0,1fr)_auto] sm:items-start">
        <p className="font-mono text-sm font-semibold">{time}</p>
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={tone}>{status}</StatusBadge>
            <span className="text-xs text-muted-foreground">{meta}</span>
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold tracking-tight">
              {title}
            </h3>
            <p className="mt-1 truncate text-sm text-muted-foreground">
              {center}
            </p>
          </div>
        </div>
        <Button asChild variant={tone === "critical" ? "destructive" : "outline"}>
          <Link href={href}>
            Asignar
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
