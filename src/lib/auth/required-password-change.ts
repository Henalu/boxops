import type { User } from "@supabase/supabase-js";

const REQUIRED_PASSWORD_CHANGE_KEY = "boxops_password_change_required";
const REQUIRED_PASSWORD_CHANGE_REASON_KEY = "boxops_password_change_reason";
const REQUIRED_PASSWORD_CHANGE_SET_AT_KEY = "boxops_password_change_set_at";

type AppMetadata = User["app_metadata"];

export function isPasswordChangeRequired(user: Pick<User, "app_metadata">) {
  return user.app_metadata?.[REQUIRED_PASSWORD_CHANGE_KEY] === true;
}

export function getRequiredPasswordChangePath() {
  const params = new URLSearchParams({ reason: "first-login" });

  return `/reset-password?${params.toString()}`;
}

export function buildRequiredPasswordChangeAppMetadata(
  appMetadata: AppMetadata = {},
) {
  return {
    ...appMetadata,
    [REQUIRED_PASSWORD_CHANGE_KEY]: true,
    [REQUIRED_PASSWORD_CHANGE_REASON_KEY]: "admin_created",
    [REQUIRED_PASSWORD_CHANGE_SET_AT_KEY]: new Date().toISOString(),
  };
}

export function clearRequiredPasswordChangeAppMetadata(
  appMetadata: AppMetadata = {},
) {
  const nextMetadata = { ...appMetadata };

  nextMetadata[REQUIRED_PASSWORD_CHANGE_KEY] = null;
  nextMetadata[REQUIRED_PASSWORD_CHANGE_REASON_KEY] = null;
  nextMetadata[REQUIRED_PASSWORD_CHANGE_SET_AT_KEY] = null;

  return nextMetadata;
}
