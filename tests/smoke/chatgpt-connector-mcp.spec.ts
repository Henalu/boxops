import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

function readProjectFile(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

const expectedTools = [
  "list_centers",
  "list_class_types",
  "get_schedule_for_day",
  "get_schedule_at_time",
  "get_my_schedule",
  "preview_schedule_template",
  "create_schedule_template_draft",
  "prepare_schedule_template_application",
  "apply_schedule_template",
];

test.describe("ChatGPT connector CG.4A MCP packaging", () => {
  test("publishes a no-store MCP route without app UI or public SQL access", () => {
    const route = readProjectFile("src/app/api/chatgpt/mcp/route.ts");

    expect(route).toContain('export const dynamic = "force-dynamic"');
    expect(route).toContain('export const runtime = "nodejs"');
    expect(route).toContain("handleChatGptConnectorMcpRequest");
    expect(route).toContain("getChatGptConnectorMcpDiscovery");
    expect(route).toContain("export async function GET");
    expect(route).toContain("export async function POST");
    expect(route).toContain("export async function OPTIONS");
    expect(route).toContain('"Cache-Control": "no-store"');
    expect(route).not.toMatch(/\.from\(|createClient\(|service_role|Storage/i);
  });

  test("exposes every hardened connector tool through tool metadata", () => {
    const source = readProjectFile("src/lib/chatgpt-connector-mcp.ts");

    for (const toolName of expectedTools) {
      expect(source).toContain(`name: "${toolName}"`);
    }

    expect(source).toContain("chatGptConnectorTools");
    expect(source).toContain("readOnlyHint: true");
    expect(source).toContain("readOnlyHint: false");
    expect(source).toContain("confirmation_token");
    expect(source).toContain("idempotency_key");
    expect(source).toContain("requested_scope");
  });

  test("requires authenticated BoxOps session before list or call", () => {
    const source = readProjectFile("src/lib/chatgpt-connector-mcp.ts");

    expect(source).toContain("getAuthenticatedUser");
    expect(source).toContain("requireAuthenticatedMcpSession");
    expect(source).toContain("Connect your BoxOps account before using this connector.");
    expect(source).toContain("WWW-Authenticate");
    expect(source).toContain("status: 401");
    expect(source).toMatch(/handleToolCall[\s\S]+requireAuthenticatedMcpSession/);
    expect(source).toMatch(/handleToolsList[\s\S]+requireAuthenticatedMcpSession/);
  });

  test("keeps MCP as transport and returns structured tool results", () => {
    const source = readProjectFile("src/lib/chatgpt-connector-mcp.ts");

    expect(source).toContain('case "initialize"');
    expect(source).toContain('case "tools/list"');
    expect(source).toContain('case "tools/call"');
    expect(source).toContain("structuredContent");
    expect(source).toContain("isError: !response.ok");
    expect(source).toContain("request_id");
    expect(source).toContain("warnings");
    expect(source).toContain('source: "chatgpt_connector"');
  });

  test("declares real OAuth account linking metadata in CG.4B", () => {
    const source = readProjectFile("src/lib/chatgpt-connector-mcp.ts");

    expect(source).toContain(
      'oauth_account_linking: "oauth2_authorization_code_pkce"',
    );
    expect(source).toContain("protected_resource_metadata");
    expect(source).toContain("revocation_endpoint");
    expect(source).toContain("token_type: \"opaque_bearer_scoped\"");
    expect(source).not.toMatch(/client_secret|refresh_token/i);
  });

  test("guardrails: no service role, Storage, or sensitive mutations in transport", () => {
    const source = readProjectFile("src/lib/chatgpt-connector-mcp.ts");
    const route = readProjectFile("src/app/api/chatgpt/mcp/route.ts");
    const combined = `${source}\n${route}`;

    expect(combined).not.toMatch(/service_role|SUPABASE_SERVICE_ROLE/i);
    expect(combined).not.toMatch(/\.storage\b|createSignedUrl|signedUrl|upload\(/i);
    expect(combined).not.toMatch(/\.from\(|\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
    expect(combined).not.toMatch(
      /document_versions|document_access|time_records|time_punches|payroll|profile_signatures|geolocation|latitude|longitude/i,
    );
  });
});
