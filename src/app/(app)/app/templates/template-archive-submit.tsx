"use client";

import { useId, useState } from "react";
import { Archive, TriangleAlert, X } from "lucide-react";

import { Button } from "@/components/ui/button";

export function TemplateArchiveSubmit({
  formId,
  templateName,
}: {
  formId: string;
  templateName: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const titleId = useId();

  return (
    <>
      <Button
        onClick={() => setIsOpen(true)}
        size="sm"
        type="button"
        variant="destructive"
      >
        <Archive aria-hidden="true" />
        Eliminar plantilla
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
              <div className="flex min-w-0 items-start gap-3">
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                  <TriangleAlert aria-hidden="true" className="size-4" />
                </span>
                <div className="min-w-0">
                  <h2
                    className="text-base font-semibold tracking-tight"
                    id={titleId}
                  >
                    Archivar plantilla
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    Esta plantilla se archivará durante 30 días antes de
                    eliminarse definitivamente. Durante ese tiempo podrás
                    recuperarla si lo necesitas. ¿Quieres continuar?
                  </p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    Los horarios ya generados desde la plantilla {templateName}{" "}
                    no se borrarán ni se modificarán.
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
              <Button form={formId} type="submit" variant="destructive">
                Archivar 30 días
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
