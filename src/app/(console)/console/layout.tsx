import Link from "next/link";
import { Boxes, LogOut, ReceiptText } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function ConsoleLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-screen bg-muted/35 text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex min-h-16 w-full max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <Link
            className="flex min-w-0 items-center gap-3 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            href="/console"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">
              B
            </span>
            <span className="min-w-0">
              <span className="block truncate text-base font-semibold tracking-tight">
                BoxOps Console
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                Operaciones internas
              </span>
            </span>
          </Link>

          <div className="flex min-w-0 items-center gap-2">
            <nav
              aria-label="Navegacion de Console"
              className="hidden min-w-0 items-center gap-1 sm:flex"
            >
              <Link
                className="inline-flex h-8 min-w-0 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                href="/console"
              >
                <Boxes aria-hidden="true" className="size-4 shrink-0" />
                <span className="truncate">Organizaciones</span>
              </Link>
              <Link
                className="inline-flex h-8 min-w-0 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                href="/console/plans"
              >
                <ReceiptText aria-hidden="true" className="size-4 shrink-0" />
                <span className="truncate">Planes</span>
              </Link>
            </nav>

            <form action="/auth/sign-out" method="post">
              <Button aria-label="Cerrar sesion" size="icon" type="submit" variant="outline">
                <LogOut aria-hidden="true" />
              </Button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 md:py-8 lg:px-8">
        {children}
      </main>
    </div>
  );
}
