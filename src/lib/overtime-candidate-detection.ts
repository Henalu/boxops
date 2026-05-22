import { canReviewOvertimeCandidates } from "@/lib/auth/permissions";
import {
  getActiveMemberships,
  getAuthenticatedUser,
  resolveActiveOrganization,
  type ActiveOrganization,
} from "@/lib/auth/tenant";
import {
  addOvertimeCandidateSource,
  createOvertimeCandidateSignal,
  listOvertimeCandidateSources,
  listOvertimeCandidates,
  setOvertimeCandidateStatus,
  type OvertimeCandidateRow,
  type OvertimeCandidateSourceType,
} from "@/lib/overtime-candidates";
import { createClient } from "@/lib/supabase/server";
import { isPostgresUuid } from "@/lib/uuid";
import type { Tables } from "@/types/supabase";

export type OvertimeCandidateDetectionErrorCode =
  | "authentication-required"
  | "date-range-invalid"
  | "forbidden"
  | "invalid-organization"
  | "invalid-period"
  | "load-failed"
  | "no-active-memberships"
  | "organization-not-found"
  | "organization-required"
  | "save-failed";

export type OvertimeCandidateDetectionSummary = {
  checkedPeople: number;
  created: number;
  existing: number;
  ignoredInsufficientData: number;
};

export type OvertimeCandidateDetectionResult =
  | {
      data: OvertimeCandidateDetectionSummary;
      ok: true;
    }
  | {
      error: OvertimeCandidateDetectionErrorCode;
      ok: false;
    };

export type DetectOperationalOvertimeCandidatesInput = {
  organizationId: string;
  periodEndDate: string;
  periodStartDate: string;
};

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
type DetectionContext = {
  organization: ActiveOrganization;
  supabase: SupabaseServerClient;
};
type SourceReference = {
  sourceId: string;
  sourceType: OvertimeCandidateSourceType;
};
type PlannedMinutesByDay = {
  fromAssignments: number;
  fromRecords: number;
  fromWorkWindows: number;
};
type PersonDetectionContext = {
  hasIncompleteData: boolean;
  hasOpenPunch: boolean;
  hasPendingCorrection: boolean;
  hasReopenedWeek: boolean;
  personProfileId: string;
  plannedByDate: Map<string, PlannedMinutesByDay>;
  plannedMinutes: number;
  sourceRefs: SourceReference[];
  workedMinutes: number;
};
type CoachProfileRow = Pick<
  Tables<"coach_profiles">,
  "id" | "person_profile_id" | "status" | "user_id"
>;
type ScheduleBlockRow = Pick<
  Tables<"schedule_blocks">,
  "end_time" | "id" | "service_date" | "start_time" | "status"
>;
type ScheduleAssignmentRow = Pick<
  Tables<"schedule_block_assignments">,
  "assignment_status" | "coach_profile_id" | "id" | "schedule_block_id"
>;
type StaffWorkWindowRow = Pick<
  Tables<"staff_work_windows">,
  | "day_of_week"
  | "end_time"
  | "id"
  | "person_profile_id"
  | "start_time"
  | "status"
  | "valid_from"
  | "valid_until"
>;
type TimeRecordRow = Pick<
  Tables<"time_records">,
  | "id"
  | "local_work_date"
  | "person_profile_id"
  | "planned_end_at"
  | "planned_start_at"
  | "status"
>;
type TimePunchRow = Pick<
  Tables<"time_punches">,
  "id" | "occurred_at" | "person_profile_id" | "punch_type" | "status"
>;
type TimeCorrectionRow = Pick<
  Tables<"time_record_corrections">,
  "id" | "person_profile_id" | "status" | "time_record_id"
>;
type TimeWeeklyApprovalRow = Pick<
  Tables<"time_weekly_approvals">,
  "id" | "person_profile_id" | "status" | "week_start_date"
>;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DETECTION_DAYS = 31;

function success(
  data: OvertimeCandidateDetectionSummary,
): OvertimeCandidateDetectionResult {
  return {
    data,
    ok: true,
  };
}

function failure(
  error: OvertimeCandidateDetectionErrorCode,
): OvertimeCandidateDetectionResult {
  return {
    error,
    ok: false,
  };
}

function parseDateInput(value: unknown) {
  if (typeof value !== "string" || !DATE_PATTERN.test(value.trim())) {
    return null;
  }

  const [year, month, day] = value.trim().split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return value.trim();
}

function getDateRangeDays(startDate: string, endDate: string) {
  const start = Date.parse(`${startDate}T00:00:00.000Z`);
  const end = Date.parse(`${endDate}T00:00:00.000Z`);

  if (Number.isNaN(start) || Number.isNaN(end) || end < start) {
    return [];
  }

  const dayCount = Math.floor((end - start) / 86_400_000) + 1;

  return Array.from({ length: dayCount }, (_, index) => {
    const date = new Date(start + index * 86_400_000);

    return [
      date.getUTCFullYear(),
      String(date.getUTCMonth() + 1).padStart(2, "0"),
      String(date.getUTCDate()).padStart(2, "0"),
    ].join("-");
  });
}

function getIsoDayOfWeek(dateString: string) {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return ((date.getUTCDay() + 6) % 7) + 1;
}

function timeStringToMinutes(value: string) {
  const [hoursValue, minutesValue] = value.slice(0, 5).split(":");
  const hours = Number(hoursValue);
  const minutes = Number(minutesValue);

  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

  return hours * 60 + minutes;
}

function getClockTimeDurationMinutes({
  endTime,
  startTime,
}: {
  endTime: string;
  startTime: string;
}) {
  const start = timeStringToMinutes(startTime);
  const end = timeStringToMinutes(endTime);

  if (start === null || end === null || end <= start) {
    return null;
  }

  return end - start;
}

function getTimestampDurationMinutes({
  endAt,
  startAt,
}: {
  endAt: string | null;
  startAt: string | null;
}) {
  if (!startAt && !endAt) {
    return {
      complete: true,
      minutes: 0,
    };
  }

  if (!startAt || !endAt) {
    return {
      complete: false,
      minutes: 0,
    };
  }

  const start = new Date(startAt);
  const end = new Date(endAt);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return {
      complete: false,
      minutes: 0,
    };
  }

  const minutes = Math.round((end.getTime() - start.getTime()) / 60_000);

  return {
    complete: minutes > 0,
    minutes: Math.max(0, minutes),
  };
}

function getWorkedMinutesFromPunches(punches: TimePunchRow[]) {
  const activePunches = punches
    .filter((punch) => punch.status === "active")
    .sort((first, second) => first.occurred_at.localeCompare(second.occurred_at));
  let hasIncompleteData = false;
  let openStartedAt: Date | null = null;
  let workedMinutes = 0;

  for (const punch of activePunches) {
    const occurredAt = new Date(punch.occurred_at);

    if (Number.isNaN(occurredAt.getTime())) {
      hasIncompleteData = true;
      continue;
    }

    if (punch.punch_type === "clock_in") {
      if (openStartedAt) {
        hasIncompleteData = true;
      }

      openStartedAt = occurredAt;
      continue;
    }

    if (!openStartedAt) {
      hasIncompleteData = true;
      continue;
    }

    workedMinutes += Math.max(
      0,
      Math.round((occurredAt.getTime() - openStartedAt.getTime()) / 60_000),
    );
    openStartedAt = null;
  }

  return {
    hasIncompleteData,
    hasOpenPunch: Boolean(openStartedAt),
    workedMinutes,
  };
}

function sourceKey(source: SourceReference) {
  return `${source.sourceType}:${source.sourceId}`;
}

function addSourceReference(
  personContext: PersonDetectionContext,
  source: SourceReference,
) {
  if (
    !personContext.sourceRefs.some(
      (existing) =>
        existing.sourceId === source.sourceId &&
        existing.sourceType === source.sourceType,
    )
  ) {
    personContext.sourceRefs.push(source);
  }
}

function ensurePersonContext(
  people: Map<string, PersonDetectionContext>,
  personProfileId: string,
) {
  const existing = people.get(personProfileId);

  if (existing) {
    return existing;
  }

  const created: PersonDetectionContext = {
    hasIncompleteData: false,
    hasOpenPunch: false,
    hasPendingCorrection: false,
    hasReopenedWeek: false,
    personProfileId,
    plannedByDate: new Map<string, PlannedMinutesByDay>(),
    plannedMinutes: 0,
    sourceRefs: [],
    workedMinutes: 0,
  };

  people.set(personProfileId, created);

  return created;
}

function addPlannedMinutesForDate({
  date,
  kind,
  minutes,
  personContext,
}: {
  date: string;
  kind: keyof PlannedMinutesByDay;
  minutes: number;
  personContext: PersonDetectionContext;
}) {
  const current = personContext.plannedByDate.get(date) ?? {
    fromAssignments: 0,
    fromRecords: 0,
    fromWorkWindows: 0,
  };

  current[kind] += minutes;
  personContext.plannedByDate.set(date, current);
}

function finalizePlannedMinutes(personContext: PersonDetectionContext) {
  personContext.plannedMinutes = Array.from(
    personContext.plannedByDate.values(),
  ).reduce(
    (total, day) =>
      total +
      Math.max(day.fromAssignments, day.fromRecords, day.fromWorkWindows),
    0,
  );
}

function sameCandidatePeriod(
  candidate: OvertimeCandidateRow,
  personContext: PersonDetectionContext,
  input: { periodEndDate: string; periodStartDate: string },
) {
  return (
    candidate.person_profile_id === personContext.personProfileId &&
    candidate.period_start_date === input.periodStartDate &&
    candidate.period_end_date === input.periodEndDate &&
    candidate.detection_source === "time_difference"
  );
}

function shouldMoveToNeedsReview(personContext: PersonDetectionContext) {
  return (
    personContext.hasIncompleteData ||
    personContext.hasOpenPunch ||
    personContext.hasPendingCorrection ||
    personContext.hasReopenedWeek
  );
}

async function resolveDetectionContext(
  organizationId: unknown,
): Promise<
  | {
      data: DetectionContext;
      ok: true;
    }
  | {
      error: OvertimeCandidateDetectionErrorCode;
      ok: false;
    }
> {
  if (typeof organizationId !== "string" || !isPostgresUuid(organizationId)) {
    return {
      error: "invalid-organization",
      ok: false,
    };
  }

  const user = await getAuthenticatedUser();

  if (!user) {
    return {
      error: "authentication-required",
      ok: false,
    };
  }

  const memberships = await getActiveMemberships(user.id);
  const resolution = resolveActiveOrganization(memberships, organizationId);

  if (!resolution.ok) {
    const error =
      resolution.reason === "no_active_memberships"
        ? "no-active-memberships"
        : resolution.reason === "organization_not_found"
          ? "organization-not-found"
          : "organization-required";

    return {
      error,
      ok: false,
    };
  }

  if (!canReviewOvertimeCandidates(resolution.membership.role)) {
    return {
      error: "forbidden",
      ok: false,
    };
  }

  const supabase = await createClient();

  return {
    data: {
      organization: resolution.organization,
      supabase,
    },
    ok: true,
  };
}

async function findExistingCandidate({
  context,
  existingCandidates,
  input,
  personContext,
}: {
  context: DetectionContext;
  existingCandidates: OvertimeCandidateRow[];
  input: { periodEndDate: string; periodStartDate: string };
  personContext: PersonDetectionContext;
}) {
  const candidates = existingCandidates.filter((candidate) =>
    sameCandidatePeriod(candidate, personContext, input),
  );

  for (const candidate of candidates) {
    if (
      candidate.planned_minutes_snapshot === personContext.plannedMinutes &&
      candidate.worked_minutes_snapshot === personContext.workedMinutes
    ) {
      return candidate;
    }

    const sources = await listOvertimeCandidateSources({
      candidateId: candidate.id,
      organizationId: context.organization.id,
    });

    if (!sources.ok) {
      continue;
    }

    const existingSourceKeys = new Set(
      sources.data.map((source) =>
        sourceKey({
          sourceId: source.source_id ?? "",
          sourceType: source.source_type,
        }),
      ),
    );

    if (
      personContext.sourceRefs.some((source) =>
        existingSourceKeys.has(sourceKey(source)),
      )
    ) {
      return candidate;
    }
  }

  return null;
}

async function addMissingSources({
  candidate,
  organizationId,
  sourceRefs,
}: {
  candidate: OvertimeCandidateRow;
  organizationId: string;
  sourceRefs: SourceReference[];
}) {
  if (candidate.status === "closed" || candidate.status === "superseded") {
    return true;
  }

  const sources = await listOvertimeCandidateSources({
    candidateId: candidate.id,
    organizationId,
  });

  const existingSourceKeys = sources.ok
    ? new Set(
        sources.data.map((source) =>
          sourceKey({
            sourceId: source.source_id ?? "",
            sourceType: source.source_type,
          }),
        ),
      )
    : new Set<string>();

  for (const source of sourceRefs) {
    if (existingSourceKeys.has(sourceKey(source))) {
      continue;
    }

    const result = await addOvertimeCandidateSource({
      candidateId: candidate.id,
      organizationId,
      sourceId: source.sourceId,
      sourceType: source.sourceType,
    });

    if (!result.ok && result.error !== "save-failed") {
      return false;
    }
  }

  return true;
}

async function moveCandidateToNeedsReview({
  candidate,
  organizationId,
}: {
  candidate: OvertimeCandidateRow;
  organizationId: string;
}) {
  if (
    candidate.status !== "detected" &&
    candidate.status !== "needs_review"
  ) {
    return true;
  }

  if (candidate.status === "needs_review") {
    return true;
  }

  const result = await setOvertimeCandidateStatus({
    candidateId: candidate.id,
    organizationId,
    status: "needs_review",
  });

  return result.ok;
}

export async function detectOperationalOvertimeCandidates(
  input: DetectOperationalOvertimeCandidatesInput,
): Promise<OvertimeCandidateDetectionResult> {
  const organizationId = input.organizationId;
  const periodStartDate = parseDateInput(input.periodStartDate);
  const periodEndDate = parseDateInput(input.periodEndDate);

  if (!organizationId || !isPostgresUuid(organizationId)) {
    return failure("invalid-organization");
  }

  if (!periodStartDate || !periodEndDate || periodEndDate < periodStartDate) {
    return failure("invalid-period");
  }

  const periodDays = getDateRangeDays(periodStartDate, periodEndDate);

  if (periodDays.length < 1 || periodDays.length > MAX_DETECTION_DAYS) {
    return failure("date-range-invalid");
  }

  const context = await resolveDetectionContext(organizationId);

  if (!context.ok) {
    return failure(context.error);
  }

  const [
    recordsResult,
    coachProfilesResult,
    blocksResult,
    weeklyApprovalsResult,
    staffWorkWindowsResult,
    existingCandidatesResult,
  ] = await Promise.all([
    context.data.supabase
      .from("time_records")
      .select(
        "id, person_profile_id, local_work_date, planned_start_at, planned_end_at, status",
      )
      .eq("organization_id", context.data.organization.id)
      .gte("local_work_date", periodStartDate)
      .lte("local_work_date", periodEndDate)
      .neq("status", "voided"),
    context.data.supabase
      .from("coach_profiles")
      .select("id, person_profile_id, user_id, status")
      .eq("organization_id", context.data.organization.id)
      .eq("status", "active"),
    context.data.supabase
      .from("schedule_blocks")
      .select("id, service_date, start_time, end_time, status")
      .eq("organization_id", context.data.organization.id)
      .gte("service_date", periodStartDate)
      .lte("service_date", periodEndDate)
      .in("status", ["scheduled", "uncovered", "changed"]),
    context.data.supabase
      .from("time_weekly_approvals")
      .select("id, person_profile_id, week_start_date, status")
      .eq("organization_id", context.data.organization.id)
      .gte("week_start_date", periodStartDate)
      .lte("week_start_date", periodEndDate),
    context.data.supabase
      .from("staff_work_windows")
      .select(
        "id, person_profile_id, day_of_week, start_time, end_time, valid_from, valid_until, status",
      )
      .eq("organization_id", context.data.organization.id)
      .eq("status", "active")
      .lte("valid_from", periodEndDate)
      .or(`valid_until.is.null,valid_until.gte.${periodStartDate}`),
    listOvertimeCandidates({
      limit: 200,
      organizationId: context.data.organization.id,
      periodEndDate,
      periodStartDate,
    }),
  ]);

  if (
    recordsResult.error ||
    coachProfilesResult.error ||
    blocksResult.error ||
    weeklyApprovalsResult.error ||
    staffWorkWindowsResult.error ||
    !existingCandidatesResult.ok
  ) {
    return failure("load-failed");
  }

  const records = (recordsResult.data ?? []) as TimeRecordRow[];
  const coachProfiles = (coachProfilesResult.data ?? []) as CoachProfileRow[];
  const blocks = (blocksResult.data ?? []) as ScheduleBlockRow[];
  const weeklyApprovals =
    (weeklyApprovalsResult.data ?? []) as TimeWeeklyApprovalRow[];
  const staffWorkWindows =
    (staffWorkWindowsResult.data ?? []) as StaffWorkWindowRow[];
  const people = new Map<string, PersonDetectionContext>();

  for (const record of records) {
    const personContext = ensurePersonContext(people, record.person_profile_id);
    const planned = getTimestampDurationMinutes({
      endAt: record.planned_end_at,
      startAt: record.planned_start_at,
    });

    if (!planned.complete) {
      personContext.hasIncompleteData = true;
    }

    if (planned.minutes > 0) {
      addPlannedMinutesForDate({
        date: record.local_work_date,
        kind: "fromRecords",
        minutes: planned.minutes,
        personContext,
      });
    }

    if (record.status === "reopened") {
      personContext.hasReopenedWeek = true;
    }

    addSourceReference(personContext, {
      sourceId: record.id,
      sourceType: "time_record",
    });
  }

  const recordIds = records.map((record) => record.id);
  const [punchesResult, correctionsResult] = await Promise.all([
    recordIds.length > 0
      ? context.data.supabase
          .from("time_punches")
          .select("id, person_profile_id, occurred_at, punch_type, status")
          .eq("organization_id", context.data.organization.id)
          .in("time_record_id", recordIds)
          .eq("status", "active")
      : Promise.resolve({ data: [], error: null }),
    recordIds.length > 0
      ? context.data.supabase
          .from("time_record_corrections")
          .select("id, person_profile_id, time_record_id, status")
          .eq("organization_id", context.data.organization.id)
          .in("time_record_id", recordIds)
          .in("status", ["pending", "approved"])
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (punchesResult.error || correctionsResult.error) {
    return failure("load-failed");
  }

  const punches = (punchesResult.data ?? []) as TimePunchRow[];
  const punchesByPerson = new Map<string, TimePunchRow[]>();

  for (const punch of punches) {
    const personPunches = punchesByPerson.get(punch.person_profile_id) ?? [];
    personPunches.push(punch);
    punchesByPerson.set(punch.person_profile_id, personPunches);
    addSourceReference(ensurePersonContext(people, punch.person_profile_id), {
      sourceId: punch.id,
      sourceType: "time_punch",
    });
  }

  for (const [personProfileId, personPunches] of punchesByPerson) {
    const personContext = ensurePersonContext(people, personProfileId);
    const worked = getWorkedMinutesFromPunches(personPunches);

    personContext.workedMinutes = worked.workedMinutes;
    personContext.hasOpenPunch =
      personContext.hasOpenPunch || worked.hasOpenPunch;
    personContext.hasIncompleteData =
      personContext.hasIncompleteData || worked.hasIncompleteData;
  }

  for (const correction of (correctionsResult.data ?? []) as TimeCorrectionRow[]) {
    const personContext = ensurePersonContext(
      people,
      correction.person_profile_id,
    );

    personContext.hasPendingCorrection = true;
  }

  for (const approval of weeklyApprovals) {
    const personContext = ensurePersonContext(
      people,
      approval.person_profile_id,
    );

    if (approval.status === "reopened") {
      personContext.hasReopenedWeek = true;
    }

    addSourceReference(personContext, {
      sourceId: approval.id,
      sourceType: "time_weekly_approval",
    });
  }

  const coachPersonByCoachId = new Map(
    coachProfiles
      .filter((profile) => profile.person_profile_id)
      .map((profile) => [profile.id, profile.person_profile_id as string]),
  );
  const blocksById = new Map(blocks.map((block) => [block.id, block]));
  const blockIds = blocks.map((block) => block.id);
  const coachProfileIds = Array.from(coachPersonByCoachId.keys());
  const assignmentsResult =
    blockIds.length > 0 && coachProfileIds.length > 0
      ? await context.data.supabase
          .from("schedule_block_assignments")
          .select("id, schedule_block_id, coach_profile_id, assignment_status")
          .eq("organization_id", context.data.organization.id)
          .eq("assignment_status", "assigned")
          .in("schedule_block_id", blockIds)
          .in("coach_profile_id", coachProfileIds)
      : { data: [], error: null };

  if (assignmentsResult.error) {
    return failure("load-failed");
  }

  for (const assignment of (assignmentsResult.data ?? []) as ScheduleAssignmentRow[]) {
    const personProfileId = coachPersonByCoachId.get(assignment.coach_profile_id);
    const block = blocksById.get(assignment.schedule_block_id);

    if (!personProfileId || !block) {
      continue;
    }

    const minutes = getClockTimeDurationMinutes({
      endTime: block.end_time,
      startTime: block.start_time,
    });
    const personContext = ensurePersonContext(people, personProfileId);

    if (minutes === null) {
      personContext.hasIncompleteData = true;
    } else {
      addPlannedMinutesForDate({
        date: block.service_date,
        kind: "fromAssignments",
        minutes,
        personContext,
      });
    }

    addSourceReference(personContext, {
      sourceId: assignment.id,
      sourceType: "schedule_block_assignment",
    });
  }

  for (const workWindow of staffWorkWindows) {
    const minutes = getClockTimeDurationMinutes({
      endTime: workWindow.end_time,
      startTime: workWindow.start_time,
    });
    const personContext = ensurePersonContext(
      people,
      workWindow.person_profile_id,
    );

    if (minutes === null) {
      personContext.hasIncompleteData = true;
      continue;
    }

    for (const date of periodDays) {
      if (
        date < workWindow.valid_from ||
        (workWindow.valid_until && date > workWindow.valid_until) ||
        getIsoDayOfWeek(date) !== workWindow.day_of_week
      ) {
        continue;
      }

      addPlannedMinutesForDate({
        date,
        kind: "fromWorkWindows",
        minutes,
        personContext,
      });
      addSourceReference(personContext, {
        sourceId: workWindow.id,
        sourceType: "staff_work_window",
      });
    }
  }

  const summary: OvertimeCandidateDetectionSummary = {
    checkedPeople: people.size,
    created: 0,
    existing: 0,
    ignoredInsufficientData: 0,
  };

  for (const personContext of people.values()) {
    finalizePlannedMinutes(personContext);

    if (personContext.workedMinutes <= personContext.plannedMinutes) {
      if (
        personContext.hasIncompleteData ||
        personContext.hasOpenPunch ||
        (personContext.workedMinutes > 0 && personContext.plannedMinutes <= 0)
      ) {
        summary.ignoredInsufficientData += 1;
      }

      continue;
    }

    if (personContext.plannedMinutes <= 0 || personContext.sourceRefs.length === 0) {
      summary.ignoredInsufficientData += 1;
      continue;
    }

    const existingCandidate = await findExistingCandidate({
      context: context.data,
      existingCandidates: existingCandidatesResult.data,
      input: { periodEndDate, periodStartDate },
      personContext,
    });

    if (existingCandidate) {
      summary.existing += 1;

      if (
        shouldMoveToNeedsReview(personContext) &&
        !(await moveCandidateToNeedsReview({
          candidate: existingCandidate,
          organizationId: context.data.organization.id,
        }))
      ) {
        return failure("save-failed");
      }

      const existingSourcesAdded = await addMissingSources({
        candidate: existingCandidate,
        organizationId: context.data.organization.id,
        sourceRefs: personContext.sourceRefs,
      });

      if (!existingSourcesAdded) {
        return failure("save-failed");
      }

      continue;
    }

    const created = await createOvertimeCandidateSignal({
      detectionSource: "time_difference",
      organizationId: context.data.organization.id,
      periodEndDate,
      periodStartDate,
      personProfileId: personContext.personProfileId,
      plannedMinutes: personContext.plannedMinutes,
      timezone: context.data.organization.timezone,
      workedMinutes: personContext.workedMinutes,
    });

    if (!created.ok) {
      return failure("save-failed");
    }

    const sourcesAdded = await addMissingSources({
      candidate: created.data,
      organizationId: context.data.organization.id,
      sourceRefs: personContext.sourceRefs,
    });

    if (!sourcesAdded) {
      return failure("save-failed");
    }

    if (
      shouldMoveToNeedsReview(personContext) &&
      !(await moveCandidateToNeedsReview({
        candidate: created.data,
        organizationId: context.data.organization.id,
      }))
    ) {
      return failure("save-failed");
    }

    summary.created += 1;
  }

  return success(summary);
}
