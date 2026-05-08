# Domain Model - BoxOps

Este documento define entidades candidatas y el primer corte implementado.

Schema MVP 1 implementado en `supabase/migrations/00001_mvp1_multi_tenant_schema.sql`.

## Principio Base

Toda entidad operativa debe poder aislarse por organizacion. STL sera una organizacion concreta; no debe existir ninguna entidad o tabla especial para STL.

```text
Organization
  Center
    Schedule / Template
      Schedule Block
        Assignment / Coverage
        Operational Events
```

## Entidades Core

### `organizations`

Tenant/cliente. Frontera principal de datos, billing y permisos.

Campos candidatos:

- `id`
- `name`
- `slug`
- `status`
- `timezone`
- `theme_config`
- `created_at`

Fase B.1 implementa `theme_config jsonb not null default '{}'` en `supabase/migrations/00003_organization_theme_config.sql`.

Primer corte soportado:

- `version`
- `accentColor`

Reglas B.1:

- `theme_config` debe ser un objeto JSON.
- `accentColor`, si existe, se valida como hexadecimal `#rrggbb`.
- La app aplica el acento solo como marca ligera y mantiene estados criticos, error y foco con tokens de producto.
- Tras B.2, `owner` y `admin` compatible mutan configuracion global; `coach`, `manager` y roles especializados consultan sin editar.
- Logo real queda pendiente hasta modelar asset/Storage privado y permisos.

### `centers`

Sede fisica de una organizacion.

Campos candidatos:

- `id`
- `organization_id`
- `name`
- `slug`
- `address`
- `timezone`
- `latitude`
- `longitude`
- `geofence_radius_meters`
- `status`

### `users` / Auth

Identidad autenticada, gestionada por Supabase Auth.

No debe contener reglas de tenant por si sola.

Fase C implementa el primer polish de seguridad de cuenta sin crear tablas nuevas:

- `/forgot-password` solicita reset con Supabase Auth y responde siempre con copy generico para no revelar si un email existe.
- El enlace de Supabase vuelve por `/auth/callback?next=/reset-password`; el callback SSR intercambia `code` por sesion y redirige a `/reset-password`.
- `/reset-password` solo muestra el formulario de nueva contrasena cuando existe sesion validada; si no, pide abrir el enlace del email o solicitar otro.
- La app valida la regla minima desde `src/lib/auth/password-policy.ts`: 8 caracteres, al menos una letra y un numero. La misma regla debe configurarse en Supabase Auth para que Auth siga siendo la fuente de verdad.
- Tras actualizar contrasena con `updateUser`, la app cierra la sesion temporal y devuelve al login.
- No se crea tabla propia de intentos en Fase C. Se confia en rate limits de Supabase Auth; intentos restantes, cooldown exacto o bloqueo de 3 intentos quedan para Password Verification Hook + tabla propia si se justifica.

### `organization_memberships`

Relacion usuario-organizacion con rol.

Campos candidatos:

- `id`
- `organization_id`
- `user_id`
- `role`
- `status`
- `invited_at`
- `joined_at`

Roles de aplicacion tras B.2: `owner`, `admin`, `manager`, `coach`, `staff`, `center_manager`, `document_admin`, `payroll_manager`.

Roles especializados todavia futuros en permisos finos: `center_manager`, `document_admin`, `payroll_manager`, `staff`.

Decision de rol operativo tras validacion STL 2026-04-30:

- `admin` debe representar administracion completa del tenant.
- `manager` es el nombre recomendado para el rol de gestion operativa: horarios, cobertura, asignaciones, plantillas y aprobaciones de cambios.
- `manager` no debe implicar por defecto billing, configuracion global, permisos avanzados ni administracion completa de usuarios.
- B.2 activa `manager` en la app para operativa tenant-wide de MVP 1, sin permisos por centro ni permisos RRHH/documentos.
- `owner` y `admin` gestionan configuracion global y accesos; `admin` queda como rol compatible para no romper MVP 1.
- `center_manager` permanece reconocido por schema/app, pero sin escritura global desde RLS tras `00004_app_role_permission_alignment.sql` hasta tener frontera por centro.

### `person_profiles` / perfil visible de persona

Implementado en Task 009 en `supabase/migrations/00002_person_profiles.sql`.

Resuelve el problema de mostrar UUIDs de Auth en horarios, coaches y asignaciones futuras. Es tenant-scoped, no global, para evitar exponer datos personales entre organizaciones. La identidad autenticada sigue viviendo en Supabase Auth y el acceso sigue viviendo en `organization_memberships`.

Campos implementados:

- `id`
- `organization_id`
- `user_id` opcional
- `full_name`
- `display_name`
- `preferred_alias`
- `public_email`
- `avatar_url`
- `visibility_status`
- `status`
- `metadata`
- `created_at`
- `updated_at`

Reglas implementadas:

- `organization_id` + `user_id`, cuando exista, apunta a una membership del mismo tenant.
- No sustituye a `organization_memberships` para permisos.
- No sustituye a `coach_profiles` para capacidad operativa.
- `display_name` es obligatorio y se usa como nombre visible canonico.
- `preferred_alias` queda separado para alias explicitos como Rober o Pedrin.
- `public_email` es opcional y vive en el perfil del tenant; no se deriva de Auth.
- Las pantallas de horario/asignaciones deben leer nombres desde este perfil para no mostrar UUIDs.
- `full_name` puede quedar incompleto al crear un perfil operativo inicial; `display_name` o `preferred_alias` es lo que se muestra en horarios.
- La persona debe poder editar su alias/nombre visible y foto cuando tenga cuenta vinculada.
- `user_id` puede ser `null` para preparar personas operativas antes de que exista `auth.users`.
- `visibility_status = visible` puede leerlo cualquier miembro activo del tenant.
- `visibility_status = internal` queda oculto para lectura normal de miembros y sirve para perfiles tecnicos/no operativos.
- `owner`/`admin` pueden gestionar perfiles del tenant.
- Si `user_id` esta vinculado, la persona puede actualizar su perfil basico visible; la migracion protege tenant, usuario, visibilidad, estado y metadata mediante trigger.
- Fase D.1 expone esa actualizacion propia en `/app/account` solo para `display_name`, `preferred_alias` y `public_email`.
- `person_profiles` no guarda salario, contrato, nominas, documentos, datos bancarios ni datos laborales sensibles.
- D.3 decide que `avatar_url` no debe almacenar una URL publica libre. D.4 implementa el primer avatar real como asset privado tenant-scoped.
- D.4 no escribe `avatar_url`: el avatar propio real se guarda como metadata en `profile_assets` y artefacto en Storage privado.

Decision aplicada tras validacion STL 2026-04-30:

- No crear cuentas Auth reales para coaches sin que ellos elijan o acepten su email.
- Preparar personas/coaches operativos antes de vincularlos a Auth.
- El usuario tecnico interno puede tener Auth y membership admin, pero su perfil visible debe quedar oculto del equipo operativo.
- `manager` no recibe permisos completos sobre perfiles personales sensibles; tras B.2 puede ajustar fichas operativas de coach, pero no altas, roles ni vinculaciones de cuenta.

Flujo implementado en Fase A 2026-05-07:

- `/app/coaches` permite a `admin` vincular una ficha operativa pendiente con una cuenta Auth real existente mediante `user_id`.
- El flujo no crea usuarios Auth ni envia emails. Supabase Auth Admin/invite queda fuera de este corte porque requeriria service role o configuracion server-side no presente en la app actual.
- Antes de vincular, la app valida que la persona pertenece al mismo `organization_id`, esta activa y no es `visibility_status = internal`.
- La vinculacion crea o actualiza `organization_memberships` dentro del mismo tenant, rellena `person_profiles.user_id` y rellena `coach_profiles.user_id` conservando `coach_profiles.person_profile_id`.
- No se permite reutilizar el mismo `user_id` si ya esta vinculado a otra persona o ficha de coach del tenant.
- La propia membership del admin no se degrada ni suspende desde este flujo.
- Tras B.2, `owner`/`admin` pueden vincular cuentas y gestionar memberships; `manager` puede ajustar fichas operativas de coach, pero no altas, roles ni vinculaciones de cuenta. `coach` conserva lectura.

Flujo implementado en Fase D.1 2026-05-07:

- `/app/account` resuelve usuario autenticado, memberships activas y organizacion activa igual que el resto del shell protegido.
- Todos los roles reconocidos con membership activa pueden abrir su propia area personal mediante `canUsePersonalFeatures`.
- La pantalla muestra cuenta/Auth en lectura y no permite cambiar el email Auth desde BoxOps.
- La Server Action de perfil no recibe `person_profile_id`; busca el perfil propio por `organization_id` + `auth.uid()` y actualiza solo campos visibles seguros.
- Si la cuenta no tiene `person_profiles.user_id` vinculado, la UI muestra estado pendiente y no crea personas ni invitaciones.
- El perfil de coach propio se muestra en lectura para separar capacidad operativa de datos de cuenta.
- D.4 implementa avatar propio privado y D.5 implementa "Mi firma" propia privada. No hay avatar ajeno, documentos firmables ni RRHH sensible.

### `coach_profiles`

Perfil operativo de coach dentro de una organizacion.

Campos implementados:

- `id`
- `organization_id`
- `person_profile_id`
- `user_id`
- `primary_center_id`
- `weekly_contracted_hours`
- `status`
- `notes`

Decision implementada en Task 009:

- `coach_profiles.person_profile_id` permite crear capacidad operativa de coach pendiente de Auth.
- `coach_profiles.user_id` queda nullable para mantener coaches/personas operativas sin `auth.users`.
- Cada `coach_profile` debe tener al menos `user_id` o `person_profile_id`.
- El modelo actual basado en `user_id` sigue siendo valido y `/app/coaches` conserva ese flujo.
- Si se rellenan `user_id` y `person_profile_id`, deben pertenecer al mismo tenant y no pueden contradecir el `user_id` vinculado del perfil de persona.
- Para MVP 1, no se crean cuentas reales de coaches de forma unilateral.

### `coach_center_assignments`

Relacion opcional para coaches multi-centro.

Campos candidatos:

- `organization_id`
- `coach_profile_id`
- `center_id`
- `is_primary`
- `status`

## Area Personal Y RRHH

### Corte D.1 implementado

`/app/account` no introduce tablas nuevas. Reutiliza el modelo existente y documenta la frontera:

- cuenta/Auth: Supabase Auth y `organization_memberships`, siempre en lectura desde la app;
- perfil visible operativo: `person_profiles`, editable solo por la persona vinculada para nombre visible, alias y email publico;
- perfil de coach: `coach_profiles`, lectura propia en Mi cuenta y gestion operativa desde Equipo segun permisos existentes;
- RRHH sensible futuro: fuera de `person_profiles` y fuera de D.1.
- `coach_profiles.weekly_contracted_hours` se mantiene como capacidad operativa existente del MVP 1, no como nomina, salario ni contrato laboral completo; su privacidad debe revisarse antes de ampliar RRHH.

Datos seguros para MVP en perfil visible:

- `display_name`;
- `preferred_alias`;
- `public_email` opcional, solo si se decide mostrarlo dentro del tenant;
- `avatar_url` queda como campo legacy/no usado para URLs publicas; D.4 usa `profile_assets`;
- metadata operativa no sensible queda pendiente de caso concreto.

Datos RRHH sensibles futuros:

- salario/retribucion;
- contrato, jornada legal, puesto contractual y antiguedad laboral;
- documentos, nominas, datos bancarios, identificadores legales y datos de salud;
- fichaje, geolocalizacion, ausencias y cambios con impacto laboral.

Estos datos necesitaran tablas especificas, permisos por campo o scope, auditoria y revision de privacidad/legal antes de almacenarse o mostrarse.

### Corte D.2 documentado

D.2 no introduce tablas ni policies. Cierra la matriz de permisos por campo en `docs/architecture/personal-data-permissions.md` para que el siguiente corte tecnico no mezcle funciones personales con RRHH sensible.

Decision D.2:

- no abrir avatar privado, firma real, documentos ni datos laborales sensibles hasta tener schema, RLS, Storage privado o mecanismo equivalente, permisos explicitos y auditoria cuando aplique;
- mantener `person_profiles` como perfil visible operativo: nombre visible, alias, email publico opcional y referencia futura de avatar, sin salario, contrato, nominas, datos bancarios, fichaje, geolocalizacion ni documentos privados;
- considerar `coach_profiles` una ficha operativa de MVP 1. `weekly_contracted_hours` es capacidad operativa existente, no contrato laboral completo ni payroll;
- separar capacidades futuras: lectura/escritura propia, gestion operativa, assets personales, RRHH sensible, payroll, documentos privados, evidencias de firma y auditoria;
- no mapear `owner`, `admin` o `manager` automaticamente a lectura de datos sensibles. Cada campo o modulo futuro debe tener permiso especifico;
- derivar acciones personales desde sesion + `organization_id` + persona vinculada; no aceptar IDs de otra persona en formularios propios.

Matriz resumida:

| Grupo | Modelo | Acceso propio | Acceso ajeno |
|---|---|---|---|
| Cuenta Auth | Supabase Auth + membership | lectura en Mi cuenta | gestion de membership por `owner`/`admin`, no email Auth |
| Perfil visible | `person_profiles` | edicion propia segura | lectura por miembros activos; gestion compatible por roles autorizados |
| Avatar | asset privado futuro | gestion propia | no reemplazo ajeno sin permiso especifico |
| Ficha coach | `coach_profiles` | lectura propia resumida | gestion operativa por `owner`/`admin`/`manager` |
| RRHH sensible | tablas futuras | lectura propia segun politica | capacidades explicitas, no rol alto generico |
| Payroll | tablas/documentos futuros | lectura propia si se decide | `payroll_private_manage` o grants concretos |
| Firma perfil | `profile_signatures` implementado en D.5 | crear/actualizar solo propia | nadie firma por otra persona |
| Evidencias firma | solicitudes/snapshots futuros | lectura segun documento | capacidad/grant/auditoria especifica |

### Corte D.3 documentado

D.3 no introduce tablas ni policies. Decide que el siguiente paso seguro de Fase D es modelar avatar privado como asset tenant-scoped antes de cualquier subida real.

Modelo candidato: `profile_assets`.

Campos candidatos:

- `id`
- `organization_id`
- `person_profile_id`
- `asset_type` con valor inicial `avatar`
- `uploaded_by_user_id`
- `storage_path`
- `mime_type`
- `size_bytes`
- `width`
- `height`
- `asset_hash`
- `status`
- `created_at`
- `updated_at`

Reglas D.3:

- `organization_id` es obligatorio y debe coincidir con `person_profiles.organization_id`;
- `person_profile_id` identifica a la persona propietaria dentro del tenant;
- `storage_path` es una ruta interna en bucket privado o mecanismo equivalente, nunca URL publica persistente;
- `person_profiles.avatar_url` no se usara como URL publica libre; queda como campo legacy/display cache o sera sustituido por una FK tipo `avatar_asset_id` en una migracion futura;
- la lectura del avatar debe pasar por ruta controlada o signed URL corta despues de comprobar membership activa y visibilidad del perfil;
- la subida/reemplazo desde Mi cuenta debe resolver la persona por `auth.uid()` + `organization_id`, sin aceptar `person_profile_id` desde el formulario;
- `owner`, `admin` y `manager` pueden ver la representacion controlada de perfiles visibles, pero no reemplazan avatar ajeno por defecto;
- el borrado/reemplazo debe ser no destructivo o auditable al menos con estado/timestamps;
- D.3 no abre firma, documentos, nominas, contratos, salario, fichaje, geolocalizacion, cambios ni ausencias.

### Corte D.4 implementado

D.4 convierte el modelo de avatar en un corte tecnico minimo propio, sin ampliar permisos a avatares ajenos.

Implementado en `supabase/migrations/00005_profile_assets_private_avatar.sql`:

- tabla `profile_assets` tenant-scoped para metadata de avatar;
- bucket privado `profile-assets` con `public = false`, limite 2 MB y MIME permitidos `image/jpeg`, `image/png` y `image/webp`;
- ruta interna `avatars/{organization_id}/{person_profile_id}/{asset_id}.{ext}`;
- estado `pending`, `active`, `replaced` o `deleted`, con un unico avatar activo por persona;
- `asset_hash`, `size_bytes`, `mime_type`, dimensiones opcionales y timestamps;
- RLS de metadata para lectura propia y sin escrituras directas de tabla desde cliente;
- RPCs `begin_own_profile_avatar_upload`, `activate_own_profile_avatar_asset` y `cancel_own_profile_avatar_upload`, que derivan la persona desde `auth.uid()` + `organization_id`;
- policies de `storage.objects` para subir/leer solo objetos del path propio;
- `/app/account` permite subir/reemplazar avatar propio, no acepta `person_profile_id` y muestra fallback visual si no hay avatar;
- preview mediante signed URL corta; no se persiste URL publica libre.

Fuera de D.4:

- avatar en Equipo/Horario para otras personas;
- reemplazo ajeno por `owner`, `admin` o `manager`;
- cropper, transformaciones, moderacion o consola RRHH;
- firma, documentos, nominas, contratos, salario, fichaje, geolocalizacion, cambios y ausencias.

## Horarios Y Plantillas

### `class_types`

Tipos de clase o actividad.

Ejemplos:

- WOD.
- CrossFit For Fun.
- Wellness.
- Open Box.
- Fundamentals.
- Recepcion.
- Evento.
- Competicion.
- Otra actividad.

Campos candidatos:

- `id`
- `organization_id`
- `name`
- `category`
- `required_coaches`
- `requires_certification`
- `status`

Nota futura de Configuracion:

- La implementacion actual usa categorias base fijas para `class_types.category`.
- Cuando exista el modulo de Configuracion, las categorias visibles en Tipos de actividad deben ser editables por admin dentro de la organizacion activa: añadir, renombrar/editar etiqueta, desactivar y eliminar solo si no hay uso historico.
- Si una categoria ya esta referenciada por tipos, bloques o plantillas, la operativa segura debe ser desactivar/archivar en lugar de borrado destructivo.
- La fase futura debe decidir si se migra a una tabla tenant-scoped tipo `activity_categories` o a un catalogo de configuracion equivalente, y revisar el `CHECK` actual de `class_types.category`.
- No se implementa en MVP 1; queda anotado para la fase de Configuracion.

### `schedule_templates`

Plantilla semanal/mensual reutilizable.

Campos candidatos:

- `id`
- `organization_id`
- `center_id`
- `name`
- `template_type`
- `valid_from`
- `valid_until`
- `status`

### `schedule_template_blocks`

Bloques definidos dentro de una plantilla.

Campos candidatos:

- `id`
- `organization_id`
- `template_id`
- `day_of_week`
- `start_time`
- `end_time`
- `center_id`
- `class_type_id`
- `required_coaches`
- `default_coach_profile_id`
- `notes`

Decision validada con STL 2026-04-30:

- Una plantilla puede guardar `default_coach_profile_id` para algunos bloques.
- Una plantilla tambien debe permitir bloques sin coach por defecto.
- Al aplicar una plantilla, los bloques sin coach deben quedar como vacantes y aparecer en cobertura como riesgo `uncovered` si requieren coach.

Decision implementada en Task 013:

- La primera UI de plantillas se limita a `template_type = 'weekly'`.
- `schedule_templates.status = 'draft'` permite preparar plantillas sin aplicarlas.
- Solo plantillas `active` se aplican a semanas reales.
- `archived` conserva el patron sin borrarlo desde UI.
- Aplicar una plantilla crea `schedule_blocks` con `template_id`, `template_block_id` e `is_template_exception = false`.
- Si el bloque de plantilla tiene `default_coach_profile_id`, se crea `schedule_block_assignments.source = 'template'`.
- Si `default_coach_profile_id` es `null`, el bloque real queda vacante y la cobertura al vuelo decide si aparece como riesgo.
- La aplicacion evita duplicados por plantilla, bloque de plantilla y fecha de servicio dentro de la semana destino.
- Editar o cancelar un `schedule_block` aplicado desde plantilla marca `is_template_exception = true`.

### `schedule_blocks`

Unidad minima del horario real. Un bloque puede ser clase, recepcion, evento, competicion u otra actividad.

Campos candidatos:

- `id`
- `organization_id`
- `center_id`
- `template_id`
- `template_block_id`
- `date`
- `start_time`
- `end_time`
- `class_type_id`
- `required_coaches`
- `status`
- `notes`
- `is_template_exception`

Estados candidatos:

- `scheduled`
- `uncovered`
- `changed`
- `cancelled`
- `completed`

### `schedule_block_assignments`

Asignacion de coach a bloque.

Campos candidatos:

- `id`
- `organization_id`
- `schedule_block_id`
- `coach_profile_id`
- `assignment_status`
- `source`

Estados candidatos:

- `assigned`
- `pending`
- `declined`
- `removed`

Decision implementada en Task 010:

- Es la fuente canonica de asignaciones reales coach-bloque.
- Cada fila pertenece al mismo `organization_id` que el bloque y el `coach_profile`.
- Retirar una asignacion cambia `assignment_status` a `removed`; no se borra desde UI.
- Si una fila `removed` vuelve a asignarse, se reactiva a `assigned`.
- La unicidad por `schedule_block_id` + `coach_profile_id` evita duplicados logicos.
- `assignment_status = 'assigned'` es el unico estado que cuenta para cobertura.
- `pending`, `declined` y `removed` pueden mostrarse como metadata, pero no cubren el bloque.

## Cobertura Y Cambios

### `coverage_issues`

Para MVP 1 debe calcularse al vuelo en query/helper desde bloques, asignaciones y perfiles activos. Puede convertirse en tabla persistida mas adelante si hacen falta auditoria, notificaciones, rendimiento o workflow propio.

Tipos:

- `uncovered_block`
- `understaffed_block`
- `coach_overlap`
- `wrong_center_overlap`
- `certification_missing`
- `absence_conflict`

### `change_requests`

Solicitudes de cambio, cobertura o intercambio.

Campos candidatos:

- `id`
- `organization_id`
- `requester_coach_profile_id`
- `target_coach_profile_id`
- `schedule_block_id`
- `request_type`
- `status`
- `reason`
- `admin_required`
- `created_at`
- `resolved_at`

Tipos:

- `schedule_change`
- `class_change`
- `coverage_request`
- `swap`
- `offer_block`

Estados:

- `pending`
- `accepted_by_peer`
- `rejected_by_peer`
- `pending_admin_approval`
- `approved`
- `rejected`
- `applied`
- `cancelled`

## Ausencias, Eventos Y Horas

### `absence_requests`

Vacaciones, dias libres, permisos, bajas y cambios de disponibilidad.

### `box_events`

Eventos internos/externos, competiciones, seminarios, open days y festivos especiales.

### `event_responses`

Respuesta de coaches a eventos:

- `interested`
- `attending`
- `maybe`
- `unavailable`
- `wants_to_work`

### `overtime_entries`

Tracking interno de horas extra, no nomina.

Estados:

- `detected`
- `pending_validation`
- `validated`
- `compensated`
- `paid`
- `rejected`
- `closed`

## Fichaje

### `time_entries`

Entradas y salidas vinculadas a turno/bloque cuando sea posible.

### `time_entry_corrections`

Solicitudes de correccion con motivo, estado y aprobacion admin.

### Regla De Dominio

La geolocalizacion nunca debe ser fuente unica de fichaje. Debe combinarse con turno asignado, centro correcto, ventana temporal y ausencia de fichaje activo.

## Documentos Y Certificaciones

E.1 queda documentada el 2026-05-08 como modelado seguro, no como implementacion. No crea migraciones, buckets, UI, documentos firmables, boton "Firmar", snapshots reales ni auditoria real.

Principios E.1:

- Toda entidad documental debe incluir `organization_id`; tambien las versiones, sujetos, grants, solicitudes de firma, evidencias y eventos de auditoria.
- STL no tiene tablas, rutas, policies ni permisos especiales. El primer tenant solo aportara datos/configuracion.
- La cabecera de documento, el archivo/version, los sujetos afectados, los permisos y la auditoria se modelan separados.
- Los archivos viven en Storage privado o mecanismo equivalente; `storage_path` es ruta interna, nunca URL publica persistente.
- El titulo, tipo, sensibilidad y metadata de un documento pueden revelar informacion sensible; no se deben tratar como datos publicos.
- `owner`, `admin` y `manager` no implican acceso automatico a nominas, contratos, documentos privados, evidencias de firma ni adjuntos privados.
- "Mi firma" sigue en `profile_signatures`; "Firmar documento" sera una accion futura sobre `document_versions` que crea evidencia propia.

Buckets privados candidatos, no implementados en E.1:

| Bucket candidato | Uso | Ruta interna candidata |
|---|---|---|
| `document-files` | Archivos documentales privados y versiones activas/archivadas. | `documents/{organization_id}/{document_id}/versions/{document_version_id}/{asset_id}.{ext}` |
| `document-signature-evidence` | Snapshots de firma aplicada y artefactos firmados futuros. | `signature-snapshots/{organization_id}/{document_id}/{request_id}/{evidence_id}.png` |
| `document-signature-evidence` | Copia/version firmada futura si se genera un PDF u otro artefacto cerrado. | `signed-documents/{organization_id}/{document_id}/{document_version_id}/{evidence_id}.{ext}` |

### `documents`

Cabecera logica del documento dentro de una organizacion. No almacena el binario ni debe depender de rutas o reglas del primer tenant.

Campos candidatos:

- `id`
- `organization_id`
- `created_by_user_id`
- `title`
- `description`
- `document_type`
- `document_scope`
- `sensitivity_level`
- `current_version_id`
- `requires_signature`
- `status`
- `metadata`
- `created_at`
- `updated_at`

Valores candidatos de `document_scope`:

- `company`: documento de empresa, visible segun grants o capacidades como `document_company_read`.
- `person_private`: documento particular de una o varias personas, visible para esas personas y roles/capacidades autorizadas.
- `management_private`: documento de gestion/admin; no visible por defecto para todo `admin`.
- `certification`: documento asociado a certificacion, curso o titulacion.
- `programming`: documento/enlace de programacion asociado a fecha, tipo de clase o bloque.

Valores candidatos de `sensitivity_level`:

- `public_internal`: visible para miembros activos segun regla del tenant.
- `restricted`: requiere grant/capacidad explicita.
- `sensitive_hr`: contrato, anexo, justificante, baja/permiso u otro dato laboral sensible.
- `payroll`: nomina, retribucion, dato bancario o documento salarial.
- `signature_evidence`: documento o snapshot firmado con acceso restringido.

Asociaciones candidatas:

- organizacion
- centro
- persona/miembro
- coach
- evento
- bloque horario
- tipo de clase

Reglas candidatas:

- `organization_id` es obligatorio y debe coincidir con versiones, sujetos, grants y evidencias.
- La visibilidad no se deriva solo de `document_scope`; debe resolverse con capacidades, grants y sujeto afectado.
- Un documento puede existir sin ser firmable. `requires_signature` no crea por si solo solicitudes de firma.
- Si cambia el archivo, se crea `document_versions`; las firmas anteriores no se heredan automaticamente a la nueva version.
- Borrado inicial recomendado: archivado o borrado logico, con retencion definida antes de datos reales sensibles.

### `document_versions`

Archivo/version concreta de un documento.

Campos candidatos:

- `id`
- `organization_id`
- `document_id`
- `version_number`
- `uploaded_by_user_id`
- `storage_bucket`
- `storage_path`
- `original_filename`
- `mime_type`
- `size_bytes`
- `document_hash`
- `status`
- `created_at`
- `activated_at`
- `archived_at`

Reglas candidatas:

- `storage_bucket` debe ser privado.
- `storage_path` debe incluir `organization_id`, `document_id` y `document_version_id`.
- Una version activa no se sobreescribe; reemplazar un archivo crea otra version.
- `document_hash` sirve para trazabilidad, cache controlada y futura evidencia de firma.
- Las URLs de acceso se emiten como signed URLs cortas o via ruta controlada tras comprobar permisos.

### `document_subjects`

Relaciona documentos con la persona, centro, bloque u otra entidad afectada. Permite separar "quien puede ver" de "a quien se refiere".

Campos candidatos:

- `id`
- `organization_id`
- `document_id`
- `subject_type`
- `person_profile_id`
- `center_id`
- `coach_profile_id`
- `schedule_block_id`
- `class_type_id`
- `metadata`
- `created_at`

Reglas candidatas:

- Los documentos privados de persona deben tener al menos un sujeto persona cuando afecten a alguien concreto.
- Que una persona sea sujeto del documento no concede acceso a terceros.
- Los sujetos deben pertenecer al mismo `organization_id`.

### `document_access_grants`

Define quien puede ver un documento cuando la visibilidad no es puramente global.

Campos candidatos:

- `id`
- `organization_id`
- `document_id`
- `document_version_id`
- `person_profile_id`
- `organization_membership_id`
- `role`
- `capability`
- `access_level`
- `granted_by_user_id`
- `expires_at`
- `created_at`

Valores candidatos de `access_level`:

- `read_metadata`
- `preview`
- `download`
- `manage`
- `manage_grants`

Reglas candidatas:

- Los grants pueden apuntar a persona concreta, membership concreta, rol/capacidad o combinacion limitada.
- `owner`, `admin` y `manager` no deben recibir grants implicitos para documentos `sensitive_hr` o `payroll`.
- Para nominas o retribucion se recomienda capacidad separada tipo `payroll_private_manage`.
- Los grants sobre versiones especificas pueden ser utiles si una version nueva requiere nueva aprobacion o firma.

### `document_access_events`

Auditoria candidata para documentos sensibles. E.1 solo la documenta; no crea tabla.

Campos candidatos:

- `id`
- `organization_id`
- `document_id`
- `document_version_id`
- `actor_user_id`
- `actor_person_profile_id`
- `target_person_profile_id`
- `event_type`
- `access_level`
- `result`
- `ip_address`
- `user_agent`
- `metadata`
- `created_at`

Eventos candidatos:

- lectura de metadata sensible;
- preview o descarga de archivo;
- creacion, reemplazo, archivado o borrado logico de version;
- cambio de `document_scope`, `sensitivity_level`, sujeto o grant;
- exportacion masiva;
- lectura/descarga de evidencia o snapshot de firma;
- creacion, cancelacion o resolucion de solicitud de firma.

### `profile_signatures`

Firma dibujada reutilizable por el usuario desde "Mi perfil" o "Mi cuenta". Se guarda como artefacto privado/versionado en Storage con metadata y hash.

Estado D.5: implementada como primer corte propio privado en `/app/account`, sin documentos firmables ni boton "Firmar".

Decision aplicada: firma tenant-scoped mediante `organization_id` + `person_profile_id`, porque encaja mejor con RLS, perfiles laborales y documentos por organizacion. Una firma global por usuario queda como decision abierta si mas adelante se necesita reutilizacion entre tenants.

Campos implementados:

- `id`
- `organization_id`
- `person_profile_id`
- `uploaded_by_user_id`
- `storage_bucket`
- `storage_path`
- `mime_type`
- `size_bytes`
- `width`
- `height`
- `signature_hash`
- `signature_version`
- `status`
- `metadata`
- `activated_at`
- `created_at`
- `updated_at`

Reglas implementadas:

- Cada firma pertenece a una persona del tenant.
- El usuario autenticado solo puede crear/actualizar su propia firma vinculada.
- Todos los roles pueden crear/actualizar su propia firma como capacidad personal.
- Un admin/manager no puede firmar en nombre de otra persona usando su firma guardada.
- La firma no se expone como imagen publica.
- Crear o actualizar la firma no firma ningun documento por si solo.
- La UI la presenta como firma/confirmacion interna reutilizable, no firma electronica avanzada/cualificada.
- Al firmar un documento se debe guardar un snapshot/version de la firma usada, no depender solo del perfil editable actual.
- Cambiar la firma del perfil no modifica documentos ni evidencias ya firmadas.

### `document_signature_requests`

Solicitud futura por documento/version y firmante requerido. No existe en E.1 como schema real.

Campos candidatos:

- `id`
- `organization_id`
- `document_id`
- `document_version_id`
- `person_profile_id`
- `user_id`
- `requested_by_user_id`
- `signature_status`
- `due_at`
- `voided_at`
- `voided_by_user_id`
- `metadata`
- `created_at`
- `updated_at`

Estados candidatos:

- `pending`
- `signed`
- `declined`
- `voided`
- `expired`

Reglas candidatas:

- El documento, el firmante, la firma y la solicitud deben pertenecer al mismo `organization_id`.
- Solo perfiles activos y no internos deben ser firmantes normales.
- Si el firmante todavia no tiene Auth, la solicitud queda preparada contra `person_profile_id`, pero no puede firmarse hasta vincular usuario.
- Firmar genera `document_signature_evidences`; no basta con cambiar un booleano.
- El usuario autenticado que firma debe corresponder a la persona firmante dentro del tenant.
- Si el usuario no tiene firma guardada, el flujo debe pedir crear "Mi firma" antes de continuar o permitir creacion inline segun decision UX.
- Una nueva version del documento debe invalidar o recrear las solicitudes de firma pendientes segun regla de producto.
- Un admin, manager o document admin no puede firmar por otra persona usando la firma guardada de esa persona.

### `document_signature_evidences`

Evidencia inmutable futura de una firma aplicada. Debe conservar el snapshot/version de firma usada y el documento/version concreto firmado.

Campos candidatos:

- `id`
- `organization_id`
- `document_id`
- `document_version_id`
- `signature_request_id`
- `signed_by_user_id`
- `signer_person_profile_id`
- `source_profile_signature_id`
- `source_signature_version`
- `source_signature_hash`
- `signature_snapshot_bucket`
- `signature_snapshot_path`
- `signature_snapshot_hash`
- `signed_document_bucket`
- `signed_document_path`
- `document_version_hash`
- `signed_at`
- `ip_address`
- `user_agent`
- `status`
- `metadata`
- `created_at`

Reglas candidatas:

- La evidencia debe quedar ligada a una version documental concreta.
- El snapshot de firma debe copiarse a bucket privado de evidencia; no debe depender del artefacto editable de `profile_signatures`.
- Cambiar "Mi firma" despues de firmar no altera evidencias anteriores.
- Si se modifica el documento, la evidencia previa no se aplica automaticamente a la nueva version.
- La lectura de evidencias requiere grants/capacidades explicitas y auditoria candidata.

### `coach_certifications`

Cursos, titulos y certificaciones con adjunto, fechas y estado. Pueden afectar a asignaciones futuras, pero E.1 no implementa validacion automatica.

Campos candidatos:

- `id`
- `organization_id`
- `coach_profile_id`
- `person_profile_id`
- `certification_name`
- `issuer`
- `obtained_on`
- `expires_on`
- `status`
- `document_id`
- `verified_by_user_id`
- `verified_at`
- `metadata`
- `created_at`
- `updated_at`

Reglas candidatas:

- El estado/caducidad puede ser visible para roles operativos si impacta cobertura.
- El adjunto/documento no debe ser visible por defecto para todo rol operativo.
- Una persona podria proponer/subir una certificacion propia si se decide; la verificacion queda para capacidad especifica.

### `programming_documents`

Documentos de programacion asociados a fecha, tipo de clase o bloque.

## Decisiones Pendientes De Schema

- Por ahora `schedule_blocks` representa todo el horario operativo. Si mas adelante las clases puras necesitan datos propios, se añadira una tabla dependiente tipo `class_sessions`.
- Para MVP 1, `coverage_issues` se calculara al vuelo; persistirlo queda pendiente si hace falta auditoria, notificaciones, rendimiento o workflow historico.
- Si plantillas mensuales son entidad separada o variacion de `schedule_templates`.
- E.1 propone separar `document_subjects` y `document_access_grants`; queda pendiente decidir en schema final si alguna relacion necesita tablas puente especificas por entidad.
- Alcance legal exacto de firma documental: confirmacion interna, firma electronica simple o integracion futura con proveedor especializado.
- La firma de perfil D.5 usa PNG privado; queda pendiente el formato final de snapshot de evidencia y, si procede, version firmada del documento.
- Si eventos y festivos comparten tabla `box_events` con tipo.
- Flujo completo de invitacion/registro por email para vincular `person_profiles.user_id` y, si procede, `coach_profiles.user_id` queda pendiente; el primer corte solo vincula cuentas Auth existentes por `user_id`.
- Alcance final de permisos `manager` frente a `admin` para perfiles, horarios, asignaciones y aprobaciones.
- Modelo de logo/asset privado para `organizations.theme_config.logoAssetId` o equivalente queda pendiente; B.1 no guarda URLs publicas ni sube ficheros.
- Avatar personal propio queda implementado en D.4 con `profile_assets`, bucket privado, signed URL corta y acciones propias derivadas desde sesion + tenant. "Mi firma" propia queda implementada en D.5 con `profile_signatures`, bucket privado, signed URL corta y acciones propias derivadas desde sesion + tenant. E.1 modela documentos/snapshots/auditoria como candidatos, sin implementarlos.
- Tablas especificas para contacto privado, empleo, payroll o auditoria real de datos personales/documentales quedan pendientes; no deben meterse en `person_profiles`.

## Decisiones Implementadas En MVP 1

| Decision | Implementacion |
|---|---|
| Multi-tenant por organizacion | Todas las tablas operativas tienen `organization_id`. |
| Aislamiento por RLS | Lectura para miembros activos; escritura operativa global alineada en B.2 a `owner`, `admin` y `manager`. |
| STL como tenant | STL solo aparece en `supabase/seeds/02_stl_tenant.sql`. |
| Bloque operativo como unidad minima | `schedule_blocks` y `schedule_template_blocks`. |
| Tipos de clase/actividad configurables por tenant | `class_types` con `category`, `required_coaches` y `requires_certification`. |
| Coaches multi-centro | `coach_center_assignments` permite varios centros por coach. |
| Persona visible tenant-scoped | `person_profiles` guarda nombre visible, email publico opcional, avatar, visibilidad y estado por organizacion. |
| Coach como capacidad operativa | `coach_profiles` puede depender de `person_profiles` pendiente de Auth o de `user_id` con membership existente. |
| Vinculacion de ficha pendiente con Auth real | `/app/coaches` vincula `person_profiles` + `coach_profiles` a un `user_id` existente, crea/actualiza membership del tenant y no envia invitaciones por email. |
| Asignaciones reales coach-bloque | `schedule_block_assignments` es la fuente canonica de quien cubre cada bloque real. |
| Cobertura MVP 1 al vuelo | `covered`, `uncovered`, `insufficient` y `conflict` se calculan desde bloques, asignaciones, coaches, personas y memberships. |
| Plantillas antes de calendario complejo | `schedule_templates` + `schedule_template_blocks` cubren el primer caso semanal/mensual. |
| Plantillas semanales basicas | `/app/templates` crea plantillas weekly, bloques de plantilla y aplica patrones a semanas reales sin duplicar bloques. |
| Dashboard operativo basico | `/app` calcula una cola de riesgos al vuelo y enlaza cada riesgo al bloque real en `/app/schedule`. |

## Decisiones Implementadas En Fase B.1

| Decision | Implementacion |
|---|---|
| `organizations.theme_config` como primer contenedor | Migracion `00003_organization_theme_config.sql` añade `theme_config jsonb not null default '{}'` con check de objeto JSON. |
| Ruta generica de configuracion | `/app/settings` gestiona configuracion minima del tenant activo y se enlaza desde `/app/more`. |
| Mutacion MVP restringida | En B.1 solo `admin` editaba nombre visible y acento; B.2 amplia configuracion global a `owner` manteniendo `admin` compatible. |
| Frontera tenant | Todas las lecturas y updates usan `organization_id`/`id` de la organizacion resuelta por membership activa. |
| Marca ligera, no rebranding | El acento modifica tokens `primary`, `secondary`, `accent` y sidebar dentro del shell protegido; no toca estados criticos, error ni foco. |
| Logo fuera del corte | No hay subida real ni URL publica de logo hasta definir asset/Storage privado y permisos. |

## Decisiones Implementadas En Fase B.2

| Decision | Implementacion |
|---|---|
| Helpers de permisos de app | `src/lib/auth/permissions.ts` define roles reconocidos y capacidades reutilizables: configuracion global, gestion operativa, accesos, fichas operativas, lectura y funciones personales futuras. |
| `admin` compatible | `admin` conserva configuracion, accesos y toda la operativa MVP 1 para no romper smoke ni uso existente. |
| `owner` alto | `owner` puede resolver organizacion activa, editar `/app/settings`, gestionar accesos y operar MVP 1. |
| `manager` operativo | `manager` puede gestionar centros, tipos, horario, cobertura, plantillas y fichas operativas de coach, pero no `organizations`, altas de membership, roles ni vinculaciones de cuenta. |
| `coach` lectura | `coach` conserva lectura operativa y "Mi horario" sin nuevas mutaciones. |
| Roles futuros conservados | `staff`, `center_manager`, `document_admin` y `payroll_manager` son reconocidos para resolver memberships existentes, pero no reciben permisos especializados ni controles grandes. |
| RLS alineada | `00004_app_role_permission_alignment.sql` retira `center_manager` de escrituras globales hasta modelar permisos por centro. |
| Sin permisos RRHH/documentos | B.2 no concede acceso a salario, nominas, documentos, firmas, fichaje, geolocalizacion, cambios ni ausencias. |

## Decisiones Implementadas En Fase C

| Decision | Implementacion |
|---|---|
| Reset sin enumeracion | `/forgot-password` siempre muestra respuesta generica, incluso si Supabase devuelve error o el email no existe. |
| Callback SSR reutilizado | `/auth/callback` acepta `next=/reset-password`, intercambia el `code` por sesion y deriva errores de recovery a la pantalla de reset. |
| Regla minima centralizada | `src/lib/auth/password-policy.ts` define minimo 8 caracteres, al menos una letra y un numero; la UI y Server Action consumen el mismo helper. |
| Auth como fuente de verdad | La misma regla debe configurarse en Supabase Auth; la app solo duplica la validacion para feedback y defensa server-side. |
| Sesion temporal | Tras `updateUser({ password })`, la app ejecuta sign out y vuelve a `/login?status=password-updated`. |
| Rate limits primero | No hay tabla propia de intentos en Fase C. Se usan rate limits de Supabase Auth; Password Verification Hook queda para cooldown propio o avisos de intentos restantes. |

## Decisiones Implementadas En Fase D.1

| Decision | Implementacion |
|---|---|
| Ruta personal propia | `/app/account` queda bajo el shell protegido y accesible para roles reconocidos con membership activa. |
| Sin migracion nueva | D.1 reutiliza `person_profiles`, `organization_memberships` y `coach_profiles`; no crea tablas RRHH ni Storage. |
| Edicion solo propia | La Server Action busca `person_profiles` por `organization_id` + `auth.uid()`; no acepta IDs de otra persona desde el formulario. |
| Datos seguros MVP | Se editan `display_name`, `preferred_alias` y `public_email`; Auth email queda en lectura y avatar queda pendiente. |
| Perfil de coach separado | Mi cuenta muestra ficha de coach propia en lectura; la gestion de fichas sigue en Equipo segun permisos B.2. |
| RRHH sensible fuera | Salario, contrato, jornada legal, documentos, nominas, datos bancarios, fichaje y geolocalizacion no se modelan ni se exponen en D.1. |
| Mi firma futura | Se documenta como capacidad tenant-scoped y privada, sin canvas, bucket ni firma documental todavia. |

## Decisiones Implementadas En Fase D.2

| Decision | Implementacion |
|---|---|
| Docs antes de Storage | D.2 no toca `src`, migraciones, bucket ni UI; cierra documentacion de permisos antes de avatar/firma real. |
| Matriz por campo | `docs/architecture/personal-data-permissions.md` separa perfil visible, assets personales, ficha operativa, RRHH sensible, payroll, documentos privados, firma y auditoria. |
| `person_profiles` acotado | Sigue siendo identidad visible operativa; no se usara para salario, contratos, nominas, datos bancarios, fichaje, geolocalizacion ni documentos privados. |
| Roles altos no bastan | `owner`, `admin` y `manager` no heredan acceso automatico a datos laborales sensibles ni evidencias de firma. |
| Avatar bloqueado | Avatar real queda pendiente de asset privado tenant-scoped, RLS, signed URL/ruta controlada y reglas de reemplazo. |
| Firma bloqueada en D.2 | En D.2 quedo pendiente de `profile_signatures`, artefacto privado, hash/version y acciones propias derivadas de sesion; D.5 la implementa sin documentos firmables. |
| Sin firma por delegacion | Ningun rol puede crear, actualizar o usar la firma guardada de otra persona para firmar en su nombre. |

## Decisiones Implementadas En Fase D.3

| Decision | Implementacion |
|---|---|
| Avatar como asset privado | D.3 modela `profile_assets` como tabla candidata futura para avatar tenant-scoped; no crea migracion, bucket ni UI. |
| Sin URL publica libre | `person_profiles.avatar_url` no debe guardar una URL publica persistente; se conserva solo como legado/display cache interno o se sustituira por una FK futura. |
| Accion propia derivada | La subida futura desde Mi cuenta debe resolver `person_profile_id` con `organization_id` + `auth.uid()`, sin aceptar IDs de otra persona desde el cliente. |
| Lectura controlada | El avatar futuro debe servirse por ruta controlada o signed URL corta tras comprobar membership activa, tenant y visibilidad del perfil. |
| Sin reemplazo ajeno por rol alto | `owner`, `admin` y `manager` no pueden reemplazar avatar ajeno por herencia automatica; haria falta permiso especifico y auditoria. |
| Frontera intacta | D.3 no abre firma, documentos, nominas, contratos, salario, fichaje, geolocalizacion, cambios ni ausencias. |

## Decisiones Implementadas En Fase D.4

| Decision | Implementacion |
|---|---|
| Avatar propio real | `/app/account` permite subir o reemplazar solo el avatar de la persona vinculada al usuario autenticado. |
| Metadata tenant-scoped | `profile_assets` guarda `organization_id`, `person_profile_id`, `asset_type`, `uploaded_by_user_id`, ruta interna, MIME, tamano, hash, estado y timestamps. |
| Bucket privado desde el inicio | `profile-assets` se crea con `public = false`, MIME cerrados y limite de 2 MB. |
| Sin URL publica persistente | `person_profiles.avatar_url` no se escribe; la preview usa signed URL corta emitida al render. |
| Persona derivada | Las RPCs derivan la persona con `auth.uid()` + `organization_id`; el formulario no envia `person_profile_id`. |
| Reemplazo no destructivo | El avatar nuevo empieza `pending`, se activa tras confirmar objeto en Storage y el anterior pasa a `replaced`. |
| Sin avatar ajeno | D.4 no permite a `owner`, `admin` ni `manager` reemplazar avatar de otra persona. |
| Frontera intacta | D.4 no abre firma, documentos, nominas, contratos, salario, fichaje, geolocalizacion, cambios ni ausencias. |

## Decisiones Implementadas En Fase D.5

| Decision | Implementacion |
|---|---|
| Firma propia real | `/app/account` permite dibujar, limpiar y guardar/reemplazar solo la firma de la persona vinculada al usuario autenticado. |
| Metadata tenant-scoped | `profile_signatures` guarda `organization_id`, `person_profile_id`, `uploaded_by_user_id`, ruta interna, MIME, tamano, dimensiones, hash, version, estado y timestamps. |
| Bucket privado separado | `profile-signatures` se crea con `public = false`, MIME `image/png` y limite de 512 KB. |
| Sin URL publica persistente | La preview usa signed URL corta emitida al render; no se guarda URL publica libre. |
| Persona derivada | Las RPCs derivan la persona con `auth.uid()` + `organization_id`; el formulario no envia `person_profile_id`. |
| Reemplazo versionado | La firma nueva empieza `pending`, se activa tras confirmar objeto en Storage y la anterior pasa a `replaced` con `signature_version` incremental. |
| Sin firma ajena | D.5 no permite a `owner`, `admin` ni `manager` crear, reemplazar o usar firma de otra persona. |
| Sin firma documental | D.5 no crea documentos firmables, boton "Firmar", snapshots ni evidencias de firma aplicada. |
| Frontera intacta | D.5 no abre documentos, nominas, contratos, salario, fichaje, geolocalizacion, cambios ni ausencias. |

## Decisiones Documentadas En Fase E.1

| Decision | Documentacion |
|---|---|
| Docs antes de schema | E.1 no crea migraciones, buckets, UI ni flujos; solo cierra modelo candidato. |
| Documento dividido | `documents`, `document_versions`, `document_subjects`, `document_access_grants` y `document_access_events` separan cabecera, archivo, sujetos, permisos y auditoria. |
| Storage privado candidato | `document-files` y `document-signature-evidence` son buckets privados candidatos con rutas que incluyen `organization_id`. |
| Roles altos no bastan | `owner`, `admin` y `manager` no ven nominas, contratos, adjuntos privados ni evidencias por herencia automatica. |
| Certificaciones separadas | `coach_certifications` puede exponer estado/caducidad operativa, pero el adjunto documental sigue protegido. |
| Mi firma separada | `profile_signatures` no firma documentos; "Firmar documento" sera una accion futura sobre `document_versions`. |
| Evidencia futura | `document_signature_evidences` debe guardar snapshot/version de firma, hash/version documental y contexto de firma. |
| Sin firma por delegacion | Ningun rol autorizado firma por otra persona usando su firma guardada. |

## Decisiones Implementadas En Task 010

| Decision | Implementacion |
|---|---|
| Sin migracion nueva | El schema existente ya tenia `schedule_block_assignments` con tenant, FK y unicidad necesarias. |
| Ruta de asignacion | `/app/schedule` permite asignar y retirar coaches por bloque sin crear dashboard. |
| Nombre visible | Las asignaciones muestran `person_profiles.display_name`; si falta perfil visible se usa fallback tecnico corto. |
| Perfiles internos excluidos | `visibility_status = internal` no aparece como coach asignable y no se puede asignar desde la action. |
| Compatibilidad Auth pendiente | Coaches con `person_profile_id` y `user_id = null` pueden cubrir bloques si la persona esta activa y visible. |
| Compatibilidad Auth existente | Coaches con `user_id` cuentan y pueden asignarse solo si su membership del tenant sigue activa. |
| Retirada sin borrado | Retirar cambia `assignment_status` a `removed`; reasignar reactiva esa fila. |
| Conflicto como riesgo | Los solapamientos no bloquean guardar; se muestran como `conflict` calculado. |
| Permisos MVP | Tras B.2, `owner`, `admin` y `manager` mutan asignaciones operativas tenant-wide; `coach` conserva lectura. |

## Decisiones Implementadas En Task 011

| Decision | Implementacion |
|---|---|
| Filtros como estado de URL | `/app/schedule` conserva `organizationId`, `week`, `center_id`, `coach_profile_id`, `class_type_id`, `block_status`, `coverage_state` y `risks_only` en query string. |
| Sin migracion nueva | Los filtros usan `schedule_blocks`, `schedule_block_assignments`, `centers`, `class_types`, `coach_profiles` y la cobertura calculada existente. |
| Validacion tenant-scoped | Los IDs de centro, coach y tipo recibidos por URL se aplican solo si pertenecen a la organizacion activa; si no, se ignoran. |
| Coach asignado canonico | El filtro por coach se basa en `schedule_block_assignments.assignment_status = 'assigned'`, no en campos derivados ni en copy visible. |
| Riesgos activos | `risks_only=1` filtra `uncovered`, `insufficient` y `conflict`; `cancelled` y `completed` quedan fuera al ser cobertura `inactive`, aunque siguen disponibles por `block_status`. |
| Permisos B.2 | `owner`, `admin` y `manager` usan los filtros con capacidad operativa; `coach` consulta en lectura. |

## Decisiones Implementadas En Task 012

| Decision | Implementacion |
|---|---|
| Mi horario como filtro | `/app/schedule` acepta `mine=1` junto a `organizationId`, `week` y el resto de filtros compartibles. |
| Sin migracion nueva | Se reutilizan `coach_profiles.user_id`, `coach_profiles.person_profile_id`, `person_profiles.user_id` y `schedule_block_assignments`. |
| Resolucion tenant-scoped | El perfil de "Mi horario" se resuelve solo dentro del tenant activo y nunca desde datos de otra organizacion. |
| Fuente canonica | Un bloque pertenece a "Mi horario" solo si hay una fila `schedule_block_assignments` con `assignment_status = 'assigned'` para el `coach_profile` resuelto. |
| Fallback seguro | Si el usuario no tiene `coach_profile`, o tiene multiples perfiles inesperados en el tenant activo, no se elige uno automaticamente y se muestra estado vacio explicativo. |
| Interseccion de filtros | `mine=1` se combina con centro, coach, tipo, estado, cobertura y riesgos; no reemplaza `coach_profile_id`. |
| Permisos B.2 | `owner`, `admin` y `manager` conservan gestion operativa de horario/asignaciones; `coach` consulta en modo lectura. |

## Decisiones Implementadas En Task 013

| Decision | Implementacion |
|---|---|
| Ruta de plantillas | `/app/templates` gestiona plantillas semanales del tenant activo. |
| Sin migracion nueva | El schema existente ya tenia `schedule_templates`, `schedule_template_blocks`, `template_id`, `template_block_id` e `is_template_exception`. |
| Weekly primero | La UI filtra y crea `template_type = 'weekly'`; mensual queda fuera del corte. |
| Vacantes permitidas | `default_coach_profile_id = null` representa bloque de plantilla sin coach por defecto. |
| Coach por defecto validado | Si se guarda o aplica un coach por defecto, debe ser asignable dentro del tenant: perfil activo, persona visible y membership activa si hay Auth. |
| Aplicacion a semana | Aplicar una plantilla activa crea `schedule_blocks` para la semana destino y asignaciones `source = 'template'` cuando existe coach por defecto. |
| Duplicados evitados | La aplicacion no crea otro bloque si ya existe el mismo `template_block_id` en la misma `service_date` para esa plantilla. |
| Excepciones de plantilla | Editar o cancelar un bloque aplicado desde plantilla marca `is_template_exception = true`. |
| Sin borrado desde UI | Las plantillas se archivan con `status = 'archived'`; los bloques de plantilla se editan, pero no se borran desde esta UI. |
| Permisos B.2 | `owner`, `admin` y `manager` gestionan plantillas; `coach` consulta en modo lectura. |

## Decision De Fixture Interno Fase A 2026-05-07

`supabase/snippets/stl-internal-assignment-sample-2026-05-04.sql` carga una muestra representativa para QA interno sobre la semana base de STL. No es seed automatico ni import de produccion.

| Decision | Implementacion |
|---|---|
| Datos fuera de `src` | La muestra vive en `supabase/snippets/`; no hay nombres ni reglas STL en codigo de producto. |
| Sin cuentas inventadas | El snippet no crea usuarios Auth ni envia invitaciones. Si el usuario E2E coach local existe, lo vincula a una ficha operativa existente para probar "Mi horario". |
| Asignaciones editables | Las filas de `schedule_block_assignments` usan `source = 'import'`, porque el enum actual no tiene un valor `sample`. |
| Plantilla mixta | La plantilla queda con 20 bloques con `default_coach_profile_id` y 145 vacantes, suficiente para probar defaults y huecos reales. |
| Cobertura representativa | La semana queda con bloques cubiertos, vacantes, un caso `insufficient` y un conflicto deliberado por coach solapado. |
| Validacion oficial pendiente | La muestra desbloquea smoke interno; centro por bloque y asignaciones oficiales siguen pendientes de revision STL antes de produccion. |

## Decisiones Implementadas En Task 014

| Decision | Implementacion |
|---|---|
| Dashboard en inicio protegido | `/app` deja de ser solo inicio tecnico y muestra el dashboard operativo basico de cobertura. |
| Sin persistencia de incidencias | No se crea `coverage_issues`; la cola usa el calculo al vuelo de MVP 1. |
| Cola accionable | Los riesgos se ordenan por `uncovered`, `conflict` e `insufficient`. |
| Enlace al bloque real | Cada riesgo enlaza a `/app/schedule?...&block_id={id}` dentro de la semana y tenant activos. |
| Vistas de apoyo por centro | El dashboard crea atajos filtrados a `/app/schedule` conservando `organizationId` y `week`. |
| Roles MVP | Tras B.2, `owner`, `admin` y `manager` ven dashboard operativo; `coach` conserva lectura segura y accesos a Mi horario/plantillas. |
| Permisos B.2 | `manager` queda limitado a operativa MVP 1, sin configuracion global ni accesos. |

## Decisiones Implementadas En Task 009

| Decision | Implementacion |
|---|---|
| Perfil visible definitivo | Se elige `person_profiles` como tabla tenant-scoped. |
| Personas pendientes de Auth | `person_profiles.user_id` es opcional y se vincula a una membership del tenant cuando exista. |
| Nombre visible | `display_name` es obligatorio; `full_name` y `preferred_alias` son opcionales. |
| Email publico controlado | `public_email` es opcional y puede quedar `null` hasta invitacion/registro. |
| Perfiles tecnicos internos | `visibility_status = internal` oculta perfiles de la lectura normal de miembros. |
| Capacidad de coach pendiente de Auth | `coach_profiles.person_profile_id` permite crear perfiles operativos sin `auth.users`. |
| Compatibilidad Auth actual | `coach_profiles.user_id` sigue existiendo y el flujo actual de `/app/coaches` se conserva. |
| Permisos de manager | Tras B.2, `manager` cubre operativa MVP 1 tenant-wide; permisos por centro, RRHH y documentos siguen fuera. |

## Decisiones Implementadas En Task 005

| Decision | Implementacion |
|---|---|
| Ruta operativa inicial | `/app/coaches` gestiona usuarios/coaches basicos bajo tenant activo. |
| Membership como fuente de acceso | La UI crea y edita `organization_memberships` con rol y estado; no borra filas. |
| Alta minima por Auth UUID | Sin tabla publica de perfil de usuario ni lectura de `auth.users`, el admin trabaja con `user_id` existente de Supabase Auth. |
| Perfil operativo separado | `coach_profiles` guarda centro principal, horas semanales, estado y notas sin mezclarlo con rol de acceso. |
| Multi-centro fuera del corte | `coach_center_assignments` queda modelado, pero no se expone hasta que horarios/cobertura lo necesiten. |

## Decisiones Implementadas En Task 006

| Decision | Implementacion |
|---|---|
| Ruta de catalogo | `/app/class-types` gestiona tipos de clase/actividad del tenant activo. |
| Sin migracion nueva | `class_types` ya soporta nombre, slug, categoria, coaches necesarios, certificacion, color y estado. |
| Catalogo por tenant | Todas las queries y mutaciones filtran por `organization_id`. |
| Color opcional | La app acepta color hexadecimal `#rrggbb`; no se impone paleta cerrada todavia. |
| Sin relacion por centro | Los tipos se mantienen a nivel organizacion hasta que horarios/bloques demuestren otra necesidad. |
| Sin borrado desde UI | Los tipos se activan/desactivan con `status` para preservar referencias futuras. |

## Decisiones Implementadas En Task 007

| Decision | Implementacion |
|---|---|
| Ruta de horario semanal | `/app/schedule` gestiona bloques operativos reales del tenant en una semana concreta. |
| Sin migracion nueva | `schedule_blocks` ya soporta centro, tipo, fecha, horas, coaches necesarios, estado y notas. |
| Semana por query string | `week=YYYY-MM-DD` se normaliza al lunes de esa semana; la query filtra `service_date` entre lunes y domingo. |
| Bloque operativo, no clase pura | La UI usa copy de bloque/actividad para mantener abierto recepcion, evento, competicion u otras tareas. |
| Cancelacion sin borrado | Cancelar cambia `status` a `cancelled`; no se borran bloques desde UI. |
| Asignaciones fuera del corte | `schedule_block_assignments` quedo fuera de Task 007 y se implemento despues en Task 010. |
