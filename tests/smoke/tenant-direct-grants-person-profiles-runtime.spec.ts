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

const runtimePersonProfilePrefix =
  "e2e-direct-grants-person-profiles-smoke";
const localDbContainer = "supabase_db_boxops";

type PersonProfileError = {
  code?: string;
  details?: string | null;
  hint?: string | null;
  message?: string;
};

type PersonProfileSnapshot = {
  displayName: string;
  fullName: string | null;
  id: string;
  organizationId: string;
  preferredAlias: string | null;
  publicEmail: string | null;
  status: string;
  updatedAt: string;
  userId: string | null;
  visibilityStatus: string;
};

const hasRuntimeConfig = Boolean(
  supabaseUrl &&
    supabaseAnonKey &&
    organizationId &&
    hasCredentials(ownerCredentials) &&
    hasCredentials(coachCredentials),
);

function getErrorText(error: PersonProfileError | null) {
  if (!error) {
    return "";
  }

  return [error.code, error.message, error.details, error.hint]
    .filter(Boolean)
    .join(" ");
}

function expectNoPersonProfilePermissionDenied(
  error: PersonProfileError | null,
  context: string,
) {
  expect(getErrorText(error), context).not.toMatch(
    /permission denied for table person_profiles/i,
  );
}

function getRuntimeStamp() {
  return new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
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

function normalizeNullablePsqlValue(value: string | undefined) {
  return value && value !== "__NULL__" ? value : null;
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
        "-F",
        "\t",
        "-P",
        "null=__NULL__",
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

function getPersonProfileSnapshotSelect() {
  return `
    id,
    organization_id,
    user_id,
    replace(replace(full_name, E'\\t', ' '), E'\\n', ' ') as full_name,
    replace(replace(display_name, E'\\t', ' '), E'\\n', ' ') as display_name,
    replace(replace(preferred_alias, E'\\t', ' '), E'\\n', ' ') as preferred_alias,
    public_email,
    visibility_status,
    status,
    updated_at
  `;
}

function readPersonProfileSnapshot(sql: string): PersonProfileSnapshot | null {
  const output = readPsqlValue(sql);

  if (!output) {
    return null;
  }

  const [
    id,
    snapshotOrganizationId,
    userId,
    fullName,
    displayName,
    preferredAlias,
    publicEmail,
    visibilityStatus,
    status,
    updatedAt,
  ] = output.split("\t");

  if (
    !id ||
    !snapshotOrganizationId ||
    !displayName ||
    !visibilityStatus ||
    !status ||
    !updatedAt
  ) {
    return null;
  }

  return {
    displayName,
    fullName: normalizeNullablePsqlValue(fullName),
    id,
    organizationId: snapshotOrganizationId,
    preferredAlias: normalizeNullablePsqlValue(preferredAlias),
    publicEmail: normalizeNullablePsqlValue(publicEmail),
    status,
    updatedAt,
    userId: normalizeNullablePsqlValue(userId),
    visibilityStatus,
  };
}

function getPersonProfileSnapshotById(personProfileId: string) {
  return readPersonProfileSnapshot(`
    select ${getPersonProfileSnapshotSelect()}
    from public.person_profiles
    where id = '${toSqlUuid(personProfileId)}'::uuid
    limit 1;
  `);
}

function getOtherTenantPersonProfileSnapshot() {
  return readPersonProfileSnapshot(`
    select ${getPersonProfileSnapshotSelect()}
    from public.person_profiles
    where organization_id <> '${toSqlUuid(organizationId!)}'::uuid
    order by created_at desc
    limit 1;
  `);
}

async function createSyntheticPersonProfile(
  ownerClient: Awaited<ReturnType<typeof createRuntimeClient>>,
  purpose: string,
) {
  const stamp = getRuntimeStamp();
  const insertResult = await ownerClient
    .from("person_profiles")
    .insert({
      display_name: `${runtimePersonProfilePrefix}-${purpose}-${stamp}`,
      full_name: null,
      metadata: { smoke_key: runtimePersonProfilePrefix, purpose },
      organization_id: organizationId!,
      preferred_alias: null,
      public_email: null,
      status: "active",
      visibility_status: "visible",
    })
    .select(
      "id, display_name, organization_id, preferred_alias, public_email, status, visibility_status",
    )
    .single();

  expectNoPersonProfilePermissionDenied(
    insertResult.error,
    "owner baseline insert should not fail because of direct table grants",
  );
  expect(insertResult.error).toBeNull();

  return insertResult.data;
}

test.describe.serial(
  "tenant direct grants runtime smoke: person_profiles",
  () => {
    test.skip(
      !hasRuntimeConfig,
      "Configura Supabase local, E2E_OWNER_*, E2E_COACH_* y E2E_ORGANIZATION_ID para ejecutar el smoke runtime de person_profiles.",
    );

    test("authorized owner can insert/update a tenant person profile without table permission denial", async () => {
      const ownerClient = await createRuntimeClient(ownerCredentials!);
      const insertedProfile = await createSyntheticPersonProfile(
        ownerClient,
        "owner-happy-path",
      );

      expect(insertedProfile).toMatchObject({
        organization_id: organizationId,
        preferred_alias: null,
        public_email: null,
        status: "active",
        visibility_status: "visible",
      });
      expect(insertedProfile?.display_name).toContain(
        runtimePersonProfilePrefix,
      );

      const updatedDisplayName = `${runtimePersonProfilePrefix}-updated-${getRuntimeStamp()}`;
      const updatedPublicEmail = `${runtimePersonProfilePrefix}-${getRuntimeStamp()}@example.test`;
      const updateResult = await ownerClient
        .from("person_profiles")
        .update({
          display_name: updatedDisplayName,
          preferred_alias: "E2E Direct Grants Person",
          public_email: updatedPublicEmail,
          status: "inactive",
          visibility_status: "internal",
        })
        .eq("id", insertedProfile!.id)
        .eq("organization_id", organizationId!)
        .select(
          "id, display_name, organization_id, preferred_alias, public_email, status, visibility_status",
        )
        .single();

      expectNoPersonProfilePermissionDenied(
        updateResult.error,
        "owner baseline update should not fail because of direct table grants",
      );
      expect(updateResult.error).toBeNull();
      expect(updateResult.data).toMatchObject({
        display_name: updatedDisplayName,
        id: insertedProfile!.id,
        organization_id: organizationId,
        preferred_alias: "E2E Direct Grants Person",
        public_email: updatedPublicEmail,
        status: "inactive",
        visibility_status: "internal",
      });
    });

    test("coach cannot create or update other person profiles through direct authenticated DML", async () => {
      const ownerClient = await createRuntimeClient(ownerCredentials!);
      const targetProfile = await createSyntheticPersonProfile(
        ownerClient,
        "coach-denied-target",
      );

      expect(targetProfile?.id).toBeTruthy();

      const targetBefore = getPersonProfileSnapshotById(targetProfile!.id);

      expect(targetBefore).toMatchObject({
        id: targetProfile!.id,
        organizationId: organizationId,
      });

      const coachClient = await createRuntimeClient(coachCredentials!);
      const deniedInsert = await coachClient
        .from("person_profiles")
        .insert({
          display_name: `${runtimePersonProfilePrefix}-coach-denied-${getRuntimeStamp()}`,
          metadata: {
            smoke_key: runtimePersonProfilePrefix,
            purpose: "coach-denied-insert",
          },
          organization_id: organizationId!,
          status: "active",
          visibility_status: "visible",
        })
        .select("id");

      expectNoPersonProfilePermissionDenied(
        deniedInsert.error,
        "coach denied insert should be an RLS/role denial, not a missing table grant",
      );
      expect(deniedInsert.error).toBeTruthy();
      expect(deniedInsert.data ?? []).toHaveLength(0);

      const deniedUpdate = await coachClient
        .from("person_profiles")
        .update({
          display_name: `${runtimePersonProfilePrefix}-coach-mutated-${getRuntimeStamp()}`,
          preferred_alias: "Coach should not manage this",
        })
        .eq("id", targetProfile!.id)
        .eq("organization_id", organizationId!)
        .select("id, display_name, preferred_alias");

      expectNoPersonProfilePermissionDenied(
        deniedUpdate.error,
        "coach denied update should be an RLS/role denial or empty scoped update, not a missing table grant",
      );

      if (deniedUpdate.error) {
        expect(getErrorText(deniedUpdate.error)).toMatch(
          /row-level security|person profile update is not allowed|permission denied/i,
        );
      } else {
        expect(deniedUpdate.data ?? []).toHaveLength(0);
      }

      const targetAfter = getPersonProfileSnapshotById(targetProfile!.id);

      expect(targetAfter).toMatchObject({
        displayName: targetBefore!.displayName,
        fullName: targetBefore!.fullName,
        id: targetBefore!.id,
        organizationId: targetBefore!.organizationId,
        preferredAlias: targetBefore!.preferredAlias,
        publicEmail: targetBefore!.publicEmail,
        status: targetBefore!.status,
        userId: targetBefore!.userId,
        visibilityStatus: targetBefore!.visibilityStatus,
      });
    });

    test("owner cannot update a person profile from another tenant when scoped to the active organization", async () => {
      const otherProfileBefore = getOtherTenantPersonProfileSnapshot();

      test.skip(
        !otherProfileBefore,
        "Hace falta al menos una person_profile de otro tenant en Supabase local para validar ID ajeno.",
      );

      const ownerClient = await createRuntimeClient(ownerCredentials!);
      const foreignUpdate = await ownerClient
        .from("person_profiles")
        .update({
          display_name: `${runtimePersonProfilePrefix}-cross-tenant-${getRuntimeStamp()}`,
          preferred_alias: "Cross tenant should not mutate",
          public_email: `${runtimePersonProfilePrefix}-cross-tenant-${getRuntimeStamp()}@example.test`,
        })
        .eq("id", otherProfileBefore!.id)
        .eq("organization_id", organizationId!)
        .select("id, display_name, preferred_alias, public_email");

      expectNoPersonProfilePermissionDenied(
        foreignUpdate.error,
        "cross-tenant scoped update should not fail because of missing table grants",
      );
      expect(foreignUpdate.error).toBeNull();
      expect(foreignUpdate.data ?? []).toHaveLength(0);

      const otherProfileAfter = getPersonProfileSnapshotById(
        otherProfileBefore!.id,
      );

      expect(otherProfileAfter).toMatchObject({
        displayName: otherProfileBefore!.displayName,
        fullName: otherProfileBefore!.fullName,
        id: otherProfileBefore!.id,
        organizationId: otherProfileBefore!.organizationId,
        preferredAlias: otherProfileBefore!.preferredAlias,
        publicEmail: otherProfileBefore!.publicEmail,
        status: otherProfileBefore!.status,
        userId: otherProfileBefore!.userId,
        visibilityStatus: otherProfileBefore!.visibilityStatus,
      });
    });
  },
);
