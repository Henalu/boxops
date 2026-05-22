import { test } from "@playwright/test";

import {
  adminCredentials,
  coachCredentials,
  hasCredentials,
  managerCredentials,
  ownerCredentials,
  type SmokeCredentials,
} from "./helpers/env";
import { buildProtectedPath, loginAs, openAndExpectHeading } from "./helpers/session";

interface FixtureSmokeCase {
  credentials: SmokeCredentials | null;
  envPrefix: string;
  role: string;
  routes: Array<{
    heading: RegExp;
    path: string;
    params?: Record<string, string>;
  }>;
}

const fixtureSmokeCases: FixtureSmokeCase[] = [
  {
    credentials: ownerCredentials,
    envPrefix: "E2E_OWNER",
    role: "owner",
    routes: [
      { heading: /Hola|Tu box/i, path: "/app" },
      { heading: /Configuraci/i, path: "/app/settings" },
    ],
  },
  {
    credentials: adminCredentials,
    envPrefix: "E2E_ADMIN",
    role: "admin",
    routes: [
      { heading: /Hola|Tu box/i, path: "/app" },
      { heading: /Centros/i, path: "/app/centers" },
    ],
  },
  {
    credentials: managerCredentials,
    envPrefix: "E2E_MANAGER",
    role: "manager",
    routes: [
      { heading: /Hola|Tu box/i, path: "/app" },
      { heading: /Cobertura/i, path: "/app/coverage" },
    ],
  },
  {
    credentials: coachCredentials,
    envPrefix: "E2E_COACH",
    role: "coach",
    routes: [
      { heading: /Hola|Tu box/i, path: "/app" },
      { heading: /Horario/i, params: { mine: "1" }, path: "/app/schedule" },
    ],
  },
];

for (const fixtureCase of fixtureSmokeCases) {
  test.describe(`${fixtureCase.role} local E2E Auth fixture smoke`, () => {
    test.setTimeout(75_000);

    test.skip(
      !hasCredentials(fixtureCase.credentials),
      `Configura ${fixtureCase.envPrefix}_EMAIL y ${fixtureCase.envPrefix}_PASSWORD para ejecutar este smoke.`,
    );

    test(`${fixtureCase.role} can login and reach minimal protected routes`, async ({
      page,
    }) => {
      const credentials = fixtureCase.credentials;

      if (!hasCredentials(credentials)) {
        test.skip(true, `Missing ${fixtureCase.envPrefix} credentials.`);
        return;
      }

      await loginAs(page, credentials);

      for (const route of fixtureCase.routes) {
        await openAndExpectHeading(
          page,
          buildProtectedPath(route.path, route.params),
          route.heading,
        );
      }
    });
  });
}
