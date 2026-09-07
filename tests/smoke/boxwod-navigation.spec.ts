import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  buildBoxWodProgrammingUrl,
  normalizeBoxWodAppUrl,
  resolveBoxWodActionMode,
} from "../../src/lib/boxwod-navigation";
import {
  getSupabaseAuthCookieOptions,
  normalizeHubAuthCookieDomain,
} from "../../src/lib/supabase/auth-cookie-options";

function readProjectFile(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

test.describe("BoxWod programming navigation", () => {
  test("builds the configured programming URL with only shared context", () => {
    const href = buildBoxWodProgrammingUrl({
      appUrl: "https://wod.example.com/base?token=must-not-survive",
      centerId: "center-123",
      classTypeId: "class-type-456",
      date: "2026-07-22",
      organizationId: "org-789",
    });

    expect(href).toBe(
      "https://wod.example.com/programacion?org=org-789&date=2026-07-22&center=center-123&classType=class-type-456",
    );

    const url = new URL(href!);

    expect([...url.searchParams.keys()]).toEqual([
      "org",
      "date",
      "center",
      "classType",
    ]);
    expect(url.searchParams.has("token")).toBe(false);
  });

  test("omits unavailable optional context and rejects unsafe base URLs", () => {
    expect(
      buildBoxWodProgrammingUrl({
        appUrl: "wod.example.com",
        date: "2026-07-22",
        organizationId: "org-789",
      }),
    ).toBe(
      "https://wod.example.com/programacion?org=org-789&date=2026-07-22",
    );
    expect(normalizeBoxWodAppUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeBoxWodAppUrl("https://user:password@wod.example.com")).toBeNull();
  });

  test("uses a safe unavailable state when BoxWod is not configured", () => {
    expect(
      resolveBoxWodActionMode({
        canProgram: true,
        hasConfiguredAppUrl: false,
        nodeEnv: "development",
      }),
    ).toBe("disabled");
    expect(
      resolveBoxWodActionMode({
        canProgram: true,
        hasConfiguredAppUrl: false,
        nodeEnv: "production",
      }),
    ).toBe("hidden");
    expect(
      resolveBoxWodActionMode({
        canProgram: false,
        hasConfiguredAppUrl: true,
        nodeEnv: "development",
      }),
    ).toBe("hidden");
  });

  test("keeps permission validation on the server and one contextual action", () => {
    const schedulePage = readProjectFile("src/app/(app)/app/schedule/page.tsx");
    const schedulePanel = readProjectFile(
      "src/app/(app)/app/schedule/schedule-block-detail-panels.tsx",
    );
    const permissionHelper = readProjectFile("src/lib/boxwod-permissions.ts");
    const migration = readProjectFile(
      "supabase/migrations/20260629101000_initial_boxwod_product_schema.sql",
    );

    expect(permissionHelper).toContain('supabase.rpc("boxwod_can_program"');
    expect(permissionHelper).toContain("target_organization_id");
    expect(schedulePage).toContain("canProgramBoxWod");
    expect(schedulePage).toContain("buildBoxWodProgrammingUrl");
    expect(schedulePanel).toContain("Gestionar WOD");
    expect(schedulePanel.match(/<BoxWodProgrammingAction\b/g)).toHaveLength(1);
    expect(schedulePanel).toContain('data-boxwod-programming-action="enabled"');
    expect(schedulePanel).toContain('target="_blank"');
    expect(schedulePanel).toContain('rel="noopener noreferrer"');
    expect(migration).toMatch(
      /boxwod_can_program[\s\S]+ARRAY\['owner', 'admin', 'manager', 'center_manager', 'coach'\]/,
    );
  });
});

test.describe("BoxOps and BoxWod shared session", () => {
  test("configures the same Supabase cookie scope in browser, server and proxy clients", () => {
    const browserClient = readProjectFile("src/lib/supabase/client.ts");
    const serverClient = readProjectFile("src/lib/supabase/server.ts");
    const proxyClient = readProjectFile("src/lib/supabase/proxy.ts");

    for (const source of [browserClient, serverClient, proxyClient]) {
      expect(source).toContain("getSupabaseAuthCookieOptions");
      expect(source).toContain("cookieOptions:");
    }

    expect(normalizeHubAuthCookieDomain(".hub.example.test")).toBe(
      "hub.example.test",
    );
    expect(normalizeHubAuthCookieDomain("localhost")).toBeNull();
    expect(normalizeHubAuthCookieDomain("https://example.test/path")).toBeNull();
    expect(
      getSupabaseAuthCookieOptions({
        cookieDomain: "hub.example.test",
        nodeEnv: "production",
      }),
    ).toEqual({
      domain: "hub.example.test",
      path: "/",
      sameSite: "lax",
      secure: true,
    });
    expect(
      getSupabaseAuthCookieOptions({
        cookieDomain: null,
        nodeEnv: "development",
      }),
    ).toEqual({
      path: "/",
      sameSite: "lax",
      secure: false,
    });
  });

  test("passes a synthetic shared session to both trusted subdomains only", async ({
    context,
  }) => {
    const cookieOptions = getSupabaseAuthCookieOptions({
      cookieDomain: "hub.example.test",
      nodeEnv: "production",
    });

    await context.addCookies([
      {
        domain: cookieOptions.domain!,
        httpOnly: false,
        name: "sb-shared-auth-token",
        path: cookieOptions.path!,
        sameSite: "Lax",
        secure: cookieOptions.secure,
        value: "synthetic-session-without-real-credentials",
      },
    ]);

    const boxOpsCookies = await context.cookies([
      "https://ops.hub.example.test/app/schedule",
    ]);
    const boxWodCookies = await context.cookies([
      "https://wod.hub.example.test/programacion",
    ]);
    const unrelatedCookies = await context.cookies([
      "https://outside.example.test/programacion",
    ]);

    expect(boxOpsCookies.map((cookie) => cookie.name)).toContain(
      "sb-shared-auth-token",
    );
    expect(boxWodCookies.map((cookie) => cookie.name)).toContain(
      "sb-shared-auth-token",
    );
    expect(unrelatedCookies.map((cookie) => cookie.name)).not.toContain(
      "sb-shared-auth-token",
    );
  });
});
