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

const runtimeCoachProfilePrefix =
  "e2e-direct-grants-coach-profiles-smoke";
const localDbContainer = "supabase_db_boxops";

type CoachProfileError = {
  code?: string;
  details?: string | null;
  hint?: string | null;
  message?: string;
};

type CoachProfileSnapshot = {
  id: string;
  notes: string | null;
  organizationId: string;
  personProfileId: string | null;
  primaryCenterId: string | null;
  status: string;
  updatedAt: string;
  userId: string | null;
  weeklyContractedHours: number;
};

const hasRuntimeConfig = Boolean(
  supabaseUrl &&
    supabaseAnonKey &&
    organizationId &&
    hasCredentials(ownerCredentials) &&
    hasCredentials(coachCredentials),
);

function getErrorText(error: CoachProfileError | null) {
  if (!error) {
    return "";
  }

  return [error.code, error.message, error.details, error.hint]
    .filter(Boolean)
    .join(" ");
}

function expectNoCoachProfilePermissionDenied(
  error: CoachProfileError | null,
  context: string,
) {
  expect(getErrorText(error), context).not.toMatch(
    /permission denied for table coach_profiles/i,
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

function getCoachProfileSnapshotSelect() {
  return `
    id,
    organization_id,
    user_id,
    person_profile_id,
    primary_center_id,
    weekly_contracted_hours::text,
    status,
    replace(replace(notes, E'\\t', ' '), E'\\n', ' ') as notes,
    updated_at
  `;
}

function readCoachProfileSnapshot(sql: string): CoachProfileSnapshot | null {
  const output = readPsqlValue(sql);

  if (!output) {
    return null;
  }

  const [
    id,
    snapshotOrganizationId,
    userId,
    personProfileId,
    primaryCenterId,
    weeklyContractedHours,
    status,
    notes,
    updatedAt,
  ] = output.split("\t");

  if (
    !id ||
    !snapshotOrganizationId ||
    !weeklyContractedHours ||
    !status ||
    !updatedAt
  ) {
    return null;
  }

  return {
    id,
    notes: normalizeNullablePsqlValue(notes),
    organizationId: snapshotOrganizationId,
    personProfileId: normalizeNullablePsqlValue(personProfileId),
    primaryCenterId: normalizeNullablePsqlValue(primaryCenterId),
    status,
    updatedAt,
    userId: normalizeNullablePsqlValue(userId),
    weeklyContractedHours: Number(weeklyContractedHours),
  };
}

function getCoachProfileSnapshotById(coachProfileId: string) {
  return readCoachProfileSnapshot(`
    select ${getCoachProfileSnapshotSelect()}
    from public.coach_profiles
    where id = '${toSqlUuid(coachProfileId)}'::uuid
    limit 1;
  `);
}

function getOtherTenantCoachProfileSnapshot() {
  return readCoachProfileSnapshot(`
    select ${getCoachProfileSnapshotSelect()}
    from public.coach_profiles
    where organization_id <> '${toSqlUuid(organizationId!)}'::uuid
    order by created_at desc
    limit 1;
  `);
}

async function getTenantActiveCenterId(
  ownerClient: Awaited<ReturnType<typeof createRuntimeClient>>,
) {
  const result = await ownerClient
    .from("centers")
    .select("id")
    .eq("organization_id", organizationId!)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  expect(result.error).toBeNull();

  return result.data?.id ?? null;
}

async function createSyntheticPersonProfile(
  ownerClient: Awaited<ReturnType<typeof createRuntimeClient>>,
  purpose: string,
) {
  const stamp = getRuntimeStamp();
  const insertResult = await ownerClient
    .from("person_profiles")
    .insert({
      display_name: `${runtimeCoachProfilePrefix}-person-${purpose}-${stamp}`,
      metadata: { smoke_key: runtimeCoachProfilePrefix, purpose },
      organization_id: organizationId!,
      status: "active",
      visibility_status: "visible",
    })
    .select("id")
    .single();

  expect(insertResult.error).toBeNull();

  return insertResult.data?.id ?? null;
}

test.describe.serial("tenant direct grants runtime smoke: coach_profiles", () => {
  test.skip(
    !hasRuntimeConfig,
    "Configura Supabase local, E2E_OWNER_*, E2E_COACH_* y E2E_ORGANIZATION_ID para ejecutar el smoke runtime de coach_profiles.",
  );

  test("authorized owner can insert/update a tenant coach profile without table permission denial", async () => {
    const ownerClient = await createRuntimeClient(ownerCredentials!);
    const [personProfileId, centerId] = await Promise.all([
      createSyntheticPersonProfile(ownerClient, "owner-happy-path"),
      getTenantActiveCenterId(ownerClient),
    ]);

    test.skip(
      !personProfileId || !centerId,
      "Hace falta una person_profile sintetica y un centro activo del tenant E2E para validar coach_profiles.",
    );

    const insertNotes = `${runtimeCoachProfilePrefix}-insert-${getRuntimeStamp()}`;
    const insertResult = await ownerClient
      .from("coach_profiles")
      .insert({
        metadata: {
          purpose: "owner-happy-path",
          smoke_key: runtimeCoachProfilePrefix,
        },
        notes: insertNotes,
        organization_id: organizationId!,
        person_profile_id: personProfileId!,
        primary_center_id: null,
        status: "active",
        weekly_contracted_hours: 3.5,
      })
      .select(
        "id, notes, organization_id, person_profile_id, primary_center_id, status, user_id, weekly_contracted_hours",
      )
      .single();

    expectNoCoachProfilePermissionDenied(
      insertResult.error,
      "owner baseline insert should not fail because of direct table grants",
    );
    expect(insertResult.error).toBeNull();
    expect(insertResult.data).toMatchObject({
      notes: insertNotes,
      organization_id: organizationId,
      person_profile_id: personProfileId,
      primary_center_id: null,
      status: "active",
      user_id: null,
      weekly_contracted_hours: 3.5,
    });

    const coachProfileId = insertResult.data?.id;

    expect(coachProfileId).toBeTruthy();

    const updatedNotes = `${runtimeCoachProfilePrefix}-updated-${getRuntimeStamp()}`;
    const updateResult = await ownerClient
      .from("coach_profiles")
      .update({
        notes: updatedNotes,
        primary_center_id: centerId!,
        status: "inactive",
        weekly_contracted_hours: 7.25,
      })
      .eq("id", coachProfileId!)
      .eq("organization_id", organizationId!)
      .select(
        "id, notes, organization_id, person_profile_id, primary_center_id, status, user_id, weekly_contracted_hours",
      )
      .single();

    expectNoCoachProfilePermissionDenied(
      updateResult.error,
      "owner baseline update should not fail because of direct table grants",
    );
    expect(updateResult.error).toBeNull();
    expect(updateResult.data).toMatchObject({
      id: coachProfileId,
      notes: updatedNotes,
      organization_id: organizationId,
      person_profile_id: personProfileId,
      primary_center_id: centerId,
      status: "inactive",
      user_id: null,
      weekly_contracted_hours: 7.25,
    });

    const coachSnapshot = getCoachProfileSnapshotById(coachProfileId!);

    expect(coachSnapshot).toMatchObject({
      id: coachProfileId,
      notes: updatedNotes,
      organizationId: organizationId,
      personProfileId: personProfileId,
      primaryCenterId: centerId,
      status: "inactive",
      userId: null,
      weeklyContractedHours: 7.25,
    });
  });

  test("coach cannot insert coach profiles through direct authenticated DML", async () => {
    const ownerClient = await createRuntimeClient(ownerCredentials!);
    const [personProfileId, centerId] = await Promise.all([
      createSyntheticPersonProfile(ownerClient, "coach-denied"),
      getTenantActiveCenterId(ownerClient),
    ]);

    test.skip(
      !personProfileId || !centerId,
      "Hace falta una person_profile sintetica y un centro activo del tenant E2E para validar el negativo de coach.",
    );

    const coachClient = await createRuntimeClient(coachCredentials!);
    const deniedInsert = await coachClient
      .from("coach_profiles")
      .insert({
        metadata: {
          purpose: "coach-denied",
          smoke_key: runtimeCoachProfilePrefix,
        },
        notes: `${runtimeCoachProfilePrefix}-coach-denied-${getRuntimeStamp()}`,
        organization_id: organizationId!,
        person_profile_id: personProfileId!,
        primary_center_id: centerId!,
        status: "active",
        weekly_contracted_hours: 2,
      })
      .select("id");

    expectNoCoachProfilePermissionDenied(
      deniedInsert.error,
      "coach denied insert should be an RLS/role denial, not a missing table grant",
    );
    expect(deniedInsert.error).toBeTruthy();
    expect(getErrorText(deniedInsert.error)).toMatch(
      /row-level security|violates row-level security|permission denied/i,
    );
    expect(deniedInsert.data ?? []).toHaveLength(0);
  });

  test("owner cannot update a coach profile from another tenant when scoped to the active organization", async () => {
    const otherCoachBefore = getOtherTenantCoachProfileSnapshot();

    test.skip(
      !otherCoachBefore,
      "Hace falta al menos una coach_profile de otro tenant en Supabase local para validar ID ajeno.",
    );

    const ownerClient = await createRuntimeClient(ownerCredentials!);
    const foreignUpdate = await ownerClient
      .from("coach_profiles")
      .update({
        notes: `${runtimeCoachProfilePrefix}-cross-tenant-${getRuntimeStamp()}`,
        status: "inactive",
        weekly_contracted_hours: 9.75,
      })
      .eq("id", otherCoachBefore!.id)
      .eq("organization_id", organizationId!)
      .select("id, notes, status, weekly_contracted_hours");

    expectNoCoachProfilePermissionDenied(
      foreignUpdate.error,
      "cross-tenant scoped update should not fail because of missing table grants",
    );
    expect(foreignUpdate.error).toBeNull();
    expect(foreignUpdate.data ?? []).toHaveLength(0);

    const otherCoachAfter = getCoachProfileSnapshotById(otherCoachBefore!.id);

    expect(otherCoachAfter).toMatchObject({
      id: otherCoachBefore!.id,
      notes: otherCoachBefore!.notes,
      organizationId: otherCoachBefore!.organizationId,
      personProfileId: otherCoachBefore!.personProfileId,
      primaryCenterId: otherCoachBefore!.primaryCenterId,
      status: otherCoachBefore!.status,
      userId: otherCoachBefore!.userId,
      weeklyContractedHours: otherCoachBefore!.weeklyContractedHours,
    });
  });
});
