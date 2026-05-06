# BoxOps

BoxOps es un SaaS operativo para boxes de CrossFit: horarios semanales, coaches, clases, centros, cobertura, plantillas, cambios de turno/clase, vacaciones, festivos, eventos, horas extra, fichaje, documentos laborales, firmas documentales, certificaciones y programacion de clases.

La primera implementacion real sera para STL, pero el producto nace multi-tenant desde el primer dia. STL no es el nombre del producto ni debe aparecer hardcodeado en la arquitectura.

## Estado

Task 017 implementada: scaffold tecnico minimo con Next.js App Router, TypeScript, Tailwind CSS 4, shadcn/ui, Supabase SSR Auth, resolucion multi-tenant por membership, superficies protegidas de MVP 1 para centros, equipo/coaches, catalogo basico de tipos de actividad, gestion semanal de bloques operativos, `person_profiles`, asignaciones coach-bloque con `schedule_block_assignments`, cobertura basica calculada, filtros operativos compartibles, filtro `mine=1` para "Mi horario", plantillas semanales basicas en `/app/templates`, dashboard operativo en `/app`, cola de cobertura en `/app/coverage`, gestion/ayuda en `/app/more`, navegacion mobile-first, onboarding local y smoke/audit real de UI. Todavia no hay cambios de turno ni invitaciones.

## Referencias DEV usadas

- `DEV-INDEX.md`: convencion de proyectos activos en `projects/`.
- `_workspace/AIContext/00_START_HERE.md`: stack web estandar y orden de contexto.
- `_workspace/AIContext/02_MY_WORKING_STYLE.md`: tono directo, docs utiles y decisiones razonadas.
- `_workspace/AIContext/03_PRODUCT_PRINCIPLES.md`: reutilizar antes de crear, MVP acotado y una sola fuente de verdad.
- `_workspace/AIContext/06_PROJECT_TEMPLATES/next-web-app.md`: estructura base para SaaS con auth, datos y dashboard.
- `_workspace/AIContext/07_LESSONS_LEARNED.md`: evitar UI antes de auth/datos, separar logica de UI y documentar puntos de extension.
- `_workspace/AIContext/10_COMMERCIAL_VALIDATION.md`: validar valor comercial con piloto real antes de sobreconstruir.
- `_systems/0.design-system/CLAUDE.md` y `docs/playbook.md`: futura UI mobile-first, clara, operativa y basada en patrones compartidos.
- `docs/product/design-direction.md`, `ux-principles.md`, `screen-map.md`, `frontend-wireframes.md`, `visual-state-model.md` y `ui-references.md`: direccion visual futura inspirada en Revolut, When I Work, Deputy, Google Calendar/Notion Calendar y Linear, sin copiar interfaces.
- `docs/product/ui-decisions.md`: decisiones del refactor UX/UI operativo de Task 017.
- `projects/ShiftSwap`: referencia de producto operativo con turnos, calendario, roles, Supabase y Playwright smoke.
- `projects/LocalHero/LocalHero`: referencia de proyecto fase 0 con docs antes de codigo.

## Documentacion principal

Leer en este orden:

1. `PROJECT_BRIEF.md`: fuente de verdad del proyecto.
2. `PRD.md`: requisitos de producto y alcance inicial.
3. `TASKS.md`: tareas y fases.
4. `docs/product/mvp.md`: definicion por fases MVP.
5. `docs/product/design-direction.md`: direccion visual futura.
6. `docs/product/design-tokens.md`: propuesta documental de tokens base.
7. `docs/product/theming.md`: modelo de theming multi-tenant.
8. `docs/product/frontend-acceptance-criteria.md`: criterios visuales y UX para frontend.
9. `docs/product/frontend-wireframes.md`: prototipos documentales de pantallas operativas.
10. `docs/product/visual-state-model.md`: modelo visual de estados operativos.
11. `docs/product/ux-principles.md`: principios UX por rol.
12. `docs/product/screen-map.md`: pantallas clave futuras.
13. `docs/product/ui-references.md`: referencias de diseño y producto.
14. `docs/architecture/domain-model.md`: entidades candidatas.
15. `docs/architecture/tenancy-and-billing.md`: tenancy, infraestructura y modelo de cobro.
16. `docs/guides/README.md`: guias personales para entender y tocar el proyecto.
17. `docs/user-guides/README.md`: guias de uso por rol.
18. `docs/product/open-questions.md`: dudas pendientes.
19. `docs/operations/legal-and-privacy-notes.md`: fichaje, geolocalizacion, horas extra y documentos.
20. `docs/operations/smoke-checklist.md`: alcance del smoke automatizado y manual pendiente.
21. `docs/tenants/stl/README.md`: primer tenant real, separado del producto generico.
22. `docs/tenants/stl/design-notes.md`: notas visuales del tenant STL.
23. `AGENTS.md`: adaptador para Codex.

`CLAUDE.md` existe solo como puente para las convenciones del workspace DEV y apunta a `PROJECT_BRIEF.md`.

## Guias personales

Las guias nuevas estan pensadas como chuletas vivas para volver al proyecto semanas despues sin tener que invocar al caos:

- `docs/guides/project-cheatsheet.md`: que es BoxOps hoy, que existe y que no.
- `docs/guides/stack-guide.md`: stack, decisiones tecnicas y comandos.
- `docs/guides/code-editing-guide.md`: donde tocar login, layout, navegacion, centros, coaches, tipos de actividad, tenant/auth y Supabase.
- `docs/guides/stack-pitch.md`: defensa clara del stack para perfiles tecnicos y no tecnicos.

Guias de uso:

- `docs/user-guides/admin.md`
- `docs/user-guides/coach.md`

## Estructura inicial

```text
BoxOps/
  README.md
  .env.example
  eslint.config.mjs
  next.config.ts
  package.json
  postcss.config.mjs
  tsconfig.json
  AGENTS.md
  CLAUDE.md
  PROJECT_BRIEF.md
  PRD.md
  TASKS.md
  docs/
    architecture/
      domain-model.md
      tenancy-and-billing.md
    guides/
      README.md
      code-editing-guide.md
      project-cheatsheet.md
      stack-guide.md
      stack-pitch.md
    operations/
      legal-and-privacy-notes.md
      smoke-checklist.md
    product/
      design-direction.md
      design-tokens.md
      frontend-acceptance-criteria.md
      mvp.md
      open-questions.md
      screen-map.md
      theming.md
      ui-references.md
      ux-principles.md
    tenants/
      stl/
        README.md
        design-notes.md
    user-guides/
      README.md
      admin.md
      coach.md
  src/
    app/
      (app)/
        app/
      (auth)/
        login/
      auth/
        callback/
        sign-out/
    components/
      ui/
      layout/
      features/
    hooks/
    lib/
      auth/
      supabase/
      utils/
    types/
  supabase/
    migrations/
    seeds/
```

## Stack tecnico actual

- Next.js 16 App Router + React 19 + TypeScript estricto.
- Tailwind CSS 4.
- Supabase local, `@supabase/supabase-js` y `@supabase/ssr`.
- Supabase Auth SSR, Postgres, Realtime y Storage.
- Vercel para deploy.
- Radix UI + shadcn/ui inicializado en la primera superficie protegida de producto.
- Playwright para smoke tests basicos de rutas protegidas y flujos MVP 1.

## Comandos

Crear un `.env.local` a partir de `.env.example` y completar `NEXT_PUBLIC_SUPABASE_ANON_KEY` con la clave publica `Publishable` que muestra `npm run supabase:status`.

```bash
npm run dev
npm run build
npm run lint
npm run test:smoke
npm run typecheck
npm run supabase:start
npm run supabase:status
npm run supabase:reset
npm run supabase:types
```

Smoke tests:

```bash
npm run test:smoke
```

Por defecto usan `http://127.0.0.1:3000` o `E2E_BASE_URL`. No arrancan el dev server salvo opt-in explicito con `E2E_START_SERVER=1`. Los flujos autenticados usan variables opcionales `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD`, `E2E_COACH_EMAIL`, `E2E_COACH_PASSWORD`, `E2E_ORGANIZATION_ID` y `E2E_WEEK`.

Supabase local:

```bash
npm run supabase:start
npm run supabase:status
npm run supabase:reset
npm run supabase:types
```

## Auth y tenancy MVP 1

Task 017 deja una base minima de producto protegida con experiencia operativa mobile-first, smoke tests basicos y audit real de UI:

- `/login`: formulario minimo de email/password contra Supabase Auth.
- `/auth/callback`: intercambio de `code` para flujos OAuth/magic link si se activan.
- `POST /auth/sign-out`: cierre de sesion.
- `/app`: dashboard operativo con cobertura, resumen, pendientes y acciones rapidas.
- `/app/coverage`: cola accionable de riesgos semanales.
- `/app/more`: gestion, ayuda y reinicio de guia.
- `/app/centers`: gestion basica de centros de la organizacion activa.
- `/app/coaches`: Equipo, con gestion basica de accesos y fichas operativas de coach.
- `/app/class-types`: catalogo basico de tipos de clase/actividad del tenant.
- `/app/schedule`: superficie semanal de bloques operativos, asignaciones y cobertura basica por tenant.
- `/app/templates`: plantillas semanales basicas con bloques reutilizables y aplicacion a semanas reales.
- `src/proxy.ts`: proxy de Next.js 16 para refrescar sesion y proteger rutas futuras bajo `/app`.
- `src/lib/auth/tenant.ts`: utilidades server para obtener usuario autenticado, memberships activas y resolver organizacion activa.
- `src/app/(app)/app/layout.tsx`: shell protegido con sidebar desktop/tablet, bottom navigation mobile y onboarding local.
- `tests/smoke`: smoke tests Playwright para login publico, redireccion de rutas protegidas y navegacion MVP 1 autenticada opcional.
- `docs/product/frontend-validation-scenarios.md`: evidencia del audit real de Task 016 y del refactor UX/UI de Task 017.

Decisiones:

- `organization_memberships` es la fuente de rol y tenant.
- Roles MVP aceptados por la app: `admin` y `coach`.
- Una organizacion usable puede estar en `trialing` o `active`; organizaciones `inactive` o `suspended` no se resuelven como activas.
- Si un usuario tiene mas de una membership activa, la app no elige por defecto: hay que pasar `organizationId` de forma explicita.
- La navegacion bajo `/app` conserva `organizationId` cuando esta presente.
- Las Server Actions de centros, coaches, tipos, bloques y asignaciones vuelven a resolver usuario, membership, tenant y rol antes de mutar datos.
- `admin` puede crear, editar y activar/desactivar centros. `coach` solo puede consultar.
- `admin` puede crear memberships minimas por `user_id`, editar rol/estado y crear/editar `coach_profiles` minimos. `coach` consulta esta superficie en modo lectura.
- `admin` puede crear, editar y activar/desactivar tipos de clase/actividad. `coach` consulta el catalogo en modo lectura.
- `admin` puede crear, editar y cancelar bloques operativos de una semana concreta.
- `admin` puede asignar, reactivar o retirar coaches de bloques usando `schedule_block_assignments`.
- `admin` puede crear y editar plantillas semanales, bloques de plantilla y aplicar plantillas activas a una semana.
- `admin` puede ver en `/app` un dashboard operativo y en `/app/coverage` una cola semanal de riesgos accionables basada en cobertura calculada.
- `coach` consulta el horario, asignaciones y cobertura en modo lectura.
- `coach` consulta plantillas en modo lectura.
- No se toco el schema en Task 004, Task 005, Task 006, Task 007, Task 010, Task 011, Task 012, Task 013, Task 014, Task 015, Task 016 ni Task 017.

Para probar auth en local:

1. Crear `.env.local` desde `.env.example`.
2. Ejecutar `npm run supabase:start`.
3. Copiar `NEXT_PUBLIC_SUPABASE_ANON_KEY` desde la clave `Publishable` de `npm run supabase:status`.
4. Crear o registrar un usuario real en Supabase Auth.
5. Promocionar ese usuario con una fila en `public.organization_memberships` usando rol `admin` o `coach`.

Ejemplo para el tenant demo:

```sql
INSERT INTO public.organization_memberships (
  organization_id,
  user_id,
  role,
  status,
  joined_at
)
VALUES (
  '00000000-0000-0000-0000-000000100001',
  '<auth_user_uuid>',
  'admin',
  'active',
  now()
)
ON CONFLICT (organization_id, user_id)
DO UPDATE
SET role = EXCLUDED.role,
    status = EXCLUDED.status,
    joined_at = COALESCE(public.organization_memberships.joined_at, EXCLUDED.joined_at);
```

## Superficie protegida y centros

Flujo actual:

1. Entrar en `/login`.
2. Iniciar sesion con un usuario de Supabase Auth que tenga una fila activa en `organization_memberships`.
3. Abrir `/app`.
4. Si el usuario tiene varias memberships activas, elegir una organizacion para añadir `organizationId` a la URL.
5. Abrir `/app/schedule`, `/app/coverage`, `/app/coaches`, `/app/more`, `/app/centers`, `/app/class-types` o `/app/templates`.

En `/app/centers`:

- Todos los miembros activos del tenant pueden listar centros.
- `admin` puede crear un centro minimo con nombre, slug y zona horaria.
- `admin` puede editar nombre, slug, zona horaria y estado.
- `admin` puede activar/desactivar centros; no hay borrado desde la UI.
- `coach` ve la lista en modo lectura.

Limites pendientes:

- No hay selector global persistente de organizacion; por ahora se usa `organizationId` en query string.
- No hay gestion de direccion, geofence ni metadatos del centro.
- Esta pantalla no gestiona plantillas, dashboard ni cobertura.

## Inicio y cobertura

Ruta:

```text
/app
```

Task 017 organiza Inicio y Cobertura como superficies operativas, calculadas al vuelo y sin tabla `coverage_issues` persistida:

- usa la semana `week=YYYY-MM-DD`, normalizada al lunes como `/app/schedule`;
- conserva `organizationId` cuando el usuario tiene varias memberships activas;
- `/app` muestra saludo, cobertura de la semana, resumen, pendientes y acciones rapidas;
- `/app/coverage` ordena la cola por `uncovered`, `conflict` e `insufficient`;
- enlaza cada riesgo al bloque real en `/app/schedule`;
- muestra una lista compacta de todas las clases de la semana con estado de cobertura;
- muestra empty state cuando la semana no tiene bloques o no tiene riesgos activos;
- muestra loading/error states propios del segmento `/app`;
- para `coach`, mantiene lectura segura y accesos a Mi horario/plantillas, sin exponer controles admin.

No introduce cambios, ausencias, invitaciones, aprobaciones, fichaje ni datos reales hardcodeados.

## Usuarios y coaches

Ruta:

```text
/app/coaches
```

Task 005 usa el schema inicial y Task 009 añade el modelo de persona visible:

- `organization_memberships` crea la relacion usuario-organizacion con rol y estado.
- `coach_profiles` expresa capacidad operativa de coach dentro del tenant.
- `person_profiles` guarda nombre visible, email publico opcional, avatar, visibilidad y estado por tenant.
- `centers` permite elegir centro principal del perfil.
- `coach_center_assignments` ya existe para multi-centro, pero no se gestiona todavia desde UI.

En `/app/coaches`:

- `admin` lista memberships visibles del tenant.
- `admin` crea una membership minima si conoce un `user_id` existente de Supabase Auth.
- `admin` edita rol y estado de memberships; no puede mutar su propia membership desde esta pantalla.
- `admin` crea y edita perfiles de coach con centro principal, horas semanales, estado y notas internas.
- `coach` entra en modo lectura.
- No hay borrado de usuarios, memberships ni perfiles.

Limitacion actual: existe `person_profiles`, pero `/app/coaches` aun no implementa una gestion completa de perfiles visibles ni invitaciones. La pantalla mantiene el flujo compatible por UUID de Auth y soporta perfiles de coach pendientes de Auth sin romper.

## Tipos de clase y actividad

Ruta:

```text
/app/class-types
```

Task 006 usa el schema existente sin migracion nueva:

- `class_types` ya tenia `organization_id`, `name`, `slug`, `category`, `required_coaches`, `requires_certification`, `color` y `status`.
- RLS permite lectura a miembros activos y escritura a roles operativos; la app MVP limita mutaciones a `admin`.
- No hay relacion nueva con centros en este corte.

En `/app/class-types`:

- `admin` lista tipos del tenant activo.
- `admin` crea un tipo minimo.
- `admin` edita nombre, slug, categoria, coaches necesarios, certificacion, color y estado.
- `admin` activa/desactiva tipos; no hay borrado desde la UI.
- `coach` consulta el catalogo en modo lectura.
- El color es opcional y se valida como hexadecimal tipo `#2563eb`.

Esta pantalla no crea horarios, bloques, plantillas, dashboard ni cobertura.

## Horario semanal y bloques operativos

Ruta:

```text
/app/schedule
```

Task 007, Task 010, Task 011, Task 012 y Task 013 usan el schema existente sin migracion nueva:

- `schedule_blocks` ya tenia `organization_id`, `center_id`, `class_type_id`, `service_date`, `start_time`, `end_time`, `required_coaches`, `status` y `notes`.
- `status` permite cancelar bloques con `cancelled`, sin borrarlos.
- `centers` y `class_types` dan las referencias minimas del bloque.
- `schedule_block_assignments` es la fuente canonica de asignaciones reales coach-bloque.
- `coach_profiles` y `person_profiles` dan coaches asignables con nombres visibles por tenant.

En `/app/schedule`:

- La semana se recibe como `week=YYYY-MM-DD`; la app normaliza esa fecha al lunes de la semana.
- La lista filtra por `organization_id` y por rango semanal de `service_date`.
- Los filtros operativos viven en query string junto a `organizationId` y `week`: `center_id`, `coach_profile_id`, `class_type_id`, `block_status`, `coverage_state`, `risks_only=1` y `mine=1`.
- Los IDs de filtros se validan contra datos del mismo tenant; si una URL trae un filtro invalido o de otro tenant, se ignora sin romper la pantalla.
- El filtro de coach usa `schedule_block_assignments` con asignaciones `assigned` como fuente canonica.
- El filtro rapido "Mi horario" resuelve el `coach_profile` del usuario autenticado dentro del tenant activo y muestra sus bloques asignados con `assignment_status = 'assigned'`.
- Si "Mi horario" no encuentra perfil de coach, o encuentra multiples perfiles inesperados, la pantalla muestra un estado vacio seguro en vez de elegir un perfil automaticamente.
- El filtro rapido "solo riesgos" muestra `uncovered`, `insufficient` y `conflict`; los bloques `cancelled` y `completed` no entran como riesgos activos, aunque pueden filtrarse por estado operativo.
- `admin` puede crear bloques minimos con centro, tipo de actividad, fecha, horas, coaches necesarios, estado y notas.
- `admin` puede editar esos mismos campos.
- `admin` puede cancelar un bloque cambiando `status` a `cancelled`.
- `admin` puede asignar coaches activos y visibles a bloques activos.
- `admin` puede retirar asignaciones marcandolas como `removed`, sin borrar filas.
- Si una asignacion retirada se vuelve a elegir, se reactiva como `assigned`.
- La cobertura basica se calcula desde asignaciones validas: `covered`, `uncovered`, `insufficient` y `conflict`.
- `pending`, `declined` y `removed` no cuentan como cobertura valida.
- `coach` consulta la semana en modo lectura.
- No hay borrado de bloques desde UI.
- Los bloques que vienen de una plantilla conservan `template_id` y `template_block_id`.
- Si un admin edita o cancela un bloque aplicado desde plantilla, la app marca `is_template_exception = true`.

Fuera de esta pantalla: gestion de plantillas, dashboard visual de cobertura, cambios, invitaciones, ausencias y fichaje.

## Plantillas semanales

Ruta:

```text
/app/templates
```

Task 013 usa el schema existente sin migracion nueva:

- `schedule_templates` guarda plantillas semanales del tenant.
- `schedule_template_blocks` guarda bloques reutilizables por dia de semana.
- Cada bloque de plantilla tiene centro, tipo de actividad, hora, coaches necesarios, notas y `default_coach_profile_id` opcional.
- `default_coach_profile_id = null` representa un hueco vacante.

En `/app/templates`:

- `admin` lista plantillas semanales del tenant activo.
- `admin` crea y edita plantillas semanales con nombre, alcance opcional de centro, fechas de validez y estado.
- `admin` crea y edita bloques de plantilla.
- `admin` puede aplicar una plantilla activa a una semana.
- La aplicacion crea `schedule_blocks` con `template_id`, `template_block_id` e `is_template_exception = false`.
- Si el bloque de plantilla tiene coach por defecto, la aplicacion crea `schedule_block_assignments` con `source = 'template'`.
- Aplicar la misma plantilla dos veces sobre la misma semana no duplica bloques.
- `coach` consulta plantillas en modo lectura.

No hay borrado de plantillas ni bloques de plantilla desde UI en este corte. Las plantillas se archivan con `status = 'archived'`.

## Primer MVP

El primer MVP se centra en:

- Multi-tenant basico.
- Auth y membership por organizacion.
- Centros.
- Usuarios/coaches.
- Roles `admin` y `coach`.
- Tipos de clase/actividad.
- Horario semanal.
- Bloques operativos.
- Plantillas semanales.
- Filtros por centro, coach, tipo, estado operativo, cobertura calculada y solo riesgos.
- Dashboard basico de cobertura.

Fichaje, horas extra, documentos laborales e IA quedan documentados, pero no entran en el primer corte.

## Primer tenant

STL sera la primera organizacion piloto. Sus centros iniciales seran `STL Tremañes` y `STL City`, documentados como datos/configuracion de tenant en `docs/tenants/stl/README.md`.

Las notas visuales especificas viven en `docs/tenants/stl/design-notes.md`. STL puede tener tema propio cuando exista theming, pero no debe contaminar rutas, componentes, colores base ni copy generico de BoxOps.

## Licencia

Privado. Todos los derechos reservados.
