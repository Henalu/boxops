"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";

import { cn } from "@/lib/utils";

const DEFAULT_CLEAR_PARAMS = ["status", "error"] as const;

type TransientFeedbackBannerProps = {
  clearParams?: readonly string[];
  description?: React.ReactNode;
  durationMs?: number;
  title: string;
  tone: "error" | "success";
};

export function TransientFeedbackBanner({
  clearParams = DEFAULT_CLEAR_PARAMS,
  description,
  durationMs,
  title,
  tone,
}: TransientFeedbackBannerProps) {
  const [visible, setVisible] = React.useState(true);
  const resolvedDuration = durationMs ?? (tone === "error" ? 10_000 : 7_000);
  const clearUrlParams = React.useCallback(() => {
    const url = new URL(window.location.href);
    let changed = false;

    for (const param of clearParams) {
      if (url.searchParams.has(param)) {
        url.searchParams.delete(param);
        changed = true;
      }
    }

    if (changed) {
      window.history.replaceState(
        window.history.state,
        "",
        `${url.pathname}${url.search}${url.hash}`,
      );
    }
  }, [clearParams]);

  const dismiss = React.useCallback(() => {
    setVisible(false);
    clearUrlParams();
  }, [clearUrlParams]);

  React.useEffect(() => {
    const timeoutId = window.setTimeout(dismiss, resolvedDuration);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [dismiss, resolvedDuration]);

  if (!visible) {
    return null;
  }

  const Icon = tone === "success" ? CheckCircle2 : AlertTriangle;

  return (
    <div
      aria-live={tone === "error" ? "assertive" : "polite"}
      className="pointer-events-none fixed inset-x-4 top-4 z-50 flex justify-center md:inset-x-auto md:right-6 md:justify-end"
      role={tone === "error" ? "alert" : "status"}
    >
      <div
        className={cn(
          "pointer-events-auto grid w-full max-w-md grid-cols-[auto_minmax(0,1fr)_auto] gap-3 rounded-lg border bg-background/95 p-3 text-sm shadow-lg backdrop-blur",
          tone === "success"
            ? "border-emerald-200 text-emerald-950 shadow-emerald-950/10"
            : "border-destructive/30 text-destructive shadow-destructive/10",
        )}
      >
        <Icon
          aria-hidden="true"
          className={cn(
            "mt-0.5 size-4",
            tone === "success" ? "text-emerald-600" : "text-destructive",
          )}
        />
        <div className="min-w-0">
          <p className="font-medium">{title}</p>
          {description ? (
            <div
              className={cn(
                "mt-1 text-xs leading-5",
                tone === "success" ? "text-emerald-800" : "text-destructive/80",
              )}
            >
              {description}
            </div>
          ) : null}
        </div>
        <button
          aria-label="Cerrar aviso"
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={dismiss}
          type="button"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      </div>
    </div>
  );
}
