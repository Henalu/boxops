import { headers } from "next/headers";

import { getSafeRedirectPath } from "@/lib/auth/redirects";

function getFirstHeaderValue(value: string | null) {
  return value?.split(",")[0]?.trim() ?? null;
}

export function normalizeSiteOrigin(value: string | null | undefined) {
  const trimmedValue = value?.trim();

  if (!trimmedValue) {
    return null;
  }

  const candidate = /^https?:\/\//i.test(trimmedValue)
    ? trimmedValue
    : `https://${trimmedValue}`;

  try {
    return new URL(candidate).origin;
  } catch {
    return null;
  }
}

export async function getRequestOrigin() {
  const configuredOrigin =
    normalizeSiteOrigin(process.env.NEXT_PUBLIC_SITE_URL) ??
    normalizeSiteOrigin(process.env.NEXT_PUBLIC_VERCEL_URL) ??
    normalizeSiteOrigin(process.env.VERCEL_URL);

  if (configuredOrigin) {
    return configuredOrigin;
  }

  const headerStore = await headers();
  const host =
    getFirstHeaderValue(headerStore.get("x-forwarded-host")) ??
    getFirstHeaderValue(headerStore.get("host")) ??
    "127.0.0.1:3000";
  const protocol =
    getFirstHeaderValue(headerStore.get("x-forwarded-proto")) ??
    (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");

  return `${protocol}://${host}`;
}

export async function getAuthCallbackUrl(nextPath: string) {
  const origin = await getRequestOrigin();
  const callbackUrl = new URL("/auth/callback", origin);

  callbackUrl.searchParams.set("next", getSafeRedirectPath(nextPath));

  return callbackUrl.toString();
}
