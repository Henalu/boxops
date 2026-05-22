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

const runtimeTimeExportPrefix = "e2e-direct-grants-time-exports-smoke";
const runtimeTimeExportDateFrom = "2027-01-05";
const runtimeTimeExportDateTo = "2027-01-06";
const localDbContainer = "supabase_db_boxops";

type TimeExportError = {
  code?: string;
  details?: string | null;
  hint?: string | null;
  message?: string;
};

type TimeExportSnapshot = {
  centerId: string | null;
  dateFrom: string;
  dateTo: string;
  exportFormat: string;
  exportScope: string;
  failureReason: string | null;
  generatedAt: string | null;
  id: string;
  metadata: Json;
  organizationId: string;
  personProfileId: string | null;
  requestedByMembershipId: string | null;
  requestedByUserId: string;
  rowCount: number | null;
  status: string;
  updatedAt: string;
};

type TimeExportActor = {
  membershipId: string;
  role: string;
  userId: string;
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

function getErrorText(error: TimeExportError | null) {
  if (!error) {
    return "";
  }

  return [error.code, error.message, error.details, error.hint]
    .filter(Boolean)
    .join(" ");
}

function expectNoTimeExportPermissionDenied(
  error: TimeExportError | null,
  context: string,
) {
  expect(getErrorText(error), context).not.toMatch(
    /permission denied for table time_exports/i,
  );
}

function getRuntimeStamp() {
  return new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
}

function getSyntheticMarker(purpose: string) {
  return `${runtimeTimeExportPrefix}-${purpose}-${getRuntimeStamp()}-${randomUUID().slice(0, 8)}`;
}

function getSyntheticMetadata(purpose: string, marker: string): Json {
  return {
    internalReviewOnly: true,
    legalFinal: false,
    marker,
    noFileGenerated: true,
    payroll: false,
    purpose: `${runtimeTimeExportPrefix}-${purpose}`,
    smoke_key: runtimeTimeExportPrefix,
    source: runtimeTimeExportPrefix,
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

function getTimeExportSnapshotSelect() {
  return `
    id,
    organization_id,
    requested_by_user_id,
    requested_by_membership_id,
    date_from,
    date_to,
    person_profile_id,
    center_id,
    export_format,
    export_scope,
    status,
    row_count::text,
    generated_at,
    replace(replace(failure_reason, E'\\t', ' '), E'\\n', ' ') as failure_reason,
    replace(replace(metadata::text, E'\\t', ' '), E'\\n', ' ') as metadata,
    updated_at
  `;
}

function readTimeExportSnapshot(sql: string): TimeExportSnapshot | null {
  const output = readPsqlValue(sql);

  if (!output) {
    return null;
  }

  const [
    id,
    snapshotOrganizationId,
    requestedByUserId,
    requestedByMembershipId,
    dateFrom,
    dateTo,
    personProfileId,
    centerId,
    exportFormat,
    exportScope,
    status,
    rowCount,
    generatedAt,
    failureReason,
    metadata,
    updatedAt,
  ] = output.split("\t");

  if (
    !id ||
    !snapshotOrganizationId ||
    !requestedByUserId ||
    !dateFrom ||
    !dateTo ||
    !exportFormat ||
    !exportScope ||
    !status ||
    !metadata ||
    !updatedAt
  ) {
    return null;
  }

  const normalizedRowCount = normalizeNullablePsqlValue(rowCount);

  return {
    centerId: normalizeNullablePsqlValue(centerId),
    dateFrom,
    dateTo,
    exportFormat,
    exportScope,
    failureReason: normalizeNullablePsqlValue(failureReason),
    generatedAt: normalizeNullablePsqlValue(generatedAt),
    id,
    metadata: JSON.parse(metadata) as Json,
    organizationId: snapshotOrganizationId,
    personProfileId: normalizeNullablePsqlValue(personProfileId),
    requestedByMembershipId: normalizeNullablePsqlValue(
      requestedByMembershipId,
    ),
    requestedByUserId,
    rowCount: normalizedRowCount ? Number(normalizedRowCount) : null,
    status,
    updatedAt,
  };
}

function getTimeExportSnapshotById(timeExportId: string) {
  return readTimeExportSnapshot(`
    select ${getTimeExportSnapshotSelect()}
    from public.time_exports
    where id = '${toSqlUuid(timeExportId)}'::uuid
    limit 1;
  `);
}

function createSyntheticOtherTenantTimeExportSnapshot() {
  const marker = getSyntheticMarker("foreign");

  return readTimeExportSnapshot(`
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
    inserted as (
      insert into public.time_exports (
        date_from,
        date_to,
        export_format,
        export_scope,
        generated_at,
        metadata,
        organization_id,
        requested_by_membership_id,
        requested_by_user_id,
        row_count,
        status
      )
      select
        '2027-02-01'::date,
        '2027-02-02'::date,
        'csv',
        'time_records',
        now(),
        jsonb_build_object(
          'internalReviewOnly',
          true,
          'legalFinal',
          false,
          'marker',
          '${toSqlText(marker)}',
          'noFileGenerated',
          true,
          'payroll',
          false,
          'purpose',
          '${toSqlText(runtimeTimeExportPrefix)}-foreign',
          'smoke_key',
          '${toSqlText(runtimeTimeExportPrefix)}',
          'source',
          '${toSqlText(runtimeTimeExportPrefix)}'
        ),
        organization_id,
        membership_id,
        user_id,
        0,
        'generated'
      from foreign_membership
      returning *
    )
    select ${getTimeExportSnapshotSelect()}
    from inserted
    limit 1;
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

async function getCurrentTimeExportActor(
  client: Awaited<ReturnType<typeof createRuntimeClient>>,
): Promise<TimeExportActor | null> {
  const userId = await getSignedInUserId(client);
  const membershipResult = await client
    .from("organization_memberships")
    .select("id, role, user_id")
    .eq("organization_id", organizationId!)
    .eq("user_id", userId)
    .eq("status", "active")
    .in("role", ["owner", "admin", "manager"])
    .maybeSingle();

  expect(membershipResult.error).toBeNull();

  return membershipResult.data
    ? {
        membershipId: membershipResult.data.id,
        role: membershipResult.data.role,
        userId: membershipResult.data.user_id,
      }
    : null;
}

test.describe.serial("tenant direct grants runtime smoke: time_exports", () => {
  test.skip(
    !hasRuntimeConfig,
    "Configura Supabase local, E2E_OWNER_*/E2E_ADMIN_*/E2E_MANAGER_*, E2E_COACH_*, E2E_ORGANIZATION_ID, URL y anon key para ejecutar el smoke runtime de time_exports.",
  );

  test("authorized owner/admin/manager can insert and update tenant time export metadata without generating files", async () => {
    const reviewClient = await createRuntimeClient(timeReviewCredentials!);
    const actor = await getCurrentTimeExportActor(reviewClient);

    test.skip(
      !actor,
      "La credencial de gestion debe tener membership activa owner/admin/manager en el tenant E2E para insertar time_exports.",
    );

    const insertMarker = getSyntheticMarker("requested");
    const insertResult = await reviewClient
      .from("time_exports")
      .insert({
        date_from: runtimeTimeExportDateFrom,
        date_to: runtimeTimeExportDateTo,
        export_format: "csv",
        export_scope: "time_records",
        metadata: getSyntheticMetadata("requested", insertMarker),
        organization_id: organizationId!,
        person_profile_id: null,
        requested_by_membership_id: actor!.membershipId,
        requested_by_user_id: actor!.userId,
        status: "requested",
      })
      .select(
        "id, date_from, date_to, export_format, export_scope, generated_at, metadata, organization_id, person_profile_id, requested_by_membership_id, requested_by_user_id, row_count, status",
      )
      .single();

    expectNoTimeExportPermissionDenied(
      insertResult.error,
      "owner/admin/manager baseline insert should not fail because of direct table grants",
    );
    expect(insertResult.error).toBeNull();
    expect(insertResult.data).toMatchObject({
      date_from: runtimeTimeExportDateFrom,
      date_to: runtimeTimeExportDateTo,
      export_format: "csv",
      export_scope: "time_records",
      generated_at: null,
      organization_id: organizationId,
      person_profile_id: null,
      requested_by_membership_id: actor!.membershipId,
      requested_by_user_id: actor!.userId,
      row_count: null,
      status: "requested",
    });
    expect(insertResult.data?.metadata).toMatchObject({
      marker: insertMarker,
      noFileGenerated: true,
      smoke_key: runtimeTimeExportPrefix,
    });

    const timeExportId = insertResult.data?.id;

    expect(timeExportId).toBeTruthy();
    expect(timeExportId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );

    const generatedMarker = getSyntheticMarker("generated");
    const generatedAt = new Date().toISOString();
    const updateResult = await reviewClient
      .from("time_exports")
      .update({
        generated_at: generatedAt,
        metadata: {
          ...getSyntheticMetadata("generated", generatedMarker),
          rowCount: 0,
        },
        row_count: 0,
        status: "generated",
      })
      .eq("id", timeExportId!)
      .eq("organization_id", organizationId!)
      .select(
        "id, date_from, date_to, export_format, export_scope, failure_reason, generated_at, metadata, organization_id, person_profile_id, requested_by_membership_id, requested_by_user_id, row_count, status",
      )
      .single();

    expectNoTimeExportPermissionDenied(
      updateResult.error,
      "owner/admin/manager baseline update should not fail because of direct table grants",
    );
    expect(updateResult.error).toBeNull();
    expect(updateResult.data).toMatchObject({
      date_from: runtimeTimeExportDateFrom,
      date_to: runtimeTimeExportDateTo,
      export_format: "csv",
      export_scope: "time_records",
      failure_reason: null,
      id: timeExportId,
      organization_id: organizationId,
      person_profile_id: null,
      requested_by_membership_id: actor!.membershipId,
      requested_by_user_id: actor!.userId,
      row_count: 0,
      status: "generated",
    });
    expect(updateResult.data?.generated_at).toBeTruthy();
    expect(updateResult.data?.metadata).toMatchObject({
      marker: generatedMarker,
      noFileGenerated: true,
      rowCount: 0,
      smoke_key: runtimeTimeExportPrefix,
    });

    const exportSnapshot = getTimeExportSnapshotById(timeExportId!);

    expect(exportSnapshot).toMatchObject({
      centerId: null,
      dateFrom: runtimeTimeExportDateFrom,
      dateTo: runtimeTimeExportDateTo,
      exportFormat: "csv",
      exportScope: "time_records",
      failureReason: null,
      id: timeExportId,
      organizationId: organizationId,
      personProfileId: null,
      requestedByMembershipId: actor!.membershipId,
      requestedByUserId: actor!.userId,
      rowCount: 0,
      status: "generated",
    });
    expect(exportSnapshot?.metadata).toMatchObject({
      marker: generatedMarker,
      noFileGenerated: true,
      rowCount: 0,
      smoke_key: runtimeTimeExportPrefix,
    });
    expect(exportSnapshot?.generatedAt).toBeTruthy();
  });

  test("coach cannot insert time export metadata through direct authenticated DML", async () => {
    const coachClient = await createRuntimeClient(coachCredentials!);
    const coachUserId = await getSignedInUserId(coachClient);
    const deniedInsert = await coachClient
      .from("time_exports")
      .insert({
        date_from: runtimeTimeExportDateFrom,
        date_to: runtimeTimeExportDateTo,
        export_format: "csv",
        export_scope: "time_records",
        metadata: getSyntheticMetadata(
          "coach-denied",
          getSyntheticMarker("coach-denied"),
        ),
        organization_id: organizationId!,
        person_profile_id: null,
        requested_by_user_id: coachUserId,
        status: "requested",
      })
      .select("id");

    expectNoTimeExportPermissionDenied(
      deniedInsert.error,
      "coach denied insert should be an RLS/role denial, not a missing table grant",
    );
    expect(deniedInsert.error).toBeTruthy();
    expect(getErrorText(deniedInsert.error)).toMatch(
      /row-level security|violates row-level security|time export permission required|permission denied/i,
    );
    expect(deniedInsert.data ?? []).toHaveLength(0);
  });

  test("owner/admin/manager cannot update a time export from another tenant when scoped to the active organization", async () => {
    const otherExportBefore = createSyntheticOtherTenantTimeExportSnapshot();

    test.skip(
      !otherExportBefore,
      "Hace falta al menos una membership activa en otro tenant local para crear un time_exports sintetico ajeno y validar ID ajeno.",
    );

    const reviewClient = await createRuntimeClient(timeReviewCredentials!);
    const attemptedFailureReason = getSyntheticMarker("cross-tenant");
    const foreignUpdate = await reviewClient
      .from("time_exports")
      .update({
        failure_reason: attemptedFailureReason,
        status: "failed",
      })
      .eq("id", otherExportBefore!.id)
      .eq("organization_id", organizationId!)
      .select("id, failure_reason, organization_id, status");

    expectNoTimeExportPermissionDenied(
      foreignUpdate.error,
      "cross-tenant scoped update should not fail because of missing table grants",
    );
    expect(foreignUpdate.error).toBeNull();
    expect(foreignUpdate.data ?? []).toHaveLength(0);

    const otherExportAfter = getTimeExportSnapshotById(otherExportBefore!.id);

    expect(otherExportAfter).toMatchObject({
      centerId: otherExportBefore!.centerId,
      dateFrom: otherExportBefore!.dateFrom,
      dateTo: otherExportBefore!.dateTo,
      exportFormat: otherExportBefore!.exportFormat,
      exportScope: otherExportBefore!.exportScope,
      failureReason: otherExportBefore!.failureReason,
      generatedAt: otherExportBefore!.generatedAt,
      id: otherExportBefore!.id,
      organizationId: otherExportBefore!.organizationId,
      personProfileId: otherExportBefore!.personProfileId,
      requestedByMembershipId: otherExportBefore!.requestedByMembershipId,
      requestedByUserId: otherExportBefore!.requestedByUserId,
      rowCount: otherExportBefore!.rowCount,
      status: otherExportBefore!.status,
    });
    expect(otherExportAfter?.metadata).toMatchObject(
      otherExportBefore!.metadata as Record<string, Json>,
    );
  });
});
