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

Todavia no hay cambios, invitaciones, ausencias, fichaje, documentos, RRHH sensible, firma documental, branding avanzado por tenant ni CRUD avanzado. El area personal existe como corte seguro en `/app/account`, con perfil visible propio, avatar privado propio y firma interna propia.

Estado consolidado 2026-05-08:

- MVP 1 debe tratarse como base visual/operativa ya avanzada, no como plan pendiente.
- Fase A tiene una semana de prueba STL L-V cargable localmente con `supabase/snippets/stl-test-week-2026-05-04.sql`: 165 bloques, una plantilla activa y bloques vacantes sin coaches inventados.
- Fase A tambien tiene una muestra interna opcional en `supabase/snippets/stl-internal-assignment-sample-2026-05-04.sql`: 20 coaches por defecto/asignaciones, 145 vacantes, 1 insuficiencia y 1 conflicto deliberado para QA interno y smoke tests.
- El flujo `/app/coaches` puede vincular una ficha operativa pendiente (`person_profiles` + `coach_profiles`) con una cuenta Auth/membership existente por `user_id`; no crea cuentas ni envia invitaciones reales.
- La UI y el smoke E2E local admin/coach pasan contra esa semana; `/app/templates` edita un bloque por URL y ofrece vistas Semana/Agenda para mantener usable una plantilla grande, y el smoke cubre `/app/schedule?mine=1`.
- Fase A queda cerrada para QA interno, sin considerarse validacion oficial ni produccion. La siguiente validacion de producto es que STL revise centro por bloque, asignaciones reales o huecos intencionados antes de mover datos a seed/produccion.
- Fase B.1 implementa configuracion generica minima en `/app/settings`: `admin` edita nombre visible y `organizations.theme_config.accentColor`; `coach` queda en lectura; el acento se aplica como marca ligera sin tematizar estados criticos, error ni foco.
- Fase B.2 implementa permisos avanzados compatibles: `owner` y `admin` controlan configuracion global y accesos, `manager` gestiona operativa tenant-wide de MVP 1 sin tocar configuracion global ni roles, y `coach` conserva lectura/uso operativo sin mutaciones.
- Fase C implementa auth/security polish minimo: enlace "He olvidado mi contrasena", solicitud de reset generica sin enumeracion, callback Supabase SSR hacia `/reset-password`, validacion minima de contrasena y decision de mantener rate limits nativos de Supabase por ahora.
- Fase D.1 implementa area personal minima en `/app/account`: cuenta/Auth en lectura, edicion propia de `person_profiles.display_name`, `preferred_alias` y `public_email`, ficha de coach propia en lectura, avatar y "Mi firma" como pendientes, sin Storage ni datos RRHH sensibles.
- Fase D.2 documenta la matriz de permisos por campo en `docs/architecture/personal-data-permissions.md`: no cambia UI ni schema, y deja avatar privado, firma real, documentos y RRHH sensible bloqueados hasta tener Storage/RLS/permisos explicitos.
- Fase D.3 documenta el modelo de avatar privado tenant-scoped: `profile_assets` como candidato futuro, artefacto privado, lectura controlada/signed URL corta y acciones propias derivadas de sesion + tenant. No cambia `src`, migraciones, Storage ni UI.
- Fase D.4 implementa el primer avatar privado minimo propio: `profile_assets`, bucket privado `profile-assets`, RLS/RPC de metadata, policies de Storage por ruta tenant/persona y subida/reemplazo desde `/app/account` sin aceptar `person_profile_id` ni usar `person_profiles.avatar_url` como URL publica.
- Fase D.5 implementa "Mi firma" propia reutilizable privada: `profile_signatures`, bucket privado `profile-signatures`, RLS/RPC de metadata, policies de Storage por ruta tenant/persona y canvas minimo en `/app/account`, sin documentos firmables ni boton "Firmar".
- Fase E.1 documenta el primer modelo seguro de documentos privados/empresa/persona: `documents`, `document_versions`, `document_subjects`, `document_access_grants`, `document_access_events`, certificaciones y firma documental futura con snapshot/evidencia propia. No implementa schema, buckets, UI ni boton "Firmar".
- Las nuevas fases deben ampliar BoxOps hacia configuracion de tenant, seguridad auth, roles avanzados, area personal/RRHH, documentos, fichaje y futura app movil.
- Esta revision no implementa seeds automaticos, billing, documentos firmables, buckets documentales reales, snapshots documentales reales, RRHH sensible, fichaje, geolocalizacion, cambios ni ausencias.

## Roadmap Actual

La vista resumida vive en `docs/product/roadmap.md` y el backlog ejecutable en `TASKS.md`.

- Fase A: cierre MVP 1 real con datos validados y deuda pequena.
- Fase B: configuracion de tenant, branding y roles avanzados.
- Fase C: auth/security polish.
- Fase D: area personal y modelo RRHH.
- Fase E: documentos, permisos, nominas, firmas y certificaciones; E.1 ya modela documentos/permisos sin implementacion.
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

Roles de aplicacion tras Fase B.2:

- `owner`: gestiona configuracion global del tenant, accesos y operativa MVP 1.
- `admin`: rol compatible que conserva todo lo que hacia en MVP 1: configuracion global, accesos, equipo, centros, tipos, horario, asignaciones, plantillas y cobertura.
- `manager`: gestiona operativa tenant-wide de MVP 1: centros, tipos, fichas operativas de coach, horario, asignaciones, plantillas y cobertura. No gestiona configuracion global ni altas/roles de memberships.
- `coach`: consulta centros, equipo, tipos, horario, asignaciones y cobertura en modo lectura.
- `staff`, `center_manager`, `document_admin` y `payroll_manager`: roles reconocidos por schema/app para no bloquear memberships existentes, pero sin mutaciones especificas en B.2.

Evolucion recomendada sin romper lo existente:

- `owner` o `superadmin`: configuracion global de organizacion, branding, billing futuro, permisos maximos y decisiones sensibles de tenant.
- `manager` o `admin`: gestion diaria de equipo, horarios, plantillas, cobertura, aprobaciones y operaciones.
- `coach`: uso operativo, horario, cobertura visible segun permisos, documentos propios, fichaje y funciones personales.
- roles especializados futuros: `document_admin`, `payroll_manager`, `center_manager` si la matriz de permisos lo justifica.

Reglas:

- Separar permisos de configuracion global de permisos de gestion diaria.
- Todos los usuarios, incluidos admins/owners, deben acceder a funciones personales porque un admin puede ser coach.
- No asumir que un rol operativo alto puede ver salario, nominas o documentos sensibles sin permiso explicito.
- Mantener compatibilidad con `admin` y `coach` actuales hasta una migracion mas fina de roles avanzada.
- No activar `center_manager` por centro hasta tener frontera de centro en schema/RLS y UX.

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
- Firma documental, validez avanzada/cualificada o uso de "Mi firma" sin snapshot y auditoria.

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
| `person_profiles` para perfil visible propio | D.1 usa la tabla existente solo para nombre visible, alias y email publico; salario, contrato, documentos y datos laborales sensibles quedan fuera. |
| Matriz D.2 antes de Storage o RRHH | Avatar, firma, documentos, payroll y datos laborales no deben implementarse hasta separar campos, capacidades, RLS, auditoria y frontera de tenant. |
| Avatar D.3 como asset privado | El avatar se modelo como asset tenant-scoped, no como URL publica libre en `person_profiles.avatar_url`; la subida real quedo bloqueada hasta migracion, bucket privado, RLS y ruta controlada. |
| Avatar D.4 propio y privado | El primer corte real usa `profile_assets` + Storage privado; Mi cuenta deriva persona desde sesion/tenant, no permite reemplazo ajeno y sirve preview con signed URL corta. |
| Firma D.5 propia y privada | "Mi firma" usa `profile_signatures` + Storage privado separado; Mi cuenta deriva persona desde sesion/tenant, no permite firma ajena y no firma documentos por si sola. |
| Fichaje manual antes de geolocalizacion | Permite cumplir mejor auditoria/correcciones antes de depender de ubicacion y permisos moviles. |
| PWA/web antes de nativo | La app nativa se evalua si el caso comercial exige geofencing fiable con app cerrada. |
| "Mi firma" antes de documentos firmables | La firma dibujada reutilizable pertenece al perfil/cuenta del usuario; los botones "Firmar" deben consumirla despues y guardar snapshot/auditoria. |
| E.1 documentos antes de schema | Documentos, versiones, sujetos, grants, auditoria candidata y evidencias futuras se modelan antes de crear buckets, UI o boton "Firmar". |
| Docs antes de codigo | Reduce decisiones implicitas y evita empezar por UI sin schema ni permisos. |

## Supuestos

- STL es un cliente piloto disponible para aportar horarios, centros, coaches y reglas reales.
- La primera venta probable sera mensualidad por organizacion/centro, con setup inicial si hay personalizacion.
- Supabase es suficiente para el MVP: Postgres + RLS + Auth + Storage.
- El producto se usara principalmente en desktop/tablet por admins y en movil por coaches.
- Los documentos pueden empezar como archivos en Storage con metadata en Postgres.
- Algunos documentos podran requerir firma de miembros concretos.
- "Mi firma" es una capacidad personal disponible para todos los usuarios con membership activa y rol reconocido, incluidos admins, managers y coaches.
- La firma dibujada vive en "Mi perfil"/"Mi cuenta", se crea dibujandola en pantalla, se puede borrar/redibujar antes de guardar y se reutilizara despues cuando exista un flujo "Firmar".
- D.5 elige firma tenant-scoped (`organization_id` + `person_profile_id`) con metadata en `profile_signatures`; la alternativa global por usuario queda como duda abierta solo si aparece necesidad multi-tenant real.
- La firma guardada esta en Storage privado con metadata en Postgres y frontera de tenant; nunca como asset publico.
- Actualizar la firma no cambia documentos ya firmados.
- Al firmar, no basta con apuntar a la firma actual del perfil: debe guardarse un snapshot/version de la firma usada y evidencia/auditoria de esa firma concreta.
- Un admin no puede firmar en nombre de otra persona usando su firma guardada.
- La firma dibujada se trata inicialmente como firma/confirmacion interna; no es firma electronica avanzada/cualificada sin validacion legal.
- El fichaje puede empezar simple y evolucionar; no se diseña todavia control laboral completo.
- La geolocalizacion de fichaje, si existe, sera puntual y vinculada a turno/centro; no seguimiento continuo.
- Horas extra sera tracking interno validable/exportable, no generacion de nominas.
- Los documentos sensibles usaran Storage privado, RLS, URLs firmadas y auditoria si procede.
- E.1 propone buckets privados candidatos `document-files` y `document-signature-evidence` con rutas internas que incluyen `organization_id`; no estan implementados.
- Los documentos deben separar cabecera, version/archivo, sujetos afectados, grants y auditoria candidata; no basta con un archivo suelto en Storage.
- Nominas, salario/retribucion, contrato, jornada y datos laborales requieren permisos mas finos que el rol operativo basico.
- `owner`, `admin` y `manager` no heredan por defecto acceso a datos laborales sensibles; cada campo futuro necesita capacidad explicita y, cuando proceda, grants/auditoria.
- Los assets personales, como avatar y firma, deben derivar la persona desde sesion + tenant para acciones propias y no permitir edicion de otra persona desde Mi cuenta.
- El avatar personal de D.4 se guarda como asset privado tenant-scoped; no se guarda una URL publica libre ni se permite reemplazo ajeno desde Mi cuenta.
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

1. Mantener Fase A como base para QA interno y desarrollo; la validacion oficial STL queda para una etapa posterior de producto casi completo antes de seed/produccion.
2. Dejar pendientes de Fase B para cortes futuros: logo/asset privado, colores por centro y validacion con mas tenants.
3. Configurar en Supabase Auth real la politica de contrasena y Redirect URLs de Fase C antes de QA con emails reales.
4. Validar D.4/D.5 en Supabase local/QA: avatar propio y firma propia con buckets privados, metadata tenant-scoped, signed URL corta y fallback visual. No saltar a documentos ni RRHH sensible.
5. Convertir E.1 en una tarea tecnica solo cuando se decida implementar documentos: schema/RLS, buckets privados, rutas controladas, grants, auditoria real y, mas adelante, boton "Firmar" con snapshot/evidencia.
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
- `docs/architecture/personal-data-permissions.md`: matriz D.2 y E.1 de permisos por campo para area personal, assets, firma, documentos y RRHH sensible futuro.
- `docs/architecture/tenancy-and-billing.md`: decision de tenancy, infraestructura y modelo de cobro.
- `docs/guides/README.md`: guias personales para volver al proyecto sin reconstruirlo entero.
- `docs/user-guides/README.md`: guias de uso por rol, incompletas donde el producto aun no existe.
- `docs/operations/legal-and-privacy-notes.md`: notas sobre fichaje, privacidad, horas extra y documentos.
- `docs/tenants/stl/README.md`: casuistica del primer tenant.
- `docs/tenants/stl/design-notes.md`: notas visuales del primer tenant sin contaminar producto generico.
