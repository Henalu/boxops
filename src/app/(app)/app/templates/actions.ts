"use server";

import { redirect } from "next/navigation";

import { getLoginPath } from "@/lib/auth/redirects";
import { canManageOperationalData } from "@/lib/auth/permissions";
import {
  getActiveMemberships,
  getAuthenticatedUser,
  resolveActiveOrganization,
} from "@/lib/auth/tenant";
import {
  getSchedulePath,
  getScheduleTemplatesPath,
} from "@/lib/navigation/app-paths";
import { resolveWeek } from "@/lib/schedule-blocks";
import {
  applyScheduleTemplateWeek,
  ensureScheduleTemplateRangeApplied,
} from "@/lib/schedule-template-application";
import {
  getUnavailableScheduleTemplateCoachBlocks,
  isScheduleTemplateUuid,
  scheduleTemplateBlockRequiresCoach,
  validateScheduleTemplateBlockForm,
  validateScheduleTemplateForm,
  type ScheduleTemplateCoachAvailabilityBlockInput,
} from "@/lib/schedule-templates";
import {
  addAuditFieldChange,
  auditFieldChange,
  auditFieldSet,
  auditFieldTouched,
  recordOperationalAuditEvent,
  type OperationalAuditChangedFields,
} from "@/lib/operational-audit";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/supabase";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
type TemplateMetadata = { [key: string]: Json | undefined };

const TEMPLATE_RECOVERY_DAYS = 30;
const BULK_KEEP_VALUE = "keep";
const TEMPLATE_BLOCK_DELETE_CONFIRMATION_VALUE = "1";

function getRequiredFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

function getOptionalFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : null;
}

function getTemplateMetadataObject(value: unknown): TemplateMetadata {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as TemplateMetadata) }
    : {};
}

function getTemplateArchiveWindow() {
  const archivedAt = new Date();
  const recoverableUntil = new Date(
    archivedAt.getTime() + TEMPLATE_RECOVERY_DAYS * 24 * 60 * 60 * 1000,
  );

  return {
    archivedAt: archivedAt.toISOString(),
    recoverableUntil: recoverableUntil.toISOString(),
  };
}

function getScheduleTemplateCreatedAuditFields(values: {
  centerId: string | null;
  name: string;
  status: string;
  validFrom: string | null;
  validUntil: string | null;
}): OperationalAuditChangedFields {
  return {
    center_id: auditFieldSet(values.centerId),
    name: auditFieldTouched(),
    status: auditFieldSet(values.status),
    valid_from: auditFieldSet(values.validFrom),
    valid_until: auditFieldSet(values.validUntil),
  };
}

function getScheduleTemplateBlockCreatedAuditFields(values: {
  centerId: string;
  classTypeId: string;
  dayOfWeek: number;
  defaultCoachProfileId: string | null;
  endTime: string;
  notes: string | null;
  requiredCoaches: number;
  startTime: string;
}): OperationalAuditChangedFields {
  return {
    center_id: auditFieldSet(values.centerId),
    class_type_id: auditFieldSet(values.classTypeId),
    day_of_week: auditFieldSet(values.dayOfWeek),
    default_coach_profile_id: auditFieldSet(values.defaultCoachProfileId),
    end_time: auditFieldSet(values.endTime),
    ...(values.notes ? { notes: auditFieldTouched() } : {}),
    required_coaches: auditFieldSet(values.requiredCoaches),
    start_time: auditFieldSet(values.startTime),
  };
}

function getScheduleTemplateBlockRemovedAuditFields(values: {
  block: {
    center_id: string;
    class_type_id: string;
    day_of_week: number;
    default_coach_profile_id: string | null;
    end_time: string;
    notes: string | null;
    required_coaches: number;
    start_time: string;
  };
  bulkSize: number;
  detachedScheduleBlockCount: number;
  removedScheduleBlockCount: number;
}): OperationalAuditChangedFields {
  return {
    bulk_size: auditFieldSet(values.bulkSize),
    center_id: auditFieldSet(values.block.center_id),
    class_type_id: auditFieldSet(values.block.class_type_id),
    day_of_week: auditFieldSet(values.block.day_of_week),
    default_coach_profile_id: auditFieldSet(
      values.block.default_coach_profile_id,
    ),
    detached_schedule_blocks: auditFieldSet(
      values.detachedScheduleBlockCount,
    ),
    end_time: auditFieldSet(values.block.end_time.slice(0, 5)),
    ...(values.block.notes ? { notes: auditFieldTouched() } : {}),
    removed_schedule_blocks: auditFieldSet(values.removedScheduleBlockCount),
    required_coaches: auditFieldSet(values.block.required_coaches),
    start_time: auditFieldSet(values.block.start_time.slice(0, 5)),
  };
}

function getTemplateView(formData: FormData) {
  return getRequiredFormString(formData, "view") === "agenda"
    ? "agenda"
    : "week";
}

function getTemplateDay(formData: FormData) {
  const day = Number(getRequiredFormString(formData, "day"));

  return Number.isInteger(day) && day >= 1 && day <= 7 ? String(day) : "1";
}

function getErrorPath(
  organizationId: string | null,
  week: string | null,
  error: string,
  view?: string | null,
  day?: string | null,
) {
  return getScheduleTemplatesPath({
    day,
    error,
    organizationId,
    view,
    week,
  });
}

async function getOperationalActionContext(formData: FormData) {
  const organizationId = getRequiredFormString(formData, "organizationId");
  const rawWeekStart = getRequiredFormString(formData, "weekStart");
  const day = getTemplateDay(formData);
  const view = getTemplateView(formData);
  const redirectPath = getScheduleTemplatesPath({
    day,
    organizationId,
    view,
    week: rawWeekStart || null,
  });
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect(getLoginPath(redirectPath));
  }

  const memberships = await getActiveMemberships(user.id);
  const resolution = resolveActiveOrganization(memberships, organizationId);

  if (!resolution.ok) {
    redirect(
      getErrorPath(
        organizationId,
        rawWeekStart || null,
        resolution.reason,
        view,
        day,
      ),
    );
  }

  if (!canManageOperationalData(resolution.membership.role)) {
    redirect(
      getErrorPath(
        resolution.organization.id,
        rawWeekStart || null,
        "forbidden",
        view,
        day,
      ),
    );
  }

  const week = resolveWeek(rawWeekStart || undefined, resolution.organization.timezone);

  return {
    day,
    organization: resolution.organization,
    userId: user.id,
    view,
    weekStart: week.weekStart,
  };
}

function getMutationError(errorCode?: string) {
  if (errorCode === "23P01") {
    return "coach-unavailable";
  }

  if (errorCode === "23503") {
    return "invalid-reference";
  }

  if (errorCode === "23514") {
    return "invalid-template-data";
  }

  return "save-failed";
}

function getTemplateSyncError(status: string) {
  if (status === "coach-unavailable") {
    return "template-sync-coach-unavailable";
  }

  if (status === "invalid-coach") {
    return "template-sync-invalid-coach";
  }

  if (status === "save-failed") {
    return "template-sync-failed";
  }

  return null;
}

async function loadTemplateForMutation({
  organizationId,
  supabase,
  templateId,
}: {
  organizationId: string;
  supabase: SupabaseServerClient;
  templateId: string;
}) {
  const { data: template, error } = await supabase
    .from("schedule_templates")
    .select(
      "id, status, template_type, metadata, archived_at, recoverable_until",
    )
    .eq("id", templateId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error || !template || template.template_type !== "weekly") {
    return {
      error: "invalid-template" as const,
      template: null,
    };
  }

  return {
    error: null,
    template,
  };
}

async function validateOptionalCenterReference({
  centerId,
  organizationId,
  supabase,
}: {
  centerId: string | null;
  organizationId: string;
  supabase: SupabaseServerClient;
}) {
  if (!centerId) {
    return null;
  }

  const { data, error } = await supabase
    .from("centers")
    .select("id")
    .eq("id", centerId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  return error || !data ? "invalid-center" : null;
}

async function validateTemplateReference({
  organizationId,
  requireActive,
  supabase,
  templateId,
}: {
  organizationId: string;
  requireActive?: boolean;
  supabase: SupabaseServerClient;
  templateId: string;
}) {
  const { data: template, error } = await supabase
    .from("schedule_templates")
    .select("id, center_id, status, template_type")
    .eq("id", templateId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error || !template || template.template_type !== "weekly") {
    return {
      error: "invalid-template",
      template: null,
    };
  }

  if (template.status === "archived") {
    return {
      error: "template-archived",
      template: null,
    };
  }

  if (requireActive && template.status !== "active") {
    return {
      error: "template-not-active",
      template: null,
    };
  }

  return {
    error: null,
    template,
  };
}

async function validateAssignableCoach({
  coachProfileId,
  organizationId,
  supabase,
}: {
  coachProfileId: string;
  organizationId: string;
  supabase: SupabaseServerClient;
}) {
  const { data: coachProfile, error: coachError } = await supabase
    .from("coach_profiles")
    .select("id, person_profile_id, status, user_id")
    .eq("id", coachProfileId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (coachError || !coachProfile || coachProfile.status !== "active") {
    return "invalid-coach";
  }

  if (!coachProfile.user_id && !coachProfile.person_profile_id) {
    return "invalid-coach";
  }

  if (coachProfile.person_profile_id) {
    const { data: personProfile, error: personError } = await supabase
      .from("person_profiles")
      .select("id, status, visibility_status")
      .eq("id", coachProfile.person_profile_id)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (
      personError ||
      !personProfile ||
      personProfile.status !== "active" ||
      personProfile.visibility_status !== "visible"
    ) {
      return "invalid-coach";
    }
  }

  if (coachProfile.user_id) {
    const { data: membership, error: membershipError } = await supabase
      .from("organization_memberships")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("user_id", coachProfile.user_id)
      .eq("status", "active")
      .maybeSingle();

    if (membershipError || !membership) {
      return "invalid-coach";
    }
  }

  return null;
}

async function validateTemplateBlockReferences({
  centerId,
  classTypeId,
  defaultCoachProfileId,
  organizationId,
  supabase,
  templateId,
}: {
  centerId: string;
  classTypeId: string;
  defaultCoachProfileId: string | null;
  organizationId: string;
  supabase: SupabaseServerClient;
  templateId: string;
}): Promise<{
  centerId: string | null;
  error: string | null;
}> {
  const [templateResult, centerResult, classTypeResult] = await Promise.all([
    validateTemplateReference({
      organizationId,
      supabase,
      templateId,
    }),
    supabase
      .from("centers")
      .select("id")
      .eq("id", centerId)
      .eq("organization_id", organizationId)
      .maybeSingle(),
    supabase
      .from("class_types")
      .select("id")
      .eq("id", classTypeId)
      .eq("organization_id", organizationId)
      .maybeSingle(),
  ]);

  if (templateResult.error || !templateResult.template) {
    return {
      centerId: null,
      error: templateResult.error ?? "invalid-template",
    };
  }

  const scopedCenterId = templateResult.template.center_id ?? centerId;

  const scopedCenterResult =
    scopedCenterId === centerId
      ? centerResult
      : await supabase
          .from("centers")
          .select("id")
          .eq("id", scopedCenterId)
          .eq("organization_id", organizationId)
          .maybeSingle();

  if (scopedCenterResult.error || !scopedCenterResult.data) {
    return {
      centerId: null,
      error: "invalid-center",
    };
  }

  if (classTypeResult.error || !classTypeResult.data) {
    return {
      centerId: null,
      error: "invalid-class-type",
    };
  }

  if (defaultCoachProfileId) {
    const coachError = await validateAssignableCoach({
      coachProfileId: defaultCoachProfileId,
      organizationId,
      supabase,
    });

    if (coachError) {
      return {
        centerId: null,
        error: coachError,
      };
    }
  }

  return {
    centerId: scopedCenterId,
    error: null,
  };
}

async function validateTemplateDefaultCoachAvailability({
  defaultCoachProfileId,
  dayOfWeek,
  endTime,
  organizationId,
  startTime,
  supabase,
  templateBlockId,
  templateId,
}: {
  defaultCoachProfileId: string | null;
  dayOfWeek: number;
  endTime: string;
  organizationId: string;
  startTime: string;
  supabase: SupabaseServerClient;
  templateBlockId?: string | null;
  templateId: string;
}) {
  if (!defaultCoachProfileId) {
    return null;
  }

  const { data: blocks, error } = await supabase
    .from("schedule_template_blocks")
    .select("id, day_of_week, start_time, end_time, default_coach_profile_id")
    .eq("organization_id", organizationId)
    .eq("template_id", templateId)
    .eq("day_of_week", dayOfWeek)
    .eq("default_coach_profile_id", defaultCoachProfileId);

  if (error) {
    return "save-failed";
  }

  const availabilityBlocks =
    (blocks ?? []) satisfies ScheduleTemplateCoachAvailabilityBlockInput[];

  const unavailableBlocks = getUnavailableScheduleTemplateCoachBlocks({
    blocks: availabilityBlocks,
    targetBlock: {
      day_of_week: dayOfWeek,
      end_time: endTime,
      id: templateBlockId ?? null,
      start_time: startTime,
    },
  });

  return unavailableBlocks.some(
    (block) => block.coachProfileId === defaultCoachProfileId,
  )
    ? "coach-unavailable"
    : null;
}

export async function createScheduleTemplate(formData: FormData) {
  const context = await getOperationalActionContext(formData);
  const validation = validateScheduleTemplateForm(formData);

  if (!validation.ok) {
    redirect(
      getErrorPath(
        context.organization.id,
        context.weekStart,
        validation.error,
        context.view,
        context.day,
      ),
    );
  }

  if (validation.values.status === "archived") {
    redirect(
      getErrorPath(
        context.organization.id,
        context.weekStart,
        "template-archive-confirmation-required",
        context.view,
        context.day,
      ),
    );
  }

  const supabase = await createClient();
  const centerError = await validateOptionalCenterReference({
    centerId: validation.values.centerId,
    organizationId: context.organization.id,
    supabase,
  });

  if (centerError) {
    redirect(
      getErrorPath(
        context.organization.id,
        context.weekStart,
        centerError,
        context.view,
        context.day,
      ),
    );
  }

  const { data: template, error } = await supabase
    .from("schedule_templates")
    .insert({
      center_id: validation.values.centerId,
      name: validation.values.name,
      organization_id: context.organization.id,
      status: validation.values.status,
      template_type: "weekly",
      valid_from: validation.values.validFrom,
      valid_until: validation.values.validUntil,
    })
    .select("id")
    .single();

  if (error) {
    redirect(
      getErrorPath(
        context.organization.id,
        context.weekStart,
        getMutationError(error.code),
        context.view,
        context.day,
      ),
    );
  }

  if (template) {
    const syncStatus = await ensureScheduleTemplateRangeApplied({
      organizationId: context.organization.id,
      supabase,
      templateId: template.id,
      timezone: context.organization.timezone,
    });
    const syncError = getTemplateSyncError(syncStatus);

    if (syncError) {
      redirect(
        getErrorPath(
          context.organization.id,
          context.weekStart,
          syncError,
          context.view,
          context.day,
        ),
      );
    }

    await recordOperationalAuditEvent({
      action: "created",
      changedFields: getScheduleTemplateCreatedAuditFields(validation.values),
      entityId: template.id,
      entityType: "schedule_templates",
      organizationId: context.organization.id,
      supabase,
    });
  }

  redirect(
    getScheduleTemplatesPath({
      day: context.day,
      organizationId: context.organization.id,
      status: "template-created",
      view: context.view,
      week: context.weekStart,
    }),
  );
}

export async function updateScheduleTemplate(formData: FormData) {
  const context = await getOperationalActionContext(formData);
  const templateId = getRequiredFormString(formData, "templateId");
  const validation = validateScheduleTemplateForm(formData);

  if (!templateId) {
    redirect(
      getErrorPath(
        context.organization.id,
        context.weekStart,
        "template-required",
        context.view,
        context.day,
      ),
    );
  }

  if (!isScheduleTemplateUuid(templateId)) {
    redirect(
      getErrorPath(
        context.organization.id,
        context.weekStart,
        "invalid-template",
        context.view,
        context.day,
      ),
    );
  }

  if (!validation.ok) {
    redirect(
      getErrorPath(
        context.organization.id,
        context.weekStart,
        validation.error,
        context.view,
        context.day,
      ),
    );
  }

  if (validation.values.status === "archived") {
    redirect(
      getErrorPath(
        context.organization.id,
        context.weekStart,
        "template-archive-confirmation-required",
        context.view,
        context.day,
      ),
    );
  }

  const supabase = await createClient();
  const templateResult = await validateTemplateReference({
    organizationId: context.organization.id,
    supabase,
    templateId,
  });

  if (templateResult.error || !templateResult.template) {
    redirect(
      getErrorPath(
        context.organization.id,
        context.weekStart,
        templateResult.error ?? "invalid-template",
        context.view,
        context.day,
      ),
    );
  }

  const { data: existingTemplate, error: existingTemplateError } = await supabase
    .from("schedule_templates")
    .select("id, center_id, name, status, valid_from, valid_until")
    .eq("id", templateId)
    .eq("organization_id", context.organization.id)
    .eq("template_type", "weekly")
    .maybeSingle();

  if (existingTemplateError || !existingTemplate) {
    redirect(
      getErrorPath(
        context.organization.id,
        context.weekStart,
        "invalid-template",
        context.view,
        context.day,
      ),
    );
  }

  const centerError = await validateOptionalCenterReference({
    centerId: validation.values.centerId,
    organizationId: context.organization.id,
    supabase,
  });

  if (centerError) {
    redirect(
      getErrorPath(
        context.organization.id,
        context.weekStart,
        centerError,
        context.view,
        context.day,
      ),
    );
  }

  const { error } = await supabase
    .from("schedule_templates")
    .update({
      center_id: validation.values.centerId,
      name: validation.values.name,
      status: validation.values.status,
      valid_from: validation.values.validFrom,
      valid_until: validation.values.validUntil,
    })
    .eq("id", templateId)
    .eq("organization_id", context.organization.id)
    .eq("template_type", "weekly")
    .select("id")
    .single();

  if (error) {
    redirect(
      getErrorPath(
        context.organization.id,
        context.weekStart,
        getMutationError(error.code),
        context.view,
        context.day,
      ),
    );
  }

  let alignedTemplateBlockCount = 0;

  if (validation.values.centerId) {
    const { data: alignedTemplateBlocks, error: alignedTemplateBlocksError } =
      await supabase
        .from("schedule_template_blocks")
        .update({ center_id: validation.values.centerId })
        .eq("organization_id", context.organization.id)
        .eq("template_id", templateId)
        .neq("center_id", validation.values.centerId)
        .select("id");

    if (alignedTemplateBlocksError) {
      redirect(
        getErrorPath(
          context.organization.id,
          context.weekStart,
          getMutationError(alignedTemplateBlocksError.code),
          context.view,
          context.day,
        ),
      );
    }

    alignedTemplateBlockCount = alignedTemplateBlocks?.length ?? 0;
  }

  const syncStatus = await ensureScheduleTemplateRangeApplied({
    organizationId: context.organization.id,
    supabase,
    templateId,
    timezone: context.organization.timezone,
  });
  const syncError = getTemplateSyncError(syncStatus);

  if (syncError) {
    redirect(
      getErrorPath(
        context.organization.id,
        context.weekStart,
        syncError,
        context.view,
        context.day,
      ),
    );
  }

  const changedFields: OperationalAuditChangedFields = {};
  addAuditFieldChange(
    changedFields,
    "center_id",
    existingTemplate.center_id,
    validation.values.centerId,
  );
  addAuditFieldChange(
    changedFields,
    "status",
    existingTemplate.status,
    validation.values.status,
  );
  addAuditFieldChange(
    changedFields,
    "valid_from",
    existingTemplate.valid_from,
    validation.values.validFrom,
  );
  addAuditFieldChange(
    changedFields,
    "valid_until",
    existingTemplate.valid_until,
    validation.values.validUntil,
  );

  if (existingTemplate.name !== validation.values.name) {
    changedFields.name = auditFieldTouched();
  }

  if (alignedTemplateBlockCount > 0 && validation.values.centerId) {
    changedFields.template_blocks_center_id = auditFieldSet(
      validation.values.centerId,
    );
    changedFields.template_blocks_aligned = auditFieldSet(
      alignedTemplateBlockCount,
    );
  }

  await recordOperationalAuditEvent({
    action: "updated",
    changedFields,
    entityId: templateId,
    entityType: "schedule_templates",
    organizationId: context.organization.id,
    supabase,
  });

  redirect(
    getScheduleTemplatesPath({
      day: context.day,
      organizationId: context.organization.id,
      status: "template-updated",
      view: context.view,
      week: context.weekStart,
    }),
  );
}

export async function archiveScheduleTemplate(formData: FormData) {
  const context = await getOperationalActionContext(formData);
  const templateId = getRequiredFormString(formData, "templateId");

  if (!templateId || !isScheduleTemplateUuid(templateId)) {
    redirect(
      getErrorPath(
        context.organization.id,
        context.weekStart,
        "invalid-template",
        context.view,
        context.day,
      ),
    );
  }

  const supabase = await createClient();
  const templateResult = await loadTemplateForMutation({
    organizationId: context.organization.id,
    supabase,
    templateId,
  });

  if (templateResult.error || !templateResult.template) {
    redirect(
      getErrorPath(
        context.organization.id,
        context.weekStart,
        templateResult.error ?? "invalid-template",
        context.view,
        context.day,
      ),
    );
  }

  if (templateResult.template.status === "archived") {
    redirect(
      getScheduleTemplatesPath({
        day: context.day,
        organizationId: context.organization.id,
        status: "template-archived",
        view: context.view,
        week: context.weekStart,
      }),
    );
  }

  const { archivedAt, recoverableUntil } = getTemplateArchiveWindow();
  const metadata = getTemplateMetadataObject(templateResult.template.metadata);

  metadata.archive = {
    archivedAt,
    archivedByUserId: context.userId,
    previousStatus: templateResult.template.status,
    recoverableUntil,
    retentionDays: TEMPLATE_RECOVERY_DAYS,
  };

  const { error } = await supabase
    .from("schedule_templates")
    .update({
      archived_at: archivedAt,
      metadata,
      recoverable_until: recoverableUntil,
      status: "archived",
    })
    .eq("id", templateId)
    .eq("organization_id", context.organization.id)
    .eq("template_type", "weekly")
    .select("id")
    .single();

  if (error) {
    redirect(
      getErrorPath(
        context.organization.id,
        context.weekStart,
        getMutationError(error.code),
        context.view,
        context.day,
      ),
    );
  }

  await recordOperationalAuditEvent({
    action: "archived",
    changedFields: {
      archived_at: auditFieldSet(archivedAt),
      recoverable_until: auditFieldSet(recoverableUntil),
      status: auditFieldChange(templateResult.template.status, "archived"),
    },
    entityId: templateId,
    entityType: "schedule_templates",
    organizationId: context.organization.id,
    supabase,
  });

  redirect(
    getScheduleTemplatesPath({
      day: context.day,
      organizationId: context.organization.id,
      status: "template-archived",
      view: context.view,
      week: context.weekStart,
    }),
  );
}

export async function restoreScheduleTemplate(formData: FormData) {
  const context = await getOperationalActionContext(formData);
  const templateId = getRequiredFormString(formData, "templateId");

  if (!templateId || !isScheduleTemplateUuid(templateId)) {
    redirect(
      getErrorPath(
        context.organization.id,
        context.weekStart,
        "invalid-template",
        context.view,
        context.day,
      ),
    );
  }

  const supabase = await createClient();
  const templateResult = await loadTemplateForMutation({
    organizationId: context.organization.id,
    supabase,
    templateId,
  });

  if (templateResult.error) {
    redirect(
      getErrorPath(
        context.organization.id,
        context.weekStart,
        templateResult.error,
        context.view,
        context.day,
      ),
    );
  }

  if (templateResult.template.status !== "archived") {
    redirect(
      getErrorPath(
        context.organization.id,
        context.weekStart,
        "invalid-template",
        context.view,
        context.day,
      ),
    );
  }

  const recoverableUntil = templateResult.template.recoverable_until;

  if (
    recoverableUntil &&
    new Date(recoverableUntil).getTime() < Date.now()
  ) {
    redirect(
      getErrorPath(
        context.organization.id,
        context.weekStart,
        "template-recovery-expired",
        context.view,
        context.day,
      ),
    );
  }

  const metadata = getTemplateMetadataObject(templateResult.template.metadata);
  const archiveMetadata = getTemplateMetadataObject(metadata.archive);

  metadata.archive = {
    ...archiveMetadata,
    recoveredAt: new Date().toISOString(),
    recoveredByUserId: context.userId,
    restoredStatus: "draft",
  };

  const { error } = await supabase
    .from("schedule_templates")
    .update({
      archived_at: null,
      metadata,
      recoverable_until: null,
      status: "draft",
    })
    .eq("id", templateId)
    .eq("organization_id", context.organization.id)
    .eq("template_type", "weekly")
    .select("id")
    .single();

  if (error) {
    redirect(
      getErrorPath(
        context.organization.id,
        context.weekStart,
        getMutationError(error.code),
        context.view,
        context.day,
      ),
    );
  }

  await recordOperationalAuditEvent({
    action: "restored",
    changedFields: {
      archived_at: auditFieldChange(templateResult.template.archived_at, null),
      recoverable_until: auditFieldChange(
        templateResult.template.recoverable_until,
        null,
      ),
      status: auditFieldChange(templateResult.template.status, "draft"),
    },
    entityId: templateId,
    entityType: "schedule_templates",
    organizationId: context.organization.id,
    supabase,
  });

  redirect(
    getScheduleTemplatesPath({
      day: context.day,
      organizationId: context.organization.id,
      status: "template-restored",
      view: context.view,
      week: context.weekStart,
    }),
  );
}

export async function createScheduleTemplateBlock(formData: FormData) {
  const context = await getOperationalActionContext(formData);
  const validation = validateScheduleTemplateBlockForm(formData);

  if (!validation.ok) {
    redirect(
      getErrorPath(
        context.organization.id,
        context.weekStart,
        validation.error,
        context.view,
        context.day,
      ),
    );
  }

  const supabase = await createClient();
  const referenceResult = await validateTemplateBlockReferences({
    centerId: validation.values.centerId,
    classTypeId: validation.values.classTypeId,
    defaultCoachProfileId: validation.values.defaultCoachProfileId,
    organizationId: context.organization.id,
    supabase,
    templateId: validation.values.templateId,
  });

  if (referenceResult.error || !referenceResult.centerId) {
    redirect(
      getErrorPath(
        context.organization.id,
        context.weekStart,
        referenceResult.error ?? "invalid-center",
        context.view,
        context.day,
      ),
    );
  }

  const availabilityError = await validateTemplateDefaultCoachAvailability({
    defaultCoachProfileId: validation.values.defaultCoachProfileId,
    dayOfWeek: validation.values.dayOfWeek,
    endTime: validation.values.endTime,
    organizationId: context.organization.id,
    startTime: validation.values.startTime,
    supabase,
    templateId: validation.values.templateId,
  });

  if (availabilityError) {
    redirect(
      getErrorPath(
        context.organization.id,
        context.weekStart,
        availabilityError,
        context.view,
        context.day,
      ),
    );
  }

  const { data: templateBlock, error } = await supabase
    .from("schedule_template_blocks")
    .insert({
      center_id: referenceResult.centerId,
      class_type_id: validation.values.classTypeId,
      day_of_week: validation.values.dayOfWeek,
      default_coach_profile_id: validation.values.defaultCoachProfileId,
      end_time: validation.values.endTime,
      notes: validation.values.notes,
      organization_id: context.organization.id,
      required_coaches: validation.values.requiredCoaches,
      start_time: validation.values.startTime,
      template_id: validation.values.templateId,
    })
    .select("id")
    .single();

  if (error || !templateBlock) {
    redirect(
      getErrorPath(
        context.organization.id,
        context.weekStart,
        getMutationError(error?.code),
        context.view,
        context.day,
      ),
    );
  }

  const syncStatus = await ensureScheduleTemplateRangeApplied({
    organizationId: context.organization.id,
    supabase,
    templateId: validation.values.templateId,
    templateBlockIds: [templateBlock.id],
    timezone: context.organization.timezone,
  });
  const syncError = getTemplateSyncError(syncStatus);

  if (syncError) {
    redirect(
      getErrorPath(
        context.organization.id,
        context.weekStart,
        syncError,
        context.view,
        context.day,
      ),
    );
  }

  await recordOperationalAuditEvent({
    action: "created",
    changedFields: getScheduleTemplateBlockCreatedAuditFields({
      ...validation.values,
      centerId: referenceResult.centerId,
    }),
    entityId: templateBlock.id,
    entityType: "schedule_template_blocks",
    organizationId: context.organization.id,
    supabase,
  });

  redirect(
    getScheduleTemplatesPath({
      day: context.day,
      organizationId: context.organization.id,
      status: "template-block-created",
      view: context.view,
      week: context.weekStart,
    }),
  );
}

export async function updateScheduleTemplateBlock(formData: FormData) {
  const context = await getOperationalActionContext(formData);
  const templateBlockId = getRequiredFormString(formData, "templateBlockId");
  const validation = validateScheduleTemplateBlockForm(formData);

  if (!templateBlockId) {
    redirect(
      getErrorPath(
        context.organization.id,
        context.weekStart,
        "template-block-required",
        context.view,
        context.day,
      ),
    );
  }

  if (!isScheduleTemplateUuid(templateBlockId)) {
    redirect(
      getErrorPath(
        context.organization.id,
        context.weekStart,
        "invalid-template-block",
        context.view,
        context.day,
      ),
    );
  }

  if (!validation.ok) {
    redirect(
      getErrorPath(
        context.organization.id,
        context.weekStart,
        validation.error,
        context.view,
        context.day,
      ),
    );
  }

  const supabase = await createClient();
  const { data: existingBlock, error: existingError } = await supabase
    .from("schedule_template_blocks")
    .select(
      "id, center_id, class_type_id, day_of_week, default_coach_profile_id, end_time, notes, required_coaches, start_time, template_id",
    )
    .eq("id", templateBlockId)
    .eq("organization_id", context.organization.id)
    .maybeSingle();

  if (
    existingError ||
    !existingBlock ||
    existingBlock.template_id !== validation.values.templateId
  ) {
    redirect(
      getErrorPath(
        context.organization.id,
        context.weekStart,
        "invalid-template-block",
        context.view,
        context.day,
      ),
    );
  }

  const referenceResult = await validateTemplateBlockReferences({
    centerId: validation.values.centerId,
    classTypeId: validation.values.classTypeId,
    defaultCoachProfileId: validation.values.defaultCoachProfileId,
    organizationId: context.organization.id,
    supabase,
    templateId: validation.values.templateId,
  });

  if (referenceResult.error || !referenceResult.centerId) {
    redirect(
      getErrorPath(
        context.organization.id,
        context.weekStart,
        referenceResult.error ?? "invalid-center",
        context.view,
        context.day,
      ),
    );
  }

  const availabilityError = await validateTemplateDefaultCoachAvailability({
    defaultCoachProfileId: validation.values.defaultCoachProfileId,
    dayOfWeek: validation.values.dayOfWeek,
    endTime: validation.values.endTime,
    organizationId: context.organization.id,
    startTime: validation.values.startTime,
    supabase,
    templateBlockId,
    templateId: validation.values.templateId,
  });

  if (availabilityError) {
    redirect(
      getErrorPath(
        context.organization.id,
        context.weekStart,
        availabilityError,
        context.view,
        context.day,
      ),
    );
  }

  const { error } = await supabase
    .from("schedule_template_blocks")
    .update({
      center_id: referenceResult.centerId,
      class_type_id: validation.values.classTypeId,
      day_of_week: validation.values.dayOfWeek,
      default_coach_profile_id: validation.values.defaultCoachProfileId,
      end_time: validation.values.endTime,
      notes: validation.values.notes,
      required_coaches: validation.values.requiredCoaches,
      start_time: validation.values.startTime,
    })
    .eq("id", templateBlockId)
    .eq("organization_id", context.organization.id)
    .select("id")
    .single();

  if (error) {
    redirect(
      getErrorPath(
        context.organization.id,
        context.weekStart,
        getMutationError(error.code),
        context.view,
        context.day,
      ),
    );
  }

  const syncStatus = await ensureScheduleTemplateRangeApplied({
    organizationId: context.organization.id,
    supabase,
    templateId: validation.values.templateId,
    templateBlockIds: [templateBlockId],
    timezone: context.organization.timezone,
  });
  const syncError = getTemplateSyncError(syncStatus);

  if (syncError) {
    redirect(
      getErrorPath(
        context.organization.id,
        context.weekStart,
        syncError,
        context.view,
        context.day,
      ),
    );
  }

  const changedFields: OperationalAuditChangedFields = {};
  addAuditFieldChange(
    changedFields,
    "center_id",
    existingBlock.center_id,
    referenceResult.centerId,
  );
  addAuditFieldChange(
    changedFields,
    "class_type_id",
    existingBlock.class_type_id,
    validation.values.classTypeId,
  );
  addAuditFieldChange(
    changedFields,
    "day_of_week",
    existingBlock.day_of_week,
    validation.values.dayOfWeek,
  );
  addAuditFieldChange(
    changedFields,
    "default_coach_profile_id",
    existingBlock.default_coach_profile_id,
    validation.values.defaultCoachProfileId,
  );
  addAuditFieldChange(
    changedFields,
    "start_time",
    existingBlock.start_time.slice(0, 5),
    validation.values.startTime,
  );
  addAuditFieldChange(
    changedFields,
    "end_time",
    existingBlock.end_time.slice(0, 5),
    validation.values.endTime,
  );
  addAuditFieldChange(
    changedFields,
    "required_coaches",
    existingBlock.required_coaches,
    validation.values.requiredCoaches,
  );

  if ((existingBlock.notes ?? null) !== validation.values.notes) {
    changedFields.notes = auditFieldTouched();
  }

  await recordOperationalAuditEvent({
    action: "updated",
    changedFields,
    entityId: templateBlockId,
    entityType: "schedule_template_blocks",
    organizationId: context.organization.id,
    supabase,
  });

  redirect(
    getScheduleTemplatesPath({
      day: context.day,
      organizationId: context.organization.id,
      status: "template-block-updated",
      view: context.view,
      week: context.weekStart,
    }),
  );
}

function hasTemplateBlockDeleteConfirmation(formData: FormData) {
  return (
    getRequiredFormString(formData, "confirmTemplateBlockDelete") ===
    TEMPLATE_BLOCK_DELETE_CONFIRMATION_VALUE
  );
}

async function removeGeneratedScheduleBlocksForTemplateBlocks({
  organizationId,
  supabase,
  templateBlockIds,
  templateId,
}: {
  organizationId: string;
  supabase: SupabaseServerClient;
  templateBlockIds: string[];
  templateId: string;
}) {
  const { data: removedBlocks, error: removeError } = await supabase
    .from("schedule_blocks")
    .delete()
    .eq("organization_id", organizationId)
    .eq("template_id", templateId)
    .eq("is_template_exception", false)
    .neq("status", "cancelled")
    .neq("status", "completed")
    .in("template_block_id", templateBlockIds)
    .select("id");

  if (removeError) {
    return {
      detachedScheduleBlockCount: 0,
      error: getMutationError(removeError.code),
      removedScheduleBlockCount: 0,
    };
  }

  const { data: detachedBlocks, error: detachError } = await supabase
    .from("schedule_blocks")
    .update({
      is_template_exception: true,
      template_block_id: null,
    })
    .eq("organization_id", organizationId)
    .eq("template_id", templateId)
    .in("template_block_id", templateBlockIds)
    .or("is_template_exception.eq.true,status.in.(cancelled,completed)")
    .select("id");

  if (detachError) {
    return {
      detachedScheduleBlockCount: 0,
      error: getMutationError(detachError.code),
      removedScheduleBlockCount: removedBlocks?.length ?? 0,
    };
  }

  const { data: remainingBlocks, error: remainingError } = await supabase
    .from("schedule_blocks")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("template_id", templateId)
    .in("template_block_id", templateBlockIds)
    .limit(1);

  if (remainingError) {
    return {
      detachedScheduleBlockCount: detachedBlocks?.length ?? 0,
      error: "save-failed",
      removedScheduleBlockCount: removedBlocks?.length ?? 0,
    };
  }

  if ((remainingBlocks?.length ?? 0) > 0) {
    return {
      detachedScheduleBlockCount: detachedBlocks?.length ?? 0,
      error: "invalid-reference",
      removedScheduleBlockCount: removedBlocks?.length ?? 0,
    };
  }

  return {
    detachedScheduleBlockCount: detachedBlocks?.length ?? 0,
    error: null,
    removedScheduleBlockCount: removedBlocks?.length ?? 0,
  };
}

async function deleteTemplateBlocksForContext({
  context,
  successStatus,
  templateBlockIds,
  templateId,
}: {
  context: Awaited<ReturnType<typeof getOperationalActionContext>>;
  successStatus: string;
  templateBlockIds: string[];
  templateId: string;
}) {
  const supabase = await createClient();
  const templateResult = await validateTemplateReference({
    organizationId: context.organization.id,
    supabase,
    templateId,
  });

  if (templateResult.error || !templateResult.template) {
    redirect(
      getErrorPath(
        context.organization.id,
        context.weekStart,
        templateResult.error ?? "invalid-template",
        context.view,
        context.day,
      ),
    );
  }

  const { data: templateBlocks, error: templateBlocksError } = await supabase
    .from("schedule_template_blocks")
    .select(
      "id, center_id, class_type_id, day_of_week, default_coach_profile_id, end_time, notes, required_coaches, start_time, template_id",
    )
    .eq("organization_id", context.organization.id)
    .eq("template_id", templateId)
    .in("id", templateBlockIds);

  if (
    templateBlocksError ||
    !templateBlocks ||
    templateBlocks.length !== templateBlockIds.length
  ) {
    redirect(
      getErrorPath(
        context.organization.id,
        context.weekStart,
        "invalid-template-block",
        context.view,
        context.day,
      ),
    );
  }

  const cleanupResult = await removeGeneratedScheduleBlocksForTemplateBlocks({
    organizationId: context.organization.id,
    supabase,
    templateBlockIds,
    templateId,
  });

  if (cleanupResult.error) {
    redirect(
      getErrorPath(
        context.organization.id,
        context.weekStart,
        cleanupResult.error,
        context.view,
        context.day,
      ),
    );
  }

  await Promise.all(
    templateBlocks.map((block) =>
      recordOperationalAuditEvent({
        action: "removed",
        changedFields: getScheduleTemplateBlockRemovedAuditFields({
          block,
          bulkSize: templateBlocks.length,
          detachedScheduleBlockCount:
            cleanupResult.detachedScheduleBlockCount,
          removedScheduleBlockCount: cleanupResult.removedScheduleBlockCount,
        }),
        entityId: block.id,
        entityType: "schedule_template_blocks",
        organizationId: context.organization.id,
        supabase,
      }),
    ),
  );

  const { error: deleteError } = await supabase
    .from("schedule_template_blocks")
    .delete()
    .eq("organization_id", context.organization.id)
    .eq("template_id", templateId)
    .in("id", templateBlockIds);

  if (deleteError) {
    redirect(
      getErrorPath(
        context.organization.id,
        context.weekStart,
        getMutationError(deleteError.code),
        context.view,
        context.day,
      ),
    );
  }

  redirect(
    getScheduleTemplatesPath({
      day: context.day,
      organizationId: context.organization.id,
      status: successStatus,
      view: context.view,
      week: context.weekStart,
    }),
  );
}

export async function deleteScheduleTemplateBlock(formData: FormData) {
  const context = await getOperationalActionContext(formData);
  const templateId = getRequiredFormString(formData, "templateId");
  const templateBlockId = getRequiredFormString(formData, "templateBlockId");

  if (!hasTemplateBlockDeleteConfirmation(formData)) {
    redirect(
      getErrorPath(
        context.organization.id,
        context.weekStart,
        "template-block-delete-confirmation-required",
        context.view,
        context.day,
      ),
    );
  }

  if (!templateId || !isScheduleTemplateUuid(templateId)) {
    redirect(
      getErrorPath(
        context.organization.id,
        context.weekStart,
        "invalid-template",
        context.view,
        context.day,
      ),
    );
  }

  if (!templateBlockId) {
    redirect(
      getErrorPath(
        context.organization.id,
        context.weekStart,
        "template-block-required",
        context.view,
        context.day,
      ),
    );
  }

  if (!isScheduleTemplateUuid(templateBlockId)) {
    redirect(
      getErrorPath(
        context.organization.id,
        context.weekStart,
        "invalid-template-block",
        context.view,
        context.day,
      ),
    );
  }

  await deleteTemplateBlocksForContext({
    context,
    successStatus: "template-block-deleted",
    templateBlockIds: [templateBlockId],
    templateId,
  });
}

function getBulkTemplateBlockIds(formData: FormData) {
  return [
    ...new Set(
      formData
        .getAll("templateBlockIds")
        .flatMap((value) => (typeof value === "string" ? [value.trim()] : []))
        .filter(Boolean),
    ),
  ];
}

function parseBulkCoachProfileId(value: string | null) {
  if (!value || value === BULK_KEEP_VALUE) {
    return {
      error: null,
      shouldUpdate: false,
      value: null,
    } as const;
  }

  if (value === "none") {
    return {
      error: null,
      shouldUpdate: true,
      value: null,
    } as const;
  }

  if (!isScheduleTemplateUuid(value)) {
    return {
      error: "invalid-coach" as const,
      shouldUpdate: false,
      value: null,
    } as const;
  }

  return {
    error: null,
    shouldUpdate: true,
    value,
  } as const;
}

function parseBulkRequiredCoaches(value: string | null) {
  if (!value) {
    return {
      error: null,
      shouldUpdate: false,
      value: null,
    } as const;
  }

  const requiredCoaches = Number(value);

  if (
    !Number.isInteger(requiredCoaches) ||
    requiredCoaches < 0 ||
    requiredCoaches > 20
  ) {
    return {
      error: "invalid-required-coaches" as const,
      shouldUpdate: false,
      value: null,
    } as const;
  }

  return {
    error: null,
    shouldUpdate: true,
    value: requiredCoaches,
  } as const;
}

function parseBulkNotes({
  mode,
  value,
}: {
  mode: string | null;
  value: string | null;
}) {
  if (!mode || mode === BULK_KEEP_VALUE) {
    return {
      error: null,
      shouldUpdate: false,
      value: null,
    } as const;
  }

  if (mode === "clear") {
    return {
      error: null,
      shouldUpdate: true,
      value: null,
    } as const;
  }

  if (mode !== "replace") {
    return {
      error: "invalid-template-data" as const,
      shouldUpdate: false,
      value: null,
    } as const;
  }

  const notes = value ?? "";

  if (notes.length > 1000) {
    return {
      error: "notes-too-long" as const,
      shouldUpdate: false,
      value: null,
    } as const;
  }

  return {
    error: null,
    shouldUpdate: true,
    value: notes || null,
  } as const;
}

async function validateBulkCenterUpdate({
  organizationId,
  rawCenterId,
  supabase,
  templateCenterId,
}: {
  organizationId: string;
  rawCenterId: string | null;
  supabase: SupabaseServerClient;
  templateCenterId: string | null;
}) {
  if (templateCenterId) {
    return {
      error: null,
      shouldUpdate: true,
      value: templateCenterId,
    } as const;
  }

  if (!rawCenterId || rawCenterId === BULK_KEEP_VALUE) {
    return {
      error: null,
      shouldUpdate: false,
      value: null,
    } as const;
  }

  if (!isScheduleTemplateUuid(rawCenterId)) {
    return {
      error: "invalid-center" as const,
      shouldUpdate: false,
      value: null,
    } as const;
  }

  const centerError = await validateOptionalCenterReference({
    centerId: rawCenterId,
    organizationId,
    supabase,
  });

  if (centerError) {
    return {
      error: centerError,
      shouldUpdate: false,
      value: null,
    } as const;
  }

  return {
    error: null,
    shouldUpdate: true,
    value: rawCenterId,
  } as const;
}

export async function updateScheduleTemplateBlocksBulk(formData: FormData) {
  const context = await getOperationalActionContext(formData);
  const templateId = getRequiredFormString(formData, "templateId");
  const templateBlockIds = getBulkTemplateBlockIds(formData);

  if (!templateId || !isScheduleTemplateUuid(templateId)) {
    redirect(
      getErrorPath(
        context.organization.id,
        context.weekStart,
        "invalid-template",
        context.view,
        context.day,
      ),
    );
  }

  if (
    templateBlockIds.length === 0 ||
    templateBlockIds.some((blockId) => !isScheduleTemplateUuid(blockId))
  ) {
    redirect(
      getErrorPath(
        context.organization.id,
        context.weekStart,
        "invalid-template-block",
        context.view,
        context.day,
      ),
    );
  }

  const coachUpdate = parseBulkCoachProfileId(
    getOptionalFormString(formData, "defaultCoachProfileId"),
  );
  const requiredCoachesUpdate = parseBulkRequiredCoaches(
    getOptionalFormString(formData, "requiredCoaches"),
  );
  const notesUpdate = parseBulkNotes({
    mode: getOptionalFormString(formData, "notesMode"),
    value: getOptionalFormString(formData, "notes"),
  });

  const firstValidationError =
    coachUpdate.error ?? requiredCoachesUpdate.error ?? notesUpdate.error;

  if (firstValidationError) {
    redirect(
      getErrorPath(
        context.organization.id,
        context.weekStart,
        firstValidationError,
        context.view,
        context.day,
      ),
    );
  }

  const supabase = await createClient();
  const templateResult = await validateTemplateReference({
    organizationId: context.organization.id,
    supabase,
    templateId,
  });

  if (templateResult.error || !templateResult.template) {
    redirect(
      getErrorPath(
        context.organization.id,
        context.weekStart,
        templateResult.error ?? "invalid-template",
        context.view,
        context.day,
      ),
    );
  }

  const centerUpdate = await validateBulkCenterUpdate({
    organizationId: context.organization.id,
    rawCenterId: getOptionalFormString(formData, "centerId"),
    supabase,
    templateCenterId: templateResult.template.center_id,
  });

  if (centerUpdate.error) {
    redirect(
      getErrorPath(
        context.organization.id,
        context.weekStart,
        centerUpdate.error,
        context.view,
        context.day,
      ),
    );
  }

  if (coachUpdate.shouldUpdate && coachUpdate.value) {
    const coachError = await validateAssignableCoach({
      coachProfileId: coachUpdate.value,
      organizationId: context.organization.id,
      supabase,
    });

    if (coachError) {
      redirect(
        getErrorPath(
          context.organization.id,
          context.weekStart,
          coachError,
          context.view,
          context.day,
        ),
      );
    }
  }

  const { data: allBlocks, error: blocksError } = await supabase
    .from("schedule_template_blocks")
    .select(
      "id, center_id, day_of_week, default_coach_profile_id, end_time, notes, required_coaches, start_time, template_id",
    )
    .eq("organization_id", context.organization.id)
    .eq("template_id", templateId);

  if (blocksError || !allBlocks) {
    redirect(
      getErrorPath(
        context.organization.id,
        context.weekStart,
        "save-failed",
        context.view,
        context.day,
      ),
    );
  }

  const selectedBlockIds = new Set(templateBlockIds);
  const selectedBlocks = allBlocks.filter((block) =>
    selectedBlockIds.has(block.id),
  );

  if (selectedBlocks.length !== templateBlockIds.length) {
    redirect(
      getErrorPath(
        context.organization.id,
        context.weekStart,
        "invalid-template-block",
        context.view,
        context.day,
      ),
    );
  }

  const normalizedBulkCoachProfileId =
    requiredCoachesUpdate.shouldUpdate && requiredCoachesUpdate.value === 0
      ? null
      : coachUpdate.value;
  const hasNoRequirementAfterUpdate = selectedBlocks.some((block) => {
    const requiredCoaches =
      requiredCoachesUpdate.shouldUpdate &&
      requiredCoachesUpdate.value !== null
        ? requiredCoachesUpdate.value
        : block.required_coaches;

    return !scheduleTemplateBlockRequiresCoach(requiredCoaches);
  });

  if (
    coachUpdate.shouldUpdate &&
    normalizedBulkCoachProfileId &&
    hasNoRequirementAfterUpdate
  ) {
    redirect(
      getErrorPath(
        context.organization.id,
        context.weekStart,
        "invalid-coach",
        context.view,
        context.day,
      ),
    );
  }

  if (coachUpdate.shouldUpdate && normalizedBulkCoachProfileId) {
    const targetCoachProfileId = normalizedBulkCoachProfileId;
    const candidateBlocks = allBlocks.map((block) => ({
      ...block,
      default_coach_profile_id: selectedBlockIds.has(block.id)
        ? targetCoachProfileId
        : block.default_coach_profile_id,
    }));
    const hasCoachOverlap = selectedBlocks.some((block) =>
      getUnavailableScheduleTemplateCoachBlocks({
        blocks: candidateBlocks,
        targetBlock: {
          day_of_week: block.day_of_week,
          end_time: block.end_time,
          id: block.id,
          start_time: block.start_time,
        },
      }).some(
        (unavailableBlock) =>
          unavailableBlock.coachProfileId === targetCoachProfileId,
      ),
    );

    if (hasCoachOverlap) {
      redirect(
        getErrorPath(
          context.organization.id,
          context.weekStart,
          "coach-unavailable",
          context.view,
          context.day,
        ),
      );
    }
  }

  const updates: {
    center_id?: string;
    default_coach_profile_id?: string | null;
    notes?: string | null;
    required_coaches?: number;
  } = {};

  if (centerUpdate.shouldUpdate && centerUpdate.value) {
    updates.center_id = centerUpdate.value;
  }

  if (coachUpdate.shouldUpdate) {
    updates.default_coach_profile_id = normalizedBulkCoachProfileId;
  }

  if (requiredCoachesUpdate.shouldUpdate && requiredCoachesUpdate.value !== null) {
    updates.required_coaches = requiredCoachesUpdate.value;

    if (!scheduleTemplateBlockRequiresCoach(requiredCoachesUpdate.value)) {
      updates.default_coach_profile_id = null;
    }
  }

  if (notesUpdate.shouldUpdate) {
    updates.notes = notesUpdate.value;
  }

  if (Object.keys(updates).length > 0) {
    const { error } = await supabase
      .from("schedule_template_blocks")
      .update(updates)
      .eq("organization_id", context.organization.id)
      .eq("template_id", templateId)
      .in("id", templateBlockIds)
      .select("id");

    if (error) {
      redirect(
        getErrorPath(
          context.organization.id,
          context.weekStart,
          getMutationError(error.code),
          context.view,
          context.day,
        ),
      );
    }

    const syncStatus = await ensureScheduleTemplateRangeApplied({
      organizationId: context.organization.id,
      supabase,
      templateId,
      templateBlockIds,
      timezone: context.organization.timezone,
    });
    const syncError = getTemplateSyncError(syncStatus);

    if (syncError) {
      redirect(
        getErrorPath(
          context.organization.id,
          context.weekStart,
          syncError,
          context.view,
          context.day,
        ),
      );
    }

    await Promise.all(
      selectedBlocks.map((block) => {
        const changedFields: OperationalAuditChangedFields = {
          bulk_update: auditFieldSet(true),
          bulk_size: auditFieldSet(selectedBlocks.length),
        };

        if (updates.center_id !== undefined) {
          addAuditFieldChange(
            changedFields,
            "center_id",
            block.center_id,
            updates.center_id,
          );
        }

        if (updates.default_coach_profile_id !== undefined) {
          addAuditFieldChange(
            changedFields,
            "default_coach_profile_id",
            block.default_coach_profile_id,
            updates.default_coach_profile_id,
          );
        }

        if (updates.required_coaches !== undefined) {
          addAuditFieldChange(
            changedFields,
            "required_coaches",
            block.required_coaches,
            updates.required_coaches,
          );
        }

        if (updates.notes !== undefined && (block.notes ?? null) !== updates.notes) {
          changedFields.notes = auditFieldTouched();
        }

        return recordOperationalAuditEvent({
          action: "updated",
          changedFields,
          entityId: block.id,
          entityType: "schedule_template_blocks",
          organizationId: context.organization.id,
          supabase,
        });
      }),
    );
  }

  redirect(
    getScheduleTemplatesPath({
      day: context.day,
      organizationId: context.organization.id,
      status: "template-blocks-updated",
      view: context.view,
      week: context.weekStart,
    }),
  );
}

export async function deleteScheduleTemplateBlocksBulk(formData: FormData) {
  const context = await getOperationalActionContext(formData);
  const templateId = getRequiredFormString(formData, "templateId");
  const templateBlockIds = getBulkTemplateBlockIds(formData);

  if (!hasTemplateBlockDeleteConfirmation(formData)) {
    redirect(
      getErrorPath(
        context.organization.id,
        context.weekStart,
        "template-block-delete-confirmation-required",
        context.view,
        context.day,
      ),
    );
  }

  if (!templateId || !isScheduleTemplateUuid(templateId)) {
    redirect(
      getErrorPath(
        context.organization.id,
        context.weekStart,
        "invalid-template",
        context.view,
        context.day,
      ),
    );
  }

  if (
    templateBlockIds.length === 0 ||
    templateBlockIds.some((blockId) => !isScheduleTemplateUuid(blockId))
  ) {
    redirect(
      getErrorPath(
        context.organization.id,
        context.weekStart,
        "invalid-template-block",
        context.view,
        context.day,
      ),
    );
  }

  await deleteTemplateBlocksForContext({
    context,
    successStatus:
      templateBlockIds.length === 1
        ? "template-block-deleted"
        : "template-blocks-deleted",
    templateBlockIds,
    templateId,
  });
}

export async function applyScheduleTemplateToWeek(formData: FormData) {
  const context = await getOperationalActionContext(formData);
  const templateId = getRequiredFormString(formData, "templateId");
  const replaceExisting = getRequiredFormString(formData, "replaceExisting") === "1";

  if (!templateId || !isScheduleTemplateUuid(templateId)) {
    redirect(
      getErrorPath(
        context.organization.id,
        context.weekStart,
        "invalid-template",
        context.view,
        context.day,
      ),
    );
  }

  const supabase = await createClient();
  const templateResult = await validateTemplateReference({
    organizationId: context.organization.id,
    requireActive: true,
    supabase,
    templateId,
  });

  if (templateResult.error) {
    redirect(
      getErrorPath(
        context.organization.id,
        context.weekStart,
        templateResult.error,
        context.view,
        context.day,
      ),
    );
  }

  const week = resolveWeek(context.weekStart, context.organization.timezone);
  const result = await applyScheduleTemplateWeek({
    organizationId: context.organization.id,
    replaceExisting,
    supabase,
    templateId,
    timezone: context.organization.timezone,
    weekStart: week.weekStart,
  });

  if (
    result.status === "coach-unavailable" ||
    result.status === "invalid-coach" ||
    result.status === "invalid-template" ||
    result.status === "save-failed" ||
    result.status === "template-empty" ||
    result.status === "template-not-active" ||
    result.status === "template-out-of-range" ||
    result.status === "template-week-has-template"
  ) {
    redirect(
      getErrorPath(
        context.organization.id,
        context.weekStart,
        result.status,
        context.view,
        context.day,
      ),
    );
  }

  if (result.status === "applied") {
    await recordOperationalAuditEvent({
      action: "applied_to_week",
      changedFields: {
        inserted_block_count: auditFieldSet(result.insertedBlockCount),
        replace_existing: auditFieldSet(replaceExisting),
        replaced_block_count: auditFieldSet(result.replacedBlockCount),
        week_start: auditFieldSet(week.weekStart),
      },
      entityId: templateId,
      entityType: "schedule_templates",
      organizationId: context.organization.id,
      supabase,
    });
  }

  redirect(
    getSchedulePath({
      organizationId: context.organization.id,
      status:
        result.replacedBlockCount > 0
          ? "template-replaced"
          : result.status === "already-applied"
            ? "template-already-applied"
            : "template-applied",
      week: week.weekStart,
    }),
  );
}
