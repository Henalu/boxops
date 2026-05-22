import { execFileSync } from "node:child_process";

import { expect, test, type Page } from "@playwright/test";

import {
  coachCredentials,
  hasCredentials,
  organizationId,
  ownerCredentials,
} from "./helpers/env";
import {
  buildProtectedPath,
  expectNoFrameworkError,
  loginAs,
} from "./helpers/session";

const localDbContainer = "supabase_db_boxops";
const smokeWeek = "2026-05-04";

const hasRuntimeConfig = Boolean(
  organizationId &&
    hasCredentials(ownerCredentials) &&
    hasCredentials(coachCredentials),
);

function getRuntimeStamp() {
  return new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
}

function toSqlText(value: string) {
  return value.replace(/'/g, "''");
}

function toSqlUuid(value: string) {
  const normalizedValue = value.trim();

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      normalizedValue,
    )
  ) {
    throw new Error("Expected a UUID.");
  }

  return normalizedValue;
}

function readPsqlValue(sql: string) {
  return execFileSync(
    "docker",
    [
      "exec",
      localDbContainer,
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-At",
      "-F",
      "\t",
      "-c",
      sql,
    ],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  ).trim();
}

function readSingleValue(sql: string) {
  return readPsqlValue(sql).split(/\r?\n/)[0]?.trim() ?? "";
}

function getScheduleActionTimes(stamp: string) {
  const minute = Number(stamp.slice(-2)) % 45;
  const startMinute = String(minute).padStart(2, "0");
  const endMinute = String(minute + 10).padStart(2, "0");

  return {
    endTime: `05:${endMinute}`,
    startTime: `05:${startMinute}`,
  };
}

async function waitForStatus(page: Page, status: string | RegExp) {
  await page.waitForURL((url) => {
    const value = url.searchParams.get("status") ?? "";

    return typeof status === "string" ? value === status : status.test(value);
  });
  await expectNoFrameworkError(page);
}

async function openDetailsByText(page: Page, text: string | RegExp) {
  const details = page.locator("details").filter({ hasText: text }).first();
  await expect(details).toBeVisible();

  if ((await details.getAttribute("open")) === null) {
    await details.locator("summary").click();
  }

  return details;
}

test.describe.serial("S.99 tenant direct grants app runtime smoke", () => {
  test.setTimeout(180_000);

  test.skip(
    !hasRuntimeConfig,
    "Configura Supabase local y credenciales sinteticas E2E_OWNER/E2E_COACH para ejecutar S.99.",
  );

  test("owner can mutate centers, class types and organization settings through app actions", async ({
    page,
  }) => {
    const stamp = getRuntimeStamp();
    const centerSlug = `s99-center-${stamp}`;
    const classTypeSlug = `s99-type-${stamp}`;

    await page.setViewportSize({ height: 900, width: 1280 });
    await loginAs(page, ownerCredentials!);

    await page.goto(buildProtectedPath("/app/centers"));
    await expectNoFrameworkError(page);
    const centerPanel = await openDetailsByText(page, "Crear centro");
    await centerPanel.locator('input[name="name"]').fill(`S99 Center ${stamp}`);
    await centerPanel.locator('input[name="slug"]').fill(centerSlug);
    await centerPanel.locator('input[name="timezone"]').fill("Europe/Madrid");
    await Promise.all([
      waitForStatus(page, "created"),
      centerPanel.getByRole("button", { name: /Crear centro/i }).click(),
    ]);
    expect(
      readSingleValue(`
        select id
        from public.centers
        where organization_id = '${toSqlUuid(organizationId!)}'::uuid
          and slug = '${toSqlText(centerSlug)}'
        limit 1;
      `),
    ).toBeTruthy();

    await page.goto(buildProtectedPath("/app/class-types"));
    await expectNoFrameworkError(page);
    const classTypePanel = await openDetailsByText(
      page,
      "Crear tipo de actividad",
    );
    await classTypePanel
      .locator('input[name="name"]')
      .fill(`S99 Activity ${stamp}`);
    await classTypePanel.locator('input[name="slug"]').fill(classTypeSlug);
    await classTypePanel.locator('input[name="requiredCoaches"]').fill("1");
    await classTypePanel.locator('input[name="color"]').fill("#0891b2");
    await Promise.all([
      waitForStatus(page, "created"),
      classTypePanel.getByRole("button", { name: /Crear tipo/i }).click(),
    ]);
    expect(
      readSingleValue(`
        select id
        from public.class_types
        where organization_id = '${toSqlUuid(organizationId!)}'::uuid
          and slug = '${toSqlText(classTypeSlug)}'
        limit 1;
      `),
    ).toBeTruthy();

    await page.goto(buildProtectedPath("/app/settings"));
    await expectNoFrameworkError(page);
    await page.locator('input[name="name"]').fill(`Demo Box S99 ${stamp}`);
    await page.locator('input[name="accentColor"]').fill("#2563eb");
    await Promise.all([
      waitForStatus(page, "updated"),
      page
        .getByRole("button", { name: /Guardar configuraci/i })
        .first()
        .click(),
    ]);
  });

  test("owner can update team access and coach profiles through app actions", async ({
    page,
  }) => {
    const stamp = getRuntimeStamp();

    await page.setViewportSize({ height: 900, width: 1280 });
    await loginAs(page, ownerCredentials!);
    await page.goto(buildProtectedPath("/app/coaches"));
    await expectNoFrameworkError(page);

    const membershipRow = page.locator("tr").filter({ hasText: "E2E Coach" });
    await expect(membershipRow).toBeVisible();
    const accessDetails = membershipRow
      .locator("details")
      .filter({ hasText: "Ajustar acceso" })
      .first();
    await accessDetails.locator("summary").click();
    await Promise.all([
      waitForStatus(page, "membership-updated"),
      accessDetails.getByRole("button", { name: /^Guardar$/i }).click(),
    ]);

    await page.goto(buildProtectedPath("/app/coaches"));
    await expectNoFrameworkError(page);
    const profileCard = page
      .locator('[data-slot="card"]')
      .filter({ hasText: "E2E Coach" })
      .filter({ hasText: "Gestionar ficha" })
      .first();
    await expect(profileCard).toBeVisible();
    const profileDetails = profileCard
      .locator("details")
      .filter({ hasText: "Gestionar ficha" })
      .first();
    await profileDetails.locator("summary").click();
    await profileDetails
      .locator('textarea[name="notes"]')
      .fill(`S99 synthetic coach profile update ${stamp}`);
    await Promise.all([
      waitForStatus(page, "profile-updated"),
      profileDetails.getByRole("button", { name: /Guardar ficha/i }).click(),
    ]);
  });

  test("owner can mutate schedule blocks, assignments and planned work windows through app actions", async ({
    page,
  }) => {
    const stamp = getRuntimeStamp();
    const notes = `S99 schedule block ${stamp}`;
    const workWindowNotes = `S99 staff window ${stamp}`;
    const times = getScheduleActionTimes(stamp);

    await page.setViewportSize({ height: 900, width: 1280 });
    await loginAs(page, ownerCredentials!);
    await page.goto(buildProtectedPath("/app/schedule", { week: smokeWeek }));
    await expectNoFrameworkError(page);

    await page.getByRole("button", { name: /Nuevo bloque/i }).click();
    const dialog = page.getByRole("dialog", { name: /Nuevo bloque/i });
    await expect(dialog).toBeVisible();
    await dialog.locator('input[name="serviceDate"]').fill(smokeWeek);
    await dialog.locator('input[name="startTime"]').fill(times.startTime);
    await dialog.locator('input[name="endTime"]').fill(times.endTime);
    await dialog.locator('input[name="requiredCoaches"]').fill("1");
    await dialog.locator('textarea[name="notes"]').fill(notes);
    await Promise.all([
      waitForStatus(page, "created"),
      dialog.getByRole("button", { name: /Crear bloque/i }).click(),
    ]);

    const blockId = readSingleValue(`
      select id
      from public.schedule_blocks
      where organization_id = '${toSqlUuid(organizationId!)}'::uuid
        and notes = '${toSqlText(notes)}'
      order by created_at desc
      limit 1;
    `);
    expect(blockId).toBeTruthy();

    await page.goto(
      buildProtectedPath("/app/schedule", {
        block_id: blockId,
        view: "week",
        week: smokeWeek,
      }),
    );
    await expectNoFrameworkError(page);
    const detailPanel = page
      .locator('[data-operational-detail-panel="schedule-block"]')
      .filter({ visible: true });
    await expect(detailPanel).toBeVisible();
    const assignmentForm = detailPanel.locator("form").filter({
      hasText: "Asignar entrenador",
    });
    await Promise.all([
      waitForStatus(page, "assigned"),
      assignmentForm.getByRole("button", { name: /Asignar entrenador/i }).click(),
    ]);
    expect(
      readSingleValue(`
        select id
        from public.schedule_block_assignments
        where organization_id = '${toSqlUuid(organizationId!)}'::uuid
          and schedule_block_id = '${toSqlUuid(blockId)}'::uuid
          and assignment_status = 'assigned'
        limit 1;
      `),
    ).toBeTruthy();

    await page.goto(
      buildProtectedPath("/app/schedule", {
        week: smokeWeek,
        work_windows: "1",
      }),
    );
    await expectNoFrameworkError(page);
    const workWindowsDetails = await openDetailsByText(page, "Gestionar franjas");
    await workWindowsDetails.locator('input[name="startTime"]').first().fill("12:10");
    await workWindowsDetails.locator('input[name="endTime"]').first().fill("12:40");
    await workWindowsDetails.locator('input[name="validFrom"]').first().fill(smokeWeek);
    await workWindowsDetails
      .locator('input[name="notes"]')
      .first()
      .fill(workWindowNotes);
    await Promise.all([
      waitForStatus(page, "work-window-created"),
      workWindowsDetails
        .getByRole("button", { name: /Crear franja/i })
        .click(),
    ]);
    expect(
      readSingleValue(`
        select id
        from public.staff_work_windows
        where organization_id = '${toSqlUuid(organizationId!)}'::uuid
          and notes = '${toSqlText(workWindowNotes)}'
        order by created_at desc
        limit 1;
      `),
    ).toBeTruthy();
  });

  test("owner can mutate templates and template blocks through app actions", async ({
    page,
  }) => {
    const stamp = getRuntimeStamp();
    const templateName = `S99 Template ${stamp}`;
    const templateBlockNotes = `S99 template block ${stamp}`;
    const times = getScheduleActionTimes(stamp);

    await page.setViewportSize({ height: 900, width: 1280 });
    await loginAs(page, ownerCredentials!);
    await page.goto(buildProtectedPath("/app/templates", { week: smokeWeek }));
    await expectNoFrameworkError(page);

    const createTemplateDetails = await openDetailsByText(
      page,
      "Crear plantilla semanal",
    );
    await createTemplateDetails.locator('input[name="name"]').fill(templateName);
    await Promise.all([
      waitForStatus(page, "template-created"),
      createTemplateDetails
        .getByRole("button", { name: /Crear plantilla/i })
        .click(),
    ]);

    const templateId = readSingleValue(`
      select id
      from public.schedule_templates
      where organization_id = '${toSqlUuid(organizationId!)}'::uuid
        and name = '${toSqlText(templateName)}'
      order by created_at desc
      limit 1;
    `);
    expect(templateId).toBeTruthy();

    await page.goto(buildProtectedPath("/app/templates", { week: smokeWeek }));
    await expectNoFrameworkError(page);
    const templateCard = page
      .locator('[data-slot="card"]')
      .filter({ hasText: templateName })
      .first();
    await expect(templateCard).toBeVisible();
    const templateDetails = templateCard
      .locator("details")
      .filter({ hasText: "Detalle completo" })
      .first();
    await templateDetails.locator("summary").first().click();
    const addBlockDetails = templateDetails
      .locator("details")
      .filter({ hasText: /A.adir bloque/i })
      .first();
    await addBlockDetails.locator("summary").first().click();
    await addBlockDetails.locator('input[name="startTime"]').fill(times.startTime);
    await addBlockDetails.locator('input[name="endTime"]').fill(times.endTime);
    await addBlockDetails.locator('input[name="requiredCoaches"]').fill("0");
    await addBlockDetails.locator('textarea[name="notes"]').fill(templateBlockNotes);
    await Promise.all([
      waitForStatus(page, "template-block-created"),
      addBlockDetails
        .getByRole("button", { name: /Crear bloque de plantilla/i })
        .click(),
    ]);
    expect(
      readSingleValue(`
        select id
        from public.schedule_template_blocks
        where organization_id = '${toSqlUuid(organizationId!)}'::uuid
          and template_id = '${toSqlUuid(templateId)}'::uuid
          and notes = '${toSqlText(templateBlockNotes)}'
        order by created_at desc
        limit 1;
      `),
    ).toBeTruthy();
  });

  test("coach can create a synthetic punch and correction through app actions", async ({
    page,
  }) => {
    const stamp = getRuntimeStamp();
    const minute = Number(stamp.slice(-2)) % 45;
    const punchTime = `06:${String(minute).padStart(2, "0")}`;
    const correctedTime = `2026-05-04T06:${String(minute + 1).padStart(2, "0")}`;

    await page.setViewportSize({ height: 900, width: 1280 });
    await loginAs(page, coachCredentials!);
    await page.goto(buildProtectedPath("/app/time", { week: smokeWeek }));
    await expectNoFrameworkError(page);

    const punchForm = page.locator("form").filter({ hasText: "Fichar entrada" });
    await punchForm.locator('input[name="punchDate"]').fill(smokeWeek);
    await punchForm.locator('input[name="punchTime"]').fill(punchTime);
    await punchForm
      .locator('textarea[name="notes"]')
      .fill(`S99 synthetic punch ${stamp}`);
    await Promise.all([
      waitForStatus(page, "clock-in-created"),
      punchForm.getByRole("button", { name: /Fichar entrada/i }).click(),
    ]);

    await page.goto(buildProtectedPath("/app/time", { week: smokeWeek }));
    await expectNoFrameworkError(page);
    const correctionForm = page
      .locator("form")
      .filter({ hasText: /correcci/i })
      .last();
    await expect(correctionForm).toBeVisible();
    await correctionForm.locator('input[name="occurredAtLocal"]').fill(correctedTime);
    await correctionForm
      .locator('textarea[name="reason"]')
      .fill(`S99 synthetic correction ${stamp}`);
    await Promise.all([
      waitForStatus(page, /correction-(requested|applied-direct)/),
      correctionForm.getByRole("button", { name: /correcci/i }).click(),
    ]);
  });

  test("owner can hit the time export route with an empty synthetic range", async ({
    page,
  }) => {
    await page.setViewportSize({ height: 900, width: 1280 });
    await loginAs(page, ownerCredentials!);

    const exportPath = buildProtectedPath("/app/time/export", {
      from: "2099-01-01",
      to: "2099-01-01",
    });
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.evaluate((path) => {
        window.location.href = path;
      }, exportPath),
    ]);

    expect(download.suggestedFilename()).toMatch(/boxops-time-export.*\.csv$/);
    expect(
      readSingleValue(`
        select status || ':' || coalesce(row_count, -1)::text
        from public.time_exports
        where organization_id = '${toSqlUuid(organizationId!)}'::uuid
          and date_from = '2099-01-01'
          and date_to = '2099-01-01'
        order by created_at desc
        limit 1;
      `),
    ).toBe("generated:0");
  });
});
