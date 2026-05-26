import Link from "next/link";
import { redirect } from "next/navigation";
import type { CSSProperties } from "react";
import {
  AlertTriangle,
  CalendarDays,
  CalendarOff,
  Clock3,
  Dumbbell,
  Filter,
  MapPin,
  RotateCcw,
  ShieldAlert,
  UsersRound,
} from "lucide-react";

import { OrganizationResolutionState } from "@/components/features/organization-resolution-state";
import {
  PageHeader,
  SectionHeader,
  StatCard,
  StatusBadge,
} from "@/components/features/operations-ui";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getLoginPath } from "@/lib/auth/redirects";
import {
  canManageAbsenceRequests,
  canManageOperationalData,
  getApplicationRoleLabel,
} from "@/lib/auth/permissions";
import {
  getActiveMemberships,
  getAuthenticatedUser,
  resolveActiveOrganization,
} from "@/lib/auth/tenant";
import { listOperationalAbsenceScheduleImpacts } from "@/lib/absence-requests";
import {
  getCoveragePath,
  getMorePath,
  getSchedulePath,
  getStatsPath,
} from "@/lib/navigation/app-paths";
import {
  calculateScheduleCoverageByBlock,
  formatTimeForInput,
  isCoverageActiveBlock,
  isScheduleCoverageRisk,
  resolveWeek,
  type ScheduleBlockCoverage,
} from "@/lib/schedule-blocks";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { isPostgresUuid } from "@/lib/uuid";
import type { Tables } from "@/types/supabase";

export const dynamic = "force-dynamic";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 120;
const SCHEDULE_ASSIGNMENT_BLOCK_ID_BATCH_SIZE = 80;
const WEEKDAY_LABELS = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
];

type StatsSearchParams = {
  center_id?: string | string[];
  class_type_id?: string | string[];
  coach_profile_id?: string | string[];
  from?: string | string[];
  organizationId?: string | string[];
  to?: string | string[];
  week?: string | string[];
};

type StatsPageProps = {
  searchParams: Promise<StatsSearchParams>;
};

type ScheduleBlockRow = Pick<
  Tables<"schedule_blocks">,
  | "center_id"
  | "class_type_id"
  | "end_time"
  | "id"
  | "required_coaches"
  | "service_date"
  | "start_time"
  | "status"
>;

type AssignmentRow = Pick<
  Tables<"schedule_block_assignments">,
  "assignment_status" | "coach_profile_id" | "id" | "schedule_block_id"
>;

type CenterRow = Pick<Tables<"centers">, "id" | "name" | "status">;

type ClassTypeRow = Pick<
  Tables<"class_types">,
  "category" | "color" | "id" | "name" | "status"
>;

type CoachProfileRow = Pick<
  Tables<"coach_profiles">,
  | "id"
  | "person_profile_id"
  | "status"
  | "updated_at"
  | "user_id"
  | "weekly_contracted_hours"
>;

type PersonProfileRow = Pick<
  Tables<"person_profiles">,
  "display_name" | "id" | "status" | "user_id" | "visibility_status"
>;

type MembershipStatusRow = Pick<
  Tables<"organization_memberships">,
  "status" | "user_id"
>;

type StatsFilters = {
  centerId: string | null;
  classTypeId: string | null;
  coachProfileId: string | null;
};

type DateRange = {
  capped: boolean;
  dateFrom: string;
  dateTo: string;
  dayCount: number;
  ignored: string[];
};

type CoachDisplay = {
  detail: string;
  id: string;
  isAssignable: boolean;
  isFallback: boolean;
  label: string;
  status: string;
  weeklyContractedHours: number;
};

type ReferenceData = {
  centers: CenterRow[];
  classTypes: ClassTypeRow[];
  coachDisplays: CoachDisplay[];
  coachProfiles: CoachProfileRow[];
  memberships: MembershipStatusRow[];
  persons: PersonProfileRow[];
};

type WorkloadRow = {
  classes: number;
  coach: CoachDisplay;
  hours: number;
  sharePercent: number;
  targetHours: number | null;
  utilizationPercent: number | null;
};

type BarItem = {
  color?: string | null;
  detail?: string;
  id: string;
  label: string;
  percentage: number;
  value: number;
  valueLabel: string;
};

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parseDateInput(value: string | undefined) {
  if (!value || !DATE_PATTERN.test(value)) {
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

function getDayCount(dateFrom: string, dateTo: string) {
  const from = parseDateInput(dateFrom);
  const to = parseDateInput(dateTo);

  if (!from || !to) {
    return 0;
  }

  return Math.floor((to.getTime() - from.getTime()) / 86_400_000) + 1;
}

function resolveDateRange({
  from,
  timezone,
  to,
  week,
}: {
  from?: string;
  timezone: string;
  to?: string;
  week?: string;
}): DateRange {
  const defaultWeek = resolveWeek(week, timezone);
  const ignored: string[] = [];
  let dateFrom = defaultWeek.weekStart;
  let dateTo = defaultWeek.weekEnd;

  if (from) {
    if (parseDateInput(from)) {
      dateFrom = from;
    } else {
      ignored.push("fecha desde");
    }
  }

  if (to) {
    if (parseDateInput(to)) {
      dateTo = to;
    } else {
      ignored.push("fecha hasta");
    }
  }

  if (dateTo < dateFrom) {
    ignored.push("rango de fechas");
    dateFrom = defaultWeek.weekStart;
    dateTo = defaultWeek.weekEnd;
  }

  let dayCount = getDayCount(dateFrom, dateTo);
  let capped = false;

  if (dayCount > MAX_RANGE_DAYS) {
    dateTo = addDays(dateFrom, MAX_RANGE_DAYS - 1) ?? dateTo;
    dayCount = MAX_RANGE_DAYS;
    capped = true;
  }

  if (defaultWeek.invalidWeekParam && !from && !to) {
    ignored.push("semana");
  }

  return {
    capped,
    dateFrom,
    dateTo,
    dayCount,
    ignored,
  };
}

function resolveStatsFilters({
  centers,
  classTypes,
  coachDisplays,
  params,
}: {
  centers: CenterRow[];
  classTypes: ClassTypeRow[];
  coachDisplays: CoachDisplay[];
  params: StatsSearchParams;
}) {
  const ignoredFilters: string[] = [];
  const centerIds = new Set(centers.map((center) => center.id));
  const classTypeIds = new Set(classTypes.map((classType) => classType.id));
  const coachProfileIds = new Set(coachDisplays.map((coach) => coach.id));

  function resolveTenantScopedId({
    label,
    validIds,
    value,
  }: {
    label: string;
    validIds: Set<string>;
    value?: string;
  }) {
    if (!value) {
      return null;
    }

    if (!isPostgresUuid(value) || !validIds.has(value)) {
      ignoredFilters.push(label);
      return null;
    }

    return value;
  }

  return {
    filters: {
      centerId: resolveTenantScopedId({
        label: "centro",
        validIds: centerIds,
        value: getParam(params.center_id),
      }),
      classTypeId: resolveTenantScopedId({
        label: "tipo de actividad",
        validIds: classTypeIds,
        value: getParam(params.class_type_id),
      }),
      coachProfileId: resolveTenantScopedId({
        label: "entrenador",
        validIds: coachProfileIds,
        value: getParam(params.coach_profile_id),
      }),
    } satisfies StatsFilters,
    ignoredFilters,
  };
}

function chunkValues<T>(values: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}

async function getReferenceData(organizationId: string): Promise<ReferenceData> {
  const supabase = await createClient();
  const [centersResult, classTypesResult, coachesResult] = await Promise.all([
    supabase
      .from("centers")
      .select("id, name, status")
      .eq("organization_id", organizationId)
      .order("status", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("class_types")
      .select("id, name, category, color, status")
      .eq("organization_id", organizationId)
      .order("status", { ascending: true })
      .order("category", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("coach_profiles")
      .select(
        "id, user_id, person_profile_id, status, updated_at, weekly_contracted_hours",
      )
      .eq("organization_id", organizationId)
      .order("status", { ascending: true })
      .order("updated_at", { ascending: false }),
  ]);

  if (centersResult.error) {
    throw new Error(`Could not load stats centers: ${centersResult.error.message}`);
  }

  if (classTypesResult.error) {
    throw new Error(
      `Could not load stats activity types: ${classTypesResult.error.message}`,
    );
  }

  if (coachesResult.error) {
    throw new Error(`Could not load stats coaches: ${coachesResult.error.message}`);
  }

  const coachProfiles = coachesResult.data satisfies CoachProfileRow[];
  const personProfileIds = [
    ...new Set(
      coachProfiles.flatMap((coach) =>
        coach.person_profile_id ? [coach.person_profile_id] : [],
      ),
    ),
  ];
  const userIds = [
    ...new Set(
      coachProfiles.flatMap((coach) => (coach.user_id ? [coach.user_id] : [])),
    ),
  ];

  const [personsResult, membershipsResult] = await Promise.all([
    personProfileIds.length > 0
      ? supabase
          .from("person_profiles")
          .select("id, display_name, status, user_id, visibility_status")
          .eq("organization_id", organizationId)
          .in("id", personProfileIds)
      : Promise.resolve({ data: [], error: null }),
    userIds.length > 0
      ? supabase
          .from("organization_memberships")
          .select("user_id, status")
          .eq("organization_id", organizationId)
          .in("user_id", userIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (personsResult.error) {
    throw new Error(`Could not load stats people: ${personsResult.error.message}`);
  }

  if (membershipsResult.error) {
    throw new Error(
      `Could not load stats access states: ${membershipsResult.error.message}`,
    );
  }

  const persons = personsResult.data satisfies PersonProfileRow[];
  const memberships = membershipsResult.data satisfies MembershipStatusRow[];
  const coachDisplays = buildCoachDisplays({
    coachProfiles,
    memberships,
    persons,
  }).filter((coach) => coach.isAssignable);

  return {
    centers: centersResult.data satisfies CenterRow[],
    classTypes: classTypesResult.data satisfies ClassTypeRow[],
    coachDisplays,
    coachProfiles,
    memberships,
    persons,
  };
}

async function getScheduleBlocks({
  centerId,
  classTypeId,
  dateFrom,
  dateTo,
  organizationId,
}: {
  centerId: string | null;
  classTypeId: string | null;
  dateFrom: string;
  dateTo: string;
  organizationId: string;
}) {
  const supabase = await createClient();
  let query = supabase
    .from("schedule_blocks")
    .select(
      "id, center_id, class_type_id, service_date, start_time, end_time, required_coaches, status",
    )
    .eq("organization_id", organizationId)
    .gte("service_date", dateFrom)
    .lte("service_date", dateTo)
    .order("service_date", { ascending: true })
    .order("start_time", { ascending: true });

  if (centerId) {
    query = query.eq("center_id", centerId);
  }

  if (classTypeId) {
    query = query.eq("class_type_id", classTypeId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Could not load stats schedule blocks: ${error.message}`);
  }

  return data satisfies ScheduleBlockRow[];
}

async function getScheduleBlockAssignments({
  blockIds,
  organizationId,
}: {
  blockIds: string[];
  organizationId: string;
}) {
  const uniqueBlockIds = [...new Set(blockIds)];

  if (uniqueBlockIds.length === 0) {
    return [];
  }

  const supabase = await createClient();
  const batches = chunkValues(
    uniqueBlockIds,
    SCHEDULE_ASSIGNMENT_BLOCK_ID_BATCH_SIZE,
  );
  const results = await Promise.all(
    batches.map((batch) =>
      supabase
        .from("schedule_block_assignments")
        .select("id, schedule_block_id, coach_profile_id, assignment_status")
        .eq("organization_id", organizationId)
        .in("schedule_block_id", batch),
    ),
  );
  const failedResult = results.find((result) => result.error);

  if (failedResult?.error) {
    throw new Error(
      `Could not load stats schedule assignments: ${failedResult.error.message}`,
    );
  }

  return results.flatMap((result) => result.data ?? []) satisfies AssignmentRow[];
}

function shortId(value: string) {
  return value.slice(0, 8);
}

function getCoachDisplay({
  coachProfile,
  membership,
  personProfile,
}: {
  coachProfile: CoachProfileRow;
  membership?: MembershipStatusRow;
  personProfile?: PersonProfileRow;
}): CoachDisplay {
  const weeklyContractedHours = Number(coachProfile.weekly_contracted_hours ?? 0);
  const hasVisiblePerson =
    personProfile?.status === "active" &&
    personProfile.visibility_status === "visible";
  const hasActiveMembership =
    !coachProfile.user_id || membership?.status === "active";
  const isAssignable =
    coachProfile.status === "active" &&
    hasActiveMembership &&
    hasVisiblePerson;

  if (hasVisiblePerson) {
    return {
      detail: membership
        ? `Acceso ${membership.status}`
        : "Persona operativa pendiente de cuenta",
      id: coachProfile.id,
      isAssignable,
      isFallback: false,
      label: personProfile.display_name,
      status: coachProfile.status,
      weeklyContractedHours,
    };
  }

  if (coachProfile.user_id) {
    return {
      detail: `Cuenta sin persona visible (${shortId(coachProfile.user_id)})`,
      id: coachProfile.id,
      isAssignable,
      isFallback: true,
      label: `Entrenador sin perfil visible ${shortId(coachProfile.id)}`,
      status: coachProfile.status,
      weeklyContractedHours,
    };
  }

  return {
    detail: `Perfil técnico incompleto ${shortId(coachProfile.id)}`,
    id: coachProfile.id,
    isAssignable,
    isFallback: true,
    label: `Entrenador sin perfil visible ${shortId(coachProfile.id)}`,
    status: coachProfile.status,
    weeklyContractedHours,
  };
}

function buildCoachDisplays({
  coachProfiles,
  memberships,
  persons,
}: {
  coachProfiles: CoachProfileRow[];
  memberships: MembershipStatusRow[];
  persons: PersonProfileRow[];
}) {
  const membershipsByUserId = new Map(
    memberships.map((membership) => [membership.user_id, membership]),
  );
  const personsById = new Map(persons.map((person) => [person.id, person]));

  return coachProfiles
    .map((coachProfile) =>
      getCoachDisplay({
        coachProfile,
        membership: coachProfile.user_id
          ? membershipsByUserId.get(coachProfile.user_id)
          : undefined,
        personProfile: coachProfile.person_profile_id
          ? personsById.get(coachProfile.person_profile_id)
          : undefined,
      }),
    )
    .sort((first, second) => first.label.localeCompare(second.label, "es"));
}

function getDurationHours(block: ScheduleBlockRow) {
  const start = timeToMinutes(block.start_time);
  const end = timeToMinutes(block.end_time);

  return Math.max(0, (end - start) / 60);
}

function timeToMinutes(value: string) {
  const [hours, minutes] = value.slice(0, 5).split(":").map(Number);

  return hours * 60 + minutes;
}

function formatTime(value: string) {
  return formatTimeForInput(value) || value.slice(0, 5);
}

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "short",
      timeZone: "UTC",
      year: "numeric",
    }).format(new Date(`${value}T12:00:00.000Z`));
  } catch {
    return value;
  }
}

function formatRange(dateFrom: string, dateTo: string) {
  return `${formatDate(dateFrom)} - ${formatDate(dateTo)}`;
}

function formatHours(value: number) {
  return `${new Intl.NumberFormat("es-ES", {
    maximumFractionDigits: value >= 10 ? 0 : 1,
    minimumFractionDigits: value > 0 && value < 10 ? 1 : 0,
  }).format(value)} h`;
}

function formatPercent(value: number) {
  return `${new Intl.NumberFormat("es-ES", {
    maximumFractionDigits: 0,
  }).format(value)}%`;
}

function selectClassName(className = "") {
  return [
    "h-11 w-full min-w-0 truncate rounded-lg border border-input bg-transparent py-1 pl-3 pr-9 text-sm md:h-9",
    "outline-none transition-colors focus-visible:border-ring",
    "focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
    className,
  ]
    .filter(Boolean)
    .join(" ");
}

function isSafeHexColor(value: string | null) {
  return Boolean(value && /^#[0-9a-f]{6}$/i.test(value));
}

function getWeekdayIndex(dateString: string) {
  const date = parseDateInput(dateString);

  if (!date) {
    return 0;
  }

  return (date.getUTCDay() + 6) % 7;
}

function buildAssignmentsByBlock(assignments: AssignmentRow[]) {
  const assignmentsByBlock = new Map<string, AssignmentRow[]>();

  for (const assignment of assignments) {
    if (assignment.assignment_status !== "assigned") {
      continue;
    }

    const blockAssignments =
      assignmentsByBlock.get(assignment.schedule_block_id) ?? [];
    blockAssignments.push(assignment);
    assignmentsByBlock.set(assignment.schedule_block_id, blockAssignments);
  }

  return assignmentsByBlock;
}

function buildWorkloadRows({
  assignments,
  blocksById,
  coachDisplays,
  dayCount,
  selectedCoachId,
}: {
  assignments: AssignmentRow[];
  blocksById: Map<string, ScheduleBlockRow>;
  coachDisplays: CoachDisplay[];
  dayCount: number;
  selectedCoachId: string | null;
}) {
  const rowsByCoach = new Map(
    coachDisplays.map((coach) => [
      coach.id,
      {
        classes: 0,
        coach,
        hours: 0,
        sharePercent: 0,
        targetHours:
          coach.weeklyContractedHours > 0
            ? coach.weeklyContractedHours * (dayCount / 7)
            : null,
        utilizationPercent: null,
      } satisfies WorkloadRow,
    ]),
  );

  for (const assignment of assignments) {
    if (
      assignment.assignment_status !== "assigned" ||
      (selectedCoachId && assignment.coach_profile_id !== selectedCoachId)
    ) {
      continue;
    }

    const block = blocksById.get(assignment.schedule_block_id);
    const row = rowsByCoach.get(assignment.coach_profile_id);

    if (!block || !row || block.status === "cancelled") {
      continue;
    }

    row.classes += 1;
    row.hours += getDurationHours(block);
  }

  const rows = [...rowsByCoach.values()]
    .filter((row) => {
      if (!row.coach.isAssignable) {
        return false;
      }

      if (selectedCoachId) {
        return row.coach.id === selectedCoachId;
      }

      return true;
    })
    .map((row) => {
      const utilizationPercent =
        row.targetHours && row.targetHours > 0
          ? (row.hours / row.targetHours) * 100
          : null;

      return {
        ...row,
        utilizationPercent,
      } satisfies WorkloadRow;
    });
  const totalHours = rows.reduce((sum, row) => sum + row.hours, 0);

  return rows
    .map((row) => ({
      ...row,
      sharePercent: totalHours > 0 ? (row.hours / totalHours) * 100 : 0,
    }))
    .sort((first, second) => {
      if (selectedCoachId) {
        return 0;
      }

      return (
        second.hours - first.hours ||
        second.classes - first.classes ||
        first.coach.label.localeCompare(second.coach.label, "es")
      );
    });
}

function buildClassTypeItems({
  assignmentsByBlock,
  blocks,
  classTypesById,
  selectedCoachId,
}: {
  assignmentsByBlock: Map<string, AssignmentRow[]>;
  blocks: ScheduleBlockRow[];
  classTypesById: Map<string, ClassTypeRow>;
  selectedCoachId: string | null;
}) {
  const statsByType = new Map<
    string,
    { blocks: number; coachHours: number; color: string | null; label: string }
  >();

  for (const block of blocks) {
    if (block.status === "cancelled") {
      continue;
    }

    const assignedCoaches = assignmentsByBlock.get(block.id) ?? [];

    if (
      selectedCoachId &&
      !assignedCoaches.some(
        (assignment) => assignment.coach_profile_id === selectedCoachId,
      )
    ) {
      continue;
    }

    const classType = classTypesById.get(block.class_type_id);
    const stat = statsByType.get(block.class_type_id) ?? {
      blocks: 0,
      coachHours: 0,
      color: classType?.color ?? null,
      label: classType?.name ?? "Tipo no disponible",
    };

    stat.blocks += 1;
    stat.coachHours += selectedCoachId
      ? getDurationHours(block)
      : getDurationHours(block) * assignedCoaches.length;
    statsByType.set(block.class_type_id, stat);
  }

  const maxBlocks = Math.max(1, ...[...statsByType.values()].map((stat) => stat.blocks));

  return [...statsByType.entries()]
    .map(([id, stat]) => ({
      color: isSafeHexColor(stat.color) ? stat.color : null,
      detail:
        stat.coachHours > 0
          ? `${formatHours(stat.coachHours)} asignadas`
          : "Sin horas asignadas",
      id,
      label: stat.label,
      percentage: (stat.blocks / maxBlocks) * 100,
      value: stat.blocks,
      valueLabel: `${stat.blocks} clase${stat.blocks === 1 ? "" : "s"}`,
    }))
    .sort((first, second) => second.value - first.value);
}

function buildWeekdayItems(blocks: ScheduleBlockRow[]) {
  const stats = WEEKDAY_LABELS.map((label, index) => ({
    id: String(index),
    label,
    value: 0,
  }));

  for (const block of blocks) {
    if (block.status === "cancelled") {
      continue;
    }

    stats[getWeekdayIndex(block.service_date)].value += 1;
  }

  const maxValue = Math.max(1, ...stats.map((stat) => stat.value));

  return stats.map((stat) => ({
    ...stat,
    percentage: (stat.value / maxValue) * 100,
    valueLabel: `${stat.value} bloque${stat.value === 1 ? "" : "s"}`,
  }));
}

function buildCenterItems({
  blocks,
  centersById,
  coverageByBlock,
}: {
  blocks: ScheduleBlockRow[];
  centersById: Map<string, CenterRow>;
  coverageByBlock: Map<string, ScheduleBlockCoverage>;
}) {
  const statsByCenter = new Map<
    string,
    { blocks: number; label: string; risks: number }
  >();

  for (const block of blocks) {
    if (block.status === "cancelled") {
      continue;
    }

    const center = centersById.get(block.center_id);
    const stat = statsByCenter.get(block.center_id) ?? {
      blocks: 0,
      label: center?.name ?? "Centro no disponible",
      risks: 0,
    };
    const coverage = coverageByBlock.get(block.id);

    stat.blocks += 1;
    if (coverage && isScheduleCoverageRisk(coverage)) {
      stat.risks += 1;
    }

    statsByCenter.set(block.center_id, stat);
  }

  const maxBlocks = Math.max(
    1,
    ...[...statsByCenter.values()].map((stat) => stat.blocks),
  );

  return [...statsByCenter.entries()]
    .map(([id, stat]) => ({
      detail:
        stat.risks > 0
          ? `${stat.risks} riesgo${stat.risks === 1 ? "" : "s"}`
          : "Sin riesgos activos",
      id,
      label: stat.label,
      percentage: (stat.blocks / maxBlocks) * 100,
      value: stat.blocks,
      valueLabel: `${stat.blocks} bloque${stat.blocks === 1 ? "" : "s"}`,
    }))
    .sort((first, second) => second.value - first.value);
}

function FiltersCard({
  centers,
  classTypes,
  coachDisplays,
  dateRange,
  filters,
  organizationId,
}: {
  centers: CenterRow[];
  classTypes: ClassTypeRow[];
  coachDisplays: CoachDisplay[];
  dateRange: DateRange;
  filters: StatsFilters;
  organizationId: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Filter aria-hidden="true" className="size-4" />
          Filtros
        </CardTitle>
        <CardDescription>
          Ajusta el corte sin mezclar datos de otras organizaciones.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-3 md:grid-cols-2 xl:grid-cols-6" method="get">
          <input name="organizationId" type="hidden" value={organizationId} />
          <label className="grid gap-2">
            <span className="text-sm font-medium">Desde</span>
            <Input defaultValue={dateRange.dateFrom} name="from" type="date" />
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-medium">Hasta</span>
            <Input defaultValue={dateRange.dateTo} name="to" type="date" />
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-medium">Centro</span>
            <select
              className={selectClassName()}
              defaultValue={filters.centerId ?? ""}
              name="center_id"
            >
              <option value="">Todos los centros</option>
              {centers.map((center) => (
                <option key={center.id} value={center.id}>
                  {center.name}
                  {center.status === "inactive" ? " (inactivo)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-medium">Coach</span>
            <select
              className={selectClassName()}
              defaultValue={filters.coachProfileId ?? ""}
              name="coach_profile_id"
            >
              <option value="">Todos los coaches</option>
              {coachDisplays.map((coach) => (
                <option key={coach.id} value={coach.id}>
                  {coach.label}
                  {coach.status !== "active" ? " (inactivo)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2">
          <span className="text-sm font-medium">Tipo</span>
            <select
              className={selectClassName()}
              defaultValue={filters.classTypeId ?? ""}
              name="class_type_id"
            >
              <option value="">Todos los tipos</option>
              {classTypes.map((classType) => (
                <option key={classType.id} value={classType.id}>
                  {classType.name}
                  {classType.status === "inactive" ? " (inactivo)" : ""}
                </option>
              ))}
            </select>
          </label>
          <div className="grid gap-2 md:grid-cols-2 xl:self-end">
            <Button className="min-h-11 md:min-h-9" type="submit">
              Aplicar
            </Button>
            <Button asChild className="min-h-11 md:min-h-9" variant="outline">
              <Link href={getStatsPath({ organizationId })}>
                <RotateCcw aria-hidden="true" />
                Limpiar
              </Link>
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function HorizontalBars({
  emptyDescription,
  emptyTitle,
  items,
}: {
  emptyDescription: string;
  emptyTitle: string;
  items: BarItem[];
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-4">
        <p className="font-medium">{emptyTitle}</p>
        <p className="mt-1 text-sm text-muted-foreground">{emptyDescription}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const barStyle: CSSProperties = {
          width: `${Math.max(item.value > 0 ? 3 : 0, item.percentage)}%`,
        };

        if (item.color) {
          barStyle.backgroundColor = item.color;
        }

        return (
          <div className="grid gap-1.5" key={item.id}>
            <div className="flex min-w-0 items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{item.label}</p>
                {item.detail ? (
                  <p className="truncate text-xs text-muted-foreground">
                    {item.detail}
                  </p>
                ) : null}
              </div>
              <Badge className="shrink-0" variant="outline">
                {item.valueLabel}
              </Badge>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full", item.color ? "" : "bg-primary")}
                style={barStyle}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function getUtilizationTone(row: WorkloadRow) {
  if (row.utilizationPercent === null) {
    return row.hours > 0 ? "info" : "neutral";
  }

  if (row.utilizationPercent >= 115) {
    return "warning";
  }

  if (row.utilizationPercent >= 75) {
    return "success";
  }

  if (row.hours === 0) {
    return "pending";
  }

  return "info";
}

function WorkloadTable({
  rows,
  selectedCoachId,
}: {
  rows: WorkloadRow[];
  selectedCoachId: string | null;
}) {
  if (rows.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No hay coaches para este corte</CardTitle>
          <CardDescription>
            Ajusta los filtros o revisa que existan fichas de coach activas.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Coach</TableHead>
              <TableHead>Clases</TableHead>
              <TableHead>Horas</TableHead>
                  <TableHead>Utilización</TableHead>
              <TableHead>Reparto</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const utilizationLabel =
                row.utilizationPercent === null
                  ? "Sin contrato"
                  : formatPercent(row.utilizationPercent);

              return (
                <TableRow key={row.coach.id}>
                  <TableCell className="min-w-[220px]">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{row.coach.label}</span>
                        {selectedCoachId === row.coach.id ? (
                          <Badge variant="secondary">Filtro</Badge>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {row.coach.detail}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>{row.classes}</TableCell>
                  <TableCell className="font-mono">{formatHours(row.hours)}</TableCell>
                  <TableCell className="min-w-[150px]">
                    <div className="space-y-1.5">
                      <StatusBadge tone={getUtilizationTone(row)}>
                        {utilizationLabel}
                      </StatusBadge>
                      {row.targetHours ? (
                        <p className="text-xs text-muted-foreground">
                          Objetivo {formatHours(row.targetHours)}
                        </p>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="min-w-[150px]">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-24 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${Math.max(row.sharePercent, row.hours > 0 ? 3 : 0)}%` }}
                        />
                      </div>
                      <span className="font-mono text-xs text-muted-foreground">
                        {formatPercent(row.sharePercent)}
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function PlanningAlerts({
  activeRiskBlocks,
  absenceImpactCount,
  coachesWithoutLoad,
  conflictCount,
  insufficientCount,
  organizationId,
  uncoveredCount,
}: {
  activeRiskBlocks: number;
  absenceImpactCount: number;
  coachesWithoutLoad: WorkloadRow[];
  conflictCount: number;
  insufficientCount: number;
  organizationId: string;
  uncoveredCount: number;
}) {
  const hasAlerts = activeRiskBlocks > 0 || coachesWithoutLoad.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldAlert aria-hidden="true" className="size-4" />
          Avisos operativos
        </CardTitle>
        <CardDescription>
          Solo se muestran avisos que salen del horario, asignaciones reales e
          impacto de ausencia.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!hasAlerts ? (
          <div className="rounded-lg border border-border bg-muted/25 p-4">
            <p className="font-medium">Sin avisos en este corte</p>
            <p className="mt-1 text-sm text-muted-foreground">
              No hay riesgos activos de cobertura ni coaches activos sin carga.
            </p>
          </div>
        ) : null}

        {activeRiskBlocks > 0 ? (
          <div className="rounded-lg border border-orange-300/60 bg-orange-50 p-4 text-orange-900">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">Revisar cobertura activa</p>
                <p className="mt-1 text-sm">
                  {uncoveredCount} sin coach, {insufficientCount} insuficientes,{" "}
                  {conflictCount} con conflicto y {absenceImpactCount} con
                  impacto de ausencia.
                </p>
              </div>
              <Button asChild size="sm" variant="outline">
                <Link href={getCoveragePath({ organizationId })}>
                  Abrir
                </Link>
              </Button>
            </div>
          </div>
        ) : null}

        {coachesWithoutLoad.length > 0 ? (
          <div className="rounded-lg border border-border p-4">
            <p className="font-medium">Coaches activos sin asignación</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {coachesWithoutLoad
                .slice(0, 5)
                .map((row) => row.coach.label)
                .join(", ")}
              {coachesWithoutLoad.length > 5 ? "..." : ""}
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function VacationReadinessCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarOff aria-hidden="true" className="size-4" />
          Vacaciones y ausencias
        </CardTitle>
        <CardDescription>
          Saldos y calendario legal siguen fuera; el impacto operativo ya se
          lee desde cobertura.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-3">
          {[
            "Saldos legales por coach",
            "Ausencias aprobadas con impacto",
            "Ausencias en revision",
          ].map((title) => (
            <div className="rounded-lg border border-dashed border-border p-4" key={title}>
              <p className="font-medium">{title}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Lectura separada de saldos y sin motivos sensibles.
              </p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          No se calculan saldos ni devengos desde bloques planificados. Las
          ausencias aprobadas o en revision pueden marcar riesgo de cobertura,
          pero no modifican semanas ni asignaciones ya creadas.
        </p>
      </CardContent>
    </Card>
  );
}

function AccessDenied({
  organizationId,
  role,
}: {
  organizationId: string;
  role: string;
}) {
  return (
    <div className="space-y-6">
      <PageHeader
        badge="Estadísticas"
        description="Panel reservado para administración y gestión operativa."
        meta={<Badge variant="outline">{getApplicationRoleLabel(role)}</Badge>}
        title="Estadísticas operativas"
      />
      <Alert variant="destructive">
        <AlertTriangle aria-hidden="true" className="size-4" />
        <AlertTitle>Sin permisos de gestión</AlertTitle>
        <AlertDescription>
          Tu rol puede usar la operativa permitida, pero no consultar datos
          agregados de equipo.
        </AlertDescription>
      </Alert>
      <Button asChild variant="outline">
        <Link href={getMorePath({ organizationId })}>Volver a Más</Link>
      </Button>
    </div>
  );
}

export default async function StatsPage({ searchParams }: StatsPageProps) {
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect(getLoginPath("/app/stats"));
  }

  const params = await searchParams;
  const requestedOrganizationId = getParam(params.organizationId);
  const memberships = await getActiveMemberships(user.id);
  const resolution = resolveActiveOrganization(
    memberships,
    requestedOrganizationId,
  );

  if (!resolution.ok) {
    return (
      <div className="space-y-6">
        <PageHeader title="Estadísticas operativas" />
        <OrganizationResolutionState basePath="/app/stats" resolution={resolution} />
      </div>
    );
  }

  const organizationId = resolution.organization.id;
  const role = resolution.membership.role;

  if (!canManageOperationalData(role)) {
    return <AccessDenied organizationId={organizationId} role={role} />;
  }

  const dateRange = resolveDateRange({
    from: getParam(params.from),
    timezone: resolution.organization.timezone,
    to: getParam(params.to),
    week: getParam(params.week),
  });
  const referenceData = await getReferenceData(organizationId);
  const { filters, ignoredFilters } = resolveStatsFilters({
    centers: referenceData.centers,
    classTypes: referenceData.classTypes,
    coachDisplays: referenceData.coachDisplays,
    params,
  });
  const blocks = await getScheduleBlocks({
    centerId: filters.centerId,
    classTypeId: filters.classTypeId,
    dateFrom: dateRange.dateFrom,
    dateTo: dateRange.dateTo,
    organizationId,
  });
  const assignments = await getScheduleBlockAssignments({
    blockIds: blocks.map((block) => block.id),
    organizationId,
  });
  const canReviewAbsenceImpact = canManageAbsenceRequests(role);
  const absenceImpactResult =
    canReviewAbsenceImpact && blocks.length > 0
      ? await listOperationalAbsenceScheduleImpacts({
          limit: 200,
          organizationId,
          scheduleBlockIds: blocks.map((block) => block.id),
          serviceDateFrom: dateRange.dateFrom,
          serviceDateTo: dateRange.dateTo,
        })
      : { data: [], ok: true as const };
  const plannedBlocks = blocks.filter((block) => block.status !== "cancelled");
  const activeBlocks = plannedBlocks.filter((block) =>
    isCoverageActiveBlock(block.status),
  );
  const blocksById = new Map(plannedBlocks.map((block) => [block.id, block]));
  const assignmentsByBlock = buildAssignmentsByBlock(assignments);
  const centersById = new Map(
    referenceData.centers.map((center) => [center.id, center]),
  );
  const classTypesById = new Map(
    referenceData.classTypes.map((classType) => [classType.id, classType]),
  );
  const coverageByBlock = calculateScheduleCoverageByBlock({
    absenceImpacts: absenceImpactResult.ok ? absenceImpactResult.data : [],
    assignments,
    blocks,
    coaches: referenceData.coachProfiles,
    memberships: referenceData.memberships,
    persons: referenceData.persons,
  });
  const workloadRows = buildWorkloadRows({
    assignments,
    blocksById,
    coachDisplays: referenceData.coachDisplays,
    dayCount: dateRange.dayCount,
    selectedCoachId: filters.coachProfileId,
  });
  const totalAssignedHours = workloadRows.reduce(
    (sum, row) => sum + row.hours,
    0,
  );
  const assignedCoachCount = workloadRows.filter((row) => row.hours > 0).length;
  const riskBlocks = activeBlocks.filter((block) => {
    const coverage = coverageByBlock.get(block.id);

    return coverage ? isScheduleCoverageRisk(coverage) : false;
  });
  const uncoveredCount = riskBlocks.filter(
    (block) => coverageByBlock.get(block.id)?.state === "uncovered",
  ).length;
  const insufficientCount = riskBlocks.filter(
    (block) => coverageByBlock.get(block.id)?.state === "insufficient",
  ).length;
  const conflictCount = riskBlocks.filter(
    (block) => coverageByBlock.get(block.id)?.state === "conflict",
  ).length;
  const absenceImpactCount = riskBlocks.filter((block) => {
    const coverage = coverageByBlock.get(block.id);

    return Boolean(
      coverage &&
        (coverage.absenceImpact.coverageNeededCount > 0 ||
          coverage.absenceImpact.potentialCount > 0),
    );
  }).length;
  const safeActiveBlockCount = activeBlocks.filter((block) => {
    const coverage = coverageByBlock.get(block.id);

    return coverage
      ? !isScheduleCoverageRisk(coverage) &&
          (coverage.state === "covered" || coverage.state === "not_required")
      : false;
  }).length;
  const coveragePercent =
    activeBlocks.length > 0
      ? (safeActiveBlockCount / activeBlocks.length) * 100
      : 100;
  const coachesWithoutLoad = workloadRows.filter(
    (row) => row.coach.isAssignable && row.classes === 0,
  );
  const classTypeItems = buildClassTypeItems({
    assignmentsByBlock,
    blocks: plannedBlocks,
    classTypesById,
    selectedCoachId: filters.coachProfileId,
  });
  const weekdayItems = buildWeekdayItems(plannedBlocks);
  const centerItems = buildCenterItems({
    blocks: plannedBlocks,
    centersById,
    coverageByBlock,
  });
  const roleLabel = getApplicationRoleLabel(role);

  return (
    <div className="space-y-6">
      <PageHeader
        badge="Estadísticas"
        description="Lectura agregada de carga, clases, cobertura y distribución operativa para perfiles de gestión."
        meta={
          <>
            <Badge variant="outline">{resolution.organization.name}</Badge>
            <Badge variant="outline">{roleLabel}</Badge>
          </>
        }
        title="Estadísticas operativas"
      >
        <p className="text-sm text-muted-foreground">
          {formatRange(dateRange.dateFrom, dateRange.dateTo)}
        </p>
      </PageHeader>

      {(dateRange.ignored.length > 0 || ignoredFilters.length > 0) ? (
        <Alert>
          <AlertTitle>Filtros ajustados</AlertTitle>
          <AlertDescription>
            Se ignoraron valores no válidos:{" "}
            {[...dateRange.ignored, ...ignoredFilters].join(", ")}.
          </AlertDescription>
        </Alert>
      ) : null}

      {dateRange.capped ? (
        <Alert>
          <AlertTitle>Rango limitado</AlertTitle>
          <AlertDescription>
            Para mantener la consulta manejable se muestran como máximo{" "}
            {MAX_RANGE_DAYS} días desde la fecha inicial.
          </AlertDescription>
        </Alert>
      ) : null}

      {!absenceImpactResult.ok ? (
        <Alert>
          <AlertTitle>Impacto de ausencia no disponible</AlertTitle>
          <AlertDescription>
            Las estadisticas se muestran sin cruzar ausencias aprobadas o en
            revision.
          </AlertDescription>
        </Alert>
      ) : null}

      <FiltersCard
        centers={referenceData.centers}
        classTypes={referenceData.classTypes}
        coachDisplays={referenceData.coachDisplays}
        dateRange={dateRange}
        filters={filters}
        organizationId={organizationId}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          description="Sin contar cancelados."
          icon={CalendarDays}
          label="Bloques"
          value={plannedBlocks.length}
        />
        <StatCard
          description="Participacion asignada en el rango."
          icon={Clock3}
          label="Horas coach"
          value={formatHours(totalAssignedHours)}
        />
        <StatCard
          description="Bloques activos sin riesgo."
          icon={ShieldAlert}
          label="Cobertura"
          tone={riskBlocks.length > 0 ? "warning" : "success"}
          value={formatPercent(coveragePercent)}
        />
        <StatCard
          description="Con al menos una asignación."
          icon={UsersRound}
          label="Coaches con carga"
          value={assignedCoachCount}
        />
      </div>

      <section className="space-y-3">
        <SectionHeader
          action={
            <Button asChild size="sm" variant="outline">
              <Link
                href={getSchedulePath({
                  centerId: filters.centerId,
                  classTypeId: filters.classTypeId,
                  coachProfileId: filters.coachProfileId,
                  organizationId,
                  week: dateRange.dateFrom,
                })}
              >
                Abrir horario
              </Link>
            </Button>
          }
          description="Compara participacion, horas asignadas y carga relativa por coach."
          title="Utilización de coaches"
        />
        <WorkloadTable
          rows={workloadRows}
          selectedCoachId={filters.coachProfileId}
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Dumbbell aria-hidden="true" className="size-4" />
              Tipos de clase
            </CardTitle>
            <CardDescription>
              Distribución por clases planificadas en el rango actual.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <HorizontalBars
              emptyDescription="No hay clases planificadas para estos filtros."
              emptyTitle="Sin distribución por tipo"
              items={classTypeItems}
            />
          </CardContent>
        </Card>

        <PlanningAlerts
          activeRiskBlocks={riskBlocks.length}
          absenceImpactCount={absenceImpactCount}
          coachesWithoutLoad={coachesWithoutLoad}
          conflictCount={conflictCount}
          insufficientCount={insufficientCount}
          organizationId={organizationId}
          uncoveredCount={uncoveredCount}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays aria-hidden="true" className="size-4" />
              Concentración por día
            </CardTitle>
            <CardDescription>
              Recuento de bloques por día de la semana.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <HorizontalBars
              emptyDescription="No hay bloques en el rango seleccionado."
              emptyTitle="Sin bloques por día"
              items={weekdayItems}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin aria-hidden="true" className="size-4" />
              Centros
            </CardTitle>
            <CardDescription>
              Volumen planificado y riesgos activos por sede.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <HorizontalBars
              emptyDescription="No hay bloques con centro para estos filtros."
              emptyTitle="Sin distribución por centro"
              items={centerItems}
            />
          </CardContent>
        </Card>
      </div>

      <VacationReadinessCard />

      {plannedBlocks.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Primeros bloques del corte</CardTitle>
            <CardDescription>
              Muestra compacta para aterrizar los agregados en clases reales.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-border">
              {plannedBlocks.slice(0, 8).map((block) => {
                const center = centersById.get(block.center_id);
                const classType = classTypesById.get(block.class_type_id);
                const assignedCount =
                  assignmentsByBlock.get(block.id)?.length ?? 0;

                return (
                  <div
                    className="grid gap-2 py-3 first:pt-0 last:pb-0 sm:grid-cols-[110px_minmax(0,1fr)_auto] sm:items-center"
                    key={block.id}
                  >
                    <p className="font-mono text-sm font-semibold">
                      {formatDate(block.service_date)}
                    </p>
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {formatTime(block.start_time)} - {formatTime(block.end_time)} /{" "}
                        {classType?.name ?? "Actividad"}
                      </p>
                      <p className="mt-1 truncate text-sm text-muted-foreground">
                        {center?.name ?? "Centro no disponible"}
                      </p>
                    </div>
                    <Badge variant="outline">
                      {assignedCount}/{block.required_coaches} coaches
                    </Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
