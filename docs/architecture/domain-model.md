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

### Seguridad Transversal

La frontera de tenant no es solo una decision de modelo: es un control de seguridad. Cualquier entidad nueva debe pasar por `docs/architecture/security-baseline.md` antes de implementarse si toca datos de organizacion, datos personales, documentos, firmas, fichaje, ubicacion o auditoria.

Reglas base:

- `organization_id` obligatorio en datos tenant-scoped;
- permisos derivados de membership/capacidad, no de UI;
- Server Actions/API revalidan sesion, tenant y permiso;
- RLS vuelve a cerrar lectura y escritura en base de datos;
- IDs recibidos del cliente se verifican dentro de la organizacion activa;
- acciones personales derivan persona desde `auth.uid()` + `organization_id` cuando sea posible;
- archivos privados no se sirven como URLs publicas persistentes.

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
- `time_tracking_config`
- `created_at`

Fase B.1 implementa `theme_config jsonb not null default '{}'` en `supabase/migrations/00003_organization_theme_config.sql`.
Fase F.8 implementa `time_tracking_config jsonb not null default '{"version":1,"correctionApprovalRequired":false}'` en `supabase/migrations/00013_time_correction_policy.sql`; `00014_time_correction_direct_punch_policy.sql` ajusta el trigger de punches para permitir solo la aplicacion directa propia cuando el tenant no exige aprobacion, `00015_time_tracking_config_owner_guard.sql` abre el primer guard propietario y `00017_time_tracking_settings_management_policy.sql` permite que `owner`, `admin` y `manager` cambien solo la configuracion de fichaje mediante RPC acotada.

Primer corte soportado:

- `version`
- `accentColor`

Reglas B.1:

- `theme_config` debe ser un objeto JSON.
- `accentColor`, si existe, se valida como hexadecimal `#rrggbb`.
- La app aplica el color principal solo como marca ligera y mantiene estados criticos, error y foco con colores base de producto.
- Tras B.2, `owner` y `admin` mutan configuracion global; `coach`, `manager` y roles especializados consultan sin editar.
- Logo real queda pendiente hasta modelar asset/Storage privado y permisos.

Reglas F.8:

- `time_tracking_config` debe ser un objeto JSON.
- `correctionApprovalRequired = false` es el valor por defecto: las correcciones propias se aplican directamente mediante RPC trazada.
- Solo `owner` puede cambiar esta politica desde `/app/settings` y desde DB; `admin` conserva configuracion visual compatible, pero no cambia esta decision de fichaje.
- Si `correctionApprovalRequired = true`, `/app/time` usa el flujo de solicitud pendiente, revision y aplicacion explicita de F.6/F.7.

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

Nomenclatura visible desde 2026-05-11:

- `owner` se muestra como "Propietario".
- `admin` se muestra como "Administrador"; no debe aparecer como "Admin compatible" en UI.
- `manager` se muestra como "Responsable"; no debe aparecer como "Manager operativo" salvo explicacion tecnica.
- `coach` se muestra como "Entrenador".
- Los identificadores internos permanecen en ingles para no romper permisos, RLS, migraciones, rutas ni Server Actions existentes.

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
- Matiz 2026-05-23: el producto admite un segundo camino administrado tipo ServiceNow para crear cuentas Auth directas con contrasena temporal. Ese flujo queda marcado con cambio obligatorio de contrasena en primer login y requiere Auth Admin server-only; no sustituye la invitacion como camino sin contrasena compartida.

Flujo implementado en Fase A 2026-05-07:

- `/app/coaches` permite a `admin` vincular una ficha operativa pendiente con una cuenta Auth real existente mediante `user_id`.
- El flujo no crea usuarios Auth ni envia emails. Supabase Auth Admin/invite queda fuera de este corte porque requeriria service role o configuracion server-side no presente en la app actual.
- Antes de vincular, la app valida que la persona pertenece al mismo `organization_id`, esta activa y no es `visibility_status = internal`.
- La vinculacion crea o actualiza `organization_memberships` dentro del mismo tenant, rellena `person_profiles.user_id` y rellena `coach_profiles.user_id` conservando `coach_profiles.person_profile_id`.
- No se permite reutilizar el mismo `user_id` si ya esta vinculado a otra persona o ficha de coach del tenant.
- La propia membership del admin no se degrada ni suspende desde este flujo.
- Tras B.2, `owner`/`admin` pueden vincular cuentas y gestionar memberships; `manager` puede ajustar fichas operativas de coach, pero no altas, roles ni vinculaciones de cuenta. `coach` conserva lectura.
- Tras UX.7, la vinculacion manual deja de ser una accion principal visible para altas nuevas: las altas normales son invitacion por email o creacion directa de cuenta.

Flujo implementado en Fase D.1 2026-05-07:

- `/app/account` resuelve usuario autenticado, memberships activas y organizacion activa igual que el resto del shell protegido.
- Todos los roles reconocidos con membership activa pueden abrir su propia area personal mediante `canUsePersonalFeatures`.
- La pantalla muestra cuenta/Auth en lectura y no permite cambiar el email Auth desde BoxOps.
- La Server Action de perfil no recibe `person_profile_id`; busca el perfil propio por `organization_id` + `auth.uid()` y actualiza solo campos visibles seguros.
- Si la cuenta no tiene `person_profiles.user_id` vinculado, la UI muestra estado pendiente y no crea personas ni invitaciones.
- El perfil de coach propio se muestra en lectura para separar capacidad operativa de datos de cuenta.
- D.4 implementa avatar propio privado y D.5 implementa "Mi firma" propia privada. No hay avatar ajeno, documentos firmables ni RRHH sensible.

Flujo implementado en B.3 2026-05-12:

- `/app/coaches` usa invitaciones por email como flujo normal de alta. Los UUIDs de Auth quedan en herramientas avanzadas/debug.
- `owner`/`admin` crean una invitacion introduciendo email, rol, estado inicial y una ficha pendiente o nueva.
- La invitacion no guarda el token en claro: guarda `token_hash` y envia el enlace por email mediante proveedor transaccional configurado en servidor.
- `/invite/accept` permite aceptar con sesion existente o crear cuenta con contrasena. La aceptacion exige que el email Auth coincida con el email de la invitacion.
- La RPC `accept_team_invitation(...)` crea o actualiza `organization_memberships`, vincula `person_profiles.user_id` y, si procede, `coach_profiles.user_id`.
- No se introduce `service_role` en `src`; la vinculacion sensible vive en RPC `SECURITY DEFINER` con token, email, tenant y conflictos validados.

Flujo directo implementado 2026-05-23:

- `/app/coaches` ofrece una segunda alta: crear una cuenta Auth directa con email, contrasena temporal, rol, estado inicial, persona visible y ficha operativa.
- La creacion directa requiere `SUPABASE_SERVICE_ROLE_KEY` solo en servidor y queda centralizada en `src/lib/supabase/admin.ts`; no debe importarse desde componentes cliente.
- La cuenta Auth se crea con email confirmado y `app_metadata.boxops_password_change_required = true`.
- Login, proxy y layout protegido bloquean `/app` mientras esa marca siga activa y envian a `/reset-password?reason=first-login`.
- Al guardar la nueva contrasena, la app actualiza la contrasena con la sesion del usuario y limpia la marca con Auth Admin antes de cerrar sesion.
- La invitacion por email sigue siendo el camino sin contrasena compartida; la creacion directa queda para el flujo tipo ServiceNow donde un admin entrega credenciales temporales.

### `team_invitations`

Implementado en B.3 en `supabase/migrations/00019_team_email_invitations.sql`.

Preautorizacion tenant-scoped para alta por email desde Equipo.

Campos principales:

- `id`
- `organization_id`
- `email`
- `email_normalized`
- `token_hash`
- `person_profile_id`
- `coach_profile_id`
- `role`
- `initial_access_status`
- `status`
- `invited_by_user_id`
- `invited_by_membership_id`
- `accepted_by_user_id`
- `sent_at`
- `last_sent_at`
- `accepted_at`
- `expires_at`
- `send_count`
- `provider_message_id`
- `last_error`
- `created_at`
- `updated_at`

Reglas:

- Solo `owner`/`admin` leen, crean o actualizan invitaciones desde RLS normal.
- `status` distingue `pending`, `sent`, `accepted`, `cancelled`, `expired` y `failed`.
- Hay unicidad parcial por email y por persona mientras la invitacion esta `pending` o `sent`.
- El token se genera en servidor, se envia por email y solo se persiste como hash SHA-256.
- La vista publica de aceptacion usa `get_team_invitation_public(...)`, que solo devuelve datos minimos si `id + token` coinciden.
- La aceptacion usa `accept_team_invitation(...)`, que exige sesion autenticada, email Auth coincidente y ausencia de conflictos de persona/ficha en el tenant.
- Resend se usa como proveedor transaccional desde servidor con `RESEND_API_KEY`; la key no se guarda en el repo ni se expone al cliente.

### `operational_audit_events`

Implementado en S.1 en `supabase/migrations/00020_operational_audit_events.sql` y endurecido en S.1.1 con `supabase/migrations/00021_operational_audit_hardening.sql`.

Auditoria operativa corta de aplicacion para responder "quien cambio que" en cambios administrativos y operativos normales. No sustituye auditoria legal de fichaje/documentos/firma, backups, PITR ni logs administrados de Supabase.

Campos principales:

- `id`
- `organization_id`
- `actor_user_id`
- `actor_membership_id`
- `actor_person_profile_id`
- `entity_type`
- `entity_id`
- `action`
- `result`
- `changed_fields`
- `created_at`
- `retain_until`

Entidades cubiertas:

- `team_invitations`
- `organization_memberships`
- `person_profiles`
- `coach_profiles`
- `schedule_blocks`
- `schedule_block_assignments`
- `schedule_templates`
- `schedule_template_blocks`
- `staff_work_windows`
- `operational_events`

Reglas:

- Toda fila pertenece a una organizacion y el actor se deriva desde `auth.uid()` en `record_operational_audit_event(...)`.
- La RPC valida que la entidad objetivo exista dentro del tenant antes de insertar el evento.
- `changed_fields` es JSON pequeno y minimizado; bloquea claves/valores de contenido, URLs, rutas, tokens, secretos, IP/fingerprint, ubicacion cruda, documentos, firmas y datos RRHH/payroll. S.1.1 comprueba tambien valores con URL, IP, document/payroll/salary/geolocation y payloads largos.
- Las notas operativas y nombres libres se registran solo como campo tocado, no como texto completo.
- Retencion S.1/I.18: accesos/equipo 30 dias; horario, asignaciones, plantillas y jornada prevista 15 dias; eventos operativos 180 dias.
- RLS permite lectura solo a `owner`/`admin` del tenant y solo mientras `retain_until > now()`.
- `manager` no lee esta auditoria en S.1 porque la tabla mezcla eventos operativos con accesos/equipo.
- I.25 anade `list_coverage_trace_audit_events(...)` como lectura read-only filtrada para `owner`, `admin` y `manager`, solo sobre `schedule_blocks`, `schedule_block_assignments` y `schedule_template_blocks`, acotada por bloque y por `retain_until`.
- Los cambios hechos directamente en Supabase Studio/Auth no quedan cubiertos por esta auditoria de aplicacion salvo proceso especifico futuro.
- `purge_expired_operational_audit_events(batch_size)` borra eventos con `retain_until < now()` en lotes acotados. No se concede a roles normales de app ni se expone desde UI; debe programarse mediante job de base de datos antes de produccion.
- La verificacion local `supabase/snippets/operational-audit-rls-verification.sql` cubre owner/admin, manager, coach, staff, otro tenant, intento de entidad ajena, actor forzado y `changed_fields` inseguros dentro de una transaccion con rollback.

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

Decision implementada 2026-05-14:

- Editar un tipo de actividad usa `update_class_type_and_sync_defaults(...)`, no un `UPDATE` suelto desde app.
- `name`, `slug`, `category`, `color`, `requires_certification` y `status` viven en `class_types` y las pantallas los leen por `class_type_id`; no se duplican como texto en plantillas o bloques. El `slug` es interno: se genera al crear y se conserva estable si cambia el nombre visible.
- `required_coaches` es un default copiado en `schedule_template_blocks` y `schedule_blocks`. Cuando cambia en el catalogo, se sincroniza a todas las plantillas del tenant y a bloques de horario presentes/futuros accionables.
- La sincronizacion de horario usa `target_effective_from` calculado con timezone de la organizacion; no reescribe bloques pasados ni bloques `cancelled`/`completed`.
- `00033_class_type_sync_all_related_blocks.sql` corrige el primer enfoque conservador: todos los bloques relacionados deben alinearse con el nuevo default, no solo los que tenian el valor anterior.
- La RPC exige rol operativo (`owner`, `admin` o `manager`) y valida `organization_id`, formato, enum, color y rango de `required_coaches`; sigue sin usar `service_role` en `src`.

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
- `archived_at`
- `recoverable_until`

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
- Al aplicar una plantilla, los bloques sin coach quedan como vacantes solo si `required_coaches > 0` y aparecen en cobertura como riesgo `uncovered`.
- Si `required_coaches = 0`, el bloque se trata como "Sin requisito": no es vacante, no es asignado y no genera problema de cobertura.

Decision implementada en Task 013:

- La primera UI de plantillas se limita a `template_type = 'weekly'`.
- `schedule_templates.status = 'draft'` permite preparar plantillas sin aplicarlas.
- Solo plantillas `active` se aplican a semanas reales.
- `archived` conserva el patron fuera de la lista activa sin borrarlo desde UI.
- Desde `00016_schedule_template_archive_retention.sql`, las plantillas archivadas guardan `archived_at` y `recoverable_until`; la ventana inicial de recuperacion es de 30 dias.
- Recuperar una plantilla archivada la devuelve como `draft` para evitar que vuelva a aplicar semanas automaticamente sin una decision explicita.
- Aplicar una plantilla crea `schedule_blocks` con `template_id`, `template_block_id` e `is_template_exception = false`.
- Si el bloque de plantilla requiere coach y tiene `default_coach_profile_id`, se crea `schedule_block_assignments.source = 'template'`.
- Si `default_coach_profile_id` es `null` y `required_coaches > 0`, el bloque real queda vacante y la cobertura al vuelo decide si aparece como riesgo.
- Si `required_coaches = 0`, la aplicacion/sincronizacion no crea ni conserva asignaciones de origen plantilla para ese bloque.
- La aplicacion evita duplicados por plantilla, bloque de plantilla y fecha de servicio dentro de la semana destino.
- Si una plantilla activa tiene `valid_from` y `valid_until`, el rango funciona como planificacion base: las semanas cruzadas por el rango se rellenan de forma idempotente al guardar la plantilla/bloques o al abrir Horario con rol operativo.
- Los bloques generados por rango respetan la validez por fecha de servicio; una semana parcial al inicio o fin solo crea los dias dentro del rango.
- Aplicar manualmente otra plantilla sobre una semana que ya tiene plantilla exige confirmacion explicita y solo sustituye bloques generados por plantilla en esa semana/alcance. Los bloques manuales no vinculados a plantilla se conservan.
- Editar o cancelar un `schedule_block` aplicado desde plantilla marca `is_template_exception = true`.
- Archivar o eliminar logicamente una plantilla no borra `schedule_blocks` ni `schedule_block_assignments` ya generados. La planificacion historica debe tratarse como entidad independiente de la plantilla reutilizable.
- La retencion de plantillas archivadas y la retencion de horarios generados son politicas separadas. Para horarios planificados se mantiene una retencion funcional inicial de 2 a 4 anos, pendiente de politica final; no se equipara automaticamente a la obligacion legal de fichaje.

Decision implementada 2026-05-14:

- Guardar una plantilla o un bloque de plantilla activo sincroniza de forma idempotente las semanas del rango mediante `ensureScheduleTemplateRangeApplied(...)`; la plantilla activa con fechas ya no exige reaplicar manualmente para que el horario generado refleje cambios de default.
- La sincronizacion respeta excepciones: un bloque real editado/cancelado como excepcion no debe sobrescribirse silenciosamente por un cambio de plantilla.
- El centro del bloque de plantilla es editable solo cuando la plantilla no esta acotada a un centro concreto. Si `schedule_templates.center_id` existe, los bloques heredan ese centro y el campo queda como lectura en UI.
- La edicion multiple de bloques de plantilla queda limitada a campos coherentes para bulk: `default_coach_profile_id`, `notes`, `required_coaches` y `center_id` solo cuando la plantilla cubre todos los centros. Dia/hora no se actualizan en lote.
- El selector de coach por defecto en Plantillas filtra solapes dentro de la propia plantilla como ayuda UX; el horario real sigue protegido por el guardrail Postgres de asignaciones `assigned`.
- Los filtros colapsables de Plantillas por asignacion y tipo de actividad no cambian el modelo; solo reducen ruido y ayudan a resolver plantillas grandes.
- Decision 2026-05-15: `required_coaches = 0` se muestra en Plantillas como "Sin requisito" / "No requiere entrenador"; no cuenta como vacante ni asignado y queda fuera de riesgos de cobertura.
- Decision 2026-06-08: `/app/templates` enfoca "Plantillas semanales" por centro con opcion global "Todas" (`center_id=all`). Este foco es contexto de UI y no sustituye `schedule_templates.center_id` ni `schedule_template_blocks.center_id`.
- Decision 2026-06-08: la creacion rapida de bloques desde el grid semanal permite elegir varios dias y puede volver con el modal abierto y banner temporal flotante. Es comportamiento de UI para carga secuencial; no cambia schema ni semantica de `schedule_template_blocks`.

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

Decision I.17 2026-05-15:

- `schedule_blocks` sigue siendo el horario real canonico. Un evento, festivo o competicion puede explicar contexto operativo, pero no se convierte automaticamente en bloque ni cancela bloques existentes.
- Si un evento requiere staffing real, el bloque operativo debe crearse de forma explicita y trazable en `schedule_blocks` en una fase futura.
- `operational_events` no debe modificar `required_coaches`, `status` ni asignaciones como efecto automatico.

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

### `staff_work_windows`

Planificacion de presencia prevista del personal. Es una capa operativa adicional para entender quien deberia estar disponible en una franja, sin convertirlo en bloque, asignacion real ni fichaje.

Campos implementados:

- `id`
- `organization_id`
- `person_profile_id`
- `center_id` opcional
- `day_of_week`
- `start_time`
- `end_time`
- `valid_from`
- `valid_until` opcional
- `status`
- `notes`
- `created_at`
- `updated_at`

Decision implementada 2026-05-15:

- Vive en `staff_work_windows`, tenant-scoped desde la primera migracion.
- `organization_id` es obligatorio y las FKs a `person_profiles` y `centers` son tenant-safe.
- `day_of_week` usa 1-7, `start_time < end_time` y este corte no abre turnos que cruzan medianoche.
- No genera ocurrencias semanales persistidas: la app expande las franjas al vuelo para la semana visible.
- Varias personas pueden coincidir en la misma franja. Una misma persona puede tener varias franjas semanales, pero no puede guardar franjas activas que se solapen en dia, fechas y horario; la UI valida antes de guardar y Postgres bloquea nuevas altas/ediciones solapadas.
- `/app/schedule` lo muestra como resumen compacto, microcopy neutral por celda y contexto en detalle de bloque.
- El contexto de "asignado fuera de jornada prevista" es aviso suave, no bloqueo de creacion de bloques ni de asignacion de coaches.
- Todos los miembros activos del tenant ven franjas activas como contexto compartido del dia.
- `owner`, `admin` y `manager` gestionan todas las franjas del tenant, pueden revisar tambien inactivas y pueden eliminar franjas creadas por error.
- `staff`, `center_manager`, `document_admin` y `payroll_manager` no reciben permisos de gestion por herencia.
- Las notas son cortas y no sensibles. No guardar salario, contrato, payroll, saldos legales, bajas, salud, ubicacion, documentos ni datos bancarios.
- No toca `schedule_blocks`, `schedule_block_assignments`, plantillas, fichaje real ni cobertura como restriccion dura.

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

Decision I.9/I.10/I.16/I.25: `absence_conflict` queda reservado para impacto derivado de ausencias aprobadas o en revision sobre asignaciones activas. No implica que `coverage_issues` exista como tabla ni que una ausencia modifique automaticamente el horario. I.10 ya permite calcular impacto al vuelo con `list_absence_schedule_impacts(...)`, partiendo de `schedule_blocks` + `schedule_block_assignments` y periodos de ausencia tenant-scoped. I.25 anade trazabilidad de lectura para explicar el riesgo, pero no persiste incidencias ni resuelve cobertura.

### `change_requests`

Solicitudes de cambio, cobertura o intercambio.

Campos candidatos:

- `id`
- `organization_id`
- `requester_coach_profile_id`
- `schedule_block_id`
- `request_type`
- `status`
- `approval_required`
- `requested_replacement_coach_profile_id`
- `accepted_target_id`
- `applied_schedule_block_assignment_id`
- `reason_summary`
- `created_at`
- `expires_at`
- `resolved_at`
- `applied_at`

Tipos:

- `own_block_change`
- `direct_coverage_request`
- `open_coverage_request`
- `coverage_request`
- `swap`
- `offer_block`

Estados:

- `draft`
- `pending`
- `offered`
- `accepted_by_coach`
- `rejected_by_coach`
- `pending_approval`
- `approved`
- `rejected`
- `applied`
- `cancelled`
- `expired`

Implementado en I.2 (`supabase/migrations/00027_change_requests_foundation.sql`):

- `change_requests` existe como cabecera de workflow tenant-scoped, no como fuente canonica del horario.
- Campos implementados: `organization_id`, `requester_membership_id`, `requester_person_profile_id`, `requester_coach_profile_id`, `schedule_block_id`, `schedule_block_assignment_id`, `request_type`, `status`, `approval_required`, `accepted_target_id`, `applied_schedule_block_assignment_id`, `reason_summary`, timestamps de creacion/actualizacion/expiracion/resolucion/aplicacion.
- La solicitud propia se crea solo mediante RPC sobre un `schedule_block_assignment` `assigned` del coach autenticado y un `schedule_block` accionable.
- `reason_summary` es opcional, corto y minimizado; no es un campo para ausencias, bajas, permisos, documentos, payroll, ubicacion ni datos sensibles.
- `approval_required = true` por defecto. Una aceptacion de coach deja el workflow preparado para aprobacion (`pending_approval`) y no toca el horario real.
- Direct writes quedan bloqueadas para `authenticated`; lectura via RLS queda limitada a gestion (`owner`, `admin`, `manager`) y miembros involucrados como solicitante o target.

Decision I.1 2026-05-13:

- `change_requests` es workflow/trazabilidad, no el horario canonico. El horario real sigue viviendo en `schedule_blocks` y `schedule_block_assignments`.
- Toda solicitud futura debe tener `organization_id` obligatorio y validar que bloque, solicitante, candidatos, assignments y memberships pertenecen al mismo tenant.
- Una solicitud puede representar cambio de bloque propio, cobertura a un coach concreto, oferta abierta a varios candidatos o intercambio entre coaches.
- Aceptar por un coach no aplica automaticamente el cambio si la politica exige aprobacion; puede pasar a `pending_approval`.
- Aprobar por `owner`, `admin` o `manager` no basta: la aplicacion final debe revalidar solapes/disponibilidad y constraints DB justo antes de tocar `schedule_block_assignments`.
- `center_manager` queda como rol futuro no activado hasta tener frontera por centro en schema/RLS/UX.
- No se guarda payload completo de notas o contexto; `reason_summary` debe ser corto/minimizado o sustituirse por campo tocado si hay riesgo de datos sensibles.
- No se borra historial critico; cancelaciones, rechazos, expiraciones y aplicacion quedan como estados/eventos.

Decision I.2 2026-05-13:

- Se implementa solo schema/RLS/RPC de creacion, oferta, respuesta y eventos minimizados.
- La aplicacion real a `schedule_block_assignments` queda bloqueada para I.3 porque debe ser una transaccion propia de aprobacion/aplicacion con revalidacion de solapes, estado del bloque, target aceptado, asignacion origen y guardrail Postgres `coach-unavailable`.
- `swap` queda reconocido en checks de tabla como tipo candidato, pero la RPC de solicitud propia no lo activa todavia porque necesita modelar el segundo bloque/asignacion.
- `center_manager` no recibe permisos en I.2.

Implementado en I.3 (`supabase/migrations/00028_change_request_operations.sql`):

- `approve_change_request(...)` permite a `owner`, `admin` y `manager` aprobar una solicitud aceptada por coach, revalidando solicitud, target aceptado, bloque accionable y asignacion origen todavia `assigned`.
- `reject_change_request(...)` permite a gestion rechazar solicitudes no cerradas y retirar targets todavia ofrecidos.
- `cancel_change_request(...)` permite cancelar por gestion o por el coach solicitante antes de aplicarse; si la solicitud ya esta `approved`, solo gestion puede cancelarla.
- `expire_change_request(...)` cierra de forma minima solicitudes vencidas, targets aceptados vencidos, bloques ya no accionables o solicitudes ofrecidas sin targets activos.
- `apply_approved_change_request(...)` aplica solo solicitudes `approved` y marca `applied` despues de mutar `schedule_block_assignments`.
- La aplicacion crea o reactiva la asignacion destino con `assignment_status = 'assigned'` y `source = 'change_request'`, y marca la asignacion origen como `removed`.
- `applied_schedule_block_assignment_id` apunta a la asignacion destino real y `applied_at` se rellena solo en aplicacion correcta.
- Los fallos esperados de aplicacion dejan la solicitud sin aplicar y registran `application_failed` minimizado; no hay estado `applied` sin mutacion real terminada.
- `swap` sigue fuera de aplicacion en I.3.

Implementado en I.5 (`src/lib/change-requests.ts`):

- La primera capa app/server interna consume las RPCs de I.2/I.3 con Supabase SSR y sesion normal, sin `service_role`.
- Los helpers resuelven tenant activo desde usuario/memberships; `organizationId` solo selecciona una organizacion activa cuando hace falta y no sustituye a RLS.
- Las funciones propias no aceptan `person_profile_id`; la persona se deriva desde sesion + tenant y DB vuelve a validarla.
- Se exponen helpers internos para listar solicitudes visibles por RLS, crear solicitud propia, ofrecer a coach, responder como target, aprobar, rechazar, cancelar, expirar y aplicar.
- La aplicacion app/server solo se considera exitosa si la RPC devuelve `status = 'applied'`; si no, lee el ultimo `application_failed` minimizado y devuelve error semantico (`coach-unavailable`, `not-approved`, `expired` o `not-actionable`).
- I.5 no cambia schema ni fuente canonica: el horario real sigue en `schedule_blocks` y `schedule_block_assignments`.

Implementado en I.7 (`supabase/migrations/00029_change_request_atomic_creation.sql` y `/app/requests`):

- La creacion visible usa RPCs atomicas para crear cabecera y targets iniciales en una sola transaccion.
- `create_own_change_request_with_targets(...)` mantiene la regla de solicitud propia sobre asignacion `assigned` del coach autenticado.
- `create_managed_change_request_with_targets(...)` permite a `owner`, `admin` y `manager` iniciar cobertura operativa sobre una asignacion del tenant, derivando requester coach/person/membership desde la asignacion origen.
- La UI guarda solo tipo, bloque/asignacion derivados, razon corta opcional, vencimiento opcional y targets minimos.
- Los enlaces desde horario/cobertura solo preseleccionan origen; no cambian el modelo ni la fuente canonica del horario.
- `swap` sigue fuera de los RPCs activos y de la UI de creacion.

### `change_request_targets`

Destinatarios u ofertas por coach/candidato. Tambien puede nombrarse `change_request_offers` si el corte tecnico prioriza semantica de oferta.

Campos candidatos:

- `id`
- `organization_id`
- `change_request_id`
- `target_coach_profile_id`
- `target_type`
- `status`
- `response_note_summary`
- `offered_at`
- `responded_at`
- `expires_at`

Tipos candidatos:

- `direct_coach`
- `open_candidate`
- `suggested_candidate`

Estados candidatos:

- `offered`
- `accepted`
- `rejected`
- `withdrawn`
- `expired`

Reglas candidatas:

- Cada target debe pertenecer al mismo `organization_id` que la solicitud.
- Un coach solo puede responder sobre targets dirigidos a su `coach_profile` o abiertos donde el servidor lo reconozca como candidato valido.
- La aceptacion no cuenta como cobertura real hasta que la solicitud quede `applied` y exista asignacion `assigned` valida.

Implementado en I.2:

- `change_request_targets` usa `organization_id` obligatorio y FK compuesta contra `change_requests` y `coach_profiles`.
- Cada target apunta a un coach concreto; las ofertas abiertas se representan por targets/candidatos concretos (`open_candidate`) hasta que una UI futura decida una bandeja abierta real.
- `offer_change_request_to_coach(...)` puede ejecutarla gestion o el coach solicitante; valida tenant, estado de solicitud, target activo/asignable, bloque accionable, ausencia de asignacion ya existente al mismo bloque y ausencia de solape actual.
- `respond_to_change_request_target(...)` solo responde como el coach autenticado vinculado al target, acepta `accepted` o `rejected`, minimiza la nota y revalida bloque/solape antes de aceptar.
- Al aceptar, otros targets `offered` de la misma solicitud pasan a `withdrawn`; la solicitud pasa a `pending_approval` por defecto.

Implementado en I.3:

- Las validaciones de target siguen exigiendo coach asignable para targets `offered` o `accepted`.
- Los cierres operativos `withdrawn` y `expired` ya no se bloquean si el coach deja de ser asignable despues de la oferta; esto permite cerrar historial sin relajar la aplicacion real.

Implementado en I.7:

- Los targets iniciales de una solicitud creada desde UI se insertan mediante `create_own_change_request_with_targets(...)` o `create_managed_change_request_with_targets(...)`.
- Cada target sigue pasando por `offer_change_request_to_coach(...)`; si uno falla por tenant, asignabilidad, self-target, duplicado o solape, no queda solicitud parcial.
- La seleccion visible de targets se resuelve en servidor desde coaches activos, personas visibles y memberships activas del tenant.

### `change_request_events`

Historial operativo minimo de la solicitud.

Campos candidatos:

- `id`
- `organization_id`
- `change_request_id`
- `actor_user_id`
- `actor_membership_id`
- `actor_person_profile_id`
- `event_type`
- `result`
- `changed_fields`
- `created_at`
- `retain_until`

Eventos candidatos:

- `request_created`
- `request_offered`
- `target_accepted`
- `target_rejected`
- `approval_requested`
- `request_approved`
- `request_rejected`
- `request_cancelled`
- `request_expired`
- `request_applied`
- `application_failed`

Reglas candidatas:

- Actor derivado desde sesion/RPC, no enviado libremente por UI.
- `changed_fields` minimizado: ids, estado, tipo y campos tocados; no payloads completos, notas largas, ubicacion, documentos, payroll, salario, tokens, URLs firmadas ni datos sensibles.
- Retencion y lectura administrativa deben decidirse antes de la primera migracion; no hereda automaticamente la retencion de fichaje ni documentos.
- La aplicacion final puede registrar tambien un evento minimizado en `operational_audit_events`, pero la fuente completa del workflow debe ser `change_request_events` o equivalente propio.

Implementado en I.2:

- `change_request_events` deriva `actor_user_id`, `actor_membership_id`, `actor_person_profile_id` y, cuando aplica, `actor_coach_profile_id` desde la sesion/RPC.
- Las RPCs de creacion/oferta/respuesta registran eventos propios: `request_created`, `request_offered`, `target_accepted`, `target_rejected` y `approval_requested`.
- `record_change_request_event(...)` existe solo para registrar `application_failed` con resultado `failed` o `denied`; no permite falsear transiciones de exito.
- `changed_fields` queda limitado a JSON pequeno y seguro; bloquea arrays, payloads largos, URLs, tokens, Storage, IP/fingerprint, ubicacion, documentos, payroll/salario y campos sensibles.
- La lectura de eventos se limita por RLS a gestion y miembros involucrados, y solo mientras `retain_until > now()`. La ventana inicial de lectura operativa es 90 dias.

Implementado en I.3:

- Aprobacion, rechazo, cancelacion, expiracion y aplicacion registran `request_approved`, `request_rejected`, `request_cancelled`, `request_expired` y `request_applied`.
- Los fallos esperados de aplicacion registran `application_failed` con `failure_code`/`failure_stage` minimizados, sin notas largas ni payload completo.
- La aplicacion real tambien registra en `operational_audit_events` eventos minimizados sobre las dos asignaciones afectadas: destino `assigned` y origen `removed`.

Lectura de cobertura I.25:

- `change_requests` y `change_request_events` pueden explicar por que un bloque tuvo solicitud, oferta, aprobacion o aplicacion, pero siguen sin ser horario canonico.
- `src/lib/coverage-traceability.ts` lee solo campos minimizados de cambios y eventos para paneles de detalle; no lee ni expone `reason_summary`.
- La trazabilidad visible por bloque combina cambios, auditoria operativa filtrada e impacto derivado de ausencias. No crea `coverage_issues` ni modifica asignaciones.

## Ausencias, Eventos Y Horas

### `absence_requests`

Vacaciones, dias libres, permisos minimizados y cambios de disponibilidad.

I.9 documenta el primer modelo seguro sin crear migracion. I.10 implementa la foundation interna en `supabase/migrations/00035_absence_requests_foundation.sql`, sin UI visible ni datos reales. I.11 anade `src/lib/absence-requests.ts` como capa interna server-side para consumir esa foundation. I.12 abre `/app/absences` como primera bandeja visible protegida, I.13 anade creacion minima de solicitud propia, I.14 endurece la superficie visible sin cambiar schema/RLS/RPC, I.15 anade QA tecnico de regresion sin cambiar campos ni visibilidad, I.16 integra impacto derivado en lectura de cobertura e I.25 muestra trazabilidad operativa reciente del impacto en detalle de horario/cobertura. Sigue sin haber calendario ni creacion para otra persona. Una ausencia/no disponibilidad es un workflow laboral-operativo propio; no es lo mismo que una solicitud de cobertura a otro coach. Puede generar impacto de cobertura, pero la cobertura se resuelve por ajuste de asignacion o por `change_requests`.

Campos implementados en I.10:

- `id`
- `organization_id`
- `subject_person_profile_id`
- `subject_coach_profile_id` opcional
- `requested_by_user_id`
- `requested_by_membership_id`
- `requested_by_person_profile_id`
- `absence_type`
- `status`
- `review_required`
- `reviewed_by_membership_id`
- `reviewed_by_person_profile_id`
- `reason_summary`
- `created_at`
- `updated_at`
- `requested_at`
- `reviewed_at`
- `cancelled_at`
- `expired_at`
- `resolved_at`
- `expires_at`
- `retain_until`

`coverage_impact_status` no se persiste en I.10. El impacto se calcula al vuelo con `list_absence_schedule_impacts(...)` para evitar duplicar una verdad derivable.

Capa interna I.11:

- `organization_id` es obligatorio en todos los helpers expuestos.
- Las lecturas propias derivan persona desde sesion + tenant; no se acepta `person_profile_id` propio desde cliente.
- Las mutaciones pasan por `create_own_absence_request(...)`, `cancel_absence_request(...)`, `review_absence_request(...)` y `expire_absence_request(...)`; no hay escrituras directas a tablas de ausencias desde app.
- `listAbsenceRequestEvents(...)` relee eventos minimizados por RLS. No existe registro app-side de eventos en I.11 porque I.10 solo registra auditoria dentro de RPCs acotadas.
- `listAbsenceScheduleImpacts(...)` mantiene el impacto como lectura derivada; no crea ni consume `absence_schedule_impacts`.

Superficie visible I.12:

- `/app/absences` lista solicitudes propias para roles con self-service (`owner`, `admin`, `manager`, `coach`) y cola de revision solo para `owner`, `admin` y `manager`.
- La ruta usa `src/lib/absence-requests.ts` como capa interna para lecturas, eventos, impactos y mutaciones; no escribe directamente en tablas de ausencias.
- Las Server Actions reciben `organization_id` y `absence_request_id`, revalidan sesion, tenant y rol, y no aceptan `person_profile_id` propio desde cliente.
- Las acciones visibles quedan limitadas a cancelar propia en `requested`/`pending_review`, aprobar/rechazar desde gestion y expirar cuando la solicitud ya es objetivamente vencida o no accionable por periodo pasado.
- El impacto se muestra como lectura calculada al vuelo con `listAbsenceScheduleImpacts(...)`; no persiste impacto ni modifica `schedule_blocks` o `schedule_block_assignments`.
- No incluye calendario, saldos, payroll, bajas medicas documentadas, cobertura automatica, push, ubicacion, app nativa ni reglas hardcodeadas de tenant.

Creacion visible I.13:

- El formulario de `/app/absences` crea solo solicitud propia mediante `createOwnAbsenceRequest(...)`.
- La Server Action recibe `organization_id`, tipo, inicio, fin, dia completo y resumen operativo corto opcional, pero no acepta `person_profile_id` ni `coach_profile_id`.
- La zona horaria se toma de la organizacion activa resuelta en servidor y se pasa al helper como dato operativo.
- La accion revalida sesion, membership activa, self-service permitido, tenant, `organization_id`, tipo permitido, rango temporal y longitud del resumen antes de delegar en helper/RPC.
- El helper/RPC deriva persona/coach propios desde sesion + tenant y mantiene los estados `requested`/`pending_review` definidos por I.10.
- Tras crear, la UI vuelve a la bandeja y muestra el estado devuelto por la RPC.
- La creacion no persiste impactos, no modifica `schedule_blocks` ni `schedule_block_assignments`, no crea cobertura y no expone saldos legales ni cumplimiento legal definitivo.
- El resumen operativo sigue minimizado: no salud, diagnosticos, justificantes, documentos, familia, sanciones, salario, payroll, ubicacion, URLs, tokens, IP/fingerprint ni payloads completos.

Hardening visible I.14:

- `/app/absences` anade filtros GET por `view`, `absence_type` y `absence_status`; los valores se validan en servidor y no cambian permisos ni RLS.
- La vista de revision sigue limitada a `owner`, `admin` y `manager`; roles sin esa capacidad no pueden activar la cola por query string.
- Las tarjetas explican por que no procede cancelar, aprobar, rechazar o cerrar como vencida segun estado, vencimiento y periodos.
- Los botones de accion tienen estado pendiente y confirmacion; la garantia final sigue en Server Action + helper + RPC.
- La creacion propia mantiene el formulario minimo, anade confirmacion visible de no incluir datos sensibles y muestra errores de validacion junto al formulario.
- La Server Action interpreta `datetime-local` con la zona horaria de la organizacion activa antes de llamar a `createOwnAbsenceRequest(...)`.
- I.14 no anade tablas, campos, estados, calendario, saldos legales, cobertura automatica ni escrituras directas.

QA tecnico I.15:

- Se anade smoke/guardrails de regresion para confirmar que I.13/I.14 siguen presentes: formulario propio por `createOwnAbsenceRequest(...)`, filtros GET y cola de revision por rol.
- El smoke protege que no haya inputs propios `person_profile_id`/`coach_profile_id`, escrituras directas a tablas de ausencia desde `src`, `service_role` ni hardcode de tenant en `src`.
- No cambia entidades, campos, estados, visibilidad, permisos, RLS, RPC ni relaciones.

Integracion de cobertura I.16:

- `listOperationalAbsenceScheduleImpacts(...)` lee periodos/solicitudes `approved` o `pending_review` para roles de gestion y usa `list_absence_schedule_impacts(...)` como cruce final.
- `ScheduleBlockCoverage.absenceImpact` es un valor app-side derivado, no una entidad persistida.
- `coverage_needed` descuenta la asignacion de `validAssignmentCount` en la lectura de cobertura; `potential` marca riesgo operativo sin descontar el ratio.
- `/app/schedule`, `/app/coverage`, Inicio y `/app/stats` consumen ese valor con copy prudente y sin mostrar `reason_summary`.
- Si falla la carga del impacto, las pantallas conservan la cobertura base y muestran aviso.
- I.16 no modifica `schedule_blocks`, `schedule_block_assignments`, plantillas ni `absence_requests`, no crea targets/ofertas y no resuelve cobertura automaticamente.

Trazabilidad de cobertura I.25:

- `/app/schedule` y `/app/coverage` muestran una seccion por bloque para roles `owner`, `admin` y `manager`.
- La seccion puede indicar ausencia aprobada/en revision, solicitud de cambio/cobertura y campos operativos minimizados tocados en bloque/asignacion/plantilla.
- Inicio y `/app/stats` siguen siendo superficies agregadas: calculan riesgo con el mismo helper de cobertura y no muestran trazas por bloque.
- No se persiste `absence_schedule_impacts`, no se muestran motivos sensibles y no se automatiza la resolucion.

Tipos implementados en I.10:

- `vacation`
- `day_off`
- `partial_day`
- `permission`
- `personal_absence`
- `unavailable`

Estados implementados en I.10:

- `requested`
- `pending_review`
- `approved`
- `rejected`
- `cancelled`
- `expired`

I.9/I.10 deciden no usar `applied` como estado principal de ausencia: aprobar una ausencia no debe mutar `schedule_blocks` ni `schedule_block_assignments` por si solo.

Reglas candidatas:

- `organization_id` obligatorio desde la primera migracion que exista.
- Acciones propias derivan persona desde `auth.uid()` + `organization_id`; no aceptan `person_profile_id` libre desde cliente.
- La persona autenticada puede solicitar y leer sus propias ausencias si tiene membership activa y persona vinculada.
- `owner`, `admin` y `manager` pueden revisar solicitudes del tenant con datos minimizados; no heredan por ello acceso a salud, documentos, payroll ni datos sensibles.
- `center_manager`, `document_admin`, `payroll_manager` y `staff` no reciben permisos por herencia en I.10.
- `reason_summary` debe ser corto y operativo. No es campo para diagnosticos, salud, documentos, salario, payroll, datos familiares, sanciones, ubicacion, IP/fingerprint, URLs ni tokens.
- Bajas medicas con documentos quedan fuera del primer corte. Si se necesitan justificantes o documentos, deben pasar por el modelo documental privado y grants propios.

Impacto sobre horario:

- `schedule_blocks` conserva centro, fecha, hora, tipo, `required_coaches` y estado; una ausencia no cambia esos campos.
- `schedule_block_assignments` conserva quien estaba asignado. Una ausencia aprobada que solapa una asignacion `assigned` no borra ni retira automaticamente la fila.
- El impacto I.10 se calcula detectando solape entre periodos de ausencia y asignaciones `assigned` de bloques activos; bloques `cancelled` y `completed` no generan impacto activo.
- Una ausencia `pending_review` puede marcar impacto potencial para gestion en I.16. Una ausencia `approved` devuelve impacto `coverage_needed` y puede derivar en `uncovered` o `insufficient` en la lectura visible porque esa asignacion no cuenta como cobertura valida.
- Resolver el impacto requiere accion separada: retirar/reasignar desde horario o crear/aplicar `change_requests`. La ausencia no crea targets ni ofertas a otros coaches por si sola.
- Si un `change_request` nace por impacto de ausencia, el vinculo futuro puede ser referencia opcional a la ausencia/impacto, pero el coach candidato no debe ver el motivo sensible de la ausencia.

### `absence_request_periods`

Periodos de fecha/hora asociados a una ausencia. Se separan de la cabecera para soportar dias completos, medios dias y tramos concretos sin multiplicar solicitudes.

Implementado en I.10.

Campos implementados:

- `id`
- `organization_id`
- `absence_request_id`
- `period_index`
- `starts_at`
- `ends_at`
- `all_day`
- `timezone`
- `created_at`

Reglas candidatas:

- Cada periodo pertenece al mismo `organization_id` que la solicitud.
- `starts_at` debe ser anterior a `ends_at`.
- La comparacion con `schedule_blocks` debe usar timezone de organizacion/centro y no asumir UTC visible en UI.

### `absence_schedule_impacts`

Relacion candidata entre una ausencia y los bloques/asignaciones afectados. I.10 decide no crear esta tabla e I.16/I.25 mantienen esa decision: el impacto se calcula al vuelo con `list_absence_schedule_impacts(...)` porque el primer corte solo necesita una lectura derivada desde periodos de ausencia, bloques y asignaciones `assigned`.

Puede persistirse en una fase futura si hace falta auditoria de resolucion, rendimiento, workflow de impacto o vinculacion formal con `change_requests`.

Campos candidatos:

- `id`
- `organization_id`
- `absence_request_id`
- `absence_request_period_id`
- `schedule_block_id`
- `schedule_block_assignment_id`
- `impact_status`
- `resolved_change_request_id`
- `resolved_schedule_block_assignment_id`
- `created_at`
- `resolved_at`

Estados candidatos:

- `none`
- `potential`
- `coverage_needed`
- `coverage_requested`
- `resolved`
- `ignored`

Reglas candidatas:

- Solo puede apuntar a bloques, asignaciones y solicitudes del mismo tenant.
- No sustituye al calculo canonico de cobertura ni al workflow de `change_requests`.
- No debe guardar razon sensible de la ausencia; solo ids, estado de impacto y resolucion operativa.
- Si se implementa en el futuro, `organization_id` sera obligatorio desde su primera migracion y tendra verificacion negativa propia de impacto cruzado.

### `absence_request_events`

Auditoria propia y minimizada del workflow de ausencias.

Implementado en I.10.

Campos implementados:

- `id`
- `organization_id`
- `absence_request_id`
- `actor_user_id`
- `actor_membership_id`
- `actor_person_profile_id`
- `event_type`
- `result`
- `changed_fields`
- `created_at`
- `retain_until`

Eventos candidatos:

- `absence_requested`
- `absence_review_requested`
- `absence_approved`
- `absence_rejected`
- `absence_cancelled`
- `absence_expired`
- `coverage_impact_detected`

Reglas implementadas:

- Actor derivado desde sesion/RPC, no enviado libremente desde UI.
- `changed_fields` minimizado: estado, tipo, periodo, impacto y campos tocados; no payload completo ni texto libre sensible.
- Escritura directa bloqueada para `authenticated`; los eventos se registran desde RPCs acotadas.
- I.11 solo relee eventos por RLS desde `src/lib/absence-requests.ts`; cualquier registro manual futuro requerira RPC publica acotada y documentada.
- Retencion candidata I.10: solicitudes cerradas/aprobadas como historico operativo durante 24 meses y eventos visibles 180 dias, pendiente de revision legal/privacidad antes de produccion.
- Borrado fisico/purga automatica queda fuera de I.10; cualquier job/control DB requiere decision legal/tecnica posterior.

### `operational_events`

Eventos internos/externos, competiciones, seminarios, open days, mantenimientos y festivos especiales como contexto operativo del box.

Estado I.19 2026-05-15: foundation tecnica minima implementada con `operational_events`, RLS, RPCs, helper server-side y auditoria minimizada en `operational_audit_events`. I.19 abre una superficie compacta en `/app/schedule` como contexto semanal/del dia, sin UI grande, calendario avanzado, seeds ni datos reales.

Nota de naming: I.17 uso `box_events` como candidato documental. I.18 fija el nombre real `operational_events` para dejar claro que son contexto operativo, no horario canonico.

Campos implementados:

- `id`
- `organization_id`
- `center_id` opcional
- `event_type`
- `status`
- `visibility`
- `title`
- `starts_at`
- `ends_at`
- `all_day`
- `timezone`
- `impact_level`
- `notes`
- `created_by_membership_id`
- `updated_by_membership_id`
- `created_at`
- `updated_at`
- `cancelled_at`
- `archived_at`
- `retain_until`

Tipos implementados:

- `holiday`
- `closure`
- `competition`
- `seminar`
- `open_day`
- `internal_event`
- `external_event`
- `maintenance`
- `community_event`

Estados implementados en I.18:

- `active`
- `cancelled`
- `archived`

Los estados editoriales candidatos de I.17 (`draft`, `planned`, `confirmed`, `completed`) quedan futuros hasta que exista UI/workflow.

Impactos implementados:

- `context_only`
- `schedule_review_needed`
- `coverage_review_needed`
- `staffing_needed`

Reglas I.18/I.19:

- Toda fila incluye `organization_id` obligatorio y FK tenant-safe opcional a `centers`.
- `operational_events` es contexto operativo; no es `schedule_blocks`, no es `schedule_block_assignments`, no es ausencia, no es fichaje y no es payroll.
- Un evento puede afectar a una fecha, centro o franja y pedir revision, pero no modifica automaticamente horario, plantilla, cobertura, ausencias ni solicitudes.
- Los festivos no se hardcodean por tenant ni region dentro de `src`; si se implementan calendarios base, deben ser configuracion/datos tenant-safe.
- Las notas son cortas y no sensibles. La DB y el helper rechazan salud, bajas, justificantes, documentos, salario, payroll, datos familiares, sanciones, ubicacion, URLs, tokens, IP/fingerprint y datos bancarios.
- `owner`, `admin` y `manager` gestionan por RPC/helper server-side; `coach` lee solo eventos `active` con visibilidad `staff` o `all_staff`; `center_manager`, `document_admin`, `payroll_manager` y `staff` no reciben permiso nuevo.
- `/app/schedule` consume `listOperationalEvents(...)` para mostrar contexto y las Server Actions de I.19 delegan en los RPC/helper de I.18; no escriben `schedule_blocks` ni `schedule_block_assignments`.
- Retencion candidata: eventos operativos 24 meses tras finalizar o archivarse, pendiente de decision legal/privacidad antes de datos reales.
- Las escrituras directas quedan revocadas para `authenticated`; `create_operational_event`, `update_operational_event` y `set_operational_event_status` revalidan sesion, membership, tenant, rol, centro, fechas, timezone, visibilidad, impacto y notas.

### `box_event_occurrences`

Ventanas concretas de un evento cuando no basta una cabecera con inicio/fin.

Uso candidato:

- eventos multi-dia con horarios distintos;
- festivos de dia completo;
- eventos que afectan a varios centros con ventanas diferentes;
- competiciones con bloques de dia, montaje, apertura o cierre separados.

Reglas candidatas:

- `organization_id` obligatorio;
- FK tenant-safe a `operational_events`;
- `center_id` opcional pero tenant-safe;
- `all_day`, `starts_at`, `ends_at` y `timezone` cerrados por validacion servidor/RLS;
- no crea ocurrencias de horario ni `schedule_blocks`.

### `box_event_schedule_contexts`

Relacion futura opcional entre eventos y bloques afectados, solo como contexto o revision.

Reglas candidatas:

- Puede apuntar a `schedule_blocks` del mismo tenant cuando un evento afecta a un bloque real.
- No sustituye cobertura ni solicitudes: una fila de contexto no asigna coaches, no descuenta cobertura y no cancela el bloque.
- El impacto sobre cobertura debe mostrarse como `event_context`, `holiday_context` o `coverage_review_needed`, no como restriccion dura.
- Persistir esta relacion solo se justifica si hace falta auditoria, rendimiento o workflow de revision; mientras sea derivable, preferir calculo al vuelo.

### `box_event_responses`

Respuesta futura de coaches/personas a eventos, asistencia o disponibilidad operativa.

Estados candidatos:

- `interested`
- `attending`
- `maybe`
- `unavailable`
- `wants_to_work`
- `declined`

Reglas candidatas:

- Acciones propias derivadas desde `auth.uid()` + `organization_id`; no aceptar `person_profile_id` desde cliente.
- Una respuesta `unavailable` no es una ausencia aprobada y no debe modificar cobertura por si sola.
- `wants_to_work` en festivo o evento no aprueba horas extra, payroll ni voluntariado legal definitivo.
- Las respuestas son datos personales operativos y necesitan RLS, retencion y lectura minima por rol.

### `box_event_audit_events`

Auditoria propia y minimizada para cambios de eventos/respuestas si una fase futura necesita una tabla dedicada.

Estado I.18: los cambios de `operational_events` se registran en `operational_audit_events` con `entity_type = operational_events`, acciones cerradas, actor derivado y `changed_fields` minimizado. No se crea una tabla dedicada `box_event_audit_events`.

Eventos candidatos:

- `event_created`
- `event_updated`
- `event_confirmed`
- `event_cancelled`
- `event_completed`
- `event_archived`
- `event_response_recorded`
- `schedule_context_added`
- `schedule_context_removed`

Reglas candidatas:

- actor derivado desde sesion/membership/persona;
- `changed_fields` minimizado, sin payload completo ni texto libre sensible;
- retencion candidata de 180 dias para auditoria/respuestas visibles, pendiente de revision legal/privacidad;
- escritura directa bloqueada para usuarios normales si se implementa con RPCs.

### `overtime_candidates`

Modelo I.20-I.24 para posibles horas extra como contexto operativo revisable, no como nomina, compensacion, saldo legal ni aprobacion laboral definitiva. I.21 implementa la base tecnica minima en `supabase/migrations/00039_overtime_candidates_foundation.sql`, ajusta retencion con `00040_overtime_candidates_retention_guard.sql` y anade la capa interna `src/lib/overtime-candidates.ts`. I.22 anade verificacion SQL/RLS con rollback y smoke endurecido. I.23 abre una primera superficie visible minima en `/app/time` para revision operativa por `owner`, `admin` y `manager`. I.24 anade deteccion server-side prudente y manual desde contexto existente, sin calculo definitivo, automatismo legal ni payroll.

Nota de naming: `overtime_entries` queda como nombre historico demasiado definitivo. El nombre implementado es `overtime_candidates`, porque la entidad representa una senal pendiente de revision, no una hora extra aprobada.

Definicion I.20-I.24:

- Una hora extra en BoxOps, por ahora, es solo un candidato operativo de exceso o diferencia positiva que requiere revision humana.
- No nace automaticamente por fichar mas que lo planificado, aceptar una cobertura, trabajar un evento/festivo, tener una franja de jornada prevista o aprobar una semana de fichaje.
- No genera payroll, nomina, importe, compensacion, saldo legal, cierre mensual legal ni cumplimiento laboral definitivo.

Entidades implementadas en I.21:

- `overtime_candidates`: cabecera tenant-scoped con `organization_id`, `person_profile_id`, `period_start_date`, `period_end_date`, `timezone`, `detection_source`, `planned_minutes_snapshot`, `worked_minutes_snapshot`, `candidate_minutes` generado, `status`, membership creadora/revisora y timestamps/retencion.
- `overtime_candidate_sources`: fuentes minimizadas que explican el candidato mediante `source_type` + `source_id`, validando pertenencia al tenant y, si procede, a la persona afectada. Soporta `time_records`, `time_punches` activos, `time_weekly_approvals`, `schedule_blocks`, `schedule_block_assignments`, `staff_work_windows`, `absence_requests`/periodos, `operational_events` y `manual_context`.
- `overtime_candidate_events`: auditoria minimizada de deteccion, fuente anadida, inicio de revision, cambio de estado, validacion operativa, rechazo, cierre y supersesion.
- `overtime_candidate_exports`: exporte interno revisable futuro si hiciera falta; no es exporte legal definitivo ni payroll.
- `src/lib/overtime-candidate-detection.ts`: detector server-side I.24 que calcula snapshots desde contexto existente, crea candidatos solo con diferencia positiva clara, registra fuentes trazadas y usa `needs_review` ante fichajes abiertos, correcciones pendientes/aprobadas, semanas reabiertas o datos incompletos. No muta tablas de fichaje, horario, asignaciones, jornada prevista, ausencias ni eventos.

Estados candidatos:

- `detected`
- `needs_review`
- `under_review`
- `operationally_validated`
- `operationally_rejected`
- `superseded`
- `closed`

Relaciones con modelos existentes:

- `time_records`: fuente de jornada diaria y estado de registro; el candidato solo referencia snapshot/minutos, no edita registros.
- `time_punches`: solo punches activos y pares entrada/salida cerrados pueden alimentar minutos trabajados; punches `superseded`, `voided` u abiertos no cierran horas extra.
- `time_weekly_approvals`: puede congelar contexto para revision, pero una semana `approved` no aprueba horas extra.
- `schedule_blocks`: planificacion operativa de bloques reales; no es contrato ni payroll.
- `schedule_block_assignments`: asignaciones `assigned` definen planificacion por coach; aceptar o aplicar una cobertura no aprueba horas extra.
- `staff_work_windows`: presencia prevista compartida; puede alimentar `schedule_auto` cuando el tenant lo activa, pero no es jornada legal, saldo ni prueba de presencia real.
- Ausencias: una ausencia aprobada o en revision puede explicar una diferencia, sin exponer motivos sensibles ni generar horas extra por si sola.
- `operational_events`: eventos/festivos/competiciones son contexto; no equivalen a voluntariado legal ni hora extra aprobada.

Permisos candidatos:

- Persona afectada: lectura propia minimizada del candidato y su estado mediante RLS; I.23/I.24 no abren cola tenant-wide ni acciones visibles para `coach`.
- `owner`, `admin` y `manager`: revision operativa del tenant mediante RPC/helper internos y primera cola visible minima en `/app/time`.
- `payroll_manager`: no hereda acceso ni aprobacion en I.20-I.24; cualquier aprobacion payroll/legal futura requiere capacidad separada y revision legal.
- `center_manager`, `document_admin` y `staff`: sin permisos por herencia.

Auditoria y privacidad:

- `organization_id` obligatorio desde la migracion I.21.
- Las mutaciones pasan por RPCs acotadas: `create_overtime_candidate_signal(...)`, `add_overtime_candidate_source(...)` y `set_overtime_candidate_status(...)`; la lectura filtrada usa `list_overtime_candidates(...)`.
- El helper server-side valida sesion, membership, tenant, rol, persona, periodo, minutos, estado y fuente antes de delegar en RPC; no usa `service_role`.
- I.23 lista candidatos desde `listOvertimeCandidates(...)` y cambia estados desde una Server Action minima que delega en `setOvertimeCandidateStatus(...)`; la UI/actions no escriben directamente en `overtime_candidates`, `overtime_candidate_sources` ni `overtime_candidate_events`.
- I.24 dispara deteccion solo por accion manual protegida en `/app/time`, reutiliza `createOvertimeCandidateSignal(...)` y `addOvertimeCandidateSource(...)`, mantiene idempotencia por persona/rango/fuentes/snapshots y muestra solo creados, ya existentes e ignorados por datos insuficientes.
- Escritura directa bloqueada para `authenticated`; RLS actua como segundo candado de lectura.
- I.22 verifica con `supabase/snippets/overtime-candidates-rls-verification.sql` que `owner`/`admin`/`manager` pueden operar, que `coach` y `payroll_manager` no revisan, que otro tenant no lee ni referencia, que las fuentes personales pertenecen a la persona afectada, que `closed`/`superseded` quedan no accionables y que `INSERT`/`UPDATE`/`DELETE` directos siguen bloqueados.
- La verificacion I.22 captura snapshot de `schedule_blocks`, `schedule_block_assignments`, `time_records` y `time_punches` para confirmar que anadir fuentes o cambiar estados de candidatos no muta horario ni fichaje.
- Auditoria con actor derivado, accion, resultado, estado anterior/nuevo, campos tocados, `created_at` y `retain_until`.
- Retencion candidata: candidatos 24 meses y eventos 180 dias, pendiente de revision legal/privacidad antes de datos reales.
- Datos prohibidos: salario, tarifa, importe, moneda, nomina, datos bancarios/fiscales, motivos sensibles de ausencias, salud, diagnosticos, documentos, ubicacion, coordenadas, IP/fingerprint, Wi-Fi/Bluetooth, signed URLs, rutas Storage, tokens, payloads completos, texto libre largo y reglas hardcodeadas de tenant/region.

Futuro seguro:

- definir calculo server-side prudente para planificado vs fichado, tratando fichajes abiertos/correcciones pendientes como `needs_review`;
- abrir solo una superficie minima de alertas/revision si aporta decision operativa;
- mantener payroll, importes, saldos legales, compensacion, cierre mensual legal y exporte legal definitivo fuera de la foundation.

## Fichaje

F.1 queda documentada el 2026-05-11 como modelado seguro de fichaje manual legal/auditable. F.2 implementa el primer schema minimo en `supabase/migrations/00010_time_tracking_manual_foundation.sql`, con RLS estricta, auditoria tecnica, RPC de fichaje propio y tipos Supabase actualizados. F.3 abre la primera capa servidor en `src/lib/time-tracking.ts` y `src/lib/time-tracking-actions.ts`. F.4/F.5/F.6 abren `/app/time` para fichaje propio, correcciones propias y revision administrativa minima. F.7 anade `supabase/migrations/00012_time_correction_application.sql` y una RPC transaccional para aplicar correcciones ya aprobadas. F.8 anade `supabase/migrations/00013_time_correction_policy.sql`, `00014_time_correction_direct_punch_policy.sql` y `00015_time_tracking_config_owner_guard.sql`: por defecto las correcciones propias se aplican directamente mediante RPC trazada. `00017_time_tracking_settings_management_policy.sql` permite que `owner`, `admin` y `manager` activen aprobacion previa en `organizations.time_tracking_config` sin abrir toda la configuracion global a `manager`. F.9 anade `getOwnTimeWeekOverview(...)` y una vista semanal en `/app/time` para comparar fichajes propios con bloques asignados. F.10 separa punches sustituidos/anulados del dia principal y los muestra solo como historial visible 30 dias. F.11 anade `supabase/migrations/00025_time_schedule_auto_punches.sql`, `source = schedule_auto`, flag `scheduleAutoPunchesEnabled`, RPC `generate_schedule_auto_time_punches(...)`, helper server-side e idempotencia por asignacion/tipo de punch. El corte 2026-05-23 anade `supabase/migrations/00047_staff_work_window_auto_time_punches.sql` para generar `schedule_auto` desde `staff_work_windows`, con RPC manager/catch-up, primitiva DB `generate_due_staff_work_window_auto_time_punches(...)`, idempotencia por franja+fecha+tipo, `presenceVerified = false` y snippet de activacion por `pg_cron`. F.12 anade `supabase/migrations/00026_time_weekly_closure_approval.sql`, estados semanales ampliados, envio idempotente, primitiva DB para cierre domingo 23:59 por timezone de organizacion, aprobacion con firma propia del aprobador, rechazo con nota obligatoria, reapertura auditada y bloqueo de modificaciones normales en semanas aprobadas. F.13 anade avisos in-app en Inicio derivados de `time_weekly_approvals`, cola de aprobacion para `owner`/`admin`/`manager`, avisos propios, navegacion a `/app/time?week=YYYY-MM-DD` y acciones de aprobar/rechazar con las RPC de F.12. F.14 reutiliza `time_exports` para registrar descargas CSV internas revisables desde `/app/time/export`, con validacion server-side de tenant, rol, rango y persona opcional. G.1-G.4 quedan como base tecnica para geolocalizacion nativa/wrapper futuro, no para lectura de ubicacion en webapp. No crea payroll, aprobacion legal de horas extra, seeds reales, tabla nueva de notificaciones, email/push de fichaje, exporte legal definitivo ni cumplimiento legal definitivo.

Principios F.1/F.2:

- Toda entidad de fichaje debe incluir `organization_id` obligatorio.
- El trabajador debe poder registrar entrada/salida manual propia y consultar sus propios registros.
- El fichaje puede vincularse a `schedule_blocks` y `schedule_block_assignments`, pero no debe depender de ellos.
- Las correcciones no editan historia en silencio: guardan motivo, autor, estado, valores anteriores/nuevos y trazabilidad.
- La aprobacion semanal es un cierre operativo/auditable, no una nomina ni un calculo legal definitivo.
- Los exportes deben ser revisables y auditables por rango, trabajador y organizacion.
- En Espana, conservar registros durante 4 anos queda documentado como nota de producto/legal pendiente de validacion externa.
- Geolocalizacion web, app nativa, payroll, exportes legales definitivos y horas extra automaticas quedan fuera de F.1-F.14.
- F.2 no concede UPDATE/DELETE directo sobre registros o punches manuales; los cambios historicos pasan por correccion/aprobacion/auditoria.
- F.3 valida inputs en servidor, deriva acciones propias desde sesion + tenant + persona vinculada y mantiene DB/RLS como segundo candado.
- F.6 permite que `owner`, `admin` y `manager` revisen correcciones pendientes del tenant activo desde `/app/time`.
- F.7 permite que `owner`, `admin` y `manager` apliquen solo correcciones `approved` mediante RPC controlada; los cambios historicos sobre punches no pasan por UI/actions directas.
- F.8 permite correcciones propias directas por defecto mediante `create_and_apply_own_time_record_correction(...)`; si `correctionApprovalRequired` esta activo, el flujo vuelve a solicitud pendiente.
- F.9 calcula avisos semanales en servidor desde la persona autenticada, sus `coach_profiles`, asignaciones `assigned`, bloques no cancelados y punches activos. La comparacion es operativa: no aprueba horas extra ni calcula nomina.
- F.11 genera fichajes automaticos desde clases/bloques asignados cuando `scheduleAutoPunchesEnabled = true`; no prueba presencia real y no usa ubicacion.
- F.12 envia o reenvia semanas a aprobacion mediante RPC idempotente, prepara ejecucion automatica el domingo a las 23:59 por timezone de organizacion, permite aprobar con firma propia del aprobador, rechazar con nota, bloquear semanas aprobadas y reenviar tras correcciones.
- F.13 expone notificaciones in-app derivadas de estados canonicos en Inicio; push movil queda para app nativa.
- F.14 genera un CSV interno revisable desde backend con sesion normal; incluye datos minimos de registro, punches activos, minutos trabajados seguros y estado semanal; no incluye snapshots, texto libre de correcciones, ubicacion ni payroll.

### `time_records`

Registro logico de jornada de una persona dentro de una organizacion. Es el contenedor de entradas/salidas, correcciones, aprobaciones y exportes.

Campos implementados en F.2:

- `id`
- `organization_id`
- `person_profile_id`
- `local_work_date`
- `timezone`
- `center_id` opcional
- `schedule_block_id` opcional
- `schedule_block_assignment_id` opcional
- `planned_start_at` opcional como snapshot del horario esperado
- `planned_end_at` opcional como snapshot del horario esperado
- `status`
- `created_by_user_id`
- `created_by_membership_id`
- `metadata`
- `created_at`
- `updated_at`

Estados implementados:

- `open`
- `submitted`
- `approved`
- `reopened`
- `voided`

Reglas implementadas:

- `organization_id` debe coincidir con persona, membership, centro, bloque y asignacion cuando existan.
- `schedule_block_id` y `schedule_block_assignment_id` son contexto opcional; si el horario cambia despues, el registro conserva su snapshot.
- Un trabajador puede tener registro manual sin bloque asignado.
- La vista semanal F.9 puede avisar de un dia asignado sin `time_record`, pero no crea un registro historico desde cero: eso requiere una RPC futura para no insertar historia laboral fuera del flujo auditado.
- F.11 crea o reutiliza el `time_record` diario desde RPC gestionada cuando genera fichajes automaticos por planificacion; el registro diario puede contener varios bloques y el snapshot de cada bloque vive en sus punches.
- El registro aprobado semanalmente solo se modifica mediante reapertura o correccion posterior auditada.
- La creacion propia se recomienda por `create_own_time_punch(...)`, que deriva `person_profile_id` desde `auth.uid()` + `organization_id`.
- F.3 expone `createOwnTimePunch(...)` y `createOwnTimePunchAction(...)` como capa app: exigen `organizationId`, no aceptan `person_profile_id`, validan timestamp con offset e ids opcionales de centro/bloque/asignacion antes de llamar al RPC.
- RLS permite lectura propia o revision por `owner`/`admin`/`manager` dentro del tenant activo.
- Decision 2026-05-14: `/app/time` permite elegir dia y hora al fichar, con valor por defecto actual. El servidor sigue validando timestamp con offset, tenant, persona propia y centro/bloque/asignacion opcionales; la UI no autoriza fichar por otra persona.
- Decision 2026-05-14: si una correccion crea o mueve un punch a otra fecha local, el punch debe quedar asociado al `time_record` de esa fecha local. `00030_time_punch_work_date_alignment.sql` resuelve o crea el registro de destino durante la aplicacion, y `00031_repair_correction_punch_record_dates.sql` repara punches de correccion activos previamente asociados al dia equivocado.

### `time_entries`

Nombre historico candidato para eventos de fichaje. F.2 fija el primer nombre real como `time_punches`.

### `time_punches`

Eventos manuales de entrada/salida dentro de un `time_record`.

Campos implementados en F.2:

- `id`
- `organization_id`
- `time_record_id`
- `person_profile_id`
- `punch_type`
- `occurred_at`
- `timezone`
- `center_id` opcional
- `schedule_block_id` opcional
- `schedule_block_assignment_id` opcional
- `source`
- `status`
- `created_by_user_id`
- `created_by_membership_id`
- `notes`
- `metadata`
- `created_at`
- `updated_at`

Tipos implementados:

- `clock_in`
- `clock_out`

Reglas implementadas:

- F.1 solo modela entrada y salida; pausas, descansos u otros eventos quedan para una decision posterior.
- `source = manual` es el origen permitido para el fichaje propio; F.7 usa `source = correction` solo desde `apply_time_record_correction(...)`; F.11 usa `source = schedule_auto` desde `generate_schedule_auto_time_punches(...)` y, desde el corte 2026-05-23, desde `generate_staff_work_window_auto_time_punches(...)`/`generate_due_staff_work_window_auto_time_punches(...)`.
- No se debe guardar ubicacion, coordenadas ni evidencia movil en F.1.
- Un punch reemplazado por correccion queda supersedido o versionado, no sobrescrito sin rastro.
- F.10 excluye punches `superseded` y `voided` de los fichajes visibles del dia y los muestra como historial reciente de cambios durante 30 dias desde `updated_at`.
- La ventana de 30 dias es de visibilidad en UI. No implica DELETE fisico de `time_punches`, `time_record_corrections` ni `time_audit_events` hasta cerrar una politica legal/tecnica de retencion.
- RLS permite crear punches propios solo si existe persona vinculada y el registro sigue `open` o `reopened`.
- Los punches `schedule_auto` guardan snapshot minimizado de bloque/asignacion/centro/horas previstas y `presenceVerified = false`; son idempotentes por `organization_id + schedule_block_assignment_id + punch_type` y siempre corregibles.

### `time_entry_corrections`

Nombre historico candidato. F.2 fija el primer nombre real como `time_record_corrections`, porque una correccion puede afectar al registro completo o a varios punches.

### `time_record_corrections`

Correcciones solicitadas, revisadas o aplicadas sobre registros y entradas/salidas.

Campos implementados en F.2:

- `id`
- `organization_id`
- `time_record_id`
- `time_punch_id` opcional
- `person_profile_id`
- `correction_type`
- `reason`
- `status`
- `before_snapshot`
- `after_snapshot`
- `requested_by_user_id`
- `requested_by_membership_id`
- `requested_by_person_profile_id`
- `reviewed_by_user_id`
- `reviewed_by_membership_id`
- `reviewed_by_person_profile_id`
- `reviewed_at`
- `review_note`
- `applied_at`
- `metadata`
- `created_at`
- `updated_at`

Estados implementados:

- `pending`
- `approved`
- `rejected`
- `cancelled`
- `applied`

Reglas implementadas:

- `reason` es obligatorio para toda correccion.
- El autor autenticado y su membership deben quedar trazados cuando existan.
- `before_snapshot` y `after_snapshot` deben ser objetos JSON minimizados y suficientes para reconstruir el cambio.
- Aprobar una correccion no debe ocultar quien la pidio, quien la aprobo ni que valores cambiaron.
- Rechazar una correccion requiere nota de revision; aprobar puede tener nota opcional.
- Si la semana ya estaba aprobada, la correccion debe reabrirla o quedar registrada como ajuste posterior.
- Desde F.8, la politica por defecto es directa: la RPC `create_and_apply_own_time_record_correction(...)` crea una correccion propia, la aplica en la misma transaccion y deja `status = applied`.
- Si `organizations.time_tracking_config.correctionApprovalRequired = true`, las correcciones empiezan en `pending`; `owner`/`admin`/`manager` revisan dentro del tenant y la aplicacion posterior usa F.7.
- F.6 muestra snapshots como resumen legible y no como JSON crudo; la UI de revision no acepta snapshots ni persona desde formularios.
- F.7 solo permite aplicar correcciones `approved`; `pending`, `rejected`, `cancelled` y `applied` quedan bloqueadas.
- F.8 no concede UPDATE/DELETE directo sobre `time_records` ni `time_punches`; la aplicacion directa sigue pasando por RPC, triggers y auditoria.
- `punch_add` crea un nuevo `time_punches` con `source = correction`.
- `punch_update` marca el punch original como `superseded` y crea un punch corregido con `source = correction`.
- `punch_void` marca el punch original como `voided`, sin borrar filas.
- `record_update` queda marcado como `applied` sin mutar `time_records`: el modelo actual no tiene un campo seguro de nota aplicada ni cambios de jornada controlados para este tipo.

### `time_weekly_approvals`

Cierre o aprobacion semanal de registros de una persona.

Campos implementados o ampliados en F.2/F.12:

- `id`
- `organization_id`
- `person_profile_id`
- `week_start_date`
- `status`
- `submitted_by_user_id`
- `submitted_by_membership_id`
- `submitted_by_person_profile_id`
- `submitted_at`
- `submission_source`
- `approved_by_user_id`
- `approved_by_membership_id`
- `approved_by_person_profile_id`
- `approved_at`
- `approval_signature_profile_signature_id`
- `approval_signature_snapshot`
- `approval_note`
- `rejected_by_user_id`
- `rejected_by_membership_id`
- `rejected_by_person_profile_id`
- `rejected_at`
- `rejection_note`
- `reopened_by_user_id`
- `reopened_by_membership_id`
- `reopened_by_person_profile_id`
- `reopened_at`
- `reopen_reason`
- `created_by_user_id`
- `created_by_membership_id`
- `snapshot`
- `notes`
- `metadata`
- `created_at`
- `updated_at`

Estados implementados:

- `open`
- `pending`
- `submitted`
- `approved`
- `rejected`
- `correction_required`
- `resubmitted`
- `reopened`
- `voided`

Reglas implementadas:

- La aprobacion semanal es trazabilidad operativa de cierre de fichajes, no payroll, no aprobacion legal de horas extra y no firma documental.
- `week_start_date` es lunes y la fila es unica por `organization_id`, `person_profile_id` y semana.
- `pending` queda como estado legacy compatible; el flujo nuevo usa `open`, `submitted`, `approved`, `rejected`, `correction_required`, `resubmitted`, `reopened` y `voided`.
- `submit_time_weekly_approval(...)` es idempotente: crea o actualiza la semana, marca registros `open/reopened` como `submitted` y usa `resubmitted` tras rechazo/correccion/reapertura.
- `submit_due_time_weekly_approvals(...)` es una primitiva `SECURITY DEFINER` para scheduler DB, no concedida a `anon` ni `authenticated`; `supabase/snippets/activate-time-weekly-close-job.sql` muestra como activarla con `pg_cron`.
- El scheduler evalua `organizations.timezone` y solo envia cuando la hora local de la organizacion es domingo 23:59; la semana enviada es el lunes-domingo que acaba ese domingo.
- El envio automatico cubre personas con registros de fichaje y personas con asignaciones activas de horario en la semana, manteniendo frontera `organization_id`.
- `approve_time_weekly_approval(...)` exige usuario autenticado con rol `owner`, `admin` o `manager` en el tenant, firma activa propia en `profile_signatures` y semana en estado enviable.
- La aprobacion guarda `approved_by_*`, `approval_signature_profile_signature_id` y `approval_signature_snapshot` con version/hash/ruta/dimensiones de la firma propia del aprobador; no usa la firma de la persona aprobada.
- `approval_signature_snapshot.meaning` identifica la accion como `internal_time_tracking_close_confirmation`; no debe presentarse como firma electronica avanzada/cualificada.
- `reject_time_weekly_approval(...)` exige `owner`, `admin` o `manager` y nota obligatoria; puede dejar estado `rejected` o `correction_required`.
- `reopen_time_weekly_approval(...)` exige `owner`, `admin` o `manager`, motivo obligatorio y solo opera sobre semanas `approved`.
- Las semanas aprobadas bloquean inserciones/actualizaciones normales de `time_records`, `time_punches` y `time_record_corrections`; solo las RPC de aprobacion/reapertura operan con contexto interno auditado.
- Los eventos `time_weekly_approval_submitted`, `time_weekly_approval_approved`, `time_weekly_approval_rejected` y `time_weekly_approval_reopened` quedan registrados en `time_audit_events`.
- F.13 lee `time_weekly_approvals` como fuente canonica para Inicio: gestores ven pendientes/reenviadas y rechazos/correcciones recientes; cada usuario ve sus semanas enviadas, aprobadas, rechazadas, con correccion requerida o reenviadas.
- Los avisos enlazan a `/app/time?week=YYYY-MM-DD` y no crean una tabla de notificaciones en este corte.
- La cola de Inicio puede aprobar con firma propia del aprobador o rechazar con nota obligatoria usando las RPC F.12; si falta firma propia, la UI lleva a crear "Mi firma" en `/app/account`.
- Este modelo queda preparado para una outbox/push movil futura sin desacoplarse del estado canonico.

### `time_exports`

Exportes revisables de registros de jornada.

Campos implementados en F.2:

- `id`
- `organization_id`
- `requested_by_user_id`
- `requested_by_membership_id`
- `date_from`
- `date_to`
- `person_profile_id` opcional
- `center_id` opcional
- `export_format`
- `export_scope`
- `status`
- `row_count`
- `generated_at`
- `failure_reason`
- `metadata`
- `created_at`
- `updated_at`

Reglas implementadas:

- El exporte debe respetar permisos y frontera de tenant.
- Si se guarda un archivo exportado, debe tratarse como documento privado o artefacto sensible con acceso controlado.
- Exportar datos de otra persona es candidato fuerte a auditoria.
- F.2 modela solo metadata del lote; no genera archivo ni guarda ruta Storage.
- F.14 genera el primer CSV directamente desde `GET /app/time/export` con sesion normal y sin `service_role`.
- La ruta valida `organization_id`, membership activa, rol `owner`/`admin`/`manager`, rango maximo inicial y `person_profile_id` opcional dentro del tenant.
- El CSV incluye organizacion, persona, fecha local, estado del registro, entradas/salidas activas, minutos trabajados por pares entrada-salida activos, estado de cierre semanal y contadores/resumenes de notas/correcciones.
- El CSV no incluye snapshots completos, texto libre de correcciones, ubicacion, rutas Storage, payroll, nominas, horas extra aprobadas ni garantia legal definitiva.
- `time_exports.status`, `row_count`, `generated_at`, `failure_reason` y `metadata` registran `requested/generated/failed`; los triggers existentes insertan `time_audit_events`.
- El primer corte no guarda el archivo exportado en Storage. Si se persisten archivos mas adelante, deberan usar artefacto privado, permisos, retencion y auditoria propios.

### `time_audit_events`

Auditoria especifica de fichaje.

Eventos implementados:

- `time_record_created`
- `time_punch_created`
- `time_punch_updated`
- `time_correction_requested`
- `time_correction_updated`
- `time_weekly_approval_created`
- `time_weekly_approval_updated`
- `time_export_requested`
- `time_export_updated`
- `time_settings_updated`
- `time_access_denied`

Reglas implementadas:

- Toda auditoria incluye `organization_id`.
- La metadata debe ser minimizada; no guardar contenido excesivo, URLs persistentes, secretos ni datos innecesarios.
- Las lecturas propias pueden no requerir evento individual en el primer corte, pero accesos administrativos, exportes y correcciones si son candidatos fuertes.
- F.2 crea triggers de auditoria para inserciones y cambios de estado relevantes. La lectura administrativa mas granular queda como posible endurecimiento futuro.

### Actores Y Permisos Candidatos

| Actor | Permisos candidatos |
|---|---|
| Trabajador/coach | Crear entrada/salida propia, consultar registros propios, solicitar correccion propia y ver estado de aprobacion propio. |
| `manager` | Revisar registros, resolver correcciones y aprobar semanas dentro del alcance operativo decidido; inicialmente tenant-wide hasta modelar centro. |
| `admin`/`owner` | Supervisar fichaje del tenant, configurar reglas, exportar y reabrir semanas; sin ediciones silenciosas. |
| `center_manager` futuro | Alcance por centro cuando exista frontera de centro en schema/RLS. |
| `payroll_manager` futuro | Consumir exportes validados o preparar cierre, sin convertir BoxOps en generador de nominas. |
| `staff` futuro | Trabajador no coach con fichaje propio y acceso a sus registros. |
| Representantes/Inspeccion futuros | Acceso controlado/exporte especifico solo tras validacion legal. |

Capacidades candidatas:

- `time_self_read`
- `time_self_punch`
- `time_self_correction_request`
- `time_team_read`
- `time_correction_review`
- `time_week_approve`
- `time_export_manage`
- `time_audit_read`

### Regla De Dominio

La webapp no debe usar geolocalizacion para fichar. El fichaje web puede ser manual o automatico por planificacion, pero no prueba presencia real y debe quedar corregible/aprobable. Si en Fase G/H se introduce ubicacion, sera desde app nativa o wrapper movil, minimizada, explicada, corregible y combinada con bloque asignado, centro correcto, ventana temporal y ausencia de fichaje activo.

### Fichaje Geolocalizado Asistido (G.1/G.2/G.3/G.4)

G.1 no crea schema ni UI. Tras la decision 2026-05-13, define el modelo candidato para una app nativa/wrapper futuro, no para pedir ubicacion desde la webapp.

G.2 tampoco crea schema ni UI. Cierra la decision tecnica/legal previa a implementacion: tablas candidatas, dato exacto a guardar, permisos, RLS/RPC esperadas y retencion.

G.3 implementa la primera base tecnica en `supabase/migrations/00018_time_location_assist_foundation.sql`: schema, constraints, RLS y RPCs minimas para ubicacion minimizada, sin UI visible, sin lectura de `navigator.geolocation`, sin geofencing activo y sin fichaje automatico por ubicacion.

G.4 implementa la primera capa server/app interna en `src/lib/time-location.ts`: helpers tipados que consumen las RPCs de G.3 con el cliente Supabase normal con sesion, sin `service_role`, sin componentes visibles, sin rutas nuevas y sin lectura de ubicacion real.

#### Configuracion por tenant/centro

Decision G.2: usar una tabla separada `center_time_location_settings`, no ampliar directamente `centers`, aunque `centers` tenga coordenadas candidatas. La razon es aislar activacion, politica, retencion, permisos de gestion y auditoria de cambios de una funcionalidad sensible.

G.3 implementa `center_time_location_settings` con estos campos principales:

- `id`
- `organization_id`
- `center_id`
- `status` (`draft`, `active`, `inactive`, `archived`)
- `center_latitude`
- `center_longitude`
- `radius_meters`
- `max_accuracy_meters`
- `timezone`
- `policy_version`
- `notice_text`
- `retention_days`
- `fallback_retention_days`
- `created_by_user_id`
- `created_by_membership_id`
- `updated_by_user_id`
- `updated_by_membership_id`
- `activated_at`
- `deactivated_at`
- `change_reason`
- `created_at`
- `updated_at`

Reglas:

- `organization_id` es obligatorio.
- `center_id` debe pertenecer al mismo `organization_id`.
- `center_latitude` y `center_longitude` son coordenadas del centro, no del trabajador.
- El radio sugerido inicial puede ser 100m, pero siempre configurable y revisable por precision real.
- `max_accuracy_meters` permite rechazar o degradar lecturas imprecisas.
- `policy_version` debe incrementarse cuando cambie radio, precision, aviso o politica relevante.
- `notice_text` no sustituye revision legal ni politica de privacidad; es copy operativo visible.
- `fallback_retention_days` permite conservar menos tiempo eventos de permiso denegado/no disponible/unsupported que eventos con resultado asistido.
- `owner` activa la politica tenant-level; G.3 permite a `owner`/`admin` mantener configuracion por centro mediante RPC acotada, pero una activacion nueva exige `owner`. `manager`, `center_manager`, `payroll_manager`, `staff` y `coach` no reciben permisos por herencia.
- La escritura directa de tabla no se concede a `authenticated`; las mutaciones pasan por `upsert_center_time_location_setting` y `set_center_time_location_setting_status`.
- La auditoria minima de cambios vive en la propia fila (`created_by_*`, `updated_by_*`, activacion/desactivacion y motivo opcional). Un historial completo de cambios queda como decision futura si legal/producto lo exige.

#### Eventos/evidencias minimizadas

Decision G.2: usar `time_location_events` como tabla candidata, porque no todo intento genera punch y porque los fallos de permiso/precision deben poder explicarse sin contaminar `time_audit_events`.

G.3 implementa `time_location_events` con estos campos principales:

- `id`
- `organization_id`
- `time_record_id` nullable
- `time_punch_id` nullable
- `person_profile_id`
- `actor_user_id`
- `actor_membership_id`
- `actor_person_profile_id`
- `center_id`
- `center_time_location_setting_id`
- `policy_version`
- `purpose` (`clock_in`, `clock_out`, `context_check`)
- `availability_status` (`available`, `permission_denied`, `unavailable`, `timeout`, `unsupported`, `inaccurate`)
- `assist_result` (`inside_radius`, `outside_radius`, `unknown`, `manual_fallback`)
- `accuracy_bucket` (`lte_25m`, `lte_50m`, `lte_100m`, `lte_250m`, `gt_250m`, `unknown`)
- `distance_bucket` (`inside_radius`, `outside_lte_25m`, `outside_lte_100m`, `outside_gt_100m`, `unknown`)
- `fallback_reason`
- `captured_at`
- `retain_until`
- `created_at`

Reglas:

- `organization_id` es obligatorio y debe coincidir con persona, centro, setting, registro y punch cuando existan.
- `person_profile_id` para acciones propias se deriva de `auth.uid()` + `organization_id`; no se acepta desde formularios.
- `time_punch_id` es opcional: permiso denegado, no disponible, timeout o fallback manual pueden no crear punch.
- `assist_result` y buckets son evidencia minimizada. No guardar distancia exacta.
- `accuracy_bucket` y `distance_bucket` se calculan desde campos controlados; no se acepta JSON libre de cliente.
- `retain_until` es obligatorio para que una purga futura no dependa de recordar reglas externas.
- `time_audit_events` puede seguir registrando eventos de fichaje/correccion, pero no debe guardar coordenadas ni payload de ubicacion.
- G.3 no incluye columna `metadata` en `time_location_events` para evitar payload libre, coordenadas crudas, mapas, tokens o fingerprints.
- `record_own_time_location_event` no acepta `person_profile_id`; deriva la persona desde `auth.uid()` + `organization_id` y valida dentro del tenant cualquier `center_id`, `time_record_id` o `time_punch_id`.
- La lectura propia devuelve solo eventos no expirados por `retain_until`; la lectura por registro permite a gestion de fichaje revisar evidencia minimizada del registro sin acceder a coordenadas crudas porque no existen.

#### Snapshot en `time_punches.metadata`

Decision G.2: usar tabla separada para la evidencia operativa y permitir solo un snapshot opcional muy reducido en `time_punches.metadata` cuando aporte explicabilidad al punch.

Permitido:

- `locationAssistVersion`
- `centerId`
- `assistResult`
- `accuracyBucket` y `distanceBucket` solo si se decide que aportan valor de disputa o soporte

Prohibido:

- coordenadas crudas del trabajador;
- distancia exacta;
- payload completo de `navigator.geolocation`;
- URLs de mapas, tokens, IP como proxy de ubicacion, BSSID/Wi-Fi/Bluetooth o fingerprints;
- JSON libre enviado desde UI;
- claves bloqueadas por la metadata segura actual: `latitude`, `longitude`, `coordinate`, `geolocation`, `gps`.

#### Datos que no deben guardarse

- trayectos;
- tracking continuo innecesario;
- historial de posiciones;
- coordenadas crudas persistidas del trabajador;
- lectura de ubicacion desde webapp;
- geofencing fiable con app cerrada desde navegador/PWA;
- URLs de mapas, tokens, trazas completas del navegador o datos GPS innecesarios para fichaje.

Si una implementacion futura de app nativa/wrapper necesita coordenadas del trabajador para calcular resultado, solo pueden tratarse como dato transitorio de calculo en cliente movil o servidor y descartarse sin logs ni persistencia. Persistir coordenadas crudas requeriria una decision legal/tecnica nueva y explicita.

#### RLS/RPC esperadas

- Escritura directa sobre `center_time_location_settings` y `time_location_events` revocada o limitada; usar RPCs acotadas.
- RPCs implementadas en G.3: `upsert_center_time_location_setting`, `set_center_time_location_setting_status`, `record_own_time_location_event`, `list_own_time_location_events`, `list_time_location_events_for_record`.
- Las RPCs deben validar sesion, membership activa, organizacion activa, permiso, centro del tenant, persona propia y registro/punch dentro del tenant.
- Lectura propia de `time_location_events` para la persona afectada.
- Lectura de gestion solo para capacidades de fichaje (`time_team_read`, `time_correction_review` o equivalente futuro) y siempre sin coordenadas crudas porque no existen en la tabla.
- Lectura de configuracion completa solo a roles/capacidades de configuracion. La UI futura de trabajador, si necesita aviso/estado, debe leer solo un resumen seguro.
- `service_role` no debe aparecer en `src` ni en helpers normales.

#### Capa server/app G.4

Helpers internos implementados:

- `getCenterTimeLocationSettings`
- `upsertCenterTimeLocationSetting`
- `setCenterTimeLocationSettingStatus`
- `recordOwnTimeLocationEvent`
- `listOwnTimeLocationEvents`
- `listTimeLocationEventsForRecord`

Reglas:

- usan `createClient` de Supabase SSR con sesion normal;
- no usan `service_role`;
- no aceptan `person_profile_id` en funciones propias;
- validan `organizationId`, `centerId`, `timeRecordId` y `timePunchId` en servidor cuando la sesion actual puede comprobarlo;
- delegan en RPC/RLS como segundo candado;
- solo manejan estados, resultados, buckets, fallback y referencias tenant-safe;
- no aceptan payload libre del navegador, coordenadas crudas del trabajador, distancia exacta, IP, BSSID/Wi-Fi/Bluetooth ni fingerprints;
- no crean UI visible, rutas nuevas, hooks cliente ni lectura de `navigator.geolocation`.

#### Retencion G.2

- `time_records`, `time_punches`, correcciones y auditoria canonica mantienen la politica legal de fichaje pendiente/candidata de 4 anos cuando aplique.
- `time_location_events` no hereda automaticamente esa retencion. Candidato: 90 dias para eventos con resultado/buckets y 30 dias para permiso denegado/no disponible/unsupported, salvo retencion legal explicita, disputa o exporte.
- La purga futura debe eliminar o anonimizar eventos de ubicacion sin borrar el punch canonico.
- Cualquier exporte para trabajador, representantes o Inspeccion queda pendiente de validacion legal y no convierte la ubicacion en prueba unica.

#### Limitaciones tecnicas documentadas

- La webapp/PWA no debe pedir ubicacion para fichar.
- La web/PWA no garantiza geofencing fiable con app cerrada.
- La precision en interiores puede ser mala o inestable incluso con app nativa.
- Background location/geofencing exige app nativa o wrapper movil, permisos del sistema operativo, politica de privacidad y revision legal.
- El fichaje web manual/automatico por planificacion y las correcciones Fase F siguen siendo el mecanismo principal hasta que exista app nativa.

## Documentos Y Certificaciones

E.1 queda documentada el 2026-05-08 como modelado seguro. E.2 implementa el primer schema minimo privado para metadata documental: `documents`, `document_versions`, `document_subjects` y `document_access_grants`. E.3 implementa Storage documental privado minimo con `document-files`, RPCs de version y policies de Storage. E.4 implementa auditoria documental minima con `document_access_events`, RLS estricta y RPCs de registro/consulta. E.5 implementa rutas backend controladas para preview/descarga de versiones privadas con signed URLs cortas y auditoria. E.6/I.27 documenta programacion util asociada a documentos y horario como base previa a cualquier IA. E.7/I.28 implementa `document_programming_links` como tabla puente tecnica para fecha/rango y contexto de horario, con RLS/RPC/helper. E.8/I.29 muestra una consulta minima autorizada desde detalle de bloque en `/app/schedule`. E.9/I.30 anade QA interno no visible con rollback para validar permisos, denegaciones, cross-tenant y que asignaciones no conceden permisos documentales. E.10/I.31 anade runbook operativo interno local/QA para validar manualmente esa programacion documental autorizada. No crea documentos firmables, boton "Firmar", snapshots reales, pagina documental completa, subida desde app ni IA.

Principios E.1:

- Toda entidad documental debe incluir `organization_id`; tambien las versiones, sujetos, grants, solicitudes de firma, evidencias y eventos de auditoria.
- STL no tiene tablas, rutas, policies ni permisos especiales. El primer tenant solo aportara datos/configuracion.
- La cabecera de documento, el archivo/version, los sujetos afectados, los permisos y la auditoria se modelan separados.
- Los archivos viven en Storage privado o mecanismo equivalente; `storage_path` es ruta interna, nunca URL publica persistente.
- El titulo, tipo, sensibilidad y metadata de un documento pueden revelar informacion sensible; no se deben tratar como datos publicos.
- `owner`, `admin` y `manager` no implican acceso automatico a nominas, contratos, documentos privados, evidencias de firma ni adjuntos privados.
- "Mi firma" sigue en `profile_signatures`; "Firmar documento" sera una accion futura sobre `document_versions` que crea evidencia propia.

Buckets privados. E.3 crea `document-files` como bucket privado minimo; `document-signature-evidence` sigue candidato futuro.

| Bucket | Uso | Ruta interna |
|---|---|---|
| `document-files` | Archivos documentales privados y versiones activas/archivadas. E.3 lo crea privado, con limite 10 MB y MIME cerrados. | `documents/{organization_id}/{document_id}/versions/{document_version_id}/{asset_id}.{ext}` |
| `document-signature-evidence` | Snapshots de firma aplicada y artefactos firmados futuros. | `signature-snapshots/{organization_id}/{document_id}/{request_id}/{evidence_id}.png` |
| `document-signature-evidence` | Copia/version firmada futura si se genera un PDF u otro artefacto cerrado. | `signed-documents/{organization_id}/{document_id}/{document_version_id}/{evidence_id}.{ext}` |

### `documents`

Cabecera logica del documento dentro de una organizacion. E.2 la implementa en `supabase/migrations/00007_document_metadata_private_foundation.sql`. No almacena el binario ni debe depender de rutas o reglas del primer tenant.

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
- `programming`: documento/enlace de programacion asociado a fecha, tipo de clase, centro opcional o bloque; la version canonica vive en `document_versions` y la visibilidad depende de grants/capacidades.

Valores candidatos de `sensitivity_level`:

- `public_internal`: visible para miembros activos segun regla del tenant.
- `restricted`: requiere grant/capacidad explicita.
- `sensitive_hr`: contrato, anexo, justificante, baja/permiso u otro dato laboral sensible.
- `payroll`: nomina, retribucion, dato bancario o documento salarial.
- `signature_evidence`: documento o snapshot firmado con acceso restringido.

Asociaciones:

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
- Un documento puede existir sin ser firmable. En E.2, `requires_signature` existe pero queda bloqueado por CHECK a `false`; documentos firmables se abriran en una migracion posterior.
- Si cambia el archivo, se crea `document_versions`; las firmas anteriores no se heredan automaticamente a la nueva version.
- Borrado inicial recomendado: archivado o borrado logico, con retencion definida antes de datos reales sensibles.

### `document_versions`

Archivo/version concreta de un documento. E.2 implementa metadata y ruta privada; E.3 crea el bucket privado y el ciclo tecnico de subida sin UI.

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
- `metadata`
- `created_at`
- `updated_at`
- `activated_at`
- `archived_at`

Reglas candidatas:

- `storage_bucket` debe ser privado; E.3 fija `document-files` con `public = false`.
- `storage_path` debe incluir `organization_id`, `document_id` y `document_version_id`.
- La ruta exacta la genera `begin_document_version_upload`; no se acepta `organization_id` ni `document_id` ajeno sin validar tenant y permisos.
- La subida a Storage requiere `document_versions.status = 'pending'`, `uploaded_by_user_id = auth.uid()` y path exacto.
- La lectura del archivo requiere version `active`/`archived`, documento `active`/`archived` y acceso por sujeto propio, grant o capacidad documental explicita.
- E.3 revoca escritura directa autenticada sobre `document_versions`; las versiones de archivo se crean/activan/cancelan por RPCs.
- Una version activa no se sobreescribe; reemplazar un archivo crea otra version.
- `document_hash` sirve para trazabilidad, cache controlada y futura evidencia de firma.
- Las URLs de acceso se emiten como signed URLs cortas o via ruta controlada tras comprobar permisos.

### `document_subjects`

Relaciona documentos con la persona, centro, bloque u otra entidad afectada. E.2 la implementa para separar "quien puede ver" de "a quien se refiere".

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
- `status`
- `metadata`
- `created_at`
- `updated_at`

Reglas candidatas:

- Los documentos privados de persona deben tener al menos un sujeto persona cuando afecten a alguien concreto.
- Que una persona sea sujeto del documento no concede acceso a terceros.
- Los sujetos deben pertenecer al mismo `organization_id`.
- Para programacion, los sujetos iniciales preferentes siguen siendo `class_type`, `center` y `schedule_block` cuando se trata de sujeto/contexto simple. E.7/I.28 anade `document_programming_links` para fecha/rango sin bloque y combinaciones por tipo/centro/bloque. E.8/I.29 consume esa asociacion desde Horario sin convertirla en permiso ni copiar contenido.

### `document_access_grants`

Define quien puede ver un documento cuando la visibilidad no es puramente global. E.2 lo implementa como grants explicitos por persona, membership, rol o capability.

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
- `grant_status`
- `granted_by_user_id`
- `expires_at`
- `revoked_at`
- `metadata`
- `created_at`
- `updated_at`

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
- En E.2 la lectura se permite por sujeto persona propio o por grant explicito; `manager` no obtiene lectura documental global.
- En E.2 la gestion queda acotada: `owner`/`admin` solo para documentos no sensibles de empresa/programacion/certificacion, `document_admin` para documentos privados/gestion/sensitive HR no payroll y `payroll_manager` para `payroll`.
- Para programacion, una asignacion en `schedule_block_assignments` no crea permiso documental. Si el coach asignado debe ver programacion, debe existir grant, capacidad o sujeto/documento que lo autorice dentro del tenant.

### `document_access_events`

Auditoria minima para accesos y cambios documentales sensibles. E.4 la implementa en `supabase/migrations/00009_document_access_audit_foundation.sql` como base tecnica. E.5 empieza a registrar preview/descarga real desde rutas backend controladas, todavia sin UI documental.

Campos implementados:

- `id`
- `organization_id`
- `document_id`
- `document_version_id`
- `actor_user_id`
- `actor_person_profile_id`
- `organization_membership_id`
- `event_type`
- `access_level`
- `result`
- `metadata`
- `created_at`

Valores implementados de `event_type`:

- `metadata_read`
- `file_preview`
- `file_download`
- `version_created`
- `version_activated`
- `version_archived`
- `grant_created`
- `grant_revoked`
- `subject_added`
- `subject_removed`

Reglas implementadas:

- `organization_id` es obligatorio y debe coincidir con documento/version.
- `actor_user_id` y `organization_membership_id` se derivan de `auth.uid()` y membership activa en `record_document_access_event`.
- `actor_person_profile_id` se resuelve si existe `person_profiles` activo para el usuario en el tenant.
- `result` queda cerrado a `allowed` o `denied`; los eventos `denied` solo aplican a lectura/preview/descarga.
- `metadata` debe ser un objeto pequeno y no puede guardar contenido documental, URLs, rutas Storage, tokens, firmas ni hashes documentales.
- La lectura de auditoria no se concede por herencia a `owner`, `admin` ni `manager`.
- `document_admin` puede leer auditoria de documentos no payroll; `payroll_manager` solo documentos `payroll`.
- E.4 no habilita lectura propia de auditoria para usuarios normales; se deja como decision futura si hay una pantalla controlada.
- `activate_document_version_upload` registra `version_activated` y `version_archived` cuando archiva una version activa previa.
- `file_preview` y `file_download` se registran en E.5 desde rutas backend controladas que validan tenant, version y permiso antes de emitir signed URLs cortas.

### Rutas documentales controladas E.5

Infraestructura backend minima para servir archivos documentales privados sin crear una pagina documental visible.

Rutas implementadas:

- `GET /app/documents/[documentId]/versions/[documentVersionId]/preview`
- `GET /app/documents/[documentId]/versions/[documentVersionId]/download`

Reglas implementadas:

- la sesion, organizacion activa y membership se resuelven en servidor;
- `document_id` y `document_version_id` se validan como UUID y se comprueban contra `organization_id`;
- solo se sirven versiones `active`/`archived` de documentos `active`/`archived`;
- `requires_signature = true` queda bloqueado;
- preview exige `can_access_document(..., 'preview')`;
- descarga exige `can_access_document(..., 'download')`;
- las signed URLs de `document-files` son cortas, no-cache y no se guardan en base de datos ni auditoria;
- cada acceso permitido registra `file_preview` o `file_download`;
- los intentos sin permiso registran `denied` cuando el documento/version existe en el tenant;
- la respuesta usa redirect a la signed URL y mantiene la ruta como infraestructura para UI futura.

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

### `document_programming_links`

Implementado en E.7/I.28 en `supabase/migrations/00042_document_programming_schedule_links.sql`.

Documentos de programacion asociados a fecha/rango, tipo de actividad, centro opcional o bloque. E.7/I.28 decide que `document_subjects` sigue siendo valido para sujetos/contexto simple, pero no basta para consultar programacion por fecha/rango + tipo/centro/bloque sin esconder semantica en texto libre. E.8/I.29 consume esa foundation desde el detalle de bloque como superficie minima de consulta, no como modulo documental completo. E.9/I.30 anade verificacion local/QA reejecutable en `supabase/snippets/document-programming-schedule-qa-verification.sql`, con rollback y datos internos. E.10/I.31 anade `docs/operations/document-programming-manual-validation-runbook.md` para repetir la validacion manual con datos locales/QA controlados.

Fuentes canonicas:

- `documents` con `document_scope = programming` es la cabecera canonica del contenido.
- `document_versions` es la version canonica: una UI futura debe resolver `current_version_id` o enlazar a una version concreta.
- `document_subjects` asocia la programacion a `class_type`, `center` o `schedule_block` cuando aplique como sujeto/contexto simple.
- `document_programming_links` asocia una version concreta a rango de fechas y contexto opcional de horario para consultas de programacion.
- `document_access_grants` concede metadata, preview, descarga o gestion; puede ser por persona, membership, rol o capacidad.
- `document_access_events` audita preview/descarga y, si se decide, metadata listada de programacion sensible.
- `supabase/snippets/document-programming-schedule-qa-verification.sql` valida que los grants reales, no las asignaciones, determinan que aparece en Horario.
- `docs/operations/document-programming-manual-validation-runbook.md` guia la seleccion de documento, version, grant, link y bloque para una validacion manual local/QA sin persistir cambios accidentales.

Campos implementados:

- `id`
- `organization_id`
- `document_id`
- `document_version_id`
- `starts_on`
- `ends_on`
- `class_type_id` opcional
- `center_id` opcional
- `schedule_block_id` opcional
- `status` (`active`, `removed`)
- `created_by_user_id`
- `updated_by_user_id`
- `created_at`
- `updated_at`

Asociaciones candidatas:

- Fecha + tipo de actividad: E.7/I.28 lo representa con `document_programming_links.starts_on`, `ends_on` y `class_type_id`.
- Centro opcional: E.7/I.28 lo representa con `center_id`, con unicidad parcial para no duplicar asociaciones activas equivalentes.
- Bloque concreto: `document_subjects.subject_type = 'schedule_block'` apunta al bloque real del tenant.
- Bloque concreto en programacion util: `document_programming_links.schedule_block_id` permite asociar una version a un bloque real y valida que la fecha del bloque quede dentro del rango.
- Tipo de actividad: `document_subjects.subject_type = 'class_type'` apunta al catalogo del tenant.
- Asignacion coach-bloque: `schedule_block_assignments` solo aporta contexto operativo de quien prepara o imparte; no es sujeto documental ni grant implicito.

Reglas implementadas:

- La relacion con fecha, centro, tipo de actividad, `schedule_blocks` o `schedule_block_assignments` debe ser tenant-safe y no convertir el horario en repositorio de contenido.
- La lectura respeta grants/capacidades documentales mediante `can_access_document(...)` antes de metadata, preview o descarga.
- Ver programacion desde un bloque se prepara con `list_document_programming_for_block(...)`, resolviendo documento/version autorizados y sin copiar contenido a `schedule_blocks`. E.8/I.29 lo muestra en `/app/schedule` con titulo/fuente, version/fecha, vigencia y acciones solo si `can_preview`/`can_download`.
- Consultar por fecha/tipo se prepara con `list_document_programming_for_context(...)`, devolviendo solo links activos, documentos `active`/`archived`, versiones `active`/`archived` y permiso vigente.
- Crear o retirar asociaciones pasa por RPCs `create_document_programming_link(...)` y `set_document_programming_link_status(...)`; no hay escritura directa de `authenticated`.
- Los documentos de programacion no deben contener salud, disciplina, rendimiento laboral, ubicacion, payroll, nominas, sanciones, bajas ni motivos personales.
- `schedule_blocks` y `schedule_block_assignments` solo aportan contexto operativo: cuando/donde/quien. No conceden por si solos acceso al contenido ni autorizan decisiones automaticas.
- `programming_content_read` y `programming_content_manage` quedan como capacidades validas en grants, pero solo tienen efecto si existe una fila explicita de `document_access_grants`.
- E.9/I.30 verifica con usuarios internos que un grant de descarga devuelve `can_preview`/`can_download`, un grant `read_metadata` devuelve solo metadata, un coach asignado sin grant recibe estado vacio, y otro tenant no lista ni enlaza contexto ajeno.
- E.10/I.31 no anade entidades nuevas: documenta como preparar o seleccionar un caso local/QA y como confirmar en Horario los resultados esperados por permiso, con rollback o limpieza clara.

### IA Futura Sobre Documentos Y Programacion

I.26 no crea schema. E.6/I.27 documenta primero la base util de programacion/documentos asociada a horario, sin IA. Solo despues podria encajar una capacidad asistida futura si el producto ya tiene documentos/programacion utiles.

Fuentes canonicas candidatas:

- `documents` con `document_scope = programming` para cabecera, titulo, sensibilidad y estado.
- `document_versions` para el contenido/version concreta que se puede consultar o resumir.
- `document_subjects`, `document_programming_links` y `document_access_grants` para asociar documentos a personas, centros, tipos, fechas, bloques o capacidades sin mezclar permisos en la UI.
- `document_access_events` o una auditoria equivalente futura para registrar accesos asistidos permitidos/denegados de forma minimizada.
- `schedule_blocks` y `schedule_block_assignments` solo como contexto operativo de clase/bloque, no como fuente de verdad documental.

Casos candidatos permitidos:

- resumir programacion autorizada por fecha, bloque, tipo de actividad o documento;
- responder preguntas sobre contenido autorizado por grants/capacidades;
- ayudar internamente a preparar una clase con contexto de horario y fuente documental visible para ese usuario;
- buscar o explicar contenido autorizado citando o enlazando la fuente documental cuando exista.

Casos prohibidos:

- decidir cobertura, asignaciones, swaps, aprobaciones de cambios, ausencias, fichaje, cierres semanales u horas extra;
- leer documentos sin grant/capacidad, cruzar datos entre tenants o usar roles altos como comodin de acceso;
- tratar payroll, nominas, importes, compensaciones, saldos o reglas legales definitivas;
- inferir salud, disciplina, rendimiento laboral, ubicacion, sanciones o situacion personal;
- entrenar, fine-tunear o evaluar modelos con datos privados del tenant sin decision explicita de producto, seguridad, privacidad y legal.

Antes de cualquier migracion futura:

- definir fuentes canonicas, permisos, grants, auditoria, retencion y politica de prompts/respuestas;
- decidir si el acceso asistido reutiliza `document_access_events` o requiere evento especifico minimizado;
- probar acceso denegado para otro tenant, rol sin permiso y documento sin grant;
- mantener fuera embeddings, vector search, jobs, prompts runtime, SDKs y UI hasta una task tecnica explicita.

## Decisiones Pendientes De Schema

- Por ahora `schedule_blocks` representa todo el horario operativo. Si mas adelante las clases puras necesitan datos propios, se añadira una tabla dependiente tipo `class_sessions`.
- Para MVP 1, `coverage_issues` se calculara al vuelo; persistirlo queda pendiente si hace falta auditoria, notificaciones, rendimiento o workflow historico.
- Si plantillas mensuales son entidad separada o variacion de `schedule_templates`.
- E.2 implementa `document_subjects` y `document_access_grants` como primer corte; queda pendiente decidir si alguna relacion futura necesita tablas puente especificas por entidad.
- E.6/I.27 bloquea cualquier tabla de IA hasta que programacion documental tenga uso real: fecha/tipo/centro/bloque modelados, permisos/grants probados, auditoria minimizada y politica de privacidad/legal definida.
- Alcance legal exacto de firma documental: confirmacion interna, firma electronica simple o integracion futura con proveedor especializado.
- La firma de perfil D.5 usa PNG privado; queda pendiente el formato final de snapshot de evidencia y, si procede, version firmada del documento.
- I.18 decide que eventos, festivos y competiciones comparten `operational_events` con `event_type` cerrado.
- Flujo completo de invitacion/registro por email para vincular `person_profiles.user_id` y, si procede, `coach_profiles.user_id` queda pendiente; el primer corte solo vincula cuentas Auth existentes por `user_id`.
- Alcance final de permisos `manager` frente a `admin` para perfiles, horarios, asignaciones y aprobaciones.
- Granularidad futura de fichaje despues de F.2: `time_records`/`time_punches` quedan como primer corte real; pausas, descansos, cierres por tramo o tablas adicionales quedan pendientes si el caso legal/producto lo exige.
- Alcance legal exacto de retencion, formato de exporte, acceso de representantes/Inspeccion y aprobacion semanal de fichaje.
- Modelo de logo/asset privado para `organizations.theme_config.logoAssetId` o equivalente queda pendiente; B.1 no guarda URLs publicas ni sube ficheros.
- Avatar personal propio queda implementado en D.4 con `profile_assets`, bucket privado, signed URL corta y acciones propias derivadas desde sesion + tenant. "Mi firma" propia queda implementada en D.5 con `profile_signatures`, bucket privado, signed URL corta y acciones propias derivadas desde sesion + tenant. E.2 implementa metadata/grants documentales minimos, E.3 Storage documental privado, E.4 auditoria documental minima y E.5 rutas controladas de preview/descarga; snapshots y evidencias de firma siguen como candidatos, sin implementarlos.
- Tablas especificas para contacto privado, empleo, payroll o auditoria real de datos personales no documentales quedan pendientes; no deben meterse en `person_profiles`.

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
| Jornada prevista del personal | `staff_work_windows` planifica presencia prevista por persona, dia, hora y centro opcional; no crea bloques ni asignaciones. Desde el corte 2026-05-23 puede crear fichajes `schedule_auto` idempotentes si `scheduleAutoPunchesEnabled` esta activo. |
| Cobertura MVP 1 al vuelo | `covered`, `uncovered`, `insufficient` y `conflict` se calculan desde bloques, asignaciones, coaches, personas y memberships. |
| Plantillas antes de calendario complejo | `schedule_templates` + `schedule_template_blocks` cubren el primer caso semanal/mensual. |
| Plantillas semanales basicas | `/app/templates` crea plantillas weekly, bloques de plantilla y aplica patrones a semanas reales sin duplicar bloques. |
| Dashboard operativo basico | `/app` calcula una cola de riesgos al vuelo y enlaza cada riesgo al bloque real en `/app/schedule`. |

## Decisiones Implementadas En Fase B.1

| Decision | Implementacion |
|---|---|
| `organizations.theme_config` como primer contenedor | Migracion `00003_organization_theme_config.sql` añade `theme_config jsonb not null default '{}'` con check de objeto JSON. |
| Ruta generica de configuracion | `/app/settings` gestiona configuracion minima del tenant activo y se enlaza desde `/app/more`. |
| Mutacion MVP restringida | En B.1 solo `admin` editaba nombre visible y color principal; B.2 amplia configuracion global a `owner` manteniendo `admin` compatible. |
| Frontera tenant | Todas las lecturas y updates usan `organization_id`/`id` de la organizacion resuelta por membership activa. |
| Marca ligera, no rebranding | El color principal modifica la marca ligera dentro del shell protegido; no toca estados criticos, error ni foco. |
| Logo fuera del corte | No hay subida real ni URL publica de logo hasta definir asset/Storage privado y permisos. |

## Decisiones Implementadas En Fase B.2

| Decision | Implementacion |
|---|---|
| Helpers de permisos de app | `src/lib/auth/permissions.ts` define roles reconocidos y capacidades reutilizables: configuracion global, gestion operativa, accesos, fichas operativas, lectura y funciones personales futuras. |
| Administrador compatible | `admin` conserva configuracion, accesos y toda la operativa MVP 1 para no romper smoke ni uso existente; la UI lo muestra como "Administrador". |
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

## Decisiones Implementadas En Fase E.2

| Decision | Implementacion |
|---|---|
| Schema minimo privado | `supabase/migrations/00007_document_metadata_private_foundation.sql` crea `documents`, `document_versions`, `document_subjects` y `document_access_grants` con `organization_id` obligatorio. |
| Bucket diferido | E.2 fija `document_versions.storage_bucket` a `document-files` y exige ruta tenant/document/version, pero deja bucket y policies para E.3. |
| Sin documentos firmables | `documents.requires_signature` existe para compatibilidad futura, pero queda bloqueado por CHECK a `false`. |
| Lectura estricta | RLS permite leer por sujeto persona propio o grant explicito; la gestion documental especializada tambien puede leer lo que gestiona. |
| Gestion explicita | `owner`/`admin` gestionan solo documentos no sensibles de empresa/programacion/certificacion; `document_admin` gestiona documentos privados/gestion/sensitive HR no payroll; `payroll_manager` queda reservado para `payroll`. |
| Separacion intacta | No se crean `document_access_events`, `coach_certifications`, `document_signature_requests`, `document_signature_evidences`, UI, uploads, snapshots ni auditoria real. |

## Decisiones Implementadas En Fase E.3

| Decision | Implementacion |
|---|---|
| Storage documental privado | `supabase/migrations/00008_document_files_private_storage.sql` crea `document-files` con `public = false`, limite 10 MB y MIME permitidos cerrados. |
| RPCs de version | `begin_document_version_upload`, `activate_document_version_upload` y `cancel_document_version_upload` validan tenant, permisos documentales, estado, MIME, tamano, hash y ruta interna. |
| Upload por metadata exacta | La policy de `storage.objects` acepta INSERT solo si existe `document_versions.pending` para el mismo bucket/path y uploader autenticado. |
| Lectura por acceso documental | La policy de SELECT exige version `active`/`archived`, documento `active`/`archived` y `can_access_document(..., 'preview')`. |
| Escritura directa cerrada | Se revoca INSERT/UPDATE autenticado sobre `document_versions`; la app debe usar RPCs para archivos documentales. |
| Frontera intacta | E.3 no crea UI, signed URLs en app, documentos firmables, snapshots, auditoria real, nominas, RRHH sensible, fichaje ni geolocalizacion. |

## Decisiones Implementadas En Fase E.4

| Decision | Implementacion |
|---|---|
| Auditoria documental minima | `supabase/migrations/00009_document_access_audit_foundation.sql` crea `document_access_events` con `organization_id`, documento/version, actor, membership, evento, resultado, access level, metadata y timestamp. |
| Metadata minimizada | `document_access_event_metadata_is_safe` limita metadata a objetos pequenos y bloquea contenido, URLs, rutas, tokens, storage, firmas y hashes documentales. |
| Registro controlado | `record_document_access_event` deriva actor desde `auth.uid()` + membership activa y valida permisos antes de registrar eventos `allowed`. |
| Lectura controlada | `list_document_access_events_for_document` y RLS usan `can_read_document_access_events`: `document_admin` lee no payroll y `payroll_manager` lee payroll. |
| Sin herencia sensible | `owner`, `admin` y `manager` no leen auditoria de `sensitive_hr` ni `payroll` por rol operativo alto. |
| Activacion auditada | `activate_document_version_upload` registra `version_activated` y `version_archived` cuando sustituye una version activa. |
| Preview/descarga futuros | `file_preview` y `file_download` quedan como tipos preparados para rutas controladas futuras, sin UI ni signed URLs en E.4. |
| Frontera intacta | E.4 no crea UI, preview/descarga desde app, documentos firmables, snapshots, evidencias de firma, nominas, RRHH sensible, fichaje ni geolocalizacion. |

## Decisiones Implementadas En Fase E.5

| Decision | Implementacion |
|---|---|
| Primer acceso real controlado | `src/app/(app)/app/documents/[documentId]/versions/[documentVersionId]/preview/route.ts` y `/download/route.ts` sirven versiones privadas mediante redirect a signed URL corta. |
| Helper servidor compartido | `src/lib/document-file-access.ts` centraliza sesion, tenant, version, permisos, signed URL y auditoria. |
| Permisos diferenciados | Preview usa `can_access_document(..., 'preview')`; descarga usa `can_access_document(..., 'download')`. |
| Auditoria de acceso | Accesos permitidos registran `file_preview`/`file_download`; denegaciones por falta de permiso registran `denied` cuando aplica. |
| Sin persistencia de URL | Signed URLs, rutas Storage, tokens, hashes y contenido no se guardan en metadata, auditoria ni base de datos. |
| Infraestructura sin UI | E.5 no crea pagina documental, listado, subida desde app, documentos firmables, boton "Firmar", snapshots, nominas, RRHH sensible, fichaje ni geolocalizacion. |

## Decisiones Documentadas En Fase F.1

| Decision | Documentacion |
|---|---|
| Docs antes de schema | F.1 no crea migraciones, RLS, UI, seeds, tipos Supabase ni tests tecnicos; solo cierra modelo candidato. |
| Jornada como contenedor | `time_records` agrupa persona, fecha local, estado, vinculos opcionales a horario y entradas/salidas. |
| Eventos manuales separados | `time_punches` representa entradas/salidas manuales; F.1 no guarda ubicacion ni origen automatico. |
| Correccion trazada | `time_record_corrections` exige motivo, autor, estado y snapshots antes/despues. |
| Aprobacion semanal | `time_weekly_approvals` modela cierre operativo auditable, no payroll. |
| Exportes auditables | `time_exports` y `time_audit_events` preparan revision por rango/persona/tenant y trazabilidad de accesos relevantes. |
| Frontera tenant | Todas las entidades candidatas incluyen `organization_id`; referencias a persona, membership, centro, bloque y asignacion deben pertenecer al mismo tenant. |
| Horario opcional | El fichaje puede enlazarse con `schedule_blocks`/`schedule_block_assignments`, pero no depende de ellos para registrar jornada. |
| Acceso propio | El trabajador/coach debe poder consultar sus propios registros, correcciones y aprobaciones dentro de su organizacion activa. |
| Sin geolocalizacion | F.1 deja fuera geofencing, app nativa, payroll, cumplimiento legal definitivo y horas extra automaticas. |

## Decisiones Implementadas En Fase F.2

| Decision | Implementacion |
|---|---|
| Schema minimo de fichaje | `supabase/migrations/00010_time_tracking_manual_foundation.sql` crea `time_records`, `time_punches`, `time_record_corrections`, `time_weekly_approvals`, `time_exports` y `time_audit_events`. |
| Frontera tenant obligatoria | Todas las tablas incluyen `organization_id` y FKs tenant-safe a persona, membership, centro, bloque y asignacion cuando aplica. |
| Fichaje propio derivado | `create_own_time_punch(...)` deriva persona desde `auth.uid()` + `organization_id`, crea/reusa el registro diario y no acepta fichar para otra persona. |
| Horario opcional | `schedule_block_id` y `schedule_block_assignment_id` son opcionales; un fichaje manual sin bloque/asignacion se permite y queda auditable. |
| Correcciones trazadas | `time_record_corrections` exige motivo no vacio, autor, estado cerrado y snapshots `before_snapshot`/`after_snapshot`. |
| Sin edicion silenciosa | No se conceden UPDATE/DELETE directos sobre `time_records` ni `time_punches`; revision y cambios pasan por correcciones, aprobaciones y auditoria. |
| Roles de revision | `owner`, `admin` y `manager` pueden revisar dentro del tenant; `center_manager` y `payroll_manager` no reciben permisos especiales en F.2. |
| Exportes diferidos | `time_exports` modela en F.2 metadata de lotes por rango/persona/centro/tenant; la generacion CSV interna llega despues en F.14 sin Storage. |
| Auditoria tecnica | Triggers crean `time_audit_events` para creacion de registros/punches, correcciones, aprobaciones y exportes; metadata minimizada y sin URLs/ubicacion. |
| Frontera intacta | F.2 no crea UI, rutas en `src/app`, geolocalizacion, app nativa, payroll, horas extra automaticas, seeds reales ni datos STL. |

## Decisiones Implementadas En Fase F.3

| Decision | Implementacion |
|---|---|
| Capa servidor sin UI | `src/lib/time-tracking.ts` centraliza helpers de fichaje manual y `src/lib/time-tracking-actions.ts` expone Server Actions delegadas, sin crear rutas nuevas en `src/app`. |
| Organizacion activa explicita | Los helpers exigen `organizationId` UUID y resuelven membership activa con `resolveActiveOrganization`; no se elige tenant implicitamente. |
| Acciones propias derivadas | `createOwnTimePunch` y `requestOwnTimeCorrection` derivan persona desde `auth.uid()` + `organization_id`; no aceptan `person_profile_id`. |
| RPC canonico | El fichaje propio llama a `create_own_time_punch(...)` y deja que DB/RLS vuelva a validar persona, tenant, registro abierto y contexto horario. |
| Validacion servidor | Se validan `clock_in`/`clock_out`, timestamp con offset, fecha local opcional, ids opcionales de centro/bloque/asignacion, notas, motivo y JSON minimizado. |
| Lectura propia | Se listan registros, punches, correcciones y aprobaciones propias filtrando por tenant y persona propia. |
| Revision tenant-wide acotada | `owner`/`admin`/`manager` pueden listar registros/punches/correcciones/aprobaciones del tenant activo y revisar correcciones pendientes; roles futuros no ganan permisos por defecto. |
| Sin `service_role` | La capa usa el cliente Supabase SSR normal con sesion de usuario; no introduce claves privilegiadas en cliente ni helpers normales. |
| Frontera intacta | F.3 no crea UI, rutas visibles, geolocalizacion, payroll, horas extra automaticas, exportacion real, seeds ni datos STL. |

## Decisiones Implementadas En Fase F.4

| Decision | Implementacion |
|---|---|
| Primera UI propia | `/app/time` crea la superficie protegida minima para fichaje manual propio. |
| Navegacion acotada | La ruta se enlaza en la seccion Personal del sidebar y desde `/app/more` en movil; la bottom nav principal no crece. |
| Fichaje propio | El formulario llama a `createOwnTimePunchAction` para `clock_in` y `clock_out`; no recibe ni envia `person_profile_id`. |
| Hora servidor | El primer corte registra el momento de envio en servidor; no abre edicion historica silenciosa desde UI. |
| Centro opcional seguro | La UI permite elegir un centro activo del tenant o fichar sin centro; bloque/asignacion quedan fuera hasta tener selector seguro de horario propio. |
| Lectura propia | La pagina usa helpers F.3 para listar registros, punches, correcciones y aprobaciones propias. |
| Estados seguros | Si falta persona vinculada, tenant o permiso, la UI queda en estado no disponible y RLS/RPC siguen cerrando la accion. |
| Copy legal prudente | La pantalla avisa que es fichaje manual auditable, sin geolocalizacion, sin payroll y sin garantia legal definitiva. |
| Frontera intacta | F.4 no crea geolocalizacion, app nativa/PWA avanzada, exportacion real, payroll, horas extra automaticas, seeds reales ni datos STL. |

## Decisiones Implementadas En Fase F.5

| Decision | Implementacion |
|---|---|
| UI de correccion propia | `/app/time` incorpora un formulario minimo para solicitar correcciones sobre registros propios recientes. |
| Accion servidor canonica | La ruta usa `requestOwnTimeCorrectionAction`; no inserta directamente en `time_record_corrections` desde componentes cliente. |
| Seleccion controlada | La UI permite elegir un `time_record` propio reciente y, para correcciones/anulaciones de hora, un `time_punch` propio asociado. |
| Tipos minimos seguros | Se exponen `punch_add`, `punch_update`, `punch_void` y `record_update` con labels operativos: anadir omitido, corregir hora, anular erroneo y nota/correccion de registro. |
| Motivo obligatorio | La Server Action de formulario rechaza solicitudes sin `reason`; F.3/RLS vuelven a validar antes de guardar. |
| Snapshots controlados | `beforeSnapshot` y `afterSnapshot` se construyen en servidor desde el registro/punch propio y campos escalares controlados; la UI no acepta JSON libre. |
| Persona derivada | El formulario no recibe `person_profile_id`; la Server Action deriva persona desde sesion + tenant y filtra `time_records`/`time_punches` por esa persona. |
| Sin edicion silenciosa | F.5 no hace UPDATE sobre `time_records` ni `time_punches`; solo crea solicitudes `pending` para revision/aplicacion futura. |
| Estados visibles | Correcciones propias recientes muestran `pending`, `approved`, `rejected`, `applied` o `cancelled` con labels de producto. |
| Frontera intacta | F.5 no crea aplicacion automatica de correcciones, consola administrativa, geolocalizacion, payroll, exportes reales, seeds ni datos STL. |

## Decisiones Implementadas En Fase F.6

| Decision | Implementacion |
|---|---|
| Revision minima en `/app/time` | La misma superficie de fichaje muestra una seccion de revision para roles autorizados, sin crear una consola administrativa separada. |
| Roles acotados | Solo `owner`, `admin` y `manager` pueden listar y resolver correcciones pendientes mediante `listTimeCorrectionsForReview` y `reviewTimeCorrectionAction`. |
| Acceso denegado visible | `coach`, `staff`, `center_manager`, `document_admin` y `payroll_manager` no reciben permisos especiales; la UI muestra estado no autorizado sin exponer solicitudes. |
| Datos legibles | Cada solicitud muestra solicitante, registro, punch si existe, tipo, motivo, estado, fecha y resumen de `before_snapshot`/`after_snapshot` sin JSON crudo grande. |
| Nota de rechazo obligatoria | La Server Action de formulario y `reviewTimeCorrection` rechazan decisiones `rejected` sin `review_note`; aprobar mantiene la nota opcional. |
| Trazabilidad de reviewer | El trigger de `time_record_corrections` conserva reviewer, membership/persona cuando existe y `reviewed_at` dentro del tenant activo. |
| Sin aplicacion historica | F.6 solo cambia la solicitud a `approved` o `rejected`; no actualiza ni borra `time_records` ni `time_punches`. |
| Frontera intacta | F.6 no crea geolocalizacion, payroll, horas extra automaticas, exportes reales, aprobacion semanal completa, seeds ni datos STL. |

## Decisiones Implementadas En Fase F.7

| Decision | Implementacion |
|---|---|
| Aplicacion por RPC | `apply_time_record_correction(...)` aplica correcciones aprobadas dentro de una transaccion y valida auth, membership activa, tenant y permiso. |
| Estado permitido | Solo `status = 'approved'` se puede aplicar; `pending`, `rejected`, `cancelled` y `applied` se rechazan. |
| Roles acotados | Solo `owner`, `admin` y `manager` heredan `can_manage_time_tracking`; `center_manager`, `payroll_manager` y `staff` no reciben permisos especiales. |
| Punch omitido | `punch_add` crea un nuevo `time_punches` con `source = 'correction'` y metadata enlazada a la correccion. |
| Punch corregido | `punch_update` marca el punch original como `superseded` y crea un punch corregido con `source = 'correction'`. |
| Punch anulado | `punch_void` cambia el estado del punch original a `voided`, sin DELETE. |
| Registro completo | `record_update` se marca como `applied` sin tocar `time_records`; el modelo actual no tiene campo seguro de nota aplicada ni mutacion controlada de jornada para este tipo. |
| Auditoria ampliada | Los cambios de estado de punches generan `time_punch_updated`; aplicar la correccion genera `time_correction_updated` con `applied_at`. |
| UI explicita | `/app/time` separa pendientes de aprobadas para aplicar y muestra resumen legible de snapshots y del efecto de aplicacion antes del boton. |
| Sin edicion silenciosa | UI/actions no hacen UPDATE/DELETE directo sobre `time_records` ni `time_punches`; la mutacion historica pasa por la RPC. |
| Frontera intacta | F.7 no crea payroll, nomina, horas extra automaticas, exportes reales, geolocalizacion, seeds ni datos STL. |

## Decisiones Implementadas En Fase F.8

| Decision | Implementacion |
|---|---|
| Politica por defecto | Las correcciones propias se aplican directamente; no pasan por solicitud salvo configuracion explicita del tenant. |
| Configuracion tenant-scoped | `organizations.time_tracking_config.correctionApprovalRequired` controla si el tenant exige aprobacion previa. |
| Permiso de configuracion | `Owner`, `admin` y `manager` cambian la politica desde `/app/settings`; una RPC acotada actualiza solo `time_tracking_config`, mantiene la configuracion global separada y registra `time_settings_updated`. |
| Aplicacion directa controlada | `create_and_apply_own_time_record_correction(...)` valida auth, membership activa, persona propia, tenant y configuracion antes de mutar historico. |
| Trazabilidad | La correccion directa conserva motivo, snapshots, `status = applied`, `applied_at`, metadata de modo directo y eventos de auditoria. |
| Modo aprobacion | Si `owner`, `admin` o `manager` activan aprobacion, `/app/time` vuelve a crear solicitudes `pending` y se mantiene el flujo F.6/F.7. |
| Frontera intacta | F.8 no crea geolocalizacion, payroll, exportes reales, horas extra automaticas, seeds ni datos STL. |

## Decisiones Implementadas En Fase F.9

| Decision | Implementacion |
|---|---|
| Semana reutilizada | `/app/time` reutiliza `resolveWeek` y `getAdjacentWeekStart` para navegar semanas como Horario/Cobertura. |
| Helper servidor | `getOwnTimeWeekOverview(...)` deriva persona y perfiles propios desde sesion + tenant, sin aceptar `person_profile_id` desde UI. |
| Horas asignadas | La comparacion usa asignaciones propias `assigned` y `schedule_blocks` no cancelados del tenant activo. |
| Horas fichadas | El balance usa pares activos `clock_in`/`clock_out`; punches `superseded` o `voided` no suman al calculo. |
| Avisos prudentes | La UI muestra falta, exceso, fichaje abierto o fichaje sin asignacion visible como avisos operativos, no como payroll ni horas extra aprobadas. |
| Correccion guiada | Los dias con `time_record` enlazan al formulario de correccion con `record_id` como estado de URL; la action revalida registro, persona y tenant. |
| Limitacion documentada | Un dia asignado sin `time_record` queda avisado, pero la creacion de una correccion historica desde cero requiere una RPC futura transaccional y auditable. |
| Frontera intacta | F.9 no crea geolocalizacion, payroll, aprobacion legal de horas extra, exportes reales, seeds ni datos STL. |

## Decisiones Implementadas En Fase F.10

| Decision | Implementacion |
|---|---|
| Vista principal limpia | `/app/time` muestra en los dias y registros solo punches `active`; `superseded` y `voided` ya no suman al contador principal ni aparecen mezclados con el fichaje vigente. |
| Historial reciente | Los punches sustituidos o anulados pasan a "Historial de cambios" dentro del registro afectado. |
| Ventana de 30 dias | El historial visible usa `updated_at` como fecha de cambio y se oculta tras 30 dias para reducir ruido operativo. |
| Sin borrado fisico | F.10 no borra filas de `time_punches`, correcciones ni auditoria; la retencion canonica queda pendiente de decision legal/tecnica. |
| Copy visible | La app usa "organizacion" en textos de usuario en lugar de "tenant"; nombres internos/imports tecnicos no se renombran. |
| Frontera intacta | F.10 no crea migraciones, jobs de purga, payroll, exportes legales, geolocalizacion ni datos STL. |

## Decisiones Implementadas En Fase F.11

| Decision | Implementacion |
|---|---|
| Modo configurable | `organizations.time_tracking_config.scheduleAutoPunchesEnabled` activa el automatico por planificacion; por defecto queda `false`. |
| Fuente diferenciada | `time_punches.source` permite `schedule_auto` ademas de `manual` y `correction`; el trigger rechaza inserciones directas fuera del contexto de generacion. |
| RPC canonica | `generate_schedule_auto_time_punches(...)` exige usuario autenticado, membership activa y permiso `owner`/`admin`/`manager`; no acepta `person_profile_id` desde acciones propias. |
| Base planificada | La generacion usa solo `schedule_block_assignments.assignment_status = assigned`, `coach_profiles.active`, persona visible/activa y `schedule_blocks` no cancelados del tenant. |
| Idempotencia | Un indice unico parcial evita duplicar `schedule_auto` por `organization_id`, `schedule_block_assignment_id` y `punch_type`; repetir el job devuelve los punches existentes. |
| Jornada prevista auto | `00047_staff_work_window_auto_time_punches.sql` anade idempotencia por `organization_id`, `person_profile_id`, `staffWorkWindowId`, `serviceDate` y `punch_type`; `generate_due_staff_work_window_auto_time_punches(...)` queda para scheduler DB y no se concede a `anon`/`authenticated`. |
| Snapshot minimo | Cada punch guarda bloque, asignacion, coach, centro, tipo, fecha, hora prevista, timezone, estado de bloque/asignacion y `presenceVerified = false` en `metadata`. |
| Registro diario | La RPC crea o reutiliza el `time_record` diario abierto; el detalle por bloque vive en los punches para soportar varios bloques el mismo dia. |
| Correcciones intactas | Un automatico por planificacion no prueba presencia real: retrasos, salidas anticipadas, sustituciones o cambios no reflejados se corrigen con el flujo existente. |
| Verificacion local | `supabase/snippets/time-schedule-auto-verification.sql` prueba con rollback generacion, idempotencia, bloque cancelado, permiso insuficiente, insercion directa rechazada y modo desactivado. |
| Frontera intacta | F.11 no introduce UI nueva, geolocalizacion, mapas, IP/Wi-Fi/Bluetooth, geofencing, push, payroll, horas extra automaticas, exportes legales, seeds ni datos STL. |

## Decisiones Implementadas En Fase F.12

| Decision | Implementacion |
|---|---|
| Estados semanales | `time_weekly_approvals.status` cubre `open`, `submitted`, `approved`, `rejected`, `correction_required`, `resubmitted`, `reopened` y `voided`, con `pending` como compatibilidad historica. |
| Envio semanal | `submit_time_weekly_approval(...)` envia o reenvia de forma idempotente; `submit_due_time_weekly_approvals(...)` prepara ejecucion DB cada domingo a las 23:59 por timezone de organizacion. |
| Firma propia de aprobador | `approve_time_weekly_approval(...)` exige firma activa propia del aprobador en `profile_signatures` y guarda snapshot/version; ningun rol firma por otra persona. |
| Rechazo trazado | `reject_time_weekly_approval(...)` exige nota obligatoria y deja la semana en `rejected` o `correction_required` para correccion/reenvio. |
| Semana cerrada | Una semana `approved` bloquea modificaciones normales de registros, punches y correcciones; `reopen_time_weekly_approval(...)` exige motivo y auditoria. |
| Auditoria | `time_audit_events` registra envio, aprobacion, rechazo y reapertura del cierre semanal. |
| Scheduler separado de UI | La activacion se documenta en `supabase/snippets/activate-time-weekly-close-job.sql`; la funcion de vencidos no se concede a `anon` ni `authenticated`. |
| Confirmacion interna | La firma semanal se documenta como confirmacion interna de cierre de fichajes, no como firma documental ni avanzada/cualificada. |

## Decisiones Implementadas En Fase F.13

| Decision | Documentacion |
|---|---|
| Notificaciones in-app | Inicio expone avisos para gestores y usuarios derivados de `time_weekly_approvals`; push movil queda para app nativa. |
| Sin tabla nueva | F.13 no crea tabla de notificaciones: compone cola/avisos desde estados canonicos y deja base conceptual para una outbox futura. |
| Cola de aprobaciones | `owner`, `admin` y `manager` ven pendientes/reenviadas, pueden abrir `/app/time?week=...`, firmar y aprobar con firma propia o rechazar con nota obligatoria. |
| Avisos propios | Cada usuario ve semanas enviadas, aprobadas, rechazadas, con correccion requerida o reenviadas y navega a la semana afectada. |
| Firma interna | La UI mantiene copy de cierre interno de fichajes; no presenta la aprobacion semanal como firma electronica avanzada/cualificada. |
| Sin geolocalizacion web | F.11-F.14 no introducen `navigator.geolocation`, mapas, IP, Wi-Fi/Bluetooth ni geofencing desde navegador/PWA. |

## Decisiones Implementadas En Fase F.14

| Decision | Implementacion |
|---|---|
| Exporte interno revisable | `/app/time` muestra una seccion secundaria para `owner`, `admin` y `manager`; la ruta `GET /app/time/export` devuelve CSV de fichajes. |
| Metadata canonica | Se reutiliza `time_exports`; no se crea tabla nueva ni se persiste archivo en Storage en este corte. |
| Validacion servidor | La descarga valida sesion, tenant, rol, rango y persona opcional con cliente Supabase normal y RLS como segundo candado. |
| Datos minimos | El CSV incluye organizacion, persona, fecha local, estado, punches activos, minutos trabajados por pares seguros, cierre semanal y resumen de correcciones. |
| Minimizar contenido sensible | No exporta snapshots completos, texto libre de correcciones, ubicacion, IP/Wi-Fi/Bluetooth, payroll, nominas ni horas extra aprobadas. |
| Copy prudente | La UI y el CSV hablan de exporte interno revisable; no prometen cumplimiento legal definitivo. |

## Decisiones Documentadas En Fase G.1

| Decision | Documentacion |
|---|---|
| Docs antes de schema | G.1 no crea migraciones, UI de mapa, lectura de `navigator.geolocation`, app nativa, geofencing ni fichaje automatico. |
| Web sin ubicacion | La webapp no pedira ubicacion para fichar; no se implementara `navigator.geolocation` en `src`. |
| Nativo futuro | La ubicacion futura queda reservada a app nativa/wrapper si se justifica por negocio, permisos, privacidad y revision legal. |
| Configuracion por centro | Se propone una entidad futura tenant-safe para latitud/longitud del centro, radio, timezone, estado y aviso/consentimiento, separada de copy de UI. |
| Evidencia separada | Si se guarda evidencia de ubicacion, se prefiere tabla futura con RLS, retencion y permisos propios; `time_punches.metadata` queda solo para snapshot minimizado. |
| Sin coordenadas en auditoria generica | `time_audit_events.metadata` mantiene bloqueo de claves de ubicacion; no se usara para coordenadas ni trazas GPS. |
| Fallback principal | Fichaje web manual, automatico por planificacion y correcciones Fase F siguen siendo la via principal. |
| Permisos acotados | G.1 no concede permisos nuevos a `center_manager`, `payroll_manager`, `staff` ni `coach`; cualquier G.2 debe validar tenant activo y permiso en servidor. |
| Limitacion tecnica | Navegador/PWA no garantiza geofencing fiable con app cerrada; automatismo en segundo plano requiere decision nativa/wrapper y revision legal. |
| Frontera intacta | G.1 no crea payroll, horas extra automaticas, exportes legales, promesa de cumplimiento definitivo, seeds ni datos STL. |

## Decisiones Documentadas En Fase G.2

| Decision | Documentacion |
|---|---|
| Decision antes de implementacion | G.2 no crea migraciones, UI, lectura de `navigator.geolocation`, geofencing activo ni app nativa; deja preparado el diseno tecnico/legal para una task futura nativa/wrapper. |
| Schema de configuracion | Candidato `center_time_location_settings` separado de `centers`, con `organization_id`, `center_id`, coordenadas del centro, radio, precision maxima, version de politica, aviso, retencion y auditoria de cambio. |
| Schema de eventos | Candidato `time_location_events` con `organization_id`, persona, usuario/membership actor, centro, setting, punch/record opcionales, resultado, buckets, fallback, `captured_at` y `retain_until`. |
| Dato persistido | Guardar resultado asistido y buckets de precision/distancia relativa al radio; no guardar distancia exacta ni coordenadas crudas persistidas del trabajador. |
| Snapshot minimizado | `time_punches.metadata` puede guardar solo version, centro y resultado, y buckets si se justifican; nunca JSON libre, coordenadas ni payload de navegador. |
| Datos transitorios | Coordenadas crudas del trabajador solo podrian tratarse transitoriamente para calcular resultado y descartarse sin logs; persistirlas exigiria decision legal/tecnica nueva. |
| Permisos | `owner` activa politica; `owner`/`admin` podran mantener configuracion si hay capacidad explicita; eventos propios se derivan desde sesion + tenant; gestion ve solo evidencia minimizada. |
| RLS/RPC | Escritura directa revocada o limitada; RPCs acotadas validan sesion, membership, tenant, centro, persona propia y punch/record del tenant. |
| Retencion | `time_location_events` no hereda automaticamente 4 anos; candidato 90 dias para eventos con resultado/buckets y 30 dias para denegado/no disponible, salvo retencion legal o disputa. |
| Frontera intacta | G.2 no introduce `service_role` en `src`, no hardcodea STL, no crea payroll, horas extra automaticas, exportes legales ni promesa de cumplimiento definitivo. |

## Decisiones Implementadas En Fase G.3

| Decision | Implementacion |
|---|---|
| Migracion tecnica | `supabase/migrations/00018_time_location_assist_foundation.sql` crea la base de schema/RPC/RLS sin tocar UI ni leer `navigator.geolocation`. |
| Configuracion por centro | `center_time_location_settings` guarda centro, estado, coordenadas del centro, radio, precision maxima, timezone, version de politica, aviso, retencion general/fallback y auditoria minima de cambio. |
| Evidencia minimizada | `time_location_events` guarda disponibilidad, resultado asistido, buckets, fallback, actor/persona/centro/setting/punch/record opcionales y `retain_until`; no tiene `metadata` libre. |
| Frontera de tenant | Todas las tablas tienen `organization_id` obligatorio y FKs compuestas contra centro, persona, setting, registro, punch y membership cuando existen. |
| Accion propia | `record_own_time_location_event` deriva persona desde `auth.uid()` + `organization_id`; no acepta `person_profile_id`. |
| Validacion de IDs | Las RPCs validan `center_id`, `time_record_id` y `time_punch_id` dentro de la organizacion activa y, en acciones propias, contra la persona autenticada. |
| RLS | Lectura de eventos propios para la persona afectada; lectura de gestion solo con permisos existentes de fichaje; configuracion completa solo para `owner`/`admin`. |
| Escritura directa | No se concede `INSERT`, `UPDATE` ni `DELETE` a `authenticated` sobre las tablas nuevas; las mutaciones pasan por RPCs acotadas. |
| Activacion | Una activacion nueva de ubicacion asistida exige `owner`; `owner`/`admin` pueden mantener configuracion existente mediante RPC. |
| Retencion | La retencion se calcula al registrar el evento: 90 dias por defecto para eventos con resultado/buckets y 30 dias para fallback/no disponible, ajustable por centro. |
| Datos prohibidos | No se persisten coordenadas crudas del trabajador, distancia exacta, precision exacta reportada, payload de navegador, mapas, tokens, IP como ubicacion, BSSID/Wi-Fi/Bluetooth ni fingerprints. |
| Frontera intacta | G.3 no crea UI visible, mapa, geofencing activo, app nativa, fichaje automatico por ubicacion, payroll, horas extra automaticas, exportes legales, seeds ni datos STL. |

## Decisiones Implementadas En Fase G.4

| Decision | Implementacion |
|---|---|
| Capa interna | `src/lib/time-location.ts` expone helpers server-side tipados para configuracion y eventos de ubicacion asistida. |
| Cliente Supabase | Los helpers usan el cliente Supabase SSR normal con sesion; no se introduce `service_role` en `src`. |
| Funciones propias | `recordOwnTimeLocationEvent` y `listOwnTimeLocationEvents` no aceptan `person_profile_id`; la persona se deriva desde sesion + tenant y la RPC vuelve a validarlo. |
| Validacion previa | La app valida UUIDs, organizacion activa, centro del tenant, registros/punches propios y permisos antes de llamar a las RPC cuando es razonable con RLS de sesion. |
| Permisos | Se anaden helpers internos `canManageTimeLocationSettings` y `canActivateTimeLocationSettings`, alineados con G.3: `owner`/`admin` mantienen configuracion y activacion nueva solo `owner`. |
| Evidencia minimizada | Los inputs de eventos solo aceptan disponibilidad, resultado, buckets, fallback, proposito y referencias opcionales a centro/registro/punch; no aceptan metadata ni payload libre. |
| Sin ubicacion real | No hay lectura de `navigator.geolocation`, hooks cliente, mapa, geofencing activo, fichaje automatico por ubicacion ni UI visible. |
| Frontera intacta | G.4 no crea rutas nuevas de producto, no guarda coordenadas crudas del trabajador, distancia exacta, IP, BSSID/Wi-Fi/Bluetooth, fingerprints, payroll, horas extra automaticas, exportes legales, seeds ni datos STL. |

## Decisiones Implementadas En Task 010

| Decision | Implementacion |
|---|---|
| Schema base reutilizado | El schema existente ya tenia `schedule_block_assignments` con tenant, FK y unicidad necesarias; el guardrail anti-solape se anade despues como trigger Postgres en `00011_schedule_assignment_overlap_guard.sql`. |
| Ruta de asignacion | `/app/schedule` permite asignar y retirar coaches por bloque sin crear dashboard. |
| Nombre visible | Las asignaciones muestran `person_profiles.display_name`; si falta perfil visible se usa fallback tecnico corto. |
| Perfiles internos excluidos | `visibility_status = internal` no aparece como coach asignable y no se puede asignar desde la action. |
| Compatibilidad Auth pendiente | Coaches con `person_profile_id` y `user_id = null` pueden cubrir bloques si la persona esta activa y visible. |
| Compatibilidad Auth existente | Coaches con `user_id` cuentan y pueden asignarse solo si su membership del tenant sigue activa. |
| Retirada sin borrado | Retirar cambia `assignment_status` a `removed`; reasignar reactiva esa fila. |
| Guardrail anti-solape | Un coach no puede quedar `assigned` en dos bloques activos solapados del mismo tenant/dia. Postgres bloquea la mutacion con `coach-unavailable`; `conflict` queda para datos legacy/importados o reglas futuras. |
| Permisos MVP | Tras B.2, `owner`, `admin` y `manager` mutan asignaciones operativas tenant-wide; `coach` conserva lectura. |

## Decisiones Implementadas En Task 011

| Decision | Implementacion |
|---|---|
| Filtros como estado de URL | `/app/schedule` conserva `organizationId`, `week`, `center_id`, `coach_profile_id`, `class_type_id`, `coverage_state`, `risks_only` y `mine` en query string. El estado interno del bloque no se expone como filtro operativo. |
| Sin migracion nueva | Los filtros usan `schedule_blocks`, `schedule_block_assignments`, `centers`, `class_types`, `coach_profiles` y la cobertura calculada existente. |
| Validacion tenant-scoped | Los IDs de centro, coach y tipo recibidos por URL se aplican solo si pertenecen a la organizacion activa; si no, se ignoran. |
| Coach asignado canonico | El filtro por coach se basa en `schedule_block_assignments.assignment_status = 'assigned'`, no en campos derivados ni en copy visible. |
| Riesgos activos | `risks_only=1` filtra `uncovered`, `insufficient` y `conflict`; `cancelled` y `completed` quedan fuera al ser cobertura `inactive`. |
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
| Rango como base | `valid_from` + `valid_until` rellena semanas del rango sin aplicacion manual semana a semana. |
| Excepcion semanal | Una aplicacion manual confirmada sustituye solo la semana/alcance afectados y no modifica otras semanas del rango base. |
| Excepciones de plantilla | Editar o cancelar un bloque aplicado desde plantilla marca `is_template_exception = true`. |
| Borrado acotado | Las plantillas se archivan con `status = 'archived'`, `archived_at` y `recoverable_until`. Los bloques de plantilla se pueden retirar con confirmacion explicita: se borra el patron, se retiran los `schedule_blocks` generados activos/no excepcionales derivados y el historico protegido queda desacoplado de `template_block_id`. |
| Recuperacion segura | Una plantilla archivada puede recuperarse durante 30 dias como `draft`; no vuelve a `active` automaticamente para evitar aplicar rangos sin decision explicita. |
| Historico independiente | Archivar una plantilla no borra horarios ya generados ni asignaciones. La retencion de `schedule_blocks` se decide separada de la retencion de plantillas. |
| Permisos B.2 | `owner`, `admin` y `manager` gestionan plantillas; `coach` consulta en modo lectura. |
| Sincronizacion de rango | Desde 2026-05-14, guardar plantilla/bloque activo sincroniza el rango activo de forma idempotente con `ensureScheduleTemplateRangeApplied(...)`, respetando excepciones. Desde 2026-06-08, crear bloques nuevos usa `ensureScheduleTemplateCurrentWeekApplied(...)` para sincronizar solo la semana visible y mantener la carga secuencial rapida. |
| Auditoria de retirada | La retirada de bloques de plantilla usa auditoria operativa corta con accion `removed` sobre `schedule_template_blocks`; no guarda notas completas ni sustituye auditoria legal/payroll. |
| Edicion multiple acotada | La UI permite seleccionar varios bloques y editar solo entrenador por defecto, notas, entrenadores necesarios y centro si la plantilla cubre todos los centros. |
| Centro heredado | Si la plantilla esta acotada a un centro, los bloques lo heredan y el campo de centro queda de lectura. |
| Filtros de trabajo | Los filtros colapsables por asignacion y tipo ayudan a resolver plantillas grandes sin cambiar el modelo ni el historico. |
| Foco por centro | Desde 2026-06-08, "Plantillas semanales" filtra por centro en URL y ofrece "Todas" como vista global. El foco se conserva en tabs/formularios/actions, pero no cambia el centro real persistido. |
| Creacion secuencial | La creacion rapida de un slot permite seleccionar varios dias y puede reabrir el modal tras guardar con confirmacion visible para seguir cargando clases sin volver a buscar el hueco. |

## Decision De Fixture Interno Fase A 2026-05-07

`supabase/snippets/stl-internal-assignment-sample-2026-05-04.sql` carga una muestra representativa para QA interno sobre la semana base de STL. No es seed automatico ni import de produccion.

| Decision | Implementacion |
|---|---|
| Datos fuera de `src` | La muestra vive en `supabase/snippets/`; no hay nombres ni reglas STL en codigo de producto. |
| Sin cuentas inventadas | El snippet no crea usuarios Auth ni envia invitaciones. Si el usuario E2E coach local existe, lo vincula a una ficha operativa existente para probar "Mi horario". |
| Asignaciones editables | Las filas de `schedule_block_assignments` usan `source = 'import'`, porque el enum actual no tiene un valor `sample`. |
| Plantilla mixta | La plantilla queda con 20 bloques con `default_coach_profile_id` y 145 vacantes, suficiente para probar defaults y huecos reales. |
| Cobertura representativa | La semana queda con bloques cubiertos, vacantes y un caso `insufficient`; los conflictos deliberados por coach solapado no se siembran porque el guardrail Postgres los rechaza. |
| Validacion oficial pendiente | La muestra desbloquea smoke interno; centro por bloque y asignaciones oficiales siguen pendientes de revision STL antes de produccion. |

## Decisiones Implementadas En Task 014

| Decision | Implementacion |
|---|---|
| Dashboard en inicio protegido | `/app` deja de ser solo inicio tecnico y muestra el dashboard operativo basico de cobertura. |
| Sin persistencia de incidencias | No se crea `coverage_issues`; la cola usa el calculo al vuelo de MVP 1. |
| Cola accionable | Los riesgos se ordenan por `uncovered`, `conflict` e `insufficient`. |
| Enlace al bloque real | Cada riesgo enlaza a `/app/schedule?...&block_id={id}` dentro de la semana y tenant activos. |
| Edicion multiple de cobertura | `/app/coverage` permite editar en lote tipo de actividad, entrenadores necesarios o entrenador comun sobre bloques con riesgo; el entrenador comun se filtra contra solapes visibles y la DB conserva el guardrail final. |
| Vistas de apoyo por centro | El dashboard crea atajos filtrados a `/app/schedule` conservando `organizationId` y `week`. |
| Roles MVP | Tras B.2, `owner`, `admin` y `manager` ven dashboard operativo; `coach` conserva lectura segura y accesos a Mi horario/plantillas. |
| Permisos B.2 | `manager` queda limitado a operativa MVP 1, sin configuracion global ni accesos. |

## Decisiones Implementadas En Estadisticas Operativas 2026-05-11

| Decision | Implementacion |
|---|---|
| Ruta secundaria | `/app/stats` cuelga de `/app/more` y no entra como item diario de navegacion. |
| Permiso real | Solo `owner`, `admin` y `manager` pueden consultar datos agregados; `coach` no ejecuta las consultas de estadisticas. |
| Fuentes fiables | El panel usa `schedule_blocks`, `schedule_block_assignments`, `coach_profiles`, `person_profiles`, `organization_memberships`, `centers` y `class_types`. |
| Sin migracion nueva | No crea tablas ni materializaciones; calcula agregados server-side dentro del tenant activo. |
| Filtros tenant-scoped | Rango, centro, coach y tipo se validan contra la organizacion activa; IDs invalidos o ajenos se ignoran. |
| Carga por coach | Las horas se calculan desde asignaciones `assigned` y bloques no cancelados. Si hay horas contratadas, la utilizacion se compara contra el contrato ajustado al rango. |
| Cobertura prudente | Los avisos reutilizan la cobertura calculada existente; bloques `cancelled` no cuentan y `completed` no abre riesgo activo. |
| Ausencias separadas | Vacaciones y saldos legales no se deducen desde horarios planificados. I.16 ya permite impacto operativo derivado de ausencias aprobadas o en revision sobre cobertura; calendario visible, saldos legales y uso con datos reales siguen pendientes. |
| Historico conservado | El panel es solo lectura; no modifica plantillas, aplicaciones a semana, `schedule_blocks` ni asignaciones historicas. |

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
| Migracion de sincronizacion | `class_types` soporta nombre, slug interno estable, categoria, coaches necesarios, certificacion, color, icono y estado; desde 2026-05-14 la edicion pasa por `update_class_type_and_sync_defaults(...)` para sincronizar defaults relacionados. |
| Catalogo por tenant | Todas las queries y mutaciones filtran por `organization_id`. |
| Color opcional | La app ofrece paleta rapida y acepta color hexadecimal manual `#rrggbb`; no se impone paleta cerrada. |
| Sin relacion por centro | Los tipos se mantienen a nivel organizacion hasta que horarios/bloques demuestren otra necesidad. |
| Sin borrado desde UI | Los tipos se activan/desactivan con `status` para preservar referencias futuras. |
| Defaults hacia adelante | Cambiar `required_coaches` actualiza plantillas y horarios presentes/futuros accionables, pero preserva bloques pasados, cancelados o completados. |

## Decisiones Implementadas En Task 007

| Decision | Implementacion |
|---|---|
| Ruta de horario semanal | `/app/schedule` gestiona bloques operativos reales del tenant en una semana concreta. |
| Sin migracion nueva | `schedule_blocks` ya soporta centro, tipo, fecha, horas, coaches necesarios, estado y notas. |
| Semana por query string | `week=YYYY-MM-DD` se normaliza al lunes de esa semana; la query filtra `service_date` entre lunes y domingo. |
| Bloque operativo, no clase pura | La UI usa copy de bloque/actividad para mantener abierto recepcion, evento, competicion u otras tareas. |
| Cancelacion sin borrado | Cancelar cambia `status` a `cancelled`; no se borran bloques desde UI. |
| Asignaciones fuera del corte | `schedule_block_assignments` quedo fuera de Task 007 y se implemento despues en Task 010. |
