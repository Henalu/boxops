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

const runtimeTemplateNamePrefix =
  "e2e-direct-grants-schedule-templates-smoke";
const runtimeTemplateValidFrom = "2026-01-05";
const runtimeTemplateValidUntil = "2026-12-31";
const localDbContainer = "supabase_db_boxops";

type ScheduleTemplateError = {
  code?: string;
  details?: string | null;
  hint?: string | null;
  message?: string;
};

type ScheduleTemplateSnapshot = {
  centerId: string | null;
  id: string;
  name: string;
  organizationId: string;
  status: string;
  templateType: string;
  updatedAt: string;
  validFrom: string | null;
  validUntil: string | null;
};

const hasRuntimeConfig = Boolean(
  supabaseUrl &&
    supabaseAnonKey &&
    organizationId &&
    hasCredentials(ownerCredentials) &&
    hasCredentials(coachCredentials),
);

function getErrorText(error: ScheduleTemplateError | null) {
  if (!error) {
    return "";
  }

  return [error.code, error.message, error.details, error.hint]
    .filter(Boolean)
    .join(" ");
}

function expectNoScheduleTemplatePermissionDenied(
  error: ScheduleTemplateError | null,
  context: string,
) {
  expect(getErrorText(error), context).not.toMatch(
    /permission denied for table schedule_templates/i,
  );
}

function getRuntimeStamp() {
  return new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
}

function getOppositeScheduleTemplateStatus(status: string) {
  return status === "active" ? "draft" : "active";
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
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error("Expected a UUID.");
  }

  return value;
}

function normalizeNullablePsqlValue(value: string | undefined) {
  return value && value !== "__NULL__" ? value : null;
}

function readScheduleTemplateSnapshot(
  sql: string,
): ScheduleTemplateSnapshot | null {
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
      name,
      snapshotOrganizationId,
      status,
      templateType,
      centerId,
      validFrom,
      validUntil,
      updatedAt,
    ] = output.split("\t");

    if (
      !id ||
      !name ||
      !snapshotOrganizationId ||
      !status ||
      !templateType ||
      !updatedAt
    ) {
      return null;
    }

    return {
      centerId: normalizeNullablePsqlValue(centerId),
      id,
      name,
      organizationId: snapshotOrganizationId,
      status,
      templateType,
      updatedAt,
      validFrom: normalizeNullablePsqlValue(validFrom),
      validUntil: normalizeNullablePsqlValue(validUntil),
    };
  } catch {
    return null;
  }
}

function getOtherTenantScheduleTemplateSnapshot() {
  return readScheduleTemplateSnapshot(`
    select id, name, organization_id, status, template_type, center_id, valid_from, valid_until, updated_at
    from public.schedule_templates
    where organization_id <> '${toSqlUuid(organizationId!)}'::uuid
      and status <> 'archived'
    order by name
    limit 1;
  `);
}

function getScheduleTemplateSnapshotById(templateId: string) {
  return readScheduleTemplateSnapshot(`
    select id, name, organization_id, status, template_type, center_id, valid_from, valid_until, updated_at
    from public.schedule_templates
    where id = '${toSqlUuid(templateId)}'::uuid
    limit 1;
  `);
}

test.describe.serial(
  "tenant direct grants runtime smoke: schedule_templates",
  () => {
    test.skip(
      !hasRuntimeConfig,
      "Configura Supabase local, E2E_OWNER_*, E2E_COACH_* y E2E_ORGANIZATION_ID para ejecutar el smoke runtime de schedule_templates.",
    );

    test("authorized owner can insert/update a tenant schedule template without table permission denial", async () => {
      const ownerClient = await createRuntimeClient(ownerCredentials!);
      const selectExisting = await ownerClient
        .from("schedule_templates")
        .select("id, organization_id, status")
        .eq("organization_id", organizationId!)
        .eq("template_type", "weekly")
        .neq("status", "archived")
        .ilike("name", `${runtimeTemplateNamePrefix}%`)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      expectNoScheduleTemplatePermissionDenied(
        selectExisting.error,
        "owner baseline select should not fail because of direct table grants",
      );
      expect(selectExisting.error).toBeNull();

      let templateId = selectExisting.data?.id;
      let currentStatus = selectExisting.data?.status ?? "draft";

      if (!templateId) {
        const insertResult = await ownerClient
          .from("schedule_templates")
          .insert({
            center_id: null,
            metadata: { smoke_key: runtimeTemplateNamePrefix },
            name: runtimeTemplateNamePrefix,
            organization_id: organizationId!,
            status: "draft",
            template_type: "weekly",
            valid_from: null,
            valid_until: null,
          })
          .select("id, status")
          .single();

        expectNoScheduleTemplatePermissionDenied(
          insertResult.error,
          "owner baseline insert should not fail because of direct table grants",
        );
        expect(insertResult.error).toBeNull();
        templateId = insertResult.data?.id;
        currentStatus = insertResult.data?.status ?? "draft";
      }

      expect(templateId).toBeTruthy();

      const updatedName = `${runtimeTemplateNamePrefix}-${getRuntimeStamp()}`;
      const updatedStatus = getOppositeScheduleTemplateStatus(currentStatus);
      const updateResult = await ownerClient
        .from("schedule_templates")
        .update({
          center_id: null,
          name: updatedName,
          status: updatedStatus,
          valid_from: runtimeTemplateValidFrom,
          valid_until: runtimeTemplateValidUntil,
        })
        .eq("id", templateId!)
        .eq("organization_id", organizationId!)
        .eq("template_type", "weekly")
        .select(
          "id, center_id, name, organization_id, status, template_type, valid_from, valid_until",
        )
        .single();

      expectNoScheduleTemplatePermissionDenied(
        updateResult.error,
        "owner baseline update should not fail because of direct table grants",
      );
      expect(updateResult.error).toBeNull();
      expect(updateResult.data).toMatchObject({
        center_id: null,
        id: templateId,
        name: updatedName,
        organization_id: organizationId,
        status: updatedStatus,
        template_type: "weekly",
        valid_from: runtimeTemplateValidFrom,
        valid_until: runtimeTemplateValidUntil,
      });
    });

    test("coach cannot insert schedule templates through direct authenticated DML", async () => {
      const coachClient = await createRuntimeClient(coachCredentials!);
      const stamp = getRuntimeStamp();
      const deniedInsert = await coachClient
        .from("schedule_templates")
        .insert({
          center_id: null,
          metadata: { smoke_key: runtimeTemplateNamePrefix },
          name: `${runtimeTemplateNamePrefix}-coach-denied-${stamp}`,
          organization_id: organizationId!,
          status: "draft",
          template_type: "weekly",
          valid_from: null,
          valid_until: null,
        })
        .select("id");

      expectNoScheduleTemplatePermissionDenied(
        deniedInsert.error,
        "coach denied insert should be an RLS/role denial, not a missing table grant",
      );
      expect(deniedInsert.error).toBeTruthy();
      expect(deniedInsert.data ?? []).toHaveLength(0);
    });

    test("owner cannot update a schedule template from another tenant when scoped to the active organization", async () => {
      const otherTemplateBefore = getOtherTenantScheduleTemplateSnapshot();

      test.skip(
        !otherTemplateBefore,
        "Hace falta al menos una plantilla no archivada de otro tenant en Supabase local para validar ID ajeno.",
      );

      const ownerClient = await createRuntimeClient(ownerCredentials!);
      const attemptedName = `${runtimeTemplateNamePrefix}-cross-tenant-${getRuntimeStamp()}`;
      const foreignUpdate = await ownerClient
        .from("schedule_templates")
        .update({ name: attemptedName })
        .eq("id", otherTemplateBefore!.id)
        .eq("organization_id", organizationId!)
        .eq("template_type", "weekly")
        .select("id, name");

      expectNoScheduleTemplatePermissionDenied(
        foreignUpdate.error,
        "cross-tenant scoped update should not fail because of missing table grants",
      );
      expect(foreignUpdate.error).toBeNull();
      expect(foreignUpdate.data ?? []).toHaveLength(0);

      const otherTemplateAfter = getScheduleTemplateSnapshotById(
        otherTemplateBefore!.id,
      );

      expect(otherTemplateAfter).toMatchObject({
        centerId: otherTemplateBefore!.centerId,
        id: otherTemplateBefore!.id,
        name: otherTemplateBefore!.name,
        organizationId: otherTemplateBefore!.organizationId,
        status: otherTemplateBefore!.status,
        templateType: otherTemplateBefore!.templateType,
        validFrom: otherTemplateBefore!.validFrom,
        validUntil: otherTemplateBefore!.validUntil,
      });
    });
  },
);
