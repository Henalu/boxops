# Time Tracking Beta Readiness Runbook - BoxOps

Estado 2026-05-17. Este runbook documenta F.15: cierre de fichaje web y cierre laboral prudente para beta interna. Es una fase de readiness sobre F.4-F.14, no producto nuevo.

No abre geolocalizacion web, `navigator.geolocation`, geofencing, app nativa, push, service worker, background sync, CacheStorage, payroll, importes, compensaciones, documentos firmables, subida documental visible, IA funcional, embeddings, RAG, vector DB, prompts runtime, SDKs, jobs nuevos ni cumplimiento legal definitivo.

## Objetivo

Confirmar que el fichaje web actual puede entrar en beta interna controlada como flujo operativo prudente:

- entrada/salida manual propia;
- correcciones propias con motivo y trazabilidad;
- vista semanal y avisos frente a asignaciones;
- modo de aprobacion configurable para correcciones;
- fichaje automatico web por planificacion;
- cierre semanal, aprobacion firmada interna, rechazo con nota y reenvio;
- avisos en Inicio;
- exporte CSV interno revisable;
- revision operativa de candidatos de posible exceso, sin payroll.

La beta interna puede validar uso real controlado, pero no permite vender BoxOps como sistema legal definitivo de registro horario, payroll, geofencing, firma electronica avanzada/cualificada, app nativa ni IA.

## Fuentes Revisadas

- `PROJECT_BRIEF.md`
- `TASKS.md`, Fase F y F.4-F.14
- `docs/product/roadmap.md`
- `docs/product/webapp-completion-roadmap.md`
- `docs/operations/beta-operational-readiness-runbook.md`
- `docs/operations/tenant-readiness-checklist.md`
- `docs/operations/daily-operations-beta-readiness-runbook.md`
- `docs/architecture/security-baseline.md`
- `docs/architecture/personal-data-permissions.md`
- `docs/operations/legal-and-privacy-notes.md`
- `docs/product/ux-principles.md`

## Estado De Flujos De Fichaje

| Flujo | Estado para beta interna | Validacion pendiente |
|---|---|---|
| Entrada/salida manual propia | Listo para beta interna controlada en `/app/time`, derivando persona desde sesion + tenant y sin aceptar `person_profile_id`. | Probar con usuarios reales/staging por rol, centro opcional y semana real. |
| Vista semanal propia | Lista como lectura operativa: asignadas, fichadas, balance y avisos por falta, exceso, fichaje abierto o fichaje sin asignacion visible. | Validar contra semana real y confirmar que los avisos coinciden con la operativa esperada. |
| Correcciones propias | Listas con motivo obligatorio, snapshots construidos en servidor y aplicacion directa por defecto mediante RPC trazada. | Probar casos de anadir, corregir y anular punch con datos controlados. |
| Modo de aprobacion configurable | Listo: roles con gestion de fichaje pueden activar aprobacion previa; `owner`, `admin` y `manager` revisan/aplican cuando procede. | Probar cambio de politica en staging y confirmar que roles sin gestion no cambian la configuracion. |
| Fichaje automatico web por planificacion | Listo tecnicamente como generacion idempotente desde bloques/asignaciones activos, con `source = schedule_auto` y snapshot minimo. | Validar con planificacion real. No prueba presencia real y debe seguir corregible. |
| Cierre semanal | Base backend lista con estados `open`, `submitted`, `approved`, `rejected`, `correction_required`, `resubmitted`, `reopened` y `voided`. | Activar/probar primitiva de scheduler DB o procedimiento controlado en staging. |
| Aprobacion firmada | Lista como confirmacion interna: aprobador usa su propia firma activa y se guarda snapshot/version. | Probar con aprobador que tiene firma y con aprobador sin firma para confirmar CTA a `/app/account`. |
| Rechazo con nota | Listo: nota obligatoria, aviso en Inicio y base de correccion/reenvio. | Probar ciclo completo rechazo -> correccion -> reenvio -> aprobacion. |
| Avisos en Inicio | Listos para gestores y usuarios desde `time_weekly_approvals`, sin push ni email. | Smoke por rol con semanas `submitted`, `rejected`, `correction_required`, `resubmitted` y `approved`. |
| CSV interno revisable | Listo como descarga backend para `owner`, `admin` y `manager`, registrado en `time_exports`. | Validar formato, rango, persona opcional y redaccion de limites antes de usar datos reales sensibles. |
| Relacion con horario/asignaciones | Lista como contexto operativo: asignaciones y bloques ayudan a comparar, generar automaticos y avisar diferencias. | Confirmar que cambios de horario posteriores no reescriben snapshots historicos. |
| Jornada prevista | Disponible como contexto separado en `staff_work_windows`; puede aportar comparacion prudente para posibles excesos. | Validar que nadie la interpreta como fichaje, contrato, payroll ni prueba definitiva de presencia. |
| Candidatos de posible exceso | Listos como revision operativa en `/app/time` para `owner`, `admin` y `manager`, con deteccion manual prudente. | Validar que el equipo entiende que no son horas extra aprobadas, saldos, nomina ni payroll. |

## Que Puede Validarse Localmente

La validacion local sirve como preflight. No cierra beta real si faltan datos, credenciales o entorno.

- `git diff --check`.
- `rg -n "STL" src` sin coincidencias.
- `rg -n "service_role" src` sin coincidencias.
- `rg -n "OpenAI|openai|anthropic|embeddings|vector|pgvector|ai_" src` sin nuevas coincidencias.
- `rg -n "navigator\.geolocation|serviceWorker|service worker|PushManager|Notification|background sync|caches\.|CacheStorage" src` sin nuevas coincidencias.
- Smoke anonimo de `/app/time` hacia `/login`.
- Smoke autenticado si existen credenciales locales/QA.
- Revision manual en fixture local de entrada/salida, correccion propia, vista semanal, cierre/aprobacion y exporte.
- Confirmacion documental de que no se abrieron app nativa, geofencing, payroll, documentos firmables, subida documental visible, IA ni cumplimiento legal definitivo.

## Que Requiere Entorno Real O Staging

F.15 no puede cerrar beta interna real solo con local. Requiere:

- S.8/A.1 listo o bloqueos registrados: Supabase real/staging, Auth, Redirect URLs, email y credenciales E2E.
- B.4 listo o bloqueos registrados: tenant, roles, centros, personas, tipos y datos iniciales revisados.
- OD.1/I.32 listo o bloqueos diarios registrados si fichaje se valida como parte de la operativa diaria.
- Usuario `coach` o trabajador con persona vinculada y datos de horario/asignacion reales o controlados.
- Usuarios `owner`, `admin` y `manager` diferenciables para revisar permisos.
- Al menos una firma propia activa para probar aprobacion semanal.
- Caso de aprobador sin firma para probar bloqueo/CTA.
- Semana real o staging con punches manuales, automaticos por planificacion, correcciones y cierre semanal.
- Scheduler DB real o ejecucion controlada de la primitiva de envio semanal, con evidencia.
- Exporte CSV con datos redacted o entorno controlado.
- Revision legal/privacidad antes de presentar retencion, formato, acceso de representantes/Inspeccion o exporte como definitivo.

## Bloqueos Por Datos, Credenciales, Entorno O Legal

El cierre queda `bloqueado` si fichaje entra en la beta y ocurre cualquiera:

- faltan credenciales E2E para `owner`, `admin`, `manager` o `coach`;
- no hay persona vinculada para probar fichaje propio;
- no hay semana real/controlada con horario y asignaciones suficientes;
- no se puede probar una entrada/salida manual propia;
- no se puede probar una correccion con motivo y trazabilidad;
- no se puede diferenciar correccion directa frente a aprobacion previa;
- no se puede probar cierre semanal con aprobacion firmada y rechazo con nota;
- no existe firma propia de aprobador o no se valida el camino sin firma;
- el scheduler DB o procedimiento controlado de envio semanal no esta disponible;
- el CSV no se puede descargar o se presenta como payroll/exporte legal definitivo;
- se pretende usar jornada prevista, automatico por planificacion o candidatos de posible exceso como prueba legal definitiva;
- aparece `navigator.geolocation`, geofencing web, push/service worker/cache privada, app nativa, payroll, documentos firmables, subida documental visible, IA o hardcode de tenant en el diff;
- falta revision legal/privacidad para cualquier promesa de cumplimiento laboral definitivo.

## Roles En Fichaje

| Rol | Puede hacer en beta interna | No debe hacer |
|---|---|---|
| `owner` | Supervisar fichaje del tenant, cambiar politica de aprobacion de correcciones, revisar/aplicar correcciones si procede, aprobar/rechazar semanas con su propia firma, reabrir cuando aplique y exportar CSV interno. | Firmar por otra persona, convertir CSV en payroll, activar geofencing web, acceder por herencia a documentos/payroll o prometer cumplimiento legal definitivo. |
| `admin` | Revisar fichajes y correcciones, cambiar politica de aprobacion si el tenant lo permite, aprobar/rechazar semanas con su propia firma, reabrir segun permisos existentes y exportar CSV interno. | Firmar por otra persona, usar `service_role`, crear payroll o aprobar horas extra legalmente. |
| `manager` | Resolver operativa diaria de fichaje: revisar correcciones si la politica lo exige, cambiar politica de aprobacion si el tenant lo permite, aprobar/rechazar semanas, ver avisos y revisar posibles excesos operativos. | Tocar configuracion global sensible, roles/accesos, payroll, documentos sensibles o permisos por centro implicitos. |
| `coach` | Registrar entrada/salida propia, ver su semana, corregir sus fichajes, ver avisos propios, corregir tras rechazo y reenviar cuando aplique. | Ver cola tenant-wide, aprobar semanas, exportar CSV de otros, revisar candidatos globales de posible exceso o fichar con geolocalizacion web. |
| `payroll_manager` | Futuro consumidor separado si se disena payroll/exporte legal. | No hereda revision operativa de fichaje ni acceso tenant-wide en F.15. |
| `center_manager` | Futuro alcance por centro si existe frontera DB/RLS/UX. | No se activa por filtros UI; no debe revisar fichaje de centro sin task propia. |

## Smoke Minimo Por Rol

Anonimo:

- `/login` carga.
- `/app/time` redirige a `/login`.
- `/app/time/export` no entrega CSV sin sesion ni permiso.

`owner`:

- abre `/app/time` y ve superficie administrativa de fichaje;
- cambia la politica de aprobacion de correcciones si se decide probarlo;
- aprueba una semana `submitted` con su propia firma;
- rechaza una semana con nota obligatoria;
- descarga CSV interno por rango controlado;
- confirma que no hay geolocalizacion, payroll, documentos firmables ni IA.

`admin`:

- revisa fichajes/correcciones;
- aprueba o rechaza una semana si tiene firma propia;
- descarga CSV interno;
- no concede el cambio de politica a roles sin gestion de fichaje.

`manager`:

- ve cola operativa de fichaje y avisos;
- revisa/aplica correccion cuando el tenant exige aprobacion;
- aprueba/rechaza una semana con firma propia;
- revisa candidatos de posible exceso como operativa, no payroll.

`coach`:

- ficha entrada y salida propia;
- navega la semana y ve avisos;
- corrige un punch propio con motivo;
- si su semana fue rechazada, ve aviso, corrige y reenvia cuando aplique;
- no ve exporte tenant-wide, cola de aprobacion de otros ni revision global de candidatos.

## Evidencia Que Debe Guardarse

Guardar fuera del repo si contiene datos reales:

- fecha, entorno y URL;
- version o commit/diff revisado;
- roles E2E disponibles, sin passwords;
- resultado de `git diff --check`;
- resultados de guardrails `rg`;
- captura o nota redacted de entrada/salida manual;
- captura o nota redacted de correccion propia;
- evidencia del modo de aprobacion configurable;
- evidencia de automatico por planificacion y su aviso de que no prueba presencia;
- evidencia de cierre semanal enviado;
- evidencia de aprobacion con firma propia y snapshot/version;
- evidencia de rechazo con nota y reenvio;
- evidencia de avisos en Inicio por rol;
- CSV interno redacted o hash/nombre de prueba, sin datos personales innecesarios;
- evidencia de candidatos de posible exceso como revision operativa;
- deuda UX menor aceptada;
- deuda bloqueante abierta;
- decision final: `bloqueado`, `listo para beta interna` o `pendiente para v1 comercial`.

No guardar passwords, tokens, API keys, cookies, signed URLs, enlaces activos de invitacion/reset, documentos privados, firmas completas innecesarias, ubicacion, IP/fingerprint, datos bancarios, payroll, motivos sensibles ni pantallazos con datos personales no necesarios.

## Deuda UX Menor Que No Bloquea Beta

Puede quedar para v1 si los smokes pasan y el equipo entiende el flujo:

- refinamiento visual de la seccion administrativa de `/app/time`;
- selector manual seguro de bloque/asignacion al crear o corregir si el automatico y avisos cubren la beta;
- filtros mas ricos en exporte CSV;
- centro principal o ultimos centros como ayuda de entrada/salida;
- mensajes de ayuda adicionales sobre automatico por planificacion;
- dashboard historico mensual de fichaje;
- copy mas detallado para usuarios nuevos, siempre que no oculte la accion principal.

## Deuda Que Si Bloquea Beta

Bloquea F.15 si fichaje forma parte de la beta interna:

- fichaje propio no funciona para un usuario con persona vinculada;
- correcciones aceptan `person_profile_id`, JSON libre de snapshots o permiten cambiar fichajes ajenos;
- semanas aprobadas siguen modificandose sin reapertura/correccion auditada;
- aprobador puede usar firma de otra persona;
- rechazo no exige nota o no deja camino claro de correccion/reenvio;
- automatico por planificacion duplica punches o se presenta como prueba de presencia real;
- jornada prevista se muestra o se interpreta como fichaje, contrato, payroll o prueba definitiva;
- candidatos de posible exceso se presentan como horas extra aprobadas, compensacion, saldo o nomina;
- CSV incluye snapshots completos, texto libre sensible, ubicacion, payroll, importes o se llama exporte legal definitivo;
- `coach` ve cola tenant-wide, exporte de otros o revision global de candidatos;
- `owner`/`admin`/`manager` firman por otra persona;
- hay hardcode de tenant, `service_role`, geolocalizacion web, service worker/push/cache privada, app nativa, payroll, documentos firmables, subida documental visible o IA en el diff.

## Que Queda Para V1 Comercial

F.15 puede cerrar beta interna aunque queden para v1 comercial:

- revision legal/laboral de retencion, formato, acceso trabajador, representantes e Inspeccion;
- politica real de retencion de fichajes, correcciones, aprobaciones, exportes y auditoria;
- exporte legal definitivo si se decide vender esa promesa;
- acceso controlado para representantes/Inspeccion si aplica;
- runbook de incidencias: correcciones posteriores, reaperturas, errores de scheduler, exportes y reclamaciones;
- scheduler real observado/alertado para cierre semanal;
- pruebas negativas ampliadas de RLS/permisos en entorno real/staging;
- permisos por centro o `center_manager` con frontera DB/RLS/UX si el negocio lo exige;
- payroll o integracion externa solo como modulo separado con revision legal;
- app nativa/wrapper y geofencing solo si hay razon comercial y revision legal/privacidad;
- documentos firmables con snapshot/evidencia y posible proveedor especializado;
- IA como ultimo extra futuro, sin decisiones automaticas de fichaje, horas extra o payroll.

## Que No Prometer Todavia

- Cumplimiento laboral definitivo.
- Registro horario legal definitivo por tener `/app/time`.
- Geolocalizacion web, `navigator.geolocation`, geofencing o tracking.
- App nativa, background location, push nativo o modo offline.
- Payroll, nominas, importes, compensaciones, saldos o aprobacion legal de horas extra.
- Jornada prevista como fichaje, contrato, payroll o prueba definitiva.
- Fichaje automatico por planificacion como prueba de presencia real.
- Aprobacion semanal firmada como firma electronica avanzada/cualificada.
- Candidatos de posible exceso como horas extra aprobadas.
- CSV interno como exporte legal definitivo.
- Documentos firmables o subida documental visible.
- IA funcional, embeddings, RAG, vector DB, prompts runtime, SDKs, jobs o decisiones automaticas.
- Produccion lista si faltan S.8, B.4, OD.1, hardening, backups, observabilidad o revision legal/privacidad.

## Resultado Esperado De F.15

F.15 queda cerrado cuando:

- este runbook esta referenciado desde `TASKS.md`, `PROJECT_BRIEF.md`, `docs/product/roadmap.md` y `docs/product/webapp-completion-roadmap.md`;
- esta claro que la fase es cierre de fichaje web para beta interna, no producto nuevo;
- se distingue lo local de lo real/staging;
- se listan bloqueos por datos, credenciales, entorno y legal;
- owner/admin/manager/coach tienen criterios de smoke;
- deuda UX menor y bloqueante quedan separadas;
- beta interna queda diferenciada de v1 comercial;
- geofencing/app nativa/payroll/documentos firmables/IA quedan fuera;
- el diff confirma que no se abrieron nuevas superficies ni promesas de cumplimiento legal definitivo.
