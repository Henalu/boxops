import Link from "next/link";
import { ArrowLeft, KeyRound, ShieldCheck } from "lucide-react";

import { updatePassword } from "./actions";
import { ResetPasswordForm } from "./reset-password-form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { isPasswordChangeRequired } from "@/lib/auth/required-password-change";
import { getAuthenticatedUser } from "@/lib/auth/tenant";

export const dynamic = "force-dynamic";

type ResetPasswordPageProps = {
  searchParams: Promise<{
    error?: string | string[];
    reason?: string | string[];
  }>;
};

const errorMessages: Record<string, string> = {
  "admin-client":
    "No se puede confirmar el cambio obligatorio en este entorno. Pide a un administrador que revise la configuracion.",
  callback: "El enlace no se ha podido validar. Solicita uno nuevo.",
  "metadata-failed":
    "La contraseña se ha cambiado, pero no se ha podido cerrar el cambio obligatorio. Vuelve a intentarlo o pide revision.",
  "password-mismatch": "Las contraseñas no coinciden.",
  "password-missing-letter": "La contraseña debe incluir al menos una letra.",
  "password-missing-number": "La contraseña debe incluir al menos un número.",
  "password-too-short": "La contraseña debe tener al menos 8 caracteres.",
  "update-failed":
    "No se ha podido guardar la nueva contraseña. Solicita otro enlace si ha caducado.",
};

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ResetPasswordPage({
  searchParams,
}: ResetPasswordPageProps) {
  const params = await searchParams;
  const error = getParam(params.error);
  const reason = getParam(params.reason);
  const user = await getAuthenticatedUser();
  const firstLoginReset =
    reason === "first-login" || (user ? isPasswordChangeRequired(user) : false);

  return (
    <main className="flex min-h-screen items-center bg-background px-4 py-12 text-foreground sm:px-6">
      <section className="mx-auto grid w-full max-w-5xl gap-8 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-center">
        <div className="max-w-2xl">
          <p className="text-sm font-medium uppercase tracking-[0.14em] text-muted-foreground">
            BoxOps
          </p>
          <h1 className="mt-4 text-3xl font-semibold tracking-normal sm:text-5xl">
            {firstLoginReset
              ? "Cambia tu contraseña temporal."
              : "Establece una nueva contraseña."}
          </h1>
          <p className="mt-5 text-base leading-7 text-muted-foreground">
            {firstLoginReset
              ? "Tu cuenta se creó con una contraseña conocida por otra persona. Cámbiala antes de entrar en BoxOps."
              : "El enlace de Supabase abre una sesión temporal para cambiar la contraseña de forma segura."}
          </p>
        </div>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound aria-hidden="true" className="size-4" />
              Nueva contraseña
            </CardTitle>
            <CardDescription>
              Usa una contraseña que cumpla la regla mínima de BoxOps.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {error && errorMessages[error] ? (
              <Alert variant="destructive">
                <AlertTitle>No se ha guardado la contraseña</AlertTitle>
                <AlertDescription>{errorMessages[error]}</AlertDescription>
              </Alert>
            ) : null}

            {user ? (
              <>
                <Alert>
                  <ShieldCheck aria-hidden="true" className="size-4" />
                  <AlertTitle>
                    {firstLoginReset ? "Cambio obligatorio" : "Enlace validado"}
                  </AlertTitle>
                  <AlertDescription>
                    Al guardar la contraseña cerraremos esta sesión y volverás
                    al login.
                  </AlertDescription>
                </Alert>

                <ResetPasswordForm action={updatePassword} />
              </>
            ) : (
              <Alert>
                <ShieldCheck aria-hidden="true" className="size-4" />
                <AlertTitle>Enlace pendiente de validar</AlertTitle>
                <AlertDescription>
                  {firstLoginReset
                    ? "Inicia sesión con tu contraseña temporal para abrir el cambio obligatorio."
                    : "Abre esta pantalla desde el email de recuperación o solicita un enlace nuevo."}
                </AlertDescription>
              </Alert>
            )}

            <div className="grid gap-2">
              <Button asChild className="w-full" variant="outline">
                <Link href="/forgot-password">Solicitar otro enlace</Link>
              </Button>
              <Button asChild className="w-full" variant="ghost">
                <Link href="/login">
                  <ArrowLeft aria-hidden="true" />
                  Volver al login
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
