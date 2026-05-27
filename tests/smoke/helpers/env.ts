import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface SmokeCredentials {
  email: string;
  password: string;
}

function readEnvFile() {
  try {
    const envPath = join(process.cwd(), ".env.local");

    if (!existsSync(envPath)) {
      return new Map<string, string>();
    }

    const values = new Map<string, string>();
    const content = readFileSync(envPath, "utf8");

    content.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith("#")) {
        return;
      }

      const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);

      if (!match) {
        return;
      }

      const [, name, rawValue] = match;
      let value = rawValue.trim();

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      if (value) {
        values.set(name, value);
      }
    });

    return values;
  } catch {
    return new Map<string, string>();
  }
}

const envFileValues = readEnvFile();

function readEnv(name: string): string | null {
  const value = process.env[name]?.trim() ?? envFileValues.get(name)?.trim();

  return value ? value : null;
}

function readProcessEnv(name: string): string | null {
  const value = process.env[name]?.trim();

  return value ? value : null;
}

function readCredentials(prefix: string): SmokeCredentials | null {
  const email = readEnv(`${prefix}_EMAIL`);
  const password = readEnv(`${prefix}_PASSWORD`);

  if (!email || !password) {
    return null;
  }

  return { email, password };
}

function readProcessCredentials(
  emailName: string,
  passwordName: string,
): SmokeCredentials | null {
  const email = readProcessEnv(emailName);
  const password = readProcessEnv(passwordName);

  if (!email || !password) {
    return null;
  }

  return { email, password };
}

export const adminCredentials = readCredentials("E2E_ADMIN");
export const coachCredentials = readCredentials("E2E_COACH");
export const crossTenantCredentials = readProcessCredentials(
  "E2E_CROSS_TENANT_EMAIL",
  "E2E_CROSS_TENANT_PASSWORD",
);
export const managerCredentials = readCredentials("E2E_MANAGER");
export const organizationId = readEnv("E2E_ORGANIZATION_ID");
export const ownerCredentials = readCredentials("E2E_OWNER");
export const payrollManagerCredentials = readCredentials("E2E_PAYROLL_MANAGER");
export const platformAdminCredentials = readCredentials("E2E_PLATFORM_ADMIN");
export const smokeWeek = readEnv("E2E_WEEK");
export const supabaseAnonKey = readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
export const supabaseUrl = readEnv("NEXT_PUBLIC_SUPABASE_URL");

export function hasCredentials(
  credentials: SmokeCredentials | null,
): credentials is SmokeCredentials {
  return Boolean(credentials?.email && credentials.password);
}
