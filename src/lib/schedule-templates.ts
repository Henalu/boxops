import { isPostgresUuid } from "@/lib/uuid";

export const SCHEDULE_TEMPLATE_STATUSES = [
  "draft",
  "active",
  "archived",
] as const;

export const SCHEDULE_TEMPLATE_DAYS = [1, 2, 3, 4, 5, 6, 7] as const;
export const SCHEDULE_TEMPLATE_EDITOR_DEFAULT_START_TIME = "07:00";
export const SCHEDULE_TEMPLATE_EDITOR_DEFAULT_END_TIME = "21:00";
export const SCHEDULE_TEMPLATE_EDITOR_SLOT_MINUTES = 30;
export const SCHEDULE_TEMPLATE_EDITOR_DEFAULT_DURATION_MINUTES = 60;

export type ScheduleTemplateStatus =
  (typeof SCHEDULE_TEMPLATE_STATUSES)[number];
export type ScheduleTemplateDay = (typeof SCHEDULE_TEMPLATE_DAYS)[number];

export type ScheduleTemplateFormValues = {
  centerId: string | null;
  editorEndTime: string;
  editorStartTime: string;
  name: string;
  status: ScheduleTemplateStatus;
  validFrom: string | null;
  validUntil: string | null;
};

export type ScheduleTemplateEditorSettings = {
  defaultDurationMinutes: number;
  endTime: string;
  slotMinutes: number;
  startTime: string;
};

export type ScheduleTemplateBlockFormValues = {
  centerId: string;
  classTypeId: string;
  dayOfWeek: ScheduleTemplateDay;
  defaultCoachProfileId: string | null;
  endTime: string;
  notes: string | null;
  requiredCoaches: number;
  startTime: string;
  templateId: string;
};

type ScheduleTemplateBlockValidationError =
  | "invalid-center"
  | "invalid-class-type"
  | "invalid-coach"
  | "invalid-day"
  | "invalid-required-coaches"
  | "invalid-template"
  | "invalid-time"
  | "missing-fields"
  | "notes-too-long";

export type ScheduleTemplateCoachAvailabilityBlockInput = {
  default_coach_profile_id: string | null;
  day_of_week: number;
  end_time: string;
  id: string;
  start_time: string;
};

export type ScheduleTemplateCoachUnavailableBlock = {
  coachProfileId: string;
  dayOfWeek: number;
  endTime: string;
  startTime: string;
  templateBlockId: string;
};

export type ScheduleTemplateValidationResult =
  | {
      ok: true;
      values: ScheduleTemplateFormValues;
    }
  | {
      ok: false;
      error:
        | "invalid-center"
        | "invalid-date"
        | "invalid-date-range"
        | "invalid-editor-time"
        | "invalid-status"
        | "missing-fields"
        | "name-too-long";
    };

export type ScheduleTemplateBlockValidationResult =
  | {
      ok: true;
      values: ScheduleTemplateBlockFormValues;
    }
  | {
      ok: false;
      error: ScheduleTemplateBlockValidationError;
    };

export type ScheduleTemplateBlockCreateValidationResult =
  | {
      ok: true;
      values: ScheduleTemplateBlockFormValues[];
    }
  | {
      ok: false;
      error: ScheduleTemplateBlockValidationError;
    };

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
export function isScheduleTemplateUuid(value: string) {
  return isPostgresUuid(value);
}

export function isScheduleTemplateStatus(
  value: string,
): value is ScheduleTemplateStatus {
  return SCHEDULE_TEMPLATE_STATUSES.includes(
    value as ScheduleTemplateStatus,
  );
}

export function getScheduleTemplateStatusLabel(status: string) {
  const labels: Record<ScheduleTemplateStatus, string> = {
    active: "Activa",
    archived: "Archivada",
    draft: "Borrador",
  };

  return isScheduleTemplateStatus(status) ? labels[status] : status;
}

export function scheduleTemplateBlockRequiresCoach(requiredCoaches: number) {
  return requiredCoaches > 0;
}

export function getScheduleTemplateRequiredCoachesLabel(
  requiredCoaches: number,
) {
  if (!scheduleTemplateBlockRequiresCoach(requiredCoaches)) {
    return "No requiere entrenador";
  }

  return `${requiredCoaches} entrenador${requiredCoaches === 1 ? "" : "es"} necesario${requiredCoaches === 1 ? "" : "s"}`;
}

export function getScheduleTemplateDefaultCoachLabel({
  defaultCoachLabel,
  requiredCoaches,
}: {
  defaultCoachLabel?: string | null;
  requiredCoaches: number;
}) {
  if (!scheduleTemplateBlockRequiresCoach(requiredCoaches)) {
    return "Sin requisito";
  }

  return defaultCoachLabel ?? "Vacante";
}

export function getScheduleTemplateDefaultCoachDetail({
  defaultCoachLabel,
  requiredCoaches,
}: {
  defaultCoachLabel?: string | null;
  requiredCoaches: number;
}) {
  if (!scheduleTemplateBlockRequiresCoach(requiredCoaches)) {
    return "No requiere entrenador";
  }

  return defaultCoachLabel ?? "Vacante";
}

export function getScheduleTemplateDayLabel(day: number) {
  const labels: Record<ScheduleTemplateDay, string> = {
    1: "Lunes",
    2: "Martes",
    3: "Miércoles",
    4: "Jueves",
    5: "Viernes",
    6: "Sábado",
    7: "Domingo",
  };

  return SCHEDULE_TEMPLATE_DAYS.includes(day as ScheduleTemplateDay)
    ? labels[day as ScheduleTemplateDay]
    : `Día ${day}`;
}

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

function getFormStrings(formData: FormData, key: string) {
  return formData
    .getAll(key)
    .flatMap((value) => (typeof value === "string" ? [value.trim()] : []))
    .filter(Boolean);
}

function normalizeTime(value: string) {
  const candidate = value.slice(0, 5);

  return TIME_PATTERN.test(candidate) ? candidate : null;
}

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function timeToMinutes(value: string) {
  const [hours, minutes] = value.slice(0, 5).split(":").map(Number);

  return hours * 60 + minutes;
}

function timeRangesOverlap(
  firstStart: string,
  firstEnd: string,
  secondStart: string,
  secondEnd: string,
) {
  return (
    timeToMinutes(firstStart) < timeToMinutes(secondEnd) &&
    timeToMinutes(secondStart) < timeToMinutes(firstEnd)
  );
}

export function getUnavailableScheduleTemplateCoachBlocks({
  blocks,
  targetBlock,
}: {
  blocks: ScheduleTemplateCoachAvailabilityBlockInput[];
  targetBlock: {
    day_of_week: number;
    end_time: string;
    id?: string | null;
    start_time: string;
  };
}) {
  const targetStartTime = normalizeTime(targetBlock.start_time);
  const targetEndTime = normalizeTime(targetBlock.end_time);

  if (
    !targetStartTime ||
    !targetEndTime ||
    timeToMinutes(targetStartTime) >= timeToMinutes(targetEndTime)
  ) {
    return [];
  }

  return blocks.flatMap((block) => {
    const blockStartTime = normalizeTime(block.start_time);
    const blockEndTime = normalizeTime(block.end_time);

    if (
      !block.default_coach_profile_id ||
      block.id === targetBlock.id ||
      block.day_of_week !== targetBlock.day_of_week ||
      !blockStartTime ||
      !blockEndTime ||
      !timeRangesOverlap(
        blockStartTime,
        blockEndTime,
        targetStartTime,
        targetEndTime,
      )
    ) {
      return [];
    }

    return [
      {
        coachProfileId: block.default_coach_profile_id,
        dayOfWeek: block.day_of_week,
        endTime: blockEndTime,
        startTime: blockStartTime,
        templateBlockId: block.id,
      } satisfies ScheduleTemplateCoachUnavailableBlock,
    ];
  });
}

function parseRequiredCoaches(value: string) {
  const requiredCoaches = Number(value);

  if (
    !Number.isInteger(requiredCoaches) ||
    requiredCoaches < 0 ||
    requiredCoaches > 20
  ) {
    return null;
  }

  return requiredCoaches;
}

function parseDateInput(value: string) {
  if (!DATE_PATTERN.test(value)) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return value;
}

function parseOptionalDate(value: string) {
  if (!value) {
    return null;
  }

  return parseDateInput(value) ?? undefined;
}

function parseOptionalUuid(value: string) {
  if (!value || value === "none") {
    return null;
  }

  return isPostgresUuid(value) ? value : undefined;
}

function parseDayOfWeek(value: string) {
  const dayOfWeek = Number(value);

  return SCHEDULE_TEMPLATE_DAYS.includes(dayOfWeek as ScheduleTemplateDay)
    ? (dayOfWeek as ScheduleTemplateDay)
    : null;
}

export function validateScheduleTemplateForm(
  formData: FormData,
): ScheduleTemplateValidationResult {
  const name = getFormString(formData, "name");
  const rawCenterId = getFormString(formData, "centerId");
  const rawStatus = getFormString(formData, "status") || "draft";
  const rawValidFrom = getFormString(formData, "validFrom");
  const rawValidUntil = getFormString(formData, "validUntil");
  const editorStartTime = normalizeTime(
    getFormString(formData, "editorStartTime") ||
      SCHEDULE_TEMPLATE_EDITOR_DEFAULT_START_TIME,
  );
  const editorEndTime = normalizeTime(
    getFormString(formData, "editorEndTime") ||
      SCHEDULE_TEMPLATE_EDITOR_DEFAULT_END_TIME,
  );
  const centerId = parseOptionalUuid(rawCenterId);
  const validFrom = parseOptionalDate(rawValidFrom);
  const validUntil = parseOptionalDate(rawValidUntil);

  if (!name) {
    return {
      ok: false,
      error: "missing-fields",
    };
  }

  if (name.length > 120) {
    return {
      ok: false,
      error: "name-too-long",
    };
  }

  if (centerId === undefined) {
    return {
      ok: false,
      error: "invalid-center",
    };
  }

  if (validFrom === undefined || validUntil === undefined) {
    return {
      ok: false,
      error: "invalid-date",
    };
  }

  if (validFrom && validUntil && validUntil < validFrom) {
    return {
      ok: false,
      error: "invalid-date-range",
    };
  }

  if (
    !editorStartTime ||
    !editorEndTime ||
    timeToMinutes(editorStartTime) + SCHEDULE_TEMPLATE_EDITOR_SLOT_MINUTES >
      timeToMinutes(editorEndTime)
  ) {
    return {
      ok: false,
      error: "invalid-editor-time",
    };
  }

  if (!isScheduleTemplateStatus(rawStatus)) {
    return {
      ok: false,
      error: "invalid-status",
    };
  }

  return {
    ok: true,
    values: {
      centerId,
      editorEndTime,
      editorStartTime,
      name,
      status: rawStatus,
      validFrom,
      validUntil,
    },
  };
}

export function getScheduleTemplateEditorSettings(
  metadata: unknown,
): ScheduleTemplateEditorSettings {
  const editor = getRecord(getRecord(metadata)?.editor);
  const startTime =
    normalizeTime(String(editor?.startTime ?? "")) ??
    SCHEDULE_TEMPLATE_EDITOR_DEFAULT_START_TIME;
  const endTime =
    normalizeTime(String(editor?.endTime ?? "")) ??
    SCHEDULE_TEMPLATE_EDITOR_DEFAULT_END_TIME;
  const slotMinutes =
    typeof editor?.slotMinutes === "number" &&
    [15, 30, 60].includes(editor.slotMinutes)
      ? editor.slotMinutes
      : SCHEDULE_TEMPLATE_EDITOR_SLOT_MINUTES;
  const defaultDurationMinutes =
    typeof editor?.defaultDurationMinutes === "number" &&
    editor.defaultDurationMinutes >= 15 &&
    editor.defaultDurationMinutes <= 240
      ? editor.defaultDurationMinutes
      : SCHEDULE_TEMPLATE_EDITOR_DEFAULT_DURATION_MINUTES;

  if (timeToMinutes(startTime) + slotMinutes > timeToMinutes(endTime)) {
    return {
      defaultDurationMinutes: SCHEDULE_TEMPLATE_EDITOR_DEFAULT_DURATION_MINUTES,
      endTime: SCHEDULE_TEMPLATE_EDITOR_DEFAULT_END_TIME,
      slotMinutes: SCHEDULE_TEMPLATE_EDITOR_SLOT_MINUTES,
      startTime: SCHEDULE_TEMPLATE_EDITOR_DEFAULT_START_TIME,
    };
  }

  return {
    defaultDurationMinutes,
    endTime,
    slotMinutes,
    startTime,
  };
}

export function validateScheduleTemplateBlockForm(
  formData: FormData,
): ScheduleTemplateBlockValidationResult {
  return validateScheduleTemplateBlockFormForDay(
    formData,
    getFormString(formData, "dayOfWeek"),
  );
}

export function validateScheduleTemplateBlockCreateForm(
  formData: FormData,
): ScheduleTemplateBlockCreateValidationResult {
  const rawDayOfWeeks = [...new Set(getFormStrings(formData, "dayOfWeek"))];

  if (rawDayOfWeeks.length === 0) {
    return {
      ok: false,
      error: "missing-fields",
    };
  }

  const values: ScheduleTemplateBlockFormValues[] = [];

  for (const rawDayOfWeek of rawDayOfWeeks) {
    const validation = validateScheduleTemplateBlockFormForDay(
      formData,
      rawDayOfWeek,
    );

    if (!validation.ok) {
      return validation;
    }

    values.push(validation.values);
  }

  return {
    ok: true,
    values,
  };
}

function validateScheduleTemplateBlockFormForDay(
  formData: FormData,
  rawDayOfWeek: string,
): ScheduleTemplateBlockValidationResult {
  const templateId = getFormString(formData, "templateId");
  const startTime = normalizeTime(getFormString(formData, "startTime"));
  const endTime = normalizeTime(getFormString(formData, "endTime"));
  const centerId = getFormString(formData, "centerId");
  const classTypeId = getFormString(formData, "classTypeId");
  const rawRequiredCoaches =
    getFormString(formData, "requiredCoaches") || "1";
  const rawDefaultCoachProfileId = getFormString(
    formData,
    "defaultCoachProfileId",
  );
  const notes = getFormString(formData, "notes");
  const dayOfWeek = parseDayOfWeek(rawDayOfWeek);
  const requiredCoaches = parseRequiredCoaches(rawRequiredCoaches);
  const parsedDefaultCoachProfileId = parseOptionalUuid(
    rawDefaultCoachProfileId,
  );

  if (
    !templateId ||
    !rawDayOfWeek ||
    !startTime ||
    !endTime ||
    !centerId ||
    !classTypeId
  ) {
    return {
      ok: false,
      error: "missing-fields",
    };
  }

  if (!isPostgresUuid(templateId)) {
    return {
      ok: false,
      error: "invalid-template",
    };
  }

  if (!dayOfWeek) {
    return {
      ok: false,
      error: "invalid-day",
    };
  }

  if (timeToMinutes(startTime) >= timeToMinutes(endTime)) {
    return {
      ok: false,
      error: "invalid-time",
    };
  }

  if (!isPostgresUuid(centerId)) {
    return {
      ok: false,
      error: "invalid-center",
    };
  }

  if (!isPostgresUuid(classTypeId)) {
    return {
      ok: false,
      error: "invalid-class-type",
    };
  }

  if (requiredCoaches === null) {
    return {
      ok: false,
      error: "invalid-required-coaches",
    };
  }

  if (
    scheduleTemplateBlockRequiresCoach(requiredCoaches) &&
    parsedDefaultCoachProfileId === undefined
  ) {
    return {
      ok: false,
      error: "invalid-coach",
    };
  }

  if (notes.length > 1000) {
    return {
      ok: false,
      error: "notes-too-long",
    };
  }

  const defaultCoachProfileId = scheduleTemplateBlockRequiresCoach(
    requiredCoaches,
  )
    ? (parsedDefaultCoachProfileId ?? null)
    : null;

  return {
    ok: true,
    values: {
      centerId,
      classTypeId,
      dayOfWeek,
      defaultCoachProfileId,
      endTime,
      notes: notes || null,
      requiredCoaches,
      startTime,
      templateId,
    },
  };
}
