const DEFAULT_APP_PATH = "/app";

export function getSafeRedirectPath(
  value: FormDataEntryValue | string | string[] | null | undefined,
  fallback = DEFAULT_APP_PATH,
) {
  const redirectTo = Array.isArray(value) ? value[0] : value;

  if (
    typeof redirectTo !== "string" ||
    !redirectTo.startsWith("/") ||
    redirectTo.startsWith("//")
  ) {
    return fallback;
  }

  return redirectTo;
}

export function getLoginPath(redirectTo: string) {
  const safeRedirectTo = getSafeRedirectPath(redirectTo);
  const params = new URLSearchParams({ redirectTo: safeRedirectTo });

  return `/login?${params.toString()}`;
}
