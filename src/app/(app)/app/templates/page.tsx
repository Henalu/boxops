import Link from "next/link";
import type { CSSProperties } from "react";
import { redirect } from "next/navigation";
import {
  CalendarDays,
  CalendarRange,
  Clock,
  List,
  MapPin,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  ShieldCheck,
  X,
} from "lucide-react";

import {
  archiveScheduleTemplate,
  applyScheduleTemplateToWeek,
  createScheduleTemplate,
  restoreScheduleTemplate,
  updateScheduleTemplate,
  updateScheduleTemplateBlock,
} from "./actions";
import { TemplateArchiveSubmit } from "./template-archive-submit";
import { TemplateApplySubmit } from "./template-apply-submit";
import {
  TemplateBlockCreateForm,
  TemplateBlocksEditor,
} from "./template-blocks-editor";
import { TemplateExpansionControls } from "./template-expansion-controls";
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
import { ensureActiveScheduleTemplatesForWindow } from "@/lib/schedule-template-application";
import {
  SCHEDULE_TEMPLATE_DAYS,
  SCHEDULE_TEMPLATE_STATUSES,
  getScheduleTemplateDefaultCoachDetail,
  getScheduleTemplateDefaultCoachLabel,
  getScheduleTemplateDayLabel,
  getScheduleTemplateEditorSettings,
  getScheduleTemplateRequiredCoachesLabel,
  getScheduleTemplateStatusLabel,
  scheduleTemplateBlockRequiresCoach,
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
  | "archived_at"
  | "center_id"
  | "id"
  | "metadata"
  | "name"
  | "recoverable_until"
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
  "display_name" | "id" | "status" | "user_id" | "visibility_status"
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

type AppliedWeekTemplateSummary = {
  blockCount: number;
  centerIds: string[];
  templateId: string;
  templateName: string;
};

type AppliedTemplateConflict = {
  blockCount: number;
  templateName: string;
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
  "template-archived": "Plantilla archivada.",
  "template-block-copied": "Bloque de plantilla copiado.",
  "template-block-created": "Bloque de plantilla creado.",
  "template-blocks-copied": "Bloques de plantilla copiados.",
  "template-blocks-created": "Bloques de plantilla creados.",
  "template-block-updated": "Bloque de plantilla actualizado.",
  "template-created": "Plantilla creada.",
  "template-restored": "Plantilla recuperada como borrador.",
  "template-updated": "Plantilla actualizada.",
};

const errorMessages: Record<string, string> = {
  forbidden: "Tu rol no permite gestionar plantillas.",
  "coach-unavailable":
    "Ese entrenador ya está asignado por defecto en otro bloque solapado de la plantilla.",
  "invalid-center": "El centro seleccionado no es válido.",
  "invalid-class-type":
    "El tipo de actividad seleccionado no es válido.",
  "invalid-coach":
    "El entrenador por defecto debe estar activo y visible.",
  "invalid-date": "Usa fechas válidas para la plantilla.",
  "invalid-date-range": "La fecha fin no puede ser anterior a la fecha inicio.",
  "invalid-day": "El día de la semana no es válido.",
  "invalid-editor-time":
    "El horario visible de la plantilla debe tener inicio y fin válidos.",
  "invalid-reference":
    "Alguna referencia de plantilla ya no está disponible.",
  "invalid-required-coaches":
    "Los entrenadores necesarios deben ser un número entero entre 0 y 20.",
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
  "template-archive-confirmation-required":
    "Para archivar una plantilla usa Eliminar plantilla y confirma el aviso.",
  "template-block-delete-confirmation-required":
    "Para eliminar bloques de plantilla confirma el aviso.",
  "template-block-duplicate":
    "Ya existe un bloque igual en ese día, centro, actividad y horario.",
  "template-block-required": "No se ha recibido el bloque de plantilla.",
  "template-empty": "La plantilla necesita al menos un bloque antes de aplicarse.",
  "template-not-active": "Solo se pueden aplicar plantillas activas.",
  "template-out-of-range":
    "La semana seleccionada no cruza el rango de validez de esa plantilla.",
  "template-recovery-expired":
    "El periodo de recuperación de esta plantilla ha terminado. Mantendremos sus horarios históricos sin cambios.",
  "template-required": "No se ha recibido la plantilla.",
  "template-sync-coach-unavailable":
    "La plantilla se ha guardado, pero el horario generado no se ha sincronizado porque ese entrenador queda ocupado en otra franja.",
  "template-sync-failed":
    "La plantilla se ha guardado, pero no se ha podido sincronizar el horario generado.",
  "template-sync-invalid-coach":
    "La plantilla se ha guardado, pero el horario generado no se ha sincronizado porque el entrenador por defecto ya no está disponible.",
  "template-week-has-template":
    "Esta semana ya tiene una plantilla aplicada. Confirma la sustitución para reemplazar solo esa semana.",
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
      "id, center_id, name, status, valid_from, valid_until, archived_at, recoverable_until, metadata, updated_at",
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

async function getAppliedWeekTemplateSummaries({
  organizationId,
  weekEnd,
  weekStart,
}: {
  organizationId: string;
  weekEnd: string;
  weekStart: string;
}) {
  const supabase = await createClient();
  const { data: blocks, error } = await supabase
    .from("schedule_blocks")
    .select("center_id, template_id")
    .eq("organization_id", organizationId)
    .gte("service_date", weekStart)
    .lte("service_date", weekEnd)
    .not("template_id", "is", null)
    .neq("status", "cancelled");

  if (error) {
    throw new Error(`Could not load applied schedule templates: ${error.message}`);
  }

  const templateIds = [
    ...new Set(
      blocks.flatMap((block) => (block.template_id ? [block.template_id] : [])),
    ),
  ];

  if (templateIds.length === 0) {
    return [];
  }

  const { data: templates, error: templatesError } = await supabase
    .from("schedule_templates")
    .select("id, name")
    .eq("organization_id", organizationId)
    .in("id", templateIds);

  if (templatesError) {
    throw new Error(
      `Could not load applied schedule template names: ${templatesError.message}`,
    );
  }

  const templateNamesById = new Map(
    templates.map((template) => [template.id, template.name]),
  );
  const summariesByTemplateId = blocks.reduce((summaries, block) => {
    if (!block.template_id) {
      return summaries;
    }

    const summary =
      summaries.get(block.template_id) ??
      ({
        blockCount: 0,
        centerIds: new Set<string>(),
        templateId: block.template_id,
        templateName:
          templateNamesById.get(block.template_id) ?? "Plantilla anterior",
      } satisfies {
        blockCount: number;
        centerIds: Set<string>;
        templateId: string;
        templateName: string;
      });

    summary.blockCount += 1;
    summary.centerIds.add(block.center_id);
    summaries.set(block.template_id, summary);

    return summaries;
  }, new Map<string, {
    blockCount: number;
    centerIds: Set<string>;
    templateId: string;
    templateName: string;
  }>());

  return [...summariesByTemplateId.values()].map((summary) => ({
    blockCount: summary.blockCount,
    centerIds: [...summary.centerIds],
    templateId: summary.templateId,
    templateName: summary.templateName,
  })) satisfies AppliedWeekTemplateSummary[];
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

  const [
    linkedPersonProfilesResult,
    userPersonProfilesResult,
    membershipsResult,
  ] = await Promise.all([
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

  if (linkedPersonProfilesResult.error) {
    throw new Error(
      `Could not load person profiles: ${linkedPersonProfilesResult.error.message}`,
    );
  }

  if (userPersonProfilesResult.error) {
    throw new Error(
      `Could not load user person profiles: ${userPersonProfilesResult.error.message}`,
    );
  }

  if (membershipsResult.error) {
    throw new Error(
      `Could not load membership statuses: ${membershipsResult.error.message}`,
    );
  }

  const linkedPersonProfiles =
    linkedPersonProfilesResult.data satisfies PersonProfileRow[];
  const userPersonProfiles =
    userPersonProfilesResult.data satisfies PersonProfileRow[];
  const personProfilesById = new Map(
    [...linkedPersonProfiles, ...userPersonProfiles].map((personProfile) => [
      personProfile.id,
      personProfile,
    ]),
  );

  return {
    coachProfiles: coachProfiles satisfies CoachProfileRow[],
    memberships: membershipsResult.data satisfies MembershipStatusRow[],
    personProfiles: [...personProfilesById.values()],
  };
}

function selectClassName(className = "") {
  return [
    "h-11 w-full min-w-0 truncate rounded-md border border-input bg-transparent py-1 pl-3 pr-9 text-sm md:h-9",
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

function formatDateTime(value: string | null, timezone: string) {
  if (!value) {
    return "Sin fecha";
  }

  try {
    return new Intl.DateTimeFormat("es-ES", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: timezone,
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function getSafeColor(value: string | null) {
  return value && /^#[0-9a-f]{6}$/i.test(value) ? value : null;
}

function getClassTypeCardStyle(color: string | null): CSSProperties | undefined {
  const safeColor = getSafeColor(color);

  if (!safeColor) {
    return undefined;
  }

  return {
    backgroundColor: `color-mix(in oklch, ${safeColor} 8%, var(--background))`,
    borderColor: `color-mix(in oklch, ${safeColor} 32%, var(--border))`,
    borderLeftColor: safeColor,
    borderLeftWidth: "3px",
  };
}

function shortId(value: string) {
  return value.slice(0, 8);
}

function canRecoverTemplate(value: string | null, now: Date) {
  if (!value) {
    return true;
  }

  return new Date(value).getTime() >= now.getTime();
}

function getAppliedTemplateConflict({
  appliedTemplates,
  template,
}: {
  appliedTemplates: AppliedWeekTemplateSummary[];
  template: ScheduleTemplateRow;
}): AppliedTemplateConflict | null {
  const conflictingTemplates = appliedTemplates.filter((appliedTemplate) => {
    if (appliedTemplate.templateId === template.id) {
      return false;
    }

    if (!template.center_id) {
      return true;
    }

    return appliedTemplate.centerIds.includes(template.center_id);
  });

  if (conflictingTemplates.length === 0) {
    return null;
  }

  return {
    blockCount: conflictingTemplates.reduce(
      (total, appliedTemplate) => total + appliedTemplate.blockCount,
      0,
    ),
    templateName: conflictingTemplates
      .map((appliedTemplate) => appliedTemplate.templateName)
      .join(", "),
  };
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
      label: `Entrenador sin perfil visible ${shortId(coachProfile.id)}`,
    };
  }

  return {
    detail: `Perfil técnico incompleto ${shortId(coachProfile.id)}`,
    id: coachProfile.id,
    isFallback: true,
    label: `Entrenador sin perfil visible ${shortId(coachProfile.id)}`,
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
  const personProfilesByUserId = new Map(
    personProfiles.flatMap((personProfile) =>
      personProfile.user_id
        ? [[personProfile.user_id, personProfile] as const]
        : [],
    ),
  );
  const displays = coachProfiles.map((coachProfile) =>
    getCoachDisplay({
      coachProfile,
      membership: coachProfile.user_id
        ? membershipsByUserId.get(coachProfile.user_id)
        : undefined,
      personProfile: coachProfile.person_profile_id
        ? personProfilesById.get(coachProfile.person_profile_id)
        : coachProfile.user_id
          ? personProfilesByUserId.get(coachProfile.user_id)
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
        : coachProfile.user_id
          ? personProfilesByUserId.get(coachProfile.user_id)
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
  const editableStatuses = SCHEDULE_TEMPLATE_STATUSES.filter(
    (status) => status !== "archived",
  );

  return (
    <select
      className={selectClassName()}
      defaultValue={defaultValue ?? "draft"}
      name="status"
    >
      {editableStatuses.map((status) => (
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

function CenterReadOnlyField({
  center,
  name = "centerId",
}: {
  center: CenterRow | undefined;
  name?: string;
}) {
  return (
    <div className="grid gap-2">
      <input name={name} type="hidden" value={center?.id ?? ""} />
      <Input
        aria-readonly="true"
        readOnly
        value={center?.name ?? "Centro no disponible"}
      />
    </div>
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
  requiredCoaches = 1,
}: {
  coaches: CoachDisplay[];
  defaultValue?: string | null;
  requiredCoaches?: number;
}) {
  if (!scheduleTemplateBlockRequiresCoach(requiredCoaches)) {
    return (
      <>
        <input name="defaultCoachProfileId" type="hidden" value="none" />
        <select
          aria-readonly="true"
          className={selectClassName()}
          disabled
          value="none"
        >
          <option value="none">No requiere entrenador</option>
        </select>
      </>
    );
  }

  return (
    <select
      className={selectClassName()}
      defaultValue={defaultValue ?? "none"}
      name="defaultCoachProfileId"
    >
      <option value="none">Sin entrenador por defecto (vacante)</option>
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

      <label className="grid min-w-0 gap-2 lg:col-span-2">
        <span className="text-sm font-medium">Nombre</span>
        <Input
          maxLength={120}
          name="name"
          placeholder="Semana base"
          required
        />
      </label>

      <label className="grid min-w-0 gap-2 lg:col-span-2">
        <span className="text-sm font-medium">Alcance de centro</span>
        <OptionalCenterSelect centers={activeCenters} />
      </label>

      <label className="grid min-w-0 gap-2">
        <span className="text-sm font-medium">Válida desde</span>
        <Input name="validFrom" type="date" />
      </label>

      <label className="grid min-w-0 gap-2">
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
  const editorSettings = getScheduleTemplateEditorSettings(template.metadata);

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

      <label className="grid min-w-0 gap-2 lg:col-span-2">
        <span className="text-sm font-medium">Nombre</span>
        <Input
          defaultValue={template.name}
          maxLength={120}
          name="name"
          required
        />
      </label>

      <label className="grid min-w-0 gap-2 lg:col-span-2">
        <span className="text-sm font-medium">Alcance de centro</span>
        <OptionalCenterSelect
          centers={centers}
          defaultValue={template.center_id}
        />
      </label>

      <label className="grid min-w-0 gap-2">
        <span className="text-sm font-medium">Valida desde</span>
        <Input
          defaultValue={template.valid_from ?? ""}
          name="validFrom"
          type="date"
        />
      </label>

      <label className="grid min-w-0 gap-2">
        <span className="text-sm font-medium">Valida hasta</span>
        <Input
          defaultValue={template.valid_until ?? ""}
          name="validUntil"
          type="date"
        />
      </label>

      <label className="grid min-w-0 gap-2">
        <span className="text-sm font-medium">Horario desde</span>
        <Input
          defaultValue={editorSettings.startTime}
          name="editorStartTime"
          required
          type="time"
        />
      </label>

      <label className="grid min-w-0 gap-2">
        <span className="text-sm font-medium">Horario hasta</span>
        <Input
          defaultValue={editorSettings.endTime}
          name="editorEndTime"
          required
          type="time"
        />
      </label>

      <label className="grid min-w-0 gap-2">
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
  templateCenterId,
}: {
  assignableCoaches: CoachDisplay[];
  block?: ScheduleTemplateBlockRow;
  centers: CenterRow[];
  classTypes: ClassTypeRow[];
  defaultDay?: TemplateDay;
  disabled?: boolean;
  templateCenterId?: string | null;
}) {
  const templateCenter = templateCenterId
    ? centers.find((center) => center.id === templateCenterId)
    : undefined;

  return (
    <>
      <label className="grid min-w-0 gap-2">
        <span className="text-sm font-medium">Día</span>
        <DaySelect defaultValue={block?.day_of_week ?? defaultDay} />
      </label>

      <label className="grid min-w-0 gap-2">
        <span className="text-sm font-medium">Inicio</span>
        <Input
          defaultValue={block ? formatTime(block.start_time) : ""}
          name="startTime"
          required
          type="time"
        />
      </label>

      <label className="grid min-w-0 gap-2">
        <span className="text-sm font-medium">Fin</span>
        <Input
          defaultValue={block ? formatTime(block.end_time) : ""}
          name="endTime"
          required
          type="time"
        />
      </label>

      <label className="grid min-w-0 gap-2">
        <span className="text-sm font-medium">Centro</span>
        {templateCenterId ? (
          <CenterReadOnlyField center={templateCenter} />
        ) : (
          <CenterSelect
            centers={centers}
            defaultValue={block?.center_id}
            disabled={disabled}
          />
        )}
      </label>

      <label className="grid min-w-0 gap-2">
        <span className="text-sm font-medium">Tipo de actividad</span>
        <ClassTypeSelect
          classTypes={classTypes}
          defaultValue={block?.class_type_id}
          disabled={disabled}
        />
      </label>

      <label className="grid min-w-0 gap-2">
        <span className="text-sm font-medium">Entrenadores necesarios</span>
        <Input
          defaultValue={block?.required_coaches ?? 1}
          max="20"
          min="0"
          name="requiredCoaches"
          required
          type="number"
        />
      </label>

      <label className="grid min-w-0 gap-2 lg:col-span-2">
        <span className="text-sm font-medium">Entrenador por defecto</span>
        <CoachSelect
          coaches={assignableCoaches}
          defaultValue={block?.default_coach_profile_id}
          requiredCoaches={block?.required_coaches ?? 1}
        />
      </label>

      <label className="grid min-w-0 gap-2 lg:col-span-6">
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

function TemplateBlockEditForm({
  assignableCoaches,
  block,
  centers,
  classTypes,
  organizationId,
  selectedDay,
  templateCenterId,
  view,
  weekStart,
}: {
  assignableCoaches: CoachDisplay[];
  block: ScheduleTemplateBlockRow;
  centers: CenterRow[];
  classTypes: ClassTypeRow[];
  organizationId: string;
  selectedDay: TemplateDay;
  templateCenterId?: string | null;
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
        templateCenterId={templateCenterId}
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
  templateCenterId,
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
  templateCenterId?: string | null;
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
  const requiresCoach = scheduleTemplateBlockRequiresCoach(
    block.required_coaches,
  );
  const defaultCoachLabel = getScheduleTemplateDefaultCoachLabel({
    defaultCoachLabel: defaultCoach?.label,
    requiredCoaches: block.required_coaches,
  });
  const defaultCoachDetail = getScheduleTemplateDefaultCoachDetail({
    defaultCoachLabel: defaultCoach?.label,
    requiredCoaches: block.required_coaches,
  });
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
            {getScheduleTemplateRequiredCoachesLabel(block.required_coaches)}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Badge variant={requiresCoach && defaultCoach ? "secondary" : "outline"}>
            {requiresCoach && defaultCoach
              ? `Por defecto: ${defaultCoach.label}`
              : defaultCoachLabel}
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
        {requiresCoach ? (
          <MetaItem label="Entrenador por defecto">
            {defaultCoachDetail}
          </MetaItem>
        ) : null}
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
            templateCenterId={templateCenterId}
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
  const requiresCoach = scheduleTemplateBlockRequiresCoach(
    block.required_coaches,
  );
  const defaultCoachLabel = getScheduleTemplateDefaultCoachLabel({
    defaultCoachLabel: defaultCoach?.label,
    requiredCoaches: block.required_coaches,
  });
  const defaultCoachDetail = getScheduleTemplateDefaultCoachDetail({
    defaultCoachLabel: defaultCoach?.label,
    requiredCoaches: block.required_coaches,
  });

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
            {getScheduleTemplateRequiredCoachesLabel(block.required_coaches)}
          </p>
        </div>
        <Badge variant={requiresCoach && defaultCoach ? "secondary" : "outline"}>
          {requiresCoach && defaultCoach
            ? `Por defecto: ${defaultCoach.label}`
            : defaultCoachLabel}
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
        {requiresCoach ? (
          <div className="min-w-0">
            <dt className="text-muted-foreground">Entrenador por defecto</dt>
            <dd className="mt-1 truncate font-medium">
              {defaultCoachDetail}
            </dd>
          </div>
        ) : null}
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
  const requiresCoach = scheduleTemplateBlockRequiresCoach(
    block.required_coaches,
  );
  const defaultCoachLabel = getScheduleTemplateDefaultCoachLabel({
    defaultCoachLabel: defaultCoach?.label,
    requiredCoaches: block.required_coaches,
  });
  const defaultCoachDetail = getScheduleTemplateDefaultCoachDetail({
    defaultCoachLabel: defaultCoach?.label,
    requiredCoaches: block.required_coaches,
  });
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
        "min-w-0 overflow-hidden rounded-md border border-border bg-background px-2.5 py-2.5 text-xs",
        "min-h-[9.25rem] transition-colors",
        isEditing ? "ring-2 ring-ring/30" : "",
      )}
      style={getClassTypeCardStyle(classType?.color ?? null)}
    >
      <div className="flex min-w-0 items-center justify-between gap-2">
        <p className="min-w-0 truncate font-mono text-[11px] font-medium text-muted-foreground">
          {formatTime(block.start_time)} - {formatTime(block.end_time)}
        </p>
        <Badge
          className="h-5 max-w-24 shrink-0 px-1.5 text-[11px]"
          variant={requiresCoach && defaultCoach ? "secondary" : "outline"}
        >
          {requiresCoach && defaultCoach ? "Asignado" : defaultCoachLabel}
        </Badge>
      </div>

      <h4 className="mt-2 flex min-w-0 items-start gap-1.5 text-xs font-semibold leading-snug tracking-tight">
        <ColorSwatch color={classType?.color ?? null} />
        <span className="min-w-0 break-words">
          {classType?.name ?? "Tipo no disponible"}
        </span>
      </h4>

      <div className="mt-1.5 grid min-w-0 gap-0.5 text-[11px] leading-5 text-muted-foreground">
        <p className="truncate">
          <span className="font-medium text-foreground">
            {center?.name ?? "Centro no disponible"}
          </span>
        </p>
        <p>{getScheduleTemplateRequiredCoachesLabel(block.required_coaches)}</p>
        {requiresCoach ? (
          <p className="truncate">{defaultCoachDetail}</p>
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
  templateCenterId,
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
  templateCenterId?: string | null;
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
            templateCenterId={templateCenterId}
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
  templateCenterId,
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
  templateCenterId?: string | null;
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
            templateCenterId={templateCenterId}
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
  appliedTemplateConflict,
  assignedBlockCount,
  blockCount,
  organizationId,
  selectedDay,
  template,
  view,
  weekStart,
}: {
  appliedTemplateConflict: AppliedTemplateConflict | null;
  assignedBlockCount: number;
  blockCount: number;
  organizationId: string;
  selectedDay: TemplateDay;
  template: ScheduleTemplateRow;
  view: TemplateView;
  weekStart: string;
}) {
  const canApply = template.status === "active" && blockCount > 0;
  const formId = `apply-template-${template.id}`;

  return (
    <form
      action={applyScheduleTemplateToWeek}
      className="grid gap-3 sm:grid-cols-[minmax(180px,240px)_auto]"
      id={formId}
    >
      <input name="organizationId" type="hidden" value={organizationId} />
      <input name="day" type="hidden" value={String(selectedDay)} />
      <input name="templateId" type="hidden" value={template.id} />
      <input name="view" type="hidden" value={view} />
      <label className="grid min-w-0 gap-2">
        <span className="text-sm font-medium">Semana destino</span>
        <Input defaultValue={weekStart} name="weekStart" required type="date" />
      </label>
      <div className="flex items-end">
        <TemplateApplySubmit
          canApply={canApply}
          existingBlockCount={appliedTemplateConflict?.blockCount ?? 0}
          existingTemplateName={appliedTemplateConflict?.templateName ?? null}
          formId={formId}
        />
      </div>
      {blockCount > 0 ? (
        <p className="text-sm text-muted-foreground sm:col-span-2">
          Creará {blockCount} bloque{blockCount === 1 ? "" : "s"} y asignará{" "}
          {assignedBlockCount} entrenador
          {assignedBlockCount === 1 ? "" : "es"} por defecto. Los bloques sin
          requisito no crean cobertura pendiente; los bloques con requisito y
          sin entrenador por defecto quedan como cobertura pendiente.
        </p>
      ) : null}
      {appliedTemplateConflict ? (
        <p className="text-sm text-amber-800 sm:col-span-2">
          Esta semana ya tiene una plantilla aplicada. Para sustituirla se
          pedira confirmacion y solo cambiara esa semana.
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

function TemplateArchiveForm({
  organizationId,
  selectedDay,
  template,
  view,
  weekStart,
}: {
  organizationId: string;
  selectedDay: TemplateDay;
  template: ScheduleTemplateRow;
  view: TemplateView;
  weekStart: string;
}) {
  const formId = `archive-template-${template.id}`;

  return (
    <form action={archiveScheduleTemplate} id={formId}>
      <TemplateHiddenInputs
        organizationId={organizationId}
        selectedDay={selectedDay}
        templateId={template.id}
        view={view}
        weekStart={weekStart}
      />
      <TemplateArchiveSubmit formId={formId} templateName={template.name} />
    </form>
  );
}

function TemplateArchiveDangerZone({
  organizationId,
  selectedDay,
  template,
  view,
  weekStart,
}: {
  organizationId: string;
  selectedDay: TemplateDay;
  template: ScheduleTemplateRow;
  view: TemplateView;
  weekStart: string;
}) {
  return (
    <div className="grid gap-3 border-t border-border pt-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
      <div className="min-w-0">
        <p className="text-sm font-semibold tracking-tight">
          Eliminar plantilla
        </p>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          Archiva esta plantilla durante 30 días. Los horarios ya generados se
          conservan sin cambios.
        </p>
      </div>
      <TemplateArchiveForm
        organizationId={organizationId}
        selectedDay={selectedDay}
        template={template}
        view={view}
        weekStart={weekStart}
      />
    </div>
  );
}

function ArchivedTemplateCard({
  blockCount,
  canManageTemplates,
  organizationId,
  selectedDay,
  template,
  timezone,
  view,
  weekStart,
}: {
  blockCount: number;
  canManageTemplates: boolean;
  organizationId: string;
  selectedDay: TemplateDay;
  template: ScheduleTemplateRow;
  timezone: string;
  view: TemplateView;
  weekStart: string;
}) {
  const now = new Date();
  const recoverable = canRecoverTemplate(template.recoverable_until, now);

  return (
    <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h3 className="truncate text-sm font-semibold tracking-tight">
            {template.name}
          </h3>
          <p className="text-sm leading-5 text-muted-foreground">
            Archivada el {formatDateTime(template.archived_at, timezone)}.
            Horarios generados conservados.
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <TemplateStatusBadge status={template.status} />
          <Badge variant="outline">
            {blockCount} bloque{blockCount === 1 ? "" : "s"}
          </Badge>
        </div>
      </div>

      <MetaGrid className="mt-4 lg:grid-cols-3">
        <MetaItem label="Recuperable hasta">
          {formatDateTime(template.recoverable_until, timezone)}
        </MetaItem>
        <MetaItem label="Válida desde">
          {formatDate(template.valid_from)}
        </MetaItem>
        <MetaItem label="Válida hasta">
          {formatDate(template.valid_until)}
        </MetaItem>
      </MetaGrid>

      {canManageTemplates ? (
        <form action={restoreScheduleTemplate} className="mt-4">
          <TemplateHiddenInputs
            organizationId={organizationId}
            selectedDay={selectedDay}
            templateId={template.id}
            view={view}
            weekStart={weekStart}
          />
          <Button disabled={!recoverable} type="submit" variant="outline">
            <RotateCcw aria-hidden="true" />
            Recuperar como borrador
          </Button>
          {!recoverable ? (
            <p className="mt-2 text-sm text-muted-foreground">
              El periodo de recuperación ha terminado. La plantilla queda fuera
              del uso operativo y el borrado definitivo debe resolverse con la
              lógica segura del proyecto.
            </p>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}

function TemplateCard({
  activeCenters,
  activeClassTypes,
  appliedTemplateConflict,
  assignableCoaches,
  blocks,
  canManageTemplates,
  centers,
  classTypes,
  coachDisplaysById,
  defaultExpanded,
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
  appliedTemplateConflict: AppliedTemplateConflict | null;
  assignableCoaches: CoachDisplay[];
  blocks: ScheduleTemplateBlockRow[];
  canManageTemplates: boolean;
  centers: CenterRow[];
  classTypes: ClassTypeRow[];
  coachDisplaysById: Map<string, CoachDisplay>;
  defaultExpanded: boolean;
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
  const blocksRequiringCoach = blocks.filter((block) =>
    scheduleTemplateBlockRequiresCoach(block.required_coaches),
  );
  const assignedBlockCount = blocksRequiringCoach.filter(
    (block) => block.default_coach_profile_id,
  ).length;
  const vacantBlockCount = blocksRequiringCoach.length - assignedBlockCount;
  const noRequirementBlockCount = blocks.length - blocksRequiringCoach.length;
  const editorSettings = getScheduleTemplateEditorSettings(template.metadata);

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
              {assignedBlockCount} asignado
              {assignedBlockCount === 1 ? "" : "s"}
            </Badge>
            <Badge variant="outline">
              {vacantBlockCount} vacante{vacantBlockCount === 1 ? "" : "s"}
            </Badge>
            {noRequirementBlockCount > 0 ? (
              <Badge variant="outline">
                {noRequirementBlockCount} sin requisito
              </Badge>
            ) : null}
            <Badge variant="outline">
              {blocks.length} bloque{blocks.length === 1 ? "" : "s"}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <MetaGrid className="lg:grid-cols-4">
          <MetaItem label="Válida desde">
            {formatDate(template.valid_from)}
          </MetaItem>
          <MetaItem label="Válida hasta">
            {formatDate(template.valid_until)}
          </MetaItem>
          <MetaItem label="Horario visible">
            {editorSettings.startTime} - {editorSettings.endTime}
          </MetaItem>
          <MetaItem label="Al aplicar">
            Crea horarios y asigna entrenadores por defecto cuando corresponde.
          </MetaItem>
        </MetaGrid>

        <details
          className="group rounded-lg border border-border bg-muted/20"
          data-template-details
          open={defaultExpanded}
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-3 outline-none transition-colors hover:bg-muted/45 focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
            <div className="min-w-0">
              <span className="block text-sm font-semibold tracking-tight">
                Detalle completo
              </span>
              <span className="mt-1 block text-sm text-muted-foreground">
                Formularios, aplicación a semana y bloques por día.
              </span>
            </div>
            <span className="shrink-0 rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground">
              <span className="group-open:hidden">Mostrar</span>
              <span className="hidden group-open:inline">Ocultar</span>
            </span>
          </summary>
          <div className="space-y-5 border-t border-border bg-background/70 px-3 py-4 sm:px-4">

        {canManageTemplates ? (
          <div className="grid gap-3">
            <InlineEditDetails label="Editar plantilla">
              <div className="grid gap-4">
                <TemplateMetaForm
                  centers={centers}
                  organizationId={organizationId}
                  selectedDay={selectedDay}
                  template={template}
                  view={view}
                  weekStart={weekStart}
                />
                {!templateArchived ? (
                  <TemplateArchiveDangerZone
                    organizationId={organizationId}
                    selectedDay={selectedDay}
                    template={template}
                    view={view}
                    weekStart={weekStart}
                  />
                ) : null}
              </div>
            </InlineEditDetails>
            <InlineEditDetails label="Aplicar a semana">
              <ApplyTemplateForm
                appliedTemplateConflict={appliedTemplateConflict}
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
                  ? "Distribuidos por día para editar con menos scroll."
                  : "Lista completa ordenada por día y hora."}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {canManageTemplates && !templateArchived ? (
                <TemplateBlockCreateForm
                  activeCenters={activeCenters}
                  activeClassTypes={activeClassTypes}
                  assignableCoaches={assignableCoaches}
                  centers={centers}
                  editorSettings={editorSettings}
                  organizationId={organizationId}
                  selectedDay={selectedDay}
                  templateCenterId={template.center_id}
                  templateId={template.id}
                  view={view}
                  weekStart={weekStart}
                />
              ) : null}
              <Badge variant="outline">{blocks.length} total</Badge>
            </div>
          </div>

          {canManageTemplates && !templateArchived ? (
            <TemplateBlocksEditor
              activeCenters={activeCenters}
              activeClassTypes={activeClassTypes}
              assignableCoaches={assignableCoaches}
              blocks={blocks}
              centers={centers}
              classTypes={classTypes}
              coachDisplays={Array.from(coachDisplaysById.values())}
              editorSettings={editorSettings}
              initialEditBlockId={editBlockId}
              initialSelectedDay={selectedDay}
              mode={view}
              organizationId={organizationId}
              templateCenterId={template.center_id}
              templateId={template.id}
              view={view}
              weekStart={weekStart}
            />
          ) : blocks.length === 0 ? (
            <div className="rounded-lg border border-border p-4">
              <p className="text-sm text-muted-foreground">
                Esta plantilla todavía no tiene bloques. Añade el primer bloque
                antes de aplicarla a una semana.
              </p>
            </div>
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
              templateCenterId={template.center_id}
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
              templateCenterId={template.center_id}
              templateArchived={templateArchived}
              view={view}
              weekStart={weekStart}
            />
          )}
        </section>
          </div>
        </details>
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
  const canManageTemplates = canManageOperationalData(
    resolution.membership.role,
  );

  if (!canManageTemplates) {
    return (
      <div className="space-y-6">
        <PageHeader
          organizationId={resolution.organization.id}
          organizationName={resolution.organization.name}
          role={resolution.membership.role}
          weekEnd={week.weekEnd}
          weekStart={week.weekStart}
        />

        <Alert>
          <ShieldCheck aria-hidden="true" className="size-4" />
          <AlertTitle>Plantillas reservadas para gestión</AlertTitle>
          <AlertDescription>
            Propietario, Administrador y Responsable crean, editan o aplican
            plantillas. Para consultar tus clases, usa Horario.
          </AlertDescription>
        </Alert>

        <Button asChild variant="outline">
          <Link
            href={getSchedulePath({
              mineOnly: true,
              organizationId: resolution.organization.id,
              week: week.weekStart,
            })}
          >
            <CalendarDays aria-hidden="true" />
            Abrir horario
          </Link>
        </Button>
      </div>
    );
  }

  const supabase = await createClient();
  await ensureActiveScheduleTemplatesForWindow({
    organizationId: resolution.organization.id,
    supabase,
    timezone: resolution.organization.timezone,
    windowEnd: week.weekEnd,
    windowStart: week.weekStart,
  });

  const [templates, centers, classTypes, coachContext, appliedWeekTemplates] =
    await Promise.all([
    getScheduleTemplates(resolution.organization.id),
    getCenters(resolution.organization.id),
    getClassTypes(resolution.organization.id),
    getScheduleCoachContext(resolution.organization.id),
    getAppliedWeekTemplateSummaries({
      organizationId: resolution.organization.id,
      weekEnd: week.weekEnd,
      weekStart: week.weekStart,
    }),
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
  const activeCenters = centers.filter((center) => center.status === "active");
  const activeClassTypes = classTypes.filter(
    (classType) => classType.status === "active",
  );
  const activeTemplates = templates.filter(
    (template) => template.status !== "archived",
  );
  const archivedTemplates = templates.filter(
    (template) => template.status === "archived",
  );

  return (
    <div className="space-y-6">
      <PageHeader
        organizationId={resolution.organization.id}
        organizationName={resolution.organization.name}
        role={resolution.membership.role}
        templateCount={activeTemplates.length}
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
        <TransientFeedbackBanner
          description="La lista ya muestra las plantillas actuales."
          title={successMessages[status]}
          tone="success"
        />
      ) : null}

      {error && errorMessages[error] ? (
        <TransientFeedbackBanner
          description={errorMessages[error]}
          title="No se han guardado los cambios"
          tone="error"
        />
      ) : null}

      {canManageTemplates ? (
        <CollapsibleActionPanel
          actionLabel="Crear"
          description="Define una semana base con horarios, vacantes y entrenadores por defecto."
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
              <TemplateExpansionControls
                templateCount={activeTemplates.length}
              />
              <TemplateViewTabs
                editBlockId={editBlockId}
                organizationId={resolution.organization.id}
                selectedDay={selectedDay}
                view={templateView}
                weekStart={week.weekStart}
              />
              <Badge variant="outline">
                {activeTemplates.length} activa
                {activeTemplates.length === 1 ? "" : "s"}
              </Badge>
              {archivedTemplates.length > 0 ? (
                <Badge variant="outline">
                  {archivedTemplates.length} archivada
                  {archivedTemplates.length === 1 ? "" : "s"}
                </Badge>
              ) : null}
            </div>
          }
          description="Patrones semanales reutilizables con horarios y entrenadores por defecto."
          title="Plantillas semanales"
        />

        {activeTemplates.length === 0 ? (
          <EmptyState
            description={
              canManageTemplates
                ? "Crea una plantilla semanal para dejar de cargar cada semana desde cero."
                : "Un rol operativo debe crear plantillas antes de que aparezcan aquí."
            }
            title="No hay plantillas activas"
          />
        ) : (
          <div className="grid gap-3">
            {activeTemplates.map((template) => {
              const blocks = blocksByTemplateId.get(template.id) ?? [];
              const hasEditingBlock = Boolean(
                editBlockId &&
                  blocks.some((block) => block.id === editBlockId),
              );

              return (
                <TemplateCard
                  activeCenters={activeCenters}
                  activeClassTypes={activeClassTypes}
                  appliedTemplateConflict={getAppliedTemplateConflict({
                    appliedTemplates: appliedWeekTemplates,
                    template,
                  })}
                  assignableCoaches={assignableCoaches}
                  blocks={blocks}
                  canManageTemplates={canManageTemplates}
                  centers={centers}
                  classTypes={classTypes}
                  coachDisplaysById={coachDisplaysById}
                  defaultExpanded={
                    activeTemplates.length === 1 || hasEditingBlock
                  }
                  editBlockId={editBlockId}
                  key={template.id}
                  organizationId={resolution.organization.id}
                  selectedDay={selectedDay}
                  template={template}
                  timezone={resolution.organization.timezone}
                  view={templateView}
                  weekStart={week.weekStart}
                />
              );
            })}
          </div>
        )}
      </section>

      {archivedTemplates.length > 0 ? (
        <section className="space-y-3">
          <SectionHeader
            description="Fuera de uso operativo. Se pueden recuperar durante la ventana de retención sin tocar horarios ya generados."
            title="Plantillas archivadas"
          />
          <div className="grid gap-3">
            {archivedTemplates.map((template) => (
              <ArchivedTemplateCard
                blockCount={blocksByTemplateId.get(template.id)?.length ?? 0}
                canManageTemplates={canManageTemplates}
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
        </section>
      ) : null}

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
        {roleLabel ? <Badge variant="outline">{roleLabel}</Badge> : null}
        {typeof templateCount === "number" ? (
          <Badge variant="outline">{templateCount} plantillas</Badge>
        ) : null}
      </div>
      <div className="max-w-3xl space-y-2">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          <CalendarRange aria-hidden="true" className="size-6" />
          Plantillas semanales
        </h1>
      </div>
      <details className="group max-w-3xl">
        <summary className="cursor-pointer list-none text-sm leading-6 text-muted-foreground outline-none focus-visible:rounded-md focus-visible:ring-3 focus-visible:ring-ring/50 md:text-base [&::-webkit-details-marker]:hidden">
          <span>
            Crea semanas base con horarios, bloques vacantes y entrenadores por
            defecto que se reutilizan al aplicar la plantilla.
          </span>{" "}
          <span className="inline-flex font-medium text-foreground underline underline-offset-4 group-open:hidden">
            Más
          </span>
          <span className="hidden font-medium text-foreground underline underline-offset-4 group-open:inline-flex">
            Menos
          </span>
        </summary>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="flex items-start gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground">
            <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>
              Propietario, Administrador y Responsable pueden crear, editar o
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
      </details>
    </section>
  );
}
