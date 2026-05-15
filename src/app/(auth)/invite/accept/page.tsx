import Link from "next/link";

import {
  acceptTeamInvitation,
  signUpAndAcceptTeamInvitation,
} from "./actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  PASSWORD_PATTERN_ATTRIBUTE,
  PASSWORD_POLICY_DESCRIPTION,
} from "@/lib/auth/password-policy";
import { getLoginPath } from "@/lib/auth/redirects";
import { getAuthenticatedUser } from "@/lib/auth/tenant";
import { createClient } from "@/lib/supabase/server";
import {
  getInvitationAcceptPath,
  normalizeInvitationEmail,
} from "@/lib/team-invitations";
import { isPostgresUuid } from "@/lib/uuid";

export const dynamic = "force-dynamic";

type AcceptInvitationPageProps = {
  searchParams: Promise<{
    error?: string | string[];
    invitationId?: string | string[];
    status?: string | string[];
    token?: string | string[];
  }>;
};

const errorMessages: Record<string, string> = {
  "accept-failed":
    "No se ha podido aceptar la invitacion. Revisa que el email de la cuenta coincide con la invitacion.",
  "invalid-invitation": "La invitacion no existe, ha caducado o ya no esta disponible.",
  "password-missing-letter": "La contrasena debe incluir al menos una letra.",
  "password-missing-number": "La contrasena debe incluir al menos un numero.",
  "password-too-short": "La contrasena debe tener al menos 8 caracteres.",
  "signup-failed":
    "No se ha podido crear la cuenta. Si ya tienes cuenta, inicia sesion para aceptar la invitacion.",
};

const statusMessages: Record<string, string> = {
  "check-email":
    "Revisa tu email para confirmar la cuenta. Despues vuelve a abrir esta invitacion o entra con tu nueva cuenta.",
};

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function InvitationUnavailable({
  message,
}: {
  message: string;
}) {
  return (
    <main className="flex min-h-screen items-center bg-slate-50 px-4 py-12 text-slate-950 sm:px-6">
      <section className="mx-auto w-full max-w-xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-medium uppercase tracking-[0.14em] text-slate-500">
          BoxOps
        </p>
        <h1 className="mt-4 text-2xl font-semibold tracking-normal">
          Invitacion no disponible
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">{message}</p>
        <Link
          className="mt-5 inline-flex rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-100"
          href="/login"
        >
          Ir al login
        </Link>
      </section>
    </main>
  );
}

export default async function AcceptInvitationPage({
  searchParams,
}: AcceptInvitationPageProps) {
  const params = await searchParams;
  const invitationId = getParam(params.invitationId);
  const token = getParam(params.token);
  const error = getParam(params.error);
  const status = getParam(params.status);

  if (!invitationId || !token || !isPostgresUuid(invitationId)) {
    return (
      <InvitationUnavailable message="El enlace no contiene una invitacion valida." />
    );
  }

  const supabase = await createClient();
  const { data, error: previewError } = await supabase.rpc(
    "get_team_invitation_public",
    {
      raw_invitation_token: token,
      target_invitation_id: invitationId,
    },
  );
  const [invitation] = data ?? [];

  if (previewError || !invitation) {
    return (
      <InvitationUnavailable message="El enlace no coincide con ninguna invitacion activa." />
    );
  }

  const invitePath = getInvitationAcceptPath(invitationId, token);
  const user = await getAuthenticatedUser();
  const userEmail = normalizeInvitationEmail(user?.email ?? "");
  const invitationEmail = normalizeInvitationEmail(invitation.email);
  const canAcceptWithCurrentSession = Boolean(user && userEmail === invitationEmail);
  const invitationIsPending = invitation.status === "sent";

  return (
    <main className="flex min-h-screen items-center bg-slate-50 px-4 py-12 text-slate-950 sm:px-6">
      <section className="mx-auto grid w-full max-w-5xl gap-8 lg:grid-cols-[1fr_420px] lg:items-center">
        <div className="max-w-2xl">
          <p className="text-sm font-medium uppercase tracking-[0.14em] text-slate-500">
            BoxOps
          </p>
          <h1 className="mt-4 text-3xl font-semibold tracking-normal sm:text-5xl">
            Acepta tu invitacion.
          </h1>
          <p className="mt-5 text-base leading-7 text-slate-700">
            {invitation.organization_name} ya tiene preparada tu ficha operativa
            para que entres con tu email.
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="space-y-5">
            <div>
              <h2 className="text-xl font-semibold">{invitation.display_name}</h2>
              <p className="mt-2 break-words text-sm leading-6 text-slate-600">
                {invitationEmail}
              </p>
            </div>

            {status && statusMessages[status] ? (
              <Alert>
                <AlertTitle>Cuenta pendiente de confirmacion</AlertTitle>
                <AlertDescription>{statusMessages[status]}</AlertDescription>
              </Alert>
            ) : null}

            {error && errorMessages[error] ? (
              <Alert variant="destructive">
                <AlertTitle>No se ha podido continuar</AlertTitle>
                <AlertDescription>{errorMessages[error]}</AlertDescription>
              </Alert>
            ) : null}

            {!invitationIsPending ? (
              <Alert>
                <AlertTitle>Invitacion cerrada</AlertTitle>
                <AlertDescription>
                  Esta invitacion esta en estado {invitation.status}. Pide a un
                  administrador que envie una nueva si necesitas acceso.
                </AlertDescription>
              </Alert>
            ) : user ? (
              canAcceptWithCurrentSession ? (
                <form action={acceptTeamInvitation} className="space-y-4">
                  <input name="invitationId" type="hidden" value={invitationId} />
                  <input name="token" type="hidden" value={token} />
                  <Button className="w-full" type="submit">
                    Aceptar invitacion
                  </Button>
                </form>
              ) : (
                <div className="space-y-4">
                  <Alert variant="destructive">
                    <AlertTitle>Email distinto</AlertTitle>
                    <AlertDescription>
                      Has iniciado sesion como {user.email}. Esta invitacion es
                      para {invitationEmail}.
                    </AlertDescription>
                  </Alert>
                  <form action="/auth/sign-out" method="post">
                    <Button className="w-full" type="submit" variant="outline">
                      Cerrar sesion
                    </Button>
                  </form>
                </div>
              )
            ) : (
              <div className="space-y-5">
                <form action={signUpAndAcceptTeamInvitation} className="space-y-4">
                  <input name="invitationId" type="hidden" value={invitationId} />
                  <input name="token" type="hidden" value={token} />

                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">
                      Crear contrasena
                    </span>
                    <Input
                      autoComplete="new-password"
                      className="mt-2"
                      name="password"
                      pattern={PASSWORD_PATTERN_ATTRIBUTE}
                      required
                      type="password"
                    />
                    <span className="mt-2 block text-xs leading-5 text-slate-500">
                      {PASSWORD_POLICY_DESCRIPTION}
                    </span>
                  </label>

                  <Button className="w-full" type="submit">
                    Crear cuenta y aceptar
                  </Button>
                </form>

                <Link
                  className="inline-flex w-full items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2"
                  href={getLoginPath(invitePath)}
                >
                  Ya tengo cuenta
                </Link>
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
