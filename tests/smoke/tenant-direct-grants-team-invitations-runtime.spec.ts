import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";

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
import type { Database } from "../../src/types/supabase";

const runtimeInvitationPrefix =
  "e2e-direct-grants-team-invitations-smoke";
const localDbContainer = "supabase_db_boxops";

type TeamInvitationError = {
  code?: string;
  details?: string | null;
  hint?: string | null;
  message?: string;
};

type TeamInvitationSnapshot = {
  coachProfileId: string | null;
  emailNormalized: string;
  id: string;
  initialAccessStatus: string;
  lastError: string | null;
  lastSentAt: string | null;
  organizationId: string;
  personProfileId: string;
  providerMessageId: string | null;
  role: string;
  sendCount: number;
  sentAt: string | null;
  status: string;
  tokenHash: string;
  updatedAt: string;
};

type InvitationSupport = {
  coachProfileId: string;
  personProfileId: string;
};

type InvitationActor = {
  membershipId: string;
  userId: string;
};

const teamAccessCredentials = hasCredentials(ownerCredentials)
  ? ownerCredentials
  : adminCredentials;

const hasRuntimeConfig = Boolean(
  supabaseUrl &&
    supabaseAnonKey &&
    organizationId &&
    hasCredentials(teamAccessCredentials) &&
    hasCredentials(coachCredentials),
);

function getErrorText(error: TeamInvitationError | null) {
  if (!error) {
    return "";
  }

  return [error.code, error.message, error.details, error.hint]
    .filter(Boolean)
    .join(" ");
}

function expectNoTeamInvitationPermissionDenied(
  error: TeamInvitationError | null,
  context: string,
) {
  expect(getErrorText(error), context).not.toMatch(
    /permission denied for table team_invitations/i,
  );
}

function getRuntimeStamp() {
  return new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
}

function getSyntheticSuffix() {
  return `${getRuntimeStamp()}-${randomUUID().slice(0, 8)}`;
}

function getSyntheticEmail(purpose: string) {
  return `${runtimeInvitationPrefix}-${purpose}-${getSyntheticSuffix()}@example.test`;
}

function getSyntheticTokenHash(purpose: string) {
  return createHash("sha256")
    .update(`${runtimeInvitationPrefix}:${purpose}:${getSyntheticSuffix()}`)
    .digest("hex");
}

function getFutureExpiryIso() {
  return new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
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

function getTeamInvitationSnapshotSelect() {
  return `
    id,
    organization_id,
    email_normalized,
    person_profile_id,
    coach_profile_id,
    role,
    initial_access_status,
    status,
    sent_at,
    last_sent_at,
    send_count::text,
    provider_message_id,
    replace(replace(last_error, E'\\t', ' '), E'\\n', ' ') as last_error,
    token_hash,
    updated_at
  `;
}

function readTeamInvitationSnapshot(
  sql: string,
): TeamInvitationSnapshot | null {
  const output = readPsqlValue(sql);

  if (!output) {
    return null;
  }

  const [
    id,
    snapshotOrganizationId,
    emailNormalized,
    personProfileId,
    coachProfileId,
    role,
    initialAccessStatus,
    status,
    sentAt,
    lastSentAt,
    sendCount,
    providerMessageId,
    lastError,
    tokenHash,
    updatedAt,
  ] = output.split("\t");

  if (
    !id ||
    !snapshotOrganizationId ||
    !emailNormalized ||
    !personProfileId ||
    !role ||
    !initialAccessStatus ||
    !status ||
    !sendCount ||
    !tokenHash ||
    !updatedAt
  ) {
    return null;
  }

  return {
    coachProfileId: normalizeNullablePsqlValue(coachProfileId),
    emailNormalized,
    id,
    initialAccessStatus,
    lastError: normalizeNullablePsqlValue(lastError),
    lastSentAt: normalizeNullablePsqlValue(lastSentAt),
    organizationId: snapshotOrganizationId,
    personProfileId,
    providerMessageId: normalizeNullablePsqlValue(providerMessageId),
    role,
    sendCount: Number(sendCount),
    sentAt: normalizeNullablePsqlValue(sentAt),
    status,
    tokenHash,
    updatedAt,
  };
}

function getTeamInvitationSnapshotById(invitationId: string) {
  return readTeamInvitationSnapshot(`
    select ${getTeamInvitationSnapshotSelect()}
    from public.team_invitations
    where id = '${toSqlUuid(invitationId)}'::uuid
    limit 1;
  `);
}

function createSyntheticOtherTenantInvitationSnapshot() {
  const suffix = getSyntheticSuffix();
  const displayName = `${runtimeInvitationPrefix}-foreign-person-${suffix}`;
  const email = getSyntheticEmail("foreign");
  const notes = `${runtimeInvitationPrefix}-foreign-coach-${suffix}`;
  const tokenHash = getSyntheticTokenHash("foreign");

  return readTeamInvitationSnapshot(`
    with foreign_org as (
      select id
      from public.organizations
      where id <> '${toSqlUuid(organizationId!)}'::uuid
      order by created_at
      limit 1
    ),
    person as (
      insert into public.person_profiles (
        display_name,
        metadata,
        organization_id,
        status,
        visibility_status
      )
      select
        '${toSqlText(displayName)}',
        jsonb_build_object(
          'smoke_key',
          '${toSqlText(runtimeInvitationPrefix)}',
          'purpose',
          'foreign-team-invitation'
        ),
        id,
        'active',
        'visible'
      from foreign_org
      returning id, organization_id
    ),
    coach as (
      insert into public.coach_profiles (
        metadata,
        notes,
        organization_id,
        person_profile_id,
        status,
        weekly_contracted_hours
      )
      select
        jsonb_build_object(
          'smoke_key',
          '${toSqlText(runtimeInvitationPrefix)}',
          'purpose',
          'foreign-team-invitation'
        ),
        '${toSqlText(notes)}',
        organization_id,
        id,
        'active',
        1.0
      from person
      returning id, organization_id, person_profile_id
    ),
    invitation as (
      insert into public.team_invitations (
        coach_profile_id,
        email,
        email_normalized,
        expires_at,
        initial_access_status,
        organization_id,
        person_profile_id,
        role,
        status,
        token_hash
      )
      select
        id,
        '${toSqlText(email)}',
        '${toSqlText(email)}',
        now() + interval '14 days',
        'active',
        organization_id,
        person_profile_id,
        'coach',
        'pending',
        '${toSqlText(tokenHash)}'
      from coach
      returning *
    )
    select ${getTeamInvitationSnapshotSelect()}
    from invitation
    limit 1;
  `);
}

async function getCurrentInvitationActor(
  client: Awaited<ReturnType<typeof createRuntimeClient>>,
): Promise<InvitationActor | null> {
  const {
    data: { user },
    error: userError,
  } = await client.auth.getUser();

  expect(userError).toBeNull();

  if (!user?.id) {
    return null;
  }

  const membershipResult = await client
    .from("organization_memberships")
    .select("id, user_id")
    .eq("organization_id", organizationId!)
    .eq("user_id", user.id)
    .eq("status", "active")
    .in("role", ["owner", "admin"])
    .maybeSingle();

  expect(membershipResult.error).toBeNull();

  return membershipResult.data
    ? {
        membershipId: membershipResult.data.id,
        userId: membershipResult.data.user_id,
      }
    : null;
}

async function createSyntheticInvitationSupport(
  client: Awaited<ReturnType<typeof createRuntimeClient>>,
  purpose: string,
): Promise<InvitationSupport> {
  const suffix = getSyntheticSuffix();
  const personResult = await client
    .from("person_profiles")
    .insert({
      display_name: `${runtimeInvitationPrefix}-person-${purpose}-${suffix}`,
      metadata: { purpose, smoke_key: runtimeInvitationPrefix },
      organization_id: organizationId!,
      status: "active",
      visibility_status: "visible",
    })
    .select("id")
    .single();

  expect(personResult.error).toBeNull();
  expect(personResult.data?.id).toBeTruthy();

  const coachResult = await client
    .from("coach_profiles")
    .insert({
      metadata: { purpose, smoke_key: runtimeInvitationPrefix },
      notes: `${runtimeInvitationPrefix}-coach-${purpose}-${suffix}`,
      organization_id: organizationId!,
      person_profile_id: personResult.data!.id,
      primary_center_id: null,
      status: "active",
      weekly_contracted_hours: 1,
    })
    .select("id")
    .single();

  expect(coachResult.error).toBeNull();
  expect(coachResult.data?.id).toBeTruthy();

  return {
    coachProfileId: coachResult.data!.id,
    personProfileId: personResult.data!.id,
  };
}

test.describe.serial("tenant direct grants runtime smoke: team_invitations", () => {
  test.skip(
    !hasRuntimeConfig,
    "Configura Supabase local, E2E_OWNER_* o E2E_ADMIN_*, E2E_COACH_* y E2E_ORGANIZATION_ID para ejecutar el smoke runtime de team_invitations.",
  );

  test("authorized owner/admin can insert and safely update a tenant team invitation without email delivery", async () => {
    const teamAccessClient = await createRuntimeClient(teamAccessCredentials!);
    const actor = await getCurrentInvitationActor(teamAccessClient);

    test.skip(
      !actor,
      "La credencial de gestion debe tener membership activa owner/admin en el tenant E2E para insertar team_invitations.",
    );

    const support = await createSyntheticInvitationSupport(
      teamAccessClient,
      "owner-admin-happy-path",
    );
    const email = getSyntheticEmail("owner-admin-happy");
    const tokenHash = getSyntheticTokenHash("owner-admin-happy");
    const insertResult = await teamAccessClient
      .from("team_invitations")
      .insert({
        coach_profile_id: support.coachProfileId,
        email,
        email_normalized: email,
        expires_at: getFutureExpiryIso(),
        initial_access_status: "active",
        invited_by_membership_id: actor!.membershipId,
        invited_by_user_id: actor!.userId,
        organization_id: organizationId!,
        person_profile_id: support.personProfileId,
        role: "coach",
        status: "pending",
        token_hash: tokenHash,
      })
      .select(
        "id, coach_profile_id, email_normalized, initial_access_status, last_error, last_sent_at, organization_id, person_profile_id, provider_message_id, role, send_count, sent_at, status, token_hash",
      )
      .single();

    expectNoTeamInvitationPermissionDenied(
      insertResult.error,
      "owner/admin baseline insert should not fail because of direct table grants",
    );
    expect(insertResult.error).toBeNull();
    expect(insertResult.data).toMatchObject({
      coach_profile_id: support.coachProfileId,
      email_normalized: email,
      initial_access_status: "active",
      last_error: null,
      last_sent_at: null,
      organization_id: organizationId,
      person_profile_id: support.personProfileId,
      provider_message_id: null,
      role: "coach",
      send_count: 0,
      sent_at: null,
      status: "pending",
      token_hash: tokenHash,
    });

    const invitationId = insertResult.data?.id;

    expect(invitationId).toBeTruthy();

    const syntheticLastError = `${runtimeInvitationPrefix}-synthetic-email-not-sent-${getSyntheticSuffix()}`;
    const updateResult = await teamAccessClient
      .from("team_invitations")
      .update({
        last_error: syntheticLastError,
        status: "failed",
      })
      .eq("id", invitationId!)
      .eq("organization_id", organizationId!)
      .select(
        "id, coach_profile_id, email_normalized, initial_access_status, last_error, last_sent_at, organization_id, person_profile_id, provider_message_id, role, send_count, sent_at, status, token_hash",
      )
      .single();

    expectNoTeamInvitationPermissionDenied(
      updateResult.error,
      "owner/admin baseline update should not fail because of direct table grants",
    );
    expect(updateResult.error).toBeNull();
    expect(updateResult.data).toMatchObject({
      coach_profile_id: support.coachProfileId,
      email_normalized: email,
      id: invitationId,
      initial_access_status: "active",
      last_error: syntheticLastError,
      last_sent_at: null,
      organization_id: organizationId,
      person_profile_id: support.personProfileId,
      provider_message_id: null,
      role: "coach",
      send_count: 0,
      sent_at: null,
      status: "failed",
      token_hash: tokenHash,
    });

    const invitationSnapshot = getTeamInvitationSnapshotById(invitationId!);

    expect(invitationSnapshot).toMatchObject({
      coachProfileId: support.coachProfileId,
      emailNormalized: email,
      id: invitationId,
      initialAccessStatus: "active",
      lastError: syntheticLastError,
      lastSentAt: null,
      organizationId: organizationId,
      personProfileId: support.personProfileId,
      providerMessageId: null,
      role: "coach",
      sendCount: 0,
      sentAt: null,
      status: "failed",
      tokenHash,
    });
  });

  test("coach cannot insert team invitations through direct authenticated DML", async () => {
    const teamAccessClient = await createRuntimeClient(teamAccessCredentials!);
    const support = await createSyntheticInvitationSupport(
      teamAccessClient,
      "coach-denied",
    );

    const coachClient = await createRuntimeClient(coachCredentials!);
    const email = getSyntheticEmail("coach-denied");
    const deniedInsert = await coachClient
      .from("team_invitations")
      .insert({
        coach_profile_id: support.coachProfileId,
        email,
        email_normalized: email,
        expires_at: getFutureExpiryIso(),
        initial_access_status: "active",
        organization_id: organizationId!,
        person_profile_id: support.personProfileId,
        role: "coach",
        status: "pending",
        token_hash: getSyntheticTokenHash("coach-denied"),
      })
      .select("id");

    expectNoTeamInvitationPermissionDenied(
      deniedInsert.error,
      "coach denied insert should be an RLS/role denial, not a missing table grant",
    );
    expect(deniedInsert.error).toBeTruthy();
    expect(getErrorText(deniedInsert.error)).toMatch(
      /row-level security|violates row-level security|permission denied/i,
    );
    expect(deniedInsert.data ?? []).toHaveLength(0);
  });

  test("owner/admin cannot update a team invitation from another tenant when scoped to the active organization", async () => {
    const otherInvitationBefore = createSyntheticOtherTenantInvitationSnapshot();

    test.skip(
      !otherInvitationBefore,
      "Hace falta al menos otro tenant local para crear una team_invitations sintetica ajena y validar ID ajeno.",
    );

    const teamAccessClient = await createRuntimeClient(teamAccessCredentials!);
    const foreignUpdate = await teamAccessClient
      .from("team_invitations")
      .update({
        last_error: `${runtimeInvitationPrefix}-cross-tenant-${getSyntheticSuffix()}`,
        status: "cancelled",
      })
      .eq("id", otherInvitationBefore!.id)
      .eq("organization_id", organizationId!)
      .select("id, last_error, organization_id, status");

    expectNoTeamInvitationPermissionDenied(
      foreignUpdate.error,
      "cross-tenant scoped update should not fail because of missing table grants",
    );
    expect(foreignUpdate.error).toBeNull();
    expect(foreignUpdate.data ?? []).toHaveLength(0);

    const otherInvitationAfter = getTeamInvitationSnapshotById(
      otherInvitationBefore!.id,
    );

    expect(otherInvitationAfter).toMatchObject({
      coachProfileId: otherInvitationBefore!.coachProfileId,
      emailNormalized: otherInvitationBefore!.emailNormalized,
      id: otherInvitationBefore!.id,
      initialAccessStatus: otherInvitationBefore!.initialAccessStatus,
      lastError: otherInvitationBefore!.lastError,
      lastSentAt: otherInvitationBefore!.lastSentAt,
      organizationId: otherInvitationBefore!.organizationId,
      personProfileId: otherInvitationBefore!.personProfileId,
      providerMessageId: otherInvitationBefore!.providerMessageId,
      role: otherInvitationBefore!.role,
      sendCount: otherInvitationBefore!.sendCount,
      sentAt: otherInvitationBefore!.sentAt,
      status: otherInvitationBefore!.status,
      tokenHash: otherInvitationBefore!.tokenHash,
    });
  });
});
