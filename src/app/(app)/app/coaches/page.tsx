import { redirect } from "next/navigation";
import {
  BadgeCheck,
  CircleOff,
  Plus,
  Save,
  UserPlus,
} from "lucide-react";

import {
  createCoachProfile,
  createMembership,
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
} from "@/lib/coaches";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/supabase";

export const dynamic = "force-dynamic";

type CoachesPageProps = {
  searchParams: Promise<{
    error?: string | string[];
    organizationId?: string | string[];
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

type PersonProfileMaps = {
  byId: Map<string, PersonProfileRow>;
  byUserId: Map<string, PersonProfileRow>;
};

const successMessages: Record<string, string> = {
  "membership-created": "Coach invitado.",
  "membership-updated": "Acceso actualizado.",
  "profile-created": "Ficha de coach creada.",
  "profile-updated": "Ficha de coach actualizada.",
};

const errorMessages: Record<string, string> = {
  "auth-user-not-found":
    "Esa cuenta no existe todavía. Crea primero la cuenta de la persona.",
  "duplicate-membership":
    "Esa persona ya tiene acceso en esta organización.",
  "duplicate-profile":
    "Ese coach ya tiene una ficha operativa en esta organización.",
  forbidden: "Tu rol no permite gestionar usuarios ni perfiles.",
  "invalid-center": "El centro principal seleccionado no es válido.",
  "invalid-hours": "Las horas semanales deben estar entre 0 y 168.",
  "invalid-profile-reference":
    "La ficha no se ha podido guardar porque falta un acceso o centro válido.",
  "invalid-role": "El rol debe ser admin o coach.",
  "invalid-status": "El estado seleccionado no es válido.",
  "invalid-user-id": "La cuenta del coach debe usar un UUID válido.",
  "membership-required": "No se ha encontrado el acceso de esta organización.",
  "missing-fields": "Completa los campos obligatorios.",
  no_active_memberships: "No hay accesos activos para este usuario.",
  "notes-too-long": "Las notas no pueden superar 1000 caracteres.",
  organization_not_found: "La organización solicitada no está disponible.",
  organization_required:
    "Elige una organización antes de gestionar usuarios y coaches.",
  "profile-required": "No se ha recibido el perfil de coach a actualizar.",
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
    label: `Coach ${shortId(membership.user_id)}`,
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
      label: `Coach ${shortId(profile.user_id)}`,
    };
  }

  if (profile.person_profile_id) {
    return {
      detail: `Persona pendiente ${shortId(profile.person_profile_id)}`,
      label: "Coach pendiente",
    };
  }

  return {
    detail: "Sin usuario ni persona vinculada",
    label: "Coach pendiente",
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
      defaultValue={defaultValue ?? "invited"}
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

function MembershipCreateForm({
  organizationId,
}: {
  organizationId: string;
}) {
  return (
    <form action={createMembership} className="grid gap-4 lg:grid-cols-4">
      <input name="organizationId" type="hidden" value={organizationId} />

      <label className="grid gap-2 lg:col-span-2">
        <span className="text-sm font-medium">Cuenta del coach</span>
        <Input
          name="userId"
          placeholder="UUID de la cuenta existente"
          required
        />
        <span className="text-xs leading-5 text-muted-foreground">
          MVP: usa el UUID de Supabase Auth hasta que exista invitacion por
          email.
        </span>
      </label>

      <label className="grid gap-2">
        <span className="text-sm font-medium">Rol</span>
        <MembershipRoleSelect />
      </label>

      <label className="grid gap-2">
        <span className="text-sm font-medium">Estado inicial</span>
        <MembershipStatusSelect />
      </label>

      <div className="flex items-end lg:col-span-4">
        <Button type="submit">
          <Plus aria-hidden="true" />
          Invitar coach
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
    <form action={createCoachProfile} className="grid gap-4 lg:grid-cols-4">
      <input name="organizationId" type="hidden" value={organizationId} />

      <label className="grid gap-2 lg:col-span-2">
        <span className="text-sm font-medium">Coach invitado</span>
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

      <label className="grid gap-2">
        <span className="text-sm font-medium">Centro principal</span>
        <CenterSelect centers={centers} />
      </label>

      <label className="grid gap-2">
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

      <label className="grid gap-2">
        <span className="text-sm font-medium">Estado</span>
        <CoachProfileStatusSelect />
      </label>

      <label className="grid gap-2 lg:col-span-3">
        <span className="text-sm font-medium">Notas internas</span>
        <Textarea
          maxLength={1000}
          name="notes"
          placeholder="Capacidad, restricciones o contexto operativo"
        />
      </label>

      <div className="flex items-end lg:col-span-4">
        <Button disabled={!canCreateProfile} type="submit">
          <Plus aria-hidden="true" />
          Crear ficha
        </Button>
      </div>

      {!canCreateProfile ? (
        <p className="text-sm text-muted-foreground lg:col-span-4">
          Invita primero a un coach para poder crear su ficha operativa.
        </p>
      ) : null}
    </form>
  );
}

function MembershipMobileCard({
  currentUserId,
  identity,
  isAdmin,
  membership,
  organizationId,
  timezone,
}: {
  currentUserId: string;
  identity: ReturnType<typeof getMembershipIdentity>;
  isAdmin: boolean;
  membership: MembershipRow;
  organizationId: string;
  timezone: string;
}) {
  const isSelf = membership.user_id === currentUserId;

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

        {isAdmin ? (
          isSelf ? (
            <p className="text-sm text-muted-foreground">
              Tu propio acceso está protegido.
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
  currentUserId,
  isAdmin,
  memberships,
  organizationId,
  organizationName,
  personProfilesByUserId,
  timezone,
}: {
  currentUserId: string;
  isAdmin: boolean;
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
            isAdmin
              ? "Invita el primer coach usando la cuenta que ya existe en Auth."
              : "Un admin debe revisar tu acceso antes de que aparezca aquí."
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
                  currentUserId={currentUserId}
                  identity={identity}
                  isAdmin={isAdmin}
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
                  <TableHead>Coach</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Organizacion</TableHead>
                  <TableHead>Entrada</TableHead>
                  {isAdmin ? <TableHead>Gestión</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {memberships.map((membership) => {
                  const isSelf = membership.user_id === currentUserId;
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
                      {isAdmin ? (
                        <TableCell className="min-w-64">
                          {isSelf ? (
                            <span className="text-sm text-muted-foreground">
                              Protegida
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
  centers,
  isAdmin,
  organizationId,
  personProfiles,
  profile,
  timezone,
}: {
  centers: CenterRow[];
  isAdmin: boolean;
  organizationId: string;
  personProfiles: PersonProfileMaps;
  profile: CoachProfileRow;
  timezone: string;
}) {
  const primaryCenter = centers.find(
    (center) => center.id === profile.primary_center_id,
  );
  const identity = getCoachProfileIdentity(profile, personProfiles);

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
          <MetaGrid className="lg:grid-cols-3">
            <MetaItem label="Centro principal">
              {primaryCenter?.name ?? "Sin centro principal"}
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

        {isAdmin ? (
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

function CoachProfilesSection({
  centers,
  isAdmin,
  organizationId,
  personProfiles,
  profiles,
  timezone,
}: {
  centers: CenterRow[];
  isAdmin: boolean;
  organizationId: string;
  personProfiles: PersonProfileMaps;
  profiles: CoachProfileRow[];
  timezone: string;
}) {
  return (
    <section className="space-y-3">
      <SectionHeader
        action={<Badge variant="outline">{profiles.length} fichas</Badge>}
        description="Centro principal, horas semanales, estado y notas."
        title="Fichas de coach"
      />

      {profiles.length === 0 ? (
        <EmptyState
          description={
            isAdmin
              ? "Crea una ficha cuando una persona del equipo vaya a cubrir clases."
              : "Todavía no hay fichas de coach visibles para esta organización."
          }
          title="No hay fichas de coach todavía"
        />
      ) : (
        <div className="grid gap-3">
          {profiles.map((profile) => (
            <CoachProfileCard
              centers={centers}
              isAdmin={isAdmin}
              key={profile.id}
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
          description="Gestiona coaches, accesos y fichas operativas del equipo."
          title="Equipo"
        />
        <OrganizationResolutionState
          basePath="/app/coaches"
          resolution={resolution}
        />
      </div>
    );
  }

  const [tenantMemberships, coachProfiles, centers, personProfileRows] =
    await Promise.all([
      getMemberships(resolution.organization.id),
      getCoachProfiles(resolution.organization.id),
      getCenters(resolution.organization.id),
      getPersonProfiles(resolution.organization.id),
    ]);
  const personProfiles = buildPersonProfileMaps(personProfileRows);
  const canManagePeople = resolution.membership.role === "admin";
  const profileUserIds = new Set(
    coachProfiles.flatMap((profile) =>
      profile.user_id ? [profile.user_id] : [],
    ),
  );
  const membershipsWithoutProfile = tenantMemberships.filter(
    (membership) => !profileUserIds.has(membership.user_id),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        badge="Equipo"
        description="Invita coaches y mantiene sus fichas operativas sin exponer el UUID como tarea principal."
        meta={
          <>
            <Badge variant="secondary">{resolution.organization.name}</Badge>
            <Badge variant="outline">Rol {resolution.membership.role}</Badge>
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

      {canManagePeople ? (
        <div className="grid gap-3 xl:grid-cols-2">
          <CollapsibleActionPanel
            actionLabel="Invitar"
            description="Da acceso a un coach que ya tiene cuenta creada para este MVP."
            icon={UserPlus}
            title="Invitar coach"
          >
            <MembershipCreateForm organizationId={resolution.organization.id} />
          </CollapsibleActionPanel>
          <CollapsibleActionPanel
            actionLabel="Crear"
            description="Activa la ficha operativa para asignarlo a horarios y plantillas."
            icon={BadgeCheck}
            title="Crear ficha de coach"
          >
            <CoachProfileCreateForm
              centers={centers}
              memberships={membershipsWithoutProfile}
              organizationId={resolution.organization.id}
              personProfilesByUserId={personProfiles.byUserId}
            />
          </CollapsibleActionPanel>
        </div>
      ) : (
        <Alert>
          <AlertTitle>Modo lectura</AlertTitle>
          <AlertDescription>
            Tu rol coach puede consultar esta base operativa, pero no crear ni
            editar accesos o fichas.
          </AlertDescription>
        </Alert>
      )}

      <MembershipsSection
        currentUserId={user.id}
        isAdmin={canManagePeople}
        memberships={tenantMemberships}
        organizationId={resolution.organization.id}
        organizationName={resolution.organization.name}
        personProfilesByUserId={personProfiles.byUserId}
        timezone={resolution.organization.timezone}
      />

      <CoachProfilesSection
        centers={centers}
        isAdmin={canManagePeople}
        organizationId={resolution.organization.id}
        personProfiles={personProfiles}
        profiles={coachProfiles}
        timezone={resolution.organization.timezone}
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
