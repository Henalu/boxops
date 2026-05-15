"use client";

import { useFormStatus } from "react-dom";
import { PlusCircle } from "lucide-react";

import { Button } from "@/components/ui/button";

export function RequestCreationSubmitButton({
  disabled = false,
}: {
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <Button disabled={pending || disabled} type="submit">
      <PlusCircle aria-hidden="true" />
      {pending
        ? "Enviando..."
        : disabled
          ? "Elige destinatarios"
          : "Enviar solicitud"}
    </Button>
  );
}
