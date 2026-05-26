# Roadmap - BoxOps

Este roadmap resume las fases logicas despues de Task 017. `TASKS.md` mantiene el backlog ejecutable y el historial de tareas; este documento es la vista corta para decidir que va antes y que queda fuera.

## Estado Base

MVP 1 visual/operativo ya esta avanzado:

- auth Supabase SSR, multi-tenant por membership y rutas protegidas bajo `/app`;
- centros, equipo/coaches, perfiles visibles/personas operativas y tipos de actividad;
- horario semanal, asignaciones coach-bloque, cobertura basica, filtros, "Mi horario" y riesgos;
- jornada prevista del personal en `/app/schedule` mediante `staff_work_windows`, como presencia planificada separada de bloques/asignaciones y fuente opcional de fichaje automatico `schedule_auto`;
- plantillas semanales basicas con rango de validez, retirada confirmada de bloques de plantilla, excepciones semanales confirmadas, dashboard, `/app/coverage`, `/app/more`;
- navegacion mobile-first, onboarding local, smoke tests y audit visual/responsive de Task 017.

Ya existe un primer workflow minimo de solicitudes/ofertas de cambio/cobertura en I.1-I.8, sin swap, y una base interna DB/RLS/RPC de ausencias en I.10 con capa server/app interna en I.11. I.12 abre una primera bandeja visible protegida en `/app/absences`, I.13 anade creacion minima de solicitud propia, I.14 endurece esa superficie con filtros por query string, validacion visible y estados no accionables, I.15 anade QA/smoke de regresion sin abrir calendario ni creacion para otra persona, I.16 integra el impacto de ausencias aprobadas o en revision en la lectura de cobertura de `/app/schedule`, `/app/coverage`, Inicio y `/app/stats`, e I.25 anade trazabilidad operativa reciente en detalle de `/app/schedule` y `/app/coverage` para explicar cambios/ausencias sin resolver cobertura. I.17 deja modelados eventos, festivos y competiciones como contexto operativo tenant-scoped, I.18 abre la foundation tecnica interna `operational_events` con DB/RLS/RPC y helper server-side, e I.19 los hace visibles de forma minima en `/app/schedule`, sin UI grande ni impacto automatico en horario/cobertura. I.20 deja modeladas horas extra solo como candidatos operativos revisables, separando planificacion, fichaje, diferencias y revision operativa futura de cualquier aprobacion legal/payroll; I.21 abre la foundation tecnica interna `overtime_candidates` con DB/RLS/RPC/helper y guardrail de fuente; I.22 anade QA/RLS con verificacion SQL rollback y smoke endurecido; I.23 abre una primera cola visible minima en `/app/time` para `owner`/`admin`/`manager`; I.24 anade deteccion server-side prudente y manual de candidatos de posible exceso con resultado minimo de creados, ya existentes e ignorados por datos insuficientes; I.26 deja IA como modelado futuro subordinado a documentos/programacion utiles, permisos, auditoria y privacidad, sin IA funcional; E.6/I.27 modela programacion util asociada a documentos y horario como paso previo a cualquier IA; E.7/I.28 crea `document_programming_links` como foundation interna con RLS/RPC/helper para asociar documentos/versiones a fecha/tipo/centro/bloque; E.8/I.29 muestra programacion autorizada desde el detalle de bloque en `/app/schedule`, con acciones solo si `can_preview`/`can_download`; E.9/I.30 anade QA interno no visible con SQL rollback y smoke para validar grants, metadata limitada, denegaciones, cross-tenant y que asignaciones no conceden permiso documental; E.10/I.31 anade runbook operativo interno local/QA con plantilla rollback y checklist manual para validar casos controlados; E.11 abre `/app/documents` como primer repositorio documental visible minimo, listado por `can_access_document` y archivo por rutas E.5; E.12 prepara QA/staging controlado, E.13 cierra evidencia local/bloqueos, E.14 reintenta validacion real con archivo Storage controlado sin desbloquear staging por falta de acceso, E.15 actualiza ese desbloqueo controlado con relectura de entorno redacted, E.16 deja handoff operativo redacted para desbloquear QA/staging real cuando exista operador con acceso y E.19 anade un primer adjunto minimo `company`/`programming` desde `/app/documents` para roles autorizados. Todo sigue sin mutaciones de horario/fichaje, calculo definitivo, automatismo legal, decisiones por IA ni payroll. El impacto de ausencias sigue calculado al vuelo, no persiste `absence_schedule_impacts`, no modifica `schedule_blocks` ni `schedule_block_assignments` y no resuelve cobertura automaticamente. No existen todavia calendario completo de ausencias, calendario avanzado de eventos/festivos/competiciones, documentos firmables, gestor documental completo, subida masiva/reemplazo documental visible, fichaje geolocalizado activo, RRHH completo, payroll, horas extra aprobadas, IA funcional ni app movil nativa. Roles avanzados compatibles, area personal minima, matriz documental de permisos personales, modelo documental de avatar privado, primer avatar privado propio, "Mi firma" privada propia, fichaje manual propio con correcciones trazadas, vista semanal de fichaje, historial visible de cambios, fichaje automatico web por planificacion, base backend de cierre semanal/aprobacion firmada, primer corte de avisos in-app en Inicio, exporte interno revisable CSV y runbook F.15 de readiness de fichaje ya existen como cortes B.2, D.1, D.2, D.3, D.4, D.5 y F.4-F.15. G.1 deja documentado el primer modelo seguro de ubicacion asistida, G.2 cierra la decision tecnica/legal previa, G.3 crea una base tecnica interna de schema/RPC/RLS y G.4 crea una capa server/app interna. G.3/G.4 no crean UI visible, no leen `navigator.geolocation`, no activan geofencing ni fichaje automatico por ubicacion.

OD.1/I.32 documenta el cierre de operativa diaria completa para beta interna en `docs/operations/daily-operations-beta-readiness-runbook.md`. No abre codigo ni producto nuevo: ordena que flujos diarios estan listos, que requiere real/staging, que queda bloqueado por datos/credenciales/entorno, smokes por rol, evidencia, deuda UX menor, deuda bloqueante y limites de v1 comercial. Cobertura, ausencias, eventos y jornada prevista siguen siendo contexto operativo y no resuelven cobertura automaticamente.

F.15 documenta el cierre de fichaje web y cierre laboral prudente para beta interna en `docs/operations/time-tracking-beta-readiness-runbook.md`. No abre codigo ni producto nuevo: ordena que flujos de fichaje estan listos, que requiere real/staging, que queda bloqueado por datos/credenciales/entorno/legal, smokes por rol, evidencia, deuda UX menor, deuda bloqueante y limites de v1 comercial. El automatico por planificacion no prueba presencia real, la jornada prevista puede alimentar `schedule_auto` pero no es payroll ni prueba definitiva, la aprobacion firmada es confirmacion interna, los candidatos de posible exceso no son horas extra aprobadas y el CSV es interno revisable.

Decision de producto 2026-05-13: BoxOps no pedira ubicacion desde la webapp. La web evolucionara hacia fichaje manual + automatico por planificacion, cierre semanal enviado cada domingo a las 23:59, aprobacion firmada o rechazo con nota, notificaciones in-app y reenvio tras correcciones. La geolocalizacion real queda para app nativa/wrapper futuro si el negocio exige background/geofencing.

Decision 2026-05-15: `/app/schedule` incorpora jornada prevista del personal mediante `staff_work_windows`. Es presencia planificada y tenant-scoped, no bloque, no asignacion, no plantilla y no payroll. Se expande al vuelo para la semana visible, permite solapes entre personas sin conflicto, da contexto visual por dia/celda/detalle de bloque y no bloquea crear bloques ni asignar entrenadores. Desde el corte 2026-05-23 puede alimentar fichajes automaticos `schedule_auto` si el tenant activa `scheduleAutoPunchesEnabled`; esos punches declaran `presenceVerified = false` y son corregibles. Todos los miembros activos del tenant ven franjas activas como contexto compartido del dia; `owner`, `admin` y `manager` gestionan y pueden revisar tambien inactivas; roles especializados siguen sin permisos de gestion.

Decision I.19 2026-05-15: `/app/schedule` muestra `operational_events` como contexto semanal/del dia en una tarjeta compacta. `owner`, `admin` y `manager` pueden crear, editar, cancelar, reactivar y archivar desde formularios colapsados; `coach` solo lee eventos visibles por `visibility` y RLS. No hay calendario avanzado, conversion a bloques, cancelacion automatica, cobertura automatica, fichaje, payroll ni voluntariado legal de festivo.

Decision I.20 2026-05-16: horas extra se modela solo como candidato operativo derivable de planificacion, fichaje y contexto, no como nomina ni calculo legal. El corte no crea schema, UI ni acciones; define `overtime_candidates` como nombre candidato preferente, estados prudentes (`detected`, `needs_review`, `under_review`, `operationally_validated`, `operationally_rejected`, `superseded`, `closed`), permisos futuros y datos prohibidos. Aprobar una semana de fichaje, aceptar una cobertura, trabajar un evento/festivo o fichar mas minutos no aprueba horas extra por si solo.

Decision I.21 2026-05-16: se implementa la base tecnica minima de horas extra candidatas como foundation interna, no como producto visible. `00039_overtime_candidates_foundation.sql` crea `overtime_candidates`, `overtime_candidate_sources` y `overtime_candidate_events` con `organization_id`, RLS, escritura directa bloqueada y RPCs acotadas para crear senales, anadir fuentes, cambiar estado operativo y listar candidatos; `00040_overtime_candidates_retention_guard.sql` ajusta la retencion a la ultima revision/cierre. `src/lib/overtime-candidates.ts` anade helper server-side con sesion normal y permisos previos; la revision queda limitada a `owner`, `admin` y `manager`, con lectura propia minimizada. No hay UI, Server Actions de producto, calculo definitivo, aprobacion legal/payroll, importes, saldos, compensaciones, exporte legal ni mutaciones de fichaje/horario.

Decision I.22 2026-05-16: se ejecuta QA/RLS tecnico sobre horas extra candidatas sin ampliar producto. `supabase/snippets/overtime-candidates-rls-verification.sql` verifica con transaccion y rollback paths positivos de `owner`/`admin`/`manager`, lectura propia minimizada, bloqueo de coach/payroll_manager/otro tenant, validacion de fuentes personales y de tenant, bloqueo de candidatos `closed`/`superseded`, escritura directa `INSERT`/`UPDATE`/`DELETE` bloqueada para `authenticated` y ausencia de mutaciones sobre `schedule_blocks`, `schedule_block_assignments`, `time_records` y `time_punches`. El smoke de foundation exige el snippet, mantiene fuera UI visible y refuerza guardrails de no payroll/importes, no `service_role`, no STL y no geolocalizacion/push/cache.

Decision I.23 2026-05-16: `/app/time` muestra una primera revision operativa visible de candidatos de posible exceso para `owner`, `admin` y `manager`. Lista datos minimizados desde `listOvertimeCandidates(...)`, permite cambios de estado operativos mediante Server Action que delega en `setOvertimeCandidateStatus(...)` y deja `closed`/`superseded` sin accion. `coach` no ve cola tenant-wide ni acciones, `payroll_manager` no hereda acceso por ese rol, y la UI evita lenguaje de aprobacion legal, nomina, importes, compensaciones o saldos. No hay creacion manual visible, calculo definitivo, exporte legal ni mutacion de fichaje/horario.

Decision I.24 2026-05-16: `/app/time` anade el control protegido `Detectar posibles excesos` para `owner`, `admin` y `manager`. La accion llama a `src/lib/overtime-candidate-detection.ts`, lee contexto existente de fichaje, cierre semanal, horario, asignaciones y jornada prevista, y crea candidatos solo con diferencia positiva clara entre minutos planificados snapshot y trabajados snapshot. Fichajes abiertos, correcciones pendientes, semanas reabiertas o datos incompletos fuerzan `needs_review`; la UI muestra solo creados, ya existentes e ignorados por datos insuficientes. No hay cron, scheduler, automatismo legal, payroll, aprobacion definitiva ni mutacion de tablas fuente.

Decision I.25 2026-05-16: `/app/schedule` y `/app/coverage` muestran una trazabilidad operativa reciente por bloque para `owner`, `admin` y `manager`. La fuente sigue siendo el horario real (`schedule_blocks` + `schedule_block_assignments`); la explicacion combina impacto de ausencias calculado al vuelo, estados/eventos de `change_requests` y una RPC filtrada sobre `operational_audit_events` para bloques, asignaciones y bloques de plantilla con retencion vigente. No muestra motivos sensibles, no persiste `absence_schedule_impacts`, no amplia acceso a `coach`/`payroll_manager`, no resuelve cobertura automaticamente ni muta horario, fichaje, ausencias o cambios.

Decision I.26 2026-05-16: IA queda subordinada a documentos/programacion utiles y no se implementa todavia. El encaje futuro debe partir de `documents`, `document_versions`, `document_subjects`, `document_access_grants`, `document_access_events` y, solo como contexto operativo, `schedule_blocks`/`schedule_block_assignments`. Antes de cualquier IA funcional hacen falta fuentes canonicas, permisos/grants, auditoria minimizada, privacidad/legal, politica de prompts/respuestas/retencion/proveedor y aislamiento estricto de tenant. Quedan prohibidas decisiones automaticas de cobertura, aprobaciones de cambios/ausencias/fichaje/horas extra, payroll, inferencias sensibles, uso cross-tenant y entrenamiento/fine-tuning con datos privados sin decision explicita.

Decision E.6/I.27 2026-05-16: el siguiente paso tras I.26 no es IA, sino programacion/documentos utiles. La fuente canonica debe ser `documents.document_scope = programming` con `document_versions` activas/archivadas como version consultable, `document_subjects` para relacion con tipo, centro o bloque, `document_access_grants` para permisos y `document_access_events` para auditoria. La fecha sin bloque requiere una asociacion tenant-scoped explicita antes de UI; E.7/I.28 la implementa con `document_programming_links`. `schedule_blocks` aporta fecha/hora/centro/tipo y `schedule_block_assignments` solo contexto operativo de coach asignado; ninguno concede por si solo permiso documental. Quedan fuera subida visible, documentos firmables, IA funcional, embeddings/RAG/vector search, decisiones automaticas, payroll, datos sensibles y uso cross-tenant.

Decision E.7/I.28 2026-05-16: `document_subjects` no basta para fecha/rango + tipo/centro/bloque, asi que se implementa `document_programming_links`. La tabla enlaza una version concreta de un documento `document_scope = programming` con `starts_on`/`ends_on` y contexto opcional de `class_type_id`, `center_id` o `schedule_block_id`. La lectura y las RPCs `list_document_programming_for_block`/`list_document_programming_for_context` filtran por `can_access_document`; la gestion usa RPCs internas y grants/capacidad documental real. No hay UI visible, subida, documentos firmables, IA, embeddings, vector search, RAG, SDKs, jobs ni cron.

Decision E.8/I.29 2026-05-16: `/app/schedule` muestra una primera superficie visible minima de programacion autorizada dentro del detalle de bloque. La lectura se prepara en servidor con `listDocumentProgrammingForBlock(...)`; la UI muestra fuente, version/fecha, vigencia y disponibilidad, y solo ofrece preview/descarga cuando `can_preview` o `can_download` lo permiten. Usa las rutas backend documentales E.5, no genera signed URLs desde cliente, no copia contenido a horario, no usa `schedule_block_assignments` como permiso y no abre subida visible, pagina documental completa ni IA.

Decision E.9/I.30 2026-05-16: la siguiente fase es QA interno y preparacion operativa no visible, no IA. `supabase/snippets/document-programming-schedule-qa-verification.sql` valida con rollback una asociacion activa por bloque/contexto, grants reales de `document_access_grants`, metadata limitada sin preview/descarga, denegacion de usuario asignado sin grant, bloqueo cross-tenant y no mutacion de `schedule_blocks`/`schedule_block_assignments`. El smoke `document-programming-qa` protege que la UI siga compacta, use solo las rutas backend E.5 para archivo y no abra subida, pagina documental completa, asociaciones visibles ni IA.

Decision E.10/I.31 2026-05-16: la siguiente fase sigue sin ser IA y se limita a preparacion operativa manual. `docs/operations/document-programming-manual-validation-runbook.md` explica como seleccionar o preparar `documents`, `document_versions`, `document_access_grants`, `document_programming_links` y `schedule_blocks` en local/QA, como verificar Horario con usuario con grant, solo metadata, sin grant y cross-tenant, y como limpiar mediante rollback. El smoke `document-programming-manual-validation` protege que no se abra UI documental, subida, pagina completa, asociaciones visibles ni IA.

Decision E.11 2026-05-17: `/app/documents` abre un primer repositorio documental visible minimo para beta interna. La lectura se hace con `list_accessible_document_versions(...)`, que filtra por tenant, documento/version activa o archivada y `can_access_document(..., 'read_metadata')`; `can_preview`/`can_download` deciden las acciones y las rutas backend E.5 siguen siendo la unica via de archivo. La superficie excluye `sensitive_hr`, documentos firmables, evidencias de firma y payroll, no crea subida visible, grants UI, auditoria visible, contratos reales, IA ni promesa legal documental definitiva. El runbook `docs/operations/document-repository-beta-readiness-runbook.md` documenta roles, bloqueos, evidencia, deuda y limites de beta/v1.

Decision E.12 2026-05-17: la siguiente fase prudente es validar E.11 con QA/staging controlado, no ampliar el modulo. `supabase/snippets/document-repository-beta-qa-verification.sql` crea datos sinteticos con rollback para usuario con descarga, usuario solo metadata, usuario sin grant, usuario de otro tenant, documento `programming`, documento `company` y documentos bloqueados por sensibilidad/firma. El runbook E.11/E.12 define evidencia esperada de listado, preview/download por E.5, auditoria, denegacion cross-tenant y estados vacios sin introducir subida, grants UI, auditoria visible, documentos firmables, payroll ni IA.

Decision E.13 2026-05-17: el cierre prudente del repositorio documental minimo es evidencia, no producto nuevo. El snippet E.12 se ejecuta en local con `ROLLBACK` y queda validado como QA tecnico local; QA/staging real queda bloqueado hasta tener acceso Supabase/DB, project ref, credenciales por rol, tenant QA y archivo Storage controlado. El runbook E.11-E.13 anade plantilla redacted para fecha, entorno, organizacion, rol, caso, documento/version, listado, preview, download, auditoria, cross-tenant, solo metadata, vacio sin grant, exclusiones sensibles y deuda, sin inventar evidencia ni abrir subida, grants UI, auditoria visible, documentos firmables, payroll o IA.

Decision E.14 2026-05-17: se reintenta la validacion QA/staging real controlada del repositorio documental minimo con archivo Storage controlado. El entorno actual no contiene `SUPABASE_ACCESS_TOKEN`, project/ref, DB URL real/staging, credenciales E2E por rol ni usuarios/casos documentales QA, asi que no se ejecuta staging ni se inventa evidencia. Se reejecuta el snippet E.12 en local con `ROLLBACK` y el runbook queda actualizado con bloqueo exacto para archivo `document-files`, preview/download E.5 y auditoria backend real.

Decision E.15 2026-05-17: se actualiza el desbloqueo controlado de validacion real del repositorio documental minimo. El entorno se releyo sin imprimir secretos: solo hay claves publicas locales de Supabase en `.env.local` entre las variables revisadas y no hay `SUPABASE_ACCESS_TOKEN`, project/ref, DB URL, credenciales E2E/casos documentales QA ni path de objeto `document-files` controlado. El snippet E.12 pasa de nuevo en local con `ROLLBACK`, pero QA/staging real sigue bloqueado y no hay evidencia de preview/download E.5 ni auditoria backend real en staging.

Decision E.16 2026-05-17: se documenta el handoff operativo controlado para desbloquear la validacion real QA/staging del repositorio documental minimo. El entorno se releyo sin imprimir secretos: `.env.local` sigue ignorado y no aporta project/ref, DB URL, credenciales/casos QA ni path de objeto `document-files` controlado; el proceso tampoco aporta acceso real. El snippet E.12 pasa de nuevo en local con `ROLLBACK`. El runbook ahora define capacidades necesarias, casos QA, checklist de operador, evidencia esperada y criterios de pass/bloqueado, sin inventar staging ni ampliar producto.

Decision OD.1/I.32 2026-05-17: el siguiente bloque del mapa es operativa diaria completa para beta interna. `docs/operations/daily-operations-beta-readiness-runbook.md` revisa Horario, Plantillas, Asignaciones, Cobertura, Solicitudes, Ausencias, Eventos, Jornada prevista, Inicio/dashboard por rol y smokes por rol. Es checklist y evidencia de readiness, no modulo nuevo: no resuelve cobertura automaticamente, no convierte contexto operativo en decisiones legales, no abre calendario avanzado, payroll, app nativa, documentos firmables ni IA.

Decision F.15 2026-05-17: el siguiente bloque del mapa es fichaje web y cierre laboral prudente para beta interna. `docs/operations/time-tracking-beta-readiness-runbook.md` revisa entrada/salida manual propia, vista semanal, correcciones, modo de aprobacion configurable, automatico web por planificacion, cierre semanal, aprobacion firmada interna, rechazo con nota, avisos en Inicio, CSV interno revisable, relacion con horario/asignaciones/jornada prevista y candidatos de posible exceso. Es checklist y evidencia de readiness, no modulo nuevo: no activa geolocalizacion web, app nativa, payroll, documentos firmables, IA ni cumplimiento legal definitivo.

## Mapa De Cierre - Webapp Completa, Beta Y V1

Estado 2026-05-17: se anade `docs/product/webapp-completion-roadmap.md` como mapa canonico de cierre. No sustituye este roadmap ni `TASKS.md`: ordena que falta para beta operativa, que falta para webapp v1 vendible y que queda como futuro opcional.

Decision principal: IA queda al final. Es un extra futuro posible, pero no forma parte de beta ni de v1 inicial. Antes de cualquier IA funcional deben estar cerrados documentos/versiones canonicos, grants, auditoria, privacidad/legal, aislamiento de tenant, programacion documental util y una webapp vendible sin depender de IA.

Lectura recomendada del cierre:

- Beta operativa interna: validar datos reales, entorno real/staging, Auth/email, purga de auditoria, credenciales E2E, smokes por rol y runbooks antes de seguir ampliando producto.
- Webapp v1 vendible: cerrar tenant/permisos, operativa diaria, fichaje web prudente, documentos/firma/certificaciones iniciales, hardening de produccion, onboarding SaaS y exportes necesarios.
- Futuro opcional: app nativa, push nativo, geofencing real, integraciones avanzadas y validaciones automatizadas solo si el negocio las exige.
- Ultimo extra: IA sobre programacion/documentos autorizados, con fuentes trazables y sin decisiones automaticas de cobertura, cambios, ausencias, fichaje, horas extra, payroll ni datos sensibles.

Orden de cierre propuesto:

1. Cierre de realidad operativa: Fase A + Carril S + Auth/email/purga/credenciales reales, ejecutado con `docs/operations/beta-operational-readiness-runbook.md`.
2. Base SaaS y permisos de tenant: Fase B, `docs/operations/tenant-readiness-checklist.md`, permisos por centro si aplican y onboarding de nuevo box.
3. Operativa diaria completa: Horario/Cobertura/Plantillas + Fase I sin automatismos sensibles, cerrada documentalmente con `docs/operations/daily-operations-beta-readiness-runbook.md`.
4. Fichaje web y cierre laboral prudente: Fase F con `docs/operations/time-tracking-beta-readiness-runbook.md`, revision legal/retencion/exportes antes de datos reales definitivos.
5. Documentos, firma documental y certificaciones: Fase D.5 + Fase E, abriendo UI visible solo por cortes seguros.
6. Hardening beta/produccion: ASVS, secretos, headers, backups, observabilidad, pruebas negativas y guias.
7. Comercializacion SaaS web: billing, soporte, importacion/carga guiada y documentacion comercial.
8. Nativo/push/geofencing si hay razon comercial.
9. IA como ultimo extra futuro.

## Carril Transversal S - Seguridad, Privacidad Y Tenant Safety

Objetivo: mantener ciberseguridad como calidad transversal durante todo el desarrollo, no como una fase tardia ni como un recordatorio generico.

Estado 2026-05-10: el proyecto ya tenia decisiones solidas repartidas por fases: tenant por `organization_memberships`, `organization_id` obligatorio, RLS, reset anti-enumeracion, permisos por capacidad, Storage privado para avatar/firma y grants para documentos. Se anade `docs/architecture/security-baseline.md` como baseline explicito y gate de roadmap.

Revision 2026-05-12: se incorpora al roadmap una auditoria operativa de aplicacion, tenant-scoped y de retencion corta, para accesos/usuarios y cambios relevantes de horario/plantillas. S.1.1 anade verificacion SQL/RLS con rollback y una funcion acotada de purga de eventos expirados, sin exponerla a la UI normal. Debe ayudar a admins a revisar "quien cambio que" sin convertir logs operativos en historico eterno ni sustituir backups/PITR/logs administrados de Supabase.

Revision S.2 2026-05-12: se ejecuta cierre tecnico pre-QA sin abrir modulos nuevos. Quedan typecheck, lint, build, smoke local, Supabase lint/migration list y verificacion RLS de auditoria operativa en verde; el runbook minimo vive en `docs/operations/pre-qa-controlled-pilot-runbook.md`. Los bloqueos antes de QA real son configuracion Resend/Supabase Auth/SMTP, prueba controlada de invitacion y reset, job de purga S.1 y limpieza de snippets `Untitled query`.

Revision S.3 2026-05-12: se ejecuta el gate controlado de email/Auth. La configuracion local de Resend existe y tiene formato plausible sin imprimir secretos, `.env.local` sigue ignorado/no trackeado y los `Untitled query` trackeados salen del indice. No se envia invitacion ni reset real porque faltan email interno permitido, credenciales E2E/admin y verificacion de configuracion Supabase Auth/SMTP del proyecto real. El mecanismo de purga S.1 queda definido como job DB/pg_cron preferente con fallback manual temporal.

Revision S.4 2026-05-12: se ejecuta QA real controlado pre-piloto STL sin resetear datos ni tocar superficies operativas. La plantilla local `Semana prueba STL L-V` sigue restaurada con 165 bloques de plantilla y 165 bloques generados para 2026-05-04 a 2026-05-08; typecheck, lint, build, smoke, Supabase lint/migration list y verificacion SQL/RLS pasan. La prueba real de invitacion/reset y la activacion del job de purga siguen bloqueadas por falta de email interno permitido, credenciales E2E/admin y acceso administrativo al proyecto Supabase real/scheduler.

Revision S.5 2026-05-12: se ejecuta el cierre operativo real de Auth/Email/Purga pre-piloto STL sin cambios de `src` ni datos operativos. Resend autentica localmente, pero el remitente queda limitado a `onboarding@resend.dev` y no hay dominios verificados visibles; Supabase Auth real/SMTP, email interno permitido, credenciales E2E/admin y scheduler/DB real siguen sin acceso verificable desde este entorno. La verificacion tecnica local vuelve a quedar verde, pero el piloto STL no queda desbloqueado.

Revision S.6 2026-05-12: se reintenta el desbloqueo operativo tras S.5 y el resultado sigue siendo "bloqueos restantes". `.env.local` y las variables de proceso no aportan acceso Supabase real/staging, project ref, credenciales E2E/admin ni email controlado; Resend autentica pero muestra 0 dominios verificados visibles y remitente `resend.dev`; el servidor local disponible es `127.0.0.1:3003`. La verificacion tecnica local pasa de nuevo, pero no se ejecutan invitacion, aceptacion, reset ni job real de purga por falta de acceso operativo real.

Revision S.7 2026-05-13: se consolida el pre-piloto sin abrir producto nuevo. `PROJECT_BRIEF.md` y este roadmap se reconcilian con `TASKS.md`/`domain-model.md` para reflejar que G.3/G.4 existen como base tecnica interna sin UI visible ni lectura real de ubicacion. El preflight de repo/env sigue limpio, Resend autentica con 0 dominios verificados visibles y remitente `resend.dev`, Supabase real/staging sigue sin acceso verificable y la verificacion local vuelve a pasar tras arrancar servidor temporal en `127.0.0.1:3003`. Invitacion, aceptacion, reset y job real de purga siguen bloqueados por falta de accesos reales.

Revision S.8/A.1 2026-05-17: el siguiente corte del mapa de cierre es realidad operativa para beta interna controlada, no desarrollo funcional. `docs/operations/beta-operational-readiness-runbook.md` convierte los bloqueos S.2-S.7 en checklist ejecutable: validacion oficial de datos reales, entorno real/staging, Supabase Auth Site URL/Redirect URLs/password policy, Resend/SMTP/remitente permitido, email interno controlado, credenciales E2E de `owner`/`admin`/`manager`/`coach`, invitacion/aceptacion/reset reales, job o fallback de purga, smoke anonimo/autenticado y evidencia minima. Beta interna sigue bloqueada hasta que ese checklist real pase; produccion sigue fuera hasta hardening/ASVS/backups/observabilidad. IA permanece como ultimo extra futuro.

Alcance:

- usar OWASP ASVS 5.0 Level 1 como baseline inicial de MVP/public beta y OWASP Top 10 2025 como mapa de riesgos;
- exigir tenant safety, permisos, RLS, validacion servidor y pruebas negativas en cada feature con datos de tenant;
- revisar dependencias, secretos, headers, Supabase Auth, Redirect URLs, buckets y logs antes de produccion;
- bloquear datos reales sensibles hasta cerrar gates de Storage privado, grants, auditoria y privacidad/legal;
- modelar auditoria operativa corta para accesos/usuarios y cambios relevantes de horario/plantillas;
- definir limpieza automatica por retencion antes de produccion y ejecutar la purga mediante job controlado;
- registrar deuda de seguridad aceptada cuando una mitigacion se difiera.

Criterio de salida transversal:

- cada modulo nuevo identifica datos, actores, capacidades y frontera de tenant antes de UI;
- las mutaciones revalidan sesion, tenant y permiso en servidor, y RLS actua como segundo candado;
- se prueban accesos denegados para otro tenant y roles sin permiso cuando el riesgo lo justifica;
- documentos, firmas, RRHH, fichaje y ubicacion no pasan a datos reales sin auditoria y privacidad/legal;
- los logs operativos tienen `retain_until`, politica de purga y datos minimizados antes de produccion;
- antes de beta/produccion se revisa el MVP contra ASVS Level 1 y se documentan desviaciones.

### S.1 - Auditoria Operativa Corta Y Retencion

Estado 2026-05-12: primer corte minimo implementado y S.1.1 endurecido. `operational_audit_events` guarda eventos tenant-scoped con actor derivado de sesion, campos cambiados minimizados y `retain_until`; las actions de Equipo, invitaciones, Horario, Asignaciones y Plantillas registran los cambios principales. La lectura interna queda en RPC/RLS para `owner`/`admin`, sin dashboard nuevo. Existe verificacion SQL/RLS local con rollback y `purge_expired_operational_audit_events(...)` como primitiva de purga no concedida a roles normales.

Objetivo: permitir revision administrativa de cambios relevantes sin guardar trazas eternas ni datos innecesarios.

Alcance candidato:

- auditoria de accesos/usuarios: altas o cambios de `organization_memberships`, roles, estado, vinculacion/desvinculacion de `person_profiles` y acciones administrativas equivalentes;
- auditoria de horario y clases: cambios de hora, fecha, centro, tipo de actividad, estado o notas de `schedule_blocks`, cambios de coach en `schedule_block_assignments` y cambios de plantillas/bloques de plantilla;
- datos minimos: `organization_id`, actor autenticado, membership/persona resuelta si existe, entidad objetivo, accion, resultado, campos cambiados minimizados, `created_at` y `retain_until`;
- consulta interna para `owner`/`admin` y permisos operativos compatibles cuando proceda, siempre filtrada por tenant;
- limpieza de eventos expirados mediante funcion SQL acotada y job/cron antes de produccion.

Retencion candidata:

- accesos/usuarios/admin: maximo 30 dias por defecto;
- horario, clases, asignaciones y plantillas: 15 dias por defecto;
- cualquier retencion mayor requiere decision legal/producto explicita, no queda implicita por ser "auditoria".

Fuera de alcance:

- guardar payloads completos, secretos, tokens, contrasenas, signed URLs, documentos, datos RRHH sensibles o ubicacion cruda;
- usar auditoria operativa como fuente canonica de negocio;
- cubrir automaticamente cambios hechos directamente en Supabase Studio/Auth: produccion necesita acceso restringido, backups, PITR y procedimientos de recuperacion.

Decision aplicada:

- se usa una tabla unica `operational_audit_events` con retencion por tipo de entidad: 30 dias para accesos/equipo y 15 dias para horario/asignaciones/plantillas;
- `changed_fields` no guarda payloads completos ni texto de notas; para campos libres registra que fueron tocados;
- la retirada confirmada de `schedule_template_blocks` se registra como `removed` antes de borrar el patron, con campos minimizados y sin convertirlo en historico legal/payroll;
- `manager` no lee auditoria en S.1 porque la tabla tambien contiene eventos de accesos/equipo;
- `purge_expired_operational_audit_events(batch_size)` borra filas vencidas en lotes acotados y no se concede a `authenticated`;
- el cron/job real para invocarla queda como gate antes de produccion, preferentemente en base de datos y no desde UI normal.

### S.2 - Cierre Pre-QA Y Piloto Controlado

Estado 2026-05-12: revision tecnica completada. No cambia producto visible. El gate de salida exige mantener sin secretos los archivos trackeables, no commitear scratch SQL de Supabase Studio, configurar Resend y Supabase Auth antes de emails reales, y activar la purga S.1 antes de produccion.

Criterio antes de probar con STL o emails reales:

- Resend API key real rotada y guardada solo como secreto de entorno;
- remitente/dominio verificado o prueba limitada con `onboarding@resend.dev`;
- Supabase Auth Site URL, Redirect URLs, password policy y Custom SMTP revisados;
- una invitacion y un reset probados con email controlado;
- `purge_expired_operational_audit_events(1000)` programado como job o fallback manual temporal documentado;
- typecheck, lint, build, smoke, Supabase lint/migration list y verificacion RLS con resultado claro;
- snippets `Untitled query` limpiados, ignorados o convertidos a snippets nombrados y revisados.

### S.3 - QA Controlado De Email/Auth Y Gate Pre-Piloto

Estado 2026-05-12: ejecutado de forma local/controlada. Resend queda validado por presencia, formato y autenticacion API en `.env.local`, y la implementacion de invitaciones usa proveedor server-side sin `service_role` ni valores publicos. Supabase Auth queda revisado a nivel de rutas: reset e invitacion usan `/auth/callback` y redirigen internamente a `/reset-password` o `/invite/accept`.

Resultado:

- verificacion tecnica local verde: typecheck, lint, build, smoke contra `127.0.0.1:3003`, Supabase lint, migration list y verificacion SQL/RLS de auditoria;
- `.env.local` ignorado/no trackeado y escaneo enmascarado de secretos sin hallazgos en archivos trackeables;
- snippets scratch `Untitled query` trackeados excluidos del indice y nuevos scratch ignorados;
- prueba end-to-end real de invitacion/reset no ejecutada por falta de destinatario interno permitido, credenciales E2E/admin y confirmacion de Auth/SMTP real; el remitente local usa `resend.dev`, asi que debe limitarse a pruebas permitidas hasta verificar dominio propio;
- purga S.1 preparada para activacion como job de base de datos, no UI ni Server Action.

Bloquea piloto STL: configurar Supabase Auth/SMTP real, verificar remitente Resend, definir destinatario interno controlado, ejecutar invitacion/aceptacion/reset completos y activar job real de purga.

### S.4 - QA Real Controlado Pre-Piloto STL

Estado 2026-05-12: ejecutado en local/controlado. Se verifica que STL conserva 1 plantilla activa `Semana prueba STL L-V`, 165 bloques de plantilla y 165 bloques generados para la semana 2026-05-04 a 2026-05-08. No se reaplica el snippet porque los datos esperados ya estan presentes.

Resultado:

- repo/env sin secretos trackeables detectados; `.env.local` ignorado/no trackeado y `.env.example` solo con valores locales/placeholders;
- Resend autentica localmente sin imprimir valores, pero no hay dominio verificado en el entorno local;
- rutas de Auth revisadas: `/auth/callback`, `/auth/callback?next=/reset-password` y vuelta a `/invite/accept` estan cubiertas por codigo;
- no hay acceso administrativo al Supabase real desde este entorno para validar la allowlist real de Redirect URLs, Site URL, password policy o Custom SMTP;
- no hay email interno permitido ni credenciales E2E/admin, asi que no se hace envio real de invitacion/reset;
- `supabase/snippets/activate-operational-audit-purge-job.sql` queda como SQL idempotente de activacion de pg_cron para operador DB; el job real no queda ejecutado en entorno real desde esta sesion.

Bloquea piloto STL: prueba real controlada de invitacion/aceptacion/reset con email interno, verificacion de Supabase Auth/SMTP real y ejecucion/registro del job de purga S.1 en el entorno real o scheduler equivalente.

### S.5 - Cierre Operativo Real Auth/Email/Purga Pre-Piloto STL

Estado 2026-05-12: ejecutado en local/controlado como gate de realidad operativa. No se toca Horario, Cobertura, Plantillas, asignaciones ni datos generados. El resultado es "bloqueos restantes", no "piloto STL desbloqueado".

Resultado:

- `.env.local` sigue ignorado/no trackeado; `.env.example` no contiene secretos reales;
- escaneo redacted de archivos trackeables/untracked no ignorados sin hallazgos de valores tipo API key real, JWT, private key, URL firmada ni `SUPABASE_SERVICE_ROLE_KEY`;
- STL local conserva 1 plantilla activa `Semana prueba STL L-V`, 165 bloques de plantilla y 165 bloques generados para 2026-05-04 a 2026-05-08;
- Resend API autentica con la key local sin imprimir valores, pero hay 0 dominios verificados visibles y el remitente local queda limitado a `onboarding@resend.dev`;
- no hay `SUPABASE_ACCESS_TOKEN`, project ref, credenciales E2E/admin ni email controlado en entorno, asi que no se puede verificar Supabase Auth real ni ejecutar invitacion/reset real;
- la funcion de purga S.1 existe y bloquea ejecucion desde `authenticated`/`anon`; el job real sigue pendiente de operador DB o scheduler del entorno real;
- `typecheck`, `lint`, `build`, smoke contra `127.0.0.1:3003`, Supabase lint, migration list y verificacion SQL/RLS pasan;
- `rg -n "STL" src`, `rg -n "service_role" src` y `rg -n "navigator\.geolocation" src` sin coincidencias.

Bloquea piloto STL: acceso administrativo al Supabase real/staging, remitente Resend verificado o prueba limitada permitida, email interno controlado, credenciales E2E/admin, prueba completa de invitacion/aceptacion/reset y activacion registrada del job real de purga S.1.

### S.6 - Reintento Post-S.5 De Desbloqueo Operativo Piloto STL

Estado 2026-05-12: ejecutado en local/controlado sin cambios de `src` ni datos operativos. El resultado vuelve a ser "bloqueos restantes".

Resultado:

- `.env.local` sigue ignorado/no trackeado y apunta a Supabase/Site URL local;
- no hay `SUPABASE_ACCESS_TOKEN`, project ref, DB URL real, credenciales E2E/admin, email controlado ni `SUPABASE_SERVICE_ROLE_KEY`;
- `npx supabase projects list --output json` no tiene acceso a proyectos, asi que Supabase Auth real no se puede verificar;
- Resend autentica, pero hay 0 dominios verificados visibles y el remitente local sigue en `resend.dev`;
- STL local conserva 1 plantilla activa `Semana prueba STL L-V`, 165 bloques de plantilla y 165 bloques generados desde esa plantilla para 2026-05-04 a 2026-05-08;
- la purga S.1 mantiene permisos locales correctos, pero `pg_cron`/`cron.job` no estan instalados localmente y el job real no puede activarse sin acceso DB/scheduler real;
- typecheck, lint, build, smoke contra `127.0.0.1:3003`, Supabase lint, migration list y busquedas `STL`/`service_role`/`navigator.geolocation` en `src` pasan o quedan sin coincidencias.

Bloquea piloto STL: project ref/acceso administrativo Supabase real, acceso DB/scheduler real para la purga, remitente Resend verificado o prueba limitada permitida, email interno controlado y credenciales E2E/admin para ejecutar invitacion, aceptacion y reset reales.

### S.7 - Consolidacion Pre-Piloto Y Desbloqueo Operativo Real

Estado 2026-05-13: ejecutado en local/controlado sin abrir modulos nuevos ni UI nueva. El resultado vuelve a ser "bloqueos restantes", con documentacion de G.3/G.4 corregida y verificacion local verde.

Resultado:

- `PROJECT_BRIEF.md` y `docs/product/roadmap.md` reflejan que G.3/G.4 son base tecnica interna de schema/RPC/RLS y helpers server-side, sin `navigator.geolocation`, UI visible, geofencing, fichaje automatico ni activacion operativa de ubicacion;
- `.env.local` sigue ignorado/no trackeado; escaneo enmascarado de secretos no detecta valores reales trackeables;
- no hay `SUPABASE_ACCESS_TOKEN`, project ref, DB URL real, credenciales E2E/admin/owner ni email controlado; `npx supabase projects list --output json` no tiene acceso a proyectos;
- Resend autentica, pero hay 0 dominios visibles/verificados y el remitente local sigue en `resend.dev`;
- no se ejecutan invitacion real, aceptacion, reset ni job real de purga por falta de acceso Supabase/Auth/SMTP/DB/scheduler real, remitente permitido, email controlado y credenciales;
- `typecheck`, `lint`, `build`, smoke contra `127.0.0.1:3003`, Supabase lint, migration list y verificacion SQL/RLS pasan; el primer smoke fallo solo porque no habia servidor local levantado y se repitio correctamente tras arrancarlo de forma temporal.

Bloquea piloto STL: project ref/acceso administrativo Supabase real o dashboard, acceso DB/scheduler real u operador DB para la purga S.1, remitente Resend verificado o prueba limitada permitida, email interno controlado y credenciales E2E/admin/owner para invitacion, aceptacion y reset reales.

## Fase A - Cierre MVP 1 Real

Objetivo: cerrar MVP 1 con datos reales validados y deuda pequena, sin abrir modulos nuevos.

Estado 2026-05-07: Fase A queda cerrada para QA interno y desarrollo. La semana L-V se carga con `supabase/snippets/stl-test-week-2026-05-04.sql` y la muestra interna opcional con `supabase/snippets/stl-internal-assignment-sample-2026-05-04.sql`. Smoke E2E local admin/coach pasa e incluye `Mi horario`. La validacion oficial STL queda para una etapa posterior de producto casi completo y no bloquea Fase B.

Alcance:

- validar una semana real por centro, coach, tipo, bloque y asignacion;
- comprobar plantillas, excepciones, duplicados y riesgos reales;
- ajustar documentacion de datos del primer tenant sin convertirla en logica de producto;
- cerrar deuda pequena de UX movil, empty states y copy operativo si bloquea uso diario.

No incluye:

- nuevos roles;
- documentos, fichaje, RRHH, cambios o ausencias;
- personalizacion visual real por tenant.

Dependencias:

- datos validados del primer tenant;
- permisos de prueba para admin y coach;
- semana de ejemplo anonimiz-able o fixture privado si procede.

Criterio de salida:

- una semana real se puede cargar, revisar y corregir desde la UI existente;
- el dashboard y cobertura muestran riesgos utiles;
- `rg -n "STL" src` sigue sin referencias de producto;
- el backlog de MVP 1 queda separado de fases futuras.

## Fase B - Configuracion De Tenant, Branding Y Roles Avanzados

Objetivo: permitir configuracion global de organizacion y marca ligera sin romper la identidad BoxOps.

Estado 2026-05-23: B.1 implementada como primer corte generico, B.2 implementada como corte minimo de roles avanzados compatibles, B.3 implementada como invitaciones por email y UX.7 anade creacion directa de cuenta con contrasena temporal y cambio obligatorio en primer login. Existe `/app/settings`, enlazada desde `/app/more`, para editar nombre visible y acento del tenant en `organizations.theme_config`. `owner` y `admin` mutan configuracion global y accesos; `manager` muta operativa MVP 1 tenant-wide sin tocar accesos ni configuracion global; `coach` queda en lectura. Equipo permite invitar por email con `team_invitations`, Resend y aceptacion por token/sesion, o crear una cuenta Auth directa desde servidor con `SUPABASE_SERVICE_ROLE_KEY` acotado a Auth Admin. Desde 2026-05-11 la UI muestra etiquetas en espanol: Propietario, Administrador, Responsable y Entrenador, manteniendo IDs internos en ingles. B.4 documenta el cierre de base SaaS y permisos de tenant en `docs/operations/tenant-readiness-checklist.md`. Logo real, colores por centro, permisos por centro, onboarding guiado, billing y modulos RRHH sensible/documentos siguen pendientes.

Alcance:

- pagina real de Configuracion para organizacion activa;
- logo del box, acento corporativo y colores por centro;
- configuracion visual controlada desde `organizations.theme_config jsonb` si sigue encajando;
- validacion de contraste y fallback a BoxOps cuando un valor no pase controles;
- evolucion de roles sin romper `admin` y `coach`.

No incluye:

- cambios visuales libres por tenant;
- sobrescribir estados criticos como sin cubrir, conflicto, error o foco;
- billing real;
- permisos por documento o RRHH completo.

Dependencias:

- decision `theme_config` vigente;
- modelo de asset/logo privado o referencia interna;
- matriz de permisos para separar configuracion global de gestion diaria.

Criterio de salida:

- B.1 permite configurar marca ligera minima sin cambiar semantica ni rutas;
- B.2 reconoce roles del schema en la app y centraliza permisos en helpers reutilizables;
- B.4 deja checklist de tenant readiness para beta interna sin abrir permisos por centro ni producto nuevo;
- `owner` y `admin` controlan configuracion global, branding ligero y accesos compatibles;
- `manager` y `admin` gestionan operativa diaria sin controlar todo el tenant;
- `coach` mantiene lectura operativa y no gana mutaciones;
- la UI no muestra "Admin compatible" ni "Manager operativo"; usa Administrador y Responsable como etiquetas visibles;
- todos los usuarios conservan acceso a funciones personales aunque tengan rol alto.

Decision recomendada:

- evolucionar hacia `owner`, `admin`/`manager` y `coach`, manteniendo compatibilidad con `admin` actual.
- usar `organizations.theme_config` primero; migrar a tabla dedicada solo si hacen falta permisos, versionado o auditoria granular de tema.
- mantener `center_manager`, `document_admin`, `payroll_manager` y `staff` como roles reconocidos/documentados, sin permisos especializados hasta que existan schema y UX propios.
- tratar altas de equipo como dos caminos tenant-scoped: invitacion por email con token hasheado y aceptacion con la cuenta Auth del mismo email, o creacion directa con email/contrasena temporal desde Auth Admin server-only; no usar UUIDs como flujo normal de admin.
- usar `docs/operations/tenant-readiness-checklist.md` para distinguir minimo de beta interna de v1 comercial: logo privado, colores por centro, permisos por centro y onboarding guiado no bloquean beta si la operativa base esta validada.

## Fase C - Auth Y Security Polish

Objetivo: endurecer autenticacion sin filtrar informacion sensible.

Estado 2026-05-07: implementada como corte minimo de producto. Se anade recuperacion de contrasena desde `/login`, solicitud generica en `/forgot-password`, callback SSR existente reutilizado para recovery y pagina `/reset-password` para guardar nueva contrasena.

Alcance:

- "He olvidado mi contrasena" en login;
- reset password con Supabase Auth;
- pagina de nueva contrasena;
- regla minima: 8 caracteres, al menos una letra y un numero;
- misma regla configurada en Supabase Auth y repetida en app para feedback visual;
- estudio de bloqueo/cooldown por intentos fallidos.

No incluye:

- SSO empresarial;
- MFA obligatorio;
- panel avanzado de seguridad por usuario.

Dependencias:

- configurar en Supabase Auth la misma regla minima de contrasena: 8 caracteres, al menos una letra y un numero;
- permitir en Supabase Auth Redirect URLs el callback de recuperacion hacia `/auth/callback?next=/reset-password`;
- copy que no exponga si un email existe.

Criterio de salida:

- un usuario puede resetear contrasena de forma segura;
- la app no revela existencia de emails;
- la politica de contrasena queda documentada y aplicada en Auth y UI;
- queda decidido si el bloqueo de 3 intentos se apoya en Supabase, hook, tabla propia o combinacion.

Decision tecnica:

- En Fase C se usan los rate limits nativos de Supabase Auth como defensa suficiente para el corte minimo. La app no muestra intentos restantes ni bloqueos por email para no introducir enumeracion.
- Si mas adelante negocio/legal exige bloqueo exacto de 3 intentos, cooldown visible o auditoria propia, se abrira una fase con Password Verification Hook + tabla propia restringida a `supabase_auth_admin`.

## Fase D - Area Personal Y Modelo RRHH

Objetivo: crear "Mi perfil" o "Mi cuenta" como base personal y RRHH, separando lo editable por el usuario de lo gestionado por roles autorizados.

Estado 2026-05-08: D.1 implementa `/app/account` como corte minimo seguro. Todos los roles reconocidos con membership activa pueden abrir su area personal. La pantalla separa cuenta/Auth, perfil visible operativo, ficha de coach propia y RRHH sensible futuro; solo permite editar el `person_profiles` propio vinculado por `organization_id` + `user_id`. D.2 cierra la matriz documental de permisos por campo en `docs/architecture/personal-data-permissions.md`. D.3 modela avatar privado tenant-scoped como asset futuro. D.4 implementa el primer avatar privado propio con `profile_assets`, bucket privado `profile-assets`, RLS/RPC y subida/reemplazo minimo desde `/app/account`. D.5 implementa "Mi firma" privada propia con `profile_signatures`, bucket privado `profile-signatures`, RLS/RPC y canvas minimo en `/app/account`, sin documentos firmables ni boton "Firmar".

Alcance:

- D.1: nombre visible, alias y email publico opcional;
- cuenta/Auth en lectura, sin cambiar email desde BoxOps;
- ficha de coach propia en lectura, sin editar datos de otra persona;
- `weekly_contracted_hours` se conserva como capacidad operativa MVP 1, no como salario/nomina/contrato;
- avatar propio privado en `/app/account`, con fallback visual si no hay avatar;
- D.2: matriz por campo para decidir que es visible, propio, operativo, RRHH sensible, payroll, documento privado, firma o auditoria;
- D.3/D.4: avatar como `profile_assets`, privado, tenant-scoped, con signed URL corta y sin URL publica libre persistente;
- "Mi firma" como capacidad personal propia para todos los usuarios con membership activa y rol reconocido;
- crear firma dibujandola en canvas/touch area;
- borrar/redibujar antes de guardar;
- guardar y actualizar la firma reutilizable en Storage privado;
- advertir que actualizar la firma no cambia documentos ya firmados;
- puesto, antiguedad, datos laborales, contrato/jornada cuando proceda;
- retribucion/salario solo para roles autorizados;
- datos personales disponibles para todos los usuarios, incluidos admins que tambien trabajan como coaches.

No incluye:

- nominas generadas;
- calculo laboral/fiscal;
- documentos completos;
- fichaje.

Dependencias:

- matriz de permisos por campo documentada en D.2 como entrada obligatoria para siguientes cortes tecnicos;
- revision de privacidad para salario/retribucion y datos laborales;
- decision sobre si ampliar `person_profiles` o crear tablas RRHH separadas.
- decision D.5 aplicada: firma tenant-scoped con `organization_id` + `person_profile_id`; global por usuario queda abierta solo si aparece necesidad multi-tenant real.
- Storage privado `profile-signatures` para el artefacto de firma.

Criterio de salida:

- cada usuario tiene area personal usable;
- cada usuario puede editar solo su perfil visible propio en D.1;
- avatar propio queda implementado como asset privado tenant-scoped, sin reemplazo ajeno;
- cada usuario puede crear/actualizar su propia firma si tiene `person_profiles` vinculado;
- la firma no es asset publico y respeta frontera de tenant;
- ningun admin/manager puede firmar en nombre de otra persona usando su firma guardada;
- datos sensibles no aparecen en equipo operativo general;
- admin/manager no hereda acceso a salario por defecto si no corresponde;
- la frontera entre cuenta, persona operativa y datos laborales queda documentada.
- documentos firmables y RRHH sensible no se implementan hasta tener schema, Storage privado/RLS, snapshots y permisos explicitos.

Decision recomendada:

- separar datos publicos/operativos de datos laborales sensibles. `person_profiles` no debe convertirse en cajon de salario, contrato y documentos.
- usar D.2/D.3/D.4/D.5 como puerta de entrada: avatar propio y firma propia ya existen con Storage privado; despues, si procede, modelar documentos firmables sin mezclar creacion de firma con firma aplicada.
- "Mi firma" ya existe antes de botones "Firmar" en documentos o nominas.
- no crear tablas RRHH nuevas sin capacidades, policies, auditoria y revision de privacidad/legal.

## Fase E - Documentos, Permisos, Nominas, Firmas Y Certificaciones

Estado 2026-05-21: E.1 queda documentada como fase de modelado seguro. E.2 implementa el primer schema minimo privado para metadata documental tenant-scoped: `documents`, `document_versions`, `document_subjects` y `document_access_grants`, con RLS estricta y grants explicitos. E.3 implementa el bucket privado `document-files`, RPCs de subida/activacion/cancelacion y policies de Storage por `document_versions`. E.4 implementa `document_access_events` con RLS estricta, metadata minimizada y RPCs de registro/consulta. E.5 abre rutas backend de preview/descarga para `document_versions` privadas con signed URLs cortas y auditoria. E.6/I.27 modela programacion util asociada a documentos y horario como base previa a cualquier IA futura. E.7/I.28 implementa `document_programming_links` y helper server-side para programacion autorizada por bloque o fecha/tipo. E.8/I.29 muestra esa programacion autorizada de forma minima desde el detalle de bloque en Horario. E.9/I.30 anade QA interno no visible con SQL rollback y smoke para validar permisos reales y limites operativos. E.10/I.31 anade runbook operativo interno local/QA para validacion manual controlada. E.11 abre `/app/documents` como primer repositorio visible minimo y permiso-gated. E.12 prepara validacion QA/staging controlada con rollback y evidencia esperada. E.13 cierra evidencia local y bloqueo staging con plantilla redacted. E.14 reintenta validacion real con archivo Storage controlado y mantiene bloqueo por falta de acceso real desde este entorno. E.15 actualiza el desbloqueo controlado con relectura de entorno redacted, SQL local rollback y bloqueo QA/staging exacto. E.16 deja handoff operativo controlado para operador con acceso real: variables/capacidades necesarias, casos QA, checklist, evidencia esperada y criterios de pass/bloqueado. E.19 anade un primer adjunto minimo desde `/app/documents` para `owner`, `admin` y `document_admin`, limitado a metadata `company`/`programming`, primera version en Storage privado y preview/descarga por backend. No implementa boton "Firmar", documentos firmables, snapshots reales, grants UI, auditoria visible, reemplazo de versiones, subida masiva ni IA.

Objetivo: centralizar documentos de empresa, documentos personales, firmas y certificaciones con permisos estrictos.

Alcance:

- documentos de empresa;
- "Mis documentos";
- subida de titulaciones/certificaciones por empleados;
- subida de nominas u otros documentos privados por roles autorizados al espacio de cada empleado;
- permisos por rol y por persona concreta, estilo compartir en Drive;
- botones "Firmar" en documentos o entidades futuras que reutilizan la firma guardada del usuario autenticado;
- snapshot/version de firma guardado en cada firma aplicada;
- buckets privados, RLS, URLs firmadas y auditoria de acceso cuando proceda.

No incluye:

- gestor documental completo;
- generacion de nominas;
- firma electronica avanzada/cualificada;
- integracion Drive API salvo decision posterior.

Dependencias:

- modelo de documentos y permisos;
- Fase D con "Mi firma" real cerrada antes de botones de firma documental;
- Supabase Storage privado;
- politica de retencion, borrado y auditoria;
- revision legal para documentos sensibles y firmas.

Criterio de salida:

- una persona ve sus documentos propios;
- un rol autorizado puede subir documentos privados a una persona concreta;
- documentos de empresa respetan permisos;
- las certificaciones pueden adjuntar archivo y caducidad;
- los botones "Firmar" consumen la firma guardada y no obligan a dibujarla cada vez;
- si falta firma guardada, el flujo pide crearla antes de continuar o la crea inline segun decision documentada;
- cada firma aplicada registra organizacion, entidad/documento versionado, usuario autenticado, persona firmante, fecha/hora, snapshot usado y estado;
- ninguna firma se presenta como avanzada/cualificada sin validacion legal.

Decision recomendada:

- modelar permisos con una combinacion de scope, rol y grants por persona concreta. Evitar que `admin` sea sinonimo automatico de acceso a todo documento sensible.
- E.1 cierra el modelo antes de implementar, E.2 abre solo el schema minimo, E.3 conecta `document-files` a `document_versions`, E.4 crea auditoria documental minima y E.5 crea rutas controladas de preview/descarga sin superficie visible. Certificaciones y solicitudes/evidencias de firma siguen futuras.
- usar buckets privados con rutas internas tenant-scoped; E.3 crea solo `document-files`, mientras `document-signature-evidence` sigue candidato futuro para snapshots/evidencias.
- separar documentos de empresa, documentos privados de persona y documentos de gestion/admin; cada categoria necesita permisos explicitos y puede requerir auditoria distinta.
- tratar certificaciones como dato operativo con adjunto potencialmente privado: el estado/caducidad puede alimentar cobertura futura, pero el archivo no debe hacerse visible por defecto.
- mantener "Mi firma" como asset personal privado ya existente; "Firmar documento" sera una accion futura que genera evidencia inmutable y no permite firma por delegacion.
- registrar auditoria de lectura/descarga/cambio de documentos sensibles y evidencias, no solo de subida. E.5 registra `file_preview` y `file_download` desde rutas backend controladas, sin guardar signed URLs ni rutas Storage en auditoria.
- tratar la programacion como documentos versionados y autorizados, no como texto libre en horario: E.6/I.27 usa `documents.document_scope = programming`, `document_versions`, sujetos/grants y contexto de horario solo para encontrar la fuente correcta; E.7/I.28 anade `document_programming_links` para fecha/rango + tipo/centro/bloque; E.8/I.29 la muestra desde detalle de bloque solo si el permiso documental autoriza metadata/preview/descarga; E.9/I.30 valida con QA rollback que asignaciones y cross-tenant no saltan esos permisos; E.10/I.31 deja el procedimiento manual local/QA; E.11 permite listar versiones visibles en `/app/documents` sin convertir la asignacion de horario en permiso documental; E.12 valida ese repositorio con datos controlados, grants, solo metadata, sin grant, cross-tenant y exclusiones sensibles; E.13 registra evidencia local o bloqueo QA/staging sin inventar resultados; E.14 reintenta validacion real con archivo Storage controlado y mantiene bloqueo por falta de acceso real; E.15 actualiza el desbloqueo controlado con el mismo criterio de evidencia honesta; E.16 deja handoff operativo para ejecutar esa validacion real solo con acceso/casos/archivo controlado.

## Fase F - Fichaje Web, Cierre Semanal Y Aprobacion

Objetivo: registrar jornada en web de forma manual o automatica por planificacion, corregible, aprobable semanalmente y auditable, sin geolocalizacion web.

Estado 2026-05-17: F.1 queda documentada como primer modelo seguro, F.2 implementa schema/RPC/RLS, F.3 crea capa servidor, F.4 abre la primera UI propia en `/app/time`, F.5 anade correcciones propias minimas sobre registros/punches recientes, F.6 abre la primera revision administrativa minima, F.7 permite aplicar correcciones aprobadas de forma trazable, F.8 fija la politica de producto para aplicar correcciones propias directamente por defecto, F.9 abre una vista semanal con avisos operativos frente a bloques asignados, F.10 separa los fichajes sustituidos/anulados del dia principal hacia un historial visible 30 dias, F.11 implementa el primer automatico web por planificacion con `source = schedule_auto`, flag `scheduleAutoPunchesEnabled`, snapshot minimo e idempotencia por asignacion/tipo de punch, F.12 abre la base backend de cierre semanal, F.13 abre la primera cola in-app en Inicio, F.14 anade un exporte CSV interno revisable desde `/app/time` y F.15 deja el runbook de readiness de beta interna. El corte 2026-05-23 amplia `schedule_auto` a franjas `staff_work_windows` con job DB activable, idempotencia por franja+fecha+tipo y `presenceVerified = false`. Una persona con membership activa y ficha de persona vinculada puede registrar entrada/salida manual propia, corregir con motivo obligatorio, navegar semanas, ver registros/punches asociados y detectar faltas, excesos o fichajes abiertos. Si la organizacion requiere aprobacion, `owner`, `admin` y `manager` pueden aprobar o rechazar solicitudes pendientes y aplicar solo correcciones `approved`, con RPC transaccional que crea punches de `source = correction`, sustituye/anula punches existentes o marca `record_update` como aplicado sin tocar campos de jornada cuando el modelo no lo permite. En Inicio, `owner`, `admin` y `manager` ven semanas enviadas/reenviadas, pueden firmar y aprobar con su propia firma interna o rechazar con nota, y todos los usuarios ven avisos propios derivados de `time_weekly_approvals` con enlace a `/app/time?week=YYYY-MM-DD`. En `/app/time`, `owner`, `admin` y `manager` pueden descargar un CSV por rango y persona opcional, registrado en `time_exports`, con datos minimos revisables y sin snapshots/texto libre sensible. No hay geolocalizacion, payroll, aprobacion legal de horas extra, exporte legal definitivo, seeds reales, emails/push de fichaje ni promesa de cumplimiento legal definitivo.

Decision 2026-05-13: la webapp no pedira ubicacion al fichar. La evolucion de Fase F sera doble: fichaje manual y fichaje automatico por clases/bloques asignados. Ese automatico web reduce friccion, pero no prueba presencia real; por eso debe quedar corregible y sujeto a cierre semanal. F.12 deja preparada la primitiva DB para que cada domingo a las 23:59, segun timezone de organizacion, la semana de fichaje de cada usuario se envie automaticamente a aprobacion. `owner`, `admin` y `manager` podran ver en Inicio una cola visible de semanas pendientes, aprobar con su propia firma mediante "Firmar y aprobar" o rechazar con nota obligatoria. Aprobar cierra la semana y bloquea modificaciones normales; rechazar notifica al usuario, muestra el aviso en su Inicio, exige correcciones y permite reenviar a aprobacion. Las notificaciones iniciales son in-app; push movil queda para app nativa.

Alcance:

- entrada/salida manual;
- fichaje automatico web basado solo en clases/bloques asignados, sin geolocalizacion ni prueba de presencia;
- registros de jornada por trabajador/persona;
- vinculacion a turno/bloque cuando exista;
- correcciones posteriores con motivo obligatorio;
- envio automatico de semana a aprobacion el domingo a las 23:59;
- cola visible para `owner`, `admin` y `manager` en Inicio;
- aprobacion semanal firmada por gestor/admin/responsable con snapshot/evidencia de firma propia;
- rechazo con nota obligatoria, aviso al usuario, correccion y reenvio a aprobacion;
- bloqueo de modificaciones normales tras aprobacion, salvo reapertura/correccion excepcional auditada;
- notificaciones in-app de envio, aprobacion, rechazo y correccion requerida;
- exportes y auditoria;
- acceso del trabajador a sus registros.

No incluye:

- geolocalizacion desde webapp o `navigator.geolocation`;
- fichaje automatico por ubicacion;
- geofencing o tracking continuo;
- push notifications moviles hasta app nativa;
- calculo legal definitivo de horas extra;
- payroll;
- app nativa;
- promesa de cumplimiento legal definitivo.

Dependencias:

- revision legal y privacidad;
- modelo de turnos/registros/correcciones/aprobaciones;
- permisos de trabajador, gestor, owner y representantes si aplica.

Criterio de salida:

- se registran inicio y fin de jornada;
- hay historial de correcciones y aprobaciones;
- hay cierre semanal con estados claros: abierta, enviada, aprobada, rechazada, corregida y reenviada;
- las semanas aprobadas quedan bloqueadas frente a edicion normal;
- los usuarios reciben aviso visible cuando su semana queda aprobada, rechazada o requiere correccion;
- `owner`, `admin` y `manager` ven pendientes de aprobacion en Inicio sin depender de email;
- existe exporte revisable;
- se documenta la obligacion en Espana de conservar registros 4 anos y permitir acceso a trabajador, representantes e Inspeccion;
- BoxOps no promete cumplimiento legal definitivo sin revision.

Decision que requiere validacion legal:

- textos, retencion, acceso de representantes, formato de exporte y alcance de aprobacion semanal deben revisarse antes de usar datos reales.

Decision F.1:

- modelar primero `time_records`, `time_punches`, `time_record_corrections`, `time_weekly_approvals`, `time_exports` y `time_audit_events`, todos con `organization_id` obligatorio;
- permitir relacion opcional con `schedule_blocks` y `schedule_block_assignments`, sin hacer depender el fichaje de que exista un bloque asignado;
- tratar trabajador/coach, `manager`, `admin`/`owner` y roles futuros (`center_manager`, `payroll_manager`, `staff`) como actores distintos antes de UI;
- exigir motivo, autor, estado y trazabilidad en toda correccion;
- garantizar lectura propia del trabajador;
- exponer primero `/app/time` como superficie propia minima, sin aceptar `person_profile_id` en formularios;
- construir snapshots de correcciones propias desde servidor/campos controlados, sin aceptar JSON libre en UI;
- aplicar correcciones propias directamente por defecto mediante RPC trazada y permitir que solo el `owner` active aprobacion previa en Configuracion;
- comparar la semana de fichaje contra asignaciones propias para mostrar horas asignadas, fichadas, balance y avisos, sin convertir esa comparacion en payroll ni horas extra aprobadas;
- revisar correcciones pendientes desde `/app/time` solo para `owner`, `admin` y `manager` cuando la organizacion exige aprobacion o existan solicitudes previas, con nota obligatoria al rechazar y copy claro de que aprobar no modifica todavia el historico;
- ocultar de la vista principal los punches `superseded`/`voided` tras aplicar correcciones y mostrarlos solo como historial visible 30 dias;
- no borrar fisicamente registros laborales ni auditoria sin una politica legal de retencion cerrada;
- permitir centro opcional solo desde datos de la organizacion activa; bloque/asignacion quedan para un selector seguro posterior;
- documentar como nota pendiente de validacion legal que en Espana los registros deben conservarse 4 anos y estar disponibles para trabajador, representantes legales e Inspeccion.

Decision F.11/F.12/F.13/F.14/F.15:

- F.11 implementa el fichaje automatico web por planificacion: genera entrada/salida desde bloques asignados activos/no cancelados del usuario, con fuente diferenciada, snapshot minimo y ejecucion idempotente; no usa ubicacion ni prueba presencia. Desde el corte 2026-05-23 tambien puede generar desde `staff_work_windows` activas.
- F.12 implementa la base backend de cierre semanal: envio idempotente, primitiva DB para ejecucion cada domingo a las 23:59 por timezone de organizacion, estados de aprobacion semanal, aprobacion con firma propia, rechazo con nota, bloqueo al aprobar y base de reenvio tras correcciones.
- F.13 implementa el primer corte de notificaciones in-app para usuarios y gestores: pendientes de aprobacion en Inicio, semana rechazada/corregir en Inicio del usuario, confirmacion de aprobacion/rechazo, navegacion a `/app/time?week=YYYY-MM-DD` y acciones de aprobar/rechazar con las RPC F.12. No crea tabla nueva de notificaciones; la fuente canonica sigue siendo `time_weekly_approvals`, preparada para alimentar una outbox/push movil futura.
- F.14 implementa el primer exporte interno revisable: `GET /app/time/export` valida sesion, tenant, rol, rango y persona opcional; genera CSV en backend; registra `time_exports`; no guarda archivo en Storage; no incluye snapshots ni texto libre de correcciones; y se presenta como revision operativa, no payroll ni cumplimiento legal definitivo.
- La aprobacion firmada no es firma documental ni firma electronica avanzada/cualificada; es confirmacion interna de cierre de fichajes y debe guardar snapshot/version de la firma usada.
- F.15 no implementa producto nuevo: documenta readiness de beta interna, smokes por rol, evidencias, bloqueos, deuda UX y limites. Mantiene claro que web no usa geolocalizacion, automatico por planificacion no prueba presencia, jornada prevista puede alimentar `schedule_auto` pero no es payroll/prueba definitiva, candidatos de posible exceso no son payroll y CSV no es exporte legal definitivo.

## Fase G - Geolocalizacion Nativa Futura

Objetivo: preparar geolocalizacion real para una app nativa o wrapper movil, no para la webapp.

Estado 2026-05-13: tras decision de producto, la webapp no pedira ubicacion ni usara `navigator.geolocation`. G.1-G.4 quedan reclasificadas como base tecnica interna para una futura app nativa o wrapper movil, donde la ubicacion en segundo plano/geofencing podria justificar fichaje automatico real. No hay UI de mapa, lectura real de ubicacion en web, geofencing activo, app nativa, tracking continuo, fichaje automatico por ubicacion ni activacion operativa de ubicacion.

Alcance:

- geolocalizacion opcional futura activable por tenant solo cuando exista app nativa/wrapper y revision legal/privacidad;
- configuracion por centro: latitud/longitud del centro, radio permitido, timezone, estado activo/inactivo y texto de aviso o consentimiento operativo;
- radio inicial sugerido de 100m configurable, no universal ni hardcodeado;
- geofencing/background location solo en app nativa si el sistema operativo, permisos y politica de privacidad lo permiten;
- fichaje automatico por ubicacion solo si coinciden bloque/clase asignada, centro correcto y ventana temporal definida;
- no fichar si esta en el box fuera de horario o sin asignacion aplicable;
- consentimiento/permiso claro de ubicacion nativa;
- fallback web/manual y correcciones Fase F cuando ubicacion falle, no se conceda permiso o haya discrepancias.

Datos tecnicos implementados/candidatos:

- configuracion por centro en `center_time_location_settings`, separada de `centers` para aislar permiso, version de politica, retencion y auditoria de cambios;
- evento minimizado de intento en `time_location_events`: disponibilidad, resultado, buckets de precision/distancia, centro/politica evaluados y motivo de fallback;
- snapshot minimizado en `time_punches.metadata` solo si se necesita explicar el fichaje: version de politica, centro y resultado; buckets solo si aportan valor, nunca coordenadas ni JSON libre;
- coordenadas crudas del trabajador solo como dato transitorio de calculo si una implementacion futura lo necesita; no se persisten, no se loguean y no van a auditoria generica.

No incluye:

- guardar trayectos;
- historial de movimientos;
- tracking continuo innecesario;
- lectura de ubicacion desde la webapp;
- `navigator.geolocation` en `src`;
- historial de posiciones o coordenadas crudas innecesarias del trabajador;
- geofencing fiable con app cerrada en navegador/PWA;
- automatismo legalmente garantizado;
- payroll, horas extra automaticas, exportes legales ni cumplimiento legal definitivo.

Dependencias:

- Fase F cerrada;
- ubicaciones de centro fiables;
- precision real probada en interior/exterior;
- revision legal y privacidad;
- retencion y acceso definidos para cualquier evidencia de ubicacion;
- RLS/RPC tenant-safe y copy de consentimiento antes de activar datos reales.

Criterio de salida:

- el usuario entiende cuando una app nativa consulta ubicacion y con que finalidad;
- solo se guardan eventos necesarios del fichaje, no trayectos ni historial de posiciones;
- los fallos o discrepancias de ubicacion se corrigen manualmente;
- la webapp queda explicitamente sin lectura de ubicacion;
- queda decidido que la base G.2-G.4 usa tabla separada para evento minimizado y deja `time_punches.metadata` solo como snapshot opcional muy reducido.

Decision G.1:

- preferir una tabla separada para eventos/evidencias de ubicacion con retencion y permisos propios; usar `time_punches.metadata` solo como snapshot minimizado de resultado.
- no usar `time_audit_events.metadata` para coordenadas: la capa actual bloquea claves de ubicacion y no se debe relajar sin diseno especifico.
- mantener el fichaje web manual/automatico por planificacion y las correcciones como via principal hasta que exista app nativa.

Decision G.2:

- schema candidato: `center_time_location_settings` para configuracion por centro y `time_location_events` para eventos/evidencias minimizadas, ambos con `organization_id` obligatorio.
- dato guardado: resultado dentro/fuera/desconocido/fallback y buckets de precision/distancia relativa al radio; no distancia exacta ni coordenadas crudas persistidas del trabajador.
- permisos: `owner` activa politica; `owner`/`admin` podran mantener configuracion si se implementa capacidad explicita; eventos propios se derivan de sesion + tenant; gestion ve solo evidencia minimizada vinculada a fichaje.
- RLS/RPC esperadas: escritura directa revocada, RPCs acotadas para configurar centro y registrar/listar eventos, validacion servidor de tenant, centro, punch/record y persona propia.
- retencion candidata: eventos de ubicacion 90 dias, y 30 dias para denegado/no disponible, salvo decision legal explicita o disputa/exporte; el fichaje canonico conserva su propia retencion.
- en navegador/PWA no se debe asumir geolocalizacion fiable con app cerrada. Si el fichaje automatico en segundo plano es requisito comercial, la fase nativa sube de prioridad.

Decision G.3/G.4:

- G.3 crea schema, constraints, RLS y RPCs minimas para configuracion y eventos de ubicacion asistida minimizada con `organization_id` obligatorio.
- G.4 crea helpers server-side tipados para consumir esas RPCs con sesion Supabase normal, sin `service_role` en `src`.
- La base interna no acepta `person_profile_id` desde acciones propias, no persiste coordenadas crudas del trabajador, distancia exacta, precision exacta, payload de navegador, IP, BSSID/Wi-Fi/Bluetooth ni fingerprints.
- La frontera sigue intacta: no hay UI visible, hooks cliente, mapa, lectura real de `navigator.geolocation`, geofencing activo, fichaje automatico por ubicacion, payroll, exportes legales ni datos STL.

## Fase H - PWA, App Movil Y Geofencing Nativo

Objetivo: preparar la experiencia movil sin saltar prematuramente a app nativa.

Estado H.3 2026-05-13: PWA/mobile queda auditada para las rutas criticas `/app`, `/app/time`, `/app/schedule`, `/app/coverage`, `/app/more` y `/app/account` en 390x844 y 375x812, y la estrategia movil queda cerrada documentalmente. BoxOps declara metadata movil, manifest web e icono generico para instalacion/acceso rapido, pero no registra service worker, no activa modo offline, no cachea datos autenticados o tenant-scoped, no usa push notifications reales y no pide ubicacion desde la webapp. La PWA queda como mejora online de acceso a la web responsive; no sustituye app nativa/wrapper para geofencing/background location/push con app cerrada.

Alcance:

- navegador/PWA responsive como primera fase;
- arquitectura preparada para futura publicacion en App Store y Google Play;
- evaluacion posterior de Capacitor/Ionic, React Native/Expo u otra estrategia;
- licencias Apple Developer y Google Play como dependencia futura;
- geofencing nativo si el negocio lo exige;
- notificaciones push nativas para avisos de aprobacion/rechazo/correcciones de fichaje y recordatorios operativos.

No incluye:

- publicacion nativa antes de validar web/MVP operativo;
- promesa de automatismos con app cerrada desde web/PWA;
- service worker/offline privado sin politica segura de cache;
- push notifications reales desde la webapp antes de fase propia;
- `navigator.geolocation`, mapas, geofencing, IP/Wi-Fi/Bluetooth ni ubicacion real en web/PWA;
- reescritura movil completa sin decision de producto.

Dependencias:

- validacion comercial de fichaje automatico;
- decision tecnica de wrapper/nativo;
- cuentas developer y politica de privacidad compatible con ubicacion;
- estrategia de push notifications y permisos moviles.

Criterio de salida:

- H.1 deja estrategia minima decidida: PWA como acceso rapido, sin offline privado, push ni ubicacion web;
- H.2 verifica que la PWA cubre uso diario basico online en las rutas criticas moviles, sin overflow horizontal de pagina, con bottom nav usable y safe areas correctas;
- H.3 documenta costes, licencias, store review, privacidad, permisos moviles, mantenimiento y QA por plataforma;
- geofencing nativo solo entra si web/PWA no cumple un caso comercial validado y si legal/privacidad aprueba finalidad, minimizacion y retencion;
- las notificaciones push moviles no sustituyen los avisos in-app de la webapp;
- Fase H queda cerrada para piloto si no aparece deuda mobile/PWA bloqueante nueva.

Decision H.1:

- usar Next metadata + `src/app/manifest.ts` + icono generico como primer soporte PWA;
- declarar `Cache-Control: no-store` en `/app` y `/app/:path*` para respuestas autenticadas de la webapp;
- no implementar service worker hasta definir una allowlist segura de assets publicos y una politica explicita que excluya respuestas autenticadas, datos privados, documentos, fichajes, firmas, signed URLs y exportes;
- mantener avisos in-app como canal web; push queda para fase nativa/push propia;
- evaluar wrapper/nativo solo si hay requisito comercial de geofencing fiable, background location, push del sistema o stores.

Decision H.2:

- auditar PWA/mobile sobre rutas criticas protegidas con usuario local demo, sin tocar datos reales STL;
- reforzar `Cache-Control: no-store` y `Pragma: no-cache` tambien desde el proxy protegido de `/app`, ademas de `next.config.ts`;
- aceptar que las vistas densas usen scroll interno controlado cuando corresponde, siempre que no generen overflow horizontal de pagina ni tapen el final de formularios/listas con la bottom nav;
- no hay deuda mobile/PWA bloqueante nueva antes de piloto; las mejoras recomendables son automatizar este smoke visual, repetirlo con datos reales/anonimizados largos y anadir iconos PNG/multiples tamanos antes de polish avanzado de instalacion;
- service worker, offline privado, push, geofencing/background location y stores siguen como deuda futura de nativo/wrapper o fase push propia, no de H.2.

Decision H.3:

- corto plazo: mantener web responsive + PWA online segura como salida movil recomendada;
- medio plazo: evaluar Capacitor/Ionic wrapper, React Native/Expo, app nativa especifica o seguir web-only solo con requisito comercial claro;
- largo plazo: geofencing/background location/push nativo exige fase propia de privacidad/legal/stores, permisos iOS/Android, QA por plataforma y presupuesto de mantenimiento;
- costes vigentes consultados el 2026-05-13: Apple Developer Program 99 USD/ano y Google Play Console 25 USD registro unico; revalidar tarifa, moneda y condiciones al contratar;
- deuda bloqueante mobile/PWA antes de piloto: ninguna nueva. Deuda recomendable: automatizar audit mobile, repetir con datos largos anonimizados, anadir iconos PNG y preparar store/privacy metadata si se abre fase nativa. Deuda futura: stores, signing, APNs/FCM, permisos de ubicacion/push, offline seguro, geofencing/background location y QA iOS/Android;
- criterios para elevar nativo/wrapper: geofencing fiable con app cerrada, push del sistema obligatorio, offline real seguro, requisito comercial validado, presupuesto aceptado y revision legal/privacidad cerrada.

Decision H.4 - Recordatorios Nativos De Proxima Clase:

- fase futura exclusiva de app nativa/wrapper o canal push movil propio, no de la web/PWA actual;
- fuente canonica: `schedule_blocks` + `schedule_block_assignments` con `assignment_status = 'assigned'`, excluyendo bloques `cancelled` y `completed`;
- recordatorios candidatos: el dia anterior sobre las 21:00 y 1 hora antes del inicio del bloque;
- los calculos deben respetar timezone del tenant y, cuando el bloque tenga centro con timezone propio, el timezone del centro;
- permisos siempre opt-in por usuario/dispositivo; sin permiso, la app debe mantener fallback in-app visible;
- arquitectura candidata: outbox tenant-scoped de recordatorios, workers/scheduler controlados, APNs/FCM, payloads minimizados y auditoria minima de envio/entrega/fallo;
- no abrir Notification API, PushManager, service worker, background sync ni caches de respuestas autenticadas en la webapp;
- no transportar datos sensibles, documentos, payroll, ubicacion, signed URLs ni detalles largos en el payload push;
- antes de implementar, cerrar privacidad/legal, politica de retencion, bajas de dispositivo, revocacion de permisos y pruebas negativas de tenant.

## Fase I - Cambios, Ausencias, Eventos, Horas Extra E IA

Objetivo: ordenar los modulos ya previstos despues de cerrar la base operativa, seguridad, RRHH, documentos y fichaje inicial.

Alcance:

- cambios de turno/clase y cobertura entre coaches;
- auditoria operativa corta de cambios sobre bloques, asignaciones de coaches y plantillas;
- ausencias, vacaciones y permisos;
- eventos, festivos y competiciones;
- horas extra candidatas, revisables y cerradas operativamente;
- IA sobre programacion solo cuando documentos, permisos, auditoria y horarios esten modelados.

No incluye:

- IA antes de datos/documentos utiles;
- payroll completo;
- CRM de alumnos;
- marketplace de coaches.

Dependencias:

- permisos avanzados;
- registros de horario/fichaje si impactan horas;
- documentos/certificaciones si condicionan asignaciones;
- validacion comercial de prioridades.

Criterio de salida:

- cada submodulo tiene task propia, modelo de permisos y criterio de auditoria;
- primer criterio de salida I.1: cambios/cobertura queda modelado documentalmente con actores, estados, entidades candidatas, invariantes de tenant/RLS y deuda separada antes de abrir schema o UI;
- segundo criterio de salida I.2: cambios/cobertura tiene base DB/RLS/RPC minima para crear solicitud propia, registrar targets/ofertas, responder como coach candidato y auditar eventos minimizados, sin UI ni aplicacion al horario real;
- tercer criterio de salida I.3: cambios/cobertura tiene primitiva DB/RLS/RPC para aprobar, rechazar, cancelar/expirar y aplicar de forma transaccional al horario real, sin UI visible;
- cuarto criterio de salida I.4: cambios/cobertura tiene verificacion SQL/RLS negativa reejecutable con rollback para tenant safety, roles, targets, expiraciones, solapes, aplicacion y escrituras directas bloqueadas;
- quinto criterio de salida I.5: cambios/cobertura tiene capa app/server interna tipada para consumir RPCs con sesion Supabase SSR normal, mapear errores esperados y mantener UI/inbox fuera del corte;
- sexto criterio de salida I.6: cambios/cobertura tiene primera bandeja visible protegida en `/app/requests`, con listado, acciones por rol/actor y Server Actions seguras, sin crear solicitudes todavia;
- septimo criterio de salida I.7: cambios/cobertura permite creacion minima segura de solicitudes/ofertas desde `/app/requests` mediante RPC atomica de solicitud + targets, sin swap, ausencias, payroll ni ubicacion;
- octavo criterio de salida I.8: cambios/cobertura queda endurecido a nivel app/server/UX para evitar targets propios o no accionables, mostrar vencimientos/estados no accionables y cerrar vencidas con RPC existente sin scheduler ni background jobs;
- noveno criterio de salida I.9: ausencias/vacaciones/permisos quedan modelados documentalmente con alcance minimo, entidades candidatas, estados, permisos, auditoria, retencion, datos prohibidos e impacto sobre cobertura, sin abrir schema ni UI;
- decimo criterio de salida I.10: ausencias/vacaciones/permisos tienen foundation DB/RLS/RPC minima con `absence_requests`, periodos, eventos, impacto calculado al vuelo y verificacion negativa con rollback, sin UI ni datos reales;
- undecimo criterio de salida I.11: la app tiene helper interno server-side `src/lib/absence-requests.ts` para leer propias, leer cola operativa, crear/cancelar propias por RPC, revisar/expirar por RPC, releer eventos e impactos al vuelo, sin UI ni escrituras directas;
- duodecimo criterio de salida I.12: ausencias/vacaciones/permisos tienen primera bandeja visible protegida en `/app/absences`, con lectura propia, cola operativa de gestion, acciones seguras por Server Actions e impacto al vuelo, sin formulario de creacion ni calendario;
- decimotercer criterio de salida I.13: `/app/absences` permite creacion minima de solicitud propia mediante `createOwnAbsenceRequest(...)`, con formulario acotado, validacion server-side, `organization_id` explicito, resumen minimizado y sin crear para otra persona, calendario, saldos legales ni cobertura automatica;
- decimocuarto criterio de salida I.14: `/app/absences` queda endurecida a nivel UX/app/server con filtros simples por query string, validacion visible del formulario, botones con pending/confirmacion, estados no accionables claros y copy prudente, sin ampliar dominio ni persistir impacto;
- decimoquinto criterio de salida I.15: `/app/absences` queda cubierto por QA tecnico de regresion posterior a I.14 con smoke/guardrails de helper/RPC, permisos por rol, filtros query string y limites de seguridad, sin abrir funcionalidades nuevas;
- decimosexto criterio de salida I.16: las ausencias aprobadas o en revision se reflejan como impacto derivado en lectura de cobertura para gestion, sin persistir impactos, modificar horario/asignaciones ni resolver cobertura automaticamente;
- decimoseptimo criterio de salida I.17: eventos/festivos/competiciones quedan modelados como contexto operativo del box, con entidades, permisos, estados, retencion, auditoria, impacto sobre cobertura y limites de privacidad definidos, sin abrir schema, UI ni calendario avanzado;
- decimoctavo criterio de salida I.18: `operational_events` queda como foundation tecnica minima tenant-scoped con DB/RLS/RPC/helper, lectura de `coach` solo por visibilidad, gestion para `owner`/`admin`/`manager`, auditoria minimizada y sin mutar horario/cobertura;
- decimonoveno criterio de salida I.19: `/app/schedule` muestra eventos/festivos/competiciones como contexto semanal minimo, con gestion colapsada para `owner`/`admin`/`manager`, lectura de `coach` sin controles y sin mutar horario/cobertura;
- vigesimo criterio de salida I.20: horas extra quedan modeladas documentalmente como candidatos operativos revisables, con entidades, estados, permisos, auditoria, retencion y datos prohibidos definidos, sin schema, UI, payroll ni aprobacion legal;
- vigesimo primer criterio de salida I.21: horas extra candidatas tienen foundation tecnica minima `overtime_candidates` con DB/RLS/RPC/helper interno y guardrail de fuente, sin UI visible, payroll, importes ni mutaciones de fichaje/horario;
- vigesimo segundo criterio de salida I.22: horas extra candidatas tienen verificacion SQL/RLS con rollback y smoke endurecido para roles, tenant safety, fuentes personales, candidatos cerrados, escritura directa bloqueada y no mutacion de horario/fichaje;
- vigesimo tercer criterio de salida I.23: horas extra candidatas tienen primera revision operativa visible en `/app/time` para `owner`/`admin`/`manager`, con estados operativos y datos minimizados, sin lectura tenant-wide para `coach`/`payroll_manager`, payroll ni aprobacion legal;
- vigesimo cuarto criterio de salida I.24: horas extra candidatas tienen deteccion server-side prudente y manual desde `/app/time`, con idempotencia, fuentes trazadas, `needs_review` ante datos inciertos y resultado minimo, sin automatismo legal ni mutacion de fuentes;
- vigesimo quinto criterio de salida I.25: cobertura tiene trazabilidad operativa reciente en detalle de horario/cobertura para roles de gestion, desde ausencias, cambios y auditoria minimizada, sin resolver cobertura automaticamente;
- vigesimo sexto criterio de salida I.26: IA queda documentada como futura capacidad subordinada a documentos/programacion canonicos, permisos, grants, auditoria, privacidad y revision legal, sin IA funcional ni infraestructura runtime;
- vigesimo septimo criterio de salida E.6/I.27: programacion util queda modelada como documentos versionados y autorizados asociados a fecha/tipo/centro/bloque cuando aplique, con `schedule_block_assignments` solo como contexto operativo y sin IA;
- vigesimo octavo criterio de salida E.7/I.28: programacion documental tiene base tecnica interna con `document_programming_links`, RLS/RPC/helper y consultas autorizadas por bloque o fecha/tipo, sin UI visible, subida documental ni IA;
- vigesimo noveno criterio de salida E.8/I.29: Horario muestra programacion autorizada en detalle de bloque con fuente, version/fecha, disponibilidad y preview/descarga solo por permiso documental, sin subida visible, pagina documental completa ni IA;
- trigesimo criterio de salida E.9/I.30: QA interno verifica asociaciones de programacion documental contra Horario con rollback, grants reales, metadata limitada, denegacion sin permiso, bloqueo cross-tenant y `schedule_block_assignments` sin efecto sobre permisos documentales, sin abrir UI nueva ni IA;
- trigesimo primer criterio de salida E.10/I.31: validacion manual local/QA de programacion documental queda operativizada en runbook interno con seleccion de documento/version/grant/link/bloque, plantilla SQL rollback, checklist de permisos y guardrail estatico, sin abrir subida ni IA;
- trigesimo segundo criterio de salida E.11: repositorio documental visible minimo queda abierto en `/app/documents`, listando solo versiones accesibles por permisos reales, con preview/descarga por E.5 y sin subida, documentos `sensitive_hr`, documentos firmables, payroll ni IA;
- trigesimo tercer criterio de salida E.12: validacion QA/staging controlada del repositorio E.11 queda preparada con snippet SQL rollback, evidencia esperada por rol/grant, bloqueo cross-tenant, estados solo metadata/sin grant y exclusiones `sensitive_hr`/`payroll`/`signature_evidence`/`requires_signature`, sin abrir UI nueva;
- trigesimo cuarto criterio de salida E.13: evidencia local del repositorio documental minimo queda cerrada con ejecucion rollback del snippet E.12, plantilla redacted y bloqueo QA/staging documentado por falta de acceso/credenciales/archivo Storage controlado, sin inventar evidencia ni ampliar producto;
- trigesimo quinto criterio de salida E.14: reintento de validacion QA/staging real con archivo Storage controlado queda documentado como bloqueado por falta de acceso real/credenciales/casos QA desde el entorno actual, con snippet E.12 local reejecutado y sin inventar evidencia;
- trigesimo sexto criterio de salida E.15: desbloqueo controlado de validacion real del repositorio documental minimo queda actualizado con relectura de entorno redacted, SQL local rollback y bloqueo QA/staging por falta de project/ref, DB URL, credenciales/casos QA y objeto `document-files` controlado, sin inventar evidencia ni ampliar producto;
- trigesimo septimo criterio de salida E.16: handoff operativo controlado queda documentado para desbloquear QA/staging real del repositorio documental minimo con operador autorizado, variables/capacidades sin valores, casos QA, checklist, evidencia esperada y criterios de pass/bloqueado, sin inventar evidencia ni ampliar producto;
- trigesimo octavo criterio de salida OD.1/I.32: operativa diaria completa queda cerrada documentalmente para beta interna con flujos listos, validaciones real/staging, bloqueos por datos/credenciales/entorno, roles, smokes, evidencia y deuda, sin automatismos de cobertura, legalidad, payroll ni IA;
- cambios y ausencias se reflejan en cobertura de forma trazable sin saltarse el horario canonico;
- cambios de bloque/asignacion/plantilla quedan consultables por admins durante una ventana corta con actor, accion y campos cambiados minimizados;
- horas extra no se presentan como nomina ni calculo fiscal;
- IA queda subordinada a programacion/documentos ya existentes.

Decision I.1 2026-05-13:

- empezar Fase I por cambios de bloque/clase y cobertura entre coaches, no por ausencias, payroll, horas extra ni IA;
- tratar en I.1 `change_requests`, `change_request_targets`/offers y `change_request_events` como entidades candidatas; I.2 las convierte en primera base tecnica sin UI ni aplicacion al horario;
- mantener `schedule_blocks` y `schedule_block_assignments` como horario real canonico; una solicitud aplicada debe cambiar asignaciones de forma transaccional y trazable;
- exigir `organization_id`, RLS, permisos por actor, revalidacion de solapes/disponibilidad y auditoria minimizada antes de cualquier piloto de cambios/cobertura;
- no presentar aprobaciones de cambio/cobertura como cumplimiento laboral definitivo, firma documental, payroll ni aprobacion automatica de horas extra.

Decision I.2 2026-05-13:

- implementar solo la base tecnica segura en `change_requests`, `change_request_targets` y `change_request_events`, con `organization_id`, FKs tenant-safe, RLS estricta y escrituras mediante RPCs;
- permitir crear solicitud propia sobre bloque asignado, ofrecer a coach concreto/candidato y responder como coach target, revalidando bloque, tenant, perfil activo y solapes;
- dejar `approval_required = true` por defecto y mantener la solicitud aceptada en `pending_approval`;
- no aplicar todavia al horario real. I.3 debe implementar aprobacion/rechazo/aplicacion transaccional sobre `schedule_block_assignments` y volver a revalidar `coach-unavailable`.

Decision I.3 2026-05-13:

- implementar `00028_change_request_operations.sql` como primitiva DB/RLS/RPC sin UI para aprobar, rechazar, cancelar, expirar y aplicar solicitudes de cobertura/cambio ya aceptadas;
- `owner`, `admin` y `manager` gestionan aprobacion, rechazo y aplicacion tenant-wide; `center_manager` sigue futuro;
- la aplicacion real crea/reactiva asignacion destino con `source = 'change_request'`, retira la asignacion origen y solo despues marca la solicitud como `applied`;
- cada aplicacion revalida tenant, bloque accionable, asignacion origen, target aceptado, coach receptor activo/asignable y solape actual antes de tocar `schedule_block_assignments`;
- los fallos esperados de aplicacion quedan como `application_failed` minimizado y la solicitud no pasa a `applied`;
- no se abre UI, ausencias, payroll, horas extra aprobadas/automaticas, IA, push ni ubicacion.

Decision I.4 2026-05-13:

- anadir `supabase/snippets/change-requests-rls-verification.sql` como verificacion local con transaccion y rollback para I.2/I.3;
- cubrir paths positivos de gestion por `owner`/`admin`/`manager`, solicitud/cancelacion propia y aplicacion aprobada al horario real;
- cubrir negativos de otro tenant, rol sin permiso, coach no candidato, bloque cancelado/completado, solicitud/target expirados, doble aceptacion, aplicacion sin aprobacion, solape `coach-unavailable`, trigger anti-solape y escrituras directas del workflow sin efecto;
- no crear migracion `00029` porque la verificacion no detecta bug real en I.2/I.3;
- mantener UI/inbox, expiracion automatica, `swap`, ausencias, payroll, horas extra, IA, push y ubicacion fuera de este corte.

Decision I.5 2026-05-13:

- crear `src/lib/change-requests.ts` como capa interna server-side sobre I.2/I.3/I.4, sin UI visible ni Server Actions de producto;
- usar Supabase SSR con sesion normal, helpers de auth/tenant existentes y `canManageChangeRequests` para `owner`/`admin`/`manager`;
- no aceptar `person_profile_id` propio desde cliente y no introducir `service_role` en `src`;
- listar solicitudes visibles del tenant activo segun RLS y consumir RPCs de crear, ofrecer, responder, aprobar, rechazar, cancelar, expirar y aplicar;
- mapear errores esperados como `coach-unavailable`, `not-approved`, `expired`, `not-actionable` y `permission-denied`;
- no abrir inbox, navegacion, notificaciones, seeds, ausencias, payroll, horas extra, IA, push ni ubicacion.

Decision I.6 2026-05-14:

- abrir `/app/requests` como primera bandeja visible protegida para solicitudes de cambio/cobertura;
- mantener entrada secundaria en `/app/more` y navegacion desktop, sin nuevo item principal mobile;
- permitir lectura y acciones seguras por rol/actor sobre solicitudes existentes: responder target propio, cancelar propia, aprobar/rechazar/expirar/aplicar desde gestion;
- no crear solicitudes desde UI en I.6 para evitar un flujo parcial de creacion + oferta sin transaccion.

Decision I.7 2026-05-14:

- anadir RPCs atomicas para crear solicitud y targets iniciales en una sola transaccion antes de abrir el formulario visible;
- permitir creacion propia solo sobre asignacion `assigned` del coach autenticado y creacion gestionada solo para `owner`, `admin` y `manager`;
- resolver origenes y targets server-side desde tenant activo, sin aceptar `person_profile_id` ni `requester_coach_profile_id` desde cliente;
- mantener el horario canonico en `schedule_blocks` + `schedule_block_assignments`; la solicitud creada queda como workflow hasta que se apruebe/aplique;
- excluir `swap`, ausencias, payroll, horas extra aprobadas, IA, push, service worker, ubicacion y datos reales/hardcodeados de tenant.

Decision I.8 2026-05-14:

- endurecer `/app/requests` sin tocar DB/RPC/RLS: la UI desactiva targets que son el coach origen, ya cubren el mismo bloque o solapan con otro bloque activo, pero la transaccion RPC sigue siendo la fuente de verdad;
- mostrar solicitudes, targets y bloques vencidos/no accionables con copy operativo claro y ocultar acciones que ya no proceden;
- reutilizar `expire_change_request(...)` como accion manual acotada "Cerrar vencida" cuando existe motivo objetivo; no crear job, scheduler, push, service worker ni background sync;
- mantener todas las mutaciones por Server Actions + `src/lib/change-requests.ts`, con Supabase SSR normal y sin `service_role`;
- mantener `center_manager`, `swap`, ausencias, vacaciones, payroll, horas extra aprobadas, IA, ubicacion y reglas hardcodeadas de tenant fuera del corte.

Decision I.9 2026-05-14:

- iniciar ausencias/vacaciones/permisos como modelado documental seguro, no como UI rapida ni migracion precipitada;
- separar ausencia/no disponibilidad de solicitud de cobertura: la ausencia registra que una persona no puede estar disponible en un periodo, mientras que `change_requests` gestiona quien cubre un bloque concreto;
- proponer como entidades futuras `absence_requests`, `absence_request_periods`, `absence_schedule_impacts` y `absence_request_events`, siempre con `organization_id` obligatorio y acciones propias derivadas de sesion + tenant;
- usar estados candidatos `requested`, `pending_review`, `approved`, `rejected`, `cancelled` y `expired`; `applied` no es estado principal de ausencia porque aprobar una ausencia no modifica el horario por si sola;
- una ausencia aprobada que solapa `schedule_block_assignments.assigned` puede generar impacto de cobertura (`absence_conflict`, `uncovered` o `insufficient` futuro), pero no cambia automaticamente `schedule_blocks` ni retira/asigna coaches;
- resolver la cobertura sigue siendo accion separada: ajuste manual de asignacion o solicitud/aplicacion de `change_requests`, ocultando al coach candidato el motivo sensible de la ausencia;
- permisos candidatos: lectura/solicitud propia para la persona vinculada; revision operativa para `owner`, `admin` y `manager`; roles especializados sin herencia automatica hasta tener RLS/capacidades explicitas;
- retencion candidata: solicitudes cerradas/aprobadas como historico operativo durante 24 meses y eventos visibles 180 dias, pendiente de revision legal/privacidad antes de produccion;
- datos prohibidos: diagnosticos, salud, documentos, notas extensas, salario, payroll, IP/fingerprint, ubicacion, URLs, tokens, payloads completos, bajas medicas con documentos y cualquier promesa de cumplimiento legal definitivo;
- no se crea migracion en I.9. El siguiente corte tecnico debe confirmar nombres/estados/retencion y abrir DB/RLS/RPC/verificacion negativa como task separada.

Decision transversal de UX 2026-05-14:

- Inicio y el shell muestran la proxima clase asignada propia como recordatorio in-app persistente; el resumen del shell se mantiene tambien en Inicio y los recordatorios push siguen reservados a H.4 nativo/wrapper;
- el coach conserva Inicio y Mas, pero con contenido personal y operativo, no con opciones administrativas que solo terminan en "sin permiso";
- textos de alcance, limites legales o decisiones de roadmap deben ir detras de "Mas" cuando no son accion primaria;
- Plantillas conserva una UI densa para 165+ bloques, con filtros colapsables, seleccion multiple, edicion multiple limitada y sincronizacion idempotente del rango activo;
- Tipos de actividad sincroniza `required_coaches` hacia plantillas y horarios presentes/futuros accionables mediante RPC, preservando historico pasado/cerrado.
- Cobertura reutiliza la seleccion multiple para editar riesgos en lote: tipo de actividad, entrenadores necesarios o entrenador comun. El entrenador comun se desactiva si ya esta ocupado en cualquiera de las franjas seleccionadas; la action mantiene la validacion server-side.

Decision I.10 2026-05-14:

- se abre una base DB/RLS/RPC minima de ausencias en `supabase/migrations/00035_absence_requests_foundation.sql`, sin UI visible ni Server Actions de producto;
- el corte crea `absence_requests`, `absence_request_periods` y `absence_request_events`, con `organization_id` obligatorio, RLS estricta y escrituras normales bloqueadas;
- no se crea `absence_schedule_impacts`: el impacto se calcula al vuelo mediante `list_absence_schedule_impacts(...)` porque en este corte es derivable desde periodos de ausencia, `schedule_blocks` y `schedule_block_assignments`;
- las acciones propias derivan persona/coach desde `auth.uid()` + tenant en `create_own_absence_request(...)`; no aceptan `person_profile_id` propio desde cliente;
- `review_absence_request(...)` queda para `owner`, `admin` y `manager`; `cancel_absence_request(...)` permite cancelacion propia mientras no este aprobada y cancelacion gestionada; `expire_absence_request(...)` cierra pendientes objetivamente vencidas sin scheduler;
- estados principales: `requested`, `pending_review`, `approved`, `rejected`, `cancelled` y `expired`; `applied` sigue fuera porque aprobar una ausencia no modifica el horario;
- una ausencia aprobada puede devolver impacto `coverage_needed`, pero no modifica `schedule_blocks`, `required_coaches`, `status` ni `schedule_block_assignments`;
- resolver cobertura sigue siendo accion separada: ajuste manual futuro o `change_requests`, sin mostrar motivo sensible al coach candidato;
- `absence_request_events` guarda auditoria minimizada con actor derivado y retencion candidata de 180 dias; las solicitudes guardan `retain_until` candidato de 24 meses;
- la validacion legal/privacidad sigue siendo gate antes de produccion o datos reales, pero no bloquea esta foundation interna porque no abre UI, documentos, bajas medicas documentadas, saldos legales, payroll ni datos reales;
- `supabase/snippets/absence-requests-rls-verification.sql` cubre rollback para tenant safety, rol sin permiso, persona ajena, periodo invalido, impacto cruzado y escrituras directas bloqueadas;
- UI, capa app/server, saldos legales, payroll, horas extra aprobadas, bajas medicas con documentos, cumplimiento legal definitivo, push, ubicacion y app nativa siguen fuera.

Decision I.11 2026-05-14:

- se crea `src/lib/absence-requests.ts` como capa interna server-side sobre la foundation I.10, sin rutas, paginas, componentes, navegacion ni Server Actions visibles;
- todos los helpers exigen `organizationId` explicito y resuelven sesion, membership activa y tenant antes de consultar o llamar RPC;
- las acciones propias siguen sin aceptar `person_profile_id`: `createOwnAbsenceRequest(...)` delega en `create_own_absence_request(...)` y `cancelOwnAbsenceRequest(...)` solo cancela propias `requested`/`pending_review`;
- la cola operativa y `reviewAbsenceRequest(...)` quedan reservadas a `owner`, `admin` y `manager`, alineadas con `can_manage_absence_requests(...)`;
- `listAbsenceRequestEvents(...)` solo relee eventos minimizados; no hay helper de registro porque I.10 registra eventos dentro de RPCs acotadas y no concedio una RPC publica de auditoria;
- `listAbsenceScheduleImpacts(...)` consume `list_absence_schedule_impacts(...)` en lectura y respeta que `absence_schedule_impacts` no existe;
- no hay escrituras directas a tablas de ausencia, no se introduce `service_role`, no se modifica horario/asignaciones y resolver cobertura sigue separado mediante ajuste manual futuro o `change_requests`;
- legal/privacidad sigue siendo gate antes de produccion o datos reales; I.11 solo prepara consumo interno seguro.

Decision I.12 2026-05-14:

- abrir `/app/absences` como primera bandeja visible protegida de ausencias/vacaciones/permisos;
- mantener entrada secundaria desde `/app/more` y sidebar personal, sin nuevo item principal mobile;
- listar solicitudes propias para roles con self-service permitido (`owner`, `admin`, `manager`, `coach`) mediante `listOwnAbsenceRequests(...)`;
- mostrar cola de revision operativa solo a `owner`, `admin` y `manager` mediante `listAbsenceReviewQueue(...)`;
- mostrar periodos, estado, tipo, resumen minimizado, ultimo evento visible e impacto calculado al vuelo con `listAbsenceScheduleImpacts(...)`;
- exponer solo acciones seguras soportadas por helper/RPC: cancelar propia en `requested`/`pending_review`, aprobar/rechazar desde gestion y expirar manualmente solicitudes objetivamente vencidas;
- mantener todas las mutaciones en Server Actions que revalidan sesion, membership activa, tenant, rol y `organization_id` antes de delegar en `src/lib/absence-requests.ts`;
- no aceptar `person_profile_id` propio desde cliente, no usar `service_role`, no escribir tablas de ausencia directamente y no modificar `schedule_blocks` ni `schedule_block_assignments`;
- mantener fuera formulario de nueva ausencia, calendario, saldos legales/devengo, payroll, bajas medicas con documentos, cobertura automatica, push, geolocalizacion, app nativa, seeds reales y reglas hardcodeadas de tenant.

Decision I.13 2026-05-15:

- abrir en `/app/absences` solo un formulario minimo para crear solicitud propia, posterior a la bandeja I.12;
- reutilizar exclusivamente `createOwnAbsenceRequest(...)` de `src/lib/absence-requests.ts`, delegando en la RPC `create_own_absence_request(...)`;
- permitir solo `vacation`, `day_off`, `partial_day`, `permission`, `personal_absence` y `unavailable`;
- pedir tipo, inicio, fin, dia completo, zona horaria de la organizacion activa y resumen operativo corto opcional;
- revalidar en Server Action sesion, membership activa, tenant, rol, `organization_id`, tipo, periodo, duracion maxima y resumen antes de llamar al helper;
- no aceptar `person_profile_id` ni `coach_profile_id` desde cliente; la identidad propia se deriva en helper/RPC desde sesion + tenant;
- tras crear, volver a la bandeja mostrando el estado devuelto por RPC, normalmente `pending_review`;
- mantener impacto calculado al vuelo con `listAbsenceScheduleImpacts(...)`, sin persistir `absence_schedule_impacts` ni modificar horario/asignaciones;
- bloquear resumenes largos o sensibles y usar copy prudente: aprobacion operativa, no saldos legales, devengo, payroll, bajas medicas documentadas ni cumplimiento legal definitivo;
- mantener fuera creacion para otra persona, calendario, saldos legales/devengo, payroll, adjuntos, documentos firmables, push, geolocalizacion, app nativa, seeds reales y reglas hardcodeadas de tenant.

Decision I.14 2026-05-15:

- antes de endurecer, confirmar que I.13 esta completa en codigo: `/app/absences` tiene formulario propio y la Server Action llama a `createOwnAbsenceRequest(...)`;
- no tocar DB/RLS/RPC ni abrir calendario, saldos legales, cobertura automatica o creacion para otra persona;
- anadir filtros simples por query string (`view`, `absence_type`, `absence_status`) en la bandeja, validados en servidor y sin nueva navegacion principal mobile;
- mantener creacion solo propia y revision operativa solo para `owner`, `admin` y `manager`;
- mostrar por solicitud por que no procede cancelar, aprobar, rechazar o cerrar como vencida, y conservar "Cerrar vencida" solo cuando existe motivo objetivo;
- reforzar la validacion visible del formulario con error junto al formulario, confirmacion de no incluir datos sensibles y botones con estado pendiente/confirmacion; la Server Action revalida todo y convierte `datetime-local` con la zona horaria de la organizacion activa;
- mantener impacto calculado al vuelo con `listAbsenceScheduleImpacts(...)`, sin persistir impacto ni modificar `schedule_blocks` o `schedule_block_assignments`;
- mantener copy prudente: aprobacion operativa, no cumplimiento legal definitivo, no saldos/devengo, payroll, bajas medicas documentadas, adjuntos, push, geolocalizacion ni app nativa.

Decision I.15 2026-05-15:

- ejecutar I.15 como QA/hardening tecnico de regresion, no como ampliacion funcional de ausencias;
- confirmar en codigo que I.13/I.14 siguen presentes antes de anadir pruebas: formulario propio por `createOwnAbsenceRequest(...)`, filtros GET, validacion visible, estados no accionables y copy prudente;
- anadir smoke/guardrails para que `/app/absences` no acepte `person_profile_id` ni `coach_profile_id` propios desde cliente, no escriba directamente tablas de ausencia y no use `service_role`;
- cubrir query string `view`, `absence_type` y `absence_status`: `coach` no activa cola de revision por URL y `owner`/`admin`/`manager` si ven superficie de revision cuando hay credenciales E2E;
- proteger tambien la ruta filtrada anonima en `auth-protection`;
- mantener cerrados calendario, saldos legales/devengo, cobertura automatica, creacion para otra persona, payroll, bajas medicas con documentos, push, geolocalizacion, app nativa, seeds reales y reglas hardcodeadas de tenant.

Decision I.16 2026-05-15:

- iniciar la integracion de ausencias con cobertura solo como lectura derivada sobre el calculo existente;
- `listOperationalAbsenceScheduleImpacts(...)` filtra ausencias `approved` y `pending_review` del tenant para roles de gestion y delega el cruce final en `list_absence_schedule_impacts(...)`;
- `coverage_needed` excluye esa asignacion del conteo valido de cobertura; `potential` marca riesgo operativo sin descontar cobertura;
- `/app/schedule`, `/app/coverage`, Inicio y `/app/stats` pueden mostrar "impacto de ausencia" o "ausencia en revision", pero no muestran motivos ni resumenes sensibles;
- si la lectura de impacto falla, la cobertura base sigue disponible y se muestra aviso prudente;
- no se crea `absence_schedule_impacts`, no se modifica `schedule_blocks` ni `schedule_block_assignments`, no se crean ofertas/targets y no se resuelve cobertura automaticamente;
- se anade smoke/guardrail para proteger que la integracion siga read-only, sin `service_role`, sin `STL`, sin motivos sensibles en cobertura y sin escrituras directas a tablas de ausencia.

Decision I.17 2026-05-15:

- abrir eventos, festivos y competiciones solo como modelado documental seguro antes de una foundation tecnica;
- tratar `box_events` como contexto operativo tenant-scoped, no como horario canonico, fichaje, payroll, RRHH sensible ni cumplimiento legal definitivo;
- proponer `box_events`, `box_event_occurrences`, `box_event_schedule_contexts`, `box_event_responses` y `box_event_audit_events` como entidades candidatas sin migrar;
- mantener tipos candidatos cerrados (`holiday`, `closure`, `competition`, `seminar`, `open_day`, `internal_event`, `external_event`, `maintenance`, `community_event`) y estados `draft`, `planned`, `confirmed`, `cancelled`, `completed`, `archived`;
- permitir que un evento marque contexto o revision necesaria, pero no cancelar bloques, cambiar `required_coaches`, crear asignaciones, generar solicitudes ni resolver cobertura automaticamente;
- si una competicion, festivo o seminario requiere staffing real, el bloque operativo debe crearse de forma explicita en `schedule_blocks` en un corte futuro, no por conversion silenciosa;
- permisos candidatos: `owner`/`admin`/`manager` gestionan eventos del tenant cuando exista schema; `coach` lee contexto confirmado relevante; respuestas propias futuras derivan persona desde sesion + tenant; `center_manager` queda futuro;
- retencion candidata: eventos operativos 24 meses tras finalizar/archivar y auditoria/respuestas 180 dias, pendiente de revision legal/privacidad antes de datos reales;
- mantener fuera de I.17 schema, UI, calendario mensual/anual avanzado, seeds, datos reales, payroll, horas extra aprobadas, voluntariado legal de festivo, documentos firmables, push, service worker, background sync, caches privadas, geolocalizacion web y app nativa.

Decision I.18 2026-05-15:

- implementar solo foundation tecnica interna con `operational_events`, no una pantalla grande nueva;
- `operational_events` aterriza el candidato `box_events` de I.17 con nombre explicito de contexto operativo y `organization_id` obligatorio;
- campos iniciales: centro opcional tenant-safe, titulo, tipo cerrado, ventana temporal, timezone, `all_day`, estado `active`/`cancelled`/`archived`, visibilidad, impacto, notas minimizadas, actor membership y retencion candidata;
- permisos: `owner`/`admin`/`manager` gestionan por RPC/helper server-side; `coach` lee solo eventos `active` con `visibility` `staff` o `all_staff`; `staff`, `center_manager`, `document_admin` y `payroll_manager` no reciben permiso nuevo;
- auditoria minima: `operational_audit_events` acepta `entity_type = operational_events`, acciones cerradas y `changed_fields` minimizado, con retencion de 180 dias;
- no se implementan ocurrencias, respuestas personales, contexto persistido de bloques, calendario mensual/anual, seeds, UI visible grande ni conversion automatica a horario/cobertura.

Decision I.19 2026-05-15:

- abrir solo una superficie minima en `/app/schedule`, debajo de Jornada prevista, para dar contexto semanal/del dia sin crear un calendario avanzado;
- listar con `listOperationalEvents(...)` y mutar solo mediante Server Actions que delegan en helper/RPC de I.18;
- `owner`, `admin` y `manager` ven controles colapsados para crear, editar, cancelar, reactivar y archivar; `coach` no ve superficie de gestion;
- mantener los eventos como contexto operativo: no mutan `schedule_blocks`, `schedule_block_assignments`, cobertura, ausencias, fichaje, solicitudes ni payroll.

Decision I.20 2026-05-16:

- definir "hora extra" como candidato operativo de exceso/diferencia positiva que requiere revision humana, no como hora extra legal aprobada;
- separar horas planificadas (`schedule_blocks`, `schedule_block_assignments`, `staff_work_windows`) de horas fichadas/trabajadas (`time_records`, `time_punches`) y de diferencias/alertas;
- proponer `overtime_candidates`, `overtime_candidate_sources`, `overtime_candidate_events` y un exporte interno futuro opcional, todos tenant-scoped y sin migrar;
- usar estados prudentes: `detected`, `needs_review`, `under_review`, `operationally_validated`, `operationally_rejected`, `superseded` y `closed`;
- permitir lectura propia y revision operativa futura por `owner`/`admin`/`manager` solo si una foundation tecnica lo habilita; `payroll_manager` no hereda acceso ni aprobacion en este corte;
- relacionar candidatos con fichaje, cierre semanal, horario, asignaciones, jornada prevista, ausencias y eventos solo como fuentes/contexto, sin modificar esas tablas;
- mantener fuera schema, UI, Server Actions, payroll, compensaciones, importes, saldos legales, cierre mensual legal, exporte legal, geolocalizacion, push, service worker, caches privadas y reglas hardcodeadas de tenant.

Decision I.21 2026-05-16:

- crear `overtime_candidates`, `overtime_candidate_sources` y `overtime_candidate_events` como foundation tecnica minima con `organization_id`, RLS y escritura directa bloqueada;
- mantener `candidate_minutes` como diferencia operativa generada desde snapshots de minutos, no como calculo legal definitivo;
- aceptar solo senales con diferencia positiva y estados operativos de I.20;
- validar fuentes contra el tenant y, si son personales, contra la persona afectada del candidato;
- permitir revision operativa solo a `owner`, `admin` y `manager`, y lectura propia minimizada por RLS;
- consumir la base desde `src/lib/overtime-candidates.ts` con sesion Supabase normal y permisos previos en servidor;
- no crear UI visible, Server Actions de producto, exportes, payroll, importes, saldos, compensaciones ni mutaciones sobre fichaje, horario, asignaciones, ausencias o eventos.

Decision I.22 2026-05-16:

- anadir `supabase/snippets/overtime-candidates-rls-verification.sql` como QA/RLS local con transaccion y rollback;
- cubrir permisos reales de `owner`, `admin`, `manager`, `coach`, `payroll_manager` y otro tenant;
- verificar que fuentes personales pertenecen a la persona afectada y que fuentes de otra persona u otro tenant se rechazan;
- confirmar que candidatos `closed` o `superseded` no aceptan nuevas fuentes ni cambios;
- confirmar que `authenticated` no puede hacer `INSERT`, `UPDATE` ni `DELETE` directos sobre candidatos, fuentes ni eventos;
- confirmar con snapshot antes/despues que las operaciones de candidatos no mutan `schedule_blocks`, `schedule_block_assignments`, `time_records` ni `time_punches`;
- endurecer el smoke de foundation sin crear UI visible, Server Actions, payroll/importes, geolocalizacion/push/cache ni hardcode de tenant.

Decision I.23 2026-05-16:

- abrir `/app/time` como superficie discreta de revision operativa de candidatos de posible exceso, no como modulo grande ni pantalla de nominas;
- listar candidatos del tenant solo para `owner`, `admin` y `manager` mediante `listOvertimeCandidates(...)`;
- mostrar persona afectada, rango, minutos planificados/trabajados snapshot, diferencia candidata, estado operativo, fuente de deteccion y fechas de creacion/revision/cierre;
- cambiar estado solo mediante Server Action que delega en `setOvertimeCandidateStatus(...)`, sin escrituras directas a tablas de candidatos;
- mantener `closed` y `superseded` no accionables; no ofrecer creacion manual visible;
- ocultar cola y acciones a `coach`, y no conceder acceso tenant-wide a `payroll_manager`;
- mantener fuera calculo definitivo, payroll, importes, saldos, compensaciones, exporte legal, geolocalizacion/push/cache, hardcode de tenant y mutaciones de fichaje/horario.

Decision I.24 2026-05-16:

- crear `src/lib/overtime-candidate-detection.ts` como detector server-side acotado que reutiliza `createOvertimeCandidateSignal(...)`, `addOvertimeCandidateSource(...)` y `setOvertimeCandidateStatus(...)`;
- leer solo contexto existente de `time_records`, `time_punches`, `time_weekly_approvals`, `schedule_blocks`, `schedule_block_assignments` y `staff_work_windows`, con correcciones de fichaje solo como senal de prudencia;
- generar candidatos solo con diferencia positiva clara entre minutos planificados snapshot y minutos trabajados snapshot;
- mantener idempotencia por persona, rango, fuente y snapshots para no duplicar candidatos obvios;
- marcar `needs_review` cuando haya fichajes abiertos, correcciones pendientes/aprobadas, semanas reabiertas o datos incompletos;
- anadir en `/app/time` una accion manual `Detectar posibles excesos` solo para `owner`, `admin` y `manager`, con feedback de creados, ya existentes e ignorados por datos insuficientes;
- mantener fuera payroll, calculo definitivo, aprobacion legal, cron/scheduler/background job, mutaciones de fuentes, acceso para `coach`/`payroll_manager`, geolocalizacion/push/cache y hardcode de tenant.
