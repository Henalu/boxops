# Project Brief - BoxOps

## Proyecto

BoxOps es un SaaS operativo para boxes de CrossFit. Gestiona horarios semanales, coaches, clases, centros, cobertura, plantillas, cambios de turno/clase, vacaciones, festivos, eventos, horas extra, fichaje, documentos laborales, firmas documentales, certificaciones y programacion de clases.

La primera implementacion sera para STL, pero BoxOps debe poder venderse a otros boxes sin reescribir arquitectura, copy ni permisos. STL es el primer tenant real, no la marca del producto.

El hueco del producto es claro: herramientas tipo Factorial resuelven RRHH generico, pero no la operativa real de un box. BoxOps debe empezar por donde esas herramientas fallan: semana completa, multi-centro, clases asignadas, cobertura y cambios.

## Estado Actual

Task 017 implementada: existe base tecnica con Next.js 16 App Router, React 19, TypeScript estricto, Tailwind CSS 4, shadcn/ui, Supabase SSR Auth, resolucion multi-tenant por membership, superficies protegidas de MVP 1, perfiles visibles/personas operativas pendientes de Auth, asignaciones coach-bloque, cobertura basica semanal, filtros operativos, "Mi horario", plantillas semanales basicas, dashboard operativo, cola de cobertura, navegacion mobile-first, onboarding local, smoke tests basicos de rutas protegidas/flujos MVP 1 y audit real de accesibilidad/responsive/theming sobre la UI implementada.

Ya existe:

- Login minimo en `/login`.
- Callback auth en `/auth/callback`.
- Sign out en `POST /auth/sign-out`.
- `src/proxy.ts` protegiendo `/app`.
- Shell protegido bajo `/app`.
- Navegacion minima:
  - `/app`
  - `/app/coverage`
  - `/app/more`
  - `/app/centers`
  - `/app/coaches`
  - `/app/class-types`
  - `/app/schedule`
  - `/app/templates`
- Helpers server:
  - `getAuthenticatedUser`
  - `getActiveMemberships`
  - `resolveActiveOrganization`
- `organization_memberships` como fuente de rol y tenant.
- Resolucion explicita de `organizationId` si hay varias memberships activas.
- Gestion basica de centros por organizacion activa:
  - listar centros
  - crear centro minimo
  - editar nombre, slug, timezone y status
  - activar/desactivar centro
- Gestion basica de usuarios/coaches por organizacion activa:
  - listar memberships visibles del tenant
  - crear membership minima con `user_id` existente de Supabase Auth
  - editar rol y estado de membership sin borrar filas
  - crear y editar `coach_profiles` minimos
- Modelo de perfiles visibles/personas operativas:
  - `person_profiles` por organizacion
  - perfiles pendientes de Auth con `user_id` opcional
  - perfiles internos/ocultos para usuarios tecnicos
  - enlace opcional desde `coach_profiles`
- Catalogo basico de tipos de clase/actividad por organizacion activa:
  - listar tipos del tenant
  - crear tipo minimo
  - editar nombre, slug, categoria, coaches necesarios, certificacion, color y estado
  - activar/desactivar tipos sin borrar filas
- Primera gestion semanal de bloques operativos por organizacion activa:
  - listar bloques del tenant filtrados por semana
  - crear bloque minimo con centro, tipo de actividad, fecha, horas, coaches necesarios, estado y notas
  - editar esos mismos campos
  - cancelar bloques con `status = 'cancelled'` sin borrar filas
- Asignaciones operativas y cobertura basica en `/app/schedule`:
  - `schedule_block_assignments` como fuente canonica de coach-bloque real
  - coaches asignables desde `coach_profiles` + `person_profiles`
  - nombres visibles desde `person_profiles.display_name`
  - retirar asignaciones con `assignment_status = 'removed'`, sin borrar filas
  - cobertura calculada al vuelo como `covered`, `uncovered`, `insufficient` o `conflict`
  - conflictos por mismo coach en bloques activos solapados el mismo dia
- Roles MVP aplicados:
  - `admin` gestiona centros
  - `admin` gestiona usuarios/coaches basicos
  - `admin` gestiona tipos de clase/actividad
  - `admin` gestiona bloques operativos semanales basicos y asignaciones
  - `coach` consulta centros y coaches en modo lectura
  - `coach` consulta tipos de clase/actividad en modo lectura
  - `coach` consulta bloques operativos, asignaciones y cobertura en modo lectura
- Plantillas semanales basicas en `/app/templates`:
  - crear y editar plantillas semanales `schedule_templates`
  - crear y editar bloques de plantilla `schedule_template_blocks`
  - permitir bloques vacantes o con `default_coach_profile_id`
  - aplicar plantillas activas a una semana creando `schedule_blocks`
  - crear asignaciones `source = 'template'` para coaches por defecto
  - evitar duplicar bloques al aplicar dos veces la misma plantilla sobre la misma semana
  - marcar `is_template_exception = true` cuando un bloque aplicado se edita o cancela
- Dashboard operativo en `/app`:
  - saludo, cobertura de la semana, resumen, pendientes y acciones rapidas
  - atajos a horario, cobertura, equipo, centros, tipos y plantillas
- Cola de cobertura en `/app/coverage`:
  - riesgos accionables ordenados por `uncovered`, `conflict` e `insufficient`
  - enlaces desde cada riesgo al bloque real en `/app/schedule`
  - lista compacta de todas las clases de la semana con estado
  - vistas de apoyo por centro con atajos filtrados al horario semanal
  - estados empty, loading, error y lectura para roles no admin
- Shell UX/UI Task 017:
  - bottom navigation en mobile con Inicio, Horario, Cobertura, Equipo y Mas
  - sidebar en desktop/tablet con Principal y Gestion
  - `/app/more` agrupa gestion, ayuda y Configuracion pendiente
  - onboarding local con `boxops_onboarding_seen_v1`
- Smoke tests basicos:
  - `/login` como superficie publica de auth
  - redireccion anonima de `/app`, centros, coaches, tipos, horario y plantillas a `/login`
  - flujos autenticados opcionales para `admin` y `coach` mediante variables E2E
  - uso por defecto de `http://127.0.0.1:3000` o `E2E_BASE_URL`, sin arrancar dev server salvo `E2E_START_SERVER=1`
- Audit real UI:
  - Playwright contra `http://127.0.0.1:3000` usando el servidor ya abierto
  - viewports 375x812, 390x844, 768x1024 y 1280x800
  - rutas auditadas: login, dashboard, horario, plantillas, centros, coaches y tipos
  - evidencia local en `test-results/frontend-audit-2026-05-04/`
  - fix acotado en `/app/coaches` para que la tabla de memberships no quede recortada en movil
  - Task 017 audito Inicio, Horario, Cobertura, Equipo, Mas, Centros, Tipos y Plantillas en 390x844 y 1280x800
  - evidencia local de Task 017 en `test-results/ux-refactor-2026-05-04/`
  - deuda pendiente: targets tactiles moviles de controles compactos si se decide endurecer UX movil

Todavia no hay cambios, invitaciones, ausencias, fichaje, documentos, area personal/RRHH, firma dibujada reutilizable, roles avanzados, branding real por tenant ni CRUD avanzado.

Estado consolidado 2026-05-06:

- MVP 1 debe tratarse como base visual/operativa ya avanzada, no como plan pendiente.
- Fase A ya tiene una semana de prueba STL L-V cargable localmente con `supabase/snippets/stl-test-week-2026-05-04.sql`: 165 bloques, una plantilla activa y bloques vacantes sin coaches inventados.
- La UI y el smoke E2E local admin/coach ya pasan contra esa semana; `/app/templates` edita un bloque por URL y ofrece vistas Semana/Agenda para mantener usable una plantilla grande.
- La siguiente prioridad no es implementar modulos nuevos a ciegas, sino cerrar MVP 1 real con centro por bloque, asignaciones/huecos confirmados y validacion operativa antes de ordenar fases posteriores.
- Las nuevas fases deben ampliar BoxOps hacia configuracion de tenant, seguridad auth, roles avanzados, area personal/RRHH, documentos, fichaje y futura app movil.
- Esta revision no implementa codigo de app, migraciones ni seeds automaticos.

## Roadmap Actual

La vista resumida vive en `docs/product/roadmap.md` y el backlog ejecutable en `TASKS.md`.

- Fase A: cierre MVP 1 real con datos validados y deuda pequena.
- Fase B: configuracion de tenant, branding y roles avanzados.
- Fase C: auth/security polish.
- Fase D: area personal y modelo RRHH.
- Fase E: documentos, permisos, nominas, firmas y certificaciones.
- Fase F: fichaje manual legal/auditable.
- Fase G: fichaje geolocalizado asistido.
- Fase H: PWA/app movil y geofencing nativo.
- Fase I: cambios, ausencias, eventos, horas extra e IA.

## Objetivo Inicial

Crear una base clara para construir un MVP operativo vendible:

- Producto generico multi-tenant.
- Primer caso real: STL.
- Arquitectura ligera pero preparada para varios boxes.
- Primer MVP centrado en horarios, bloques operativos, plantillas y cobertura.
- Documentacion suficiente para que la siguiente sesion empiece por schema, auth y flujos, no por reconstruir contexto.

## Referencias DEV Reutilizadas

- Plantilla `next-web-app.md` para SaaS con auth, dashboard y datos.
- ShiftSwap como referencia de producto operativo con turnos, calendario, roles, Supabase y validaciones.
- LocalHero como referencia de fase 0 documentada antes de escribir codigo.
- Design System interno para futuras pantallas admin y mobile-first.
- Direccion UI futura documentada para mantener BoxOps operativo, moderno, minimalista y premium sin copiar referencias.
- Lessons learned: no empezar por polish visual; definir modelo de datos, RLS y estados antes de construir UI grande.
- Principios de producto: MVP acotado, reutilizar patrones, documentar decisiones y separar backlog de alcance inicial.

## Stack Actual

- Next.js 16 App Router.
- React 19 + TypeScript estricto.
- Tailwind CSS 4.
- `@supabase/supabase-js` y `@supabase/ssr`.
- Radix UI + shadcn/ui inicializado en la primera UI protegida de producto.
- Supabase Auth, Postgres, Realtime y Storage.
- Vercel.
- Playwright para smoke tests basicos de rutas protegidas y flujos MVP 1.

El scaffold se creo manualmente sobre el repo existente para preservar documentacion, migraciones y seeds.

## Modelo De Dominio Inicial

La jerarquia base debe mantenerse visible en todo el producto:

```text
Organization/Tenant
  Centers
    Users / Coaches
    Schedules
      Classes / Blocks
        Events
```

### Entidades

- `organizations`: tenant/cliente que paga y aisla datos.
- `centers`: sedes fisicas de una organizacion.
- `users`: personas autenticadas.
- `organization_memberships`: relacion usuario-organizacion con rol.
- `coach_profiles`: capacidad operativa de coach, separada del usuario base.
- `class_types`: catalogo de tipos de clase/actividad.
- `schedule_templates`: plantillas semanales/mensuales.
- `schedule_blocks`: unidad minima del horario. Puede ser clase, recepcion, evento, competicion u otra actividad.
- `schedule_block_assignments`: asignacion de coaches a bloques.
- `events`: cambios o hechos operativos auditables: sustituciones, vacaciones, horas extra, fichaje, documentos, incidencias o cambios de clase.

La tabla exacta puede ajustarse al diseñar el schema, pero el limite de tenant no es opcional. Ver `docs/architecture/domain-model.md`.

## Separacion Producto vs STL

Producto generico:

- Nombre: BoxOps.
- Rutas, componentes, roles, permisos, tablas y copy deben ser genericos.
- Las features se diseñan para cualquier box con una o varias sedes.

Primer tenant:

- Organizacion: STL.
- Centros iniciales: STL Tremañes y STL City.
- Datos, horarios reales, coaches y reglas especificas viven en seeds/configuracion/documentacion de tenant.
- No se permiten nombres STL en componentes genericos, variables globales ni policies.

Ver `docs/tenants/stl/README.md`.

## Roles Y Permisos

Roles implementados hoy:

- `admin`: gestiona centros, usuarios/coaches basicos, tipos de actividad, horario, asignaciones, plantillas y cobertura.
- `coach`: consulta centros, equipo, tipos, horario, asignaciones y cobertura en modo lectura.

Evolucion recomendada sin romper lo existente:

- `owner` o `superadmin`: configuracion global de organizacion, branding, billing futuro, permisos maximos y decisiones sensibles de tenant.
- `manager` o `admin`: gestion diaria de equipo, horarios, plantillas, cobertura, aprobaciones y operaciones.
- `coach`: uso operativo, horario, cobertura visible segun permisos, documentos propios, fichaje y funciones personales.
- roles especializados futuros: `document_admin`, `payroll_manager`, `center_manager` si la matriz de permisos lo justifica.

Reglas:

- Separar permisos de configuracion global de permisos de gestion diaria.
- Todos los usuarios, incluidos admins/owners, deben acceder a funciones personales porque un admin puede ser coach.
- No asumir que un rol operativo alto puede ver salario, nominas o documentos sensibles sin permiso explicito.
- Mantener compatibilidad con `admin` y `coach` actuales hasta una migracion/feature flag de roles avanzada.

## Alcance MVP

El MVP no es "todo BoxOps". Es una primera operativa util para STL que valide venta a otros boxes.

MVP 1 incluye:

- Multi-tenant foundation.
- Centros por organizacion.
- Usuarios/coaches con roles.
- Tipos de clase/actividad.
- Horario semanal multi-centro.
- Bloques operativos con centro, hora, coach, estado y notas.
- Filtros por centro, coach, tipo y bloques sin cubrir.
- Plantillas semanales basicas.
- Deteccion basica de cobertura insuficiente.
- Dashboard admin basico de cobertura.

Estado: MVP 1 visual/operativo esta avanzado tras Task 017. Queda cerrar datos reales, deuda pequena y validacion operativa antes de abrir modulos nuevos.

Fuera de scope inicial:

- App movil nativa.
- Marketplace de coaches entre boxes.
- Pagos avanzados o billing automatizado.
- CRM de alumnos.
- Programacion deportiva/WOD builder avanzado.
- Integraciones con software externo de reservas.
- Fichaje geolocalizado.
- Nominas o payroll completo.
- IA sobre documentos de programacion.
- Branding libre por tenant o rebranding completo del producto.
- Documentos sensibles, fichaje y geolocalizacion sin revision legal/privacidad.
- Firma dibujada reutilizable o firma documental sin almacenamiento privado, snapshot y auditoria.

Ver `docs/product/mvp.md`.

## Decisiones Iniciales

| Decision | Motivo |
|---|---|
| BoxOps como producto generico | Evita convertir el piloto STL en software a medida imposible de vender. |
| `organization` como frontera de tenant | Es el limite natural para RLS, billing, configuracion y exportaciones. |
| Centros debajo de organizacion | STL tiene varias sedes y otros boxes tambien pueden tenerlas. |
| Coaches como usuarios con perfil/capacidad | Un coach tambien puede ser admin o manager; no conviene duplicar identidad. |
| Bloque operativo como unidad minima | No todo en un box es una clase: tambien hay recepcion, eventos, competiciones y otras tareas. |
| MVP 1 centrado en horarios/cobertura | Es el diferenciador frente a RRHH generico y desbloquea cambios, ausencias, horas y fichaje. |
| Events como log operativo flexible | Cambios de turno, vacaciones, horas extra y documentos comparten necesidad de trazabilidad. |
| Fichaje geolocalizado fuera del MVP 1 | Tiene riesgo legal/privacidad y depende de horarios fiables. |
| IA fuera de las primeras fases | Sin documentos y programacion bien modelados, seria decoracion cara. |
| `organizations.theme_config` como primera opcion | El branding inicial es ligero y pertenece a la organizacion activa; una tabla dedicada se reserva para permisos/versionado complejos. |
| Estados criticos no tematizables | Sin cubrir, conflicto, error y foco deben seguir siendo reconocibles por encima de marca de tenant, centro o tipo. |
| Roles avanzados separados por responsabilidad | Configuracion global, gestion diaria y funciones personales no deben mezclarse en un unico `admin` permanente. |
| Reset de password con Supabase Auth | La regla de seguridad debe vivir en Auth y repetirse en la app solo para feedback visual. |
| Fichaje manual antes de geolocalizacion | Permite cumplir mejor auditoria/correcciones antes de depender de ubicacion y permisos moviles. |
| PWA/web antes de nativo | La app nativa se evalua si el caso comercial exige geofencing fiable con app cerrada. |
| "Mi firma" antes de documentos firmables | La firma dibujada reutilizable pertenece al perfil/cuenta del usuario; los botones "Firmar" deben consumirla despues y guardar snapshot/auditoria. |
| Docs antes de codigo | Reduce decisiones implicitas y evita empezar por UI sin schema ni permisos. |

## Supuestos

- STL es un cliente piloto disponible para aportar horarios, centros, coaches y reglas reales.
- La primera venta probable sera mensualidad por organizacion/centro, con setup inicial si hay personalizacion.
- Supabase es suficiente para el MVP: Postgres + RLS + Auth + Storage.
- El producto se usara principalmente en desktop/tablet por admins y en movil por coaches.
- Los documentos pueden empezar como archivos en Storage con metadata en Postgres.
- Algunos documentos podran requerir firma de miembros concretos.
- "Mi firma" sera una capacidad personal disponible para todos los usuarios, incluidos admins, managers y coaches.
- La firma dibujada vive en "Mi perfil"/"Mi cuenta", se crea dibujandola en pantalla, se puede borrar/redibujar antes de guardar y se reutiliza despues cuando el usuario pulse "Firmar".
- Para el primer corte se recomienda que la firma sea tenant-scoped (`organization_id` + `person_profile_id`) si encaja con RLS y documentos laborales; la alternativa global por usuario queda como duda abierta.
- La firma guardada debe estar en Storage privado o mecanismo equivalente, con metadata en Postgres y frontera de tenant; nunca como asset publico.
- Actualizar la firma no cambia documentos ya firmados.
- Al firmar, no basta con apuntar a la firma actual del perfil: debe guardarse un snapshot/version de la firma usada y evidencia/auditoria de esa firma concreta.
- Un admin no puede firmar en nombre de otra persona usando su firma guardada.
- La firma dibujada se trata inicialmente como firma/confirmacion interna; no es firma electronica avanzada/cualificada sin validacion legal.
- El fichaje puede empezar simple y evolucionar; no se diseña todavia control laboral completo.
- La geolocalizacion de fichaje, si existe, sera puntual y vinculada a turno/centro; no seguimiento continuo.
- Horas extra sera tracking interno validable/exportable, no generacion de nominas.
- Los documentos sensibles usaran Storage privado, RLS, URLs firmadas y auditoria si procede.
- Nominas, salario/retribucion, contrato, jornada y datos laborales requieren permisos mas finos que el rol operativo basico.
- En Espana, el fichaje debe contemplar inicio/fin de jornada, conservacion de registros durante 4 anos y acceso para trabajador, representantes e Inspeccion, pendiente de revision legal antes de prometer cumplimiento.
- La geolocalizacion en navegador/PWA no debe asumirse fiable con app cerrada; geofencing en segundo plano requerira fase nativa o wrapper movil si se vuelve requisito comercial.

## Convenciones

- Comunicacion y documentacion: español directo.
- Codigo futuro: nombres en ingles.
- Archivos: `kebab-case`.
- Componentes React: `PascalCase`.
- Funciones/variables: `camelCase`.
- Tipos/interfaces: `PascalCase`.
- DB: `snake_case`.
- Server Components por defecto cuando exista Next.js.
- RLS desde la primera migracion que toque datos de tenant.

## Comandos

Comandos actuales:

```bash
npm run dev
npm run lint
npm run test:smoke
npm run typecheck
npm run build
npm run supabase:start
npm run supabase:status
npm run supabase:reset
npm run supabase:types
```

## Proximos Pasos

1. Cerrar Fase A: validar MVP 1 con una semana real, plantillas, excepciones, asignaciones, cobertura y deuda pequena sin hardcodear STL.
2. Preparar Fase B: configurar tenant/branding con `organizations.theme_config`, validacion de contraste y roles avanzados compatibles.
3. Preparar Fase C: reset de password, politica de contrasena y decision tecnica sobre bloqueo/cooldown sin enumeracion de emails.
4. Modelar Fase D: separar area personal, datos operativos y datos RRHH sensibles.
5. Modelar Fase E: documentos privados, permisos por rol/persona, nominas/certificaciones, botones "Firmar", snapshots de firma, Storage privado y auditoria.
6. Modelar Fase F antes de geolocalizacion: fichaje manual, correcciones, aprobacion semanal, exportes y revision legal.
7. Dejar Fase G/H condicionadas: geolocalizacion asistida y app movil/nativa solo si privacidad, tecnica y negocio lo justifican.
8. Reordenar cambios, ausencias, eventos, horas extra e IA en Fase I, despues de no romper la base operativa.

## Documentos De Referencia

- `PRD.md`: vision funcional general.
- `docs/product/mvp.md`: fases MVP y criterios de exito.
- `docs/product/roadmap.md`: vista resumida de fases A-I despues de Task 017.
- `docs/product/design-direction.md`: direccion visual, theming y estados UI para futuras fases.
- `docs/product/design-tokens.md`: propuesta documental de tokens base neutrales y densidad responsive.
- `docs/product/theming.md`: modelo de theming multi-tenant sin hardcodear el primer tenant.
- `docs/product/frontend-acceptance-criteria.md`: criterios visuales y UX para futura fase frontend.
- `docs/product/ui-decisions.md`: decisiones del refactor UX/UI operativo.
- `docs/product/frontend-wireframes.md`: prototipos documentales de Coach Today, Weekly Schedule, Team Schedule by Center y Admin Coverage.
- `docs/product/visual-state-model.md`: modelo visual de estados operativos y precedencia frente a tenant/centro/tipo.
- `docs/product/ux-principles.md`: principios UX por rol, navegacion y criterios de calidad.
- `docs/product/screen-map.md`: pantallas clave futuras y su aplicacion por fase.
- `docs/product/ui-references.md`: referencias de diseño y producto usadas como inspiracion, no copia.
- `docs/product/open-questions.md`: dudas pendientes.
- `docs/architecture/domain-model.md`: entidades candidatas.
- `docs/architecture/tenancy-and-billing.md`: decision de tenancy, infraestructura y modelo de cobro.
- `docs/guides/README.md`: guias personales para volver al proyecto sin reconstruirlo entero.
- `docs/user-guides/README.md`: guias de uso por rol, incompletas donde el producto aun no existe.
- `docs/operations/legal-and-privacy-notes.md`: notas sobre fichaje, privacidad, horas extra y documentos.
- `docs/tenants/stl/README.md`: casuistica del primer tenant.
- `docs/tenants/stl/design-notes.md`: notas visuales del primer tenant sin contaminar producto generico.
