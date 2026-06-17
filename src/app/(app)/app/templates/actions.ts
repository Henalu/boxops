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
  ensureScheduleTemplateCurrentWeekApplied,
  ensureScheduleTemplateRangeApplied,
} from "@/lib/schedule-template-application";
import {
  SCHEDULE_TEMPLATE_DAYS,
  SCHEDULE_TEMPLATE_EDITOR_DEFAULT_DURATION_MINUTES,
  SCHEDULE_TEMPLATE_EDITOR_SLOT_MINUTES,
  getScheduleTemplateEditorSettings,
  getUnavailableScheduleTemplateCoachBlocks,
  isScheduleTemplateUuid,
  scheduleTemplateBlockRequiresCoach,
  validateScheduleTemplateBlockCreateForm,
  validateScheduleTemplateBlockForm,
  validateScheduleTemplateForm,
  type ScheduleTemplateCoachAvailabilityBlockInput,
  type ScheduleTemplateFormValues,
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
type TemplateBlockBulkCopyValue = {
  centerId: string;
  classTypeId: string;
  dayOfWeek: number;
  defaultCoachProfileId: string | null;
  endTime: string;
  notes: string | null;
  requiredCoaches: number;
  sourceBlockId: string;
  startTime: string;
  templateId: string;
};

const TEMPLATE_RECOVERY_DAYS = 30;
const BULK_KEEP_VALUE = "keep";
const TEMPLATE_CENTER_FILTER_ALL = "all";
const TEMPLATE_BLOCK_CREATE_KEEP_OPEN_VALUE = "1";
const TEMPLATE_BLOCK_DELETE_CONFIRMATION_VALUE = "1";
const TEMPLATE_APPLICATION_MODES = ["range", "week"] as const;

type TemplateApplicationMode = (typeof TEMPLATE_APPLICATION_MODES)[number];

function getRequiredFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

function getOptionalFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : null;
}

function getTemplateApplicationMode(formData: FormData): TemplateApplicationMode {
  const value = getRequiredFormString(formData, "applicationMode");

  return TEMPLATE_APPLICATION_MODES.includes(value as TemplateApplicationMode)
    ? (value as TemplateApplicationMode)
    : "range";
}

function shouldReplaceExistingAppliedTemplates(formData: FormData) {
  return getRequiredFormString(formData, "replaceExisting") === "1";
}

function hasConfirmedYearEndApplication(formData: FormData) {
  return getRequiredFormString(formData, "confirmYearEnd") === "1";
}

function getYearEndDateString(dateString: string) {
  return `${dateString.slice(0, 4)}-12-31`;
}

function normalizeScheduleTemplateValuesForApplication({
  formData,
  timezone,
  values,
}: {
  formData: FormData;
  timezone: string;
  values: ScheduleTemplateFormValues;
}):
  | {
      ok: true;
      values: ScheduleTemplateFormValues;
    }
  | {
      error: "invalid-date" | "invalid-date-range" | "template-valid-until-confirmation-required";
      ok: false;
    } {
  const applicationMode = getTemplateApplicationMode(formData);

  if (applicationMode === "week") {
    const targetWeekStart = getRequiredFormString(formData, "targetWeekStart");
    const week = resolveWeek(targetWeekStart, timezone);

    if (!targetWeekStart || week.invalidWeekParam) {
      return {
        error: "invalid-date",
        ok: false,
      };
    }

    return {
      ok: true,
      values: {
        ...values,
        validFrom: week.weekStart,
        validUntil: week.weekEnd,
      },
    };
  }

  if (
    values.status === "active" &&
    values.validFrom &&
    !values.validUntil
  ) {
    if (!hasConfirmedYearEndApplication(formData)) {
      return {
        error: "template-valid-until-confirmation-required",
        ok: false,
      };
    }

    const currentWeek = resolveWeek(undefined, timezone);
    const effectiveStartDate =
      values.validFrom < currentWeek.weekStart
        ? currentWeek.weekStart
        : values.validFrom;
    const validUntil = getYearEndDateString(effectiveStartDate);

    if (validUntil < values.validFrom) {
      return {
        error: "invalid-date-range",
        ok: false,
      };
    }

    return {
      ok: true,
      values: {
        ...values,
        validUntil,
      },
    };
  }

  return {
    ok: true,
    values,
  };
}

function getTemplateMetadataObject(value: unknown): TemplateMetadata {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as TemplateMetadata) }
    : {};
}

function getTemplateEditorMetadata(values: {
  editorEndTime: string;
  editorStartTime: string;
}) {
  return {
    defaultDurationMinutes: SCHEDULE_TEMPLATE_EDITOR_DEFAULT_DURATION_MINUTES,
    endTime: values.editorEndTime,
    slotMinutes: SCHEDULE_TEMPLATE_EDITOR_SLOT_MINUTES,
    startTime: values.editorStartTime,
  } satisfies TemplateMetadata;
}

function mergeTemplateEditorMetadata(
  metadata: unknown,
  values: {
    editorEndTime: string;
    editorStartTime: string;
  },
) {
  const nextMetadata = getTemplateMetadataObject(metadata);

  nextMetadata.editor = getTemplateEditorMetadata(values);

  return nextMetadata;
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
  editorEndTime: string;
  editorStartTime: string;
  name: string;
  status: string;
  validFrom: string | null;
  validUntil: string | null;
}): OperationalAuditChangedFields {
  return {
    center_id: auditFieldSet(values.centerId),
    editor_end_time: auditFieldSet(values.editorEndTime),
    editor_start_time: auditFieldSet(values.editorStartTime),
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

function getTemplateCenterFilterId(formData: FormData) {
  const centerFilterId = getRequiredFormString(formData, "centerFilterId");

  return centerFilterId || null;
}

function shouldKeepTemplateBlockCreateOpen(formData: FormData) {
  return (
    getRequiredFormString(formData, "keepTemplateBlockCreateOpen") ===
    TEMPLATE_BLOCK_CREATE_KEEP_OPEN_VALUE
  );
}

function getErrorPath(
  organizationId: string | null,
  week: string | null,
  error: string,
  view?: string | null,
  day?: string | null,
  centerFilterId?: string | null,
) {
  return getScheduleTemplatesPath({
    centerId: centerFilterId,
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
  const centerFilterId = getTemplateCenterFilterId(formData);
  const redirectPath = getScheduleTemplatesPath({
    centerId: centerFilterId,
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
        centerFilterId,
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
        centerFilterId,
      ),
    );
  }

  const week = resolveWeek(rawWeekStart || undefined, resolution.organization.timezone);

  return {
    day,
    centerFilterId,
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
    return "coach-missing-certification";
  }

  return "save-failed";
}

function getTemplateSyncError(status: string) {
  if (status === "coach-missing-certification") {
    return "template-sync-coach-missing-certification";
  }

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

async function validateCoachCertificationForClassType({
  classTypeId,
  coachProfileId,
  organizationId,
  supabase,
}: {
  classTypeId: string;
  coachProfileId: string;
  organizationId: string;
  supabase: SupabaseServerClient;
}) {
  const { data: classType, error: classTypeError } = await supabase
    .from("class_types")
    .select("certification_id")
    .eq("id", classTypeId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (classTypeError || !classType) {
    return "invalid-class-type";
  }

  if (!classType.certification_id) {
    return null;
  }

  const { data: coachCertification, error: certificationError } =
    await supabase
      .from("coach_certifications")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("coach_profile_id", coachProfileId)
      .eq("certification_id", classType.certification_id)
      .eq("status", "active")
      .maybeSingle();

  if (certificationError || !coachCertification) {
    return "coach-missing-certification";
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

    const certificationError = await validateCoachCertificationForClassType({
      classTypeId,
      coachProfileId: defaultCoachProfileId,
      organizationId,
      supabase,
    });

    if (certificationError) {
      return {
        centerId: null,
        error: certificationError,
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

function normalizeTimeForComparison(value: string) {
  return value.slice(0, 5);
}

async function validateTemplateBlockExactDuplicates({
  centerId,
  classTypeId,
  organizationId,
  supabase,
  templateId,
  values,
}: {
  centerId: string;
  classTypeId: string;
  organizationId: string;
  supabase: SupabaseServerClient;
  templateId: string;
  values: {
    dayOfWeek: number;
    endTime: string;
    startTime: string;
  }[];
}) {
  const days = [...new Set(values.map((value) => value.dayOfWeek))];

  if (days.length === 0) {
    return "missing-fields";
  }

  const { data: existingBlocks, error } = await supabase
    .from("schedule_template_blocks")
    .select("id, day_of_week, start_time, end_time")
    .eq("organization_id", organizationId)
    .eq("template_id", templateId)
    .eq("center_id", centerId)
    .eq("class_type_id", classTypeId)
    .in("day_of_week", days);

  if (error) {
    return "save-failed";
  }

  const hasDuplicate = (existingBlocks ?? []).some((existingBlock) =>
    values.some(
      (value) =>
        existingBlock.day_of_week === value.dayOfWeek &&
        normalizeTimeForComparison(existingBlock.start_time) === value.startTime &&
        normalizeTimeForComparison(existingBlock.end_time) === value.endTime,
    ),
  );

  return hasDuplicate ? "template-block-duplicate" : null;
}

function getTemplateBlockIds(formData: FormData) {
  return [
    ...new Set(
      formData
        .getAll("templateBlockIds")
        .flatMap((value) => (typeof value === "string" ? [value.trim()] : []))
        .filter(Boolean),
    ),
  ];
}

function getTargetTemplateDay(formData: FormData) {
  const day = Number(getRequiredFormString(formData, "targetDayOfWeek"));

  return SCHEDULE_TEMPLATE_DAYS.includes(
    day as (typeof SCHEDULE_TEMPLATE_DAYS)[number],
  )
    ? day
    : null;
}

function getTemplateBlockCopyKey(values: {
  center_id: string;
  class_type_id: string;
  day_of_week: number;
  end_time: string;
  start_time: string;
}) {
  return [
    values.center_id,
    values.class_type_id,
    values.day_of_week,
    normalizeTimeForComparison(values.start_time),
    normalizeTimeForComparison(values.end_time),
  ].join(":");
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
        context.centerFilterId,
      ),
    );
  }

  const normalizedValidation = normalizeScheduleTemplateValuesForApplication({
    formData,
    timezone: context.organization.timezone,
    values: validation.values,
  });

  if (!normalizedValidation.ok) {
    redirect(
      getErrorPath(
        context.organization.id,
        context.weekStart,
        normalizedValidation.error,
        context.view,
        context.day,
        context.centerFilterId,
      ),
    );
  }

  const templateValues = normalizedValidation.values;

  if (templateValues.status === "archived") {
    redirect(
      getErrorPath(
        context.organization.id,
        context.weekStart,
        "template-archive-confirmation-required",
        context.view,
        context.day,
        context.centerFilterId,
      ),
    );
  }

  const supabase = await createClient();
  const centerError = await validateOptionalCenterReference({
    centerId: templateValues.centerId,
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
        context.centerFilterId,
      ),
    );
  }

  const { data: template, error } = await supabase
    .from("schedule_templates")
    .insert({
      center_id: templateValues.centerId,
      metadata: mergeTemplateEditorMetadata(null, templateValues),
      name: templateValues.name,
      organization_id: context.organization.id,
      status: templateValues.status,
      template_type: "weekly",
      valid_from: templateValues.validFrom,
      valid_until: templateValues.validUntil,
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
        context.centerFilterId,
      ),
    );
  }

  if (template) {
    const syncStatus = await ensureScheduleTemplateRangeApplied({
      minimumWeekStart: resolveWeek(undefined, context.organization.timezone)
        .weekStart,
      organizationId: context.organization.id,
      replaceExisting: shouldReplaceExistingAppliedTemplates(formData),
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
          context.centerFilterId,
        ),
      );
    }

    await recordOperationalAuditEvent({
      action: "created",
      changedFields: getScheduleTemplateCreatedAuditFields(templateValues),
      entityId: template.id,
      entityType: "schedule_templates",
      organizationId: context.organization.id,
      supabase,
    });
  }

  redirect(
    getScheduleTemplatesPath({
      centerId: context.centerFilterId,
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
        context.centerFilterId,
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
        context.centerFilterId,
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
        context.centerFilterId,
      ),
    );
  }

  const normalizedValidation = normalizeScheduleTemplateValuesForApplication({
    formData,
    timezone: context.organization.timezone,
    values: validation.values,
  });

  if (!normalizedValidation.ok) {
    redirect(
      getErrorPath(
        context.organization.id,
        context.weekStart,
        normalizedValidation.error,
        context.view,
        context.day,
        context.centerFilterId,
      ),
    );
  }

  const templateValues = normalizedValidation.values;

  if (templateValues.status === "archived") {
    redirect(
      getErrorPath(
        context.organization.id,
        context.weekStart,
        "template-archive-confirmation-required",
        context.view,
        context.day,
        context.centerFilterId,
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
        context.centerFilterId,
      ),
    );
  }

  const { data: existingTemplate, error: existingTemplateError } = await supabase
    .from("schedule_templates")
    .select("id, center_id, name, status, valid_from, valid_until, metadata")
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
        context.centerFilterId,
      ),
    );
  }

  const centerError = await validateOptionalCenterReference({
    centerId: templateValues.centerId,
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
        context.centerFilterId,
      ),
    );
  }

  const nextMetadata = mergeTemplateEditorMetadata(
    existingTemplate.metadata,
    templateValues,
  );

  const { error } = await supabase
    .from("schedule_templates")
    .update({
      center_id: templateValues.centerId,
      metadata: nextMetadata,
      name: templateValues.name,
      status: templateValues.status,
      valid_from: templateValues.validFrom,
      valid_until: templateValues.validUntil,
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
        context.centerFilterId,
      ),
    );
  }

  let alignedTemplateBlockCount = 0;

  if (templateValues.centerId) {
    const { data: alignedTemplateBlocks, error: alignedTemplateBlocksError } =
      await supabase
        .from("schedule_template_blocks")
        .update({ center_id: templateValues.centerId })
        .eq("organization_id", context.organization.id)
        .eq("template_id", templateId)
        .neq("center_id", templateValues.centerId)
        .select("id");

    if (alignedTemplateBlocksError) {
      redirect(
        getErrorPath(
          context.organization.id,
          context.weekStart,
          getMutationError(alignedTemplateBlocksError.code),
          context.view,
          context.day,
          context.centerFilterId,
        ),
      );
    }

    alignedTemplateBlockCount = alignedTemplateBlocks?.length ?? 0;
  }

  const syncStatus = await ensureScheduleTemplateRangeApplied({
    minimumWeekStart: resolveWeek(undefined, context.organization.timezone)
      .weekStart,
    organizationId: context.organization.id,
    replaceExisting: shouldReplaceExistingAppliedTemplates(formData),
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
        context.centerFilterId,
      ),
    );
  }

  const changedFields: OperationalAuditChangedFields = {};
  addAuditFieldChange(
    changedFields,
    "center_id",
    existingTemplate.center_id,
    templateValues.centerId,
  );
  addAuditFieldChange(
    changedFields,
    "status",
    existingTemplate.status,
    templateValues.status,
  );
  addAuditFieldChange(
    changedFields,
    "valid_from",
    existingTemplate.valid_from,
    templateValues.validFrom,
  );
  addAuditFieldChange(
    changedFields,
    "valid_until",
    existingTemplate.valid_until,
    templateValues.validUntil,
  );
  const existingEditorSettings = getScheduleTemplateEditorSettings(
    existingTemplate.metadata,
  );
  addAuditFieldChange(
    changedFields,
    "editor_start_time",
    existingEditorSettings.startTime,
    templateValues.editorStartTime,
  );
  addAuditFieldChange(
    changedFields,
    "editor_end_time",
    existingEditorSettings.endTime,
    templateValues.editorEndTime,
  );

  if (existingTemplate.name !== templateValues.name) {
    changedFields.name = auditFieldTouched();
  }

  if (alignedTemplateBlockCount > 0 && templateValues.centerId) {
    changedFields.template_blocks_center_id = auditFieldSet(
      templateValues.centerId,
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
      centerId: context.centerFilterId,
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
        context.centerFilterId,
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
        context.centerFilterId,
      ),
    );
  }

  if (templateResult.template.status === "archived") {
    redirect(
      getScheduleTemplatesPath({
        centerId: context.centerFilterId,
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
        context.centerFilterId,
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
      centerId: context.centerFilterId,
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
        context.centerFilterId,
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
        context.centerFilterId,
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
        context.centerFilterId,
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
        context.centerFilterId,
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
        context.centerFilterId,
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
      centerId: context.centerFilterId,
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
  const validation = validateScheduleTemplateBlockCreateForm(formData);
  const keepCreateOpen = shouldKeepTemplateBlockCreateOpen(formData);

  if (!validation.ok) {
    redirect(
      getErrorPath(
        context.organization.id,
        context.weekStart,
        validation.error,
        context.view,
        context.day,
        context.centerFilterId,
      ),
    );
  }

  const referenceValues = validation.values[0];

  if (!referenceValues) {
    redirect(
      getErrorPath(
        context.organization.id,
        context.weekStart,
        "missing-fields",
        context.view,
        context.day,
        context.centerFilterId,
      ),
    );
  }

  const supabase = await createClient();
  const referenceResult = await validateTemplateBlockReferences({
    centerId: referenceValues.centerId,
    classTypeId: referenceValues.classTypeId,
    defaultCoachProfileId: referenceValues.defaultCoachProfileId,
    organizationId: context.organization.id,
    supabase,
    templateId: referenceValues.templateId,
  });

  if (referenceResult.error || !referenceResult.centerId) {
    redirect(
      getErrorPath(
        context.organization.id,
        context.weekStart,
        referenceResult.error ?? "invalid-center",
        context.view,
        context.day,
        context.centerFilterId,
      ),
    );
  }

  const centerId = referenceResult.centerId;
  const duplicateError = await validateTemplateBlockExactDuplicates({
    centerId,
    classTypeId: referenceValues.classTypeId,
    organizationId: context.organization.id,
    supabase,
    templateId: referenceValues.templateId,
    values: validation.values,
  });

  if (duplicateError) {
    redirect(
      getErrorPath(
        context.organization.id,
        context.weekStart,
        duplicateError,
        context.view,
        context.day,
        context.centerFilterId,
      ),
    );
  }

  for (const values of validation.values) {
    const availabilityError = await validateTemplateDefaultCoachAvailability({
      defaultCoachProfileId: values.defaultCoachProfileId,
      dayOfWeek: values.dayOfWeek,
      endTime: values.endTime,
      organizationId: context.organization.id,
      startTime: values.startTime,
      supabase,
      templateId: values.templateId,
    });

    if (availabilityError) {
      redirect(
        getErrorPath(
          context.organization.id,
          context.weekStart,
          availabilityError,
          context.view,
          context.day,
          context.centerFilterId,
        ),
      );
    }
  }

  const { data: templateBlocks, error } = await supabase
    .from("schedule_template_blocks")
    .insert(
      validation.values.map((values) => ({
        center_id: centerId,
        class_type_id: values.classTypeId,
        day_of_week: values.dayOfWeek,
        default_coach_profile_id: values.defaultCoachProfileId,
        end_time: values.endTime,
        notes: values.notes,
        organization_id: context.organization.id,
        required_coaches: values.requiredCoaches,
        start_time: values.startTime,
        template_id: values.templateId,
      })),
    )
    .select("id, day_of_week");

  if (
    error ||
    !templateBlocks ||
    templateBlocks.length !== validation.values.length
  ) {
    redirect(
      getErrorPath(
        context.organization.id,
        context.weekStart,
        getMutationError(error?.code),
        context.view,
        context.day,
        context.centerFilterId,
      ),
    );
  }

  const syncStatus = await ensureScheduleTemplateCurrentWeekApplied({
    organizationId: context.organization.id,
    supabase,
    templateId: referenceValues.templateId,
    timezone: context.organization.timezone,
    weekStart: context.weekStart,
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
        context.centerFilterId,
      ),
    );
  }

  const valuesByDay = new Map<number, (typeof validation.values)[number]>(
    validation.values.map((values) => [values.dayOfWeek, values]),
  );

  await Promise.all(
    templateBlocks.map((templateBlock) => {
      const values = valuesByDay.get(templateBlock.day_of_week);

      return recordOperationalAuditEvent({
        action: "created",
        changedFields: values
          ? getScheduleTemplateBlockCreatedAuditFields({
              ...values,
              centerId,
            })
          : {},
        entityId: templateBlock.id,
        entityType: "schedule_template_blocks",
        organizationId: context.organization.id,
        supabase,
      });
    }),
  );

  const createBlockDays = [
    ...new Set(validation.values.map((values) => values.dayOfWeek)),
  ].join(",");

  redirect(
    getScheduleTemplatesPath({
      centerId: context.centerFilterId,
      createTemplateBlock: keepCreateOpen,
      createTemplateBlockDay: keepCreateOpen
        ? String(referenceValues.dayOfWeek)
        : null,
      createTemplateBlockDays: keepCreateOpen ? createBlockDays : null,
      createTemplateBlockEnd: keepCreateOpen ? referenceValues.endTime : null,
      createTemplateBlockStart: keepCreateOpen
        ? referenceValues.startTime
        : null,
      createTemplateBlockTemplateId: keepCreateOpen
        ? referenceValues.templateId
        : null,
      day: keepCreateOpen ? String(referenceValues.dayOfWeek) : context.day,
      organizationId: context.organization.id,
      status:
        templateBlocks.length > 1
          ? "template-blocks-created"
          : "template-block-created",
      view: context.view,
      week: context.weekStart,
    }),
  );
}

export async function copyScheduleTemplateBlock(formData: FormData) {
  const context = await getOperationalActionContext(formData);
  const sourceTemplateBlockId = getRequiredFormString(
    formData,
    "sourceTemplateBlockId",
  );
  const validation = validateScheduleTemplateBlockCreateForm(formData);

  if (!sourceTemplateBlockId) {
    redirect(
      getErrorPath(
        context.organization.id,
        context.weekStart,
        "template-block-required",
        context.view,
        context.day,
        context.centerFilterId,
      ),
    );
  }

  if (!isScheduleTemplateUuid(sourceTemplateBlockId)) {
    redirect(
      getErrorPath(
        context.organization.id,
        context.weekStart,
        "invalid-template-block",
        context.view,
        context.day,
        context.centerFilterId,
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
        context.centerFilterId,
      ),
    );
  }

  const referenceValues = validation.values[0];

  if (!referenceValues) {
    redirect(
      getErrorPath(
        context.organization.id,
        context.weekStart,
        "missing-fields",
        context.view,
        context.day,
        context.centerFilterId,
      ),
    );
  }

  const supabase = await createClient();
  const { data: sourceBlock, error: sourceBlockError } = await supabase
    .from("schedule_template_blocks")
    .select("id, template_id")
    .eq("id", sourceTemplateBlockId)
    .eq("organization_id", context.organization.id)
    .maybeSingle();

  if (
    sourceBlockError ||
    !sourceBlock ||
    sourceBlock.template_id !== referenceValues.templateId
  ) {
    redirect(
      getErrorPath(
        context.organization.id,
        context.weekStart,
        "invalid-template-block",
        context.view,
        context.day,
        context.centerFilterId,
      ),
    );
  }

  const referenceResult = await validateTemplateBlockReferences({
    centerId: referenceValues.centerId,
    classTypeId: referenceValues.classTypeId,
    defaultCoachProfileId: referenceValues.defaultCoachProfileId,
    organizationId: context.organization.id,
    supabase,
    templateId: referenceValues.templateId,
  });

  if (referenceResult.error || !referenceResult.centerId) {
    redirect(
      getErrorPath(
        context.organization.id,
        context.weekStart,
        referenceResult.error ?? "invalid-center",
        context.view,
        context.day,
        context.centerFilterId,
      ),
    );
  }

  const centerId = referenceResult.centerId;
  const duplicateError = await validateTemplateBlockExactDuplicates({
    centerId,
    classTypeId: referenceValues.classTypeId,
    organizationId: context.organization.id,
    supabase,
    templateId: referenceValues.templateId,
    values: validation.values,
  });

  if (duplicateError) {
    redirect(
      getErrorPath(
        context.organization.id,
        context.weekStart,
        duplicateError,
        context.view,
        context.day,
        context.centerFilterId,
      ),
    );
  }

  for (const values of validation.values) {
    const availabilityError = await validateTemplateDefaultCoachAvailability({
      defaultCoachProfileId: values.defaultCoachProfileId,
      dayOfWeek: values.dayOfWeek,
      endTime: values.endTime,
      organizationId: context.organization.id,
      startTime: values.startTime,
      supabase,
      templateId: values.templateId,
    });

    if (availabilityError) {
      redirect(
        getErrorPath(
          context.organization.id,
          context.weekStart,
          availabilityError,
          context.view,
          context.day,
          context.centerFilterId,
        ),
      );
    }
  }

  const { data: copiedBlocks, error } = await supabase
    .from("schedule_template_blocks")
    .insert(
      validation.values.map((values) => ({
        center_id: centerId,
        class_type_id: values.classTypeId,
        day_of_week: values.dayOfWeek,
        default_coach_profile_id: values.defaultCoachProfileId,
        end_time: values.endTime,
        notes: values.notes,
        organization_id: context.organization.id,
        required_coaches: values.requiredCoaches,
        start_time: values.startTime,
        template_id: values.templateId,
      })),
    )
    .select("id, day_of_week");

  if (
    error ||
    !copiedBlocks ||
    copiedBlocks.length !== validation.values.length
  ) {
    redirect(
      getErrorPath(
        context.organization.id,
        context.weekStart,
        getMutationError(error?.code),
        context.view,
        context.day,
        context.centerFilterId,
      ),
    );
  }

  const syncStatus = await ensureScheduleTemplateRangeApplied({
    minimumWeekStart: resolveWeek(undefined, context.organization.timezone)
      .weekStart,
    organizationId: context.organization.id,
    supabase,
    templateId: referenceValues.templateId,
    templateBlockIds: copiedBlocks.map((templateBlock) => templateBlock.id),
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
        context.centerFilterId,
      ),
    );
  }

  const valuesByDay = new Map<number, (typeof validation.values)[number]>(
    validation.values.map((values) => [values.dayOfWeek, values]),
  );

  await Promise.all(
    copiedBlocks.map((templateBlock) => {
      const values = valuesByDay.get(templateBlock.day_of_week);

      return recordOperationalAuditEvent({
        action: "created",
        changedFields: values
          ? {
              ...getScheduleTemplateBlockCreatedAuditFields({
                ...values,
                centerId,
              }),
              copied_from_template_block_id: auditFieldSet(
                sourceTemplateBlockId,
              ),
            }
          : {},
        entityId: templateBlock.id,
        entityType: "schedule_template_blocks",
        organizationId: context.organization.id,
        supabase,
      });
    }),
  );

  redirect(
    getScheduleTemplatesPath({
      centerId: context.centerFilterId,
      day: context.day,
      organizationId: context.organization.id,
      status:
        copiedBlocks.length > 1
          ? "template-blocks-copied"
          : "template-block-copied",
      view: context.view,
      week: context.weekStart,
    }),
  );
}

export async function copyScheduleTemplateBlocksBulk(formData: FormData) {
  const context = await getOperationalActionContext(formData);
  const templateId = getRequiredFormString(formData, "templateId");
  const templateBlockIds = getTemplateBlockIds(formData);
  const targetDayOfWeek = getTargetTemplateDay(formData);

  if (templateBlockIds.length === 0) {
    redirect(
      getErrorPath(
        context.organization.id,
        context.weekStart,
        "template-block-required",
        context.view,
        context.day,
        context.centerFilterId,
      ),
    );
  }

  if (!templateId) {
    redirect(
      getErrorPath(
        context.organization.id,
        context.weekStart,
        "missing-fields",
        context.view,
        context.day,
        context.centerFilterId,
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
        context.centerFilterId,
      ),
    );
  }

  if (templateBlockIds.some((blockId) => !isScheduleTemplateUuid(blockId))) {
    redirect(
      getErrorPath(
        context.organization.id,
        context.weekStart,
        "invalid-template-block",
        context.view,
        context.day,
        context.centerFilterId,
      ),
    );
  }

  if (!targetDayOfWeek) {
    redirect(
      getErrorPath(
        context.organization.id,
        context.weekStart,
        "invalid-day",
        context.view,
        context.day,
        context.centerFilterId,
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
        context.centerFilterId,
      ),
    );
  }

  const { data: sourceBlocks, error: sourceBlocksError } = await supabase
    .from("schedule_template_blocks")
    .select(
      "id, template_id, center_id, class_type_id, day_of_week, default_coach_profile_id, end_time, notes, required_coaches, start_time",
    )
    .eq("organization_id", context.organization.id)
    .eq("template_id", templateId)
    .in("id", templateBlockIds);

  const sourceBlocksById = new Map(
    (sourceBlocks ?? []).map((block) => [block.id, block]),
  );
  const orderedSourceBlocks = templateBlockIds.flatMap((blockId) => {
    const block = sourceBlocksById.get(blockId);

    return block ? [block] : [];
  });

  if (
    sourceBlocksError ||
    !sourceBlocks ||
    orderedSourceBlocks.length !== templateBlockIds.length
  ) {
    redirect(
      getErrorPath(
        context.organization.id,
        context.weekStart,
        "invalid-template-block",
        context.view,
        context.day,
        context.centerFilterId,
      ),
    );
  }

  const copyValues: TemplateBlockBulkCopyValue[] = [];

  for (const sourceBlock of orderedSourceBlocks) {
    const defaultCoachProfileId = scheduleTemplateBlockRequiresCoach(
      sourceBlock.required_coaches,
    )
      ? sourceBlock.default_coach_profile_id
      : null;
    const referenceResult = await validateTemplateBlockReferences({
      centerId: sourceBlock.center_id,
      classTypeId: sourceBlock.class_type_id,
      defaultCoachProfileId,
      organizationId: context.organization.id,
      supabase,
      templateId,
    });

    if (referenceResult.error || !referenceResult.centerId) {
      redirect(
        getErrorPath(
          context.organization.id,
          context.weekStart,
          referenceResult.error ?? "invalid-center",
          context.view,
          context.day,
          context.centerFilterId,
        ),
      );
    }

    copyValues.push({
      centerId: referenceResult.centerId,
      classTypeId: sourceBlock.class_type_id,
      dayOfWeek: targetDayOfWeek,
      defaultCoachProfileId,
      endTime: normalizeTimeForComparison(sourceBlock.end_time),
      notes: sourceBlock.notes,
      requiredCoaches: sourceBlock.required_coaches,
      sourceBlockId: sourceBlock.id,
      startTime: normalizeTimeForComparison(sourceBlock.start_time),
      templateId,
    });
  }

  const { data: existingTargetBlocks, error: existingTargetBlocksError } =
    await supabase
      .from("schedule_template_blocks")
      .select(
        "id, center_id, class_type_id, day_of_week, default_coach_profile_id, end_time, start_time",
      )
      .eq("organization_id", context.organization.id)
      .eq("template_id", templateId)
      .eq("day_of_week", targetDayOfWeek);

  if (existingTargetBlocksError) {
    redirect(
      getErrorPath(
        context.organization.id,
        context.weekStart,
        "save-failed",
        context.view,
        context.day,
        context.centerFilterId,
      ),
    );
  }

  const existingDuplicateKeys = new Set(
    (existingTargetBlocks ?? []).map((block) =>
      getTemplateBlockCopyKey(block),
    ),
  );
  const newDuplicateKeys = new Set<string>();

  for (const values of copyValues) {
    const copyKey = getTemplateBlockCopyKey({
      center_id: values.centerId,
      class_type_id: values.classTypeId,
      day_of_week: values.dayOfWeek,
      end_time: values.endTime,
      start_time: values.startTime,
    });

    if (existingDuplicateKeys.has(copyKey) || newDuplicateKeys.has(copyKey)) {
      redirect(
        getErrorPath(
          context.organization.id,
          context.weekStart,
          "template-block-duplicate",
          context.view,
          context.day,
          context.centerFilterId,
        ),
      );
    }

    newDuplicateKeys.add(copyKey);
  }

  const availabilityBlocks = [
    ...(existingTargetBlocks ?? []).map((block) => ({
      default_coach_profile_id: block.default_coach_profile_id,
      day_of_week: block.day_of_week,
      end_time: block.end_time,
      id: block.id,
      start_time: block.start_time,
    })),
    ...copyValues.map((values) => ({
      default_coach_profile_id: values.defaultCoachProfileId,
      day_of_week: values.dayOfWeek,
      end_time: values.endTime,
      id: `copy:${values.sourceBlockId}`,
      start_time: values.startTime,
    })),
  ];

  for (const values of copyValues) {
    if (!values.defaultCoachProfileId) {
      continue;
    }

    const unavailableBlocks = getUnavailableScheduleTemplateCoachBlocks({
      blocks: availabilityBlocks,
      targetBlock: {
        day_of_week: values.dayOfWeek,
        end_time: values.endTime,
        id: `copy:${values.sourceBlockId}`,
        start_time: values.startTime,
      },
    });

    if (
      unavailableBlocks.some(
        (block) => block.coachProfileId === values.defaultCoachProfileId,
      )
    ) {
      redirect(
        getErrorPath(
          context.organization.id,
          context.weekStart,
          "coach-unavailable",
          context.view,
          context.day,
          context.centerFilterId,
        ),
      );
    }
  }

  const { data: copiedBlocks, error } = await supabase
    .from("schedule_template_blocks")
    .insert(
      copyValues.map((values) => ({
        center_id: values.centerId,
        class_type_id: values.classTypeId,
        day_of_week: values.dayOfWeek,
        default_coach_profile_id: values.defaultCoachProfileId,
        end_time: values.endTime,
        notes: values.notes,
        organization_id: context.organization.id,
        required_coaches: values.requiredCoaches,
        start_time: values.startTime,
        template_id: values.templateId,
      })),
    )
    .select("id, center_id, class_type_id, day_of_week, end_time, start_time");

  if (
    error ||
    !copiedBlocks ||
    copiedBlocks.length !== copyValues.length
  ) {
    redirect(
      getErrorPath(
        context.organization.id,
        context.weekStart,
        getMutationError(error?.code),
        context.view,
        context.day,
        context.centerFilterId,
      ),
    );
  }

  const syncStatus = await ensureScheduleTemplateRangeApplied({
    minimumWeekStart: resolveWeek(undefined, context.organization.timezone)
      .weekStart,
    organizationId: context.organization.id,
    supabase,
    templateId,
    templateBlockIds: copiedBlocks.map((templateBlock) => templateBlock.id),
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
        context.centerFilterId,
      ),
    );
  }

  const valuesByCopyKey = new Map(
    copyValues.map((values) => [
      getTemplateBlockCopyKey({
        center_id: values.centerId,
        class_type_id: values.classTypeId,
        day_of_week: values.dayOfWeek,
        end_time: values.endTime,
        start_time: values.startTime,
      }),
      values,
    ]),
  );

  await Promise.all(
    copiedBlocks.map((templateBlock) => {
      const values = valuesByCopyKey.get(getTemplateBlockCopyKey(templateBlock));

      return recordOperationalAuditEvent({
        action: "created",
        changedFields: values
          ? {
              ...getScheduleTemplateBlockCreatedAuditFields({
                centerId: values.centerId,
                classTypeId: values.classTypeId,
                dayOfWeek: values.dayOfWeek,
                defaultCoachProfileId: values.defaultCoachProfileId,
                endTime: values.endTime,
                notes: values.notes,
                requiredCoaches: values.requiredCoaches,
                startTime: values.startTime,
              }),
              copied_from_template_block_id: auditFieldSet(
                values.sourceBlockId,
              ),
            }
          : {},
        entityId: templateBlock.id,
        entityType: "schedule_template_blocks",
        organizationId: context.organization.id,
        supabase,
      });
    }),
  );

  redirect(
    getScheduleTemplatesPath({
      centerId: context.centerFilterId,
      day: String(targetDayOfWeek),
      organizationId: context.organization.id,
      status:
        copiedBlocks.length > 1
          ? "template-blocks-copied"
          : "template-block-copied",
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
        context.centerFilterId,
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
        context.centerFilterId,
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
        context.centerFilterId,
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
        context.centerFilterId,
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
        context.centerFilterId,
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
        context.centerFilterId,
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
        context.centerFilterId,
      ),
    );
  }

  const syncStatus = await ensureScheduleTemplateRangeApplied({
    minimumWeekStart: resolveWeek(undefined, context.organization.timezone)
      .weekStart,
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
        context.centerFilterId,
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
      centerId: context.centerFilterId,
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
        context.centerFilterId,
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
        context.centerFilterId,
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
        context.centerFilterId,
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
        context.centerFilterId,
      ),
    );
  }

  redirect(
    getScheduleTemplatesPath({
      centerId: context.centerFilterId,
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
        context.centerFilterId,
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
        context.centerFilterId,
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
        context.centerFilterId,
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
        context.centerFilterId,
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
        context.centerFilterId,
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
        context.centerFilterId,
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
        context.centerFilterId,
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
        context.centerFilterId,
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
        context.centerFilterId,
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
          context.centerFilterId,
        ),
      );
    }
  }

  const { data: allBlocks, error: blocksError } = await supabase
    .from("schedule_template_blocks")
    .select(
      "id, center_id, class_type_id, day_of_week, default_coach_profile_id, end_time, notes, required_coaches, start_time, template_id",
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
        context.centerFilterId,
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
        context.centerFilterId,
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
        context.centerFilterId,
      ),
    );
  }

  if (coachUpdate.shouldUpdate && normalizedBulkCoachProfileId) {
    for (const block of selectedBlocks) {
      const certificationError = await validateCoachCertificationForClassType({
        classTypeId: block.class_type_id,
        coachProfileId: normalizedBulkCoachProfileId,
        organizationId: context.organization.id,
        supabase,
      });

      if (certificationError) {
        redirect(
          getErrorPath(
            context.organization.id,
            context.weekStart,
            certificationError,
            context.view,
            context.day,
            context.centerFilterId,
          ),
        );
      }
    }

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
          context.centerFilterId,
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
          context.centerFilterId,
        ),
      );
    }

    const syncStatus = await ensureScheduleTemplateRangeApplied({
      minimumWeekStart: resolveWeek(undefined, context.organization.timezone)
        .weekStart,
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
          context.centerFilterId,
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
      centerId: context.centerFilterId,
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
        context.centerFilterId,
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
        context.centerFilterId,
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
        context.centerFilterId,
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
        context.centerFilterId,
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
        context.centerFilterId,
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
    result.status === "coach-missing-certification" ||
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
        context.centerFilterId,
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
      centerId:
        context.centerFilterId === TEMPLATE_CENTER_FILTER_ALL
          ? null
          : context.centerFilterId,
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
