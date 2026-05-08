import { NextResponse, type NextRequest } from "next/server";

import { getSafeRedirectPath } from "@/lib/auth/redirects";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const redirectTo = getSafeRedirectPath(
    requestUrl.searchParams.get("redirectTo") ??
      requestUrl.searchParams.get("next"),
  );
  const errorRedirectPath = redirectTo.startsWith("/reset-password")
    ? "/reset-password?error=callback"
    : "/login?error=callback";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(new URL(redirectTo, requestUrl.origin));
    }
  }

  return NextResponse.redirect(new URL(errorRedirectPath, requestUrl.origin));
}
