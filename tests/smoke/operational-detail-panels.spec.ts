import { expect, test, type Page } from "@playwright/test";

import { adminCredentials, hasCredentials } from "./helpers/env";
import {
  buildProtectedPath,
  expectNoFrameworkError,
  loginAs,
} from "./helpers/session";

async function expectRouteStatePanel({
  closeLabel = "Cerrar detalle",
  page,
  panelSelector,
  path,
  queryParam = "block_id",
  triggerSelector,
}: {
  closeLabel?: string;
  page: Page;
  panelSelector: string;
  path: string;
  queryParam?: string;
  triggerSelector: string;
}) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");
  await expectNoFrameworkError(page);

  if (queryParam === "edit_block_id") {
    await page.getByRole("button", { name: "Expandir todas", exact: true }).click();
  }

  const triggers = page.locator(triggerSelector).filter({ visible: true });

  if ((await triggers.count()) === 0) {
    test.skip(true, "No hay bloques visibles para validar el panel operativo.");
  }

  const trigger = triggers.first();

  await expect(trigger).toBeVisible();
  await trigger.scrollIntoViewIfNeeded();

  const pagePathname = new URL(page.url()).pathname;
  let rscRequests = 0;

  page.on("request", (request) => {
    const requestUrl = new URL(request.url());

    if (
      requestUrl.pathname === pagePathname &&
      (requestUrl.searchParams.has("_rsc") || request.headers().rsc)
    ) {
      rscRequests += 1;
    }
  });

  const scrollBeforeOpen = await page.evaluate(() => window.scrollY);

  await trigger.click();

  const panels = page.locator(panelSelector).filter({ visible: true });

  await expect(panels.first()).toBeVisible();
  expect(page.url()).toContain(`${queryParam}=`);
  await page.waitForTimeout(500);
  expect(rscRequests).toBe(0);

  const scrollAfterOpen = await page.evaluate(() => window.scrollY);
  expect(Math.abs(scrollAfterOpen - scrollBeforeOpen)).toBeLessThanOrEqual(2);

  await page.getByLabel(closeLabel).last().click();

  await expect(panels).toHaveCount(0);
  expect(page.url()).not.toContain(`${queryParam}=`);

  const scrollAfterClose = await page.evaluate(() => window.scrollY);
  expect(Math.abs(scrollAfterClose - scrollBeforeOpen)).toBeLessThanOrEqual(2);
}

test.describe("operational detail panels route-state smoke", () => {
  test.setTimeout(120_000);

  test.skip(
    !hasCredentials(adminCredentials),
    "Configura E2E_ADMIN_EMAIL y E2E_ADMIN_PASSWORD para ejecutar el smoke admin.",
  );

  test("schedule week opens block detail without RSC navigation", async ({
    page,
  }) => {
    await page.setViewportSize({ height: 800, width: 1280 });
    await loginAs(page, adminCredentials!);

    await expectRouteStatePanel({
      page,
      panelSelector: '[data-operational-detail-panel="schedule-block"]',
      path: buildProtectedPath("/app/schedule", { view: "week" }),
      triggerSelector: '[data-operational-detail-trigger="schedule-block"]',
    });
  });

  test("coverage opens block detail without RSC navigation on mobile", async ({
    page,
  }) => {
    await page.setViewportSize({ height: 844, width: 390 });
    await loginAs(page, adminCredentials!);

    await expectRouteStatePanel({
      page,
      panelSelector: '[data-operational-detail-panel="coverage-block"]',
      path: buildProtectedPath("/app/coverage"),
      triggerSelector: '[data-operational-detail-trigger="coverage-block"]',
    });
  });

  test("templates week opens block editor without RSC navigation", async ({
    page,
  }) => {
    await page.setViewportSize({ height: 800, width: 1280 });
    await loginAs(page, adminCredentials!);

    await expectRouteStatePanel({
      closeLabel: "Cerrar editor",
      page,
      panelSelector: '[data-template-block-edit-panel="true"]',
      path: buildProtectedPath("/app/templates", { view: "week" }),
      queryParam: "edit_block_id",
      triggerSelector: '[data-template-block-edit-trigger="true"]',
    });
  });

  test.describe("direct entry hydration across timezones", () => {
    test.use({ timezoneId: "America/Los_Angeles" });

    for (const surface of ["schedule", "coverage"] as const) {
      test(`${surface} trace dates match server HTML after direct entry and reload`, async ({
        page,
      }) => {
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        page.on("console", (message) => {
          if (message.type() === "error") errors.push(message.text());
        });

        await loginAs(page, adminCredentials!);
        await page.goto(buildProtectedPath(`/app/${surface}`, { view: "week" }));
        await page.waitForLoadState("networkidle");
        const triggers = page
          .locator(`[data-operational-detail-trigger="${surface}-block"]`)
          .filter({ visible: true });
        await expect(triggers.first()).toBeVisible();
        const panelSelector = `[data-operational-detail-panel="${surface}-block"]`;
        const traceSelector = `${panelSelector} [data-coverage-traceability] li > div > span:last-child`;
        const traceLabels = page.locator(traceSelector);
        for (let index = 0; index < await triggers.count(); index += 1) {
          await triggers.nth(index).click();
          await expect(page.locator(panelSelector)).toBeVisible();
          if ((await traceLabels.allTextContents()).some((label) => /\d{2}:\d{2}/.test(label))) {
            break;
          }
          await page.getByLabel("Cerrar detalle").last().click();
          await expect(page.locator(panelSelector)).toHaveCount(0);
        }
        await expect(traceLabels.first()).toBeVisible();
        const detailUrl = page.url();
        expect(new URL(detailUrl).searchParams.has("block_id")).toBe(true);

        const serverResponse = await page.request.get(detailUrl);
        expect(serverResponse.ok()).toBe(true);
        const serverLabels = await page.evaluate(
          ({ html, selector }) =>
            Array.from(
              new DOMParser().parseFromString(html, "text/html").querySelectorAll(selector),
              (element) => element.textContent?.trim() ?? "",
            ),
          { html: await serverResponse.text(), selector: traceSelector },
        );
        expect(serverLabels.some((label) => /\d{2}:\d{2}/.test(label))).toBe(true);

        await page.goto(detailUrl, { waitUntil: "networkidle" });
        await expect(traceLabels).toHaveText(serverLabels);
        await page.reload({ waitUntil: "networkidle" });
        await expect(traceLabels).toHaveText(serverLabels);
        await page.getByLabel("Cerrar detalle").last().click();
        await expect(page.locator(panelSelector)).toHaveCount(0);
        expect(errors).toEqual([]);
      });
    }
  });
});
