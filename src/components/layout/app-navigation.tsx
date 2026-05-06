"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  CalendarDays,
  CalendarRange,
  Dumbbell,
  Home,
  LayoutGrid,
  MapPin,
  ShieldAlert,
  UsersRound,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  getAppPath,
  getCentersPath,
  getClassTypesPath,
  getCoachesPath,
  getCoveragePath,
  getMorePath,
  getSchedulePath,
  getScheduleTemplatesPath,
} from "@/lib/navigation/app-paths";

type AppNavigationProps = {
  placement: "bottom" | "sidebar";
};

const mainItems = [
  {
    href: "/app",
    icon: Home,
    label: "Inicio",
    tour: "nav-home",
  },
  {
    href: "/app/schedule",
    icon: CalendarDays,
    label: "Horario",
    tour: "nav-schedule",
  },
  {
    href: "/app/coverage",
    icon: ShieldAlert,
    label: "Cobertura",
    tour: "nav-coverage",
  },
  {
    href: "/app/coaches",
    icon: UsersRound,
    label: "Equipo",
    tour: "nav-team",
  },
  {
    href: "/app/more",
    icon: LayoutGrid,
    label: "Más",
    tour: "nav-management",
  },
] as const;

const managementItems = [
  {
    href: "/app/centers",
    icon: MapPin,
    label: "Centros",
  },
  {
    href: "/app/class-types",
    icon: Dumbbell,
    label: "Tipos de actividad",
  },
  {
    href: "/app/templates",
    icon: CalendarRange,
    label: "Plantillas",
  },
] as const;

const mobileMorePaths = ["/app/centers", "/app/class-types", "/app/templates"];

function isActivePath(pathname: string, href: string) {
  return href === "/app" ? pathname === "/app" : pathname.startsWith(href);
}

function isBottomActivePath(pathname: string, href: string) {
  if (href === "/app/more") {
    return (
      isActivePath(pathname, href) ||
      mobileMorePaths.some((path) => pathname.startsWith(path))
    );
  }

  return isActivePath(pathname, href);
}

export function AppNavigation({ placement }: AppNavigationProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const organizationId = searchParams.get("organizationId");
  const week = searchParams.get("week");

  function resolveHref(href: string) {
    if (href === "/app") {
      return getAppPath("/app", { organizationId, week });
    }

    if (href === "/app/schedule") {
      return getSchedulePath({ organizationId, week });
    }

    if (href === "/app/coverage") {
      return getCoveragePath({ organizationId, week });
    }

    if (href === "/app/coaches") {
      return getCoachesPath({ organizationId });
    }

    if (href === "/app/more") {
      return getMorePath({ organizationId, week });
    }

    if (href === "/app/centers") {
      return getCentersPath({ organizationId });
    }

    if (href === "/app/class-types") {
      return getClassTypesPath({ organizationId });
    }

    return getScheduleTemplatesPath({ organizationId, week });
  }

  if (placement === "bottom") {
    return (
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 md:hidden">
        <div className="h-6 bg-gradient-to-t from-background to-transparent" />
        <nav
          aria-label="Navegación principal"
          className="pointer-events-auto mx-3 mb-2 rounded-2xl border border-border/70 bg-background/90 px-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5 shadow-lg backdrop-blur-xl"
        >
          <div className="mx-auto grid max-w-md grid-cols-5 gap-1">
            {mainItems.map((item) => {
              const Icon = item.icon;
              const active = isBottomActivePath(pathname, item.href);

              return (
                <Link
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex min-h-[58px] flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[11px] font-medium text-muted-foreground transition-colors",
                    "focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                    active && "text-primary",
                  )}
                  data-tour={item.tour}
                  href={resolveHref(item.href)}
                  key={item.href}
                >
                  <span
                    className={cn(
                      "flex size-8 items-center justify-center rounded-xl transition-colors",
                      active && "bg-primary/10",
                    )}
                  >
                    <Icon
                      aria-hidden="true"
                      className="size-4"
                      strokeWidth={active ? 2.3 : 1.9}
                    />
                  </span>
                  <span className="max-w-full truncate">{item.label}</span>
                  {active ? (
                    <span
                      aria-hidden="true"
                      className="absolute bottom-0.5 h-0.5 w-1.5 rounded-full bg-primary"
                    />
                  ) : null}
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    );
  }

  return (
    <nav aria-label="Navegación principal" className="grid gap-6">
      <div className="grid gap-1">
        <div className="mb-1 flex items-center justify-between">
          <p className="px-2 text-xs font-medium text-muted-foreground">
            Principal
          </p>
          <Badge variant="outline">Operativa</Badge>
        </div>
        {mainItems.map((item) => {
          const Icon = item.icon;
          const active = isActivePath(pathname, item.href);

          return (
            <Link
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                active && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
              )}
              data-tour={item.tour}
              href={resolveHref(item.href)}
              key={item.href}
            >
              <Icon aria-hidden="true" className="size-4" />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </div>

      <div className="grid gap-1">
        <p className="mb-1 px-2 text-xs font-medium text-muted-foreground">
          Gestión
        </p>
        {managementItems.map((item) => {
          const Icon = item.icon;
          const active = isActivePath(pathname, item.href);

          return (
            <Link
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-9 items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                active && "bg-secondary text-secondary-foreground",
              )}
              href={resolveHref(item.href)}
              key={item.href}
            >
              <Icon aria-hidden="true" className="size-4" />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
