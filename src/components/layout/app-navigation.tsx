"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  CalendarDays,
  CalendarClock,
  CalendarOff,
  CalendarRange,
  ChevronRight,
  Dumbbell,
  FileText,
  Home,
  Inbox,
  LayoutGrid,
  MapPin,
  ReceiptText,
  Search,
  Settings,
  ShieldAlert,
  Timer,
  UserRound,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

import {
  canManageOperationalData,
  canManageStaffWorkWindows,
  canReadTenantBilling,
} from "@/lib/auth/permissions";
import { PLATFORM_SUPPORT_ACCESS_ROLE } from "@/lib/platform-support-session-cookie";
import { cn } from "@/lib/utils";
import {
  getAppPath,
  getAbsencesPath,
  getAccountPath,
  getCentersPath,
  getClassTypesPath,
  getCoachesPath,
  getCoveragePath,
  getDocumentsPath,
  getMorePath,
  getRequestsPath,
  getSchedulePath,
  getScheduleTemplatesPath,
  getSettingsPath,
  getSettingsBillingPath,
  getTimePath,
  getWorkWindowsPath,
} from "@/lib/navigation/app-paths";

export type AppNavigationMembership = {
  organizationId: string;
  role: string;
};

type AppNavigationProps = {
  memberships: {
    organizationId: string;
    role: string;
  }[];
  placement: "bottom" | "sidebar";
};

export type NavigationItem = {
  readonly href: string;
  readonly icon: LucideIcon;
  readonly label: string;
  readonly keywords?: readonly string[];
  readonly tour?: string;
};

export const mainItems = [
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
    keywords: ["mas", "menu"],
    tour: "nav-management",
  },
] as const satisfies readonly NavigationItem[];

export const managementItems = [
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
  {
    href: "/app/work-windows",
    icon: CalendarClock,
    label: "Jornadas",
  },
  {
    href: "/app/settings",
    icon: Settings,
    label: "Configuración",
    keywords: ["configuracion", "ajustes"],
  },
  {
    href: "/app/settings/billing",
    icon: ReceiptText,
    label: "Plan y facturacion",
    keywords: ["billing", "facturacion", "plan", "limites"],
  },
] as const satisfies readonly NavigationItem[];

export const personalItems = [
  {
    href: "/app/absences",
    icon: CalendarOff,
    label: "Ausencias",
  },
  {
    href: "/app/requests",
    icon: Inbox,
    label: "Solicitudes",
  },
  {
    href: "/app/documents",
    icon: FileText,
    label: "Documentos",
  },
  {
    href: "/app/account",
    icon: UserRound,
    label: "Mi cuenta",
  },
  {
    href: "/app/time",
    icon: Timer,
    label: "Mi fichaje",
    keywords: ["fichaje", "tiempo"],
  },
] as const satisfies readonly NavigationItem[];

const mobileMorePaths = [
  "/app/absences",
  "/app/requests",
  "/app/documents",
  "/app/account",
  "/app/time",
  "/app/centers",
  "/app/class-types",
  "/app/templates",
  "/app/work-windows",
  "/app/stats",
  "/app/settings",
  "/app/settings/billing",
];

const secondaryMorePaths = ["/app/stats"];

export function getNavigationRole({
  memberships,
  organizationId,
}: {
  memberships: AppNavigationMembership[];
  organizationId: string | null;
}) {
  const selectedMembership = organizationId
    ? memberships.find((membership) => membership.organizationId === organizationId)
    : null;

  return selectedMembership?.role ?? memberships[0]?.role ?? null;
}

export function isActivePath(pathname: string, href: string) {
  if (href === "/app/more") {
    return (
      pathname === href ||
      secondaryMorePaths.some((path) => pathname.startsWith(path))
    );
  }

  if (href === "/app/settings") {
    return pathname === href;
  }

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

export function normalizeSearchValue(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function getItemSearchValue(item: NavigationItem) {
  return normalizeSearchValue(
    [item.label, item.href, ...(item.keywords ?? [])].join(" "),
  );
}

export function filterNavigationItems<T extends NavigationItem>(
  items: readonly T[],
  query: string,
) {
  if (!query) {
    return items;
  }

  return items.filter((item) => getItemSearchValue(item).includes(query));
}

export function resolveAppNavigationHref({
  href,
  organizationId,
  week,
}: {
  href: string;
  organizationId: string | null;
  week: string | null;
}) {
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

  if (href === "/app/account") {
    return getAccountPath({ organizationId });
  }

  if (href === "/app/requests") {
    return getRequestsPath({ organizationId, week });
  }

  if (href === "/app/absences") {
    return getAbsencesPath({ organizationId });
  }

  if (href === "/app/documents") {
    return getDocumentsPath({ organizationId });
  }

  if (href === "/app/time") {
    return getTimePath({ organizationId });
  }

  if (href === "/app/centers") {
    return getCentersPath({ organizationId });
  }

  if (href === "/app/class-types") {
    return getClassTypesPath({ organizationId });
  }

  if (href === "/app/work-windows") {
    return getWorkWindowsPath({ organizationId, week });
  }

  if (href === "/app/settings") {
    return getSettingsPath({ organizationId });
  }

  if (href === "/app/settings/billing") {
    return getSettingsBillingPath({ organizationId });
  }

  return getScheduleTemplatesPath({ organizationId, week });
}

export function AppNavigation({ memberships, placement }: AppNavigationProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const managementSectionId = useId();
  const personalSectionId = useId();
  const organizationId = searchParams.get("organizationId");
  const week = searchParams.get("week");
  const currentRole = getNavigationRole({ memberships, organizationId });
  const canManageOperational = currentRole
    ? canManageOperationalData(currentRole)
    : false;
  const canManageWorkWindows = currentRole
    ? canManageStaffWorkWindows(currentRole)
    : false;
  const isSupportMode = currentRole === PLATFORM_SUPPORT_ACCESS_ROLE;
  const visibleMainItems = mainItems.filter((item) => {
    if (item.href === "/app/coverage") {
      return canManageOperational;
    }

    return true;
  });
  const visibleManagementItems = managementItems.filter((item) => {
    if (item.href === "/app/work-windows") {
      return canManageWorkWindows;
    }

    if (item.href === "/app/templates" || item.href === "/app/settings") {
      return canManageOperational;
    }

    if (item.href === "/app/settings/billing") {
      return currentRole ? canReadTenantBilling(currentRole) : false;
    }

    return true;
  });
  const managementHasActiveItem = visibleManagementItems.some((item) =>
    isActivePath(pathname, item.href),
  );
  const personalHasActiveItem = personalItems.some((item) =>
    isActivePath(pathname, item.href),
  );
  const [managementOpen, setManagementOpen] = useState(false);
  const [personalOpen, setPersonalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const normalizedSearchQuery = normalizeSearchValue(searchQuery.trim());
  const filteredMainItems = filterNavigationItems(
    visibleMainItems,
    normalizedSearchQuery,
  );
  const filteredManagementItems = filterNavigationItems(
    visibleManagementItems,
    normalizedSearchQuery,
  );
  const filteredPersonalItems = isSupportMode
    ? []
    : filterNavigationItems(personalItems, normalizedSearchQuery);
  const hasSearchQuery = normalizedSearchQuery.length > 0;
  const showManagementItems = hasSearchQuery
    ? filteredManagementItems.length > 0
    : managementOpen || managementHasActiveItem;
  const showPersonalItems = hasSearchQuery
    ? filteredPersonalItems.length > 0
    : personalOpen || personalHasActiveItem;
  const hasSearchResults =
    filteredMainItems.length > 0 ||
    filteredManagementItems.length > 0 ||
    filteredPersonalItems.length > 0;

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (placement !== "sidebar") {
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [placement]);

  function renderSidebarLink(item: NavigationItem) {
    const Icon = item.icon;
    const active = isActivePath(pathname, item.href);

    return (
      <Link
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex min-h-9 w-full min-w-0 items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
          active &&
            "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
        )}
        data-tour={item.tour}
        href={resolveAppNavigationHref({ href: item.href, organizationId, week })}
        key={item.href}
      >
        <Icon aria-hidden="true" className="size-4 shrink-0" />
        <span className="min-w-0 truncate">{item.label}</span>
      </Link>
    );
  }

  if (placement === "bottom") {
    return (
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 md:hidden">
        <div className="h-6 bg-gradient-to-t from-background to-transparent" />
        <nav
          aria-label="Navegación principal"
          className="pointer-events-auto mx-3 mb-2 rounded-2xl border border-border/70 bg-background/90 px-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5 shadow-lg backdrop-blur-xl"
        >
          <div
            className={cn(
              "mx-auto grid max-w-md gap-1",
              visibleMainItems.length === 4 ? "grid-cols-4" : "grid-cols-5",
            )}
          >
            {visibleMainItems.map((item) => {
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
                  href={resolveAppNavigationHref({
                    href: item.href,
                    organizationId,
                    week,
                  })}
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
    <nav
      aria-label="Navegación principal"
      className="grid min-w-0 gap-3 overflow-x-hidden px-0.5 pb-0.5"
    >
      <div className="group/search relative flex h-9 min-w-0 items-center rounded-xl border border-border/80 bg-background/80 text-sm shadow-sm transition-[background-color,border-color,box-shadow] focus-within:border-primary/45 focus-within:bg-background focus-within:ring-3 focus-within:ring-primary/15">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <input
          aria-label="Buscar en navegación"
          className="h-full min-w-0 flex-1 rounded-[inherit] bg-transparent py-1 pl-8 pr-[4.75rem] text-sm outline-none placeholder:text-muted-foreground"
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Buscar..."
          ref={searchInputRef}
          type="search"
          value={searchQuery}
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-1.5 top-1/2 hidden -translate-y-1/2 items-center gap-1 lg:flex"
        >
          <kbd className="rounded-md border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium leading-none text-muted-foreground">
            Ctrl
          </kbd>
          <kbd className="rounded-md border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium leading-none text-muted-foreground">
            K
          </kbd>
        </span>
      </div>

      {filteredMainItems.length > 0 ? (
        <div className="grid min-w-0 gap-1">
          {filteredMainItems.map((item) => renderSidebarLink(item))}
        </div>
      ) : null}

      {!hasSearchResults ? (
        <p className="rounded-lg px-3 py-2 text-sm text-muted-foreground">
          Sin resultados
        </p>
      ) : null}

      {visibleManagementItems.length > 0 &&
      filteredManagementItems.length > 0 ? (
        <div className="grid min-w-0 gap-1">
          <button
            aria-controls={managementSectionId}
            aria-expanded={showManagementItems}
            className="flex h-8 w-full min-w-0 items-center justify-between rounded-lg px-2 text-xs font-medium text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
            onClick={() => setManagementOpen((open) => !open)}
            type="button"
          >
            <span className="min-w-0 truncate">
              {canManageOperational ? "Gestión" : "Consulta"}
            </span>
            <ChevronRight
              aria-hidden="true"
              className={cn(
                "size-3.5 shrink-0 transition-transform",
                showManagementItems && "rotate-90",
              )}
            />
          </button>
          <div
            className={cn(
              "grid transition-[grid-template-rows] duration-150 ease-out",
              showManagementItems ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
            )}
            id={managementSectionId}
          >
            <div className="min-h-0 min-w-0 overflow-hidden">
              <div className="grid min-w-0 gap-1 pt-1">
                {filteredManagementItems.map((item) =>
                  renderSidebarLink(item),
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {filteredPersonalItems.length > 0 ? (
        <div className="grid min-w-0 gap-1">
          <button
            aria-controls={personalSectionId}
            aria-expanded={showPersonalItems}
            className="flex h-8 w-full min-w-0 items-center justify-between rounded-lg px-2 text-xs font-medium text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
            onClick={() => setPersonalOpen((open) => !open)}
            type="button"
          >
            <span className="min-w-0 truncate">Personal</span>
            <ChevronRight
              aria-hidden="true"
              className={cn(
                "size-3.5 shrink-0 transition-transform",
                showPersonalItems && "rotate-90",
              )}
            />
          </button>
          <div
            className={cn(
              "grid transition-[grid-template-rows] duration-150 ease-out",
              showPersonalItems ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
            )}
            id={personalSectionId}
          >
            <div className="min-h-0 min-w-0 overflow-hidden">
              <div className="grid min-w-0 gap-1 pt-1">
                {filteredPersonalItems.map((item) => renderSidebarLink(item))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </nav>
  );
}
