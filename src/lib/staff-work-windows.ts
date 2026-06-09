import { isPostgresUuid } from "@/lib/uuid";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/supabase";

export const STAFF_WORK_WINDOW_STATUSES = ["active", "inactive"] as const;

export type StaffWorkWindowStatus =
  (typeof STAFF_WORK_WINDOW_STATUSES)[number];

export type StaffWorkWindowFormValues = {
  centerId: string | null;
  dayOfWeek: number;
  endTime: string;
  notes: string | null;
  personProfileId: string;
  startTime: string;
  status: StaffWorkWindowStatus;
  validFrom: string;
  validUntil: string | null;
};

export type StaffWorkWindowValidationError =
  | "invalid-center"
  | "invalid-date"
  | "invalid-day"
  | "invalid-notes"
  | "invalid-person-profile"
  | "invalid-status"
  | "invalid-time"
  | "missing-fields"
  | "notes-too-long";

export type StaffWorkWindowValidationResult =
  | {
      ok: true;
      values: StaffWorkWindowFormValues;
    }
  | {
      error: StaffWorkWindowValidationError;
      ok: false;
    };

export type StaffWorkWindowCreateValidationResult =
  | {
      ok: true;
      values: StaffWorkWindowFormValues[];
    }
  | {
      error: StaffWorkWindowValidationError;
      ok: false;
    };

export type StaffWorkWindowReferenceError =
  | "center-inactive"
  | "invalid-center"
  | "invalid-person-profile"
  | "person-profile-without-active-coach"
  | "person-profile-inactive"
  | "person-profile-internal";

export type StaffWorkWindowOverlapError = "work-window-overlap";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type StaffWorkWindowRow = Pick<
  Tables<"staff_work_windows">,
  | "center_id"
  | "created_at"
  | "day_of_week"
  | "end_time"
  | "id"
  | "notes"
  | "organization_id"
  | "person_profile_id"
  | "start_time"
  | "status"
  | "updated_at"
  | "valid_from"
  | "valid_until"
>;

type PersonProfileRow = Pick<
  Tables<"person_profiles">,
  "display_name" | "id" | "status" | "visibility_status"
>;

type CoachProfileCenterRow = Pick<
  Tables<"coach_profiles">,
  "person_profile_id" | "primary_center_id"
>;

type CoachProfilePersonRow = Pick<Tables<"coach_profiles">, "person_profile_id">;

type CenterRow = Pick<Tables<"centers">, "id" | "name" | "status">;

export type StaffWorkWindowPersonOption = PersonProfileRow & {
  primary_center_id: string | null;
};
export type StaffWorkWindowCenterOption = CenterRow;

export type StaffWorkWindowDisplay = StaffWorkWindowRow & {
  centerName: string | null;
  personIsAssignable: boolean;
  personDisplayName: string;
};

export type StaffWorkWindowOccurrence = StaffWorkWindowDisplay & {
  serviceDate: string;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_NOTES_LENGTH = 240;

const DAY_LABELS: Record<number, string> = {
  1: "Lunes",
  2: "Martes",
  3: "Miercoles",
  4: "Jueves",
  5: "Viernes",
  6: "Sabado",
  7: "Domingo",
};

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

function timeToMinutes(value: string) {
  const [hours, minutes] = value.slice(0, 5).split(":").map(Number);

  return hours * 60 + minutes;
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

function normalizeNotes(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function hasSensitiveNotesSignal(value: string) {
  const normalized = normalizeNotes(value);

  return /(salario|nomina|payroll|contrato|baja|diagnost|salud|medic|justificant|document|ubicacion|geolocal|gps|https?:|www\.|token|dni|nif|iban|cuenta bancaria|\bip\b)/i.test(
    normalized,
  );
}

function isStaffWorkWindowStatus(
  value: string,
): value is StaffWorkWindowStatus {
  return STAFF_WORK_WINDOW_STATUSES.includes(value as StaffWorkWindowStatus);
}

function addDays(dateString: string, days: number) {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));

  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(
    2,
    "0",
  )}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function expandStaffWorkWindow({
  day,
  window,
}: {
  day: string;
  window: StaffWorkWindowDisplay;
}) {
  if (window.valid_from > day) {
    return null;
  }

  if (window.valid_until && window.valid_until < day) {
    return null;
  }

  return {
    ...window,
    serviceDate: day,
  } satisfies StaffWorkWindowOccurrence;
}

export function getStaffWorkWindowDayLabel(dayOfWeek: number) {
  return DAY_LABELS[dayOfWeek] ?? `Dia ${dayOfWeek}`;
}

export function getStaffWorkWindowStatusLabel(status: string) {
  const labels: Record<StaffWorkWindowStatus, string> = {
    active: "Activa",
    inactive: "Inactiva",
  };

  return isStaffWorkWindowStatus(status) ? labels[status] : status;
}

export function formatStaffWorkWindowTime(value: string) {
  return normalizeTime(value) ?? value.slice(0, 5);
}

export function validateStaffWorkWindowForm(
  formData: FormData,
): StaffWorkWindowValidationResult {
  return validateStaffWorkWindowFormForDay(
    formData,
    getFormString(formData, "dayOfWeek"),
  );
}

export function validateStaffWorkWindowCreateForm(
  formData: FormData,
): StaffWorkWindowCreateValidationResult {
  const rawDayOfWeeks = [...new Set(getFormStrings(formData, "dayOfWeek"))];

  if (rawDayOfWeeks.length === 0) {
    return {
      error: "missing-fields",
      ok: false,
    };
  }

  const values: StaffWorkWindowFormValues[] = [];

  for (const rawDayOfWeek of rawDayOfWeeks) {
    const validation = validateStaffWorkWindowFormForDay(
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

function validateStaffWorkWindowFormForDay(
  formData: FormData,
  rawDayOfWeek: string,
): StaffWorkWindowValidationResult {
  const personProfileId = getFormString(formData, "personProfileId");
  const rawCenterId = getFormString(formData, "centerId");
  const startTime = normalizeTime(getFormString(formData, "startTime"));
  const endTime = normalizeTime(getFormString(formData, "endTime"));
  const validFrom = parseDateInput(getFormString(formData, "validFrom"));
  const rawValidUntil = getFormString(formData, "validUntil");
  const validUntil = rawValidUntil ? parseDateInput(rawValidUntil) : null;
  const rawStatus = getFormString(formData, "status") || "active";
  const rawNotes = getFormString(formData, "notes");
  const dayOfWeek = Number(rawDayOfWeek);

  if (!personProfileId || !rawDayOfWeek || !startTime || !endTime || !validFrom) {
    return {
      error: "missing-fields",
      ok: false,
    };
  }

  if (!isPostgresUuid(personProfileId)) {
    return {
      error: "invalid-person-profile",
      ok: false,
    };
  }

  if (rawCenterId && !isPostgresUuid(rawCenterId)) {
    return {
      error: "invalid-center",
      ok: false,
    };
  }

  if (!Number.isInteger(dayOfWeek) || dayOfWeek < 1 || dayOfWeek > 7) {
    return {
      error: "invalid-day",
      ok: false,
    };
  }

  if (!startTime || !endTime || timeToMinutes(startTime) >= timeToMinutes(endTime)) {
    return {
      error: "invalid-time",
      ok: false,
    };
  }

  if (!validFrom || (rawValidUntil && !validUntil)) {
    return {
      error: "invalid-date",
      ok: false,
    };
  }

  if (validUntil && validUntil < validFrom) {
    return {
      error: "invalid-date",
      ok: false,
    };
  }

  if (!isStaffWorkWindowStatus(rawStatus)) {
    return {
      error: "invalid-status",
      ok: false,
    };
  }

  if (rawNotes.length > MAX_NOTES_LENGTH) {
    return {
      error: "notes-too-long",
      ok: false,
    };
  }

  if (rawNotes && hasSensitiveNotesSignal(rawNotes)) {
    return {
      error: "invalid-notes",
      ok: false,
    };
  }

  return {
    ok: true,
    values: {
      centerId: rawCenterId || null,
      dayOfWeek,
      endTime,
      notes: rawNotes || null,
      personProfileId,
      startTime,
      status: rawStatus,
      validFrom,
      validUntil,
    },
  };
}

export async function validateStaffWorkWindowReferences({
  organizationId,
  supabase,
  values,
}: {
  organizationId: string;
  supabase: SupabaseServerClient;
  values: StaffWorkWindowFormValues;
}): Promise<StaffWorkWindowReferenceError | null> {
  const [personResult, coachResult, centerResult] = await Promise.all([
    supabase
      .from("person_profiles")
      .select("id, status, visibility_status")
      .eq("id", values.personProfileId)
      .eq("organization_id", organizationId)
      .maybeSingle(),
    supabase
      .from("coach_profiles")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("person_profile_id", values.personProfileId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle(),
    values.centerId
      ? supabase
          .from("centers")
          .select("id, status")
          .eq("id", values.centerId)
          .eq("organization_id", organizationId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (personResult.error || !personResult.data) {
    return "invalid-person-profile";
  }

  if (personResult.data.status !== "active") {
    return "person-profile-inactive";
  }

  if (personResult.data.visibility_status !== "visible") {
    return "person-profile-internal";
  }

  if (coachResult.error || !coachResult.data) {
    return "person-profile-without-active-coach";
  }

  if (values.centerId) {
    if (centerResult.error || !centerResult.data) {
      return "invalid-center";
    }

    if (centerResult.data.status !== "active") {
      return "center-inactive";
    }
  }

  return null;
}

export async function findStaffWorkWindowOverlap({
  excludeWindowId,
  organizationId,
  supabase,
  values,
}: {
  excludeWindowId?: string;
  organizationId: string;
  supabase: SupabaseServerClient;
  values: StaffWorkWindowFormValues;
}): Promise<StaffWorkWindowOverlapError | null> {
  if (values.status !== "active") {
    return null;
  }

  let query = supabase
    .from("staff_work_windows")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("person_profile_id", values.personProfileId)
    .eq("day_of_week", values.dayOfWeek)
    .eq("status", "active")
    .lt("start_time", values.endTime)
    .gt("end_time", values.startTime)
    .or(`valid_until.is.null,valid_until.gte.${values.validFrom}`)
    .limit(1);

  if (values.validUntil) {
    query = query.lte("valid_from", values.validUntil);
  }

  if (excludeWindowId) {
    query = query.neq("id", excludeWindowId);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw new Error(
      `Could not check staff work window overlap: ${error.message}`,
    );
  }

  return data ? "work-window-overlap" : null;
}

export async function listStaffWorkWindowPersonOptions({
  organizationId,
}: {
  organizationId: string;
}) {
  const supabase = await createClient();
  const { data: coachProfiles, error: coachError } = await supabase
    .from("coach_profiles")
    .select("person_profile_id, primary_center_id")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .not("person_profile_id", "is", null);

  if (coachError) {
    throw new Error(
      `Could not load staff work window coach profiles: ${coachError.message}`,
    );
  }

  const primaryCenterByPersonId = new Map<string, string | null>();

  for (const coachProfile of
    (coachProfiles ?? []) satisfies CoachProfileCenterRow[]) {
    if (!coachProfile.person_profile_id) {
      continue;
    }

    if (!primaryCenterByPersonId.has(coachProfile.person_profile_id)) {
      primaryCenterByPersonId.set(
        coachProfile.person_profile_id,
        coachProfile.primary_center_id,
      );
    }
  }

  const personIds = [...primaryCenterByPersonId.keys()];

  if (personIds.length === 0) {
    return [] satisfies StaffWorkWindowPersonOption[];
  }

  const { data: people, error } = await supabase
    .from("person_profiles")
    .select("id, display_name, status, visibility_status")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .eq("visibility_status", "visible")
    .in("id", personIds)
    .order("display_name", { ascending: true });

  if (error) {
    throw new Error(`Could not load staff work window people: ${error.message}`);
  }

  return (people ?? []).map((person) => ({
    ...person,
    primary_center_id: primaryCenterByPersonId.get(person.id) ?? null,
  })) satisfies StaffWorkWindowPersonOption[];
}

export async function listStaffWorkWindowsForWeek({
  currentDate,
  includeInactive = false,
  organizationId,
  weekEnd,
  weekStart,
}: {
  currentDate?: string;
  includeInactive?: boolean;
  organizationId: string;
  weekEnd: string;
  weekStart: string;
}) {
  const supabase = await createClient();
  let query = supabase
    .from("staff_work_windows")
    .select(
      "id, organization_id, person_profile_id, center_id, day_of_week, start_time, end_time, valid_from, valid_until, status, notes, created_at, updated_at",
    )
    .eq("organization_id", organizationId)
    .lte("valid_from", weekEnd)
    .or(`valid_until.is.null,valid_until.gte.${weekStart}`)
    .order("day_of_week", { ascending: true })
    .order("start_time", { ascending: true });

  if (!includeInactive) {
    query = query.eq("status", "active");
  }

  const { data: windows, error } = await query;

  if (error) {
    throw new Error(`Could not load staff work windows: ${error.message}`);
  }

  const normalizedCurrentDate =
    (currentDate ? parseDateInput(currentDate) : null) ??
    new Date().toISOString().slice(0, 10);
  const personProfileIds = [
    ...new Set((windows ?? []).map((window) => window.person_profile_id)),
  ];
  const centerIds = [
    ...new Set(
      (windows ?? []).flatMap((window) =>
        window.center_id ? [window.center_id] : [],
      ),
    ),
  ];
  const [personResult, centerResult, activeCoachResult] = await Promise.all([
    personProfileIds.length > 0
      ? supabase
          .from("person_profiles")
          .select("id, display_name, status, visibility_status")
          .eq("organization_id", organizationId)
          .in("id", personProfileIds)
      : Promise.resolve({ data: [], error: null }),
    centerIds.length > 0
      ? supabase
          .from("centers")
          .select("id, name, status")
          .eq("organization_id", organizationId)
          .in("id", centerIds)
      : Promise.resolve({ data: [], error: null }),
    personProfileIds.length > 0
      ? supabase
          .from("coach_profiles")
          .select("person_profile_id")
          .eq("organization_id", organizationId)
          .eq("status", "active")
          .in("person_profile_id", personProfileIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (personResult.error) {
    throw new Error(
      `Could not load staff work window people: ${personResult.error.message}`,
    );
  }

  if (centerResult.error) {
    throw new Error(
      `Could not load staff work window centers: ${centerResult.error.message}`,
    );
  }

  if (activeCoachResult.error) {
    throw new Error(
      `Could not load staff work window coach profiles: ${activeCoachResult.error.message}`,
    );
  }

  const peopleById = new Map(
    (personResult.data ?? []).map((person) => [person.id, person]),
  );
  const activeCoachPersonIds = new Set(
    ((activeCoachResult.data ?? []) as CoachProfilePersonRow[]).flatMap(
      (coach) => (coach.person_profile_id ? [coach.person_profile_id] : []),
    ),
  );
  const centersById = new Map(
    (centerResult.data ?? []).map((center) => [center.id, center]),
  );
  const displayWindows = (windows ?? [])
    .map((window) => {
      const person = peopleById.get(window.person_profile_id);
      const center = window.center_id
        ? centersById.get(window.center_id)
        : null;
      const personIsAssignable = Boolean(
        person?.status === "active" &&
          person.visibility_status === "visible" &&
          activeCoachPersonIds.has(window.person_profile_id),
      );

      return {
        ...window,
        centerName: center?.name ?? null,
        personIsAssignable,
        personDisplayName:
          person?.display_name?.trim() ||
          `Persona no disponible ${window.person_profile_id.slice(0, 8)}`,
      } satisfies StaffWorkWindowDisplay;
    })
    .filter((window) => {
      if (window.personIsAssignable) {
        return true;
      }

      const serviceDate = addDays(weekStart, window.day_of_week - 1);

      return Boolean(serviceDate && serviceDate < normalizedCurrentDate);
    })
    .sort(
      (first, second) =>
        first.day_of_week - second.day_of_week ||
        formatStaffWorkWindowTime(first.start_time).localeCompare(
          formatStaffWorkWindowTime(second.start_time),
        ) ||
        first.personDisplayName.localeCompare(second.personDisplayName, "es"),
    );

  const weekDays = Array.from({ length: 7 }, (_, index) =>
    addDays(weekStart, index),
  );
  const occurrences = displayWindows
    .filter((window) => window.status === "active")
    .flatMap((window) => {
      const serviceDate = weekDays[window.day_of_week - 1];
      const occurrence = expandStaffWorkWindow({
        day: serviceDate,
        window,
      });

      if (!occurrence) {
        return [];
      }

      if (!window.personIsAssignable && serviceDate >= normalizedCurrentDate) {
        return [];
      }

      return [occurrence];
    })
    .sort(
      (first, second) =>
        first.serviceDate.localeCompare(second.serviceDate) ||
        formatStaffWorkWindowTime(first.start_time).localeCompare(
          formatStaffWorkWindowTime(second.start_time),
        ) ||
        first.personDisplayName.localeCompare(second.personDisplayName, "es"),
    );

  return {
    occurrences,
    windows: displayWindows,
  };
}
