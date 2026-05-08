import Link from "next/link";
import { ArrowLeft, MailCheck } from "lucide-react";

import { requestPasswordReset } from "./actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export const dynamic = "force-dynamic";

type ForgotPasswordPageProps = {
  searchParams: Promise<{
    status?: string | string[];
  }>;
};

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ForgotPasswordPage({
  searchParams,
}: ForgotPasswordPageProps) {
  const params = await searchParams;
  const status = getParam(params.status);
  const isSent = status === "sent";

  return (
    <main className="flex min-h-screen items-center bg-background px-4 py-12 text-foreground sm:px-6">
      <section className="mx-auto grid w-full max-w-5xl gap-8 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-center">
        <div className="max-w-2xl">
          <p className="text-sm font-medium uppercase tracking-[0.14em] text-muted-foreground">
            BoxOps
          </p>
          <h1 className="mt-4 text-3xl font-semibold tracking-normal sm:text-5xl">
            Recupera el acceso sin exponer datos.
          </h1>
          <p className="mt-5 text-base leading-7 text-muted-foreground">
            Te guiaremos con un enlace seguro si el email puede recibir acceso
            en BoxOps.
          </p>
        </div>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Recuperar contrasena</CardTitle>
            <CardDescription>
              Escribe el email de tu cuenta y revisa tu bandeja de entrada.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {isSent ? (
              <Alert>
                <MailCheck aria-hidden="true" className="size-4" />
                <AlertTitle>Revisa tu email</AlertTitle>
                <AlertDescription>
                  Si el email corresponde a una cuenta con acceso, enviaremos
                  instrucciones para restablecer la contrasena.
                </AlertDescription>
              </Alert>
            ) : null}

            <form action={requestPasswordReset} className="space-y-4">
              <label className="grid gap-2">
                <span className="text-sm font-medium">Email</span>
                <Input
                  autoComplete="email"
                  inputMode="email"
                  name="email"
                  placeholder="nombre@box.com"
                  required
                  type="email"
                />
              </label>

              <Button className="w-full" type="submit">
                Enviar instrucciones
              </Button>
            </form>

            <Button asChild className="w-full" variant="ghost">
              <Link href="/login">
                <ArrowLeft aria-hidden="true" />
                Volver al login
              </Link>
            </Button>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
