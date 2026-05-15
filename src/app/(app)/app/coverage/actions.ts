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
  auditFieldChange,
  auditFieldSet,
  recordOperationalAuditEvent,
} from "@/lib/operational-audit";
import { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type BulkAssignableBlock = {
  end_time: string;
  id: string;
  required_coaches: number;
  service_date: string;
  start_time: string;
  status: string;
};

const MAX_BULK_ASSIGNMENT_BLOCKS = 50;
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

function timeToMinutes(value: string) {
  const [hours, minutes] = value.slice(0, 5).split(":").map(Number);

  return hours * 60 + minutes;
}

function blocksOverlap(first: BulkAssignableBlock, second: BulkAssignableBlock) {
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

async function getBulkAssignableBlocks({
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
    .select("id, service_date, start_time, end_time, required_coaches, status")
    .eq("organization_id", organizationId)
    .in("id", blockIds);

  if (error || !blocks || blocks.length !== blockIds.length) {
    return {
      error: "invalid-block",
      value: [] as BulkAssignableBlock[],
    } as const;
  }

  if (
    blocks.some(
      (block) =>
        !isCoverageActiveBlock(block.status) || block.required_coaches <= 0,
    )
  ) {
    return {
      error: "block-not-assignable",
      value: [] as BulkAssignableBlock[],
    } as const;
  }

  return {
    error: null,
    value: blocks satisfies BulkAssignableBlock[],
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
      value: [] as BulkAssignableBlock[],
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
      value: [] as BulkAssignableBlock[],
    } as const;
  }

  const { data: blocks, error: blocksError } = await supabase
    .from("schedule_blocks")
    .select("id, service_date, start_time, end_time, required_coaches, status")
    .eq("organization_id", organizationId)
    .in("id", blockIds);

  if (blocksError || !blocks) {
    return {
      error: "save-failed",
      value: [] as BulkAssignableBlock[],
    } as const;
  }

  return {
    error: null,
    value: blocks.filter((block) => isCoverageActiveBlock(block.status)),
  } as const;
}

function hasSelectedBlockOverlap(blocks: BulkAssignableBlock[]) {
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
  assignedBlocks: BulkAssignableBlock[];
  selectedBlocks: BulkAssignableBlock[];
}) {
  return selectedBlocks.some((selectedBlock) =>
    assignedBlocks.some((assignedBlock) =>
      blocksOverlap(selectedBlock, assignedBlock),
    ),
  );
}

export async function assignCoachToSelectedCoverageBlocks(formData: FormData) {
  const context = await getCoverageActionContext(formData);
  const coachProfileId = getFormString(formData, "coachProfileId");
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

  if (blockIds.length > MAX_BULK_ASSIGNMENT_BLOCKS) {
    redirect(
      getActionResultPath({
        key: "error",
        returnPath: context.returnPath,
        value: "bulk-selection-too-large",
      }),
    );
  }

  if (!coachProfileId) {
    redirect(
      getActionResultPath({
        key: "error",
        returnPath: context.returnPath,
        value: "coach-required",
      }),
    );
  }

  if (!isScheduleUuid(coachProfileId) || blockIds.some((id) => !isScheduleUuid(id))) {
    redirect(
      getActionResultPath({
        key: "error",
        returnPath: context.returnPath,
        value: "invalid-block",
      }),
    );
  }

  const supabase = await createClient();
  const coachError = await validateAssignableCoach({
    coachProfileId,
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

  const selectedBlocksResult = await getBulkAssignableBlocks({
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

  if (hasSelectedBlockOverlap(selectedBlocksResult.value)) {
    redirect(
      getActionResultPath({
        key: "error",
        returnPath: context.returnPath,
        value: "coach-unavailable",
      }),
    );
  }

  const selectedBlockIdSet = new Set(blockIds);
  const assignedBlocksResult = await getCoachAssignedBlocks({
    coachProfileId,
    organizationId: context.organization.id,
    selectedBlockIds: selectedBlockIdSet,
    supabase,
  });

  if (assignedBlocksResult.error) {
    redirect(
      getActionResultPath({
        key: "error",
        returnPath: context.returnPath,
        value: assignedBlocksResult.error,
      }),
    );
  }

  if (
    hasExistingBlockOverlap({
      assignedBlocks: assignedBlocksResult.value,
      selectedBlocks: selectedBlocksResult.value,
    })
  ) {
    redirect(
      getActionResultPath({
        key: "error",
        returnPath: context.returnPath,
        value: "coach-unavailable",
      }),
    );
  }

  const { data: existingAssignments, error: existingAssignmentsError } =
    await supabase
      .from("schedule_block_assignments")
      .select("id, assignment_status, schedule_block_id")
      .eq("organization_id", context.organization.id)
      .eq("coach_profile_id", coachProfileId)
      .in("schedule_block_id", blockIds);

  if (existingAssignmentsError || !existingAssignments) {
    redirect(
      getActionResultPath({
        key: "error",
        returnPath: context.returnPath,
        value: "save-failed",
      }),
    );
  }

  if (
    existingAssignments.some(
      (assignment) => assignment.assignment_status !== "removed",
    )
  ) {
    redirect(
      getActionResultPath({
        key: "error",
        returnPath: context.returnPath,
        value: "duplicate-assignment",
      }),
    );
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
          coach_profile_id: auditFieldSet(coachProfileId),
          schedule_block_id: auditFieldSet(blockId),
          source: auditFieldSet("manual"),
        },
        entityId: existingAssignment.id,
        entityType: "schedule_block_assignments",
        organizationId: context.organization.id,
        supabase,
      });

      continue;
    }

    const { data: assignment, error } = await supabase
      .from("schedule_block_assignments")
      .insert({
        assignment_status: "assigned",
        coach_profile_id: coachProfileId,
        organization_id: context.organization.id,
        schedule_block_id: blockId,
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
        coach_profile_id: auditFieldSet(coachProfileId),
        schedule_block_id: auditFieldSet(blockId),
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
      value: blockIds.length === 1 ? "assigned" : "bulk-assigned",
    }),
  );
}
