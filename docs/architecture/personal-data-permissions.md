# Personal Data Permissions - Fases D.2/D.3/D.4/D.5/E.1/E.2/E.3/E.4/E.5/E.11/E.12/E.13/E.14/E.15/E.16

Estado: D.2 queda cerrada el 2026-05-07 como matriz documental de permisos. D.3 queda cerrada el 2026-05-08 como modelo documental de avatar privado tenant-scoped. D.4 queda implementada el 2026-05-08 como primer avatar privado propio con `profile_assets`, bucket privado, RLS/RPC, policies de Storage y UI minima en `/app/account`. D.5 queda implementada el 2026-05-08 como "Mi firma" privada propia con `profile_signatures`, bucket privado, RLS/RPC, policies de Storage y canvas minimo en `/app/account`. E.1 queda documentada el 2026-05-08 como modelo seguro de documentos privados/empresa/persona, grants, Storage privado candidato y evidencias futuras. E.2 implementa el primer schema minimo de metadata documental privada con `documents`, `document_versions`, `document_subjects` y `document_access_grants`. E.3 implementa `document-files` como bucket privado minimo con RPCs y policies de Storage por `document_versions`. E.4 implementa `document_access_events` como auditoria documental minima segura con RLS y RPCs de registro/consulta. E.5 implementa rutas backend minimas de preview/descarga con signed URLs cortas y auditoria. E.11 abre el primer repositorio documental visible minimo en `/app/documents`, alimentado por grants/capacidades reales y rutas backend E.5, sin subida, grants UI, documentos firmables ni IA. E.12 prepara validacion QA/staging controlada de ese repositorio con SQL rollback, evidencia redacted y casos de permisos/cross-tenant/exclusiones sensibles. E.13 cierra evidencia local y bloqueo staging sin inventar resultados ni abrir producto nuevo. E.14 reintenta la validacion QA/staging real con archivo Storage controlado y deja bloqueo exacto por falta de acceso real/credenciales/casos QA desde el entorno actual. E.15 actualiza el desbloqueo controlado con relectura de entorno redacted, SQL local rollback y bloqueo QA/staging por falta de project/ref, DB URL, credenciales/casos QA y objeto `document-files` controlado. E.16 deja un handoff operativo redacted para operador con acceso real, sin ampliar permisos ni superficie: variables/capacidades necesarias, casos QA, checklist, evidencia esperada y criterios de pass/bloqueado. F.15 deja fichaje manual/automatico web, correcciones, cierre semanal, aprobacion firmada interna, avisos, CSV interno y candidatos de posible exceso documentados para beta interna prudente; G.2 documenta decision tecnica/legal de ubicacion asistida sin implementarla. I.9 documenta ausencias/vacaciones/permisos como dominio propio separado de cambios/cobertura, I.10 implementa una foundation interna DB/RLS/RPC, I.11 anade helper server-side interno, I.12 abre una primera bandeja visible protegida, I.13 anade creacion minima de solicitud propia sin calendario, I.14 endurece filtros/validacion/estados no accionables, I.15 anade QA tecnico de regresion, I.16 integra impacto derivado en lectura de cobertura sin cambiar visibilidad real ni campos personales e I.25 anade trazabilidad operativa reciente para cobertura sin mostrar motivos sensibles. I.17 documenta eventos/festivos/competiciones como contexto operativo, I.18 implementa `operational_events` como foundation tecnica minima e I.19 los hace visibles de forma compacta en `/app/schedule`, sin respuestas personales. I.20 documenta horas extra como candidatos operativos revisables, I.21 implementa `overtime_candidates` con fuentes/eventos, RLS/RPC y helper interno, I.22 anade QA/RLS con rollback, I.23 abre una cola visible minima en `/app/time` solo para revision operativa de `owner`/`admin`/`manager` e I.24 anade deteccion server-side prudente y manual, sin aprobacion legal ni payroll. Documentos firmables, boton "Firmar", snapshots reales, repositorio documental completo, subida desde app, geolocalizacion activa, horas extra aprobadas/payroll y RRHH sensible siguen fuera.

I.26 documenta IA futura solo como capacidad subordinada a documentos/programacion utiles: requiere fuentes canonicas, permisos/grants, auditoria, privacidad/legal y aislamiento de tenant antes de cualquier implementacion. E.6/I.27 documenta la base previa de programacion util asociada a documentos y horario. E.7/I.28 implementa `document_programming_links` como foundation interna para asociar documentos/versiones a fecha/tipo/centro/bloque con RLS/RPC/helper. E.8/I.29 muestra una consulta minima autorizada desde el detalle de bloque en Horario, sin IA, subida visible ni pagina documental completa. E.9/I.30 anade QA interno no visible con rollback para validar grants, metadata limitada, denegacion sin permiso, cross-tenant y que `schedule_block_assignments` no concede acceso documental. E.10/I.31 anade runbook operativo interno local/QA para repetir la validacion manual con datos controlados. E.11 lista esas versiones autorizadas tambien desde el repositorio visible minimo cuando el usuario tiene grant/capacidad documental suficiente. E.12 verifica el repositorio con datos controlados antes de beta/staging real, E.13 registra evidencia local o bloqueo staging concreto, E.14 reintenta la validacion real con archivo Storage controlado solo si hay acceso disponible, E.15 actualiza el desbloqueo controlado sin inventar staging y E.16 deja handoff operativo para ejecutar esa validacion cuando haya operador con acceso real. B.4 documenta tenant readiness: separa configuracion global, gestion diaria, roles especializados futuros y alcance por centro sin activar `center_manager`. No crea IA funcional, embeddings, vector search, prompts runtime, SDKs, jobs, cron ni UI de IA.

## Decision D.2

D.2 elige cerrar primero la matriz documental de permisos por campo antes de abrir avatar privado, "Mi firma" real o cualquier dato laboral sensible.

La revision de D.1 confirma que `/app/account` ya cumple la frontera minima:

- todos los roles reconocidos con membership activa pueden abrir su area personal;
- la edicion propia se resuelve por `organization_id` + `auth.uid()`;
- la app no acepta `person_profile_id` desde el formulario de Mi cuenta;
- cuenta/Auth, perfil visible, ficha operativa de coach y RRHH sensible quedan separados;
- avatar ya tiene primer corte propio privado en D.4;
- "Mi firma" ya tiene primer corte propio privado en D.5, sin documentos firmables ni boton "Firmar".

Por tanto, cualquier corte tecnico posterior debe partir de esta matriz y de los modelos D.3/D.4/D.5, no de UI nueva aislada.

## Decision D.3

D.3 elige la opcion A: modelar avatar privado como asset tenant-scoped, sin subida real todavia.

La decision concreta:

- avatar es dato visible de perfil, pero su artefacto no debe ser publico;
- no se usara `person_profiles.avatar_url` como URL publica libre;
- el modelo candidato futuro es una tabla `profile_assets` con `asset_type = 'avatar'`;
- la lectura debe pasar por ruta controlada o signed URL corta despues de comprobar tenant, membership activa y visibilidad del perfil;
- la gestion propia debe derivar `person_profile_id` desde `auth.uid()` + `organization_id`;
- `owner`, `admin` y `manager` no pueden reemplazar avatar ajeno desde Mi cuenta ni por herencia automatica;
- "Mi firma", documentos, nominas, contratos, salario, fichaje, geolocalizacion, cambios y ausencias siguen fuera.

## Decision D.4

D.4 implementa solo avatar privado propio.

La decision concreta:

- se crea `profile_assets` real y tenant-scoped;
- se crea bucket privado `profile-assets` con `public = false`, limite 2 MB y MIME permitidos JPG/PNG/WebP;
- `person_profiles.avatar_url` no se escribe ni se usa como URL publica persistente;
- `/app/account` permite subir/reemplazar avatar propio, con `organizationId` como contexto de tenant y sin aceptar `person_profile_id`;
- la persona propietaria se deriva en servidor/base de datos desde `auth.uid()` + `organization_id`;
- la metadata se escribe mediante RPCs de seguridad (`pending` -> `active`) y no por escrituras directas de tabla desde el cliente;
- la lectura propia usa metadata RLS + signed URL corta de Storage;
- `owner`, `admin` y `manager` no pueden reemplazar avatar ajeno desde Mi cuenta;
- firma, documentos, nominas, contratos, salario, fichaje, geolocalizacion, cambios y ausencias siguen fuera.

## Decision D.5

D.5 implementa solo "Mi firma" propia como firma/confirmacion interna reutilizable.

La decision concreta:

- se crea `profile_signatures` real y tenant-scoped, separado de avatar;
- se crea bucket privado `profile-signatures` con `public = false`, limite 512 KB y MIME permitido `image/png`;
- `/app/account` permite dibujar, limpiar y guardar/reemplazar la firma propia, con `organizationId` como contexto de tenant y sin aceptar `person_profile_id`;
- la persona propietaria se deriva en servidor/base de datos desde `auth.uid()` + `organization_id`;
- la metadata se escribe mediante RPCs de seguridad (`pending` -> `active`) y no por escrituras directas de tabla desde el cliente;
- la lectura propia usa metadata RLS + signed URL corta de Storage;
- `owner`, `admin` y `manager` no pueden crear, actualizar ni usar firmas ajenas desde Mi cuenta;
- la UI deja claro que no es firma electronica avanzada/cualificada;
- no existen documentos firmables ni boton "Firmar" en D.5;
- actualizar "Mi firma" no modificara documentos ya firmados cuando existan snapshots;
- documentos, nominas, contratos, salario, fichaje, geolocalizacion, cambios y ausencias siguen fuera.

Por tanto, cualquier corte tecnico posterior debe partir de esta matriz y de los modelos D.3/D.4/D.5, no de UI nueva aislada.

## Decision E.1

E.1 documenta el primer modelo seguro de documentos antes de crear schema, buckets o UI.

La decision concreta:

- separar cabecera documental, version/archivo, sujetos afectados, grants y auditoria candidata;
- usar `organization_id` obligatorio en `documents`, `document_versions`, `document_subjects`, `document_access_grants`, `document_access_events`, `coach_certifications`, `document_signature_requests` y `document_signature_evidences`;
- proponer buckets privados `document-files` y `document-signature-evidence` con rutas internas tenant-scoped;
- separar documentos de empresa, documentos privados de persona y documentos de gestion/admin;
- tratar certificaciones como dato operativo con adjunto potencialmente privado;
- no mapear `owner`, `admin` ni `manager` automaticamente a lectura de todos los documentos;
- mantener "Mi firma" en `profile_signatures` como asset personal privado;
- dejar "Firmar documento" para una fase futura que genere solicitud, snapshot/version de firma y evidencia propia;
- identificar accesos a documentos sensibles, grants, versiones, certificaciones privadas y evidencias de firma como candidatos a auditoria.

E.1 no implementa documentos, permisos reales, buckets, boton "Firmar", snapshots reales, nominas, RRHH sensible, fichaje ni geolocalizacion.

## Decision E.2

E.2 convierte una parte de E.1 en schema tecnico minimo, pero sigue sin crear documentos reales ni superficie de producto.

La decision concreta:

- crear `documents`, `document_versions`, `document_subjects` y `document_access_grants` con `organization_id` obligatorio;
- mantener `documents` como cabecera logica, `document_versions` como metadata de archivo/version, `document_subjects` como afectados y `document_access_grants` como permisos explicitos;
- guardar `storage_bucket = 'document-files'` y rutas internas tipo `documents/{organization_id}/{document_id}/versions/{document_version_id}/{asset_id}.{ext}` solo como metadata candidata;
- no crear el bucket `document-files`, policies de Storage, subida, preview ni descarga real;
- mantener `requires_signature` en `documents`, pero con CHECK `requires_signature = false` para no abrir documentos firmables;
- permitir lectura por sujeto persona propio o por grant explicito; los grants pueden apuntar a persona, membership, rol o capability;
- no conceder lectura global de documentos personales sensibles a `owner`, `admin` ni `manager`;
- usar `document_admin` como rol explicito para documentos privados/gestion/sensitive HR no payroll y `payroll_manager` para documentos `payroll`;
- permitir `owner`/`admin` solo en gestion de documentos no sensibles de empresa/programacion/certificacion;
- dejar `document_access_events`, `coach_certifications`, `document_signature_requests` y `document_signature_evidences` para fases futuras.

E.2 no implementa buckets, UI, documentos firmables, boton "Firmar", snapshots reales, auditoria real, nominas, RRHH sensible nuevo, fichaje ni geolocalizacion.

## Decision E.3

E.3 convierte `document-files` en Storage privado real sin abrir un modulo visible de documentos.

La decision concreta:

- crear bucket privado `document-files` con `public = false`, limite 10 MB y MIME permitidos cerrados;
- mantener la ruta `documents/{organization_id}/{document_id}/versions/{document_version_id}/{asset_id}.{ext}`;
- crear `begin_document_version_upload`, `activate_document_version_upload` y `cancel_document_version_upload` como RPCs seguras para el ciclo de version;
- permitir upload en `storage.objects` solo si existe una `document_versions.pending` del uploader y path exacto;
- permitir lectura de archivo solo para `document_versions.active/archived` y documentos `active/archived` accesibles por sujeto propio, grant o capacidad documental explicita;
- revocar escritura directa autenticada sobre `document_versions` para que las versiones de archivo pasen por las RPCs;
- no crear UI documental, preview/descarga desde app, documentos firmables, snapshots, auditoria real, nominas, RRHH sensible nuevo, fichaje ni geolocalizacion.

## Decision E.4

E.4 convierte la auditoria documental candidata en una base tecnica minima, sin abrir el modulo visible de documentos.

La decision concreta:

- crear `document_access_events` con `organization_id` obligatorio, documento, version opcional, actor autenticado, membership, persona resuelta si existe, evento, access level, resultado, metadata minimizada y timestamp;
- cerrar `event_type` a metadata, preview, descarga, version, grants y sujetos; cerrar `result` a `allowed`/`denied`;
- no guardar contenido documental, URLs publicas, signed URLs, rutas Storage, tokens, firmas ni hashes documentales en metadata de auditoria;
- no conceder lectura de auditoria por herencia a `owner`, `admin` ni `manager`;
- permitir a `document_admin` leer auditoria no payroll, incluida `sensitive_hr`, y reservar auditoria `payroll` a `payroll_manager`;
- no abrir lectura propia de auditoria a usuarios normales en E.4; queda como decision futura si se disena una pantalla controlada;
- crear `record_document_access_event` y `list_document_access_events_for_document` como RPCs seguras;
- conectar `activate_document_version_upload` con eventos `version_activated` y `version_archived`;
- dejar `file_preview` y `file_download` preparados para futuras rutas controladas, sin registrar preview/descarga real desde app en E.4.

## Decision E.5

E.5 convierte esos eventos preparados en el primer acceso real controlado a archivos documentales privados, sin abrir UI documental.

La decision concreta:

- crear solo rutas backend bajo `/app/documents/[documentId]/versions/[documentVersionId]/preview` y `/download`;
- resolver siempre usuario autenticado, organizacion activa y membership en servidor;
- validar UUIDs, tenant, documento, version, bucket privado, estado `active`/`archived` y `requires_signature = false`;
- reutilizar `can_access_document(..., 'preview')` para preview y `can_access_document(..., 'download')` para descarga;
- generar signed URLs cortas de `document-files` solo tras validar acceso;
- registrar `file_preview` y `file_download` permitidos con `record_document_access_event`;
- registrar `denied` cuando falta permiso y el documento/version existe dentro del tenant;
- no guardar signed URLs, URLs publicas persistentes, rutas Storage, tokens, hashes ni contenido documental en metadata, auditoria, logs o base de datos;
- mantener estas rutas como infraestructura para una UI futura, no como modulo documental visible.

## Decision E.11

E.11 convierte la infraestructura documental previa en una primera superficie visible minima, no en un modulo documental completo.

La decision concreta:

- crear `list_accessible_document_versions(...)` para listar solo documentos/versiones accesibles por `can_access_document(..., 'read_metadata')`, con `can_preview` y `can_download` calculados en servidor;
- abrir `/app/documents` y enlazarlo desde `/app/more`, manteniendo la navegacion como entrada secundaria;
- reutilizar exclusivamente las rutas backend E.5 para preview/descarga;
- excluir documentos `sensitive_hr`, con `requires_signature`, evidencias de firma y documentos de payroll;
- no asumir que `owner`, `admin` o `manager` ven todo;
- no abrir subida visible, UI de grants, auditoria visible, documentos firmables, boton "Firmar", snapshots, IA, RAG, embeddings ni cumplimiento legal documental definitivo.

## Decision E.12

E.12 valida E.11 antes de usar documentos reales o sensibles.

La decision concreta:

- mantener `/app/documents` como lectura secundaria, no como gestor documental completo;
- usar `supabase/snippets/document-repository-beta-qa-verification.sql` con `BEGIN`/`ROLLBACK` para probar usuario con descarga, usuario solo metadata, usuario sin grant y usuario de otro tenant;
- comprobar que documentos `programming` y `company` aparecen solo cuando hay permiso real;
- comprobar que `sensitive_hr`, `payroll`, `signature_evidence` y `requires_signature` quedan fuera del repositorio visible minimo;
- exigir evidencia redacted de rol, organizacion, documento/version, resultado de listado, preview/download por E.5, auditoria `file_preview`/`file_download` cuando aplique, bloqueo cross-tenant, estado solo metadata y estado vacio sin grant;
- no abrir subida visible, grants UI, auditoria visible, documentos firmables, boton "Firmar", snapshots, payroll, IA, app nativa, geolocalizacion ni promesa legal documental definitiva.

## Decision E.13

E.13 cierra la evidencia disponible de E.12 sin ampliar permisos ni superficie.

La decision concreta:

- registrar que la verificacion SQL E.12 paso en local con `ROLLBACK`;
- registrar que QA/staging real queda bloqueado si faltan acceso Supabase/DB, project ref, credenciales por rol, tenant QA o archivo Storage controlado;
- usar una plantilla redacted con fecha, entorno, organizacion, rol, usuario/caso, documento/version, listado, preview, download, auditoria, cross-tenant, solo metadata, vacio sin grant, exclusiones sensibles y deuda;
- no guardar contrasenas, tokens, cookies, signed URLs, contenido documental, nominas, contratos, firmas reales ni capturas con datos personales innecesarios;

## Decision E.14

E.14 reintenta la validacion QA/staging real controlada de E.11/E.12 sin ampliar permisos ni superficie.

La decision concreta:

- intentar QA/staging solo si el entorno aporta acceso real verificable, project/ref o DB URL gestionado fuera del repo, credenciales/casos QA y archivo Storage controlado;
- registrar que el entorno actual no aporta `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_URL`, `SUPABASE_PROJECT_REF`, credenciales E2E por rol ni usuarios/casos documentales QA;
- reejecutar el snippet E.12 en local con `ROLLBACK` como evidencia tecnica disponible;
- mantener pendiente preview/download E.5 real hasta tener un objeto sintetico no sensible en `document-files`;
- no guardar secretos, cookies, signed URLs, rutas Storage activas, documentos privados ni contenido documental en el repo;
- no abrir subida visible, grants UI, auditoria visible, documentos firmables, boton "Firmar", snapshots, payroll, IA, app nativa, geolocalizacion ni promesa legal documental definitiva.

## Decision E.15

E.15 actualiza el desbloqueo controlado de la validacion QA/staging real sin ampliar permisos ni superficie.

La decision concreta:

- releer entorno sin imprimir secretos, valores de `.env.local`, cookies, signed URLs ni rutas Storage activas;
- ejecutar QA/staging solo si hay acceso real verificable, project/ref redacted o DB URL gestionada fuera del repo, tenant QA/staging, casos redacted y objeto sintetico controlado en `document-files`;
- registrar que el entorno actual no aporta `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_URL`, `DATABASE_URL`, `POSTGRES_URL`, credenciales E2E/casos documentales QA ni `DOCUMENT_QA_STORAGE_OBJECT_PATH`;
- reejecutar el snippet E.12 en local con `ROLLBACK` como unica evidencia tecnica disponible;
- mantener pendiente preview/download E.5 real hasta tener un objeto sintetico no sensible en `document-files`;
- no guardar secretos, cookies, signed URLs, rutas Storage activas, documentos privados ni contenido documental en el repo;
- no abrir subida visible, grants UI, auditoria visible, documentos firmables, boton "Firmar", snapshots, payroll, IA, app nativa, geolocalizacion ni promesa legal documental definitiva.

## Decision E.16

E.16 convierte el bloqueo repetido de QA/staging en handoff operativo controlado sin ampliar permisos ni superficie.

La decision concreta:

- releer entorno sin imprimir secretos, valores de `.env.local`, cookies, signed URLs ni rutas Storage activas;
- registrar que el entorno actual no aporta `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_URL`, `DATABASE_URL`, `POSTGRES_URL`, credenciales E2E/casos documentales QA ni `DOCUMENT_QA_STORAGE_OBJECT_PATH`;
- reejecutar el snippet E.12 en local con `ROLLBACK` como evidencia tecnica disponible;
- documentar para el operador las variables/capacidades necesarias, casos QA, checklist, evidencia esperada y criterios de pass/bloqueado;
- mantener pendiente preview/download E.5 real hasta tener un objeto sintetico no sensible en `document-files`;
- no guardar secretos, cookies, signed URLs, rutas Storage activas, documentos privados ni contenido documental en el repo;
- no abrir subida visible, grants UI, auditoria visible, documentos firmables, boton "Firmar", snapshots, payroll, IA, app nativa, geolocalizacion ni promesa legal documental definitiva.

## Principios

- `organization_id` es obligatorio en cualquier dato personal tenant-scoped.
- Tener un rol operativo alto no concede acceso automatico a salario, nominas, contrato, datos bancarios, documentos privados, fichaje, geolocalizacion ni evidencias de firma.
- Las funciones personales propias son universales para roles reconocidos: `owner`, `admin`, `manager`, `coach` y roles futuros activos.
- `person_profiles` sigue siendo perfil visible operativo. No debe crecer hasta convertirse en cajon de RRHH.
- Los datos sensibles necesitan tablas especificas, RLS, permisos por scope, auditoria y revision de privacidad/legal.
- Una accion propia no debe aceptar IDs de otra persona desde el cliente si puede derivarlos desde sesion + tenant.
- Ningun admin, manager o rol futuro puede firmar en nombre de otra persona usando su firma guardada.
- Avatar y firma pueden ser personales, pero sus artefactos no deben servirse como assets publicos.

## Capacidades Candidatas

Estas capacidades son nombres de diseno, no helpers implementados todavia:

| Capacidad | Uso |
|---|---|
| `personal_profile_self_read` | Leer la propia area personal dentro del tenant activo. |
| `personal_profile_self_write` | Editar campos visibles seguros propios. |
| `tenant_settings_manage` | Gestionar nombre visible, acento y configuracion global no sensible del tenant. |
| `tenant_access_manage` | Gestionar memberships, roles iniciales e invitaciones dentro del tenant. |
| `tenant_brand_asset_manage` | Gestionar logo/asset privado futuro del tenant, pendiente de Storage/permisos/auditoria. |
| `center_scoped_operational_manage` | Gestionar operativa limitada a centros concretos; futuro, bloqueado hasta frontera por centro en schema/RLS/UX. |
| `operational_profile_manage` | Gestionar fichas operativas de coach para MVP 1. |
| `personal_asset_self_manage` | Crear, reemplazar o borrar avatar/firma propios. |
| `sensitive_hr_read` | Leer datos laborales sensibles de otra persona. |
| `sensitive_hr_write` | Crear o editar datos laborales sensibles de otra persona. |
| `payroll_private_manage` | Gestionar nominas, retribucion o datos bancarios. |
| `document_private_manage` | Gestionar documentos privados o grants concretos. |
| `document_company_read` | Leer documentos de empresa visibles segun tenant/grants. |
| `document_company_manage` | Crear y mantener documentos de empresa. |
| `document_personal_self_read` | Leer documentos propios asociados a la persona autenticada. |
| `document_personal_manage` | Subir o gestionar documentos privados de otra persona con permiso explicito. |
| `document_management_read` | Leer documentos de gestion/admin con permiso explicito. |
| `document_management_manage` | Crear y mantener documentos de gestion/admin. |
| `document_grant_manage` | Conceder, revocar o modificar acceso documental. |
| `certification_self_submit` | Proponer/subir certificaciones propias si producto lo permite. |
| `certification_manage` | Verificar certificaciones y gestionar adjuntos segun permisos. |
| `programming_content_read` | Leer documentos/programacion autorizados para preparar clases o consultar contenido operativo. |
| `programming_content_manage` | Asociar documentos de programacion existentes a fecha, tipo, centro o bloque con permisos documentales explicitos. |
| `programming_content_assisted_read` | Usar una ayuda futura sobre documentos/programacion autorizados, sin decisiones automaticas ni acceso fuera de grants. |
| `signature_request_manage` | Crear, cancelar o gestionar solicitudes futuras de firma documental. |
| `document_sign_self` | Firmar una solicitud propia con la firma guardada del usuario autenticado. |
| `signature_evidence_read` | Leer evidencia de firma o snapshot asociado a una entidad firmada. |
| `document_access_audit_read` | Leer auditoria de accesos documentales sensibles. |
| `personal_data_audit_read` | Leer auditoria de acceso/cambio sobre datos personales sensibles. |
| `time_location_settings_manage` | Mantener configuracion de ubicacion por centro si una fase futura implementa G.2. |
| `time_location_event_self_read` | Leer los propios eventos de ubicacion minimizados. |
| `time_location_event_review` | Ver eventos minimizados asociados a revision de fichaje, sin coordenadas crudas. |
| `time_location_audit_read` | Leer auditoria/accesos de ubicacion si legalmente procede y se disena una pantalla/exporte. |
| `absence_self_request` | Solicitar, leer y cancelar ausencias propias dentro del tenant activo. |
| `absence_operational_review` | Revisar, aprobar o rechazar ausencias operativas minimizadas del tenant. |
| `absence_impact_review` | Ver impacto de ausencias sobre bloques/asignaciones sin exponer motivos sensibles a coaches candidatos. |
| `coverage_trace_review` | Ver trazabilidad operativa reciente de cobertura desde cambios, ausencias y auditoria minimizada, sin abrir datos sensibles ni payroll. |
| `operational_event_read` | Leer eventos/festivos/competiciones confirmados como contexto operativo del tenant. |
| `operational_event_manage` | Crear, editar, cancelar y archivar eventos/festivos/competiciones operativos del tenant. |
| `operational_event_self_response` | Responder personalmente a eventos cuando exista asistencia, interes, no disponibilidad o voluntad de trabajar. |
| `operational_event_impact_review` | Ver contexto o impacto derivado de eventos/festivos sobre horario/cobertura sin mutar bloques ni asignaciones. |
| `staff_work_window_read` | Leer franjas activas de jornada prevista compartida dentro del tenant activo. |
| `staff_work_window_manage` | Crear, editar, desactivar y eliminar franjas de presencia prevista del personal del tenant. |
| `overtime_candidate_self_read` | Leer candidatos propios de exceso/diferencia y su estado operativo minimizado. |
| `overtime_candidate_operational_review` | Revisar candidatos operativos de horas extra sin aprobar payroll ni importes. |
| `overtime_payroll_finalize` | Capacidad futura separada para uso legal/payroll, bloqueada hasta revision laboral y modelo propio. |

`owner`, `admin` y `manager` no deben mapearse en bloque a estas capacidades sensibles. Se decide capacidad por capacidad.

## Matriz Por Campo

| Grupo de datos | Ejemplos | Modelo recomendado | Persona propia | Roles operativos actuales | Roles/capacidades futuras | Estado |
|---|---|---|---|---|---|---|
| Cuenta Auth | email de acceso, user id, proveedor Auth | Supabase Auth + `organization_memberships` | Lee en Mi cuenta; no edita email Auth desde BoxOps | `owner`/`admin` gestionan membership, no email Auth | Seguridad avanzada pendiente | D.1 implementado |
| Configuracion global de tenant | nombre visible, acento, settings no sensibles, activacion operativa | `organizations` + `organizations.theme_config`; B.4 usa checklist operativa antes de activar tenant | Sin accion propia salvo lectura contextual | `owner`/`admin` gestionan; `manager` no toca configuracion global | `tenant_settings_manage`; versionado/auditoria futura si crece | B.1/B.4 documentado |
| Accesos y roles de tenant | memberships, rol, estado, invitaciones | `organization_memberships` + `team_invitations`; tokens hasheados y aceptacion por email/sesion | Acepta invitacion propia con email Auth coincidente | `owner`/`admin` gestionan altas/roles; `manager` no cambia roles | `tenant_access_manage`; SSO/MFA futuro | B.2/B.3/B.4 implementado/documentado |
| Logo/asset de organizacion | logotipo, marca en exports/documentos futuros | Futuro asset privado/controlado referenciado desde `theme_config.logoAssetId` o tabla dedicada si hace falta | Sin accion propia | `owner`/`admin` candidatos; no guardar URL publica ni abrir subida sin Storage/permisos | `tenant_brand_asset_manage` | Futuro; B.4 no lo exige para beta |
| Alcance por centro | permisos limitados a centros concretos, rol `center_manager` | Futuro modelo con relacion membership-centro, RLS por centro y UX propia | Sin accion propia | No existe gestion por centro en B.4; `manager` sigue tenant-wide | `center_scoped_operational_manage`; `center_manager` futuro | Bloqueado hasta task propia |
| Perfil visible operativo | `display_name`, `preferred_alias`, `public_email` | `person_profiles` | Lee y edita solo su fila vinculada | Miembros activos leen perfiles visibles; `owner`/`admin` gestionan; `manager` opera fichas, no accesos | Se mantiene como dato no sensible de tenant | D.1 implementado |
| Avatar | foto de perfil visible en Mi cuenta | `profile_assets` real, tenant-scoped; bucket privado; signed URL corta | Crea o reemplaza solo su avatar desde `/app/account`; fallback si no hay avatar | No reemplazan avatar ajeno salvo permiso especifico futuro | `personal_asset_self_manage`; posible moderacion con auditoria | D.4 implementado para avatar propio |
| Ficha operativa de coach | centro principal, estado operativo, horas semanales de capacidad, notas operativas | `coach_profiles` | Lee resumen propio seguro en Mi cuenta | `owner`/`admin`/`manager` gestionan operativa MVP 1 | Si un campo se vuelve laboral sensible, moverlo fuera | Implementado como operativa, no RRHH completo |
| Jornada prevista del personal | franjas previstas por dia, hora, persona y centro opcional | `staff_work_windows` tenant-scoped; expansion semanal al vuelo en `/app/schedule` | Todo miembro activo del tenant lee franjas activas como contexto compartido; no edita | `owner`/`admin`/`manager` crean, editan, desactivan, eliminan y ven tambien franjas inactivas; no es payroll ni ficha legal | `staff_work_window_read`, `staff_work_window_manage`; futuras reglas por centro requieren diseno propio | Implementado 2026-05-15 como contexto operativo, sin bloques, fichaje, saldos legales ni datos sensibles |
| Notas internas operativas | notas de coordinacion no sensibles | `coach_profiles.notes` mientras siga operativo | No se muestran en Mi cuenta D.1 | Gestion operativa actual | Prohibido guardar salud, salario, contrato o datos disciplinarios aqui | Implementado con cautela |
| Contacto privado | telefono, direccion, contacto de emergencia | Tabla futura `person_private_profiles` o equivalente | Lee/edita parte propia segun politica | Sin acceso por defecto | `sensitive_hr_read/write` con auditoria | Pendiente |
| Datos laborales base | puesto contractual, antiguedad, jornada legal, estado laboral | Tabla futura `employment_profiles` | Lee propios si legal/producto lo permite | `manager` no accede por defecto; `admin` tampoco por herencia automatica | `sensitive_hr_read/write`; posiblemente `owner` explicito | Pendiente |
| Retribucion y payroll | salario, complementos, datos bancarios, nominas | Tablas/documentos separados y versionados | Lee sus documentos/valores si se decide | Sin acceso por defecto | `payroll_private_manage`; grants explicitos | Pendiente y fuera de Fase D |
| Documentos de empresa | politicas internas, manuales, avisos, plantillas | E.2: `documents` + `document_versions` + grants; E.3: bucket privado `document-files`; E.11 lista versiones autorizadas en `/app/documents`; E.12 valida QA/staging con rollback; E.13 cierra evidencia/bloqueos; E.14 reintenta staging real con archivo controlado solo si hay acceso; E.15 actualiza el desbloqueo controlado; E.16 deja handoff operativo | Lee solo si el tenant/grant lo permite | No acceso por defecto a todo; depende de scope/grant | `document_company_read/manage`, `document_grant_manage` | E.11 visible minimo, E.12 QA controlado, E.13/E.14/E.15/E.16 evidencia redacted o bloqueo; sin subida, grants UI ni auditoria visible |
| Programacion documental util | ver programacion autorizada por fecha, tipo, bloque o documento; asociar documentos existentes a horario sin copiar contenido | E.7/I.28: fuente en `documents`/`document_versions` con `document_scope = programming`; `document_subjects` mantiene sujetos/contexto simple; `document_programming_links` asocia version concreta a rango de fechas y contexto opcional; `document_access_grants` decide permisos; `schedule_blocks`/`schedule_block_assignments` solo dan contexto operativo; E.8/I.29 consume esa lectura desde detalle de bloque; E.9/I.30 lo verifica con SQL rollback; E.10/I.31 lo operativiza con runbook manual local/QA; E.11 la lista en el repositorio general si hay acceso documental; E.12 valida el repositorio con datos controlados; E.13 registra evidencia o bloqueo; E.14 reintenta validacion real con archivo controlado si hay acceso; E.15 actualiza bloqueo/desbloqueo sin inventar staging; E.16 deja handoff operativo para validacion real | Solo lee contenido al que ya tenga acceso por sujeto/grant/capacidad; ser coach asignado no concede permiso por si solo; un grant `read_metadata` no habilita preview/descarga | `owner`/`admin`/`manager` no heredan acceso global; pueden gestionar documentos no sensibles de programacion solo con capacidad/grant; `document_admin` sigue separado para documentos sensibles | `programming_content_read`, `programming_content_manage`; `programming_content_assisted_read` queda futuro | E.11 cubre repositorio visible minimo, E.12 confirma grant real, usuario solo metadata, usuario sin grant, cross-tenant y bloqueo de sensibilidades, y E.13/E.14/E.15/E.16 evitan inventar staging; sigue sin subida visible, pagina documental completa, IA funcional, prompts runtime, embeddings, vector DB ni jobs |
| Programacion asistida futura | resumen, busqueda o explicacion asistida de programacion autorizada por fecha, tipo, bloque o documento | I.26: depende de que E.6/I.27 y una task tecnica posterior tengan fuentes canonicas utiles, grants y auditoria; no lee documentos sin permiso ni usa asignaciones como grant | Solo puede consultar contenido al que ya tenga acceso por grant/capacidad | `owner`/`admin`/`manager` no heredan acceso global ni pueden usar IA para decidir cobertura/aprobaciones | `programming_content_assisted_read`; entrenamiento/fine-tuning privado bloqueado hasta decision explicita | Futuro; sin IA funcional, prompts runtime, embeddings, vector DB, jobs ni UI |
| Documentos privados de persona | contratos, anexos, nominas, justificantes, documentos firmados | E.2: `documents`, `document_subjects`, `document_access_grants`, versiones privadas; E.3: archivo privado; E.11 lista solo versiones no `sensitive_hr`, no firmables y no payroll accesibles; E.12 verifica esas exclusiones; E.13/E.14/E.15/E.16 registran evidencia o bloqueo | Lee documentos propios con Auth activa si es sujeto persona o tiene grant | Sin acceso global automatico | `document_personal_self_read`, `document_personal_manage`, `payroll_private_manage`, grants por persona | E.11 visible minimo solo para documentos permitidos; documentos reales sensibles y payroll siguen fuera |
| Documentos de gestion/admin | documentos internos de gestion, compliance, incidencias administrativas | E.2: `documents` con `document_scope = management_private` + grants; E.3: archivo privado; E.11 lista solo si hay acceso real | Sin acceso salvo grant/sujeto propio | `owner`/`admin`/`manager` no ven todo por herencia | `document_management_read/manage`, `document_grant_manage` | E.11 visible minimo; sin gestion avanzada |
| Certificaciones | cursos, titulos, caducidades, adjuntos | E.2 permite `document_scope = certification`; E.3 puede guardar adjunto privado; E.11 puede listar la version autorizada; `coach_certifications` queda futuro | Puede proponer/subir si se decide | Estado/caducidad podria ser operativo; adjunto privado no por defecto | `certification_self_submit`, `certification_manage` | E.11 puede listar adjuntos autorizados; certificaciones completas pendientes |
| Mi firma reutilizable | firma dibujada actual del perfil | `profile_signatures` real + Storage privado + hash/version | Crea/actualiza solo la propia desde `/app/account` | No pueden crear, actualizar ni usar firma ajena | Metadata limitada; evidencia solo al firmar entidades futuras | D.5 implementado para firma propia |
| Solicitudes de firma documental | peticion pendiente para firmar documento/version | E.1 futuro: `document_signature_requests` | Firma solo solicitudes propias con Auth/persona vinculada | No firma por otra persona | `signature_request_manage`, `document_sign_self` | E.1 documentado; no implementado |
| Snapshots/evidencias de firma | copia usada al firmar, hash, fecha, user agent/IP si procede | E.1 futuro: `document_signature_evidences` + bucket `document-signature-evidence` | Lee evidencia propia segun documento/grant | No acceso por rol alto generico | `signature_evidence_read` + grants/auditoria | E.1 documentado; no implementado |
| Fichaje web | entradas/salidas, correcciones, historial de cambios, automatico por planificacion, cierre semanal, aprobacion firmada interna y CSV interno | Fase F con `time_records`, `time_punches`, correcciones, aprobaciones, exportes y auditoria; F.15 documenta readiness beta | Lee y corrige registros propios segun politica del tenant; el automatico por planificacion no prueba presencia real | `owner`/`admin`/`manager` gestionan revision de fichaje, cierre semanal y CSV interno, no payroll | Auditoria, exportes, retencion 4 anos si aplica y acceso legal siguen pendientes de revision externa | F.15 documentado, sin geolocalizacion web ni cumplimiento legal definitivo |
| Horas extra candidatas | posibles excesos/diferencias entre planificacion, fichaje y contexto operativo | I.21: `overtime_candidates`, `overtime_candidate_sources` y `overtime_candidate_events` tenant-scoped con RLS/RPC/helper interno; I.22: verificacion SQL/RLS con rollback; I.23: cola visible minima en `/app/time`; I.24: deteccion server-side prudente y manual desde contexto existente | Lee candidatos propios minimizados por RLS; I.23/I.24 no abren lectura propia visible ni cola tenant-wide para `coach` | `owner`/`admin`/`manager` revisan y disparan deteccion operativa desde `/app/time` y por RPC/helper; no aprueban payroll ni importes; `payroll_manager` no hereda revision, deteccion ni lectura tenant-wide | `overtime_candidate_self_read`, `overtime_candidate_operational_review`; `overtime_payroll_finalize` queda futuro separado | I.24 verifica roles, tenant, fuentes personales, candidatos cerrados/no accionables, escritura directa bloqueada, no mutacion de fuentes y copy prudente; sigue sin compensacion, saldos legales, importes ni aprobacion payroll |
| Ubicacion asistida | resultado dentro/fuera/desconocido, buckets de precision/distancia, fallback | G.2 candidato: `center_time_location_settings` + `time_location_events`, snapshot minimo opcional en `time_punches.metadata` | Lee eventos minimizados propios | Sin acceso por rol alto a coordenadas; gestion solo con capacidad de fichaje/configuracion | `time_location_settings_manage`, `time_location_event_self_read`, `time_location_event_review`, `time_location_audit_read` | G.2 documentado; no implementado |
| Cambios/cobertura | solicitudes para cubrir o cambiar un bloque asignado; trazas recientes de cambios de bloque/asignacion/plantilla | I.2-I.8: `change_requests`, `change_request_targets`, `change_request_events`; I.25: `coverage-traceability` + RPC filtrada de `operational_audit_events` | Solicita/responde lo propio segun workflow; no ve trazabilidad tenant-wide por ser coach salvo que tenga rol de gestion | `owner`/`admin`/`manager` gestionan decision operativa y ven trazabilidad reciente minimizada en `/app/schedule` y `/app/coverage` | `coverage_trace_review`; no es ausencia, payroll ni horas extra aprobadas | I.25 implementado sin motivos sensibles, sin mutaciones de horario/fichaje/ausencias/cambios y sin acceso para `coach`/`payroll_manager` |
| Ausencias/vacaciones/permisos | vacaciones, dias libres, tramos, permisos minimizados, no disponibilidad | I.10: `absence_requests`, `absence_request_periods`, `absence_request_events`; I.11: helper interno `src/lib/absence-requests.ts`; I.12/I.13/I.14: bandeja, creacion propia, filtros query string y estados no accionables en `/app/absences`; I.15: smoke/guardrails de regresion; I.16: impacto derivado en cobertura; I.25: trazabilidad de impacto en detalle; sin tabla de impactos | Crea/lee/cancela lo propio en bandeja visible, derivando persona desde sesion + tenant; no acepta `person_profile_id` ni `coach_profile_id` propio; resumen corto minimizado con confirmacion visible de no incluir datos sensibles | `owner`/`admin`/`manager` revisan datos minimizados desde cola protegida y ven impacto operativo en `/app/schedule`, `/app/coverage`, Inicio y `/app/stats`; I.25 anade detalle trazable solo en Horario/Cobertura; los filtros no amplian visibilidad ni otorgan permisos; no ven salud/documentos/payroll por herencia | `absence_self_request`, `absence_operational_review`, `absence_impact_review`, `coverage_trace_review`; legal/privacidad antes de datos reales/produccion | I.25 sigue sin cambios de campos personales, sin motivos en cobertura, sin calendario, saldos legales, creacion para otra persona, resolucion automatica ni datos reales |
| Eventos/festivos/competiciones | contexto operativo de festivos, cierres, competiciones, seminarios, open days y mantenimientos; respuestas personales futuras fuera | I.18/I.19: `operational_events` con `organization_id`, centro opcional tenant-safe, ventana temporal, visibilidad, impacto, notas minimizadas, auditoria en `operational_audit_events` y superficie compacta en `/app/schedule`; `box_event_occurrences/responses/schedule_contexts` quedan futuros | `coach` lee solo eventos `active` con `visibility` `staff` o `all_staff` en Horario; no hay controles de gestion ni respuestas propias todavia | `owner`/`admin`/`manager` gestionan por Server Actions + RPC/helper; no modifican horario/cobertura automaticamente | `operational_event_read`, `operational_event_manage`, `operational_event_impact_review`; `operational_event_self_response` futuro; `center_manager` futuro por centro | I.19 sin UI grande, calendario avanzado, payroll, horas extra aprobadas, geolocalizacion, datos reales ni permisos para `staff` |

## Reglas Para Avatar

D.3 modela avatar antes de firma/documentos porque es menos delicado que una firma reutilizable, pero sigue siendo asset privado. D.4 abre el primer corte tecnico solo para avatar propio porque cumple los minimos de schema, bucket privado, RLS y accion propia.

Modelo implementado `profile_assets`:

| Campo | Regla |
|---|---|
| `id` | Identificador del asset. |
| `organization_id` | Frontera obligatoria de tenant. |
| `person_profile_id` | Persona propietaria dentro del tenant. |
| `asset_type` | Inicialmente `avatar`; extensible si se justifica. |
| `uploaded_by_user_id` | Usuario autenticado que sube/reemplaza el asset. Para Mi cuenta debe coincidir con la persona vinculada. |
| `storage_path` | Ruta interna en bucket privado; nunca URL publica. |
| `mime_type` | Lista permitida cerrada: `image/jpeg`, `image/png`, `image/webp`. |
| `size_bytes` | Limite maximo D.4: 2 MB. |
| `width` / `height` | Dimensiones normalizadas o validadas. |
| `asset_hash` | Hash para trazabilidad, deduplicacion o cache controlada. |
| `status` | `pending`, `active`, `replaced` o `deleted`, con un unico avatar activo por persona. |
| `created_at` / `updated_at` | Timestamps tecnicos. |

Minimos D.4 cumplidos:

- no usar `avatar_url` como URL publica libre;
- mantener `person_profiles.avatar_url` como legacy/no usado en D.4;
- crear migracion con `organization_id` obligatorio y FK a `person_profiles`;
- bucket privado con `public = false`;
- policies RLS alineadas con memberships activas y persona propia;
- lectura propia mediante signed URL corta despues de comprobar tenant y persona;
- reemplazo derivado desde sesion + tenant, sin aceptar edicion de otra persona desde Mi cuenta;
- no aceptar `person_profile_id` desde formularios personales;
- no permitir que `owner`/`admin`/`manager` reemplacen avatar ajeno por defecto;
- reemplazo no destructivo: nuevo asset `pending`, anterior `replaced`, fallback visual si no hay avatar.

Fuera de D.4:

- no hay avatar ajeno en Equipo/Horario;
- no hay reemplazo ajeno ni moderacion;
- no hay cropper ni transformaciones;
- no hay borrado visible desde UI;
- no se abre firma, documentos ni RRHH sensible.

## Reglas Para Mi Firma

"Mi firma" es capacidad personal propia, no firma documental.

Modelo implementado `profile_signatures`:

| Campo | Regla |
|---|---|
| `id` | Identificador de la firma. |
| `organization_id` | Frontera obligatoria de tenant. |
| `person_profile_id` | Persona propietaria dentro del tenant. |
| `uploaded_by_user_id` | Usuario autenticado que guarda/reemplaza la firma. Para Mi cuenta debe coincidir con la persona vinculada. |
| `storage_bucket` | Siempre `profile-signatures`. |
| `storage_path` | Ruta interna en bucket privado; nunca URL publica. |
| `mime_type` | Primer corte cerrado a `image/png`. |
| `size_bytes` | Limite maximo D.5: 512 KB. |
| `width` / `height` | Dimensiones validadas del PNG. |
| `signature_hash` | Hash SHA-256 para trazabilidad, cache controlada y snapshots futuros. |
| `signature_version` | Version incremental por persona y tenant. |
| `status` | `pending`, `active`, `replaced` o `deleted`, con una unica firma activa por persona. |
| `activated_at` | Momento en el que la firma pasa a activa. |
| `created_at` / `updated_at` | Timestamps tecnicos. |

Minimos D.5 cumplidos:

- `profile_signatures` tenant-scoped por `organization_id` + `person_profile_id`;
- bucket privado `profile-signatures`, nunca asset publico;
- hash, version, estado y timestamps;
- crear/actualizar solo por el usuario autenticado vinculado a esa persona;
- no permitir que roles altos suban o usen firmas ajenas;
- lectura propia mediante signed URL corta despues de comprobar tenant y persona;
- no aceptar `person_profile_id` desde formularios personales;
- no hay documentos firmables ni boton "Firmar";
- actualizar la firma no cambia documentos o evidencias ya firmadas cuando existan snapshots;
- cualquier boton "Firmar" futuro debe guardar snapshot/version de la firma usada y auditoria de la accion.

## Reglas Para Documentos E.1/E.2/E.3/E.4/E.5/E.11/E.16

E.1 define el modelo candidato. E.2 implementa las cuatro tablas base de metadata y permisos: `documents`, `document_versions`, `document_subjects` y `document_access_grants`. E.3 conecta `document_versions` con Storage privado minimo. E.4 implementa auditoria documental minima con `document_access_events`. E.5 abre rutas controladas de preview/descarga. E.11 abre una lista visible minima que consume esos permisos sin abrir gestion documental completa. E.16 deja el handoff operativo para validar esa lista y esas rutas en QA/staging solo cuando haya acceso real, casos controlados y archivo no sensible.

Entidades candidatas:

| Entidad | Regla |
|---|---|
| `documents` | Implementado en E.2 como cabecera logica; incluye `organization_id`, scope, sensibilidad, estado, version actual y `requires_signature = false`. |
| `document_versions` | Implementado en E.2 como metadata de archivo/version; E.3 lo conecta a `document-files` privado con RPCs y policies de Storage. |
| `document_subjects` | Implementado en E.2 para personas o entidades afectadas; no equivale a permiso de lectura para terceros. |
| `document_access_grants` | Implementado en E.2 para permisos explicitos por persona, membership, rol/capability o version. |
| `document_access_events` | Implementado en E.4 para auditoria minima de metadata, preview/descarga y cambios de version/grants/sujetos, con RLS estricta. E.5 registra accesos reales desde rutas controladas. |
| `coach_certifications` | Certificaciones con estado/caducidad y adjunto privado opcional. |
| `document_signature_requests` | Solicitudes futuras por documento/version y firmante. |
| `document_signature_evidences` | Evidencia futura inmutable con snapshot de firma y hash/version documental. |

Buckets privados candidatos:

| Bucket | Ruta candidata |
|---|---|
| `document-files` | E.3 lo crea privado: `documents/{organization_id}/{document_id}/versions/{document_version_id}/{asset_id}.{ext}` |
| `document-signature-evidence` | `signature-snapshots/{organization_id}/{document_id}/{request_id}/{evidence_id}.png` |
| `document-signature-evidence` | `signed-documents/{organization_id}/{document_id}/{document_version_id}/{evidence_id}.{ext}` |

Reglas de permisos:

- Un documento de empresa no es automaticamente publico: necesita scope, capacidad o grant claro.
- Un documento privado de persona debe tener sujeto/persona y acceso propio definido, pero eso no concede acceso a managers por defecto.
- Un documento de gestion/admin puede requerir `document_management_read` aunque el usuario sea `owner` o `admin`.
- Nominas, retribucion y datos bancarios requieren `payroll_private_manage` o grants explicitos, no `document_private_manage` generico.
- Las certificaciones pueden exponer estado/caducidad como dato operativo, pero el adjunto puede seguir siendo privado.
- Los grants y cambios de sensibilidad/visibilidad son acciones auditables candidatas.
- En E.2, `owner`/`admin` solo gestionan documentos no sensibles de empresa/programacion/certificacion; `document_admin` gestiona documentos privados/gestion/sensitive HR no payroll; `payroll_manager` queda reservado para `payroll`.
- En E.2, la lectura de documentos se abre por sujeto persona propio o por grant explicito; no hay lectura global por `manager`.
- En E.3, la lectura del binario en Storage exige version/documento en estado publicable y reutiliza `can_access_document(..., 'preview')`; un `admin` sin grant no lee `sensitive_hr` ni `payroll`.
- En E.4, la lectura de auditoria exige `document_admin` para no payroll o `payroll_manager` para payroll; `owner`, `admin` y `manager` no la leen por herencia.
- En E.5, `file_preview` y `file_download` se emiten solo desde rutas backend controladas que generan signed URLs cortas despues de validar acceso.
- En E.11, `/app/documents` lista solo versiones accesibles por `read_metadata`; las acciones de preview/descarga aparecen solo si `can_preview` o `can_download` llegan autorizados desde servidor.

Reglas de firma documental futura:

- "Mi firma" crea o actualiza `profile_signatures`; no firma documentos.
- "Firmar documento" debe operar sobre un `document_version_id` concreto.
- La accion debe verificar que el usuario autenticado corresponde a la persona firmante dentro del tenant.
- La evidencia debe copiar snapshot/version de la firma a Storage privado de evidencia y guardar hash/version.
- La evidencia debe registrar documento/version, persona firmante, usuario autenticado, fecha/hora, estado e IP/user agent si se decide.
- Cambiar "Mi firma" o reemplazar el documento no debe alterar evidencias anteriores.

## Reglas Para RRHH Sensible

Antes de guardar salario, contrato, jornada, datos bancarios, documentos laborales, fichaje, geolocalizacion, ausencias o bajas:

- crear tabla o modulo especifico con `organization_id`;
- definir capacidades en app y policies RLS;
- decidir lectura propia, lectura por rol y grants por persona;
- registrar auditoria de lectura/escritura cuando el dato sea sensible;
- documentar retencion, borrado, exportacion y acceso legal;
- validar privacidad/legal antes de usar datos reales.

## Fuera De D.2/D.3/D.4/D.5/E.1/E.2/E.3/E.4/E.5/E.11/E.16/F.10/G.2

- Hay schema minimo de metadata documental privada, bucket `document-files` privado, auditoria documental minima, rutas backend de preview/descarga y un repositorio visible minimo en `/app/documents`, pero no hay modulo documental completo, subida desde app, grants UI ni auditoria visible.
- No hay documentos firmables ni boton "Firmar".
- No hay snapshots documentales reales ni evidencias de firma aplicada.
- No hay nominas, contratos, salario, geolocalizacion activa, swap, calendario completo de ausencias ni ausencias con datos reales.
- No hay consola RRHH ni permisos sensibles nuevos en `src`.
