import {
  getAdjacentWeekStart,
  resolveWeek,
} from "@/lib/schedule-blocks";
import { scheduleTemplateBlockRequiresCoach } from "@/lib/schedule-templates";
import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type ScheduleTemplateApplicationStatus =
  | "applied"
  | "already-applied"
  | "coach-missing-certification"
  | "coach-unavailable"
  | "invalid-coach"
  | "invalid-template"
  | "save-failed"
  | "template-empty"
  | "template-not-active"
  | "template-out-of-range"
  | "template-week-has-template";

type ScheduleTemplateApplicationResult = {
  insertedBlockCount: number;
  replacedBlockCount: number;
  status: ScheduleTemplateApplicationStatus;
};

type ScheduleTemplateForApplication = {
  center_id: string | null;
  id: string;
  status: string;
  template_type: string;
  valid_from: string | null;
  valid_until: string | null;
};

type ScheduleTemplateBlockForApplication = {
  center_id: string;
  class_type_id: string;
  day_of_week: number;
  default_coach_profile_id: string | null;
  end_time: string;
  id: string;
  notes: string | null;
  required_coaches: number;
  start_time: string;
};

type GeneratedScheduleBlockForSync = {
  center_id: string;
  class_type_id: string;
  end_time: string;
  id: string;
  notes: string | null;
  organization_id: string;
  required_coaches: number;
  service_date: string;
  start_time: string;
  status: string;
  template_block_id: string | null;
  template_id: string | null;
};

type ScheduleBlockAssignmentForSync = {
  assignment_status: string;
  coach_profile_id: string;
  id: string;
  schedule_block_id: string;
  source: string;
};

type ExistingTemplateBlock = {
  center_id: string;
  id: string;
  service_date: string;
  template_block_id: string | null;
  template_id: string | null;
};

const MAX_AUTOMATIC_TEMPLATE_WEEKS = 104;
const SYNC_CHUNK_SIZE = 500;

function chunkArray<T>(items: T[], size = SYNC_CHUNK_SIZE) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function isDateWithinTemplateValidity({
  serviceDate,
  template,
}: {
  serviceDate: string;
  template: ScheduleTemplateForApplication;
}) {
  if (template.valid_from && serviceDate < template.valid_from) {
    return false;
  }

  if (template.valid_until && serviceDate > template.valid_until) {
    return false;
  }

  return true;
}

function shouldReplaceExistingTemplateBlock({
  block,
  template,
}: {
  block: ExistingTemplateBlock;
  template: ScheduleTemplateForApplication;
}) {
  if (block.template_id === template.id) {
    return false;
  }

  if (!template.center_id) {
    return true;
  }

  return block.center_id === template.center_id;
}

function shouldBlockAutomaticApplication({
  block,
  template,
}: {
  block: ExistingTemplateBlock;
  template: ScheduleTemplateForApplication;
}) {
  if (block.template_id === template.id) {
    return false;
  }

  if (!template.center_id) {
    return true;
  }

  return block.center_id === template.center_id;
}

function getMutationStatus(errorCode?: string): ScheduleTemplateApplicationStatus {
  if (errorCode === "23P01") {
    return "coach-unavailable";
  }

  if (errorCode === "23514") {
    return "coach-missing-certification";
  }

  return "save-failed";
}

async function validateDefaultCoachesForTemplateBlocks({
  organizationId,
  supabase,
  templateBlocks,
}: {
  organizationId: string;
  supabase: SupabaseServerClient;
  templateBlocks: ScheduleTemplateBlockForApplication[];
}) {
  const defaultCoachProfileIds = [
    ...new Set(
      templateBlocks.flatMap((block) =>
        scheduleTemplateBlockRequiresCoach(block.required_coaches) &&
        block.default_coach_profile_id
          ? [block.default_coach_profile_id]
          : [],
      ),
    ),
  ];

  for (const coachProfileId of defaultCoachProfileIds) {
    const coachError = await validateAssignableCoachForApplication({
      coachProfileId,
      organizationId,
      supabase,
    });

    if (coachError) {
      return coachError;
    }
  }

  for (const block of templateBlocks) {
    if (
      !scheduleTemplateBlockRequiresCoach(block.required_coaches) ||
      !block.default_coach_profile_id
    ) {
      continue;
    }

    const { data: classType, error: classTypeError } = await supabase
      .from("class_types")
      .select("certification_id")
      .eq("id", block.class_type_id)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (classTypeError || !classType) {
      return "invalid-template" as const;
    }

    if (!classType.certification_id) {
      continue;
    }

    const { data: coachCertification, error: certificationError } =
      await supabase
        .from("coach_certifications")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("coach_profile_id", block.default_coach_profile_id)
        .eq("certification_id", classType.certification_id)
        .eq("status", "active")
        .maybeSingle();

    if (certificationError || !coachCertification) {
      return "coach-missing-certification" as const;
    }
  }

  return null;
}

async function loadTemplateForApplication({
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
    .select("id, center_id, status, template_type, valid_from, valid_until")
    .eq("id", templateId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error || !template || template.template_type !== "weekly") {
    return {
      error: "invalid-template" as const,
      template: null,
    };
  }

  if (template.status !== "active") {
    return {
      error: "template-not-active" as const,
      template: null,
    };
  }

  return {
    error: null,
    template: template satisfies ScheduleTemplateForApplication,
  };
}

async function loadTemplateBlocksForApplication({
  organizationId,
  supabase,
  templateId,
}: {
  organizationId: string;
  supabase: SupabaseServerClient;
  templateId: string;
}) {
  const { data: templateBlocks, error } = await supabase
    .from("schedule_template_blocks")
    .select(
      "id, center_id, class_type_id, day_of_week, start_time, end_time, required_coaches, default_coach_profile_id, notes",
    )
    .eq("organization_id", organizationId)
    .eq("template_id", templateId)
    .order("day_of_week", { ascending: true })
    .order("start_time", { ascending: true });

  if (error) {
    return {
      error: "save-failed" as const,
      templateBlocks: [],
    };
  }

  return {
    error: null,
    templateBlocks:
      templateBlocks satisfies ScheduleTemplateBlockForApplication[],
  };
}

async function loadExistingTemplateBlocksForWeek({
  organizationId,
  supabase,
  weekEnd,
  weekStart,
}: {
  organizationId: string;
  supabase: SupabaseServerClient;
  weekEnd: string;
  weekStart: string;
}) {
  const { data: existingBlocks, error } = await supabase
    .from("schedule_blocks")
    .select("id, center_id, service_date, template_id, template_block_id")
    .eq("organization_id", organizationId)
    .gte("service_date", weekStart)
    .lte("service_date", weekEnd)
    .not("template_id", "is", null)
    .neq("status", "cancelled");

  if (error) {
    return {
      error: "save-failed" as const,
      existingBlocks: [],
    };
  }

  return {
    error: null,
    existingBlocks: existingBlocks satisfies ExistingTemplateBlock[],
  };
}

async function validateAssignableCoachForApplication({
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
    return "invalid-coach" as const;
  }

  if (!coachProfile.user_id && !coachProfile.person_profile_id) {
    return "invalid-coach" as const;
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
      return "invalid-coach" as const;
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
      return "invalid-coach" as const;
    }
  }

  return null;
}

function getTemplateBlocksForWeek({
  template,
  templateBlocks,
  timezone,
  weekStart,
}: {
  template: ScheduleTemplateForApplication;
  templateBlocks: ScheduleTemplateBlockForApplication[];
  timezone: string;
  weekStart: string;
}) {
  const week = resolveWeek(weekStart, timezone);

  return templateBlocks.flatMap((block) => {
    const serviceDate = week.days[block.day_of_week - 1] ?? week.weekStart;

    if (
      !serviceDate ||
      !isDateWithinTemplateValidity({ serviceDate, template })
    ) {
      return [];
    }

    return [
      {
        block,
        serviceDate,
      },
    ];
  });
}

async function insertTemplateBlocksForWeek({
  existingBlocks,
  organizationId,
  supabase,
  template,
  templateBlocks,
  timezone,
  weekStart,
}: {
  existingBlocks: ExistingTemplateBlock[];
  organizationId: string;
  supabase: SupabaseServerClient;
  template: ScheduleTemplateForApplication;
  templateBlocks: ScheduleTemplateBlockForApplication[];
  timezone: string;
  weekStart: string;
}) {
  const weeklyTemplateBlocks = getTemplateBlocksForWeek({
    template,
    templateBlocks,
    timezone,
    weekStart,
  });
  const existingKeys = new Set(
    existingBlocks
      .filter((block) => block.template_id === template.id)
      .map(
        (block) => `${block.template_block_id ?? ""}:${block.service_date}`,
      ),
  );
  const blocksToInsert = weeklyTemplateBlocks.flatMap(
    ({ block, serviceDate }) => {
      if (existingKeys.has(`${block.id}:${serviceDate}`)) {
        return [];
      }

      return [
        {
          center_id: block.center_id,
          class_type_id: block.class_type_id,
          end_time: block.end_time,
          is_template_exception: false,
          notes: block.notes,
          organization_id: organizationId,
          required_coaches: block.required_coaches,
          service_date: serviceDate,
          start_time: block.start_time,
          status: "scheduled",
          template_block_id: block.id,
          template_id: template.id,
        },
      ];
    },
  );

  if (blocksToInsert.length === 0) {
    return {
      insertedBlockCount: 0,
      status: weeklyTemplateBlocks.length === 0
        ? "template-out-of-range"
        : "already-applied",
    } as const;
  }

  const { data: insertedBlocks, error: insertError } = await supabase
    .from("schedule_blocks")
    .insert(blocksToInsert)
    .select("id, template_block_id");

  if (insertError) {
    return {
      insertedBlockCount: 0,
      status: getMutationStatus(insertError.code),
    } as const;
  }

  const defaultCoachByTemplateBlockId = new Map(
    templateBlocks.flatMap((block) =>
      scheduleTemplateBlockRequiresCoach(block.required_coaches) &&
      block.default_coach_profile_id
        ? [[block.id, block.default_coach_profile_id] as const]
        : [],
    ),
  );
  const assignmentsToInsert = insertedBlocks.flatMap((block) => {
    const templateBlockId = block.template_block_id;
    const coachProfileId = templateBlockId
      ? defaultCoachByTemplateBlockId.get(templateBlockId)
      : null;

    if (!coachProfileId) {
      return [];
    }

    return [
      {
        assignment_status: "assigned",
        coach_profile_id: coachProfileId,
        organization_id: organizationId,
        schedule_block_id: block.id,
        source: "template",
      },
    ];
  });

  if (assignmentsToInsert.length > 0) {
    const { error: assignmentsError } = await supabase
      .from("schedule_block_assignments")
      .insert(assignmentsToInsert);

    if (assignmentsError) {
      return {
        insertedBlockCount: insertedBlocks.length,
        status: getMutationStatus(assignmentsError.code),
      } as const;
    }
  }

  return {
    insertedBlockCount: insertedBlocks.length,
    status: "applied",
  } as const;
}

async function syncTemplateAssignmentsForScheduleBlocks({
  organizationId,
  scheduleBlocks,
  supabase,
  templateBlocksById,
}: {
  organizationId: string;
  scheduleBlocks: GeneratedScheduleBlockForSync[];
  supabase: SupabaseServerClient;
  templateBlocksById: Map<string, ScheduleTemplateBlockForApplication>;
}) {
  const scheduleBlockIds = scheduleBlocks.map((block) => block.id);

  if (scheduleBlockIds.length === 0) {
    return {
      status: "applied" as const,
      syncedAssignmentCount: 0,
    };
  }

  const assignments: ScheduleBlockAssignmentForSync[] = [];

  for (const scheduleBlockIdChunk of chunkArray(scheduleBlockIds)) {
    const { data, error } = await supabase
      .from("schedule_block_assignments")
      .select("id, schedule_block_id, coach_profile_id, assignment_status, source")
      .eq("organization_id", organizationId)
      .in("schedule_block_id", scheduleBlockIdChunk);

    if (error) {
      return {
        status: "save-failed" as const,
        syncedAssignmentCount: 0,
      };
    }

    assignments.push(...(data satisfies ScheduleBlockAssignmentForSync[]));
  }

  const assignmentsByBlockId = assignments.reduce((groups, assignment) => {
    const group = groups.get(assignment.schedule_block_id) ?? [];

    group.push(assignment);
    groups.set(assignment.schedule_block_id, group);

    return groups;
  }, new Map<string, ScheduleBlockAssignmentForSync[]>());

  const assignmentIdsToAssign = new Set<string>();
  const assignmentIdsToRemove = new Set<string>();
  const assignmentsToInsert: Array<{
    assignment_status: "assigned";
    coach_profile_id: string;
    organization_id: string;
    schedule_block_id: string;
    source: "template";
  }> = [];

  for (const scheduleBlock of scheduleBlocks) {
    if (!scheduleBlock.template_block_id) {
      continue;
    }

    const templateBlock = templateBlocksById.get(scheduleBlock.template_block_id);

    if (!templateBlock) {
      continue;
    }

    const blockAssignments = assignmentsByBlockId.get(scheduleBlock.id) ?? [];
    const templateAssignments = blockAssignments.filter(
      (assignment) => assignment.source === "template",
    );
    const defaultCoachProfileId = scheduleTemplateBlockRequiresCoach(
      templateBlock.required_coaches,
    )
      ? templateBlock.default_coach_profile_id
      : null;

    if (!defaultCoachProfileId) {
      for (const assignment of templateAssignments) {
        if (assignment.assignment_status === "assigned") {
          assignmentIdsToRemove.add(assignment.id);
        }
      }

      continue;
    }

    const matchingAssignment =
      templateAssignments.find(
        (assignment) => assignment.coach_profile_id === defaultCoachProfileId,
      ) ??
      blockAssignments.find(
        (assignment) => assignment.coach_profile_id === defaultCoachProfileId,
      );

    if (matchingAssignment) {
      if (
        matchingAssignment.assignment_status !== "assigned" ||
        matchingAssignment.source !== "template"
      ) {
        assignmentIdsToAssign.add(matchingAssignment.id);
      }
    } else {
      assignmentsToInsert.push({
        assignment_status: "assigned",
        coach_profile_id: defaultCoachProfileId,
        organization_id: organizationId,
        schedule_block_id: scheduleBlock.id,
        source: "template",
      });
    }

    for (const assignment of templateAssignments) {
      if (
        assignment.coach_profile_id !== defaultCoachProfileId &&
        assignment.assignment_status === "assigned"
      ) {
        assignmentIdsToRemove.add(assignment.id);
      }
    }
  }

  let syncedAssignmentCount = 0;

  for (const assignmentIdChunk of chunkArray([...assignmentIdsToAssign])) {
    const { error } = await supabase
      .from("schedule_block_assignments")
      .update({
        assignment_status: "assigned",
        source: "template",
      })
      .eq("organization_id", organizationId)
      .in("id", assignmentIdChunk);

    if (error) {
      return {
        status: getMutationStatus(error.code),
        syncedAssignmentCount,
      };
    }

    syncedAssignmentCount += assignmentIdChunk.length;
  }

  for (const assignmentChunk of chunkArray(assignmentsToInsert)) {
    const { error } = await supabase
      .from("schedule_block_assignments")
      .insert(assignmentChunk);

    if (error) {
      return {
        status: getMutationStatus(error.code),
        syncedAssignmentCount,
      };
    }

    syncedAssignmentCount += assignmentChunk.length;
  }

  for (const assignmentIdChunk of chunkArray([...assignmentIdsToRemove])) {
    const { error } = await supabase
      .from("schedule_block_assignments")
      .update({ assignment_status: "removed" })
      .eq("organization_id", organizationId)
      .in("id", assignmentIdChunk);

    if (error) {
      return {
        status: getMutationStatus(error.code),
        syncedAssignmentCount,
      };
    }

    syncedAssignmentCount += assignmentIdChunk.length;
  }

  return {
    status: "applied" as const,
    syncedAssignmentCount,
  };
}

async function syncExistingTemplateBlocksForRange({
  organizationId,
  supabase,
  template,
  templateBlockIds,
  timezone,
}: {
  organizationId: string;
  supabase: SupabaseServerClient;
  template: ScheduleTemplateForApplication;
  templateBlockIds?: string[];
  timezone: string;
}) {
  const blocksResult = await loadTemplateBlocksForApplication({
    organizationId,
    supabase,
    templateId: template.id,
  });

  if (blocksResult.error) {
    return {
      status: blocksResult.error,
      syncedAssignmentCount: 0,
      syncedBlockCount: 0,
    };
  }

  const selectedTemplateBlockIds = templateBlockIds
    ? new Set(templateBlockIds)
    : null;
  const templateBlocks = selectedTemplateBlockIds
    ? blocksResult.templateBlocks.filter((block) =>
        selectedTemplateBlockIds.has(block.id),
      )
    : blocksResult.templateBlocks;

  if (templateBlocks.length === 0) {
    return {
      status: "applied" as const,
      syncedAssignmentCount: 0,
      syncedBlockCount: 0,
    };
  }

  const coachError = await validateDefaultCoachesForTemplateBlocks({
    organizationId,
    supabase,
    templateBlocks,
  });

  if (coachError) {
    return {
      status: coachError,
      syncedAssignmentCount: 0,
      syncedBlockCount: 0,
    };
  }

  const startWeek = resolveWeek(template.valid_from ?? "", timezone).weekStart;
  const endWeek = resolveWeek(template.valid_until ?? "", timezone).weekEnd;
  const templateBlocksById = new Map(
    templateBlocks.map((block) => [block.id, block]),
  );
  const generatedBlocks: GeneratedScheduleBlockForSync[] = [];

  for (const templateBlockIdChunk of chunkArray([...templateBlocksById.keys()])) {
    const { data, error } = await supabase
      .from("schedule_blocks")
      .select(
        "id, organization_id, center_id, class_type_id, service_date, start_time, end_time, required_coaches, status, notes, template_id, template_block_id",
      )
      .eq("organization_id", organizationId)
      .eq("template_id", template.id)
      .eq("is_template_exception", false)
      .neq("status", "cancelled")
      .neq("status", "completed")
      .gte("service_date", startWeek)
      .lte("service_date", endWeek)
      .in("template_block_id", templateBlockIdChunk);

    if (error) {
      return {
        status: "save-failed" as const,
        syncedAssignmentCount: 0,
        syncedBlockCount: 0,
      };
    }

    generatedBlocks.push(...(data satisfies GeneratedScheduleBlockForSync[]));
  }

  const rowsToUpsert = generatedBlocks.flatMap((scheduleBlock) => {
    if (!scheduleBlock.template_block_id) {
      return [];
    }

    const templateBlock = templateBlocksById.get(scheduleBlock.template_block_id);

    if (!templateBlock) {
      return [];
    }

    const week = resolveWeek(scheduleBlock.service_date, timezone);
    const serviceDate =
      week.days[templateBlock.day_of_week - 1] ?? scheduleBlock.service_date;

    if (!isDateWithinTemplateValidity({ serviceDate, template })) {
      return [];
    }

    return [
      {
        center_id: templateBlock.center_id,
        class_type_id: templateBlock.class_type_id,
        end_time: templateBlock.end_time,
        id: scheduleBlock.id,
        is_template_exception: false,
        notes: templateBlock.notes,
        organization_id: organizationId,
        required_coaches: templateBlock.required_coaches,
        service_date: serviceDate,
        start_time: templateBlock.start_time,
        status: scheduleBlock.status,
        template_block_id: templateBlock.id,
        template_id: template.id,
      },
    ];
  });

  for (const scheduleBlockChunk of chunkArray(rowsToUpsert)) {
    const { error } = await supabase
      .from("schedule_blocks")
      .upsert(scheduleBlockChunk, { onConflict: "id" });

    if (error) {
      return {
        status: getMutationStatus(error.code),
        syncedAssignmentCount: 0,
        syncedBlockCount: 0,
      };
    }
  }

  const syncedScheduleBlocksById = new Map(
    generatedBlocks.map((block) => [block.id, block]),
  );
  const syncedScheduleBlocks = rowsToUpsert.flatMap((row) => {
    const originalBlock = syncedScheduleBlocksById.get(row.id);

    return originalBlock
      ? [
          {
            ...originalBlock,
            ...row,
          },
        ]
      : [];
  });
  const assignmentResult = await syncTemplateAssignmentsForScheduleBlocks({
    organizationId,
    scheduleBlocks: syncedScheduleBlocks,
    supabase,
    templateBlocksById,
  });

  return {
    status: assignmentResult.status,
    syncedAssignmentCount: assignmentResult.syncedAssignmentCount,
    syncedBlockCount: rowsToUpsert.length,
  };
}

export async function applyScheduleTemplateWeek({
  organizationId,
  replaceExisting,
  supabase,
  templateId,
  timezone,
  weekStart,
}: {
  organizationId: string;
  replaceExisting?: boolean;
  supabase: SupabaseServerClient;
  templateId: string;
  timezone: string;
  weekStart: string;
}): Promise<ScheduleTemplateApplicationResult> {
  const templateResult = await loadTemplateForApplication({
    organizationId,
    supabase,
    templateId,
  });

  if (templateResult.error) {
    return {
      insertedBlockCount: 0,
      replacedBlockCount: 0,
      status: templateResult.error,
    };
  }

  const blocksResult = await loadTemplateBlocksForApplication({
    organizationId,
    supabase,
    templateId,
  });

  if (blocksResult.error) {
    return {
      insertedBlockCount: 0,
      replacedBlockCount: 0,
      status: blocksResult.error,
    };
  }

  if (blocksResult.templateBlocks.length === 0) {
    return {
      insertedBlockCount: 0,
      replacedBlockCount: 0,
      status: "template-empty",
    };
  }

  const coachError = await validateDefaultCoachesForTemplateBlocks({
    organizationId,
    supabase,
    templateBlocks: blocksResult.templateBlocks,
  });

  if (coachError) {
    return {
      insertedBlockCount: 0,
      replacedBlockCount: 0,
      status: coachError,
    };
  }

  const week = resolveWeek(weekStart, timezone);
  const weeklyTemplateBlocks = getTemplateBlocksForWeek({
    template: templateResult.template,
    templateBlocks: blocksResult.templateBlocks,
    timezone,
    weekStart: week.weekStart,
  });

  if (weeklyTemplateBlocks.length === 0) {
    return {
      insertedBlockCount: 0,
      replacedBlockCount: 0,
      status: "template-out-of-range",
    };
  }

  const existingResult = await loadExistingTemplateBlocksForWeek({
    organizationId,
    supabase,
    weekEnd: week.weekEnd,
    weekStart: week.weekStart,
  });

  if (existingResult.error) {
    return {
      insertedBlockCount: 0,
      replacedBlockCount: 0,
      status: existingResult.error,
    };
  }

  const blocksToReplace = existingResult.existingBlocks.filter((block) =>
    shouldReplaceExistingTemplateBlock({
      block,
      template: templateResult.template,
    }),
  );

  if (blocksToReplace.length > 0 && !replaceExisting) {
    return {
      insertedBlockCount: 0,
      replacedBlockCount: 0,
      status: "template-week-has-template",
    };
  }

  if (blocksToReplace.length > 0) {
    const { error: deleteError } = await supabase
      .from("schedule_blocks")
      .delete()
      .eq("organization_id", organizationId)
      .in(
        "id",
        blocksToReplace.map((block) => block.id),
      );

    if (deleteError) {
      return {
        insertedBlockCount: 0,
        replacedBlockCount: 0,
        status: getMutationStatus(deleteError.code),
      };
    }
  }

  const insertResult = await insertTemplateBlocksForWeek({
    existingBlocks: existingResult.existingBlocks.filter(
      (block) => !blocksToReplace.some((replaced) => replaced.id === block.id),
    ),
    organizationId,
    supabase,
    template: templateResult.template,
    templateBlocks: blocksResult.templateBlocks,
    timezone,
    weekStart: week.weekStart,
  });

  return {
    insertedBlockCount: insertResult.insertedBlockCount,
    replacedBlockCount: blocksToReplace.length,
    status:
      insertResult.status === "applied" && blocksToReplace.length > 0
        ? "applied"
        : insertResult.status,
  };
}

export async function ensureScheduleTemplateWeek({
  organizationId,
  supabase,
  templateId,
  timezone,
  weekStart,
}: {
  organizationId: string;
  supabase: SupabaseServerClient;
  templateId: string;
  timezone: string;
  weekStart: string;
}) {
  const templateResult = await loadTemplateForApplication({
    organizationId,
    supabase,
    templateId,
  });

  if (templateResult.error) {
    return templateResult.error;
  }

  const week = resolveWeek(weekStart, timezone);
  const existingResult = await loadExistingTemplateBlocksForWeek({
    organizationId,
    supabase,
    weekEnd: week.weekEnd,
    weekStart: week.weekStart,
  });

  if (existingResult.error) {
    return existingResult.error;
  }

  const hasBlockingTemplate = existingResult.existingBlocks.some((block) =>
    shouldBlockAutomaticApplication({
      block,
      template: templateResult.template,
    }),
  );

  if (hasBlockingTemplate) {
    return "already-applied";
  }

  const result = await applyScheduleTemplateWeek({
    organizationId,
    replaceExisting: false,
    supabase,
    templateId,
    timezone,
    weekStart: week.weekStart,
  });

  return result.status;
}

export async function ensureScheduleTemplateCurrentWeekApplied({
  organizationId,
  supabase,
  templateId,
  timezone,
  weekStart,
}: {
  organizationId: string;
  supabase: SupabaseServerClient;
  templateId: string;
  timezone: string;
  weekStart: string;
}) {
  const templateResult = await loadTemplateForApplication({
    organizationId,
    supabase,
    templateId,
  });

  if (
    templateResult.error ||
    !templateResult.template.valid_from ||
    !templateResult.template.valid_until
  ) {
    return templateResult.error ?? "already-applied";
  }

  const week = resolveWeek(weekStart, timezone);

  if (
    templateResult.template.valid_from > week.weekEnd ||
    templateResult.template.valid_until < week.weekStart
  ) {
    return "already-applied";
  }

  return ensureScheduleTemplateWeek({
    organizationId,
    supabase,
    templateId,
    timezone,
    weekStart: week.weekStart,
  });
}

export async function ensureScheduleTemplateRangeApplied({
  organizationId,
  supabase,
  templateId,
  templateBlockIds,
  timezone,
}: {
  organizationId: string;
  supabase: SupabaseServerClient;
  templateId: string;
  templateBlockIds?: string[];
  timezone: string;
}) {
  const templateResult = await loadTemplateForApplication({
    organizationId,
    supabase,
    templateId,
  });

  if (
    templateResult.error ||
    !templateResult.template.valid_from ||
    !templateResult.template.valid_until
  ) {
    return templateResult.error ?? "already-applied";
  }

  const startWeek = resolveWeek(
    templateResult.template.valid_from,
    timezone,
  ).weekStart;
  const endWeek = resolveWeek(
    templateResult.template.valid_until,
    timezone,
  ).weekStart;
  const syncResult = await syncExistingTemplateBlocksForRange({
    organizationId,
    supabase,
    template: templateResult.template,
    templateBlockIds,
    timezone,
  });

  if (
    syncResult.status === "coach-missing-certification" ||
    syncResult.status === "coach-unavailable" ||
    syncResult.status === "invalid-coach" ||
    syncResult.status === "save-failed"
  ) {
    return syncResult.status;
  }

  let currentWeek = startWeek;
  let weekCount = 0;

  while (currentWeek <= endWeek && weekCount < MAX_AUTOMATIC_TEMPLATE_WEEKS) {
    const ensureStatus = await ensureScheduleTemplateWeek({
      organizationId,
      supabase,
      templateId,
      timezone,
      weekStart: currentWeek,
    });

    if (
      ensureStatus === "coach-missing-certification" ||
      ensureStatus === "coach-unavailable" ||
      ensureStatus === "invalid-coach" ||
      ensureStatus === "save-failed"
    ) {
      return ensureStatus;
    }

    currentWeek = getAdjacentWeekStart(currentWeek, 1);
    weekCount += 1;
  }

  return "applied";
}

export async function ensureActiveScheduleTemplatesForWindow({
  organizationId,
  supabase,
  timezone,
  windowEnd,
  windowStart,
}: {
  organizationId: string;
  supabase: SupabaseServerClient;
  timezone: string;
  windowEnd: string;
  windowStart: string;
}) {
  const { data: templates, error } = await supabase
    .from("schedule_templates")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("template_type", "weekly")
    .eq("status", "active")
    .not("valid_from", "is", null)
    .not("valid_until", "is", null)
    .lte("valid_from", windowEnd)
    .gte("valid_until", windowStart)
    .order("updated_at", { ascending: true });

  if (error || templates.length === 0) {
    return;
  }

  let currentWeek = resolveWeek(windowStart, timezone).weekStart;
  const endWeek = resolveWeek(windowEnd, timezone).weekStart;
  let weekCount = 0;

  while (currentWeek <= endWeek && weekCount < MAX_AUTOMATIC_TEMPLATE_WEEKS) {
    for (const template of templates) {
      await ensureScheduleTemplateWeek({
        organizationId,
        supabase,
        templateId: template.id,
        timezone,
        weekStart: currentWeek,
      });
    }

    currentWeek = getAdjacentWeekStart(currentWeek, 1);
    weekCount += 1;
  }
}
