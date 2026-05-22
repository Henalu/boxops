# Daily Operations Beta Readiness Runbook - BoxOps

Estado 2026-05-18. Este runbook documenta OD.1 / I.32: cierre de operativa diaria completa para beta interna. Es una fase de cierre y validacion prudente de lo ya construido, no producto nuevo.

No abre IA, app nativa, geofencing, payroll, documentos firmables, subida documental visible, calendario avanzado, migraciones, rutas nuevas ni UI nueva. Cobertura, ausencias, eventos y jornada prevista son contexto operativo para que una persona decida mejor; no resuelven cobertura automaticamente.

## Objetivo

Dejar claro si owner, admin, manager y coach pueden usar la webapp para el dia a dia de un box en beta interna controlada:

- revisar horario semanal, plantillas, asignaciones y cobertura;
- crear, responder, revisar y aplicar solicitudes de cambio/cobertura existentes;
- solicitar/revisar ausencias y ver impacto operativo sin motivos sensibles;
- usar eventos, festivos y competiciones como contexto;
- usar jornada prevista como presencia planificada, no como fichaje ni payroll;
- comprobar Inicio/dashboard por rol;
- ejecutar smokes minimos por rol;
- guardar evidencia suficiente para decidir `bloqueado`, `listo para beta interna` o `pendiente para v1 comercial`.

## Fuentes Revisadas

- `PROJECT_BRIEF.md`
- `TASKS.md`
- `docs/product/roadmap.md`
- `docs/product/webapp-completion-roadmap.md`
- `docs/operations/beta-operational-readiness-runbook.md`
- `docs/operations/tenant-readiness-checklist.md`
- `docs/operations/time-tracking-beta-readiness-runbook.md`
- `docs/operations/pre-qa-controlled-pilot-runbook.md`
- `docs/architecture/security-baseline.md`
- `docs/architecture/personal-data-permissions.md`
- `docs/operations/legal-and-privacy-notes.md`
- `docs/product/ux-principles.md`

## Revision OD.1 2026-05-18

Resultado: `bloqueado por acceso/entorno`, no `listo para beta interna`. Se releyo el entorno sin imprimir secretos ni valores y no aparecio acceso real suficiente para ejecutar validaciones staging, smokes autenticados por rol ni evidencia operativa diaria real.

Hallazgos redacted:

- `.env.local` existe, esta ignorado por git y no esta trackeado.
- No hay URL QA/staging de app en `E2E_BASE_URL`, `QA_APP_URL`, `STAGING_APP_URL`, `APP_QA_URL`, `APP_STAGING_URL` ni `VERCEL_URL`.
- No hay `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_URL`, `DATABASE_URL`, `POSTGRES_URL` ni `SUPABASE_SERVICE_ROLE_KEY` disponibles desde este entorno.
- No hay credenciales E2E para `owner`, `admin`, `manager` ni `coach`; tampoco `E2E_ORGANIZATION_ID` ni `E2E_WEEK`.
- No hay `QA_TENANT_ID`, `QA_ORGANIZATION_ID`, `STAGING_TENANT_ID`, `STAGING_ORGANIZATION_ID`, `QA_DATASET` ni `STAGING_DATASET`.
- Hay configuracion local de Resend/app email, pero no hay SMTP real (`SMTP_*` o `SUPABASE_SMTP_*`) ni email interno controlado verificable desde este entorno.
- No se ejecutan invitacion, aceptacion, reset, purga real, smokes autenticados ni validaciones staging porque faltan URL real, acceso Supabase/DB, credenciales, tenant QA/staging y datos operativos controlados.

Revision local de superficies existentes:

- Inicio `/app` mantiene dashboard operativo para roles de gestion y vista personal para `coach`, con fichaje solo como avisos/cierre interno y sin payroll ni cumplimiento legal definitivo.
- Horario `/app/schedule` mantiene bloques, filtros, asignaciones, cobertura, programacion autorizada, eventos y jornada prevista. `owner`, `admin` y `manager` gestionan; `coach` queda en lectura/uso personal segun permisos.
- Plantillas `/app/templates` quedan reservadas a `owner`, `admin` y `manager`; `coach` recibe salida hacia Horario.
- Cobertura `/app/coverage` mantiene cola de riesgos y acciones explicitas de gestion; ausencias y trazabilidad explican contexto sin resolver cobertura automaticamente.
- Solicitudes `/app/requests` mantienen creacion/respuesta/revision/aplicacion por acciones humanas; no crean ausencias, payroll, horas extra aprobadas ni decisiones legales.
- Ausencias `/app/absences` mantienen self-service propio y cola de revision para gestion; el impacto se calcula en lectura y no modifica horario ni asignaciones.
- Eventos/festivos/competiciones en `/app/schedule` siguen siendo `operational_events` de contexto; no cancelan bloques, no cambian cobertura, no generan fichaje ni payroll.
- Jornada prevista en `/app/schedule` sigue siendo `staff_work_windows` expandido al vuelo; no es bloque, asignacion, fichaje, contrato ni payroll.
- Fichaje `/app/time` queda solo como referencia cruzada con F.15; si entra en beta requiere su runbook propio. La webapp sigue sin geolocalizacion, payroll ni promesa legal definitiva.

Roles confirmados a nivel de codigo/documentacion:

- `owner` y `admin` conservan configuracion global/accesos y gestion operativa amplia.
- `manager` conserva gestion diaria tenant-wide sin configuracion global sensible, billing ni permisos por centro.
- `coach` conserva Inicio personal, horario/contexto permitido, solicitudes propias/targets, ausencias propias y fichaje propio sin colas tenant-wide sensibles.
- `center_manager` sigue futuro: esta reconocido como rol, pero no hay permisos por centro funcionales ni frontera por centro activada.

## Estado De Flujos Diarios

| Flujo | Estado para beta interna | Validacion pendiente |
|---|---|---|
| Inicio/dashboard por rol | Usable como resumen operativo: cobertura, pendientes, proxima clase propia, avisos y accesos rapidos segun rol. | Probar con datos reales y credenciales E2E de `owner`, `admin`, `manager` y `coach`. |
| Horario semanal | Muy avanzado: bloques, filtros, "mi horario", detalle, asignaciones, trazabilidad y programacion autorizada. | Validacion oficial de semana real por centro, coach, tipo, huecos y simultaneidades. |
| Plantillas | Usables para semanas grandes: vistas Semana/Agenda, filtros, seleccion multiple, excepciones e idempotencia. | Confirmar plantilla real que se usara en beta y que no duplica ni pisa historico. |
| Asignaciones | Usables con guardrail Postgres anti-solape y validacion server-side. | Smoke con datos reales/staging para asignar, retirar y reintentar coach ocupado. |
| Cobertura | Usable como cola de riesgos y lectura semanal. | Validar que `uncovered`, `insufficient` y posibles datos legacy `conflict` coinciden con la operativa real. |
| Solicitudes de cambio/cobertura | Workflow minimo avanzado: bandeja, creacion atomica, targets, respuestas, aprobacion/aplicacion y trazabilidad. | Probar end-to-end con coach solicitante, coach target y manager/admin en staging. |
| Ausencias | Bandeja, creacion propia, revision operativa, filtros, impacto en cobertura y trazabilidad prudente. | Probar con casos reales minimizados y revisar privacidad/legal antes de datos sensibles. |
| Eventos/festivos/competiciones | Contexto minimo visible en Horario, con gestion colapsada para roles de gestion. | Validar eventos reales como contexto; no convertirlos automaticamente en bloques ni cancelaciones. |
| Jornada prevista | Contexto compartido de presencia prevista mediante `staff_work_windows`. | Validar franjas reales por persona/centro y confirmar que no se interpreta como fichaje, contrato ni payroll. |
| Fichaje conectado al dia a dia | Fichaje web existe en Fase F, aporta avisos operativos y F.15 deja checklist propio de readiness beta. | Ejecutar `docs/operations/time-tracking-beta-readiness-runbook.md` si fichaje entra en la beta; cierre legal/retencion/exporte definitivo sigue fuera. |
| Smokes por rol | Base tecnica existe, con skips cuando faltan credenciales. | Para beta real, los skips por falta de credenciales E2E bloquean readiness. |

## Que Puede Validarse Localmente

La validacion local sirve como preflight, no como aprobacion de beta real:

- `git diff --check` o diff acotado si hay deuda ajena conocida.
- `rg -n "STL" src` sin coincidencias.
- `rg -n "service_role" src` sin coincidencias.
- `rg -n "OpenAI|openai|anthropic|embeddings|vector|pgvector|ai_" src` sin nuevas coincidencias.
- `rg -n "navigator\.geolocation|serviceWorker|service worker|PushManager|Notification|background sync|caches\.|CacheStorage" src` sin nuevas coincidencias.
- Smoke anonimo de rutas protegidas.
- Smoke autenticado si existen credenciales locales/QA.
- Relectura manual de Horario, Cobertura, Plantillas, Solicitudes, Ausencias, Inicio y Fichaje contra fixture local.
- Confirmacion documental de que cobertura, ausencias, eventos y jornada prevista siguen siendo contexto operativo y no automatismos.

## Que Requiere Entorno Real O Staging

OD.1 no puede cerrar beta interna real solo con local. Requiere:

- tenant real/staging activado segun S.8 y B.4;
- datos reales revisados oficialmente;
- credenciales E2E fuera del repo para `owner`, `admin`, `manager` y `coach`;
- Supabase/Auth/email/staging funcionando si el smoke toca invitaciones, reset o usuarios reales;
- semana/plantilla real cargada o preparada de forma controlada;
- al menos un caso de coach solicitante y coach target para solicitudes;
- al menos un caso de ausencia aprobada o en revision si ausencias entra en beta;
- al menos un evento/festivo/competicion real o caso controlado si se valida contexto;
- franjas reales o acordadas de jornada prevista si se valida esa capa;
- evidencia guardada fuera del repo si contiene datos reales.

## Bloqueado Por Datos, Credenciales O Entorno

El cierre queda `bloqueado` si falta cualquiera de estos elementos y el flujo forma parte de la beta:

- no hay credenciales E2E por rol;
- los smokes autenticados quedan skipped por falta de credenciales;
- no hay semana real validada bloque a bloque;
- no hay responsable operativo que confirme huecos intencionados, coaches y centros;
- no hay staging/real con Auth/email suficiente para probar usuarios;
- no se puede distinguir `owner`, `admin`, `manager` y `coach` en el entorno;
- faltan datos para solicitudes de cambio/cobertura end-to-end;
- faltan datos para probar ausencias sin usar motivos sensibles reales;
- el equipo espera que BoxOps resuelva automaticamente cobertura, apruebe horas extra, genere payroll o decida por IA.

## Roles En Operativa Diaria

| Rol | Puede hacer en beta interna | No debe hacer |
|---|---|---|
| `owner` | Configuracion global, accesos, equipo, horario, plantillas, cobertura, solicitudes, ausencias, eventos, jornada prevista, fichaje administrativo y evidencias de readiness. | Heredar payroll, documentos sensibles, firma por otra persona, geofencing, IA o lectura documental sin grant/capacidad. |
| `admin` | Operativa amplia y configuracion compatible: equipo, centros, tipos, horario, plantillas, cobertura y revisiones. | Saltarse tenant, usar `service_role`, acceder por defecto a documentos/payroll o resolver cobertura automaticamente. |
| `manager` | Gestion diaria tenant-wide: horario, cobertura, plantillas, solicitudes, ausencias, eventos, jornada prevista y revision operativa. | Tocar configuracion global sensible, roles/accesos, billing, payroll o permisos por centro implicitos. |
| `coach` | Inicio personal, horario propio y de equipo permitido, solicitudes propias/targets, ausencias propias, fichaje propio, cuenta propia, eventos visibles y programacion autorizada por grant. | Mutar datos administrativos, ver cola tenant-wide sensible, resolver cobertura de otros o acceder a documentos sin grant. |

## Smoke Minimo Por Rol

Anonimo:

- `/login` carga.
- `/app` redirige a `/login`.
- Rutas diarias protegidas redirigen a `/login`: Inicio, Horario, Cobertura, Plantillas, Solicitudes, Ausencias, Fichaje, Equipo y Configuracion.

`owner`:

- entra en Inicio y ve resumen operativo sin errores;
- puede abrir Configuracion y Equipo;
- puede abrir Horario, Plantillas, Cobertura, Solicitudes, Ausencias y Fichaje;
- no ve mensajes de datos sensibles como payroll o documentos firmables cerrados;
- no se crea ningun automatismo de cobertura por navegar o revisar.

`admin`:

- revisa horario semanal, cobertura y plantillas;
- prueba asignacion/retiro controlado si el entorno lo permite;
- revisa una solicitud y una ausencia controlada;
- confirma que los estados criticos no dependen de color de tenant;
- no accede a payroll, documentos sensibles ni IA.

`manager`:

- accede a operativa diaria sin configuracion global sensible;
- puede gestionar horario/cobertura/solicitudes/ausencias/eventos/jornada prevista segun permisos existentes;
- no puede gestionar roles/memberships globales ni billing;
- ve trazabilidad operativa prudente en Horario/Cobertura.

`coach`:

- ve Inicio personal y proxima clase si aplica;
- ve horario propio y contexto permitido del equipo;
- puede responder solicitudes target y crear solicitud propia si hay asignacion accionable;
- puede crear/cancelar ausencia propia segun estado;
- ve eventos visibles y jornada prevista activa como contexto;
- no ve acciones administrativas ni colas tenant-wide sensibles.

## Evidencia Que Debe Guardarse

Guardar fuera del repo si contiene datos reales:

- fecha, entorno y URL;
- responsable que valida datos reales;
- version o commit/diff revisado;
- resultado de `git diff --check` o nota de deuda ajena preexistente;
- resultados de guardrails `rg`;
- lista de roles E2E disponibles, sin passwords;
- resultado de smoke anonimo y por rol;
- checklist de semana/plantilla real validada;
- evidencia de solicitud de cambio/cobertura end-to-end si aplica;
- evidencia de ausencia e impacto de cobertura si aplica;
- evidencia de evento/festivo/competicion como contexto si aplica;
- evidencia de jornada prevista como contexto si aplica;
- evidencia F.15 de fichaje web si el flujo entra en beta;
- deuda UX menor aceptada;
- deuda bloqueante abierta;
- decision final: `bloqueado`, `listo para beta interna` o `pendiente para v1 comercial`.

No guardar passwords, tokens, API keys, cookies, enlaces activos de invitacion/reset, documentos privados, signed URLs, screenshots con datos personales innecesarios ni motivos sensibles de ausencias.

## Deuda UX Menor Que No Bloquea Beta

Puede quedar documentada si los smokes pasan y el flujo diario se entiende:

- targets tactiles moviles compactos en controles secundarios;
- vista mensual avanzada de ausencias/eventos;
- respuestas personales a eventos;
- swap rico entre dos bloques si el workflow actual cubre el caso principal;
- acciones masivas mas sofisticadas;
- colores por centro;
- logo privado del tenant;
- onboarding guiado de nuevo box;
- calendario avanzado;
- copy de ayuda adicional si no afecta a la accion diaria.

## Deuda Que Si Bloquea Beta

Bloquea OD.1 si aparece en el alcance diario:

- no poder cargar o revisar la semana real;
- cobertura incorrecta con datos representativos;
- imposibilidad de distinguir bloque vacante, insuficiente, cubierto o conflicto;
- asignaciones que permitan solapes reales de coach;
- solicitudes que no puedan responderse, aprobarse o aplicarse en un caso basico;
- ausencias que muten horario/asignaciones automaticamente o muestren motivos sensibles en cobertura;
- eventos que cancelen bloques o alteren cobertura sin accion explicita;
- jornada prevista confundida con fichaje, contrato, payroll o prueba de presencia;
- acciones admin visibles a `coach`;
- `manager` con acceso a configuracion global sensible por accidente;
- hardcode de tenant en `src`;
- `service_role` en `src`;
- IA, geofencing, service worker/push/cache privada, payroll, documentos firmables o subida documental visible en el diff.

## Que Queda Para V1 Comercial

OD.1 puede cerrar beta interna aunque queden para v1:

- importacion/carga guiada de nuevo box;
- permisos por centro y `center_manager` con frontera real DB/RLS/UX;
- calendario mensual/anual de ausencias y eventos si el uso real lo exige;
- respuestas/asistencia a eventos;
- modulo documental visible con subida controlada, grants UI, auditoria y firma documental;
- certificaciones de coaches;
- cierre legal de fichaje, retencion, accesos y exportes mas alla del checklist F.15;
- exportes comerciales CSV/PDF;
- soporte, billing, onboarding y guias de usuario;
- hardening produccion: ASVS, headers/CSP, backups, observabilidad y pruebas negativas ampliadas;
- app nativa/geofencing/push solo si hay razon comercial y revision legal;
- IA como ultimo extra futuro, posterior a documentos/programacion/permisos/auditoria/legal y webapp vendible.

## Que No Prometer Todavia

- Resolucion automatica de cobertura.
- Asignacion automatica o ranking inteligente de coaches.
- Aprobacion legal de horas extra.
- Payroll, nominas, importes, saldos o compensaciones.
- Cumplimiento laboral definitivo por tener jornada prevista, fichaje o cierre semanal.
- Calendario laboral legal definitivo por registrar eventos/festivos.
- Geofencing web, app nativa, push o background sync.
- Documentos firmables o validez legal avanzada/cualificada de firma.
- IA funcional, RAG, embeddings, prompts runtime, vector DB, jobs o decisiones automaticas.
- Produccion lista si faltan S.8, B.4, hardening, backups, observabilidad o revision legal/privacidad.

## Resultado Esperado De OD.1 / I.32

OD.1/I.32 queda cerrado cuando:

- este runbook esta referenciado desde `TASKS.md`, `PROJECT_BRIEF.md`, `docs/product/roadmap.md` y `docs/product/webapp-completion-roadmap.md`;
- esta claro que la fase es cierre operativo para beta interna, no feature nueva;
- se distingue lo validable localmente frente a lo que requiere real/staging;
- se listan bloqueos por falta de datos, credenciales o entorno;
- owner/admin/manager/coach tienen criterios de smoke diarios;
- la deuda menor y bloqueante queda separada;
- v1 comercial queda diferenciado de beta interna;
- IA queda como ultimo extra futuro;
- el diff confirma que no se abrio app nativa, geofencing, payroll, documentos firmables, subida visible documental, UI documental nueva ni resolucion automatica de cobertura.
