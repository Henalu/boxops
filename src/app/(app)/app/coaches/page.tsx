import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Filter,
  KeyRound,
  Mail,
  RotateCcw,
  Save,
  Search,
  Trash2,
  UserPlus,
  UsersRound,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import {
  cancelTeamInvitation,
  createCoachProfile,
  createDirectTeamAccount,
  createTeamInvitation,
  deleteCoachProfile,
  resendTeamInvitation,
  updateCoachProfile,
  updateMembership,
} from "./actions";
import {
  CollapsibleActionPanel,
  InlineEditDetails,
  MetaGrid,
  MetaItem,
} from "@/components/features/management-ui";
import {
  EmptyState,
  PageHeader,
  SectionHeader,
  StatusBadge,
} from "@/components/features/operations-ui";
import { OrganizationResolutionState } from "@/components/features/organization-resolution-state";
import { TransientFeedbackBanner } from "@/components/features/transient-feedback-banner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_PATTERN_ATTRIBUTE,
  PASSWORD_POLICY_DESCRIPTION,
} from "@/lib/auth/password-policy";
import { getLoginPath } from "@/lib/auth/redirects";
import {
  canDeleteOperationalTeamProfiles,
  canManageOperationalTeamProfiles,
  canManageTeamAccess,
  getApplicationRoleLabel,
} from "@/lib/auth/permissions";
import {
  getActiveMemberships,
  getAuthenticatedUser,
  resolveActiveOrganization,
} from "@/lib/auth/tenant";
import {
  COACH_PROFILE_STATUSES,
  MEMBERSHIP_ROLES,
  MEMBERSHIP_STATUSES,
  getCoachProfileStatusLabel,
  getMembershipRoleLabel,
  getMembershipStatusLabel,
  isCoachProfileStatus,
  isMembershipRole,
} from "@/lib/coaches";
import { getCoachesPath } from "@/lib/navigation/app-paths";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/supabase";

export const dynamic = "force-dynamic";

type CoachesPageProps = {
  searchParams: Promise<{
    center_id?: string | string[];
    error?: string | string[];
    link_status?: string | string[];
    organizationId?: string | string[];
    profile_status?: string | string[];
    q?: string | string[];
    role?: string | string[];
    status?: string | string[];
  }>;
};

type MembershipRow = Pick<
  Tables<"organization_memberships">,
  | "created_at"
  | "id"
  | "invited_at"
  | "joined_at"
  | "organization_id"
  | "role"
  | "status"
  | "updated_at"
  | "user_id"
>;

type CoachProfileRow = Pick<
  Tables<"coach_profiles">,
  | "id"
  | "notes"
  | "organization_id"
  | "person_profile_id"
  | "primary_center_id"
  | "status"
  | "updated_at"
  | "user_id"
  | "weekly_contracted_hours"
>;

type CenterRow = Pick<Tables<"centers">, "id" | "name" | "status">;

type PersonProfileRow = Pick<
  Tables<"person_profiles">,
  "display_name" | "id" | "status" | "user_id" | "visibility_status"
>;

type TeamInvitationRow = Pick<
  Tables<"team_invitations">,
  | "coach_profile_id"
  | "created_at"
  | "email_normalized"
  | "expires_at"
  | "id"
  | "initial_access_status"
  | "last_error"
  | "last_sent_at"
  | "organization_id"
  | "person_profile_id"
  | "role"
  | "send_count"
  | "sent_at"
  | "status"
>;

type PersonProfileMaps = {
  byId: Map<string, PersonProfileRow>;
  byUserId: Map<string, PersonProfileRow>;
};

type CoachProfileLinkStatus = "incomplete" | "linked" | "pending";

type TeamLinkingReviewSummary = {
  incompleteCoachProfiles: number;
  membershipsWithoutVisiblePerson: number;
  openInvitations: number;
  profilesWithoutLinkedAccount: number;
};

type CoachProfileFilters = {
  centerId: string | null;
  linkStatus: CoachProfileLinkStatus | null;
  profileStatusIsDefault: boolean;
  profileStatus: string | null;
  query: string;
  role: string | null;
};

type TeamUserRow = {
  detail: string;
  id: string;
  label: string;
  linkStatus: CoachProfileLinkStatus;
  membership: MembershipRow | null;
  personProfile?: PersonProfileRow;
  profile: CoachProfileRow | null;
  role: string | null;
};

const NO_CENTER_FILTER_VALUE = "__no_center";
const WITHOUT_ACCESS_ROLE_FILTER_VALUE = "__without_access";
const COACH_PROFILE_LINK_FILTERS: Array<{
  label: string;
  value: CoachProfileLinkStatus;
}> = [
  { label: "Cuenta vinculada", value: "linked" },
  { label: "Pendiente de vincular cuenta", value: "pending" },
  { label: "Revisar vinculación", value: "incomplete" },
];

const OPEN_TEAM_INVITATION_STATUSES = [
  "pending",
  "sent",
  "failed",
  "expired",
] as const;

const teamLinkStatusLabels: Record<CoachProfileLinkStatus, string> = {
  incomplete: "Revisar vinculación",
  linked: "Cuenta vinculada",
  pending: "Pendiente de vincular cuenta",
};

const successMessages: Record<string, string> = {
  "account-created": "Cuenta creada.",
  "account-linked": "Cuenta vinculada.",
  "invitation-cancelled": "Invitación cancelada.",
  "invitation-resent": "Invitación reenviada.",
  "invitation-sent": "Invitación enviada.",
  "membership-created": "Usuario creado.",
  "membership-updated": "Usuario actualizado.",
  "profile-archived": "Datos operativos archivados.",
  "profile-created": "Datos operativos creados.",
  "profile-deleted": "Datos operativos eliminados.",
  "profile-updated": "Datos operativos actualizados.",
};

const errorMessages: Record<string, string> = {
  "account-create-rollback-failed":
    "No se ha podido completar el alta. Revisa Auth antes de reintentarlo.",
  "account-email-already-exists":
    "Ya existe una cuenta Auth con ese email. Usa invitación o revisa sus accesos antes de crear otra alta.",
  "account-link-conflict":
    "Esa cuenta ya está vinculada a otra persona o datos operativos del equipo.",
  "account-linked-to-other-coach":
    "Esa cuenta ya está vinculada a otros datos operativos de esta organización.",
  "account-linked-to-other-person":
    "Esa cuenta ya está vinculada a otra persona de esta organización.",
  "auth-user-not-found":
    "No se ha encontrado esa cuenta. Para altas nuevas, envía una invitación o crea una cuenta directa.",
  "auth-account-create-failed":
    "No se ha podido crear la cuenta Auth con esos datos.",
  "auth-admin-not-configured":
    "La creacion directa requiere configurar la clave server-side de Supabase Auth en este entorno.",
  "coach-user-conflict":
    "Los datos operativos ya están vinculados a otra cuenta.",
  "duplicate-membership":
    "Esa persona ya tiene acceso en esta organización.",
  "duplicate-invitation":
    "Ya existe una invitación pendiente para ese email o esos datos operativos.",
  "duplicate-profile":
    "Ese usuario ya tiene datos operativos en esta organización.",
  "display-name-too-long": "El nombre visible no puede superar 80 caracteres.",
  "email-not-configured":
    "El envío de email no está configurado para este entorno.",
  "email-send-failed":
    "No se ha podido enviar el email. Revisa la configuracion segura del proveedor transaccional.",
  forbidden: "Tu rol no permite gestionar usuarios ni perfiles.",
  "invalid-center": "El centro principal seleccionado no es válido.",
  "invalid-email": "Introduce un email válido para enviar la invitación.",
  "invalid-hours": "Las horas semanales deben estar entre 0 y 168.",
  "invalid-invitation-id": "La invitación recibida no es válida.",
  "invalid-person-profile":
    "La persona vinculada a esos datos no pertenece a esta organización.",
  "invalid-profile-id": "Los datos operativos recibidos no son válidos.",
  "invalid-profile-reference":
    "Los datos no se han podido guardar porque falta un acceso o centro válido.",
  "invalid-role":
    "El rol debe ser Propietario, Administrador, Responsable o Entrenador.",
  "invalid-status": "El estado seleccionado no es válido.",
  "invalid-user-id": "Selecciona una cuenta valida del equipo.",
  "membership-required": "No se ha encontrado el acceso de esta organización.",
  "invitation-closed": "Esa invitación ya está cerrada.",
  "invitation-rate-limited": "Espera un minuto antes de reenviar la invitación.",
  "invitation-required": "No se ha encontrado una invitación válida.",
  "missing-fields": "Completa los campos obligatorios.",
  no_active_memberships: "No hay accesos activos para este usuario.",
  "notes-too-long": "Las notas no pueden superar 1000 caracteres.",
  organization_not_found: "La organización solicitada no está disponible.",
  organization_required:
    "Elige una organización antes de gestionar el equipo.",
  "password-mismatch": "Las contraseñas no coinciden.",
  "password-missing-letter": "La contraseña debe incluir al menos una letra.",
  "password-missing-number": "La contraseña debe incluir al menos un número.",
  "password-too-short": "La contraseña debe tener al menos 8 caracteres.",
  "person-profile-inactive": "La persona de esos datos no está activa.",
  "person-profile-internal":
    "Los perfiles internos no pueden vincularse como entrenadores operativos.",
  "person-user-conflict":
    "La persona de esos datos ya está vinculada a otra cuenta.",
  "profile-inactive": "Los datos operativos no están activos.",
  "profile-delete-blocked":
    "Estos datos tienen referencias protegidas y no se pueden borrar físicamente.",
  "profile-delete-operational-history":
    "Estos datos ya aparecen en horario, plantillas, solicitudes, documentos o fichaje. Al archivarlos se conserva el historial.",
  "profile-delete-requires-inactive":
    "Archiva los datos antes de eliminarlos físicamente.",
  "profile-required": "No se han recibido datos operativos válidos.",
  "profile-without-person":
    "Esos datos no conservan una persona operativa pendiente de cuenta.",
  "save-failed": "No se han podido guardar los cambios.",
  "self-membership":
    "No puedes cambiar tu propio acceso desde esta pantalla para evitar quedarte sin acceso.",
};

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

async function getMemberships(organizationId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organization_memberships")
    .select(
      "id, organization_id, user_id, role, status, invited_at, joined_at, created_at, updated_at",
    )
    .eq("organization_id", organizationId)
    .order("status", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Could not load memberships: ${error.message}`);
  }

  return data satisfies MembershipRow[];
}

async function getCoachProfiles(organizationId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("coach_profiles")
    .select(
      "id, organization_id, user_id, person_profile_id, primary_center_id, weekly_contracted_hours, status, notes, updated_at",
    )
    .eq("organization_id", organizationId)
    .order("status", { ascending: true })
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(`Could not load coach profiles: ${error.message}`);
  }

  return data satisfies CoachProfileRow[];
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

async function getPersonProfiles(organizationId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("person_profiles")
    .select("id, user_id, display_name, status, visibility_status")
    .eq("organization_id", organizationId)
    .order("display_name", { ascending: true });

  if (error) {
    throw new Error(`Could not load person profiles: ${error.message}`);
  }

  return data satisfies PersonProfileRow[];
}

async function getTeamInvitations(organizationId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("team_invitations")
    .select(
      "id, organization_id, email_normalized, person_profile_id, coach_profile_id, role, initial_access_status, status, sent_at, last_sent_at, expires_at, send_count, last_error, created_at",
    )
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Could not load team invitations: ${error.message}`);
  }

  return data satisfies TeamInvitationRow[];
}

function buildPersonProfileMaps(personProfiles: PersonProfileRow[]) {
  return {
    byId: new Map(personProfiles.map((profile) => [profile.id, profile])),
    byUserId: new Map(
      personProfiles.flatMap((profile) =>
        profile.user_id ? [[profile.user_id, profile] as const] : [],
      ),
    ),
  };
}

function formatDate(value: string | null, timezone: string) {
  if (!value) {
    return "Pendiente";
  }

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

function formatHours(value: number) {
  return `${new Intl.NumberFormat("es-ES", {
    maximumFractionDigits: 2,
  }).format(value)} h`;
}

function isVisiblePerson(
  profile?: PersonProfileRow,
): profile is PersonProfileRow {
  if (!profile) {
    return false;
  }

  return profile.status === "active" && profile.visibility_status === "visible";
}

function getMembershipIdentity(
  membership: MembershipRow,
  personProfilesByUserId: Map<string, PersonProfileRow>,
) {
  const personProfile = personProfilesByUserId.get(membership.user_id);

  if (isVisiblePerson(personProfile)) {
    return {
      detail: "Cuenta vinculada",
      label: personProfile.display_name,
    };
  }

  return {
    detail: "Revisar vinculación",
    label: "Acceso sin persona visible",
  };
}

function getMembershipLinkStatus(
  membership: MembershipRow,
  personProfilesByUserId: Map<string, PersonProfileRow>,
): CoachProfileLinkStatus {
  return isVisiblePerson(personProfilesByUserId.get(membership.user_id))
    ? "linked"
    : "incomplete";
}

function getCoachProfileIdentity(
  profile: CoachProfileRow,
  personProfiles: PersonProfileMaps,
) {
  const personProfile = profile.person_profile_id
    ? personProfiles.byId.get(profile.person_profile_id)
    : profile.user_id
      ? personProfiles.byUserId.get(profile.user_id)
      : undefined;

  if (isVisiblePerson(personProfile)) {
    return {
      detail: profile.user_id ? "Cuenta vinculada" : "Sin cuenta vinculada",
      label: personProfile.display_name,
    };
  }

  if (profile.user_id) {
    return {
      detail: "Revisar vinculación",
      label: "Ficha con cuenta sin persona visible",
    };
  }

  if (profile.person_profile_id) {
    return {
      detail: "Revisar vinculación",
      label: "Ficha sin persona visible",
    };
  }

  return {
    detail: "Revisar vinculación",
    label: "Ficha incompleta",
  };
}

function normalizeFilterText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function isCoachProfileLinkStatus(
  value: string | null | undefined,
): value is CoachProfileLinkStatus {
  return COACH_PROFILE_LINK_FILTERS.some((filter) => filter.value === value);
}

function getCoachProfileLinkStatus(
  profile: CoachProfileRow,
  personProfiles: PersonProfileMaps,
): CoachProfileLinkStatus {
  const personProfile = profile.person_profile_id
    ? personProfiles.byId.get(profile.person_profile_id)
    : profile.user_id
      ? personProfiles.byUserId.get(profile.user_id)
      : undefined;

  if (profile.user_id && isVisiblePerson(personProfile)) {
    return "linked";
  }

  if (
    !profile.user_id &&
    profile.person_profile_id &&
    isVisiblePerson(personProfile)
  ) {
    return "pending";
  }

  return "incomplete";
}

function getTeamLinkStatusLabel(status: CoachProfileLinkStatus) {
  return teamLinkStatusLabels[status];
}

function getCoachProfileRole(
  profile: CoachProfileRow,
  membershipsByUserId: Map<string, MembershipRow>,
) {
  return profile.user_id
    ? (membershipsByUserId.get(profile.user_id)?.role ?? null)
    : null;
}

function resolveCoachProfileFilters({
  centers,
  params,
}: {
  centers: CenterRow[];
  params: Awaited<CoachesPageProps["searchParams"]>;
}): CoachProfileFilters {
  const rawCenterId = getParam(params.center_id);
  const rawLinkStatus = getParam(params.link_status);
  const rawProfileStatus = getParam(params.profile_status);
  const hasProfileStatusParam = Object.prototype.hasOwnProperty.call(
    params,
    "profile_status",
  );
  const rawQuery = getParam(params.q) ?? "";
  const rawRole = getParam(params.role);
  const centerId: string | null =
    rawCenterId &&
    (rawCenterId === NO_CENTER_FILTER_VALUE ||
      centers.some((center) => center.id === rawCenterId))
      ? rawCenterId
      : null;
  const role: string | null =
    rawRole &&
    (rawRole === WITHOUT_ACCESS_ROLE_FILTER_VALUE ||
      isMembershipRole(rawRole))
      ? rawRole
      : null;

  return {
    centerId,
    linkStatus: isCoachProfileLinkStatus(rawLinkStatus) ? rawLinkStatus : null,
    profileStatus: hasProfileStatusParam
      ? rawProfileStatus && isCoachProfileStatus(rawProfileStatus)
        ? rawProfileStatus
        : null
      : "active",
    profileStatusIsDefault: !hasProfileStatusParam,
    query: rawQuery.trim().slice(0, 80),
    role,
  };
}

function getCoachProfileActiveFilterCount(filters: CoachProfileFilters) {
  return [
    filters.centerId,
    filters.linkStatus,
    filters.profileStatusIsDefault ? null : filters.profileStatus,
    filters.query,
    filters.role,
  ].filter(Boolean).length;
}

function pickPreferredCoachProfile(
  current: CoachProfileRow | undefined,
  candidate: CoachProfileRow,
) {
  if (!current) {
    return candidate;
  }

  if (current.status !== candidate.status) {
    return candidate.status === "active" ? candidate : current;
  }

  return candidate.updated_at > current.updated_at ? candidate : current;
}

function getCoachProfileResolvedUserId(
  profile: CoachProfileRow,
  personProfiles: PersonProfileMaps,
) {
  if (profile.user_id) {
    return profile.user_id;
  }

  return profile.person_profile_id
    ? (personProfiles.byId.get(profile.person_profile_id)?.user_id ?? null)
    : null;
}

function buildTeamUserRows({
  coachProfiles,
  memberships,
  membershipsByUserId,
  personProfiles,
}: {
  coachProfiles: CoachProfileRow[];
  memberships: MembershipRow[];
  membershipsByUserId: Map<string, MembershipRow>;
  personProfiles: PersonProfileMaps;
}) {
  const profilesByUserId = new Map<string, CoachProfileRow>();
  const profilesByPersonId = new Map<string, CoachProfileRow>();

  for (const profile of coachProfiles) {
    const userId = getCoachProfileResolvedUserId(profile, personProfiles);

    if (userId) {
      profilesByUserId.set(
        userId,
        pickPreferredCoachProfile(profilesByUserId.get(userId), profile),
      );
    }

    if (profile.person_profile_id) {
      profilesByPersonId.set(
        profile.person_profile_id,
        pickPreferredCoachProfile(
          profilesByPersonId.get(profile.person_profile_id),
          profile,
        ),
      );
    }
  }

  const usedProfileIds = new Set<string>();
  const rows: TeamUserRow[] = memberships.map((membership) => {
    const personProfile = personProfiles.byUserId.get(membership.user_id);
    const profile =
      profilesByUserId.get(membership.user_id) ??
      (personProfile ? profilesByPersonId.get(personProfile.id) : undefined) ??
      null;
    const identity = getMembershipIdentity(
      membership,
      personProfiles.byUserId,
    );

    if (profile) {
      usedProfileIds.add(profile.id);
    }

    return {
      detail: identity.detail,
      id: `membership:${membership.id}`,
      label: identity.label,
      linkStatus: getMembershipLinkStatus(membership, personProfiles.byUserId),
      membership,
      personProfile,
      profile,
      role: membership.role,
    } satisfies TeamUserRow;
  });

  for (const profile of coachProfiles) {
    if (usedProfileIds.has(profile.id)) {
      continue;
    }

    const identity = getCoachProfileIdentity(profile, personProfiles);
    const personProfile = profile.person_profile_id
      ? personProfiles.byId.get(profile.person_profile_id)
      : profile.user_id
        ? personProfiles.byUserId.get(profile.user_id)
        : undefined;

    rows.push({
      detail: identity.detail,
      id: `profile:${profile.id}`,
      label: identity.label,
      linkStatus: getCoachProfileLinkStatus(profile, personProfiles),
      membership: profile.user_id
        ? (membershipsByUserId.get(profile.user_id) ?? null)
        : null,
      personProfile,
      profile,
      role: getCoachProfileRole(profile, membershipsByUserId),
    });
  }

  return rows.sort((first, second) =>
    first.label.localeCompare(second.label, "es"),
  );
}

function getTeamUserStatusBucket(row: TeamUserRow) {
  if (row.membership) {
    return row.membership.status === "active" ? "active" : "inactive";
  }

  return row.profile?.status === "active" ? "active" : "inactive";
}

function getTeamUserOperationalStatusLabel(row: TeamUserRow) {
  if (!row.profile) {
    return "Sin datos operativos";
  }

  return row.profile.status === "active"
    ? "Datos operativos activos"
    : "Datos operativos archivados";
}

function applyTeamUserFilters({
  centersById,
  filters,
  rows,
}: {
  centersById: Map<string, CenterRow>;
  filters: CoachProfileFilters;
  rows: TeamUserRow[];
}) {
  const query = normalizeFilterText(filters.query);

  return rows.filter((row) => {
    const center = row.profile?.primary_center_id
      ? centersById.get(row.profile.primary_center_id)
      : undefined;
    const role = row.role;

    if (
      filters.centerId &&
      (filters.centerId === NO_CENTER_FILTER_VALUE
        ? row.profile?.primary_center_id
        : row.profile?.primary_center_id !== filters.centerId)
    ) {
      return false;
    }

    if (
      filters.profileStatus &&
      getTeamUserStatusBucket(row) !== filters.profileStatus
    ) {
      return false;
    }

    if (
      filters.role &&
      (filters.role === WITHOUT_ACCESS_ROLE_FILTER_VALUE
        ? role !== null
        : role !== filters.role)
    ) {
      return false;
    }

    if (filters.linkStatus && row.linkStatus !== filters.linkStatus) {
      return false;
    }

    if (!query) {
      return true;
    }

    const haystack = [
      center?.name,
      getMembershipStatusLabel(row.membership?.status ?? "inactive"),
      getTeamLinkStatusLabel(row.linkStatus),
      getTeamUserOperationalStatusLabel(row),
      row.detail,
      row.label,
      row.profile?.notes,
      role ? getMembershipRoleLabel(role) : "Sin cuenta vinculada",
    ]
      .filter((value): value is string => Boolean(value))
      .map(normalizeFilterText)
      .join(" ");

    return haystack.includes(query);
  });
}

function selectClassName(className = "") {
  return [
    "h-11 w-full min-w-0 truncate rounded-lg border border-input bg-transparent py-1 pl-3 pr-9 text-sm md:h-9",
    "outline-none transition-colors focus-visible:border-ring",
    "focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
    className,
  ]
    .filter(Boolean)
    .join(" ");
}

const compactActionFormClassName = "grid grid-cols-2 gap-x-4 gap-y-4";
const compactActionFieldClassName = "grid min-w-0 gap-2";
const wideActionFieldClassName = "col-span-2 grid min-w-0 gap-2";
const membershipAccessEditFormClassName =
  "grid gap-3 sm:grid-cols-[minmax(8.5rem,1fr)_minmax(8.5rem,1fr)]";

function MembershipRoleSelect({
  className,
  defaultValue,
}: {
  className?: string;
  defaultValue?: string;
}) {
  return (
    <select
      aria-label="Rol del acceso"
      className={selectClassName(className)}
      defaultValue={defaultValue ?? "coach"}
      name="role"
    >
      {MEMBERSHIP_ROLES.map((role) => (
        <option key={role} value={role}>
          {getMembershipRoleLabel(role)}
        </option>
      ))}
    </select>
  );
}

function MembershipStatusSelect({
  className,
  defaultValue,
}: {
  className?: string;
  defaultValue?: string;
}) {
  return (
    <select
      aria-label="Estado del acceso"
      className={selectClassName(className)}
      defaultValue={defaultValue ?? "active"}
      name="status"
    >
      {MEMBERSHIP_STATUSES.map((status) => (
        <option key={status} value={status}>
          {getMembershipStatusLabel(status)}
        </option>
      ))}
    </select>
  );
}

function InitialAccessStatusSelect({ defaultValue }: { defaultValue?: string }) {
  return (
    <select
      className={selectClassName()}
      defaultValue={defaultValue ?? "active"}
      name="initialAccessStatus"
    >
      <option value="active">Activo</option>
      <option value="inactive">Inactivo</option>
      <option value="suspended">Suspendido</option>
    </select>
  );
}

function CoachProfileStatusSelect({ defaultValue }: { defaultValue?: string }) {
  return (
    <select
      className={selectClassName()}
      defaultValue={defaultValue ?? "active"}
      name="status"
    >
      {COACH_PROFILE_STATUSES.map((status) => (
        <option key={status} value={status}>
          {getCoachProfileStatusLabel(status)}
        </option>
      ))}
    </select>
  );
}

function CenterSelect({
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
      name="primaryCenterId"
    >
      <option value="none">Sin centro principal</option>
      {centers.map((center) => (
        <option key={center.id} value={center.id}>
          {center.name}
          {center.status === "inactive" ? " (inactivo)" : ""}
        </option>
      ))}
    </select>
  );
}

function MembershipStatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant={
        status === "suspended"
          ? "destructive"
          : status === "active"
            ? "secondary"
            : "outline"
      }
    >
      {getMembershipStatusLabel(status)}
    </Badge>
  );
}

function TeamInvitationStatusBadge({ status }: { status: string }) {
  const labelByStatus: Record<string, string> = {
    accepted: "Aceptada",
    cancelled: "Cancelada",
    expired: "Caducada",
    failed: "Revisar invitación",
    pending: "Invitación pendiente",
    sent: "Invitación pendiente",
  };

  return (
    <Badge
      variant={
        status === "failed"
          ? "destructive"
          : status === "sent" || status === "accepted"
            ? "secondary"
            : "outline"
      }
    >
      {labelByStatus[status] ?? status}
    </Badge>
  );
}

function TeamLinkStatusBadge({ status }: { status: CoachProfileLinkStatus }) {
  const tone =
    status === "linked"
      ? "success"
      : status === "pending"
        ? "pending"
        : "warning";

  return <StatusBadge tone={tone}>{getTeamLinkStatusLabel(status)}</StatusBadge>;
}

function getTeamInitials(label: string) {
  const words = label
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean);

  if (words.length === 0) {
    return "U";
  }

  return words
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

function TeamAvatar({ label }: { label: string }) {
  return (
    <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary ring-1 ring-primary/15">
      {getTeamInitials(label)}
    </span>
  );
}

function TeamMetricPill({
  icon: Icon,
  label,
  tone = "neutral",
}: {
  icon?: LucideIcon;
  label: string;
  tone?: "neutral" | "success" | "warning";
}) {
  const toneClass =
    tone === "success"
      ? "bg-emerald-500"
      : tone === "warning"
        ? "bg-amber-500"
        : "bg-muted-foreground";
  const iconClass =
    tone === "success"
      ? "text-emerald-700"
      : tone === "warning"
        ? "text-amber-700"
        : "text-muted-foreground";

  return (
    <span className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-card px-3 text-sm font-medium ring-1 ring-foreground/10">
      {Icon ? (
        <Icon aria-hidden="true" className={`size-4 ${iconClass}`} />
      ) : (
        <span className={`size-2 rounded-full ${toneClass}`} />
      )}
      {label}
    </span>
  );
}

function isOpenTeamInvitation(invitation: TeamInvitationRow) {
  return OPEN_TEAM_INVITATION_STATUSES.includes(
    invitation.status as (typeof OPEN_TEAM_INVITATION_STATUSES)[number],
  );
}

function TeamLinkingReviewNotice({
  summary,
}: {
  summary: TeamLinkingReviewSummary;
}) {
  const items = [
    {
      count: summary.membershipsWithoutVisiblePerson,
      description: "accesos con cuenta, pero sin persona operativa visible",
      label: "Revisar cuenta",
    },
    {
      count: summary.profilesWithoutLinkedAccount,
      description: "datos operativos con persona visible y sin cuenta vinculada",
      label: "Datos sin cuenta",
    },
    {
      count: summary.incompleteCoachProfiles,
      description: "datos operativos que necesitan revisar persona, cuenta o estado",
      label: "Revisar datos",
    },
    {
      count: summary.openInvitations,
      description: "invitaciones abiertas hasta aceptar, reenviar o cancelar",
      label: "Invitación pendiente",
    },
  ].filter((item) => item.count > 0);

  if (items.length === 0) {
    return null;
  }

  return (
    <Card size="sm">
      <CardContent className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.6fr)] lg:items-start">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight">
            <AlertTriangle aria-hidden="true" className="size-4 text-amber-700" />
            Revisar datos de acceso
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Usa Equipo para revisar accesos, personas operativas, datos e
            invitaciones pendientes. Para altas nuevas puedes invitar por email
            o crear una cuenta con contraseña temporal.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {items.map((item) => (
            <div
              className="min-w-0 rounded-lg border border-border bg-muted/20 px-3 py-2"
              key={`${item.label}-${item.description}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-lg font-semibold tabular-nums">
                  {item.count}
                </span>
                <Badge variant="outline">{item.label}</Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {item.description}
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function TeamInvitationCreateForm({
  centers,
  organizationId,
  pendingProfiles,
  personProfiles,
}: {
  centers: CenterRow[];
  organizationId: string;
  pendingProfiles: CoachProfileRow[];
  personProfiles: PersonProfileMaps;
}) {
  return (
    <form action={createTeamInvitation} className={compactActionFormClassName}>
      <input name="organizationId" type="hidden" value={organizationId} />

      <label className={wideActionFieldClassName}>
        <span className="text-sm font-medium">Email</span>
        <Input
          autoComplete="email"
          name="email"
          placeholder="nuria@box.com"
          required
          type="email"
        />
      </label>

      <label className={compactActionFieldClassName}>
        <span className="text-sm font-medium">Rol</span>
        <MembershipRoleSelect />
      </label>

      <label className={compactActionFieldClassName}>
        <span className="text-sm font-medium">Estado inicial</span>
        <InitialAccessStatusSelect />
      </label>

      <label className={wideActionFieldClassName}>
        <span className="text-sm font-medium">Datos operativos asociados</span>
        <select className={selectClassName()} name="coachProfileId" required>
          <option value="new">Crear datos operativos</option>
          {pendingProfiles.map((profile) => {
            const identity = getCoachProfileIdentity(profile, personProfiles);

            return (
              <option key={profile.id} value={profile.id}>
                {identity.label} / {identity.detail}
              </option>
            );
          })}
        </select>
        <span className="text-xs leading-5 text-muted-foreground">
          Puedes usar datos pendientes de vincular cuenta o crearlos en el
          mismo envio.
        </span>
      </label>

      <label className={wideActionFieldClassName}>
        <span className="text-sm font-medium">Nombre visible</span>
        <Input
          name="displayName"
          placeholder="Solo necesario si creas datos nuevos"
        />
      </label>

      <label className={wideActionFieldClassName}>
        <span className="text-sm font-medium">Centro principal</span>
        <CenterSelect centers={centers} />
      </label>

      <label className={compactActionFieldClassName}>
        <span className="text-sm font-medium">Horas semanales</span>
        <Input
          defaultValue="0"
          min="0"
          max="168"
          name="weeklyContractedHours"
          step="0.25"
          type="number"
        />
      </label>

      <label className={compactActionFieldClassName}>
        <span className="text-sm font-medium">Notas internas</span>
        <Textarea maxLength={1000} name="notes" rows={3} />
      </label>

      <div className="col-span-2 flex items-end">
        <Button type="submit">
          <Mail aria-hidden="true" />
          Enviar invitación
        </Button>
      </div>
    </form>
  );
}

function DirectTeamAccountCreateForm({
  centers,
  organizationId,
}: {
  centers: CenterRow[];
  organizationId: string;
}) {
  return (
    <form action={createDirectTeamAccount} className={compactActionFormClassName}>
      <input name="organizationId" type="hidden" value={organizationId} />

      <label className={wideActionFieldClassName}>
        <span className="text-sm font-medium">Email</span>
        <Input
          autoComplete="email"
          name="email"
          placeholder="nuria@box.com"
          required
          type="email"
        />
      </label>

      <label className={compactActionFieldClassName}>
        <span className="text-sm font-medium">Contraseña temporal</span>
        <Input
          autoComplete="new-password"
          minLength={PASSWORD_MIN_LENGTH}
          name="password"
          pattern={PASSWORD_PATTERN_ATTRIBUTE}
          required
          title={PASSWORD_POLICY_DESCRIPTION}
          type="password"
        />
      </label>

      <label className={compactActionFieldClassName}>
        <span className="text-sm font-medium">Confirmar contraseña</span>
        <Input
          autoComplete="new-password"
          name="confirmPassword"
          required
          type="password"
        />
      </label>

      <p className="col-span-2 text-xs leading-5 text-muted-foreground">
        BoxOps no guarda esta contraseña. La cuenta quedará obligada a cambiarla
        en el primer inicio de sesión.
      </p>

      <label className={compactActionFieldClassName}>
        <span className="text-sm font-medium">Rol</span>
        <MembershipRoleSelect />
      </label>

      <label className={compactActionFieldClassName}>
        <span className="text-sm font-medium">Estado inicial</span>
        <InitialAccessStatusSelect />
      </label>

      <label className={wideActionFieldClassName}>
        <span className="text-sm font-medium">Nombre visible</span>
        <Input
          maxLength={80}
          name="displayName"
          placeholder="Nombre que verá el equipo"
          required
        />
      </label>

      <label className={wideActionFieldClassName}>
        <span className="text-sm font-medium">Centro principal</span>
        <CenterSelect centers={centers} />
      </label>

      <label className={compactActionFieldClassName}>
        <span className="text-sm font-medium">Horas semanales</span>
        <Input
          defaultValue="0"
          max="168"
          min="0"
          name="weeklyContractedHours"
          step="0.25"
          type="number"
        />
      </label>

      <label className={compactActionFieldClassName}>
        <span className="text-sm font-medium">Notas internas</span>
        <Textarea maxLength={1000} name="notes" rows={3} />
      </label>

      <div className="col-span-2 flex items-end">
        <Button type="submit">
          <KeyRound aria-hidden="true" />
          Crear cuenta
        </Button>
      </div>
    </form>
  );
}

function TeamInvitationsSection({
  invitations,
  organizationId,
  personProfiles,
  timezone,
}: {
  invitations: TeamInvitationRow[];
  organizationId: string;
  personProfiles: PersonProfileMaps;
  timezone: string;
}) {
  const openInvitations = invitations.filter(isOpenTeamInvitation);

  return (
    <section className="space-y-3">
      <SectionHeader
        action={<Badge variant="outline">{openInvitations.length} abiertas</Badge>}
        description="Invitaciones por email pendientes de aceptar o revisar."
        title="Invitaciones"
      />

      <Card size="sm">
        <CardContent>
          {openInvitations.length === 0 ? (
            <div className="flex min-h-40 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 px-4 py-8 text-center">
              <span className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/15">
                <Mail aria-hidden="true" className="size-6" />
              </span>
              <h3 className="mt-4 text-base font-semibold tracking-tight">
                No hay invitaciones pendientes
              </h3>
              <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">
                Cuando envíes una invitación, aparecerá aquí hasta que se acepte
                o se cancele.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {openInvitations.map((invitation) => {
                const personProfile = personProfiles.byId.get(
                  invitation.person_profile_id,
                );

                return (
                  <div className="space-y-4 py-4 first:pt-0 last:pb-0" key={invitation.id}>
                    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)_auto] lg:items-start">
                      <div className="min-w-0">
                        <h3 className="truncate text-base font-semibold tracking-tight">
                          {personProfile?.display_name ?? "Ficha pendiente"}
                        </h3>
                        <p className="mt-1 truncate text-sm text-muted-foreground">
                          {invitation.email_normalized}
                        </p>
                      </div>
                      <MetaGrid className="lg:grid-cols-3">
                        <MetaItem label="Rol">
                          {getMembershipRoleLabel(invitation.role)}
                        </MetaItem>
                        <MetaItem label="Último envío">
                          {formatDate(
                            invitation.last_sent_at ?? invitation.sent_at,
                            timezone,
                          )}
                        </MetaItem>
                        <MetaItem label="Caduca">
                          {formatDate(invitation.expires_at, timezone)}
                        </MetaItem>
                      </MetaGrid>
                      <div className="flex justify-start lg:justify-end">
                        <TeamInvitationStatusBadge status={invitation.status} />
                      </div>
                    </div>

                    {invitation.last_error ? (
                      <p className="rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                        {invitation.last_error}
                      </p>
                    ) : null}

                    <div className="flex flex-wrap gap-2">
                      <form action={resendTeamInvitation}>
                        <input
                          name="organizationId"
                          type="hidden"
                          value={organizationId}
                        />
                        <input
                          name="invitationId"
                          type="hidden"
                          value={invitation.id}
                        />
                        <Button size="sm" type="submit" variant="outline">
                          <RotateCcw aria-hidden="true" />
                          Reenviar
                        </Button>
                      </form>

                      <form action={cancelTeamInvitation}>
                        <input
                          name="organizationId"
                          type="hidden"
                          value={organizationId}
                        />
                        <input
                          name="invitationId"
                          type="hidden"
                          value={invitation.id}
                        />
                        <Button size="sm" type="submit" variant="outline">
                          <XCircle aria-hidden="true" />
                          Cancelar
                        </Button>
                      </form>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function TeamOperationalStatusBadge({ row }: { row: TeamUserRow }) {
  if (!row.profile) {
    return <StatusBadge tone="neutral">Sin datos operativos</StatusBadge>;
  }

  return (
    <StatusBadge tone={row.profile.status === "active" ? "success" : "neutral"}>
      {row.profile.status === "active" ? "Operativo" : "Archivado"}
    </StatusBadge>
  );
}

function TeamUserCard({
  canDeleteProfiles,
  canManageAccess,
  canManageProfiles,
  centers,
  currentUserId,
  organizationId,
  row,
  timezone,
}: {
  canDeleteProfiles: boolean;
  canManageAccess: boolean;
  canManageProfiles: boolean;
  centers: CenterRow[];
  currentUserId: string;
  organizationId: string;
  row: TeamUserRow;
  timezone: string;
}) {
  const profile = row.profile;
  const membership = row.membership;
  const primaryCenter = centers.find(
    (center) => center.id === profile?.primary_center_id,
  );
  const isSelf = membership?.user_id === currentUserId;
  const canEditAccess =
    canManageAccess &&
    Boolean(membership) &&
    !isSelf &&
    Boolean(membership && isMembershipRole(membership.role));
  const canEditOperationalData = canManageProfiles && Boolean(profile);
  const canCreateOperationalData =
    canManageAccess &&
    Boolean(membership) &&
    !profile &&
    isVisiblePerson(row.personProfile);
  const canShowManagement =
    canEditAccess ||
    canEditOperationalData ||
    canCreateOperationalData ||
    (canDeleteProfiles && Boolean(profile));
  const hasLinkedAccount = Boolean(
    membership || profile?.user_id || row.personProfile?.user_id,
  );

  return (
    <Card
      className="transition-[background-color,box-shadow] hover:bg-background hover:shadow-sm"
      size="sm"
    >
      <CardContent className="space-y-4">
        <div className="grid gap-4 xl:grid-cols-[minmax(16rem,1.35fr)_minmax(0,2fr)_auto] xl:items-center">
          <div className="flex min-w-0 items-center gap-3">
            <TeamAvatar label={row.label} />
            <div className="min-w-0">
              <h3 className="truncate text-base font-semibold tracking-tight">
                {row.label}
                {isSelf ? (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    tu usuario
                  </span>
                ) : null}
              </h3>
              <p className="mt-1 truncate text-sm text-muted-foreground">
                {row.detail}
              </p>
            </div>
          </div>
          <MetaGrid className="lg:grid-cols-4">
            <MetaItem label="Rol">
              {row.role ? getMembershipRoleLabel(row.role) : "Sin acceso"}
            </MetaItem>
            <MetaItem label="Centro principal">
              {profile
                ? (primaryCenter?.name ?? "Sin centro principal")
                : "Sin datos operativos"}
            </MetaItem>
            <MetaItem label="Horas semanales">
              {profile
                ? formatHours(profile.weekly_contracted_hours)
                : "Sin horas"}
            </MetaItem>
            <MetaItem label={membership ? "Entrada" : "Actualizado"}>
              {formatDate(
                membership
                  ? (membership.joined_at ?? membership.invited_at)
                  : (profile?.updated_at ?? null),
                timezone,
              )}
            </MetaItem>
          </MetaGrid>
          <div className="flex flex-wrap justify-start gap-2 lg:justify-end">
            {membership ? (
              <MembershipStatusBadge status={membership.status} />
            ) : null}
            <TeamLinkStatusBadge status={row.linkStatus} />
            <TeamOperationalStatusBadge row={row} />
          </div>
        </div>

        {canShowManagement ? (
          <InlineEditDetails label="Gestionar usuario">
            <div className="grid gap-4">
              {isSelf && canManageAccess ? (
                <p className="text-sm text-muted-foreground">
                  Tu propio acceso está protegido.
                </p>
              ) : null}

              {canEditAccess && membership ? (
                <div className="grid gap-2">
                  <h4 className="text-sm font-semibold">Acceso y permisos</h4>
                  <form
                    action={updateMembership}
                    className={membershipAccessEditFormClassName}
                  >
                    <input
                      name="organizationId"
                      type="hidden"
                      value={organizationId}
                    />
                    <input
                      name="membershipId"
                      type="hidden"
                      value={membership.id}
                    />
                    <input
                      name="userId"
                      type="hidden"
                      value={membership.user_id}
                    />
                    <MembershipRoleSelect defaultValue={membership.role} />
                    <MembershipStatusSelect defaultValue={membership.status} />
                    <Button
                      className="w-full sm:col-span-2 sm:w-fit"
                      type="submit"
                    >
                      <Save aria-hidden="true" />
                      Guardar acceso
                    </Button>
                  </form>
                </div>
              ) : null}

              {canEditOperationalData && profile ? (
                <div className="grid gap-2 border-t border-border pt-4 first:border-t-0 first:pt-0">
                  <h4 className="text-sm font-semibold">Datos operativos</h4>
                  <form
                    action={updateCoachProfile}
                    className="grid gap-4 lg:grid-cols-4"
                  >
                    <input
                      name="organizationId"
                      type="hidden"
                      value={organizationId}
                    />
                    <input
                      name="coachProfileId"
                      type="hidden"
                      value={profile.id}
                    />

                    <label className="grid gap-2 lg:col-span-2">
                      <span className="text-sm font-medium">
                        Centro principal
                      </span>
                      <CenterSelect
                        centers={centers}
                        defaultValue={profile.primary_center_id}
                      />
                    </label>

                    <label className="grid gap-2">
                      <span className="text-sm font-medium">
                        Horas semanales
                      </span>
                      <Input
                        defaultValue={profile.weekly_contracted_hours}
                        min="0"
                        max="168"
                        name="weeklyContractedHours"
                        step="0.25"
                        type="number"
                      />
                    </label>

                    {canManageAccess ? (
                      <>
                        <label className="grid gap-2">
                          <span className="text-sm font-medium">
                            Estado operativo
                          </span>
                          <CoachProfileStatusSelect
                            defaultValue={profile.status}
                          />
                        </label>

                        <label className="grid gap-2 lg:col-span-4">
                          <span className="text-sm font-medium">
                            Notas internas
                          </span>
                          <Textarea
                            defaultValue={profile.notes ?? ""}
                            maxLength={1000}
                            name="notes"
                          />
                        </label>
                      </>
                    ) : (
                      <>
                        <input name="status" type="hidden" value={profile.status} />
                        <input
                          name="notes"
                          type="hidden"
                          value={profile.notes ?? ""}
                        />
                      </>
                    )}

                    <div className="flex flex-wrap gap-2 lg:col-span-4">
                      <Button type="submit">
                        <Save aria-hidden="true" />
                        Guardar datos
                      </Button>
                    </div>
                  </form>
                </div>
              ) : null}

              {canCreateOperationalData && membership ? (
                <div className="grid gap-2 border-t border-border pt-4 first:border-t-0 first:pt-0">
                  <h4 className="text-sm font-semibold">Datos operativos</h4>
                  <form
                    action={createCoachProfile}
                    className="grid gap-4 lg:grid-cols-4"
                  >
                    <input
                      name="organizationId"
                      type="hidden"
                      value={organizationId}
                    />
                    <input
                      name="userId"
                      type="hidden"
                      value={membership.user_id}
                    />
                    <input
                      name="displayName"
                      type="hidden"
                      value={row.personProfile?.display_name ?? row.label}
                    />
                    <input name="status" type="hidden" value="active" />
                    <input name="notes" type="hidden" value="" />

                    <label className="grid gap-2 lg:col-span-2">
                      <span className="text-sm font-medium">
                        Centro principal
                      </span>
                      <CenterSelect centers={centers} />
                    </label>

                    <label className="grid gap-2">
                      <span className="text-sm font-medium">
                        Horas semanales
                      </span>
                      <Input
                        defaultValue={0}
                        min="0"
                        max="168"
                        name="weeklyContractedHours"
                        step="0.25"
                        type="number"
                      />
                    </label>

                    <div className="flex flex-wrap gap-2 lg:col-span-4">
                      <Button type="submit">
                        <Save aria-hidden="true" />
                        Activar datos
                      </Button>
                    </div>
                  </form>
                </div>
              ) : null}

              {canDeleteProfiles && profile ? (
                <form
                  action={deleteCoachProfile}
                  className="flex flex-wrap items-center gap-2 border-t border-border pt-4"
                >
                  <input
                    name="organizationId"
                    type="hidden"
                    value={organizationId}
                  />
                  <input
                    name="coachProfileId"
                    type="hidden"
                    value={profile.id}
                  />
                  <Button type="submit" variant="destructive">
                    <Trash2 aria-hidden="true" />
                    {hasLinkedAccount
                      ? "Archivar datos operativos"
                      : "Eliminar datos operativos"}
                  </Button>
                </form>
              ) : null}
            </div>
          </InlineEditDetails>
        ) : null}
      </CardContent>
    </Card>
  );
}

function TeamUserFiltersCard({
  activeFilterCount,
  centers,
  filteredCount,
  filters,
  organizationId,
  totalCount,
}: {
  activeFilterCount: number;
  centers: CenterRow[];
  filteredCount: number;
  filters: CoachProfileFilters;
  organizationId: string;
  totalCount: number;
}) {
  return (
    <Card className="shadow-sm" size="sm">
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 md:hidden">
          <p className="text-sm text-muted-foreground">
            {filteredCount} de {totalCount} usuarios visibles.
          </p>
          {activeFilterCount > 0 ? (
            <Badge variant="secondary">
              {activeFilterCount} filtro
              {activeFilterCount === 1 ? "" : "s"}
            </Badge>
          ) : null}
        </div>

        <form
          className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(15rem,2fr)_repeat(4,minmax(8rem,1fr))_auto]"
          method="get"
        >
          <input name="organizationId" type="hidden" value={organizationId} />

          <label className="grid min-w-0 gap-2 md:col-span-2 xl:col-span-1">
            <span className="text-sm font-medium">Buscar</span>
            <span className="relative">
              <Input
                className="pr-9"
                defaultValue={filters.query}
                name="q"
                placeholder="Nombre, rol, centro o notas"
                type="search"
              />
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              />
            </span>
          </label>

          <label className="grid min-w-0 gap-2">
            <span className="text-sm font-medium">Centro</span>
            <select
              className={selectClassName()}
              defaultValue={filters.centerId ?? ""}
              name="center_id"
            >
              <option value="">Todos los centros</option>
              <option value={NO_CENTER_FILTER_VALUE}>Sin centro principal</option>
              {centers.map((center) => (
                <option key={center.id} value={center.id}>
                  {center.name}
                  {center.status === "inactive" ? " (inactivo)" : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="grid min-w-0 gap-2">
            <span className="text-sm font-medium">Rol</span>
            <select
              className={selectClassName()}
              defaultValue={filters.role ?? ""}
              name="role"
            >
              <option value="">Todos los roles</option>
              {MEMBERSHIP_ROLES.map((role) => (
                <option key={role} value={role}>
                  {getMembershipRoleLabel(role)}
                </option>
              ))}
              <option value={WITHOUT_ACCESS_ROLE_FILTER_VALUE}>
                Sin acceso vinculado
              </option>
            </select>
          </label>

          <label className="grid min-w-0 gap-2">
            <span className="text-sm font-medium">Estado</span>
            <select
              className={selectClassName()}
              defaultValue={filters.profileStatus ?? ""}
              name="profile_status"
            >
              <option value="">Todos</option>
              <option value="active">Activos</option>
              <option value="inactive">Archivados</option>
            </select>
          </label>

          <label className="grid min-w-0 gap-2">
            <span className="text-sm font-medium">Cuenta</span>
            <select
              className={selectClassName()}
              defaultValue={filters.linkStatus ?? ""}
              name="link_status"
            >
              <option value="">Todas</option>
              {COACH_PROFILE_LINK_FILTERS.map((filter) => (
                <option key={filter.value} value={filter.value}>
                  {filter.label}
                </option>
              ))}
            </select>
          </label>

          <div className="grid gap-2 md:grid-cols-2 md:items-end xl:min-w-48 xl:self-end">
            <Button className="min-h-11 md:min-h-9" type="submit">
              <Filter aria-hidden="true" />
              Aplicar
            </Button>
            <Button asChild className="min-h-11 md:min-h-9" variant="outline">
              <Link href={getCoachesPath({ organizationId })}>
                <RotateCcw aria-hidden="true" />
                Limpiar
              </Link>
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function TeamUsersSection({
  activeFilterCount,
  canDeleteProfiles,
  canManageAccess,
  canManageProfiles,
  centers,
  currentUserId,
  filters,
  organizationId,
  rows,
  timezone,
  totalRows,
}: {
  activeFilterCount: number;
  canDeleteProfiles: boolean;
  canManageAccess: boolean;
  canManageProfiles: boolean;
  centers: CenterRow[];
  currentUserId: string;
  filters: CoachProfileFilters;
  organizationId: string;
  rows: TeamUserRow[];
  timezone: string;
  totalRows: number;
}) {
  const hasActiveFilters = activeFilterCount > 0;
  const showingArchived = filters.profileStatus === "inactive";
  const usersBadgeLabel =
    rows.length === totalRows
      ? `${totalRows} usuarios`
      : `${rows.length} de ${totalRows} usuarios`;
  const operationalRowsCount = rows.filter(
    (row) => row.profile?.status === "active",
  ).length;
  const missingOperationalRowsCount = rows.filter((row) => !row.profile).length;

  return (
    <section className="space-y-3">
      <SectionHeader
        action={
          <div className="hidden flex-wrap gap-2 md:flex">
            <TeamMetricPill icon={UsersRound} label={usersBadgeLabel} />
            <TeamMetricPill
              icon={CheckCircle2}
              label={`${operationalRowsCount} operativos`}
              tone="success"
            />
            <TeamMetricPill
              icon={AlertTriangle}
              label={`${missingOperationalRowsCount} sin datos operativos`}
              tone="warning"
            />
          </div>
        }
        description={
          showingArchived
            ? "Usuarios o datos operativos conservados por historial."
            : "Acceso, rol, centro principal y horas semanales en un solo sitio."
        }
        title={showingArchived ? "Usuarios archivados" : "Usuarios del equipo"}
      />

      <TeamUserFiltersCard
        activeFilterCount={activeFilterCount}
        centers={centers}
        filteredCount={rows.length}
        filters={filters}
        organizationId={organizationId}
        totalCount={totalRows}
      />

      {rows.length === 0 ? (
        <EmptyState
          action={
            hasActiveFilters ? (
              <Button asChild variant="outline">
                <Link href={getCoachesPath({ organizationId })}>
                  <RotateCcw aria-hidden="true" />
                  Limpiar filtros
                </Link>
              </Button>
            ) : null
          }
          description={
            hasActiveFilters
              ? "Prueba con otro nombre, centro, rol, estado o cuenta."
              : canManageAccess || canManageProfiles
                ? showingArchived
                  ? "Los usuarios archivados aparecerán aquí cuando existan."
                  : "Invita o crea usuarios para empezar a gestionar el equipo."
                : showingArchived
                  ? "No hay usuarios archivados visibles para esta organización."
                  : "Todavía no hay usuarios visibles para esta organización."
          }
          title={
            hasActiveFilters
              ? "No hay usuarios con estos filtros"
              : showingArchived
                ? "No hay usuarios archivados"
                : "No hay usuarios todavia"
          }
        />
      ) : (
        <div className="grid gap-2">
          <div className="hidden rounded-xl bg-card px-4 py-3 text-xs font-medium text-muted-foreground ring-1 ring-foreground/10 xl:grid xl:grid-cols-[minmax(16rem,1.35fr)_minmax(0,2fr)_auto] xl:items-center">
            <span>Usuario</span>
            <div className="grid grid-cols-4 gap-3">
              <span>Rol</span>
              <span>Centro principal</span>
              <span>Horas semanales</span>
              <span>Entrada</span>
            </div>
            <span className="text-right">Estado y acciones</span>
          </div>
          {rows.map((row) => (
            <TeamUserCard
              canDeleteProfiles={canDeleteProfiles}
              canManageAccess={canManageAccess}
              canManageProfiles={canManageProfiles}
              centers={centers}
              currentUserId={currentUserId}
              key={row.id}
              organizationId={organizationId}
              row={row}
              timezone={timezone}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export default async function CoachesPage({ searchParams }: CoachesPageProps) {
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect(getLoginPath("/app/coaches"));
  }

  const params = await searchParams;
  const organizationId = getParam(params.organizationId);
  const status = getParam(params.status);
  const error = getParam(params.error);
  const memberships = await getActiveMemberships(user.id);
  const resolution = resolveActiveOrganization(memberships, organizationId);

  if (!resolution.ok) {
    return (
      <div className="space-y-6">
        <PageHeader
          badge="Equipo"
          description="Gestiona usuarios y datos operativos del equipo."
          title="Equipo"
        />
        <OrganizationResolutionState
          basePath="/app/coaches"
          resolution={resolution}
        />
      </div>
    );
  }

  const [
    tenantMemberships,
    coachProfiles,
    centers,
    personProfileRows,
    teamInvitations,
  ] = await Promise.all([
    getMemberships(resolution.organization.id),
    getCoachProfiles(resolution.organization.id),
    getCenters(resolution.organization.id),
    getPersonProfiles(resolution.organization.id),
    getTeamInvitations(resolution.organization.id),
  ]);
  const personProfiles = buildPersonProfileMaps(personProfileRows);
  const canManageAccess = canManageTeamAccess(resolution.membership.role);
  const canManageProfiles = canManageOperationalTeamProfiles(
    resolution.membership.role,
  );
  const canDeleteProfiles = canDeleteOperationalTeamProfiles(
    resolution.membership.role,
  );
  const roleLabel = getApplicationRoleLabel(resolution.membership.role);
  const membershipsWithoutVisiblePerson = tenantMemberships.filter(
    (membership) =>
      isMembershipRole(membership.role) &&
      getMembershipLinkStatus(membership, personProfiles.byUserId) ===
        "incomplete",
  );
  const pendingLinkProfiles = coachProfiles.filter((profile) => {
    if (
      profile.status !== "active" ||
      !profile.person_profile_id ||
      profile.user_id
    ) {
      return false;
    }

    return isVisiblePerson(personProfiles.byId.get(profile.person_profile_id));
  });
  const incompleteCoachProfiles = coachProfiles.filter(
    (profile) =>
      profile.status === "active" &&
      getCoachProfileLinkStatus(profile, personProfiles) === "incomplete",
  );
  const teamLinkingReviewSummary: TeamLinkingReviewSummary = {
    incompleteCoachProfiles: incompleteCoachProfiles.length,
    membershipsWithoutVisiblePerson: membershipsWithoutVisiblePerson.length,
      openInvitations: teamInvitations.filter(isOpenTeamInvitation).length,
    profilesWithoutLinkedAccount: pendingLinkProfiles.length,
  };
  const centersById = new Map(centers.map((center) => [center.id, center]));
  const membershipsByUserId = new Map(
    tenantMemberships.map((membership) => [membership.user_id, membership]),
  );
  const coachProfileFilters = resolveCoachProfileFilters({
    centers,
    params,
  });
  const teamUserRows = buildTeamUserRows({
    coachProfiles,
    memberships: tenantMemberships,
    membershipsByUserId,
    personProfiles,
  });
  const filteredTeamUserRows = applyTeamUserFilters({
    centersById,
    filters: coachProfileFilters,
    rows: teamUserRows,
  });
  const coachProfileActiveFilterCount =
    getCoachProfileActiveFilterCount(coachProfileFilters);
  const teamPageDescription = canManageAccess
    ? "Invita, crea cuentas y gestiona usuarios sin separar acceso y datos operativos."
    : canManageProfiles
      ? "Consulta el equipo y ajusta centro principal y horas semanales."
      : "Consulta quien forma parte del equipo y su contexto operativo.";

  return (
    <div className="space-y-6">
      <PageHeader
        badge="Equipo"
        description={teamPageDescription}
        meta={
          <>
            <Badge variant="secondary">{resolution.organization.name}</Badge>
            <Badge variant="outline">{roleLabel}</Badge>
          </>
        }
        title="Equipo"
      />

      {status && successMessages[status] ? (
        <TransientFeedbackBanner
          description="La lista ya muestra los usuarios actualizados."
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

      {canManageAccess ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <CollapsibleActionPanel
            actionLabel="Invitar"
            description="Crea o reutiliza datos operativos y envía un enlace de acceso por email."
            featured
            icon={Mail}
            title="Invitar usuario"
          >
            <TeamInvitationCreateForm
              centers={centers}
              organizationId={resolution.organization.id}
              pendingProfiles={pendingLinkProfiles}
              personProfiles={personProfiles}
            />
          </CollapsibleActionPanel>

          <CollapsibleActionPanel
            actionLabel="Crear"
            description="Crea usuario, datos operativos y contraseña temporal sin enviar invitación."
            featured
            icon={UserPlus}
            title="Crear cuenta"
          >
            <DirectTeamAccountCreateForm
              centers={centers}
              organizationId={resolution.organization.id}
            />
          </CollapsibleActionPanel>
        </div>
      ) : null}

      {canManageAccess ? (
        <TeamLinkingReviewNotice summary={teamLinkingReviewSummary} />
      ) : null}

      {canManageProfiles && !canManageAccess ? (
        <Alert>
          <AlertTitle>Accesos protegidos</AlertTitle>
          <AlertDescription>
            Tu rol puede ajustar centro y horas semanales, pero Propietario y
            Administrador mantienen altas, roles y permisos.
          </AlertDescription>
        </Alert>
      ) : null}

      {canManageAccess ? (
        <TeamInvitationsSection
          invitations={teamInvitations}
          organizationId={resolution.organization.id}
          personProfiles={personProfiles}
          timezone={resolution.organization.timezone}
        />
      ) : null}

      <TeamUsersSection
        activeFilterCount={coachProfileActiveFilterCount}
        canDeleteProfiles={canDeleteProfiles}
        canManageAccess={canManageAccess}
        canManageProfiles={canManageProfiles}
        centers={centers}
        currentUserId={user.id}
        filters={coachProfileFilters}
        organizationId={resolution.organization.id}
        rows={filteredTeamUserRows}
        timezone={resolution.organization.timezone}
        totalRows={teamUserRows.length}
      />
    </div>
  );
}
