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

const runtimeClassTypeSlug = "e2e-direct-grants-class-types-smoke";
const runtimeClassTypeBaseName = "E2E Direct Grants Class Types Smoke";
const localDbContainer = "supabase_db_boxops";

type ClassTypeError = {
  code?: string;
  details?: string | null;
  hint?: string | null;
  message?: string;
};

type ClassTypeSnapshot = {
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

function getErrorText(error: ClassTypeError | null) {
  if (!error) {
    return "";
  }

  return [error.code, error.message, error.details, error.hint]
    .filter(Boolean)
    .join(" ");
}

function expectNoClassTypePermissionDenied(
  error: ClassTypeError | null,
  context: string,
) {
  expect(getErrorText(error), context).not.toMatch(
    /permission denied for table class_types/i,
  );
}

function getRuntimeStamp() {
  return new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
}

function getOppositeStatus(status: string) {
  return status === "active" ? "inactive" : "active";
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
    throw new Error("Expected a UUID.");
  }

  return value;
}

function readClassTypeSnapshot(sql: string): ClassTypeSnapshot | null {
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

function getOtherTenantClassTypeSnapshot() {
  return readClassTypeSnapshot(`
    select id, name, organization_id, status, updated_at
    from public.class_types
    where organization_id <> '${toSqlUuid(organizationId!)}'::uuid
      and status = 'active'
    order by name
    limit 1;
  `);
}

function getClassTypeSnapshotById(classTypeId: string) {
  return readClassTypeSnapshot(`
    select id, name, organization_id, status, updated_at
    from public.class_types
    where id = '${toSqlUuid(classTypeId)}'::uuid
    limit 1;
  `);
}

test.describe.serial("tenant direct grants runtime smoke: class_types", () => {
  test.skip(
    !hasRuntimeConfig,
    "Configura Supabase local, E2E_OWNER_*, E2E_COACH_* y E2E_ORGANIZATION_ID para ejecutar el smoke runtime de class_types.",
  );

  test("authorized owner can insert/update a tenant class type without table permission denial", async () => {
    const ownerClient = await createRuntimeClient(ownerCredentials!);
    const selectExisting = await ownerClient
      .from("class_types")
      .select("id, organization_id, status")
      .eq("organization_id", organizationId!)
      .eq("slug", runtimeClassTypeSlug)
      .maybeSingle();

    expectNoClassTypePermissionDenied(
      selectExisting.error,
      "owner baseline select should not fail because of direct table grants",
    );
    expect(selectExisting.error).toBeNull();

    let classTypeId = selectExisting.data?.id;
    let currentStatus = selectExisting.data?.status ?? "inactive";

    if (!classTypeId) {
      const insertResult = await ownerClient
        .from("class_types")
        .insert({
          category: "staffing",
          color: "#335c67",
          name: runtimeClassTypeBaseName,
          organization_id: organizationId!,
          required_coaches: 1,
          requires_certification: false,
          slug: runtimeClassTypeSlug,
          status: "inactive",
        })
        .select("id, status")
        .single();

      expectNoClassTypePermissionDenied(
        insertResult.error,
        "owner baseline insert should not fail because of direct table grants",
      );
      expect(insertResult.error).toBeNull();
      classTypeId = insertResult.data?.id;
      currentStatus = insertResult.data?.status ?? "inactive";
    }

    expect(classTypeId).toBeTruthy();

    const updatedStatus = getOppositeStatus(currentStatus);
    const updateResult = await ownerClient
      .from("class_types")
      .update({
        status: updatedStatus,
      })
      .eq("id", classTypeId!)
      .eq("organization_id", organizationId!)
      .select(
        "id, name, organization_id, slug, category, required_coaches, requires_certification, color, status",
      )
      .single();

    expectNoClassTypePermissionDenied(
      updateResult.error,
      "owner baseline update should not fail because of direct table grants",
    );
    expect(updateResult.error).toBeNull();
    expect(updateResult.data).toMatchObject({
      category: "staffing",
      color: "#335c67",
      id: classTypeId,
      name: runtimeClassTypeBaseName,
      organization_id: organizationId,
      required_coaches: 1,
      requires_certification: false,
      slug: runtimeClassTypeSlug,
      status: updatedStatus,
    });
  });

  test("coach cannot insert class types through direct authenticated DML", async () => {
    const coachClient = await createRuntimeClient(coachCredentials!);
    const stamp = getRuntimeStamp();
    const deniedInsert = await coachClient
      .from("class_types")
      .insert({
        category: "class",
        color: "#7c3aed",
        name: `${runtimeClassTypeBaseName} Coach Denied ${stamp}`,
        organization_id: organizationId!,
        required_coaches: 1,
        requires_certification: false,
        slug: `e2e-direct-grants-class-types-smoke-coach-denied-${stamp}`,
        status: "inactive",
      })
      .select("id");

    expectNoClassTypePermissionDenied(
      deniedInsert.error,
      "coach denied insert should be an RLS/role denial, not a missing table grant",
    );
    expect(deniedInsert.error).toBeTruthy();
    expect(deniedInsert.data ?? []).toHaveLength(0);
  });

  test("owner cannot update a class type from another tenant when scoped to the active organization", async () => {
    const otherClassTypeBefore = getOtherTenantClassTypeSnapshot();

    test.skip(
      !otherClassTypeBefore,
      "Hace falta al menos un tipo activo de otro tenant en Supabase local para validar ID ajeno.",
    );

    const ownerClient = await createRuntimeClient(ownerCredentials!);
    const attemptedStatus = getOppositeStatus(otherClassTypeBefore!.status);
    const foreignUpdate = await ownerClient
      .from("class_types")
      .update({ status: attemptedStatus })
      .eq("id", otherClassTypeBefore!.id)
      .eq("organization_id", organizationId!)
      .select("id, status");

    expectNoClassTypePermissionDenied(
      foreignUpdate.error,
      "cross-tenant scoped update should not fail because of missing table grants",
    );
    expect(foreignUpdate.error).toBeNull();
    expect(foreignUpdate.data ?? []).toHaveLength(0);

    const otherClassTypeAfter = getClassTypeSnapshotById(
      otherClassTypeBefore!.id,
    );

    expect(otherClassTypeAfter).toMatchObject({
      id: otherClassTypeBefore!.id,
      name: otherClassTypeBefore!.name,
      organizationId: otherClassTypeBefore!.organizationId,
      status: otherClassTypeBefore!.status,
    });
  });
});
