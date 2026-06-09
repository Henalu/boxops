"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

import { ClassTypeIcon } from "@/components/features/class-type-icon";
import {
  CLASS_TYPE_ICON_OPTIONS,
  getClassTypeIconKey,
  getClassTypeIconLabel,
} from "@/lib/class-type-icons";

export function ClassTypeIconSelect({
  defaultValue,
  name = "iconKey",
}: {
  defaultValue?: string | null;
  name?: string;
}) {
  const labelId = useId();
  const triggerId = useId();
  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedIconKey, setSelectedIconKey] = useState(() =>
    getClassTypeIconKey(defaultValue),
  );
  const [isOpen, setIsOpen] = useState(false);
  const selectedLabel = getClassTypeIconLabel(selectedIconKey);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        !containerRef.current?.contains(event.target)
      ) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div className="relative grid gap-2" ref={containerRef}>
      <label className="text-sm font-medium" id={labelId}>
        Icono
      </label>
      <input name={name} type="hidden" value={selectedIconKey} />
      <button
        aria-controls={listboxId}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-labelledby={`${labelId} ${triggerId}`}
        className="flex h-11 min-w-0 items-center gap-2 rounded-lg border border-input bg-background/70 px-2.5 text-left text-sm transition-colors hover:bg-muted/45 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:h-9"
        id={triggerId}
        onClick={() => setIsOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "Enter") {
            event.preventDefault();
            setIsOpen(true);
          }
        }}
        type="button"
      >
        <span className="grid size-7 shrink-0 place-items-center rounded-md border border-border bg-background text-foreground md:size-6">
          <ClassTypeIcon className="size-4" iconKey={selectedIconKey} />
        </span>
        <span className="min-w-0 flex-1 truncate">{selectedLabel}</span>
        <ChevronDown
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground"
        />
      </button>

      {isOpen ? (
        <div
          aria-labelledby={labelId}
          className="absolute left-0 right-0 top-full z-50 mt-2 max-h-72 overflow-y-auto rounded-lg border border-border bg-background p-1 shadow-lg"
          id={listboxId}
          role="listbox"
        >
          {CLASS_TYPE_ICON_OPTIONS.map((option) => {
            const selected = option.key === selectedIconKey;

            return (
              <button
                aria-selected={selected}
                className={[
                  "flex min-h-10 w-full min-w-0 items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
                  selected
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted/70 focus-visible:bg-muted/70",
                ].join(" ")}
                key={option.key}
                onClick={() => {
                  setSelectedIconKey(getClassTypeIconKey(option.key));
                  setIsOpen(false);
                }}
                role="option"
                type="button"
              >
                <span
                  className={[
                    "grid size-7 shrink-0 place-items-center rounded-md border",
                    selected
                      ? "border-primary-foreground/25 bg-primary-foreground/10"
                      : "border-border bg-background",
                  ].join(" ")}
                >
                  <ClassTypeIcon className="size-4" iconKey={option.key} />
                </span>
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                {selected ? (
                  <Check aria-hidden="true" className="size-4 shrink-0" />
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
