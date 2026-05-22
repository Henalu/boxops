# Security Baseline - BoxOps

Estado 2026-05-18: este documento convierte seguridad, privacidad y tenant safety en un carril transversal del roadmap. No sustituye una auditoria profesional, pero si define el nivel minimo que BoxOps debe mantener antes de usar datos reales sensibles o pasar a produccion.

## Referencias

- OWASP ASVS 5.0.0 como checklist de verificacion para aplicacion web SaaS.
- OWASP Top 10 2025 como mapa de riesgos: control de acceso roto, mala configuracion, supply chain, criptografia, inyeccion, diseno inseguro, autenticacion, integridad, logging/alerting y manejo de excepciones.
- Supabase Auth, Postgres RLS y Storage privado como controles tecnicos de la arquitectura actual.
- `docs/architecture/asvs-level-1-beta-matrix.md` como matriz trazable local/documental ASVS Level 1 / beta interna por areas practicas de BoxOps.
- `docs/architecture/tenant-rls-negative-test-matrix.md` como inventario unico documental de pruebas negativas tenant/RLS/permisos por superficie critica, sin implementar tests ni desbloquear staging.
- `docs/architecture/tenant-rls-negative-test-implementation-plan.md` como plan tecnico priorizado para convertir ese inventario en tests negativos locales y separar lo que queda staging-only.

Objetivo inicial: usar ASVS Level 1 como baseline de MVP/public beta y elevar controles en modulos con documentos privados, nominas, firmas, fichaje, geolocalizacion o datos laborales sensibles.

## Postura Actual

BoxOps ya incorpora varias decisiones correctas:

- `organization_id` es frontera obligatoria de tenant en datos operativos y personales tenant-scoped.
- `organization_memberships` es la fuente de rol y pertenencia.
- Las rutas bajo `/app` usan sesion y organizacion activa; las mutaciones deben revalidar usuario, tenant y rol.
- Supabase RLS actua como segundo candado y no debe sustituirse por controles solo de UI.
- Fase C evita enumeracion de emails en reset de contrasena y delega rate limits minimos en Supabase Auth.
- Roles altos operativos no heredan acceso automatico a salario, nominas, contrato, documentos privados, fichaje, geolocalizacion ni evidencias de firma.
- Avatar y firma propia se modelan como assets privados tenant-scoped, con buckets privados y signed URLs cortas.
- E.11 abre un repositorio documental visible minimo con grants/capacidades reales, bucket privado `document-files`, preview/descarga por rutas backend E.5, auditoria y signed URLs cortas; siguen fuera subida visible, grants UI, documentos firmables, evidencias de firma y documentos sensibles/payroll.

Lo que faltaba era expresarlo como calidad transversal del roadmap, no solo como decisiones repartidas por fases.

## Gates Por Cada Feature

Antes de cerrar cualquier feature nueva que lea o escriba datos de tenant:

1. Clasificar datos: publico operativo, personal visible, privado, sensible laboral, documento, firma, fichaje, ubicacion o auditoria.
2. Definir actores y capacidades antes de UI: `owner`, `admin`, `manager`, `coach`, roles especializados y grants concretos.
3. Mantener doble control: Server Action/API valida sesion, tenant y permiso; RLS valida otra vez en base de datos.
4. Verificar IDs recibidos del cliente: todo `center_id`, `person_profile_id`, `coach_profile_id`, `document_id`, `asset_id` o equivalente debe pertenecer a la organizacion activa.
5. En acciones propias, derivar la persona desde `auth.uid()` + `organization_id` siempre que sea posible, no desde un ID enviado por formulario.
6. Validar entradas en servidor: longitud, formato, enum, UUID, rangos, fechas, horas, MIME, tamano de archivo y extensiones permitidas.
7. Evitar URLs publicas persistentes para datos personales, firmas o documentos. Usar rutas internas, buckets privados y signed URLs cortas.
8. No exponer `service_role`, secretos, tokens o claves privadas en cliente, logs, seeds ni fixtures.
9. Anadir pruebas negativas cuando haya riesgo: acceso de otro tenant, rol sin permiso, documento/grant inexistente, asset ajeno, firma ajena y rutas directas.
10. Documentar auditoria necesaria si hay lectura/descarga de datos sensibles, cambio de grants, firma aplicada, fichaje, geolocalizacion, exportacion o borrado.

## Gates Antes De Produccion O Datos Sensibles

Antes de produccion, QA con datos reales sensibles o beta externa:

- revisar MVP contra OWASP ASVS 5.0 Level 1 y registrar desviaciones aceptadas;
- revisar OWASP Top 10 2025 y confirmar mitigaciones por categoria;
- ejecutar lint, typecheck, build, smoke tests y tests negativos de autorizacion/RLS;
- revisar dependencias, lockfile y vulnerabilidades conocidas;
- revisar variables de entorno, secretos, service role y Redirect URLs de Supabase Auth;
- revisar headers de seguridad, CSP cuando sea viable, HTTPS y cookies;
- comprobar que no hay buckets publicos para datos personales, firmas o documentos privados;
- comprobar que no hay nombres STL hardcodeados en `src`;
- preparar procedimiento minimo de incidente: revocar grants/sesiones, rotar secretos, revisar logs y comunicar alcance.

Antes de beta interna controlada, S.8/A.1 debe ejecutarse como gate operativo en `docs/operations/beta-operational-readiness-runbook.md`. Ese gate exige, como minimo, validacion oficial de datos reales del primer tenant, entorno real/staging con Supabase Auth Site URL/Redirect URLs/password policy verificados, Resend/SMTP/remitente permitido, email interno controlado, credenciales E2E por rol, invitacion/aceptacion/reset reales, job o fallback temporal de purga de auditoria y evidencia minima. Si falta alguno de esos elementos, el estado correcto es `bloqueado`, no beta.

B.4 anade el gate de tenant readiness en `docs/operations/tenant-readiness-checklist.md`. Antes de activar un tenant, confirmar configuracion minima de organizacion, centros, roles, tipos, invitaciones/Auth, datos iniciales y ausencia de hardcode de tenant en `src`. `center_manager` no debe activarse hasta tener frontera por centro en schema, RLS, helpers, Server Actions, UX y pruebas negativas; un filtro de UI por centro no es suficiente como control de seguridad.

OD.1/I.32 anade el gate documental de operativa diaria en `docs/operations/daily-operations-beta-readiness-runbook.md`. Antes de llamar beta interna a un tenant, confirmar por rol que Horario, Plantillas, Asignaciones, Cobertura, Solicitudes, Ausencias, Eventos, Jornada prevista e Inicio funcionan como flujos operativos y que sus evidencias no contienen datos sensibles innecesarios. Cobertura, ausencias, eventos y jornada prevista son contexto operativo: no deben mutar horario, aprobar cobertura, aprobar horas extra, generar payroll ni tomar decisiones por IA automaticamente.

F.15 anade el gate documental especifico de fichaje web en `docs/operations/time-tracking-beta-readiness-runbook.md`. Si fichaje entra en beta interna, confirmar por rol entrada/salida manual, vista semanal, correcciones, politica de aprobacion, automatico por planificacion, cierre semanal, aprobacion firmada interna, rechazo con nota, avisos en Inicio, CSV interno revisable y candidatos de posible exceso. El gate bloquea cualquier lectura de ubicacion web, payroll, exporte legal definitivo, firma electronica avanzada/cualificada, horas extra aprobadas o promesa de cumplimiento laboral definitivo sin revision legal/privacidad.

E.11 anade el gate documental del primer repositorio visible minimo en `docs/operations/document-repository-beta-readiness-runbook.md`, E.12 lo convierte en validacion QA/staging controlada, E.13 cierra evidencia/bloqueos sin inventar resultados, E.14 reintenta la validacion real con archivo Storage controlado solo si hay acceso real disponible, E.15 actualiza el desbloqueo controlado con relectura de entorno redacted y E.16 deja el handoff operativo para operador con acceso real. Antes de usar documentos reales, confirmar por rol que `/app/documents` lista solo versiones autorizadas por `can_access_document`/grants reales, que preview/descarga pasan por rutas backend E.5, que el cliente no recibe signed URLs directas, que `sensitive_hr`, `payroll`, `signature_evidence` y `requires_signature` quedan fuera del repositorio, que la evidencia esta redacted o el bloqueo de staging queda documentado, y que no se abre subida, UI de grants, auditoria visible, documentos firmables, nominas/payroll, IA ni cumplimiento legal documental definitivo.

## Revision ASVS Level 1 / Beta Interna 2026-05-18

Resultado: hardening local/documental parcial, no certificacion ASVS completa y no desbloqueo de beta interna. La revision se limita a codigo y documentacion disponibles; no repite S.8/A.1, B.4 ni OD.1/I.32 porque no hay acceso nuevo a QA/staging, project/ref, DB URL, credenciales por rol, tenant controlado, SMTP real ni evidencia externa.

La matriz trazable de esta revision vive en `docs/architecture/asvs-level-1-beta-matrix.md` y usa estados `cumple-local`, `parcial`, `bloqueado-por-entorno`, `no-aplica-beta` y `futuro` para separar evidencia local de bloqueos reales. La matriz de pruebas negativas derivada vive en `docs/architecture/tenant-rls-negative-test-matrix.md` y usa estados propios de planificacion documental; su plan tecnico de implementacion vive en `docs/architecture/tenant-rls-negative-test-implementation-plan.md`. Sigue sin ser auditoria profesional, certificacion ASVS, pentest ni cumplimiento legal definitivo.

Controles observados desde codigo/documentacion:

- Tenant boundary: `getAuthenticatedUser`, `getActiveMemberships` y `resolveActiveOrganization` resuelven sesion, membership activa y organizacion; las superficies revisadas filtran por `organization_id` y las migraciones recientes usan FKs compuestas tenant-safe.
- Roles: `owner`, `admin`, `manager` y `coach` estan separados en helpers; `center_manager`, `staff`, `document_admin` y `payroll_manager` existen como roles futuros o especializados, pero no deben activarse en beta sin pruebas negativas especificas.
- RLS/RPC: las migraciones revisadas mantienen `ENABLE ROW LEVEL SECURITY`, `SECURITY DEFINER` con `SET search_path = public`, grants acotados y snippets rollback para varias superficies criticas. La cobertura ASVS sigue incompleta porque no hay suite negativa unificada para todo el MVP.
- Secretos/env: `src` usa cliente Supabase SSR con anon key publica; no se observa `service_role` en helpers normales. `.env.example` conserva placeholders; los secretos reales y la configuracion Auth/SMTP del entorno real siguen sin verificarse.
- Storage privado: avatar propio, firma propia y documentos usan buckets privados y signed URLs cortas. `/app/documents` lista metadata autorizada y preview/descarga pasan por backend; no hay subida documental visible ni documentos firmables.
- Fichaje/ubicacion: la webapp no debe pedir `navigator.geolocation`; G.3/G.4 existe solo como foundation interna de ubicacion asistida minimizada. Para beta sin geolocalizacion, no activar settings de ubicacion ni registrar eventos reales.
- IA/PWA: no abrir IA funcional, embeddings, vector search, service worker, push, Background Sync ni CacheStorage para datos privados antes de gates propios.

Desviaciones/deuda ASVS Level 1 aceptadas para beta interna bloqueada:

- ASVS L1 ya tiene matriz practica por areas BoxOps en `docs/architecture/asvs-level-1-beta-matrix.md`, pero no es un mapeo exhaustivo por ID ASVS ni sustituye validacion real/staging, pruebas negativas ni aceptacion formal de desviaciones.
- Headers de seguridad incompletos: `next.config.ts` y el proxy protegido cubren `Cache-Control: no-store`/`Pragma` en `/app`, pero no hay CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` ni politica de frame ancestors decididas para despliegue real.
- Auth real no verificable: Site URL, Redirect URLs, password policy, Custom SMTP, dominio/remitente, cookies reales y HTTPS dependen de Supabase/Vercel/entorno y siguen bloqueados por falta de acceso.
- Dependencias y supply chain: existe `package-lock.json`, pero falta revision recurrente documentada de lockfile/vulnerabilidades antes de deploys relevantes y no hay gate CI consolidado de auditoria de dependencias.
- Backups, PITR/restore, observabilidad, alertas de jobs, logs de errores y procedimiento de incidente solo estan definidos como necesidad; no hay evidencia real de entorno.
- Pruebas negativas: existen snippets/smokes por modulo, ya hay inventario unico en `docs/architecture/tenant-rls-negative-test-matrix.md` y plan tecnico priorizado en `docs/architecture/tenant-rls-negative-test-implementation-plan.md`, pero falta convertirlo en suite ejecutable por ruta, RPC y rol, incluyendo roles futuros si se asignan en un tenant real.
- Documentos reales: la validacion QA/staging de `/app/documents`, preview/descarga E.5, auditoria documental y bucket `document-files` con archivo controlado sigue bloqueada por acceso/entorno.
- Geolocalizacion: aunque no hay lectura web visible, la foundation interna de ubicacion asistida debe tratarse como inactiva para beta sin geolocalizacion; cualquier activacion requiere task propia, privacy/legal, evidencia minimizada y pruebas negativas.

Decision: esta revision permite registrar desviaciones locales y orientar el siguiente hardening, pero beta interna sigue `bloqueada` mientras S.8/A.1, B.4, OD.1/I.32 y, si aplica, F.15 no puedan ejecutarse con acceso real/staging y evidencia redacted.

## Modulos Sensibles

### Auditoria Operativa

S.1 implementa `operational_audit_events` como auditoria corta de aplicacion para accesos/equipo, horario, asignaciones y plantillas. La escritura pasa por `record_operational_audit_event(...)`, que deriva actor desde `auth.uid()`, resuelve membership/persona cuando existe, valida entidad dentro del tenant y calcula `retain_until`.

Reglas de seguridad aplicadas:

- no usar `service_role` en `src` para registrar auditoria;
- no aceptar actor, membership, persona ni `retain_until` desde UI/actions;
- no guardar payloads completos, emails, tokens, secretos, signed URLs, documentos, IP/fingerprint, ubicacion cruda ni RRHH/payroll sensible;
- tratar notas y nombres libres como campo tocado, no como contenido;
- lectura solo para `owner`/`admin` en S.1; `manager` queda fuera porque la tabla mezcla accesos/equipo con logs operativos;
- cambios directos en Supabase Studio/Auth no quedan cubiertos por esta auditoria de aplicacion.

S.1.1 anade dos controles de cierre:

- `purge_expired_operational_audit_events(batch_size)` borra solo eventos con `retain_until < now()`, en lotes acotados entre 1 y 5000 filas. La funcion queda sin grant para `authenticated`/`anon` y no se llama desde `src`.
- `supabase/snippets/operational-audit-rls-verification.sql` ejecuta una verificacion local con rollback para roles, tenant safety, rechazo de actor forzado, rechazo de entidad ajena y bloqueo de `changed_fields` inseguros.

Antes de produccion falta programar el job real de purga. Opcion recomendada: `pg_cron`/scheduler de base de datos invocando periodicamente `select public.purge_expired_operational_audit_events(1000);` con usuario propietario de base de datos y alerta si devuelve error. S.4 deja `supabase/snippets/activate-operational-audit-purge-job.sql` como SQL idempotente para operador DB. S.5 verifica de nuevo la funcion local y sus permisos, pero la ejecucion real sigue bloqueada hasta tener acceso al scheduler/DB del entorno real. Si no se activa cron en el corte de despliegue, debe quedar como runbook operativo temporal, no como boton de UI ni action normal de app.

I.25 anade una lectura filtrada de auditoria para trazabilidad de cobertura: `list_coverage_trace_audit_events(...)` solo devuelve eventos vigentes de `schedule_blocks`, `schedule_block_assignments` y `schedule_template_blocks`, filtrados por `organization_id` y por bloque cuando se solicita. Es read-only, no sustituye `list_operational_audit_events`, no abre logs de accesos/equipo a `manager` y no concede acceso a `coach` ni `payroll_manager`.

### Jornada Prevista Del Personal

El corte 2026-05-15 implementa `staff_work_windows` como planificacion de presencia prevista del personal dentro de `/app/schedule`. Es contexto operativo, no bloque, no asignacion real, no fichaje y no dato payroll.

Reglas de seguridad aplicadas:

- `organization_id` es obligatorio y todas las lecturas/mutaciones filtran por la organizacion activa;
- las FKs a `person_profiles` y `centers` son tenant-safe para evitar referencias cruzadas entre organizaciones;
- todos los miembros activos del tenant pueden ver franjas activas como contexto compartido del dia mediante RLS;
- `owner`, `admin` y `manager` pueden crear, editar, desactivar y ver tambien franjas inactivas del tenant;
- `staff`, `center_manager`, `document_admin` y `payroll_manager` no reciben permisos de gestion;
- las Server Actions revalidan sesion, membership activa, tenant, rol, IDs recibidos, fechas, horas y notas antes de escribir;
- RLS actua como segundo candado y no hay policy de borrado normal; la UI desactiva con `status = inactive`;
- no se usa `service_role` en `src` ni se escriben ocurrencias semanales persistidas;
- la auditoria operativa registra solo campos tocados para creacion, actualizacion y desactivacion, sin guardar contenido completo de notas;
- las notas se validan como texto corto no sensible y no deben contener salario, contrato, payroll, documentos, salud, ubicacion, URLs, tokens, IP/fingerprint ni datos bancarios.

### Cambios Y Cobertura

I.1 documenta el modelo candidato e I.2 implementa la primera base tecnica en `supabase/migrations/00027_change_requests_foundation.sql`: `change_requests`, `change_request_targets` y `change_request_events` como workflow tenant-scoped de solicitudes de cambio/cobertura entre coaches. No hay UI visible ni aplicacion final al horario real.

Reglas de seguridad aplicadas en I.2:

- `organization_id` obligatorio en las tres tablas desde la primera migracion;
- FKs compuestas validan tenant para `schedule_blocks`, `schedule_block_assignments`, `coach_profiles`, `person_profiles` y `organization_memberships` cuando aplica;
- escritura directa normal bloqueada para `authenticated` por RLS/policies del workflow; las mutaciones pasan mediante RPCs acotadas;
- `create_own_change_request(...)` deriva membership/persona/coach desde `auth.uid()` + tenant y exige una asignacion `assigned` propia sobre bloque accionable;
- `offer_change_request_to_coach(...)` valida permiso de gestion o solicitante, target activo/asignable del tenant y solape actual antes de registrar oferta;
- `respond_to_change_request_target(...)` solo permite responder como coach target, revalida bloque accionable y vuelve a comprobar solapes con el guardrail Postgres antes de aceptar;
- `accepted_by_coach`/`pending_approval` no cuentan como cobertura real: I.2 no toca `schedule_block_assignments`;
- `change_request_events` deriva actor desde sesion/membership/persona/coach y guarda `changed_fields` minimizados, sin payloads completos, notas extensas, documentos, payroll, ubicacion, IP/fingerprint, tokens ni signed URLs;
- `record_change_request_event(...)` solo permite registrar `application_failed` con resultado `failed` o `denied`, no transiciones de exito arbitrarias;
- `owner`, `admin` y `manager` pueden leer/gestionar el workflow tenant-wide; `center_manager` queda futuro hasta tener frontera por centro; `payroll_manager`, `document_admin`, `staff` y `coach` no reciben gestion por herencia.

I.3 implementa `supabase/migrations/00028_change_request_operations.sql` como primitiva segura de decision y aplicacion al horario real:

- `approve_change_request(...)`, `reject_change_request(...)` y `apply_approved_change_request(...)` quedan reservadas a `owner`, `admin` y `manager`;
- `cancel_change_request(...)` permite cancelacion por gestion o por el coach solicitante antes de aplicar; una solicitud `approved` solo la cancela gestion;
- `expire_change_request(...)` puede cerrar solicitudes objetivamente vencidas o ya no accionables para miembros involucrados/gestion;
- la aplicacion revalida tenant, permiso, solicitud `approved`, bloque activo/no cancelado/no completado, asignacion origen `assigned`, target aceptado/vigente, coach receptor activo/asignable y solapes actuales justo antes de tocar `schedule_block_assignments`;
- la asignacion destino se crea o reactiva con `source = 'change_request'` y la origen pasa a `removed`; el estado `applied` se escribe solo despues de terminar esas mutaciones;
- `coach-unavailable` se comprueba antes de aplicar y sigue protegido por el trigger Postgres anti-solape;
- aprobacion, rechazo, cancelacion, expiracion, aplicacion y fallo quedan en `change_request_events` con `changed_fields` minimizados;
- la aplicacion registra tambien `operational_audit_events` minimizados sobre las asignaciones afectadas, sin payload completo de la solicitud;
- los cierres operativos pueden completarse aunque requester/target hayan dejado de estar activos, pero la aplicacion real no relaja target asignable ni disponibilidad.

I.4 anade `supabase/snippets/change-requests-rls-verification.sql` como verificacion local reejecutable con transaccion y rollback. Cubre paths positivos y negativos de I.2/I.3: gestion por `owner`/`admin`/`manager`, solicitud/cancelacion propia del coach solicitante, respuesta solo del coach target, denegacion de otro tenant, rol sin permiso y coach no candidato, bloqueo por bloque cancelado/completado, solicitud o target expirado, doble aceptacion controlada, aplicacion sin aprobacion, solape `coach-unavailable`, trigger anti-solape de `schedule_block_assignments` y escrituras directas sobre `change_requests`, `change_request_targets` y `change_request_events` sin efecto para `authenticated`.

Decision I.4: si una operacion directa de `UPDATE`/`DELETE` queda en 0 filas afectadas por RLS, se considera bloqueada solo si el snippet confirma que el dato no cambia. La verificacion no encontro bug que requiera migracion `00029`.

I.5 anade la primera capa app/server interna en `src/lib/change-requests.ts`:

- usa Supabase SSR con sesion normal y no introduce `service_role` en `src`;
- resuelve usuario, memberships y organizacion activa con los helpers existentes antes de consultar o mutar;
- no acepta `person_profile_id` propio en funciones propias; la persona se deriva desde sesion/tenant y las RPCs vuelven a validarla;
- lista solicitudes visibles filtrando por `organization_id` activa y dejando que RLS limite gestion tenant-wide o miembros involucrados;
- valida UUIDs, estados, tipos, timestamps y resumenes cortos antes de llamar a RPCs;
- delega las mutaciones en `create_own_change_request`, `offer_change_request_to_coach`, `respond_to_change_request_target`, `approve_change_request`, `reject_change_request`, `cancel_change_request`, `expire_change_request` y `apply_approved_change_request`;
- mapea fallos esperados de DB/RPC como `coach-unavailable`, `not-approved`, `expired`, `not-actionable` y `permission-denied`;
- trata `apply_approved_change_request(...)` como exito solo si devuelve `status = 'applied'`; si la DB registra `application_failed`, el helper lee el ultimo evento minimizado para devolver error semantico sin exponer payloads.

I.6 abre la primera superficie visible minima en `/app/requests`:

- la ruta esta protegida bajo `/app`, resuelve sesion, memberships y organizacion activa en Server Component y usa `listVisibleChangeRequests(...)` para listar lo que RLS permite ver;
- la entrada queda en `/app/more` y navegacion secundaria desktop, no como nuevo item principal mobile, para mantener el primer corte acotado;
- los datos enriquecidos se limitan a bloque, centro, tipo de actividad, coach solicitante, targets y ultimo evento visible; no se muestran ni guardan payloads completos;
- las mutaciones pasan por Server Actions en `src/app/(app)/app/requests/actions.ts`, que revalidan `organizationId`, sesion, membership activa, rol y perfil de coach propio antes de llamar a `src/lib/change-requests.ts`;
- aceptar/rechazar target exige que `change_request_targets.target_coach_profile_id` pertenezca al usuario autenticado y este `offered`;
- cancelar desde UI exige que la solicitud pertenezca al coach solicitante y no este cerrada ni aprobada;
- aprobar, rechazar, expirar y aplicar desde UI exigen `canManageChangeRequests(...)`, por ahora solo `owner`, `admin` y `manager`;
- `organizationId` solo selecciona una membership activa resuelta en servidor y no se acepta `person_profile_id` propio desde cliente;
- I.6 no crea solicitudes ni ofertas desde UI para evitar un flujo parcial no transaccional de creacion + oferta; tampoco introduce `swap`, ausencias, payroll, horas extra aprobadas, push, service worker, ubicacion ni datos STL.

I.7 abre la creacion minima segura en `/app/requests` y anade `supabase/migrations/00029_change_request_atomic_creation.sql`:

- `create_own_change_request_with_targets(...)` crea solicitud propia y targets iniciales en una sola transaccion, reutilizando las validaciones de `create_own_change_request(...)` y `offer_change_request_to_coach(...)`;
- `create_managed_change_request_with_targets(...)` permite a `owner`, `admin` y `manager` crear/ofrecer cobertura sobre una asignacion `assigned` del tenant activo, derivando requester coach/person/membership desde la asignacion origen, no desde cliente;
- ambas RPCs exigen 1 a 10 targets, sin duplicados, y revierten todo si algun target no es asignable, no pertenece al tenant, es el requester o tiene solape;
- `src/lib/change-requests.ts` expone `listChangeRequestCreationOptions(...)` y `createChangeRequestWithTargets(...)` con Supabase SSR normal, sin `service_role`;
- `createChangeRequestFromForm(...)` revalida sesion, membership activa, rol, asignacion, bloque, ownership/permiso de gestion y targets antes de delegar en el helper;
- la UI no acepta `person_profile_id` ni `requester_coach_profile_id`; `schedule_block_id` se deriva server-side desde la asignacion seleccionada;
- los enlaces desde `/app/schedule` y `/app/coverage` solo preseleccionan bloque/asignacion; no saltan las validaciones de `/app/requests`;
- el copy confirma que es una solicitud operativa de cobertura/cambio, sin ausencias, payroll, horas extra aprobadas ni cumplimiento legal definitivo.

I.8 endurece la superficie visible sin tocar DB/RPC/RLS:

- `listChangeRequestCreationOptions(...)` sigue siendo server-side y ahora devuelve restricciones por asignacion para que la UI desactive targets que son el coach origen, ya cubren el mismo bloque o solapan con otro bloque activo;
- esas restricciones son ayuda previa al envio, no fuente de verdad: `createChangeRequestFromForm(...)`, `createChangeRequestWithTargets(...)` y las RPCs atomicas siguen revalidando tenant, membership, asignacion `assigned`, bloque accionable, target asignable, self-target y solapes;
- `expireChangeRequestFromForm(...)` deja de ser una accion exclusivamente de gestion y se acota a solicitudes visibles por RLS con motivo objetivo de cierre: solicitud vencida, bloque cancelado/completado, target aceptado vencido o solicitud ofrecida sin targets activos;
- aprobar, rechazar y aplicar siguen reservadas a `owner`, `admin` y `manager`; aceptar/rechazar target propio y cancelar solicitud propia conservan sus validaciones previas;
- no se introduce `service_role`, endpoint publico, scheduler, background job, push, service worker, background sync, ubicacion, payloads completos ni reglas hardcodeadas de tenant.

I.25 cierra trazabilidad operativa prudente de cobertura sin convertirla en automatismo:

- `src/lib/coverage-traceability.ts` exige sesion, membership activa, tenant y `canManageOperationalData(...)` antes de leer trazas;
- combina solo datos minimizados de `change_requests`, `change_request_events`, impacto de ausencias calculado al vuelo y la RPC filtrada de auditoria operativa;
- no lee ni muestra `reason_summary`, motivos sensibles ni payloads completos;
- `/app/schedule` y `/app/coverage` muestran la seccion solo a `owner`, `admin` y `manager`;
- no persiste `absence_schedule_impacts`, no modifica `schedule_blocks`, `schedule_block_assignments`, fichajes, ausencias ni solicitudes, y no resuelve cobertura automaticamente.

Deuda restante antes de piloto de cambios/cobertura:

- decidir si hace falta expiracion automatica controlada sin abrir push, service worker, background sync, ubicacion, ausencias ni payroll;
- implementar `swap` solo cuando exista modelo seguro de segundo bloque/asignacion.

### Ausencias, Vacaciones Y Permisos

I.9 documenta el primer modelo seguro de ausencias/vacaciones/permisos sin crear schema, migraciones, UI ni datos reales. I.10 convierte ese modelo en una foundation interna en `supabase/migrations/00035_absence_requests_foundation.sql` e I.11 anade una capa interna server-side en `src/lib/absence-requests.ts`, manteniendo la decision principal de seguridad: separar ausencia/no disponibilidad de solicitud de cobertura. Una ausencia puede afectar a la cobertura de bloques asignados, pero no es una oferta a otro coach ni una aprobacion de horas, payroll o cumplimiento legal definitivo.

Reglas de seguridad aplicadas en I.10:

- `organization_id` obligatorio en `absence_requests`, `absence_request_periods` y `absence_request_events`; si una fase futura persiste `absence_schedule_impacts`, tambien debera tener `organization_id` obligatorio desde su primera migracion;
- acciones propias derivadas desde `auth.uid()` + `organization_id`, sin aceptar `person_profile_id` propio desde cliente;
- `owner`, `admin` y `manager` pueden revisar operativamente ausencias del tenant solo con datos minimizados; no heredan acceso a salud, documentos, payroll, salario ni bajas medicas documentadas;
- `coach` lee y solicita lo propio; si recibe una solicitud de cobertura separada solo ve el minimo operativo del bloque, no el motivo sensible de la ausencia;
- `center_manager`, `document_admin`, `payroll_manager` y `staff` quedan sin permisos por herencia hasta tener capacidades/RLS propias;
- periodos de ausencia se comparan contra `schedule_blocks` y `schedule_block_assignments` para detectar impacto, pero no mutan automaticamente esas tablas;
- una ausencia aprobada que solapa una asignacion `assigned` puede hacer que esa asignacion no cuente para cobertura futura y generar `absence_conflict`, `uncovered` o `insufficient`, siempre como calculo/trazabilidad separada;
- resolver cobertura requiere accion separada: ajuste de asignacion o `change_requests`; la ausencia no crea targets/ofertas a otros coaches por si sola;
- auditoria propia en `absence_request_events`, con actor derivado, resultado, estado y campos tocados minimizados;
- retencion candidata: solicitudes cerradas/aprobadas 24 meses como historico operativo y eventos visibles 180 dias; la retencion final queda pendiente de revision legal/privacidad antes de produccion.

Decision I.10: no se crea la tabla `absence_schedule_impacts`. El impacto se calcula al vuelo con `list_absence_schedule_impacts(...)` porque el primer corte solo necesita cruzar periodos tenant-scoped con `schedule_blocks` y `schedule_block_assignments.assigned`. Persistir impactos se reserva para una fase futura si hace falta workflow, rendimiento o auditoria de resolucion. La verificacion `supabase/snippets/absence-requests-rls-verification.sql` cubre tenant safety, rol sin permiso, persona ajena, periodo invalido, impacto cruzado y escrituras directas bloqueadas.

Reglas app/server aplicadas en I.11:

- todos los helpers internos exigen `organizationId` explicito y resuelven usuario, membership activa y organizacion con el cliente SSR normal;
- self-service app se alinea con DB para `owner`, `admin`, `manager` y `coach`; revision operativa queda en `owner`, `admin` y `manager`;
- `createOwnAbsenceRequest(...)` y `cancelOwnAbsenceRequest(...)` no aceptan `person_profile_id`; la persona se deriva desde sesion/tenant y la RPC vuelve a validarlo;
- no hay `service_role` en `src` ni escrituras directas a tablas de ausencia desde helpers;
- eventos de ausencia solo se releen desde app; el registro sigue encapsulado dentro de las RPCs I.10;
- impactos se consumen solo por `list_absence_schedule_impacts(...)`; no se persisten ni se usan para modificar `schedule_blocks` o `schedule_block_assignments`.

I.12 abre `/app/absences` como primera bandeja visible protegida:

- la ruta resuelve sesion, membership activa y organizacion en Server Component bajo `/app`;
- la lectura propia usa `listOwnAbsenceRequests(...)` y la cola operativa usa `listAbsenceReviewQueue(...)`; la UI no consulta ni muta tablas de ausencia directamente;
- las acciones pasan por Server Actions que revalidan `organization_id`, tenant activo y rol antes de llamar a `cancelOwnAbsenceRequest(...)`, `reviewAbsenceRequest(...)` o `expireAbsenceRequest(...)`;
- cancelar se limita a solicitudes propias `requested`/`pending_review`; aprobar/rechazar se limita a `owner`, `admin` y `manager`; expirar se muestra solo cuando hay vencimiento objetivo y la RPC sigue siendo la fuente de verdad;
- el impacto visible se calcula con `listAbsenceScheduleImpacts(...)`, no se persiste y no modifica `schedule_blocks` ni `schedule_block_assignments`;
- la entrada queda secundaria en `/app/more` y sidebar personal, sin navegacion principal mobile nueva;
- no se abre calendario, saldos legales, payroll, bajas medicas documentadas, documentos, push, ubicacion, app nativa ni cobertura automatica.

I.13 anade creacion minima propia en `/app/absences`:

- la mutacion visible usa exclusivamente `createOwnAbsenceRequest(...)` de `src/lib/absence-requests.ts`, que delega en `create_own_absence_request(...)`;
- la Server Action revalida sesion, membership activa, tenant, self-service permitido, `organization_id`, tipo, periodo y resumen antes de llamar al helper;
- no acepta `person_profile_id` ni `coach_profile_id` desde cliente; la identidad propia se deriva en helper/RPC desde sesion + tenant;
- la zona horaria usada sale de la organizacion activa resuelta en servidor, no de una autoridad cliente;
- los tipos visibles se limitan a `vacation`, `day_off`, `partial_day`, `permission`, `personal_absence` y `unavailable`;
- el resumen operativo queda en 160 caracteres; I.14 anade rechazo server-side de senales sensibles basicas como salud, diagnosticos, documentos, justificantes, familia, sanciones, salario/payroll, ubicacion, URLs, tokens e IP/fingerprint antes de llamar al helper;
- despues de crear se vuelve a la bandeja mostrando el estado devuelto por RPC, normalmente `pending_review`;
- no persiste `absence_schedule_impacts`, no modifica `schedule_blocks` ni `schedule_block_assignments`, no crea cobertura y no introduce estado `applied`.

I.14 endurece la superficie visible sin cambiar DB/RLS/RPC:

- antes de aplicar mejoras se confirma que I.13 existe en codigo y que la creacion usa `createOwnAbsenceRequest(...)`;
- los filtros GET (`view`, `absence_type`, `absence_status`) se validan en servidor y no conceden visibilidad fuera de RLS ni fuera de roles; `review` queda solo para `owner`, `admin` y `manager`;
- los estados no accionables se explican en la tarjeta para evitar intentos de cancelar, aprobar, rechazar o expirar solicitudes cerradas, no vencidas o sin permiso;
- los botones usan estado pendiente y confirmacion prudente, pero la autorizacion real sigue en Server Action + helper + RPC;
- el formulario exige confirmacion visible de minimizacion y muestra errores junto al formulario; la Server Action revalida tipo, periodo, duracion, resumen, senales sensibles basicas, tenant y zona horaria de la organizacion activa;
- no se anaden escrituras directas, `service_role`, `schedule_blocks`, `schedule_block_assignments`, `absence_schedule_impacts`, calendario, saldos, payroll, push, geolocalizacion ni app nativa.

I.15 anade regresion tecnica sin cambiar controles:

- `tests/smoke/absences-regression.spec.ts` verifica que la creacion propia sigue atravesando `createOwnAbsenceRequest(...)` y la RPC `create_own_absence_request(...)`;
- el smoke protege que no se acepten `person_profile_id` ni `coach_profile_id` propios desde cliente, que no haya escrituras directas a tablas de ausencia desde `src` y que no se introduzca `service_role`;
- los smokes autenticados opcionales cubren que `coach` no ve cola de revision por query string y que `owner`/`admin`/`manager` si ven superficie de revision con filtros cuando existen credenciales E2E;
- no cambia permisos, visibilidad, campos, copy legal, schema, RLS ni RPC.

I.16 integra impacto de ausencias en lectura de cobertura sin abrir resolucion automatica:

- `listOperationalAbsenceScheduleImpacts(...)` exige rol de gestion, `organizationId` explicito y sesion/membership activa antes de cruzar periodos con solicitudes `approved` o `pending_review`;
- el cruce final sigue delegando en `list_absence_schedule_impacts(...)`; RLS/RPC quedan como segundo candado y no se crea `absence_schedule_impacts`;
- `coverage_needed` descuenta la asignacion de la lectura valida de cobertura; `potential` marca riesgo operativo sin descontar cobertura;
- `/app/schedule`, `/app/coverage`, Inicio y `/app/stats` muestran solo copy operativo minimizado, sin `reason_summary` ni motivos sensibles;
- si la lectura falla, la app muestra aviso y mantiene la cobertura base; no se bloquea el horario ni se inventa cobertura;
- I.16 no modifica `schedule_blocks`, `schedule_block_assignments`, `required_coaches`, plantillas ni estados de ausencia, no crea targets/ofertas y no introduce `applied`.

Datos prohibidos en I.9/I.10:

- diagnosticos, informacion de salud, documentos o justificantes medicos;
- notas extensas, datos familiares, sanciones o informacion disciplinaria;
- salario, payroll, datos bancarios, nominas, saldos legales de vacaciones o devengo;
- IP/fingerprint, ubicacion, mapas, coordenadas, Wi-Fi/Bluetooth, tokens, URLs firmadas, rutas Storage o payloads completos;
- seeds reales del primer tenant, reglas hardcodeadas de tenant y promesas de cumplimiento legal definitivo.

Frontera que sigue cerrada tras I.16: no hay creacion de ausencias para otra persona, calendario de ausencias, saldos legales, devengo de vacaciones, payroll, horas extra aprobadas, bajas medicas con documentos, Storage nuevo, push, geolocalizacion, app nativa, resolucion automatica de cobertura ni cumplimiento legal definitivo. La validacion legal/privacidad bloquea produccion o uso con datos reales, aunque no bloquea esta bandeja, creacion propia minima endurecida, QA tecnico de regresion e impacto derivado de cobertura sobre foundation tecnica interna.

### Eventos, Festivos Y Competiciones

I.19 mantiene eventos/festivos/competiciones como contexto operativo del box mediante `operational_events` y abre solo una superficie compacta en `/app/schedule`. No abre UI grande, calendario mensual/anual, seeds ni cambios automaticos sobre horario o cobertura.

Reglas de seguridad implementadas:

- `operational_events` tiene `organization_id` obligatorio desde la primera migracion y FK tenant-safe opcional a `centers`;
- las mutaciones quedan encapsuladas en RPCs `create_operational_event`, `update_operational_event` y `set_operational_event_status`; la escritura directa queda revocada para `authenticated`;
- `owner`, `admin` y `manager` gestionan tenant-wide; `coach` solo lee eventos `active` con `visibility` `staff` o `all_staff`;
- `center_manager`, `document_admin`, `payroll_manager` y `staff` no reciben permisos nuevos;
- `/app/schedule` lista eventos mediante `listOperationalEvents(...)`; las Server Actions de gestion revalidan sesion, tenant y `canManageOperationalEvents(...)` antes de delegar en RPC/helper;
- `coach` puede ver el resumen y detalle de eventos visibles, pero la superficie de crear/editar/cancelar/archivar queda condicionada por `canManageOperationalEvents(...)`;
- un evento/festivo puede marcar contexto o revision necesaria, pero no modifica `schedule_blocks`, `schedule_block_assignments`, `required_coaches`, plantillas, ausencias ni fichaje automaticamente;
- si un evento requiere staffing real, el bloque operativo debe crearse explicitamente y pasar por los mismos permisos/guardrails de horario y asignaciones;
- notas y helper rechazan salud, bajas, justificantes, documentos, salario, payroll, datos familiares, sanciones, ubicacion, IP/fingerprint, URLs, tokens, rutas Storage y texto largo sensible;
- no hardcodear festivos, reglas regionales ni datos del primer tenant en `src`; cualquier calendario base debe ser configuracion o dato tenant-safe.

Auditoria y retencion:

- `operational_audit_events` acepta `entity_type = operational_events` con acciones cerradas (`created`, `updated`, `cancelled`, `archived`, `reactivated`) y `changed_fields` minimizado;
- eventos operativos: retencion candidata de 24 meses tras finalizar o cerrarse;
- auditoria visible de eventos: 180 dias;
- respuestas personales futuras (`unavailable`, `wants_to_work`, etc.) siguen fuera de I.19 y requeriran RLS/retencion propia; no equivalen a ausencia aprobada, hora extra aprobada, fichaje ni voluntariado legal definitivo;
- cualquier retencion mayor, uso con datos reales o tratamiento de festivos/voluntariado con implicacion laboral requiere revision legal/privacidad.

### Horas Extra

I.20 modela horas extra solo como candidatos operativos revisables. I.21 implementa la base tecnica minima en `overtime_candidates`, `overtime_candidate_sources` y `overtime_candidate_events`, con helper interno en `src/lib/overtime-candidates.ts`. I.22 anade QA/RLS local con rollback en `supabase/snippets/overtime-candidates-rls-verification.sql` y endurece el smoke de foundation. I.23 abre una superficie visible minima en `/app/time` para revision operativa por `owner`, `admin` y `manager`. I.24 anade deteccion server-side prudente y manual desde contexto existente, sin payroll, compensacion, calculo definitivo, automatismo legal ni aprobacion legal. El objetivo de seguridad es impedir que una alerta de diferencia se convierta por accidente en payroll, compensacion o aprobacion legal.

Reglas de seguridad aplicadas:

- toda entidad nueva tiene `organization_id` obligatorio y FKs tenant-safe hacia persona, membership y candidato cuando aplica;
- el nombre implementado es `overtime_candidates`, no una entidad que sugiera aprobacion definitiva;
- las acciones propias futuras deberan derivar persona desde `auth.uid()` + tenant y no aceptar `person_profile_id` propio desde cliente;
- `time_records` y `time_punches` son fuentes de contexto, no tablas que el modelo de horas extra pueda editar directamente;
- `time_weekly_approvals.approved` puede congelar contexto de fichaje, pero no aprueba horas extra;
- `schedule_blocks`, `schedule_block_assignments`, `staff_work_windows`, ausencias y `operational_events` son fuentes de planificacion/contexto, no calculo legal ni payroll;
- los estados distinguen revision operativa (`operationally_validated`) de cualquier aprobacion legal/payroll futura;
- `owner`, `admin` y `manager` pueden revisar candidatos operativos mediante RPC/helper; `payroll_manager` no hereda acceso ni aprobacion sin capacidad explicita nueva;
- `/app/time` solo muestra la cola de revision a `owner`, `admin` y `manager`; `coach` no ve cola tenant-wide ni acciones, y `payroll_manager` no hereda visibilidad por ese rol;
- escritura directa de `authenticated` queda bloqueada; las mutaciones usan `create_overtime_candidate_signal(...)`, `add_overtime_candidate_source(...)` y `set_overtime_candidate_status(...)`;
- `list_overtime_candidates(...)` filtra por tenant, estado, persona, periodo y limite, y RLS vuelve a cerrar lectura propia/revision;
- la Server Action visible de I.23 delega en `setOvertimeCandidateStatus(...)`; no hace escrituras directas a `overtime_candidates`, `overtime_candidate_sources` ni `overtime_candidate_events`;
- la Server Action visible de I.24 delega en `detectOperationalOvertimeCandidates(...)`, que reutiliza helper/RPC de candidatos y no muta tablas fuente;
- I.24 solo crea candidatos cuando hay diferencia positiva clara entre minutos planificados snapshot y trabajados snapshot; datos inciertos, fichajes abiertos, correcciones pendientes/aprobadas o semanas reabiertas quedan en `needs_review`;
- I.24 es accion manual protegida, no cron, scheduler, background job ni automatismo permanente;
- `closed` y `superseded` quedan no accionables en UI, y `superseded` no se ofrece como accion visible;
- `supabase/snippets/overtime-candidates-rls-verification.sql` verifica roles reales, otro tenant, lectura propia, fuentes personales/ajenas, candidatos `closed`/`superseded`, escritura directa bloqueada y no mutacion de horario/fichaje con rollback;
- `tests/smoke/overtime-candidates-foundation.spec.ts` protege que la foundation/helper/UI/actions no muten horario/fichaje, no abran acceso a roles no autorizados ni introduzcan `service_role`, STL, geolocalizacion/push/cache o campos economicos;
- el copy visible usa "posible exceso", "candidato operativo" y "pendiente de revision", sin lenguaje de hora extra aprobada, nomina, importes, saldos o compensaciones;
- cualquier exporte de candidatos debe ser interno revisable, no exporte legal definitivo ni nomina.

Datos prohibidos en candidatos, eventos o auditoria:

- salario, tarifa, importe, moneda, conceptos retributivos, datos bancarios/fiscales, nominas o compensaciones;
- motivos sensibles de ausencias, salud, diagnosticos, justificantes, documentos o texto libre largo;
- ubicacion, coordenadas, IP/fingerprint, Wi-Fi/Bluetooth, signed URLs, rutas Storage, tokens y payloads completos;
- reglas hardcodeadas de tenant, region o convenio en `src`.

Gates despues de I.24:

- auditoria minimizada y retencion candidata antes de datos reales;
- revision legal/privacidad antes de usar el modelo para cualquier comunicacion laboral, payroll, representantes o Inspeccion.

### Tipos De Actividad Y Defaults De Horario

El 2026-05-14 se sustituye la edicion directa de tipos de actividad por la RPC `update_class_type_and_sync_defaults(...)` para mantener en una sola transaccion el catalogo y los defaults operativos derivados.

Reglas de seguridad aplicadas:

- la RPC exige usuario autenticado con membership activa y rol `owner`, `admin` o `manager` en la organizacion objetivo;
- `target_organization_id` no se acepta como autoridad del cliente: la Server Action resuelve la organizacion activa desde membership y la DB vuelve a validar rol con `has_org_role(...)`;
- la RPC valida nombre, slug, categoria, color, estado y rango de `required_coaches`;
- `required_coaches` se sincroniza a `schedule_template_blocks` del tenant y a `schedule_blocks` actuales/futuros no `cancelled` ni `completed`;
- no reescribe bloques pasados ni cerrados, para preservar historico operativo;
- no usa `service_role` en `src`, no crea triggers globales invisibles y no hardcodea datos del primer tenant.

Implicacion para refactors futuros: editar `class_types.required_coaches` desde app no debe volver a hacerse con `.from("class_types").update(...)` si se espera que plantillas y horarios presentes/futuros reflejen el cambio.

### Documentos

No abrir subida, gestion de grants ni repositorio documental completo hasta tener bucket privado, policies de Storage, grants explicitos, auditoria de accesos sensibles y tests negativos de descarga cruzada. E.5 abre preview/descarga desde rutas backend controladas: validan sesion, tenant, documento/version y `can_access_document`, emiten signed URLs cortas y registran `file_preview`/`file_download` o `denied` sin guardar URLs, rutas Storage, tokens ni contenido documental.

E.11 abre solo una superficie visible minima en `/app/documents`: lista metadata/versiones accesibles mediante `list_accessible_document_versions(...)`, requiere membership activa, organizacion activa, grants/capacidades reales y bucket privado `document-files`, y muestra acciones solo cuando llegan `can_preview` o `can_download`. La consulta excluye `sensitive_hr`, documentos firmables, evidencias de firma y payroll; no concede visibilidad global a `owner`, `admin` o `manager`; y no introduce signed URLs en cliente, subida visible, boton "Firmar", snapshots, audit UI, IA ni cumplimiento legal definitivo. E.12 exige validar esos limites con `supabase/snippets/document-repository-beta-qa-verification.sql` y evidencia manual redacted antes de usar documentos reales. E.13 exige registrar si la evidencia es local, QA o staging y dejar `bloqueado` cuando faltan credenciales, project ref, DB URL o archivo Storage controlado. E.14 confirma que no se debe intentar staging ni preparar fixtures persistentes si el entorno actual no aporta acceso real, credenciales por rol, casos QA y objeto controlado en `document-files`. E.15 repite la puerta de desbloqueo: si no hay project/ref, DB URL, credenciales/casos QA y objeto controlado, el estado correcto sigue siendo bloqueo documentado. E.16 anade el handoff de seguridad: variables/capacidades sin valores, casos QA, checklist de operador, evidencia esperada y criterios de pass/bloqueado, manteniendo secretos, cookies, signed URLs, rutas Storage activas y contenido documental fuera del repo.

### Programacion Util Asociada A Documentos

E.6/I.27 no implementa IA ni UI visible. Define la base segura para que una futura accion "ver programacion" pueda encontrar documentos autorizados desde horario, fecha o tipo de actividad. E.7/I.28 implementa la foundation interna con `document_programming_links`, RLS/RPC/helper y sin abrir superficie visible. E.8/I.29 abre solo una consulta minima desde detalle de bloque en `/app/schedule`, con permisos documentales y rutas backend existentes. E.9/I.30 anade QA interno no visible con snippet SQL rollback y smoke especifico. E.10/I.31 anade runbook operativo interno local/QA para validacion manual controlada sin abrir producto nuevo. E.11 permite que esos documentos/versiones autorizados tambien aparezcan en el repositorio visible minimo general, sin convertir el horario en grant ni abrir gestion documental completa.

Reglas de seguridad aplicadas:

- la fuente canonica es `documents` con `document_scope = programming` y `document_versions` como version consultable;
- `document_subjects` puede asociar programacion a `class_type`, `center` o `schedule_block` como sujeto/contexto simple;
- `document_programming_links` asocia una version concreta a rango de fechas y contexto opcional de `class_type`, `center` o `schedule_block`;
- `document_access_grants` decide metadata, preview, descarga o gestion; una fila en `schedule_block_assignments` no concede permiso documental;
- `schedule_blocks` aporta fecha, hora, centro y tipo de actividad; `schedule_block_assignments` aporta coach/persona asignada solo como contexto operativo;
- la RLS de `document_programming_links` permite leer solo asociaciones activas cuando `can_access_document(..., 'read_metadata')` autoriza el documento/version;
- las escrituras directas quedan cerradas para `authenticated`; asociar o retirar programacion pasa por RPCs que exigen permiso documental `manage`;
- `list_document_programming_for_block(...)` y `list_document_programming_for_context(...)` filtran documentos/versiones publicables y permiso documental antes de devolver metadata;
- `/app/schedule` consume `listDocumentProgrammingForBlock(...)` en servidor y muestra solo metadata autorizada; no acepta IDs de persona, coach ni asignacion como permiso documental;
- cualquier lectura debe resolver sesion, organizacion activa, membership activa, tenant, documento/version, sujeto/grant/capacidad y estado antes de exponer contenido;
- preview/descarga debe reutilizar las rutas controladas de E.5 o mantener signed URLs cortas, `no-store` y auditoria equivalente;
- la UI de E.8/I.29 solo enlaza a preview/descarga cuando `can_preview` o `can_download` llegan autorizados desde la consulta; el cliente no genera signed URLs;
- `supabase/snippets/document-programming-schedule-qa-verification.sql` verifica link activo por bloque/contexto, grant de descarga, grant solo metadata, denegacion sin grant, bloqueo cross-tenant y no mutacion de `schedule_blocks`/`schedule_block_assignments`;
- `tests/smoke/document-programming-qa.spec.ts` protege que esta verificacion siga siendo interna y que la UI de Horario no abra subida, pagina documental completa ni asociaciones visibles;
- `docs/operations/document-programming-manual-validation-runbook.md` define el procedimiento E.10/I.31 para seleccionar documento/version/grant/link/bloque, verificar usuarios con grant, solo metadata, sin grant y cross-tenant, y limpiar mediante rollback;
- `tests/smoke/document-programming-manual-validation.spec.ts` protege que la preparacion manual no introduzca UI documental, subida, asociaciones visibles, nuevas rutas de archivo ni IA;
- los documentos de programacion no deben guardar salud, disciplina, rendimiento laboral, ubicacion, payroll, nominas, sanciones, bajas, motivos personales, URLs firmadas, tokens ni contenido de otro tenant.

Casos permitidos por E.8/I.29, E.9/I.30, E.10/I.31, E.11, E.12, E.13, E.14, E.15 y E.16: ver programacion autorizada desde un bloque, listar documentos/versiones autorizados en `/app/documents`, abrir preview/descarga por rutas backend existentes si el permiso lo permite, mostrar estado vacio o metadata limitada si el permiso no alcanza, validar todo con SQL local/QA rollback, repetir una checklist manual controlada desde runbook, entregar handoff operativo a un operador con acceso real y registrar evidencia redacted o bloqueo de entorno. Quedan fuera IA funcional, embeddings/RAG/vector search, subida visible, pagina documental completa, gestion de grants, audit UI, decisiones automaticas, aprobaciones, payroll, documentos firmables, datos sensibles y uso cross-tenant.

### IA Futura Subordinada A Documentos Y Programacion

I.26 no implementa IA real. E.6/I.27 confirma que el siguiente paso es programacion/documentos utiles, no IA. El gate de seguridad impide que una capacidad asistida futura lea contenido ni tome decisiones antes de tener documentos/programacion utiles, permisos y auditoria.

Reglas de seguridad candidatas:

- la IA futura solo puede leer fuentes canonicas autorizadas: `documents`, `document_versions`, `document_subjects`, `document_programming_links`, `document_access_grants` y contexto operativo minimo de `schedule_blocks`/`schedule_block_assignments`;
- cada solicitud debe resolver sesion, organizacion activa, membership, rol/capacidad y grants documentales antes de acceder a contenido;
- `owner`, `admin` y `manager` no heredan acceso global a documentos o programacion privada por ser roles altos;
- cualquier acceso asistido a contenido privado debe auditar actor, documento/version, resultado permitido/denegado, proposito y timestamp, sin prompts completos, respuestas largas, URLs firmadas, rutas Storage, tokens ni contenido documental;
- prompts, respuestas, logs, cache, retencion, proveedor, transferencia de datos y entrenamiento deben tener decision explicita antes de datos reales;
- queda prohibido usar datos de un tenant para responder, evaluar, entrenar o fine-tunear en otro tenant.

Prohibiciones de producto/seguridad:

- decisiones automaticas de cobertura, asignacion, cambios, ausencias, fichaje, correcciones, cierres semanales u horas extra;
- payroll, nominas, importes, compensaciones, saldos o reglas legales definitivas;
- inferencias sensibles sobre salud, disciplina, rendimiento laboral, ubicacion, sanciones o situacion personal;
- embeddings, vector search, RAG, jobs, cron, SDKs, prompts runtime o UI visible sin task tecnica propia y pruebas negativas de permisos/tenant.

### Firma

"Mi firma" es solo asset personal reutilizable. Cualquier accion futura de firmar debe generar snapshot/version inmutable, evidencia auditada y bloqueo de firma por delegacion.

### RRHH Y Payroll

Salario, nominas, contratos, datos bancarios, bajas, permisos o informacion disciplinaria necesitan tablas propias, capacidades explicitas, RLS, auditoria y revision legal/privacidad. `person_profiles` no es contenedor de RRHH.

### Fichaje Y Ubicacion

Fichaje requiere historial corregible, exportable y auditable. Geolocalizacion debe ser puntual, minimizada, explicada y corregible; no tracking continuo.

Desde F.8, las correcciones propias se aplican directamente por defecto, pero siguen pasando por Server Action/helper y RPC transaccional con validacion de sesion, membership activa, tenant, persona propia y `organizations.time_tracking_config`. Si el `owner` activa aprobacion previa, el flujo vuelve a solicitud pendiente y revision/aplicacion administrativa. La configuracion se limita a `owner` tambien con trigger DB. F.9 anade avisos semanales calculados en servidor desde persona/perfiles propios, asignaciones `assigned`, bloques no cancelados y punches activos; `record_id` en la URL solo preselecciona el formulario y la action revalida registro/persona/tenant. F.10 mueve punches `superseded`/`voided` a historial visible de cambios, pero no autoriza borrado fisico ni cambia la retencion canonica. F.11-F.14 anaden automatico web por planificacion, cierre semanal/aprobacion firmada interna, avisos en Inicio y CSV interno revisable. F.15 documenta el gate de readiness beta: automatico por planificacion no prueba presencia real, jornada prevista no es fichaje/payroll, aprobar una semana firmada no es firma electronica avanzada/cualificada, candidatos de posible exceso no son horas extra aprobadas y el CSV no es exporte legal definitivo. No se deben conceder UPDATE/DELETE directos sobre `time_records` ni `time_punches` desde UI/actions.

G.1/G.2 solo documentan ubicacion asistida futura. Cualquier implementacion posterior debe tratar ubicacion como dato sensible: aviso/informacion clara antes de pedir permiso del navegador, fallback manual si se deniega o falla, validacion de tenant activo y permisos en servidor, RLS como segundo candado, retencion definida y acceso minimo. La ubicacion no debe ser fuente unica de verdad ni sustituir fichaje manual/correcciones; puede estar manipulada, ser imprecisa en interiores o no estar disponible.

G.2 decide que la configuracion futura debe vivir en `center_time_location_settings` y los eventos minimizados en `time_location_events`, ambos con `organization_id` obligatorio. El dato persistido sera resultado asistido y buckets de precision/distancia relativa; no distancia exacta ni coordenadas crudas del trabajador.

El modelo actual bloquea claves de ubicacion (`latitude`, `longitude`, `coordinate`, `geolocation`, `gps`) en metadata segura de fichaje/auditoria. No se debe relajar ese bloqueo para guardar coordenadas crudas en `time_audit_events.metadata`. Si se necesita evidencia, usar schema/RPC especifico con `organization_id`, permisos, retencion y auditoria de acceso. `time_punches.metadata` solo deberia guardar snapshot minimizado del resultado, nunca JSON libre enviado desde cliente.

G.2 no concede permisos especiales a `manager`, `center_manager`, `payroll_manager`, `staff` ni `coach`; tampoco introduce `service_role`, app nativa, geofencing con app cerrada, payroll, horas extra automaticas ni exportes legales.

### PWA, Offline Y Cache

H.1 permite solo metadata, manifest e icono generico para instalacion/acceso rapido. H.2 audita las rutas moviles criticas y refuerza cache privada desde `next.config.ts` y el proxy protegido de `/app`. No registra service worker ni activa modo offline.

Reglas de seguridad:

- no cachear respuestas autenticadas ni datos tenant-scoped en cliente;
- mantener `Cache-Control: no-store` en rutas protegidas `/app` y subrutas mientras no exista politica offline segura;
- no cachear fichajes, documentos, firmas, signed URLs, exportes, perfiles privados, grants ni auditorias;
- no usar service worker hasta tener allowlist de assets publicos y politica explicita de invalidacion;
- no usar Background Sync, PushManager, Notification API ni APIs de ubicacion desde web/PWA;
- la ausencia de offline debe ser una decision documentada, no un fallo silencioso que deje datos privados en caches del navegador.

Verificacion H.2 2026-05-13:

- `/manifest.webmanifest` e `/icon.svg` se sirven en dev y quedan generados en build;
- produccion local con `next start` devuelve `Cache-Control: no-store` y `Pragma: no-cache` en `/app` y subrutas criticas protegidas;
- browser audit en 390x844 y 375x812 registra 0 service workers y `CacheStorage` vacio;
- `rg` en `src` no encuentra `navigator.geolocation`, service worker, `PushManager`, `Notification`, background sync, `caches.`, `CacheStorage`, `service_role` ni `STL`.

Decision H.3 2026-05-13:

- La estrategia movil recomendada para el piloto es web responsive + PWA online segura. No hay deuda mobile/PWA bloqueante nueva antes de piloto.
- PWA no implica permiso para anadir service worker, CacheStorage de app, Background Sync, PushManager, Notification API, `navigator.geolocation`, mapas, IP/Wi-Fi/Bluetooth ni ubicacion real.
- Cualquier wrapper o app nativa futura debe abrir un gate de seguridad propio: threat model, datos recogidos, permisos iOS/Android, privacidad/store disclosures, QA por plataforma y pruebas negativas de tenant/RLS.
- Offline real solo puede evaluarse con allowlist explicita de assets publicos o un modelo seguro de datos cifrados/minimizados. Por defecto siguen prohibidos caches de respuestas autenticadas, documentos, fichajes, firmas, signed URLs, exportes, grants, auditorias y evidencias de ubicacion.
- Push nativo debe usar payloads minimizados y fallback in-app; no debe transportar datos laborales sensibles, documentos, firmas, payroll, ubicacion ni URLs firmadas.
- Geofencing/background location solo puede pasar a implementacion nativa/wrapper si existe requisito comercial validado, privacy/legal revisado, retencion definida, acceso minimo, evidencia minimizada y frontera `organization_id`/RLS intacta.
- Las cuentas developer, store review, privacy policy, permisos nativos, APNs/FCM y mantenimiento/QA por plataforma quedan como deuda futura documentada, no como implementacion H.3.

### Supply Chain

Cada cambio relevante de dependencias debe revisar lockfile y vulnerabilidades. No incorporar paquetes para seguridad, auth, documentos o parsing sensible sin justificacion.

## Checklist De Cierre

- [ ] La feature tiene frontera de `organization_id` clara.
- [ ] Los permisos estan en helpers o policies reutilizables, no dispersos en UI.
- [ ] Las acciones de servidor revalidan sesion, membership, tenant y capacidad.
- [ ] RLS cubre lectura y escritura, incluidas rutas de denegacion.
- [ ] Hay pruebas o verificacion manual de denegacion para otro tenant y rol sin permiso.
- [ ] Los archivos privados usan bucket privado, path controlado y signed URL corta.
- [ ] Los datos sensibles tienen auditoria definida antes de usarse con datos reales.
- [ ] No hay secretos ni service role en cliente.
- [ ] No hay datos reales sensibles en fixtures, screenshots, logs o seeds publicables.
- [ ] La documentacion del roadmap/TASKS refleja cualquier deuda de seguridad que quede abierta.
