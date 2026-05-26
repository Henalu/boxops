import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  CalendarOff,
  Clock3,
  ListFilter,
  ShieldCheck,
} from "lucide-react";

import {
  AbsenceActionSubmitButton,
  AbsenceCreationSubmitButton,
} from "./absence-submit-button";
import {
  approveAbsenceRequestFromForm,
  cancelOwnAbsenceRequestFromForm,
  createOwnAbsenceRequestFromForm,
  expireAbsenceRequestFromForm,
  rejectAbsenceRequestFromForm,
} from "./actions";
import { OrganizationResolutionState } from "@/components/features/organization-resolution-state";
import {
  EmptyState,
  PageHeader,
  SectionHeader,
  StatCard,
  StatusBadge,
} from "@/components/features/operations-ui";
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
import { Textarea } from "@/components/ui/textarea";
import {
  ABSENCE_REQUEST_TYPES,
  ABSENCE_REQUEST_STATUSES,
  type AbsenceRequestErrorCode,
  type AbsenceRequestListItem,
  type AbsenceRequestPeriodRow,
  type AbsenceRequestStatus,
  type AbsenceRequestType,
  type AbsenceScheduleImpactRow,
  listAbsenceReviewQueue,
  listAbsenceScheduleImpacts,
  listOwnAbsenceRequests,
} from "@/lib/absence-requests";
import {
  canManageAbsenceRequests,
  canUseAbsenceSelfService,
  getApplicationRoleLabel,
} from "@/lib/auth/permissions";
import { getLoginPath } from "@/lib/auth/redirects";
import {
  getActiveMemberships,
  getAuthenticatedUser,
  resolveActiveOrganization,
} from "@/lib/auth/tenant";
import { getAbsencesPath } from "@/lib/navigation/app-paths";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type AbsencesPageProps = {
  searchParams: Promise<{
    absence_status?: string | string[];
    absence_type?: string | string[];
    error?: string | string[];
    organizationId?: string | string[];
    status?: string | string[];
    view?: string | string[];
  }>;
};

type PersonDisplayRow = {
  display_name: string;
  id: string;
};

type AbsenceDisplayData = {
  personProfilesById: Map<string, PersonDisplayRow>;
};

type AbsenceImpactState = {
  failedRequestIds: Set<string>;
  impactsByRequestId: Map<string, AbsenceScheduleImpactRow[]>;
};
type AbsenceViewFilter = "all" | "own" | "review";
type AbsenceFilters = {
  errors: string[];
  type: AbsenceRequestType | null;
  status: AbsenceRequestStatus | null;
  view: AbsenceViewFilter;
};

const REVIEWABLE_STATUSES = new Set<AbsenceRequestStatus>([
  "requested",
  "pending_review",
]);
const CLOSED_STATUSES = new Set<AbsenceRequestStatus>([
  "approved",
  "cancelled",
  "expired",
  "rejected",
]);
const ABSENCE_VIEW_FILTERS: AbsenceViewFilter[] = ["all", "own", "review"];
const SUMMARY_DISPLAY_LIMIT = 160;
const SENSITIVE_SUMMARY_PATTERN =
  /\b(salud|diagnostic[a-z]*|medic[a-z]*|baja medica|justificante[a-z]*|document[a-z]*|familia[a-z]*|sancion[a-z]*|sanciones|salario[a-z]*|payroll|ubicacion|geolocalizacion|token[a-z]*|fingerprint|ip)\b/;
const URL_SUMMARY_PATTERN = /\b(https?:\/\/|www\.)\S+/i;
const IPV4_SUMMARY_PATTERN = /\b(?:\d{1,3}\.){3}\d{1,3}\b/;

const statusMessages: Record<string, string> = {
  "absence-approved": "Solicitud aprobada.",
  "absence-cancelled": "Solicitud cancelada.",
  "absence-created-approved": "Solicitud creada y aprobada.",
  "absence-created-cancelled": "Solicitud creada, pero ya figura cancelada.",
  "absence-created-expired": "Solicitud creada, pero ya figura expirada.",
  "absence-created-pending_review": "Solicitud creada y enviada a revision.",
  "absence-created-rejected": "Solicitud creada, pero ya figura rechazada.",
  "absence-created-requested": "Solicitud creada.",
  "absence-expired": "Solicitud cerrada como vencida.",
  "absence-rejected": "Solicitud rechazada.",
};

const errorMessages: Record<AbsenceRequestErrorCode | string, string> = {
  "authentication-required": "Inicia sesion para revisar ausencias.",
  "date-range-invalid": "El periodo recibido no es valido.",
  forbidden: "Tu rol o perfil no permite esa accion.",
  "invalid-absence-request": "La solicitud recibida no es valida.",
  "invalid-absence-type": "El tipo de ausencia no esta habilitado.",
  "invalid-decision": "La decision recibida no es valida.",
  "invalid-input": "Los datos recibidos no son validos.",
  "invalid-limit": "El limite de listado no es valido.",
  "invalid-organization": "La organizacion recibida no es valida.",
  "invalid-period": "El periodo de ausencia no es valido.",
  "invalid-reason-summary":
    "El resumen debe ser corto y no puede incluir datos sensibles.",
  "invalid-status": "El estado recibido no esta habilitado.",
  "invalid-timezone": "La zona horaria no es valida.",
  "invalid-timestamp": "La fecha recibida no es valida.",
  "load-failed": "No se han podido cargar los datos necesarios.",
  "no-active-memberships": "No hay accesos activos para este usuario.",
  "not-actionable": "La solicitud no admite esa accion ahora.",
  "not-found": "La solicitud ya no esta disponible.",
  "organization-not-found": "La organizacion solicitada no esta disponible.",
  "organization-required": "Elige una organizacion antes de revisar ausencias.",
  "permission-denied": "La base de datos ha denegado la operacion.",
  "profile-missing":
    "Tu cuenta no tiene persona operativa vinculada en esta organizacion.",
  "save-failed": "No se han podido guardar los cambios.",
  "sensitive-summary":
    "El resumen operativo debe evitar salud, diagnosticos, justificantes, familia, sanciones, salario/payroll, ubicacion, URLs, tokens e identificadores.",
};

const absenceStatusLabels: Record<AbsenceRequestStatus, string> = {
  approved: "Aprobada",
  cancelled: "Cancelada",
  expired: "Expirada",
  pending_review: "En revision",
  rejected: "Rechazada",
  requested: "Solicitada",
};

const absenceTypeLabels: Record<string, string> = {
  day_off: "Dia libre",
  partial_day: "Tramo horario",
  permission: "Permiso",
  personal_absence: "Ausencia personal",
  unavailable: "No disponibilidad",
  vacation: "Vacaciones",
};

const viewFilterLabels: Record<AbsenceViewFilter, string> = {
  all: "Todas",
  own: "Propias",
  review: "Revision",
};

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function getValidatedFilters({
  canManage,
  rawStatus,
  rawType,
  rawView,
}: {
  canManage: boolean;
  rawStatus: string | undefined;
  rawType: string | undefined;
  rawView: string | undefined;
}): AbsenceFilters {
  const errors: string[] = [];
  let type: AbsenceRequestType | null = null;
  let status: AbsenceRequestStatus | null = null;
  let view: AbsenceViewFilter = "all";

  if (rawType) {
    if (ABSENCE_REQUEST_TYPES.includes(rawType as AbsenceRequestType)) {
      type = rawType as AbsenceRequestType;
    } else {
      errors.push("Tipo de ausencia ignorado: no esta habilitado.");
    }
  }

  if (rawStatus) {
    if (
      Object.prototype.hasOwnProperty.call(absenceStatusLabels, rawStatus)
    ) {
      status = rawStatus as AbsenceRequestStatus;
    } else {
      errors.push("Estado ignorado: no esta habilitado.");
    }
  }

  if (rawView) {
    if (ABSENCE_VIEW_FILTERS.includes(rawView as AbsenceViewFilter)) {
      view = rawView as AbsenceViewFilter;
    } else {
      errors.push("Vista ignorada: usa propias, revision o todas.");
    }
  }

  if (!canManage && view === "review") {
    view = "all";
    errors.push("Revision operativa ignorada: tu rol no puede ver esa cola.");
  }

  return {
    errors,
    status,
    type,
    view,
  };
}

function shortId(value: string) {
  return value.slice(0, 8);
}

function formatDateTime(value: string | null, timeZone: string) {
  if (!value) {
    return "Sin fecha";
  }

  try {
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      month: "short",
      timeZone,
      weekday: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function isPastTimestamp(value: string | null, now: Date) {
  if (!value) {
    return false;
  }

  const timestamp = new Date(value).getTime();

  return Number.isFinite(timestamp) && timestamp <= now.getTime();
}

function getPersonLabel(
  personProfileId: string,
  displayData: AbsenceDisplayData,
) {
  return (
    displayData.personProfilesById.get(personProfileId)?.display_name ??
    `Persona ${shortId(personProfileId)}`
  );
}

async function getDisplayData({
  items,
  organizationId,
}: {
  items: AbsenceRequestListItem[];
  organizationId: string;
}): Promise<AbsenceDisplayData> {
  const personProfileIds = [
    ...new Set(
      items.flatMap((item) => [
        item.request.requested_by_person_profile_id,
        item.request.subject_person_profile_id,
        ...(item.request.reviewed_by_person_profile_id
          ? [item.request.reviewed_by_person_profile_id]
          : []),
      ]),
    ),
  ];

  if (personProfileIds.length === 0) {
    return {
      personProfilesById: new Map(),
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("person_profiles")
    .select("id, display_name")
    .eq("organization_id", organizationId)
    .in("id", personProfileIds);

  if (error) {
    return {
      personProfilesById: new Map(),
    };
  }

  return {
    personProfilesById: new Map(
      ((data ?? []) as PersonDisplayRow[]).map((person) => [person.id, person]),
    ),
  };
}

async function getImpactState({
  items,
  organizationId,
}: {
  items: AbsenceRequestListItem[];
  organizationId: string;
}): Promise<AbsenceImpactState> {
  const requestIds = [...new Set(items.map((item) => item.request.id))];
  const results = await Promise.all(
    requestIds.map(async (absenceRequestId) => ({
      absenceRequestId,
      result: await listAbsenceScheduleImpacts({
        absenceRequestId,
        organizationId,
      }),
    })),
  );
  const failedRequestIds = new Set<string>();
  const impactsByRequestId = new Map<string, AbsenceScheduleImpactRow[]>();

  for (const { absenceRequestId, result } of results) {
    if (!result.ok) {
      failedRequestIds.add(absenceRequestId);
      impactsByRequestId.set(absenceRequestId, []);
      continue;
    }

    impactsByRequestId.set(absenceRequestId, result.data);
  }

  return {
    failedRequestIds,
    impactsByRequestId,
  };
}

function getStatusTone(status: AbsenceRequestStatus) {
  if (status === "approved") {
    return "success" as const;
  }

  if (status === "requested" || status === "pending_review") {
    return "pending" as const;
  }

  if (status === "rejected") {
    return "critical" as const;
  }

  return "neutral" as const;
}

function allPeriodsEnded(periods: AbsenceRequestPeriodRow[], now: Date) {
  return (
    periods.length > 0 &&
    periods.every((period) => isPastTimestamp(period.ends_at, now))
  );
}

function isManuallyExpirable(item: AbsenceRequestListItem, now: Date) {
  return (
    REVIEWABLE_STATUSES.has(item.request.status) &&
    (isPastTimestamp(item.request.expires_at, now) ||
      allPeriodsEnded(item.periods, now))
  );
}

function canReviewNow(item: AbsenceRequestListItem, now: Date) {
  return (
    REVIEWABLE_STATUSES.has(item.request.status) &&
    !isManuallyExpirable(item, now)
  );
}

function getManualExpiryReason(item: AbsenceRequestListItem, now: Date) {
  if (!REVIEWABLE_STATUSES.has(item.request.status)) {
    return null;
  }

  if (isPastTimestamp(item.request.expires_at, now)) {
    return "La solicitud ya vencio.";
  }

  if (allPeriodsEnded(item.periods, now)) {
    return "Todos sus periodos ya terminaron.";
  }

  return null;
}

function getNonActionableMessages({
  canManage,
  item,
  mode,
  now,
}: {
  canManage: boolean;
  item: AbsenceRequestListItem;
  mode: "own" | "queue";
  now: Date;
}) {
  const messages: string[] = [];
  const statusLabel =
    absenceStatusLabels[item.request.status] ?? item.request.status;
  const expiryReason = getManualExpiryReason(item, now);

  if (mode === "own") {
    if (item.request.status === "approved") {
      messages.push(
        "Ya esta aprobada; la solicitud propia no puede cancelarse desde esta accion.",
      );
    } else if (CLOSED_STATUSES.has(item.request.status)) {
      messages.push(`No puede cancelarse porque ya esta ${statusLabel}.`);
    } else if (expiryReason) {
      messages.push(
        `No se muestra cancelar porque ya no es una solicitud activa: ${expiryReason}`,
      );
    }
  }

  if (mode === "queue") {
    if (!canManage) {
      messages.push(
        "Aprobar o rechazar queda reservado a Propietario, Administrador y Responsable.",
      );
    } else if (expiryReason) {
      messages.push(
        `No puede aprobarse ni rechazarse ahora: ${expiryReason} Usa cerrar vencida si corresponde.`,
      );
    } else if (CLOSED_STATUSES.has(item.request.status)) {
      messages.push(
        `No puede aprobarse ni rechazarse porque ya esta ${statusLabel}.`,
      );
    }
  }

  if (!expiryReason) {
    if (REVIEWABLE_STATUSES.has(item.request.status)) {
      messages.push(
        "No puede cerrarse como vencida: aun no ha vencido y tiene periodos pendientes.",
      );
    } else {
      messages.push(
        `No puede cerrarse como vencida porque el estado actual es ${statusLabel}.`,
      );
    }
  }

  return messages;
}

function getImpactSummary({
  failed,
  impacts,
}: {
  failed: boolean;
  impacts: AbsenceScheduleImpactRow[];
}) {
  if (failed) {
    return {
      description: "No se pudo recalcular el impacto ahora.",
      label: "Impacto no disponible",
      tone: "warning" as const,
    };
  }

  const coverageNeeded = impacts.filter(
    (impact) => impact.impact_status === "coverage_needed",
  ).length;
  const potential = impacts.filter(
    (impact) => impact.impact_status === "potential",
  ).length;

  if (coverageNeeded > 0) {
    return {
      description:
        "La ausencia aprobada solapa bloques asignados. Resolver cobertura queda fuera de esta pantalla.",
      label: `${coverageNeeded} bloque${coverageNeeded === 1 ? "" : "s"} a cubrir`,
      tone: "warning" as const,
    };
  }

  if (potential > 0) {
    return {
      description:
        "La solicitud aun no cambia el horario, pero puede afectar bloques asignados.",
      label: `${potential} impacto${potential === 1 ? "" : "s"} potencial${potential === 1 ? "" : "es"}`,
      tone: "pending" as const,
    };
  }

  return {
    description:
      "No hay bloques asignados afectados por los periodos visibles ahora.",
    label: "Sin impacto calculado",
    tone: "neutral" as const,
  };
}

function normalizeSensitiveScanValue(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function hasSensitiveSummarySignal(value: string) {
  if (!value) {
    return false;
  }

  const normalizedValue = normalizeSensitiveScanValue(value);

  return (
    SENSITIVE_SUMMARY_PATTERN.test(normalizedValue) ||
    URL_SUMMARY_PATTERN.test(value) ||
    IPV4_SUMMARY_PATTERN.test(value)
  );
}

function getSafeReasonSummary(value: string | null) {
  const trimmedValue = value?.trim() ?? "";

  if (!trimmedValue) {
    return null;
  }

  if (hasSensitiveSummarySignal(trimmedValue)) {
    return "Resumen oculto por minimizacion de datos personales.";
  }

  if (trimmedValue.length > SUMMARY_DISPLAY_LIMIT) {
    return `${trimmedValue.slice(0, SUMMARY_DISPLAY_LIMIT - 3)}...`;
  }

  return trimmedValue;
}

function HiddenActionInputs({
  absenceRequestId,
  organizationId,
}: {
  absenceRequestId: string;
  organizationId: string;
}) {
  return (
    <>
      <input name="organizationId" type="hidden" value={organizationId} />
      <input name="absenceRequestId" type="hidden" value={absenceRequestId} />
    </>
  );
}

function ActionGuidance({ messages }: { messages: string[] }) {
  if (messages.length === 0) {
    return null;
  }

  return (
    <div className="rounded-lg border border-border bg-muted/35 px-3 py-2 text-sm text-muted-foreground">
      <p className="font-medium text-foreground">Estado de acciones</p>
      <ul className="mt-1 list-disc space-y-1 pl-4">
        {messages.map((message) => (
          <li key={message}>{message}</li>
        ))}
      </ul>
    </div>
  );
}

function AbsenceCreationForm({
  action,
  formError,
  organizationId,
  timeZone,
}: {
  action: (formData: FormData) => void | Promise<void>;
  formError?: string | null;
  organizationId: string;
  timeZone: string;
}) {
  return (
    <section className="space-y-3">
      <SectionHeader
        description="Solicita vacaciones, permisos u otras ausencias para ti."
        title="Nueva solicitud"
      />

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle>Solicitud propia</CardTitle>
              <CardDescription>
                Al enviarla, quedara pendiente de revision del equipo
                responsable. Si afecta al horario, la cobertura se gestiona
                aparte.
              </CardDescription>
            </div>
            <Badge variant="outline">Propia</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <form action={action} className="space-y-5">
            <input name="organizationId" type="hidden" value={organizationId} />

            {formError ? (
              <Alert variant="destructive">
                <AlertTriangle aria-hidden="true" className="size-4" />
                <AlertTitle>Revisa la solicitud antes de enviarla</AlertTitle>
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            ) : null}

            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
              <div className="space-y-2">
                <Label htmlFor="absenceType">Tipo</Label>
                <select
                  className="flex min-h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  defaultValue="vacation"
                  id="absenceType"
                  name="absenceType"
                  required
                >
                  {ABSENCE_REQUEST_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {absenceTypeLabels[type] ?? type}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="absenceTimezone">Zona horaria</Label>
                <Input id="absenceTimezone" readOnly value={timeZone} />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_180px]">
              <div className="space-y-2">
                <Label htmlFor="absenceStartsAt">Inicio</Label>
                <Input
                  id="absenceStartsAt"
                  name="startsAt"
                  required
                  type="datetime-local"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="absenceEndsAt">Fin</Label>
                <Input
                  id="absenceEndsAt"
                  name="endsAt"
                  required
                  type="datetime-local"
                />
              </div>

              <label className="flex min-h-10 items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm">
                <input
                  className="size-4 rounded border-input"
                  defaultChecked
                  name="allDay"
                  type="checkbox"
                />
                <span>Dia completo</span>
              </label>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reasonSummary">Resumen operativo opcional</Label>
              <Textarea
                id="reasonSummary"
                maxLength={160}
                name="reasonSummary"
                placeholder="Ej. Vacaciones planificadas."
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                Maximo 160 caracteres. No incluyas salud, diagnosticos,
                justificantes, documentos, salario, payroll, ubicacion, URLs,
                tokens ni datos familiares.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <AbsenceCreationSubmitButton />
              <p className="text-sm text-muted-foreground">
                Al crearla volveras a la bandeja con el estado resultante.
              </p>
            </div>
          </form>
        </CardContent>
      </Card>
    </section>
  );
}

function PeriodList({
  periods,
  timeZone,
}: {
  periods: AbsenceRequestPeriodRow[];
  timeZone: string;
}) {
  if (periods.length === 0) {
    return (
      <p className="rounded-lg bg-muted/45 px-3 py-2 text-sm text-muted-foreground">
        Sin periodos visibles para esta solicitud.
      </p>
    );
  }

  return (
    <div className="grid gap-2">
      {periods.map((period) => (
        <div
          className="rounded-lg border border-border px-3 py-2 text-sm"
          key={period.id}
        >
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">
              {period.all_day ? "Dia completo" : "Tramo"}
            </Badge>
            <span className="text-muted-foreground">
              {period.timezone || timeZone}
            </span>
          </div>
          <p className="mt-1 font-medium">
            {formatDateTime(period.starts_at, period.timezone || timeZone)} -{" "}
            {formatDateTime(period.ends_at, period.timezone || timeZone)}
          </p>
        </div>
      ))}
    </div>
  );
}

function AbsenceActions({
  canManage,
  item,
  mode,
  now,
  organizationId,
}: {
  canManage: boolean;
  item: AbsenceRequestListItem;
  mode: "own" | "queue";
  now: Date;
  organizationId: string;
}) {
  const canExpire = isManuallyExpirable(item, now);
  const canCancelOwn =
    mode === "own" && REVIEWABLE_STATUSES.has(item.request.status) && !canExpire;
  const hasReviewActions =
    mode === "queue" && canManage && canReviewNow(item, now);
  const actionMessages = getNonActionableMessages({
    canManage,
    item,
    mode,
    now,
  });

  if (!canCancelOwn && !canExpire && !hasReviewActions) {
    return <ActionGuidance messages={actionMessages} />;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {canCancelOwn ? (
          <form action={cancelOwnAbsenceRequestFromForm}>
            <HiddenActionInputs
              absenceRequestId={item.request.id}
              organizationId={organizationId}
            />
            <AbsenceActionSubmitButton
              confirmMessage="Cancelar esta solicitud propia? La bandeja se recargara con el estado actualizado."
              icon="cancel"
              label="Cancelar"
              pendingLabel="Cancelando..."
              variant="outline"
            />
          </form>
        ) : null}

        {hasReviewActions ? (
          <>
            <form action={approveAbsenceRequestFromForm}>
              <HiddenActionInputs
                absenceRequestId={item.request.id}
                organizationId={organizationId}
              />
              <AbsenceActionSubmitButton
                confirmMessage="Aprobar esta ausencia como decision operativa? No cambiara horario ni asignaciones."
                icon="approve"
                label="Aprobar"
                pendingLabel="Aprobando..."
              />
            </form>
            <form action={rejectAbsenceRequestFromForm}>
              <HiddenActionInputs
                absenceRequestId={item.request.id}
                organizationId={organizationId}
              />
              <AbsenceActionSubmitButton
                confirmMessage="Rechazar esta solicitud? La decision quedara como evento operativo minimizado."
                icon="reject"
                label="Rechazar"
                pendingLabel="Rechazando..."
                variant="outline"
              />
            </form>
          </>
        ) : null}

        {canExpire ? (
          <form action={expireAbsenceRequestFromForm}>
            <HiddenActionInputs
              absenceRequestId={item.request.id}
              organizationId={organizationId}
            />
            <AbsenceActionSubmitButton
              confirmMessage="Cerrar esta solicitud como vencida? No resuelve cobertura ni cambia horario."
              icon="expire"
              label="Cerrar vencida"
              pendingLabel="Cerrando..."
              variant="outline"
            />
          </form>
        ) : null}
      </div>
      <ActionGuidance messages={actionMessages} />
    </div>
  );
}

function AbsenceCard({
  canManage,
  displayData,
  impactState,
  item,
  mode,
  now,
  organizationId,
  timeZone,
}: {
  canManage: boolean;
  displayData: AbsenceDisplayData;
  impactState: AbsenceImpactState;
  item: AbsenceRequestListItem;
  mode: "own" | "queue";
  now: Date;
  organizationId: string;
  timeZone: string;
}) {
  const subject = getPersonLabel(
    item.request.subject_person_profile_id,
    displayData,
  );
  const requester = getPersonLabel(
    item.request.requested_by_person_profile_id,
    displayData,
  );
  const impacts = impactState.impactsByRequestId.get(item.request.id) ?? [];
  const impactSummary = getImpactSummary({
    failed: impactState.failedRequestIds.has(item.request.id),
    impacts,
  });
  const lastEvent = item.events.at(-1);
  const reasonSummary = getSafeReasonSummary(item.request.reason_summary);

  return (
    <Card size="sm">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={getStatusTone(item.request.status)}>
                {absenceStatusLabels[item.request.status]}
              </StatusBadge>
              <Badge variant="outline">
                {absenceTypeLabels[item.request.absence_type] ??
                  item.request.absence_type}
              </Badge>
              {mode === "own" ? (
                <Badge variant="secondary">Propia</Badge>
              ) : null}
            </div>
            <CardTitle className="truncate text-base">
              {mode === "queue" ? subject : "Solicitud propia"}
            </CardTitle>
            <CardDescription>
              Pedida por {requester} /{" "}
              {formatDateTime(item.request.requested_at, timeZone)}
            </CardDescription>
          </div>
          <StatusBadge tone={impactSummary.tone}>
            {impactSummary.label}
          </StatusBadge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div className="min-w-0">
            <dt className="text-muted-foreground">Revision</dt>
            <dd className="truncate font-medium">
              {item.request.review_required ? "Requiere revision" : "Directa"}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted-foreground">Resuelta</dt>
            <dd className="truncate font-medium">
              {formatDateTime(item.request.resolved_at, timeZone)}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted-foreground">Vence</dt>
            <dd className="truncate font-medium">
              {formatDateTime(item.request.expires_at, timeZone)}
            </dd>
          </div>
        </dl>

        <div className="space-y-2">
          <p className="text-xs font-medium uppercase text-muted-foreground">
            Periodos
          </p>
          <PeriodList periods={item.periods} timeZone={timeZone} />
        </div>

        {reasonSummary ? (
          <p className="rounded-lg bg-muted/45 px-3 py-2 text-sm text-muted-foreground">
            {reasonSummary}
          </p>
        ) : null}

        <div className="rounded-lg border border-border px-3 py-2 text-sm">
          <p className="font-medium">{impactSummary.description}</p>
          <p className="mt-1 text-muted-foreground">
            Impacto calculado al vuelo; no modifica horario ni asignaciones.
          </p>
        </div>

        {lastEvent ? (
          <p className="text-xs text-muted-foreground">
            Ultimo evento: {lastEvent.event_type} /{" "}
            {formatDateTime(lastEvent.created_at, timeZone)}
          </p>
        ) : null}

        <AbsenceActions
          canManage={canManage}
          item={item}
          mode={mode}
          now={now}
          organizationId={organizationId}
        />
      </CardContent>
    </Card>
  );
}

function AbsenceFiltersPanel({
  canManage,
  filters,
  organizationId,
}: {
  canManage: boolean;
  filters: AbsenceFilters;
  organizationId: string;
}) {
  return (
    <Card size="sm">
      <CardContent>
        <form
          className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end"
          method="get"
        >
          <input name="organizationId" type="hidden" value={organizationId} />

          <div className="space-y-2">
            <Label htmlFor="absenceViewFilter">Vista</Label>
            <select
              className="flex min-h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              defaultValue={filters.view}
              id="absenceViewFilter"
              name="view"
            >
              {ABSENCE_VIEW_FILTERS.map((view) => (
                <option
                  disabled={view === "review" && !canManage}
                  key={view}
                  value={view}
                >
                  {viewFilterLabels[view]}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="absenceTypeFilter">Tipo</Label>
            <select
              className="flex min-h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              defaultValue={filters.type ?? ""}
              id="absenceTypeFilter"
              name="absence_type"
            >
              <option value="">Todos los tipos</option>
              {ABSENCE_REQUEST_TYPES.map((type) => (
                <option key={type} value={type}>
                  {absenceTypeLabels[type] ?? type}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="absenceStatusFilter">Estado</Label>
            <select
              className="flex min-h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              defaultValue={filters.status ?? ""}
              id="absenceStatusFilter"
              name="absence_status"
            >
              <option value="">Todos los estados</option>
              {ABSENCE_REQUEST_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {absenceStatusLabels[status]}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="outline">
              <ListFilter aria-hidden="true" />
              Filtrar
            </Button>
            <Button asChild variant="ghost">
              <Link href={getAbsencesPath({ organizationId })}>Limpiar</Link>
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function AbsencesSummary({
  canManage,
  impactState,
  ownCount,
  queueCount,
}: {
  canManage: boolean;
  impactState: AbsenceImpactState;
  ownCount: number;
  queueCount: number;
}) {
  const impacts = [...impactState.impactsByRequestId.values()].flat();
  const potentialCount = impacts.filter(
    (impact) => impact.impact_status === "potential",
  ).length;
  const coverageNeededCount = impacts.filter(
    (impact) => impact.impact_status === "coverage_needed",
  ).length;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard icon={CalendarOff} label="Propias" value={ownCount} />
      <StatCard
        description="Solo Propietario, Administrador y Responsable."
        icon={ShieldCheck}
        label="Revision"
        tone={queueCount > 0 ? "warning" : "neutral"}
        value={canManage ? queueCount : "-"}
      />
      <StatCard
        icon={Clock3}
        label="Potencial"
        tone={potentialCount > 0 ? "pending" : "neutral"}
        value={potentialCount}
      />
      <StatCard
        icon={AlertTriangle}
        label="A cubrir"
        tone={coverageNeededCount > 0 ? "warning" : "neutral"}
        value={coverageNeededCount}
      />
    </div>
  );
}

function SectionError({ error }: { error: string }) {
  return (
    <Alert variant="destructive">
      <AlertTriangle aria-hidden="true" className="size-4" />
      <AlertTitle>No se ha podido cargar esta seccion</AlertTitle>
      <AlertDescription>
        {errorMessages[error] ??
          "Revisa sesion, organizacion activa y permisos."}
      </AlertDescription>
    </Alert>
  );
}

export default async function AbsencesPage({
  searchParams,
}: AbsencesPageProps) {
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect(getLoginPath("/app/absences"));
  }

  const params = await searchParams;
  const organizationId = getParam(params.organizationId);
  const rawAbsenceStatus = getParam(params.absence_status);
  const rawAbsenceType = getParam(params.absence_type);
  const rawView = getParam(params.view);
  const status = getParam(params.status);
  const error = getParam(params.error);
  const memberships = await getActiveMemberships(user.id);
  const resolution = resolveActiveOrganization(memberships, organizationId);

  if (!resolution.ok) {
    return (
      <div className="space-y-6">
        <PageHeader title="Ausencias" />
        <OrganizationResolutionState
          basePath="/app/absences"
          resolution={resolution}
        />
      </div>
    );
  }

  const roleLabel = getApplicationRoleLabel(resolution.membership.role);
  const canUseSelfService = canUseAbsenceSelfService(
    resolution.membership.role,
  );
  const canManage = canManageAbsenceRequests(resolution.membership.role);
  const filters = getValidatedFilters({
    canManage,
    rawStatus: rawAbsenceStatus,
    rawType: rawAbsenceType,
    rawView,
  });
  const [ownResult, queueResult] = await Promise.all([
    canUseSelfService
      ? listOwnAbsenceRequests({
          absenceType: filters.type,
          includeEvents: true,
          limit: 50,
          organizationId: resolution.organization.id,
          statuses: filters.status ? [filters.status] : null,
        })
      : Promise.resolve(null),
    canManage
      ? listAbsenceReviewQueue({
          absenceType: filters.type,
          includeEvents: true,
          limit: 50,
          organizationId: resolution.organization.id,
          statuses: filters.status ? [filters.status] : null,
        })
      : Promise.resolve(null),
  ]);
  const ownItems = ownResult?.ok ? ownResult.data : [];
  const queueItems = queueResult?.ok ? queueResult.data : [];
  const visibleOwnItems = filters.view === "review" ? [] : ownItems;
  const visibleQueueItems = filters.view === "own" ? [] : queueItems;
  const canCreateOwnAbsence = canUseSelfService && ownResult?.ok === true;
  const creationFormError =
    error &&
    [
      "date-range-invalid",
      "invalid-absence-type",
      "invalid-period",
      "invalid-reason-summary",
      "invalid-timezone",
      "invalid-timestamp",
      "profile-missing",
    ].includes(error)
      ? (errorMessages[error] ?? null)
      : null;
  const visibleItems = [
    ...visibleOwnItems,
    ...visibleQueueItems.filter(
      (queueItem) =>
        !visibleOwnItems.some(
          (ownItem) => ownItem.request.id === queueItem.request.id,
        ),
    ),
  ];
  const [displayData, impactState] = await Promise.all([
    getDisplayData({
      items: visibleItems,
      organizationId: resolution.organization.id,
    }),
    getImpactState({
      items: visibleItems,
      organizationId: resolution.organization.id,
    }),
  ]);
  const now = new Date();

  return (
    <div className="space-y-6">
      <PageHeader
        badge="Ausencias"
        meta={
          <>
            <Badge variant="outline">{resolution.organization.name}</Badge>
            <Badge variant="outline">{roleLabel}</Badge>
          </>
        }
        title="Ausencias"
      >
        <details className="group max-w-3xl">
          <summary className="cursor-pointer list-none text-sm leading-6 text-muted-foreground outline-none focus-visible:rounded-md focus-visible:ring-3 focus-visible:ring-ring/50 md:text-base [&::-webkit-details-marker]:hidden">
            <span>
              Solicita vacaciones, permisos o no disponibilidad y consulta su
              estado.
            </span>{" "}
            <span className="inline-flex font-medium text-foreground underline underline-offset-4 group-open:hidden">
              Mas
            </span>
            <span className="hidden font-medium text-foreground underline underline-offset-4 group-open:inline-flex">
              Menos
            </span>
          </summary>

          <Alert className="mt-3">
            <AlertTitle>Como afecta al horario</AlertTitle>
            <AlertDescription>
              Registrar o aprobar una ausencia no cambia el horario ni las
              asignaciones por si solo. La pantalla muestra posibles impactos
              para revisar cobertura; los saldos legales se gestionan aparte.
            </AlertDescription>
          </Alert>
        </details>
      </PageHeader>

      {status && statusMessages[status] ? (
        <TransientFeedbackBanner
          description="La bandeja ya se ha actualizado."
          title={statusMessages[status]}
          tone="success"
        />
      ) : null}

      {error && errorMessages[error] ? (
        <TransientFeedbackBanner
          description={errorMessages[error]}
          title="No se ha podido completar la accion"
          tone="error"
        />
      ) : null}

      {filters.errors.length > 0 ? (
        <Alert>
          <AlertTriangle aria-hidden="true" className="size-4" />
          <AlertTitle>Filtros ajustados</AlertTitle>
          <AlertDescription>{filters.errors.join(" ")}</AlertDescription>
        </Alert>
      ) : null}

      {!canUseSelfService ? (
        <Alert>
          <AlertTitle>Self-service no habilitado para este rol</AlertTitle>
          <AlertDescription>
            Las solicitudes propias quedan disponibles para Propietario,
            Administrador, Responsable y Entrenador con persona vinculada.
          </AlertDescription>
        </Alert>
      ) : null}

      {canCreateOwnAbsence ? (
        <AbsenceCreationForm
          action={createOwnAbsenceRequestFromForm}
          formError={creationFormError}
          organizationId={resolution.organization.id}
          timeZone={resolution.organization.timezone}
        />
      ) : null}

      <section className="space-y-3">
        <SectionHeader title="Filtros" />
        <AbsenceFiltersPanel
          canManage={canManage}
          filters={filters}
          organizationId={resolution.organization.id}
        />
      </section>

      <AbsencesSummary
        canManage={canManage}
        impactState={impactState}
        ownCount={visibleOwnItems.length}
        queueCount={visibleQueueItems.length}
      />

      <section className="space-y-3">
        <SectionHeader title="Mis solicitudes" />
        {!canUseSelfService ? null : ownResult && !ownResult.ok ? (
          <SectionError error={ownResult.error} />
        ) : filters.view === "review" ? (
          <EmptyState
            description="La vista de revision oculta tus solicitudes propias. Cambia a Todas o Propias para verlas."
            title="Vista de revision activa"
          />
        ) : visibleOwnItems.length === 0 ? (
          <EmptyState
            description="No hay ausencias, vacaciones o permisos visibles con los filtros actuales."
            title="Sin solicitudes propias"
          />
        ) : (
          <div className="grid gap-3">
            {visibleOwnItems.map((item) => (
              <AbsenceCard
                canManage={canManage}
                displayData={displayData}
                impactState={impactState}
                item={item}
                key={item.request.id}
                mode="own"
                now={now}
                organizationId={resolution.organization.id}
                timeZone={resolution.organization.timezone}
              />
            ))}
          </div>
        )}
      </section>

      {canManage ? (
        <section className="space-y-3">
          <SectionHeader
            description="Pendientes operativos para Propietario, Administrador y Responsable."
            title="Revision operativa"
          />
          {queueResult && !queueResult.ok ? (
            <SectionError error={queueResult.error} />
          ) : filters.view === "own" ? (
            <EmptyState
              description="La vista de propias oculta la cola de revision. Cambia a Todas o Revision para verla."
              title="Vista propia activa"
            />
          ) : visibleQueueItems.length === 0 ? (
            <EmptyState
              description="No hay solicitudes de revision operativa con los filtros actuales."
              title="Cola vacia"
            />
          ) : (
            <div className="grid gap-3">
              {visibleQueueItems.map((item) => (
                <AbsenceCard
                  canManage={canManage}
                  displayData={displayData}
                  impactState={impactState}
                  item={item}
                  key={item.request.id}
                  mode="queue"
                  now={now}
                  organizationId={resolution.organization.id}
                  timeZone={resolution.organization.timezone}
                />
              ))}
            </div>
          )}
        </section>
      ) : null}

    </div>
  );
}
