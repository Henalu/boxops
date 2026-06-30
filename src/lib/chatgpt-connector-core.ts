import {
  canManageOperationalData,
  canReadOperationalData,
  canUsePersonalFeatures,
} from "@/lib/auth/permissions";
import {
  calculateScheduleCoverageByBlock,
  isCoverageActiveBlock,
  type ScheduleCoverageState,
} from "@/lib/schedule-blocks";
import { isPostgresUuid } from "@/lib/uuid";

export const CHATGPT_CONNECTOR_MAX_SCHEDULE_RANGE_DAYS = 31;
export const CHATGPT_CONNECTOR_MAX_TEMPLATE_PREVIEW_RANGE_DAYS = 62;
export const CHATGPT_CONNECTOR_MAX_TEMPLATE_PREVIEW_BLOCKS = 500;
export const CHATGPT_CONNECTOR_TEMPLATE_PREVIEW_SAMPLE_BLOCK_LIMIT = 20;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const ACTIVE_SCHEDULE_BLOCK_STATUSES = ["scheduled", "uncovered", "changed"];
const TEMPLATE_PREVIEW_WEEKDAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;
const TEMPLATE_PREVIEW_WEEKDAY_TO_DAY = new Map(
  TEMPLATE_PREVIEW_WEEKDAYS.map((weekday, index) => [weekday, index + 1]),
);
const ASSIGNMENT_STATUS_ORDER = new Map([
  ["assigned", 0],
  ["pending", 1],
  ["declined", 2],
  ["removed", 3],
]);

const CONFIRMATION_TOKEN_PREFIX = "confirm_v1";
const CONFIRMATION_TOKEN_SECRET_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

const SENSITIVE_SCOPE_PATTERNS = [
  /address|direcci[oó]n/i,
  /contract|contrato/i,
  /dni|nie/i,
  /document|documento/i,
  /email|correo/i,
  /fichaje|time[_\s-]?tracking/i,
  /firma|signature/i,
  /geolocalizaci[oó]n|geolocation|ubicaci[oó]n|location/i,
  /hr|rrhh/i,
  /n[oó]mina|nomina|payroll/i,
  /nota|note/i,
  /salary|salario/i,
  /storage/i,
  /tel[eé]fono|phone/i,
];

export type ChatGptConnectorErrorCode =
  | "authentication_required"
  | "center_ambiguous"
  | "center_not_found"
  | "class_type_not_found"
  | "coach_not_found"
  | "confirmation_mismatch"
  | "confirmation_required"
  | "idempotency_conflict"
  | "internal_error"
  | "invalid_date_range"
  | "invalid_time_range"
  | "organization_required"
  | "permission_denied"
  | "schedule_not_found"
  | "sensitive_scope_not_allowed"
  | "template_not_applicable"
  | "template_not_found"
  | "template_preview_required";

export type ChatGptConnectorError = {
  code: ChatGptConnectorErrorCode;
  details: Record<string, unknown>;
  message: string;
};

export type ChatGptConnectorToolResponse<TData> =
  | {
      data: TData;
      ok: true;
      request_id: string;
      warnings: string[];
    }
  | {
      error: ChatGptConnectorError;
      ok: false;
      request_id: string;
    };

export type ChatGptConnectorSensitiveScopeInput = {
  include_contact_details?: boolean | null;
  include_documents?: boolean | null;
  include_location?: boolean | null;
  include_payroll?: boolean | null;
  include_private_notes?: boolean | null;
  include_sensitive?: boolean | null;
  include_time_tracking?: boolean | null;
  requested_scope?: string | null;
};

export type ChatGptConnectorOrganizationInput =
  ChatGptConnectorSensitiveScopeInput & {
    organization_id?: string | null;
  };

export type ChatGptConnectorCenterReferenceInput = {
  center_id?: string | null;
  center_name?: string | null;
};

export type ChatGptConnectorClassTypeReferenceInput = {
  class_type_id?: string | null;
  class_type_name?: string | null;
};

export type ChatGptConnectorCenterRow = {
  id: string;
  name: string;
  status: string;
  timezone: string;
};

export type ChatGptConnectorClassTypeRow = {
  certification_id?: string | null;
  id: string;
  name: string;
  required_coaches: number;
  status: string;
};

export type ChatGptConnectorScheduleBlockRow = {
  center_id: string;
  class_type_id: string;
  end_time: string;
  id: string;
  is_template_exception?: boolean | null;
  required_coaches: number;
  service_date: string;
  start_time: string;
  status: string;
  template_block_id?: string | null;
  template_id?: string | null;
};

export type ChatGptConnectorAssignmentRow = {
  assignment_status: string;
  coach_profile_id: string;
  id: string;
  schedule_block_id: string;
};

export type ChatGptConnectorCoachProfileRow = {
  id: string;
  person_profile_id: string | null;
  status: string;
  user_id: string | null;
};

export type ChatGptConnectorPersonProfileRow = {
  display_name: string;
  id: string;
  status: string;
  user_id: string | null;
  visibility_status: string;
};

export type ChatGptConnectorMembershipStatusRow = {
  status: string;
  user_id: string;
};

export type ChatGptConnectorScheduleStatusFilter =
  | "active"
  | "all"
  | "cancelled"
  | "draft";

export type ChatGptConnectorScheduleAtTimeMatchMode =
  | "overlapping"
  | "starting_at";

export type ChatGptConnectorTemplatePreviewWeekday =
  (typeof TEMPLATE_PREVIEW_WEEKDAYS)[number];

export type ChatGptConnectorScheduleTemplatePreviewRuleInput = {
  class_type_id: string;
  coach_ids?: string[] | null;
  ends_at: string;
  slot_duration_minutes: number;
  starts_at: string;
  weekdays: string[];
};

export type ChatGptConnectorTemplatePreviewCoachSummary = {
  coach_id: string;
  display_name: string | null;
};

export type ChatGptConnectorScheduleTemplatePreviewBlock = {
  center_id: string;
  center_name: string;
  class_type_id: string;
  class_type_name: string;
  coach_names: string[];
  date: string;
  ends_at: string;
  starts_at: string;
};

export type ChatGptConnectorScheduleTemplatePreviewOutput = {
  preview_id: string;
  sample_blocks: ChatGptConnectorScheduleTemplatePreviewBlock[];
  summary: {
    center_id: string;
    center_name: string;
    date_from: string;
    date_to: string;
    range_days: number;
    sample_size: number;
    total_blocks: number;
    warnings_count: number;
  };
  warnings: string[];
};

export type ChatGptConnectorScheduleTemplateDraftBlock = {
  center_id: string;
  class_type_id: string;
  day_of_week: number;
  default_coach_profile_id: string | null;
  end_time: string;
  metadata: Record<string, string | number>;
  required_coaches: number;
  start_time: string;
};

export type ChatGptConnectorScheduleTemplateApplicationTemplate = {
  center_id: string | null;
  id: string;
  name: string;
  status: string;
  template_type: string;
  valid_from: string | null;
  valid_until: string | null;
};

export type ChatGptConnectorScheduleTemplateApplicationBlock = {
  center_id: string;
  class_type_id: string;
  day_of_week: number;
  default_coach_profile_id: string | null;
  end_time: string;
  id: string;
  required_coaches: number;
  start_time: string;
};

export type ChatGptConnectorScheduleTemplateApplicationCandidateBlock = {
  center_id: string;
  center_name: string;
  class_type_id: string;
  class_type_name: string;
  date: string;
  default_coach_id: string | null;
  default_coach_name: string | null;
  duplicate_of_schedule_block_id: string | null;
  ends_at: string;
  required_coaches: number;
  starts_at: string;
  template_block_id: string;
  will_create: boolean;
};

export type ChatGptConnectorScheduleTemplateApplicationDuplicate = {
  date: string;
  duplicate_of_schedule_block_id: string;
  ends_at: string;
  reason: "same_center_time_class_type" | "same_template_block_date";
  starts_at: string;
  template_block_id: string;
};

export type ChatGptConnectorScheduleTemplateApplicationConflict = {
  center_id?: string;
  coach_id?: string;
  code:
    | "center_time_overlap"
    | "coach_existing_schedule_conflict"
    | "coach_missing_certification"
    | "coach_overlap_in_plan";
  date: string;
  ends_at: string;
  existing_schedule_block_id?: string;
  starts_at: string;
  template_block_id: string;
};

export type ChatGptConnectorScheduleTemplateApplicationPlan = {
  candidate_blocks: ChatGptConnectorScheduleTemplateApplicationCandidateBlock[];
  conflicts: ChatGptConnectorScheduleTemplateApplicationConflict[];
  duplicate_blocks: ChatGptConnectorScheduleTemplateApplicationDuplicate[];
  plan_hash: string;
  summary: {
    blocks_to_create: number;
    center_id: string;
    center_name: string;
    conflict_count: number;
    date_from: string;
    date_to: string;
    duplicate_count: number;
    estimated_assignments_to_create: number;
    range_days: number;
    template_block_count: number;
    template_id: string;
    template_name: string;
    template_status: string;
    total_candidate_blocks: number;
    warnings_count: number;
  };
  warnings: string[];
};

export type ChatGptConnectorScheduleTemplateApplicationPlanSnapshot = {
  candidate_blocks: Array<{
    center_id: string;
    class_type_id: string;
    date: string;
    default_coach_id: string | null;
    ends_at: string;
    required_coaches: number;
    starts_at: string;
    template_block_id: string;
    will_create: boolean;
  }>;
  summary: {
    blocks_to_create: number;
    conflict_count: number;
    date_from: string;
    date_to: string;
    duplicate_count: number;
    estimated_assignments_to_create: number;
    skipped_duplicate_count: number;
    template_id: string;
    total_candidate_blocks: number;
  };
};

export type ChatGptConnectorConfirmationTokenParseResult =
  | {
      confirmation_id: string;
      ok: true;
      token_secret: string;
    }
  | {
      ok: false;
      reason:
        | "invalid_confirmation_id"
        | "invalid_format"
        | "invalid_secret";
    };

export type ChatGptConnectorScheduleCoachSummary = {
  assignment_status: string;
  coach_id: string;
  display_name: string | null;
};

export type ChatGptConnectorScheduleBlockSummary = {
  center_id: string;
  center_name: string | null;
  class_type_id: string;
  class_type_name: string | null;
  coaches: ChatGptConnectorScheduleCoachSummary[];
  coverage_status: ScheduleCoverageState;
  ends_at: string;
  schedule_block_id: string;
  starts_at: string;
  status: string;
};

export type ChatGptConnectorOwnCoachResolution =
  | {
      coach_profile_id: string;
      display_name: string;
      ok: true;
      person_profile_id: string;
    }
  | {
      ok: false;
      profile_count?: number;
      reason:
        | "ambiguous_coach_profile"
        | "missing_coach_profile"
        | "missing_person"
        | "profile_unlinked";
    };

export function createChatGptConnectorRequestId() {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replaceAll("-", "")
      : `${Date.now()}${Math.random().toString(16).slice(2)}`;

  return `corr_${random}`;
}

export function createChatGptConnectorSuccess<TData>({
  data,
  requestId,
  warnings = [],
}: {
  data: TData;
  requestId: string;
  warnings?: string[];
}): ChatGptConnectorToolResponse<TData> {
  return {
    data,
    ok: true,
    request_id: requestId,
    warnings,
  };
}

export function createChatGptConnectorError({
  code,
  details = {},
  requestId,
}: {
  code: ChatGptConnectorErrorCode;
  details?: Record<string, unknown>;
  requestId: string;
}): ChatGptConnectorToolResponse<never> {
  return {
    error: {
      code,
      details,
      message: getChatGptConnectorErrorMessage(code),
    },
    ok: false,
    request_id: requestId,
  };
}

export function getChatGptConnectorErrorMessage(
  code: ChatGptConnectorErrorCode,
) {
  const messages: Record<ChatGptConnectorErrorCode, string> = {
    authentication_required:
      "Inicia sesion en BoxOps para usar esta herramienta.",
    center_ambiguous: "Hay varios centros que coinciden. Elige uno.",
    center_not_found:
      "El centro no existe o no es visible para esta organizacion.",
    class_type_not_found:
      "El tipo de actividad no existe o no es visible para esta organizacion.",
    coach_not_found:
      "El entrenador no existe o no es asignable en esta organizacion.",
    confirmation_mismatch:
      "La confirmacion no corresponde a la accion actual.",
    confirmation_required:
      "Esta accion necesita confirmacion humana antes de aplicarse.",
    idempotency_conflict:
      "La clave de idempotencia no es valida o ya se uso con otro payload.",
    internal_error: "No se ha podido completar la consulta operativa.",
    invalid_date_range: "La fecha o el rango de fechas no es valido.",
    invalid_time_range: "La hora o el rango horario no es valido.",
    organization_required:
      "Elige una organizacion activa antes de consultar BoxOps.",
    permission_denied:
      "No tienes permiso para consultar esta informacion operativa.",
    schedule_not_found: "No hay horario que coincida con la consulta.",
    sensitive_scope_not_allowed:
      "Esa informacion queda fuera del alcance permitido para el conector.",
    template_not_applicable:
      "La plantilla no se puede aplicar con los datos actuales.",
    template_not_found:
      "La plantilla no existe o no es visible para esta organizacion.",
    template_preview_required:
      "Hace falta una previsualizacion valida y coincidente antes de crear el borrador.",
  };

  return messages[code];
}

export function getChatGptConnectorSensitiveScopeViolation(
  input: ChatGptConnectorSensitiveScopeInput,
) {
  if (
    input.include_contact_details ||
    input.include_documents ||
    input.include_location ||
    input.include_payroll ||
    input.include_private_notes ||
    input.include_sensitive ||
    input.include_time_tracking
  ) {
    return "sensitive-flag";
  }

  const requestedScope = input.requested_scope?.trim();

  if (!requestedScope) {
    return null;
  }

  return SENSITIVE_SCOPE_PATTERNS.some((pattern) =>
    pattern.test(requestedScope),
  )
    ? requestedScope
    : null;
}

export function getChatGptConnectorAccessError({
  accessMode,
  authenticated,
  requirePersonalAccess = false,
  requireOperationalManagement = false,
  resolutionOk,
  resolutionReason,
  role,
}: {
  accessMode?: "membership" | "platform_support" | null;
  authenticated: boolean;
  requirePersonalAccess?: boolean;
  requireOperationalManagement?: boolean;
  resolutionOk?: boolean;
  resolutionReason?:
    | "no_active_memberships"
    | "organization_not_found"
    | "organization_required"
    | null;
  role?: string | null;
}): ChatGptConnectorErrorCode | null {
  if (!authenticated) {
    return "authentication_required";
  }

  if (!resolutionOk) {
    return resolutionReason === "organization_required"
      ? "organization_required"
      : "permission_denied";
  }

  if (!role || !canReadOperationalData(role)) {
    return "permission_denied";
  }

  if (
    requireOperationalManagement &&
    (accessMode !== "membership" || !canManageOperationalData(role))
  ) {
    return "permission_denied";
  }

  if (
    requirePersonalAccess &&
    (accessMode !== "membership" || !canUsePersonalFeatures(role))
  ) {
    return "permission_denied";
  }

  return null;
}

export function normalizeChatGptConnectorDate(value: string | null | undefined) {
  if (!value || !DATE_PATTERN.test(value)) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return value;
}

function dateToUtcMs(value: string) {
  const [year, month, day] = value.split("-").map(Number);

  return Date.UTC(year, month - 1, day);
}

export function normalizeChatGptConnectorDateRange({
  dateFrom,
  dateTo,
  maxDays = CHATGPT_CONNECTOR_MAX_SCHEDULE_RANGE_DAYS,
}: {
  dateFrom: string | null | undefined;
  dateTo: string | null | undefined;
  maxDays?: number;
}):
  | {
      date_from: string;
      date_to: string;
      days: number;
      ok: true;
    }
  | {
      code: "invalid_date_range";
      details: Record<string, unknown>;
      ok: false;
    } {
  const normalizedFrom = normalizeChatGptConnectorDate(dateFrom);
  const normalizedTo = normalizeChatGptConnectorDate(dateTo);

  if (!normalizedFrom || !normalizedTo) {
    return {
      code: "invalid_date_range",
      details: { reason: "invalid_format" },
      ok: false,
    };
  }

  const fromMs = dateToUtcMs(normalizedFrom);
  const toMs = dateToUtcMs(normalizedTo);

  if (fromMs > toMs) {
    return {
      code: "invalid_date_range",
      details: { reason: "inverted_range" },
      ok: false,
    };
  }

  const days = Math.floor((toMs - fromMs) / 86_400_000) + 1;

  if (days > maxDays) {
    return {
      code: "invalid_date_range",
      details: { max_days: maxDays, reason: "range_too_large" },
      ok: false,
    };
  }

  return {
    date_from: normalizedFrom,
    date_to: normalizedTo,
    days,
    ok: true,
  };
}

export function normalizeChatGptConnectorTime(value: string | null | undefined) {
  const candidate = value?.slice(0, 5) ?? "";

  return TIME_PATTERN.test(candidate) ? candidate : null;
}

export function formatChatGptConnectorTime(value: string) {
  return normalizeChatGptConnectorTime(value) ?? value;
}

export function getChatGptConnectorTimeMinutes(value: string) {
  const [hours, minutes] = formatChatGptConnectorTime(value)
    .split(":")
    .map(Number);

  return hours * 60 + minutes;
}

function normalizeLookupName(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function toCenterCandidate(center: ChatGptConnectorCenterRow) {
  return {
    center_id: center.id,
    name: center.name,
  };
}

export function resolveChatGptConnectorCenterReference({
  center_id: centerId,
  center_name: centerName,
  centers,
}: ChatGptConnectorCenterReferenceInput & {
  centers: ChatGptConnectorCenterRow[];
}):
  | {
      center: ChatGptConnectorCenterRow | null;
      ok: true;
    }
  | {
      code: "center_ambiguous" | "center_not_found";
      details: Record<string, unknown>;
      ok: false;
    } {
  if (centerId) {
    if (!isPostgresUuid(centerId)) {
      return { code: "center_not_found", details: {}, ok: false };
    }

    const center = centers.find((candidate) => candidate.id === centerId);

    return center
      ? { center, ok: true }
      : { code: "center_not_found", details: {}, ok: false };
  }

  const normalizedName = centerName ? normalizeLookupName(centerName) : "";

  if (!normalizedName) {
    return { center: null, ok: true };
  }

  const exactMatches = centers.filter(
    (center) => normalizeLookupName(center.name) === normalizedName,
  );
  const candidates =
    exactMatches.length > 0
      ? exactMatches
      : centers.filter((center) =>
          normalizeLookupName(center.name).includes(normalizedName),
        );

  if (candidates.length === 0) {
    return { code: "center_not_found", details: {}, ok: false };
  }

  if (candidates.length > 1) {
    return {
      code: "center_ambiguous",
      details: { candidates: candidates.slice(0, 8).map(toCenterCandidate) },
      ok: false,
    };
  }

  return { center: candidates[0], ok: true };
}

export function resolveChatGptConnectorClassTypeReference({
  class_type_id: classTypeId,
  class_type_name: classTypeName,
  classTypes,
}: ChatGptConnectorClassTypeReferenceInput & {
  classTypes: ChatGptConnectorClassTypeRow[];
}):
  | {
      classType: ChatGptConnectorClassTypeRow | null;
      ok: true;
    }
  | {
      code: "class_type_not_found";
      details: Record<string, unknown>;
      ok: false;
    } {
  if (classTypeId) {
    if (!isPostgresUuid(classTypeId)) {
      return { code: "class_type_not_found", details: {}, ok: false };
    }

    const classType = classTypes.find(
      (candidate) => candidate.id === classTypeId,
    );

    return classType
      ? { classType, ok: true }
      : { code: "class_type_not_found", details: {}, ok: false };
  }

  const normalizedName = classTypeName
    ? normalizeLookupName(classTypeName)
    : "";

  if (!normalizedName) {
    return { classType: null, ok: true };
  }

  const exactMatches = classTypes.filter(
    (classType) => normalizeLookupName(classType.name) === normalizedName,
  );
  const candidates =
    exactMatches.length > 0
      ? exactMatches
      : classTypes.filter((classType) =>
          normalizeLookupName(classType.name).includes(normalizedName),
        );

  if (candidates.length !== 1) {
    return {
      code: "class_type_not_found",
      details:
        candidates.length > 1
          ? {
              candidates: candidates.slice(0, 8).map((classType) => ({
                class_type_id: classType.id,
                name: classType.name,
              })),
              reason: "ambiguous_match",
            }
          : {},
      ok: false,
    };
  }

  return { classType: candidates[0], ok: true };
}

export function matchesChatGptConnectorScheduleStatus({
  blockStatus,
  filter,
}: {
  blockStatus: string;
  filter: ChatGptConnectorScheduleStatusFilter;
}) {
  if (filter === "all") {
    return true;
  }

  if (filter === "cancelled") {
    return blockStatus === "cancelled";
  }

  if (filter === "draft") {
    return blockStatus === "draft";
  }

  return ACTIVE_SCHEDULE_BLOCK_STATUSES.includes(blockStatus);
}

export function filterChatGptConnectorScheduleBlocksAtTime({
  blocks,
  matchMode,
  time,
}: {
  blocks: ChatGptConnectorScheduleBlockRow[];
  matchMode: ChatGptConnectorScheduleAtTimeMatchMode;
  time: string;
}) {
  const targetMinutes = getChatGptConnectorTimeMinutes(time);

  return blocks.filter((block) => {
    const startMinutes = getChatGptConnectorTimeMinutes(block.start_time);
    const endMinutes = getChatGptConnectorTimeMinutes(block.end_time);

    if (matchMode === "starting_at") {
      return startMinutes === targetMinutes;
    }

    return startMinutes <= targetMinutes && targetMinutes < endMinutes;
  });
}

function addDaysToConnectorDate(dateString: string, days: number) {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  date.setUTCDate(date.getUTCDate() + days);

  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function getConnectorIsoDayOfWeek(dateString: string) {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return ((date.getUTCDay() + 6) % 7) + 1;
}

function formatMinutesAsConnectorTime(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function stableStringifyConnectorValue(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringifyConnectorValue).join(",")}]`;
  }

  const record = value as Record<string, unknown>;

  return `{${Object.keys(record)
    .sort()
    .map(
      (key) =>
        `${JSON.stringify(key)}:${stableStringifyConnectorValue(record[key])}`,
    )
    .join(",")}}`;
}

function hashConnectorPreviewPayload(value: string) {
  let first = 0x811c9dc5;
  let second = 0x01000193;

  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);

    first ^= code;
    first = Math.imul(first, 0x01000193);
    second ^= code + index;
    second = Math.imul(second, 0x811c9dc5);
  }

  return `${(first >>> 0).toString(36)}${(second >>> 0).toString(36)}`;
}

export function createChatGptConnectorStablePayloadHash(payload: unknown) {
  return hashConnectorPreviewPayload(stableStringifyConnectorValue(payload));
}

export function createChatGptConnectorTemplatePreviewId(payload: unknown) {
  return `prev_${createChatGptConnectorStablePayloadHash(payload)}`;
}

export function createChatGptConnectorConfirmationToken({
  confirmationId,
  tokenSecret,
}: {
  confirmationId: string;
  tokenSecret: string;
}) {
  return `${CONFIRMATION_TOKEN_PREFIX}.${confirmationId}.${tokenSecret}`;
}

export function parseChatGptConnectorConfirmationToken(
  value: string | null | undefined,
): ChatGptConnectorConfirmationTokenParseResult {
  const parts = value?.trim().split(".") ?? [];

  if (
    parts.length !== 3 ||
    parts[0] !== CONFIRMATION_TOKEN_PREFIX
  ) {
    return {
      ok: false,
      reason: "invalid_format",
    };
  }

  const confirmationId = parts[1];
  const tokenSecret = parts[2];

  if (!isPostgresUuid(confirmationId)) {
    return {
      ok: false,
      reason: "invalid_confirmation_id",
    };
  }

  if (!CONFIRMATION_TOKEN_SECRET_PATTERN.test(tokenSecret)) {
    return {
      ok: false,
      reason: "invalid_secret",
    };
  }

  return {
    confirmation_id: confirmationId,
    ok: true,
    token_secret: tokenSecret,
  };
}

export function buildChatGptConnectorScheduleTemplateApplicationPlanSnapshot(
  plan: ChatGptConnectorScheduleTemplateApplicationPlan,
): ChatGptConnectorScheduleTemplateApplicationPlanSnapshot {
  return {
    candidate_blocks: plan.candidate_blocks.map((block) => ({
      center_id: block.center_id,
      class_type_id: block.class_type_id,
      date: block.date,
      default_coach_id: block.default_coach_id,
      ends_at: block.ends_at,
      required_coaches: block.required_coaches,
      starts_at: block.starts_at,
      template_block_id: block.template_block_id,
      will_create: block.will_create,
    })),
    summary: {
      blocks_to_create: plan.summary.blocks_to_create,
      conflict_count: plan.summary.conflict_count,
      date_from: plan.summary.date_from,
      date_to: plan.summary.date_to,
      duplicate_count: plan.summary.duplicate_count,
      estimated_assignments_to_create:
        plan.summary.estimated_assignments_to_create,
      skipped_duplicate_count: plan.summary.duplicate_count,
      template_id: plan.summary.template_id,
      total_candidate_blocks: plan.summary.total_candidate_blocks,
    },
  };
}

function isDateWithinScheduleTemplateApplicationValidity({
  date,
  template,
}: {
  date: string;
  template: ChatGptConnectorScheduleTemplateApplicationTemplate;
}) {
  if (template.valid_from && date < template.valid_from) {
    return false;
  }

  if (template.valid_until && date > template.valid_until) {
    return false;
  }

  return true;
}

function getScheduleTemplateApplicationDuplicate({
  existingBlocks,
  candidate,
  template,
}: {
  candidate: {
    center_id: string;
    class_type_id: string;
    date: string;
    ends_at: string;
    starts_at: string;
    template_block_id: string;
  };
  existingBlocks: ChatGptConnectorScheduleBlockRow[];
  template: ChatGptConnectorScheduleTemplateApplicationTemplate;
}) {
  const exactDuplicate = existingBlocks.find(
    (block) =>
      block.template_id === template.id &&
      block.template_block_id === candidate.template_block_id &&
      block.service_date === candidate.date,
  );

  if (exactDuplicate) {
    return {
      block: exactDuplicate,
      reason: "same_template_block_date" as const,
    };
  }

  const sameOperationalSlot = existingBlocks.find(
    (block) =>
      block.center_id === candidate.center_id &&
      block.class_type_id === candidate.class_type_id &&
      block.service_date === candidate.date &&
      formatChatGptConnectorTime(block.start_time) === candidate.starts_at &&
      formatChatGptConnectorTime(block.end_time) === candidate.ends_at,
  );

  return sameOperationalSlot
    ? {
        block: sameOperationalSlot,
        reason: "same_center_time_class_type" as const,
      }
    : null;
}

function sortScheduleTemplateApplicationPlan(
  plan: Omit<ChatGptConnectorScheduleTemplateApplicationPlan, "plan_hash">,
) {
  plan.candidate_blocks.sort(
    (first, second) =>
      first.date.localeCompare(second.date) ||
      first.starts_at.localeCompare(second.starts_at) ||
      first.ends_at.localeCompare(second.ends_at) ||
      first.template_block_id.localeCompare(second.template_block_id),
  );
  plan.duplicate_blocks.sort(
    (first, second) =>
      first.date.localeCompare(second.date) ||
      first.starts_at.localeCompare(second.starts_at) ||
      first.template_block_id.localeCompare(second.template_block_id),
  );
  plan.conflicts.sort(
    (first, second) =>
      first.date.localeCompare(second.date) ||
      first.starts_at.localeCompare(second.starts_at) ||
      first.code.localeCompare(second.code) ||
      first.template_block_id.localeCompare(second.template_block_id),
  );

  return plan;
}

export function buildChatGptConnectorScheduleTemplateApplicationPlan({
  activeCoachCertificationKeys = [],
  center,
  classTypes,
  coachSummaries,
  dateFrom,
  dateTo,
  existingAssignments = [],
  existingBlocks = [],
  initialWarnings = [],
  maxBlocks = CHATGPT_CONNECTOR_MAX_TEMPLATE_PREVIEW_BLOCKS,
  template,
  templateBlocks,
}: {
  activeCoachCertificationKeys?: string[];
  center: ChatGptConnectorCenterRow;
  classTypes: ChatGptConnectorClassTypeRow[];
  coachSummaries: ChatGptConnectorTemplatePreviewCoachSummary[];
  dateFrom: string;
  dateTo: string;
  existingAssignments?: ChatGptConnectorAssignmentRow[];
  existingBlocks?: ChatGptConnectorScheduleBlockRow[];
  initialWarnings?: string[];
  maxBlocks?: number;
  template: ChatGptConnectorScheduleTemplateApplicationTemplate;
  templateBlocks: ChatGptConnectorScheduleTemplateApplicationBlock[];
}):
  | {
      ok: true;
      plan: ChatGptConnectorScheduleTemplateApplicationPlan;
    }
  | {
      code: "invalid_date_range" | "template_not_applicable";
      details: Record<string, unknown>;
      ok: false;
    } {
  if (template.template_type !== "weekly") {
    return {
      code: "template_not_applicable",
      details: { reason: "template_type_not_weekly" },
      ok: false,
    };
  }

  if (template.status !== "draft" && template.status !== "active") {
    return {
      code: "template_not_applicable",
      details: { reason: "template_status_not_allowed" },
      ok: false,
    };
  }

  if (template.center_id && template.center_id !== center.id) {
    return {
      code: "template_not_applicable",
      details: { reason: "template_center_mismatch" },
      ok: false,
    };
  }

  if (templateBlocks.length === 0) {
    return {
      code: "template_not_applicable",
      details: { reason: "template_empty" },
      ok: false,
    };
  }

  const warnings = new Set(initialWarnings);
  const classTypesById = new Map(
    classTypes.map((classType) => [classType.id, classType]),
  );
  const coachSummariesById = new Map(
    coachSummaries.map((coach) => [coach.coach_id, coach]),
  );
  const certificationKeys = new Set(activeCoachCertificationKeys);
  const normalizedTemplateBlocks: Array<
    ChatGptConnectorScheduleTemplateApplicationBlock & {
      classType: ChatGptConnectorClassTypeRow;
      endsAt: string;
      startsAt: string;
    }
  > = [];

  for (const block of templateBlocks) {
    const startsAt = normalizeChatGptConnectorTime(block.start_time);
    const endsAt = normalizeChatGptConnectorTime(block.end_time);
    const classType = classTypesById.get(block.class_type_id);

    if (block.center_id !== center.id) {
      return {
        code: "template_not_applicable",
        details: {
          reason: "template_block_center_mismatch",
          template_block_id: block.id,
        },
        ok: false,
      };
    }

    if (
      !Number.isInteger(block.day_of_week) ||
      block.day_of_week < 1 ||
      block.day_of_week > 7 ||
      !startsAt ||
      !endsAt ||
      getChatGptConnectorTimeMinutes(startsAt) >=
        getChatGptConnectorTimeMinutes(endsAt)
    ) {
      return {
        code: "template_not_applicable",
        details: {
          reason: "invalid_template_block",
          template_block_id: block.id,
        },
        ok: false,
      };
    }

    if (!classType || classType.status !== "active") {
      return {
        code: "template_not_applicable",
        details: {
          class_type_id: block.class_type_id,
          reason: "class_type_not_active",
          template_block_id: block.id,
        },
        ok: false,
      };
    }

    if (
      block.required_coaches > 0 &&
      block.default_coach_profile_id &&
      !coachSummariesById.has(block.default_coach_profile_id)
    ) {
      return {
        code: "template_not_applicable",
        details: {
          coach_id: block.default_coach_profile_id,
          reason: "default_coach_not_assignable",
          template_block_id: block.id,
        },
        ok: false,
      };
    }

    if (block.required_coaches <= 0 && block.default_coach_profile_id) {
      warnings.add("default_coach_ignored_without_requirement");
    }

    if (block.required_coaches > 0 && !block.default_coach_profile_id) {
      warnings.add("required_coaches_without_default_coach");
    }

    normalizedTemplateBlocks.push({
      ...block,
      classType,
      endsAt,
      startsAt,
    });
  }

  normalizedTemplateBlocks.sort(
    (first, second) =>
      first.day_of_week - second.day_of_week ||
      first.startsAt.localeCompare(second.startsAt) ||
      first.endsAt.localeCompare(second.endsAt) ||
      first.id.localeCompare(second.id),
  );

  const activeExistingBlocks = existingBlocks.filter((block) =>
    isCoverageActiveBlock(block.status),
  );
  const activeExistingBlocksById = new Map(
    activeExistingBlocks.map((block) => [block.id, block]),
  );
  const activeExistingAssignments = existingAssignments.filter(
    (assignment) => assignment.assignment_status === "assigned",
  );
  const assignmentsByCoachId = new Map<string, ChatGptConnectorAssignmentRow[]>();

  for (const assignment of activeExistingAssignments) {
    const assignments = assignmentsByCoachId.get(assignment.coach_profile_id) ?? [];

    assignments.push(assignment);
    assignmentsByCoachId.set(assignment.coach_profile_id, assignments);
  }

  const candidateBlocks: ChatGptConnectorScheduleTemplateApplicationCandidateBlock[] =
    [];
  const duplicateBlocks: ChatGptConnectorScheduleTemplateApplicationDuplicate[] =
    [];
  const conflicts: ChatGptConnectorScheduleTemplateApplicationConflict[] = [];
  const planCoachBlocksByCoachAndDate = new Map<
    string,
    Array<{
      ends_at: string;
      starts_at: string;
      template_block_id: string;
    }>
  >();
  let skippedForTemplateValidity = false;
  let currentDate = dateFrom;

  while (currentDate <= dateTo) {
    const dayOfWeek = getConnectorIsoDayOfWeek(currentDate);

    for (const block of normalizedTemplateBlocks) {
      if (block.day_of_week !== dayOfWeek) {
        continue;
      }

      if (
        !isDateWithinScheduleTemplateApplicationValidity({
          date: currentDate,
          template,
        })
      ) {
        skippedForTemplateValidity = true;
        continue;
      }

      const defaultCoachId =
        block.required_coaches > 0 ? block.default_coach_profile_id : null;
      const defaultCoachSummary = defaultCoachId
        ? coachSummariesById.get(defaultCoachId)
        : null;
      const duplicate = getScheduleTemplateApplicationDuplicate({
        candidate: {
          center_id: block.center_id,
          class_type_id: block.class_type_id,
          date: currentDate,
          ends_at: block.endsAt,
          starts_at: block.startsAt,
          template_block_id: block.id,
        },
        existingBlocks: activeExistingBlocks,
        template,
      });
      const willCreate = !duplicate;

      candidateBlocks.push({
        center_id: center.id,
        center_name: center.name,
        class_type_id: block.class_type_id,
        class_type_name: block.classType.name,
        date: currentDate,
        default_coach_id: defaultCoachId,
        default_coach_name: defaultCoachSummary?.display_name ?? null,
        duplicate_of_schedule_block_id: duplicate?.block.id ?? null,
        ends_at: block.endsAt,
        required_coaches: block.required_coaches,
        starts_at: block.startsAt,
        template_block_id: block.id,
        will_create: willCreate,
      });

      if (candidateBlocks.length > maxBlocks) {
        return {
          code: "invalid_date_range",
          details: {
            max_blocks: maxBlocks,
            reason: "application_plan_too_large",
          },
          ok: false,
        };
      }

      if (duplicate) {
        duplicateBlocks.push({
          date: currentDate,
          duplicate_of_schedule_block_id: duplicate.block.id,
          ends_at: block.endsAt,
          reason: duplicate.reason,
          starts_at: block.startsAt,
          template_block_id: block.id,
        });
        continue;
      }

      const overlappingCenterBlock = activeExistingBlocks.find(
        (existingBlock) =>
          existingBlock.center_id === block.center_id &&
          existingBlock.service_date === currentDate &&
          templatePreviewTimeRangesOverlap({
            firstEnd: existingBlock.end_time,
            firstStart: existingBlock.start_time,
            secondEnd: block.endsAt,
            secondStart: block.startsAt,
          }),
      );

      if (overlappingCenterBlock) {
        conflicts.push({
          center_id: center.id,
          code: "center_time_overlap",
          date: currentDate,
          ends_at: block.endsAt,
          existing_schedule_block_id: overlappingCenterBlock.id,
          starts_at: block.startsAt,
          template_block_id: block.id,
        });
      }

      if (defaultCoachId) {
        const classTypeCertificationId = block.classType.certification_id;

        if (
          classTypeCertificationId &&
          !certificationKeys.has(`${defaultCoachId}:${classTypeCertificationId}`)
        ) {
          conflicts.push({
            coach_id: defaultCoachId,
            code: "coach_missing_certification",
            date: currentDate,
            ends_at: block.endsAt,
            starts_at: block.startsAt,
            template_block_id: block.id,
          });
        }

        const existingCoachConflict = (
          assignmentsByCoachId.get(defaultCoachId) ?? []
        ).find((assignment) => {
          const existingBlock = activeExistingBlocksById.get(
            assignment.schedule_block_id,
          );

          return (
            existingBlock?.service_date === currentDate &&
            templatePreviewTimeRangesOverlap({
              firstEnd: existingBlock.end_time,
              firstStart: existingBlock.start_time,
              secondEnd: block.endsAt,
              secondStart: block.startsAt,
            })
          );
        });

        if (existingCoachConflict) {
          conflicts.push({
            coach_id: defaultCoachId,
            code: "coach_existing_schedule_conflict",
            date: currentDate,
            ends_at: block.endsAt,
            existing_schedule_block_id: existingCoachConflict.schedule_block_id,
            starts_at: block.startsAt,
            template_block_id: block.id,
          });
        }

        const coachDateKey = `${defaultCoachId}:${currentDate}`;
        const existingPlanCoachBlocks =
          planCoachBlocksByCoachAndDate.get(coachDateKey) ?? [];
        const overlappingPlanBlock = existingPlanCoachBlocks.find((planBlock) =>
          templatePreviewTimeRangesOverlap({
            firstEnd: planBlock.ends_at,
            firstStart: planBlock.starts_at,
            secondEnd: block.endsAt,
            secondStart: block.startsAt,
          }),
        );

        if (overlappingPlanBlock) {
          conflicts.push({
            coach_id: defaultCoachId,
            code: "coach_overlap_in_plan",
            date: currentDate,
            ends_at: block.endsAt,
            starts_at: block.startsAt,
            template_block_id: block.id,
          });
        }

        existingPlanCoachBlocks.push({
          ends_at: block.endsAt,
          starts_at: block.startsAt,
          template_block_id: block.id,
        });
        planCoachBlocksByCoachAndDate.set(
          coachDateKey,
          existingPlanCoachBlocks,
        );
      }
    }

    currentDate = addDaysToConnectorDate(currentDate, 1);
  }

  if (skippedForTemplateValidity) {
    warnings.add("requested_range_trimmed_to_template_validity");
  }

  if (candidateBlocks.length === 0) {
    return {
      code: "template_not_applicable",
      details: { reason: "template_out_of_range" },
      ok: false,
    };
  }

  if (duplicateBlocks.length > 0) {
    warnings.add("predictable_duplicates_found");
  }

  if (conflicts.length > 0) {
    warnings.add("application_conflicts_found");
  }

  const uniqueWarnings = [...warnings].sort();
  const blocksToCreate = candidateBlocks.filter((block) => block.will_create);
  const planWithoutHash = sortScheduleTemplateApplicationPlan({
    candidate_blocks: candidateBlocks,
    conflicts,
    duplicate_blocks: duplicateBlocks,
    summary: {
      blocks_to_create: blocksToCreate.length,
      center_id: center.id,
      center_name: center.name,
      conflict_count: conflicts.length,
      date_from: dateFrom,
      date_to: dateTo,
      duplicate_count: duplicateBlocks.length,
      estimated_assignments_to_create: blocksToCreate.filter(
        (block) => block.default_coach_id,
      ).length,
      range_days:
        Math.floor((dateToUtcMs(dateTo) - dateToUtcMs(dateFrom)) / 86_400_000) +
        1,
      template_block_count: templateBlocks.length,
      template_id: template.id,
      template_name: template.name,
      template_status: template.status,
      total_candidate_blocks: candidateBlocks.length,
      warnings_count: uniqueWarnings.length,
    },
    warnings: uniqueWarnings,
  });
  const planHash = createChatGptConnectorStablePayloadHash(planWithoutHash);

  return {
    ok: true,
    plan: {
      ...planWithoutHash,
      plan_hash: planHash,
    },
  };
}

function normalizeTemplatePreviewName({
  name,
  warnings,
}: {
  name: string | null | undefined;
  warnings: string[];
}) {
  const normalizedName = name?.trim().replace(/\s+/g, " ") ?? "";

  if (!normalizedName) {
    warnings.push("template_name_missing");

    return "Untitled preview";
  }

  if (normalizedName.length > 120) {
    warnings.push("template_name_truncated_to_120_characters");

    return normalizedName.slice(0, 120);
  }

  return normalizedName;
}

function normalizeTemplatePreviewWeekdays(value: string[]) {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }

  const days = new Set<number>();

  for (const weekday of value) {
    const day = TEMPLATE_PREVIEW_WEEKDAY_TO_DAY.get(
      weekday as ChatGptConnectorTemplatePreviewWeekday,
    );

    if (!day) {
      return null;
    }

    days.add(day);
  }

  return [...days].sort((first, second) => first - second);
}

function normalizeTemplatePreviewCoachIds(value: string[] | null | undefined) {
  if (!value) {
    return [];
  }

  if (!Array.isArray(value)) {
    return null;
  }

  const coachIds: string[] = [];

  for (const coachId of value) {
    if (!isPostgresUuid(coachId)) {
      return null;
    }

    if (!coachIds.includes(coachId)) {
      coachIds.push(coachId);
    }
  }

  return coachIds;
}

function templatePreviewTimeRangesOverlap({
  firstEnd,
  firstStart,
  secondEnd,
  secondStart,
}: {
  firstEnd: string;
  firstStart: string;
  secondEnd: string;
  secondStart: string;
}) {
  return (
    getChatGptConnectorTimeMinutes(firstStart) <
      getChatGptConnectorTimeMinutes(secondEnd) &&
    getChatGptConnectorTimeMinutes(secondStart) <
      getChatGptConnectorTimeMinutes(firstEnd)
  );
}

function buildTemplatePreviewConflictWarnings(
  blocks: Array<{
    coach_ids: string[];
    date: string;
    ends_at: string;
    starts_at: string;
  }>,
) {
  const warnings: string[] = [];
  const blocksByCoachAndDate = new Map<
    string,
    Array<{
      ends_at: string;
      starts_at: string;
    }>
  >();
  const warnedKeys = new Set<string>();

  for (const block of blocks) {
    for (const coachId of block.coach_ids) {
      const key = `${coachId}:${block.date}`;
      const existingBlocks = blocksByCoachAndDate.get(key) ?? [];

      if (
        existingBlocks.some((existingBlock) =>
          templatePreviewTimeRangesOverlap({
            firstEnd: existingBlock.ends_at,
            firstStart: existingBlock.starts_at,
            secondEnd: block.ends_at,
            secondStart: block.starts_at,
          }),
        ) &&
        !warnedKeys.has(key)
      ) {
        warnings.push(
          `coach_overlap_in_preview:${coachId}:${block.date}`,
        );
        warnedKeys.add(key);
      }

      existingBlocks.push({
        ends_at: block.ends_at,
        starts_at: block.starts_at,
      });
      blocksByCoachAndDate.set(key, existingBlocks);
    }
  }

  return warnings;
}

function buildTemplatePreviewExistingScheduleWarnings({
  assignments,
  blocks,
  previewBlocks,
}: {
  assignments: ChatGptConnectorAssignmentRow[];
  blocks: ChatGptConnectorScheduleBlockRow[];
  previewBlocks: Array<{
    coach_ids: string[];
    date: string;
    ends_at: string;
    starts_at: string;
  }>;
}) {
  const warnings: string[] = [];
  const activeBlocksById = new Map(
    blocks
      .filter((block) => isCoverageActiveBlock(block.status))
      .map((block) => [block.id, block]),
  );
  const assignmentsByCoachId = new Map<string, ChatGptConnectorAssignmentRow[]>();
  const warnedKeys = new Set<string>();

  for (const assignment of assignments) {
    if (assignment.assignment_status !== "assigned") {
      continue;
    }

    const block = activeBlocksById.get(assignment.schedule_block_id);

    if (!block) {
      continue;
    }

    const coachAssignments =
      assignmentsByCoachId.get(assignment.coach_profile_id) ?? [];
    coachAssignments.push(assignment);
    assignmentsByCoachId.set(assignment.coach_profile_id, coachAssignments);
  }

  for (const previewBlock of previewBlocks) {
    for (const coachId of previewBlock.coach_ids) {
      const existingAssignments = assignmentsByCoachId.get(coachId) ?? [];
      const hasConflict = existingAssignments.some((assignment) => {
        const existingBlock = activeBlocksById.get(assignment.schedule_block_id);

        return (
          existingBlock?.service_date === previewBlock.date &&
          templatePreviewTimeRangesOverlap({
            firstEnd: existingBlock.end_time,
            firstStart: existingBlock.start_time,
            secondEnd: previewBlock.ends_at,
            secondStart: previewBlock.starts_at,
          })
        );
      });
      const warningKey = `${coachId}:${previewBlock.date}`;

      if (hasConflict && !warnedKeys.has(warningKey)) {
        warnings.push(`coach_existing_schedule_conflict:${coachId}:${previewBlock.date}`);
        warnedKeys.add(warningKey);
      }
    }
  }

  return warnings;
}

export function buildChatGptConnectorScheduleTemplatePreview({
  center,
  classTypes,
  coachSummaries,
  dateFrom,
  dateTo,
  existingAssignments = [],
  existingBlocks = [],
  initialWarnings = [],
  maxBlocks = CHATGPT_CONNECTOR_MAX_TEMPLATE_PREVIEW_BLOCKS,
  name,
  organizationId,
  rules,
}: {
  center: ChatGptConnectorCenterRow;
  classTypes: ChatGptConnectorClassTypeRow[];
  coachSummaries: ChatGptConnectorTemplatePreviewCoachSummary[];
  dateFrom: string;
  dateTo: string;
  existingAssignments?: ChatGptConnectorAssignmentRow[];
  existingBlocks?: ChatGptConnectorScheduleBlockRow[];
  initialWarnings?: string[];
  maxBlocks?: number;
  name: string | null | undefined;
  organizationId: string;
  rules: ChatGptConnectorScheduleTemplatePreviewRuleInput[];
}):
  | {
      ok: true;
      preview: ChatGptConnectorScheduleTemplatePreviewOutput;
    }
  | {
      code:
        | "class_type_not_found"
        | "coach_not_found"
        | "invalid_date_range"
        | "invalid_time_range";
      details: Record<string, unknown>;
      ok: false;
    } {
  const warnings: string[] = [...initialWarnings];
  const normalizedName = normalizeTemplatePreviewName({ name, warnings });
  const classTypesById = new Map(
    classTypes.map((classType) => [classType.id, classType]),
  );
  const coachSummariesById = new Map(
    coachSummaries.map((coach) => [coach.coach_id, coach]),
  );

  if (!Array.isArray(rules) || rules.length === 0) {
    return {
      code: "invalid_time_range",
      details: { reason: "missing_rules" },
      ok: false,
    };
  }

  const normalizedRules: Array<{
    classType: ChatGptConnectorClassTypeRow;
    coachIds: string[];
    endMinutes: number;
    endsAt: string;
    ruleIndex: number;
    slotDurationMinutes: number;
    startMinutes: number;
    startsAt: string;
    weekdays: number[];
  }> = [];

  for (const [index, rule] of rules.entries()) {
    const ruleIndex = index + 1;
    const weekdays = normalizeTemplatePreviewWeekdays(rule.weekdays);
    const startsAt = normalizeChatGptConnectorTime(rule.starts_at);
    const endsAt = normalizeChatGptConnectorTime(rule.ends_at);
    const slotDurationMinutes = Number(rule.slot_duration_minutes);

    if (!weekdays) {
      return {
        code: "invalid_date_range",
        details: { reason: "invalid_weekdays", rule_index: ruleIndex },
        ok: false,
      };
    }

    if (
      !startsAt ||
      !endsAt ||
      !Number.isInteger(slotDurationMinutes) ||
      slotDurationMinutes < 15 ||
      slotDurationMinutes > 240 ||
      slotDurationMinutes % 5 !== 0
    ) {
      return {
        code: "invalid_time_range",
        details: { reason: "invalid_rule_time", rule_index: ruleIndex },
        ok: false,
      };
    }

    const startMinutes = getChatGptConnectorTimeMinutes(startsAt);
    const endMinutes = getChatGptConnectorTimeMinutes(endsAt);

    if (startMinutes >= endMinutes || startMinutes + slotDurationMinutes > endMinutes) {
      return {
        code: "invalid_time_range",
        details: { reason: "invalid_rule_range", rule_index: ruleIndex },
        ok: false,
      };
    }

    if (!isPostgresUuid(rule.class_type_id)) {
      return {
        code: "class_type_not_found",
        details: { rule_index: ruleIndex },
        ok: false,
      };
    }

    const classType = classTypesById.get(rule.class_type_id);

    if (!classType || classType.status !== "active") {
      return {
        code: "class_type_not_found",
        details: { rule_index: ruleIndex },
        ok: false,
      };
    }

    const coachIds = normalizeTemplatePreviewCoachIds(rule.coach_ids);

    if (!coachIds) {
      return {
        code: "coach_not_found",
        details: { reason: "invalid_coach_id", rule_index: ruleIndex },
        ok: false,
      };
    }

    const missingCoachIds = coachIds.filter(
      (coachId) => !coachSummariesById.has(coachId),
    );

    if (missingCoachIds.length > 0) {
      return {
        code: "coach_not_found",
        details: { coach_ids: missingCoachIds, rule_index: ruleIndex },
        ok: false,
      };
    }

    if (endMinutes - startMinutes > slotDurationMinutes) {
      const remainder = (endMinutes - startMinutes) % slotDurationMinutes;

      if (remainder > 0) {
        warnings.push(`rule_${ruleIndex}_partial_slot_ignored`);
      }
    }

    if (
      classType.required_coaches > 0 &&
      coachIds.length > classType.required_coaches
    ) {
      warnings.push(`rule_${ruleIndex}_has_more_coaches_than_required`);
    }

    normalizedRules.push({
      classType,
      coachIds,
      endMinutes,
      endsAt,
      ruleIndex,
      slotDurationMinutes,
      startMinutes,
      startsAt,
      weekdays,
    });
  }

  const expandedBlocks: Array<ChatGptConnectorScheduleTemplatePreviewBlock & {
    coach_ids: string[];
  }> = [];
  let currentDate = dateFrom;

  while (currentDate <= dateTo) {
    const isoDayOfWeek = getConnectorIsoDayOfWeek(currentDate);

    for (const rule of normalizedRules) {
      if (!rule.weekdays.includes(isoDayOfWeek)) {
        continue;
      }

      for (
        let startsAtMinutes = rule.startMinutes;
        startsAtMinutes + rule.slotDurationMinutes <= rule.endMinutes;
        startsAtMinutes += rule.slotDurationMinutes
      ) {
        const endsAtMinutes = startsAtMinutes + rule.slotDurationMinutes;
        const coachNames = rule.coachIds.flatMap((coachId) => {
          const displayName = coachSummariesById.get(coachId)?.display_name?.trim();

          return displayName ? [displayName] : [];
        });

        expandedBlocks.push({
          center_id: center.id,
          center_name: center.name,
          class_type_id: rule.classType.id,
          class_type_name: rule.classType.name,
          coach_ids: rule.coachIds,
          coach_names: coachNames,
          date: currentDate,
          ends_at: formatMinutesAsConnectorTime(endsAtMinutes),
          starts_at: formatMinutesAsConnectorTime(startsAtMinutes),
        });

        if (expandedBlocks.length > maxBlocks) {
          return {
            code: "invalid_date_range",
            details: {
              max_blocks: maxBlocks,
              reason: "preview_too_large",
            },
            ok: false,
          };
        }
      }
    }

    currentDate = addDaysToConnectorDate(currentDate, 1);
  }

  expandedBlocks.sort(
    (first, second) =>
      first.date.localeCompare(second.date) ||
      first.starts_at.localeCompare(second.starts_at) ||
      first.ends_at.localeCompare(second.ends_at) ||
      first.class_type_name.localeCompare(second.class_type_name, "es"),
  );
  warnings.push(...buildTemplatePreviewConflictWarnings(expandedBlocks));
  warnings.push(
    ...buildTemplatePreviewExistingScheduleWarnings({
      assignments: existingAssignments,
      blocks: existingBlocks,
      previewBlocks: expandedBlocks,
    }),
  );

  const uniqueWarnings = [...new Set(warnings)];
  const previewPayload = {
    center_id: center.id,
    date_from: dateFrom,
    date_to: dateTo,
    name: normalizedName,
    organization_id: organizationId,
    rules: normalizedRules.map((rule) => ({
      class_type_id: rule.classType.id,
      coach_ids: rule.coachIds,
      ends_at: rule.endsAt,
      slot_duration_minutes: rule.slotDurationMinutes,
      starts_at: rule.startsAt,
      weekdays: rule.weekdays,
    })),
    total_blocks: expandedBlocks.length,
  };
  const sampleBlocks = expandedBlocks
    .slice(0, CHATGPT_CONNECTOR_TEMPLATE_PREVIEW_SAMPLE_BLOCK_LIMIT)
    .map((block) => ({
      center_id: block.center_id,
      center_name: block.center_name,
      class_type_id: block.class_type_id,
      class_type_name: block.class_type_name,
      coach_names: block.coach_names,
      date: block.date,
      ends_at: block.ends_at,
      starts_at: block.starts_at,
    }));

  return {
    ok: true,
    preview: {
      preview_id: createChatGptConnectorTemplatePreviewId(previewPayload),
      sample_blocks: sampleBlocks,
      summary: {
        center_id: center.id,
        center_name: center.name,
        date_from: dateFrom,
        date_to: dateTo,
        range_days:
          Math.floor((dateToUtcMs(dateTo) - dateToUtcMs(dateFrom)) / 86_400_000) +
          1,
        sample_size: sampleBlocks.length,
        total_blocks: expandedBlocks.length,
        warnings_count: uniqueWarnings.length,
      },
      warnings: uniqueWarnings,
    },
  };
}

export function buildChatGptConnectorScheduleTemplateDraftBlocks({
  center,
  classTypes,
  rules,
}: {
  center: ChatGptConnectorCenterRow;
  classTypes: ChatGptConnectorClassTypeRow[];
  rules: ChatGptConnectorScheduleTemplatePreviewRuleInput[];
}):
  | {
      blocks: ChatGptConnectorScheduleTemplateDraftBlock[];
      ok: true;
      warnings: string[];
    }
  | {
      code:
        | "class_type_not_found"
        | "coach_not_found"
        | "invalid_date_range"
        | "invalid_time_range";
      details: Record<string, unknown>;
      ok: false;
    } {
  const classTypesById = new Map(
    classTypes.map((classType) => [classType.id, classType]),
  );
  const blocks: ChatGptConnectorScheduleTemplateDraftBlock[] = [];
  const warnings = new Set<string>();

  if (!Array.isArray(rules) || rules.length === 0) {
    return {
      code: "invalid_time_range",
      details: { reason: "missing_rules" },
      ok: false,
    };
  }

  for (const [index, rule] of rules.entries()) {
    const ruleIndex = index + 1;
    const weekdays = normalizeTemplatePreviewWeekdays(rule.weekdays);
    const startsAt = normalizeChatGptConnectorTime(rule.starts_at);
    const endsAt = normalizeChatGptConnectorTime(rule.ends_at);
    const slotDurationMinutes = Number(rule.slot_duration_minutes);

    if (!weekdays) {
      return {
        code: "invalid_date_range",
        details: { reason: "invalid_weekdays", rule_index: ruleIndex },
        ok: false,
      };
    }

    if (
      !startsAt ||
      !endsAt ||
      !Number.isInteger(slotDurationMinutes) ||
      slotDurationMinutes < 15 ||
      slotDurationMinutes > 240 ||
      slotDurationMinutes % 5 !== 0
    ) {
      return {
        code: "invalid_time_range",
        details: { reason: "invalid_rule_time", rule_index: ruleIndex },
        ok: false,
      };
    }

    const startMinutes = getChatGptConnectorTimeMinutes(startsAt);
    const endMinutes = getChatGptConnectorTimeMinutes(endsAt);

    if (startMinutes >= endMinutes || startMinutes + slotDurationMinutes > endMinutes) {
      return {
        code: "invalid_time_range",
        details: { reason: "invalid_rule_range", rule_index: ruleIndex },
        ok: false,
      };
    }

    if (!isPostgresUuid(rule.class_type_id)) {
      return {
        code: "class_type_not_found",
        details: { rule_index: ruleIndex },
        ok: false,
      };
    }

    const classType = classTypesById.get(rule.class_type_id);

    if (!classType || classType.status !== "active") {
      return {
        code: "class_type_not_found",
        details: { rule_index: ruleIndex },
        ok: false,
      };
    }

    const coachIds = normalizeTemplatePreviewCoachIds(rule.coach_ids);

    if (!coachIds) {
      return {
        code: "coach_not_found",
        details: { reason: "invalid_coach_id", rule_index: ruleIndex },
        ok: false,
      };
    }

    if (coachIds.length > 1) {
      warnings.add(`rule_${ruleIndex}_only_first_default_coach_saved`);
    }

    for (const dayOfWeek of weekdays) {
      for (
        let startsAtMinutes = startMinutes;
        startsAtMinutes + slotDurationMinutes <= endMinutes;
        startsAtMinutes += slotDurationMinutes
      ) {
        const endsAtMinutes = startsAtMinutes + slotDurationMinutes;
        const defaultCoachProfileId =
          classType.required_coaches > 0 ? (coachIds[0] ?? null) : null;

        blocks.push({
          center_id: center.id,
          class_type_id: classType.id,
          day_of_week: dayOfWeek,
          default_coach_profile_id: defaultCoachProfileId,
          end_time: formatMinutesAsConnectorTime(endsAtMinutes),
          metadata: {
            rule_index: ruleIndex,
            source: "chatgpt_connector",
          },
          required_coaches: classType.required_coaches,
          start_time: formatMinutesAsConnectorTime(startsAtMinutes),
        });
      }
    }
  }

  blocks.sort(
    (first, second) =>
      first.day_of_week - second.day_of_week ||
      first.start_time.localeCompare(second.start_time) ||
      first.end_time.localeCompare(second.end_time) ||
      first.class_type_id.localeCompare(second.class_type_id),
  );

  return {
    blocks,
    ok: true,
    warnings: [...warnings],
  };
}

function getCoachDisplayName({
  coach,
  personProfilesById,
  personProfilesByUserId,
}: {
  coach: ChatGptConnectorCoachProfileRow | undefined;
  personProfilesById: Map<string, ChatGptConnectorPersonProfileRow>;
  personProfilesByUserId: Map<string, ChatGptConnectorPersonProfileRow>;
}) {
  if (!coach) {
    return null;
  }

  const personProfile = coach.person_profile_id
    ? personProfilesById.get(coach.person_profile_id)
    : coach.user_id
      ? personProfilesByUserId.get(coach.user_id)
      : undefined;

  if (
    !personProfile ||
    personProfile.status !== "active" ||
    personProfile.visibility_status !== "visible"
  ) {
    return null;
  }

  const displayName = personProfile.display_name.trim();

  return displayName || null;
}

function getAssignmentStatusRank(status: string) {
  return ASSIGNMENT_STATUS_ORDER.get(status) ?? 99;
}

export function buildChatGptConnectorScheduleBlockSummaries({
  assignments,
  blocks,
  centers,
  classTypes,
  coachProfiles,
  memberships,
  personProfiles,
}: {
  assignments: ChatGptConnectorAssignmentRow[];
  blocks: ChatGptConnectorScheduleBlockRow[];
  centers: ChatGptConnectorCenterRow[];
  classTypes: ChatGptConnectorClassTypeRow[];
  coachProfiles: ChatGptConnectorCoachProfileRow[];
  memberships: ChatGptConnectorMembershipStatusRow[];
  personProfiles: ChatGptConnectorPersonProfileRow[];
}) {
  const centersById = new Map(centers.map((center) => [center.id, center]));
  const classTypesById = new Map(
    classTypes.map((classType) => [classType.id, classType]),
  );
  const coachProfilesById = new Map(
    coachProfiles.map((coachProfile) => [coachProfile.id, coachProfile]),
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
  const assignmentsByBlockId = new Map<
    string,
    ChatGptConnectorAssignmentRow[]
  >();
  const coverageByBlock = calculateScheduleCoverageByBlock({
    assignments,
    blocks,
    coaches: coachProfiles,
    memberships,
    persons: personProfiles,
  });

  for (const assignment of assignments) {
    const blockAssignments =
      assignmentsByBlockId.get(assignment.schedule_block_id) ?? [];
    blockAssignments.push(assignment);
    assignmentsByBlockId.set(assignment.schedule_block_id, blockAssignments);
  }

  return blocks
    .map((block) => {
      const blockAssignments = (
        assignmentsByBlockId.get(block.id) ?? []
      ).filter((assignment) => assignment.assignment_status !== "removed");
      const coaches = blockAssignments
        .map((assignment) => ({
          assignment_status: assignment.assignment_status,
          coach_id: assignment.coach_profile_id,
          display_name: getCoachDisplayName({
            coach: coachProfilesById.get(assignment.coach_profile_id),
            personProfilesById,
            personProfilesByUserId,
          }),
        }))
        .sort(
          (first, second) =>
            getAssignmentStatusRank(first.assignment_status) -
              getAssignmentStatusRank(second.assignment_status) ||
            (first.display_name ?? "").localeCompare(
              second.display_name ?? "",
              "es",
            ) ||
            first.coach_id.localeCompare(second.coach_id),
        );

      return {
        center_id: block.center_id,
        center_name: centersById.get(block.center_id)?.name ?? null,
        class_type_id: block.class_type_id,
        class_type_name: classTypesById.get(block.class_type_id)?.name ?? null,
        coaches,
        coverage_status:
          coverageByBlock.get(block.id)?.state ??
          (isCoverageActiveBlock(block.status) ? "uncovered" : "inactive"),
        ends_at: formatChatGptConnectorTime(block.end_time),
        schedule_block_id: block.id,
        starts_at: formatChatGptConnectorTime(block.start_time),
        status: block.status,
      } satisfies ChatGptConnectorScheduleBlockSummary;
    })
    .sort(
      (first, second) =>
        first.starts_at.localeCompare(second.starts_at) ||
        (first.center_name ?? "").localeCompare(second.center_name ?? "", "es") ||
        first.schedule_block_id.localeCompare(second.schedule_block_id),
    );
}

export function resolveChatGptConnectorOwnCoach({
  coachProfiles,
  personProfiles,
  userId,
}: {
  coachProfiles: ChatGptConnectorCoachProfileRow[];
  personProfiles: ChatGptConnectorPersonProfileRow[];
  userId: string;
}): ChatGptConnectorOwnCoachResolution {
  const visibleOwnPersonProfiles = personProfiles.filter(
    (personProfile) =>
      personProfile.user_id === userId &&
      personProfile.status === "active" &&
      personProfile.visibility_status === "visible",
  );

  if (visibleOwnPersonProfiles.length === 0) {
    return {
      ok: false,
      reason: "missing_person",
    };
  }

  const visibleOwnPersonProfileIds = new Set(
    visibleOwnPersonProfiles.map((personProfile) => personProfile.id),
  );
  const linkedOwnCoachProfiles = coachProfiles.filter(
    (coachProfile) =>
      coachProfile.status === "active" &&
      coachProfile.person_profile_id &&
      visibleOwnPersonProfileIds.has(coachProfile.person_profile_id),
  );
  const directlyLinkedButUnresolvedProfiles = coachProfiles.filter(
    (coachProfile) =>
      coachProfile.status === "active" &&
      coachProfile.user_id === userId &&
      (!coachProfile.person_profile_id ||
        !visibleOwnPersonProfileIds.has(coachProfile.person_profile_id)),
  );

  if (linkedOwnCoachProfiles.length === 0) {
    return {
      ok: false,
      reason:
        directlyLinkedButUnresolvedProfiles.length > 0
          ? "profile_unlinked"
          : "missing_coach_profile",
    };
  }

  if (linkedOwnCoachProfiles.length > 1) {
    return {
      ok: false,
      profile_count: linkedOwnCoachProfiles.length,
      reason: "ambiguous_coach_profile",
    };
  }

  const [coachProfile] = linkedOwnCoachProfiles;
  const personProfile = visibleOwnPersonProfiles.find(
    (candidate) => candidate.id === coachProfile.person_profile_id,
  );

  if (!coachProfile.person_profile_id || !personProfile) {
    return {
      ok: false,
      reason: "profile_unlinked",
    };
  }

  return {
    coach_profile_id: coachProfile.id,
    display_name: personProfile.display_name,
    ok: true,
    person_profile_id: coachProfile.person_profile_id,
  };
}
