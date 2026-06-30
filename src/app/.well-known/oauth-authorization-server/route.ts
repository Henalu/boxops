import { NextResponse, type NextRequest } from "next/server";

import { getChatGptConnectorAuthorizationServerMetadata } from "@/lib/chatgpt-connector-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
} as const;

export async function GET(request: NextRequest) {
  return NextResponse.json(
    getChatGptConnectorAuthorizationServerMetadata(request.nextUrl.origin),
    {
      headers: NO_STORE_HEADERS,
    },
  );
}
