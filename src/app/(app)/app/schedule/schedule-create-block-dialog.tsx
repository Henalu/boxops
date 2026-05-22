"use client";

import * as React from "react";
import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

type ScheduleCreateBlockDialogProps = {
  children: React.ReactNode;
  triggerDescription: string;
};

export function ScheduleCreateBlockDialog({
  children,
  triggerDescription,
}: ScheduleCreateBlockDialogProps) {
  const [open, setOpen] = React.useState(false);
  const titleId = React.useId();
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);

  const closeDialog = React.useCallback(() => {
    setOpen(false);
    window.requestAnimationFrame(() => {
      triggerRef.current?.focus();
    });
  }, []);

  React.useEffect(() => {
    if (!open) {
      return;
    }

    const panel = panelRef.current;
    panel?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDialog();
        return;
      }

      if (event.key !== "Tab" || !panel) {
        return;
      }

      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((element) => !element.hasAttribute("disabled"));

      if (focusable.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const firstElement = focusable[0];
      const lastElement = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeDialog, open]);

  return (
    <>
      <Button
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => {
          setOpen(true);
        }}
        ref={triggerRef}
        size="sm"
        title={triggerDescription}
        type="button"
      >
        <Plus aria-hidden="true" />
        Nuevo bloque
      </Button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 backdrop-blur-sm sm:items-center sm:p-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeDialog();
            }
          }}
        >
          <div
            aria-labelledby={titleId}
            aria-modal="true"
            className="max-h-[calc(100vh-1.5rem)] w-full max-w-5xl overflow-y-auto rounded-xl border border-border bg-background shadow-lg outline-none"
            ref={panelRef}
            role="dialog"
            tabIndex={-1}
          >
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <h3 className="text-base font-semibold tracking-tight" id={titleId}>
                Nuevo bloque
              </h3>
              <Button
                aria-label="Cerrar"
                onClick={closeDialog}
                size="icon"
                type="button"
                variant="ghost"
              >
                <X aria-hidden="true" />
              </Button>
            </div>
            <div className="px-4 py-4">{children}</div>
          </div>
        </div>
      ) : null}
    </>
  );
}
