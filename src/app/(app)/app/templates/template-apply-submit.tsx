"use client";

import { useId, useState } from "react";
import { Copy, TriangleAlert, X } from "lucide-react";

import { Button } from "@/components/ui/button";

export function TemplateApplySubmit({
  canApply,
  existingBlockCount,
  existingTemplateName,
  formId,
}: {
  canApply: boolean;
  existingBlockCount: number;
  existingTemplateName: string | null;
  formId: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const titleId = useId();
  const requiresConfirmation = Boolean(existingTemplateName);

  if (!requiresConfirmation) {
    return (
      <Button disabled={!canApply} type="submit">
        <Copy aria-hidden="true" />
        Aplicar a semana
      </Button>
    );
  }

  return (
    <>
      <Button
        disabled={!canApply}
        onClick={() => setIsOpen(true)}
        type="button"
      >
        <Copy aria-hidden="true" />
        Aplicar a semana
      </Button>

      {isOpen ? (
        <div
          aria-labelledby={titleId}
          aria-modal="true"
          className="fixed inset-0 z-50 grid place-items-center bg-background/80 px-4 backdrop-blur-sm"
          role="dialog"
        >
          <div className="w-full max-w-md rounded-lg border border-border bg-card p-4 text-card-foreground shadow-lg">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-800">
                  <TriangleAlert aria-hidden="true" className="size-4" />
                </span>
                <div className="min-w-0">
                  <h2
                    className="text-base font-semibold tracking-tight"
                    id={titleId}
                  >
                    Sustituir plantilla aplicada
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    Esta semana ya tiene la plantilla {existingTemplateName}{" "}
                    aplicada
                    {existingBlockCount > 0
                      ? ` con ${existingBlockCount} bloque${
                          existingBlockCount === 1 ? "" : "s"
                        }`
                      : ""}
                    . Si confirmas, solo se sustituira esta semana.
                  </p>
                </div>
              </div>
              <button
                aria-label="Cerrar"
                className="rounded-md p-2 text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                onClick={() => setIsOpen(false)}
                type="button"
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            </div>
            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                onClick={() => setIsOpen(false)}
                type="button"
                variant="outline"
              >
                Cancelar
              </Button>
              <Button
                form={formId}
                name="replaceExisting"
                type="submit"
                value="1"
              >
                Sustituir solo esta semana
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
