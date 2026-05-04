"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { CircleHelp, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "boxops_onboarding_seen_v2";
const OPEN_EVENT = "boxops:onboarding-open";
const SPOTLIGHT_PADDING = 8;
const TARGET_GAP = 12;
const VIEWPORT_MARGIN = 16;
const MOBILE_BREAKPOINT = 640;

type PreferredPlacement = "top" | "bottom" | "left" | "right" | "center";

type TourStep = {
  description: string;
  id: string;
  preferredPlacement: PreferredPlacement;
  target: string;
  title: string;
};

const steps = [
  {
    id: "home",
    target: '[data-tour="nav-home"]',
    title: "Inicio",
    description: "Aqui vuelves al resumen operativo del box.",
    preferredPlacement: "right",
  },
  {
    id: "schedule",
    target: '[data-tour="nav-schedule"]',
    title: "Horario",
    description:
      "Aqui revisas la semana, creas bloques y ves el estado de las clases.",
    preferredPlacement: "right",
  },
  {
    id: "coverage",
    target: '[data-tour="nav-coverage"]',
    title: "Cobertura",
    description:
      "Aqui aparecen clases sin coach, conflictos y riesgos que requieren accion.",
    preferredPlacement: "right",
  },
  {
    id: "team",
    target: '[data-tour="nav-team"]',
    title: "Equipo",
    description:
      "Aqui gestionas coaches y revisas la base operativa del equipo.",
    preferredPlacement: "right",
  },
  {
    id: "management",
    target: '[data-tour="nav-management"]',
    title: "Gestion",
    description: "Aqui estan centros, tipos de actividad, plantillas y ayuda.",
    preferredPlacement: "right",
  },
  {
    id: "dashboard-summary",
    target: '[data-tour="dashboard-summary"]',
    title: "Resumen de la semana",
    description:
      "Aqui ves los numeros clave para saber como va la operativa.",
    preferredPlacement: "top",
  },
  {
    id: "coverage-risks",
    target: '[data-tour="coverage-risks"]',
    title: "Pendiente",
    description: "Aqui aparecen los riesgos que conviene resolver primero.",
    preferredPlacement: "right",
  },
  {
    id: "quick-actions",
    target: '[data-tour="quick-actions"]',
    title: "Acciones rapidas",
    description:
      "Desde aqui puedes abrir las tareas habituales sin buscar en menus.",
    preferredPlacement: "top",
  },
] satisfies TourStep[];

type ViewportSize = {
  height: number;
  width: number;
};

type Rect = {
  bottom: number;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
};

type TooltipPlacement = PreferredPlacement | "sheet";

type TourLayout = {
  fallback: boolean;
  placement: TooltipPlacement;
  spotlightRect: Rect | null;
  tooltipStyle: CSSProperties;
};

const defaultTooltipSize: ViewportSize = {
  height: 260,
  width: 360,
};

function clamp(value: number, min: number, max: number) {
  if (max < min) {
    return min;
  }

  return Math.min(Math.max(value, min), max);
}

function rectFromDomRect(rect: DOMRect): Rect {
  return {
    bottom: rect.bottom,
    height: rect.height,
    left: rect.left,
    right: rect.right,
    top: rect.top,
    width: rect.width,
  };
}

function getViewportSize(): ViewportSize {
  return {
    height: window.innerHeight,
    width: window.innerWidth,
  };
}

function getTooltipSize(size: ViewportSize, viewport: ViewportSize) {
  return {
    height: Math.min(
      Math.max(size.height || defaultTooltipSize.height, 180),
      Math.max(180, viewport.height - VIEWPORT_MARGIN * 2),
    ),
    width: Math.min(
      Math.max(size.width || defaultTooltipSize.width, 280),
      Math.max(280, viewport.width - VIEWPORT_MARGIN * 2),
    ),
  };
}

function getCenteredTooltipStyle(
  viewport: ViewportSize,
  tooltipSize: ViewportSize,
): CSSProperties {
  return {
    left: clamp(
      (viewport.width - tooltipSize.width) / 2,
      VIEWPORT_MARGIN,
      viewport.width - tooltipSize.width - VIEWPORT_MARGIN,
    ),
    top: clamp(
      (viewport.height - tooltipSize.height) / 2,
      VIEWPORT_MARGIN,
      viewport.height - tooltipSize.height - VIEWPORT_MARGIN,
    ),
  };
}

function getSheetTooltipStyle(): CSSProperties {
  return {
    bottom: "calc(env(safe-area-inset-bottom) + 0.75rem)",
    left: "0.75rem",
    right: "0.75rem",
    top: "auto",
  };
}

function markSeen() {
  try {
    window.localStorage.setItem(STORAGE_KEY, "true");
  } catch {
    // localStorage can be unavailable in restricted browser contexts.
  }
}

function hasSeenTour() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function clearSeenTour() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // The launch event still opens the tour if storage is unavailable.
  }
}

function isElementMeasurable(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);

  return (
    rect.width > 0 &&
    rect.height > 0 &&
    style.display !== "none" &&
    style.visibility !== "hidden"
  );
}

function getTourTarget(selector: string) {
  return (
    Array.from(document.querySelectorAll<HTMLElement>(selector)).find(
      isElementMeasurable,
    ) ?? null
  );
}

function getSpotlightRect(rect: Rect, viewport: ViewportSize): Rect | null {
  const top = clamp(
    rect.top - SPOTLIGHT_PADDING,
    VIEWPORT_MARGIN / 2,
    viewport.height - VIEWPORT_MARGIN / 2,
  );
  const left = clamp(
    rect.left - SPOTLIGHT_PADDING,
    VIEWPORT_MARGIN / 2,
    viewport.width - VIEWPORT_MARGIN / 2,
  );
  const right = clamp(
    rect.right + SPOTLIGHT_PADDING,
    VIEWPORT_MARGIN / 2,
    viewport.width - VIEWPORT_MARGIN / 2,
  );
  const bottom = clamp(
    rect.bottom + SPOTLIGHT_PADDING,
    VIEWPORT_MARGIN / 2,
    viewport.height - VIEWPORT_MARGIN / 2,
  );

  if (right - left < 4 || bottom - top < 4) {
    return null;
  }

  return {
    bottom,
    height: bottom - top,
    left,
    right,
    top,
    width: right - left,
  };
}

function getPlacementOrder(preferredPlacement: PreferredPlacement) {
  const fallbackOrder: PreferredPlacement[] = [
    "bottom",
    "top",
    "right",
    "left",
  ];

  if (preferredPlacement === "center") {
    return fallbackOrder;
  }

  return [
    preferredPlacement,
    ...fallbackOrder.filter((placement) => placement !== preferredPlacement),
  ];
}

function placementFits({
  placement,
  rect,
  tooltipSize,
  viewport,
}: {
  placement: PreferredPlacement;
  rect: Rect;
  tooltipSize: ViewportSize;
  viewport: ViewportSize;
}) {
  if (placement === "center") {
    return true;
  }

  if (placement === "top") {
    return rect.top >= tooltipSize.height + TARGET_GAP + VIEWPORT_MARGIN;
  }

  if (placement === "bottom") {
    return (
      viewport.height - rect.bottom >=
      tooltipSize.height + TARGET_GAP + VIEWPORT_MARGIN
    );
  }

  if (placement === "left") {
    return rect.left >= tooltipSize.width + TARGET_GAP + VIEWPORT_MARGIN;
  }

  return (
    viewport.width - rect.right >=
    tooltipSize.width + TARGET_GAP + VIEWPORT_MARGIN
  );
}

function getBestFallbackPlacement(rect: Rect, viewport: ViewportSize) {
  const spaces = [
    { placement: "bottom" as const, size: viewport.height - rect.bottom },
    { placement: "top" as const, size: rect.top },
    { placement: "right" as const, size: viewport.width - rect.right },
    { placement: "left" as const, size: rect.left },
  ];

  return spaces.sort((first, second) => second.size - first.size)[0].placement;
}

function getTooltipStyleForPlacement({
  placement,
  rect,
  tooltipSize,
  viewport,
}: {
  placement: PreferredPlacement;
  rect: Rect;
  tooltipSize: ViewportSize;
  viewport: ViewportSize;
}): CSSProperties {
  if (placement === "center") {
    return getCenteredTooltipStyle(viewport, tooltipSize);
  }

  if (placement === "top" || placement === "bottom") {
    return {
      left: clamp(
        rect.left + rect.width / 2 - tooltipSize.width / 2,
        VIEWPORT_MARGIN,
        viewport.width - tooltipSize.width - VIEWPORT_MARGIN,
      ),
      top:
        placement === "top"
          ? clamp(
              rect.top - TARGET_GAP - tooltipSize.height,
              VIEWPORT_MARGIN,
              viewport.height - tooltipSize.height - VIEWPORT_MARGIN,
            )
          : clamp(
              rect.bottom + TARGET_GAP,
              VIEWPORT_MARGIN,
              viewport.height - tooltipSize.height - VIEWPORT_MARGIN,
            ),
    };
  }

  return {
    left:
      placement === "left"
        ? clamp(
            rect.left - TARGET_GAP - tooltipSize.width,
            VIEWPORT_MARGIN,
            viewport.width - tooltipSize.width - VIEWPORT_MARGIN,
          )
        : clamp(
            rect.right + TARGET_GAP,
            VIEWPORT_MARGIN,
            viewport.width - tooltipSize.width - VIEWPORT_MARGIN,
          ),
    top: clamp(
      rect.top + rect.height / 2 - tooltipSize.height / 2,
      VIEWPORT_MARGIN,
      viewport.height - tooltipSize.height - VIEWPORT_MARGIN,
    ),
  };
}

function buildFallbackLayout(
  viewport: ViewportSize,
  rawTooltipSize: ViewportSize,
): TourLayout {
  const tooltipSize = getTooltipSize(rawTooltipSize, viewport);

  return {
    fallback: true,
    placement: "center",
    spotlightRect: null,
    tooltipStyle: getCenteredTooltipStyle(viewport, tooltipSize),
  };
}

function buildTourLayout({
  rawTooltipSize,
  step,
  target,
  viewport,
}: {
  rawTooltipSize: ViewportSize;
  step: TourStep;
  target: HTMLElement | null;
  viewport: ViewportSize;
}): TourLayout {
  if (!target) {
    return buildFallbackLayout(viewport, rawTooltipSize);
  }

  const targetRect = rectFromDomRect(target.getBoundingClientRect());
  const isInViewport =
    targetRect.bottom > 0 &&
    targetRect.right > 0 &&
    targetRect.top < viewport.height &&
    targetRect.left < viewport.width;

  if (!isInViewport) {
    return buildFallbackLayout(viewport, rawTooltipSize);
  }

  const spotlightRect = getSpotlightRect(targetRect, viewport);

  if (!spotlightRect) {
    return buildFallbackLayout(viewport, rawTooltipSize);
  }

  const tooltipSize = getTooltipSize(rawTooltipSize, viewport);
  const placement = getPlacementOrder(step.preferredPlacement).find((item) =>
    placementFits({ placement: item, rect: spotlightRect, tooltipSize, viewport }),
  );

  if (!placement && viewport.width < MOBILE_BREAKPOINT) {
    return {
      fallback: false,
      placement: "sheet",
      spotlightRect,
      tooltipStyle: getSheetTooltipStyle(),
    };
  }

  const resolvedPlacement =
    placement ?? getBestFallbackPlacement(spotlightRect, viewport);

  return {
    fallback: false,
    placement: resolvedPlacement,
    spotlightRect,
    tooltipStyle: getTooltipStyleForPlacement({
      placement: resolvedPlacement,
      rect: spotlightRect,
      tooltipSize,
      viewport,
    }),
  };
}

function getScrollBehavior() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
}

function OverlayPanels({ spotlightRect }: { spotlightRect: Rect | null }) {
  const panelClassName =
    "fixed bg-foreground/40 backdrop-blur-sm transition-all duration-150";

  if (!spotlightRect) {
    return (
      <div
        aria-hidden="true"
        className="fixed inset-0 bg-foreground/40 backdrop-blur-sm"
      />
    );
  }

  return (
    <>
      <div
        aria-hidden="true"
        className={panelClassName}
        style={{
          bottom: `calc(100dvh - ${spotlightRect.top}px)`,
          left: 0,
          right: 0,
          top: 0,
        }}
      />
      <div
        aria-hidden="true"
        className={panelClassName}
        style={{
          bottom: 0,
          left: 0,
          right: 0,
          top: spotlightRect.bottom,
        }}
      />
      <div
        aria-hidden="true"
        className={panelClassName}
        style={{
          height: spotlightRect.height,
          left: 0,
          top: spotlightRect.top,
          width: spotlightRect.left,
        }}
      />
      <div
        aria-hidden="true"
        className={panelClassName}
        style={{
          height: spotlightRect.height,
          left: spotlightRect.right,
          right: 0,
          top: spotlightRect.top,
        }}
      />
    </>
  );
}

function Spotlight({ rect }: { rect: Rect | null }) {
  if (!rect) {
    return null;
  }

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed z-10 rounded-xl border-2 border-background ring-4 ring-primary/70 shadow-lg transition-all duration-150"
      data-tour-spotlight=""
      style={{
        height: rect.height,
        left: rect.left,
        top: rect.top,
        width: rect.width,
      }}
    />
  );
}

function TooltipPointer({
  hidden,
  placement,
}: {
  hidden: boolean;
  placement: TooltipPlacement;
}) {
  if (
    hidden ||
    placement === "center" ||
    placement === "sheet"
  ) {
    return null;
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        "absolute size-3 rotate-45 border border-border bg-card",
        placement === "top" &&
          "bottom-[-0.4rem] left-1/2 -translate-x-1/2 border-l-0 border-t-0",
        placement === "bottom" &&
          "left-1/2 top-[-0.4rem] -translate-x-1/2 border-b-0 border-r-0",
        placement === "left" &&
          "right-[-0.4rem] top-1/2 -translate-y-1/2 border-b-0 border-l-0",
        placement === "right" &&
          "left-[-0.4rem] top-1/2 -translate-y-1/2 border-r-0 border-t-0",
      )}
    />
  );
}

export function OnboardingTour() {
  const descriptionId = useId();
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [tooltipSize, setTooltipSize] =
    useState<ViewportSize>(defaultTooltipSize);
  const [layout, setLayout] = useState<TourLayout | null>(null);
  const step = steps[stepIndex];

  const updateLayout = useCallback(() => {
    if (!open) {
      return;
    }

    setLayout(
      buildTourLayout({
        rawTooltipSize: tooltipSize,
        step,
        target: getTourTarget(step.target),
        viewport: getViewportSize(),
      }),
    );
  }, [open, step, tooltipSize]);

  useEffect(() => {
    let initialOpenTimer: number | undefined;

    if (!hasSeenTour()) {
      initialOpenTimer = window.setTimeout(() => setOpen(true), 0);
    }

    function openTour() {
      setStepIndex(0);
      setLayout(null);
      setOpen(true);
    }

    window.addEventListener(OPEN_EVENT, openTour);

    return () => {
      if (initialOpenTimer) {
        window.clearTimeout(initialOpenTimer);
      }
      window.removeEventListener(OPEN_EVENT, openTour);
    };
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        markSeen();
        setLayout(null);
        setOpen(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    dialogRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const target = getTourTarget(step.target);

    target?.scrollIntoView({
      behavior: getScrollBehavior(),
      block: "center",
      inline: "center",
    });

    const frameId = window.requestAnimationFrame(updateLayout);

    const timers = [
      window.setTimeout(updateLayout, 150),
      window.setTimeout(updateLayout, 450),
    ];

    return () => {
      window.cancelAnimationFrame(frameId);
      for (const timer of timers) {
        window.clearTimeout(timer);
      }
    };
  }, [open, step.target, updateLayout]);

  useEffect(() => {
    if (!open) {
      return;
    }

    let frameId = 0;

    function scheduleUpdate() {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(updateLayout);
    }

    scheduleUpdate();
    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("scroll", scheduleUpdate, true);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("scroll", scheduleUpdate, true);
    };
  }, [open, updateLayout]);

  useEffect(() => {
    if (!open || !tooltipRef.current || typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(([entry]) => {
      const nextSize = {
        height: entry.contentRect.height,
        width: entry.contentRect.width,
      };

      setTooltipSize((current) =>
        Math.abs(current.height - nextSize.height) > 1 ||
        Math.abs(current.width - nextSize.width) > 1
          ? nextSize
          : current,
      );
    });

    observer.observe(tooltipRef.current);

    return () => observer.disconnect();
  }, [open]);

  if (!open) {
    return null;
  }

  function closeTour() {
    markSeen();
    setLayout(null);
    setOpen(false);
  }

  function nextStep() {
    if (stepIndex === steps.length - 1) {
      closeTour();
      return;
    }

    setStepIndex((current) => current + 1);
  }

  const currentLayout =
    layout ?? buildFallbackLayout(getViewportSize(), tooltipSize);
  const isSheet = currentLayout.placement === "sheet";
  const progress = `${((stepIndex + 1) / steps.length) * 100}%`;

  return (
    <div
      aria-describedby={descriptionId}
      aria-labelledby={titleId}
      aria-modal="true"
      className="fixed inset-0 z-50"
      ref={dialogRef}
      role="dialog"
      tabIndex={-1}
    >
      <OverlayPanels spotlightRect={currentLayout.spotlightRect} />
      <Spotlight rect={currentLayout.spotlightRect} />

      <div
        className={cn(
          "fixed z-20 max-h-[calc(100dvh-2rem)] w-[min(calc(100vw-2rem),24rem)] overflow-y-auto overscroll-contain rounded-xl border border-border bg-card p-4 text-card-foreground shadow-xl outline-none transition-[left,top,bottom,right] duration-150 sm:p-5",
          isSheet && "w-auto rounded-b-xl rounded-t-2xl",
        )}
        data-tour-fallback={currentLayout.fallback ? "true" : "false"}
        data-tour-placement={currentLayout.placement}
        data-tour-tooltip=""
        ref={tooltipRef}
        style={currentLayout.tooltipStyle}
      >
        <TooltipPointer
          hidden={currentLayout.fallback}
          placement={currentLayout.placement}
        />
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">
              Paso {stepIndex + 1} de {steps.length}
            </p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight" id={titleId}>
              {step.title}
            </h2>
          </div>
          <Button
            aria-label="Cerrar guia"
            onClick={closeTour}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <X aria-hidden="true" />
          </Button>
        </div>

        <p
          className="mt-4 text-sm leading-6 text-muted-foreground"
          id={descriptionId}
        >
          {step.description}
        </p>

        <div
          aria-hidden="true"
          className="mt-5 h-1.5 overflow-hidden rounded-full bg-muted"
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-150"
            style={{ width: progress }}
          />
        </div>

        <div className="mt-5 flex flex-wrap justify-between gap-2">
          <Button onClick={closeTour} type="button" variant="ghost">
            Saltar
          </Button>
          <div className="flex gap-2">
            <Button
              disabled={stepIndex === 0}
              onClick={() => setStepIndex((current) => Math.max(0, current - 1))}
              type="button"
              variant="outline"
            >
              Anterior
            </Button>
            <Button onClick={nextStep} type="button">
              {stepIndex === steps.length - 1 ? "Terminar" : "Siguiente"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function OnboardingLaunchButton({
  className,
  label = "Guia",
}: {
  className?: string;
  label?: string;
}) {
  function openTour() {
    clearSeenTour();
    window.dispatchEvent(new Event(OPEN_EVENT));
  }

  return (
    <Button
      className={className}
      onClick={openTour}
      type="button"
      variant="outline"
    >
      <CircleHelp aria-hidden="true" />
      {label}
    </Button>
  );
}
