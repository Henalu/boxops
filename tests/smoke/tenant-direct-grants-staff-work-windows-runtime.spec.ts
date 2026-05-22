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

const runtimeWorkWindowNotesPrefix =
  "e2e-direct-grants-staff-work-windows-smoke";
const runtimeWorkWindowInsertValidFrom = "2026-12-28";
const runtimeWorkWindowUpdateValidFrom = "2026-12-29";
const runtimeWorkWindowUpdateValidUntil = "2027-01-04";
const localDbContainer = "supabase_db_boxops";

type StaffWorkWindowError = {
  code?: string;
  details?: string | null;
  hint?: string | null;
  message?: string;
};

type StaffWorkWindowSnapshot = {
  centerId: string | null;
  dayOfWeek: number;
  endTime: string;
  id: string;
  notes: string | null;
  organizationId: string;
  personProfileId: string;
  startTime: string;
  status: string;
  updatedAt: string;
  validFrom: string;
  validUntil: string | null;
};

const hasRuntimeConfig = Boolean(
  supabaseUrl &&
    supabaseAnonKey &&
    organizationId &&
    hasCredentials(ownerCredentials) &&
    hasCredentials(coachCredentials),
);

function getErrorText(error: StaffWorkWindowError | null) {
  if (!error) {
    return "";
  }

  return [error.code, error.message, error.details, error.hint]
    .filter(Boolean)
    .join(" ");
}

function expectNoStaffWorkWindowPermissionDenied(
  error: StaffWorkWindowError | null,
  context: string,
) {
  expect(getErrorText(error), context).not.toMatch(
    /permission denied for table staff_work_windows/i,
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

function getStaffWorkWindowSnapshotSelect() {
  return `
    id,
    organization_id,
    person_profile_id,
    center_id,
    day_of_week,
    to_char(start_time, 'HH24:MI'),
    to_char(end_time, 'HH24:MI'),
    valid_from,
    valid_until,
    status,
    replace(replace(notes, E'\\t', ' '), E'\\n', ' ') as notes,
    updated_at
  `;
}

function readStaffWorkWindowSnapshot(
  sql: string,
): StaffWorkWindowSnapshot | null {
  const output = readPsqlValue(sql);

  if (!output) {
    return null;
  }

  const [
    id,
    snapshotOrganizationId,
    personProfileId,
    centerId,
    dayOfWeek,
    startTime,
    endTime,
    validFrom,
    validUntil,
    status,
    notes,
    updatedAt,
  ] = output.split("\t");

  if (
    !id ||
    !snapshotOrganizationId ||
    !personProfileId ||
    !dayOfWeek ||
    !startTime ||
    !endTime ||
    !validFrom ||
    !status ||
    !updatedAt
  ) {
    return null;
  }

  return {
    centerId: normalizeNullablePsqlValue(centerId),
    dayOfWeek: Number(dayOfWeek),
    endTime,
    id,
    notes: normalizeNullablePsqlValue(notes),
    organizationId: snapshotOrganizationId,
    personProfileId,
    startTime,
    status,
    updatedAt,
    validFrom,
    validUntil: normalizeNullablePsqlValue(validUntil),
  };
}

function getOtherTenantStaffWorkWindowSnapshot() {
  return readStaffWorkWindowSnapshot(`
    select ${getStaffWorkWindowSnapshotSelect()}
    from public.staff_work_windows
    where organization_id <> '${toSqlUuid(organizationId!)}'::uuid
    order by created_at desc
    limit 1;
  `);
}

function getStaffWorkWindowSnapshotById(staffWorkWindowId: string) {
  return readStaffWorkWindowSnapshot(`
    select ${getStaffWorkWindowSnapshotSelect()}
    from public.staff_work_windows
    where id = '${toSqlUuid(staffWorkWindowId)}'::uuid
    limit 1;
  `);
}

async function getTenantActiveVisiblePersonProfileId(
  ownerClient: Awaited<ReturnType<typeof createRuntimeClient>>,
) {
  const result = await ownerClient
    .from("person_profiles")
    .select("id")
    .eq("organization_id", organizationId!)
    .eq("status", "active")
    .eq("visibility_status", "visible")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  expect(result.error).toBeNull();

  return result.data?.id ?? null;
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

test.describe.serial(
  "tenant direct grants runtime smoke: staff_work_windows",
  () => {
    test.skip(
      !hasRuntimeConfig,
      "Configura Supabase local, E2E_OWNER_*, E2E_COACH_* y E2E_ORGANIZATION_ID para ejecutar el smoke runtime de staff_work_windows.",
    );

    test("authorized owner can insert/update a tenant staff work window without table permission denial", async () => {
      const ownerClient = await createRuntimeClient(ownerCredentials!);
      const [personProfileId, centerId] = await Promise.all([
        getTenantActiveVisiblePersonProfileId(ownerClient),
        getTenantActiveCenterId(ownerClient),
      ]);

      test.skip(
        !personProfileId || !centerId,
        "Hace falta al menos una person_profile activa/visible y un centro activo del tenant E2E para validar jornada prevista.",
      );

      const selectExisting = await ownerClient
        .from("staff_work_windows")
        .select("id, organization_id")
        .eq("organization_id", organizationId!)
        .ilike("notes", `${runtimeWorkWindowNotesPrefix}%`)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      expectNoStaffWorkWindowPermissionDenied(
        selectExisting.error,
        "owner baseline select should not fail because of direct table grants",
      );
      expect(selectExisting.error).toBeNull();

      let staffWorkWindowId = selectExisting.data?.id;

      if (!staffWorkWindowId) {
        const insertResult = await ownerClient
          .from("staff_work_windows")
          .insert({
            center_id: centerId!,
            day_of_week: 1,
            end_time: "08:30",
            notes: `${runtimeWorkWindowNotesPrefix}-insert-${getRuntimeStamp()}`,
            organization_id: organizationId!,
            person_profile_id: personProfileId!,
            start_time: "07:00",
            status: "active",
            valid_from: runtimeWorkWindowInsertValidFrom,
            valid_until: null,
          })
          .select("id")
          .single();

        expectNoStaffWorkWindowPermissionDenied(
          insertResult.error,
          "owner baseline insert should not fail because of direct table grants",
        );
        expect(insertResult.error).toBeNull();
        staffWorkWindowId = insertResult.data?.id;
      }

      expect(staffWorkWindowId).toBeTruthy();

      const updatedNotes = `${runtimeWorkWindowNotesPrefix}-updated-${getRuntimeStamp()}`;
      const updateResult = await ownerClient
        .from("staff_work_windows")
        .update({
          center_id: centerId!,
          day_of_week: 2,
          end_time: "10:15",
          notes: updatedNotes,
          person_profile_id: personProfileId!,
          start_time: "09:00",
          status: "inactive",
          valid_from: runtimeWorkWindowUpdateValidFrom,
          valid_until: runtimeWorkWindowUpdateValidUntil,
        })
        .eq("id", staffWorkWindowId!)
        .eq("organization_id", organizationId!)
        .select(
          "id, center_id, day_of_week, end_time, notes, organization_id, person_profile_id, start_time, status, valid_from, valid_until",
        )
        .single();

      expectNoStaffWorkWindowPermissionDenied(
        updateResult.error,
        "owner baseline update should not fail because of direct table grants",
      );
      expect(updateResult.error).toBeNull();
      expect(updateResult.data).toMatchObject({
        center_id: centerId,
        day_of_week: 2,
        id: staffWorkWindowId,
        notes: updatedNotes,
        organization_id: organizationId,
        person_profile_id: personProfileId,
        status: "inactive",
        valid_from: runtimeWorkWindowUpdateValidFrom,
        valid_until: runtimeWorkWindowUpdateValidUntil,
      });
      expect(updateResult.data?.start_time.slice(0, 5)).toBe("09:00");
      expect(updateResult.data?.end_time.slice(0, 5)).toBe("10:15");
    });

    test("coach cannot insert staff work windows through direct authenticated DML", async () => {
      const ownerClient = await createRuntimeClient(ownerCredentials!);
      const [personProfileId, centerId] = await Promise.all([
        getTenantActiveVisiblePersonProfileId(ownerClient),
        getTenantActiveCenterId(ownerClient),
      ]);

      test.skip(
        !personProfileId || !centerId,
        "Hace falta al menos una person_profile activa/visible y un centro activo del tenant E2E para validar el negativo de coach.",
      );

      const coachClient = await createRuntimeClient(coachCredentials!);
      const deniedInsert = await coachClient
        .from("staff_work_windows")
        .insert({
          center_id: centerId!,
          day_of_week: 3,
          end_time: "12:00",
          notes: `${runtimeWorkWindowNotesPrefix}-coach-denied-${getRuntimeStamp()}`,
          organization_id: organizationId!,
          person_profile_id: personProfileId!,
          start_time: "10:00",
          status: "active",
          valid_from: "2026-12-30",
          valid_until: null,
        })
        .select("id");

      expectNoStaffWorkWindowPermissionDenied(
        deniedInsert.error,
        "coach denied insert should be an RLS/role denial, not a missing table grant",
      );
      expect(deniedInsert.error).toBeTruthy();
      expect(deniedInsert.data ?? []).toHaveLength(0);
    });

    test("owner cannot update a staff work window from another tenant when scoped to the active organization", async () => {
      const otherWindowBefore = getOtherTenantStaffWorkWindowSnapshot();

      test.skip(
        !otherWindowBefore,
        "Hace falta al menos una franja de jornada prevista de otro tenant en Supabase local para validar ID ajeno.",
      );

      const ownerClient = await createRuntimeClient(ownerCredentials!);
      const attemptedNotes = `${runtimeWorkWindowNotesPrefix}-cross-tenant-${getRuntimeStamp()}`;
      const foreignUpdate = await ownerClient
        .from("staff_work_windows")
        .update({ notes: attemptedNotes })
        .eq("id", otherWindowBefore!.id)
        .eq("organization_id", organizationId!)
        .select("id, notes");

      expectNoStaffWorkWindowPermissionDenied(
        foreignUpdate.error,
        "cross-tenant scoped update should not fail because of missing table grants",
      );
      expect(foreignUpdate.error).toBeNull();
      expect(foreignUpdate.data ?? []).toHaveLength(0);

      const otherWindowAfter = getStaffWorkWindowSnapshotById(
        otherWindowBefore!.id,
      );

      expect(otherWindowAfter).toMatchObject({
        centerId: otherWindowBefore!.centerId,
        dayOfWeek: otherWindowBefore!.dayOfWeek,
        endTime: otherWindowBefore!.endTime,
        id: otherWindowBefore!.id,
        notes: otherWindowBefore!.notes,
        organizationId: otherWindowBefore!.organizationId,
        personProfileId: otherWindowBefore!.personProfileId,
        startTime: otherWindowBefore!.startTime,
        status: otherWindowBefore!.status,
        validFrom: otherWindowBefore!.validFrom,
        validUntil: otherWindowBefore!.validUntil,
      });
    });
  },
);
