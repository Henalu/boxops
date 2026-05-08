import Link from "next/link";

import { signInWithPassword } from "@/app/(auth)/login/actions";
import { getSafeRedirectPath } from "@/lib/auth/redirects";
import {
  getActiveMemberships,
  getAuthenticatedUser,
} from "@/lib/auth/tenant";

export const dynamic = "force-dynamic";

type LoginPageProps = {
  searchParams: Promise<{
    error?: string | string[];
    redirectTo?: string | string[];
    status?: string | string[];
  }>;
};

const errorMessages: Record<string, string> = {
  "missing-credentials": "Introduce email y contraseña para iniciar sesión.",
  "invalid-credentials": "No se ha podido iniciar sesión con esos datos.",
  callback: "No se ha podido completar el inicio de sesión.",
};

const successMessages: Record<string, string> = {
  "password-updated": "Contraseña actualizada. Inicia sesión con la nueva contraseña.",
};

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const redirectTo = getSafeRedirectPath(getParam(params.redirectTo));
  const error = getParam(params.error);
  const status = getParam(params.status);
  const user = await getAuthenticatedUser();
  const memberships = user ? await getActiveMemberships(user.id) : [];

  return (
    <main className="flex min-h-screen items-center bg-slate-50 px-4 py-12 text-slate-950 sm:px-6">
      <section className="mx-auto grid w-full max-w-5xl gap-8 lg:grid-cols-[1fr_420px] lg:items-center">
        <div className="max-w-2xl">
          <p className="text-sm font-medium uppercase tracking-[0.14em] text-slate-500">
            BoxOps
          </p>
          <h1 className="mt-4 text-3xl font-semibold tracking-normal sm:text-5xl">
            Accede a la operativa de tu box.
          </h1>
          <p className="mt-5 text-base leading-7 text-slate-700">
            Revisa horarios, equipo, plantillas y cobertura desde un único
            espacio de trabajo.
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          {status && successMessages[status] ? (
            <p className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm leading-6 text-emerald-900">
              {successMessages[status]}
            </p>
          ) : null}

          {user ? (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-semibold">Sesión iniciada</h2>
                <p className="mt-2 break-words text-sm leading-6 text-slate-600">
                  {user.email ?? user.id}
                </p>
              </div>

              {memberships.length > 0 ? (
                <Link
                  className="inline-flex w-full items-center justify-center rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2"
                  href={redirectTo}
                >
                  Continuar
                </Link>
              ) : (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-900">
                  Tu usuario existe, pero todavía no tiene acceso activo a
                  ningún box.
                </p>
              )}

              <form action="/auth/sign-out" method="post">
                <button
                  className="inline-flex w-full items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2"
                  type="submit"
                >
                  Cerrar sesión
                </button>
              </form>
            </div>
          ) : (
            <form action={signInWithPassword} className="space-y-5">
              <div>
                <h2 className="text-xl font-semibold">Iniciar sesión</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Usa tu email y contraseña para continuar.
                </p>
              </div>

              {error ? (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm leading-6 text-red-800">
                  {errorMessages[error] ?? errorMessages.callback}
                </p>
              ) : null}

              <input name="redirectTo" type="hidden" value={redirectTo} />

              <label className="block">
                <span className="text-sm font-medium text-slate-700">
                  Email
                </span>
                <input
                  autoComplete="email"
                  className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-slate-950 focus:ring-2 focus:ring-slate-950/10"
                  name="email"
                  required
                  type="email"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-700">
                  Contraseña
                </span>
                <input
                  autoComplete="current-password"
                  className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-slate-950 focus:ring-2 focus:ring-slate-950/10"
                  name="password"
                  required
                  type="password"
                />
              </label>

              <div className="flex justify-end">
                <Link
                  className="text-sm font-medium text-slate-700 underline-offset-4 transition-colors hover:text-slate-950 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2"
                  href="/forgot-password"
                >
                  He olvidado mi contraseña
                </Link>
              </div>

              <button
                className="inline-flex w-full items-center justify-center rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2"
                type="submit"
              >
                Entrar
              </button>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
