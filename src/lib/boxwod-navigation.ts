export type BoxWodActionMode = "disabled" | "enabled" | "hidden";

type BoxWodProgrammingContext = {
  appUrl: string;
  centerId?: string | null;
  classTypeId?: string | null;
  date: string;
  organizationId: string;
};

export function normalizeBoxWodAppUrl(value: string | null | undefined) {
  const trimmedValue = value?.trim();

  if (!trimmedValue) {
    return null;
  }

  const candidate = /^https?:\/\//i.test(trimmedValue)
    ? trimmedValue
    : `https://${trimmedValue}`;

  try {
    const url = new URL(candidate);

    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    ) {
      return null;
    }

    return url.origin;
  } catch {
    return null;
  }
}

export function getConfiguredBoxWodAppUrl() {
  return normalizeBoxWodAppUrl(process.env.BOXWOD_APP_URL);
}

export function buildBoxWodProgrammingUrl({
  appUrl,
  centerId,
  classTypeId,
  date,
  organizationId,
}: BoxWodProgrammingContext) {
  const normalizedAppUrl = normalizeBoxWodAppUrl(appUrl);

  if (!normalizedAppUrl) {
    return null;
  }

  const url = new URL("/programacion", normalizedAppUrl);

  url.searchParams.set("org", organizationId);
  url.searchParams.set("date", date);

  if (centerId) {
    url.searchParams.set("center", centerId);
  }

  if (classTypeId) {
    url.searchParams.set("classType", classTypeId);
  }

  return url.toString();
}

export function resolveBoxWodActionMode({
  canProgram,
  hasConfiguredAppUrl,
  nodeEnv = process.env.NODE_ENV,
}: {
  canProgram: boolean;
  hasConfiguredAppUrl: boolean;
  nodeEnv?: string;
}): BoxWodActionMode {
  if (!canProgram) {
    return "hidden";
  }

  if (hasConfiguredAppUrl) {
    return "enabled";
  }

  return nodeEnv === "production" ? "hidden" : "disabled";
}
