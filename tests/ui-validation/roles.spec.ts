import { expect, test, type Page } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { loginAs } from "../smoke/helpers/session";

const fixture = JSON.parse(readFileSync(".local-evidence/ui-validation/fixture.json", "utf8"));
function path(route: string, params: Record<string, string> = {}) {
  return `${route}?${new URLSearchParams({ organizationId: fixture.organizationId, week: fixture.week, ...params })}`;
}
async function capture(page: Page, name: string) {
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `.local-evidence/ui-validation/${name}.png`, fullPage: true });
  const overflow = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
  expect(overflow.scroll, `${name} horizontal overflow`).toBeLessThanOrEqual(overflow.width + 1);
}

for (const role of ["owner", "admin", "manager", "coach"]) {
  for (const width of [1280, 390]) {
    test(`${role} navigates core screens at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
      const errors: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      page.on("response", response => {
        if (response.status() >= 500) errors.push(`${response.status()} ${new URL(response.url()).pathname}`);
      });
      await loginAs(page, fixture.roles[role]);
      for (const [route, heading] of [
        ["/app", /Hola|Tu box/i], ["/app/schedule", /Horario/i],
        ["/app/coverage", /Cobertura/i], ["/app/templates", /Plantillas semanales/i],
        ["/app/coaches", /Equipo/i], ["/app/centers", /Centros/i],
        ["/app/documents", /Documentos/i], ["/app/account", /Mi cuenta/i],
      ] as const) {
        const response = await page.goto(path(route));
        expect(response?.status(), route).toBeLessThan(400);
        await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible();
        await expect(page.getByText(/Application error|Error al cargar|No se ha podido cargar|No se pudo cargar|No se pudieron cargar/i)).toHaveCount(0);
        if (["/app/schedule", "/app/templates", "/app/documents"].includes(route)) {
          await capture(page, `${role}-${width}-${route.split("/").pop()}`);
        }
      }
      expect(errors).toEqual([]);
    });
  }
}

test("owner can open a block detail and the template editor", async ({ page }) => {
  await loginAs(page, fixture.roles.owner);
  await page.goto(path("/app/schedule", { block_id: fixture.vacantBlockId }));
  await expect(page.getByRole("button", { name: "Asignar entrenador", exact: true })).toBeVisible();
  writeFileSync(".local-evidence/ui-validation/owner-detail.txt", await page.locator("body").innerText());
  await capture(page, "owner-detail");
  await page.goto(path("/app/templates"));
  await expect(page.getByText("UI Plantilla base", { exact: true }).first()).toBeVisible();
  writeFileSync(".local-evidence/ui-validation/owner-templates.txt", await page.locator("body").innerText());
  await page.context().storageState({ path: ".local-evidence/ui-validation/owner-auth.json" });
});

test("athlete cannot enter BoxOps operational screens", async ({ page }) => {
  await loginAs(page, fixture.roles.athlete);
  for (const route of ["/app/schedule", "/app/coaches", "/app/documents"]) {
    await page.goto(path(route));
    await expect(page.getByText("Acceso pendiente", { exact: true })).toBeVisible();
    const body = await page.locator("body").innerText();
    expect(body).not.toContain("UI Entrenamiento");
    expect(body).not.toContain("UI bloque asignado");
    expect(body).not.toContain("UI Documento compartido");
    await expect(page.getByRole("button", { name: /Asignar entrenador|Guardar cambios|Crear bloque/i })).toHaveCount(0);
    writeFileSync(`.local-evidence/ui-validation/athlete-${route.split("/").pop()}.txt`, body);
  }
  await capture(page, "athlete-denied");
});

test("foreign tenant cannot read tenant A schedule or documents through URLs", async ({ page }) => {
  await loginAs(page, fixture.roles.foreign);
  await page.goto(path("/app/schedule", { block_id: fixture.blockId }));
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { name: /Horario/ }).first()).toBeVisible();
  await expect(page.getByText("UI bloque asignado", { exact: true })).toHaveCount(0);
  await expect(page.getByText("UI Entrenamiento", { exact: true })).toHaveCount(0);
  await page.goto(path("/app/documents", { documentId: fixture.documentId }));
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { name: /Documentos/ }).first()).toBeVisible();
  await expect(page.getByText("UI Documento compartido", { exact: true })).toHaveCount(0);
  await capture(page, "foreign-tenant-denied");
});
