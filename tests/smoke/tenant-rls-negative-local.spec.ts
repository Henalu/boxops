import { expect, test } from "@playwright/test";
import { Buffer } from "node:buffer";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import {
  canActivateTimeLocationSettings,
  canDeleteOperationalTeamProfiles,
  canManageAbsenceRequests,
  canManageChangeRequests,
  canManageOperationalData,
  canManageOperationalEvents,
  canManageOperationalTeamProfiles,
  canManageStaffWorkWindows,
  canManageTeamAccess,
  canManageTenantSettings,
  canManageTimeLocationSettings,
  canManageTimeTrackingSettings,
  canReadOperationalEvents,
  canReviewTimeTracking,
  canReviewOvertimeCandidates,
  canUseAbsenceSelfService,
  MANAGED_ACCESS_ROLES,
  type ApplicationRole,
} from "../../src/lib/auth/permissions";
import {
  resolveActiveOrganization,
  type ActiveMembership,
} from "../../src/lib/auth/tenant";
import {
  getLoginPath,
  getSafeRedirectPath,
} from "../../src/lib/auth/redirects";
import {
  AVATAR_MAX_SIZE_BYTES,
  validateAvatarUploadFile,
} from "../../src/lib/profile-assets";
import {
  DOCUMENT_UPLOAD_MAX_SIZE_BYTES,
  validateMinimalDocumentUploadFile,
} from "../../src/lib/documents";
import { validatePersonalProfileForm } from "../../src/lib/personal-profile";
import { validateSignatureDataUrl } from "../../src/lib/profile-signatures";
import {
  validateStaffWorkWindowCreateForm,
  validateStaffWorkWindowForm,
} from "../../src/lib/staff-work-windows";

function readProjectFile(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

function readJsonProjectFile<T>(relativePath: string): T {
  return JSON.parse(readProjectFile(relativePath)) as T;
}

type PackageManifest = {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
};

type PackageLockRoot = {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

type PackageLock = {
  name?: string;
  lockfileVersion?: number;
  packages?: Record<string, PackageLockRoot>;
};

function getSqlFunctionSource(source: string, functionName: string) {
  const escapedName = functionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(
    new RegExp(
      `CREATE OR REPLACE FUNCTION public\\.${escapedName}\\([\\s\\S]+?\\nEND;\\r?\\n\\$\\$;`,
      "i",
    ),
  );

  expect(match, `SQL function public.${functionName} exists`).not.toBeNull();

  return match?.[0] ?? "";
}

function getTsFunctionSource(source: string, functionName: string) {
  const escapedName = functionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(
    new RegExp(
      `(?:export\\s+)?async\\s+function\\s+${escapedName}\\([\\s\\S]+?\\n}\\r?\\n`,
      "m",
    ),
  );

  expect(match, `TS function ${functionName} exists`).not.toBeNull();

  return match?.[0] ?? "";
}

function getFunctionSource(source: string, functionName: string) {
  const escapedName = functionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(
    new RegExp(`function\\s+${escapedName}\\([\\s\\S]+?\\n}\\r?\\n`, "m"),
  );

  expect(match, `function ${functionName} exists`).not.toBeNull();

  return match?.[0] ?? "";
}

function getDefaultAsyncFunctionSource(source: string, functionName: string) {
  const escapedName = functionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(
    new RegExp(
      `export\\s+default\\s+async\\s+function\\s+${escapedName}\\([\\s\\S]+?\\n}\\r?\\n`,
      "m",
    ),
  );

  expect(match, `default async function ${functionName} exists`).not.toBeNull();

  return match?.[0] ?? "";
}

function expectTenantScopedQuery(
  source: string,
  functionName: string,
  tableName: string,
) {
  expect(
    getTsFunctionSource(source, functionName),
    `${functionName} filters ${tableName} by organization_id`,
  ).toMatch(
    new RegExp(
      `\\.from\\("${tableName}"\\)[\\s\\S]+\\.eq\\("organization_id", organizationId\\)`,
    ),
  );
}

function collectSourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const fullPath = path.join(directory, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      return collectSourceFiles(fullPath);
    }

    return /\.(ts|tsx)$/.test(entry) ? [fullPath] : [];
  });
}

function collectVisibleClaimSourceFiles() {
  return [
    ...collectVisibleAppSurfaceFiles(),
    ...collectSourceFiles(path.join(process.cwd(), "src/lib/navigation")),
  ].sort();
}

function collectVisibleAppSurfaceFiles() {
  return [
    ...collectSourceFiles(path.join(process.cwd(), "src/app")),
    ...collectSourceFiles(path.join(process.cwd(), "src/components")),
  ].sort();
}

function collectProtectedAppSurfaceFiles() {
  return [
    ...collectSourceFiles(path.join(process.cwd(), "src/app/(app)/app")),
    ...collectSourceFiles(path.join(process.cwd(), "src/components")),
  ].sort();
}

function normalizeClaimScanText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function gitLines(args: string[]) {
  return execFileSync("git", args, {
    cwd: process.cwd(),
    encoding: "utf8",
  })
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/\\/g, "/"));
}

function isGitIgnored(relativePath: string) {
  try {
    execFileSync("git", ["check-ignore", "-q", "--", relativePath], {
      cwd: process.cwd(),
      stdio: "ignore",
    });

    return true;
  } catch {
    return false;
  }
}

function isTrackableHygieneFile(relativePath: string) {
  const normalizedPath = relativePath.replace(/\\/g, "/");

  if (normalizedPath === ".env.example") {
    return true;
  }

  if (
    /^(?:AGENTS|CLAUDE|PROJECT_BRIEF|PRD|README|TASKS)\.md$/.test(
      normalizedPath,
    )
  ) {
    return true;
  }

  return (
    (normalizedPath.startsWith("docs/") && normalizedPath.endsWith(".md")) ||
    (normalizedPath.startsWith("tests/") && normalizedPath.endsWith(".ts")) ||
    (normalizedPath.startsWith("supabase/snippets/") &&
      normalizedPath.endsWith(".sql"))
  );
}

function collectTrackableHygieneFiles() {
  return gitLines(["ls-files", "--cached", "--others", "--exclude-standard"])
    .filter(isTrackableHygieneFile)
    .sort();
}

const generatedEvidenceArtifactPathPattern =
  /^(?:\.next|out|dist|build|\.turbo|\.vercel|coverage|test-results|playwright-report|\.local-evidence|evidence|qa-evidence|screenshots|videos|traces|dumps|exports|controlled-documents|tmp|temp)(?:\/|$)|(?:^|\/)[^/]+\.(?:tsbuildinfo|log|trace|trace\.zip|har|webm|mp4|dump|sql\.gz|sqlite|db|bak|tmp)$/i;

const now = "2026-05-18T00:00:00.000Z";

function makeOrganization(
  id: string,
  overrides: Partial<ActiveMembership["organization"]> = {},
): ActiveMembership["organization"] {
  return {
    id,
    name: `Tenant ${id.slice(-1).toUpperCase()}`,
    slug: `tenant-${id.slice(-1)}`,
    status: "active",
    theme_config: {},
    time_tracking_config: {},
    timezone: "Europe/Madrid",
    ...overrides,
  };
}

function makeMembership(
  role: ApplicationRole,
  organizationId: string,
  overrides: Partial<ActiveMembership> = {},
): ActiveMembership {
  return {
    id: `membership-${organizationId}-${role}`,
    organization_id: organizationId,
    user_id: "user-a",
    role,
    status: "active",
    joined_at: now,
    created_at: now,
    organization: makeOrganization(organizationId),
    ...overrides,
  };
}

function makeFormData(values: Record<string, string | null | undefined>) {
  const formData = new FormData();

  for (const [key, value] of Object.entries(values)) {
    if (value !== null && value !== undefined) {
      formData.set(key, value);
    }
  }

  return formData;
}

function makeFileLike(type: string, size: number) {
  return {
    size,
    type,
  } as File;
}

function uint32Bytes(value: number) {
  return [
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ];
}

function asciiBytes(value: string) {
  return [...value].map((character) => character.charCodeAt(0));
}

function makePngBytes(width: number, height: number) {
  return Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...uint32Bytes(13),
    ...asciiBytes("IHDR"),
    ...uint32Bytes(width),
    ...uint32Bytes(height),
    8,
    6,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    ...uint32Bytes(0),
    ...asciiBytes("IEND"),
    0,
    0,
    0,
    0,
  ]);
}

function makePngDataUrl(width: number, height: number) {
  return `data:image/png;base64,${Buffer.from(
    makePngBytes(width, height),
  ).toString("base64")}`;
}

test.describe("tenant/RLS negative local source guardrails", () => {
  test("keeps app source free from tenant hardcoding, privileged keys, AI, geolocation, push and private caches", () => {
    const source = collectSourceFiles(path.join(process.cwd(), "src"))
      .map((filePath) => readFileSync(filePath, "utf8"))
      .join("\n");

    expect(source).not.toMatch(/\bSTL\b/);
    expect(source).not.toMatch(/\bservice_role\b/);
    expect(source).not.toMatch(
      /\b(?:OpenAI|openai|anthropic|embeddings|vector|pgvector)\b|ai_/,
    );
    expect(source).not.toMatch(/\bnavigator\.geolocation\b/);
    expect(source).not.toMatch(
      /serviceWorker|service worker|PushManager|Notification|background sync|caches\.|CacheStorage/i,
    );
  });
});

test.describe("visible browser storage hygiene local source guardrails", () => {
  test("keeps client storage limited to non-sensitive onboarding state", () => {
    const browserStoragePattern =
      /\b(?:window\.)?(?:localStorage|sessionStorage|indexedDB)\b|\bdocument\.cookie\b|\bcookieStore\b|\bnavigator\.storage\b|\bStorageManager\b|\bopenDatabase\s*\(/g;
    const visibleSourceFiles = collectVisibleAppSurfaceFiles();
    const storageMatches = visibleSourceFiles.flatMap((filePath) => {
      const relativePath = path
        .relative(process.cwd(), filePath)
        .replace(/\\/g, "/");
      const source = readFileSync(filePath, "utf8");

      return [...source.matchAll(browserStoragePattern)].map(() => relativePath);
    });
    const filesWithBrowserStorage = [...new Set(storageMatches)].sort();
    const onboardingPath = "src/components/layout/onboarding-tour.tsx";

    expect(filesWithBrowserStorage).toEqual([onboardingPath]);

    const onboardingSource = readProjectFile(onboardingPath);
    const storageKeyMatch = onboardingSource.match(
      /const STORAGE_KEY = "(boxops_onboarding_seen_v\d+)";/,
    );
    const storageKey = storageKeyMatch?.[1] ?? "";

    expect(
      storageKeyMatch,
      "onboarding storage key remains explicit",
    ).not.toBeNull();
    expect(storageKey).not.toMatch(
      /tenant|organization|org|center|document|file|time|punch|signature|audit|permission|role|token|email|storage|evidence|grant|payroll|location/i,
    );
    expect(onboardingSource).toMatch(
      /window\.localStorage\.setItem\(STORAGE_KEY, "true"\)/,
    );
    expect(onboardingSource).toMatch(
      /window\.localStorage\.getItem\(STORAGE_KEY\) === "true"/,
    );
    expect(onboardingSource).toMatch(
      /window\.localStorage\.removeItem\(STORAGE_KEY\)/,
    );

    const storageCallViolations = [
      ...onboardingSource.matchAll(
        /\b(?:window\.)?localStorage\.(setItem|getItem|removeItem)\(([^)]*)\)/g,
      ),
    ]
      .filter((match) => !match[2].trim().startsWith("STORAGE_KEY"))
      .map((match) => match[0]);

    expect(storageCallViolations).toEqual([]);
    expect(
      [...onboardingSource.matchAll(/\blocalStorage\.setItem\b/g)],
    ).toHaveLength(1);
    expect(
      [...onboardingSource.matchAll(/\blocalStorage\.getItem\b/g)],
    ).toHaveLength(1);
    expect(
      [...onboardingSource.matchAll(/\blocalStorage\.removeItem\b/g)],
    ).toHaveLength(1);
    expect(onboardingSource).not.toMatch(
      /\b(?:sessionStorage|indexedDB)\b|\bdocument\.cookie\b|\bcookieStore\b|\bnavigator\.storage\b|\bStorageManager\b|\bopenDatabase\s*\(/,
    );
  });
});

test.describe("visible browser egress hygiene local source guardrails", () => {
  test("keeps visible surfaces away from browser data egress APIs", () => {
    const visibleSourceFiles = collectVisibleAppSurfaceFiles();
    const forbiddenBrowserEgressRules = [
      {
        name: "clipboard API",
        pattern: /\bnavigator\.clipboard\b/,
      },
      {
        name: "window.open",
        pattern: /\bwindow\.open\s*\(/,
      },
      {
        name: "postMessage",
        pattern:
          /\b(?:(?:window|parent|opener|self)\.)?postMessage\s*\(/,
      },
      {
        name: "BroadcastChannel",
        pattern: /\bBroadcastChannel\b/,
      },
      {
        name: "object URL",
        pattern: /\b(?:URL|webkitURL)\.createObjectURL\s*\(/,
      },
      {
        name: "Blob construction",
        pattern: /\b(?:new\s+)?Blob\s*\(/,
      },
      {
        name: "FileReader",
        pattern: /\b(?:new\s+)?FileReader\s*\(/,
      },
      {
        name: "client-side download attribute",
        pattern: /<(?:a|Link)\b[\s\S]{0,500}\bdownload(?:=|\s|>)/,
      },
      {
        name: "browser file picker",
        pattern:
          /\bshow(?:Save|Open)FilePicker\s*\(|\bshowDirectoryPicker\s*\(/,
      },
      {
        name: "browser share or beacon",
        pattern: /\bnavigator\.(?:share|sendBeacon)\s*\(/,
      },
      {
        name: "browser streaming channel",
        pattern: /\b(?:XMLHttpRequest|WebSocket|EventSource)\b/,
      },
    ];

    const egressViolations = visibleSourceFiles.flatMap((filePath) => {
      const relativePath = path
        .relative(process.cwd(), filePath)
        .replace(/\\/g, "/");
      const source = readFileSync(filePath, "utf8");

      return forbiddenBrowserEgressRules
        .filter(({ pattern }) => pattern.test(source))
        .map(({ name }) => `${relativePath}: ${name}`);
    });

    const externalHrefViolations = visibleSourceFiles.flatMap((filePath) => {
      const relativePath = path
        .relative(process.cwd(), filePath)
        .replace(/\\/g, "/");
      const lines = readFileSync(filePath, "utf8").split(/\r?\n/);

      return lines
        .map((line, index) => ({ index, line }))
        .filter(({ line }) =>
          /\bhref\s*=\s*["'](?:https?:|\/\/|data:|blob:|file:)/i.test(line),
        )
        .map(({ index, line }) => `${relativePath}:${index + 1}: ${line.trim()}`);
    });

    const rawFileHrefViolations = visibleSourceFiles.flatMap((filePath) => {
      const relativePath = path
        .relative(process.cwd(), filePath)
        .replace(/\\/g, "/");
      const source = readFileSync(filePath, "utf8");

      return [
        ...source.matchAll(
          /\bhref=\{[^}\n]*(?:signedUrl|storagePath|storage_path|storageBucket|storage_bucket|publicUrl|fileUrl|objectUrl)[^}\n]*\}/gi,
        ),
      ].map((match) => `${relativePath}: ${match[0]}`);
    });

    const clientFetchViolations = visibleSourceFiles.flatMap((filePath) => {
      const relativePath = path
        .relative(process.cwd(), filePath)
        .replace(/\\/g, "/");
      const source = readFileSync(filePath, "utf8");

      if (!/^\s*["']use client["'];?/m.test(source)) {
        return [];
      }

      return [...source.matchAll(/\bfetch\s*\(/g)].map(
        (match) => `${relativePath}:${match.index ?? 0}: fetch`,
      );
    });

    expect(egressViolations).toEqual([]);
    expect(externalHrefViolations).toEqual([]);
    expect(rawFileHrefViolations).toEqual([]);
    expect(clientFetchViolations).toEqual([]);
  });

  test("keeps visible document file navigation on internal backend routes only", () => {
    const documentRepositoryPageSource = readProjectFile(
      "src/app/(app)/app/documents/page.tsx",
    );
    const scheduleDetailPanelSource = readProjectFile(
      "src/app/(app)/app/schedule/schedule-block-detail-panels.tsx",
    );

    for (const source of [
      documentRepositoryPageSource,
      scheduleDetailPanelSource,
    ]) {
      expect(source).toMatch(
        /function getDocumentVersionRouteHref[\s\S]+return `\/app\/documents\/\$\{documentId\}\/versions\/\$\{documentVersionId\}\/\$\{mode\}\?\$\{params\.toString\(\)\}`/,
      );
      expect(source).toMatch(/entry\.can_preview[\s\S]+href=\{previewHref\}/);
      expect(source).toMatch(/entry\.can_download[\s\S]+href=\{downloadHref\}/);
      expect(source).not.toMatch(
        /createSignedUrl|signedUrl|storage_path|storage_bucket|document-files|URL\.createObjectURL|Blob|FileReader|window\.open/i,
      );
    }
  });
});

test.describe("visible downloadable response hygiene local source guardrails", () => {
  test("keeps visible export and download entry points internal, protected and review-only", () => {
    const visibleSourceFiles = collectVisibleAppSurfaceFiles();
    const downloadableAttributePattern =
      /\b(href|action|formAction)\s*=\s*(?:"([^"]*(?:\/download|\/export)[^"]*)"|'([^']*(?:\/download|\/export)[^']*)'|\{([^}\n]*(?:downloadHref|previewHref)[^}\n]*)\})/g;
    const visibleDownloadEntryPoints = visibleSourceFiles.flatMap((filePath) => {
      const relativePath = path
        .relative(process.cwd(), filePath)
        .replace(/\\/g, "/");
      const source = readFileSync(filePath, "utf8");

      return [...source.matchAll(downloadableAttributePattern)].map((match) => {
        const value = match[2] ?? match[3] ?? `{${match[4]}}`;

        return `${relativePath}: ${match[1]}=${value}`;
      });
    });

    expect(visibleDownloadEntryPoints.sort()).toEqual([
      "src/app/(app)/app/documents/page.tsx: href={downloadHref}",
      "src/app/(app)/app/documents/page.tsx: href={previewHref}",
      "src/app/(app)/app/schedule/schedule-block-detail-panels.tsx: href={downloadHref}",
      "src/app/(app)/app/schedule/schedule-block-detail-panels.tsx: href={previewHref}",
      'src/app/(app)/app/time/page.tsx: action=/app/time/export',
    ]);

    const timePageSource = readProjectFile("src/app/(app)/app/time/page.tsx");
    const timeExportRouteSource = readProjectFile(
      "src/app/(app)/app/time/export/route.ts",
    );
    const timeTrackingSource = readProjectFile("src/lib/time-tracking.ts");
    const documentRepositoryPageSource = readProjectFile(
      "src/app/(app)/app/documents/page.tsx",
    );
    const scheduleDetailPanelSource = readProjectFile(
      "src/app/(app)/app/schedule/schedule-block-detail-panels.tsx",
    );
    const documentPreviewRouteSource = readProjectFile(
      "src/app/(app)/app/documents/[documentId]/versions/[documentVersionId]/preview/route.ts",
    );
    const documentDownloadRouteSource = readProjectFile(
      "src/app/(app)/app/documents/[documentId]/versions/[documentVersionId]/download/route.ts",
    );
    const documentFileAccessSource = readProjectFile(
      "src/lib/document-file-access.ts",
    );
    const actionIndex = timePageSource.indexOf('action="/app/time/export"');
    const formStart = timePageSource.lastIndexOf("<form", actionIndex);
    const formEnd = timePageSource.indexOf("</form>", actionIndex);

    expect(actionIndex).toBeGreaterThanOrEqual(0);
    expect(formStart).toBeGreaterThanOrEqual(0);
    expect(formEnd).toBeGreaterThan(actionIndex);

    const timeExportForm = timePageSource.slice(
      formStart,
      formEnd + "</form>".length,
    );

    expect(timePageSource).toContain("Exporte interno revisable");
    expect(timePageSource).toContain("CSV interno");
    expect(timePageSource).toContain(
      "Descarga los fichajes de un periodo para revisarlos con el equipo responsable.",
    );
    expect(timePageSource).toContain(
      "La descarga queda registrada para trazabilidad de la organizacion.",
    );
    expect(timePageSource).not.toMatch(/\bpayroll\b/i);
    expect(timePageSource).not.toMatch(/cumplimiento legal definitivo/i);
    expect(timeExportForm).toContain('method="get"');
    expect(timeExportForm).toContain('name="organizationId"');
    expect(timeExportForm).toContain('name="from"');
    expect(timeExportForm).toContain('name="to"');
    expect(timeExportForm).toContain('name="person_profile_id"');
    expect(timeExportForm).toContain("Descargar CSV");
    expect(timeExportForm).not.toMatch(
      /createSignedUrl|signedUrl|storage_path|storagePath|storage_bucket|storageBucket|document-files|profile-assets|profile-signatures|service_role|document_access_grants|manage_grants|signature_evidence|sensitive_hr|requires_signature/i,
    );

    expect(timeExportRouteSource).toContain(
      'export const dynamic = "force-dynamic";',
    );
    expect(timeExportRouteSource).toContain("generateTimeRecordsCsvExport");
    expect(timeExportRouteSource).toContain('"Cache-Control": "no-store"');
    expect(timeExportRouteSource).toContain(
      '"Content-Disposition": `attachment; filename="${result.data.filename}"`',
    );
    expect(timeExportRouteSource).toContain(
      '"X-BoxOps-Export-Scope": "internal-review"',
    );
    expect(timeExportRouteSource).not.toMatch(
      /createSignedUrl|signedUrl|storage_path|storage_bucket|document-files|legalFinal:\s*true|payroll:\s*true/i,
    );

    expect(timeTrackingSource).toMatch(
      /generateTimeRecordsCsvExport[\s\S]+requireReviewAccess: true/,
    );
    expect(timeTrackingSource).toMatch(
      /const exportMetadata = \{[\s\S]+internalReviewOnly: true,[\s\S]+legalFinal: false,[\s\S]+notesTextIncluded: false,[\s\S]+payroll: false,[\s\S]+snapshotsIncluded: false/,
    );
    expect(timeTrackingSource).toContain(
      "exporte interno revisable; no payroll; no cumplimiento legal definitivo",
    );

    for (const source of [
      documentRepositoryPageSource,
      scheduleDetailPanelSource,
    ]) {
      expect(source).toMatch(
        /function getDocumentVersionRouteHref[\s\S]+return `\/app\/documents\/\$\{documentId\}\/versions\/\$\{documentVersionId\}\/\$\{mode\}\?\$\{params\.toString\(\)\}`/,
      );
      expect(source).toMatch(/entry\.can_preview[\s\S]+href=\{previewHref\}/);
      expect(source).toMatch(/entry\.can_download[\s\S]+href=\{downloadHref\}/);
      expect(source).not.toMatch(
        /createSignedUrl|signedUrl|storage_path|storage_bucket|document-files|\/storage|storage\/v1|URL\.createObjectURL|Blob|FileReader|window\.open/i,
      );
    }

    for (const [source, mode] of [
      [documentPreviewRouteSource, "preview"],
      [documentDownloadRouteSource, "download"],
    ] as const) {
      expect(source).toContain('export const dynamic = "force-dynamic";');
      expect(source).toContain("handleDocumentVersionFileAccess");
      expect(source).toContain(`mode: "${mode}"`);
      expect(source).not.toMatch(/createSignedUrl|signedUrl|document-files/);
    }

    expect(documentFileAccessSource).toMatch(
      /createSignedUrl\([\s\S]+mode === "download"/,
    );
    expect(documentFileAccessSource).toMatch(
      /response\.headers\.set\("Cache-Control", "no-store"\)/,
    );
    expect(documentFileAccessSource).toMatch(
      /response\.headers\.set\("X-Robots-Tag", "noindex"\)/,
    );
    expect(documentFileAccessSource).toContain("document_file_audit_required");
  });
});

test.describe("visible form action hygiene local source guardrails", () => {
  test("keeps visible form submissions on server actions or internal routes", () => {
    const visibleSourceFiles = collectVisibleAppSurfaceFiles();
    const formActionAttributes: Array<{
      attributeName: "action" | "formAction";
      kind: "expression" | "literal";
      lineNumber: number;
      relativePath: string;
      value: string;
    }> = [];
    const formRouteMethodViolations: string[] = [];

    for (const filePath of visibleSourceFiles) {
      const relativePath = path
        .relative(process.cwd(), filePath)
        .replace(/\\/g, "/");
      const source = readFileSync(filePath, "utf8");
      const getLineNumber = (index: number) =>
        source.slice(0, index).split(/\r?\n/).length;

      for (const formMatch of source.matchAll(/<form\b[\s\S]*?>/g)) {
        const formTag = formMatch[0];
        const formIndex = formMatch.index ?? 0;
        const actionMatch = formTag.match(
          /\baction\s*=\s*(?:"([^"]*)"|'([^']*)'|\{([\s\S]*?)\})/,
        );

        if (!actionMatch) {
          continue;
        }

        const literalValue = actionMatch[1] ?? actionMatch[2];
        const value = literalValue ?? actionMatch[3] ?? "";
        const actionIndex = formIndex + (actionMatch.index ?? 0);

        formActionAttributes.push({
          attributeName: "action",
          kind: literalValue === undefined ? "expression" : "literal",
          lineNumber: getLineNumber(actionIndex),
          relativePath,
          value: value.trim(),
        });

        if (literalValue === undefined) {
          continue;
        }

        const methodMatch = formTag.match(
          /\bmethod\s*=\s*(?:"([^"]*)"|'([^']*)'|\{([\s\S]*?)\})/,
        );
        const methodValue = (methodMatch?.[1] ?? methodMatch?.[2] ?? "get")
          .trim()
          .toLowerCase();

        if (literalValue.trim().startsWith("/app") && methodValue !== "get") {
          formRouteMethodViolations.push(
            `${relativePath}:${getLineNumber(actionIndex)}: ${literalValue.trim()} uses method=${methodValue}`,
          );
        }

        if (
          literalValue.trim() === "/auth/sign-out" &&
          methodValue !== "post"
        ) {
          formRouteMethodViolations.push(
            `${relativePath}:${getLineNumber(actionIndex)}: sign-out must use POST`,
          );
        }
      }

      for (const formActionMatch of source.matchAll(
        /\bformAction\s*=\s*(?:"([^"]*)"|'([^']*)'|\{([\s\S]*?)\})/g,
      )) {
        const literalValue = formActionMatch[1] ?? formActionMatch[2];
        const value = literalValue ?? formActionMatch[3] ?? "";
        const actionIndex = formActionMatch.index ?? 0;

        formActionAttributes.push({
          attributeName: "formAction",
          kind: literalValue === undefined ? "expression" : "literal",
          lineNumber: getLineNumber(actionIndex),
          relativePath,
          value: value.trim(),
        });
      }
    }

    const forbiddenLiteralRoutePattern =
      /^(?:[a-z][a-z0-9+.-]*:|\/\/)|\\|(?:storage\/v1|\/storage(?:\/|$)|document-files|profile-assets|profile-signatures|signed-url|signed_url|signedUrl|storage_path|storagePath|storage_bucket|storageBucket|document_access_grants|manage_grants|signature_evidence|sensitive_hr|service_role|\/app\/documents\/[^?#]*\/versions\/[^?#]*\/(?:preview|download)(?:[/?#]|$)|[?&][^=\s]*(?:token|cookie|signed|storage|evidence|audit)[^=]*=)/i;
    const forbiddenExpressionPattern =
      /(?:["'`](?:https?:|\/\/|data:|blob:|file:)|\bnew\s+URL\b|\bfetch\s*\(|createSignedUrl|signedUrl|storage_path|storagePath|storage_bucket|storageBucket|document-files|profile-assets|profile-signatures|service_role|document_access_grants|manage_grants|signature_evidence|sensitive_hr|payroll|cookie|providerPayload|auditPayload|evidence)/i;
    const internalLiteralRoutePattern = /^\/(?:app|auth)(?:\/|$)/;
    const serverActionIdentifierPattern = /^[A-Za-z_$][\w$]*$/;

    const literalRouteViolations = formActionAttributes
      .filter((attribute) => attribute.kind === "literal")
      .filter(
        (attribute) =>
          !internalLiteralRoutePattern.test(attribute.value) ||
          forbiddenLiteralRoutePattern.test(attribute.value),
      )
      .map(
        (attribute) =>
          `${attribute.relativePath}:${attribute.lineNumber}: ${attribute.attributeName}=${attribute.value}`,
      );

    const expressionViolations = formActionAttributes
      .filter((attribute) => attribute.kind === "expression")
      .filter(
        (attribute) =>
          !serverActionIdentifierPattern.test(attribute.value) ||
          forbiddenExpressionPattern.test(attribute.value),
      )
      .map(
        (attribute) =>
          `${attribute.relativePath}:${attribute.lineNumber}: ${attribute.attributeName}={${attribute.value}}`,
      );

    expect(formActionAttributes.length).toBeGreaterThan(40);
    expect(literalRouteViolations).toEqual([]);
    expect(expressionViolations).toEqual([]);
    expect(formRouteMethodViolations).toEqual([]);
  });

  test("keeps visible form markup away from raw storage, audit and evidence internals", () => {
    const visibleSourceFiles = collectVisibleAppSurfaceFiles();
    const riskyFormMarkupPattern =
      /\b(?:createSignedUrl|signedUrl|storage_path|storagePath|storage_bucket|storageBucket|document-files|profile-assets|profile-signatures|service_role|SUPABASE_SERVICE_ROLE|RESEND_API_KEY|document_access_events|operational_audit_events|changed_fields|auditPayload|providerPayload|rawProviderPayload|evidence)\b/i;
    const formBlocks: string[] = [];
    const riskyFormMarkupViolations = visibleSourceFiles.flatMap((filePath) => {
      const relativePath = path
        .relative(process.cwd(), filePath)
        .replace(/\\/g, "/");
      const source = readFileSync(filePath, "utf8");

      return [...source.matchAll(/<form\b[\s\S]*?<\/form>/g)].flatMap(
        (match) => {
          const formBlock = match[0];
          const lineNumber = source
            .slice(0, match.index ?? 0)
            .split(/\r?\n/).length;

          formBlocks.push(formBlock);

          return riskyFormMarkupPattern.test(formBlock)
            ? [`${relativePath}:${lineNumber}`]
            : [];
        },
      );
    });

    expect(formBlocks.length).toBeGreaterThan(40);
    expect(riskyFormMarkupViolations).toEqual([]);
  });
});

test.describe("visible protected route query hygiene local source guardrails", () => {
  const centralAppPathQueryParams = [
    "absence_status",
    "absence_type",
    "assignment_id",
    "block_id",
    "center_id",
    "class_type_id",
    "coach_profile_id",
    "coverage_state",
    "day",
    "edit_block_id",
    "error",
    "mine",
    "organizationId",
    "overtime_created",
    "overtime_existing",
    "overtime_ignored",
    "record_id",
    "risks_only",
    "scope",
    "status",
    "view",
    "week",
    "work_windows",
  ].sort();
  const operationalVisibleRouteQueryParams = [
    ...centralAppPathQueryParams,
    // Route-state for the schedule operational event panel; the value is
    // validated against events loaded for the active tenant/week before use.
    "event_id",
    // Client-side list filters for planned-presence windows; values are
    // validated against already loaded tenant-scoped windows before use.
    "person_profile_id",
    "window_status",
  ].sort();
  const operationalVisibleRouteQueryParamSet = new Set(
    operationalVisibleRouteQueryParams,
  );
  const forbiddenVisibleRouteQueryParamNamePattern =
    /(?:token|cookie|signed|signature|storage|bucket|path|url|audit|evidence|payload|provider|secret|password|service[_-]?role|api[_-]?key|payroll|legal|salary|wage|compensation|latitude|longitude|coordinate|gps|geolocation|documentId|documentVersionId|document[_-]?(?:id|version|file)|grant|upload|(?:^|[_-])file[_-]?id(?:$|[_-]))/i;

  function collectProtectedRouteStateFiles() {
    return [
      path.join(process.cwd(), "src/lib/navigation/app-paths.ts"),
      ...collectSourceFiles(path.join(process.cwd(), "src/app/(app)/app")),
      ...collectSourceFiles(path.join(process.cwd(), "src/components")),
    ].sort();
  }

  function extractUrlSearchParamsObjectKeys(source: string) {
    return [...source.matchAll(/new URLSearchParams\(\{\s*([\s\S]*?)\s*\}\)/g)]
      .flatMap((match) =>
        (match[1] ?? "")
          .split(",")
          .map((part) => part.trim())
          .filter(Boolean)
          .map((part) => part.match(/^([A-Za-z_$][\w$]*)\b/)?.[1])
          .filter((name): name is string => Boolean(name)),
      );
  }

  test("keeps central app path query params operational and non-sensitive", () => {
    const appPathsSource = readProjectFile("src/lib/navigation/app-paths.ts");
    const helperQueryParams = [
      ...appPathsSource.matchAll(/params\.set\("([^"]+)"/g),
    ]
      .map((match) => match[1])
      .sort();

    expect(helperQueryParams).toEqual(centralAppPathQueryParams);
    expect(
      helperQueryParams.filter((name) =>
        forbiddenVisibleRouteQueryParamNamePattern.test(name),
      ),
    ).toEqual([]);
    expect(appPathsSource).not.toMatch(
      /params\.set\(\s*(?!["'])|createSignedUrl|signedUrl|storage_path|storagePath|storage_bucket|storageBucket|document-files|profile-assets|profile-signatures|document_access_grants|manage_grants|signature_evidence|requires_signature|service_role|payroll|latitude|longitude|geolocation|providerPayload|auditPayload|evidence/i,
    );
  });

  test("keeps protected route state builders away from sensitive query params", () => {
    const routeQueryParamUsages = collectProtectedRouteStateFiles().flatMap(
      (filePath) => {
        const relativePath = path
          .relative(process.cwd(), filePath)
          .replace(/\\/g, "/");
        const source = readFileSync(filePath, "utf8");
        const getLineNumber = (index: number) =>
          source.slice(0, index).split(/\r?\n/).length;
        const literalSetUsages = [
          ...source.matchAll(/(?:params|searchParams)\.set\(\s*["']([^"']+)["']/g),
        ].map((match) => ({
          lineNumber: getLineNumber(match.index ?? 0),
          name: match[1],
          relativePath,
        }));
        const objectParamUsages = [
          ...source.matchAll(/new URLSearchParams\(\{\s*([\s\S]*?)\s*\}\)/g),
        ].flatMap((match) =>
          extractUrlSearchParamsObjectKeys(match[0]).map((name) => ({
            lineNumber: getLineNumber(match.index ?? 0),
            name,
            relativePath,
          })),
        );
        const routeStateHookUsages = [
          ...source.matchAll(/\bparamName:\s*["']([^"']+)["']/g),
        ].map((match) => ({
          lineNumber: getLineNumber(match.index ?? 0),
          name: match[1],
          relativePath,
        }));

        return [
          ...literalSetUsages,
          ...objectParamUsages,
          ...routeStateHookUsages,
        ];
      },
    );
    const dynamicSearchParamSetters = collectProtectedRouteStateFiles().flatMap(
      (filePath) => {
        const relativePath = path
          .relative(process.cwd(), filePath)
          .replace(/\\/g, "/");
        const source = readFileSync(filePath, "utf8");
        const getLineNumber = (index: number) =>
          source.slice(0, index).split(/\r?\n/).length;

        return [
          ...source.matchAll(/(?:params|searchParams)\.set\(\s*(?!["'])/g),
        ].map((match) => ({
          lineNumber: getLineNumber(match.index ?? 0),
          relativePath,
          source,
        }));
      },
    );
    const nonOperationalQueryParams = routeQueryParamUsages
      .filter((usage) => !operationalVisibleRouteQueryParamSet.has(usage.name))
      .map(
        (usage) =>
          `${usage.relativePath}:${usage.lineNumber}: ${usage.name}`,
      );
    const sensitiveQueryParams = routeQueryParamUsages
      .filter((usage) =>
        forbiddenVisibleRouteQueryParamNamePattern.test(usage.name),
      )
      .map(
        (usage) =>
          `${usage.relativePath}:${usage.lineNumber}: ${usage.name}`,
      );
    const unsafeDynamicSetters = dynamicSearchParamSetters
      .filter(
        (usage) =>
          !usage.source.includes('key: "error" | "status";'),
      )
      .map((usage) => `${usage.relativePath}:${usage.lineNumber}`);
    const observedQueryParamNames = [
      ...new Set(routeQueryParamUsages.map((usage) => usage.name)),
    ].sort();

    expect(routeQueryParamUsages.length).toBeGreaterThan(25);
    expect(observedQueryParamNames).toEqual(
      expect.arrayContaining([
        "block_id",
        "edit_block_id",
        "organizationId",
        "record_id",
        "scope",
        "week",
        "work_windows",
      ]),
    );
    expect(nonOperationalQueryParams).toEqual([]);
    expect(sensitiveQueryParams).toEqual([]);
    expect(unsafeDynamicSetters).toEqual([]);
  });

  test("keeps protected GET route forms limited to operational query state", () => {
    const protectedVisibleFiles = [
      ...collectSourceFiles(path.join(process.cwd(), "src/app/(app)/app")),
      ...collectSourceFiles(path.join(process.cwd(), "src/components")),
    ].sort();
    const getRouteFormFieldUsages = protectedVisibleFiles.flatMap((filePath) => {
      const relativePath = path
        .relative(process.cwd(), filePath)
        .replace(/\\/g, "/");
      const source = readFileSync(filePath, "utf8");
      const getLineNumber = (index: number) =>
        source.slice(0, index).split(/\r?\n/).length;

      return [...source.matchAll(/<form\b[\s\S]*?<\/form>/g)].flatMap(
        (formMatch) => {
          const formBlock = formMatch[0];
          const formIndex = formMatch.index ?? 0;
          const openTag = formBlock.match(/<form\b[\s\S]*?>/)?.[0] ?? "";
          const actionMatch = openTag.match(
            /\baction\s*=\s*(?:"([^"]*)"|'([^']*)')/,
          );
          const action = actionMatch?.[1] ?? actionMatch?.[2] ?? "";
          const methodMatch = openTag.match(
            /\bmethod\s*=\s*(?:"([^"]*)"|'([^']*)')/,
          );
          const method = (methodMatch?.[1] ?? methodMatch?.[2] ?? "get")
            .trim()
            .toLowerCase();

          if (
            method !== "get" ||
            !action.startsWith("/app") ||
            /\/export(?:[/?#]|$)/.test(action)
          ) {
            return [];
          }

          return [...formBlock.matchAll(/\bname\s*=\s*["']([^"']+)["']/g)].map(
            (nameMatch) => ({
              action,
              lineNumber: getLineNumber(formIndex + (nameMatch.index ?? 0)),
              name: nameMatch[1],
              relativePath,
            }),
          );
        },
      );
    });
    const nonOperationalGetFormFields = getRouteFormFieldUsages
      .filter((usage) => !operationalVisibleRouteQueryParamSet.has(usage.name))
      .map(
        (usage) =>
          `${usage.relativePath}:${usage.lineNumber}: ${usage.action} name=${usage.name}`,
      );
    const sensitiveGetFormFields = getRouteFormFieldUsages
      .filter((usage) =>
        forbiddenVisibleRouteQueryParamNamePattern.test(usage.name),
      )
      .map(
        (usage) =>
          `${usage.relativePath}:${usage.lineNumber}: ${usage.action} name=${usage.name}`,
      );
    const observedGetFormFields = [
      ...new Set(getRouteFormFieldUsages.map((usage) => usage.name)),
    ].sort();

    expect(getRouteFormFieldUsages.length).toBeGreaterThan(10);
    expect(observedGetFormFields).toEqual(
      expect.arrayContaining([
        "center_id",
        "class_type_id",
        "coach_profile_id",
        "coverage_state",
        "mine",
        "organizationId",
        "risks_only",
        "view",
        "week",
      ]),
    );
    expect(nonOperationalGetFormFields).toEqual([]);
    expect(sensitiveGetFormFields).toEqual([]);
  });
});

test.describe("visible terminal action hygiene local source guardrails", () => {
  const terminalVisibleActionNames = [
    "archiveScheduleTemplate",
    "cancelOwnAbsenceRequestFromForm",
    "cancelOwnChangeRequestFromForm",
    "cancelScheduleBlock",
    "cancelTeamInvitation",
    "deactivateStaffWorkWindow",
    "deleteScheduleTemplateBlock",
    "deleteScheduleTemplateBlocksBulk",
    "expireAbsenceRequestFromForm",
    "expireChangeRequestFromForm",
    "rejectAbsenceRequestFromForm",
    "rejectChangeRequestFromForm",
    "rejectTimeWeeklyApprovalFromHome",
    "removeScheduleBlockAssignment",
    "respondToChangeRequestTargetFromForm",
    "restoreScheduleTemplate",
    "reviewTimeCorrectionFromForm",
    "setCenterStatus",
    "setClassTypeStatus",
    "setOvertimeCandidateStatusFromForm",
    "submitOwnTimeCorrectionFromForm",
  ].sort();
  const terminalVisibleActionNameSet = new Set(terminalVisibleActionNames);
  const terminalVisibleKeywordPattern =
    /\b(?:cancel|archive|restore|reject|expire|deactivate|delete|void|closed|cancelar|archivar|recuperar|restaurar|reactivar|rechazar|vencida|desactivar|eliminar|anular|retirar|cerrar)\b/i;
  const sensitiveTerminalPayloadPattern =
    /\b(?:createSignedUrl|signedUrl|storage_path|storagePath|storage_bucket|storageBucket|document-files|profile-assets|profile-signatures|document_access_events|operational_audit_events|changed_fields|auditPayload|providerPayload|rawProviderPayload|evidence|service_role|SUPABASE_SERVICE_ROLE|RESEND_API_KEY|document_access_grants|manage_grants|signature_evidence|sensitive_hr|requires_signature|center_time_location_settings|time_location_events|payroll|legal|salary|wage|compensation|latitude|longitude|coordinate|geolocation|gps|token|cookie|password|api[_-]?key|secret|upload)\b/i;

  function collectProtectedVisibleFormBlocks() {
    const protectedVisibleFiles = [
      ...collectSourceFiles(path.join(process.cwd(), "src/app/(app)/app")),
      ...collectSourceFiles(path.join(process.cwd(), "src/components")),
    ].sort();

    return protectedVisibleFiles.flatMap((filePath) => {
      const relativePath = path
        .relative(process.cwd(), filePath)
        .replace(/\\/g, "/");
      const source = readFileSync(filePath, "utf8");
      const getLineNumber = (index: number) =>
        source.slice(0, index).split(/\r?\n/).length;

      return [...source.matchAll(/<form\b[\s\S]*?<\/form>/g)].map(
        (match) => ({
          formBlock: match[0],
          lineNumber: getLineNumber(match.index ?? 0),
          relativePath,
        }),
      );
    });
  }

  function extractFormActionIdentifiers(formBlock: string) {
    return [
      ...formBlock.matchAll(
        /\b(?:action|formAction)\s*=\s*\{\s*([A-Za-z_$][\w$]*)\s*\}/g,
      ),
    ].map((match) => match[1]);
  }

  function extractLiteralFormActions(formBlock: string) {
    return [
      ...formBlock.matchAll(/\baction\s*=\s*(?:"([^"]*)"|'([^']*)')/g),
    ].map((match) => match[1] ?? match[2] ?? "");
  }

  function collectTerminalCandidateForms() {
    return collectProtectedVisibleFormBlocks().filter(
      ({ formBlock, relativePath }) => {
        if (
          relativePath === "src/app/(app)/app/layout.tsx" &&
          formBlock.includes('action="/auth/sign-out"')
        ) {
          return false;
        }

        const actionIdentifiers = extractFormActionIdentifiers(formBlock);
        const hasKnownTerminalAction = actionIdentifiers.some((identifier) =>
          terminalVisibleActionNameSet.has(identifier),
        );
        const normalizedFormBlock = normalizeClaimScanText(formBlock);

        return (
          hasKnownTerminalAction ||
          terminalVisibleKeywordPattern.test(normalizedFormBlock)
        );
      },
    );
  }

  test("keeps visible terminal operations on scoped internal Server Actions", () => {
    const terminalCandidateForms = collectTerminalCandidateForms();
    const observedTerminalActions = [
      ...new Set(
        terminalCandidateForms.flatMap(({ formBlock }) =>
          extractFormActionIdentifiers(formBlock).filter((identifier) =>
            terminalVisibleActionNameSet.has(identifier),
          ),
        ),
      ),
    ].sort();
    const unexpectedTerminalActionReferences = terminalCandidateForms.flatMap(
      ({ formBlock, lineNumber, relativePath }) =>
        extractFormActionIdentifiers(formBlock)
          .filter(
            (identifier) =>
              identifier !== "action" &&
              identifier !== "formAction" &&
              !terminalVisibleActionNameSet.has(identifier),
          )
          .filter((identifier) =>
            terminalVisibleKeywordPattern.test(identifier),
          )
          .map(
            (identifier) =>
              `${relativePath}:${lineNumber}: ${identifier}`,
          ),
    );
    const literalTerminalRoutes = terminalCandidateForms.flatMap(
      ({ formBlock, lineNumber, relativePath }) =>
        extractLiteralFormActions(formBlock)
          .filter((action) => action !== "/auth/sign-out")
          .map((action) => `${relativePath}:${lineNumber}: ${action}`),
    );
    const sensitiveTerminalPayloadViolations = terminalCandidateForms
      .filter(({ formBlock }) => sensitiveTerminalPayloadPattern.test(formBlock))
      .map(({ lineNumber, relativePath }) => `${relativePath}:${lineNumber}`);
    const unboundedTerminalTextareaViolations = terminalCandidateForms.flatMap(
      ({ formBlock, lineNumber, relativePath }) =>
        [...formBlock.matchAll(/<Textarea\b[\s\S]*?\/>/g)]
          .filter(
            (match) =>
              !/\bmaxLength=\{(?:1000|2000)\}/.test(match[0]) &&
              !/\bmaxLength="(?:1000|2000)"/.test(match[0]),
          )
          .map(() => `${relativePath}:${lineNumber}`),
    );

    expect(terminalCandidateForms.length).toBeGreaterThan(20);
    expect(observedTerminalActions).toEqual(terminalVisibleActionNames);
    expect(unexpectedTerminalActionReferences).toEqual([]);
    expect(literalTerminalRoutes).toEqual([]);
    expect(sensitiveTerminalPayloadViolations).toEqual([]);
    expect(unboundedTerminalTextareaViolations).toEqual([]);
  });

  test("keeps existing terminal confirmation and explicit-note patterns in place", () => {
    const templateArchiveSubmitSource = readProjectFile(
      "src/app/(app)/app/templates/template-archive-submit.tsx",
    );
    const templateBlocksEditorSource = readProjectFile(
      "src/app/(app)/app/templates/template-blocks-editor.tsx",
    );
    const templateActionsSource = readProjectFile(
      "src/app/(app)/app/templates/actions.ts",
    );
    const absenceSubmitButtonSource = readProjectFile(
      "src/app/(app)/app/absences/absence-submit-button.tsx",
    );
    const absencesPageSource = readProjectFile(
      "src/app/(app)/app/absences/page.tsx",
    );
    const requestExpireSubmitButtonSource = readProjectFile(
      "src/app/(app)/app/requests/request-expire-submit-button.tsx",
    );
    const dashboardSource = readProjectFile("src/app/(app)/app/page.tsx");
    const timePageSource = readProjectFile("src/app/(app)/app/time/page.tsx");

    expect(templateArchiveSubmitSource).toMatch(
      /<Button[\s\S]+type="button"[\s\S]+variant="destructive"/,
    );
    expect(templateArchiveSubmitSource).toContain('role="dialog"');
    expect(templateArchiveSubmitSource).toMatch(
      /<Button form=\{formId\} type="submit" variant="destructive">/,
    );

    expect(templateBlocksEditorSource).toMatch(
      /name="confirmTemplateBlockDelete"[\s\S]+type="hidden"[\s\S]+value="1"/,
    );
    expect(templateActionsSource).toMatch(
      /getRequiredFormString\(formData, "confirmTemplateBlockDelete"\) ===[\s\S]+TEMPLATE_BLOCK_DELETE_CONFIRMATION_VALUE/,
    );
    expect(templateActionsSource).toContain(
      '"template-block-delete-confirmation-required"',
    );

    expect(absenceSubmitButtonSource).toMatch(
      /window\.confirm\(confirmMessage\)/,
    );
    expect(absencesPageSource).toMatch(
      /confirmMessage="Cancelar[\s\S]+action=\{rejectAbsenceRequestFromForm\}[\s\S]+confirmMessage="Rechazar[\s\S]+action=\{expireAbsenceRequestFromForm\}[\s\S]+confirmMessage="Cerrar/,
    );
    expect(requestExpireSubmitButtonSource).toMatch(/window\.confirm\(/);

    expect(dashboardSource).toMatch(
      /action=\{rejectTimeWeeklyApprovalFromHome\}[\s\S]+name="rejectionNote"[\s\S]+required[\s\S]+Rechazar con nota/,
    );
    expect(timePageSource).toMatch(
      /<input name="decision" type="hidden" value="rejected" \/>[\s\S]+name="reviewNote"[\s\S]+required[\s\S]+Rechazar solicitud/,
    );
  });
});

test.describe("visible non-actionable state hygiene local source guardrails", () => {
  test("keeps absence and change request actions behind reviewable states", () => {
    const absencesSource = readProjectFile(
      "src/app/(app)/app/absences/page.tsx",
    );
    const requestsSource = readProjectFile(
      "src/app/(app)/app/requests/page.tsx",
    );
    const absenceActionsSource = getFunctionSource(
      absencesSource,
      "AbsenceActions",
    );
    const absenceMessagesSource = getFunctionSource(
      absencesSource,
      "getNonActionableMessages",
    );
    const requestActionsSource = getFunctionSource(
      requestsSource,
      "RequestActions",
    );

    expect(absencesSource).toMatch(
      /const REVIEWABLE_STATUSES = new Set<AbsenceRequestStatus>\(\[[\s\S]+"requested"[\s\S]+"pending_review"[\s\S]+\]\);/,
    );
    expect(absencesSource).toMatch(
      /const CLOSED_STATUSES = new Set<AbsenceRequestStatus>\(\[[\s\S]+"approved"[\s\S]+"cancelled"[\s\S]+"expired"[\s\S]+"rejected"[\s\S]+\]\);/,
    );
    expect(absenceActionsSource).toMatch(
      /const canCancelOwn =[\s\S]+mode === "own" && REVIEWABLE_STATUSES\.has\(item\.request\.status\) && !canExpire;/,
    );
    expect(absenceActionsSource).toMatch(
      /const hasReviewActions =[\s\S]+mode === "queue" && canManage && canReviewNow\(item, now\);/,
    );
    expect(absenceActionsSource).toMatch(
      /if \(!canCancelOwn && !canExpire && !hasReviewActions\) \{[\s\S]+return <ActionGuidance messages=\{actionMessages\} \/>;/,
    );
    expect(absenceMessagesSource).toMatch(
      /CLOSED_STATUSES\.has\(item\.request\.status\)[\s\S]+No puede cancelarse porque ya esta/,
    );
    expect(absenceMessagesSource).toMatch(
      /CLOSED_STATUSES\.has\(item\.request\.status\)[\s\S]+No puede aprobarse ni rechazarse porque ya esta/,
    );

    expect(requestsSource).toMatch(
      /const CLOSED_REQUEST_STATUSES = new Set\(\[[\s\S]+"rejected"[\s\S]+"cancelled"[\s\S]+"expired"[\s\S]+"applied"[\s\S]+\]\);/,
    );
    expect(getFunctionSource(requestsSource, "blockIsNotActionable")).toMatch(
      /return status === "cancelled" \|\| status === "completed";/,
    );
    expect(getFunctionSource(requestsSource, "getActionBlockReason")).toMatch(
      /CLOSED_REQUEST_STATUSES\.has\(item\.request\.status\)[\s\S]+return null;[\s\S]+blockIsNotActionable\(block\.status\)[\s\S]+La clase esta cancelada o completada/,
    );
    expect(getFunctionSource(requestsSource, "getOwnOfferedTargets")).toMatch(
      /item\.request\.status !== "pending" && item\.request\.status !== "offered"[\s\S]+return \[\];[\s\S]+getActionBlockReason\(item, displayData, now\)[\s\S]+return \[\];/,
    );
    expect(getFunctionSource(requestsSource, "canCancelOwnRequest")).toMatch(
      /!CLOSED_REQUEST_STATUSES\.has\(item\.request\.status\)[\s\S]+item\.request\.status !== "approved"[\s\S]+!getActionBlockReason\(item, displayData, now\)/,
    );
    expect(getFunctionSource(requestsSource, "canRejectRequest")).toMatch(
      /!CLOSED_REQUEST_STATUSES\.has\(item\.request\.status\)[\s\S]+!getActionBlockReason\(item, displayData, now\)/,
    );
    expect(getFunctionSource(requestsSource, "canApplyRequest")).toMatch(
      /item\.request\.status === "approved"[\s\S]+!getActionBlockReason\(item, displayData, now\)/,
    );
    expect(requestActionsSource).toMatch(
      /ownTargets\.length === 0[\s\S]+!hasOwnCancel[\s\S]+!hasManagementActions[\s\S]+!hasExpiryAction[\s\S]+Solo lectura en este estado o para tu rol/,
    );
  });

  test("keeps terminal visible controls absent, disabled, or explicitly reversible", () => {
    const scheduleDetailSource = readProjectFile(
      "src/app/(app)/app/schedule/schedule-block-detail-panels.tsx",
    );
    const templatesSource = readProjectFile(
      "src/app/(app)/app/templates/page.tsx",
    );
    const templateApplySubmitSource = readProjectFile(
      "src/app/(app)/app/templates/template-apply-submit.tsx",
    );
    const timePageSource = readProjectFile("src/app/(app)/app/time/page.tsx");
    const operationalEventsSource = readProjectFile(
      "src/lib/operational-events.ts",
    );
    const scheduleSlotCreateDialogSource = readProjectFile(
      "src/app/(app)/app/schedule/schedule-slot-create-dialog.tsx",
    );
    const assignmentPanelSource = getFunctionSource(
      scheduleDetailSource,
      "ScheduleCoachAssignForm",
    );
    const templateCardSource = getFunctionSource(templatesSource, "TemplateCard");
    const archivedTemplateCardSource = getFunctionSource(
      templatesSource,
      "ArchivedTemplateCard",
    );
    const overtimeStatusFormSource = getFunctionSource(
      timePageSource,
      "OvertimeCandidateStatusForm",
    );

    expect(assignmentPanelSource).toMatch(
      /const canAssign = isActiveBlock && availableCoaches\.length > 0;/,
    );
    expect(assignmentPanelSource).toMatch(
      /<select[\s\S]+disabled=\{!canAssign\}[\s\S]+name="coachProfileId"/,
    );
    expect(assignmentPanelSource).toMatch(
      /<Button[\s\S]+disabled=\{!canAssign\}[\s\S]+type="submit"/,
    );
    expect(assignmentPanelSource).toMatch(
      /!isActiveBlock[\s\S]+Los bloques cancelados o completados no admiten nuevas asignaciones/,
    );

    expect(templateCardSource).toMatch(
      /const templateArchived = template\.status === "archived";/,
    );
    expect(templateCardSource).toMatch(
      /!templateArchived \? \([\s\S]+<TemplateArchiveDangerZone/,
    );
    expect(templateCardSource).toMatch(
      /canManageTemplates && !templateArchived \? \([\s\S]+<TemplateBlocksEditor/,
    );
    expect(templateCardSource).toMatch(
      /canManageTemplates && !templateArchived \? \([\s\S]+<TemplateBlockCreateForm/,
    );
    expect(getFunctionSource(templatesSource, "ApplyTemplateForm")).toMatch(
      /const canApply = template\.status === "active" && blockCount > 0;/,
    );
    expect(templateApplySubmitSource).toMatch(
      /<Button disabled=\{!canApply\} type="submit">/,
    );
    expect(templateApplySubmitSource).toMatch(
      /<Button[\s\S]+disabled=\{!canApply\}[\s\S]+type="button"/,
    );
    expect(archivedTemplateCardSource).toMatch(
      /const recoverable = canRecoverTemplate\(template\.recoverable_until, now\);[\s\S]+action=\{restoreScheduleTemplate\}[\s\S]+<Button disabled=\{!recoverable\} type="submit" variant="outline">[\s\S]+Recuperar como borrador/,
    );

    expect(timePageSource).toMatch(
      /const overtimeCandidateTerminalStatuses = new Set<OvertimeCandidateStatus>\(\[[\s\S]+"closed"[\s\S]+"superseded"[\s\S]+\]\);/,
    );
    expect(overtimeStatusFormSource).toMatch(
      /if \(overtimeCandidateTerminalStatuses\.has\(candidate\.status\)\) \{[\s\S]+return <Badge variant="outline">Sin acciones<\/Badge>;/,
    );
    expect(overtimeStatusFormSource).toMatch(
      /candidate\.status === "detected" \? "needs_review" : candidate\.status/,
    );

    expect(getTsFunctionSource(operationalEventsSource, "listOperationalEvents")).toMatch(
      /if \(canManage\) \{[\s\S]+if \(!validation\.value\.includeArchived\) \{[\s\S]+query = query\.neq\("status", "archived"\);/,
    );
    expect(scheduleSlotCreateDialogSource).toContain(
      "createOperationalEventFromForm",
    );
    expect(scheduleSlotCreateDialogSource).not.toContain(
      "setOperationalEventStatusFromForm",
    );
    expect(scheduleSlotCreateDialogSource).not.toContain(
      "updateOperationalEventFromForm",
    );
  });
});

test.describe("visible protected identifier exposure hygiene local source guardrails", () => {
  test("keeps visible UUID tooling out of normal team account flows", () => {
    const visibleUuidFiles = collectVisibleAppSurfaceFiles()
      .filter((filePath) => /\bUUID\b/.test(readFileSync(filePath, "utf8")))
      .map((filePath) =>
        path.relative(process.cwd(), filePath).replace(/\\/g, "/"),
      )
      .sort();

    expect(visibleUuidFiles).toEqual([]);

    const coachesSource = readProjectFile("src/app/(app)/app/coaches/page.tsx");
    const invitationFormSource = getFunctionSource(
      coachesSource,
      "TeamInvitationCreateForm",
    );
    const directAccountCreateFormSource = getFunctionSource(
      coachesSource,
      "DirectTeamAccountCreateForm",
    );

    expect(coachesSource).not.toMatch(/\bUUID\b/);
    expect(coachesSource).not.toContain("Herramientas avanzadas");
    expect(coachesSource).not.toContain("Crear acceso");
    expect(invitationFormSource).not.toMatch(/\bUUID\b/);
    expect(coachesSource).not.toContain("Completar vinculaciones");
    expect(coachesSource).not.toContain("Vincular ficha con cuenta");
    expect(coachesSource).not.toContain("Crear ficha para cuenta existente");
    expect(directAccountCreateFormSource).toContain("Contraseña temporal");
    expect(directAccountCreateFormSource).toContain('name="password"');
    expect(directAccountCreateFormSource).toContain('name="confirmPassword"');
    expect(directAccountCreateFormSource).toContain("Crear cuenta");
    expect(directAccountCreateFormSource).toContain(
      "obligada a cambiarla",
    );
    expect(directAccountCreateFormSource).not.toMatch(/\bUUID\b|Supabase Auth/);
  });

  test("keeps team account creation and review states visible without normal UUID dependency", () => {
    const coachesSource = readProjectFile("src/app/(app)/app/coaches/page.tsx");
    const coachesActionsSource = readProjectFile(
      "src/app/(app)/app/coaches/actions.ts",
    );
    const coachesLibSource = readProjectFile("src/lib/coaches.ts");
    const invitationFormSource = getFunctionSource(
      coachesSource,
      "TeamInvitationCreateForm",
    );
    const directAccountCreateFormSource = getFunctionSource(
      coachesSource,
      "DirectTeamAccountCreateForm",
    );
    const invitationStatusBadgeSource = getFunctionSource(
      coachesSource,
      "TeamInvitationStatusBadge",
    );
    const teamUserCardSource = getFunctionSource(
      coachesSource,
      "TeamUserCard",
    );
    const teamUsersSectionSource = getFunctionSource(
      coachesSource,
      "TeamUsersSection",
    );
    const reviewNoticeSource = getFunctionSource(
      coachesSource,
      "TeamLinkingReviewNotice",
    );
    const createCoachProfileSource = getTsFunctionSource(
      coachesActionsSource,
      "createCoachProfile",
    );
    const accountLinkActionSource = getTsFunctionSource(
      coachesActionsSource,
      "linkCoachProfileToExistingAccount",
    );
    const validateAccountLinkSource = getFunctionSource(
      coachesLibSource,
      "validateCoachAccountLinkForm",
    );

    expect(reviewNoticeSource).toContain("Revisar datos de acceso");
    expect(reviewNoticeSource).toContain("Datos sin cuenta");
    expect(coachesSource).toContain("Sin cuenta vinculada");
    expect(reviewNoticeSource).toContain("Invitación pendiente");
    expect(reviewNoticeSource).toContain(
      "crear una cuenta con contraseña temporal",
    );
    expect(invitationFormSource).toContain(
      "datos pendientes de vincular cuenta",
    );
    expect(invitationFormSource).toContain(
      "Datos operativos asociados",
    );
    expect(invitationFormSource).not.toMatch(/\bUUID\b/);
    expect(invitationStatusBadgeSource).toContain("Invitación pendiente");
    expect(coachesSource).not.toContain("Completar vinculaciones");
    expect(coachesSource).not.toContain("Vincular ficha con cuenta");
    expect(coachesSource).not.toContain("Crear ficha para cuenta existente");
    expect(directAccountCreateFormSource).toContain("Contraseña temporal");
    expect(directAccountCreateFormSource).toContain('name="password"');
    expect(directAccountCreateFormSource).toContain('name="confirmPassword"');
    expect(directAccountCreateFormSource).toContain("Crear cuenta");
    expect(directAccountCreateFormSource).not.toMatch(/\bUUID\b|Supabase Auth/);
    expect(teamUserCardSource).toContain("<TeamLinkStatusBadge");
    expect(teamUserCardSource).toContain("<TeamOperationalStatusBadge");
    expect(teamUserCardSource).toContain("Acceso y permisos");
    expect(teamUserCardSource).toContain("Datos operativos");
    expect(teamUsersSectionSource).toContain("Usuarios del equipo");
    expect(teamUsersSectionSource).toContain("<TeamUserFiltersCard");
    expect(coachesSource).not.toContain("Herramientas avanzadas");
    expect(coachesSource).not.toContain("Accesos del equipo");
    expect(coachesSource).not.toContain("Fichas de entrenador");
    expect(coachesSource).not.toContain("Filtrar fichas");
    expect(coachesSource).not.toMatch(/\bUUID\b/);
    expect(coachesSource).not.toContain("Solo para cuentas Auth existentes");
    expect(coachesSource).not.toContain("Estas herramientas no");
    expect(validateAccountLinkSource).not.toContain("validateMembershipForm");
    expect(accountLinkActionSource).toMatch(
      /existingMembershipResult[\s\S]+if \(!existingMembership\)[\s\S]+membership-required/,
    );
    expect(accountLinkActionSource).not.toMatch(
      /\.from\("organization_memberships"\)[\s\S]+\.insert\(/,
    );
    expect(accountLinkActionSource).not.toContain("validation.values.role");
    expect(accountLinkActionSource).not.toContain("validation.values.status");
    expect(createCoachProfileSource).toContain(
      'getCoachActionContext(formData, "team-access")',
    );
    expect(createCoachProfileSource).toMatch(
      /\.from\("person_profiles"\)[\s\S]+\.eq\("organization_id", context\.organization\.id\)[\s\S]+\.eq\("user_id", validation\.values\.userId\)/,
    );
    expect(createCoachProfileSource).toMatch(
      /\.from\("person_profiles"\)[\s\S]+\.insert\({[\s\S]+display_name: validation\.values\.displayName[\s\S]+user_id: validation\.values\.userId[\s\S]+visibility_status: "visible"/,
    );
    expect(createCoachProfileSource).toMatch(
      /\.from\("coach_profiles"\)[\s\S]+person_profile_id: personProfile\.id[\s\S]+user_id: validation\.values\.userId/,
    );
  });

  test("keeps visible technical identifier fallbacks shortened before display", () => {
    const visibleSourceFiles = collectVisibleAppSurfaceFiles();
    const rawTechnicalIdTemplateViolations = visibleSourceFiles.flatMap(
      (filePath) => {
        const relativePath = path
          .relative(process.cwd(), filePath)
          .replace(/\\/g, "/");
        const source = readFileSync(filePath, "utf8");

        return [
          ...source.matchAll(
            /`[^`]*\$\{[^}]*\b(?:user_id|person_profile_id|coach_profile_id|organization_id|time_record_id|time_punch_id)\b[^}]*\}[^`]*`/g,
          ),
        ]
          .filter((match) => !/\b(?:shortId|formatShortId)\s*\(/.test(match[0]))
          .map((match) => `${relativePath}: ${match[0]}`);
      },
    );

    expect(rawTechnicalIdTemplateViolations).toEqual([]);

    const coachesSource = readProjectFile("src/app/(app)/app/coaches/page.tsx");
    const coverageSource = readProjectFile("src/app/(app)/app/coverage/page.tsx");
    const statsSource = readProjectFile("src/app/(app)/app/stats/page.tsx");
    const timeSource = readProjectFile("src/app/(app)/app/time/page.tsx");
    const dashboardSource = readProjectFile("src/app/(app)/app/page.tsx");

    const membershipIdentitySource = getFunctionSource(
      coachesSource,
      "getMembershipIdentity",
    );
    const coachProfileIdentitySource = getFunctionSource(
      coachesSource,
      "getCoachProfileIdentity",
    );

    expect(membershipIdentitySource).toContain("Acceso sin persona visible");
    expect(membershipIdentitySource).toContain("Revisar vinculación");
    expect(membershipIdentitySource).not.toMatch(/shortId|Cuenta MVP|Miembro/);
    expect(coachProfileIdentitySource).toContain("Sin cuenta vinculada");
    expect(coachProfileIdentitySource).toContain(
      "Ficha con cuenta sin persona visible",
    );
    expect(coachProfileIdentitySource).toContain("Ficha sin persona visible");
    expect(coachProfileIdentitySource).toContain("Ficha incompleta");
    expect(coachProfileIdentitySource).not.toMatch(
      /shortId|Cuenta MVP|Entrenador \$\{|Persona pendiente/,
    );
    expect(getFunctionSource(coverageSource, "getCoachDisplay")).toMatch(
      /Cuenta sin persona visible \(\$\{shortId\(coachProfile\.user_id\)\}\)[\s\S]+Entrenador sin perfil visible \$\{shortId\(coachProfile\.id\)\}[\s\S]+Perfil t.cnico incompleto \$\{shortId\(coachProfile\.id\)\}/,
    );
    expect(getFunctionSource(statsSource, "getCoachDisplay")).toMatch(
      /Cuenta sin persona visible \(\$\{shortId\(coachProfile\.user_id\)\}\)[\s\S]+Entrenador sin perfil visible \$\{shortId\(coachProfile\.id\)\}[\s\S]+Perfil t.cnico incompleto \$\{shortId\(coachProfile\.id\)\}/,
    );
    expect(timeSource).toMatch(
      /function formatShortId\(value: string \| null \| undefined\) \{[\s\S]+return value \? `ID \$\{value\.slice\(0, 8\)\}` : "Sin dato";[\s\S]+\}/,
    );
    expect(dashboardSource).toMatch(
      /Persona \{shortId\(approval\.person_profile_id\)\}/,
    );
  });

  test("keeps rendered protected text away from storage, audit and provider internals", () => {
    const protectedRenderableFiles = collectVisibleAppSurfaceFiles().filter(
      (filePath) => filePath.endsWith(".tsx"),
    );
    const forbiddenRenderedTechnicalTerms =
      /\b(?:user_id|person_profile_id|coach_profile_id|organization_id|storage_path|storage_bucket|document-files|profile-assets|profile-signatures|document_access_events|operational_audit_events|provider_payload|token_hash|signedUrl|signed_url|service_role)\b/i;
    const renderedTextViolations = protectedRenderableFiles.flatMap((filePath) => {
      const relativePath = path
        .relative(process.cwd(), filePath)
        .replace(/\\/g, "/");
      const source = readFileSync(filePath, "utf8");
      const renderedTextMatches = [
        ...source.matchAll(/>[^\n<{]*</g),
        ...source.matchAll(
          /\b(?:title|description|aria-label|placeholder)\s*=\s*["'][^"']*["']/g,
        ),
      ];

      return renderedTextMatches
        .map((match) => match[0])
        .filter((match) => forbiddenRenderedTechnicalTerms.test(match))
        .map((match) => `${relativePath}: ${match}`);
    });

    expect(renderedTextViolations).toEqual([]);
  });
});

test.describe("visible protected personal contact hygiene local source guardrails", () => {
  test("keeps Auth email display scoped to own account, session and managed invitations", () => {
    const protectedSourceFiles = collectProtectedAppSurfaceFiles();
    const authEmailMatches = protectedSourceFiles.flatMap((filePath) => {
      const relativePath = path
        .relative(process.cwd(), filePath)
        .replace(/\\/g, "/");
      const source = readFileSync(filePath, "utf8");

      return [...source.matchAll(/\b(?:user|context\.user)\.email\b/g)].map(
        (match) => `${relativePath}: ${match[0]}`,
      );
    });

    expect(authEmailMatches.sort()).toEqual([
      "src/app/(app)/app/account/page.tsx: user.email",
      "src/app/(app)/app/coaches/actions.ts: context.user.email",
      "src/app/(app)/app/coaches/actions.ts: context.user.email",
      "src/app/(app)/app/layout.tsx: user.email",
    ]);

    const accountSource = readProjectFile("src/app/(app)/app/account/page.tsx");
    const appLayoutSource = readProjectFile("src/app/(app)/app/layout.tsx");
    const coachActionsSource = readProjectFile(
      "src/app/(app)/app/coaches/actions.ts",
    );

    expect(accountSource).toMatch(
      /<MetaItem label="Email de acceso">[\s\S]+\{userEmail \?\? "Email no disponible"\}/,
    );
    expect(accountSource).toMatch(
      /<AccountSummaryCard[\s\S]+userEmail=\{user\.email\}/,
    );
    expect(appLayoutSource).toContain("{user.email ?? user.id}");
    expect(
      [
        ...coachActionsSource.matchAll(
          /invitedByName: context\.user\.email \?\? "BoxOps"/g,
        ),
      ],
    ).toHaveLength(2);
  });

  test("keeps team identities from using private emails as public labels", () => {
    const coachesSource = readProjectFile(
      "src/app/(app)/app/coaches/page.tsx",
    );
    const membershipIdentitySource = getFunctionSource(
      coachesSource,
      "getMembershipIdentity",
    );
    const coachProfileIdentitySource = getFunctionSource(
      coachesSource,
      "getCoachProfileIdentity",
    );
    const teamUserCardSource = getFunctionSource(
      coachesSource,
      "TeamUserCard",
    );
    const invitationSectionSource = getFunctionSource(
      coachesSource,
      "TeamInvitationsSection",
    );
    const teamIdentitySource = [
      membershipIdentitySource,
      coachProfileIdentitySource,
      teamUserCardSource,
    ].join("\n");

    // Invitations may mention email actions, but team identity labels/cards
    // labels/cards must keep using visible person labels instead of private emails.
    expect(teamIdentitySource).not.toMatch(
      /\b(?:email|email_normalized|public_email|publicEmail|user\.email)\b/i,
    );
    expect(invitationSectionSource).toContain("{invitation.email_normalized}");
    expect(invitationSectionSource).toMatch(
      /description="Invitaciones por email pendientes de aceptar o revisar\."/,
    );
  });

  test("keeps public_email limited to the explicit own-profile field", () => {
    const publicEmailSourceFiles = collectProtectedAppSurfaceFiles()
      .filter((filePath) =>
        /\b(?:public_email|publicEmail)\b/.test(readFileSync(filePath, "utf8")),
      )
      .map((filePath) =>
        path.relative(process.cwd(), filePath).replace(/\\/g, "/"),
      )
      .sort();

    expect(publicEmailSourceFiles).toEqual([
      "src/app/(app)/app/account/actions.ts",
      "src/app/(app)/app/account/page.tsx",
    ]);

    const accountActionsSource = readProjectFile(
      "src/app/(app)/app/account/actions.ts",
    );
    const accountSource = readProjectFile("src/app/(app)/app/account/page.tsx");

    expect(accountActionsSource).toMatch(
      /public_email: validation\.values\.publicEmail[\s\S]+\.eq\("organization_id", context\.organization\.id\)[\s\S]+\.eq\("user_id", context\.user\.id\)/,
    );
    expect(accountSource).toContain(
      '"id, user_id, full_name, display_name, preferred_alias, public_email, visibility_status, status"',
    );
    expect(accountSource).toMatch(
      /<span className="text-sm font-medium">Email p.blico<\/span>[\s\S]+name="publicEmail"[\s\S]+type="email"/,
    );
  });

  test("keeps account labor data as a safe placeholder until the HR model exists", () => {
    const accountSource = readProjectFile("src/app/(app)/app/account/page.tsx");

    expect(accountSource).toContain("Datos laborales");
    expect(accountSource).toContain("Puesto");
    expect(accountSource).toContain("Antigüedad");
    expect(accountSource).toContain("Jornada");
    expect(accountSource).toContain("Desbloqueo seguro pendiente");
    expect(accountSource).toContain("Por configurar");
    expect(accountSource).toMatch(/reautenticación\s+real/);
    expect(accountSource).not.toMatch(/\bemployment_profiles\b/);
    expect(accountSource).not.toMatch(/\bsensitive_hr\b/);
    expect(accountSource).not.toMatch(/\bpayroll_private_manage\b/);
  });
});

test.describe("visible protected free-text field hygiene local source guardrails", () => {
  test("keeps protected notes and reason summaries operational and minimized", () => {
    const protectedTsxFiles = collectProtectedAppSurfaceFiles().filter(
      (filePath) => filePath.endsWith(".tsx"),
    );
    const freeTextControls: Array<{
      lineNumber: number;
      name: "notes" | "reasonSummary";
      relativePath: string;
      snippet: string;
    }> = [];

    for (const filePath of protectedTsxFiles) {
      const relativePath = path
        .relative(process.cwd(), filePath)
        .replace(/\\/g, "/");
      const source = readFileSync(filePath, "utf8");

      for (const match of source.matchAll(
        /<(?:Input|Textarea)\b[^>]*\bname\s*=\s*["'](notes|reasonSummary)["'][^>]*>/g,
      )) {
        const index = match.index ?? 0;
        const snippet = source.slice(
          Math.max(0, index - 700),
          Math.min(source.length, index + 700),
        );

        freeTextControls.push({
          lineNumber: source.slice(0, index).split(/\r?\n/).length,
          name: match[1] as "notes" | "reasonSummary",
          relativePath,
          snippet,
        });
      }
    }

    expect(
      freeTextControls
        .map(({ name, relativePath }) => `${relativePath}: ${name}`)
        .sort(),
    ).toEqual([
      "src/app/(app)/app/absences/page.tsx: reasonSummary",
      "src/app/(app)/app/coaches/page.tsx: notes",
      "src/app/(app)/app/coaches/page.tsx: notes",
      "src/app/(app)/app/coaches/page.tsx: notes",
      "src/app/(app)/app/requests/request-creation-form.tsx: reasonSummary",
      "src/app/(app)/app/schedule/schedule-block-detail-panels.tsx: notes",
      // Operational event notes are context-only and validated by
      // normalizeOptionalNotes with sensitive-text rejection.
      "src/app/(app)/app/schedule/schedule-operational-event-panels.tsx: notes",
      "src/app/(app)/app/schedule/schedule-slot-create-dialog.tsx: notes",
      "src/app/(app)/app/schedule/schedule-slot-create-dialog.tsx: notes",
      "src/app/(app)/app/schedule/staff-work-window-form-fields.tsx: notes",
      "src/app/(app)/app/templates/page.tsx: notes",
      "src/app/(app)/app/templates/template-blocks-editor.tsx: notes",
      "src/app/(app)/app/templates/template-blocks-editor.tsx: notes",
      "src/app/(app)/app/time/page.tsx: notes",
    ]);

    const operationalOrMinimizedSignalPattern =
      /\b(?:operativ[a-z]*|intern[a-z]*|breve|corta|resumen|mensaje|contexto|copiar[a-z]*|aplican|comunes)\b/;
    const sensitiveTermPattern =
      /\b(?:salario|payroll|nomina|document[a-z]*|justificante[a-z]*|salud|diagnostic[a-z]*|medic[a-z]*|ubicacion|geolocalizacion|token[a-z]*|urls?|secreto[a-z]*|bancari[a-z]*|iban|contrato[a-z]*|dni|pasaporte)\b/;
    const negatedSensitiveContextPattern =
      /\b(?:no incluyas|no registra|no activa|no es|no puede incluir|sin datos|sin |evita|evitar|rechaz|bloquea|fuera|debe evitar)\b/;

    for (const control of freeTextControls) {
      const normalizedSnippet = normalizeClaimScanText(control.snippet);
      const maxLengthMatch = control.snippet.match(/maxLength=\{(\d+)\}/);
      const location = `${control.relativePath}:${control.lineNumber}`;

      expect(maxLengthMatch, `${location} keeps maxLength`).not.toBeNull();
      expect(
        Number(maxLengthMatch?.[1] ?? Number.POSITIVE_INFINITY),
        `${location} keeps bounded free text`,
      ).toBeLessThanOrEqual(control.name === "reasonSummary" ? 160 : 1000);
      expect(
        normalizedSnippet,
        `${location} frames free text as operational/minimized`,
      ).toMatch(operationalOrMinimizedSignalPattern);

      const lines = control.snippet.split(/\r?\n/);
      const unsafeSensitiveLines = lines.flatMap((line, index) => {
        const normalizedLine = normalizeClaimScanText(line);

        if (!sensitiveTermPattern.test(normalizedLine)) {
          return [];
        }

        const normalizedContext = normalizeClaimScanText(
          lines.slice(Math.max(0, index - 2), index + 1).join(" "),
        );

        return negatedSensitiveContextPattern.test(normalizedContext)
          ? []
          : [`${location}: ${line.trim()}`];
      });

      expect(unsafeSensitiveLines).toEqual([]);
    }
  });
});

test.describe("visible file input and upload hygiene local source guardrails", () => {
  test("keeps visible file inputs limited to own avatar and minimal document upload", () => {
    const visibleSourceFiles = collectVisibleAppSurfaceFiles();
    const fileInputs = visibleSourceFiles.flatMap((filePath) => {
      const relativePath = path
        .relative(process.cwd(), filePath)
        .replace(/\\/g, "/");
      const source = readFileSync(filePath, "utf8");

      return [
        ...source.matchAll(
          /<(?:input|Input)\b[\s\S]*?\/>/g,
        ),
      ]
        .filter((match) => /\btype\s*=\s*["']file["']/.test(match[0]))
        .map((match) => ({
          index: match.index ?? 0,
          relativePath,
          source,
          tag: match[0],
        }));
    });

    expect(
      fileInputs
        .map((input) => `${input.relativePath}: ${input.tag.match(/\bname\s*=\s*["']([^"']+)/)?.[1] ?? "unknown"}`)
        .sort(),
    ).toEqual([
      "src/app/(app)/app/account/page.tsx: avatar",
      "src/app/(app)/app/documents/page.tsx: documentFile",
    ]);

    const avatarInput = fileInputs.find((input) =>
      /\bname\s*=\s*"avatar"/.test(input.tag),
    );
    const documentInput = fileInputs.find((input) =>
      /\bname\s*=\s*"documentFile"/.test(input.tag),
    );

    expect(avatarInput?.relativePath).toBe(
      "src/app/(app)/app/account/page.tsx",
    );
    expect(avatarInput?.tag).toMatch(/\bname\s*=\s*"avatar"/);
    expect(avatarInput?.tag).toMatch(
      /\baccept\s*=\s*"image\/jpeg,image\/png,image\/webp"/,
    );
    expect(avatarInput?.tag).not.toMatch(
      /\b(?:multiple|capture)\b|application\/|text\/|\.pdf|\.docx?|\.xlsx?|\.csv|\.txt/i,
    );

    const formStart = avatarInput?.source.lastIndexOf("<form", avatarInput.index);
    const formEnd = avatarInput?.source.indexOf("</form>", avatarInput.index);

    expect(formStart).toBeGreaterThanOrEqual(0);
    expect(formEnd).toBeGreaterThan(avatarInput?.index ?? 0);

    const avatarForm = avatarInput?.source.slice(
      formStart,
      (formEnd ?? 0) + "</form>".length,
    ) ?? "";

    expect(avatarForm).toMatch(/\baction=\{updateOwnAvatar\}/);
    expect(avatarForm).toMatch(/\bname="organizationId"/);
    expect(avatarForm).not.toMatch(
      /\b(?:person_profile_id|personProfileId|assetId|signatureId|documentId|documentVersionId|storage_path|storagePath|storage_bucket|storageBucket|document-files|signedUrl|createSignedUrl|PROFILE_ASSETS_BUCKET|PROFILE_SIGNATURES_BUCKET)\b/i,
    );

    expect(documentInput?.relativePath).toBe(
      "src/app/(app)/app/documents/page.tsx",
    );
    expect(documentInput?.tag).toMatch(/\bname\s*=\s*"documentFile"/);
    expect(documentInput?.tag).toMatch(/\baccept\s*=\{DOCUMENT_UPLOAD_ACCEPT\}/);
    expect(documentInput?.tag).not.toMatch(/\b(?:multiple|capture)\b/i);

    const documentFormStart = documentInput?.source.lastIndexOf(
      "<form",
      documentInput.index,
    );
    const documentFormEnd = documentInput?.source.indexOf(
      "</form>",
      documentInput.index,
    );

    expect(documentFormStart).toBeGreaterThanOrEqual(0);
    expect(documentFormEnd).toBeGreaterThan(documentInput?.index ?? 0);

    const documentForm =
      documentInput?.source.slice(
        documentFormStart,
        (documentFormEnd ?? 0) + "</form>".length,
      ) ?? "";

    expect(documentForm).toMatch(
      /\baction=\{createDocumentWithInitialFileUpload\}/,
    );
    expect(documentForm).toMatch(/\bname="organizationId"/);
    expect(documentForm).toMatch(/\bname="scope"/);
    expect(documentForm).not.toMatch(
      /\b(?:person_profile_id|personProfileId|coach_profile_id|documentId|documentVersionId|storage_path|storagePath|storage_bucket|storageBucket|document-files|signedUrl|createSignedUrl|document_access_grants|manage_grants|requires_signature)\b/i,
    );
  });

  test("keeps visible document upload minimal, server-routed and free of browser file previews", () => {
    const visibleSourceFiles = collectVisibleAppSurfaceFiles();
    const forbiddenVisibleFileUploadRules = [
      {
        name: "drag/drop file handler",
        pattern:
          /\b(?:onDrop|onDragOver|onDragEnter|onDragLeave)\s*=|\bDataTransfer\b|\bdropzone\b/i,
      },
      {
        name: "browser file reader or picker",
        pattern:
          /\b(?:new\s+)?FileReader\s*\(|\bshow(?:Save|Open)FilePicker\s*\(|\bshowDirectoryPicker\s*\(/,
      },
      {
        name: "object URL file preview",
        pattern: /\b(?:URL|webkitURL)\.createObjectURL\s*\(/,
      },
      {
        name: "multiple file input",
        pattern:
          /<(?:input|Input)\b(?=[\s\S]{0,700}\btype\s*=\s*["']file["'])(?=[\s\S]{0,700}\bmultiple\b)[\s\S]{0,700}\/>/i,
      },
      {
        name: "camera capture file input",
        pattern:
          /<(?:input|Input)\b(?=[\s\S]{0,700}\btype\s*=\s*["']file["'])(?=[\s\S]{0,700}\bcapture\b)[\s\S]{0,700}\/>/i,
      },
      {
        name: "browser-side upload progress API",
        pattern: /\bXMLHttpRequest\b|\bReadableStream\b|\bAbortController\b/i,
      },
    ];
    const violations = visibleSourceFiles.flatMap((filePath) => {
      const relativePath = path
        .relative(process.cwd(), filePath)
        .replace(/\\/g, "/");
      const source = readFileSync(filePath, "utf8");

      return forbiddenVisibleFileUploadRules
        .filter(({ pattern }) => pattern.test(source))
        .map(({ name }) => `${relativePath}: ${name}`);
    });
    const visibleSourceWithoutDocumentAction = visibleSourceFiles
      .filter(
        (filePath) =>
          path.relative(process.cwd(), filePath).replace(/\\/g, "/") !==
          "src/app/(app)/app/documents/actions.ts",
      )
      .map((filePath) => readFileSync(filePath, "utf8"))
      .join("\n");
    const documentActionSource = readProjectFile(
      "src/app/(app)/app/documents/actions.ts",
    );
    const signaturePadSource = readProjectFile(
      "src/app/(app)/app/account/signature-pad-form.tsx",
    );

    expect(violations).toEqual([]);
    expect(visibleSourceWithoutDocumentAction).not.toMatch(
      /\b(?:begin_document_version_upload|activate_document_version_upload|cancel_document_version_upload|document_access_grants|manage_grants|document_grant_manage|document-files|requires_signature|signature_evidence)\b/i,
    );
    expect(documentActionSource).toMatch(
      /validateMinimalDocumentUploadFile\(file, bytes\)[\s\S]+createHash\("sha256"\)[\s\S]+\.rpc\(\s*"begin_document_version_upload"/,
    );
    expect(documentActionSource).toMatch(
      /\.from\(DOCUMENT_FILES_BUCKET\)[\s\S]+\.upload\(pendingVersion\.storage_path[\s\S]+\.rpc\(\s*"activate_document_version_upload"/,
    );
    expect(documentActionSource).toContain("cancel_document_version_upload");
    expect(documentActionSource).toContain('status: "deleted"');
    expect(documentActionSource).not.toMatch(
      /createSignedUrl|signedUrl|document_access_grants|manage_grants|requires_signature:\s*true/,
    );
    expect(signaturePadSource).toMatch(
      /<input name="signatureDataUrl" ref=\{inputRef\} type="hidden" \/>/,
    );
    expect(signaturePadSource).not.toMatch(
      /<(?:input|Input)\b(?=[\s\S]{0,700}\btype\s*=\s*["']file["'])|DataTransfer|onDrop|FileReader|document-files|person_profile_id|assetId|signatureId/i,
    );
  });
});

test.describe("visible logging and error hygiene local source guardrails", () => {
  test("keeps app source free from console logging and visible raw error serialization", () => {
    const sourceFiles = collectSourceFiles(path.join(process.cwd(), "src"));
    const consoleViolations = sourceFiles.flatMap((filePath) => {
      const relativePath = path.relative(process.cwd(), filePath);
      const source = readFileSync(filePath, "utf8");

      return [...source.matchAll(/\bconsole\.(?:log|debug|info|warn|error|trace|table|dir|group|groupCollapsed)\b/g)]
        .map((match) => `${relativePath}:${match.index ?? 0}:${match[0]}`);
    });

    expect(consoleViolations).toEqual([]);

    const visibleSourceFiles = sourceFiles.filter((filePath) => {
      const normalizedPath = path
        .relative(process.cwd(), filePath)
        .replace(/\\/g, "/");

      return (
        normalizedPath.startsWith("src/app/") ||
        normalizedPath.startsWith("src/components/")
      );
    });
    const rawErrorExposureRules = [
      {
        name: "stringified error object",
        pattern: /\bJSON\.stringify\s*\(\s*(?:error|err|cause)\b/i,
      },
      {
        name: "string-cast error object",
        pattern: /\bString\s*\(\s*(?:error|err|cause)\b/i,
      },
      {
        name: "error stack exposure",
        pattern: /\b(?:error|err|cause)\.stack\b/i,
      },
      {
        name: "visible raw error message",
        pattern: /(?<!\$)\{\s*(?:error|err|cause)\.message\s*\}/i,
      },
      {
        name: "returned raw error message",
        pattern: /\b(?:error|message)\s*:\s*(?:error|err|cause)\.message\b/i,
      },
      {
        name: "redirected raw error message",
        pattern: /\bredirect\([\s\S]{0,160}(?:error|err|cause)\.message/i,
      },
    ];
    const rawErrorViolations = visibleSourceFiles.flatMap((filePath) => {
      const relativePath = path.relative(process.cwd(), filePath);
      const source = readFileSync(filePath, "utf8");

      return rawErrorExposureRules
        .filter(({ pattern }) => pattern.test(source))
        .map(({ name }) => `${relativePath}: ${name}`);
    });

    expect(rawErrorViolations).toEqual([]);

    const protectedErrorBoundarySource = readProjectFile(
      "src/app/(app)/app/error.tsx",
    );

    expect(protectedErrorBoundarySource).toContain("error.digest");
    expect(protectedErrorBoundarySource).not.toMatch(
      /error\.message|error\.stack|JSON\.stringify\(error\)|String\(error\)/,
    );
  });
});

test.describe("visible product claim hygiene local source guardrails", () => {
  test("keeps visible app copy away from beta, legal, AI, location, payroll and document capability promises", () => {
    const visibleSourceFiles = collectVisibleClaimSourceFiles();
    const restrictedVisibleClaimRules = [
      {
        name: "beta ready claim",
        pattern:
          /\b(?:beta\s+(?:lista|ready|preparad[ao]s?|validad[ao]s?|cerrad[ao]s?)|(?:list[ao]s?|ready|preparad[ao]s?|validad[ao]s?)\s+para\s+(?:la\s+)?beta)\b/i,
      },
      {
        name: "production ready claim",
        pattern:
          /\b(?:(?:produccion|production)\s+(?:lista|ready|preparad[ao]s?|validad[ao]s?)|(?:list[ao]s?|ready|preparad[ao]s?|validad[ao]s?)\s+para\s+(?:produccion|production))\b/i,
      },
      {
        name: "ASVS compliance claim",
        pattern:
          /\b(?:asvs[^\n.]{0,60}(?:conforme|cumple|compliant|certificad[ao]s?|validad[ao]s?)|(?:conforme|cumple|compliant|certificad[ao]s?|validad[ao]s?)[^\n.]{0,60}asvs)\b/i,
      },
      {
        name: "pentest claim",
        pattern: /\b(?:pentest|penetration\s+test)\b/i,
      },
      {
        name: "final legal compliance claim",
        pattern:
          /\b(?:cumplimiento\s+legal\s+definitivo|cierre\s+legal\s+definitivo|exporte\s+legal\s+definitivo)\b/i,
      },
      {
        name: "advanced or qualified e-signature claim",
        pattern:
          /\bfirma\s+electronica\s+(?:avanzada|cualificada|calificada)\b/i,
      },
      {
        name: "legal payroll claim",
        pattern:
          /\b(?:payroll|nomina)[^\n.]{0,60}\b(?:legal|definitiv[ao]s?|aprobada|aprobado|lista|listo|oficial|produccion)\b|\b(?:legal|definitiv[ao]s?|aprobada|aprobado|lista|listo|oficial)[^\n.]{0,60}\b(?:payroll|nomina)\b/i,
      },
      {
        name: "active geolocation claim",
        pattern:
          /\b(?:geolocalizacion|geolocation|geofencing)\b[^\n.]{0,60}\b(?:activa|activo|activad[ao]s?|funcional|habilitad[ao]s?|en\s+uso|list[ao]s?|ready)\b/i,
      },
      {
        name: "functional AI claim",
        pattern:
          /\b(?:ia|ai|inteligencia\s+artificial)\b[^\n.]{0,60}\b(?:funcional|activa|activo|activad[ao]s?|habilitad[ao]s?|en\s+uso|list[ao]s?|ready)\b/i,
      },
      {
        name: "signable document claim",
        pattern:
          /\b(?:documentos?|versiones?|archivos?)\b[^\n.]{0,60}\b(?:firmables?|para\s+firmar|firma\s+documental|firmar)\b|\bfirmar\s+(?:documentos?|versiones?|archivos?)\b/i,
      },
    ];
    const defensiveClaimContextPattern =
      /\b(?:no|sin|pendient[ea]s?|futur[ao]s?|bloquead[ao]s?|fuera\s+de|antes\s+de\s+beta|revision|revisa|controlad[ao]s?|intern[ao]s?)\b/i;

    const violations = visibleSourceFiles.flatMap((filePath) => {
      const relativePath = path.relative(process.cwd(), filePath);
      const lines = readFileSync(filePath, "utf8").split(/\r?\n/);

      return lines.flatMap((line, index) => {
        const normalizedLine = normalizeClaimScanText(line);
        const normalizedContext = normalizeClaimScanText(
          lines
            .slice(Math.max(0, index - 1), Math.min(lines.length, index + 2))
            .join(" "),
        );

        return restrictedVisibleClaimRules
          .filter(({ pattern }) => pattern.test(normalizedLine))
          .filter(
            () => !defensiveClaimContextPattern.test(normalizedContext),
          )
          .map(
            ({ name }) =>
              `${relativePath}:${index + 1}: ${name}: ${line.trim()}`,
          );
      });
    });

    const normalizedVisibleSourceFiles = visibleSourceFiles.map((filePath) =>
      filePath.replace(/\\/g, "/"),
    );

    expect(
      normalizedVisibleSourceFiles.some((filePath) =>
        filePath.includes("src/app"),
      ),
    ).toBe(true);
    expect(
      normalizedVisibleSourceFiles.some((filePath) =>
        filePath.includes("src/components"),
      ),
    ).toBe(true);
    expect(
      normalizedVisibleSourceFiles.some((filePath) =>
        filePath.includes("src/lib/navigation"),
      ),
    ).toBe(true);
    expect(violations).toEqual([]);
  });
});

test.describe("sensitive input local source guardrails", () => {
  test("keeps time tracking metadata and snapshots rejecting sensitive keys", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/lib/time-tracking.ts"),
      "utf8",
    );

    expect(source).toContain("const FORBIDDEN_JSON_KEY_PATTERN");

    for (const term of [
      "url",
      "uri",
      "path",
      "token",
      "secret",
      "signature",
      "storage",
      "document_hash",
      "latitude",
      "longitude",
      "coordinate",
      "geolocation",
      "gps",
    ]) {
      expect(source, `FORBIDDEN_JSON_KEY_PATTERN includes ${term}`).toMatch(
        new RegExp(`\\b${term}\\b`, "i"),
      );
    }

    expect(source).toMatch(
      /function hasForbiddenJsonKey[\s\S]+FORBIDDEN_JSON_KEY_PATTERN\.test\(key\)[\s\S]+hasForbiddenJsonKey\(nestedValue\)/,
    );
    expect(source).toMatch(
      /function normalizeJsonObject[\s\S]+hasForbiddenJsonKey\(value\)[\s\S]+invalid\(error\)/,
    );
    expect(source).toMatch(
      /normalizeJsonObject\(\{[\s\S]+error: "invalid_metadata"[\s\S]+MAX_METADATA_JSON_LENGTH/,
    );
    expect(source).toMatch(
      /normalizeJsonObject\(\{[\s\S]+error: "invalid_snapshot"[\s\S]+MAX_SNAPSHOT_JSON_LENGTH/,
    );
  });

  test("keeps absence summaries and time exports minimized", () => {
    const absenceSource = readFileSync(
      path.join(process.cwd(), "src/lib/absence-requests.ts"),
      "utf8",
    );
    const timeTrackingSource = readFileSync(
      path.join(process.cwd(), "src/lib/time-tracking.ts"),
      "utf8",
    );

    expect(absenceSource).toContain("const FORBIDDEN_REASON_SUMMARY_PATTERN");

    for (const term of [
      "data:",
      "base64",
      "token",
      "secret",
      "password",
      "credential",
      "signed-url",
      "signed_url",
      "storage",
      "document",
      "documento",
      "archivo",
      "justificante",
      "payroll",
      "salary",
      "salario",
      "nomina",
      "iban",
      "bank",
      "dni",
      "nif",
      "ssn",
      "national_id",
      "gps",
      "latitude",
      "longitude",
      "coordinate",
      "ubicacion",
      "location",
      "baja",
      "salud",
      "health",
      "medical",
      "diagnostic",
      "familia",
      "sancion",
      "disciplin",
    ]) {
      expect(
        absenceSource,
        `FORBIDDEN_REASON_SUMMARY_PATTERN includes ${term}`,
      ).toContain(term);
    }

    expect(absenceSource).toMatch(
      /function normalizeReasonSummary[\s\S]+FORBIDDEN_REASON_SUMMARY_PATTERN\.test\(summary\.value\)[\s\S]+invalid\("invalid-reason-summary"\)/,
    );
    expect(absenceSource).toMatch(
      /function validateCreateInput[\s\S]+const reasonSummary = normalizeReasonSummary\(input\.reasonSummary\)/,
    );
    expect(timeTrackingSource).toContain(
      "const MAX_TIME_EXPORT_RANGE_DAYS = 93;",
    );
    expect(timeTrackingSource).toContain("const MAX_TIME_EXPORT_ROWS = 1000;");
    expect(timeTrackingSource).toContain(".limit(MAX_TIME_EXPORT_ROWS + 1)");
    expect(timeTrackingSource).toMatch(
      /const exportMetadata = \{[\s\S]+internalReviewOnly: true[\s\S]+legalFinal: false[\s\S]+notesTextIncluded: false[\s\S]+payroll: false[\s\S]+snapshotsIncluded: false/,
    );
    expect(timeTrackingSource).toContain(
      "exporte interno revisable; no payroll; no cumplimiento legal definitivo",
    );
  });
});

test.describe("time tracking local source guardrails", () => {
  test("keeps own punches and corrections deriving person from auth plus tenant", () => {
    const timeTrackingSource = readProjectFile("src/lib/time-tracking.ts");
    const timeActionsSource = readProjectFile(
      "src/app/(app)/app/time/actions.ts",
    );
    const foundationMigrationSource = readProjectFile(
      "supabase/migrations/00010_time_tracking_manual_foundation.sql",
    );
    const createOwnPunchInput =
      timeTrackingSource.match(
        /export type CreateOwnTimePunchInput = \{[\s\S]+?\};/,
      )?.[0] ?? "";
    const createOwnPunchSource = getTsFunctionSource(
      timeTrackingSource,
      "createOwnTimePunch",
    );
    const requestOwnCorrectionSource = getTsFunctionSource(
      timeTrackingSource,
      "requestOwnTimeCorrection",
    );
    const createAndApplyOwnCorrectionSource = getTsFunctionSource(
      timeTrackingSource,
      "createAndApplyOwnTimeCorrection",
    );
    const resolveOwnCorrectionContextSource = getTsFunctionSource(
      timeActionsSource,
      "resolveOwnCorrectionContext",
    );
    const submitOwnCorrectionFromFormSource = getTsFunctionSource(
      timeActionsSource,
      "submitOwnTimeCorrectionFromForm",
    );
    const ownPunchSqlSource = getSqlFunctionSource(
      foundationMigrationSource,
      "create_own_time_punch",
    );

    expect(createOwnPunchInput).not.toMatch(/personProfileId|person_profile_id/i);
    expect(timeActionsSource).not.toMatch(
      /getFormString\(formData, "(?:personProfileId|person_profile_id|targetPersonProfileId|target_person_profile_id)"\)/,
    );
    expect(timeTrackingSource).toMatch(
      /async function resolveTimeTrackingContext[\s\S]+if \(requireOwnPersonProfile\)[\s\S]+\.from\("person_profiles"\)[\s\S]+\.eq\("organization_id", resolution\.organization\.id\)[\s\S]+\.eq\("user_id", user\.id\)[\s\S]+\.eq\("status", "active"\)/,
    );
    expect(createOwnPunchSource).toMatch(
      /requireOwnPersonProfile: true[\s\S]+requirePersonalAccess: true[\s\S]+validateOwnPunchReferences\({[\s\S]+ownPersonProfileId[\s\S]+userId: context\.data\.userId[\s\S]+\.rpc\(\s*"create_own_time_punch"[\s\S]+target_organization_id: context\.data\.organization\.id/,
    );
    expect(createOwnPunchSource).not.toContain("target_person_profile_id");
    expect(ownPunchSqlSource).toMatch(
      /current_user_id uuid := \(select auth\.uid\(\)\)[\s\S]+current_membership_id := public\.get_active_membership_id\(target_organization_id\)[\s\S]+own_person_profile_id := public\.get_own_person_profile_id\(target_organization_id\)/,
    );
    expect(ownPunchSqlSource).toMatch(
      /INSERT INTO public\.time_records[\s\S]+person_profile_id[\s\S]+own_person_profile_id[\s\S]+INSERT INTO public\.time_punches[\s\S]+person_profile_id[\s\S]+own_person_profile_id/,
    );
    expect(resolveOwnCorrectionContextSource).toMatch(
      /\.from\("person_profiles"\)[\s\S]+\.eq\("organization_id", resolution\.organization\.id\)[\s\S]+\.eq\("user_id", user\.id\)[\s\S]+\.eq\("status", "active"\)/,
    );
    expect(submitOwnCorrectionFromFormSource).toMatch(
      /\.from\("time_records"\)[\s\S]+\.eq\("organization_id", ownContext\.organizationId\)[\s\S]+\.eq\("person_profile_id", ownContext\.personProfileId\)/,
    );
    expect(submitOwnCorrectionFromFormSource).toMatch(
      /\.from\("time_punches"\)[\s\S]+\.eq\("organization_id", ownContext\.organizationId\)[\s\S]+\.eq\("person_profile_id", ownContext\.personProfileId\)/,
    );
    expect(submitOwnCorrectionFromFormSource).toMatch(
      /metadata: \{[\s\S]+schemaVersion: CORRECTION_SNAPSHOT_VERSION[\s\S]+source: "app_time_correction_form"[\s\S]+\}/,
    );
    expect(submitOwnCorrectionFromFormSource).not.toMatch(
      /personProfileId\s*:|person_profile_id\s*:/,
    );

    for (const functionSource of [
      requestOwnCorrectionSource,
      createAndApplyOwnCorrectionSource,
    ]) {
      expect(functionSource).toMatch(
        /requireOwnPersonProfile: true[\s\S]+requirePersonalAccess: true/,
      );
      expect(functionSource).toMatch(
        /\.from\("time_records"\)[\s\S]+\.eq\("organization_id", context\.data\.organization\.id\)[\s\S]+\.eq\("person_profile_id", ownPersonProfileId\)/,
      );
      expect(functionSource).toMatch(
        /\.from\("time_punches"\)[\s\S]+\.eq\("organization_id", context\.data\.organization\.id\)[\s\S]+\.eq\("person_profile_id", ownPersonProfileId\)/,
      );
    }
  });

  test("keeps review, queue, automatic punches and exports management-only and tenant-scoped", () => {
    const timeTrackingSource = readProjectFile("src/lib/time-tracking.ts");
    const timeActionsSource = readProjectFile(
      "src/app/(app)/app/time/actions.ts",
    );
    const scheduleAutoMigrationSource = readProjectFile(
      "supabase/migrations/00025_time_schedule_auto_punches.sql",
    );
    const staffWindowAutoMigrationSource = readProjectFile(
      "supabase/migrations/00047_staff_work_window_auto_time_punches.sql",
    );
    const scheduleAutoSqlSource = getSqlFunctionSource(
      scheduleAutoMigrationSource,
      "generate_schedule_auto_time_punches",
    );
    const staffWindowAutoSqlSource = getSqlFunctionSource(
      staffWindowAutoMigrationSource,
      "generate_staff_work_window_auto_time_punches",
    );
    const dueStaffWindowAutoSqlSource = getSqlFunctionSource(
      staffWindowAutoMigrationSource,
      "generate_due_staff_work_window_auto_time_punches",
    );

    for (const functionName of [
      "generateScheduleAutoTimePunches",
      "listTimeRecordsForReview",
      "listTimePunchesForReview",
      "listTimeCorrectionsForReview",
      "listTimeWeeklyApprovalsForReview",
      "generateTimeRecordsCsvExport",
    ]) {
      expect(
        getTsFunctionSource(timeTrackingSource, functionName),
        `${functionName} requires review access`,
      ).toMatch(/requireReviewAccess: true/);
    }

    expect(timeTrackingSource).toMatch(
      /function validateReviewReferenceFilters[\s\S]+ensureCenterBelongsToTenant[\s\S]+ensurePersonBelongsToTenant/,
    );
    expect(getTsFunctionSource(timeTrackingSource, "generateScheduleAutoTimePunches")).toMatch(
      /validateGenerateScheduleAutoTimePunchesInput\(input\)[\s\S]+resolveOrganizationTimeTrackingSettings[\s\S]+scheduleAutoPunchesEnabled[\s\S]+ensurePersonBelongsToTenant[\s\S]+\.rpc\(\s*"generate_schedule_auto_time_punches"[\s\S]+target_organization_id: context\.data\.organization\.id/,
    );
    expect(scheduleAutoSqlSource).toMatch(
      /public\.can_manage_time_tracking\(target_organization_id\)[\s\S]+public\.time_schedule_auto_is_enabled\(target_organization_id\)/,
    );
    expect(scheduleAutoSqlSource).toMatch(
      /target_person_profile_id IS NOT NULL[\s\S]+person_profile\.organization_id = target_organization_id[\s\S]+person_profile\.status = 'active'/,
    );
    expect(scheduleAutoSqlSource).toMatch(
      /Generated from assigned schedule; does not verify real presence\./,
    );
    expect(staffWindowAutoSqlSource).toMatch(
      /public\.can_manage_time_tracking\(target_organization_id\)[\s\S]+public\.time_schedule_auto_is_enabled\(target_organization_id\)/,
    );
    expect(staffWindowAutoSqlSource).toMatch(
      /target_person_profile_id IS NOT NULL[\s\S]+person_profile\.organization_id = target_organization_id[\s\S]+person_profile\.status = 'active'/,
    );
    expect(staffWindowAutoSqlSource).toMatch(
      /FROM public\.staff_work_windows work_window[\s\S]+work_window\.status = 'active'[\s\S]+person_profile\.visibility_status = 'visible'/,
    );
    expect(staffWindowAutoSqlSource).toMatch(
      /Generated from planned staff work window; does not verify real presence\./,
    );
    expect(staffWindowAutoMigrationSource).toMatch(
      /metadata ->> 'generatedFrom' = 'staff_work_window'[\s\S]+GRANT EXECUTE ON FUNCTION public\.generate_staff_work_window_auto_time_punches/,
    );
    expect(staffWindowAutoMigrationSource).toMatch(
      /REVOKE ALL ON FUNCTION public\.generate_due_staff_work_window_auto_time_punches\(timestamptz, uuid\)[\s\S]+FROM anon, authenticated/,
    );
    expect(dueStaffWindowAutoSqlSource).toMatch(
      /target_now[\s\S]+public\.time_schedule_auto_is_enabled\(organization\.id\)[\s\S]+'scheduler'/,
    );
    expect(scheduleAutoSqlSource).not.toMatch(
      /(?:INSERT INTO|UPDATE|DELETE FROM) public\.schedule_/,
    );
    expect(staffWindowAutoSqlSource).not.toMatch(
      /(?:INSERT INTO|UPDATE|DELETE FROM) public\.schedule_/,
    );
    expect(timeActionsSource).toMatch(
      /export async function detectOvertimeCandidatesFromForm[\s\S]+detectOperationalOvertimeCandidates\({[\s\S]+organizationId/,
    );
    expect(timeActionsSource).toMatch(
      /export async function setOvertimeCandidateStatusFromForm[\s\S]+setOvertimeCandidateStatus\({[\s\S]+organizationId/,
    );
    expect(timeActionsSource).not.toMatch(
      /payroll|document|signature|navigator\.geolocation|serviceWorker|PushManager|CacheStorage|OpenAI|anthropic|embeddings|pgvector|ai_/i,
    );
  });

  test("keeps weekly approval using the reviewer own signature and controlled time-record updates only", () => {
    const timeTrackingSource = readProjectFile("src/lib/time-tracking.ts");
    const weeklyApprovalMigrationSource = readProjectFile(
      "supabase/migrations/00026_time_weekly_closure_approval.sql",
    );
    const approveHelperSource = getTsFunctionSource(
      timeTrackingSource,
      "approveTimeWeeklyApproval",
    );
    const rejectHelperSource = getTsFunctionSource(
      timeTrackingSource,
      "rejectTimeWeeklyApproval",
    );
    const reopenHelperSource = getTsFunctionSource(
      timeTrackingSource,
      "reopenTimeWeeklyApproval",
    );
    const approveSqlSource = getSqlFunctionSource(
      weeklyApprovalMigrationSource,
      "approve_time_weekly_approval",
    );
    const rejectSqlSource = getSqlFunctionSource(
      weeklyApprovalMigrationSource,
      "reject_time_weekly_approval",
    );
    const reopenSqlSource = getSqlFunctionSource(
      weeklyApprovalMigrationSource,
      "reopen_time_weekly_approval",
    );
    const weeklyApprovalSources = [
      approveHelperSource,
      rejectHelperSource,
      reopenHelperSource,
      approveSqlSource,
      rejectSqlSource,
      reopenSqlSource,
    ].join("\n");

    for (const functionSource of [
      approveHelperSource,
      rejectHelperSource,
      reopenHelperSource,
    ]) {
      expect(functionSource).toMatch(
        /requireReviewAccess: true[\s\S]+target_organization_id: context\.data\.organization\.id/,
      );
    }

    expect(approveSqlSource).toMatch(
      /current_user_id uuid := \(select auth\.uid\(\)\)[\s\S]+current_person_profile_id := public\.get_own_person_profile_id\(target_organization_id\)[\s\S]+public\.can_manage_time_tracking\(target_organization_id\)/,
    );
    expect(approveSqlSource).toMatch(
      /FROM public\.profile_signatures profile_signature[\s\S]+profile_signature\.organization_id = target_organization_id[\s\S]+profile_signature\.person_profile_id = current_person_profile_id[\s\S]+profile_signature\.status = 'active'/,
    );
    expect(approveSqlSource).toMatch(
      /'profileSignatureId'[\s\S]+active_signature\.id[\s\S]+'personProfileId'[\s\S]+active_signature\.person_profile_id[\s\S]+'signatureHash'[\s\S]+active_signature\.signature_hash/,
    );
    expect(approveSqlSource).toMatch(
      /approved_by_person_profile_id = current_person_profile_id[\s\S]+approval_signature_profile_signature_id = active_signature\.id[\s\S]+approval_signature_snapshot = signature_snapshot/,
    );
    expect(approveSqlSource).toMatch(
      /UPDATE public\.time_records[\s\S]+person_profile_id = approved_approval\.person_profile_id[\s\S]+local_work_date BETWEEN approved_approval\.week_start_date AND approved_approval\.week_start_date \+ 6/,
    );
    expect(approveSqlSource).not.toMatch(/target_person_profile_id/);

    for (const functionSource of [rejectSqlSource, reopenSqlSource]) {
      expect(functionSource).toMatch(
        /current_person_profile_id := public\.get_own_person_profile_id\(target_organization_id\)[\s\S]+public\.can_manage_time_tracking\(target_organization_id\)/,
      );
    }

    expect(weeklyApprovalSources).not.toMatch(
      /(?:INSERT INTO|UPDATE|DELETE FROM) public\.schedule_/,
    );
    expect(weeklyApprovalSources).not.toMatch(
      /navigator\.geolocation|serviceWorker|PushManager|CacheStorage|OpenAI|anthropic|embeddings|pgvector|ai_/i,
    );
  });

  test("keeps time audit events tenant-scoped, minimized and read-limited", () => {
    const foundationMigrationSource = readProjectFile(
      "supabase/migrations/00010_time_tracking_manual_foundation.sql",
    );
    const correctionApplicationMigrationSource = readProjectFile(
      "supabase/migrations/00012_time_correction_application.sql",
    );
    const weeklyApprovalMigrationSource = readProjectFile(
      "supabase/migrations/00026_time_weekly_closure_approval.sql",
    );
    const metadataGuardSource = getSqlFunctionSource(
      foundationMigrationSource,
      "time_audit_event_metadata_is_safe",
    );
    const auditTriggerSource = getSqlFunctionSource(
      weeklyApprovalMigrationSource,
      "record_time_audit_event_from_trigger",
    );

    expect(foundationMigrationSource).toMatch(
      /CREATE TABLE public\.time_audit_events \([\s\S]+organization_id uuid NOT NULL REFERENCES public\.organizations\(id\) ON DELETE CASCADE[\s\S]+target_person_profile_id uuid[\s\S]+time_record_id uuid[\s\S]+time_punch_id uuid[\s\S]+time_record_correction_id uuid[\s\S]+time_weekly_approval_id uuid[\s\S]+time_export_id uuid[\s\S]+CONSTRAINT time_audit_events_metadata_safe[\s\S]+public\.time_audit_event_metadata_is_safe\(metadata\)/,
    );
    expect(foundationMigrationSource).toContain(
      "ALTER TABLE public.time_audit_events ENABLE ROW LEVEL SECURITY;",
    );
    expect(foundationMigrationSource).toMatch(
      /CREATE POLICY "Workers and managers can view time audit events"[\s\S]+target_person_profile_id = public\.get_own_person_profile_id\(organization_id\)[\s\S]+OR public\.can_manage_time_tracking\(organization_id\)/,
    );
    expect(foundationMigrationSource).toContain(
      "GRANT SELECT ON public.time_audit_events TO authenticated;",
    );
    expect(foundationMigrationSource).not.toMatch(
      /GRANT [^;]*(?:INSERT|UPDATE|DELETE)[^;]* ON public\.time_audit_events TO authenticated/i,
    );

    expect(metadataGuardSource).toMatch(
      /target_metadata IS NOT NULL[\s\S]+jsonb_typeof\(target_metadata\) = 'object'[\s\S]+length\(target_metadata::text\) <= 4000/,
    );
    for (const term of [
      "content",
      "body",
      "html",
      "raw",
      "base64",
      "url",
      "uri",
      "path",
      "token",
      "secret",
      "signature",
      "storage",
      "document_hash",
      "latitude",
      "longitude",
      "coordinate",
      "geolocation",
      "gps",
    ]) {
      expect(metadataGuardSource, `time audit metadata blocks ${term}`).toContain(
        term,
      );
    }

    expect(auditTriggerSource).toMatch(
      /target_organization_id := COALESCE\(NEW\.organization_id, OLD\.organization_id\)[\s\S]+actor_user_id := \(select auth\.uid\(\)\)[\s\S]+actor_membership_id := public\.get_active_membership_id\(target_organization_id\)[\s\S]+actor_person_profile_id := public\.get_own_person_profile_id\(target_organization_id\)/,
    );
    expect(auditTriggerSource).toMatch(
      /IF TG_TABLE_NAME = 'time_weekly_approvals'[\s\S]+time_weekly_approval_submitted[\s\S]+time_weekly_approval_approved[\s\S]+time_weekly_approval_rejected[\s\S]+time_weekly_approval_reopened/,
    );
    expect(auditTriggerSource).toMatch(
      /audit_metadata := jsonb_build_object\([\s\S]+'schemaVersion'[\s\S]+'previousStatus'[\s\S]+'nextStatus'[\s\S]+'weekStartDate'/,
    );
    expect(auditTriggerSource).not.toMatch(
      /approval_note|rejection_note|approval_signature|signatureHash|storagePath|storage_path|snapshot|payroll|document|geolocation|latitude|longitude|token|secret/i,
    );
    expect(foundationMigrationSource).toMatch(
      /CREATE TRIGGER time_records_audit_insert[\s\S]+AFTER INSERT ON public\.time_records[\s\S]+record_time_audit_event_from_trigger\(\)/,
    );
    expect(foundationMigrationSource).toMatch(
      /CREATE TRIGGER time_weekly_approvals_audit_update[\s\S]+AFTER UPDATE OF status ON public\.time_weekly_approvals[\s\S]+record_time_audit_event_from_trigger\(\)/,
    );
    expect(correctionApplicationMigrationSource).toMatch(
      /CREATE TRIGGER time_punches_audit_update[\s\S]+AFTER UPDATE OF status ON public\.time_punches[\s\S]+record_time_audit_event_from_trigger\(\)/,
    );
  });

  test("keeps record and punch mutations behind RPCs, corrections and explicit reopen flows", () => {
    const timeTrackingSource = readProjectFile("src/lib/time-tracking.ts");
    const timeActionsSource = readProjectFile(
      "src/app/(app)/app/time/actions.ts",
    );
    const foundationMigrationSource = readProjectFile(
      "supabase/migrations/00010_time_tracking_manual_foundation.sql",
    );
    const directCorrectionMigrationSource = readProjectFile(
      "supabase/migrations/00030_time_punch_work_date_alignment.sql",
    );
    const weeklyApprovalMigrationSource = readProjectFile(
      "supabase/migrations/00026_time_weekly_closure_approval.sql",
    );
    const recordValidationSource = getSqlFunctionSource(
      weeklyApprovalMigrationSource,
      "validate_time_record_row",
    );
    const punchValidationSource = getSqlFunctionSource(
      weeklyApprovalMigrationSource,
      "validate_time_punch_row",
    );
    const correctionValidationSource = getSqlFunctionSource(
      weeklyApprovalMigrationSource,
      "validate_time_record_correction_row",
    );
    const approveSqlSource = getSqlFunctionSource(
      weeklyApprovalMigrationSource,
      "approve_time_weekly_approval",
    );
    const reopenSqlSource = getSqlFunctionSource(
      weeklyApprovalMigrationSource,
      "reopen_time_weekly_approval",
    );
    const directCorrectionSqlSource = getSqlFunctionSource(
      directCorrectionMigrationSource,
      "create_and_apply_own_time_record_correction",
    );
    const directTimeRecordOrPunchWritePattern =
      /\.from\("time_(?:records|punches)"\)[\s\S]{0,300}\.(?:update|delete)\(/;

    expect(timeTrackingSource).not.toMatch(directTimeRecordOrPunchWritePattern);
    expect(timeActionsSource).not.toMatch(directTimeRecordOrPunchWritePattern);
    expect(foundationMigrationSource).toContain(
      "GRANT SELECT, INSERT ON public.time_records TO authenticated;",
    );
    expect(foundationMigrationSource).toContain(
      "GRANT SELECT, INSERT ON public.time_punches TO authenticated;",
    );
    expect(foundationMigrationSource).not.toMatch(
      /GRANT [^;]*(?:UPDATE|DELETE)[^;]* ON public\.time_records TO authenticated/i,
    );
    expect(foundationMigrationSource).not.toMatch(
      /GRANT [^;]*(?:UPDATE|DELETE)[^;]* ON public\.time_punches TO authenticated/i,
    );
    expect(foundationMigrationSource).not.toMatch(
      /ON public\.time_records FOR (?:UPDATE|DELETE) TO authenticated/,
    );
    expect(foundationMigrationSource).not.toMatch(
      /ON public\.time_punches FOR (?:UPDATE|DELETE) TO authenticated/,
    );

    for (const functionSource of [
      recordValidationSource,
      punchValidationSource,
      correctionValidationSource,
    ]) {
      expect(functionSource).toMatch(
        /NOT public\.is_time_weekly_approval_management_context\(\)[\s\S]+public\.time_week_is_approved/,
      );
    }

    expect(recordValidationSource).toContain(
      "approved time weeks cannot be changed without reopening",
    );
    expect(punchValidationSource).toContain(
      "approved time weeks cannot be changed without reopening",
    );
    expect(punchValidationSource).toMatch(
      /target_record\.status NOT IN \('open', 'reopened'\) AND NOT application_context/,
    );
    expect(correctionValidationSource).toContain(
      "approved time weeks cannot be corrected without reopening",
    );
    expect(approveSqlSource).toMatch(
      /PERFORM set_config\('boxops\.time_weekly_approval_management', 'on', true\)[\s\S]+UPDATE public\.time_records[\s\S]+status = 'approved'/,
    );
    expect(reopenSqlSource).toMatch(
      /PERFORM set_config\('boxops\.time_weekly_approval_management', 'on', true\)[\s\S]+UPDATE public\.time_records[\s\S]+status = 'reopened'/,
    );
    expect(directCorrectionSqlSource).toMatch(
      /PERFORM set_config\('boxops\.time_correction_application', 'on', true\)[\s\S]+PERFORM set_config\('boxops\.time_correction_direct_application', 'on', true\)/,
    );
    expect(timeActionsSource).not.toMatch(
      /navigator\.geolocation|serviceWorker|PushManager|CacheStorage|OpenAI|anthropic|embeddings|pgvector|ai_|document-files|document_access|requires_signature|signature_evidence|payroll_|salary|compensation/i,
    );
  });
});

test.describe("change requests local source guardrails", () => {
  test("keeps summaries minimized and own identities derived from auth plus tenant", () => {
    const changeSource = readProjectFile("src/lib/change-requests.ts");
    const requestActionsSource = readProjectFile(
      "src/app/(app)/app/requests/actions.ts",
    );
    const foundationMigrationSource = readProjectFile(
      "supabase/migrations/00027_change_requests_foundation.sql",
    );
    const ownCreateFunction = getSqlFunctionSource(
      foundationMigrationSource,
      "create_own_change_request",
    );

    expect(changeSource).toContain("const FORBIDDEN_SUMMARY_PATTERN");

    for (const term of [
      "https?:\\/\\/",
      "data:",
      "base64",
      "token",
      "secret",
      "credential",
      "signed-url",
      "signed_url",
      "storage\\/v1",
      "document",
      "documento",
      "payroll",
      "salary",
      "nomina",
      "iban",
      "dni",
      "nif",
      "ssn",
      "national_id",
      "geolocation",
      "gps",
      "latitude",
      "longitude",
      "coordinate",
      "ubicacion",
      "location",
      "salud",
      "health",
      "medical",
    ]) {
      expect(changeSource, `FORBIDDEN_SUMMARY_PATTERN includes ${term}`).toContain(
        term,
      );
    }

    expect(changeSource).toMatch(
      /function normalizeOptionalSummary[\s\S]+MAX_SUMMARY_LENGTH[\s\S]+FORBIDDEN_SUMMARY_PATTERN\.test\(trimmed\)[\s\S]+invalid\("invalid-summary"\)/,
    );
    expect(changeSource).toMatch(
      /function validateCreateOwnInput[\s\S]+const reasonSummary = normalizeOptionalSummary\(input\.reasonSummary\)/,
    );
    expect(changeSource).toMatch(
      /function validateRespondInput[\s\S]+const responseNoteSummary = normalizeOptionalSummary\(input\.responseNoteSummary\)/,
    );

    expect(requestActionsSource).toMatch(
      /async function resolveRequestsActionContext[\s\S]+getAuthenticatedUser\(\)[\s\S]+resolveActiveOrganization\(memberships, organizationId\)[\s\S]+\.from\("person_profiles"\)[\s\S]+\.eq\("organization_id", resolution\.organization\.id\)[\s\S]+\.eq\("user_id", user\.id\)[\s\S]+\.eq\("status", "active"\)[\s\S]+ownCoachProfileIds/,
    );
    expect(requestActionsSource).not.toMatch(
      /getFormString\(formData, "(?:actorUserId|actorMembershipId|personProfileId|requesterCoachProfileId|requesterPersonProfileId|requesterMembershipId)"\)/,
    );

    expect(ownCreateFunction).toMatch(
      /current_user_id uuid := \(select auth\.uid\(\)\)[\s\S]+public\.get_active_membership_id\(target_organization_id\)[\s\S]+public\.get_own_person_profile_id\(target_organization_id\)/,
    );
    expect(ownCreateFunction).toMatch(
      /public\.change_request_coach_belongs_to_current_user\([\s\S]+target_organization_id,[\s\S]+source_assignment\.coach_profile_id/,
    );
    expect(ownCreateFunction).toMatch(
      /INSERT INTO public\.change_requests[\s\S]+requester_membership_id[\s\S]+requester_person_profile_id[\s\S]+requester_coach_profile_id[\s\S]+current_membership_id[\s\S]+own_person_profile_id[\s\S]+source_assignment\.coach_profile_id/,
    );
  });

  test("keeps creation and target responses tenant-scoped and RPC-based", () => {
    const changeSource = readProjectFile("src/lib/change-requests.ts");
    const requestActionsSource = readProjectFile(
      "src/app/(app)/app/requests/actions.ts",
    );
    const foundationMigrationSource = readProjectFile(
      "supabase/migrations/00027_change_requests_foundation.sql",
    );
    const atomicCreationMigrationSource = readProjectFile(
      "supabase/migrations/00029_change_request_atomic_creation.sql",
    );

    expect(changeSource).toMatch(
      /async function ensureOwnSourceAssignmentReference[\s\S]+\.from\("schedule_block_assignments"\)[\s\S]+\.eq\("id", scheduleBlockAssignmentId\)[\s\S]+\.eq\("organization_id", context\.organization\.id\)[\s\S]+\.eq\("schedule_block_id", scheduleBlockId\)/,
    );
    expect(changeSource).toMatch(
      /async function ensureCoachProfileIsAssignable[\s\S]+\.rpc\(\s*"change_request_coach_is_assignable"[\s\S]+target_coach_profile_id: coachProfileId[\s\S]+target_organization_id: context\.organization\.id/,
    );
    expect(changeSource).toMatch(
      /export async function createOwnChangeRequest[\s\S]+validateCreateOwnInput\(input\)[\s\S]+requirePersonalAccess: true[\s\S]+ensureOwnSourceAssignmentReference[\s\S]+\.rpc\(\s*"create_own_change_request"[\s\S]+target_organization_id: context\.data\.organization\.id/,
    );
    expect(changeSource).toMatch(
      /export async function createChangeRequestWithTargets[\s\S]+if \(!canManage\) \{[\s\S]+requireOwnPersonProfile: true[\s\S]+requirePersonalAccess: true[\s\S]+ensureOwnSourceAssignmentReference[\s\S]+ensureCoachProfilesAreAssignable[\s\S]+create_managed_change_request_with_targets[\s\S]+create_own_change_request_with_targets/,
    );
    expect(changeSource).toMatch(
      /export async function offerChangeRequestToCoach[\s\S]+validateOfferInput\(input\)[\s\S]+ensureCoachProfileIsAssignable[\s\S]+\.rpc\(\s*"offer_change_request_to_coach"[\s\S]+target_organization_id: context\.data\.organization\.id/,
    );
    expect(changeSource).toMatch(
      /export async function respondToChangeRequestTarget[\s\S]+validateRespondInput\(input\)[\s\S]+requireOwnPersonProfile: true[\s\S]+requirePersonalAccess: true[\s\S]+\.rpc\(\s*"respond_to_change_request_target"[\s\S]+target_organization_id: context\.data\.organization\.id/,
    );

    expect(requestActionsSource).toMatch(
      /export async function createChangeRequestFromForm[\s\S]+\.from\("schedule_block_assignments"\)[\s\S]+\.eq\("organization_id", context\.organizationId\)[\s\S]+\.eq\("id", scheduleBlockAssignmentId\)[\s\S]+assignment\.assignment_status !== "assigned"[\s\S]+!context\.canManage[\s\S]+!context\.ownCoachProfileIds\.has\(assignment\.coach_profile_id\)[\s\S]+targetCoachProfileIds\.includes\(assignment\.coach_profile_id\)/,
    );
    expect(requestActionsSource).toMatch(
      /export async function createChangeRequestFromForm[\s\S]+\.from\("schedule_blocks"\)[\s\S]+\.eq\("organization_id", context\.organizationId\)[\s\S]+\.eq\("id", assignment\.schedule_block_id\)[\s\S]+\.from\("coach_profiles"\)[\s\S]+\.eq\("organization_id", context\.organizationId\)[\s\S]+\.eq\("status", "active"\)[\s\S]+createChangeRequestWithTargets\({[\s\S]+organizationId: context\.organizationId/,
    );
    expect(requestActionsSource).toMatch(
      /export async function respondToChangeRequestTargetFromForm[\s\S]+\.from\("change_request_targets"\)[\s\S]+\.eq\("organization_id", context\.organizationId\)[\s\S]+\.eq\("id", changeRequestTargetId\)[\s\S]+!context\.ownCoachProfileIds\.has\(target\.target_coach_profile_id\)[\s\S]+target\.status !== "offered"[\s\S]+respondToChangeRequestTarget\({[\s\S]+organizationId: context\.organizationId/,
    );
    expect(requestActionsSource).toMatch(
      /export async function cancelOwnChangeRequestFromForm[\s\S]+\.from\("change_requests"\)[\s\S]+\.eq\("organization_id", context\.organizationId\)[\s\S]+\.eq\("id", changeRequestId\)[\s\S]+!context\.ownCoachProfileIds\.has\(request\.requester_coach_profile_id\)[\s\S]+request\.status === "approved"[\s\S]+cancelChangeRequest\({[\s\S]+organizationId: context\.organizationId/,
    );

    for (const [source, functionName] of [
      [foundationMigrationSource, "offer_change_request_to_coach"],
      [foundationMigrationSource, "respond_to_change_request_target"],
      [atomicCreationMigrationSource, "create_own_change_request_with_targets"],
      [atomicCreationMigrationSource, "create_managed_change_request_with_targets"],
    ] as const) {
      const functionSource = getSqlFunctionSource(source, functionName);

      expect(functionSource).toContain("target_organization_id");
      expect(functionSource).toMatch(/SECURITY DEFINER[\s\S]+SET search_path = public/);
      expect(functionSource).toMatch(/organization_id = target_organization_id/);
    }

    expect([changeSource, requestActionsSource].join("\n")).not.toMatch(
      /\.from\(["'](?:change_requests|change_request_targets|schedule_block_assignments)["']\)[\s\S]{0,260}\.(?:insert|update|upsert|delete)\(/,
    );
  });

  test("keeps decisions and application behind tenant-scoped helpers without broad mutations", () => {
    const changeSource = readProjectFile("src/lib/change-requests.ts");
    const requestActionsSource = readProjectFile(
      "src/app/(app)/app/requests/actions.ts",
    );
    const operationsMigrationSource = readProjectFile(
      "supabase/migrations/00028_change_request_operations.sql",
    );
    const requestSources = [changeSource, requestActionsSource].join("\n");

    expect(requestActionsSource).toMatch(
      /async function ensureManagementContext[\s\S]+getValidatedContext\(formData\)[\s\S]+if \(!context\.canManage\)[\s\S]+forbidden/,
    );
    expect(requestActionsSource).toMatch(
      /async function runManagementOperation[\s\S]+ensureManagementContext\(formData\)[\s\S]+approveChangeRequest\(input\)[\s\S]+rejectChangeRequest\(input\)[\s\S]+applyApprovedChangeRequest\(input\)/,
    );

    for (const functionName of [
      "approveChangeRequest",
      "rejectChangeRequest",
      "applyApprovedChangeRequest",
    ]) {
      expect(changeSource, `${functionName} requires management`).toMatch(
        new RegExp(
          `export async function ${functionName}[\\s\\S]+requireManagement: true[\\s\\S]+\\.rpc\\(`,
        ),
      );
    }

    for (const [helperName, rpcName] of [
      ["approveChangeRequest", "approve_change_request"],
      ["rejectChangeRequest", "reject_change_request"],
      ["cancelChangeRequest", "cancel_change_request"],
      ["expireChangeRequest", "expire_change_request"],
      ["applyApprovedChangeRequest", "apply_approved_change_request"],
    ] as const) {
      expect(changeSource, `${helperName} routes to ${rpcName}`).toMatch(
        new RegExp(
          `export async function ${helperName}[\\s\\S]+validateOperationInput\\(input\\)[\\s\\S]+\\.rpc\\(\\s*"${rpcName}"[\\s\\S]+target_change_request_id: validation\\.value\\.changeRequestId[\\s\\S]+target_organization_id: context\\.data\\.organization\\.id`,
        ),
      );
    }

    const approveFunction = getSqlFunctionSource(
      operationsMigrationSource,
      "approve_change_request",
    );
    const rejectFunction = getSqlFunctionSource(
      operationsMigrationSource,
      "reject_change_request",
    );
    const cancelFunction = getSqlFunctionSource(
      operationsMigrationSource,
      "cancel_change_request",
    );
    const expireFunction = getSqlFunctionSource(
      operationsMigrationSource,
      "expire_change_request",
    );
    const applyFunction = getSqlFunctionSource(
      operationsMigrationSource,
      "apply_approved_change_request",
    );

    for (const functionSource of [
      approveFunction,
      rejectFunction,
      cancelFunction,
      expireFunction,
      applyFunction,
    ]) {
      expect(functionSource).toMatch(
        /WHERE request\.id = target_change_request_id[\s\S]+request\.organization_id = target_organization_id/,
      );
    }

    for (const functionSource of [
      approveFunction,
      rejectFunction,
      applyFunction,
    ]) {
      expect(functionSource).toContain(
        "public.can_manage_change_requests(target_organization_id)",
      );
    }

    const nonApplyFunctions = [
      approveFunction,
      rejectFunction,
      cancelFunction,
      expireFunction,
    ].join("\n");

    expect(nonApplyFunctions).not.toMatch(
      /(?:INSERT INTO|UPDATE|DELETE FROM) public\.schedule_block_assignments/,
    );
    expect(nonApplyFunctions).not.toMatch(
      /(?:INSERT INTO|UPDATE|DELETE FROM) public\.schedule_blocks/,
    );
    expect(applyFunction).toMatch(
      /INSERT INTO public\.schedule_block_assignments[\s\S]+'change_request'/,
    );
    expect(applyFunction).toMatch(
      /UPDATE public\.schedule_block_assignments[\s\S]+SET assignment_status = 'removed'/,
    );
    expect(applyFunction).not.toMatch(
      /(?:INSERT INTO|UPDATE|DELETE FROM) public\.schedule_blocks/,
    );

    expect(requestSources).not.toMatch(
      /\.from\(["'](?:schedule_blocks|schedule_block_assignments|time_records|time_punches|documents|document_versions)["']\)[\s\S]{0,260}\.(?:insert|update|upsert|delete)\(/,
    );
    expect(requestSources).not.toMatch(
      /\.rpc(?:<[^>]+>)?\(\s*["'](?:create_own_time_punch|create_and_apply_own_time_record_correction|generate_schedule_auto_time_punches|begin_document_version_upload|activate_document_version_upload|cancel_document_version_upload)["']/,
    );
    expect(requestSources).not.toMatch(
      /\b(?:navigator\.geolocation|serviceWorker|PushManager|Notification|background sync|caches\.|CacheStorage)\b/i,
    );
    expect(requestSources).not.toMatch(
      /\b(?:OpenAI|openai|anthropic|embeddings|vector|pgvector)\b|ai_/,
    );
  });
});

test.describe("operational events local source guardrails", () => {
  test("keeps event text inputs minimized and non-manager reads visibility-limited", () => {
    const eventSource = readProjectFile("src/lib/operational-events.ts");

    expect(eventSource).toContain("const FORBIDDEN_TEXT_PATTERN");
    expect(eventSource).toContain("const FORBIDDEN_TITLE_PATTERN");

    for (const term of [
      "data:",
      "base64",
      "token",
      "secret",
      "credential",
      "signed-url",
      "signed_url",
      "storage\\/v1",
      "document",
      "documento",
      "archivo",
      "justificante",
      "payroll",
      "salary",
      "salario",
      "nomina",
      "iban",
      "bank",
      "dni",
      "nif",
      "ssn",
      "national_id",
      "geolocation",
      "gps",
      "latitude",
      "longitude",
      "coordinate",
      "ubicacion",
      "location",
      "fingerprint",
      "baja",
      "salud",
      "health",
      "medical",
      "diagnostic",
      "diagnostico",
      "familia",
      "sancion",
      "disciplin",
    ]) {
      expect(eventSource, `FORBIDDEN_TEXT_PATTERN includes ${term}`).toContain(
        term,
      );
    }

    expect(eventSource).toMatch(
      /function normalizeTitle[\s\S]+MAX_TITLE_LENGTH[\s\S]+FORBIDDEN_TITLE_PATTERN\.test\(trimmed\)[\s\S]+invalid\("invalid-title"\)/,
    );
    expect(eventSource).toMatch(
      /function normalizeOptionalNotes[\s\S]+MAX_NOTES_LENGTH[\s\S]+FORBIDDEN_TEXT_PATTERN\.test\(trimmed\)[\s\S]+invalid\("invalid-notes"\)/,
    );
    expect(eventSource).toMatch(
      /if \(canManage\) \{[\s\S]+includeArchived[\s\S]+validation\.value\.visibilities[\s\S]+\} else \{[\s\S]+\.eq\("status", "active"\)[\s\S]+\.in\("visibility", \["staff", "all_staff"\]\)/,
    );
  });

  test("keeps event mutations management-only, tenant-scoped and RPC-based", () => {
    const eventSource = readProjectFile("src/lib/operational-events.ts");
    const eventActionsSource = readProjectFile(
      "src/app/(app)/app/schedule/operational-event-actions.ts",
    );
    const eventMigrationSource = readProjectFile(
      "supabase/migrations/00037_operational_events_foundation.sql",
    );

    expect(eventSource).toMatch(
      /async function resolveOperationalEventContext[\s\S]+canReadOperationalEvents\(resolution\.membership\.role\)[\s\S]+requireManagement[\s\S]+canManageOperationalEvents\(resolution\.membership\.role\)/,
    );
    expect(eventSource).toMatch(
      /export async function createOperationalEvent[\s\S]+resolveOperationalEventContext\({[\s\S]+requireManagement: true[\s\S]+validateCreateInput[\s\S]+\.rpc<OperationalEventRow>\(\s*"create_operational_event"[\s\S]+target_organization_id: context\.data\.organization\.id/,
    );
    expect(eventSource).toMatch(
      /export async function updateOperationalEvent[\s\S]+validateOperationInput\(input\)[\s\S]+findOperationalEvent\({[\s\S]+eventId: operation\.value\.eventId[\s\S]+\.rpc<OperationalEventRow>\(\s*"update_operational_event"[\s\S]+target_operational_event_id: operation\.value\.eventId[\s\S]+target_organization_id: context\.data\.organization\.id/,
    );
    expect(eventSource).toMatch(
      /export async function setOperationalEventStatus[\s\S]+normalizeOperationalEventStatus\(input\.status\)[\s\S]+requireManagement: true[\s\S]+\.rpc<OperationalEventRow>\(\s*"set_operational_event_status"[\s\S]+target_operational_event_id: operation\.value\.eventId[\s\S]+target_organization_id: context\.data\.organization\.id/,
    );
    expect(eventSource).not.toMatch(
      /\.from\(["']operational_events["']\)[\s\S]*\.(?:insert|update|upsert|delete)\(/,
    );

    expect(eventActionsSource).toMatch(
      /async function getOperationalEventActionContext[\s\S]+getAuthenticatedUser\(\)[\s\S]+resolveActiveOrganization\(memberships, organizationId\)[\s\S]+canManageOperationalEvents\(resolution\.membership\.role\)/,
    );
    expect(eventActionsSource).toMatch(
      /function getSafeReturnPath[\s\S]+url\.origin !== "http:\/\/boxops\.local" \|\| url\.pathname !== "\/app\/schedule"[\s\S]+return fallbackPath/,
    );
    expect(eventActionsSource).toMatch(
      /function getValidatedEventPayload[\s\S]+OPERATIONAL_EVENT_TYPES\.includes[\s\S]+OPERATIONAL_EVENT_IMPACT_LEVELS\.includes[\s\S]+OPERATIONAL_EVENT_VISIBILITIES\.includes[\s\S]+centerId && !isPostgresUuid\(centerId\)[\s\S]+date-range-invalid/,
    );
    expect(eventActionsSource).toMatch(
      /createOperationalEventFromForm[\s\S]+getOperationalEventActionContext\(formData\)[\s\S]+getValidatedEventPayload\({ context, formData }\)[\s\S]+createOperationalEvent\(payload\)/,
    );
    expect(eventActionsSource).toMatch(
      /updateOperationalEventFromForm[\s\S]+getOperationalEventActionContext\(formData\)[\s\S]+getValidatedEventId\({ context, formData }\)[\s\S]+updateOperationalEvent\({[\s\S]+\.\.\.payload[\s\S]+eventId/,
    );
    expect(eventActionsSource).toMatch(
      /setOperationalEventStatusFromForm[\s\S]+getOperationalEventActionContext\(formData\)[\s\S]+EVENT_STATUSES\.has\(status\)[\s\S]+setOperationalEventStatus\({[\s\S]+organizationId: context\.organizationId/,
    );

    expect(eventMigrationSource).toMatch(
      /CREATE TABLE public\.operational_events[\s\S]+organization_id uuid NOT NULL[\s\S]+FOREIGN KEY \(center_id, organization_id\)/,
    );
    expect(eventMigrationSource).toMatch(
      /CREATE POLICY "Managers and permitted coaches can read operational events"[\s\S]+public\.can_read_operational_event\(organization_id, id\)/,
    );
    expect(eventMigrationSource).toMatch(
      /REVOKE ALL ON public\.operational_events FROM anon, authenticated[\s\S]+GRANT SELECT ON public\.operational_events TO authenticated/,
    );
    expect(eventMigrationSource).not.toMatch(
      /GRANT\s+[^;]*(?:INSERT|UPDATE|DELETE|ALL)[^;]*ON\s+public\.operational_events\s+TO\s+authenticated/i,
    );
    expect(eventMigrationSource).toMatch(
      /create_operational_event[\s\S]+can_manage_operational_events\(target_organization_id\)[\s\S]+record_operational_audit_event/,
    );
    expect(eventMigrationSource).toMatch(
      /update_operational_event[\s\S]+can_manage_operational_events\(target_organization_id\)[\s\S]+record_operational_audit_event/,
    );
    expect(eventMigrationSource).toMatch(
      /set_operational_event_status[\s\S]+can_manage_operational_events\(target_organization_id\)[\s\S]+record_operational_audit_event/,
    );
  });

  test("keeps operational events as context, not schedule, time, payroll or document mutation", () => {
    const eventSources = [
      readProjectFile("src/lib/operational-events.ts"),
      readProjectFile(
        "src/app/(app)/app/schedule/operational-event-actions.ts",
      ),
    ].join("\n");

    expect(eventSources).not.toMatch(
      /\.from\(["'](?:schedule_blocks|schedule_block_assignments|time_records|time_punches|documents|document_versions)["']\)/,
    );
    expect(eventSources).not.toMatch(
      /\.rpc(?:<[^>]+>)?\(\s*["'](?:create_own_time_punch|create_and_apply_own_time_record_correction|generate_schedule_auto_time_punches|begin_document_version_upload|activate_document_version_upload|cancel_document_version_upload)["']/,
    );
    expect(eventSources).not.toMatch(
      /\b(?:navigator\.geolocation|serviceWorker|PushManager|Notification|background sync|caches\.|CacheStorage)\b/i,
    );
    expect(eventSources).not.toMatch(
      /\b(?:OpenAI|openai|anthropic|embeddings|vector|pgvector)\b|ai_/,
    );
  });
});

test.describe("operational audit local source guardrails", () => {
  test("keeps operational audit tenant-scoped, minimized, owner-admin readable, and DB-purged only", () => {
    const foundationMigrationSource = readProjectFile(
      "supabase/migrations/00020_operational_audit_events.sql",
    );
    const hardeningMigrationSource = readProjectFile(
      "supabase/migrations/00021_operational_audit_hardening.sql",
    );
    const operationalEventsMigrationSource = readProjectFile(
      "supabase/migrations/00037_operational_events_foundation.sql",
    );
    const auditHelperSource = readProjectFile("src/lib/operational-audit.ts");
    const appAndLibSource = [
      ...collectSourceFiles(path.join(process.cwd(), "src", "app")),
      ...collectSourceFiles(path.join(process.cwd(), "src", "lib")),
    ]
      .map((filePath) => readFileSync(filePath, "utf8"))
      .join("\n");
    const recordAuditSqlSource = getSqlFunctionSource(
      foundationMigrationSource,
      "record_operational_audit_event",
    );
    const listAuditSqlSource = getSqlFunctionSource(
      operationalEventsMigrationSource,
      "list_operational_audit_events",
    );
    const purgeAuditSqlSource = getSqlFunctionSource(
      hardeningMigrationSource,
      "purge_expired_operational_audit_events",
    );

    expect(foundationMigrationSource).toContain(
      "CREATE TABLE public.operational_audit_events",
    );
    expect(foundationMigrationSource).toContain(
      "organization_id uuid NOT NULL REFERENCES public.organizations(id)",
    );
    expect(foundationMigrationSource).toContain("UNIQUE (id, organization_id)");
    expect(foundationMigrationSource).toMatch(
      /FOREIGN KEY \(organization_id, actor_user_id\)[\s\S]+REFERENCES public\.organization_memberships\(organization_id, user_id\)/,
    );
    expect(foundationMigrationSource).toMatch(
      /FOREIGN KEY \(actor_membership_id, organization_id\)[\s\S]+REFERENCES public\.organization_memberships\(id, organization_id\)/,
    );
    expect(foundationMigrationSource).toMatch(
      /FOREIGN KEY \(actor_person_profile_id, organization_id\)[\s\S]+REFERENCES public\.person_profiles\(id, organization_id\)/,
    );
    expect(foundationMigrationSource).toMatch(
      /ALTER TABLE public\.operational_audit_events ENABLE ROW LEVEL SECURITY/,
    );
    expect(foundationMigrationSource).toMatch(
      /CREATE POLICY "Owners and admins can read retained operational audit events"[\s\S]+retain_until > now\(\)[\s\S]+public\.can_read_operational_audit_events\(organization_id\)/,
    );
    expect(foundationMigrationSource).toContain(
      "GRANT SELECT ON public.operational_audit_events TO authenticated",
    );
    expect(foundationMigrationSource).not.toMatch(
      /GRANT\s+[^;]*(?:INSERT|UPDATE|DELETE|ALL)[^;]*ON\s+public\.operational_audit_events\s+TO\s+(?:anon|authenticated)/i,
    );
    expect(foundationMigrationSource).toContain(
      "public.has_org_role(target_organization_id, ARRAY['owner', 'admin'])",
    );
    expect(foundationMigrationSource).not.toContain(
      "ARRAY['owner', 'admin', 'manager']",
    );

    expect(recordAuditSqlSource).toMatch(
      /current_user_id uuid := \(select auth\.uid\(\)\)/,
    );
    expect(recordAuditSqlSource).toMatch(
      /SELECT membership\.\*[\s\S]+membership\.organization_id = target_organization_id[\s\S]+membership\.user_id = current_user_id[\s\S]+membership\.status = 'active'/,
    );
    expect(recordAuditSqlSource).toMatch(
      /own_person_profile_id := public\.get_own_person_profile_id\(target_organization_id\)/,
    );
    expect(recordAuditSqlSource).toMatch(
      /public\.operational_audit_entity_exists\([\s\S]+target_organization_id[\s\S]+normalized_entity_type[\s\S]+target_entity_id/,
    );
    expect(recordAuditSqlSource).toMatch(
      /public\.operational_audit_changed_fields_is_safe\(normalized_changed_fields\)/,
    );
    expect(recordAuditSqlSource).toMatch(
      /now\(\) \+ make_interval\(days => public\.operational_audit_retention_days\(normalized_entity_type\)\)/,
    );
    expect(recordAuditSqlSource).not.toMatch(
      /target_actor|target_membership|target_person|target_retain|target_metadata/i,
    );

    expect(listAuditSqlSource).toMatch(
      /public\.can_read_operational_audit_events\(target_organization_id\)/,
    );
    expect(listAuditSqlSource).toMatch(
      /event_record\.organization_id = target_organization_id[\s\S]+event_record\.retain_until > now\(\)/,
    );
    expect(listAuditSqlSource).toContain("LIMIT bounded_limit");

    expect(hardeningMigrationSource).toContain(
      "pg_column_size(target_changed_fields) <= 4096",
    );
    expect(hardeningMigrationSource).toContain(
      "jsonb_typeof(value) = 'array'",
    );
    expect(hardeningMigrationSource).toContain(
      "length(value #>> '{}') > 128",
    );

    for (const term of [
      "content",
      "body",
      "html",
      "raw",
      "base64",
      "url",
      "uri",
      "path",
      "token",
      "secret",
      "signature",
      "document",
      "storage",
      "password",
      "credential",
      "cookie",
      "session",
      "fingerprint",
      "latitude",
      "longitude",
      "coordinate",
      "geolocation",
      "gps",
      "location",
      "payroll",
      "salary",
      "iban",
      "bank",
      "ssn",
      "national_id",
      "national-id",
      "nif",
      "dni",
    ]) {
      expect(
        hardeningMigrationSource,
        `operational audit blocks ${term}`,
      ).toContain(term);
    }

    for (const valueSignal of [
      "https?://",
      "data:",
      "storage/v1",
      "-----BEGIN",
      "signed-url",
      "signed_url",
      "api[_-]?key",
      "bearer",
      "jwt",
    ]) {
      expect(
        hardeningMigrationSource,
        `operational audit blocks value signal ${valueSignal}`,
      ).toContain(valueSignal);
    }

    expect(purgeAuditSqlSource).toContain(
      "LEAST(GREATEST(COALESCE(target_batch_size, 1000), 1), 5000)",
    );
    expect(purgeAuditSqlSource).toMatch(
      /DELETE FROM public\.operational_audit_events event_record[\s\S]+pending_event\.retain_until < now\(\)[\s\S]+LIMIT bounded_batch_size/,
    );
    expect(hardeningMigrationSource).toContain(
      "REVOKE EXECUTE ON FUNCTION public.purge_expired_operational_audit_events(integer) FROM PUBLIC",
    );
    expect(hardeningMigrationSource).toContain(
      "REVOKE EXECUTE ON FUNCTION public.purge_expired_operational_audit_events(integer) FROM anon, authenticated",
    );
    expect(appAndLibSource).not.toContain(
      "purge_expired_operational_audit_events",
    );

    expect(auditHelperSource).toMatch(
      /\.rpc\("record_operational_audit_event"[\s\S]+target_organization_id: organizationId/,
    );
    expect(auditHelperSource).toMatch(
      /\.rpc\("list_operational_audit_events"[\s\S]+target_organization_id: organizationId/,
    );
    expect(auditHelperSource).not.toMatch(
      /service_role|createSignedUrl|signedUrl|document-files|navigator\.geolocation|payroll/i,
    );
  });

  test("keeps coverage trace audit bounded to management roles and operational entities", () => {
    const coverageTraceMigrationSource = readProjectFile(
      "supabase/migrations/00041_coverage_traceability_audit_read.sql",
    );
    const coverageTraceHelperSource = readProjectFile(
      "src/lib/coverage-traceability.ts",
    );
    const schedulePanelSource = readProjectFile(
      "src/app/(app)/app/schedule/schedule-block-detail-panels.tsx",
    );
    const coveragePanelSource = readProjectFile(
      "src/app/(app)/app/coverage/coverage-block-detail-panels.tsx",
    );
    const listCoverageAuditSqlSource = getSqlFunctionSource(
      coverageTraceMigrationSource,
      "list_coverage_trace_audit_events",
    );
    const traceUiSource = `${schedulePanelSource}\n${coveragePanelSource}`;

    expect(coverageTraceMigrationSource).toContain(
      "public.has_org_role(target_organization_id, ARRAY['owner', 'admin', 'manager'])",
    );
    expect(coverageTraceMigrationSource).not.toMatch(
      /\bcoach\b|\bstaff\b|\bpayroll_manager\b|\bdocument_admin\b/,
    );
    expect(listCoverageAuditSqlSource).toContain(
      "FROM public.operational_audit_events event_record",
    );
    expect(listCoverageAuditSqlSource).toMatch(
      /event_record\.organization_id = target_organization_id[\s\S]+event_record\.retain_until > now\(\)/,
    );

    for (const entityType of [
      "schedule_blocks",
      "schedule_block_assignments",
      "schedule_template_blocks",
    ]) {
      expect(
        listCoverageAuditSqlSource,
        `coverage trace allows ${entityType}`,
      ).toContain(`'${entityType}'`);
    }

    for (const excludedEntityType of [
      "team_invitations",
      "organization_memberships",
      "person_profiles",
      "coach_profiles",
      "operational_events",
      "documents",
      "time_records",
      "time_punches",
    ]) {
      expect(
        listCoverageAuditSqlSource,
        `coverage trace excludes ${excludedEntityType}`,
      ).not.toContain(`'${excludedEntityType}'`);
    }

    expect(listCoverageAuditSqlSource).toMatch(
      /FROM public\.schedule_block_assignments assignment[\s\S]+assignment\.organization_id = target_organization_id[\s\S]+assignment\.schedule_block_id = ANY\(normalized_block_ids\)/,
    );
    expect(listCoverageAuditSqlSource).toMatch(
      /FROM public\.schedule_blocks block[\s\S]+block\.organization_id = target_organization_id[\s\S]+block\.template_block_id = event_record\.entity_id/,
    );

    expect(coverageTraceHelperSource).toContain("canManageOperationalData");
    expect(coverageTraceHelperSource).toContain(
      "resolveActiveOrganization(memberships, organizationId)",
    );
    expect(coverageTraceHelperSource).toContain(
      '"list_coverage_trace_audit_events"',
    );
    expect(coverageTraceHelperSource).toMatch(
      /function getChangedFieldNames[\s\S]+Object\.keys\(changedFields\)[\s\S]+slice\(0, 6\)/,
    );
    expect(coverageTraceHelperSource).toContain("Cambio guardado");
    expect(coverageTraceHelperSource).toContain(
      "Entrenador por defecto actualizado",
    );
    expect(coverageTraceHelperSource).not.toContain("Campos minimizados");
    expect(coverageTraceHelperSource).not.toContain(
      "Cambio operativo reciente",
    );
    expect(coverageTraceHelperSource).not.toMatch(
      /Object\.values\(changedFields\)|JSON\.stringify\([^)]*changed_fields|event\.changed_fields\[/,
    );
    expect(coverageTraceHelperSource).not.toMatch(/\breason_summary\b/);

    for (const table of [
      "operational_audit_events",
      "schedule_blocks",
      "schedule_block_assignments",
      "schedule_templates",
      "schedule_template_blocks",
      "time_records",
      "time_punches",
      "absence_requests",
      "change_requests",
      "change_request_events",
    ]) {
      expect(listCoverageAuditSqlSource).not.toMatch(
        new RegExp(
          `\\b(?:INSERT INTO|UPDATE|DELETE FROM)\\s+public\\.${table}\\b`,
          "i",
        ),
      );
      expect(coverageTraceHelperSource).not.toMatch(
        new RegExp(
          `\\.from\\(["']${table}["']\\)[\\s\\S]{0,220}\\.(?:insert|update|upsert|delete)\\(`,
          "i",
        ),
      );
    }

    expect(traceUiSource).toContain("Cambios recientes");
    expect(traceUiSource).toContain("Actualizado el");
    expect(traceUiSource).toContain("No cambia el horario");
    expect(traceUiSource).not.toContain("Trazabilidad operativa");
    expect(traceUiSource).not.toContain("Auditoria");
    expect(traceUiSource).not.toContain("Campos minimizados");
    expect(traceUiSource).not.toContain("default_coach_profile_id");
    expect(traceUiSource).not.toMatch(/\breason_summary\b/);
    expect(`${coverageTraceHelperSource}\n${traceUiSource}`).not.toMatch(
      /navigator\.geolocation|serviceWorker|PushManager|CacheStorage|OpenAI|anthropic|embeddings|pgvector|ai_/i,
    );
  });
});

test.describe("overtime candidates local source guardrails", () => {
  test("keeps overtime candidate reads tenant-scoped and own-person scoped outside reviewers", () => {
    const migrationSource = readProjectFile(
      "supabase/migrations/00039_overtime_candidates_foundation.sql",
    );
    const helperSource = readProjectFile("src/lib/overtime-candidates.ts");
    const canReadSqlSource = getSqlFunctionSource(
      migrationSource,
      "can_read_overtime_candidate",
    );
    const listSqlSource = getSqlFunctionSource(
      migrationSource,
      "list_overtime_candidates",
    );
    const contextSource = getTsFunctionSource(
      helperSource,
      "resolveOvertimeCandidateContext",
    );
    const findReadableCandidateSource = getTsFunctionSource(
      helperSource,
      "findReadableCandidate",
    );
    const listHelperSource = getTsFunctionSource(
      helperSource,
      "listOvertimeCandidates",
    );

    expect(migrationSource).toContain(
      "CREATE TABLE public.overtime_candidates",
    );
    expect(migrationSource).toMatch(
      /CREATE TABLE public\.overtime_candidates[\s\S]+organization_id uuid NOT NULL[\s\S]+UNIQUE \(id, organization_id\)[\s\S]+FOREIGN KEY \(person_profile_id, organization_id\)/,
    );
    expect(migrationSource).toMatch(
      /CREATE POLICY "Permitted members can read overtime candidates"[\s\S]+public\.can_read_overtime_candidate\(organization_id, id\)/,
    );
    expect(migrationSource).toMatch(
      /CREATE POLICY "Permitted members can read overtime candidate sources"[\s\S]+public\.can_read_overtime_candidate\(organization_id, overtime_candidate_id\)/,
    );
    expect(migrationSource).toMatch(
      /CREATE POLICY "Permitted members can read retained overtime candidate events"[\s\S]+retain_until > now\(\)[\s\S]+public\.can_read_overtime_candidate\(organization_id, overtime_candidate_id\)/,
    );
    expect(migrationSource).toMatch(
      /CREATE OR REPLACE FUNCTION public\.can_review_overtime_candidates[\s\S]+ARRAY\['owner', 'admin', 'manager'\]/,
    );
    expect(migrationSource).toMatch(
      /GRANT SELECT ON public\.overtime_candidates TO authenticated/,
    );
    expect(migrationSource).toMatch(
      /GRANT SELECT ON public\.overtime_candidate_sources TO authenticated/,
    );
    expect(migrationSource).toMatch(
      /GRANT SELECT ON public\.overtime_candidate_events TO authenticated/,
    );

    for (const table of [
      "overtime_candidates",
      "overtime_candidate_sources",
      "overtime_candidate_events",
    ]) {
      expect(migrationSource).not.toMatch(
        new RegExp(
          `GRANT\\s+(?:INSERT|UPDATE|DELETE|ALL)[^;]+ON\\s+public\\.${table}\\s+TO\\s+authenticated`,
          "i",
        ),
      );
    }

    expect(canReadSqlSource).toMatch(
      /public\.can_review_overtime_candidates\(target_organization_id\)[\s\S]+RETURN true/,
    );
    expect(canReadSqlSource).toMatch(
      /NOT public\.is_org_member\(target_organization_id\)[\s\S]+RETURN false/,
    );
    expect(canReadSqlSource).toMatch(
      /own_person_profile_id := public\.get_own_person_profile_id\(target_organization_id\)[\s\S]+candidate\.person_profile_id = own_person_profile_id/,
    );
    expect(listSqlSource).toMatch(
      /IF NOT can_review[\s\S]+target_person_profile_id IS NOT NULL[\s\S]+target_person_profile_id IS DISTINCT FROM own_person_profile_id[\s\S]+RAISE EXCEPTION 'overtime candidate read permission required'/,
    );
    expect(listSqlSource).toMatch(
      /CASE[\s\S]+WHEN can_review THEN[\s\S]+target_person_profile_id IS NULL[\s\S]+candidate\.person_profile_id = target_person_profile_id[\s\S]+ELSE[\s\S]+candidate\.person_profile_id = own_person_profile_id/,
    );

    expect(contextSource).toMatch(
      /resolveActiveOrganization\([\s\S]+memberships,[\s\S]+normalizedOrganizationId\.value/,
    );
    expect(contextSource).toMatch(
      /!canReadOvertimeCandidates\(resolution\.membership\.role\)[\s\S]+return failure\("forbidden"\)/,
    );
    expect(contextSource).toMatch(
      /requireReview[\s\S]+!canReviewOvertimeCandidates\(resolution\.membership\.role\)[\s\S]+return failure\("forbidden"\)/,
    );
    expect(findReadableCandidateSource).toMatch(
      /\.from\("overtime_candidates"\)[\s\S]+\.eq\("id", candidateId\)[\s\S]+\.eq\("organization_id", context\.organization\.id\)/,
    );
    expect(listHelperSource).toMatch(
      /\.rpc<OvertimeCandidateRow\[]>\(\s*"list_overtime_candidates"[\s\S]+target_organization_id: context\.data\.organization\.id/,
    );
  });

  test("keeps overtime detection manual, source-only, terminal-safe and non-payroll", () => {
    const migrationSource = readProjectFile(
      "supabase/migrations/00039_overtime_candidates_foundation.sql",
    );
    const helperSource = readProjectFile("src/lib/overtime-candidates.ts");
    const detectionSource = readProjectFile(
      "src/lib/overtime-candidate-detection.ts",
    );
    const timeActionsSource = readProjectFile(
      "src/app/(app)/app/time/actions.ts",
    );
    const timePageSource = readProjectFile("src/app/(app)/app/time/page.tsx");
    const collapsibleSectionSource = readProjectFile(
      "src/components/features/collapsible-section.tsx",
    );
    const detectionContextSource = getTsFunctionSource(
      detectionSource,
      "resolveDetectionContext",
    );
    const detectSource = getTsFunctionSource(
      detectionSource,
      "detectOperationalOvertimeCandidates",
    );
    const addMissingSourcesSource = getTsFunctionSource(
      detectionSource,
      "addMissingSources",
    );
    const moveToNeedsReviewSource = getTsFunctionSource(
      detectionSource,
      "moveCandidateToNeedsReview",
    );
    const setStatusHelperSource = getTsFunctionSource(
      helperSource,
      "setOvertimeCandidateStatus",
    );
    const addSourceHelperSource = getTsFunctionSource(
      helperSource,
      "addOvertimeCandidateSource",
    );
    const addSourceSqlSource = getSqlFunctionSource(
      migrationSource,
      "add_overtime_candidate_source",
    );
    const setStatusSqlSource = getSqlFunctionSource(
      migrationSource,
      "set_overtime_candidate_status",
    );
    const eventSqlSource = getSqlFunctionSource(
      migrationSource,
      "record_overtime_candidate_event_internal",
    );
    const overtimeSurfaceSource = timePageSource.slice(
      timePageSource.indexOf("function OvertimeCandidateReviewSection"),
      timePageSource.indexOf("function SnapshotSummary"),
    );
    const overtimeStatusFormSource = timePageSource.slice(
      timePageSource.indexOf("function OvertimeCandidateStatusForm"),
      timePageSource.indexOf("function OvertimeCandidateReviewSection"),
    );

    expect(detectionContextSource).toMatch(
      /!canReviewOvertimeCandidates\(resolution\.membership\.role\)[\s\S]+error: "forbidden"/,
    );
    expect(detectSource).toMatch(
      /periodDays\.length < 1 \|\| periodDays\.length > MAX_DETECTION_DAYS/,
    );

    for (const table of [
      "time_records",
      "coach_profiles",
      "schedule_blocks",
      "time_weekly_approvals",
      "staff_work_windows",
    ]) {
      expect(detectSource).toMatch(
        new RegExp(
          `\\.from\\("${table}"\\)[\\s\\S]+\\.eq\\("organization_id", context\\.data\\.organization\\.id\\)`,
        ),
      );
    }

    expect(detectSource).toMatch(
      /\.from\("time_punches"\)[\s\S]+\.eq\("organization_id", context\.data\.organization\.id\)[\s\S]+\.eq\("status", "active"\)/,
    );
    expect(detectSource).toMatch(
      /\.from\("time_record_corrections"\)[\s\S]+\.eq\("organization_id", context\.data\.organization\.id\)[\s\S]+\.in\("status", \["pending", "approved"\]\)/,
    );
    expect(detectSource).toMatch(
      /\.from\("schedule_block_assignments"\)[\s\S]+\.eq\("organization_id", context\.data\.organization\.id\)[\s\S]+\.eq\("assignment_status", "assigned"\)/,
    );
    expect(detectSource).toMatch(
      /listOvertimeCandidates\({[\s\S]+organizationId: context\.data\.organization\.id/,
    );
    expect(detectSource).toMatch(
      /personContext\.workedMinutes <= personContext\.plannedMinutes[\s\S]+continue/,
    );
    expect(detectSource).toMatch(
      /personContext\.plannedMinutes <= 0 \|\| personContext\.sourceRefs\.length === 0[\s\S]+ignoredInsufficientData/,
    );
    expect(detectSource).toMatch(
      /createOvertimeCandidateSignal\({[\s\S]+detectionSource: "time_difference"[\s\S]+plannedMinutes: personContext\.plannedMinutes[\s\S]+workedMinutes: personContext\.workedMinutes/,
    );
    expect(addMissingSourcesSource).toMatch(
      /candidate\.status === "closed" \|\| candidate\.status === "superseded"[\s\S]+return true/,
    );
    expect(moveToNeedsReviewSource).toMatch(
      /candidate\.status !== "detected"[\s\S]+candidate\.status !== "needs_review"[\s\S]+return true/,
    );

    for (const functionSource of [
      setStatusHelperSource,
      addSourceHelperSource,
    ]) {
      expect(functionSource).toMatch(
        /currentCandidate\.data\.status === "closed"[\s\S]+currentCandidate\.data\.status === "superseded"[\s\S]+return failure\("not-actionable"\)/,
      );
      expect(functionSource).toMatch(
        /requireReview: true[\s\S]+target_organization_id: context\.data\.organization\.id/,
      );
    }

    expect(addSourceSqlSource).toMatch(
      /candidate_record\.status IN \('superseded', 'closed'\)[\s\S]+RAISE EXCEPTION 'closed overtime candidates cannot receive sources'/,
    );
    expect(setStatusSqlSource).toMatch(
      /candidate_record\.status IN \('superseded', 'closed'\)[\s\S]+RAISE EXCEPTION 'closed overtime candidates cannot be changed'/,
    );
    expect(eventSqlSource).toMatch(
      /current_user_id uuid := \(select auth\.uid\(\)\)[\s\S]+current_membership[\s\S]+own_person_profile_id[\s\S]+public\.overtime_candidate_changed_fields_is_safe\(normalized_changed_fields\)/,
    );
    expect(migrationSource).toMatch(
      /CONSTRAINT overtime_candidate_events_changed_fields_safe[\s\S]+public\.overtime_candidate_changed_fields_is_safe\(changed_fields\)/,
    );
    expect(timeActionsSource).toMatch(
      /export async function detectOvertimeCandidatesFromForm[\s\S]+detectOperationalOvertimeCandidates\({[\s\S]+organizationId/,
    );
    expect(timeActionsSource).toMatch(
      /export async function setOvertimeCandidateStatusFromForm[\s\S]+setOvertimeCandidateStatus\({[\s\S]+organizationId/,
    );
    expect(overtimeSurfaceSource).toContain("Posibles excesos de horas");
    expect(overtimeSurfaceSource).toContain("CollapsibleTimeSection");
    expect(timePageSource).toContain("CompactEmptyState");
    expect(timePageSource).toContain("Registros de la semana");
    expect(timePageSource).toContain("Correcciones y aprobaciones");
    expect(timePageSource).toContain("dataTimeCollapsibleDetails");
    expect(timePageSource).toContain("CollapsibleReviewQueue");
    expect(timePageSource).toContain("dataTimeCollapsibleQueue");
    expect(timePageSource).toContain("Listas para aplicar");
    expect(timePageSource).toContain("Solicitudes pendientes");
    expect(collapsibleSectionSource).toContain("data-time-collapsible-details");
    expect(collapsibleSectionSource).toContain("data-time-collapsible-queue");
    expect(collapsibleSectionSource).toContain("aria-expanded");
    expect(collapsibleSectionSource).toContain("grid-rows-[0fr]");
    expect(collapsibleSectionSource).toContain("ChevronDown");
    expect(collapsibleSectionSource).toContain("inert=");
    expect(timePageSource).not.toContain(">Mostrar<");
    expect(timePageSource).not.toContain(">Ver detalles<");
    expect(timePageSource).not.toMatch(
      /<details[^>]+data-time-collapsible-(?:details|queue)[^>]+open/,
    );
    expect(overtimeSurfaceSource).toContain("no modifica");
    expect(overtimeStatusFormSource).toMatch(
      /overtimeCandidateTerminalStatuses\.has\(candidate\.status\)[\s\S]+Sin acciones/,
    );
    expect(`${migrationSource}\n${helperSource}\n${detectionSource}`).not.toMatch(
      /\b(?:payroll|nomina|n[o\u00f3]mina|salary|amount|currency|compensation|iban|bank|approved_overtime)\b/i,
    );
    expect(overtimeSurfaceSource).not.toMatch(
      /\b(?:payroll|nomina|n[o\u00f3]mina|importe|importes|salary|amount|currency|compensation|iban|bank)\b/i,
    );
    expect(overtimeSurfaceSource).not.toMatch(
      /hora extra aprobada|aprobaci[o\u00f3]n legal|aprobado legal/i,
    );
    expect(`${detectionSource}\n${timeActionsSource}`).not.toMatch(
      /\bcron\b|scheduler|setInterval|setTimeout|background sync|serviceWorker|PushManager|Notification|CacheStorage/i,
    );
  });
});

test.describe("staff work window validator local helper guardrails", () => {
  const validWindowValues = {
    centerId: "00000000-0000-0000-0000-000000000002",
    dayOfWeek: "2",
    endTime: "13:00",
    notes: "Apertura y apoyo en sala",
    personProfileId: "00000000-0000-0000-0000-000000000001",
    startTime: "09:00",
    status: "active",
    validFrom: "2026-05-18",
    validUntil: "",
  };

  function makeStaffWorkWindowForm(
    overrides: Partial<typeof validWindowValues> = {},
  ) {
    return makeFormData({
      ...validWindowValues,
      ...overrides,
    });
  }

  test("rejects malformed planned-presence inputs before references can be accepted", () => {
    expect(
      validateStaffWorkWindowForm(
        makeStaffWorkWindowForm({ personProfileId: "not-a-uuid" }),
      ),
    ).toEqual({ error: "invalid-person-profile", ok: false });
    expect(
      validateStaffWorkWindowForm(
        makeStaffWorkWindowForm({ centerId: "not-a-uuid" }),
      ),
    ).toEqual({ error: "invalid-center", ok: false });
    expect(
      validateStaffWorkWindowForm(makeStaffWorkWindowForm({ dayOfWeek: "8" })),
    ).toEqual({ error: "invalid-day", ok: false });
    expect(
      validateStaffWorkWindowForm(makeStaffWorkWindowForm({ endTime: "09:00" })),
    ).toEqual({ error: "invalid-time", ok: false });
    expect(
      validateStaffWorkWindowForm(
        makeStaffWorkWindowForm({ validFrom: "2026-02-30" }),
      ),
    ).toEqual({ error: "missing-fields", ok: false });
    expect(
      validateStaffWorkWindowForm(
        makeStaffWorkWindowForm({ validUntil: "2026-02-30" }),
      ),
    ).toEqual({ error: "invalid-date", ok: false });
    expect(
      validateStaffWorkWindowForm(
        makeStaffWorkWindowForm({
          validFrom: "2026-05-18",
          validUntil: "2026-05-17",
        }),
      ),
    ).toEqual({ error: "invalid-date", ok: false });
    expect(
      validateStaffWorkWindowForm(makeStaffWorkWindowForm({ status: "deleted" })),
    ).toEqual({ error: "invalid-status", ok: false });
  });

  test("keeps planned-presence notes short and free from sensitive signals", () => {
    expect(
      validateStaffWorkWindowForm(
        makeStaffWorkWindowForm({ notes: "a".repeat(241) }),
      ),
    ).toEqual({ error: "notes-too-long", ok: false });

    for (const notes of [
      "Contrato pendiente",
      "nomina revisable",
      "justificante medico",
      "ubicacion GPS",
      "https://example.test/private",
      "token temporal",
      "DNI escaneado",
      "IBAN del trabajador",
    ]) {
      expect(
        validateStaffWorkWindowForm(makeStaffWorkWindowForm({ notes })),
        notes,
      ).toEqual({ error: "invalid-notes", ok: false });
    }

    expect(
      validateStaffWorkWindowForm(
        makeStaffWorkWindowForm({
          centerId: "",
          notes: "  ",
          validUntil: "2026-06-01",
        }),
      ),
    ).toEqual({
      ok: true,
      values: {
        centerId: null,
        dayOfWeek: 2,
        endTime: "13:00",
        notes: null,
        personProfileId: "00000000-0000-0000-0000-000000000001",
        startTime: "09:00",
        status: "active",
        validFrom: "2026-05-18",
        validUntil: "2026-06-01",
      },
    });
  });

  test("allows creating the same planned-presence window for several days", () => {
    const multiDayForm = makeStaffWorkWindowForm({ dayOfWeek: undefined });
    multiDayForm.append("dayOfWeek", "1");
    multiDayForm.append("dayOfWeek", "3");
    multiDayForm.append("dayOfWeek", "3");

    expect(validateStaffWorkWindowCreateForm(multiDayForm)).toEqual({
      ok: true,
      values: [
        {
          centerId: "00000000-0000-0000-0000-000000000002",
          dayOfWeek: 1,
          endTime: "13:00",
          notes: "Apertura y apoyo en sala",
          personProfileId: "00000000-0000-0000-0000-000000000001",
          startTime: "09:00",
          status: "active",
          validFrom: "2026-05-18",
          validUntil: null,
        },
        {
          centerId: "00000000-0000-0000-0000-000000000002",
          dayOfWeek: 3,
          endTime: "13:00",
          notes: "Apertura y apoyo en sala",
          personProfileId: "00000000-0000-0000-0000-000000000001",
          startTime: "09:00",
          status: "active",
          validFrom: "2026-05-18",
          validUntil: null,
        },
      ],
    });

    expect(
      validateStaffWorkWindowCreateForm(
        makeStaffWorkWindowForm({ dayOfWeek: undefined }),
      ),
    ).toEqual({ error: "missing-fields", ok: false });
  });

  test("keeps planned-presence mutations validated, tenant-scoped and audit-minimized", () => {
    const scheduleActionSource = readProjectFile(
      "src/app/(app)/app/schedule/actions.ts",
    );

    expect(scheduleActionSource).toMatch(
      /export async function createStaffWorkWindow[\s\S]+const validation = validateStaffWorkWindowCreateForm\(formData\)[\s\S]+const referenceValues = validation\.values\[0\][\s\S]+validateStaffWorkWindowReferences\({[\s\S]+organizationId: context\.organization\.id[\s\S]+values: referenceValues[\s\S]+\.from\("staff_work_windows"\)[\s\S]+\.insert\(validation\.values\.map\(\(values\) => \({[\s\S]+organization_id: context\.organization\.id[\s\S]+person_profile_id: values\.personProfileId/,
    );
    expect(scheduleActionSource).toMatch(
      /export async function updateStaffWorkWindow[\s\S]+const validation = validateStaffWorkWindowForm\(formData\)[\s\S]+\.eq\("id", staffWorkWindowId\)[\s\S]+\.eq\("organization_id", context\.organization\.id\)[\s\S]+validateStaffWorkWindowReferences\({[\s\S]+values: validation\.values[\s\S]+\.from\("staff_work_windows"\)[\s\S]+\.update\({[\s\S]+person_profile_id: validation\.values\.personProfileId[\s\S]+\.eq\("id", existingWindow\.id\)[\s\S]+\.eq\("organization_id", context\.organization\.id\)/,
    );
    expect(scheduleActionSource).toMatch(
      /function getStaffWorkWindowCreatedAuditFields[\s\S]+values\.notes \? \{ notes: auditFieldTouched\(\) \} : \{\}/,
    );
    expect(scheduleActionSource).toMatch(
      /function getStaffWorkWindowChangedAuditFields[\s\S]+changedFields\.notes = auditFieldTouched\(\)/,
    );
    expect(scheduleActionSource).not.toMatch(
      /auditField(?:Set|Change)\([^)]*values\.notes|changedFields\.notes\s*=\s*values\.notes/,
    );
  });
});

test.describe("personal profile validator local helper guardrails", () => {
  const validProfileValues = {
    displayName: "Ada Lovelace",
    preferredAlias: "Ada",
    publicEmail: "ada@example.test",
  };

  function makePersonalProfileForm(
    overrides: Partial<typeof validProfileValues> = {},
  ) {
    return makeFormData({
      ...validProfileValues,
      ...overrides,
    });
  }

  test("rejects missing or oversized own-profile fields before persistence", () => {
    expect(
      validatePersonalProfileForm(
        makePersonalProfileForm({ displayName: "   " }),
      ),
    ).toEqual({ error: "missing-display-name", ok: false });
    expect(
      validatePersonalProfileForm(
        makePersonalProfileForm({ displayName: "a".repeat(81) }),
      ),
    ).toEqual({ error: "display-name-too-long", ok: false });
    expect(
      validatePersonalProfileForm(
        makePersonalProfileForm({ preferredAlias: "a".repeat(51) }),
      ),
    ).toEqual({ error: "preferred-alias-too-long", ok: false });
    expect(
      validatePersonalProfileForm(
        makePersonalProfileForm({ publicEmail: "not-an-email" }),
      ),
    ).toEqual({ error: "invalid-public-email", ok: false });
    expect(
      validatePersonalProfileForm(
        makePersonalProfileForm({ publicEmail: `${"a".repeat(248)}@x.test` }),
      ),
    ).toEqual({ error: "public-email-too-long", ok: false });
  });

  test("normalizes optional own-profile strings without accepting profile IDs", () => {
    expect(
      validatePersonalProfileForm(
        makePersonalProfileForm({
          displayName: ` ${"a".repeat(80)} `,
          preferredAlias: " ",
          publicEmail: " ",
        }),
      ),
    ).toEqual({
      ok: true,
      values: {
        displayName: "a".repeat(80),
        preferredAlias: null,
        publicEmail: null,
      },
    });
  });

  test("keeps own profile updates derived from auth user and tenant only", () => {
    const accountActionSource = readProjectFile(
      "src/app/(app)/app/account/actions.ts",
    );
    const profileActionSource = accountActionSource.slice(
      accountActionSource.indexOf("export async function updateOwnPersonProfile"),
      accountActionSource.indexOf("export async function updateOwnAvatar"),
    );

    expect(profileActionSource).toContain(
      "const context = await getPersonalAccountActionContext(formData);",
    );
    expect(profileActionSource).toContain(
      "const validation = validatePersonalProfileForm(formData);",
    );
    expect(profileActionSource).toMatch(
      /\.from\("person_profiles"\)[\s\S]+\.select\("id"\)[\s\S]+\.eq\("organization_id", context\.organization\.id\)[\s\S]+\.eq\("user_id", context\.user\.id\)[\s\S]+\.maybeSingle\(\)/,
    );
    expect(profileActionSource).toMatch(
      /\.from\("person_profiles"\)[\s\S]+\.update\({[\s\S]+display_name: validation\.values\.displayName[\s\S]+preferred_alias: validation\.values\.preferredAlias[\s\S]+public_email: validation\.values\.publicEmail[\s\S]+\.eq\("id", profile\.id\)[\s\S]+\.eq\("organization_id", context\.organization\.id\)[\s\S]+\.eq\("user_id", context\.user\.id\)/,
    );
    expect(profileActionSource).not.toMatch(
      /formData\.get\(["'](?:person_profile_id|personProfileId|profileId|avatar|signature|document|payroll|hr)["']\)/,
    );
    expect(profileActionSource).not.toMatch(
      /\b(?:avatar_url|storage_path|storage_bucket|signature|document|payroll|salary|contract|iban|bank|metadata)\b/i,
    );
  });
});

test.describe("profile private asset local source guardrails", () => {
  test("keeps own avatar and signature storage private, exact-path gated and own-user scoped", () => {
    const avatarMigrationSource = readProjectFile(
      "supabase/migrations/00005_profile_assets_private_avatar.sql",
    );
    const signatureMigrationSource = readProjectFile(
      "supabase/migrations/00006_profile_signatures_private_own.sql",
    );

    expect(avatarMigrationSource).toMatch(
      /VALUES \([\s\S]+'profile-assets'[\s\S]+'profile-assets'[\s\S]+false[\s\S]+2097152[\s\S]+ARRAY\['image\/jpeg', 'image\/png', 'image\/webp'\]/,
    );
    expect(avatarMigrationSource).toMatch(
      /CREATE TABLE public\.profile_assets[\s\S]+organization_id uuid NOT NULL[\s\S]+person_profile_id uuid NOT NULL[\s\S]+uploaded_by_user_id uuid NOT NULL/,
    );
    expect(avatarMigrationSource).toMatch(
      /storage_bucket text NOT NULL DEFAULT 'profile-assets'[\s\S]+CHECK \(storage_bucket = 'profile-assets'\)/,
    );
    expect(avatarMigrationSource).toMatch(
      /FOREIGN KEY \(person_profile_id, organization_id\)[\s\S]+REFERENCES public\.person_profiles\(id, organization_id\)/,
    );
    expect(avatarMigrationSource).toMatch(
      /profile_assets_storage_path_format[\s\S]+\^avatars\/\[0-9a-f\]/,
    );
    expect(avatarMigrationSource).toMatch(
      /CHECK \(asset_hash ~ '\^\[0-9a-f\]\{64\}\$'\)/,
    );
    expect(avatarMigrationSource).toMatch(
      /validate_profile_asset_row[\s\S]+owner_user_id[\s\S]+person_profile\.user_id[\s\S]+NEW\.uploaded_by_user_id <> owner_user_id[\s\S]+expected_prefix :=[\s\S]+'avatars\/'[\s\S]+NEW\.organization_id::text[\s\S]+NEW\.person_profile_id::text[\s\S]+position\(expected_prefix in NEW\.storage_path\) <> 1/,
    );
    expect(avatarMigrationSource).toMatch(
      /begin_own_profile_avatar_upload[\s\S]+current_user_id uuid := \(select auth\.uid\(\)\)[\s\S]+public\.is_org_member\(target_organization_id\)[\s\S]+target_mime_type NOT IN \('image\/jpeg', 'image\/png', 'image\/webp'\)[\s\S]+target_size_bytes[\s\S]+2097152[\s\S]+target_asset_hash[\s\S]+'\^\[0-9a-f\]\{64\}\$'[\s\S]+person_profile\.user_id = current_user_id[\s\S]+person_profile\.status = 'active'[\s\S]+new_storage_path :=[\s\S]+'avatars\/'/,
    );
    expect(avatarMigrationSource).toMatch(
      /activate_own_profile_avatar_asset[\s\S]+profile_asset\.status = 'pending'[\s\S]+profile_asset\.uploaded_by_user_id = current_user_id[\s\S]+person_profile\.user_id = current_user_id[\s\S]+storage_object\.bucket_id = pending_asset\.storage_bucket[\s\S]+storage_object\.name = pending_asset\.storage_path[\s\S]+SET status = 'replaced'[\s\S]+SET status = 'active'/,
    );
    expect(avatarMigrationSource).toMatch(
      /cancel_own_profile_avatar_upload[\s\S]+SET status = 'deleted'[\s\S]+profile_asset\.status = 'pending'[\s\S]+profile_asset\.uploaded_by_user_id = current_user_id[\s\S]+person_profile\.user_id = current_user_id/,
    );
    expect(avatarMigrationSource).toMatch(
      /CREATE POLICY "Users can upload own profile avatars"[\s\S]+bucket_id = 'profile-assets'[\s\S]+profile_asset\.storage_path = name[\s\S]+profile_asset\.status = 'pending'[\s\S]+profile_asset\.uploaded_by_user_id = \(select auth\.uid\(\)\)[\s\S]+person_profile\.user_id = \(select auth\.uid\(\)\)/,
    );
    expect(avatarMigrationSource).toMatch(
      /CREATE POLICY "Users can read own profile avatars"[\s\S]+bucket_id = 'profile-assets'[\s\S]+profile_asset\.storage_path = name[\s\S]+profile_asset\.status = 'active'[\s\S]+person_profile\.user_id = \(select auth\.uid\(\)\)/,
    );
    expect(avatarMigrationSource).not.toMatch(
      /GRANT\s+[^;]*(?:INSERT|UPDATE|DELETE|ALL)[^;]*ON\s+public\.profile_assets\s+TO\s+authenticated/i,
    );

    expect(signatureMigrationSource).toMatch(
      /VALUES \([\s\S]+'profile-signatures'[\s\S]+'profile-signatures'[\s\S]+false[\s\S]+524288[\s\S]+ARRAY\['image\/png'\]/,
    );
    expect(signatureMigrationSource).toMatch(
      /CREATE TABLE public\.profile_signatures[\s\S]+organization_id uuid NOT NULL[\s\S]+person_profile_id uuid NOT NULL[\s\S]+uploaded_by_user_id uuid NOT NULL/,
    );
    expect(signatureMigrationSource).toMatch(
      /storage_bucket text NOT NULL DEFAULT 'profile-signatures'[\s\S]+CHECK \(storage_bucket = 'profile-signatures'\)/,
    );
    expect(signatureMigrationSource).toMatch(
      /FOREIGN KEY \(person_profile_id, organization_id\)[\s\S]+REFERENCES public\.person_profiles\(id, organization_id\)/,
    );
    expect(signatureMigrationSource).toMatch(
      /profile_signatures_storage_path_format[\s\S]+\^signatures\/\[0-9a-f\]/,
    );
    expect(signatureMigrationSource).toMatch(
      /CHECK \(signature_hash ~ '\^\[0-9a-f\]\{64\}\$'\)/,
    );
    expect(signatureMigrationSource).toMatch(
      /validate_profile_signature_row[\s\S]+owner_user_id[\s\S]+person_profile\.user_id[\s\S]+NEW\.uploaded_by_user_id <> owner_user_id[\s\S]+expected_prefix :=[\s\S]+'signatures\/'[\s\S]+NEW\.organization_id::text[\s\S]+NEW\.person_profile_id::text[\s\S]+position\(expected_prefix in NEW\.storage_path\) <> 1/,
    );
    expect(signatureMigrationSource).toMatch(
      /begin_own_profile_signature_upload[\s\S]+current_user_id uuid := \(select auth\.uid\(\)\)[\s\S]+public\.is_org_member\(target_organization_id\)[\s\S]+target_size_bytes[\s\S]+524288[\s\S]+target_signature_hash[\s\S]+'\^\[0-9a-f\]\{64\}\$'[\s\S]+person_profile\.user_id = current_user_id[\s\S]+person_profile\.status = 'active'[\s\S]+new_storage_path :=[\s\S]+'signatures\/'/,
    );
    expect(signatureMigrationSource).toMatch(
      /activate_own_profile_signature[\s\S]+profile_signature\.status = 'pending'[\s\S]+profile_signature\.uploaded_by_user_id = current_user_id[\s\S]+person_profile\.user_id = current_user_id[\s\S]+storage_object\.bucket_id = pending_signature\.storage_bucket[\s\S]+storage_object\.name = pending_signature\.storage_path[\s\S]+SET status = 'replaced'[\s\S]+status = 'active'/,
    );
    expect(signatureMigrationSource).toMatch(
      /cancel_own_profile_signature_upload[\s\S]+SET status = 'deleted'[\s\S]+profile_signature\.status = 'pending'[\s\S]+profile_signature\.uploaded_by_user_id = current_user_id[\s\S]+person_profile\.user_id = current_user_id/,
    );
    expect(signatureMigrationSource).toMatch(
      /CREATE POLICY "Users can upload own profile signatures"[\s\S]+bucket_id = 'profile-signatures'[\s\S]+profile_signature\.storage_path = name[\s\S]+profile_signature\.status = 'pending'[\s\S]+profile_signature\.uploaded_by_user_id = \(select auth\.uid\(\)\)[\s\S]+person_profile\.user_id = \(select auth\.uid\(\)\)/,
    );
    expect(signatureMigrationSource).toMatch(
      /CREATE POLICY "Users can read own profile signatures"[\s\S]+bucket_id = 'profile-signatures'[\s\S]+profile_signature\.storage_path = name[\s\S]+profile_signature\.status = 'active'[\s\S]+person_profile\.user_id = \(select auth\.uid\(\)\)/,
    );
    expect(signatureMigrationSource).not.toMatch(
      /GRANT\s+[^;]*(?:INSERT|UPDATE|DELETE|ALL)[^;]*ON\s+public\.profile_signatures\s+TO\s+authenticated/i,
    );
  });

  test("keeps account avatar and signature actions own-person only with short-lived signed previews", () => {
    const accountActionSource = readProjectFile(
      "src/app/(app)/app/account/actions.ts",
    );
    const accountPageSource = readProjectFile(
      "src/app/(app)/app/account/page.tsx",
    );
    const avatarHelperSource = readProjectFile("src/lib/profile-assets.ts");
    const signatureHelperSource = readProjectFile(
      "src/lib/profile-signatures.ts",
    );

    expect(avatarHelperSource).toContain(
      'export const PROFILE_ASSETS_BUCKET = "profile-assets";',
    );
    expect(avatarHelperSource).toContain(
      "export const AVATAR_MAX_SIZE_BYTES = 2 * 1024 * 1024;",
    );
    expect(avatarHelperSource).toContain(
      "export const AVATAR_SIGNED_URL_TTL_SECONDS = 120;",
    );
    expect(avatarHelperSource).toMatch(
      /"image\/jpeg"[\s\S]+extension: "jpg"[\s\S]+"image\/png"[\s\S]+extension: "png"[\s\S]+"image\/webp"[\s\S]+extension: "webp"/,
    );
    expect(avatarHelperSource).toMatch(
      /function detectImageMimeType[\s\S]+0xff[\s\S]+0x89[\s\S]+0x50[\s\S]+0x52[\s\S]+0x57[\s\S]+0x50/,
    );
    expect(avatarHelperSource).toMatch(
      /validateAvatarUploadFile[\s\S]+file\.size > AVATAR_MAX_SIZE_BYTES[\s\S]+bytes\.byteLength !== file\.size[\s\S]+detectedMimeType !== file\.type/,
    );

    expect(signatureHelperSource).toContain(
      'export const PROFILE_SIGNATURES_BUCKET = "profile-signatures";',
    );
    expect(signatureHelperSource).toContain(
      "export const SIGNATURE_MAX_SIZE_BYTES = 512 * 1024;",
    );
    expect(signatureHelperSource).toContain(
      'export const SIGNATURE_MIME_TYPE = "image/png";',
    );
    expect(signatureHelperSource).toContain(
      "export const SIGNATURE_SIGNED_URL_TTL_SECONDS = 120;",
    );
    expect(signatureHelperSource).toMatch(
      /const SIGNATURE_DATA_URL_PREFIX = "data:image\/png;base64,"/,
    );
    expect(signatureHelperSource).toMatch(
      /function hasValidPngChunkStructure[\s\S]+chunkType !== "IHDR"[\s\S]+chunkType === "IEND"/,
    );
    expect(signatureHelperSource).toMatch(
      /validateSignatureDataUrl[\s\S]+base64\.length > SIGNATURE_MAX_BASE64_LENGTH[\s\S]+bytes\.byteLength > SIGNATURE_MAX_SIZE_BYTES[\s\S]+dimensions\.width < 240[\s\S]+dimensions\.height > 1000/,
    );

    expect(accountActionSource).not.toMatch(
      /formData\.get\(["'](?:person_profile_id|personProfileId|profileAssetId|profileSignatureId|assetId|signatureId)["']\)/,
    );
    expect(accountActionSource).not.toMatch(
      /\bavatar_url\b|getPublicUrl|\bsignedUrl\b/,
    );
    expect(accountActionSource).toMatch(
      /export async function updateOwnAvatar[\s\S]+\.from\("person_profiles"\)[\s\S]+\.eq\("organization_id", context\.organization\.id\)[\s\S]+\.eq\("user_id", context\.user\.id\)[\s\S]+\.rpc\(\s*"begin_own_profile_avatar_upload"/,
    );
    expect(accountActionSource).toMatch(
      /export async function updateOwnAvatar[\s\S]+\.from\(PROFILE_ASSETS_BUCKET\)[\s\S]+\.upload\(pendingAsset\.storage_path[\s\S]+cancel_own_profile_avatar_upload[\s\S]+activate_own_profile_avatar_asset/,
    );
    expect(accountActionSource).toMatch(
      /export async function updateOwnSignature[\s\S]+\.from\("person_profiles"\)[\s\S]+\.eq\("organization_id", context\.organization\.id\)[\s\S]+\.eq\("user_id", context\.user\.id\)[\s\S]+\.rpc\(\s*"begin_own_profile_signature_upload"/,
    );
    expect(accountActionSource).toMatch(
      /export async function updateOwnSignature[\s\S]+\.from\(PROFILE_SIGNATURES_BUCKET\)[\s\S]+\.upload\(pendingSignature\.storage_path[\s\S]+cancel_own_profile_signature_upload[\s\S]+activate_own_profile_signature/,
    );

    expect(accountPageSource).not.toMatch(/\bavatar_url\b|getPublicUrl/);
    expect(accountPageSource).toMatch(
      /\.from\(PROFILE_ASSETS_BUCKET\)[\s\S]+\.createSignedUrl\(asset\.storage_path, AVATAR_SIGNED_URL_TTL_SECONDS\)/,
    );
    expect(accountPageSource).toMatch(
      /\.from\(PROFILE_SIGNATURES_BUCKET\)[\s\S]+\.createSignedUrl\(signature\.storage_path, SIGNATURE_SIGNED_URL_TTL_SECONDS\)/,
    );
  });
});

test.describe("profile upload validator local helper guardrails", () => {
  test("validates avatar MIME, size and bytes before upload metadata is accepted", () => {
    const pngBytes = Uint8Array.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    const jpegBytes = Uint8Array.from([0xff, 0xd8, 0xff, 0x00]);
    const webpBytes = Uint8Array.from([
      0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42,
      0x50,
    ]);

    expect(validateAvatarUploadFile(null, new Uint8Array())).toEqual({
      error: "avatar-empty",
      ok: false,
    });
    expect(
      validateAvatarUploadFile(makeFileLike("image/gif", 6), pngBytes),
    ).toEqual({
      error: "avatar-unsupported-type",
      ok: false,
    });
    expect(
      validateAvatarUploadFile(
        makeFileLike("image/png", AVATAR_MAX_SIZE_BYTES + 1),
        pngBytes,
      ),
    ).toEqual({
      error: "avatar-too-large",
      ok: false,
    });
    expect(
      validateAvatarUploadFile(makeFileLike("image/png", 99), pngBytes),
    ).toEqual({
      error: "avatar-invalid-file",
      ok: false,
    });
    expect(
      validateAvatarUploadFile(makeFileLike("image/png", jpegBytes.length), jpegBytes),
    ).toEqual({
      error: "avatar-invalid-signature",
      ok: false,
    });
    expect(
      validateAvatarUploadFile(makeFileLike("image/jpeg", pngBytes.length), pngBytes),
    ).toEqual({
      error: "avatar-invalid-signature",
      ok: false,
    });
    expect(
      validateAvatarUploadFile(
        makeFileLike("image/png", pngBytes.length),
        pngBytes,
      ),
    ).toEqual({
      extension: "png",
      mimeType: "image/png",
      ok: true,
      sizeBytes: pngBytes.length,
    });
    expect(
      validateAvatarUploadFile(
        makeFileLike("image/jpeg", jpegBytes.length),
        jpegBytes,
      ),
    ).toEqual({
      extension: "jpg",
      mimeType: "image/jpeg",
      ok: true,
      sizeBytes: jpegBytes.length,
    });
    expect(
      validateAvatarUploadFile(
        makeFileLike("image/webp", webpBytes.length),
        webpBytes,
      ),
    ).toEqual({
      extension: "webp",
      mimeType: "image/webp",
      ok: true,
      sizeBytes: webpBytes.length,
    });
  });

  test("validates signature PNG data URLs, dimensions and size before upload metadata is accepted", () => {
    const validSignature = validateSignatureDataUrl(makePngDataUrl(640, 240));

    expect(validateSignatureDataUrl("")).toEqual({
      error: "signature-empty",
      ok: false,
    });
    expect(validateSignatureDataUrl("data:image/jpeg;base64,aaaa")).toEqual({
      error: "signature-invalid-data",
      ok: false,
    });
    expect(validateSignatureDataUrl("data:image/png;base64,@@@@")).toEqual({
      error: "signature-invalid-data",
      ok: false,
    });
    expect(
      validateSignatureDataUrl(
        `data:image/png;base64,${Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString(
          "base64",
        )}`,
      ),
    ).toEqual({
      error: "signature-invalid-signature",
      ok: false,
    });
    expect(validateSignatureDataUrl(makePngDataUrl(239, 240))).toEqual({
      error: "signature-invalid-dimensions",
      ok: false,
    });
    expect(validateSignatureDataUrl(makePngDataUrl(640, 99))).toEqual({
      error: "signature-invalid-dimensions",
      ok: false,
    });
    expect(
      validateSignatureDataUrl(`data:image/png;base64,${"A".repeat(700000)}`),
    ).toEqual({
      error: "signature-too-large",
      ok: false,
    });
    expect(validSignature).toMatchObject({
      height: 240,
      mimeType: "image/png",
      ok: true,
      sizeBytes: makePngBytes(640, 240).byteLength,
      width: 640,
    });
  });

  test("validates document MIME, extension, size and bytes before private upload", () => {
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
    const pdfFile = new File([pdfBytes], "programacion.pdf", {
      type: "application/pdf",
    });

    expect(validateMinimalDocumentUploadFile(pdfFile, pdfBytes)).toEqual({
      extension: "pdf",
      mimeType: "application/pdf",
      ok: true,
      originalFilename: "programacion.pdf",
      sizeBytes: pdfBytes.length,
    });

    const extensionMismatch = new File([pdfBytes], "programacion.txt", {
      type: "application/pdf",
    });
    expect(
      validateMinimalDocumentUploadFile(extensionMismatch, pdfBytes),
    ).toEqual({
      error: "file-extension-mismatch",
      ok: false,
    });

    const binaryBytes = new Uint8Array([0, 1, 2]);
    const contentMismatch = new File([binaryBytes], "datos.csv", {
      type: "text/csv",
    });
    expect(
      validateMinimalDocumentUploadFile(contentMismatch, binaryBytes),
    ).toEqual({
      error: "file-content-mismatch",
      ok: false,
    });

    const oversizedFileBytes = new Uint8Array(
      DOCUMENT_UPLOAD_MAX_SIZE_BYTES + 1,
    );
    oversizedFileBytes.set(pdfBytes);
    const oversizedFile = new File([oversizedFileBytes], "grande.pdf", {
      type: "application/pdf",
    });

    expect(
      validateMinimalDocumentUploadFile(oversizedFile, oversizedFileBytes),
    ).toEqual({
      error: "file-too-large",
      ok: false,
    });
  });

  test("keeps account upload actions hashing validated bytes and sending bounded metadata before private RPC/upload", () => {
    const accountActionSource = readProjectFile(
      "src/app/(app)/app/account/actions.ts",
    );

    expect(accountActionSource).toMatch(
      /const validation = validateAvatarUploadFile\(file, bytes\)[\s\S]+const assetHash = createHash\("sha256"\)\.update\(bytes\)\.digest\("hex"\)[\s\S]+\.rpc\(\s*"begin_own_profile_avatar_upload"[\s\S]+target_asset_hash: assetHash[\s\S]+target_file_extension: validation\.extension[\s\S]+target_mime_type: validation\.mimeType[\s\S]+target_size_bytes: validation\.sizeBytes[\s\S]+\.from\(PROFILE_ASSETS_BUCKET\)[\s\S]+\.upload\(pendingAsset\.storage_path/,
    );
    expect(accountActionSource).toMatch(
      /const validation = validateSignatureDataUrl\(signatureDataUrl\)[\s\S]+const fileBuffer = Buffer\.from\(validation\.bytes\)[\s\S]+const signatureHash = createHash\("sha256"\)\.update\(fileBuffer\)\.digest\("hex"\)[\s\S]+\.rpc\(\s*"begin_own_profile_signature_upload"[\s\S]+target_height: validation\.height[\s\S]+target_signature_hash: signatureHash[\s\S]+target_size_bytes: validation\.sizeBytes[\s\S]+target_width: validation\.width[\s\S]+\.from\(PROFILE_SIGNATURES_BUCKET\)[\s\S]+\.upload\(pendingSignature\.storage_path/,
    );
  });
});

test.describe("document storage and signed URL local source guardrails", () => {
  test("keeps document preview/download routes backend-only, audited, no-store and short-lived", () => {
    const documentFileAccessSource = readFileSync(
      path.join(process.cwd(), "src/lib/document-file-access.ts"),
      "utf8",
    );
    const previewRouteSource = readFileSync(
      path.join(
        process.cwd(),
        "src/app/(app)/app/documents/[documentId]/versions/[documentVersionId]/preview/route.ts",
      ),
      "utf8",
    );
    const downloadRouteSource = readFileSync(
      path.join(
        process.cwd(),
        "src/app/(app)/app/documents/[documentId]/versions/[documentVersionId]/download/route.ts",
      ),
      "utf8",
    );

    expect(documentFileAccessSource).toContain(
      'export const DOCUMENT_FILES_BUCKET = "document-files";',
    );
    expect(documentFileAccessSource).toContain(
      "export const DOCUMENT_FILE_SIGNED_URL_TTL_SECONDS = 60;",
    );
    expect(documentFileAccessSource).toMatch(
      /documentVersion\.storage_bucket !== DOCUMENT_FILES_BUCKET/,
    );
    expect(documentFileAccessSource).toMatch(/document\.requires_signature/);
    expect(documentFileAccessSource).toMatch(
      /function noStoreJson[\s\S]+"Cache-Control": "no-store"/,
    );
    expect(documentFileAccessSource).toMatch(
      /\.rpc\(\s*"can_access_document"[\s\S]+target_access_level: accessLevel[\s\S]+target_organization_id: organizationId/,
    );
    expect(documentFileAccessSource).toMatch(
      /recordDeniedDocumentFileAccess\(\{[\s\S]+reason: "insufficient_access"/,
    );
    expect(documentFileAccessSource).toMatch(
      /recordDeniedDocumentFileAccess\(\{[\s\S]+reason: "document_file_not_readable"/,
    );
    expect(documentFileAccessSource).toMatch(
      /const auditRecorded = await recordDocumentFileAccessEvent\(\{[\s\S]+result: "allowed"[\s\S]+if \(!auditRecorded\)[\s\S]+document_file_audit_required[\s\S]+NextResponse\.redirect\(signedUrlData\.signedUrl, 302\)/,
    );
    expect(documentFileAccessSource).toMatch(
      /\.from\(DOCUMENT_FILES_BUCKET\)[\s\S]+\.createSignedUrl\([\s\S]+documentVersion\.storage_path,[\s\S]+DOCUMENT_FILE_SIGNED_URL_TTL_SECONDS/,
    );
    expect(documentFileAccessSource).toMatch(
      /response\.headers\.set\("Cache-Control", "no-store"\)[\s\S]+response\.headers\.set\("X-Robots-Tag", "noindex"\)/,
    );

    expect(previewRouteSource).toContain('export const dynamic = "force-dynamic";');
    expect(previewRouteSource).toMatch(
      /handleDocumentVersionFileAccess\(\{[\s\S]+mode: "preview"/,
    );
    expect(downloadRouteSource).toContain(
      'export const dynamic = "force-dynamic";',
    );
    expect(downloadRouteSource).toMatch(
      /handleDocumentVersionFileAccess\(\{[\s\S]+mode: "download"/,
    );
  });

  test("keeps document signed URLs out of visible document clients", () => {
    const documentRepositoryPageSource = readFileSync(
      path.join(process.cwd(), "src/app/(app)/app/documents/page.tsx"),
      "utf8",
    );
    const scheduleDetailPanelSource = readFileSync(
      path.join(
        process.cwd(),
        "src/app/(app)/app/schedule/schedule-block-detail-panels.tsx",
      ),
      "utf8",
    );
    const visibleDocumentSurfaceSource = [
      documentRepositoryPageSource,
      scheduleDetailPanelSource,
    ].join("\n");

    expect(visibleDocumentSurfaceSource).not.toMatch(
      /createSignedUrl|signedUrl|storage_path|storage_bucket|DOCUMENT_FILES_BUCKET|document-files/,
    );
    expect(documentRepositoryPageSource).toContain("getDocumentVersionRouteHref");
    expect(scheduleDetailPanelSource).toContain("getDocumentVersionRouteHref");
    expect(documentRepositoryPageSource).toMatch(
      /entry\.can_preview[\s\S]+href=\{previewHref\}/,
    );
    expect(documentRepositoryPageSource).toMatch(
      /entry\.can_download[\s\S]+href=\{downloadHref\}/,
    );
    expect(scheduleDetailPanelSource).toMatch(
      /entry\.can_preview[\s\S]+href=\{previewHref\}/,
    );
    expect(scheduleDetailPanelSource).toMatch(
      /entry\.can_download[\s\S]+href=\{downloadHref\}/,
    );
  });

  test("keeps the minimal document repository excluding signable documents and direct file paths", () => {
    const repositorySource = readFileSync(
      path.join(process.cwd(), "src/lib/documents.ts"),
      "utf8",
    );
    const repositoryMigrationSource = readFileSync(
      path.join(
        process.cwd(),
        "supabase/migrations/00043_document_repository_minimal_visible.sql",
      ),
      "utf8",
    );

    expect(repositorySource).toContain("can_download: boolean;");
    expect(repositorySource).toContain("can_preview: boolean;");
    expect(repositorySource).not.toMatch(
      /storage_path|storage_bucket|signedUrl|createSignedUrl/,
    );
    expect(repositoryMigrationSource).toContain("can_preview boolean");
    expect(repositoryMigrationSource).toContain("can_download boolean");
    expect(repositoryMigrationSource).toContain(
      "document.requires_signature = false",
    );
    expect(repositoryMigrationSource).toContain(
      "document_version.storage_bucket = 'document-files'",
    );
  });

  test("keeps document version upload lifecycle private, exact-path gated and audited", () => {
    const metadataMigrationSource = readProjectFile(
      "supabase/migrations/00007_document_metadata_private_foundation.sql",
    );
    const storageMigrationSource = readProjectFile(
      "supabase/migrations/00008_document_files_private_storage.sql",
    );
    const auditMigrationSource = readProjectFile(
      "supabase/migrations/00009_document_access_audit_foundation.sql",
    );

    expect(metadataMigrationSource).toMatch(
      /CREATE TABLE public\.document_versions[\s\S]+organization_id uuid NOT NULL[\s\S]+FOREIGN KEY \(document_id, organization_id\)[\s\S]+REFERENCES public\.documents\(id, organization_id\)/,
    );
    expect(metadataMigrationSource).toMatch(
      /storage_bucket text NOT NULL DEFAULT 'document-files'[\s\S]+CHECK \(storage_bucket = 'document-files'\)/,
    );
    expect(metadataMigrationSource).toMatch(
      /status text NOT NULL DEFAULT 'pending'[\s\S]+CHECK \(status IN \('pending', 'active', 'archived', 'deleted'\)\)/,
    );
    expect(metadataMigrationSource).toMatch(
      /CONSTRAINT document_versions_storage_path_format[\s\S]+storage_path ~[\s\S]+'\^documents\/\[0-9a-f\]/,
    );
    expect(metadataMigrationSource).toMatch(
      /UNIQUE \(storage_bucket, storage_path\)/,
    );

    expect(storageMigrationSource).toMatch(
      /INSERT INTO storage\.buckets[\s\S]+VALUES \([\s\S]+'document-files'[\s\S]+'document-files'[\s\S]+false[\s\S]+10485760[\s\S]+ARRAY\[/,
    );
    for (const mimeType of [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
      "text/plain",
      "text/csv",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ]) {
      expect(
        storageMigrationSource,
        `document-files allows only expected MIME ${mimeType}`,
      ).toContain(`'${mimeType}'`);
    }
    expect(storageMigrationSource).toMatch(
      /document_file_extension_matches_mime[\s\S]+WHEN 'application\/pdf' THEN lower\(target_file_extension\) = 'pdf'[\s\S]+WHEN 'image\/jpeg' THEN lower\(target_file_extension\) IN \('jpg', 'jpeg'\)[\s\S]+WHEN 'application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet' THEN lower\(target_file_extension\) = 'xlsx'/,
    );
    expect(storageMigrationSource).toMatch(
      /ADD CONSTRAINT document_versions_mime_type_allowed[\s\S]+mime_type IN/,
    );
    expect(storageMigrationSource).toMatch(
      /ADD CONSTRAINT document_versions_private_storage_size_limit[\s\S]+size_bytes > 0 AND size_bytes <= 10485760/,
    );
    expect(storageMigrationSource).toMatch(
      /ADD CONSTRAINT document_versions_storage_path_allowed_extension[\s\S]+csv\|docx\|jpeg\|jpg\|pdf\|png\|txt\|webp\|xlsx/,
    );
    expect(storageMigrationSource).toMatch(
      /validate_document_version_row[\s\S]+parent_document\.requires_signature[\s\S]+signable document files are out of scope[\s\S]+position\(expected_prefix in NEW\.storage_path\) <> 1[\s\S]+document_file_extension_matches_mime\(NEW\.mime_type, storage_extension\)[\s\S]+NEW\.size_bytes[\s\S]+10485760[\s\S]+NEW\.document_hash[\s\S]+\^\[0-9a-f\]\{64\}\$[\s\S]+document version immutable fields cannot be changed/,
    );

    expect(storageMigrationSource).toMatch(
      /begin_document_version_upload[\s\S]+current_user_id IS NULL[\s\S]+is_org_member\(target_organization_id\)[\s\S]+target_document\.status NOT IN \('draft', 'active'\)[\s\S]+target_document\.requires_signature[\s\S]+can_manage_document_by_id/,
    );
    expect(storageMigrationSource).toMatch(
      /begin_document_version_upload[\s\S]+target_size_bytes IS NULL OR target_size_bytes <= 0 OR target_size_bytes > 10485760[\s\S]+target_document_hash IS NULL OR target_document_hash !~ '\^\[0-9a-f\]\{64\}\$'[\s\S]+jsonb_typeof\(target_metadata\) <> 'object'/,
    );
    expect(storageMigrationSource).toMatch(
      /new_storage_path :=[\s\S]+'documents\/'[\s\S]+target_organization_id::text[\s\S]+target_document_id::text[\s\S]+new_document_version_id::text[\s\S]+new_asset_id::text[\s\S]+normalized_extension/,
    );
    expect(storageMigrationSource).toMatch(
      /INSERT INTO public\.document_versions[\s\S]+storage_bucket,[\s\S]+storage_path,[\s\S]+document_hash,[\s\S]+status,[\s\S]+metadata[\s\S]+VALUES \([\s\S]+'document-files'[\s\S]+new_storage_path[\s\S]+target_document_hash[\s\S]+'pending'/,
    );

    expect(auditMigrationSource).toMatch(
      /activate_document_version_upload[\s\S]+document_version\.status = 'pending'[\s\S]+document_version\.uploaded_by_user_id = current_user_id[\s\S]+target_document\.requires_signature[\s\S]+can_manage_document_by_id/,
    );
    expect(auditMigrationSource).toMatch(
      /FROM storage\.objects storage_object[\s\S]+storage_object\.bucket_id = pending_document_version\.storage_bucket[\s\S]+storage_object\.name = pending_document_version\.storage_path/,
    );
    expect(auditMigrationSource).toMatch(
      /object_size_bytes <> pending_document_version\.size_bytes[\s\S]+lower\(object_mime_type\) <> lower\(pending_document_version\.mime_type\)[\s\S]+pending_document_version\.document_hash[\s\S]+\^\[0-9a-f\]\{64\}\$/,
    );
    expect(auditMigrationSource).toMatch(
      /UPDATE public\.document_versions[\s\S]+status = 'archived'[\s\S]+WHERE organization_id = pending_document_version\.organization_id[\s\S]+AND status = 'active'[\s\S]+UPDATE public\.document_versions[\s\S]+status = 'active'[\s\S]+UPDATE public\.documents[\s\S]+current_version_id = activated_document_version\.id/,
    );
    expect(auditMigrationSource).toMatch(
      /record_document_access_event\([\s\S]+'version_archived'[\s\S]+'superseded_by_activation'[\s\S]+record_document_access_event\([\s\S]+'version_activated'[\s\S]+'version_number'/,
    );

    expect(storageMigrationSource).toMatch(
      /cancel_document_version_upload[\s\S]+UPDATE public\.document_versions document_version[\s\S]+SET status = 'deleted'[\s\S]+document_version\.status = 'pending'[\s\S]+document_version\.uploaded_by_user_id = current_user_id[\s\S]+document\.requires_signature = false[\s\S]+can_manage_document_by_id/,
    );
    expect(storageMigrationSource).toMatch(
      /CREATE POLICY "Document managers can upload pending document files"[\s\S]+bucket_id = 'document-files'[\s\S]+document_version\.storage_path = name[\s\S]+document_version\.status = 'pending'[\s\S]+document_version\.uploaded_by_user_id = \(select auth\.uid\(\)\)[\s\S]+document\.requires_signature = false/,
    );
    expect(storageMigrationSource).toMatch(
      /CREATE POLICY "Users can read accessible document files"[\s\S]+bucket_id = 'document-files'[\s\S]+document_version\.storage_path = name[\s\S]+document_version\.status IN \('active', 'archived'\)[\s\S]+document\.status IN \('active', 'archived'\)[\s\S]+can_access_document\([\s\S]+'preview'/,
    );
    expect(storageMigrationSource).toMatch(
      /REVOKE INSERT, UPDATE ON public\.document_versions FROM authenticated[\s\S]+GRANT SELECT ON public\.document_versions TO authenticated/,
    );
    expect(storageMigrationSource).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.begin_document_version_upload[\s\S]+GRANT EXECUTE ON FUNCTION public\.activate_document_version_upload\(uuid\) TO authenticated[\s\S]+GRANT EXECUTE ON FUNCTION public\.cancel_document_version_upload\(uuid\) TO authenticated/,
    );
  });
});

test.describe("document access audit local source guardrails", () => {
  test("keeps document access audit metadata minimized before events are persisted", () => {
    const auditMigrationSource = readFileSync(
      path.join(
        process.cwd(),
        "supabase/migrations/00009_document_access_audit_foundation.sql",
      ),
      "utf8",
    );

    expect(auditMigrationSource).toContain(
      "CREATE OR REPLACE FUNCTION public.document_access_event_metadata_is_safe",
    );
    expect(auditMigrationSource).toMatch(
      /WITH RECURSIVE walk[\s\S]+jsonb_each/,
    );
    expect(auditMigrationSource).toMatch(
      /target_metadata IS NOT NULL[\s\S]+jsonb_typeof\(target_metadata\) = 'object'[\s\S]+pg_column_size\(target_metadata\) <= 4096/,
    );

    for (const term of [
      "content",
      "body",
      "html",
      "raw",
      "base64",
      "url",
      "uri",
      "path",
      "token",
      "secret",
      "signature",
      "document_hash",
      "storage",
    ]) {
      expect(
        auditMigrationSource,
        `document audit metadata blocks ${term}`,
      ).toMatch(new RegExp(`\\b${term}\\b`, "i"));
    }

    expect(auditMigrationSource).toContain("jsonb_typeof(value) = 'array'");
    expect(auditMigrationSource).toContain(
      "length(value #>> '{}') > 512",
    );

    for (const valuePattern of [
      "https?://",
      "data:",
      "storage/v1",
      "-----BEGIN",
      "signed-url",
      "signed_url",
    ]) {
      expect(
        auditMigrationSource,
        `document audit metadata blocks value pattern ${valuePattern}`,
      ).toContain(valuePattern);
    }

    expect(auditMigrationSource).toMatch(
      /CONSTRAINT document_access_events_metadata_safe[\s\S]+document_access_event_metadata_is_safe\(metadata\)/,
    );
    expect(auditMigrationSource).toMatch(
      /record_document_access_event[\s\S]+document_access_event_metadata_is_safe\(normalized_metadata\)[\s\S]+document audit metadata is not allowed/,
    );
  });

  test("keeps document access audit results explicit and read access non-inherited by high roles", () => {
    const auditMigrationSource = readFileSync(
      path.join(
        process.cwd(),
        "supabase/migrations/00009_document_access_audit_foundation.sql",
      ),
      "utf8",
    );
    const documentMetadataMigrationSource = readFileSync(
      path.join(
        process.cwd(),
        "supabase/migrations/00007_document_metadata_private_foundation.sql",
      ),
      "utf8",
    );

    expect(auditMigrationSource).toMatch(
      /result text NOT NULL DEFAULT 'allowed'[\s\S]+CHECK \(result IN \('allowed', 'denied'\)\)/,
    );
    expect(auditMigrationSource).toMatch(
      /CONSTRAINT document_access_events_denied_only_for_access[\s\S]+result = 'allowed'[\s\S]+event_type IN \('metadata_read', 'file_preview', 'file_download'\)/,
    );
    expect(auditMigrationSource).toMatch(
      /CONSTRAINT document_access_events_file_event_version_required[\s\S]+event_type NOT IN \('file_preview', 'file_download', 'version_created', 'version_activated', 'version_archived'\)[\s\S]+document_version_id IS NOT NULL/,
    );
    expect(auditMigrationSource).toMatch(
      /current_user_id uuid := \(select auth\.uid\(\)\)[\s\S]+active membership required/,
    );
    expect(auditMigrationSource).toMatch(
      /normalized_result NOT IN \('allowed', 'denied'\)[\s\S]+document audit result is not allowed/,
    );
    expect(auditMigrationSource).toMatch(
      /normalized_result = 'denied'[\s\S]+normalized_event_type NOT IN \('metadata_read', 'file_preview', 'file_download'\)[\s\S]+denied document change events are out of scope/,
    );
    expect(auditMigrationSource).toMatch(
      /IF normalized_result = 'allowed' THEN[\s\S]+can_access_document\([\s\S]+can_manage_document_by_id/,
    );
    expect(auditMigrationSource).toMatch(
      /own_person_profile_id := public\.get_own_person_profile_id\(target_organization_id\)/,
    );

    expect(auditMigrationSource).toMatch(
      /can_read_document_access_events[\s\S]+document\.sensitivity_level = 'payroll'[\s\S]+ARRAY\['payroll_manager'\][\s\S]+has_document_capability\(target_organization_id, 'document_access_audit_read'\)/,
    );
    expect(auditMigrationSource).toMatch(
      /CREATE POLICY "Document audit readers can view permitted document events"[\s\S]+USING \(public\.can_read_document_access_events\(document_id, organization_id\)\)/,
    );
    expect(auditMigrationSource).toMatch(
      /list_document_access_events_for_document[\s\S]+can_read_document_access_events\(target_document_id, target_organization_id\)/,
    );

    const auditCapabilityMatch = documentMetadataMigrationSource.match(
      /WHEN 'document_access_audit_read' THEN[\s\S]+?ARRAY\[([^\]]+)\]/,
    );
    const auditRoles =
      auditCapabilityMatch?.[1]
        ?.match(/'([^']+)'/g)
        ?.map((role) => role.replace(/'/g, "")) ?? [];

    expect(auditRoles).toEqual(["document_admin"]);
    expect(auditRoles).not.toContain("owner");
    expect(auditRoles).not.toContain("admin");
    expect(auditRoles).not.toContain("manager");
  });
});

test.describe("document access grants local source guardrails", () => {
  test("keeps document subjects tenant-scoped, target-specific and non-managerial", () => {
    const grantsMigrationSource = readProjectFile(
      "supabase/migrations/00007_document_metadata_private_foundation.sql",
    );

    expect(grantsMigrationSource).toContain(
      "CREATE TABLE public.document_subjects",
    );
    expect(grantsMigrationSource).toMatch(
      /FOREIGN KEY \(document_id, organization_id\)[\s\S]+REFERENCES public\.documents\(id, organization_id\)/,
    );

    for (const target of [
      "person_profile_id",
      "center_id",
      "coach_profile_id",
      "schedule_block_id",
      "class_type_id",
    ]) {
      expect(
        grantsMigrationSource,
        `document_subjects keeps ${target} tenant-scoped`,
      ).toMatch(
        new RegExp(
          `FOREIGN KEY \\(${target}, organization_id\\)[\\s\\S]+REFERENCES public\\.`,
        ),
      );
    }

    expect(grantsMigrationSource).toMatch(
      /CONSTRAINT document_subjects_target_matches_type[\s\S]+subject_type = 'person'[\s\S]+person_profile_id IS NOT NULL[\s\S]+subject_type = 'center'[\s\S]+center_id IS NOT NULL[\s\S]+subject_type = 'coach'[\s\S]+coach_profile_id IS NOT NULL[\s\S]+subject_type = 'schedule_block'[\s\S]+schedule_block_id IS NOT NULL[\s\S]+subject_type = 'class_type'[\s\S]+class_type_id IS NOT NULL/,
    );
    expect(grantsMigrationSource).toMatch(
      /CONSTRAINT document_subjects_metadata_object[\s\S]+jsonb_typeof\(metadata\) = 'object'/,
    );
    expect(grantsMigrationSource).toMatch(
      /requested_rank <= public\.document_access_level_rank\('download'\)[\s\S]+FROM public\.document_subjects document_subject[\s\S]+document_subject\.subject_type = 'person'[\s\S]+document_subject\.person_profile_id = own_person_profile_id[\s\S]+document_subject\.status = 'active'[\s\S]+RETURN true/,
    );
    expect(grantsMigrationSource).toMatch(
      /CREATE POLICY "Users can view accessible document subjects"[\s\S]+public\.can_access_document\(document_id, organization_id, NULL, 'read_metadata'\)/,
    );
    expect(grantsMigrationSource).toMatch(
      /CREATE POLICY "Document managers can create document subjects"[\s\S]+public\.can_manage_document_by_id\(document_id, organization_id\)/,
    );
    expect(grantsMigrationSource).toMatch(
      /CREATE POLICY "Document managers can update document subjects"[\s\S]+public\.can_manage_document_by_id\(document_id, organization_id\)/,
    );
    expect(grantsMigrationSource).toMatch(
      /GRANT SELECT, INSERT, UPDATE ON public\.document_subjects TO authenticated/,
    );
    expect(grantsMigrationSource).not.toMatch(
      /ON public\.document_subjects FOR DELETE/,
    );
    expect(grantsMigrationSource).not.toMatch(
      /GRANT\s+[^;]*DELETE[^;]*ON\s+public\.document_subjects\s+TO\s+authenticated/i,
    );
  });

  test("keeps document grants explicit, immutable, active-only and capability-gated", () => {
    const grantsMigrationSource = readProjectFile(
      "supabase/migrations/00007_document_metadata_private_foundation.sql",
    );
    const programmingMigrationSource = readProjectFile(
      "supabase/migrations/00042_document_programming_schedule_links.sql",
    );

    expect(grantsMigrationSource).toContain(
      "CREATE TABLE public.document_access_grants",
    );
    expect(grantsMigrationSource).toMatch(
      /FOREIGN KEY \(document_id, organization_id\)[\s\S]+REFERENCES public\.documents\(id, organization_id\)/,
    );
    expect(grantsMigrationSource).toMatch(
      /FOREIGN KEY \(document_version_id, document_id, organization_id\)[\s\S]+REFERENCES public\.document_versions\(id, document_id, organization_id\)/,
    );
    expect(grantsMigrationSource).toMatch(
      /FOREIGN KEY \(person_profile_id, organization_id\)[\s\S]+REFERENCES public\.person_profiles\(id, organization_id\)/,
    );
    expect(grantsMigrationSource).toMatch(
      /FOREIGN KEY \(organization_membership_id, organization_id\)[\s\S]+REFERENCES public\.organization_memberships\(id, organization_id\)/,
    );
    expect(grantsMigrationSource).toMatch(
      /CONSTRAINT document_access_grants_single_target[\s\S]+num_nonnulls\(person_profile_id, organization_membership_id, role, capability\) = 1/,
    );
    expect(grantsMigrationSource).toMatch(
      /access_level text NOT NULL DEFAULT 'read_metadata'[\s\S]+'manage_grants'/,
    );
    expect(grantsMigrationSource).toMatch(
      /document_access_level_rank[\s\S]+WHEN 'manage_grants' THEN 50/,
    );
    expect(grantsMigrationSource).toMatch(
      /CONSTRAINT document_access_grants_revocation_state[\s\S]+grant_status = 'active' AND revoked_at IS NULL[\s\S]+grant_status = 'revoked' AND revoked_at IS NOT NULL/,
    );
    expect(grantsMigrationSource).toMatch(
      /FROM public\.document_access_grants grant_record[\s\S]+INNER JOIN public\.organization_memberships membership[\s\S]+membership\.status = 'active'/,
    );
    expect(grantsMigrationSource).toMatch(
      /grant_record\.grant_status = 'active'[\s\S]+grant_record\.expires_at IS NULL OR grant_record\.expires_at > now\(\)[\s\S]+document_access_level_rank\(grant_record\.access_level\) >= requested_rank/,
    );
    expect(grantsMigrationSource).toMatch(
      /grant_record\.person_profile_id = own_person_profile_id[\s\S]+grant_record\.organization_membership_id = membership\.id[\s\S]+grant_record\.role = membership\.role[\s\S]+has_document_capability\(target_organization_id, grant_record\.capability\)/,
    );
    expect(grantsMigrationSource).toMatch(
      /validate_document_access_grant_row[\s\S]+NEW\.organization_id <> OLD\.organization_id[\s\S]+NEW\.person_profile_id IS DISTINCT FROM OLD\.person_profile_id[\s\S]+NEW\.role IS DISTINCT FROM OLD\.role[\s\S]+NEW\.capability IS DISTINCT FROM OLD\.capability[\s\S]+document access grant immutable fields cannot be changed/,
    );
    expect(grantsMigrationSource).toMatch(
      /ALTER TABLE public\.document_access_grants ENABLE ROW LEVEL SECURITY/,
    );
    expect(grantsMigrationSource).toMatch(
      /Document grant managers can view grants[\s\S]+can_access_document\(document_id, organization_id, document_version_id, 'manage_grants'\)/,
    );
    expect(grantsMigrationSource).toMatch(
      /Document grant managers can create grants[\s\S]+can_access_document\(document_id, organization_id, document_version_id, 'manage_grants'\)[\s\S]+granted_by_user_id = \(select auth\.uid\(\)\)/,
    );
    expect(grantsMigrationSource).toMatch(
      /Document grant managers can update grants[\s\S]+can_access_document\(document_id, organization_id, document_version_id, 'manage_grants'\)/,
    );
    expect(grantsMigrationSource).not.toMatch(
      /ON public\.document_access_grants FOR DELETE/,
    );
    expect(grantsMigrationSource).not.toMatch(
      /GRANT\s+[^;]*DELETE[^;]*ON\s+public\.document_access_grants\s+TO\s+authenticated/i,
    );

    expect(programmingMigrationSource).toMatch(
      /WHEN 'document_grant_manage' THEN[\s\S]+ARRAY\['document_admin'\]/,
    );
    expect(programmingMigrationSource).toMatch(
      /WHEN 'signature_request_manage' THEN[\s\S]+false/,
    );
    expect(programmingMigrationSource).toMatch(
      /WHEN 'document_sign_self' THEN[\s\S]+false/,
    );
    expect(programmingMigrationSource).toMatch(
      /WHEN 'signature_evidence_read' THEN[\s\S]+false/,
    );
    expect(programmingMigrationSource).toMatch(
      /WHEN 'document_access_audit_read' THEN[\s\S]+ARRAY\['document_admin'\]/,
    );
    expect(programmingMigrationSource).toMatch(
      /WHEN 'payroll_private_manage' THEN[\s\S]+ARRAY\['payroll_manager'\]/,
    );
  });
});

test.describe("document programming grants local source guardrails", () => {
  test("keeps document programming links grant-gated and separate from schedule assignments", () => {
    const programmingMigrationSource = readProjectFile(
      "supabase/migrations/00042_document_programming_schedule_links.sql",
    );
    const programmingHelperSource = readProjectFile(
      "src/lib/document-programming.ts",
    );

    expect(programmingMigrationSource).toContain(
      "CREATE TABLE public.document_programming_links",
    );
    expect(programmingMigrationSource).toMatch(
      /FOREIGN KEY \(schedule_block_id, organization_id\)[\s\S]+REFERENCES public\.schedule_blocks\(id, organization_id\)/,
    );
    expect(programmingMigrationSource).toMatch(
      /CREATE POLICY "Users can view authorized active document programming links"[\s\S]+public\.can_access_document\(document_id, organization_id, document_version_id, 'read_metadata'\)/,
    );
    expect(programmingMigrationSource).toMatch(
      /can_manage_document_programming_link[\s\S]+public\.can_access_document\([\s\S]+target_document_version_id,[\s\S]+'manage'/,
    );
    expect(programmingMigrationSource).toMatch(
      /create_document_programming_link[\s\S]+can_manage_document_programming_link/,
    );
    expect(programmingMigrationSource).toMatch(
      /set_document_programming_link_status[\s\S]+can_manage_document_programming_link/,
    );
    expect(programmingMigrationSource).toMatch(
      /list_document_programming_for_block[\s\S]+public\.can_access_document\([\s\S]+normalized_access_level/,
    );
    expect(programmingMigrationSource).toMatch(
      /list_document_programming_for_context[\s\S]+public\.can_access_document\([\s\S]+normalized_access_level/,
    );
    expect(programmingMigrationSource).toMatch(
      /public\.can_access_document\(link\.document_id, link\.organization_id, link\.document_version_id, 'preview'\) AS can_preview/,
    );
    expect(programmingMigrationSource).toMatch(
      /public\.can_access_document\(link\.document_id, link\.organization_id, link\.document_version_id, 'download'\) AS can_download/,
    );
    expect(programmingMigrationSource).toContain(
      "document.document_scope = 'programming'",
    );
    expect(programmingMigrationSource).toContain(
      "document.requires_signature = false",
    );
    expect(programmingMigrationSource).not.toContain(
      "schedule_block_assignments",
    );
    expect(programmingMigrationSource).not.toMatch(
      /GRANT\s+(?:INSERT|UPDATE|DELETE|ALL)[^;]+ON\s+public\.document_programming_links\s+TO\s+authenticated/i,
    );

    expect(programmingHelperSource).toMatch(
      /\.rpc<DocumentProgrammingEntry\[]>\(\s*"list_document_programming_for_block"/,
    );
    expect(programmingHelperSource).toMatch(
      /\.rpc<DocumentProgrammingEntry\[]>\(\s*"list_document_programming_for_context"/,
    );
    expect(programmingHelperSource).toMatch(
      /\.rpc<DocumentProgrammingLinkRow>\(\s*"create_document_programming_link"/,
    );
    expect(programmingHelperSource).toMatch(
      /\.rpc<DocumentProgrammingLinkRow>\(\s*"set_document_programming_link_status"/,
    );
    expect(programmingHelperSource).not.toContain(
      "schedule_block_assignments",
    );
    expect(programmingHelperSource).not.toMatch(
      /\.from\(["']document_programming_links["']\)[\s\S]{0,220}\.(?:insert|update|upsert|delete)\(/,
    );
  });

  test("keeps visible document surfaces without grants UI, raw paths or signable/sensitive document exposure", () => {
    const documentRepositoryPageSource = readProjectFile(
      "src/app/(app)/app/documents/page.tsx",
    );
    const scheduleDetailPanelSource = readProjectFile(
      "src/app/(app)/app/schedule/schedule-block-detail-panels.tsx",
    );
    const repositoryMigrationSource = readProjectFile(
      "supabase/migrations/00043_document_repository_minimal_visible.sql",
    );
    const visibleDocumentSurfaceSource = [
      documentRepositoryPageSource,
      scheduleDetailPanelSource,
    ].join("\n");

    expect(documentRepositoryPageSource).toContain(
      "listAccessibleDocumentVersions",
    );
    expect(documentRepositoryPageSource).toContain(
      "canCreateMinimalDocumentUpload",
    );
    expect(documentRepositoryPageSource).toContain("entry.can_preview");
    expect(documentRepositoryPageSource).toContain("entry.can_download");
    expect(scheduleDetailPanelSource).toContain(
      "Material de apoyo",
    );
    expect(scheduleDetailPanelSource).toContain("Solo informacion");

    expect(visibleDocumentSurfaceSource).not.toMatch(
      /document_access_grants|manage_grants|document_grant_manage|programming_content_manage/,
    );
    expect(visibleDocumentSurfaceSource).not.toMatch(
      /createDocumentProgrammingLink|setDocumentProgrammingLinkStatus/,
    );
    // Minimal uploads are allowed only in the repository; schedule-linked
    // programming remains read-only from the schedule detail.
    expect(scheduleDetailPanelSource).not.toMatch(
      /begin_document_version_upload|activate_document_version_upload|cancel_document_version_upload/,
    );
    expect(documentRepositoryPageSource).toMatch(
      /<Input[\s\S]{0,300}name="documentFile"[\s\S]{0,300}type="file"/,
    );
    expect(documentRepositoryPageSource).toContain(
      "createDocumentWithInitialFileUpload",
    );
    expect(scheduleDetailPanelSource).not.toMatch(
      /<input[^>]+type=["']file["']|type=["']file["'][^>]*>|<Input[\s\S]{0,300}type="file"/i,
    );
    expect(visibleDocumentSurfaceSource).not.toMatch(
      /storage_path|storage_bucket|signedUrl|createSignedUrl|DOCUMENT_FILES_BUCKET|document-files/,
    );
    expect(visibleDocumentSurfaceSource).not.toMatch(
      /\brequires_signature\b|\bsensitive_hr\b|\bsignature_evidence\b|\bpayroll\b/i,
    );

    expect(repositoryMigrationSource).toMatch(
      /document\.sensitivity_level NOT IN[\s\S]+'sensitive_hr'[\s\S]+'payroll'[\s\S]+'signature_evidence'/,
    );
    expect(repositoryMigrationSource).toContain(
      "document.requires_signature = false",
    );
  });
});

test.describe("tenant resolution helper negative cases", () => {
  test("returns no_active_memberships when the authenticated user has no usable memberships", () => {
    expect(resolveActiveOrganization([])).toEqual({
      ok: false,
      reason: "no_active_memberships",
      memberships: [],
    });
  });

  test("requires an explicit organization when several memberships are active", () => {
    const memberships = [
      makeMembership("admin", "organization-a"),
      makeMembership("coach", "organization-b"),
    ];

    expect(resolveActiveOrganization(memberships)).toEqual({
      ok: false,
      reason: "organization_required",
      memberships,
    });
  });

  test("rejects an organizationId outside the active memberships", () => {
    const memberships = [makeMembership("manager", "organization-a")];

    expect(
      resolveActiveOrganization(memberships, "organization-b"),
    ).toEqual({
      ok: false,
      reason: "organization_not_found",
      memberships,
    });
  });

  test("resolves the matching active membership when organizationId belongs to the user", () => {
    const memberships = [
      makeMembership("owner", "organization-a"),
      makeMembership("coach", "organization-b"),
    ];

    expect(resolveActiveOrganization(memberships, "organization-b")).toEqual({
      ok: true,
      membership: memberships[1],
      organization: memberships[1].organization,
    });
  });
});

test.describe("organization resolution state local source guardrails", () => {
  test("keeps unresolved tenant states informational except explicit membership selection", () => {
    const source = readProjectFile(
      "src/components/features/organization-resolution-state.tsx",
    );
    const propsSource =
      source.match(/type OrganizationResolutionStateProps = \{[\s\S]+?\};/)?.[0] ??
      "";
    const selectionStart = source.indexOf(
      'resolution.reason === "organization_required" ? (',
    );
    const alertStart = source.indexOf(") : (", selectionStart);

    expect(propsSource).toContain("basePath: string;");
    expect(propsSource).toContain(
      "resolution: Extract<ActiveOrganizationResolution, { ok: false }>;",
    );
    expect(source).toContain("no_active_memberships");
    expect(source).toContain("organization_required");
    expect(source).toContain("organization_not_found");
    expect(selectionStart).toBeGreaterThanOrEqual(0);
    expect(alertStart).toBeGreaterThan(selectionStart);

    const selectionBranch = source.slice(selectionStart, alertStart);
    const blockedBranch = source.slice(alertStart);

    expect(selectionBranch).toContain("resolution.memberships.map");
    expect(selectionBranch).toContain("getAppPath(basePath, {");
    expect(selectionBranch).toContain(
      "organizationId: membership.organization_id",
    );
    expect(blockedBranch).toContain("<Alert>");
    expect(blockedBranch).not.toMatch(
      /<Link\b|href=|getAppPath|membership\.organization_id/,
    );
    expect(source).not.toMatch(
      /memberships\[0\]|selectedMembership|router\.push|redirect\(|window\.location|location\.href/,
    );
  });

  test("keeps tenant selection links on the caller basePath and away from sensitive routes", () => {
    const appRoot = path.join(process.cwd(), "src/app/(app)/app");
    const protectedPageFiles = collectSourceFiles(appRoot).filter(
      (filePath) => path.basename(filePath) === "page.tsx",
    );
    const pagesWithResolutionState = protectedPageFiles.filter((filePath) =>
      readFileSync(filePath, "utf8").includes("<OrganizationResolutionState"),
    );

    expect(pagesWithResolutionState.length).toBeGreaterThan(10);

    for (const filePath of pagesWithResolutionState) {
      const relativePath = path
        .relative(appRoot, filePath)
        .split(path.sep)
        .join("/");
      const routePath = relativePath
        .replace(/\/page\.tsx$/, "")
        .replace(/^page\.tsx$/, "");
      const expectedBasePath = routePath === "" ? "/app" : `/app/${routePath}`;
      const source = readFileSync(filePath, "utf8");
      const matches = [
        ...source.matchAll(
          /<OrganizationResolutionState[\s\S]*?basePath="([^"]+)"/g,
        ),
      ];

      expect(matches.length, `${relativePath} passes basePath`).toBeGreaterThan(
        0,
      );

      for (const match of matches) {
        const basePath = match[1];

        expect(basePath, `${relativePath} keeps its own route`).toBe(
          expectedBasePath,
        );
        expect(basePath).toMatch(/^\/app(?:\/[a-z0-9-]+)?$/);
        expect(basePath).not.toMatch(
          /\/versions\/|\/preview|\/download|\/storage|\/grants|\/signatures?/,
        );
        expect(basePath).not.toMatch(
          /payroll|document_access|signature_evidence|requires_signature|location|geofence|native|push/i,
        );
      }
    }
  });

  test("keeps the tenant resolution UI free of management and sensitive future surfaces", () => {
    const source = readProjectFile(
      "src/components/features/organization-resolution-state.tsx",
    );

    expect(source).not.toMatch(
      /getCoveragePath|getStatsPath|getSettingsPath|getDocumentsPath|getTimePath|getScheduleTemplatesPath/,
    );
    expect(source).not.toMatch(
      /<form\b|formAction|action=|onClick=|type=["']submit["']/,
    );
    expect(source).not.toMatch(
      /\b(?:document_access_grants|document_versions|document-files|storage_path|storage_bucket|manage_grants|signature_evidence|sensitive_hr|requires_signature|center_time_location_settings|time_location_events)\b/,
    );
    expect(source).not.toMatch(
      /createSignedUrl|signedUrl|navigator\.geolocation|serviceWorker|service worker|PushManager|Notification|background sync|caches\.|CacheStorage|OpenAI|openai|anthropic|embeddings|pgvector|ai_/i,
    );
  });
});

test.describe("auth transition routes local source guardrails", () => {
  test("keeps callback redirects sanitized through the shared internal-path helper", () => {
    const callbackSource = readProjectFile("src/app/auth/callback/route.ts");
    const callbackGetSource = getTsFunctionSource(callbackSource, "GET");

    expect(callbackGetSource).toMatch(
      /const redirectTo = getSafeRedirectPath\([\s\S]+requestUrl\.searchParams\.get\("redirectTo"\)[\s\S]+requestUrl\.searchParams\.get\("next"\)[\s\S]+\);/,
    );
    expect(callbackGetSource).toMatch(
      /const errorRedirectPath = redirectTo\.startsWith\("\/reset-password"\)[\s\S]+"\/reset-password\?error=callback"[\s\S]+"\/login\?error=callback"/,
    );
    expect(callbackGetSource).toMatch(
      /if \(code\) \{[\s\S]+exchangeCodeForSession\(code\)[\s\S]+if \(!error\) \{[\s\S]+NextResponse\.redirect\(new URL\(redirectTo, requestUrl\.origin\)\)/,
    );
    expect(callbackGetSource).toMatch(
      /return NextResponse\.redirect\(new URL\(errorRedirectPath, requestUrl\.origin\)\)/,
    );
    expect(callbackGetSource).not.toMatch(
      /NextResponse\.redirect\((?:redirectTo|requestUrl\.searchParams|new URL\(requestUrl\.searchParams)/,
    );
    expect(callbackGetSource).not.toMatch(
      /createSignedUrl|signedUrl|storage_path|storage_bucket|document-files|service_role|token|secret|RESEND_API_KEY|SMTP|navigator\.geolocation|serviceWorker|CacheStorage|OpenAI|openai|anthropic|embeddings|pgvector|ai_/i,
    );
  });

  test("keeps login redirectTo sanitized before rendering, error redirects and success redirects", () => {
    const loginPageSource = readProjectFile(
      "src/app/(auth)/login/page.tsx",
    );
    const loginActionsSource = readProjectFile(
      "src/app/(auth)/login/actions.ts",
    );
    const loginPageFunctionSource = getDefaultAsyncFunctionSource(
      loginPageSource,
      "LoginPage",
    );
    const signInSource = getTsFunctionSource(
      loginActionsSource,
      "signInWithPassword",
    );
    const errorRedirectSource = getFunctionSource(
      loginActionsSource,
      "getErrorRedirect",
    );

    expect(loginPageSource).toContain('export const dynamic = "force-dynamic";');
    expect(loginPageFunctionSource).toContain(
      "const redirectTo = getSafeRedirectPath(getParam(params.redirectTo));",
    );
    expect(loginPageFunctionSource).toContain("href={redirectTo}");
    expect(loginPageFunctionSource).toContain(
      '<input name="redirectTo" type="hidden" value={redirectTo} />',
    );
    expect(loginPageFunctionSource).not.toMatch(
      /href=\{(?:getParam\(params\.redirectTo\)|params\.redirectTo)\}|value=\{(?:getParam\(params\.redirectTo\)|params\.redirectTo)\}/,
    );

    expect(signInSource).toContain(
      'const redirectTo = getSafeRedirectPath(formData.get("redirectTo"));',
    );
    expect(signInSource).toMatch(
      /redirect\(getErrorRedirect\("missing-credentials", redirectTo\)\)/,
    );
    expect(signInSource).toMatch(
      /redirect\(getErrorRedirect\("invalid-credentials", redirectTo\)\)/,
    );
    expect(signInSource).toMatch(/redirect\(redirectTo\)/);
    expect(errorRedirectSource).toMatch(
      /new URLSearchParams\(\{[\s\S]+error,[\s\S]+redirectTo,[\s\S]+\}\)/,
    );
    expect(loginActionsSource).not.toMatch(
      /redirect\(formData\.get\("redirectTo"\)\)|redirect\(email\)|redirect\(password\)/,
    );
  });

  test("keeps forgot, reset and sign-out transitions internal and non-enumerating", () => {
    const forgotActionsSource = readProjectFile(
      "src/app/(auth)/forgot-password/actions.ts",
    );
    const forgotPageSource = readProjectFile(
      "src/app/(auth)/forgot-password/page.tsx",
    );
    const resetActionsSource = readProjectFile(
      "src/app/(auth)/reset-password/actions.ts",
    );
    const resetPageSource = readProjectFile(
      "src/app/(auth)/reset-password/page.tsx",
    );
    const siteUrlSource = readProjectFile("src/lib/auth/site-url.ts");
    const signOutSource = readProjectFile("src/app/auth/sign-out/route.ts");
    const forgotActionSource = getTsFunctionSource(
      forgotActionsSource,
      "requestPasswordReset",
    );
    const resetActionSource = getTsFunctionSource(
      resetActionsSource,
      "updatePassword",
    );
    const signOutPostSource = getTsFunctionSource(signOutSource, "POST");

    expect(forgotPageSource).toContain(
      'export const dynamic = "force-dynamic";',
    );
    expect(resetPageSource).toContain('export const dynamic = "force-dynamic";');
    expect(forgotActionsSource).toContain(
      'const GENERIC_RESET_SENT_PATH = "/forgot-password?status=sent";',
    );
    expect(forgotActionSource).toContain(
      'const redirectTo = await getAuthCallbackUrl("/reset-password");',
    );
    expect(forgotActionSource).toContain(
      "await supabase.auth.resetPasswordForEmail(email, { redirectTo });",
    );
    expect(forgotActionSource).toContain("} catch {");
    expect(forgotActionSource).toContain("redirect(GENERIC_RESET_SENT_PATH);");
    expect(siteUrlSource).toMatch(
      /callbackUrl\.searchParams\.set\("next", getSafeRedirectPath\(nextPath\)\)/,
    );

    expect(resetActionSource).toMatch(
      /const validation = validatePasswordPolicy\(password\)[\s\S]+redirect\(getResetPasswordPath\(validation\.error\)\)/,
    );
    expect(resetActionSource).toMatch(
      /if \(password !== confirmPassword\) \{[\s\S]+redirect\(getResetPasswordPath\("password-mismatch"\)\)/,
    );
    expect(resetActionSource).toMatch(
      /await supabase\.auth\.updateUser\(\{ password \}\)[\s\S]+await supabase\.auth\.signOut\(\)[\s\S]+redirect\("\/login\?status=password-updated"\)/,
    );
    expect(resetActionsSource).not.toMatch(
      /\bredirectTo\b|searchParams\.get\("next"\)|https?:\/\//,
    );

    expect(signOutPostSource).toMatch(
      /await supabase\.auth\.signOut\(\)[\s\S]+NextResponse\.redirect\(new URL\("\/login", request\.url\), \{[\s\S]+status: 303/,
    );
    expect(signOutPostSource).not.toMatch(
      /request\.nextUrl\.searchParams|redirectTo|next=|http:|https:/,
    );
  });

  test("keeps public auth transition surfaces dynamic and away from sensitive clients", () => {
    const authTransitionSources = [
      "src/app/auth/callback/route.ts",
      "src/app/auth/sign-out/route.ts",
      "src/app/(auth)/login/page.tsx",
      "src/app/(auth)/login/actions.ts",
      "src/app/(auth)/forgot-password/page.tsx",
      "src/app/(auth)/forgot-password/actions.ts",
      "src/app/(auth)/reset-password/page.tsx",
      "src/app/(auth)/reset-password/actions.ts",
      "src/app/(auth)/reset-password/reset-password-form.tsx",
      "src/lib/auth/site-url.ts",
      "src/lib/auth/redirects.ts",
    ].map((filePath) => readProjectFile(filePath));
    const combinedSource = authTransitionSources.join("\n");

    for (const pageSource of [
      readProjectFile("src/app/(auth)/login/page.tsx"),
      readProjectFile("src/app/(auth)/forgot-password/page.tsx"),
      readProjectFile("src/app/(auth)/reset-password/page.tsx"),
    ]) {
      expect(pageSource).toContain('export const dynamic = "force-dynamic";');
      expect(pageSource).not.toMatch(
        /export\s+const\s+revalidate\b|export\s+const\s+fetchCache\b|\bunstable_cache\s*\(|(?:^|\n)\s*["']use cache(?::\s*(?:private|remote))?["'];?/,
      );
    }

    expect(combinedSource).not.toMatch(
      /createSignedUrl|signedUrl|storage_path|storage_bucket|document-files|document_access_grants|manage_grants|signature_evidence|sensitive_hr|requires_signature|center_time_location_settings|time_location_events/i,
    );
    expect(combinedSource).not.toMatch(
      /\bservice_role\b|\btoken\b|secret|RESEND_API_KEY|SMTP|SUPABASE_SERVICE_ROLE|SUPABASE_DB|DATABASE_URL/i,
    );
    expect(combinedSource).not.toMatch(
      /navigator\.geolocation|serviceWorker|service worker|PushManager|Notification|background sync|caches\.|CacheStorage|OpenAI|openai|anthropic|embeddings|pgvector|ai_/i,
    );
  });
});

test.describe("invite accept auth local source guardrails", () => {
  test("keeps invite accept page public, dynamic and limited to invitation preview plus sanitized login return", () => {
    const pageSource = readProjectFile(
      "src/app/(auth)/invite/accept/page.tsx",
    );
    const acceptPageSource = getDefaultAsyncFunctionSource(
      pageSource,
      "AcceptInvitationPage",
    );

    expect(pageSource).toContain('export const dynamic = "force-dynamic";');
    expect(acceptPageSource).toContain(
      "const invitationId = getParam(params.invitationId);",
    );
    expect(acceptPageSource).toContain("const token = getParam(params.token);");
    expect(acceptPageSource).toMatch(
      /if \(!invitationId \|\| !token \|\| !isPostgresUuid\(invitationId\)\)/,
    );
    expect(acceptPageSource).toMatch(
      /\.rpc\(\s*"get_team_invitation_public"[\s\S]+raw_invitation_token: token[\s\S]+target_invitation_id: invitationId/,
    );
    expect(acceptPageSource).toContain(
      "const invitePath = getInvitationAcceptPath(invitationId, token);",
    );
    expect(acceptPageSource).toContain(
      "const user = await getAuthenticatedUser();",
    );
    expect(acceptPageSource).toContain(
      "const canAcceptWithCurrentSession = Boolean(user && userEmail === invitationEmail);",
    );
    expect(acceptPageSource).toContain(
      '<input name="invitationId" type="hidden" value={invitationId} />',
    );
    expect(acceptPageSource).toContain(
      '<input name="token" type="hidden" value={token} />',
    );
    expect(acceptPageSource).toContain("href={getLoginPath(invitePath)}");
    expect(acceptPageSource).not.toMatch(
      /getAppPath|href=\{invitePath\}|href=\{token\}|href=\{invitationId\}|generateMetadata|metadata|console\./,
    );
    expect(pageSource).not.toMatch(
      /createSignedUrl|signedUrl|storage_path|storage_bucket|document-files|document_access_grants|manage_grants|signature_evidence|sensitive_hr|requires_signature|center_time_location_settings|time_location_events/i,
    );
    expect(pageSource).not.toMatch(
      /\bservice_role\b|secret|RESEND_API_KEY|SMTP|SUPABASE_SERVICE_ROLE|SUPABASE_DB|DATABASE_URL/i,
    );
    expect(pageSource).not.toMatch(
      /navigator\.geolocation|serviceWorker|service worker|PushManager|Notification|background sync|caches\.|CacheStorage|OpenAI|openai|anthropic|embeddings|pgvector|ai_/i,
    );
  });

  test("keeps invite accept actions and RPCs validating token, session, email and tenant links server-side", () => {
    const actionsSource = readProjectFile(
      "src/app/(auth)/invite/accept/actions.ts",
    );
    const invitationHelperSource = readProjectFile("src/lib/team-invitations.ts");
    const publicInvitationMigrationSource = readProjectFile(
      "supabase/migrations/00022_team_invitation_digest_search_path.sql",
    );
    const acceptInvitationMigrationSource = readProjectFile(
      "supabase/migrations/00024_team_invitation_accept_update_qualification.sql",
    );
    const validateInvitationInputSource = getFunctionSource(
      actionsSource,
      "validateInvitationInput",
    );
    const acceptInvitationSource = getTsFunctionSource(
      actionsSource,
      "acceptInvitation",
    );
    const acceptTeamInvitationSource = getTsFunctionSource(
      actionsSource,
      "acceptTeamInvitation",
    );
    const signUpAndAcceptSource = getTsFunctionSource(
      actionsSource,
      "signUpAndAcceptTeamInvitation",
    );
    const getPublicInvitationSqlSource = getSqlFunctionSource(
      publicInvitationMigrationSource,
      "get_team_invitation_public",
    );
    const acceptInvitationSqlSource = getSqlFunctionSource(
      acceptInvitationMigrationSource,
      "accept_team_invitation",
    );
    const getPublicInvitationReturnColumns =
      getPublicInvitationSqlSource.match(
        /RETURNS TABLE \([\s\S]+?\)\r?\nLANGUAGE/,
      )?.[0] ?? "";
    const changedFieldsSource =
      acceptInvitationSource.match(/changedFields: \{[\s\S]+?\},\s+entityId/)?.[0] ??
      "";

    expect(validateInvitationInputSource).toMatch(
      /!isPostgresUuid\(invitationId\) \|\| token\.length < 32/,
    );
    expect(invitationHelperSource).toMatch(
      /export function getInvitationAcceptPath\(invitationId: string, token: string\)[\s\S]+new URLSearchParams\(\{[\s\S]+invitationId,[\s\S]+token,[\s\S]+\}\)[\s\S]+return `\/invite\/accept\?\$\{params\.toString\(\)\}`/,
    );

    expect(acceptInvitationSource).toMatch(
      /\.rpc\(\s*"accept_team_invitation"[\s\S]+raw_invitation_token: token[\s\S]+target_invitation_id: invitationId/,
    );
    expect(changedFieldsSource).toMatch(
      /accepted_by_user_id[\s\S]+coach_profile_id[\s\S]+membership[\s\S]+person_profile_id[\s\S]+status/,
    );
    expect(changedFieldsSource).not.toMatch(/token|token_hash|raw_invitation/i);
    expect(acceptInvitationSource).toMatch(
      /recordOperationalAuditEvent\({[\s\S]+entityId: invitationId[\s\S]+entityType: "team_invitations"[\s\S]+organizationId/,
    );

    expect(acceptTeamInvitationSource).toMatch(
      /const redirectTo = getInvitationAcceptPath\(input\.invitationId, input\.token\)/,
    );
    expect(acceptTeamInvitationSource).toMatch(
      /const user = await getAuthenticatedUser\(\)[\s\S]+if \(!user\) \{[\s\S]+redirect\(getLoginPath\(redirectTo\)\)/,
    );
    expect(acceptTeamInvitationSource).toMatch(
      /redirect\(\s*getAppPath\("\/app", \{[\s\S]+organizationId: result\.organizationId[\s\S]+status: "invitation-accepted"/,
    );

    expect(signUpAndAcceptSource).toMatch(
      /\.rpc\(\s*"get_team_invitation_public"[\s\S]+raw_invitation_token: input\.token[\s\S]+target_invitation_id: input\.invitationId/,
    );
    expect(signUpAndAcceptSource).toMatch(
      /const email = normalizeInvitationEmail\(invitation\.email\)/,
    );
    expect(signUpAndAcceptSource).toMatch(
      /const emailRedirectTo = await getAuthCallbackUrl\([\s\S]+getSafeRedirectPath\(getInvitationAcceptPath\(input\.invitationId, input\.token\)\)/,
    );
    expect(signUpAndAcceptSource).toMatch(
      /supabase\.auth\.signUp\(\{[\s\S]+email,[\s\S]+options: \{[\s\S]+emailRedirectTo/,
    );

    expect(getPublicInvitationSqlSource).toMatch(
      /raw_invitation_token IS NULL OR length\(raw_invitation_token\) < 32[\s\S]+RETURN/,
    );
    expect(getPublicInvitationSqlSource).toMatch(
      /expected_hash := encode\(extensions\.digest\(raw_invitation_token, 'sha256'\), 'hex'\)/,
    );
    expect(getPublicInvitationSqlSource).toMatch(
      /RETURNS TABLE \([\s\S]+organization_id uuid[\s\S]+organization_name text[\s\S]+email text[\s\S]+display_name text[\s\S]+status text[\s\S]+expires_at timestamptz/,
    );
    expect(getPublicInvitationReturnColumns).not.toMatch(
      /token_hash|provider_message_id|last_error/,
    );

    expect(acceptInvitationSqlSource).toMatch(
      /current_user_id uuid := \(select auth\.uid\(\)\)[\s\S]+IF current_user_id IS NULL THEN[\s\S]+authentication required/,
    );
    expect(acceptInvitationSqlSource).toMatch(
      /SELECT lower\(btrim\(auth_user\.email\)\)[\s\S]+WHERE auth_user\.id = current_user_id/,
    );
    expect(acceptInvitationSqlSource).toMatch(
      /expected_hash := encode\(extensions\.digest\(raw_invitation_token, 'sha256'\), 'hex'\)[\s\S]+invitation\.token_hash = expected_hash/,
    );
    expect(acceptInvitationSqlSource).toMatch(
      /target_invitation\.email_normalized <> current_email[\s\S]+invitation email does not match authenticated user/,
    );
    expect(acceptInvitationSqlSource).toMatch(
      /public\.person_profiles person_profile[\s\S]+person_profile\.organization_id = target_invitation\.organization_id[\s\S]+person_profile\.user_id = current_user_id[\s\S]+person_profile\.id <> target_invitation\.person_profile_id/,
    );
    expect(acceptInvitationSqlSource).toMatch(
      /public\.coach_profiles coach_profile[\s\S]+coach_profile\.organization_id = target_invitation\.organization_id[\s\S]+coach_profile\.user_id = current_user_id[\s\S]+coach_profile\.id <> target_invitation\.coach_profile_id/,
    );
    expect(acceptInvitationSqlSource).toMatch(
      /FROM public\.organization_memberships membership[\s\S]+membership\.organization_id = target_invitation\.organization_id[\s\S]+membership\.user_id = current_user_id[\s\S]+FOR UPDATE/,
    );
    expect(acceptInvitationSqlSource).toMatch(
      /UPDATE public\.person_profiles AS person_profile[\s\S]+person_profile\.id = target_invitation\.person_profile_id[\s\S]+person_profile\.organization_id = target_invitation\.organization_id[\s\S]+person_profile\.user_id IS NULL OR person_profile\.user_id = current_user_id/,
    );
    expect(acceptInvitationSqlSource).toMatch(
      /UPDATE public\.coach_profiles AS coach_profile[\s\S]+coach_profile\.id = target_invitation\.coach_profile_id[\s\S]+coach_profile\.organization_id = target_invitation\.organization_id[\s\S]+coach_profile\.user_id IS NULL OR coach_profile\.user_id = current_user_id/,
    );
    expect(acceptInvitationSqlSource).toMatch(
      /UPDATE public\.team_invitations AS invitation[\s\S]+status = 'accepted'[\s\S]+accepted_by_user_id = current_user_id/,
    );
    expect(
      [
        actionsSource,
        invitationHelperSource,
        publicInvitationMigrationSource,
        acceptInvitationMigrationSource,
      ].join("\n"),
    ).not.toMatch(
      /console\.|createSignedUrl|signedUrl|storage_path|storage_bucket|document-files|document_access_grants|manage_grants|signature_evidence|sensitive_hr|requires_signature|center_time_location_settings|time_location_events|\bservice_role\b|RESEND_API_KEY|SMTP|SUPABASE_SERVICE_ROLE|SUPABASE_DB|DATABASE_URL|navigator\.geolocation|serviceWorker|service worker|PushManager|Notification|background sync|caches\.|CacheStorage|OpenAI|openai|anthropic|embeddings|pgvector|ai_/i,
    );
  });
});

test.describe("team invitation issuance local source guardrails", () => {
  test("keeps creation, resend and cancellation tenant-scoped with hashed token lifecycle", () => {
    const actionsSource = readProjectFile(
      "src/app/(app)/app/coaches/actions.ts",
    );
    const pageSource = readProjectFile("src/app/(app)/app/coaches/page.tsx");
    const createSource = getTsFunctionSource(actionsSource, "createTeamInvitation");
    const resendSource = getTsFunctionSource(actionsSource, "resendTeamInvitation");
    const cancelSource = getTsFunctionSource(actionsSource, "cancelTeamInvitation");
    const sendAndMarkSource = getTsFunctionSource(
      actionsSource,
      "sendInvitationEmailAndMarkSent",
    );
    const createInvitationInsert =
      createSource.match(
        /const \{ data: invitation[\s\S]+?\.from\("team_invitations"\)[\s\S]+?\.insert\(\{[\s\S]+?\.select\("id"\)/,
      )?.[0] ?? "";
    const resendTokenUpdate =
      resendSource.match(
        /const \{ error: tokenUpdateError \}[\s\S]+?\.from\("team_invitations"\)[\s\S]+?\.update\(\{[\s\S]+?\.select\("id"\)/,
      )?.[0] ?? "";
    const teamInvitationAuditBlocks = actionsSource
      .split("await recordOperationalAuditEvent({")
      .slice(1)
      .map((source) => `await recordOperationalAuditEvent({${source.split("});")[0]}});`)
      .filter((source) => source.includes('entityType: "team_invitations"'));

    expect(createSource).toMatch(/getCoachActionContext\(formData,\s*"team-access"\)/);
    expect(resendSource).toMatch(/getCoachActionContext\(formData,\s*"team-access"\)/);
    expect(cancelSource).toMatch(/getCoachActionContext\(formData,\s*"team-access"\)/);

    expect(createSource).toMatch(
      /\.from\("team_invitations"\)[\s\S]+\.eq\("organization_id", context\.organization\.id\)[\s\S]+\.eq\("email_normalized", validation\.values\.email\)[\s\S]+\.in\("status", \["pending", "sent"\]\)/,
    );
    expect(createSource).toMatch(
      /\.from\("coach_profiles"\)[\s\S]+\.eq\("id", validation\.values\.coachProfileId\)[\s\S]+\.eq\("organization_id", context\.organization\.id\)[\s\S]+coachProfile\.status !== "active"[\s\S]+coachProfile\.user_id \|\| !coachProfile\.person_profile_id/,
    );
    expect(createSource).toMatch(
      /\.from\("person_profiles"\)[\s\S]+\.eq\("id", coachProfile\.person_profile_id\)[\s\S]+\.eq\("organization_id", context\.organization\.id\)[\s\S]+personProfile\.user_id[\s\S]+personProfile\.status !== "active"[\s\S]+personProfile\.visibility_status !== "visible"/,
    );
    expect(createSource).toMatch(
      /\.from\("person_profiles"\)[\s\S]+\.insert\(\{[\s\S]+organization_id: context\.organization\.id[\s\S]+status: "active"[\s\S]+visibility_status: "visible"/,
    );
    expect(createSource).toMatch(
      /\.from\("coach_profiles"\)[\s\S]+\.insert\(\{[\s\S]+organization_id: context\.organization\.id[\s\S]+person_profile_id: personProfile\.id[\s\S]+status: "active"/,
    );

    expect(createSource.indexOf("const token = generateInvitationToken();")).toBeGreaterThan(
      -1,
    );
    expect(createInvitationInsert).toContain(
      "token_hash: hashInvitationToken(token)",
    );
    expect(createInvitationInsert).toContain(
      "organization_id: context.organization.id",
    );
    expect(createInvitationInsert).not.toMatch(/\btoken\s*:/);
    expect(createSource).toMatch(
      /sendInvitationEmailAndMarkSent\(\{[\s\S]+invitationId: invitation\.id[\s\S]+organizationId: context\.organization\.id[\s\S]+token/,
    );

    expect(resendSource).toMatch(
      /if \(!isPostgresUuid\(invitationId\)\)[\s\S]+invalid-invitation-id/,
    );
    expect(resendSource).toMatch(
      /\.from\("team_invitations"\)[\s\S]+\.eq\("id", invitationId\)[\s\S]+\.eq\("organization_id", context\.organization\.id\)/,
    );
    expect(resendSource).toMatch(
      /invitation\.status === "accepted" \|\| invitation\.status === "cancelled"/,
    );
    expect(resendSource).toMatch(
      /invitation\.last_sent_at[\s\S]+Date\.now\(\) - new Date\(invitation\.last_sent_at\)\.getTime\(\) < 60_000/,
    );
    expect(resendSource).toMatch(
      /\.from\("person_profiles"\)[\s\S]+\.eq\("id", invitation\.person_profile_id\)[\s\S]+\.eq\("organization_id", context\.organization\.id\)/,
    );
    expect(resendSource.indexOf("const token = generateInvitationToken();")).toBeLessThan(
      resendSource.indexOf("token_hash: hashInvitationToken(token)"),
    );
    expect(resendTokenUpdate).toContain("token_hash: hashInvitationToken(token)");
    expect(resendTokenUpdate).toContain(
      '.eq("organization_id", context.organization.id)',
    );
    expect(resendTokenUpdate).not.toMatch(/\btoken\s*:/);

    expect(cancelSource).toMatch(
      /if \(!isPostgresUuid\(invitationId\)\)[\s\S]+invalid-invitation-id/,
    );
    expect(cancelSource).toMatch(
      /\.from\("team_invitations"\)[\s\S]+\.update\(\{ status: "cancelled" \}\)[\s\S]+\.eq\("id", invitationId\)[\s\S]+\.eq\("organization_id", context\.organization\.id\)[\s\S]+\.neq\("status", "accepted"\)/,
    );

    expect(sendAndMarkSource).toMatch(
      /const acceptUrl = await getInvitationAcceptUrl\(invitationId, token\)/,
    );
    expect(sendAndMarkSource).toMatch(
      /buildTeamInvitationEmail\(\{[\s\S]+acceptUrl[\s\S]+organizationName[\s\S]+recipientName/,
    );
    expect(sendAndMarkSource).toMatch(
      /\.from\("team_invitations"\)[\s\S]+\.update\(\{[\s\S]+last_error: getSafeInvitationEmailErrorMessage\(sendResult\.code\)[\s\S]+status: "failed"[\s\S]+\.eq\("id", invitationId\)[\s\S]+\.eq\("organization_id", organizationId\)/,
    );
    expect(sendAndMarkSource).toMatch(
      /\.from\("team_invitations"\)[\s\S]+\.update\(\{[\s\S]+provider_message_id: sendResult\.id[\s\S]+status: "sent"[\s\S]+\.eq\("id", invitationId\)[\s\S]+\.eq\("organization_id", organizationId\)/,
    );

    // Three normal invitation actions plus stale-invitation cleanup when an
    // unlinked inactive coach profile is deleted.
    expect(teamInvitationAuditBlocks).toHaveLength(4);
    expect(
      teamInvitationAuditBlocks.some((auditBlock) =>
        auditBlock.includes("coach_profile_id: auditFieldSet(null)"),
      ),
    ).toBe(true);
    for (const auditBlock of teamInvitationAuditBlocks) {
      expect(auditBlock).not.toMatch(
        /token|token_hash|raw_invitation|acceptUrl|accept_url|provider_message|last_error|sendResult|message/i,
      );
    }

    const visibleCoachesSource = [actionsSource, pageSource].join("\n");
    expect(visibleCoachesSource).not.toMatch(
      /process\.env|https:\/\/api\.resend\.com|Authorization:|SUPABASE_SERVICE_ROLE|SUPABASE_DB|DATABASE_URL/,
    );
  });

  test("keeps invitation email HTML escaped and the provider helper server-side and minimized", () => {
    const invitationHelperSource = readProjectFile("src/lib/team-invitations.ts");
    const emailProviderSource = readProjectFile("src/lib/email/resend.ts");
    const escapeHtmlSource = getFunctionSource(invitationHelperSource, "escapeHtml");
    const emailBuilderSource = getFunctionSource(
      invitationHelperSource,
      "buildTeamInvitationEmail",
    );
    const htmlTemplate =
      emailBuilderSource.match(/const html = `[\s\S]+?`;/)?.[0] ?? "";
    const emailConfigSource = getFunctionSource(emailProviderSource, "getEmailConfig");
    const sendEmailSource = getTsFunctionSource(
      emailProviderSource,
      "sendTransactionalEmail",
    );

    expect(escapeHtmlSource).toMatch(
      /replaceAll\("&", "&amp;"\)[\s\S]+replaceAll\("<", "&lt;"\)[\s\S]+replaceAll\(">", "&gt;"\)[\s\S]+replaceAll\('"', "&quot;"\)[\s\S]+replaceAll\("'", "&#39;"\)/,
    );
    expect(emailBuilderSource).toContain(
      "const safeOrganizationName = escapeHtml(organizationName);",
    );
    expect(emailBuilderSource).toContain(
      "const safeRecipientName = escapeHtml(recipientName);",
    );
    expect(emailBuilderSource).toContain(
      "const safeInvitedByName = escapeHtml(invitedByName);",
    );
    expect(emailBuilderSource).toContain("const safeAcceptUrl = escapeHtml(acceptUrl);");
    expect(htmlTemplate).toContain("${safeRecipientName}");
    expect(htmlTemplate).toContain("${safeInvitedByName}");
    expect(htmlTemplate).toContain("${safeOrganizationName}");
    expect(htmlTemplate).toContain('href="${safeAcceptUrl}"');
    expect(htmlTemplate).not.toMatch(
      /\$\{(?:organizationName|recipientName|invitedByName|acceptUrl)\}/,
    );

    expect(emailConfigSource).toMatch(
      /process\.env\.RESEND_API_KEY\?\.trim\(\)[\s\S]+process\.env\.BOXOPS_EMAIL_FROM\?\.trim\(\)[\s\S]+process\.env\.BOXOPS_EMAIL_REPLY_TO\?\.trim\(\)/,
    );
    expect(sendEmailSource).toMatch(/const config = getEmailConfig\(\)/);
    expect(sendEmailSource).toMatch(
      /fetch\("https:\/\/api\.resend\.com\/emails"/,
    );
    expect(sendEmailSource).toMatch(
      /Authorization: `Bearer \$\{config\.apiKey\}`/,
    );
    expect(sendEmailSource).toMatch(
      /catch \{[\s\S]+message: "Email provider request failed\."/,
    );

    expect([invitationHelperSource, emailProviderSource].join("\n")).not.toMatch(
      /console\.|auth\.admin|service_role|createSignedUrl|signedUrl|storage_path|storage_bucket|document-files|document_access_grants|manage_grants|signature_evidence|sensitive_hr|requires_signature|center_time_location_settings|time_location_events|navigator\.geolocation|serviceWorker|service worker|PushManager|Notification|background sync|caches\.|CacheStorage|OpenAI|openai|anthropic|embeddings|pgvector|ai_/i,
    );
  });
});

test.describe("transactional email hardening local source guardrails", () => {
  test("keeps provider details server-only and stores only generic invitation delivery errors", () => {
    const actionsSource = readProjectFile(
      "src/app/(app)/app/coaches/actions.ts",
    );
    const pageSource = readProjectFile("src/app/(app)/app/coaches/page.tsx");
    const emailProviderSource = readProjectFile("src/lib/email/resend.ts");
    const resendResponseType =
      emailProviderSource.match(/type ResendEmailResponse = \{[\s\S]+?\};/)?.[0] ??
      "";
    const sendEmailSource = getTsFunctionSource(
      emailProviderSource,
      "sendTransactionalEmail",
    );
    const sendAndMarkSource = getTsFunctionSource(
      actionsSource,
      "sendInvitationEmailAndMarkSent",
    );
    const safeInvitationEmailErrorSource = getFunctionSource(
      actionsSource,
      "getSafeInvitationEmailErrorMessage",
    );
    const invitationScopedActionsSource = actionsSource
      .replace(getFunctionSource(actionsSource, "getDirectAccountAuthCreateError"), "")
      .replace(getTsFunctionSource(actionsSource, "rollbackDirectAccountCreation"), "")
      .replace(getTsFunctionSource(actionsSource, "createDirectTeamAccount"), "");
    const visibleErrorMessages =
      pageSource.match(/const errorMessages: Record<string, string> = \{[\s\S]+?\};/)?.[0] ??
      "";
    const teamInvitationAuditBlocks = actionsSource
      .split("await recordOperationalAuditEvent({")
      .slice(1)
      .map((source) => `await recordOperationalAuditEvent({${source.split("});")[0]}});`)
      .filter((source) => source.includes('entityType: "team_invitations"'));
    const sourceFiles = collectSourceFiles(path.join(process.cwd(), "src"));
    const providerEnvOrCallFiles = sourceFiles
      .filter((filePath) => {
        const source = readFileSync(filePath, "utf8");

        return /RESEND_API_KEY|BOXOPS_EMAIL_FROM|BOXOPS_EMAIL_REPLY_TO|https:\/\/api\.resend\.com\/emails/.test(
          source,
        );
      })
      .map((filePath) => path.relative(process.cwd(), filePath).replace(/\\/g, "/"));

    expect(providerEnvOrCallFiles).toEqual(["src/lib/email/resend.ts"]);
    expect(emailProviderSource).not.toMatch(
      /from\s+["']resend["']|@resend|new\s+Resend\b/,
    );
    expect(sendEmailSource.indexOf("if (!response.ok)")).toBeLessThan(
      sendEmailSource.indexOf("const payload ="),
    );
    expect(resendResponseType).toContain("id?: string;");
    expect(resendResponseType).not.toMatch(/\bmessage\?:|\bname\?:/);
    expect(emailProviderSource).not.toMatch(/payload\.(?:message|name)/);
    expect(sendEmailSource).toMatch(
      /if \(!response\.ok\) \{[\s\S]+message: "Email provider rejected the request\."[\s\S]+ok: false/,
    );
    expect(sendEmailSource).toMatch(
      /catch \{[\s\S]+message: "Email provider request failed\."[\s\S]+ok: false/,
    );

    expect(safeInvitationEmailErrorSource).toMatch(
      /errorCode === "email-not-configured"[\s\S]+El envio de email no esta configurado para este entorno/,
    );
    expect(safeInvitationEmailErrorSource).toContain(
      "No se pudo entregar el email.",
    );
    expect(sendAndMarkSource).toMatch(
      /last_error: getSafeInvitationEmailErrorMessage\(sendResult\.code\)/,
    );
    expect(sendAndMarkSource).not.toMatch(
      /sendResult\.message|payload|providerPayload|provider_payload|JSON\.stringify\(sendResult\)/,
    );
    // The fourth audit block is invitation cleanup during safe unlinked ficha
    // deletion; it still stores only minimized lifecycle fields.
    expect(teamInvitationAuditBlocks).toHaveLength(4);
    for (const auditBlock of teamInvitationAuditBlocks) {
      expect(auditBlock).not.toMatch(
        /last_error|provider_message|sendResult|payload|token|acceptUrl/i,
      );
    }

    expect(visibleErrorMessages).not.toMatch(
      /RESEND_API_KEY|BOXOPS_EMAIL|SMTP|DATABASE_URL|SUPABASE_DB|service_role|provider response|provider payload|payload|token|API/i,
    );
    expect(
      [emailProviderSource, invitationScopedActionsSource, pageSource].join("\n"),
    ).not.toMatch(
      /console\.(?:log|error|warn|info|debug)|auth\.admin|SUPABASE_SERVICE_ROLE|SUPABASE_DB|DATABASE_URL|storage_path|storage_bucket|document-files|document_access_grants|manage_grants|signature_evidence|sensitive_hr|requires_signature|center_time_location_settings|time_location_events|navigator\.geolocation|serviceWorker|service worker|PushManager|Notification|background sync|caches\.|CacheStorage|OpenAI|openai|anthropic|embeddings|pgvector|ai_/i,
    );
  });
});

test.describe("privileged Supabase and Storage client local source guardrails", () => {
  test("keeps Supabase Auth Admin scoped to the direct account server flow", () => {
    const sourceFiles = collectSourceFiles(path.join(process.cwd(), "src"));
    const relativeSourceFiles = sourceFiles.map((filePath) =>
      path.relative(process.cwd(), filePath).replace(/\\/g, "/"),
    );
    const privilegedAuthAdminFiles = new Set([
      "src/app/(app)/app/coaches/actions.ts",
      "src/app/(auth)/reset-password/actions.ts",
      "src/lib/supabase/admin.ts",
      "src/lib/supabase/env.ts",
    ]);
    const supabaseEnvSource = readProjectFile("src/lib/supabase/env.ts");
    const supabaseAdminSource = readProjectFile("src/lib/supabase/admin.ts");
    const supabaseProxySource = readProjectFile("src/lib/supabase/proxy.ts");
    const supabaseClientSources = [
      "src/lib/supabase/env.ts",
      "src/lib/supabase/server.ts",
      "src/lib/supabase/client.ts",
    ]
      .map((filePath) => readProjectFile(filePath))
      .concat(supabaseProxySource);
    const combinedSource = sourceFiles
      .filter(
        (filePath) =>
          !privilegedAuthAdminFiles.has(
            path.relative(process.cwd(), filePath).replace(/\\/g, "/"),
          ),
      )
      .map((filePath) => readFileSync(filePath, "utf8"))
      .join("\n");
    const processEnvFiles = sourceFiles
      .filter((filePath) => readFileSync(filePath, "utf8").includes("process.env"))
      .map((filePath) => path.relative(process.cwd(), filePath).replace(/\\/g, "/"))
      .sort();
    const supabaseFactoryFiles = sourceFiles
      .filter((filePath) =>
        /createServerClient|createBrowserClient/.test(
          readFileSync(filePath, "utf8"),
        ),
      )
      .map((filePath) => path.relative(process.cwd(), filePath).replace(/\\/g, "/"))
      .sort();
    const nonTypeSupabaseJsImports = sourceFiles
      .filter((filePath) =>
        readFileSync(filePath, "utf8")
          .split(/\r?\n/)
          .some(
            (line) =>
              line.includes('@supabase/supabase-js"') &&
              /^import\s+(?!type\b)/.test(line),
          ),
      )
      .map((filePath) => path.relative(process.cwd(), filePath).replace(/\\/g, "/"));
    const moduleScopeClientFiles = sourceFiles
      .filter((filePath) =>
        readFileSync(filePath, "utf8")
          .split(/\r?\n/)
          .some((line) =>
            /^(?:export\s+)?const\s+\w+\s*=\s*(?:await\s+)?(?:createClient|createServerClient|createBrowserClient)\(/.test(
              line,
            ),
          ),
      )
      .map((filePath) => path.relative(process.cwd(), filePath).replace(/\\/g, "/"));

    expect(relativeSourceFiles).toContain("src/lib/supabase/server.ts");
    expect(relativeSourceFiles).toContain("src/lib/supabase/client.ts");
    expect(relativeSourceFiles).toContain("src/lib/supabase/admin.ts");
    expect(supabaseEnvSource).toContain("process.env.NEXT_PUBLIC_SUPABASE_URL");
    expect(supabaseEnvSource).toContain(
      "process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
    expect(supabaseAdminSource).toContain("process.env.SUPABASE_SERVICE_ROLE_KEY");
    expect(supabaseEnvSource).not.toMatch(
      /SERVICE_ROLE|service_role|DATABASE_URL|SUPABASE_DB|POSTGRES_URL|DIRECT_URL|PGHOST|PGPASSWORD|SMTP/i,
    );
    expect(processEnvFiles).toEqual([
      "src/lib/auth/site-url.ts",
      "src/lib/email/resend.ts",
      "src/lib/supabase/admin.ts",
      "src/lib/supabase/env.ts",
      "src/lib/supabase/proxy.ts",
    ]);
    expect(supabaseProxySource).toContain(
      'secure: process.env.NODE_ENV === "production"',
    );
    expect(supabaseFactoryFiles).toEqual([
      "src/lib/supabase/client.ts",
      "src/lib/supabase/proxy.ts",
      "src/lib/supabase/server.ts",
    ]);
    expect(nonTypeSupabaseJsImports).toEqual(["src/lib/supabase/admin.ts"]);
    expect(moduleScopeClientFiles).toEqual([]);
    expect(supabaseAdminSource).toMatch(/createSupabaseClient<Database>/);
    expect(supabaseAdminSource).toMatch(/autoRefreshToken: false/);
    expect(supabaseAdminSource).toMatch(/persistSession: false/);
    expect(supabaseClientSources.join("\n")).toMatch(
      /getSupabasePublicEnv\(\)[\s\S]+createServerClient<Database>|getSupabasePublicEnv\(\)[\s\S]+createBrowserClient<Database>/,
    );

    expect(combinedSource).not.toMatch(
      /\bauth\.admin\b|\bservice_role\b|SUPABASE_SERVICE_ROLE|SUPABASE_DB|DATABASE_URL|POSTGRES_URL|POSTGRES_PRISMA_URL|POSTGRES_URL_NON_POOLING|DIRECT_URL|PGPASSWORD|PGHOST|smtp:\/\/|smtps:\/\/|\bnodemailer\b|createTransport\(|SMTP_(?:HOST|USER|PASS|PASSWORD)|EMAIL_SERVER/i,
    );
  });

  test("keeps direct Auth account passwords temporary and first-login metadata enforced", () => {
    const sourceFiles = collectSourceFiles(path.join(process.cwd(), "src"));
    const combinedSource = sourceFiles
      .map((filePath) => readFileSync(filePath, "utf8"))
      .join("\n");
    const requiredPasswordChangeSource = readProjectFile(
      "src/lib/auth/required-password-change.ts",
    );
    const coachesActionsSource = readProjectFile(
      "src/app/(app)/app/coaches/actions.ts",
    );
    const resetPasswordActionsSource = readProjectFile(
      "src/app/(auth)/reset-password/actions.ts",
    );
    const loginActionsSource = readProjectFile(
      "src/app/(auth)/login/actions.ts",
    );
    const proxySource = readProjectFile("src/lib/supabase/proxy.ts");
    const appLayoutSource = readProjectFile("src/app/(app)/app/layout.tsx");
    const directAccountSource = getTsFunctionSource(
      coachesActionsSource,
      "createDirectTeamAccount",
    );
    const updatePasswordSource = getTsFunctionSource(
      resetPasswordActionsSource,
      "updatePassword",
    );
    const auditBlocks = directAccountSource
      .split("await recordOperationalAuditEvent({")
      .slice(1)
      .map((source) => `await recordOperationalAuditEvent({${source.split("});")[0]}});`);

    expect(requiredPasswordChangeSource).toContain(
      'const REQUIRED_PASSWORD_CHANGE_KEY = "boxops_password_change_required";',
    );
    expect(requiredPasswordChangeSource).toContain(
      'const REQUIRED_PASSWORD_CHANGE_REASON_KEY = "boxops_password_change_reason";',
    );
    expect(requiredPasswordChangeSource).toContain(
      'const REQUIRED_PASSWORD_CHANGE_SET_AT_KEY = "boxops_password_change_set_at";',
    );
    expect(requiredPasswordChangeSource).toContain(
      'return `/reset-password?${params.toString()}`;',
    );
    expect(requiredPasswordChangeSource).toContain(
      "nextMetadata[REQUIRED_PASSWORD_CHANGE_KEY] = null;",
    );
    expect(requiredPasswordChangeSource).toContain(
      "nextMetadata[REQUIRED_PASSWORD_CHANGE_REASON_KEY] = null;",
    );
    expect(requiredPasswordChangeSource).toContain(
      "nextMetadata[REQUIRED_PASSWORD_CHANGE_SET_AT_KEY] = null;",
    );
    expect(directAccountSource).toMatch(
      /try \{[\s\S]+authAdmin = createAdminClient\(\);[\s\S]+catch \{[\s\S]+auth-admin-not-configured/,
    );
    expect(directAccountSource).toMatch(
      /authAdmin\.auth\.admin\.createUser\(\{[\s\S]+app_metadata: buildRequiredPasswordChangeAppMetadata\(\),[\s\S]+email_confirm: true,[\s\S]+password: validation\.values\.password/,
    );
    expect(directAccountSource).toMatch(
      /\.from\("organization_memberships"\)[\s\S]+user_id: createdUserId/,
    );
    expect(directAccountSource).toMatch(
      /\.from\("person_profiles"\)[\s\S]+organization_id: context\.organization\.id,[\s\S]+user_id: createdUserId,[\s\S]+visibility_status: "visible"/,
    );
    expect(directAccountSource).toMatch(
      /\.from\("coach_profiles"\)[\s\S]+organization_id: context\.organization\.id,[\s\S]+person_profile_id: personProfile\.id,[\s\S]+user_id: createdUserId/,
    );
    expect(auditBlocks.length).toBe(3);

    for (const auditBlock of auditBlocks) {
      expect(auditBlock).not.toMatch(
        /\bpassword\b|confirmPassword|validation\.values\.email|validation\.values\.password/i,
      );
    }

    expect(combinedSource).not.toMatch(/console\./);
    expect(updatePasswordSource).toMatch(
      /const passwordChangeRequired = isPasswordChangeRequired\(user\);[\s\S]+if \(passwordChangeRequired\) \{[\s\S]+authAdmin = createAdminClient\(\);/,
    );
    expect(updatePasswordSource).toMatch(
      /await supabase\.auth\.updateUser\(\{ password \}\)[\s\S]+authAdmin\.auth\.admin\.updateUserById\([\s\S]+app_metadata: clearRequiredPasswordChangeAppMetadata\(user\.app_metadata\),[\s\S]+await supabase\.auth\.signOut\(\);[\s\S]+redirect\("\/login\?status=password-updated"\);/,
    );
    expect(loginActionsSource).toMatch(
      /if \(data\.user && isPasswordChangeRequired\(data\.user\)\) \{[\s\S]+redirect\(getRequiredPasswordChangePath\(\)\);/,
    );
    expect(proxySource).toMatch(
      /if \(user && request\.nextUrl\.pathname\.startsWith\("\/app"\)\) \{[\s\S]+isPasswordChangeRequired\(user\)[\s\S]+NextResponse\.redirect\([\s\S]+new URL\(getRequiredPasswordChangePath\(\), request\.url\)/,
    );
    expect(appLayoutSource).toMatch(
      /if \(isPasswordChangeRequired\(user\)\) \{[\s\S]+redirect\(getRequiredPasswordChangePath\(\)\);/,
    );
  });

  test("keeps Storage and signed URLs confined to expected server surfaces", () => {
    const sourceFiles = collectSourceFiles(path.join(process.cwd(), "src"));
    const filesMatching = (pattern: RegExp) =>
      sourceFiles
        .filter((filePath) => pattern.test(readFileSync(filePath, "utf8")))
        .map((filePath) =>
          path.relative(process.cwd(), filePath).replace(/\\/g, "/"),
        )
        .sort();
    const visibleDocumentLinkSources = [
      "src/lib/navigation/app-paths.ts",
      "src/components/layout/app-navigation.tsx",
      "src/app/(app)/app/page.tsx",
      "src/app/(app)/app/more/page.tsx",
      "src/app/(app)/app/documents/page.tsx",
      "src/app/(app)/app/schedule/schedule-block-detail-panels.tsx",
    ].map((filePath) => readProjectFile(filePath));
    const visibleDocumentSurfaceSource = visibleDocumentLinkSources.join("\n");

    expect(filesMatching(/supabase\.storage/)).toEqual([
      "src/app/(app)/app/account/actions.ts",
      "src/app/(app)/app/account/page.tsx",
      "src/app/(app)/app/documents/actions.ts",
      "src/lib/document-file-access.ts",
    ]);
    expect(filesMatching(/createSignedUrl/)).toEqual([
      "src/app/(app)/app/account/page.tsx",
      "src/lib/document-file-access.ts",
    ]);
    expect(filesMatching(/\bdocument-files\b/)).toEqual([
      "src/lib/document-file-access.ts",
    ]);
    expect(filesMatching(/\bdocument_access_grants\b|\bmanage_grants\b/)).not.toContain(
      "src/app/(app)/app/documents/page.tsx",
    );
    expect(filesMatching(/\bdocument_access_grants\b|\bmanage_grants\b/)).not.toContain(
      "src/components/layout/app-navigation.tsx",
    );

    expect(visibleDocumentSurfaceSource).toMatch(
      /\/app\/documents\/\$\{documentId\}\/versions\/\$\{documentVersionId\}\/\$\{mode\}/,
    );
    expect(visibleDocumentSurfaceSource).toMatch(/can_preview/);
    expect(visibleDocumentSurfaceSource).toMatch(/can_download/);
    expect(visibleDocumentSurfaceSource).not.toMatch(
      /supabase\.storage|createSignedUrl|signedUrl|storage_path|storage_bucket|DOCUMENT_FILES_BUCKET|document-files|document_access_grants|manage_grants|begin_document_version_upload|activate_document_version_upload|cancel_document_version_upload/i,
    );
  });

  test("keeps client components away from Supabase clients, env secrets and raw Storage details", () => {
    const clientComponentFiles = [
      ...collectSourceFiles(path.join(process.cwd(), "src/app")),
      ...collectSourceFiles(path.join(process.cwd(), "src/components")),
    ].filter((filePath) =>
      /^\s*["']use client["'];?/.test(readFileSync(filePath, "utf8")),
    );

    expect(clientComponentFiles.length).toBeGreaterThan(10);

    for (const filePath of clientComponentFiles) {
      const relativePath = path.relative(process.cwd(), filePath);
      const source = readFileSync(filePath, "utf8");

      expect(source, `${relativePath} does not import Supabase clients`).not.toMatch(
        /@\/lib\/supabase|@supabase\/ssr|@supabase\/supabase-js/,
      );
      expect(
        source,
        `${relativePath} does not call privileged Supabase APIs`,
      ).not.toMatch(/supabase\.|createSignedUrl|auth\.admin/i);
      expect(source, `${relativePath} does not read env or secrets`).not.toMatch(
        /process\.env|RESEND_API_KEY|BOXOPS_EMAIL|SUPABASE_SERVICE_ROLE|SUPABASE_DB|DATABASE_URL|POSTGRES_URL|DIRECT_URL|SMTP/i,
      );
      expect(
        source,
        `${relativePath} does not expose raw Storage/document internals`,
      ).not.toMatch(
        /storage_path|storage_bucket|document-files|document_access_grants|manage_grants|requires_signature|signature_evidence|sensitive_hr|payroll/i,
      );
    }
  });
});

test.describe("trackable secret and evidence hygiene local guardrails", () => {
  test("keeps trackable docs, tests and snippets free from active secrets or file URLs", () => {
    const hygieneFiles = collectTrackableHygieneFiles();
    const forbiddenPatterns: Array<{ name: string; pattern: RegExp }> = [
      {
        name: "OpenAI-style API key",
        pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}\b/,
      },
      {
        name: "Resend API key",
        pattern: /\bre_[A-Za-z0-9]{24,}\b/,
      },
      {
        name: "Supabase access token",
        pattern: /\bsb_[A-Za-z0-9_-]{24,}\b/,
      },
      {
        name: "JWT",
        pattern:
          /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/,
      },
      {
        name: "private key",
        pattern:
          /-----BEGIN (?:RSA |EC |OPENSSH |DSA |)?PRIVATE KEY-----[\s\S]+-----END (?:RSA |EC |OPENSSH |DSA |)?PRIVATE KEY-----/,
      },
      {
        name: "database URL with credentials",
        pattern:
          /\bpostgres(?:ql)?:\/\/[^:\s"'<>]+:[^@\s"'<>]+@[^ \r\n"'<>]+/i,
      },
      {
        name: "SMTP URL with credentials",
        pattern: /\bsmtps?:\/\/[^:\s"'<>]+:[^@\s"'<>]+@[^ \r\n"'<>]+/i,
      },
      {
        name: "sensitive env assignment",
        pattern:
          /^[ \t]*(?:export[ \t]+)?(?:RESEND_API_KEY|SUPABASE_ACCESS_TOKEN|SUPABASE_SERVICE_ROLE(?:_KEY)?|SUPABASE_DB_URL|DATABASE_URL|POSTGRES(?:_URL|_PRISMA_URL|_URL_NON_POOLING)?|DIRECT_URL|PGPASSWORD|SMTP_(?:HOST|USER|PASS|PASSWORD)|EMAIL_SERVER)[ \t]*=[ \t]*(?:"[^"\r\n]+"|'[^'\r\n]+'|[^#\s\r\n]+)/im,
      },
      {
        name: "cookie header value",
        pattern: /\b(?:Cookie|Set-Cookie):\s*[^=\r\n;]{2,}=[^;\r\n]{16,}/i,
      },
      {
        name: "active signed URL",
        pattern:
          /https?:\/\/[^\s"'`<>)]+(?:storage\/v1\/object\/sign|[?&](?:token|X-Amz-Signature|Signature)=)[^\s"'`<>)]+/i,
      },
      {
        name: "active Supabase Storage object URL",
        pattern:
          /https?:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/(?:sign|authenticated|public)\/[^\s"'`<>)]+/i,
      },
    ];

    expect(hygieneFiles).toContain(".env.example");
    expect(hygieneFiles).not.toContain(".env.local");

    for (const relativePath of hygieneFiles) {
      const source = readProjectFile(relativePath);

      for (const { name, pattern } of forbiddenPatterns) {
        expect(source, `${relativePath} does not contain ${name}`).not.toMatch(
          pattern,
        );
      }
    }
  });

  test("keeps .env.example placeholder-only and .env.local ignored without reading secrets", () => {
    const envExampleSource = readProjectFile(".env.example");

    expect(envExampleSource).toMatch(
      /^NEXT_PUBLIC_SUPABASE_URL=http:\/\/127\.0\.0\.1:54321$/m,
    );
    expect(envExampleSource).toMatch(/^NEXT_PUBLIC_SUPABASE_ANON_KEY=$/m);
    expect(envExampleSource).toMatch(
      /^NEXT_PUBLIC_SITE_URL=http:\/\/127\.0\.0\.1:3000$/m,
    );
    expect(envExampleSource).toMatch(/^SUPABASE_SERVICE_ROLE_KEY=$/m);
    expect(envExampleSource).toMatch(/^RESEND_API_KEY=$/m);
    expect(envExampleSource).toMatch(
      /^BOXOPS_EMAIL_FROM="BoxOps <onboarding@resend\.dev>"$/m,
    );
    expect(envExampleSource).toMatch(/^BOXOPS_EMAIL_REPLY_TO=$/m);
    expect(envExampleSource).not.toMatch(
      /SUPABASE_ACCESS_TOKEN|SUPABASE_DB_URL|DATABASE_URL|POSTGRES_URL|DIRECT_URL|PGPASSWORD|SMTP_(?:HOST|USER|PASS|PASSWORD)|EMAIL_SERVER/i,
    );

    const ignoredEnvLocalRule = execFileSync("git", [
      "check-ignore",
      "-v",
      ".env.local",
    ], {
      cwd: process.cwd(),
      encoding: "utf8",
    });

    expect(ignoredEnvLocalRule).toContain(".env.*");
    expect(gitLines(["ls-files", ".env.local"])).toEqual([]);
  });

  test("keeps evidence runbooks redacted and out of the repository", () => {
    const evidenceRunbooks = [
      "docs/architecture/security-baseline.md",
      "docs/architecture/asvs-level-1-beta-matrix.md",
      "docs/architecture/tenant-rls-negative-test-matrix.md",
      "docs/architecture/tenant-rls-negative-test-implementation-plan.md",
      "docs/operations/beta-operational-readiness-runbook.md",
      "docs/operations/daily-operations-beta-readiness-runbook.md",
      "docs/operations/document-repository-beta-readiness-runbook.md",
      "docs/operations/pre-qa-controlled-pilot-runbook.md",
      "docs/operations/tenant-readiness-checklist.md",
      "docs/operations/time-tracking-beta-readiness-runbook.md",
    ];
    const combinedRunbookSource = evidenceRunbooks
      .map((relativePath) => readProjectFile(relativePath))
      .join("\n");

    expect(combinedRunbookSource).toMatch(/fuera del repo/i);
    expect(combinedRunbookSource).toMatch(/redacted/i);

    for (const term of [
      "secretos",
      "cookies",
      "signed URLs",
      "rutas Storage",
      "contenido documental",
    ]) {
      expect(combinedRunbookSource, `runbooks mention ${term}`).toMatch(
        new RegExp(term, "i"),
      );
    }

    const unsafeEvidenceInstructions = combinedRunbookSource
      .split(/\r?\n/)
      .filter(
        (line) =>
          /(?:guardar|commitear|pegar|subir)[^.]{0,120}(?:secretos?|cookies?|signed URLs?|rutas Storage activas|contenido documental)[^.]{0,120}(?:repo|repositorio)/i.test(
            line,
          ) &&
          !/^\s*(?:[-*]|\d+\.)?\s*no\b/i.test(line) &&
          !/\bsin guardar\b/i.test(line) &&
          !/fuera del repo/i.test(line),
      );

    expect(unsafeEvidenceInstructions).toEqual([]);

    const externalScannerInstructions = combinedRunbookSource
      .split(/\r?\n/)
      .filter(
        (line) =>
          /(?:gitleaks|trufflehog|GitHub secret scanning|secret scanning externo)/i.test(
            line,
          ) &&
          !/\b(?:no|sin)\b/i.test(line),
      );

    expect(externalScannerInstructions).toEqual([]);
  });
});

test.describe("package supply-chain local source guardrails", () => {
  test("keeps package-lock present and aligned with package manifest", () => {
    const packageJson = readJsonProjectFile<PackageManifest>("package.json");
    const packageLock = readJsonProjectFile<PackageLock>("package-lock.json");
    const lockRoot = packageLock.packages?.[""];
    const packageDependencies = packageJson.dependencies ?? {};
    const packageDevDependencies = packageJson.devDependencies ?? {};
    const directPackageNames = new Set([
      ...Object.keys(packageDependencies),
      ...Object.keys(packageDevDependencies),
    ]);

    expect(packageLock.name).toBe(packageJson.name);
    expect(packageLock.lockfileVersion).toBe(3);
    expect(lockRoot, "package-lock root package exists").toBeDefined();
    expect(lockRoot?.name).toBe(packageJson.name);
    expect(lockRoot?.dependencies ?? {}).toEqual(packageDependencies);
    expect(lockRoot?.devDependencies ?? {}).toEqual(packageDevDependencies);

    for (const expectedPackage of [
      "next",
      "react",
      "react-dom",
      "@supabase/ssr",
      "@supabase/supabase-js",
      "@playwright/test",
      "tailwindcss",
      "shadcn",
    ]) {
      expect(
        directPackageNames,
        `${expectedPackage} remains allowed as an existing app dependency`,
      ).toContain(expectedPackage);
    }
  });

  test("keeps direct package dependencies away from deferred or privileged capabilities", () => {
    const packageJson = readJsonProjectFile<PackageManifest>("package.json");
    const packageLock = readJsonProjectFile<PackageLock>("package-lock.json");
    const lockRoot = packageLock.packages?.[""];
    const directPackageNames = new Set([
      ...Object.keys(packageJson.dependencies ?? {}),
      ...Object.keys(packageJson.devDependencies ?? {}),
      ...Object.keys(lockRoot?.dependencies ?? {}),
      ...Object.keys(lockRoot?.devDependencies ?? {}),
    ]);
    const explicitlyAllowedPackages = new Set([
      "@playwright/test",
      "@supabase/ssr",
      "@supabase/supabase-js",
      "@tailwindcss/postcss",
      "@types/node",
      "@types/react",
      "@types/react-dom",
      "class-variance-authority",
      "clsx",
      "eslint",
      "eslint-config-next",
      "lucide-react",
      "next",
      "radix-ui",
      "react",
      "react-dom",
      "shadcn",
      "supabase",
      "tailwind-merge",
      "tailwindcss",
      "tw-animate-css",
      "typescript",
    ]);
    const forbiddenPackageFamilies: Array<{ name: string; pattern: RegExp }> = [
      {
        name: "AI/LLM/embeddings/vector",
        pattern:
          /^(?:ai|openai|@openai\/|anthropic|@anthropic-ai\/|@ai-sdk\/|langchain|@langchain\/|llamaindex|llama-index|ollama|cohere|@mistralai\/|mistral|groq-sdk|pinecone|@pinecone-database\/|weaviate|chromadb|qdrant|@qdrant\/|milvus|pgvector)\b/i,
      },
      {
        name: "web geolocation, offline PWA or push",
        pattern:
          /^(?:next-pwa|workbox-|@serwist\/|serwist|web-push|onesignal|@onesignal\/|firebase|@firebase\/|expo|@expo\/|react-native|@react-native\/|@capacitor\/|capacitor|cordova|@cordova\/)/i,
      },
      {
        name: "direct SMTP provider/client",
        pattern: /^(?:nodemailer|smtp-|emailjs|mailgun\.js|@sendgrid\/)/i,
      },
      {
        name: "direct privileged database client",
        pattern:
          /^(?:pg|postgres|mysql2|mariadb|sqlite3|better-sqlite3|prisma|@prisma\/client|drizzle-orm|knex|kysely|sequelize|typeorm|mongodb|@neondatabase\/serverless)$/i,
      },
      {
        name: "secret scanner dependency",
        pattern:
          /^(?:gitleaks|trufflehog|secretlint|@secretlint\/|detect-secrets|git-secrets)$/i,
      },
      {
        name: "native app, payroll or legal signing tooling",
        pattern:
          /(?:react-native|expo|capacitor|cordova|payroll|payslip|docusign|hellosign|signnow|legal)/i,
      },
    ];
    const violations: string[] = [];

    for (const packageName of [...directPackageNames].sort()) {
      if (explicitlyAllowedPackages.has(packageName)) {
        continue;
      }

      for (const { name, pattern } of forbiddenPackageFamilies) {
        if (pattern.test(packageName)) {
          violations.push(`${packageName} matched ${name}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  test("keeps npm scripts local-only and away from secrets or real providers", () => {
    const packageJson = readJsonProjectFile<PackageManifest>("package.json");
    const scripts = packageJson.scripts ?? {};
    const unsafeScripts: string[] = [];
    const forbiddenScriptPatterns: Array<{
      name: string;
      pattern: RegExp;
      allow?: (scriptName: string, command: string) => boolean;
    }> = [
      {
        name: "destructive command outside the known local reset",
        pattern:
          /\b(?:rm\s+-rf|Remove-Item|rmdir\s+\/s|del\s+\/s|git\s+reset\s+--hard|git\s+clean|dropdb|DROP\s+DATABASE|TRUNCATE\s+[^;&|]+CASCADE|supabase\s+db\s+reset|supabase\s+db\s+push|supabase\s+db\s+remote|docker\s+system\s+prune)\b/i,
        allow: (scriptName, command) =>
          scriptName === "supabase:reset" && command === "supabase db reset",
      },
      {
        name: "reads local secrets",
        pattern: /\.env\.local|(?:cat|type|Get-Content)\s+\.env|dotenv\s+-e/i,
      },
      {
        name: "prints sensitive environment values",
        pattern:
          /\b(?:echo|printf|printenv|Write-Host|console\.log)\b[^;&|]*(?:SECRET|TOKEN|KEY|DATABASE_URL|POSTGRES|PGPASSWORD|SMTP|RESEND|SERVICE_ROLE)/i,
      },
      {
        name: "calls real provider or staging target",
        pattern:
          /https?:\/\/|supabase\.co|api\.resend\.com|resend\.com|vercel\.app|\b(?:staging|production|prod|qa)\b|--db-url\b|DATABASE_URL|POSTGRES|PGPASSWORD/i,
      },
      {
        name: "uses privileged service role or direct DB env",
        pattern:
          /service_role|SUPABASE_SERVICE_ROLE|SUPABASE_ACCESS_TOKEN|SUPABASE_DB_URL|DIRECT_URL|PGPASSWORD/i,
      },
    ];

    expect(scripts["supabase:types"]).toContain("--local");

    for (const [scriptName, command] of Object.entries(scripts)) {
      for (const { name, pattern, allow } of forbiddenScriptPatterns) {
        if (pattern.test(command) && !allow?.(scriptName, command)) {
          unsafeScripts.push(`${scriptName} matched ${name}: ${command}`);
        }
      }
    }

    expect(unsafeScripts).toEqual([]);
  });
});

test.describe("generated artifact and local evidence hygiene guardrails", () => {
  test("keeps generated build, test and local evidence artifact paths ignored", () => {
    const gitignoreSource = readProjectFile(".gitignore");
    const expectedIgnoreLines = [
      ".next/",
      "out/",
      "dist/",
      "build/",
      ".turbo/",
      ".vercel/",
      "/coverage/",
      "test-results/",
      "playwright-report/",
      "*.tsbuildinfo",
      "*.log",
      "/.local-evidence/",
      "/evidence/",
      "/qa-evidence/",
      "/screenshots/",
      "/videos/",
      "/traces/",
      "/dumps/",
      "/exports/",
      "/controlled-documents/",
      "/tmp/",
      "/temp/",
      "*.trace",
      "*.trace.zip",
      "*.har",
      "*.webm",
      "*.mp4",
      "*.dump",
      "*.sql.gz",
      "*.sqlite",
      "*.db",
      "*.bak",
      "*.tmp",
    ];
    const ignoredArtifactSamples = [
      ".next/server/app/page.js",
      "out/index.html",
      "dist/bundle.js",
      "build/output.txt",
      ".turbo/cache/build.log",
      ".vercel/project.json",
      "coverage/lcov.info",
      "test-results/smoke/artifact.txt",
      "playwright-report/index.html",
      "boxops.tsbuildinfo",
      "debug.log",
      ".local-evidence/session.txt",
      "evidence/run.txt",
      "qa-evidence/run.txt",
      "screenshots/local.png",
      "videos/local.webm",
      "traces/context.trace.zip",
      "dumps/local.dump",
      "exports/real-export.csv",
      "controlled-documents/private.pdf",
      "tmp/evidence.tmp",
      "temp/evidence.tmp",
      "local.trace",
      "network.har",
      "recording.webm",
      "recording.mp4",
      "database.dump",
      "database.sql.gz",
      "local.sqlite",
      "local.db",
      "copy.bak",
      "scratch.tmp",
    ];

    for (const expectedLine of expectedIgnoreLines) {
      expect(gitignoreSource, `.gitignore keeps ${expectedLine}`).toContain(
        expectedLine,
      );
    }

    for (const samplePath of ignoredArtifactSamples) {
      expect(isGitIgnored(samplePath), `${samplePath} is ignored`).toBe(true);
    }
  });

  test("keeps generated build, test and evidence artifacts out of tracked and unignored files", () => {
    const trackedArtifacts = gitLines(["ls-files"])
      .filter((relativePath) =>
        generatedEvidenceArtifactPathPattern.test(relativePath),
      )
      .sort();
    const unignoredLocalArtifacts = gitLines([
      "ls-files",
      "--others",
      "--exclude-standard",
    ])
      .filter((relativePath) =>
        generatedEvidenceArtifactPathPattern.test(relativePath),
      )
      .sort();

    expect(trackedArtifacts).toEqual([]);
    expect(unignoredLocalArtifacts).toEqual([]);
  });
});

test.describe("auth redirect helper negative cases", () => {
  test("falls back to the app when callback next points to an external URL", () => {
    for (const value of [
      "https://example.test/phishing",
      "http://example.test/phishing",
      "//example.test/phishing",
      "/\\example.test/phishing",
      "/\\/example.test/phishing",
      "javascript:alert(1)",
    ]) {
      expect(getSafeRedirectPath(value), value).toBe("/app");
    }
  });

  test("keeps reset callback redirects as internal paths only", () => {
    expect(getSafeRedirectPath("/reset-password")).toBe("/reset-password");
    expect(getSafeRedirectPath("/reset-password?from=email")).toBe(
      "/reset-password?from=email",
    );
  });

  test("sanitizes login redirectTo before preserving it in the query string", () => {
    expect(getLoginPath("https://example.test/phishing")).toBe(
      "/login?redirectTo=%2Fapp",
    );
    expect(getLoginPath("//example.test/phishing")).toBe(
      "/login?redirectTo=%2Fapp",
    );
    expect(getLoginPath("/app/schedule?week=2026-05-04")).toBe(
      "/login?redirectTo=%2Fapp%2Fschedule%3Fweek%3D2026-05-04",
    );
  });
});

test.describe("base role permission helper guardrails", () => {
  test("keeps the managed access role set limited to owner, admin, manager and coach", () => {
    expect(MANAGED_ACCESS_ROLES).toEqual([
      "owner",
      "admin",
      "manager",
      "coach",
    ]);
  });

  test("keeps MVP management permissions scoped to the base roles", () => {
    const expectations: Record<
      "owner" | "admin" | "manager" | "coach",
      {
        tenantSettings: boolean;
        teamAccess: boolean;
        teamProfileDelete: boolean;
        operationalData: boolean;
        timeTrackingReview: boolean;
        absenceSelfService: boolean;
      }
    > = {
      owner: {
        tenantSettings: true,
        teamAccess: true,
        teamProfileDelete: true,
        operationalData: true,
        timeTrackingReview: true,
        absenceSelfService: true,
      },
      admin: {
        tenantSettings: true,
        teamAccess: true,
        teamProfileDelete: false,
        operationalData: true,
        timeTrackingReview: true,
        absenceSelfService: true,
      },
      manager: {
        tenantSettings: false,
        teamAccess: false,
        teamProfileDelete: false,
        operationalData: true,
        timeTrackingReview: true,
        absenceSelfService: true,
      },
      coach: {
        tenantSettings: false,
        teamAccess: false,
        teamProfileDelete: false,
        operationalData: false,
        timeTrackingReview: false,
        absenceSelfService: true,
      },
    };

    for (const [role, expectation] of Object.entries(expectations)) {
      expect(canManageTenantSettings(role), `${role} tenant settings`).toBe(
        expectation.tenantSettings,
      );
      expect(canManageTeamAccess(role), `${role} team access`).toBe(
        expectation.teamAccess,
      );
      expect(
        canDeleteOperationalTeamProfiles(role),
        `${role} team profile delete`,
      ).toBe(expectation.teamProfileDelete);
      expect(canManageOperationalData(role), `${role} operational data`).toBe(
        expectation.operationalData,
      );
      expect(canReviewTimeTracking(role), `${role} time tracking review`).toBe(
        expectation.timeTrackingReview,
      );
      expect(canUseAbsenceSelfService(role), `${role} absence self service`).toBe(
        expectation.absenceSelfService,
      );
    }
  });

  test("does not activate future or specialized roles for MVP management", () => {
    for (const role of [
      "center_manager",
      "document_admin",
      "payroll_manager",
      "staff",
    ]) {
      expect(canManageTenantSettings(role), `${role} tenant settings`).toBe(
        false,
      );
      expect(canManageTeamAccess(role), `${role} team access`).toBe(false);
      expect(
        canDeleteOperationalTeamProfiles(role),
        `${role} team profile delete`,
      ).toBe(false);
      expect(canManageOperationalData(role), `${role} operational data`).toBe(
        false,
      );
      expect(canReviewTimeTracking(role), `${role} time tracking review`).toBe(
        false,
      );
    }
  });

  test("does not grant future or specialized roles sensitive management, review, or activation capabilities", () => {
    const guardedHelpers: Record<string, (role: string) => boolean> = {
      absenceRequestManagement: canManageAbsenceRequests,
      changeRequestManagement: canManageChangeRequests,
      operationalDataManagement: canManageOperationalData,
      operationalEventManagement: canManageOperationalEvents,
      operationalEventRead: canReadOperationalEvents,
      operationalTeamProfileDelete: canDeleteOperationalTeamProfiles,
      operationalTeamProfileManagement: canManageOperationalTeamProfiles,
      overtimeCandidateReview: canReviewOvertimeCandidates,
      staffWorkWindowManagement: canManageStaffWorkWindows,
      teamAccessManagement: canManageTeamAccess,
      tenantSettingsManagement: canManageTenantSettings,
      timeLocationActivation: canActivateTimeLocationSettings,
      timeLocationSettingsManagement: canManageTimeLocationSettings,
      timeTrackingReview: canReviewTimeTracking,
      timeTrackingSettingsManagement: canManageTimeTrackingSettings,
    };

    for (const role of [
      "center_manager",
      "document_admin",
      "payroll_manager",
      "staff",
    ]) {
      for (const [capability, checkCapability] of Object.entries(
        guardedHelpers,
      )) {
        expect(checkCapability(role), `${role} ${capability}`).toBe(false);
      }
    }
  });
});

test.describe("base operational admin local source guardrails", () => {
  test("keeps base admin actions gated by session, tenant and the intended role helpers", () => {
    const actionSources = {
      centers: readProjectFile("src/app/(app)/app/centers/actions.ts"),
      classTypes: readProjectFile("src/app/(app)/app/class-types/actions.ts"),
      coaches: readProjectFile("src/app/(app)/app/coaches/actions.ts"),
      coverage: readProjectFile("src/app/(app)/app/coverage/actions.ts"),
      schedule: readProjectFile("src/app/(app)/app/schedule/actions.ts"),
      settings: readProjectFile("src/app/(app)/app/settings/actions.ts"),
      templates: readProjectFile("src/app/(app)/app/templates/actions.ts"),
    };

    const operationalContexts = [
      [actionSources.centers, "getOperationalActionContext"],
      [actionSources.classTypes, "getOperationalActionContext"],
      [actionSources.schedule, "getOperationalActionContext"],
      [actionSources.templates, "getOperationalActionContext"],
      [actionSources.coverage, "getCoverageActionContext"],
    ] as const;

    for (const [source, contextName] of operationalContexts) {
      const contextSource = getTsFunctionSource(source, contextName);

      expect(contextSource).toContain("getAuthenticatedUser()");
      expect(contextSource).toContain("getActiveMemberships(user.id)");
      expect(contextSource).toContain(
        "resolveActiveOrganization(memberships, organizationId)",
      );
      expect(contextSource).toContain(
        "canManageOperationalData(resolution.membership.role)",
      );
      expect(contextSource).not.toMatch(
        /canManageTenantSettings|canManageTeamAccess/,
      );
    }

    const operationalActionsBySurface: Record<string, string[]> = {
      centers: ["createCenter", "updateCenter", "setCenterStatus"],
      classTypes: [
        "createClassType",
        "updateClassType",
        "setClassTypeStatus",
      ],
      coverage: ["updateSelectedCoverageBlocks"],
      schedule: [
        "createScheduleBlock",
        "assignScheduleBlockCoach",
        "removeScheduleBlockAssignment",
        "updateScheduleBlock",
        "cancelScheduleBlock",
        "createStaffWorkWindow",
        "updateStaffWorkWindow",
        "deactivateStaffWorkWindow",
      ],
      templates: [
        "createScheduleTemplate",
        "updateScheduleTemplate",
        "archiveScheduleTemplate",
        "restoreScheduleTemplate",
        "createScheduleTemplateBlock",
        "updateScheduleTemplateBlock",
        "deleteScheduleTemplateBlock",
        "updateScheduleTemplateBlocksBulk",
        "deleteScheduleTemplateBlocksBulk",
        "applyScheduleTemplateToWeek",
      ],
    };

    for (const [surface, actionNames] of Object.entries(
      operationalActionsBySurface,
    )) {
      const source =
        actionSources[surface as keyof typeof actionSources] ?? "";
      const contextName =
        surface === "coverage"
          ? "getCoverageActionContext"
          : "getOperationalActionContext";

      for (const actionName of actionNames) {
        expect(
          getTsFunctionSource(source, actionName),
          `${surface}.${actionName} uses the gated action context`,
        ).toMatch(new RegExp(`${contextName}\\(\\s*formData`));
      }
    }

    expect(
      getTsFunctionSource(
        actionSources.coverage,
        "assignCoachToSelectedCoverageBlocks",
      ),
    ).toMatch(/return updateSelectedCoverageBlocks\(formData\)/);

    const coachContextSource = getTsFunctionSource(
      actionSources.coaches,
      "getCoachActionContext",
    );
    expect(coachContextSource).toContain("getAuthenticatedUser()");
    expect(coachContextSource).toContain("getActiveMemberships(user.id)");
    expect(coachContextSource).toContain(
      "resolveActiveOrganization(memberships, organizationId)",
    );
    expect(coachContextSource).toContain("canManageTeamAccess");
    expect(coachContextSource).toContain("canManageOperationalTeamProfiles");
    expect(coachContextSource).toContain("canDeleteOperationalTeamProfiles");
    expect(coachContextSource).not.toMatch(
      /canManageTenantSettings|canManageOperationalData/,
    );

    for (const actionName of [
      "createTeamInvitation",
      "resendTeamInvitation",
      "cancelTeamInvitation",
      "createMembership",
      "updateMembership",
      "createCoachProfile",
      "deleteCoachProfile",
      "updateCoachProfile",
      "linkCoachProfileToExistingAccount",
    ]) {
      expect(
        getTsFunctionSource(actionSources.coaches, actionName),
        `coaches.${actionName} uses the gated team context`,
      ).toMatch(
        /getCoachActionContext\(formData,\s*"team-(?:access|profile-delete|profiles)"\)/,
      );
    }

    const settingsContextSource = getTsFunctionSource(
      actionSources.settings,
      "getTenantSettingsActionContext",
    );
    expect(settingsContextSource).toContain("getAuthenticatedUser()");
    expect(settingsContextSource).toContain("getActiveMemberships(user.id)");
    expect(settingsContextSource).toContain(
      "resolveActiveOrganization(memberships, organizationId)",
    );
    expect(settingsContextSource).toContain("canManageTenantSettings");
    expect(settingsContextSource).toContain("canManageTimeTrackingSettings");
    expect(settingsContextSource).not.toMatch(
      /canManageOperationalData|canManageTeamAccess/,
    );
  });

  test("keeps base operational references tenant-scoped and away from sensitive surfaces", () => {
    const centersActionsSource = readProjectFile(
      "src/app/(app)/app/centers/actions.ts",
    );
    const classTypesActionsSource = readProjectFile(
      "src/app/(app)/app/class-types/actions.ts",
    );
    const coachesActionsSource = readProjectFile(
      "src/app/(app)/app/coaches/actions.ts",
    );
    const coverageActionsSource = readProjectFile(
      "src/app/(app)/app/coverage/actions.ts",
    );
    const scheduleActionsSource = readProjectFile(
      "src/app/(app)/app/schedule/actions.ts",
    );
    const templatesActionsSource = readProjectFile(
      "src/app/(app)/app/templates/actions.ts",
    );
    const classTypeSyncMigrationSource = readProjectFile(
      "supabase/migrations/00032_class_type_update_sync_defaults.sql",
    );
    const latestClassTypeSyncMigrationSource = readProjectFile(
      "supabase/migrations/00033_class_type_sync_all_related_blocks.sql",
    );

    expect(getTsFunctionSource(centersActionsSource, "updateCenter")).toMatch(
      /\.from\("centers"\)[\s\S]+\.update\([\s\S]+\.eq\("id", centerId\)[\s\S]+\.eq\("organization_id", context\.organization\.id\)/,
    );
    expect(getTsFunctionSource(centersActionsSource, "setCenterStatus")).toMatch(
      /\.from\("centers"\)[\s\S]+\.update\([\s\S]+\.eq\("id", centerId\)[\s\S]+\.eq\("organization_id", context\.organization\.id\)/,
    );

    const ensureTeamCenterSource = getTsFunctionSource(
      coachesActionsSource,
      "ensureCenterBelongsToOrganization",
    );
    expect(ensureTeamCenterSource).toMatch(
      /\.from\("centers"\)[\s\S]+\.eq\("id", centerId\)[\s\S]+\.eq\("organization_id", organizationId\)/,
    );
    expect(
      getTsFunctionSource(coachesActionsSource, "createTeamInvitation"),
    ).toMatch(
      /\.from\("coach_profiles"\)[\s\S]+\.eq\("id", validation\.values\.coachProfileId\)[\s\S]+\.eq\("organization_id", context\.organization\.id\)[\s\S]+\.from\("person_profiles"\)[\s\S]+\.eq\("id", coachProfile\.person_profile_id\)[\s\S]+\.eq\("organization_id", context\.organization\.id\)[\s\S]+\.from\("team_invitations"\)[\s\S]+organization_id: context\.organization\.id/,
    );
    const createCoachProfileSource = getTsFunctionSource(
      coachesActionsSource,
      "createCoachProfile",
    );
    expect(createCoachProfileSource).toContain(
      'getCoachActionContext(formData, "team-access")',
    );
    expect(createCoachProfileSource).toMatch(
      /\.from\("organization_memberships"\)[\s\S]+\.eq\("organization_id", context\.organization\.id\)[\s\S]+\.eq\("user_id", validation\.values\.userId\)/,
    );
    expect(createCoachProfileSource).toMatch(
      /\.from\("person_profiles"\)[\s\S]+\.eq\("organization_id", context\.organization\.id\)[\s\S]+\.eq\("user_id", validation\.values\.userId\)/,
    );
    expect(createCoachProfileSource).toMatch(
      /\.from\("person_profiles"\)[\s\S]+\.insert\({[\s\S]+organization_id: context\.organization\.id[\s\S]+user_id: validation\.values\.userId[\s\S]+visibility_status: "visible"/,
    );
    expect(createCoachProfileSource).toMatch(
      /\.from\("coach_profiles"\)[\s\S]+organization_id: context\.organization\.id[\s\S]+person_profile_id: personProfile\.id[\s\S]+user_id: validation\.values\.userId/,
    );
    const deleteCoachProfileSource = getTsFunctionSource(
      coachesActionsSource,
      "deleteCoachProfile",
    );
    // Physical deletion is only for inactive fichas without linked Auth.
    // Linked accounts are archived instead, and operational history remains pinned by FK.
    expect(deleteCoachProfileSource).toMatch(
      /const hasLinkedAccount = Boolean\([\s\S]+existingCoachProfile\.user_id \|\| personProfile\?\.user_id[\s\S]+if \(hasLinkedAccount\) \{[\s\S]+\.from\("coach_profiles"\)[\s\S]+\.update\(\{ status: "inactive" \}\)[\s\S]+status: "profile-archived"/,
    );
    expect(deleteCoachProfileSource).toContain(
      '"profile-delete-requires-inactive"',
    );
    expect(deleteCoachProfileSource).toMatch(
      /\.from\("team_invitations"\)[\s\S]+\.update\(\{ coach_profile_id: null, status: "cancelled" \}\)[\s\S]+\.eq\("coach_profile_id", coachProfileId\)[\s\S]+\.eq\("organization_id", context\.organization\.id\)[\s\S]+\.in\("status", \["pending", "sent", "failed", "expired", "cancelled"\]\)/,
    );
    expect(deleteCoachProfileSource).toMatch(
      /\.from\("schedule_template_blocks"\)[\s\S]+\.update\(\{ default_coach_profile_id: null \}\)[\s\S]+\.eq\("default_coach_profile_id", coachProfileId\)[\s\S]+\.eq\("organization_id", context\.organization\.id\)/,
    );
    expect(deleteCoachProfileSource).toMatch(
      /getCoachActionContext\(formData,\s*"team-profile-delete"\)[\s\S]+\.from\("coach_profiles"\)[\s\S]+\.delete\(\)[\s\S]+\.eq\("id", coachProfileId\)[\s\S]+\.eq\("organization_id", context\.organization\.id\)/,
    );

    const updateClassTypeSource = getTsFunctionSource(
      classTypesActionsSource,
      "updateClassType",
    );
    expect(updateClassTypeSource).toMatch(
      /\.rpc\(\s*"update_class_type_and_sync_defaults"[\s\S]+target_organization_id: context\.organization\.id[\s\S]+target_required_coaches: validation\.values\.requiredCoaches/,
    );
    expect(updateClassTypeSource).not.toMatch(
      /\.from\("class_types"\)[\s\S]+\.update\(/,
    );

    const latestClassTypeSyncSource = getSqlFunctionSource(
      latestClassTypeSyncMigrationSource,
      "update_class_type_and_sync_defaults",
    );
    expect(latestClassTypeSyncSource).toMatch(
      /public\.has_org_role\(target_organization_id, ARRAY\['owner', 'admin', 'manager'\]\)/,
    );
    expect(latestClassTypeSyncSource).toMatch(
      /FROM public\.class_types class_type[\s\S]+class_type\.id = target_class_type_id[\s\S]+class_type\.organization_id = target_organization_id/,
    );
    expect(latestClassTypeSyncSource).toMatch(
      /UPDATE public\.schedule_template_blocks template_block[\s\S]+template_block\.organization_id = target_organization_id[\s\S]+template_block\.class_type_id = target_class_type_id/,
    );
    expect(latestClassTypeSyncSource).toMatch(
      /UPDATE public\.schedule_blocks schedule_block[\s\S]+schedule_block\.organization_id = target_organization_id[\s\S]+schedule_block\.class_type_id = target_class_type_id[\s\S]+schedule_block\.status NOT IN \('cancelled', 'completed'\)/,
    );
    expect(latestClassTypeSyncSource).not.toMatch(
      /'center_manager'|'document_admin'|'payroll_manager'|'staff'|'coach'/,
    );
    expect(classTypeSyncMigrationSource).toMatch(
      /REVOKE ALL ON FUNCTION public\.update_class_type_and_sync_defaults[\s\S]+FROM PUBLIC/,
    );
    expect(classTypeSyncMigrationSource).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.update_class_type_and_sync_defaults[\s\S]+TO authenticated/,
    );

    expect(
      getTsFunctionSource(scheduleActionsSource, "validateBlockReferences"),
    ).toMatch(
      /\.from\("centers"\)[\s\S]+\.eq\("id", centerId\)[\s\S]+\.eq\("organization_id", organizationId\)[\s\S]+\.from\("class_types"\)[\s\S]+\.eq\("id", classTypeId\)[\s\S]+\.eq\("organization_id", organizationId\)/,
    );
    expect(
      getTsFunctionSource(scheduleActionsSource, "validateAssignableCoach"),
    ).toMatch(
      /\.from\("coach_profiles"\)[\s\S]+\.eq\("id", coachProfileId\)[\s\S]+\.eq\("organization_id", organizationId\)[\s\S]+\.from\("person_profiles"\)[\s\S]+\.eq\("organization_id", organizationId\)[\s\S]+\.from\("organization_memberships"\)[\s\S]+\.eq\("organization_id", organizationId\)/,
    );
    expect(
      getTsFunctionSource(scheduleActionsSource, "removeScheduleBlockAssignment"),
    ).toMatch(
      /\.from\("schedule_block_assignments"\)[\s\S]+\.eq\("id", validation\.assignmentId\)[\s\S]+\.eq\("organization_id", context\.organization\.id\)[\s\S]+\.from\("schedule_blocks"\)[\s\S]+\.eq\("organization_id", context\.organization\.id\)[\s\S]+\.from\("coach_profiles"\)[\s\S]+\.eq\("organization_id", context\.organization\.id\)/,
    );

    expect(
      getTsFunctionSource(templatesActionsSource, "validateTemplateReference"),
    ).toMatch(
      /\.from\("schedule_templates"\)[\s\S]+\.eq\("id", templateId\)[\s\S]+\.eq\("organization_id", organizationId\)/,
    );
    expect(
      getTsFunctionSource(
        templatesActionsSource,
        "validateTemplateBlockReferences",
      ),
    ).toMatch(
      /validateTemplateReference\([\s\S]+\.from\("centers"\)[\s\S]+\.eq\("organization_id", organizationId\)[\s\S]+\.from\("class_types"\)[\s\S]+\.eq\("organization_id", organizationId\)[\s\S]+validateAssignableCoach/,
    );
    expect(
      getTsFunctionSource(templatesActionsSource, "applyScheduleTemplateToWeek"),
    ).toMatch(
      /validateTemplateReference\({[\s\S]+organizationId: context\.organization\.id[\s\S]+requireActive: true[\s\S]+applyScheduleTemplateWeek\({[\s\S]+organizationId: context\.organization\.id/,
    );

    expect(
      getTsFunctionSource(coverageActionsSource, "getBulkEditableBlocks"),
    ).toMatch(
      /\.from\("schedule_blocks"\)[\s\S]+\.eq\("organization_id", organizationId\)[\s\S]+\.in\("id", blockIds\)/,
    );
    expect(
      getTsFunctionSource(coverageActionsSource, "validateClassTypeReference"),
    ).toMatch(
      /\.from\("class_types"\)[\s\S]+\.eq\("id", classTypeId\)[\s\S]+\.eq\("organization_id", organizationId\)/,
    );
    expect(getTsFunctionSource(coverageActionsSource, "assignCoachToBlocks")).toMatch(
      /\.from\("schedule_block_assignments"\)[\s\S]+\.eq\("organization_id", organizationId\)[\s\S]+\.eq\("coach_profile_id", coachProfileId\)[\s\S]+\.in\("schedule_block_id", blockIds\)/,
    );

    const baseOperationalSurfaceSource = [
      centersActionsSource,
      coachesActionsSource,
      classTypesActionsSource,
      coverageActionsSource,
      scheduleActionsSource,
      templatesActionsSource,
    ].join("\n");

    expect(baseOperationalSurfaceSource).not.toMatch(/\bcenter_manager\b/);
    expect(baseOperationalSurfaceSource).not.toMatch(
      /\b(?:document_access_events|document_access_grants|document_versions|profile_signatures|signature_evidence|time_exports|time_location_events|time_punches|time_records|time_weekly_approvals|center_time_location_settings|record_own_time_location_event|create_own_time_punch|generate_schedule_auto_time_punches)\b/,
    );
    expect(baseOperationalSurfaceSource).not.toMatch(
      /\b(?:payroll|nomina|n[oó]mina|salary|amount|currency|compensation|approved_overtime)\b/i,
    );
    expect(baseOperationalSurfaceSource).not.toMatch(
      /navigator\.geolocation|serviceWorker|service worker|PushManager|Notification|background sync|caches\.|CacheStorage|OpenAI|openai|anthropic|embeddings|pgvector|ai_/i,
    );
  });
});

test.describe("base operational listing page local source guardrails", () => {
  test("keeps base list pages resolving session and tenant before page data", () => {
    const pages = [
      {
        basePath: "/app/centers",
        functionName: "CentersPage",
        loginPath: "/app/centers",
        path: "src/app/(app)/app/centers/page.tsx",
      },
      {
        basePath: "/app/coaches",
        functionName: "CoachesPage",
        loginPath: "/app/coaches",
        path: "src/app/(app)/app/coaches/page.tsx",
      },
      {
        basePath: "/app/class-types",
        functionName: "ClassTypesPage",
        loginPath: "/app/class-types",
        path: "src/app/(app)/app/class-types/page.tsx",
      },
      {
        basePath: "/app/schedule",
        functionName: "SchedulePage",
        loginPath: "/app/schedule",
        path: "src/app/(app)/app/schedule/page.tsx",
      },
      {
        basePath: "/app/templates",
        functionName: "TemplatesPage",
        loginPath: "/app/templates",
        path: "src/app/(app)/app/templates/page.tsx",
      },
      {
        basePath: "/app/coverage",
        functionName: "CoveragePage",
        loginPath: "/app/coverage",
        path: "src/app/(app)/app/coverage/page.tsx",
      },
      {
        basePath: "/app/stats",
        functionName: "StatsPage",
        loginPath: "/app/stats",
        path: "src/app/(app)/app/stats/page.tsx",
      },
      {
        basePath: "/app/work-windows",
        functionName: "WorkWindowsPage",
        loginPath: "/app/work-windows",
        path: "src/app/(app)/app/work-windows/page.tsx",
      },
      {
        basePath: "/app/settings",
        functionName: "SettingsPage",
        loginPath: "/app/settings",
        path: "src/app/(app)/app/settings/page.tsx",
      },
    ];

    for (const page of pages) {
      const source = readProjectFile(page.path);
      const pageSource = getDefaultAsyncFunctionSource(
        source,
        page.functionName,
      );

      expect(pageSource, `${page.functionName} authenticates first`).toContain(
        "const user = await getAuthenticatedUser();",
      );
      expect(pageSource, `${page.functionName} redirects anonymous users`).toContain(
        `redirect(getLoginPath("${page.loginPath}"));`,
      );
      expect(pageSource, `${page.functionName} loads active memberships`).toContain(
        "getActiveMemberships(user.id)",
      );
      expect(pageSource, `${page.functionName} resolves the requested tenant`).toContain(
        "resolveActiveOrganization(",
      );
      expect(pageSource, `${page.functionName} handles tenant resolution errors`).toMatch(
        /if \(!resolution\.ok\) \{[\s\S]+<OrganizationResolutionState[\s\S]+resolution={resolution}/,
      );
      expect(pageSource, `${page.functionName} keeps the same page base path`).toContain(
        `basePath="${page.basePath}"`,
      );
    }

    const centersPageSource = getDefaultAsyncFunctionSource(
      readProjectFile("src/app/(app)/app/centers/page.tsx"),
      "CentersPage",
    );
    const classTypesPageSource = getDefaultAsyncFunctionSource(
      readProjectFile("src/app/(app)/app/class-types/page.tsx"),
      "ClassTypesPage",
    );
    const coachesPageSource = getDefaultAsyncFunctionSource(
      readProjectFile("src/app/(app)/app/coaches/page.tsx"),
      "CoachesPage",
    );
    const schedulePageSource = getDefaultAsyncFunctionSource(
      readProjectFile("src/app/(app)/app/schedule/page.tsx"),
      "SchedulePage",
    );
    const templatesPageSource = getDefaultAsyncFunctionSource(
      readProjectFile("src/app/(app)/app/templates/page.tsx"),
      "TemplatesPage",
    );
    const coveragePageSource = getDefaultAsyncFunctionSource(
      readProjectFile("src/app/(app)/app/coverage/page.tsx"),
      "CoveragePage",
    );
    const statsPageSource = getDefaultAsyncFunctionSource(
      readProjectFile("src/app/(app)/app/stats/page.tsx"),
      "StatsPage",
    );
    const settingsPageSource = getDefaultAsyncFunctionSource(
      readProjectFile("src/app/(app)/app/settings/page.tsx"),
      "SettingsPage",
    );
    const workWindowsPageSource = getDefaultAsyncFunctionSource(
      readProjectFile("src/app/(app)/app/work-windows/page.tsx"),
      "WorkWindowsPage",
    );

    expect(centersPageSource).toMatch(
      /const centers = await getCenters\(resolution\.organization\.id\)[\s\S]+const canManageCenters = canManageOperationalData\(resolution\.membership\.role\)/,
    );
    expect(classTypesPageSource).toMatch(
      /const classTypes = await getClassTypes\(resolution\.organization\.id\)[\s\S]+const canManageClassTypes = canManageOperationalData\(/,
    );
    expect(coachesPageSource).toMatch(
      /getMemberships\(resolution\.organization\.id\)[\s\S]+getCoachProfiles\(resolution\.organization\.id\)[\s\S]+getCenters\(resolution\.organization\.id\)[\s\S]+getPersonProfiles\(resolution\.organization\.id\)[\s\S]+getTeamInvitations\(resolution\.organization\.id\)/,
    );
    expect(schedulePageSource).toMatch(
      /const canManageSchedule = canManageOperationalData\([\s\S]+const canManageEvents = canManageOperationalEvents\(/,
    );
    expect(workWindowsPageSource).toMatch(
      /const canManage = canManageStaffWorkWindows\(resolution\.membership\.role\)[\s\S]+if \(!canManage\)/,
    );
    expect(workWindowsPageSource).toMatch(
      /listStaffWorkWindowsForWeek\({[\s\S]+includeInactive: true[\s\S]+organizationId: resolution\.organization\.id/,
    );
    expect(coveragePageSource).toMatch(
      /const canManageSchedule = canManageOperationalData\([\s\S]+includeCoverageTrace: canManageSchedule[\s\S]+organizationId: resolution\.organization\.id/,
    );
    expect(settingsPageSource).toMatch(
      /const canManageSettings = canManageTenantSettings\(resolution\.membership\.role\)[\s\S]+const canManageTimeSettings = canManageTimeTrackingSettings\(/,
    );

    const templateDenyIndex = templatesPageSource.indexOf(
      "if (!canManageTemplates)",
    );
    const templateLoadIndex = templatesPageSource.indexOf(
      "const supabase = await createClient();",
    );
    expect(templateDenyIndex).toBeGreaterThanOrEqual(0);
    expect(templateLoadIndex).toBeGreaterThan(templateDenyIndex);

    const statsDenyIndex = statsPageSource.indexOf(
      "if (!canManageOperationalData(role))",
    );
    const statsLoadIndex = statsPageSource.indexOf(
      "const referenceData = await getReferenceData(organizationId);",
    );
    expect(statsDenyIndex).toBeGreaterThanOrEqual(0);
    expect(statsLoadIndex).toBeGreaterThan(statsDenyIndex);
  });

  test("keeps base listing queries filtered by organization_id", () => {
    const centersSource = readProjectFile("src/app/(app)/app/centers/page.tsx");
    const classTypesSource = readProjectFile(
      "src/app/(app)/app/class-types/page.tsx",
    );
    const coachesSource = readProjectFile("src/app/(app)/app/coaches/page.tsx");
    const coverageSource = readProjectFile(
      "src/app/(app)/app/coverage/page.tsx",
    );
    const scheduleSource = readProjectFile(
      "src/app/(app)/app/schedule/page.tsx",
    );
    const statsSource = readProjectFile("src/app/(app)/app/stats/page.tsx");
    const templatesSource = readProjectFile(
      "src/app/(app)/app/templates/page.tsx",
    );

    expectTenantScopedQuery(centersSource, "getCenters", "centers");
    expectTenantScopedQuery(classTypesSource, "getClassTypes", "class_types");

    for (const [functionName, tableName] of [
      ["getMemberships", "organization_memberships"],
      ["getCoachProfiles", "coach_profiles"],
      ["getCenters", "centers"],
      ["getPersonProfiles", "person_profiles"],
      ["getTeamInvitations", "team_invitations"],
    ] as const) {
      expectTenantScopedQuery(coachesSource, functionName, tableName);
    }

    for (const [functionName, tableName] of [
      ["getScheduleBlocks", "schedule_blocks"],
      ["getCenters", "centers"],
      ["getClassTypes", "class_types"],
      ["getScheduleBlockAssignments", "schedule_block_assignments"],
    ] as const) {
      expectTenantScopedQuery(scheduleSource, functionName, tableName);
    }

    const scheduleCoachContextSource = getTsFunctionSource(
      scheduleSource,
      "getScheduleCoachContext",
    );
    for (const tableName of [
      "coach_profiles",
      "person_profiles",
      "organization_memberships",
    ]) {
      expect(scheduleCoachContextSource).toMatch(
        new RegExp(
          `\\.from\\("${tableName}"\\)[\\s\\S]+\\.eq\\("organization_id", organizationId\\)`,
        ),
      );
    }
    expect(
      getTsFunctionSource(scheduleSource, "getScheduleDocumentProgrammingByBlock"),
    ).toMatch(
      /listDocumentProgrammingForBlock\({[\s\S]+organizationId,[\s\S]+scheduleBlockId: block\.id/,
    );

    for (const [functionName, tableName] of [
      ["getScheduleTemplates", "schedule_templates"],
      ["getScheduleTemplateBlocks", "schedule_template_blocks"],
      ["getCenters", "centers"],
      ["getClassTypes", "class_types"],
    ] as const) {
      expectTenantScopedQuery(templatesSource, functionName, tableName);
    }
    const appliedTemplateSource = getTsFunctionSource(
      templatesSource,
      "getAppliedWeekTemplateSummaries",
    );
    expect(appliedTemplateSource).toMatch(
      /\.from\("schedule_blocks"\)[\s\S]+\.eq\("organization_id", organizationId\)/,
    );
    expect(appliedTemplateSource).toMatch(
      /\.from\("schedule_templates"\)[\s\S]+\.eq\("organization_id", organizationId\)/,
    );

    const templateCoachContextSource = getTsFunctionSource(
      templatesSource,
      "getScheduleCoachContext",
    );
    for (const tableName of [
      "coach_profiles",
      "person_profiles",
      "organization_memberships",
    ]) {
      expect(templateCoachContextSource).toMatch(
        new RegExp(
          `\\.from\\("${tableName}"\\)[\\s\\S]+\\.eq\\("organization_id", organizationId\\)`,
        ),
      );
    }

    const coverageDataSource = getTsFunctionSource(
      coverageSource,
      "getCoverageData",
    );
    for (const tableName of [
      "schedule_blocks",
      "centers",
      "class_types",
      "coach_profiles",
      "schedule_block_assignments",
      "person_profiles",
      "organization_memberships",
    ]) {
      expect(coverageDataSource).toMatch(
        new RegExp(
          `\\.from\\("${tableName}"\\)[\\s\\S]+\\.eq\\("organization_id", organizationId\\)`,
        ),
      );
    }

    const statsReferenceSource = getTsFunctionSource(
      statsSource,
      "getReferenceData",
    );
    for (const tableName of [
      "centers",
      "class_types",
      "coach_profiles",
      "person_profiles",
      "organization_memberships",
    ]) {
      expect(statsReferenceSource).toMatch(
        new RegExp(
          `\\.from\\("${tableName}"\\)[\\s\\S]+\\.eq\\("organization_id", organizationId\\)`,
        ),
      );
    }
    expectTenantScopedQuery(statsSource, "getScheduleBlocks", "schedule_blocks");
    expectTenantScopedQuery(
      statsSource,
      "getScheduleBlockAssignments",
      "schedule_block_assignments",
    );
  });

  test("keeps page management controls role-gated and away from sensitive surfaces", () => {
    const pageSources = [
      "src/app/(app)/app/centers/page.tsx",
      "src/app/(app)/app/coaches/page.tsx",
      "src/app/(app)/app/class-types/page.tsx",
      "src/app/(app)/app/schedule/page.tsx",
      "src/app/(app)/app/templates/page.tsx",
      "src/app/(app)/app/coverage/page.tsx",
      "src/app/(app)/app/stats/page.tsx",
      "src/app/(app)/app/settings/page.tsx",
    ].map((filePath) => readProjectFile(filePath));
    const operationalListingPageSource = pageSources.join("\n");
    const coachesPageSource = readProjectFile(
      "src/app/(app)/app/coaches/page.tsx",
    );
    const coveragePageSource = readProjectFile(
      "src/app/(app)/app/coverage/page.tsx",
    );
    const schedulePageSource = readProjectFile(
      "src/app/(app)/app/schedule/page.tsx",
    );
    const settingsPageSource = readProjectFile(
      "src/app/(app)/app/settings/page.tsx",
    );

    expect(coachesPageSource).toMatch(
      /const canManageAccess = canManageTeamAccess\(resolution\.membership\.role\)/,
    );
    expect(coachesPageSource).toMatch(
      /const canManageProfiles = canManageOperationalTeamProfiles\([\s\S]+resolution\.membership\.role/,
    );
    expect(coachesPageSource).toMatch(
      /const canDeleteProfiles = canDeleteOperationalTeamProfiles\([\s\S]+resolution\.membership\.role/,
    );
    expect(coachesPageSource).not.toMatch(
      /const canManageAccess = canManageOperationalData/,
    );
    expect(coachesPageSource).toMatch(
      /\{canManageAccess \? \([\s\S]+<TeamInvitationsSection/,
    );
    expect(coachesPageSource).toMatch(
      /<TeamUsersSection[\s\S]+canManageAccess={canManageAccess}/,
    );
    expect(coachesPageSource).toMatch(
      /<TeamUsersSection[\s\S]+canManageProfiles={canManageProfiles}/,
    );
    expect(coachesPageSource).toMatch(
      /<TeamUsersSection[\s\S]+canDeleteProfiles={canDeleteProfiles}/,
    );
    expect(coachesPageSource).toMatch(
      /hasProfileStatusParam[\s\S]+: "active"[\s\S]+profileStatusIsDefault: !hasProfileStatusParam/,
    );
    expect(coachesPageSource).toContain("Usuarios archivados");
    expect(coachesPageSource).toContain(
      "Archivar datos operativos",
    );
    expect(coachesPageSource).not.toContain("Accesos del equipo");
    expect(coachesPageSource).not.toContain("Fichas de entrenador");
    expect(coachesPageSource).not.toContain("Filtrar fichas");
    expect(coachesPageSource).not.toContain("Fuera de este corte");
    expect(coachesPageSource).not.toContain(
      "Esta pantalla prepara el equipo.",
    );

    expect(settingsPageSource).toMatch(
      /const canManageSettings = canManageTenantSettings\(resolution\.membership\.role\)/,
    );
    expect(settingsPageSource).toMatch(
      /const canManageTimeSettings = canManageTimeTrackingSettings\(/,
    );
    expect(settingsPageSource).not.toMatch(
      /canManageOperationalData|canManageTeamAccess/,
    );

    expect(coveragePageSource).toMatch(
      /<ResolveNow[\s\S]+canManageSchedule={canManageSchedule}/,
    );
    expect(coveragePageSource).toMatch(
      /<CoverageBlockDetailPanels[\s\S]+canManageSchedule={canManageSchedule}/,
    );
    expect(schedulePageSource).toMatch(
      /<WeeklyScheduleView[\s\S]+canCreateEvents={canManageEvents}[\s\S]+canManageSchedule={canManageSchedule}/,
    );
    expect(schedulePageSource).toMatch(
      /<ScheduleSlotCreateDialog[\s\S]+canCreateEvents={canCreateEvents}[\s\S]+canCreateScheduleBlocks={canManageSchedule}/,
    );

    expect(operationalListingPageSource).not.toMatch(
      /\b(?:center_manager|document_admin|payroll_manager)\b/,
    );
    expect(operationalListingPageSource).not.toMatch(
      /\b(?:document_access_grants|document_versions|document-files|storage_path|manage_grants|signature_evidence|sensitive_hr|requires_signature|center_time_location_settings|time_location_events)\b/,
    );
    expect(operationalListingPageSource).not.toMatch(
      /createSignedUrl|signedUrl|navigator\.geolocation|serviceWorker|service worker|PushManager|Notification|background sync|caches\.|CacheStorage|OpenAI|openai|anthropic|embeddings|pgvector|ai_/i,
    );
  });
});

test.describe("app shell navigation local source guardrails", () => {
  test("keeps shell navigation deriving sensitive entry points from role helpers", () => {
    const layoutSource = readProjectFile("src/app/(app)/app/layout.tsx");
    const navigationSource = readProjectFile(
      "src/components/layout/app-navigation.tsx",
    );
    const getNavigationRoleSource = getFunctionSource(
      navigationSource,
      "getNavigationRole",
    );

    expect(layoutSource).toMatch(
      /const memberships = await getActiveMemberships\(user\.id\)[\s\S]+const navigationMemberships = memberships\.map\(\(membership\) => \(\{[\s\S]+organizationId: membership\.organization\.id,[\s\S]+role: membership\.role/,
    );
    expect(layoutSource).toMatch(
      /<AppNavigation[\s\S]+memberships={navigationMemberships}[\s\S]+placement="sidebar"/,
    );
    expect(layoutSource).toMatch(
      /<AppNavigation[\s\S]+memberships={navigationMemberships}[\s\S]+placement="bottom"/,
    );

    expect(getNavigationRoleSource).toMatch(
      /memberships\.find\(\(membership\) => membership\.organizationId === organizationId\)/,
    );
    expect(getNavigationRoleSource).toMatch(
      /return selectedMembership\?\.role \?\? memberships\[0\]\?\.role \?\? null/,
    );
    expect(navigationSource).toMatch(
      /const currentRole = getNavigationRole\(\{ memberships, organizationId \}\)[\s\S]+const canManageOperational = currentRole[\s\S]+\? canManageOperationalData\(currentRole\)[\s\S]+: false/,
    );
    expect(navigationSource).toMatch(
      /const canManageWorkWindows = currentRole[\s\S]+\? canManageStaffWorkWindows\(currentRole\)[\s\S]+: false/,
    );
    expect(navigationSource).toMatch(
      /const visibleMainItems = mainItems\.filter\(\(item\) => \{[\s\S]+item\.href === "\/app\/coverage"[\s\S]+return canManageOperational/,
    );
    expect(navigationSource).toMatch(
      /item\.href === "\/app\/work-windows"[\s\S]+return canManageWorkWindows/,
    );
    expect(navigationSource).toMatch(
      /const visibleManagementItems = managementItems\.filter\(\(item\) => \{[\s\S]+item\.href === "\/app\/templates" \|\| item\.href === "\/app\/settings"[\s\S]+return canManageOperational/,
    );
    expect(navigationSource).toContain(
      'const secondaryMorePaths = ["/app/stats"];',
    );
    expect(navigationSource).not.toMatch(
      /\bcanManageTeamAccess\b|\bcanManageTenantSettings\b|\bcanManageTimeTrackingSettings\b/,
    );
    expect(navigationSource).not.toMatch(
      /\bcenter_manager\b|\bdocument_admin\b|\bpayroll_manager\b|\bstaff\b/,
    );
  });

  test("keeps /app/more management links behind operational management and coach entry points personal or read-only", () => {
    const moreSource = readProjectFile("src/app/(app)/app/more/page.tsx");
    const morePageSource = getDefaultAsyncFunctionSource(moreSource, "MorePage");
    const managementStart = moreSource.indexOf("{canManageOperational ? (");
    const coachBranchStart = moreSource.indexOf('title="Mi actividad"');
    const personalStart = moreSource.indexOf(
      '<section className="space-y-2.5 md:hidden">',
      coachBranchStart,
    );

    expect(morePageSource).toContain("const user = await getAuthenticatedUser();");
    expect(morePageSource).toContain('redirect(getLoginPath("/app/more"));');
    expect(morePageSource).toContain("getActiveMemberships(user.id)");
    expect(morePageSource).toContain("resolveActiveOrganization(");
    expect(morePageSource).toContain('basePath="/app/more"');
    expect(moreSource).toMatch(
      /const canManageOperational = canManageOperationalData\([\s\S]+resolution\.membership\.role/,
    );
    expect(managementStart).toBeGreaterThanOrEqual(0);
    expect(coachBranchStart).toBeGreaterThan(managementStart);
    expect(personalStart).toBeGreaterThan(coachBranchStart);

    const managementBranch = moreSource.slice(
      managementStart,
      coachBranchStart,
    );
    const coachBranch = moreSource.slice(coachBranchStart, personalStart);

    expect(managementBranch).toContain("getScheduleTemplatesPath(baseOptions)");
    expect(managementBranch).toContain("getWorkWindowsPath(baseOptions)");
    expect(managementBranch).toContain("getStatsPath(baseOptions)");
    expect(managementBranch).toContain("getSettingsPath(baseOptions)");
    expect(coachBranch).toContain(
      "getSchedulePath({ ...baseOptions, mineOnly: true })",
    );
    expect(coachBranch).toContain("getTimePath(baseOptions)");
    expect(coachBranch).toContain("getDocumentsPath(baseOptions)");
    expect(coachBranch).toContain("getCoachesPath(baseOptions)");
    expect(coachBranch).toContain("getCentersPath(baseOptions)");
    expect(coachBranch).toContain("getClassTypesPath(baseOptions)");
    expect(coachBranch).not.toMatch(
      /getCoveragePath|getStatsPath|getSettingsPath|getScheduleTemplatesPath|getWorkWindowsPath/,
    );
    expect(moreSource).not.toMatch(
      /\bcanManageTeamAccess\b|\bcanManageTenantSettings\b|\bcanManageTimeTrackingSettings\b/,
    );
    expect(moreSource).not.toMatch(
      /\bcenter_manager\b|\bdocument_admin\b|\bpayroll_manager\b|\bstaff\b/,
    );
  });

  test("keeps /app dashboard management actions away from read-only home and sensitive future surfaces", () => {
    const dashboardSource = readProjectFile("src/app/(app)/app/page.tsx");
    const appPageSource = getDefaultAsyncFunctionSource(
      dashboardSource,
      "AppPage",
    );
    const readOnlyHomeSource = getFunctionSource(
      dashboardSource,
      "ReadOnlyHome",
    );
    const surfaceLinksSource = getFunctionSource(
      dashboardSource,
      "SurfaceLinks",
    );

    expect(appPageSource).toMatch(
      /const canViewOperationalDashboard = canManageOperationalData\([\s\S]+resolution\.membership\.role/,
    );
    expect(appPageSource).toMatch(
      /canViewOperationalDashboard[\s\S]+\? getDashboardData\({[\s\S]+organizationId: resolution\.organization\.id[\s\S]+\)[\s\S]+: Promise\.resolve\(null\)/,
    );
    expect(appPageSource).toMatch(
      /\{dashboardData \? \([\s\S]+<AdminCoverageDashboard[\s\S]+\) : \([\s\S]+<ReadOnlyHome/,
    );
    expect(appPageSource).toMatch(
      /\{canViewOperationalDashboard \? \([\s\S]+<SurfaceLinks[\s\S]+\) : null\}/,
    );
    expect(appPageSource).toMatch(
      /const canReviewWeeklyApprovals = canReviewTimeTracking\([\s\S]+resolution\.membership\.role/,
    );
    expect(appPageSource).toMatch(
      /<WeeklyApprovalHomeSection[\s\S]+canReview={canReviewWeeklyApprovals}/,
    );

    expect(readOnlyHomeSource).toContain("mineOnly: true");
    expect(readOnlyHomeSource).toContain("getTimePath");
    expect(readOnlyHomeSource).toContain("getRequestsPath");
    expect(readOnlyHomeSource).toContain("getAccountPath");
    expect(readOnlyHomeSource).not.toMatch(
      /getCoveragePath|getCentersPath|getCoachesPath|getClassTypesPath|getScheduleTemplatesPath|getStatsPath|getSettingsPath/,
    );
    expect(surfaceLinksSource).toMatch(
      /getCoveragePath[\s\S]+getSchedulePath[\s\S]+getCentersPath[\s\S]+getCoachesPath[\s\S]+getClassTypesPath[\s\S]+canManageTemplates \? \(/,
    );

    const shellAndDashboardSource = [
      dashboardSource,
      readProjectFile("src/app/(app)/app/more/page.tsx"),
      readProjectFile("src/components/layout/app-navigation.tsx"),
    ].join("\n");

    expect(shellAndDashboardSource).not.toMatch(
      /\b(?:document_access_grants|document_versions|document-files|storage_path|manage_grants|signature_evidence|sensitive_hr|requires_signature|center_time_location_settings|time_location_events)\b/,
    );
    expect(shellAndDashboardSource).not.toMatch(
      /createSignedUrl|signedUrl|navigator\.geolocation|serviceWorker|service worker|PushManager|Notification|background sync|caches\.|CacheStorage|OpenAI|openai|anthropic|embeddings|pgvector|ai_/i,
    );
  });

  test("keeps next assigned identity pending states out of dead-end schedule redirects", () => {
    const dashboardSource = readProjectFile("src/app/(app)/app/page.tsx");
    const accountSource = readProjectFile("src/app/(app)/app/account/page.tsx");
    const fallbackStart = dashboardSource.indexOf(
      "function getNextAssignedFallbackCopy",
    );
    const nextAssignedCardStart = dashboardSource.indexOf(
      "function NextAssignedScheduleCard",
    );
    const nextAssignedCardEnd = dashboardSource.indexOf(
      "function WeeklyApprovalStatusBadge",
      nextAssignedCardStart,
    );
    const fallbackSource = dashboardSource.slice(
      fallbackStart,
      nextAssignedCardStart,
    );
    const nextAssignedCardSource = dashboardSource.slice(
      nextAssignedCardStart,
      nextAssignedCardEnd,
    );
    const missingPersonCardSource = getFunctionSource(
      accountSource,
      "PersonProfileMissingCard",
    );

    expect(fallbackStart).toBeGreaterThanOrEqual(0);
    expect(nextAssignedCardStart).toBeGreaterThan(fallbackStart);
    expect(nextAssignedCardEnd).toBeGreaterThan(nextAssignedCardStart);
    expect(fallbackSource).toContain("canManageAccountLinks");
    expect(fallbackSource).toContain("Pide a un Propietario o Administrador");
    expect(fallbackSource).not.toMatch(
      /Existe una ficha t.cnica[\s\S]+Por seguridad no se elige una clase/,
    );
    expect(nextAssignedCardSource).toMatch(
      /copy\.actionTarget === "account"[\s\S]+getAccountPath\(\{ organizationId \}\)/,
    );
    expect(nextAssignedCardSource).toMatch(
      /copy\.actionTarget === "team"[\s\S]+getCoachesPath\(\{ organizationId \}\)/,
    );
    expect(nextAssignedCardSource).toMatch(
      /copy\.actionTarget === "my_schedule"[\s\S]+getSchedulePath\(\{ mineOnly: true/,
    );
    expect(missingPersonCardSource).toContain("hasLinkedCoachProfile");
    expect(missingPersonCardSource).toContain(
      "complete la vinculacion desde Equipo",
    );
  });
});

test.describe("protected app route cache local source guardrails", () => {
  test("keeps /app protected by proxy and no-store headers", () => {
    const nextConfigSource = readProjectFile("next.config.ts");
    const proxySource = readProjectFile("src/proxy.ts");
    const supabaseProxySource = readProjectFile("src/lib/supabase/proxy.ts");

    expect(nextConfigSource).toMatch(
      /const privateAppHeaders = \[[\s\S]+key: "Cache-Control"[\s\S]+value: "no-store"/,
    );
    expect(nextConfigSource).toMatch(
      /source: "\/app"[\s\S]+headers: privateAppHeaders/,
    );
    expect(nextConfigSource).toMatch(
      /source: "\/app\/:path\*"[\s\S]+headers: privateAppHeaders/,
    );

    expect(proxySource).toContain('matcher: ["/app/:path*"]');
    expect(proxySource).toMatch(
      /export async function proxy\(request: NextRequest\)[\s\S]+return updateSession\(request\)/,
    );

    expect(supabaseProxySource).toMatch(
      /function withPrivateAppCacheHeaders[\s\S]+response\.headers\.set\("Cache-Control", "no-store"\)[\s\S]+response\.headers\.set\("Pragma", "no-cache"\)/,
    );
    expect(supabaseProxySource).toMatch(
      /if \(!user && request\.nextUrl\.pathname\.startsWith\("\/app"\)\)[\s\S]+return withPrivateAppCacheHeaders\(NextResponse\.redirect\(loginUrl\)\)/,
    );
    expect(supabaseProxySource).toMatch(
      /return withScheduleCenterPreference\(\s*request,\s*withPrivateAppCacheHeaders\(response\),\s*\)/,
    );
  });

  test("keeps protected app entry points dynamic and away from cache directives", () => {
    const protectedEntryFiles = collectSourceFiles(
      path.join(process.cwd(), "src/app/(app)/app"),
    ).filter((filePath) =>
      /(?:page|layout|route)\.tsx?$/.test(path.basename(filePath)),
    );

    expect(protectedEntryFiles.length).toBeGreaterThan(10);

    for (const filePath of protectedEntryFiles) {
      const relativePath = path.relative(process.cwd(), filePath);
      const source = readFileSync(filePath, "utf8");

      expect(
        source,
        `${relativePath} exports force-dynamic`,
      ).toContain('export const dynamic = "force-dynamic";');
      expect(source, `${relativePath} does not opt into revalidation`).not.toMatch(
        /export\s+const\s+revalidate\b/,
      );
      expect(source, `${relativePath} does not opt into fetch cache`).not.toMatch(
        /export\s+const\s+fetchCache\b/,
      );
      expect(source, `${relativePath} does not use unstable_cache`).not.toMatch(
        /\bunstable_cache\s*\(/,
      );
      expect(source, `${relativePath} does not use cache components`).not.toMatch(
        /(?:^|\n)\s*["']use cache(?::\s*(?:private|remote))?["'];?/,
      );
    }
  });

  test("keeps app path helpers online-only and away from sensitive file routes", () => {
    const appPathsSource = readProjectFile("src/lib/navigation/app-paths.ts");
    const appAndComponentSource = [
      ...collectSourceFiles(path.join(process.cwd(), "src/app")),
      ...collectSourceFiles(path.join(process.cwd(), "src/components")),
    ]
      .map((filePath) => readFileSync(filePath, "utf8"))
      .join("\n");
    const helperPaths = [...appPathsSource.matchAll(/getAppPath\("([^"]+)"/g)]
      .map((match) => match[1])
      .sort();

    expect(helperPaths.length).toBeGreaterThan(10);

    for (const helperPath of helperPaths) {
      expect(helperPath).toMatch(/^\/app(?:\/[a-z0-9-]+)?$/);
      expect(helperPath).not.toMatch(
        /\/versions\/|\/preview|\/download|\/storage|\/grants|\/signatures?/,
      );
      expect(helperPath).not.toMatch(
        /payroll|document_access|signature_evidence|requires_signature|location|geofence|native|push/i,
      );
    }

    expect(appPathsSource).not.toMatch(
      /createSignedUrl|signedUrl|storage_path|storage_bucket|document-files|document_access_grants|manage_grants|requires_signature|signature_evidence|center_time_location_settings|time_location_events|payroll/i,
    );
    expect(appAndComponentSource).not.toMatch(
      /navigator\.serviceWorker|serviceWorker\.register|self\.addEventListener\(["'](?:install|activate|fetch|push|sync)["']|workbox|PushManager|Notification|background sync|caches\.|CacheStorage/i,
    );
  });
});
