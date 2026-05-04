import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  CircleOff,
  Clock,
  Dumbbell,
  Filter,
  MapPin,
  Plus,
  RotateCcw,
  Save,
  UserMinus,
  UserRound,
} from "lucide-react";

import {
  assignScheduleBlockCoach,
  cancelScheduleBlock,
  createScheduleBlock,
  removeScheduleBlockAssignment,
  updateScheduleBlock,
} from "./actions";
import { OrganizationResolutionState } from "@/components/features/organization-resolution-state";
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
  getActiveMemberships,
  getAuthenticatedUser,
  resolveActiveOrganization,
} from "@/lib/auth/tenant";
import { getSchedulePath } from "@/lib/navigation/app-paths";
import {
  SCHEDULE_FILTER_COVERAGE_STATES,
  SCHEDULE_BLOCK_STATUSES,
  calculateScheduleCoverageByBlock,
  formatTimeForInput,
  getAdjacentWeekStart,
  getScheduleAssignmentStatusLabel,
  getScheduleBlockStatusLabel,
  getScheduleCoverageStateLabel,
  isCoverageActiveBlock,
  isScheduleBlockStatus,
  isScheduleFilterCoverageState,
  isScheduleRiskCoverageState,
  isScheduleUuid,
  resolveWeek,
  type ScheduleBlockStatus,
  type ScheduleBlockCoverage,
  type ScheduleCoverageState,
  type ScheduleFilterCoverageState,
} from "@/lib/schedule-blocks";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/supabase";

export const dynamic = "force-dynamic";

type ScheduleSearchParams = {
  block_status?: string | string[];
  center_id?: string | string[];
  class_type_id?: string | string[];
  coach_profile_id?: string | string[];
  coverage_state?: string | string[];
  error?: string | string[];
  mine?: string | string[];
  organizationId?: string | string[];
  risks_only?: string | string[];
  status?: string | string[];
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
  "assignment-removed": "Asignacion retirada.",
  assigned: "Coach asignado.",
  cancelled: "Bloque cancelado.",
  created: "Bloque creado.",
  "template-already-applied": "Plantilla ya aplicada.",
  "template-applied": "Plantilla aplicada.",
  updated: "Bloque actualizado.",
};

const errorMessages: Record<string, string> = {
  "assignment-required": "No se ha recibido la asignacion a retirar.",
  "block-required": "No se ha recibido el bloque a actualizar.",
  "block-not-assignable":
    "No se puede asignar coach a un bloque cancelado o completado.",
  "coach-inactive": "Ese perfil de coach no esta activo.",
  "coach-membership-inactive":
    "Ese coach tiene cuenta vinculada, pero su acceso no esta activo.",
  "coach-required": "Selecciona un coach para asignar.",
  "date-out-of-week": "La fecha debe estar dentro de la semana abierta.",
  "duplicate-assignment":
    "Ese coach ya tiene una asignacion logica en este bloque.",
  forbidden: "Tu rol no permite gestionar bloques operativos.",
  "invalid-assignment": "La asignacion recibida no es valida.",
  "invalid-assignment-reference":
    "La asignacion ya no apunta a un bloque o coach valido.",
  "invalid-block": "El bloque recibido no es valido.",
  "invalid-class-type": "El tipo de actividad seleccionado no es valido.",
  "invalid-center": "El centro seleccionado no es valido.",
  "invalid-coach": "El coach seleccionado no es valido.",
  "invalid-date": "La fecha del bloque no es valida.",
  "invalid-person-profile":
    "El perfil visible del coach no pertenece a esta organizacion.",
  "invalid-reference":
    "El centro o tipo seleccionado ya no esta disponible.",
  "invalid-required-coaches":
    "Los coaches necesarios deben ser un numero entero entre 0 y 20.",
  "invalid-status": "El estado seleccionado no es valido.",
  "invalid-time": "La hora de inicio debe ser anterior a la hora de fin.",
  "missing-fields": "Completa centro, tipo, fecha y horas.",
  no_active_memberships: "No hay accesos activos para este usuario.",
  "notes-too-long": "Las notas no pueden superar 1000 caracteres.",
  organization_not_found: "La organizacion solicitada no esta disponible.",
  organization_required:
    "Elige una organizacion antes de gestionar bloques operativos.",
  "person-profile-inactive": "El perfil visible del coach no esta activo.",
  "person-profile-internal":
    "Los perfiles internos no pueden asignarse como coaches operativos.",
  "save-failed": "No se han podido guardar los cambios.",
};

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
        label: "coach",
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

function getScheduleFilterPathOptions(filters: ScheduleFilters) {
  return {
    blockStatus: filters.blockStatus,
    centerId: filters.centerId,
    classTypeId: filters.classTypeId,
    coachProfileId: filters.coachProfileId,
    coverageState: filters.coverageState,
    mineOnly: filters.mineOnly,
    risksOnly: filters.risksOnly,
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

    if (filters.risksOnly && !isScheduleRiskCoverageState(coverage.state)) {
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
  if (blockIds.length === 0) {
    return [];
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("schedule_block_assignments")
    .select(
      "id, schedule_block_id, coach_profile_id, assignment_status, source, updated_at",
    )
    .eq("organization_id", organizationId)
    .in("schedule_block_id", blockIds)
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(`Could not load schedule assignments: ${error.message}`);
  }

  return data satisfies ScheduleBlockAssignmentRow[];
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
    "h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm",
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

function formatTime(value: string) {
  return formatTimeForInput(value) || value;
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
      label: `Coach sin perfil visible ${shortId(coachProfile.id)}`,
    };
  }

  return {
    detail: `Perfil tecnico incompleto ${shortId(coachProfile.id)}`,
    id: coachProfile.id,
    isFallback: true,
    label: `Coach sin perfil visible ${shortId(coachProfile.id)}`,
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

function ScheduleBlockStatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant={
        status === "cancelled"
          ? "destructive"
          : status === "scheduled"
            ? "secondary"
            : "outline"
      }
    >
      {getScheduleBlockStatusLabel(status)}
    </Badge>
  );
}

function getCoverageBadgeVariant(state: ScheduleCoverageState) {
  if (state === "conflict" || state === "uncovered") {
    return "destructive";
  }

  if (state === "covered") {
    return "secondary";
  }

  return "outline";
}

function CoverageBadge({ coverage }: { coverage: ScheduleBlockCoverage }) {
  const icon =
    coverage.state === "covered" ? (
      <CheckCircle2 aria-hidden="true" />
    ) : coverage.state === "conflict" ||
      coverage.state === "insufficient" ||
      coverage.state === "uncovered" ? (
      <AlertTriangle aria-hidden="true" />
    ) : null;

  return (
    <Badge variant={getCoverageBadgeVariant(coverage.state)}>
      {icon}
      {getScheduleCoverageStateLabel(coverage.state)}
      {coverage.state !== "inactive" && coverage.state !== "not_required"
        ? ` ${coverage.validAssignmentCount}/${coverage.requiredCoaches}`
        : null}
    </Badge>
  );
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

function StatusSelect({ defaultValue }: { defaultValue?: string }) {
  return (
    <select
      className={selectClassName()}
      defaultValue={defaultValue ?? "scheduled"}
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
      <label className="grid gap-2">
        <span className="text-sm font-medium">Fecha</span>
        <Input
          defaultValue={block?.service_date ?? weekStart}
          max={weekEnd}
          min={weekStart}
          name="serviceDate"
          required
          type="date"
        />
      </label>

      <label className="grid gap-2">
        <span className="text-sm font-medium">Inicio</span>
        <Input
          defaultValue={block ? formatTimeForInput(block.start_time) : ""}
          name="startTime"
          required
          type="time"
        />
      </label>

      <label className="grid gap-2">
        <span className="text-sm font-medium">Fin</span>
        <Input
          defaultValue={block ? formatTimeForInput(block.end_time) : ""}
          name="endTime"
          required
          type="time"
        />
      </label>

      <label className="grid gap-2">
        <span className="text-sm font-medium">Centro</span>
        <CenterSelect
          centers={centers}
          defaultValue={block?.center_id}
          disabled={disabled}
        />
      </label>

      <label className="grid gap-2">
        <span className="text-sm font-medium">Tipo de actividad</span>
        <ClassTypeSelect
          classTypes={classTypes}
          defaultValue={block?.class_type_id}
          disabled={disabled}
        />
      </label>

      <label className="grid gap-2">
        <span className="text-sm font-medium">Coaches necesarios</span>
        <Input
          defaultValue={block?.required_coaches ?? 1}
          max="20"
          min="0"
          name="requiredCoaches"
          required
          type="number"
        />
      </label>

      <label className="grid gap-2">
        <span className="text-sm font-medium">Estado</span>
        <StatusSelect defaultValue={block?.status} />
      </label>

      <label className="grid gap-2 lg:col-span-6">
        <span className="text-sm font-medium">Notas</span>
        <Textarea
          defaultValue={block?.notes ?? ""}
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
  filters,
  organizationId,
  weekEnd,
  weekStart,
}: {
  activeCenters: CenterRow[];
  activeClassTypes: ClassTypeRow[];
  filters: ScheduleFilters;
  organizationId: string;
  weekEnd: string;
  weekStart: string;
}) {
  const canCreate = activeCenters.length > 0 && activeClassTypes.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Plus aria-hidden="true" className="size-4" />
          Crear bloque operativo
        </CardTitle>
        <CardDescription>
          Alta manual de un bloque real de la semana. Puede ser clase,
          recepcion, evento, competicion u otra actividad configurada.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          action={createScheduleBlock}
          className="grid gap-4 lg:grid-cols-6"
        >
          <input name="organizationId" type="hidden" value={organizationId} />
          <input name="weekStart" type="hidden" value={weekStart} />
          <ScheduleFilterHiddenInputs filters={filters} />
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
      </CardContent>
    </Card>
  );
}

function ScheduleFilterHiddenInputs({ filters }: { filters: ScheduleFilters }) {
  return (
    <>
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

function ScheduleFiltersCard({
  allCoaches,
  centers,
  classTypes,
  filteredBlockCount,
  filters,
  myScheduleFilter,
  organizationId,
  totalBlockCount,
  weekStart,
}: {
  allCoaches: CoachDisplay[];
  centers: CenterRow[];
  classTypes: ClassTypeRow[];
  filteredBlockCount: number;
  filters: ScheduleFilters;
  myScheduleFilter: MyScheduleFilterState;
  organizationId: string;
  totalBlockCount: number;
  weekStart: string;
}) {
  const activeFilterCount = getActiveFilterCount(filters);
  const clearFiltersPath = getSchedulePath({
    organizationId,
    week: weekStart,
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <Filter aria-hidden="true" className="size-4" />
              Filtros operativos
            </CardTitle>
            <CardDescription>
              {filteredBlockCount} de {totalBlockCount} bloque
              {totalBlockCount === 1 ? "" : "s"} visibles en la semana.
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

          <label className="grid gap-2">
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

          <label className="grid gap-2">
            <span className="text-sm font-medium">Coach</span>
            <select
              className={selectClassName()}
              defaultValue={filters.coachProfileId ?? ""}
              name="coach_profile_id"
            >
              <option value="">Todos</option>
              {allCoaches.map((coach) => (
                <option key={coach.id} value={coach.id}>
                  {coach.label}
                  {coach.isFallback ? " (fallback tecnico)" : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2">
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

          <label className="grid gap-2">
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

          <label className="grid gap-2">
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

          <label className="flex min-h-9 items-center gap-2 self-end rounded-md border border-input px-3 py-2 text-sm">
            <input
              className="size-4 accent-primary"
              defaultChecked={filters.risksOnly}
              name="risks_only"
              type="checkbox"
              value="1"
            />
            <span>Solo riesgos</span>
          </label>

          <label className="flex min-h-9 items-center gap-2 self-end rounded-md border border-input px-3 py-2 text-sm">
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
  );
}

function getMyScheduleFilterDescription(
  myScheduleFilter: MyScheduleFilterState,
) {
  if (myScheduleFilter.status === "matched") {
    const label =
      myScheduleFilter.coachDisplay?.label ??
      `Coach ${shortId(myScheduleFilter.coachProfileId)}`;

    return `Mi horario usa la ficha de ${label} y solo muestra bloques asignados.`;
  }

  if (myScheduleFilter.status === "ambiguous") {
    return `Mi horario encontro ${myScheduleFilter.profileCount} fichas de coach vinculadas a tu usuario. No se elige una automaticamente.`;
  }

  if (myScheduleFilter.status === "missing") {
    return "Mi horario no encontro una ficha de coach vinculada a tu usuario.";
  }

  return "Mi horario esta desactivado.";
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
    "La semana no tiene bloques asignados a tu perfil con estado Asignado, o la combinacion actual de filtros no devuelve resultados.";
  let title = "No hay clases en Mi horario esta semana";

  if (myScheduleFilter.status === "missing") {
    title = "No hay ficha de coach vinculada";
    description =
      "Tu usuario tiene acceso, pero todavia no tiene una ficha de coach asociada. Un admin debe vincular tu persona antes de usar Mi horario.";
  } else if (myScheduleFilter.status === "ambiguous") {
    title = "Mi horario necesita una revision de perfiles";
    description = `Tu usuario aparece vinculado a ${myScheduleFilter.profileCount} fichas de coach. Por seguridad no se elige una automaticamente.`;
  } else if (myScheduleFilter.status === "matched") {
    const label =
      myScheduleFilter.coachDisplay?.label ??
      `Coach ${shortId(myScheduleFilter.coachProfileId)}`;

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
  filters,
  organizationId,
  weekEnd,
  weekStart,
}: {
  filters: ScheduleFilters;
  organizationId: string;
  weekEnd: string;
  weekStart: string;
}) {
  const previousWeek = getAdjacentWeekStart(weekStart, -1);
  const nextWeek = getAdjacentWeekStart(weekStart, 1);
  const filterPathOptions = getScheduleFilterPathOptions(filters);

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end sm:justify-between">
        <form
          action="/app/schedule"
          className="grid gap-3 sm:grid-cols-[minmax(180px,240px)_auto]"
          method="get"
        >
          <input name="organizationId" type="hidden" value={organizationId} />
          <ScheduleFilterHiddenInputs filters={filters} />
          <label className="grid gap-2">
            <span className="text-sm font-medium">Semana</span>
            <Input defaultValue={weekStart} name="week" type="date" />
          </label>
          <div className="flex items-end">
            <Button type="submit">Ver semana</Button>
          </div>
        </form>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{formatWeekRange(weekStart, weekEnd)}</Badge>
          <Button asChild size="sm" variant="outline">
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
          <Button asChild size="sm" variant="outline">
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
        </div>
      </CardContent>
    </Card>
  );
}

function ScheduleViewTabs({
  filters,
  organizationId,
  weekStart,
}: {
  filters: ScheduleFilters;
  organizationId: string;
  weekStart: string;
}) {
  const items = [
    {
      active: !filters.mineOnly && !filters.risksOnly,
      href: getSchedulePath({ organizationId, week: weekStart }),
      label: "Semana",
    },
    {
      active: filters.mineOnly,
      href: getSchedulePath({
        mineOnly: true,
        organizationId,
        week: weekStart,
      }),
      label: "Mi semana",
    },
    {
      active: filters.risksOnly,
      href: getSchedulePath({
        organizationId,
        risksOnly: true,
        week: weekStart,
      }),
      label: "Sin cubrir",
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1">
      {items.map((item) => (
        <Button
          asChild
          key={item.label}
          variant={item.active ? "secondary" : "ghost"}
        >
          <Link href={item.href}>{item.label}</Link>
        </Button>
      ))}
    </div>
  );
}

function AssignmentStatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant={
        status === "assigned"
          ? "secondary"
          : status === "declined"
            ? "destructive"
            : "outline"
      }
    >
      {getScheduleAssignmentStatusLabel(status)}
    </Badge>
  );
}

function ScheduleAssignmentPanel({
  assignableCoaches,
  assignments,
  block,
  canManageSchedule,
  coachDisplaysById,
  coverage,
  filters,
  organizationId,
  weekStart,
}: {
  assignableCoaches: CoachDisplay[];
  assignments: ScheduleBlockAssignmentRow[];
  block: ScheduleBlockRow;
  canManageSchedule: boolean;
  coachDisplaysById: Map<string, CoachDisplay>;
  coverage: ScheduleBlockCoverage;
  filters?: ScheduleFilters;
  organizationId: string;
  weekStart: string;
}) {
  const activeAssignments = assignments.filter(
    (assignment) => assignment.assignment_status !== "removed",
  );
  const removedAssignments = assignments.filter(
    (assignment) => assignment.assignment_status === "removed",
  );
  const logicalCoachProfileIds = new Set(
    activeAssignments.map((assignment) => assignment.coach_profile_id),
  );
  const availableCoaches = assignableCoaches.filter(
    (coach) => !logicalCoachProfileIds.has(coach.id),
  );
  const canAssign =
    canManageSchedule &&
    isCoverageActiveBlock(block.status) &&
    availableCoaches.length > 0;
  const conflictCoachNames = coverage.conflictCoachProfileIds.map(
    (coachProfileId) =>
      coachDisplaysById.get(coachProfileId)?.label ??
      `Coach ${shortId(coachProfileId)}`,
  );

  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <UserRound aria-hidden="true" className="size-4 shrink-0" />
          <h4 className="text-sm font-medium">Asignaciones</h4>
        </div>
        <CoverageBadge coverage={coverage} />
      </div>

      {coverage.state === "conflict" && conflictCoachNames.length > 0 ? (
        <p className="text-sm text-destructive">
          Solapamiento detectado: {conflictCoachNames.join(", ")}.
        </p>
      ) : null}

      {activeAssignments.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No hay coaches asignados que cuenten para esta fila de trabajo.
        </p>
      ) : (
        <div className="grid gap-2">
          {activeAssignments.map((assignment) => {
            const coachDisplay = coachDisplaysById.get(
              assignment.coach_profile_id,
            );

            return (
              <div
                className="flex flex-col gap-2 rounded-md border border-border/70 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                key={assignment.id}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium">
                      {coachDisplay?.label ??
                        `Coach ${shortId(assignment.coach_profile_id)}`}
                    </span>
                    <AssignmentStatusBadge
                      status={assignment.assignment_status}
                    />
                    <Badge variant="outline">{assignment.source}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {coachDisplay?.detail ?? "Perfil tecnico sin nombre visible"}
                  </p>
                </div>

                {canManageSchedule ? (
                  <form action={removeScheduleBlockAssignment}>
                    <input
                      name="organizationId"
                      type="hidden"
                      value={organizationId}
                    />
                    <input name="weekStart" type="hidden" value={weekStart} />
                    {filters ? (
                      <ScheduleFilterHiddenInputs filters={filters} />
                    ) : null}
                    <input
                      name="assignmentId"
                      type="hidden"
                      value={assignment.id}
                    />
                    <Button size="sm" type="submit" variant="outline">
                      <UserMinus aria-hidden="true" />
                      Retirar
                    </Button>
                  </form>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {removedAssignments.length > 0 ? (
        <details className="text-sm text-muted-foreground">
          <summary className="cursor-pointer select-none">
            {removedAssignments.length} retirada
            {removedAssignments.length === 1 ? "" : "s"} conservada
            {removedAssignments.length === 1 ? "" : "s"}
          </summary>
          <ul className="mt-2 grid gap-1">
            {removedAssignments.map((assignment) => (
              <li className="truncate" key={assignment.id}>
                {coachDisplaysById.get(assignment.coach_profile_id)?.label ??
                  `Coach ${shortId(assignment.coach_profile_id)}`}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {canManageSchedule ? (
        <form
          action={assignScheduleBlockCoach}
          className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"
        >
          <input name="organizationId" type="hidden" value={organizationId} />
          <input name="weekStart" type="hidden" value={weekStart} />
          {filters ? <ScheduleFilterHiddenInputs filters={filters} /> : null}
          <input name="scheduleBlockId" type="hidden" value={block.id} />
          <label className="grid gap-2">
            <span className="text-sm font-medium">Coach asignable</span>
            <select
              className={selectClassName()}
              defaultValue={availableCoaches[0]?.id ?? ""}
              disabled={!canAssign}
              name="coachProfileId"
              required
            >
              {availableCoaches.length === 0 ? (
                <option value="">Sin coaches asignables disponibles</option>
              ) : null}
              {availableCoaches.map((coach) => (
                <option key={coach.id} value={coach.id}>
                  {coach.label}
                  {coach.isFallback ? " (sin perfil visible)" : ""}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <Button disabled={!canAssign} type="submit">
              <Plus aria-hidden="true" />
              Asignar coach
            </Button>
          </div>
        </form>
      ) : null}

      {canManageSchedule && !isCoverageActiveBlock(block.status) ? (
        <p className="text-sm text-muted-foreground">
          Los bloques cancelados o completados no admiten nuevas asignaciones.
        </p>
      ) : null}
    </div>
  );
}

function ScheduleBlockReadOnlyCard({
  assignableCoaches,
  assignments,
  block,
  center,
  classType,
  coachDisplaysById,
  coverage,
}: {
  assignableCoaches: CoachDisplay[];
  assignments: ScheduleBlockAssignmentRow[];
  block: ScheduleBlockRow;
  center?: CenterRow;
  classType?: ClassTypeRow;
  coachDisplaysById: Map<string, CoachDisplay>;
  coverage: ScheduleBlockCoverage;
}) {
  return (
    <Card className="scroll-mt-32" id={`block-${block.id}`}>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <CardTitle className="flex items-center gap-2">
              <Clock aria-hidden="true" className="size-4 shrink-0" />
              <span>
                {formatTime(block.start_time)} - {formatTime(block.end_time)}
              </span>
            </CardTitle>
            <CardDescription>
              {formatServiceDate(block.service_date)}
            </CardDescription>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {block.is_template_exception ? (
              <Badge variant="outline">Excepcion</Badge>
            ) : null}
            <ScheduleBlockStatusBadge status={block.status} />
            <CoverageBadge coverage={coverage} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-5">
          <div className="min-w-0">
            <dt className="text-muted-foreground">Centro</dt>
            <dd className="mt-1 truncate font-medium">
              {center?.name ?? "Centro no disponible"}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted-foreground">Tipo</dt>
            <dd className="mt-1 flex min-w-0 items-center gap-2 font-medium">
              <ColorSwatch color={classType?.color ?? null} />
              <span className="truncate">
                {classType?.name ?? "Tipo no disponible"}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Coaches necesarios</dt>
            <dd className="mt-1 font-medium">{block.required_coaches}</dd>
          </div>
          <div className="min-w-0 lg:col-span-2">
            <dt className="text-muted-foreground">Notas</dt>
            <dd className="mt-1 whitespace-pre-wrap break-words">
              {block.notes || "Sin notas"}
            </dd>
          </div>
        </dl>
        <ScheduleAssignmentPanel
          assignableCoaches={assignableCoaches}
          assignments={assignments}
          block={block}
          canManageSchedule={false}
          coachDisplaysById={coachDisplaysById}
          coverage={coverage}
          organizationId=""
          weekStart=""
        />
      </CardContent>
    </Card>
  );
}

function ScheduleBlockAdminCard({
  assignableCoaches,
  assignments,
  block,
  center,
  centers,
  classType,
  classTypes,
  coachDisplaysById,
  coverage,
  filters,
  organizationId,
  weekEnd,
  weekStart,
}: {
  assignableCoaches: CoachDisplay[];
  assignments: ScheduleBlockAssignmentRow[];
  block: ScheduleBlockRow;
  center?: CenterRow;
  centers: CenterRow[];
  classType?: ClassTypeRow;
  classTypes: ClassTypeRow[];
  coachDisplaysById: Map<string, CoachDisplay>;
  coverage: ScheduleBlockCoverage;
  filters: ScheduleFilters;
  organizationId: string;
  weekEnd: string;
  weekStart: string;
}) {
  return (
    <Card className="scroll-mt-32" id={`block-${block.id}`}>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <CardTitle className="flex items-center gap-2">
              <Clock aria-hidden="true" className="size-4 shrink-0" />
              <span>
                {formatTime(block.start_time)} - {formatTime(block.end_time)}
              </span>
            </CardTitle>
            <CardDescription className="flex flex-wrap items-center gap-2">
              <span>{formatServiceDate(block.service_date)}</span>
              <span aria-hidden="true">/</span>
              <span className="inline-flex min-w-0 items-center gap-1">
                <MapPin aria-hidden="true" className="size-3.5 shrink-0" />
                <span className="truncate">
                  {center?.name ?? "Centro no disponible"}
                </span>
              </span>
              <span aria-hidden="true">/</span>
              <span className="inline-flex min-w-0 items-center gap-1">
                <Dumbbell aria-hidden="true" className="size-3.5 shrink-0" />
                <span className="truncate">
                  {classType?.name ?? "Tipo no disponible"}
                </span>
              </span>
            </CardDescription>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {block.is_template_exception ? (
              <Badge variant="outline">Excepcion</Badge>
            ) : null}
            <ScheduleBlockStatusBadge status={block.status} />
            <CoverageBadge coverage={coverage} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <ScheduleAssignmentPanel
          assignableCoaches={assignableCoaches}
          assignments={assignments}
          block={block}
          canManageSchedule={true}
          coachDisplaysById={coachDisplaysById}
          coverage={coverage}
          filters={filters}
          organizationId={organizationId}
          weekStart={weekStart}
        />

        <form action={updateScheduleBlock} className="grid gap-4 lg:grid-cols-6">
          <input name="organizationId" type="hidden" value={organizationId} />
          <input name="weekStart" type="hidden" value={weekStart} />
          <ScheduleFilterHiddenInputs filters={filters} />
          <input name="scheduleBlockId" type="hidden" value={block.id} />
          <ScheduleBlockFields
            block={block}
            centers={centers}
            classTypes={classTypes}
            weekEnd={weekEnd}
            weekStart={weekStart}
          />
          <div className="flex flex-wrap gap-2 lg:col-span-6">
            <Button type="submit">
              <Save aria-hidden="true" />
              Guardar bloque
            </Button>
          </div>
        </form>

        {block.status !== "cancelled" ? (
          <form action={cancelScheduleBlock}>
            <input name="organizationId" type="hidden" value={organizationId} />
            <input name="weekStart" type="hidden" value={weekStart} />
            <ScheduleFilterHiddenInputs filters={filters} />
            <input name="scheduleBlockId" type="hidden" value={block.id} />
            <Button type="submit" variant="destructive">
              <CircleOff aria-hidden="true" />
              Cancelar bloque
            </Button>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}

function BlocksByDay({
  assignableCoaches,
  assignments,
  blocks,
  canManageSchedule,
  centers,
  classTypes,
  coachDisplaysById,
  coverageByBlock,
  filters,
  organizationId,
  weekEnd,
  weekStart,
}: {
  assignableCoaches: CoachDisplay[];
  assignments: ScheduleBlockAssignmentRow[];
  blocks: ScheduleBlockRow[];
  canManageSchedule: boolean;
  centers: CenterRow[];
  classTypes: ClassTypeRow[];
  coachDisplaysById: Map<string, CoachDisplay>;
  coverageByBlock: Map<string, ScheduleBlockCoverage>;
  filters: ScheduleFilters;
  organizationId: string;
  weekEnd: string;
  weekStart: string;
}) {
  const centersById = new Map(centers.map((center) => [center.id, center]));
  const classTypesById = new Map(
    classTypes.map((classType) => [classType.id, classType]),
  );
  const groupedBlocks = blocks.reduce(
    (groups, block) => {
      const dayBlocks = groups.get(block.service_date) ?? [];
      dayBlocks.push(block);
      groups.set(block.service_date, dayBlocks);

      return groups;
    },
    new Map<string, ScheduleBlockRow[]>(),
  );
  const assignmentsByBlockId = assignments.reduce(
    (groups, assignment) => {
      const blockAssignments = groups.get(assignment.schedule_block_id) ?? [];
      blockAssignments.push(assignment);
      groups.set(assignment.schedule_block_id, blockAssignments);

      return groups;
    },
    new Map<string, ScheduleBlockAssignmentRow[]>(),
  );

  return (
    <div className="space-y-5">
      {[...groupedBlocks.entries()].map(([serviceDate, dayBlocks]) => (
        <section className="space-y-3" key={serviceDate}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-base font-semibold tracking-tight">
              {formatServiceDate(serviceDate)}
            </h3>
            <Badge variant="outline">
              {dayBlocks.length} bloque{dayBlocks.length === 1 ? "" : "s"}
            </Badge>
          </div>
          <div className="grid gap-4">
            {dayBlocks.map((block) => {
              const coverage = coverageByBlock.get(block.id);

              if (!coverage) {
                throw new Error("Missing coverage state for schedule block.");
              }

              return canManageSchedule ? (
                <ScheduleBlockAdminCard
                  assignableCoaches={assignableCoaches}
                  assignments={assignmentsByBlockId.get(block.id) ?? []}
                  block={block}
                  center={centersById.get(block.center_id)}
                  centers={centers}
                  classType={classTypesById.get(block.class_type_id)}
                  classTypes={classTypes}
                  coachDisplaysById={coachDisplaysById}
                  coverage={coverage}
                  filters={filters}
                  key={block.id}
                  organizationId={organizationId}
                  weekEnd={weekEnd}
                  weekStart={weekStart}
                />
              ) : (
                <ScheduleBlockReadOnlyCard
                  assignableCoaches={assignableCoaches}
                  assignments={assignmentsByBlockId.get(block.id) ?? []}
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
        </section>
      ))}
    </div>
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
  const [blocks, centers, classTypes, coachContext] = await Promise.all([
    getScheduleBlocks({
      organizationId: resolution.organization.id,
      weekEnd: week.weekEnd,
      weekStart: week.weekStart,
    }),
    getCenters(resolution.organization.id),
    getClassTypes(resolution.organization.id),
    getScheduleCoachContext(resolution.organization.id),
  ]);
  const assignments = await getScheduleBlockAssignments({
    blockIds: blocks.map((block) => block.id),
    organizationId: resolution.organization.id,
  });
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
    assignments,
    blocks,
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
  const canManageSchedule = resolution.membership.role === "admin";
  const activeCenters = centers.filter((center) => center.status === "active");
  const activeClassTypes = classTypes.filter(
    (classType) => classType.status === "active",
  );

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
        filters={filters}
        organizationId={resolution.organization.id}
        weekEnd={week.weekEnd}
        weekStart={week.weekStart}
      />

      <ScheduleViewTabs
        filters={filters}
        organizationId={resolution.organization.id}
        weekStart={week.weekStart}
      />

      <ScheduleFiltersCard
        allCoaches={allCoaches}
        centers={centers}
        classTypes={classTypes}
        filteredBlockCount={filteredBlocks.length}
        filters={filters}
        myScheduleFilter={myScheduleFilter}
        organizationId={resolution.organization.id}
        totalBlockCount={blocks.length}
        weekStart={week.weekStart}
      />

      {week.invalidWeekParam ? (
        <Alert>
          <AlertTitle>Semana ajustada</AlertTitle>
          <AlertDescription>
            La fecha recibida no era valida. Se muestra la semana actual.
          </AlertDescription>
        </Alert>
      ) : null}

      {ignoredFilters.length > 0 ? (
        <Alert>
          <AlertTitle>Filtros ajustados</AlertTitle>
          <AlertDescription>
            Se ignoraron filtros que ya no son validos:{" "}
            {ignoredFilters.join(", ")}.
          </AlertDescription>
        </Alert>
      ) : null}

      {status && successMessages[status] ? (
        <Alert>
          <AlertTitle>{successMessages[status]}</AlertTitle>
          <AlertDescription>
            La semana ya muestra los bloques actuales.
          </AlertDescription>
        </Alert>
      ) : null}

      {error && errorMessages[error] ? (
        <Alert variant="destructive">
          <AlertTitle>No se han guardado los cambios</AlertTitle>
          <AlertDescription>{errorMessages[error]}</AlertDescription>
        </Alert>
      ) : null}

      {canManageSchedule ? (
        <ScheduleCreateForm
          activeCenters={activeCenters}
          activeClassTypes={activeClassTypes}
          filters={filters}
          organizationId={resolution.organization.id}
          weekEnd={week.weekEnd}
          weekStart={week.weekStart}
        />
      ) : (
        <Alert>
          <AlertTitle>Modo lectura</AlertTitle>
          <AlertDescription>
            Tu rol coach puede consultar bloques operativos, pero no crearlos,
            editarlos ni cancelarlos.
          </AlertDescription>
        </Alert>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              Semana
            </h2>
            <p className="text-sm text-muted-foreground">
              Clases y bloques ordenados por dia y hora.
            </p>
          </div>
          <Badge variant="outline">
            {filteredBlocks.length}/{blocks.length} bloques
          </Badge>
        </div>

        {filters.mineOnly && filteredBlocks.length === 0 ? (
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
                  : "Un admin debe crear bloques antes de que aparezcan aqui."}
              </CardDescription>
            </CardHeader>
          </Card>
        ) : filteredBlocks.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>No hay bloques con estos filtros</CardTitle>
              <CardDescription>
                La semana tiene bloques, pero ninguno coincide con la
                combinacion actual de filtros.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline">
                <Link
                  href={getSchedulePath({
                    organizationId: resolution.organization.id,
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
          <BlocksByDay
            assignableCoaches={assignableCoaches}
            assignments={assignments}
            blocks={filteredBlocks}
            canManageSchedule={canManageSchedule}
            centers={centers}
            classTypes={classTypes}
            coachDisplaysById={coachDisplaysById}
            coverageByBlock={coverageByBlock}
            filters={filters}
            organizationId={resolution.organization.id}
            weekEnd={week.weekEnd}
            weekStart={week.weekStart}
          />
        )}
      </section>

      <Alert>
        <CircleOff aria-hidden="true" className="size-4" />
        <AlertTitle>Fuera de este corte</AlertTitle>
        <AlertDescription>
          Las plantillas se gestionan en su propia pantalla. Cambios,
          ausencias y fichaje llegaran en fases posteriores.
        </AlertDescription>
      </Alert>
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
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">Horario</Badge>
        {organizationName ? (
          <Badge variant="secondary">{organizationName}</Badge>
        ) : null}
        {role ? <Badge variant="outline">Rol {role}</Badge> : null}
        {typeof blockCount === "number" ? (
          <Badge variant="outline">{blockCount} bloques</Badge>
        ) : null}
      </div>
      <div className="max-w-3xl space-y-2">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          <CalendarDays aria-hidden="true" className="size-6" />
          Horario
        </h1>
        <p className="text-sm leading-6 text-muted-foreground sm:text-base">
          Revisa la semana, crea bloques y mantén visible la cobertura.
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
    </section>
  );
}
