import Link from "next/link";
import { redirect } from "next/navigation";
import {
  CalendarDays,
  CalendarRange,
  CircleOff,
  Clock,
  Copy,
  List,
  MapPin,
  Pencil,
  Plus,
  Save,
  ShieldCheck,
  X,
} from "lucide-react";

import {
  applyScheduleTemplateToWeek,
  createScheduleTemplate,
  createScheduleTemplateBlock,
  updateScheduleTemplate,
  updateScheduleTemplateBlock,
} from "./actions";
import { TemplateBlocksEditor } from "./template-blocks-editor";
import {
  CollapsibleActionPanel,
  InlineEditDetails,
  MetaGrid,
  MetaItem,
} from "@/components/features/management-ui";
import {
  EmptyState,
  SectionHeader,
} from "@/components/features/operations-ui";
import { OrganizationResolutionState } from "@/components/features/organization-resolution-state";
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
import { Textarea } from "@/components/ui/textarea";
import { getLoginPath } from "@/lib/auth/redirects";
import {
  canManageOperationalData,
  getApplicationRoleLabel,
} from "@/lib/auth/permissions";
import {
  getActiveMemberships,
  getAuthenticatedUser,
  resolveActiveOrganization,
} from "@/lib/auth/tenant";
import {
  getSchedulePath,
  getScheduleTemplatesPath,
} from "@/lib/navigation/app-paths";
import { formatTimeForInput, resolveWeek } from "@/lib/schedule-blocks";
import {
  SCHEDULE_TEMPLATE_DAYS,
  SCHEDULE_TEMPLATE_STATUSES,
  getScheduleTemplateDayLabel,
  getScheduleTemplateStatusLabel,
} from "@/lib/schedule-templates";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import type { Tables } from "@/types/supabase";

export const dynamic = "force-dynamic";

type TemplatesSearchParams = {
  day?: string | string[];
  edit_block_id?: string | string[];
  error?: string | string[];
  organizationId?: string | string[];
  status?: string | string[];
  view?: string | string[];
  week?: string | string[];
};

type TemplatesPageProps = {
  searchParams: Promise<TemplatesSearchParams>;
};

type ScheduleTemplateRow = Pick<
  Tables<"schedule_templates">,
  | "center_id"
  | "id"
  | "name"
  | "status"
  | "updated_at"
  | "valid_from"
  | "valid_until"
>;

type ScheduleTemplateBlockRow = Pick<
  Tables<"schedule_template_blocks">,
  | "center_id"
  | "class_type_id"
  | "day_of_week"
  | "default_coach_profile_id"
  | "end_time"
  | "id"
  | "notes"
  | "required_coaches"
  | "start_time"
  | "template_id"
  | "updated_at"
>;

type CenterRow = Pick<Tables<"centers">, "id" | "name" | "status">;

type ClassTypeRow = Pick<
  Tables<"class_types">,
  "category" | "color" | "id" | "name" | "required_coaches" | "status"
>;

type CoachProfileRow = Pick<
  Tables<"coach_profiles">,
  "id" | "person_profile_id" | "status" | "updated_at" | "user_id"
>;

type PersonProfileRow = Pick<
  Tables<"person_profiles">,
  "display_name" | "id" | "status" | "visibility_status"
>;

type MembershipStatusRow = Pick<
  Tables<"organization_memberships">,
  "status" | "user_id"
>;

type CoachDisplay = {
  detail: string;
  id: string;
  isFallback: boolean;
  label: string;
};

const templateViews = [
  {
    icon: CalendarDays,
    label: "Semana",
    value: "week",
  },
  {
    icon: List,
    label: "Agenda",
    value: "agenda",
  },
] as const;

type TemplateView = (typeof templateViews)[number]["value"];
type TemplateDay = (typeof SCHEDULE_TEMPLATE_DAYS)[number];

const templateDayShortLabels: Record<TemplateDay, string> = {
  1: "L",
  2: "M",
  3: "X",
  4: "J",
  5: "V",
  6: "S",
  7: "D",
};

const successMessages: Record<string, string> = {
  "template-block-created": "Bloque de plantilla creado.",
  "template-block-updated": "Bloque de plantilla actualizado.",
  "template-created": "Plantilla creada.",
  "template-updated": "Plantilla actualizada.",
};

const errorMessages: Record<string, string> = {
  forbidden: "Tu rol no permite gestionar plantillas.",
  "invalid-center": "El centro seleccionado no es válido.",
  "invalid-class-type":
    "El tipo de actividad seleccionado no es válido.",
  "invalid-coach":
    "El coach por defecto debe estar activo y visible.",
  "invalid-date": "Usa fechas válidas para la plantilla.",
  "invalid-date-range": "La fecha fin no puede ser anterior a la fecha inicio.",
  "invalid-day": "El día de la semana no es válido.",
  "invalid-reference":
    "Alguna referencia de plantilla ya no está disponible.",
  "invalid-required-coaches":
    "Los coaches necesarios deben ser un número entero entre 0 y 20.",
  "invalid-status": "El estado de la plantilla no es válido.",
  "invalid-template": "La plantilla recibida no es válida.",
  "invalid-template-block": "El bloque de plantilla recibido no es válido.",
  "invalid-template-data": "Los datos no cumplen las reglas de plantilla.",
  "invalid-time": "La hora de inicio debe ser anterior a la hora de fin.",
  "missing-fields": "Completa los campos obligatorios.",
  "name-too-long": "El nombre de la plantilla no puede superar 120 caracteres.",
  no_active_memberships: "No hay accesos activos para este usuario.",
  "notes-too-long": "Las notas no pueden superar 1000 caracteres.",
  organization_not_found: "La organización solicitada no está disponible.",
  organization_required:
    "Elige una organización antes de gestionar plantillas.",
  "save-failed": "No se han podido guardar los cambios.",
  "template-archived": "Las plantillas archivadas no se pueden modificar.",
  "template-block-required": "No se ha recibido el bloque de plantilla.",
  "template-empty": "La plantilla necesita al menos un bloque antes de aplicarse.",
  "template-not-active": "Solo se pueden aplicar plantillas activas.",
  "template-required": "No se ha recibido la plantilla.",
};

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function resolveTemplateView(value: string | string[] | undefined): TemplateView {
  return getParam(value) === "agenda" ? "agenda" : "week";
}

function resolveTemplateDay(value: string | string[] | undefined): TemplateDay {
  const day = Number(getParam(value));

  return SCHEDULE_TEMPLATE_DAYS.includes(day as TemplateDay)
    ? (day as TemplateDay)
    : SCHEDULE_TEMPLATE_DAYS[0];
}

async function getScheduleTemplates(organizationId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("schedule_templates")
    .select(
      "id, center_id, name, status, valid_from, valid_until, updated_at",
    )
    .eq("organization_id", organizationId)
    .eq("template_type", "weekly")
    .order("status", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`Could not load schedule templates: ${error.message}`);
  }

  return data satisfies ScheduleTemplateRow[];
}

async function getScheduleTemplateBlocks({
  organizationId,
  templateIds,
}: {
  organizationId: string;
  templateIds: string[];
}) {
  if (templateIds.length === 0) {
    return [];
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("schedule_template_blocks")
    .select(
      "id, template_id, day_of_week, start_time, end_time, center_id, class_type_id, required_coaches, default_coach_profile_id, notes, updated_at",
    )
    .eq("organization_id", organizationId)
    .in("template_id", templateIds)
    .order("day_of_week", { ascending: true })
    .order("start_time", { ascending: true });

  if (error) {
    throw new Error(`Could not load template blocks: ${error.message}`);
  }

  return data satisfies ScheduleTemplateBlockRow[];
}

async function getCenters(organizationId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("centers")
    .select("id, name, status")
    .eq("organization_id", organizationId)
    .order("status", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`Could not load centers: ${error.message}`);
  }

  return data satisfies CenterRow[];
}

async function getClassTypes(organizationId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("class_types")
    .select("id, name, category, required_coaches, status, color")
    .eq("organization_id", organizationId)
    .order("status", { ascending: true })
    .order("category", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`Could not load class types: ${error.message}`);
  }

  return data satisfies ClassTypeRow[];
}

async function getScheduleCoachContext(organizationId: string) {
  const supabase = await createClient();
  const { data: coachProfiles, error } = await supabase
    .from("coach_profiles")
    .select("id, user_id, person_profile_id, status, updated_at")
    .eq("organization_id", organizationId)
    .order("status", { ascending: true })
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(`Could not load coach profiles: ${error.message}`);
  }

  const personProfileIds = [
    ...new Set(
      coachProfiles.flatMap((coachProfile) =>
        coachProfile.person_profile_id ? [coachProfile.person_profile_id] : [],
      ),
    ),
  ];
  const userIds = [
    ...new Set(
      coachProfiles.flatMap((coachProfile) =>
        coachProfile.user_id ? [coachProfile.user_id] : [],
      ),
    ),
  ];

  const [personProfilesResult, membershipsResult] = await Promise.all([
    personProfileIds.length > 0
      ? supabase
          .from("person_profiles")
          .select("id, display_name, status, visibility_status")
          .eq("organization_id", organizationId)
          .in("id", personProfileIds)
      : Promise.resolve({ data: [], error: null }),
    userIds.length > 0
      ? supabase
          .from("organization_memberships")
          .select("user_id, status")
          .eq("organization_id", organizationId)
          .in("user_id", userIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (personProfilesResult.error) {
    throw new Error(
      `Could not load person profiles: ${personProfilesResult.error.message}`,
    );
  }

  if (membershipsResult.error) {
    throw new Error(
      `Could not load membership statuses: ${membershipsResult.error.message}`,
    );
  }

  return {
    coachProfiles: coachProfiles satisfies CoachProfileRow[],
    memberships: membershipsResult.data satisfies MembershipStatusRow[],
    personProfiles: personProfilesResult.data satisfies PersonProfileRow[],
  };
}

function selectClassName(className = "") {
  return [
    "h-11 w-full rounded-md border border-input bg-transparent px-2.5 text-sm md:h-9",
    "outline-none transition-colors focus-visible:border-ring",
    "focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
    className,
  ]
    .filter(Boolean)
    .join(" ");
}

function formatUpdatedAt(value: string, timezone: string) {
  try {
    return new Intl.DateTimeFormat("es-ES", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: timezone,
    }).format(new Date(value));
  } catch {
    return "Fecha no disponible";
  }
}

function formatDate(value: string | null) {
  if (!value) {
    return "Sin límite";
  }

  try {
    return new Intl.DateTimeFormat("es-ES", {
      dateStyle: "medium",
      timeZone: "UTC",
    }).format(new Date(`${value}T12:00:00.000Z`));
  } catch {
    return value;
  }
}

function formatTime(value: string) {
  return formatTimeForInput(value) || value;
}

function getSafeColor(value: string | null) {
  return value && /^#[0-9a-f]{6}$/i.test(value) ? value : null;
}

function shortId(value: string) {
  return value.slice(0, 8);
}

function ColorSwatch({ color }: { color: string | null }) {
  const safeColor = getSafeColor(color);

  return (
    <span
      aria-hidden="true"
      className="size-3.5 shrink-0 rounded-full border border-border"
      style={safeColor ? { backgroundColor: safeColor } : undefined}
    />
  );
}

function getCoachDisplay({
  coachProfile,
  membership,
  personProfile,
}: {
  coachProfile: CoachProfileRow;
  membership?: MembershipStatusRow;
  personProfile?: PersonProfileRow;
}): CoachDisplay {
  if (
    personProfile &&
    personProfile.status === "active" &&
    personProfile.visibility_status === "visible"
  ) {
    return {
      detail: membership
        ? `Acceso ${membership.status}`
        : "Persona operativa pendiente de cuenta",
      id: coachProfile.id,
      isFallback: false,
      label: personProfile.display_name,
    };
  }

  if (coachProfile.user_id) {
    return {
      detail: `Cuenta sin persona visible (${shortId(coachProfile.user_id)})`,
      id: coachProfile.id,
      isFallback: true,
      label: `Coach sin perfil visible ${shortId(coachProfile.id)}`,
    };
  }

  return {
    detail: `Perfil técnico incompleto ${shortId(coachProfile.id)}`,
    id: coachProfile.id,
    isFallback: true,
    label: `Coach sin perfil visible ${shortId(coachProfile.id)}`,
  };
}

function buildCoachDisplays({
  coachProfiles,
  memberships,
  personProfiles,
}: {
  coachProfiles: CoachProfileRow[];
  memberships: MembershipStatusRow[];
  personProfiles: PersonProfileRow[];
}) {
  const membershipsByUserId = new Map(
    memberships.map((membership) => [membership.user_id, membership]),
  );
  const personProfilesById = new Map(
    personProfiles.map((personProfile) => [personProfile.id, personProfile]),
  );
  const displays = coachProfiles.map((coachProfile) =>
    getCoachDisplay({
      coachProfile,
      membership: coachProfile.user_id
        ? membershipsByUserId.get(coachProfile.user_id)
        : undefined,
      personProfile: coachProfile.person_profile_id
        ? personProfilesById.get(coachProfile.person_profile_id)
        : undefined,
    }),
  );
  const displaysById = new Map(displays.map((display) => [display.id, display]));
  const assignableCoaches = coachProfiles
    .flatMap((coachProfile) => {
      if (coachProfile.status !== "active") {
        return [];
      }

      const personProfile = coachProfile.person_profile_id
        ? personProfilesById.get(coachProfile.person_profile_id)
        : undefined;
      const membership = coachProfile.user_id
        ? membershipsByUserId.get(coachProfile.user_id)
        : undefined;

      if (
        coachProfile.person_profile_id &&
        (!personProfile ||
          personProfile.status !== "active" ||
          personProfile.visibility_status !== "visible")
      ) {
        return [];
      }

      if (coachProfile.user_id && membership?.status !== "active") {
        return [];
      }

      if (!coachProfile.user_id && !personProfile) {
        return [];
      }

      return [
        getCoachDisplay({
          coachProfile,
          membership,
          personProfile,
        }),
      ];
    })
    .sort((first, second) => first.label.localeCompare(second.label, "es"));

  return {
    assignableCoaches,
    displaysById,
  };
}

function TemplateStatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant={
        status === "active"
          ? "secondary"
          : status === "archived"
            ? "outline"
            : "outline"
      }
    >
      {getScheduleTemplateStatusLabel(status)}
    </Badge>
  );
}

function TemplateViewTabs({
  editBlockId,
  organizationId,
  selectedDay,
  view,
  weekStart,
}: {
  editBlockId?: string | null;
  organizationId: string;
  selectedDay: TemplateDay;
  view: TemplateView;
  weekStart: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-1 rounded-2xl bg-muted p-1 md:rounded-xl">
      {templateViews.map((item) => {
        const Icon = item.icon;
        const active = view === item.value;

        return (
          <Button
            asChild
            className="min-h-11 min-w-0 md:min-h-0"
            key={item.value}
            variant={active ? "secondary" : "ghost"}
          >
            <Link
              aria-current={active ? "page" : undefined}
              href={getScheduleTemplatesPath({
                day: String(selectedDay),
                editTemplateBlockId: editBlockId,
                organizationId,
                view: item.value,
                week: weekStart,
              })}
            >
              <Icon aria-hidden="true" className="size-4" />
              <span className="truncate">{item.label}</span>
            </Link>
          </Button>
        );
      })}
    </div>
  );
}

function TemplateStatusSelect({ defaultValue }: { defaultValue?: string }) {
  return (
    <select
      className={selectClassName()}
      defaultValue={defaultValue ?? "draft"}
      name="status"
    >
      {SCHEDULE_TEMPLATE_STATUSES.map((status) => (
        <option key={status} value={status}>
          {getScheduleTemplateStatusLabel(status)}
        </option>
      ))}
    </select>
  );
}

function OptionalCenterSelect({
  centers,
  defaultValue,
}: {
  centers: CenterRow[];
  defaultValue?: string | null;
}) {
  return (
    <select
      className={selectClassName()}
      defaultValue={defaultValue ?? "none"}
      name="centerId"
    >
      <option value="none">Todos los centros</option>
      {centers.map((center) => (
        <option key={center.id} value={center.id}>
          {center.name}
          {center.status === "inactive" ? " (inactivo)" : ""}
        </option>
      ))}
    </select>
  );
}

function CenterSelect({
  centers,
  defaultValue,
  disabled,
}: {
  centers: CenterRow[];
  defaultValue?: string;
  disabled?: boolean;
}) {
  return (
    <select
      className={selectClassName()}
      defaultValue={defaultValue ?? centers[0]?.id ?? ""}
      disabled={disabled}
      name="centerId"
      required
    >
      {centers.length === 0 ? (
        <option value="">Sin centros activos</option>
      ) : null}
      {centers.map((center) => (
        <option key={center.id} value={center.id}>
          {center.name}
          {center.status === "inactive" ? " (inactivo)" : ""}
        </option>
      ))}
    </select>
  );
}

function ClassTypeSelect({
  classTypes,
  defaultValue,
  disabled,
}: {
  classTypes: ClassTypeRow[];
  defaultValue?: string;
  disabled?: boolean;
}) {
  return (
    <select
      className={selectClassName()}
      defaultValue={defaultValue ?? classTypes[0]?.id ?? ""}
      disabled={disabled}
      name="classTypeId"
      required
    >
      {classTypes.length === 0 ? (
        <option value="">Sin tipos activos</option>
      ) : null}
      {classTypes.map((classType) => (
        <option key={classType.id} value={classType.id}>
          {classType.name}
          {classType.status === "inactive" ? " (inactivo)" : ""}
        </option>
      ))}
    </select>
  );
}

function CoachSelect({
  coaches,
  defaultValue,
}: {
  coaches: CoachDisplay[];
  defaultValue?: string | null;
}) {
  return (
    <select
      className={selectClassName()}
      defaultValue={defaultValue ?? "none"}
      name="defaultCoachProfileId"
    >
      <option value="none">Sin coach por defecto (vacante)</option>
      {coaches.map((coach) => (
        <option key={coach.id} value={coach.id}>
          {coach.label}
          {coach.isFallback ? " (sin perfil visible)" : ""}
        </option>
      ))}
    </select>
  );
}

function DaySelect({ defaultValue }: { defaultValue?: number }) {
  return (
    <select
      className={selectClassName()}
      defaultValue={defaultValue ?? 1}
      name="dayOfWeek"
      required
    >
      {SCHEDULE_TEMPLATE_DAYS.map((day) => (
        <option key={day} value={day}>
          {getScheduleTemplateDayLabel(day)}
        </option>
      ))}
    </select>
  );
}

function TemplateHiddenInputs({
  organizationId,
  selectedDay,
  templateId,
  view,
  weekStart,
}: {
  organizationId: string;
  selectedDay?: TemplateDay;
  templateId?: string;
  view?: TemplateView;
  weekStart: string;
}) {
  return (
    <>
      <input name="organizationId" type="hidden" value={organizationId} />
      {selectedDay ? (
        <input name="day" type="hidden" value={String(selectedDay)} />
      ) : null}
      {view ? <input name="view" type="hidden" value={view} /> : null}
      <input name="weekStart" type="hidden" value={weekStart} />
      {templateId ? (
        <input name="templateId" type="hidden" value={templateId} />
      ) : null}
    </>
  );
}

function TemplateCreateForm({
  activeCenters,
  organizationId,
  selectedDay,
  view,
  weekStart,
}: {
  activeCenters: CenterRow[];
  organizationId: string;
  selectedDay: TemplateDay;
  view: TemplateView;
  weekStart: string;
}) {
  return (
    <form
      action={createScheduleTemplate}
      className="grid gap-4 lg:grid-cols-6"
    >
      <TemplateHiddenInputs
        organizationId={organizationId}
        selectedDay={selectedDay}
        view={view}
        weekStart={weekStart}
      />

      <label className="grid gap-2 lg:col-span-2">
        <span className="text-sm font-medium">Nombre</span>
        <Input
          maxLength={120}
          name="name"
          placeholder="Semana base"
          required
        />
      </label>

      <label className="grid gap-2 lg:col-span-2">
        <span className="text-sm font-medium">Alcance de centro</span>
        <OptionalCenterSelect centers={activeCenters} />
      </label>

      <label className="grid gap-2">
        <span className="text-sm font-medium">Válida desde</span>
        <Input name="validFrom" type="date" />
      </label>

      <label className="grid gap-2">
        <span className="text-sm font-medium">Válida hasta</span>
        <Input name="validUntil" type="date" />
      </label>

      <input name="status" type="hidden" value="draft" />

      <div className="flex items-end lg:col-span-6">
        <Button type="submit">
          <Plus aria-hidden="true" />
          Crear plantilla
        </Button>
      </div>
    </form>
  );
}

function TemplateMetaForm({
  centers,
  organizationId,
  selectedDay,
  template,
  view,
  weekStart,
}: {
  centers: CenterRow[];
  organizationId: string;
  selectedDay: TemplateDay;
  template: ScheduleTemplateRow;
  view: TemplateView;
  weekStart: string;
}) {
  return (
    <form
      action={updateScheduleTemplate}
      className="grid gap-4 lg:grid-cols-6"
    >
      <TemplateHiddenInputs
        organizationId={organizationId}
        selectedDay={selectedDay}
        templateId={template.id}
        view={view}
        weekStart={weekStart}
      />

      <label className="grid gap-2 lg:col-span-2">
        <span className="text-sm font-medium">Nombre</span>
        <Input
          defaultValue={template.name}
          maxLength={120}
          name="name"
          required
        />
      </label>

      <label className="grid gap-2 lg:col-span-2">
        <span className="text-sm font-medium">Alcance de centro</span>
        <OptionalCenterSelect centers={centers} defaultValue={template.center_id} />
      </label>

      <label className="grid gap-2">
        <span className="text-sm font-medium">Valida desde</span>
        <Input
          defaultValue={template.valid_from ?? ""}
          name="validFrom"
          type="date"
        />
      </label>

      <label className="grid gap-2">
        <span className="text-sm font-medium">Valida hasta</span>
        <Input
          defaultValue={template.valid_until ?? ""}
          name="validUntil"
          type="date"
        />
      </label>

      <label className="grid gap-2">
        <span className="text-sm font-medium">Estado</span>
        <TemplateStatusSelect defaultValue={template.status} />
      </label>

      <div className="flex items-end lg:col-span-5">
        <Button type="submit">
          <Save aria-hidden="true" />
          Guardar plantilla
        </Button>
      </div>
    </form>
  );
}

function TemplateBlockFields({
  assignableCoaches,
  block,
  centers,
  classTypes,
  defaultDay,
  disabled,
}: {
  assignableCoaches: CoachDisplay[];
  block?: ScheduleTemplateBlockRow;
  centers: CenterRow[];
  classTypes: ClassTypeRow[];
  defaultDay?: TemplateDay;
  disabled?: boolean;
}) {
  return (
    <>
      <label className="grid gap-2">
        <span className="text-sm font-medium">Día</span>
        <DaySelect defaultValue={block?.day_of_week ?? defaultDay} />
      </label>

      <label className="grid gap-2">
        <span className="text-sm font-medium">Inicio</span>
        <Input
          defaultValue={block ? formatTime(block.start_time) : ""}
          name="startTime"
          required
          type="time"
        />
      </label>

      <label className="grid gap-2">
        <span className="text-sm font-medium">Fin</span>
        <Input
          defaultValue={block ? formatTime(block.end_time) : ""}
          name="endTime"
          required
          type="time"
        />
      </label>

      <label className="grid gap-2">
        <span className="text-sm font-medium">Centro</span>
        <CenterSelect
          centers={centers}
          defaultValue={block?.center_id}
          disabled={disabled}
        />
      </label>

      <label className="grid gap-2">
        <span className="text-sm font-medium">Tipo de actividad</span>
        <ClassTypeSelect
          classTypes={classTypes}
          defaultValue={block?.class_type_id}
          disabled={disabled}
        />
      </label>

      <label className="grid gap-2">
        <span className="text-sm font-medium">Coaches necesarios</span>
        <Input
          defaultValue={block?.required_coaches ?? 1}
          max="20"
          min="0"
          name="requiredCoaches"
          required
          type="number"
        />
      </label>

      <label className="grid gap-2 lg:col-span-2">
        <span className="text-sm font-medium">Coach por defecto</span>
        <CoachSelect
          coaches={assignableCoaches}
          defaultValue={block?.default_coach_profile_id}
        />
        <span className="text-xs leading-5 text-muted-foreground">
          Se asignará al horario cuando apliques la plantilla.
        </span>
      </label>

      <label className="grid gap-2 lg:col-span-6">
        <span className="text-sm font-medium">Notas</span>
        <Textarea
          defaultValue={block?.notes ?? ""}
          maxLength={1000}
          name="notes"
          placeholder="Notas que se copiarán al bloque real"
        />
      </label>
    </>
  );
}

function TemplateBlockCreateForm({
  activeCenters,
  activeClassTypes,
  assignableCoaches,
  organizationId,
  selectedDay,
  templateId,
  view,
  weekStart,
}: {
  activeCenters: CenterRow[];
  activeClassTypes: ClassTypeRow[];
  assignableCoaches: CoachDisplay[];
  organizationId: string;
  selectedDay: TemplateDay;
  templateId: string;
  view: TemplateView;
  weekStart: string;
}) {
  const canCreate = activeCenters.length > 0 && activeClassTypes.length > 0;

  return (
    <InlineEditDetails label="Añadir bloque">
      <form
        action={createScheduleTemplateBlock}
        className="grid gap-4 lg:grid-cols-6"
      >
        <TemplateHiddenInputs
          organizationId={organizationId}
          selectedDay={selectedDay}
          templateId={templateId}
          view={view}
          weekStart={weekStart}
        />
        <TemplateBlockFields
          assignableCoaches={assignableCoaches}
          centers={activeCenters}
          classTypes={activeClassTypes}
          defaultDay={selectedDay}
          disabled={!canCreate}
        />
        <div className="flex items-end lg:col-span-6">
          <Button disabled={!canCreate} type="submit">
            <Plus aria-hidden="true" />
            Crear bloque de plantilla
          </Button>
        </div>
      </form>

      {!canCreate ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Hace falta al menos un centro activo y un tipo de actividad activo
          antes de crear bloques de plantilla.
        </p>
      ) : null}
    </InlineEditDetails>
  );
}

function TemplateBlockEditForm({
  assignableCoaches,
  block,
  centers,
  classTypes,
  organizationId,
  selectedDay,
  view,
  weekStart,
}: {
  assignableCoaches: CoachDisplay[];
  block: ScheduleTemplateBlockRow;
  centers: CenterRow[];
  classTypes: ClassTypeRow[];
  organizationId: string;
  selectedDay: TemplateDay;
  view: TemplateView;
  weekStart: string;
}) {
  return (
    <form
      action={updateScheduleTemplateBlock}
      className="grid gap-4 lg:grid-cols-6"
    >
      <TemplateHiddenInputs
        organizationId={organizationId}
        selectedDay={selectedDay}
        templateId={block.template_id}
        view={view}
        weekStart={weekStart}
      />
      <input name="templateBlockId" type="hidden" value={block.id} />
      <TemplateBlockFields
        assignableCoaches={assignableCoaches}
        block={block}
        centers={centers}
        classTypes={classTypes}
      />
      <div className="flex items-end lg:col-span-6">
        <Button type="submit">
          <Save aria-hidden="true" />
          Guardar bloque
        </Button>
      </div>
    </form>
  );
}

function TemplateBlockAdminRow({
  assignableCoaches,
  block,
  centers,
  classTypes,
  coachDisplaysById,
  editBlockId,
  organizationId,
  selectedDay,
  templateArchived,
  view,
  weekStart,
}: {
  assignableCoaches: CoachDisplay[];
  block: ScheduleTemplateBlockRow;
  centers: CenterRow[];
  classTypes: ClassTypeRow[];
  coachDisplaysById: Map<string, CoachDisplay>;
  editBlockId?: string | null;
  organizationId: string;
  selectedDay: TemplateDay;
  templateArchived: boolean;
  view: TemplateView;
  weekStart: string;
}) {
  const defaultCoach = block.default_coach_profile_id
    ? coachDisplaysById.get(block.default_coach_profile_id)
    : null;
  const center = centers.find((candidate) => candidate.id === block.center_id);
  const classType = classTypes.find(
    (candidate) => candidate.id === block.class_type_id,
  );
  const isEditing = editBlockId === block.id;
  const cancelEditHref = getScheduleTemplatesPath({
    day: String(selectedDay),
    organizationId,
    view,
    week: weekStart,
  });
  const editHref = getScheduleTemplatesPath({
    day: String(selectedDay),
    editTemplateBlockId: block.id,
    organizationId,
    view,
    week: weekStart,
  });

  if (templateArchived) {
    return (
      <TemplateBlockReadOnlyRow
        block={block}
        centers={centers}
        classTypes={classTypes}
        defaultCoach={defaultCoach}
      />
    );
  }

  return (
    <div className="space-y-4 rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h4 className="flex items-center gap-2 text-sm font-medium">
            <Clock aria-hidden="true" className="size-4 shrink-0" />
            <span>
              {getScheduleTemplateDayLabel(block.day_of_week)} /{" "}
              {formatTime(block.start_time)} - {formatTime(block.end_time)}
            </span>
          </h4>
          <p className="text-sm text-muted-foreground">
            {block.required_coaches} coach
            {block.required_coaches === 1 ? "" : "es"} necesario
            {block.required_coaches === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Badge variant={block.default_coach_profile_id ? "secondary" : "outline"}>
            {defaultCoach ? `Por defecto: ${defaultCoach.label}` : "Vacante"}
          </Badge>
          <Button asChild size="sm" variant={isEditing ? "secondary" : "outline"}>
            <Link href={isEditing ? cancelEditHref : editHref}>
              {isEditing ? (
                <X aria-hidden="true" />
              ) : (
                <Pencil aria-hidden="true" />
              )}
              {isEditing ? "Cerrar" : "Editar"}
            </Link>
          </Button>
        </div>
      </div>
      <MetaGrid className="lg:grid-cols-4">
        <MetaItem label="Centro">
          {center?.name ?? "Centro no disponible"}
        </MetaItem>
        <MetaItem label="Actividad">
          <span className="flex min-w-0 items-center gap-2">
            <ColorSwatch color={classType?.color ?? null} />
            <span className="truncate">
              {classType?.name ?? "Tipo no disponible"}
            </span>
          </span>
        </MetaItem>
        <MetaItem label="Coach por defecto">
          {defaultCoach?.label ?? "Vacante"}
        </MetaItem>
        <MetaItem label="Notas">{block.notes || "Sin notas"}</MetaItem>
      </MetaGrid>
      {isEditing ? (
        <div className="rounded-lg border border-border bg-muted/25 p-4">
          <TemplateBlockEditForm
            assignableCoaches={assignableCoaches}
            block={block}
            centers={centers}
            classTypes={classTypes}
            organizationId={organizationId}
            selectedDay={selectedDay}
            view={view}
            weekStart={weekStart}
          />
        </div>
      ) : null}
    </div>
  );
}

function TemplateBlockReadOnlyRow({
  block,
  centers,
  classTypes,
  defaultCoach,
}: {
  block: ScheduleTemplateBlockRow;
  centers: CenterRow[];
  classTypes: ClassTypeRow[];
  defaultCoach?: CoachDisplay | null;
}) {
  const center = centers.find((candidate) => candidate.id === block.center_id);
  const classType = classTypes.find(
    (candidate) => candidate.id === block.class_type_id,
  );

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h4 className="flex items-center gap-2 text-sm font-medium">
            <Clock aria-hidden="true" className="size-4 shrink-0" />
            <span>
              {getScheduleTemplateDayLabel(block.day_of_week)} /{" "}
              {formatTime(block.start_time)} - {formatTime(block.end_time)}
            </span>
          </h4>
          <p className="text-sm text-muted-foreground">
            {block.required_coaches} coach
            {block.required_coaches === 1 ? "" : "es"} necesario
            {block.required_coaches === 1 ? "" : "s"}
          </p>
        </div>
        <Badge variant={block.default_coach_profile_id ? "secondary" : "outline"}>
          {defaultCoach ? `Por defecto: ${defaultCoach.label}` : "Vacante"}
        </Badge>
      </div>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div className="min-w-0">
          <dt className="text-muted-foreground">Centro</dt>
          <dd className="mt-1 truncate font-medium">
            {center?.name ?? "Centro no disponible"}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-muted-foreground">Actividad</dt>
          <dd className="mt-1 flex min-w-0 items-center gap-2 font-medium">
            <ColorSwatch color={classType?.color ?? null} />
            <span className="truncate">
              {classType?.name ?? "Tipo no disponible"}
            </span>
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-muted-foreground">Coach por defecto</dt>
          <dd className="mt-1 truncate font-medium">
            {defaultCoach?.label ?? "Vacante"}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-muted-foreground">Notas</dt>
          <dd className="mt-1 whitespace-pre-wrap break-words">
            {block.notes || "Sin notas"}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function groupTemplateBlocksByDay(blocks: ScheduleTemplateBlockRow[]) {
  const groups = new Map<number, ScheduleTemplateBlockRow[]>(
    SCHEDULE_TEMPLATE_DAYS.map((day) => [day, [] as ScheduleTemplateBlockRow[]]),
  );

  for (const block of blocks) {
    const group = groups.get(block.day_of_week) ?? [];
    group.push(block);
    groups.set(block.day_of_week, group);
  }

  for (const [day, dayBlocks] of groups.entries()) {
    groups.set(
      day,
      [...dayBlocks].sort((first, second) =>
        `${first.start_time}-${first.end_time}-${first.id}`.localeCompare(
          `${second.start_time}-${second.end_time}-${second.id}`,
        ),
      ),
    );
  }

  return groups;
}

function TemplateBlockWeekCard({
  block,
  canManageTemplates,
  centers,
  classTypes,
  coachDisplaysById,
  editBlockId,
  organizationId,
  selectedDay,
  templateArchived,
  view,
  weekStart,
}: {
  block: ScheduleTemplateBlockRow;
  canManageTemplates: boolean;
  centers: CenterRow[];
  classTypes: ClassTypeRow[];
  coachDisplaysById: Map<string, CoachDisplay>;
  editBlockId?: string | null;
  organizationId: string;
  selectedDay: TemplateDay;
  templateArchived: boolean;
  view: TemplateView;
  weekStart: string;
}) {
  const defaultCoach = block.default_coach_profile_id
    ? coachDisplaysById.get(block.default_coach_profile_id)
    : null;
  const center = centers.find((candidate) => candidate.id === block.center_id);
  const classType = classTypes.find(
    (candidate) => candidate.id === block.class_type_id,
  );
  const isEditing = editBlockId === block.id;
  const canEdit = canManageTemplates && !templateArchived;
  const cancelEditHref = getScheduleTemplatesPath({
    day: String(selectedDay),
    organizationId,
    view,
    week: weekStart,
  });
  const editHref = getScheduleTemplatesPath({
    day: String(selectedDay),
    editTemplateBlockId: block.id,
    organizationId,
    view,
    week: weekStart,
  });

  return (
    <div
      className={cn(
        "min-w-0 overflow-hidden rounded-md border border-border bg-background px-2 py-2 text-xs",
        isEditing ? "ring-2 ring-ring/30" : "",
      )}
    >
      <div className="flex min-w-0 items-start justify-between gap-1.5">
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-[11px] font-medium text-muted-foreground">
            {formatTime(block.start_time)} - {formatTime(block.end_time)}
          </p>
          <h4 className="mt-1 flex min-w-0 items-center gap-1.5 text-xs font-semibold tracking-tight">
            <ColorSwatch color={classType?.color ?? null} />
            <span className="truncate">
              {classType?.name ?? "Tipo no disponible"}
            </span>
          </h4>
        </div>
        <Badge
          className="h-5 max-w-16 shrink-0 px-1.5 text-[11px]"
          variant={block.default_coach_profile_id ? "secondary" : "outline"}
        >
          {defaultCoach ? "Con coach" : "Vacante"}
        </Badge>
      </div>

      <div className="mt-1.5 grid min-w-0 gap-0.5 text-[11px] leading-5 text-muted-foreground">
        <p className="truncate">
          <span className="font-medium text-foreground">
            {center?.name ?? "Centro no disponible"}
          </span>
        </p>
        <p>
          {block.required_coaches} coach
          {block.required_coaches === 1 ? "" : "es"}
        </p>
        {defaultCoach ? (
          <p className="truncate">{defaultCoach.label}</p>
        ) : null}
      </div>

      {canEdit ? (
        <Button
          asChild
          className="mt-2 h-6 w-full min-w-0 justify-center px-2 text-xs"
          size="xs"
          variant={isEditing ? "secondary" : "outline"}
        >
          <Link href={isEditing ? cancelEditHref : editHref}>
            {isEditing ? (
              <X aria-hidden="true" />
            ) : (
              <Pencil aria-hidden="true" />
            )}
            {isEditing ? "Cerrar" : "Editar"}
          </Link>
        </Button>
      ) : null}

      {isEditing ? (
        <p className="mt-2 rounded-md bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground">
          Editando en el panel inferior.
        </p>
      ) : null}
    </div>
  );
}

function TemplateMobileDayPicker({
  blocksByDay,
  organizationId,
  selectedDay,
  view,
  weekStart,
}: {
  blocksByDay: Map<number, ScheduleTemplateBlockRow[]>;
  organizationId: string;
  selectedDay: TemplateDay;
  view: TemplateView;
  weekStart: string;
}) {
  return (
    <div className="md:hidden">
      <div className="grid grid-cols-7 gap-1.5">
        {SCHEDULE_TEMPLATE_DAYS.map((day) => {
          const dayBlocks = blocksByDay.get(day) ?? [];
          const active = selectedDay === day;

          return (
            <Link
              aria-current={active ? "date" : undefined}
              aria-label={`${getScheduleTemplateDayLabel(day)}. ${
                dayBlocks.length
              } bloque${dayBlocks.length === 1 ? "" : "s"}`}
              className={cn(
                "flex h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl border text-center outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
                active
                  ? "border-primary/60 bg-primary/15 text-primary shadow-sm ring-1 ring-primary/20"
                  : "border-border bg-card text-foreground hover:bg-muted/45",
              )}
              href={getScheduleTemplatesPath({
                day: String(day),
                organizationId,
                view,
                week: weekStart,
              })}
              key={day}
              scroll={false}
            >
              <span className="text-sm font-semibold">
                {templateDayShortLabels[day]}
              </span>
              <span className="font-mono text-xs font-medium leading-none text-muted-foreground">
                {dayBlocks.length}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function TemplateMobileDayBlocks({
  blocks,
  canManageTemplates,
  centers,
  classTypes,
  coachDisplaysById,
  editBlockId,
  organizationId,
  selectedDay,
  templateArchived,
  view,
  weekStart,
}: {
  blocks: ScheduleTemplateBlockRow[];
  canManageTemplates: boolean;
  centers: CenterRow[];
  classTypes: ClassTypeRow[];
  coachDisplaysById: Map<string, CoachDisplay>;
  editBlockId?: string | null;
  organizationId: string;
  selectedDay: TemplateDay;
  templateArchived: boolean;
  view: TemplateView;
  weekStart: string;
}) {
  return (
    <section className="space-y-3 md:hidden">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-base font-semibold tracking-tight">
          {getScheduleTemplateDayLabel(selectedDay)}
        </h4>
        <Badge variant="outline">
          {blocks.length} bloque{blocks.length === 1 ? "" : "s"}
        </Badge>
      </div>

      {blocks.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-background/70 px-4 py-6 text-sm text-muted-foreground">
          Sin bloques.
        </div>
      ) : (
        <div className="grid gap-2">
          {blocks.map((block) => (
            <TemplateBlockWeekCard
              block={block}
              canManageTemplates={canManageTemplates}
              centers={centers}
              classTypes={classTypes}
              coachDisplaysById={coachDisplaysById}
              editBlockId={editBlockId}
              key={block.id}
              organizationId={organizationId}
              selectedDay={selectedDay}
              templateArchived={templateArchived}
              view={view}
              weekStart={weekStart}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function TemplateBlocksWeekView({
  assignableCoaches,
  blocks,
  canManageTemplates,
  centers,
  classTypes,
  coachDisplaysById,
  editBlockId,
  organizationId,
  selectedDay,
  templateArchived,
  templateId,
  view,
  weekStart,
}: {
  assignableCoaches: CoachDisplay[];
  blocks: ScheduleTemplateBlockRow[];
  canManageTemplates: boolean;
  centers: CenterRow[];
  classTypes: ClassTypeRow[];
  coachDisplaysById: Map<string, CoachDisplay>;
  editBlockId?: string | null;
  organizationId: string;
  selectedDay: TemplateDay;
  templateArchived: boolean;
  templateId: string;
  view: TemplateView;
  weekStart: string;
}) {
  const blocksByDay = groupTemplateBlocksByDay(blocks);
  const selectedDayBlocks = blocksByDay.get(selectedDay) ?? [];
  const editingBlock = editBlockId
    ? blocks.find((block) => block.id === editBlockId)
    : null;
  const editingClassType = editingBlock
    ? classTypes.find((classType) => classType.id === editingBlock.class_type_id)
    : null;

  return (
    <div className="space-y-3">
      <TemplateMobileDayPicker
        blocksByDay={blocksByDay}
        organizationId={organizationId}
        selectedDay={selectedDay}
        view={view}
        weekStart={weekStart}
      />

      {editingBlock && canManageTemplates && !templateArchived ? (
        <div className="rounded-lg border border-border bg-background p-4">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold tracking-tight">
                Editando bloque de plantilla
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {getScheduleTemplateDayLabel(editingBlock.day_of_week)} /{" "}
                {formatTime(editingBlock.start_time)} -{" "}
                {formatTime(editingBlock.end_time)}
                {editingClassType ? ` - ${editingClassType.name}` : ""}
              </p>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link
                href={getScheduleTemplatesPath({
                  organizationId,
                  day: String(selectedDay),
                  view,
                  week: weekStart,
                })}
              >
                <X aria-hidden="true" />
                Cerrar
              </Link>
            </Button>
          </div>
          <TemplateBlockEditForm
            assignableCoaches={assignableCoaches}
            block={editingBlock}
            centers={centers}
            classTypes={classTypes}
            organizationId={organizationId}
            selectedDay={selectedDay}
            view={view}
            weekStart={weekStart}
          />
        </div>
      ) : null}

      <TemplateMobileDayBlocks
        blocks={selectedDayBlocks}
        canManageTemplates={canManageTemplates}
        centers={centers}
        classTypes={classTypes}
        coachDisplaysById={coachDisplaysById}
        editBlockId={editBlockId}
        organizationId={organizationId}
        selectedDay={selectedDay}
        templateArchived={templateArchived}
        view={view}
        weekStart={weekStart}
      />

      <div className="hidden overflow-x-auto rounded-lg border border-border bg-muted/20 md:block">
        <div className="grid min-w-[1120px] grid-cols-7 divide-x divide-border">
          {SCHEDULE_TEMPLATE_DAYS.map((day) => {
            const dayBlocks = blocksByDay.get(day) ?? [];

            return (
              <section
                className="min-w-0 scroll-mt-24"
                id={`template-${templateId}-day-${day}`}
                key={day}
              >
                <div className="border-b border-border bg-background px-3 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-sm font-semibold tracking-tight">
                      {getScheduleTemplateDayLabel(day)}
                    </h4>
                    <Badge variant="outline">
                      {dayBlocks.length}
                    </Badge>
                  </div>
                </div>

                {dayBlocks.length === 0 ? (
                  <div className="p-2">
                    <div className="rounded-lg border border-dashed border-border bg-background/70 px-3 py-5 text-sm text-muted-foreground">
                      Sin bloques.
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-2 p-2">
                    {dayBlocks.map((block) => (
                      <TemplateBlockWeekCard
                        block={block}
                        canManageTemplates={canManageTemplates}
                        centers={centers}
                        classTypes={classTypes}
                        coachDisplaysById={coachDisplaysById}
                        editBlockId={editBlockId}
                        key={block.id}
                        organizationId={organizationId}
                        selectedDay={selectedDay}
                        templateArchived={templateArchived}
                        view={view}
                        weekStart={weekStart}
                      />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TemplateBlocksAgendaView({
  assignableCoaches,
  blocks,
  canManageTemplates,
  centers,
  classTypes,
  coachDisplaysById,
  editBlockId,
  organizationId,
  selectedDay,
  templateArchived,
  view,
  weekStart,
}: {
  assignableCoaches: CoachDisplay[];
  blocks: ScheduleTemplateBlockRow[];
  canManageTemplates: boolean;
  centers: CenterRow[];
  classTypes: ClassTypeRow[];
  coachDisplaysById: Map<string, CoachDisplay>;
  editBlockId?: string | null;
  organizationId: string;
  selectedDay: TemplateDay;
  templateArchived: boolean;
  view: TemplateView;
  weekStart: string;
}) {
  return (
    <div className="grid gap-3">
      {blocks.map((block) =>
        canManageTemplates ? (
          <TemplateBlockAdminRow
            assignableCoaches={assignableCoaches}
            block={block}
            centers={centers}
            classTypes={classTypes}
            coachDisplaysById={coachDisplaysById}
            editBlockId={editBlockId}
            key={block.id}
            organizationId={organizationId}
            selectedDay={selectedDay}
            templateArchived={templateArchived}
            view={view}
            weekStart={weekStart}
          />
        ) : (
          <TemplateBlockReadOnlyRow
            block={block}
            centers={centers}
            classTypes={classTypes}
            defaultCoach={
              block.default_coach_profile_id
                ? coachDisplaysById.get(block.default_coach_profile_id)
                : null
            }
            key={block.id}
          />
        ),
      )}
    </div>
  );
}

function ApplyTemplateForm({
  assignedBlockCount,
  blockCount,
  organizationId,
  selectedDay,
  template,
  view,
  weekStart,
}: {
  assignedBlockCount: number;
  blockCount: number;
  organizationId: string;
  selectedDay: TemplateDay;
  template: ScheduleTemplateRow;
  view: TemplateView;
  weekStart: string;
}) {
  const canApply = template.status === "active" && blockCount > 0;

  return (
    <form
      action={applyScheduleTemplateToWeek}
      className="grid gap-3 sm:grid-cols-[minmax(180px,240px)_auto]"
    >
      <input name="organizationId" type="hidden" value={organizationId} />
      <input name="day" type="hidden" value={String(selectedDay)} />
      <input name="templateId" type="hidden" value={template.id} />
      <input name="view" type="hidden" value={view} />
      <label className="grid gap-2">
        <span className="text-sm font-medium">Semana destino</span>
        <Input defaultValue={weekStart} name="weekStart" required type="date" />
      </label>
      <div className="flex items-end">
        <Button disabled={!canApply} type="submit">
          <Copy aria-hidden="true" />
          Aplicar a semana
        </Button>
      </div>
      {blockCount > 0 ? (
        <p className="text-sm text-muted-foreground sm:col-span-2">
          Creará {blockCount} bloque{blockCount === 1 ? "" : "s"} y asignará{" "}
          {assignedBlockCount} coach
          {assignedBlockCount === 1 ? "" : "es"} por defecto. Los bloques
          vacantes quedarán como cobertura pendiente.
        </p>
      ) : null}
      {!canApply ? (
        <p className="text-sm text-muted-foreground sm:col-span-2">
          Para aplicar una plantilla debe estar activa y tener al menos un
          bloque.
        </p>
      ) : null}
    </form>
  );
}

function TemplateCard({
  activeCenters,
  activeClassTypes,
  assignableCoaches,
  blocks,
  canManageTemplates,
  centers,
  classTypes,
  coachDisplaysById,
  editBlockId,
  organizationId,
  selectedDay,
  template,
  timezone,
  view,
  weekStart,
}: {
  activeCenters: CenterRow[];
  activeClassTypes: ClassTypeRow[];
  assignableCoaches: CoachDisplay[];
  blocks: ScheduleTemplateBlockRow[];
  canManageTemplates: boolean;
  centers: CenterRow[];
  classTypes: ClassTypeRow[];
  coachDisplaysById: Map<string, CoachDisplay>;
  editBlockId?: string | null;
  organizationId: string;
  selectedDay: TemplateDay;
  template: ScheduleTemplateRow;
  timezone: string;
  view: TemplateView;
  weekStart: string;
}) {
  const center = template.center_id
    ? centers.find((candidate) => candidate.id === template.center_id)
    : null;
  const templateArchived = template.status === "archived";
  const assignedBlockCount = blocks.filter(
    (block) => block.default_coach_profile_id,
  ).length;
  const vacantBlockCount = blocks.length - assignedBlockCount;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <CardTitle className="flex items-center gap-2">
              <CalendarRange aria-hidden="true" className="size-4 shrink-0" />
              <span className="truncate">{template.name}</span>
            </CardTitle>
            <CardDescription className="flex flex-wrap items-center gap-2">
              <span>
                Actualizada {formatUpdatedAt(template.updated_at, timezone)}
              </span>
              <span aria-hidden="true">/</span>
              <span className="inline-flex min-w-0 items-center gap-1">
                <MapPin aria-hidden="true" className="size-3.5 shrink-0" />
                <span className="truncate">
                  {center?.name ?? "Todos los centros"}
                </span>
              </span>
            </CardDescription>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <TemplateStatusBadge status={template.status} />
            <Badge variant="secondary">
              {assignedBlockCount} con coach
            </Badge>
            <Badge variant="outline">
              {vacantBlockCount} vacante{vacantBlockCount === 1 ? "" : "s"}
            </Badge>
            <Badge variant="outline">
              {blocks.length} bloque{blocks.length === 1 ? "" : "s"}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <MetaGrid className="lg:grid-cols-3">
          <MetaItem label="Válida desde">
            {formatDate(template.valid_from)}
          </MetaItem>
          <MetaItem label="Válida hasta">
            {formatDate(template.valid_until)}
          </MetaItem>
          <MetaItem label="Al aplicar">
            Crea horarios y asigna coaches por defecto.
          </MetaItem>
        </MetaGrid>

        {canManageTemplates ? (
          <div className="grid gap-3">
            <InlineEditDetails label="Editar plantilla">
              <TemplateMetaForm
                centers={centers}
                organizationId={organizationId}
                selectedDay={selectedDay}
                template={template}
                view={view}
                weekStart={weekStart}
              />
            </InlineEditDetails>
            <InlineEditDetails label="Aplicar a semana">
              <ApplyTemplateForm
                assignedBlockCount={assignedBlockCount}
                blockCount={blocks.length}
                organizationId={organizationId}
                selectedDay={selectedDay}
                template={template}
                view={view}
                weekStart={weekStart}
              />
            </InlineEditDetails>
          </div>
        ) : null}

        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-base font-semibold tracking-tight">
                Bloques de plantilla
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {view === "week"
                  ? "Distribuidos por dia para editar con menos scroll."
                  : "Lista completa ordenada por dia y hora."}
              </p>
            </div>
            <Badge variant="outline">{blocks.length} total</Badge>
          </div>

          {blocks.length === 0 ? (
            <div className="rounded-lg border border-border p-4">
              <p className="text-sm text-muted-foreground">
                Esta plantilla todavía no tiene bloques. Añade el primer bloque
                antes de aplicarla a una semana.
              </p>
            </div>
          ) : canManageTemplates && !templateArchived ? (
            <TemplateBlocksEditor
              assignableCoaches={assignableCoaches}
              blocks={blocks}
              centers={centers}
              classTypes={classTypes}
              coachDisplays={Array.from(coachDisplaysById.values())}
              initialEditBlockId={editBlockId}
              initialSelectedDay={selectedDay}
              mode={view}
              organizationId={organizationId}
              view={view}
              weekStart={weekStart}
            />
          ) : view === "week" ? (
            <TemplateBlocksWeekView
              assignableCoaches={assignableCoaches}
              blocks={blocks}
              canManageTemplates={canManageTemplates}
              centers={centers}
              classTypes={classTypes}
              coachDisplaysById={coachDisplaysById}
              editBlockId={editBlockId}
              organizationId={organizationId}
              selectedDay={selectedDay}
              templateArchived={templateArchived}
              templateId={template.id}
              view={view}
              weekStart={weekStart}
            />
          ) : (
            <TemplateBlocksAgendaView
              assignableCoaches={assignableCoaches}
              blocks={blocks}
              canManageTemplates={canManageTemplates}
              centers={centers}
              classTypes={classTypes}
              coachDisplaysById={coachDisplaysById}
              editBlockId={editBlockId}
              organizationId={organizationId}
              selectedDay={selectedDay}
              templateArchived={templateArchived}
              view={view}
              weekStart={weekStart}
            />
          )}
        </section>

        {canManageTemplates && !templateArchived ? (
          <TemplateBlockCreateForm
            activeCenters={activeCenters}
            activeClassTypes={activeClassTypes}
            assignableCoaches={assignableCoaches}
            organizationId={organizationId}
            selectedDay={selectedDay}
            templateId={template.id}
            view={view}
            weekStart={weekStart}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}

export default async function TemplatesPage({
  searchParams,
}: TemplatesPageProps) {
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect(getLoginPath("/app/templates"));
  }

  const params = await searchParams;
  const organizationId = getParam(params.organizationId);
  const status = getParam(params.status);
  const error = getParam(params.error);
  const editBlockId = getParam(params.edit_block_id);
  const templateView = resolveTemplateView(params.view);
  const weekParam = getParam(params.week);
  const memberships = await getActiveMemberships(user.id);
  const resolution = resolveActiveOrganization(memberships, organizationId);

  if (!resolution.ok) {
    return (
      <div className="space-y-6">
        <PageHeader />
        <OrganizationResolutionState
          basePath="/app/templates"
          resolution={resolution}
        />
      </div>
    );
  }

  const week = resolveWeek(weekParam, resolution.organization.timezone);
  const selectedDay = resolveTemplateDay(params.day);
  const [templates, centers, classTypes, coachContext] = await Promise.all([
    getScheduleTemplates(resolution.organization.id),
    getCenters(resolution.organization.id),
    getClassTypes(resolution.organization.id),
    getScheduleCoachContext(resolution.organization.id),
  ]);
  const templateBlocks = await getScheduleTemplateBlocks({
    organizationId: resolution.organization.id,
    templateIds: templates.map((template) => template.id),
  });
  const { assignableCoaches, displaysById: coachDisplaysById } =
    buildCoachDisplays(coachContext);
  const blocksByTemplateId = templateBlocks.reduce(
    (groups, block) => {
      const group = groups.get(block.template_id) ?? [];
      group.push(block);
      groups.set(block.template_id, group);

      return groups;
    },
    new Map<string, ScheduleTemplateBlockRow[]>(),
  );
  const canManageTemplates = canManageOperationalData(
    resolution.membership.role,
  );
  const activeCenters = centers.filter((center) => center.status === "active");
  const activeClassTypes = classTypes.filter(
    (classType) => classType.status === "active",
  );

  return (
    <div className="space-y-6">
      <PageHeader
        organizationId={resolution.organization.id}
        organizationName={resolution.organization.name}
        role={resolution.membership.role}
        templateCount={templates.length}
        weekEnd={week.weekEnd}
        weekStart={week.weekStart}
      />

      {week.invalidWeekParam ? (
        <Alert>
          <AlertTitle>Semana ajustada</AlertTitle>
          <AlertDescription>
            La fecha recibida no era válida. Se usará la semana actual para
            aplicar plantillas.
          </AlertDescription>
        </Alert>
      ) : null}

      {status && successMessages[status] ? (
        <Alert>
          <AlertTitle>{successMessages[status]}</AlertTitle>
          <AlertDescription>
            La lista ya muestra las plantillas actuales.
          </AlertDescription>
        </Alert>
      ) : null}

      {error && errorMessages[error] ? (
        <Alert variant="destructive">
          <AlertTitle>No se han guardado los cambios</AlertTitle>
          <AlertDescription>{errorMessages[error]}</AlertDescription>
        </Alert>
      ) : null}

      {canManageTemplates ? (
        <CollapsibleActionPanel
          actionLabel="Crear"
          description="Define una semana base con horarios, vacantes y coaches por defecto."
          icon={Plus}
          title="Crear plantilla semanal"
        >
          <TemplateCreateForm
            activeCenters={activeCenters}
            organizationId={resolution.organization.id}
            selectedDay={selectedDay}
            view={templateView}
            weekStart={week.weekStart}
          />
        </CollapsibleActionPanel>
      ) : (
        <Alert>
          <AlertTitle>Modo lectura</AlertTitle>
          <AlertDescription>
            Tu rol puede consultar plantillas, pero no crearlas, editarlas ni
            aplicarlas a semanas reales.
          </AlertDescription>
        </Alert>
      )}

      <section className="space-y-3">
        <SectionHeader
          action={
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
              <TemplateViewTabs
                editBlockId={editBlockId}
                organizationId={resolution.organization.id}
                selectedDay={selectedDay}
                view={templateView}
                weekStart={week.weekStart}
              />
              <Badge variant="outline">{templates.length} plantillas</Badge>
            </div>
          }
          description="Patrones semanales reutilizables con horarios y coaches por defecto."
          title="Plantillas semanales"
        />

        {templates.length === 0 ? (
          <EmptyState
            description={
              canManageTemplates
                ? "Crea una plantilla semanal para dejar de cargar cada semana desde cero."
                : "Un rol operativo debe crear plantillas antes de que aparezcan aquí."
            }
            title="No hay plantillas todavía"
          />
        ) : (
          <div className="grid gap-3">
            {templates.map((template) => (
              <TemplateCard
                activeCenters={activeCenters}
                activeClassTypes={activeClassTypes}
                assignableCoaches={assignableCoaches}
                blocks={blocksByTemplateId.get(template.id) ?? []}
                canManageTemplates={canManageTemplates}
                centers={centers}
                classTypes={classTypes}
                coachDisplaysById={coachDisplaysById}
                editBlockId={editBlockId}
                key={template.id}
                organizationId={resolution.organization.id}
                selectedDay={selectedDay}
                template={template}
                timezone={resolution.organization.timezone}
                view={templateView}
                weekStart={week.weekStart}
              />
            ))}
          </div>
        )}
      </section>

      <Alert>
        <CircleOff aria-hidden="true" className="size-4" />
        <AlertTitle>Fuera de este corte</AlertTitle>
        <AlertDescription>
          Las plantillas son semanales y la aplicación evita duplicar bloques
          ya creados para la misma semana. Los coaches por defecto se pueden
          ajustar después desde Horario o Cobertura.
        </AlertDescription>
      </Alert>
    </div>
  );
}

function PageHeader({
  organizationId,
  organizationName,
  role,
  templateCount,
  weekEnd,
  weekStart,
}: {
  organizationId?: string;
  organizationName?: string;
  role?: string;
  templateCount?: number;
  weekEnd?: string;
  weekStart?: string;
}) {
  const roleLabel = role ? getApplicationRoleLabel(role) : null;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">Plantillas semanales</Badge>
        {organizationName ? (
          <Badge variant="secondary">{organizationName}</Badge>
        ) : null}
        {roleLabel ? <Badge variant="outline">Rol {roleLabel}</Badge> : null}
        {typeof templateCount === "number" ? (
          <Badge variant="outline">{templateCount} plantillas</Badge>
        ) : null}
      </div>
      <div className="max-w-3xl space-y-2">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          <CalendarRange aria-hidden="true" className="size-6" />
          Plantillas semanales
        </h1>
        <p className="hidden text-sm leading-6 text-muted-foreground md:block md:text-base">
          Crea semanas base con horarios, bloques vacantes y coaches por
          defecto que se reutilizan al aplicar la plantilla.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:max-w-3xl">
        <div className="flex items-start gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground">
          <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>
            Owner, admin compatible y manager operativo pueden crear, editar o
            aplicar plantillas.
          </span>
        </div>
        <div className="flex items-start gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground">
          <CalendarDays aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>
            Semana destino:{" "}
            {weekStart && weekEnd ? (
              <Link
                className="-mx-1 inline-flex min-h-11 items-center rounded-md px-1 underline underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:min-h-0"
                href={getSchedulePath({ organizationId, week: weekStart })}
              >
                {formatDate(weekStart)} - {formatDate(weekEnd)}
              </Link>
            ) : (
              "elige una semana destino."
            )}
          </span>
        </div>
      </div>
    </section>
  );
}
