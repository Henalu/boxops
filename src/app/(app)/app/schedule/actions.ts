"use server";

import { redirect } from "next/navigation";

import { getLoginPath } from "@/lib/auth/redirects";
import {
  canManageOperationalData,
  canManageStaffWorkWindows,
} from "@/lib/auth/permissions";
import {
  getActiveMemberships,
  getAuthenticatedUser,
  resolveActiveOrganization,
} from "@/lib/auth/tenant";
import { getSchedulePath } from "@/lib/navigation/app-paths";
import {
  isCoverageActiveBlock,
  isScheduleFilterCoverageState,
  isScheduleUuid,
  resolveWeek,
  validateScheduleAssignmentForm,
  validateScheduleAssignmentRemovalForm,
  validateScheduleBlockForm,
  type ScheduleBlockFormValues,
} from "@/lib/schedule-blocks";
import {
  validateStaffWorkWindowForm,
  validateStaffWorkWindowReferences,
  type StaffWorkWindowFormValues,
} from "@/lib/staff-work-windows";
import {
  addAuditFieldChange,
  auditFieldChange,
  auditFieldSet,
  auditFieldTouched,
  recordOperationalAuditEvent,
  type OperationalAuditChangedFields,
} from "@/lib/operational-audit";
import { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
type ScheduleRedirectFilters = {
  centerId?: string | null;
  classTypeId?: string | null;
  coachProfileId?: string | null;
  coverageState?: string | null;
  day?: string | null;
  mineOnly?: boolean | null;
  risksOnly?: boolean | null;
  showWorkWindows?: boolean | null;
  view?: string | null;
};

const DATE_PARAM_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SCHEDULE_ACTION_VIEWS = ["week", "agenda", "month"] as const;
const ACTION_RETURN_PATHS = ["/app/coverage", "/app/schedule"] as const;

function getRequiredFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

function getFallbackReturnPath({
  filters,
  organizationId,
  week,
}: {
  filters: ScheduleRedirectFilters;
  organizationId: string | null;
  week: string | null;
}) {
  return getSchedulePath({
    organizationId,
    week,
    ...filters,
  });
}

function getSafeReturnPath(formData: FormData, fallbackPath: string) {
  const rawReturnPath = getRequiredFormString(formData, "returnPath");

  if (!rawReturnPath) {
    return fallbackPath;
  }

  try {
    const url = new URL(rawReturnPath, "http://boxops.local");

    if (
      url.origin !== "http://boxops.local" ||
      !ACTION_RETURN_PATHS.some((path) => url.pathname === path)
    ) {
      return fallbackPath;
    }

    return `${url.pathname}${url.search}`;
  } catch {
    return fallbackPath;
  }
}

function getActionResultPath({
  key,
  returnPath,
  value,
}: {
  key: "error" | "status";
  returnPath: string;
  value: string;
}) {
  const url = new URL(returnPath, "http://boxops.local");

  if (key === "error") {
    url.searchParams.delete("status");
  } else {
    url.searchParams.delete("error");
  }

  url.searchParams.set(key, value);

  return `${url.pathname}${url.search}`;
}

function getScheduleRedirectFilters(formData: FormData): ScheduleRedirectFilters {
  const centerId = getRequiredFormString(formData, "center_id");
  const coachProfileId = getRequiredFormString(formData, "coach_profile_id");
  const classTypeId = getRequiredFormString(formData, "class_type_id");
  const coverageState = getRequiredFormString(formData, "coverage_state");
  const mineOnly = getRequiredFormString(formData, "mine");
  const risksOnly = getRequiredFormString(formData, "risks_only");
  const workWindows = getRequiredFormString(formData, "work_windows");
  const view = getRequiredFormString(formData, "view");
  const day = getRequiredFormString(formData, "day");

  return {
    centerId: isScheduleUuid(centerId) ? centerId : null,
    classTypeId: isScheduleUuid(classTypeId) ? classTypeId : null,
    coachProfileId: isScheduleUuid(coachProfileId) ? coachProfileId : null,
    coverageState: isScheduleFilterCoverageState(coverageState)
      ? coverageState
      : null,
    mineOnly: mineOnly === "1" || mineOnly === "true",
    risksOnly: risksOnly === "1" || risksOnly === "true",
    showWorkWindows:
      workWindows === "0" || workWindows === "false" ? false : null,
    view: SCHEDULE_ACTION_VIEWS.includes(
      view as (typeof SCHEDULE_ACTION_VIEWS)[number],
    )
      ? view
      : null,
    day: DATE_PARAM_PATTERN.test(day) ? day : null,
  };
}

async function getOperationalActionContext(
  formData: FormData,
  permission: "schedule" | "staff-work-windows" = "schedule",
) {
  const organizationId = getRequiredFormString(formData, "organizationId");
  const rawWeekStart = getRequiredFormString(formData, "weekStart");
  const filters = getScheduleRedirectFilters(formData);
  const fallbackReturnPath = getFallbackReturnPath({
    filters,
    organizationId,
    week: rawWeekStart || null,
  });
  const returnPath = getSafeReturnPath(formData, fallbackReturnPath);
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect(getLoginPath(returnPath));
  }

  const memberships = await getActiveMemberships(user.id);
  const resolution = resolveActiveOrganization(memberships, organizationId);

  if (!resolution.ok) {
    redirect(
      getActionResultPath({
        key: "error",
        returnPath,
        value: resolution.reason,
      }),
    );
  }

  const canManage =
    permission === "staff-work-windows"
      ? canManageStaffWorkWindows(resolution.membership.role)
      : canManageOperationalData(resolution.membership.role);

  if (!canManage) {
    redirect(
      getActionResultPath({
        key: "error",
        returnPath,
        value: "forbidden",
      }),
    );
  }

  const week = resolveWeek(rawWeekStart || undefined, resolution.organization.timezone);

  return {
    filters,
    organization: resolution.organization,
    returnPath,
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
    return "invalid-time";
  }

  return "save-failed";
}

function getAssignmentMutationError(errorCode?: string) {
  if (errorCode === "23P01") {
    return "coach-unavailable";
  }

  if (errorCode === "23505") {
    return "duplicate-assignment";
  }

  if (errorCode === "23503") {
    return "invalid-assignment-reference";
  }

  return "save-failed";
}

function getStaffWorkWindowMutationError(errorCode?: string) {
  if (errorCode === "23503") {
    return "invalid-reference";
  }

  if (errorCode === "23514") {
    return "invalid-time";
  }

  return "save-failed";
}

async function validateBlockReferences({
  centerId,
  classTypeId,
  organizationId,
}: {
  centerId: string;
  classTypeId: string;
  organizationId: string;
}) {
  const supabase = await createClient();
  const [centerResult, classTypeResult] = await Promise.all([
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

  if (centerResult.error || !centerResult.data) {
    return "invalid-center";
  }

  if (classTypeResult.error || !classTypeResult.data) {
    return "invalid-class-type";
  }

  return null;
}

function isTemplateAppliedBlock(block: {
  template_block_id: string | null;
  template_id: string | null;
}) {
  return Boolean(block.template_id || block.template_block_id);
}

function normalizeComparableTime(value: string) {
  return value.slice(0, 5);
}

function didChangeTemplateAppliedBlock({
  block,
  values,
}: {
  block: {
    center_id: string;
    class_type_id: string;
    end_time: string;
    notes: string | null;
    required_coaches: number;
    service_date: string;
    start_time: string;
    status: string;
  };
  values: ScheduleBlockFormValues;
}) {
  return (
    block.center_id !== values.centerId ||
    block.class_type_id !== values.classTypeId ||
    block.service_date !== values.serviceDate ||
    normalizeComparableTime(block.start_time) !== values.startTime ||
    normalizeComparableTime(block.end_time) !== values.endTime ||
    block.required_coaches !== values.requiredCoaches ||
    block.status !== values.status ||
    (block.notes ?? null) !== values.notes
  );
}

function getScheduleBlockCreatedAuditFields(
  values: ScheduleBlockFormValues,
): OperationalAuditChangedFields {
  return {
    center_id: auditFieldSet(values.centerId),
    class_type_id: auditFieldSet(values.classTypeId),
    end_time: auditFieldSet(values.endTime),
    ...(values.notes ? { notes: auditFieldTouched() } : {}),
    required_coaches: auditFieldSet(values.requiredCoaches),
    service_date: auditFieldSet(values.serviceDate),
    start_time: auditFieldSet(values.startTime),
    status: auditFieldSet(values.status),
  };
}

function getScheduleBlockChangedAuditFields({
  block,
  values,
}: {
  block: {
    center_id: string;
    class_type_id: string;
    end_time: string;
    notes: string | null;
    required_coaches: number;
    service_date: string;
    start_time: string;
    status: string;
  };
  values: ScheduleBlockFormValues;
}): OperationalAuditChangedFields {
  const changedFields: OperationalAuditChangedFields = {};

  addAuditFieldChange(changedFields, "center_id", block.center_id, values.centerId);
  addAuditFieldChange(
    changedFields,
    "class_type_id",
    block.class_type_id,
    values.classTypeId,
  );
  addAuditFieldChange(
    changedFields,
    "service_date",
    block.service_date,
    values.serviceDate,
  );
  addAuditFieldChange(
    changedFields,
    "start_time",
    normalizeComparableTime(block.start_time),
    values.startTime,
  );
  addAuditFieldChange(
    changedFields,
    "end_time",
    normalizeComparableTime(block.end_time),
    values.endTime,
  );
  addAuditFieldChange(
    changedFields,
    "required_coaches",
    block.required_coaches,
    values.requiredCoaches,
  );
  addAuditFieldChange(changedFields, "status", block.status, values.status);

  if ((block.notes ?? null) !== values.notes) {
    changedFields.notes = auditFieldTouched();
  }

  return changedFields;
}

function getStaffWorkWindowCreatedAuditFields(
  values: StaffWorkWindowFormValues,
): OperationalAuditChangedFields {
  return {
    center_id: auditFieldSet(values.centerId),
    day_of_week: auditFieldSet(values.dayOfWeek),
    end_time: auditFieldSet(values.endTime),
    ...(values.notes ? { notes: auditFieldTouched() } : {}),
    person_profile_id: auditFieldSet(values.personProfileId),
    start_time: auditFieldSet(values.startTime),
    status: auditFieldSet(values.status),
    valid_from: auditFieldSet(values.validFrom),
    valid_until: auditFieldSet(values.validUntil),
  };
}

function getStaffWorkWindowChangedAuditFields({
  values,
  window,
}: {
  values: StaffWorkWindowFormValues;
  window: {
    center_id: string | null;
    day_of_week: number;
    end_time: string;
    notes: string | null;
    person_profile_id: string;
    start_time: string;
    status: string;
    valid_from: string;
    valid_until: string | null;
  };
}): OperationalAuditChangedFields {
  const changedFields: OperationalAuditChangedFields = {};

  addAuditFieldChange(
    changedFields,
    "person_profile_id",
    window.person_profile_id,
    values.personProfileId,
  );
  addAuditFieldChange(changedFields, "center_id", window.center_id, values.centerId);
  addAuditFieldChange(
    changedFields,
    "day_of_week",
    window.day_of_week,
    values.dayOfWeek,
  );
  addAuditFieldChange(
    changedFields,
    "start_time",
    normalizeComparableTime(window.start_time),
    values.startTime,
  );
  addAuditFieldChange(
    changedFields,
    "end_time",
    normalizeComparableTime(window.end_time),
    values.endTime,
  );
  addAuditFieldChange(
    changedFields,
    "valid_from",
    window.valid_from,
    values.validFrom,
  );
  addAuditFieldChange(
    changedFields,
    "valid_until",
    window.valid_until,
    values.validUntil,
  );
  addAuditFieldChange(changedFields, "status", window.status, values.status);

  if ((window.notes ?? null) !== values.notes) {
    changedFields.notes = auditFieldTouched();
  }

  return changedFields;
}

async function validateAssignableBlock({
  organizationId,
  scheduleBlockId,
  supabase,
}: {
  organizationId: string;
  scheduleBlockId: string;
  supabase: SupabaseServerClient;
}) {
  const { data: block, error } = await supabase
    .from("schedule_blocks")
    .select("id, status")
    .eq("id", scheduleBlockId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error || !block) {
    return "block-required";
  }

  if (!isCoverageActiveBlock(block.status)) {
    return "block-not-assignable";
  }

  return null;
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

  if (coachError || !coachProfile) {
    return "invalid-coach";
  }

  if (coachProfile.status !== "active") {
    return "coach-inactive";
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

    if (personError || !personProfile) {
      return "invalid-person-profile";
    }

    if (personProfile.status !== "active") {
      return "person-profile-inactive";
    }

    if (personProfile.visibility_status !== "visible") {
      return "person-profile-internal";
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
      return "coach-membership-inactive";
    }
  }

  return null;
}

export async function createScheduleBlock(formData: FormData) {
  const context = await getOperationalActionContext(formData);
  const validation = validateScheduleBlockForm(formData, context.weekStart);

  if (!validation.ok) {
    redirect(
      getActionResultPath({
        key: "error",
        returnPath: context.returnPath,
        value: validation.error,
      }),
    );
  }

  const referenceError = await validateBlockReferences({
    centerId: validation.values.centerId,
    classTypeId: validation.values.classTypeId,
    organizationId: context.organization.id,
  });

  if (referenceError) {
    redirect(
      getActionResultPath({
        key: "error",
        returnPath: context.returnPath,
        value: referenceError,
      }),
    );
  }

  const supabase = await createClient();
  const { data: block, error } = await supabase
    .from("schedule_blocks")
    .insert({
      center_id: validation.values.centerId,
      class_type_id: validation.values.classTypeId,
      end_time: validation.values.endTime,
      notes: validation.values.notes,
      organization_id: context.organization.id,
      required_coaches: validation.values.requiredCoaches,
      service_date: validation.values.serviceDate,
      start_time: validation.values.startTime,
      status: validation.values.status,
    })
    .select("id")
    .single();

  if (error || !block) {
    redirect(
      getActionResultPath({
        key: "error",
        returnPath: context.returnPath,
        value: getMutationError(error?.code),
      }),
    );
  }

  await recordOperationalAuditEvent({
    action: "created",
    changedFields: getScheduleBlockCreatedAuditFields(validation.values),
    entityId: block.id,
    entityType: "schedule_blocks",
    organizationId: context.organization.id,
    supabase,
  });

  redirect(
    getActionResultPath({
      key: "status",
      returnPath: context.returnPath,
      value: "created",
    }),
  );
}

export async function assignScheduleBlockCoach(formData: FormData) {
  const context = await getOperationalActionContext(formData);
  const validation = validateScheduleAssignmentForm(formData);

  if (!validation.ok) {
    redirect(
      getActionResultPath({
        key: "error",
        returnPath: context.returnPath,
        value: validation.error,
      }),
    );
  }

  const supabase = await createClient();
  const blockError = await validateAssignableBlock({
    organizationId: context.organization.id,
    scheduleBlockId: validation.values.scheduleBlockId,
    supabase,
  });

  if (blockError) {
    redirect(
      getActionResultPath({
        key: "error",
        returnPath: context.returnPath,
        value: blockError,
      }),
    );
  }

  const coachError = await validateAssignableCoach({
    coachProfileId: validation.values.coachProfileId,
    organizationId: context.organization.id,
    supabase,
  });

  if (coachError) {
    redirect(
      getActionResultPath({
        key: "error",
        returnPath: context.returnPath,
        value: coachError,
      }),
    );
  }

  const { data: existingAssignment, error: existingError } = await supabase
    .from("schedule_block_assignments")
    .select("id, assignment_status")
    .eq("organization_id", context.organization.id)
    .eq("schedule_block_id", validation.values.scheduleBlockId)
    .eq("coach_profile_id", validation.values.coachProfileId)
    .maybeSingle();

  if (existingError) {
    redirect(
      getActionResultPath({
        key: "error",
        returnPath: context.returnPath,
        value: "save-failed",
      }),
    );
  }

  if (existingAssignment) {
    if (existingAssignment.assignment_status !== "removed") {
      redirect(
        getActionResultPath({
          key: "error",
          returnPath: context.returnPath,
          value: "duplicate-assignment",
        }),
      );
    }

    const { error } = await supabase
      .from("schedule_block_assignments")
      .update({
        assignment_status: "assigned",
        source: "manual",
      })
      .eq("id", existingAssignment.id)
      .eq("organization_id", context.organization.id)
      .select("id")
      .single();

    if (error) {
      redirect(
        getActionResultPath({
          key: "error",
          returnPath: context.returnPath,
          value: getAssignmentMutationError(error.code),
        }),
      );
    }

    await recordOperationalAuditEvent({
      action: "assigned",
      changedFields: {
        assignment_status: auditFieldChange(
          existingAssignment.assignment_status,
          "assigned",
        ),
        coach_profile_id: auditFieldSet(validation.values.coachProfileId),
        schedule_block_id: auditFieldSet(validation.values.scheduleBlockId),
        source: auditFieldSet("manual"),
      },
      entityId: existingAssignment.id,
      entityType: "schedule_block_assignments",
      organizationId: context.organization.id,
      supabase,
    });
  } else {
    const { data: assignment, error } = await supabase
      .from("schedule_block_assignments")
      .insert({
        assignment_status: "assigned",
        coach_profile_id: validation.values.coachProfileId,
        organization_id: context.organization.id,
        schedule_block_id: validation.values.scheduleBlockId,
        source: "manual",
      })
      .select("id")
      .single();

    if (error || !assignment) {
      redirect(
        getActionResultPath({
          key: "error",
          returnPath: context.returnPath,
          value: getAssignmentMutationError(error?.code),
        }),
      );
    }

    await recordOperationalAuditEvent({
      action: "assigned",
      changedFields: {
        assignment_status: auditFieldSet("assigned"),
        coach_profile_id: auditFieldSet(validation.values.coachProfileId),
        schedule_block_id: auditFieldSet(validation.values.scheduleBlockId),
        source: auditFieldSet("manual"),
      },
      entityId: assignment.id,
      entityType: "schedule_block_assignments",
      organizationId: context.organization.id,
      supabase,
    });
  }

  redirect(
    getActionResultPath({
      key: "status",
      returnPath: context.returnPath,
      value: "assigned",
    }),
  );
}

export async function removeScheduleBlockAssignment(formData: FormData) {
  const context = await getOperationalActionContext(formData);
  const validation = validateScheduleAssignmentRemovalForm(formData);

  if (!validation.ok) {
    redirect(
      getActionResultPath({
        key: "error",
        returnPath: context.returnPath,
        value: validation.error,
      }),
    );
  }

  const supabase = await createClient();
  const { data: assignment, error: assignmentError } = await supabase
    .from("schedule_block_assignments")
    .select("id, assignment_status, coach_profile_id, schedule_block_id")
    .eq("id", validation.assignmentId)
    .eq("organization_id", context.organization.id)
    .maybeSingle();

  if (assignmentError || !assignment) {
    redirect(
      getActionResultPath({
        key: "error",
        returnPath: context.returnPath,
        value: "assignment-required",
      }),
    );
  }

  const [blockResult, coachResult] = await Promise.all([
    supabase
      .from("schedule_blocks")
      .select("id")
      .eq("id", assignment.schedule_block_id)
      .eq("organization_id", context.organization.id)
      .maybeSingle(),
    supabase
      .from("coach_profiles")
      .select("id")
      .eq("id", assignment.coach_profile_id)
      .eq("organization_id", context.organization.id)
      .maybeSingle(),
  ]);

  if (blockResult.error || coachResult.error || !blockResult.data || !coachResult.data) {
    redirect(
      getActionResultPath({
        key: "error",
        returnPath: context.returnPath,
        value: "invalid-assignment-reference",
      }),
    );
  }

  const { error } = await supabase
    .from("schedule_block_assignments")
    .update({ assignment_status: "removed" })
    .eq("id", assignment.id)
    .eq("organization_id", context.organization.id)
    .select("id")
    .single();

  if (error) {
    redirect(
      getActionResultPath({
        key: "error",
        returnPath: context.returnPath,
        value: getAssignmentMutationError(error.code),
      }),
    );
  }

  await recordOperationalAuditEvent({
    action: "removed",
    changedFields: {
      assignment_status: auditFieldChange(
        assignment.assignment_status,
        "removed",
      ),
      coach_profile_id: auditFieldSet(assignment.coach_profile_id),
      schedule_block_id: auditFieldSet(assignment.schedule_block_id),
    },
    entityId: assignment.id,
    entityType: "schedule_block_assignments",
    organizationId: context.organization.id,
    supabase,
  });

  redirect(
    getActionResultPath({
      key: "status",
      returnPath: context.returnPath,
      value: "assignment-removed",
    }),
  );
}

export async function updateScheduleBlock(formData: FormData) {
  const context = await getOperationalActionContext(formData);
  const scheduleBlockId = getRequiredFormString(formData, "scheduleBlockId");
  const validation = validateScheduleBlockForm(formData, context.weekStart);

  if (!scheduleBlockId) {
    redirect(
      getActionResultPath({
        key: "error",
        returnPath: context.returnPath,
        value: "block-required",
      }),
    );
  }

  if (!validation.ok) {
    redirect(
      getActionResultPath({
        key: "error",
        returnPath: context.returnPath,
        value: validation.error,
      }),
    );
  }

  const referenceError = await validateBlockReferences({
    centerId: validation.values.centerId,
    classTypeId: validation.values.classTypeId,
    organizationId: context.organization.id,
  });

  if (referenceError) {
    redirect(
      getActionResultPath({
        key: "error",
        returnPath: context.returnPath,
        value: referenceError,
      }),
    );
  }

  const supabase = await createClient();
  const { data: existingBlock, error: existingBlockError } = await supabase
    .from("schedule_blocks")
    .select(
      "id, center_id, class_type_id, service_date, start_time, end_time, required_coaches, status, notes, template_id, template_block_id, is_template_exception",
    )
    .eq("id", scheduleBlockId)
    .eq("organization_id", context.organization.id)
    .maybeSingle();

  if (existingBlockError || !existingBlock) {
    redirect(
      getActionResultPath({
        key: "error",
        returnPath: context.returnPath,
        value: "block-required",
      }),
    );
  }

  const shouldMarkTemplateException =
    existingBlock.is_template_exception ||
    (isTemplateAppliedBlock(existingBlock) &&
      didChangeTemplateAppliedBlock({
        block: existingBlock,
        values: validation.values,
      }));

  const { error } = await supabase
    .from("schedule_blocks")
    .update({
      center_id: validation.values.centerId,
      class_type_id: validation.values.classTypeId,
      end_time: validation.values.endTime,
      is_template_exception: shouldMarkTemplateException,
      notes: validation.values.notes,
      required_coaches: validation.values.requiredCoaches,
      service_date: validation.values.serviceDate,
      start_time: validation.values.startTime,
      status: validation.values.status,
    })
    .eq("id", scheduleBlockId)
    .eq("organization_id", context.organization.id)
    .select("id")
    .single();

  if (error) {
    redirect(
      getActionResultPath({
        key: "error",
        returnPath: context.returnPath,
        value: getMutationError(error.code),
      }),
    );
  }

  await recordOperationalAuditEvent({
    action: "updated",
    changedFields: getScheduleBlockChangedAuditFields({
      block: existingBlock,
      values: validation.values,
    }),
    entityId: existingBlock.id,
    entityType: "schedule_blocks",
    organizationId: context.organization.id,
    supabase,
  });

  redirect(
    getActionResultPath({
      key: "status",
      returnPath: context.returnPath,
      value: "updated",
    }),
  );
}

export async function cancelScheduleBlock(formData: FormData) {
  const context = await getOperationalActionContext(formData);
  const scheduleBlockId = getRequiredFormString(formData, "scheduleBlockId");

  if (!scheduleBlockId) {
    redirect(
      getActionResultPath({
        key: "error",
        returnPath: context.returnPath,
        value: "block-required",
      }),
    );
  }

  const supabase = await createClient();
  const { data: block, error: blockError } = await supabase
    .from("schedule_blocks")
    .select("id, status, template_id, template_block_id, is_template_exception")
    .eq("id", scheduleBlockId)
    .eq("organization_id", context.organization.id)
    .maybeSingle();

  if (blockError || !block) {
    redirect(
      getActionResultPath({
        key: "error",
        returnPath: context.returnPath,
        value: "block-required",
      }),
    );
  }

  const { error } = await supabase
    .from("schedule_blocks")
    .update({
      is_template_exception:
        block.is_template_exception || isTemplateAppliedBlock(block),
      status: "cancelled",
    })
    .eq("id", scheduleBlockId)
    .eq("organization_id", context.organization.id)
    .select("id")
    .single();

  if (error) {
    redirect(
      getActionResultPath({
        key: "error",
        returnPath: context.returnPath,
        value: getMutationError(error.code),
      }),
    );
  }

  await recordOperationalAuditEvent({
    action: "cancelled",
    changedFields: {
      is_template_exception: auditFieldSet(
        block.is_template_exception || isTemplateAppliedBlock(block),
      ),
      status: auditFieldChange(block.status, "cancelled"),
    },
    entityId: block.id,
    entityType: "schedule_blocks",
    organizationId: context.organization.id,
    supabase,
  });

  redirect(
    getActionResultPath({
      key: "status",
      returnPath: context.returnPath,
      value: "cancelled",
    }),
  );
}

export async function createStaffWorkWindow(formData: FormData) {
  const context = await getOperationalActionContext(
    formData,
    "staff-work-windows",
  );
  const validation = validateStaffWorkWindowForm(formData);

  if (!validation.ok) {
    redirect(
      getActionResultPath({
        key: "error",
        returnPath: context.returnPath,
        value: validation.error,
      }),
    );
  }

  const supabase = await createClient();
  const referenceError = await validateStaffWorkWindowReferences({
    organizationId: context.organization.id,
    supabase,
    values: validation.values,
  });

  if (referenceError) {
    redirect(
      getActionResultPath({
        key: "error",
        returnPath: context.returnPath,
        value: referenceError,
      }),
    );
  }

  const { data: window, error } = await supabase
    .from("staff_work_windows")
    .insert({
      center_id: validation.values.centerId,
      day_of_week: validation.values.dayOfWeek,
      end_time: validation.values.endTime,
      notes: validation.values.notes,
      organization_id: context.organization.id,
      person_profile_id: validation.values.personProfileId,
      start_time: validation.values.startTime,
      status: validation.values.status,
      valid_from: validation.values.validFrom,
      valid_until: validation.values.validUntil,
    })
    .select("id")
    .single();

  if (error || !window) {
    redirect(
      getActionResultPath({
        key: "error",
        returnPath: context.returnPath,
        value: getStaffWorkWindowMutationError(error?.code),
      }),
    );
  }

  await recordOperationalAuditEvent({
    action: "created",
    changedFields: getStaffWorkWindowCreatedAuditFields(validation.values),
    entityId: window.id,
    entityType: "staff_work_windows",
    organizationId: context.organization.id,
    supabase,
  });

  redirect(
    getActionResultPath({
      key: "status",
      returnPath: context.returnPath,
      value: "work-window-created",
    }),
  );
}

export async function updateStaffWorkWindow(formData: FormData) {
  const context = await getOperationalActionContext(
    formData,
    "staff-work-windows",
  );
  const staffWorkWindowId = getRequiredFormString(formData, "staffWorkWindowId");
  const validation = validateStaffWorkWindowForm(formData);

  if (!staffWorkWindowId || !isScheduleUuid(staffWorkWindowId)) {
    redirect(
      getActionResultPath({
        key: "error",
        returnPath: context.returnPath,
        value: "work-window-required",
      }),
    );
  }

  if (!validation.ok) {
    redirect(
      getActionResultPath({
        key: "error",
        returnPath: context.returnPath,
        value: validation.error,
      }),
    );
  }

  const supabase = await createClient();
  const { data: existingWindow, error: existingWindowError } = await supabase
    .from("staff_work_windows")
    .select(
      "id, person_profile_id, center_id, day_of_week, start_time, end_time, valid_from, valid_until, status, notes",
    )
    .eq("id", staffWorkWindowId)
    .eq("organization_id", context.organization.id)
    .maybeSingle();

  if (existingWindowError || !existingWindow) {
    redirect(
      getActionResultPath({
        key: "error",
        returnPath: context.returnPath,
        value: "work-window-required",
      }),
    );
  }

  const referenceError = await validateStaffWorkWindowReferences({
    organizationId: context.organization.id,
    supabase,
    values: validation.values,
  });

  if (referenceError) {
    redirect(
      getActionResultPath({
        key: "error",
        returnPath: context.returnPath,
        value: referenceError,
      }),
    );
  }

  const { error } = await supabase
    .from("staff_work_windows")
    .update({
      center_id: validation.values.centerId,
      day_of_week: validation.values.dayOfWeek,
      end_time: validation.values.endTime,
      notes: validation.values.notes,
      person_profile_id: validation.values.personProfileId,
      start_time: validation.values.startTime,
      status: validation.values.status,
      valid_from: validation.values.validFrom,
      valid_until: validation.values.validUntil,
    })
    .eq("id", existingWindow.id)
    .eq("organization_id", context.organization.id)
    .select("id")
    .single();

  if (error) {
    redirect(
      getActionResultPath({
        key: "error",
        returnPath: context.returnPath,
        value: getStaffWorkWindowMutationError(error.code),
      }),
    );
  }

  await recordOperationalAuditEvent({
    action: "updated",
    changedFields: getStaffWorkWindowChangedAuditFields({
      values: validation.values,
      window: existingWindow,
    }),
    entityId: existingWindow.id,
    entityType: "staff_work_windows",
    organizationId: context.organization.id,
    supabase,
  });

  redirect(
    getActionResultPath({
      key: "status",
      returnPath: context.returnPath,
      value: "work-window-updated",
    }),
  );
}

export async function deactivateStaffWorkWindow(formData: FormData) {
  const context = await getOperationalActionContext(
    formData,
    "staff-work-windows",
  );
  const staffWorkWindowId = getRequiredFormString(formData, "staffWorkWindowId");

  if (!staffWorkWindowId || !isScheduleUuid(staffWorkWindowId)) {
    redirect(
      getActionResultPath({
        key: "error",
        returnPath: context.returnPath,
        value: "work-window-required",
      }),
    );
  }

  const supabase = await createClient();
  const { data: existingWindow, error: existingWindowError } = await supabase
    .from("staff_work_windows")
    .select("id, status")
    .eq("id", staffWorkWindowId)
    .eq("organization_id", context.organization.id)
    .maybeSingle();

  if (existingWindowError || !existingWindow) {
    redirect(
      getActionResultPath({
        key: "error",
        returnPath: context.returnPath,
        value: "work-window-required",
      }),
    );
  }

  const { error } = await supabase
    .from("staff_work_windows")
    .update({ status: "inactive" })
    .eq("id", existingWindow.id)
    .eq("organization_id", context.organization.id)
    .select("id")
    .single();

  if (error) {
    redirect(
      getActionResultPath({
        key: "error",
        returnPath: context.returnPath,
        value: getStaffWorkWindowMutationError(error.code),
      }),
    );
  }

  await recordOperationalAuditEvent({
    action: "deactivated",
    changedFields: {
      status: auditFieldChange(existingWindow.status, "inactive"),
    },
    entityId: existingWindow.id,
    entityType: "staff_work_windows",
    organizationId: context.organization.id,
    supabase,
  });

  redirect(
    getActionResultPath({
      key: "status",
      returnPath: context.returnPath,
      value: "work-window-deactivated",
    }),
  );
}
