export interface SmokeCredentials {
  email: string;
  password: string;
}

function readEnv(name: string): string | null {
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

export const adminCredentials = readCredentials("E2E_ADMIN");
export const coachCredentials = readCredentials("E2E_COACH");
export const managerCredentials = readCredentials("E2E_MANAGER");
export const organizationId = readEnv("E2E_ORGANIZATION_ID");
export const ownerCredentials = readCredentials("E2E_OWNER");
export const smokeWeek = readEnv("E2E_WEEK");

export function hasCredentials(
  credentials: SmokeCredentials | null,
): credentials is SmokeCredentials {
  return Boolean(credentials?.email && credentials.password);
}
