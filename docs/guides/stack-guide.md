# Guia del stack

Esta guia explica el stack real de BoxOps y por que esta aqui. No hay incienso tecnologico: cada pieza tiene que ahorrarnos un dolor concreto.

## Stack actual

- Next.js 16 App Router
- React 19
- TypeScript estricto
- Tailwind CSS 4
- shadcn/ui
- Radix UI
- lucide-react
- Supabase Auth, SSR, Postgres y RLS
- Playwright para smoke tests
- Vercel como destino natural de deploy

Versiones concretas: mirar `package.json`, porque los numeros exactos viven mejor ahi que en una frase que envejece en silencio.

## Next.js 16 App Router

Next se usa porque BoxOps mezcla:

- rutas publicas y protegidas
- lectura de datos en servidor
- auth SSR
- layouts por superficie
- Server Actions para mutaciones
- despliegue simple en Vercel

La app usa `src/app` y grupos de ruta:

- `src/app/(auth)/login`
- `src/app/(app)/app`
- `src/app/auth/callback`
- `src/app/auth/sign-out`

Ahora mismo `/app` es la zona protegida. No hay dashboard final todavia; hay un dashboard admin basico de cobertura, centros, usuarios/coaches basicos, catalogo de tipos de actividad, primera superficie semanal de bloques operativos y plantillas semanales.

## React 19

React pinta las superficies y componentes.

La regla practica:

- Server Components por defecto.
- Client Components solo cuando haga falta interaccion de navegador, hooks o estado local.

Ejemplo actual:

- `src/app/(app)/app/page.tsx` lee usuario, memberships y organizacion en servidor.
- `src/components/layout/app-navigation.tsx` es cliente porque usa `usePathname` y `useSearchParams`.

## TypeScript estricto

TypeScript no esta para decorar el editor.

Aqui sirve para:

- que los tipos generados de Supabase den forma real a las queries
- evitar mezclar roles y estados a ciegas
- hacer mas dificil pasar un tenant incorrecto sin verlo
- mantener las Server Actions con entradas controladas

Tipos importantes:

- `src/types/supabase.ts`
- `src/lib/auth/tenant.ts`
- `src/lib/centers.ts`

## Tailwind CSS 4

Tailwind permite construir UI operativa rapido sin crear una hoja de estilos ceremonial por cada card.

En BoxOps debe usarse con cabeza:

- densidad clara
- buen responsive
- controles previsibles
- nada de landing heroica donde hace falta una herramienta de trabajo

El CSS global vive en:

- `src/app/globals.css`

## shadcn/ui + Radix + lucide

shadcn/ui ya esta inicializado porque Task 004 construyo la primera superficie protegida real.

Donde mirar:

- `components.json`
- `src/components/ui`

Radix aporta primitivas accesibles. lucide aporta iconos consistentes. La combinacion evita reinventar botones, alerts, badges y cards cada vez que se abre una pantalla.

Regla practica:

- usa componentes de `src/components/ui` antes de inventar un patron nuevo
- usa lucide para iconos de acciones
- no conviertas cada pantalla en un experimento visual independiente

## Supabase Auth, SSR, Postgres y RLS

Supabase es la base de datos, auth y capa SSR.

Archivos clave:

- `src/lib/supabase/env.ts`
- `src/lib/supabase/server.ts`
- `src/lib/supabase/client.ts`
- `src/lib/supabase/proxy.ts`
- `src/types/supabase.ts`
- `supabase/migrations/00001_mvp1_multi_tenant_schema.sql`
- `supabase/seeds`

La seguridad multi-tenant se apoya en:

- `organization_id` en tablas operativas
- RLS desde la primera migracion
- `organization_memberships` como fuente de rol
- resolucion explicita de tenant cuando hay varias memberships activas

Si esto falla, mira aqui antes de invocar al caos:

1. `src/lib/auth/tenant.ts`
2. `src/proxy.ts`
3. `src/lib/supabase/proxy.ts`
4. policies de `supabase/migrations/00001_mvp1_multi_tenant_schema.sql`

## Por que Server Components por defecto

Porque muchas pantallas de BoxOps seran lectura de datos operativos con permisos de tenant.

Server Components ayudan a:

- leer datos cerca del servidor
- no mandar claves ni logica sensible al cliente
- resolver usuario, membership y organizacion antes de pintar
- reducir JavaScript innecesario

Si una pantalla solo necesita datos y HTML, que sea server. Si necesita estado de navegador, entonces cliente. Sin drama.

## Por que Server Actions para mutaciones

Las mutaciones actuales viven en:

- `src/app/(app)/app/centers/actions.ts`
- `src/app/(app)/app/coaches/actions.ts`
- `src/app/(app)/app/class-types/actions.ts`
- `src/app/(app)/app/schedule/actions.ts`

La idea es:

- pagina server lee datos
- formulario llama a action
- action revalida usuario, memberships, tenant y rol
- action escribe en Supabase
- action redirige con estado/error

Esto evita meter mutaciones sensibles en el cliente y obliga a comprobar permisos justo antes de cambiar datos. Que es lo suyo.

## Por que `proxy.ts` y no `middleware.ts`

El repo usa Next.js 16 y la convencion actual del proyecto es `src/proxy.ts`.

Archivos:

- `src/proxy.ts`
- `src/lib/supabase/proxy.ts`

El proxy:

- refresca sesion SSR
- protege `/app/:path*`
- redirige a `/login` si no hay usuario

Importante: el proxy no reemplaza la autorizacion de negocio. Las paginas y actions siguen resolviendo tenant y rol. El proxy es la puerta. El tenant safety vive tambien dentro.

## Que pinta Vercel aqui

Vercel encaja porque:

- Next.js despliega de forma natural ahi
- previews por rama ayudan mucho cuando haya UI real
- variables de entorno encajan con Supabase
- Server Components y Server Actions viven comodas
- mas adelante permite observabilidad, domains y deploys sin montar una central nuclear

No significa que todo dependa magicamente de Vercel. Significa que el camino de menor friccion para este stack es ese.

## Comandos utiles

Instalar dependencias:

```bash
npm install
```

Desarrollo:

```bash
npm run dev
```

Calidad:

```bash
npm run lint
npm run test:smoke
npm run typecheck
npm run build
```

`npm run test:smoke` usa por defecto `http://127.0.0.1:3000` o `E2E_BASE_URL`. No levanta el dev server salvo que se pida explicitamente con `E2E_START_SERVER=1`.

Supabase local:

```bash
npm run supabase:start
npm run supabase:status
npm run supabase:reset
npm run supabase:types
```

Notas:

- `.env.local` sale de `.env.example`.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` debe ser la clave publishable/anon del Supabase local o remoto.
- `npm run supabase:types` pisa `src/types/supabase.ts` con los tipos generados. Bien usado, es una bendicion. Mal usado contra el proyecto equivocado, una tarde curiosa.
