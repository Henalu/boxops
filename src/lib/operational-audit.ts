import { createClient } from "@/lib/supabase/server";
import type { Json, Tables } from "@/types/supabase";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type OperationalAuditEntityType =
  | "team_invitations"
  | "organization_memberships"
  | "person_profiles"
  | "coach_profiles"
  | "schedule_blocks"
  | "schedule_block_assignments"
  | "schedule_templates"
  | "schedule_template_blocks";

export type OperationalAuditAction =
  | "created"
  | "updated"
  | "cancelled"
  | "accepted"
  | "resent"
  | "linked_account"
  | "assigned"
  | "removed"
  | "archived"
  | "restored"
  | "applied_to_week";

export type OperationalAuditChangedFields = Record<string, Json>;

type AuditableScalar = string | number | boolean | null;

export function auditFieldSet(value: AuditableScalar): Json {
  return {
    to: value,
  };
}

export function auditFieldChange(
  from: AuditableScalar,
  to: AuditableScalar,
): Json {
  return {
    from,
    to,
  };
}

export function auditFieldTouched(): Json {
  return {
    changed: true,
  };
}

export function addAuditFieldChange(
  changedFields: OperationalAuditChangedFields,
  field: string,
  from: AuditableScalar | undefined,
  to: AuditableScalar | undefined,
) {
  const normalizedFrom = from ?? null;
  const normalizedTo = to ?? null;

  if (normalizedFrom === normalizedTo) {
    return;
  }

  changedFields[field] = auditFieldChange(normalizedFrom, normalizedTo);
}

export async function recordOperationalAuditEvent({
  action,
  changedFields,
  entityId,
  entityType,
  organizationId,
  result = "success",
  supabase,
}: {
  action: OperationalAuditAction;
  changedFields?: OperationalAuditChangedFields;
  entityId: string;
  entityType: OperationalAuditEntityType;
  organizationId: string;
  result?: "success" | "failed" | "denied";
  supabase: SupabaseServerClient;
}) {
  const { error } = await supabase.rpc("record_operational_audit_event", {
    target_action: action,
    target_changed_fields: changedFields ?? {},
    target_entity_id: entityId,
    target_entity_type: entityType,
    target_organization_id: organizationId,
    target_result: result,
  });

  return !error;
}

export async function listOperationalAuditEvents({
  entityType,
  limit = 100,
  organizationId,
}: {
  entityType?: OperationalAuditEntityType | null;
  limit?: number;
  organizationId: string;
}) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_operational_audit_events", {
    target_entity_type: entityType ?? undefined,
    target_limit: limit,
    target_organization_id: organizationId,
  });

  if (error) {
    throw new Error(`Could not load operational audit events: ${error.message}`);
  }

  return data satisfies Tables<"operational_audit_events">[];
}
