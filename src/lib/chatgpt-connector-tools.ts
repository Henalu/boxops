import { createHash, randomBytes, randomUUID } from "node:crypto";

import { getActiveMemberships, getAuthenticatedUser, resolveActiveOrganization } from "@/lib/auth/tenant";
import {
  createChatGptConnectorSupabaseClient,
  getActiveChatGptConnectorBearerContext,
} from "@/lib/chatgpt-connector-auth";
import {
  CHATGPT_CONNECTOR_MAX_TEMPLATE_PREVIEW_RANGE_DAYS,
  buildChatGptConnectorScheduleTemplateApplicationPlan,
  buildChatGptConnectorScheduleTemplateApplicationPlanSnapshot,
  buildChatGptConnectorScheduleBlockSummaries,
  buildChatGptConnectorScheduleTemplateDraftBlocks,
  buildChatGptConnectorScheduleTemplatePreview,
  createChatGptConnectorConfirmationToken,
  createChatGptConnectorError,
  createChatGptConnectorRequestId,
  createChatGptConnectorStablePayloadHash,
  createChatGptConnectorSuccess,
  filterChatGptConnectorScheduleBlocksAtTime,
  getChatGptConnectorAccessError,
  getChatGptConnectorSensitiveScopeViolation,
  matchesChatGptConnectorScheduleStatus,
  normalizeChatGptConnectorDate,
  normalizeChatGptConnectorDateRange,
  normalizeChatGptConnectorTime,
  parseChatGptConnectorConfirmationToken,
  resolveChatGptConnectorCenterReference,
  resolveChatGptConnectorClassTypeReference,
  resolveChatGptConnectorOwnCoach,
  type ChatGptConnectorAssignmentRow,
  type ChatGptConnectorCenterReferenceInput,
  type ChatGptConnectorCenterRow,
  type ChatGptConnectorClassTypeReferenceInput,
  type ChatGptConnectorClassTypeRow,
  type ChatGptConnectorCoachProfileRow,
  type ChatGptConnectorErrorCode,
  type ChatGptConnectorMembershipStatusRow,
  type ChatGptConnectorOrganizationInput,
  type ChatGptConnectorPersonProfileRow,
  type ChatGptConnectorScheduleAtTimeMatchMode,
  type ChatGptConnectorScheduleBlockRow,
  type ChatGptConnectorScheduleStatusFilter,
  type ChatGptConnectorScheduleTemplateApplicationBlock,
  type ChatGptConnectorScheduleTemplateApplicationPlan,
  type ChatGptConnectorScheduleTemplateApplicationTemplate,
  type ChatGptConnectorScheduleTemplateDraftBlock,
  type ChatGptConnectorScheduleTemplatePreviewOutput,
  type ChatGptConnectorScheduleTemplatePreviewRuleInput,
  type ChatGptConnectorTemplatePreviewCoachSummary,
  type ChatGptConnectorToolResponse,
} from "@/lib/chatgpt-connector-core";
import { createClient } from "@/lib/supabase/server";
import { isPostgresUuid } from "@/lib/uuid";
import type { Json } from "@/types/supabase";

const CONNECTOR_BLOCK_ID_BATCH_SIZE = 100;
const CONNECTOR_CONFIRMATION_TOKEN_TTL_MINUTES = 15;
const SCHEDULE_STATUS_FILTERS = ["active", "all", "cancelled", "draft"] as const;
const SCHEDULE_AT_TIME_MATCH_MODES = ["overlapping", "starting_at"] as const;
const APPLY_SCHEDULE_TEMPLATE_RPC_ERROR_CODES = new Set<ChatGptConnectorErrorCode>([
  "authentication_required",
  "center_not_found",
  "confirmation_mismatch",
  "idempotency_conflict",
  "permission_denied",
  "template_not_applicable",
]);

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type ConnectorContext = {
  organization: {
    id: string;
    timezone: string;
  };
  supabase: SupabaseServerClient;
  user: {
    id: string;
  };
};

type ConnectorContextResult =
  | {
      context: ConnectorContext;
      ok: true;
    }
  | {
      ok: false;
      response: ChatGptConnectorToolResponse<never>;
    };

type ConnectorConfirmationRow = {
  actor_user_id: string;
  audit_event_id: string | null;
  center_id: string;
  created_assignment_count: number;
  created_block_count: number;
  date_from: string;
  date_to: string;
  expires_at: string;
  id: string;
  idempotency_key_hash: string;
  organization_id: string;
  plan_hash: string;
  skipped_duplicate_count: number;
  status: string;
  template_id: string;
  token_hash: string;
  tool: string;
};

export type ListCentersInput = ChatGptConnectorOrganizationInput & {
  include_inactive?: boolean | null;
};

export type ListCentersOutput = {
  centers: Array<{
    center_id: string;
    name: string;
    status: string;
    timezone: string;
  }>;
};

export type ListClassTypesInput = ChatGptConnectorOrganizationInput &
  ChatGptConnectorCenterReferenceInput & {
    include_inactive?: boolean | null;
  };

export type ListClassTypesOutput = {
  class_types: Array<{
    class_type_id: string;
    default_duration_minutes: number | null;
    name: string;
    status: string;
  }>;
};

export type GetScheduleForDayInput = ChatGptConnectorOrganizationInput &
  ChatGptConnectorCenterReferenceInput &
  ChatGptConnectorClassTypeReferenceInput & {
    date: string;
    status?: ChatGptConnectorScheduleStatusFilter | null;
  };

export type GetScheduleForDayOutput = {
  blocks: ReturnType<typeof buildChatGptConnectorScheduleBlockSummaries>;
  date: string;
  timezone: string;
};

export type GetScheduleAtTimeInput = ChatGptConnectorOrganizationInput &
  ChatGptConnectorCenterReferenceInput &
  ChatGptConnectorClassTypeReferenceInput & {
    date: string;
    empty_result_mode?: "empty" | "error" | null;
    match_mode?: ChatGptConnectorScheduleAtTimeMatchMode | null;
    time: string;
  };

export type GetScheduleAtTimeOutput = {
  date: string;
  matches: ReturnType<typeof buildChatGptConnectorScheduleBlockSummaries>;
  time: string;
};

export type GetMyScheduleInput = ChatGptConnectorOrganizationInput &
  ChatGptConnectorCenterReferenceInput & {
    date_from: string;
    date_to: string;
  };

export type GetMyScheduleOutput = {
  blocks: Array<
    Omit<
      ReturnType<typeof buildChatGptConnectorScheduleBlockSummaries>[number],
      "coaches"
    > & {
      assignment_status: string;
      date: string;
    }
  >;
  display_name: string;
  person_id: string;
};

export type PreviewScheduleTemplateInput = ChatGptConnectorOrganizationInput & {
  center_id: string;
  date_from: string;
  date_to: string;
  name: string;
  rules: ChatGptConnectorScheduleTemplatePreviewRuleInput[];
};

export type PreviewScheduleTemplateOutput =
  ChatGptConnectorScheduleTemplatePreviewOutput;

export type CreateScheduleTemplateDraftInput =
  ChatGptConnectorOrganizationInput & {
    center_id: string;
    date_from: string;
    date_to: string;
    idempotency_key: string;
    name: string;
    preview_id: string;
    rules: ChatGptConnectorScheduleTemplatePreviewRuleInput[];
  };

export type CreateScheduleTemplateDraftOutput = {
  created_by_source: "chatgpt_connector";
  idempotent_replay?: boolean;
  name: string;
  preview_id: string;
  status: "draft";
  template_block_count: number;
  template_id: string;
  total_blocks: number;
};

export type PrepareScheduleTemplateApplicationInput =
  ChatGptConnectorOrganizationInput & {
    center_id: string;
    date_from: string;
    date_to: string;
    idempotency_key: string;
    template_id: string;
  };

export type PrepareScheduleTemplateApplicationOutput = {
  center: {
    center_id: string;
    name: string;
    timezone: string;
  };
  confirmation_expires_at: string;
  confirmation_required: true;
  confirmation_token: string;
  idempotency_key_hash: string;
  plan: ChatGptConnectorScheduleTemplateApplicationPlan;
  template: {
    name: string;
    status: string;
    template_id: string;
    template_type: "weekly";
  };
};

export type ApplyScheduleTemplateInput = ChatGptConnectorOrganizationInput & {
  center_id: string;
  confirmation_token: string;
  date_from: string;
  date_to: string;
  idempotency_key: string;
  template_id: string;
};

export type ApplyScheduleTemplateOutput = {
  applied: true;
  audit_event_id: string;
  created_assignments: number;
  created_blocks: number;
  idempotent_replay?: boolean;
  skipped_duplicates: number;
  template_id: string;
};

type ConnectorJsonObject = { [key: string]: Json };

function createInternalError(requestId: string) {
  return createChatGptConnectorError({
    code: "internal_error",
    requestId,
  });
}

function normalizeNullableString(value: string | null | undefined) {
  if (!value || value === "null") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed && trimmed !== "null" ? trimmed : null;
}

function normalizeScheduleStatusFilter(
  value: ChatGptConnectorScheduleStatusFilter | null | undefined,
) {
  if (!value) {
    return "active" satisfies ChatGptConnectorScheduleStatusFilter;
  }

  return SCHEDULE_STATUS_FILTERS.includes(value) ? value : null;
}

function normalizeMatchMode(
  value: ChatGptConnectorScheduleAtTimeMatchMode | null | undefined,
) {
  if (!value) {
    return "overlapping" satisfies ChatGptConnectorScheduleAtTimeMatchMode;
  }

  return SCHEDULE_AT_TIME_MATCH_MODES.includes(value) ? value : null;
}

function normalizeTemplateDraftName(name: string | null | undefined) {
  const normalizedName = name?.trim().replace(/\s+/g, " ") ?? "";

  if (!normalizedName) {
    return "Untitled preview";
  }

  return normalizedName.length > 120
    ? normalizedName.slice(0, 120)
    : normalizedName;
}

function normalizeIdempotencyKey(value: string | null | undefined) {
  const normalizedValue = value?.trim() ?? "";

  if (!normalizedValue || normalizedValue.length > 200) {
    return null;
  }

  return normalizedValue;
}

function hashConnectorIdempotencyKey(value: string) {
  return createHash("sha256")
    .update(`chatgpt_connector:idempotency:${value}`, "utf8")
    .digest("hex");
}

function createConnectorConfirmationSecret() {
  return randomBytes(32).toString("base64url");
}

function hashConnectorConfirmationTokenSecret({
  confirmationId,
  tokenSecret,
}: {
  confirmationId: string;
  tokenSecret: string;
}) {
  return createHash("sha256")
    .update(
      `chatgpt_connector:confirmation:${confirmationId}:${tokenSecret}`,
      "utf8",
    )
    .digest("hex");
}

function getJsonRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getJsonString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function getJsonNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function chunkValues<T>(values: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}

async function getConnectorContext({
  organizationId,
  requestId,
  requireOperationalManagement = false,
  requirePersonalAccess = false,
}: {
  organizationId?: string | null;
  requestId: string;
  requireOperationalManagement?: boolean;
  requirePersonalAccess?: boolean;
}): Promise<ConnectorContextResult> {
  const bearerContext = getActiveChatGptConnectorBearerContext();

  if (bearerContext) {
    try {
      if (organizationId && organizationId !== bearerContext.organizationId) {
        return {
          ok: false,
          response: createChatGptConnectorError({
            code: "permission_denied",
            requestId,
          }),
        };
      }

      const supabase = createChatGptConnectorSupabaseClient(
        bearerContext.supabaseAccessToken,
      ) as SupabaseServerClient;
      const [
        membershipResult,
        organizationResult,
      ] = await Promise.all([
        supabase
          .from("organization_memberships")
          .select("id, organization_id, user_id, role, status")
          .eq("id", bearerContext.membershipId)
          .eq("organization_id", bearerContext.organizationId)
          .eq("user_id", bearerContext.userId)
          .eq("status", "active")
          .maybeSingle(),
        supabase
          .from("organizations")
          .select("id, timezone, status")
          .eq("id", bearerContext.organizationId)
          .in("status", ["trialing", "active"])
          .maybeSingle(),
      ]);

      if (membershipResult.error || organizationResult.error) {
        return {
          ok: false,
          response: createInternalError(requestId),
        };
      }

      const membership = membershipResult.data;
      const organization = organizationResult.data;
      const accessError = getChatGptConnectorAccessError({
        accessMode: "membership",
        authenticated: true,
        requireOperationalManagement,
        requirePersonalAccess,
        resolutionOk: Boolean(membership && organization),
        resolutionReason: membership && organization ? null : "organization_not_found",
        role: membership?.role ?? null,
      });

      if (accessError) {
        return {
          ok: false,
          response: createChatGptConnectorError({
            code: accessError,
            requestId,
          }),
        };
      }

      if (!membership || !organization) {
        return {
          ok: false,
          response: createChatGptConnectorError({
            code: "permission_denied",
            requestId,
          }),
        };
      }

      return {
        context: {
          organization: {
            id: organization.id,
            timezone: organization.timezone,
          },
          supabase,
          user: {
            id: bearerContext.userId,
          },
        },
        ok: true,
      };
    } catch {
      return {
        ok: false,
        response: createInternalError(requestId),
      };
    }
  }

  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return {
        ok: false,
        response: createChatGptConnectorError({
          code: "authentication_required",
          requestId,
        }),
      };
    }

    const memberships = await getActiveMemberships(user.id);
    const resolution = resolveActiveOrganization(
      memberships,
      organizationId ?? null,
    );
    const accessError = getChatGptConnectorAccessError({
      accessMode: resolution.ok ? resolution.membership.accessMode : null,
      authenticated: true,
      requireOperationalManagement,
      requirePersonalAccess,
      resolutionOk: resolution.ok,
      resolutionReason: resolution.ok ? null : resolution.reason,
      role: resolution.ok ? resolution.membership.role : null,
    });

    if (accessError) {
      return {
        ok: false,
        response: createChatGptConnectorError({
          code: accessError,
          details:
            accessError === "organization_required"
              ? {
                  organizations: resolution.ok
                    ? []
                    : resolution.memberships.map((membership) => ({
                        name: membership.organization.name,
                        organization_id: membership.organization_id,
                      })),
                }
              : {},
          requestId,
        }),
      };
    }

    if (!resolution.ok) {
      return {
        ok: false,
        response: createChatGptConnectorError({
          code: "permission_denied",
          requestId,
        }),
      };
    }

    return {
      context: {
        organization: {
          id: resolution.organization.id,
          timezone: resolution.organization.timezone,
        },
        supabase: await createClient(),
        user: {
          id: user.id,
        },
      },
      ok: true,
    };
  } catch {
    return {
      ok: false,
      response: createInternalError(requestId),
    };
  }
}

function guardSensitiveScope({
  input,
  requestId,
}: {
  input: ChatGptConnectorOrganizationInput;
  requestId: string;
}) {
  const violation = getChatGptConnectorSensitiveScopeViolation(input);

  return violation
    ? createChatGptConnectorError({
        code: "sensitive_scope_not_allowed",
        details: { reason: violation },
        requestId,
      })
    : null;
}

async function loadCenters({
  organizationId,
  supabase,
}: {
  organizationId: string;
  supabase: SupabaseServerClient;
}) {
  const { data, error } = await supabase
    .from("centers")
    .select("id, name, status, timezone")
    .eq("organization_id", organizationId)
    .order("status", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    throw new Error("Could not load centers.");
  }

  return (data ?? []) satisfies ChatGptConnectorCenterRow[];
}

async function loadClassTypes({
  organizationId,
  supabase,
}: {
  organizationId: string;
  supabase: SupabaseServerClient;
}) {
  const { data, error } = await supabase
    .from("class_types")
    .select("id, name, required_coaches, certification_id, status")
    .eq("organization_id", organizationId)
    .order("status", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    throw new Error("Could not load class types.");
  }

  return (data ?? []) satisfies ChatGptConnectorClassTypeRow[];
}

async function loadScheduleBlocks({
  centerId,
  dateFrom,
  dateTo,
  organizationId,
  supabase,
}: {
  centerId?: string | null;
  dateFrom: string;
  dateTo: string;
  organizationId: string;
  supabase: SupabaseServerClient;
}) {
  let query = supabase
    .from("schedule_blocks")
    .select(
      "id, center_id, class_type_id, service_date, start_time, end_time, required_coaches, status, template_id, template_block_id, is_template_exception",
    )
    .eq("organization_id", organizationId)
    .gte("service_date", dateFrom)
    .lte("service_date", dateTo)
    .order("service_date", { ascending: true })
    .order("start_time", { ascending: true });

  if (centerId) {
    query = query.eq("center_id", centerId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error("Could not load schedule blocks.");
  }

  return (data ?? []) satisfies ChatGptConnectorScheduleBlockRow[];
}

async function loadAssignmentsForBlocks({
  blockIds,
  organizationId,
  supabase,
}: {
  blockIds: string[];
  organizationId: string;
  supabase: SupabaseServerClient;
}) {
  const uniqueBlockIds = [...new Set(blockIds)];

  if (uniqueBlockIds.length === 0) {
    return [];
  }

  const results = await Promise.all(
    chunkValues(uniqueBlockIds, CONNECTOR_BLOCK_ID_BATCH_SIZE).map((batch) =>
      supabase
        .from("schedule_block_assignments")
        .select("id, schedule_block_id, coach_profile_id, assignment_status")
        .eq("organization_id", organizationId)
        .in("schedule_block_id", batch),
    ),
  );
  const failedResult = results.find((result) => result.error);

  if (failedResult?.error) {
    throw new Error("Could not load schedule assignments.");
  }

  return results.flatMap((result) => result.data ?? []) satisfies ChatGptConnectorAssignmentRow[];
}

async function loadCoachContextForAssignments({
  assignments,
  organizationId,
  supabase,
}: {
  assignments: ChatGptConnectorAssignmentRow[];
  organizationId: string;
  supabase: SupabaseServerClient;
}) {
  const coachIds = [
    ...new Set(assignments.map((assignment) => assignment.coach_profile_id)),
  ];

  if (coachIds.length === 0) {
    return {
      coachProfiles: [],
      memberships: [],
      personProfiles: [],
    };
  }

  const { data: coachProfiles, error: coachProfilesError } = await supabase
    .from("coach_profiles")
    .select("id, user_id, person_profile_id, status")
    .eq("organization_id", organizationId)
    .in("id", coachIds);

  if (coachProfilesError) {
    throw new Error("Could not load coach profiles.");
  }

  const typedCoachProfiles =
    (coachProfiles ?? []) satisfies ChatGptConnectorCoachProfileRow[];
  const personProfileIds = [
    ...new Set(
      typedCoachProfiles.flatMap((coachProfile) =>
        coachProfile.person_profile_id ? [coachProfile.person_profile_id] : [],
      ),
    ),
  ];
  const userIds = [
    ...new Set(
      typedCoachProfiles.flatMap((coachProfile) =>
        coachProfile.user_id ? [coachProfile.user_id] : [],
      ),
    ),
  ];
  const [linkedPersonProfilesResult, userPersonProfilesResult, membershipsResult] =
    await Promise.all([
      personProfileIds.length > 0
        ? supabase
            .from("person_profiles")
            .select("id, user_id, display_name, status, visibility_status")
            .eq("organization_id", organizationId)
            .in("id", personProfileIds)
        : Promise.resolve({ data: [], error: null }),
      userIds.length > 0
        ? supabase
            .from("person_profiles")
            .select("id, user_id, display_name, status, visibility_status")
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

  if (
    linkedPersonProfilesResult.error ||
    userPersonProfilesResult.error ||
    membershipsResult.error
  ) {
    throw new Error("Could not load coach identity context.");
  }

  const personProfilesById = new Map(
    [
      ...((linkedPersonProfilesResult.data ?? []) satisfies ChatGptConnectorPersonProfileRow[]),
      ...((userPersonProfilesResult.data ?? []) satisfies ChatGptConnectorPersonProfileRow[]),
    ].map((personProfile) => [personProfile.id, personProfile]),
  );

  return {
    coachProfiles: typedCoachProfiles,
    memberships:
      (membershipsResult.data ?? []) satisfies ChatGptConnectorMembershipStatusRow[],
    personProfiles: [...personProfilesById.values()],
  };
}

function getPreviewRuleCoachIds(
  rules: ChatGptConnectorScheduleTemplatePreviewRuleInput[],
) {
  return [
    ...new Set(
      rules.flatMap((rule) =>
        Array.isArray(rule.coach_ids) ? rule.coach_ids : [],
      ),
    ),
  ];
}

async function loadCoachSummariesForPreview({
  coachIds,
  organizationId,
  supabase,
}: {
  coachIds: string[];
  organizationId: string;
  supabase: SupabaseServerClient;
}): Promise<
  | {
      coachSummaries: ChatGptConnectorTemplatePreviewCoachSummary[];
      ok: true;
    }
  | {
      details: Record<string, unknown>;
      ok: false;
    }
> {
  const uniqueCoachIds = [...new Set(coachIds)];

  if (uniqueCoachIds.length === 0) {
    return {
      coachSummaries: [],
      ok: true,
    };
  }

  const invalidCoachIds = uniqueCoachIds.filter(
    (coachId) => !isPostgresUuid(coachId),
  );

  if (invalidCoachIds.length > 0) {
    return {
      details: { coach_ids: invalidCoachIds, reason: "invalid_coach_id" },
      ok: false,
    };
  }

  const { data: coachProfiles, error: coachProfilesError } = await supabase
    .from("coach_profiles")
    .select("id, user_id, person_profile_id, status")
    .eq("organization_id", organizationId)
    .in("id", uniqueCoachIds);

  if (coachProfilesError) {
    throw new Error("Could not load preview coach profiles.");
  }

  const typedCoachProfiles =
    (coachProfiles ?? []) satisfies ChatGptConnectorCoachProfileRow[];
  const coachProfilesById = new Map(
    typedCoachProfiles.map((coachProfile) => [coachProfile.id, coachProfile]),
  );
  const personProfileIds = [
    ...new Set(
      typedCoachProfiles.flatMap((coachProfile) =>
        coachProfile.person_profile_id ? [coachProfile.person_profile_id] : [],
      ),
    ),
  ];
  const userIds = [
    ...new Set(
      typedCoachProfiles.flatMap((coachProfile) =>
        coachProfile.user_id ? [coachProfile.user_id] : [],
      ),
    ),
  ];
  const [linkedPersonProfilesResult, userPersonProfilesResult, membershipsResult] =
    await Promise.all([
      personProfileIds.length > 0
        ? supabase
            .from("person_profiles")
            .select("id, user_id, display_name, status, visibility_status")
            .eq("organization_id", organizationId)
            .in("id", personProfileIds)
        : Promise.resolve({ data: [], error: null }),
      userIds.length > 0
        ? supabase
            .from("person_profiles")
            .select("id, user_id, display_name, status, visibility_status")
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

  if (
    linkedPersonProfilesResult.error ||
    userPersonProfilesResult.error ||
    membershipsResult.error
  ) {
    throw new Error("Could not load preview coach identity context.");
  }

  const personProfilesById = new Map(
    [
      ...((linkedPersonProfilesResult.data ?? []) satisfies ChatGptConnectorPersonProfileRow[]),
      ...((userPersonProfilesResult.data ?? []) satisfies ChatGptConnectorPersonProfileRow[]),
    ].map((personProfile) => [personProfile.id, personProfile]),
  );
  const personProfilesByUserId = new Map(
    [...personProfilesById.values()].flatMap((personProfile) =>
      personProfile.user_id
        ? [[personProfile.user_id, personProfile] as const]
        : [],
    ),
  );
  const membershipsByUserId = new Map(
    ((membershipsResult.data ?? []) satisfies ChatGptConnectorMembershipStatusRow[]).map(
      (membership) => [membership.user_id, membership],
    ),
  );
  const invalidAssignableCoachIds = uniqueCoachIds.filter((coachId) => {
    const coachProfile = coachProfilesById.get(coachId);

    if (!coachProfile || coachProfile.status !== "active") {
      return true;
    }

    if (!coachProfile.user_id && !coachProfile.person_profile_id) {
      return true;
    }

    if (coachProfile.person_profile_id) {
      const personProfile = personProfilesById.get(coachProfile.person_profile_id);

      if (
        !personProfile ||
        personProfile.status !== "active" ||
        personProfile.visibility_status !== "visible"
      ) {
        return true;
      }
    }

    if (coachProfile.user_id) {
      const membership = membershipsByUserId.get(coachProfile.user_id);

      if (!membership || membership.status !== "active") {
        return true;
      }
    }

    return false;
  });

  if (invalidAssignableCoachIds.length > 0) {
    return {
      details: {
        coach_ids: invalidAssignableCoachIds,
        reason: "coach_not_assignable",
      },
      ok: false,
    };
  }

  return {
    coachSummaries: uniqueCoachIds.map((coachId) => {
      const coachProfile = coachProfilesById.get(coachId);
      const personProfile = coachProfile?.person_profile_id
        ? personProfilesById.get(coachProfile.person_profile_id)
        : coachProfile?.user_id
          ? personProfilesByUserId.get(coachProfile.user_id)
          : undefined;

      return {
        coach_id: coachId,
        display_name: personProfile?.display_name.trim() || null,
      };
    }),
    ok: true,
  };
}

async function getPreviewCertificationWarnings({
  classTypes,
  coachIds,
  organizationId,
  rules,
  supabase,
}: {
  classTypes: ChatGptConnectorClassTypeRow[];
  coachIds: string[];
  organizationId: string;
  rules: ChatGptConnectorScheduleTemplatePreviewRuleInput[];
  supabase: SupabaseServerClient;
}) {
  if (coachIds.length === 0) {
    return [];
  }

  const classTypesById = new Map(
    classTypes.map((classType) => [classType.id, classType]),
  );
  const requiredCertificationIds = [
    ...new Set(
      rules.flatMap((rule) => {
        const certificationId = classTypesById.get(rule.class_type_id)?.certification_id;

        return certificationId ? [certificationId] : [];
      }),
    ),
  ];

  if (requiredCertificationIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("coach_certifications")
    .select("coach_profile_id, certification_id, status")
    .eq("organization_id", organizationId)
    .in("coach_profile_id", coachIds)
    .in("certification_id", requiredCertificationIds);

  if (error) {
    throw new Error("Could not load preview coach certifications.");
  }

  const activeCertificationKeys = new Set(
    (data ?? [])
      .filter((certification) => certification.status === "active")
      .map(
        (certification) =>
          `${certification.coach_profile_id}:${certification.certification_id}`,
      ),
  );
  const warnings = new Set<string>();

  for (const rule of rules) {
    const classType = classTypesById.get(rule.class_type_id);

    if (!classType?.certification_id || !Array.isArray(rule.coach_ids)) {
      continue;
    }

    for (const coachId of rule.coach_ids) {
      if (
        !activeCertificationKeys.has(`${coachId}:${classType.certification_id}`)
      ) {
        warnings.add(`coach_missing_certification:${coachId}:${classType.id}`);
      }
    }
  }

  return [...warnings];
}

async function loadOwnCoachContext({
  organizationId,
  supabase,
  userId,
}: {
  organizationId: string;
  supabase: SupabaseServerClient;
  userId: string;
}) {
  const { data: personProfiles, error: personProfilesError } = await supabase
    .from("person_profiles")
    .select("id, user_id, display_name, status, visibility_status")
    .eq("organization_id", organizationId)
    .eq("user_id", userId);

  if (personProfilesError) {
    throw new Error("Could not load own person profiles.");
  }

  const typedPersonProfiles =
    (personProfiles ?? []) satisfies ChatGptConnectorPersonProfileRow[];
  const personProfileIds = typedPersonProfiles.map(
    (personProfile) => personProfile.id,
  );
  const [personLinkedResult, userLinkedResult] = await Promise.all([
    personProfileIds.length > 0
      ? supabase
          .from("coach_profiles")
          .select("id, user_id, person_profile_id, status")
          .eq("organization_id", organizationId)
          .in("person_profile_id", personProfileIds)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("coach_profiles")
      .select("id, user_id, person_profile_id, status")
      .eq("organization_id", organizationId)
      .eq("user_id", userId),
  ]);

  if (personLinkedResult.error || userLinkedResult.error) {
    throw new Error("Could not load own coach profiles.");
  }

  const coachProfilesById = new Map<string, ChatGptConnectorCoachProfileRow>();

  for (const coachProfile of [
    ...((personLinkedResult.data ?? []) satisfies ChatGptConnectorCoachProfileRow[]),
    ...((userLinkedResult.data ?? []) satisfies ChatGptConnectorCoachProfileRow[]),
  ]) {
    coachProfilesById.set(coachProfile.id, coachProfile);
  }

  return resolveChatGptConnectorOwnCoach({
    coachProfiles: [...coachProfilesById.values()],
    personProfiles: typedPersonProfiles,
    userId,
  });
}

function toScheduleBlockIds(blocks: ChatGptConnectorScheduleBlockRow[]) {
  return blocks.map((block) => block.id);
}

function filterBlocks({
  blocks,
  classTypeId,
  statusFilter,
}: {
  blocks: ChatGptConnectorScheduleBlockRow[];
  classTypeId?: string | null;
  statusFilter: ChatGptConnectorScheduleStatusFilter;
}) {
  return blocks.filter(
    (block) =>
      matchesChatGptConnectorScheduleStatus({
        blockStatus: block.status,
        filter: statusFilter,
      }) && (!classTypeId || block.class_type_id === classTypeId),
  );
}

function getScheduleTimezone({
  center,
  organizationTimezone,
}: {
  center: ChatGptConnectorCenterRow | null;
  organizationTimezone: string;
}) {
  return center?.timezone ?? organizationTimezone;
}

function buildTemplateDraftPayloadHash({
  centerId,
  dateFrom,
  dateTo,
  name,
  preview,
  templateBlockCount,
}: {
  centerId: string;
  dateFrom: string;
  dateTo: string;
  name: string;
  preview: ChatGptConnectorScheduleTemplatePreviewOutput;
  templateBlockCount: number;
}) {
  return createChatGptConnectorStablePayloadHash({
    center_id: centerId,
    date_from: dateFrom,
    date_to: dateTo,
    name,
    preview_id: preview.preview_id,
    template_block_count: templateBlockCount,
    total_blocks: preview.summary.total_blocks,
  });
}

function buildTemplateDraftMetadata({
  idempotencyKeyHash,
  payloadHash,
  preview,
  templateBlockCount,
}: {
  idempotencyKeyHash: string;
  payloadHash: string;
  preview: ChatGptConnectorScheduleTemplatePreviewOutput;
  templateBlockCount: number;
}): ConnectorJsonObject {
  return {
    created_by_source: "chatgpt_connector",
    idempotency_key_hash: idempotencyKeyHash,
    payload_hash: payloadHash,
    preview_id: preview.preview_id,
    source: "chatgpt_connector",
    template_block_count: templateBlockCount,
    total_blocks: preview.summary.total_blocks,
  };
}

function getTemplateDraftBlockMetadata({
  block,
  previewId,
}: {
  block: ChatGptConnectorScheduleTemplateDraftBlock;
  previewId: string;
}): ConnectorJsonObject {
  return {
    preview_id: previewId,
    rule_index: block.metadata.rule_index,
    source: "chatgpt_connector",
  };
}

async function loadExistingDraftByIdempotencyKey({
  idempotencyKeyHash,
  organizationId,
  supabase,
}: {
  idempotencyKeyHash: string;
  organizationId: string;
  supabase: SupabaseServerClient;
}) {
  const { data, error } = await supabase
    .from("schedule_templates")
    .select("id, name, status, metadata")
    .eq("organization_id", organizationId)
    .contains("metadata", {
      idempotency_key_hash: idempotencyKeyHash,
      source: "chatgpt_connector",
    })
    .order("created_at", { ascending: true })
    .limit(2);

  if (error) {
    throw new Error("Could not load idempotent schedule template draft.");
  }

  return data ?? [];
}

async function loadScheduleTemplateForPreparation({
  organizationId,
  supabase,
  templateId,
}: {
  organizationId: string;
  supabase: SupabaseServerClient;
  templateId: string;
}) {
  const { data, error } = await supabase
    .from("schedule_templates")
    .select(
      "id, name, center_id, status, template_type, valid_from, valid_until",
    )
    .eq("organization_id", organizationId)
    .eq("id", templateId)
    .maybeSingle();

  if (error) {
    throw new Error("Could not load schedule template for preparation.");
  }

  return data
    ? (data satisfies ChatGptConnectorScheduleTemplateApplicationTemplate)
    : null;
}

async function loadScheduleTemplateBlocksForPreparation({
  organizationId,
  supabase,
  templateId,
}: {
  organizationId: string;
  supabase: SupabaseServerClient;
  templateId: string;
}) {
  const { data, error } = await supabase
    .from("schedule_template_blocks")
    .select(
      "id, center_id, class_type_id, day_of_week, start_time, end_time, required_coaches, default_coach_profile_id",
    )
    .eq("organization_id", organizationId)
    .eq("template_id", templateId)
    .order("day_of_week", { ascending: true })
    .order("start_time", { ascending: true });

  if (error) {
    throw new Error("Could not load schedule template blocks for preparation.");
  }

  return (
    data ?? []
  ) satisfies ChatGptConnectorScheduleTemplateApplicationBlock[];
}

function getScheduleTemplateDefaultCoachIds(
  blocks: ChatGptConnectorScheduleTemplateApplicationBlock[],
) {
  return [
    ...new Set(
      blocks.flatMap((block) =>
        block.required_coaches > 0 && block.default_coach_profile_id
          ? [block.default_coach_profile_id]
          : [],
      ),
    ),
  ];
}

async function loadActiveCoachCertificationKeysForApplication({
  classTypes,
  coachIds,
  organizationId,
  templateBlocks,
  supabase,
}: {
  classTypes: ChatGptConnectorClassTypeRow[];
  coachIds: string[];
  organizationId: string;
  templateBlocks: ChatGptConnectorScheduleTemplateApplicationBlock[];
  supabase: SupabaseServerClient;
}) {
  if (coachIds.length === 0) {
    return [];
  }

  const classTypesById = new Map(
    classTypes.map((classType) => [classType.id, classType]),
  );
  const requiredCertificationIds = [
    ...new Set(
      templateBlocks.flatMap((block) => {
        const certificationId =
          classTypesById.get(block.class_type_id)?.certification_id;

        return certificationId ? [certificationId] : [];
      }),
    ),
  ];

  if (requiredCertificationIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("coach_certifications")
    .select("coach_profile_id, certification_id, status")
    .eq("organization_id", organizationId)
    .in("coach_profile_id", coachIds)
    .in("certification_id", requiredCertificationIds);

  if (error) {
    throw new Error("Could not load coach certifications for preparation.");
  }

  return (data ?? [])
    .filter((certification) => certification.status === "active")
    .map(
      (certification) =>
        `${certification.coach_profile_id}:${certification.certification_id}`,
    );
}

function createConfirmationExpiresAt() {
  return new Date(
    Date.now() + CONNECTOR_CONFIRMATION_TOKEN_TTL_MINUTES * 60 * 1000,
  ).toISOString();
}

async function loadConnectorConfirmation({
  confirmationId,
  organizationId,
  supabase,
}: {
  confirmationId: string;
  organizationId: string;
  supabase: SupabaseServerClient;
}) {
  const { data, error } = await supabase
    .from("chatgpt_connector_confirmations")
    .select(
      "id, organization_id, actor_user_id, tool, status, token_hash, template_id, center_id, date_from, date_to, plan_hash, idempotency_key_hash, expires_at, audit_event_id, created_block_count, created_assignment_count, skipped_duplicate_count",
    )
    .eq("organization_id", organizationId)
    .eq("id", confirmationId)
    .maybeSingle();

  if (error) {
    throw new Error("Could not load connector confirmation.");
  }

  return data ? (data satisfies ConnectorConfirmationRow) : null;
}

function isExpiredConnectorConfirmation(expiresAt: string) {
  const expiresAtMs = Date.parse(expiresAt);

  return !Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now();
}

function createConfirmationMismatch({
  reason,
  requestId,
}: {
  reason: string;
  requestId: string;
}) {
  return createChatGptConnectorError({
    code: "confirmation_mismatch",
    details: { reason },
    requestId,
  });
}

function getApplyScheduleTemplateRpcErrorCode(value: unknown) {
  const code = getJsonString(value);

  return code && APPLY_SCHEDULE_TEMPLATE_RPC_ERROR_CODES.has(code as ChatGptConnectorErrorCode)
    ? (code as ChatGptConnectorErrorCode)
    : "internal_error";
}

function normalizeApplyScheduleTemplateRpcSuccess(value: unknown) {
  const record = getJsonRecord(value);
  const auditEventId = getJsonString(record.audit_event_id);
  const createdBlocks = getJsonNumber(record.created_blocks);
  const createdAssignments = getJsonNumber(record.created_assignments);
  const skippedDuplicates = getJsonNumber(record.skipped_duplicates);

  if (
    !auditEventId ||
    createdBlocks === null ||
    createdAssignments === null ||
    skippedDuplicates === null
  ) {
    return null;
  }

  return {
    audit_event_id: auditEventId,
    created_assignments: createdAssignments,
    created_blocks: createdBlocks,
    idempotent_replay: record.idempotent_replay === true,
    skipped_duplicates: skippedDuplicates,
  };
}

export async function listCenters(
  input: ListCentersInput = {},
): Promise<ChatGptConnectorToolResponse<ListCentersOutput>> {
  const requestId = createChatGptConnectorRequestId();
  const sensitiveError = guardSensitiveScope({ input, requestId });

  if (sensitiveError) {
    return sensitiveError;
  }

  const contextResult = await getConnectorContext({
    organizationId: input.organization_id,
    requestId,
  });

  if (!contextResult.ok) {
    return contextResult.response;
  }

  try {
    const centers = await loadCenters({
      organizationId: contextResult.context.organization.id,
      supabase: contextResult.context.supabase,
    });
    const visibleCenters = input.include_inactive
      ? centers
      : centers.filter((center) => center.status === "active");

    return createChatGptConnectorSuccess({
      data: {
        centers: visibleCenters.map((center) => ({
          center_id: center.id,
          name: center.name,
          status: center.status,
          timezone: center.timezone,
        })),
      },
      requestId,
    });
  } catch {
    return createInternalError(requestId);
  }
}

export async function listClassTypes(
  input: ListClassTypesInput = {},
): Promise<ChatGptConnectorToolResponse<ListClassTypesOutput>> {
  const requestId = createChatGptConnectorRequestId();
  const sensitiveError = guardSensitiveScope({ input, requestId });

  if (sensitiveError) {
    return sensitiveError;
  }

  const contextResult = await getConnectorContext({
    organizationId: input.organization_id,
    requestId,
  });

  if (!contextResult.ok) {
    return contextResult.response;
  }

  try {
    const [centers, classTypes] = await Promise.all([
      loadCenters({
        organizationId: contextResult.context.organization.id,
        supabase: contextResult.context.supabase,
      }),
      loadClassTypes({
        organizationId: contextResult.context.organization.id,
        supabase: contextResult.context.supabase,
      }),
    ]);
    const centerResolution = resolveChatGptConnectorCenterReference({
      center_id: input.center_id,
      center_name: normalizeNullableString(input.center_name),
      centers,
    });

    if (!centerResolution.ok) {
      return createChatGptConnectorError({
        code: centerResolution.code,
        details: centerResolution.details,
        requestId,
      });
    }

    const visibleClassTypes = input.include_inactive
      ? classTypes
      : classTypes.filter((classType) => classType.status === "active");

    return createChatGptConnectorSuccess({
      data: {
        class_types: visibleClassTypes.map((classType) => ({
          class_type_id: classType.id,
          default_duration_minutes: null,
          name: classType.name,
          status: classType.status,
        })),
      },
      requestId,
      warnings: [
        "class_types.default_duration_minutes is null because BoxOps does not model default duration on class_types yet.",
      ],
    });
  } catch {
    return createInternalError(requestId);
  }
}

export async function previewScheduleTemplate(
  input: PreviewScheduleTemplateInput,
): Promise<ChatGptConnectorToolResponse<PreviewScheduleTemplateOutput>> {
  const requestId = createChatGptConnectorRequestId();
  const sensitiveError = guardSensitiveScope({ input, requestId });

  if (sensitiveError) {
    return sensitiveError;
  }

  const range = normalizeChatGptConnectorDateRange({
    dateFrom: input.date_from,
    dateTo: input.date_to,
    maxDays: CHATGPT_CONNECTOR_MAX_TEMPLATE_PREVIEW_RANGE_DAYS,
  });

  if (!range.ok) {
    return createChatGptConnectorError({
      code: range.code,
      details: range.details,
      requestId,
    });
  }

  if (!isPostgresUuid(input.center_id)) {
    return createChatGptConnectorError({
      code: "center_not_found",
      requestId,
    });
  }

  if (!Array.isArray(input.rules) || input.rules.length === 0) {
    return createChatGptConnectorError({
      code: "invalid_time_range",
      details: { reason: "missing_rules" },
      requestId,
    });
  }

  const contextResult = await getConnectorContext({
    organizationId: input.organization_id,
    requestId,
    requireOperationalManagement: true,
  });

  if (!contextResult.ok) {
    return contextResult.response;
  }

  try {
    const [centers, classTypes] = await Promise.all([
      loadCenters({
        organizationId: contextResult.context.organization.id,
        supabase: contextResult.context.supabase,
      }),
      loadClassTypes({
        organizationId: contextResult.context.organization.id,
        supabase: contextResult.context.supabase,
      }),
    ]);
    const centerResolution = resolveChatGptConnectorCenterReference({
      center_id: input.center_id,
      centers,
    });

    if (!centerResolution.ok) {
      return createChatGptConnectorError({
        code: centerResolution.code,
        details: centerResolution.details,
        requestId,
      });
    }

    if (!centerResolution.center || centerResolution.center.status !== "active") {
      return createChatGptConnectorError({
        code: "center_not_found",
        requestId,
      });
    }

    const coachIds = getPreviewRuleCoachIds(input.rules);
    const coachSummariesResult = await loadCoachSummariesForPreview({
      coachIds,
      organizationId: contextResult.context.organization.id,
      supabase: contextResult.context.supabase,
    });

    if (!coachSummariesResult.ok) {
      return createChatGptConnectorError({
        code: "coach_not_found",
        details: coachSummariesResult.details,
        requestId,
      });
    }

    const certificationWarnings = await getPreviewCertificationWarnings({
      classTypes,
      coachIds,
      organizationId: contextResult.context.organization.id,
      rules: input.rules,
      supabase: contextResult.context.supabase,
    });
    const existingBlocks =
      coachIds.length > 0
        ? await loadScheduleBlocks({
            dateFrom: range.date_from,
            dateTo: range.date_to,
            organizationId: contextResult.context.organization.id,
            supabase: contextResult.context.supabase,
          })
        : [];
    const existingAssignments =
      existingBlocks.length > 0
        ? await loadAssignmentsForBlocks({
            blockIds: toScheduleBlockIds(existingBlocks),
            organizationId: contextResult.context.organization.id,
            supabase: contextResult.context.supabase,
          })
        : [];
    const previewResult = buildChatGptConnectorScheduleTemplatePreview({
      center: centerResolution.center,
      classTypes,
      coachSummaries: coachSummariesResult.coachSummaries,
      dateFrom: range.date_from,
      dateTo: range.date_to,
      existingAssignments,
      existingBlocks,
      initialWarnings: certificationWarnings,
      name: input.name,
      organizationId: contextResult.context.organization.id,
      rules: input.rules,
    });

    if (!previewResult.ok) {
      return createChatGptConnectorError({
        code: previewResult.code,
        details: previewResult.details,
        requestId,
      });
    }

    return createChatGptConnectorSuccess({
      data: previewResult.preview,
      requestId,
      warnings: previewResult.preview.warnings,
    });
  } catch {
    return createInternalError(requestId);
  }
}

export async function createScheduleTemplateDraft(
  input: CreateScheduleTemplateDraftInput,
): Promise<ChatGptConnectorToolResponse<CreateScheduleTemplateDraftOutput>> {
  const requestId = createChatGptConnectorRequestId();
  const sensitiveError = guardSensitiveScope({ input, requestId });

  if (sensitiveError) {
    return sensitiveError;
  }

  if (!input.preview_id || !input.preview_id.startsWith("prev_")) {
    return createChatGptConnectorError({
      code: "template_preview_required",
      details: { reason: "missing_or_invalid_preview_id" },
      requestId,
    });
  }

  const idempotencyKey = normalizeIdempotencyKey(input.idempotency_key);

  if (!idempotencyKey) {
    return createChatGptConnectorError({
      code: "idempotency_conflict",
      details: { reason: "idempotency_key_required" },
      requestId,
    });
  }

  const range = normalizeChatGptConnectorDateRange({
    dateFrom: input.date_from,
    dateTo: input.date_to,
    maxDays: CHATGPT_CONNECTOR_MAX_TEMPLATE_PREVIEW_RANGE_DAYS,
  });

  if (!range.ok) {
    return createChatGptConnectorError({
      code: range.code,
      details: range.details,
      requestId,
    });
  }

  if (!isPostgresUuid(input.center_id)) {
    return createChatGptConnectorError({
      code: "center_not_found",
      requestId,
    });
  }

  if (!Array.isArray(input.rules) || input.rules.length === 0) {
    return createChatGptConnectorError({
      code: "invalid_time_range",
      details: { reason: "missing_rules" },
      requestId,
    });
  }

  const contextResult = await getConnectorContext({
    organizationId: input.organization_id,
    requestId,
    requireOperationalManagement: true,
  });

  if (!contextResult.ok) {
    return contextResult.response;
  }

  try {
    const [centers, classTypes] = await Promise.all([
      loadCenters({
        organizationId: contextResult.context.organization.id,
        supabase: contextResult.context.supabase,
      }),
      loadClassTypes({
        organizationId: contextResult.context.organization.id,
        supabase: contextResult.context.supabase,
      }),
    ]);
    const centerResolution = resolveChatGptConnectorCenterReference({
      center_id: input.center_id,
      centers,
    });

    if (!centerResolution.ok) {
      return createChatGptConnectorError({
        code: centerResolution.code,
        details: centerResolution.details,
        requestId,
      });
    }

    if (!centerResolution.center || centerResolution.center.status !== "active") {
      return createChatGptConnectorError({
        code: "center_not_found",
        requestId,
      });
    }

    const coachIds = getPreviewRuleCoachIds(input.rules);
    const coachSummariesResult = await loadCoachSummariesForPreview({
      coachIds,
      organizationId: contextResult.context.organization.id,
      supabase: contextResult.context.supabase,
    });

    if (!coachSummariesResult.ok) {
      return createChatGptConnectorError({
        code: "coach_not_found",
        details: coachSummariesResult.details,
        requestId,
      });
    }

    const certificationWarnings = await getPreviewCertificationWarnings({
      classTypes,
      coachIds,
      organizationId: contextResult.context.organization.id,
      rules: input.rules,
      supabase: contextResult.context.supabase,
    });
    const existingBlocks =
      coachIds.length > 0
        ? await loadScheduleBlocks({
            dateFrom: range.date_from,
            dateTo: range.date_to,
            organizationId: contextResult.context.organization.id,
            supabase: contextResult.context.supabase,
          })
        : [];
    const existingAssignments =
      existingBlocks.length > 0
        ? await loadAssignmentsForBlocks({
            blockIds: toScheduleBlockIds(existingBlocks),
            organizationId: contextResult.context.organization.id,
            supabase: contextResult.context.supabase,
          })
        : [];
    const previewResult = buildChatGptConnectorScheduleTemplatePreview({
      center: centerResolution.center,
      classTypes,
      coachSummaries: coachSummariesResult.coachSummaries,
      dateFrom: range.date_from,
      dateTo: range.date_to,
      existingAssignments,
      existingBlocks,
      initialWarnings: certificationWarnings,
      name: input.name,
      organizationId: contextResult.context.organization.id,
      rules: input.rules,
    });

    if (!previewResult.ok) {
      return createChatGptConnectorError({
        code: previewResult.code,
        details: previewResult.details,
        requestId,
      });
    }

    if (previewResult.preview.preview_id !== input.preview_id) {
      return createChatGptConnectorError({
        code: "template_preview_required",
        details: {
          expected_preview_id: previewResult.preview.preview_id,
          reason: "preview_id_mismatch",
        },
        requestId,
      });
    }

    const draftBlocksResult = buildChatGptConnectorScheduleTemplateDraftBlocks({
      center: centerResolution.center,
      classTypes,
      rules: input.rules,
    });

    if (!draftBlocksResult.ok) {
      return createChatGptConnectorError({
        code: draftBlocksResult.code,
        details: draftBlocksResult.details,
        requestId,
      });
    }

    if (draftBlocksResult.blocks.length === 0) {
      return createChatGptConnectorError({
        code: "template_preview_required",
        details: { reason: "empty_preview" },
        requestId,
      });
    }

    const templateName = normalizeTemplateDraftName(input.name);
    const idempotencyKeyHash = hashConnectorIdempotencyKey(idempotencyKey);
    const payloadHash = buildTemplateDraftPayloadHash({
      centerId: centerResolution.center.id,
      dateFrom: range.date_from,
      dateTo: range.date_to,
      name: templateName,
      preview: previewResult.preview,
      templateBlockCount: draftBlocksResult.blocks.length,
    });
    const existingDrafts = await loadExistingDraftByIdempotencyKey({
      idempotencyKeyHash,
      organizationId: contextResult.context.organization.id,
      supabase: contextResult.context.supabase,
    });
    const conflictingDraft = existingDrafts.find((draft) => {
      const metadata = getJsonRecord(draft.metadata);

      return (
        draft.status !== "draft" ||
        getJsonString(metadata.payload_hash) !== payloadHash ||
        getJsonString(metadata.preview_id) !== input.preview_id
      );
    });

    if (conflictingDraft) {
      return createChatGptConnectorError({
        code: "idempotency_conflict",
        details: { reason: "key_reused_with_different_payload" },
        requestId,
      });
    }

    const existingDraft = existingDrafts[0];

    if (existingDraft) {
      const metadata = getJsonRecord(existingDraft.metadata);
      const metadataTotalBlocks =
        typeof metadata.total_blocks === "number"
          ? metadata.total_blocks
          : previewResult.preview.summary.total_blocks;
      const metadataTemplateBlockCount =
        typeof metadata.template_block_count === "number"
          ? metadata.template_block_count
          : draftBlocksResult.blocks.length;

      return createChatGptConnectorSuccess({
        data: {
          created_by_source: "chatgpt_connector",
          idempotent_replay: true,
          name: existingDraft.name,
          preview_id: input.preview_id,
          status: "draft",
          template_block_count: metadataTemplateBlockCount,
          template_id: existingDraft.id,
          total_blocks: metadataTotalBlocks,
        },
        requestId,
        warnings: ["idempotent_replay", ...previewResult.preview.warnings],
      });
    }

    const templateMetadata = buildTemplateDraftMetadata({
      idempotencyKeyHash,
      payloadHash,
      preview: previewResult.preview,
      templateBlockCount: draftBlocksResult.blocks.length,
    });
    const { data: template, error: templateError } =
      await contextResult.context.supabase
        .from("schedule_templates")
        .insert({
          center_id: centerResolution.center.id,
          metadata: templateMetadata,
          name: templateName,
          organization_id: contextResult.context.organization.id,
          status: "draft",
          template_type: "weekly",
          valid_from: range.date_from,
          valid_until: range.date_to,
        })
        .select("id, name, status")
        .single();

    if (templateError || !template) {
      return createInternalError(requestId);
    }

    const { data: templateBlocks, error: blocksError } =
      await contextResult.context.supabase
        .from("schedule_template_blocks")
        .insert(
          draftBlocksResult.blocks.map((block) => ({
            center_id: block.center_id,
            class_type_id: block.class_type_id,
            day_of_week: block.day_of_week,
            default_coach_profile_id: block.default_coach_profile_id,
            end_time: block.end_time,
            metadata: getTemplateDraftBlockMetadata({
              block,
              previewId: previewResult.preview.preview_id,
            }),
            notes: null,
            organization_id: contextResult.context.organization.id,
            required_coaches: block.required_coaches,
            start_time: block.start_time,
            template_id: template.id,
          })),
        )
        .select("id");

    if (
      blocksError ||
      !templateBlocks ||
      templateBlocks.length !== draftBlocksResult.blocks.length
    ) {
      await contextResult.context.supabase
        .from("schedule_templates")
        .delete()
        .eq("organization_id", contextResult.context.organization.id)
        .eq("id", template.id);

      return createInternalError(requestId);
    }

    return createChatGptConnectorSuccess({
      data: {
        created_by_source: "chatgpt_connector",
        name: template.name,
        preview_id: previewResult.preview.preview_id,
        status: "draft",
        template_block_count: templateBlocks.length,
        template_id: template.id,
        total_blocks: previewResult.preview.summary.total_blocks,
      },
      requestId,
      warnings: [
        ...previewResult.preview.warnings,
        ...draftBlocksResult.warnings,
      ],
    });
  } catch {
    return createInternalError(requestId);
  }
}

export async function prepareScheduleTemplateApplication(
  input: PrepareScheduleTemplateApplicationInput,
): Promise<
  ChatGptConnectorToolResponse<PrepareScheduleTemplateApplicationOutput>
> {
  const requestId = createChatGptConnectorRequestId();
  const sensitiveError = guardSensitiveScope({ input, requestId });

  if (sensitiveError) {
    return sensitiveError;
  }

  const idempotencyKey = normalizeIdempotencyKey(input.idempotency_key);

  if (!idempotencyKey) {
    return createChatGptConnectorError({
      code: "idempotency_conflict",
      details: { reason: "idempotency_key_required" },
      requestId,
    });
  }

  const range = normalizeChatGptConnectorDateRange({
    dateFrom: input.date_from,
    dateTo: input.date_to,
    maxDays: CHATGPT_CONNECTOR_MAX_TEMPLATE_PREVIEW_RANGE_DAYS,
  });

  if (!range.ok) {
    return createChatGptConnectorError({
      code: range.code,
      details: range.details,
      requestId,
    });
  }

  if (!isPostgresUuid(input.template_id)) {
    return createChatGptConnectorError({
      code: "template_not_found",
      requestId,
    });
  }

  if (!isPostgresUuid(input.center_id)) {
    return createChatGptConnectorError({
      code: "center_not_found",
      requestId,
    });
  }

  const contextResult = await getConnectorContext({
    organizationId: input.organization_id,
    requestId,
    requireOperationalManagement: true,
  });

  if (!contextResult.ok) {
    return contextResult.response;
  }

  try {
    const [
      centers,
      classTypes,
      template,
      templateBlocks,
      existingBlocks,
    ] = await Promise.all([
      loadCenters({
        organizationId: contextResult.context.organization.id,
        supabase: contextResult.context.supabase,
      }),
      loadClassTypes({
        organizationId: contextResult.context.organization.id,
        supabase: contextResult.context.supabase,
      }),
      loadScheduleTemplateForPreparation({
        organizationId: contextResult.context.organization.id,
        supabase: contextResult.context.supabase,
        templateId: input.template_id,
      }),
      loadScheduleTemplateBlocksForPreparation({
        organizationId: contextResult.context.organization.id,
        supabase: contextResult.context.supabase,
        templateId: input.template_id,
      }),
      loadScheduleBlocks({
        centerId: input.center_id,
        dateFrom: range.date_from,
        dateTo: range.date_to,
        organizationId: contextResult.context.organization.id,
        supabase: contextResult.context.supabase,
      }),
    ]);

    if (!template) {
      return createChatGptConnectorError({
        code: "template_not_found",
        requestId,
      });
    }

    const centerResolution = resolveChatGptConnectorCenterReference({
      center_id: input.center_id,
      centers,
    });

    if (!centerResolution.ok) {
      return createChatGptConnectorError({
        code: centerResolution.code,
        details: centerResolution.details,
        requestId,
      });
    }

    if (!centerResolution.center || centerResolution.center.status !== "active") {
      return createChatGptConnectorError({
        code: "center_not_found",
        requestId,
      });
    }

    const defaultCoachIds = getScheduleTemplateDefaultCoachIds(templateBlocks);
    const coachSummariesResult = await loadCoachSummariesForPreview({
      coachIds: defaultCoachIds,
      organizationId: contextResult.context.organization.id,
      supabase: contextResult.context.supabase,
    });

    if (!coachSummariesResult.ok) {
      return createChatGptConnectorError({
        code: "template_not_applicable",
        details: {
          ...coachSummariesResult.details,
          reason: "default_coach_not_assignable",
        },
        requestId,
      });
    }

    const [existingAssignments, activeCoachCertificationKeys] =
      await Promise.all([
        existingBlocks.length > 0
          ? loadAssignmentsForBlocks({
              blockIds: toScheduleBlockIds(existingBlocks),
              organizationId: contextResult.context.organization.id,
              supabase: contextResult.context.supabase,
            })
          : Promise.resolve([]),
        loadActiveCoachCertificationKeysForApplication({
          classTypes,
          coachIds: defaultCoachIds,
          organizationId: contextResult.context.organization.id,
          templateBlocks,
          supabase: contextResult.context.supabase,
        }),
      ]);
    const planResult = buildChatGptConnectorScheduleTemplateApplicationPlan({
      activeCoachCertificationKeys,
      center: centerResolution.center,
      classTypes,
      coachSummaries: coachSummariesResult.coachSummaries,
      dateFrom: range.date_from,
      dateTo: range.date_to,
      existingAssignments,
      existingBlocks,
      template,
      templateBlocks,
    });

    if (!planResult.ok) {
      return createChatGptConnectorError({
        code: planResult.code,
        details: planResult.details,
        requestId,
      });
    }

    const idempotencyKeyHash = hashConnectorIdempotencyKey(idempotencyKey);
    const confirmationExpiresAt = createConfirmationExpiresAt();
    const confirmationId = randomUUID();
    const confirmationSecret = createConnectorConfirmationSecret();
    const confirmationTokenHash = hashConnectorConfirmationTokenSecret({
      confirmationId,
      tokenSecret: confirmationSecret,
    });
    const confirmationPlanSnapshot =
      buildChatGptConnectorScheduleTemplateApplicationPlanSnapshot(
        planResult.plan,
      );
    const confirmationToken = createChatGptConnectorConfirmationToken({
      confirmationId,
      tokenSecret: confirmationSecret,
    });
    const { error: confirmationError } = await contextResult.context.supabase
      .from("chatgpt_connector_confirmations")
      .insert({
        actor_user_id: contextResult.context.user.id,
        center_id: centerResolution.center.id,
        date_from: range.date_from,
        date_to: range.date_to,
        expires_at: confirmationExpiresAt,
        id: confirmationId,
        idempotency_key_hash: idempotencyKeyHash,
        organization_id: contextResult.context.organization.id,
        plan_hash: planResult.plan.plan_hash,
        plan_snapshot: confirmationPlanSnapshot as unknown as Json,
        prepare_request_id: requestId,
        status: "pending",
        template_id: template.id,
        token_hash: confirmationTokenHash,
        tool: "apply_schedule_template",
      });

    if (confirmationError) {
      return createInternalError(requestId);
    }

    return createChatGptConnectorSuccess({
      data: {
        center: {
          center_id: centerResolution.center.id,
          name: centerResolution.center.name,
          timezone: centerResolution.center.timezone,
        },
        confirmation_expires_at: confirmationExpiresAt,
        confirmation_required: true,
        confirmation_token: confirmationToken,
        idempotency_key_hash: idempotencyKeyHash,
        plan: planResult.plan,
        template: {
          name: template.name,
          status: template.status,
          template_id: template.id,
          template_type: "weekly",
        },
      },
      requestId,
      warnings: planResult.plan.warnings,
    });
  } catch {
    return createInternalError(requestId);
  }
}

export async function applyScheduleTemplate(
  input: ApplyScheduleTemplateInput,
): Promise<ChatGptConnectorToolResponse<ApplyScheduleTemplateOutput>> {
  const requestId = createChatGptConnectorRequestId();
  const sensitiveError = guardSensitiveScope({ input, requestId });

  if (sensitiveError) {
    return sensitiveError;
  }

  if (!normalizeNullableString(input.confirmation_token)) {
    return createChatGptConnectorError({
      code: "confirmation_required",
      details: { reason: "confirmation_token_required" },
      requestId,
    });
  }

  const parsedConfirmation = parseChatGptConnectorConfirmationToken(
    input.confirmation_token,
  );

  if (!parsedConfirmation.ok) {
    return createConfirmationMismatch({
      reason: parsedConfirmation.reason,
      requestId,
    });
  }

  const idempotencyKey = normalizeIdempotencyKey(input.idempotency_key);

  if (!idempotencyKey) {
    return createChatGptConnectorError({
      code: "idempotency_conflict",
      details: { reason: "idempotency_key_required" },
      requestId,
    });
  }

  const range = normalizeChatGptConnectorDateRange({
    dateFrom: input.date_from,
    dateTo: input.date_to,
    maxDays: CHATGPT_CONNECTOR_MAX_TEMPLATE_PREVIEW_RANGE_DAYS,
  });

  if (!range.ok) {
    return createChatGptConnectorError({
      code: range.code,
      details: range.details,
      requestId,
    });
  }

  if (!isPostgresUuid(input.template_id)) {
    return createChatGptConnectorError({
      code: "template_not_found",
      requestId,
    });
  }

  if (!isPostgresUuid(input.center_id)) {
    return createChatGptConnectorError({
      code: "center_not_found",
      requestId,
    });
  }

  const contextResult = await getConnectorContext({
    organizationId: input.organization_id,
    requestId,
    requireOperationalManagement: true,
  });

  if (!contextResult.ok) {
    return contextResult.response;
  }

  try {
    const idempotencyKeyHash = hashConnectorIdempotencyKey(idempotencyKey);
    const confirmationTokenHash = hashConnectorConfirmationTokenSecret({
      confirmationId: parsedConfirmation.confirmation_id,
      tokenSecret: parsedConfirmation.token_secret,
    });
    const confirmation = await loadConnectorConfirmation({
      confirmationId: parsedConfirmation.confirmation_id,
      organizationId: contextResult.context.organization.id,
      supabase: contextResult.context.supabase,
    });

    if (
      !confirmation ||
      confirmation.actor_user_id !== contextResult.context.user.id ||
      confirmation.tool !== "apply_schedule_template" ||
      confirmation.token_hash !== confirmationTokenHash ||
      confirmation.template_id !== input.template_id ||
      confirmation.center_id !== input.center_id ||
      confirmation.date_from !== range.date_from ||
      confirmation.date_to !== range.date_to ||
      confirmation.idempotency_key_hash !== idempotencyKeyHash
    ) {
      return createConfirmationMismatch({
        reason: "confirmation_mismatch",
        requestId,
      });
    }

    if (isExpiredConnectorConfirmation(confirmation.expires_at)) {
      return createConfirmationMismatch({
        reason: "confirmation_expired",
        requestId,
      });
    }

    if (confirmation.status === "applied") {
      if (!confirmation.audit_event_id) {
        return createInternalError(requestId);
      }

      return createChatGptConnectorSuccess({
        data: {
          applied: true,
          audit_event_id: confirmation.audit_event_id,
          created_assignments: confirmation.created_assignment_count,
          created_blocks: confirmation.created_block_count,
          idempotent_replay: true,
          skipped_duplicates: confirmation.skipped_duplicate_count,
          template_id: confirmation.template_id,
        },
        requestId,
        warnings: ["idempotent_replay"],
      });
    }

    if (confirmation.status !== "pending") {
      return createConfirmationMismatch({
        reason: "confirmation_status_not_pending",
        requestId,
      });
    }

    const [
      centers,
      classTypes,
      template,
      templateBlocks,
      existingBlocks,
    ] = await Promise.all([
      loadCenters({
        organizationId: contextResult.context.organization.id,
        supabase: contextResult.context.supabase,
      }),
      loadClassTypes({
        organizationId: contextResult.context.organization.id,
        supabase: contextResult.context.supabase,
      }),
      loadScheduleTemplateForPreparation({
        organizationId: contextResult.context.organization.id,
        supabase: contextResult.context.supabase,
        templateId: input.template_id,
      }),
      loadScheduleTemplateBlocksForPreparation({
        organizationId: contextResult.context.organization.id,
        supabase: contextResult.context.supabase,
        templateId: input.template_id,
      }),
      loadScheduleBlocks({
        centerId: input.center_id,
        dateFrom: range.date_from,
        dateTo: range.date_to,
        organizationId: contextResult.context.organization.id,
        supabase: contextResult.context.supabase,
      }),
    ]);

    if (!template) {
      return createChatGptConnectorError({
        code: "template_not_found",
        requestId,
      });
    }

    const centerResolution = resolveChatGptConnectorCenterReference({
      center_id: input.center_id,
      centers,
    });

    if (!centerResolution.ok) {
      return createChatGptConnectorError({
        code: centerResolution.code,
        details: centerResolution.details,
        requestId,
      });
    }

    if (!centerResolution.center || centerResolution.center.status !== "active") {
      return createChatGptConnectorError({
        code: "center_not_found",
        requestId,
      });
    }

    const defaultCoachIds = getScheduleTemplateDefaultCoachIds(templateBlocks);
    const coachSummariesResult = await loadCoachSummariesForPreview({
      coachIds: defaultCoachIds,
      organizationId: contextResult.context.organization.id,
      supabase: contextResult.context.supabase,
    });

    if (!coachSummariesResult.ok) {
      return createChatGptConnectorError({
        code: "template_not_applicable",
        details: {
          ...coachSummariesResult.details,
          reason: "default_coach_not_assignable",
        },
        requestId,
      });
    }

    const [existingAssignments, activeCoachCertificationKeys] =
      await Promise.all([
        existingBlocks.length > 0
          ? loadAssignmentsForBlocks({
              blockIds: toScheduleBlockIds(existingBlocks),
              organizationId: contextResult.context.organization.id,
              supabase: contextResult.context.supabase,
            })
          : Promise.resolve([]),
        loadActiveCoachCertificationKeysForApplication({
          classTypes,
          coachIds: defaultCoachIds,
          organizationId: contextResult.context.organization.id,
          templateBlocks,
          supabase: contextResult.context.supabase,
        }),
      ]);
    const planResult = buildChatGptConnectorScheduleTemplateApplicationPlan({
      activeCoachCertificationKeys,
      center: centerResolution.center,
      classTypes,
      coachSummaries: coachSummariesResult.coachSummaries,
      dateFrom: range.date_from,
      dateTo: range.date_to,
      existingAssignments,
      existingBlocks,
      template,
      templateBlocks,
    });

    if (!planResult.ok) {
      return createChatGptConnectorError({
        code: planResult.code,
        details: planResult.details,
        requestId,
      });
    }

    if (planResult.plan.plan_hash !== confirmation.plan_hash) {
      return createConfirmationMismatch({
        reason: "plan_hash_mismatch",
        requestId,
      });
    }

    if (planResult.plan.conflicts.length > 0) {
      return createChatGptConnectorError({
        code: "template_not_applicable",
        details: {
          conflict_count: planResult.plan.conflicts.length,
          reason: "application_conflicts_found",
        },
        requestId,
      });
    }

    const { data: rpcResult, error: rpcError } =
      await contextResult.context.supabase.rpc(
        "apply_chatgpt_schedule_template_application",
        {
          target_center_id: centerResolution.center.id,
          target_confirmation_id: parsedConfirmation.confirmation_id,
          target_date_from: range.date_from,
          target_date_to: range.date_to,
          target_idempotency_key_hash: idempotencyKeyHash,
          target_organization_id: contextResult.context.organization.id,
          target_plan_hash: planResult.plan.plan_hash,
          target_request_id: requestId,
          target_template_id: template.id,
          target_token_hash: confirmationTokenHash,
        },
      );

    if (rpcError) {
      return createInternalError(requestId);
    }

    const rpcRecord = getJsonRecord(rpcResult);

    if (rpcRecord.ok !== true) {
      const code = getApplyScheduleTemplateRpcErrorCode(rpcRecord.code);

      if (code === "internal_error") {
        return createInternalError(requestId);
      }

      return createChatGptConnectorError({
        code,
        details: {
          ...(getJsonNumber(rpcRecord.conflict_count) !== null
            ? { conflict_count: getJsonNumber(rpcRecord.conflict_count) }
            : {}),
          reason: getJsonString(rpcRecord.reason) ?? "rpc_rejected",
        },
        requestId,
      });
    }

    const normalizedResult =
      normalizeApplyScheduleTemplateRpcSuccess(rpcResult);

    if (!normalizedResult) {
      return createInternalError(requestId);
    }

    return createChatGptConnectorSuccess({
      data: {
        applied: true,
        audit_event_id: normalizedResult.audit_event_id,
        created_assignments: normalizedResult.created_assignments,
        created_blocks: normalizedResult.created_blocks,
        ...(normalizedResult.idempotent_replay
          ? { idempotent_replay: true }
          : {}),
        skipped_duplicates: normalizedResult.skipped_duplicates,
        template_id: template.id,
      },
      requestId,
      warnings: [
        ...(normalizedResult.idempotent_replay ? ["idempotent_replay"] : []),
        ...planResult.plan.warnings,
      ],
    });
  } catch {
    return createInternalError(requestId);
  }
}

export async function getScheduleForDay(
  input: GetScheduleForDayInput,
): Promise<ChatGptConnectorToolResponse<GetScheduleForDayOutput>> {
  const requestId = createChatGptConnectorRequestId();
  const sensitiveError = guardSensitiveScope({ input, requestId });

  if (sensitiveError) {
    return sensitiveError;
  }

  const date = normalizeChatGptConnectorDate(input.date);
  const statusFilter = normalizeScheduleStatusFilter(input.status);

  if (!date || !statusFilter) {
    return createChatGptConnectorError({
      code: "invalid_date_range",
      details: !date ? { reason: "invalid_date" } : { reason: "invalid_status" },
      requestId,
    });
  }

  const contextResult = await getConnectorContext({
    organizationId: input.organization_id,
    requestId,
  });

  if (!contextResult.ok) {
    return contextResult.response;
  }

  try {
    const [centers, classTypes] = await Promise.all([
      loadCenters({
        organizationId: contextResult.context.organization.id,
        supabase: contextResult.context.supabase,
      }),
      loadClassTypes({
        organizationId: contextResult.context.organization.id,
        supabase: contextResult.context.supabase,
      }),
    ]);
    const centerResolution = resolveChatGptConnectorCenterReference({
      center_id: input.center_id,
      center_name: normalizeNullableString(input.center_name),
      centers,
    });

    if (!centerResolution.ok) {
      return createChatGptConnectorError({
        code: centerResolution.code,
        details: centerResolution.details,
        requestId,
      });
    }

    const classTypeResolution = resolveChatGptConnectorClassTypeReference({
      class_type_id: input.class_type_id,
      class_type_name: normalizeNullableString(input.class_type_name),
      classTypes,
    });

    if (!classTypeResolution.ok) {
      return createChatGptConnectorError({
        code: classTypeResolution.code,
        details: classTypeResolution.details,
        requestId,
      });
    }

    const rawBlocks = await loadScheduleBlocks({
      centerId: centerResolution.center?.id,
      dateFrom: date,
      dateTo: date,
      organizationId: contextResult.context.organization.id,
      supabase: contextResult.context.supabase,
    });
    const blocks = filterBlocks({
      blocks: rawBlocks,
      classTypeId: classTypeResolution.classType?.id,
      statusFilter,
    });
    const assignments = await loadAssignmentsForBlocks({
      blockIds: toScheduleBlockIds(blocks),
      organizationId: contextResult.context.organization.id,
      supabase: contextResult.context.supabase,
    });
    const coachContext = await loadCoachContextForAssignments({
      assignments,
      organizationId: contextResult.context.organization.id,
      supabase: contextResult.context.supabase,
    });

    return createChatGptConnectorSuccess({
      data: {
        blocks: buildChatGptConnectorScheduleBlockSummaries({
          assignments,
          blocks,
          centers,
          classTypes,
          coachProfiles: coachContext.coachProfiles,
          memberships: coachContext.memberships,
          personProfiles: coachContext.personProfiles,
        }),
        date,
        timezone: getScheduleTimezone({
          center: centerResolution.center,
          organizationTimezone: contextResult.context.organization.timezone,
        }),
      },
      requestId,
    });
  } catch {
    return createInternalError(requestId);
  }
}

export async function getScheduleAtTime(
  input: GetScheduleAtTimeInput,
): Promise<ChatGptConnectorToolResponse<GetScheduleAtTimeOutput>> {
  const requestId = createChatGptConnectorRequestId();
  const sensitiveError = guardSensitiveScope({ input, requestId });

  if (sensitiveError) {
    return sensitiveError;
  }

  const date = normalizeChatGptConnectorDate(input.date);
  const time = normalizeChatGptConnectorTime(input.time);
  const matchMode = normalizeMatchMode(input.match_mode);

  if (!date) {
    return createChatGptConnectorError({
      code: "invalid_date_range",
      details: { reason: "invalid_date" },
      requestId,
    });
  }

  if (!time || !matchMode) {
    return createChatGptConnectorError({
      code: "invalid_time_range",
      details: !time ? { reason: "invalid_time" } : { reason: "invalid_match_mode" },
      requestId,
    });
  }

  const contextResult = await getConnectorContext({
    organizationId: input.organization_id,
    requestId,
  });

  if (!contextResult.ok) {
    return contextResult.response;
  }

  try {
    const [centers, classTypes] = await Promise.all([
      loadCenters({
        organizationId: contextResult.context.organization.id,
        supabase: contextResult.context.supabase,
      }),
      loadClassTypes({
        organizationId: contextResult.context.organization.id,
        supabase: contextResult.context.supabase,
      }),
    ]);
    const centerResolution = resolveChatGptConnectorCenterReference({
      center_id: input.center_id,
      center_name: normalizeNullableString(input.center_name),
      centers,
    });

    if (!centerResolution.ok) {
      return createChatGptConnectorError({
        code: centerResolution.code,
        details: centerResolution.details,
        requestId,
      });
    }

    const classTypeResolution = resolveChatGptConnectorClassTypeReference({
      class_type_id: input.class_type_id,
      class_type_name: normalizeNullableString(input.class_type_name),
      classTypes,
    });

    if (!classTypeResolution.ok) {
      return createChatGptConnectorError({
        code: classTypeResolution.code,
        details: classTypeResolution.details,
        requestId,
      });
    }

    const rawBlocks = await loadScheduleBlocks({
      centerId: centerResolution.center?.id,
      dateFrom: date,
      dateTo: date,
      organizationId: contextResult.context.organization.id,
      supabase: contextResult.context.supabase,
    });
    const activeBlocks = filterBlocks({
      blocks: rawBlocks,
      classTypeId: classTypeResolution.classType?.id,
      statusFilter: "active",
    });
    const matchingBlocks = filterChatGptConnectorScheduleBlocksAtTime({
      blocks: activeBlocks,
      matchMode,
      time,
    });

    if (matchingBlocks.length === 0 && input.empty_result_mode === "error") {
      return createChatGptConnectorError({
        code: "schedule_not_found",
        requestId,
      });
    }

    const assignments = await loadAssignmentsForBlocks({
      blockIds: toScheduleBlockIds(matchingBlocks),
      organizationId: contextResult.context.organization.id,
      supabase: contextResult.context.supabase,
    });
    const coachContext = await loadCoachContextForAssignments({
      assignments,
      organizationId: contextResult.context.organization.id,
      supabase: contextResult.context.supabase,
    });

    return createChatGptConnectorSuccess({
      data: {
        date,
        matches: buildChatGptConnectorScheduleBlockSummaries({
          assignments,
          blocks: matchingBlocks,
          centers,
          classTypes,
          coachProfiles: coachContext.coachProfiles,
          memberships: coachContext.memberships,
          personProfiles: coachContext.personProfiles,
        }),
        time,
      },
      requestId,
    });
  } catch {
    return createInternalError(requestId);
  }
}

export async function getMySchedule(
  input: GetMyScheduleInput,
): Promise<ChatGptConnectorToolResponse<GetMyScheduleOutput>> {
  const requestId = createChatGptConnectorRequestId();
  const sensitiveError = guardSensitiveScope({ input, requestId });

  if (sensitiveError) {
    return sensitiveError;
  }

  const range = normalizeChatGptConnectorDateRange({
    dateFrom: input.date_from,
    dateTo: input.date_to,
  });

  if (!range.ok) {
    return createChatGptConnectorError({
      code: range.code,
      details: range.details,
      requestId,
    });
  }

  const contextResult = await getConnectorContext({
    organizationId: input.organization_id,
    requestId,
    requirePersonalAccess: true,
  });

  if (!contextResult.ok) {
    return contextResult.response;
  }

  try {
    const centers = await loadCenters({
      organizationId: contextResult.context.organization.id,
      supabase: contextResult.context.supabase,
    });
    const centerResolution = resolveChatGptConnectorCenterReference({
      center_id: input.center_id,
      center_name: normalizeNullableString(input.center_name),
      centers,
    });

    if (!centerResolution.ok) {
      return createChatGptConnectorError({
        code: centerResolution.code,
        details: centerResolution.details,
        requestId,
      });
    }

    const ownCoach = await loadOwnCoachContext({
      organizationId: contextResult.context.organization.id,
      supabase: contextResult.context.supabase,
      userId: contextResult.context.user.id,
    });

    if (!ownCoach.ok) {
      return createChatGptConnectorError({
        code: "permission_denied",
        details: {
          reason: ownCoach.reason,
          ...(ownCoach.profile_count
            ? { profile_count: ownCoach.profile_count }
            : {}),
        },
        requestId,
      });
    }

    const [classTypes, rawBlocks] = await Promise.all([
      loadClassTypes({
        organizationId: contextResult.context.organization.id,
        supabase: contextResult.context.supabase,
      }),
      loadScheduleBlocks({
        centerId: centerResolution.center?.id,
        dateFrom: range.date_from,
        dateTo: range.date_to,
        organizationId: contextResult.context.organization.id,
        supabase: contextResult.context.supabase,
      }),
    ]);
    const activeBlocks = filterBlocks({
      blocks: rawBlocks,
      statusFilter: "active",
    });
    const assignments = await loadAssignmentsForBlocks({
      blockIds: toScheduleBlockIds(activeBlocks),
      organizationId: contextResult.context.organization.id,
      supabase: contextResult.context.supabase,
    });
    const ownAssignments = assignments.filter(
      (assignment) =>
        assignment.assignment_status === "assigned" &&
        assignment.coach_profile_id === ownCoach.coach_profile_id,
    );
    const ownAssignmentByBlockId = new Map(
      ownAssignments.map((assignment) => [assignment.schedule_block_id, assignment]),
    );
    const ownBlockIds = new Set(ownAssignmentByBlockId.keys());
    const coachContext = await loadCoachContextForAssignments({
      assignments,
      organizationId: contextResult.context.organization.id,
      supabase: contextResult.context.supabase,
    });
    const allSummaries = buildChatGptConnectorScheduleBlockSummaries({
      assignments,
      blocks: activeBlocks,
      centers,
      classTypes,
      coachProfiles: coachContext.coachProfiles,
      memberships: coachContext.memberships,
      personProfiles: coachContext.personProfiles,
    });
    const blocksById = new Map(activeBlocks.map((block) => [block.id, block]));

    return createChatGptConnectorSuccess({
      data: {
        blocks: allSummaries
          .filter((summary) => ownBlockIds.has(summary.schedule_block_id))
          .map((summary) => {
            const block = blocksById.get(summary.schedule_block_id);
            const assignment = ownAssignmentByBlockId.get(
              summary.schedule_block_id,
            );

            return {
              assignment_status: assignment?.assignment_status ?? "assigned",
              center_id: summary.center_id,
              center_name: summary.center_name,
              class_type_id: summary.class_type_id,
              class_type_name: summary.class_type_name,
              coverage_status: summary.coverage_status,
              date: block?.service_date ?? range.date_from,
              ends_at: summary.ends_at,
              schedule_block_id: summary.schedule_block_id,
              starts_at: summary.starts_at,
              status: summary.status,
            };
          }),
        display_name: ownCoach.display_name,
        person_id: ownCoach.person_profile_id,
      },
      requestId,
    });
  } catch {
    return createInternalError(requestId);
  }
}

export const chatGptConnectorTools = {
  apply_schedule_template: applyScheduleTemplate,
  create_schedule_template_draft: createScheduleTemplateDraft,
  get_my_schedule: getMySchedule,
  get_schedule_at_time: getScheduleAtTime,
  get_schedule_for_day: getScheduleForDay,
  list_centers: listCenters,
  list_class_types: listClassTypes,
  prepare_schedule_template_application: prepareScheduleTemplateApplication,
  preview_schedule_template: previewScheduleTemplate,
};
