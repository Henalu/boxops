# Personal Data Permissions - Fases D.2/D.3/D.4/D.5/E.1/E.2/E.3/E.4/E.5

Estado: D.2 queda cerrada el 2026-05-07 como matriz documental de permisos. D.3 queda cerrada el 2026-05-08 como modelo documental de avatar privado tenant-scoped. D.4 queda implementada el 2026-05-08 como primer avatar privado propio con `profile_assets`, bucket privado, RLS/RPC, policies de Storage y UI minima en `/app/account`. D.5 queda implementada el 2026-05-08 como "Mi firma" privada propia con `profile_signatures`, bucket privado, RLS/RPC, policies de Storage y canvas minimo en `/app/account`. E.1 queda documentada el 2026-05-08 como modelo seguro de documentos privados/empresa/persona, grants, Storage privado candidato y evidencias futuras. E.2 implementa el primer schema minimo de metadata documental privada con `documents`, `document_versions`, `document_subjects` y `document_access_grants`. E.3 implementa `document-files` como bucket privado minimo con RPCs y policies de Storage por `document_versions`. E.4 implementa `document_access_events` como auditoria documental minima segura con RLS y RPCs de registro/consulta. E.5 implementa rutas backend minimas de preview/descarga con signed URLs cortas y auditoria. F.10 ya deja fichaje manual propio con historial visible de cambios; G.2 documenta decision tecnica/legal de ubicacion asistida sin implementarla. I.9 documenta ausencias/vacaciones/permisos como dominio propio separado de cambios/cobertura, I.10 implementa una foundation interna DB/RLS/RPC, I.11 anade helper server-side interno, I.12 abre una primera bandeja visible protegida, I.13 anade creacion minima de solicitud propia sin calendario, I.14 endurece filtros/validacion/estados no accionables, I.15 anade QA tecnico de regresion e I.16 integra impacto derivado en lectura de cobertura sin cambiar visibilidad real ni campos personales. Documentos firmables, boton "Firmar", snapshots reales, pagina documental, subida desde app, geolocalizacion activa y RRHH sensible siguen fuera.

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

`owner`, `admin` y `manager` no deben mapearse en bloque a estas capacidades sensibles. Se decide capacidad por capacidad.

## Matriz Por Campo

| Grupo de datos | Ejemplos | Modelo recomendado | Persona propia | Roles operativos actuales | Roles/capacidades futuras | Estado |
|---|---|---|---|---|---|---|
| Cuenta Auth | email de acceso, user id, proveedor Auth | Supabase Auth + `organization_memberships` | Lee en Mi cuenta; no edita email Auth desde BoxOps | `owner`/`admin` gestionan membership, no email Auth | Seguridad avanzada pendiente | D.1 implementado |
| Perfil visible operativo | `display_name`, `preferred_alias`, `public_email` | `person_profiles` | Lee y edita solo su fila vinculada | Miembros activos leen perfiles visibles; `owner`/`admin` gestionan; `manager` opera fichas, no accesos | Se mantiene como dato no sensible de tenant | D.1 implementado |
| Avatar | foto de perfil visible en Mi cuenta | `profile_assets` real, tenant-scoped; bucket privado; signed URL corta | Crea o reemplaza solo su avatar desde `/app/account`; fallback si no hay avatar | No reemplazan avatar ajeno salvo permiso especifico futuro | `personal_asset_self_manage`; posible moderacion con auditoria | D.4 implementado para avatar propio |
| Ficha operativa de coach | centro principal, estado operativo, horas semanales de capacidad, notas operativas | `coach_profiles` | Lee resumen propio seguro en Mi cuenta | `owner`/`admin`/`manager` gestionan operativa MVP 1 | Si un campo se vuelve laboral sensible, moverlo fuera | Implementado como operativa, no RRHH completo |
| Notas internas operativas | notas de coordinacion no sensibles | `coach_profiles.notes` mientras siga operativo | No se muestran en Mi cuenta D.1 | Gestion operativa actual | Prohibido guardar salud, salario, contrato o datos disciplinarios aqui | Implementado con cautela |
| Contacto privado | telefono, direccion, contacto de emergencia | Tabla futura `person_private_profiles` o equivalente | Lee/edita parte propia segun politica | Sin acceso por defecto | `sensitive_hr_read/write` con auditoria | Pendiente |
| Datos laborales base | puesto contractual, antiguedad, jornada legal, estado laboral | Tabla futura `employment_profiles` | Lee propios si legal/producto lo permite | `manager` no accede por defecto; `admin` tampoco por herencia automatica | `sensitive_hr_read/write`; posiblemente `owner` explicito | Pendiente |
| Retribucion y payroll | salario, complementos, datos bancarios, nominas | Tablas/documentos separados y versionados | Lee sus documentos/valores si se decide | Sin acceso por defecto | `payroll_private_manage`; grants explicitos | Pendiente y fuera de Fase D |
| Documentos de empresa | politicas internas, manuales, avisos, plantillas | E.2: `documents` + `document_versions` + grants; E.3: bucket privado `document-files` | Lee solo si el tenant/grant lo permite | No acceso por defecto a todo; depende de scope/grant | `document_company_read/manage`, `document_grant_manage` | E.3 Storage tecnico; sin UI |
| Documentos privados de persona | contratos, anexos, nominas, justificantes, documentos firmados | E.2: `documents`, `document_subjects`, `document_access_grants`, versiones privadas; E.3: archivo privado | Lee documentos propios con Auth activa si es sujeto persona o tiene grant | Sin acceso global automatico | `document_personal_self_read`, `document_personal_manage`, `payroll_private_manage`, grants por persona | E.3 Storage tecnico; sin UI/documentos reales visibles |
| Documentos de gestion/admin | documentos internos de gestion, compliance, incidencias administrativas | E.2: `documents` con `document_scope = management_private` + grants; E.3: archivo privado | Sin acceso salvo grant/sujeto propio | `owner`/`admin`/`manager` no ven todo por herencia | `document_management_read/manage`, `document_grant_manage` | E.3 Storage tecnico; sin UI |
| Certificaciones | cursos, titulos, caducidades, adjuntos | E.2 permite `document_scope = certification`; E.3 puede guardar adjunto privado; `coach_certifications` queda futuro | Puede proponer/subir si se decide | Estado/caducidad podria ser operativo; adjunto privado no por defecto | `certification_self_submit`, `certification_manage` | Storage documental tecnico; certificaciones pendientes |
| Mi firma reutilizable | firma dibujada actual del perfil | `profile_signatures` real + Storage privado + hash/version | Crea/actualiza solo la propia desde `/app/account` | No pueden crear, actualizar ni usar firma ajena | Metadata limitada; evidencia solo al firmar entidades futuras | D.5 implementado para firma propia |
| Solicitudes de firma documental | peticion pendiente para firmar documento/version | E.1 futuro: `document_signature_requests` | Firma solo solicitudes propias con Auth/persona vinculada | No firma por otra persona | `signature_request_manage`, `document_sign_self` | E.1 documentado; no implementado |
| Snapshots/evidencias de firma | copia usada al firmar, hash, fecha, user agent/IP si procede | E.1 futuro: `document_signature_evidences` + bucket `document-signature-evidence` | Lee evidencia propia segun documento/grant | No acceso por rol alto generico | `signature_evidence_read` + grants/auditoria | E.1 documentado; no implementado |
| Fichaje manual | entradas/salidas, correcciones, historial de cambios, aprobacion opcional | Fase F con `time_records`, `time_punches`, correcciones, aprobaciones, exportes y auditoria | Lee y corrige registros propios segun politica del tenant | `owner`/`admin`/`manager` gestionan revision de fichaje, no payroll | Auditoria, exportes y retencion legal pendientes de cierre definitivo | F.10 implementado, sin geolocalizacion |
| Ubicacion asistida | resultado dentro/fuera/desconocido, buckets de precision/distancia, fallback | G.2 candidato: `center_time_location_settings` + `time_location_events`, snapshot minimo opcional en `time_punches.metadata` | Lee eventos minimizados propios | Sin acceso por rol alto a coordenadas; gestion solo con capacidad de fichaje/configuracion | `time_location_settings_manage`, `time_location_event_self_read`, `time_location_event_review`, `time_location_audit_read` | G.2 documentado; no implementado |
| Cambios/cobertura | solicitudes para cubrir o cambiar un bloque asignado | I.2-I.8: `change_requests`, `change_request_targets`, `change_request_events` | Solicita/responde lo propio segun workflow | `owner`/`admin`/`manager` gestionan decision operativa | No es ausencia, payroll ni horas extra aprobadas | Implementado para cobertura/cambio minimo |
| Ausencias/vacaciones/permisos | vacaciones, dias libres, tramos, permisos minimizados, no disponibilidad | I.10: `absence_requests`, `absence_request_periods`, `absence_request_events`; I.11: helper interno `src/lib/absence-requests.ts`; I.12/I.13/I.14: bandeja, creacion propia, filtros query string y estados no accionables en `/app/absences`; I.15: smoke/guardrails de regresion; I.16: impacto derivado en cobertura; sin tabla de impactos | Crea/lee/cancela lo propio en bandeja visible, derivando persona desde sesion + tenant; no acepta `person_profile_id` ni `coach_profile_id` propio; resumen corto minimizado con confirmacion visible de no incluir datos sensibles | `owner`/`admin`/`manager` revisan datos minimizados desde cola protegida y ven impacto operativo en `/app/schedule`, `/app/coverage`, Inicio y `/app/stats`; los filtros no amplian visibilidad ni otorgan permisos; no ven salud/documentos/payroll por herencia | `absence_self_request`, `absence_operational_review`, `absence_impact_review`; legal/privacidad antes de datos reales/produccion | I.16 sin cambios de campos personales, sin motivos en cobertura, sin calendario, saldos legales, creacion para otra persona, resolucion automatica ni datos reales |

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

## Reglas Para Documentos E.1/E.2/E.3/E.4/E.5

E.1 define el modelo candidato. E.2 implementa las cuatro tablas base de metadata y permisos: `documents`, `document_versions`, `document_subjects` y `document_access_grants`. E.3 conecta `document_versions` con Storage privado minimo. E.4 implementa auditoria documental minima con `document_access_events`. E.5 abre rutas controladas de preview/descarga sin UI.

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

## Fuera De D.2/D.3/D.4/D.5/E.1/E.2/E.3/E.4/E.5/F.10/G.2

- Hay schema minimo de metadata documental privada, bucket `document-files` privado, auditoria documental minima y rutas backend de preview/descarga, pero no hay modulo visible de documentos ni subida/listado desde la app.
- No hay documentos firmables ni boton "Firmar".
- No hay snapshots documentales reales ni evidencias de firma aplicada.
- No hay nominas, contratos, salario, geolocalizacion activa, swap, calendario completo de ausencias ni ausencias con datos reales.
- No hay consola RRHH ni permisos sensibles nuevos en `src`.
