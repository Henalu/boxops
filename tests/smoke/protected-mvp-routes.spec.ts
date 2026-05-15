import { expect, test } from "@playwright/test";

import {
  adminCredentials,
  coachCredentials,
  hasCredentials,
  managerCredentials,
  ownerCredentials,
} from "./helpers/env";
import { buildProtectedPath, loginAs, openAndExpectHeading } from "./helpers/session";

const mvpRoutes = [
  {
    heading: /Hola|Tu box/i,
    path: "/app",
  },
  {
    heading: /Mi cuenta/i,
    path: "/app/account",
  },
  {
    heading: /Ausencias/i,
    path: "/app/absences",
  },
  {
    heading: /Mi fichaje/i,
    path: "/app/time",
  },
  {
    heading: /Centros/i,
    path: "/app/centers",
  },
  {
    heading: /Equipo/i,
    path: "/app/coaches",
  },
  {
    heading: /Tipos de actividad/i,
    path: "/app/class-types",
  },
  {
    heading: /Horario/i,
    path: "/app/schedule",
  },
  {
    heading: /Cobertura/i,
    path: "/app/coverage",
  },
  {
    heading: /Plantillas semanales/i,
    path: "/app/templates",
  },
  {
    heading: /Más/i,
    path: "/app/more",
  },
  {
    heading: /Configuraci/i,
    path: "/app/settings",
  },
];

const managementRoutes = [
  {
    heading: /Estad.sticas operativas/i,
    path: "/app/stats",
  },
];

test.describe("admin MVP 1 protected routes smoke", () => {
  test.setTimeout(120_000);

  test.skip(
    !hasCredentials(adminCredentials),
    "Configura E2E_ADMIN_EMAIL y E2E_ADMIN_PASSWORD para ejecutar el smoke admin.",
  );

  test("admin can reach core MVP 1 surfaces", async ({ page }) => {
    await loginAs(page, adminCredentials!);

    for (const route of [...mvpRoutes, ...managementRoutes]) {
      await openAndExpectHeading(
        page,
        buildProtectedPath(route.path),
        route.heading,
      );
    }
  });
});

test.describe("coach MVP 1 protected routes smoke", () => {
  test.setTimeout(120_000);

  test.skip(
    !hasCredentials(coachCredentials),
    "Configura E2E_COACH_EMAIL y E2E_COACH_PASSWORD para ejecutar el smoke coach.",
  );

  test("coach can reach read-only MVP 1 surfaces", async ({ page }) => {
    await loginAs(page, coachCredentials!);

    for (const route of mvpRoutes) {
      await openAndExpectHeading(
        page,
        buildProtectedPath(route.path),
        route.heading,
      );
    }
  });

  test("coach can reach Mi horario", async ({ page }) => {
    await loginAs(page, coachCredentials!);

    await openAndExpectHeading(
      page,
      buildProtectedPath("/app/schedule", { mine: "1" }),
      /Horario/i,
    );
  });

  test("coach cannot reach management stats data", async ({ page }) => {
    await loginAs(page, coachCredentials!);

    await page.goto(buildProtectedPath("/app/stats"), {
      waitUntil: "domcontentloaded",
    });

    await expect(
      page.getByRole("heading", { name: /Estad.sticas operativas/i }),
    ).toBeVisible();
    await expect(page.getByText(/Sin permisos de gesti.n/i)).toBeVisible();
    await expect(page.getByText(/Utilizaci.n de coaches/i)).toHaveCount(0);
  });
});

test.describe("owner B.2 advanced role smoke", () => {
  test.setTimeout(120_000);

  test.skip(
    !hasCredentials(ownerCredentials),
    "Configura E2E_OWNER_EMAIL y E2E_OWNER_PASSWORD para ejecutar el smoke owner.",
  );

  test("owner can reach MVP 1 and tenant settings surfaces", async ({ page }) => {
    await loginAs(page, ownerCredentials!);

    for (const route of [...mvpRoutes, ...managementRoutes]) {
      await openAndExpectHeading(
        page,
        buildProtectedPath(route.path),
        route.heading,
      );
    }
  });
});

test.describe("manager B.2 operational role smoke", () => {
  test.setTimeout(120_000);

  test.skip(
    !hasCredentials(managerCredentials),
    "Configura E2E_MANAGER_EMAIL y E2E_MANAGER_PASSWORD para ejecutar el smoke manager.",
  );

  test("manager can reach operational MVP 1 surfaces", async ({ page }) => {
    await loginAs(page, managerCredentials!);

    for (const route of [...mvpRoutes, ...managementRoutes]) {
      await openAndExpectHeading(
        page,
        buildProtectedPath(route.path),
        route.heading,
      );
    }
  });
});
