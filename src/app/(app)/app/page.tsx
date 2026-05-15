import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CalendarRange,
  Clock3,
  CheckCircle2,
  ClipboardCheck,
  Dumbbell,
  FileClock,
  Inbox,
  MapPin,
  ShieldCheck,
  Timer,
  UserRound,
  UsersRound,
  XCircle,
} from "lucide-react";

import {
  approveTimeWeeklyApprovalFromHome,
  rejectTimeWeeklyApprovalFromHome,
} from "./actions";
import { NextAssignedCountdown } from "@/components/features/next-assigned-countdown";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getLoginPath } from "@/lib/auth/redirects";
import {
  canManageAbsenceRequests,
  canReviewTimeTracking,
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
  getCentersPath,
  getClassTypesPath,
  getCoachesPath,
  getCoveragePath,
  getAccountPath,
  getRequestsPath,
  getSchedulePath,
  getScheduleTemplatesPath,
  getTimePath,
} from "@/lib/navigation/app-paths";
import { getNextAssignedLeadCopy } from "@/lib/next-assigned-copy";
import {
  getOwnNextAssignedScheduleBlock,
  type OwnNextAssignedScheduleBlock,
  type OwnNextAssignedScheduleState,
} from "@/lib/own-schedule";
import {
  calculateScheduleCoverageByBlock,
  formatTimeForInput,
  getAdjacentWeekStart,
  getScheduleCoverageStateLabel,
  isScheduleCoverageRisk,
  resolveWeek,
  type ScheduleBlockCoverage,
  type ScheduleCoverageState,
} from "@/lib/schedule-blocks";
import { createClient } from "@/lib/supabase/server";
import {
  listOwnTimeWeeklyApprovals,
  listTimeWeeklyApprovalsForReview,
  type TimeTrackingErrorCode,
  type TimeWeeklyApprovalRow,
  type TimeWeeklyApprovalStatus,
} from "@/lib/time-tracking";
import type { Tables } from "@/types/supabase";

export const dynamic = "force-dynamic";

type AppPageProps = {
  searchParams: Promise<{
    error?: string | string[];
    organizationId?: string | string[];
    status?: string | string[];
    week?: string | string[];
  }>;
};

type ScheduleBlockRow = Pick<
  Tables<"schedule_blocks">,
  | "center_id"
  | "class_type_id"
  | "end_time"
  | "id"
  | "is_template_exception"
  | "required_coaches"
  | "service_date"
  | "start_time"
  | "status"
>;

type CenterRow = Pick<Tables<"centers">, "id" | "name" | "status">;

type ClassTypeRow = Pick<
  Tables<"class_types">,
  "category" | "color" | "id" | "name" | "status"
>;

type ScheduleBlockAssignmentRow = Pick<
  Tables<"schedule_block_assignments">,
  "assignment_status" | "coach_profile_id" | "id" | "schedule_block_id"
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

type GreetingPersonProfileRow = Pick<
  Tables<"person_profiles">,
  | "display_name"
  | "full_name"
  | "preferred_alias"
  | "status"
  | "visibility_status"
>;

type CoachDisplay = {
  id: string;
  label: string;
};

type DashboardData = {
  absenceImpactLoadError: string | null;
  assignments: ScheduleBlockAssignmentRow[];
  blocks: ScheduleBlockRow[];
  centers: CenterRow[];
  classTypes: ClassTypeRow[];
  coachDisplaysById: Map<string, CoachDisplay>;
  coverageByBlock: Map<string, ScheduleBlockCoverage>;
};

type RiskItem = {
  block: ScheduleBlockRow;
  coverage: ScheduleBlockCoverage;
};

type WeeklyApprovalPersonRow = Pick<
  Tables<"person_profiles">,
  "display_name" | "full_name" | "id" | "preferred_alias" | "status"
>;

type WeeklyApprovalHomeData = {
  errors: TimeTrackingErrorCode[];
  ownNotices: TimeWeeklyApprovalRow[];
  pendingReview: TimeWeeklyApprovalRow[];
  peopleById: Map<string, WeeklyApprovalPersonRow>;
  recentRejections: TimeWeeklyApprovalRow[];
};

const WEEKLY_REVIEW_PENDING_STATUSES = [
  "pending",
  "submitted",
  "resubmitted",
] as const satisfies readonly TimeWeeklyApprovalStatus[];
const WEEKLY_REVIEW_REJECTION_STATUSES = [
  "correction_required",
  "rejected",
] as const satisfies readonly TimeWeeklyApprovalStatus[];
const WEEKLY_OWN_NOTICE_STATUSES = [
  "submitted",
  "approved",
  "rejected",
  "correction_required",
  "resubmitted",
] as const satisfies readonly TimeWeeklyApprovalStatus[];

const riskPriority: Record<ScheduleCoverageState, number> = {
  uncovered: 1,
  conflict: 2,
  insufficient: 3,
  covered: 4,
  not_required: 5,
  inactive: 6,
};

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
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

function formatLongServiceDate(value: string) {
  try {
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "long",
      timeZone: "UTC",
      weekday: "long",
    }).format(new Date(`${value}T12:00:00.000Z`));
  } catch {
    return value;
  }
}

function shortId(value: string) {
  return value.slice(0, 8);
}

function sortWeeklyApprovalsByActivity(approvals: TimeWeeklyApprovalRow[]) {
  return [...approvals].sort((first, second) => {
    const firstActivity =
      first.updated_at ??
      first.rejected_at ??
      first.approved_at ??
      first.submitted_at ??
      first.created_at;
    const secondActivity =
      second.updated_at ??
      second.rejected_at ??
      second.approved_at ??
      second.submitted_at ??
      second.created_at;

    return (
      secondActivity.localeCompare(firstActivity) ||
      second.week_start_date.localeCompare(first.week_start_date)
    );
  });
}

function getWeeklyApprovalStatusLabel(status: string) {
  const labels: Record<string, string> = {
    approved: "Aprobada",
    correction_required: "Corrección requerida",
    open: "Abierta",
    pending: "Pendiente",
    rejected: "Rechazada",
    reopened: "Reabierta",
    resubmitted: "Reenviada",
    submitted: "Enviada",
    voided: "Anulada",
  };

  return labels[status] ?? status;
}

function getWeeklyApprovalBadgeVariant(status: string) {
  if (status === "approved") {
    return "secondary" as const;
  }

  if (status === "rejected" || status === "correction_required") {
    return "destructive" as const;
  }

  return "outline" as const;
}

function getWeeklyApprovalActivityCopy(
  approval: TimeWeeklyApprovalRow,
  timezone: string,
) {
  if (approval.status === "approved" && approval.approved_at) {
    return `Aprobada ${formatDateTime(approval.approved_at, timezone)}`;
  }

  if (
    (approval.status === "rejected" ||
      approval.status === "correction_required") &&
    approval.rejected_at
  ) {
    return `Revisada ${formatDateTime(approval.rejected_at, timezone)}`;
  }

  if (
    (approval.status === "submitted" ||
      approval.status === "pending" ||
      approval.status === "resubmitted") &&
    approval.submitted_at
  ) {
    return `Enviada ${formatDateTime(approval.submitted_at, timezone)}`;
  }

  return `Actualizada ${formatDateTime(approval.updated_at, timezone)}`;
}

function getSubmissionSourceLabel(source: string) {
  const labels: Record<string, string> = {
    manual: "Manual",
    resubmission: "Reenvío",
    scheduler: "Automático",
    system: "Sistema",
  };

  return labels[source] ?? source;
}

function getOwnWeeklyNoticeTitle(status: string) {
  const titles: Record<string, string> = {
    approved: "Semana aprobada",
    correction_required: "Corrección requerida",
    rejected: "Semana rechazada",
    resubmitted: "Semana reenviada",
    submitted: "Semana enviada",
  };

  return titles[status] ?? getWeeklyApprovalStatusLabel(status);
}

function getOwnWeeklyNoticeDescription(status: string) {
  const descriptions: Record<string, string> = {
    approved:
      "El cierre interno de fichajes de esta semana ya está aprobado.",
    correction_required:
      "Revisa la semana, aplica las correcciones necesarias y vuelve a enviarla cuando esté lista.",
    rejected:
      "La semana necesita revisión antes de volver a enviarse a aprobación.",
    resubmitted:
      "La semana se ha reenviado y vuelve a estar pendiente de revisión interna.",
    submitted:
      "El cierre interno de fichajes está enviado y pendiente de revisión.",
  };

  return (
    descriptions[status] ??
    "Hay una actualización del cierre interno de fichajes."
  );
}

function formatDateTime(value: string, timezone: string) {
  try {
    return new Intl.DateTimeFormat("es-ES", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: timezone,
    }).format(new Date(value));
  } catch {
    return "Fecha no disponible";
  }
}

function getPersonLabel(person: WeeklyApprovalPersonRow | undefined) {
  if (!person) {
    return "Persona no disponible";
  }

  return (
    person.preferred_alias ||
    person.display_name ||
    person.full_name ||
    shortId(person.id)
  );
}

function getWeeklyApprovalTimeHref({
  approval,
  organizationId,
}: {
  approval: TimeWeeklyApprovalRow;
  organizationId: string;
}) {
  return getTimePath({
    organizationId,
    week: approval.week_start_date,
  });
}

async function getWeeklyApprovalPeople({
  approvals,
  organizationId,
}: {
  approvals: TimeWeeklyApprovalRow[];
  organizationId: string;
}) {
  const personIds = [
    ...new Set(approvals.map((approval) => approval.person_profile_id)),
  ];

  if (personIds.length === 0) {
    return {
      error: null,
      peopleById: new Map<string, WeeklyApprovalPersonRow>(),
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("person_profiles")
    .select("id, display_name, full_name, preferred_alias, status")
    .eq("organization_id", organizationId)
    .in("id", personIds);

  if (error) {
    return {
      error: "load_failed" as const,
      peopleById: new Map<string, WeeklyApprovalPersonRow>(),
    };
  }

  return {
    error: null,
    peopleById: new Map(
      (data ?? []).map((person) => [person.id, person as WeeklyApprovalPersonRow]),
    ),
  };
}

async function getWeeklyApprovalHomeData({
  canReview,
  organizationId,
}: {
  canReview: boolean;
  organizationId: string;
}): Promise<WeeklyApprovalHomeData> {
  const [ownResult, pendingResult, rejectedResult] = await Promise.all([
    listOwnTimeWeeklyApprovals({
      limit: 8,
      organizationId,
      statuses: WEEKLY_OWN_NOTICE_STATUSES,
    }),
    canReview
      ? listTimeWeeklyApprovalsForReview({
          limit: 12,
          organizationId,
          statuses: WEEKLY_REVIEW_PENDING_STATUSES,
        })
      : Promise.resolve(null),
    canReview
      ? listTimeWeeklyApprovalsForReview({
          limit: 8,
          organizationId,
          statuses: WEEKLY_REVIEW_REJECTION_STATUSES,
        })
      : Promise.resolve(null),
  ]);
  const errors: TimeTrackingErrorCode[] = [];
  const ownNotices = ownResult.ok ? ownResult.data : [];
  const pendingReview = pendingResult?.ok ? pendingResult.data : [];
  const recentRejections = rejectedResult?.ok ? rejectedResult.data : [];

  if (!ownResult.ok) {
    errors.push(ownResult.error);
  }

  if (pendingResult && !pendingResult.ok) {
    errors.push(pendingResult.error);
  }

  if (rejectedResult && !rejectedResult.ok) {
    errors.push(rejectedResult.error);
  }

  const peopleResult = await getWeeklyApprovalPeople({
    approvals: [...pendingReview, ...recentRejections, ...ownNotices],
    organizationId,
  });

  if (peopleResult.error) {
    errors.push(peopleResult.error);
  }

  return {
    errors,
    ownNotices: sortWeeklyApprovalsByActivity(ownNotices).slice(0, 5),
    pendingReview: sortWeeklyApprovalsByActivity(pendingReview).slice(0, 8),
    peopleById: peopleResult.peopleById,
    recentRejections: sortWeeklyApprovalsByActivity(recentRejections).slice(0, 5),
  };
}

const homeSuccessMessages: Record<string, string> = {
  "weekly-approval-approved":
    "Semana aprobada. El cierre interno de fichajes queda bloqueado para cambios normales.",
  "weekly-approval-correction-required":
    "Semana marcada con corrección requerida. El aviso ya sale del estado canónico del cierre.",
};

const homeErrorMessages: Record<string, string> = {
  authentication_required: "Inicia sesión de nuevo para completar la acción.",
  forbidden:
    "Tu rol no permite revisar cierres semanales de fichaje en esta organización.",
  invalid_notes: "La nota de rechazo es obligatoria para pedir corrección.",
  invalid_organization: "La organización activa no es válida.",
  invalid_weekly_approval: "El cierre semanal seleccionado no está disponible.",
  load_failed: "No se han podido cargar todos los avisos de fichaje.",
  no_active_memberships: "No hay accesos activos para este usuario.",
  organization_not_found: "La organización solicitada no está disponible.",
  organization_required: "Elige una organización antes de continuar.",
  profile_missing:
    "Tu cuenta necesita una ficha de persona vinculada para esta acción.",
  review_failed:
    "No se ha podido revisar el cierre semanal. Comprueba que siga pendiente.",
  signature_required:
    "Para firmar y aprobar necesitas tener guardada tu propia firma interna.",
};

function HomeActionFeedback({
  error,
  organizationId,
  status,
}: {
  error?: string | null;
  organizationId: string;
  status?: string | null;
}) {
  if (status && homeSuccessMessages[status]) {
    return (
      <Alert>
        <CheckCircle2 aria-hidden="true" />
        <AlertTitle>Acción completada</AlertTitle>
        <AlertDescription>{homeSuccessMessages[status]}</AlertDescription>
      </Alert>
    );
  }

  if (!error || !homeErrorMessages[error]) {
    return null;
  }

  return (
    <Alert variant="destructive">
      <AlertTriangle aria-hidden="true" />
      <AlertTitle>No se ha completado la acción</AlertTitle>
      <AlertDescription className="space-y-3">
        <span>{homeErrorMessages[error]}</span>
        {error === "signature_required" ? (
          <span className="block">
            <Button asChild size="sm" variant="secondary">
              <Link href={getAccountPath({ organizationId })}>
                Crear Mi firma
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          </span>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}

async function getGreetingPersonProfile({
  organizationId,
  userId,
}: {
  organizationId: string;
  userId: string;
}) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("person_profiles")
    .select("display_name, full_name, preferred_alias, status, visibility_status")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    throw new Error(`Could not load greeting person profile: ${error.message}`);
  }

  return data satisfies GreetingPersonProfileRow | null;
}

const GREETING_NAME_BLOCKLIST = new Set([
  "admin",
  "admin compatible",
  "administrador",
  "coach",
  "entrenador",
  "manager",
  "manager operativo",
  "owner",
  "propietario",
  "responsable",
]);

function cleanGreetingCandidate(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const cleaned = value.trim().replace(/\s+/g, " ");

  if (!cleaned || GREETING_NAME_BLOCKLIST.has(cleaned.toLocaleLowerCase("es"))) {
    return null;
  }

  return cleaned;
}

function getFirstName(value: string) {
  return value.split(" ")[0] ?? value;
}

function getMetadataString(
  metadata: Record<string, unknown>,
  keys: string[],
) {
  for (const key of keys) {
    const value = cleanGreetingCandidate(metadata[key]);

    if (value) {
      return value;
    }
  }

  return null;
}

function resolveGreetingName({
  personProfile,
  userMetadata,
}: {
  personProfile: GreetingPersonProfileRow | null;
  userMetadata: Record<string, unknown>;
}) {
  const alias =
    cleanGreetingCandidate(personProfile?.preferred_alias) ??
    getMetadataString(userMetadata, ["preferred_alias", "preferredAlias", "alias"]);

  if (alias) {
    return alias;
  }

  const visibleName =
    cleanGreetingCandidate(personProfile?.display_name) ??
    getMetadataString(userMetadata, ["display_name", "displayName"]);

  if (visibleName) {
    return getFirstName(visibleName);
  }

  const fullName =
    cleanGreetingCandidate(personProfile?.full_name) ??
    getMetadataString(userMetadata, ["full_name", "fullName", "name"]);

  return fullName ? getFirstName(fullName) : null;
}

function getBlockHref({
  blockId,
  organizationId,
  serviceDate,
  weekStart,
}: {
  blockId: string;
  organizationId: string;
  serviceDate: string;
  weekStart: string;
}) {
  return getSchedulePath({
    blockId,
    day: serviceDate,
    organizationId,
    view: "week",
    week: weekStart,
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
      "id, center_id, class_type_id, service_date, start_time, end_time, required_coaches, status, is_template_exception",
    )
    .eq("organization_id", organizationId)
    .gte("service_date", weekStart)
    .lte("service_date", weekEnd)
    .order("service_date", { ascending: true })
    .order("start_time", { ascending: true });

  if (error) {
    throw new Error(`Could not load dashboard schedule blocks: ${error.message}`);
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
    throw new Error(`Could not load dashboard centers: ${error.message}`);
  }

  return data satisfies CenterRow[];
}

async function getClassTypes(organizationId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("class_types")
    .select("id, name, category, color, status")
    .eq("organization_id", organizationId)
    .order("status", { ascending: true })
    .order("category", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`Could not load dashboard class types: ${error.message}`);
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
    .select("id, schedule_block_id, coach_profile_id, assignment_status")
    .eq("organization_id", organizationId)
    .in("schedule_block_id", blockIds);

  if (error) {
    throw new Error(`Could not load dashboard assignments: ${error.message}`);
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
    throw new Error(`Could not load dashboard coach profiles: ${error.message}`);
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
      `Could not load dashboard person profiles: ${personProfilesResult.error.message}`,
    );
  }

  if (membershipsResult.error) {
    throw new Error(
      `Could not load dashboard membership statuses: ${membershipsResult.error.message}`,
    );
  }

  return {
    coachProfiles: coachProfiles satisfies CoachProfileRow[],
    memberships: membershipsResult.data satisfies MembershipStatusRow[],
    personProfiles: personProfilesResult.data satisfies PersonProfileRow[],
  };
}

function buildCoachDisplays({
  coachProfiles,
  personProfiles,
}: {
  coachProfiles: CoachProfileRow[];
  personProfiles: PersonProfileRow[];
}) {
  const personProfilesById = new Map(
    personProfiles.map((personProfile) => [personProfile.id, personProfile]),
  );

  return new Map(
    coachProfiles.map((coachProfile) => {
      const personProfile = coachProfile.person_profile_id
        ? personProfilesById.get(coachProfile.person_profile_id)
        : undefined;

      return [
        coachProfile.id,
        {
          id: coachProfile.id,
          label:
            personProfile &&
            personProfile.status === "active" &&
            personProfile.visibility_status === "visible"
              ? personProfile.display_name
              : `Entrenador ${shortId(coachProfile.id)}`,
        } satisfies CoachDisplay,
      ];
    }),
  );
}

async function getDashboardData({
  includeAbsenceImpacts,
  organizationId,
  weekEnd,
  weekStart,
}: {
  includeAbsenceImpacts: boolean;
  organizationId: string;
  weekEnd: string;
  weekStart: string;
}): Promise<DashboardData> {
  const [blocks, centers, classTypes, coachContext] = await Promise.all([
    getScheduleBlocks({ organizationId, weekEnd, weekStart }),
    getCenters(organizationId),
    getClassTypes(organizationId),
    getScheduleCoachContext(organizationId),
  ]);
  const assignments = await getScheduleBlockAssignments({
    blockIds: blocks.map((block) => block.id),
    organizationId,
  });
  const absenceImpactResult =
    includeAbsenceImpacts && blocks.length > 0
      ? await listOperationalAbsenceScheduleImpacts({
          limit: 200,
          organizationId,
          scheduleBlockIds: blocks.map((block) => block.id),
          serviceDateFrom: weekStart,
          serviceDateTo: weekEnd,
        })
      : { data: [], ok: true as const };
  const coverageByBlock = calculateScheduleCoverageByBlock({
    absenceImpacts: absenceImpactResult.ok ? absenceImpactResult.data : [],
    assignments,
    blocks,
    coaches: coachContext.coachProfiles,
    memberships: coachContext.memberships,
    persons: coachContext.personProfiles,
  });

  return {
    absenceImpactLoadError: absenceImpactResult.ok
      ? null
      : absenceImpactResult.error,
    assignments,
    blocks,
    centers,
    classTypes,
    coachDisplaysById: buildCoachDisplays(coachContext),
    coverageByBlock,
  };
}

function getRiskItems({
  blocks,
  coverageByBlock,
}: {
  blocks: ScheduleBlockRow[];
  coverageByBlock: Map<string, ScheduleBlockCoverage>;
}) {
  return blocks
    .flatMap((block) => {
      const coverage = coverageByBlock.get(block.id);

      if (!coverage || !isScheduleCoverageRisk(coverage)) {
        return [];
      }

      return [{ block, coverage }];
    })
    .sort((first, second) => {
      const priority =
        riskPriority[first.coverage.state] - riskPriority[second.coverage.state];

      if (priority !== 0) {
        return priority;
      }

      return (
        first.block.service_date.localeCompare(second.block.service_date) ||
        first.block.start_time.localeCompare(second.block.start_time)
      );
    });
}

function getRiskSummary(riskItems: RiskItem[]) {
  return {
    absenceImpact: riskItems.filter(
      (item) =>
        item.coverage.absenceImpact.coverageNeededCount > 0 ||
        item.coverage.absenceImpact.potentialCount > 0,
    ).length,
    conflict: riskItems.filter((item) => item.coverage.state === "conflict")
      .length,
    insufficient: riskItems.filter(
      (item) => item.coverage.state === "insufficient",
    ).length,
    uncovered: riskItems.filter((item) => item.coverage.state === "uncovered")
      .length,
  };
}

function getCenterSummaries({
  centers,
  data,
  riskItems,
}: {
  centers: CenterRow[];
  data: DashboardData;
  riskItems: RiskItem[];
}) {
  const risksByCenterId = new Map<string, number>();
  const blocksByCenterId = new Map<string, number>();

  for (const block of data.blocks) {
    blocksByCenterId.set(
      block.center_id,
      (blocksByCenterId.get(block.center_id) ?? 0) + 1,
    );
  }

  for (const item of riskItems) {
    risksByCenterId.set(
      item.block.center_id,
      (risksByCenterId.get(item.block.center_id) ?? 0) + 1,
    );
  }

  return centers
    .map((center) => ({
      center,
      blockCount: blocksByCenterId.get(center.id) ?? 0,
      riskCount: risksByCenterId.get(center.id) ?? 0,
    }))
    .filter((summary) => summary.blockCount > 0 || summary.riskCount > 0)
    .sort(
      (first, second) =>
        second.riskCount - first.riskCount ||
        first.center.name.localeCompare(second.center.name, "es"),
    );
}

function PageHeader({
  greetingName,
  organizationName,
  role,
  weekEnd,
  weekStart,
}: {
  greetingName?: string | null;
  organizationName?: string;
  role?: string;
  weekEnd?: string;
  weekStart?: string;
}) {
  const roleLabel = role ? getApplicationRoleLabel(role) : null;
  const greeting = greetingName ? `Hola, ${greetingName}` : "Hola de nuevo";
  const canManageOperational = role ? canManageOperationalData(role) : false;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">Inicio</Badge>
        {organizationName ? (
          <Badge variant="outline">{organizationName}</Badge>
        ) : null}
        {roleLabel ? <Badge variant="outline">{roleLabel}</Badge> : null}
      </div>
      <div className="max-w-3xl space-y-2">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          <ShieldCheck aria-hidden="true" className="size-6 shrink-0" />
          {greeting}
        </h1>
        <p className="hidden text-sm leading-6 text-muted-foreground md:block md:text-base">
          {canManageOperational
            ? "Revisa que esta semana esté bajo control y salta rápido a lo que tienes que resolver."
            : "Consulta tus próximas clases, fichaje y avisos personales sin entrar en gestión operativa."}
        </p>
      </div>
      {weekStart && weekEnd ? (
        <div className="flex items-start gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground lg:max-w-3xl">
          <CalendarDays aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>{formatWeekRange(weekStart, weekEnd)}</span>
        </div>
      ) : null}
    </section>
  );
}

function WeekControls({
  currentWeekStart,
  organizationId,
  showWeekNavigation,
  weekStart,
}: {
  currentWeekStart: string;
  organizationId: string;
  showWeekNavigation: boolean;
  weekStart: string;
}) {
  if (!showWeekNavigation) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild className="w-full min-h-11 sm:w-auto md:min-h-10" variant="secondary">
          <Link
            href={getSchedulePath({
              mineOnly: true,
              organizationId,
              week: currentWeekStart,
            })}
          >
            <CalendarDays aria-hidden="true" />
            Abrir horario
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-3 gap-2 md:hidden">
        <Button asChild className="min-h-11 md:min-h-10" variant="outline">
          <Link
            href={getAppPathForDashboard({
              organizationId,
              week: getAdjacentWeekStart(weekStart, -1),
            })}
          >
            <ArrowLeft aria-hidden="true" />
            Anterior
          </Link>
        </Button>
        <Button asChild className="min-h-11 md:min-h-10" variant="outline">
          <Link
            href={getAppPathForDashboard({
              organizationId,
              week: currentWeekStart,
            })}
          >
            Hoy
          </Link>
        </Button>
        <Button asChild className="min-h-11 md:min-h-10" variant="outline">
          <Link
            href={getAppPathForDashboard({
              organizationId,
              week: getAdjacentWeekStart(weekStart, 1),
            })}
          >
            Siguiente
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
        <Button asChild className="col-span-3 min-h-11 md:min-h-10" variant="secondary">
          <Link href={getSchedulePath({ organizationId, week: weekStart })}>
            <CalendarDays aria-hidden="true" />
            Abrir horario
          </Link>
        </Button>
      </div>

      <div className="hidden flex-wrap items-center gap-2 md:flex">
        <Button asChild size="sm" variant="outline">
          <Link
            href={getAppPathForDashboard({
              organizationId,
              week: getAdjacentWeekStart(weekStart, -1),
            })}
          >
            <ArrowLeft aria-hidden="true" />
            Semana anterior
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link
            href={getAppPathForDashboard({
              organizationId,
              week: currentWeekStart,
            })}
          >
            Hoy
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link
            href={getAppPathForDashboard({
              organizationId,
              week: getAdjacentWeekStart(weekStart, 1),
            })}
          >
            Semana siguiente
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
        <Button asChild size="sm" variant="secondary">
          <Link href={getSchedulePath({ organizationId, week: weekStart })}>
            <CalendarDays aria-hidden="true" />
            Abrir horario
          </Link>
        </Button>
      </div>
    </>
  );
}

function getAppPathForDashboard({
  organizationId,
  week,
}: {
  organizationId: string;
  week: string;
}) {
  const params = new URLSearchParams({
    organizationId,
    week,
  });

  return `/app?${params.toString()}`;
}

function SummaryCards({
  data,
}: {
  data: DashboardData;
}) {
  const activeBlockCount = data.blocks.filter(
    (block) => block.status !== "cancelled" && block.status !== "completed",
  ).length;
  const activeCenterCount = data.centers.filter(
    (center) => center.status === "active",
  ).length;
  const activeClassTypeCount = data.classTypes.filter(
    (classType) => classType.status === "active",
  ).length;
  const cards = [
    {
      label: "Centros activos",
      value: activeCenterCount,
      description: "Sedes disponibles para planificar.",
      icon: MapPin,
    },
    {
      label: "Entrenadores activos",
      value: data.coachDisplaysById.size,
      description: "Equipo operativo visible.",
      icon: UsersRound,
    },
    {
      label: "Tipos de actividad",
      value: activeClassTypeCount,
      description: "Catálogo listo para horarios.",
      icon: Dumbbell,
    },
    {
      label: "Bloques esta semana",
      value: activeBlockCount,
      description: "Bloques no cancelados ni completados.",
      icon: CalendarDays,
    },
  ];

  return (
    <div
      className="grid grid-cols-2 gap-3 lg:grid-cols-4"
      data-tour="dashboard-summary"
    >
      {cards.map((card) => {
        const Icon = card.icon;

        return (
          <Card key={card.label} size="sm">
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-3">
                <span>{card.label}</span>
                <Icon aria-hidden="true" className="size-4 text-muted-foreground" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-mono text-3xl font-semibold">{card.value}</p>
              <p className="mt-1 hidden text-sm text-muted-foreground md:block">
                {card.description}
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function getAbsenceImpactLabel(coverage: ScheduleBlockCoverage) {
  if (coverage.absenceImpact.coverageNeededCount > 0) {
    return "Impacto de ausencia";
  }

  if (coverage.absenceImpact.potentialCount > 0) {
    return "Ausencia en revision";
  }

  return null;
}

function CoverageBadge({ coverage }: { coverage: ScheduleBlockCoverage }) {
  const state = coverage.state;

  return (
    <Badge
      variant={
        state === "uncovered" || state === "conflict"
          ? "destructive"
          : state === "covered"
            ? "secondary"
            : "outline"
      }
    >
      {getScheduleCoverageStateLabel(state)}
    </Badge>
  );
}

function CoverageHero({
  organizationId,
  riskItems,
  weekStart,
}: {
  organizationId: string;
  riskItems: RiskItem[];
  weekStart: string;
}) {
  const riskSummary = getRiskSummary(riskItems);

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardContent className="grid gap-4 py-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={riskItems.length > 0 ? "destructive" : "secondary"}>
              {riskItems.length > 0 ? "Revisar" : "Todo cubierto"}
            </Badge>
            <Badge variant="outline">{riskSummary.uncovered} sin cubrir</Badge>
            <Badge variant="outline">
              {riskSummary.absenceImpact} impacto ausencia
            </Badge>
          </div>
          <div>
            <h2 className="text-xl font-semibold tracking-tight">
              Cobertura de la semana
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {riskItems.length > 0
                ? "Hay clases o bloques que necesitan una decision de cobertura."
                : "No hay riesgos activos con la cobertura actual."}
            </p>
          </div>
        </div>
        <Button asChild className="w-full lg:w-auto">
          <Link href={getCoveragePath({ organizationId, week: weekStart })}>
            Resolver cobertura
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function RiskQueue({
  centersById,
  classTypesById,
  coachDisplaysById,
  organizationId,
  riskItems,
  weekStart,
}: {
  centersById: Map<string, CenterRow>;
  classTypesById: Map<string, ClassTypeRow>;
  coachDisplaysById: Map<string, CoachDisplay>;
  organizationId: string;
  riskItems: RiskItem[];
  weekStart: string;
}) {
  return (
    <Card data-tour="coverage-risks">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle aria-hidden="true" className="size-4" />
          Pendiente
        </CardTitle>
        <CardDescription>
          Clases y bloques que conviene resolver antes de revisar el resto.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {riskItems.length === 0 ? (
          <div className="flex flex-col gap-3 rounded-lg border border-border px-4 py-5">
            <div className="flex items-center gap-2">
              <CheckCircle2 aria-hidden="true" className="size-4" />
              <h2 className="text-sm font-medium">Semana sin riesgos activos</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              No hay clases sin cubrir, cobertura insuficiente, conflictos ni
              impacto de ausencia activo.
            </p>
            <div>
              <Button asChild size="sm" variant="outline">
                <Link href={getSchedulePath({ organizationId, week: weekStart })}>
                  <CalendarDays aria-hidden="true" />
                  Revisar horario
                </Link>
              </Button>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {riskItems.map((item) => {
              const center = centersById.get(item.block.center_id);
              const classType = classTypesById.get(item.block.class_type_id);
              const absenceImpactLabel = getAbsenceImpactLabel(item.coverage);
              const conflictCoachNames = item.coverage.conflictCoachProfileIds
                .map(
                  (coachProfileId) =>
                    coachDisplaysById.get(coachProfileId)?.label ??
                    `Entrenador ${shortId(coachProfileId)}`,
                )
                .join(", ");

              return (
                <div
                  className="grid gap-3 py-4 first:pt-0 last:pb-0 lg:grid-cols-[minmax(0,1fr)_auto]"
                  key={item.block.id}
                >
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <CoverageBadge coverage={item.coverage} />
                      {absenceImpactLabel ? (
                        <Badge variant="outline">{absenceImpactLabel}</Badge>
                      ) : null}
                      {item.block.is_template_exception ? (
                        <Badge variant="outline">Excepción</Badge>
                      ) : null}
                      <Badge variant="outline">
                        {item.coverage.validAssignmentCount}/
                        {item.coverage.requiredCoaches} entrenadores
                      </Badge>
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-medium">
                        {formatServiceDate(item.block.service_date)} ·{" "}
                        {formatTime(item.block.start_time)} -{" "}
                        {formatTime(item.block.end_time)}
                      </h3>
                      <p className="mt-1 truncate text-sm text-muted-foreground">
                        {classType?.name ?? "Tipo no disponible"} ·{" "}
                        {center?.name ?? "Centro no disponible"}
                      </p>
                    </div>
                    {item.coverage.state === "conflict" &&
                    conflictCoachNames ? (
                      <p className="text-sm text-destructive">
                        Solapamiento: {conflictCoachNames}.
                      </p>
                    ) : item.coverage.state === "uncovered" ? (
                      <p className="text-sm text-muted-foreground">
                        No hay ningún entrenador asignado.
                      </p>
                    ) : item.coverage.absenceImpact.coverageNeededCount > 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Impacto de ausencia aprobado: requiere revision de
                        cobertura.
                      </p>
                    ) : item.coverage.absenceImpact.potentialCount > 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Ausencia en revision: puede requerir cobertura si se
                        aprueba.
                      </p>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Faltan entrenadores para cubrir lo necesario.
                      </p>
                    )}
                  </div>
                  <div className="flex items-start lg:justify-end">
                    <Button asChild className="w-full lg:w-auto" size="sm" variant="outline">
                      <Link
                        href={getBlockHref({
                          blockId: item.block.id,
                          organizationId,
                          serviceDate: item.block.service_date,
                          weekStart,
                        })}
                      >
                        Abrir bloque
                        <ArrowRight aria-hidden="true" />
                      </Link>
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SupportViews({
  centerSummaries,
  organizationId,
  weekStart,
}: {
  centerSummaries: ReturnType<typeof getCenterSummaries>;
  organizationId: string;
  weekStart: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Centros esta semana</CardTitle>
        <CardDescription>
          Atajos para revisar el horario por sede.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {centerSummaries.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Todavía no hay bloques por centro en esta semana.
          </p>
        ) : (
          <div className="grid gap-3">
            {centerSummaries.map((summary) => (
              <div
                className="flex flex-col gap-3 rounded-lg border border-border px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                key={summary.center.id}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {summary.center.name}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {summary.riskCount} riesgo
                    {summary.riskCount === 1 ? "" : "s"} /{" "}
                    {summary.blockCount} bloque
                    {summary.blockCount === 1 ? "" : "s"}
                  </p>
                </div>
                <Button asChild size="sm" variant="outline">
                  <Link
                    href={getSchedulePath({
                      centerId: summary.center.id,
                      organizationId,
                      risksOnly: summary.riskCount > 0,
                      week: weekStart,
                    })}
                  >
                    <MapPin aria-hidden="true" />
                    Abrir
                  </Link>
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EmptyWeekCard({
  organizationId,
  weekStart,
}: {
  organizationId: string;
  weekStart: string;
}) {
  return (
    <Card data-tour="coverage-risks">
      <CardHeader>
        <CardTitle>No hay bloques en esta semana</CardTitle>
        <CardDescription>
          Crea bloques o aplica una plantilla para empezar a revisar cobertura.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button asChild>
          <Link href={getSchedulePath({ organizationId, week: weekStart })}>
            <CalendarDays aria-hidden="true" />
            Crear bloque manual
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link
            href={getScheduleTemplatesPath({ organizationId, week: weekStart })}
          >
            <CalendarRange aria-hidden="true" />
            Aplicar plantilla
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function getNextAssignedBlockHref({
  block,
  organizationId,
}: {
  block: OwnNextAssignedScheduleBlock;
  organizationId: string;
}) {
  const blockWeek = resolveWeek(block.serviceDate, block.timeZone);

  return getSchedulePath({
    blockId: block.scheduleBlockId,
    day: block.serviceDate,
    mineOnly: true,
    organizationId,
    view: "week",
    week: blockWeek.weekStart,
  });
}

function getNextAssignedFallbackCopy(state: OwnNextAssignedScheduleState) {
  if (state.status === "matched") {
    return {
      actionLabel: "Abrir Mi horario",
      description:
        "No hay bloques futuros con asignación activa para tu ficha vinculada en la planificación visible.",
      title: "Sin próximo bloque asignado",
    };
  }

  if (state.status === "missing_person") {
    return {
      actionLabel: "Abrir horario",
      description:
        "Tu usuario tiene acceso a la organización, pero todavía no hay una persona visible vinculada. Hasta entonces esta vista se mantiene en lectura segura.",
      title: "Persona vinculada pendiente",
    };
  }

  if (state.status === "missing_coach_profile") {
    return {
      actionLabel: "Abrir horario",
      description:
        "No hay una ficha de entrenador propia vinculada a tu persona. Cuando exista, Inicio mostrará tu siguiente bloque asignado.",
      title: "Sin ficha de entrenador propia",
    };
  }

  if (state.status === "profile_unlinked") {
    return {
      actionLabel: "Abrir horario",
      description:
        "Existe una ficha técnica asociada a tu cuenta, pero falta enlazarla con tu persona operativa visible. Por seguridad no se elige una clase automáticamente.",
      title: "Ficha pendiente de vinculación",
    };
  }

  if (state.status === "ambiguous_coach_profile") {
    return {
      actionLabel: "Abrir horario",
      description: `Tu usuario aparece vinculado a ${state.profileCount ?? "varias"} fichas de entrenador. Revisa el perfil antes de decidir cuál usar como propio.`,
      title: "Revisión de perfiles necesaria",
    };
  }

  return {
    actionLabel: "Abrir horario",
    description:
      "No se pudo cargar el próximo bloque asignado. El resto de Inicio sigue disponible.",
    title: "Próximo bloque no disponible",
  };
}

function NextAssignedScheduleCard({
  organizationId,
  state,
  weekStart,
}: {
  organizationId: string;
  state: OwnNextAssignedScheduleState;
  weekStart: string;
}) {
  const fallbackHref =
    state.status === "matched"
      ? getSchedulePath({ mineOnly: true, organizationId, week: weekStart })
      : getSchedulePath({ organizationId, week: weekStart });

  if (state.status === "matched" && state.nextBlock) {
    const block = state.nextBlock;
    const leadCopy = getNextAssignedLeadCopy(block);

    return (
      <Card
        className="border-primary/25 bg-primary/5"
        data-tour="next-assigned-block"
      >
        <CardContent className="grid gap-4 py-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="min-w-0 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="default">Tu próxima clase</Badge>
              <Badge variant="secondary">Asignado</Badge>
              <Badge variant="outline">
                <NextAssignedCountdown
                  endAt={block.endAt}
                  initialLabel={leadCopy}
                  startAt={block.startAt}
                />
              </Badge>
            </div>

            <div className="min-w-0 space-y-2">
              <h2 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">
                {block.classType?.name ?? "Actividad no disponible"}
              </h2>
              <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Clock3 aria-hidden="true" className="size-4 shrink-0" />
                <span>
                  {formatTime(block.startTime)} - {formatTime(block.endTime)} ·{" "}
                  <NextAssignedCountdown
                    endAt={block.endAt}
                    initialLabel={leadCopy}
                    startAt={block.startAt}
                  />
                </span>
              </p>
            </div>

            <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-3">
              <div className="flex min-w-0 items-center gap-2">
                <CalendarDays aria-hidden="true" className="size-4 shrink-0" />
                <span className="truncate">
                  {formatLongServiceDate(block.serviceDate)}
                </span>
              </div>
              <div className="flex min-w-0 items-center gap-2">
                <MapPin aria-hidden="true" className="size-4 shrink-0" />
                <span className="truncate">
                  {block.center?.name ?? "Centro no disponible"}
                </span>
              </div>
              <div className="flex min-w-0 items-center gap-2">
                <Dumbbell aria-hidden="true" className="size-4 shrink-0" />
                <span className="truncate">
                  {block.classType?.name ?? "Actividad no disponible"}
                </span>
              </div>
            </div>
          </div>

          <Button asChild className="w-full lg:w-auto">
            <Link
              href={getNextAssignedBlockHref({
                block,
                organizationId,
              })}
            >
              Abrir bloque
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const copy = getNextAssignedFallbackCopy(state);

  return (
    <Card data-tour="next-assigned-block">
      <CardContent className="grid gap-4 py-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Tu próxima clase</Badge>
            <Badge variant="outline">Solo lectura</Badge>
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold tracking-tight">
              {copy.title}
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              {copy.description}
            </p>
          </div>
        </div>
        <Button asChild className="w-full lg:w-auto" variant="outline">
          <Link href={fallbackHref}>
            {copy.actionLabel}
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function WeeklyApprovalStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={getWeeklyApprovalBadgeVariant(status)}>
      {getWeeklyApprovalStatusLabel(status)}
    </Badge>
  );
}

function WeeklyApprovalHiddenInputs({
  approval,
  organizationId,
}: {
  approval: TimeWeeklyApprovalRow;
  organizationId: string;
}) {
  return (
    <>
      <input name="organizationId" type="hidden" value={organizationId} />
      <input name="weeklyApprovalId" type="hidden" value={approval.id} />
      <input name="weekStart" type="hidden" value={approval.week_start_date} />
    </>
  );
}

function WeeklyApprovalLoadNotice({
  errors,
}: {
  errors: TimeTrackingErrorCode[];
}) {
  if (errors.length === 0) {
    return null;
  }

  const uniqueErrors = [...new Set(errors)];

  return (
    <Alert
      variant={uniqueErrors.includes("forbidden") ? "destructive" : "default"}
    >
      <AlertTriangle aria-hidden="true" />
      <AlertTitle>Carga parcial de fichaje</AlertTitle>
      <AlertDescription>
        {uniqueErrors
          .map(
            (error) => homeErrorMessages[error] ?? homeErrorMessages.load_failed,
          )
          .join(" ")}
      </AlertDescription>
    </Alert>
  );
}

function WeeklyApprovalReviewRow({
  approval,
  organizationId,
  person,
  timezone,
}: {
  approval: TimeWeeklyApprovalRow;
  organizationId: string;
  person: WeeklyApprovalPersonRow | undefined;
  timezone: string;
}) {
  return (
    <div className="grid gap-4 border-t border-border py-4 first:border-t-0 first:pt-0 last:pb-0 xl:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <WeeklyApprovalStatusBadge status={approval.status} />
          <Badge variant="outline">
            Semana de {formatServiceDate(approval.week_start_date)}
          </Badge>
          <Badge variant="outline">
            {getSubmissionSourceLabel(approval.submission_source)}
          </Badge>
        </div>
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold tracking-tight">
            {getPersonLabel(person)}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {getWeeklyApprovalActivityCopy(approval, timezone)}
          </p>
        </div>
        {approval.rejection_note ? (
          <p className="line-clamp-2 text-sm text-muted-foreground">
            Nota: {approval.rejection_note}
          </p>
        ) : null}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <UserRound aria-hidden="true" className="size-3.5" />
          <span className="truncate">
            Persona {shortId(approval.person_profile_id)}
          </span>
        </div>
      </div>

      <div className="grid gap-2">
        <Button
          asChild
          className="w-full justify-between"
          size="sm"
          variant="outline"
        >
          <Link href={getWeeklyApprovalTimeHref({ approval, organizationId })}>
            Abrir semana
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
        <form action={approveTimeWeeklyApprovalFromHome}>
          <WeeklyApprovalHiddenInputs
            approval={approval}
            organizationId={organizationId}
          />
          <Button className="w-full justify-between" size="sm" type="submit">
            <ClipboardCheck aria-hidden="true" />
            Firmar y aprobar
          </Button>
        </form>
        <details className="group rounded-lg border border-border bg-muted/15">
          <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm font-medium marker:hidden">
            <span>Pedir corrección</span>
            <XCircle aria-hidden="true" className="size-4 text-muted-foreground" />
          </summary>
          <form
            action={rejectTimeWeeklyApprovalFromHome}
            className="grid gap-2 border-t border-border p-3"
          >
            <WeeklyApprovalHiddenInputs
              approval={approval}
              organizationId={organizationId}
            />
            <Label className="sr-only" htmlFor={`rejection-${approval.id}`}>
              Nota de corrección
            </Label>
            <Textarea
              id={`rejection-${approval.id}`}
              maxLength={2000}
              name="rejectionNote"
              placeholder="Indica qué debe revisar la persona antes de reenviar."
              required
              rows={3}
            />
            <Button size="sm" type="submit" variant="destructive">
              Rechazar con nota
            </Button>
          </form>
        </details>
      </div>
    </div>
  );
}

function WeeklyApprovalReadOnlyRow({
  approval,
  organizationId,
  person,
  timezone,
}: {
  approval: TimeWeeklyApprovalRow;
  organizationId: string;
  person?: WeeklyApprovalPersonRow;
  timezone: string;
}) {
  return (
    <div className="grid gap-3 border-t border-border py-4 first:border-t-0 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <WeeklyApprovalStatusBadge status={approval.status} />
          <Badge variant="outline">
            Semana de {formatServiceDate(approval.week_start_date)}
          </Badge>
        </div>
        <div className="min-w-0">
          <h3 className="truncate text-sm font-medium">
            {person
              ? getPersonLabel(person)
              : getOwnWeeklyNoticeTitle(approval.status)}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {getWeeklyApprovalActivityCopy(approval, timezone)}
          </p>
        </div>
        {approval.rejection_note ? (
          <p className="line-clamp-2 text-sm text-muted-foreground">
            Nota: {approval.rejection_note}
          </p>
        ) : null}
      </div>
      <Button asChild className="w-full sm:w-auto" size="sm" variant="outline">
        <Link href={getWeeklyApprovalTimeHref({ approval, organizationId })}>
          Abrir semana
          <ArrowRight aria-hidden="true" />
        </Link>
      </Button>
    </div>
  );
}

function OwnWeeklyNoticeRow({
  approval,
  organizationId,
  timezone,
}: {
  approval: TimeWeeklyApprovalRow;
  organizationId: string;
  timezone: string;
}) {
  return (
    <div className="grid gap-3 border-t border-border py-4 first:border-t-0 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <WeeklyApprovalStatusBadge status={approval.status} />
          <Badge variant="outline">
            Semana de {formatServiceDate(approval.week_start_date)}
          </Badge>
        </div>
        <div>
          <h3 className="text-sm font-medium">
            {getOwnWeeklyNoticeTitle(approval.status)}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {getOwnWeeklyNoticeDescription(approval.status)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {getWeeklyApprovalActivityCopy(approval, timezone)}
          </p>
        </div>
        {approval.rejection_note &&
        (approval.status === "rejected" ||
          approval.status === "correction_required") ? (
          <p className="line-clamp-2 text-sm text-muted-foreground">
            Nota: {approval.rejection_note}
          </p>
        ) : null}
      </div>
      <Button asChild className="w-full sm:w-auto" size="sm" variant="outline">
        <Link href={getWeeklyApprovalTimeHref({ approval, organizationId })}>
          Abrir fichaje
          <ArrowRight aria-hidden="true" />
        </Link>
      </Button>
    </div>
  );
}

function WeeklyApprovalHomeSection({
  canReview,
  data,
  organizationId,
  timezone,
}: {
  canReview: boolean;
  data: WeeklyApprovalHomeData;
  organizationId: string;
  timezone: string;
}) {
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <FileClock aria-hidden="true" className="size-5" />
            Cierre interno de fichajes
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Avisos in-app derivados del estado canónico del cierre semanal. La
            aprobación firmada es una confirmación interna de fichajes.
          </p>
        </div>
        <Badge variant="outline">In-app</Badge>
      </div>

      <WeeklyApprovalLoadNotice errors={data.errors} />

      <div
        className={
          canReview
            ? "grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]"
            : "grid gap-4"
        }
      >
        {canReview ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClipboardCheck aria-hidden="true" className="size-4" />
                Cola de aprobación
              </CardTitle>
              <CardDescription>
                Semanas enviadas o reenviadas para firmar y aprobar con tu
                propia firma interna, o rechazar con nota.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.pendingReview.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border px-4 py-5">
                  <p className="text-sm font-medium">
                    Sin semanas pendientes de aprobación
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Cuando el cierre semanal se envíe, aparecerá aquí sin crear
                    una notificación persistida aparte.
                  </p>
                </div>
              ) : (
                data.pendingReview.map((approval) => (
                  <WeeklyApprovalReviewRow
                    approval={approval}
                    key={approval.id}
                    organizationId={organizationId}
                    person={data.peopleById.get(approval.person_profile_id)}
                    timezone={timezone}
                  />
                ))
              )}
            </CardContent>
          </Card>
        ) : null}

        <div className="grid gap-4">
          <Card data-tour={canReview ? undefined : "personal-pending"}>
            <CardHeader>
              <CardTitle>Mis avisos de fichaje</CardTitle>
              <CardDescription>
                Envíos, aprobaciones, rechazos, correcciones requeridas y
                reenvíos de tus propias semanas.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.ownNotices.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border px-4 py-5">
                  <p className="text-sm font-medium">
                    Sin avisos de cierre semanal
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Tus semanas enviadas, aprobadas o con corrección aparecerán
                    aquí.
                  </p>
                </div>
              ) : (
                data.ownNotices.map((approval) => (
                  <OwnWeeklyNoticeRow
                    approval={approval}
                    key={approval.id}
                    organizationId={organizationId}
                    timezone={timezone}
                  />
                ))
              )}
            </CardContent>
          </Card>

          {canReview ? (
            <Card>
              <CardHeader>
                <CardTitle>Correcciones y rechazos recientes</CardTitle>
                <CardDescription>
                  Semanas marcadas como rechazadas o con corrección requerida.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {data.recentRejections.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border px-4 py-5">
                    <p className="text-sm font-medium">
                      Sin rechazos recientes
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Los cierres que pidan corrección aparecerán aquí como
                      seguimiento interno.
                    </p>
                  </div>
                ) : (
                  data.recentRejections.map((approval) => (
                    <WeeklyApprovalReadOnlyRow
                      approval={approval}
                      key={approval.id}
                      organizationId={organizationId}
                      person={data.peopleById.get(approval.person_profile_id)}
                      timezone={timezone}
                    />
                  ))
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function AdminCoverageDashboard({
  data,
  organizationId,
  weekStart,
}: {
  data: DashboardData;
  organizationId: string;
  weekStart: string;
}) {
  const riskItems = getRiskItems({
    blocks: data.blocks,
    coverageByBlock: data.coverageByBlock,
  });
  const centersById = new Map(data.centers.map((center) => [center.id, center]));
  const classTypesById = new Map(
    data.classTypes.map((classType) => [classType.id, classType]),
  );
  const centerSummaries = getCenterSummaries({
    centers: data.centers,
    data,
    riskItems,
  });

  return (
    <div className="space-y-6">
      <CoverageHero
        organizationId={organizationId}
        riskItems={riskItems}
        weekStart={weekStart}
      />

      {data.absenceImpactLoadError ? (
        <Alert>
          <AlertTitle>Impacto de ausencia no disponible</AlertTitle>
          <AlertDescription>
            El dashboard se muestra sin cruzar ausencias aprobadas o en
            revision.
          </AlertDescription>
        </Alert>
      ) : null}

      <SummaryCards data={data} />

      {data.blocks.length === 0 ? (
        <EmptyWeekCard organizationId={organizationId} weekStart={weekStart} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <RiskQueue
            centersById={centersById}
            classTypesById={classTypesById}
            coachDisplaysById={data.coachDisplaysById}
            organizationId={organizationId}
            riskItems={riskItems}
            weekStart={weekStart}
          />
          <SupportViews
            centerSummaries={centerSummaries}
            organizationId={organizationId}
            weekStart={weekStart}
          />
        </div>
      )}
    </div>
  );
}

function ReadOnlyHome({
  organizationId,
  organizationName,
  role,
  timezone,
  weekStart,
}: {
  organizationId: string;
  organizationName: string;
  role: string;
  timezone: string;
  weekStart: string;
}) {
  const roleLabel = getApplicationRoleLabel(role);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <Card data-tour="quick-actions">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserRound aria-hidden="true" className="size-4" />
            Tu inicio personal
          </CardTitle>
          <CardDescription>
            Atajos para revisar tu semana sin entrar en tareas de gestión.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-2 md:flex md:flex-wrap">
          <Button asChild className="w-full md:w-auto">
            <Link
              href={getSchedulePath({
                mineOnly: true,
                organizationId,
                week: weekStart,
              })}
            >
              <CalendarDays aria-hidden="true" />
              Mi horario
            </Link>
          </Button>
          <Button asChild className="w-full md:w-auto" variant="outline">
            <Link href={getTimePath({ organizationId, week: weekStart })}>
              <Timer aria-hidden="true" />
              Mi fichaje
            </Link>
          </Button>
          <Button asChild className="w-full md:w-auto" variant="outline">
            <Link href={getRequestsPath({ organizationId, week: weekStart })}>
              <Inbox aria-hidden="true" />
              Solicitudes
            </Link>
          </Button>
          <Button asChild className="w-full md:w-auto" variant="outline">
            <Link href={getAccountPath({ organizationId })}>
              <UserRound aria-hidden="true" />
              Mi cuenta
            </Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contexto actual</CardTitle>
          <CardDescription>
            Organización, rol y zona horaria usados para tus clases y fichajes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4">
            <div className="min-w-0">
              <dt className="text-sm text-muted-foreground">Organización</dt>
              <dd className="mt-1 truncate text-sm font-medium">
                {organizationName}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Acceso</dt>
              <dd className="mt-1">
                <Badge variant="outline">{roleLabel}</Badge>
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-sm text-muted-foreground">Zona horaria</dt>
              <dd className="mt-1 truncate font-mono text-sm">{timezone}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}

function SurfaceLinks({
  canManageTemplates,
  organizationId,
  weekStart,
}: {
  canManageTemplates: boolean;
  organizationId: string;
  weekStart: string;
}) {
  return (
    <Card data-tour="quick-actions">
      <CardHeader>
        <CardTitle>Acciones rápidas</CardTitle>
        <CardDescription>
          Entra directo a las pantallas que se usan para preparar la semana.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-2 md:flex md:flex-wrap">
        <Button asChild className="w-full md:w-auto">
          <Link href={getCoveragePath({ organizationId, week: weekStart })}>
            <AlertTriangle aria-hidden="true" />
            Resolver cobertura
          </Link>
        </Button>
        <Button asChild className="w-full md:w-auto" variant="outline">
          <Link href={getSchedulePath({ organizationId, week: weekStart })}>
            <CalendarDays aria-hidden="true" />
            Abrir horario
          </Link>
        </Button>
        <Button asChild className="w-full md:w-auto" variant="outline">
          <Link href={getCentersPath({ organizationId })}>
            <MapPin aria-hidden="true" />
            Centros
          </Link>
        </Button>
        <Button asChild className="w-full md:w-auto" variant="outline">
          <Link href={getCoachesPath({ organizationId })}>
            <UsersRound aria-hidden="true" />
            Equipo
          </Link>
        </Button>
        <Button asChild className="w-full md:w-auto" variant="outline">
          <Link href={getClassTypesPath({ organizationId })}>
            <Dumbbell aria-hidden="true" />
            Tipos
          </Link>
        </Button>
        {canManageTemplates ? (
          <Button asChild className="w-full md:w-auto" variant="outline">
            <Link
              href={getScheduleTemplatesPath({ organizationId, week: weekStart })}
            >
              <CalendarRange aria-hidden="true" />
              Plantillas
            </Link>
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default async function AppPage({ searchParams }: AppPageProps) {
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect(getLoginPath("/app"));
  }

  const params = await searchParams;
  const actionError = getParam(params.error);
  const organizationId = getParam(params.organizationId);
  const actionStatus = getParam(params.status);
  const memberships = await getActiveMemberships(user.id);
  const resolution = resolveActiveOrganization(memberships, organizationId);

  if (!resolution.ok) {
    return (
      <div className="space-y-6">
        <PageHeader />
        <OrganizationResolutionState basePath="/app" resolution={resolution} />
      </div>
    );
  }

  const weekParam = getParam(params.week);
  const week = resolveWeek(weekParam, resolution.organization.timezone);
  const currentWeek = resolveWeek(undefined, resolution.organization.timezone);
  const canViewOperationalDashboard = canManageOperationalData(
    resolution.membership.role,
  );
  const canReviewAbsenceImpact = canManageAbsenceRequests(
    resolution.membership.role,
  );
  const canReviewWeeklyApprovals = canReviewTimeTracking(
    resolution.membership.role,
  );
  const [
    greetingPersonProfile,
    nextAssignedSchedule,
    dashboardData,
    weeklyApprovalHomeData,
  ] =
    await Promise.all([
      getGreetingPersonProfile({
        organizationId: resolution.organization.id,
        userId: user.id,
      }),
      getOwnNextAssignedScheduleBlock({
        organizationId: resolution.organization.id,
        organizationTimezone: resolution.organization.timezone,
        userId: user.id,
      }),
      canViewOperationalDashboard
        ? getDashboardData({
            includeAbsenceImpacts: canReviewAbsenceImpact,
            organizationId: resolution.organization.id,
            weekEnd: week.weekEnd,
            weekStart: week.weekStart,
          })
        : Promise.resolve(null),
      getWeeklyApprovalHomeData({
        canReview: canReviewWeeklyApprovals,
        organizationId: resolution.organization.id,
      }),
    ]);
  const greetingName = resolveGreetingName({
    personProfile: greetingPersonProfile,
    userMetadata: user.user_metadata,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        greetingName={greetingName}
        organizationName={resolution.organization.name}
        role={resolution.membership.role}
        weekEnd={canViewOperationalDashboard ? week.weekEnd : undefined}
        weekStart={canViewOperationalDashboard ? week.weekStart : undefined}
      />

      <WeekControls
        currentWeekStart={currentWeek.weekStart}
        organizationId={resolution.organization.id}
        showWeekNavigation={canViewOperationalDashboard}
        weekStart={week.weekStart}
      />

      {canViewOperationalDashboard && week.invalidWeekParam ? (
        <Alert>
          <AlertTitle>Semana ajustada</AlertTitle>
          <AlertDescription>
            La fecha recibida no era válida. Se muestra la semana actual.
          </AlertDescription>
        </Alert>
      ) : null}

      <HomeActionFeedback
        error={actionError}
        organizationId={resolution.organization.id}
        status={actionStatus}
      />

      <NextAssignedScheduleCard
        organizationId={resolution.organization.id}
        state={nextAssignedSchedule}
        weekStart={currentWeek.weekStart}
      />

      <WeeklyApprovalHomeSection
        canReview={canReviewWeeklyApprovals}
        data={weeklyApprovalHomeData}
        organizationId={resolution.organization.id}
        timezone={resolution.organization.timezone}
      />

      {dashboardData ? (
        <AdminCoverageDashboard
          data={dashboardData}
          organizationId={resolution.organization.id}
          weekStart={week.weekStart}
        />
      ) : (
        <ReadOnlyHome
          organizationId={resolution.organization.id}
          organizationName={resolution.organization.name}
          role={resolution.membership.role}
          timezone={resolution.organization.timezone}
          weekStart={currentWeek.weekStart}
        />
      )}

      {canViewOperationalDashboard ? (
        <SurfaceLinks
          canManageTemplates={canViewOperationalDashboard}
          organizationId={resolution.organization.id}
          weekStart={week.weekStart}
        />
      ) : null}
    </div>
  );
}
