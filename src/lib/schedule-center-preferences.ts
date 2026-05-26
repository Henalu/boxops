const POSTGRES_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const SCHEDULE_CENTER_PREFERENCE_COOKIE_MAX_AGE_SECONDS =
  60 * 60 * 24 * 90;

export function getScheduleCenterPreferenceCookieName(organizationId: string) {
  return `boxops_schedule_center_${organizationId.replace(/-/g, "_")}`;
}

export function isScheduleCenterPreferenceValue(
  value: string | null | undefined,
): value is string {
  return Boolean(value && POSTGRES_UUID_PATTERN.test(value));
}
