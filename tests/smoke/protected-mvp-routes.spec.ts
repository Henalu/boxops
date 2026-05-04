import { test } from "@playwright/test";

import { adminCredentials, coachCredentials, hasCredentials } from "./helpers/env";
import { buildProtectedPath, loginAs, openAndExpectHeading } from "./helpers/session";

const mvpRoutes = [
  {
    heading: /Hola|Tu box/i,
    path: "/app",
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
    heading: /Mas/i,
    path: "/app/more",
  },
];

test.describe("admin MVP 1 protected routes smoke", () => {
  test.skip(
    !hasCredentials(adminCredentials),
    "Configura E2E_ADMIN_EMAIL y E2E_ADMIN_PASSWORD para ejecutar el smoke admin.",
  );

  test("admin can reach core MVP 1 surfaces", async ({ page }) => {
    await loginAs(page, adminCredentials!);

    for (const route of mvpRoutes) {
      await openAndExpectHeading(
        page,
        buildProtectedPath(route.path),
        route.heading,
      );
    }
  });
});

test.describe("coach MVP 1 protected routes smoke", () => {
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
});
