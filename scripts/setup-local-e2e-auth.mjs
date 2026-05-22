import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const args = new Set(process.argv.slice(2));
const shouldCommit = args.has("--commit");
const explicitDryRun = args.has("--dry-run");

if (shouldCommit && explicitDryRun) {
  console.error("Use either --dry-run or --commit, not both.");
  process.exit(1);
}

const mode = shouldCommit ? "commit" : "dry-run";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLE_DEFINITIONS = [
  { envPrefix: "E2E_OWNER", appRole: "owner", displayName: "E2E Owner", needsCoach: false },
  { envPrefix: "E2E_ADMIN", appRole: "admin", displayName: "E2E Admin", needsCoach: false },
  { envPrefix: "E2E_MANAGER", appRole: "manager", displayName: "E2E Manager", needsCoach: false },
  { envPrefix: "E2E_COACH", appRole: "coach", displayName: "E2E Coach", needsCoach: true },
  {
    envPrefix: "E2E_PAYROLL_MANAGER",
    appRole: "payroll_manager",
    displayName: "E2E Payroll Manager",
    needsCoach: false,
  },
];

function readEnvFile() {
  const envPath = join(process.cwd(), ".env.local");

  if (!existsSync(envPath)) {
    return new Map();
  }

  const values = new Map();
  const content = readFileSync(envPath, "utf8");

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);

    if (!match) {
      continue;
    }

    let value = match[2].trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (value) {
      values.set(match[1], value);
    }
  }

  return values;
}

const envFileValues = readEnvFile();

function readEnv(name) {
  return process.env[name]?.trim() || envFileValues.get(name)?.trim() || "";
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function redactError(text) {
  return String(text)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "<email_redacted>")
    .replace(/postgres(?:ql)?:\/\/\S+/gi, "<db_url_redacted>")
    .replace(/eyJ[A-Za-z0-9._-]+/g, "<jwt_redacted>");
}

function commandName(base) {
  return process.platform === "win32" ? `${base}.cmd` : base;
}

function ensureLocalTarget() {
  const supabaseUrl = readEnv("NEXT_PUBLIC_SUPABASE_URL");

  if (!supabaseUrl || !/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/i.test(supabaseUrl)) {
    console.error("Blocked: NEXT_PUBLIC_SUPABASE_URL must point to local Supabase.");
    console.error("No remote, QA, staging or production Auth fixture setup is allowed by this script.");
    process.exit(1);
  }
}

function collectCredentials() {
  const rows = [];
  const missing = [];

  for (const definition of ROLE_DEFINITIONS) {
    const email = readEnv(`${definition.envPrefix}_EMAIL`);
    const password = readEnv(`${definition.envPrefix}_PASSWORD`);

    if (!email && !password) {
      missing.push(definition.envPrefix);
      continue;
    }

    if (!email || !password) {
      console.error(`Blocked: ${definition.envPrefix}_EMAIL and ${definition.envPrefix}_PASSWORD must be set together.`);
      process.exit(1);
    }

    rows.push({
      ...definition,
      email,
      password,
    });
  }

  if (rows.length === 0) {
    console.error("Blocked: no E2E credentials found in process env or .env.local.");
    process.exit(1);
  }

  const seen = new Set();

  for (const row of rows) {
    const key = row.email.toLowerCase();

    if (seen.has(key)) {
      console.error("Blocked: E2E role emails must be distinct.");
      process.exit(1);
    }

    seen.add(key);
  }

  return { rows, missing };
}

function buildSql(organizationId, rows) {
  const values = rows
    .map((row) =>
      [
        sqlLiteral(row.email),
        sqlLiteral(row.password),
        sqlLiteral(row.appRole),
        sqlLiteral(row.displayName),
        row.needsCoach ? "true" : "false",
      ].join(", "),
    )
    .map((tuple) => `    (${tuple})`)
    .join(",\n");

  const transactionEnd = shouldCommit ? "COMMIT;" : "ROLLBACK;";

  return `
BEGIN;

CREATE TEMP TABLE boxops_local_e2e_input (
  email text not null,
  password text not null,
  app_role text not null,
  display_name text not null,
  needs_coach boolean not null
) ON COMMIT DROP;

INSERT INTO boxops_local_e2e_input (email, password, app_role, display_name, needs_coach)
VALUES
${values};

DO $$
DECLARE
  target_organization_id uuid := ${sqlLiteral(organizationId)}::uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.organizations organization
    WHERE organization.id = target_organization_id
  ) THEN
    RAISE EXCEPTION 'Target E2E organization is missing.';
  END IF;
END $$;

WITH upserted_users AS (
  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change,
    is_super_admin,
    created_at,
    updated_at,
    email_change_token_current,
    email_change_confirm_status,
    reauthentication_token,
    raw_app_meta_data,
    raw_user_meta_data,
    is_sso_user,
    is_anonymous
  )
  SELECT
    '00000000-0000-0000-0000-000000000000'::uuid,
    gen_random_uuid(),
    'authenticated',
    'authenticated',
    input.email,
    extensions.crypt(input.password, extensions.gen_salt('bf')),
    now(),
    '',
    '',
    '',
    '',
    false,
    now(),
    now(),
    '',
    0,
    '',
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('name', input.display_name, 'boxopsLocalE2E', true),
    false,
    false
  FROM boxops_local_e2e_input input
  ON CONFLICT (email) WHERE is_sso_user = false
  DO UPDATE SET
    encrypted_password = EXCLUDED.encrypted_password,
    email_confirmed_at = COALESCE(auth.users.email_confirmed_at, now()),
    confirmation_token = '',
    recovery_token = '',
    email_change_token_new = '',
    email_change = '',
    is_super_admin = false,
    email_change_token_current = '',
    email_change_confirm_status = 0,
    reauthentication_token = '',
    raw_app_meta_data = EXCLUDED.raw_app_meta_data,
    raw_user_meta_data = EXCLUDED.raw_user_meta_data,
    updated_at = now()
  RETURNING id, email
)
INSERT INTO auth.identities (
  provider_id,
  user_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
)
SELECT
  upserted_users.id::text,
  upserted_users.id,
  jsonb_build_object(
    'sub', upserted_users.id::text,
    'email', upserted_users.email,
    'email_verified', true,
    'phone_verified', false
  ),
  'email',
  NULL,
  now(),
  now()
FROM upserted_users
ON CONFLICT (provider_id, provider)
DO UPDATE SET
  identity_data = EXCLUDED.identity_data,
  updated_at = now();

INSERT INTO public.organization_memberships (
  organization_id,
  user_id,
  role,
  status,
  joined_at
)
SELECT
  ${sqlLiteral(organizationId)}::uuid,
  auth_user.id,
  input.app_role,
  'active',
  now()
FROM boxops_local_e2e_input input
JOIN auth.users auth_user
  ON auth_user.email = input.email
ON CONFLICT (organization_id, user_id)
DO UPDATE SET
  role = EXCLUDED.role,
  status = 'active',
  joined_at = COALESCE(public.organization_memberships.joined_at, now()),
  updated_at = now();

UPDATE public.person_profiles person_profile
SET
  full_name = input.display_name,
  display_name = input.display_name,
  preferred_alias = input.display_name,
  public_email = input.email,
  visibility_status = 'visible',
  status = 'active',
  metadata = COALESCE(person_profile.metadata, '{}'::jsonb) || jsonb_build_object('boxopsLocalE2E', true, 'role', input.app_role),
  updated_at = now()
FROM boxops_local_e2e_input input
JOIN auth.users auth_user
  ON auth_user.email = input.email
WHERE person_profile.organization_id = ${sqlLiteral(organizationId)}::uuid
  AND person_profile.user_id = auth_user.id;

INSERT INTO public.person_profiles (
  organization_id,
  user_id,
  full_name,
  display_name,
  preferred_alias,
  public_email,
  visibility_status,
  status,
  metadata
)
SELECT
  ${sqlLiteral(organizationId)}::uuid,
  auth_user.id,
  input.display_name,
  input.display_name,
  input.display_name,
  input.email,
  'visible',
  'active',
  jsonb_build_object('boxopsLocalE2E', true, 'role', input.app_role)
FROM boxops_local_e2e_input input
JOIN auth.users auth_user
  ON auth_user.email = input.email
WHERE NOT EXISTS (
  SELECT 1
  FROM public.person_profiles person_profile
  WHERE person_profile.organization_id = ${sqlLiteral(organizationId)}::uuid
    AND person_profile.user_id = auth_user.id
);

INSERT INTO public.coach_profiles (
  organization_id,
  user_id,
  person_profile_id,
  primary_center_id,
  weekly_contracted_hours,
  status,
  notes,
  metadata
)
SELECT
  ${sqlLiteral(organizationId)}::uuid,
  auth_user.id,
  person_profile.id,
  (
    SELECT center.id
    FROM public.centers center
    WHERE center.organization_id = ${sqlLiteral(organizationId)}::uuid
      AND center.status = 'active'
    ORDER BY center.name
    LIMIT 1
  ),
  0,
  'active',
  'Local E2E fixture',
  jsonb_build_object('boxopsLocalE2E', true)
FROM boxops_local_e2e_input input
JOIN auth.users auth_user
  ON auth_user.email = input.email
JOIN public.person_profiles person_profile
  ON person_profile.organization_id = ${sqlLiteral(organizationId)}::uuid
  AND person_profile.user_id = auth_user.id
WHERE input.needs_coach
ON CONFLICT (organization_id, user_id)
DO UPDATE SET
  person_profile_id = EXCLUDED.person_profile_id,
  primary_center_id = COALESCE(public.coach_profiles.primary_center_id, EXCLUDED.primary_center_id),
  status = 'active',
  metadata = COALESCE(public.coach_profiles.metadata, '{}'::jsonb) || jsonb_build_object('boxopsLocalE2E', true),
  updated_at = now();

SELECT 'mode=${mode}';
SELECT 'input_roles=' || count(*) FROM boxops_local_e2e_input;
SELECT 'auth_users_matched=' || count(*)
FROM auth.users auth_user
JOIN boxops_local_e2e_input input
  ON input.email = auth_user.email;
SELECT 'memberships_matched=' || count(*)
FROM public.organization_memberships membership
JOIN auth.users auth_user
  ON auth_user.id = membership.user_id
JOIN boxops_local_e2e_input input
  ON input.email = auth_user.email
WHERE membership.organization_id = ${sqlLiteral(organizationId)}::uuid
  AND membership.status = 'active';
SELECT 'person_profiles_matched=' || count(*)
FROM public.person_profiles person_profile
JOIN auth.users auth_user
  ON auth_user.id = person_profile.user_id
JOIN boxops_local_e2e_input input
  ON input.email = auth_user.email
WHERE person_profile.organization_id = ${sqlLiteral(organizationId)}::uuid;
SELECT 'coach_profiles_matched=' || count(*)
FROM public.coach_profiles coach_profile
JOIN auth.users auth_user
  ON auth_user.id = coach_profile.user_id
JOIN boxops_local_e2e_input input
  ON input.email = auth_user.email
WHERE coach_profile.organization_id = ${sqlLiteral(organizationId)}::uuid
  AND input.needs_coach;

${transactionEnd}
`;
}

ensureLocalTarget();

const organizationId = readEnv("E2E_ORGANIZATION_ID");

if (!UUID_RE.test(organizationId)) {
  console.error("Blocked: E2E_ORGANIZATION_ID must be a UUID.");
  process.exit(1);
}

const { rows, missing } = collectCredentials();
const sql = buildSql(organizationId, rows);

console.log(`BoxOps local E2E Auth setup (${mode})`);
console.log(`Detected role credentials: ${rows.map((row) => row.appRole).join(", ")}`);

if (missing.length > 0) {
  console.log(`Missing optional credential groups: ${missing.join(", ")}`);
}

const result = spawnSync(
  "docker",
  ["exec", "-i", "supabase_db_boxops", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"],
  {
    input: sql,
    encoding: "utf8",
  },
);

if (result.status !== 0) {
  console.error("Local E2E Auth setup failed. Output redacted:");
  const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
  console.error(redactError(output));
  process.exit(result.status ?? 1);
}

const output = result.stdout
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line.includes("="));

output.forEach((line) => console.log(line));

if (!shouldCommit) {
  console.log("Dry run only: transaction rolled back. Use npm run supabase:setup:e2e-auth:commit to persist local E2E users.");
}
