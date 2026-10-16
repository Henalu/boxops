import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

process.loadEnvFile(".env.local");
if (process.env.NEXT_PUBLIC_SUPABASE_URL !== "http://127.0.0.1:55321") {
  throw new Error("Only the local BoxOps Supabase is allowed.");
}
const fixture = JSON.parse(readFileSync(".local-evidence/ui-validation/fixture.json", "utf8"));
const env = { ...process.env, E2E_BASE_URL: "http://localhost:3107", E2E_ORGANIZATION_ID: fixture.organizationId, E2E_WEEK: fixture.week };
for (const role of ["owner", "admin", "manager", "coach", "foreign", "support"]) {
  const prefix = role === "foreign" ? "CROSS_TENANT" : role === "support" ? "PLATFORM_ADMIN" : role.toUpperCase();
  env[`E2E_${prefix}_EMAIL`] = fixture.roles[role].email;
  env[`E2E_${prefix}_PASSWORD`] = fixture.roles[role].password;
}
delete env.NO_COLOR;
const args = process.argv.slice(2);
const smoke = args[0] === "--smoke";
if (smoke) args.shift();
if (smoke && args.includes("tests/smoke/documents-repository-surface.spec.ts")) {
  env.E2E_DOCUMENT_UPLOAD_RUNTIME = "1";
}
const result = spawnSync(process.execPath, ["node_modules/@playwright/test/cli.js", "test", `--config=playwright.${smoke ? "smoke" : "ui-validation"}.config.ts`, "--workers=1", ...args], { env, stdio: "inherit" });
process.exitCode = result.status ?? 1;
