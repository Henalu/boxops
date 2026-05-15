import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CalendarRange,
  Filter,
  ListChecks,
  PanelRightOpen,
  Plus,
  RotateCcw,
} from "lucide-react";

import { createScheduleBlock } from "./actions";
import { ScheduleBlockDetailPanels } from "./schedule-block-detail-panels";
import { OrganizationResolutionState } from "@/components/features/organization-resolution-state";
import { RouteStateButton } from "@/components/features/route-state-link";
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
import { Textarea } from "@/components/ui/textarea";
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
import { getSchedulePath } from "@/lib/navigation/app-paths";
import {
  SCHEDULE_FILTER_COVERAGE_STATES,
  SCHEDULE_BLOCK_STATUSES,
  calculateScheduleCoverageByBlock,
  formatTimeForInput,
  getAdjacentWeekStart,
  getScheduleBlockStatusLabel,
  getScheduleCoverageStateLabel,
  isCoverageActiveBlock,
  isScheduleBlockStatus,
  isScheduleCoverageRisk,
  isScheduleFilterCoverageState,
  isScheduleUuid,
  resolveWeek,
  type ScheduleBlockStatus,
  type ScheduleBlockCoverage,
  type ScheduleFilterCoverageState,
} from "@/lib/schedule-blocks";
import { ensureActiveScheduleTemplatesForWindow } from "@/lib/schedule-template-application";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/supabase";

export const dynamic = "force-dynamic";

const SCHEDULE_ASSIGNMENT_BLOCK_ID_BATCH_SIZE = 50;

type ScheduleSearchParams = {
  block_id?: string | string[];
  block_status?: string | string[];
  center_id?: string | string[];
  class_type_id?: string | string[];
  coach_profile_id?: string | string[];
  coverage_state?: string | string[];
  day?: string | string[];
  error?: string | string[];
  mine?: string | string[];
  organizationId?: string | string[];
  risks_only?: string | string[];
  status?: string | string[];
  view?: string | string[];
  week?: string | string[];
};

type SchedulePageProps = {
  searchParams: Promise<ScheduleSearchParams>;
};

type ScheduleBlockRow = Pick<
  Tables<"schedule_blocks">,
  | "center_id"
  | "class_type_id"
  | "end_time"
  | "id"
  | "is_template_exception"
  | "notes"
  | "required_coaches"
  | "service_date"
  | "start_time"
  | "status"
  | "template_block_id"
  | "template_id"
  | "updated_at"
>;

type CenterRow = Pick<Tables<"centers">, "id" | "name" | "status">;

type ClassTypeRow = Pick<
  Tables<"class_types">,
  "category" | "color" | "id" | "name" | "required_coaches" | "status"
>;

type ScheduleBlockAssignmentRow = Pick<
  Tables<"schedule_block_assignments">,
  | "assignment_status"
  | "coach_profile_id"
  | "id"
  | "schedule_block_id"
  | "source"
  | "updated_at"
>;

type CoachProfileRow = Pick<
  Tables<"coach_profiles">,
  "id" | "person_profile_id" | "status" | "updated_at" | "user_id"
>;

type PersonProfileRow = Pick<
  Tables<"person_profiles">,
  "display_name" | "id" | "status" | "user_id" | "visibility_status"
>;

type MembershipStatusRow = Pick<
  Tables<"organization_memberships">,
  "status" | "user_id"
>;

type CoachDisplay = {
  detail: string;
  id: string;
  isFallback: boolean;
  label: string;
};

type ScheduleFilters = {
  blockStatus: ScheduleBlockStatus | null;
  centerId: string | null;
  classTypeId: string | null;
  coachProfileId: string | null;
  coverageState: ScheduleFilterCoverageState | null;
  mineOnly: boolean;
  risksOnly: boolean;
};

type ScheduleView = "week" | "agenda" | "month";

function chunkValues<T>(values: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}

type MyScheduleFilterState =
  | {
      status: "off";
    }
  | {
      coachDisplay?: CoachDisplay;
      coachProfileId: string;
      status: "matched";
    }
  | {
      status: "missing";
    }
  | {
      profileCount: number;
      status: "ambiguous";
    };

const successMessages: Record<string, string> = {
  "assignment-removed": "Asignación retirada.",
  assigned: "Entrenador asignado.",
  cancelled: "Bloque cancelado.",
  created: "Bloque creado.",
  "template-already-applied": "Plantilla ya aplicada.",
  "template-applied": "Plantilla aplicada con entrenadores por defecto.",
  "template-replaced": "Plantilla sustituida en esta semana.",
  updated: "Bloque actualizado.",
};

const errorMessages: Record<string, string> = {
  "assignment-required": "No se ha recibido la asignación a retirar.",
  "block-required": "No se ha recibido el bloque a actualizar.",
  "block-not-assignable":
    "No se puede asignar entrenador a un bloque cancelado o completado.",
  "coach-inactive": "Ese perfil de entrenador no está activo.",
  "coach-membership-inactive":
    "Ese entrenador tiene cuenta vinculada, pero su acceso no está activo.",
  "coach-required": "Selecciona un entrenador para asignar.",
  "coach-unavailable":
    "Ese entrenador ya tiene otro bloque asignado que se solapa con esta franja.",
  "date-out-of-week": "La fecha debe estar dentro de la semana abierta.",
  "duplicate-assignment":
    "Ese entrenador ya tiene una asignación lógica en este bloque.",
  forbidden: "Tu rol no permite gestionar bloques operativos.",
  "invalid-assignment": "La asignación recibida no es válida.",
  "invalid-assignment-reference":
    "La asignación ya no apunta a un bloque o entrenador válido.",
  "invalid-block": "El bloque recibido no es válido.",
  "invalid-class-type": "El tipo de actividad seleccionado no es válido.",
  "invalid-center": "El centro seleccionado no es válido.",
  "invalid-coach": "El entrenador seleccionado no es válido.",
  "invalid-date": "La fecha del bloque no es válida.",
  "invalid-person-profile":
    "El perfil visible del entrenador no pertenece a esta organización.",
  "invalid-reference":
    "El centro o tipo seleccionado ya no está disponible.",
  "invalid-required-coaches":
    "Los entrenadores necesarios deben ser un número entero entre 0 y 20.",
  "invalid-status": "El estado seleccionado no es válido.",
  "invalid-time": "La hora de inicio debe ser anterior a la hora de fin.",
  "missing-fields": "Completa centro, tipo, fecha y horas.",
  no_active_memberships: "No hay accesos activos para este usuario.",
  "notes-too-long": "Las notas no pueden superar 1000 caracteres.",
  organization_not_found: "La organización solicitada no está disponible.",
  organization_required:
    "Elige una organización antes de gestionar bloques operativos.",
  "person-profile-inactive": "El perfil visible del entrenador no está activo.",
  "person-profile-internal":
    "Los perfiles internos no pueden asignarse como entrenadores operativos.",
  "save-failed": "No se han podido guardar los cambios.",
  "template-out-of-range":
    "La semana seleccionada no cruza el rango de validez de esa plantilla.",
  "template-week-has-template":
    "Esta semana ya tiene una plantilla aplicada. Confirma la sustitución desde Plantillas.",
};

const successDescriptions: Partial<Record<keyof typeof successMessages, string>> = {
  "template-applied":
    "Se han creado los bloques y se han asignado los entrenadores por defecto definidos en la plantilla.",
  "template-already-applied":
    "La semana ya tenía los bloques de esa plantilla, así que no se han duplicado.",
  "template-replaced":
    "Solo se ha sustituido la semana seleccionada. Las demas semanas conservan su plantilla base.",
};

const scheduleViews = [
  {
    description: "Planificación semanal visual",
    icon: CalendarDays,
    label: "Semana",
    value: "week",
  },
  {
    description: "Lista por día y hora",
    icon: ListChecks,
    label: "Agenda",
    value: "agenda",
  },
  {
    description: "Overview de riesgos",
    icon: CalendarRange,
    label: "Mes",
    value: "month",
  },
] as const satisfies {
  description: string;
  icon: typeof CalendarDays;
  label: string;
  value: ScheduleView;
}[];

const mobileWeekdayLabels = ["L", "M", "X", "J", "V", "S", "D"];

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function getBooleanParam(value: string | string[] | undefined) {
  const param = getParam(value);

  if (!param) {
    return {
      invalid: false,
      value: false,
    };
  }

  if (param === "1" || param === "true") {
    return {
      invalid: false,
      value: true,
    };
  }

  if (param === "0" || param === "false") {
    return {
      invalid: false,
      value: false,
    };
  }

  return {
    invalid: true,
    value: false,
  };
}

function resolveScheduleView(value: string | string[] | undefined): ScheduleView {
  const view = getParam(value);

  return view === "agenda" || view === "month" || view === "week"
    ? view
    : "week";
}

function resolveExplicitScheduleView(
  value: string | string[] | undefined,
): ScheduleView | null {
  const view = getParam(value);

  return view === "agenda" || view === "month" || view === "week"
    ? view
    : null;
}

function resolveSelectedScheduleDay(
  value: string | string[] | undefined,
  days: string[],
) {
  const day = getParam(value);

  return day && days.includes(day) ? day : (days[0] ?? "");
}

function resolveScheduleFilters({
  centers,
  classTypes,
  coachProfiles,
  params,
}: {
  centers: CenterRow[];
  classTypes: ClassTypeRow[];
  coachProfiles: CoachProfileRow[];
  params: ScheduleSearchParams;
}) {
  const ignoredFilters: string[] = [];
  const centerIds = new Set(centers.map((center) => center.id));
  const classTypeIds = new Set(classTypes.map((classType) => classType.id));
  const coachProfileIds = new Set(
    coachProfiles.map((coachProfile) => coachProfile.id),
  );

  function resolveTenantScopedId({
    key,
    label,
    validIds,
  }: {
    key: keyof Pick<
      ScheduleSearchParams,
      "center_id" | "class_type_id" | "coach_profile_id"
    >;
    label: string;
    validIds: Set<string>;
  }) {
    const value = getParam(params[key]);

    if (!value) {
      return null;
    }

    if (!isScheduleUuid(value) || !validIds.has(value)) {
      ignoredFilters.push(label);
      return null;
    }

    return value;
  }

  const blockStatusParam = getParam(params.block_status);
  const coverageStateParam = getParam(params.coverage_state);
  const mineOnly = getBooleanParam(params.mine);
  const risksOnly = getBooleanParam(params.risks_only);

  if (blockStatusParam && !isScheduleBlockStatus(blockStatusParam)) {
    ignoredFilters.push("estado operativo");
  }

  if (
    coverageStateParam &&
    !isScheduleFilterCoverageState(coverageStateParam)
  ) {
    ignoredFilters.push("cobertura");
  }

  if (risksOnly.invalid) {
    ignoredFilters.push("solo riesgos");
  }

  if (mineOnly.invalid) {
    ignoredFilters.push("mi horario");
  }

  return {
    filters: {
      blockStatus:
        blockStatusParam && isScheduleBlockStatus(blockStatusParam)
          ? blockStatusParam
          : null,
      centerId: resolveTenantScopedId({
        key: "center_id",
        label: "centro",
        validIds: centerIds,
      }),
      classTypeId: resolveTenantScopedId({
        key: "class_type_id",
        label: "tipo de actividad",
        validIds: classTypeIds,
      }),
      coachProfileId: resolveTenantScopedId({
        key: "coach_profile_id",
        label: "entrenador",
        validIds: coachProfileIds,
      }),
      coverageState:
        coverageStateParam &&
        isScheduleFilterCoverageState(coverageStateParam)
          ? coverageStateParam
          : null,
      mineOnly: mineOnly.value,
      risksOnly: risksOnly.value,
    } satisfies ScheduleFilters,
    ignoredFilters,
  };
}

function getScheduleFilterPathOptions(
  filters: ScheduleFilters,
  view?: ScheduleView | null,
) {
  return {
    blockStatus: filters.blockStatus,
    centerId: filters.centerId,
    classTypeId: filters.classTypeId,
    coachProfileId: filters.coachProfileId,
    coverageState: filters.coverageState,
    mineOnly: filters.mineOnly,
    risksOnly: filters.risksOnly,
    view,
  };
}

function getActiveFilterCount(filters: ScheduleFilters) {
  return [
    filters.centerId,
    filters.coachProfileId,
    filters.classTypeId,
    filters.blockStatus,
    filters.coverageState,
    filters.mineOnly ? "mine" : null,
    filters.risksOnly ? "risks_only" : null,
  ].filter(Boolean).length;
}

function applyScheduleFilters({
  assignments,
  blocks,
  coverageByBlock,
  filters,
  myScheduleCoachProfileId,
}: {
  assignments: ScheduleBlockAssignmentRow[];
  blocks: ScheduleBlockRow[];
  coverageByBlock: Map<string, ScheduleBlockCoverage>;
  filters: ScheduleFilters;
  myScheduleCoachProfileId: string | null;
}) {
  function getBlocksAssignedToCoach(coachProfileId: string | null) {
    return coachProfileId
      ? new Set(
          assignments
            .filter(
              (assignment) =>
                assignment.assignment_status === "assigned" &&
                assignment.coach_profile_id === coachProfileId,
            )
            .map((assignment) => assignment.schedule_block_id),
        )
      : null;
  }

  if (filters.mineOnly && !myScheduleCoachProfileId) {
    return [];
  }

  const blocksAssignedToCoach = getBlocksAssignedToCoach(filters.coachProfileId);
  const blocksAssignedToCurrentUser = filters.mineOnly
    ? getBlocksAssignedToCoach(myScheduleCoachProfileId)
    : null;

  return blocks.filter((block) => {
    if (filters.centerId && block.center_id !== filters.centerId) {
      return false;
    }

    if (filters.classTypeId && block.class_type_id !== filters.classTypeId) {
      return false;
    }

    if (filters.blockStatus && block.status !== filters.blockStatus) {
      return false;
    }

    if (blocksAssignedToCoach && !blocksAssignedToCoach.has(block.id)) {
      return false;
    }

    if (
      blocksAssignedToCurrentUser &&
      !blocksAssignedToCurrentUser.has(block.id)
    ) {
      return false;
    }

    const coverage = coverageByBlock.get(block.id);

    if (!coverage) {
      return false;
    }

    if (filters.risksOnly && !isScheduleCoverageRisk(coverage)) {
      return false;
    }

    if (filters.coverageState && coverage.state !== filters.coverageState) {
      return false;
    }

    return true;
  });
}

async function getScheduleBlocks({
  organizationId,
  weekEnd,
  weekStart,
}: {
  organizationId: string;
  weekEnd: string;
  weekStart: string;
}) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("schedule_blocks")
    .select(
      "id, center_id, class_type_id, service_date, start_time, end_time, required_coaches, status, notes, template_id, template_block_id, is_template_exception, updated_at",
    )
    .eq("organization_id", organizationId)
    .gte("service_date", weekStart)
    .lte("service_date", weekEnd)
    .order("service_date", { ascending: true })
    .order("start_time", { ascending: true });

  if (error) {
    throw new Error(`Could not load schedule blocks: ${error.message}`);
  }

  return data satisfies ScheduleBlockRow[];
}

async function getCenters(organizationId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("centers")
    .select("id, name, status")
    .eq("organization_id", organizationId)
    .order("status", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`Could not load centers: ${error.message}`);
  }

  return data satisfies CenterRow[];
}

async function getClassTypes(organizationId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("class_types")
    .select("id, name, category, required_coaches, status, color")
    .eq("organization_id", organizationId)
    .order("status", { ascending: true })
    .order("category", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`Could not load class types: ${error.message}`);
  }

  return data satisfies ClassTypeRow[];
}

async function getScheduleBlockAssignments({
  blockIds,
  organizationId,
}: {
  blockIds: string[];
  organizationId: string;
}) {
  const uniqueBlockIds = Array.from(new Set(blockIds));

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
        .select(
          "id, schedule_block_id, coach_profile_id, assignment_status, source, updated_at",
        )
        .eq("organization_id", organizationId)
        .in("schedule_block_id", batch)
        .order("updated_at", { ascending: false }),
    ),
  );
  const failedResult = results.find((result) => result.error);

  if (failedResult?.error) {
    throw new Error(
      `Could not load schedule assignments: ${failedResult.error.message}`,
    );
  }

  const assignments = results
    .flatMap((result) => result.data ?? [])
    .sort((first, second) =>
      second.updated_at.localeCompare(first.updated_at),
    ) satisfies ScheduleBlockAssignmentRow[];

  return assignments;
}

async function getScheduleCoachContext(organizationId: string) {
  const supabase = await createClient();
  const { data: coachProfiles, error } = await supabase
    .from("coach_profiles")
    .select("id, user_id, person_profile_id, status, updated_at")
    .eq("organization_id", organizationId)
    .order("status", { ascending: true })
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(`Could not load coach profiles: ${error.message}`);
  }

  const personProfileIds = [
    ...new Set(
      coachProfiles.flatMap((coachProfile) =>
        coachProfile.person_profile_id ? [coachProfile.person_profile_id] : [],
      ),
    ),
  ];
  const userIds = [
    ...new Set(
      coachProfiles.flatMap((coachProfile) =>
        coachProfile.user_id ? [coachProfile.user_id] : [],
      ),
    ),
  ];

  const [personProfilesResult, membershipsResult] = await Promise.all([
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

  if (personProfilesResult.error) {
    throw new Error(
      `Could not load person profiles: ${personProfilesResult.error.message}`,
    );
  }

  if (membershipsResult.error) {
    throw new Error(
      `Could not load membership statuses: ${membershipsResult.error.message}`,
    );
  }

  return {
    coachProfiles: coachProfiles satisfies CoachProfileRow[],
    memberships: membershipsResult.data satisfies MembershipStatusRow[],
    personProfiles: personProfilesResult.data satisfies PersonProfileRow[],
  };
}

function resolveMyScheduleFilterState({
  coachDisplaysById,
  coachProfiles,
  personProfiles,
  userId,
}: {
  coachDisplaysById: Map<string, CoachDisplay>;
  coachProfiles: CoachProfileRow[];
  personProfiles: PersonProfileRow[];
  userId: string;
}): MyScheduleFilterState {
  const currentUserPersonProfileIds = new Set(
    personProfiles
      .filter((personProfile) => personProfile.user_id === userId)
      .map((personProfile) => personProfile.id),
  );
  const coachProfileIds = new Set(
    coachProfiles.flatMap((coachProfile) => {
      if (coachProfile.user_id === userId) {
        return [coachProfile.id];
      }

      if (
        coachProfile.person_profile_id &&
        currentUserPersonProfileIds.has(coachProfile.person_profile_id)
      ) {
        return [coachProfile.id];
      }

      return [];
    }),
  );

  if (coachProfileIds.size === 0) {
    return {
      status: "missing",
    };
  }

  if (coachProfileIds.size > 1) {
    return {
      profileCount: coachProfileIds.size,
      status: "ambiguous",
    };
  }

  const [coachProfileId] = [...coachProfileIds];

  return {
    coachDisplay: coachDisplaysById.get(coachProfileId),
    coachProfileId,
    status: "matched",
  };
}

function selectClassName(className = "") {
  return [
    "h-11 w-full min-w-0 truncate rounded-md border border-input bg-transparent py-1 pl-3 pr-9 text-sm md:h-9",
    "outline-none transition-colors focus-visible:border-ring",
    "focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
    className,
  ]
    .filter(Boolean)
    .join(" ");
}

function formatServiceDate(value: string) {
  try {
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "short",
      timeZone: "UTC",
      weekday: "short",
    }).format(new Date(`${value}T12:00:00.000Z`));
  } catch {
    return value;
  }
}

function formatWeekRange(weekStart: string, weekEnd: string) {
  return `${formatServiceDate(weekStart)} - ${formatServiceDate(weekEnd)}`;
}

function formatDayNumber(value: string) {
  try {
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      timeZone: "UTC",
    }).format(new Date(`${value}T12:00:00.000Z`));
  } catch {
    return value.slice(-2);
  }
}

function formatWeekdayShort(value: string) {
  try {
    return new Intl.DateTimeFormat("es-ES", {
      timeZone: "UTC",
      weekday: "short",
    }).format(new Date(`${value}T12:00:00.000Z`));
  } catch {
    return value;
  }
}

function formatMonthTitle(value: string) {
  try {
    return new Intl.DateTimeFormat("es-ES", {
      month: "long",
      timeZone: "UTC",
      year: "numeric",
    }).format(new Date(`${value}T12:00:00.000Z`));
  } catch {
    return value.slice(0, 7);
  }
}

function parseDateParts(value: string) {
  const [year, month, day] = value.split("-").map(Number);

  if (!year || !month || !day) {
    throw new Error("Invalid date.");
  }

  return { day, month, year };
}

function toDateString(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getMonthResolution(referenceDate: string) {
  const { month, year } = parseDateParts(referenceDate);
  const monthStartDate = new Date(Date.UTC(year, month - 1, 1));
  const monthEndDate = new Date(Date.UTC(year, month, 0));
  const monthStart = toDateString(monthStartDate);
  const monthEnd = toDateString(monthEndDate);
  const firstDayOfWeek = monthStartDate.getUTCDay();
  const leadingEmptyDays = (firstDayOfWeek + 6) % 7;
  const days = Array.from({ length: monthEndDate.getUTCDate() }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1, index + 1));

    return toDateString(date);
  });

  return {
    days,
    leadingEmptyDays,
    monthEnd,
    monthStart,
  };
}

function formatTime(value: string) {
  return formatTimeForInput(value) || value;
}

function timeToMinutes(value: string) {
  const [hours, minutes] = formatTime(value).split(":").map(Number);

  return hours * 60 + minutes;
}

function getHourSlots(blocks: ScheduleBlockRow[]) {
  if (blocks.length === 0) {
    return Array.from({ length: 15 }, (_, index) => index + 6);
  }

  const minHour = Math.max(
    0,
    Math.min(...blocks.map((block) => Math.floor(timeToMinutes(block.start_time) / 60))) -
      1,
  );
  const maxHour = Math.min(
    23,
    Math.max(...blocks.map((block) => Math.ceil(timeToMinutes(block.end_time) / 60))) +
      1,
  );

  return Array.from({ length: maxHour - minHour + 1 }, (_, index) => minHour + index);
}

function getBlockHour(block: ScheduleBlockRow) {
  return Math.floor(timeToMinutes(block.start_time) / 60);
}

function dedupeBlocks(blocks: ScheduleBlockRow[]) {
  return [...new Map(blocks.map((block) => [block.id, block])).values()];
}

function getBlockCoachSummary({
  assignments,
  coachDisplaysById,
}: {
  assignments: ScheduleBlockAssignmentRow[];
  coachDisplaysById: Map<string, CoachDisplay>;
}) {
  const activeAssignments = assignments.filter(
    (assignment) => assignment.assignment_status === "assigned",
  );

  if (activeAssignments.length === 0) {
    return "Vacante";
  }

  return activeAssignments
    .map(
      (assignment) =>
        coachDisplaysById.get(assignment.coach_profile_id)?.label ??
        `Entrenador ${shortId(assignment.coach_profile_id)}`,
    )
    .join(", ");
}

function getScheduleBasePath({
  day,
  error,
  filters,
  organizationId,
  status,
  view,
  weekStart,
}: {
  day?: string | null;
  error?: string | null;
  filters: ScheduleFilters;
  organizationId: string;
  status?: string | null;
  view?: ScheduleView | null;
  weekStart: string;
}) {
  return getSchedulePath({
    day,
    error,
    organizationId,
    status,
    week: weekStart,
    ...getScheduleFilterPathOptions(filters, view),
  });
}

function getScheduleBlockPanelPath({
  basePath,
  blockId,
}: {
  basePath: string;
  blockId: string;
}) {
  const url = new URL(basePath, "http://boxops.local");
  url.searchParams.set("block_id", blockId);

  return `${url.pathname}${url.search}`;
}

function groupAssignmentsByBlockId(assignments: ScheduleBlockAssignmentRow[]) {
  return assignments.reduce((groups, assignment) => {
    const blockAssignments = groups.get(assignment.schedule_block_id) ?? [];
    blockAssignments.push(assignment);
    groups.set(assignment.schedule_block_id, blockAssignments);

    return groups;
  }, new Map<string, ScheduleBlockAssignmentRow[]>());
}

function groupBlocksByDate(blocks: ScheduleBlockRow[]) {
  return blocks.reduce((groups, block) => {
    const dayBlocks = groups.get(block.service_date) ?? [];
    dayBlocks.push(block);
    groups.set(block.service_date, dayBlocks);

    return groups;
  }, new Map<string, ScheduleBlockRow[]>());
}

function getSafeColor(value: string | null) {
  return value && /^#[0-9a-f]{6}$/i.test(value) ? value : null;
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
  if (
    personProfile &&
    personProfile.status === "active" &&
    personProfile.visibility_status === "visible"
  ) {
    return {
      detail: membership
        ? `Acceso ${membership.status}`
        : "Persona operativa pendiente de cuenta",
      id: coachProfile.id,
      isFallback: false,
      label: personProfile.display_name,
    };
  }

  if (coachProfile.user_id) {
    return {
      detail: `Cuenta sin persona visible (${shortId(coachProfile.user_id)})`,
      id: coachProfile.id,
      isFallback: true,
      label: `Entrenador sin perfil visible ${shortId(coachProfile.id)}`,
    };
  }

  return {
    detail: `Perfil técnico incompleto ${shortId(coachProfile.id)}`,
    id: coachProfile.id,
    isFallback: true,
    label: `Entrenador sin perfil visible ${shortId(coachProfile.id)}`,
  };
}

function buildCoachDisplays({
  coachProfiles,
  memberships,
  personProfiles,
}: {
  coachProfiles: CoachProfileRow[];
  memberships: MembershipStatusRow[];
  personProfiles: PersonProfileRow[];
}) {
  const membershipsByUserId = new Map(
    memberships.map((membership) => [membership.user_id, membership]),
  );
  const personProfilesById = new Map(
    personProfiles.map((personProfile) => [personProfile.id, personProfile]),
  );
  const displays = coachProfiles.map((coachProfile) =>
    getCoachDisplay({
      coachProfile,
      membership: coachProfile.user_id
        ? membershipsByUserId.get(coachProfile.user_id)
        : undefined,
      personProfile: coachProfile.person_profile_id
        ? personProfilesById.get(coachProfile.person_profile_id)
        : undefined,
    }),
  );
  const displaysById = new Map(displays.map((display) => [display.id, display]));
  const allCoaches = [...displays].sort((first, second) =>
    first.label.localeCompare(second.label, "es"),
  );
  const assignableCoaches = coachProfiles
    .flatMap((coachProfile) => {
      if (coachProfile.status !== "active") {
        return [];
      }

      const personProfile = coachProfile.person_profile_id
        ? personProfilesById.get(coachProfile.person_profile_id)
        : undefined;
      const membership = coachProfile.user_id
        ? membershipsByUserId.get(coachProfile.user_id)
        : undefined;

      if (
        coachProfile.person_profile_id &&
        (!personProfile ||
          personProfile.status !== "active" ||
          personProfile.visibility_status !== "visible")
      ) {
        return [];
      }

      if (coachProfile.user_id && membership?.status !== "active") {
        return [];
      }

      if (!coachProfile.user_id && !personProfile) {
        return [];
      }

      return [
        getCoachDisplay({
          coachProfile,
          membership,
          personProfile,
        }),
      ];
    })
    .sort((first, second) => first.label.localeCompare(second.label, "es"));

  return {
    allCoaches,
    assignableCoaches,
    displaysById,
  };
}

function ColorSwatch({ color }: { color: string | null }) {
  const safeColor = getSafeColor(color);

  return (
    <span
      aria-hidden="true"
      className="size-3.5 shrink-0 rounded-full border border-border"
      style={safeColor ? { backgroundColor: safeColor } : undefined}
    />
  );
}

type ScheduleBlockTone =
  | "conflict"
  | "covered"
  | "inactive"
  | "insufficient"
  | "neutral"
  | "pending"
  | "uncovered";

function getScheduleBlockTone({
  block,
  coverage,
}: {
  block: ScheduleBlockRow;
  coverage: ScheduleBlockCoverage;
}): ScheduleBlockTone {
  if (!isCoverageActiveBlock(block.status)) {
    return "inactive";
  }

  if (coverage.state === "conflict") {
    return "conflict";
  }

  if (coverage.state === "uncovered") {
    return "uncovered";
  }

  if (coverage.state === "insufficient") {
    return "insufficient";
  }

  if (
    coverage.absenceImpact.coverageNeededCount > 0 ||
    coverage.absenceImpact.potentialCount > 0
  ) {
    return "pending";
  }

  if (coverage.pendingAssignmentCount > 0) {
    return "pending";
  }

  if (coverage.state === "covered") {
    return "covered";
  }

  return "neutral";
}

function getScheduleBlockToneClasses(tone: ScheduleBlockTone) {
  const classes: Record<ScheduleBlockTone, string> = {
    conflict:
      "border-red-200 bg-red-50 text-red-950 ring-red-200/70 hover:bg-red-100",
    covered:
      "border-emerald-200 bg-emerald-50 text-emerald-950 ring-emerald-200/70 hover:bg-emerald-100",
    inactive:
      "border-border bg-muted/45 text-muted-foreground ring-border hover:bg-muted",
    insufficient:
      "border-amber-200 bg-amber-50 text-amber-950 ring-amber-200/70 hover:bg-amber-100",
    neutral:
      "border-border bg-card text-card-foreground ring-foreground/10 hover:bg-muted/45",
    pending:
      "border-amber-200 bg-amber-50 text-amber-950 ring-amber-200/70 hover:bg-amber-100",
    uncovered:
      "border-destructive/35 bg-destructive/10 text-destructive ring-destructive/20 hover:bg-destructive/15",
  };

  return classes[tone];
}

function getScheduleBlockRailClasses(tone: ScheduleBlockTone) {
  const classes: Record<ScheduleBlockTone, string> = {
    conflict: "bg-red-500",
    covered: "bg-emerald-500",
    inactive: "bg-muted-foreground/40",
    insufficient: "bg-amber-500",
    neutral: "bg-primary/60",
    pending: "bg-amber-500",
    uncovered: "bg-destructive",
  };

  return classes[tone];
}

function getScheduleAbsenceImpactLabel(coverage: ScheduleBlockCoverage) {
  if (coverage.absenceImpact.coverageNeededCount > 0) {
    return "Impacto de ausencia";
  }

  if (coverage.absenceImpact.potentialCount > 0) {
    return "Ausencia en revision";
  }

  return null;
}

function getScheduleBlockToneLabel({
  block,
  coverage,
}: {
  block: ScheduleBlockRow;
  coverage: ScheduleBlockCoverage;
}) {
  if (!isCoverageActiveBlock(block.status)) {
    return getScheduleBlockStatusLabel(block.status);
  }

  if (
    coverage.state === "conflict" ||
    coverage.state === "insufficient" ||
    coverage.state === "uncovered"
  ) {
    return getScheduleCoverageStateLabel(coverage.state);
  }

  const absenceImpactLabel = getScheduleAbsenceImpactLabel(coverage);

  if (absenceImpactLabel) {
    return absenceImpactLabel;
  }

  if (coverage.state === "covered") {
    return getScheduleCoverageStateLabel(coverage.state);
  }

  if (coverage.pendingAssignmentCount > 0) {
    return "Pendiente";
  }

  return getScheduleCoverageStateLabel(coverage.state);
}

function CenterSelect({
  centers,
  defaultValue,
  disabled,
}: {
  centers: CenterRow[];
  defaultValue?: string;
  disabled?: boolean;
}) {
  return (
    <select
      className={selectClassName()}
      defaultValue={defaultValue ?? centers[0]?.id ?? ""}
      disabled={disabled}
      name="centerId"
      required
    >
      {centers.length === 0 ? (
        <option value="">Sin centros activos</option>
      ) : null}
      {centers.map((center) => (
        <option key={center.id} value={center.id}>
          {center.name}
          {center.status === "inactive" ? " (inactivo)" : ""}
        </option>
      ))}
    </select>
  );
}

function ClassTypeSelect({
  classTypes,
  defaultValue,
  disabled,
}: {
  classTypes: ClassTypeRow[];
  defaultValue?: string;
  disabled?: boolean;
}) {
  return (
    <select
      className={selectClassName()}
      defaultValue={defaultValue ?? classTypes[0]?.id ?? ""}
      disabled={disabled}
      name="classTypeId"
      required
    >
      {classTypes.length === 0 ? (
        <option value="">Sin tipos activos</option>
      ) : null}
      {classTypes.map((classType) => (
        <option key={classType.id} value={classType.id}>
          {classType.name}
          {classType.status === "inactive" ? " (inactivo)" : ""}
        </option>
      ))}
    </select>
  );
}

function StatusSelect({
  defaultValue,
  disabled,
}: {
  defaultValue?: string;
  disabled?: boolean;
}) {
  return (
    <select
      className={selectClassName()}
      defaultValue={defaultValue ?? "scheduled"}
      disabled={disabled}
      name="status"
    >
      {SCHEDULE_BLOCK_STATUSES.map((status) => (
        <option key={status} value={status}>
          {getScheduleBlockStatusLabel(status)}
        </option>
      ))}
    </select>
  );
}

function ScheduleBlockFields({
  block,
  centers,
  classTypes,
  disabled,
  weekEnd,
  weekStart,
}: {
  block?: ScheduleBlockRow;
  centers: CenterRow[];
  classTypes: ClassTypeRow[];
  disabled?: boolean;
  weekEnd: string;
  weekStart: string;
}) {
  return (
    <>
      <label className="grid min-w-0 gap-2">
        <span className="text-sm font-medium">Fecha</span>
        <Input
          defaultValue={block?.service_date ?? weekStart}
          disabled={disabled}
          max={weekEnd}
          min={weekStart}
          name="serviceDate"
          required
          type="date"
        />
      </label>

      <label className="grid min-w-0 gap-2">
        <span className="text-sm font-medium">Inicio</span>
        <Input
          defaultValue={block ? formatTimeForInput(block.start_time) : ""}
          disabled={disabled}
          name="startTime"
          required
          type="time"
        />
      </label>

      <label className="grid min-w-0 gap-2">
        <span className="text-sm font-medium">Fin</span>
        <Input
          defaultValue={block ? formatTimeForInput(block.end_time) : ""}
          disabled={disabled}
          name="endTime"
          required
          type="time"
        />
      </label>

      <label className="grid min-w-0 gap-2">
        <span className="text-sm font-medium">Centro</span>
        <CenterSelect
          centers={centers}
          defaultValue={block?.center_id}
          disabled={disabled}
        />
      </label>

      <label className="grid min-w-0 gap-2">
        <span className="text-sm font-medium">Tipo de actividad</span>
        <ClassTypeSelect
          classTypes={classTypes}
          defaultValue={block?.class_type_id}
          disabled={disabled}
        />
      </label>

      <label className="grid min-w-0 gap-2">
        <span className="text-sm font-medium">Entrenadores necesarios</span>
        <Input
          defaultValue={block?.required_coaches ?? 1}
          disabled={disabled}
          max="20"
          min="0"
          name="requiredCoaches"
          required
          type="number"
        />
      </label>

      <label className="grid min-w-0 gap-2">
        <span className="text-sm font-medium">Estado</span>
        <StatusSelect defaultValue={block?.status} disabled={disabled} />
      </label>

      <label className="grid min-w-0 gap-2 lg:col-span-6">
        <span className="text-sm font-medium">Notas</span>
        <Textarea
          defaultValue={block?.notes ?? ""}
          disabled={disabled}
          maxLength={1000}
          name="notes"
          placeholder="Contexto operativo del bloque"
        />
      </label>
    </>
  );
}

function ScheduleCreateForm({
  activeCenters,
  activeClassTypes,
  day,
  filters,
  organizationId,
  view,
  weekEnd,
  weekStart,
}: {
  activeCenters: CenterRow[];
  activeClassTypes: ClassTypeRow[];
  day?: string | null;
  filters: ScheduleFilters;
  organizationId: string;
  view: ScheduleView;
  weekEnd: string;
  weekStart: string;
}) {
  const canCreate = activeCenters.length > 0 && activeClassTypes.length > 0;

  return (
    <details className="group rounded-xl bg-card text-card-foreground ring-1 ring-foreground/10">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-4 outline-none transition-colors hover:bg-muted/45 focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Plus aria-hidden="true" className="size-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold tracking-tight">
              Nuevo bloque
            </span>
            <span className="mt-1 block truncate text-sm text-muted-foreground">
              Clase, open box, evento u otra actividad de la semana.
            </span>
          </span>
        </span>
        <span className="rounded-lg border border-border px-2.5 py-1.5 text-sm font-medium group-open:bg-secondary">
          Crear
        </span>
      </summary>
      <div className="border-t border-border px-4 py-4">
        <form
          action={createScheduleBlock}
          className="grid gap-4 lg:grid-cols-6"
        >
          <input name="organizationId" type="hidden" value={organizationId} />
          <input name="weekStart" type="hidden" value={weekStart} />
          <ScheduleFilterHiddenInputs day={day} filters={filters} view={view} />
          <ScheduleBlockFields
            centers={activeCenters}
            classTypes={activeClassTypes}
            disabled={!canCreate}
            weekEnd={weekEnd}
            weekStart={weekStart}
          />
          <div className="flex items-end lg:col-span-6">
            <Button disabled={!canCreate} type="submit">
              <Plus aria-hidden="true" />
              Crear bloque
            </Button>
          </div>
        </form>

        {!canCreate ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Hace falta al menos un centro activo y un tipo de actividad activo
            antes de crear bloques.
          </p>
        ) : null}
      </div>
    </details>
  );
}

function ScheduleFilterHiddenInputs({
  day,
  filters,
  view,
}: {
  day?: string | null;
  filters: ScheduleFilters;
  view?: ScheduleView;
}) {
  return (
    <>
      {view ? <input name="view" type="hidden" value={view} /> : null}
      {day ? <input name="day" type="hidden" value={day} /> : null}
      {filters.centerId ? (
        <input name="center_id" type="hidden" value={filters.centerId} />
      ) : null}
      {filters.coachProfileId ? (
        <input
          name="coach_profile_id"
          type="hidden"
          value={filters.coachProfileId}
        />
      ) : null}
      {filters.classTypeId ? (
        <input name="class_type_id" type="hidden" value={filters.classTypeId} />
      ) : null}
      {filters.blockStatus ? (
        <input name="block_status" type="hidden" value={filters.blockStatus} />
      ) : null}
      {filters.coverageState ? (
        <input
          name="coverage_state"
          type="hidden"
          value={filters.coverageState}
        />
      ) : null}
      {filters.mineOnly ? <input name="mine" type="hidden" value="1" /> : null}
      {filters.risksOnly ? (
        <input name="risks_only" type="hidden" value="1" />
      ) : null}
    </>
  );
}

function MobileScheduleFilters({
  activeFilterCount,
  allCoaches,
  centers,
  classTypes,
  clearFiltersPath,
  filteredBlockCount,
  filters,
  myScheduleFilter,
  organizationId,
  selectedDay,
  totalBlockCount,
  view,
  weekStart,
}: {
  activeFilterCount: number;
  allCoaches: CoachDisplay[];
  centers: CenterRow[];
  classTypes: ClassTypeRow[];
  clearFiltersPath: string;
  filteredBlockCount: number;
  filters: ScheduleFilters;
  myScheduleFilter: MyScheduleFilterState;
  organizationId: string;
  selectedDay?: string | null;
  totalBlockCount: number;
  view: ScheduleView;
  weekStart: string;
}) {
  return (
    <details className="group rounded-xl bg-card text-card-foreground ring-1 ring-foreground/10 md:hidden">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Filter aria-hidden="true" className="size-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold">Filtros</span>
            <span className="block truncate text-xs text-muted-foreground">
              {filteredBlockCount}/{totalBlockCount} visibles
            </span>
          </span>
        </span>
        <span className="shrink-0 rounded-full border border-border px-2.5 py-1 text-xs font-medium">
          {activeFilterCount > 0 ? `${activeFilterCount} activos` : "Editar"}
        </span>
      </summary>

      <div className="border-t border-border px-4 py-4">
        <form action="/app/schedule" className="grid gap-3" method="get">
          <input name="organizationId" type="hidden" value={organizationId} />
          <input name="week" type="hidden" value={weekStart} />
          <input name="view" type="hidden" value={view} />
          {selectedDay ? (
            <input name="day" type="hidden" value={selectedDay} />
          ) : null}

          <label className="grid min-w-0 gap-2">
            <span className="text-sm font-medium">Centro</span>
            <select
              className={selectClassName("rounded-lg md:h-10")}
              defaultValue={filters.centerId ?? ""}
              name="center_id"
            >
              <option value="">Todos</option>
              {centers.map((center) => (
                <option key={center.id} value={center.id}>
                  {center.name}
                  {center.status === "inactive" ? " (inactivo)" : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="grid min-w-0 gap-2">
            <span className="text-sm font-medium">Entrenador</span>
            <select
              className={selectClassName("rounded-lg md:h-10")}
              defaultValue={filters.coachProfileId ?? ""}
              name="coach_profile_id"
            >
              <option value="">Todos</option>
              {allCoaches.map((coach) => (
                <option key={coach.id} value={coach.id}>
                  {coach.label}
                  {coach.isFallback ? " (fallback técnico)" : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="grid min-w-0 gap-2">
            <span className="text-sm font-medium">Actividad</span>
            <select
              className={selectClassName("rounded-lg md:h-10")}
              defaultValue={filters.classTypeId ?? ""}
              name="class_type_id"
            >
              <option value="">Todas</option>
              {classTypes.map((classType) => (
                <option key={classType.id} value={classType.id}>
                  {classType.name}
                  {classType.status === "inactive" ? " (inactivo)" : ""}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="grid min-w-0 gap-2">
              <span className="text-sm font-medium">Estado</span>
              <select
                className={selectClassName("rounded-lg md:h-10")}
                defaultValue={filters.blockStatus ?? ""}
                name="block_status"
              >
                <option value="">Todos</option>
                {SCHEDULE_BLOCK_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {getScheduleBlockStatusLabel(status)}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid min-w-0 gap-2">
              <span className="text-sm font-medium">Cobertura</span>
              <select
                className={selectClassName("rounded-lg md:h-10")}
                defaultValue={filters.coverageState ?? ""}
                name="coverage_state"
              >
                <option value="">Todas</option>
                {SCHEDULE_FILTER_COVERAGE_STATES.map((state) => (
                  <option key={state} value={state}>
                    {getScheduleCoverageStateLabel(state)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="flex min-h-11 items-center gap-2 rounded-lg border border-input px-3 py-2 text-sm">
              <input
                className="size-4 accent-primary"
                defaultChecked={filters.risksOnly}
                name="risks_only"
                type="checkbox"
                value="1"
              />
              <span>Riesgos</span>
            </label>

            <label className="flex min-h-11 items-center gap-2 rounded-lg border border-input px-3 py-2 text-sm">
              <input
                className="size-4 accent-primary"
                defaultChecked={filters.mineOnly}
                name="mine"
                type="checkbox"
                value="1"
              />
              <span>Mi horario</span>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button className="min-h-11 w-full md:min-h-10" type="submit">
              <Filter aria-hidden="true" />
              Aplicar
            </Button>
            <Button asChild className="min-h-11 w-full md:min-h-10" variant="outline">
              <Link href={clearFiltersPath}>
                <RotateCcw aria-hidden="true" />
                Limpiar
              </Link>
            </Button>
          </div>
        </form>

        {filters.mineOnly ? (
          <p className="mt-3 text-sm text-muted-foreground">
            {getMyScheduleFilterDescription(myScheduleFilter)}
          </p>
        ) : null}
      </div>
    </details>
  );
}

function ScheduleFiltersCard({
  allCoaches,
  centers,
  classTypes,
  filteredBlockCount,
  filters,
  myScheduleFilter,
  organizationId,
  selectedDay,
  totalBlockCount,
  view,
  weekStart,
}: {
  allCoaches: CoachDisplay[];
  centers: CenterRow[];
  classTypes: ClassTypeRow[];
  filteredBlockCount: number;
  filters: ScheduleFilters;
  myScheduleFilter: MyScheduleFilterState;
  organizationId: string;
  selectedDay?: string | null;
  totalBlockCount: number;
  view: ScheduleView;
  weekStart: string;
}) {
  const activeFilterCount = getActiveFilterCount(filters);
  const clearFiltersPath = getSchedulePath({
    day: selectedDay,
    organizationId,
    view,
    week: weekStart,
  });

  return (
    <>
      <MobileScheduleFilters
        activeFilterCount={activeFilterCount}
        allCoaches={allCoaches}
        centers={centers}
        classTypes={classTypes}
        clearFiltersPath={clearFiltersPath}
        filteredBlockCount={filteredBlockCount}
        filters={filters}
        myScheduleFilter={myScheduleFilter}
        organizationId={organizationId}
        selectedDay={selectedDay}
        totalBlockCount={totalBlockCount}
        view={view}
        weekStart={weekStart}
      />

      <Card className="hidden md:flex">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <Filter aria-hidden="true" className="size-4" />
              Filtros operativos
            </CardTitle>
            <CardDescription>
              {filteredBlockCount} de {totalBlockCount} bloque
              {totalBlockCount === 1 ? "" : "s"} visibles en la vista.
            </CardDescription>
          </div>
          {activeFilterCount > 0 ? (
            <Badge variant="outline">
              {activeFilterCount} filtro{activeFilterCount === 1 ? "" : "s"}
            </Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        <form
          action="/app/schedule"
          className="grid gap-3 md:grid-cols-2 xl:grid-cols-7"
          method="get"
        >
          <input name="organizationId" type="hidden" value={organizationId} />
          <input name="week" type="hidden" value={weekStart} />
          <input name="view" type="hidden" value={view} />
          {selectedDay ? (
            <input name="day" type="hidden" value={selectedDay} />
          ) : null}

          <label className="grid min-w-0 gap-2">
            <span className="text-sm font-medium">Centro</span>
            <select
              className={selectClassName()}
              defaultValue={filters.centerId ?? ""}
              name="center_id"
            >
              <option value="">Todos</option>
              {centers.map((center) => (
                <option key={center.id} value={center.id}>
                  {center.name}
                  {center.status === "inactive" ? " (inactivo)" : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="grid min-w-0 gap-2">
            <span className="text-sm font-medium">Entrenador</span>
            <select
              className={selectClassName()}
              defaultValue={filters.coachProfileId ?? ""}
              name="coach_profile_id"
            >
              <option value="">Todos</option>
              {allCoaches.map((coach) => (
                <option key={coach.id} value={coach.id}>
                  {coach.label}
                  {coach.isFallback ? " (fallback técnico)" : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="grid min-w-0 gap-2">
            <span className="text-sm font-medium">Actividad</span>
            <select
              className={selectClassName()}
              defaultValue={filters.classTypeId ?? ""}
              name="class_type_id"
            >
              <option value="">Todas</option>
              {classTypes.map((classType) => (
                <option key={classType.id} value={classType.id}>
                  {classType.name}
                  {classType.status === "inactive" ? " (inactivo)" : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="grid min-w-0 gap-2">
            <span className="text-sm font-medium">Estado</span>
            <select
              className={selectClassName()}
              defaultValue={filters.blockStatus ?? ""}
              name="block_status"
            >
              <option value="">Todos</option>
              {SCHEDULE_BLOCK_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {getScheduleBlockStatusLabel(status)}
                </option>
              ))}
            </select>
          </label>

          <label className="grid min-w-0 gap-2">
            <span className="text-sm font-medium">Cobertura</span>
            <select
              className={selectClassName()}
              defaultValue={filters.coverageState ?? ""}
              name="coverage_state"
            >
              <option value="">Todas</option>
              {SCHEDULE_FILTER_COVERAGE_STATES.map((state) => (
                <option key={state} value={state}>
                  {getScheduleCoverageStateLabel(state)}
                </option>
              ))}
            </select>
          </label>

          <label className="flex min-h-11 items-center gap-2 self-end rounded-md border border-input px-3 py-2 text-sm md:min-h-9">
            <input
              className="size-4 accent-primary"
              defaultChecked={filters.risksOnly}
              name="risks_only"
              type="checkbox"
              value="1"
            />
            <span>Solo riesgos</span>
          </label>

          <label className="flex min-h-11 items-center gap-2 self-end rounded-md border border-input px-3 py-2 text-sm md:min-h-9">
            <input
              className="size-4 accent-primary"
              defaultChecked={filters.mineOnly}
              name="mine"
              type="checkbox"
              value="1"
            />
            <span>Mi horario</span>
          </label>

          <div className="flex flex-wrap items-end gap-2 md:col-span-2 xl:col-span-7">
            <Button type="submit">
              <Filter aria-hidden="true" />
              Aplicar filtros
            </Button>
            <Button asChild variant="outline">
              <Link href={clearFiltersPath}>
                <RotateCcw aria-hidden="true" />
                Limpiar filtros
              </Link>
            </Button>
          </div>
        </form>

        {filters.mineOnly ? (
          <p className="mt-3 text-sm text-muted-foreground">
            {getMyScheduleFilterDescription(myScheduleFilter)}
          </p>
        ) : null}
      </CardContent>
      </Card>
    </>
  );
}

function getMyScheduleFilterDescription(
  myScheduleFilter: MyScheduleFilterState,
) {
  if (myScheduleFilter.status === "matched") {
    const label =
      myScheduleFilter.coachDisplay?.label ??
      `Entrenador ${shortId(myScheduleFilter.coachProfileId)}`;

    return `Mi horario usa la ficha de ${label} y solo muestra bloques asignados.`;
  }

  if (myScheduleFilter.status === "ambiguous") {
    return `Mi horario encontró ${myScheduleFilter.profileCount} fichas de entrenador vinculadas a tu usuario. No se elige una automáticamente.`;
  }

  if (myScheduleFilter.status === "missing") {
    return "Mi horario no encontró una ficha de entrenador vinculada a tu usuario.";
  }

  return "Mi horario está desactivado.";
}

function MyScheduleEmptyCard({
  myScheduleFilter,
  organizationId,
  weekStart,
}: {
  myScheduleFilter: MyScheduleFilterState;
  organizationId: string;
  weekStart: string;
}) {
  let description =
    "La semana no tiene bloques asignados a tu perfil con estado Asignado, o la combinación actual de filtros no devuelve resultados.";
  let title = "No hay clases en Mi horario esta semana";

  if (myScheduleFilter.status === "missing") {
    title = "No hay ficha de entrenador vinculada";
    description =
      "Tu usuario tiene acceso, pero todavía no tiene una ficha de entrenador asociada. Propietario o Administrador deben vincular tu persona antes de usar Mi horario.";
  } else if (myScheduleFilter.status === "ambiguous") {
    title = "Mi horario necesita una revisión de perfiles";
    description = `Tu usuario aparece vinculado a ${myScheduleFilter.profileCount} fichas de entrenador. Por seguridad no se elige una automáticamente.`;
  } else if (myScheduleFilter.status === "matched") {
    const label =
      myScheduleFilter.coachDisplay?.label ??
      `Entrenador ${shortId(myScheduleFilter.coachProfileId)}`;

    description = `No hay bloques asignados a ${label} con estado Asignado dentro de la semana y filtros actuales.`;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild variant="outline">
          <Link
            href={getSchedulePath({
              organizationId,
              week: weekStart,
            })}
          >
            <RotateCcw aria-hidden="true" />
            Limpiar filtros
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function WeekControls({
  currentWeekStart,
  filters,
  organizationId,
  view,
  weekEnd,
  weekStart,
}: {
  currentWeekStart: string;
  filters: ScheduleFilters;
  organizationId: string;
  view: ScheduleView;
  weekEnd: string;
  weekStart: string;
}) {
  const previousWeek = getAdjacentWeekStart(weekStart, -1);
  const nextWeek = getAdjacentWeekStart(weekStart, 1);
  const filterPathOptions = getScheduleFilterPathOptions(filters, view);
  const weekLabel = formatWeekRange(weekStart, weekEnd);

  return (
    <div className="sticky top-3 z-30 rounded-xl border border-border/70 bg-background/95 p-2 shadow-sm backdrop-blur md:top-4 md:p-3">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-2 px-1 md:px-0">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <CalendarDays aria-hidden="true" className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">Semana</p>
            <p className="truncate text-sm font-semibold text-foreground">
              {weekLabel}
            </p>
          </div>
        </div>

        <div className="grid gap-2 md:grid-cols-[minmax(220px,260px)_auto] lg:min-w-[560px] lg:grid-cols-[minmax(220px,260px)_auto_auto] lg:items-end">
          <form
            action="/app/schedule"
            className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 md:contents"
            method="get"
          >
            <input name="organizationId" type="hidden" value={organizationId} />
            <ScheduleFilterHiddenInputs filters={filters} view={view} />
            <label className="grid gap-1 md:gap-2">
              <span className="sr-only md:not-sr-only md:text-sm md:font-medium">
                Semana
              </span>
              <Input
                aria-label="Semana"
                className="h-11 rounded-lg md:h-10"
                defaultValue={weekStart}
                name="week"
                type="date"
              />
            </label>
            <Button className="min-h-11 md:min-h-10" type="submit">
              Ver
              <span className="hidden md:inline"> semana</span>
            </Button>
          </form>

          <nav
            aria-label="Navegación semanal"
            className="grid grid-cols-3 gap-2 md:col-span-2 lg:col-span-1"
          >
            <Button
              asChild
              className="min-h-11 min-w-0 px-2 text-xs sm:text-sm md:min-h-10 md:px-2.5"
              variant="outline"
            >
              <Link
                href={getSchedulePath({
                  organizationId,
                  week: previousWeek,
                  ...filterPathOptions,
                })}
              >
                <ArrowLeft aria-hidden="true" />
                Anterior
              </Link>
            </Button>
            <Button
              asChild
              className="min-h-11 min-w-0 px-2 text-xs sm:text-sm md:min-h-10 md:px-2.5"
              variant="outline"
            >
              <Link
                href={getSchedulePath({
                  organizationId,
                  week: currentWeekStart,
                  ...filterPathOptions,
                })}
              >
                Hoy
              </Link>
            </Button>
            <Button
              asChild
              className="min-h-11 min-w-0 px-2 text-xs sm:text-sm md:min-h-10 md:px-2.5"
              variant="outline"
            >
              <Link
                href={getSchedulePath({
                  organizationId,
                  week: nextWeek,
                  ...filterPathOptions,
                })}
              >
                Siguiente
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          </nav>
        </div>
      </div>
    </div>
  );
}

function ScheduleViewTabs({
  filters,
  organizationId,
  view,
  weekStart,
}: {
  filters: ScheduleFilters;
  organizationId: string;
  view: ScheduleView;
  weekStart: string;
}) {
  return (
    <div className="grid grid-cols-3 gap-1 rounded-2xl bg-muted p-1 md:rounded-xl">
      {scheduleViews.map((item) => {
        const Icon = item.icon;
        const active = view === item.value;

        return (
          <Button
            asChild
            className="min-h-11 min-w-0 md:min-h-0"
            key={item.value}
            variant={active ? "secondary" : "ghost"}
          >
            <Link
              aria-current={active ? "page" : undefined}
              href={getSchedulePath({
                organizationId,
                week: weekStart,
                ...getScheduleFilterPathOptions(filters, item.value),
              })}
            >
              <Icon aria-hidden="true" className="size-4" />
              <span className="truncate">{item.label}</span>
            </Link>
          </Button>
        );
      })}
    </div>
  );
}

function getDayCoverageDotClass({
  blocks,
  coverageByBlock,
}: {
  blocks: ScheduleBlockRow[];
  coverageByBlock: Map<string, ScheduleBlockCoverage>;
}) {
  if (blocks.length === 0) {
    return "bg-muted-foreground/40";
  }

  const coverages = blocks
    .map((block) => coverageByBlock.get(block.id))
    .filter((coverage): coverage is ScheduleBlockCoverage => Boolean(coverage));

  if (
    coverages.some(
      (coverage) =>
        coverage.state === "conflict" || coverage.state === "uncovered",
    )
  ) {
    return "bg-destructive";
  }

  if (
    coverages.some(
      (coverage) =>
        coverage.state === "insufficient" ||
        coverage.absenceImpact.coverageNeededCount > 0 ||
        coverage.absenceImpact.potentialCount > 0 ||
        coverage.pendingAssignmentCount > 0,
    )
  ) {
    return "bg-amber-500";
  }

  return "bg-emerald-500";
}

function MobileWeekDayPicker({
  blocks,
  coverageByBlock,
  days,
  filters,
  organizationId,
  selectedDay,
  weekStart,
}: {
  blocks: ScheduleBlockRow[];
  coverageByBlock: Map<string, ScheduleBlockCoverage>;
  days: string[];
  filters: ScheduleFilters;
  organizationId: string;
  selectedDay: string;
  weekStart: string;
}) {
  const blocksByDate = groupBlocksByDate(blocks);

  return (
    <div className="md:hidden">
      <div className="overflow-hidden pb-1">
        <div className="grid grid-cols-7 gap-1.5">
          {days.map((day, index) => {
            const dayBlocks = blocksByDate.get(day) ?? [];
            const active = day === selectedDay;

            return (
              <Link
                aria-current={active ? "date" : undefined}
                aria-label={`${formatServiceDate(day)}. ${
                  dayBlocks.length
                } bloque${dayBlocks.length === 1 ? "" : "s"}`}
                className={[
                  "flex h-16 min-w-0 flex-col items-center justify-center gap-1 rounded-xl border text-center transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  active
                    ? "border-primary/60 bg-primary/15 text-primary shadow-sm ring-1 ring-primary/20"
                    : "border-border bg-card text-foreground hover:bg-muted/45",
                ].join(" ")}
                href={getSchedulePath({
                  day,
                  organizationId,
                  week: weekStart,
                  ...getScheduleFilterPathOptions(filters, "week"),
                })}
                key={day}
                scroll={false}
              >
                <span className="text-sm font-semibold">
                  {mobileWeekdayLabels[index] ?? formatWeekdayShort(day).slice(0, 1)}
                </span>
                <span className="font-mono text-lg font-semibold leading-none">
                  {formatDayNumber(day)}
                </span>
                <span
                  aria-hidden="true"
                  className={[
                    "size-2 rounded-full",
                    getDayCoverageDotClass({ blocks: dayBlocks, coverageByBlock }),
                  ].join(" ")}
                />
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ScheduleBlockSummaryLink({
  assignments,
  basePath,
  block,
  center,
  classType,
  coachDisplaysById,
  compact = false,
  coverage,
}: {
  assignments: ScheduleBlockAssignmentRow[];
  basePath: string;
  block: ScheduleBlockRow;
  center?: CenterRow;
  classType?: ClassTypeRow;
  coachDisplaysById: Map<string, CoachDisplay>;
  compact?: boolean;
  coverage: ScheduleBlockCoverage;
}) {
  const tone = getScheduleBlockTone({ block, coverage });
  const coachSummary = getBlockCoachSummary({ assignments, coachDisplaysById });
  const stateLabel = getScheduleBlockToneLabel({ block, coverage });
  const absenceImpactLabel = getScheduleAbsenceImpactLabel(coverage);

  return (
    <RouteStateButton
      className={[
        "group relative flex min-h-[76px] min-w-0 flex-col justify-between gap-2 overflow-hidden rounded-xl border p-3 text-left text-sm ring-1 transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:min-h-24 md:rounded-lg",
        compact ? "md:min-h-20 md:p-2.5" : "",
        getScheduleBlockToneClasses(tone),
      ].join(" ")}
      data-operational-detail-trigger="schedule-block"
      href={getScheduleBlockPanelPath({
        basePath,
        blockId: block.id,
      })}
    >
      <span
        aria-hidden="true"
        className={[
          "absolute inset-y-2 left-2 w-1 rounded-full",
          getScheduleBlockRailClasses(tone),
        ].join(" ")}
      />
      <span className="flex min-w-0 flex-col gap-2 pl-3">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-xs font-semibold tabular-nums">
            {formatTime(block.start_time)}-{formatTime(block.end_time)}
          </span>
          <span className="rounded-full bg-background/70 px-2 py-0.5 text-[11px] font-medium">
            {stateLabel}
          </span>
          {absenceImpactLabel && absenceImpactLabel !== stateLabel ? (
            <span className="rounded-full bg-background/70 px-2 py-0.5 text-[11px] font-medium">
              {absenceImpactLabel}
            </span>
          ) : null}
          {block.is_template_exception ? (
            <span className="rounded-full bg-background/70 px-2 py-0.5 text-[11px] font-medium">
              Cambiado
            </span>
          ) : null}
        </span>
        <span className="min-w-0">
          <span className="block truncate font-semibold tracking-tight">
            {classType?.name ?? "Actividad"}
          </span>
          <span className="mt-1 flex min-w-0 items-center gap-1.5 text-xs opacity-80">
            <ColorSwatch color={classType?.color ?? null} />
            <span className="truncate">
              {center?.name ?? "Centro no disponible"}
            </span>
          </span>
        </span>
      </span>
      <span className="flex min-w-0 items-center justify-between gap-2 pl-3 text-xs opacity-80">
        <span className="truncate">{coachSummary}</span>
        <PanelRightOpen
          aria-hidden="true"
          className="size-3.5 shrink-0 opacity-60 transition-opacity group-hover:opacity-100"
        />
      </span>
    </RouteStateButton>
  );
}

function BlocksByDay({
  assignments,
  basePath,
  blocks,
  centers,
  classTypes,
  coachDisplaysById,
  coverageByBlock,
  days,
}: {
  assignments: ScheduleBlockAssignmentRow[];
  basePath: string;
  blocks: ScheduleBlockRow[];
  centers: CenterRow[];
  classTypes: ClassTypeRow[];
  coachDisplaysById: Map<string, CoachDisplay>;
  coverageByBlock: Map<string, ScheduleBlockCoverage>;
  days: string[];
}) {
  const centersById = new Map(centers.map((center) => [center.id, center]));
  const classTypesById = new Map(
    classTypes.map((classType) => [classType.id, classType]),
  );
  const groupedBlocks = groupBlocksByDate(blocks);
  const assignmentsByBlockId = groupAssignmentsByBlockId(assignments);

  return (
    <div className="space-y-5">
      {days.map((serviceDate) => {
        const dayBlocks = groupedBlocks.get(serviceDate) ?? [];

        return (
        <section className="space-y-3" key={serviceDate}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted font-mono text-sm font-semibold">
                {formatDayNumber(serviceDate)}
              </span>
              <div>
                <h3 className="text-base font-semibold tracking-tight">
                  {formatServiceDate(serviceDate)}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {dayBlocks.length === 0
                    ? "Sin bloques programados"
                    : `${dayBlocks.length} bloque${
                        dayBlocks.length === 1 ? "" : "s"
                      }`}
                </p>
              </div>
            </div>
            <Badge variant="outline">
              {dayBlocks.length} bloque{dayBlocks.length === 1 ? "" : "s"}
            </Badge>
          </div>
          {dayBlocks.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-background/60 px-4 py-5 text-sm text-muted-foreground">
              No hay clases ni bloques en este día.
            </div>
          ) : (
            <div className="grid gap-3">
              {dayBlocks.map((block) => {
              const coverage = coverageByBlock.get(block.id);

              if (!coverage) {
                throw new Error("Missing coverage state for schedule block.");
              }

              return (
                <ScheduleBlockSummaryLink
                  assignments={assignmentsByBlockId.get(block.id) ?? []}
                  basePath={basePath}
                  block={block}
                  center={centersById.get(block.center_id)}
                  classType={classTypesById.get(block.class_type_id)}
                  coachDisplaysById={coachDisplaysById}
                  coverage={coverage}
                  key={block.id}
                />
              );
              })}
            </div>
          )}
        </section>
        );
      })}
    </div>
  );
}

function MobileWeeklyDayView({
  assignments,
  basePath,
  blocks,
  centers,
  classTypes,
  coachDisplaysById,
  coverageByBlock,
  selectedDay,
}: {
  assignments: ScheduleBlockAssignmentRow[];
  basePath: string;
  blocks: ScheduleBlockRow[];
  centers: CenterRow[];
  classTypes: ClassTypeRow[];
  coachDisplaysById: Map<string, CoachDisplay>;
  coverageByBlock: Map<string, ScheduleBlockCoverage>;
  selectedDay: string;
}) {
  const centersById = new Map(centers.map((center) => [center.id, center]));
  const classTypesById = new Map(
    classTypes.map((classType) => [classType.id, classType]),
  );
  const assignmentsByBlockId = groupAssignmentsByBlockId(assignments);
  const dayBlocks = blocks.filter((block) => block.service_date === selectedDay);

  return (
    <div className="space-y-3 md:hidden">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold tracking-tight">
          {formatServiceDate(selectedDay)}
        </h2>
        <Badge variant="outline">
          {dayBlocks.length} bloque{dayBlocks.length === 1 ? "" : "s"}
        </Badge>
      </div>

      {dayBlocks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-background/60 px-4 py-6 text-sm text-muted-foreground">
          No hay clases ni bloques visibles en este día.
        </div>
      ) : (
        <div className="grid gap-3">
          {dayBlocks.map((block) => {
            const coverage = coverageByBlock.get(block.id);

            if (!coverage) {
              throw new Error("Missing coverage state for schedule block.");
            }

            return (
              <ScheduleBlockSummaryLink
                assignments={assignmentsByBlockId.get(block.id) ?? []}
                basePath={basePath}
                block={block}
                center={centersById.get(block.center_id)}
                classType={classTypesById.get(block.class_type_id)}
                coachDisplaysById={coachDisplaysById}
                coverage={coverage}
                key={block.id}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function WeeklyScheduleView({
  assignments,
  basePath,
  blocks,
  centers,
  classTypes,
  coachDisplaysById,
  coverageByBlock,
  days,
  selectedDay,
}: {
  assignments: ScheduleBlockAssignmentRow[];
  basePath: string;
  blocks: ScheduleBlockRow[];
  centers: CenterRow[];
  classTypes: ClassTypeRow[];
  coachDisplaysById: Map<string, CoachDisplay>;
  coverageByBlock: Map<string, ScheduleBlockCoverage>;
  days: string[];
  selectedDay: string;
}) {
  const centersById = new Map(centers.map((center) => [center.id, center]));
  const classTypesById = new Map(
    classTypes.map((classType) => [classType.id, classType]),
  );
  const assignmentsByBlockId = groupAssignmentsByBlockId(assignments);
  const blocksByDate = groupBlocksByDate(blocks);
  const hourSlots = getHourSlots(blocks);

  return (
    <>
      <MobileWeeklyDayView
        assignments={assignments}
        basePath={basePath}
        blocks={blocks}
        centers={centers}
        classTypes={classTypes}
        coachDisplaysById={coachDisplaysById}
        coverageByBlock={coverageByBlock}
        selectedDay={selectedDay}
      />

      <div className="hidden md:block xl:hidden">
        <BlocksByDay
          assignments={assignments}
          basePath={basePath}
          blocks={blocks}
          centers={centers}
          classTypes={classTypes}
          coachDisplaysById={coachDisplaysById}
          coverageByBlock={coverageByBlock}
          days={days}
        />
      </div>

      <Card className="hidden overflow-x-auto bg-background xl:block">
        <CardContent className="min-w-[1040px] p-0">
          <div className="grid grid-cols-[72px_repeat(7,minmax(0,1fr))] border-b border-border">
            <div className="border-r border-border bg-muted/45 px-3 py-3 text-xs font-medium text-muted-foreground">
              Hora
            </div>
            {days.map((day) => (
              <div
                className="border-r border-border px-3 py-3 last:border-r-0"
                key={day}
              >
                <p className="text-xs font-medium uppercase text-muted-foreground">
                  {formatWeekdayShort(day)}
                </p>
                <p className="mt-1 font-mono text-lg font-semibold">
                  {formatDayNumber(day)}
                </p>
              </div>
            ))}
          </div>

          {hourSlots.map((hour) => (
            <div
              className="grid min-h-32 grid-cols-[72px_repeat(7,minmax(0,1fr))] border-b border-border last:border-b-0"
              key={hour}
            >
              <div className="border-r border-border bg-muted/30 px-3 py-3 font-mono text-xs text-muted-foreground">
                {String(hour).padStart(2, "0")}:00
              </div>
              {days.map((day) => {
                const dayBlocks = blocksByDate.get(day) ?? [];
                const slotBlocks = dayBlocks.filter(
                  (block) => getBlockHour(block) === hour,
                );

                return (
                  <div
                    className="min-w-0 border-r border-border/80 p-2 last:border-r-0"
                    key={`${day}-${hour}`}
                  >
                    {slotBlocks.length === 0 ? (
                      <div className="h-full rounded-md border border-dashed border-border/70" />
                    ) : (
                      <div className="grid gap-2">
                        {slotBlocks.map((block) => {
                          const coverage = coverageByBlock.get(block.id);

                          if (!coverage) {
                            throw new Error(
                              "Missing coverage state for schedule block.",
                            );
                          }

                          return (
                            <ScheduleBlockSummaryLink
                              assignments={
                                assignmentsByBlockId.get(block.id) ?? []
                              }
                              basePath={basePath}
                              block={block}
                              center={centersById.get(block.center_id)}
                              classType={classTypesById.get(block.class_type_id)}
                              coachDisplaysById={coachDisplaysById}
                              compact
                              coverage={coverage}
                              key={block.id}
                            />
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}

function MonthlyScheduleView({
  blocks,
  centers,
  classTypes,
  coverageByBlock,
  filters,
  month,
  organizationId,
}: {
  blocks: ScheduleBlockRow[];
  centers: CenterRow[];
  classTypes: ClassTypeRow[];
  coverageByBlock: Map<string, ScheduleBlockCoverage>;
  filters: ScheduleFilters;
  month: ReturnType<typeof getMonthResolution>;
  organizationId: string;
}) {
  const centersById = new Map(centers.map((center) => [center.id, center]));
  const classTypesById = new Map(
    classTypes.map((classType) => [classType.id, classType]),
  );
  const blocksByDate = groupBlocksByDate(blocks);
  const emptyCells = Array.from({ length: month.leadingEmptyDays });

  return (
    <Card className="bg-background">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="capitalize">
              {formatMonthTitle(month.monthStart)}
            </CardTitle>
            <CardDescription>
              Overview de riesgos, eventos y días con actividad.
            </CardDescription>
          </div>
          <Badge variant="outline">{blocks.length} bloques visibles</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted-foreground">
          {["L", "M", "X", "J", "V", "S", "D"].map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {emptyCells.map((_, index) => (
            <div
              aria-hidden="true"
              className="min-h-24 rounded-lg bg-muted/35"
              key={`empty-${index}`}
            />
          ))}
          {month.days.map((day) => {
            const dayBlocks = blocksByDate.get(day) ?? [];
            const dayRisks = dayBlocks.filter((block) => {
              const coverage = coverageByBlock.get(block.id);

              return coverage ? isScheduleCoverageRisk(coverage) : false;
            });
            const hasEvent = dayBlocks.some((block) => {
              const classType = classTypesById.get(block.class_type_id);

              return classType?.category === "event" || classType?.category === "competition";
            });
            const hasHoliday = dayBlocks.some((block) => {
              const classType = classTypesById.get(block.class_type_id);

              return classType?.category === "holiday";
            });
            const hasChange = dayBlocks.some(
              (block) => block.is_template_exception || block.status === "changed",
            );
            const firstCenter = dayBlocks[0]
              ? centersById.get(dayBlocks[0].center_id)
              : undefined;

            return (
              <Link
                className={[
                  "flex min-h-14 min-w-0 flex-col justify-between rounded-xl border border-border bg-card p-1.5 text-left transition-colors hover:bg-muted/45 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:min-h-24 md:rounded-lg md:p-2",
                  dayRisks.length > 0 ? "border-destructive/40 bg-destructive/10" : "",
                ].join(" ")}
                href={getSchedulePath({
                  day,
                  organizationId,
                  week: day,
                  ...getScheduleFilterPathOptions(filters, "week"),
                })}
                key={day}
              >
                <span className="flex items-start justify-between gap-1">
                  <span className="font-mono text-sm font-semibold">
                    {formatDayNumber(day)}
                  </span>
                  {dayRisks.length > 0 ? (
                    <span className="size-1.5 rounded-full bg-destructive md:size-auto md:px-1.5 md:py-0.5 md:text-[10px] md:font-medium md:text-destructive">
                      <span className="hidden md:inline">
                      Riesgo
                      </span>
                    </span>
                  ) : null}
                </span>
                <span className="hidden gap-1 md:grid">
                  {dayBlocks.length > 0 ? (
                    <span className="truncate text-xs font-medium">
                      {dayBlocks.length} bloque{dayBlocks.length === 1 ? "" : "s"}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">Libre</span>
                  )}
                  <span className="flex flex-wrap gap-1">
                    {hasHoliday ? (
                      <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                        Festivo
                      </span>
                    ) : null}
                    {hasEvent ? (
                      <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-secondary-foreground">
                        Evento
                      </span>
                    ) : null}
                    {hasChange ? (
                      <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                        Cambio
                      </span>
                    ) : null}
                  </span>
                  {firstCenter ? (
                    <span className="truncate text-[11px] text-muted-foreground">
                      {firstCenter.name}
                    </span>
                  ) : null}
                </span>
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export default async function SchedulePage({ searchParams }: SchedulePageProps) {
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect(getLoginPath("/app/schedule"));
  }

  const params = await searchParams;
  const organizationId = getParam(params.organizationId);
  const status = getParam(params.status);
  const error = getParam(params.error);
  const weekParam = getParam(params.week);
  const selectedBlockIdParam = getParam(params.block_id);
  const selectedBlockId =
    selectedBlockIdParam && isScheduleUuid(selectedBlockIdParam)
      ? selectedBlockIdParam
      : null;
  const scheduleView = resolveScheduleView(params.view);
  const explicitScheduleView = resolveExplicitScheduleView(params.view);
  const memberships = await getActiveMemberships(user.id);
  const resolution = resolveActiveOrganization(memberships, organizationId);

  if (!resolution.ok) {
    return (
      <div className="space-y-6">
        <PageHeader />
        <OrganizationResolutionState
          basePath="/app/schedule"
          resolution={resolution}
        />
      </div>
    );
  }

  const week = resolveWeek(weekParam, resolution.organization.timezone);
  const selectedDay = resolveSelectedScheduleDay(params.day, week.days);
  const currentWeek = resolveWeek(undefined, resolution.organization.timezone);
  const month = getMonthResolution(week.weekStart);
  const canManageSchedule = canManageOperationalData(
    resolution.membership.role,
  );
  const canReviewAbsenceImpact = canManageAbsenceRequests(
    resolution.membership.role,
  );

  if (canManageSchedule) {
    const supabase = await createClient();
    await ensureActiveScheduleTemplatesForWindow({
      organizationId: resolution.organization.id,
      supabase,
      timezone: resolution.organization.timezone,
      windowEnd: scheduleView === "month" ? month.monthEnd : week.weekEnd,
      windowStart: scheduleView === "month" ? month.monthStart : week.weekStart,
    });
  }

  const [blocks, monthBlocks, centers, classTypes, coachContext] =
    await Promise.all([
    getScheduleBlocks({
      organizationId: resolution.organization.id,
      weekEnd: week.weekEnd,
      weekStart: week.weekStart,
    }),
    scheduleView === "month"
      ? getScheduleBlocks({
          organizationId: resolution.organization.id,
          weekEnd: month.monthEnd,
          weekStart: month.monthStart,
        })
      : Promise.resolve<ScheduleBlockRow[]>([]),
    getCenters(resolution.organization.id),
    getClassTypes(resolution.organization.id),
    getScheduleCoachContext(resolution.organization.id),
  ]);
  const coverageBlocks = dedupeBlocks([...blocks, ...monthBlocks]);
  const assignments = await getScheduleBlockAssignments({
    blockIds: coverageBlocks.map((block) => block.id),
    organizationId: resolution.organization.id,
  });
  const absenceImpactResult =
    canReviewAbsenceImpact && coverageBlocks.length > 0
      ? await listOperationalAbsenceScheduleImpacts({
          limit: 200,
          organizationId: resolution.organization.id,
          scheduleBlockIds: coverageBlocks.map((block) => block.id),
          serviceDateFrom:
            scheduleView === "month" ? month.monthStart : week.weekStart,
          serviceDateTo: scheduleView === "month" ? month.monthEnd : week.weekEnd,
        })
      : { data: [], ok: true as const };
  const {
    allCoaches,
    assignableCoaches,
    displaysById: coachDisplaysById,
  } =
    buildCoachDisplays(coachContext);
  const myScheduleFilter = resolveMyScheduleFilterState({
    coachDisplaysById,
    coachProfiles: coachContext.coachProfiles,
    personProfiles: coachContext.personProfiles,
    userId: user.id,
  });
  const coverageByBlock = calculateScheduleCoverageByBlock({
    absenceImpacts: absenceImpactResult.ok ? absenceImpactResult.data : [],
    assignments,
    blocks: coverageBlocks,
    coaches: coachContext.coachProfiles,
    memberships: coachContext.memberships,
    persons: coachContext.personProfiles,
  });
  const { filters, ignoredFilters } = resolveScheduleFilters({
    centers,
    classTypes,
    coachProfiles: coachContext.coachProfiles,
    params,
  });
  const filteredBlocks = applyScheduleFilters({
    assignments,
    blocks,
    coverageByBlock,
    filters,
    myScheduleCoachProfileId:
      myScheduleFilter.status === "matched"
        ? myScheduleFilter.coachProfileId
        : null,
  });
  const filteredMonthBlocks = applyScheduleFilters({
    assignments,
    blocks: monthBlocks,
    coverageByBlock,
    filters,
    myScheduleCoachProfileId:
      myScheduleFilter.status === "matched"
        ? myScheduleFilter.coachProfileId
        : null,
  });
  const activeCenters = centers.filter((center) => center.status === "active");
  const activeClassTypes = classTypes.filter(
    (classType) => classType.status === "active",
  );
  const scheduleBasePath = getScheduleBasePath({
    day: scheduleView === "week" ? selectedDay : null,
    error: error && errorMessages[error] ? error : null,
    filters,
    organizationId: resolution.organization.id,
    status: status && successMessages[status] ? status : null,
    view: explicitScheduleView,
    weekStart: week.weekStart,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        blockCount={blocks.length}
        organizationName={resolution.organization.name}
        role={resolution.membership.role}
        weekEnd={week.weekEnd}
        weekStart={week.weekStart}
      />

      <WeekControls
        currentWeekStart={currentWeek.weekStart}
        filters={filters}
        organizationId={resolution.organization.id}
        view={scheduleView}
        weekEnd={week.weekEnd}
        weekStart={week.weekStart}
      />

      <ScheduleViewTabs
        filters={filters}
        organizationId={resolution.organization.id}
        view={scheduleView}
        weekStart={week.weekStart}
      />

      {scheduleView === "week" ? (
        <MobileWeekDayPicker
          blocks={filteredBlocks}
          coverageByBlock={coverageByBlock}
          days={week.days}
          filters={filters}
          organizationId={resolution.organization.id}
          selectedDay={selectedDay}
          weekStart={week.weekStart}
        />
      ) : null}

      <ScheduleFiltersCard
        allCoaches={allCoaches}
        centers={centers}
        classTypes={classTypes}
        filteredBlockCount={
          scheduleView === "month" ? filteredMonthBlocks.length : filteredBlocks.length
        }
        filters={filters}
        myScheduleFilter={myScheduleFilter}
        organizationId={resolution.organization.id}
        selectedDay={scheduleView === "week" ? selectedDay : null}
        totalBlockCount={scheduleView === "month" ? monthBlocks.length : blocks.length}
        view={scheduleView}
        weekStart={week.weekStart}
      />

      {week.invalidWeekParam ? (
        <Alert>
          <AlertTitle>Semana ajustada</AlertTitle>
          <AlertDescription>
            La fecha recibida no era válida. Se muestra la semana actual.
          </AlertDescription>
        </Alert>
      ) : null}

      {ignoredFilters.length > 0 ? (
        <Alert>
          <AlertTitle>Filtros ajustados</AlertTitle>
          <AlertDescription>
            Se ignoraron filtros que ya no son válidos:{" "}
            {ignoredFilters.join(", ")}.
          </AlertDescription>
        </Alert>
      ) : null}

      {status && successMessages[status] ? (
        <Alert>
          <AlertTitle>{successMessages[status]}</AlertTitle>
          <AlertDescription>
            {successDescriptions[status] ??
              "La semana ya muestra los bloques actuales."}
          </AlertDescription>
        </Alert>
      ) : null}

      {error && errorMessages[error] ? (
        <Alert variant="destructive">
          <AlertTitle>No se han guardado los cambios</AlertTitle>
          <AlertDescription>{errorMessages[error]}</AlertDescription>
        </Alert>
      ) : null}

      {!absenceImpactResult.ok ? (
        <Alert>
          <AlertTitle>Impacto de ausencia no disponible</AlertTitle>
          <AlertDescription>
            El horario se muestra sin cruzar ausencias aprobadas o en revision.
          </AlertDescription>
        </Alert>
      ) : null}

      {canManageSchedule ? (
        <ScheduleCreateForm
          activeCenters={activeCenters}
          activeClassTypes={activeClassTypes}
          day={scheduleView === "week" ? selectedDay : null}
          filters={filters}
          organizationId={resolution.organization.id}
          view={scheduleView}
          weekEnd={week.weekEnd}
          weekStart={week.weekStart}
        />
      ) : (
        <Alert>
          <AlertTitle>Modo lectura</AlertTitle>
          <AlertDescription>
            Tu rol puede consultar bloques operativos, pero no crearlos,
            editarlos ni cancelarlos.
          </AlertDescription>
        </Alert>
      )}

      <section className="scroll-mt-24 space-y-3" id="schedule-board">
        <div
          className={[
            "flex flex-wrap items-center justify-between gap-3",
            scheduleView === "week" ? "hidden md:flex" : "",
          ].join(" ")}
        >
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              {scheduleView === "month"
                ? "Mes"
                : scheduleView === "agenda"
                  ? "Agenda"
                  : "Semana"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {scheduleView === "month"
                ? "Overview para navegar días con riesgos, eventos o cambios."
                : scheduleView === "agenda"
                  ? "Lista limpia por día para revisar bloques sin perder contexto."
                  : "Vista semanal visual para comparar días y franjas horarias."}
            </p>
          </div>
          <Badge variant="outline">
            {scheduleView === "month"
              ? `${filteredMonthBlocks.length}/${monthBlocks.length} bloques`
              : `${filteredBlocks.length}/${blocks.length} bloques`}
          </Badge>
        </div>

        {scheduleView === "month" ? (
          <MonthlyScheduleView
            blocks={filteredMonthBlocks}
            centers={centers}
            classTypes={classTypes}
            coverageByBlock={coverageByBlock}
            filters={filters}
            month={month}
            organizationId={resolution.organization.id}
          />
        ) : filters.mineOnly && filteredBlocks.length === 0 ? (
          <MyScheduleEmptyCard
            myScheduleFilter={myScheduleFilter}
            organizationId={resolution.organization.id}
            weekStart={week.weekStart}
          />
        ) : blocks.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>No hay bloques en esta semana</CardTitle>
              <CardDescription>
                {canManageSchedule
                  ? "Crea el primer bloque operativo manual o aplica una plantilla semanal para empezar a cargar una semana real."
                  : "Un rol operativo debe crear bloques antes de que aparezcan aquí."}
              </CardDescription>
            </CardHeader>
          </Card>
        ) : filteredBlocks.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>No hay bloques con estos filtros</CardTitle>
              <CardDescription>
                La semana tiene bloques, pero ninguno coincide con la
                combinación actual de filtros.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline">
                <Link
                  href={getSchedulePath({
                    organizationId: resolution.organization.id,
                    view: scheduleView,
                    week: week.weekStart,
                  })}
                >
                  <RotateCcw aria-hidden="true" />
                  Limpiar filtros
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {scheduleView === "agenda" ? (
              <BlocksByDay
                assignments={assignments}
                basePath={scheduleBasePath}
                blocks={filteredBlocks}
                centers={centers}
                classTypes={classTypes}
                coachDisplaysById={coachDisplaysById}
                coverageByBlock={coverageByBlock}
                days={week.days}
              />
            ) : (
              <WeeklyScheduleView
                assignments={assignments}
                basePath={scheduleBasePath}
                blocks={filteredBlocks}
                centers={centers}
                classTypes={classTypes}
                coachDisplaysById={coachDisplaysById}
                coverageByBlock={coverageByBlock}
                days={week.days}
                selectedDay={selectedDay}
              />
            )}
          </>
        )}

        {scheduleView !== "month" ? (
          <ScheduleBlockDetailPanels
            assignableCoaches={assignableCoaches}
            assignments={assignments}
            basePath={scheduleBasePath}
            blocks={blocks}
            canManageSchedule={canManageSchedule}
            centers={centers}
            classTypes={classTypes}
            coachDisplays={[...coachDisplaysById.values()]}
            coverageByBlock={[...coverageByBlock.entries()]}
            filters={filters}
            initialSelectedBlockId={selectedBlockId}
            organizationId={resolution.organization.id}
            view={scheduleView}
            weekEnd={week.weekEnd}
            weekStart={week.weekStart}
          />
        ) : null}
      </section>

    </div>
  );
}

function PageHeader({
  blockCount,
  organizationName,
  role,
  weekEnd,
  weekStart,
}: {
  blockCount?: number;
  organizationName?: string;
  role?: string;
  weekEnd?: string;
  weekStart?: string;
}) {
  const roleLabel = role ? getApplicationRoleLabel(role) : null;

  return (
    <section className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-4">
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">Horario</Badge>
          {organizationName ? (
            <Badge variant="secondary">{organizationName}</Badge>
          ) : null}
          {roleLabel ? <Badge variant="outline">Rol {roleLabel}</Badge> : null}
          {typeof blockCount === "number" ? (
            <Badge variant="outline">{blockCount} bloques</Badge>
          ) : null}
        </div>
        <div className="max-w-3xl space-y-2">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            <CalendarDays aria-hidden="true" className="size-6" />
            Horario
          </h1>
          <p className="hidden text-sm leading-6 text-muted-foreground md:block md:text-base">
            Planifica la semana, detecta huecos y abre cada bloque sin perder contexto.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:max-w-3xl">
          <div className="flex items-start gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground">
            <CalendarDays aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>
              {weekStart && weekEnd
                ? formatWeekRange(weekStart, weekEnd)
                : "Semana actual"}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
