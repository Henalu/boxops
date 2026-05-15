# Tasks - BoxOps

## Plan Canonico Actualizado - 2026-05-08

Estado base: Task 017 dejo implementado MVP 1 visual/operativo con auth, multi-tenant, centros, equipo/coaches, tipos de actividad, horario semanal, asignaciones, cobertura, plantillas, dashboard, `/app/coverage`, `/app/more`, estadisticas operativas en `/app/stats`, navegacion mobile-first y onboarding local.

Este bloque manda para los siguientes cortes. Las secciones historicas de Task 001-017 se conservan como registro de ejecucion.

Reglas para las fases nuevas:

- [ ] No tocar codigo de app, migraciones ni seeds hasta abrir una task tecnica concreta.
- [ ] No hardcodear STL; STL sigue siendo tenant piloto, no producto.
- [ ] Mantener `Organization/Tenant -> Centers -> Users/Coaches -> Schedules -> Classes/Blocks -> Events`.
- [ ] Separar permisos de configuracion global, gestion diaria y funciones personales.
- [ ] Revisar privacidad/legal antes de documentos sensibles, nominas, fichaje, geolocalizacion o firmas.
- [ ] Aplicar `docs/architecture/security-baseline.md` como gate transversal antes de cerrar features nuevas con datos de tenant, datos personales, documentos, firmas, fichaje o ubicacion.
- [ ] Toda tabla, ruta o action nueva con datos tenant-scoped debe tener frontera de organizacion, permisos, RLS, validacion servidor y prueba negativa o verificacion de acceso denegado.
- [ ] No reintroducir navegacion completa para abrir/cerrar detalles operativos cuando solo cambia `block_id` o `edit_block_id`; usar `RouteStateLink`/History API y ejecutar `tests/smoke/operational-detail-panels.spec.ts` si se toca Horario, Cobertura o Plantillas.
- [ ] No relajar la disponibilidad de coach a una solucion solo frontend; los solapes de un coach `assigned` en bloques activos se bloquean en Postgres con `coach-unavailable` y deben cubrirse con `tests/smoke/schedule-coach-availability.spec.ts` si se toca asignacion.
- [ ] En formularios densos mobile-first, no volver a campos colapsados: UUIDs/nombres largos a ancho completo cuando haga falta, selects con padding suficiente para la flecha y truncado legible.

La vista resumida de producto vive en `docs/product/roadmap.md`.

### Carril S - Seguridad, Privacidad Y Tenant Safety

Objetivo: mantener ciberseguridad como criterio de calidad de producto, no como fase tardia. Este carril acompana todas las fases A-I y bloquea produccion o datos reales sensibles si no se cumplen los gates.

Estado 2026-05-10: ya existian buenas decisiones repartidas por el proyecto: multi-tenant por membership, RLS, reset anti-enumeracion, roles compatibles, assets privados para avatar/firma, grants documentales y bloqueo explicito de RRHH sensible. Se anade baseline transversal en `docs/architecture/security-baseline.md` para que no dependa de memoria o buena intencion.

Alcance:

- revisar cada feature contra tenant safety, permisos, RLS, validacion servidor, Storage privado y auditoria cuando proceda;
- usar OWASP ASVS 5.0 Level 1 como baseline de MVP/public beta y OWASP Top 10 2025 como mapa de riesgos;
- anadir pruebas negativas para accesos entre tenants, roles sin permiso, assets ajenos, documentos/grants y acciones propias;
- revisar dependencias, secretos, headers, Supabase Auth, Redirect URLs y buckets antes de produccion;
- documentar deuda de seguridad aceptada cuando una mitigacion no entre en el corte.

No incluye:

- prometer seguridad absoluta;
- auditoria profesional externa automatica;
- abrir MFA/SSO obligatorio sin decision de producto;
- implementar documentos, payroll, fichaje o geolocalizacion sin sus gates propios.

Criterio de salida transversal:

- [x] Baseline de seguridad documentado en `docs/architecture/security-baseline.md`.
- [x] Roadmap y brief reconocen seguridad como carril transversal, no solo Fase C.
- [ ] Antes de beta/produccion con datos reales, revisar MVP contra OWASP ASVS 5.0 Level 1 y registrar desviaciones.
- [ ] Anadir tests negativos de tenant/RLS/permisos para superficies criticas existentes y futuras.
- [ ] Anadir revision recurrente de dependencias, lockfile y secretos antes de deploys relevantes.
- [ ] Revisar headers de seguridad, CSP viable, cookies, HTTPS y configuracion real de Supabase Auth antes de produccion.
- [ ] No activar subida/preview/descarga real de documentos privados sin bucket privado, grants, auditoria y tests de acceso denegado.
- [ ] No activar firma documental sin snapshot/version inmutable, evidencia auditada y bloqueo de firma por delegacion.
- [ ] No activar RRHH sensible, fichaje o geolocalizacion con datos reales sin revision legal/privacidad y auditoria definida.

#### S.1 - Auditoria Operativa Corta Y Retencion

Estado: primer corte minimo implementado el 2026-05-12. S.1.1 queda cerrado como hardening de auditoria operativa: existe `operational_audit_events`, RPC segura de registro/consulta, helper server-side, llamadas desde actions de Equipo, Horario, Asignaciones, Plantillas e invitaciones aceptadas, verificacion SQL/RLS local con rollback y funcion acotada de purga de eventos expirados. No se crea dashboard nuevo.

Decision: BoxOps necesita auditoria de aplicacion para cambios relevantes de usuarios/accesos y operativa diaria, pero con retencion corta y datos minimizados. Esto ayuda a responder "quien cambio que" en incidencias normales sin guardar logs eternamente. No sustituye backups, PITR, logs administrados de Supabase ni control estricto de acceso al dashboard de produccion.

- [x] Usar una tabla generica `operational_audit_events` para auditoria operativa corta de aplicacion.
- [x] Registrar altas/cambios de memberships, rol, estado, vinculacion de persona visible/ficha y acciones administrativas equivalentes desde las actions existentes.
- [x] Registrar cambios relevantes de `schedule_blocks`: fecha, hora, centro, tipo de actividad, estado, notas operativas como campo tocado y `required_coaches`.
- [x] Registrar cambios relevantes de `schedule_block_assignments`: coach asignado, retirada, cambio de estado y origen.
- [x] Registrar cambios relevantes de `schedule_templates` y `schedule_template_blocks`: alta, edicion, archivado, recuperacion y aplicacion explicita a semana.
- [x] Guardar solo datos minimos: `organization_id`, actor autenticado, membership/persona resuelta si existe, entidad objetivo, accion, resultado, campos cambiados minimizados, `created_at` y `retain_until`.
- [x] No guardar payloads completos, secretos, tokens, contrasenas, signed URLs, documentos, datos RRHH sensibles, IP/fingerprint ni ubicacion cruda; `changed_fields` bloquea claves/valores de riesgo y no guarda notas completas.
- [x] Definir retencion inicial: accesos/usuarios/equipo 30 dias; horario, clases, asignaciones y plantillas 15 dias.
- [x] Crear base segura de purga para eventos expirados: `purge_expired_operational_audit_events(batch_size)` borra solo filas con `retain_until < now()`, en lotes acotados y sin grant a `authenticated`.
- [ ] Activar job/cron real antes de produccion para ejecutar la purga acotada y revisar metricas/alertas de fallo del job.
- [x] Exponer consulta interna tenant-scoped con `list_operational_audit_events` para `owner`/`admin`. Decision S.1: `manager` no lee logs porque la misma tabla mezcla accesos/equipo con operativa.
- [x] Anadir verificacion SQL/RLS reejecutable en `supabase/snippets/operational-audit-rls-verification.sql`: owner/admin leen logs del tenant; manager/coach/staff no leen; otro tenant no lee ni registra sobre entidad ajena; la RPC deriva actor/membership/persona; `changed_fields` rechaza token, URL, IP, geolocation, document, salary/payroll y payload largo.
- [ ] Integrar esta verificacion en CI si el proyecto adopta un runner SQL local estable para Supabase; por ahora se ejecuta localmente con rollback.
- [x] Documentar que los cambios hechos directamente en Supabase Studio/Auth no quedan cubiertos por auditoria de app salvo proceso especifico.

Fuera de S.1:

- conservar logs operativos indefinidamente;
- usar auditoria como fuente canonica de negocio o sustituto de backup;
- auditoria legal de fichaje/documentos/firma, que mantiene sus modelos y retenciones propias.

#### S.2 - Cierre pre-QA y preparacion de piloto controlado

Estado: revision tecnica ejecutada el 2026-05-12 sin abrir modulos nuevos. El corte deja verificacion local limpia, runbook operativo minimo en `docs/operations/pre-qa-controlled-pilot-runbook.md` y una lista corta de bloqueos antes de probar con STL o con emails reales.

Alcance:

- revisar worktree, snippets temporales, secretos, variables de entorno, migrations, RLS y smoke tests;
- documentar configuracion minima de Resend, Supabase Auth Redirect URLs y SMTP/Auth emails antes de QA real;
- dejar la purga de S.1 como gate pre-produccion mediante job de base de datos o runbook temporal controlado;
- confirmar que no se introduce UI de ubicacion, `navigator.geolocation`, geofencing, documentos firmables, payroll ni ausencias.

Verificacion 2026-05-12:

- [x] `git status --short` revisado; hay worktree sucio amplio y no se revierte nada ajeno.
- [x] Detectados snippets tipo scratch: `supabase/snippets/Untitled query 148.sql`, `Untitled query 161.sql`, `Untitled query 761.sql` ya estan trackeados y `Untitled query 445.sql` estaba sin trackear. Se anade regla de `.gitignore` para nuevos `Untitled query *.sql`, pero los trackeados requieren limpieza explicita en un commit aparte.
- [x] `.env.local` sigue ignorado por `.gitignore` y no esta trackeado.
- [x] `.env.example` mantiene solo placeholders para `RESEND_API_KEY`, `BOXOPS_EMAIL_FROM`, `BOXOPS_EMAIL_REPLY_TO` y `NEXT_PUBLIC_SITE_URL`.
- [x] Busqueda de secretos trackeables no encuentra API key Resend real, JWT Supabase real ni `SUPABASE_SERVICE_ROLE_KEY`; revisar de nuevo antes de commit final.
- [x] `rg -n "STL" src` sin coincidencias.
- [x] `rg -n "service_role" src` sin coincidencias.
- [x] `rg -n "navigator\.geolocation" src` sin coincidencias.
- [x] `npm run typecheck` pasa.
- [x] `npm run lint` pasa.
- [x] `npm run build` pasa.
- [x] `E2E_BASE_URL=http://127.0.0.1:3003 npm run test:smoke` pasa con 23 passed y 9 skipped por falta de credenciales E2E autenticadas.
- [x] `npx supabase db lint --local` pasa sin errores de schema.
- [x] `npx supabase migration list --local` muestra 00001-00024 aplicadas localmente.
- [x] `supabase/snippets/operational-audit-rls-verification.sql` pasa contra Supabase local via `docker exec ... psql` con rollback.

Bloqueos antes de QA STL/emails reales:

- [x] Limpiar o sacar de tracking los snippets `supabase/snippets/Untitled query *.sql` que no sean fixtures nombrados y revisados. S.3 saca del indice los tres `Untitled query` trackeados y deja los scratch locales cubiertos por `.gitignore`.
- [ ] Configurar/rotar `RESEND_API_KEY` en el entorno real, sin commitearla.
- [ ] Configurar `BOXOPS_EMAIL_FROM`, `BOXOPS_EMAIL_REPLY_TO` si aplica y `NEXT_PUBLIC_SITE_URL` por entorno.
- [ ] Verificar dominio/remitente en Resend o limitar pruebas a `onboarding@resend.dev` con destinatarios permitidos.
- [ ] Configurar Supabase Auth Site URL, Redirect URLs y politica minima de password en el proyecto real.
- [ ] Activar Custom SMTP de Supabase Auth con Resend si el entorno debe enviar reset/confirmaciones a usuarios externos al equipo del proyecto.
- [ ] Probar una invitacion real controlada y un reset password controlado antes de invitar a STL.
- [ ] Programar job real de purga para `purge_expired_operational_audit_events(1000)` o aceptar fallback manual temporal documentado; no exponerlo como UI/action normal.
- [ ] Configurar credenciales E2E autenticadas si se quiere que smokes de admin/coach/owner/manager y paneles operativos dejen de quedar skipped.

#### S.3 - QA controlado de email/Auth y gate pre-piloto

Estado: ejecutado el 2026-05-12 sin abrir features nuevas. El corte revisa configuracion local de Resend/Auth sin imprimir secretos, limpia los snippets scratch trackeados y repite la verificacion tecnica. La prueba real de invitacion/reset queda bloqueada porque no hay credenciales E2E autenticadas ni email interno permitido documentado para enviar la invitacion controlada.

Verificacion 2026-05-12:

- [x] `git status --short --branch` revisado; worktree amplio preexistente y no se revierte nada ajeno.
- [x] `.env.local` sigue ignorado por `.gitignore` y no esta trackeado.
- [x] Busqueda enmascarada de secretos en archivos trackeables sin hallazgos de API key Resend real, JWT, private key, token Supabase ni `SUPABASE_SERVICE_ROLE_KEY`.
- [x] `.env.example` conserva placeholders para Supabase public env, `NEXT_PUBLIC_SITE_URL`, `RESEND_API_KEY`, `BOXOPS_EMAIL_FROM` y `BOXOPS_EMAIL_REPLY_TO`.
- [x] `.env.local` tiene `NEXT_PUBLIC_SITE_URL`, `BOXOPS_EMAIL_FROM`, `BOXOPS_EMAIL_REPLY_TO` y `RESEND_API_KEY` presentes con formato plausible; valores no impresos.
- [x] La API de Resend autentica con la key local sin imprimir dominios ni valores; el remitente local usa `resend.dev`, por lo que el envio real sigue limitado a las reglas/destinatarios permitidos por Resend hasta verificar dominio propio.
- [x] `.env.local` no define `SUPABASE_SERVICE_ROLE_KEY`.
- [x] Resend se usa desde servidor con `fetch` en `src/lib/email/resend.ts`, leyendo env en tiempo de llamada y sin SDK/cliente inicializado en scope global.
- [x] Reset de contrasena usa `resetPasswordForEmail` hacia `/auth/callback?next=/reset-password`; `/reset-password` queda como destino interno tras intercambiar el code.
- [x] Invitacion/alta usa `/auth/callback` como redirect de confirmacion y `/invite/accept` como superficie de aceptacion por token.
- [x] Snippets `supabase/snippets/Untitled query 148.sql`, `161.sql` y `761.sql` salen del indice; `Untitled query 445.sql` queda ignorado como scratch local.
- [x] `npm run typecheck` pasa.
- [x] `npm run lint` pasa.
- [x] `npm run build` pasa.
- [x] `E2E_BASE_URL=http://127.0.0.1:3003 npm run test:smoke` pasa con 23 passed y 9 skipped por falta de credenciales E2E autenticadas.
- [x] `npx supabase db lint --local` pasa sin errores de schema.
- [x] `npx supabase migration list --local` muestra 00001-00024 aplicadas localmente.
- [x] `supabase/snippets/operational-audit-rls-verification.sql` pasa con rollback.
- [x] `rg -n "STL" src`, `rg -n "service_role" src` y `rg -n "navigator\.geolocation" src` sin coincidencias.

Bloqueos que siguen antes de piloto STL/emails reales:

- [ ] Verificar en el proyecto Supabase real la Site URL, Redirect URLs exactas por entorno y politica minima de password.
- [ ] Activar Custom SMTP de Supabase Auth con Resend si Auth debe enviar resets/confirmaciones reales fuera del equipo.
- [ ] Confirmar dominio/remitente Resend verificado o limitar la prueba a `onboarding@resend.dev` con destinatario permitido.
- [ ] Definir un email interno permitido y credenciales E2E/admin para ejecutar una invitacion real controlada, aceptacion en `/invite/accept`, vinculacion membership/persona/coach y reset password.
- [ ] Activar en entorno real el job DB de `purge_expired_operational_audit_events(1000)`; fallback manual solo temporal y documentado.

#### S.4 - QA real controlado pre-piloto STL

Estado: ejecutado el 2026-05-12 como QA operativo controlado, sin abrir features nuevas, sin tocar Horario/Cobertura/Plantillas/asignaciones y sin resetear datos. La plantilla STL restaurada sigue presente en local con los conteos esperados. No se hizo envio real de invitacion/reset porque el entorno no declara email interno permitido, credenciales E2E/admin ni acceso administrativo al proyecto Supabase real para verificar Auth/SMTP.

Verificacion 2026-05-12:

- [x] `git status --short --branch` revisado antes de cambios; rama `main` estaba 2 commits por delante y con worktree amplio preexistente. No se revierte nada ajeno.
- [x] `.env.local` sigue ignorado por `.gitignore` y `git ls-files .env.local` no devuelve nada.
- [x] `.env.example` conserva solo valores locales/placeholders; no contiene secretos reales.
- [x] Escaneo estricto de archivos trackeables sin hallazgos de API key Resend real, JWT, private key ni `SUPABASE_SERVICE_ROLE_KEY`.
- [x] `.env.local` tiene `NEXT_PUBLIC_SITE_URL`, `BOXOPS_EMAIL_FROM`, `BOXOPS_EMAIL_REPLY_TO` y `RESEND_API_KEY` presentes con formato plausible; valores no impresos. No define `SUPABASE_SERVICE_ROLE_KEY`.
- [x] Resend autentica con la API key local sin imprimir dominios ni valores; el entorno local no tiene dominios Resend verificados y el remitente queda limitado a pruebas permitidas.
- [x] DB local STL: 1 organizacion STL, 1 plantilla activa `Semana prueba STL L-V`, 165 `schedule_template_blocks` y 165 `schedule_blocks` para 2026-05-04 a 2026-05-08.
- [x] No se reaplica `supabase/snippets/stl-test-week-2026-05-04.sql` porque la plantilla ya esta presente.
- [x] Rutas Auth revisadas en codigo: reset usa `/auth/callback?next=/reset-password`; el callback intercambia el code y redirige internamente a `/reset-password`; signup por invitacion usa `/auth/callback` con `next=/invite/accept?...`.
- [x] `supabase/config.toml` local mantiene Site URL local, pero la allowlist del proyecto Supabase real no se puede validar desde este entorno porque no hay `SUPABASE_ACCESS_TOKEN`/project ref/credenciales administrativas.
- [x] La prueba real de invitacion + aceptacion + reset queda bloqueada por falta de email interno permitido, credenciales E2E/admin y confirmacion de Auth/SMTP real. No se improvisa envio.
- [x] La funcion `purge_expired_operational_audit_events(target_batch_size integer)` existe en local y solo tiene `EXECUTE` para `postgres` y `service_role`; `authenticated` no puede ejecutarla.
- [x] `pg_cron` esta disponible en la base local pero no instalado ni con job creado. Se anade `supabase/snippets/activate-operational-audit-purge-job.sql` como activacion idempotente para operador DB en entorno real; sigue bloqueada su ejecucion real por falta de acceso al scheduler/DB real.
- [x] `npm run typecheck` pasa.
- [x] `npm run lint` pasa.
- [x] `npm run build` pasa.
- [x] `E2E_BASE_URL=http://127.0.0.1:3003 npm run test:smoke` pasa con 23 passed y 9 skipped por falta de credenciales E2E autenticadas.
- [x] `npx supabase db lint --local` pasa sin errores de schema.
- [x] `npx supabase migration list --local` muestra 00001-00024 aplicadas localmente.
- [x] `supabase/snippets/operational-audit-rls-verification.sql` pasa con rollback.
- [x] `rg -n "STL" src`, `rg -n "service_role" src` y `rg -n "navigator\.geolocation" src` sin coincidencias.

Bloqueos restantes antes de piloto STL:

- [ ] Verificar en Supabase real Site URL, Redirect URLs exactas por entorno, politica minima de password y Custom SMTP con Resend si Auth enviara emails reales.
- [ ] Confirmar dominio/remitente Resend verificado o destinatario permitido para `onboarding@resend.dev`.
- [ ] Definir email interno permitido y credenciales E2E/admin fuera del repo; ejecutar invitacion real, aceptacion en `/invite/accept`, vinculacion `organization_memberships` + `person_profiles` + `coach_profiles` y reset hacia `/reset-password`.
- [ ] Ejecutar `supabase/snippets/activate-operational-audit-purge-job.sql` o job equivalente en el entorno real con operador DB, registrar primer resultado y alerta de fallo; hasta entonces la purga S.1 queda con fallback manual temporal, no cerrada como produccion.

#### S.5 - Cierre operativo real de Auth/Email/Purga pre-piloto STL

Estado: ejecutado el 2026-05-12 como cierre operativo controlado sin tocar `src`, Horario, Cobertura, Plantillas, asignaciones ni datos de agenda. El entorno local esta verificado, pero el piloto STL no queda desbloqueado porque los datos controlados siguen sin estar disponibles como valores reales: no hay email interno permitido en entorno, no hay credenciales E2E/admin, no hay `SUPABASE_ACCESS_TOKEN`/project ref ni acceso al scheduler/DB real, y Resend local usa `onboarding@resend.dev` sin dominios verificados visibles.

Verificacion 2026-05-12:

- [x] `git status --short --branch` revisado; worktree amplio preexistente y no se revierte nada ajeno.
- [x] `.env.local` sigue ignorado por `.gitignore` y `git ls-files .env.local` no devuelve nada.
- [x] `.env.example` conserva placeholders/local defaults y no contiene secretos reales.
- [x] Escaneo redacted de archivos trackeables/untracked no ignorados sin hallazgos de valores tipo API key Resend real, JWT, private key, URL firmada ni `SUPABASE_SERVICE_ROLE_KEY`.
- [x] `.env.local` contiene `NEXT_PUBLIC_SITE_URL`, Supabase public env, `RESEND_API_KEY`, `BOXOPS_EMAIL_FROM` y `BOXOPS_EMAIL_REPLY_TO` con forma plausible; no se imprimen valores. No contiene `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ACCESS_TOKEN`, project ref, credenciales E2E ni email controlado.
- [x] Resend API autentica con la key local sin imprimir valores; hay 0 dominios verificados visibles y el remitente local queda clasificado como `resend-dev-limited`.
- [x] DB local STL conserva 1 organizacion STL, 1 plantilla activa `Semana prueba STL L-V`, 165 `schedule_template_blocks` y 165 `schedule_blocks` para 2026-05-04 a 2026-05-08. No se reaplica ningun snippet.
- [x] Rutas Auth revisadas en codigo: reset usa `/auth/callback?next=/reset-password`, el callback redirige internamente a `/reset-password`, y la invitacion usa `/invite/accept`.
- [x] Politica minima de password en app: 8 caracteres, al menos una letra y un numero. La politica real de Supabase Auth no se puede verificar sin acceso administrativo al proyecto real.
- [x] No se ejecuta invitacion/reset real porque faltan email interno permitido, credenciales admin/E2E y verificacion de Supabase Auth/SMTP real.
- [x] Funcion `purge_expired_operational_audit_events(target_batch_size integer)` verificada en local: `authenticated` y `anon` no pueden ejecutarla; `postgres` y `service_role` si.
- [x] Local no tiene `pg_cron` instalado ni job creado; la activacion real sigue bloqueada por falta de permisos/acceso al scheduler o DB real.
- [x] `npm run typecheck` pasa.
- [x] `npm run lint` pasa.
- [x] `npm run build` pasa.
- [x] `E2E_BASE_URL=http://127.0.0.1:3003 npm run test:smoke` pasa con 23 passed y 9 skipped por credenciales E2E no exportadas.
- [x] `npx supabase db lint --local` pasa sin errores de schema.
- [x] `npx supabase migration list --local` muestra 00001-00024 aplicadas localmente.
- [x] `supabase/snippets/operational-audit-rls-verification.sql` pasa con rollback.
- [x] `rg -n "STL" src`, `rg -n "service_role" src` y `rg -n "navigator\.geolocation" src` sin coincidencias.

Resultado S.5: bloqueos restantes. Piloto STL no desbloqueado.

Bloqueos restantes antes de piloto STL:

- [ ] Acceso administrativo al proyecto Supabase real/staging para verificar Site URL, Redirect URLs exactas, politica minima de password y Custom SMTP con Resend si Auth enviara emails reales.
- [ ] Dominio/remitente Resend verificado, o confirmacion explicita de prueba limitada con `onboarding@resend.dev` y destinatario permitido.
- [ ] Email interno permitido real y credenciales E2E/admin disponibles fuera del repo para crear invitacion, aceptar en `/invite/accept`, validar `organization_memberships` + `person_profiles` + `coach_profiles` + `team_invitations` y probar reset hacia `/reset-password`.
- [ ] Ejecutar `supabase/snippets/activate-operational-audit-purge-job.sql` o job equivalente en entorno real con operador DB, registrar primer resultado esperado y alerta de fallo. Hasta entonces la purga S.1 no queda cerrada para produccion.

#### S.6 - Reintento post-S.5 de desbloqueo operativo piloto STL

Estado: ejecutado el 2026-05-12 como continuacion directa de S.5. No se toca `src`, Horario, Cobertura, Plantillas, asignaciones ni datos de agenda. El resultado sigue siendo "bloqueos restantes", no "piloto STL desbloqueado".

Verificacion 2026-05-12:

- [x] Se releen `PROJECT_BRIEF.md`, `TASKS.md`, `docs/product/roadmap.md`, `docs/operations/pre-qa-controlled-pilot-runbook.md`, `docs/architecture/security-baseline.md`, `AGENTS.md`, `../../AGENTS.md`, `../../DEV-INDEX.md` y `../../_workspace/AIContext/09_SKILL_ROUTING.md`.
- [x] `git status --short --branch` revisado; worktree amplio preexistente y no se revierte nada ajeno.
- [x] `.env.local` sigue ignorado por `.gitignore` y `git ls-files .env.local` no devuelve nada.
- [x] `.env.local` contiene `NEXT_PUBLIC_SITE_URL`, Supabase public env, `RESEND_API_KEY`, `BOXOPS_EMAIL_FROM` y `BOXOPS_EMAIL_REPLY_TO` presentes, sin imprimir valores. `NEXT_PUBLIC_SITE_URL` y `NEXT_PUBLIC_SUPABASE_URL` apuntan a entorno local.
- [x] No hay variables de proceso ni `.env.local` con `SUPABASE_ACCESS_TOKEN`, project ref, DB URL real, credenciales E2E/admin, email controlado ni `SUPABASE_SERVICE_ROLE_KEY`.
- [x] `npx supabase projects list --output json` no tiene acceso a proyectos desde este entorno; no se puede verificar Supabase Auth real, Site URL, Redirect URLs, password policy ni Custom SMTP.
- [x] Resend API autentica con la key local sin imprimir valores; la cuenta consultada devuelve 0 dominios y 0 dominios verificados visibles. El remitente local queda en `resend.dev` y no coincide con dominio verificado.
- [x] Servidor disponible detectado en `http://127.0.0.1:3003`; puertos `3000` y `3010` no responden.
- [x] DB local STL conserva 1 organizacion STL, 1 plantilla activa `Semana prueba STL L-V`, 165 bloques de plantilla y 165 bloques generados desde esa plantilla para 2026-05-04 a 2026-05-08. No se reaplica ningun snippet.
- [x] La funcion `purge_expired_operational_audit_events(integer)` mantiene `authenticated = false`, `anon = false` y `postgres = true`; `pg_cron`/`cron.job` no estan instalados localmente y el job real sigue sin verificarse por falta de acceso DB/scheduler real.
- [x] No se ejecuta invitacion, aceptacion ni reset real porque faltan acceso Supabase real/staging, remitente Resend permitido, email interno controlado y credenciales E2E/admin.
- [x] `npm run typecheck` pasa.
- [x] `npm run lint` pasa.
- [x] `npm run build` pasa.
- [x] `E2E_BASE_URL=http://127.0.0.1:3003 npm run test:smoke` pasa con 23 passed y 9 skipped por credenciales E2E no exportadas.
- [x] `npx supabase db lint --local` pasa sin errores de schema.
- [x] `npx supabase migration list --local` muestra 00001-00024 aplicadas localmente.
- [x] `rg -n "STL" src`, `rg -n "service_role" src` y `rg -n "navigator\.geolocation" src` sin coincidencias.

Resultado S.6: bloqueos restantes. Piloto STL no desbloqueado.

Minimo necesario para desbloquear el piloto STL:

- Acceso administrativo al proyecto Supabase real/staging: project ref + `SUPABASE_ACCESS_TOKEN` o acceso equivalente al dashboard para revisar Auth Site URL, Redirect URLs, politica de password y Custom SMTP.
- Acceso DB/scheduler real o operador DB para ejecutar `supabase/snippets/activate-operational-audit-purge-job.sql` o job equivalente, registrar primer resultado y alerta de fallo.
- Remitente Resend verificado o confirmacion explicita de prueba limitada con `onboarding@resend.dev` y destinatario permitido.
- Email interno controlado y credenciales E2E/admin/owner fuera del repo para crear invitacion, aceptar en `/invite/accept`, validar `organization_memberships` + `person_profiles` + `coach_profiles` + `team_invitations` y probar reset hacia `/reset-password`.

#### S.7 - Consolidacion pre-piloto y desbloqueo operativo real

Estado: ejecutado el 2026-05-13 como continuacion directa de S.6. No se abren modulos nuevos, no se crea UI nueva, no se toca Horario/Cobertura/Plantillas/asignaciones ni se usan datos reales de STL fuera del fixture local. El resultado sigue siendo "bloqueos restantes", no "piloto STL desbloqueado".

Verificacion 2026-05-13:

- [x] Se releen `PROJECT_BRIEF.md`, `TASKS.md`, `docs/product/roadmap.md` y `docs/operations/pre-qa-controlled-pilot-runbook.md`.
- [x] `git status --short --branch`, `git diff --stat` y `git diff --name-status` revisados; `main` sigue 2 commits por delante de `origin/main`, el worktree sigue amplio/sucio y no se revierte nada ajeno.
- [x] `PROJECT_BRIEF.md` y `docs/product/roadmap.md` quedan reconciliados con `TASKS.md`/`docs/architecture/domain-model.md`: G.3/G.4 existen como base tecnica interna de schema/RPC/RLS y helpers server-side, sin UI visible, sin `navigator.geolocation`, sin geofencing, sin fichaje automatico y sin activacion operativa de ubicacion.
- [x] `.env.local` sigue ignorado por `.gitignore` y `git ls-files .env.local` no devuelve nada.
- [x] `rg -n "STL" src`, `rg -n "service_role" src` y `rg -n "navigator\.geolocation" src` sin coincidencias.
- [x] Escaneo enmascarado de archivos trackeables/untracked no ignorados sin hallazgos reales de API key Resend, token Supabase, JWT, private key, URL DB con password ni asignacion de `SUPABASE_SERVICE_ROLE_KEY`; una coincidencia inicial fue falso positivo por identificador SQL y se descarta sin imprimir valores.
- [x] `.env.local` contiene `NEXT_PUBLIC_SITE_URL`, Supabase public env, `RESEND_API_KEY`, `BOXOPS_EMAIL_FROM` y `BOXOPS_EMAIL_REPLY_TO` presentes, sin imprimir valores. `NEXT_PUBLIC_SITE_URL` y `NEXT_PUBLIC_SUPABASE_URL` apuntan a entorno local y el remitente clasifica como `resend.dev`.
- [x] No hay variables de proceso ni `.env.local` con `SUPABASE_ACCESS_TOKEN`, project ref, DB URL real, credenciales E2E/admin/owner/coach/manager, email controlado ni `SUPABASE_SERVICE_ROLE_KEY`.
- [x] `npx supabase projects list --output json` no tiene acceso a proyectos desde este entorno; no se puede verificar Supabase Auth real, Site URL, Redirect URLs, password policy ni Custom SMTP.
- [x] Resend API autentica con la key local sin imprimir valores; la cuenta consultada devuelve 0 dominios visibles y 0 dominios verificados. El remitente local queda en `resend.dev` y no coincide con dominio verificado.
- [x] No se ejecuta invitacion real, aceptacion en `/invite/accept` ni reset hacia `/reset-password` porque faltan acceso Supabase real/staging, remitente Resend permitido, email interno controlado y credenciales E2E/admin/owner.
- [x] No se activa job real de `purge_expired_operational_audit_events(1000)` porque falta acceso DB/scheduler real u operador DB. La activacion sigue limitada a `supabase/snippets/activate-operational-audit-purge-job.sql` o job equivalente fuera de UI/Server Action.
- [x] `npm run typecheck` pasa.
- [x] `npm run lint` pasa.
- [x] `npm run build` pasa.
- [x] `E2E_BASE_URL=http://127.0.0.1:3003 npm run test:smoke` falla inicialmente por `ECONNREFUSED` al no haber servidor local levantado; se arranca `npm run dev -- --hostname 127.0.0.1 --port 3003`, se repite y pasa con 23 passed y 9 skipped por falta de credenciales E2E autenticadas. El servidor temporal se detiene al final.
- [x] `npx supabase db lint --local` pasa sin errores de schema.
- [x] `npx supabase migration list --local` muestra 00001-00024 aplicadas localmente.
- [x] `supabase/snippets/operational-audit-rls-verification.sql` pasa con rollback.

Resultado S.7: documentacion consolidada, verificacion local verde y bloqueos operativos reales restantes. Piloto STL no desbloqueado.

Minimo necesario para desbloquear el piloto STL:

- Acceso administrativo al proyecto Supabase real/staging: project ref + `SUPABASE_ACCESS_TOKEN` o acceso equivalente al dashboard para revisar Auth Site URL, Redirect URLs, politica de password y Custom SMTP.
- Acceso DB/scheduler real u operador DB para ejecutar `supabase/snippets/activate-operational-audit-purge-job.sql` o job equivalente, registrar primer resultado y alerta de fallo.
- Remitente Resend verificado o confirmacion explicita de prueba limitada con `onboarding@resend.dev` y destinatario permitido.
- Email interno controlado y credenciales E2E/admin/owner fuera del repo para crear invitacion, aceptar en `/invite/accept`, validar `organization_memberships` + `person_profiles` + `coach_profiles` + `team_invitations` y probar reset hacia `/reset-password`.

### Fase A - Cierre MVP 1 Real Con Datos Validados Y Deuda Pequena

Objetivo: cerrar la base operativa ya construida contra datos reales, sin abrir modulos nuevos.

Estado 2026-05-07: Fase A queda cerrada para QA interno, sin considerarla validacion oficial ni produccion. La semana L-V se carga con `supabase/snippets/stl-test-week-2026-05-04.sql`; la muestra representativa de coaches/defaults/vacantes se carga con `supabase/snippets/stl-internal-assignment-sample-2026-05-04.sql`; smoke E2E local admin/coach pasa contra el tenant STL y cubre "Mi horario". No abrir Fase B dentro de esta tarea; la validacion oficial STL queda como paso de producto antes de seed/produccion.

Alcance:

- validar semana real por centro, coach, tipo, bloque, asignacion y estado;
- validar plantillas, excepciones, duplicados y cola de cobertura;
- ajustar documentacion y deuda pequena de UX/copy si bloquea uso diario.

No incluye:

- roles avanzados, documentos, fichaje, RRHH, cambios, ausencias o branding real.

Dependencias:

- semana real del primer tenant;
- credenciales o flujo E2E para admin y coach;
- decision sobre fixture privado, anonimizado o seed local del piloto.

Criterio de salida:

- [x] Una semana real se puede cargar, revisar y corregir con la UI actual.
- [x] Dashboard y `/app/coverage` muestran riesgos utiles con datos reales.
- [x] `/app/coaches` permite vincular una ficha operativa pendiente (`person_profiles` + `coach_profiles`) con una cuenta Auth existente por `user_id`, creando o actualizando la membership del tenant sin inventar cuentas.
- [x] Plantillas funcionan con coaches por defecto y huecos vacantes en fixture interno; validacion oficial real pendiente.
- [x] Deuda tactil movil priorizada o descartada explicitamente.
- [x] `rg -n "STL" src` sigue sin referencias hardcodeadas.
- [x] `docs/tenants/stl/README.md` queda actualizado solo con datos validados.

Nota 2026-05-06: huecos vacantes reales quedan validados con la semana local; coaches por defecto reales siguen pendientes porque no se han recibido asignaciones por bloque.

Nota 2026-05-07: se implementa un flujo generico y minimo en `/app/coaches` para vincular fichas operativas pendientes con cuentas Auth reales existentes mediante `user_id`. No se implementa invitacion por email ni creacion de usuarios Auth en este corte: Supabase Auth Admin/invite requeriria service role o configuracion server-side no presente en la app actual.

Nota QA 2026-05-07: se carga una muestra representativa editable con 20 coaches por defecto/asignaciones, 145 vacantes y 1 insuficiencia. Ya no incluye conflicto deliberado: los solapes imposibles de coach se cubren con guardrail Postgres y smoke dedicado. Esto desbloquea Fase A para pruebas internas y smoke; no sustituye la validacion oficial de STL.

Nota UX 2026-05-06: la edicion de plantillas grandes queda priorizada dentro de Fase A con vista global Semana/Agenda. Semana agrupa bloques por dia para reducir scroll, sin cabecera duplicada en escritorio y con un unico dia visible en movil; Agenda conserva la lista vertical existente. Abrir un bloque para editar usa estado cliente; escritorio usa panel lateral y movil expande el formulario bajo la tarjeta seleccionada.

Nota UX 2026-05-11: se corrige regresion en `/app/schedule` Semana y `/app/coverage`: abrir/cerrar detalles de bloques operativos ya no debe usar navegacion App Router por `Link` a `?block_id=...`, porque reejecuta la pagina server y destruye contexto/scroll. El panel conserva URL compartible con History API nativa y estado cliente; el smoke `operational-detail-panels` cubre ausencia de request RSC al abrir.

Nota UX 2026-05-11: se refuerza la correccion anterior. Los triggers principales de Horario y Cobertura pasan a botones cliente de estado de ruta, sin fallback de anchor navegable. Ademas `next.config.ts` permite `127.0.0.1` como `allowedDevOrigins`: al probar la app en `127.0.0.1:3003`, Next bloqueaba recursos/HMR de dev frente al host `localhost`, no hidrataba componentes cliente y cualquier anchor residual terminaba en navegacion completa. Tras reiniciar dev server, abrir/cerrar panel conserva `scrollY` y no emite RSC.

Nota UX 2026-05-11: se corrige regresion en `/app/templates`: los botones de editar bloques de plantilla vuelven a abrir el editor sin navegacion App Router. `edit_block_id` se conserva como URL compartible, pero abrir/cerrar usa `RouteStateLink` + History API para mantener scroll/contexto y evitar recarga perceptible.

Nota disponibilidad 2026-05-11: se anade `supabase/migrations/00011_schedule_assignment_overlap_guard.sql` para bloquear en Postgres que un mismo coach quede `assigned` en bloques activos solapados dentro del mismo tenant y dia. `/app/schedule` y `/app/coverage` filtran coaches no disponibles en el panel de detalle como ayuda UX, pero la garantia final es transaccional en DB; las server actions traducen el error a `coach-unavailable`.

Nota UI 2026-05-11: se ajustan formularios densos de accesos/fichas/plantillas para evitar selects y campos colapsados en movil: los campos con UUIDs o nombres largos pasan a ancho completo donde procede, los pares compactos como rol/estado se mantienen juntos cuando caben, y los controles reservan espacio para flecha + texto con truncado legible.

Nota analytics 2026-05-11: se anade `/app/stats` como panel secundario para `owner`, `admin` y `manager`, enlazado desde `/app/more`. Calcula solo estadisticas fiables desde `schedule_blocks`, `schedule_block_assignments`, `coach_profiles`, centros y tipos: carga por coach, horas, clases, distribucion por tipo/dia/centro y avisos de cobertura. Vacaciones, ausencias y saldos quedan pendientes hasta abrir el modulo de ausencias en Fase I; no se deducen desde horarios planificados ni se mezclan con retencion de plantillas.

### Fase B - Configuracion De Tenant, Branding Y Roles Avanzados

Objetivo: abrir configuracion real de organizacion y evolucionar permisos sin romper `admin`/`coach`.

Estado 2026-05-12: B.1 queda completada como configuracion generica minima de tenant. B.2 queda implementada como evolucion compatible de roles: `owner`/`admin` para configuracion global y accesos, `manager` para operativa MVP 1 tenant-wide, `coach` en lectura/uso operativo. B.3 abre invitaciones por email desde Equipo con `team_invitations`, envio por Resend y aceptacion por token/sesion, sin `service_role` en `src` ni UUIDs en el flujo normal. Ajuste 2026-05-11: la UI conserva IDs internos en ingles, pero muestra Propietario, Administrador, Responsable y Entrenador; no muestra "Admin compatible" ni "Manager operativo". No cierra logo real, billing ni modulos RRHH/documentos.

Alcance:

- logo del box;
- colores corporativos;
- colores por centro;
- configuracion visual controlada;
- mantener identidad BoxOps con marca ligera del cliente;
- usar `organizations.theme_config jsonb` como primera opcion si sigue encajando;
- validar contraste y fallbacks;
- separar permisos de configuracion global y gestion diaria.

No incluye:

- permitir sobrescritura de estados criticos (`uncovered`, `conflict`, `error`, foco);
- billing completo;
- documentos/RRHH/fichaje;
- temas libres o rebranding total de BoxOps.

Dependencias:

- migracion `00003_organization_theme_config.sql` para `organizations.theme_config`;
- modelo de logo/asset privado o referencia interna pendiente;
- matriz de roles avanzada;
- tests con tenant sin tema, tenant con tema valido y tenant con valores invalidos.

Criterio de salida:

- [x] Configuracion real aparece en `/app/more` o ruta equivalente de configuracion.
- [x] Un rol alto (`owner` o `superadmin`) controla configuracion global, branding y billing futuro.
- [x] Un rol operativo (`manager` o `admin`) gestiona horario/equipo sin controlar todo el tenant.
- [x] `coach` mantiene uso operativo y funciones personales.
- [x] Todos los usuarios, incluidos admins, tienen "Mi cuenta"/funciones personales.
- [x] Los colores configurables no rompen contraste ni estados criticos.
- [x] Se documenta compatibilidad/migracion desde `admin` y `coach` actuales.

Decision recomendada:

- [x] Mantener `admin` actual como rol compatible y evolucionar hacia `owner` + `manager/admin` + `coach`.
- [x] Preferir `organizations.theme_config` al inicio; migrar a tabla dedicada solo si hay permisos, borradores, versionado o auditoria granular de tema.

#### B.1 - Configuracion generica minima de tenant

Estado: completada el 2026-05-07 para desarrollo y QA interno.

- [x] Crear migracion para `organizations.theme_config jsonb not null default '{}'`.
- [x] Crear `/app/settings` como superficie generica accesible desde `/app/more`.
- [x] Permitir a `admin` editar `organizations.name` y `theme_config.accentColor`.
- [x] Mantener `coach` en modo lectura y bloquear mutaciones en Server Actions.
- [x] Resolver y aplicar tema por organizacion activa, con fallback si no hay tenant o el color es invalido.
- [x] Aplicar solo tokens de acento/primary; no tematizar `uncovered`, `conflict`, `error`, `destructive` ni foco.
- [x] Documentar que logo real queda pendiente hasta definir asset/Storage privado y permisos.

Fuera de B.1: roles avanzados, billing, documentos, firmas, fichaje, geolocalizacion, cambios, ausencias, RRHH y subida real de logo.

#### B.2 - Roles avanzados compatibles minimos

Estado: completada el 2026-05-07 para desarrollo y QA interno.

- [x] Añadir helpers reutilizables de permisos de app en `src/lib/auth/permissions.ts`.
- [x] Resolver memberships activas con todos los roles del schema, no solo `admin`/`coach`.
- [x] Mantener `admin` como rol compatible con todos los permisos MVP 1.
- [x] Permitir a `owner` editar configuracion global del tenant y gestionar accesos.
- [x] Permitir a `manager` gestionar operativa tenant-wide de MVP 1: centros, tipos, horario, cobertura, plantillas y fichas operativas de coach.
- [x] Mantener altas, roles y vinculacion de cuentas en `/app/coaches` solo para `owner`/`admin`.
- [x] Mantener `coach` sin permisos de mutacion.
- [x] Alinear RLS con B.2 en `supabase/migrations/00004_app_role_permission_alignment.sql`: `center_manager` queda reconocido pero sin escritura global hasta tener schema por centro.
- [x] Mostrar etiquetas claras de rol en superficies protegidas y conservar roles futuros sin convertirlos en controles grandes.
- [x] Ajustar nomenclatura visible de roles a espanol: Propietario, Administrador, Responsable y Entrenador, sin cambiar identificadores internos.
- [x] Añadir smoke opcional para `E2E_OWNER_*` y `E2E_MANAGER_*`.
- [x] Documentar compatibilidad/migracion desde `admin` y `coach`.

Fuera de B.2: permisos por centro, billing, documentos, RRHH, payroll, fichaje, geolocalizacion, cambios, ausencias, invitaciones y auth polish.

#### B.3 - Invitaciones de equipo por email

Estado: completada el 2026-05-12 como primer flujo usable para QA/STL, pendiente de configurar proveedor real de email en entorno.

Decision: el flujo normal de `/app/coaches` deja de pedir UUIDs. `owner`/`admin` invitan por email, seleccionan o crean una ficha operativa, asignan rol/estado inicial y BoxOps envia un enlace de aceptacion. La aceptacion usa una invitacion tenant-scoped con token aleatorio hasheado en DB; cuando la persona entra o crea cuenta con el mismo email, una RPC `SECURITY DEFINER` valida token/email/sesion y vincula `organization_memberships`, `person_profiles.user_id` y `coach_profiles.user_id`. Las herramientas por UUID se conservan solo como avanzado/debug.

- [x] Crear migracion `supabase/migrations/00019_team_email_invitations.sql`.
- [x] Crear `team_invitations` con `organization_id`, email normalizado, `token_hash`, persona/ficha, rol, estado inicial, estado de invitacion, actor, expiracion y metadata minima de envio.
- [x] Crear RPC publica segura `get_team_invitation_public(...)` que solo revela datos minimos si el token coincide.
- [x] Crear RPC autenticada `accept_team_invitation(...)` que valida `auth.uid()`, email Auth, token, tenant y conflictos antes de vincular.
- [x] No guardar tokens en claro ni API keys en repo.
- [x] Enviar emails transaccionales con Resend desde servidor mediante `RESEND_API_KEY` y `BOXOPS_EMAIL_FROM`.
- [x] Crear `/invite/accept` para aceptar con sesion existente o crear cuenta con contrasena.
- [x] Reorganizar Equipo: `Invitar usuario` como accion principal, invitaciones pendientes, usuarios activos y herramientas UUID en avanzado.
- [x] Regenerar tipos Supabase.
- [x] Verificar `npm run typecheck` y `npm run lint`.

Pendiente antes de QA STL:

- [ ] Revocar la API key de Resend que haya quedado expuesta fuera del entorno y crear una nueva.
- [ ] Configurar `RESEND_API_KEY`, `BOXOPS_EMAIL_FROM`, `NEXT_PUBLIC_SITE_URL` y, si procede, `BOXOPS_EMAIL_REPLY_TO`.
- [ ] Verificar dominio/remitente en Resend antes de invitar a correos externos reales. Mientras no haya dominio comprado/verificado, usar `onboarding@resend.dev` solo para pruebas con emails permitidos por Resend.
- [ ] Configurar SMTP custom de Supabase Auth con Resend para confirmaciones/reset si el entorno las usa.
- [ ] Probar invitacion real de punta a punta con un email controlado.

Fuera de B.3: permisos por centro, invitaciones masivas, SSO/MFA, dominios de email por tenant, alta de alumnos, HR sensible y auditoria operativa completa S.1.

### Fase C - Auth/Security Polish

Objetivo: completar flujos basicos de seguridad de cuenta sin filtrar existencia de emails.

Estado 2026-05-07: implementada como corte minimo. `/login` enlaza a `/forgot-password`; la solicitud usa Supabase Auth `resetPasswordForEmail` con callback SSR hacia `/reset-password`; la respuesta visible es siempre generica; `/reset-password` valida la regla minima antes de enviar y repite la validacion en Server Action antes de `updateUser`.

Alcance:

- "He olvidado mi contrasena" en login;
- reset con Supabase Auth;
- pagina para nueva contrasena;
- contrasena minimo 8 caracteres, al menos una letra y un numero;
- regla configurada en Supabase Auth y repetida en app para feedback visual;
- estudio de bloqueo por intentos fallidos.

No incluye:

- SSO, MFA obligatorio o consola avanzada de seguridad.

Dependencias:

- configuracion Supabase Auth;
- decision sobre rate limits, Password Verification Hook y tabla propia;
- copy anti-enumeracion.

Criterio de salida:

- [x] Reset de contrasena funciona de extremo a extremo con Supabase Auth SSR, pendiente de configurar redirect URL y politica de password en el proyecto Supabase real.
- [x] La UI siempre responde de forma generica ante emails no existentes.
- [x] La regla de contrasena vive en Supabase Auth y en validacion visual/server de app.
- [x] Queda decidido si hay 3 intentos con avisos restantes y cooldown, y con que mecanismo.
- [x] No se expone si un email existe por login, reset o bloqueo.

Decision tecnica:

- [x] Para Fase C bastan los rate limits nativos de Supabase Auth y copy generico anti-enumeracion. No se crea tabla propia de intentos.
- [x] Avisos de intentos restantes, bloqueo exacto de 3 intentos o cooldown por usuario/email quedan pendientes para una fase posterior con Password Verification Hook + tabla propia, cuidando no confirmar si un email existe.

### Fase D - Area Personal Y Modelo RRHH

Objetivo: crear "Mi perfil"/"Mi cuenta" como base personal y RRHH con permisos por campo.

Estado 2026-05-08: D.1 queda implementado como corte minimo seguro. Existe `/app/account`, accesible para usuarios con membership activa en roles reconocidos (`owner`, `admin`, `manager`, `coach` y roles futuros reconocidos). La ruta separa cuenta Auth, perfil visible operativo y ficha de coach propia, permite editar solo el `person_profiles` vinculado al usuario autenticado y no abre datos RRHH sensibles ni documentos. D.2 queda cerrado como corte documental de matriz de permisos por campo en `docs/architecture/personal-data-permissions.md`. D.3 queda cerrado como modelado documental de avatar privado tenant-scoped. D.4 implementa el primer avatar privado propio: `profile_assets`, bucket privado `profile-assets`, RLS/RPC estrictas y subida/reemplazo desde `/app/account` solo para la persona propia. D.5 implementa "Mi firma" propia reutilizable como asset privado tenant-scoped separado: `profile_signatures`, bucket privado `profile-signatures`, RLS/RPC estrictas y canvas minimo en `/app/account`, sin documentos firmables ni boton "Firmar".

Alcance:

- datos personales visibles/editables segun permisos;
- primer corte D.1: nombre visible, alias y email publico opcional dentro de `person_profiles`;
- cuenta/Auth en lectura: email de acceso, usuario, rol y organizacion activa;
- perfil de coach propio en lectura como capacidad operativa, sin editar fichas ajenas;
- D.3: avatar privado modelado como asset tenant-scoped candidato, sin subida real ni URL publica libre;
- D.4: avatar privado propio con metadata tenant-scoped, Storage privado, signed URL corta y fallback visual;
- D.5: "Mi firma" propia dibujada en canvas/touch area dentro de `/app/account`;
- borrar y volver a dibujar antes de guardar;
- guardar y actualizar firma reutilizable propia en Storage privado separado;
- advertir que actualizar la firma no modifica documentos ya firmados;
- puesto, antiguedad, datos laborales, contrato/jornada cuando proceda;
- salario, dinero o retribucion solo para personal autorizado;
- separacion entre datos editables por usuario y datos editables por roles autorizados.

No incluye:

- nominas generadas, documentos completos, fichaje o payroll.

Dependencias:

- matriz de permisos por campo documentada en D.2 antes de cualquier implementacion sensible;
- revision privacidad para salario/retribucion;
- decision entre ampliar `person_profiles` o crear tablas RRHH separadas.
- Supabase Storage privado o mecanismo equivalente para la firma dibujada.
- decision tenant-scoped vs global: recomendado primer corte tenant-scoped con `organization_id` + `person_profile_id`.

Criterio de salida:

- [x] Cada usuario tiene area personal accesible en `/app/account`.
- [x] Admins que tambien son coaches pueden usar funciones personales.
- [x] La UI minima solo permite editar el perfil visible propio vinculado por `organization_id` + `user_id`.
- [x] El corte separa cuenta/Auth, perfil visible operativo, perfil de coach y datos RRHH sensibles futuros.
- [x] "Mi firma" quedo documentada como futura en D.1-D.4, sin firma documental.
- [x] Todos los roles reconocidos con membership activa pueden crear y actualizar su propia firma si tienen `person_profiles` vinculado.
- [x] La firma guardada nunca se sirve como asset publico.
- [x] Solo el usuario propietario puede ver metadata o preview de su firma en D.5; roles autorizados ajenos quedan para una fase futura explicita.
- [x] Un admin no puede crear, actualizar ni usar la firma de otra persona para firmar en su nombre.
- [x] D.1 no anade datos laborales sensibles a pantallas generales de equipo.
- [x] Salario/retribucion queda fuera de D.1 y requerira permiso explicito futuro.
- [x] Queda documentado que datos edita el usuario y que datos edita personal autorizado para D.1.
- [x] D.2 documenta matriz por campo, capacidades candidatas y frontera de avatar/firma/RRHH sensible sin implementar Storage ni UI nueva.
- [x] D.3 documenta avatar como asset privado tenant-scoped, sin Storage real, sin UI nueva y sin aceptar edicion de otra persona desde Mi cuenta.
- [x] D.4 implementa avatar propio privado, tenant-scoped y sin URL publica libre persistente.
- [x] D.4 mantiene `/app/account` accesible para todos los roles reconocidos y no permite editar avatar ajeno.

Decision recomendada:

- [x] No meter salario/contrato/documentos dentro de `person_profiles`; separar datos operativos de datos RRHH.
- [x] Priorizar matriz de permisos por campo antes de avatar privado, "Mi firma" real o RRHH sensible.
- [x] Priorizar avatar privado como siguiente modelo seguro antes de firma/documentos, pero no implementarlo hasta tener migracion, bucket privado, RLS y ruta controlada.
- [x] Implementar avatar solo como asset privado propio; `person_profiles.avatar_url` no se usa como URL publica ni se actualiza desde D.4.
- [x] Crear "Mi firma" antes de cualquier boton "Firmar" en documentos, nominas, politicas internas u otras secciones.
- [x] Guardar metadata tenant-scoped de la firma en Postgres y el artefacto en Storage privado.

#### D.1 - Mi cuenta minima y frontera RRHH

Estado: implementada el 2026-05-07 para desarrollo y QA interno.

- [x] Crear `/app/account` como ruta protegida personal accesible desde `/app/more` y sidebar desktop.
- [x] Reutilizar `canUsePersonalFeatures` para todos los roles reconocidos con membership activa.
- [x] Resolver organizacion activa igual que el resto de superficies protegidas.
- [x] Mostrar cuenta/Auth como lectura; no permitir cambiar email Auth desde la app.
- [x] Permitir editar solo `person_profiles.display_name`, `preferred_alias` y `public_email` del usuario autenticado en la organizacion activa.
- [x] No aceptar `person_profile_id` desde el formulario; la Server Action localiza el perfil por `organization_id` + `user.id`.
- [x] Mostrar ficha de coach propia en lectura sin editar perfiles ajenos ni notas internas.
- [x] Mantener `coach_profiles.weekly_contracted_hours` como capacidad operativa MVP 1 existente, no como salario/nomina/contrato.
- [x] Dejar avatar como pendiente hasta definir asset privado/Storage/permisos.
- [x] Dejar "Mi firma" como futura: tenant-scoped recomendado, privada, versionada y sin efecto sobre documentos ya firmados.
- [x] Actualizar smoke de rutas protegidas para incluir `/app/account`.

Fuera de D.1: firma dibujada real, Storage, documentos, nominas, contratos, salario, puesto laboral, datos bancarios, fichaje, geolocalizacion, cambios, ausencias, invitaciones y creacion de usuarios.

#### D.2 - Matriz documental de permisos personales/RRHH

Estado: completada el 2026-05-07 como documentacion/modelado. No toca `src`, migraciones, Storage ni UI visible.

Decision: el siguiente corte seguro no es avatar ni firma real. Primero se cierra la matriz de permisos por campo para evitar que `admin`/`manager` hereden acceso sensible por accidente.

- [x] Revisar D.1 y confirmar que `/app/account` resuelve edicion propia por `organization_id` + `auth.uid()` sin aceptar `person_profile_id` desde el formulario.
- [x] Documentar que `person_profiles` sigue limitado a identidad visible operativa y no guardara salario, contrato, nominas, datos bancarios, fichaje, geolocalizacion ni documentos privados.
- [x] Definir capacidades candidatas para lectura/escritura personal, gestion operativa, assets personales, RRHH sensible, payroll, documentos privados, evidencias de firma y auditoria.
- [x] Documentar matriz por campo en `docs/architecture/personal-data-permissions.md`.
- [x] Mantener avatar como futuro asset privado tenant-scoped, sin URL publica libre ni Storage en D.2.
- [x] Mantener "Mi firma" como futura capacidad personal tenant-scoped, privada y versionada, sin canvas, bucket ni snapshot documental en D.2.
- [x] Dejar claro que `owner`/`admin`/`manager` no implican por si solos acceso a salario, nominas, contrato, datos bancarios, documentos privados, fichaje, geolocalizacion ni evidencias de firma.
- [x] Actualizar brief, roadmap, domain model, open questions y guias de usuario para reflejar que D.2 es documentacion y no cambia MVP 1.

Fuera de D.2: avatar real, firma dibujada real, Storage, documentos, nominas, contratos, salario, puesto laboral real, datos bancarios, fichaje, geolocalizacion, cambios, ausencias, consola RRHH, permisos nuevos en app e invitaciones por email.

#### D.3 - Modelo de avatar privado tenant-scoped

Estado: completada el 2026-05-08 como documentacion/modelado. No toca `src`, migraciones, Storage, buckets ni UI visible.

Decision: el siguiente corte seguro es la opcion A: modelar avatar privado como asset tenant-scoped, sin subida real todavia. Avatar es menos delicado que firma/documentos, pero no debe convertirse en una URL publica libre ni en una puerta lateral a datos de otra persona.

- [x] Confirmar que D.3 parte de la matriz D.2 y no abre documentos, firma, payroll ni RRHH sensible.
- [x] Documentar `profile_assets` como tabla candidata futura para avatar y otros assets personales seguros.
- [x] Decidir que `person_profiles.avatar_url` no debe usarse como URL publica libre; queda como legacy/display cache o se sustituira por `avatar_asset_id` en una migracion futura.
- [x] Definir metadata minima futura: `organization_id`, `person_profile_id`, `asset_type`, `uploaded_by_user_id`, `storage_path`, `mime_type`, `size_bytes`, `asset_hash`, dimensiones, `status` y timestamps.
- [x] Exigir bucket privado o mecanismo equivalente desde el primer corte tecnico.
- [x] Exigir lectura mediante ruta controlada o signed URL corta, nunca enlace publico persistente.
- [x] Exigir que Mi cuenta derive la persona propia desde `auth.uid()` + `organization_id`; no se acepta `person_profile_id` desde formularios personales.
- [x] Documentar que `owner`/`admin`/`manager` pueden ver la representacion controlada de perfiles visibles, pero no reemplazan avatar ajeno por defecto.
- [x] Mantener `/app/account` accesible para todos los roles reconocidos sin cambiar permisos actuales.

Fuera de D.3: subida de avatar, cropper, transformaciones de imagen, bucket real, policies RLS reales, signed route real, migracion `profile_assets`, cambios en `person_profiles`, firma dibujada, documentos, nominas, contratos, salario, fichaje, geolocalizacion, cambios, ausencias, invitaciones y creacion de usuarios.

#### D.4 - Primer avatar privado minimo propio

Estado: implementada el 2026-05-08 como corte tecnico acotado para desarrollo y QA interno.

Decision: abrir solo avatar propio porque el modelo Storage/RLS/permisos queda claro. No se amplia el avatar al equipo, no se permite reemplazo ajeno y no se toca firma, documentos ni RRHH sensible.

- [x] Crear migracion `supabase/migrations/00005_profile_assets_private_avatar.sql`.
- [x] Crear tabla `profile_assets` con `organization_id`, `person_profile_id`, `asset_type = 'avatar'`, `uploaded_by_user_id`, `storage_bucket`, `storage_path`, `mime_type`, `size_bytes`, `asset_hash`, dimensiones opcionales, `status` y timestamps.
- [x] Crear bucket privado `profile-assets` con `public = false`, limite 2 MB y MIME permitidos `image/jpeg`, `image/png` y `image/webp`.
- [x] Mantener `person_profiles.avatar_url` como legacy/no usado: D.4 no escribe una URL publica ni persistente.
- [x] Añadir RLS de metadata para lectura propia y bloquear escrituras directas de tabla desde cliente.
- [x] Añadir RPCs `begin_own_profile_avatar_upload`, `activate_own_profile_avatar_asset` y `cancel_own_profile_avatar_upload` para que la persona propia se derive en base de datos desde `auth.uid()` + `organization_id`.
- [x] Añadir policies de Storage para subir/leer solo objetos bajo `avatars/{organization_id}/{person_profile_id}/{asset_id}` si esa persona esta vinculada al usuario autenticado.
- [x] Añadir en `/app/account` subida/reemplazo minimo de avatar propio sin aceptar `person_profile_id`.
- [x] Validar tipo real por firma de archivo, MIME permitido y tamano maximo antes de subir.
- [x] Leer el avatar propio con signed URL corta y fallback visual si no hay avatar o preview disponible.
- [x] Mantener `/app/account` accesible para todos los roles reconocidos.

Fuera de D.4: cropper, transformaciones, borrado visible, moderacion, avatar de otras personas en Equipo/Horario, reemplazo ajeno por roles altos, firma dibujada, documentos, nominas, contratos, salario, fichaje, geolocalizacion, cambios, ausencias, invitaciones y creacion de usuarios.

#### D.5 - Mi firma reutilizable privada propia

Estado: implementada el 2026-05-08 como primer corte seguro para desarrollo y QA interno.

Decision: abrir solo "Mi firma" propia porque D.4 ya dejo validado el patron de Storage privado, metadata tenant-scoped y acciones propias. La firma se separa de avatar en `profile_signatures` y `profile-signatures`, no firma ningun documento por si sola y no introduce boton "Firmar".

- [x] Crear migracion `supabase/migrations/00006_profile_signatures_private_own.sql`.
- [x] Crear tabla `profile_signatures` con `organization_id`, `person_profile_id`, `uploaded_by_user_id`, `storage_bucket`, `storage_path`, `mime_type = 'image/png'`, `size_bytes`, `width`, `height`, `signature_hash`, `signature_version`, `status`, `activated_at` y timestamps.
- [x] Crear bucket privado `profile-signatures` con `public = false`, limite 512 KB y MIME permitido `image/png`.
- [x] Mantener la firma separada de avatar y de `person_profiles`; no se guarda URL publica libre.
- [x] Añadir RLS de metadata para lectura propia y bloquear escrituras directas de tabla desde cliente.
- [x] Añadir RPCs `begin_own_profile_signature_upload`, `activate_own_profile_signature` y `cancel_own_profile_signature_upload` para derivar la persona propia desde `auth.uid()` + `organization_id`.
- [x] Añadir policies de Storage para subir/leer solo objetos bajo `signatures/{organization_id}/{person_profile_id}/{signature_id}.png` si esa persona esta vinculada al usuario autenticado.
- [x] Añadir en `/app/account` canvas/touch area para dibujar, limpiar y guardar/reemplazar solo la firma propia sin aceptar `person_profile_id`.
- [x] Validar PNG real, tamano maximo, hash y dimensiones antes de subir.
- [x] Leer la firma propia con signed URL corta y fallback visual si no hay firma o preview disponible.
- [x] Dejar claro en UI y docs que es una firma/confirmacion interna reutilizable, no firma electronica avanzada/cualificada.
- [x] Documentar que actualizar "Mi firma" no modifica documentos ya firmados cuando existan snapshots.

Fuera de D.5: documentos firmables, boton "Firmar", snapshots documentales reales, evidencias/auditoria de firma aplicada, firma de otra persona, borrado visible, moderacion, nominas, contratos, salario, fichaje, geolocalizacion, cambios, ausencias, invitaciones y creacion de usuarios.

### Fase E - Documentos, Permisos, Nominas, Firmas Y Certificaciones

Estado 2026-05-10: E.1 queda documentada como modelado seguro de documentos privados/empresa/persona, permisos, Storage privado candidato y firma documental futura. E.2 implementa el primer schema minimo de metadata documental privada tenant-scoped (`documents`, `document_versions`, `document_subjects`, `document_access_grants`) con RLS estricta. E.3 implementa Storage documental privado minimo con bucket `document-files`, RPCs de subida/activacion/cancelacion y policies de `storage.objects`. E.4 implementa auditoria documental minima segura con `document_access_events`, RLS estricta y RPCs de registro/consulta. E.5 abre solo rutas backend controladas para preview/descarga de `document_versions` privadas con signed URLs cortas y auditoria; sigue sin UI, pagina documental, subida desde app, boton "Firmar", documentos firmables ni snapshots reales.

Objetivo: centralizar documentos con permisos estrictos y trazabilidad.

Alcance:

- documentos de empresa;
- "Mis documentos";
- permisos por rol;
- permisos por persona concreta, estilo compartir en Drive;
- empleados suben titulaciones/certificaciones;
- admins/gestores autorizados suben nominas u otros documentos privados al espacio del empleado;
- documentos, nominas, politicas internas u otras entidades pueden pedir firma en fases futuras;
- boton "Firmar" reutiliza la firma guardada del usuario autenticado;
- si el usuario no tiene firma guardada, el flujo debe pedir crearla antes de continuar o permitir crearla inline segun decision de UX;
- separar claramente "crear/actualizar mi firma" de "firmar un documento";
- al firmar se guarda snapshot/version de la firma usada, no solo referencia a la firma actual del perfil;
- buckets privados, RLS, URLs firmadas y auditoria de acceso si procede.

No incluye:

- gestor documental pesado;
- generacion de nominas;
- firma electronica avanzada/cualificada sin validacion legal;
- integracion Drive API salvo decision posterior.

Dependencias:

- Fase D: "Mi firma" creada en perfil/cuenta.
- Supabase Storage privado;
- modelo de documentos, versiones, grants y auditoria;
- politica de retencion/borrado;
- revision legal de documentos sensibles, nominas y firmas.

Criterio de salida:

- [ ] Un empleado ve sus documentos propios.
- [ ] Un rol autorizado sube documentos privados a una persona concreta.
- [ ] Documentos de empresa respetan visibilidad por rol/persona.
- [ ] Certificaciones tienen archivo, fecha de obtencion/caducidad y estado.
- [ ] Accesos privados usan URL firmada o mecanismo equivalente.
- [ ] Un boton "Firmar" nunca obliga a dibujar de nuevo si existe firma guardada valida.
- [ ] Si no hay firma guardada, el flujo dirige a crearla o abre creacion inline segun decision documentada.
- [ ] Cada firma aplicada registra organizacion, documento/version o entidad firmada, usuario autenticado, persona firmante, fecha/hora, snapshot usado, estado e IP/user agent si se decide.
- [ ] Cambiar "Mi firma" despues de firmar no altera evidencias anteriores.
- [ ] La app no presenta firmas como avanzadas/cualificadas sin validacion legal.

Decision recomendada:

- [ ] Modelar permisos por scope + rol + grants por persona concreta; no asumir que cualquier admin ve todo documento sensible.
- [ ] No permitir que un rol autorizado firme por otra persona usando su firma guardada.

#### E.1 - Modelo documental privado y permisos seguros

Estado: completada el 2026-05-08 como documentacion/modelado. No implementa schema de produccion, Storage, UI ni flujos de firma.

Decision: antes de crear documentos reales, BoxOps define el modelo candidato con `organization_id` obligatorio, artefactos en Storage privado, versiones documentales, grants explicitos por rol/persona y auditoria candidata de accesos sensibles. "Mi firma" sigue siendo un asset privado del perfil; "Firmar documento" sera una accion futura distinta que consume una version concreta de esa firma y genera snapshot/evidencia propia.

- [x] Revisar la matriz D.2/D.5 y las notas legales antes de abrir documentos.
- [x] Proponer entidades candidatas: documentos de empresa, documentos privados de persona, documentos de gestion/admin, certificaciones, solicitudes de firma futuras y evidencias/snapshots futuros.
- [x] Definir que toda entidad documental y toda evidencia futura debe incluir `organization_id`.
- [x] Definir buckets privados candidatos y rutas internas tenant-scoped sin implementarlos.
- [x] Definir capacidades candidatas sin asumir que `owner`, `admin` o `manager` ven todo.
- [x] Separar "Mi firma" (`profile_signatures`) de "Firmar documento" (accion futura sobre documento/version).
- [x] Documentar que firmar debe guardar snapshot/version de firma y evidencia propia, no referencia mutable a la firma actual.
- [x] Identificar campos y acciones que requieren auditoria de acceso.
- [x] Actualizar roadmap, modelo de dominio, matriz de permisos personales y notas legales.

Entidades candidatas E.1:

- `documents`: cabecera logica del documento dentro del tenant.
- `document_versions`: version/archivo concreto, hash, MIME, ruta privada y estado.
- `document_subjects`: personas, centros, bloques o entidades afectadas por el documento.
- `document_access_grants`: permisos explicitos por persona, membership, rol/capacidad o scope.
- `document_access_events`: auditoria candidata de lectura/descarga/cambios sensibles.
- `coach_certifications`: certificaciones con fechas, estado y adjunto documental opcional.
- `document_signature_requests`: solicitudes futuras por documento/version y firmante.
- `document_signature_evidences`: evidencia inmutable futura con snapshot de firma, hash/version y contexto tecnico.

Buckets privados candidatos:

- `document-files`: archivos documentales privados. Ruta candidata: `documents/{organization_id}/{document_id}/versions/{document_version_id}/{asset_id}.{ext}`.
- `document-signature-evidence`: snapshots y artefactos de firma aplicada. Rutas candidatas: `signature-snapshots/{organization_id}/{document_id}/{request_id}/{evidence_id}.png` y `signed-documents/{organization_id}/{document_id}/{document_version_id}/{evidence_id}.pdf`.

Capacidades candidatas:

- `document_company_read`, `document_company_manage`
- `document_personal_self_read`, `document_personal_manage`
- `document_management_read`, `document_management_manage`
- `document_grant_manage`
- `certification_self_submit`, `certification_manage`
- `signature_request_manage`, `document_sign_self`, `signature_evidence_read`
- `document_access_audit_read`

Auditoria candidata:

- lectura, preview y descarga de documentos sensibles;
- creacion, reemplazo, archivado o borrado logico de versiones;
- cambios en grants, sujetos, sensibilidad o visibilidad;
- lectura de nominas, contratos, anexos, justificantes y documentos firmados;
- lectura/descarga de adjuntos de certificacion privados;
- creacion, cancelacion y resolucion de solicitudes de firma;
- creacion y lectura de evidencias/snapshots de firma;
- exportaciones masivas o accesos administrativos sobre documentos de otra persona.

Fuera de E.1: migraciones, policies RLS reales, buckets reales, UI, subida de documentos, boton "Firmar", snapshots documentales reales, auditoria real, nominas, RRHH sensible nuevo, fichaje y geolocalizacion.

#### E.2 - Schema documental minimo privado

Estado: completada el 2026-05-08 como base tecnica minima. Implementa schema/RLS de metadata, no documentos reales ni UI.

Decision: abrir solo cabecera documental, versiones/archivo como metadata, sujetos afectados y grants explicitos. `document-files` queda como nombre/ruta interna candidata en `document_versions.storage_bucket/storage_path`, pero no se crea bucket ni subida real. `requires_signature` existe para preparar el modelo, pero queda bloqueado por CHECK a `false` hasta una fase futura de documentos firmables.

- [x] Crear migracion `supabase/migrations/00007_document_metadata_private_foundation.sql`.
- [x] Crear `documents` con `organization_id`, creador, titulo, tipo, scope, sensibilidad, estado, version actual opcional y `requires_signature = false`.
- [x] Crear `document_versions` con `organization_id`, version, uploader, bucket/ruta interna privada candidata, filename, MIME, tamano, hash y estado.
- [x] Crear `document_subjects` separado de permisos, con persona, centro, coach, bloque o tipo como sujetos tenant-scoped.
- [x] Crear `document_access_grants` con grants por persona, membership, rol o capability y niveles `read_metadata`, `preview`, `download`, `manage`, `manage_grants`.
- [x] Incluir CHECKs de scope, sensibilidad, estados, hash, rutas internas y targets de grant/sujeto.
- [x] Incluir RLS inicial estricta: lectura por sujeto persona propio o grant explicito; gestion por roles documentales/capacidades decididas, sin `manager` ni lectura global de sensibles.
- [x] Mantener `owner`/`admin` solo para gestion de documentos no sensibles de empresa/programacion/certificacion; `document_admin` para documentos privados/gestion/sensitive HR no payroll; `payroll_manager` para `payroll`.
- [x] No crear bucket `document-files` todavia.
- [x] No crear UI, subida real, boton "Firmar", `document_signature_requests`, `document_signature_evidences`, snapshots ni auditoria real.
- [x] Actualizar tipos Supabase y documentacion.

Fuera de E.2: buckets de Storage, policies de `storage.objects`, subida/preview/descarga real, documentos firmables, solicitudes/evidencias de firma, `document_access_events`, certificaciones reales, nominas, RRHH sensible nuevo, fichaje y geolocalizacion.

#### E.3 - Storage documental privado minimo

Estado: completada el 2026-05-10 como base tecnica de Storage privado, sin modulo visible de documentos.

Decision: crear solo la capa segura de archivo para `document_versions`. El bucket `document-files` es privado, las rutas siguen `documents/{organization_id}/{document_id}/versions/{document_version_id}/{asset_id}.{ext}`, la subida exige una version `pending` por path exacto y la lectura exige version `active`/`archived`, documento publicable y acceso por sujeto, grant o capacidad documental explicita.

- [x] Crear migracion `supabase/migrations/00008_document_files_private_storage.sql`.
- [x] Crear bucket privado `document-files` con `public = false`, limite 10 MB y MIME permitidos para PDF, imagenes, texto/CSV y Office moderno sin macros.
- [x] Endurecer `document_versions` con MIME/extension/tamano compatibles con Storage documental MVP.
- [x] Crear RPC `begin_document_version_upload` para generar metadata `pending` y path interno validado.
- [x] Crear RPC `activate_document_version_upload` para activar solo si el objeto existe en Storage y coincide con MIME/tamano declarados.
- [x] Crear RPC `cancel_document_version_upload` para cancelar metadata `pending`.
- [x] Revocar escritura directa autenticada en `document_versions`; las versiones nuevas pasan por RPCs.
- [x] Crear policy de upload en `storage.objects` solo para `document_versions.pending` del uploader y path exacto.
- [x] Crear policy de lectura en `storage.objects` solo para `document_versions.active/archived` accesibles por RLS/grant/sujeto propio.
- [x] Mantener `requires_signature = false` y no crear `document_signature_requests`, `document_signature_evidences`, snapshots ni auditoria real.

Fuera de E.3: UI documental, pagina de documentos, preview/descarga desde la app, signed URL en app, boton "Firmar", documentos firmables, auditoria `document_access_events`, certificaciones reales, nominas, RRHH sensible nuevo, fichaje y geolocalizacion.

#### E.4 - Auditoria documental minima segura

Estado: completada el 2026-05-10 como base tecnica de auditoria documental, sin modulo visible de documentos.

Decision: crear solo la capa de eventos de auditoria para accesos y cambios documentales sensibles. `document_access_events` queda tenant-scoped, con actor autenticado, membership, persona resuelta si existe, evento cerrado, resultado, access level cuando aplica y metadata minimizada. La lectura de auditoria queda separada del acceso operativo: `document_admin` puede leer auditoria no payroll, `payroll_manager` solo payroll, y `owner`/`admin`/`manager` no heredan auditoria de `sensitive_hr` o `payroll`.

- [x] Crear migracion `supabase/migrations/00009_document_access_audit_foundation.sql`.
- [x] Crear `document_access_events` con `organization_id`, `document_id`, `document_version_id` opcional, actor, membership, evento, resultado, access level, metadata y `created_at`.
- [x] Cerrar `event_type` a `metadata_read`, `file_preview`, `file_download`, `version_created`, `version_activated`, `version_archived`, `grant_created`, `grant_revoked`, `subject_added` y `subject_removed`.
- [x] Cerrar `result` a `allowed`/`denied` y `access_level` a los niveles documentales existentes.
- [x] Limitar metadata de auditoria a objeto JSON pequeno y bloquear claves/valores de contenido, URLs, rutas, tokens, storage, firmas o hashes documentales.
- [x] Crear helper `can_read_document_access_events` para lectura de auditoria sin herencia automatica de roles altos.
- [x] Crear RPC `record_document_access_event` para registrar eventos con actor derivado de `auth.uid()` + membership activa.
- [x] Crear RPC `list_document_access_events_for_document` como lectura futura controlada.
- [x] Activar RLS estricta: usuarios normales no leen auditoria global ni propia en E.4; `document_admin` lee no payroll; `payroll_manager` lee payroll.
- [x] Conectar `activate_document_version_upload` con auditoria `version_activated` y `version_archived` cuando reemplaza una version activa.
- [x] Documentar que `file_preview` y `file_download` quedan preparados para futuras rutas controladas; E.4 no registra preview/descarga real desde app porque no existe UI ni signed URL documental.

Fuera de E.4: UI documental, pagina de documentos, subida desde app, preview/descarga desde app, signed URLs documentales desde app, boton "Firmar", documentos firmables, `document_signature_requests`, `document_signature_evidences`, snapshots reales, nominas, RRHH sensible nuevo, fichaje y geolocalizacion.

Verificacion E.4 2026-05-10:

- [x] `npx supabase migration up --local`
- [x] `npm run supabase:types`
- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] `rg -n "STL" src` sin coincidencias.
- [x] Pruebas SQL con rollback: usuario sin permiso no lee auditoria sensible; `document_admin` registra/consulta auditoria no payroll; `payroll_manager` registra/consulta payroll; `admin`/`manager` sin capacidad no leen `sensitive_hr`/`payroll`; otro tenant no ve eventos; metadata insegura con URL se rechaza; eventos quedan scoped por `organization_id`; `activate_document_version_upload` registra `version_activated` y `version_archived`.

#### E.5 - Rutas controladas de preview y descarga documental privada

Estado: implementada el 2026-05-10 como infraestructura backend minima, sin modulo visible de documentos.

Decision: crear solo el primer acceso real controlado a archivos de `document_versions` privadas desde la app. Las rutas resuelven sesion, organizacion activa y membership en servidor; validan que documento y version pertenecen al tenant activo; comprueban `can_access_document(..., 'preview')` o `can_access_document(..., 'download')`; generan signed URLs cortas de `document-files` solo tras validar acceso; registran `file_preview`/`file_download` permitidos y `denied` cuando el documento/version existe en el tenant pero falta permiso. No se guarda signed URL, ruta Storage, token ni contenido documental en base de datos, logs o auditoria.

- [x] Crear helper server para acceso a archivo documental privado.
- [x] Crear `GET /app/documents/[documentId]/versions/[documentVersionId]/preview`.
- [x] Crear `GET /app/documents/[documentId]/versions/[documentVersionId]/download`.
- [x] Resolver usuario autenticado, organizacion activa y membership activa en servidor.
- [x] Validar UUIDs, `organization_id`, `document_id`, `document_version_id`, bucket `document-files`, estado de documento/version y `requires_signature = false`.
- [x] Usar `can_access_document(..., 'preview')` para preview y `can_access_document(..., 'download')` para descarga.
- [x] Generar signed URLs cortas solo en memoria y devolverlas mediante redirect no-cache.
- [x] Registrar `file_preview`/`file_download` permitidos con `record_document_access_event`.
- [x] Registrar `denied` cuando falta permiso y el documento/version existe en el tenant.
- [x] Mantener metadata de auditoria minimizada, sin URLs, rutas, tokens, hashes ni contenido.
- [x] Documentar que estas rutas son infraestructura para UI futura, no una pagina documental visible.

Fuera de E.5: UI documental, pagina de documentos, listado, subida desde app, signed URLs persistentes, documentos firmables, boton "Firmar", `document_signature_requests`, `document_signature_evidences`, snapshots reales, nominas, RRHH sensible nuevo, fichaje y geolocalizacion.

Verificacion E.5 2026-05-10:

- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] `rg -n "STL" src` sin coincidencias.
- [x] Llamadas/SQL controlados: sujeto/grant con preview recibe signed URL corta; sujeto/grant sin download no descarga; `admin`/`manager` sin grant/capacidad no acceden a `sensitive_hr`/`payroll`; `document_admin` no accede a payroll si no es `payroll_manager`; otro tenant no accede; cada preview/download permitido registra `document_access_events`; denegaciones aplicables registran `denied`; no se guarda contenido documental, signed URLs ni URLs publicas persistentes.

### Fase F - Fichaje Web, Cierre Semanal Y Aprobacion

Objetivo: registrar jornada en web de forma manual o automatica por planificacion, exportable, corregible, aprobable semanalmente y auditable, sin geolocalizacion web.

Estado 2026-05-13: F.1 queda completada como modelado documental, F.2 implementa el primer schema minimo seguro para fichaje manual, F.3 abre una capa servidor minima en `src/lib`, F.4 crea la primera superficie visible propia en `/app/time`, F.5 anade solicitud propia de correcciones, F.6 abre la primera revision administrativa minima de correcciones pendientes, F.7 abre la aplicacion trazable de correcciones ya aprobadas, F.8 cambia la politica por defecto para que las correcciones propias se apliquen directamente salvo configuracion del `owner`, F.9 anade vista semanal con avisos operativos frente a bloques asignados, F.10 separa punches sustituidos/anulados hacia historial visible de cambios, F.11 implementa fichaje automatico web por planificacion, F.12 implementa la base backend de cierre semanal/aprobacion firmada, F.13 implementa avisos in-app en Inicio y F.14 implementa el primer CSV interno revisable. Existe migracion Supabase, RLS, auditoria tecnica, RPC de fichaje propio, RPC transaccional de aplicacion de correcciones, RPC de automatico por planificacion, RPCs de envio/aprobacion/rechazo/reapertura semanal, tipos Supabase actualizados, helpers de lectura/revision/aplicacion/cierre/exporte, server actions, ruta backend de descarga y UI para registrar entrada/salida, corregir directamente, solicitar/revisar/aplicar cuando el tenant exige aprobacion, consultar historico propio, comparar la semana con asignaciones y descargar exporte interno para roles autorizados. No hay geolocalizacion activa, payroll, calculo automatico de horas extra, exporte legal definitivo, seeds reales ni promesa de cumplimiento legal definitivo.

Decision 2026-05-13: la webapp no pedira ubicacion al fichar. La evolucion de Fase F sera manual + automatico por clases/bloques asignados. El automatico web no prueba presencia real; debe quedar corregible y pasar por cierre semanal. Cada domingo a las 23:59, la semana de cada usuario se enviara automaticamente a aprobacion. `owner`, `admin` y `manager` tendran una cola visible en Inicio para aprobar con firma propia ("Firmar y aprobar") o rechazar con nota obligatoria. Aprobar cierra la semana y bloquea modificaciones normales; rechazar notifica al usuario, exige correcciones y permite reenviar a aprobacion. Las notificaciones iniciales son in-app; push movil queda para app nativa.

Alcance:

- fichaje manual de inicio/fin;
- fichaje automatico web basado solo en clases/bloques asignados;
- registros de jornada por trabajador/persona dentro de una organizacion;
- entradas y salidas manuales auditables;
- correcciones posteriores con motivo;
- envio automatico de semana a aprobacion el domingo a las 23:59;
- aprobacion semanal firmada por `owner`, `admin` o `manager`;
- rechazo con nota obligatoria, notificacion al usuario y reenvio tras correcciones;
- cola de aprobaciones visibles en Inicio para gestores;
- notificaciones in-app para aprobacion, rechazo y correccion requerida;
- exportes y auditoria;
- acceso del trabajador a sus registros.

No incluye:

- geolocalizacion web, `navigator.geolocation` o geofencing desde navegador/PWA;
- app nativa/PWA avanzada;
- push notifications moviles;
- payroll o generacion de nominas;
- cumplimiento legal definitivo sin revision;
- calculo automatico de horas extra.

Dependencias:

- revision legal y privacidad;
- modelo de registros/correcciones/aprobaciones/exportes;
- permisos de trabajador, gestor, owner y representantes si aplica.

Criterio de salida:

- [x] Se registra inicio y fin de jornada mediante base de datos/RPC propio y UI personal minima.
- [x] Correcciones guardan motivo, autor, fecha, estado y snapshots antes/despues.
- [x] Aprobacion semanal queda trazada como schema auditable.
- [x] Exporte revisable queda modelado como metadata de lote, sin archivo/generacion real todavia.
- [x] Se documenta conservacion de registros durante 4 anos en Espana.
- [x] Se documenta acceso para trabajador, representantes e Inspeccion.
- [x] La documentacion avisa que legal debe revisar antes de prometer cumplimiento.
- [x] `/app/time` muestra registros propios recientes y punches asociados sin aceptar `person_profile_id`.
- [x] `owner`, `admin` y `manager` pueden revisar correcciones pendientes del tenant activo desde `/app/time`, aprobando o rechazando con trazabilidad y sin aplicar cambios automaticos al historico.
- [x] `owner`, `admin` y `manager` pueden aplicar correcciones `approved` del tenant activo desde `/app/time`, usando RPC transaccional y sin UPDATE/DELETE directo desde UI/actions sobre `time_records` ni `time_punches`.
- [x] Las correcciones propias se aplican directamente por defecto mediante RPC trazada; el `owner` puede activar en Configuracion que vuelvan a requerir aprobacion previa.
- [x] `/app/time` muestra una vista semanal navegable con horas asignadas, horas fichadas, balance y avisos por falta, exceso, fichaje abierto o fichaje sin asignacion visible.
- [x] Fichaje automatico web por clases/bloques asignados, sin ubicacion ni prueba de presencia.
- [x] Base de envio automatico de semanas a aprobacion el domingo a las 23:59 por organizacion/timezone mediante scheduler DB.
- [ ] Cola visible en Inicio para `owner`, `admin` y `manager` con semanas pendientes.
- [x] Aprobacion con firma propia y bloqueo de la semana aprobada.
- [x] Rechazo con nota obligatoria y base de correccion/reenvio; notificacion in-app queda en F.13.
- [ ] Notificaciones in-app para usuarios y gestores; push movil queda fuera hasta app nativa.

Decision pendiente legal:

- [ ] Validar retencion, formato de exporte, acceso de representantes y textos de consentimiento antes de usar datos reales.

#### F.1 - Modelo documental de fichaje manual seguro

Estado: completada el 2026-05-11 como documentacion/modelado. No implementa schema, RLS real, UI, migraciones, seeds, tipos Supabase, payroll ni geolocalizacion.

Decision: antes de construir fichaje, BoxOps modela un registro manual de jornada tenant-scoped, corregible, aprobable semanalmente, exportable y auditable. El fichaje puede vincularse opcionalmente a `schedule_blocks` y `schedule_block_assignments`, pero no depende de ellos: una persona debe poder fichar aunque no exista bloque asignado o aunque la asignacion este pendiente de corregir.

Entidades candidatas F.1:

- `time_records`: registro de jornada por organizacion, persona/trabajador, fecha local y estado.
- `time_punches`: eventos manuales de entrada/salida dentro de un registro, con autor y momento.
- `time_record_corrections`: correcciones solicitadas o aplicadas con motivo obligatorio, autor, estado y snapshots antes/despues.
- `time_weekly_approvals`: cierre/aprobacion semanal por trabajador, semana y organizacion.
- `time_exports`: lotes de exporte por rango, trabajador, centro o tenant, con formato y solicitante.
- `time_audit_events`: auditoria de creacion, correccion, aprobacion, reapertura, exporte y accesos relevantes.

Frontera de tenant:

- [x] Toda entidad candidata incluye `organization_id` obligatorio.
- [x] Las referencias a persona, membership, centro, bloque, asignacion o exporte deben pertenecer a la misma organizacion.
- [x] STL no genera tablas, rutas, permisos ni reglas especiales; solo sera datos/configuracion del tenant piloto.

Relacion con horario:

- [x] `schedule_block_id` y `schedule_block_assignment_id` son relaciones opcionales para contexto, conciliacion y futuras comparaciones.
- [x] El fichaje no se bloquea si no hay bloque/asignacion; el trabajador puede registrar jornada manual igualmente.
- [x] Si se vincula un bloque, conviene guardar snapshot minimo de centro, fecha y tramo previsto para que cambios posteriores de horario no reescriban historia.

Actores y permisos candidatos:

- trabajador/coach: crear entrada/salida propia, consultar sus registros, solicitar correcciones propias y ver estado de aprobacion/exporte propio cuando proceda.
- `manager`: revisar registros operativos, aprobar semanas y resolver correcciones dentro del alcance que se decida; por ahora tenant-wide hasta modelar permisos por centro.
- `admin`/`owner`: gestionar configuracion y supervisar fichaje del tenant, exportes y reaperturas; no pueden hacer ediciones silenciosas sin correccion/auditoria.
- roles futuros: `center_manager` para alcance por centro, `payroll_manager` para consumir exportes validados sin convertir BoxOps en payroll, `staff` como trabajador no coach y posibles representantes/accesos de inspeccion como flujo controlado futuro.

Reglas de correccion:

- [x] Toda correccion debe tener motivo obligatorio.
- [x] Toda correccion guarda autor autenticado, membership/persona si aplica, fecha, estado y valores anteriores/nuevos.
- [x] Estados candidatos: `pending`, `approved`, `rejected`, `cancelled`, `applied`.
- [x] No se editan entradas/salidas historicas en silencio; se versionan, superseden o reconstruyen mediante correccion trazada.
- [x] Una semana aprobada solo se modifica mediante reapertura o correccion posterior auditada.

Acceso del trabajador:

- [x] Cada trabajador debe poder consultar sus propios registros de jornada, entradas/salidas, correcciones y aprobaciones dentro de su organizacion activa.
- [x] La lectura propia deriva la persona desde `auth.uid()` + `organization_id` siempre que exista cuenta vinculada.

Nota legal/producto Espana:

- [x] Documentar como pendiente de validacion legal que en Espana los registros de jornada deben conservarse durante 4 anos y estar disponibles para trabajador, representantes legales e Inspeccion de Trabajo.
- [x] BoxOps no debe prometer cumplimiento legal definitivo hasta revisar formato, retencion, accesos y textos con asesor legal/laboral.

Fuera de F.1:

- [x] geolocalizacion, geofencing y tracking continuo;
- [x] payroll, nominas y calculo fiscal/laboral definitivo;
- [x] app nativa o automatismos con app cerrada;
- [x] calculo automatico de horas extra;
- [x] UI, schema, migraciones, seeds, tipos Supabase y tests tecnicos.

#### F.2 - Schema minimo de fichaje manual seguro

Estado: implementada el 2026-05-11 para desarrollo y QA tecnico local. No abre superficie visible de producto.

- [x] Crear `supabase/migrations/00010_time_tracking_manual_foundation.sql`.
- [x] Crear `time_records` como contenedor tenant-scoped por persona y fecha local.
- [x] Crear `time_punches` para `clock_in`/`clock_out` manuales, sin ubicacion.
- [x] Crear `time_record_corrections` con motivo obligatorio, autor, estado y snapshots `before_snapshot`/`after_snapshot`.
- [x] Crear `time_weekly_approvals` para cierre/reapertura semanal auditable.
- [x] Crear `time_exports` como metadata de lotes exportables; archivo/generacion quedan diferidos.
- [x] Crear `time_audit_events` y triggers de auditoria para creacion de registro, punch, correccion, aprobacion y exporte.
- [x] Mantener `organization_id` obligatorio en todas las tablas de fichaje.
- [x] Validar referencias tenant-safe a `person_profiles`, `organization_memberships`, `centers`, `schedule_blocks` y `schedule_block_assignments`.
- [x] Permitir `schedule_block_id` y `schedule_block_assignment_id` opcionales; fichar manualmente no depende de horario/asignacion.
- [x] Anadir RPC `create_own_time_punch(...)`, derivando persona desde `auth.uid()` + `organization_id`.
- [x] RLS: trabajador con persona vinculada lee/crea fichaje propio; `owner`/`admin`/`manager` revisan solo dentro del tenant; otro tenant no lee ni escribe.
- [x] No conceder UPDATE/DELETE directo sobre `time_records` ni `time_punches`; cambios historicos pasan por correcciones/aprobaciones/auditoria.
- [x] Actualizar tipos Supabase en `src/types/supabase.ts`.
- [x] Actualizar `docs/architecture/domain-model.md` con lo implementado.

Fuera de F.2:

- [x] UI, rutas en `src/app` y acciones de servidor de producto.
- [x] geolocalizacion/geofencing, app nativa o PWA avanzada.
- [x] payroll, nominas, calculo automatico de horas extra o cumplimiento legal definitivo.
- [x] seeds reales, datos STL o defaults de tenant.

Verificacion F.2 2026-05-11:

- [x] Migracion `00010` aplicada localmente con `npx supabase migration up --local`.
- [x] `npm run supabase:types`.
- [x] `npm run typecheck`.
- [x] `npm run lint`.
- [x] SQL manual con `ROLLBACK`: trabajador ve solo sus registros; `manager`/`admin`/`owner` acceden solo dentro de su tenant; otro tenant queda bloqueado; correccion sin motivo se rechaza; punch manual sin `schedule_block_id` funciona y la relacion con horario/asignacion sigue opcional.

#### F.3 - Capa servidor minima de fichaje manual

Estado: implementada el 2026-05-11 como infraestructura sin UI visible ni rutas nuevas en `src/app`.

- [x] Crear `src/lib/time-tracking.ts` como helper servidor reutilizable para fichaje manual.
- [x] Crear `src/lib/time-tracking-actions.ts` con Server Actions finas que delegan en el helper.
- [x] Resolver sesion, memberships activas y organizacion activa antes de cualquier lectura o mutacion.
- [x] Exigir `organizationId` explicito y validado como UUID; no usar fallback implicito cuando haya un solo tenant.
- [x] Resolver persona propia desde `auth.uid()` + `organization_id`; las acciones propias no aceptan `person_profile_id`.
- [x] Llamar a `create_own_time_punch(...)` para `clock_in`/`clock_out` propio.
- [x] Validar en servidor `punchType`, timestamp con offset, `localWorkDate`, ids opcionales de centro/bloque/asignacion, notas y metadata minimizada.
- [x] Verificar centro, bloque y asignacion dentro del tenant activo antes del RPC; RLS/RPC siguen como segundo candado.
- [x] Listar registros propios, punches propios, correcciones propias y aprobaciones semanales propias.
- [x] Listar registros, punches, correcciones y aprobaciones para revision solo para `owner`/`admin`/`manager` dentro del tenant activo.
- [x] Permitir solicitud propia de correccion con motivo obligatorio, snapshots JSON seguros y sin aceptar persona ajena.
- [x] Permitir revision basica de correcciones pendientes (`approved`/`rejected`) solo para `owner`/`admin`/`manager`.
- [x] Mantener cliente Supabase normal con anon/session; no usar `service_role` en helpers normales ni cliente.
- [x] Reutilizar tipos Supabase generados (`Tables`, `TablesInsert`, `TablesUpdate`, `Json`).

Fuera de F.3:

- [x] UI, pagina de fichaje o rutas nuevas en `src/app`.
- [x] geolocalizacion/geofencing, app nativa o PWA avanzada.
- [x] payroll, nominas, calculo automatico de horas extra o exportacion real de archivos.
- [x] seeds reales, datos STL o defaults de tenant.
- [x] aplicacion automatica de correcciones aprobadas sobre punches historicos.

Verificacion F.3 2026-05-11:

- [x] `npm run typecheck`.
- [x] `npm run lint`.
- [x] `rg -n "STL" src` sin coincidencias.
- [x] `rg -n "service_role" src` sin coincidencias.
- [x] Limitacion documentada: la prueba end-to-end real queda pendiente hasta que exista UI o harness autenticado que invoque las Server Actions; F.3 queda validada por typecheck/lint y por los tests SQL manuales de F.2 como segundo candado DB/RLS.

#### F.4 - Primera superficie visible de fichaje propio

Estado: implementada el 2026-05-11 como UI minima protegida en `/app/time`, conectada a la capa servidor F.3 y al schema/RPC F.2.

- [x] Crear ruta protegida `/app/time` bajo el shell de app.
- [x] Enlazarla desde la navegacion personal desktop y desde `/app/more` en movil, sin cambiar la bottom nav principal.
- [x] Usar `createOwnTimePunchAction` para crear fichajes propios `clock_in` y `clock_out`.
- [x] Usar helpers F.3 para listar registros propios, punches propios, correcciones propias y aprobaciones propias.
- [x] Permitir fichaje manual sin bloque ni asignacion.
- [x] Permitir centro opcional solo desde centros del tenant activo; bloque/asignacion quedan fuera de este primer corte visible.
- [x] No aceptar `person_profile_id` desde formularios propios.
- [x] Mantener validacion servidor y RLS/RPC como segundo candado.
- [x] Mostrar estados empty, error, carga parcial y no disponible por falta de perfil vinculado.
- [x] Mostrar copy claro: manual, auditable, sin geolocalizacion, sin payroll, sin garantia legal definitiva.
- [x] Actualizar smoke de rutas protegidas para incluir `/app/time`.
- [x] Actualizar documentacion de dominio, roadmap, notas legales y guia de coach.

Fuera de F.4:

- [x] geolocalizacion/geofencing, app nativa o PWA avanzada.
- [x] payroll, nominas, calculo automatico de horas extra o exportacion real.
- [x] aprobaciones administrativas completas y edicion silenciosa de punches historicos.
- [x] vinculacion UI a bloque/asignacion hasta resolver selector seguro de horario propio.
- [x] seeds reales, datos STL o defaults de tenant.

Verificacion F.4 2026-05-11:

- [x] `npm run typecheck`.
- [x] `npm run lint`.
- [x] `rg -n "STL" src` sin coincidencias.
- [x] `rg -n "service_role" src` sin coincidencias.
- [x] Smoke anonimo contra dev server local en `http://127.0.0.1:3003`: `/app/time` redirige a `/login`.
- [x] `npx playwright test --config=playwright.smoke.config.ts` contra `E2E_BASE_URL=http://127.0.0.1:3003`, cargando admin/coach E2E locales desde snippet: 24 passed, 2 skipped (`owner`/`manager` sin credenciales locales).
- [x] Smoke autenticado admin/coach cargando credenciales locales desde `supabase/snippets/Untitled query 761.sql`: rutas protegidas MVP pasan para admin y coach; owner/manager quedan skipped por no tener credenciales locales.
- [x] Revision end-to-end autenticada de `/app/time` con coach E2E local y persona vinculada: login, abrir ruta, fichar entrada, fichar salida y ver registros recientes.
- [x] Limitacion restante: las credenciales E2E locales existen en snippet, pero no estan exportadas en `.env.local`; si no se cargan antes de Playwright, la suite autenticada se salta.

#### F.5 - Primera UI minima de correcciones propias

Estado: implementada el 2026-05-11 como ampliacion de `/app/time`, consumiendo la capa servidor F.3 y el schema/RPC/RLS F.2.

- [x] Ampliar `/app/time` con un formulario propio de solicitud de correccion sin abrir una subruta nueva.
- [x] Usar `requestOwnTimeCorrectionAction` desde una Server Action de formulario.
- [x] Permitir seleccionar un registro propio reciente y un fichaje asociado cuando el tipo lo requiera.
- [x] Soportar tipos minimos: anadir fichaje omitido, corregir hora de entrada/salida, anular fichaje erroneo y nota/correccion de registro.
- [x] Exigir motivo obligatorio antes de crear la solicitud.
- [x] Construir `beforeSnapshot` y `afterSnapshot` en servidor desde el registro/punch propio y campos controlados del formulario; no aceptar JSON libre del usuario.
- [x] No aceptar `person_profile_id` ni permitir fichar/corregir en nombre de otra persona.
- [x] No editar directamente `time_records` ni `time_punches`; la solicitud queda `pending` en `time_record_corrections`.
- [x] Mostrar correcciones propias recientes con estados `pending`, `approved`, `rejected`, `applied` y `cancelled`.
- [x] Mantener copy prudente: manual, auditable, sin geolocalizacion, sin payroll ni garantia legal definitiva.

Fuera de F.5:

- [x] aplicacion automatica de correcciones aprobadas sobre punches historicos;
- [x] revision administrativa completa de correcciones;
- [x] vinculacion UI a bloque/asignacion;
- [x] geolocalizacion, payroll, horas extra automaticas, exportes reales, seeds reales o datos STL.

Verificacion F.5 2026-05-11:

- [x] `npm run typecheck`.
- [x] `npm run lint`.
- [x] `npm run build`.
- [x] `rg -n "STL" src/app/(app)/app/time src/lib/time-tracking-actions.ts` sin coincidencias.
- [x] Revision manual de guardrails: los unicos usos de `person_profile_id` en `/app/time` estan en consultas servidor derivadas de sesion/tenant; no hay campo de formulario para persona ni JSON de snapshot recibido desde cliente.
- [x] `npx playwright test --config=playwright.smoke.config.ts` contra `E2E_BASE_URL=http://127.0.0.1:3003`: 22 passed, 8 skipped por credenciales E2E no exportadas.

#### F.6 - Primera UI minima de revision de correcciones pendientes

Estado: implementada el 2026-05-11 como ampliacion de `/app/time`, consumiendo `listTimeCorrectionsForReview` y `reviewTimeCorrectionAction`.

- [x] Mostrar en `/app/time` una seccion de revision de correcciones solo para `owner`, `admin` y `manager`.
- [x] Listar solicitudes `pending` del tenant activo mediante helper servidor, sin aceptar filtros de persona desde la UI.
- [x] Mostrar persona solicitante cuando hay perfil visible, registro afectado, punch afectado si existe, tipo, motivo, estado y fecha de solicitud.
- [x] Mostrar resumen legible de `before_snapshot` y `after_snapshot` sin volcar JSON crudo ni aceptar JSON de formulario.
- [x] Permitir aprobar una correccion pendiente con nota opcional de revision.
- [x] Exigir nota de revision al rechazar, validada en la Server Action de formulario y en `reviewTimeCorrection`.
- [x] Mantener validacion servidor de `organizationId`, `correctionId`, decision y permisos; RLS/trigger vuelve a trazar reviewer y tenant.
- [x] No editar directamente `time_records` ni `time_punches`; aprobar deja la solicitud aprobada, pero no aplica cambios automaticos sobre el historico.
- [x] No usar `service_role`.
- [x] Mostrar estados de acceso no autorizado, empty, carga parcial, error y loading de ruta.
- [x] Mantener `center_manager`, `payroll_manager` y `staff` sin permisos especiales de revision.

Fuera de F.6:

- [x] aplicacion automatica de correcciones aprobadas sobre `time_records` o `time_punches`;
- [x] editor administrativo de fichajes historicos;
- [x] aprobacion semanal completa desde UI;
- [x] geolocalizacion, payroll, horas extra automaticas, exportes reales, seeds reales o datos STL.

Verificacion F.6 2026-05-11:

- [x] `npm run typecheck`.
- [x] `npm run lint`.
- [x] `npm run build`.
- [x] Smoke completo contra `E2E_BASE_URL=http://127.0.0.1:3003`: 22 passed, 8 skipped por credenciales E2E no exportadas.
- [x] `rg -n "STL" src` sin referencias nuevas.
- [x] `rg -n "service_role" src` sin coincidencias.
- [x] Revision manual de que no hay UPDATE/DELETE directo sobre `time_records` ni `time_punches`; el unico `update` nuevo/visible en la capa de fichaje es sobre `time_record_corrections`.

#### F.7 - Aplicacion trazable de correcciones aprobadas

Estado: implementada el 2026-05-11 como ampliacion controlada de F.6 en `/app/time`.

- [x] Crear migracion `supabase/migrations/00012_time_correction_application.sql`.
- [x] Anadir RPC `apply_time_record_correction(...)` para aplicar solo correcciones `approved` dentro del tenant activo.
- [x] Mantener la aplicacion transaccional, con validacion de membership activa y permiso `owner`/`admin`/`manager`.
- [x] No permitir aplicar correcciones `pending`, `rejected`, `cancelled` ni `applied`.
- [x] `punch_add`: crear un nuevo `time_punches` con `source = 'correction'`.
- [x] `punch_update`: marcar el punch original como `superseded` y crear un punch corregido con `source = 'correction'`.
- [x] `punch_void`: marcar el punch original como `voided`, sin borrar filas.
- [x] `record_update`: marcar la correccion como `applied` sin mutar `time_records`, porque el modelo actual no tiene un campo seguro de nota aplicada ni cambios de jornada controlados para este tipo.
- [x] Marcar la correccion como `applied` con `applied_at`.
- [x] Ampliar auditoria tecnica con `time_punch_updated` para cambios de estado de punches y reutilizar `time_correction_updated` al aplicar.
- [x] Exponer helper `applyTimeCorrection` y Server Action fina, delegando en la RPC y validando estado/tenant/permiso en servidor.
- [x] Ampliar `/app/time` con una cola de correcciones aprobadas para aplicar, mostrando resumen legible de snapshots y de lo que se aplicara antes del boton.
- [x] Mantener copy prudente: aplicar cambia el historico operativo de forma trazada, pero no equivale a payroll, nomina ni cumplimiento legal definitivo.
- [x] Mantener estados empty, carga parcial, error, no autorizado y ya aplicado.
- [x] No usar `service_role`.
- [x] No conceder permisos especiales a `center_manager`, `payroll_manager` ni `staff`.

Fuera de F.7:

- [x] payroll, nominas, calculo automatico de horas extra o exportes reales;
- [x] geolocalizacion/geofencing, app nativa o PWA avanzada;
- [x] editor administrativo libre de fichajes historicos;
- [x] reapertura/cierre semanal completo desde UI;
- [x] seeds reales o datos STL.

Verificacion F.7 2026-05-11:

- [x] `npx supabase migration up --local`.
- [x] `npm run supabase:types`.
- [x] `npm run typecheck`.
- [x] `npm run lint`.
- [x] `npm run build`.
- [x] Smoke de rutas protegidas contra `E2E_BASE_URL=http://127.0.0.1:3003`: 22 passed, 8 skipped por credenciales E2E no exportadas.
- [x] `rg -n "STL" src` sin referencias nuevas.
- [x] `rg -n "service_role" src` sin coincidencias.
- [x] Revision manual de que no hay UPDATE/DELETE directo desde UI/actions sobre `time_records` ni `time_punches`; los cambios historicos pasan por RPC controlada.

#### F.8 - Politica configurable de correcciones directas

Estado: implementada el 2026-05-11 como ajuste de producto sobre F.5-F.7. Por defecto, una persona con ficha vinculada corrige su propio fichaje y la correccion se aplica al enviar mediante RPC trazada. Si el `owner` activa aprobacion previa en `/app/settings`, el mismo formulario vuelve al modo solicitud pendiente y `owner`, `admin` o `manager` revisan/aplican como en F.6/F.7.

- [x] Crear `supabase/migrations/00013_time_correction_policy.sql`, ajuste `00014_time_correction_direct_punch_policy.sql` y guardrail DB `00015_time_tracking_config_owner_guard.sql`.
- [x] Anadir `organizations.time_tracking_config jsonb` con `correctionApprovalRequired = false` por defecto.
- [x] Permitir que solo `owner` cambie la politica de correcciones de fichaje desde `/app/settings`.
- [x] Mantener `admin` compatible en configuracion visual, pero sin permiso para cambiar esta politica.
- [x] Reforzar en DB que `time_tracking_config` solo puede cambiarlo un `owner`, aunque la policy historica de `organizations` permita a `admin` editar configuracion visual.
- [x] Anadir RPC `create_and_apply_own_time_record_correction(...)` para crear la correccion propia y aplicarla en una transaccion cuando no se requiere aprobacion.
- [x] Validar en DB auth, membership activa, persona propia, tenant activo, estado de configuracion y punch/record propios.
- [x] Mantener motivo obligatorio y snapshots construidos en servidor; no aceptar JSON libre desde formularios.
- [x] Mantener trazabilidad: la correccion queda `applied`, con `applied_at`, metadata de modo directo y eventos de auditoria existentes.
- [x] Mantener el comportamiento de `punch_add`, `punch_update`, `punch_void` y la limitacion documentada de `record_update`.
- [x] Cambiar `/app/time` para mostrar "Aplicar correccion" por defecto y "Solicitar correccion" solo si el tenant exige aprobacion.
- [x] Mantener la cola administrativa para solicitudes pendientes/aprobadas existentes o para tenants con aprobacion activa.
- [x] No usar `service_role`, no hardcodear STL y no conceder permisos especiales a `center_manager`, `payroll_manager` ni `staff`.

Fuera de F.8:

- [x] geolocalizacion/geofencing, app nativa o PWA avanzada;
- [x] payroll, nominas, calculo automatico de horas extra o exportes reales;
- [x] editor administrativo libre de fichajes historicos;
- [x] aprobacion semanal completa desde UI;
- [x] seeds reales o datos STL.

Verificacion F.8 2026-05-11:

- [x] `npx supabase migration up --local`.
- [x] `npm run supabase:types`.
- [x] `npm run typecheck`.
- [x] `npm run lint`.
- [x] `npm run build`.
- [x] Smoke de rutas protegidas contra `E2E_BASE_URL=http://127.0.0.1:3003`: 22 passed, 8 skipped por credenciales E2E no exportadas.
- [x] `rg -n "STL" src` sin referencias nuevas.
- [x] `rg -n "service_role" src` sin coincidencias.
- [x] Revision manual de que no hay UPDATE/DELETE directo desde UI/actions sobre `time_records` ni `time_punches`; los cambios historicos directos pasan por RPC controlada.

#### F.9 - Vista semanal y avisos operativos de fichaje

Estado: implementada el 2026-05-11 como ampliacion de `/app/time` sin migracion nueva. Compara fichajes propios activos contra bloques asignados de la semana y ayuda a detectar faltas, excesos o fichajes abiertos sin convertir BoxOps en payroll.

- [x] Reutilizar `resolveWeek`/`getAdjacentWeekStart` para navegar semanas como Horario/Cobertura.
- [x] Crear helper servidor `getOwnTimeWeekOverview(...)` en `src/lib/time-tracking.ts`, derivando persona y perfiles propios desde sesion + tenant; no acepta `person_profile_id`.
- [x] Calcular horas asignadas desde `schedule_block_assignments.assignment_status = assigned` y `schedule_blocks` no cancelados del tenant activo.
- [x] Calcular horas fichadas con pares `clock_in`/`clock_out` activos, ignorando punches `superseded` o `voided` para el balance.
- [x] Mostrar tarjetas superiores de asignadas, fichadas, balance y avisos.
- [x] Mostrar una vista de siete dias con bloques asignados, fichajes visibles, diferencia y estado por dia.
- [x] Enlazar dias con `time_record` al formulario de correccion, preseleccionando el registro mediante `record_id` solo como estado de UI; la action vuelve a validar registro/persona/tenant.
- [x] Mantener copy prudente: los avisos son operativos, no aprueban horas extra, nomina ni cumplimiento legal definitivo.
- [x] Documentar limitacion: si un dia asignado no tiene `time_record`, la UI puede avisar pero aun no crea una correccion historica desde cero; falta una RPC especifica para hacerlo de forma transaccional y auditable.
- [x] No usar `service_role`, no hardcodear STL, no conceder permisos especiales a `center_manager`, `payroll_manager` ni `staff`.

Fuera de F.9:

- [x] payroll, nominas, aprobacion legal de horas extra o calculo automatico definitivo;
- [x] geolocalizacion/geofencing, app nativa o PWA avanzada;
- [x] RPC para crear registros historicos desde dias sin `time_record`;
- [x] cierre/aprobacion semanal completo desde UI;
- [x] exportes reales, seeds reales o datos STL.

Verificacion F.9 2026-05-11:

- [x] `npm run typecheck`.
- [x] `npm run lint`.
- [x] `npm run build`.
- [x] Smoke de rutas protegidas contra `E2E_BASE_URL=http://127.0.0.1:3003`: 22 passed, 8 skipped por credenciales E2E no exportadas.
- [x] `rg -n "STL" src` sin referencias nuevas.
- [x] `rg -n "service_role" src` sin coincidencias.
- [x] Revision manual de que no hay UPDATE/DELETE directo desde UI/actions sobre `time_records` ni `time_punches`.

#### F.10 - Historial visible de cambios de fichaje

Estado: implementada el 2026-05-11 como ajuste de UI/copy sin migracion nueva. Los fichajes sustituidos o anulados por una correccion aplicada dejan de aparecer en la vista principal del dia y pasan a un historial reciente de cambios.

- [x] Mostrar en la vista semanal y en los registros del dia solo punches `active`.
- [x] Mantener punches `superseded` y `voided` fuera del contador principal para evitar ruido operativo.
- [x] Mostrar `superseded` y `voided` en "Historial de cambios" dentro del registro afectado.
- [x] Limitar ese historial visible a 30 dias desde `updated_at`/cambio aplicado.
- [x] No hacer DELETE fisico de `time_punches` ni `time_audit_events`: la caducidad es de visibilidad en UI, no de evidencia canonica, hasta cerrar una politica legal de retencion.
- [x] Cambiar copy visible de app de "tenant" a "organizacion" cuando lo vea una persona usuaria.
- [x] Mantener nombres internos, imports y helpers tecnicos sin renombrado masivo.

Fuera de F.10:

- [x] purga fisica de registros laborales o auditoria;
- [x] jobs/cron de retencion;
- [x] migraciones nuevas;
- [x] payroll, exportes legales o cumplimiento definitivo.

Verificacion F.10 2026-05-11:

- [x] `npm run typecheck`.
- [x] `npm run lint`.
- [x] `npm run build`.
- [x] Smoke protegido con `E2E_START_SERVER=1 E2E_PORT=3003 npm run test:smoke`: 22 passed, 8 skipped por credenciales E2E no exportadas.
- [x] `rg -n "STL" src` sin referencias nuevas.
- [x] `rg -n "service_role" src` sin coincidencias.
- [x] `rg -n "tenant" src` solo con nombres internos/imports/atributos tecnicos, no copy visible.

#### F.11 - Fichaje automatico web por planificacion

Estado: primer corte tecnico implementado. `supabase/migrations/00025_time_schedule_auto_punches.sql` anade modo configurable `scheduleAutoPunchesEnabled`, `source = schedule_auto`, RPC `generate_schedule_auto_time_punches(...)`, idempotencia por asignacion/tipo de punch y snapshot minimizado sin presencia real. `src/lib/time-tracking.ts` y `src/lib/time-tracking-actions.ts` exponen helper/action server-side sin UI nueva. Verificacion SQL local con rollback en `supabase/snippets/time-schedule-auto-verification.sql`.

- [x] Definir modo configurable por organizacion para fichaje automatico por planificacion, separado del fichaje manual.
- [x] Generar punches/registros desde `schedule_block_assignments.assignment_status = 'assigned'` y bloques activos/no cancelados del usuario.
- [x] Usar fuente diferenciada, por ejemplo `source = schedule_auto`, sin mezclar con punches manuales ni correcciones.
- [x] Ejecutar generacion de forma idempotente para evitar duplicados si el job se repite.
- [x] Guardar snapshot minimo de bloque/asignacion/centro/horas previstas para que cambios posteriores de horario no reescriban historia.
- [x] Marcar estos fichajes como generados por planificacion, no como presencia verificada.
- [x] Mantener correcciones propias con motivo obligatorio para retrasos, salidas anticipadas, sustituciones o cambios no reflejados en horario.
- [x] No usar `navigator.geolocation`, mapas, IP, Wi-Fi, Bluetooth, geofencing ni datos de presencia real.
- [x] Anadir pruebas negativas de tenant/RLS/idempotencia y smoke minimo de lectura si se toca UI.

Fuera de F.11:

- geolocalizacion web o nativa;
- push notifications;
- payroll, horas extra automaticas, exportes legales;
- datos STL reales o seeds automaticos.

#### F.12 - Cierre semanal, firma y aprobacion de fichajes

Estado: base backend implementada el 2026-05-13. `supabase/migrations/00026_time_weekly_closure_approval.sql` amplia `time_weekly_approvals`, anade RPCs de envio/aprobacion/rechazo/reapertura, bloquea modificaciones normales de semanas aprobadas y deja `submit_due_time_weekly_approvals(...)` como primitiva de scheduler DB. Decision de producto 2026-05-13: cada domingo a las 23:59 se envia automaticamente la semana de fichaje de cada usuario a aprobacion de `owner`, `admin` y `manager`.

- [x] Definir estados de semana: `open`, `submitted`, `approved`, `rejected`, `correction_required` y `resubmitted`, manteniendo compatibilidad con `pending`, `reopened` y `voided`.
- [x] Crear base de job/scheduler de envio semanal domingo 23:59 por organizacion/timezone; no hacerlo desde UI ni Server Action normal.
- [x] Enviar a aprobacion semanas con fichajes manuales y/o automaticos por planificacion mediante RPC idempotente.
- [x] Mostrar en Inicio de `owner`, `admin` y `manager` una cola de semanas pendientes de aprobacion (cerrado en F.13/UI).
- [x] Permitir "Firmar y aprobar" usando la firma propia del aprobador, nunca la firma de otra persona.
- [x] Guardar evidencia/snapshot/version de firma usada para la aprobacion semanal; no depender solo de `profile_signatures` editable.
- [x] Si el aprobador no tiene firma propia, llevar a crear "Mi firma" antes de aprobar o permitir creacion inline solo si se decide UX (F.13 muestra CTA a `/app/account`).
- [x] Rechazar con nota obligatoria en backend; la visibilidad/aviso al usuario queda para F.13/UI.
- [x] Bloquear modificaciones normales de semanas aprobadas; cualquier reapertura/correccion posterior debe quedar auditada.
- [x] Permitir base de correccion/reenvio para semanas rechazadas mediante `resubmitted`; la experiencia completa queda para F.13.
- [x] Registrar auditoria de envio, aprobacion, rechazo, reenvio y reapertura.
- [x] Documentar que la firma de aprobacion semanal es confirmacion interna de cierre, no firma electronica avanzada/cualificada.

Fuera de F.12:

- firma documental;
- exportes legales definitivos;
- payroll;
- push notifications moviles;
- aprobacion por email.

#### F.13 - Notificaciones in-app de fichaje

Estado: primer corte implementado el 2026-05-13. Decision de producto 2026-05-13: antes de app nativa, las notificaciones seran visibles dentro de BoxOps.

- [x] Mostrar en Inicio de gestores (`owner`, `admin`, `manager`) semanas pendientes, rechazadas/reintentadas y bloqueos de aprobacion.
- [x] Mostrar en Inicio del usuario avisos de semana enviada, aprobada, rechazada, correccion requerida y reenviada.
- [x] Permitir navegar desde el aviso a `/app/time` con la semana afectada seleccionada.
- [x] Mantener las notificaciones tenant-scoped y derivadas de estado canonico, no como texto suelto sin entidad.
- [x] Preparar base conceptual para futura notificacion push movil: los avisos salen de `time_weekly_approvals` y pueden alimentar una outbox futura sin cambiar la fuente canonica.
- [x] No enviar emails reales hasta tener dominio/remitente/SMTP y decision operativa.
- [x] Reutilizar las RPC/actions F.12 desde Inicio para aprobar con firma propia y rechazar con nota obligatoria; si falta "Mi firma", la UI muestra CTA a `/app/account`.
- [x] No crear tabla nueva de notificaciones en este corte.

Verificacion inicial F.13:

- [x] `npx tsc --noEmit`
- [x] `rg -n "navigator\\.geolocation|service_role|STL" src` sin coincidencias.

Fuera de F.13:

- push notifications nativas;
- emails transaccionales de fichaje;
- centro de notificaciones completo si no hace falta para MVP.

#### F.14 - Exporte interno revisable de fichajes

Estado: primer corte implementado el 2026-05-13. `/app/time` muestra para `owner`, `admin` y `manager` una seccion secundaria de exporte interno revisable. `GET /app/time/export` genera CSV desde backend con sesion normal, valida tenant/rol/rango/persona opcional en servidor, registra/reutiliza `time_exports` como metadata canonica y devuelve una descarga sin Storage.

- [x] Reutilizar `time_exports` como entidad canonica de metadata; no crear tabla nueva.
- [x] Validar `organization_id`, membership activa y rol `owner`/`admin`/`manager` en servidor antes de generar el CSV.
- [x] Permitir filtrar por rango de fechas y persona opcional visible del tenant.
- [x] Limitar rango/volumen para evitar exportes masivos accidentales en el primer corte.
- [x] Incluir datos minimos revisables: organizacion, persona, fecha local, estado de registro, entradas/salidas activas, minutos trabajados calculados por pares seguros y estado de cierre semanal cuando exista.
- [x] No incluir snapshots completos, texto libre de correcciones, ubicacion, payroll, nominas, horas extra aprobadas ni garantia legal definitiva.
- [x] Registrar `requested/generated/failed` en `time_exports` y apoyarse en triggers de `time_audit_events`.
- [x] Mantener el acceso propio del trabajador intacto; la UI de exporte no se muestra a roles sin revision de fichaje.
- [x] Copy visible: "exporte interno revisable", no payroll ni cumplimiento legal definitivo.

Verificacion inicial F.14:

- [x] `npm run typecheck`
- [x] `rg -n "navigator\\.geolocation|service_role|STL" src` sin coincidencias.

Fuera de F.14:

- exporte legal definitivo para representantes/Inspeccion;
- payroll, nominas, horas extra automaticas/aprobadas o ausencias;
- Storage de archivos exportados;
- envio por email, push o app nativa;
- ubicacion real, mapas, geofencing, IP/Wi-Fi/Bluetooth.

### Fase G - Fichaje Geolocalizado Asistido

Objetivo: preparar geolocalizacion real para una app nativa o wrapper movil, no para la webapp.

Estado 2026-05-13: G.1 queda cerrada como modelado seguro de producto/privacidad/arquitectura, G.2 queda preparada como decision tecnica/legal previa, G.3 implementa la primera base tecnica de schema/RPC/RLS para ubicacion minimizada y G.4 implementa la primera capa server/app interna. Tras decision de producto, la webapp no pedira ubicacion ni usara `navigator.geolocation`; G.3/G.4 quedan reservadas como base tecnica para app nativa/wrapper futuro. No hay UI visible, geofencing activo, fichaje automatico por ubicacion, app nativa ni tracking continuo.

Alcance consolidado:

- activacion opcional futura por tenant solo cuando exista app nativa/wrapper y revision legal/privacidad;
- administracion futura de configuracion por `owner`/`admin` solo si se implementa capacidad explicita, sin abrir permisos a `manager`, `center_manager`, `payroll_manager`, `staff` ni `coach` por defecto;
- configuracion por centro: coordenadas del centro, radio permitido, precision maxima aceptable, timezone, estado activo/inactivo, version de politica y texto de aviso operativo;
- geofencing/background location solo desde app nativa/wrapper si el sistema operativo, permisos y politica de privacidad lo permiten;
- radio inicial sugerido de 100m configurable, siempre revisable por precision real y privacidad;
- resultado asistido dentro/fuera de radio, ubicacion no disponible, permiso denegado, timeout, navegador no soportado o precision insuficiente;
- fichaje automatico por ubicacion solo si coinciden bloque/clase asignada, centro correcto y ventana temporal definida;
- no fichar si esta en el box fuera de horario o sin asignacion aplicable;
- aviso/permiso claro de ubicacion nativa y fallback manual/correcciones Fase F como via principal.

#### G.1 - Modelado seguro de ubicacion asistida

Estado: cerrada el 2026-05-11 como documentacion/modelado. Reclasificada el 2026-05-13 como preparacion para app nativa/wrapper futuro, no para lectura de ubicacion en webapp.

- [x] Documentar que la webapp no pedira ubicacion para fichar.
- [x] Documentar que la ubicacion real queda reservada a app nativa/wrapper futuro si aporta al fichaje o contexto operativo.
- [x] Definir configuracion candidata por tenant/centro sin crear schema todavia.
- [x] Limitar los eventos candidatos a resultados minimos, no trayectos.
- [x] Mantener fallback manual y correcciones Fase F como mecanismo principal.
- [x] Documentar permiso, finalidad, minimizacion, retencion pendiente y limitaciones tecnicas.
- [x] Dejar claro que navegador/PWA no garantiza geofencing con app cerrada.
- [x] No tocar `src` ni crear migraciones.

#### G.2 - Decision tecnica/legal previa a implementacion

Estado: preparada el 2026-05-12 como fase documental de decision. Reclasificada el 2026-05-13 como decision tecnica/legal para app nativa/wrapper futuro. G.2 no abre lectura de ubicacion en webapp.

Schema candidato:

- [x] Usar `center_time_location_settings` como tabla candidata de configuracion por centro, separada de `centers`, para aislar permiso, version de politica y auditoria de cambios. Campos candidatos: `id`, `organization_id`, `center_id`, `status`, `center_latitude`, `center_longitude`, `radius_meters`, `max_accuracy_meters`, `timezone`, `policy_version`, `notice_text`, `retention_days`, `created_by_user_id`, `updated_by_user_id`, `activated_at`, `created_at`, `updated_at`.
- [x] Mantener `organization_id` obligatorio y FK compuesta contra `centers(id, organization_id)`; un centro no puede tener configuracion de ubicacion de otra organizacion.
- [x] Usar `time_location_events` como tabla candidata de eventos/evidencias minimizadas. Campos candidatos: `id`, `organization_id`, `time_record_id`, `time_punch_id`, `person_profile_id`, `actor_user_id`, `actor_membership_id`, `center_id`, `center_time_location_setting_id`, `policy_version`, `purpose`, `availability_status`, `assist_result`, `accuracy_bucket`, `distance_bucket`, `fallback_reason`, `captured_at`, `retain_until`, `created_at`.
- [x] Mantener `time_punch_id` opcional porque puede haber permiso denegado, ubicacion no disponible o fallback manual sin punch generado.
- [x] No reutilizar `time_audit_events.metadata` para evidencias de ubicacion. La auditoria generica puede registrar que existio accion de fichaje, pero no coordenadas ni payload de ubicacion.

Dato guardado:

- [x] Decision G.2: guardar resultado asistido y buckets, no distancia exacta ni coordenadas crudas del trabajador.
- [x] `assist_result`: `inside_radius`, `outside_radius`, `unknown` o `manual_fallback`.
- [x] `accuracy_bucket`: por ejemplo `lte_25m`, `lte_50m`, `lte_100m`, `lte_250m`, `gt_250m` o `unknown`.
- [x] `distance_bucket`: relativo al radio configurado, por ejemplo `inside_radius`, `outside_lte_25m`, `outside_lte_100m`, `outside_gt_100m` o `unknown`.
- [x] `time_punches.metadata` solo puede conservar un snapshot minimo si se necesita explicar el punch: `locationAssistVersion`, `centerId`, `assistResult` y, como maximo, buckets. No acepta JSON libre ni coordenadas.
- [x] Las coordenadas crudas del trabajador, si una implementacion futura las necesita para calcular el resultado, solo podran tratarse de forma transitoria en memoria de servidor o navegador, sin persistirlas, loguearlas ni enviarlas a auditoria. Persistirlas requeriria una decision nueva explicita.

Datos permitidos:

- [x] Coordenadas del centro dentro de `center_time_location_settings`, tratadas como configuracion sensible operativa y no como dato libre de UI.
- [x] Centro evaluado, politica/version, resultado, buckets de precision/distancia, motivo de fallback y actor/persona/registro dentro del tenant activo.
- [x] Timestamps necesarios para explicar el intento y aplicar retencion.

Datos prohibidos:

- [x] Coordenadas crudas del trabajador persistidas.
- [x] Trayectos, historial de movimientos, background location desde web/PWA, geofencing con app cerrada desde web/PWA, mapas/URLs/tokens, payload completo del navegador, BSSID/Wi-Fi/Bluetooth, IP como proxy de ubicacion o fingerprint de dispositivo.
- [x] Datos reales de ubicacion antes de revision legal/privacidad, RAT/registro de actividad si aplica, informacion al trabajador y prueba negativa de permisos/RLS.

Permisos y RLS/RPC esperadas:

- [x] `owner` activa o desactiva la politica tenant-level de ubicacion asistida.
- [x] `owner`/`admin` pueden mantener configuracion por centro solo mediante RPC acotada, si se implementa. `manager`, `center_manager`, `payroll_manager`, `staff` y `coach` no reciben este permiso por herencia.
- [x] La persona autenticada puede registrar y leer sus propios eventos minimizados solo mediante acciones/RPC que deriven `person_profile_id` desde `auth.uid()` + `organization_id`.
- [x] `owner`/`admin`/`manager` pueden ver eventos minimizados asociados a revision de fichaje solo si tienen capacidad de gestion de fichaje; no ven coordenadas porque no se guardan.
- [x] Representantes/Inspeccion quedan como exporte/acceso futuro controlado tras validacion legal, no como rol de app generico.
- [x] RLS esperada en `center_time_location_settings`: lectura completa solo a roles de configuracion; lectura resumida de estado/aviso si la UI futura necesita mostrarlo; escritura directa revocada.
- [x] RLS esperada en `time_location_events`: lectura propia para la persona afectada, lectura de gestion limitada para capacidades de fichaje, escritura directa revocada o limitada a RPC segura.
- [x] RPCs candidatas: `upsert_center_time_location_setting`, `set_center_time_location_setting_status`, `record_own_time_location_event`, `list_own_time_location_events`, `list_time_location_events_for_record`.
- [x] Ninguna accion propia debe aceptar `person_profile_id`; cualquier `center_id`, `time_record_id` o `time_punch_id` recibido debe validarse dentro de la organizacion activa.
- [x] No usar `service_role` en `src` ni en helpers normales.

Retencion:

- [x] `time_records`, `time_punches`, correcciones y auditoria canonica mantienen la politica legal de fichaje pendiente/candidata de 4 anos cuando aplique.
- [x] `time_location_events` no debe heredar automaticamente 4 anos: retencion operativa candidata de 90 dias para eventos con resultado/buckets y 30 dias para permiso denegado/no disponible, salvo retencion legal explicita o bloqueo por disputa/exporte.
- [x] Cada fila de `time_location_events` debe tener `retain_until`; cualquier purga futura debe borrar o anonimizar eventos de ubicacion sin borrar el punch canonico.
- [x] El snapshot minimo en `time_punches.metadata`, si se decide usar, queda reducido a resultado/version/centro y no conserva coordenadas ni distancia exacta.

No incluye:

- migraciones reales;
- UI de mapa;
- lectura real de `navigator.geolocation`;
- fichaje automatico;
- geofencing;
- app nativa implementada;
- tracking continuo;
- historial de movimientos;
- fichaje automatico fiable con app cerrada desde navegador/PWA;
- payroll, horas extra automaticas, exportes legales ni promesa de cumplimiento legal definitivo.

Dependencias antes de abrir implementacion:

- revision legal/privacidad de base juridica, proporcionalidad, informacion al trabajador, RAT/registro de actividad y formato de acceso/exporte;
- pruebas de precision real en interior/exterior por centro;
- copy de aviso, denegacion, fallback y disputa;
- migration plan con RLS, RPC, retencion y tests negativos;
- decision de producto sobre si el valor comercial justifica app nativa con ubicacion o basta con fichaje web manual/automatico por planificacion/correcciones.

Verificacion G.2 2026-05-12:

- [x] Documentacion actualizada sin tocar `src`.
- [x] Sin migraciones nuevas.
- [x] Sin lectura real de `navigator.geolocation`.
- [x] Decision tomada: resultado + buckets, no distancia exacta ni coordenadas crudas persistidas.
- [x] Decision 2026-05-13: no implementar `navigator.geolocation` en webapp; reservar geolocalizacion real para app nativa/wrapper futuro.
- [x] Consistencia revisada entre PROJECT_BRIEF, TASKS, roadmap, domain model, security baseline, legal/privacy y matriz de permisos.

#### G.3 - Base tecnica schema/RPC/RLS de ubicacion asistida

Estado: implementada el 2026-05-12 como base tecnica sin superficie visible.

- [x] Crear `supabase/migrations/00018_time_location_assist_foundation.sql`.
- [x] Crear `center_time_location_settings` con `organization_id` obligatorio, FK compuesta a `centers`, coordenadas del centro, radio, precision maxima, timezone, version de politica, aviso, retencion general, retencion fallback y auditoria minima de creacion/actualizacion/activacion.
- [x] Crear `time_location_events` con evidencia minimizada: disponibilidad, resultado asistido, buckets de precision/distancia, fallback, persona/actor/centro/setting/punch/record opcionales y `retain_until` obligatorio.
- [x] No crear columnas para coordenadas crudas del trabajador, distancia exacta, precision exacta reportada, payload de navegador, mapas, tokens, IP como ubicacion, BSSID/Wi-Fi/Bluetooth ni fingerprint.
- [x] No reutilizar `time_audit_events.metadata` para ubicacion ni ampliar sus claves permitidas.
- [x] Definir RLS: configuracion completa solo para `owner`/`admin`, activacion nueva solo por `owner`, eventos propios para la persona afectada y eventos de gestion solo mediante permisos existentes de fichaje (`owner`/`admin`/`manager`).
- [x] Mantener escritura directa no concedida sobre las dos tablas; las mutaciones pasan por RPCs `SECURITY DEFINER` acotadas.
- [x] Crear RPCs: `upsert_center_time_location_setting`, `set_center_time_location_setting_status`, `record_own_time_location_event`, `list_own_time_location_events` y `list_time_location_events_for_record`.
- [x] `record_own_time_location_event` no acepta `person_profile_id`; deriva persona desde `auth.uid()` + `organization_id` y valida `center_id`, `time_record_id` y `time_punch_id` dentro del tenant.
- [x] Regenerar `src/types/supabase.ts` con `npm run supabase:types`.

Verificacion G.3 2026-05-12:

- [x] `npm run supabase:reset`.
- [x] `npm run supabase:types`.
- [x] `npm run typecheck`.
- [x] `npm run lint`.
- [x] `rg -n "navigator.geolocation" src` sin coincidencias.
- [x] `rg -n "service_role" src` sin coincidencias.
- [x] `rg -n "STL" src` sin coincidencias.
- [x] Revision manual: la migracion solo persiste coordenadas del centro en configuracion; los eventos no tienen coordenadas crudas del trabajador, distancia exacta, payload libre ni metadata JSON.

#### G.4 - Capa server/app interna de ubicacion asistida

Estado: implementada el 2026-05-12 como helpers internos sin superficie visible.

- [x] Crear `src/lib/time-location.ts` como capa server-side tipada sobre las RPCs de G.3.
- [x] Exponer helpers internos: `getCenterTimeLocationSettings`, `upsertCenterTimeLocationSetting`, `setCenterTimeLocationSettingStatus`, `recordOwnTimeLocationEvent`, `listOwnTimeLocationEvents` y `listTimeLocationEventsForRecord`.
- [x] Usar solo el cliente Supabase normal con sesion (`createClient`); no introducir `service_role` en `src`.
- [x] Mantener las acciones propias sin `person_profile_id`: la persona se deriva de sesion + organizacion activa y la RPC vuelve a validarlo.
- [x] Validar en app `organizationId`, `centerId`, `timeRecordId` y `timePunchId` antes de llamar a RPC cuando el cliente con sesion puede comprobarlo razonablemente.
- [x] Mantener evidencia minimizada: enums/buckets, fallback, centro/registro/punch opcionales y sin payload libre, coordenadas crudas del trabajador, distancia exacta, IP, BSSID/Wi-Fi/Bluetooth ni fingerprints.
- [x] Anadir permisos internos `canManageTimeLocationSettings` y `canActivateTimeLocationSettings`, alineados con G.3 (`owner`/`admin` mantienen; activacion nueva solo `owner`).
- [x] No crear UI visible, rutas nuevas de producto, hooks cliente, lectura de ubicacion real, mapa, geofencing ni fichaje automatico.

Verificacion G.4 2026-05-12:

- [x] `npm run typecheck`.
- [x] `npm run lint`.
- [x] `rg -n "navigator.geolocation" src` sin coincidencias.
- [x] `rg -n "service_role" src` sin coincidencias.
- [x] `rg -n "STL" src` sin coincidencias.
- [x] `rg -n "latitude|longitude|coordinate|geolocation|gps|accuracy|distance|payload|bssid|bluetooth|wifi|wi-fi|fingerprint|ip" src` revisado manualmente: las coincidencias nuevas estan limitadas a coordenadas del centro configurado y buckets; no se guarda payload ni coordenadas crudas del trabajador.
- [x] No hay patron de unit tests para helpers server puros fuera de smoke/Playwright; la verificacion queda cubierta por typecheck, lint y revision manual de minimizacion/permisos.

### Fase H - PWA/App Movil Y Geofencing Nativo

Objetivo: preparar estrategia movil sin priorizar nativo antes de validar web/MVP operativo.

Alcance:

- navegador/PWA responsive inicial;
- arquitectura preparada para App Store y Google Play;
- evaluacion posterior de Capacitor/Ionic, React Native/Expo u otra estrategia;
- licencias developer Apple/Google como dependencia futura;
- geofencing nativo solo si el caso comercial lo exige.

No incluye:

- publicacion nativa temprana;
- prometer automatismos de app cerrada desde web/PWA;
- reescritura movil completa sin decision de producto.

Dependencias:

- validacion comercial de fichaje automatico;
- decision tecnica de wrapper/nativo;
- politica de privacidad compatible con ubicacion;
- cuentas Apple Developer y Google Play.

Criterio de salida:

- [x] Estrategia movil elegida y documentada.
- [x] PWA cubre uso diario basico online en rutas criticas moviles.
- [x] Costes/licencias/store review documentados.
- [x] Geofencing nativo queda condicionado a motivo comercial claro, privacidad/legal y presupuesto de mantenimiento.

#### H.1 - Preparacion PWA/Movil Segura

Estado: primer corte implementado el 2026-05-13. H.1 prepara instalacion/acceso rapido desde navegador sin abrir app nativa, push, geolocalizacion web ni soporte offline.

Revision de estado:

- [x] `src/app/layout.tsx` tenia metadata minima (`title`/`description`) y no declaraba manifest, mobile web app metadata ni theme color explicito.
- [x] No existia `public/`, manifest web ni patron previo de iconos de aplicacion.
- [x] La shell protegida ya es mobile-first: header movil, safe-area bottom y bottom navigation en `/app`.
- [x] Rutas criticas moviles existentes: `/app`, `/app/time`, `/app/schedule`, `/app/coverage`, `/app/more` y `/app/account`.
- [x] La navegacion movil conserva Inicio, Horario, Equipo y Mas para `coach`; Cobertura aparece en el menu principal solo para `owner`/`admin`/`manager`. `/app/time` y `/app/account` quedan agrupadas bajo Mas/Personal, no como items diarios nuevos.
- [x] No hay soporte offline explicito ni service worker de aplicacion.
- [x] `rg -n "navigator.geolocation" src` sin coincidencias antes del corte.

Decision H.1:

- PWA queda como mejora de instalacion/acceso rapido para la web responsive, no como app nativa ni promesa de background.
- No se implementa service worker hasta tener una politica segura de cache. Por ahora BoxOps no cachea respuestas autenticadas, datos tenant-scoped, signed URLs, fichajes, documentos, perfiles, firmas ni exportes.
- No se implementan push notifications reales, Notification API, PushManager, background sync ni notificaciones del sistema.
- No se implementa `navigator.geolocation`, mapas, geofencing, IP/Wi-Fi/Bluetooth ni ubicacion real desde web/PWA.
- PWA no sustituye app nativa/wrapper para geofencing/background location/push con app cerrada. Esa decision queda para una fase posterior con privacidad, stores y requisito comercial claro.

Implementacion:

- [x] Anadir metadata generica de BoxOps en `src/app/layout.tsx`: `applicationName`, descripcion, `manifest`, `appleWebApp`, `formatDetection` y viewport/theme color.
- [x] Anadir `src/app/manifest.ts` con `start_url = "/app"`, `display = "standalone"`, scope generico, colores de marca y categorias conservadoras.
- [x] Anadir icono SVG generico `src/app/icon.svg` sin tenant ni datos reales.
- [x] Anadir `Cache-Control: no-store` para `/app` y `/app/:path*` en `next.config.ts`.
- [x] Mantener la app sin service worker y sin cache offline privada.

Verificacion H.1:

- [x] `npm run typecheck`.
- [x] `npm run lint`.
- [x] `npm run build` genera `/manifest.webmanifest` e `/icon.svg` como rutas estaticas.
- [x] `rg -n "navigator.geolocation|serviceWorker|service worker|PushManager|Notification|background sync|caches\\.|CacheStorage" src` sin coincidencias.
- [x] `rg -n "service_role" src` sin coincidencias.
- [x] `rg -n "STL" src` sin coincidencias.

#### H.2 - Auditoria Mobile/PWA Segura De Rutas Criticas

Estado: ejecutada el 2026-05-13 tras H.1. H.2 valida la PWA como mejora online de instalacion/acceso rapido a la web responsive, sin service worker, offline privado, push, ubicacion web, app nativa ni promesa legal definitiva.

Alcance auditado:

- [x] Rutas criticas moviles: `/app`, `/app/time`, `/app/schedule`, `/app/coverage`, `/app/more` y `/app/account`.
- [x] Viewports moviles: 390x844 y 375x812 con Playwright contra `http://127.0.0.1:3003`.
- [x] Revision adicional de solo lectura en 375x812 con rol `coach` local demo para Inicio, Horario, Cobertura y Mi fichaje.
- [x] Manifest e icono servidos en dev y generados por build: `/manifest.webmanifest` e `/icon.svg`.
- [x] Headers/cache de rutas protegidas revisados en dev y produccion local.

Hallazgos:

- [x] Sin overflow horizontal de pagina en las seis rutas criticas en 390x844 ni 375x812. Las vistas densas de fichaje/semana usan scroll interno controlado cuando corresponde, sin ensanchar el documento.
- [x] Navegacion inferior usable: 5 items, targets moviles de 64-67px x 58px en los viewports auditados, estado activo visible y sin duplicar navegacion principal.
- [x] Header movil y safe areas correctos: header sticky visible, altura de 53px y `safe-area-inset-top` aplicado desde la shell protegida.
- [x] Bottom nav no bloquea el final de formularios/listas: el `main` conserva clearance inferior y Playwright confirma que el ultimo bloque visible queda por encima de la bottom nav al final del scroll. En capturas full-page la nav fija puede superponerse visualmente a contenido intermedio, pero los controles se pueden desplazar y no quedan atrapados al final de la pagina.
- [x] Empty/loading/error/readonly siguen legibles por revision de codigo y browser: loading skeleton general, loading especifico de fichaje, error boundary protegido, empty states de horario/cobertura/fichaje/cuenta y modo lectura de horario para rol sin permiso.
- [x] Copy critico de fichaje mantiene limites: manual/automatico por planificacion, sin geolocalizacion, sin payroll, sin horas extra aprobadas automaticamente y sin garantia legal definitiva.
- [x] Browser audit confirma 0 service workers registrados y `CacheStorage` sin keys para la sesion auditada.
- [x] Produccion local con `next start` confirma `Cache-Control: no-store` y `Pragma: no-cache` en `/app` y las seis subrutas protegidas auditadas. En dev, Next sigue mostrando `Cache-Control: no-cache, must-revalidate` para documentos dinamicos autenticados, pero el redirect anonimo y la produccion local quedan en `no-store`.

Implementacion H.2:

- [x] Endurecer `src/lib/supabase/proxy.ts` para aplicar `Cache-Control: no-store` y `Pragma: no-cache` a respuestas protegidas y redirects de `/app`, ademas del header ya declarado en `next.config.ts`.
- [x] No se anaden dependencias.
- [x] No se implementa `navigator.geolocation`, mapas, geofencing, IP/Wi-Fi/Bluetooth, service worker, Background Sync, Notification API, PushManager, CacheStorage de app, app nativa/wrapper ni stores.

Deuda bloqueante antes de piloto:

- Ninguna deuda mobile/PWA nueva bloqueante detectada en H.2. Siguen vigentes los bloqueos operativos S.7 para piloto real: accesos Supabase/Auth/SMTP reales, email controlado, credenciales E2E/admin/owner y jobs reales pendientes.

Mejoras recomendables:

- Convertir el barrido mobile/PWA de estas seis rutas en smoke visual automatizado cuando existan credenciales E2E estables.
- Repetir el audit con datos reales validados del piloto o fixture anonimizado largo: nombres extensos de centros, actividades, notas y personas.
- Anadir variantes PNG/multiples tamanos de icono antes de polish de instalacion movil avanzado, aunque el SVG actual se sirve correctamente como icono generico.
- Registrar en el audit futuro capturas de rol `coach` y `admin` con la misma matriz de viewports para cubrir readonly de forma recurrente.

Deuda futura para nativo/wrapper:

- Service worker solo si existe una allowlist segura de assets publicos y politica explicita que excluya respuestas autenticadas, datos tenant-scoped, documentos, fichajes, firmas, signed URLs y exportes.
- Push, notificaciones del sistema, background sync, geofencing/background location y stores quedan reservados a fase nativa/wrapper o push propia, con permisos, privacidad, revision legal y requisito comercial claro.

Evidencia H.2:

- Capturas y JSON locales en `test-results/h2-mobile-pwa-audit-2026-05-13/`.
- Cuentas locales demo temporales usadas solo para browser audit y limpiadas al final, sin tocar datos reales STL.

Verificacion H.2:

- [x] `npm run typecheck`.
- [x] `npm run lint`.
- [x] `npm run build`.
- [x] `E2E_BASE_URL=http://127.0.0.1:3005 npm run test:smoke` con servidor dev temporal: 24 passed y 9 skipped por falta de credenciales E2E autenticadas.
- [x] Playwright/browser contra dev en 390x844 y 375x812 para `/app`, `/app/time`, `/app/schedule`, `/app/coverage`, `/app/more` y `/app/account`.
- [x] Playwright/browser contra produccion local en 375x812 para manifest, icono, headers `no-store`, ausencia de service worker/cache y rutas criticas.
- [x] `rg -n "navigator\\.geolocation|serviceWorker|service worker|PushManager|Notification|background sync|caches\\.|CacheStorage" src` sin coincidencias.
- [x] `rg -n "service_role" src` sin coincidencias.
- [x] `rg -n "STL" src` sin coincidencias.

#### H.3 - Cierre Documental De Estrategia Movil/Nativo/Stores

Estado: cerrado documentalmente el 2026-05-13 tras H.2. No se toca `src`, no se anaden dependencias, no se crea app nativa/wrapper, no se implementa service worker, offline privado, push, `navigator.geolocation`, mapas ni geofencing. La decision vigente queda: corto plazo web responsive + PWA online segura; medio plazo evaluar wrapper/nativo solo si el negocio lo exige; largo plazo geofencing/background location/push nativo solo con privacidad/legal/stores y presupuesto aceptados.

Decision H.3:

- Corto plazo: mantener BoxOps como web responsive con PWA online de instalacion/acceso rapido. La PWA no cachea respuestas autenticadas, no funciona offline con datos privados, no envia push del sistema y no pide ubicacion web.
- Medio plazo: evaluar wrapper/nativo solo si aparece requisito comercial validado que la web/PWA no pueda cubrir: geofencing fiable con app cerrada, push del sistema obligatorio, presencia en stores o experiencia offline real.
- Largo plazo: cualquier geofencing/background location/push nativo sera fase propia con permisos iOS/Android, politica de privacidad, revision legal, review de stores, QA por plataforma y frontera de tenant intacta.
- La app web sigue usando avisos in-app como canal principal; push movil no sustituye ni relaja esos avisos.
- No se presenta PWA, fichaje, geofencing, push ni app nativa como cumplimiento legal definitivo.

Comparativa de opciones futuras, sin implementar:

| Opcion | Uso recomendado | Coste/riesgo principal | Estado H.3 |
|---|---|---|---|
| PWA web | Uso diario online, acceso rapido, menor mantenimiento | Sin geofencing fiable con app cerrada, sin push nativo, sin offline privado hasta politica segura | Opcion elegida a corto plazo |
| Capacitor/Ionic wrapper | Reutilizar web con shell nativa si stores, push o plugins nativos se vuelven necesarios | QA iOS/Android, permisos nativos, riesgo de cache/offline mal aislado, review de stores | Evaluar solo con requisito comercial |
| React Native/Expo | Experiencia movil mas nativa y acceso a APIs de dispositivo con arquitectura propia | Reimplementacion parcial de UI, mayor coste de equipo, sincronizacion con web/backend | Futuro si wrapper web no basta |
| App nativa especifica | Maxima integracion con iOS/Android para geofencing/background location/push | Mayor coste inicial y recurrente, releases por plataforma, store review y soporte | Ultimo recurso justificado por negocio |
| No-app / web-only | Mantener foco MVP y evitar stores mientras la web cubra el caso | Sin presencia store ni automatismos con app cerrada | Valido si piloto no exige nativo |

Costes y dependencias futuras a revalidar al abrir fase nativa:

- Apple Developer Program: coste oficial consultado el 2026-05-13 de 99 USD por ano de membresia; validar moneda/tarifa vigente al contratar.
- Google Play Console: coste oficial consultado el 2026-05-13 de 25 USD como registro unico; validar tarifa vigente al contratar.
- App Store Review y Google Play review: preparar builds completas, cuentas demo/reviewer, metadata, iconos, screenshots, versionado, firma/certificados, politicas de datos y respuestas de privacidad.
- Politica de privacidad publica y accesible desde app/store; App Store Connect exige URL de privacy policy y respuestas de privacidad actualizadas; Google Play exige politica y disclosures cuando hay datos personales/sensibles o permisos como ubicacion.
- Permisos moviles: iOS requiere usage descriptions para ubicacion y autorizaciones adecuadas; Android/Google Play revisa especialmente background location, disclosure prominente, formulario de permisos, video de demostracion y core functionality.
- Push nativo: definir APNs/FCM, consentimiento/opt-in, outbox/cola de notificaciones, bajas, auditoria minima de envio y fallback in-app.
- Mantenimiento: QA por plataforma, dispositivos reales, pruebas de permisos, releases, crash reporting, actualizaciones de SDK, cambios de politicas de stores y soporte de usuarios.

Criterios para elevar nativo/wrapper:

- geofencing fiable con app cerrada o en segundo plano es requisito comercial validado y no viable en web/PWA;
- push del sistema es obligatorio para una operativa critica y los avisos in-app no bastan;
- experiencia offline real es necesaria y existe politica segura que excluye o cifra/limita datos autenticados, tenant-scoped, documentos, fichajes, firmas, signed URLs y exportes;
- hay cliente/piloto que valida el valor y acepta alcance, privacidad y limites;
- presupuesto de desarrollo, mantenimiento, QA, cuentas developer y soporte por plataforma queda aprobado;
- legal/privacidad valida finalidad, minimizacion, retencion, permisos y comunicacion antes de datos reales;
- la arquitectura preserva `organization_id`, RLS, permisos server-side y ausencia de `service_role` en `src`.

Deuda bloqueante antes de piloto:

- Ninguna deuda mobile/PWA nueva bloqueante desde H.3. Siguen vigentes los bloqueos operativos S.7 ajenos a mobile: accesos Supabase/Auth/SMTP reales, email controlado, credenciales E2E/admin/owner y jobs reales pendientes.

Mejoras recomendables:

- Automatizar el smoke visual mobile/PWA de H.2 cuando existan credenciales E2E estables.
- Repetir audit con datos reales validados o fixture anonimizado largo.
- Anadir iconos PNG/multiples tamanos y screenshots de instalacion antes de polish avanzado de PWA.
- Preparar borrador de privacy policy/store metadata antes de cualquier fase nativa, sin prometer geofencing/push todavia.

Deuda futura para nativo/wrapper:

- Cuentas Apple/Google, certificados, signing, builds, stores, review y soporte de releases.
- Decision de stack: Capacitor/Ionic, React Native/Expo, nativo especifico o seguir web-only.
- Push nativo/APNs/FCM y permisos/opt-in, con fallback in-app.
- Geofencing/background location con permisos del sistema operativo, disclosure, retencion y evidencias minimizadas.
- Offline real con politica segura de cache/sincronizacion, pruebas de perdida de red y bloqueo de datos privados en caches inseguras.
- QA por plataforma/dispositivo y revision recurrente de politicas de stores.

Verificacion H.3:

- [x] `npm run typecheck`.
- [x] `npm run lint`.
- [x] `npm run build`.
- [x] `rg -n "navigator\\.geolocation|serviceWorker|service worker|PushManager|Notification|background sync|caches\\.|CacheStorage" src` sin coincidencias.
- [x] `rg -n "service_role" src` sin coincidencias.
- [x] `rg -n "STL" src` sin coincidencias.

#### H.4 - Recordatorios Nativos De Proxima Clase

Estado: fase futura documentada el 2026-05-14. No se implementa en web/PWA, no se toca service worker, Notification API, PushManager, background sync, caches ni app nativa real en este corte.

Objetivo futuro:

- [ ] Enviar recordatorio nativo el dia anterior sobre las 21:00 para la proxima clase/bloque asignado.
- [ ] Enviar recordatorio nativo 1 hora antes del inicio del bloque asignado.
- [ ] Calcular recordatorios desde `schedule_blocks` + `schedule_block_assignments`, solo con `assignment_status = 'assigned'`.
- [ ] Excluir siempre bloques `cancelled` y `completed`.
- [ ] Respetar timezone del tenant y, si el bloque tiene centro con timezone propio, timezone del centro.
- [ ] Pedir permisos opt-in por usuario/dispositivo y permitir revocacion clara.
- [ ] Mantener fallback in-app si no hay permiso, no hay token de dispositivo, falla entrega o el canal nativo no existe.
- [ ] Disenar outbox tenant-scoped para recordatorios futuros, con scheduler/worker controlado e idempotencia por asignacion/bloque/tipo de recordatorio.
- [ ] Integrar APNs/FCM solo en fase nativa/wrapper o push movil propia, con payloads minimizados.
- [ ] Registrar auditoria minima de envio, entrega/fallo y bajas de dispositivo sin guardar datos sensibles ni payloads largos.

No incluye H.4:

- [ ] Web push, Notification API, PushManager, service worker, background sync, CacheStorage ni caches de respuestas autenticadas.
- [ ] App nativa real o publicacion en stores.
- [ ] Geolocalizacion, geofencing, ubicacion, payroll, horas extra aprobadas o cumplimiento legal definitivo.
- [ ] Payloads con documentos, datos laborales sensibles, ubicacion, signed URLs, notas largas ni datos reales/hardcodeados de tenant.

Gates antes de implementar:

- [ ] Cerrar decision tecnica de wrapper/nativo y APNs/FCM.
- [ ] Cerrar privacidad/legal, opt-in, politica de retencion, baja de dispositivo y soporte por plataforma.
- [ ] Definir schema/RLS/RPC o backend de outbox con `organization_id` obligatorio.
- [ ] Anadir pruebas negativas de tenant, permisos, payload minimizado e idempotencia.

### Fase I - Cambios, Ausencias, Eventos, Horas Extra E IA

Objetivo: reordenar modulos ya previstos tras la base operativa, seguridad, RRHH, documentos y fichaje inicial.

Alcance:

- cambios de turno/clase y cobertura entre coaches;
- auditoria operativa corta de cambios sobre bloques, asignaciones de coaches y plantillas;
- ausencias, vacaciones y permisos;
- eventos, festivos y competiciones;
- horas extra detectadas/validadas/cerradas;
- IA sobre programacion solo cuando documentos y horarios esten modelados.

No incluye:

- IA temprana, payroll completo, CRM de alumnos o marketplace de coaches.

Dependencias:

- permisos avanzados;
- horarios/fichaje si impactan horas;
- documentos/certificaciones si condicionan asignaciones;
- validacion comercial de prioridades.

Criterio de salida:

- [ ] Cada submodulo tiene task propia y criterio de auditoria.
- [x] I.1-I.8 cubren el primer workflow minimo de solicitudes/ofertas de cambio/cobertura: modelo, DB/RLS/RPC, verificacion con rollback, helper server-side, bandeja visible, creacion atomica y hardening UX/app.
- [x] I.9-I.10 cubren el primer corte de ausencias/vacaciones/permisos: modelo documental, foundation DB/RLS/RPC, impacto calculado al vuelo y verificacion negativa con rollback, sin UI ni datos reales.
- [x] I.11 cubre la capa interna server/app para consumir ausencias mediante helper tipado sin UI visible, sin escrituras directas y sin persistir impactos.
- [x] I.12 abre la primera bandeja visible protegida de ausencias en `/app/absences`, enlazada desde Mas/sidebar, con lectura propia, cola de gestion e impacto calculado al vuelo, sin formulario de nueva ausencia ni calendario.
- [x] I.13 abre creacion minima de solicitud propia desde `/app/absences` mediante `createOwnAbsenceRequest(...)`, sin crear para otra persona, sin calendario, sin saldos legales y sin resolver cobertura.
- [x] I.14 endurece `/app/absences` con filtros GET, validacion visible, estados no accionables y copy prudente, sin cambiar schema/RLS/RPC ni ampliar dominio.
- [x] I.15 cubre QA/hardening tecnico de regresion para `/app/absences` posterior a I.14, con smoke/guardrails de permisos, query string y limites de seguridad, sin abrir calendario, saldos, cobertura automatica ni creacion ajena.
- [ ] Cambios y ausencias actualizan cobertura de forma trazable.
- [ ] Cambios de bloque/asignacion/plantilla quedan consultables por admins durante una ventana corta con actor, accion y campos cambiados minimizados.
- [ ] Horas extra no se presentan como nomina ni calculo fiscal.
- [ ] IA queda subordinada a documentos/programacion utiles.

#### I.1 - Modelado Documental Seguro De Cambios/Cobertura

Estado: documentado el 2026-05-13. No se implementa schema, migraciones, UI, Server Actions, seeds ni dependencias. I.1 deja el modelo de producto y seguridad para cambios de turno/clase y cobertura entre coaches, porque es la primera pieza logica de Fase I que conecta con horarios, asignaciones y cobertura MVP 1.

Revision de estado:

- [x] Fase F ya cubre fichaje manual/automatico por planificacion, cierre semanal, avisos in-app y exporte interno revisable, sin payroll ni horas extra aprobadas automaticamente.
- [x] Fase G deja ubicacion como capacidad futura nativa/wrapper; la web no pide ubicacion.
- [x] Fase H deja PWA online segura, sin service worker, offline privado, push ni ubicacion web.
- [x] MVP 1 mantiene `schedule_blocks` y `schedule_block_assignments` como fuentes canonicas del horario real y cobertura.
- [x] Existe guardrail Postgres anti-solape para coaches `assigned`; I.1 no lo relaja ni lo sustituye por UI.

Alcance I.1:

- modelar solicitud de cambio sobre bloque propio asignado;
- modelar peticion de cobertura a un coach concreto;
- modelar oferta abierta a varios coaches disponibles/candidatos;
- modelar aceptacion o rechazo por coach receptor/candidato;
- modelar aprobacion o rechazo por `owner`, `admin` o `manager` cuando aplique por politica operativa;
- definir aplicacion trazable al horario real mediante cambio controlado de `schedule_block_assignments`;
- definir historial/auditoria operativa minima de la solicitud sin payloads completos.

Actores y permisos candidatos:

- coach solicitante: puede crear/cancelar solicitudes propias sobre bloques asignados activos de su tenant, pero no aplicar cambios finales directamente al horario real salvo politica futura explicita;
- coach receptor/candidato: puede aceptar o rechazar ofertas dirigidas a su perfil o abiertas a su grupo disponible, sin ver datos de otro tenant ni aceptar si la revalidacion detecta solape/no disponibilidad;
- `owner`, `admin` y `manager`: pueden revisar, aprobar, rechazar y aplicar solicitudes dentro del tenant activo; la aplicacion debe revalidar bloque, asignaciones, disponibilidad y permisos en servidor/DB;
- `center_manager`: rol futuro reconocido solo como candidato; no se activa en I.1 hasta tener frontera por centro en schema/RLS/UX;
- roles no operativos o futuros (`staff`, `payroll_manager`, `document_admin`) no reciben permisos por herencia en cambios/cobertura.

Estados candidatos:

- `draft`, si se permite guardar borrador antes de ofrecer;
- `pending`, solicitud creada y pendiente de ser ofrecida o evaluada;
- `offered`, oferta enviada a coach concreto o varios candidatos;
- `accepted_by_coach`, un coach acepta cubrir/cambiar, todavia sin aplicar al horario;
- `rejected_by_coach`, receptor/candidato rechaza;
- `pending_approval`, requiere aprobacion de gestion antes de aplicar;
- `approved`, aprobado por gestion pero aun no aplicado al horario real;
- `rejected`, rechazado por gestion;
- `applied`, aplicado trazablemente a `schedule_block_assignments`;
- `cancelled`, cancelado por solicitante o gestion antes de aplicarse;
- `expired`, caducado por ventana temporal o bloque ya no accionable.

Entidades candidatas sin migrar:

- `change_requests`: cabecera tenant-scoped de la solicitud, con `organization_id`, bloque afectado, coach solicitante, tipo, estado, politica de aprobacion y referencias al resultado aplicado;
- `change_request_targets` u `offers`: destinatarios/candidatos de una solicitud, con coach receptor opcional, estado por candidato y timestamps de respuesta;
- `change_request_events`: historial minimo de transiciones, ofertas, aceptaciones, rechazos, aprobaciones y aplicacion;
- relacion con `schedule_blocks`: toda solicitud apunta a un bloque real del tenant activo y no a una plantilla como fuente final;
- relacion con `schedule_block_assignments`: la aplicacion final crea/reactiva/retira asignaciones mediante flujo transaccional, no mediante sobrescritura silenciosa.

Invariantes:

- toda entidad futura incluye `organization_id` obligatorio desde la primera migracion;
- bloque, asignaciones, coaches, personas y memberships deben pertenecer al tenant activo;
- ninguna solicitud se aplica sin revalidar bloque activo, estado de asignacion, solapes, disponibilidad y permisos en el momento de aplicar;
- no se borra historial critico de solicitudes, respuestas ni aplicacion; cancelaciones/rechazos son estados;
- aplicar un cambio no debe romper `schedule_block_assignments` ni el guardrail Postgres anti-solape;
- los detalles operativos usan auditoria minimizada: ids, actor, accion, resultado, campos tocados y timestamps, no payloads completos, notas extensas, datos laborales sensibles ni ubicacion.

Decisiones:

- I.1 separa cambios/cobertura de ausencias: una ausencia puede originar necesidad de cobertura, pero vive en el dominio propio abierto despues en I.9/I.10 como `absence_requests`.
- I.1 separa cambios/cobertura de payroll y horas extra: aceptar un bloque no aprueba horas extra, no genera nomina y no equivale a calculo laboral definitivo.
- La aprobacion de gestion es operativa, no documento firmable ni garantia legal definitiva.
- La fuente canonica del horario real sigue siendo `schedule_blocks` + `schedule_block_assignments`; `change_requests` seria workflow y trazabilidad, no el horario final.
- La auditoria de cambio debe ser propia o derivada de `change_request_events`; `operational_audit_events` puede recibir eventos minimizados de aplicacion, pero no debe almacenar el payload completo de la solicitud.

No incluye:

- schema, migraciones, RLS, RPCs, Server Actions, UI, notificaciones nuevas, seeds o datos reales;
- modulo de ausencias, vacaciones, permisos, bajas o disponibilidad laboral;
- payroll, calculo automatico/aprobado de horas extra, cierres mensuales o exportes legales;
- documentos firmables, firmas de solicitud o firma electronica;
- IA, recomendaciones automaticas, ranking inteligente de coaches o marketplace;
- push, ubicacion, geofencing, mapas, service worker u offline privado;
- promesa de cumplimiento laboral definitivo.

Deuda bloqueante antes de piloto de cambios/cobertura:

- migracion con `organization_id`, FKs tenant-safe, constraints de estado/tipo y RLS desde el primer corte tecnico;
- helper de permisos/capacidades para solicitante, receptor/candidato y gestion, sin activar `center_manager` hasta tener alcance por centro;
- primitiva transaccional de aplicacion que revalide tenant, bloque, asignaciones, solape y disponibilidad antes de tocar `schedule_block_assignments`;
- pruebas negativas de otro tenant, rol sin permiso, coach no candidato, bloque cancelado/completado, solicitud expirada y solape `coach-unavailable`;
- decision de retencion/consulta de `change_request_events` y si `manager` puede leer historial completo o solo solicitudes operativas.

Mejoras recomendables:

- vista inbox/cola de solicitudes para coach y gestion despues de cerrar schema/RLS;
- calculo server-side de candidatos disponibles reutilizando disponibilidad Postgres y filtros de centro/tipo;
- avisos in-app reutilizando patrones de Inicio, sin abrir push;
- integracion minimizada con `operational_audit_events` para la aplicacion final al horario.

Deuda futura para ausencias/eventos/horas extra/IA:

- capa app/server y calendario visible de ausencias sobre `absence_requests`, manteniendo permisos/laboral propios;
- eventos/festivos/competiciones como bloques o entidades especificas segun impacto operativo;
- deteccion y validacion de horas extra desde planificacion/fichaje/cambios, sin payroll;
- IA solo cuando programacion, documentos y horarios tengan datos fiables y permisos definidos.

Verificacion I.1:

- [x] `npm run typecheck`.
- [x] `npm run lint`.
- [x] `npm run build`.
- [x] `rg -n "service_role" src` sin coincidencias.
- [x] `rg -n "STL" src` sin coincidencias.
- [x] `rg -n "navigator\\.geolocation|serviceWorker|service worker|PushManager|Notification|background sync|caches\\.|CacheStorage" src` sin coincidencias.
- [x] Confirmado que I.1 no cambia `src`, migraciones, seeds, dependencias ni datos reales.

#### I.2 - Primera Base Tecnica Segura De Cambios/Cobertura

Estado: implementado el 2026-05-13 como base DB/RLS/RPC minima, sin UI visible, sin Server Actions de producto, sin seeds, sin notificaciones y sin aplicar todavia cambios al horario real. La migracion `supabase/migrations/00027_change_requests_foundation.sql` crea el workflow tenant-scoped para solicitudes de cambio/cobertura entre coaches.

Alcance I.2:

- [x] Crear `change_requests` con `organization_id` obligatorio, bloque real afectado, asignacion origen, coach/persona/membership solicitante, tipo, estado, aprobacion requerida y referencias futuras a target aceptado/aplicacion.
- [x] Crear `change_request_targets` como ofertas/candidatos por coach concreto, con `organization_id`, tipo, estado y respuesta minimizada.
- [x] Crear `change_request_events` como auditoria propia minimizada del workflow, con actor derivado desde `auth.uid()` + membership/persona/coach cuando aplica.
- [x] Definir checks de tipos y estados candidatos de I.1: `draft`, `pending`, `offered`, `accepted_by_coach`, `rejected_by_coach`, `pending_approval`, `approved`, `rejected`, `applied`, `cancelled` y `expired`.
- [x] Definir checks para tipos de solicitud (`own_block_change`, `direct_coverage_request`, `open_coverage_request`, `coverage_request`, `swap`, `offer_block`) y targets (`direct_coach`, `open_candidate`, `suggested_candidate`).
- [x] Mantener FKs compuestas tenant-safe contra `schedule_blocks`, `schedule_block_assignments`, `coach_profiles`, `person_profiles` y `organization_memberships` cuando aplica.
- [x] Activar RLS desde la primera migracion y conceder solo `SELECT` directo a `authenticated`; las escrituras pasan por RPCs acotadas.
- [x] Crear RPCs minimas:
  - `create_own_change_request(...)`;
  - `offer_change_request_to_coach(...)`;
  - `respond_to_change_request_target(...)`;
  - `record_change_request_event(...)` solo para eventos minimizados de fallo/denegacion, sin transicionar estados.

Decisiones I.2:

- La fuente canonica del horario real sigue siendo `schedule_blocks` + `schedule_block_assignments`; `change_requests` no es horario final.
- Crear una solicitud propia exige un `schedule_block_assignment` activo (`assigned`) del coach autenticado y un bloque accionable, no cancelado ni completado.
- Ofrecer o aceptar revalida que el coach objetivo pertenece al tenant, tiene membership activa, perfil visible/activo y no esta ya asignado ni solapado con el bloque. La aceptacion vuelve a usar el guardrail de ventana mediante `lock_schedule_coach_assignment_window(...)` y devuelve `coach-unavailable` si aparece solape.
- La aceptacion de un coach deja la solicitud en `pending_approval` por defecto porque `approval_required = true`; no se toca el horario real en I.2.
- `center_manager` sigue reconocido solo como futuro: I.2 no le concede permisos de gestion hasta tener frontera por centro.
- Los eventos se retienen como lectura operativa durante 90 dias; la solicitud y sus targets conservan el estado de negocio sin borrado silencioso.
- Los campos libres quedan minimizados: `reason_summary` y `response_note_summary` son cortos y bloquean URLs, documentos, payroll/salario, ubicacion, bajas, permisos, vacaciones y otros patrones sensibles. `changed_fields` bloquea payloads largos, arrays, URLs, tokens, storage, IP/fingerprint, ubicacion, documentos y payroll.

No incluye I.2:

- UI, navegacion, inbox, cola visible, Server Actions de producto o notificaciones;
- aplicacion final a `schedule_block_assignments`;
- aprobacion/rechazo de gestion y primitiva transaccional de aplicacion;
- ausencias, vacaciones, permisos, bajas o disponibilidad laboral;
- payroll, horas extra aprobadas/automaticas, cierres mensuales o exportes legales;
- documentos firmables, firmas de solicitud, IA, push, ubicacion, geofencing, mapas, service worker u offline privado;
- seeds, datos reales STL o reglas hardcodeadas de tenant.

Deuda bloqueante cerrada por I.3 antes de piloto de cambios/cobertura:

- Crear RPC transaccional de aprobacion/rechazo/aplicacion que revalide tenant, bloque, asignacion origen, target aceptado, solapes, disponibilidad, estado actual y permisos justo antes de tocar `schedule_block_assignments`. Cerrado en `00028_change_request_operations.sql`.
- Registrar la aplicacion final de forma minimizada tambien en `operational_audit_events` si aporta valor, sin duplicar payload completo del workflow. Cerrado en `00028_change_request_operations.sql`.
- Anadir pruebas negativas de otro tenant, rol sin permiso, coach no candidato, target duplicado, bloque cancelado/completado, solicitud/target expirados, doble aceptacion y solape `coach-unavailable`. Cerrado en I.4 con `supabase/snippets/change-requests-rls-verification.sql`.
- Decidir UI/inbox y reglas de expiracion automatica sin abrir push ni notificaciones externas.

Verificacion I.2:

- [x] `npx supabase migration up --local`.
- [x] `npm run typecheck`.
- [x] `npm run lint`.
- [x] `npm run build`.
- [x] `npx supabase db lint --local`.
- [x] `npx supabase migration list --local` muestra `00027` aplicada localmente.
- [x] `rg -n "service_role" src` sin coincidencias.
- [x] `rg -n "STL" src` sin coincidencias.
- [x] `rg -n "navigator\\.geolocation|serviceWorker|service worker|PushManager|Notification|background sync|caches\\.|CacheStorage" src` sin coincidencias.

#### I.3 - Primitiva Segura De Aprobacion/Rechazo/Aplicacion De Cambios

Estado: implementado el 2026-05-13 como base DB/RLS/RPC en `supabase/migrations/00028_change_request_operations.sql`, sin UI visible, sin Server Actions de producto, sin navegacion, sin seeds y sin notificaciones. Se confirmo que el siguiente numero libre de migracion era `00028` antes de crear el archivo.

Alcance I.3:

- [x] Crear RPCs acotadas para gestionar solicitudes ya creadas en I.2:
  - `approve_change_request(...)`;
  - `reject_change_request(...)`;
  - `cancel_change_request(...)`;
  - `expire_change_request(...)`;
  - `apply_approved_change_request(...)`.
- [x] Mantener escritura directa bloqueada sobre `change_requests`, `change_request_targets` y `change_request_events`; las mutaciones siguen pasando por RPCs `SECURITY DEFINER` con sesion normal.
- [x] Permitir aprobacion operativa solo a `owner`, `admin` y `manager`, manteniendo `center_manager` como futuro no activado.
- [x] Permitir rechazo operativo solo a `owner`, `admin` y `manager`.
- [x] Permitir cancelacion por gestion o por el coach solicitante antes de que la solicitud este aplicada; si ya esta `approved`, la cancelacion queda reservada a gestion.
- [x] Permitir expiracion minima cuando la solicitud o target aceptado vence, cuando el bloque deja de ser accionable o cuando una solicitud ofrecida se queda sin targets activos.
- [x] Aplicar una solicitud aprobada al horario real de forma transaccional sobre `schedule_block_assignments`.
- [x] Revalidar justo antes de aplicar:
  - tenant y permiso de gestion;
  - estado `approved` de la solicitud;
  - bloque existente y accionable, no `cancelled` ni `completed`;
  - asignacion origen existente, del bloque, del coach solicitante y todavia `assigned`;
  - target aceptado, vigente y en estado `accepted`;
  - coach receptor activo/asignable dentro del tenant;
  - solapes actuales mediante `lock_schedule_coach_assignment_window(...)` y `change_request_coach_has_block_overlap(...)`;
  - guardrail Postgres anti-solape antes de confirmar la asignacion destino.
- [x] Crear o reactivar la asignacion destino con `assignment_status = 'assigned'` y `source = 'change_request'`.
- [x] Marcar la asignacion origen como `removed` cuando el flujo representa cobertura/sustitucion.
- [x] Dejar `change_requests.status = 'applied'` solo despues de terminar correctamente la mutacion real de asignaciones.
- [x] Registrar eventos minimizados en `change_request_events` para aprobacion, rechazo, cancelacion, expiracion, aplicacion y fallo de aplicacion.
- [x] Registrar eventos minimizados en `operational_audit_events` al aplicar al horario real: `assigned` para la asignacion destino y `removed` para la asignacion origen, sin payload completo de la solicitud.
- [x] Ajustar validaciones DB para permitir cierres operativos (`rejected`, `cancelled`, `expired`) aunque requester/target hayan dejado de estar activos, sin relajar la aplicacion real ni targets vivos.

Decisiones I.3:

- `schedule_blocks` + `schedule_block_assignments` siguen siendo la fuente canonica del horario real.
- `change_requests` sigue siendo workflow/trazabilidad; una solicitud aceptada o aprobada no cuenta como cobertura hasta que existe la asignacion destino `assigned`.
- La aplicacion de I.3 cubre sustitucion/cobertura de un bloque existente. `swap` queda reconocido por schema, pero no se aplica todavia porque necesita segundo bloque/asignacion.
- Los fallos esperados de aplicacion dejan la solicitud sin aplicar y registran `application_failed` con `failure_code` minimizado; no se marca `applied` ni se deja mutacion parcial.
- `coach-unavailable` se vuelve a comprobar justo antes de tocar asignaciones y tambien queda protegido por el trigger Postgres. Si aparece en la revalidacion, se registra como fallo de aplicacion.
- La aprobacion de gestion es operativa. No es firma documental, payroll, horas extra aprobadas ni cumplimiento laboral definitivo.

No incluye I.3:

- UI, inbox, navegacion, Server Actions visibles o notificaciones;
- ausencias, vacaciones, permisos, bajas o disponibilidad laboral;
- payroll, horas extra aprobadas/automaticas, cierres mensuales o exportes legales;
- documentos firmables, firmas de solicitud, IA, push, ubicacion, geofencing, mapas, service worker u offline privado;
- seeds, datos reales STL o reglas hardcodeadas de tenant;
- `center_manager` por centro.

Deuda posterior a I.3:

- Verificacion SQL negativa reejecutable para otro tenant, rol sin permiso, coach no candidato, target duplicado, bloque cancelado/completado, solicitud/target expirados, doble aceptacion y solape `coach-unavailable`. Cerrada en I.4 con `supabase/snippets/change-requests-rls-verification.sql`.
- Decidir UI/inbox y copy operativo sin abrir notificaciones externas.
- Definir expiracion automatica o job controlado si el flujo necesita cerrar solicitudes vencidas sin intervencion humana.
- Implementar `swap` solo cuando exista modelo seguro de segundo bloque/asignacion.

Verificacion I.3:

- [x] `npx supabase migration up --local`.
- [x] `npm run typecheck`.
- [x] `npm run lint`.
- [x] `npm run build`.
- [x] `npx supabase db lint --local`.
- [x] `npx supabase migration list --local` muestra `00028` aplicada localmente.
- [x] `rg -n "service_role" src` sin coincidencias.
- [x] `rg -n "STL" src` sin coincidencias.
- [x] `rg -n "navigator\\.geolocation|serviceWorker|service worker|PushManager|Notification|background sync|caches\\.|CacheStorage" src` sin coincidencias.

#### I.4 - Verificacion Negativa Y Hardening Minimo De Cambios/Cobertura

Estado: implementado el 2026-05-13 como verificacion SQL/RLS reejecutable sobre I.2/I.3, sin UI visible, sin Server Actions de producto, sin navegacion, sin seeds, sin datos reales y sin nueva migracion de fix. La verificacion local no descubrio un bug que requiera `00029`.

Alcance I.4:

- [x] Revisar estado actual y confirmar migraciones disponibles: `00027_change_requests_foundation.sql` y `00028_change_request_operations.sql` existen como base de I.2/I.3.
- [x] Crear `supabase/snippets/change-requests-rls-verification.sql` con transaccion y `ROLLBACK`.
- [x] Verificar que `owner`, `admin` y `manager` conservan permiso de gestion tenant-wide sobre cambios/cobertura.
- [x] Verificar que el coach solicitante puede crear una solicitud propia sobre asignacion activa y cancelarla mientras aplica.
- [x] Verificar que un coach target puede responder solo a un target propio y que un coach no candidato queda denegado.
- [x] Verificar que otro tenant no puede leer ni mutar solicitudes, targets o eventos de tenant ajeno.
- [x] Verificar que un rol sin permiso (`staff`) no puede aprobar, rechazar ni aplicar.
- [x] Verificar que bloques `cancelled` o `completed` bloquean solicitud/oferta/aceptacion/aplicacion.
- [x] Verificar que solicitud expirada o target aceptado expirado no pueden aplicarse y registran fallo minimizado.
- [x] Verificar que la doble aceptacion queda controlada: solo un target queda `accepted` y el resto de targets ofrecidos pasan a `withdrawn`.
- [x] Verificar que aplicar sin `status = 'approved'` no marca `applied` y registra `application_failed`.
- [x] Verificar que un solape de coach receptor registra `coach-unavailable`, no crea asignacion destino `assigned` y no marca la solicitud como `applied`.
- [x] Verificar que el trigger Postgres anti-solape sobre `schedule_block_assignments` sigue activo y rechaza un solape directo.
- [x] Verificar que las escrituras directas normales sobre `change_requests`, `change_request_targets` y `change_request_events` siguen bloqueadas para `authenticated`; cuando RLS responde con 0 filas afectadas en `UPDATE`/`DELETE`, el test afirma que no hubo efecto.

Decisiones I.4:

- La verificacion vive como snippet SQL local reejecutable y no como test de UI porque todavia no existe inbox ni superficie visible de cambios/cobertura.
- No se crea `00029` porque la verificacion paso contra la base local tras ajustar expectativas del propio snippet.
- La fuente canonica del horario real se mantiene en `schedule_blocks` y `schedule_block_assignments`; I.4 no amplia el modelo funcional.
- `center_manager` sigue futuro y no recibe permisos nuevos.
- Las escrituras directas sobre las tablas del workflow pueden fallar por error RLS o quedar como 0 filas afectadas segun operacion; ambas son aceptables solo si no modifican datos.

No incluye I.4:

- UI, inbox, navegacion, Server Actions visibles o notificaciones;
- seeds, datos reales STL o reglas hardcodeadas de tenant;
- ausencias, vacaciones, permisos, bajas, payroll, horas extra automaticas/aprobadas, IA, push, service worker, offline privado o ubicacion;
- ampliar `swap`, permisos por centro o `center_manager`;
- guardar payloads completos, notas extensas, documentos, payroll, tokens, URLs firmadas, IP/fingerprint o ubicacion.

Deuda posterior a I.4:

- Integrar la verificacion SQL en CI si el proyecto adopta un runner local estable para Supabase.
- Decidir UI/inbox, copy operativo y expiracion automatica en una fase posterior sin abrir notificaciones externas.
- Mantener `swap` bloqueado hasta disenar un segundo bloque/asignacion seguro.

Verificacion I.4:

- [x] `supabase/snippets/change-requests-rls-verification.sql` pasa contra Supabase local con rollback.
- [x] `npm run typecheck`.
- [x] `npm run lint`.
- [x] `npm run build`.
- [x] `npx supabase db lint --local`.
- [x] `npx supabase migration list --local` muestra `00027` y `00028` aplicadas localmente.
- [x] `rg -n "service_role" src` sin coincidencias.
- [x] `rg -n "STL" src` sin coincidencias.
- [x] `rg -n "navigator\\.geolocation|serviceWorker|service worker|PushManager|Notification|background sync|caches\\.|CacheStorage" src` sin coincidencias.

#### I.5 - Primera Capa App/Server Interna De Cambios/Cobertura

Estado: implementado el 2026-05-13 como capa interna server-side sobre I.2/I.3/I.4, sin UI visible, sin navegacion, sin inbox, sin Server Actions de producto y sin migracion nueva. La verificacion I.4 paso con rollback antes de implementar, asi que no se detecto bug DB/RLS que requiera `00029`.

Alcance I.5:

- [x] Confirmar estado actual: existen `supabase/migrations/00027_change_requests_foundation.sql`, `supabase/migrations/00028_change_request_operations.sql` y `supabase/snippets/change-requests-rls-verification.sql`.
- [x] Actualizar `src/types/supabase.ts` desde Supabase local para incluir `change_requests`, `change_request_targets`, `change_request_events` y RPCs I.2/I.3.
- [x] Anadir `canManageChangeRequests(...)` en `src/lib/auth/permissions.ts`, alineado con DB: `owner`, `admin` y `manager`; `center_manager` sigue futuro.
- [x] Crear `src/lib/change-requests.ts` como capa interna server-side con Supabase SSR normal y sesion de usuario, sin `service_role`.
- [x] Exponer helpers tipados minimos para:
  - listar solicitudes visibles del tenant activo segun RLS;
  - crear solicitud propia;
  - ofrecer una solicitud a un coach;
  - responder como target;
  - aprobar, rechazar, cancelar, expirar y aplicar una solicitud aprobada.
- [x] Resolver organizacion activa mediante `getAuthenticatedUser`, `getActiveMemberships` y `resolveActiveOrganization`; `organizationId` es opcional y solo selecciona una membership activa cuando hay varias.
- [x] No aceptar `person_profile_id` propio desde cliente en funciones propias; la persona se deriva desde sesion/tenant y la RPC vuelve a validarlo.
- [x] Mantener validacion server-side de UUIDs, tipos, estados, expiracion, resumenes cortos y referencias principales antes de llamar a RPC.
- [x] Mapear errores esperados de DB/RPC: `coach-unavailable`, `not-approved`, `expired`, `not-actionable` y `permission-denied`, ademas de errores de autenticacion, tenant, input y carga.
- [x] Detectar fallos esperados de `apply_approved_change_request(...)` leyendo el ultimo `application_failed` minimizado cuando la RPC devuelve la solicitud sin `status = 'applied'`.

Decisiones I.5:

- La capa app/server es interna y reusable por Server Components, Server Actions futuras o route handlers internos, pero no abre una superficie visible.
- Las mutaciones siguen pasando por RPCs `SECURITY DEFINER` de I.2/I.3 con sesion normal Supabase SSR; `src` no introduce `service_role`.
- La lista usa tablas del workflow filtradas por `organization_id` activa y deja que RLS decida visibilidad final: gestion tenant-wide o miembros involucrados.
- Crear solicitud propia exige una asignacion/bloque del tenant activo y no recibe persona propia. La DB sigue siendo el candado final de ownership del coach.
- Ofrecer a coach valida que el perfil sea asignable mediante la funcion DB antes de delegar la transicion a la RPC.
- Aplicar una solicitud solo se considera exito app/server si la fila vuelve con `status = 'applied'`; los fallos minimizados quedan como errores semanticos para UI futura.

No incluye I.5:

- UI, inbox, navegacion, avisos visibles, notificaciones, push o jobs de expiracion automatica;
- Server Actions de producto o formularios;
- migracion nueva, seeds, datos reales STL o reglas de tenant;
- ausencias, vacaciones, permisos, bajas, payroll, horas extra automaticas/aprobadas, IA, service worker, offline privado o ubicacion;
- guardar payloads completos, notas extensas, datos sensibles, documentos, payroll, tokens, URLs firmadas, IP/fingerprint o ubicacion.

Deuda posterior a I.5:

- Diseñar la UI/inbox y copy operativo sobre estos helpers sin abrir notificaciones externas ni mezclar ausencias.
- Decidir expiracion automatica con job/DB scheduler o accion operativa controlada si el producto lo necesita.
- Anadir pruebas unitarias o de integracion TS cuando exista harness estable para helpers server-side con Supabase local.
- Mantener `swap` bloqueado hasta modelar segundo bloque/asignacion de forma tenant-safe.

Verificacion I.5:

- [x] `supabase/snippets/change-requests-rls-verification.sql` pasa contra Supabase local con rollback.
- [x] `npm run typecheck`.
- [x] `npm run lint`.
- [x] `npm run build`.
- [x] `npx supabase db lint --local`.
- [x] `npx supabase migration list --local` muestra `00027` y `00028` aplicadas localmente.
- [x] `rg -n "service_role" src` sin coincidencias.
- [x] `rg -n "STL" src` sin coincidencias.
- [x] `rg -n "navigator\\.geolocation|serviceWorker|service worker|PushManager|Notification|background sync|caches\\.|CacheStorage" src` sin coincidencias.

#### I.6 - Primera Superficie Visible Minima De Cambios/Cobertura

Estado: implementado el 2026-05-14 como primera bandeja visible protegida en `/app/requests`, enlazada desde `/app/more` y desde la navegacion secundaria desktop. El corte reutiliza `src/lib/change-requests.ts`, la base DB/RLS/RPC de I.2/I.3 y la verificacion I.4; no crea migracion nueva ni cambia el modelo canonico de horario.

Revision previa:

- [x] Leidos `PROJECT_BRIEF.md`, `TASKS.md`, `docs/product/roadmap.md`, `docs/architecture/security-baseline.md`, `docs/operations/legal-and-privacy-notes.md` y `docs/architecture/domain-model.md` antes de tocar codigo.
- [x] Confirmado que existen `supabase/migrations/00027_change_requests_foundation.sql`, `supabase/migrations/00028_change_request_operations.sql`, `supabase/snippets/change-requests-rls-verification.sql` y `src/lib/change-requests.ts`.
- [x] `npm run typecheck` pasa antes de implementar I.6.
- [x] `supabase/snippets/change-requests-rls-verification.sql` pasa con rollback antes de implementar I.6; no se detecta bug DB/RLS/RPC que requiera migracion `00029`.

Alcance I.6:

- [x] Crear `/app/requests` como inbox protegido, `dynamic = "force-dynamic"`, usando sesion normal Supabase SSR.
- [x] Listar solicitudes visibles del tenant activo mediante `listVisibleChangeRequests(...)`, filtrando por organizacion activa y dejando RLS como segundo candado.
- [x] Enriquecer la lista solo con datos operativos minimos: bloque, centro, tipo de actividad, coach solicitante, targets y ultimo evento visible.
- [x] Anadir acciones de target propio: aceptar o rechazar una oferta propia desde Server Actions que revalidan sesion, organizacion activa, perfil de coach propio y estado `offered`.
- [x] Anadir cancelacion de solicitud propia antes de estados cerrados o aprobados, revalidando coach solicitante propio antes de delegar en la RPC.
- [x] Anadir acciones de gestion para `owner`, `admin` y `manager`: aprobar, rechazar, expirar y aplicar solicitud aprobada.
- [x] Mantener `center_manager` como rol futuro sin permisos nuevos.
- [x] Mostrar estados empty, loading, error, readonly y copy de alcance operativo.
- [x] Enlazar cada solicitud al bloque real en `/app/schedule`, manteniendo `schedule_blocks` + `schedule_block_assignments` como fuente canonica.

Decisiones I.6:

- `/app/requests` queda como ruta nueva justificada porque el workflow cruza horario, cobertura y perfil personal; no encaja como detalle exclusivo de `/app/coverage` ni de `/app/schedule`.
- La entrada visible se mantiene secundaria: `/app/more` y sidebar desktop. No se anade sexto item al bottom nav mobile.
- I.6 no crea solicitudes ni ofertas desde UI. Esa capacidad queda fuera para evitar un flujo parcial no transaccional de "crear solicitud + ofrecer a coach"; el primer corte visible se limita a lectura y decisiones seguras sobre solicitudes ya existentes.
- La UI no llama RPCs directamente desde componentes; las mutaciones pasan por Server Actions acotadas y estas delegan en `src/lib/change-requests.ts`.
- `organizationId` solo selecciona una membership activa resuelta en servidor; las actions no aceptan `person_profile_id` propio.
- La aprobacion se presenta como decision operativa de cobertura, no como payroll, horas extra aprobadas, ausencia laboral, firma documental ni cumplimiento legal definitivo.

No incluye I.6:

- creacion de solicitudes u ofertas desde UI;
- swap o segundo bloque/asignacion;
- ausencias, vacaciones, bajas, permisos o disponibilidad laboral;
- payroll, horas extra automaticas/aprobadas, exportes legales, IA, push, service worker, background sync, ubicacion, mapas o geofencing;
- seeds, datos reales STL o reglas hardcodeadas de tenant;
- payloads completos, notas extensas, datos sensibles, documentos, payroll, tokens, URLs firmadas, IP/fingerprint o ubicacion.

Deuda posterior a I.6:

- Definir un flujo transaccional o UX segura para crear solicitud y ofrecerla a coach sin dejar estados intermedios confusos.
- Decidir si la expiracion debe automatizarse con job DB/scheduler o mantenerse solo como accion operativa controlada.
- Anadir cobertura E2E autenticada cuando existan credenciales estables para roles coach y gestion.
- Evaluar si la ruta merece entrar en navegacion principal despues de validar volumen real de solicitudes.
- Mantener `swap` bloqueado hasta modelar segundo bloque/asignacion de forma tenant-safe.

Verificacion I.6:

- [x] `supabase/snippets/change-requests-rls-verification.sql` con rollback antes de UI.
- [x] `supabase/snippets/change-requests-rls-verification.sql` con rollback despues de UI.
- [x] `npm run typecheck`.
- [x] `npm run lint`.
- [x] `npm run build`.
- [x] `npx supabase db lint --local`.
- [x] `npx supabase migration list --local` muestra `00027` y `00028` aplicadas localmente.
- [x] `rg -n "service_role" src` sin coincidencias.
- [x] `rg -n "STL" src` sin coincidencias.
- [x] `rg -n "navigator\\.geolocation|serviceWorker|service worker|PushManager|Notification|background sync|caches\\.|CacheStorage" src` sin coincidencias.

#### I.7 - Creacion Minima Segura De Solicitudes/Ofertas De Cobertura

Estado: implementado el 2026-05-14 como primer flujo visible de creacion en `/app/requests`, construido sobre I.2-I.6. Se anade `supabase/migrations/00029_change_request_atomic_creation.sql` porque crear solicitud y targets en llamadas separadas no era suficiente para una UX segura.

Revision previa:

- [x] Leidos `PROJECT_BRIEF.md`, `TASKS.md`, `docs/product/roadmap.md`, `docs/architecture/security-baseline.md` y `docs/architecture/domain-model.md` antes de tocar codigo.
- [x] Confirmado que I.2-I.6 existen y que la fuente canonica del horario real sigue siendo `schedule_blocks` + `schedule_block_assignments`.
- [x] Detectado hueco real: `create_own_change_request(...)` y `offer_change_request_to_coach(...)` eran seguras por separado, pero la creacion + targets no estaba encapsulada como operacion atomica para UI.

Alcance I.7:

- [x] Crear RPCs atomicas `create_own_change_request_with_targets(...)` y `create_managed_change_request_with_targets(...)`.
- [x] Mantener `create_own_change_request(...)` como base para solicitud propia y reutilizar `offer_change_request_to_coach(...)` para validar cada target dentro de la misma transaccion.
- [x] Permitir a coach autenticado crear solicitud solo sobre una asignacion propia `assigned` de bloque accionable.
- [x] Permitir a `owner`, `admin` y `manager` crear/ofrecer cobertura operativa sobre asignaciones del tenant activo; `center_manager` sigue futuro.
- [x] Resolver opciones de origen y targets server-side con `listChangeRequestCreationOptions(...)`, filtrando coaches activos, visibles y asignables del tenant.
- [x] Anadir formulario simple en `/app/requests` con tipo, asignacion, targets, razon corta opcional, vencimiento opcional y confirmacion de alcance.
- [x] Anadir Server Action `createChangeRequestFromForm(...)` que revalida sesion, tenant, rol, asignacion, bloque y targets antes de llamar a `src/lib/change-requests.ts`.
- [x] Anadir enlaces contextuales desde detalle de `/app/schedule` y `/app/coverage` a `/app/requests` con bloque/asignacion preseleccionados.

Decisiones I.7:

- La UI no llama RPCs directamente; componentes -> Server Action -> `src/lib/change-requests.ts` -> RPC.
- `organizationId` solo selecciona una membership activa resuelta en servidor. No se aceptan `person_profile_id`, `requester_coach_profile_id` ni `schedule_block_id` como autoridad del cliente.
- La action deriva `schedule_block_id` desde `schedule_block_assignments` y vuelve a comprobar estado `assigned`, tenant, ownership o permiso de gestion.
- Los targets enviados por cliente son solo IDs candidatos; servidor/helper/RPC validan tenant, estado activo, visibilidad, membership asignable, no duplicados, no self-target y solapes.
- La creacion deja la solicitud en `offered` cuando hay targets iniciales correctos; si un target falla, la transaccion revierte solicitud y targets.

No incluye I.7:

- swap entre dos bloques/asignaciones;
- ausencias, vacaciones, bajas, permisos o disponibilidad laboral;
- payroll, horas extra automaticas/aprobadas, exportes legales;
- IA, push, service worker, background sync, ubicacion, mapas o geofencing;
- seeds, datos reales STL o reglas hardcodeadas de tenant;
- payloads completos, notas extensas, documentos, URLs firmadas, tokens, IP/fingerprint.

Deuda posterior a I.7:

- Definir expiracion automatica o job controlado si el flujo necesita cerrar solicitudes vencidas sin accion manual.
- Mejorar seleccion contextual de targets segun certificaciones/centro cuando existan reglas de asignabilidad mas ricas.
- Mantener `swap` bloqueado hasta modelar segundo bloque/asignacion tenant-safe.
- Anadir pruebas E2E autenticadas cuando existan credenciales estables para coach y gestion.

Verificacion I.7:

- [x] `npx supabase migration up --local` aplica `00029_change_request_atomic_creation.sql`.
- [x] `supabase/snippets/change-requests-rls-verification.sql` ampliado con rollback para RPCs atomicas.
- [x] `npm run typecheck`.
- [x] `npm run lint`.
- [x] `npm run build` (primer intento bloqueado por `next dev` usando `.next`; se paro ese proceso local y el segundo intento paso).
- [x] `npx supabase db lint --local`.
- [x] `npx supabase migration list --local` muestra `00029` aplicada localmente.
- [x] `rg -n "service_role" src` sin coincidencias.
- [x] `rg -n "STL" src` sin coincidencias.
- [x] `rg -n "navigator\\.geolocation|serviceWorker|service worker|PushManager|Notification|background sync|caches\\.|CacheStorage" src` sin coincidencias.

#### I.8 - Hardening Operativo Minimo De Solicitudes/Ofertas De Cobertura

Estado: implementado el 2026-05-14 como hardening app/server y UX sobre I.7. No se anaden migraciones, jobs, scheduler ni RPC nueva: se reutilizan las RPCs existentes, incluido `expire_change_request(...)`, y las mutaciones siguen pasando por Server Actions + `src/lib/change-requests.ts`.

Revision previa:

- [x] Leidos `PROJECT_BRIEF.md`, `TASKS.md`, `docs/product/roadmap.md`, `docs/architecture/security-baseline.md` y `docs/architecture/domain-model.md` antes de tocar codigo.
- [x] Revisado el flujo I.7 end-to-end: listado, opciones de creacion, Server Actions, helper interno y RPCs atomicas.
- [x] No se detecto bug real de RLS/transaccion que exigiera tocar DB/RPC/RLS; la DB sigue siendo el candado final de tenant, requester, target, estado, asignabilidad y solapes.

Alcance I.8:

- [x] Extender `listChangeRequestCreationOptions(...)` para devolver restricciones de target por asignacion: coach origen, target ya asignado al bloque y solape con otro bloque activo.
- [x] Mover el formulario de creacion a un componente cliente acotado que desactiva targets no accionables antes de enviar y limpia selecciones al cambiar de asignacion.
- [x] Mantener la Server Action `createChangeRequestFromForm(...)` como entrada unica de creacion; no acepta `person_profile_id`, `requester_coach_profile_id` ni `organization_id` sin membership activa.
- [x] Endurecer `/app/requests` para no mostrar aceptar/aprobar/aplicar/cancelar cuando la solicitud, el target aceptado o el bloque ya no son accionables.
- [x] Cambiar la expiracion operativa visible a "Cerrar vencida": usa `expireChangeRequest(...)` existente, confirma desde UI y solo se muestra si hay motivo objetivo calculado en servidor/UI.
- [x] Mejorar estados de target vencido/no accionable, empty de creacion y loading del formulario.

Decisiones I.8:

- La expiracion automatica sigue futura; I.8 no crea scheduler, background job, push, service worker ni background sync.
- La accion manual de cierre basta para el corte: `expire_change_request(...)` ya valida en DB que la solicitud sea visible para el actor y objetivamente expirable.
- La disponibilidad previa de targets en UI es ayuda operativa, no fuente de verdad. La transaccion RPC sigue revalidando target asignable, self-target, bloque accionable y solapes justo antes de crear targets.
- `owner`, `admin` y `manager` conservan aprobar/rechazar/aplicar; el cierre de vencida/no accionable puede usarse desde una solicitud visible cuando la RPC lo permite.
- `center_manager` sigue futuro e inactivo.

No incluye I.8:

- swap entre dos bloques/asignaciones;
- ausencias, vacaciones, bajas, permisos o disponibilidad laboral;
- payroll, horas extra automaticas/aprobadas, exportes legales;
- IA, push, service worker, background sync, ubicacion, mapas o geofencing;
- seeds, datos reales STL o reglas hardcodeadas de tenant;
- payloads completos, notas extensas, documentos, URLs firmadas, tokens, IP/fingerprint.

Deuda posterior a I.8:

- Definir si produccion necesita expiracion automatica controlada; si se abre, debe quedar como job/backend explicito y no como PWA/background sync.
- Anadir pruebas E2E autenticadas cuando existan credenciales estables para coach y gestion.
- Enriquecer asignabilidad futura con centro/certificaciones solo cuando exista modelo tenant-safe.
- Mantener `swap` bloqueado hasta modelar segundo bloque/asignacion tenant-safe.

Verificacion I.8:

- [x] `npm run typecheck`.
- [x] `npm run lint`.
- [x] `npm run build`.
- [x] `npx supabase db lint --local`.
- [x] `npx supabase migration list --local` muestra `00027`, `00028` y `00029` aplicadas localmente.
- [x] No se ejecuto `supabase/snippets/change-requests-rls-verification.sql` porque I.8 no toca DB/RPC/RLS.
- [x] `rg -n "service_role" src` sin coincidencias.
- [x] `rg -n "STL" src` sin coincidencias.
- [x] `rg -n "navigator\\.geolocation|serviceWorker|service worker|PushManager|Notification|background sync|caches\\.|CacheStorage" src` sin coincidencias.

#### I.9 - Modelado Documental Seguro De Ausencias/Vacaciones/Permisos

Estado: documentado el 2026-05-14 como fase de modelado seguro, sin schema, migraciones, RPCs, Server Actions, UI visible, seeds ni datos reales. El corte inicia ausencias como dominio propio porque toca datos laborales sensibles y puede impactar cobertura, fichaje y decisiones legales.

Revision previa:

- [x] Leidos `PROJECT_BRIEF.md`, `TASKS.md`, `docs/product/roadmap.md`, `docs/architecture/security-baseline.md`, `docs/architecture/domain-model.md` y `docs/operations/legal-and-privacy-notes.md`.
- [x] Revisado I.1-I.8 para mantener separado el workflow de cambios/cobertura (`change_requests`) del futuro workflow de ausencias.
- [x] Confirmado que I.9 debe ser documental: no hace falta migracion todavia porque faltan validar retencion, permisos finos, alcance legal/privacidad y UX antes de crear tablas.

Alcance funcional minimo:

- [x] Modelar solicitudes propias y gestionadas de ausencia/no disponibilidad sobre una persona o coach del tenant activo.
- [x] Cubrir solo categorias operativas iniciales: vacaciones solicitadas, dia libre, medio dia o tramo horario, permiso personal minimizado, ausencia puntual y no disponibilidad operativa.
- [x] Permitir rangos por fecha y, cuando aplique, por hora local; la zona horaria se resuelve por organizacion/centro cuando el impacto se compara con horarios.
- [x] Diferenciar estado de solicitud de impacto de cobertura. Una ausencia puede requerir cobertura, pero no pide por si sola a otro coach que cubra un bloque.
- [x] Mantener fuera saldos legales, devengo de vacaciones, baja medica con documentos, payroll, horas extra aprobadas y cumplimiento legal definitivo.

Entidades candidatas sin migrar:

- [x] `absence_requests`: cabecera tenant-scoped con `organization_id`, persona/coach afectado, requester derivado, tipo, estado, politica de revision, resumen operativo minimizado y timestamps.
- [x] `absence_request_periods`: uno o mas periodos de fecha/hora para soportar dias completos, medios dias y tramos sin sobrecargar la cabecera.
- [x] `absence_schedule_impacts`: relacion derivable o persistible futura entre una ausencia y `schedule_blocks`/`schedule_block_assignments` afectados, con estado de impacto y sin cambiar el horario real.
- [x] `absence_request_events`: auditoria propia minimizada de creacion, revision, aprobacion, rechazo, cancelacion, expiracion e impacto.

Estados candidatos:

- [x] Solicitud: `draft` opcional futuro, `requested`, `pending_review`, `approved`, `rejected`, `cancelled`, `expired`.
- [x] Impacto de cobertura: `none`, `potential`, `coverage_needed`, `coverage_requested`, `resolved`, `ignored`.
- [x] I.9 no usa `applied` como estado principal de ausencia: aprobar una ausencia no aplica cambios al horario. La aplicacion real de cobertura vive en `schedule_block_assignments` y/o `change_requests`.

Permisos candidatos:

- [x] La persona autenticada puede crear y leer sus propias solicitudes si tiene membership activa y persona vinculada; las acciones propias derivan `person_profile_id` desde `auth.uid()` + `organization_id`.
- [x] La persona puede cancelar una solicitud propia mientras no este cerrada ni bloqueada por politica futura.
- [x] `owner`, `admin` y `manager` pueden revisar operativamente solicitudes del tenant, con datos minimizados y sin acceso automatico a salud, documentos, payroll o datos sensibles.
- [x] `coach` ve sus propias solicitudes y, si recibe una solicitud de cobertura separada, solo ve el minimo operativo del bloque a cubrir, no el motivo sensible de la ausencia.
- [x] `center_manager`, `document_admin`, `payroll_manager` y `staff` no reciben permisos por herencia en I.9; cualquier capacidad futura requiere frontera y RLS propias.

Impacto sobre horario y cobertura:

- [x] `schedule_blocks` sigue siendo la fuente canonica del bloque operativo; una ausencia no modifica `required_coaches`, `status`, centro, hora ni tipo de actividad.
- [x] `schedule_block_assignments` sigue siendo la fuente canonica de quien esta asignado. Una ausencia aprobada que solapa una asignacion `assigned` no borra ni cambia automaticamente esa fila.
- [x] El impacto futuro se calcula detectando solapes entre periodos aprobados o en revision y asignaciones `assigned` de bloques activos, excluyendo bloques `cancelled` y `completed`.
- [x] Una ausencia `requested`/`pending_review` genera riesgo potencial para gestion; una ausencia `approved` puede convertir una asignacion en no valida para cobertura calculada, generando `absence_conflict`, `uncovered` o `insufficient` segun el bloque.
- [x] Resolver el impacto requiere accion separada: retirar/reasignar desde horario o crear/aplicar `change_requests`. La ausencia no crea targets ni ofertas a otros coaches por si sola.
- [x] Si una solicitud de cobertura nace por una ausencia, el vinculo futuro puede ser referencia opcional a `absence_request_id`/impacto, pero el coach candidato no debe recibir el motivo sensible de la ausencia.

Auditoria y retencion candidatas:

- [x] `absence_request_events` debe derivar actor desde sesion/membership/persona, guardar evento, resultado, estado y campos tocados minimizados.
- [x] No guardar payload completo de solicitud, texto libre largo, diagnosticos, documentos, URLs, tokens, ubicacion, IP/fingerprint, salario, payroll ni datos familiares.
- [x] Retencion candidata documental: solicitudes cerradas y aprobadas como historico operativo durante 24 meses; eventos/auditoria visibles 180 dias; cualquier retencion mayor o menor queda pendiente de revision legal/privacidad antes de produccion.
- [x] Borrado fisico o purga automatica queda fuera de I.9; se definira con job/control DB solo cuando exista schema y politica de retencion cerrada.

Decision de migracion:

- [x] No se crea migracion en I.9. El siguiente corte tecnico debe abrir una task nueva, confirmar nombres/estados/retencion, crear `organization_id` obligatorio desde la primera migracion, RLS estricta, RPCs acotadas y verificacion negativa de tenant/roles.

No incluye I.9:

- [x] Migraciones, RPCs, Server Actions o UI visible.
- [x] Ausencias reales de produccion, seeds, datos reales del primer tenant o reglas hardcodeadas.
- [x] Calculo de vacaciones devengadas, saldos legales, payroll, horas extra aprobadas, bajas medicas con documentos o cumplimiento legal definitivo.
- [x] Push, service worker, background sync, geolocalizacion, mapas o app nativa.

Verificacion I.9:

- [x] No se toca `src`.
- [x] No se crean migraciones ni snippets SQL.
- [x] Documentacion actualizada en `TASKS.md`, `docs/product/roadmap.md`, `docs/architecture/domain-model.md` y `docs/architecture/security-baseline.md`.

#### I.10 - Base Tecnica Minima De Ausencias/Vacaciones/Permisos

Estado: implementado el 2026-05-14 como foundation interna DB/RLS/RPC, sin UI visible, sin Server Actions de producto, sin seeds reales, sin datos reales del primer tenant y sin promesa legal definitiva. La validacion legal/privacidad sigue siendo gate antes de produccion o uso con ausencias reales, pero no bloquea este corte tecnico porque el schema minimiza datos, no acepta documentos ni bajas medicas documentadas y no abre superficie visible.

Decision de apertura:

- [x] Revisado I.9 y confirmado que procede abrir una base tecnica minima si se mantiene sin UI, sin datos reales, con RLS estricta y con legal/privacidad como bloqueo de produccion.
- [x] `supabase/migrations/00035_absence_requests_foundation.sql` crea `absence_requests`, `absence_request_periods` y `absence_request_events`.
- [x] No se crea `absence_schedule_impacts`: el impacto se calcula al vuelo con `list_absence_schedule_impacts(...)` cruzando periodos de ausencia con `schedule_blocks` + `schedule_block_assignments`.
- [x] La decision de no persistir impactos evita duplicar una verdad derivable y reduce riesgo de datos obsoletos o sensibles en este primer corte.

Schema/RLS/RPC:

- [x] `organization_id` obligatorio en todas las tablas nuevas desde la primera migracion.
- [x] Estados principales cerrados a `requested`, `pending_review`, `approved`, `rejected`, `cancelled` y `expired`; no existe `applied` como estado principal de ausencia.
- [x] Tipos iniciales minimizados: `vacation`, `day_off`, `partial_day`, `permission`, `personal_absence` y `unavailable`; no hay baja medica documentada ni saldos legales.
- [x] Acciones propias usan `create_own_absence_request(...)` y derivan membership/persona/coach desde `auth.uid()` + tenant; no aceptan `person_profile_id` propio desde cliente.
- [x] Revision operativa con `review_absence_request(...)` reservada a `owner`, `admin` y `manager`.
- [x] Cancelacion propia/gestionada con `cancel_absence_request(...)`; una ausencia aprobada solo la cancela gestion.
- [x] Expiracion acotada con `expire_absence_request(...)` para solicitudes pendientes objetivamente vencidas o con periodos ya pasados, sin scheduler/job.
- [x] Lectura/impacto mediante RLS y `list_absence_schedule_impacts(...)`; `staff`, `center_manager`, `document_admin` y `payroll_manager` no reciben permisos por herencia.
- [x] Escrituras directas normales bloqueadas; `authenticated` solo recibe `SELECT` y muta mediante RPCs acotadas.
- [x] Eventos en `absence_request_events` derivan actor desde sesion/membership/persona y guardan `changed_fields` minimizados.

Impacto sobre cobertura:

- [x] Una ausencia aprobada puede devolver impacto `coverage_needed` si solapa una asignacion `assigned` de un bloque activo del mismo tenant.
- [x] Una ausencia `requested` o `pending_review` puede devolver impacto potencial para gestion.
- [x] La ausencia no modifica automaticamente `schedule_blocks`, `required_coaches`, `status`, `schedule_block_assignments` ni asignaciones reales.
- [x] Resolver cobertura sigue fuera: ajuste manual futuro o `change_requests`, sin exponer motivo sensible al coach candidato.

Datos y retencion:

- [x] `reason_summary` es opcional, corto y filtrado; no guarda diagnosticos, salud, documentos, justificantes, salario, payroll, datos familiares, URLs, tokens, IP/fingerprint ni ubicacion.
- [x] Retencion candidata implementada como metadata: solicitudes hasta 24 meses desde cierre/aprobacion y eventos hasta 180 dias.
- [x] No se implementa purga/job en I.10; cualquier borrado fisico queda para una decision legal/tecnica posterior.

No incluye I.10:

- [x] UI, navegacion, Server Actions visibles o capa app/server.
- [x] Saldos legales, devengo de vacaciones, payroll, horas extra aprobadas o calculos laborales definitivos.
- [x] Bajas medicas con documentos, justificantes, documentos firmables ni Storage nuevo.
- [x] Push, Notification API, service worker, background sync, geolocalizacion, app nativa o reglas hardcodeadas de tenant.

Verificacion I.10:

- [x] `npx supabase migration up --local`.
- [x] `supabase/snippets/absence-requests-rls-verification.sql` pasa con rollback: tenant safety, rol sin permiso, persona ajena/accion propia, periodo invalido, impacto cruzado y escrituras directas bloqueadas.
- [x] `npx supabase db lint --local`.
- [x] `npm run typecheck`.
- [x] `npm run lint`.
- [x] `npm run build`.
- [x] `rg -n "STL" src` sin coincidencias.
- [x] `rg -n "service_role" src` sin coincidencias.
- [x] Guardrail de geolocalizacion/push/cache sin nuevas coincidencias.

#### I.11 - Capa Interna Server/App De Ausencias/Vacaciones/Permisos

Estado: implementado el 2026-05-14 como capa interna server-side posterior a I.10, sin UI visible, sin rutas nuevas, sin formularios, sin navegacion y sin Server Actions de usuario final. I.10 no quedo bloqueada por privacidad/legal para foundation tecnica: creo DB/RLS/RPC minima, pero la validacion legal/privacidad sigue bloqueando produccion o uso con ausencias reales.

Decision de apertura:

- [x] Revisado I.10 y confirmado que existe `supabase/migrations/00035_absence_requests_foundation.sql` con tablas, RLS y RPCs minimas.
- [x] Se crea `src/lib/absence-requests.ts` como helper interno server-side para consumir esas RPCs con sesion normal SSR.
- [x] No se regenera `src/types/supabase.ts` en este corte; se usan tipos de dominio locales para las tablas/RPCs I.10 mientras los tipos generados no incluyan `00035`.
- [x] Se actualiza `src/lib/auth/permissions.ts` con capacidades app alineadas con DB: self-service para `owner`, `admin`, `manager` y `coach`; revision para `owner`, `admin` y `manager`.

Funciones internas:

- [x] `listOwnAbsenceRequests(...)` lee solicitudes propias derivando persona desde `auth.uid()` + `organization_id`; no acepta `person_profile_id`.
- [x] `listAbsenceReviewQueue(...)` lee cola operativa solo si el rol tiene capacidad de revision.
- [x] `createOwnAbsenceRequest(...)` llama a `create_own_absence_request(...)`; el cliente no puede enviar persona propia ni coach propio.
- [x] `cancelOwnAbsenceRequest(...)` llama a `cancel_absence_request(...)` solo para solicitudes propias en `requested` o `pending_review`.
- [x] `reviewAbsenceRequest(...)` envuelve `review_absence_request(...)` para decision interna `approved`/`rejected`, reservada a gestion.
- [x] `expireAbsenceRequest(...)` envuelve `expire_absence_request(...)` para cierres vencidos legibles por RLS.
- [x] `listAbsenceRequestEvents(...)` relee eventos minimizados por RLS; no se expone registro app-side porque I.10 solo dejo el registro dentro de RPCs acotadas.
- [x] `listAbsenceScheduleImpacts(...)` calcula impacto potencial mediante `list_absence_schedule_impacts(...)`, solo lectura y sin modificar horario/asignaciones.

Seguridad y alcance:

- [x] `organization_id` es obligatorio en todos los inputs publicos del helper.
- [x] Las mutaciones usan RPCs I.10; no hay escrituras directas a `absence_requests`, `absence_request_periods` ni `absence_request_events`.
- [x] No se introduce `service_role` en `src`.
- [x] No se crea `absence_schedule_impacts` ni se persiste impacto; se respeta la decision I.10 de calculo al vuelo.
- [x] No se modifican automaticamente `schedule_blocks`, `required_coaches`, `status`, `schedule_block_assignments` ni cobertura real.
- [x] Resolver cobertura sigue separado: ajuste manual futuro o `change_requests`.
- [x] Estados principales mantienen `requested`, `pending_review`, `approved`, `rejected`, `cancelled` y `expired`; no se introduce `applied`.
- [x] `reason_summary` se valida corto/minimizado y bloquea salud, documentos, bajas medicas, payroll, ubicacion, URLs, tokens y datos sensibles.

No incluye I.11:

- [x] UI, paginas, componentes, formularios visibles, navegacion o Server Actions de producto.
- [x] Saldos legales, devengo de vacaciones, payroll, horas extra aprobadas, bajas medicas con documentos o cumplimiento legal definitivo.
- [x] Push, Notification API, service worker, cache privado/offline, geolocalizacion, app nativa, seeds reales del primer tenant o reglas hardcodeadas de tenant.

Verificacion I.11:

- [x] `npm run typecheck`.
- [x] `npm run lint`.
- [x] `npm run build`.
- [x] `rg -n "STL" src` sin coincidencias.
- [x] `rg -n "service_role" src` sin coincidencias.
- [x] Guardrail de geolocalizacion/push/cache sin nuevas coincidencias de APIs peligrosas (`navigator.geolocation`, `PushManager`, `Notification`, `serviceWorker`, `caches`, `CacheStorage`, `workbox`, background sync).
- [x] `npx supabase db lint --local` no aplica en I.11 porque no se tocan migraciones ni tipos Supabase generados.

#### I.12 - Primera Bandeja Visible Protegida De Ausencias

Estado: implementado el 2026-05-14 como primera superficie visible posterior a I.11, sin crear formulario de nueva ausencia, calendario mensual/anual, saldos legales, payroll, bajas medicas con documentos, push, ubicacion ni app nativa.

Decision de apertura:

- [x] Revisado I.10/I.11 y confirmado que existen `supabase/migrations/00035_absence_requests_foundation.sql`, `supabase/snippets/absence-requests-rls-verification.sql` y `src/lib/absence-requests.ts`.
- [x] Se crea `/app/absences` como ruta protegida bajo el shell existente, enlazada desde `/app/more` y sidebar/personal; no se anade item principal mobile.
- [x] La pantalla lista solicitudes propias para roles con self-service (`owner`, `admin`, `manager`, `coach`) usando `listOwnAbsenceRequests(...)`.
- [x] La pantalla muestra cola de revision operativa solo para `owner`, `admin` y `manager` usando `listAbsenceReviewQueue(...)`.
- [x] Muestra periodos, estado, tipo de ausencia, resumen minimizado si existe y ultimo evento visible.
- [x] Muestra impacto potencial o cobertura a resolver en lectura con `listAbsenceScheduleImpacts(...)`; no persiste impacto ni crea `absence_schedule_impacts`.

Acciones visibles:

- [x] Cancelar solicitud propia solo en `requested` o `pending_review`, mediante Server Action + `cancelOwnAbsenceRequest(...)`.
- [x] Aprobar/rechazar solo desde gestion (`owner`, `admin`, `manager`), mediante Server Action + `reviewAbsenceRequest(...)`.
- [x] Expirar manualmente solo para solicitudes pendientes objetivamente vencidas o con todos los periodos pasados, mediante Server Action + `expireAbsenceRequest(...)`; la RPC sigue siendo la fuente de verdad.
- [x] Todas las acciones revalidan sesion, membership activa, tenant, rol y `organization_id` antes de delegar en el helper/RPC.

Seguridad y alcance:

- [x] `organization_id` se mantiene explicito en ruta, helper y acciones.
- [x] No se acepta `person_profile_id` propio desde cliente.
- [x] No se introduce `service_role` en `src`.
- [x] No hay escrituras directas a `absence_requests`, `absence_request_periods` ni `absence_request_events`; las mutaciones pasan por helper/RPC.
- [x] No se modifican `schedule_blocks`, `schedule_block_assignments`, cobertura real ni plantillas.
- [x] Resolver cobertura sigue separado: ajuste manual futuro o `change_requests`.
- [x] Estados principales siguen cerrados a `requested`, `pending_review`, `approved`, `rejected`, `cancelled` y `expired`; no se introduce `applied`.
- [x] La UI no pide ni muestra salud, diagnosticos, documentos medicos, saldos legales, payroll, horas extra aprobadas ni cumplimiento legal definitivo.

No incluye I.12:

- [x] Formulario de nueva ausencia.
- [x] Calendario mensual/anual de ausencias.
- [x] Saldos legales/devengo, payroll, bajas medicas con documentos, Storage nuevo, push, geolocalizacion, app nativa, seeds reales del primer tenant o reglas hardcodeadas de tenant.

Verificacion I.12:

- [x] `npm run typecheck`.
- [x] `npm run lint`.
- [x] `npm run build`.
- [x] `rg -n "STL" src` sin coincidencias.
- [x] `rg -n "service_role" src` sin coincidencias.
- [x] Guardrail de geolocalizacion/push/cache sin nuevas coincidencias.

#### I.13 - Creacion Minima Visible De Solicitud Propia De Ausencia

Estado: implementado el 2026-05-15 como ampliacion acotada de la bandeja I.12 en `/app/absences`. No cambia schema, RLS ni RPC; usa `src/lib/absence-requests.ts` y la RPC `create_own_absence_request(...)` existente a traves de `createOwnAbsenceRequest(...)`.

Prerequisito revisado:

- [x] I.12 existe como primera superficie visible protegida sobre `src/lib/absence-requests.ts`.
- [x] I.10/I.11 ya dejan schema/RLS/RPC y helper server-side suficientes para crear solicitud propia sin escrituras directas.

Alcance I.13:

- [x] Se anade formulario visible dentro de `/app/absences` solo para roles con self-service permitido y persona vinculada.
- [x] El formulario crea unicamente solicitud propia; no acepta `person_profile_id` ni `coach_profile_id` desde cliente.
- [x] Tipos permitidos: `vacation`, `day_off`, `partial_day`, `permission`, `personal_absence` y `unavailable`, reutilizando `ABSENCE_REQUEST_TYPES`.
- [x] Campos minimos visibles: tipo, inicio, fin, dia completo, zona horaria de la organizacion activa y resumen operativo corto opcional.
- [x] La validacion cliente queda como UX HTML (`required`, `datetime-local`, `maxLength`); la Server Action revalida sesion, membership, tenant, rol, `organization_id`, tipo, fechas, rango y longitud antes de llamar al helper.
- [x] El resumen pasa por la validacion sensible de `createOwnAbsenceRequest(...)`: bloquea texto largo o datos de salud, diagnosticos, documentos, justificantes, familia, sanciones, salario/payroll, ubicacion, URLs, tokens e identificadores equivalentes.
- [x] Tras crear, la accion redirige a la bandeja con `status=absence-created-{estado}` para mostrar el estado resultante devuelto por RPC, normalmente `pending_review`.

Seguridad y limites:

- [x] `organization_id` sigue explicito en formulario, accion y helper, pero la accion solo acepta organizaciones resueltas desde memberships activas.
- [x] La identidad propia se deriva desde sesion + tenant + persona vinculada dentro del helper/RPC.
- [x] No se introduce `service_role` en `src`.
- [x] No hay escrituras directas a `absence_requests`, `absence_request_periods` ni `absence_request_events`; la mutacion pasa por `createOwnAbsenceRequest(...)`.
- [x] No se modifican `schedule_blocks`, `schedule_block_assignments`, cobertura real, plantillas ni `absence_schedule_impacts`.
- [x] No se introduce `applied` como estado principal de ausencia.
- [x] El copy visible presenta aprobacion operativa y no promete cumplimiento legal definitivo, saldos legales ni devengo.

No incluye I.13:

- [x] Creacion de ausencias para otra persona.
- [x] Calendario mensual/anual, saldos legales/devengo, payroll, bajas medicas con documentos, adjuntos, documentos firmables, push, geolocalizacion, app nativa, seeds reales del primer tenant o reglas hardcodeadas de tenant.

Verificacion I.13:

- [x] `npm run typecheck`.
- [x] `npm run lint`.
- [x] `npm run build`.
- [x] `rg -n "STL" src` sin coincidencias.
- [x] `rg -n "service_role" src` sin coincidencias.
- [x] Guardrail de geolocalizacion/push/cache sin nuevas coincidencias.

#### I.14 - Hardening Visible De Ausencias

Estado: iniciado e implementado el 2026-05-15 como hardening acotado posterior a I.13. No cambia schema, RLS ni RPC; mantiene `/app/absences` sobre `src/lib/absence-requests.ts` y no abre calendario, saldos legales ni cobertura automatica.

Prerequisito revisado:

- [x] I.13 si dejo un formulario minimo visible de solicitud propia en `/app/absences`.
- [x] La creacion visible usa exclusivamente `createOwnAbsenceRequest(...)`; no acepta `person_profile_id` ni `coach_profile_id` desde cliente.

Alcance I.14:

- [x] Se anaden filtros simples por query string en `/app/absences`: `view`, `absence_type` y `absence_status`, sin nueva navegacion principal mobile.
- [x] Los filtros se validan en servidor; valores no habilitados se ignoran con aviso visible.
- [x] La bandeja distingue vista propia y revision operativa sin cambiar permisos: la cola de revision sigue solo para `owner`, `admin` y `manager`.
- [x] Las tarjetas muestran mensajes claros cuando una solicitud ya no puede cancelarse, aprobarse, rechazarse o cerrarse como vencida.
- [x] Los botones de crear/cancelar/aprobar/rechazar/expirar tienen estado pendiente y confirmacion prudente para evitar doble envio accidental.
- [x] El formulario muestra errores de validacion junto a la solicitud, exige confirmacion visible de que el resumen no incluye datos sensibles y rechaza senales sensibles basicas en Server Action.
- [x] La Server Action convierte `datetime-local` usando la zona horaria de la organizacion activa, revalidando periodo y duracion antes de llamar al helper.
- [x] El copy mantiene aprobacion operativa: no promete saldos, devengo, baja medica documentada, payroll, cobertura automatica ni cumplimiento legal definitivo.

Seguridad y limites:

- [x] `organization_id` sigue explicito y revalidado contra membership activa.
- [x] La identidad propia sigue derivada desde sesion + tenant + persona vinculada dentro de helper/RPC.
- [x] No se introduce `service_role` en `src`.
- [x] No hay escrituras directas a tablas de ausencias desde UI/actions; las mutaciones siguen en helpers/RPC.
- [x] No se modifican `schedule_blocks`, `schedule_block_assignments`, plantillas ni cobertura real.
- [x] El impacto visible sigue calculado al vuelo con `listAbsenceScheduleImpacts(...)`, sin persistir `absence_schedule_impacts`.
- [x] No se introduce `applied` como estado principal de ausencia.

No incluye I.14:

- [x] Creacion de ausencias para otra persona.
- [x] Calendario mensual/anual de ausencias.
- [x] Saldos legales/devengo, payroll, bajas medicas con documentos, adjuntos, documentos firmables, push, geolocalizacion, app nativa, seeds reales del primer tenant o reglas hardcodeadas de tenant.

Verificacion I.14:

- [x] `npm run typecheck`.
- [x] `npm run lint`.
- [x] `npm run build`.
- [x] `rg -n "STL" src` sin coincidencias.
- [x] `rg -n "service_role" src` sin coincidencias.
- [x] Guardrail de geolocalizacion/push/cache sin nuevas coincidencias.

#### I.15 - QA Tecnico De Regresion De Ausencias

Estado: iniciado el 2026-05-15 como QA/hardening tecnico posterior a I.14. No cambia schema, RLS, RPC ni dominio funcional; solo anade regresion de smoke/guardrails para confirmar que `/app/absences` mantiene los limites ya cerrados.

Prerequisito revisado:

- [x] I.13 existe en codigo: `/app/absences` mantiene formulario minimo visible de solicitud propia y la Server Action llama a `createOwnAbsenceRequest(...)`.
- [x] I.14 existe en codigo: filtros GET `view`, `absence_type`, `absence_status`, errores visibles, confirmacion de minimizacion y estados no accionables estan presentes.
- [x] No se detecta bloqueo de base que obligue a parar el corte; I.15 no implementa mejoras de producto nuevas.

Alcance I.15:

- [x] Se anade `tests/smoke/absences-regression.spec.ts` con guardrails estaticos de fuente para I.13/I.14.
- [x] El smoke confirma que la creacion propia sigue pasando por `createOwnAbsenceRequest(...)` y la RPC `create_own_absence_request(...)`.
- [x] El smoke cubre que no hay inputs propios `person_profile_id` ni `coach_profile_id` en `/app/absences`.
- [x] El smoke cubre que no aparecen escrituras directas `insert/update/upsert/delete` sobre tablas de ausencia desde `src`.
- [x] El smoke autenticado opcional comprueba que `coach` no puede activar la cola de revision por query string aunque use `view=review`.
- [x] El smoke autenticado opcional comprueba que `owner`, `admin` y `manager` ven la superficie de revision con filtros `view`, `absence_type` y `absence_status` si hay credenciales E2E.
- [x] `tests/smoke/auth-protection.spec.ts` protege tambien `/app/absences?view=review&absence_type=vacation&absence_status=pending_review` para usuarios anonimos.

Seguridad y limites:

- [x] `organization_id` sigue explicito y revalidado; I.15 no introduce nuevas mutaciones.
- [x] No se acepta identidad propia desde cliente; persona/coach siguen derivados desde sesion + tenant + helper/RPC.
- [x] No se introduce `service_role` en `src`.
- [x] No se modifican `schedule_blocks`, `schedule_block_assignments`, plantillas ni cobertura real.
- [x] No se introduce `applied` como estado principal de ausencia.
- [x] No cambia visibilidad de campos ni matriz de permisos; la revision operativa sigue solo para `owner`, `admin` y `manager`.
- [x] No cambia copy legal/privacidad visible; se mantiene aprobacion operativa, no cumplimiento legal definitivo.

No incluye I.15:

- [x] Creacion de ausencias para otra persona.
- [x] Calendario mensual/anual de ausencias.
- [x] Saldos legales/devengo, payroll, bajas medicas con documentos, adjuntos, documentos firmables, push, geolocalizacion, app nativa, seeds reales del primer tenant o reglas hardcodeadas de tenant.

Verificacion I.15:

- [x] `npm run typecheck`.
- [x] `npm run lint`.
- [x] `npm run build`.
- [x] `npx playwright test --config=playwright.smoke.config.ts tests/smoke/absences-regression.spec.ts`: 1 passed, 4 skipped por falta de credenciales E2E autenticadas.
- [x] `E2E_BASE_URL=http://127.0.0.1:3000 npm run test:smoke`: 27 passed, 13 skipped por falta de credenciales E2E autenticadas. El intento previo con `E2E_START_SERVER=1` se bloqueo porque ya habia un `next dev` del repo activo en `localhost:3000`, asi que se reutilizo.
- [x] `rg -n "STL" src` sin coincidencias.
- [x] `rg -n "service_role" src` sin coincidencias.
- [x] Guardrail de geolocalizacion/push/cache sin nuevas coincidencias.

#### I.16 - Impacto De Ausencias En Lectura De Cobertura

Estado: implementado el 2026-05-15 como integracion acotada posterior a I.15. No cambia schema, RLS ni RPC; reutiliza `list_absence_schedule_impacts(...)` y anade una lectura operacional derivada para `/app/schedule`, `/app/coverage`, `/app` y `/app/stats`.

Prerequisito revisado:

- [x] I.10 existe como foundation DB/RLS/RPC de ausencias, con `list_absence_schedule_impacts(...)` y sin `absence_schedule_impacts`.
- [x] I.11 existe como helper server-side interno en `src/lib/absence-requests.ts`, sin `service_role` ni escrituras directas a tablas de ausencia.
- [x] I.12-I.14 dejan `/app/absences` visible, creacion propia minima y hardening de filtros/validacion/estados no accionables.
- [x] I.15 deja smoke/guardrails de regresion y no hay bloqueo que obligue a parar el corte.

Alcance I.16:

- [x] `src/lib/schedule-blocks.ts` acepta impactos de ausencia como input opcional de `calculateScheduleCoverageByBlock(...)`.
- [x] Una ausencia `approved` con impacto `coverage_needed` deja de contar esa asignacion como cobertura valida en la lectura derivada; puede convertir el bloque en `uncovered` o `insufficient`.
- [x] Una ausencia `pending_review` con impacto `potential` no modifica el ratio valido, pero marca el bloque como riesgo operativo para revision.
- [x] `src/lib/absence-requests.ts` anade `listOperationalAbsenceScheduleImpacts(...)` para roles de gestion, leyendo periodos/solicitudes y delegando el cruce final en la RPC existente.
- [x] `/app/schedule`, `/app/coverage`, Inicio y `/app/stats` consumen el impacto solo para `owner`/`admin`/`manager`; si falla la carga, muestran aviso y continuan con cobertura base.
- [x] Las superficies muestran copy prudente: "impacto de ausencia", "ausencia en revision" y "requiere revision de cobertura".
- [x] Los paneles de detalle no muestran motivos ni resumen sensible; solo explican el impacto operativo.
- [x] Se anade `tests/smoke/coverage-absence-impact.spec.ts` para proteger que el impacto sea derivado, read-only y sin motivos sensibles en cobertura.

Seguridad y limites:

- [x] `organization_id` sigue explicito en lecturas y helpers.
- [x] La identidad propia y permisos siguen derivados desde sesion + tenant + membership; I.16 no acepta persona/coach desde cliente.
- [x] RLS/RPC siguen como segundo candado; el helper operativo exige rol de gestion.
- [x] No hay escrituras directas a tablas de ausencias desde `src`.
- [x] No se modifica `schedule_blocks`, `schedule_block_assignments`, plantillas ni cobertura real como consecuencia de una ausencia.
- [x] No se crea `absence_schedule_impacts`; el calculo al vuelo sigue bastando para este corte.
- [x] No se introduce `applied` como estado principal de ausencia.
- [x] No se muestran motivos sensibles a candidatos ni en superficies de cobertura.

No incluye I.16:

- [x] Resolver cobertura automaticamente, crear ofertas/targets o asignar otro coach.
- [x] Creacion de ausencias para otra persona.
- [x] Calendario mensual/anual de ausencias.
- [x] Saldos legales/devengo, payroll, horas extra aprobadas, bajas medicas con documentos, adjuntos, push, geolocalizacion, app nativa, seeds reales o reglas hardcodeadas de tenant.

Verificacion I.16:

- [x] `npm run typecheck`.
- [x] `npm run lint`.
- [x] `npm run build`.
- [x] `npx playwright test --config=playwright.smoke.config.ts tests/smoke/coverage-absence-impact.spec.ts tests/smoke/absences-regression.spec.ts`: 2 passed, 4 skipped por falta de credenciales E2E autenticadas.
- [x] `rg -n "STL" src` sin coincidencias.
- [x] `rg -n "service_role" src` sin coincidencias.
- [x] Guardrail de geolocalizacion/push/cache sin nuevas coincidencias.

#### Cierre Transversal 2026-05-14 - Fixes UX Y Coherencia Operativa

Estado: documentado el 2026-05-14 para no perder decisiones de producto aplicadas durante el pulido posterior a H.4/I.8. No abre una fase nueva ni cambia prioridades: congela comportamientos que ya existen y que no deben revertirse por refactor, "limpieza" visual o cambios futuros de navegacion.

Alcance cerrado:

- [x] Proxima clase asignada propia visible en Inicio y resumida en el shell tambien en Inicio. La fuente sigue siendo servidor + `schedule_blocks` + `schedule_block_assignments` con `assignment_status = 'assigned'`, excluyendo bloques `cancelled` y `completed`.
- [x] El contador de tiempo restante es solo visual en cliente; no se convierte en fuente de verdad ni abre web push, Notification API, PushManager, service worker, background sync, caches privadas ni geolocalizacion.
- [x] Inicio y Mas son superficies visibles tambien para Entrenador, pero con contenido propio: proxima clase, fichaje, avisos propios, solicitudes y cuenta. No mostrar bloques administrativos como "Acceso no autorizado" cuando simplemente no aplican.
- [x] Copy tecnico de UI reemplazado por lenguaje comprensible: evitar "tenant" en interfaz, esconder notas de alcance/legal/roadmap tras "Mas" cuando no son accion diaria, y no repetir bloques de accesos rapidos.
- [x] `/app/time` prioriza la accion de fichar: registrar entrada/salida aparece arriba, centro principal del coach preseleccionado, fecha/hora editable con valor por defecto actual, y revision administrativa oculta para roles sin permiso.
- [x] Correcciones de fichaje que mueven un punch a otro dia realinean el `time_record` de destino. `00030_time_punch_work_date_alignment.sql` ajusta la aplicacion futura y `00031_repair_correction_punch_record_dates.sql` repara desajustes existentes de punches `source = correction`.
- [x] Colores: `ColorPaletteField` ofrece paleta rapida y mantiene entrada hexadecimal manual en tipos de actividad y configuracion de organizacion.
- [x] Plantillas: filtros colapsables por bloques sin asignar/asignados y tipo de actividad; contador visible/total; seleccion multiple; edicion multiple solo para entrenador por defecto, notas, entrenadores necesarios y centro cuando la plantilla cubre todos los centros.
- [x] Plantillas: si la plantilla esta acotada a un centro, los bloques heredan ese centro y el campo queda de lectura; si cubre todos los centros, el centro del bloque sigue editable, tambien en edicion multiple.
- [x] Plantillas: el coach por defecto se filtra para evitar asignar el mismo coach a dos bloques solapados dentro de la misma plantilla; el guardrail de horario real sigue en Postgres.
- [x] Plantillas: guardar plantilla o bloque de plantilla sincroniza el rango activo mediante `ensureScheduleTemplateRangeApplied(...)`; ya no se comunica que "se asignara cuando apliques" si el rango activo ya dicta horario generado.
- [x] Tipos de actividad: `update_class_type_and_sync_defaults(...)` actualiza el catalogo y sincroniza `required_coaches` en todas las plantillas y en horarios presentes/futuros no cancelados/completados. La migracion `00033` corrige el comportamiento conservador previo que solo tocaba bloques con el valor anterior.
- [x] Cobertura: `/app/coverage` permite seleccionar varios riesgos y asignar explicitamente el mismo entrenador a todos los bloques seleccionados, reutilizando validacion server-side de tenant, rol operativo, bloque activo, entrenador asignable y solapes; no crea cobertura automaticamente ni modifica `schedule_blocks`.
- [x] Equipo: filtros de ficha por nombre/busqueda, centro y estado/rol operativo para gestionar listados largos sin convertir la pantalla en tabla pesada.
- [x] Guia/onboarding: los pasos de Resumen de la semana y Pendiente deben apuntar a elementos reales; mantener atributos `data-tour` al refactorizar Inicio.

Decisiones que no se deben revertir:

- La proxima clase persistente ayuda a que el coach no olvide su bloque, pero el canal push queda futuro nativo/wrapper; la web mantiene solo fallback in-app.
- `NextAssignedShellLink` no debe ocultarse por `pathname === "/app"`: sidebar desktop y encabezado mobile son recordatorio fijo, aunque Inicio tenga una tarjeta grande.
- Un entrenador no debe ver Plantillas como opcion cotidiana ni entrar en pantallas administrativas sin capacidad; ocultar lo irrelevante da mejor UX que mostrar "sin permiso".
- En pantallas operativas densas, el contenido explicativo secundario vive tras "Mas" o "Mas informacion"; la primera pantalla debe priorizar accion y datos accionables.
- Los selects largos deben reservar espacio para flecha/ellipsis y reorganizarse antes de volver a colapsar texto contra controles nativos.
- Cambiar un tipo de actividad cambia defaults operativos hacia adelante; no reescribe historia pasada ni bloques cerrados.

Verificacion de este cierre documental:

- [x] Solo documenta y consolida decisiones ya implementadas; no cambia `src`, migraciones ni RLS en este cierre.
- [ ] Reejecutar `npm run typecheck`, `npm run lint`, `npm run build`, Supabase lint/migration list y busquedas guardrail en el siguiente corte que toque codigo.

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
- [x] Añadir scripts:
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
- [x] Añadir navegacion hacia `/app/coaches`.
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
- [x] Añadir navegacion hacia `/app/class-types`.
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
- [x] Añadir navegacion hacia `/app/schedule`.
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
  - un coach no puede quedar `assigned` en dos bloques activos solapados del mismo tenant/dia; si aparecen solapes por datos legacy/importados o reglas futuras, se muestran como `conflict`.
- Definir el calculo generico de cobertura:
  - `covered`: bloque accionable con asignaciones validas `>= required_coaches` y sin conflicto;
  - `uncovered`: bloque accionable con `required_coaches > 0` y 0 asignaciones validas;
  - `insufficient`: bloque accionable con asignaciones validas `> 0` y `< required_coaches`;
  - `conflict`: coach con asignaciones validas en bloques activos que se solapan en fecha/hora, dentro del mismo tenant.
- Definir escenarios demo genericos multi-tenant, no STL:
  - tenant multi-centro con coaches activos, bloques cubiertos, sin cubrir, insuficientes e intento de solapamiento bloqueado;
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

- Prioridad del dashboard operativo: bloques sin cubrir, conflictos graves, cobertura insuficiente, riesgos de la semana y vistas de apoyo.
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

- Los bloques del horario recibido corresponden inicialmente a STL Tremañes.
- STL City debe usar las mismas franjas horarias iniciales, pero solo con actividades CrossFit y Wellness.
- Las asignaciones iniciales pueden generarse aleatoriamente por centro como dato editable.
- La asignacion aleatoria debe evitar solapar al mismo coach cuando sea posible.
- Los coaches deberian registrarse o aceptar invitacion con el correo que prefieran; no conviene crear cuentas reales por ellos con emails inventados.
- Se puede crear un usuario tecnico interno para Henalu Paes de Barros con `henalupaesdebarros@gmail.com`, rol admin tecnico y visibilidad oculta para el equipo operativo.
- Perfiles operativos iniciales STL pendientes de Auth:
  - Roberto: `admin`, alias Rober, STL Tremañes, 20 horas.
  - Juanma: `admin`, STL City, 20 horas.
  - Nuria: `manager`, STL Tremañes, 20 horas.
  - Pedro: `manager`, alias Pedrin, STL Tremañes, 20 horas.
  - Valentina Oxley: `coach`, STL Tremañes, 20 horas.
  - Noah: `coach`, STL Tremañes, 20 horas.
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
- [x] Añadir `coach_profiles.person_profile_id`.
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
- [x] `manager` no recibe permisos completos sobre perfiles personales sensibles; tras B.2 puede ajustar fichas operativas de coach, sin altas, roles ni vinculaciones de cuenta.
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
- `manager` no recibe permisos completos de gestion de perfiles personales en esta tarea; tras B.2 su alcance operativo cubre fichas de coach, horarios, asignaciones, cobertura y plantillas.

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
- [x] Tras B.2, `owner`, `admin` y `manager` pueden crear/reactivar/retirar asignaciones operativas.
- [x] `manager` queda documentado como rol operativo para horarios/cobertura, sin configuracion global ni accesos.
- [x] Bloque, coach profile, person profile y assignment se validan dentro del mismo `organization_id`.
- [x] No se asigna a bloques `cancelled` o `completed`.
- [x] No se asigna `coach_profile` inactivo.
- [x] No se asignan perfiles `internal`.
- [x] Si un coach tiene `user_id`, su membership debe estar activa para asignar y contar cobertura.
- [x] Las asignaciones `pending`, `declined` y `removed` no cuentan como cobertura valida.
- [x] Un coach `assigned` no puede solaparse con otro bloque activo del mismo tenant y dia; Postgres lo bloquea con `coach-unavailable`.

Decisiones tecnicas:

- Task 010 no requirio migracion de schema para crear `schedule_block_assignments`: ya incluia `organization_id`, FK tenant-scoped a bloque y coach, `assignment_status`, `source` y unicidad por bloque+coach.
- `schedule_block_assignments` pasa a ser la fuente canonica de quien cubre cada bloque real.
- Desde 2026-05-11, `00011_schedule_assignment_overlap_guard.sql` bloquea en Postgres nuevas asignaciones activas solapadas del mismo coach; `conflict` queda para datos legacy/importados o reglas futuras que no dependan solo del solape temporal.
- `coverage_issues` sigue calculandose al vuelo durante MVP 1; no se crea tabla persistida.
- Tras B.2, `manager` entra con permisos operativos acotados en app/RLS, sin heredar administracion completa.

Cobertura basica:

- `covered`: bloque activo con asignaciones validas `>= required_coaches` y sin conflicto.
- `uncovered`: bloque activo con `required_coaches > 0` y 0 asignaciones validas.
- `insufficient`: bloque activo con asignaciones validas `> 0` y `< required_coaches`.
- `conflict`: el mismo coach tiene asignaciones validas en bloques activos solapados el mismo dia.
- `cancelled` y `completed` se muestran sin riesgo activo.
- `required_coaches = 0` se muestra como bloque sin requisito de cobertura: no vacante, no asignado y sin riesgo accionable.

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

Objetivo: añadir filtros compartibles a `/app/schedule` para desbloquear la operativa semanal de MVP 1 sin crear dashboard ni plantillas.

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
- [x] Añadir enlace para limpiar filtros conservando `organizationId` y `week`.
- [x] Conservar filtros saneados al cambiar semana y tras mutaciones admin.
- [x] Mantener `schedule_block_assignments` como fuente canonica para el filtro de coach asignado.
- [x] Mantener nombres visibles desde `person_profiles.display_name` y fallback tecnico claro cuando falta perfil visible.

Validaciones server-side aplicadas:

- [x] La pagina sigue resolviendo usuario autenticado, membership activa y organizacion activa antes de leer datos.
- [x] Todas las lecturas operativas siguen filtrando por `organization_id`.
- [x] `center_id`, `coach_profile_id` y `class_type_id` se aceptan solo si pertenecen al tenant activo.
- [x] Filtros invalidos o ajenos al tenant se ignoran sin romper la pantalla.
- [x] Tras B.2, `owner`, `admin` y `manager` conservan mutaciones de bloques/asignaciones y `coach` conserva lectura.
- [x] `manager` entra en app/RLS como rol operativo tenant-wide, sin permisos por centro.

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

Objetivo: añadir a `/app/schedule` un filtro compartible para que un coach vea sus bloques asignados, sin crear dashboard, plantillas ni flujos de cambios.

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
- [x] Tras B.2, `owner`, `admin` y `manager` conservan todos los filtros y mutaciones operativas existentes.
- [x] `coach` conserva modo lectura y puede usar "Mi horario".
- [x] `manager` recibe en B.2 alcance operativo tenant-wide en app/RLS, sin configuracion global ni accesos.

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
- [x] Añadir navegacion hacia `/app/templates` conservando `organizationId` y `week`.
- [x] Mantener Next.js App Router con Server Components por defecto.
- [x] Mantener `organization_memberships` como fuente de rol y tenant.
- [x] Admin puede listar plantillas semanales del tenant activo.
- [x] Admin puede crear y editar plantillas semanales con nombre, alcance opcional de centro, fechas de validez y estado.
- [x] Admin puede crear y editar bloques de plantilla con dia, centro, tipo, horas, coaches necesarios, coach por defecto opcional y notas.
- [x] Plantillas con `default_coach_profile_id = null` quedan como huecos vacantes.
- [x] Plantillas con `default_coach_profile_id` crean asignaciones de origen `template` al aplicarse.
- [x] Aplicar una plantilla activa a una semana crea `schedule_blocks` reales con `template_id`, `template_block_id` e `is_template_exception = false`.
- [x] Aplicar la misma plantilla dos veces sobre la misma semana no duplica bloques ya creados para el mismo `template_block_id` y `service_date`.
- [x] Plantillas activas con `valid_from` y `valid_until` rellenan automaticamente las semanas del rango al guardar la plantilla/bloques o abrir Horario con rol operativo.
- [x] Aplicar manualmente otra plantilla sobre una semana ya cubierta exige confirmacion y sustituye solo los bloques de plantilla de esa semana/alcance.
- [x] Editar o cancelar un bloque aplicado desde plantilla en `/app/schedule` marca `is_template_exception = true`.
- [x] Coach puede consultar plantillas en modo lectura.
- [x] Server Actions revalidan usuario, tenant, membership y rol operativo B.2 antes de mutar.
- [x] No borrar plantillas desde UI; las plantillas se archivan con `status = 'archived'`. Los bloques de plantilla se pueden retirar desde UI solo con confirmacion explicita.
- [x] No crear dashboard, cambios de turno, invitaciones, ausencias, fichaje, payroll, mobile nativo, IA ni geolocalizacion.
- [x] No hardcodear STL en rutas, componentes, permisos ni defaults.
- [x] Actualizar README, brief, arquitectura, MVP, guias de edicion y guias de usuario.

Validaciones server-side aplicadas:

- [x] Usuario autenticado.
- [x] Membership activa y organizacion activa/resuelta.
- [x] Tras B.2, `owner`, `admin` y `manager` mutan plantillas en este corte operativo.
- [x] `center_id`, `class_type_id`, `default_coach_profile_id`, plantilla y bloque de plantilla se validan dentro del mismo `organization_id`.
- [x] Un coach por defecto debe ser asignable: `coach_profile` activo, persona visible si existe, membership activa si hay `user_id`.
- [x] Solo plantillas semanales `active` se aplican a semanas reales.
- [x] Plantillas `archived` no se modifican desde las acciones de bloques.
- [x] Plantillas activas se pueden contraer/expandir de forma individual y global para reducir scroll en plantillas grandes.
- [x] "Eliminar plantilla" archiva con confirmacion, `archived_at` y `recoverable_until` de 30 dias; no borra fisicamente.
- [x] Plantillas archivadas salen de la lista activa y se pueden recuperar como borrador durante la ventana de recuperacion.
- [x] Archivar una plantilla no borra `schedule_blocks` ni `schedule_block_assignments` ya generados.
- [x] Eliminar un bloque de plantilla exige confirmacion, borra el patron `schedule_template_blocks`, retira `schedule_blocks` generados activos/no excepcionales derivados de ese bloque y conserva historico protegido (`cancelled`, `completed` o excepciones) desacoplando `template_block_id`.
- [x] La aplicacion de plantilla conserva la frontera `organization_id` en bloques y asignaciones.

Decisiones tecnicas:

- Task 013 original no creo migracion nueva; el ajuste posterior de archivado seguro anade `00016_schedule_template_archive_retention.sql` y actualiza tipos Supabase para `archived_at`/`recoverable_until`. El ajuste posterior de borrado confirmado de bloques de plantilla anade `00034_schedule_template_block_delete_audit.sql` para permitir auditoria operativa `removed` en `schedule_template_blocks`.
- `/app/templates` se limita a `template_type = 'weekly'`; plantillas mensuales quedan fuera de este corte.
- `draft` permite preparar plantillas; `active` permite aplicarlas; `archived` conserva patrones sin borrado desde UI.
- La recuperacion devuelve una plantilla archivada como `draft` para evitar aplicar rangos automaticamente sin una decision explicita.
- La retencion de plantillas archivadas queda separada de la retencion funcional de horarios generados, inicialmente tratada como 2-4 anos sin asumir que sea la obligacion legal de fichaje.
- La retirada de un bloque de plantilla no sustituye la auditoria legal ni payroll: registra un evento operativo corto, elimina solo el patron y sincroniza el horario generado segun excepciones.
- La aplicacion de plantilla redirige a `/app/schedule` para revisar la semana creada.
- `source = 'template'` distingue asignaciones heredadas de plantilla frente a asignaciones manuales.
- Los bloques vacantes dependen del calculo de cobertura existente para aparecer como `uncovered` si requieren coach.
- Evitar duplicados se hace por plantilla, bloque de plantilla y fecha de servicio dentro de la semana destino.
- Una plantilla con rango de validez actua como base operativa; una aplicacion manual confirmada actua como excepcion semanal y no toca el resto del rango.
- La sustitucion semanal borra los bloques generados por otra plantilla en esa semana/alcance y conserva bloques manuales no vinculados a plantilla.
- Editar o cancelar un bloque aplicado marca excepcion, pero no persiste historial `antes -> despues`; auditoria detallada queda como dependencia futura.
- Tras B.2, `manager` muta plantillas como operativa MVP 1, sin configuracion global ni accesos.

Verificacion:

- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `npm run build`
- [x] `rg -n "STL" src` sin coincidencias.
- [x] Comandos Supabase no aplican porque no hay migracion nueva ni cambios en tipos generados.

## Task 014 - Dashboard Operativo Basico De Cobertura

Estado: completada y validada tecnicamente.

Objetivo: convertir `/app` en el primer dashboard operativo basico de cobertura, basado en cola accionable de riesgos y sin crear dashboard visual final, solicitudes, ausencias ni datos reales hardcodeados del primer tenant.

Alcance ejecutado:

- [x] Detectar que Task 008 y Task 013 ya estaban cerradas.
- [x] Mantener `/app` como Server Component y superficie protegida por auth/membership.
- [x] Mantener `organization_memberships` como fuente de rol y tenant.
- [x] Resolver `organizationId` igual que el resto de superficies protegidas.
- [x] Reutilizar `resolveWeek` y `calculateScheduleCoverageByBlock` como fuente canonica de semana y cobertura al vuelo.
- [x] Cargar bloques, asignaciones, centros, tipos, coaches, personas y memberships filtrando por `organization_id`.
- [x] Tras B.2, mostrar dashboard para `owner`, `admin` y `manager`; `coach` conserva una vista de lectura con accesos a Mi horario y plantillas.
- [x] Mostrar resumen semanal de riesgos activos, bloques sin cubrir, conflictos y bloques activos.
- [x] Ordenar la cola por `uncovered`, `conflict` e `insufficient`.
- [x] Enlazar cada riesgo al bloque real en `/app/schedule` mediante anchors `block-{id}`.
- [x] Añadir vistas de apoyo por centro con atajos filtrados al horario semanal.
- [x] Añadir empty state cuando no hay bloques y cuando no hay riesgos activos.
- [x] Añadir `loading.tsx` y `error.tsx` en el segmento `/app`.
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
- Tras B.2, `manager` entra en el dashboard operativo sin configuracion global ni accesos.
- Este corte no es dashboard visual final: queda pendiente validarlo con semana real y repetir audit visual en navegador.

Verificacion:

- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `npm run build`
- [x] `rg -n "STL" src` sin coincidencias.
- [x] Comandos Supabase no aplican porque no hay migracion nueva ni cambios en tipos generados.

## Task 015 - Smoke Tests Basicos De Rutas Protegidas Y Flujos MVP 1

Estado: completada y validada tecnicamente.

Objetivo: cerrar la primera deuda tecnica verificable posterior al dashboard operativo basico con smoke tests de rutas protegidas y flujos MVP 1, sin abrir features grandes ni depender de datos reales del primer tenant.

Alcance ejecutado:

- [x] Detectar que la siguiente tarea accionable real era deuda tecnica de smoke tests, no cambios, ausencias, fichaje ni dashboard visual final.
- [x] Añadir Playwright como dev dependency del proyecto.
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
- [x] Implementar fix pequeño y directo en `/app/coaches`: la tabla de memberships queda dentro de un contenedor `overflow-x-auto` para no quedar recortada por la card en 375px.
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
- La UI protegida conserva muchos controles compactos (`Button size="sm"`, inputs/selects de 32-36px) que quedan por debajo del objetivo tactil de 44px en movil. Se documenta como deuda responsive, pero no se cambio globalmente para no rediseñar densidad ni alterar todas las superficies en esta tarea.
- El script de contraste marco el boton negro de login como falso positivo por normalizacion `lab(...)`; la inspeccion visual y los tokens usados no indican un problema real de contraste en ese boton.

Limitaciones:

- El audit uso tenant demo y una cuenta local temporal, no una semana real del primer tenant.
- No se valido tema de tenant persistido porque `organizations.theme_config` sigue fuera de scope.
- No se valido usuario `coach` autenticado por falta de credenciales E2E reales; el modo lectura queda cubierto por smoke opcional y por revision de UI/roles existentes.
- No se probo con lector de pantalla real ni con dispositivo fisico; se hizo verificacion automatizada de DOM, screenshots, teclado basico y viewports.

Decisiones tecnicas:

- Mantener Playwright como herramienta de audit puntual y no crear un nuevo script npm hasta que este audit se repita de forma recurrente.
- Mantener la densidad compacta de shadcn/ui en desktop/tablet; la mejora de targets tactiles debe abordarse como tarea dedicada si se decide adaptar controles por pointer/viewport.
- No convertir la tabla de memberships en cards moviles en esta tarea; el scroll horizontal es el fix minimo para evitar contenido inaccesible sin abrir una fase de rediseño.

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
- [x] Reorganizar navegacion principal: Inicio, Horario, Cobertura, Equipo y Mas para roles operativos de gestion; `coach` no ve Cobertura en el menu principal.
- [x] Implementar bottom navigation en mobile y sidebar en desktop/tablet.
- [x] Crear `/app/coverage` como cola accionable de riesgos semanales.
- [x] Crear `/app/more` para gestion, ayuda, guia y configuracion futura no implementada.
- [x] Rediseñar `/app` como dashboard operativo con saludo, cobertura, resumen, pendientes y accesos rapidos.
- [x] Ajustar `/app/schedule` hacia una vista de Horario con selector de semana y tabs Semana / Mi semana / Sin cubrir.
- [x] Reetiquetar `/app/coaches` como Equipo y limpiar copy visible de membership/Auth/tenant en texto principal.
- [x] Limpiar copy visible en Centros, Tipos de actividad, Plantillas y Login.
- [x] Crear onboarding inicial con `localStorage` key `boxops_onboarding_seen_v1`.
- [x] Añadir "Reiniciar guia" desde `/app/more`.
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

Estado: cerrada para QA interno el 2026-05-07, sin considerarla validacion oficial ni produccion. Existe una semana de prueba L-V para STL cargada localmente como fixture no automatico, una muestra representativa de coaches por defecto/asignaciones/vacantes, y smoke E2E local admin/coach. La validacion oficial con STL sigue pendiente antes de presentar el piloto como definitivo.

Sigue bloqueando para piloto oficial, pero no para smoke interno:

- priorizacion final del dashboard operativo;
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
- Semana de prueba recibida el 2026-05-06: lunes a viernes, 33 bloques diarios, clases simultaneas normales, cada bloque requiere 1 coach y `CrossFit Teens` dura 90 minutos.
- Fixture local creado en `supabase/snippets/stl-test-week-2026-05-04.sql`: 1 plantilla activa, 165 bloques de plantilla, 165 bloques reales y 0 asignaciones.
- Smoke E2E local con tenant STL y semana `2026-05-04`: 14 passed, incluido `/app/schedule?mine=1`; `/app/templates` se ajusto para no renderizar formularios cerrados por cada bloque.
- Fixture interno de asignaciones creado en `supabase/snippets/stl-internal-assignment-sample-2026-05-04.sql`: 20 bloques de plantilla con coach por defecto, 20 bloques reales asignados, 145 bloques vacantes y 1 caso de cobertura insuficiente. Ya no siembra un conflicto deliberado porque el guardrail Postgres anti-solape lo rechaza. El usuario E2E coach local queda vinculado a la ficha operativa de Lucas si existe en Auth.

- [x] Recoger una semana real de horarios de STL Tremañes y STL City.
- [x] Separar bloques que son clases de bloques que son recepcion, evento, competicion, open box u otra actividad.
- [ ] Confirmar para cada bloque real: centro, fecha, hora inicio, hora fin, tipo, coaches necesarios, coach asignado si existe, notas operativas y estado.
- [x] Listar coaches activos, roles operativos y responsabilidades.
- [ ] Documentar coaches que trabajan en ambos centros.
- [x] Confirmar si todos los coaches necesitan `coach_profile` o si hay personas no-coach que tambien tendran membership.
- [x] Identificar tipos de clase actuales: WOD, CrossFit For Fun, Wellness, Open Box, Fundamentals, recepcion, eventos y otros.
- [x] Confirmar nombres exactos usados por STL y longitudes habituales para evitar copy truncado en UI futura.
- [x] Documentar clases/bloques sin cubrir o problemas frecuentes de cobertura.
- [x] Documentar ejemplos de cobertura insuficiente con mas de un coach requerido, si existen.
- [x] Documentar solapamientos reales o situaciones multi-centro que el producto debe detectar.
- [x] Confirmar reglas de plantillas: semanal, mensual o ambas.
- [x] Confirmar si la primera plantilla debe tener coach por defecto, solo bloque vacante o ambas opciones.
- [x] Documentar si hay certificaciones necesarias por tipo de clase.
- [x] Confirmar si coaches deben ver horario completo del equipo, solo su contexto o una vista mixta.
- [x] Validar si el primer dashboard debe priorizar centro, coach, clases sin cubrir o cola de riesgos.
- [ ] Confirmar si eventos/festivos deben modelarse como bloques, dias completos o ambas cosas.
- [x] Confirmar si los datos reales pueden convertirse en fixture anonimizado para pruebas.
- [x] Cargar una muestra representativa editable para QA interno con coaches reales del tenant, huecos vacantes, insuficiencia y conflicto.

Criterio de salida:

- [x] `docs/tenants/stl/README.md` actualizado solo con datos validados, sin inventar informacion.
- [x] `docs/product/open-questions.md` actualizado con respuestas o nuevas dudas concretas.
- [x] Semana real de ejemplo lista para guiar asignaciones, plantillas y cobertura.
- [x] Plantillas y bloques reales tienen muestra interna con coaches por defecto y huecos vacantes para smoke tests.
- [x] Decisiones que afecten al producto generico documentadas sin contaminar `src/` con STL.

Nota 2026-05-07: ver `docs/operations/mvp1-fase-a-validation.md`. La semana de ejemplo y la muestra de asignaciones quedan listas para QA interno, pero no deben convertirse en seed automatico ni en datos de produccion hasta la validacion oficial de STL.

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
- [x] Impacto de ausencias sobre cobertura como lectura derivada (I.16), sin resolucion automatica.

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
- [ ] Depender de "Mi firma" creada previamente en Fase D; no mezclar creacion de firma personal con firma de documento salvo flujo inline decidido.
- [ ] Permitir firmar con una accion simple que use la firma guardada del usuario autenticado.
- [ ] Guardar una copia/snapshot de la firma usada en el documento, entidad firmada o version firmada.
- [ ] Mantener auditoria minima de firma: organizacion, documento/version o entidad firmada, usuario autenticado, persona firmante, fecha/hora, snapshot usado, estado e IP/user agent si se decide.
- [ ] Impedir que admins/managers firmen en nombre de otra persona usando su firma guardada.
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
- [ ] Configuracion de categorias de tipos de actividad por tenant: el admin debe poder añadir, editar, desactivar y eliminar categorias visibles en `/app/class-types` cuando exista el modulo de Configuracion. La fase futura debe revisar la lista fija actual y el `CHECK` de `class_types.category`; si una categoria ya esta en uso, priorizar archivar/desactivar antes que borrado destructivo para preservar historial de bloques.
- [ ] Exportes CSV/PDF.
- [ ] Integraciones con reservas/alumnos.
- [ ] App movil nativa.
- [ ] Validacion automatica de certificaciones contra tipos de clase.
- [ ] Geofencing avanzado, si legal y operativamente procede.
