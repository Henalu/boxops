"use client";

import { useState, type FormEvent } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_PATTERN_ATTRIBUTE,
  PASSWORD_POLICY_DESCRIPTION,
  validatePasswordPolicy,
} from "@/lib/auth/password-policy";

type ResetPasswordFormProps = {
  action: (formData: FormData) => void | Promise<void>;
};

export function ResetPasswordForm({ action }: ResetPasswordFormProps) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [clientError, setClientError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const validation = validatePasswordPolicy(password);

    if (!validation.ok) {
      event.preventDefault();
      setClientError(validation.message);
      return;
    }

    if (password !== confirmPassword) {
      event.preventDefault();
      setClientError("Las contraseñas no coinciden.");
      return;
    }

    setClientError(null);
  }

  return (
    <form action={action} className="space-y-4" onSubmit={handleSubmit}>
      {clientError ? (
        <Alert variant="destructive">
          <AlertTitle>Revisa la contraseña</AlertTitle>
          <AlertDescription>{clientError}</AlertDescription>
        </Alert>
      ) : null}

      <label className="grid gap-2">
        <span className="text-sm font-medium">Nueva contraseña</span>
        <Input
          aria-describedby="password-policy"
          aria-invalid={clientError ? true : undefined}
          autoComplete="new-password"
          minLength={PASSWORD_MIN_LENGTH}
          name="password"
          onChange={(event) => setPassword(event.target.value)}
          pattern={PASSWORD_PATTERN_ATTRIBUTE}
          required
          title={PASSWORD_POLICY_DESCRIPTION}
          type="password"
          value={password}
        />
      </label>

      <label className="grid gap-2">
        <span className="text-sm font-medium">Confirmar contraseña</span>
        <Input
          aria-invalid={clientError ? true : undefined}
          autoComplete="new-password"
          name="confirmPassword"
          onChange={(event) => setConfirmPassword(event.target.value)}
          required
          type="password"
          value={confirmPassword}
        />
      </label>

      <p id="password-policy" className="text-sm leading-6 text-muted-foreground">
        {PASSWORD_POLICY_DESCRIPTION}
      </p>

      <Button className="w-full" type="submit">
        Guardar nueva contraseña
      </Button>
    </form>
  );
}
