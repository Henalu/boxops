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
  "e2e-direct-grants-schedule-template-blocks-smoke";
const runtimeTemplateName =
  "e2e-direct-grants-schedule-template-blocks-smoke-template";
const localDbContainer = "supabase_db_boxops";

type ScheduleTemplateBlockError = {
  code?: string;
  details?: string | null;
  hint?: string | null;
  message?: string;
};

type ScheduleTemplateBlockSnapshot = {
  centerId: string;
  classTypeId: string;
  dayOfWeek: number;
  defaultCoachProfileId: string | null;
  endTime: string;
  id: string;
  notes: string | null;
  organizationId: string;
  requiredCoaches: number;
  startTime: string;
  templateId: string;
  updatedAt: string;
};

const hasRuntimeConfig = Boolean(
  supabaseUrl &&
    supabaseAnonKey &&
    organizationId &&
    hasCredentials(ownerCredentials) &&
    hasCredentials(coachCredentials),
);

function getErrorText(error: ScheduleTemplateBlockError | null) {
  if (!error) {
    return "";
  }

  return [error.code, error.message, error.details, error.hint]
    .filter(Boolean)
    .join(" ");
}

function expectNoScheduleTemplateBlockPermissionDenied(
  error: ScheduleTemplateBlockError | null,
  context: string,
) {
  expect(getErrorText(error), context).not.toMatch(
    /permission denied for table schedule_template_blocks/i,
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

function readScheduleTemplateBlockSnapshot(
  sql: string,
): ScheduleTemplateBlockSnapshot | null {
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

    if (!output) {
      return null;
    }

    const [
      id,
      snapshotOrganizationId,
      templateId,
      centerId,
      classTypeId,
      dayOfWeek,
      startTime,
      endTime,
      requiredCoaches,
      defaultCoachProfileId,
      notes,
      updatedAt,
    ] = output.split("\t");

    if (
      !id ||
      !snapshotOrganizationId ||
      !templateId ||
      !centerId ||
      !classTypeId ||
      !dayOfWeek ||
      !startTime ||
      !endTime ||
      !requiredCoaches ||
      !updatedAt
    ) {
      return null;
    }

    return {
      centerId,
      classTypeId,
      dayOfWeek: Number(dayOfWeek),
      defaultCoachProfileId: normalizeNullablePsqlValue(
        defaultCoachProfileId,
      ),
      endTime,
      id,
      notes: normalizeNullablePsqlValue(notes),
      organizationId: snapshotOrganizationId,
      requiredCoaches: Number(requiredCoaches),
      startTime,
      templateId,
      updatedAt,
    };
  } catch {
    return null;
  }
}

function getOtherTenantScheduleTemplateBlockSnapshot() {
  return readScheduleTemplateBlockSnapshot(`
    select id, organization_id, template_id, center_id, class_type_id, day_of_week, start_time, end_time, required_coaches, default_coach_profile_id, notes, updated_at
    from public.schedule_template_blocks
    where organization_id <> '${toSqlUuid(organizationId!)}'::uuid
    order by created_at desc
    limit 1;
  `);
}

function getScheduleTemplateBlockSnapshotById(templateBlockId: string) {
  return readScheduleTemplateBlockSnapshot(`
    select id, organization_id, template_id, center_id, class_type_id, day_of_week, start_time, end_time, required_coaches, default_coach_profile_id, notes, updated_at
    from public.schedule_template_blocks
    where id = '${toSqlUuid(templateBlockId)}'::uuid
    limit 1;
  `);
}

async function getTenantReferenceId(
  ownerClient: Awaited<ReturnType<typeof createRuntimeClient>>,
  table: "centers" | "class_types",
) {
  const result = await ownerClient
    .from(table)
    .select("id")
    .eq("organization_id", organizationId!)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  expect(result.error).toBeNull();

  return result.data?.id ?? null;
}

async function ensureRuntimeTemplateId(
  ownerClient: Awaited<ReturnType<typeof createRuntimeClient>>,
) {
  const selectExisting = await ownerClient
    .from("schedule_templates")
    .select("id")
    .eq("organization_id", organizationId!)
    .eq("template_type", "weekly")
    .eq("name", runtimeTemplateName)
    .maybeSingle();

  expect(selectExisting.error).toBeNull();

  if (selectExisting.data?.id) {
    return selectExisting.data.id;
  }

  const insertResult = await ownerClient
    .from("schedule_templates")
    .insert({
      center_id: null,
      metadata: { smoke_key: runtimeBlockNotesPrefix },
      name: runtimeTemplateName,
      organization_id: organizationId!,
      status: "draft",
      template_type: "weekly",
      valid_from: null,
      valid_until: null,
    })
    .select("id")
    .single();

  expect(insertResult.error).toBeNull();

  return insertResult.data?.id ?? null;
}

test.describe.serial(
  "tenant direct grants runtime smoke: schedule_template_blocks",
  () => {
    test.skip(
      !hasRuntimeConfig,
      "Configura Supabase local, E2E_OWNER_*, E2E_COACH_* y E2E_ORGANIZATION_ID para ejecutar el smoke runtime de schedule_template_blocks.",
    );

    test("authorized owner can insert/update a tenant schedule template block without table permission denial", async () => {
      const ownerClient = await createRuntimeClient(ownerCredentials!);
      const [centerId, classTypeId] = await Promise.all([
        getTenantReferenceId(ownerClient, "centers"),
        getTenantReferenceId(ownerClient, "class_types"),
      ]);

      test.skip(
        !centerId || !classTypeId,
        "Hace falta al menos un centro y un tipo del tenant E2E para validar bloques de plantilla.",
      );

      const templateId = await ensureRuntimeTemplateId(ownerClient);

      test.skip(
        !templateId,
        "Hace falta una plantilla sintetica del tenant E2E para validar bloques de plantilla.",
      );

      const selectExisting = await ownerClient
        .from("schedule_template_blocks")
        .select("id, organization_id")
        .eq("organization_id", organizationId!)
        .eq("template_id", templateId!)
        .ilike("notes", `${runtimeBlockNotesPrefix}%`)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      expectNoScheduleTemplateBlockPermissionDenied(
        selectExisting.error,
        "owner baseline select should not fail because of direct table grants",
      );
      expect(selectExisting.error).toBeNull();

      let templateBlockId = selectExisting.data?.id;

      if (!templateBlockId) {
        const insertResult = await ownerClient
          .from("schedule_template_blocks")
          .insert({
            center_id: centerId!,
            class_type_id: classTypeId!,
            day_of_week: 1,
            default_coach_profile_id: null,
            end_time: "08:00",
            metadata: { smoke_key: runtimeBlockNotesPrefix },
            notes: `${runtimeBlockNotesPrefix}-insert`,
            organization_id: organizationId!,
            required_coaches: 0,
            start_time: "07:00",
            template_id: templateId!,
          })
          .select("id")
          .single();

        expectNoScheduleTemplateBlockPermissionDenied(
          insertResult.error,
          "owner baseline insert should not fail because of direct table grants",
        );
        expect(insertResult.error).toBeNull();
        templateBlockId = insertResult.data?.id;
      }

      expect(templateBlockId).toBeTruthy();

      const updatedNotes = `${runtimeBlockNotesPrefix}-updated-${getRuntimeStamp()}`;
      const updateResult = await ownerClient
        .from("schedule_template_blocks")
        .update({
          center_id: centerId!,
          class_type_id: classTypeId!,
          day_of_week: 2,
          default_coach_profile_id: null,
          end_time: "09:30",
          notes: updatedNotes,
          required_coaches: 1,
          start_time: "08:15",
        })
        .eq("id", templateBlockId!)
        .eq("organization_id", organizationId!)
        .select(
          "id, center_id, class_type_id, day_of_week, default_coach_profile_id, end_time, notes, organization_id, required_coaches, start_time, template_id",
        )
        .single();

      expectNoScheduleTemplateBlockPermissionDenied(
        updateResult.error,
        "owner baseline update should not fail because of direct table grants",
      );
      expect(updateResult.error).toBeNull();
      expect(updateResult.data).toMatchObject({
        center_id: centerId,
        class_type_id: classTypeId,
        day_of_week: 2,
        default_coach_profile_id: null,
        id: templateBlockId,
        notes: updatedNotes,
        organization_id: organizationId,
        required_coaches: 1,
        template_id: templateId,
      });
      expect(updateResult.data?.start_time.slice(0, 5)).toBe("08:15");
      expect(updateResult.data?.end_time.slice(0, 5)).toBe("09:30");
    });

    test("coach cannot insert schedule template blocks through direct authenticated DML", async () => {
      const ownerClient = await createRuntimeClient(ownerCredentials!);
      const [centerId, classTypeId] = await Promise.all([
        getTenantReferenceId(ownerClient, "centers"),
        getTenantReferenceId(ownerClient, "class_types"),
      ]);

      test.skip(
        !centerId || !classTypeId,
        "Hace falta al menos un centro y un tipo del tenant E2E para validar el negativo de coach.",
      );

      const templateId = await ensureRuntimeTemplateId(ownerClient);

      test.skip(
        !templateId,
        "Hace falta una plantilla sintetica del tenant E2E para validar el negativo de coach.",
      );

      const coachClient = await createRuntimeClient(coachCredentials!);
      const deniedInsert = await coachClient
        .from("schedule_template_blocks")
        .insert({
          center_id: centerId!,
          class_type_id: classTypeId!,
          day_of_week: 3,
          default_coach_profile_id: null,
          end_time: "10:00",
          metadata: { smoke_key: runtimeBlockNotesPrefix },
          notes: `${runtimeBlockNotesPrefix}-coach-denied-${getRuntimeStamp()}`,
          organization_id: organizationId!,
          required_coaches: 1,
          start_time: "09:00",
          template_id: templateId!,
        })
        .select("id");

      expectNoScheduleTemplateBlockPermissionDenied(
        deniedInsert.error,
        "coach denied insert should be an RLS/role denial, not a missing table grant",
      );
      expect(deniedInsert.error).toBeTruthy();
      expect(deniedInsert.data ?? []).toHaveLength(0);
    });

    test("owner cannot update a schedule template block from another tenant when scoped to the active organization", async () => {
      const otherBlockBefore = getOtherTenantScheduleTemplateBlockSnapshot();

      test.skip(
        !otherBlockBefore,
        "Hace falta al menos un bloque de plantilla de otro tenant en Supabase local para validar ID ajeno.",
      );

      const ownerClient = await createRuntimeClient(ownerCredentials!);
      const attemptedNotes = `${runtimeBlockNotesPrefix}-cross-tenant-${getRuntimeStamp()}`;
      const foreignUpdate = await ownerClient
        .from("schedule_template_blocks")
        .update({ notes: attemptedNotes })
        .eq("id", otherBlockBefore!.id)
        .eq("organization_id", organizationId!)
        .select("id, notes");

      expectNoScheduleTemplateBlockPermissionDenied(
        foreignUpdate.error,
        "cross-tenant scoped update should not fail because of missing table grants",
      );
      expect(foreignUpdate.error).toBeNull();
      expect(foreignUpdate.data ?? []).toHaveLength(0);

      const otherBlockAfter = getScheduleTemplateBlockSnapshotById(
        otherBlockBefore!.id,
      );

      expect(otherBlockAfter).toMatchObject({
        centerId: otherBlockBefore!.centerId,
        classTypeId: otherBlockBefore!.classTypeId,
        dayOfWeek: otherBlockBefore!.dayOfWeek,
        defaultCoachProfileId: otherBlockBefore!.defaultCoachProfileId,
        endTime: otherBlockBefore!.endTime,
        id: otherBlockBefore!.id,
        notes: otherBlockBefore!.notes,
        organizationId: otherBlockBefore!.organizationId,
        requiredCoaches: otherBlockBefore!.requiredCoaches,
        startTime: otherBlockBefore!.startTime,
        templateId: otherBlockBefore!.templateId,
      });
    });
  },
);
