"use client";

import { AlertCircle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function ConsoleError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="grid min-h-[calc(100vh-9rem)] place-items-center">
      <div className="w-full max-w-xl space-y-4">
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertTitle>No se pudo cargar Console</AlertTitle>
          <AlertDescription>
            No mostramos detalles tecnicos en pantalla. Reintenta y revisa los
            logs si vuelve a fallar.
          </AlertDescription>
        </Alert>
        <Button onClick={reset} type="button" variant="outline">
          Reintentar
        </Button>
      </div>
    </div>
  );
}
