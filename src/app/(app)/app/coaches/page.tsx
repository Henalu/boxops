import { redirect } from "next/navigation";
import {
  BadgeCheck,
  CircleOff,
  IdCard,
  Plus,
  Save,
  UserPlus,
  UsersRound,
} from "lucide-react";

import {
  createCoachProfile,
  createMembership,
  updateCoachProfile,
  updateMembership,
} from "./actions";
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
    organizationId?: string | string[];
    status?: string | string[];
    error?: string | string[];
  }>;
};

type MembershipRow = Pick<
  Tables<"organization_memberships">,
  | "id"
  | "organization_id"
  | "user_id"
  | "role"
  | "status"
  | "invited_at"
  | "joined_at"
  | "created_at"
  | "updated_at"
>;

type CoachProfileRow = Pick<
  Tables<"coach_profiles">,
  | "id"
  | "organization_id"
  | "user_id"
  | "person_profile_id"
  | "primary_center_id"
  | "weekly_contracted_hours"
  | "status"
  | "notes"
  | "updated_at"
>;

type CenterRow = Pick<Tables<"centers">, "id" | "name" | "status">;

const successMessages: Record<string, string> = {
  "membership-created": "Acceso creado.",
  "membership-updated": "Acceso actualizado.",
  "profile-created": "Ficha de coach creada.",
  "profile-updated": "Ficha de coach actualizada.",
};

const errorMessages: Record<string, string> = {
  "auth-user-not-found":
    "Ese ID de usuario no existe. Crea primero la cuenta de la persona.",
  "duplicate-membership":
    "Ese usuario ya tiene acceso en esta organizacion.",
  "duplicate-profile":
    "Ese usuario ya tiene un perfil de coach en esta organizacion.",
  "forbidden": "Tu rol no permite gestionar usuarios ni perfiles.",
  "invalid-center": "El centro principal seleccionado no es valido.",
  "invalid-hours": "Las horas semanales deben estar entre 0 y 168.",
  "invalid-profile-reference":
    "La ficha no se ha podido guardar porque falta un acceso o centro valido.",
  "invalid-role": "El rol debe ser admin o coach.",
  "invalid-status": "El estado seleccionado no es valido.",
  "invalid-user-id": "El ID de usuario debe ser valido.",
  "membership-required": "No se ha encontrado el acceso de esta organizacion.",
  "missing-fields": "Completa los campos obligatorios.",
  "notes-too-long": "Las notas no pueden superar 1000 caracteres.",
  "profile-required": "No se ha recibido el perfil de coach a actualizar.",
  "save-failed": "No se han podido guardar los cambios.",
  "self-membership":
    "No puedes cambiar tu propio acceso desde esta pantalla para evitar quedarte sin acceso.",
  organization_required:
    "Elige una organizacion antes de gestionar usuarios y coaches.",
  organization_not_found: "La organizacion solicitada no esta disponible.",
  no_active_memberships: "No hay accesos activos para este usuario.",
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

function getCoachProfileIdentity(profile: CoachProfileRow) {
  if (profile.user_id) {
    return {
      detail: "Cuenta vinculada",
      label: shortId(profile.user_id),
    };
  }

  if (profile.person_profile_id) {
    return {
      detail: `Persona pendiente de cuenta: ${profile.person_profile_id}`,
      label: shortId(profile.person_profile_id),
    };
  }

  return {
    detail: "Sin usuario ni persona vinculada",
    label: "Pendiente",
  };
}

function selectClassName(className = "") {
  return [
    "h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm",
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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserPlus aria-hidden="true" className="size-4" />
          Crear acceso
        </CardTitle>
        <CardDescription>
          Da acceso a una persona que ya tiene cuenta creada.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={createMembership} className="grid gap-4 lg:grid-cols-4">
          <input name="organizationId" type="hidden" value={organizationId} />

          <label className="grid gap-2 lg:col-span-2">
            <span className="text-sm font-medium">ID de usuario</span>
            <Input
              name="userId"
              placeholder="00000000-0000-0000-0000-000000000000"
              required
            />
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-medium">Rol</span>
            <MembershipRoleSelect />
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-medium">Estado</span>
            <MembershipStatusSelect />
          </label>

          <div className="flex items-end lg:col-span-4">
            <Button type="submit">
              <Plus aria-hidden="true" />
              Crear acceso
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function CoachProfileCreateForm({
  centers,
  memberships,
  organizationId,
}: {
  centers: CenterRow[];
  memberships: MembershipRow[];
  organizationId: string;
}) {
  const canCreateProfile = memberships.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BadgeCheck aria-hidden="true" className="size-4" />
          Crear ficha de coach
        </CardTitle>
        <CardDescription>
          Define centro principal, horas semanales, estado y notas internas.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          action={createCoachProfile}
          className="grid gap-4 lg:grid-cols-4"
        >
          <input name="organizationId" type="hidden" value={organizationId} />

          <label className="grid gap-2 lg:col-span-2">
            <span className="text-sm font-medium">Usuario con acceso</span>
            <select
              className={selectClassName()}
              disabled={!canCreateProfile}
              name="userId"
              required
            >
              {memberships.map((membership) => (
                <option key={membership.id} value={membership.user_id}>
                  {shortId(membership.user_id)} /{" "}
                  {getMembershipRoleLabel(membership.role)}
                </option>
              ))}
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
        </form>

        {!canCreateProfile ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Crea primero un acceso para poder dar de alta una ficha de coach.
          </p>
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
  timezone,
}: {
  currentUserId: string;
  isAdmin: boolean;
  memberships: MembershipRow[];
  organizationId: string;
  organizationName: string;
  timezone: string;
}) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            Accesos del equipo
          </h2>
          <p className="text-sm text-muted-foreground">
            Define quien puede entrar y con que rol.
          </p>
        </div>
        <Badge variant="outline">{memberships.length} visibles</Badge>
      </div>

      {memberships.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No hay accesos visibles</CardTitle>
            <CardDescription>
              {isAdmin
                ? "Crea un acceso con el ID de una cuenta existente."
                : "Un admin debe revisar tu acceso antes de que aparezca aqui."}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Organizacion</TableHead>
                  <TableHead>Entrada</TableHead>
                  {isAdmin ? <TableHead>Gestion</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {memberships.map((membership) => {
                  const isSelf = membership.user_id === currentUserId;

                  return (
                    <TableRow key={membership.id}>
                      <TableCell className="max-w-64 whitespace-normal break-all font-mono text-xs">
                        {shortId(membership.user_id)}
                        {isSelf ? (
                          <span className="ml-2 font-sans text-muted-foreground">
                            tu usuario
                          </span>
                        ) : null}
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
                        <TableCell>
                          {isSelf ? (
                            <span className="text-sm text-muted-foreground">
                              Protegida
                            </span>
                          ) : (
                            <form
                              action={updateMembership}
                              className="flex min-w-72 flex-col gap-2 sm:flex-row"
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
      )}
    </section>
  );
}

function CoachProfileCard({
  centers,
  isAdmin,
  organizationId,
  profile,
  timezone,
}: {
  centers: CenterRow[];
  isAdmin: boolean;
  organizationId: string;
  profile: CoachProfileRow;
  timezone: string;
}) {
  const primaryCenter = centers.find(
    (center) => center.id === profile.primary_center_id,
  );
  const identity = getCoachProfileIdentity(profile);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2">
              <IdCard aria-hidden="true" className="size-4 shrink-0" />
              <span className="truncate font-mono text-base">
                {identity.label}
              </span>
            </CardTitle>
            <CardDescription className="break-all">
              {identity.detail}
            </CardDescription>
          </div>
          <CoachProfileStatusBadge status={profile.status} />
        </div>
      </CardHeader>
      <CardContent>
        {isAdmin ? (
          <form action={updateCoachProfile} className="grid gap-4 lg:grid-cols-4">
            <input name="organizationId" type="hidden" value={organizationId} />
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
                Guardar perfil
              </Button>
            </div>
          </form>
        ) : (
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <div className="min-w-0">
              <dt className="text-muted-foreground">Centro principal</dt>
              <dd className="mt-1 truncate font-medium">
                {primaryCenter?.name ?? "Sin centro principal"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Horas semanales</dt>
              <dd className="mt-1 font-medium">
                {formatHours(profile.weekly_contracted_hours)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Ultima actualizacion</dt>
              <dd className="mt-1">{formatDate(profile.updated_at, timezone)}</dd>
            </div>
          </dl>
        )}
      </CardContent>
    </Card>
  );
}

function CoachProfilesSection({
  centers,
  isAdmin,
  organizationId,
  profiles,
  timezone,
}: {
  centers: CenterRow[];
  isAdmin: boolean;
  organizationId: string;
  profiles: CoachProfileRow[];
  timezone: string;
}) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            Fichas de coach
          </h2>
          <p className="text-sm text-muted-foreground">
            Centro principal, horas semanales, estado y notas.
          </p>
        </div>
        <Badge variant="outline">{profiles.length} perfiles</Badge>
      </div>

      {profiles.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No hay fichas de coach todavia</CardTitle>
            <CardDescription>
              {isAdmin
                ? "Crea una ficha cuando una persona del equipo vaya a cubrir clases."
                : "Todavia no hay fichas de coach visibles para esta organizacion."}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4">
          {profiles.map((profile) => (
            <CoachProfileCard
              centers={centers}
              isAdmin={isAdmin}
              key={profile.id}
              organizationId={organizationId}
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
        <PageHeader />
        <OrganizationResolutionState
          basePath="/app/coaches"
          resolution={resolution}
        />
      </div>
    );
  }

  const [tenantMemberships, coachProfiles, centers] = await Promise.all([
    getMemberships(resolution.organization.id),
    getCoachProfiles(resolution.organization.id),
    getCenters(resolution.organization.id),
  ]);
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
        organizationName={resolution.organization.name}
        role={resolution.membership.role}
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
        <div className="grid gap-4 xl:grid-cols-2">
          <MembershipCreateForm organizationId={resolution.organization.id} />
          <CoachProfileCreateForm
            centers={centers}
            memberships={membershipsWithoutProfile}
            organizationId={resolution.organization.id}
          />
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
        timezone={resolution.organization.timezone}
      />

      <CoachProfilesSection
        centers={centers}
        isAdmin={canManagePeople}
        organizationId={resolution.organization.id}
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

function PageHeader({
  organizationName,
  role,
}: {
  organizationName?: string;
  role?: string;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">Equipo</Badge>
        {organizationName ? (
          <Badge variant="secondary">{organizationName}</Badge>
        ) : null}
        {role ? <Badge variant="outline">Rol {role}</Badge> : null}
      </div>
      <div className="max-w-3xl space-y-2">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          <UsersRound aria-hidden="true" className="size-6" />
          Equipo
        </h1>
        <p className="text-sm leading-6 text-muted-foreground sm:text-base">
          Gestiona coaches, accesos y fichas operativas del equipo.
        </p>
      </div>
    </section>
  );
}
