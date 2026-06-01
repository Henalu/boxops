"use client";

import { useFormStatus } from "react-dom";
import { Clock3 } from "lucide-react";

import { Button } from "@/components/ui/button";

export function RequestExpireSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button
      disabled={pending}
      onClick={(event) => {
        if (
          !window.confirm(
            "¿Cerrar esta solicitud como vencida o no accionable? La bandeja se recargará con el estado actualizado.",
          )
        ) {
          event.preventDefault();
        }
      }}
      size="sm"
      type="submit"
      variant="outline"
    >
      <Clock3 aria-hidden="true" />
      {pending ? "Cerrando..." : "Cerrar vencida"}
    </Button>
  );
}
