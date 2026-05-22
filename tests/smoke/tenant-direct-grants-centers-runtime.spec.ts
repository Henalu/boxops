import { execFileSync } from "node:child_process";

import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

import {
  coachCredentials,
  hasCredentials,
  organizationId,
  ownerCredentials,
  supabaseAnonKey,
  supabaseUrl,
  type SmokeCredentials,
} from "./helpers/env";
import type { Database } from "../../src/types/supabase";

const runtimeCenterSlug = "e2e-direct-grants-centers-smoke";
const runtimeCenterBaseName = "E2E Direct Grants Centers Smoke";
const localDbContainer = "supabase_db_boxops";

type CenterError = {
  code?: string;
  details?: string | null;
  hint?: string | null;
  message?: string;
};

type CenterSnapshot = {
  id: string;
  name: string;
  organizationId: string;
  status: string;
  updatedAt: string;
};

const hasRuntimeConfig = Boolean(
  supabaseUrl &&
    supabaseAnonKey &&
    organizationId &&
    hasCredentials(ownerCredentials) &&
    hasCredentials(coachCredentials),
);

function getErrorText(error: CenterError | null) {
  if (!error) {
    return "";
  }

  return [error.code, error.message, error.details, error.hint]
    .filter(Boolean)
    .join(" ");
}

function expectNoCenterPermissionDenied(
  error: CenterError | null,
  context: string,
) {
  expect(getErrorText(error), context).not.toMatch(
    /permission denied for table centers/i,
  );
}

function getRuntimeStamp() {
  return new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
}

function createRuntimeClient(credentials: SmokeCredentials) {
  const client = createClient<Database>(supabaseUrl!, supabaseAnonKey!, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return client.auth
    .signInWithPassword(credentials)
    .then(({ error }) => {
      expect(error).toBeNull();

      return client;
    });
}

function toSqlUuid(value: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error("Expected E2E_ORGANIZATION_ID to be a UUID.");
  }

  return value;
}

function readCenterSnapshot(sql: string): CenterSnapshot | null {
  try {
    const output = execFileSync(
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
        "-F",
        "\t",
        "-c",
        sql,
      ],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    ).trim();

    if (!output) {
      return null;
    }

    const [id, name, snapshotOrganizationId, status, updatedAt] =
      output.split("\t");

    if (!id || !name || !snapshotOrganizationId || !status || !updatedAt) {
      return null;
    }

    return {
      id,
      name,
      organizationId: snapshotOrganizationId,
      status,
      updatedAt,
    };
  } catch {
    return null;
  }
}

function getOtherTenantCenterSnapshot() {
  return readCenterSnapshot(`
    select id, name, organization_id, status, updated_at
    from public.centers
    where organization_id <> '${toSqlUuid(organizationId!)}'::uuid
      and status = 'active'
    order by name
    limit 1;
  `);
}

function getCenterSnapshotById(centerId: string) {
  return readCenterSnapshot(`
    select id, name, organization_id, status, updated_at
    from public.centers
    where id = '${toSqlUuid(centerId)}'::uuid
    limit 1;
  `);
}

test.describe.serial("tenant direct grants runtime smoke: centers", () => {
  test.skip(
    !hasRuntimeConfig,
    "Configura Supabase local, E2E_OWNER_*, E2E_COACH_* y E2E_ORGANIZATION_ID para ejecutar el smoke runtime de centers.",
  );

  test("authorized owner can upsert/update a tenant center without table permission denial", async () => {
    const ownerClient = await createRuntimeClient(ownerCredentials!);
    const selectExisting = await ownerClient
      .from("centers")
      .select("id, organization_id")
      .eq("organization_id", organizationId!)
      .eq("slug", runtimeCenterSlug)
      .maybeSingle();

    expectNoCenterPermissionDenied(
      selectExisting.error,
      "owner baseline select should not fail because of direct table grants",
    );
    expect(selectExisting.error).toBeNull();

    let centerId = selectExisting.data?.id;

    if (!centerId) {
      const insertResult = await ownerClient
        .from("centers")
        .insert({
          name: runtimeCenterBaseName,
          organization_id: organizationId!,
          slug: runtimeCenterSlug,
          status: "inactive",
          timezone: "Europe/Madrid",
        })
        .select("id")
        .single();

      expectNoCenterPermissionDenied(
        insertResult.error,
        "owner baseline insert should not fail because of direct table grants",
      );
      expect(insertResult.error).toBeNull();
      centerId = insertResult.data?.id;
    }

    expect(centerId).toBeTruthy();

    const updatedName = `${runtimeCenterBaseName} ${getRuntimeStamp()}`;
    const updateResult = await ownerClient
      .from("centers")
      .update({
        name: updatedName,
        status: "inactive",
        timezone: "Europe/Madrid",
      })
      .eq("id", centerId!)
      .eq("organization_id", organizationId!)
      .select("id, name, organization_id, slug, status, timezone")
      .single();

    expectNoCenterPermissionDenied(
      updateResult.error,
      "owner baseline update should not fail because of direct table grants",
    );
    expect(updateResult.error).toBeNull();
    expect(updateResult.data).toMatchObject({
      id: centerId,
      name: updatedName,
      organization_id: organizationId,
      slug: runtimeCenterSlug,
      status: "inactive",
      timezone: "Europe/Madrid",
    });
  });

  test("coach cannot insert centers through direct authenticated DML", async () => {
    const coachClient = await createRuntimeClient(coachCredentials!);
    const deniedInsert = await coachClient
      .from("centers")
      .insert({
        name: `${runtimeCenterBaseName} Coach Denied ${getRuntimeStamp()}`,
        organization_id: organizationId!,
        slug: `e2e-coach-denied-${getRuntimeStamp()}`,
        status: "inactive",
        timezone: "Europe/Madrid",
      })
      .select("id");

    expectNoCenterPermissionDenied(
      deniedInsert.error,
      "coach denied insert should be an RLS/role denial, not a missing table grant",
    );
    expect(deniedInsert.error).toBeTruthy();
    expect(deniedInsert.data ?? []).toHaveLength(0);
  });

  test("owner cannot update a center from another tenant when scoped to the active organization", async () => {
    const otherCenterBefore = getOtherTenantCenterSnapshot();

    test.skip(
      !otherCenterBefore,
      "Hace falta al menos un centro activo de otro tenant en Supabase local para validar ID ajeno.",
    );

    const ownerClient = await createRuntimeClient(ownerCredentials!);
    const attemptedName = `${runtimeCenterBaseName} Cross Tenant ${getRuntimeStamp()}`;
    const foreignUpdate = await ownerClient
      .from("centers")
      .update({ name: attemptedName })
      .eq("id", otherCenterBefore!.id)
      .eq("organization_id", organizationId!)
      .select("id, name");

    expectNoCenterPermissionDenied(
      foreignUpdate.error,
      "cross-tenant scoped update should not fail because of missing table grants",
    );
    expect(foreignUpdate.error).toBeNull();
    expect(foreignUpdate.data ?? []).toHaveLength(0);

    const otherCenterAfter = getCenterSnapshotById(otherCenterBefore!.id);

    expect(otherCenterAfter).toMatchObject({
      id: otherCenterBefore!.id,
      name: otherCenterBefore!.name,
      organizationId: otherCenterBefore!.organizationId,
      status: otherCenterBefore!.status,
    });
  });
});
