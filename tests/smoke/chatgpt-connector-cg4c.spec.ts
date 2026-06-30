import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

function readProjectFile(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

test.describe("ChatGPT connector CG.4C refresh rotation", () => {
  test("publishes refresh_token as an OAuth grant without client secrets", () => {
    const auth = readProjectFile("src/lib/chatgpt-connector-auth.ts");
    const tokenRoute = readProjectFile(
      "src/app/api/chatgpt/oauth/token/route.ts",
    );

    expect(auth).toContain(
      'grant_types_supported: ["authorization_code", "refresh_token"]',
    );
    expect(auth).toContain("CHATGPT_CONNECTOR_REFRESH_TOKEN_TTL_SECONDS");
    expect(tokenRoute).toContain('grantType === "refresh_token"');
    expect(tokenRoute).toContain("refresh_token_expires_in");
    expect(tokenRoute).toContain("createChatGptConnectorOpaqueCredential(\"boxops_rt\")");
    expect(`${auth}\n${tokenRoute}`).not.toMatch(/client_secret/i);
  });

  test("adds hashed refresh token storage and rotation RPCs", () => {
    const migration = readProjectFile(
      "supabase/migrations/20260630113015_chatgpt_connector_refresh_tokens.sql",
    );

    expect(migration).toContain(
      "CREATE TABLE public.chatgpt_connector_refresh_tokens",
    );
    expect(migration).toContain("token_hash text NOT NULL UNIQUE");
    expect(migration).toContain("encrypted_supabase_refresh_token text NOT NULL");
    expect(migration).toContain("status IN ('active', 'revoked', 'rotated', 'expired')");
    expect(migration).toContain("ADD COLUMN refresh_token_id uuid");
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.prepare_chatgpt_connector_refresh_token",
    );
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.rotate_chatgpt_connector_refresh_token",
    );
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.revoke_chatgpt_connector_oauth_token",
    );
    expect(migration).toContain("target_new_refresh_token_hash");
    expect(migration).toContain("status = 'rotated'");
    expect(migration).toContain("replaced_by_refresh_token_id");
    expect(migration).not.toMatch(/service_role|SUPABASE_SERVICE_ROLE|\.storage\b/i);
  });

  test("token endpoint refreshes Supabase user session and rotates connector tokens", () => {
    const auth = readProjectFile("src/lib/chatgpt-connector-auth.ts");
    const tokenRoute = readProjectFile(
      "src/app/api/chatgpt/oauth/token/route.ts",
    );

    expect(auth).toContain("refreshChatGptConnectorSupabaseSession");
    expect(auth).toContain("supabase.auth.refreshSession");
    expect(auth).toContain('kind: "refresh_token"');
    expect(auth).toContain("prepareChatGptConnectorRefreshToken");
    expect(auth).toContain("rotateChatGptConnectorRefreshToken");
    expect(tokenRoute).toContain("handleRefreshTokenGrant");
    expect(tokenRoute).toContain("prepareChatGptConnectorRefreshToken");
    expect(tokenRoute).toContain("refreshChatGptConnectorSupabaseSession");
    expect(tokenRoute).toContain("rotateChatGptConnectorRefreshToken");
    expect(tokenRoute).toContain("encryptedSupabaseAccessToken");
    expect(tokenRoute).toContain("encryptedRotatedSupabaseRefreshToken");
  });

  test("authorize stores encrypted refresh material and revoke handles access or refresh token input", () => {
    const authorizeRoute = readProjectFile(
      "src/app/api/chatgpt/oauth/authorize/route.ts",
    );
    const auth = readProjectFile("src/lib/chatgpt-connector-auth.ts");
    const revokeRoute = readProjectFile(
      "src/app/api/chatgpt/oauth/revoke/route.ts",
    );

    expect(authorizeRoute).toContain("session.refresh_token");
    expect(authorizeRoute).toContain("encryptedSupabaseRefreshToken");
    expect(authorizeRoute).toContain("encrypted_supabase_refresh_token");
    expect(auth).toContain("revoke_chatgpt_connector_oauth_token");
    expect(auth).toContain('kind: "access_token"');
    expect(auth).toContain('kind: "refresh_token"');
    expect(revokeRoute).toContain("revokeChatGptConnectorBearerToken");
  });

  test("keeps refresh implementation away from direct operational access and sensitive surfaces", () => {
    const files = [
      "src/lib/chatgpt-connector-auth.ts",
      "src/app/api/chatgpt/oauth/authorize/route.ts",
      "src/app/api/chatgpt/oauth/token/route.ts",
      "src/app/api/chatgpt/oauth/revoke/route.ts",
      "supabase/migrations/20260630113015_chatgpt_connector_refresh_tokens.sql",
    ];
    const combined = files.map(readProjectFile).join("\n");

    expect(combined).not.toMatch(/service_role|SUPABASE_SERVICE_ROLE/i);
    expect(combined).not.toMatch(/\.storage\b|createSignedUrl|signedUrl|upload\(/i);
    expect(combined).not.toMatch(
      /time_records|time_punches|payroll|profile_signatures|geolocation|latitude|longitude/i,
    );
  });
});
