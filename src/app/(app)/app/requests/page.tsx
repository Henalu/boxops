import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Inbox,
  Send,
  ShieldCheck,
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
  "request-applied": "Solicitud aplicada al horario.",
  "request-approved": "Solicitud aprobada.",
  "request-cancelled": "Solicitud cancelada.",
  "request-created": "Solicitud de cobertura creada.",
  "request-expired": "Solicitud cerrada como vencida o no accionable.",
  "request-rejected": "Solicitud rechazada.",
  "target-accepted": "Respuesta aceptada.",
  "target-rejected": "Respuesta rechazada.",
};

const errorMessages: Record<string, string> = {
  "authentication-required": "Inicia sesion para revisar solicitudes.",
  "coach-unavailable":
    "Ese entrenador ya tiene un bloque asignado que se solapa con esta franja.",
  "confirmation-required": "Confirma el alcance operativo antes de enviar.",
  expired: "La solicitud o la oferta ya habia vencido.",
  forbidden: "Tu rol o tu perfil no permite esa accion.",
  "invalid-change-request": "La solicitud recibida no es valida.",
  "invalid-change-request-target": "La oferta recibida no es valida.",
  "invalid-coach-profile":
    "Selecciona destinatarios activos, visibles y asignables en esta organización.",
  "invalid-organization": "La organizacion recibida no es valida.",
  "invalid-request-type": "El tipo de solicitud recibido no esta habilitado.",
  "invalid-response": "La respuesta recibida no es valida.",
  "invalid-schedule-block": "El bloque recibido no esta disponible.",
  "invalid-schedule-block-assignment":
    "La asignacion recibida no esta disponible.",
  "invalid-summary":
    "La razon debe ser corta y no puede incluir datos sensibles, legales o de payroll.",
  "invalid-timestamp": "La fecha de vencimiento no es valida.",
  "load-failed": "No se han podido cargar los datos necesarios.",
  "no-active-memberships": "No hay accesos activos para este usuario.",
  "not-actionable":
    "La solicitud no admite esa accion ahora. Si esta vencida o el bloque ya no es accionable, usa cerrar vencida.",
  "not-approved": "La solicitud debe aprobarse antes de aplicarse.",
  "not-found": "La solicitud ya no esta disponible.",
  "organization-not-found": "La organizacion solicitada no esta disponible.",
  "organization-required": "Elige una organizacion antes de revisar solicitudes.",
  "permission-denied": "La base de datos ha denegado la operacion.",
  "profile-missing":
    "Tu cuenta no tiene persona operativa vinculada en esta organización.",
  "save-failed": "No se han podido guardar los cambios.",
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
    return "Bloque no disponible";
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
    return "El bloque ya no esta disponible.";
  }

  if (isPastTimestamp(item.request.expires_at, now)) {
    return "La solicitud esta vencida y debe cerrarse antes de tomar otra accion.";
  }

  if (blockIsNotActionable(block.status)) {
    return "El bloque esta cancelado o completado.";
  }

  const acceptedTarget = item.request.accepted_target_id
    ? item.targets.find((target) => target.id === item.request.accepted_target_id)
    : null;

  if (acceptedTarget && isPastTimestamp(acceptedTarget.expires_at, now)) {
    return "La oferta aceptada esta vencida y debe cerrarse antes de aplicar.";
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
    return "Bloque no accionable";
  }

  const acceptedTarget = item.request.accepted_target_id
    ? item.targets.find((target) => target.id === item.request.accepted_target_id)
    : null;

  if (acceptedTarget && isPastTimestamp(acceptedTarget.expires_at, now)) {
    return "Oferta aceptada vencida";
  }

  if (
    item.request.status === "offered" &&
    !item.targets.some((target) => hasActiveTarget(target, now))
  ) {
    return "Sin destinatarios activos";
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
            <AlertTitle>No accionable ahora</AlertTitle>
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
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard icon={Inbox} label="Visibles" value={items.length} />
      <StatCard
        description="Ofertas recibidas por tu perfil."
        icon={CheckCircle2}
        label="Para responder"
        tone={ownOfferedTargets > 0 ? "warning" : "neutral"}
        value={ownOfferedTargets}
      />
      <StatCard
        description="Listas para decision operativa."
        icon={ShieldCheck}
        label="Aprobacion"
        tone={pendingApproval > 0 ? "warning" : "neutral"}
        value={canManage ? pendingApproval : "-"}
      />
      <StatCard
        description="Aprobadas y pendientes de tocar horario."
        icon={Send}
        label="A aplicar"
        tone={approved > 0 ? "success" : "neutral"}
        value={canManage ? approved : "-"}
      />
    </div>
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
              <Badge variant="outline">Rol {roleLabel}</Badge>
            </>
          }
          title="Solicitudes"
        />
        <Alert variant="destructive">
          <AlertTriangle aria-hidden="true" className="size-4" />
          <AlertTitle>No se han podido cargar las solicitudes</AlertTitle>
          <AlertDescription>
            {errorMessages[requestsResult.error] ??
              "Revisa sesion, organizacion activa y permisos."}
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
        badge="Solicitudes"
        meta={
          <>
            <Badge variant="outline">{resolution.organization.name}</Badge>
            <Badge variant="outline">Rol {roleLabel}</Badge>
          </>
        }
        title="Solicitudes"
      >
        <details className="group max-w-3xl">
          <summary className="cursor-pointer list-none text-sm leading-6 text-muted-foreground outline-none focus-visible:rounded-md focus-visible:ring-3 focus-visible:ring-ring/50 md:text-base [&::-webkit-details-marker]:hidden">
            <span>
              Bandeja minima de cambios de bloque y cobertura. La fuente real
              del horario sigue siendo el horario semanal.
            </span>{" "}
            <span className="inline-flex font-medium text-foreground underline underline-offset-4 group-open:hidden">
              Más
            </span>
            <span className="hidden font-medium text-foreground underline underline-offset-4 group-open:inline-flex">
              Menos
            </span>
          </summary>

          <Alert className="mt-3">
            <AlertTitle>Alcance operativo</AlertTitle>
            <AlertDescription>
              Aprobar o aplicar aqui solo resuelve cobertura en el horario. No
              crea ausencias, payroll, horas extra aprobadas ni cumplimiento
              legal definitivo.
            </AlertDescription>
          </Alert>
        </details>
      </PageHeader>

      {status && statusMessages[status] ? (
        <Alert>
          <AlertTitle>{statusMessages[status]}</AlertTitle>
          <AlertDescription>
            La bandeja ya se ha recargado con la informacion visible por RLS.
          </AlertDescription>
        </Alert>
      ) : null}

      {error && errorMessages[error] ? (
        <Alert variant="destructive">
          <AlertTriangle aria-hidden="true" className="size-4" />
          <AlertTitle>No se ha podido completar la accion</AlertTitle>
          <AlertDescription>{errorMessages[error]}</AlertDescription>
        </Alert>
      ) : null}

      {!canManage ? (
        <Alert>
          <AlertTitle>Vista acotada por rol</AlertTitle>
          <AlertDescription>
            Puedes ver solicitudes propias o recibidas segun RLS. La aprobacion,
            rechazo operativo y aplicacion al horario quedan para Propietario,
            Administrador o Responsable.
          </AlertDescription>
        </Alert>
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
        <SectionHeader
          description="Acciones disponibles segun tu rol, perfil operativo y estado actual."
          title="Bandeja"
        />
        {items.length === 0 ? (
          <EmptyState
            action={
              <Button asChild variant="outline">
                <Link
                  href={getSchedulePath({
                    organizationId: resolution.organization.id,
                  })}
                >
                  Abrir horario
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
            }
            description="No hay solicitudes de cambio o cobertura visibles para esta organización y usuario."
            title="Sin solicitudes visibles"
          />
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

      <Card>
        <CardHeader>
          <CardTitle>Limitaciones del corte</CardTitle>
          <CardDescription>
            I.8 mantiene solicitudes/ofertas minimas sobre bloques asignados y
            endurece destinos, vencimientos y estados no accionables. No
            incluye intercambio entre dos bloques, ausencias, vacaciones,
            payroll, horas extra automaticas ni decisiones legales.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
