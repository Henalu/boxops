import type { Json } from "@/types/supabase";

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const MIN_PRIMARY_CONTRAST = 4.5;
const LIGHT_FOREGROUND = "#ffffff";
const DARK_FOREGROUND = "#111827";

export type OrganizationSettingsValues = {
  name: string;
  accentColor: string | null;
};

export type OrganizationSettingsValidationResult =
  | {
      ok: true;
      values: OrganizationSettingsValues;
    }
  | {
      ok: false;
      error: "invalid-accent-color" | "missing-name";
    };

export type ResolvedOrganizationTheme = {
  accentColor: string | null;
  foregroundColor: string | null;
  isApplied: boolean;
};

export type TenantThemeCssVariables = Record<`--${string}`, string>;

function isJsonObject(value: Json | undefined): value is Record<string, Json> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

export function normalizeHexColor(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const normalized = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;

  return HEX_COLOR_PATTERN.test(normalized) ? normalized.toLowerCase() : null;
}

function hexToRgb(hex: string) {
  const value = hex.replace("#", "");

  return {
    b: Number.parseInt(value.slice(4, 6), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    r: Number.parseInt(value.slice(0, 2), 16),
  };
}

function toLinearChannel(value: number) {
  const channel = value / 255;

  return channel <= 0.03928
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4;
}

function getRelativeLuminance(hex: string) {
  const { b, g, r } = hexToRgb(hex);

  return (
    0.2126 * toLinearChannel(r) +
    0.7152 * toLinearChannel(g) +
    0.0722 * toLinearChannel(b)
  );
}

function getContrastRatio(colorA: string, colorB: string) {
  const luminanceA = getRelativeLuminance(colorA);
  const luminanceB = getRelativeLuminance(colorB);
  const lighter = Math.max(luminanceA, luminanceB);
  const darker = Math.min(luminanceA, luminanceB);

  return (lighter + 0.05) / (darker + 0.05);
}

function getReadableForegroundColor(backgroundColor: string) {
  const lightContrast = getContrastRatio(backgroundColor, LIGHT_FOREGROUND);
  const darkContrast = getContrastRatio(backgroundColor, DARK_FOREGROUND);

  return lightContrast >= darkContrast ? LIGHT_FOREGROUND : DARK_FOREGROUND;
}

export function resolveOrganizationTheme(
  themeConfig: Json | undefined,
): ResolvedOrganizationTheme {
  if (!isJsonObject(themeConfig)) {
    return {
      accentColor: null,
      foregroundColor: null,
      isApplied: false,
    };
  }

  const rawAccentColor = themeConfig.accentColor;
  const accentColor =
    typeof rawAccentColor === "string" ? normalizeHexColor(rawAccentColor) : null;

  if (!accentColor) {
    return {
      accentColor: null,
      foregroundColor: null,
      isApplied: false,
    };
  }

  const foregroundColor = getReadableForegroundColor(accentColor);
  const contrast = getContrastRatio(accentColor, foregroundColor);

  if (contrast < MIN_PRIMARY_CONTRAST) {
    return {
      accentColor,
      foregroundColor,
      isApplied: false,
    };
  }

  return {
    accentColor,
    foregroundColor,
    isApplied: true,
  };
}

export function getTenantThemeCssVariables(
  themeConfig: Json | undefined,
): TenantThemeCssVariables | undefined {
  const theme = resolveOrganizationTheme(themeConfig);

  if (!theme.isApplied || !theme.accentColor || !theme.foregroundColor) {
    return undefined;
  }

  const subtleAccent = `color-mix(in oklch, ${theme.accentColor} 12%, var(--background))`;
  const mutedAccent = `color-mix(in oklch, ${theme.accentColor} 18%, var(--background))`;
  const accentForeground = `color-mix(in oklch, ${theme.accentColor} 64%, var(--foreground))`;

  return {
    "--accent": subtleAccent,
    "--accent-foreground": accentForeground,
    "--primary": theme.accentColor,
    "--primary-foreground": theme.foregroundColor,
    "--secondary": mutedAccent,
    "--secondary-foreground": accentForeground,
    "--sidebar-accent": subtleAccent,
    "--sidebar-accent-foreground": accentForeground,
    "--sidebar-primary": theme.accentColor,
    "--sidebar-primary-foreground": theme.foregroundColor,
  };
}

export function validateOrganizationSettingsForm(
  formData: FormData,
): OrganizationSettingsValidationResult {
  const name = getFormString(formData, "name");
  const rawAccentColor = getFormString(formData, "accentColor");
  const accentColor = rawAccentColor ? normalizeHexColor(rawAccentColor) : null;

  if (!name) {
    return {
      ok: false,
      error: "missing-name",
    };
  }

  if (rawAccentColor && !accentColor) {
    return {
      ok: false,
      error: "invalid-accent-color",
    };
  }

  return {
    ok: true,
    values: {
      accentColor,
      name,
    },
  };
}

export function buildOrganizationThemeConfig(
  currentThemeConfig: Json | undefined,
  accentColor: string | null,
): Json {
  const nextThemeConfig: Record<string, Json> = isJsonObject(currentThemeConfig)
    ? { ...currentThemeConfig }
    : {};

  nextThemeConfig.version = 1;

  if (accentColor) {
    nextThemeConfig.accentColor = accentColor;
  } else {
    delete nextThemeConfig.accentColor;
  }

  return nextThemeConfig;
}
