"use client";

import { useFormStatus } from "react-dom";
import { CheckCircle2, Hourglass, Send, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";

type AbsenceActionIcon = "approve" | "cancel" | "expire" | "reject";
type AbsenceActionVariant = "default" | "destructive" | "ghost" | "outline" | "secondary";

const actionIcons = {
  approve: CheckCircle2,
  cancel: XCircle,
  expire: Hourglass,
  reject: XCircle,
} satisfies Record<AbsenceActionIcon, typeof CheckCircle2>;

export function AbsenceCreationSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button disabled={pending} type="submit">
      <Send aria-hidden="true" />
      {pending ? "Enviando..." : "Enviar solicitud"}
    </Button>
  );
}

export function AbsenceActionSubmitButton({
  confirmMessage,
  icon,
  label,
  pendingLabel,
  variant = "default",
}: {
  confirmMessage: string;
  icon: AbsenceActionIcon;
  label: string;
  pendingLabel: string;
  variant?: AbsenceActionVariant;
}) {
  const { pending } = useFormStatus();
  const Icon = actionIcons[icon];

  return (
    <Button
      disabled={pending}
      onClick={(event) => {
        if (!window.confirm(confirmMessage)) {
          event.preventDefault();
        }
      }}
      size="sm"
      type="submit"
      variant={variant}
    >
      <Icon aria-hidden="true" />
      {pending ? pendingLabel : label}
    </Button>
  );
}
