import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const envPath = path.join(projectRoot, ".env.local");
const outputDir = path.join(
  projectRoot,
  "docs",
  "user-guides",
  "export",
  "assets",
  "screenshots",
);

function parseEnvLine(line) {
  const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
  if (!match) {
    return null;
  }

  let value = match[2] ?? "";
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return [match[1], value];
}

async function loadLocalEnv() {
  try {
    const source = await fs.readFile(envPath, "utf8");
    for (const line of source.split(/\r?\n/)) {
      const parsed = parseEnvLine(line);
      if (!parsed) {
        continue;
      }

      const [key, value] = parsed;
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // Missing .env.local is acceptable; the script will fall back to placeholders.
  }
}

function getCredentials(role) {
  const prefix = `E2E_${role.toUpperCase()}`;
  const email = process.env[`${prefix}_EMAIL`]?.trim();
  const password = process.env[`${prefix}_PASSWORD`]?.trim();

  return email && password ? { email, password } : null;
}

function buildUrl(pathname, extraParams = {}) {
  const baseURL = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
  const url = new URL(pathname, baseURL);
  const organizationId =
    process.env.GUIDE_CAPTURE_WITH_ORGANIZATION_ID === "1"
      ? process.env.E2E_ORGANIZATION_ID?.trim()
      : "";
  const week = process.env.E2E_WEEK?.trim();

  if (organizationId) {
    url.searchParams.set("organizationId", organizationId);
  }

  if (
    week &&
    ["/app", "/app/schedule", "/app/templates", "/app/coverage", "/app/more"].includes(
      pathname,
    )
  ) {
    url.searchParams.set("week", week);
  }

  for (const [key, value] of Object.entries(extraParams)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

async function dismissAndStabilize(page) {
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        scroll-behavior: auto !important;
      }
      input, textarea { caret-color: transparent !important; }
    `,
  }).catch(() => {});
  await page.evaluate(() => {
    window.localStorage.setItem("boxops_onboarding_seen_v1", "true");
    window.localStorage.setItem("boxops_onboarding_seen_v2", "true");
    window.localStorage.setItem("boxops_onboarding_seen_v3", "true");
  }).catch(() => {});
}

async function loginAs(page, credentials) {
  await page.goto(buildUrl("/login"), { waitUntil: "domcontentloaded" });
  await dismissAndStabilize(page);
  await page.getByLabel(/^Email$/i).fill(credentials.email);
  await page.getByLabel(/Contrase/i).fill(credentials.password);
  await page.getByRole("button", { name: /Entrar/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
    timeout: 30_000,
  });
  await page.waitForLoadState("networkidle").catch(() => {});
}

async function capture(page, name, pathname, params = {}, options = {}) {
  await page.goto(buildUrl(pathname, params), { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  await dismissAndStabilize(page);

  if (options.clickText) {
    await page.getByText(options.clickText, { exact: false }).first().click().catch(() => {});
    await page.waitForTimeout(250);
  }

  if (options.scrollY) {
    await page.evaluate((scrollY) => window.scrollTo(0, scrollY), options.scrollY);
    await page.waitForTimeout(150);
  }

  const filePath = path.join(outputDir, `${name}.png`);
  const target = options.viewport ? page : page.locator("main").first();
  await target.screenshot({ path: filePath });

  return filePath;
}

async function main() {
  await loadLocalEnv();
  await fs.mkdir(outputDir, { recursive: true });

  const browser = await chromium.launch();
  const captured = [];
  const warnings = [];

  const publicContext = await browser.newContext({
    viewport: { height: 900, width: 1440 },
  });
  const publicPage = await publicContext.newPage();
  await publicPage.goto(buildUrl("/login"), { waitUntil: "domcontentloaded" });
  await dismissAndStabilize(publicPage);
  await publicPage.screenshot({
    fullPage: false,
    path: path.join(outputDir, "login.png"),
  });
  captured.push("login.png");
  await publicContext.close();

  const desktopRoutes = [
    ["dashboard", "/app", {}, "owner"],
    ["schedule-week", "/app/schedule", { view: "week" }, "owner"],
    ["coverage", "/app/coverage", {}, "owner"],
    ["team", "/app/coaches", {}, "admin"],
    ["centers", "/app/centers", {}, "admin"],
    ["class-types", "/app/class-types", {}, "admin"],
    ["templates", "/app/templates", {}, "admin"],
    ["requests", "/app/requests", {}, "manager"],
    ["absences", "/app/absences", {}, "manager"],
    ["time", "/app/time", {}, "manager"],
    ["documents", "/app/documents", {}, "manager"],
    ["coach-dashboard", "/app", {}, "coach"],
    ["coach-team", "/app/coaches", {}, "coach"],
    ["coach-centers", "/app/centers", {}, "coach"],
    ["coach-class-types", "/app/class-types", {}, "coach"],
    ["coach-templates", "/app/templates", {}, "coach"],
    ["coach-schedule", "/app/schedule", { mine: "1" }, "coach"],
    ["coach-time", "/app/time", {}, "coach"],
    ["account", "/app/account", {}, "coach"],
  ];
  const onlyRole = process.env.GUIDE_CAPTURE_ONLY_ROLE?.trim().toLowerCase();
  const selectedDesktopRoutes = onlyRole
    ? desktopRoutes.filter(([, , , role]) => role === onlyRole)
    : desktopRoutes;

  const contexts = new Map();

  for (const [name, pathname, params, role] of selectedDesktopRoutes) {
    try {
      const credentials = getCredentials(role);
      if (!credentials) {
        warnings.push(`${name}: missing ${role} credentials`);
        continue;
      }

      let context = contexts.get(role);
      if (!context) {
        context = await browser.newContext({ viewport: { height: 900, width: 1440 } });
        contexts.set(role, context);
        const loginPage = await context.newPage();
        await loginAs(loginPage, credentials);
        await loginPage.close();
      }

      const page = await context.newPage();
      await capture(page, name, pathname, params);
      await page.close();
      captured.push(`${name}.png`);
    } catch (error) {
      warnings.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  try {
    const coachCredentials = getCredentials("coach");
    if (coachCredentials) {
      const mobileContext = await browser.newContext({
        isMobile: true,
        viewport: { height: 844, width: 390 },
      });
      const mobilePage = await mobileContext.newPage();
      await loginAs(mobilePage, coachCredentials);
      await capture(mobilePage, "coach-mobile-home", "/app", {}, { viewport: true });
      await capture(mobilePage, "coach-mobile-schedule", "/app/schedule", {
        mine: "1",
      }, { viewport: true });
      captured.push("coach-mobile-home.png", "coach-mobile-schedule.png");
      await mobileContext.close();
    } else {
      warnings.push("coach mobile: missing coach credentials");
    }
  } catch (error) {
    warnings.push(
      `coach mobile: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  for (const context of contexts.values()) {
    await context.close();
  }

  await browser.close();

  await fs.writeFile(
    path.join(outputDir, "capture-report.json"),
    JSON.stringify({ captured, warnings }, null, 2),
  );

  console.log(`Captured ${captured.length} screenshot(s).`);
  if (warnings.length > 0) {
    console.log(`Warnings: ${warnings.length}. See capture-report.json.`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
