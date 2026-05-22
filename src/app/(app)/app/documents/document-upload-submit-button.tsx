"use client";

import { UploadCloud } from "lucide-react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";

export function DocumentUploadSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button className="w-full sm:w-auto" disabled={pending} type="submit">
      <UploadCloud aria-hidden="true" />
      {pending ? "Subiendo..." : "Crear y subir"}
    </Button>
  );
}
