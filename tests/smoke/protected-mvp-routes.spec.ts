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
    heading: /Documentos/i,
    path: "/app/documents",
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
  {
    heading: /Jornadas previstas/i,
    path: "/app/work-windows",
  },
];

test.describe("admin MVP 1 protected routes smoke @role-admin", () => {
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

test.describe("coach MVP 1 protected routes smoke @role-coach", () => {
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

test.describe("owner B.2 advanced role smoke @role-owner", () => {
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

  test("owner sees the full weekly schedule without horizontal overflow on desktop", async ({
    page,
  }) => {
    await page.setViewportSize({ height: 800, width: 1280 });
    await loginAs(page, ownerCredentials!);

    await openAndExpectHeading(
      page,
      buildProtectedPath("/app/schedule", { view: "week" }),
      /Horario/i,
    );

    const weekGrid = page.locator('[data-schedule-week-grid="desktop"]');
    await expect(weekGrid).toBeVisible();
    await expect(weekGrid.locator("[data-schedule-week-day]")).toHaveCount(7);

    const gridMetrics = await weekGrid.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }));
    expect(gridMetrics.scrollWidth).toBeLessThanOrEqual(
      gridMetrics.clientWidth + 1,
    );

    const sundayMetrics = await weekGrid
      .locator('[data-schedule-week-day="6"]')
      .evaluate((element) => {
        const dayRect = element.getBoundingClientRect();
        const gridRect = element
          .closest('[data-schedule-week-grid="desktop"]')!
          .getBoundingClientRect();

        return {
          dayRight: dayRect.right,
          gridRight: gridRect.right,
        };
      });
    expect(sundayMetrics.dayRight).toBeLessThanOrEqual(
      sundayMetrics.gridRight + 1,
    );
  });
});

test.describe("manager B.2 operational role smoke @role-manager", () => {
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
