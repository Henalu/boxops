import Link from "next/link";
import { redirect } from "next/navigation";
import type React from "react";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Inbox,
  Info,
  Plus,
  Send,
  ShieldCheck,
  type LucideIcon,
  XCircle,
} from "lucide-react";

import {
  approveChangeRequestFromForm,
  applyApprovedChangeRequestFromForm,
  cancelOwnChangeRequestFromForm,
  createChangeRequestFromForm,
  expireChangeRequestFromForm,
  rejectChangeRequestFromForm,
  respondToChangeRequestTargetFromForm,
} from "./actions";
import { RequestCreationForm } from "./request-creation-form";
import { RequestExpireSubmitButton } from "./request-expire-submit-button";
import { OrganizationResolutionState } from "@/components/features/organization-resolution-state";
import {
  PageHeader,
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
import { getLoginPath } from "@/lib/auth/redirects";
import {
  canManageChangeRequests,
  getApplicationRoleLabel,
} from "@/lib/auth/permissions";
import {
  getActiveMemberships,
  getAuthenticatedUser,
  resolveActiveOrganization,
} from "@/lib/auth/tenant";
import {
  listChangeRequestCreationOptions,
  listVisibleChangeRequests,
  type ChangeRequestListItem,
} from "@/lib/change-requests";
import { getSchedulePath } from "@/lib/navigation/app-paths";
import { formatTimeForInput } from "@/lib/schedule-blocks";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import type { Tables } from "@/types/supabase";

export const dynamic = "force-dynamic";

type RequestsPageProps = {
  searchParams: Promise<{
    assignment_id?: string | string[];
    block_id?: string | string[];
    error?: string | string[];
    organizationId?: string | string[];
    status?: string | string[];
  }>;
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
type CenterRow = Pick<Tables<"centers">, "id" | "name">;
type ClassTypeRow = Pick<Tables<"class_types">, "id" | "name">;
type CoachProfileRow = Pick<
  Tables<"coach_profiles">,
  "id" | "person_profile_id" | "user_id"
>;
type PersonProfileRow = Pick<Tables<"person_profiles">, "display_name" | "id">;

type RequestsDisplayData = {
  blocksById: Map<string, ScheduleBlockRow>;
  centersById: Map<string, CenterRow>;
  classTypesById: Map<string, ClassTypeRow>;
  coachProfilesById: Map<string, CoachProfileRow>;
  ownCoachProfileIds: Set<string>;
  personProfilesById: Map<string, PersonProfileRow>;
};

const CLOSED_REQUEST_STATUSES = new Set([
  "rejected",
  "cancelled",
  "expired",
  "applied",
]);

const statusMessages: Record<string, string> = {
  "request-applied": "Horario actualizado con la solicitud.",
  "request-approved": "Solicitud aprobada. Falta aplicarla al horario.",
  "request-cancelled": "Solicitud cancelada.",
  "request-created": "Solicitud enviada.",
  "request-expired": "Solicitud cerrada porque ya no se puede responder.",
  "request-rejected": "Solicitud rechazada.",
  "target-accepted": "Respuesta enviada: aceptada.",
  "target-rejected": "Respuesta enviada: rechazada.",
};

const errorMessages: Record<string, string> = {
  "authentication-required": "Inicia sesión para revisar solicitudes.",
  "coach-unavailable":
    "Ese entrenador ya tiene un bloque asignado que se solapa con esta franja.",
  "confirmation-required": "Confirma el alcance operativo antes de enviar.",
  expired: "La solicitud o la oferta ya habia vencido.",
  forbidden: "No tienes permiso para hacer eso en esta solicitud.",
  "invalid-change-request": "No hemos encontrado una solicitud valida.",
  "invalid-change-request-target": "No hemos encontrado una oferta valida.",
  "invalid-coach-profile":
    "Selecciona destinatarios activos, visibles y asignables en esta organización.",
  "invalid-organization": "La organización recibida no es válida.",
  "invalid-request-type": "El tipo de solicitud recibido no está habilitado.",
  "invalid-response": "La respuesta recibida no es valida.",
  "invalid-schedule-block": "La clase recibida no está disponible.",
  "invalid-schedule-block-assignment":
    "La asignación de la clase no está disponible.",
  "invalid-summary":
    "El mensaje debe ser breve y no incluir datos sensibles, legales o de nómina.",
  "invalid-timestamp": "La fecha de vencimiento no es válida.",
  "load-failed": "No se han podido cargar los datos necesarios.",
  "no-active-memberships": "No hay accesos activos para este usuario.",
  "not-actionable":
    "Esta solicitud ya no admite cambios. Si vencio o la clase ya no puede modificarse, cierrala como vencida.",
  "not-approved": "La solicitud debe aprobarse antes de aplicarse.",
  "not-found": "La solicitud ya no está disponible.",
  "organization-not-found": "La organización solicitada no está disponible.",
  "organization-required": "Elige una organización antes de revisar solicitudes.",
  "permission-denied": "No se pudo completar por permisos de seguridad.",
  "profile-missing":
    "Tu cuenta no tiene persona operativa vinculada en esta organización.",
  "save-failed": "No se han podido guardar los cambios. Vuelve a intentarlo.",
};

const requestStatusLabels: Record<string, string> = {
  accepted_by_coach: "Aceptada por coach",
  applied: "Aplicada",
  approved: "Aprobada",
  cancelled: "Cancelada",
  draft: "Borrador",
  expired: "Expirada",
  offered: "Ofrecida",
  pending: "Pendiente",
  pending_approval: "Pendiente de aprobacion",
  rejected: "Rechazada",
  rejected_by_coach: "Rechazada por coach",
};

const targetStatusLabels: Record<string, string> = {
  accepted: "Aceptada",
  expired: "Expirada",
  offered: "Pendiente",
  rejected: "Rechazada",
  withdrawn: "Retirada",
};

const requestTypeLabels: Record<string, string> = {
  coverage_request: "Cobertura",
  direct_coverage_request: "Cobertura directa",
  offer_block: "Oferta de bloque",
  open_coverage_request: "Cobertura abierta",
  own_block_change: "Cambio propio",
  swap: "Intercambio",
};

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function shortId(value: string) {
  return value.slice(0, 8);
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
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function formatTime(value: string) {
  return formatTimeForInput(value) || value;
}

function isPastTimestamp(value: string | null, now: Date) {
  if (!value) {
    return false;
  }

  const timestamp = new Date(value).getTime();

  return Number.isFinite(timestamp) && timestamp <= now.getTime();
}

function blockIsNotActionable(status: string | null | undefined) {
  return status === "cancelled" || status === "completed";
}

function getTargetExpiryLabel({
  target,
  timeZone,
}: {
  target: ChangeRequestListItem["targets"][number];
  timeZone: string;
}) {
  return target.expires_at
    ? `Vence ${formatDateTime(target.expires_at, timeZone)}`
    : "Sin vencimiento propio";
}

function getRequestStatusTone(status: string) {
  if (status === "applied" || status === "approved") {
    return "success" as const;
  }

  if (status === "pending_approval" || status === "accepted_by_coach") {
    return "warning" as const;
  }

  if (status === "rejected" || status === "rejected_by_coach") {
    return "critical" as const;
  }

  if (status === "cancelled" || status === "expired") {
    return "neutral" as const;
  }

  return "pending" as const;
}

function getTargetStatusTone(status: string) {
  if (status === "accepted") {
    return "success" as const;
  }

  if (status === "rejected" || status === "expired") {
    return "critical" as const;
  }

  if (status === "withdrawn") {
    return "neutral" as const;
  }

  return "pending" as const;
}

function getCoachLabel(
  coachProfileId: string,
  displayData: RequestsDisplayData,
) {
  const coachProfile = displayData.coachProfilesById.get(coachProfileId);
  const personProfile = coachProfile?.person_profile_id
    ? displayData.personProfilesById.get(coachProfile.person_profile_id)
    : undefined;

  return personProfile?.display_name ?? `Coach ${shortId(coachProfileId)}`;
}

function getRequesterLabel(
  item: ChangeRequestListItem,
  displayData: RequestsDisplayData,
) {
  const personProfile = displayData.personProfilesById.get(
    item.request.requester_person_profile_id,
  );

  return personProfile?.display_name ?? getCoachLabel(item.request.requester_coach_profile_id, displayData);
}

function getBlockTitle(
  item: ChangeRequestListItem,
  displayData: RequestsDisplayData,
) {
  const block = displayData.blocksById.get(item.request.schedule_block_id);
  const classType = block
    ? displayData.classTypesById.get(block.class_type_id)
    : undefined;

  return classType?.name ?? "Bloque operativo";
}

function getBlockMeta(
  item: ChangeRequestListItem,
  displayData: RequestsDisplayData,
) {
  const block = displayData.blocksById.get(item.request.schedule_block_id);

  if (!block) {
    return "Clase no disponible";
  }

  const center = displayData.centersById.get(block.center_id);

  return `${formatServiceDate(block.service_date)} / ${formatTime(
    block.start_time,
  )} - ${formatTime(block.end_time)} / ${center?.name ?? "Centro no disponible"}`;
}

function isOwnRequest(
  item: ChangeRequestListItem,
  displayData: RequestsDisplayData,
) {
  return displayData.ownCoachProfileIds.has(item.request.requester_coach_profile_id);
}

function getOwnOfferedTargets(
  item: ChangeRequestListItem,
  displayData: RequestsDisplayData,
  now: Date,
) {
  if (item.request.status !== "pending" && item.request.status !== "offered") {
    return [];
  }

  if (getActionBlockReason(item, displayData, now)) {
    return [];
  }

  return item.targets.filter(
    (target) =>
      target.status === "offered" &&
      !targetIsExpired(target, now) &&
      displayData.ownCoachProfileIds.has(target.target_coach_profile_id),
  );
}

function canCancelOwnRequest(
  item: ChangeRequestListItem,
  displayData: RequestsDisplayData,
  now: Date,
) {
  return (
    isOwnRequest(item, displayData) &&
    !CLOSED_REQUEST_STATUSES.has(item.request.status) &&
    item.request.status !== "approved" &&
    !getActionBlockReason(item, displayData, now)
  );
}

function canApproveRequest(
  item: ChangeRequestListItem,
  displayData: RequestsDisplayData,
  now: Date,
) {
  return (
    !getActionBlockReason(item, displayData, now) &&
    (item.request.status === "pending_approval" ||
      item.request.status === "accepted_by_coach")
  );
}

function canRejectRequest(
  item: ChangeRequestListItem,
  displayData: RequestsDisplayData,
  now: Date,
) {
  return (
    !CLOSED_REQUEST_STATUSES.has(item.request.status) &&
    !getActionBlockReason(item, displayData, now)
  );
}

function canApplyRequest(
  item: ChangeRequestListItem,
  displayData: RequestsDisplayData,
  now: Date,
) {
  return (
    item.request.status === "approved" &&
    !getActionBlockReason(item, displayData, now)
  );
}

function hasActiveTarget(
  target: ChangeRequestListItem["targets"][number],
  now: Date,
) {
  return (
    (target.status === "offered" || target.status === "accepted") &&
    !isPastTimestamp(target.expires_at, now)
  );
}

function targetIsExpired(
  target: ChangeRequestListItem["targets"][number],
  now: Date,
) {
  return (
    (target.status === "offered" || target.status === "accepted") &&
    isPastTimestamp(target.expires_at, now)
  );
}

function getActionBlockReason(
  item: ChangeRequestListItem,
  displayData: RequestsDisplayData,
  now: Date,
) {
  if (CLOSED_REQUEST_STATUSES.has(item.request.status)) {
    return null;
  }

  const block = displayData.blocksById.get(item.request.schedule_block_id);

  if (!block) {
    return "La clase ya no está disponible.";
  }

  if (isPastTimestamp(item.request.expires_at, now)) {
    return "La solicitud está vencida. Ciérrala antes de hacer otro cambio.";
  }

  if (blockIsNotActionable(block.status)) {
    return "La clase está cancelada o completada.";
  }

  const acceptedTarget = item.request.accepted_target_id
    ? item.targets.find((target) => target.id === item.request.accepted_target_id)
    : null;

  if (acceptedTarget && isPastTimestamp(acceptedTarget.expires_at, now)) {
    return "La respuesta aceptada está vencida. Cierra la solicitud antes de aplicarla.";
  }

  return null;
}

function getManualExpiryReason(
  item: ChangeRequestListItem,
  displayData: RequestsDisplayData,
  now: Date,
) {
  if (CLOSED_REQUEST_STATUSES.has(item.request.status)) {
    return null;
  }

  const block = displayData.blocksById.get(item.request.schedule_block_id);

  if (isPastTimestamp(item.request.expires_at, now)) {
    return "Solicitud vencida";
  }

  if (block && blockIsNotActionable(block.status)) {
    return "Clase cerrada";
  }

  const acceptedTarget = item.request.accepted_target_id
    ? item.targets.find((target) => target.id === item.request.accepted_target_id)
    : null;

  if (acceptedTarget && isPastTimestamp(acceptedTarget.expires_at, now)) {
    return "Respuesta vencida";
  }

  if (
    item.request.status === "offered" &&
    !item.targets.some((target) => hasActiveTarget(target, now))
  ) {
    return "Sin respuestas pendientes";
  }

  return null;
}

async function getDisplayData({
  items,
  organizationId,
  userId,
}: {
  items: ChangeRequestListItem[];
  organizationId: string;
  userId: string;
}): Promise<RequestsDisplayData> {
  const supabase = await createClient();
  const blockIds = [...new Set(items.map((item) => item.request.schedule_block_id))];
  const requesterCoachIds = items.map(
    (item) => item.request.requester_coach_profile_id,
  );
  const targetCoachIds = items.flatMap((item) =>
    item.targets.map((target) => target.target_coach_profile_id),
  );
  const coachProfileIds = [...new Set([...requesterCoachIds, ...targetCoachIds])];
  const requesterPersonProfileIds = items.map(
    (item) => item.request.requester_person_profile_id,
  );

  const [blocksResult, ownPersonProfilesResult, coachProfilesResult] =
    await Promise.all([
      blockIds.length > 0
        ? supabase
            .from("schedule_blocks")
            .select(
              "id, center_id, class_type_id, service_date, start_time, end_time, required_coaches, status",
            )
            .eq("organization_id", organizationId)
            .in("id", blockIds)
        : Promise.resolve({ data: [], error: null }),
      supabase
        .from("person_profiles")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("user_id", userId)
        .eq("status", "active"),
      coachProfileIds.length > 0
        ? supabase
            .from("coach_profiles")
            .select("id, person_profile_id, user_id")
            .eq("organization_id", organizationId)
            .in("id", coachProfileIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

  if (blocksResult.error) {
    throw new Error(`Could not load request blocks: ${blocksResult.error.message}`);
  }

  if (ownPersonProfilesResult.error) {
    throw new Error(
      `Could not load own request profile: ${ownPersonProfilesResult.error.message}`,
    );
  }

  if (coachProfilesResult.error) {
    throw new Error(
      `Could not load request coach profiles: ${coachProfilesResult.error.message}`,
    );
  }

  const blocks = (blocksResult.data ?? []) as ScheduleBlockRow[];
  const coachProfiles = (coachProfilesResult.data ?? []) as CoachProfileRow[];
  const centerIds = [...new Set(blocks.map((block) => block.center_id))];
  const classTypeIds = [...new Set(blocks.map((block) => block.class_type_id))];
  const personProfileIds = [
    ...new Set([
      ...requesterPersonProfileIds,
      ...coachProfiles.flatMap((coach) =>
        coach.person_profile_id ? [coach.person_profile_id] : [],
      ),
    ]),
  ];
  const ownPersonProfileIds = new Set(
    (ownPersonProfilesResult.data ?? []).map((profile) => profile.id),
  );

  const [centersResult, classTypesResult, personProfilesResult] =
    await Promise.all([
      centerIds.length > 0
        ? supabase
            .from("centers")
            .select("id, name")
            .eq("organization_id", organizationId)
            .in("id", centerIds)
        : Promise.resolve({ data: [], error: null }),
      classTypeIds.length > 0
        ? supabase
            .from("class_types")
            .select("id, name")
            .eq("organization_id", organizationId)
            .in("id", classTypeIds)
        : Promise.resolve({ data: [], error: null }),
      personProfileIds.length > 0
        ? supabase
            .from("person_profiles")
            .select("id, display_name")
            .eq("organization_id", organizationId)
            .in("id", personProfileIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

  if (centersResult.error) {
    throw new Error(
      `Could not load request centers: ${centersResult.error.message}`,
    );
  }

  if (classTypesResult.error) {
    throw new Error(
      `Could not load request activity types: ${classTypesResult.error.message}`,
    );
  }

  if (personProfilesResult.error) {
    throw new Error(
      `Could not load request people: ${personProfilesResult.error.message}`,
    );
  }

  const ownCoachProfileIds = new Set(
    coachProfiles
      .filter(
        (coach) =>
          coach.user_id === userId ||
          (coach.person_profile_id
            ? ownPersonProfileIds.has(coach.person_profile_id)
            : false),
      )
      .map((coach) => coach.id),
  );

  return {
    blocksById: new Map(blocks.map((block) => [block.id, block])),
    centersById: new Map(
      ((centersResult.data ?? []) as CenterRow[]).map((center) => [
        center.id,
        center,
      ]),
    ),
    classTypesById: new Map(
      ((classTypesResult.data ?? []) as ClassTypeRow[]).map((classType) => [
        classType.id,
        classType,
      ]),
    ),
    coachProfilesById: new Map(coachProfiles.map((coach) => [coach.id, coach])),
    ownCoachProfileIds,
    personProfilesById: new Map(
      ((personProfilesResult.data ?? []) as PersonProfileRow[]).map((person) => [
        person.id,
        person,
      ]),
    ),
  };
}

function HiddenActionInputs({
  changeRequestId,
  organizationId,
}: {
  changeRequestId: string;
  organizationId: string;
}) {
  return (
    <>
      <input name="organizationId" type="hidden" value={organizationId} />
      <input name="changeRequestId" type="hidden" value={changeRequestId} />
    </>
  );
}

function RequestActions({
  canManage,
  displayData,
  item,
  now,
  organizationId,
}: {
  canManage: boolean;
  displayData: RequestsDisplayData;
  item: ChangeRequestListItem;
  now: Date;
  organizationId: string;
}) {
  const ownTargets = getOwnOfferedTargets(item, displayData, now);
  const hasOwnCancel = canCancelOwnRequest(item, displayData, now);
  const manualExpiryReason = getManualExpiryReason(item, displayData, now);
  const hasManagementActions =
    !manualExpiryReason &&
    canManage &&
    (canApproveRequest(item, displayData, now) ||
      canRejectRequest(item, displayData, now) ||
      canApplyRequest(item, displayData, now));
  const hasExpiryAction = Boolean(manualExpiryReason);

  if (
    ownTargets.length === 0 &&
    !hasOwnCancel &&
    !hasManagementActions &&
    !hasExpiryAction
  ) {
    return (
      <p className="rounded-lg bg-muted/45 px-3 py-2 text-sm text-muted-foreground">
        Solo lectura en este estado o para tu rol.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {ownTargets.map((target) => (
        <div className="contents" key={target.id}>
          <form action={respondToChangeRequestTargetFromForm}>
            <input name="organizationId" type="hidden" value={organizationId} />
            <input
              name="changeRequestTargetId"
              type="hidden"
              value={target.id}
            />
            <input name="response" type="hidden" value="accepted" />
            <Button size="sm" type="submit">
              <CheckCircle2 aria-hidden="true" />
              Aceptar
            </Button>
          </form>
          <form action={respondToChangeRequestTargetFromForm}>
            <input name="organizationId" type="hidden" value={organizationId} />
            <input
              name="changeRequestTargetId"
              type="hidden"
              value={target.id}
            />
            <input name="response" type="hidden" value="rejected" />
            <Button size="sm" type="submit" variant="outline">
              <XCircle aria-hidden="true" />
              Rechazar
            </Button>
          </form>
        </div>
      ))}

      {hasOwnCancel ? (
        <form action={cancelOwnChangeRequestFromForm}>
          <HiddenActionInputs
            changeRequestId={item.request.id}
            organizationId={organizationId}
          />
          <Button size="sm" type="submit" variant="outline">
            <XCircle aria-hidden="true" />
            Cancelar
          </Button>
        </form>
      ) : null}

      {canManage && canApproveRequest(item, displayData, now) ? (
        <form action={approveChangeRequestFromForm}>
          <HiddenActionInputs
            changeRequestId={item.request.id}
            organizationId={organizationId}
          />
          <Button size="sm" type="submit">
            <ShieldCheck aria-hidden="true" />
            Aprobar
          </Button>
        </form>
      ) : null}

      {canManage && canApplyRequest(item, displayData, now) ? (
        <form action={applyApprovedChangeRequestFromForm}>
          <HiddenActionInputs
            changeRequestId={item.request.id}
            organizationId={organizationId}
          />
          <Button size="sm" type="submit">
            <Send aria-hidden="true" />
            Aplicar
          </Button>
        </form>
      ) : null}

      {canManage && canRejectRequest(item, displayData, now) ? (
        <form action={rejectChangeRequestFromForm}>
          <HiddenActionInputs
            changeRequestId={item.request.id}
            organizationId={organizationId}
          />
          <Button size="sm" type="submit" variant="outline">
            <XCircle aria-hidden="true" />
            Rechazar solicitud
          </Button>
        </form>
      ) : null}

      {hasExpiryAction ? (
        <form action={expireChangeRequestFromForm}>
          <HiddenActionInputs
            changeRequestId={item.request.id}
            organizationId={organizationId}
          />
          <RequestExpireSubmitButton />
          <span className="sr-only">{manualExpiryReason}</span>
        </form>
      ) : null}
    </div>
  );
}

function RequestCard({
  canManage,
  displayData,
  item,
  now,
  organizationId,
  timeZone,
}: {
  canManage: boolean;
  displayData: RequestsDisplayData;
  item: ChangeRequestListItem;
  now: Date;
  organizationId: string;
  timeZone: string;
}) {
  const block = displayData.blocksById.get(item.request.schedule_block_id);
  const requester = getRequesterLabel(item, displayData);
  const requestType =
    requestTypeLabels[item.request.request_type] ?? item.request.request_type;
  const lastEvent = item.events.at(-1);
  const actionBlockReason = getActionBlockReason(item, displayData, now);
  const manualExpiryReason = getManualExpiryReason(item, displayData, now);

  return (
    <Card size="sm">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={getRequestStatusTone(item.request.status)}>
                {requestStatusLabels[item.request.status] ?? item.request.status}
              </StatusBadge>
              <Badge variant="outline">{requestType}</Badge>
              {isOwnRequest(item, displayData) ? (
                <Badge variant="secondary">Propia</Badge>
              ) : null}
              {manualExpiryReason ? (
                <StatusBadge tone="warning">{manualExpiryReason}</StatusBadge>
              ) : null}
            </div>
            <CardTitle className="truncate text-base">
              {getBlockTitle(item, displayData)}
            </CardTitle>
            <CardDescription>{getBlockMeta(item, displayData)}</CardDescription>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link
              href={getSchedulePath({
                blockId: item.request.schedule_block_id,
                organizationId,
                week: block?.service_date,
              })}
            >
              Horario
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div className="min-w-0">
            <dt className="text-muted-foreground">Solicita</dt>
            <dd className="truncate font-medium">{requester}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted-foreground">Creada</dt>
            <dd className="truncate font-medium">
              {formatDateTime(item.request.created_at, timeZone)}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted-foreground">Vence</dt>
            <dd className="truncate font-medium">
              {formatDateTime(item.request.expires_at, timeZone)}
            </dd>
          </div>
        </dl>

        {item.request.reason_summary ? (
          <p className="rounded-lg bg-muted/45 px-3 py-2 text-sm text-muted-foreground">
            {item.request.reason_summary}
          </p>
        ) : null}

        <div className="space-y-2">
          <p className="text-xs font-medium uppercase text-muted-foreground">
            Destinatarios
          </p>
          {item.targets.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Sin destinatarios visibles en este corte.
            </p>
          ) : (
            <div className="grid gap-2">
              {item.targets.map((target) => (
                <div
                  className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
                  key={target.id}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {getCoachLabel(
                        target.target_coach_profile_id,
                        displayData,
                      )}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {getTargetExpiryLabel({ target, timeZone })}
                    </span>
                  </span>
                  <StatusBadge
                    tone={
                      targetIsExpired(target, now)
                        ? "critical"
                        : getTargetStatusTone(target.status)
                    }
                  >
                    {targetIsExpired(target, now)
                      ? "Vencida"
                      : targetStatusLabels[target.status] ?? target.status}
                  </StatusBadge>
                </div>
              ))}
            </div>
          )}
        </div>

        {actionBlockReason ? (
          <Alert>
            <AlertTitle>No se puede modificar ahora</AlertTitle>
            <AlertDescription>{actionBlockReason}</AlertDescription>
          </Alert>
        ) : null}

        {lastEvent ? (
          <p className="text-xs text-muted-foreground">
            Ultimo evento: {lastEvent.event_type} /{" "}
            {formatDateTime(lastEvent.created_at, timeZone)}
          </p>
        ) : null}

        <RequestActions
          canManage={canManage}
          displayData={displayData}
          item={item}
          now={now}
          organizationId={organizationId}
        />
      </CardContent>
    </Card>
  );
}

type RequestsSummaryTone =
  | "info"
  | "neutral"
  | "pending"
  | "success"
  | "warning";

const requestsSummaryToneClasses: Record<RequestsSummaryTone, string> = {
  info: "bg-primary/10 text-primary ring-primary/15",
  neutral: "bg-muted text-muted-foreground ring-border",
  pending: "bg-violet-50 text-violet-700 ring-violet-200",
  success: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  warning: "bg-amber-50 text-amber-700 ring-amber-200",
};

function RequestSummaryCard({
  description,
  icon: Icon,
  label,
  tone = "neutral",
  value,
}: {
  description: string;
  icon: LucideIcon;
  label: string;
  tone?: RequestsSummaryTone;
  value: React.ReactNode;
}) {
  return (
    <Card size="sm">
      <CardContent className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-semibold">{label}</p>
            <p className="text-sm leading-5 text-muted-foreground">
              {description}
            </p>
          </div>
          <span
            className={cn(
              "flex size-11 shrink-0 items-center justify-center rounded-full ring-1",
              requestsSummaryToneClasses[tone],
            )}
          >
            <Icon aria-hidden="true" className="size-5" />
          </span>
        </div>
        <p className="font-mono text-3xl font-semibold tracking-tight">
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function RequestsSummary({
  canManage,
  displayData,
  items,
  now,
}: {
  canManage: boolean;
  displayData: RequestsDisplayData;
  items: ChangeRequestListItem[];
  now: Date;
}) {
  const ownOfferedTargets = items.reduce(
    (count, item) => count + getOwnOfferedTargets(item, displayData, now).length,
    0,
  );
  const pendingApproval = items.filter((item) =>
    canApproveRequest(item, displayData, now),
  ).length;
  const approved = items.filter((item) =>
    canApplyRequest(item, displayData, now),
  ).length;

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <RequestSummaryCard
        description="Solicitudes nuevas que esperan tu revisión."
        icon={Inbox}
        label="En bandeja"
        tone={items.length > 0 ? "info" : "neutral"}
        value={items.length}
      />
      <RequestSummaryCard
        description="Ofertas que esperan tu respuesta."
        icon={CheckCircle2}
        label="Para responder"
        tone={ownOfferedTargets > 0 ? "warning" : "neutral"}
        value={ownOfferedTargets}
      />
      <RequestSummaryCard
        description="Solicitudes listas para revisar."
        icon={ShieldCheck}
        label="Para revisar"
        tone={pendingApproval > 0 ? "warning" : "neutral"}
        value={canManage ? pendingApproval : "-"}
      />
      <RequestSummaryCard
        description="Aprobadas y listas para actualizar horario."
        icon={Send}
        label="Para aplicar"
        tone={approved > 0 ? "success" : "neutral"}
        value={canManage ? approved : "-"}
      />
    </div>
  );
}

function RequestsInboxHeader({ count }: { count: number }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Inbox aria-hidden="true" className="size-4" />
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight">Bandeja</h2>
          <p className="mt-1 text-sm leading-5 text-muted-foreground">
            Responde, revisa o aplica segun tu rol y el estado de cada
            solicitud.
          </p>
        </div>
      </div>
      <Badge variant="outline">{count} visibles</Badge>
    </div>
  );
}

function RequestsEmptyState({ organizationId }: { organizationId: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 py-6 sm:flex-row sm:items-center">
        <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
          <CheckCircle2 aria-hidden="true" className="size-7" />
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <CardTitle>Sin solicitudes visibles</CardTitle>
          <CardDescription className="leading-6">
            No hay solicitudes de cambio o cobertura visibles para esta
            organización y usuario.
          </CardDescription>
        </div>
        <Button asChild variant="outline">
          <Link href={getSchedulePath({ organizationId })}>
            <CalendarDays aria-hidden="true" />
            Abrir horario
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function RequestsHelpNote({ organizationId }: { organizationId: string }) {
  return (
    <Alert className="border-primary/20 bg-primary/5">
      <Info aria-hidden="true" className="size-4 text-primary" />
      <AlertTitle>Consejo</AlertTitle>
      <AlertDescription className="flex flex-col gap-3 text-sm md:flex-row md:items-center md:justify-between">
        <span>
          Puedes crear cobertura desde esta página o abrir el horario para
          hacerlo desde una clase concreta. Las ausencias, nómina y horas extra
          se gestionan en sus apartados.
        </span>
        <Button asChild size="sm" variant="outline">
          <Link href={getSchedulePath({ organizationId })}>
            Abrir horario
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </AlertDescription>
    </Alert>
  );
}

export default async function RequestsPage({ searchParams }: RequestsPageProps) {
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect(getLoginPath("/app/requests"));
  }

  const params = await searchParams;
  const organizationId = getParam(params.organizationId);
  const selectedAssignmentId = getParam(params.assignment_id);
  const selectedBlockId = getParam(params.block_id);
  const status = getParam(params.status);
  const error = getParam(params.error);
  const memberships = await getActiveMemberships(user.id);
  const resolution = resolveActiveOrganization(memberships, organizationId);

  if (!resolution.ok) {
    return (
      <div className="space-y-6">
        <PageHeader title="Solicitudes" />
        <OrganizationResolutionState
          basePath="/app/requests"
          resolution={resolution}
        />
      </div>
    );
  }

  const canManage = canManageChangeRequests(resolution.membership.role);
  const roleLabel = getApplicationRoleLabel(resolution.membership.role);
  const requestsResult = await listVisibleChangeRequests({
    includeEvents: true,
    limit: 100,
    organizationId: resolution.organization.id,
  });

  if (!requestsResult.ok) {
    return (
      <div className="space-y-6">
        <PageHeader
          badge="Solicitudes"
          meta={
            <>
              <Badge variant="outline">{resolution.organization.name}</Badge>
              <Badge variant="outline">{roleLabel}</Badge>
            </>
          }
          title="Solicitudes"
        />
        <Alert variant="destructive">
          <AlertTriangle aria-hidden="true" className="size-4" />
          <AlertTitle>No se han podido cargar las solicitudes</AlertTitle>
          <AlertDescription>
            {errorMessages[requestsResult.error] ??
              "Revisa sesión, organización activa y permisos."}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const items = requestsResult.data;
  const [displayData, creationOptionsResult] = await Promise.all([
    getDisplayData({
      items,
      organizationId: resolution.organization.id,
      userId: user.id,
    }),
    listChangeRequestCreationOptions({
      organizationId: resolution.organization.id,
      scheduleBlockId: selectedBlockId,
    }),
  ]);
  const now = new Date();

  return (
    <div className="space-y-6">
      <PageHeader
        actions={
          <Button asChild size="lg">
            <Link href="#request-creation">
              <Plus aria-hidden="true" />
              Pedir cobertura
            </Link>
          </Button>
        }
        badge="Solicitudes"
        description="Pide ayuda para cubrir clases, responde ofertas y aplica cambios aprobados al horario."
        meta={
          <>
            <Badge variant="outline">{resolution.organization.name}</Badge>
            <Badge variant="outline">{roleLabel}</Badge>
          </>
        }
        title="Solicitudes"
      >
        <div className="max-w-3xl space-y-2">
          <p className="text-sm leading-6 text-muted-foreground md:hidden">
            Pide ayuda para cubrir clases, responde ofertas y aplica cambios
            aprobados al horario.
          </p>
          <details className="group">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-sm font-medium text-primary outline-none hover:underline focus-visible:rounded-md focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
              <Info aria-hidden="true" className="size-4" />
              <span className="group-open:hidden">Más información</span>
              <span className="hidden group-open:inline">
                Ocultar informacion
              </span>
            </summary>

            <Alert className="mt-3">
              <AlertTitle>Uso de esta bandeja</AlertTitle>
              <AlertDescription>
                Esta bandeja organiza cobertura sobre clases del horario. Las
                ausencias, nóminas y horas extra se gestionan en sus apartados.
              </AlertDescription>
            </Alert>
          </details>
        </div>
      </PageHeader>

      {status && statusMessages[status] ? (
        <TransientFeedbackBanner
          description="La bandeja ya refleja el ultimo cambio."
          title={statusMessages[status]}
          tone="success"
        />
      ) : null}

      {error && errorMessages[error] ? (
        <TransientFeedbackBanner
          description={errorMessages[error]}
          title="No se ha podido completar la acción"
          tone="error"
        />
      ) : null}

      {creationOptionsResult.ok ? (
        <RequestCreationForm
          action={createChangeRequestFromForm}
          creationOptions={creationOptionsResult.data}
          organizationId={resolution.organization.id}
          selectedAssignmentId={selectedAssignmentId}
          selectedBlockId={selectedBlockId}
        />
      ) : (
        <Alert variant="destructive">
          <AlertTriangle aria-hidden="true" className="size-4" />
          <AlertTitle>No se puede preparar la creacion</AlertTitle>
          <AlertDescription>
            {errorMessages[creationOptionsResult.error] ??
              "Revisa sesión, organización activa y permisos antes de crear una solicitud."}
          </AlertDescription>
        </Alert>
      )}

      <RequestsSummary
        canManage={canManage}
        displayData={displayData}
        items={items}
        now={now}
      />

      <section className="space-y-3">
        <RequestsInboxHeader count={items.length} />
        {items.length === 0 ? (
          <RequestsEmptyState organizationId={resolution.organization.id} />
        ) : (
          <div className="grid gap-3">
            {items.map((item) => (
              <RequestCard
                canManage={canManage}
                displayData={displayData}
                item={item}
                key={item.request.id}
                now={now}
                organizationId={resolution.organization.id}
                timeZone={resolution.organization.timezone}
              />
            ))}
          </div>
        )}
      </section>
      <RequestsHelpNote organizationId={resolution.organization.id} />
    </div>
  );
}
