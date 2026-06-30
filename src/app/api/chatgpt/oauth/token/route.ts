import { NextResponse, type NextRequest } from "next/server";

import {
  CHATGPT_CONNECTOR_ACCESS_TOKEN_MAX_TTL_SECONDS,
  createChatGptConnectorOpaqueCredential,
  exchangeChatGptConnectorOAuthCode,
  getChatGptConnectorPkceChallenge,
  getChatGptConnectorResourceIdentifier,
  hashChatGptConnectorCredential,
} from "@/lib/chatgpt-connector-auth";
import { createChatGptConnectorRequestId } from "@/lib/chatgpt-connector-core";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
  Pragma: "no-cache",
} as const;

function oauthError(input: {
  description: string;
  error: string;
  status?: number;
}) {
  return NextResponse.json(
    {
      error: input.error,
      error_description: input.description,
    },
    {
      headers: NO_STORE_HEADERS,
      status: input.status ?? 400,
    },
  );
}

function isValidText(value: string | null, maxLength: number) {
  return Boolean(value && value.length <= maxLength);
}

function isValidCodeVerifier(value: string | null) {
  return Boolean(value && /^[A-Za-z0-9._~-]{43,128}$/.test(value));
}

function getSecondsUntil(value: string) {
  return Math.max(
    0,
    Math.floor((new Date(value).getTime() - Date.now()) / 1000),
  );
}

export async function POST(request: NextRequest) {
  const requestId = createChatGptConnectorRequestId();
  const formData = await request.formData();
  const grantType = formData.get("grant_type");
  const code = formData.get("code");
  const redirectUri = formData.get("redirect_uri");
  const clientId = formData.get("client_id");
  const codeVerifier = formData.get("code_verifier");
  const resource =
    typeof formData.get("resource") === "string"
      ? String(formData.get("resource"))
      : getChatGptConnectorResourceIdentifier(request.nextUrl.origin);

  if (
    grantType !== "authorization_code" ||
    !isValidText(typeof code === "string" ? code : null, 256) ||
    !isValidText(typeof redirectUri === "string" ? redirectUri : null, 2048) ||
    !isValidText(typeof clientId === "string" ? clientId : null, 512) ||
    !isValidCodeVerifier(
      typeof codeVerifier === "string" ? codeVerifier : null,
    ) ||
    resource !== getChatGptConnectorResourceIdentifier(request.nextUrl.origin)
  ) {
    return oauthError({
      description: "The token request is not valid.",
      error: "invalid_request",
    });
  }

  const codeValue = String(code);
  const redirectUriValue = String(redirectUri);
  const clientIdValue = String(clientId);
  const codeVerifierValue = String(codeVerifier);
  const accessToken = createChatGptConnectorOpaqueCredential("boxops_at");
  const accessTokenHash = hashChatGptConnectorCredential({
    kind: "access_token",
    value: accessToken,
  });
  const result = await exchangeChatGptConnectorOAuthCode({
    accessTokenHash,
    clientId: clientIdValue,
    codeChallenge: getChatGptConnectorPkceChallenge(codeVerifierValue),
    codeHash: hashChatGptConnectorCredential({
      kind: "authorization_code",
      value: codeValue,
    }),
    expiresAt: new Date(
      Date.now() + CHATGPT_CONNECTOR_ACCESS_TOKEN_MAX_TTL_SECONDS * 1000,
    ).toISOString(),
    redirectUri: redirectUriValue,
    requestId,
    resource,
  });

  if (result.ok !== true) {
    const error = typeof result.code === "string" ? result.code : "invalid_grant";
    const status = error === "access_denied" ? 403 : 400;

    return oauthError({
      description: "The authorization code could not be exchanged.",
      error,
      status,
    });
  }

  const expiresAt =
    typeof result.expires_at === "string"
      ? result.expires_at
      : new Date().toISOString();
  const scope = typeof result.scope === "string" ? result.scope : "";

  return NextResponse.json(
    {
      access_token: accessToken,
      expires_in: getSecondsUntil(expiresAt),
      scope,
      token_type: "Bearer",
    },
    {
      headers: NO_STORE_HEADERS,
    },
  );
}

export async function GET() {
  return oauthError({
    description: "Use POST for OAuth token exchange.",
    error: "invalid_request",
    status: 405,
  });
}
