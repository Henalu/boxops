import { expect, type Page } from "@playwright/test";

import type { SmokeCredentials } from "./env";
import { organizationId, smokeWeek } from "./env";

type QueryValue = string | null | undefined;

export function buildProtectedPath(
  path: string,
  params: Record<string, QueryValue> = {},
) {
  const query = new URLSearchParams();

  if (organizationId) {
    query.set("organizationId", organizationId);
  }

  if (
    ["/app", "/app/schedule", "/app/templates", "/app/coverage", "/app/more"].includes(
      path,
    ) &&
    smokeWeek
  ) {
    query.set("week", smokeWeek);
  }

  Object.entries(params).forEach(([key, value]) => {
    if (value) {
      query.set(key, value);
    }
  });

  const queryString = query.toString();

  return queryString ? `${path}?${queryString}` : path;
}

export async function loginAs(page: Page, credentials: SmokeCredentials) {
  await page.goto("/login");
  await expect(
    page.getByRole("heading", { name: /Iniciar sesion/i }),
  ).toBeVisible();

  await page.getByLabel(/^Email$/i).fill(credentials.email);
  await page.getByLabel(/Contrasena/i).fill(credentials.password);
  await page.getByRole("button", { name: /Entrar/i }).click();

  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  await page.waitForLoadState("networkidle");
}

export async function openAndExpectHeading(
  page: Page,
  path: string,
  heading: RegExp,
) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");

  await expectNoFrameworkError(page);
  await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible();
}

export async function expectNoFrameworkError(page: Page) {
  await expect(
    page.locator("[data-nextjs-dialog], .vite-error-overlay"),
  ).toHaveCount(0);
}
