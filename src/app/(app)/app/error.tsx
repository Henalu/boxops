"use client";

import { AlertTriangle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <Alert variant="destructive">
      <AlertTriangle aria-hidden="true" className="size-4" />
      <AlertTitle>No se ha podido cargar el panel</AlertTitle>
      <AlertDescription>
        Reintenta la carga. Si vuelve a fallar, revisa que la sesión, el tenant
        y las lecturas de horario sigan disponibles.
      </AlertDescription>
      <div className="mt-3">
        <Button onClick={reset} size="sm" type="button" variant="outline">
          Reintentar
        </Button>
      </div>
      {error.digest ? (
        <p className="mt-2 font-mono text-xs text-destructive/80">
          {error.digest}
        </p>
      ) : null}
    </Alert>
  );
}
