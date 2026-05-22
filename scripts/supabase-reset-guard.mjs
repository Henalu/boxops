import { spawnSync } from "node:child_process";

const RESET_CONFIRM_ENV = "BOXOPS_ALLOW_SUPABASE_RESET";
const RESET_CONFIRM_VALUE = "local-reset-ok";

const rawArgs = process.argv.slice(2);
const confirmedByFlag = rawArgs.includes("--yes") || rawArgs.includes("--confirm");
const confirmedByEnv = process.env[RESET_CONFIRM_ENV] === RESET_CONFIRM_VALUE;
const shouldReset = confirmedByFlag || confirmedByEnv;
const forwardedArgs = rawArgs.filter((arg) => arg !== "--yes" && arg !== "--confirm");

function commandName(base) {
  return process.platform === "win32" ? `${base}.cmd` : base;
}

function runCountQuery() {
  const query = `
    select 'auth_users=' || count(*) from auth.users;
    select 'organization_memberships=' || count(*) from public.organization_memberships;
    select 'person_profiles=' || count(*) from public.person_profiles;
    select 'coach_profiles=' || count(*) from public.coach_profiles;
    select 'schedule_templates=' || count(*) from public.schedule_templates;
    select 'schedule_blocks=' || count(*) from public.schedule_blocks;
  `;

  const result = spawnSync(
    "docker",
    [
      "exec",
      "supabase_db_boxops",
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-Atc",
      query,
    ],
    { encoding: "utf8" },
  );

  if (result.status !== 0) {
    return null;
  }

  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function printCounts() {
  const counts = runCountQuery();

  if (!counts) {
    console.log("Local Supabase counts: unavailable (is supabase local running?).");
    return;
  }

  console.log("Local Supabase counts before reset:");
  counts.forEach((line) => console.log(`  ${line}`));
}

console.log("BoxOps guarded Supabase reset");
console.log("");
printCounts();
console.log("");

if (!shouldReset) {
  console.error("Blocked: supabase db reset deletes the local database, including auth.users and manual test data.");
  console.error("");
  console.error("To run an intentional local reset, use one of these explicit forms:");
  console.error("  npm run supabase:reset:danger");
  console.error(`  ${RESET_CONFIRM_ENV}=${RESET_CONFIRM_VALUE} npm run supabase:reset`);
  console.error("");
  console.error("Pass Supabase reset args after --, for example:");
  console.error("  npm run supabase:reset:danger -- --version 00046");
  process.exit(1);
}

console.log("Confirmed local reset. Running: npx supabase db reset");

const result = spawnSync(
  commandName("npx"),
  ["supabase", "db", "reset", ...forwardedArgs],
  {
    stdio: "inherit",
    shell: false,
  },
);

process.exit(result.status ?? 1);
