import { canManageOperationalData } from "@/lib/auth/permissions";
import {
  getActiveMemberships,
  getAuthenticatedUser,
  resolveActiveOrganization,
} from "@/lib/auth/tenant";
import {
  listOperationalAbsenceScheduleImpacts,
  type AbsenceScheduleImpactRow,
} from "@/lib/absence-requests";
import { createClient } from "@/lib/supabase/server";
import { isPostgresUuid } from "@/lib/uuid";
import type { Json, Tables } from "@/types/supabase";

export type CoverageTraceKind =
  | "absence_impact"
  | "change_request"
  | "operational_audit";

export type CoverageTraceSource =
  | "absence_requests"
  | "change_requests"
  | "change_request_events"
  | "operational_audit_events";

export type CoverageTraceTone = "neutral" | "success" | "warning";

export type CoverageTraceItem = {
  blockId: string;
  detail: string;
  id: string;
  kind: CoverageTraceKind;
  occurredAt: string | null;
  source: CoverageTraceSource;
  title: string;
  tone: CoverageTraceTone;
};

export type CoverageTraceErrorCode =
  | "authentication-required"
  | "date-range-invalid"
  | "forbidden"
  | "invalid-input"
  | "invalid-limit"
  | "invalid-organization"
  | "invalid-schedule-block"
  | "load-failed"
  | "no-active-memberships"
  | "organization-not-found"
  | "organization-required";

export type CoverageTraceResult<T> =
  | {
      data: T;
      ok: true;
    }
  | {
      error: CoverageTraceErrorCode;
      ok: false;
    };

export type ListCoverageTraceItemsInput = {
  absenceImpacts?: readonly AbsenceScheduleImpactRow[] | null;
  limit?: number | null;
  organizationId: string;
  scheduleBlockIds: readonly string[];
  serviceDateFrom: string;
  serviceDateTo: string;
};

type ScheduleBlockReference = Pick<
  Tables<"schedule_blocks">,
  "id" | "template_block_id"
>;
type ScheduleAssignmentReference = Pick<
  Tables<"schedule_block_assignments">,
  "id" | "schedule_block_id"
>;
type ChangeRequestTraceRow = Pick<
  Tables<"change_requests">,
  | "applied_at"
  | "created_at"
  | "id"
  | "request_type"
  | "resolved_at"
  | "schedule_block_id"
  | "status"
>;
type ChangeRequestEventTraceRow = Pick<
  Tables<"change_request_events">,
  "change_request_id" | "created_at" | "event_type" | "result"
>;
type OperationalAuditEventRow = Tables<"operational_audit_events">;
type ValidationResult<T> =
  | {
      ok: true;
      value: T;
    }
  | {
      error: CoverageTraceErrorCode;
      ok: false;
    };

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_TRACE_LIMIT = 80;
const MAX_TRACE_BLOCKS = 500;
const MAX_TRACE_ITEMS = 200;
const MAX_TRACE_ITEMS_PER_BLOCK = 12;

const CHANGE_REQUEST_TYPE_LABELS: Record<string, string> = {
  coverage_request: "Solicitud de cobertura",
  direct_coverage_request: "Cobertura directa",
  offer_block: "Oferta de bloque",
  open_coverage_request: "Cobertura abierta",
  own_block_change: "Cambio propio",
};

const CHANGE_REQUEST_STATUS_LABELS: Record<string, string> = {
  accepted_by_coach: "aceptada por entrenador",
  applied: "aplicada",
  approved: "aprobada",
  cancelled: "cancelada",
  draft: "borrador",
  expired: "expirada",
  offered: "ofrecida",
  pending: "pendiente",
  pending_approval: "pendiente de aprobacion",
  rejected: "rechazada",
  rejected_by_coach: "rechazada por entrenador",
};

const AUDIT_ENTITY_LABELS: Record<string, string> = {
  schedule_block_assignments: "Asignacion",
  schedule_blocks: "Bloque",
  schedule_template_blocks: "Plantilla",
};

const AUDIT_ACTION_LABELS: Record<string, string> = {
  applied_to_week: "aplicada a semana",
  assigned: "asignada",
  cancelled: "cancelada",
  created: "creada",
  removed: "retirada",
  updated: "actualizada",
};

const AUDIT_FIELD_LABELS: Record<string, string> = {
  assignment_status: "estado de asignacion",
  center_id: "centro",
  class_type_id: "tipo",
  coach_profile_id: "entrenador",
  default_coach_profile_id: "entrenador por defecto",
  end_time: "fin",
  notes: "notas",
  required_coaches: "entrenadores necesarios",
  schedule_block_id: "bloque",
  service_date: "fecha",
  source: "origen",
  start_time: "inicio",
  status: "estado",
  template_block_id: "bloque de plantilla",
  template_id: "plantilla",
};

function success<T>(data: T): CoverageTraceResult<T> {
  return {
    data,
    ok: true,
  };
}

function failure(error: CoverageTraceErrorCode): CoverageTraceResult<never> {
  return {
    error,
    ok: false,
  };
}

function valid<T>(value: T): ValidationResult<T> {
  return {
    ok: true,
    value,
  };
}

function invalid(error: CoverageTraceErrorCode): ValidationResult<never> {
  return {
    error,
    ok: false,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeUuid(
  value: unknown,
  error: CoverageTraceErrorCode,
): ValidationResult<string> {
  if (typeof value !== "string") {
    return invalid(error);
  }

  const trimmed = value.trim();

  return isPostgresUuid(trimmed) ? valid(trimmed) : invalid(error);
}

function parseDateInput(value: unknown): ValidationResult<Date> {
  if (typeof value !== "string" || !DATE_PATTERN.test(value.trim())) {
    return invalid("date-range-invalid");
  }

  const [year, month, day] = value.trim().split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return invalid("date-range-invalid");
  }

  return valid(date);
}

function normalizeLimit(value: unknown): ValidationResult<number> {
  if (value === undefined || value === null) {
    return valid(DEFAULT_TRACE_LIMIT);
  }

  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > MAX_TRACE_ITEMS
  ) {
    return invalid("invalid-limit");
  }

  return valid(value);
}

function validateInput(
  input: ListCoverageTraceItemsInput,
): ValidationResult<{
  absenceImpacts?: readonly AbsenceScheduleImpactRow[] | null;
  limit: number;
  organizationId: string;
  scheduleBlockIds: string[];
  serviceDateFrom: string;
  serviceDateTo: string;
}> {
  if (!isRecord(input)) {
    return invalid("invalid-input");
  }

  const organizationId = normalizeUuid(
    input.organizationId,
    "invalid-organization",
  );

  if (!organizationId.ok) {
    return organizationId;
  }

  if (!Array.isArray(input.scheduleBlockIds)) {
    return invalid("invalid-input");
  }

  const scheduleBlockIds = new Set<string>();

  for (const scheduleBlockId of input.scheduleBlockIds) {
    const normalized = normalizeUuid(
      scheduleBlockId,
      "invalid-schedule-block",
    );

    if (!normalized.ok) {
      return normalized;
    }

    scheduleBlockIds.add(normalized.value);
  }

  if (scheduleBlockIds.size > MAX_TRACE_BLOCKS) {
    return invalid("invalid-input");
  }

  const serviceDateFrom = parseDateInput(input.serviceDateFrom);
  const serviceDateTo = parseDateInput(input.serviceDateTo);

  if (!serviceDateFrom.ok) {
    return serviceDateFrom;
  }

  if (!serviceDateTo.ok) {
    return serviceDateTo;
  }

  const dayMs = 24 * 60 * 60 * 1000;
  const rangeDays =
    (serviceDateTo.value.getTime() - serviceDateFrom.value.getTime()) / dayMs +
    1;

  if (rangeDays < 1 || rangeDays > 366) {
    return invalid("date-range-invalid");
  }

  const limit = normalizeLimit(input.limit);

  if (!limit.ok) {
    return limit;
  }

  return valid({
    absenceImpacts: input.absenceImpacts,
    limit: limit.value,
    organizationId: organizationId.value,
    scheduleBlockIds: [...scheduleBlockIds],
    serviceDateFrom: input.serviceDateFrom.trim(),
    serviceDateTo: input.serviceDateTo.trim(),
  });
}

function mapResolutionReason(
  reason: "no_active_memberships" | "organization_not_found" | "organization_required",
): CoverageTraceErrorCode {
  if (reason === "no_active_memberships") {
    return "no-active-memberships";
  }

  if (reason === "organization_not_found") {
    return "organization-not-found";
  }

  return "organization-required";
}

async function resolveCoverageTraceContext(organizationId: string) {
  const user = await getAuthenticatedUser();

  if (!user) {
    return failure("authentication-required");
  }

  const memberships = await getActiveMemberships(user.id);
  const resolution = resolveActiveOrganization(memberships, organizationId);

  if (!resolution.ok) {
    return failure(mapResolutionReason(resolution.reason));
  }

  if (!canManageOperationalData(resolution.membership.role)) {
    return failure("forbidden");
  }

  return success({
    organizationId: resolution.organization.id,
    supabase: await createClient(),
  });
}

function addTraceItem(
  itemsByBlock: Map<string, CoverageTraceItem[]>,
  item: CoverageTraceItem,
) {
  const items = itemsByBlock.get(item.blockId) ?? [];
  items.push(item);
  itemsByBlock.set(item.blockId, items);
}

function getChangeRequestTitle(request: ChangeRequestTraceRow) {
  return (
    CHANGE_REQUEST_TYPE_LABELS[request.request_type] ?? "Solicitud de cambio"
  );
}

function getChangeRequestDetail({
  eventCount,
  request,
}: {
  eventCount: number;
  request: ChangeRequestTraceRow;
}) {
  const statusLabel =
    CHANGE_REQUEST_STATUS_LABELS[request.status] ?? request.status;
  const eventSummary =
    eventCount > 0
      ? `${eventCount} evento${eventCount === 1 ? "" : "s"} reciente${
          eventCount === 1 ? "" : "s"
        }.`
      : "Sin eventos recientes visibles.";

  return `Estado ${statusLabel}. ${eventSummary} Motivo y datos sensibles no se muestran aquí.`;
}

function getChangedFieldNames(changedFields: Json) {
  if (
    !changedFields ||
    typeof changedFields !== "object" ||
    Array.isArray(changedFields)
  ) {
    return [];
  }

  return Object.keys(changedFields)
    .map((field) => AUDIT_FIELD_LABELS[field] ?? field)
    .slice(0, 6);
}

function hasChangedField(changedFields: Json, field: string) {
  return (
    Boolean(changedFields) &&
    typeof changedFields === "object" &&
    !Array.isArray(changedFields) &&
    Object.prototype.hasOwnProperty.call(changedFields, field)
  );
}

function formatAuditFieldList(fields: string[]) {
  if (fields.length <= 2) {
    return fields.join(" y ");
  }

  return `${fields.slice(0, -1).join(", ")} y ${fields[fields.length - 1]}`;
}

function getAuditTitle(event: OperationalAuditEventRow) {
  if (event.entity_type === "schedule_block_assignments") {
    if (event.action === "assigned") {
      return "Entrenador asignado";
    }

    if (event.action === "removed") {
      return "Entrenador retirado";
    }
  }

  if (
    event.action === "updated" &&
    hasChangedField(event.changed_fields, "default_coach_profile_id")
  ) {
    return "Entrenador por defecto actualizado";
  }

  const entityLabel =
    AUDIT_ENTITY_LABELS[event.entity_type] ?? "Elemento operativo";
  const actionLabel = AUDIT_ACTION_LABELS[event.action] ?? event.action;

  return `${entityLabel} ${actionLabel}`;
}

function getAuditDetail(event: OperationalAuditEventRow) {
  const fields = getChangedFieldNames(event.changed_fields);

  if (fields.length === 0) {
    return "Se guardo un cambio reciente.";
  }

  return `Cambio guardado: ${formatAuditFieldList(fields)}.`;
}

function getAuditBlockIds({
  assignmentBlockIds,
  event,
  templateBlockIds,
  validBlockIds,
}: {
  assignmentBlockIds: Map<string, string>;
  event: OperationalAuditEventRow;
  templateBlockIds: Map<string, string[]>;
  validBlockIds: Set<string>;
}) {
  if (event.entity_type === "schedule_blocks") {
    return validBlockIds.has(event.entity_id) ? [event.entity_id] : [];
  }

  if (event.entity_type === "schedule_block_assignments") {
    const blockId = assignmentBlockIds.get(event.entity_id);

    return blockId ? [blockId] : [];
  }

  if (event.entity_type === "schedule_template_blocks") {
    return templateBlockIds.get(event.entity_id) ?? [];
  }

  return [];
}

function getAbsenceImpactsForTrace({
  absenceImpacts,
  blockIds,
}: {
  absenceImpacts: readonly AbsenceScheduleImpactRow[];
  blockIds: Set<string>;
}) {
  const groups = new Map<
    string,
    {
      coverageNeeded: number;
      potential: number;
    }
  >();

  for (const impact of absenceImpacts) {
    if (!blockIds.has(impact.schedule_block_id)) {
      continue;
    }

    const group = groups.get(impact.schedule_block_id) ?? {
      coverageNeeded: 0,
      potential: 0,
    };

    if (impact.impact_status === "coverage_needed") {
      group.coverageNeeded += 1;
    }

    if (impact.impact_status === "potential") {
      group.potential += 1;
    }

    groups.set(impact.schedule_block_id, group);
  }

  return groups;
}

function addAbsenceTraceItems({
  absenceImpacts,
  itemsByBlock,
  validBlockIds,
}: {
  absenceImpacts: readonly AbsenceScheduleImpactRow[];
  itemsByBlock: Map<string, CoverageTraceItem[]>;
  validBlockIds: Set<string>;
}) {
  const absenceGroups = getAbsenceImpactsForTrace({
    absenceImpacts,
    blockIds: validBlockIds,
  });

  for (const [blockId, group] of absenceGroups) {
    if (group.coverageNeeded > 0) {
      addTraceItem(itemsByBlock, {
        blockId,
        detail: `${group.coverageNeeded} asignacion${
          group.coverageNeeded === 1 ? "" : "es"
        } calculada al vuelo. No modifica horario.`,
        id: `absence:${blockId}:coverage-needed`,
        kind: "absence_impact",
        occurredAt: null,
        source: "absence_requests",
        title: "Ausencia aprobada afecta cobertura",
        tone: "warning",
      });
    }

    if (group.potential > 0) {
      addTraceItem(itemsByBlock, {
        blockId,
        detail: `${group.potential} asignacion${
          group.potential === 1 ? "" : "es"
        } posible si la ausencia se aprueba. No modifica horario.`,
        id: `absence:${blockId}:potential`,
        kind: "absence_impact",
        occurredAt: null,
        source: "absence_requests",
        title: "Ausencia en revisión puede afectar cobertura",
        tone: "warning",
      });
    }
  }
}

export async function listCoverageTraceItems(
  input: ListCoverageTraceItemsInput,
): Promise<CoverageTraceResult<Map<string, CoverageTraceItem[]>>> {
  const validation = validateInput(input);

  if (!validation.ok) {
    return failure(validation.error);
  }

  if (validation.value.scheduleBlockIds.length === 0) {
    return success(new Map());
  }

  const context = await resolveCoverageTraceContext(
    validation.value.organizationId,
  );

  if (!context.ok) {
    return context;
  }

  const { supabase } = context.data;
  const { data: blocksData, error: blocksError } = await supabase
    .from("schedule_blocks")
    .select("id, template_block_id")
    .eq("organization_id", context.data.organizationId)
    .in("id", validation.value.scheduleBlockIds);

  if (blocksError) {
    return failure("load-failed");
  }

  const blocks = (blocksData ?? []) as ScheduleBlockReference[];
  const validBlockIds = new Set(blocks.map((block) => block.id));

  if (validBlockIds.size === 0) {
    return success(new Map());
  }

  const validBlockIdList = [...validBlockIds];
  const [
    assignmentsResult,
    changeRequestsResult,
    auditEventsResult,
  ] = await Promise.all([
    supabase
      .from("schedule_block_assignments")
      .select("id, schedule_block_id")
      .eq("organization_id", context.data.organizationId)
      .in("schedule_block_id", validBlockIdList),
    supabase
      .from("change_requests")
      .select(
        "id, schedule_block_id, request_type, status, created_at, resolved_at, applied_at",
      )
      .eq("organization_id", context.data.organizationId)
      .in("schedule_block_id", validBlockIdList)
      .order("created_at", { ascending: false })
      .limit(validation.value.limit),
    supabase.rpc("list_coverage_trace_audit_events", {
      target_limit: validation.value.limit,
      target_organization_id: context.data.organizationId,
      target_schedule_block_ids: validBlockIdList,
    }),
  ]);

  if (
    assignmentsResult.error ||
    changeRequestsResult.error ||
    auditEventsResult.error
  ) {
    return failure("load-failed");
  }

  const assignments =
    (assignmentsResult.data ?? []) as ScheduleAssignmentReference[];
  const changeRequests =
    (changeRequestsResult.data ?? []) as ChangeRequestTraceRow[];
  const auditEvents =
    (auditEventsResult.data ?? []) as OperationalAuditEventRow[];
  const requestIds = changeRequests.map((request) => request.id);
  const eventsResult =
    requestIds.length > 0
      ? await supabase
          .from("change_request_events")
          .select("change_request_id, event_type, result, created_at")
          .eq("organization_id", context.data.organizationId)
          .in("change_request_id", requestIds)
          .order("created_at", { ascending: true })
      : { data: [], error: null };

  if (eventsResult.error) {
    return failure("load-failed");
  }

  const changeEvents =
    (eventsResult.data ?? []) as ChangeRequestEventTraceRow[];
  const eventsByRequestId = new Map<string, ChangeRequestEventTraceRow[]>();

  for (const event of changeEvents) {
    const events = eventsByRequestId.get(event.change_request_id) ?? [];
    events.push(event);
    eventsByRequestId.set(event.change_request_id, events);
  }

  const absenceImpactResult =
    validation.value.absenceImpacts !== undefined &&
    validation.value.absenceImpacts !== null
      ? success(
          validation.value.absenceImpacts.filter((impact) =>
            validBlockIds.has(impact.schedule_block_id),
          ),
        )
      : await listOperationalAbsenceScheduleImpacts({
          limit: validation.value.limit,
          organizationId: context.data.organizationId,
          scheduleBlockIds: validBlockIdList,
          serviceDateFrom: validation.value.serviceDateFrom,
          serviceDateTo: validation.value.serviceDateTo,
        });

  if (!absenceImpactResult.ok) {
    return failure("load-failed");
  }

  const assignmentBlockIds = new Map(
    assignments.map((assignment) => [
      assignment.id,
      assignment.schedule_block_id,
    ]),
  );
  const templateBlockIds = new Map<string, string[]>();

  for (const block of blocks) {
    if (!block.template_block_id) {
      continue;
    }

    const blockIds = templateBlockIds.get(block.template_block_id) ?? [];
    blockIds.push(block.id);
    templateBlockIds.set(block.template_block_id, blockIds);
  }

  const itemsByBlock = new Map<string, CoverageTraceItem[]>();

  addAbsenceTraceItems({
    absenceImpacts: absenceImpactResult.data,
    itemsByBlock,
    validBlockIds,
  });

  for (const request of changeRequests) {
    if (!validBlockIds.has(request.schedule_block_id)) {
      continue;
    }

    const events = eventsByRequestId.get(request.id) ?? [];
    const occurredAt = request.applied_at ?? request.resolved_at ?? request.created_at;

    addTraceItem(itemsByBlock, {
      blockId: request.schedule_block_id,
      detail: getChangeRequestDetail({
        eventCount: events.length,
        request,
      }),
      id: `change:${request.id}`,
      kind: "change_request",
      occurredAt,
      source: events.length > 0 ? "change_request_events" : "change_requests",
      title: getChangeRequestTitle(request),
      tone: request.status === "applied" ? "success" : "neutral",
    });
  }

  for (const event of auditEvents) {
    const blockIds = getAuditBlockIds({
      assignmentBlockIds,
      event,
      templateBlockIds,
      validBlockIds,
    });

    for (const blockId of blockIds) {
      addTraceItem(itemsByBlock, {
        blockId,
        detail: getAuditDetail(event),
        id: `audit:${event.id}:${blockId}`,
        kind: "operational_audit",
        occurredAt: event.created_at,
        source: "operational_audit_events",
        title: getAuditTitle(event),
        tone: "neutral",
      });
    }
  }

  for (const [blockId, items] of itemsByBlock) {
    itemsByBlock.set(
      blockId,
      items
        .sort((left, right) => {
          const leftTime = left.occurredAt
            ? Date.parse(left.occurredAt)
            : 0;
          const rightTime = right.occurredAt
            ? Date.parse(right.occurredAt)
            : 0;

          return rightTime - leftTime;
        })
        .slice(0, MAX_TRACE_ITEMS_PER_BLOCK),
    );
  }

  return success(itemsByBlock);
}
