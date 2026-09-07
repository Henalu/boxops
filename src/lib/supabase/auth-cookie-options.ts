import type { CookieOptionsWithName } from "@supabase/ssr";

const COOKIE_DOMAIN_PATTERN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;

export function normalizeHubAuthCookieDomain(
  value: string | null | undefined,
) {
  const domain = value?.trim().replace(/^\.+/, "").toLowerCase();

  if (
    !domain ||
    domain === "localhost" ||
    !COOKIE_DOMAIN_PATTERN.test(domain)
  ) {
    return null;
  }

  return domain;
}

export function getSupabaseAuthCookieOptions({
  cookieDomain = process.env.NEXT_PUBLIC_HUB_AUTH_COOKIE_DOMAIN,
  nodeEnv = process.env.NODE_ENV,
}: {
  cookieDomain?: string | null;
  nodeEnv?: string;
} = {}): CookieOptionsWithName {
  const domain = normalizeHubAuthCookieDomain(cookieDomain);

  return {
    ...(domain ? { domain } : {}),
    path: "/",
    sameSite: "lax",
    secure: nodeEnv === "production",
  };
}
