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

const runtimeBlockNotesPrefix =
  "e2e-direct-grants-schedule-blocks-smoke";
const runtimeBlockInsertServiceDate = "2026-12-28";
const runtimeBlockUpdateServiceDate = "2026-12-29";
const localDbContainer = "supabase_db_boxops";

type ScheduleBlockError = {
  code?: string;
  details?: string | null;
  hint?: string | null;
  message?: string;
};

type ScheduleBlockSnapshot = {
  centerId: string;
  classTypeId: string;
  endTime: string;
  id: string;
  isTemplateException: boolean;
  notes: string | null;
  organizationId: string;
  requiredCoaches: number;
  serviceDate: string;
  startTime: string;
  status: string;
  templateBlockId: string | null;
  templateId: string | null;
  updatedAt: string;
};

const hasRuntimeConfig = Boolean(
  supabaseUrl &&
    supabaseAnonKey &&
    organizationId &&
    hasCredentials(ownerCredentials) &&
    hasCredentials(coachCredentials),
);

function getErrorText(error: ScheduleBlockError | null) {
  if (!error) {
    return "";
  }

  return [error.code, error.message, error.details, error.hint]
    .filter(Boolean)
    .join(" ");
}

function expectNoScheduleBlockPermissionDenied(
  error: ScheduleBlockError | null,
  context: string,
) {
  expect(getErrorText(error), context).not.toMatch(
    /permission denied for table schedule_blocks/i,
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

function normalizePsqlBoolean(value: string | undefined) {
  return value === "t" || value === "true";
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

function readScheduleBlockSnapshot(sql: string): ScheduleBlockSnapshot | null {
  const output = readPsqlValue(sql);

  if (!output) {
    return null;
  }

  const [
    id,
    snapshotOrganizationId,
    centerId,
    classTypeId,
    serviceDate,
    startTime,
    endTime,
    requiredCoaches,
    status,
    notes,
    isTemplateException,
    templateId,
    templateBlockId,
    updatedAt,
  ] = output.split("\t");

  if (
    !id ||
    !snapshotOrganizationId ||
    !centerId ||
    !classTypeId ||
    !serviceDate ||
    !startTime ||
    !endTime ||
    !requiredCoaches ||
    !status ||
    !isTemplateException ||
    !updatedAt
  ) {
    return null;
  }

  return {
    centerId,
    classTypeId,
    endTime,
    id,
    isTemplateException: normalizePsqlBoolean(isTemplateException),
    notes: normalizeNullablePsqlValue(notes),
    organizationId: snapshotOrganizationId,
    requiredCoaches: Number(requiredCoaches),
    serviceDate,
    startTime,
    status,
    templateBlockId: normalizeNullablePsqlValue(templateBlockId),
    templateId: normalizeNullablePsqlValue(templateId),
    updatedAt,
  };
}

function getScheduleBlockSnapshotSelect() {
  return `
    id,
    organization_id,
    center_id,
    class_type_id,
    service_date,
    start_time,
    end_time,
    required_coaches,
    status,
    replace(replace(notes, E'\\t', ' '), E'\\n', ' ') as notes,
    is_template_exception::text,
    template_id,
    template_block_id,
    updated_at
  `;
}

function getOtherTenantScheduleBlockSnapshot() {
  return readScheduleBlockSnapshot(`
    select ${getScheduleBlockSnapshotSelect()}
    from public.schedule_blocks
    where organization_id <> '${toSqlUuid(organizationId!)}'::uuid
    order by created_at desc
    limit 1;
  `);
}

function getScheduleBlockSnapshotById(scheduleBlockId: string) {
  return readScheduleBlockSnapshot(`
    select ${getScheduleBlockSnapshotSelect()}
    from public.schedule_blocks
    where id = '${toSqlUuid(scheduleBlockId)}'::uuid
    limit 1;
  `);
}

function getScheduleBlockAssignmentCount(scheduleBlockId: string) {
  const output = readPsqlValue(`
    select count(*)
    from public.schedule_block_assignments
    where schedule_block_id = '${toSqlUuid(scheduleBlockId)}'::uuid;
  `);

  return output ? Number(output) : null;
}

async function getTenantReferenceId(
  ownerClient: Awaited<ReturnType<typeof createRuntimeClient>>,
  table: "centers" | "class_types",
) {
  const result = await ownerClient
    .from(table)
    .select("id")
    .eq("organization_id", organizationId!)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  expect(result.error).toBeNull();

  return result.data?.id ?? null;
}

test.describe.serial("tenant direct grants runtime smoke: schedule_blocks", () => {
  test.skip(
    !hasRuntimeConfig,
    "Configura Supabase local, E2E_OWNER_*, E2E_COACH_* y E2E_ORGANIZATION_ID para ejecutar el smoke runtime de schedule_blocks.",
  );

  test("authorized owner can insert/update a tenant schedule block without table permission denial", async () => {
    const ownerClient = await createRuntimeClient(ownerCredentials!);
    const [centerId, classTypeId] = await Promise.all([
      getTenantReferenceId(ownerClient, "centers"),
      getTenantReferenceId(ownerClient, "class_types"),
    ]);

    test.skip(
      !centerId || !classTypeId,
      "Hace falta al menos un centro activo y un tipo activo del tenant E2E para validar bloques reales.",
    );

    const selectExisting = await ownerClient
      .from("schedule_blocks")
      .select("id, organization_id")
      .eq("organization_id", organizationId!)
      .is("template_id", null)
      .is("template_block_id", null)
      .ilike("notes", `${runtimeBlockNotesPrefix}%`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    expectNoScheduleBlockPermissionDenied(
      selectExisting.error,
      "owner baseline select should not fail because of direct table grants",
    );
    expect(selectExisting.error).toBeNull();

    let scheduleBlockId = selectExisting.data?.id;

    if (
      scheduleBlockId &&
      getScheduleBlockAssignmentCount(scheduleBlockId) !== 0
    ) {
      scheduleBlockId = undefined;
    }

    if (!scheduleBlockId) {
      const insertResult = await ownerClient
        .from("schedule_blocks")
        .insert({
          center_id: centerId!,
          class_type_id: classTypeId!,
          end_time: "07:15",
          is_template_exception: false,
          metadata: { smoke_key: runtimeBlockNotesPrefix },
          notes: `${runtimeBlockNotesPrefix}-insert-${getRuntimeStamp()}`,
          organization_id: organizationId!,
          required_coaches: 0,
          service_date: runtimeBlockInsertServiceDate,
          start_time: "06:30",
          status: "scheduled",
          template_block_id: null,
          template_id: null,
        })
        .select("id")
        .single();

      expectNoScheduleBlockPermissionDenied(
        insertResult.error,
        "owner baseline insert should not fail because of direct table grants",
      );
      expect(insertResult.error).toBeNull();
      scheduleBlockId = insertResult.data?.id;
    }

    expect(scheduleBlockId).toBeTruthy();
    expect(getScheduleBlockAssignmentCount(scheduleBlockId!)).toBe(0);

    const updatedNotes = `${runtimeBlockNotesPrefix}-updated-${getRuntimeStamp()}`;
    const updateResult = await ownerClient
      .from("schedule_blocks")
      .update({
        center_id: centerId!,
        class_type_id: classTypeId!,
        end_time: "08:45",
        is_template_exception: true,
        notes: updatedNotes,
        required_coaches: 1,
        service_date: runtimeBlockUpdateServiceDate,
        start_time: "07:45",
        status: "changed",
      })
      .eq("id", scheduleBlockId!)
      .eq("organization_id", organizationId!)
      .select(
        "id, center_id, class_type_id, end_time, is_template_exception, notes, organization_id, required_coaches, service_date, start_time, status, template_block_id, template_id",
      )
      .single();

    expectNoScheduleBlockPermissionDenied(
      updateResult.error,
      "owner baseline update should not fail because of direct table grants",
    );
    expect(updateResult.error).toBeNull();
    expect(updateResult.data).toMatchObject({
      center_id: centerId,
      class_type_id: classTypeId,
      id: scheduleBlockId,
      is_template_exception: true,
      notes: updatedNotes,
      organization_id: organizationId,
      required_coaches: 1,
      service_date: runtimeBlockUpdateServiceDate,
      status: "changed",
      template_block_id: null,
      template_id: null,
    });
    expect(updateResult.data?.start_time.slice(0, 5)).toBe("07:45");
    expect(updateResult.data?.end_time.slice(0, 5)).toBe("08:45");
    expect(getScheduleBlockAssignmentCount(scheduleBlockId!)).toBe(0);
  });

  test("coach cannot insert schedule blocks through direct authenticated DML", async () => {
    const ownerClient = await createRuntimeClient(ownerCredentials!);
    const [centerId, classTypeId] = await Promise.all([
      getTenantReferenceId(ownerClient, "centers"),
      getTenantReferenceId(ownerClient, "class_types"),
    ]);

    test.skip(
      !centerId || !classTypeId,
      "Hace falta al menos un centro activo y un tipo activo del tenant E2E para validar el negativo de coach.",
    );

    const coachClient = await createRuntimeClient(coachCredentials!);
    const deniedInsert = await coachClient
      .from("schedule_blocks")
      .insert({
        center_id: centerId!,
        class_type_id: classTypeId!,
        end_time: "10:00",
        is_template_exception: false,
        metadata: { smoke_key: runtimeBlockNotesPrefix },
        notes: `${runtimeBlockNotesPrefix}-coach-denied-${getRuntimeStamp()}`,
        organization_id: organizationId!,
        required_coaches: 1,
        service_date: "2026-12-30",
        start_time: "09:00",
        status: "scheduled",
        template_block_id: null,
        template_id: null,
      })
      .select("id");

    expectNoScheduleBlockPermissionDenied(
      deniedInsert.error,
      "coach denied insert should be an RLS/role denial, not a missing table grant",
    );
    expect(deniedInsert.error).toBeTruthy();
    expect(deniedInsert.data ?? []).toHaveLength(0);
  });

  test("owner cannot update a schedule block from another tenant when scoped to the active organization", async () => {
    const otherBlockBefore = getOtherTenantScheduleBlockSnapshot();

    test.skip(
      !otherBlockBefore,
      "Hace falta al menos un bloque real de otro tenant en Supabase local para validar ID ajeno.",
    );

    const otherBlockAssignmentCountBefore = getScheduleBlockAssignmentCount(
      otherBlockBefore!.id,
    );
    const ownerClient = await createRuntimeClient(ownerCredentials!);
    const attemptedNotes = `${runtimeBlockNotesPrefix}-cross-tenant-${getRuntimeStamp()}`;
    const foreignUpdate = await ownerClient
      .from("schedule_blocks")
      .update({ notes: attemptedNotes })
      .eq("id", otherBlockBefore!.id)
      .eq("organization_id", organizationId!)
      .select("id, notes");

    expectNoScheduleBlockPermissionDenied(
      foreignUpdate.error,
      "cross-tenant scoped update should not fail because of missing table grants",
    );
    expect(foreignUpdate.error).toBeNull();
    expect(foreignUpdate.data ?? []).toHaveLength(0);

    const otherBlockAfter = getScheduleBlockSnapshotById(otherBlockBefore!.id);

    expect(otherBlockAfter).toMatchObject({
      centerId: otherBlockBefore!.centerId,
      classTypeId: otherBlockBefore!.classTypeId,
      endTime: otherBlockBefore!.endTime,
      id: otherBlockBefore!.id,
      isTemplateException: otherBlockBefore!.isTemplateException,
      notes: otherBlockBefore!.notes,
      organizationId: otherBlockBefore!.organizationId,
      requiredCoaches: otherBlockBefore!.requiredCoaches,
      serviceDate: otherBlockBefore!.serviceDate,
      startTime: otherBlockBefore!.startTime,
      status: otherBlockBefore!.status,
      templateBlockId: otherBlockBefore!.templateBlockId,
      templateId: otherBlockBefore!.templateId,
    });
    expect(getScheduleBlockAssignmentCount(otherBlockBefore!.id)).toBe(
      otherBlockAssignmentCountBefore,
    );
  });
});
