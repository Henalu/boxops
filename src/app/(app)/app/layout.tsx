import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AppNavigation } from "@/components/layout/app-navigation";
import {
  OnboardingLaunchButton,
  OnboardingTour,
} from "@/components/layout/onboarding-tour";
import { Button } from "@/components/ui/button";
import { getLoginPath } from "@/lib/auth/redirects";
import { getAuthenticatedUser } from "@/lib/auth/tenant";

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

  return (
    <div className="min-h-screen bg-muted/35 text-foreground">
      <div className="md:grid md:min-h-screen md:grid-cols-[248px_minmax(0,1fr)]">
        <aside className="sticky top-0 hidden h-screen flex-col border-r border-border bg-background/95 px-4 py-5 md:flex">
          <div className="mb-7">
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
                  Operacion semanal
                </span>
              </span>
            </Link>
          </div>

          <div className="min-h-0 flex-1">
            <Suspense
              fallback={
                <nav aria-label="Navegacion principal" className="h-40" />
              }
            >
              <AppNavigation placement="sidebar" />
            </Suspense>
          </div>

          <div className="grid gap-3 border-t border-border pt-4">
            <OnboardingLaunchButton className="justify-start" />
            <p className="truncate text-xs text-muted-foreground">
              {user.email ?? user.id}
            </p>
            <form action="/auth/sign-out" method="post">
              <Button className="w-full" type="submit" variant="outline">
                Cerrar sesion
              </Button>
            </form>
          </div>
        </aside>

        <div className="min-w-0">
          <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden">
            <div className="flex min-h-14 items-center justify-between gap-3 px-4">
              <Link
                className="flex min-w-0 items-center gap-2 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                href="/app"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">
                  B
                </span>
                <span className="min-w-0 truncate text-base font-semibold tracking-tight">
                  BoxOps
                </span>
              </Link>
              <div className="flex items-center gap-2">
                <OnboardingLaunchButton label="Guia" />
                <form action="/auth/sign-out" method="post">
                  <Button size="sm" type="submit" variant="ghost">
                    Salir
                  </Button>
                </form>
              </div>
            </div>
          </header>

          <main className="mx-auto w-full max-w-6xl px-4 pb-28 pt-4 sm:px-6 md:pb-8 md:pt-8 lg:px-8">
            {children}
          </main>
        </div>
      </div>

      <Suspense
        fallback={<nav aria-label="Navegacion principal" className="h-16" />}
      >
        <AppNavigation placement="bottom" />
      </Suspense>
      <OnboardingTour />
    </div>
  );
}
