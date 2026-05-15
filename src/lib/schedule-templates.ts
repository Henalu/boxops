import { isPostgresUuid } from "@/lib/uuid";

export const SCHEDULE_TEMPLATE_STATUSES = [
  "draft",
  "active",
  "archived",
] as const;

export const SCHEDULE_TEMPLATE_DAYS = [1, 2, 3, 4, 5, 6, 7] as const;

export type ScheduleTemplateStatus =
  (typeof SCHEDULE_TEMPLATE_STATUSES)[number];
export type ScheduleTemplateDay = (typeof SCHEDULE_TEMPLATE_DAYS)[number];

export type ScheduleTemplateFormValues = {
  centerId: string | null;
  name: string;
  status: ScheduleTemplateStatus;
  validFrom: string | null;
  validUntil: string | null;
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
      error:
        | "invalid-center"
        | "invalid-class-type"
        | "invalid-coach"
        | "invalid-day"
        | "invalid-required-coaches"
        | "invalid-template"
        | "invalid-time"
        | "missing-fields"
        | "notes-too-long";
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

function normalizeTime(value: string) {
  const candidate = value.slice(0, 5);

  return TIME_PATTERN.test(candidate) ? candidate : null;
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
      name,
      status: rawStatus,
      validFrom,
      validUntil,
    },
  };
}

export function validateScheduleTemplateBlockForm(
  formData: FormData,
): ScheduleTemplateBlockValidationResult {
  const templateId = getFormString(formData, "templateId");
  const rawDayOfWeek = getFormString(formData, "dayOfWeek");
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
