import { NextResponse, type NextRequest } from "next/server";

import { getActiveMemberships, getAuthenticatedUser, resolveActiveOrganization } from "@/lib/auth/tenant";
import { getLoginPath } from "@/lib/auth/redirects";
import {
  CHATGPT_CONNECTOR_AUTH_CODE_TTL_SECONDS,
  CHATGPT_CONNECTOR_ACCESS_TOKEN_MAX_TTL_SECONDS,
  CHATGPT_CONNECTOR_MIN_LINKED_SESSION_SECONDS,
  createChatGptConnectorOpaqueCredential,
  encryptChatGptConnectorValue,
  getChatGptConnectorResourceIdentifier,
  hashChatGptConnectorCredential,
  normalizeChatGptConnectorOAuthScopes,
} from "@/lib/chatgpt-connector-auth";
import { createChatGptConnectorRequestId } from "@/lib/chatgpt-connector-core";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
} as const;

type InsertClient = {
  from(table: string): {
    insert(value: Record<string, unknown>): Promise<{
      error: { message?: string } | null;
    }>;
  };
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function getAllowedRedirectOrigins() {
  const configured = process.env.CHATGPT_CONNECTOR_ALLOWED_REDIRECT_ORIGINS
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (configured && configured.length > 0) {
    return configured;
  }

  return [
    "https://chatgpt.com",
    "https://chat.openai.com",
    ...(process.env.NODE_ENV === "production" ? [] : ["http://127.0.0.1:3000"]),
  ];
}

function isAllowedRedirectUri(value: string) {
  try {
    const url = new URL(value);
    const allowedOrigins = getAllowedRedirectOrigins();

    return allowedOrigins.includes(url.origin);
  } catch {
    return false;
  }
}

function isValidOAuthText(value: string | null, maxLength: number) {
  return Boolean(value && value.length <= maxLength);
}

function isValidPkceChallenge(value: string | null) {
  return Boolean(value && /^[A-Za-z0-9_-]{43,128}$/.test(value));
}

function redirectWithOAuthError(input: {
  description: string;
  error: string;
  redirectUri: string;
  state: string | null;
}) {
  const url = new URL(input.redirectUri);

  url.searchParams.set("error", input.error);
  url.searchParams.set("error_description", input.description);

  if (input.state) {
    url.searchParams.set("state", input.state);
  }

  return NextResponse.redirect(url, {
    headers: NO_STORE_HEADERS,
  });
}

function badOAuthRequest(message: string) {
  return NextResponse.json(
    {
      error: "invalid_request",
      error_description: message,
    },
    {
      headers: NO_STORE_HEADERS,
      status: 400,
    },
  );
}

function getAuthorizeQueryWith(
  request: NextRequest,
  values: Record<string, string>,
) {
  const url = request.nextUrl.clone();

  for (const [key, value] of Object.entries(values)) {
    url.searchParams.set(key, value);
  }

  return `${url.pathname}?${url.searchParams.toString()}`;
}

function renderConsentPage(input: {
  memberships: Awaited<ReturnType<typeof getActiveMemberships>>;
  request: NextRequest;
  scopes: string[];
}) {
  const membershipButtons = input.memberships
    .map((membership) => {
      const href = getAuthorizeQueryWith(input.request, {
        confirm: "1",
        organization_id: membership.organization_id,
      });

      return `<p><a href="${escapeHtml(href)}">${escapeHtml(membership.organization.name)}</a></p>`;
    })
    .join("");
  const scopeList = input.scopes
    .map((scope) => `<li>${escapeHtml(scope)}</li>`)
    .join("");

  return new Response(
    `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Conectar BoxOps</title>
    <style>
      body { font-family: system-ui, sans-serif; line-height: 1.5; margin: 2rem; max-width: 42rem; }
      a { display: inline-block; padding: .65rem .85rem; border: 1px solid #111827; border-radius: .35rem; color: #111827; text-decoration: none; }
      code { background: #f3f4f6; padding: .1rem .25rem; border-radius: .25rem; }
    </style>
  </head>
  <body>
    <h1>Conectar BoxOps con ChatGPT</h1>
    <p>Elige la organizacion que quieres usar para este conector.</p>
    <ul>${scopeList}</ul>
    ${membershipButtons}
  </body>
</html>`,
    {
      headers: {
        ...NO_STORE_HEADERS,
        "Content-Type": "text/html; charset=utf-8",
      },
    },
  );
}

function secondsUntil(value: Date) {
  return Math.floor((value.getTime() - Date.now()) / 1000);
}

export async function GET(request: NextRequest) {
  const requestId = createChatGptConnectorRequestId();
  const params = request.nextUrl.searchParams;
  const responseType = params.get("response_type");
  const clientId = params.get("client_id");
  const redirectUri = params.get("redirect_uri");
  const state = params.get("state");
  const codeChallenge = params.get("code_challenge");
  const codeChallengeMethod = params.get("code_challenge_method");
  const resource =
    params.get("resource") ??
    getChatGptConnectorResourceIdentifier(request.nextUrl.origin);
  const normalizedScopes = normalizeChatGptConnectorOAuthScopes(
    params.get("scope"),
  );

  if (
    responseType !== "code" ||
    !isValidOAuthText(clientId, 512) ||
    !redirectUri ||
    !isAllowedRedirectUri(redirectUri) ||
    !isValidOAuthText(state, 1024) ||
    !isValidPkceChallenge(codeChallenge) ||
    codeChallengeMethod !== "S256" ||
    resource !== getChatGptConnectorResourceIdentifier(request.nextUrl.origin)
  ) {
    return redirectUri && isAllowedRedirectUri(redirectUri)
      ? redirectWithOAuthError({
          description: "The authorization request is not valid.",
          error: "invalid_request",
          redirectUri,
          state,
        })
      : badOAuthRequest("The authorization request is not valid.");
  }

  if (!normalizedScopes.ok) {
    return redirectWithOAuthError({
      description: "The requested scope is not available for this connector.",
      error: "invalid_scope",
      redirectUri,
      state,
    });
  }

  const user = await getAuthenticatedUser();

  if (!user) {
    const loginPath = getLoginPath(
      `${request.nextUrl.pathname}?${request.nextUrl.searchParams.toString()}`,
    );

    return NextResponse.redirect(new URL(loginPath, request.nextUrl.origin), {
      headers: NO_STORE_HEADERS,
    });
  }

  const memberships = await getActiveMemberships(user.id);

  if (memberships.length === 0) {
    return redirectWithOAuthError({
      description: "The BoxOps user has no active operational membership.",
      error: "access_denied",
      redirectUri,
      state,
    });
  }

  if (params.get("confirm") !== "1") {
    return renderConsentPage({
      memberships,
      request,
      scopes: normalizedScopes.scopes,
    });
  }

  const organizationId = params.get("organization_id");
  const resolution = resolveActiveOrganization(memberships, organizationId);

  if (!resolution.ok) {
    return renderConsentPage({
      memberships,
      request,
      scopes: normalizedScopes.scopes,
    });
  }

  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token || !session.expires_at) {
    return redirectWithOAuthError({
      description: "Refresh your BoxOps session before connecting ChatGPT.",
      error: "temporarily_unavailable",
      redirectUri,
      state,
    });
  }

  if (!session.refresh_token) {
    return redirectWithOAuthError({
      description: "Refresh your BoxOps session before connecting ChatGPT.",
      error: "temporarily_unavailable",
      redirectUri,
      state,
    });
  }

  const supabaseExpiresAt = new Date(session.expires_at * 1000);
  const connectorExpiresAt = new Date(
    Math.min(
      Date.now() + CHATGPT_CONNECTOR_ACCESS_TOKEN_MAX_TTL_SECONDS * 1000,
      supabaseExpiresAt.getTime() - 30_000,
    ),
  );

  if (secondsUntil(connectorExpiresAt) < CHATGPT_CONNECTOR_MIN_LINKED_SESSION_SECONDS) {
    return redirectWithOAuthError({
      description: "Refresh your BoxOps session before connecting ChatGPT.",
      error: "temporarily_unavailable",
      redirectUri,
      state,
    });
  }

  let encryptedSupabaseAccessToken: string;
  let encryptedSupabaseRefreshToken: string;

  try {
    encryptedSupabaseAccessToken = encryptChatGptConnectorValue(
      session.access_token,
    );
    encryptedSupabaseRefreshToken = encryptChatGptConnectorValue(
      session.refresh_token,
    );
  } catch {
    return redirectWithOAuthError({
      description: "Connector credential encryption is not configured.",
      error: "server_error",
      redirectUri,
      state,
    });
  }

  const authorizationCode =
    createChatGptConnectorOpaqueCredential("boxops_code");
  const codeHash = hashChatGptConnectorCredential({
    kind: "authorization_code",
    value: authorizationCode,
  });
  const db = supabase as unknown as InsertClient;
  const insertResult = await db.from("chatgpt_connector_oauth_codes").insert({
    actor_user_id: user.id,
    client_id: clientId,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    code_hash: codeHash,
    encrypted_supabase_access_token: encryptedSupabaseAccessToken,
    encrypted_supabase_refresh_token: encryptedSupabaseRefreshToken,
    expires_at: new Date(
      Date.now() + CHATGPT_CONNECTOR_AUTH_CODE_TTL_SECONDS * 1000,
    ).toISOString(),
    membership_id: resolution.membership.id,
    metadata: {
      source: "chatgpt_connector",
    },
    organization_id: resolution.organization.id,
    redirect_uri: redirectUri,
    request_id: requestId,
    resource,
    scopes: normalizedScopes.scopes,
    supabase_access_token_expires_at: supabaseExpiresAt.toISOString(),
  });

  if (insertResult.error) {
    return redirectWithOAuthError({
      description: "BoxOps could not create an authorization code.",
      error: "server_error",
      redirectUri,
      state,
    });
  }

  const redirect = new URL(redirectUri);

  redirect.searchParams.set("code", authorizationCode);
  if (state) {
    redirect.searchParams.set("state", state);
  }

  return NextResponse.redirect(redirect, {
    headers: NO_STORE_HEADERS,
  });
}
