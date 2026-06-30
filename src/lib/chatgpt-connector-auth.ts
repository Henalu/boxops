import { AsyncLocalStorage } from "node:async_hooks";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { getSupabasePublicEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/supabase";

export const CHATGPT_CONNECTOR_AUTH_CODE_TTL_SECONDS = 10 * 60;
export const CHATGPT_CONNECTOR_ACCESS_TOKEN_MAX_TTL_SECONDS = 45 * 60;
export const CHATGPT_CONNECTOR_MIN_LINKED_SESSION_SECONDS = 5 * 60;

export const CHATGPT_CONNECTOR_OAUTH_SCOPES = [
  "boxops.schedule.read",
  "boxops.templates.write",
  "boxops.templates.apply",
] as const;

export type ChatGptConnectorOAuthScope =
  (typeof CHATGPT_CONNECTOR_OAUTH_SCOPES)[number];

export type ChatGptConnectorBearerContext = {
  accessTokenId: string;
  expiresAt: string;
  membershipId: string;
  organizationId: string;
  organizationTimezone: string;
  role: string;
  scopes: ChatGptConnectorOAuthScope[];
  supabaseAccessToken: string;
  supabaseAccessTokenExpiresAt: string;
  userId: string;
};

type JsonRecord = Record<string, unknown>;

type RpcClient = {
  rpc<T>(
    fn: string,
    args?: Record<string, unknown>,
  ): Promise<{
    data: T | null;
    error: { message?: string } | null;
  }>;
};

const BEARER_CONTEXT_STORAGE =
  new AsyncLocalStorage<ChatGptConnectorBearerContext>();

const TOOL_REQUIRED_SCOPES = {
  apply_schedule_template: ["boxops.templates.apply"],
  create_schedule_template_draft: ["boxops.templates.write"],
  get_my_schedule: ["boxops.schedule.read"],
  get_schedule_at_time: ["boxops.schedule.read"],
  get_schedule_for_day: ["boxops.schedule.read"],
  list_centers: ["boxops.schedule.read"],
  list_class_types: ["boxops.schedule.read"],
  prepare_schedule_template_application: ["boxops.templates.write"],
  preview_schedule_template: ["boxops.templates.write"],
} as const satisfies Record<string, readonly ChatGptConnectorOAuthScope[]>;

function base64UrlEncode(value: Buffer) {
  return value.toString("base64url");
}

function getConnectorCredentialSecretKey() {
  const secret = process.env.CHATGPT_CONNECTOR_CREDENTIAL_SECRET?.trim();

  if (!secret || secret.length < 32) {
    throw new Error(
      "CHATGPT_CONNECTOR_CREDENTIAL_SECRET must be set to a high-entropy value of at least 32 characters.",
    );
  }

  return createHash("sha256")
    .update(`boxops-chatgpt-connector:${secret}`, "utf8")
    .digest();
}

function assertJsonRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function getString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function getScopeArray(scope: string | null) {
  return (scope ?? "")
    .split(/\s+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

export function getChatGptConnectorResourceIdentifier(origin: string) {
  return new URL(origin).origin;
}

export function getChatGptConnectorAuthorizationServerMetadata(origin: string) {
  const issuer = getChatGptConnectorResourceIdentifier(origin);

  return {
    authorization_endpoint: new URL(
      "/api/chatgpt/oauth/authorize",
      issuer,
    ).toString(),
    code_challenge_methods_supported: ["S256"],
    grant_types_supported: ["authorization_code"],
    issuer,
    response_types_supported: ["code"],
    revocation_endpoint: new URL(
      "/api/chatgpt/oauth/revoke",
      issuer,
    ).toString(),
    scopes_supported: [...CHATGPT_CONNECTOR_OAUTH_SCOPES],
    token_endpoint: new URL("/api/chatgpt/oauth/token", issuer).toString(),
    token_endpoint_auth_methods_supported: ["none"],
  };
}

export function getChatGptConnectorProtectedResourceMetadata(origin: string) {
  const resource = getChatGptConnectorResourceIdentifier(origin);

  return {
    authorization_servers: [resource],
    bearer_methods_supported: ["header"],
    resource,
    scopes_supported: [...CHATGPT_CONNECTOR_OAUTH_SCOPES],
  };
}

export function getChatGptConnectorToolRequiredScopes(toolName: string) {
  const key = toolName as keyof typeof TOOL_REQUIRED_SCOPES;

  return [...(TOOL_REQUIRED_SCOPES[key] ?? [])];
}

export function normalizeChatGptConnectorOAuthScopes(scope: string | null) {
  const requestedScopes = getScopeArray(scope);
  const fallbackScopes =
    requestedScopes.length === 0
      ? (["boxops.schedule.read"] satisfies ChatGptConnectorOAuthScope[])
      : requestedScopes;
  const uniqueScopes = [...new Set(fallbackScopes)];
  const invalidScopes = uniqueScopes.filter(
    (candidate) =>
      !CHATGPT_CONNECTOR_OAUTH_SCOPES.includes(
        candidate as ChatGptConnectorOAuthScope,
      ),
  );

  return invalidScopes.length > 0
    ? {
        invalidScopes,
        ok: false as const,
      }
    : {
        ok: true as const,
        scopes: uniqueScopes as ChatGptConnectorOAuthScope[],
      };
}

export function createChatGptConnectorOpaqueCredential(prefix: string) {
  return `${prefix}_${base64UrlEncode(randomBytes(32))}`;
}

export function hashChatGptConnectorCredential({
  kind,
  value,
}: {
  kind: "access_token" | "authorization_code";
  value: string;
}) {
  return createHash("sha256")
    .update(`boxops:chatgpt_connector:${kind}:${value}`, "utf8")
    .digest("hex");
}

export function getChatGptConnectorPkceChallenge(codeVerifier: string) {
  return base64UrlEncode(createHash("sha256").update(codeVerifier).digest());
}

export function encryptChatGptConnectorValue(value: string) {
  const key = getConnectorCredentialSecretKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    "enc_v1",
    base64UrlEncode(iv),
    base64UrlEncode(tag),
    base64UrlEncode(ciphertext),
  ].join(".");
}

export function decryptChatGptConnectorValue(value: string) {
  const [version, ivValue, tagValue, ciphertextValue] = value.split(".");

  if (version !== "enc_v1" || !ivValue || !tagValue || !ciphertextValue) {
    throw new Error("Invalid encrypted connector value.");
  }

  const key = getConnectorCredentialSecretKey();
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivValue, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function getBearerTokenFromAuthorizationHeader(value: string | null) {
  const match = value?.match(/^Bearer\s+(.+)$/i);

  return match?.[1]?.trim() || null;
}

export function createChatGptConnectorSupabaseClient(accessToken: string) {
  const { supabaseAnonKey, supabaseUrl } = getSupabasePublicEnv();

  return createSupabaseClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

export function runWithChatGptConnectorBearerContext<T>(
  context: ChatGptConnectorBearerContext,
  callback: () => T,
) {
  return BEARER_CONTEXT_STORAGE.run(context, callback);
}

export function getActiveChatGptConnectorBearerContext() {
  return BEARER_CONTEXT_STORAGE.getStore() ?? null;
}

export async function exchangeChatGptConnectorOAuthCode(input: {
  accessTokenHash: string;
  clientId: string;
  codeChallenge: string;
  codeHash: string;
  expiresAt: string;
  redirectUri: string;
  requestId: string;
  resource: string;
}) {
  const supabase = (await createClient()) as unknown as RpcClient;
  const { data, error } = await supabase.rpc<JsonRecord>(
    "exchange_chatgpt_connector_oauth_code",
    {
      target_access_token_hash: input.accessTokenHash,
      target_client_id: input.clientId,
      target_code_challenge: input.codeChallenge,
      target_code_hash: input.codeHash,
      target_expires_at: input.expiresAt,
      target_redirect_uri: input.redirectUri,
      target_request_id: input.requestId,
      target_resource: input.resource,
    },
  );

  if (error) {
    return {
      ok: false as const,
      reason: "rpc_error",
    };
  }

  return assertJsonRecord(data);
}

export async function validateChatGptConnectorBearerToken(input: {
  requiredScopes: string[];
  resource: string;
  token: string;
}) {
  const supabase = (await createClient()) as unknown as RpcClient;
  const tokenHash = hashChatGptConnectorCredential({
    kind: "access_token",
    value: input.token,
  });
  const { data, error } = await supabase.rpc<JsonRecord>(
    "validate_chatgpt_connector_access_token",
    {
      target_required_scopes: input.requiredScopes,
      target_resource: input.resource,
      target_token_hash: tokenHash,
    },
  );

  if (error) {
    return {
      ok: false as const,
      reason: "rpc_error",
      status: 500,
    };
  }

  const result = assertJsonRecord(data);

  if (result.ok !== true) {
    return {
      code: getString(result.code) ?? "invalid_token",
      ok: false as const,
      reason: getString(result.reason) ?? "invalid_token",
      scope: getString(result.scope),
      status: result.code === "insufficient_scope" ? 403 : 401,
    };
  }

  const encryptedSupabaseAccessToken = getString(
    result.encrypted_supabase_access_token,
  );
  const supabaseAccessTokenExpiresAt = getString(
    result.supabase_access_token_expires_at,
  );
  const accessTokenId = getString(result.access_token_id);
  const userId = getString(result.actor_user_id);
  const organizationId = getString(result.organization_id);
  const membershipId = getString(result.membership_id);
  const role = getString(result.role);
  const organizationTimezone = getString(result.organization_timezone);
  const expiresAt = getString(result.expires_at);
  const scopes = normalizeChatGptConnectorOAuthScopes(getString(result.scope));

  if (
    !encryptedSupabaseAccessToken ||
    !supabaseAccessTokenExpiresAt ||
    !accessTokenId ||
    !userId ||
    !organizationId ||
    !membershipId ||
    !role ||
    !organizationTimezone ||
    !expiresAt ||
    !scopes.ok
  ) {
    return {
      ok: false as const,
      reason: "invalid_token_context",
      status: 401,
    };
  }

  let supabaseAccessToken: string;

  try {
    supabaseAccessToken = decryptChatGptConnectorValue(
      encryptedSupabaseAccessToken,
    );
  } catch {
    return {
      ok: false as const,
      reason: "credential_decrypt_failed",
      status: 401,
    };
  }

  return {
    context: {
      accessTokenId,
      expiresAt,
      membershipId,
      organizationId,
      organizationTimezone,
      role,
      scopes: scopes.scopes,
      supabaseAccessToken,
      supabaseAccessTokenExpiresAt,
      userId,
    } satisfies ChatGptConnectorBearerContext,
    ok: true as const,
  };
}

export async function revokeChatGptConnectorBearerToken(token: string) {
  const supabase = (await createClient()) as unknown as RpcClient;
  const tokenHash = hashChatGptConnectorCredential({
    kind: "access_token",
    value: token,
  });

  await supabase.rpc<JsonRecord>("revoke_chatgpt_connector_access_token", {
    target_token_hash: tokenHash,
  });
}
