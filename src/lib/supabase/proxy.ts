import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import {
  getRequiredPasswordChangePath,
  isPasswordChangeRequired,
} from "@/lib/auth/required-password-change";
import { getLoginPath } from "@/lib/auth/redirects";
import {
  getScheduleCenterPreferenceCookieName,
  isScheduleCenterPreferenceValue,
  SCHEDULE_CENTER_PREFERENCE_COOKIE_MAX_AGE_SECONDS,
} from "@/lib/schedule-center-preferences";
import { getSupabasePublicEnv } from "@/lib/supabase/env";
import type { Database } from "@/types/supabase";

function withPrivateAppCacheHeaders(response: NextResponse) {
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Pragma", "no-cache");

  return response;
}

function isNavigationPrefetch(request: NextRequest) {
  return (
    request.headers.get("next-router-prefetch") === "1" ||
    request.headers.get("purpose") === "prefetch" ||
    request.headers.get("sec-purpose")?.includes("prefetch") === true
  );
}

function isProtectedSurface(pathname: string) {
  return pathname.startsWith("/app") || pathname.startsWith("/console");
}

function withScheduleCenterPreference(
  request: NextRequest,
  response: NextResponse,
) {
  if (
    request.nextUrl.pathname !== "/app/schedule" ||
    isNavigationPrefetch(request)
  ) {
    return response;
  }

  const centerId = request.nextUrl.searchParams.get("center_id");
  const organizationId = request.nextUrl.searchParams.get("organizationId");

  if (
    !isScheduleCenterPreferenceValue(centerId) ||
    !isScheduleCenterPreferenceValue(organizationId)
  ) {
    return response;
  }

  response.cookies.set(
    getScheduleCenterPreferenceCookieName(organizationId),
    centerId,
    {
      httpOnly: true,
      maxAge: SCHEDULE_CENTER_PREFERENCE_COOKIE_MAX_AGE_SECONDS,
      path: "/app",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    },
  );

  return response;
}

export async function updateSession(request: NextRequest) {
  const { supabaseUrl, supabaseAnonKey } = getSupabasePublicEnv();
  let response = withPrivateAppCacheHeaders(NextResponse.next({ request }));

  const supabase = createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headersToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        response = withPrivateAppCacheHeaders(NextResponse.next({ request }));

        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });

        Object.entries(headersToSet).forEach(([key, value]) => {
          response.headers.set(key, value);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && isProtectedSurface(request.nextUrl.pathname)) {
    const redirectTo = `${request.nextUrl.pathname}${request.nextUrl.search}`;
    const loginUrl = new URL(getLoginPath(redirectTo), request.url);

    return withPrivateAppCacheHeaders(NextResponse.redirect(loginUrl));
  }

  if (user && isProtectedSurface(request.nextUrl.pathname)) {
    if (isPasswordChangeRequired(user)) {
      return withPrivateAppCacheHeaders(
        NextResponse.redirect(
          new URL(getRequiredPasswordChangePath(), request.url),
        ),
      );
    }
  }

  return withScheduleCenterPreference(
    request,
    withPrivateAppCacheHeaders(response),
  );
}
