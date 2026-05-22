"use client";

import * as React from "react";
import { Eye, EyeOff, UsersRound } from "lucide-react";

import { pushRouteStateHref, useRouteQueryParam } from "@/components/features/route-state-link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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
  title,
}: {
  children: React.ReactNode;
  description: string;
  hideHref: string;
  initialVisible: boolean;
  showHref: string;
  title: React.ReactNode;
}) {
  const visible = useWorkWindowsVisibility(initialVisible);

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
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
      </CardHeader>

      {visible ? <CardContent className="space-y-4">{children}</CardContent> : null}
    </Card>
  );
}

export function StaffWorkWindowHourSummary({
  initialVisible,
  names,
}: {
  initialVisible: boolean;
  names: string[];
}) {
  const visible = useWorkWindowsVisibility(initialVisible);
  const visibleNames = names.slice(0, 3);
  const hiddenNameCount = names.length - visibleNames.length;

  if (!visible || names.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 min-w-0 space-y-1.5">
      <div className="flex items-center gap-1 text-[10px] font-semibold uppercase leading-none text-muted-foreground/80">
        <UsersRound aria-hidden="true" className="size-3" />
        Jornada
      </div>
      <div className="space-y-1">
        {visibleNames.map((name, index) => (
          <span
            className="block max-w-full truncate rounded-full border border-border bg-background/90 px-2 py-1 text-[11px] leading-none text-foreground/80"
            key={`${name}-${index}`}
            title={name}
          >
            {name}
          </span>
        ))}
        {hiddenNameCount > 0 ? (
          <span className="block w-fit rounded-full border border-border bg-muted/60 px-2 py-1 text-[11px] leading-none text-muted-foreground">
            +{hiddenNameCount}
          </span>
        ) : null}
      </div>
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
