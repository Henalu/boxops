"use server";

import { redirect } from "next/navigation";

import { getLoginPath } from "@/lib/auth/redirects";
import { canManageOperationalData } from "@/lib/auth/permissions";
import {
  getActiveMemberships,
  getAuthenticatedUser,
  resolveActiveOrganization,
} from "@/lib/auth/tenant";
import { getCoveragePath } from "@/lib/navigation/app-paths";
import {
  isCoverageActiveBlock,
  isScheduleUuid,
  resolveWeek,
} from "@/lib/schedule-blocks";
import {
  addAuditFieldChange,
  auditFieldChange,
  auditFieldSet,
  type OperationalAuditChangedFields,
  recordOperationalAuditEvent,
} from "@/lib/operational-audit";
import { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type BulkEditableBlock = {
  center_id: string;
  class_type_id: string;
  end_time: string;
  id: string;
  is_template_exception: boolean;
  notes: string | null;
  required_coaches: number;
  service_date: string;
  start_time: string;
  status: string;
  template_block_id: string | null;
  template_id: string | null;
};

const BULK_KEEP_VALUE = "keep";
const MAX_BULK_COVERAGE_BLOCKS = 50;
const ACTION_RETURN_PATHS = ["/app/coverage"] as const;

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

function getFormStrings(formData: FormData, key: string) {
  return formData
    .getAll(key)
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);
}

function getSafeReturnPath(formData: FormData, fallbackPath: string) {
  const rawReturnPath = getFormString(formData, "returnPath");

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

  url.searchParams.delete("block_id");
  url.searchParams.set(key, value);

  return `${url.pathname}${url.search}`;
}

async function getCoverageActionContext(formData: FormData) {
  const organizationId = getFormString(formData, "organizationId");
  const rawWeekStart = getFormString(formData, "weekStart");
  const fallbackReturnPath = getCoveragePath({
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

  if (!canManageOperationalData(resolution.membership.role)) {
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
    organization: resolution.organization,
    returnPath,
    weekStart: week.weekStart,
  };
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

function getBlockMutationError(errorCode?: string) {
  if (errorCode === "23503") {
    return "invalid-reference";
  }

  if (errorCode === "23514") {
    return "invalid-required-coaches";
  }

  return "save-failed";
}

function timeToMinutes(value: string) {
  const [hours, minutes] = value.slice(0, 5).split(":").map(Number);

  return hours * 60 + minutes;
}

function blocksOverlap(first: BulkEditableBlock, second: BulkEditableBlock) {
  if (first.service_date !== second.service_date) {
    return false;
  }

  return (
    timeToMinutes(first.start_time) < timeToMinutes(second.end_time) &&
    timeToMinutes(second.start_time) < timeToMinutes(first.end_time)
  );
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

function parseBulkCoachProfileId(value: string | null) {
  if (!value || value === BULK_KEEP_VALUE) {
    return {
      error: null,
      shouldUpdate: false,
      value: null,
    } as const;
  }

  if (!isScheduleUuid(value)) {
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

function parseBulkClassTypeId(value: string | null) {
  if (!value || value === BULK_KEEP_VALUE) {
    return {
      error: null,
      shouldUpdate: false,
      value: null,
    } as const;
  }

  if (!isScheduleUuid(value)) {
    return {
      error: "invalid-class-type" as const,
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

async function validateClassTypeReference({
  classTypeId,
  organizationId,
  supabase,
}: {
  classTypeId: string;
  organizationId: string;
  supabase: SupabaseServerClient;
}) {
  const { data, error } = await supabase
    .from("class_types")
    .select("id")
    .eq("id", classTypeId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  return error || !data ? "invalid-class-type" : null;
}

async function getBulkEditableBlocks({
  blockIds,
  organizationId,
  supabase,
}: {
  blockIds: string[];
  organizationId: string;
  supabase: SupabaseServerClient;
}) {
  const { data: blocks, error } = await supabase
    .from("schedule_blocks")
    .select(
      "id, center_id, class_type_id, service_date, start_time, end_time, required_coaches, status, notes, template_id, template_block_id, is_template_exception",
    )
    .eq("organization_id", organizationId)
    .in("id", blockIds);

  if (error || !blocks || blocks.length !== blockIds.length) {
    return {
      error: "invalid-block",
      value: [] as BulkEditableBlock[],
    } as const;
  }

  if (blocks.some((block) => !isCoverageActiveBlock(block.status))) {
    return {
      error: "block-not-assignable",
      value: [] as BulkEditableBlock[],
    } as const;
  }

  return {
    error: null,
    value: blocks satisfies BulkEditableBlock[],
  } as const;
}

async function getCoachAssignedBlocks({
  coachProfileId,
  organizationId,
  selectedBlockIds,
  supabase,
}: {
  coachProfileId: string;
  organizationId: string;
  selectedBlockIds: Set<string>;
  supabase: SupabaseServerClient;
}) {
  const { data: assignments, error } = await supabase
    .from("schedule_block_assignments")
    .select("schedule_block_id")
    .eq("organization_id", organizationId)
    .eq("coach_profile_id", coachProfileId)
    .eq("assignment_status", "assigned");

  if (error || !assignments) {
    return {
      error: "save-failed",
      value: [] as BulkEditableBlock[],
    } as const;
  }

  const blockIds = [
    ...new Set(
      assignments
        .map((assignment) => assignment.schedule_block_id)
        .filter((blockId) => !selectedBlockIds.has(blockId)),
    ),
  ];

  if (blockIds.length === 0) {
    return {
      error: null,
      value: [] as BulkEditableBlock[],
    } as const;
  }

  const { data: blocks, error: blocksError } = await supabase
    .from("schedule_blocks")
    .select(
      "id, center_id, class_type_id, service_date, start_time, end_time, required_coaches, status, notes, template_id, template_block_id, is_template_exception",
    )
    .eq("organization_id", organizationId)
    .in("id", blockIds);

  if (blocksError || !blocks) {
    return {
      error: "save-failed",
      value: [] as BulkEditableBlock[],
    } as const;
  }

  return {
    error: null,
    value: blocks.filter((block) => isCoverageActiveBlock(block.status)),
  } as const;
}

function hasSelectedBlockOverlap(blocks: BulkEditableBlock[]) {
  for (let index = 0; index < blocks.length; index += 1) {
    for (let compareIndex = index + 1; compareIndex < blocks.length; compareIndex += 1) {
      if (blocksOverlap(blocks[index], blocks[compareIndex])) {
        return true;
      }
    }
  }

  return false;
}

function hasExistingBlockOverlap({
  assignedBlocks,
  selectedBlocks,
}: {
  assignedBlocks: BulkEditableBlock[];
  selectedBlocks: BulkEditableBlock[];
}) {
  return selectedBlocks.some((selectedBlock) =>
    assignedBlocks.some((assignedBlock) =>
      blocksOverlap(selectedBlock, assignedBlock),
    ),
  );
}

function isTemplateAppliedBlock(block: BulkEditableBlock) {
  return Boolean(block.template_id || block.template_block_id);
}

async function validateBulkCoachAssignment({
  blockIds,
  coachProfileId,
  organizationId,
  selectedBlocks,
  supabase,
}: {
  blockIds: string[];
  coachProfileId: string;
  organizationId: string;
  selectedBlocks: BulkEditableBlock[];
  supabase: SupabaseServerClient;
}) {
  const coachError = await validateAssignableCoach({
    coachProfileId,
    organizationId,
    supabase,
  });

  if (coachError) {
    return coachError;
  }

  if (selectedBlocks.some((block) => block.required_coaches <= 0)) {
    return "bulk-coach-not-needed";
  }

  if (hasSelectedBlockOverlap(selectedBlocks)) {
    return "coach-unavailable";
  }

  const selectedBlockIdSet = new Set(blockIds);
  const assignedBlocksResult = await getCoachAssignedBlocks({
    coachProfileId,
    organizationId,
    selectedBlockIds: selectedBlockIdSet,
    supabase,
  });

  if (assignedBlocksResult.error) {
    return assignedBlocksResult.error;
  }

  if (
    hasExistingBlockOverlap({
      assignedBlocks: assignedBlocksResult.value,
      selectedBlocks,
    })
  ) {
    return "coach-unavailable";
  }

  const { data: existingAssignments, error: existingAssignmentsError } =
    await supabase
      .from("schedule_block_assignments")
      .select("id, assignment_status, schedule_block_id")
      .eq("organization_id", organizationId)
      .eq("coach_profile_id", coachProfileId)
      .in("schedule_block_id", blockIds);

  if (existingAssignmentsError || !existingAssignments) {
    return "save-failed";
  }

  if (
    existingAssignments.some(
      (assignment) => assignment.assignment_status !== "removed",
    )
  ) {
    return "duplicate-assignment";
  }

  return null;
}

async function assignCoachToBlocks({
  blockIds,
  coachProfileId,
  organizationId,
  supabase,
}: {
  blockIds: string[];
  coachProfileId: string;
  organizationId: string;
  supabase: SupabaseServerClient;
}) {
  const { data: existingAssignments, error: existingAssignmentsError } =
    await supabase
      .from("schedule_block_assignments")
      .select("id, assignment_status, schedule_block_id")
      .eq("organization_id", organizationId)
      .eq("coach_profile_id", coachProfileId)
      .in("schedule_block_id", blockIds);

  if (existingAssignmentsError || !existingAssignments) {
    return "save-failed";
  }

  const removedAssignmentsByBlockId = new Map(
    existingAssignments.map((assignment) => [
      assignment.schedule_block_id,
      assignment,
    ]),
  );

  for (const blockId of blockIds) {
    const existingAssignment = removedAssignmentsByBlockId.get(blockId);

    if (existingAssignment) {
      const { error } = await supabase
        .from("schedule_block_assignments")
        .update({
          assignment_status: "assigned",
          source: "manual",
        })
        .eq("id", existingAssignment.id)
        .eq("organization_id", organizationId)
        .select("id")
        .single();

      if (error) {
        return getAssignmentMutationError(error.code);
      }

      await recordOperationalAuditEvent({
        action: "assigned",
        changedFields: {
          assignment_status: auditFieldChange(
            existingAssignment.assignment_status,
            "assigned",
          ),
          coach_profile_id: auditFieldSet(coachProfileId),
          schedule_block_id: auditFieldSet(blockId),
          source: auditFieldSet("manual"),
        },
        entityId: existingAssignment.id,
        entityType: "schedule_block_assignments",
        organizationId,
        supabase,
      });

      continue;
    }

    const { data: assignment, error } = await supabase
      .from("schedule_block_assignments")
      .insert({
        assignment_status: "assigned",
        coach_profile_id: coachProfileId,
        organization_id: organizationId,
        schedule_block_id: blockId,
        source: "manual",
      })
      .select("id")
      .single();

    if (error || !assignment) {
      return getAssignmentMutationError(error?.code);
    }

    await recordOperationalAuditEvent({
      action: "assigned",
      changedFields: {
        assignment_status: auditFieldSet("assigned"),
        coach_profile_id: auditFieldSet(coachProfileId),
        schedule_block_id: auditFieldSet(blockId),
        source: auditFieldSet("manual"),
      },
      entityId: assignment.id,
      entityType: "schedule_block_assignments",
      organizationId,
      supabase,
    });
  }

  return null;
}

async function updateBulkScheduleBlocks({
  bulkSize,
  classTypeId,
  organizationId,
  requiredCoaches,
  selectedBlocks,
  supabase,
}: {
  bulkSize: number;
  classTypeId: string | null;
  organizationId: string;
  requiredCoaches: number | null;
  selectedBlocks: BulkEditableBlock[];
  supabase: SupabaseServerClient;
}) {
  for (const block of selectedBlocks) {
    const updates: {
      class_type_id?: string;
      is_template_exception?: boolean;
      required_coaches?: number;
    } = {};
    const changedFields: OperationalAuditChangedFields = {
      bulk_size: auditFieldSet(bulkSize),
      bulk_update: auditFieldSet(true),
    };

    if (classTypeId && block.class_type_id !== classTypeId) {
      updates.class_type_id = classTypeId;
      addAuditFieldChange(
        changedFields,
        "class_type_id",
        block.class_type_id,
        classTypeId,
      );
    }

    if (requiredCoaches !== null && block.required_coaches !== requiredCoaches) {
      updates.required_coaches = requiredCoaches;
      addAuditFieldChange(
        changedFields,
        "required_coaches",
        block.required_coaches,
        requiredCoaches,
      );
    }

    if (Object.keys(updates).length === 0) {
      continue;
    }

    const shouldMarkTemplateException =
      block.is_template_exception || isTemplateAppliedBlock(block);

    if (shouldMarkTemplateException !== block.is_template_exception) {
      updates.is_template_exception = shouldMarkTemplateException;
      addAuditFieldChange(
        changedFields,
        "is_template_exception",
        block.is_template_exception,
        shouldMarkTemplateException,
      );
    }

    const { error } = await supabase
      .from("schedule_blocks")
      .update(updates)
      .eq("id", block.id)
      .eq("organization_id", organizationId)
      .select("id")
      .single();

    if (error) {
      return getBlockMutationError(error.code);
    }

    await recordOperationalAuditEvent({
      action: "updated",
      changedFields,
      entityId: block.id,
      entityType: "schedule_blocks",
      organizationId,
      supabase,
    });
  }

  return null;
}

export async function updateSelectedCoverageBlocks(formData: FormData) {
  const context = await getCoverageActionContext(formData);
  const blockIds = [...new Set(getFormStrings(formData, "scheduleBlockIds"))];

  if (blockIds.length === 0) {
    redirect(
      getActionResultPath({
        key: "error",
        returnPath: context.returnPath,
        value: "bulk-selection-required",
      }),
    );
  }

  if (blockIds.length > MAX_BULK_COVERAGE_BLOCKS) {
    redirect(
      getActionResultPath({
        key: "error",
        returnPath: context.returnPath,
        value: "bulk-selection-too-large",
      }),
    );
  }

  if (blockIds.some((id) => !isScheduleUuid(id))) {
    redirect(
      getActionResultPath({
        key: "error",
        returnPath: context.returnPath,
        value: "invalid-block",
      }),
    );
  }

  const coachUpdate = parseBulkCoachProfileId(getFormString(formData, "coachProfileId"));
  const classTypeUpdate = parseBulkClassTypeId(
    getFormString(formData, "classTypeId"),
  );
  const requiredCoachesUpdate = parseBulkRequiredCoaches(
    getFormString(formData, "requiredCoaches"),
  );
  const firstValidationError =
    coachUpdate.error ?? classTypeUpdate.error ?? requiredCoachesUpdate.error;

  if (firstValidationError) {
    redirect(
      getActionResultPath({
        key: "error",
        returnPath: context.returnPath,
        value: firstValidationError,
      }),
    );
  }

  if (
    !coachUpdate.shouldUpdate &&
    !classTypeUpdate.shouldUpdate &&
    !requiredCoachesUpdate.shouldUpdate
  ) {
    redirect(
      getActionResultPath({
        key: "error",
        returnPath: context.returnPath,
        value: "bulk-update-required",
      }),
    );
  }

  if (
    coachUpdate.shouldUpdate &&
    coachUpdate.value &&
    requiredCoachesUpdate.shouldUpdate &&
    requiredCoachesUpdate.value === 0
  ) {
    redirect(
      getActionResultPath({
        key: "error",
        returnPath: context.returnPath,
        value: "bulk-coach-not-needed",
      }),
    );
  }

  const supabase = await createClient();

  if (classTypeUpdate.shouldUpdate && classTypeUpdate.value) {
    const classTypeError = await validateClassTypeReference({
      classTypeId: classTypeUpdate.value,
      organizationId: context.organization.id,
      supabase,
    });

    if (classTypeError) {
      redirect(
        getActionResultPath({
          key: "error",
          returnPath: context.returnPath,
          value: classTypeError,
        }),
      );
    }
  }

  const selectedBlocksResult = await getBulkEditableBlocks({
    blockIds,
    organizationId: context.organization.id,
    supabase,
  });

  if (selectedBlocksResult.error) {
    redirect(
      getActionResultPath({
        key: "error",
        returnPath: context.returnPath,
        value: selectedBlocksResult.error,
      }),
    );
  }

  const selectedBlocksForAssignment =
    coachUpdate.shouldUpdate &&
    coachUpdate.value &&
    requiredCoachesUpdate.shouldUpdate &&
    requiredCoachesUpdate.value !== null
      ? selectedBlocksResult.value.map((block) => ({
          ...block,
          required_coaches: requiredCoachesUpdate.value ?? block.required_coaches,
        }))
      : selectedBlocksResult.value;

  if (coachUpdate.shouldUpdate && coachUpdate.value) {
    const coachAssignmentError = await validateBulkCoachAssignment({
      blockIds,
      coachProfileId: coachUpdate.value,
      organizationId: context.organization.id,
      selectedBlocks: selectedBlocksForAssignment,
      supabase,
    });

    if (coachAssignmentError) {
      redirect(
        getActionResultPath({
          key: "error",
          returnPath: context.returnPath,
          value: coachAssignmentError,
        }),
      );
    }
  }

  const blockUpdateError = await updateBulkScheduleBlocks({
    bulkSize: blockIds.length,
    classTypeId: classTypeUpdate.value,
    organizationId: context.organization.id,
    requiredCoaches: requiredCoachesUpdate.value,
    selectedBlocks: selectedBlocksResult.value,
    supabase,
  });

  if (blockUpdateError) {
    redirect(
      getActionResultPath({
        key: "error",
        returnPath: context.returnPath,
        value: blockUpdateError,
      }),
    );
  }

  if (coachUpdate.shouldUpdate && coachUpdate.value) {
    const assignmentError = await assignCoachToBlocks({
      blockIds,
      coachProfileId: coachUpdate.value,
      organizationId: context.organization.id,
      supabase,
    });

    if (assignmentError) {
      redirect(
        getActionResultPath({
          key: "error",
          returnPath: context.returnPath,
          value: assignmentError,
        }),
      );
    }
  }

  redirect(
    getActionResultPath({
      key: "status",
      returnPath: context.returnPath,
      value: "bulk-updated",
    }),
  );
}

export async function assignCoachToSelectedCoverageBlocks(formData: FormData) {
  return updateSelectedCoverageBlocks(formData);
}
