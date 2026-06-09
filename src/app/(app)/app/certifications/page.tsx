import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Award,
  CheckCircle2,
  Plus,
  Save,
  ShieldCheck,
  UsersRound,
} from "lucide-react";

import {
  createCertification,
  updateCertification,
} from "./actions";
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
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getLoginPath } from "@/lib/auth/redirects";
import {
  canManageCertifications,
  getApplicationRoleLabel,
} from "@/lib/auth/permissions";
import {
  getActiveMemberships,
  getAuthenticatedUser,
  resolveActiveOrganization,
} from "@/lib/auth/tenant";
import {
  CERTIFICATION_STATUSES,
  getCertificationStatusLabel,
} from "@/lib/certifications";
import { getCertificationsPath } from "@/lib/navigation/app-paths";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import type { Tables } from "@/types/supabase";

export const dynamic = "force-dynamic";

type CertificationsPageProps = {
  searchParams: Promise<{
    error?: string | string[];
    organizationId?: string | string[];
    status?: string | string[];
  }>;
};

type CertificationRow = {
  description: string | null;
  id: string;
  status: string;
  title: string;
  updated_at: string;
};

type CoachCertificationRow = {
  certification_id: string;
  coach_profile_id: string;
  status: string;
};

type CoachProfileRow = Pick<
  Tables<"coach_profiles">,
  "id" | "person_profile_id" | "status" | "user_id"
>;

type PersonProfileRow = Pick<
  Tables<"person_profiles">,
  "display_name" | "id" | "status" | "user_id" | "visibility_status"
>;

type CoachOption = {
  id: string;
  label: string;
  status: string;
};

const successMessages: Record<string, string> = {
  created: "Certificación creada.",
  updated: "Certificación actualizada.",
};

const successDescriptions: Record<string, string> = {
  created: "Ya puedes usarla como requisito en tipos de actividad.",
  updated: "Las asignaciones de entrenadores quedan listas para horarios y plantillas.",
};

const errorMessages: Record<string, string> = {
  "duplicate-title": "Ya existe una certificación con ese título.",
  forbidden: "Tu rol no permite gestionar certificaciones.",
  "invalid-certification": "No se ha recibido una certificación válida.",
  "invalid-coach": "Algún entrenador seleccionado no está disponible.",
  "invalid-status": "El estado seleccionado no es válido.",
  "missing-fields": "Completa el título.",
  no_active_memberships: "No hay accesos activos para este usuario.",
  organization_not_found: "La organización solicitada no está disponible.",
  organization_required:
    "Elige una organización antes de gestionar certificaciones.",
  "save-failed": "No se han podido guardar los cambios.",
};

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function selectClassName(className = "") {
  return cn(
    "h-11 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:h-9",
    className,
  );
}

function isVisiblePerson(personProfile: PersonProfileRow | undefined) {
  return (
    personProfile?.status === "active" &&
    personProfile.visibility_status === "visible"
  );
}

function buildCoachOptions({
  coachProfiles,
  personProfiles,
}: {
  coachProfiles: CoachProfileRow[];
  personProfiles: PersonProfileRow[];
}) {
  const peopleById = new Map(
    personProfiles.map((personProfile) => [personProfile.id, personProfile]),
  );
  const peopleByUserId = new Map(
    personProfiles.map((personProfile) => [personProfile.user_id, personProfile]),
  );

  return coachProfiles
    .filter((coachProfile) => coachProfile.status === "active")
    .map((coachProfile) => {
      const personProfile = coachProfile.person_profile_id
        ? peopleById.get(coachProfile.person_profile_id)
        : peopleByUserId.get(coachProfile.user_id);

      return {
        id: coachProfile.id,
        label: personProfile && isVisiblePerson(personProfile)
          ? personProfile.display_name
          : "Entrenador sin ficha visible",
        status: coachProfile.status,
      };
    })
    .sort((first, second) =>
      first.label.localeCompare(second.label, "es", { sensitivity: "base" }),
    );
}

async function getCertificationContext(organizationId: string) {
  const supabase = await createClient();
  const [
    certificationsResult,
    coachCertificationsResult,
    coachProfilesResult,
  ] = await Promise.all([
    supabase
      .from("certifications")
      .select("id, title, description, status, updated_at")
      .eq("organization_id", organizationId)
      .order("status", { ascending: true })
      .order("title", { ascending: true }),
    supabase
      .from("coach_certifications")
      .select("certification_id, coach_profile_id, status")
      .eq("organization_id", organizationId),
    supabase
      .from("coach_profiles")
      .select("id, user_id, person_profile_id, status")
      .eq("organization_id", organizationId)
      .order("updated_at", { ascending: false }),
  ]);

  if (certificationsResult.error) {
    throw new Error(
      `Could not load certifications: ${certificationsResult.error.message}`,
    );
  }

  if (coachCertificationsResult.error) {
    throw new Error(
      `Could not load coach certifications: ${coachCertificationsResult.error.message}`,
    );
  }

  if (coachProfilesResult.error) {
    throw new Error(
      `Could not load coach profiles: ${coachProfilesResult.error.message}`,
    );
  }

  const coachProfiles = (coachProfilesResult.data ?? []) satisfies CoachProfileRow[];
  const personProfileIds = [
    ...new Set(
      coachProfiles
        .map((coachProfile) => coachProfile.person_profile_id)
        .filter(Boolean) as string[],
    ),
  ];
  const userIds = [
    ...new Set(coachProfiles.map((coachProfile) => coachProfile.user_id)),
  ];

  const personProfileQueries = await Promise.all([
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
  ]);

  for (const personProfileResult of personProfileQueries) {
    if (personProfileResult.error) {
      throw new Error(
        `Could not load person profiles: ${personProfileResult.error.message}`,
      );
    }
  }

  const peopleById = new Map<string, PersonProfileRow>();

  for (const personProfile of personProfileQueries.flatMap(
    (result) => result.data ?? [],
  )) {
    peopleById.set(personProfile.id, personProfile as PersonProfileRow);
  }

  return {
    certifications: (certificationsResult.data ?? []) satisfies CertificationRow[],
    coachCertifications:
      (coachCertificationsResult.data ?? []) satisfies CoachCertificationRow[],
    coaches: buildCoachOptions({
      coachProfiles,
      personProfiles: [...peopleById.values()],
    }),
  };
}

function CertificationStatusBadge({ status }: { status: string }) {
  return (
    <StatusBadge tone={status === "active" ? "success" : "neutral"}>
      {getCertificationStatusLabel(status)}
    </StatusBadge>
  );
}

function CertificationStatusSelect({
  defaultValue,
}: {
  defaultValue?: string;
}) {
  return (
    <select
      className={selectClassName()}
      defaultValue={defaultValue ?? "active"}
      name="status"
    >
      {CERTIFICATION_STATUSES.map((status) => (
        <option key={status} value={status}>
          {getCertificationStatusLabel(status)}
        </option>
      ))}
    </select>
  );
}

function CoachAssignmentGrid({
  activeCoachIds,
  coaches,
}: {
  activeCoachIds: Set<string>;
  coaches: CoachOption[];
}) {
  if (coaches.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
        No hay entrenadores activos para asignar.
      </p>
    );
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {coaches.map((coach) => (
        <label
          className="flex min-h-10 items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm transition-colors hover:bg-muted/45"
          key={coach.id}
        >
          <input
            className="size-4 shrink-0 rounded border-input text-primary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            defaultChecked={activeCoachIds.has(coach.id)}
            name="coachProfileId"
            type="checkbox"
            value={coach.id}
          />
          <span className="min-w-0 truncate">{coach.label}</span>
        </label>
      ))}
    </div>
  );
}

function CertificationFormFields({
  activeCoachIds = new Set<string>(),
  certification,
  coaches,
}: {
  activeCoachIds?: Set<string>;
  certification?: CertificationRow;
  coaches: CoachOption[];
}) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_14rem]">
        <label className="grid gap-2">
          <span className="text-sm font-medium">Título</span>
          <Input
            defaultValue={certification?.title}
            maxLength={120}
            name="title"
            placeholder="CrossFit Level 1"
            required
          />
        </label>
        <label className="grid gap-2">
          <span className="text-sm font-medium">Estado</span>
          <CertificationStatusSelect defaultValue={certification?.status} />
        </label>
      </div>
      <label className="grid gap-2">
        <span className="text-sm font-medium">Descripción</span>
        <Textarea
          defaultValue={certification?.description ?? ""}
          maxLength={1000}
          name="description"
          placeholder="Requisito operativo para impartir o cubrir clases concretas."
          rows={3}
        />
      </label>
      <div className="grid gap-2">
        <span className="text-sm font-medium">
          Entrenadores con esta certificación
        </span>
        <CoachAssignmentGrid activeCoachIds={activeCoachIds} coaches={coaches} />
      </div>
    </div>
  );
}

function CertificationCreateForm({
  coaches,
  organizationId,
}: {
  coaches: CoachOption[];
  organizationId: string;
}) {
  return (
    <Card>
      <CardContent className="space-y-4 py-5">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/10">
            <Plus aria-hidden="true" className="size-4" />
          </span>
          <div>
            <CardTitle>Crear certificación</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Define el requisito y marca qué entrenadores lo cumplen.
            </p>
          </div>
        </div>
        <form action={createCertification} className="space-y-4">
          <input name="organizationId" type="hidden" value={organizationId} />
          <CertificationFormFields coaches={coaches} />
          <Button type="submit">
            <Plus aria-hidden="true" />
            Crear certificación
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function CertificationCard({
  activeCoachIds,
  certification,
  coaches,
  organizationId,
}: {
  activeCoachIds: Set<string>;
  certification: CertificationRow;
  coaches: CoachOption[];
  organizationId: string;
}) {
  return (
    <Card size="sm">
      <CardContent className="space-y-4 px-5 py-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/10">
              <Award aria-hidden="true" className="size-5" />
            </span>
            <div className="min-w-0">
              <h3 className="truncate text-base font-semibold tracking-tight">
                {certification.title}
              </h3>
              {certification.description ? (
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                  {certification.description}
                </p>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">
                  Sin descripción.
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <CertificationStatusBadge status={certification.status} />
            <Badge variant="outline">
              {activeCoachIds.size === 1
                ? "1 entrenador"
                : `${activeCoachIds.size} entrenadores`}
            </Badge>
          </div>
        </div>

        <details className="group rounded-lg border border-border bg-muted/20 p-3">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium">
            Gestionar
            <span className="text-xs text-muted-foreground group-open:hidden">
              Abrir
            </span>
            <span className="hidden text-xs text-muted-foreground group-open:inline">
              Cerrar
            </span>
          </summary>
          <form action={updateCertification} className="mt-4 space-y-4">
            <input name="organizationId" type="hidden" value={organizationId} />
            <input
              name="certificationId"
              type="hidden"
              value={certification.id}
            />
            <CertificationFormFields
              activeCoachIds={activeCoachIds}
              certification={certification}
              coaches={coaches}
            />
            <Button type="submit">
              <Save aria-hidden="true" />
              Guardar cambios
            </Button>
          </form>
        </details>
      </CardContent>
    </Card>
  );
}

export default async function CertificationsPage({
  searchParams,
}: CertificationsPageProps) {
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect(getLoginPath("/app/certifications"));
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
        <PageHeader badge="Certificaciones" title="Certificaciones" />
        <OrganizationResolutionState
          basePath="/app/certifications"
          resolution={resolution}
        />
      </div>
    );
  }

  const canManage = canManageCertifications(resolution.membership.role);
  const roleLabel = getApplicationRoleLabel(resolution.membership.role);
  const basePath = getCertificationsPath({
    organizationId: resolution.organization.id,
  });

  if (!canManage) {
    return (
      <div className="space-y-6">
        <PageHeader
          badge="Certificaciones"
          description="Requisitos que determinan qué entrenadores pueden cubrir ciertas actividades."
          meta={
            <>
              <Badge variant="secondary">{resolution.organization.name}</Badge>
              <Badge variant="outline">{roleLabel}</Badge>
            </>
          }
          title="Certificaciones"
        />
        <Alert>
          <ShieldCheck aria-hidden="true" className="size-4" />
          <AlertTitle>Acceso reservado</AlertTitle>
          <AlertDescription>
            Solo propietarios y administradores pueden gestionar certificaciones.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const { certifications, coachCertifications, coaches } =
    await getCertificationContext(resolution.organization.id);
  const activeCoachIdsByCertification = new Map<string, Set<string>>();

  for (const coachCertification of coachCertifications) {
    if (coachCertification.status !== "active") {
      continue;
    }

    const activeCoachIds =
      activeCoachIdsByCertification.get(coachCertification.certification_id) ??
      new Set<string>();
    activeCoachIds.add(coachCertification.coach_profile_id);
    activeCoachIdsByCertification.set(
      coachCertification.certification_id,
      activeCoachIds,
    );
  }

  const activeCertifications = certifications.filter(
    (certification) => certification.status === "active",
  );
  const assignedCoachIds = new Set(
    coachCertifications
      .filter((coachCertification) => coachCertification.status === "active")
      .map((coachCertification) => coachCertification.coach_profile_id),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        badge="Certificaciones"
        description="Gestiona requisitos y qué entrenadores los tienen para filtrar asignaciones en horarios y plantillas."
        meta={
          <>
            <Badge variant="secondary">{resolution.organization.name}</Badge>
            <Badge variant="outline">{roleLabel}</Badge>
          </>
        }
        title="Certificaciones"
      />

      {status && successMessages[status] ? (
        <TransientFeedbackBanner
          description={successDescriptions[status]}
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

      <div className="grid gap-3 md:grid-cols-3">
        <Card size="sm">
          <CardContent className="flex items-center gap-3 py-4">
            <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Award aria-hidden="true" className="size-5" />
            </span>
            <div>
              <p className="text-2xl font-semibold">{certifications.length}</p>
              <p className="text-sm text-muted-foreground">Certificaciones</p>
            </div>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent className="flex items-center gap-3 py-4">
            <span className="flex size-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
              <CheckCircle2 aria-hidden="true" className="size-5" />
            </span>
            <div>
              <p className="text-2xl font-semibold">
                {activeCertifications.length}
              </p>
              <p className="text-sm text-muted-foreground">Activas</p>
            </div>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent className="flex items-center gap-3 py-4">
            <span className="flex size-10 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
              <UsersRound aria-hidden="true" className="size-5" />
            </span>
            <div>
              <p className="text-2xl font-semibold">{assignedCoachIds.size}</p>
              <p className="text-sm text-muted-foreground">
                Entrenadores certificados
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <CertificationCreateForm
        coaches={coaches}
        organizationId={resolution.organization.id}
      />

      <section className="space-y-4">
        <SectionHeader
          action={
            certifications.length > 0 ? (
              <Button asChild variant="outline">
                <Link href={basePath}>Ver actuales</Link>
              </Button>
            ) : null
          }
          description="Título, descripción, estado y entrenadores asignados."
          title="Lista de certificaciones"
        />

        {certifications.length === 0 ? (
          <EmptyState
            description="Crea la primera certificación para poder exigirla en tipos de actividad."
            title="No hay certificaciones todavía"
          />
        ) : (
          <div className="grid gap-2">
            {certifications.map((certification) => (
              <CertificationCard
                activeCoachIds={
                  activeCoachIdsByCertification.get(certification.id) ??
                  new Set<string>()
                }
                certification={certification}
                coaches={coaches}
                key={certification.id}
                organizationId={resolution.organization.id}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
