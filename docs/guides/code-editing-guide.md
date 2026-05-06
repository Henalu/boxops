# Guia para tocar el codigo sin abrir media selva

Esta guia es para Henalu tocando el repo a mano. No intenta ser arquitectura completa. Intenta contestar: "quiero cambiar X, donde voy".

## Regla general

La forma normal de una pantalla protegida en BoxOps deberia ser:

1. `page.tsx` lee datos en servidor.
2. Componentes de UI pintan la pantalla.
3. Server Actions mutan datos.
4. Cada action revalida usuario, membership, tenant y rol.
5. Supabase/RLS pone el segundo candado.

Si una mutacion de tenant no comprueba organizacion y rol antes de escribir, algo huele raro.

## Si quiero tocar login

Mira:

- `src/app/(auth)/login/page.tsx`
- `src/app/(auth)/login/actions.ts`
- `src/lib/auth/redirects.ts`

Aqui viven:

- formulario email/password
- mensajes de error
- redireccion segura con `redirectTo`
- llamada a `supabase.auth.signInWithPassword`

Tambien relacionado:

- `src/app/auth/callback/route.ts`
- `src/app/auth/sign-out/route.ts`

No metas seleccion de tenant compleja aqui todavia. Login autentica; la organizacion se resuelve despues desde membership.

## Si quiero tocar el layout protegido

Mira:

- `src/app/(app)/app/layout.tsx`

Aqui vive:

- shell protegido minimo
- cabecera
- email del usuario
- boton de cerrar sesion
- navegacion protegida

La proteccion inicial viene de:

- `getAuthenticatedUser`
- redirect a `/login`

Pero no confundas layout protegido con autorizacion completa. Cada pagina y action importante tiene que resolver su tenant.

## Si quiero tocar navegacion

Mira:

- `src/components/layout/app-navigation.tsx`
- `src/lib/navigation/app-paths.ts`

Ahora mismo solo hay:

- Inicio
- Centros
- Coaches
- Tipos
- Horario
- Plantillas

La navegacion conserva `organizationId` en query string. En `/app/schedule` y `/app/templates` tambien conserva `week` cuando existe para no sacar al usuario de la semana abierta o destino. Si añades una ruta bajo `/app`, haz que el link mantenga el tenant activo. Perder `organizationId` cuando hay varias memberships es una forma muy discreta de romper la experiencia.

## Si quiero tocar dashboard admin

Mira:

- `src/app/(app)/app/page.tsx`
- `src/app/(app)/app/loading.tsx`
- `src/app/(app)/app/error.tsx`
- `src/lib/schedule-blocks.ts`
- `src/lib/navigation/app-paths.ts`

El dashboard de `/app` es basico y admin-only. Calcula cobertura al vuelo con `calculateScheduleCoverageByBlock`, ordena riesgos por `uncovered`, `conflict` e `insufficient`, y enlaza cada riesgo al bloque real en `/app/schedule?...&block_id={id}`.

No metas aqui solicitudes, aprobaciones, ausencias, fichaje, payroll ni permisos de `manager`. Tampoco persistas `coverage_issues` sin tarea de schema explicita.

## Si quiero tocar centros

Mira:

- `src/app/(app)/app/centers/page.tsx`
- `src/app/(app)/app/centers/actions.ts`
- `src/lib/centers.ts`

En `page.tsx` esta:

- lectura de centros
- modo admin
- modo coach lectura
- formularios
- mensajes de exito/error

En `actions.ts` esta:

- crear centro
- editar centro
- activar/desactivar centro
- comprobacion de admin antes de mutar

En `src/lib/centers.ts` esta:

- estados validos
- labels
- validacion del formulario

Centros no se borran desde UI. Se activan/desactivan. Borrar centros a lo bruto cuando luego haya horarios seria como quitar una columna porque estorba a la vista.

## Si quiero tocar usuarios/coaches

Mira:

- `src/app/(app)/app/coaches/page.tsx`
- `src/app/(app)/app/coaches/actions.ts`
- `src/lib/coaches.ts`

En `page.tsx` esta:

- lectura server-first de memberships, perfiles de coach y centros
- modo admin para crear/editar memberships y `coach_profiles`
- modo coach de lectura
- mensajes de exito/error
- empty states y limites de scope

En `actions.ts` esta:

- crear membership minima por `user_id` de Supabase Auth
- editar rol/estado de membership
- crear perfil operativo de coach
- editar centro principal, horas, estado y notas del perfil
- comprobacion de admin antes de mutar
- bloqueo de mutacion sobre la propia membership para evitar perder acceso

En `src/lib/coaches.ts` esta:

- roles MVP gestionables (`admin`, `coach`)
- estados de membership y perfil
- labels
- validacion de UUID, horas y notas

Limitacion deliberada: esta pantalla no lee emails/nombres desde `auth.users`. Desde Task 009 existe `person_profiles` para identidad visible tenant-scoped, pero `/app/coaches` mantiene el alta minima por `user_id` y solo se ajusto para no romper con perfiles pendientes de Auth.

No metas aqui horarios, bloques, asignacion multi-centro avanzada ni cobertura. `coach_center_assignments` existe en schema, pero no se gestiona desde esta primera UI.

## Si quiero tocar tipos de clase/actividad

Mira:

- `src/app/(app)/app/class-types/page.tsx`
- `src/app/(app)/app/class-types/actions.ts`
- `src/lib/class-types.ts`

En `page.tsx` esta:

- lectura server-first de `class_types`
- modo admin para crear/editar tipos
- modo coach de lectura
- mensajes de exito/error
- empty state y recordatorio de fuera de scope

En `actions.ts` esta:

- crear tipo minimo
- editar nombre, slug, categoria, `required_coaches`, `requires_certification`, color y estado
- activar/desactivar tipos con `status`
- comprobacion de admin antes de mutar

En `src/lib/class-types.ts` esta:

- categorias validas del schema
- estados validos
- labels
- validacion de slug, coaches necesarios y color hexadecimal

No metas aqui horarios, bloques, plantillas, dashboard ni cobertura. Esta pantalla prepara el catalogo; no decide todavia cuando ocurre una clase ni quien la cubre.

## Si quiero tocar horario semanal y bloques

Mira:

- `src/app/(app)/app/schedule/page.tsx`
- `src/app/(app)/app/schedule/actions.ts`
- `src/lib/schedule-blocks.ts`

En `page.tsx` esta:

- lectura server-first de `schedule_blocks`
- filtro semanal por `week=YYYY-MM-DD`
- normalizacion de semana al lunes
- filtros operativos por query string: `center_id`, `coach_profile_id`, `class_type_id`, `block_status`, `coverage_state`, `risks_only` y `mine`
- validacion de que los IDs de filtros pertenecen al tenant activo antes de aplicarlos
- resolucion de "Mi horario" desde el `coach_profile` del usuario autenticado dentro del tenant activo
- selects de centros y tipos de actividad
- lectura de `schedule_block_assignments`
- lectura de coaches asignables desde `coach_profiles` + `person_profiles`
- nombres visibles desde `person_profiles.display_name`
- fallback tecnico cuando falta `person_profile`
- estado de cobertura basica por bloque
- modo admin para crear, editar y cancelar bloques
- modo admin para asignar o retirar coaches
- modo coach de lectura
- mensajes de exito/error y empty state

En `actions.ts` esta:

- crear bloque operativo
- editar centro, tipo, fecha, horas, coaches necesarios, estado y notas
- cancelar bloque cambiando `status` a `cancelled`
- asignar coach a bloque creando o reactivando `schedule_block_assignments`
- retirar asignacion con `assignment_status = 'removed'`
- validaciones de bloque activo, coach activo, persona visible, membership activa y tenant compartido
- conservacion de filtros saneados, incluido `mine=1`, al redirigir despues de mutaciones
- comprobacion de admin antes de mutar

En `src/lib/schedule-blocks.ts` esta:

- estados validos de bloque
- estados validos de asignacion
- labels de bloque, asignacion y cobertura
- resolucion de semana
- validacion de fecha, horas, referencias, coaches necesarios y notas
- validacion de formularios de asignacion
- calculo basico de `covered`, `uncovered`, `insufficient` y `conflict`
- estados de cobertura filtrables y helper de "solo riesgos"

No metas aqui gestion de plantillas, dashboard visual, cambios, invitaciones, ausencias ni fichaje. La asignacion basica, el filtro "Mi horario" y el marcado de excepciones de bloques aplicados viven aqui porque `/app/schedule` es la primera superficie semanal; cualquier permiso futuro de `manager` debe entrar como tarea explicita y no como "admin con otro nombre".

## Si quiero tocar plantillas semanales

Mira:

- `src/app/(app)/app/templates/page.tsx`
- `src/app/(app)/app/templates/actions.ts`
- `src/lib/schedule-templates.ts`
- `src/app/(app)/app/schedule/actions.ts` para el marcado de excepciones en bloques aplicados
- `src/lib/navigation/app-paths.ts`
- `src/components/layout/app-navigation.tsx`

En `page.tsx` esta:

- lectura server-first de `schedule_templates`;
- lectura de `schedule_template_blocks`;
- lectura de centros, tipos y coaches asignables del tenant;
- modo admin para crear/editar plantillas;
- modo admin para crear/editar bloques de plantilla;
- aplicacion de plantilla activa a una semana;
- modo coach de lectura;
- mensajes de exito/error y empty states.

En `actions.ts` esta:

- crear y actualizar plantillas semanales;
- crear y actualizar bloques de plantilla;
- aplicar una plantilla activa a una semana real;
- evitar duplicados por `template_block_id` y `service_date`;
- crear asignaciones `source = 'template'` cuando hay coach por defecto;
- revalidar usuario, membership, tenant y rol admin antes de mutar.

En `src/lib/schedule-templates.ts` esta:

- estados validos de plantilla;
- labels de estado y dia;
- validacion de fechas, horas, referencias, coaches necesarios, coach por defecto y notas.

No metas aqui dashboard, cambios, ausencias, fichaje ni permisos de `manager`. Tampoco borres plantillas desde UI; el patron actual es archivar.

## Si quiero tocar helpers de tenant/auth

Mira:

- `src/lib/auth/tenant.ts`

Funciones clave:

- `getAuthenticatedUser`
- `getActiveMemberships`
- `resolveActiveOrganization`

Ideas importantes:

- `organization_memberships` manda sobre rol y tenant.
- Solo roles MVP `admin` y `coach` se aceptan en app ahora mismo.
- Solo organizaciones `trialing` o `active` son usables.
- Si hay varias memberships activas, se exige `organizationId`.

Este archivo no es sitio para hacer magia por comodidad. Si eliges una organizacion "porque si", acabas abriendo una puerta multi-tenant que luego cuesta cerrar.

## Si quiero tocar Supabase

Mira:

- `supabase/README.md`
- `supabase/migrations/00001_mvp1_multi_tenant_schema.sql`
- `supabase/migrations/00002_person_profiles.sql`
- `supabase/seeds/01_demo_data.sql`
- `supabase/seeds/02_stl_tenant.sql`
- `src/types/supabase.ts`
- `src/lib/supabase/server.ts`
- `src/lib/supabase/client.ts`
- `src/lib/supabase/proxy.ts`
- `src/lib/supabase/env.ts`

Que no tocar a lo loco:

- migraciones ya aplicadas
- policies RLS
- `organization_id`
- seeds de tenant si estas tocando producto generico
- `src/types/supabase.ts` a mano

Si cambia schema:

1. nueva migracion
2. `npm run supabase:reset`
3. `npm run supabase:types`
4. revisar que RLS sigue cerrando por organizacion

## Como añadir una pantalla nueva bajo `/app`

Ejemplo mental futuro: `/app/reports`.

Pasos:

1. Crear `src/app/(app)/app/reports/page.tsx`.
2. Marcar `export const dynamic = "force-dynamic";` si depende de sesion/datos vivos.
3. Obtener usuario con `getAuthenticatedUser`.
4. Si no hay usuario, redirigir con `getLoginPath("/app/reports")`.
5. Leer memberships con `getActiveMemberships(user.id)`.
6. Leer `organizationId` desde `searchParams`.
7. Resolver tenant con `resolveActiveOrganization`.
8. Si no resuelve, pintar `OrganizationResolutionState`.
9. Hacer queries filtrando por `organization_id`.
10. Si hay mutaciones, ponerlas en `actions.ts`.
11. En cada action, volver a resolver usuario, membership, tenant y rol.
12. Añadir link en `app-navigation.tsx` conservando `organizationId`.

Atajo mental:

```text
usuario -> memberships activas -> organizationId explicito si hace falta -> query por organization_id -> action revalida todo
```

Si falta alguno de esos pasos, no sigas. Arreglalo antes.

## Checklist antes de guardar cambios

- No he metido STL en `src`.
- No he creado rutas, roles o permisos especificos de un tenant.
- Las queries de datos operativos filtran por `organization_id`.
- Las Server Actions revalidan usuario, tenant y rol.
- No he elegido organizacion implicita si hay varias memberships.
- No he tocado schema sin migracion.
- No he editado `src/types/supabase.ts` a mano.
- La navegacion mantiene `organizationId`.
- `admin` y `coach` siguen comportandose diferente donde toca.
- No he construido dashboard visual final, cambios, ausencias, fichaje ni permisos de `manager` "ya que estaba".

## Errores tipicos

### "Me redirige a login aunque estoy dentro"

Mira:

- `.env.local`
- `src/lib/supabase/env.ts`
- `src/proxy.ts`
- cookies del navegador
- que Supabase local este levantado

### "El usuario existe pero no entra en `/app`"

Mira:

- fila en `organization_memberships`
- `status = 'active'`
- rol `admin` o `coach`
- organizacion en `trialing` o `active`

### "Tengo varias organizaciones y no carga"

Normal. Necesita `organizationId` explicito.

Usa `/app?organizationId=<uuid>` o el selector que pinta `OrganizationResolutionState`.

### "El coach no puede editar centros"

Correcto. Hoy coach consulta. Admin gestiona. No es bug, es frontera.

### "He cambiado schema y TypeScript no se entera"

Genera tipos:

```bash
npm run supabase:types
```

Pero asegurate antes de estar contra el Supabase correcto. Los tipos generados son muy obedientes, incluso cuando obedecen al sitio equivocado.

## Frase final

Si vas a tocar una pantalla protegida, empieza por tenant safety. La UI puede esperar cinco minutos; una fuga multi-tenant no.
