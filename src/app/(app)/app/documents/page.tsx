import Link from "next/link";
import { redirect } from "next/navigation";
import type React from "react";
import {
  Archive,
  Download,
  Eye,
  FileText,
  FolderOpen,
  Info,
  LockKeyhole,
  Plus,
  type LucideIcon,
} from "lucide-react";

import { createDocumentWithInitialFileUpload } from "./actions";
import { DocumentUploadSubmitButton } from "./document-upload-submit-button";
import { OrganizationResolutionState } from "@/components/features/organization-resolution-state";
import { PageHeader } from "@/components/features/operations-ui";
import { TransientFeedbackBanner } from "@/components/features/transient-feedback-banner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getLoginPath } from "@/lib/auth/redirects";
import { getApplicationRoleLabel } from "@/lib/auth/permissions";
import {
  getActiveMemberships,
  getAuthenticatedUser,
  resolveActiveOrganization,
} from "@/lib/auth/tenant";
import {
  DOCUMENT_REPOSITORY_SCOPES,
  DOCUMENT_UPLOAD_ACCEPT,
  DOCUMENT_UPLOAD_MAX_SIZE_BYTES,
  DOCUMENT_UPLOAD_SCOPES,
  canCreateMinimalDocumentUpload,
  isDocumentUploadScope,
  listAccessibleDocumentVersions,
  normalizeDocumentRepositoryScope,
  type DocumentRepositoryEntry,
  type DocumentRepositoryScope,
  type DocumentUploadScope,
} from "@/lib/documents";
import { getDocumentsPath, getSchedulePath } from "@/lib/navigation/app-paths";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type DocumentsPageProps = {
  searchParams: Promise<{
    organizationId?: string | string[];
    scope?: string | string[];
    error?: string | string[];
    status?: string | string[];
  }>;
};

const scopeLabels: Record<DocumentRepositoryScope, string> = {
  certification: "Certificaciones",
  company: "Empresa",
  management_private: "Gestion",
  person_private: "Persona",
  programming: "Programacion",
};

const scopeDescriptions: Record<DocumentRepositoryScope, string> = {
  certification: "Cursos, titulos y adjuntos autorizados.",
  company: "Documentos internos de empresa visibles por rol o permiso.",
  management_private: "Documentos de gestión con permiso explícito.",
  person_private: "Documentos asociados a tu persona o autorizados para tu rol.",
  programming: "Programacion y material asociado al horario.",
};

const successMessages: Record<string, string> = {
  "document-uploaded": "Documento creado y archivo adjuntado.",
};

const errorMessages: Record<string, string> = {
  "activation-failed": "El archivo se recibio, pero no se pudo activar la version.",
  "file-content-mismatch": "El contenido no coincide con el tipo de archivo declarado.",
  "file-empty": "Adjunta un archivo antes de crear el documento.",
  "file-extension-mismatch": "La extension no coincide con el tipo de archivo.",
  "file-name-invalid": "Usa un nombre de archivo simple, sin rutas ni barras.",
  "file-read-failed": "No se pudo leer el archivo completo.",
  "file-too-large": "El archivo supera el tamaño máximo permitido.",
  "file-type-not-allowed": "Ese tipo de archivo no está permitido en este corte.",
  forbidden: "Tu rol no permite crear documentos desde esta pantalla.",
  "invalid-scope": "El ámbito documental no está disponible para subida.",
  "invalid-title": "Usa un titulo entre 1 y 160 caracteres.",
  "metadata-save-failed": "No se pudo guardar la metadata documental.",
  no_active_memberships: "No hay accesos activos para este usuario.",
  organization_not_found: "La organización solicitada no está disponible.",
  organization_required: "Elige una organización antes de gestionar documentos.",
  "upload-failed": "No se pudo subir el archivo al almacenamiento privado.",
  "upload-start-failed": "No se pudo preparar la version documental.",
};

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatDate(value: string | null) {
  if (!value) {
    return "Sin fecha";
  }

  try {
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function formatFileSize(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return "Tamano no disponible";
  }

  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 * 1024) {
    return `${Math.round(value / 102.4) / 10} KB`;
  }

  return `${Math.round(value / 104_857.6) / 10} MB`;
}

function getDocumentVersionRouteHref({
  documentId,
  documentVersionId,
  mode,
  organizationId,
}: {
  documentId: string;
  documentVersionId: string;
  mode: "download" | "preview";
  organizationId: string;
}) {
  const params = new URLSearchParams({ organizationId });

  return `/app/documents/${documentId}/versions/${documentVersionId}/${mode}?${params.toString()}`;
}

function getAccessLabel(entry: DocumentRepositoryEntry) {
  if (entry.can_download) {
    return "Descarga";
  }

  if (entry.can_preview) {
    return "Preview";
  }

  return "Solo metadata";
}

function formatUploadLimit() {
  return `${DOCUMENT_UPLOAD_MAX_SIZE_BYTES / (1024 * 1024)} MB`;
}

function getDefaultUploadScope(
  selectedScope: DocumentRepositoryScope | null,
): DocumentUploadScope {
  return selectedScope && isDocumentUploadScope(selectedScope)
    ? selectedScope
    : "company";
}

type DocumentSummaryTone = "download" | "preview" | "visible";

const documentSummaryToneClasses: Record<DocumentSummaryTone, string> = {
  download: "bg-violet-50 text-violet-700 ring-violet-200/80",
  preview: "bg-blue-50 text-blue-700 ring-blue-200/80",
  visible: "bg-emerald-50 text-emerald-700 ring-emerald-200/80",
};

function DocumentSummaryCard({
  description,
  icon: Icon,
  label,
  tone,
  value,
}: {
  description: string;
  icon: LucideIcon;
  label: string;
  tone: DocumentSummaryTone;
  value: number;
}) {
  return (
    <Card size="sm">
      <CardContent className="flex min-h-36 flex-col gap-4">
        <div className="flex items-start">
          <span
            className={cn(
              "flex size-11 shrink-0 items-center justify-center rounded-xl ring-1",
              documentSummaryToneClasses[tone],
            )}
          >
            <Icon aria-hidden="true" className="size-5" />
          </span>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="font-mono text-3xl font-semibold leading-none tracking-tight">
            {value}
          </p>
        </div>
        <p className="mt-auto text-sm leading-5 text-muted-foreground">
          {description}
        </p>
      </CardContent>
    </Card>
  );
}

function DocumentUploadPanel({ children }: { children: React.ReactNode }) {
  const allowedTypes = ["PDF", "PNG", "JPG", "TXT", "CSV"];

  return (
    <section className="scroll-mt-24" id="document-upload">
      <Card className="border border-dashed border-primary/25 bg-card/95 shadow-sm">
        <CardContent className="grid gap-5 py-2 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.95fr)] lg:items-start">
          <div className="flex min-w-0 gap-4">
            <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/15">
              <Plus aria-hidden="true" className="size-6" />
            </span>
            <div className="min-w-0 space-y-3">
              <div className="space-y-1">
                <h2 className="text-lg font-semibold tracking-tight">
                  Subir documento
                </h2>
                <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                  Sube un PDF, imagen, TXT o CSV para dejarlo disponible en
                  este espacio según el ámbito elegido.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {allowedTypes.map((type) => (
                  <Badge key={type} variant="outline">
                    {type}
                  </Badge>
                ))}
                <span className="h-4 w-px bg-border" aria-hidden="true" />
                <span className="text-sm text-muted-foreground">
                  Máximo {formatUploadLimit()}
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-background/80 p-4 shadow-sm">
            {children}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function DocumentRepositoryHeader({
  metadataOnlyCount,
  selectedScope,
}: {
  metadataOnlyCount: number;
  selectedScope: DocumentRepositoryScope | null;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 space-y-1">
        <h2 className="text-xl font-semibold tracking-tight">Repositorio</h2>
        <p className="text-sm leading-6 text-muted-foreground">
          {selectedScope
            ? scopeDescriptions[selectedScope]
            : "Todos los archivos visibles para tu rol."}
        </p>
      </div>
      <Badge className="w-fit" variant="outline">
        {metadataOnlyCount} solo metadata
      </Badge>
    </div>
  );
}

function DocumentRepositoryEmptyState({
  canCreateDocuments,
  organizationId,
  selectedScope,
}: {
  canCreateDocuments: boolean;
  organizationId: string;
  selectedScope: DocumentRepositoryScope | null;
}) {
  return (
    <Card>
      <CardContent className="flex min-h-80 flex-col items-center justify-center gap-5 py-10 text-center">
        <span className="relative flex size-20 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/15">
          <FolderOpen aria-hidden="true" className="size-9" />
          <span className="absolute -right-1 bottom-2 flex size-6 items-center justify-center rounded-full bg-emerald-600 text-white ring-2 ring-card">
            <Archive aria-hidden="true" className="size-3.5" />
          </span>
        </span>
        <div className="max-w-xl space-y-2">
          <CardTitle className="text-xl">Sin documentos visibles</CardTitle>
          <CardDescription className="text-sm leading-6">
            No hay versiones documentales disponibles para tu permiso en esta
            organización.
          </CardDescription>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {canCreateDocuments ? (
            <Button asChild variant="outline">
              <Link href="#document-upload">
                <Plus aria-hidden="true" />
                Subir documento
              </Link>
            </Button>
          ) : null}
          {selectedScope === "programming" ? (
            <Button asChild variant="outline">
              <Link
                href={getSchedulePath({
                  organizationId,
                })}
              >
                Ir a horario
              </Link>
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function DocumentsHelpNote() {
  return (
    <Alert
      className="border-blue-200 bg-blue-50 text-blue-950"
      id="document-help"
    >
      <Info aria-hidden="true" className="size-4 text-blue-700" />
      <AlertTitle>¿Sabías que?</AlertTitle>
      <AlertDescription className="leading-6 text-blue-900/85">
        La visibilidad depende de tu rol y del ámbito de cada versión. Preview
        y descarga pasan siempre por rutas backend controladas.
      </AlertDescription>
    </Alert>
  );
}

function DocumentCreateForm({
  organizationId,
  selectedScope,
}: {
  organizationId: string;
  selectedScope: DocumentRepositoryScope | null;
}) {
  const defaultScope = getDefaultUploadScope(selectedScope);

  return (
    <form
      action={createDocumentWithInitialFileUpload}
      className="grid gap-4"
    >
      <input name="organizationId" type="hidden" value={organizationId} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
        <label className="grid gap-2">
          <span className="text-sm font-medium">Titulo</span>
          <Input
            maxLength={160}
            name="title"
            placeholder="Programacion semana 1"
            required
          />
        </label>

        <label className="grid gap-2">
          <span className="text-sm font-medium">Ambito</span>
          <select
            className="h-11 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:h-8"
            defaultValue={defaultScope}
            name="scope"
          >
            {DOCUMENT_UPLOAD_SCOPES.map((scope) => (
              <option key={scope} value={scope}>
                {scopeLabels[scope]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="grid gap-2">
        <span className="text-sm font-medium">Descripción opcional</span>
        <Textarea
          maxLength={500}
          name="description"
          placeholder="Contexto interno breve para encontrarlo después."
        />
      </label>

      <label className="grid gap-2">
        <span className="text-sm font-medium">Archivo</span>
        <Input
          accept={DOCUMENT_UPLOAD_ACCEPT}
          name="documentFile"
          required
          type="file"
        />
        <span className="text-xs leading-5 text-muted-foreground">
          PDF, PNG, JPG, TXT o CSV. Maximo {formatUploadLimit()}.
        </span>
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <DocumentUploadSubmitButton />
        <p className="text-xs leading-5 text-muted-foreground">
          Se guardará en esta organización.
        </p>
      </div>
    </form>
  );
}

function DocumentsScopeFilters({
  organizationId,
  selectedScope,
}: {
  organizationId: string;
  selectedScope: DocumentRepositoryScope | null;
}) {
  const items: Array<{
    label: string;
    scope: DocumentRepositoryScope | null;
  }> = [
    {
      label: "Todos",
      scope: null,
    },
    ...DOCUMENT_REPOSITORY_SCOPES.map((scope) => ({
      label: scopeLabels[scope],
      scope,
    })),
  ];

  return (
    <div className="flex gap-2 overflow-x-auto pb-1" role="list">
      {items.map((item) => {
        const active = item.scope === selectedScope;

        return (
          <Button
            asChild
            className="shrink-0"
            key={item.scope ?? "all"}
            size="sm"
            variant={active ? "default" : "outline"}
          >
            <Link
              aria-current={active ? "page" : undefined}
              href={getDocumentsPath({
                documentScope: item.scope,
                organizationId,
              })}
            >
              {item.label}
            </Link>
          </Button>
        );
      })}
    </div>
  );
}

function DocumentRepositoryCard({
  entry,
  organizationId,
}: {
  entry: DocumentRepositoryEntry;
  organizationId: string;
}) {
  const previewHref = getDocumentVersionRouteHref({
    documentId: entry.document_id,
    documentVersionId: entry.document_version_id,
    mode: "preview",
    organizationId,
  });
  const downloadHref = getDocumentVersionRouteHref({
    documentId: entry.document_id,
    documentVersionId: entry.document_version_id,
    mode: "download",
    organizationId,
  });

  return (
    <Card size="sm">
      <CardContent className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{scopeLabels[entry.document_scope]}</Badge>
            <Badge variant="outline">{getAccessLabel(entry)}</Badge>
            {entry.document_status === "archived" ||
            entry.version_status === "archived" ? (
              <Badge variant="outline">Archivado</Badge>
            ) : null}
          </div>
          <div className="min-w-0 space-y-1">
            <h2 className="break-words text-base font-semibold tracking-tight">
              {entry.title}
            </h2>
            {entry.description ? (
              <p className="line-clamp-2 text-sm text-muted-foreground">
                {entry.description}
              </p>
            ) : null}
          </div>
          <dl className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-3">
            <div className="min-w-0">
              <dt className="text-xs font-medium text-foreground">Version</dt>
              <dd className="mt-0.5 truncate">v{entry.version_number}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs font-medium text-foreground">Archivo</dt>
              <dd className="mt-0.5 truncate">{entry.original_filename}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs font-medium text-foreground">Actualizado</dt>
              <dd className="mt-0.5 truncate">
                {formatDate(entry.version_updated_at)}
              </dd>
            </div>
          </dl>
          <p className="text-xs text-muted-foreground">
            {formatFileSize(entry.size_bytes)} / {entry.mime_type}
          </p>
        </div>

        <div className="flex flex-wrap gap-2 md:justify-end">
          {entry.can_preview ? (
            <Button asChild className="flex-1 md:flex-none" size="sm" variant="outline">
              <Link href={previewHref} target="_blank" rel="noopener noreferrer">
                <Eye aria-hidden="true" />
                Preview
              </Link>
            </Button>
          ) : null}
          {entry.can_download ? (
            <Button asChild className="flex-1 md:flex-none" size="sm" variant="outline">
              <Link href={downloadHref}>
                <Download aria-hidden="true" />
                Descargar
              </Link>
            </Button>
          ) : null}
          {!entry.can_preview && !entry.can_download ? (
            <span className="inline-flex min-h-9 items-center rounded-md border border-border px-3 text-sm text-muted-foreground">
              Sin archivo para tu permiso
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

export default async function DocumentsPage({ searchParams }: DocumentsPageProps) {
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect(getLoginPath("/app/documents"));
  }

  const params = await searchParams;
  const organizationId = getParam(params.organizationId);
  const selectedScope = normalizeDocumentRepositoryScope(getParam(params.scope));
  const status = getParam(params.status);
  const error = getParam(params.error);
  const memberships = await getActiveMemberships(user.id);
  const resolution = resolveActiveOrganization(memberships, organizationId);

  if (!resolution.ok) {
    return (
      <div className="space-y-6">
        <PageHeader title="Documentos" />
        <OrganizationResolutionState
          basePath="/app/documents"
          resolution={resolution}
        />
      </div>
    );
  }

  const repositoryResult = await listAccessibleDocumentVersions({
    limit: 100,
    organizationId: resolution.organization.id,
    scope: selectedScope,
  });
  const documents = repositoryResult.ok ? repositoryResult.data : [];
  const previewCount = documents.filter((entry) => entry.can_preview).length;
  const downloadCount = documents.filter((entry) => entry.can_download).length;
  const metadataOnlyCount = documents.filter(
    (entry) => !entry.can_preview && !entry.can_download,
  ).length;
  const roleLabel = getApplicationRoleLabel(resolution.membership.role);
  const canCreateDocuments = canCreateMinimalDocumentUpload(
    resolution.membership.role,
  );

  return (
    <div
      className="space-y-5 md:space-y-6"
      data-document-repository-surface="minimal"
    >
      <PageHeader
        actions={
          <Button asChild variant="outline">
            <Link href="#document-help">
              <FileText aria-hidden="true" />
              Guia de documentos
            </Link>
          </Button>
        }
        badge="Documentos"
        description="Consulta documentos internos, material de programación y archivos compartidos con tu cuenta."
        meta={
          <>
            <Badge variant="outline">{resolution.organization.name}</Badge>
            <Badge variant="outline">{roleLabel}</Badge>
          </>
        }
        title="Documentos"
      />

      {status && successMessages[status] ? (
        <TransientFeedbackBanner
          description="La version activa ya usa el almacenamiento privado."
          title={successMessages[status]}
          tone="success"
        />
      ) : null}

      {error && errorMessages[error] ? (
        <TransientFeedbackBanner
          description={errorMessages[error]}
          title="No se ha podido crear el documento"
          tone="error"
        />
      ) : null}

      <section className="grid gap-3 md:grid-cols-3">
        <DocumentSummaryCard
          description="Versiones activas o archivadas visibles para tu rol."
          icon={FileText}
          label="Visibles"
          tone="visible"
          value={documents.length}
        />
        <DocumentSummaryCard
          description="Archivos que puedes previsualizar antes de descargar."
          icon={Eye}
          label="Con preview"
          tone="preview"
          value={previewCount}
        />
        <DocumentSummaryCard
          description="Versiones descargables con control de acceso aplicado."
          icon={Download}
          label="Con descarga"
          tone="download"
          value={downloadCount}
        />
      </section>

      {canCreateDocuments ? (
        <DocumentUploadPanel>
          <DocumentCreateForm
            organizationId={resolution.organization.id}
            selectedScope={selectedScope}
          />
        </DocumentUploadPanel>
      ) : null}

      <section className="space-y-3">
        <DocumentRepositoryHeader
          metadataOnlyCount={metadataOnlyCount}
          selectedScope={selectedScope}
        />
        <DocumentsScopeFilters
          organizationId={resolution.organization.id}
          selectedScope={selectedScope}
        />

        {!repositoryResult.ok ? (
          <Alert variant="destructive">
            <LockKeyhole aria-hidden="true" className="size-4" />
            <AlertTitle>No se pudo cargar el repositorio</AlertTitle>
            <AlertDescription>
              La consulta documental quedo bloqueada por entorno, tenant o
              permisos. Revisa los accesos y datos reales antes de beta.
            </AlertDescription>
          </Alert>
        ) : documents.length === 0 ? (
          <DocumentRepositoryEmptyState
            canCreateDocuments={canCreateDocuments}
            organizationId={resolution.organization.id}
            selectedScope={selectedScope}
          />
        ) : (
          <div
            className={cn("grid gap-3", documents.length > 8 && "md:grid-cols-2")}
          >
            {documents.map((entry) => (
              <DocumentRepositoryCard
                entry={entry}
                key={`${entry.document_id}:${entry.document_version_id}`}
                organizationId={resolution.organization.id}
              />
            ))}
          </div>
        )}
      </section>

      <DocumentsHelpNote />
    </div>
  );
}
