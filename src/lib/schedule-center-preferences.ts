const POSTGRES_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const SCHEDULE_CENTER_PREFERENCE_COOKIE_MAX_AGE_SECONDS =
  60 * 60 * 24 * 90;

export const TEMPLATE_CENTER_PREFERENCE_ALL_VALUE = "all";

export function getScheduleCenterPreferenceCookieName(organizationId: string) {
  return `boxops_schedule_center_${organizationId.replace(/-/g, "_")}`;
}

export function getTemplateCenterPreferenceCookieName(organizationId: string) {
  return `boxops_template_center_${organizationId.replace(/-/g, "_")}`;
}

export function isScheduleCenterPreferenceValue(
  value: string | null | undefined,
): value is string {
  return Boolean(value && POSTGRES_UUID_PATTERN.test(value));
}

export function isTemplateCenterPreferenceValue(
  value: string | null | undefined,
): value is string {
  return (
    value === TEMPLATE_CENTER_PREFERENCE_ALL_VALUE ||
    isScheduleCenterPreferenceValue(value)
  );
}
