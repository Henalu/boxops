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

const runtimeMembershipPrefix =
  "e2e-direct-grants-organization-memberships-smoke";
const localDbContainer = "supabase_db_boxops";

type MembershipError = {
  code?: string;
  details?: string | null;
  hint?: string | null;
  message?: string;
};

type MembershipSnapshot = {
  id: string;
  invitedAt: string | null;
  joinedAt: string | null;
  organizationId: string;
  role: string;
  status: string;
  updatedAt: string;
  userId: string;
};

type SafeAuthUserCandidate = {
  userId: string;
};

const hasRuntimeConfig = Boolean(
  supabaseUrl &&
  supabaseAnonKey &&
  organizationId &&
  hasCredentials(ownerCredentials) &&
  hasCredentials(coachCredentials),
);

function getErrorText(error: MembershipError | null) {
  if (!error) {
    return "";
  }

  return [error.code, error.message, error.details, error.hint]
    .filter(Boolean)
    .join(" ");
}

function expectNoMembershipPermissionDenied(
  error: MembershipError | null,
  context: string,
) {
  expect(getErrorText(error), context).not.toMatch(
    /permission denied for table organization_memberships/i,
  );
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

function normalizeNullablePsqlValue(value: string | undefined) {
  return value && value !== "__NULL__" ? value : null;
}

function expectNullableTimestampEqual(
  received: string | null,
  expected: string | null,
) {
  if (!received || !expected) {
    expect(received).toBe(expected);
    return;
  }

  expect(new Date(received).getTime()).toBe(new Date(expected).getTime());
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

function getMembershipSnapshotSelect() {
  return `
    id,
    organization_id,
    user_id,
    role,
    status,
    invited_at,
    joined_at,
    updated_at
  `;
}

function readMembershipSnapshot(sql: string): MembershipSnapshot | null {
  const output = readPsqlValue(sql);

  if (!output) {
    return null;
  }

  const [
    id,
    snapshotOrganizationId,
    userId,
    role,
    status,
    invitedAt,
    joinedAt,
    updatedAt,
  ] = output.split("\t");

  if (
    !id ||
    !snapshotOrganizationId ||
    !userId ||
    !role ||
    !status ||
    !updatedAt
  ) {
    return null;
  }

  return {
    id,
    invitedAt: normalizeNullablePsqlValue(invitedAt),
    joinedAt: normalizeNullablePsqlValue(joinedAt),
    organizationId: snapshotOrganizationId,
    role,
    status,
    updatedAt,
    userId,
  };
}

function getMembershipSnapshotById(membershipId: string) {
  return readMembershipSnapshot(`
    select ${getMembershipSnapshotSelect()}
    from public.organization_memberships
    where id = '${toSqlUuid(membershipId)}'::uuid
    limit 1;
  `);
}

function getOtherTenantMembershipSnapshot() {
  return readMembershipSnapshot(`
    select ${getMembershipSnapshotSelect()}
    from public.organization_memberships
    where organization_id <> '${toSqlUuid(organizationId!)}'::uuid
    order by created_at desc
    limit 1;
  `);
}

function getSyntheticTenantMembershipSnapshot() {
  return readMembershipSnapshot(`
    select ${getMembershipSnapshotSelect()}
    from public.organization_memberships membership
    inner join auth.users auth_user
      on auth_user.id = membership.user_id
    where membership.organization_id = '${toSqlUuid(organizationId!)}'::uuid
      and lower(coalesce(auth_user.email, '')) like '${toSqlText(
        runtimeMembershipPrefix,
      )}%'
    order by membership.created_at desc
    limit 1;
  `);
}

function getSafeAuthUserCandidateWithoutTenantMembership(): SafeAuthUserCandidate | null {
  const output = readPsqlValue(`
    select auth_user.id
    from auth.users auth_user
    where not exists (
        select 1
        from public.organization_memberships membership
        where membership.organization_id = '${toSqlUuid(organizationId!)}'::uuid
          and membership.user_id = auth_user.id
      )
      and (
        lower(coalesce(auth_user.email, '')) like '${toSqlText(
          runtimeMembershipPrefix,
        )}%'
        or auth_user.raw_user_meta_data ->> 'smoke_key' = '${toSqlText(
          runtimeMembershipPrefix,
        )}'
      )
    order by auth_user.created_at
    limit 1;
  `);

  return output ? { userId: output } : null;
}

async function getControlledTenantMembershipSnapshot(
  ownerClient: Awaited<ReturnType<typeof createRuntimeClient>>,
) {
  const syntheticMembership = getSyntheticTenantMembershipSnapshot();

  if (syntheticMembership) {
    return syntheticMembership;
  }

  const {
    data: { user },
    error: userError,
  } = await ownerClient.auth.getUser();

  expect(userError).toBeNull();
  expect(user?.id).toBeTruthy();

  const membershipResult = await ownerClient
    .from("organization_memberships")
    .select(
      "id, invited_at, joined_at, organization_id, role, status, updated_at, user_id",
    )
    .eq("organization_id", organizationId!)
    .neq("user_id", user!.id)
    .eq("status", "active")
    .in("role", ["admin", "manager", "coach"])
    .not("joined_at", "is", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  expectNoMembershipPermissionDenied(
    membershipResult.error,
    "controlled membership select should not fail because of direct table grants",
  );
  expect(membershipResult.error).toBeNull();

  return membershipResult.data
    ? {
        id: membershipResult.data.id,
        invitedAt: membershipResult.data.invited_at,
        joinedAt: membershipResult.data.joined_at,
        organizationId: membershipResult.data.organization_id,
        role: membershipResult.data.role,
        status: membershipResult.data.status,
        updatedAt: membershipResult.data.updated_at,
        userId: membershipResult.data.user_id,
      }
    : null;
}

function getTenantManagerUserIdForDeniedInsert() {
  const output = readPsqlValue(`
    select user_id
    from public.organization_memberships
    where organization_id = '${toSqlUuid(organizationId!)}'::uuid
      and role in ('owner', 'admin', 'manager')
      and status = 'active'
    order by case role when 'owner' then 1 when 'admin' then 2 else 3 end
    limit 1;
  `);

  return output || null;
}

test.describe
  .serial("tenant direct grants runtime smoke: organization_memberships", () => {
  test.skip(
    !hasRuntimeConfig,
    "Configura Supabase local, E2E_OWNER_*, E2E_COACH_* y E2E_ORGANIZATION_ID para ejecutar el smoke runtime de organization_memberships.",
  );

  test("authorized owner can insert a tenant membership only when a safe local auth user candidate exists", async () => {
    const authCandidate = getSafeAuthUserCandidateWithoutTenantMembership();

    test.skip(
      !authCandidate,
      "No hay auth.users sintetico seguro con prefijo e2e-direct-grants-organization-memberships-smoke sin membership previa en el tenant E2E; no se fuerza insert sobre usuarios reales ni credenciales E2E.",
    );

    const ownerClient = await createRuntimeClient(ownerCredentials!);
    const invitedAt = new Date().toISOString();
    const insertResult = await ownerClient
      .from("organization_memberships")
      .insert({
        invited_at: invitedAt,
        organization_id: organizationId!,
        role: "coach",
        status: "invited",
        user_id: authCandidate!.userId,
      })
      .select(
        "id, invited_at, joined_at, organization_id, role, status, user_id",
      )
      .single();

    expectNoMembershipPermissionDenied(
      insertResult.error,
      "owner baseline insert should not fail because of direct table grants",
    );
    expect(insertResult.error).toBeNull();
    expect(insertResult.data).toMatchObject({
      joined_at: null,
      organization_id: organizationId,
      role: "coach",
      status: "invited",
      user_id: authCandidate!.userId,
    });
    expect(insertResult.data?.invited_at).toBeTruthy();

    const membershipSnapshot = getMembershipSnapshotById(insertResult.data!.id);

    expect(membershipSnapshot).toMatchObject({
      id: insertResult.data!.id,
      joinedAt: null,
      organizationId: organizationId,
      role: "coach",
      status: "invited",
      userId: authCandidate!.userId,
    });
  });

  test("authorized owner can perform an app-like tenant-scoped update without changing controlled membership access", async () => {
    const ownerClient = await createRuntimeClient(ownerCredentials!);
    const controlledMembership =
      await getControlledTenantMembershipSnapshot(ownerClient);

    test.skip(
      !controlledMembership,
      "Hace falta una membership sintetica o una membership activa no propia y controlada del tenant E2E para validar update sin degradar credenciales.",
    );

    const beforeSnapshot = getMembershipSnapshotById(controlledMembership!.id);

    expect(beforeSnapshot).toMatchObject({
      id: controlledMembership!.id,
      organizationId: organizationId,
      role: controlledMembership!.role,
      status: controlledMembership!.status,
      userId: controlledMembership!.userId,
    });

    const updateResult = await ownerClient
      .from("organization_memberships")
      .update({
        invited_at: beforeSnapshot!.invitedAt,
        joined_at: beforeSnapshot!.joinedAt,
        role: beforeSnapshot!.role,
        status: beforeSnapshot!.status,
      })
      .eq("id", controlledMembership!.id)
      .eq("organization_id", organizationId!)
      .select(
        "id, invited_at, joined_at, organization_id, role, status, user_id",
      )
      .single();

    expectNoMembershipPermissionDenied(
      updateResult.error,
      "owner baseline update should not fail because of direct table grants",
    );
    expect(updateResult.error).toBeNull();
    expect(updateResult.data).toMatchObject({
      id: controlledMembership!.id,
      organization_id: organizationId,
      role: beforeSnapshot!.role,
      status: beforeSnapshot!.status,
      user_id: beforeSnapshot!.userId,
    });
    expectNullableTimestampEqual(
      updateResult.data?.invited_at ?? null,
      beforeSnapshot!.invitedAt,
    );
    expectNullableTimestampEqual(
      updateResult.data?.joined_at ?? null,
      beforeSnapshot!.joinedAt,
    );

    const afterSnapshot = getMembershipSnapshotById(controlledMembership!.id);

    expect(afterSnapshot).toMatchObject({
      id: beforeSnapshot!.id,
      invitedAt: beforeSnapshot!.invitedAt,
      joinedAt: beforeSnapshot!.joinedAt,
      organizationId: beforeSnapshot!.organizationId,
      role: beforeSnapshot!.role,
      status: beforeSnapshot!.status,
      userId: beforeSnapshot!.userId,
    });
  });

  test("coach cannot insert organization memberships through direct authenticated DML", async () => {
    const targetUserId = getTenantManagerUserIdForDeniedInsert();

    test.skip(
      !targetUserId,
      "Hace falta al menos un usuario de gestion activo del tenant E2E para validar el negativo de coach.",
    );

    const coachClient = await createRuntimeClient(coachCredentials!);
    const deniedInsert = await coachClient
      .from("organization_memberships")
      .insert({
        invited_at: new Date().toISOString(),
        organization_id: organizationId!,
        role: "coach",
        status: "invited",
        user_id: targetUserId!,
      })
      .select("id");

    expectNoMembershipPermissionDenied(
      deniedInsert.error,
      "coach denied insert should be an RLS/role denial, not a missing table grant",
    );
    expect(deniedInsert.error).toBeTruthy();
    expect(getErrorText(deniedInsert.error)).toMatch(
      /row-level security|violates row-level security|permission denied/i,
    );
    expect(deniedInsert.data ?? []).toHaveLength(0);
  });

  test("owner cannot update a membership from another tenant when scoped to the active organization", async () => {
    const otherMembershipBefore = getOtherTenantMembershipSnapshot();

    test.skip(
      !otherMembershipBefore,
      "Hace falta al menos una organization_membership de otro tenant en Supabase local para validar ID ajeno.",
    );

    const ownerClient = await createRuntimeClient(ownerCredentials!);
    const foreignUpdate = await ownerClient
      .from("organization_memberships")
      .update({
        role: "coach",
        status: "inactive",
      })
      .eq("id", otherMembershipBefore!.id)
      .eq("organization_id", organizationId!)
      .select("id, organization_id, role, status, user_id");

    expectNoMembershipPermissionDenied(
      foreignUpdate.error,
      "cross-tenant scoped update should not fail because of missing table grants",
    );
    expect(foreignUpdate.error).toBeNull();
    expect(foreignUpdate.data ?? []).toHaveLength(0);

    const otherMembershipAfter = getMembershipSnapshotById(
      otherMembershipBefore!.id,
    );

    expect(otherMembershipAfter).toMatchObject({
      id: otherMembershipBefore!.id,
      invitedAt: otherMembershipBefore!.invitedAt,
      joinedAt: otherMembershipBefore!.joinedAt,
      organizationId: otherMembershipBefore!.organizationId,
      role: otherMembershipBefore!.role,
      status: otherMembershipBefore!.status,
      userId: otherMembershipBefore!.userId,
    });
  });
});
