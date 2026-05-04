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
    label: "Mas",
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

function isActivePath(pathname: string, href: string) {
  return href === "/app" ? pathname === "/app" : pathname.startsWith(href);
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
      <nav
        aria-label="Navegacion principal"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2 backdrop-blur md:hidden"
      >
        <div className="mx-auto grid max-w-md grid-cols-5 gap-1">
          {mainItems.map((item) => {
            const Icon = item.icon;
            const active = isActivePath(pathname, item.href);

            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[11px] font-medium text-muted-foreground transition-colors",
                  active && "bg-primary text-primary-foreground",
                )}
                data-tour={item.tour}
                href={resolveHref(item.href)}
                key={item.href}
              >
                <Icon aria-hidden="true" className="size-4" />
                <span className="max-w-full truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    );
  }

  return (
    <nav aria-label="Navegacion principal" className="grid gap-6">
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
          Gestion
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
