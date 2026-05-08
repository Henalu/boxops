import { test } from "@playwright/test";

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

test.describe("admin MVP 1 protected routes smoke", () => {
  test.setTimeout(120_000);

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
});

test.describe("owner B.2 advanced role smoke", () => {
  test.setTimeout(120_000);

  test.skip(
    !hasCredentials(ownerCredentials),
    "Configura E2E_OWNER_EMAIL y E2E_OWNER_PASSWORD para ejecutar el smoke owner.",
  );

  test("owner can reach MVP 1 and tenant settings surfaces", async ({ page }) => {
    await loginAs(page, ownerCredentials!);

    for (const route of mvpRoutes) {
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

    for (const route of mvpRoutes) {
      await openAndExpectHeading(
        page,
        buildProtectedPath(route.path),
        route.heading,
      );
    }
  });
});
