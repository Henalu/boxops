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
  - `/app/stats`
- Helpers server:
  - `getAuthenticatedUser`
  - `getActiveMemberships`
  - `resolveActiveOrganization`
- `organization_memberships` como fuente de rol y tenant.
- Resolucion explicita de `organizationId` si hay varias memberships activas.
- Gestion basica de centros por organizacion activa:
  - listar centros
  - crear centro minimo
  - generar slug interno automatico al crear, unico por organizacion y estable aunque cambie el nombre
  - editar nombre, timezone y status
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
  - generar slug interno automatico al crear, unico por organizacion y estable aunque cambie el nombre
  - editar nombre, categoria, coaches necesarios, certificacion, color, icono y estado
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
  - solapes imposibles de un mismo coach en bloques activos bloqueados en Postgres; `conflict` queda para datos legacy/importados o reglas futuras
  - detalle de bloque con trazabilidad operativa reciente de cambios, solicitudes y ausencias para `owner`, `admin` y `manager`, sin resolver cobertura automaticamente
- Jornada prevista del personal en `/app/schedule`:
  - `staff_work_windows` como planificacion tenant-scoped de presencia prevista
  - franjas por persona, dia de semana, hora, rango de validez y centro opcional
  - nuevas franjas activas bloqueadas si una misma persona ya tiene otra jornada activa solapada en dia, fechas y horario
  - expansion al vuelo para la semana visible, sin ocurrencias persistidas
  - resumen compacto por dia y contexto en detalle de bloque, sin bloquear cobertura ni asignaciones
  - todos los miembros activos del tenant ven las franjas activas; `owner`, `admin` y `manager` gestionan, eliminan y pueden revisar tambien inactivas
  - no es `schedule_blocks` ni `schedule_block_assignments`; puede alimentar fichaje automatico `schedule_auto` solo si el tenant activa `scheduleAutoPunchesEnabled`, sin probar presencia real ni payroll
- Roles MVP aplicados:
  - `admin` gestiona centros
  - `admin` gestiona usuarios/coaches basicos
  - `admin` gestiona tipos de clase/actividad
  - `admin` gestiona bloques operativos semanales basicos y asignaciones
  - `coach` consulta centros y coaches en modo lectura
  - `coach` consulta tipos de clase/actividad en modo lectura
  - `coach` consulta bloques operativos, asignaciones y cobertura en contexto de Horario, sin entrada principal de Cobertura
- Plantillas semanales basicas en `/app/templates`:
  - crear y editar plantillas semanales `schedule_templates`
  - crear, editar y retirar con confirmacion bloques de plantilla `schedule_template_blocks`
  - permitir bloques vacantes o con `default_coach_profile_id`
  - tratar `required_coaches = 0` como bloque "Sin requisito": no vacante, no asignado y sin riesgo de cobertura
  - aplicar plantillas activas a una semana creando `schedule_blocks`
  - crear asignaciones `source = 'template'` para coaches por defecto
  - evitar duplicar bloques al aplicar dos veces la misma plantilla sobre la misma semana
  - marcar `is_template_exception = true` cuando un bloque aplicado se edita o cancela
  - contraer/expandir plantillas individuales y todas las plantillas activas para reducir scroll
  - enfocar la lista de "Plantillas semanales" por centro, con opcion global "Todas" y foco conservado al navegar o guardar
  - mantener abierto el modal de creacion rapida de bloques tras guardar, con seleccion multiple de dias tambien desde el doble clic, para facilitar carga secuencial
  - sincronizar la creacion rapida de bloques solo contra la semana visible, evitando barrer todo el rango activo en cada alta
  - archivar plantillas con confirmacion, ventana de recuperacion de 30 dias y recuperacion como borrador
  - retirar `schedule_blocks` generados activos/no excepcionales cuando se elimina su bloque de plantilla, conservando historial protegido desacoplado
  - conservar horarios ya generados como historico independiente al archivar una plantilla
- Dashboard operativo en `/app`:
  - saludo, cobertura de la semana, resumen, pendientes y acciones rapidas
  - atajos a horario, cobertura, equipo, centros, tipos y plantillas
- Cola de cobertura en `/app/coverage`:
  - riesgos accionables ordenados por `uncovered`, `conflict` e `insufficient`
  - enlaces desde cada riesgo al bloque real en `/app/schedule`
  - seleccion multiple de riesgos para editar tipo de actividad, entrenadores necesarios o anadir un entrenador comun a varios bloques
  - filtro preventivo de entrenadores ocupados en la seleccion, con validacion server-side de permisos, tenant, bloque activo, entrenador asignable y solapes
  - lista compacta de todas las clases de la semana con estado
  - vistas de apoyo por centro con atajos filtrados al horario semanal
  - estados empty, loading, error y lectura para roles no admin
  - panel de detalle con trazabilidad operativa reciente por bloque, acotada a roles de gestion y sin motivos sensibles
- Estadisticas operativas en `/app/stats`:
  - acceso solo para `owner`, `admin` y `manager`
  - entrada desde `/app/more`, no desde la navegacion diaria principal
  - filtros por rango de fechas, centro, coach y tipo de actividad
  - carga/horas por coach, clases por tipo, distribucion por dia, centros y avisos de cobertura
  - integra impacto operativo de ausencias aprobadas o en revision sobre cobertura, sin saldos legales ni motivos sensibles
- Shell UX/UI Task 017:
  - bottom navigation en mobile con Inicio, Horario, Equipo y Mas para `coach`; Cobertura aparece solo para `owner`/`admin`/`manager`
  - sidebar en desktop/tablet con Principal y Gestion
  - `/app/more` agrupa gestion, ayuda y Configuracion pendiente
  - onboarding local con `boxops_onboarding_seen_v1`
- Smoke tests basicos:
  - `/login` como superficie publica de auth
  - redireccion anonima de `/app`, centros, coaches, tipos, horario y plantillas a `/login`
  - flujos autenticados opcionales para `owner`, `admin`, `manager` y `coach` mediante variables E2E
  - fixture Auth E2E local reproducible: `npm run supabase:setup:e2e-auth` es dry-run con rollback; `npm run supabase:setup:e2e-auth:commit` solo recrea usuarios E2E locales con confirmacion explicita
  - preflight Auth local `npm run test:smoke:e2e-auth`, smokes protegidos por rol con `npm run test:smoke:protected:<rol>`, recorrido secuencial `npm run test:smoke:protected:roles` y atajo local completo `npm run test:smoke:e2e-local`
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

Todavia no hay calendario completo de ausencias, calendario avanzado de eventos/festivos/competiciones, swap entre dos bloques/asignaciones, fichaje geolocalizado, modulo documental visible completo, RRHH sensible, firma documental, payroll, horas extra aprobadas, branding avanzado por tenant ni CRUD avanzado. Si existe un primer workflow minimo de solicitudes/ofertas de cambio/cobertura en `/app/requests`, sin payroll, y una base interna DB/RLS/RPC de ausencias en I.10/I.11 con primera bandeja visible protegida en `/app/absences` desde I.12, creacion propia minima desde I.13, hardening visible I.14 de filtros/validacion/estados no accionables, QA tecnico I.15 de regresion, impacto derivado I.16 en lectura de cobertura y trazabilidad operativa prudente I.25 en detalle de `/app/schedule` y `/app/coverage`, sin calendario de ausencias, creacion para otra persona ni resolucion automatica. I.17 deja eventos, festivos y competiciones como modelo documental de contexto operativo, I.18 abre `operational_events` como foundation tecnica interna DB/RLS/RPC e I.19 los muestra de forma minima en `/app/schedule`, sin UI grande ni efectos automaticos sobre horario/cobertura. I.20 deja horas extra como modelado documental de candidatos operativos revisables, I.21 abre la foundation tecnica interna `overtime_candidates` con RLS/RPC/helper y guardrail de fuente, I.22 anade QA/RLS con rollback y smoke endurecido, I.23 abre una primera cola visible minima en `/app/time` para `owner`/`admin`/`manager`, e I.24 anade deteccion server-side prudente y manual de candidatos desde contexto existente. I.26 deja IA solo como modelado prudente futuro subordinado a documentos/programacion utiles, permisos, auditoria, privacidad y fuentes canonicas, sin IA funcional; E.6/I.27 deja el siguiente paso como programacion util asociada a documentos y horario, no IA; E.7/I.28 abre `document_programming_links` como foundation interna para asociar documentos/versiones de programacion a fecha/tipo/centro/bloque con RLS/RPC/helper; E.8/I.29 muestra programacion autorizada desde el detalle de bloque en `/app/schedule`, con preview/descarga solo si `can_preview`/`can_download`; E.9/I.30 anade QA interno no visible con rollback para validar grants, denegaciones, cross-tenant y que asignaciones no conceden permiso documental; E.10/I.31 anade runbook operativo interno local/QA para validar manualmente casos controlados de programacion documental autorizada sin persistir cambios accidentales; E.11 abre `/app/documents` como primer repositorio documental visible minimo, con listado por `can_access_document` y archivo por rutas backend E.5; E.12 prepara validacion QA/staging controlada con snippet SQL rollback y evidencia esperada para grants, solo metadata, sin grant, cross-tenant y exclusiones sensibles; E.13 cierra evidencia local y bloqueo staging sin inventar resultados; E.14 reintenta validacion QA/staging real con archivo Storage controlado y confirma bloqueo por falta de acceso real/credenciales/casos QA desde este entorno; E.15 actualiza el desbloqueo controlado con relectura de entorno redacted, SQL local rollback y bloqueo por falta de project/ref, DB URL, credenciales/casos QA y objeto `document-files` controlado; E.16 deja un handoff operativo redacted para operador con acceso real, con variables/capacidades necesarias, casos QA, checklist, evidencia esperada y criterios de pass/bloqueado; E.19 anade un primer adjunto minimo `company`/`programming` desde `/app/documents` para roles autorizados, con Storage privado y preview/descarga por backend. Todo sigue sin nomina, saldos, compensacion, aprobacion legal/payroll, calculo definitivo, automatismo legal, decisiones por IA ni mutaciones de fichaje/horario. Equipo ya tiene un primer flujo de invitaciones por email con ficha operativa vinculada, pendiente de configurar proveedor real de email por entorno. El area personal existe como corte seguro en `/app/account`, con perfil visible propio, avatar privado propio y firma interna propia. El fichaje manual propio existe en `/app/time`, con vista semanal y avisos operativos frente a asignaciones, correcciones propias directas por defecto, modo de aprobacion configurable por `owner`, `admin` o `manager`, automatico web por planificacion, base backend de cierre semanal/aprobacion firmada y revision/deteccion operativa de candidatos de posible exceso, sin geolocalizacion, payroll, horas extra aprobadas ni promesa legal definitiva.

Actualizacion 2026-05-22: los ultimos cambios de UX operativa tratan la vinculacion cuenta-persona como flujo explicito, no como problema de Horario. Inicio dirige estados pendientes de identidad a Mi cuenta o Equipo segun capacidad de gestionar accesos; Mi cuenta explica si falta persona visible o si una ficha de entrenador quedo vinculada sin persona operativa; Equipo mantiene invitacion por email como camino normal y evita UUID visibles en la superficie principal. Tambien quedan consolidados textos mas claros en Solicitudes, Ausencias, Mi fichaje, cierre semanal en Inicio, Horario/Plantillas y Equipo, sin ampliar RRHH sensible, payroll, documentos firmables, geolocalizacion ni automatismos.

Actualizacion 2026-05-23: Equipo permite crear una cuenta completa sin invitacion desde `Crear cuenta`: email, contrasena temporal, rol, estado, persona visible y ficha operativa. La cuenta se crea con email confirmado, queda marcada en `app_metadata` para cambio obligatorio de contrasena, y login/proxy/layout fuerzan `/reset-password?reason=first-login` antes de entrar en `/app`. El flujo antiguo visible de completar vinculaciones se retira de la superficie principal; queda solo revision de datos de acceso. Esta es una excepcion acotada al guardrail historico de no usar Auth Admin: `SUPABASE_SERVICE_ROLE_KEY` solo puede leerse en `src/lib/supabase/admin.ts` y usarse en Server Actions/rutas servidor esperadas, nunca en cliente ni para saltarse tenant/RLS.

Actualizacion 2026-05-25: revision local de contexto para publicar online y abrir user testing no tecnico. Estado correcto: `bloqueado para publicacion/user testing`, aunque la app compila. Evidencia local: `npm run build` pasa; `npm run lint` pasa con el warning conocido de `scripts/setup-local-e2e-auth.mjs`; `npx supabase db lint --local` pasa; `git diff --check` pasa solo con warnings LF/CRLF; guardrails `rg` no encuentran STL, `service_role`, IA, geolocalizacion, push, service worker ni caches privadas en `src`. Bloqueos tecnicos actuales: `npm run typecheck -- --pretty false` falla en 3 specs de smoke conocidas, `npm run test:smoke` con servidor local ejecuta 247 tests pero queda en 204 passed, 21 skipped, 5 not run y 17 failed, y `npm audit --omit=dev --audit-level=high` reporta 8 vulnerabilidades de produccion, 2 high (`next`, `fast-uri`) y 6 moderate. Bloqueos de entorno/producto: no hay URL QA/staging/Vercel, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, DB URL real/staging, `SUPABASE_SERVICE_ROLE_KEY` persistida server-only, tenant QA/staging ni evidencia real de Auth/email/Redirect URLs/SMTP/datos del tenant. Antes de invitar a testers no tecnicos hace falta cerrar typecheck/smoke/audit, desplegar un entorno online controlado, configurar Supabase/Auth/email/secretos por entorno, preparar usuarios E2E y validar una semana real con evidencia redacted.

Actualizacion 2026-05-25 (contexto local posterior a ajustes UX/operativa): las decisiones recientes de Horario, Equipo y Jornadas quedan como contrato de producto hasta nueva task. Horario debe mostrar un centro a la vez; la preferencia de centro se recuerda con cookie funcional HttpOnly por organizacion desde el proxy, validada contra centros del tenant, ignorando prefetch y sin `localStorage`/`sessionStorage`. En el calendario semanal los bloques cancelados no se muestran, los bloques simultaneos de una misma hora se apilan verticalmente dentro del dia, y eventos/festivos se tratan como contexto operativo visible/editable desde su superficie o detalle, no como bloques de trabajo ni como resolucion automatica. En el detalle de bloque, "Asignaciones actuales" es la superficie canonica para anadir y retirar entrenadores; el panel inferior queda para historial/trazabilidad/no disponibles y no debe duplicar activos. Jornada prevista se gestiona en `/app/work-windows`; Horario conserva contexto ligero. Los selectores de personas de Jornada deben partir de fichas de entrenador activas con persona visible activa, no de todas las personas historicas/E2E. Equipo mantiene `Crear cuenta` como flujo server-only que requiere `SUPABASE_SERVICE_ROLE_KEY` solo en entorno servidor. Equipo se presenta como lista unificada de usuarios: la separacion tecnica entre acceso, persona visible y datos operativos queda detras de la UI; propietario/admin gestionan altas, rol, permisos y datos operativos; responsable puede ver el equipo y editar centro principal/horas semanales; entrenadores consultan el equipo sin editar. Decision operativa sobre fichas: una ficha sin cuenta vinculada debe poder eliminarse si no conserva dependencias operativas obligatorias; con cuenta vinculada se debe archivar/desactivar conservando trazabilidad, no borrar identidad. La evidencia de typecheck/smoke del parrafo anterior queda como foto historica del bloqueo inicial: despues de los fixes recientes hay que repetir el gate completo antes de declarar cualquier desbloqueo.

Actualizacion 2026-05-25 (UX Horario/Jornadas posterior): Horario mantiene el header global movil visible y el control sticky de semana queda desplazado por debajo para no solaparse. El boton `+` en el header sticky abre la creacion de bloque, evento o festivo como alternativa al doble clic, especialmente en movil; el modal de creacion se centra en movil con altura basada en `100dvh`. Se retiraron redundancias visibles de "Semana" y fechas duplicadas. En el calendario semanal desktop, la lectura lateral de jornada prevista muestra solo nombres de entrenadores: el hover muestra dias y rango horario, y el click abre un modal con detalle ampliado por dia, horario y centro. En `/app/work-windows`, los filtros de Lista de jornadas por persona, centro, dia y estado filtran en cliente sin recargar la pagina, actualizan contador y estados vacios al momento, sincronizan la URL con `history.replaceState` y mantienen `returnPath` actualizado para guardar/desactivar sin perder contexto. Cambiar de semana sigue siendo navegacion server-side porque cambia el conjunto de jornadas cargadas. Estos ajustes no desbloquean publicacion por si solos; el estado sigue bloqueado hasta repetir gate completa y resolver dependencias/entorno.

OD.1/I.32 documenta el cierre de operativa diaria completa para beta interna en `docs/operations/daily-operations-beta-readiness-runbook.md`. Es un checklist de readiness, no producto nuevo: mapea flujos diarios listos, validaciones real/staging, bloqueos por datos/credenciales/entorno, diferencias por rol, smokes, evidencia y deuda. Cobertura, ausencias, eventos y jornada prevista siguen siendo contexto operativo, no decisiones automaticas ni resolucion automatica de cobertura.

Estado consolidado 2026-05-08:

- MVP 1 debe tratarse como base visual/operativa ya avanzada, no como plan pendiente.
- Fase A tiene una semana de prueba STL L-V cargable localmente con `supabase/snippets/stl-test-week-2026-05-04.sql`: 165 bloques, una plantilla activa y bloques vacantes sin coaches inventados.
- Fase A tambien tiene una muestra interna opcional en `supabase/snippets/stl-internal-assignment-sample-2026-05-04.sql`: 20 coaches por defecto/asignaciones, 145 vacantes y 1 insuficiencia para QA interno y smoke tests. Ya no siembra conflicto deliberado porque Postgres bloquea solapes imposibles de coach.
- El flujo `/app/coaches` puede invitar por email creando o reutilizando una ficha operativa pendiente (`person_profiles` + `coach_profiles`); la aceptacion por `/invite/accept` vincula automaticamente Auth/membership/persona/ficha si el email coincide. Tambien puede crear una cuenta directa con email, contrasena temporal, membership, persona visible y ficha operativa; el primer login fuerza cambio de contrasena. Las herramientas UUID dejan de ser superficie principal y solo deben existir como compatibilidad interna/guardrail si un corte futuro las conserva.
- La UI y el smoke E2E local admin/coach pasan contra esa semana; `/app/templates` edita un bloque por URL y ofrece vistas Semana/Agenda para mantener usable una plantilla grande, y el smoke cubre `/app/schedule?mine=1`.
- Fase A queda cerrada para QA interno, sin considerarse validacion oficial ni produccion. La siguiente validacion de producto es que STL revise centro por bloque, asignaciones reales o huecos intencionados antes de mover datos a seed/produccion.
- Fase B.1 implementa configuracion generica minima en `/app/settings`: `admin` edita nombre visible y `organizations.theme_config.accentColor`; `coach` queda en lectura; el color principal se aplica como marca ligera sin tematizar estados criticos, error ni foco.
- Fase B.2 implementa permisos avanzados compatibles: `owner` y `admin` controlan configuracion global y accesos, `manager` gestiona operativa tenant-wide de MVP 1 sin tocar configuracion global ni roles, y `coach` conserva lectura/uso operativo sin mutaciones. Fase B.3 implementa invitaciones de equipo por email con `team_invitations`, Resend como proveedor transaccional configurable, tokens hasheados y aceptacion por sesion/email. UX.7 anade creacion directa de cuenta Auth con `SUPABASE_SERVICE_ROLE_KEY` como excepcion server-only acotada al Auth Admin helper, sin exponer secretos al cliente. B.4 documenta el cierre de base SaaS/tenant readiness en `docs/operations/tenant-readiness-checklist.md`: configuracion minima por tenant, limites de roles, logo privado futuro, colores por centro opcionales, `center_manager` futuro y onboarding de nuevo box como runbook/flujo posterior.
- Fase C implementa auth/security polish minimo: enlace "He olvidado mi contrasena", solicitud de reset generica sin enumeracion, callback Supabase SSR hacia `/reset-password`, validacion minima de contrasena y decision de mantener rate limits nativos de Supabase por ahora.
- Fase D.1 implementa area personal minima en `/app/account`: cuenta/Auth en lectura, edicion propia de `person_profiles.display_name`, `preferred_alias` y `public_email`, ficha de coach propia en lectura, avatar y "Mi firma" como pendientes, sin Storage ni datos RRHH sensibles.
- Fase D.2 documenta la matriz de permisos por campo en `docs/architecture/personal-data-permissions.md`: no cambia UI ni schema, y deja avatar privado, firma real, documentos y RRHH sensible bloqueados hasta tener Storage/RLS/permisos explicitos.
- Fase D.3 documenta el modelo de avatar privado tenant-scoped: `profile_assets` como candidato futuro, artefacto privado, lectura controlada/signed URL corta y acciones propias derivadas de sesion + tenant. No cambia `src`, migraciones, Storage ni UI.
- Fase D.4 implementa el primer avatar privado minimo propio: `profile_assets`, bucket privado `profile-assets`, RLS/RPC de metadata, policies de Storage por ruta tenant/persona y subida/reemplazo desde `/app/account` sin aceptar `person_profile_id` ni usar `person_profiles.avatar_url` como URL publica.
- Fase D.5 implementa "Mi firma" propia reutilizable privada: `profile_signatures`, bucket privado `profile-signatures`, RLS/RPC de metadata, policies de Storage por ruta tenant/persona y canvas minimo en `/app/account`, sin documentos firmables ni boton "Firmar".
- Fase E.1 documenta el primer modelo seguro de documentos privados/empresa/persona: `documents`, `document_versions`, `document_subjects`, `document_access_grants`, `document_access_events`, certificaciones y firma documental futura con snapshot/evidencia propia. No implementa schema, buckets, UI ni boton "Firmar".
- Fase E.2 implementa el primer schema minimo de metadata documental privada: `documents`, `document_versions`, `document_subjects` y `document_access_grants`, con `organization_id`, RLS estricta, grants explicitos y rutas internas candidatas para `document-files`, sin crear bucket, UI, subida real, boton "Firmar", snapshots ni auditoria real.
- Fase E.3 implementa Storage documental privado minimo: bucket `document-files` privado, limite conservador/MIME cerrados, RPCs `begin_document_version_upload`, `activate_document_version_upload` y `cancel_document_version_upload`, y policies de `storage.objects` ligadas a `document_versions` pending/active y grants/sujeto. No crea UI, documentos firmables, boton "Firmar", snapshots ni auditoria real.
- Fase E.4 implementa auditoria documental minima segura: `document_access_events`, `organization_id` obligatorio, actor user/membership/persona opcional resuelta, eventos y resultados cerrados, metadata minimizada, RLS estricta y RPCs `record_document_access_event`/`list_document_access_events_for_document`. `activate_document_version_upload` registra `version_activated` y `version_archived` cuando aplica. No crea UI, preview/descarga desde app, signed URLs documentales, documentos firmables, snapshots, payroll, RRHH sensible nuevo, fichaje ni geolocalizacion.
- Fase E.5 implementa rutas backend minimas para preview/descarga de `document_versions` privadas: `GET /app/documents/[documentId]/versions/[documentVersionId]/preview` y `/download`. Resuelven sesion, tenant y membership en servidor, validan documento/version del tenant activo, reutilizan `can_access_document`, generan signed URLs cortas solo en memoria y registran `file_preview`/`file_download` o `denied` con `record_document_access_event`. No crea UI documental, pagina de documentos, subida desde app, documentos firmables, snapshots, payroll, RRHH sensible nuevo, fichaje ni geolocalizacion.
- Fase E.6/I.27 documenta programacion util asociada a documentos y horario como base previa a cualquier IA: `documents.document_scope = programming`, `document_versions` como version canonica, `document_subjects`/`document_access_grants` para contexto y permiso, `document_access_events` para auditoria, y `schedule_blocks`/`schedule_block_assignments` solo como contexto operativo. No crea IA, subida visible, UI documental, migraciones ni codigo.
- Fase E.7/I.28 implementa la base tecnica interna de programacion documental asociada a horario: `document_programming_links` enlaza documentos/versiones `programming` con rango de fechas y contexto opcional de tipo, centro o bloque; RLS/RPC/helper listan solo contenido autorizado por `can_access_document`; `schedule_block_assignments` no concede permisos. No crea UI visible, subida documental, documentos firmables, IA, embeddings, RAG, vector DB, prompts runtime, SDKs, jobs ni cron.
- Fase E.8/I.29 implementa la primera superficie visible minima de programacion autorizada desde `/app/schedule`: el detalle de bloque muestra titulo/fuente, version/fecha, disponibilidad y acciones de preview/descarga solo si el permiso documental lo permite. No crea subida visible, pagina documental completa, asociaciones visibles, documentos firmables ni IA.
- Fase E.9/I.30 implementa QA interno no visible de asociaciones de programacion documental: snippet SQL local/QA con rollback y smoke para comprobar link activo por bloque/contexto, grant real, metadata limitada, denegacion sin permiso, bloqueo cross-tenant, no mutacion de horario/asignaciones y que `schedule_block_assignments` no concede acceso documental. No crea migracion, UI nueva, subida, pagina documental completa, documentos firmables ni IA.
- Fase E.10/I.31 implementa preparacion operativa controlada para validacion manual de programacion documental autorizada: runbook interno en `docs/operations/document-programming-manual-validation-runbook.md`, plantilla SQL con `BEGIN`/`ROLLBACK`, checklist de usuarios con grant, solo metadata, sin grant y cross-tenant, y smoke estatico. No toca UI de Horario, no crea migracion, subida, pagina documental completa, asociaciones visibles, documentos firmables ni IA.
- Fase E.11 implementa el primer repositorio documental visible minimo en `/app/documents`: lista versiones activas/archivadas accesibles por `can_access_document(..., 'read_metadata')`, calcula `can_preview`/`can_download`, enlaza archivo solo por rutas E.5 y documenta readiness en `docs/operations/document-repository-beta-readiness-runbook.md`. No muestra `sensitive_hr`; no crea grants UI, auditoria visible, documentos firmables, evidencias de firma, payroll, contratos reales, IA ni cumplimiento legal documental definitivo.
- Fase E.12 documenta y prepara la validacion QA/staging controlada del repositorio E.11: `supabase/snippets/document-repository-beta-qa-verification.sql` usa `BEGIN`/`ROLLBACK` con usuarios y documentos sinteticos para probar grant de descarga, solo metadata, sin grant, cross-tenant, documentos `programming`/`company` visibles, bloqueo de `sensitive_hr`, `payroll`, `signature_evidence` y `requires_signature`, y evidencia de auditoria `file_preview`/`file_download` sin subir documentos reales ni abrir UI nueva. E.13 cierra la evidencia local disponible y documenta bloqueo staging si faltan accesos/credenciales/archivo controlado. E.14 reintenta la validacion real con archivo Storage controlado y mantiene `bloqueado por acceso/entorno` al no haber project/ref, DB URL, credenciales E2E/casos QA ni objeto `document-files` controlado disponible. E.15 reabre solo el desbloqueo controlado, confirma el mismo bloqueo actualizado y reejecuta el SQL local con rollback sin inventar staging. E.16 convierte ese bloqueo en handoff operativo redacted para operador con acceso real, sin guardar secretos ni evidencia sensible en el repo.
- Fase E.19 implementa el primer adjunto documental minimo desde `/app/documents`: `owner`, `admin` y `document_admin` pueden crear metadata `company` o `programming` y subir una primera version con validacion conservadora, RPCs `begin/activate/cancel_document_version_upload` y Storage privado. No permite elegir otra persona desde cliente, no crea grants UI, no reemplaza versiones existentes, no firma documentos y mantiene preview/descarga por backend E.5.
- OD.1/I.32 documenta el cierre de operativa diaria completa para beta interna: runbook en `docs/operations/daily-operations-beta-readiness-runbook.md`, checklist de Horario/Plantillas/Asignaciones/Cobertura/Solicitudes/Ausencias/Eventos/Jornada prevista/Inicio por rol, smokes por rol, evidencia y deuda, sin automatismos de cobertura, legalidad, payroll ni IA.
- Fase F.4 implementa la primera superficie visible minima de fichaje propio en `/app/time`: entrada/salida manual propia mediante `createOwnTimePunchAction`, listado de registros recientes, punches, correcciones y aprobaciones propias, centro opcional del tenant activo y estados seguros cuando falta persona vinculada. Fase F.5-F.8 anaden correcciones propias con motivo obligatorio, snapshots construidos en servidor/campos controlados, aplicacion directa por defecto mediante RPC trazada y modo opcional de aprobacion previa configurable por `owner`, `admin` o `manager` en `/app/settings`. Fase F.9 anade vista semanal navegable y avisos por falta, exceso o fichaje abierto comparando punches activos con bloques asignados propios. Fase F.10 separa punches sustituidos/anulados hacia historial visible de cambios durante 30 dias sin borrado fisico. Fase F.11 implementa fichaje automatico web por planificacion con `source = schedule_auto`, flag `scheduleAutoPunchesEnabled`, snapshot minimo de bloque/asignacion/centro/hora prevista e idempotencia por asignacion/tipo de punch. El corte posterior 2026-05-23 anade franjas `staff_work_windows` como otra fuente planificada de `schedule_auto`, con job DB activable por operador, idempotencia por franja+fecha+tipo y `presenceVerified = false`. Fase F.12 implementa la base backend de cierre semanal: estados `open/submitted/approved/rejected/correction_required/resubmitted`, envio idempotente, primitiva de scheduler DB domingo 23:59 por timezone de organizacion, aprobacion por `owner`/`admin`/`manager` con firma propia y snapshot minimo, rechazo con nota obligatoria, reapertura auditada y bloqueo normal de semanas aprobadas. Fase F.13 implementa avisos in-app en Inicio desde `time_weekly_approvals`. Fase F.14 implementa un CSV interno revisable desde `/app/time/export`, visible para `owner`/`admin`/`manager`, registrado en `time_exports` y sin snapshots ni texto libre sensible. F.15 documenta el cierre de fichaje web para beta interna en `docs/operations/time-tracking-beta-readiness-runbook.md`, separando flujos listos, validacion real/staging, bloqueos, roles, smokes, evidencia, deuda y v1 comercial. No acepta `person_profile_id` en acciones propias, no edita `time_records` ni `time_punches` directamente desde UI/actions, no crea geolocalizacion, payroll, horas extra automaticas/aprobadas, exporte legal definitivo ni garantia legal definitiva.
- Decision 2026-05-13: la webapp no pedira ubicacion al fichar. La evolucion de fichaje en web sera manual + automatico por clases/bloques asignados, con cierre semanal. F.12 deja la base para que cada domingo a las 23:59 la semana de cada usuario se envie automaticamente a aprobacion; `owner`, `admin` y `manager` veran pendientes en Inicio, podran "Firmar y aprobar" con su propia firma o rechazar con nota obligatoria; aprobar bloquea la semana y rechazar notifica al usuario para corregir y reenviar.
- Fase G.1/G.2 documentan la ubicacion como capacidad futura, pero tras la decision 2026-05-13 no se implementara lectura de ubicacion en webapp.
- Fase G.3 implementa la primera base tecnica interna para ubicacion minimizada en `supabase/migrations/00018_time_location_assist_foundation.sql`: schema, constraints, RLS y RPCs, sin UI visible, sin lectura real de `navigator.geolocation`, sin geofencing activo, sin fichaje automatico por ubicacion y sin coordenadas crudas persistidas del trabajador.
- Fase G.4 implementa la capa server/app interna en `src/lib/time-location.ts` y helpers de permisos para consumir esas RPCs con sesion normal, sin `service_role`, rutas nuevas de producto, hooks cliente, mapas ni ubicacion real. Esta base queda reservada para app nativa/wrapper futuro si el negocio exige geofencing/background location.
- Revision 2026-05-10: la seguridad deja de estar solo repartida por fases y queda como carril transversal S en `docs/architecture/security-baseline.md`, `docs/product/roadmap.md` y `TASKS.md`. El baseline usa OWASP ASVS 5.0 Level 1 como referencia inicial de MVP/public beta y OWASP Top 10 2025 como mapa de riesgos; no se deben usar datos reales sensibles ni pasar a produccion sin cerrar gates de tenant safety, permisos, RLS, Storage privado, secretos, dependencias y auditoria.
- Revision 2026-05-12: S.2 ejecuta el cierre tecnico pre-QA sin abrir modulos nuevos. El runbook minimo queda en `docs/operations/pre-qa-controlled-pilot-runbook.md`; antes de probar con STL o emails reales quedan como bloqueos configurar Resend/Supabase Auth/SMTP, probar invitacion y reset controlados, activar la purga S.1 como job o fallback temporal documentado, y limpiar snippets `Untitled query`.
- Revision 2026-05-12: S.3 ejecuta el gate controlado de email/Auth y pre-piloto. Resend esta presente localmente con formato plausible y autenticacion API sin exponer secretos, `.env.local` sigue ignorado/no trackeado, los snippets `Untitled query` trackeados salen del indice y la verificacion local queda verde. La prueba real de invitacion/reset sigue bloqueada hasta tener Supabase Auth/SMTP real revisado, remitente Resend permitido, email interno controlado y credenciales E2E/admin.
- Revision 2026-05-12: S.4 verifica el QA real controlado pre-piloto STL sin resetear datos ni tocar superficies operativas. La plantilla local `Semana prueba STL L-V` conserva 165 bloques de plantilla y 165 bloques generados para 2026-05-04 a 2026-05-08. La prueba real de invitacion/reset y el job real de purga siguen bloqueados por falta de acceso Supabase real, email controlado, credenciales E2E/admin y scheduler/DB real.
- Revision 2026-05-12: S.5 ejecuta el cierre operativo real Auth/Email/Purga pre-piloto STL. Resend autentica localmente, pero no hay dominios verificados visibles y el remitente queda limitado a `onboarding@resend.dev`; `.env.local` no contiene credenciales E2E/admin, email controlado ni acceso Supabase real. Typecheck/lint/build/smoke/Supabase lint/migration list/RLS pasan, pero el piloto STL no queda desbloqueado.
- Revision 2026-05-12: S.6 reintenta el desbloqueo operativo tras S.5. El entorno sigue sin `SUPABASE_ACCESS_TOKEN`, project ref, DB URL real, email interno controlado ni credenciales E2E/admin; Resend autentica pero muestra 0 dominios verificados visibles y remitente `resend.dev`; el servidor local disponible es `127.0.0.1:3003`. La verificacion local vuelve a pasar, pero no se ejecutan invitacion, aceptacion, reset ni job real de purga porque faltan accesos reales.
- Revision 2026-05-13: S.7 consolida pre-piloto sin abrir modulos nuevos. `PROJECT_BRIEF.md` y `docs/product/roadmap.md` se reconcilian con `TASKS.md`/`docs/architecture/domain-model.md` para reflejar G.3/G.4 como base tecnica interna sin UI visible ni lectura real de ubicacion. Resend autentica con 0 dominios verificados visibles y remitente `resend.dev`; Supabase real/staging, email controlado, credenciales E2E/admin/owner y job real de purga siguen sin acceso. Typecheck/lint/build/smoke/Supabase lint/migration list/RLS pasan, pero no se ejecutan invitacion, aceptacion, reset ni purga real.
- Revision 2026-05-11: los detalles operativos de `/app/schedule`, `/app/coverage` y la edicion de bloques de `/app/templates` no deben abrirse/cerrarse con navegacion App Router cuando solo cambia `block_id` o `edit_block_id`; usan estado cliente + History API para conservar scroll/contexto y URL compartible. El smoke `operational-detail-panels` protege esta regresion.
- Revision 2026-05-11: la disponibilidad de coach para asignaciones queda garantizada en Postgres con `00011_schedule_assignment_overlap_guard.sql`; el filtro frontend en Horario/Cobertura es ayuda UX, no garantia. Las actions traducen el bloqueo a `coach-unavailable` y el smoke `schedule-coach-availability` cubre el solape 11:15-12:15 contra 11:00-12:00.
- Revision 2026-05-14: se consolidan fixes UX/operativos posteriores a I.8. Inicio y el shell muestran la proxima clase asignada propia desde `schedule_blocks` + `schedule_block_assignments` (`assignment_status = 'assigned'`, excluyendo `cancelled`/`completed`); el resumen del shell se mantiene tambien en Inicio y el cliente solo actualiza el contador visual. Entrenador mantiene Inicio y Mas con contenido propio, no ve opciones administrativas inutiles ni avisos de "no autorizado". La web/PWA sigue sin push, Notification API, service worker, background sync, caches privadas ni geolocalizacion.
- Revision 2026-05-14: los tipos de actividad se actualizan mediante `update_class_type_and_sync_defaults(...)`. `required_coaches` se sincroniza en todas las plantillas y en horarios presentes/futuros accionables; los bloques pasados, cancelados o completados conservan historico. Nombre, categoria, color, certificacion y estado siguen referenciados por `class_type_id`, no se duplican como texto en bloques.
- Revision 2026-05-14: `/app/time` queda pulido para uso diario: registrar entrada/salida aparece arriba, el centro principal del coach se preselecciona, el usuario puede elegir fecha/hora manualmente con valor por defecto actual, y las correcciones que mueven fichajes de dia realinean `time_records.local_work_date` con la fecha local del punch mediante `00030`/`00031`.
- Revision 2026-05-14: `/app/templates` queda como herramienta densa pero operable: filtros colapsables por asignacion y tipo, seleccion multiple de bloques, edicion multiple limitada a campos coherentes, centro de bloque readonly cuando la plantilla esta acotada a un centro, filtro anti-solape para coach por defecto y sincronizacion idempotente del rango activo al guardar.
- Revision 2026-05-14: I.9 inicia ausencias/vacaciones/permisos solo como modelado documental seguro. I.10 abre la foundation interna DB/RLS/RPC en `absence_requests`, `absence_request_periods` y `absence_request_events`, con impacto calculado al vuelo mediante `list_absence_schedule_impacts(...)` y sin persistir `absence_schedule_impacts`. No crea UI, Server Actions visibles, seeds, datos reales, saldos legales, payroll, bajas medicas con documentos ni cumplimiento legal definitivo.
- Revision 2026-05-14: I.12 abre `/app/absences` como primera bandeja visible protegida de ausencias/vacaciones/permisos, enlazada desde `/app/more` y sidebar personal. Lista solicitudes propias, cola de revision para `owner`/`admin`/`manager`, acciones seguras por Server Actions y impacto al vuelo. No crea formulario, calendario, saldos legales, payroll, bajas medicas con documentos, cobertura automatica, push, ubicacion ni app nativa.
- Revision 2026-05-15: I.13 anade en `/app/absences` un formulario minimo de creacion de solicitud propia usando `createOwnAbsenceRequest(...)`. La Server Action revalida sesion, membership, tenant, rol, `organization_id`, tipo, periodo y resumen antes de delegar en helper/RPC; no acepta `person_profile_id` ni `coach_profile_id`, no crea ausencias para otra persona, no resuelve cobertura y mantiene impacto calculado al vuelo.
- Revision 2026-05-15: I.14 endurece `/app/absences` despues de confirmar I.13 en codigo. Anade filtros por query string (`view`, `absence_type`, `absence_status`), validacion visible del formulario, confirmacion y rechazo server-side de senales sensibles basicas en el resumen, botones con estado pendiente/confirmacion y mensajes claros para acciones no disponibles. No cambia schema/RLS/RPC, no abre calendario, saldos legales, cobertura automatica ni creacion para otra persona.
- Revision 2026-05-15: I.15 ejecuta QA/hardening tecnico de regresion para `/app/absences` sin abrir producto nuevo. Anade smoke/guardrails para confirmar que I.13/I.14 siguen en codigo, que coach no activa cola de revision por query string, que owner/admin/manager conservan superficie de revision cuando hay credenciales E2E, y que no hay inputs propios de persona/coach, escrituras directas a tablas de ausencias, `service_role`, hardcode de tenant ni nuevas APIs de push/ubicacion/cache en `src`.
- Revision 2026-05-15: I.16 integra ausencias aprobadas o en revision como impacto derivado en la lectura de cobertura de `/app/schedule`, `/app/coverage`, Inicio y `/app/stats`. `coverage_needed` descuenta la asignacion afectada del conteo valido y `potential` marca riesgo operativo; no se persiste `absence_schedule_impacts`, no se modifican horarios/asignaciones, no se resuelve cobertura automaticamente y no se muestran motivos sensibles en cobertura.
- Revision 2026-05-15: I.17 documenta eventos, festivos y competiciones como contexto operativo tenant-scoped del box. I.18 implementa `operational_events` como foundation tecnica minima con `organization_id`, FK tenant-safe opcional a centro, estados `active`/`cancelled`/`archived`, visibilidad acotada, RPCs server-side, RLS y auditoria minimizada en `operational_audit_events`. I.19 abre una superficie minima en `/app/schedule`: resumen semanal/del dia, detalle compacto y gestion colapsada para `owner`/`admin`/`manager`; `coach` solo lee eventos visibles. No crea UI grande, calendario avanzado, seeds ni datos reales; tampoco convierte eventos en bloques, cancelaciones, asignaciones, ausencias, fichajes, payroll ni horas extra aprobadas.
- Revision 2026-05-16: I.20 documenta horas extra como candidatos operativos revisables, I.21 implementa la foundation interna `overtime_candidates`, I.22 anade QA/RLS con rollback, I.23 abre la primera superficie visible minima en `/app/time` e I.24 anade deteccion server-side prudente y manual de candidatos de posible exceso. Se separan horas planificadas, horas fichadas/trabajadas, diferencias/alertas, deteccion operativa, revision operativa y aprobacion legal/payroll futura. I.21 crea DB/RLS/RPC/helper y guardrail de fuente para registrar o consultar senales operativas; I.22 verifica roles reales, tenant safety, fuentes personales, candidatos cerrados, escritura directa bloqueada y no mutacion de horario/fichaje; I.23 lista candidatos para `owner`/`admin`/`manager` y permite cambios de estado operativos delegando en `setOvertimeCandidateStatus(...)`; I.24 detecta diferencias positivas claras desde contexto existente y marca `needs_review` ante fichajes abiertos, correcciones pendientes, semanas reabiertas o datos incompletos. No calcula ni aprueba horas extra reales, no introduce importes/saldos/compensaciones, no automatiza decisiones legales y no modifica fichajes, cierres semanales, horario, asignaciones, cobertura, ausencias ni eventos.
- Revision 2026-05-16: I.25 cierra la trazabilidad operativa prudente de cobertura. `/app/schedule` y `/app/coverage` muestran, en detalle de bloque y solo para `owner`/`admin`/`manager`, una lectura reciente de impacto derivado de ausencias, solicitudes de cambio/cobertura y auditoria minimizada de bloques/asignaciones/plantilla. No muestra motivos sensibles, no persiste impactos de ausencia, no muta horario/fichaje/ausencias/cambios y no resuelve cobertura automaticamente.
- Revision 2026-05-16/17: I.26 deja la IA como modelado prudente subordinado a documentos/programacion utiles. E.6/I.27 confirma que el siguiente paso no es IA, sino programacion util versionada y autorizada asociada a documentos y horario. E.7/I.28 implementa esa base interna con una tabla puente y helpers server-side. E.8/I.29 abre solo consulta minima desde detalle de bloque en Horario, usando permisos documentales y rutas backend existentes. E.9/I.30 valida grants y limites con SQL rollback, E.10/I.31 convierte esa validacion en runbook operativo manual local/QA, E.11 abre un repositorio visible minimo de lectura autorizada en `/app/documents`, E.12 prepara su QA/staging controlado con rollback y evidencia, E.13 cierra evidencia local/bloqueos sin ampliar producto, E.14 reintenta validacion real con archivo Storage controlado dejando bloqueo honesto por falta de acceso real, E.15 actualiza ese desbloqueo controlado sin evidencia staging real y E.16 deja el handoff operativo redacted para el operador que pueda ejecutar QA/staging real. No implementa IA real ni infraestructura runtime: no SDKs, prompts, embeddings, vector DB, jobs, rutas de IA ni UI de IA. Cualquier IA futura debe depender de fuentes canonicas, permisos/grants, auditoria minimizada, privacidad/legal y aislamiento de tenant; queda prohibida para decisiones automaticas de cobertura, aprobaciones, fichaje, horas extra, payroll o inferencias sensibles.
- Revision 2026-05-21: S.108-S.110 cierran el flujo local autenticado. `npm run supabase:reset` queda protegido por defecto y no ejecuta `supabase db reset`; cualquier reset real local exige `npm run supabase:reset:danger` con autorizacion explicita. El fixture Auth E2E local es reproducible con dry-run/rollback por defecto y commit opcional, los smokes autenticados por `owner`/`admin`/`manager`/`coach` quedan verdes localmente, el warning `NO_COLOR`/`FORCE_COLOR` se estabiliza en `playwright.smoke.config.ts`, y la documentacion operativa queda alineada sin normalizar los warnings LF/CRLF preexistentes.
- Revision 2026-05-22: se consolida el pulido user-friendly de superficies operativas ya existentes. El flujo pendiente de vinculacion Auth/persona/ficha deja de mandar a Horario como callejon sin salida y usa Mi cuenta o Equipo segun rol; Solicitudes, Ausencias, Mi fichaje, cierre semanal, Horario, Plantillas y Equipo reducen copy interno/legal visible y priorizan acciones claras. No cambia el modelo de permisos ni abre RRHH sensible, payroll, documentos firmables, geolocalizacion, IA, push ni automatismos.
- Decision 2026-05-26: BoxOps necesitara `BoxOps Console` como capa interna separada de `/app` para operar el SaaS: crear organizaciones, owner/admin iniciales, revisar centros/usuarios/estado/plan/limites/salud y abrir tenants en modo soporte auditado. Los operadores de plataforma no deben ser `owner` permanentes de todos los tenants; sus permisos viven en `platform_admins` o equivalente, separados de `organization_memberships`. Billing se fasea: suscripcion manual primero, billing visible para `owner` despues y Stripe como proveedor inicial para Checkout/Customer Portal, facturas, tarjeta y SEPA Direct Debit. BoxOps no guarda tarjetas, IBAN completos ni datos bancarios sensibles; solo referencias de proveedor, plan, estado, limites y metadata comercial minimizada. GoCardless queda como alternativa futura si la domiciliacion SEPA domina el negocio.
- Revision 2026-05-27/28: Console abre el modo soporte auditado desde `/console/organizations/[organizationId]` hacia `/app` con motivo breve, caducidad 30/60/120 minutos, auditoria `support_started`/`support_ended` e indicador visible. Solo `platform_owner` o `support` activos pueden usarlo sobre organizaciones `trialing`/`active`; no suplanta usuarios ni convierte platform admins en memberships permanentes. Desde 2026-05-28 puede realizar asistencia operativa auditada en centros, accesos/fichas de equipo, invitaciones, tipos, horario, plantillas, jornadas previstas, asignaciones y eventos, vinculando `operational_audit_events` a la `platform_support_session`. La creacion directa de Auth usa solo la excepcion server-only existente; no concede lectura a documentos, fichaje, payroll, firmas ni RRHH sensible. El control manual de acceso mantiene `trialing`/`active` como estados resolubles y bloquea `suspended`/`inactive`.
- Las nuevas fases deben ampliar BoxOps hacia configuracion de tenant, seguridad auth, roles avanzados, area personal/RRHH, documentos, fichaje y futura app movil.
- Esta revision no implementa seeds automaticos, billing, documentos firmables, snapshots documentales reales, RRHH sensible, fichaje geolocalizado activo/avanzado, lectura real de `navigator.geolocation`, payroll, swap entre dos bloques, creacion de ausencia para otra persona ni calendario completo de ausencias.

## Roadmap Actual

La vista resumida vive en `docs/product/roadmap.md`, el mapa de cierre hacia beta/webapp v1 vive en `docs/product/webapp-completion-roadmap.md` y el backlog ejecutable en `TASKS.md`.

- Mapa de cierre 2026-05-17/2026-05-26: beta operativa exige datos reales validados, entorno real/staging, Auth/email, purga, credenciales E2E, smokes por rol y runbooks; OD.1/I.32 anade el checklist especifico de operativa diaria completa para beta interna y F.15 anade el checklist especifico de fichaje web/cierre laboral prudente. Webapp v1 vendible exige tenant/permisos, operativa diaria, fichaje web prudente, documentos/firma/certificaciones, hardening produccion, BoxOps Console, onboarding SaaS, billing por fases con Stripe y exportes. IA queda como ultimo extra futuro, posterior a una webapp vendible y a documentos/programacion/permisos/auditoria/legal cerrados.
- Carril transversal S: seguridad, privacidad y tenant safety en todas las fases, con baseline en `docs/architecture/security-baseline.md`.
- Fase A: cierre MVP 1 real con datos validados y deuda pequena.
- Fase B: configuracion de tenant, branding, roles avanzados e invitaciones de equipo por email.
- Fase C: auth/security polish.
- Fase D: area personal y modelo RRHH.
- Fase E: documentos, permisos, nominas, firmas y certificaciones; E.1 modela documentos/permisos, E.2 abre metadata/grants, E.3 crea Storage privado minimo, E.4 abre auditoria documental tecnica, E.5 abre preview/descarga backend controlada sin UI ni firmas, E.6/I.27 modela programacion util asociada a documentos y horario sin IA, E.7/I.28 crea la base tecnica interna de enlaces documentales de programacion, E.8/I.29 muestra consulta minima autorizada desde Horario, E.9/I.30 valida con QA rollback, E.10/I.31 deja runbook operativo manual local/QA, E.11 abre `/app/documents` como repositorio visible minimo de lectura autorizada, E.12 prepara QA/staging controlado, E.13 cierra evidencia local/bloqueos staging, E.14 reintenta validacion real con archivo Storage controlado sin desbloquear staging por falta de acceso, E.15 actualiza el bloqueo de desbloqueo controlado, E.16 deja el handoff operativo para desbloquear QA/staging real y E.19 anade primer adjunto minimo con Storage privado desde `/app/documents`.
- Fase F: fichaje web manual, automatico por planificacion, cierre semanal, aprobacion firmada y runbook F.15 de beta interna prudente.
- Fase G: geolocalizacion nativa futura; G.1/G.2 son documentales y G.3/G.4 son base tecnica interna sin UI visible, sin lectura real de ubicacion en web y sin activacion operativa.
- Fase H: PWA/app movil, geofencing nativo y notificaciones push futuras.
- Fase I: cambios, ausencias, eventos, horas extra, programacion util documental e IA futura condicionada por documentos/programacion utiles.

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

- `owner` (visible: Propietario): gestiona configuracion global del tenant, accesos y operativa MVP 1.
- `admin` (visible: Administrador): conserva todo lo que hacia en MVP 1: configuracion global, accesos, equipo, centros, tipos, horario, asignaciones, plantillas y cobertura.
- `manager` (visible: Responsable): gestiona operativa tenant-wide de MVP 1: centros, tipos, fichas operativas de entrenador, horario, asignaciones, plantillas y cobertura. No gestiona configuracion global ni altas/roles de memberships.
- `coach` (visible: Entrenador): consulta centros, equipo, tipos, horario, asignaciones y cobertura en modo lectura.
- `staff`, `center_manager`, `document_admin` y `payroll_manager`: roles reconocidos por schema/app para no bloquear memberships existentes, pero sin mutaciones especificas en B.2.

Decision de nomenclatura 2026-05-11: los identificadores internos se mantienen en ingles por compatibilidad (`owner`, `admin`, `manager`, `coach`), pero la UI usa etiquetas en espanol. No se debe mostrar "Admin compatible" ni "Manager operativo" como etiqueta de usuario.

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
| IA fuera de las primeras fases | I.26 confirma que sin documentos/programacion utiles, permisos, auditoria y privacidad clara seria decoracion cara y riesgo operativo. |
| Programacion util antes de IA | E.6/I.27 confirma que el siguiente paso es asociar documentos versionados y autorizados a fecha/tipo/centro/bloque antes de cualquier IA; E.7/I.28 lo implementa como foundation interna con `document_programming_links`, E.8/I.29 lo muestra de forma minima desde Horario, E.9/I.30 lo valida con QA interno rollback y E.10/I.31 lo convierte en runbook manual local/QA, no como IA. |
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
| Fichaje automatico web por planificacion | La webapp puede reducir friccion generando fichajes desde clases/bloques asignados, pero no prueba presencia real y siempre debe ser corregible y aprobable. |
| Cierre semanal firmado | Las semanas de fichaje se envian automaticamente a aprobacion el domingo a las 23:59; aprobar con firma propia cierra la semana y rechazar exige nota, notificacion y correccion del usuario. |
| Geolocalizacion reservada a nativo | BoxOps no debe pedir ubicacion desde la webapp; background/geofencing queda para app nativa o wrapper movil con permisos, privacidad y revision legal. |
| PWA/web antes de nativo | La app nativa se evalua si el caso comercial exige geofencing fiable con app cerrada. |
| "Mi firma" antes de documentos firmables | La firma dibujada reutilizable pertenece al perfil/cuenta del usuario; los botones "Firmar" deben consumirla despues y guardar snapshot/auditoria. |
| E.1 documentos antes de schema | Documentos, versiones, sujetos, grants, auditoria candidata y evidencias futuras se modelan antes de crear buckets, UI o boton "Firmar". |
| E.2 schema documental minimo | Se crean solo metadata, versiones, sujetos y grants con RLS estricta; `document-files` queda como ruta interna candidata y `requires_signature` se bloquea en `false` hasta una fase futura. |
| E.3 Storage documental privado | `document-files` se crea privado y solo acepta archivos asociados a `document_versions.pending` por path exacto; lectura de archivo exige version active/archived y acceso por sujeto/grant/capacidad. |
| E.4 auditoria documental minima | `document_access_events` registra eventos documentales tenant-scoped con actor, resultado, access level y metadata minimizada; lectura de auditoria no se hereda por `owner`/`admin`/`manager`. |
| E.5 acceso documental controlado | Preview y descarga pasan por rutas backend que revalidan sesion, tenant, version, permiso y auditoria antes de emitir signed URLs cortas. E.11 reutiliza esas rutas desde un repositorio visible minimo. |
| Seguridad como gate transversal | BoxOps debe tratar tenant safety, permisos, RLS, Storage privado, secretos, dependencias, auditoria y privacidad como criterio de salida de cada fase, no como arreglo final antes de produccion. |
| Detalles operativos sin recarga | Abrir/cerrar tarjetas de horario, cobertura o plantillas debe conservar scroll/contexto. Para cambios solo de query param en la misma ruta se usa `RouteStateLink`/History API, no `Link`/`router.push` de App Router. |
| Disponibilidad de coach en Postgres | Un coach `assigned` no puede solaparse en bloques activos del mismo tenant/dia. La UI puede filtrar opciones, pero la garantia vive en DB y devuelve `coach-unavailable`. |
| Jornada prevista separada del horario | `staff_work_windows` aporta contexto de presencia prevista sin crear clases, asignaciones ni restricciones duras sobre cobertura. Desde el corte 2026-05-23 puede alimentar fichaje automatico `schedule_auto` si el tenant lo activa, siempre con `presenceVerified = false` y corregible. |
| Eventos como contexto operativo | Festivos, competiciones y eventos viven en `operational_events` como contexto tenant-scoped; pueden orientar horario/cobertura, pero no mutan `schedule_blocks`, asignaciones, ausencias, fichaje ni payroll automaticamente. |
| Formularios densos mobile-first | En pantallas operativas con UUIDs/selects largos, los campos deben reservar espacio para texto y flecha, usar ellipsis cuando haga falta y reorganizar campos largos a ancho completo en movil. |
| Copy de permisos sin ruido visual | No mostrar avisos permanentes de "modo lectura" o limitaciones de rol si no ayudan a decidir o actuar. La UI debe transmitir permisos con acciones disponibles, estados vacios utiles, botones ausentes/deshabilitados y explicaciones solo en el punto de friccion. |
| Feedback temporal para acciones | Las confirmaciones y errores puntuales despues de crear, guardar o aplicar cambios no deben quedar como contenido permanente. Usar banners/toasts discretos, con color de exito o error, cierre manual y desaparicion automatica en unos segundos; reservar alerts persistentes para estados de pantalla o bloqueos reales. |
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
- El fichaje web debe funcionar sin ubicacion: manual o automatico por clases/bloques asignados. La geolocalizacion de fichaje, si existe, sera una capacidad de app nativa/wrapper movil vinculada a turno/centro y ventana temporal; no debe guardar trayectos ni historial de posiciones. Tras G.3/G.4, la decision aplicada para la base interna es no persistir coordenadas crudas del trabajador: solo resultado/buckets minimizados, con retencion propia.
- Horas extra sera primero candidato operativo revisable/exportable internamente, no aprobacion legal, compensacion, saldo, payroll ni generacion de nominas.
- Los documentos sensibles usaran Storage privado, RLS, URLs firmadas y auditoria si procede.
- E.2 implementa metadata documental minima en Postgres, E.3 crea `document-files` como bucket privado minimo conectado a `document_versions`, E.4 crea auditoria documental minima en `document_access_events` y E.5 crea rutas controladas de preview/descarga con signed URL corta; `document-signature-evidence` sigue futuro y no hay documentos firmables.
- Los documentos separan cabecera, version/archivo, sujetos afectados, grants y auditoria. No basta con un archivo suelto en Storage.
- Nominas, salario/retribucion, contrato, jornada y datos laborales requieren permisos mas finos que el rol operativo basico.
- `owner`, `admin` y `manager` no heredan por defecto acceso a datos laborales sensibles; cada campo futuro necesita capacidad explicita y, cuando proceda, grants/auditoria.
- Los assets personales, como avatar y firma, deben derivar la persona desde sesion + tenant para acciones propias y no permitir edicion de otra persona desde Mi cuenta.
- El avatar personal de D.4 se guarda como asset privado tenant-scoped; no se guarda una URL publica libre ni se permite reemplazo ajeno desde Mi cuenta.
- En Espana, el fichaje debe contemplar inicio/fin de jornada, conservacion de registros durante 4 anos y acceso para trabajador, representantes e Inspeccion, pendiente de revision legal antes de prometer cumplimiento.
- La webapp/PWA no pedira ubicacion para fichar; geofencing en segundo plano requerira fase nativa o wrapper movil si se vuelve requisito comercial.
- La configuracion de ubicacion por centro, si se implementa, debe vivir en entidad tenant-safe con `organization_id` obligatorio y no como copy o constante de UI. La evidencia de ubicacion debe tener permisos, RLS/RPC, retencion y acceso definidos antes de datos reales.

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
npm run test:smoke:e2e-auth
npm run test:smoke:protected
npm run test:smoke:protected:roles
npm run test:smoke:e2e-local
npm run typecheck
npm run build
npm run supabase:start
npm run supabase:status
npm run supabase:reset
npm run supabase:reset:danger
npm run supabase:setup:e2e-auth
npm run supabase:setup:e2e-auth:commit
npm run supabase:types
```

`npm run supabase:reset` esta protegido y bloquea por defecto para no borrar `auth.users` ni datos locales manuales. `supabase:reset:danger` y `supabase:setup:e2e-auth:commit` son comandos disponibles, pero no forman parte del flujo por defecto y requieren confirmacion explicita del turno.

## Proximos Pasos

1. Mantener Fase A como base para QA interno y desarrollo; la validacion oficial STL queda para una etapa posterior de producto casi completo antes de seed/produccion.
2. Aplicar `docs/architecture/security-baseline.md` como gate antes de beta/produccion, datos reales sensibles o nuevas superficies con documentos, firmas, RRHH, fichaje o ubicacion.
3. Seguir `docs/operations/tenant-readiness-checklist.md` para B.4: activar un tenant exige configuracion minima, centros, roles, tipos, datos iniciales, invitaciones/Auth validadas y evidencia; logo/asset privado, colores por centro, permisos por centro, `center_manager` y onboarding guiado quedan para v1 o task propia.
4. Seguir `docs/operations/pre-qa-controlled-pilot-runbook.md` y `docs/operations/beta-operational-readiness-runbook.md`: configurar Resend/Supabase SMTP, politica de contrasena, Redirect URLs reales y `SUPABASE_SERVICE_ROLE_KEY` server-only antes de QA con emails reales o creacion directa de cuentas. Mientras no haya dominio comprado/verificado en Resend, las invitaciones por email quedan limitadas a pruebas con remitente `onboarding@resend.dev` y destinatarios permitidos. S.8/A.1 deja el checklist de beta interna: acceso Supabase real/staging, validacion oficial de datos reales, email interno controlado, credenciales E2E `owner`/`admin`/`manager`/`coach`, invitacion, aceptacion, reset, creacion directa con cambio obligatorio de contrasena, purga S.1 y evidencia minima. Para regresion local autenticada, mantener S.108-S.110 como baseline: reset bloqueado por defecto, setup E2E en dry-run, preflight Auth y smokes por rol; no usar reset peligroso ni commit de fixture salvo necesidad explicita.
5. Validar D.4/D.5 en Supabase local/QA: avatar propio y firma propia con buckets privados, metadata tenant-scoped, signed URL corta y fallback visual. No saltar a documentos ni RRHH sensible.
6. Cerrar E.16/E.19 antes de usar documentos reales: ejecutar E.12 en local/QA/staging segun accesos y seguir el handoff operativo redacted para guardar evidencia del repositorio visible en `/app/documents`, grants reales, solo metadata, estado vacio sin grant, preview/descarga por E.5 con archivo controlado, auditoria `file_preview`/`file_download`, denegaciones auditadas cuando aplique, bloqueo de otro tenant, exclusiones `sensitive_hr`/`payroll`/`signature_evidence`/`requires_signature` y adjunto minimo E.19 solo con archivo sintetico no sensible. Si falta acceso a staging, documentar bloqueo concreto sin inventar evidencia. Subida masiva, gestion de versiones existentes, grants UI, auditoria visible, documentos firmables y boton "Firmar" siguen siendo fases posteriores.
7. Mantener Fase F como via principal de fichaje: manual, automatico por planificacion, corregible, con cierre semanal y aprobacion firmada antes de depender de ubicacion. Seguir `docs/operations/time-tracking-beta-readiness-runbook.md` para validar F.15 antes de incluir fichaje en beta interna real.
8. No abrir nuevas superficies visibles de G ni lectura real de ubicacion web; la geolocalizacion queda para app nativa/wrapper futuro con task tecnica explicita, copy legal revisado, pruebas de precision real y decision de negocio. G.3/G.4 solo dejan base tecnica interna tenant-safe.
9. Mantener Fase I por cortes seguros: cambios/cobertura ya tienen workflow minimo y trazabilidad operativa I.25, ausencias tienen bandeja e impacto derivado, I.19 deja eventos/festivos/competiciones visibles solo como contexto minimo en Horario, I.24 deja horas extra con revision visible y deteccion operativa prudente de candidatos de posible exceso, I.26 deja IA subordinada a documentos/programacion utiles sin implementacion real, E.6/I.27-E.16 avanzan programacion/documentos utiles como consulta autorizada, evidencia prudente y handoff QA/staging, y OD.1/I.32 cierra documentalmente operativa diaria para beta interna. Sin automatismos legales, calculo definitivo, payroll, resolucion automatica de cobertura ni decisiones operativas por IA.
10. Seguir `docs/architecture/tenancy-and-billing.md` para la capa SaaS: Console ya abre foundation, creacion controlada, suspension/reactivacion manual y soporte auditado temporal; despues van billing visible para `owner`, y finalmente Stripe real con webhooks y Customer Portal. No guardar datos bancarios sensibles en BoxOps ni usar platform admin como membership permanente de todos los tenants.
11. Usar `docs/product/webapp-completion-roadmap.md` como mapa de cierre: primero beta operativa, despues webapp v1 vendible, luego nativo/geofencing si el negocio lo exige y por ultimo IA como extra futuro.

## Documentos De Referencia

- `PRD.md`: vision funcional general.
- `docs/product/mvp.md`: fases MVP y criterios de exito.
- `docs/product/roadmap.md`: vista resumida de fases A-I despues de Task 017.
- `docs/product/webapp-completion-roadmap.md`: mapa de cierre hacia beta operativa, webapp v1 vendible, futuro opcional e IA como ultimo extra.
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
- `docs/architecture/security-baseline.md`: baseline transversal de ciberseguridad, privacidad y tenant safety.
- `docs/architecture/personal-data-permissions.md`: matriz D.2, E.1, E.2, E.3, E.4 y E.5 de permisos por campo para area personal, assets, firma, documentos, auditoria y RRHH sensible futuro.
- `docs/architecture/tenancy-and-billing.md`: decision de tenancy, infraestructura, BoxOps Console, soporte auditado, suscripciones y modelo de cobro.
- `docs/guides/README.md`: guias personales para volver al proyecto sin reconstruirlo entero.
- `docs/user-guides/README.md`: guias de uso por rol, incompletas donde el producto aun no existe.
- `docs/operations/legal-and-privacy-notes.md`: notas sobre fichaje, privacidad, horas extra y documentos.
- `docs/operations/beta-operational-readiness-runbook.md`: checklist S.8/A.1 para cierre de realidad operativa antes de beta interna controlada.
- `docs/operations/tenant-readiness-checklist.md`: checklist B.4 para base SaaS, roles y activacion prudente de tenants antes de beta/v1.
- `docs/operations/daily-operations-beta-readiness-runbook.md`: checklist OD.1/I.32 para cierre de operativa diaria completa antes de beta interna.
- `docs/operations/time-tracking-beta-readiness-runbook.md`: checklist F.15 para cierre de fichaje web y cierre laboral prudente antes de beta interna.
- `docs/operations/document-programming-manual-validation-runbook.md`: runbook E.10/I.31 para validacion manual local/QA de programacion documental autorizada.
- `docs/operations/document-repository-beta-readiness-runbook.md`: runbook E.11-E.19 para repositorio documental visible minimo, primer adjunto seguro, validacion QA/staging controlada, roles, grants, bloqueos, handoff operativo, evidencia redacted y limites de beta/v1.
- `docs/tenants/stl/README.md`: casuistica del primer tenant.
- `docs/tenants/stl/design-notes.md`: notas visuales del primer tenant sin contaminar producto generico.
