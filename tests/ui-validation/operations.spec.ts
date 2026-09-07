import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { loginAs } from "../smoke/helpers/session";

const f = JSON.parse(readFileSync(".local-evidence/ui-validation/fixture.json", "utf8"));
for (const value of Object.values(f).filter(value => typeof value === "string" && value !== f.week)) {
  if (!/^[a-f0-9-]{36}$/.test(value as string)) throw new Error("Invalid local fixture ID");
}
function db(statement: string) {
  const result = spawnSync("docker", ["exec", "-i", "supabase_db_boxops", "psql", "-U", "postgres", "-d", "postgres", "-X", "-qAt", "-v", "ON_ERROR_STOP=1"], {
    input: `BEGIN; SET LOCAL statement_timeout='15s'; DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM organizations WHERE id='${f.organizationId}' AND slug LIKE 'ui-validation-a-%') THEN RAISE EXCEPTION 'Not a UI fixture'; END IF; END $$; ${statement}; COMMIT;`,
    encoding: "utf8", timeout: 25_000,
  });
  if (result.status !== 0) throw new Error(result.stderr || "Local fixture query failed");
  return result.stdout.trim();
}
function path(route: string, params: Record<string, string> = {}) {
  return `${route}?${new URLSearchParams({ organizationId: f.organizationId, week: f.week, ...params })}`;
}
async function screenshot(page: Page, name: string) {
  await page.screenshot({ path: `.local-evidence/ui-validation/${name}.png`, fullPage: true });
}
async function templateForm(page: Page, templateId: string) {
  await page.goto(path("/app/templates"));
  const form = page.locator("form").filter({ has: page.locator(`input[name="templateId"][value="${templateId}"]`) }).filter({ has: page.locator('input[name="name"]') });
  await expect(form).toHaveCount(1);
  const outer = form.locator("xpath=ancestor::details[@data-template-details]");
  if (await outer.getAttribute("open") === null) await outer.locator(":scope > summary").click();
  const editor = form.locator("xpath=ancestor::details[1]");
  if (await editor.getAttribute("open") === null) await editor.locator(":scope > summary").click();
  await expect(form).toBeVisible();
  return form;
}
function resetTemplates() {
  db(`UPDATE schedule_templates SET status='draft' WHERE organization_id='${f.organizationId}' AND id IN ('${f.templateId}','${f.replacementTemplateId}'); DELETE FROM schedule_blocks WHERE organization_id='${f.organizationId}' AND template_id IN ('${f.templateId}','${f.replacementTemplateId}')`);
}
function templateSnapshot(templateId: string) {
  return JSON.parse(db(`SELECT coalesce(json_agg(json_build_object('block',b.id,'assignment',a.id,'coach',a.coach_profile_id) ORDER BY b.id),'[]') FROM schedule_blocks b LEFT JOIN schedule_block_assignments a ON a.schedule_block_id=b.id AND a.assignment_status='assigned' WHERE b.organization_id='${f.organizationId}' AND b.template_id='${templateId}'`));
}

for (const role of ["owner", "admin", "manager"]) {
  test(`${role} assigns and removes a coach through schedule detail`, async ({ page }) => {
    await page.setViewportSize({ width: role === "admin" ? 390 : 1280, height: 844 });
    db(`UPDATE schedule_block_assignments SET assignment_status='removed' WHERE organization_id='${f.organizationId}' AND schedule_block_id='${f.vacantBlockId}'`);
    await loginAs(page, f.roles[role]);
    await page.goto(path("/app/schedule", { block_id: f.vacantBlockId }));
    await page.getByLabel(/^Añadir entrenador/).selectOption(f.coachId);
    await page.getByRole("button", { name: "Asignar entrenador", exact: true }).click();
    await expect.poll(() => db(`SELECT count(*) FROM schedule_block_assignments WHERE organization_id='${f.organizationId}' AND schedule_block_id='${f.vacantBlockId}' AND assignment_status='assigned'`)).toBe("1");
    await page.goto(path("/app/schedule", { block_id: f.vacantBlockId }));
    const remove = page.getByRole("button", { name: /Retirar|Quitar/ }).first();
    await expect(remove).toBeVisible();
    await screenshot(page, `${role}-assignment`);
    await remove.click();
    await expect.poll(() => db(`SELECT count(*) FROM schedule_block_assignments WHERE organization_id='${f.organizationId}' AND schedule_block_id='${f.vacantBlockId}' AND assignment_status='assigned'`)).toBe("0");
  });

  test(`${role} applies, retries and replaces a template with atomic overlap recovery`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: role === "admin" ? 390 : 1280, height: 844 });
    resetTemplates();
    try {
      await loginAs(page, f.roles[role]);
      let form = await templateForm(page, f.templateId);
      await form.getByRole("combobox", { name: /^Estado/ }).selectOption("active");
      await form.getByRole("button", { name: /Guardar/ }).click();
      await expect.poll(() => templateSnapshot(f.templateId).length).toBe(1);
      const before = templateSnapshot(f.templateId);
      expect(before[0].coach).toBe(f.coachId);
      expect(before[0].assignment).toBeTruthy();
      form = await templateForm(page, f.templateId);
      await form.getByRole("button", { name: /Guardar/ }).click();
      await page.waitForURL(/status=/);
      expect(templateSnapshot(f.templateId)).toEqual(before);
      form = await templateForm(page, f.replacementTemplateId);
      await form.getByRole("combobox", { name: /^Estado/ }).selectOption("active");
      await form.getByRole("button", { name: /Guardar/ }).click();
      await expect(page.getByRole("heading", { name: "Ya hay plantillas aplicadas" })).toBeVisible();
      await page.getByRole("button", { name: "Sustituir existentes", exact: true }).click();
      await page.waitForURL(/error=template-sync-coach-unavailable/);
      await expect(page.getByText("Plantilla guardada, horario sin actualizar", { exact: true })).toBeVisible();
      await expect(page.getByText(/entrenador queda ocupado en otra franja/)).toBeVisible();
      expect(templateSnapshot(f.templateId)).toEqual(before);
      expect(templateSnapshot(f.replacementTemplateId)).toEqual([]);
      await screenshot(page, `${role}-template-overlap-rollback`);
      // Prepare the retry by removing only the synthetic conflicting assignment.
      db(`UPDATE schedule_block_assignments SET assignment_status='removed' WHERE organization_id='${f.organizationId}' AND schedule_block_id='${f.blockId}'`);
      form = await templateForm(page, f.replacementTemplateId);
      await form.getByRole("button", { name: /Guardar/ }).click();
      await page.getByRole("button", { name: "Sustituir existentes", exact: true }).click();
      await expect.poll(() => templateSnapshot(f.replacementTemplateId).length).toBe(1);
      expect(templateSnapshot(f.templateId)).toEqual([]);
      expect(templateSnapshot(f.replacementTemplateId)[0].coach).toBe(f.coachId);
    } finally {
      resetTemplates();
      db(`UPDATE schedule_block_assignments SET assignment_status='assigned' WHERE organization_id='${f.organizationId}' AND schedule_block_id='${f.blockId}'`);
    }
  });
}

test("coach gets own schedule and cannot edit blocks or open management stats", async ({ page }) => {
  await loginAs(page, f.roles.coach);
  await page.goto(path("/app/schedule", { mine: "1", block_id: f.blockId }));
  await expect(page.getByText("UI bloque asignado", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Asignar entrenador|Guardar cambios|Retirar/ })).toHaveCount(0);
  await page.goto(path("/app/stats"));
  await expect(page.getByText(/Sin permisos de gestión/)).toBeVisible();
});

test("support opens a temporary session, stays outside documents and closes access", async ({ page }) => {
  db(`UPDATE platform_support_sessions SET status='ended',ended_at=now() WHERE organization_id='${f.organizationId}' AND actor_user_id='${f.roles.support.id}' AND status='active'`);
  await loginAs(page, f.roles.support);
  await page.goto(`/console/organizations/${f.organizationId}`);
  await page.getByLabel("Motivo de soporte").fill("Validacion local de horario solicitada para esta prueba.");
  await page.getByRole("button", { name: "Abrir soporte temporal", exact: true }).click();
  await expect(page.getByText("Modo soporte BoxOps activo", { exact: true })).toBeVisible();
  await page.goto(path("/app/schedule", { block_id: f.blockId }));
  await expect(page.getByText("UI bloque asignado", { exact: true })).toBeVisible();
  await expect(page.locator("[data-boxwod-programming-action]")).toHaveCount(0);
  await screenshot(page, "support-active");
  await page.goto(path("/app/documents"));
  await expect(page.getByText("Documentos no disponibles en modo soporte", { exact: true })).toBeVisible();
  await expect(page.getByText(/No se pudo cargar el repositorio|No se pudieron cargar las carpetas/)).toHaveCount(0);
  await screenshot(page, "support-documents-denied");
  await expect(page.getByText("UI Documento compartido", { exact: true })).toHaveCount(0);
  await expect(page.locator('input[name="documentFile"]')).toHaveCount(0);
  await page.goto(path("/app/schedule"));
  await page.getByRole("button", { name: "Cerrar soporte", exact: true }).click();
  await expect(page).toHaveURL(url =>
    url.pathname === `/console/organizations/${f.organizationId}` &&
    url.searchParams.get("status") === "support-session-ended",
  );
  expect(db(`SELECT count(*) FROM platform_support_sessions WHERE organization_id='${f.organizationId}' AND actor_user_id='${f.roles.support.id}' AND status='active'`)).toBe("0");
  await page.goto(path("/app/schedule", { block_id: f.blockId }));
  await expect(page.getByText("Acceso pendiente", { exact: true })).toBeVisible();
  await expect(page.getByText("Modo soporte BoxOps activo", { exact: true })).toHaveCount(0);
  await expect(page.getByText("UI bloque asignado", { exact: true })).toHaveCount(0);
  expect(db(`SELECT count(*) FROM platform_support_sessions WHERE organization_id='${f.organizationId}' AND actor_user_id='${f.roles.support.id}' AND status='active'`)).toBe("0");
});

test("owner changes center on mobile and signs out", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, f.roles.owner);
  await page.goto(path("/app/schedule", { center_id: f.centerId }));
  const centers = page.getByRole("navigation", { name: "Centro del calendario" });
  await centers.getByRole("link", { name: "UI Sur", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`center_id=${f.secondCenterId}`));
  await expect(centers.getByRole("link", { name: "UI Sur", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("Sin requisito", { exact: true }).first()).toBeVisible();
  await screenshot(page, "owner-mobile-center-filter");
  await page.goto(path("/app/account"));
  // The desktop shell exposes the same sign-out action used by the account menu.
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByRole("button", { name: "Cerrar sesión", exact: true }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto(path("/app/schedule"));
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: "Iniciar sesión", exact: true })).toBeVisible();
});
