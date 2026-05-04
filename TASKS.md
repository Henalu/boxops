# Tasks - BoxOps

## Fase 0 - Documentacion Y Contexto

- [x] Revisar referencias DEV antes de crear el proyecto.
- [x] Crear carpeta `projects/BoxOps`.
- [x] Crear documentacion base: `README.md`, `AGENTS.md`, `PROJECT_BRIEF.md`, `PRD.md`, `TASKS.md`.
- [x] Crear `CLAUDE.md` minimo de compatibilidad con DEV.
- [x] Crear estructura inicial de carpetas.
- [x] Separar primer tenant STL en `docs/tenants/stl/`.
- [x] Actualizar indices del workspace.
- [x] Incorporar contexto funcional completo por modulos.
- [x] Crear docs de MVP, dudas abiertas, modelo de dominio y notas legales/privacidad.
- [x] Documentar direccion de diseño/UI futura:
  - `docs/product/design-direction.md`
  - `docs/product/ux-principles.md`
  - `docs/product/screen-map.md`
  - `docs/product/ui-references.md`
  - `docs/tenants/stl/design-notes.md`
- [x] Crear guias personales y guias de usuario tras Task 004:
  - `docs/guides/README.md`
  - `docs/guides/project-cheatsheet.md`
  - `docs/guides/stack-guide.md`
  - `docs/guides/code-editing-guide.md`
  - `docs/guides/stack-pitch.md`
  - `docs/user-guides/README.md`
  - `docs/user-guides/admin.md`
  - `docs/user-guides/coach.md`

## Task 001 - Schema MVP 1 Multi-Tenant

Estado: completada y validada en Supabase local.

Objetivo: crear la primera base tecnica real sin UI todavia.

Alcance:

- [x] Scaffoldear app Next.js si no existe.
- [x] Configurar estructura Supabase del repo.
- [x] Crear primera migracion con entidades MVP 1:
  - `organizations`
  - `centers`
  - `organization_memberships`
  - `coach_profiles`
  - `coach_center_assignments`
  - `class_types`
  - `schedule_templates`
  - `schedule_template_blocks`
  - `schedule_blocks`
  - `schedule_block_assignments`
- [x] Definir RLS basica por `organization_id`.
- [x] Crear seed demo generico.
- [x] Crear seed STL separado con organizacion y centros, sin hardcodear en app.
- [x] Documentar decisiones de schema si cambian respecto a `docs/architecture/domain-model.md`.
- [x] Aplicar migracion en Supabase local.
- [x] Ejecutar seeds demo y STL con `supabase db reset`.
- [x] Ejecutar `supabase db lint --local`.
- [x] Ejecutar `supabase db advisors --local`.
- [x] Generar tipos TypeScript desde Supabase local en `src/types/supabase.ts`.
- [x] Instalar Supabase CLI como dev dependency local.
- [x] Arrancar Supabase local con Docker.
- [x] Documentar tenancy/billing inicial.

Criterio de salida:

- Se puede crear un segundo tenant demo sin tocar codigo.
- Las tablas operativas tienen frontera de organizacion.
- No hay referencias STL en logica base.

## Task 002 - Scaffold Tecnico Minimo

Estado: completada y validada.

Objetivo: crear la app base para empezar MVP 1 contra Supabase local, sin pantallas de producto.

Alcance:

- [x] Inicializar Next.js 16 con App Router.
- [x] Configurar TypeScript estricto.
- [x] Configurar Tailwind CSS 4.
- [x] Mantener `src/` como base de aplicacion.
- [x] Crear `.env.example` con `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- [x] Crear helpers Supabase minimos:
  - `src/lib/supabase/client.ts`
  - `src/lib/supabase/server.ts`
- [x] Usar tipos generados en `src/types/supabase.ts`.
- [x] Anadir scripts:
  - `dev`
  - `build`
  - `lint`
  - `typecheck`
  - `supabase:start`
  - `supabase:reset`
  - `supabase:types`
- [x] Crear pagina inicial minima de arranque.
- [x] Actualizar `README.md`, `TASKS.md` y comandos del brief.
- [x] No implementar auth, dashboard, horarios ni CRUD.
- [x] No hardcodear STL en app.

Decisiones tecnicas:

- Scaffold manual sobre el repo existente para no sobrescribir documentacion, migraciones ni seeds.
- `@supabase/ssr` se instala desde el inicio para tener helper server-compatible con App Router.
- shadcn/ui queda pendiente hasta que exista primera superficie de producto real.

Verificacion:

- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `npm run build`
- [x] Dev server local revisado por HTTP en `http://127.0.0.1:3000`.

## Task 003 - Auth MVP 1 Multi-Tenant

Estado: completada y validada.

Objetivo: preparar autenticacion Supabase y resolucion segura de organizacion/membership para MVP 1, sin construir dashboard, horarios ni CRUD de producto.

Alcance:

- [x] Revisar helpers Supabase existentes:
  - `src/lib/supabase/client.ts`
  - `src/lib/supabase/server.ts`
- [x] Centralizar lectura de entorno Supabase en `src/lib/supabase/env.ts`.
- [x] Crear login minimo en `/login` con email/password.
- [x] Crear sign out minimo en `POST /auth/sign-out`.
- [x] Crear callback `GET /auth/callback` para intercambio de `code`.
- [x] Crear `src/proxy.ts` de Next.js 16 para refrescar sesion y proteger rutas futuras bajo `/app`.
- [x] Crear pagina tecnica protegida `/app` para validar sesion, membership y organizacion activa.
- [x] Crear helpers server en `src/lib/auth/tenant.ts`:
  - usuario autenticado via `supabase.auth.getUser()`
  - memberships activas del usuario
  - resolucion explicita y segura de organizacion activa
- [x] Usar `organization_memberships` como fuente de rol y tenant.
- [x] Mantener roles MVP en app: `admin` y `coach`.
- [x] No hardcodear STL en rutas, codigo, permisos ni defaults.
- [x] No implementar dashboard, horarios, centros, coaches ni CRUD.
- [x] No tocar schema, migraciones ni seeds.
- [x] Actualizar `README.md`, `TASKS.md` y decision de tenancy.

Decisiones tecnicas:

- El proxy solo protege `/app/:path*`; la autorizacion real de tenant queda en Server Components/utilidades server, no solo en proxy.
- `organization_memberships.status = 'active'` es obligatorio para resolver acceso.
- La app solo acepta roles MVP `admin` y `coach` aunque el schema conserve roles futuros documentados.
- Organizaciones en `trialing` o `active` son usables; `inactive` y `suspended` quedan fuera de la resolucion activa.
- Si hay mas de una membership activa, no se elige tenant implicito: se requiere `organizationId`.
- El callback soporta `redirectTo`/`next` solo como path interno para evitar redirects externos.

Verificacion:

- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `npm run build`

## Task 004 - Primera Superficie Protegida MVP 1

Estado: completada y validada.

Objetivo: construir el primer slice real despues de auth: app shell protegido y gestion basica de centros por organizacion, sin horarios, coaches, dashboard de cobertura ni CRUD avanzado.

Alcance:

- [x] Inicializar shadcn/ui como primera base de UI de producto.
- [x] Crear layout protegido minimo bajo `/app`.
- [x] Crear navegacion minima:
  - `/app`
  - `/app/centers`
- [x] Mantener Next.js App Router con Server Components por defecto.
- [x] Usar Supabase SSR existente.
- [x] Usar helpers de Task 003:
  - `getAuthenticatedUser`
  - `getActiveMemberships`
  - `resolveActiveOrganization`
- [x] Mantener `organization_memberships` como fuente de rol y tenant.
- [x] Mantener resolucion segura de organizacion:
  - si hay varias memberships activas, no se elige tenant implicito.
  - se exige `organizationId` explicito.
- [x] Crear `/app/centers`:
  - listar centros de la organizacion activa.
  - crear centro minimo.
  - editar nombre, slug, timezone y status.
  - activar/desactivar centro en lugar de borrar.
- [x] Respetar roles MVP:
  - `admin` gestiona centros.
  - `coach` solo consulta centros.
- [x] Revalidar usuario, tenant, membership y rol en Server Actions antes de mutar.
- [x] No hardcodear STL en rutas, codigo, permisos ni defaults.
- [x] No implementar horarios, clases, coaches, plantillas, dashboard ni cobertura.
- [x] No tocar schema, migraciones ni seeds.
- [x] Mantener `src/proxy.ts`; no crear `middleware.ts`.
- [x] Actualizar README y documentacion de tenancy.

Decisiones tecnicas:

- El layout de `/app` protege sesion y deja la autorizacion de tenant a paginas/acciones server.
- La navegacion conserva `organizationId` en query string para no perder contexto entre `/app` y `/app/centers`.
- No se crea selector global persistente de organizacion todavia; se mantiene explicito por URL hasta que haya mas superficie de producto.
- Centros no se borran desde UI; el flujo operativo es activar/desactivar.
- La validacion de slug de centros se hace en app antes de delegar en constraints de base de datos.

Verificacion:

- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `npm run build`

Nota documental posterior:

- [x] Actualizar contexto de proyecto con guias personales y guias de uso por rol, sin marcar como hechas features pendientes.

## Task 005 - Gestion Basica De Usuarios/Coaches

Estado: completada y validada.

Objetivo: crear la primera superficie protegida para gestionar la base minima de personas operativas del tenant, sin construir horarios, cobertura, plantillas ni dashboard.

Alcance:

- [x] Revisar `supabase/migrations/00001_mvp1_multi_tenant_schema.sql`.
- [x] Revisar `src/types/supabase.ts`.
- [x] Confirmar que el schema existente permite el corte sin migracion nueva:
  - `organization_memberships` permite alta minima por `user_id`, rol y estado.
  - `coach_profiles` permite perfil operativo minimo por tenant y usuario.
  - `coach_center_assignments` existe, pero queda fuera de esta UI inicial.
  - `centers` permite seleccionar centro principal del perfil.
- [x] Crear ruta protegida `/app/coaches`.
- [x] Mantener `organizationId` en query string.
- [x] Resolver usuario, memberships y organizacion activa igual que `/app/centers`.
- [x] Anadir navegacion hacia `/app/coaches`.
- [x] Admin puede listar memberships visibles del tenant.
- [x] Admin puede ver rol, estado y organizacion.
- [x] Admin puede crear una membership minima si existe un `user_id` de Supabase Auth.
- [x] Admin puede editar rol y estado de memberships sin borrar filas.
- [x] Admin no puede mutar su propia membership desde esta pantalla para evitar perder acceso.
- [x] Admin puede crear y editar `coach_profiles` minimos:
  - centro principal
  - horas semanales contratadas
  - estado
  - notas internas
- [x] Coach puede consultar la superficie en modo lectura.
- [x] Server Actions revalidan usuario, tenant, membership y rol admin antes de mutar.
- [x] No borrar usuarios, memberships ni perfiles desde UI.
- [x] No crear horarios, bloques, plantillas, dashboard ni cobertura.
- [x] No hardcodear STL en rutas, componentes, permisos ni defaults.
- [x] Actualizar README, guias de edicion y guias de usuario.

Decisiones tecnicas:

- Se elige `/app/coaches` porque el dominio MVP habla de usuarios/coaches como personas operativas, y el siguiente valor viene de saber que coaches existen antes de horarios.
- No se crea migracion en Task 005. Las tablas actuales soportan el slice minimo.
- La UI no puede mostrar emails o nombres de otros usuarios porque no existe una tabla publica de perfil de usuario ni se usa service role para leer `auth.users`. El alta minima trabaja con UUID de Supabase Auth.
- `organization_memberships` sigue siendo la fuente de rol y tenant; `coach_profiles` solo expresa capacidad operativa de coach.
- `coach_center_assignments` queda fuera de scope para no convertir este corte en asignacion multi-centro avanzada.
- Activar/desactivar memberships se modela como cambio de `status`, nunca como borrado.

Verificacion:

- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `npm run build`
- [x] `rg -n "STL" src`

## Task 006 - Catalogo Basico De Tipos De Clase/Actividad

Estado: completada y validada.

Objetivo: crear una superficie protegida para gestionar el catalogo basico de tipos de clase/actividad por tenant, sin construir horarios, bloques, plantillas, dashboard ni cobertura.

Alcance:

- [x] Revisar `supabase/migrations/00001_mvp1_multi_tenant_schema.sql`.
- [x] Revisar `src/types/supabase.ts`.
- [x] Confirmar que el schema existente permite el corte sin migracion nueva:
  - `class_types` incluye `organization_id`, `name`, `slug`, `category`, `required_coaches`, `requires_certification`, `color` y `status`.
  - RLS permite lectura a miembros activos y escritura a roles operativos.
  - No hace falta relacion nueva con `centers` para este slice.
- [x] Crear ruta protegida `/app/class-types`.
- [x] Mantener `organizationId` en query string.
- [x] Resolver usuario, memberships y organizacion activa igual que `/app/centers` y `/app/coaches`.
- [x] Anadir navegacion hacia `/app/class-types`.
- [x] Admin puede listar tipos del tenant.
- [x] Admin puede crear un tipo minimo.
- [x] Admin puede editar:
  - nombre
  - slug
  - categoria
  - `required_coaches`
  - `requires_certification`
  - color
  - estado
- [x] Admin puede activar/desactivar tipos.
- [x] Coach puede consultar la superficie en modo lectura.
- [x] Server Actions revalidan usuario, tenant, membership y rol admin antes de mutar.
- [x] No borrar tipos desde UI.
- [x] No crear horarios, bloques, plantillas, dashboard ni cobertura.
- [x] No hardcodear STL en rutas, componentes, permisos ni defaults.
- [x] Actualizar README, guias de edicion, guias de usuario, brief y arquitectura.

Decisiones tecnicas:

- Se elige `/app/class-types` porque coincide con la tabla y ya estaba documentado como ejemplo de nueva superficie protegida.
- No se crea migracion en Task 006. El schema actual soporta el catalogo basico.
- `class_types` sigue siendo catalogo de tenant, no dato global del producto.
- No se relacionan tipos con centros en esta tarea; esa decision queda para horarios/bloques si la operativa lo exige.
- El color es opcional y la app lo valida como hexadecimal (`#rrggbb`) antes de guardarlo.
- Activar/desactivar tipos se modela con `status`; no hay borrado desde UI.

Verificacion:

- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `npm run build`
- [x] `rg -n "STL" src`

## Task 007 - Primera Superficie De Bloques Operativos Semanales

Estado: completada y validada.

Objetivo: crear la primera superficie protegida para gestionar bloques operativos reales del tenant en una semana concreta, usando `schedule_blocks` como unidad minima, sin construir plantillas, asignaciones, dashboard de cobertura ni cambios entre coaches.

Alcance:

- [x] Revisar `supabase/migrations/00001_mvp1_multi_tenant_schema.sql`.
- [x] Revisar `src/types/supabase.ts`.
- [x] Confirmar que el schema existente permite el corte sin migracion nueva:
  - `schedule_blocks` incluye `organization_id`, `center_id`, `class_type_id`, `service_date`, `start_time`, `end_time`, `required_coaches`, `status`, `notes` y `is_template_exception`.
  - `status` ya soporta `scheduled`, `uncovered`, `changed`, `cancelled` y `completed`.
  - `centers` y `class_types` dan las referencias minimas para crear bloques.
  - `coach_profiles` y `schedule_block_assignments` quedan disponibles para lectura/preparacion futura, pero no se exponen en este corte.
- [x] Crear ruta protegida `/app/schedule`.
- [x] Mantener `organizationId` en query string.
- [x] Mantener semana por query string con `week=YYYY-MM-DD`; la app normaliza la fecha recibida al lunes de esa semana.
- [x] Resolver usuario, memberships y organizacion activa igual que `/app/centers`, `/app/coaches` y `/app/class-types`.
- [x] Anadir navegacion hacia `/app/schedule`.
- [x] Admin puede listar bloques del tenant en la semana activa.
- [x] Admin puede crear bloques minimos con centro, tipo de actividad, fecha, horas, coaches necesarios, estado y notas.
- [x] Admin puede editar esos mismos campos.
- [x] Admin puede cancelar un bloque cambiando `status` a `cancelled`; no hay borrado desde UI.
- [x] Coach puede consultar bloques en modo lectura.
- [x] Server Actions revalidan usuario, tenant, membership y rol admin antes de mutar.
- [x] No crear plantillas, aplicacion de plantillas, dashboard, asignaciones, cambios, ausencias ni fichaje.
- [x] No hardcodear STL en rutas, componentes, permisos ni defaults.
- [x] Actualizar README, guias de edicion, guias de usuario, brief y arquitectura.

Decisiones tecnicas:

- Se elige `/app/schedule` como nombre de ruta porque la superficie representa el horario semanal operativo, no solo clases.
- No se crea migracion en Task 007. El schema actual soporta el slice minimo.
- `schedule_blocks.service_date` es la fecha de servicio real del bloque; la UI filtra por semana `[lunes, domingo]`.
- `week=YYYY-MM-DD` puede recibirse como cualquier fecha de la semana; internamente se normaliza al lunes para mantener URLs estables.
- La creacion solo ofrece centros y tipos activos; la edicion conserva referencias existentes aunque esten inactivas.
- `schedule_block_assignments` queda fuera de scope para no mezclar el primer CRUD de bloques con cobertura/asignacion de coaches.
- Cancelar se modela con `status = 'cancelled'`; no se borran bloques desde UI.

Verificacion:

- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `npm run build`
- [x] `rg -n "STL" src`

## Revision 2026-04-30 - Estado Real Y Siguiente Fase

Estado: revision documental y tecnica completada. Esta revision no implementa features ni cambia `src/`.

Evidencia revisada:

- Documentacion obligatoria del proyecto, producto, arquitectura, guias, usuario y tenant STL.
- Scaffold actual bajo `src/` con rutas protegidas existentes:
  - `/login`
  - `/auth/callback`
  - `/auth/sign-out`
  - `/app`
  - `/app/centers`
  - `/app/coaches`
  - `/app/class-types`
  - `/app/schedule`
- Schema local en `supabase/migrations/00001_mvp1_multi_tenant_schema.sql`.
- Seeds demo y STL separados en `supabase/seeds/`.
- `rg -n "STL" src` sin coincidencias.

Completado con evidencia documental y tecnica:

- Fase 0 documental.
- Task 001: schema MVP 1 multi-tenant con RLS, seeds y tipos.
- Task 002: scaffold Next.js/Supabase/Tailwind.
- Task 003: auth Supabase SSR y resolucion segura de tenant por membership.
- Task 004: shell protegido y gestion basica de centros.
- Task 005: gestion basica de memberships/coaches.
- Task 006: catalogo basico de tipos de clase/actividad.
- Task 007: gestion semanal basica de bloques operativos.
- Preparacion documental de direccion visual, wireframes, estados y criterios frontend.

Parcial o pendiente en el momento de esta revision:

- `schedule_templates` y `schedule_template_blocks` existen en schema, pero no habia UI, actions ni flujo para crear/aplicar plantillas. Esto queda superado por Task 013.
- `schedule_block_assignments` ya tiene UI/actions basicas en `/app/schedule`, pero no habia plantillas ni dashboard sobre esas asignaciones. Plantillas queda superado por Task 013.
- `coach_center_assignments` existe en schema, pero no se gestiona desde UI.
- `/app/schedule` permite bloques semanales manuales y filtro "Mi horario"; todavia no es dashboard ni vista movil final.
- Los estados de cobertura basicos ya se calculan al vuelo; falta dashboard y validacion visual final con datos reales.
- La UI actual es superficie tecnica MVP, no frontend visual final validado.
- Las guias de admin/coach describian cortes MVP ya implementados, pero las secciones de plantillas, dashboard, cambios, ausencias, fichaje y documentos seguian pendientes. Plantillas queda superado por Task 013.

Bloqueos explicitos:

- Validacion con STL: falta una semana real de horarios, coaches, tipos, casos sin cubrir y reglas de visibilidad.
- Schema/datos: falta definir un perfil publico de persona para no mostrar UUIDs en horarios y asignaciones finales.
- Schema futuro: `organizations.theme_config` queda pendiente hasta iniciar theming real.
- Producto: dashboard de cobertura depende de asignaciones reales y reglas de calculo, no solo de `schedule_blocks.status`.
- Producto: frontend real debe esperar a validar una semana real y a cerrar datos minimos de asignaciones/personas.

Siguiente fase recomendada:

1. Cerrar Fase 1 de validacion con STL sin hardcodear datos en producto generico.
2. Preparar el siguiente corte generico de MVP 1: perfiles publicos/personas, asignaciones de coaches a bloques y calculo de cobertura.
3. Despues abordar plantillas semanales y aplicacion a una semana real.
4. Solo entonces implementar dashboard de cobertura y frontend visual mas definitivo.

## Task 008 - Desbloqueadores De Cobertura MVP 1

Estado: completada mediante documentacion, migracion y cortes tecnicos posteriores. Esta tarea es generica de producto y no usa datos reales de STL inventados.

Objetivo:

- Desbloquear el siguiente corte de MVP 1 antes de construir dashboard/frontend grande.
- Cerrar el modelo minimo de persona/perfil visible para dejar de mostrar UUIDs en horarios, asignaciones y cobertura.
- Definir como se usara `schedule_block_assignments` como fuente de asignacion coach-bloque.
- Dejar calculables los estados de cobertura `covered`, `uncovered`, `insufficient` y `conflict` desde datos genericos multi-tenant.

Alcance:

- Revisar el schema existente de `organization_memberships`, `coach_profiles`, `schedule_blocks` y `schedule_block_assignments`.
- Definir un modelo tenant-scoped de perfil publico/persona, candidato a migracion futura, con al menos:
  - `organization_id`;
  - `user_id`;
  - nombre visible;
  - email visible opcional si procede;
  - estado/visibilidad dentro del tenant;
  - relacion clara con membership y `coach_profiles`.
- Mantener `organization_memberships` como fuente de rol/acceso y `coach_profiles` como capacidad operativa de coach.
- Definir que `schedule_block_assignments` representa una asignacion entre un bloque real y un `coach_profile` del mismo tenant.
- Usar `assignment_status` asi:
  - `assigned`: cuenta para cobertura si coach y membership siguen activos;
  - `pending`: no cubre, pero puede aparecer como metadata;
  - `declined`: no cubre y queda como resultado de oferta/rechazo futuro;
  - `removed`: no cubre y evita borrar contexto critico desde UI.
- Usar `source` asi:
  - `manual`: asignacion hecha por admin;
  - `template`: asignacion heredada de plantilla;
  - `change_request`: asignacion resultado de flujo futuro;
  - `import`: dato importado o seed generico.
- Definir reglas genericas para asignar coach a bloque:
  - bloque, assignment, coach profile y membership deben pertenecer a la misma `organization_id`;
  - el bloque no debe estar `cancelled` ni `completed` para una asignacion activa nueva;
  - el `coach_profile.status` debe ser `active`;
  - la membership del `user_id` del coach debe seguir `active`;
  - se permite mas de un coach asignado cuando `required_coaches > 1`;
  - no se debe crear mas de una fila activa/logica para el mismo par `schedule_block_id` + `coach_profile_id`;
  - retirar una asignacion debe preferir `assignment_status = 'removed'` antes que borrar desde UI;
  - solapamientos se detectan como `conflict`; bloquear o permitir con aviso queda como decision pendiente.
- Definir el calculo generico de cobertura:
  - `covered`: bloque accionable con asignaciones validas `>= required_coaches` y sin conflicto;
  - `uncovered`: bloque accionable con `required_coaches > 0` y 0 asignaciones validas;
  - `insufficient`: bloque accionable con asignaciones validas `> 0` y `< required_coaches`;
  - `conflict`: coach con asignaciones validas en bloques activos que se solapan en fecha/hora, dentro del mismo tenant.
- Definir escenarios demo genericos multi-tenant, no STL:
  - tenant multi-centro con coaches activos, bloques cubiertos, sin cubrir, insuficientes y con solapamiento;
  - tenant de un centro con pocos coaches y semana sin incidencias;
  - caso con `required_coaches = 0` para bloque informativo/no accionable si el producto lo mantiene;
  - caso con coach inactivo o membership inactiva que no debe contar para cobertura.
- Documentar la decision provisional de `coverage_issues`: calcular al vuelo en MVP 1 desde queries/vistas/helpers; no persistir tabla hasta que haya necesidad de auditoria, notificaciones, rendimiento o workflow historico.
- Separar explicitamente que puede avanzar sin STL y que sigue bloqueado por validacion real.

Fuera de alcance:

- No crear dashboard visual definitivo.
- No crear rutas nuevas ni componentes de frontend grande.
- No implementar plantillas ni aplicacion de plantillas.
- No implementar solicitudes de cambio, ausencias, certificaciones, fichaje, payroll, mobile nativo ni IA.
- No convertir reglas supuestas de STL en reglas de producto.
- No crear seeds reales de STL ni fixtures con horarios/coaches inventados.
- No usar `schedule_blocks.status` como unica fuente de cobertura final.

Dependencias:

- Task 001 a Task 007 completadas.
- Schema actual con `schedule_block_assignments` disponible.
- `docs/product/coverage-state-rules.md` como fuente funcional de estados.
- Modelo publico/persona aun pendiente de schema/migracion.
- Validacion real de STL pendiente para ajustar prioridades, nombres y casos reales, sin bloquear los escenarios genericos.

Subtareas:

- [x] Confirmar si el perfil visible se modela como tabla tenant-scoped nueva, por ejemplo `person_profiles`, `member_profiles` u otra variante documentada.
- [x] Definir campos minimos del perfil visible y reglas de privacidad por tenant.
- [x] Decidir si email visible se guarda en perfil publico, se oculta por defecto o se deriva de un flujo de invitacion futuro.
- [x] Decidir si `person_profiles.user_id` es obligatorio o puede quedar pendiente hasta que la persona se registre o acepte invitacion.
- [x] Decidir si `coach_profiles` debe poder apuntar a `person_profiles` para asignar horarios antes de tener usuario Auth.
- [x] Incluir en `person_profiles` soporte para nombre completo incompleto, alias/nombre visible editable y foto de perfil.
- [x] Preparar perfiles operativos iniciales de STL pendientes de Auth con roles `admin`, `manager` y `coach`.
- [x] Definir perfil interno/oculto para usuarios tecnicos con acceso de mantenimiento que no aparecen en el equipo visible.
- [x] Preparar migracion futura si el modelo elegido no cabe en tablas actuales.
- [x] Actualizar tipos Supabase solo cuando exista migracion nueva.
- [x] Definir helpers/query de lectura para mostrar personas sin UUIDs en horarios y asignaciones.
- [x] Definir acciones futuras para crear, asignar, retirar y reactivar asignaciones de bloque.
- [x] Definir validaciones server-side para asignaciones: tenant, rol admin, bloque activo, coach activo, membership activa y par bloque-coach unico.
- [x] Definir permisos futuros de `manager` para gestion operativa sin permisos completos de `admin`.
- [x] Definir si un conflicto bloquea la asignacion o se permite guardarla marcada como riesgo.
- [x] Definir query/calculo de `covered`, `uncovered`, `insufficient` y `conflict`.
- [x] Preparar escenarios demo genericos multi-tenant para verificar cobertura sin datos reales de STL.
- [x] Documentar que `coverage_issues` se calcula al vuelo durante MVP 1 y que persistirlo queda como decision futura.
- [x] Actualizar docs de producto/arquitectura si alguna decision afecta implementaciones posteriores.

Decisiones pendientes:

- Nombre definitivo de la tabla de perfil visible/persona.
- Si el perfil visible es obligatorio para toda membership activa o solo para usuarios que aparezcan en horario/asignaciones.
- Si se permite crear persona/coach operativo antes de que exista `auth.users`.
- Si se permite mostrar email a otros miembros del tenant desde MVP 1.
- Como vincular un perfil operativo existente con la cuenta real cuando el coach se registre.
- Como ocultar usuarios tecnicos internos de listados de equipo y asignaciones.
- Si `display_name` y `preferred_alias` seran campos separados o si el alias se modela solo como `display_name`.
- Si `removed` conserva solo estado actual o si hara falta historial/auditoria separado.
- Alcance exacto de permisos de `manager` frente a `admin`.
- Si un solapamiento debe impedir guardar una asignacion o solo crear un riesgo visible.
- Si el centro principal/multi-centro del coach es informativo o restrictivo antes de validar reglas reales.
- Si los escenarios demo genericos viven solo en documentacion, en seeds demo o en tests cuando empiece la implementacion.

Que puede avanzar sin STL:

- Modelo generico de perfil visible/persona.
- Semantica de `schedule_block_assignments`.
- Validaciones multi-tenant de asignacion.
- Calculo basico de cobertura por ratio asignados/requeridos.
- Deteccion basica de solapamientos por coach, fecha y rango horario.
- Escenarios demo genericos con tenants ficticios.
- Decision provisional de calcular `coverage_issues` al vuelo.

Validacion STL recibida el 2026-04-30:

- Prioridad del dashboard admin: bloques sin cubrir, conflictos graves, cobertura insuficiente, riesgos de la semana y vistas de apoyo.
- Horario semanal real recibido con dia, hora inicio, hora fin y actividad, documentado en `docs/tenants/stl/README.md`.
- Coaches iniciales recibidos y centro principal inicial documentado en `docs/tenants/stl/README.md`.
- Visibilidad requerida: coaches pueden ver horario completo del equipo, clases asignadas, nombre y foto de perfil.
- Cada clase requiere 1 coach por defecto en el primer corte.
- Puede haber varias clases a la misma hora; solo hay conflicto si el mismo coach queda asignado a bloques solapados.
- Las certificaciones no influyen de momento en la asignacion.
- No hay reglas de traslado entre centros en el primer corte.
- Plantillas: deben permitir coaches por defecto y huecos vacantes.
- Cambios de turno/centro: requieren aprobacion de `admin` o `manager`.

Validacion STL adicional recibida:

- Los bloques del horario recibido corresponden inicialmente a STL TremaÃ±es.
- STL City debe usar las mismas franjas horarias iniciales, pero solo con actividades CrossFit y Wellness.
- Las asignaciones iniciales pueden generarse aleatoriamente por centro como dato editable.
- La asignacion aleatoria debe evitar solapar al mismo coach cuando sea posible.
- Los coaches deberian registrarse o aceptar invitacion con el correo que prefieran; no conviene crear cuentas reales por ellos con emails inventados.
- Se puede crear un usuario tecnico interno para Henalu Paes de Barros con `henalupaesdebarros@gmail.com`, rol admin tecnico y visibilidad oculta para el equipo operativo.
- Perfiles operativos iniciales STL pendientes de Auth:
  - Roberto: `admin`, alias Rober, STL TremaÃ±es, 20 horas.
  - Juanma: `admin`, STL City, 20 horas.
  - Nuria: `manager`, STL TremaÃ±es, 20 horas.
  - Pedro: `manager`, alias Pedrin, STL TremaÃ±es, 20 horas.
  - Valentina Oxley: `coach`, STL TremaÃ±es, 20 horas.
  - Noah: `coach`, STL TremaÃ±es, 20 horas.
  - Lucas: `coach`, STL City, 20 horas.
  - Valentina: `coach`, STL City, 20 horas.
  - Lucia: `coach`, STL City, 20 horas.
- Perfiles operativos actualizados con nombres completos y emails disponibles en `docs/tenants/stl/README.md`; falta solo el email de Nuria.

Que sigue bloqueado por validacion real de STL:

- Patron exacto para repartir actividades CrossFit/Wellness en STL City sobre las franjas existentes.
- Si la asignacion aleatoria debe cubrir todos los bloques o dejar algunos huecos intencionados para validar dashboard.
- Email de Nuria y confirmacion de si los emails recibidos se usaran para invitacion Auth o podran cambiarse antes de activar cuenta.
- Reglas detalladas de aprobacion para cambios de turno.
- Si los datos reales pueden convertirse en fixture anonimizado o deben quedar solo como configuracion privada.
- Politica de vacaciones, ausencias, fichaje, documentos y programacion.

Criterio de salida:

- Task 008 deja una decision documentada para perfil visible/persona y su migracion futura.
- Las reglas de asignacion de coach a bloque quedan listas para implementarse sin depender de STL.
- Los estados `covered`, `uncovered`, `insufficient` y `conflict` quedan definidos desde datos existentes o desde el perfil nuevo previsto.
- Hay escenarios demo genericos suficientes para validar cobertura multi-tenant sin datos reales.
- `coverage_issues` queda decidido provisionalmente como calculo al vuelo en MVP 1.
- Quedan separados los bloqueos de STL y los bloqueos de schema/migracion.
- No hay referencias STL en `src/`, rutas, componentes, permisos o reglas genericas.

Verificacion esperada:

- Revision documental de `TASKS.md`, `docs/product/coverage-state-rules.md`, `docs/architecture/domain-model.md` y `docs/product/mvp.md`.
- Si Task 008 solo documenta decisiones: no requiere `lint`, `typecheck` ni `build`.
- Si Task 008 crea migracion o codigo en una ejecucion futura:
  - `npm run supabase:reset`;
  - `npm run supabase:types`;
  - `npm run lint`;
  - `npm run typecheck`;
  - `npm run build`;
  - `rg -n "STL" src`.

Nota posterior Task 009:

- El sub-bloque de perfil visible/persona se ejecuto como Task 009 con migracion real.
- En ese momento Task 008 no quedaba completada entera: seguian pendientes asignaciones, validaciones de cobertura, escenarios demo genericos y calculo de `covered`/`uncovered`/`insufficient`/`conflict`.

Nota de cierre 2026-05-04:

- Task 010 cerro asignaciones operativas y calculo basico de cobertura.
- Task 011 cerro filtros operativos y "solo riesgos".
- Task 012 cerro "Mi horario".
- Los escenarios demo genericos quedaron documentados en `docs/product/coverage-demo-scenarios.md`.
- Task 008 queda cerrada como paraguas de desbloqueadores genericos de cobertura, sin convertir datos reales de STL en logica de producto.

## Task 009 - Perfiles Visibles Y Personas Operativas

Estado: completada y validada tecnicamente.

Objetivo: crear el modelo tenant-scoped de perfiles visibles/personas operativas para dejar de depender de UUIDs de Auth en horarios, coaches y asignaciones futuras, permitiendo perfiles pendientes de `auth.users`.

Alcance ejecutado:

- [x] Crear migracion nueva sin editar `00001_mvp1_multi_tenant_schema.sql`.
- [x] Crear tabla `person_profiles` con:
  - `organization_id`;
  - `user_id` opcional;
  - `full_name` opcional;
  - `display_name` obligatorio;
  - `preferred_alias` opcional;
  - `public_email` opcional;
  - `avatar_url` opcional;
  - `visibility_status` con `visible` e `internal`;
  - `status` con `active` e `inactive`;
  - `metadata`;
  - timestamps.
- [x] Mantener `organization_memberships` como fuente de acceso y rol.
- [x] Permitir `person_profiles` pendientes de Auth con `user_id = null`.
- [x] Permitir vincular opcionalmente `person_profiles.user_id` a una membership existente del mismo tenant cuando exista `auth.users`.
- [x] Anadir `coach_profiles.person_profile_id`.
- [x] Hacer `coach_profiles.user_id` nullable para permitir capacidad operativa de coach pendiente de Auth.
- [x] Mantener compatibilidad con el modelo actual basado en `coach_profiles.user_id`.
- [x] Exigir que cada `coach_profile` tenga al menos `user_id` o `person_profile_id`.
- [x] No crear rutas nuevas, dashboard, asignaciones visuales, invitaciones, plantillas ni cobertura visual.
- [x] Ajustar `/app/coaches` solo para no romper con `coach_profiles.user_id` nullable.
- [x] Regenerar `src/types/supabase.ts` desde Supabase local.

RLS y permisos:

- [x] Toda lectura/escritura de `person_profiles` queda acotada por `organization_id`.
- [x] Miembros activos del tenant pueden leer perfiles `visible`.
- [x] Perfiles `internal` quedan ocultos para lectura normal de miembros.
- [x] `owner`/`admin` pueden leer y gestionar perfiles del tenant.
- [x] `manager` queda documentado como rol operativo futuro, sin permisos completos sobre perfiles en esta migracion.
- [x] Si `user_id` esta vinculado, la persona puede actualizar su perfil basico visible; un trigger evita que cambie tenant, usuario, visibilidad, estado o metadata.
- [x] Nadie puede leer perfiles de otra organizacion mediante las policies de tenant.

Datos STL:

- [x] No se crean cuentas reales de Supabase Auth para coaches.
- [x] Se crean `person_profiles` STL pendientes de Auth para los perfiles documentados.
- [x] Se crean `coach_profiles` STL pendientes de Auth para las personas operativas asignables como coach.
- [x] Nuria queda con `public_email = null`.
- [x] Henalu Paes de Barros queda como `person_profile` tecnico interno, con `visibility_status = internal`, email documentado y sin `coach_profile`.
- [x] Los roles iniciales STL quedan como metadata/seed de tenant, no como logica generica.

Decisiones tecnicas:

- `person_profiles` es la tabla definitiva para perfil visible/persona en MVP 1.
- `display_name` es obligatorio y el valor canonico de visualizacion; `preferred_alias` se conserva separado para alias explicitos como Rober o Pedrin.
- `public_email` es opcional y vive en el perfil del tenant; no se deriva de `auth.users`.
- `visibility_status = internal` existe para usuarios tecnicos o no operativos y no debe usarse en listados normales de equipo/asignaciones.
- `coach_profiles.person_profile_id` desbloquea coaches operativos antes de Auth; `coach_profiles.user_id` sigue soportando el flujo actual de `/app/coaches`.
- `manager` no recibe permisos completos de gestion de perfiles en esta tarea; su alcance operativo se definira cuando se implementen horarios/asignaciones/aprobaciones.

Verificacion:

- [x] `npm run supabase:reset`
- [x] `npm run supabase:types`
- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `npm run build`
- [x] `rg -n "STL|Rober|Pedrin|Henalu|henalupaesdebarros|juanmatorrontegui|lucasperalta|luciape1994|iglesiasmendeznoah|pedro45399|robervg1990|valentinaoxley302|valenntnrg" src`

## Task 010 - Asignaciones Operativas Y Cobertura Basica

Estado: completada y validada tecnicamente.

Objetivo: usar `schedule_block_assignments` como fuente canonica de asignaciones reales coach-bloque y mostrar cobertura basica en `/app/schedule`, sin dashboard, plantillas, cambios de turno ni invitaciones.

Alcance ejecutado:

- [x] Confirmar que el schema existente soporta el corte sin migracion nueva.
- [x] Leer coaches asignables desde `coach_profiles` junto con `person_profiles`.
- [x] Mostrar como coaches asignables normales solo perfiles activos y visibles.
- [x] Excluir perfiles `internal` de asignaciones operativas.
- [x] Mantener compatibilidad con coaches vinculados a `user_id` y con coaches pendientes de Auth via `person_profile_id`.
- [x] Mostrar nombres desde `person_profiles.display_name`.
- [x] Usar fallback tecnico claro cuando falta `person_profile`, sin mostrar UUIDs completos como nombre normal.
- [x] Permitir asignar coach a bloque desde `/app/schedule`.
- [x] Permitir retirar asignacion con `assignment_status = 'removed'`, sin borrar filas.
- [x] Reactivar una fila `removed` a `assigned` cuando se vuelve a asignar el mismo coach al mismo bloque.
- [x] Evitar duplicados logicos para el mismo par `schedule_block_id` + `coach_profile_id`.
- [x] Calcular cobertura basica por bloque en la superficie semanal.
- [x] Detectar conflictos por mismo coach asignado a bloques activos solapados en la misma fecha.
- [x] Excluir bloques `cancelled` y `completed` de riesgos activos.
- [x] Mantener BoxOps generico multi-tenant y sin datos STL en `src`.

Validaciones server-side aplicadas:

- [x] Usuario autenticado.
- [x] Membership activa y organizacion activa/resuelta mediante los helpers existentes.
- [x] Solo `admin` puede crear/reactivar/retirar asignaciones en este corte.
- [x] `manager` queda documentado como rol operativo futuro para horarios/cobertura, sin permisos completos todavia.
- [x] Bloque, coach profile, person profile y assignment se validan dentro del mismo `organization_id`.
- [x] No se asigna a bloques `cancelled` o `completed`.
- [x] No se asigna `coach_profile` inactivo.
- [x] No se asignan perfiles `internal`.
- [x] Si un coach tiene `user_id`, su membership debe estar activa para asignar y contar cobertura.
- [x] Las asignaciones `pending`, `declined` y `removed` no cuentan como cobertura valida.

Decisiones tecnicas:

- No se crea migracion nueva: `schedule_block_assignments` ya incluye `organization_id`, FK tenant-scoped a bloque y coach, `assignment_status`, `source` y unicidad por bloque+coach.
- `schedule_block_assignments` pasa a ser la fuente canonica de quien cubre cada bloque real.
- En Task 010 los conflictos no bloquean guardar una asignacion; se guardan y aparecen como estado `conflict` calculado para que el admin los resuelva.
- `coverage_issues` sigue calculandose al vuelo durante MVP 1; no se crea tabla persistida.
- `manager` debe entrar en una tarea posterior con permisos operativos acotados en app/RLS, sin heredar administracion completa.

Cobertura basica:

- `covered`: bloque activo con asignaciones validas `>= required_coaches` y sin conflicto.
- `uncovered`: bloque activo con `required_coaches > 0` y 0 asignaciones validas.
- `insufficient`: bloque activo con asignaciones validas `> 0` y `< required_coaches`.
- `conflict`: el mismo coach tiene asignaciones validas en bloques activos solapados el mismo dia.
- `cancelled` y `completed` se muestran sin riesgo activo.
- `required_coaches = 0` se muestra como bloque sin requisito de cobertura.

Fuera de alcance mantenido:

- No se crea dashboard visual.
- No se crean plantillas ni aplicacion de plantillas.
- No se implementan cambios de turno, invitaciones, ausencias, fichaje ni payroll.
- No se cargan horarios reales completos ni cuentas Auth reales.

Verificacion:

- [x] `npm run supabase:reset` intento inicial fallido por contenedor; `npx supabase db reset --debug` completo migraciones y seeds.
- [x] `npm run supabase:types` no aplica porque Task 010 no cambia schema ni tipos generados.
- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `npm run build`
- [x] `rg -n "STL|Rober|Pedrin|Henalu|henalupaesdebarros|juanmatorrontegui|lucasperalta|luciape1994|iglesiasmendeznoah|pedro45399|robervg1990|valentinaoxley302|valenntnrg" src`

## Task 011 - Filtros Operativos Del Horario Semanal

Estado: completada y validada tecnicamente.

Objetivo: anadir filtros compartibles a `/app/schedule` para desbloquear la operativa semanal de MVP 1 sin crear dashboard ni plantillas.

Alcance ejecutado:

- [x] Filtro por centro con `center_id` en query string.
- [x] Filtro por coach asignado con `coach_profile_id` en query string.
- [x] Filtro por tipo de clase/actividad con `class_type_id` en query string.
- [x] Filtro por estado operativo con `block_status` en query string.
- [x] Filtro por cobertura calculada con `coverage_state` limitado a `covered`, `uncovered`, `insufficient` y `conflict`.
- [x] Filtro rapido "solo riesgos" con `risks_only=1`, incluyendo `uncovered`, `insufficient` y `conflict`.
- [x] Mantener `organizationId` y `week` en la URL junto a los filtros.
- [x] Combinar filtros entre si como interseccion.
- [x] Mantener empty state especifico cuando una combinacion de filtros no devuelve resultados.
- [x] Anadir enlace para limpiar filtros conservando `organizationId` y `week`.
- [x] Conservar filtros saneados al cambiar semana y tras mutaciones admin.
- [x] Mantener `schedule_block_assignments` como fuente canonica para el filtro de coach asignado.
- [x] Mantener nombres visibles desde `person_profiles.display_name` y fallback tecnico claro cuando falta perfil visible.

Validaciones server-side aplicadas:

- [x] La pagina sigue resolviendo usuario autenticado, membership activa y organizacion activa antes de leer datos.
- [x] Todas las lecturas operativas siguen filtrando por `organization_id`.
- [x] `center_id`, `coach_profile_id` y `class_type_id` se aceptan solo si pertenecen al tenant activo.
- [x] Filtros invalidos o ajenos al tenant se ignoran sin romper la pantalla.
- [x] `admin` conserva mutaciones de bloques/asignaciones y `coach` conserva lectura.
- [x] `manager` sigue sin permisos nuevos; debe entrar despues con tarea explicita de permisos app/RLS.

Decisiones tecnicas:

- No se crea migracion nueva: los filtros usan columnas existentes de `schedule_blocks`, `centers`, `class_types`, `coach_profiles` y `schedule_block_assignments`.
- El filtrado se aplica en servidor despues de cargar la semana del tenant y calcular cobertura al vuelo.
- El filtro de coach solo considera asignaciones con `assignment_status = 'assigned'`; `pending`, `declined` y `removed` no hacen que un bloque aparezca como asignado a ese coach.
- `cancelled` y `completed` quedan fuera de "solo riesgos" porque el calculo los marca como `inactive`, pero pueden consultarse con `block_status`.
- No se crea dashboard visual, no se crean plantillas y no se implementan cambios, invitaciones, ausencias ni fichaje.

Verificacion:

- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `npm run build`
- [x] `rg -n "STL|Rober|Pedrin|Henalu|henalupaesdebarros|juanmatorrontegui|lucasperalta|luciape1994|iglesiasmendeznoah|pedro45399|robervg1990|valentinaoxley302|valenntnrg" src`

## Task 012 - Vista/Filtro Mi Horario

Estado: completada y validada tecnicamente.

Objetivo: anadir a `/app/schedule` un filtro compartible para que un coach vea sus bloques asignados, sin crear dashboard, plantillas ni flujos de cambios.

Alcance ejecutado:

- [x] Filtro rapido "Mi horario" con `mine=1` en query string.
- [x] Mantener `organizationId` y `week` en la URL junto al filtro.
- [x] Conservar compatibilidad con `center_id`, `coach_profile_id`, `class_type_id`, `block_status`, `coverage_state` y `risks_only`.
- [x] Combinar "Mi horario" con el resto de filtros como interseccion.
- [x] Resolver el `coach_profile` del usuario autenticado dentro del tenant activo.
- [x] Usar `schedule_block_assignments` como fuente canonica para decidir los bloques del usuario.
- [x] Contar solo asignaciones con `assignment_status = 'assigned'`.
- [x] Mostrar nombres visibles desde `person_profiles.display_name`.
- [x] Mantener fallback tecnico claro cuando falta `person_profile`.
- [x] Mostrar estado vacio especifico cuando "Mi horario" no devuelve bloques en la semana.
- [x] Mostrar estado vacio/explicacion clara si el usuario no tiene `coach_profile` en el tenant activo.
- [x] Mantener enlace para limpiar filtros conservando `organizationId` y `week`.
- [x] No crear dashboard, plantillas, cambios de turno, invitaciones, ausencias ni fichaje.

Validaciones server-side aplicadas:

- [x] La pagina sigue validando usuario autenticado, membership activa y organizacion activa/resuelta antes de leer datos.
- [x] Todas las lecturas siguen filtradas por `organization_id`.
- [x] El `coach_profile` de "Mi horario" se resuelve solo desde `coach_profiles` y `person_profiles` del tenant activo.
- [x] Si una URL trae `mine` invalido, se ignora sin romper la pantalla.
- [x] Si hay multiples perfiles de coach inesperados para el mismo usuario, no se elige uno automaticamente y se muestra estado vacio seguro.
- [x] `admin` conserva todos los filtros y mutaciones existentes.
- [x] `coach` conserva modo lectura y puede usar "Mi horario".
- [x] `manager` no recibe permisos nuevos; debe entrar despues con tarea explicita de app/RLS y alcance operativo.

Decisiones tecnicas:

- No se crea migracion nueva: el schema existente ya tenia `coach_profiles.user_id`, `coach_profiles.person_profile_id`, `person_profiles.user_id` y `schedule_block_assignments` con frontera de tenant.
- `mine=1` se trata como un filtro mas de `/app/schedule`, no como dashboard ni ruta nueva.
- Si el usuario esta vinculado a mas de un `coach_profile` en el mismo tenant, el fallback seguro es no mostrar resultados de "Mi horario" hasta corregir datos, para no adivinar identidad operativa.
- El filtro "Mi horario" puede combinarse con `coach_profile_id`; en bloques multi-coach, la interseccion permite ver solo bloques donde tambien coincida el coach seleccionado.
- La cobertura sigue calculandose al vuelo despues de cargar la semana del tenant; "Mi horario" solo reduce el conjunto visible de bloques.

Verificacion:

- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `npm run build`
- [x] `rg -n "STL|Rober|Pedrin|Henalu|henalupaesdebarros|juanmatorrontegui|lucasperalta|luciape1994|iglesiasmendeznoah|pedro45399|robervg1990|valentinaoxley302|valenntnrg" src`

## Task 013 - Plantillas Semanales Basicas

Estado: completada y validada tecnicamente.

Objetivo: crear el primer corte generico de plantillas semanales de MVP 1, sin dashboard, cambios, ausencias ni datos reales hardcodeados del primer tenant.

Alcance ejecutado:

- [x] Cerrar la deuda anterior de Task 008 documentando escenarios demo genericos multi-tenant en `docs/product/coverage-demo-scenarios.md`.
- [x] Confirmar que el schema existente soporta el corte sin migracion nueva:
  - `schedule_templates`;
  - `schedule_template_blocks`;
  - `schedule_blocks.template_id`;
  - `schedule_blocks.template_block_id`;
  - `schedule_blocks.is_template_exception`;
  - `schedule_block_assignments.source = 'template'`.
- [x] Crear helper `src/lib/schedule-templates.ts` con estados, labels y validaciones.
- [x] Crear ruta protegida `/app/templates`.
- [x] Anadir navegacion hacia `/app/templates` conservando `organizationId` y `week`.
- [x] Mantener Next.js App Router con Server Components por defecto.
- [x] Mantener `organization_memberships` como fuente de rol y tenant.
- [x] Admin puede listar plantillas semanales del tenant activo.
- [x] Admin puede crear y editar plantillas semanales con nombre, alcance opcional de centro, fechas de validez y estado.
- [x] Admin puede crear y editar bloques de plantilla con dia, centro, tipo, horas, coaches necesarios, coach por defecto opcional y notas.
- [x] Plantillas con `default_coach_profile_id = null` quedan como huecos vacantes.
- [x] Plantillas con `default_coach_profile_id` crean asignaciones de origen `template` al aplicarse.
- [x] Aplicar una plantilla activa a una semana crea `schedule_blocks` reales con `template_id`, `template_block_id` e `is_template_exception = false`.
- [x] Aplicar la misma plantilla dos veces sobre la misma semana no duplica bloques ya creados para el mismo `template_block_id` y `service_date`.
- [x] Editar o cancelar un bloque aplicado desde plantilla en `/app/schedule` marca `is_template_exception = true`.
- [x] Coach puede consultar plantillas en modo lectura.
- [x] Server Actions revalidan usuario, tenant, membership y rol admin antes de mutar.
- [x] No borrar plantillas ni bloques de plantilla desde UI; las plantillas se archivan con `status = 'archived'`.
- [x] No crear dashboard, cambios de turno, invitaciones, ausencias, fichaje, payroll, mobile nativo, IA ni geolocalizacion.
- [x] No hardcodear STL en rutas, componentes, permisos ni defaults.
- [x] Actualizar README, brief, arquitectura, MVP, guias de edicion y guias de usuario.

Validaciones server-side aplicadas:

- [x] Usuario autenticado.
- [x] Membership activa y organizacion activa/resuelta.
- [x] Solo `admin` muta plantillas en este corte.
- [x] `center_id`, `class_type_id`, `default_coach_profile_id`, plantilla y bloque de plantilla se validan dentro del mismo `organization_id`.
- [x] Un coach por defecto debe ser asignable: `coach_profile` activo, persona visible si existe, membership activa si hay `user_id`.
- [x] Solo plantillas semanales `active` se aplican a semanas reales.
- [x] Plantillas `archived` no se modifican desde las acciones de bloques.
- [x] La aplicacion de plantilla conserva la frontera `organization_id` en bloques y asignaciones.

Decisiones tecnicas:

- No se crea migracion nueva ni se regeneran tipos Supabase: el schema de Task 001 y Task 009 ya soportaba el corte.
- `/app/templates` se limita a `template_type = 'weekly'`; plantillas mensuales quedan fuera de este corte.
- `draft` permite preparar plantillas; `active` permite aplicarlas; `archived` conserva patrones sin borrado desde UI.
- La aplicacion de plantilla redirige a `/app/schedule` para revisar la semana creada.
- `source = 'template'` distingue asignaciones heredadas de plantilla frente a asignaciones manuales.
- Los bloques vacantes dependen del calculo de cobertura existente para aparecer como `uncovered` si requieren coach.
- Evitar duplicados se hace por plantilla, bloque de plantilla y fecha de servicio dentro de la semana destino.
- Editar o cancelar un bloque aplicado marca excepcion, pero no persiste historial `antes -> despues`; auditoria detallada queda como dependencia futura.
- `manager` sigue sin permisos nuevos; debe entrar despues con tarea explicita de permisos app/RLS.

Verificacion:

- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `npm run build`
- [x] `rg -n "STL" src` sin coincidencias.
- [x] Comandos Supabase no aplican porque no hay migracion nueva ni cambios en tipos generados.

## Task 014 - Dashboard Admin Basico De Cobertura

Estado: completada y validada tecnicamente.

Objetivo: convertir `/app` en el primer dashboard admin basico de cobertura, basado en cola accionable de riesgos y sin crear dashboard visual final, solicitudes, ausencias ni datos reales hardcodeados del primer tenant.

Alcance ejecutado:

- [x] Detectar que Task 008 y Task 013 ya estaban cerradas.
- [x] Mantener `/app` como Server Component y superficie protegida por auth/membership.
- [x] Mantener `organization_memberships` como fuente de rol y tenant.
- [x] Resolver `organizationId` igual que el resto de superficies protegidas.
- [x] Reutilizar `resolveWeek` y `calculateScheduleCoverageByBlock` como fuente canonica de semana y cobertura al vuelo.
- [x] Cargar bloques, asignaciones, centros, tipos, coaches, personas y memberships filtrando por `organization_id`.
- [x] Mostrar dashboard solo para `admin`; `coach` conserva una vista de lectura con accesos a Mi horario y plantillas.
- [x] Mostrar resumen semanal de riesgos activos, bloques sin cubrir, conflictos y bloques activos.
- [x] Ordenar la cola por `uncovered`, `conflict` e `insufficient`.
- [x] Enlazar cada riesgo al bloque real en `/app/schedule` mediante anchors `block-{id}`.
- [x] Anadir vistas de apoyo por centro con atajos filtrados al horario semanal.
- [x] Anadir empty state cuando no hay bloques y cuando no hay riesgos activos.
- [x] Anadir `loading.tsx` y `error.tsx` en el segmento `/app`.
- [x] No crear migraciones, tablas persistidas de `coverage_issues` ni tipos Supabase nuevos.
- [x] No crear cambios, invitaciones, ausencias, fichaje, payroll, mobile nativo, IA ni geolocalizacion.
- [x] No hardcodear STL en rutas, componentes, permisos ni defaults.
- [x] Actualizar README, brief, arquitectura, MVP, guias de edicion y guias de usuario.

Decisiones tecnicas:

- El dashboard vive en `/app` para reemplazar el inicio tecnico sin abrir una ruta nueva.
- La cola no persiste incidencias: se calcula al vuelo desde `schedule_blocks`, `schedule_block_assignments`, `coach_profiles`, `person_profiles` y `organization_memberships`.
- La prioridad de cola sigue `uncovered -> conflict -> insufficient`, segun validacion documentada.
- El enlace de cada riesgo abre el bloque real en `/app/schedule#block-{id}`; no se crea detalle nuevo ni workflow de solicitud.
- Los atajos por centro usan `risks_only=1` solo cuando el centro tiene riesgos.
- `manager` sigue sin permisos nuevos; debe entrar despues con tarea explicita de permisos app/RLS.
- Este corte no es dashboard visual final: queda pendiente validarlo con semana real y repetir audit visual en navegador.

Verificacion:

- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `npm run build`
- [x] `rg -n "STL" src` sin coincidencias.
- [x] Comandos Supabase no aplican porque no hay migracion nueva ni cambios en tipos generados.

## Task 015 - Smoke Tests Basicos De Rutas Protegidas Y Flujos MVP 1

Estado: completada y validada tecnicamente.

Objetivo: cerrar la primera deuda tecnica verificable posterior al dashboard admin basico con smoke tests de rutas protegidas y flujos MVP 1, sin abrir features grandes ni depender de datos reales del primer tenant.

Alcance ejecutado:

- [x] Detectar que la siguiente tarea accionable real era deuda tecnica de smoke tests, no cambios, ausencias, fichaje ni dashboard visual final.
- [x] Anadir Playwright como dev dependency del proyecto.
- [x] Crear `npm run test:smoke`.
- [x] Crear `playwright.smoke.config.ts`.
- [x] Configurar el smoke para usar por defecto `http://127.0.0.1:3000` o `E2E_BASE_URL`.
- [x] Evitar arrancar el dev server por defecto; solo se lanza con `E2E_START_SERVER=1`.
- [x] Crear smoke sin credenciales para comprobar que `/login` renderiza y que rutas protegidas redirigen a `/login` preservando `redirectTo`:
  - `/app`
  - `/app/centers`
  - `/app/coaches`
  - `/app/class-types`
  - `/app/schedule`
  - `/app/templates`
- [x] Crear smoke autenticado opcional para `admin` con `E2E_ADMIN_EMAIL` y `E2E_ADMIN_PASSWORD`.
- [x] Crear smoke autenticado opcional para `coach` con `E2E_COACH_EMAIL` y `E2E_COACH_PASSWORD`.
- [x] Permitir `E2E_ORGANIZATION_ID` para usuarios con varias memberships activas.
- [x] Permitir `E2E_WEEK` para fijar semana en horario y plantillas.
- [x] Documentar alcance automatizado y smoke manual pendiente en `docs/operations/smoke-checklist.md`.
- [x] No tocar schema, migraciones, seeds ni tipos Supabase.
- [x] No persistir `coverage_issues`.
- [x] No hardcodear STL en rutas, componentes, permisos ni defaults.
- [x] Actualizar README, brief, MVP y TASKS.

Decisiones tecnicas:

- La suite smoke vive fuera de `src/` en `tests/smoke` para no mezclar verificacion E2E con codigo de producto.
- Los tests sin credenciales usan `APIRequestContext`, por lo que pueden validar auth/proxy basico sin instalar ni abrir navegador.
- Los tests con credenciales usan navegador real y quedan omitidos cuando faltan variables E2E, siguiendo el patron de ShiftSwap.
- El smoke no arranca servidor salvo opt-in explicito con `E2E_START_SERVER=1`, porque el flujo local del proyecto usa servidor manual cuando se verifica UI.
- Las rutas autenticadas comprueban headings estables de las superficies MVP 1, no detalles visuales finales.
- El audit real de accesibilidad/responsive/theming queda pendiente como tarea separada; esta tarea solo cierra smoke funcional basico.

Verificacion:

- [x] `npm run test:smoke` contra `http://127.0.0.1:3000`: 7 passed, 2 skipped por falta de credenciales E2E.
- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `npm run build`
- [x] `rg -n "STL" src` sin coincidencias.
- [x] Comandos Supabase no aplican porque no hay migracion nueva ni cambios en tipos generados.

## Task 016 - Audit Real De Accesibilidad, Responsive Y Theming

Estado: completada y validada contra servidor local abierto.

Objetivo: cerrar la deuda tecnica verificable posterior a los smoke tests, repitiendo el audit de accesibilidad, responsive y theming sobre la UI implementada con viewports reales, sin abrir una fase visual grande.

Alcance ejecutado:

- [x] Detectar que la siguiente tarea accionable real era repetir el audit real de UI implementada, no cambios, ausencias, fichaje, payroll, IA ni dashboard visual final.
- [x] Usar `http://127.0.0.1:3000` con el dev server ya abierto manualmente; no se lanzo `npm run dev` ni ningun proceso background.
- [x] Revisar contexto obligatorio del proyecto y skills de UI/Next.js antes de auditar.
- [x] Ejecutar audit con Playwright porque `agent-browser` no estaba instalado en el entorno.
- [x] Crear una cuenta admin temporal solo en Supabase local para auditar rutas protegidas del tenant demo y eliminarla al terminar cada pasada.
- [x] Auditar viewports reales:
  - 375x812
  - 390x844
  - 768x1024
  - 1280x800
- [x] Auditar rutas:
  - `/login`
  - `/app?organizationId=00000000-0000-0000-0000-000000100001&week=2026-05-04`
  - `/app/schedule?organizationId=00000000-0000-0000-0000-000000100001&week=2026-05-04`
  - `/app/templates?organizationId=00000000-0000-0000-0000-000000100001&week=2026-05-04`
  - `/app/centers?organizationId=00000000-0000-0000-0000-000000100001`
  - `/app/coaches?organizationId=00000000-0000-0000-0000-000000100001`
  - `/app/class-types?organizationId=00000000-0000-0000-0000-000000100001`
- [x] Generar evidencia local en `test-results/frontend-audit-2026-05-04/` con screenshots y `audit-results.json`.
- [x] Confirmar que no hubo errores de consola, error overlay de Next.js, labels accesibles ausentes ni overflow horizontal de pagina en las rutas auditadas.
- [x] Implementar fix pequeno y directo en `/app/coaches`: la tabla de memberships queda dentro de un contenedor `overflow-x-auto` para no quedar recortada por la card en 375px.
- [x] Repetir verificacion focal de `/app/coaches` en 375px tras el fix.
- [x] Documentar alcance, evidencias, hallazgos, decisiones y limitaciones en `docs/product/frontend-validation-scenarios.md`.
- [x] No tocar schema, migraciones, seeds ni tipos Supabase.
- [x] No persistir `coverage_issues`.
- [x] No hardcodear STL en rutas, componentes, permisos ni defaults.
- [x] Actualizar README, brief, MVP y TASKS.

Hallazgos:

- No se detecto overflow horizontal de pagina ni errores de consola en login, dashboard, horario, plantillas, centros, coaches o tipos para los viewports auditados.
- Los formularios auditados mantienen labels accesibles y headings principales unicos por ruta.
- `/app/coaches` tenia una tabla admin mas ancha que 375px recortada por el `overflow-hidden` de `Card`; se corrigio con scroll horizontal acotado al contenido de la card.
- La UI protegida conserva muchos controles compactos (`Button size="sm"`, inputs/selects de 32-36px) que quedan por debajo del objetivo tactil de 44px en movil. Se documenta como deuda responsive, pero no se cambio globalmente para no redisenar densidad ni alterar todas las superficies en esta tarea.
- El script de contraste marco el boton negro de login como falso positivo por normalizacion `lab(...)`; la inspeccion visual y los tokens usados no indican un problema real de contraste en ese boton.

Limitaciones:

- El audit uso tenant demo y una cuenta local temporal, no una semana real del primer tenant.
- No se valido tema de tenant persistido porque `organizations.theme_config` sigue fuera de scope.
- No se valido usuario `coach` autenticado por falta de credenciales E2E reales; el modo lectura queda cubierto por smoke opcional y por revision de UI/roles existentes.
- No se probo con lector de pantalla real ni con dispositivo fisico; se hizo verificacion automatizada de DOM, screenshots, teclado basico y viewports.

Decisiones tecnicas:

- Mantener Playwright como herramienta de audit puntual y no crear un nuevo script npm hasta que este audit se repita de forma recurrente.
- Mantener la densidad compacta de shadcn/ui en desktop/tablet; la mejora de targets tactiles debe abordarse como tarea dedicada si se decide adaptar controles por pointer/viewport.
- No convertir la tabla de memberships en cards moviles en esta tarea; el scroll horizontal es el fix minimo para evitar contenido inaccesible sin abrir una fase de redisenio.

Verificacion:

- [x] Playwright audit contra `http://127.0.0.1:3000` con 4 viewports y 7 rutas.
- [x] Playwright focal `/app/coaches` 375px despues del fix: `overflow-x: auto`, sin overflow horizontal de pagina ni errores de consola.
- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `npm run build`
- [x] `npm run test:smoke`
- [x] `rg -n "STL" src` sin coincidencias.
- [x] Comandos Supabase no aplican porque no hay migracion nueva ni cambios en tipos generados.

## Task 017 - Refactor UX/UI Operativo MVP 1

Estado: completada y validada contra el servidor local abierto.

Objetivo: mantener la funcionalidad MVP 1 ya construida, pero reorganizar la experiencia para que BoxOps se sienta como una app operativa diaria y no como un panel CRUD tecnico.

Alcance ejecutado:

- [x] Revisar brief, PRD, tareas, docs de producto, skill routing, design system y UI actual antes de tocar codigo.
- [x] Analizar problemas de la UI actual: navegacion plana, Inicio con lenguaje tecnico, Coaches mezclado con conceptos internos, Cobertura sin ruta propia, gestion con copy de implementacion visible y falta de guia inicial.
- [x] Reorganizar navegacion principal: Inicio, Horario, Cobertura, Equipo y Mas.
- [x] Implementar bottom navigation en mobile y sidebar en desktop/tablet.
- [x] Crear `/app/coverage` como cola accionable de riesgos semanales.
- [x] Crear `/app/more` para gestion, ayuda, guia y configuracion futura no implementada.
- [x] Redisenar `/app` como dashboard operativo con saludo, cobertura, resumen, pendientes y accesos rapidos.
- [x] Ajustar `/app/schedule` hacia una vista de Horario con selector de semana y tabs Semana / Mi semana / Sin cubrir.
- [x] Reetiquetar `/app/coaches` como Equipo y limpiar copy visible de membership/Auth/tenant en texto principal.
- [x] Limpiar copy visible en Centros, Tipos de actividad, Plantillas y Login.
- [x] Crear onboarding inicial con `localStorage` key `boxops_onboarding_seen_v1`.
- [x] Anadir "Reiniciar guia" desde `/app/more`.
- [x] Crear componentes reutilizables en `src/components/features/operations-ui.tsx`.
- [x] Mantener Server Components por defecto; solo onboarding usa Client Component.
- [x] No tocar schema, migraciones, seeds ni tipos Supabase.
- [x] No crear permisos de manager ni nuevos modulos fuera de MVP 1.
- [x] No hardcodear STL en `src`.

Decisiones tecnicas:

- La ruta `/app/coaches` se mantiene por compatibilidad, pero la UI y navegacion la presentan como Equipo.
- Cobertura queda separada de Inicio para que el dashboard sea resumen operativo y la resolucion viva en una cola dedicada.
- Mas/Gestion agrupa centros, tipos y plantillas sin crear una pantalla real de Configuracion.
- La guia inicial es local al navegador y no introduce schema nuevo.
- El color principal se mueve a tokens CSS base con acento teal/petroleo; los estados criticos conservan semantica propia.

Evidencia visual:

- Playwright contra `http://127.0.0.1:3000` usando el servidor ya abierto.
- Cuenta admin temporal local creada para el audit y eliminada al final.
- Viewports: 390x844 y 1280x800.
- Rutas verificadas: `/app`, `/app/schedule`, `/app/coverage`, `/app/coaches`, `/app/more`, `/app/centers`, `/app/class-types` y `/app/templates`.
- Evidencia local en `test-results/ux-refactor-2026-05-04/`.
- Fix posterior: onboarding movil centrado y visible en 390x844, con evidencia en `test-results/onboarding-mobile-fix/mobile-onboarding-centered.png`.

Limitaciones:

- El audit uso tenant demo, no una semana real del primer tenant.
- No se audito usuario `coach` autenticado por falta de credenciales E2E reales.
- La configuracion real de tema por tenant sigue fuera de scope.
- La pantalla de Configuracion en Mas queda como placeholder no disponible.
- No se implementaron Members, pagos, reservas, eventos avanzados, IA, geolocalizacion, ausencias, fichaje ni payroll.

Verificacion:

- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `npm run build`
- [x] `npm run test:smoke`
- [x] `rg -n "STL" src` sin coincidencias.
- [x] Playwright UI audit contra servidor local abierto, sin errores de consola, sin overlay de framework y sin overflow horizontal en rutas auditadas.
- [x] Supabase reset/types no aplican porque no hubo migraciones ni cambios de tipos.

## Fase 1 - Validacion Operativa Con STL

Estado: pendiente. Esta fase es de descubrimiento validado, no de implementacion generica ni de personalizacion hardcodeada.

Bloquea:

- priorizacion final del dashboard admin;
- prototipos frontend contra datos reales;
- reglas de plantillas utiles para MVP 1;
- criterios de visibilidad de coaches;
- ejemplos realistas para pruebas de cobertura;
- cualquier seed real o fixture con datos de STL.

No debe introducir:

- rutas STL;
- permisos STL;
- componentes STL;
- copy generico con nombres de STL;
- reglas especiales por tenant.

Datos y reglas a validar:

Notas de validacion recibidas el 2026-04-30:

- Recibido horario semanal con dia, hora inicio, hora fin y actividad; falta centro por bloque y coach asignado por bloque.
- Recibidos coaches iniciales, centro principal inicial y 20 horas semanales por defecto; faltan usuarios concretos para admin completo y `manager`.
- Tipos presentes en el horario recibido: Wellness, CF4Fun, Haltero Mix, CrossFit, Fit+50, Gimnásticos Fundamentos, Gimnásticos Avanzados, Halterofilia, Halterofilia Mix, Engine Community, STL SAT y Mobility.
- Problemas frecuentes esperados: bloques sin cubrir y cambios de turnos.
- Varias clases simultaneas son normales; conflicto solo si el mismo coach queda asignado a bloques solapados.
- Cada clase requiere 1 coach por defecto; cobertura insuficiente multi-coach no parece caso inicial.
- Plantillas validadas con ambas opciones: coaches por defecto y huecos vacantes.
- Certificaciones: no influyen de momento en la asignacion.
- Visibilidad coach: horario completo del equipo, clases asignadas, nombre y foto.
- Dashboard: cola de riesgos priorizada por bloques sin cubrir, conflictos graves, cobertura insuficiente, riesgos de la semana y vistas de apoyo.
- Cambios de turno/centro: requieren aprobacion de `admin` o `manager`.

- [ ] Recoger una semana real de horarios de STL Tremañes y STL City.
- [ ] Separar bloques que son clases de bloques que son recepcion, evento, competicion, open box u otra actividad.
- [ ] Confirmar para cada bloque real: centro, fecha, hora inicio, hora fin, tipo, coaches necesarios, coach asignado si existe, notas operativas y estado.
- [ ] Listar coaches activos, roles operativos y responsabilidades.
- [ ] Documentar coaches que trabajan en ambos centros.
- [ ] Confirmar si todos los coaches necesitan `coach_profile` o si hay personas no-coach que tambien tendran membership.
- [ ] Identificar tipos de clase actuales: WOD, CrossFit For Fun, Wellness, Open Box, Fundamentals, recepcion, eventos y otros.
- [ ] Confirmar nombres exactos usados por STL y longitudes habituales para evitar copy truncado en UI futura.
- [ ] Documentar clases/bloques sin cubrir o problemas frecuentes de cobertura.
- [ ] Documentar ejemplos de cobertura insuficiente con mas de un coach requerido, si existen.
- [ ] Documentar solapamientos reales o situaciones multi-centro que el producto debe detectar.
- [ ] Confirmar reglas de plantillas: semanal, mensual o ambas.
- [ ] Confirmar si la primera plantilla debe tener coach por defecto, solo bloque vacante o ambas opciones.
- [ ] Documentar si hay certificaciones necesarias por tipo de clase.
- [ ] Confirmar si coaches deben ver horario completo del equipo, solo su contexto o una vista mixta.
- [ ] Validar si el primer dashboard debe priorizar centro, coach, clases sin cubrir o cola de riesgos.
- [ ] Confirmar si eventos/festivos deben modelarse como bloques, dias completos o ambas cosas.
- [ ] Confirmar si los datos reales pueden convertirse en fixture anonimizado para pruebas.

Criterio de salida:

- [ ] `docs/tenants/stl/README.md` actualizado solo con datos validados, sin inventar informacion.
- [ ] `docs/product/open-questions.md` actualizado con respuestas o nuevas dudas concretas.
- [ ] Semana real de ejemplo lista para guiar asignaciones, plantillas y cobertura.
- [ ] Decisiones que afecten al producto generico documentadas sin contaminar `src/` con STL.

## Fase Diseño/UI - Preparacion Frontend

Estado: preparacion documental avanzada y primer refactor visible implementado. La validacion visual con una semana real de STL sigue pendiente para ajustar prioridades, textos largos y estados reales sin hardcodear el tenant.

- [x] Definir direccion visual base de BoxOps: operativa, moderna, minimalista y premium.
- [x] Documentar referencias de inspiracion sin copia literal:
  - Revolut
  - When I Work
  - Deputy
  - Google Calendar / Notion Calendar
  - Linear
- [x] Documentar navegacion movil recomendada: Hoy, Semana, Solicitudes, Calendario, Más.
- [x] Documentar pantallas clave futuras en `docs/product/screen-map.md`.
- [ ] Validar direccion visual con una semana real de STL.
- [x] Definir tokens base neutrales: color, tipografia, spacing, radius, sombras, estados y densidad responsive.
  - `docs/product/design-tokens.md`
- [x] Definir modelo de theming por tenant sin hardcodear STL.
  - `docs/product/theming.md`
- [x] Documentar aplicacion de tokens a pantallas clave: Coach Today Dashboard, Weekly Schedule, Team Schedule by Center, Admin Coverage Dashboard, Requests Inbox y Monthly Calendar.
- [x] Documentar criterios de aceptacion visual y UX para futura fase frontend.
  - `docs/product/frontend-acceptance-criteria.md`
- [x] Diseñar prototipos mobile-first para Coach Today Dashboard y Weekly Schedule.
  - `docs/product/frontend-wireframes.md`
- [x] Diseñar prototipos desktop/tablet para Team Schedule by Center y Admin Coverage Dashboard.
  - `docs/product/frontend-wireframes.md`
- [x] Definir modelo visual de estados para cubierto, sin cubrir, cobertura insuficiente, conflicto/solapamiento, pendiente, aprobado, rechazado, extra, evento, festivo, cancelado, completado y cambiado.
  - `docs/product/visual-state-model.md`
- [x] Documentar uso de tokens, theming, densidad responsive, navegacion y empty/loading/error/readonly states por pantalla.
  - `docs/product/frontend-wireframes.md`
- [x] Hacer audit documental de accesibilidad, responsive y theming antes de cerrar la preparacion frontend.
  - `docs/product/frontend-validation-scenarios.md`
- [ ] Validar prototipos documentales con una semana real del primer tenant y ajustar prioridades si aparecen casos no cubiertos.
- [x] Validar prototipos con un segundo tenant conceptual para asegurar que no hay supuestos del primer tenant.
  - `docs/product/frontend-validation-scenarios.md`
- [x] Confirmar reglas de calculo para `covered`, `uncovered`, `insufficient`, `conflict`, `pending`, `approved`, `rejected`, `extra`, `event`, `holiday`, `cancelled`, `completed` y `changed` antes de implementarlas.
  - `docs/product/coverage-state-rules.md`
- [x] Decidir persistencia futura de configuracion visual de tenant (`organizations.theme_config` o tabla dedicada) antes de implementar theming.
  - `docs/product/theme-config-decision.md`
- [x] Repetir audit de accesibilidad, responsive y theming sobre UI implementada con viewports reales.
  - Task 016, `docs/product/frontend-validation-scenarios.md`
- [ ] Validar reglas de estados con una semana real del primer tenant.
- [x] Definir datos publicos de persona para no mostrar UUIDs en horarios finales.
- [ ] Preparar migracion futura para `organizations.theme_config` solo cuando empiece la implementacion de theming.
- [x] Convertir tokens documentados a CSS custom properties solo cuando empiece la fase frontend.
  - Task 017, `src/app/globals.css`.

## Fase 2 - MVP 1: Horarios Y Cobertura

Estado: parcialmente completada. La base multi-tenant, la gestion manual de bloques, las asignaciones reales, el calculo basico de cobertura, los filtros operativos, "Mi horario", plantillas semanales basicas, Inicio operativo, cola de Cobertura separada, navegacion mobile-first, onboarding local, smoke tests base y audit real de UI implementada existen; la validacion real con STL sigue pendiente.

### 2.0 Base completada

- [x] Scaffold tecnico minimo Next.js/Supabase/Tailwind.
- [x] Inicializar shadcn/ui cuando se cree la primera pantalla de producto.
- [x] Auth y membership por organizacion.
- [x] Gestion basica de centros.
- [x] Gestion basica de usuarios/coaches.
- [x] Catalogo de tipos de clase/actividad.
- [x] Crear/editar/cancelar bloques operativos semanales.

### 2.1 Desbloqueadores antes de dashboard y frontend real

- [x] Ejecutar el resto tecnico de Task 008 para cerrar asignaciones y cobertura generica sin esperar a datos reales de STL.
- [x] Ejecutar Task 009 para crear perfiles visibles/personas operativas pendientes de Auth.
- [x] Definir datos publicos de persona para horarios/asignaciones:
  - nombre visible;
  - email visible si procede;
  - relacion con `auth.users`;
  - visibilidad por tenant;
  - reglas para no exponer datos entre organizaciones.
- [x] Crear migracion de perfil publico/persona con `person_profiles`.
- [x] Decidir si el siguiente corte de asignaciones usa solo `schedule_block_assignments` existente o necesita campos adicionales.
- [x] Definir query/calculo generico de cobertura:
  - `covered`;
  - `uncovered`;
  - `insufficient`;
  - `conflict`;
  - `pending`;
  - `changed`;
  - `cancelled`;
  - `completed`.
- [x] Decidir si `coverage_issues` se calcula al vuelo o se persiste mas adelante.
- [ ] Validar una semana real del primer tenant en Fase 1 antes de cerrar dashboard final, plantillas reales y fixtures reales.

### 2.2 Asignaciones y filtros operativos

- [x] Asignar coach a bloque usando `schedule_block_assignments`.
- [x] Editar o retirar asignacion sin borrar historial critico.
- [x] Respetar `organization_id` en bloque, coach profile y assignment.
- [x] Validar que el coach asignado pertenece a la misma organizacion y sigue activo.
- [x] Permitir multiples coaches cuando `required_coaches > 1`.
- [x] Filtrar horario por centro.
- [x] Filtrar horario por coach.
- [x] Filtrar horario por tipo de clase/actividad.
- [x] Filtrar por estado operativo.
- [x] Crear vista o filtro "mi horario" cuando existan asignaciones reales.
- [x] Crear filtro "solo riesgos" incluyendo `uncovered`, `insufficient` y `conflict`.

### 2.3 Cobertura basica

- [x] Deteccion basica de bloques sin cubrir basada en asignaciones validas, no solo en `schedule_blocks.status`.
- [x] Deteccion basica de cobertura insuficiente con ratio asignados/requeridos.
- [x] Deteccion basica de solapamientos de coach por fecha y rango horario.
- [x] Excluir bloques `cancelled` y `completed` de riesgos activos.
- [x] Mostrar coaches pendientes/rechazados como metadata, no como cobertura valida.
- [x] Documentar cualquier decision nueva de calculo en `docs/product/coverage-state-rules.md`.

### 2.4 Plantillas semanales

- [x] Crear plantilla semanal basica con `schedule_templates`.
- [x] Crear bloques de plantilla con `schedule_template_blocks`.
- [x] Permitir plantillas con coach por defecto y con huecos vacantes, validado con STL el 2026-04-30.
- [x] Aplicar plantilla a una semana real creando `schedule_blocks`.
- [x] Marcar excepciones con `is_template_exception` cuando se modifique un bloque aplicado.
- [x] Evitar duplicados al aplicar una plantilla dos veces sobre la misma semana.
- [x] Documentar reglas de excepcion si cambian respecto a `docs/architecture/domain-model.md`.

### 2.5 Dashboard admin y experiencia visible

- [x] Dashboard admin de cobertura basado en cola de riesgos accionables: bloques sin cubrir, conflictos graves, cobertura insuficiente, riesgos de la semana y vistas de apoyo.
- [x] Enlazar cada riesgo a bloque, asignacion o solicitud cuando exista.
- [x] Estados loading/error/empty/readonly en superficies nuevas.
- [x] Repetir audit de accesibilidad, responsive y theming sobre UI implementada con viewports reales.
- [x] Revisar `rg -n "STL" src` antes de cerrar cada superficie.
- [x] Smoke tests basicos de rutas protegidas y flujos MVP 1.

Dependencias de schema/migraciones futuras:

- [x] Perfil publico/persona para evitar UUIDs en horarios, asignaciones y dashboard.
- [ ] `organizations.theme_config` solo cuando empiece theming real.
- [ ] Historial/auditoria de cambios si las excepciones de plantilla necesitan "antes -> despues" fiable.
- [ ] Tablas de solicitudes (`change_requests`) quedan para MVP 2, no deben bloquear MVP 1 salvo que STL demuestre que son imprescindibles para validar cobertura.

## Fase 3 - MVP 2: Cambios, Cobertura Y Ausencias

- [ ] Solicitar cambio de horario/clase.
- [ ] Pedir cobertura a compañero concreto.
- [ ] Pedir cobertura a varios disponibles.
- [ ] Aceptar/rechazar solicitud recibida.
- [ ] Aprobacion admin cuando aplique.
- [ ] Aplicar cambio al horario.
- [ ] Historial de cambios.
- [ ] Solicitar vacaciones, dia libre, medio dia, ausencia puntual, permiso o baja.
- [ ] Calendario mensual/anual de ausencias.
- [ ] Impacto de ausencias sobre cobertura.

## Fase 4 - MVP 3: Eventos, Festivos Y Horas Extra

- [ ] Crear eventos internos/externos.
- [ ] Crear competiciones/seminarios/open days.
- [ ] Marcar interes/asistencia/no disponibilidad/quiero trabajarlo.
- [ ] Crear turnos o bloques especiales de festivo.
- [ ] Flujo voluntario para trabajar festivo.
- [ ] Deteccion de impacto de eventos sobre cobertura.
- [ ] Tracking interno de horas extra.
- [ ] Validacion admin de horas extra.
- [ ] Cierre mensual simple.

## Fase 5 - MVP 4: Fichaje

- [ ] Fichaje manual.
- [ ] Vincular fichaje a turno/bloque asignado.
- [ ] Correcciones de fichaje con motivo.
- [ ] Aprobacion/rechazo admin.
- [ ] Reglas de ventana temporal.
- [ ] Fichaje asistido por geolocalizacion como sugerencia controlada.
- [ ] Documentar consentimiento y retencion de datos antes de datos reales.

## Fase 6 - MVP 5: Documentos, Firmas Y Certificaciones

- [ ] Repositorio de documentos laborales por empleado.
- [ ] Documentos de empresa.
- [ ] Apartado de documentos publicos de equipo, visibles para miembros activos segun permisos del tenant.
- [ ] Apartado de documentos de gestion/admin, visible solo para `admin` en el primer corte.
- [ ] Apartado de documentos particulares de cada miembro, visibles para la persona afectada y roles autorizados.
- [ ] Permisos diferenciados para documentos sensibles.
- [ ] Permitir que un documento subido se marque como `requires_signature`.
- [ ] Permitir elegir que miembros/personas deben firmar cada documento requerido.
- [ ] Guardar estado de firma por firmante: pendiente, firmado, rechazado/anulado si aplica.
- [ ] Crear firma dibujada desde el perfil del usuario, inspirada en el flujo de ShiftSwap.
- [ ] Permitir firmar con una accion simple que inserte una copia/snapshot de la firma en el documento o genere una version firmada.
- [ ] Mantener auditoria minima de firma: documento/version, firmante, fecha, usuario autenticado y estado.
- [ ] Cursos/certificaciones de coaches.
- [ ] Fechas de obtencion/caducidad.
- [ ] Adjuntos de certificados.
- [ ] Documentos/enlaces de programacion asociados a clase, tipo o fecha.
- [ ] Boton "ver programacion" desde horario.
- [ ] Validar requisitos legales antes de presentar la firma como firma electronica avanzada/cualificada.

## Fase 7 - MVP 6: IA Sobre Programacion

- [ ] Subida de PDFs de programacion.
- [ ] Extraccion por dia/clase.
- [ ] Consulta en lenguaje natural sobre programacion.
- [ ] Resumen de material, escalados y notas.

## Backlog Futuro

- [ ] Billing por organizacion/centro/coach.
- [ ] Onboarding de nuevo box.
- [ ] Permisos avanzados por centro.
- [ ] Exportes CSV/PDF.
- [ ] Integraciones con reservas/alumnos.
- [ ] App movil nativa.
- [ ] Validacion automatica de certificaciones contra tipos de clase.
- [ ] Geofencing avanzado, si legal y operativamente procede.
