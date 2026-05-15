import { NextResponse, type NextRequest } from "next/server";

import { getLoginPath } from "@/lib/auth/redirects";
import { generateTimeRecordsCsvExport } from "@/lib/time-tracking";

export const dynamic = "force-dynamic";

function noStoreJson(code: string, status: number) {
  return NextResponse.json(
    {
      error: code,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
      status,
    },
  );
}

function redirectToLogin(request: NextRequest) {
  const redirectTo = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  const loginUrl = new URL(getLoginPath(redirectTo), request.url);

  return NextResponse.redirect(loginUrl, 303);
}

function getErrorStatus(error: string) {
  if (error === "authentication_required") {
    return 401;
  }

  if (error === "forbidden") {
    return 403;
  }

  if (error === "load_failed" || error === "export_failed") {
    return 500;
  }

  return 400;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const result = await generateTimeRecordsCsvExport({
    dateFrom: params.get("from") ?? "",
    dateTo: params.get("to") ?? "",
    organizationId: params.get("organizationId") ?? "",
    personProfileId: params.get("person_profile_id"),
  });

  if (!result.ok) {
    if (result.error === "authentication_required") {
      return redirectToLogin(request);
    }

    return noStoreJson(result.error, getErrorStatus(result.error));
  }

  return new Response(result.data.csv, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="${result.data.filename}"`,
      "Content-Type": "text/csv; charset=utf-8",
      "X-BoxOps-Export-Id": result.data.exportId,
      "X-BoxOps-Export-Scope": "internal-review",
    },
  });
}
