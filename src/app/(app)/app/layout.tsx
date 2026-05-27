import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Clock3, LifeBuoy, ShieldCheck } from "lucide-react";

import { AppNavigation } from "@/components/layout/app-navigation";
import {
  NextAssignedShellLink,
  type NextAssignedShellItem,
} from "@/components/layout/next-assigned-shell-link";
import {
  OnboardingLaunchButton,
  OnboardingTour,
} from "@/components/layout/onboarding-tour";
import { TenantThemeScope } from "@/components/layout/tenant-theme-scope";
import { Button } from "@/components/ui/button";
import {
  getRequiredPasswordChangePath,
  isPasswordChangeRequired,
} from "@/lib/auth/required-password-change";
import { getLoginPath } from "@/lib/auth/redirects";
import { getActiveMemberships, getAuthenticatedUser } from "@/lib/auth/tenant";
import { getOwnNextAssignedScheduleBlock } from "@/lib/own-schedule";
import { getActivePlatformAdmin } from "@/lib/platform-console";
import { endPlatformSupportSessionAction } from "@/lib/platform-console-actions";

function formatSupportExpiresAt(value: string) {
  try {
    return new Intl.DateTimeFormat("es-ES", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Europe/Madrid",
    }).format(new Date(value));
  } catch {
    return "caducidad no disponible";
  }
}

function PlatformSupportModeBanner({
  organizationId,
  organizationName,
  supportSession,
}: {
  organizationId: string;
  organizationName: string;
  supportSession: NonNullable<
    Awaited<ReturnType<typeof getActiveMemberships>>[number]["platformSupportSession"]
  >;
}) {
  return (
    <section className="border-b border-amber-300/50 bg-amber-50 text-amber-950">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-3 py-3 sm:px-4 md:flex-row md:items-center md:justify-between md:px-5 lg:px-6 2xl:px-8">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-800">
            <LifeBuoy aria-hidden="true" className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">
              Modo soporte BoxOps activo
            </p>
            <p className="mt-1 text-sm leading-5 text-amber-900/85">
              Estas revisando{" "}
              <span className="font-medium">{organizationName}</span> sin
              suplantar usuarios ni crear memberships. Caduca el{" "}
              {formatSupportExpiresAt(supportSession.expiresAt)}.
            </p>
          </div>
        </div>
        <form action={endPlatformSupportSessionAction}>
          <input name="organizationId" type="hidden" value={organizationId} />
          <input
            name="supportSessionId"
            type="hidden"
            value={supportSession.supportSessionId}
          />
          <Button
            className="w-full border-amber-300 bg-white text-amber-950 hover:bg-amber-100 md:w-auto"
            size="sm"
            type="submit"
            variant="outline"
          >
            <Clock3 aria-hidden="true" />
            Cerrar soporte
          </Button>
        </form>
      </div>
    </section>
  );
}

export const dynamic = "force-dynamic";

export default async function ProtectedAppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect(getLoginPath("/app"));
  }

  if (isPasswordChangeRequired(user)) {
    redirect(getRequiredPasswordChangePath());
  }

  const memberships = await getActiveMemberships(user.id);
  const navigationMemberships = memberships.map((membership) => ({
    organizationId: membership.organization.id,
    role: membership.role,
  }));
  const themeOrganizations = memberships.map((membership) => ({
    id: membership.organization.id,
    themeConfig: membership.organization.theme_config,
  }));
  const nextAssignedShellItems = (
    await Promise.all(
      memberships.map(async (membership) => {
        try {
          const state = await getOwnNextAssignedScheduleBlock({
            organizationId: membership.organization.id,
            organizationTimezone: membership.organization.timezone,
            userId: user.id,
          });

          return {
            organizationId: membership.organization.id,
            organizationName: membership.organization.name,
            state,
          } satisfies NextAssignedShellItem;
        } catch {
          return null;
        }
      }),
    )
  ).flatMap((item) => (item ? [item] : []));
  const activePlatformAdminResult = await getActivePlatformAdmin().catch(
    () => null,
  );
  const canOpenConsole = activePlatformAdminResult?.ok === true;
  const supportMembership =
    memberships.find((membership) => membership.accessMode === "platform_support") ??
    null;

  return (
    <TenantThemeScope organizations={themeOrganizations}>
      <div className="min-h-screen bg-muted/35 text-foreground">
        <div className="md:grid md:min-h-screen md:grid-cols-[248px_minmax(0,1fr)]">
          <aside className="sticky top-0 hidden h-screen flex-col border-r border-border bg-background/95 px-4 py-5 md:flex">
            <div className="mb-5">
              <Link
                className="flex min-w-0 items-center gap-2 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                href="/app"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">
                  B
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-base font-semibold tracking-tight">
                    BoxOps
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    Operación semanal
                  </span>
                </span>
              </Link>
            </div>

            <NextAssignedShellLink
              className="mb-4"
              items={nextAssignedShellItems}
              placement="sidebar"
            />

            <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto pr-1">
              <Suspense
                fallback={
                  <nav aria-label="Navegación principal" className="h-40" />
                }
              >
                <AppNavigation
                  memberships={navigationMemberships}
                  placement="sidebar"
                />
              </Suspense>
            </div>

            <div className="mt-4 grid gap-2 border-t border-border pt-4">
              {canOpenConsole ? (
                <Button asChild className="justify-start" variant="secondary">
                  <Link href="/console">
                    <ShieldCheck aria-hidden="true" />
                    BoxOps Console
                  </Link>
                </Button>
              ) : null}
              <OnboardingLaunchButton className="justify-start" />
              <p className="truncate text-xs text-muted-foreground">
                {user.email ?? user.id}
              </p>
              <form action="/auth/sign-out" method="post">
                <Button className="w-full" type="submit" variant="outline">
                  Cerrar sesión
                </Button>
              </form>
            </div>
          </aside>

          <div className="min-w-0">
            <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden">
              <div className="flex min-h-[3.25rem] items-center justify-between gap-3 px-4 pt-[env(safe-area-inset-top)]">
                <Link
                  className="flex min-h-11 min-w-0 shrink-0 items-center gap-2 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  href="/app"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">
                    B
                  </span>
                  <span className="min-w-0 truncate text-base font-semibold tracking-tight">
                    BoxOps
                  </span>
                </Link>
                <NextAssignedShellLink
                  items={nextAssignedShellItems}
                  placement="mobile-header"
                />
                <OnboardingLaunchButton className="shrink-0" label="Guía" />
              </div>
            </header>

            {supportMembership?.platformSupportSession ? (
              <PlatformSupportModeBanner
                organizationId={supportMembership.organization.id}
                organizationName={supportMembership.organization.name}
                supportSession={supportMembership.platformSupportSession}
              />
            ) : null}

            <main className="mx-auto w-full max-w-7xl px-3 pb-[calc(env(safe-area-inset-bottom)+7rem)] pt-3 sm:px-4 md:px-5 md:pb-8 md:pt-8 lg:px-6 2xl:px-8">
              {children}
            </main>
          </div>
        </div>

        <Suspense
          fallback={<nav aria-label="Navegación principal" className="h-16" />}
        >
          <AppNavigation
            memberships={navigationMemberships}
            placement="bottom"
          />
        </Suspense>
        <OnboardingTour memberships={navigationMemberships} />
      </div>
    </TenantThemeScope>
  );
}
