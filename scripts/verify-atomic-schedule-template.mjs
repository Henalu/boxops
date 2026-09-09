import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL(
  "../supabase/migrations/20260907081226_atomic_schedule_template_week.sql", import.meta.url,
), "utf8");
const verification = readFileSync(new URL(
  "../supabase/snippets/atomic-schedule-template-week-verification.sql", import.meta.url,
), "utf8");

const result = spawnSync("docker", [
  "exec", "-i", "supabase_db_boxops", "psql", "-U", "postgres", "-d", "postgres",
  "-v", "ON_ERROR_STOP=1", "-X", "-q", "-t", "-A",
], {
  input: `BEGIN;\nSET LOCAL statement_timeout = '30s';\n${migration}\n${verification}\nROLLBACK;\n`,
  encoding: "utf8",
  timeout: 120_000,
  maxBuffer: 2 * 1024 * 1024,
});

if (result.error) {
  console.error(result.error.message);
  process.exitCode = 1;
} else {
  if (result.stdout?.trim()) console.log(result.stdout.trim());
  process.stderr.write(result.stderr ?? "");
  process.exitCode = result.status ?? 1;
  if (result.status === 0) console.log("Atomic template verification passed; all changes rolled back.");
}
