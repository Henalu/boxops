import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  getChatGptConnectorPkceChallenge,
  hashChatGptConnectorCredential,
  normalizeChatGptConnectorOAuthScopes,
} from "../../src/lib/chatgpt-connector-auth";

function readProjectFile(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

function getTsFunctionSource(source: string, functionName: string) {
  const start = source.indexOf(`function ${functionName}`);

  if (start === -1) {
    return "";
  }

  const nextFunction = source.indexOf("\nfunction ", start + 1);
  const nextExport = source.indexOf("\nexport ", start + 1);
  const candidates = [nextFunction, nextExport].filter((value) => value > start);
  const end = candidates.length > 0 ? Math.min(...candidates) : undefined;

  return source.slice(start, end);
}

test.describe("ChatGPT connector CG.4B account linking", () => {
  test("publishes authorization server and protected resource metadata", () => {
    const auth = readProjectFile("src/lib/chatgpt-connector-auth.ts");
    const authorizationServerRoute = readProjectFile(
      "src/app/.well-known/oauth-authorization-server/route.ts",
    );
    const protectedResourceRoute = readProjectFile(
      "src/app/.well-known/oauth-protected-resource/route.ts",
    );

    expect(auth).toContain("getChatGptConnectorAuthorizationServerMetadata");
    expect(auth).toContain("authorization_endpoint");
    expect(auth).toContain("token_endpoint");
    expect(auth).toContain("revocation_endpoint");
    expect(auth).toContain('code_challenge_methods_supported: ["S256"]');
    expect(auth).toContain("getChatGptConnectorProtectedResourceMetadata");
    expect(auth).toContain("authorization_servers");
    expect(auth).toContain("bearer_methods_supported");
    expect(authorizationServerRoute).toContain(
      "getChatGptConnectorAuthorizationServerMetadata",
    );
    expect(protectedResourceRoute).toContain(
      "getChatGptConnectorProtectedResourceMetadata",
    );
  });

  test("normalizes scopes and PKCE without storing raw connector tokens", () => {
    const verifier =
      "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~";
    const challenge = getChatGptConnectorPkceChallenge(verifier);
    const tokenHash = hashChatGptConnectorCredential({
      kind: "access_token",
      value: "boxops_at_raw_test_value",
    });

    expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(
      normalizeChatGptConnectorOAuthScopes(
        "boxops.schedule.read boxops.templates.write",
      ),
    ).toEqual({
      ok: true,
      scopes: ["boxops.schedule.read", "boxops.templates.write"],
    });
    expect(normalizeChatGptConnectorOAuthScopes("boxops.bad")).toEqual({
      invalidScopes: ["boxops.bad"],
      ok: false,
    });
  });

  test("creates OAuth tables and RPCs for expiry, revocation and scoped validation", () => {
    const migration = readProjectFile(
      "supabase/migrations/20260630092854_chatgpt_connector_account_linking.sql",
    );

    expect(migration).toContain(
      "CREATE TABLE public.chatgpt_connector_oauth_codes",
    );
    expect(migration).toContain(
      "CREATE TABLE public.chatgpt_connector_access_tokens",
    );
    expect(migration).toContain("code_hash text NOT NULL UNIQUE");
    expect(migration).toContain("token_hash text NOT NULL UNIQUE");
    expect(migration).toContain("encrypted_supabase_access_token text NOT NULL");
    expect(migration).toContain("expires_at timestamptz NOT NULL");
    expect(migration).toContain("revoked_at timestamptz");
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.exchange_chatgpt_connector_oauth_code",
    );
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.validate_chatgpt_connector_access_token",
    );
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.revoke_chatgpt_connector_access_token",
    );
    expect(migration).toContain("target_required_scopes <@ target_token.scopes");
    expect(migration).toContain("target_token.revoked_at IS NOT NULL");
    expect(migration).toContain("target_token.expires_at <= now()");
    expect(migration).toContain("status = 'revoked'");
    expect(migration).not.toMatch(/service_role|SUPABASE_SERVICE_ROLE|\.storage\b/i);
  });

  test("rejects missing, invalid, expired, revoked and insufficient-scope tokens", () => {
    const mcp = readProjectFile("src/lib/chatgpt-connector-mcp.ts");
    const migration = readProjectFile(
      "supabase/migrations/20260630092854_chatgpt_connector_account_linking.sql",
    );

    expect(mcp).toContain("getBearerTokenFromAuthorizationHeader");
    expect(mcp).toContain("getAuthenticatedUser");
    expect(mcp).toContain("Authentication required");
    expect(mcp).toContain("resource_metadata");
    expect(mcp).toContain("invalid_token");
    expect(mcp).toContain("insufficient_scope");
    expect(mcp).toContain("status: validation.status");
    expect(migration).toContain("'token_not_found'");
    expect(migration).toContain("'token_not_active'");
    expect(migration).toContain("'scope_not_allowed'");
  });

  test("authorizes tools/list and tools/call through Bearer context without operational transport access", () => {
    const mcp = readProjectFile("src/lib/chatgpt-connector-mcp.ts");
    const tools = readProjectFile("src/lib/chatgpt-connector-tools.ts");
    const handleToolCallSource = getTsFunctionSource(mcp, "handleToolCall");
    const handleToolsListSource = getTsFunctionSource(mcp, "handleToolsList");

    expect(handleToolsListSource).toContain("requireAuthenticatedMcpSession");
    expect(handleToolsListSource).toContain("tools: chatGptConnectorMcpTools");
    expect(handleToolCallSource).toContain(
      "getChatGptConnectorToolRequiredScopes",
    );
    expect(handleToolCallSource).toContain("runWithChatGptConnectorBearerContext");
    expect(mcp).toContain("runWithChatGptConnectorBearerContext");
    expect(tools).toContain("getActiveChatGptConnectorBearerContext");
    expect(tools).toContain("createChatGptConnectorSupabaseClient");
    expect(tools).toContain("organization_memberships");
    expect(tools).toContain("organizations");
    expect(handleToolCallSource).not.toMatch(
      /\.from\(|\.insert\(|\.update\(|\.upsert\(|\.delete\(/,
    );
    expect(handleToolsListSource).not.toMatch(
      /\.from\(|\.insert\(|\.update\(|\.upsert\(|\.delete\(/,
    );
  });

  test("keeps connector runtime away from service-role, files and direct sensitive mutations", () => {
    const files = [
      "src/lib/chatgpt-connector-auth.ts",
      "src/lib/chatgpt-connector-mcp.ts",
      "src/app/api/chatgpt/mcp/route.ts",
      "src/app/api/chatgpt/oauth/authorize/route.ts",
      "src/app/api/chatgpt/oauth/token/route.ts",
      "src/app/api/chatgpt/oauth/revoke/route.ts",
    ];
    const combined = files.map(readProjectFile).join("\n");
    const mcp = readProjectFile("src/lib/chatgpt-connector-mcp.ts");

    expect(combined).not.toMatch(/service_role|SUPABASE_SERVICE_ROLE/i);
    expect(combined).not.toMatch(/\.storage\b|createSignedUrl|signedUrl|upload\(/i);
    expect(combined).not.toMatch(
      /time_records|time_punches|profile_signatures|geolocation|latitude|longitude/i,
    );
    expect(mcp).not.toMatch(/\.from\(|\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
  });
});
