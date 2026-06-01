import Link from "next/link";
import { redirect } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  BriefcaseBusiness,
  CalendarClock,
  Image as ImageIcon,
  Info,
  KeyRound,
  LockKeyhole,
  PenLine,
  Save,
  ShieldCheck,
  Upload,
  UserCheck,
  UserRound,
  UsersRound,
} from "lucide-react";

import {
  updateOwnAvatar,
  updateOwnPersonProfile,
  updateOwnSignature,
} from "./actions";
import { SignaturePadForm } from "./signature-pad-form";
import { MetaGrid, MetaItem } from "@/components/features/management-ui";
import {
  PageHeader,
  StatusBadge,
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
    <Card className="h-full">
      <CardContent className="flex h-full flex-col gap-6 py-2">
        <div className="flex min-w-0 gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15">
            <ShieldCheck aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0 space-y-1">
            <CardTitle>Acceso a tu cuenta</CardTitle>
            <CardDescription>
              Consulta tu email de acceso, organización activa y rol.
            </CardDescription>
          </div>
        </div>

        <MetaGrid className="gap-x-8 gap-y-5 lg:grid-cols-2">
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
            <Badge variant="secondary">
              {getApplicationRoleLabel(membership.role)}
            </Badge>
          </MetaItem>
        </MetaGrid>

        <div className="mt-auto pt-1">
          <Button asChild variant="outline">
            <Link href="/reset-password">
              <KeyRound aria-hidden="true" />
              Cambiar contraseña
            </Link>
          </Button>
        </div>
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
    <Card className="h-full">
      <CardHeader className="border-b border-border/70 pb-4">
        <div className="flex min-w-0 gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15">
            <UserRound aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0 space-y-1">
            <CardTitle>Perfil visible</CardTitle>
            <CardDescription>
              Así te verá el equipo dentro de BoxOps.
            </CardDescription>
          </div>
        </div>
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
            <Button asChild variant="outline">
              <Link href="#avatar-privado">
                <ImageIcon aria-hidden="true" />
                Avatar
              </Link>
            </Button>
            <StatusBadge tone="neutral">
              {getVisibilityLabel(profile.visibility_status)}
            </StatusBadge>
          </div>
        </form>
      </CardContent>

      <CardContent
        className="space-y-4 border-t border-border/70 bg-muted/20 pt-4"
        id="avatar-privado"
      >
        <div className="flex min-w-0 gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-background text-primary ring-1 ring-border">
            <LockKeyhole aria-hidden="true" className="size-4" />
          </span>
          <div className="min-w-0 space-y-1">
            <h3 className="text-sm font-semibold tracking-tight">
              Avatar privado
            </h3>
            <p className="text-sm leading-5 text-muted-foreground">
              Tu foto ayuda al equipo a reconocerte. No se muestra como perfil
              público.
            </p>
          </div>
        </div>

        <div className="grid gap-4 rounded-xl border border-border bg-background/70 p-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start">
          <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-primary/10 text-xl font-semibold text-primary">
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

            <form action={updateOwnAvatar} className="grid gap-3">
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

function PersonProfileMissingCard({
  hasLinkedCoachProfile = false,
}: {
  hasLinkedCoachProfile?: boolean;
}) {
  const title = hasLinkedCoachProfile
    ? "Ficha pendiente de vinculación"
    : "Vinculación pendiente";
  const description = hasLinkedCoachProfile
    ? "Tu cuenta ya tiene una ficha de entrenador asociada, pero falta enlazarla con tu persona visible. Pide a un Propietario o Administrador que complete la vinculacion desde Equipo."
    : "Tu cuenta tiene acceso a la organización, pero todavía no está vinculada con una persona visible del equipo. Pide a un Propietario o Administrador que lo revise desde Equipo.";

  return (
    <Card>
      <CardContent className="flex min-h-48 flex-col items-start justify-center gap-3 py-8">
        <span className="flex size-11 items-center justify-center rounded-xl bg-amber-50 text-amber-700 ring-1 ring-amber-200">
          <UserCheck aria-hidden="true" className="size-5" />
        </span>
        <div className="max-w-2xl space-y-1">
          <CardTitle>{title}</CardTitle>
          <CardDescription className="leading-6">{description}</CardDescription>
        </div>
      </CardContent>
    </Card>
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
    <div className="grid gap-4 p-4 lg:grid-cols-[minmax(220px,0.8fr)_minmax(0,1.8fr)] lg:items-center">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15">
          <UserCheck aria-hidden="true" className="size-5" />
        </span>
        <div className="min-w-0 space-y-2">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold tracking-tight">
              Ficha operativa
            </h3>
            <p className="mt-1 truncate text-sm text-muted-foreground">
              {shortId(profile.id)}
            </p>
          </div>
          <Badge variant={profile.status === "active" ? "secondary" : "outline"}>
            {getCoachProfileStatusLabel(profile.status)}
          </Badge>
        </div>
      </div>

      <MetaGrid className="gap-x-8 gap-y-4 md:grid-cols-3">
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
          {profile.user_id ? "Sí" : "Pendiente"}
        </MetaItem>
        <MetaItem label="Actualizado">
          {formatDate(profile.updated_at, timezone)}
        </MetaItem>
      </MetaGrid>
    </div>
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
    <Card>
      <CardContent className="space-y-4 py-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15">
              <UsersRound aria-hidden="true" className="size-5" />
            </span>
            <div className="min-w-0 space-y-1">
              <CardTitle>Perfil de entrenador</CardTitle>
              <CardDescription>
                Tus fichas de entrenador vinculadas a esta cuenta.
              </CardDescription>
            </div>
          </div>
          <Badge variant="outline">{profiles.length} fichas</Badge>
        </div>

        {profiles.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/20 p-5">
            <p className="text-sm font-medium">Sin ficha operativa</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              No tienes una ficha de entrenador vinculada a esta cuenta en la
              organización activa.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-background/70">
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
      </CardContent>
    </Card>
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
    <Card className="h-full" size="sm">
      <CardHeader>
        <div className="flex min-w-0 gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15">
            <PenLine aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0 space-y-1">
            <CardTitle>Mi firma</CardTitle>
            <CardDescription>
              Confirmación interna reutilizable solo en esta organización.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-3 rounded-xl border border-border bg-muted/20 p-4">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-background text-primary ring-1 ring-border">
            <LockKeyhole aria-hidden="true" className="size-4" />
          </span>
          <div className="min-w-0 space-y-1">
            <h3 className="text-sm font-semibold tracking-tight">
              Firma privada de esta organización
            </h3>
            <p className="text-sm leading-5 text-muted-foreground">
              Sirve para confirmar acciones internas. No sustituye una firma
              electrónica avanzada ni cualificada, y no firma documentos.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-background/70 p-4">
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

          <div className="flex min-h-28 items-center justify-center rounded-lg border border-dashed border-border bg-muted/15 p-3">
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

        <div className="rounded-xl border border-dashed border-border bg-background/70 p-3">
          <SignaturePadForm
            action={updateOwnSignature}
            hasSignature={hasSignature}
            organizationId={organizationId}
          />
        </div>

        <div className="rounded-lg bg-muted/30 px-3 py-2 text-xs leading-5 text-muted-foreground">
          En una fase futura, cualquier documento firmado deberá guardar su
          propio snapshot. Cambiar Mi firma no modificará esos snapshots.
        </div>
      </CardContent>
    </Card>
  );
}

function LaborDataCard() {
  const items: Array<{
    icon: LucideIcon;
    label: string;
    value: string;
  }> = [
    {
      icon: BriefcaseBusiness,
      label: "Puesto",
      value: "Por configurar",
    },
    {
      icon: CalendarClock,
      label: "Antigüedad",
      value: "Por configurar",
    },
    {
      icon: UserCheck,
      label: "Jornada",
      value: "Por configurar",
    },
  ];

  return (
    <Card className="h-full" size="sm">
      <CardHeader>
        <div className="flex min-w-0 gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15">
            <BriefcaseBusiness aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0 space-y-1">
            <CardTitle>Datos laborales</CardTitle>
            <CardDescription>
              Puesto, antigüedad y jornada aparecerán aquí cuando el módulo
              laboral esté activado.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          {items.map((item) => {
            const Icon = item.icon;

            return (
              <div
                className="rounded-xl border border-border bg-muted/20 p-3"
                key={item.label}
              >
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <Icon aria-hidden="true" className="size-3.5" />
                  {item.label}
                </div>
                <p className="mt-2 text-sm font-medium">{item.value}</p>
              </div>
            );
          })}
        </div>

        <div className="rounded-xl border border-border bg-background/70 p-4">
          <div className="flex gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground ring-1 ring-border">
              <LockKeyhole aria-hidden="true" className="size-4" />
            </span>
            <div className="min-w-0 space-y-2">
              <h3 className="text-sm font-semibold tracking-tight">
                Desbloqueo seguro pendiente
              </h3>
              <p className="text-sm leading-6 text-muted-foreground">
                El botón para ver datos protegidos debe pedir reautenticación
                real y leer desde un modelo con permisos y auditoría. Salario,
                contratos, documentos y datos bancarios irán en una vista
                separada.
              </p>
              <Button asChild className="w-full justify-start" variant="outline">
                <Link href="#account-help">
                  <Info aria-hidden="true" />
                  Más información
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AccountHelpNote() {
  return (
    <Alert
      className="border-blue-200 bg-blue-50 text-blue-950"
      id="account-help"
    >
      <Info aria-hidden="true" className="size-4 text-blue-700" />
      <AlertTitle>Importante</AlertTitle>
      <AlertDescription className="leading-6 text-blue-900/85">
        Esta pantalla solo gestiona tu identidad visible, avatar privado y firma
        interna dentro de la organización activa. Los datos sensibles futuros
        irán en vistas separadas con permisos propios.
      </AlertDescription>
    </Alert>
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
        actions={
          <Button asChild variant="outline">
            <Link href="#account-help">
              <Info aria-hidden="true" />
              Más información
            </Link>
          </Button>
        }
        badge="Área personal"
        description="Gestiona tu acceso, tu perfil visible, tu avatar y tu firma dentro de esta organización."
        meta={
          <>
            <Badge variant="secondary">{resolution.organization.name}</Badge>
            <Badge variant="outline">{roleLabel}</Badge>
          </>
        }
        title="Mi cuenta"
      />

      {status && successMessages[status] ? (
        <TransientFeedbackBanner
          description="Los cambios se aplican a tu perfil visible de esta organización."
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
          <PersonProfileMissingCard
            hasLinkedCoachProfile={coachProfiles.length > 0}
          />
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
          <PersonProfileMissingCard
            hasLinkedCoachProfile={coachProfiles.length > 0}
          />
        )}

        <LaborDataCard />
      </section>

      <AccountHelpNote />
    </div>
  );
}
