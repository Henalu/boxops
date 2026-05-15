import { redirect } from "next/navigation";
import Link from "next/link";
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
  FileClock,
  LogIn,
  LogOut,
  MapPin,
  ShieldCheck,
  Timer,
  UserRound,
  XCircle,
} from "lucide-react";

import {
  applyTimeCorrectionFromForm,
  createOwnTimePunchFromForm,
  reviewTimeCorrectionFromForm,
  submitOwnTimeCorrectionFromForm,
} from "./actions";
import { OrganizationResolutionState } from "@/components/features/organization-resolution-state";
import {
  EmptyState,
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getLoginPath } from "@/lib/auth/redirects";
import {
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
import type { Json, Tables } from "@/types/supabase";

export const dynamic = "force-dynamic";

type TimePageProps = {
  searchParams: Promise<{
    error?: string | string[];
    organizationId?: string | string[];
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
    "La nota de revisión es obligatoria al rechazar y no puede superar el limite permitido.",
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
  load_failed: "No se han podido cargar los registros de fichaje.",
  no_active_memberships: "No hay accesos activos para este usuario.",
  organization_not_found: "La organización solicitada no está disponible.",
  organization_required: "Elige una organización antes de fichar.",
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
    punch_add: "Anadir fichaje omitido",
    punch_update: "Corregir hora de entrada/salida",
    punch_void: "Anular fichaje erroneo",
    record_update: "Nota o corrección de registro",
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
    return "Correcto";
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
  const hasRecords = records.length > 0;
  const actionLabel = correctionApprovalRequired
    ? "Solicitar corrección"
    : "Aplicar corrección";

  return (
    <Card id="correccion">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileClock aria-hidden="true" className="size-4" />
          {actionLabel}
        </CardTitle>
        <CardDescription>
          {correctionApprovalRequired
            ? "Selecciona un registro propio reciente. La solicitud queda pendiente hasta revisión."
            : "Selecciona un registro propio reciente. La corrección se aplica al enviar de forma trazada."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!hasRecords ? (
          <p className="text-sm text-muted-foreground">
            Necesitas tener al menos un registro reciente para hacer una
            corrección.
          </p>
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
                  <option value="punch_add">Anadir fichaje omitido</option>
                  <option value="punch_update">
                    Corregir hora de entrada/salida
                  </option>
                  <option value="punch_void">Anular fichaje erroneo</option>
                  <option value="record_update">
                    Nota o corrección de registro
                  </option>
                </select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="timeRecordId">Registro reciente</Label>
                <select
                  className={selectClassName}
                  defaultValue={selectedRecordId ?? records[0]?.id}
                  id="timeRecordId"
                  name="timeRecordId"
                  required
                >
                  {records.map((record) => (
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
              >
                <option value="">Sin fichaje asociado</option>
                {records.map((record) => {
                  const recordPunches = punchesByRecordId.get(record.id) ?? [];

                  if (recordPunches.length === 0) {
                    return null;
                  }

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
                Necesario para corregir o anular un fichaje. Para anadir uno
                omitido o corregir el registro, dejalo vacío.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="punchType">Tipo si falta fichaje</Label>
                <select className={selectClassName} id="punchType" name="punchType">
                  <option value="clock_in">Entrada</option>
                  <option value="clock_out">Salida</option>
                </select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="occurredAtLocal">Hora solicitada</Label>
                <Input
                  id="occurredAtLocal"
                  name="occurredAtLocal"
                  type="datetime-local"
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="correctionNote">Cambio del registro</Label>
              <Textarea
                id="correctionNote"
                maxLength={1000}
                name="correctionNote"
                placeholder="Ej. marcar el registro como jornada correcta sin tocar fichajes"
                rows={3}
              />
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
    <div className="grid gap-3 sm:grid-cols-3">
      <StatCard
        description={
          latestPunch
            ? formatDateTime(latestPunch.occurred_at, latestPunch.timezone)
            : "Aún no hay entradas o salidas registradas."
        }
        icon={Clock}
        label="Ultimo fichaje"
        tone={latestPunch?.punch_type === "clock_out" ? "info" : "success"}
        value={latestPunch ? getPunchTypeLabel(latestPunch.punch_type) : "Sin datos"}
      />
      <StatCard
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
      <StatCard
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
    <div className="grid gap-3 md:grid-cols-4">
      <StatCard
        description={`${overview.assignedBlockCount} bloques asignados visibles. ${contractedCopy}`}
        icon={CalendarDays}
        label="Asignadas"
        tone="info"
        value={assignedValue}
      />
      <StatCard
        description="Suma de pares entrada/salida activos en la semana."
        icon={Clock}
        label="Fichadas"
        tone="neutral"
        value={workedValue}
      />
      <StatCard
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
      <StatCard
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
    <div className="flex min-h-[360px] min-w-0 flex-col border-border p-3 md:border-r md:last:border-r-0">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">
            {formatWeekday(day.date)}
          </p>
          <h3 className="mt-1 text-base font-semibold tracking-tight">
            {formatShortDate(day.date)}
          </h3>
        </div>
        <StatusBadge tone={getWeekDayStatusTone(day.status)}>
          {getWeekDayStatusLabel(day.status)}
        </StatusBadge>
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-2 text-sm">
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">Asign.</dt>
          <dd className="mt-1 truncate font-mono font-semibold">
            {formatDuration(day.assignedMinutes)}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">Fich.</dt>
          <dd className="mt-1 truncate font-mono font-semibold">
            {formatDuration(day.workedMinutes)}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">Dif.</dt>
          <dd className="mt-1 truncate font-mono font-semibold">
            {getWeekBalanceCopy(day.balanceMinutes)}
          </dd>
        </div>
      </dl>

      <div className="mt-4 space-y-2">
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>{day.assignedBlockCount} bloques asignados</span>
          <span>{day.punchCount} fichajes</span>
        </div>
        {visibleDayPunches.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-muted/20 p-3 text-sm text-muted-foreground">
            Sin entradas o salidas visibles.
          </p>
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

      <div className="mt-auto pt-4">
        {correctionHref && canSubmit ? (
          <Button asChild className="w-full" variant="outline">
            <Link href={correctionHref}>
              <FileClock aria-hidden="true" />
              {correctionApprovalRequired ? "Solicitar ajuste" : "Corregir día"}
            </Link>
          </Button>
        ) : correctionHref ? (
          <Button className="w-full" disabled variant="outline">
            <FileClock aria-hidden="true" />
            Sin permiso de corrección
          </Button>
        ) : (
          <p className="rounded-lg border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
            Aún no hay registro de jornada para corregir este día. Crear una
            corrección histórica desde cero queda pendiente de una RPC segura.
          </p>
        )}
      </div>
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
  return (
    <section className="space-y-3">
      <SectionHeader
        action={
          <TimeWeekNavigation
            currentWeekStart={currentWeekStart}
            organizationId={organizationId}
            weekStart={weekStart}
          />
        }
        description={
          overview
            ? formatWeekRange(overview.weekStart, overview.weekEnd)
            : "No se ha podido cargar la semana seleccionada."
        }
        title="Semana de fichaje"
      />

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

          {overview.totals.warningCount > 0 ? (
            <Alert>
              <AlertTriangle aria-hidden="true" />
              <AlertTitle>Avisos de la semana</AlertTitle>
              <AlertDescription>
                Estos avisos comparan fichajes activos con bloques asignados.
                Sirven para corregir o solicitar revisión si tu organización lo exige;
                no aprueban horas extra ni cierran nómina.
              </AlertDescription>
            </Alert>
          ) : (
            <Alert>
              <CheckCircle2 aria-hidden="true" />
              <AlertTitle>Semana sin avisos operativos</AlertTitle>
              <AlertDescription>
                Las horas fichadas cuadran con las asignaciones visibles de la
                semana dentro del margen operativo.
              </AlertDescription>
            </Alert>
          )}

          <Card>
            <CardContent className="p-0">
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
            </CardContent>
          </Card>
        </>
      ) : null}
    </section>
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
              Este registro no tiene entradas o salidas visibles.
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
          <div className="space-y-2 border-t border-border pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">Historial de cambios</p>
              <Badge variant="outline">
                {CHANGE_HISTORY_RETENTION_DAYS} días visibles
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Fichajes sustituidos o anulados por corrección. Salen de la vista
              principal y solo aparecen aquí durante 30 días.
            </p>
            <div className="grid gap-2">
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
          </div>
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
      <EmptyState
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
    <section className="space-y-3">
      <SectionHeader
        action={<Badge variant="outline">CSV interno</Badge>}
        description="Descarga un rango de fichajes para revision humana. No es payroll ni cumplimiento legal definitivo."
        title="Exporte interno revisable"
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download aria-hidden="true" className="size-4" />
            Generar CSV
          </CardTitle>
          <CardDescription>
            El archivo incluye estado del registro, entradas/salidas activas,
            minutos trabajados calculados por pares seguros y estado de cierre
            semanal. No incluye snapshots ni texto libre de correcciones.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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

            <Button type="submit">
              <Download aria-hidden="true" />
              Descargar CSV
            </Button>
          </form>

          <p className="text-sm leading-6 text-muted-foreground">
            Cada descarga queda registrada en los metadatos de exportes de la
            organización. El contenido es revisable y operativo; cualquier uso
            laboral formal requiere validacion externa.
          </p>
        </CardContent>
      </Card>
    </section>
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

  return (
    <section className="space-y-3">
      <SectionHeader
        action={
          <Badge variant={canReview ? "secondary" : "outline"}>
            {canReview
              ? `${approvedCount} aprobadas / ${pendingCount} pendientes`
              : "Sin permiso"}
          </Badge>
        }
        description={
          correctionApprovalRequired
            ? "Propietario, Administrador y Responsable pueden aprobar, rechazar y aplicar correcciones dentro de la organización activa."
            : "La aprobación de nuevas correcciones está desactivada; esta cola conserva solicitudes existentes o heredadas."
        }
        title="Revisión de correcciones"
      />

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
        <div className="grid gap-5">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-semibold tracking-tight">
                Aprobadas para aplicar
              </h3>
              <Badge variant="outline">{approvedCount} listas</Badge>
            </div>

            {approvedCount === 0 ? (
              <EmptyState
                description="Las correcciones ya aplicadas no vuelven a mostrarse aquí. Las pendientes deben aprobarse primero."
                title="Sin correcciones aprobadas para aplicar"
              />
            ) : (
              <div className="grid gap-3">
                <Alert>
                  <ClipboardCheck aria-hidden="true" />
                  <AlertTitle>Aplicación trazada</AlertTitle>
                  <AlertDescription>
                    Aplicar una corrección aprobada puede crear un fichaje de
                    origen corrección, sustituir el original o anularlo. No es
                    payroll ni cierre legal definitivo.
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
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-semibold tracking-tight">
                Solicitudes pendientes
              </h3>
              <Badge variant="outline">{pendingCount} pendientes</Badge>
            </div>

            {pendingCount === 0 ? (
              <EmptyState
                description="Cuando alguien solicite una corrección pendiente, aparecerá aquí para revisarla con trazabilidad."
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
          </div>
        </div>
      ) : null}
    </section>
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
            <Badge variant="outline">Rol {roleLabel}</Badge>
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
              <AlertTitle>Fichaje manual auditable</AlertTitle>
              <AlertDescription>
                Registra entradas y salidas propias sin geolocalización. Este
                corte no calcula payroll ni horas extra, y no garantiza
                cumplimiento legal definitivo sin revisión laboral.
              </AlertDescription>
            </Alert>

            <Alert>
              <FileClock aria-hidden="true" />
              <AlertTitle>
                {timeTrackingSettings.correctionApprovalRequired
                  ? "Correcciones con aprobación"
                  : "Correcciones directas"}
              </AlertTitle>
              <AlertDescription>
                {timeTrackingSettings.correctionApprovalRequired
                  ? "Las correcciones propias quedan como solicitud pendiente hasta revisión administrativa."
                  : "Las correcciones propias se aplican al enviar mediante un flujo trazado; no son payroll ni cierre legal definitivo."}
              </AlertDescription>
            </Alert>
          </div>
        </details>
      </PageHeader>

      {status && successMessages[status] ? (
        <Alert>
          <CheckCircle2 aria-hidden="true" />
          <AlertTitle>{successMessages[status]}</AlertTitle>
          <AlertDescription>
            La semana seleccionada ya muestra la informacion disponible.
          </AlertDescription>
        </Alert>
      ) : null}

      {error && errorMessages[error] ? (
        <Alert variant="destructive">
          <AlertTriangle aria-hidden="true" />
          <AlertTitle>No se ha completado la acción</AlertTitle>
          <AlertDescription>{errorMessages[error]}</AlertDescription>
        </Alert>
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

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.78fr)_minmax(0,1.22fr)]">
        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Limites seguros</CardTitle>
              <CardDescription>
                Fichaje propio, manual y sin datos de ubicacion.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <ShieldCheck aria-hidden="true" className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium">Solo tu fichaje</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Esta pantalla no permite elegir otra persona ni fichar en
                    nombre de alguien más.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                  <MapPin aria-hidden="true" className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium">Contexto opcional</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Puedes dejar el fichaje sin centro, bloque ni asignacion si
                    no hay contexto seguro que vincular.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

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
      </div>

      <section className="space-y-3">
        <SectionHeader
          action={<Badge variant="outline">{records.length} de la semana</Badge>}
          description="Registros de jornada propios y entradas/salidas de la semana seleccionada."
          title="Registros de la semana"
        />

        {records.length === 0 ? (
          <EmptyState
            description="Cuando exista una entrada o salida en esta semana, BoxOps mostrara aquí su registro de jornada."
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
      </section>

      <section className="space-y-3">
        <SectionHeader
          description="Vista propia de solicitudes y cierres cuando existan."
          title="Correcciones y aprobaciones"
        />
        <CorrectionsAndApprovals
          approvals={approvals}
          corrections={corrections}
          timezone={resolution.organization.timezone}
        />
      </section>
    </div>
  );
}
