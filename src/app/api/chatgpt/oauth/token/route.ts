import { NextResponse, type NextRequest } from "next/server";

import {
  CHATGPT_CONNECTOR_ACCESS_TOKEN_MAX_TTL_SECONDS,
  CHATGPT_CONNECTOR_REFRESH_TOKEN_TTL_SECONDS,
  createChatGptConnectorOpaqueCredential,
  encryptChatGptConnectorValue,
  exchangeChatGptConnectorOAuthCode,
  getChatGptConnectorPkceChallenge,
  getChatGptConnectorResourceIdentifier,
  hashChatGptConnectorCredential,
  prepareChatGptConnectorRefreshToken,
  refreshChatGptConnectorSupabaseSession,
  rotateChatGptConnectorRefreshToken,
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

function createAccessTokenExpiry() {
  return new Date(
    Date.now() + CHATGPT_CONNECTOR_ACCESS_TOKEN_MAX_TTL_SECONDS * 1000,
  ).toISOString();
}

function createRefreshTokenExpiry() {
  return new Date(
    Date.now() + CHATGPT_CONNECTOR_REFRESH_TOKEN_TTL_SECONDS * 1000,
  ).toISOString();
}

function tokenResponse(input: {
  accessToken: string;
  expiresAt: string;
  refreshExpiresAt: string;
  refreshToken: string;
  scope: string;
}) {
  return NextResponse.json(
    {
      access_token: input.accessToken,
      expires_in: getSecondsUntil(input.expiresAt),
      refresh_token: input.refreshToken,
      refresh_token_expires_in: getSecondsUntil(input.refreshExpiresAt),
      scope: input.scope,
      token_type: "Bearer",
    },
    {
      headers: NO_STORE_HEADERS,
    },
  );
}

async function handleAuthorizationCodeGrant(input: {
  formData: FormData;
  request: NextRequest;
  requestId: string;
}) {
  const formData = input.formData;
  const code = formData.get("code");
  const redirectUri = formData.get("redirect_uri");
  const clientId = formData.get("client_id");
  const codeVerifier = formData.get("code_verifier");
  const resource =
    typeof formData.get("resource") === "string"
      ? String(formData.get("resource"))
      : getChatGptConnectorResourceIdentifier(input.request.nextUrl.origin);

  if (
    !isValidText(typeof code === "string" ? code : null, 256) ||
    !isValidText(typeof redirectUri === "string" ? redirectUri : null, 2048) ||
    !isValidText(typeof clientId === "string" ? clientId : null, 512) ||
    !isValidCodeVerifier(
      typeof codeVerifier === "string" ? codeVerifier : null,
    ) ||
    resource !== getChatGptConnectorResourceIdentifier(input.request.nextUrl.origin)
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
  const refreshToken = createChatGptConnectorOpaqueCredential("boxops_rt");
  const refreshExpiresAt = createRefreshTokenExpiry();
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
    expiresAt: createAccessTokenExpiry(),
    refreshExpiresAt,
    refreshTokenHash: hashChatGptConnectorCredential({
      kind: "refresh_token",
      value: refreshToken,
    }),
    redirectUri: redirectUriValue,
    requestId: input.requestId,
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
  const effectiveRefreshExpiresAt =
    typeof result.refresh_expires_at === "string"
      ? result.refresh_expires_at
      : refreshExpiresAt;

  return tokenResponse({
    accessToken,
    expiresAt,
    refreshExpiresAt: effectiveRefreshExpiresAt,
    refreshToken,
    scope,
  });
}

async function handleRefreshTokenGrant(input: {
  formData: FormData;
  request: NextRequest;
  requestId: string;
}) {
  const formData = input.formData;
  const refreshToken = formData.get("refresh_token");
  const clientId = formData.get("client_id");
  const resource =
    typeof formData.get("resource") === "string"
      ? String(formData.get("resource"))
      : getChatGptConnectorResourceIdentifier(input.request.nextUrl.origin);

  if (
    !isValidText(typeof refreshToken === "string" ? refreshToken : null, 256) ||
    !isValidText(typeof clientId === "string" ? clientId : null, 512) ||
    resource !== getChatGptConnectorResourceIdentifier(input.request.nextUrl.origin)
  ) {
    return oauthError({
      description: "The refresh token request is not valid.",
      error: "invalid_request",
    });
  }

  const refreshTokenValue = String(refreshToken);
  const clientIdValue = String(clientId);
  const preparedRefresh = await prepareChatGptConnectorRefreshToken({
    clientId: clientIdValue,
    refreshToken: refreshTokenValue,
    resource,
  });

  if (preparedRefresh.ok !== true) {
    const error =
      typeof preparedRefresh.code === "string"
        ? preparedRefresh.code
        : "invalid_grant";
    const status = error === "access_denied" ? 403 : 400;

    return oauthError({
      description: "The refresh token could not be used.",
      error,
      status,
    });
  }

  const encryptedSupabaseRefreshToken =
    typeof preparedRefresh.encrypted_supabase_refresh_token === "string"
      ? preparedRefresh.encrypted_supabase_refresh_token
      : "";
  const refreshedSupabaseSession =
    await refreshChatGptConnectorSupabaseSession(
      encryptedSupabaseRefreshToken,
    );

  if (!refreshedSupabaseSession.ok) {
    return oauthError({
      description: "The refresh token could not be used.",
      error: "invalid_grant",
    });
  }

  const accessToken = createChatGptConnectorOpaqueCredential("boxops_at");
  const rotatedRefreshToken =
    createChatGptConnectorOpaqueCredential("boxops_rt");
  const refreshExpiresAt = createRefreshTokenExpiry();
  let encryptedSupabaseAccessToken: string;
  let encryptedRotatedSupabaseRefreshToken: string;

  try {
    encryptedSupabaseAccessToken = encryptChatGptConnectorValue(
      refreshedSupabaseSession.accessToken,
    );
    encryptedRotatedSupabaseRefreshToken = encryptChatGptConnectorValue(
      refreshedSupabaseSession.refreshToken,
    );
  } catch {
    return oauthError({
      description: "Connector credential encryption is not configured.",
      error: "server_error",
      status: 500,
    });
  }

  const rotated = await rotateChatGptConnectorRefreshToken({
    accessTokenHash: hashChatGptConnectorCredential({
      kind: "access_token",
      value: accessToken,
    }),
    encryptedSupabaseAccessToken,
    encryptedSupabaseRefreshToken: encryptedRotatedSupabaseRefreshToken,
    expiresAt: createAccessTokenExpiry(),
    refreshExpiresAt,
    refreshToken: refreshTokenValue,
    requestId: input.requestId,
    rotatedRefreshTokenHash: hashChatGptConnectorCredential({
      kind: "refresh_token",
      value: rotatedRefreshToken,
    }),
    supabaseAccessTokenExpiresAt: refreshedSupabaseSession.expiresAt,
  });

  if (rotated.ok !== true) {
    const error =
      typeof rotated.code === "string" ? rotated.code : "invalid_grant";
    const status = error === "access_denied" ? 403 : 400;

    return oauthError({
      description: "The refresh token could not be rotated.",
      error,
      status,
    });
  }

  const expiresAt =
    typeof rotated.expires_at === "string"
      ? rotated.expires_at
      : new Date().toISOString();
  const scope = typeof rotated.scope === "string" ? rotated.scope : "";
  const effectiveRefreshExpiresAt =
    typeof rotated.refresh_expires_at === "string"
      ? rotated.refresh_expires_at
      : refreshExpiresAt;

  return tokenResponse({
    accessToken,
    expiresAt,
    refreshExpiresAt: effectiveRefreshExpiresAt,
    refreshToken: rotatedRefreshToken,
    scope,
  });
}

export async function POST(request: NextRequest) {
  const requestId = createChatGptConnectorRequestId();
  const formData = await request.formData();
  const grantType = formData.get("grant_type");

  if (grantType === "authorization_code") {
    return handleAuthorizationCodeGrant({
      formData,
      request,
      requestId,
    });
  }

  if (grantType === "refresh_token") {
    return handleRefreshTokenGrant({
      formData,
      request,
      requestId,
    });
  }

  return oauthError({
    description: "The token request is not valid.",
    error: "unsupported_grant_type",
  });
}

export async function GET() {
  return oauthError({
    description: "Use POST for OAuth token exchange.",
    error: "invalid_request",
    status: 405,
  });
}
