import Link from "next/link";
import { redirect } from "next/navigation";
import {
  BadgeCheck,
  CircleOff,
  Filter,
  Link2,
  Mail,
  Plus,
  RotateCcw,
  Save,
  UserPlus,
  XCircle,
} from "lucide-react";

import {
  cancelTeamInvitation,
  createCoachProfile,
  createMembership,
  createTeamInvitation,
  linkCoachProfileToExistingAccount,
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
} from "@/components/features/operations-ui";
import { OrganizationResolutionState } from "@/components/features/organization-resolution-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { getLoginPath } from "@/lib/auth/redirects";
import {
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

type CoachProfileFilters = {
  centerId: string | null;
  linkStatus: CoachProfileLinkStatus | null;
  profileStatus: string | null;
  query: string;
  role: string | null;
};

const NO_CENTER_FILTER_VALUE = "__no_center";
const WITHOUT_ACCESS_ROLE_FILTER_VALUE = "__without_access";
const COACH_PROFILE_LINK_FILTERS: Array<{
  label: string;
  value: CoachProfileLinkStatus;
}> = [
  { label: "Cuenta vinculada", value: "linked" },
  { label: "Pendiente de cuenta", value: "pending" },
  { label: "Ficha incompleta", value: "incomplete" },
];

const successMessages: Record<string, string> = {
  "account-linked": "Cuenta vinculada.",
  "invitation-cancelled": "Invitacion cancelada.",
  "invitation-resent": "Invitacion reenviada.",
  "invitation-sent": "Invitacion enviada.",
  "membership-created": "Acceso creado.",
  "membership-updated": "Acceso actualizado.",
  "profile-created": "Ficha de entrenador creada.",
  "profile-updated": "Ficha de entrenador actualizada.",
};

const errorMessages: Record<string, string> = {
  "account-link-conflict":
    "Esa cuenta ya está vinculada a otra persona o ficha del equipo.",
  "account-linked-to-other-coach":
    "Esa cuenta ya está vinculada a otra ficha de entrenador de esta organización.",
  "account-linked-to-other-person":
    "Esa cuenta ya está vinculada a otra persona de esta organización.",
  "auth-user-not-found":
    "Esa cuenta no existe en Supabase Auth. Crea o confirma primero la cuenta real.",
  "coach-user-conflict":
    "La ficha de entrenador ya está vinculada a otra cuenta.",
  "duplicate-membership":
    "Esa persona ya tiene acceso en esta organización.",
  "duplicate-invitation":
    "Ya existe una invitacion pendiente para ese email o esa ficha.",
  "duplicate-profile":
    "Ese entrenador ya tiene una ficha operativa en esta organización.",
  "email-not-configured":
    "El proveedor de email no esta configurado. Revisa RESEND_API_KEY y BOXOPS_EMAIL_FROM.",
  "email-send-failed":
    "No se ha podido enviar el email. Revisa Resend, el remitente y la configuracion SMTP/API.",
  forbidden: "Tu rol no permite gestionar usuarios ni perfiles.",
  "invalid-center": "El centro principal seleccionado no es válido.",
  "invalid-email": "Introduce un email valido para enviar la invitacion.",
  "invalid-hours": "Las horas semanales deben estar entre 0 y 168.",
  "invalid-invitation-id": "La invitacion recibida no es valida.",
  "invalid-person-profile":
    "La persona vinculada a esa ficha no pertenece a esta organización.",
  "invalid-profile-id": "La ficha de entrenador recibida no es válida.",
  "invalid-profile-reference":
    "La ficha no se ha podido guardar porque falta un acceso o centro válido.",
  "invalid-role":
    "El rol debe ser Propietario, Administrador, Responsable o Entrenador.",
  "invalid-status": "El estado seleccionado no es válido.",
  "invalid-user-id": "La cuenta del entrenador debe usar un UUID válido.",
  "membership-required": "No se ha encontrado el acceso de esta organización.",
  "invitation-closed": "Esa invitacion ya esta cerrada.",
  "invitation-rate-limited": "Espera un minuto antes de reenviar la invitacion.",
  "invitation-required": "No se ha encontrado una invitacion valida.",
  "missing-fields": "Completa los campos obligatorios.",
  no_active_memberships: "No hay accesos activos para este usuario.",
  "notes-too-long": "Las notas no pueden superar 1000 caracteres.",
  organization_not_found: "La organización solicitada no está disponible.",
  organization_required:
    "Elige una organización antes de gestionar el equipo.",
  "person-profile-inactive": "La persona de esa ficha no está activa.",
  "person-profile-internal":
    "Los perfiles internos no pueden vincularse como entrenadores operativos.",
  "person-user-conflict":
    "La persona de esa ficha ya está vinculada a otra cuenta.",
  "profile-inactive": "La ficha de entrenador no está activa.",
  "profile-required": "No se ha recibido una ficha de entrenador válida.",
  "profile-without-person":
    "Esa ficha no conserva una persona operativa pendiente de cuenta.",
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

function shortId(value: string) {
  return value.slice(0, 8);
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
    detail: `Cuenta MVP ${shortId(membership.user_id)}`,
    label: `Miembro ${shortId(membership.user_id)}`,
  };
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
      detail: profile.user_id ? "Cuenta vinculada" : "Pendiente de cuenta",
      label: personProfile.display_name,
    };
  }

  if (profile.user_id) {
    return {
      detail: `Cuenta MVP ${shortId(profile.user_id)}`,
      label: `Entrenador ${shortId(profile.user_id)}`,
    };
  }

  if (profile.person_profile_id) {
    return {
      detail: `Persona pendiente ${shortId(profile.person_profile_id)}`,
      label: "Entrenador pendiente",
    };
  }

  return {
    detail: "Sin usuario ni persona vinculada",
    label: "Entrenador pendiente",
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
): CoachProfileLinkStatus {
  if (profile.user_id) {
    return "linked";
  }

  if (profile.person_profile_id) {
    return "pending";
  }

  return "incomplete";
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
    profileStatus:
      rawProfileStatus && isCoachProfileStatus(rawProfileStatus)
        ? rawProfileStatus
        : null,
    query: rawQuery.trim().slice(0, 80),
    role,
  };
}

function getCoachProfileActiveFilterCount(filters: CoachProfileFilters) {
  return [
    filters.centerId,
    filters.linkStatus,
    filters.profileStatus,
    filters.query,
    filters.role,
  ].filter(Boolean).length;
}

function applyCoachProfileFilters({
  centersById,
  filters,
  membershipsByUserId,
  personProfiles,
  profiles,
}: {
  centersById: Map<string, CenterRow>;
  filters: CoachProfileFilters;
  membershipsByUserId: Map<string, MembershipRow>;
  personProfiles: PersonProfileMaps;
  profiles: CoachProfileRow[];
}) {
  const query = normalizeFilterText(filters.query);

  return profiles.filter((profile) => {
    const center = profile.primary_center_id
      ? centersById.get(profile.primary_center_id)
      : undefined;
    const identity = getCoachProfileIdentity(profile, personProfiles);
    const role = getCoachProfileRole(profile, membershipsByUserId);

    if (
      filters.centerId &&
      (filters.centerId === NO_CENTER_FILTER_VALUE
        ? profile.primary_center_id !== null
        : profile.primary_center_id !== filters.centerId)
    ) {
      return false;
    }

    if (filters.profileStatus && profile.status !== filters.profileStatus) {
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

    if (
      filters.linkStatus &&
      getCoachProfileLinkStatus(profile) !== filters.linkStatus
    ) {
      return false;
    }

    if (!query) {
      return true;
    }

    const haystack = [
      center?.name,
      getCoachProfileStatusLabel(profile.status),
      identity.detail,
      identity.label,
      profile.notes,
      role ? getMembershipRoleLabel(role) : "Sin acceso vinculado",
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

function MembershipRoleSelect({ defaultValue }: { defaultValue?: string }) {
  return (
    <select
      className={selectClassName()}
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

function MembershipStatusSelect({ defaultValue }: { defaultValue?: string }) {
  return (
    <select
      className={selectClassName()}
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

function CoachProfileStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={status === "active" ? "secondary" : "outline"}>
      {getCoachProfileStatusLabel(status)}
    </Badge>
  );
}

function TeamInvitationStatusBadge({ status }: { status: string }) {
  const labelByStatus: Record<string, string> = {
    accepted: "Aceptada",
    cancelled: "Cancelada",
    expired: "Caducada",
    failed: "Error",
    pending: "Pendiente",
    sent: "Enviada",
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
        <span className="text-sm font-medium">Ficha asociada</span>
        <select className={selectClassName()} name="coachProfileId" required>
          <option value="new">Crear nueva ficha</option>
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
          Puedes usar una ficha pendiente o crear una ficha minima en el mismo
          envio.
        </span>
      </label>

      <label className={wideActionFieldClassName}>
        <span className="text-sm font-medium">Nombre visible</span>
        <Input
          name="displayName"
          placeholder="Solo necesario si creas una ficha nueva"
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
          Enviar invitacion
        </Button>
      </div>
    </form>
  );
}

function MembershipCreateForm({
  organizationId,
}: {
  organizationId: string;
}) {
  return (
    <form action={createMembership} className={compactActionFormClassName}>
      <input name="organizationId" type="hidden" value={organizationId} />

      <label className={wideActionFieldClassName}>
        <span className="text-sm font-medium">Cuenta existente</span>
        <Input
          className="truncate"
          name="userId"
          placeholder="UUID de la cuenta existente"
          required
        />
        <span className="text-xs leading-5 text-muted-foreground">
          Este MVP no envia invitaciones por email: usa el UUID de una cuenta
          real de Supabase Auth.
        </span>
      </label>

      <label className={compactActionFieldClassName}>
        <span className="text-sm font-medium">Rol</span>
        <MembershipRoleSelect />
      </label>

      <label className={compactActionFieldClassName}>
        <span className="text-sm font-medium">Estado del acceso</span>
        <MembershipStatusSelect />
      </label>

      <div className="col-span-2 flex items-end">
        <Button type="submit">
          <Plus aria-hidden="true" />
          Crear acceso
        </Button>
      </div>
    </form>
  );
}

function CoachAccountLinkForm({
  organizationId,
  pendingProfiles,
  personProfiles,
}: {
  organizationId: string;
  pendingProfiles: CoachProfileRow[];
  personProfiles: PersonProfileMaps;
}) {
  const canLinkProfile = pendingProfiles.length > 0;

  return (
    <form
      action={linkCoachProfileToExistingAccount}
      className={compactActionFormClassName}
    >
      <input name="organizationId" type="hidden" value={organizationId} />

      <label className={wideActionFieldClassName}>
        <span className="text-sm font-medium">Ficha pendiente</span>
        <select
          className={selectClassName()}
          disabled={!canLinkProfile}
          name="coachProfileId"
          required
        >
          {canLinkProfile ? (
            pendingProfiles.map((profile) => {
              const identity = getCoachProfileIdentity(profile, personProfiles);

              return (
                <option key={profile.id} value={profile.id}>
                  {identity.label} / {identity.detail}
                </option>
              );
            })
          ) : (
            <option value="">Sin fichas pendientes visibles</option>
          )}
        </select>
        <span className="text-xs leading-5 text-muted-foreground">
          Solo aparecen fichas con persona activa y visible, aún sin cuenta
          vinculada en la ficha.
        </span>
      </label>

      <label className={wideActionFieldClassName}>
        <span className="text-sm font-medium">Cuenta real</span>
        <Input
          className="truncate"
          disabled={!canLinkProfile}
          name="userId"
          placeholder="UUID de Supabase Auth"
          required
        />
        <span className="text-xs leading-5 text-muted-foreground">
          Vincula una cuenta Auth existente. Esto no crea usuarios ni envia
          emails.
        </span>
      </label>

      <label className={compactActionFieldClassName}>
        <span className="text-sm font-medium">Rol</span>
        <MembershipRoleSelect />
      </label>

      <label className={compactActionFieldClassName}>
        <span className="text-sm font-medium">Estado del acceso</span>
        <MembershipStatusSelect />
      </label>

      <div className="col-span-2 flex items-end">
        <Button disabled={!canLinkProfile} type="submit">
          <Link2 aria-hidden="true" />
          Vincular cuenta
        </Button>
      </div>
    </form>
  );
}

function CoachProfileCreateForm({
  centers,
  memberships,
  organizationId,
  personProfilesByUserId,
}: {
  centers: CenterRow[];
  memberships: MembershipRow[];
  organizationId: string;
  personProfilesByUserId: Map<string, PersonProfileRow>;
}) {
  const canCreateProfile = memberships.length > 0;

  return (
    <form action={createCoachProfile} className={compactActionFormClassName}>
      <input name="organizationId" type="hidden" value={organizationId} />

      <label className={wideActionFieldClassName}>
        <span className="text-sm font-medium">Cuenta con acceso</span>
        <select
          className={selectClassName()}
          disabled={!canCreateProfile}
          name="userId"
          required
        >
          {memberships.map((membership) => {
            const identity = getMembershipIdentity(
              membership,
              personProfilesByUserId,
            );

            return (
              <option key={membership.id} value={membership.user_id}>
                {identity.label} / {getMembershipRoleLabel(membership.role)}
              </option>
            );
          })}
        </select>
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
        <span className="text-sm font-medium">Estado</span>
        <CoachProfileStatusSelect />
      </label>

      <label className={wideActionFieldClassName}>
        <span className="text-sm font-medium">Notas internas</span>
        <Textarea
          maxLength={1000}
          name="notes"
          placeholder="Capacidad, restricciones o contexto operativo"
        />
      </label>

      <div className="col-span-2 flex items-end">
        <Button disabled={!canCreateProfile} type="submit">
          <Plus aria-hidden="true" />
          Crear ficha
        </Button>
      </div>

      {!canCreateProfile ? (
        <p className="col-span-2 text-sm text-muted-foreground">
          Crea primero un acceso por UUID para poder crear una ficha desde
          cuenta.
        </p>
      ) : null}
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
  const openInvitations = invitations.filter((invitation) =>
    ["pending", "sent", "failed", "expired"].includes(invitation.status),
  );

  return (
    <section className="space-y-3">
      <SectionHeader
        action={<Badge variant="outline">{openInvitations.length} abiertas</Badge>}
        description="Invitaciones por email pendientes de aceptar o revisar."
        title="Invitaciones"
      />

      {openInvitations.length === 0 ? (
        <EmptyState
          description="Cuando envies una invitacion, aparecera aqui hasta que se acepte o se cancele."
          title="No hay invitaciones pendientes"
        />
      ) : (
        <div className="grid gap-3">
          {openInvitations.map((invitation) => {
            const personProfile = personProfiles.byId.get(
              invitation.person_profile_id,
            );

            return (
              <Card key={invitation.id} size="sm">
                <CardContent className="space-y-4">
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
                      <MetaItem label="Ultimo envio">
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
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}

function MembershipMobileCard({
  canManageAccess,
  currentUserId,
  identity,
  membership,
  organizationId,
  timezone,
}: {
  canManageAccess: boolean;
  currentUserId: string;
  identity: ReturnType<typeof getMembershipIdentity>;
  membership: MembershipRow;
  organizationId: string;
  timezone: string;
}) {
  const isSelf = membership.user_id === currentUserId;
  const canEditMembershipRole = isMembershipRole(membership.role);

  return (
    <Card size="sm">
      <CardContent className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold tracking-tight">
              {identity.label}
              {isSelf ? (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  tu usuario
                </span>
              ) : null}
            </h3>
            <p className="mt-1 truncate text-sm text-muted-foreground">
              {identity.detail}
            </p>
          </div>
          <MembershipStatusBadge status={membership.status} />
        </div>

        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div className="min-w-0">
            <dt className="text-xs font-medium text-muted-foreground">Rol</dt>
            <dd className="mt-1">
              <Badge variant="outline">
                {getMembershipRoleLabel(membership.role)}
              </Badge>
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs font-medium text-muted-foreground">
              Entrada
            </dt>
            <dd className="mt-1 truncate font-medium">
              {formatDate(membership.joined_at ?? membership.invited_at, timezone)}
            </dd>
          </div>
        </dl>

        {canManageAccess ? (
          isSelf ? (
            <p className="text-sm text-muted-foreground">
              Tu propio acceso está protegido.
            </p>
          ) : !canEditMembershipRole ? (
            <p className="text-sm text-muted-foreground">
              Este rol futuro se conserva, pero no se edita desde el corte B.2.
            </p>
          ) : (
            <InlineEditDetails label="Ajustar acceso">
              <form action={updateMembership} className="grid gap-3">
                <input name="organizationId" type="hidden" value={organizationId} />
                <input name="membershipId" type="hidden" value={membership.id} />
                <input name="userId" type="hidden" value={membership.user_id} />
                <MembershipRoleSelect defaultValue={membership.role} />
                <MembershipStatusSelect defaultValue={membership.status} />
                <Button className="w-full" type="submit">
                  <Save aria-hidden="true" />
                  Guardar
                </Button>
              </form>
            </InlineEditDetails>
          )
        ) : null}
      </CardContent>
    </Card>
  );
}

function MembershipsSection({
  canManageAccess,
  currentUserId,
  memberships,
  organizationId,
  organizationName,
  personProfilesByUserId,
  timezone,
}: {
  canManageAccess: boolean;
  currentUserId: string;
  memberships: MembershipRow[];
  organizationId: string;
  organizationName: string;
  personProfilesByUserId: Map<string, PersonProfileRow>;
  timezone: string;
}) {
  return (
    <section className="space-y-3">
      <SectionHeader
        action={<Badge variant="outline">{memberships.length} accesos</Badge>}
        description="Quién puede entrar en la organización y con qué rol."
        title="Accesos del equipo"
      />

      {memberships.length === 0 ? (
        <EmptyState
          description={
            canManageAccess
              ? "Crea el primer acceso usando una cuenta real que ya exista en Auth."
              : "Propietario o Administrador deben revisar tu acceso antes de que aparezca aquí."
          }
          title="No hay accesos visibles"
        />
      ) : (
        <>
          <div className="grid gap-3 md:hidden">
            {memberships.map((membership) => {
              const identity = getMembershipIdentity(
                membership,
                personProfilesByUserId,
              );

              return (
                <MembershipMobileCard
                  canManageAccess={canManageAccess}
                  currentUserId={currentUserId}
                  identity={identity}
                  key={membership.id}
                  membership={membership}
                  organizationId={organizationId}
                  timezone={timezone}
                />
              );
            })}
          </div>

        <Card className="hidden md:flex" size="sm">
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Persona</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Organización</TableHead>
                  <TableHead>Entrada</TableHead>
                  {canManageAccess ? <TableHead>Gestión</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {memberships.map((membership) => {
                  const isSelf = membership.user_id === currentUserId;
                  const canEditMembershipRole = isMembershipRole(
                    membership.role,
                  );
                  const identity = getMembershipIdentity(
                    membership,
                    personProfilesByUserId,
                  );

                  return (
                    <TableRow key={membership.id}>
                      <TableCell className="min-w-52">
                        <div className="min-w-0">
                          <p className="truncate font-medium">
                            {identity.label}
                            {isSelf ? (
                              <span className="ml-2 text-xs text-muted-foreground">
                                tu usuario
                              </span>
                            ) : null}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {identity.detail}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {getMembershipRoleLabel(membership.role)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <MembershipStatusBadge status={membership.status} />
                      </TableCell>
                      <TableCell className="max-w-52 truncate">
                        {organizationName}
                      </TableCell>
                      <TableCell>
                        {formatDate(
                          membership.joined_at ?? membership.invited_at,
                          timezone,
                        )}
                      </TableCell>
                      {canManageAccess ? (
                        <TableCell className="min-w-64">
                          {isSelf ? (
                            <span className="text-sm text-muted-foreground">
                              Protegida
                            </span>
                          ) : !canEditMembershipRole ? (
                            <span className="text-sm text-muted-foreground">
                              Rol futuro sin edición B.2
                            </span>
                          ) : (
                            <InlineEditDetails label="Ajustar acceso">
                              <form
                                action={updateMembership}
                                className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]"
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
                                <MembershipRoleSelect
                                  defaultValue={membership.role}
                                />
                                <MembershipStatusSelect
                                  defaultValue={membership.status}
                                />
                                <Button size="sm" type="submit">
                                  <Save aria-hidden="true" />
                                  Guardar
                                </Button>
                              </form>
                            </InlineEditDetails>
                          )}
                        </TableCell>
                      ) : null}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        </>
      )}
    </section>
  );
}

function CoachProfileCard({
  canManageProfiles,
  centers,
  membershipsByUserId,
  organizationId,
  personProfiles,
  profile,
  timezone,
}: {
  canManageProfiles: boolean;
  centers: CenterRow[];
  membershipsByUserId: Map<string, MembershipRow>;
  organizationId: string;
  personProfiles: PersonProfileMaps;
  profile: CoachProfileRow;
  timezone: string;
}) {
  const primaryCenter = centers.find(
    (center) => center.id === profile.primary_center_id,
  );
  const identity = getCoachProfileIdentity(profile, personProfiles);
  const profileRole = getCoachProfileRole(profile, membershipsByUserId);

  return (
    <Card size="sm">
      <CardContent className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)_auto] lg:items-start">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold tracking-tight">
              {identity.label}
            </h3>
            <p className="mt-1 truncate text-sm text-muted-foreground">
              {identity.detail}
            </p>
          </div>
          <MetaGrid className="lg:grid-cols-4">
            <MetaItem label="Centro principal">
              {primaryCenter?.name ?? "Sin centro principal"}
            </MetaItem>
            <MetaItem label="Rol">
              {profileRole ? getMembershipRoleLabel(profileRole) : "Sin acceso"}
            </MetaItem>
            <MetaItem label="Horas semanales">
              {formatHours(profile.weekly_contracted_hours)}
            </MetaItem>
            <MetaItem label="Actualizado">
              {formatDate(profile.updated_at, timezone)}
            </MetaItem>
          </MetaGrid>
          <div className="flex justify-start lg:justify-end">
            <CoachProfileStatusBadge status={profile.status} />
          </div>
        </div>

        {canManageProfiles ? (
          <InlineEditDetails label="Gestionar ficha">
            <form
              action={updateCoachProfile}
              className="grid gap-4 lg:grid-cols-4"
            >
              <input
                name="organizationId"
                type="hidden"
                value={organizationId}
              />
              <input name="coachProfileId" type="hidden" value={profile.id} />

              <label className="grid gap-2 lg:col-span-2">
                <span className="text-sm font-medium">Centro principal</span>
                <CenterSelect
                  centers={centers}
                  defaultValue={profile.primary_center_id}
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-medium">Horas semanales</span>
                <Input
                  defaultValue={profile.weekly_contracted_hours}
                  min="0"
                  max="168"
                  name="weeklyContractedHours"
                  step="0.25"
                  type="number"
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-medium">Estado</span>
                <CoachProfileStatusSelect defaultValue={profile.status} />
              </label>

              <label className="grid gap-2 lg:col-span-4">
                <span className="text-sm font-medium">Notas internas</span>
                <Textarea
                  defaultValue={profile.notes ?? ""}
                  maxLength={1000}
                  name="notes"
                />
              </label>

              <div className="flex flex-wrap gap-2 lg:col-span-4">
                <Button type="submit">
                  <Save aria-hidden="true" />
                  Guardar ficha
                </Button>
              </div>
            </form>
          </InlineEditDetails>
        ) : null}
      </CardContent>
    </Card>
  );
}

function CoachProfileFiltersCard({
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
    <Card size="sm">
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Filter aria-hidden="true" className="size-4" />
              Filtrar fichas
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {filteredCount} de {totalCount} fichas visibles.
            </p>
          </div>
          {activeFilterCount > 0 ? (
            <Badge variant="secondary">
              {activeFilterCount} filtro
              {activeFilterCount === 1 ? "" : "s"}
            </Badge>
          ) : null}
        </div>

        <form className="grid gap-3 md:grid-cols-2 xl:grid-cols-6" method="get">
          <input name="organizationId" type="hidden" value={organizationId} />

          <label className="grid min-w-0 gap-2 md:col-span-2 xl:col-span-2">
            <span className="text-sm font-medium">Buscar</span>
            <Input
              defaultValue={filters.query}
              name="q"
              placeholder="Nombre, cuenta o notas"
              type="search"
            />
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
              <option value="">Todos los estados</option>
              {COACH_PROFILE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {getCoachProfileStatusLabel(status)}
                </option>
              ))}
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

          <div className="grid gap-2 md:grid-cols-2 md:items-end xl:col-span-6 xl:flex xl:justify-end">
            <Button className="min-h-11 md:min-h-9" type="submit">
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

function CoachProfilesSection({
  activeFilterCount,
  canManageProfiles,
  centers,
  filters,
  membershipsByUserId,
  organizationId,
  personProfiles,
  profiles,
  timezone,
  totalProfiles,
}: {
  activeFilterCount: number;
  canManageProfiles: boolean;
  centers: CenterRow[];
  filters: CoachProfileFilters;
  membershipsByUserId: Map<string, MembershipRow>;
  organizationId: string;
  personProfiles: PersonProfileMaps;
  profiles: CoachProfileRow[];
  timezone: string;
  totalProfiles: number;
}) {
  const hasActiveFilters = activeFilterCount > 0;

  return (
    <section className="space-y-3">
      <SectionHeader
        action={
          <Badge variant="outline">
            {hasActiveFilters
              ? `${profiles.length} de ${totalProfiles} fichas`
              : `${totalProfiles} fichas`}
          </Badge>
        }
        description="Centro principal, horas semanales, estado y notas."
        title="Fichas de entrenador"
      />

      <CoachProfileFiltersCard
        activeFilterCount={activeFilterCount}
        centers={centers}
        filteredCount={profiles.length}
        filters={filters}
        organizationId={organizationId}
        totalCount={totalProfiles}
      />

      {profiles.length === 0 ? (
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
              ? "Prueba con otro nombre, centro, rol o estado de cuenta."
              : canManageProfiles
                ? "Crea una ficha cuando una persona del equipo vaya a cubrir clases."
                : "Todavía no hay fichas de entrenador visibles para esta organización."
          }
          title={
            hasActiveFilters
              ? "No hay fichas con estos filtros"
              : "No hay fichas de entrenador todavía"
          }
        />
      ) : (
        <div className="grid gap-3">
          {profiles.map((profile) => (
            <CoachProfileCard
              canManageProfiles={canManageProfiles}
              centers={centers}
              key={profile.id}
              membershipsByUserId={membershipsByUserId}
              organizationId={organizationId}
              personProfiles={personProfiles}
              profile={profile}
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
          description="Gestiona accesos y fichas operativas del equipo."
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
  const canManageAnyTeamData = canManageAccess || canManageProfiles;
  const roleLabel = getApplicationRoleLabel(resolution.membership.role);
  const profileUserIds = new Set(
    coachProfiles.flatMap((profile) =>
      profile.user_id ? [profile.user_id] : [],
    ),
  );
  const membershipsWithoutProfile = tenantMemberships.filter(
    (membership) =>
      isMembershipRole(membership.role) &&
      !profileUserIds.has(membership.user_id),
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
  const centersById = new Map(centers.map((center) => [center.id, center]));
  const membershipsByUserId = new Map(
    tenantMemberships.map((membership) => [membership.user_id, membership]),
  );
  const coachProfileFilters = resolveCoachProfileFilters({
    centers,
    params,
  });
  const filteredCoachProfiles = applyCoachProfileFilters({
    centersById,
    filters: coachProfileFilters,
    membershipsByUserId,
    personProfiles,
    profiles: coachProfiles,
  });
  const coachProfileActiveFilterCount =
    getCoachProfileActiveFilterCount(coachProfileFilters);
  const teamPageDescription = canManageAccess
    ? "Invita al equipo por email y mantén sus accesos y fichas de entrenador al día."
    : canManageProfiles
      ? "Mantén actualizadas las fichas de entrenador y consulta los accesos del equipo."
      : "Consulta quién forma parte del equipo y sus fichas de entrenador.";

  return (
    <div className="space-y-6">
      <PageHeader
        badge="Equipo"
        description={teamPageDescription}
        meta={
          <>
            <Badge variant="secondary">{resolution.organization.name}</Badge>
            <Badge variant="outline">Rol {roleLabel}</Badge>
          </>
        }
        title="Equipo"
      />

      {status && successMessages[status] ? (
        <Alert>
          <AlertTitle>{successMessages[status]}</AlertTitle>
          <AlertDescription>
            La lista ya muestra los accesos y fichas actuales.
          </AlertDescription>
        </Alert>
      ) : null}

      {error && errorMessages[error] ? (
        <Alert variant="destructive">
          <AlertTitle>No se han guardado los cambios</AlertTitle>
          <AlertDescription>{errorMessages[error]}</AlertDescription>
        </Alert>
      ) : null}

      {canManageAnyTeamData ? (
        <div className="space-y-3">
          {canManageAccess ? (
            <CollapsibleActionPanel
              actionLabel="Invitar"
              description="Crea o reutiliza una ficha y envia un enlace de acceso por email."
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
          ) : null}

          <details className="group rounded-xl border border-dashed border-border bg-muted/20">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
              Herramientas avanzadas
              <Badge variant="outline">UUID</Badge>
            </summary>
            <div className="grid gap-3 border-t border-border px-4 py-4 xl:grid-cols-3">
              {canManageAccess ? (
                <>
                  <CollapsibleActionPanel
                    actionLabel="Crear"
                    description="Da acceso con el UUID de una cuenta Auth existente."
                    icon={UserPlus}
                    title="Crear acceso"
                  >
                    <MembershipCreateForm
                      organizationId={resolution.organization.id}
                    />
                  </CollapsibleActionPanel>
                  <CollapsibleActionPanel
                    actionLabel="Vincular"
                    description="Conecta una ficha/persona pendiente con una cuenta real."
                    icon={Link2}
                    title="Vincular cuenta existente"
                  >
                    <CoachAccountLinkForm
                      organizationId={resolution.organization.id}
                      pendingProfiles={pendingLinkProfiles}
                      personProfiles={personProfiles}
                    />
                  </CollapsibleActionPanel>
                </>
              ) : null}
              {canManageProfiles ? (
                <CollapsibleActionPanel
                  actionLabel="Crear"
                  description="Crea una ficha desde un acceso ya existente."
                  icon={BadgeCheck}
                  title="Crear ficha de entrenador"
                >
                  <CoachProfileCreateForm
                    centers={centers}
                    memberships={membershipsWithoutProfile}
                    organizationId={resolution.organization.id}
                    personProfilesByUserId={personProfiles.byUserId}
                  />
                </CollapsibleActionPanel>
              ) : null}
            </div>
          </details>
        </div>
      ) : null}

      {canManageProfiles && !canManageAccess ? (
        <Alert>
          <AlertTitle>Accesos protegidos</AlertTitle>
          <AlertDescription>
            Tu rol puede ajustar fichas operativas, pero Propietario y
            Administrador mantienen altas, roles y vinculaciones de cuenta.
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

      <MembershipsSection
        canManageAccess={canManageAccess}
        currentUserId={user.id}
        memberships={tenantMemberships}
        organizationId={resolution.organization.id}
        organizationName={resolution.organization.name}
        personProfilesByUserId={personProfiles.byUserId}
        timezone={resolution.organization.timezone}
      />

      <CoachProfilesSection
        activeFilterCount={coachProfileActiveFilterCount}
        canManageProfiles={canManageProfiles}
        centers={centers}
        filters={coachProfileFilters}
        membershipsByUserId={membershipsByUserId}
        organizationId={resolution.organization.id}
        personProfiles={personProfiles}
        profiles={filteredCoachProfiles}
        timezone={resolution.organization.timezone}
        totalProfiles={coachProfiles.length}
      />

      <Alert>
        <CircleOff aria-hidden="true" className="size-4" />
        <AlertTitle>Fuera de este corte</AlertTitle>
        <AlertDescription>
          Esta pantalla prepara el equipo. Los horarios, plantillas y cobertura
          se gestionan en sus secciones.
        </AlertDescription>
      </Alert>
    </div>
  );
}
