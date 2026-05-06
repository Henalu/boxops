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
- `created_at`

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

Roles MVP: `admin`, `coach`.

Roles futuros: `owner`, `manager`, `center_manager`, `document_admin`, `payroll_manager`.

Decision de rol operativo tras validacion STL 2026-04-30:

- `admin` debe representar administracion completa del tenant.
- `manager` es el nombre recomendado para el rol de gestion operativa: horarios, cobertura, asignaciones, plantillas y aprobaciones de cambios.
- `manager` no debe implicar por defecto billing, configuracion global, permisos avanzados ni administracion completa de usuarios.
- La app actual todavia solo aplica `admin` y `coach`; activar `manager` en producto requiere tarea explicita de permisos, UI y RLS/app checks.

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

Decision aplicada tras validacion STL 2026-04-30:

- No crear cuentas Auth reales para coaches sin que ellos elijan o acepten su email.
- Preparar personas/coaches operativos antes de vincularlos a Auth.
- El usuario tecnico interno puede tener Auth y membership admin, pero su perfil visible debe quedar oculto del equipo operativo.
- `manager` no recibe permisos completos sobre perfiles en esta migracion; se definira como rol operativo cuando se implemente gestion de horarios/asignaciones/aprobaciones.

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

### `documents`

Documento generico con frontera de organizacion y visibilidad explicita. No debe depender de rutas o reglas del primer tenant.

Campos candidatos:

- `id`
- `organization_id`
- `uploaded_by_user_id`
- `title`
- `document_type`
- `storage_path`
- `visibility_scope`
- `requires_signature`
- `status`
- `metadata`
- `created_at`
- `updated_at`

Valores candidatos de `visibility_scope`:

- `team_public`: documento publico para miembros activos del equipo, segun permisos.
- `management_private`: documento de gestion/admin, visible solo para `admin` en el primer corte.
- `member_private`: documento particular de una o varias personas, visible para esas personas y roles autorizados.
- `programming`: documento/enlace de programacion asociado a fecha, tipo de clase o bloque.

Owners/asociaciones candidatas:

- organizacion
- centro
- persona/miembro
- coach
- evento
- bloque horario
- tipo de clase

### `document_audiences`

Define quien puede ver un documento cuando la visibilidad no es puramente global.

Campos candidatos:

- `id`
- `organization_id`
- `document_id`
- `person_profile_id`
- `organization_membership_id`
- `role`
- `access_level`
- `created_at`

### `profile_signatures`

Firma dibujada reutilizable por el usuario desde "Mi perfil" o "Mi cuenta". Debe guardarse como artefacto privado/versionado, preferiblemente en Storage con metadata y hash.

Decision recomendada para el primer corte: firma tenant-scoped mediante `organization_id` + `person_profile_id`, porque encaja mejor con RLS, perfiles laborales y documentos por organizacion. Una firma global por usuario queda como decision abierta si mas adelante se necesita reutilizacion entre tenants.

Campos candidatos:

- `id`
- `organization_id`
- `person_profile_id`
- `user_id`
- `storage_path`
- `signature_hash`
- `signature_version`
- `status`
- `created_at`
- `updated_at`

Reglas candidatas:

- Cada firma pertenece a una persona del tenant.
- El usuario autenticado solo puede crear/actualizar su propia firma vinculada.
- Todos los roles pueden crear/actualizar su propia firma como capacidad personal.
- Un admin/manager no puede firmar en nombre de otra persona usando su firma guardada.
- La firma no se expone como imagen publica.
- Crear o actualizar la firma no firma ningun documento por si solo.
- Al firmar un documento se debe guardar un snapshot/version de la firma usada, no depender solo del perfil editable actual.
- Cambiar la firma del perfil no modifica documentos ni evidencias ya firmadas.

### `document_signature_requests`

Fila por documento y firmante requerido.

Campos candidatos:

- `id`
- `organization_id`
- `document_id`
- `person_profile_id`
- `user_id`
- `requested_by_user_id`
- `signature_status`
- `signed_at`
- `signed_by_user_id`
- `signature_snapshot_path`
- `signature_snapshot_hash`
- `signed_document_path`
- `document_version_hash`
- `ip_address`
- `user_agent`
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
- Firmar genera evidencia/version firmada; no basta con cambiar un booleano.
- El usuario autenticado que firma debe corresponder a la persona firmante dentro del tenant.
- Si el usuario no tiene firma guardada, el flujo debe pedir crear "Mi firma" antes de continuar o permitir creacion inline segun decision UX.
- Una nueva version del documento debe invalidar o recrear las solicitudes de firma pendientes segun regla de producto.

### `coach_certifications`

Cursos, titulos y certificaciones con adjunto, fechas y estado.

### `programming_documents`

Documentos de programacion asociados a fecha, tipo de clase o bloque.

## Decisiones Pendientes De Schema

- Por ahora `schedule_blocks` representa todo el horario operativo. Si mas adelante las clases puras necesitan datos propios, se añadira una tabla dependiente tipo `class_sessions`.
- Para MVP 1, `coverage_issues` se calculara al vuelo; persistirlo queda pendiente si hace falta auditoria, notificaciones, rendimiento o workflow historico.
- Si plantillas mensuales son entidad separada o variacion de `schedule_templates`.
- Si documentos usan owner polimorfico, tablas puente por tipo o una combinacion de `document_audiences` y tablas especificas.
- Alcance legal exacto de firma documental: confirmacion interna, firma electronica simple o integracion futura con proveedor especializado.
- Formato tecnico de firma dibujada: SVG/PNG, Storage privado, hash, snapshot por firma y version firmada del documento.
- Si eventos y festivos comparten tabla `box_events` con tipo.
- Flujo exacto de invitacion/registro para vincular `person_profiles.user_id` y, si procede, `coach_profiles.user_id`.
- Alcance final de permisos `manager` frente a `admin` para perfiles, horarios, asignaciones y aprobaciones.

## Decisiones Implementadas En MVP 1

| Decision | Implementacion |
|---|---|
| Multi-tenant por organizacion | Todas las tablas operativas tienen `organization_id`. |
| Aislamiento por RLS | Lectura para miembros activos; escritura para roles `owner`, `admin`, `manager` y `center_manager`. |
| STL como tenant | STL solo aparece en `supabase/seeds/02_stl_tenant.sql`. |
| Bloque operativo como unidad minima | `schedule_blocks` y `schedule_template_blocks`. |
| Tipos de clase/actividad configurables por tenant | `class_types` con `category`, `required_coaches` y `requires_certification`. |
| Coaches multi-centro | `coach_center_assignments` permite varios centros por coach. |
| Persona visible tenant-scoped | `person_profiles` guarda nombre visible, email publico opcional, avatar, visibilidad y estado por organizacion. |
| Coach como capacidad operativa | `coach_profiles` puede depender de `person_profiles` pendiente de Auth o de `user_id` con membership existente. |
| Asignaciones reales coach-bloque | `schedule_block_assignments` es la fuente canonica de quien cubre cada bloque real. |
| Cobertura MVP 1 al vuelo | `covered`, `uncovered`, `insufficient` y `conflict` se calculan desde bloques, asignaciones, coaches, personas y memberships. |
| Plantillas antes de calendario complejo | `schedule_templates` + `schedule_template_blocks` cubren el primer caso semanal/mensual. |
| Plantillas semanales basicas | `/app/templates` crea plantillas weekly, bloques de plantilla y aplica patrones a semanas reales sin duplicar bloques. |
| Dashboard admin basico | `/app` calcula una cola de riesgos al vuelo y enlaza cada riesgo al bloque real en `/app/schedule`. |

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
| Permisos MVP | Solo `admin` muta asignaciones; `manager` queda para una tarea posterior con permisos operativos acotados. |

## Decisiones Implementadas En Task 011

| Decision | Implementacion |
|---|---|
| Filtros como estado de URL | `/app/schedule` conserva `organizationId`, `week`, `center_id`, `coach_profile_id`, `class_type_id`, `block_status`, `coverage_state` y `risks_only` en query string. |
| Sin migracion nueva | Los filtros usan `schedule_blocks`, `schedule_block_assignments`, `centers`, `class_types`, `coach_profiles` y la cobertura calculada existente. |
| Validacion tenant-scoped | Los IDs de centro, coach y tipo recibidos por URL se aplican solo si pertenecen a la organizacion activa; si no, se ignoran. |
| Coach asignado canonico | El filtro por coach se basa en `schedule_block_assignments.assignment_status = 'assigned'`, no en campos derivados ni en copy visible. |
| Riesgos activos | `risks_only=1` filtra `uncovered`, `insufficient` y `conflict`; `cancelled` y `completed` quedan fuera al ser cobertura `inactive`, aunque siguen disponibles por `block_status`. |
| Permisos sin ampliar | Task 011 no da permisos a `manager`; su entrada sigue pendiente de una tarea explicita de app/RLS. |

## Decisiones Implementadas En Task 012

| Decision | Implementacion |
|---|---|
| Mi horario como filtro | `/app/schedule` acepta `mine=1` junto a `organizationId`, `week` y el resto de filtros compartibles. |
| Sin migracion nueva | Se reutilizan `coach_profiles.user_id`, `coach_profiles.person_profile_id`, `person_profiles.user_id` y `schedule_block_assignments`. |
| Resolucion tenant-scoped | El perfil de "Mi horario" se resuelve solo dentro del tenant activo y nunca desde datos de otra organizacion. |
| Fuente canonica | Un bloque pertenece a "Mi horario" solo si hay una fila `schedule_block_assignments` con `assignment_status = 'assigned'` para el `coach_profile` resuelto. |
| Fallback seguro | Si el usuario no tiene `coach_profile`, o tiene multiples perfiles inesperados en el tenant activo, no se elige uno automaticamente y se muestra estado vacio explicativo. |
| Interseccion de filtros | `mine=1` se combina con centro, coach, tipo, estado, cobertura y riesgos; no reemplaza `coach_profile_id`. |
| Permisos sin ampliar | `admin` conserva gestion completa de horario/asignaciones y `coach` consulta en modo lectura; `manager` sigue pendiente de una tarea explicita de permisos app/RLS. |

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
| Permisos sin ampliar | `admin` gestiona plantillas; `coach` consulta en modo lectura; `manager` sigue pendiente de tarea explicita. |

## Decisiones Implementadas En Task 014

| Decision | Implementacion |
|---|---|
| Dashboard en inicio protegido | `/app` deja de ser solo inicio tecnico y muestra el dashboard admin basico de cobertura. |
| Sin persistencia de incidencias | No se crea `coverage_issues`; la cola usa el calculo al vuelo de MVP 1. |
| Cola accionable | Los riesgos se ordenan por `uncovered`, `conflict` e `insufficient`. |
| Enlace al bloque real | Cada riesgo enlaza a `/app/schedule?...&block_id={id}` dentro de la semana y tenant activos. |
| Vistas de apoyo por centro | El dashboard crea atajos filtrados a `/app/schedule` conservando `organizationId` y `week`. |
| Roles MVP | `admin` ve dashboard; `coach` conserva lectura segura y accesos a Mi horario/plantillas. |
| Permisos sin ampliar | `manager` sigue pendiente de tarea explicita de permisos app/RLS. |

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
| Permisos de manager | No se asumen permisos completos; queda para tarea explicita de horarios/asignaciones/aprobaciones. |

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
