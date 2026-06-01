import type { ReactNode } from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CalendarRange,
  ChevronDown,
  Filter,
  ListChecks,
  PanelRightOpen,
  RotateCcw,
} from "lucide-react";

import { ScheduleBlockDetailPanels } from "./schedule-block-detail-panels";
import { ScheduleOperationalEventPanels } from "./schedule-operational-event-panels";
import { ScheduleSlotCreateDialog } from "./schedule-slot-create-dialog";
import {
  StaffWorkWindowsHiddenInput,
  StaffWorkWindowHourSummary,
  type StaffWorkWindowHourSummaryItem,
} from "./staff-work-windows-visibility";
import { ScheduleCenterSwitcher } from "./schedule-center-switcher";
import { TransientFeedbackBanner } from "@/components/features/transient-feedback-banner";
import { OrganizationResolutionState } from "@/components/features/organization-resolution-state";
import { RouteStateButton } from "@/components/features/route-state-link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getLoginPath } from "@/lib/auth/redirects";
import {
  canManageAbsenceRequests,
  canManageOperationalData,
  canManageOperationalEvents,
  getApplicationRoleLabel,
} from "@/lib/auth/permissions";
import {
  getActiveMemberships,
  getAuthenticatedUser,
  resolveActiveOrganization,
} from "@/lib/auth/tenant";
import { listOperationalAbsenceScheduleImpacts } from "@/lib/absence-requests";
import {
  listCoverageTraceItems,
  type CoverageTraceItem,
} from "@/lib/coverage-traceability";
import {
  listDocumentProgrammingForBlock,
  type DocumentProgrammingEntry,
} from "@/lib/document-programming";
import { getSchedulePath } from "@/lib/navigation/app-paths";
import {
  listOperationalEvents,
  type OperationalEventRow,
} from "@/lib/operational-events";
import {
  getScheduleCenterPreferenceCookieName,
  isScheduleCenterPreferenceValue,
} from "@/lib/schedule-center-preferences";
import { cn } from "@/lib/utils";
import {
  SCHEDULE_FILTER_COVERAGE_STATES,
  calculateScheduleCoverageByBlock,
  formatTimeForInput,
  getAdjacentWeekStart,
  getScheduleBlockStatusLabel,
  getScheduleCoverageStateLabel,
  isCoverageActiveBlock,
  isScheduleCoverageRisk,
  isScheduleFilterCoverageState,
  isScheduleUuid,
  resolveWeek,
  type ScheduleBlockCoverage,
  type ScheduleFilterCoverageState,
} from "@/lib/schedule-blocks";
import {
  listStaffWorkWindowsForWeek,
  type StaffWorkWindowOccurrence,
} from "@/lib/staff-work-windows";
import { ensureActiveScheduleTemplatesForWindow } from "@/lib/schedule-template-application";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/supabase";

export const dynamic = "force-dynamic";

const SCHEDULE_ASSIGNMENT_BLOCK_ID_BATCH_SIZE = 50;

type ScheduleSearchParams = {
  block_id?: string | string[];
  center_id?: string | string[];
  class_type_id?: string | string[];
  coach_profile_id?: string | string[];
  coverage_state?: string | string[];
  day?: string | string[];
  error?: string | string[];
  event_id?: string | string[];
  mine?: string | string[];
  organizationId?: string | string[];
  risks_only?: string | string[];
  status?: string | string[];
  view?: string | string[];
  week?: string | string[];
  work_windows?: string | string[];
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
  personProfileId: string | null;
};

type ScheduleFilters = {
  centerId: string | null;
  classTypeId: string | null;
  coachProfileId: string | null;
  coverageState: ScheduleFilterCoverageState | null;
  mineOnly: boolean;
  risksOnly: boolean;
  showWorkWindows: boolean;
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
  "operational-event-archived": "Evento archivado.",
  "operational-event-cancelled": "Evento cancelado.",
  "operational-event-created": "Evento creado.",
  "operational-event-reactivated": "Evento reactivado.",
  "operational-event-updated": "Evento actualizado.",
  updated: "Bloque actualizado.",
  "work-window-created": "Jornada prevista creada.",
  "work-windows-created": "Jornadas previstas creadas.",
  "work-window-deactivated": "Jornada prevista desactivada.",
  "work-window-updated": "Jornada prevista actualizada.",
};

const errorMessages: Record<string, string> = {
  "assignment-required": "No se ha recibido la asignación a retirar.",
  "authentication-required": "Vuelve a iniciar sesión para continuar.",
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
  "center-inactive": "El centro seleccionado no está activo.",
  "invalid-assignment": "La asignación recibida no es válida.",
  "invalid-assignment-reference":
    "La asignación ya no apunta a un bloque o entrenador válido.",
  "invalid-block": "El bloque recibido no es válido.",
  "invalid-class-type": "El tipo de actividad seleccionado no es válido.",
  "invalid-center": "El centro seleccionado no es válido.",
  "invalid-coach": "El entrenador seleccionado no es válido.",
  "invalid-day": "El día de la jornada prevista no es válido.",
  "invalid-event": "El evento recibido no es válido.",
  "invalid-event-type": "El tipo de evento no está habilitado.",
  "invalid-impact-level": "El impacto de evento no está habilitado.",
  "invalid-input": "Revisa los datos del formulario.",
  "invalid-limit": "El límite solicitado no es válido.",
  "invalid-notes":
    "Las notas no pueden incluir datos sensibles, URLs ni identificadores privados.",
  "invalid-date": "La fecha del bloque no es válida.",
  "invalid-organization": "La organización solicitada no es válida.",
  "invalid-person-profile":
    "El perfil visible seleccionado no pertenece a esta organización.",
  "invalid-reference":
    "El centro o tipo seleccionado ya no está disponible.",
  "invalid-required-coaches":
    "Los entrenadores necesarios deben ser un número entero entre 0 y 20.",
  "invalid-status": "El estado seleccionado no es válido.",
  "invalid-time": "La hora de inicio debe ser anterior a la hora de fin.",
  "invalid-timezone": "La zona horaria de la organización no es válida.",
  "invalid-timestamp": "La fecha u hora del evento no es válida.",
  "invalid-title": "El titulo del evento debe ser corto y seguro.",
  "invalid-visibility": "La visibilidad de evento no está habilitada.",
  "load-failed": "No se han podido cargar los datos.",
  "missing-fields": "Completa los campos obligatorios.",
  "no-active-memberships": "No hay accesos activos para este usuario.",
  no_active_memberships: "No hay accesos activos para este usuario.",
  "not-actionable": "El evento no admite esa acción ahora.",
  "not-found": "El evento ya no está disponible.",
  "notes-too-long": "Las notas no pueden superar 1000 caracteres.",
  "organization-not-found": "La organización solicitada no está disponible.",
  organization_not_found: "La organización solicitada no está disponible.",
  "organization-required":
    "Elige una organización antes de gestionar contexto operativo.",
  organization_required:
    "Elige una organización antes de gestionar bloques operativos.",
  "permission-denied": "Tu rol no permite gestionar eventos operativos.",
  "person-profile-inactive": "El perfil visible seleccionado no está activo.",
  "person-profile-internal":
    "Los perfiles internos no pueden asignarse como entrenadores operativos.",
  "person-profile-without-active-coach":
    "Elige una ficha de entrenador activa para crear jornadas previstas.",
  "save-failed": "No se han podido guardar los cambios.",
  "template-out-of-range":
    "La semana seleccionada no cruza el rango de validez de esa plantilla.",
  "template-week-has-template":
    "Esta semana ya tiene una plantilla aplicada. Confirma la sustitución desde Plantillas.",
  "work-window-required": "No se ha recibido la jornada prevista.",
};

const successDescriptions: Partial<Record<keyof typeof successMessages, string>> = {
  "template-applied":
    "Se han creado los bloques y se han asignado los entrenadores por defecto definidos en la plantilla.",
  "template-already-applied":
    "La semana ya tenía los bloques de esa plantilla, así que no se han duplicado.",
  "template-replaced":
    "Solo se ha sustituido la semana seleccionada. Las demas semanas conservan su plantilla base.",
  "work-window-created":
    "La franja queda como presencia prevista del personal, sin crear bloques ni fichajes.",
  "work-windows-created":
    "Las franjas quedan como presencia prevista del personal, sin crear bloques ni fichajes.",
  "work-window-deactivated":
    "La franja deja de mostrarse como activa, sin borrar historial operativo.",
  "work-window-updated":
    "La semana se recalcula al vuelo con la nueva planificación prevista.",
  "operational-event-created":
    "El contexto ya aparece en la semana si su visibilidad lo permite.",
  "operational-event-updated": "El resumen semanal ya usa los datos actuales.",
  "operational-event-cancelled": "El evento queda marcado como cancelado.",
  "operational-event-archived": "El evento sale de la superficie semanal.",
  "operational-event-reactivated": "El evento vuelve a estar activo.",
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

const operationalEventTypeLabels: Record<string, string> = {
  closure: "Cierre",
  community_event: "Comunidad",
  competition: "Competicion",
  external_event: "Evento externo",
  holiday: "Festivo",
  internal_event: "Evento",
  maintenance: "Mantenimiento",
  open_day: "Jornada abierta",
  seminar: "Seminario",
};

const operationalEventImpactLabels: Record<string, string> = {
  context_only: "Contexto",
  coverage_review_needed: "Revisar cobertura",
  schedule_review_needed: "Revisar horario",
  staffing_needed: "Necesita personal",
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

  const coverageStateParam = getParam(params.coverage_state);
  const mineOnly = getBooleanParam(params.mine);
  const risksOnly = getBooleanParam(params.risks_only);
  const showWorkWindows = getBooleanParam(params.work_windows);

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

  if (showWorkWindows.invalid) {
    ignoredFilters.push("jornada prevista");
  }

  return {
    filters: {
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
      showWorkWindows: showWorkWindows.invalid
        ? true
        : getParam(params.work_windows)
          ? showWorkWindows.value
          : true,
    } satisfies ScheduleFilters,
    ignoredFilters,
  };
}

function getScheduleFilterPathOptions(
  filters: ScheduleFilters,
  view?: ScheduleView | null,
) {
  return {
    centerId: filters.centerId,
    classTypeId: filters.classTypeId,
    coachProfileId: filters.coachProfileId,
    coverageState: filters.coverageState,
    mineOnly: filters.mineOnly,
    risksOnly: filters.risksOnly,
    showWorkWindows: filters.showWorkWindows,
    view,
  };
}

function getActiveFilterCount(
  filters: ScheduleFilters,
  { includeCenter = true }: { includeCenter?: boolean } = {},
) {
  return [
    includeCenter ? filters.centerId : null,
    filters.coachProfileId,
    filters.classTypeId,
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
    if (block.status === "cancelled") {
      return false;
    }

    if (filters.centerId && block.center_id !== filters.centerId) {
      return false;
    }

    if (filters.classTypeId && block.class_type_id !== filters.classTypeId) {
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

async function getScheduleDocumentProgrammingByBlock({
  blocks,
  organizationId,
}: {
  blocks: ScheduleBlockRow[];
  organizationId: string;
}) {
  const entriesByBlock = new Map<string, DocumentProgrammingEntry[]>();

  if (blocks.length === 0) {
    return {
      data: entriesByBlock,
      ok: true,
    };
  }

  const results = await Promise.all(
    blocks.map(async (block) => {
      try {
        const result = await listDocumentProgrammingForBlock({
          accessLevel: "read_metadata",
          limit: 8,
          organizationId,
          scheduleBlockId: block.id,
        });

        return {
          blockId: block.id,
          result,
        };
      } catch {
        return {
          blockId: block.id,
          result: {
            error: "load-failed",
            ok: false,
          } as const,
        };
      }
    }),
  );
  let ok = true;

  for (const item of results) {
    if (item.result.ok) {
      entriesByBlock.set(item.blockId, item.result.data);
    } else {
      ok = false;
      entriesByBlock.set(item.blockId, []);
    }
  }

  return {
    data: entriesByBlock,
    ok,
  };
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

  const [
    linkedPersonProfilesResult,
    userPersonProfilesResult,
    membershipsResult,
  ] = await Promise.all([
    personProfileIds.length > 0
      ? supabase
          .from("person_profiles")
          .select("id, display_name, status, user_id, visibility_status")
          .eq("organization_id", organizationId)
          .in("id", personProfileIds)
      : Promise.resolve({ data: [], error: null }),
    userIds.length > 0
      ? supabase
          .from("person_profiles")
          .select("id, display_name, status, user_id, visibility_status")
          .eq("organization_id", organizationId)
          .in("user_id", userIds)
      : Promise.resolve({ data: [], error: null }),
    userIds.length > 0
      ? supabase
          .from("organization_memberships")
          .select("user_id, status")
          .eq("organization_id", organizationId)
          .in("user_id", userIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (linkedPersonProfilesResult.error) {
    throw new Error(
      `Could not load person profiles: ${linkedPersonProfilesResult.error.message}`,
    );
  }

  if (userPersonProfilesResult.error) {
    throw new Error(
      `Could not load user person profiles: ${userPersonProfilesResult.error.message}`,
    );
  }

  if (membershipsResult.error) {
    throw new Error(
      `Could not load membership statuses: ${membershipsResult.error.message}`,
    );
  }

  const linkedPersonProfiles =
    linkedPersonProfilesResult.data satisfies PersonProfileRow[];
  const userPersonProfiles =
    userPersonProfilesResult.data satisfies PersonProfileRow[];
  const personProfilesById = new Map(
    [...linkedPersonProfiles, ...userPersonProfiles].map((personProfile) => [
      personProfile.id,
      personProfile,
    ]),
  );

  return {
    coachProfiles: coachProfiles satisfies CoachProfileRow[],
    memberships: membershipsResult.data satisfies MembershipStatusRow[],
    personProfiles: [...personProfilesById.values()],
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

function addDaysToDateString(value: string, days: number) {
  const { day, month, year } = parseDateParts(value);
  const date = new Date(Date.UTC(year, month - 1, day + days));

  return toDateString(date);
}

function getBufferedEventRange({
  rangeEnd,
  rangeStart,
}: {
  rangeEnd: string;
  rangeStart: string;
}) {
  return {
    rangeEnd: `${addDaysToDateString(rangeEnd, 1)}T23:59:59.999Z`,
    rangeStart: `${addDaysToDateString(rangeStart, -1)}T00:00:00.000Z`,
  };
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

function getSafeTimeZone(timezone: string | null | undefined) {
  if (!timezone) {
    return "UTC";
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return timezone;
  } catch {
    return "UTC";
  }
}

function getDatePartsInTimeZone(value: Date | string, timezone: string) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const formatter = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    timeZone: getSafeTimeZone(timezone),
    year: "numeric",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value]),
  );

  return {
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    month: Number(parts.month),
    year: Number(parts.year),
  };
}

function getDateStringInTimeZone(value: Date | string, timezone: string) {
  const parts = getDatePartsInTimeZone(value, timezone);

  if (!parts) {
    return "";
  }

  return [
    String(parts.year).padStart(4, "0"),
    String(parts.month).padStart(2, "0"),
    String(parts.day).padStart(2, "0"),
  ].join("-");
}

function getMinutesInTimeZone(value: Date | string, timezone: string) {
  const parts = getDatePartsInTimeZone(value, timezone);

  return parts ? parts.hour * 60 + parts.minute : 0;
}

function formatOperationalEventClock(value: string, timezone: string) {
  try {
    return new Intl.DateTimeFormat("es-ES", {
      hour: "2-digit",
      hourCycle: "h23",
      minute: "2-digit",
      timeZone: getSafeTimeZone(timezone),
    }).format(new Date(value));
  } catch {
    return "";
  }
}

function timeToMinutes(value: string) {
  const [hours, minutes] = formatTime(value).split(":").map(Number);

  return hours * 60 + minutes;
}

function getHourSlots(
  blocks: ScheduleBlockRow[],
  timedEventRanges: { end: number; start: number }[] = [],
) {
  if (blocks.length === 0 && timedEventRanges.length === 0) {
    return Array.from({ length: 15 }, (_, index) => index + 6);
  }

  const starts = [
    ...blocks.map((block) => timeToMinutes(block.start_time)),
    ...timedEventRanges.map((range) => range.start),
  ];
  const ends = [
    ...blocks.map((block) => timeToMinutes(block.end_time)),
    ...timedEventRanges.map((range) => range.end),
  ];
  const minHour = Math.max(
    0,
    Math.min(...starts.map((start) => Math.floor(start / 60))) - 1,
  );
  const maxHour = Math.min(
    23,
    Math.max(...ends.map((end) => Math.ceil(end / 60))) + 1,
  );

  return Array.from({ length: maxHour - minHour + 1 }, (_, index) => minHour + index);
}

const WEEKLY_TIMELINE_HOUR_HEIGHT = 112;
const WEEKLY_TIMELINE_STACKED_BLOCK_HEIGHT = 76;
const WEEKLY_TIMELINE_STACKED_BLOCK_GAP = 8;
const WEEKLY_TIMELINE_HOUR_INSET = 8;

function minutesToTime(value: number) {
  const bounded = Math.max(0, Math.min(23 * 60 + 59, value));
  const hours = Math.floor(bounded / 60);
  const minutes = bounded % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function getFreeRangesForHour(blocks: ScheduleBlockRow[], hour: number) {
  const slotStart = hour * 60;
  const slotEnd = Math.min((hour + 1) * 60, 24 * 60);
  const occupiedRanges = blocks
    .map((block) => ({
      end: Math.min(timeToMinutes(block.end_time), slotEnd),
      start: Math.max(timeToMinutes(block.start_time), slotStart),
    }))
    .filter((range) => range.start < range.end)
    .sort((a, b) => a.start - b.start);
  const freeRanges: { end: number; start: number }[] = [];
  let cursor = slotStart;

  for (const range of occupiedRanges) {
    if (range.start > cursor) {
      freeRanges.push({ end: range.start, start: cursor });
    }

    cursor = Math.max(cursor, range.end);
  }

  if (cursor < slotEnd) {
    freeRanges.push({ end: slotEnd, start: cursor });
  }

  return freeRanges.filter((range) => range.end - range.start >= 15);
}

function dedupeBlocks(blocks: ScheduleBlockRow[]) {
  return [...new Map(blocks.map((block) => [block.id, block])).values()];
}

function sortScheduleBlocksByTime(blocks: ScheduleBlockRow[]) {
  return [...blocks].sort((first, second) => {
    const startDifference =
      timeToMinutes(first.start_time) - timeToMinutes(second.start_time);

    if (startDifference !== 0) {
      return startDifference;
    }

    return timeToMinutes(first.end_time) - timeToMinutes(second.end_time);
  });
}

function groupBlocksByStartHour(blocks: ScheduleBlockRow[]) {
  return sortScheduleBlocksByTime(blocks).reduce((groups, block) => {
    const hour = Math.floor(timeToMinutes(block.start_time) / 60);
    const group = groups.get(hour) ?? [];
    group.push(block);
    groups.set(hour, group);

    return groups;
  }, new Map<number, ScheduleBlockRow[]>());
}

type WeeklyTimelineHourLayout = {
  height: number;
  hour: number;
  top: number;
};

function getWeeklyTimelineLayout({
  blocksByDate,
  days,
  hourSlots,
}: {
  blocksByDate: Map<string, ScheduleBlockRow[]>;
  days: string[];
  hourSlots: number[];
}) {
  const layouts: WeeklyTimelineHourLayout[] = [];
  let top = 0;

  for (const hour of hourSlots) {
    const maxStackCount = Math.max(
      0,
      ...days.map((day) => {
        const blocks = blocksByDate.get(day) ?? [];

        return blocks.filter(
          (block) => Math.floor(timeToMinutes(block.start_time) / 60) === hour,
        ).length;
      }),
    );
    const stackedHeight =
      maxStackCount > 1
        ? WEEKLY_TIMELINE_HOUR_INSET * 2 +
          maxStackCount * WEEKLY_TIMELINE_STACKED_BLOCK_HEIGHT +
          (maxStackCount - 1) * WEEKLY_TIMELINE_STACKED_BLOCK_GAP
        : WEEKLY_TIMELINE_HOUR_HEIGHT;
    const height = Math.max(WEEKLY_TIMELINE_HOUR_HEIGHT, stackedHeight);

    layouts.push({ height, hour, top });
    top += height;
  }

  return {
    layouts,
    layoutsByHour: new Map(layouts.map((layout) => [layout.hour, layout])),
    totalHeight: top,
  };
}

function getTimelineTopForMinute({
  layoutsByHour,
  minute,
}: {
  layoutsByHour: Map<number, WeeklyTimelineHourLayout>;
  minute: number;
}) {
  const hour = Math.floor(minute / 60);
  const layout = layoutsByHour.get(hour);

  if (!layout) {
    const layouts = [...layoutsByHour.values()].sort(
      (first, second) => first.hour - second.hour,
    );
    const previousLayout = [...layouts]
      .reverse()
      .find((item) => item.hour < hour);

    if (previousLayout) {
      return previousLayout.top + previousLayout.height;
    }

    return 0;
  }

  return (
    layout.top +
    ((minute - hour * 60) / 60) * WEEKLY_TIMELINE_HOUR_HEIGHT
  );
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
  url.searchParams.delete("event_id");
  url.searchParams.set("block_id", blockId);

  return `${url.pathname}${url.search}`;
}

function getOperationalEventPanelPath({
  basePath,
  eventId,
}: {
  basePath: string;
  eventId: string;
}) {
  const url = new URL(basePath, "http://boxops.local");
  url.searchParams.delete("block_id");
  url.searchParams.set("event_id", eventId);

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

function getOperationalEventTypeLabel(eventType: string) {
  return operationalEventTypeLabels[eventType] ?? "Evento";
}

function getOperationalEventImpactLabel(impactLevel: string) {
  return operationalEventImpactLabels[impactLevel] ?? "Contexto";
}

function getOperationalEventTimeZone(
  event: OperationalEventRow,
  fallbackTimeZone: string,
) {
  return getSafeTimeZone(event.timezone || fallbackTimeZone);
}

function getOperationalEventEndForDayRange(event: OperationalEventRow) {
  if (!event.ends_at) {
    return new Date(event.starts_at);
  }

  const endsAt = new Date(event.ends_at);

  return Number.isNaN(endsAt.getTime())
    ? new Date(event.starts_at)
    : new Date(endsAt.getTime() - 1);
}

function getOperationalEventVisibleDays({
  days,
  event,
  timezone,
}: {
  days: string[];
  event: OperationalEventRow;
  timezone: string;
}) {
  const eventTimeZone = getOperationalEventTimeZone(event, timezone);
  const startDay = getDateStringInTimeZone(event.starts_at, eventTimeZone);
  const endDay = getDateStringInTimeZone(
    getOperationalEventEndForDayRange(event),
    eventTimeZone,
  );

  if (!startDay || !endDay) {
    return [];
  }

  return days.filter((day) => day >= startDay && day <= endDay);
}

function groupOperationalEventsByDate({
  days,
  events,
  timezone,
}: {
  days: string[];
  events: OperationalEventRow[];
  timezone: string;
}) {
  const groups = new Map<string, OperationalEventRow[]>(
    days.map((day) => [day, []]),
  );

  for (const event of events) {
    for (const day of getOperationalEventVisibleDays({ days, event, timezone })) {
      const dayEvents = groups.get(day) ?? [];
      dayEvents.push(event);
      groups.set(day, dayEvents);
    }
  }

  for (const [day, dayEvents] of groups.entries()) {
    groups.set(
      day,
      dayEvents.sort((first, second) => {
        if (first.all_day !== second.all_day) {
          return first.all_day ? -1 : 1;
        }

        const firstZone = getOperationalEventTimeZone(first, timezone);
        const secondZone = getOperationalEventTimeZone(second, timezone);
        const firstMinutes = getMinutesInTimeZone(first.starts_at, firstZone);
        const secondMinutes = getMinutesInTimeZone(second.starts_at, secondZone);

        if (firstMinutes !== secondMinutes) {
          return firstMinutes - secondMinutes;
        }

        return first.title.localeCompare(second.title, "es");
      }),
    );
  }

  return groups;
}

function filterOperationalEvents({
  events,
  filters,
}: {
  events: OperationalEventRow[];
  filters: ScheduleFilters;
}) {
  if (!filters.centerId) {
    return events;
  }

  return events.filter(
    (event) => !event.center_id || event.center_id === filters.centerId,
  );
}

function getTimedOperationalEventRangeForDay({
  day,
  event,
  timezone,
}: {
  day: string;
  event: OperationalEventRow;
  timezone: string;
}) {
  if (event.all_day) {
    return null;
  }

  const eventTimeZone = getOperationalEventTimeZone(event, timezone);
  const startDay = getDateStringInTimeZone(event.starts_at, eventTimeZone);
  const endDay = getDateStringInTimeZone(
    getOperationalEventEndForDayRange(event),
    eventTimeZone,
  );

  if (!startDay || !endDay || day < startDay || day > endDay) {
    return null;
  }

  const originalEndDay = event.ends_at
    ? getDateStringInTimeZone(event.ends_at, eventTimeZone)
    : startDay;
  const start = day === startDay
    ? getMinutesInTimeZone(event.starts_at, eventTimeZone)
    : 0;
  const end = event.ends_at && day === originalEndDay
    ? getMinutesInTimeZone(event.ends_at, eventTimeZone)
    : 24 * 60;

  if (end <= start) {
    return null;
  }

  return { end, start };
}

function getTimedOperationalEventRanges({
  days,
  events,
  timezone,
}: {
  days: string[];
  events: OperationalEventRow[];
  timezone: string;
}) {
  return events.flatMap((event) =>
    days.flatMap((day) => {
      const range = getTimedOperationalEventRangeForDay({
        day,
        event,
        timezone,
      });

      return range ? [range] : [];
    }),
  );
}

function formatOperationalEventTimeLabel({
  event,
  timezone,
}: {
  event: OperationalEventRow;
  timezone: string;
}) {
  const eventTimeZone = getOperationalEventTimeZone(event, timezone);

  if (event.all_day) {
    return "Todo el día";
  }

  const start = formatOperationalEventClock(event.starts_at, eventTimeZone);
  const end = event.ends_at
    ? formatOperationalEventClock(event.ends_at, eventTimeZone)
    : "";

  return end ? `${start}-${end}` : start;
}

function getOperationalEventToneClasses(event: OperationalEventRow) {
  if (event.event_type === "holiday" || event.event_type === "closure") {
    return "border-primary/25 bg-primary/10 text-primary";
  }

  if (
    event.impact_level === "coverage_review_needed" ||
    event.impact_level === "staffing_needed"
  ) {
    return "border-amber-200 bg-amber-50 text-amber-900";
  }

  return "border-sky-200 bg-sky-50 text-sky-950";
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
      personProfileId: coachProfile.person_profile_id ?? personProfile.id,
    };
  }

  if (coachProfile.user_id) {
    return {
      detail: `Cuenta sin persona visible (${shortId(coachProfile.user_id)})`,
      id: coachProfile.id,
      isFallback: true,
      label: `Entrenador sin perfil visible ${shortId(coachProfile.id)}`,
      personProfileId: coachProfile.person_profile_id ?? null,
    };
  }

  return {
    detail: `Perfil técnico incompleto ${shortId(coachProfile.id)}`,
    id: coachProfile.id,
    isFallback: true,
    label: `Entrenador sin perfil visible ${shortId(coachProfile.id)}`,
    personProfileId: coachProfile.person_profile_id ?? null,
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
  const personProfilesByUserId = new Map(
    personProfiles.flatMap((personProfile) =>
      personProfile.user_id
        ? [[personProfile.user_id, personProfile] as const]
        : [],
    ),
  );
  const displays = coachProfiles.map((coachProfile) =>
    getCoachDisplay({
      coachProfile,
      membership: coachProfile.user_id
        ? membershipsByUserId.get(coachProfile.user_id)
        : undefined,
      personProfile: coachProfile.person_profile_id
        ? personProfilesById.get(coachProfile.person_profile_id)
        : coachProfile.user_id
          ? personProfilesByUserId.get(coachProfile.user_id)
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
        : coachProfile.user_id
          ? personProfilesByUserId.get(coachProfile.user_id)
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
      "border-red-200 bg-red-50 text-red-950 ring-red-200/70 hover:bg-red-100",
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
    return "Ausencia en revisión";
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

function ScheduleCollapsibleCard({
  children,
  className,
  contentClassName,
  description,
  icon,
  summary,
  title,
}: {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  description: string;
  icon: ReactNode;
  summary?: ReactNode;
  title: string;
}) {
  return (
    <details
      className={cn(
        "group rounded-xl bg-card text-card-foreground ring-1 ring-foreground/10",
        className,
      )}
    >
      <summary className="flex cursor-pointer list-none items-start justify-between gap-4 px-4 py-4 outline-none transition-colors hover:bg-muted/45 focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center text-muted-foreground">
            {icon}
          </span>
          <span className="min-w-0 space-y-1">
            <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 font-heading text-base font-medium leading-snug">
              <span className="truncate">{title}</span>
              {summary ? (
                <span className="flex shrink-0 flex-wrap items-center gap-1.5">
                  {summary}
                </span>
              ) : null}
            </span>
            <span className="block text-sm text-muted-foreground">
              {description}
            </span>
          </span>
        </span>
        <span
          className={cn(
            buttonVariants({ size: "sm", variant: "outline" }),
            "min-h-11 shrink-0 px-3 md:min-h-0 md:px-2.5 group-open:bg-muted",
          )}
        >
          <span className="group-open:hidden">Mostrar</span>
          <span className="hidden group-open:inline">Ocultar</span>
          <ChevronDown
            aria-hidden="true"
            className="size-3.5 transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
          />
        </span>
      </summary>
      <div
        className={cn("border-t border-border px-4 py-4", contentClassName)}
      >
        {children}
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
      <StaffWorkWindowsHiddenInput initialVisible={filters.showWorkWindows} />
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
          <StaffWorkWindowsHiddenInput initialVisible={filters.showWorkWindows} />
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
              {centers.length === 0 ? (
                <option value="">Sin centros</option>
              ) : null}
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
  const activeFilterCount = getActiveFilterCount(filters, {
    includeCenter: false,
  });
  const clearFiltersPath = getSchedulePath({
    day: selectedDay,
    organizationId,
    showWorkWindows: filters.showWorkWindows,
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

      <ScheduleCollapsibleCard
        className="hidden md:block"
        description={`${filteredBlockCount} de ${totalBlockCount} bloque${
          totalBlockCount === 1 ? "" : "s"
        } visibles en la vista.`}
        icon={<Filter aria-hidden="true" className="size-4" />}
        summary={
          activeFilterCount > 0 ? (
            <Badge variant="outline">
              {activeFilterCount} filtro{activeFilterCount === 1 ? "" : "s"}
            </Badge>
          ) : null
        }
        title="Filtros"
      >
        <form
          action="/app/schedule"
          className="grid gap-3 md:grid-cols-2 xl:grid-cols-6"
          method="get"
        >
          <input name="organizationId" type="hidden" value={organizationId} />
          <input name="week" type="hidden" value={weekStart} />
          <input name="view" type="hidden" value={view} />
          <StaffWorkWindowsHiddenInput initialVisible={filters.showWorkWindows} />
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
              {centers.length === 0 ? (
                <option value="">Sin centros</option>
              ) : null}
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

          <div className="flex flex-wrap items-end gap-2 md:col-span-2 xl:col-span-6">
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
      </ScheduleCollapsibleCard>
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
  activeCenters,
  activeClassTypes,
  canCreateEvents,
  canCreateScheduleBlocks,
  currentWeekStart,
  defaultCreationDate,
  filters,
  organizationId,
  returnPath,
  view,
  weekEnd,
  weekStart,
}: {
  activeCenters: CenterRow[];
  activeClassTypes: ClassTypeRow[];
  canCreateEvents: boolean;
  canCreateScheduleBlocks: boolean;
  currentWeekStart: string;
  defaultCreationDate: string;
  filters: ScheduleFilters;
  organizationId: string;
  returnPath: string;
  view: ScheduleView;
  weekEnd: string;
  weekStart: string;
}) {
  const previousWeek = getAdjacentWeekStart(weekStart, -1);
  const nextWeek = getAdjacentWeekStart(weekStart, 1);
  const filterPathOptions = getScheduleFilterPathOptions(filters, view);
  const weekLabel = formatWeekRange(weekStart, weekEnd);
  const canCreateWork =
    canCreateScheduleBlocks &&
    activeCenters.length > 0 &&
    activeClassTypes.length > 0;
  const canCreateAny = canCreateEvents || canCreateWork;

  return (
    <div className="sticky top-[calc(env(safe-area-inset-top)+4rem)] z-20 rounded-xl border border-border/70 bg-background/95 p-2 shadow-sm backdrop-blur md:top-4 md:z-30 md:p-3">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-2 px-1 md:px-0">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <CalendarDays aria-hidden="true" className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">
              {weekLabel}
            </p>
          </div>
          {canCreateAny ? (
            <ScheduleSlotCreateDialog
              activeCenters={activeCenters}
              activeClassTypes={activeClassTypes}
              canCreateEvents={canCreateEvents}
              canCreateScheduleBlocks={canCreateScheduleBlocks}
              className="ml-auto"
              defaultEndTime="08:00"
              defaultStartTime="07:00"
              filters={filters}
              organizationId={organizationId}
              returnPath={returnPath}
              serviceDate={defaultCreationDate}
              tooltipLabel="Crear bloques"
              triggerLabel="Crear bloque, evento o festivo"
              triggerVariant="button"
              view={view}
              weekStart={weekStart}
            />
          ) : null}
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
              <span className="sr-only">Semana</span>
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
  eventCount = 0,
}: {
  blocks: ScheduleBlockRow[];
  coverageByBlock: Map<string, ScheduleBlockCoverage>;
  eventCount?: number;
}) {
  if (blocks.length === 0) {
    return eventCount > 0 ? "bg-primary" : "bg-muted-foreground/40";
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
  operationalEvents,
  organizationId,
  selectedDay,
  timezone,
  weekStart,
}: {
  blocks: ScheduleBlockRow[];
  coverageByBlock: Map<string, ScheduleBlockCoverage>;
  days: string[];
  filters: ScheduleFilters;
  operationalEvents: OperationalEventRow[];
  organizationId: string;
  selectedDay: string;
  timezone: string;
  weekStart: string;
}) {
  const blocksByDate = groupBlocksByDate(blocks);
  const eventsByDate = groupOperationalEventsByDate({
    days,
    events: operationalEvents,
    timezone,
  });

  return (
    <div className="md:hidden">
      <div className="overflow-hidden pb-1">
        <div className="grid grid-cols-7 gap-1.5">
          {days.map((day, index) => {
            const dayBlocks = blocksByDate.get(day) ?? [];
            const dayEvents = eventsByDate.get(day) ?? [];
            const active = day === selectedDay;

            return (
              <Link
                aria-current={active ? "date" : undefined}
                aria-label={`${formatServiceDate(day)}. ${
                  dayBlocks.length
                } bloque${dayBlocks.length === 1 ? "" : "s"}. ${
                  dayEvents.length
                } contexto${dayEvents.length === 1 ? "" : "s"}`}
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
                    getDayCoverageDotClass({
                      blocks: dayBlocks,
                      coverageByBlock,
                      eventCount: dayEvents.length,
                    }),
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
  className,
  classType,
  coachDisplaysById,
  compact = false,
  coverage,
}: {
  assignments: ScheduleBlockAssignmentRow[];
  basePath: string;
  block: ScheduleBlockRow;
  center?: CenterRow;
  className?: string;
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
      className={cn(
        "group relative isolate flex min-h-[76px] min-w-0 cursor-pointer flex-col justify-between gap-2 overflow-hidden rounded-xl border p-3 text-left text-sm ring-1 transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:min-h-24 md:rounded-lg",
        compact ? "md:min-h-0 md:gap-1.5 md:p-2" : "",
        getScheduleBlockToneClasses(tone),
        className,
      )}
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
      <span className="flex min-w-0 flex-col gap-1.5 pl-3">
        <span className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="font-mono text-xs font-semibold tabular-nums">
            {formatTime(block.start_time)}-{formatTime(block.end_time)}
          </span>
          <span className="max-w-full truncate rounded-full bg-background px-2 py-0.5 text-[11px] font-medium ring-1 ring-foreground/5">
            {stateLabel}
          </span>
          {absenceImpactLabel && absenceImpactLabel !== stateLabel ? (
            <span className="max-w-full truncate rounded-full bg-background px-2 py-0.5 text-[11px] font-medium ring-1 ring-foreground/5">
              {absenceImpactLabel}
            </span>
          ) : null}
          {block.is_template_exception ? (
            <span className="max-w-full truncate rounded-full bg-background px-2 py-0.5 text-[11px] font-medium ring-1 ring-foreground/5">
              Cambiado
            </span>
          ) : null}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-semibold leading-5 tracking-tight">
            {classType?.name ?? "Actividad"}
          </span>
          <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs opacity-80">
            <ColorSwatch color={classType?.color ?? null} />
            <span className="truncate">
              {center?.name ?? "Centro no disponible"}
            </span>
          </span>
        </span>
      </span>
      <span className="flex min-w-0 items-center justify-between gap-2 pl-3 text-xs leading-4 opacity-80">
        <span className="truncate">{coachSummary}</span>
        <PanelRightOpen
          aria-hidden="true"
          className="size-3.5 shrink-0 opacity-60 transition-opacity group-hover:opacity-100"
        />
      </span>
    </RouteStateButton>
  );
}

function OperationalEventContextPill({
  center,
  className,
  event,
  href,
  timezone,
}: {
  center?: CenterRow;
  className?: string;
  event: OperationalEventRow;
  href?: string;
  timezone: string;
}) {
  const content = (
    <>
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-mono font-semibold tabular-nums">
          {formatOperationalEventTimeLabel({ event, timezone })}
        </span>
        <span className="rounded-full bg-background px-1.5 py-0.5 font-medium ring-1 ring-foreground/5">
          {getOperationalEventTypeLabel(event.event_type)}
        </span>
        <span className="truncate font-semibold">{event.title}</span>
      </div>
      <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 opacity-80">
        <span>{getOperationalEventImpactLabel(event.impact_level)}</span>
        {center ? <span className="truncate">{center.name}</span> : null}
      </div>
    </>
  );
  const pillClassName = cn(
    "min-w-0 rounded-lg border px-2.5 py-2 text-left text-xs shadow-sm",
    href &&
      "cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
    getOperationalEventToneClasses(event),
    className,
  );

  if (href) {
    return (
      <RouteStateButton
        aria-label={`Abrir evento ${event.title}`}
        className={pillClassName}
        data-operational-event-context="true"
        data-operational-event-trigger="true"
        href={href}
      >
        {content}
      </RouteStateButton>
    );
  }

  return (
    <div
      className={cn(
        "min-w-0 rounded-lg border px-2.5 py-2 text-left text-xs shadow-sm",
        getOperationalEventToneClasses(event),
        className,
      )}
      data-operational-event-context="true"
    >
      {content}
    </div>
  );
}

function OperationalEventsDayStrip({
  basePath,
  centersById,
  events,
}: {
  basePath: string;
  centersById: Map<string, CenterRow>;
  events: OperationalEventRow[];
}) {
  if (events.length === 0) {
    return null;
  }

  return (
    <div
      className="mt-2 flex min-w-0 flex-wrap gap-1"
      data-operational-event-day-strip="true"
    >
      {events.slice(0, 3).map((event) => (
        <RouteStateButton
          aria-label={`Abrir evento ${event.title}`}
          className={cn(
            "min-w-0 truncate rounded-full border px-2 py-0.5 text-left text-[10px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
            getOperationalEventToneClasses(event),
          )}
          data-operational-event-trigger="true"
          href={getOperationalEventPanelPath({ basePath, eventId: event.id })}
          key={event.id}
        >
          {getOperationalEventTypeLabel(event.event_type)} · {event.title}
          {event.center_id && centersById.get(event.center_id)
            ? ` · ${centersById.get(event.center_id)?.name}`
            : ""}
        </RouteStateButton>
      ))}
      {events.length > 3 ? (
        <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          +{events.length - 3}
        </span>
      ) : null}
    </div>
  );
}

function OperationalEventsList({
  basePath,
  centersById,
  events,
  timezone,
}: {
  basePath: string;
  centersById: Map<string, CenterRow>;
  events: OperationalEventRow[];
  timezone: string;
}) {
  if (events.length === 0) {
    return null;
  }

  return (
    <div className="grid gap-2" data-operational-event-list="true">
      {events.map((event) => (
        <OperationalEventContextPill
          center={event.center_id ? centersById.get(event.center_id) : undefined}
          event={event}
          href={getOperationalEventPanelPath({ basePath, eventId: event.id })}
          key={event.id}
          timezone={timezone}
        />
      ))}
    </div>
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
  operationalEvents,
  timezone,
}: {
  assignments: ScheduleBlockAssignmentRow[];
  basePath: string;
  blocks: ScheduleBlockRow[];
  centers: CenterRow[];
  classTypes: ClassTypeRow[];
  coachDisplaysById: Map<string, CoachDisplay>;
  coverageByBlock: Map<string, ScheduleBlockCoverage>;
  days: string[];
  operationalEvents: OperationalEventRow[];
  timezone: string;
}) {
  const centersById = new Map(centers.map((center) => [center.id, center]));
  const classTypesById = new Map(
    classTypes.map((classType) => [classType.id, classType]),
  );
  const groupedBlocks = groupBlocksByDate(blocks);
  const groupedEvents = groupOperationalEventsByDate({
    days,
    events: operationalEvents,
    timezone,
  });
  const assignmentsByBlockId = groupAssignmentsByBlockId(assignments);

  return (
    <div className="space-y-5">
      {days.map((serviceDate) => {
        const dayBlocks = groupedBlocks.get(serviceDate) ?? [];
        const dayEvents = groupedEvents.get(serviceDate) ?? [];

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
                  {dayBlocks.length === 0 && dayEvents.length === 0
                    ? "Sin bloques ni contexto operativo"
                    : `${dayBlocks.length} bloque${
                        dayBlocks.length === 1 ? "" : "s"
                      } · ${dayEvents.length} contexto${
                        dayEvents.length === 1 ? "" : "s"
                      }`}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="outline">
                {dayBlocks.length} bloque{dayBlocks.length === 1 ? "" : "s"}
              </Badge>
              {dayEvents.length > 0 ? (
                <Badge variant="secondary">
                  {dayEvents.length} contexto{dayEvents.length === 1 ? "" : "s"}
                </Badge>
              ) : null}
            </div>
          </div>
          {dayBlocks.length === 0 && dayEvents.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-background/60 px-4 py-5 text-sm text-muted-foreground">
              No hay clases ni bloques en este día.
            </div>
          ) : (
            <div className="grid gap-3">
              <OperationalEventsList
                basePath={basePath}
                centersById={centersById}
                events={dayEvents}
                timezone={timezone}
              />
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
  operationalEvents,
  selectedDay,
  timezone,
}: {
  assignments: ScheduleBlockAssignmentRow[];
  basePath: string;
  blocks: ScheduleBlockRow[];
  centers: CenterRow[];
  classTypes: ClassTypeRow[];
  coachDisplaysById: Map<string, CoachDisplay>;
  coverageByBlock: Map<string, ScheduleBlockCoverage>;
  operationalEvents: OperationalEventRow[];
  selectedDay: string;
  timezone: string;
}) {
  const centersById = new Map(centers.map((center) => [center.id, center]));
  const classTypesById = new Map(
    classTypes.map((classType) => [classType.id, classType]),
  );
  const assignmentsByBlockId = groupAssignmentsByBlockId(assignments);
  const dayBlocks = blocks.filter((block) => block.service_date === selectedDay);
  const dayEvents =
    groupOperationalEventsByDate({
      days: [selectedDay],
      events: operationalEvents,
      timezone,
    }).get(selectedDay) ?? [];

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

      {dayBlocks.length === 0 && dayEvents.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-background/60 px-4 py-6 text-sm text-muted-foreground">
          No hay clases ni bloques visibles en este día.
        </div>
      ) : (
        <div className="grid gap-3">
          <OperationalEventsList
            basePath={basePath}
            centersById={centersById}
            events={dayEvents}
            timezone={timezone}
          />
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

function getStaffWorkWindowSummaryTooltip({
  details,
  name,
}: {
  details: StaffWorkWindowHourSummaryItem["details"];
  name: string;
}) {
  const timeRanges = [...new Set(details.map((detail) => detail.timeRange))];

  if (timeRanges.length === 1) {
    return `${name}: ${details
      .map((detail) => detail.dayLabel)
      .join(", ")} / ${timeRanges[0]}`;
  }

  return `${name}: ${details
    .map((detail) => `${detail.dayLabel} ${detail.timeRange}`)
    .join("; ")}`;
}

function listStaffWorkWindowSummariesForHourRow({
  days,
  hour,
  staffWorkWindows,
}: {
  days: string[];
  hour: number;
  staffWorkWindows: StaffWorkWindowOccurrence[];
}): StaffWorkWindowHourSummaryItem[] {
  const slotStart = hour * 60;
  const slotEnd = slotStart + 60;
  const daySet = new Set(days);
  const peopleInSlot = new Map<
    string,
    {
      details: Map<
        string,
        StaffWorkWindowHourSummaryItem["details"][number]
      >;
      name: string;
      startMinute: number;
    }
  >();

  for (const window of staffWorkWindows) {
    if (!daySet.has(window.serviceDate)) {
      continue;
    }

    const startMinute = timeToMinutes(window.start_time);

    if (
      startMinute < slotEnd &&
      slotStart < timeToMinutes(window.end_time)
    ) {
      const current = peopleInSlot.get(window.person_profile_id);
      const nextDetails =
        current?.details ??
        new Map<string, StaffWorkWindowHourSummaryItem["details"][number]>();
      const detail = {
        centerLabel: window.centerName ?? "Toda la organización",
        dayLabel: formatServiceDate(window.serviceDate),
        sortKey: `${window.serviceDate}-${formatTime(window.start_time)}`,
        timeRange: `${formatTime(window.start_time)}-${formatTime(
          window.end_time,
        )}`,
      };
      nextDetails.set(
        `${window.serviceDate}-${detail.timeRange}-${detail.centerLabel}`,
        detail,
      );

      if (!current || startMinute < current.startMinute) {
        peopleInSlot.set(window.person_profile_id, {
          details: nextDetails,
          name: window.personDisplayName,
          startMinute,
        });
      } else {
        peopleInSlot.set(window.person_profile_id, {
          ...current,
          details: nextDetails,
        });
      }
    }
  }

  return [...peopleInSlot.entries()]
    .sort((first, second) => {
      if (first[1].startMinute !== second[1].startMinute) {
        return first[1].startMinute - second[1].startMinute;
      }

      return first[1].name.localeCompare(second[1].name);
    })
    .map(([personProfileId, person]) => {
      const details = [...person.details.values()].sort((first, second) => {
        return first.sortKey.localeCompare(second.sortKey);
      });

      return {
        details,
        id: `${personProfileId}-${hour}`,
        name: person.name,
        tooltip: getStaffWorkWindowSummaryTooltip({
          details,
          name: person.name,
        }),
      };
    });
}

function WeeklyScheduleView({
  activeCenters,
  activeClassTypes,
  assignments,
  basePath,
  blocks,
  canCreateEvents,
  canManageSchedule,
  centers,
  classTypes,
  coachDisplaysById,
  coverageByBlock,
  days,
  filters,
  operationalEvents,
  organizationId,
  selectedDay,
  showStaffWorkWindows,
  staffWorkWindows,
  timezone,
  weekStart,
}: {
  activeCenters: CenterRow[];
  activeClassTypes: ClassTypeRow[];
  assignments: ScheduleBlockAssignmentRow[];
  basePath: string;
  blocks: ScheduleBlockRow[];
  canCreateEvents: boolean;
  canManageSchedule: boolean;
  centers: CenterRow[];
  classTypes: ClassTypeRow[];
  coachDisplaysById: Map<string, CoachDisplay>;
  coverageByBlock: Map<string, ScheduleBlockCoverage>;
  days: string[];
  filters: ScheduleFilters;
  operationalEvents: OperationalEventRow[];
  organizationId: string;
  selectedDay: string;
  showStaffWorkWindows: boolean;
  staffWorkWindows: StaffWorkWindowOccurrence[];
  timezone: string;
  weekStart: string;
}) {
  const centersById = new Map(centers.map((center) => [center.id, center]));
  const classTypesById = new Map(
    classTypes.map((classType) => [classType.id, classType]),
  );
  const assignmentsByBlockId = groupAssignmentsByBlockId(assignments);
  const blocksByDate = groupBlocksByDate(blocks);
  const eventsByDate = groupOperationalEventsByDate({
    days,
    events: operationalEvents,
    timezone,
  });
  const hourSlots = getHourSlots(
    blocks,
    getTimedOperationalEventRanges({
      days,
      events: operationalEvents,
      timezone,
    }),
  );
  const timelineLayout = getWeeklyTimelineLayout({
    blocksByDate,
    days,
    hourSlots,
  });

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
        operationalEvents={operationalEvents}
        selectedDay={selectedDay}
        timezone={timezone}
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
          operationalEvents={operationalEvents}
          timezone={timezone}
        />
      </div>

      <Card
        className="hidden overflow-hidden bg-background xl:block"
        data-schedule-week-grid="desktop"
      >
        <CardContent className="p-0">
          <div className="grid grid-cols-[72px_repeat(7,minmax(0,1fr))] border-b border-border">
            <div className="border-r border-border bg-muted/45 px-2.5 py-3 text-xs font-medium text-muted-foreground">
              Hora
            </div>
            {days.map((day, index) => (
              <div
                className="border-r border-border px-2.5 py-3 last:border-r-0"
                data-schedule-week-day={index}
                key={day}
              >
                <p className="text-xs font-medium uppercase text-muted-foreground">
                  {formatWeekdayShort(day)}
                </p>
                <p className="mt-1 font-mono text-lg font-semibold">
                  {formatDayNumber(day)}
                </p>
                <OperationalEventsDayStrip
                  basePath={basePath}
                  centersById={centersById}
                  events={eventsByDate.get(day) ?? []}
                />
              </div>
            ))}
          </div>

          <div
            className="grid grid-cols-[72px_repeat(7,minmax(0,1fr))]"
            style={{
              minHeight: timelineLayout.totalHeight,
            }}
          >
            <div className="relative border-r border-border bg-muted/30">
              {timelineLayout.layouts.map((layout) => (
                <div
                  className="absolute inset-x-0 border-b border-border px-2.5 py-3 text-muted-foreground"
                  key={layout.hour}
                  style={{
                    height: layout.height,
                    top: layout.top,
                  }}
                >
                  <p className="font-mono text-xs">
                    {String(layout.hour).padStart(2, "0")}:00
                  </p>
                  <StaffWorkWindowHourSummary
                    initialVisible={showStaffWorkWindows}
                    items={listStaffWorkWindowSummariesForHourRow({
                      days,
                      hour: layout.hour,
                      staffWorkWindows,
                    })}
                  />
                </div>
              ))}
            </div>
            {days.map((day) => {
              const dayBlocks = blocksByDate.get(day) ?? [];
              const dayEvents = eventsByDate.get(day) ?? [];

              return (
                <div
                  className="relative min-w-0 border-r border-border/80 last:border-r-0"
                  key={day}
                  style={{
                    minHeight: timelineLayout.totalHeight,
                  }}
                >
                  {timelineLayout.layouts.map((layout) => {
                    return (
                      <div
                        className="absolute inset-x-0 border-b border-border/80"
                        key={`${day}-${layout.hour}`}
                        style={{
                          height: layout.height,
                          top: layout.top,
                        }}
                      />
                    );
                  })}

                  {hourSlots.map((hour) =>
                    getFreeRangesForHour(dayBlocks, hour).map((range) => {
                      const rangeTop =
                        getTimelineTopForMinute({
                          layoutsByHour: timelineLayout.layoutsByHour,
                          minute: range.start,
                        }) + 4;
                      const rangeHeight = Math.max(
                        24,
                        getTimelineTopForMinute({
                          layoutsByHour: timelineLayout.layoutsByHour,
                          minute: range.end,
                        }) -
                          getTimelineTopForMinute({
                            layoutsByHour: timelineLayout.layoutsByHour,
                            minute: range.start,
                          }) -
                          8,
                      );

                      return (
                        <div
                          className="absolute inset-x-2 z-0"
                          key={`${day}-${range.start}-${range.end}`}
                          style={{
                            height: rangeHeight,
                            top: rangeTop,
                          }}
                        >
                          <ScheduleSlotCreateDialog
                            activeCenters={activeCenters}
                            activeClassTypes={activeClassTypes}
                            canCreateEvents={canCreateEvents}
                            canCreateScheduleBlocks={canManageSchedule}
                            className="min-h-0"
                            defaultEndTime={minutesToTime(range.end)}
                            defaultStartTime={minutesToTime(range.start)}
                            filters={filters}
                            organizationId={organizationId}
                            returnPath={basePath}
                            serviceDate={day}
                            view="week"
                            weekStart={weekStart}
                          />
                        </div>
                      );
                    }),
                  )}

                  {dayEvents.map((event) => {
                    const range = getTimedOperationalEventRangeForDay({
                      day,
                      event,
                      timezone,
                    });

                    if (!range) {
                      return null;
                    }

                    const top =
                      getTimelineTopForMinute({
                        layoutsByHour: timelineLayout.layoutsByHour,
                        minute: range.start,
                      }) +
                      10;
                    const height = Math.max(
                      34,
                      getTimelineTopForMinute({
                        layoutsByHour: timelineLayout.layoutsByHour,
                        minute: range.end,
                      }) -
                        getTimelineTopForMinute({
                          layoutsByHour: timelineLayout.layoutsByHour,
                          minute: range.start,
                        }) -
                        16,
                    );

                    return (
                      <div
                        className="absolute inset-x-3 z-20"
                        key={event.id}
                        style={{
                          height,
                          top,
                        }}
                      >
                        <OperationalEventContextPill
                          center={
                            event.center_id
                              ? centersById.get(event.center_id)
                              : undefined
                          }
                          className="h-full w-full overflow-hidden py-1.5 shadow-none"
                          event={event}
                          href={getOperationalEventPanelPath({
                            basePath,
                            eventId: event.id,
                          })}
                          timezone={timezone}
                        />
                      </div>
                    );
                  })}

                  {[...groupBlocksByStartHour(dayBlocks).entries()].flatMap(
                    ([hour, hourBlocks]) =>
                      hourBlocks.map((block, stackIndex) => ({
                        block,
                        hour,
                        stackIndex,
                        stackCount: hourBlocks.length,
                      })),
                  ).map(({ block, hour, stackIndex, stackCount }) => {
                    const coverage = coverageByBlock.get(block.id);

                    if (!coverage) {
                      throw new Error(
                        "Missing coverage state for schedule block.",
                      );
                    }

                    const startMinute = timeToMinutes(block.start_time);
                    const endMinute = timeToMinutes(block.end_time);
                    const layout = timelineLayout.layoutsByHour.get(hour);
                    const stacked = stackCount > 1 && Boolean(layout);
                    const top = stacked
                      ? (layout?.top ?? 0) +
                        WEEKLY_TIMELINE_HOUR_INSET +
                        stackIndex *
                          (WEEKLY_TIMELINE_STACKED_BLOCK_HEIGHT +
                            WEEKLY_TIMELINE_STACKED_BLOCK_GAP)
                      : getTimelineTopForMinute({
                          layoutsByHour: timelineLayout.layoutsByHour,
                          minute: startMinute,
                        }) + 8;
                    const height = stacked
                      ? WEEKLY_TIMELINE_STACKED_BLOCK_HEIGHT
                      : Math.max(
                          58,
                          getTimelineTopForMinute({
                            layoutsByHour: timelineLayout.layoutsByHour,
                            minute: endMinute,
                          }) -
                            getTimelineTopForMinute({
                              layoutsByHour: timelineLayout.layoutsByHour,
                              minute: startMinute,
                            }) -
                            12,
                        );

                    return (
                      <div
                        className="absolute inset-x-2 z-10"
                        key={block.id}
                        style={{
                          height,
                          top,
                        }}
                      >
                        <ScheduleBlockSummaryLink
                          assignments={assignmentsByBlockId.get(block.id) ?? []}
                          basePath={basePath}
                          block={block}
                          center={centersById.get(block.center_id)}
                          className={cn(
                            "h-full md:min-h-0",
                            stacked && "md:gap-1 md:px-2 md:pb-2 md:pt-1.5",
                          )}
                          classType={classTypesById.get(block.class_type_id)}
                          coachDisplaysById={coachDisplaysById}
                          compact
                          coverage={coverage}
                        />
                      </div>
                    );
                  })}
              </div>
            );
            })}
          </div>
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
  operationalEvents,
  organizationId,
  timezone,
}: {
  blocks: ScheduleBlockRow[];
  centers: CenterRow[];
  classTypes: ClassTypeRow[];
  coverageByBlock: Map<string, ScheduleBlockCoverage>;
  filters: ScheduleFilters;
  month: ReturnType<typeof getMonthResolution>;
  operationalEvents: OperationalEventRow[];
  organizationId: string;
  timezone: string;
}) {
  const centersById = new Map(centers.map((center) => [center.id, center]));
  const classTypesById = new Map(
    classTypes.map((classType) => [classType.id, classType]),
  );
  const blocksByDate = groupBlocksByDate(blocks);
  const eventsByDate = groupOperationalEventsByDate({
    days: month.days,
    events: operationalEvents,
    timezone,
  });
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
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline">{blocks.length} bloques visibles</Badge>
            {operationalEvents.length > 0 ? (
              <Badge variant="secondary">
                {operationalEvents.length} contexto
                {operationalEvents.length === 1 ? "" : "s"}
              </Badge>
            ) : null}
          </div>
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
            const dayEvents = eventsByDate.get(day) ?? [];
            const dayRisks = dayBlocks.filter((block) => {
              const coverage = coverageByBlock.get(block.id);

              return coverage ? isScheduleCoverageRisk(coverage) : false;
            });
            const hasEvent = dayEvents.some(
              (event) => event.event_type !== "holiday",
            ) || dayBlocks.some((block) => {
              const classType = classTypesById.get(block.class_type_id);

              return classType?.category === "event" || classType?.category === "competition";
            });
            const hasHoliday = dayEvents.some(
              (event) => event.event_type === "holiday",
            ) || dayBlocks.some((block) => {
              const classType = classTypesById.get(block.class_type_id);

              return classType?.category === "holiday";
            });
            const hasChange = dayBlocks.some(
              (block) => block.is_template_exception || block.status === "changed",
            );
            const firstEventWithCenter = dayEvents.find((event) => event.center_id);
            const firstCenter = dayBlocks[0]
              ? centersById.get(dayBlocks[0].center_id)
              : firstEventWithCenter?.center_id
                ? centersById.get(firstEventWithCenter.center_id)
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
                  ) : dayEvents.length > 0 ? (
                    <span className="truncate text-xs font-medium">
                      {dayEvents.length} contexto{dayEvents.length === 1 ? "" : "s"}
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
  const selectedOperationalEventIdParam = getParam(params.event_id);
  const selectedOperationalEventId =
    selectedOperationalEventIdParam &&
    isScheduleUuid(selectedOperationalEventIdParam)
      ? selectedOperationalEventIdParam
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
  const isSupportMode = resolution.membership.accessMode === "platform_support";
  const canManageEvents = canManageOperationalEvents(resolution.membership.role);
  const canReviewAbsenceImpact = canManageAbsenceRequests(
    resolution.membership.role,
  );
  const eventWindow = getBufferedEventRange({
    rangeEnd: scheduleView === "month" ? month.monthEnd : week.weekEnd,
    rangeStart: scheduleView === "month" ? month.monthStart : week.weekStart,
  });

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

  const [
    blocks,
    monthBlocks,
    centers,
    classTypes,
    coachContext,
    staffWorkWindowResult,
    operationalEventsResult,
  ] = await Promise.all([
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
    listStaffWorkWindowsForWeek({
      includeInactive: false,
      organizationId: resolution.organization.id,
      weekEnd: week.weekEnd,
      weekStart: week.weekStart,
    })
      .then((data) => ({ data, ok: true as const }))
      .catch(() => ({
        data: {
          occurrences: [],
          windows: [],
        },
        ok: false as const,
      })),
    listOperationalEvents({
      limit: 200,
      organizationId: resolution.organization.id,
      rangeEnd: eventWindow.rangeEnd,
      rangeStart: eventWindow.rangeStart,
      statuses: ["active"],
    }).catch(() => ({ error: "load-failed", ok: false as const })),
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
  const coverageTraceResult =
    canManageSchedule && scheduleView !== "month" && coverageBlocks.length > 0
      ? await listCoverageTraceItems({
          absenceImpacts: absenceImpactResult.ok ? absenceImpactResult.data : [],
          limit: 120,
          organizationId: resolution.organization.id,
          scheduleBlockIds: coverageBlocks.map((block) => block.id),
          serviceDateFrom: week.weekStart,
          serviceDateTo: week.weekEnd,
        })
      : { data: new Map<string, CoverageTraceItem[]>(), ok: true as const };
  const documentProgrammingResult =
    !isSupportMode && scheduleView !== "month" && blocks.length > 0
      ? await getScheduleDocumentProgrammingByBlock({
          blocks,
          organizationId: resolution.organization.id,
        })
      : { data: new Map<string, DocumentProgrammingEntry[]>(), ok: true };
  const { filters, ignoredFilters } = resolveScheduleFilters({
    centers,
    classTypes,
    coachProfiles: coachContext.coachProfiles,
    params,
  });
  const activeCenters = centers.filter((center) => center.status === "active");
  const calendarCenterOptions =
    activeCenters.length > 0 ? activeCenters : centers;
  const explicitCenterIdParam = getParam(params.center_id);
  const rememberedCenterId = explicitCenterIdParam
    ? null
    : (await cookies())
        .get(getScheduleCenterPreferenceCookieName(resolution.organization.id))
        ?.value;
  const validRememberedCenterId =
    isScheduleCenterPreferenceValue(rememberedCenterId) &&
    calendarCenterOptions.some((center) => center.id === rememberedCenterId)
      ? rememberedCenterId
      : null;
  const scheduleFilters = {
    ...filters,
    centerId:
      filters.centerId ??
      validRememberedCenterId ??
      calendarCenterOptions[0]?.id ??
      null,
  } satisfies ScheduleFilters;
  const filteredBlocks = applyScheduleFilters({
    assignments,
    blocks,
    coverageByBlock,
    filters: scheduleFilters,
    myScheduleCoachProfileId:
      myScheduleFilter.status === "matched"
        ? myScheduleFilter.coachProfileId
        : null,
  });
  const filteredMonthBlocks = applyScheduleFilters({
    assignments,
    blocks: monthBlocks,
    coverageByBlock,
    filters: scheduleFilters,
    myScheduleCoachProfileId:
      myScheduleFilter.status === "matched"
        ? myScheduleFilter.coachProfileId
        : null,
  });
  const operationalEvents = operationalEventsResult.ok
    ? operationalEventsResult.data
    : [];
  const filteredOperationalEvents = filterOperationalEvents({
    events: operationalEvents,
    filters: scheduleFilters,
  });
  const activeClassTypes = classTypes.filter(
    (classType) => classType.status === "active",
  );
  const activeWorkClassTypes = activeClassTypes.filter(
    (classType) =>
      !["competition", "event", "holiday"].includes(classType.category),
  );
  const scheduleCreationClassTypes =
    activeWorkClassTypes.length > 0 ? activeWorkClassTypes : activeClassTypes;
  const scheduleBasePath = getScheduleBasePath({
    day: scheduleView === "week" ? selectedDay : null,
    error: null,
    filters: scheduleFilters,
    organizationId: resolution.organization.id,
    status: null,
    view: explicitScheduleView,
    weekStart: week.weekStart,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        blockCount={
          scheduleView === "month" ? filteredMonthBlocks.length : filteredBlocks.length
        }
        organizationName={resolution.organization.name}
        role={resolution.membership.role}
      />

      <WeekControls
        activeCenters={activeCenters}
        activeClassTypes={scheduleCreationClassTypes}
        canCreateEvents={canManageEvents}
        canCreateScheduleBlocks={canManageSchedule}
        currentWeekStart={currentWeek.weekStart}
        defaultCreationDate={selectedDay}
        filters={scheduleFilters}
        organizationId={resolution.organization.id}
        returnPath={scheduleBasePath}
        view={scheduleView}
        weekEnd={week.weekEnd}
        weekStart={week.weekStart}
      />

      <ScheduleViewTabs
        filters={scheduleFilters}
        organizationId={resolution.organization.id}
        view={scheduleView}
        weekStart={week.weekStart}
      />

      {scheduleView === "week" ? (
        <MobileWeekDayPicker
          blocks={filteredBlocks}
          coverageByBlock={coverageByBlock}
          days={week.days}
          filters={scheduleFilters}
          operationalEvents={filteredOperationalEvents}
          organizationId={resolution.organization.id}
          selectedDay={selectedDay}
          timezone={resolution.organization.timezone}
          weekStart={week.weekStart}
        />
      ) : null}

      <ScheduleFiltersCard
        allCoaches={allCoaches}
        centers={calendarCenterOptions}
        classTypes={classTypes}
        filteredBlockCount={
          scheduleView === "month" ? filteredMonthBlocks.length : filteredBlocks.length
        }
        filters={scheduleFilters}
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
        <TransientFeedbackBanner
          description={
            successDescriptions[status] ??
            "La semana ya muestra los bloques actuales."
          }
          title={successMessages[status]}
          tone="success"
        />
      ) : null}

      {error && errorMessages[error] ? (
        <TransientFeedbackBanner
          description={errorMessages[error]}
          title="No se han guardado los cambios"
          tone="error"
        />
      ) : null}

      {!absenceImpactResult.ok ? (
        <Alert>
          <AlertTitle>Impacto de ausencia no disponible</AlertTitle>
          <AlertDescription>
            El horario se muestra sin cruzar ausencias aprobadas o en revisión.
          </AlertDescription>
        </Alert>
      ) : null}

      {!staffWorkWindowResult.ok ? (
        <Alert>
          <AlertTitle>Jornada prevista no disponible</AlertTitle>
          <AlertDescription>
            El horario se muestra sin el contexto de presencia prevista.
          </AlertDescription>
        </Alert>
      ) : null}

      {!operationalEventsResult.ok ? (
        <Alert>
          <AlertTitle>Contexto operativo no disponible</AlertTitle>
          <AlertDescription>
            El horario se muestra sin eventos ni festivos hasta que se pueda
            recargar esa informacion.
          </AlertDescription>
        </Alert>
      ) : null}

      <section className="scroll-mt-24 space-y-3" id="schedule-board">
        <div
          className={cn(
            "flex flex-wrap items-start gap-3",
            scheduleView === "week" ? "justify-end" : "justify-between",
          )}
        >
          {scheduleView !== "week" ? (
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold tracking-tight">
                  {scheduleView === "month" ? "Mes" : "Agenda"}
                </h2>
              </div>
              <p className="text-sm text-muted-foreground">
                {scheduleView === "month"
                  ? "Overview para navegar días con riesgos, eventos o cambios."
                  : "Lista limpia por día para revisar bloques sin perder contexto."}
              </p>
            </div>
          ) : null}
          <div className={scheduleView === "week" ? "ml-auto" : undefined}>
            <ScheduleCenterSwitcher
              centers={calendarCenterOptions}
              defaultCenterId={calendarCenterOptions[0]?.id ?? null}
              filters={scheduleFilters}
              organizationId={resolution.organization.id}
              selectedCenterId={scheduleFilters.centerId}
              selectedDay={scheduleView === "week" ? selectedDay : null}
              view={scheduleView}
              weekStart={week.weekStart}
            />
          </div>
        </div>

        {scheduleView === "month" ? (
          <MonthlyScheduleView
            blocks={filteredMonthBlocks}
            centers={centers}
            classTypes={classTypes}
            coverageByBlock={coverageByBlock}
            filters={scheduleFilters}
            month={month}
            operationalEvents={filteredOperationalEvents}
            organizationId={resolution.organization.id}
            timezone={resolution.organization.timezone}
          />
        ) : scheduleFilters.mineOnly &&
          filteredBlocks.length === 0 &&
          filteredOperationalEvents.length === 0 ? (
          <MyScheduleEmptyCard
            myScheduleFilter={myScheduleFilter}
            organizationId={resolution.organization.id}
            weekStart={week.weekStart}
          />
        ) : blocks.length === 0 &&
          filteredOperationalEvents.length === 0 &&
          (scheduleView !== "week" || !canManageSchedule) ? (
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
        ) : filteredBlocks.length === 0 &&
          filteredOperationalEvents.length === 0 &&
          blocks.length > 0 &&
          (scheduleView !== "week" || !canManageSchedule) ? (
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
                    centerId: scheduleFilters.centerId,
                    organizationId: resolution.organization.id,
                    showWorkWindows: scheduleFilters.showWorkWindows,
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
                operationalEvents={filteredOperationalEvents}
                timezone={resolution.organization.timezone}
              />
            ) : (
              <WeeklyScheduleView
                activeCenters={activeCenters}
                activeClassTypes={scheduleCreationClassTypes}
                assignments={assignments}
                basePath={scheduleBasePath}
                blocks={filteredBlocks}
                canCreateEvents={canManageEvents}
                canManageSchedule={canManageSchedule}
                centers={centers}
                classTypes={classTypes}
                coachDisplaysById={coachDisplaysById}
                coverageByBlock={coverageByBlock}
                days={week.days}
                filters={scheduleFilters}
                operationalEvents={filteredOperationalEvents}
                organizationId={resolution.organization.id}
                selectedDay={selectedDay}
                showStaffWorkWindows={scheduleFilters.showWorkWindows}
                staffWorkWindows={staffWorkWindowResult.data.occurrences}
                timezone={resolution.organization.timezone}
                weekStart={week.weekStart}
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
            coverageTraceByBlock={
              coverageTraceResult.ok
                ? [...coverageTraceResult.data.entries()]
                : []
            }
            coverageTraceLoadError={!coverageTraceResult.ok}
            documentProgrammingByBlock={[
              ...documentProgrammingResult.data.entries(),
            ]}
            documentProgrammingLoadError={!documentProgrammingResult.ok}
            filters={scheduleFilters}
            initialSelectedBlockId={selectedBlockId}
            organizationId={resolution.organization.id}
            staffWorkWindows={staffWorkWindowResult.data.occurrences}
            view={scheduleView}
            weekEnd={week.weekEnd}
            weekStart={week.weekStart}
          />
        ) : null}

        <ScheduleOperationalEventPanels
          basePath={scheduleBasePath}
          canManageEvents={canManageEvents}
          centers={centers}
          initialSelectedEventId={selectedOperationalEventId}
          operationalEvents={filteredOperationalEvents}
          organizationId={resolution.organization.id}
          timezone={resolution.organization.timezone}
          weekStart={week.weekStart}
        />
      </section>

    </div>
  );
}

function PageHeader({
  blockCount,
  organizationName,
  role,
}: {
  blockCount?: number;
  organizationName?: string;
  role?: string;
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
          {roleLabel ? <Badge variant="outline">{roleLabel}</Badge> : null}
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
      </div>
    </section>
  );
}
