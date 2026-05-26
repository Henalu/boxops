import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

import {
  adminCredentials,
  coachCredentials,
  hasCredentials,
  organizationId,
  ownerCredentials,
  supabaseAnonKey,
  supabaseUrl,
  type SmokeCredentials,
} from "./helpers/env";
import type { Database, Json } from "../../src/types/supabase";

const runtimeOrganizationPrefix =
  "e2e-direct-grants-organizations-smoke";
const localDbContainer = "supabase_db_boxops";

type OrganizationError = {
  code?: string;
  details?: string | null;
  hint?: string | null;
  message?: string;
};

type OrganizationSnapshot = {
  id: string;
  name: string;
  slug: string;
  status: string;
  themeConfig: Json;
  timeTrackingConfig: Json;
  timezone: string;
  updatedAt: string;
};

type JsonObject = { [key: string]: Json | undefined };

const tenantSettingsCredentials = hasCredentials(ownerCredentials)
  ? ownerCredentials
  : adminCredentials;

const hasRuntimeConfig = Boolean(
  supabaseUrl &&
    supabaseAnonKey &&
    organizationId &&
    hasCredentials(tenantSettingsCredentials) &&
    hasCredentials(coachCredentials),
);

function getErrorText(error: OrganizationError | null) {
  if (!error) {
    return "";
  }

  return [error.code, error.message, error.details, error.hint]
    .filter(Boolean)
    .join(" ");
}

function expectNoOrganizationPermissionDenied(
  error: OrganizationError | null,
  context: string,
) {
  expect(getErrorText(error), context).not.toMatch(
    /permission denied for table organizations/i,
  );
}

function getRuntimeStamp() {
  return new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
}

function getSyntheticMarker(purpose: string) {
  return `${runtimeOrganizationPrefix}-${purpose}-${getRuntimeStamp()}-${randomUUID().slice(0, 8)}`;
}

async function createRuntimeClient(credentials: SmokeCredentials) {
  const client = createClient<Database>(supabaseUrl!, supabaseAnonKey!, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { error } = await client.auth.signInWithPassword(credentials);

  expect(error).toBeNull();
  await new Promise((resolve) => setTimeout(resolve, 1100));

  return client;
}

function toSqlUuid(value: string) {
  const normalizedValue = value.trim();

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      normalizedValue,
    )
  ) {
    throw new Error("Expected a UUID.");
  }

  return normalizedValue;
}

function toSqlText(value: string) {
  return value.replace(/'/g, "''");
}

function readPsqlValue(sql: string) {
  try {
    return execFileSync(
      "docker",
      [
        "exec",
        localDbContainer,
        "psql",
        "-U",
        "postgres",
        "-d",
        "postgres",
        "-At",
        "-c",
        sql,
      ],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    ).trim();
  } catch {
    return "";
  }
}

function execPsql(sql: string) {
  execFileSync(
    "docker",
    [
      "exec",
      localDbContainer,
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      sql,
    ],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
}

function getOrganizationSnapshotSelect() {
  return `
    jsonb_build_object(
      'id', id,
      'name', name,
      'slug', slug,
      'status', status,
      'themeConfig', theme_config,
      'timeTrackingConfig', time_tracking_config,
      'timezone', timezone,
      'updatedAt', updated_at
    )::text
  `;
}

function readOrganizationSnapshot(sql: string): OrganizationSnapshot | null {
  const output = readPsqlValue(sql);

  if (!output) {
    return null;
  }

  return JSON.parse(output) as OrganizationSnapshot;
}

function getOrganizationSnapshotById(targetOrganizationId: string) {
  return readOrganizationSnapshot(`
    select ${getOrganizationSnapshotSelect()}
    from public.organizations
    where id = '${toSqlUuid(targetOrganizationId)}'::uuid
    limit 1;
  `);
}

function getForeignOrganizationSnapshotNotManagedByUser(userId: string) {
  return readOrganizationSnapshot(`
    select ${getOrganizationSnapshotSelect()}
    from public.organizations organization
    where organization.id <> '${toSqlUuid(organizationId!)}'::uuid
      and not exists (
        select 1
        from public.organization_memberships membership
        where membership.organization_id = organization.id
          and membership.user_id = '${toSqlUuid(userId)}'::uuid
          and membership.status = 'active'
          and membership.role in ('owner', 'admin')
      )
    order by
      case organization.status when 'active' then 1 when 'trialing' then 2 else 3 end,
      organization.created_at
    limit 1;
  `);
}

function asJsonObject(value: Json): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...value }
    : {};
}

function buildSmokeThemeConfig(currentThemeConfig: Json, marker: string): Json {
  return {
    ...asJsonObject(currentThemeConfig),
    directGrantsOrganizationsSmoke: {
      marker,
      source: runtimeOrganizationPrefix,
    },
  };
}

function restoreOrganizationThemeConfig(snapshot: OrganizationSnapshot) {
  execPsql(`
    update public.organizations
    set theme_config = '${toSqlText(JSON.stringify(snapshot.themeConfig))}'::jsonb
    where id = '${toSqlUuid(snapshot.id)}'::uuid;
  `);
}

async function getSignedInUserId(
  client: Awaited<ReturnType<typeof createRuntimeClient>>,
) {
  const {
    data: { user },
    error,
  } = await client.auth.getUser();

  expect(error).toBeNull();
  expect(user?.id).toBeTruthy();

  return user!.id;
}

test.describe.serial("tenant direct grants runtime smoke: organizations", () => {
  test.skip(
    !hasRuntimeConfig,
    "Configura Supabase local, E2E_OWNER_* o E2E_ADMIN_*, E2E_COACH_* y E2E_ORGANIZATION_ID para ejecutar el smoke runtime de organizations.",
  );

  test("authorized owner/admin can safely update tenant theme_config without table permission denial", async () => {
    const settingsClient = await createRuntimeClient(tenantSettingsCredentials!);
    const beforeSnapshot = getOrganizationSnapshotById(organizationId!);

    expect(beforeSnapshot).toMatchObject({
      id: organizationId,
    });

    const marker = getSyntheticMarker("owner-admin");
    const nextThemeConfig = buildSmokeThemeConfig(
      beforeSnapshot!.themeConfig,
      marker,
    );

    try {
      const updateResult = await settingsClient
        .from("organizations")
        .update({
          name: beforeSnapshot!.name,
          theme_config: nextThemeConfig,
        })
        .eq("id", organizationId!)
        .select(
          "id, name, slug, status, theme_config, time_tracking_config, timezone",
        )
        .single();

      expectNoOrganizationPermissionDenied(
        updateResult.error,
        "owner/admin baseline update should not fail because of direct table grants",
      );
      expect(updateResult.error).toBeNull();
      expect(updateResult.data).toMatchObject({
        id: organizationId,
        name: beforeSnapshot!.name,
        slug: beforeSnapshot!.slug,
        status: beforeSnapshot!.status,
        time_tracking_config: beforeSnapshot!.timeTrackingConfig,
        timezone: beforeSnapshot!.timezone,
      });
      expect(
        asJsonObject(updateResult.data!.theme_config)
          .directGrantsOrganizationsSmoke,
      ).toMatchObject({
        marker,
        source: runtimeOrganizationPrefix,
      });

      const updatedSnapshot = getOrganizationSnapshotById(organizationId!);

      expect(updatedSnapshot).toMatchObject({
        id: beforeSnapshot!.id,
        name: beforeSnapshot!.name,
        slug: beforeSnapshot!.slug,
        status: beforeSnapshot!.status,
        timeTrackingConfig: beforeSnapshot!.timeTrackingConfig,
        timezone: beforeSnapshot!.timezone,
      });
      expect(
        asJsonObject(updatedSnapshot!.themeConfig)
          .directGrantsOrganizationsSmoke,
      ).toMatchObject({
        marker,
        source: runtimeOrganizationPrefix,
      });
    } finally {
      restoreOrganizationThemeConfig(beforeSnapshot!);
    }

    const restoredSnapshot = getOrganizationSnapshotById(organizationId!);

    expect(restoredSnapshot).toMatchObject({
      id: beforeSnapshot!.id,
      name: beforeSnapshot!.name,
      slug: beforeSnapshot!.slug,
      status: beforeSnapshot!.status,
      themeConfig: beforeSnapshot!.themeConfig,
      timeTrackingConfig: beforeSnapshot!.timeTrackingConfig,
      timezone: beforeSnapshot!.timezone,
    });
  });

  test("coach cannot update tenant theme_config through direct authenticated DML", async () => {
    const beforeSnapshot = getOrganizationSnapshotById(organizationId!);

    expect(beforeSnapshot).toMatchObject({
      id: organizationId,
    });

    const coachClient = await createRuntimeClient(coachCredentials!);
    const deniedUpdate = await coachClient
      .from("organizations")
      .update({
        theme_config: buildSmokeThemeConfig(
          beforeSnapshot!.themeConfig,
          getSyntheticMarker("coach-denied"),
        ),
      })
      .eq("id", organizationId!)
      .select("id, theme_config");

    expectNoOrganizationPermissionDenied(
      deniedUpdate.error,
      "coach denied update should be an RLS/role denial or empty scoped update, not a missing table grant",
    );

    if (deniedUpdate.error) {
      expect(getErrorText(deniedUpdate.error)).toMatch(
        /row-level security|violates row-level security|permission denied/i,
      );
    } else {
      expect(deniedUpdate.data ?? []).toHaveLength(0);
    }

    const afterSnapshot = getOrganizationSnapshotById(organizationId!);

    expect(afterSnapshot).toMatchObject({
      id: beforeSnapshot!.id,
      name: beforeSnapshot!.name,
      slug: beforeSnapshot!.slug,
      status: beforeSnapshot!.status,
      themeConfig: beforeSnapshot!.themeConfig,
      timeTrackingConfig: beforeSnapshot!.timeTrackingConfig,
      timezone: beforeSnapshot!.timezone,
    });
  });

  test("owner/admin cannot update another organization when the foreign id is outside their managed tenants", async () => {
    const settingsClient = await createRuntimeClient(tenantSettingsCredentials!);
    const userId = await getSignedInUserId(settingsClient);
    const otherOrganizationBefore =
      getForeignOrganizationSnapshotNotManagedByUser(userId);

    test.skip(
      !otherOrganizationBefore,
      "Hace falta otra organizacion local donde la credencial owner/admin del tenant E2E no tenga rol owner/admin activo para validar ID ajeno sin riesgo de mutar un tenant tambien gestionado por esa credencial.",
    );

    const foreignUpdate = await settingsClient
      .from("organizations")
      .update({
        theme_config: buildSmokeThemeConfig(
          otherOrganizationBefore!.themeConfig,
          getSyntheticMarker("cross-tenant"),
        ),
      })
      .eq("id", otherOrganizationBefore!.id)
      .select("id, theme_config");

    expectNoOrganizationPermissionDenied(
      foreignUpdate.error,
      "cross-tenant scoped update should not fail because of missing table grants",
    );

    if (foreignUpdate.error) {
      expect(getErrorText(foreignUpdate.error)).toMatch(
        /row-level security|violates row-level security|permission denied/i,
      );
    } else {
      expect(foreignUpdate.data ?? []).toHaveLength(0);
    }

    const otherOrganizationAfter = getOrganizationSnapshotById(
      otherOrganizationBefore!.id,
    );

    expect(otherOrganizationAfter).toMatchObject({
      id: otherOrganizationBefore!.id,
      name: otherOrganizationBefore!.name,
      slug: otherOrganizationBefore!.slug,
      status: otherOrganizationBefore!.status,
      themeConfig: otherOrganizationBefore!.themeConfig,
      timeTrackingConfig: otherOrganizationBefore!.timeTrackingConfig,
      timezone: otherOrganizationBefore!.timezone,
    });
  });
});
