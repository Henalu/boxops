import { redirect } from "next/navigation";
import {
  Image as ImageIcon,
  LockKeyhole,
  Mail,
  MapPin,
  PenLine,
  Save,
  ShieldCheck,
  Upload,
  UserRound,
} from "lucide-react";

import {
  updateOwnAvatar,
  updateOwnPersonProfile,
  updateOwnSignature,
} from "./actions";
import { SignaturePadForm } from "./signature-pad-form";
import { MetaGrid, MetaItem } from "@/components/features/management-ui";
import {
  EmptyState,
  PageHeader,
  SectionHeader,
  StatusBadge,
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
import { getLoginPath } from "@/lib/auth/redirects";
import {
  canUsePersonalFeatures,
  getApplicationRoleLabel,
} from "@/lib/auth/permissions";
import {
  getActiveMemberships,
  getAuthenticatedUser,
  resolveActiveOrganization,
  type ActiveMembership,
} from "@/lib/auth/tenant";
import { getCoachProfileStatusLabel } from "@/lib/coaches";
import {
  AVATAR_MAX_SIZE_BYTES,
  AVATAR_SIGNED_URL_TTL_SECONDS,
  PROFILE_ASSETS_BUCKET,
  formatAvatarFileSize,
  getAvatarMimeLabel,
} from "@/lib/profile-assets";
import {
  PROFILE_SIGNATURES_BUCKET,
  SIGNATURE_SIGNED_URL_TTL_SECONDS,
  formatSignatureFileSize,
} from "@/lib/profile-signatures";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/supabase";

export const dynamic = "force-dynamic";

type AccountPageProps = {
  searchParams: Promise<{
    error?: string | string[];
    organizationId?: string | string[];
    status?: string | string[];
  }>;
};

type PersonProfileRow = Pick<
  Tables<"person_profiles">,
  | "display_name"
  | "full_name"
  | "id"
  | "preferred_alias"
  | "public_email"
  | "status"
  | "user_id"
  | "visibility_status"
>;

type CoachProfileRow = Pick<
  Tables<"coach_profiles">,
  | "id"
  | "person_profile_id"
  | "primary_center_id"
  | "status"
  | "updated_at"
  | "user_id"
>;

type CenterRow = Pick<Tables<"centers">, "id" | "name" | "status">;

type ProfileAssetRow = Pick<
  Tables<"profile_assets">,
  | "created_at"
  | "id"
  | "mime_type"
  | "size_bytes"
  | "status"
  | "storage_path"
  | "updated_at"
>;

type ProfileSignatureRow = Pick<
  Tables<"profile_signatures">,
  | "activated_at"
  | "created_at"
  | "height"
  | "id"
  | "mime_type"
  | "signature_version"
  | "size_bytes"
  | "status"
  | "storage_path"
  | "updated_at"
  | "width"
>;

type AvatarPreview = {
  asset: ProfileAssetRow | null;
  signedUrl: string | null;
};

type SignaturePreview = {
  signature: ProfileSignatureRow | null;
  signedUrl: string | null;
};

const successMessages: Record<string, string> = {
  "avatar-updated": "Avatar privado guardado.",
  "profile-updated": "Perfil visible guardado.",
  "signature-updated": "Firma privada guardada.",
};

const errorMessages: Record<string, string> = {
  "avatar-empty": "Selecciona una imagen antes de guardar el avatar.",
  "avatar-invalid-file": "No se ha podido leer el archivo de avatar.",
  "avatar-invalid-signature":
    "El archivo no parece coincidir con el formato de imagen declarado.",
  "avatar-save-failed": "No se ha podido guardar la metadata del avatar.",
  "avatar-too-large": "El avatar no puede superar 2 MB.",
  "avatar-unsupported-type": "Usa una imagen JPG, PNG o WebP.",
  "avatar-upload-failed":
    "No se ha podido subir el avatar al almacenamiento privado.",
  "display-name-too-long": "El nombre visible no puede superar 80 caracteres.",
  forbidden: "Tu rol no permite usar funciones personales en esta organización.",
  "invalid-public-email": "Usa un email público válido o deja el campo vacío.",
  "missing-display-name": "Indica un nombre visible.",
  no_active_memberships: "No hay accesos activos para este usuario.",
  organization_not_found: "La organización solicitada no está disponible.",
  organization_required: "Elige una organización antes de abrir Mi cuenta.",
  "preferred-alias-too-long": "El alias no puede superar 50 caracteres.",
  "profile-missing":
    "No hay un perfil visible vinculado a tu cuenta en esta organización.",
  "public-email-too-long": "El email público es demasiado largo.",
  "save-failed": "No se han podido guardar los cambios.",
  "signature-empty": "Dibuja tu firma antes de guardarla.",
  "signature-invalid-data": "No se ha podido leer la firma dibujada.",
  "signature-invalid-dimensions":
    "La firma dibujada no tiene dimensiones válidas.",
  "signature-invalid-signature":
    "La firma dibujada no parece ser una imagen PNG válida.",
  "signature-save-failed": "No se ha podido guardar la metadata de la firma.",
  "signature-too-large": "La firma dibujada es demasiado grande.",
  "signature-upload-failed":
    "No se ha podido subir la firma al almacenamiento privado.",
};

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function shortId(value: string) {
  return value.slice(0, 8);
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

function getVisibilityLabel(value: string) {
  return value === "internal" ? "Interno" : "Visible";
}

function getInitials(displayName: string) {
  const words = displayName
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean);

  if (words.length === 0) {
    return "TU";
  }

  return words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");
}

async function getOwnPersonProfile(organizationId: string, userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("person_profiles")
    .select(
      "id, user_id, full_name, display_name, preferred_alias, public_email, visibility_status, status",
    )
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not load own person profile: ${error.message}`);
  }

  return data satisfies PersonProfileRow | null;
}

async function getOwnCoachProfiles({
  organizationId,
  personProfileId,
  userId,
}: {
  organizationId: string;
  personProfileId: string | null;
  userId: string;
}) {
  const supabase = await createClient();
  let query = supabase
    .from("coach_profiles")
    .select(
      "id, user_id, person_profile_id, primary_center_id, status, updated_at",
    )
    .eq("organization_id", organizationId)
    .order("updated_at", { ascending: false });

  if (personProfileId) {
    query = query.or(`user_id.eq.${userId},person_profile_id.eq.${personProfileId}`);
  } else {
    query = query.eq("user_id", userId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Could not load own coach profile: ${error.message}`);
  }

  return data satisfies CoachProfileRow[];
}

async function getCentersById(organizationId: string, centerIds: string[]) {
  if (centerIds.length === 0) {
    return new Map<string, CenterRow>();
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("centers")
    .select("id, name, status")
    .eq("organization_id", organizationId)
    .in("id", centerIds);

  if (error) {
    throw new Error(`Could not load own coach centers: ${error.message}`);
  }

  return new Map(data.map((center) => [center.id, center satisfies CenterRow]));
}

async function getOwnActiveAvatarPreview({
  organizationId,
  personProfileId,
}: {
  organizationId: string;
  personProfileId: string | null;
}): Promise<AvatarPreview> {
  if (!personProfileId) {
    return {
      asset: null,
      signedUrl: null,
    };
  }

  const supabase = await createClient();
  const { data: asset, error } = await supabase
    .from("profile_assets")
    .select(
      "id, storage_path, mime_type, size_bytes, status, created_at, updated_at",
    )
    .eq("organization_id", organizationId)
    .eq("person_profile_id", personProfileId)
    .eq("asset_type", "avatar")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .maybeSingle();

  if (error) {
    throw new Error(`Could not load own avatar asset: ${error.message}`);
  }

  if (!asset) {
    return {
      asset: null,
      signedUrl: null,
    };
  }

  const { data: signedUrlData, error: signedUrlError } = await supabase.storage
    .from(PROFILE_ASSETS_BUCKET)
    .createSignedUrl(asset.storage_path, AVATAR_SIGNED_URL_TTL_SECONDS);

  return {
    asset: asset satisfies ProfileAssetRow,
    signedUrl: signedUrlError ? null : (signedUrlData?.signedUrl ?? null),
  };
}

async function getOwnActiveSignaturePreview({
  organizationId,
  personProfileId,
}: {
  organizationId: string;
  personProfileId: string | null;
}): Promise<SignaturePreview> {
  if (!personProfileId) {
    return {
      signature: null,
      signedUrl: null,
    };
  }

  const supabase = await createClient();
  const { data: signature, error } = await supabase
    .from("profile_signatures")
    .select(
      "id, storage_path, mime_type, size_bytes, width, height, signature_version, status, activated_at, created_at, updated_at",
    )
    .eq("organization_id", organizationId)
    .eq("person_profile_id", personProfileId)
    .eq("status", "active")
    .order("signature_version", { ascending: false })
    .maybeSingle();

  if (error) {
    throw new Error(`Could not load own profile signature: ${error.message}`);
  }

  if (!signature) {
    return {
      signature: null,
      signedUrl: null,
    };
  }

  const { data: signedUrlData, error: signedUrlError } = await supabase.storage
    .from(PROFILE_SIGNATURES_BUCKET)
    .createSignedUrl(signature.storage_path, SIGNATURE_SIGNED_URL_TTL_SECONDS);

  return {
    signature: signature satisfies ProfileSignatureRow,
    signedUrl: signedUrlError ? null : (signedUrlData?.signedUrl ?? null),
  };
}

function AccountSummaryCard({
  membership,
  userEmail,
  userId,
}: {
  membership: ActiveMembership;
  userEmail: string | null | undefined;
  userId: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck aria-hidden="true" className="size-4" />
          Cuenta Auth
        </CardTitle>
        <CardDescription>
          Identidad de acceso gestionada por Supabase Auth.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <MetaGrid className="lg:grid-cols-2">
          <MetaItem label="Email de acceso">
            {userEmail ?? "Email no disponible"}
          </MetaItem>
          <MetaItem label="Usuario" mono>
            {shortId(userId)}
          </MetaItem>
          <MetaItem label="Organización">
            {membership.organization.name}
          </MetaItem>
          <MetaItem label="Rol">
            {getApplicationRoleLabel(membership.role)}
          </MetaItem>
        </MetaGrid>
      </CardContent>
    </Card>
  );
}

function PersonProfileForm({
  avatarPreview,
  organizationId,
  profile,
  timezone,
}: {
  avatarPreview: AvatarPreview;
  organizationId: string;
  profile: PersonProfileRow;
  timezone: string;
}) {
  const initials = getInitials(profile.display_name);
  const hasAvatar = Boolean(avatarPreview.asset);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserRound aria-hidden="true" className="size-4" />
          Perfil visible
        </CardTitle>
        <CardDescription>
          Datos operativos que pueden aparecer dentro de la organización.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <form action={updateOwnPersonProfile} className="grid gap-4">
          <input name="organizationId" type="hidden" value={organizationId} />

          <div className="grid gap-4 lg:grid-cols-2">
            <label className="grid gap-2">
              <span className="text-sm font-medium">Nombre visible</span>
              <Input
                defaultValue={profile.display_name}
                maxLength={80}
                name="displayName"
                required
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium">Alias</span>
              <Input
                defaultValue={profile.preferred_alias ?? ""}
                maxLength={50}
                name="preferredAlias"
                placeholder="Opcional"
              />
            </label>

            <label className="grid gap-2 lg:col-span-2">
              <span className="text-sm font-medium">Email público</span>
              <Input
                defaultValue={profile.public_email ?? ""}
                maxLength={254}
                name="publicEmail"
                placeholder="Opcional"
                type="email"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit">
              <Save aria-hidden="true" />
              Guardar perfil
            </Button>
            <StatusBadge tone="neutral">
              {getVisibilityLabel(profile.visibility_status)}
            </StatusBadge>
          </div>
        </form>

        <Alert>
          <LockKeyhole aria-hidden="true" className="size-4" />
          <AlertTitle>Avatar privado</AlertTitle>
          <AlertDescription>
            La imagen se guarda de forma privada para esta organización. No se
            publica como enlace permanente.
          </AlertDescription>
        </Alert>

        <div className="grid gap-4 rounded-lg border border-border bg-muted/25 p-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start">
          <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-primary/10 text-lg font-semibold text-primary">
            {avatarPreview.signedUrl ? (
              // Private signed URLs are short-lived and not configured as remote image domains.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt={`Avatar de ${profile.display_name}`}
                className="size-full object-cover"
                src={avatarPreview.signedUrl}
              />
            ) : hasAvatar ? (
              <ImageIcon aria-hidden="true" className="size-7" />
            ) : (
              <span aria-hidden="true">{initials}</span>
            )}
          </div>

          <div className="min-w-0 space-y-4">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold tracking-tight">
                Foto de perfil
              </h3>
              <p className="text-sm text-muted-foreground">
                {hasAvatar
                  ? "Avatar activo, disponible solo con acceso temporal."
                  : "Sin avatar guardado. Se muestra un fallback visual."}
              </p>
              {avatarPreview.asset ? (
                <p className="text-xs text-muted-foreground">
                  {getAvatarMimeLabel(avatarPreview.asset.mime_type)} -{" "}
                  {formatAvatarFileSize(avatarPreview.asset.size_bytes)} -{" "}
                  actualizado{" "}
                  {formatDate(avatarPreview.asset.updated_at, timezone)}
                </p>
              ) : null}
            </div>

            <form
              action={updateOwnAvatar}
              className="grid gap-3"
            >
              <input name="organizationId" type="hidden" value={organizationId} />
              <label className="grid gap-2">
                <span className="text-sm font-medium">Nueva imagen</span>
                <Input
                  accept="image/jpeg,image/png,image/webp"
                  name="avatar"
                  required
                  type="file"
                />
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="submit" variant="outline">
                  <Upload aria-hidden="true" />
                  {hasAvatar ? "Reemplazar avatar" : "Guardar avatar"}
                </Button>
                <span className="text-xs text-muted-foreground">
                  JPG, PNG o WebP hasta{" "}
                  {formatAvatarFileSize(AVATAR_MAX_SIZE_BYTES)}.
                </span>
              </div>
            </form>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PersonProfileMissingCard() {
  return (
    <EmptyState
      description="Tu cuenta tiene acceso a la organización, pero todavía no hay un perfil de persona vinculado a tu usuario. Propietario o Administrador pueden vincularlo desde Equipo."
      title="Perfil visible pendiente"
    />
  );
}

function CoachProfileCard({
  center,
  profile,
  timezone,
}: {
  center?: CenterRow;
  profile: CoachProfileRow;
  timezone: string;
}) {
  return (
    <Card size="sm">
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold tracking-tight">
              Ficha operativa
            </h3>
            <p className="mt-1 truncate text-sm text-muted-foreground">
              Perfil {shortId(profile.id)}
            </p>
          </div>
          <Badge variant={profile.status === "active" ? "secondary" : "outline"}>
            {getCoachProfileStatusLabel(profile.status)}
          </Badge>
        </div>

        <MetaGrid className="lg:grid-cols-3">
          <MetaItem label="Centro principal">
            {center ? (
              <>
                {center.name}
                {center.status === "inactive" ? " (inactivo)" : ""}
              </>
            ) : (
              "Sin centro principal"
            )}
          </MetaItem>
          <MetaItem label="Cuenta vinculada">
            {profile.user_id ? "Si" : "Pendiente"}
          </MetaItem>
          <MetaItem label="Actualizado">
            {formatDate(profile.updated_at, timezone)}
          </MetaItem>
        </MetaGrid>
      </CardContent>
    </Card>
  );
}

function CoachProfileSection({
  centersById,
  profiles,
  timezone,
}: {
  centersById: Map<string, CenterRow>;
  profiles: CoachProfileRow[];
  timezone: string;
}) {
  return (
    <section className="space-y-3">
      <SectionHeader
        action={<Badge variant="outline">{profiles.length} fichas</Badge>}
        description="Capacidad operativa propia, en lectura."
        title="Perfil de entrenador"
      />

      {profiles.length === 0 ? (
        <EmptyState
          description="No tienes una ficha de entrenador vinculada a esta cuenta en la organización activa."
          title="Sin ficha operativa"
        />
      ) : (
        <div className="grid gap-3">
          {profiles.map((profile) => (
            <CoachProfileCard
              center={
                profile.primary_center_id
                  ? centersById.get(profile.primary_center_id)
                  : undefined
              }
              key={profile.id}
              profile={profile}
              timezone={timezone}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function SignatureCard({
  organizationId,
  profile,
  signaturePreview,
  timezone,
}: {
  organizationId: string;
  profile: PersonProfileRow;
  signaturePreview: SignaturePreview;
  timezone: string;
}) {
  const hasSignature = Boolean(signaturePreview.signature);

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PenLine aria-hidden="true" className="size-4" />
          Mi firma
        </CardTitle>
        <CardDescription>
          Confirmación interna reutilizable solo en esta organización.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <LockKeyhole aria-hidden="true" className="size-4" />
          <AlertTitle>Firma privada de esta organización</AlertTitle>
          <AlertDescription>
            Sirve para confirmar acciones internas. No sustituye una firma
            electrónica avanzada ni cualificada, y no firma documentos.
          </AlertDescription>
        </Alert>

        <div className="rounded-lg border border-border bg-muted/25 p-4">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold tracking-tight">
                Firma guardada
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {hasSignature
                  ? "Firma activa disponible solo con acceso temporal."
                  : "Aún no tienes una firma guardada en esta organización."}
              </p>
            </div>
            {signaturePreview.signature ? (
              <Badge variant="outline">
                v{signaturePreview.signature.signature_version}
              </Badge>
            ) : null}
          </div>

          <div className="flex min-h-28 items-center justify-center rounded-lg border border-dashed border-border bg-background p-3">
            {signaturePreview.signedUrl ? (
              // Private signed URLs are short-lived and not configured as remote image domains.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt={`Firma de ${profile.display_name}`}
                className="max-h-24 w-full object-contain"
                src={signaturePreview.signedUrl}
              />
            ) : hasSignature ? (
              <PenLine
                aria-hidden="true"
                className="size-8 text-muted-foreground"
              />
            ) : (
              <span className="text-sm text-muted-foreground">
                Sin firma guardada
              </span>
            )}
          </div>

          {signaturePreview.signature ? (
            <p className="mt-3 text-xs text-muted-foreground">
              PNG -{" "}
              {formatSignatureFileSize(signaturePreview.signature.size_bytes)}{" "}
              - actualizado{" "}
              {formatDate(signaturePreview.signature.updated_at, timezone)}
            </p>
          ) : null}
        </div>

        <SignaturePadForm
          action={updateOwnSignature}
          hasSignature={hasSignature}
          organizationId={organizationId}
        />

        <p className="text-xs leading-5 text-muted-foreground">
          En una fase futura, cualquier documento firmado debera guardar su
          propio snapshot. Cambiar Mi firma no modificara esos snapshots.
        </p>
      </CardContent>
    </Card>
  );
}

export default async function AccountPage({ searchParams }: AccountPageProps) {
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect(getLoginPath("/app/account"));
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
          badge="Área personal"
          description="Cuenta propia y perfil visible dentro de la organización."
          title="Mi cuenta"
        />
        <OrganizationResolutionState
          basePath="/app/account"
          resolution={resolution}
        />
      </div>
    );
  }

  const canUsePersonalArea = canUsePersonalFeatures(resolution.membership.role);

  if (!canUsePersonalArea) {
    return (
      <div className="space-y-6">
        <PageHeader badge="Área personal" title="Mi cuenta" />
        <Alert variant="destructive">
          <AlertTitle>No puedes abrir esta área</AlertTitle>
          <AlertDescription>
            Tu rol actual no tiene funciones personales activas.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const personProfile = await getOwnPersonProfile(
    resolution.organization.id,
    user.id,
  );
  const [avatarPreview, signaturePreview] = await Promise.all([
    getOwnActiveAvatarPreview({
      organizationId: resolution.organization.id,
      personProfileId: personProfile?.id ?? null,
    }),
    getOwnActiveSignaturePreview({
      organizationId: resolution.organization.id,
      personProfileId: personProfile?.id ?? null,
    }),
  ]);
  const coachProfiles = await getOwnCoachProfiles({
    organizationId: resolution.organization.id,
    personProfileId: personProfile?.id ?? null,
    userId: user.id,
  });
  const centerIds = [
    ...new Set(
      coachProfiles.flatMap((profile) =>
        profile.primary_center_id ? [profile.primary_center_id] : [],
      ),
    ),
  ];
  const centersById = await getCentersById(
    resolution.organization.id,
    centerIds,
  );
  const roleLabel = getApplicationRoleLabel(resolution.membership.role);

  return (
    <div className="space-y-6">
      <PageHeader
        badge="Área personal"
        meta={
          <>
            <Badge variant="secondary">{resolution.organization.name}</Badge>
            <Badge variant="outline">Rol {roleLabel}</Badge>
          </>
        }
        title="Mi cuenta"
      >
        <details className="group max-w-3xl">
          <summary className="cursor-pointer list-none text-sm leading-6 text-muted-foreground outline-none focus-visible:rounded-md focus-visible:ring-3 focus-visible:ring-ring/50 md:text-base [&::-webkit-details-marker]:hidden">
            <span>
              Gestiona tu acceso, tu perfil visible, tu avatar y tu firma dentro
              de esta organización.
            </span>{" "}
            <span className="inline-flex font-medium text-foreground underline underline-offset-4 group-open:hidden">
              Más
            </span>
            <span className="hidden font-medium text-foreground underline underline-offset-4 group-open:inline-flex">
              Menos
            </span>
          </summary>

          <Alert className="mt-3">
            <ShieldCheck aria-hidden="true" className="size-4" />
            <AlertTitle>Datos personales básicos</AlertTitle>
            <AlertDescription>
              Aquí solo verás información de cuenta y perfil. Los datos
              laborales sensibles se gestionarán en módulos separados con
              permisos específicos.
            </AlertDescription>
          </Alert>
        </details>
      </PageHeader>

      {status && successMessages[status] ? (
        <Alert>
          <AlertTitle>{successMessages[status]}</AlertTitle>
          <AlertDescription>
            Los cambios se aplican solo a tu perfil visible de esta organización.
          </AlertDescription>
        </Alert>
      ) : null}

      {error && errorMessages[error] ? (
        <Alert variant="destructive">
          <AlertTitle>No se han guardado los cambios</AlertTitle>
          <AlertDescription>{errorMessages[error]}</AlertDescription>
        </Alert>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.15fr)]">
        <AccountSummaryCard
          membership={resolution.membership}
          userEmail={user.email}
          userId={user.id}
        />

        {personProfile ? (
          <PersonProfileForm
            avatarPreview={avatarPreview}
            organizationId={resolution.organization.id}
            profile={personProfile}
            timezone={resolution.organization.timezone}
          />
        ) : (
          <PersonProfileMissingCard />
        )}
      </section>

      <CoachProfileSection
        centersById={centersById}
        profiles={coachProfiles}
        timezone={resolution.organization.timezone}
      />

      <section className="grid gap-4 lg:grid-cols-2">
        {personProfile ? (
          <SignatureCard
            organizationId={resolution.organization.id}
            profile={personProfile}
            signaturePreview={signaturePreview}
            timezone={resolution.organization.timezone}
          />
        ) : (
          <PersonProfileMissingCard />
        )}

        <Card size="sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail aria-hidden="true" className="size-4" />
              Información laboral sensible
            </CardTitle>
            <CardDescription>
              No se muestra en esta pantalla.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Alert>
              <MapPin aria-hidden="true" className="size-4" />
              <AlertTitle>No disponible aquí</AlertTitle>
              <AlertDescription>
                Puesto legal, antigüedad laboral, jornada, salario, contrato,
                documentos y datos bancarios necesitarán modelo y permisos
                específicos.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
