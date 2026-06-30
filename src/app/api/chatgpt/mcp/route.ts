import { NextResponse, type NextRequest } from "next/server";

import {
  getChatGptConnectorMcpDiscovery,
  handleChatGptConnectorMcpRequest,
} from "@/lib/chatgpt-connector-mcp";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
} as const;

export async function GET(request: NextRequest) {
  return NextResponse.json(
    getChatGptConnectorMcpDiscovery(request.nextUrl.origin),
    {
      headers: NO_STORE_HEADERS,
    },
  );
}

export async function POST(request: NextRequest) {
  return handleChatGptConnectorMcpRequest(request);
}

export async function OPTIONS() {
  return new Response(null, {
    headers: {
      ...NO_STORE_HEADERS,
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      Allow: "GET, POST, OPTIONS",
    },
    status: 204,
  });
}
