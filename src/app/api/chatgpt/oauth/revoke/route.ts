import { NextResponse, type NextRequest } from "next/server";

import { revokeChatGptConnectorBearerToken } from "@/lib/chatgpt-connector-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
  Pragma: "no-cache",
} as const;

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const token = formData.get("token");

  if (typeof token === "string" && token.trim()) {
    await revokeChatGptConnectorBearerToken(token.trim());
  }

  return new Response(null, {
    headers: NO_STORE_HEADERS,
    status: 200,
  });
}

export async function GET() {
  return NextResponse.json(
    {
      error: "invalid_request",
      error_description: "Use POST to revoke an OAuth token.",
    },
    {
      headers: NO_STORE_HEADERS,
      status: 405,
    },
  );
}
