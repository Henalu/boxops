export default function Home() {
  return (
    <main className="flex min-h-screen items-center bg-slate-50 px-6 py-16 text-slate-950">
      <section className="mx-auto w-full max-w-3xl">
        <p className="text-sm font-medium uppercase tracking-[0.14em] text-slate-500">
          Operativa del box
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-normal sm:text-5xl">
          BoxOps organiza tu semana.
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-slate-700">
          Horarios, equipo, plantillas y cobertura en una experiencia pensada
          para trabajar cada día con menos ruido.
        </p>
        <a
          className="mt-8 inline-flex items-center justify-center rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2"
          href="/login"
        >
          Ir al login
        </a>
      </section>
    </main>
  );
}
