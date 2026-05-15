import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/supabase";

const NEXT_ASSIGNED_BLOCK_WINDOW_DAYS = 120;
const ASSIGNMENT_BLOCK_ID_BATCH_SIZE = 100;

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type OwnPersonProfileRow = Pick<
  Tables<"person_profiles">,
  "display_name" | "id" | "status" | "user_id" | "visibility_status"
>;

type OwnCoachProfileRow = Pick<
  Tables<"coach_profiles">,
  "id" | "person_profile_id" | "status" | "updated_at" | "user_id"
>;

type FutureScheduleBlockRow = Pick<
  Tables<"schedule_blocks">,
  | "center_id"
  | "class_type_id"
  | "end_time"
  | "id"
  | "service_date"
  | "start_time"
  | "status"
>;

type FutureScheduleBlockAssignmentRow = Pick<
  Tables<"schedule_block_assignments">,
  "assignment_status" | "coach_profile_id" | "id" | "schedule_block_id"
>;

type NextAssignedCenterRow = Pick<
  Tables<"centers">,
  "id" | "name" | "status" | "timezone"
>;

type NextAssignedClassTypeRow = Pick<
  Tables<"class_types">,
  "category" | "color" | "id" | "name" | "status"
>;

export type OwnNextAssignedScheduleBlock = {
  assignmentId: string;
  center: NextAssignedCenterRow | null;
  classType: NextAssignedClassTypeRow | null;
  endAt: string;
  endTime: string;
  isOngoing: boolean;
  minutesUntilEnd: number;
  minutesUntilStart: number;
  scheduleBlockId: string;
  serviceDate: string;
  startAt: string;
  startTime: string;
  status: string;
  timeZone: string;
};

export type OwnNextAssignedScheduleState =
  | {
      generatedAt: string;
      nextBlock: OwnNextAssignedScheduleBlock | null;
      ownCoachDisplayName: string;
      ownCoachProfileId: string;
      ownPersonProfileId: string;
      searchWindowEnd: string;
      status: "matched";
    }
  | {
      generatedAt: string;
      status:
        | "ambiguous_coach_profile"
        | "load_failed"
        | "missing_coach_profile"
        | "missing_person"
        | "profile_unlinked";
      profileCount?: number;
    };

export type OwnNextAssignedScheduleQuery = {
  now?: Date | string;
  organizationId: string;
  organizationTimezone: string;
  userId: string;
};

type AssignedFutureBlockCandidate = {
  assignment: FutureScheduleBlockAssignmentRow;
  block: FutureScheduleBlockRow;
};

function failure(
  status: Exclude<OwnNextAssignedScheduleState["status"], "matched">,
  generatedAt: string,
  profileCount?: number,
): OwnNextAssignedScheduleState {
  return {
    generatedAt,
    profileCount,
    status,
  };
}

function getSafeTimeZone(timeZone: string | null | undefined) {
  if (!timeZone) {
    return "UTC";
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return timeZone;
  } catch {
    return "UTC";
  }
}

function getDatePartsInTimeZone(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone,
    year: "numeric",
  });
  const parts = formatter.formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, part.value]));

  return {
    day: Number(values.get("day")),
    hour: Number(values.get("hour")),
    minute: Number(values.get("minute")),
    month: Number(values.get("month")),
    second: Number(values.get("second")),
    year: Number(values.get("year")),
  };
}

function toDateString({
  day,
  month,
  year,
}: {
  day: number;
  month: number;
  year: number;
}) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function getDateStringInTimeZone(date: Date, timeZone: string) {
  return toDateString(getDatePartsInTimeZone(date, timeZone));
}

function addDaysToDateString(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));

  return toDateString({
    day: date.getUTCDate(),
    month: date.getUTCMonth() + 1,
    year: date.getUTCFullYear(),
  });
}

function getTimeZoneOffsetMs(timeZone: string, date: Date) {
  const parts = getDatePartsInTimeZone(date, timeZone);
  const zonedAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );

  return zonedAsUtc - date.getTime();
}

function getWallTimeInstant({
  date,
  time,
  timeZone,
}: {
  date: string;
  time: string;
  timeZone: string;
}) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);

  if (
    !year ||
    !month ||
    !day ||
    hour === undefined ||
    minute === undefined ||
    Number.isNaN(hour) ||
    Number.isNaN(minute)
  ) {
    return null;
  }

  const utcWallTime = Date.UTC(year, month - 1, day, hour, minute);
  let instant = new Date(
    utcWallTime - getTimeZoneOffsetMs(timeZone, new Date(utcWallTime)),
  );
  instant = new Date(utcWallTime - getTimeZoneOffsetMs(timeZone, instant));

  return instant;
}

function chunkValues<T>(values: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}

function getVisiblePersonProfiles(profiles: OwnPersonProfileRow[]) {
  return profiles.filter(
    (profile) =>
      profile.status === "active" && profile.visibility_status === "visible",
  );
}

function getCoachDisplayName(personProfile: OwnPersonProfileRow | undefined) {
  const displayName = personProfile?.display_name.trim();

  return displayName || "Tu ficha de entrenador";
}

async function getOwnCoachProfiles({
  organizationId,
  ownPersonProfileIds,
  supabase,
  userId,
}: {
  organizationId: string;
  ownPersonProfileIds: string[];
  supabase: SupabaseServerClient;
  userId: string;
}) {
  const [personLinkedResult, userLinkedResult] = await Promise.all([
    ownPersonProfileIds.length > 0
      ? supabase
          .from("coach_profiles")
          .select("id, user_id, person_profile_id, status, updated_at")
          .eq("organization_id", organizationId)
          .in("person_profile_id", ownPersonProfileIds)
          .order("updated_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("coach_profiles")
      .select("id, user_id, person_profile_id, status, updated_at")
      .eq("organization_id", organizationId)
      .eq("user_id", userId)
      .order("updated_at", { ascending: false }),
  ]);

  if (personLinkedResult.error || userLinkedResult.error) {
    return null;
  }

  const profilesById = new Map<string, OwnCoachProfileRow>();

  for (const profile of [
    ...(personLinkedResult.data ?? []),
    ...(userLinkedResult.data ?? []),
  ]) {
    profilesById.set(profile.id, profile);
  }

  return [...profilesById.values()];
}

async function getAssignedFutureBlockCandidates({
  coachProfileId,
  organizationId,
  searchEnd,
  searchStart,
  supabase,
}: {
  coachProfileId: string;
  organizationId: string;
  searchEnd: string;
  searchStart: string;
  supabase: SupabaseServerClient;
}) {
  const { data: blocks, error: blocksError } = await supabase
    .from("schedule_blocks")
    .select("id, center_id, class_type_id, service_date, start_time, end_time, status")
    .eq("organization_id", organizationId)
    .gte("service_date", searchStart)
    .lte("service_date", searchEnd)
    .neq("status", "cancelled")
    .neq("status", "completed")
    .order("service_date", { ascending: true })
    .order("start_time", { ascending: true });

  if (blocksError) {
    return null;
  }

  const blockIds = [...new Set((blocks ?? []).map((block) => block.id))];

  if (blockIds.length === 0) {
    return [];
  }

  const assignmentResults = await Promise.all(
    chunkValues(blockIds, ASSIGNMENT_BLOCK_ID_BATCH_SIZE).map((batch) =>
      supabase
        .from("schedule_block_assignments")
        .select("id, schedule_block_id, coach_profile_id, assignment_status")
        .eq("organization_id", organizationId)
        .eq("assignment_status", "assigned")
        .eq("coach_profile_id", coachProfileId)
        .in("schedule_block_id", batch),
    ),
  );
  const failedAssignmentsResult = assignmentResults.find(
    (result) => result.error,
  );

  if (failedAssignmentsResult?.error) {
    return null;
  }

  const assignmentsByBlockId = new Map(
    assignmentResults
      .flatMap((result) => result.data ?? [])
      .map((assignment) => [assignment.schedule_block_id, assignment]),
  );

  return (blocks ?? []).flatMap((block) => {
    const assignment = assignmentsByBlockId.get(block.id);

    return assignment ? [{ assignment, block }] : [];
  });
}

async function getBlockContext({
  candidates,
  organizationId,
  supabase,
}: {
  candidates: AssignedFutureBlockCandidate[];
  organizationId: string;
  supabase: SupabaseServerClient;
}) {
  const centerIds = [...new Set(candidates.map(({ block }) => block.center_id))];
  const classTypeIds = [
    ...new Set(candidates.map(({ block }) => block.class_type_id)),
  ];
  const [centersResult, classTypesResult] = await Promise.all([
    centerIds.length > 0
      ? supabase
          .from("centers")
          .select("id, name, status, timezone")
          .eq("organization_id", organizationId)
          .in("id", centerIds)
      : Promise.resolve({ data: [], error: null }),
    classTypeIds.length > 0
      ? supabase
          .from("class_types")
          .select("id, name, category, color, status")
          .eq("organization_id", organizationId)
          .in("id", classTypeIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (centersResult.error || classTypesResult.error) {
    return null;
  }

  return {
    centersById: new Map((centersResult.data ?? []).map((center) => [center.id, center])),
    classTypesById: new Map(
      (classTypesResult.data ?? []).map((classType) => [classType.id, classType]),
    ),
  };
}

function mapNextAssignedBlock({
  candidate,
  center,
  classType,
  now,
  organizationTimezone,
}: {
  candidate: AssignedFutureBlockCandidate;
  center: NextAssignedCenterRow | null;
  classType: NextAssignedClassTypeRow | null;
  now: Date;
  organizationTimezone: string;
}) {
  const timeZone = getSafeTimeZone(center?.timezone ?? organizationTimezone);
  const startAt = getWallTimeInstant({
    date: candidate.block.service_date,
    time: candidate.block.start_time,
    timeZone,
  });
  const endAt = getWallTimeInstant({
    date: candidate.block.service_date,
    time: candidate.block.end_time,
    timeZone,
  });

  if (!startAt || !endAt) {
    return null;
  }

  const normalizedEndAt =
    endAt.getTime() <= startAt.getTime()
      ? new Date(endAt.getTime() + 24 * 60 * 60 * 1000)
      : endAt;

  if (normalizedEndAt.getTime() <= now.getTime()) {
    return null;
  }

  const minutesUntilStart = Math.max(
    0,
    Math.ceil((startAt.getTime() - now.getTime()) / 60_000),
  );
  const minutesUntilEnd = Math.max(
    0,
    Math.ceil((normalizedEndAt.getTime() - now.getTime()) / 60_000),
  );

  return {
    assignmentId: candidate.assignment.id,
    center,
    classType,
    endAt: normalizedEndAt.toISOString(),
    endTime: candidate.block.end_time,
    isOngoing: startAt.getTime() <= now.getTime(),
    minutesUntilEnd,
    minutesUntilStart,
    scheduleBlockId: candidate.block.id,
    serviceDate: candidate.block.service_date,
    startAt: startAt.toISOString(),
    startTime: candidate.block.start_time,
    status: candidate.block.status,
    timeZone,
  } satisfies OwnNextAssignedScheduleBlock;
}

export async function getOwnNextAssignedScheduleBlock({
  now,
  organizationId,
  organizationTimezone,
  userId,
}: OwnNextAssignedScheduleQuery): Promise<OwnNextAssignedScheduleState> {
  const nowDate = now ? new Date(now) : new Date();
  const safeNow = Number.isNaN(nowDate.getTime()) ? new Date() : nowDate;
  const generatedAt = safeNow.toISOString();
  const safeOrganizationTimezone = getSafeTimeZone(organizationTimezone);
  const searchStart = getDateStringInTimeZone(safeNow, safeOrganizationTimezone);
  const searchWindowEnd = addDaysToDateString(
    searchStart,
    NEXT_ASSIGNED_BLOCK_WINDOW_DAYS,
  );
  const supabase = await createClient();
  const { data: personProfiles, error: personProfilesError } = await supabase
    .from("person_profiles")
    .select("id, display_name, status, user_id, visibility_status")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("status", "active")
    .order("display_name", { ascending: true });

  if (personProfilesError) {
    return failure("load_failed", generatedAt);
  }

  const visiblePersonProfiles = getVisiblePersonProfiles(personProfiles ?? []);

  if (visiblePersonProfiles.length === 0) {
    return failure("missing_person", generatedAt);
  }

  const ownPersonProfileIds = visiblePersonProfiles.map((profile) => profile.id);
  const coachProfiles = await getOwnCoachProfiles({
    organizationId,
    ownPersonProfileIds,
    supabase,
    userId,
  });

  if (!coachProfiles) {
    return failure("load_failed", generatedAt);
  }

  const ownPersonProfileIdsSet = new Set(ownPersonProfileIds);
  const linkedOwnCoachProfiles = coachProfiles.filter(
    (profile) =>
      profile.status === "active" &&
      profile.person_profile_id &&
      ownPersonProfileIdsSet.has(profile.person_profile_id),
  );
  const directlyLinkedButUnresolvedProfiles = coachProfiles.filter(
    (profile) =>
      profile.status === "active" &&
      profile.user_id === userId &&
      (!profile.person_profile_id ||
        !ownPersonProfileIdsSet.has(profile.person_profile_id)),
  );

  if (linkedOwnCoachProfiles.length === 0) {
    return failure(
      directlyLinkedButUnresolvedProfiles.length > 0
        ? "profile_unlinked"
        : "missing_coach_profile",
      generatedAt,
    );
  }

  if (linkedOwnCoachProfiles.length > 1) {
    return failure(
      "ambiguous_coach_profile",
      generatedAt,
      linkedOwnCoachProfiles.length,
    );
  }

  const [ownCoachProfile] = linkedOwnCoachProfiles;
  const ownPersonProfileId = ownCoachProfile.person_profile_id;

  if (!ownPersonProfileId) {
    return failure("profile_unlinked", generatedAt);
  }

  const ownPersonProfile = visiblePersonProfiles.find(
    (profile) => profile.id === ownPersonProfileId,
  );
  const candidates = await getAssignedFutureBlockCandidates({
    coachProfileId: ownCoachProfile.id,
    organizationId,
    searchEnd: searchWindowEnd,
    searchStart,
    supabase,
  });

  if (!candidates) {
    return failure("load_failed", generatedAt);
  }

  const context = await getBlockContext({
    candidates,
    organizationId,
    supabase,
  });

  if (!context) {
    return failure("load_failed", generatedAt);
  }

  const sortedBlocks = candidates
    .flatMap((candidate) => {
      const block = mapNextAssignedBlock({
        candidate,
        center: context.centersById.get(candidate.block.center_id) ?? null,
        classType:
          context.classTypesById.get(candidate.block.class_type_id) ?? null,
        now: safeNow,
        organizationTimezone: safeOrganizationTimezone,
      });

      return block ? [block] : [];
    })
    .sort(
      (first, second) =>
        Date.parse(first.startAt) - Date.parse(second.startAt) ||
        first.scheduleBlockId.localeCompare(second.scheduleBlockId),
    );

  return {
    generatedAt,
    nextBlock: sortedBlocks[0] ?? null,
    ownCoachDisplayName: getCoachDisplayName(ownPersonProfile),
    ownCoachProfileId: ownCoachProfile.id,
    ownPersonProfileId,
    searchWindowEnd,
    status: "matched",
  };
}
