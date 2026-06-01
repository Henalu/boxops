"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  CalendarDays,
  CalendarOff,
  FileText,
  Inbox,
  LogOut,
  Search,
  Settings,
  Timer,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react";

import {
  filterNavigationItems,
  getNavigationRole,
  isActivePath,
  mainItems,
  managementItems,
  normalizeSearchValue,
  personalItems,
  resolveAppNavigationHref,
  type AppNavigationMembership,
  type NavigationItem,
} from "@/components/layout/app-navigation";
import { OnboardingLaunchButton } from "@/components/layout/onboarding-tour";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  canManageOperationalData,
  canManageStaffWorkWindows,
  canReadTenantBilling,
  canUsePersonalFeatures,
  getApplicationRoleLabel,
} from "@/lib/auth/permissions";
import {
  getAbsencesPath,
  getAccountPath,
  getDocumentsPath,
  getRequestsPath,
  getSchedulePath,
  getSettingsPath,
  getTimePath,
} from "@/lib/navigation/app-paths";
import { PLATFORM_SUPPORT_ACCESS_ROLE } from "@/lib/platform-support-session-cookie";
import { cn } from "@/lib/utils";

export type MobileHeaderProfile = {
  avatarSignedUrl: string | null;
  displayName: string;
  email: string | null;
  organizationId: string;
  organizationName: string;
  role: string;
};

type MobileHeaderActionsProps = {
  memberships: AppNavigationMembership[];
  profiles: MobileHeaderProfile[];
};

type ProfileMenuLink = {
  href: string;
  icon: LucideIcon;
  label: string;
};

const PROFILE_DRAWER_EXIT_ANIMATION_MS = 180;

function getInitials(value: string) {
  const words = value
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean);

  if (words.length === 0) {
    return "TU";
  }

  return words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");
}

function navigationGroupIsVisible(items: readonly NavigationItem[]) {
  return items.length > 0;
}

function SearchResultLink({
  item,
  onNavigate,
  organizationId,
  pathname,
  week,
}: {
  item: NavigationItem;
  onNavigate: () => void;
  organizationId: string | null;
  pathname: string;
  week: string | null;
}) {
  const Icon = item.icon;
  const active = isActivePath(pathname, item.href);

  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-12 min-w-0 items-center gap-3 rounded-xl px-3 text-sm font-medium text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
        active && "bg-primary/10 text-primary",
      )}
      href={resolveAppNavigationHref({ href: item.href, organizationId, week })}
      onClick={onNavigate}
    >
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground",
          active && "bg-primary/15 text-primary",
        )}
      >
        <Icon aria-hidden="true" className="size-4" />
      </span>
      <span className="min-w-0 truncate">{item.label}</span>
    </Link>
  );
}

function ProfileDrawerLink({
  active,
  href,
  icon: Icon,
  label,
  onNavigate,
}: ProfileMenuLink & {
  active: boolean;
  onNavigate: () => void;
}) {
  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-12 min-w-0 items-center gap-3 rounded-xl px-3 text-sm font-medium text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
        active && "bg-primary/10 text-primary",
      )}
      href={href}
      onClick={onNavigate}
    >
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground",
          active && "bg-primary/15 text-primary",
        )}
      >
        <Icon aria-hidden="true" className="size-4" />
      </span>
      <span className="min-w-0 truncate">{label}</span>
    </Link>
  );
}

export function MobileHeaderActions({
  memberships,
  profiles,
}: MobileHeaderActionsProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const profileCloseTimerRef = useRef<number | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileClosing, setProfileClosing] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
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
  const currentProfile =
    (organizationId
      ? profiles.find((profile) => profile.organizationId === organizationId)
      : null) ??
    profiles[0] ??
    null;
  const displayName = currentProfile?.displayName ?? "Tu perfil";
  const initials = getInitials(displayName);
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
  const visiblePersonalItems =
    currentRole && !isSupportMode && canUsePersonalFeatures(currentRole)
      ? personalItems
      : [];
  const normalizedSearchQuery = normalizeSearchValue(searchQuery.trim());
  const filteredMainItems = filterNavigationItems(
    visibleMainItems,
    normalizedSearchQuery,
  );
  const filteredManagementItems = filterNavigationItems(
    visibleManagementItems,
    normalizedSearchQuery,
  );
  const filteredPersonalItems = filterNavigationItems(
    visiblePersonalItems,
    normalizedSearchQuery,
  );
  const hasSearchResults =
    filteredMainItems.length > 0 ||
    filteredManagementItems.length > 0 ||
    filteredPersonalItems.length > 0;
  const baseOptions = {
    organizationId,
    week,
  };
  const profileLinks: ProfileMenuLink[] = [
    {
      href: getSchedulePath({ ...baseOptions, mineOnly: true }),
      icon: CalendarDays,
      label: "Mi horario",
    },
    {
      href: getTimePath(baseOptions),
      icon: Timer,
      label: "Mi fichaje",
    },
    {
      href: getDocumentsPath(baseOptions),
      icon: FileText,
      label: "Mis documentos",
    },
    {
      href: getRequestsPath(baseOptions),
      icon: Inbox,
      label: "Solicitudes",
    },
    {
      href: getAbsencesPath(baseOptions),
      icon: CalendarOff,
      label: "Ausencias",
    },
    {
      href: getAccountPath(baseOptions),
      icon: UserRound,
      label: "Mi cuenta",
    },
  ];

  if (canManageOperational) {
    profileLinks.push({
      href: getSettingsPath(baseOptions),
      icon: Settings,
      label: "Configuracion",
    });
  }

  const clearProfileCloseTimer = useCallback(() => {
    if (profileCloseTimerRef.current === null) {
      return;
    }

    window.clearTimeout(profileCloseTimerRef.current);
    profileCloseTimerRef.current = null;
  }, []);

  const closeProfileMenu = useCallback(
    (options?: { immediate?: boolean }) => {
      if (!profileOpen && !profileClosing) {
        return;
      }

      clearProfileCloseTimer();

      const prefersReducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;

      if (options?.immediate || prefersReducedMotion) {
        setProfileClosing(false);
        setProfileOpen(false);
        return;
      }

      setProfileClosing(true);
      profileCloseTimerRef.current = window.setTimeout(() => {
        setProfileOpen(false);
        setProfileClosing(false);
        profileCloseTimerRef.current = null;
      }, PROFILE_DRAWER_EXIT_ANIMATION_MS);
    },
    [clearProfileCloseTimer, profileClosing, profileOpen],
  );

  useEffect(() => {
    return () => clearProfileCloseTimer();
  }, [clearProfileCloseTimer]);

  useEffect(() => {
    if (!profileOpen && !searchOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeProfileMenu();
        setSearchOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeProfileMenu, profileOpen, searchOpen]);

  useEffect(() => {
    if (!searchOpen) {
      return;
    }

    const timer = window.setTimeout(() => searchInputRef.current?.focus(), 0);

    return () => window.clearTimeout(timer);
  }, [searchOpen]);

  function closeMenus() {
    clearProfileCloseTimer();
    setProfileClosing(false);
    setProfileOpen(false);
    setSearchOpen(false);
  }

  function openSearch() {
    clearProfileCloseTimer();
    setSearchQuery("");
    setProfileClosing(false);
    setProfileOpen(false);
    setSearchOpen(true);
  }

  function openProfileMenu() {
    clearProfileCloseTimer();
    setSearchOpen(false);
    setProfileClosing(false);
    setProfileOpen(true);
  }

  return (
    <>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          aria-label="Buscar"
          className="rounded-full border-border/80 bg-background/80 shadow-sm"
          onClick={openSearch}
          size="icon-lg"
          type="button"
          variant="outline"
        >
          <Search aria-hidden="true" className="size-4" />
        </Button>
        <button
          aria-label="Abrir menu de perfil"
          aria-expanded={profileOpen && !profileClosing}
          className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-primary/10 text-sm font-semibold text-primary shadow-sm outline-none transition-colors hover:bg-primary/15 focus-visible:ring-3 focus-visible:ring-ring/50"
          onClick={openProfileMenu}
          type="button"
        >
          {currentProfile?.avatarSignedUrl ? (
            // Private signed URLs are short-lived and not configured as remote image domains.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt={`Avatar de ${displayName}`}
              className="size-full object-cover"
              src={currentProfile.avatarSignedUrl}
            />
          ) : (
            <span aria-hidden="true">{initials}</span>
          )}
        </button>
      </div>

      {typeof document !== "undefined" && searchOpen
        ? createPortal(
            <div
          aria-modal="true"
          className="fixed inset-0 z-50 bg-background text-foreground md:hidden"
          role="dialog"
        >
          <div className="flex min-h-[3.75rem] items-center gap-2 border-b border-border px-4 pt-[env(safe-area-inset-top)]">
            <div className="relative min-w-0 flex-1">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <input
                aria-label="Buscar en navegacion"
                className="h-11 w-full rounded-xl border border-border bg-muted/40 py-2 pl-10 pr-3 text-base outline-none transition-[border-color,box-shadow,background-color] placeholder:text-muted-foreground focus:border-primary/45 focus:bg-background focus:ring-3 focus:ring-primary/15"
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Buscar..."
                ref={searchInputRef}
                type="search"
                value={searchQuery}
              />
            </div>
            <Button
              aria-label="Cerrar busqueda"
              onClick={() => setSearchOpen(false)}
              size="icon-lg"
              type="button"
              variant="ghost"
            >
              <X aria-hidden="true" />
            </Button>
          </div>

          <div className="h-[calc(100dvh-3.75rem)] overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4">
            {!hasSearchResults ? (
              <p className="rounded-xl border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
                Sin resultados para esta busqueda.
              </p>
            ) : null}

            {navigationGroupIsVisible(filteredMainItems) ? (
              <section className="grid gap-1">
                <h2 className="px-3 pb-1 text-xs font-medium text-muted-foreground">
                  Principal
                </h2>
                {filteredMainItems.map((item) => (
                  <SearchResultLink
                    item={item}
                    key={item.href}
                    onNavigate={closeMenus}
                    organizationId={organizationId}
                    pathname={pathname}
                    week={week}
                  />
                ))}
              </section>
            ) : null}

            {navigationGroupIsVisible(filteredPersonalItems) ? (
              <section className="mt-5 grid gap-1">
                <h2 className="px-3 pb-1 text-xs font-medium text-muted-foreground">
                  Personal
                </h2>
                {filteredPersonalItems.map((item) => (
                  <SearchResultLink
                    item={item}
                    key={item.href}
                    onNavigate={closeMenus}
                    organizationId={organizationId}
                    pathname={pathname}
                    week={week}
                  />
                ))}
              </section>
            ) : null}

            {navigationGroupIsVisible(filteredManagementItems) ? (
              <section className="mt-5 grid gap-1">
                <h2 className="px-3 pb-1 text-xs font-medium text-muted-foreground">
                  {canManageOperational ? "Gestion" : "Consulta"}
                </h2>
                {filteredManagementItems.map((item) => (
                  <SearchResultLink
                    item={item}
                    key={item.href}
                    onNavigate={closeMenus}
                    organizationId={organizationId}
                    pathname={pathname}
                    week={week}
                  />
                ))}
              </section>
            ) : null}
          </div>
            </div>,
            document.body,
          )
        : null}

      {typeof document !== "undefined" && profileOpen
        ? createPortal(
            <div
          aria-modal="true"
          className="fixed inset-0 z-50 md:hidden"
          role="dialog"
        >
          <button
            aria-label="Cerrar menu de perfil"
            className={cn(
              "absolute inset-0 bg-foreground/35 backdrop-blur-sm motion-reduce:animate-none",
              profileClosing
                ? "animate-out fade-out duration-150 ease-out"
                : "animate-in fade-in duration-200 ease-out",
            )}
            onClick={() => closeProfileMenu()}
            type="button"
          />
          <aside
            className={cn(
              "absolute bottom-0 right-0 top-0 flex w-[min(90vw,24rem)] translate-x-0 flex-col border-l border-border bg-background pt-[env(safe-area-inset-top)] shadow-xl will-change-transform motion-reduce:animate-none",
              profileClosing
                ? "animate-out fade-out slide-out-to-right-8 duration-150 ease-out"
                : "animate-in fade-in slide-in-from-right-8 duration-200 ease-out",
            )}
          >
            <div className="flex min-h-[3.75rem] items-center justify-between gap-3 border-b border-border px-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-sm font-semibold text-primary ring-1 ring-border">
                  {currentProfile?.avatarSignedUrl ? (
                    // Private signed URLs are short-lived and not configured as remote image domains.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      alt={`Avatar de ${displayName}`}
                      className="size-full object-cover"
                      src={currentProfile.avatarSignedUrl}
                    />
                  ) : (
                    <span aria-hidden="true">{initials}</span>
                  )}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{displayName}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {currentRole
                      ? getApplicationRoleLabel(currentRole)
                      : "Cuenta activa"}
                  </p>
                </div>
              </div>
              <Button
                aria-label="Cerrar menu de perfil"
                onClick={() => closeProfileMenu()}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <X aria-hidden="true" />
              </Button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
              {currentProfile?.organizationName ? (
                <p className="mb-3 truncate px-3 text-xs text-muted-foreground">
                  {currentProfile.organizationName}
                </p>
              ) : null}

              <nav aria-label="Menu personal" className="grid gap-1">
                {profileLinks.map((item) => (
                  <ProfileDrawerLink
                    active={
                      item.href.includes("?")
                        ? pathname === item.href.split("?")[0]
                        : isActivePath(pathname, item.href)
                    }
                    href={item.href}
                    icon={item.icon}
                    key={`${item.label}-${item.href}`}
                    label={item.label}
                    onNavigate={closeMenus}
                  />
                ))}
              </nav>

              <Separator className="my-4" />

              <OnboardingLaunchButton
                className="w-full justify-start"
                label="Guia"
                onLaunch={() => closeProfileMenu()}
              />
            </div>

            <div className="border-t border-border px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
              {currentProfile?.email ? (
                <p className="mb-3 truncate px-3 text-xs text-muted-foreground">
                  {currentProfile.email}
                </p>
              ) : null}
              <form action="/auth/sign-out" method="post">
                <Button
                  className="w-full justify-start"
                  type="submit"
                  variant="outline"
                >
                  <LogOut aria-hidden="true" />
                  Cerrar sesion
                </Button>
              </form>
            </div>
          </aside>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
