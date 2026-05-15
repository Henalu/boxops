"use client";

import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

const DEFAULT_COLOR_PALETTE = [
  { label: "Azul", value: "#2563eb" },
  { label: "Verde", value: "#059669" },
  { label: "Amarillo", value: "#ffcd00" },
  { label: "Rojo", value: "#dc2626" },
  { label: "Violeta", value: "#7c3aed" },
  { label: "Cian", value: "#0891b2" },
  { label: "Naranja", value: "#ea580c" },
  { label: "Gris", value: "#64748b" },
] as const;

function normalizeHexColor(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  const trimmed = value.trim();
  const normalized = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;

  return HEX_COLOR_PATTERN.test(normalized) ? normalized.toLowerCase() : trimmed;
}

function getSafeColor(value: string) {
  const normalized = normalizeHexColor(value);

  return HEX_COLOR_PATTERN.test(normalized) ? normalized : null;
}

export function ColorPaletteField({
  defaultValue,
  label,
  name,
  paletteLabel = "Paleta de color",
  placeholder = "#2563eb",
}: {
  defaultValue?: string | null;
  label: string;
  name: string;
  paletteLabel?: string;
  placeholder?: string;
}) {
  const [value, setValue] = useState(() => normalizeHexColor(defaultValue));
  const safeColor = useMemo(() => getSafeColor(value), [value]);
  const nativePickerValue = safeColor ?? DEFAULT_COLOR_PALETTE[0].value;

  return (
    <div className="grid gap-2">
      <span className="text-sm font-medium">{label}</span>

      <div className="grid gap-2">
        <div className="flex flex-wrap gap-2" aria-label={paletteLabel}>
          {DEFAULT_COLOR_PALETTE.map((color) => {
            const selected = safeColor === color.value;

            return (
              <button
                aria-label={color.label}
                aria-pressed={selected}
                className={cn(
                  "size-8 rounded-full border border-border transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  selected &&
                    "ring-2 ring-ring ring-offset-2 ring-offset-background",
                )}
                key={color.value}
                onClick={() => setValue(color.value)}
                style={{ backgroundColor: color.value }}
                title={color.label}
                type="button"
              />
            );
          })}

          <button
            className="min-h-8 rounded-lg border border-border px-3 text-sm text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            onClick={() => setValue("")}
            type="button"
          >
            Sin color
          </button>
        </div>

        <div className="grid gap-2 sm:grid-cols-[auto_minmax(0,1fr)]">
          <label className="flex min-h-11 items-center gap-2 rounded-lg border border-border px-2.5 md:min-h-9">
            <span
              aria-hidden="true"
              className="size-4 shrink-0 rounded-full border border-border"
              style={safeColor ? { backgroundColor: safeColor } : undefined}
            />
            <input
              aria-label={`Selector visual: ${label}`}
              className="size-7 cursor-pointer rounded-md border-0 bg-transparent p-0"
              onChange={(event) => setValue(event.currentTarget.value)}
              type="color"
              value={nativePickerValue}
            />
          </label>

          <Input
            aria-label={`${label} hexadecimal`}
            maxLength={7}
            name={name}
            onChange={(event) => setValue(event.currentTarget.value)}
            pattern="#?[0-9a-fA-F]{6}"
            placeholder={placeholder}
            value={value}
          />
        </div>
      </div>
    </div>
  );
}
