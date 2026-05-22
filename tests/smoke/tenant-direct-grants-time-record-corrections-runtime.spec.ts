import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

import {
  adminCredentials,
  coachCredentials,
  hasCredentials,
  managerCredentials,
  organizationId,
  ownerCredentials,
  supabaseAnonKey,
  supabaseUrl,
  type SmokeCredentials,
} from "./helpers/env";
import type { Database, Json } from "../../src/types/supabase";

const runtimeCorrectionPrefix =
  "e2e-direct-grants-time-record-corrections-smoke";
const correctionSnapshotVersion = "boxops.time-correction.v1";
const localDbContainer = "supabase_db_boxops";

type TimeRecordCorrectionError = {
  code?: string;
  details?: string | null;
  hint?: string | null;
  message?: string;
};

type TimeRecordCorrectionActor = {
  membershipId: string;
  personProfileId: string | null;
  role: string;
  userId: string;
};

type TimeRecordFixture = {
  id: string;
  localWorkDate: string;
  organizationId: string;
  personProfileId: string;
  status: string;
  timezone: string;
};

type TimeRecordCorrectionSnapshot = {
  afterSnapshot: Json;
  appliedAt: string | null;
  beforeSnapshot: Json;
  correctionType: string;
  id: string;
  metadata: Json;
  organizationId: string;
  personProfileId: string;
  reason: string;
  requestedByMembershipId: string | null;
  requestedByPersonProfileId: string | null;
  requestedByUserId: string;
  reviewedAt: string | null;
  reviewedByMembershipId: string | null;
  reviewedByPersonProfileId: string | null;
  reviewedByUserId: string | null;
  reviewNote: string | null;
  status: string;
  timePunchId: string | null;
  timeRecordId: string;
  updatedAt: string;
};

const timeReviewCredentials = hasCredentials(ownerCredentials)
  ? ownerCredentials
  : hasCredentials(adminCredentials)
    ? adminCredentials
    : managerCredentials;

const hasRuntimeConfig = Boolean(
  supabaseUrl &&
    supabaseAnonKey &&
    organizationId &&
    hasCredentials(timeReviewCredentials) &&
    hasCredentials(coachCredentials),
);

function getErrorText(error: TimeRecordCorrectionError | null) {
  if (!error) {
    return "";
  }

  return [error.code, error.message, error.details, error.hint]
    .filter(Boolean)
    .join(" ");
}

function expectNoTimeRecordCorrectionPermissionDenied(
  error: TimeRecordCorrectionError | null,
  context: string,
) {
  expect(getErrorText(error), context).not.toMatch(
    /permission denied for table time_record_corrections/i,
  );
}

function getRuntimeStamp() {
  return new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
}

function getSyntheticMarker(purpose: string) {
  return `${runtimeCorrectionPrefix}-${purpose}-${getRuntimeStamp()}-${randomUUID().slice(0, 8)}`;
}

function getSyntheticReason(purpose: string) {
  return `${runtimeCorrectionPrefix}-${purpose}-${getRuntimeStamp()}`;
}

function getSyntheticMetadata(purpose: string, marker: string): Json {
  return {
    internalReviewOnly: true,
    legalFinal: false,
    marker,
    payroll: false,
    purpose: `${runtimeCorrectionPrefix}-${purpose}`,
    schemaVersion: correctionSnapshotVersion,
    smoke_key: runtimeCorrectionPrefix,
    source: runtimeCorrectionPrefix,
  };
}

function getBeforeSnapshot(record: TimeRecordFixture, marker: string): Json {
  return {
    marker,
    record: {
      id: record.id,
      localWorkDate: record.localWorkDate,
      status: record.status,
      timezone: record.timezone,
    },
    schemaVersion: correctionSnapshotVersion,
  };
}

function getAfterSnapshot(
  record: TimeRecordFixture,
  marker: string,
  note: string,
): Json {
  return {
    change: {
      note,
    },
    marker,
    record: {
      id: record.id,
      localWorkDate: record.localWorkDate,
      status: record.status,
      timezone: record.timezone,
    },
    schemaVersion: correctionSnapshotVersion,
    type: "record_update",
  };
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

function getCorrectionSnapshotSelect() {
  return `
    id,
    organization_id,
    time_record_id,
    time_punch_id,
    person_profile_id,
    correction_type,
    replace(replace(reason, E'\\t', ' '), E'\\n', ' ') as reason,
    status,
    replace(replace(before_snapshot::text, E'\\t', ' '), E'\\n', ' ') as before_snapshot,
    replace(replace(after_snapshot::text, E'\\t', ' '), E'\\n', ' ') as after_snapshot,
    requested_by_user_id,
    requested_by_membership_id,
    requested_by_person_profile_id,
    reviewed_by_user_id,
    reviewed_by_membership_id,
    reviewed_by_person_profile_id,
    reviewed_at,
    replace(replace(review_note, E'\\t', ' '), E'\\n', ' ') as review_note,
    applied_at,
    replace(replace(metadata::text, E'\\t', ' '), E'\\n', ' ') as metadata,
    updated_at
  `;
}

function readCorrectionSnapshot(
  sql: string,
): TimeRecordCorrectionSnapshot | null {
  const output = readPsqlValue(sql);

  if (!output) {
    return null;
  }

  const [
    id,
    snapshotOrganizationId,
    timeRecordId,
    timePunchId,
    personProfileId,
    correctionType,
    reason,
    status,
    beforeSnapshot,
    afterSnapshot,
    requestedByUserId,
    requestedByMembershipId,
    requestedByPersonProfileId,
    reviewedByUserId,
    reviewedByMembershipId,
    reviewedByPersonProfileId,
    reviewedAt,
    reviewNote,
    appliedAt,
    metadata,
    updatedAt,
  ] = output.split("\t");

  if (
    !id ||
    !snapshotOrganizationId ||
    !timeRecordId ||
    !personProfileId ||
    !correctionType ||
    !reason ||
    !status ||
    !beforeSnapshot ||
    !afterSnapshot ||
    !requestedByUserId ||
    !metadata ||
    !updatedAt
  ) {
    return null;
  }

  return {
    afterSnapshot: JSON.parse(afterSnapshot) as Json,
    appliedAt: normalizeNullablePsqlValue(appliedAt),
    beforeSnapshot: JSON.parse(beforeSnapshot) as Json,
    correctionType,
    id,
    metadata: JSON.parse(metadata) as Json,
    organizationId: snapshotOrganizationId,
    personProfileId,
    reason,
    requestedByMembershipId: normalizeNullablePsqlValue(
      requestedByMembershipId,
    ),
    requestedByPersonProfileId: normalizeNullablePsqlValue(
      requestedByPersonProfileId,
    ),
    requestedByUserId,
    reviewedAt: normalizeNullablePsqlValue(reviewedAt),
    reviewedByMembershipId: normalizeNullablePsqlValue(reviewedByMembershipId),
    reviewedByPersonProfileId: normalizeNullablePsqlValue(
      reviewedByPersonProfileId,
    ),
    reviewedByUserId: normalizeNullablePsqlValue(reviewedByUserId),
    reviewNote: normalizeNullablePsqlValue(reviewNote),
    status,
    timePunchId: normalizeNullablePsqlValue(timePunchId),
    timeRecordId,
    updatedAt,
  };
}

function getCorrectionSnapshotById(correctionId: string) {
  return readCorrectionSnapshot(`
    select ${getCorrectionSnapshotSelect()}
    from public.time_record_corrections
    where id = '${toSqlUuid(correctionId)}'::uuid
    limit 1;
  `);
}

function readTimeRecordFixture(sql: string): TimeRecordFixture | null {
  const output = readPsqlValue(sql);

  if (!output) {
    return null;
  }

  const [
    id,
    snapshotOrganizationId,
    personProfileId,
    localWorkDate,
    timezone,
    status,
  ] = output.split("\t");

  if (
    !id ||
    !snapshotOrganizationId ||
    !personProfileId ||
    !localWorkDate ||
    !timezone ||
    !status
  ) {
    return null;
  }

  return {
    id,
    localWorkDate,
    organizationId: snapshotOrganizationId,
    personProfileId,
    status,
    timezone,
  };
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

async function getCurrentCorrectionActor({
  allowedRoles,
  client,
}: {
  allowedRoles: string[];
  client: Awaited<ReturnType<typeof createRuntimeClient>>;
}): Promise<TimeRecordCorrectionActor | null> {
  const userId = await getSignedInUserId(client);
  const rolesSql = allowedRoles.map((role) => `'${toSqlText(role)}'`).join(",");
  const output = readPsqlValue(`
    select
      membership.id,
      membership.role,
      membership.user_id,
      person_profile.id
    from public.organization_memberships membership
    left join public.person_profiles person_profile
      on person_profile.organization_id = membership.organization_id
      and person_profile.user_id = membership.user_id
      and person_profile.status = 'active'
    where membership.organization_id = '${toSqlUuid(organizationId!)}'::uuid
      and membership.user_id = '${toSqlUuid(userId)}'::uuid
      and membership.status = 'active'
      and membership.role in (${rolesSql})
    order by membership.created_at
    limit 1;
  `);

  if (!output) {
    return null;
  }

  const [membershipId, role, actorUserId, personProfileId] =
    output.split("\t");

  if (!membershipId || !role || !actorUserId) {
    return null;
  }

  return {
    membershipId,
    personProfileId: normalizeNullablePsqlValue(personProfileId),
    role,
    userId: actorUserId,
  };
}

function createSyntheticOwnTimeRecordFixture({
  actor,
  purpose,
}: {
  actor: TimeRecordCorrectionActor;
  purpose: string;
}) {
  const marker = getSyntheticMarker(purpose);

  if (!actor.personProfileId) {
    return null;
  }

  return readTimeRecordFixture(`
    with candidate_date as (
      select candidate_date::date as local_work_date
      from generate_series(
        date '2037-01-01',
        date '2057-12-31',
        interval '1 day'
      ) as candidates(candidate_date)
      where not exists (
        select 1
        from public.time_records existing_record
        where existing_record.organization_id = '${toSqlUuid(organizationId!)}'::uuid
          and existing_record.person_profile_id = '${toSqlUuid(actor.personProfileId)}'::uuid
          and existing_record.local_work_date = candidate_date::date
      )
      order by candidate_date
      limit 1
    ),
    inserted as (
      insert into public.time_records (
        organization_id,
        person_profile_id,
        local_work_date,
        timezone,
        status,
        created_by_user_id,
        created_by_membership_id,
        metadata
      )
      select
        '${toSqlUuid(organizationId!)}'::uuid,
        '${toSqlUuid(actor.personProfileId)}'::uuid,
        local_work_date,
        'Europe/Madrid',
        'open',
        '${toSqlUuid(actor.userId)}'::uuid,
        '${toSqlUuid(actor.membershipId)}'::uuid,
        jsonb_build_object(
          'marker',
          '${toSqlText(marker)}',
          'purpose',
          '${toSqlText(runtimeCorrectionPrefix)}-${toSqlText(purpose)}',
          'smoke_key',
          '${toSqlText(runtimeCorrectionPrefix)}',
          'source',
          '${toSqlText(runtimeCorrectionPrefix)}'
        )
      from candidate_date
      returning id, organization_id, person_profile_id, local_work_date, timezone, status
    )
    select id, organization_id, person_profile_id, local_work_date, timezone, status
    from inserted
    limit 1;
  `);
}

async function insertOwnPendingCorrection({
  actor,
  client,
  purpose,
  record,
}: {
  actor: TimeRecordCorrectionActor;
  client: Awaited<ReturnType<typeof createRuntimeClient>>;
  purpose: string;
  record: TimeRecordFixture;
}) {
  const marker = getSyntheticMarker(purpose);
  const reason = getSyntheticReason(purpose);
  const note = getSyntheticReason(`${purpose}-note`);
  const insertResult = await client
    .from("time_record_corrections")
    .insert({
      after_snapshot: getAfterSnapshot(record, marker, note),
      before_snapshot: getBeforeSnapshot(record, marker),
      correction_type: "record_update",
      metadata: getSyntheticMetadata(purpose, marker),
      organization_id: organizationId!,
      person_profile_id: actor.personProfileId!,
      reason,
      requested_by_membership_id: actor.membershipId,
      requested_by_person_profile_id: actor.personProfileId,
      requested_by_user_id: actor.userId,
      status: "pending",
      time_punch_id: null,
      time_record_id: record.id,
    })
    .select(
      "id, applied_at, correction_type, metadata, organization_id, person_profile_id, reason, requested_by_membership_id, requested_by_person_profile_id, requested_by_user_id, reviewed_at, reviewed_by_membership_id, reviewed_by_person_profile_id, reviewed_by_user_id, review_note, status, time_punch_id, time_record_id",
    )
    .single();

  expectNoTimeRecordCorrectionPermissionDenied(
    insertResult.error,
    "coach own correction insert should not fail because of direct table grants",
  );
  expect(insertResult.error).toBeNull();
  expect(insertResult.data).toMatchObject({
    applied_at: null,
    correction_type: "record_update",
    organization_id: organizationId,
    person_profile_id: actor.personProfileId,
    reason,
    requested_by_membership_id: actor.membershipId,
    requested_by_person_profile_id: actor.personProfileId,
    requested_by_user_id: actor.userId,
    reviewed_at: null,
    reviewed_by_membership_id: null,
    reviewed_by_person_profile_id: null,
    reviewed_by_user_id: null,
    review_note: null,
    status: "pending",
    time_punch_id: null,
    time_record_id: record.id,
  });
  expect(insertResult.data?.metadata).toMatchObject({
    marker,
    smoke_key: runtimeCorrectionPrefix,
  });

  return insertResult.data!;
}

function createSyntheticOtherTenantCorrectionSnapshot() {
  const marker = getSyntheticMarker("foreign");
  const reason = getSyntheticReason("foreign");
  const displayName = getSyntheticReason("foreign-person");

  return readCorrectionSnapshot(`
    with foreign_membership as (
      select
        membership.id as membership_id,
        membership.organization_id,
        membership.user_id
      from public.organization_memberships membership
      where membership.organization_id <> '${toSqlUuid(organizationId!)}'::uuid
        and membership.status = 'active'
      order by membership.created_at
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
          'marker',
          '${toSqlText(marker)}',
          'purpose',
          '${toSqlText(runtimeCorrectionPrefix)}-foreign-person',
          'smoke_key',
          '${toSqlText(runtimeCorrectionPrefix)}',
          'source',
          '${toSqlText(runtimeCorrectionPrefix)}'
        ),
        organization_id,
        'active',
        'visible'
      from foreign_membership
      returning id, organization_id
    ),
    inserted_record as (
      insert into public.time_records (
        organization_id,
        person_profile_id,
        local_work_date,
        timezone,
        status,
        created_by_user_id,
        created_by_membership_id,
        metadata
      )
      select
        person.organization_id,
        person.id,
        date '2038-01-01',
        'Europe/Madrid',
        'open',
        foreign_membership.user_id,
        foreign_membership.membership_id,
        jsonb_build_object(
          'marker',
          '${toSqlText(marker)}',
          'purpose',
          '${toSqlText(runtimeCorrectionPrefix)}-foreign-record',
          'smoke_key',
          '${toSqlText(runtimeCorrectionPrefix)}',
          'source',
          '${toSqlText(runtimeCorrectionPrefix)}'
        )
      from person
      cross join foreign_membership
      returning id, organization_id, person_profile_id, local_work_date, timezone, status
    ),
    inserted_correction as (
      insert into public.time_record_corrections (
        organization_id,
        time_record_id,
        time_punch_id,
        person_profile_id,
        correction_type,
        reason,
        status,
        before_snapshot,
        after_snapshot,
        requested_by_user_id,
        requested_by_membership_id,
        requested_by_person_profile_id,
        metadata
      )
      select
        inserted_record.organization_id,
        inserted_record.id,
        null,
        inserted_record.person_profile_id,
        'record_update',
        '${toSqlText(reason)}',
        'pending',
        jsonb_build_object(
          'marker',
          '${toSqlText(marker)}',
          'record',
          jsonb_build_object(
            'id',
            inserted_record.id,
            'localWorkDate',
            inserted_record.local_work_date::text,
            'status',
            inserted_record.status,
            'timezone',
            inserted_record.timezone
          ),
          'schemaVersion',
          '${toSqlText(correctionSnapshotVersion)}'
        ),
        jsonb_build_object(
          'change',
          jsonb_build_object('note', '${toSqlText(reason)}'),
          'marker',
          '${toSqlText(marker)}',
          'record',
          jsonb_build_object(
            'id',
            inserted_record.id,
            'localWorkDate',
            inserted_record.local_work_date::text,
            'status',
            inserted_record.status,
            'timezone',
            inserted_record.timezone
          ),
          'schemaVersion',
          '${toSqlText(correctionSnapshotVersion)}',
          'type',
          'record_update'
        ),
        foreign_membership.user_id,
        foreign_membership.membership_id,
        inserted_record.person_profile_id,
        jsonb_build_object(
          'marker',
          '${toSqlText(marker)}',
          'purpose',
          '${toSqlText(runtimeCorrectionPrefix)}-foreign-correction',
          'schemaVersion',
          '${toSqlText(correctionSnapshotVersion)}',
          'smoke_key',
          '${toSqlText(runtimeCorrectionPrefix)}',
          'source',
          '${toSqlText(runtimeCorrectionPrefix)}'
        )
      from inserted_record
      cross join foreign_membership
      returning *
    )
    select ${getCorrectionSnapshotSelect()}
    from inserted_correction
    limit 1;
  `);
}

test.describe.serial(
  "tenant direct grants runtime smoke: time_record_corrections",
  () => {
    test.skip(
      !hasRuntimeConfig,
      "Configura Supabase local, E2E_OWNER_*/E2E_ADMIN_*/E2E_MANAGER_*, E2E_COACH_*, E2E_ORGANIZATION_ID, URL y anon key para ejecutar el smoke runtime de time_record_corrections.",
    );

    test("coach can request an own correction and owner/admin/manager can review it through app-like direct DML", async () => {
      const coachClient = await createRuntimeClient(coachCredentials!);
      const reviewClient = await createRuntimeClient(timeReviewCredentials!);
      const coachActor = await getCurrentCorrectionActor({
        allowedRoles: ["coach"],
        client: coachClient,
      });
      const reviewActor = await getCurrentCorrectionActor({
        allowedRoles: ["owner", "admin", "manager"],
        client: reviewClient,
      });

      test.skip(
        !coachActor?.personProfileId,
        "La credencial E2E_COACH debe tener membership activa coach y person_profile propio activo para solicitar correcciones propias.",
      );
      test.skip(
        !reviewActor,
        "La credencial de gestion debe tener membership activa owner/admin/manager en el tenant E2E para revisar correcciones.",
      );

      const timeRecord = createSyntheticOwnTimeRecordFixture({
        actor: coachActor!,
        purpose: "coach-own-authorized-record",
      });

      test.skip(
        !timeRecord,
        "No se pudo crear un time_record sintetico seguro para la persona coach sin tocar fichajes reales.",
      );

      const correction = await insertOwnPendingCorrection({
        actor: coachActor!,
        client: coachClient,
        purpose: "coach-own-authorized-correction",
        record: timeRecord!,
      });
      const reviewNote = getSyntheticReason("manager-review-rejected");
      const updateResult = await reviewClient
        .from("time_record_corrections")
        .update({
          review_note: reviewNote,
          status: "rejected",
        })
        .eq("id", correction.id)
        .eq("organization_id", organizationId!)
        .select(
          "id, applied_at, organization_id, requested_by_membership_id, requested_by_person_profile_id, requested_by_user_id, reviewed_at, reviewed_by_membership_id, reviewed_by_person_profile_id, reviewed_by_user_id, review_note, status",
        )
        .single();

      expectNoTimeRecordCorrectionPermissionDenied(
        updateResult.error,
        "owner/admin/manager review update should not fail because of direct table grants",
      );
      expect(updateResult.error).toBeNull();
      expect(updateResult.data).toMatchObject({
        applied_at: null,
        id: correction.id,
        organization_id: organizationId,
        requested_by_membership_id: coachActor!.membershipId,
        requested_by_person_profile_id: coachActor!.personProfileId,
        requested_by_user_id: coachActor!.userId,
        reviewed_by_membership_id: reviewActor!.membershipId,
        reviewed_by_user_id: reviewActor!.userId,
        review_note: reviewNote,
        status: "rejected",
      });
      expect(updateResult.data?.reviewed_at).toBeTruthy();

      const correctionSnapshot = getCorrectionSnapshotById(correction.id);

      expect(correctionSnapshot).toMatchObject({
        appliedAt: null,
        correctionType: "record_update",
        id: correction.id,
        organizationId: organizationId,
        personProfileId: coachActor!.personProfileId,
        requestedByMembershipId: coachActor!.membershipId,
        requestedByPersonProfileId: coachActor!.personProfileId,
        requestedByUserId: coachActor!.userId,
        reviewedByMembershipId: reviewActor!.membershipId,
        reviewedByUserId: reviewActor!.userId,
        reviewNote,
        status: "rejected",
        timePunchId: null,
        timeRecordId: timeRecord!.id,
      });
      expect(correctionSnapshot?.reviewedAt).toBeTruthy();
      expect(correctionSnapshot?.metadata).toMatchObject({
        smoke_key: runtimeCorrectionPrefix,
      });
    });

    test("coach cannot review a pending correction through direct authenticated update", async () => {
      const coachClient = await createRuntimeClient(coachCredentials!);
      const coachActor = await getCurrentCorrectionActor({
        allowedRoles: ["coach"],
        client: coachClient,
      });

      test.skip(
        !coachActor?.personProfileId,
        "La credencial E2E_COACH debe tener membership activa coach y person_profile propio activo para validar el negativo de revision.",
      );

      const timeRecord = createSyntheticOwnTimeRecordFixture({
        actor: coachActor!,
        purpose: "coach-denied-review-record",
      });

      test.skip(
        !timeRecord,
        "No se pudo crear un time_record sintetico seguro para la persona coach sin tocar fichajes reales.",
      );

      const correction = await insertOwnPendingCorrection({
        actor: coachActor!,
        client: coachClient,
        purpose: "coach-denied-review-correction",
        record: timeRecord!,
      });
      const correctionBefore = getCorrectionSnapshotById(correction.id);

      expect(correctionBefore).toMatchObject({
        id: correction.id,
        status: "pending",
      });

      const deniedReviewNote = getSyntheticReason("coach-denied-review");
      const deniedUpdate = await coachClient
        .from("time_record_corrections")
        .update({
          review_note: deniedReviewNote,
          status: "rejected",
        })
        .eq("id", correction.id)
        .eq("organization_id", organizationId!)
        .select("id, reviewed_at, review_note, status");

      expectNoTimeRecordCorrectionPermissionDenied(
        deniedUpdate.error,
        "coach denied review update should be an RLS/role denial or empty scoped update, not a missing table grant",
      );

      if (deniedUpdate.error) {
        expect(getErrorText(deniedUpdate.error)).toMatch(
          /row-level security|violates row-level security|time correction review permission required|permission denied/i,
        );
      } else {
        expect(deniedUpdate.data ?? []).toHaveLength(0);
      }

      const correctionAfter = getCorrectionSnapshotById(correction.id);

      expect(correctionAfter).toMatchObject({
        afterSnapshot: correctionBefore!.afterSnapshot,
        appliedAt: null,
        beforeSnapshot: correctionBefore!.beforeSnapshot,
        correctionType: correctionBefore!.correctionType,
        id: correctionBefore!.id,
        metadata: correctionBefore!.metadata,
        organizationId: correctionBefore!.organizationId,
        personProfileId: correctionBefore!.personProfileId,
        reason: correctionBefore!.reason,
        requestedByMembershipId: correctionBefore!.requestedByMembershipId,
        requestedByPersonProfileId: correctionBefore!.requestedByPersonProfileId,
        requestedByUserId: correctionBefore!.requestedByUserId,
        reviewedAt: null,
        reviewedByMembershipId: null,
        reviewedByPersonProfileId: null,
        reviewedByUserId: null,
        reviewNote: null,
        status: "pending",
        timePunchId: null,
        timeRecordId: correctionBefore!.timeRecordId,
      });
    });

    test("owner/admin/manager cannot update a correction from another tenant when scoped to the active organization", async () => {
      const otherCorrectionBefore =
        createSyntheticOtherTenantCorrectionSnapshot();

      test.skip(
        !otherCorrectionBefore,
        "Hace falta al menos una membership activa en otro tenant local para crear una time_record_corrections sintetica ajena y validar ID ajeno.",
      );

      const reviewClient = await createRuntimeClient(timeReviewCredentials!);
      const attemptedReviewNote = getSyntheticReason("cross-tenant-review");
      const foreignUpdate = await reviewClient
        .from("time_record_corrections")
        .update({
          review_note: attemptedReviewNote,
          status: "rejected",
        })
        .eq("id", otherCorrectionBefore!.id)
        .eq("organization_id", organizationId!)
        .select("id, organization_id, review_note, status");

      expectNoTimeRecordCorrectionPermissionDenied(
        foreignUpdate.error,
        "cross-tenant scoped update should not fail because of missing table grants",
      );
      expect(foreignUpdate.error).toBeNull();
      expect(foreignUpdate.data ?? []).toHaveLength(0);

      const otherCorrectionAfter = getCorrectionSnapshotById(
        otherCorrectionBefore!.id,
      );

      expect(otherCorrectionAfter).toMatchObject({
        afterSnapshot: otherCorrectionBefore!.afterSnapshot,
        appliedAt: otherCorrectionBefore!.appliedAt,
        beforeSnapshot: otherCorrectionBefore!.beforeSnapshot,
        correctionType: otherCorrectionBefore!.correctionType,
        id: otherCorrectionBefore!.id,
        metadata: otherCorrectionBefore!.metadata,
        organizationId: otherCorrectionBefore!.organizationId,
        personProfileId: otherCorrectionBefore!.personProfileId,
        reason: otherCorrectionBefore!.reason,
        requestedByMembershipId:
          otherCorrectionBefore!.requestedByMembershipId,
        requestedByPersonProfileId:
          otherCorrectionBefore!.requestedByPersonProfileId,
        requestedByUserId: otherCorrectionBefore!.requestedByUserId,
        reviewedAt: otherCorrectionBefore!.reviewedAt,
        reviewedByMembershipId:
          otherCorrectionBefore!.reviewedByMembershipId,
        reviewedByPersonProfileId:
          otherCorrectionBefore!.reviewedByPersonProfileId,
        reviewedByUserId: otherCorrectionBefore!.reviewedByUserId,
        reviewNote: otherCorrectionBefore!.reviewNote,
        status: otherCorrectionBefore!.status,
        timePunchId: otherCorrectionBefore!.timePunchId,
        timeRecordId: otherCorrectionBefore!.timeRecordId,
      });
    });
  },
);
