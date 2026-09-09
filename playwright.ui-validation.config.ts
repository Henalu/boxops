import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/ui-validation",
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 12_000 },
  outputDir: ".local-evidence/ui-validation/results",
  reporter: [["list"], ["html", { outputFolder: ".local-evidence/ui-validation/report", open: "never" }]],
  use: {
    actionTimeout: 15_000,
    baseURL: "http://127.0.0.1:3107",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
});
