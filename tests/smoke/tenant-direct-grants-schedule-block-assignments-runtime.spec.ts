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

const runtimeAssignmentNotesPrefix =
  "e2e-direct-grants-schedule-block-assignments-smoke";
const runtimeAssignmentServiceDate = "2026-12-31";
const localDbContainer = "supabase_db_boxops";

type ScheduleBlockAssignmentError = {
  code?: string;
  details?: string | null;
  hint?: string | null;
  message?: string;
};

type ScheduleBlockAssignmentSnapshot = {
  assignmentStatus: string;
  coachProfileId: string;
  id: string;
  notes: string | null;
  organizationId: string;
  scheduleBlockId: string;
  source: string;
  updatedAt: string;
};

type ScheduleWindow = {
  endTime: string;
  startTime: string;
};

const hasRuntimeConfig = Boolean(
  supabaseUrl &&
    supabaseAnonKey &&
    organizationId &&
    hasCredentials(ownerCredentials) &&
    hasCredentials(coachCredentials),
);

function getErrorText(error: ScheduleBlockAssignmentError | null) {
  if (!error) {
    return "";
  }

  return [error.code, error.message, error.details, error.hint]
    .filter(Boolean)
    .join(" ");
}

function expectNoScheduleBlockAssignmentPermissionDenied(
  error: ScheduleBlockAssignmentError | null,
  context: string,
) {
  expect(getErrorText(error), context).not.toMatch(
    /permission denied for table schedule_block_assignments/i,
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

function getScheduleBlockAssignmentSnapshotSelect() {
  return `
    id,
    organization_id,
    schedule_block_id,
    coach_profile_id,
    assignment_status,
    source,
    replace(replace(notes, E'\\t', ' '), E'\\n', ' ') as notes,
    updated_at
  `;
}

function readScheduleBlockAssignmentSnapshot(
  sql: string,
): ScheduleBlockAssignmentSnapshot | null {
  const output = readPsqlValue(sql);

  if (!output) {
    return null;
  }

  const [
    id,
    snapshotOrganizationId,
    scheduleBlockId,
    coachProfileId,
    assignmentStatus,
    source,
    notes,
    updatedAt,
  ] = output.split("\t");

  if (
    !id ||
    !snapshotOrganizationId ||
    !scheduleBlockId ||
    !coachProfileId ||
    !assignmentStatus ||
    !source ||
    !updatedAt
  ) {
    return null;
  }

  return {
    assignmentStatus,
    coachProfileId,
    id,
    notes: normalizeNullablePsqlValue(notes),
    organizationId: snapshotOrganizationId,
    scheduleBlockId,
    source,
    updatedAt,
  };
}

function getOtherTenantScheduleBlockAssignmentSnapshot() {
  return readScheduleBlockAssignmentSnapshot(`
    select ${getScheduleBlockAssignmentSnapshotSelect()}
    from public.schedule_block_assignments
    where organization_id <> '${toSqlUuid(organizationId!)}'::uuid
    order by created_at desc
    limit 1;
  `);
}

function getScheduleBlockAssignmentSnapshotById(assignmentId: string) {
  return readScheduleBlockAssignmentSnapshot(`
    select ${getScheduleBlockAssignmentSnapshotSelect()}
    from public.schedule_block_assignments
    where id = '${toSqlUuid(assignmentId)}'::uuid
    limit 1;
  `);
}

function getAssignedWindowsForCoach(coachProfileId: string) {
  const output = readPsqlValue(`
    select to_char(block.start_time, 'HH24:MI'), to_char(block.end_time, 'HH24:MI')
    from public.schedule_block_assignments assignment
    inner join public.schedule_blocks block
      on block.id = assignment.schedule_block_id
     and block.organization_id = assignment.organization_id
    where assignment.organization_id = '${toSqlUuid(organizationId!)}'::uuid
      and assignment.coach_profile_id = '${toSqlUuid(coachProfileId)}'::uuid
      and assignment.assignment_status = 'assigned'
      and block.status not in ('cancelled', 'completed')
      and block.service_date = '${runtimeAssignmentServiceDate}'::date
    order by block.start_time;
  `);

  if (!output) {
    return [];
  }

  return output
    .split(/\r?\n/)
    .map((line) => {
      const [startTime, endTime] = line.split("\t");

      return { endTime, startTime } satisfies ScheduleWindow;
    })
    .filter((window) => window.startTime && window.endTime);
}

function timeToMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);

  return hours * 60 + minutes;
}

function minutesToTime(minutes: number) {
  const hours = String(Math.floor(minutes / 60)).padStart(2, "0");
  const remainingMinutes = String(minutes % 60).padStart(2, "0");

  return `${hours}:${remainingMinutes}`;
}

function timeRangesOverlap(
  firstStart: string,
  firstEnd: string,
  secondStart: string,
  secondEnd: string,
) {
  return (
    timeToMinutes(firstStart) < timeToMinutes(secondEnd) &&
    timeToMinutes(secondStart) < timeToMinutes(firstEnd)
  );
}

function getAvailableWindowForCoach(coachProfileId: string) {
  const existingWindows = getAssignedWindowsForCoach(coachProfileId);

  for (let startMinutes = 5 * 60; startMinutes <= 22 * 60; startMinutes += 15) {
    const endMinutes = startMinutes + 10;
    const candidate = {
      endTime: minutesToTime(endMinutes),
      startTime: minutesToTime(startMinutes),
    } satisfies ScheduleWindow;
    const overlaps = existingWindows.some((window) =>
      timeRangesOverlap(
        candidate.startTime,
        candidate.endTime,
        window.startTime,
        window.endTime,
      ),
    );

    if (!overlaps) {
      return candidate;
    }
  }

  return null;
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

async function getTenantActiveCoachProfileId(
  ownerClient: Awaited<ReturnType<typeof createRuntimeClient>>,
) {
  const result = await ownerClient
    .from("coach_profiles")
    .select("id")
    .eq("organization_id", organizationId!)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  expect(result.error).toBeNull();

  return result.data?.id ?? null;
}

async function createSyntheticScheduleBlock({
  centerId,
  classTypeId,
  ownerClient,
  purpose,
  window,
}: {
  centerId: string;
  classTypeId: string;
  ownerClient: Awaited<ReturnType<typeof createRuntimeClient>>;
  purpose: string;
  window: ScheduleWindow;
}) {
  const insertResult = await ownerClient
    .from("schedule_blocks")
    .insert({
      center_id: centerId,
      class_type_id: classTypeId,
      end_time: window.endTime,
      is_template_exception: false,
      metadata: { smoke_key: runtimeAssignmentNotesPrefix, purpose },
      notes: `${runtimeAssignmentNotesPrefix}-block-${purpose}-${getRuntimeStamp()}`,
      organization_id: organizationId!,
      required_coaches: 1,
      service_date: runtimeAssignmentServiceDate,
      start_time: window.startTime,
      status: "scheduled",
      template_block_id: null,
      template_id: null,
    })
    .select("id")
    .single();

  expect(insertResult.error).toBeNull();

  return insertResult.data?.id ?? null;
}

test.describe.serial(
  "tenant direct grants runtime smoke: schedule_block_assignments",
  () => {
    test.skip(
      !hasRuntimeConfig,
      "Configura Supabase local, E2E_OWNER_*, E2E_COACH_* y E2E_ORGANIZATION_ID para ejecutar el smoke runtime de schedule_block_assignments.",
    );

    test("authorized owner can insert/update a tenant schedule block assignment without table permission denial", async () => {
      const ownerClient = await createRuntimeClient(ownerCredentials!);
      const [centerId, classTypeId, coachProfileId] = await Promise.all([
        getTenantReferenceId(ownerClient, "centers"),
        getTenantReferenceId(ownerClient, "class_types"),
        getTenantActiveCoachProfileId(ownerClient),
      ]);

      test.skip(
        !centerId || !classTypeId || !coachProfileId,
        "Hace falta al menos un centro activo, tipo activo y coach_profile activo del tenant E2E para validar asignaciones.",
      );

      const window = getAvailableWindowForCoach(coachProfileId!);

      test.skip(
        !window,
        "No queda una ventana sintetica libre en la fecha de smoke para este coach sin disparar el guard anti-solape.",
      );

      const scheduleBlockId = await createSyntheticScheduleBlock({
        centerId: centerId!,
        classTypeId: classTypeId!,
        ownerClient,
        purpose: "owner-happy-path",
        window: window!,
      });

      test.skip(
        !scheduleBlockId,
        "Hace falta un schedule_block sintetico minimo para validar asignaciones.",
      );

      const insertNotes = `${runtimeAssignmentNotesPrefix}-insert-${getRuntimeStamp()}`;
      const insertResult = await ownerClient
        .from("schedule_block_assignments")
        .insert({
          assignment_status: "assigned",
          coach_profile_id: coachProfileId!,
          notes: insertNotes,
          organization_id: organizationId!,
          schedule_block_id: scheduleBlockId!,
          source: "template",
        })
        .select(
          "id, assignment_status, coach_profile_id, notes, organization_id, schedule_block_id, source",
        )
        .single();

      expectNoScheduleBlockAssignmentPermissionDenied(
        insertResult.error,
        "owner baseline insert should not fail because of direct table grants",
      );
      expect(insertResult.error).toBeNull();
      expect(insertResult.data).toMatchObject({
        assignment_status: "assigned",
        coach_profile_id: coachProfileId,
        notes: insertNotes,
        organization_id: organizationId,
        schedule_block_id: scheduleBlockId,
        source: "template",
      });

      const assignmentId = insertResult.data?.id;

      expect(assignmentId).toBeTruthy();

      const updateResult = await ownerClient
        .from("schedule_block_assignments")
        .update({
          assignment_status: "removed",
          source: "manual",
        })
        .eq("id", assignmentId!)
        .eq("organization_id", organizationId!)
        .select(
          "id, assignment_status, coach_profile_id, notes, organization_id, schedule_block_id, source",
        )
        .single();

      expectNoScheduleBlockAssignmentPermissionDenied(
        updateResult.error,
        "owner baseline update should not fail because of direct table grants",
      );
      expect(updateResult.error).toBeNull();
      expect(updateResult.data).toMatchObject({
        assignment_status: "removed",
        coach_profile_id: coachProfileId,
        id: assignmentId,
        notes: insertNotes,
        organization_id: organizationId,
        schedule_block_id: scheduleBlockId,
        source: "manual",
      });

      const assignmentSnapshot = getScheduleBlockAssignmentSnapshotById(
        assignmentId!,
      );

      expect(assignmentSnapshot).toMatchObject({
        assignmentStatus: "removed",
        coachProfileId,
        id: assignmentId,
        notes: insertNotes,
        organizationId: organizationId,
        scheduleBlockId,
        source: "manual",
      });
    });

    test("coach cannot insert schedule block assignments through direct authenticated DML", async () => {
      const ownerClient = await createRuntimeClient(ownerCredentials!);
      const [centerId, classTypeId, coachProfileId] = await Promise.all([
        getTenantReferenceId(ownerClient, "centers"),
        getTenantReferenceId(ownerClient, "class_types"),
        getTenantActiveCoachProfileId(ownerClient),
      ]);

      test.skip(
        !centerId || !classTypeId || !coachProfileId,
        "Hace falta al menos un centro activo, tipo activo y coach_profile activo del tenant E2E para validar el negativo de coach.",
      );

      const window = getAvailableWindowForCoach(coachProfileId!);

      test.skip(
        !window,
        "No queda una ventana sintetica libre en la fecha de smoke para el negativo de coach sin disparar el guard anti-solape.",
      );

      const scheduleBlockId = await createSyntheticScheduleBlock({
        centerId: centerId!,
        classTypeId: classTypeId!,
        ownerClient,
        purpose: "coach-denied",
        window: window!,
      });

      test.skip(
        !scheduleBlockId,
        "Hace falta un schedule_block sintetico minimo para validar el negativo de coach.",
      );

      const coachClient = await createRuntimeClient(coachCredentials!);
      const deniedInsert = await coachClient
        .from("schedule_block_assignments")
        .insert({
          assignment_status: "assigned",
          coach_profile_id: coachProfileId!,
          notes: `${runtimeAssignmentNotesPrefix}-coach-denied-${getRuntimeStamp()}`,
          organization_id: organizationId!,
          schedule_block_id: scheduleBlockId!,
          source: "manual",
        })
        .select("id");

      expectNoScheduleBlockAssignmentPermissionDenied(
        deniedInsert.error,
        "coach denied insert should be an RLS/role denial, not a missing table grant",
      );
      expect(deniedInsert.error).toBeTruthy();
      expect(deniedInsert.data ?? []).toHaveLength(0);
    });

    test("owner cannot update a schedule block assignment from another tenant when scoped to the active organization", async () => {
      const otherAssignmentBefore =
        getOtherTenantScheduleBlockAssignmentSnapshot();

      test.skip(
        !otherAssignmentBefore,
        "Hace falta al menos una asignacion de bloque de otro tenant en Supabase local para validar ID ajeno.",
      );

      const ownerClient = await createRuntimeClient(ownerCredentials!);
      const foreignUpdate = await ownerClient
        .from("schedule_block_assignments")
        .update({
          assignment_status: "removed",
          source: "manual",
        })
        .eq("id", otherAssignmentBefore!.id)
        .eq("organization_id", organizationId!)
        .select("id, assignment_status, source");

      expectNoScheduleBlockAssignmentPermissionDenied(
        foreignUpdate.error,
        "cross-tenant scoped update should not fail because of missing table grants",
      );
      expect(foreignUpdate.error).toBeNull();
      expect(foreignUpdate.data ?? []).toHaveLength(0);

      const otherAssignmentAfter = getScheduleBlockAssignmentSnapshotById(
        otherAssignmentBefore!.id,
      );

      expect(otherAssignmentAfter).toMatchObject({
        assignmentStatus: otherAssignmentBefore!.assignmentStatus,
        coachProfileId: otherAssignmentBefore!.coachProfileId,
        id: otherAssignmentBefore!.id,
        notes: otherAssignmentBefore!.notes,
        organizationId: otherAssignmentBefore!.organizationId,
        scheduleBlockId: otherAssignmentBefore!.scheduleBlockId,
        source: otherAssignmentBefore!.source,
      });
    });
  },
);
