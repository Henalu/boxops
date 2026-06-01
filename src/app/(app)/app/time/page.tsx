import { redirect } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock,
  Download,
  FileSearch,
  FileClock,
  LogIn,
  LogOut,
  MapPin,
  ShieldCheck,
  Timer,
  UserRound,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import {
  applyTimeCorrectionFromForm,
  createOwnTimePunchFromForm,
  detectOvertimeCandidatesFromForm,
  reviewTimeCorrectionFromForm,
  setOvertimeCandidateStatusFromForm,
  submitOwnTimeCorrectionFromForm,
} from "./actions";
import { OrganizationResolutionState } from "@/components/features/organization-resolution-state";
import {
  PageHeader,
  StatusBadge,
} from "@/components/features/operations-ui";
import { CollapsibleSection } from "@/components/features/collapsible-section";
import { TransientFeedbackBanner } from "@/components/features/transient-feedback-banner";
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
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { getLoginPath } from "@/lib/auth/redirects";
import {
  canReviewOvertimeCandidates,
  canReviewTimeTracking,
  canUsePersonalFeatures,
  getApplicationRoleLabel,
} from "@/lib/auth/permissions";
import {
  getActiveMemberships,
  getAuthenticatedUser,
  resolveActiveOrganization,
} from "@/lib/auth/tenant";
import { getTimePath } from "@/lib/navigation/app-paths";
import {
  listOvertimeCandidates,
  type OvertimeCandidateReviewStatus,
  type OvertimeCandidateRow,
  type OvertimeCandidateStatus,
} from "@/lib/overtime-candidates";
import { resolveOrganizationTimeTrackingSettings } from "@/lib/organizations";
import { getAdjacentWeekStart, resolveWeek } from "@/lib/schedule-blocks";
import { createClient } from "@/lib/supabase/server";
import {
  getOwnTimeWeekOverview,
  listTimeCorrectionsForReview,
  listOwnTimeCorrections,
  listOwnTimePunches,
  listOwnTimeWeeklyApprovals,
  type OwnTimeWeekOverview,
  type TimeWeekDayOverview,
  type TimePunchRow,
  type TimeRecordCorrectionRow,
  type TimeRecordRow,
  type TimeWeeklyApprovalRow,
} from "@/lib/time-tracking";
import { cn } from "@/lib/utils";
import type { Json, Tables } from "@/types/supabase";

export const dynamic = "force-dynamic";

type TimePageProps = {
  searchParams: Promise<{
    error?: string | string[];
    organizationId?: string | string[];
    overtime_created?: string | string[];
    overtime_existing?: string | string[];
    overtime_ignored?: string | string[];
    record_id?: string | string[];
    status?: string | string[];
    week?: string | string[];
  }>;
};

type CenterOption = Pick<Tables<"centers">, "id" | "name" | "status">;
type ReviewPerson = Pick<
  Tables<"person_profiles">,
  "display_name" | "full_name" | "id" | "preferred_alias" | "status"
>;
type OvertimeCandidateReferences = {
  errors: string[];
  people: Map<string, ReviewPerson>;
};
type ExportPersonOption = Pick<
  Tables<"person_profiles">,
  "display_name" | "full_name" | "id" | "preferred_alias" | "status"
>;
type ReviewTimeRecord = Pick<
  TimeRecordRow,
  | "center_id"
  | "id"
  | "local_work_date"
  | "schedule_block_assignment_id"
  | "schedule_block_id"
  | "status"
  | "timezone"
>;
type ReviewTimePunch = Pick<
  TimePunchRow,
  "id" | "occurred_at" | "punch_type" | "status" | "time_record_id" | "timezone"
>;

type CenterOptionsResult =
  | {
      data: CenterOption[];
      ok: true;
    }
  | {
      error: "centers_load_failed";
      ok: false;
    };
type ExportPersonOptionsResult =
  | {
      data: ExportPersonOption[];
      ok: true;
    }
  | {
      error: "export_people_load_failed";
      ok: false;
    };
type ReviewReferences = {
  errors: string[];
  people: Map<string, ReviewPerson>;
  punches: Map<string, ReviewTimePunch>;
  records: Map<string, ReviewTimeRecord>;
};

const successMessages: Record<string, string> = {
  "clock-in-created": "Entrada registrada.",
  "clock-out-created": "Salida registrada.",
  "overtime-detection-complete": "Deteccion terminada.",
  "overtime-candidate-updated":
    "Candidato operativo actualizado. La cola muestra el estado disponible.",
  "correction-approved":
    "Corrección aprobada. El histórico no se modifica automáticamente en este corte.",
  "correction-applied":
    "Corrección aplicada. El histórico operativo se ha actualizado de forma trazada cuando el tipo lo permite.",
  "correction-applied-direct":
    "Corrección aplicada. Tu histórico operativo se ha actualizado de forma trazada cuando el tipo lo permite.",
  "correction-requested": "Corrección solicitada.",
  "correction-rejected": "Corrección rechazada con nota de revisión.",
};

const errorMessages: Record<string, string> = {
  apply_failed:
    "No se ha podido aplicar la corrección aprobada. Revisa que el fichaje original siga activo y que la solicitud no se haya aplicado ya.",
  approval_required:
    "Esta organización exige aprobación para correcciones. La corrección debe quedar como solicitud pendiente.",
  authentication_required: "Inicia sesión de nuevo para registrar fichajes.",
  centers_load_failed:
    "No se han podido cargar los centros opcionales. Puedes fichar sin centro.",
  export_people_load_failed:
    "No se han podido cargar las personas para filtrar el exporte. Puedes descargar el rango completo.",
  forbidden: "Tu rol no permite usar funciones personales en esta organización.",
  invalid_center: "El centro seleccionado no pertenece a la organización activa.",
  invalid_correction:
    "La corrección solicitada no encaja con los campos enviados.",
  invalid_correction_decision: "La decisión de revisión no es válida.",
  invalid_correction_status:
    "La corrección ya no está en el estado necesario para esta acción.",
  invalid_correction_type: "El tipo de corrección no es válido.",
  invalid_date: "La fecha de trabajo no es válida para el contexto elegido.",
  invalid_input: "El formulario no tiene un formato válido.",
  invalid_metadata: "La metadata del fichaje no es válida.",
  invalid_notes:
    "La nota de revisión es obligatoria al rechazar y no puede superar el límite permitido.",
  invalid_organization: "La organización no es válida.",
  invalid_punch_type: "El tipo de fichaje no es válido.",
  invalid_schedule_block: "El bloque vinculado no es válido.",
  invalid_schedule_block_assignment: "La asignacion vinculada no es válida.",
  invalid_schedule_context:
    "El contexto de horario no corresponde a tu persona en esta organización.",
  invalid_snapshot: "La corrección no ha podido generar snapshots seguros.",
  invalid_reason: "El motivo de la corrección es obligatorio.",
  invalid_time_punch:
    "El fichaje seleccionado no pertenece al registro propio indicado.",
  invalid_time_record: "El registro seleccionado no está disponible.",
  invalid_timestamp: "La fecha y hora del fichaje no son válidas.",
  invalid_overtime_candidate: "Ese posible exceso ya no está disponible.",
  invalid_overtime_candidate_status:
    "El estado operativo elegido no es válido para esta revisión.",
  load_failed: "No se han podido cargar los registros de fichaje.",
  no_active_memberships: "No hay accesos activos para este usuario.",
  organization_not_found: "La organización solicitada no está disponible.",
  organization_required: "Elige una organización antes de fichar.",
  overtime_forbidden: "Tu rol no permite revisar posibles excesos.",
  overtime_detection_authentication_required:
    "Inicia sesión de nuevo para detectar posibles excesos.",
  overtime_detection_date_range_invalid:
    "El rango de detección no es válido para esta acción.",
  overtime_detection_forbidden:
    "Tu rol no permite buscar posibles excesos.",
  overtime_detection_invalid_organization:
    "La organización activa no es válida para esta detección.",
  overtime_detection_invalid_period:
    "La semana enviada no es válida para esta detección.",
  overtime_detection_load_failed:
    "No se ha podido leer el contexto operativo para detectar posibles excesos.",
  overtime_detection_no_active_memberships:
    "No hay accesos activos para detectar posibles excesos.",
  overtime_detection_organization_not_found:
    "La organización solicitada no está disponible.",
  overtime_detection_organization_required:
    "Elige una organización antes de detectar posibles excesos.",
  overtime_detection_save_failed:
    "No se ha podido guardar la detección de posibles excesos.",
  overtime_invalid_candidate: "Ese posible exceso ya no está disponible.",
  overtime_invalid_status:
    "El estado operativo elegido no es válido para esta revisión.",
  overtime_load_failed:
    "No se ha podido cargar la lista de posibles excesos.",
  overtime_not_actionable:
    "Este posible exceso está cerrado o sustituido y ya no acepta cambios.",
  overtime_permission_denied:
    "Tu rol no permite revisar posibles excesos.",
  overtime_save_failed: "No se ha podido actualizar el posible exceso.",
  profile_missing:
    "Tu cuenta todavía no tiene una ficha de persona vinculada en esta organización.",
  review_failed:
    "No se ha podido revisar la corrección. Revisa que siga pendiente.",
  save_failed: "No se ha podido guardar la solicitud de corrección.",
  time_punch_failed:
    "No se ha podido registrar el fichaje. La jornada puede estar cerrada o el contexto no ser válido.",
};

const selectClassName =
  "h-11 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:h-8";
const overtimeCandidateTerminalStatuses = new Set<OvertimeCandidateStatus>([
  "closed",
  "superseded",
]);
const overtimeCandidateStatusOptions = [
  {
    label: "Pendiente de revisión",
    value: "needs_review",
  },
  {
    label: "En revisión operativa",
    value: "under_review",
  },
  {
    label: "Validado operativo",
    value: "operationally_validated",
  },
  {
    label: "Rechazado operativo",
    value: "operationally_rejected",
  },
  {
    label: "Cerrar candidato",
    value: "closed",
  },
] as const satisfies readonly {
  label: string;
  value: OvertimeCandidateReviewStatus;
}[];
const CHANGE_HISTORY_RETENTION_DAYS = 30;
const CHANGE_HISTORY_RETENTION_MS =
  CHANGE_HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000;

const blockingErrorCodes = new Set([
  "authentication_required",
  "forbidden",
  "no_active_memberships",
  "organization_not_found",
  "organization_required",
  "profile_missing",
]);

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function getNonNegativeCountParam(value: string | string[] | undefined) {
  const rawValue = getParam(value);

  if (!rawValue) {
    return 0;
  }

  const count = Number(rawValue);

  return Number.isInteger(count) && count >= 0 ? count : 0;
}

function getOvertimeDetectionDescription({
  created,
  existing,
  ignored,
}: {
  created: number;
  existing: number;
  ignored: number;
}) {
  return [
    `Creados: ${created}`,
    `ya existentes: ${existing}`,
    `ignorados por datos insuficientes: ${ignored}`,
  ].join(" / ");
}

function isVisibleTimePunch(punch: TimePunchRow) {
  return punch.status === "active";
}

function getPunchChangeTimestamp(punch: TimePunchRow) {
  return punch.updated_at ?? punch.created_at ?? punch.occurred_at;
}

function isRecentChangedTimePunch(punch: TimePunchRow, now = new Date()) {
  if (isVisibleTimePunch(punch)) {
    return false;
  }

  const changedAt = new Date(getPunchChangeTimestamp(punch));

  return (
    !Number.isNaN(changedAt.getTime()) &&
    now.getTime() - changedAt.getTime() <= CHANGE_HISTORY_RETENTION_MS
  );
}

async function getCenterOptions(
  organizationId: string,
): Promise<CenterOptionsResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("centers")
    .select("id, name, status")
    .eq("organization_id", organizationId)
    .order("status", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    return {
      error: "centers_load_failed",
      ok: false,
    };
  }

  return {
    data: data ?? [],
    ok: true,
  };
}

async function getOwnCoachPrimaryCenterId({
  organizationId,
  userId,
}: {
  organizationId: string;
  userId: string;
}) {
  const supabase = await createClient();
  const { data: people, error: peopleError } = await supabase
    .from("person_profiles")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("status", "active");

  if (peopleError) {
    return null;
  }

  const ownPersonProfileIds = uniqueIds((people ?? []).map((person) => person.id));
  let coachQuery = supabase
    .from("coach_profiles")
    .select("primary_center_id")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .not("primary_center_id", "is", null);

  coachQuery =
    ownPersonProfileIds.length > 0
      ? coachQuery.or(
          `user_id.eq.${userId},person_profile_id.in.(${ownPersonProfileIds.join(",")})`,
        )
      : coachQuery.eq("user_id", userId);

  const { data: coachProfiles, error: coachProfilesError } = await coachQuery;

  if (coachProfilesError) {
    return null;
  }

  const centerIds = uniqueIds(
    (coachProfiles ?? []).map((profile) => profile.primary_center_id),
  );

  return centerIds.length === 1 ? centerIds[0] : null;
}

async function getExportPersonOptions(
  organizationId: string,
): Promise<ExportPersonOptionsResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("person_profiles")
    .select("id, display_name, preferred_alias, full_name, status")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .eq("visibility_status", "visible")
    .order("display_name", { ascending: true });

  if (error) {
    return {
      error: "export_people_load_failed",
      ok: false,
    };
  }

  return {
    data: data ?? [],
    ok: true,
  };
}

async function getOvertimeCandidateReferences({
  candidates,
  organizationId,
}: {
  candidates: OvertimeCandidateRow[];
  organizationId: string;
}): Promise<OvertimeCandidateReferences> {
  const supabase = await createClient();
  const personIds = uniqueIds(
    candidates.map((candidate) => candidate.person_profile_id),
  );

  if (personIds.length === 0) {
    return {
      errors: [],
      people: new Map<string, ReviewPerson>(),
    };
  }

  const { data, error } = await supabase
    .from("person_profiles")
    .select("id, display_name, preferred_alias, full_name, status")
    .eq("organization_id", organizationId)
    .in("id", personIds);

  return {
    errors: error ? ["No se han podido cargar algunas personas."] : [],
    people: new Map(
      ((data ?? []) as ReviewPerson[]).map((person) => [person.id, person]),
    ),
  };
}

function uniqueIds(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values.filter((value): value is string => Boolean(value && value.trim())),
    ),
  );
}

async function getCorrectionReviewReferences({
  corrections,
  organizationId,
}: {
  corrections: TimeRecordCorrectionRow[];
  organizationId: string;
}): Promise<ReviewReferences> {
  const supabase = await createClient();
  const personIds = uniqueIds(
    corrections.flatMap((correction) => [
      correction.requested_by_person_profile_id,
      correction.person_profile_id,
    ]),
  );
  const recordIds = uniqueIds(
    corrections.map((correction) => correction.time_record_id),
  );
  const punchIds = uniqueIds(
    corrections.map((correction) => correction.time_punch_id),
  );

  const [peopleResult, recordsResult, punchesResult] = await Promise.all([
    personIds.length > 0
      ? supabase
          .from("person_profiles")
          .select("id, display_name, preferred_alias, full_name, status")
          .eq("organization_id", organizationId)
          .in("id", personIds)
      : Promise.resolve({ data: [], error: null }),
    recordIds.length > 0
      ? supabase
          .from("time_records")
          .select(
            "id, local_work_date, timezone, center_id, schedule_block_id, schedule_block_assignment_id, status",
          )
          .eq("organization_id", organizationId)
          .in("id", recordIds)
      : Promise.resolve({ data: [], error: null }),
    punchIds.length > 0
      ? supabase
          .from("time_punches")
          .select("id, time_record_id, occurred_at, punch_type, timezone, status")
          .eq("organization_id", organizationId)
          .in("id", punchIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const errors = [
    peopleResult.error ? "No se han podido cargar algunas personas." : null,
    recordsResult.error ? "No se han podido cargar algunos registros." : null,
    punchesResult.error ? "No se han podido cargar algunos fichajes." : null,
  ].filter((message): message is string => message !== null);

  return {
    errors,
    people: new Map(
      ((peopleResult.data ?? []) as ReviewPerson[]).map((person) => [
        person.id,
        person,
      ]),
    ),
    punches: new Map(
      ((punchesResult.data ?? []) as ReviewTimePunch[]).map((punch) => [
        punch.id,
        punch,
      ]),
    ),
    records: new Map(
      ((recordsResult.data ?? []) as ReviewTimeRecord[]).map((record) => [
        record.id,
        record,
      ]),
    ),
  };
}

function getRecordStatusLabel(status: string) {
  const labels: Record<string, string> = {
    approved: "Aprobada",
    open: "Abierta",
    reopened: "Reabierta",
    submitted: "Enviada",
    voided: "Anulada",
  };

  return labels[status] ?? status;
}

function getRecordStatusTone(status: string) {
  if (status === "approved") {
    return "success";
  }

  if (status === "submitted") {
    return "info";
  }

  if (status === "reopened") {
    return "warning";
  }

  if (status === "voided") {
    return "critical";
  }

  return "neutral";
}

function getPunchTypeLabel(type: string) {
  const labels: Record<string, string> = {
    clock_in: "Entrada",
    clock_out: "Salida",
  };

  return labels[type] ?? type;
}

function getPunchStatusLabel(status: string) {
  const labels: Record<string, string> = {
    active: "Activo",
    superseded: "Sustituido",
    voided: "Anulado",
  };

  return labels[status] ?? status;
}

function getCorrectionTypeLabel(type: string) {
  const labels: Record<string, string> = {
    punch_add: "Fichaje añadido",
    punch_update: "Corregir hora de entrada/salida",
    punch_void: "Anular fichaje erroneo",
    record_update: "Registro actualizado",
  };

  return labels[type] ?? type;
}

function getCorrectionStatusLabel(status: string) {
  const labels: Record<string, string> = {
    applied: "Aplicada",
    approved: "Aprobada",
    cancelled: "Cancelada",
    pending: "Pendiente",
    rejected: "Rechazada",
  };

  return labels[status] ?? status;
}

function getApprovalStatusLabel(status: string) {
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

function getStatusTone(status: string) {
  if (status === "approved" || status === "applied" || status === "active") {
    return "success";
  }

  if (status === "pending" || status === "submitted" || status === "resubmitted") {
    return "pending";
  }

  if (status === "reopened" || status === "correction_required") {
    return "warning";
  }

  if (status === "rejected" || status === "cancelled" || status === "voided") {
    return "critical";
  }

  return "neutral";
}

function getOvertimeCandidateStatusLabel(status: string) {
  const labels: Record<string, string> = {
    closed: "Cerrado",
    detected: "Detectado",
    needs_review: "Pendiente de revisión",
    operationally_rejected: "Rechazado operativo",
    operationally_validated: "Validado operativo",
    superseded: "Sustituido",
    under_review: "En revisión operativa",
  };

  return labels[status] ?? status;
}

function getOvertimeCandidateStatusTone(status: string) {
  if (status === "operationally_validated") {
    return "success";
  }

  if (status === "operationally_rejected") {
    return "critical";
  }

  if (status === "under_review") {
    return "info";
  }

  if (status === "detected" || status === "needs_review") {
    return "pending";
  }

  return "neutral";
}

function getOvertimeCandidateDetectionSourceLabel(source: string) {
  const labels: Record<string, string> = {
    absence_context: "Contexto de ausencia",
    event_context: "Contexto de evento",
    manual_signal: "Senal manual",
    schedule_difference: "Diferencia de horario",
    staff_work_window_context: "Jornada prevista",
    time_difference: "Diferencia de fichaje",
    weekly_review: "Revision semanal",
  };

  return labels[source] ?? source;
}

function getWeekDayStatusLabel(status: TimeWeekDayOverview["status"]) {
  const labels: Record<TimeWeekDayOverview["status"], string> = {
    correct: "Correcto",
    empty: "Sin actividad",
    excess: "Exceso",
    missing: "Faltan horas",
    open: "Fichaje abierto",
    unassigned_worked: "Sin asignacion",
  };

  return labels[status];
}

function getWeekDayStatusTone(status: TimeWeekDayOverview["status"]) {
  if (status === "correct") {
    return "success";
  }

  if (status === "missing" || status === "open") {
    return "warning";
  }

  if (status === "excess" || status === "unassigned_worked") {
    return "critical";
  }

  return "neutral";
}

function getWeekBalanceCopy(balanceMinutes: number) {
  if (Math.abs(balanceMinutes) <= 5) {
    return "OK";
  }

  return balanceMinutes > 0
    ? `+${formatDuration(balanceMinutes)}`
    : formatDuration(balanceMinutes);
}

function formatLocalDate(value: string) {
  try {
    return new Intl.DateTimeFormat("es-ES", {
      dateStyle: "full",
      timeZone: "UTC",
    }).format(new Date(`${value}T12:00:00Z`));
  } catch {
    return value;
  }
}

function formatShortDate(value: string) {
  try {
    return new Intl.DateTimeFormat("es-ES", {
      dateStyle: "medium",
      timeZone: "UTC",
    }).format(new Date(`${value}T12:00:00Z`));
  } catch {
    return value;
  }
}

function formatWeekRange(weekStart: string, weekEnd: string) {
  return `${formatShortDate(weekStart)} - ${formatShortDate(weekEnd)}`;
}

function formatCandidatePeriod(candidate: OvertimeCandidateRow) {
  return candidate.period_start_date === candidate.period_end_date
    ? formatShortDate(candidate.period_start_date)
    : `${formatShortDate(candidate.period_start_date)} - ${formatShortDate(
        candidate.period_end_date,
      )}`;
}

function formatWeekday(value: string) {
  try {
    return new Intl.DateTimeFormat("es-ES", {
      timeZone: "UTC",
      weekday: "short",
    })
      .format(new Date(`${value}T12:00:00Z`))
      .replace(".", "")
      .toUpperCase();
  } catch {
    return value;
  }
}

function formatDuration(minutes: number) {
  const sign = minutes < 0 ? "-" : "";
  const absoluteMinutes = Math.abs(minutes);
  const hours = Math.floor(absoluteMinutes / 60);
  const remainder = absoluteMinutes % 60;

  if (hours === 0) {
    return `${sign}${remainder} min`;
  }

  if (remainder === 0) {
    return `${sign}${hours} h`;
  }

  return `${sign}${hours} h ${remainder} min`;
}

function formatPositiveDuration(minutes: number) {
  return `+${formatDuration(Math.max(0, minutes))}`;
}

function formatDayDurationStat(minutes: number) {
  return minutes === 0 ? "0" : formatDuration(minutes);
}

function formatHourStat(minutes: number | null) {
  if (minutes === null) {
    return "Sin dato";
  }

  return new Intl.NumberFormat("es-ES", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 0,
  }).format(minutes / 60);
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

function getLocalDateTimeDefaults(timezone: string) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
      minute: "2-digit",
      month: "2-digit",
      timeZone: timezone,
      year: "numeric",
    }).formatToParts(new Date());
    const values = new Map(parts.map((part) => [part.type, part.value]));
    const year = values.get("year");
    const month = values.get("month");
    const day = values.get("day");
    const hour = values.get("hour");
    const minute = values.get("minute");

    if (year && month && day && hour && minute) {
      return {
        date: `${year}-${month}-${day}`,
        time: `${hour}:${minute}`,
      };
    }
  } catch {
    // Fall back to the server clock if the organization timezone is invalid.
  }

  const now = new Date();

  return {
    date: now.toISOString().slice(0, 10),
    time: now.toISOString().slice(11, 16),
  };
}

function formatTimeOnly(value: string, timezone: string) {
  try {
    return new Intl.DateTimeFormat("es-ES", {
      timeStyle: "short",
      timeZone: timezone,
    }).format(new Date(value));
  } catch {
    return "--:--";
  }
}

function formatShortId(value: string | null | undefined) {
  return value ? `ID ${value.slice(0, 8)}` : "Sin dato";
}

function asJsonRecord(value: Json | undefined) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, Json | undefined>;
}

function getJsonString(
  record: Record<string, Json | undefined> | null,
  key: string,
) {
  const value = record?.[key];

  return typeof value === "string" && value.trim() ? value : null;
}

function formatSnapshotDateTime(value: string | null, timezone: string) {
  if (!value) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return formatShortDate(value);
  }

  const localDateTime = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(value);

  if (localDateTime && !/[zZ]|[+-]\d{2}:\d{2}$/.test(value)) {
    return `${formatShortDate(localDateTime[1])} ${localDateTime[2]}`;
  }

  return formatDateTime(value, timezone);
}

function getSnapshotSummary(snapshot: Json, timezone: string) {
  const root = asJsonRecord(snapshot);

  if (!root) {
    return [{ label: "Resumen", value: "Snapshot no legible." }];
  }

  const record = asJsonRecord(root.record);
  const punch = asJsonRecord(root.punch);
  const change = asJsonRecord(root.change);
  const items: Array<{ label: string; value: string }> = [];
  const type = getJsonString(root, "type");
  const localWorkDate = getJsonString(record, "localWorkDate");
  const recordStatus = getJsonString(record, "status");
  const plannedStartAt = getJsonString(record, "plannedStartAt");
  const plannedEndAt = getJsonString(record, "plannedEndAt");
  const punchType = getJsonString(punch, "punchType");
  const punchStatus = getJsonString(punch, "status");
  const requestedStatus = getJsonString(punch, "requestedStatus");
  const occurredAt =
    getJsonString(punch, "requestedOccurredAtLocal") ??
    getJsonString(punch, "occurredAtLocal") ??
    getJsonString(punch, "occurredAt");
  const note = getJsonString(change, "note");

  if (type) {
    items.push({
      label: "Tipo",
      value: getCorrectionTypeLabel(type),
    });
  }

  if (localWorkDate || recordStatus) {
    items.push({
      label: "Registro",
      value: [
        localWorkDate ? formatShortDate(localWorkDate) : null,
        recordStatus ? getRecordStatusLabel(recordStatus) : null,
      ]
        .filter(Boolean)
        .join(" - "),
    });
  }

  if (plannedStartAt || plannedEndAt) {
    items.push({
      label: "Plan previsto",
      value: [
        formatSnapshotDateTime(plannedStartAt, timezone),
        formatSnapshotDateTime(plannedEndAt, timezone),
      ]
        .filter(Boolean)
        .join(" - "),
    });
  }

  if (root.punch === null) {
    items.push({
      label: "Fichaje",
      value: "Sin fichaje asociado.",
    });
  } else if (punchType || occurredAt || punchStatus || requestedStatus) {
    items.push({
      label: "Fichaje",
      value: [
        punchType ? getPunchTypeLabel(punchType) : null,
        formatSnapshotDateTime(occurredAt, timezone),
        requestedStatus
          ? getPunchStatusLabel(requestedStatus)
          : punchStatus
            ? getPunchStatusLabel(punchStatus)
            : null,
      ]
        .filter(Boolean)
        .join(" - "),
    });
  }

  if (note) {
    items.push({
      label: "Nota",
      value: note,
    });
  }

  return items.length > 0
    ? items.slice(0, 5)
    : [{ label: "Resumen", value: "Sin cambios resumibles." }];
}

function getCorrectionApplicationSummary(
  correction: TimeRecordCorrectionRow,
  timezone: string,
) {
  const root = asJsonRecord(correction.after_snapshot);
  const punch = asJsonRecord(root?.punch);
  const punchType = getJsonString(punch, "punchType");
  const requestedStatus = getJsonString(punch, "requestedStatus");
  const occurredAt =
    getJsonString(punch, "requestedOccurredAtLocal") ??
    getJsonString(punch, "occurredAtLocal") ??
    getJsonString(punch, "occurredAt");

  if (correction.correction_type === "punch_add") {
    return [
      {
        label: "Acción",
        value: "Crear un fichaje nuevo con origen corrección.",
      },
      {
        label: "Fichaje nuevo",
        value: [
          punchType ? getPunchTypeLabel(punchType) : null,
          formatSnapshotDateTime(occurredAt, timezone),
          "Activo",
        ]
          .filter(Boolean)
          .join(" - "),
      },
      {
        label: "Trazabilidad",
        value: "El registro original se conserva y el nuevo fichaje queda enlazado a esta corrección.",
      },
    ];
  }

  if (correction.correction_type === "punch_update") {
    return [
      {
        label: "Acción",
        value: "Marcar el fichaje original como sustituido y crear el fichaje corregido.",
      },
      {
        label: "Hora corregida",
        value: formatSnapshotDateTime(occurredAt, timezone) ?? "Hora no disponible.",
      },
      {
        label: "Trazabilidad",
        value: "El fichaje anterior deja de aparecer en el día y pasa al historial de cambios visible 30 días.",
      },
    ];
  }

  if (correction.correction_type === "punch_void") {
    return [
      {
        label: "Acción",
        value: "Marcar el fichaje original como anulado.",
      },
      {
        label: "Estado solicitado",
        value: requestedStatus ? getPunchStatusLabel(requestedStatus) : "Anulado",
      },
      {
        label: "Trazabilidad",
        value: "El fichaje anulado deja de aparecer en el día y pasa al historial de cambios visible 30 días.",
      },
    ];
  }

  return [
    {
      label: "Acción",
      value: "Marcar la corrección como aplicada.",
    },
    {
      label: "Limitacion del modelo",
      value:
        "El modelo actual no tiene un campo seguro de nota aplicada en time_records; no se modifican campos de jornada.",
    },
    {
      label: "Trazabilidad",
      value: "La solicitud queda aplicada con fecha de aplicación para mantener el histórico revisable.",
    },
  ];
}

function getPersonLabel(person: ReviewPerson | undefined) {
  if (!person) {
    return "Persona no disponible";
  }

  return (
    person.preferred_alias?.trim() ||
    person.display_name?.trim() ||
    person.full_name?.trim() ||
    "Persona sin nombre visible"
  );
}

function getRecordLabel(record: ReviewTimeRecord | undefined) {
  if (!record) {
    return "Registro no disponible";
  }

  return `${formatShortDate(record.local_work_date)} - ${getRecordStatusLabel(
    record.status,
  )}`;
}

function getPunchLabel(punch: ReviewTimePunch | undefined) {
  if (!punch) {
    return "Sin fichaje asociado";
  }

  return `${getPunchTypeLabel(punch.punch_type)} - ${formatDateTime(
    punch.occurred_at,
    punch.timezone,
  )} - ${getPunchStatusLabel(punch.status)}`;
}

function getLoadErrorMessages(errors: string[]) {
  return Array.from(new Set(errors))
    .map((error) => errorMessages[error] ?? "No se han podido cargar los datos.")
    .join(" ");
}

function groupPunchesByRecordId(punches: TimePunchRow[]) {
  const grouped = new Map<string, TimePunchRow[]>();

  for (const punch of punches) {
    const recordPunches = grouped.get(punch.time_record_id) ?? [];
    recordPunches.push(punch);
    grouped.set(punch.time_record_id, recordPunches);
  }

  for (const recordPunches of grouped.values()) {
    recordPunches.sort((first, second) =>
      first.occurred_at.localeCompare(second.occurred_at),
    );
  }

  return grouped;
}

function TimePunchForm({
  activeCenters,
  canSubmit,
  defaultCenterId,
  defaultPunchDate,
  defaultPunchTime,
  organizationId,
  timezone,
}: {
  activeCenters: CenterOption[];
  canSubmit: boolean;
  defaultCenterId?: string | null;
  defaultPunchDate: string;
  defaultPunchTime: string;
  organizationId: string;
  timezone: string;
}) {
  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Timer aria-hidden="true" className="size-4" />
          Registrar ahora
        </CardTitle>
        <CardDescription>
          {defaultCenterId
            ? "Tu centro principal viene seleccionado. Ajusta fecha y hora si lo necesitas."
            : "Elige la fecha y hora del fichaje. El centro sigue siendo opcional."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={createOwnTimePunchFromForm} className="grid gap-4">
          <input name="organizationId" type="hidden" value={organizationId} />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="punchDate">Dia</Label>
              <Input
                defaultValue={defaultPunchDate}
                id="punchDate"
                name="punchDate"
                required
                type="date"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="punchTime">Hora</Label>
              <Input
                defaultValue={defaultPunchTime}
                id="punchTime"
                name="punchTime"
                required
                type="time"
              />
            </div>
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">
            Zona horaria: {timezone}
          </p>

          <div className="grid gap-2">
            <Label htmlFor="centerId">Centro</Label>
            <select
              className={selectClassName}
              defaultValue={defaultCenterId ?? ""}
              id="centerId"
              name="centerId"
            >
              <option value="">Sin centro vinculado</option>
              {activeCenters.map((center) => (
                <option key={center.id} value={center.id}>
                  {center.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="notes">Nota opcional</Label>
            <Textarea
              id="notes"
              maxLength={1000}
              name="notes"
              placeholder="Contexto breve si hace falta"
              rows={3}
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              disabled={!canSubmit}
              name="punchType"
              type="submit"
              value="clock_in"
            >
              <LogIn aria-hidden="true" />
              Fichar entrada
            </Button>
            <Button
              disabled={!canSubmit}
              name="punchType"
              type="submit"
              value="clock_out"
              variant="outline"
            >
              <LogOut aria-hidden="true" />
              Fichar salida
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function TimeCorrectionForm({
  canSubmit,
  correctionApprovalRequired,
  organizationId,
  punchesByRecordId,
  records,
  selectedRecordId,
  weekStart,
}: {
  canSubmit: boolean;
  correctionApprovalRequired: boolean;
  organizationId: string;
  punchesByRecordId: Map<string, TimePunchRow[]>;
  records: TimeRecordRow[];
  selectedRecordId?: string | null;
  weekStart: string;
}) {
  const recordsWithVisiblePunches = records.filter(
    (record) => (punchesByRecordId.get(record.id) ?? []).length > 0,
  );
  const hasCorrectablePunches = recordsWithVisiblePunches.length > 0;
  const defaultRecordId =
    selectedRecordId &&
    recordsWithVisiblePunches.some((record) => record.id === selectedRecordId)
      ? selectedRecordId
      : recordsWithVisiblePunches[0]?.id;
  const actionLabel = correctionApprovalRequired
    ? "Solicitar corrección"
    : "Aplicar corrección";

  return (
    <div id="correccion">
      <CollapsibleTimeSection
        accent="success"
        defaultOpen={Boolean(selectedRecordId && hasCorrectablePunches)}
        description={
          correctionApprovalRequired
            ? "Selecciona un registro propio reciente. La solicitud queda pendiente hasta revisión."
            : "Selecciona un registro propio reciente. La corrección se aplica al enviar."
        }
        summary={
          <Badge variant="outline">
            {hasCorrectablePunches
              ? `${recordsWithVisiblePunches.length} corregibles`
              : "Sin fichajes corregibles"}
          </Badge>
        }
        title={actionLabel}
        tone="action"
      >
        {!hasCorrectablePunches ? (
          <CompactEmptyState
            description="Cuando exista una entrada o salida visible, podrás solicitar o aplicar una corrección desde aquí."
            tone="success"
            title="No hay fichajes corregibles"
          />
        ) : (
          <form
            action={submitOwnTimeCorrectionFromForm}
            className="grid gap-4"
          >
            <input name="organizationId" type="hidden" value={organizationId} />
            <input name="weekStart" type="hidden" value={weekStart} />

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="correctionType">Tipo de corrección</Label>
                <select
                  className={selectClassName}
                  id="correctionType"
                  name="correctionType"
                  required
                >
                  <option value="punch_update">
                    Corregir hora de entrada/salida
                  </option>
                  <option value="punch_void">Anular fichaje erroneo</option>
                </select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="timeRecordId">Registro reciente</Label>
                <select
                  className={selectClassName}
                  defaultValue={defaultRecordId}
                  id="timeRecordId"
                  name="timeRecordId"
                  required
                >
                  {recordsWithVisiblePunches.map((record) => (
                    <option key={record.id} value={record.id}>
                      {formatShortDate(record.local_work_date)} -{" "}
                      {getRecordStatusLabel(record.status)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="timePunchId">Fichaje asociado</Label>
              <select
                className={selectClassName}
                id="timePunchId"
                name="timePunchId"
                required
              >
                {recordsWithVisiblePunches.map((record) => {
                  const recordPunches = punchesByRecordId.get(record.id) ?? [];

                  return (
                    <optgroup
                      key={record.id}
                      label={formatShortDate(record.local_work_date)}
                    >
                      {recordPunches.map((punch) => (
                        <option key={punch.id} value={punch.id}>
                          {getPunchTypeLabel(punch.punch_type)} -{" "}
                          {formatDateTime(punch.occurred_at, punch.timezone)}
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
              <p className="text-xs text-muted-foreground">
                Elige la entrada o salida que quieres corregir o anular.
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="occurredAtLocal">Nueva hora</Label>
              <Input
                id="occurredAtLocal"
                name="occurredAtLocal"
                type="datetime-local"
              />
              <p className="text-xs text-muted-foreground">
                Solo para corregir la hora. Si vas a anular un fichaje, dejala
                vacia.
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="reason">Motivo obligatorio</Label>
              <Textarea
                id="reason"
                maxLength={2000}
                name="reason"
                placeholder={
                  correctionApprovalRequired
                    ? "Explica por qué solicitas la corrección"
                    : "Explica por qué corriges el fichaje"
                }
                required
                rows={3}
              />
            </div>

            <Button disabled={!canSubmit} type="submit">
              <FileClock aria-hidden="true" />
              {actionLabel}
            </Button>
          </form>
        )}
      </CollapsibleTimeSection>
    </div>
  );
}

type TimeCardTone =
  | "critical"
  | "info"
  | "neutral"
  | "pending"
  | "success"
  | "warning";

const timeIconToneClassNames: Record<TimeCardTone, string> = {
  critical:
    "border-destructive/30 bg-destructive/10 text-destructive ring-destructive/15",
  info: "border-primary/25 bg-primary/10 text-primary ring-primary/10",
  neutral: "border-border bg-muted/45 text-muted-foreground ring-foreground/10",
  pending: "border-amber-300/60 bg-amber-50 text-amber-800 ring-amber-200/70",
  success:
    "border-emerald-300/55 bg-emerald-50 text-emerald-800 ring-emerald-200/70",
  warning:
    "border-orange-300/60 bg-orange-50 text-orange-800 ring-orange-200/70",
};

const timeValueToneClassNames: Record<TimeCardTone, string> = {
  critical: "text-destructive",
  info: "text-foreground",
  neutral: "text-foreground",
  pending: "text-amber-800",
  success: "text-emerald-800",
  warning: "text-orange-800",
};

function TimeOverviewCard({
  actionHref,
  actionIcon: ActionIcon,
  actionLabel,
  description,
  icon: Icon,
  label,
  tone = "neutral",
  value,
}: {
  actionHref: string;
  actionIcon: LucideIcon;
  actionLabel: string;
  description: string;
  icon: LucideIcon;
  label: string;
  tone?: TimeCardTone;
  value: ReactNode;
}) {
  return (
    <Card className="h-full" size="sm">
      <CardContent className="flex h-full min-h-40 flex-col gap-4 px-4 py-1 md:min-h-44 md:px-5">
        <div className="flex items-start gap-4">
          <span
            className={`flex size-12 shrink-0 items-center justify-center rounded-xl border ring-1 ${timeIconToneClassNames[tone]}`}
          >
            <Icon aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0 space-y-1.5">
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            <p
              className={`font-mono text-2xl font-semibold leading-tight tracking-tight md:text-3xl ${timeValueToneClassNames[tone]}`}
            >
              {value}
            </p>
          </div>
        </div>
        <p className="text-sm leading-6 text-muted-foreground">{description}</p>
        <Button asChild className="mt-auto w-fit" size="sm" variant="outline">
          <Link href={actionHref}>
            <ActionIcon aria-hidden="true" />
            {actionLabel}
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function TimeWeekMetricCard({
  description,
  icon: Icon,
  label,
  tone = "neutral",
  value,
}: {
  description: string;
  icon: LucideIcon;
  label: string;
  tone?: TimeCardTone;
  value: ReactNode;
}) {
  return (
    <Card className="h-full" size="sm">
      <CardContent className="grid h-full min-h-36 grid-cols-[auto_minmax(0,1fr)] gap-3 px-4 py-1">
        <span
          className={`flex size-10 shrink-0 items-center justify-center rounded-xl border ring-1 ${timeIconToneClassNames[tone]}`}
        >
          <Icon aria-hidden="true" className="size-4" />
        </span>
        <div className="min-w-0 space-y-2">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p
            className={`font-mono text-2xl font-semibold leading-tight tracking-tight md:text-3xl ${timeValueToneClassNames[tone]}`}
          >
            {value}
          </p>
          <p className="text-sm leading-5 text-muted-foreground">
            {description}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function CurrentTimeState({
  correctionApprovalRequired,
  corrections,
  latestPunch,
  records,
  timezone,
}: {
  correctionApprovalRequired: boolean;
  corrections: TimeRecordCorrectionRow[];
  latestPunch?: TimePunchRow;
  records: TimeRecordRow[];
  timezone: string;
}) {
  const latestRecord = records[0];
  const pendingCorrections = corrections.filter(
    (correction) => correction.status === "pending",
  ).length;
  const appliedCorrections = corrections.filter(
    (correction) => correction.status === "applied",
  ).length;

  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <TimeOverviewCard
        actionHref="#registros"
        actionIcon={FileSearch}
        actionLabel="Ver historial"
        description={
          latestPunch
            ? formatDateTime(latestPunch.occurred_at, latestPunch.timezone)
            : "Aún no hay entradas o salidas registradas."
        }
        icon={Clock}
        label="Último fichaje"
        tone={latestPunch?.punch_type === "clock_out" ? "info" : "success"}
        value={latestPunch ? getPunchTypeLabel(latestPunch.punch_type) : "Sin datos"}
      />
      <TimeOverviewCard
        actionHref="#fichaje-semana"
        actionIcon={CalendarDays}
        actionLabel="Ver jornadas"
        description={
          latestRecord
            ? formatShortDate(latestRecord.local_work_date)
            : "Sin jornadas recientes."
        }
        icon={CalendarClock}
        label="Jornada reciente"
        tone={getRecordStatusTone(latestRecord?.status ?? "open")}
        value={latestRecord ? getRecordStatusLabel(latestRecord.status) : "Sin datos"}
      />
      <TimeOverviewCard
        actionHref="#correcciones"
        actionIcon={FileClock}
        actionLabel="Ver correcciones"
        description={
          correctionApprovalRequired
            ? `Pendientes de revisión. Zona horaria: ${timezone}`
            : `Aplicadas directamente. Zona horaria: ${timezone}`
        }
        icon={FileClock}
        label="Correcciones"
        tone={
          correctionApprovalRequired && pendingCorrections > 0
            ? "pending"
            : "neutral"
        }
        value={correctionApprovalRequired ? pendingCorrections : appliedCorrections}
      />
    </div>
  );
}

function TimeWeekNavigation({
  currentWeekStart,
  organizationId,
  weekStart,
}: {
  currentWeekStart: string;
  organizationId: string;
  weekStart: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button asChild size="sm" variant="outline">
        <Link
          href={getTimePath({
            organizationId,
            week: getAdjacentWeekStart(weekStart, -1),
          })}
        >
          <ChevronLeft aria-hidden="true" />
          Anterior
        </Link>
      </Button>
      <Button asChild size="sm" variant="outline">
        <Link href={getTimePath({ organizationId, week: currentWeekStart })}>
          Hoy
        </Link>
      </Button>
      <Button asChild size="sm" variant="outline">
        <Link
          href={getTimePath({
            organizationId,
            week: getAdjacentWeekStart(weekStart, 1),
          })}
        >
          Siguiente
          <ChevronRight aria-hidden="true" />
        </Link>
      </Button>
    </div>
  );
}

function TimeWeekSummaryCards({
  overview,
}: {
  overview: OwnTimeWeekOverview;
}) {
  const assignedValue = `${formatHourStat(
    overview.totals.assignedMinutes,
  )} h`;
  const workedValue = `${formatHourStat(overview.totals.workedMinutes)} h`;
  const contractedCopy =
    overview.totals.weeklyContractedMinutes !== null
      ? `Capacidad de perfil: ${formatHourStat(
          overview.totals.weeklyContractedMinutes,
        )} h.`
      : "Sin capacidad semanal de perfil.";

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <TimeWeekMetricCard
        description={`${overview.assignedBlockCount} bloques asignados visibles. ${contractedCopy}`}
        icon={CalendarDays}
        label="Asignadas"
        tone="info"
        value={assignedValue}
      />
      <TimeWeekMetricCard
        description="Suma de pares entrada/salida activos en la semana."
        icon={Clock}
        label="Fichadas"
        tone="neutral"
        value={workedValue}
      />
      <TimeWeekMetricCard
        description={
          overview.totals.status === "excess"
            ? "Posible exceso operativo; no equivale a horas extra aprobadas."
            : overview.totals.status === "missing"
              ? "Faltan horas frente a bloques asignados."
              : "Comparacion operativa frente a asignaciones."
        }
        icon={AlertTriangle}
        label="Balance"
        tone={getWeekDayStatusTone(overview.totals.status)}
        value={getWeekBalanceCopy(overview.totals.balanceMinutes)}
      />
      <TimeWeekMetricCard
        description={
          overview.totals.warningCount > 0
            ? "Revisa días con falta, exceso o fichaje abierto."
            : "Sin diferencias operativas relevantes."
        }
        icon={ShieldCheck}
        label="Avisos"
        tone={overview.totals.warningCount > 0 ? "warning" : "success"}
        value={overview.totals.warningCount}
      />
    </div>
  );
}

function TimeWeekDayColumn({
  canSubmit,
  correctionApprovalRequired,
  day,
  organizationId,
  punchesByRecordId,
  records,
  weekStart,
}: {
  canSubmit: boolean;
  correctionApprovalRequired: boolean;
  day: TimeWeekDayOverview;
  organizationId: string;
  punchesByRecordId: Map<string, TimePunchRow[]>;
  records: TimeRecordRow[];
  weekStart: string;
}) {
  const dayPunchIdSet = new Set(day.punchIds);
  const dayPunches = records
    .flatMap((record) => punchesByRecordId.get(record.id) ?? [])
    .filter((punch) => dayPunchIdSet.has(punch.id));
  const visibleDayPunches = dayPunches.filter(isVisibleTimePunch);
  const firstRecordId = day.recordIds[0];
  const correctionHref = firstRecordId
    ? `${getTimePath({
        organizationId,
        timeRecordId: firstRecordId,
        week: weekStart,
      })}#correccion`
    : null;

  return (
    <div className="flex min-h-[300px] min-w-0 flex-col border-border p-2.5 md:border-r md:last:border-r-0">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">
            {formatWeekday(day.date)}
          </p>
          <h3 className="mt-1 text-base font-semibold tracking-tight">
            {formatShortDate(day.date)}
          </h3>
        </div>
        {day.status === "empty" ? null : (
          <StatusBadge tone={getWeekDayStatusTone(day.status)}>
            {getWeekDayStatusLabel(day.status)}
          </StatusBadge>
        )}
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">Asign.</dt>
          <dd className="mt-1 truncate font-mono font-semibold">
            {formatDayDurationStat(day.assignedMinutes)}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">Fich.</dt>
          <dd className="mt-1 truncate font-mono font-semibold">
            {formatDayDurationStat(day.workedMinutes)}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">Dif.</dt>
          <dd className="mt-1 truncate font-mono font-semibold">
            {getWeekBalanceCopy(day.balanceMinutes)}
          </dd>
        </div>
      </dl>

      <div className="mt-3 space-y-2">
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>{day.assignedBlockCount} bloques asignados</span>
          <span>{day.punchCount} fichajes</span>
        </div>
        {visibleDayPunches.length === 0 ? (
          <div className="flex min-h-20 items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 px-3 py-4 text-center text-sm leading-5 text-muted-foreground">
            <CalendarDays
              aria-hidden="true"
              className="size-4 shrink-0 text-muted-foreground"
            />
            <span>Sin entradas o salidas visibles.</span>
          </div>
        ) : (
          <div className="space-y-2">
            {visibleDayPunches.slice(0, 4).map((punch) => (
              <div
                className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-border bg-muted/25 px-2.5 py-2 text-sm"
                key={punch.id}
              >
                <span className="truncate">
                  {getPunchTypeLabel(punch.punch_type)}
                </span>
                <span className="shrink-0 font-mono">
                  {formatTimeOnly(punch.occurred_at, punch.timezone)}
                </span>
              </div>
            ))}
            {visibleDayPunches.length > 4 ? (
              <p className="text-xs text-muted-foreground">
                +{visibleDayPunches.length - 4} fichajes más
              </p>
            ) : null}
          </div>
        )}
      </div>

      {correctionHref ? (
        <div className="mt-auto pt-3">
          {canSubmit ? (
            <Button asChild className="w-full" variant="outline">
              <Link href={correctionHref}>
                <FileClock aria-hidden="true" />
                {correctionApprovalRequired ? "Solicitar ajuste" : "Corregir día"}
              </Link>
            </Button>
          ) : (
            <Button className="w-full" disabled variant="outline">
              <FileClock aria-hidden="true" />
              Sin permiso de corrección
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}

function TimeWeekOverviewSection({
  canSubmit,
  correctionApprovalRequired,
  currentWeekStart,
  error,
  organizationId,
  overview,
  punchesByRecordId,
  records,
  weekStart,
}: {
  canSubmit: boolean;
  correctionApprovalRequired: boolean;
  currentWeekStart: string;
  error?: string;
  organizationId: string;
  overview: OwnTimeWeekOverview | null;
  punchesByRecordId: Map<string, TimePunchRow[]>;
  records: TimeRecordRow[];
  weekStart: string;
}) {
  const summary = overview ? (
    <>
      <Badge variant="outline">{records.length} registros</Badge>
      <Badge variant={overview.totals.warningCount > 0 ? "secondary" : "outline"}>
        {overview.totals.warningCount} avisos
      </Badge>
    </>
  ) : (
    <Badge variant="outline">Sin datos</Badge>
  );

  return (
    <div className="scroll-mt-24" id="fichaje-semana">
      <CollapsibleTimeSection
        action={
          <TimeWeekNavigation
            currentWeekStart={currentWeekStart}
            organizationId={organizationId}
            weekStart={weekStart}
          />
        }
        defaultOpen={Boolean(overview || error)}
        description={
          overview
            ? formatWeekRange(overview.weekStart, overview.weekEnd)
            : "No se ha podido cargar la semana seleccionada."
        }
        summary={summary}
        title="Semana de fichaje"
        tone="history"
      >
        <div className="grid gap-3">
          {error ? (
            <Alert variant="destructive">
              <AlertTriangle aria-hidden="true" />
              <AlertTitle>Semana no disponible</AlertTitle>
              <AlertDescription>
                {errorMessages[error] ??
                  "No se han podido comparar fichajes y asignaciones."}
              </AlertDescription>
            </Alert>
          ) : null}

          {overview ? (
            <>
              <TimeWeekSummaryCards overview={overview} />

              <div className="overflow-hidden rounded-lg border border-border bg-background">
                <div className="overflow-x-auto">
                  <div className="grid min-w-[980px] grid-cols-7 md:min-w-0">
                    {overview.days.map((day) => (
                      <TimeWeekDayColumn
                        canSubmit={canSubmit}
                        correctionApprovalRequired={correctionApprovalRequired}
                        day={day}
                        key={day.date}
                        organizationId={organizationId}
                        punchesByRecordId={punchesByRecordId}
                        records={records}
                        weekStart={weekStart}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </CollapsibleTimeSection>
    </div>
  );
}

function TimeRecordCard({
  centerName,
  punches,
  record,
}: {
  centerName: string;
  punches: TimePunchRow[];
  record: TimeRecordRow;
}) {
  const now = new Date();
  const visiblePunches = punches.filter(isVisibleTimePunch);
  const changeHistoryPunches = punches
    .filter((punch) => isRecentChangedTimePunch(punch, now))
    .sort((first, second) =>
      getPunchChangeTimestamp(second).localeCompare(getPunchChangeTimestamp(first)),
    );

  return (
    <Card size="sm">
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-semibold tracking-tight">
              {formatLocalDate(record.local_work_date)}
            </h3>
            <p className="mt-1 flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin aria-hidden="true" className="size-3.5 shrink-0" />
              <span className="truncate">{centerName}</span>
            </p>
          </div>
          <StatusBadge tone={getRecordStatusTone(record.status)}>
            {getRecordStatusLabel(record.status)}
          </StatusBadge>
        </div>

        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div className="min-w-0">
            <dt className="text-xs font-medium text-muted-foreground">
              Bloque
            </dt>
            <dd className="mt-1 truncate font-medium">
              {record.schedule_block_id ? "Vinculado" : "Sin bloque"}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs font-medium text-muted-foreground">
              Asignacion
            </dt>
            <dd className="mt-1 truncate font-medium">
              {record.schedule_block_assignment_id ? "Vinculada" : "Sin asignacion"}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs font-medium text-muted-foreground">
              Fichajes visibles
            </dt>
            <dd className="mt-1 truncate font-medium">{visiblePunches.length}</dd>
          </div>
        </dl>

        <div className="space-y-2">
          <p className="text-sm font-medium">Fichajes del día</p>
          {visiblePunches.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Sin entradas o salidas visibles.
            </p>
          ) : (
            <div className="grid gap-2">
              {visiblePunches.map((punch) => (
                <div
                  className="grid gap-2 rounded-lg border border-border bg-muted/25 p-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center"
                  key={punch.id}
                >
                  <StatusBadge
                    tone={punch.punch_type === "clock_in" ? "success" : "info"}
                  >
                    {getPunchTypeLabel(punch.punch_type)}
                  </StatusBadge>
                  <span className="min-w-0 truncate font-mono text-sm">
                    {formatDateTime(punch.occurred_at, punch.timezone)}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    Activo
                  </span>
                  {punch.notes ? (
                    <p className="min-w-0 text-sm text-muted-foreground sm:col-span-3">
                      {punch.notes}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>

        {changeHistoryPunches.length > 0 ? (
          <details className="group border-t border-border pt-4">
            <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 outline-none focus-visible:rounded-md focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
              <span className="text-sm font-medium">Historial de cambios</span>
              <span className="inline-flex flex-wrap items-center justify-end gap-2">
                <Badge variant="outline">
                  {changeHistoryPunches.length} cambios
                </Badge>
                <Badge variant="outline">
                  {CHANGE_HISTORY_RETENTION_DAYS} días visibles
                </Badge>
                <span className="text-sm font-medium text-foreground underline underline-offset-4 group-open:hidden">
                  Ver
                </span>
                <span className="hidden text-sm font-medium text-foreground underline underline-offset-4 group-open:inline-flex">
                  Ocultar
                </span>
              </span>
            </summary>
            <div className="mt-3 grid gap-2">
              {changeHistoryPunches.map((punch) => (
                <div
                  className="grid gap-2 rounded-lg border border-dashed border-border bg-muted/10 p-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center"
                  key={punch.id}
                >
                  <StatusBadge
                    tone={punch.punch_type === "clock_in" ? "success" : "info"}
                  >
                    {getPunchTypeLabel(punch.punch_type)}
                  </StatusBadge>
                  <div className="min-w-0">
                    <p className="truncate font-mono text-sm">
                      {formatDateTime(punch.occurred_at, punch.timezone)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Cambio aplicado{" "}
                      {formatDateTime(
                        getPunchChangeTimestamp(punch),
                        punch.timezone,
                      )}
                    </p>
                  </div>
                  <StatusBadge tone={getStatusTone(punch.status)}>
                    {getPunchStatusLabel(punch.status)}
                  </StatusBadge>
                  {punch.notes ? (
                    <p className="min-w-0 text-sm text-muted-foreground sm:col-span-3">
                      {punch.notes}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </details>
        ) : null}
      </CardContent>
    </Card>
  );
}

function CorrectionsAndApprovals({
  approvals,
  corrections,
  timezone,
}: {
  approvals: TimeWeeklyApprovalRow[];
  corrections: TimeRecordCorrectionRow[];
  timezone: string;
}) {
  if (corrections.length === 0 && approvals.length === 0) {
    return (
      <CompactEmptyState
        tone="info"
        description="Cuando existan correcciones solicitadas o semanas revisadas aparecerán aquí."
        title="Sin correcciones ni aprobaciones"
      />
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Card size="sm">
        <CardHeader>
          <CardTitle>Correcciones propias</CardTitle>
          <CardDescription>
            Correcciones y solicitudes recientes sobre tus registros.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {corrections.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No hay correcciones propias recientes.
            </p>
          ) : (
            corrections.map((correction) => (
              <div
                className="flex items-start justify-between gap-3 rounded-lg border border-border bg-muted/25 p-3"
                key={correction.id}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {getCorrectionTypeLabel(correction.correction_type)}
                  </p>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                    {correction.reason}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Registrada{" "}
                    {formatDateTime(correction.created_at, timezone)}
                  </p>
                </div>
                <StatusBadge tone={getStatusTone(correction.status)}>
                  {getCorrectionStatusLabel(correction.status)}
                </StatusBadge>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Aprobaciones semanales</CardTitle>
          <CardDescription>Ultimos cierres visibles para tu persona.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {approvals.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No hay semanas aprobadas o reabiertas todavía.
            </p>
          ) : (
            approvals.map((approval) => (
              <div
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/25 p-3"
                key={approval.id}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    Semana de {formatShortDate(approval.week_start_date)}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {approval.approved_at
                      ? `Aprobada ${formatDateTime(
                          approval.approved_at,
                          timezone,
                        )}`
                      : "Sin fecha de aprobación"}
                  </p>
                </div>
                <StatusBadge tone={getStatusTone(approval.status)}>
                  {getApprovalStatusLabel(approval.status)}
                </StatusBadge>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function TimeExportSection({
  dateFrom,
  dateTo,
  error,
  organizationId,
  people,
}: {
  dateFrom: string;
  dateTo: string;
  error?: string;
  organizationId: string;
  people: ExportPersonOption[];
}) {
  return (
    <Card className="border-primary/20 bg-card shadow-sm">
      <CardHeader className="border-b border-border pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary ring-1 ring-primary/10">
              <Download aria-hidden="true" className="size-5" />
            </span>
            <div className="min-w-0">
              <CardTitle>Exportar CSV interno</CardTitle>
              <CardDescription className="mt-1">
                Descarga los fichajes de un periodo para revisarlos con el
                equipo responsable.
              </CardDescription>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Badge variant="outline">Exporte interno revisable</Badge>
            <Badge variant="outline">CSV interno</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm leading-6 text-muted-foreground">
          El archivo incluye estado del registro, entradas/salidas activas,
          minutos trabajados calculados por pares seguros y estado de cierre
          semanal. No incluye snapshots ni texto libre de correcciones.
        </p>

        {error ? (
          <Alert>
            <AlertTriangle aria-hidden="true" />
            <AlertTitle>Filtro de persona no disponible</AlertTitle>
            <AlertDescription>
              {errorMessages[error] ??
                "Puedes generar el exporte completo del rango."}
            </AlertDescription>
          </Alert>
        ) : null}

        <form
          action="/app/time/export"
          className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto] lg:items-end"
          method="get"
        >
          <input name="organizationId" type="hidden" value={organizationId} />

          <div className="grid gap-2">
            <Label htmlFor="time-export-from">Desde</Label>
            <Input
              defaultValue={dateFrom}
              id="time-export-from"
              name="from"
              required
              type="date"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="time-export-to">Hasta</Label>
            <Input
              defaultValue={dateTo}
              id="time-export-to"
              name="to"
              required
              type="date"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="time-export-person">Persona opcional</Label>
            <select
              className={selectClassName}
              id="time-export-person"
              name="person_profile_id"
            >
              <option value="">Todas las personas visibles</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {getPersonLabel(person)}
                </option>
              ))}
            </select>
          </div>

          <Button className="w-full lg:w-auto" type="submit">
            <Download aria-hidden="true" />
            Descargar CSV
          </Button>
        </form>

        <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-3 text-sm leading-6 text-primary">
          <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <p className="text-primary/90">
            La descarga queda registrada para trazabilidad de la organización.
            Usa el CSV como apoyo interno y revísalo antes de compartirlo fuera
            del equipo.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function DetectOvertimeCandidatesForm({
  organizationId,
  weekStart,
}: {
  organizationId: string;
  weekStart: string;
}) {
  return (
    <form
      action={detectOvertimeCandidatesFromForm}
      className="w-full sm:w-auto"
      data-overtime-candidate-detection-form
    >
      <input name="organizationId" type="hidden" value={organizationId} />
      <input name="weekStart" type="hidden" value={weekStart} />
      <Button className="w-full sm:w-auto" size="sm" type="submit" variant="outline">
        <FileSearch aria-hidden="true" />
        Detectar posibles excesos
      </Button>
    </form>
  );
}

type TimePanelAccent =
  | "default"
  | "info"
  | "pending"
  | "review"
  | "success"
  | "warning";

const timePanelClassNames: Record<TimePanelAccent, string> = {
  default: "",
  info: "border-blue-200/80 ring-1 ring-blue-100/70",
  pending: "border-amber-200/80 ring-1 ring-amber-100/80",
  review: "border-primary/25 ring-1 ring-primary/10",
  success: "border-emerald-200/80 ring-1 ring-emerald-100/80",
  warning: "border-orange-200/80 ring-1 ring-orange-100/80",
};

const timePanelContentClassNames: Record<TimePanelAccent, string> = {
  default: "",
  info: "bg-blue-50/15",
  pending: "bg-amber-50/20",
  review: "bg-primary/5",
  success: "bg-emerald-50/20",
  warning: "bg-orange-50/20",
};

function CollapsibleTimeSection({
  accent = "default",
  action,
  children,
  className,
  contentClassName,
  defaultOpen = false,
  description,
  summary,
  title,
  tone = "default",
}: {
  accent?: TimePanelAccent;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  defaultOpen?: boolean;
  description: string;
  summary?: ReactNode;
  title: string;
  tone?: "action" | "default" | "history" | "review";
}) {
  return (
    <CollapsibleSection
      action={action}
      className={cn(timePanelClassNames[accent], className)}
      contentClassName={cn(timePanelContentClassNames[accent], contentClassName)}
      dataCollapsibleSection={title}
      dataTimeCollapsibleDetails={title}
      defaultOpen={defaultOpen}
      description={description}
      summary={summary}
      title={title}
      tone={tone}
    >
      {children}
    </CollapsibleSection>
  );
}

function CollapsibleReviewQueue({
  accent = "default",
  badge,
  children,
  defaultOpen = false,
  title,
}: {
  accent?: TimePanelAccent;
  badge: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  title: string;
}) {
  return (
    <CollapsibleSection
      className={cn("rounded-lg shadow-none", timePanelClassNames[accent])}
      contentClassName={cn("p-3", timePanelContentClassNames[accent])}
      dataTimeCollapsibleDetails={title}
      dataTimeCollapsibleQueue={title}
      defaultOpen={defaultOpen}
      summary={badge}
      title={title}
    >
      {children}
    </CollapsibleSection>
  );
}

function CompactEmptyState({
  description,
  icon: Icon = CheckCircle2,
  tone = "default",
  title,
}: {
  description: string;
  icon?: LucideIcon;
  tone?: TimePanelAccent;
  title: string;
}) {
  const toneClassNames: Record<TimePanelAccent, string> = {
    default: "border-border bg-muted/15 text-primary",
    info: "border-blue-200/80 bg-blue-50/35 text-blue-700",
    pending: "border-amber-200/80 bg-amber-50/45 text-amber-800",
    review: "border-primary/25 bg-primary/5 text-primary",
    success: "border-emerald-200/80 bg-emerald-50/40 text-emerald-700",
    warning: "border-orange-200/80 bg-orange-50/40 text-orange-700",
  };
  const iconClassNames: Record<TimePanelAccent, string> = {
    default: "bg-primary/10",
    info: "bg-blue-100/80",
    pending: "bg-amber-100/80",
    review: "bg-primary/10",
    success: "bg-emerald-100/80",
    warning: "bg-orange-100/80",
  };

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border border-dashed px-3 py-3",
        toneClassNames[tone],
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg",
          iconClassNames[tone],
        )}
      >
        <Icon aria-hidden="true" className="size-4" />
      </span>
      <div className="min-w-0 text-foreground">
        <p className="text-sm font-semibold tracking-tight">{title}</p>
        <p className="mt-1 text-sm leading-5 text-muted-foreground">
          {description}
        </p>
      </div>
    </div>
  );
}

function OvertimeCandidateStatusForm({
  candidate,
  organizationId,
  weekStart,
}: {
  candidate: OvertimeCandidateRow;
  organizationId: string;
  weekStart: string;
}) {
  if (overtimeCandidateTerminalStatuses.has(candidate.status)) {
    return <Badge variant="outline">Sin acciones</Badge>;
  }

  const defaultStatus =
    candidate.status === "detected" ? "needs_review" : candidate.status;

  return (
    <form
      action={setOvertimeCandidateStatusFromForm}
      className="flex min-w-[17rem] items-center gap-2"
      data-overtime-candidate-status-form
    >
      <input name="organizationId" type="hidden" value={organizationId} />
      <input name="candidateId" type="hidden" value={candidate.id} />
      <input name="weekStart" type="hidden" value={weekStart} />
      <Label className="sr-only" htmlFor={`overtime-status-${candidate.id}`}>
        Estado operativo
      </Label>
      <select
        className={selectClassName}
        defaultValue={defaultStatus}
        id={`overtime-status-${candidate.id}`}
        name="overtimeCandidateStatus"
      >
        {overtimeCandidateStatusOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <Button size="sm" type="submit" variant="outline">
        Actualizar
      </Button>
    </form>
  );
}

function OvertimeCandidateReviewSection({
  candidates,
  error,
  organizationId,
  references,
  weekStart,
}: {
  candidates: OvertimeCandidateRow[] | null;
  error?: string;
  organizationId: string;
  references: OvertimeCandidateReferences | null;
  weekStart: string;
}) {
  const candidateCount = candidates?.length ?? 0;
  const actionableCount =
    candidates?.filter(
      (candidate) => !overtimeCandidateTerminalStatuses.has(candidate.status),
    ).length ?? 0;
  const shouldOpen =
    Boolean(error || references?.errors.length) || candidateCount > 0;

  return (
    <div data-overtime-candidates-review>
      <CollapsibleTimeSection
        accent="review"
        action={
          <DetectOvertimeCandidatesForm
            organizationId={organizationId}
            weekStart={weekStart}
          />
        }
        defaultOpen={shouldOpen}
        description="Revisa posibles diferencias entre lo previsto y lo fichado antes de tomar una decision."
        summary={<Badge variant="outline">{actionableCount} por revisar</Badge>}
        title="Posibles excesos de horas"
        tone="review"
      >

      {error ? (
        <Alert variant="destructive">
          <AlertTriangle aria-hidden="true" />
          <AlertTitle>No se ha podido cargar la cola</AlertTitle>
          <AlertDescription>
            {errorMessages[error] ??
              "La revisión de candidatos operativos no está disponible."}
          </AlertDescription>
        </Alert>
      ) : references?.errors.length ? (
        <Alert>
          <AlertTriangle aria-hidden="true" />
          <AlertTitle>Carga parcial</AlertTitle>
          <AlertDescription>{references.errors.join(" ")}</AlertDescription>
        </Alert>
      ) : null}

      {!error && candidates && candidateCount === 0 ? (
        <CompactEmptyState
          description="Cuando detectemos una diferencia que necesite revisión, aparecerá aquí."
          tone="review"
          title="No hay posibles excesos por revisar"
        />
      ) : null}

      {!error && candidates && candidateCount > 0 ? (
        <div className="rounded-lg border border-border bg-background">
          <div className="border-b border-border px-3 py-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
              <FileClock aria-hidden="true" className="size-4" />
              Revision de posibles excesos
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Revisa cada caso y marca su estado. Cambiar el estado no modifica
              fichajes, bloques ni asignaciones.
            </p>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Persona afectada</TableHead>
                  <TableHead>Rango</TableHead>
                  <TableHead className="text-right">Planificado</TableHead>
                  <TableHead className="text-right">Trabajado</TableHead>
                  <TableHead className="text-right">Diferencia</TableHead>
                  <TableHead>Estado operativo</TableHead>
                  <TableHead>Fuente de detección</TableHead>
                  <TableHead>Fechas</TableHead>
                  <TableHead>Accion</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {candidates.map((candidate) => {
                  const person = references?.people.get(
                    candidate.person_profile_id,
                  );
                  const timezone = candidate.timezone || "UTC";
                  const candidateMinutes =
                    candidate.candidate_minutes ??
                    candidate.worked_minutes_snapshot -
                      candidate.planned_minutes_snapshot;

                  return (
                    <TableRow key={candidate.id}>
                      <TableCell className="min-w-48 max-w-64">
                        <div className="min-w-0">
                          <p className="truncate font-medium">
                            {getPersonLabel(person)}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {formatShortId(candidate.person_profile_id)}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">
                        {formatCandidatePeriod(candidate)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatDuration(candidate.planned_minutes_snapshot)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatDuration(candidate.worked_minutes_snapshot)}
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold">
                        {formatPositiveDuration(candidateMinutes)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          tone={getOvertimeCandidateStatusTone(candidate.status)}
                        >
                          {getOvertimeCandidateStatusLabel(candidate.status)}
                        </StatusBadge>
                      </TableCell>
                      <TableCell>
                        {getOvertimeCandidateDetectionSourceLabel(
                          candidate.detection_source,
                        )}
                      </TableCell>
                      <TableCell className="min-w-56 text-xs text-muted-foreground">
                        <div>Creado {formatDateTime(candidate.created_at, timezone)}</div>
                        <div>
                          Revisado{" "}
                          {candidate.reviewed_at
                            ? formatDateTime(candidate.reviewed_at, timezone)
                            : "pendiente"}
                        </div>
                        <div>
                          Cerrado{" "}
                          {candidate.closed_at
                            ? formatDateTime(candidate.closed_at, timezone)
                            : "pendiente"}
                        </div>
                      </TableCell>
                      <TableCell>
                        <OvertimeCandidateStatusForm
                          candidate={candidate}
                          organizationId={organizationId}
                          weekStart={weekStart}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : null}
      </CollapsibleTimeSection>
    </div>
  );
}

function SnapshotSummary({
  items,
  title,
}: {
  items: Array<{ label: string; value: string }>;
  title: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3">
      <p className="text-sm font-medium">{title}</p>
      <dl className="mt-3 space-y-2">
        {items.map((item) => (
          <div className="grid gap-1" key={`${title}-${item.label}`}>
            <dt className="text-xs font-medium text-muted-foreground">
              {item.label}
            </dt>
            <dd className="min-w-0 overflow-hidden text-ellipsis break-words text-sm">
              {item.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function CorrectionRequestSummary({
  centerNames,
  correction,
  references,
  timezone,
}: {
  centerNames: Map<string, string>;
  correction: TimeRecordCorrectionRow;
  references: ReviewReferences;
  timezone: string;
}) {
  const requesterId =
    correction.requested_by_person_profile_id ?? correction.person_profile_id;
  const requester = references.people.get(requesterId);
  const record = references.records.get(correction.time_record_id);
  const punch = correction.time_punch_id
    ? references.punches.get(correction.time_punch_id)
    : undefined;
  const centerLabel = record?.center_id
    ? centerNames.get(record.center_id) ?? "Centro no disponible"
    : "Sin centro vinculado";

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={getStatusTone(correction.status)}>
              {getCorrectionStatusLabel(correction.status)}
            </StatusBadge>
            <Badge variant="outline">
              {getCorrectionTypeLabel(correction.correction_type)}
            </Badge>
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold tracking-tight">
              {getPersonLabel(requester)}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Solicitada {formatDateTime(correction.created_at, timezone)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <UserRound aria-hidden="true" className="size-4" />
          <span className="max-w-40 truncate">{formatShortId(requesterId)}</span>
        </div>
      </div>

      <dl className="grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
        <div className="min-w-0">
          <dt className="text-xs font-medium text-muted-foreground">
            Registro afectado
          </dt>
          <dd className="mt-1 min-w-0 truncate font-medium">
            {getRecordLabel(record)}
          </dd>
          <dd className="mt-0.5 truncate text-xs text-muted-foreground">
            {formatShortId(correction.time_record_id)}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs font-medium text-muted-foreground">
            Fichaje afectado
          </dt>
          <dd className="mt-1 min-w-0 truncate font-medium">
            {getPunchLabel(punch)}
          </dd>
          {correction.time_punch_id ? (
            <dd className="mt-0.5 truncate text-xs text-muted-foreground">
              {formatShortId(correction.time_punch_id)}
            </dd>
          ) : null}
        </div>
        <div className="min-w-0">
          <dt className="text-xs font-medium text-muted-foreground">
            Centro del registro
          </dt>
          <dd className="mt-1 min-w-0 truncate font-medium">{centerLabel}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs font-medium text-muted-foreground">
            Contexto de horario
          </dt>
          <dd className="mt-1 min-w-0 truncate font-medium">
            {record?.schedule_block_id ? "Bloque vinculado" : "Sin bloque"}
          </dd>
          <dd className="mt-0.5 truncate text-xs text-muted-foreground">
            {record?.schedule_block_assignment_id
              ? "Asignacion vinculada"
              : "Sin asignacion"}
          </dd>
        </div>
      </dl>

      <div className="rounded-lg border border-border bg-muted/20 p-3">
        <p className="text-sm font-medium">Motivo</p>
        <p className="mt-1 break-words text-sm text-muted-foreground">
          {correction.reason}
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <SnapshotSummary
          items={getSnapshotSummary(correction.before_snapshot, timezone)}
          title="Antes"
        />
        <SnapshotSummary
          items={getSnapshotSummary(correction.after_snapshot, timezone)}
          title="Solicitud"
        />
      </div>
    </>
  );
}

function ReviewCorrectionCard({
  centerNames,
  correction,
  organizationId,
  references,
  timezone,
}: {
  centerNames: Map<string, string>;
  correction: TimeRecordCorrectionRow;
  organizationId: string;
  references: ReviewReferences;
  timezone: string;
}) {
  const approveNoteId = `approve-note-${correction.id}`;
  const rejectNoteId = `reject-note-${correction.id}`;

  return (
    <Card size="sm">
      <CardContent className="space-y-4">
        <CorrectionRequestSummary
          centerNames={centerNames}
          correction={correction}
          references={references}
          timezone={timezone}
        />

        <div className="grid gap-3 border-t border-border pt-4 lg:grid-cols-2">
          <form action={reviewTimeCorrectionFromForm} className="grid gap-3">
            <input name="organizationId" type="hidden" value={organizationId} />
            <input name="correctionId" type="hidden" value={correction.id} />
            <input name="decision" type="hidden" value="approved" />
            <div className="grid gap-2">
              <Label htmlFor={approveNoteId}>Nota al aprobar opcional</Label>
              <Textarea
                id={approveNoteId}
                maxLength={2000}
                name="reviewNote"
                placeholder="Ej. revisado con la persona solicitante"
                rows={3}
              />
            </div>
            <Button type="submit">
              <CheckCircle2 aria-hidden="true" />
              Aprobar solicitud
            </Button>
          </form>

          <form action={reviewTimeCorrectionFromForm} className="grid gap-3">
            <input name="organizationId" type="hidden" value={organizationId} />
            <input name="correctionId" type="hidden" value={correction.id} />
            <input name="decision" type="hidden" value="rejected" />
            <div className="grid gap-2">
              <Label htmlFor={rejectNoteId}>Nota de rechazo obligatoria</Label>
              <Textarea
                id={rejectNoteId}
                maxLength={2000}
                name="reviewNote"
                placeholder="Explica por qué se rechaza la solicitud"
                required
                rows={3}
              />
            </div>
            <Button type="submit" variant="destructive">
              <XCircle aria-hidden="true" />
              Rechazar solicitud
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}

function ApplyCorrectionCard({
  centerNames,
  correction,
  organizationId,
  references,
  timezone,
}: {
  centerNames: Map<string, string>;
  correction: TimeRecordCorrectionRow;
  organizationId: string;
  references: ReviewReferences;
  timezone: string;
}) {
  return (
    <Card size="sm">
      <CardContent className="space-y-4">
        <CorrectionRequestSummary
          centerNames={centerNames}
          correction={correction}
          references={references}
          timezone={timezone}
        />

        <div className="grid gap-3 border-t border-border pt-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <SnapshotSummary
            items={getCorrectionApplicationSummary(correction, timezone)}
            title="Al aplicar"
          />
          <form action={applyTimeCorrectionFromForm} className="grid gap-3">
            <input name="organizationId" type="hidden" value={organizationId} />
            <input name="correctionId" type="hidden" value={correction.id} />
            <Button type="submit">
              <ClipboardCheck aria-hidden="true" />
              Aplicar corrección aprobada
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}

function TimeCorrectionReviewSection({
  approvedCorrections,
  canReview,
  centerNames,
  correctionApprovalRequired,
  error,
  organizationId,
  pendingCorrections,
  references,
  timezone,
}: {
  approvedCorrections: TimeRecordCorrectionRow[] | null;
  canReview: boolean;
  centerNames: Map<string, string>;
  correctionApprovalRequired: boolean;
  error?: string;
  organizationId: string;
  pendingCorrections: TimeRecordCorrectionRow[] | null;
  references: ReviewReferences | null;
  timezone: string;
}) {
  const approvedCount = approvedCorrections?.length ?? 0;
  const pendingCount = pendingCorrections?.length ?? 0;
  const shouldOpen =
    Boolean(error || references?.errors.length) ||
    approvedCount + pendingCount > 0;

  return (
    <CollapsibleTimeSection
      accent="info"
      defaultOpen={shouldOpen}
      description={
        correctionApprovalRequired
          ? "Revisa solicitudes de ajuste y aplica las aprobadas cuando corresponda."
          : "La revisión de nuevas correcciones está desactivada. Puedes consultar solicitudes anteriores si existen."
      }
      summary={
        <Badge variant={canReview ? "secondary" : "outline"}>
          {canReview
            ? `${approvedCount} para aplicar / ${pendingCount} por revisar`
            : "Sin permiso"}
        </Badge>
      }
      title="Correcciones del equipo"
      tone="review"
    >

      {!canReview || error === "forbidden" ? (
        <Alert variant="destructive">
          <AlertTriangle aria-hidden="true" />
          <AlertTitle>Acceso no autorizado</AlertTitle>
          <AlertDescription>
            Esta revisión solo está disponible para Propietario, Administrador
            y Responsable de la organización activa. No se muestran solicitudes
            ni acciones administrativas.
          </AlertDescription>
        </Alert>
      ) : error ? (
        <Alert variant="destructive">
          <AlertTriangle aria-hidden="true" />
          <AlertTitle>No se ha podido cargar la revisión</AlertTitle>
          <AlertDescription>
            {errorMessages[error] ?? "La cola de correcciones no está disponible."}
          </AlertDescription>
        </Alert>
      ) : references?.errors.length ? (
        <Alert>
          <AlertTriangle aria-hidden="true" />
          <AlertTitle>Carga parcial</AlertTitle>
          <AlertDescription>{references.errors.join(" ")}</AlertDescription>
        </Alert>
      ) : null}

      {canReview && !error && references ? (
        <div className="grid gap-3">
          <CollapsibleReviewQueue
            accent="info"
            badge={<Badge variant="outline">{approvedCount} para aplicar</Badge>}
            defaultOpen={approvedCount > 0}
            title="Listas para aplicar"
          >

            {approvedCount === 0 ? (
              <CompactEmptyState
                description="Cuando una corrección esté aprobada y pendiente de aplicar, aparecerá aquí."
                tone="info"
                title="No hay correcciones listas"
              />
            ) : (
              <div className="grid gap-3">
                <Alert>
                  <ClipboardCheck aria-hidden="true" />
                  <AlertTitle>Aplicar correcciones</AlertTitle>
                  <AlertDescription>
                    Al aplicar una corrección aprobada, el historial de fichajes
                    se actualiza segun la decision registrada.
                  </AlertDescription>
                </Alert>

                {approvedCorrections?.map((correction) => (
                  <ApplyCorrectionCard
                    centerNames={centerNames}
                    correction={correction}
                    key={correction.id}
                    organizationId={organizationId}
                    references={references}
                    timezone={timezone}
                  />
                ))}
              </div>
            )}
          </CollapsibleReviewQueue>

          <CollapsibleReviewQueue
            accent="pending"
            badge={<Badge variant="outline">{pendingCount} pendientes</Badge>}
            defaultOpen={pendingCount > 0}
            title="Solicitudes pendientes"
          >

            {pendingCount === 0 ? (
              <CompactEmptyState
                description="Cuando alguien solicite una corrección pendiente, aparecerá aquí para revisarla con trazabilidad."
                tone="pending"
                title="Sin correcciones pendientes"
              />
            ) : (
              <div className="grid gap-3">
                <Alert>
                  <ClipboardCheck aria-hidden="true" />
                  <AlertTitle>Revisión antes de aplicar</AlertTitle>
                  <AlertDescription>
                    Aprobar una solicitud solo deja constancia de la revisión.
                    Para cambiar el histórico operativo hay que aplicarla de
                    forma explicita después.
                  </AlertDescription>
                </Alert>

                {pendingCorrections?.map((correction) => (
                  <ReviewCorrectionCard
                    centerNames={centerNames}
                    correction={correction}
                    key={correction.id}
                    organizationId={organizationId}
                    references={references}
                    timezone={timezone}
                  />
                ))}
              </div>
            )}
          </CollapsibleReviewQueue>
        </div>
      ) : null}
    </CollapsibleTimeSection>
  );
}

export default async function TimePage({ searchParams }: TimePageProps) {
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect(getLoginPath("/app/time"));
  }

  const params = await searchParams;
  const organizationId = getParam(params.organizationId);
  const recordId = getParam(params.record_id);
  const status = getParam(params.status);
  const error = getParam(params.error);
  const weekParam = getParam(params.week);
  const overtimeDetectionCounts = {
    created: getNonNegativeCountParam(params.overtime_created),
    existing: getNonNegativeCountParam(params.overtime_existing),
    ignored: getNonNegativeCountParam(params.overtime_ignored),
  };
  const memberships = await getActiveMemberships(user.id);
  const resolution = resolveActiveOrganization(memberships, organizationId);

  if (!resolution.ok) {
    return (
      <div className="space-y-6">
        <PageHeader
          badge="Fichaje"
          description="Entrada y salida manual propias dentro de la organización activa."
          title="Mi fichaje"
        />
        <OrganizationResolutionState basePath="/app/time" resolution={resolution} />
      </div>
    );
  }

  const week = resolveWeek(weekParam, resolution.organization.timezone);
  const currentWeek = resolveWeek(undefined, resolution.organization.timezone);
  const punchDateTimeDefaults = getLocalDateTimeDefaults(
    resolution.organization.timezone,
  );
  const baseOptions = {
    organizationId: resolution.organization.id,
    week: week.weekStart,
  };
  const roleLabel = getApplicationRoleLabel(resolution.membership.role);
  const canReviewCorrections = canReviewTimeTracking(resolution.membership.role);
  const canReviewOvertime = canReviewOvertimeCandidates(
    resolution.membership.role,
  );
  const timeTrackingSettings = resolveOrganizationTimeTrackingSettings(
    resolution.organization.time_tracking_config,
  );

  const [
    centersResult,
    weekOverviewResult,
    latestPunchesResult,
    correctionsResult,
    approvalsResult,
    reviewCorrectionsResult,
    approvedCorrectionsResult,
    exportPeopleResult,
    overtimeCandidatesResult,
    ownCoachPrimaryCenterId,
  ] = await Promise.all([
    getCenterOptions(resolution.organization.id),
    getOwnTimeWeekOverview({
      organizationId: resolution.organization.id,
      weekStart: week.weekStart,
    }),
    listOwnTimePunches({
      limit: 80,
      organizationId: resolution.organization.id,
      status: "active",
    }),
    listOwnTimeCorrections({
      limit: 12,
      organizationId: resolution.organization.id,
    }),
    listOwnTimeWeeklyApprovals({
      limit: 8,
      organizationId: resolution.organization.id,
    }),
    canReviewCorrections
      ? listTimeCorrectionsForReview({
          limit: 25,
          organizationId: resolution.organization.id,
          status: "pending",
        })
      : Promise.resolve(null),
    canReviewCorrections
      ? listTimeCorrectionsForReview({
          limit: 25,
          organizationId: resolution.organization.id,
          status: "approved",
        })
      : Promise.resolve(null),
    canReviewCorrections
      ? getExportPersonOptions(resolution.organization.id)
      : Promise.resolve(null),
    canReviewOvertime
      ? listOvertimeCandidates({
          limit: 50,
          organizationId: resolution.organization.id,
        })
      : Promise.resolve(null),
    getOwnCoachPrimaryCenterId({
      organizationId: resolution.organization.id,
      userId: user.id,
    }),
  ]);

  const centers = centersResult.ok ? centersResult.data : [];
  const activeCenters = centers.filter((center) => center.status === "active");
  const defaultPunchCenterId = activeCenters.some(
    (center) => center.id === ownCoachPrimaryCenterId,
  )
    ? ownCoachPrimaryCenterId
    : null;
  const centerNames = new Map(
    centers.map((center) => [center.id, center.name] as const),
  );
  const weekOverview = weekOverviewResult.ok ? weekOverviewResult.data : null;
  const records = weekOverview?.records ?? [];
  const punches = weekOverview?.punches ?? [];
  const latestPunches = latestPunchesResult.ok ? latestPunchesResult.data : [];
  const corrections = correctionsResult.ok ? correctionsResult.data : [];
  const approvals = approvalsResult.ok ? approvalsResult.data : [];
  const reviewCorrections = reviewCorrectionsResult?.ok
    ? reviewCorrectionsResult.data
    : null;
  const approvedCorrections = approvedCorrectionsResult?.ok
    ? approvedCorrectionsResult.data
    : null;
  const exportPeople = exportPeopleResult?.ok ? exportPeopleResult.data : [];
  const exportPeopleError =
    exportPeopleResult && !exportPeopleResult.ok
      ? exportPeopleResult.error
      : undefined;
  const overtimeCandidates = overtimeCandidatesResult?.ok
    ? overtimeCandidatesResult.data
    : null;
  const overtimeCandidatesError =
    overtimeCandidatesResult && !overtimeCandidatesResult.ok
      ? `overtime_${overtimeCandidatesResult.error.replaceAll("-", "_")}`
      : undefined;
  const reviewError =
    reviewCorrectionsResult && !reviewCorrectionsResult.ok
      ? reviewCorrectionsResult.error
      : approvedCorrectionsResult && !approvedCorrectionsResult.ok
        ? approvedCorrectionsResult.error
      : undefined;
  const adminCorrections = [
    ...(reviewCorrections ?? []),
    ...(approvedCorrections ?? []),
  ];
  const reviewReferences =
    adminCorrections.length > 0
      ? await getCorrectionReviewReferences({
          corrections: adminCorrections,
          organizationId: resolution.organization.id,
        })
      : reviewCorrections || approvedCorrections
        ? {
            errors: [],
            people: new Map<string, ReviewPerson>(),
            punches: new Map<string, ReviewTimePunch>(),
            records: new Map<string, ReviewTimeRecord>(),
          }
        : null;
  const overtimeCandidateReferences =
    canReviewOvertime && overtimeCandidates
      ? await getOvertimeCandidateReferences({
          candidates: overtimeCandidates,
          organizationId: resolution.organization.id,
        })
      : canReviewOvertime && overtimeCandidatesResult
        ? {
            errors: [],
            people: new Map<string, ReviewPerson>(),
          }
        : null;
  const punchesByRecordId = groupPunchesByRecordId(punches);
  const visiblePunchesByRecordId = groupPunchesByRecordId(
    punches.filter(isVisibleTimePunch),
  );
  const selectedRecordId =
    recordId && records.some((record) => record.id === recordId)
      ? recordId
      : null;
  const loadErrorCandidates: Array<string | null> = [
    centersResult.ok ? null : centersResult.error,
    weekOverviewResult.ok ? null : weekOverviewResult.error,
    latestPunchesResult.ok ? null : latestPunchesResult.error,
    correctionsResult.ok ? null : correctionsResult.error,
    approvalsResult.ok ? null : approvalsResult.error,
  ];
  const loadErrors = loadErrorCandidates.filter(
    (code): code is string => code !== null,
  );
  const blockingError = loadErrors.find((code) =>
    blockingErrorCodes.has(code ?? ""),
  );
  const canSubmitPunch =
    !blockingError && canUsePersonalFeatures(resolution.membership.role);

  return (
    <div className="space-y-6">
      <PageHeader
        actions={
          <Button asChild variant="outline">
            <Link href={getTimePath(baseOptions)}>
              <Clock aria-hidden="true" />
              Actualizar
            </Link>
          </Button>
        }
        badge="Fichaje"
        meta={
          <>
            <Badge variant="secondary">{resolution.organization.name}</Badge>
            <Badge variant="outline">{roleLabel}</Badge>
            <Badge variant="outline">
              {formatWeekRange(week.weekStart, week.weekEnd)}
            </Badge>
          </>
        }
        title="Mi fichaje"
      >
        <details className="group max-w-3xl">
          <summary className="cursor-pointer list-none text-sm leading-6 text-muted-foreground outline-none focus-visible:rounded-md focus-visible:ring-3 focus-visible:ring-ring/50 md:text-base [&::-webkit-details-marker]:hidden">
            <span>
              Registra tu jornada y revisa tus horas de la semana en un solo
              sitio.
            </span>{" "}
            <span className="inline-flex font-medium text-foreground underline underline-offset-4 group-open:hidden">
              Más
            </span>
            <span className="hidden font-medium text-foreground underline underline-offset-4 group-open:inline-flex">
              Menos
            </span>
          </summary>

          <div className="mt-3 grid gap-3">
            <Alert>
              <ShieldCheck aria-hidden="true" />
              <AlertTitle>Tus fichajes de la semana</AlertTitle>
              <AlertDescription>
                Marca entradas y salidas desde la web y revisa el historial
                semanal. Esta pantalla no solicita ubicación.
              </AlertDescription>
            </Alert>

            <Alert>
              <FileClock aria-hidden="true" />
              <AlertTitle>Corregir fichajes</AlertTitle>
              <AlertDescription>
                {timeTrackingSettings.correctionApprovalRequired
                  ? "Si necesitas ajustar una hora, envía la corrección y el equipo la revisará."
                  : "Si necesitas ajustar una hora, envía la corrección y quedará reflejada en el historial."}
              </AlertDescription>
            </Alert>
          </div>
        </details>
      </PageHeader>

      {status === "overtime-detection-complete" ? (
        <TransientFeedbackBanner
          description={getOvertimeDetectionDescription(overtimeDetectionCounts)}
          title={successMessages[status]}
          tone="success"
        />
      ) : status && successMessages[status] ? (
        <TransientFeedbackBanner
          description="La semana seleccionada ya muestra la informacion disponible."
          title={successMessages[status]}
          tone="success"
        />
      ) : null}

      {error && errorMessages[error] ? (
        <TransientFeedbackBanner
          description={errorMessages[error]}
          title="No se ha completado la acción"
          tone="error"
        />
      ) : null}

      {loadErrors.length > 0 ? (
        <Alert variant={blockingError ? "destructive" : "default"}>
          <AlertTriangle aria-hidden="true" />
          <AlertTitle>
            {blockingError ? "Fichaje no disponible" : "Carga parcial"}
          </AlertTitle>
          <AlertDescription>
            {getLoadErrorMessages(loadErrors)}
          </AlertDescription>
        </Alert>
      ) : null}

      {week.invalidWeekParam ? (
        <Alert>
          <AlertTriangle aria-hidden="true" />
          <AlertTitle>Semana ajustada</AlertTitle>
          <AlertDescription>
            La fecha de semana recibida no era válida. Se muestra la semana
            actual de la organización.
          </AlertDescription>
        </Alert>
      ) : null}

      <TimePunchForm
        activeCenters={activeCenters}
        canSubmit={canSubmitPunch}
        defaultCenterId={defaultPunchCenterId}
        defaultPunchDate={punchDateTimeDefaults.date}
        defaultPunchTime={punchDateTimeDefaults.time}
        organizationId={resolution.organization.id}
        timezone={resolution.organization.timezone}
      />

      <CurrentTimeState
        correctionApprovalRequired={
          timeTrackingSettings.correctionApprovalRequired
        }
        corrections={corrections}
        latestPunch={latestPunches[0] ?? punches.find(isVisibleTimePunch)}
        records={records}
        timezone={resolution.organization.timezone}
      />

      <TimeWeekOverviewSection
        canSubmit={canSubmitPunch}
        correctionApprovalRequired={
          timeTrackingSettings.correctionApprovalRequired
        }
        currentWeekStart={currentWeek.weekStart}
        error={weekOverviewResult.ok ? undefined : weekOverviewResult.error}
        organizationId={resolution.organization.id}
        overview={weekOverview}
        punchesByRecordId={visiblePunchesByRecordId}
        records={records}
        weekStart={week.weekStart}
      />

      {canReviewCorrections ? (
        <TimeExportSection
          dateFrom={week.weekStart}
          dateTo={week.weekEnd}
          error={exportPeopleError}
          organizationId={resolution.organization.id}
          people={exportPeople}
        />
      ) : null}

      {canReviewOvertime ? (
        <OvertimeCandidateReviewSection
          candidates={overtimeCandidates}
          error={overtimeCandidatesError}
          organizationId={resolution.organization.id}
          references={overtimeCandidateReferences}
          weekStart={week.weekStart}
        />
      ) : null}

      {canReviewCorrections ? (
        <TimeCorrectionReviewSection
          approvedCorrections={approvedCorrections}
          canReview={canReviewCorrections}
          centerNames={centerNames}
          correctionApprovalRequired={
            timeTrackingSettings.correctionApprovalRequired
          }
          error={reviewError}
          organizationId={resolution.organization.id}
          pendingCorrections={reviewCorrections}
          references={reviewReferences}
          timezone={resolution.organization.timezone}
        />
      ) : null}

      <TimeCorrectionForm
        canSubmit={canSubmitPunch}
        correctionApprovalRequired={
          timeTrackingSettings.correctionApprovalRequired
        }
        organizationId={resolution.organization.id}
        punchesByRecordId={visiblePunchesByRecordId}
        records={records}
        selectedRecordId={selectedRecordId}
        weekStart={week.weekStart}
      />

      <div className="scroll-mt-24" id="registros">
        <CollapsibleTimeSection
          accent="warning"
          defaultOpen={records.length > 0}
          description="Entradas, salidas y registros visibles de la semana seleccionada."
          summary={<Badge variant="outline">{records.length} de la semana</Badge>}
          title="Registros de la semana"
          tone="history"
        >
          {records.length === 0 ? (
            <CompactEmptyState
              description="Cuando exista una entrada o salida en esta semana, BoxOps mostrará aquí su registro de jornada."
              tone="warning"
              title="Sin fichajes en esta semana"
            />
          ) : (
            <div className="grid gap-3">
              {records.map((record) => (
                <TimeRecordCard
                  centerName={
                    record.center_id
                      ? centerNames.get(record.center_id) ?? "Centro no disponible"
                      : "Sin centro vinculado"
                  }
                  key={record.id}
                  punches={punchesByRecordId.get(record.id) ?? []}
                  record={record}
                />
              ))}
            </div>
          )}
        </CollapsibleTimeSection>
      </div>

      <div className="scroll-mt-24" id="correcciones">
        <CollapsibleTimeSection
          accent="info"
          defaultOpen={corrections.length + approvals.length > 0}
          description="Vista propia de solicitudes y cierres cuando existan."
          summary={
            <Badge variant="outline">
              {corrections.length + approvals.length} movimientos
            </Badge>
          }
          title="Correcciones y aprobaciones"
          tone="history"
        >
          <CorrectionsAndApprovals
            approvals={approvals}
            corrections={corrections}
            timezone={resolution.organization.timezone}
          />
        </CollapsibleTimeSection>
      </div>
    </div>
  );
}
