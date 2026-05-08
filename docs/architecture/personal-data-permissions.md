# Personal Data Permissions - Fases D.2/D.3/D.4/D.5/E.1

Estado: D.2 queda cerrada el 2026-05-07 como matriz documental de permisos. D.3 queda cerrada el 2026-05-08 como modelo documental de avatar privado tenant-scoped. D.4 queda implementada el 2026-05-08 como primer avatar privado propio con `profile_assets`, bucket privado, RLS/RPC, policies de Storage y UI minima en `/app/account`. D.5 queda implementada el 2026-05-08 como "Mi firma" privada propia con `profile_signatures`, bucket privado, RLS/RPC, policies de Storage y canvas minimo en `/app/account`. E.1 queda documentada el 2026-05-08 como modelo seguro de documentos privados/empresa/persona, grants, Storage privado candidato y evidencias futuras. Documentos firmables, boton "Firmar", snapshots reales, auditoria real y RRHH sensible siguen fuera.

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
| Documentos de empresa | politicas internas, manuales, avisos, plantillas | E.1: `documents` + `document_versions` + grants; bucket privado `document-files` | Lee solo si el tenant/grant lo permite | No acceso por defecto a todo; depende de scope/grant | `document_company_read/manage`, `document_grant_manage` | E.1 documentado |
| Documentos privados de persona | contratos, anexos, nominas, justificantes, documentos firmados | E.1: `documents`, `document_subjects`, `document_access_grants`, versiones privadas | Lee documentos propios con Auth activa si la politica lo permite | Sin acceso global automatico | `document_personal_self_read`, `document_personal_manage`, `payroll_private_manage`, grants por persona | E.1 documentado |
| Documentos de gestion/admin | documentos internos de gestion, compliance, incidencias administrativas | E.1: `documents` con `document_scope = management_private` + grants | Sin acceso salvo grant/sujeto propio | `owner`/`admin`/`manager` no ven todo por herencia | `document_management_read/manage`, `document_grant_manage` | E.1 documentado |
| Certificaciones | cursos, titulos, caducidades, adjuntos | E.1: `coach_certifications` + documento/adjunto privado opcional | Puede proponer/subir si se decide | Estado/caducidad podria ser operativo; adjunto privado no por defecto | `certification_self_submit`, `certification_manage` | E.1 documentado |
| Mi firma reutilizable | firma dibujada actual del perfil | `profile_signatures` real + Storage privado + hash/version | Crea/actualiza solo la propia desde `/app/account` | No pueden crear, actualizar ni usar firma ajena | Metadata limitada; evidencia solo al firmar entidades futuras | D.5 implementado para firma propia |
| Solicitudes de firma documental | peticion pendiente para firmar documento/version | E.1 futuro: `document_signature_requests` | Firma solo solicitudes propias con Auth/persona vinculada | No firma por otra persona | `signature_request_manage`, `document_sign_self` | E.1 documentado; no implementado |
| Snapshots/evidencias de firma | copia usada al firmar, hash, fecha, user agent/IP si procede | E.1 futuro: `document_signature_evidences` + bucket `document-signature-evidence` | Lee evidencia propia segun documento/grant | No acceso por rol alto generico | `signature_evidence_read` + grants/auditoria | E.1 documentado; no implementado |
| Fichaje y geolocalizacion | entradas/salidas, correcciones, punto de ubicacion | Fases F/G con tablas propias | Lee registros propios | Aprobacion solo con permiso explicito | Auditoria, retencion y revision legal | Pendiente |
| Cambios y ausencias | vacaciones, permisos, bajas, cambios de bloque | Fase I con tablas propias | Solicita/lee lo propio | Gestion operativa solo en workflow propio | Puede impactar RRHH y cobertura | Pendiente |

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

## Reglas Para Documentos E.1

E.1 define modelo candidato, no implementacion.

Entidades candidatas:

| Entidad | Regla |
|---|---|
| `documents` | Cabecera logica; incluye `organization_id`, scope, sensibilidad, estado y version actual. |
| `document_versions` | Archivo/version concreta con bucket privado, ruta interna, MIME, tamano y hash. |
| `document_subjects` | Personas o entidades afectadas por el documento; no equivale a permiso de lectura. |
| `document_access_grants` | Permisos explicitos por persona, membership, rol/capacidad o version. |
| `document_access_events` | Auditoria candidata de lectura, descarga, cambios de grants/versiones y evidencias. |
| `coach_certifications` | Certificaciones con estado/caducidad y adjunto privado opcional. |
| `document_signature_requests` | Solicitudes futuras por documento/version y firmante. |
| `document_signature_evidences` | Evidencia futura inmutable con snapshot de firma y hash/version documental. |

Buckets privados candidatos:

| Bucket | Ruta candidata |
|---|---|
| `document-files` | `documents/{organization_id}/{document_id}/versions/{document_version_id}/{asset_id}.{ext}` |
| `document-signature-evidence` | `signature-snapshots/{organization_id}/{document_id}/{request_id}/{evidence_id}.png` |
| `document-signature-evidence` | `signed-documents/{organization_id}/{document_id}/{document_version_id}/{evidence_id}.{ext}` |

Reglas de permisos:

- Un documento de empresa no es automaticamente publico: necesita scope, capacidad o grant claro.
- Un documento privado de persona debe tener sujeto/persona y acceso propio definido, pero eso no concede acceso a managers por defecto.
- Un documento de gestion/admin puede requerir `document_management_read` aunque el usuario sea `owner` o `admin`.
- Nominas, retribucion y datos bancarios requieren `payroll_private_manage` o grants explicitos, no `document_private_manage` generico.
- Las certificaciones pueden exponer estado/caducidad como dato operativo, pero el adjunto puede seguir siendo privado.
- Los grants y cambios de sensibilidad/visibilidad son acciones auditables candidatas.

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

## Fuera De D.2/D.3/D.4/D.5/E.1

- No hay documentos privados implementados.
- No hay documentos firmables ni boton "Firmar".
- No hay snapshots documentales reales ni evidencias de firma aplicada.
- No hay subida/consulta real de documentos, nominas, contratos, salario, fichaje, geolocalizacion, cambios ni ausencias.
- No hay consola RRHH ni permisos sensibles nuevos en `src`.
