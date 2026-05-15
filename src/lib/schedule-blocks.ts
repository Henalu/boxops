import { isPostgresUuid } from "@/lib/uuid";

export const SCHEDULE_BLOCK_STATUSES = [
  "scheduled",
  "uncovered",
  "changed",
  "cancelled",
  "completed",
] as const;

export const SCHEDULE_ASSIGNMENT_STATUSES = [
  "assigned",
  "pending",
  "declined",
  "removed",
] as const;

export const SCHEDULE_COVERAGE_STATES = [
  "covered",
  "uncovered",
  "insufficient",
  "conflict",
  "not_required",
  "inactive",
] as const;

export const SCHEDULE_FILTER_COVERAGE_STATES = [
  "covered",
  "uncovered",
  "insufficient",
  "conflict",
] as const;

export const SCHEDULE_RISK_COVERAGE_STATES = [
  "uncovered",
  "insufficient",
  "conflict",
] as const;

export const SCHEDULE_ABSENCE_IMPACT_STATUSES = [
  "potential",
  "coverage_needed",
] as const;

export type ScheduleBlockStatus = (typeof SCHEDULE_BLOCK_STATUSES)[number];
export type ScheduleAssignmentStatus =
  (typeof SCHEDULE_ASSIGNMENT_STATUSES)[number];
export type ScheduleCoverageState =
  (typeof SCHEDULE_COVERAGE_STATES)[number];
export type ScheduleFilterCoverageState =
  (typeof SCHEDULE_FILTER_COVERAGE_STATES)[number];
export type ScheduleAbsenceImpactStatus =
  (typeof SCHEDULE_ABSENCE_IMPACT_STATUSES)[number];

export type ScheduleBlockFormValues = {
  centerId: string;
  classTypeId: string;
  serviceDate: string;
  startTime: string;
  endTime: string;
  requiredCoaches: number;
  status: ScheduleBlockStatus;
  notes: string | null;
};

export type ScheduleBlockValidationResult =
  | {
      ok: true;
      values: ScheduleBlockFormValues;
    }
  | {
      ok: false;
      error:
        | "date-out-of-week"
        | "invalid-class-type"
        | "invalid-center"
        | "invalid-date"
        | "invalid-required-coaches"
        | "invalid-status"
        | "invalid-time"
        | "missing-fields"
        | "notes-too-long";
    };

export type ScheduleAssignmentFormValues = {
  coachProfileId: string;
  scheduleBlockId: string;
};

export type ScheduleAssignmentValidationResult =
  | {
      ok: true;
      values: ScheduleAssignmentFormValues;
    }
  | {
      ok: false;
      error: "block-required" | "coach-required" | "invalid-block" | "invalid-coach";
    };

export type ScheduleAssignmentRemovalValidationResult =
  | {
      ok: true;
      assignmentId: string;
    }
  | {
      ok: false;
      error: "assignment-required" | "invalid-assignment";
    };

export type WeekResolution = {
  days: string[];
  invalidWeekParam: boolean;
  weekEnd: string;
  weekStart: string;
};

export type CoverageBlockInput = {
  end_time: string;
  id: string;
  required_coaches: number;
  service_date: string;
  start_time: string;
  status: string;
};

export type CoverageAssignmentInput = {
  assignment_status: string;
  coach_profile_id: string;
  id?: string | null;
  schedule_block_id: string;
};

export type CoverageAbsenceImpactInput = {
  impact_status: string;
  schedule_block_assignment_id: string;
  schedule_block_id: string;
  subject_coach_profile_id: string | null;
};

export type ScheduleAvailabilityAssignmentInput = CoverageAssignmentInput & {
  id?: string | null;
};

export type ScheduleCoachUnavailableAssignment = {
  assignmentId: string | null;
  coachProfileId: string;
  endTime: string;
  scheduleBlockId: string;
  serviceDate: string;
  startTime: string;
};

export type CoverageCoachInput = {
  id: string;
  person_profile_id: string | null;
  status: string;
  user_id: string | null;
};

export type CoveragePersonInput = {
  id: string;
  status: string;
  visibility_status: string;
};

export type CoverageMembershipInput = {
  status: string;
  user_id: string;
};

export type ScheduleBlockCoverage = {
  absenceImpact: ScheduleBlockAbsenceImpact;
  conflictCoachProfileIds: string[];
  pendingAssignmentCount: number;
  requiredCoaches: number;
  state: ScheduleCoverageState;
  validAssignmentCount: number;
  validCoachProfileIds: string[];
};

export type ScheduleBlockAbsenceImpact = {
  affectedAssignmentIds: string[];
  affectedCoachProfileIds: string[];
  coverageNeededCount: number;
  potentialCount: number;
};

type ScheduleBlockAbsenceImpactBucket = {
  coverageNeededAssignmentIds: Set<string>;
  coverageNeededBlockCoachKeys: Set<string>;
  coverageNeededCoachProfileIds: Set<string>;
  potentialAssignmentIds: Set<string>;
  potentialBlockCoachKeys: Set<string>;
  potentialCoachProfileIds: Set<string>;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
export function isScheduleUuid(value: string) {
  return isPostgresUuid(value);
}

export function isScheduleBlockStatus(
  value: string,
): value is ScheduleBlockStatus {
  return SCHEDULE_BLOCK_STATUSES.includes(value as ScheduleBlockStatus);
}

export function isScheduleAssignmentStatus(
  value: string,
): value is ScheduleAssignmentStatus {
  return SCHEDULE_ASSIGNMENT_STATUSES.includes(
    value as ScheduleAssignmentStatus,
  );
}

export function isScheduleFilterCoverageState(
  value: string,
): value is ScheduleFilterCoverageState {
  return SCHEDULE_FILTER_COVERAGE_STATES.includes(
    value as ScheduleFilterCoverageState,
  );
}

export function isScheduleRiskCoverageState(value: ScheduleCoverageState) {
  return SCHEDULE_RISK_COVERAGE_STATES.includes(
    value as (typeof SCHEDULE_RISK_COVERAGE_STATES)[number],
  );
}

export function hasScheduleAbsenceImpact(coverage: ScheduleBlockCoverage) {
  return (
    coverage.absenceImpact.coverageNeededCount > 0 ||
    coverage.absenceImpact.potentialCount > 0
  );
}

export function isScheduleCoverageRisk(coverage: ScheduleBlockCoverage) {
  return (
    isScheduleRiskCoverageState(coverage.state) ||
    hasScheduleAbsenceImpact(coverage)
  );
}

function createEmptyAbsenceImpact(): ScheduleBlockAbsenceImpact {
  return {
    affectedAssignmentIds: [],
    affectedCoachProfileIds: [],
    coverageNeededCount: 0,
    potentialCount: 0,
  };
}

function createAbsenceImpactBucket(): ScheduleBlockAbsenceImpactBucket {
  return {
    coverageNeededAssignmentIds: new Set<string>(),
    coverageNeededBlockCoachKeys: new Set<string>(),
    coverageNeededCoachProfileIds: new Set<string>(),
    potentialAssignmentIds: new Set<string>(),
    potentialBlockCoachKeys: new Set<string>(),
    potentialCoachProfileIds: new Set<string>(),
  };
}

function getBlockCoachKey({
  coachProfileId,
  scheduleBlockId,
}: {
  coachProfileId: string | null;
  scheduleBlockId: string;
}) {
  return coachProfileId ? `${scheduleBlockId}:${coachProfileId}` : null;
}

function isAbsenceImpactStatus(
  value: string,
): value is ScheduleAbsenceImpactStatus {
  return SCHEDULE_ABSENCE_IMPACT_STATUSES.includes(
    value as ScheduleAbsenceImpactStatus,
  );
}

function buildAbsenceImpactBuckets(
  absenceImpacts: CoverageAbsenceImpactInput[],
) {
  const impactsByBlock = new Map<string, ScheduleBlockAbsenceImpactBucket>();

  for (const impact of absenceImpacts) {
    if (!isAbsenceImpactStatus(impact.impact_status)) {
      continue;
    }

    const bucket =
      impactsByBlock.get(impact.schedule_block_id) ??
      createAbsenceImpactBucket();
    const blockCoachKey = getBlockCoachKey({
      coachProfileId: impact.subject_coach_profile_id,
      scheduleBlockId: impact.schedule_block_id,
    });
    const assignmentId = impact.schedule_block_assignment_id;
    const assignmentIds =
      impact.impact_status === "coverage_needed"
        ? bucket.coverageNeededAssignmentIds
        : bucket.potentialAssignmentIds;
    const blockCoachKeys =
      impact.impact_status === "coverage_needed"
        ? bucket.coverageNeededBlockCoachKeys
        : bucket.potentialBlockCoachKeys;
    const coachProfileIds =
      impact.impact_status === "coverage_needed"
        ? bucket.coverageNeededCoachProfileIds
        : bucket.potentialCoachProfileIds;

    if (assignmentId) {
      assignmentIds.add(assignmentId);
    }

    if (blockCoachKey) {
      blockCoachKeys.add(blockCoachKey);
    }

    if (impact.subject_coach_profile_id) {
      coachProfileIds.add(impact.subject_coach_profile_id);
    }

    impactsByBlock.set(impact.schedule_block_id, bucket);
  }

  return impactsByBlock;
}

function hasCoverageNeededAbsenceImpact({
  assignment,
  bucket,
}: {
  assignment: CoverageAssignmentInput;
  bucket: ScheduleBlockAbsenceImpactBucket | undefined;
}) {
  if (!bucket) {
    return false;
  }

  if (
    assignment.id &&
    bucket.coverageNeededAssignmentIds.has(assignment.id)
  ) {
    return true;
  }

  const blockCoachKey = getBlockCoachKey({
    coachProfileId: assignment.coach_profile_id,
    scheduleBlockId: assignment.schedule_block_id,
  });

  return Boolean(
    blockCoachKey && bucket.coverageNeededBlockCoachKeys.has(blockCoachKey),
  );
}

function getAbsenceImpactForBlock(
  bucket: ScheduleBlockAbsenceImpactBucket | undefined,
): ScheduleBlockAbsenceImpact {
  if (!bucket) {
    return createEmptyAbsenceImpact();
  }

  return {
    affectedAssignmentIds: [
      ...new Set([
        ...bucket.coverageNeededAssignmentIds,
        ...bucket.potentialAssignmentIds,
      ]),
    ],
    affectedCoachProfileIds: [
      ...new Set([
        ...bucket.coverageNeededCoachProfileIds,
        ...bucket.potentialCoachProfileIds,
      ]),
    ],
    coverageNeededCount: Math.max(
      bucket.coverageNeededAssignmentIds.size,
      bucket.coverageNeededCoachProfileIds.size,
    ),
    potentialCount: Math.max(
      bucket.potentialAssignmentIds.size,
      bucket.potentialCoachProfileIds.size,
    ),
  };
}

export function getScheduleBlockStatusLabel(status: string) {
  const labels: Record<ScheduleBlockStatus, string> = {
    cancelled: "Cancelado",
    changed: "Cambiado",
    completed: "Completado",
    scheduled: "Programado",
    uncovered: "Sin cubrir",
  };

  return isScheduleBlockStatus(status) ? labels[status] : status;
}

export function getScheduleAssignmentStatusLabel(status: string) {
  const labels: Record<ScheduleAssignmentStatus, string> = {
    assigned: "Asignado",
    declined: "Rechazado",
    pending: "Pendiente",
    removed: "Retirado",
  };

  return isScheduleAssignmentStatus(status) ? labels[status] : status;
}

export function getScheduleCoverageStateLabel(state: ScheduleCoverageState) {
  const labels: Record<ScheduleCoverageState, string> = {
    conflict: "Conflicto",
    covered: "Cubierto",
    inactive: "Sin riesgo activo",
    insufficient: "Insuficiente",
    not_required: "Sin requisito",
    uncovered: "Sin cubrir",
  };

  return labels[state];
}

export function isCoverageActiveBlock(status: string) {
  return status !== "cancelled" && status !== "completed";
}

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

function parseDateInput(value: string) {
  if (!DATE_PATTERN.test(value)) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

function toDateInput(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function addDays(dateString: string, days: number) {
  const date = parseDateInput(dateString);

  if (!date) {
    return null;
  }

  date.setUTCDate(date.getUTCDate() + days);

  return toDateInput(date);
}

function getWeekStartDateString(dateString: string) {
  const date = parseDateInput(dateString);

  if (!date) {
    return null;
  }

  const dayOfWeek = date.getUTCDay();
  const daysSinceMonday = (dayOfWeek + 6) % 7;
  date.setUTCDate(date.getUTCDate() - daysSinceMonday);

  return toDateInput(date);
}

export function getTodayDateString(timezone: string) {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      day: "2-digit",
      month: "2-digit",
      timeZone: timezone,
      year: "numeric",
    }).formatToParts(new Date());
    const byType = new Map(parts.map((part) => [part.type, part.value]));
    const year = byType.get("year");
    const month = byType.get("month");
    const day = byType.get("day");

    if (year && month && day) {
      return `${year}-${month}-${day}`;
    }
  } catch {
    return toDateInput(new Date());
  }

  return toDateInput(new Date());
}

export function resolveWeek(weekParam: string | undefined, timezone: string) {
  const hasInvalidWeekParam = Boolean(weekParam && !parseDateInput(weekParam));
  const referenceDate =
    weekParam && !hasInvalidWeekParam
      ? weekParam
      : getTodayDateString(timezone);
  const weekStart = getWeekStartDateString(referenceDate);

  if (!weekStart) {
    const fallbackStart = getWeekStartDateString(toDateInput(new Date()));

    if (!fallbackStart) {
      throw new Error("Could not resolve schedule week.");
    }

    return buildWeekResolution(fallbackStart, hasInvalidWeekParam);
  }

  return buildWeekResolution(weekStart, hasInvalidWeekParam);
}

function buildWeekResolution(
  weekStart: string,
  invalidWeekParam: boolean,
): WeekResolution {
  const weekEnd = addDays(weekStart, 6);

  if (!weekEnd) {
    throw new Error("Could not resolve schedule week end.");
  }

  return {
    days: Array.from({ length: 7 }, (_, index) => {
      const day = addDays(weekStart, index);

      if (!day) {
        throw new Error("Could not resolve schedule day.");
      }

      return day;
    }),
    invalidWeekParam,
    weekEnd,
    weekStart,
  };
}

export function getAdjacentWeekStart(weekStart: string, offsetWeeks: number) {
  const nextWeekStart = addDays(weekStart, offsetWeeks * 7);

  if (!nextWeekStart) {
    throw new Error("Could not resolve adjacent schedule week.");
  }

  return nextWeekStart;
}

export function isDateWithinWeek(dateString: string, weekStart: string) {
  const weekEnd = addDays(weekStart, 6);

  return Boolean(
    parseDateInput(dateString) &&
      weekEnd &&
      dateString >= weekStart &&
      dateString <= weekEnd,
  );
}

function normalizeTime(value: string) {
  const candidate = value.slice(0, 5);

  return TIME_PATTERN.test(candidate) ? candidate : null;
}

function timeToMinutes(value: string) {
  const [hours, minutes] = value.slice(0, 5).split(":").map(Number);

  return hours * 60 + minutes;
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

export function getUnavailableScheduleCoachAssignments({
  assignments,
  blocks,
  targetBlock,
}: {
  assignments: ScheduleAvailabilityAssignmentInput[];
  blocks: CoverageBlockInput[];
  targetBlock: CoverageBlockInput;
}) {
  if (!isCoverageActiveBlock(targetBlock.status)) {
    return [];
  }

  const blocksById = new Map(blocks.map((block) => [block.id, block]));

  return assignments.flatMap((assignment) => {
    if (
      assignment.assignment_status !== "assigned" ||
      assignment.schedule_block_id === targetBlock.id
    ) {
      return [];
    }

    const assignedBlock = blocksById.get(assignment.schedule_block_id);

    if (
      !assignedBlock ||
      !isCoverageActiveBlock(assignedBlock.status) ||
      assignedBlock.service_date !== targetBlock.service_date ||
      !timeRangesOverlap(
        assignedBlock.start_time,
        assignedBlock.end_time,
        targetBlock.start_time,
        targetBlock.end_time,
      )
    ) {
      return [];
    }

    return [
      {
        assignmentId: assignment.id ?? null,
        coachProfileId: assignment.coach_profile_id,
        endTime: assignedBlock.end_time,
        scheduleBlockId: assignedBlock.id,
        serviceDate: assignedBlock.service_date,
        startTime: assignedBlock.start_time,
      } satisfies ScheduleCoachUnavailableAssignment,
    ];
  });
}

function parseRequiredCoaches(value: string) {
  const requiredCoaches = Number(value);

  if (
    !Number.isInteger(requiredCoaches) ||
    requiredCoaches < 0 ||
    requiredCoaches > 20
  ) {
    return null;
  }

  return requiredCoaches;
}

export function formatTimeForInput(value: string) {
  return normalizeTime(value) ?? "";
}

export function validateScheduleBlockForm(
  formData: FormData,
  weekStart?: string,
): ScheduleBlockValidationResult {
  const centerId = getFormString(formData, "centerId");
  const classTypeId = getFormString(formData, "classTypeId");
  const serviceDate = getFormString(formData, "serviceDate");
  const startTime = normalizeTime(getFormString(formData, "startTime"));
  const endTime = normalizeTime(getFormString(formData, "endTime"));
  const rawRequiredCoaches =
    getFormString(formData, "requiredCoaches") || "1";
  const rawStatus = getFormString(formData, "status") || "scheduled";
  const rawNotes = getFormString(formData, "notes");
  const requiredCoaches = parseRequiredCoaches(rawRequiredCoaches);

  if (!centerId || !classTypeId || !serviceDate || !startTime || !endTime) {
    return {
      ok: false,
      error: "missing-fields",
    };
  }

  if (!isPostgresUuid(centerId)) {
    return {
      ok: false,
      error: "invalid-center",
    };
  }

  if (!isPostgresUuid(classTypeId)) {
    return {
      ok: false,
      error: "invalid-class-type",
    };
  }

  if (!parseDateInput(serviceDate)) {
    return {
      ok: false,
      error: "invalid-date",
    };
  }

  if (weekStart && !isDateWithinWeek(serviceDate, weekStart)) {
    return {
      ok: false,
      error: "date-out-of-week",
    };
  }

  if (timeToMinutes(startTime) >= timeToMinutes(endTime)) {
    return {
      ok: false,
      error: "invalid-time",
    };
  }

  if (requiredCoaches === null) {
    return {
      ok: false,
      error: "invalid-required-coaches",
    };
  }

  if (!isScheduleBlockStatus(rawStatus)) {
    return {
      ok: false,
      error: "invalid-status",
    };
  }

  if (rawNotes.length > 1000) {
    return {
      ok: false,
      error: "notes-too-long",
    };
  }

  return {
    ok: true,
    values: {
      centerId,
      classTypeId,
      endTime,
      notes: rawNotes || null,
      requiredCoaches,
      serviceDate,
      startTime,
      status: rawStatus,
    },
  };
}

export function validateScheduleAssignmentForm(
  formData: FormData,
): ScheduleAssignmentValidationResult {
  const scheduleBlockId = getFormString(formData, "scheduleBlockId");
  const coachProfileId = getFormString(formData, "coachProfileId");

  if (!scheduleBlockId) {
    return {
      ok: false,
      error: "block-required",
    };
  }

  if (!coachProfileId) {
    return {
      ok: false,
      error: "coach-required",
    };
  }

  if (!isPostgresUuid(scheduleBlockId)) {
    return {
      ok: false,
      error: "invalid-block",
    };
  }

  if (!isPostgresUuid(coachProfileId)) {
    return {
      ok: false,
      error: "invalid-coach",
    };
  }

  return {
    ok: true,
    values: {
      coachProfileId,
      scheduleBlockId,
    },
  };
}

export function validateScheduleAssignmentRemovalForm(
  formData: FormData,
): ScheduleAssignmentRemovalValidationResult {
  const assignmentId = getFormString(formData, "assignmentId");

  if (!assignmentId) {
    return {
      ok: false,
      error: "assignment-required",
    };
  }

  if (!isPostgresUuid(assignmentId)) {
    return {
      ok: false,
      error: "invalid-assignment",
    };
  }

  return {
    ok: true,
    assignmentId,
  };
}

function isValidCoverageCoach({
  coach,
  membershipsByUserId,
  personsById,
}: {
  coach: CoverageCoachInput | undefined;
  membershipsByUserId: Map<string, CoverageMembershipInput>;
  personsById: Map<string, CoveragePersonInput>;
}) {
  if (!coach || coach.status !== "active") {
    return false;
  }

  if (coach.person_profile_id) {
    const person = personsById.get(coach.person_profile_id);

    if (
      !person ||
      person.status !== "active" ||
      person.visibility_status !== "visible"
    ) {
      return false;
    }
  }

  if (coach.user_id) {
    const membership = membershipsByUserId.get(coach.user_id);

    if (!membership || membership.status !== "active") {
      return false;
    }
  }

  return Boolean(coach.user_id || coach.person_profile_id);
}

export function calculateScheduleCoverageByBlock({
  assignments,
  absenceImpacts = [],
  blocks,
  coaches,
  memberships,
  persons,
}: {
  assignments: CoverageAssignmentInput[];
  absenceImpacts?: CoverageAbsenceImpactInput[];
  blocks: CoverageBlockInput[];
  coaches: CoverageCoachInput[];
  memberships: CoverageMembershipInput[];
  persons: CoveragePersonInput[];
}) {
  const blocksById = new Map(blocks.map((block) => [block.id, block]));
  const absenceImpactsByBlock = buildAbsenceImpactBuckets(absenceImpacts);
  const coachesById = new Map(coaches.map((coach) => [coach.id, coach]));
  const personsById = new Map(persons.map((person) => [person.id, person]));
  const membershipsByUserId = new Map(
    memberships.map((membership) => [membership.user_id, membership]),
  );
  const validAssignmentsByBlock = new Map<string, CoverageAssignmentInput[]>();
  const pendingAssignmentCountByBlock = new Map<string, number>();

  for (const assignment of assignments) {
    if (assignment.assignment_status === "pending") {
      const block = blocksById.get(assignment.schedule_block_id);

      if (
        block &&
        isCoverageActiveBlock(block.status) &&
        block.required_coaches > 0
      ) {
        pendingAssignmentCountByBlock.set(
          assignment.schedule_block_id,
          (pendingAssignmentCountByBlock.get(assignment.schedule_block_id) ?? 0) + 1,
        );
      }
    }

    if (assignment.assignment_status !== "assigned") {
      continue;
    }

    const block = blocksById.get(assignment.schedule_block_id);
    const absenceImpactBucket = absenceImpactsByBlock.get(
      assignment.schedule_block_id,
    );

    if (!block || !isCoverageActiveBlock(block.status)) {
      continue;
    }

    if (block.required_coaches <= 0) {
      continue;
    }

    if (
      hasCoverageNeededAbsenceImpact({
        assignment,
        bucket: absenceImpactBucket,
      })
    ) {
      continue;
    }

    const coach = coachesById.get(assignment.coach_profile_id);

    if (
      !isValidCoverageCoach({
        coach,
        membershipsByUserId,
        personsById,
      })
    ) {
      continue;
    }

    const blockAssignments =
      validAssignmentsByBlock.get(assignment.schedule_block_id) ?? [];
    blockAssignments.push(assignment);
    validAssignmentsByBlock.set(assignment.schedule_block_id, blockAssignments);
  }

  const conflictCoachProfileIdsByBlock = new Map<string, Set<string>>();
  const validAssignmentsByCoach = new Map<string, CoverageAssignmentInput[]>();

  for (const blockAssignments of validAssignmentsByBlock.values()) {
    for (const assignment of blockAssignments) {
      const coachAssignments =
        validAssignmentsByCoach.get(assignment.coach_profile_id) ?? [];
      coachAssignments.push(assignment);
      validAssignmentsByCoach.set(
        assignment.coach_profile_id,
        coachAssignments,
      );
    }
  }

  for (const [coachProfileId, coachAssignments] of validAssignmentsByCoach) {
    for (let index = 0; index < coachAssignments.length; index += 1) {
      const firstAssignment = coachAssignments[index];
      const firstBlock = blocksById.get(firstAssignment.schedule_block_id);

      if (!firstBlock) {
        continue;
      }

      for (
        let compareIndex = index + 1;
        compareIndex < coachAssignments.length;
        compareIndex += 1
      ) {
        const secondAssignment = coachAssignments[compareIndex];
        const secondBlock = blocksById.get(secondAssignment.schedule_block_id);

        if (
          !secondBlock ||
          firstBlock.service_date !== secondBlock.service_date ||
          !timeRangesOverlap(
            firstBlock.start_time,
            firstBlock.end_time,
            secondBlock.start_time,
            secondBlock.end_time,
          )
        ) {
          continue;
        }

        for (const blockId of [firstBlock.id, secondBlock.id]) {
          const conflictCoachProfileIds =
            conflictCoachProfileIdsByBlock.get(blockId) ?? new Set<string>();
          conflictCoachProfileIds.add(coachProfileId);
          conflictCoachProfileIdsByBlock.set(blockId, conflictCoachProfileIds);
        }
      }
    }
  }

  return new Map(
    blocks.map((block) => {
      const validAssignments = validAssignmentsByBlock.get(block.id) ?? [];
      const absenceImpact =
        block.required_coaches > 0
          ? getAbsenceImpactForBlock(absenceImpactsByBlock.get(block.id))
          : createEmptyAbsenceImpact();
      const conflictCoachProfileIds = [
        ...(conflictCoachProfileIdsByBlock.get(block.id) ?? new Set<string>()),
      ];
      const validAssignmentCount = validAssignments.length;
      let state: ScheduleCoverageState = "covered";

      if (!isCoverageActiveBlock(block.status)) {
        state = "inactive";
      } else if (block.required_coaches <= 0) {
        state = "not_required";
      } else if (conflictCoachProfileIds.length > 0) {
        state = "conflict";
      } else if (validAssignmentCount === 0) {
        state = "uncovered";
      } else if (validAssignmentCount < block.required_coaches) {
        state = "insufficient";
      }

      return [
        block.id,
        {
          absenceImpact,
          conflictCoachProfileIds,
          pendingAssignmentCount:
            pendingAssignmentCountByBlock.get(block.id) ?? 0,
          requiredCoaches: block.required_coaches,
          state,
          validAssignmentCount,
          validCoachProfileIds: validAssignments.map(
            (assignment) => assignment.coach_profile_id,
          ),
        } satisfies ScheduleBlockCoverage,
      ];
    }),
  );
}
