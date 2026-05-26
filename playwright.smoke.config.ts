import { defineConfig } from "@playwright/test";

// Playwright workers force FORCE_COLOR=1; remove NO_COLOR to avoid Node warning noise.
if (process.env.NO_COLOR) {
  delete process.env.NO_COLOR;
}

const port = Number(process.env.E2E_PORT ?? 3000);
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${port}`;
const shouldStartLocalServer = process.env.E2E_START_SERVER === "1";

export default defineConfig({
  testDir: "./tests/smoke",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  workers: shouldStartLocalServer ? 2 : undefined,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: shouldStartLocalServer
    ? {
        command: `npm run dev -- --hostname 127.0.0.1 --port ${port}`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        url: baseURL,
      }
    : undefined,
});
