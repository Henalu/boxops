# Tenant / RLS Negative Test Implementation Plan - BoxOps

Estado 2026-05-20. Este documento convierte la matriz documental de pruebas negativas tenant/RLS/permisos en un plan tecnico priorizado de implementacion local y registra los cortes locales ya ejecutados. Los cortes descritos no implementan features, migraciones, seeds, UI ni validaciones reales/staging.

No desbloquea S.8/A.1, B.4, OD.1/I.32 ni F.15. Esos gates siguen bloqueados mientras falten acceso real/staging, URL QA/staging, Supabase project/ref o DB URL, credenciales E2E por rol, tenant QA/staging, datos operativos controlados, SMTP real y evidencia redacted.

## Decision

El primer paquete minimo recomendable debe cubrir lo que da mas seguridad sin depender de staging ni Storage real:

1. `auth/session/tenant resolution` con helpers puros y, despues, un caso local con Supabase.
2. Roles base `owner`, `admin`, `manager` y `coach` sobre permisos de gestion, lectura y rutas protegidas.
3. IDs cross-tenant en superficies operativas basicas: centros, equipo/coaches, tipos, horario, asignaciones, plantillas y cobertura.
4. Documentos/grants solo en metadata local con SQL rollback; archivo real, bucket `document-files`, redireccion permitida y expiracion efectiva de signed URLs quedan como staging-only hasta E.16/S.8 con acceso real.

El plan prioriza tests que no exigen tocar producto. Si al implementar aparece que un test requiere refactor de Server Actions, rutas o permisos de producto, ese cambio debe abrir task propia y no mezclarse con la suite negativa.

## Estado Local 2026-05-18

S.12 implementa el primer paquete minimo local en `tests/smoke/tenant-rls-negative-local.spec.ts`, siguiendo el patron existente de smokes Playwright sin arrancar servidor ni crear datos persistentes.

Cubierto localmente:

- P0 source guard sobre `src`: bloquea hardcode de tenant, `service_role`, IA/embeddings/vector, geolocalizacion web, service worker, push, Background Sync y CacheStorage.
- P1 helper de `resolveActiveOrganization(...)`: `no_active_memberships`, `organization_required`, `organization_not_found` y resolucion valida por `organizationId`.
- P1 helper de permisos base: `owner`, `admin`, `manager` y `coach` mantienen sus capacidades MVP esperadas.
- P1 roles futuros/especializados: `center_manager`, `document_admin`, `payroll_manager` y `staff` no quedan activados para gestion MVP por este corte.

S.13 anade un segundo corte local muy acotado sobre el caso P1 de open redirect, sin credenciales, sin servidor y sin `code` real de Supabase. El unico cambio de `src` es un hardening minimo del helper compartido de redirects Auth.

Cubierto localmente por S.13:

- P1 helper de redirects Auth: `getSafeRedirectPath(...)` rechaza `next` externo `http(s)`, protocol-relative `//...`, backslash tipo `/\example.test/...` y valores no-path como `javascript:...`, devolviendo `/app`.
- P1 hardening Auth helper: `getSafeRedirectPath(...)` rechaza `\` para evitar normalizacion de `new URL(...)` hacia un host externo.
- P1 reset callback helper: `/reset-password` y `/reset-password?...` se mantienen como paths internos para el flujo de recuperacion.
- P1 login redirect helper: `getLoginPath(...)` sanitiza `redirectTo` externo antes de conservarlo en query string.
- Verificacion: `npx playwright test --config=playwright.smoke.config.ts tests/smoke/tenant-rls-negative-local.spec.ts` pasa con 11 tests.

S.14 anade un tercer corte local P2 helper-only sobre roles futuros/especializados, sin credenciales, sin servidor, sin Supabase real/local y sin cambios en `src`.

Cubierto localmente por S.14:

- P2 helper de permisos sensibles: `center_manager`, `document_admin`, `payroll_manager` y `staff` no reciben gestion de tenant/settings, accesos de equipo, operativa, fichaje, ubicacion asistida, solicitudes, ausencias, jornada prevista, eventos ni revision de candidatos de posible exceso.
- P2 guardrail de roles futuros: la cobertura se limita a helpers puros de `src/lib/auth/permissions.ts`; no activa permisos por centro, roles documentales, payroll ni capacidades nuevas.
- Verificacion: `npx playwright test --config=playwright.smoke.config.ts tests/smoke/tenant-rls-negative-local.spec.ts` pasa con 12 tests.

S.15 anade un cuarto corte local P2 source/static guard sobre validadores sensibles y limites de exporte, sin credenciales, sin servidor, sin Supabase real/local y sin cambios en `src`.

Cubierto localmente por S.15:

- P2 source guard de fichaje: `src/lib/time-tracking.ts` mantiene `FORBIDDEN_JSON_KEY_PATTERN` para claves sensibles de URL/path/token/secreto/firma/Storage/document hash/latitud/longitud/coordenadas/geolocalizacion/GPS, y metadata/snapshots siguen pasando por `normalizeJsonObject(...)` con `invalid_metadata`/`invalid_snapshot`.
- P2 source guard de ausencias: `src/lib/absence-requests.ts` mantiene `FORBIDDEN_REASON_SUMMARY_PATTERN` para URLs, base64, tokens, secretos, signed URLs, Storage, documentos, justificantes, payroll/salario/nomina, datos bancarios/identidad, ubicacion, salud, familia y sanciones; la creacion sigue usando `normalizeReasonSummary(...)`.
- P2 source guard de exporte CSV de fichaje: se mantienen rango maximo de 93 dias, limite de 1000 filas con consulta `MAX_TIME_EXPORT_ROWS + 1`, metadata minimizada (`internalReviewOnly`, `legalFinal: false`, `payroll: false`, `snapshotsIncluded: false`) y copy de exporte interno revisable.
- Verificacion: `npx playwright test --config=playwright.smoke.config.ts tests/smoke/tenant-rls-negative-local.spec.ts` pasa con 14 tests.

S.16 anade un quinto corte local P2 source/static guard sobre documentos/Storage/signed URLs, sin credenciales, sin servidor, sin Supabase real/local, sin Storage real, sin SQL rollback y sin cambios en `src`.

Cubierto localmente por S.16:

- P2 source guard de rutas E.5: preview/download siguen como rutas backend `force-dynamic` que delegan en `handleDocumentVersionFileAccess(...)`.
- P2 source guard de signed URLs documentales: `DOCUMENT_FILES_BUCKET` sigue en `document-files`, `DOCUMENT_FILE_SIGNED_URL_TTL_SECONDS` sigue en 60 segundos, la generacion usa `createSignedUrl(...)` solo en `src/lib/document-file-access.ts`, y el redirect conserva `Cache-Control: no-store` y `X-Robots-Tag: noindex`.
- P2 source guard de permisos/auditoria documental: el helper mantiene `can_access_document`, bloqueo de `requires_signature`, bucket esperado, estados legibles, auditoria `denied`/`allowed` y error `document_file_audit_required` antes de redirigir.
- P2 source guard de cliente documental visible: `/app/documents` y el panel de programacion documental de Horario solo construyen rutas backend condicionadas por `can_preview`/`can_download`, sin `createSignedUrl`, `signedUrl`, paths Storage ni bucket `document-files`.
- P2 source guard de repositorio minimo: `src/lib/documents.ts` solo expone metadata y capacidades `can_preview`/`can_download`; `00043_document_repository_minimal_visible.sql` mantiene `document.requires_signature = false` y `document_version.storage_bucket = 'document-files'`.
- Verificacion: `npx playwright test --config=playwright.smoke.config.ts tests/smoke/tenant-rls-negative-local.spec.ts` pasa con 17 tests.

S.17 anade un sexto corte local P2 source/static guard sobre auditoria documental y minimizacion de metadata, sin credenciales, sin servidor, sin Supabase real/local, sin Storage real, sin SQL rollback y sin cambios en `src`.

Cubierto localmente por S.17:

- P2 source guard de metadata de auditoria documental: `document_access_event_metadata_is_safe(...)` sigue exigiendo objeto JSON, tamano <= 4096, bloqueo recursivo de claves de contenido/rutas/tokens/secretos/firmas/Storage/document hash y rechazo de arrays, texto largo, URLs, `storage/v1`, private keys y signed URLs.
- P2 source guard de persistencia de auditoria: `document_access_events` sigue aplicando `document_access_events_metadata_safe`, resultados cerrados `allowed`/`denied`, version obligatoria para eventos de archivo/version y `denied` solo para `metadata_read`, `file_preview` y `file_download`.
- P2 source guard de registro: `record_document_access_event(...)` sigue derivando actor, membership y persona desde sesion/tenant, valida metadata antes de insertar y exige `can_access_document(...)`, `manage_grants` o gestion documental para eventos `allowed`.
- P2 source guard de lectura de auditoria documental: `can_read_document_access_events(...)` y `list_document_access_events_for_document(...)` siguen cerrados por capacidad explicita; `document_access_audit_read` se mantiene solo en `document_admin`, payroll solo en `payroll_manager`, sin herencia automatica para `owner`, `admin` o `manager`.
- Verificacion: `npx playwright test --config=playwright.smoke.config.ts tests/smoke/tenant-rls-negative-local.spec.ts` pasa con 19 tests.

S.18 anade un septimo corte local P2 source/static guard sobre grants documentales y separacion entre programacion documental y asignaciones de horario, sin credenciales, sin servidor, sin Supabase real/local, sin Storage real, sin SQL rollback y sin cambios en `src`.

Cubierto localmente por S.18:

- P2 source guard de `document_programming_links`: la tabla sigue tenant-scoped, ligada a `schedule_blocks` por FK compuesta con `organization_id`, con lectura RLS por `can_access_document(..., 'read_metadata')`, sin permisos directos de escritura para `authenticated`.
- P2 source guard de gestion de links: `create_document_programming_link(...)` y `set_document_programming_link_status(...)` siguen pasando por `can_manage_document_programming_link(...)`, que exige `can_access_document(..., 'manage')` sobre documento/version programacion.
- P2 source guard de consulta de programacion: `list_document_programming_for_block(...)` y `list_document_programming_for_context(...)` siguen filtrando por `can_access_document(..., normalized_access_level)` y derivan `can_preview`/`can_download` desde grants/capacidades, no desde asignaciones de horario.
- P2 source guard de separacion horario/documentos: `00042_document_programming_schedule_links.sql` y `src/lib/document-programming.ts` siguen sin usar `schedule_block_assignments` como permiso documental; el helper usa RPCs y no escrituras directas a `document_programming_links`.
- P2 source guard de superficies visibles: `/app/documents` y el panel documental de Horario siguen sin UI de grants, sin subida documental visible, sin `storage_path`, sin `signedUrl`/`createSignedUrl`, sin bucket `document-files` expuesto y sin `requires_signature`, `sensitive_hr`, `payroll` ni `signature_evidence` en la superficie visible.
- Verificacion: `npx playwright test --config=playwright.smoke.config.ts tests/smoke/tenant-rls-negative-local.spec.ts` pasa con 21 tests.

S.19 anade un octavo corte local P2 source/static guard sobre `document_access_grants` y capacidades documentales sensibles, sin credenciales, sin servidor, sin Supabase real/local, sin Storage real, sin SQL rollback y sin cambios en `src`.

Cubierto localmente por S.19:

- P2 source guard de `document_access_grants`: la tabla sigue tenant-scoped con FKs compuestas por `organization_id` hacia documentos, versiones, personas y memberships.
- P2 source guard de grants explicitos: cada grant sigue limitado a un unico destinatario entre `person_profile_id`, `organization_membership_id`, `role` o `capability`.
- P2 source guard de acceso por grants: `can_access_document(...)` sigue exigiendo membership activa, grant activo, no expirado, rank suficiente y match explicito por persona, membership, rol o capacidad.
- P2 source guard de gestion de grants: las policies de `document_access_grants` siguen cerradas por `can_access_document(..., 'manage_grants')`, `granted_by_user_id = auth.uid()` en creacion, campos sensibles inmutables y sin `DELETE` para `authenticated`.
- P2 source guard de capacidades sensibles: `document_grant_manage` y `document_access_audit_read` siguen solo en `document_admin`, `payroll_private_manage` solo en `payroll_manager`, y `signature_request_manage`, `document_sign_self` y `signature_evidence_read` siguen sin activacion por rol alto.
- Verificacion: `npx playwright test --config=playwright.smoke.config.ts tests/smoke/tenant-rls-negative-local.spec.ts` pasa con 22 tests.

S.20 anade un noveno corte local P2 source/static guard sobre `document_subjects`, sin credenciales, sin servidor, sin Supabase real/local, sin Storage real, sin SQL rollback y sin cambios en `src`.

Cubierto localmente por S.20:

- P2 source guard de `document_subjects`: la tabla sigue tenant-scoped y sus referencias a documento, persona, centro, coach, bloque y tipo de clase mantienen FKs compuestas por `organization_id`.
- P2 source guard de sujeto unico: `document_subjects_target_matches_type` sigue exigiendo un unico objetivo coherente con `subject_type` entre persona, centro, coach, bloque o tipo de clase, con metadata JSON objeto.
- P2 source guard de acceso por sujeto propio: `can_access_document(...)` sigue concediendo acceso por sujeto solo a la persona propia, con sujeto `active`, y solo hasta nivel `download`; no concede `manage` ni `manage_grants` por ser sujeto.
- P2 source guard de policies: lectura de sujetos exige `can_access_document(..., 'read_metadata')`, creacion/actualizacion exige `can_manage_document_by_id(...)` y no hay policy/grant de `DELETE` para `authenticated`.
- Verificacion: `npx playwright test --config=playwright.smoke.config.ts tests/smoke/tenant-rls-negative-local.spec.ts` pasa con 23 tests.

S.21 anade un decimo corte local P2 source/static guard sobre `document_versions` y el lifecycle privado de upload documental, sin credenciales, sin servidor, sin Supabase real/local, sin Storage real, sin SQL rollback y sin cambios en `src`.

Cubierto localmente por S.21:

- P2 source guard de `document_versions`: la tabla sigue tenant-scoped, con `storage_bucket = 'document-files'`, path exacto `documents/{organization_id}/{document_id}/versions/{document_version_id}/{asset_id}.{ext}`, unicidad bucket/path y estados `pending`, `active`, `archived` y `deleted`. La cancelacion sigue modelada como `status = 'deleted'`, no como nuevo estado `cancelled`.
- P2 source guard de bucket privado y validacion de archivo: `document-files` sigue privado, con limite de 10 MB, MIME permitidos cerrados, extension compatible con MIME, tamano positivo/acotado, hash SHA-256 hex de 64 caracteres y metadata JSON objeto.
- P2 source guard de `begin_document_version_upload(...)`: exige sesion, membership activa, documento `draft`/`active`, documento no firmable, `can_manage_document_by_id(...)`, nombre valido, MIME/extension/tamano/hash validos y crea solo version `pending` en path derivado de tenant/documento/version.
- P2 source guard de `activate_document_version_upload(...)`: exige version `pending` del uploader, documento no firmable, permiso de gestion, objeto exacto en Storage, tamano/MIME coincidentes, hash valido, archiva versiones activas previas, activa la nueva version, actualiza `current_version_id` y registra `version_archived` / `version_activated`.
- P2 source guard de `cancel_document_version_upload(...)`: solo puede marcar como `deleted` una version `pending` propia de documento `draft`/`active`, no firmable y gestionable.
- P2 source guard de Storage policies y grants: upload solo contra metadata `pending` exacta del uploader; lectura solo de versiones `active`/`archived` accesibles por `can_access_document(..., 'preview')`; `INSERT`/`UPDATE` directo sobre `document_versions` queda revocado para `authenticated` y las mutaciones pasan por RPCs.
- Verificacion: `npx playwright test --config=playwright.smoke.config.ts tests/smoke/tenant-rls-negative-local.spec.ts` pasa con 24 tests.

S.22 anade un undecimo corte local P2 source/static guard sobre Storage privado propio de avatar/firma y Mi cuenta, sin credenciales, sin servidor, sin Supabase real/local, sin Storage real, sin SQL rollback, sin Server Actions runtime y sin cambios en `src`.

Cubierto localmente por S.22:

- P2 source guard de buckets privados personales: `profile-assets` y `profile-signatures` siguen privados, con limites de tamano conservadores, MIME permitidos cerrados y metadata tenant-scoped en `profile_assets` / `profile_signatures`.
- P2 source guard de paths personales exactos: avatar y firma siguen derivados de tenant/persona/asset en `avatars/{organization_id}/{person_profile_id}/{asset_id}.{ext}` y `signatures/{organization_id}/{person_profile_id}/{signature_id}.png`, con hashes SHA-256 hex y unicidad bucket/path.
- P2 source guard de lifecycle propio: `begin_own_profile_avatar_upload`, `activate_own_profile_avatar_asset`, `cancel_own_profile_avatar_upload`, `begin_own_profile_signature_upload`, `activate_own_profile_signature` y `cancel_own_profile_signature_upload` siguen derivados de `auth.uid()` + tenant, persona activa propia, metadata `pending` y objeto Storage exacto antes de activar.
- P2 source guard de policies Storage personales: upload/lectura siguen ligados a metadata propia esperada, `person_profile.user_id = auth.uid()` y membership activa; no hay grants de `INSERT`/`UPDATE`/`DELETE` directos para `authenticated` sobre `profile_assets` ni `profile_signatures`.
- P2 source guard de Mi cuenta: las acciones no aceptan `person_profile_id`, `assetId` ni `signatureId` desde formulario, usan RPCs privadas, validan MIME/tamano/firma/dimensiones/hash y no persisten `avatar_url`, public URLs ni signed URLs.
- P2 source guard de previews personales: `/app/account` sigue usando signed URLs cortas desde servidor (`120` segundos) para avatar/firma, sin convertirlas en URL publica persistida.
- Verificacion: `npx playwright test --config=playwright.smoke.config.ts tests/smoke/tenant-rls-negative-local.spec.ts` pasa con 26 tests.

S.23 anade un duodecimo corte local P2 helper/runtime sobre validadores exportados de avatar/firma propios, con un source guard minimo de actions, sin credenciales, sin servidor, sin Supabase real/local, sin Storage real, sin SQL rollback, sin Server Actions runtime y sin cambios en `src`.

Cubierto localmente por S.23:

- P2 helper runtime de `validateAvatarUploadFile(...)`: rechazo de archivo ausente/vacio, MIME no permitido, tamano maximo, mismatch entre bytes y `file.size`, mismatch entre MIME declarado y firma real, y aceptacion minima de PNG/JPEG/WebP por firma real, extension, MIME y tamano.
- P2 helper runtime de `validateSignatureDataUrl(...)`: rechazo de data URL vacia, formato no permitido, base64 invalido, PNG truncado/estructura invalida, dimensiones fuera de rango y tamano/base64 excesivo; aceptacion de PNG data URL sintetico valido con MIME, bytes, tamano, width y height.
- P2 source guard de Mi cuenta: `updateOwnAvatar(...)` y `updateOwnSignature(...)` siguen calculando SHA-256 sobre bytes validados y pasan extension/MIME/tamano o width/height/tamano al RPC privado antes de subir a Storage.
- P2 guardrail de alcance: no se usa File API real del navegador, no se exportan helpers internos y no se prueba runtime autenticado ni Storage.
- Verificacion: `npx playwright test --config=playwright.smoke.config.ts tests/smoke/tenant-rls-negative-local.spec.ts` pasa con 29 tests.

S.24 anade un decimotercer corte local P2 helper/runtime sobre jornada prevista del personal, con source guard minimo de actions, sin credenciales, sin servidor, sin Supabase real/local, sin SQL rollback, sin Server Actions runtime y sin cambios en `src`.

Cubierto localmente por S.24:

- P2 helper runtime de `validateStaffWorkWindowForm(...)`: rechazo de persona/centro con UUID malformado, dia fuera de rango, rango horario invalido, fechas invalidas, estado no permitido, notas demasiado largas y notas con senales sensibles de contrato/nomina/documentos/salud/ubicacion/URLs/tokens/identidad/banca.
- P2 helper runtime de normalizacion prudente: centro opcional vacio y notas vacias se convierten en `null`, y el validador conserva solo campos esperados de jornada prevista antes de referencias DB.
- P2 source guard de mutaciones de jornada prevista: `createStaffWorkWindow(...)` y `updateStaffWorkWindow(...)` siguen validando formulario, validando referencias dentro de `context.organization.id`, escribiendo `staff_work_windows` con `organization_id` del contexto y filtrando update por `existingWindow.id` + `organization_id`.
- P2 source guard de auditoria minimizada: las notas de jornada prevista siguen auditandose como `auditFieldTouched()`, no como contenido completo en `operational_audit_events`.
- P2 guardrail de alcance: no se prueban referencias reales de persona/centro activo/inactivo/cross-tenant, RLS, Server Actions runtime ni rutas autenticadas.
- Verificacion: `npx playwright test --config=playwright.smoke.config.ts tests/smoke/tenant-rls-negative-local.spec.ts` pasa con 32 tests.

S.25 anade un decimocuarto corte local P2 helper/runtime sobre perfil personal propio en Mi cuenta, con source guard minimo de action, sin credenciales, sin servidor, sin Supabase real/local, sin Storage real, sin SQL rollback, sin Server Actions runtime y sin cambios en `src`.

Cubierto localmente por S.25:

- P2 helper runtime de `validatePersonalProfileForm(...)`: rechazo de `displayName` ausente, `displayName` demasiado largo, `preferredAlias` demasiado largo, `publicEmail` demasiado largo o invalido.
- P2 helper runtime de normalizacion prudente: `displayName` se trimea y respeta el limite maximo, mientras `preferredAlias` y `publicEmail` vacios se convierten en `null`.
- P2 source guard de perfil propio: `updateOwnPersonProfile(...)` sigue validando formulario, resolviendo contexto por sesion/membership/tenant, buscando `person_profiles` por `organization_id` + `user_id` y actualizando por `id` + `organization_id` + `user_id`.
- P2 source guard de alcance de Mi cuenta: la action de perfil propio no acepta `person_profile_id` desde formulario y no toca avatar, firma, documentos, Storage, payroll, contrato, datos bancarios, metadata ni RRHH sensible.
- P2 guardrail de alcance: no se prueba runtime autenticado, RLS, persona ajena/cross-tenant, perfil inexistente, POST directo ni rutas reales.
- Verificacion: `npx playwright test --config=playwright.smoke.config.ts tests/smoke/tenant-rls-negative-local.spec.ts` pasa con 35 tests.

S.26 anade un decimoquinto corte local P2 source/static guard sobre eventos operativos, sin credenciales, sin servidor, sin Supabase real/local, sin SQL rollback, sin Server Actions runtime y sin cambios en `src`.

Cubierto localmente por S.26:

- P2 source guard de entradas de eventos operativos: `src/lib/operational-events.ts` mantiene patrones de titulo/notas que bloquean URLs, base64, tokens, secretos, Storage, documentos, justificantes, payroll/salario/nomina, banca/identidad, ubicacion, IP/fingerprint, salud, familia y sanciones antes de persistir.
- P2 source guard de lectura por rol: `listOperationalEvents(...)` sigue filtrando a miembros no gestores por `status = active` y `visibility IN ('staff', 'all_staff')`, mientras las vistas de gestion requieren permisos.
- P2 source guard de mutaciones tenant-scoped: `createOperationalEvent(...)`, `updateOperationalEvent(...)` y `setOperationalEventStatus(...)` siguen exigiendo `requireManagement: true`, usando RPCs y pasando `target_organization_id` desde el contexto de organizacion resuelto, sin escrituras directas desde el helper.
- P2 source guard de actions de formulario: `src/app/(app)/app/schedule/operational-event-actions.ts` sigue resolviendo sesion, membership, tenant y `canManageOperationalEvents(...)`, restringiendo `returnPath` a `/app/schedule`, validando enums/centro/fechas y delegando en helpers server-side.
- P2 source guard DB/RLS: `00037_operational_events_foundation.sql` mantiene `operational_events` tenant-scoped, policy de lectura por `can_read_operational_event(...)`, `GRANT SELECT` sin grants directos de escritura a `authenticated`, RPCs protegidas por `can_manage_operational_events(...)` y auditoria minimizada.
- P2 guardrail de alcance: eventos siguen siendo contexto operativo; los helpers/actions de eventos no escriben horario, asignaciones, fichaje, documentos ni payroll, y no abren geolocalizacion web, service worker, push, CacheStorage o IA.
- Verificacion: `npx playwright test --config=playwright.smoke.config.ts tests/smoke/tenant-rls-negative-local.spec.ts` pasa con 38 tests.

S.27 anade un decimosexto corte local P2 source/static guard sobre solicitudes/cambios propios, sin credenciales, sin servidor, sin Supabase real/local, sin SQL rollback, sin Server Actions runtime y sin cambios en `src`.

Cubierto localmente por S.27:

- P2 source guard de summaries de solicitudes/cambios: `src/lib/change-requests.ts` mantiene `FORBIDDEN_SUMMARY_PATTERN`, longitud maxima y uso de `normalizeOptionalSummary(...)` para `reasonSummary` y `responseNoteSummary`.
- P2 source guard de identidad propia: las actions de `/app/requests` no aceptan actor, membership, persona ni requester coach desde formulario; resuelven usuario, memberships, organizacion, `person_profiles` y `coach_profiles` propios desde sesion + tenant.
- P2 source guard de creacion propia: `create_own_change_request(...)` deriva `current_membership_id`, `own_person_profile_id` y coach origen desde `auth.uid()` + `target_organization_id`, comprueba asignacion `assigned` del tenant y exige que la asignacion pertenezca al coach actual.
- P2 source guard de creacion/respuesta por helpers: `createChangeRequestWithTargets(...)`, `offerChangeRequestToCoach(...)` y `respondToChangeRequestTarget(...)` siguen validando referencias tenant-scoped, coach propio o gestion, targets activos y RPCs con `target_organization_id` derivado del contexto.
- P2 source guard de decisiones: `approveChangeRequest(...)`, `rejectChangeRequest(...)` y `applyApprovedChangeRequest(...)` siguen requiriendo gestion en helper/action; `cancelChangeRequest(...)` y `expireChangeRequest(...)` siguen delegando en RPC tenant-scoped.
- P2 source guard de mutaciones: helpers/actions no hacen escrituras directas a `change_requests`, `change_request_targets`, `schedule_blocks`, `schedule_block_assignments`, fichaje ni documentos; la unica mutacion de asignaciones queda en `apply_approved_change_request(...)` para solicitud aprobada y controlada.
- P2 guardrail de alcance: solicitudes/cambios no abren payroll, documentos firmables, subida documental visible, grants UI, geolocalizacion web, service worker, push, CacheStorage, IA ni permisos por centro.
- Verificacion: `npx playwright test --config=playwright.smoke.config.ts tests/smoke/tenant-rls-negative-local.spec.ts` pasa con 41 tests.

S.28 anade un decimoseptimo corte local P2 source/static guard sobre fichaje propio y cierre semanal, sin credenciales, sin servidor, sin Supabase real/local, sin SQL rollback, sin Server Actions runtime y sin cambios en `src`.

Cubierto localmente por S.28:

- P2 source guard de identidad propia en fichaje: `CreateOwnTimePunchInput` y las actions de `/app/time` no aceptan `personProfileId`/`person_profile_id` ajeno como autoridad; `resolveTimeTrackingContext(...)` y `resolveOwnCorrectionContext(...)` siguen derivando persona desde `auth.uid()` + `organization_id` + perfil activo.
- P2 source guard de fichajes y correcciones propias: `createOwnTimePunch(...)`, `requestOwnTimeCorrection(...)` y `createAndApplyOwnTimeCorrection(...)` siguen exigiendo `requireOwnPersonProfile`/`requirePersonalAccess`, filtrando `time_records`/`time_punches` por `organization_id` y `ownPersonProfileId`, y delegando en `create_own_time_punch(...)` o RPCs tenant-scoped cuando aplica.
- P2 source guard DB/RPC de fichaje propio: `create_own_time_punch(...)` sigue derivando `current_membership_id` y `own_person_profile_id` desde `auth.uid()` + tenant, validando contexto de horario para la persona autenticada y escribiendo `time_records`/`time_punches` con `own_person_profile_id`.
- P2 source guard de revision/exporte/automatico: `generateScheduleAutoTimePunches(...)`, `listTimeRecordsForReview(...)`, `listTimePunchesForReview(...)`, `listTimeCorrectionsForReview(...)`, `listTimeWeeklyApprovalsForReview(...)` y `generateTimeRecordsCsvExport(...)` siguen requiriendo `requireReviewAccess: true`; los filtros de persona/centro se validan dentro del tenant y `generate_schedule_auto_time_punches(...)` no muta `schedule_blocks` ni `schedule_block_assignments`.
- P2 source guard de cierre/aprobacion semanal: `approveTimeWeeklyApproval(...)`, `rejectTimeWeeklyApproval(...)` y `reopenTimeWeeklyApproval(...)` siguen detras de rol de revision; `approve_time_weekly_approval(...)` toma la firma activa desde `current_person_profile_id`, no desde firma/persona enviada por cliente, y solo actualiza `time_weekly_approvals`/`time_records`.
- P2 guardrail de alcance: fichaje sigue sin geolocalizacion web, payroll, documentos firmables, subida documental visible, grants UI, service worker, push, CacheStorage, IA, app nativa ni permisos por centro.
- Verificacion acotada: `npx playwright test --config=playwright.smoke.config.ts tests/smoke/tenant-rls-negative-local.spec.ts -g "time tracking local source guardrails"` pasa con 3 tests. No se reejecuta la suite completa de 44 tests por alcance del corte.

S.29 anade un decimoctavo corte local P2 source/static guard sobre auditoria de fichaje y semanas aprobadas/cerradas, sin credenciales, sin servidor, sin Supabase real/local, sin SQL rollback, sin Server Actions runtime y sin cambios en `src`.

Cubierto localmente por S.29:

- P2 source guard de `time_audit_events`: la tabla sigue tenant-scoped con `organization_id`, FKs tenant-safe hacia persona/registros/punches/correcciones/cierres/exportes, RLS habilitada y lectura limitada a persona propia o `can_manage_time_tracking(...)`.
- P2 source guard de grants/policies de auditoria: `authenticated` conserva solo `GRANT SELECT` sobre `time_audit_events`, sin INSERT/UPDATE/DELETE directos; la escritura sigue derivada de triggers.
- P2 source guard de metadata de auditoria de fichaje: `time_audit_event_metadata_is_safe(...)` sigue exigiendo objeto JSON, tamano <= 4000 y bloqueo de claves de contenido, URLs/paths, token/secreto, firma/Storage/document hash y ubicacion/coordenadas/GPS.
- P2 source guard de trigger de auditoria: `record_time_audit_event_from_trigger(...)` sigue derivando actor/membership/persona desde `auth.uid()` + tenant; para cierres semanales solo conserva `previousStatus`, `nextStatus` y `weekStartDate`, sin notas, snapshots, firma, Storage, documentos, ubicacion ni payroll.
- P2 source guard de mutaciones de registros/punches: `src/lib/time-tracking.ts` y `src/app/(app)/app/time/actions.ts` siguen sin `.update()`/`.delete()` directo normal sobre `time_records` ni `time_punches`; las mutaciones permanecen detras de RPCs, correcciones o cierre/reapertura controlados.
- P2 source guard de grants de `time_records`/`time_punches`: ambas tablas conservan solo `GRANT SELECT, INSERT` para `authenticated`, sin policies directas de UPDATE/DELETE.
- P2 source guard de estados cerrados: `validate_time_record_row(...)`, `validate_time_punch_row(...)` y `validate_time_record_correction_row(...)` bloquean cambios sobre semanas aprobadas fuera de `boxops.time_weekly_approval_management`; `approve_time_weekly_approval(...)` y `reopen_time_weekly_approval(...)` son los flujos explicitos que abren ese contexto y solo actualizan registros de la persona/semana.
- P2 guardrail de alcance: S.29 no abre payroll, documentos firmables, subida documental visible, grants UI, geolocalizacion web, service worker, push, CacheStorage, IA, app nativa ni permisos por centro.
- Verificacion acotada: `npx playwright test --config=playwright.smoke.config.ts tests/smoke/tenant-rls-negative-local.spec.ts -g "time tracking local source guardrails"` pasa con 5 tests. No se reejecuta la suite completa por alcance del corte.

S.30 anade un decimonoveno corte local P2 source/static guard sobre auditoria operativa corta, trazabilidad de cobertura y purga operativa, sin credenciales, sin servidor, sin Supabase real/local, sin SQL rollback, sin Server Actions runtime y sin cambios en `src`.

Cubierto localmente por S.30:

- P2 source guard de `operational_audit_events`: la tabla sigue tenant-scoped con `organization_id`, FKs tenant-safe de actor/membership/persona, `UNIQUE (id, organization_id)`, RLS, policy de lectura retenida y `GRANT SELECT` para `authenticated`, sin grants directos de INSERT/UPDATE/DELETE.
- P2 source guard de lectura general de auditoria operativa: `can_read_operational_audit_events(...)` sigue limitado a `owner`/`admin`, sin `manager`.
- P2 source guard de registro de auditoria operativa: `record_operational_audit_event(...)` sigue derivando usuario, membership, persona y retencion desde `auth.uid()` + tenant, validando entidad dentro del tenant y `changed_fields` antes de persistir.
- P2 source guard de minimizacion de `changed_fields`: `operational_audit_changed_fields_is_safe(...)` sigue bloqueando payloads, documentos, payroll, ubicacion, IP/fingerprint, tokens, secretos, signed URLs, Storage, cookies/sesiones, arrays y contenido largo.
- P2 source guard de purga operativa: `purge_expired_operational_audit_events(...)` sigue acotada a batch 1..5000, borra solo `retain_until < now()`, queda revocada para `PUBLIC`, `anon` y `authenticated`, y no se llama desde `src/app` ni `src/lib`.
- P2 source guard de trazabilidad de cobertura: `list_coverage_trace_audit_events(...)` sigue limitada a `owner`/`admin`/`manager`, filtra por `organization_id`, `retain_until > now()` y solo `schedule_blocks`, `schedule_block_assignments` y `schedule_template_blocks`.
- P2 source guard de detalle visible de cobertura: `listCoverageTraceItems(...)` sigue exigiendo `canManageOperationalData`, resolviendo tenant explicito y mostrando solo nombres de campos minimizados, sin payload completo, motivos sensibles ni `reason_summary`.
- P2 guardrail de alcance: S.30 no abre audit dashboard, payroll, documentos firmables, subida documental visible, grants UI, geolocalizacion web, service worker, push, CacheStorage, IA, app nativa ni permisos por centro.
- Verificacion acotada: `npx playwright test --config=playwright.smoke.config.ts tests/smoke/tenant-rls-negative-local.spec.ts -g "operational audit local source guardrails"` pasa con 2 tests. No se reejecuta la suite completa por alcance del corte.

S.31 anade un vigesimo corte local P2 source/static guard sobre candidatos operativos de posible exceso, sin credenciales, sin servidor, sin Supabase real/local, sin SQL rollback, sin Server Actions runtime y sin cambios en `src`.

Cubierto localmente por S.31:

- P2 source guard de lectura de candidatos: `overtime_candidates`, `overtime_candidate_sources` y `overtime_candidate_events` siguen tenant-scoped, con RLS y policies de lectura por `can_read_overtime_candidate(...)`; `authenticated` conserva solo `GRANT SELECT`, sin INSERT/UPDATE/DELETE directos sobre esas tablas.
- P2 source guard de roles/lectura: `can_review_overtime_candidates(...)` sigue limitado a `owner`/`admin`/`manager`; fuera de roles revisores, `can_read_overtime_candidate(...)` y `list_overtime_candidates(...)` filtran por `get_own_person_profile_id(...)` y bloquean `target_person_profile_id` ajeno.
- P2 source guard de helpers: `resolveOvertimeCandidateContext(...)` resuelve `organizationId` contra memberships activas, exige `canReadOvertimeCandidates(...)` para lectura y `canReviewOvertimeCandidates(...)` para revision; las lecturas filtran por `organization_id` y los listados pasan por RPC tenant-scoped.
- P2 source guard de deteccion: `detectOperationalOvertimeCandidates(...)` sigue exigiendo rol revisor, rango acotado y lecturas por `organization_id` sobre fichaje, aprobaciones, horario, asignaciones y jornada prevista; solo crea candidatos con `detectionSource: "time_difference"` cuando hay diferencia positiva clara y fuentes operativas existentes.
- P2 source guard de estados terminales: `addMissingSources(...)`, `setOvertimeCandidateStatus(...)`, `addOvertimeCandidateSource(...)` y las RPCs `add_overtime_candidate_source(...)` / `set_overtime_candidate_status(...)` mantienen `closed`/`superseded` como no accionables.
- P2 source guard de auditoria/minimizacion: `record_overtime_candidate_event_internal(...)` sigue derivando actor/membership/persona desde `auth.uid()` + tenant y valida `changed_fields` mediante `overtime_candidate_changed_fields_is_safe(...)`.
- P2 guardrail de alcance: S.31 no abre payroll, nomina, hora extra aprobada, exporte legal, documentos firmables, subida documental visible, grants UI, geolocalizacion web, service worker, push, CacheStorage, IA, app nativa ni permisos por centro.
- Verificacion acotada: `npx playwright test --config=playwright.smoke.config.ts tests/smoke/tenant-rls-negative-local.spec.ts -g "overtime candidates local source guardrails"` pasa con 2 tests. No se reejecuta la suite completa por alcance del corte.

S.32 anade un vigesimo primer corte local P2 source/static guard sobre superficies operativas base de administracion, sin credenciales, sin servidor, sin Supabase real/local, sin SQL rollback, sin Server Actions runtime y sin cambios en `src`.

Cubierto localmente por S.32:

- P2 source guard de contextos de accion: centros, tipos, horario, plantillas y cobertura siguen resolviendo usuario, memberships, organizacion activa y `canManageOperationalData(...)` antes de mutar; las actions exportadas pasan por el contexto protegido correspondiente.
- P2 source guard de separacion de responsabilidades: equipo sigue usando `canManageTeamAccess(...)` o `canManageOperationalTeamProfiles(...)`, mientras settings usa `canManageTenantSettings(...)` o `canManageTimeTrackingSettings(...)`; el permiso operativo diario no abre settings globales ni roles/memberships.
- P2 source guard de referencias tenant-scoped: centros, equipo, horario, plantillas y cobertura siguen validando referencias como centro, persona, coach, tipo, bloque, asignacion y plantilla con `organization_id`.
- P2 source guard de tipos de actividad: `updateClassType(...)` sigue delegando en `update_class_type_and_sync_defaults(...)`, y la RPC sigue limitada a `owner`/`admin`/`manager`, filtrada por `target_organization_id`, con sincronizacion de `required_coaches` en plantillas y horarios actuales/futuros no `cancelled`/`completed`.
- P2 guardrail de alcance: las actions operativas base no abren `center_manager`, documentos, fichaje, ubicacion asistida, payroll/nomina, compensacion, hora extra aprobada, IA, app nativa, geofencing, push, service worker ni CacheStorage.
- Verificacion acotada: `npx playwright test --config=playwright.smoke.config.ts tests/smoke/tenant-rls-negative-local.spec.ts -g "base operational admin local source guardrails"` pasa con 2 tests. No se reejecuta la suite completa por alcance del corte.

S.33 anade un vigesimo segundo corte local P2 source/static guard sobre paginas/listados operativos base, sin credenciales, sin servidor, sin Supabase real/local, sin SQL rollback, sin Server Actions runtime y sin cambios en `src`.

Cubierto localmente por S.33:

- P2 source guard de resolucion de paginas/listados: centros, equipo, tipos, horario, plantillas, cobertura, stats y settings siguen resolviendo usuario, memberships y organizacion activa antes de renderizar datos tenant-scoped.
- P2 source guard de queries de listado: centros, equipo, tipos, horario, plantillas, cobertura y stats siguen filtrando sus lecturas principales por `organization_id`.
- P2 source guard de controles visibles por rol: plantillas y stats bloquean a roles sin `canManageOperationalData(...)` antes de cargar datos de gestion; equipo separa `canManageTeamAccess(...)` de `canManageOperationalTeamProfiles(...)`; settings separa `canManageTenantSettings(...)` de `canManageTimeTrackingSettings(...)`; horario y cobertura pasan `canManageSchedule` a controles de gestion.
- P2 guardrail de alcance: las paginas/listados base no abren `center_manager`, `document_admin`, `payroll_manager`, grants UI, rutas Storage, signed URLs, versiones documentales, documentos sensibles, ubicacion asistida, IA, app nativa, geofencing, push, service worker ni CacheStorage.
- Verificacion acotada: `npx playwright test --config=playwright.smoke.config.ts tests/smoke/tenant-rls-negative-local.spec.ts -g "base operational listing page local source guardrails"` pasa con 3 tests. No se reejecuta la suite completa por alcance del corte.

S.34 anade un vigesimo tercer corte local P2 source/static guard sobre shell y entry points de navegacion, sin credenciales, sin servidor, sin Supabase real/local, sin SQL rollback, sin Server Actions runtime y sin cambios en `src`.

Cubierto localmente por S.34:

- P2 source guard de `ProtectedAppLayout` y `AppNavigation`: la navegacion sigue recibiendo `organizationId` y `role` derivados de memberships activas, resuelve el rol por `organizationId` activo y usa `canManageOperationalData(...)` para entry points sensibles como Cobertura, Plantillas, Settings y estado activo de Stats bajo Mas.
- P2 source guard de `/app/more`: la pagina sigue resolviendo sesion, memberships y organizacion activa antes de renderizar; Stats, Settings y Plantillas quedan en la rama de gestion; la rama personal/consulta mantiene Mi horario, Mi fichaje, Documentos autorizados, Equipo, Centros y Tipos sin exponer Cobertura, Stats, Settings ni Plantillas.
- P2 source guard de `/app`: `getDashboardData(...)`, `AdminCoverageDashboard` y `SurfaceLinks` siguen condicionados por `canManageOperationalData(...)`; `ReadOnlyHome` queda acotado a Mi horario, Mi fichaje, Solicitudes y Mi cuenta.
- P2 guardrail de alcance: shell, `/app/more` y dashboard no activan `center_manager`, `document_admin`, `payroll_manager` ni `staff`, no abren documentos sensibles, grants UI, rutas Storage, signed URLs, ubicacion asistida, IA, app nativa, geofencing, push, service worker ni CacheStorage.
- Verificacion acotada: `npx playwright test --config=playwright.smoke.config.ts tests/smoke/tenant-rls-negative-local.spec.ts -g "app shell navigation local source guardrails"` pasa con 3 tests. No se reejecuta la suite completa por alcance del corte.

S.35 anade un vigesimo cuarto corte local P2 source/static guard sobre rutas protegidas, cache y helpers de paths, sin credenciales, sin servidor, sin Supabase real/local, sin SQL rollback, sin Storage real, sin Server Actions runtime y sin cambios en `src`.

Cubierto localmente por S.35:

- P2 source guard de cache protegida: `next.config.ts` sigue aplicando `Cache-Control: no-store` a `/app` y `/app/:path*`; `src/proxy.ts` sigue protegiendo `/app/:path*`; `src/lib/supabase/proxy.ts` sigue aplicando `Cache-Control: no-store` y `Pragma: no-cache` a respuestas protegidas, redirects anonimos y respuesta final.
- P2 source guard de App Router protegido: todos los `page.tsx`, `layout.tsx` y `route.ts` bajo `src/app/(app)/app` siguen exportando `dynamic = "force-dynamic"` y no optan por `revalidate`, `fetchCache`, `unstable_cache` ni Cache Components.
- P2 source guard de helpers de paths: `src/lib/navigation/app-paths.ts` sigue generando solo rutas `/app` de primer nivel y no construye preview/download/versiones, Storage, grants, signed URLs, ubicacion, payroll, push ni geofencing.
- P2 guardrail PWA/offline: `src/app` y `src/components` siguen sin service worker registration, Workbox, Push API, Notification API, Background Sync ni CacheStorage.
- Verificacion acotada: `npx playwright test --config=playwright.smoke.config.ts tests/smoke/tenant-rls-negative-local.spec.ts -g "protected app route cache local source guardrails"` pasa con 3 tests. No se reejecuta la suite completa por alcance del corte.

S.36 anade un vigesimo quinto corte local P2 source/static guard sobre `OrganizationResolutionState` y conservacion de `basePath` en estados de resolucion de tenant, sin credenciales, sin servidor, sin Supabase real/local, sin SQL rollback, sin Storage real, sin Server Actions runtime y sin cambios en `src`.

Cubierto localmente por S.36:

- P2 source guard de estados no resueltos: `OrganizationResolutionState` sigue tipado solo para resoluciones `ok: false`, conserva los estados `no_active_memberships`, `organization_required` y `organization_not_found`, y solo muestra seleccion de tenant en `organization_required`.
- P2 source guard de seleccion explicita: la UI de `organization_required` sigue iterando `resolution.memberships` y construye el link con `getAppPath(basePath, { organizationId: membership.organization_id })`, sin fallback automatico a `memberships[0]`, redirects, router push ni `location.href`.
- P2 source guard de estados bloqueados: `no_active_memberships` y `organization_not_found` quedan como `Alert` informativo sin `Link`, `href`, `getAppPath` ni `membership.organization_id`.
- P2 source guard de `basePath`: todas las paginas protegidas que renderizan `OrganizationResolutionState` pasan un `basePath` literal que coincide con su ruta `/app` de primer nivel y no apunta a preview/download/versiones, Storage, grants, signed URLs, ubicacion, payroll, geofencing ni push.
- P2 guardrail de alcance: el componente no abre formularios/actions, documentos sensibles, grants UI, rutas Storage, signed URLs, ubicacion asistida, IA, app nativa, geofencing, push, service worker ni CacheStorage.
- Verificacion acotada: `npx playwright test --config=playwright.smoke.config.ts tests/smoke/tenant-rls-negative-local.spec.ts -g "organization resolution state local source guardrails"` pasa con 3 tests. No se reejecuta la suite completa por alcance del corte.

S.37 anade un vigesimo sexto corte local P2 source/static guard sobre rutas y acciones publicas de transicion Auth, sin credenciales, sin servidor, sin Supabase real/local, sin SMTP, sin SQL rollback, sin Storage real, sin Server Actions runtime y sin cambios en `src`.

Cubierto localmente por S.37:

- P2 source guard de callback Auth: `src/app/auth/callback/route.ts` sigue leyendo `redirectTo`/`next` a traves de `getSafeRedirectPath(...)`, intercambia `code` solo si existe, redirige con `new URL(redirectTo, requestUrl.origin)` y usa errores internos `/reset-password?error=callback` o `/login?error=callback`.
- P2 source guard de login: `src/app/(auth)/login/page.tsx` y `actions.ts` siguen sanitizando `redirectTo` antes de renderizar `href`, input oculto, errores y redirect final; no redirigen con valores crudos de formulario/search params.
- P2 source guard de reset/forgot/sign-out: forgot password usa `getAuthCallbackUrl("/reset-password")`, respuesta generica anti-enumeracion y catch silencioso; reset valida password, actualiza con Supabase Auth, cierra sesion temporal y vuelve a `/login?status=password-updated`; sign-out redirige a `/login` con 303.
- P2 source guard de cache/superficies Auth publicas: login, forgot y reset siguen `force-dynamic` y no optan por `revalidate`, `fetchCache`, `unstable_cache` ni Cache Components.
- P2 guardrail de alcance: esas superficies Auth no introducen signed URLs, Storage, grants UI, documentos sensibles, `service_role`, secretos SMTP/DB, ubicacion web, IA, push, service worker ni CacheStorage.
- Verificacion acotada: `npx playwright test --config=playwright.smoke.config.ts tests/smoke/tenant-rls-negative-local.spec.ts -g "auth transition routes local source guardrails"` pasa con 4 tests. No se reejecuta la suite completa por alcance del corte.

S.38 anade un vigesimo septimo corte local P2 source/static guard sobre aceptacion publica de invitaciones en `/invite/accept`, sin credenciales, sin servidor, sin Supabase real/local, sin SMTP, sin SQL rollback, sin Storage real, sin Server Actions runtime y sin cambios en `src`.

Cubierto localmente por S.38:

- P2 source guard de pagina publica de invitacion: `src/app/(auth)/invite/accept/page.tsx` sigue `force-dynamic`, exige `invitationId` UUID y token antes de llamar a `get_team_invitation_public`, usa `getInvitationAcceptPath(invitationId, token)` como ruta interna y envia al anonimo a login con `getLoginPath(invitePath)`.
- P2 source guard de formularios de aceptacion: la pagina conserva `invitationId` y `token` solo como inputs ocultos para las actions de aceptacion, no construye rutas protegidas `/app`, metadata, logs ni enlaces a superficies sensibles.
- P2 source guard de actions de invitacion: `acceptTeamInvitation(...)` y `signUpAndAcceptTeamInvitation(...)` siguen validando UUID/token minimo, delegan aceptacion real en `accept_team_invitation`, usan callback de signup con `getAuthCallbackUrl(getSafeRedirectPath(getInvitationAcceptPath(...)))` y redirigen a `/app` solo con `organizationId` devuelto por la RPC.
- P2 source guard de auditoria: la aceptacion registra campos tocados de `team_invitations`, membership, persona y coach, pero no registra token, `token_hash` ni `raw_invitation_token`.
- P2 source guard de RPCs: `get_team_invitation_public(...)` sigue hasheando el token y devuelve solo campos publicos minimos; `accept_team_invitation(...)` sigue exigiendo `auth.uid()`, email Auth coincidente, token hasheado, estado/expiracion validos, membership tenant-scoped y enlace de `person_profiles`/`coach_profiles` por `organization_id` + `current_user_id`.
- P2 guardrail de alcance: `/invite/accept`, sus actions, helper de invitaciones y RPCs revisadas no abren Storage/signed URLs, grants UI, documentos sensibles, `service_role`, secretos SMTP/DB, ubicacion web, IA, push, service worker ni CacheStorage.
- Verificacion acotada: `npx playwright test --config=playwright.smoke.config.ts tests/smoke/tenant-rls-negative-local.spec.ts -g "invite accept auth local source guardrails"` pasa con 2 tests. No se reejecuta la suite completa por alcance del corte.

S.39 anade un vigesimo octavo corte local P2 source/static guard sobre emision, reenvio y cancelacion de invitaciones de equipo en `/app/coaches`, sin credenciales, sin servidor, sin Supabase real/local, sin SMTP/Resend real, sin SQL rollback, sin Storage real, sin Server Actions runtime y sin cambios en `src`.

Cubierto localmente por S.39:

- P2 source guard de actions de invitacion de equipo: `createTeamInvitation(...)`, `resendTeamInvitation(...)` y `cancelTeamInvitation(...)` siguen usando `getCoachActionContext(formData, "team-access")`, que revalida sesion, memberships, organizacion activa y `canManageTeamAccess(...)`.
- P2 source guard de tenant boundary: creacion, reenvio y cancelacion filtran `team_invitations`, `coach_profiles` y `person_profiles` por `organization_id`; las fichas/personas existentes deben estar activas, visibles y sin `user_id`; las nuevas se crean con `organization_id`, estado activo y visibilidad visible.
- P2 source guard de token lifecycle: creacion y reenvio usan `generateInvitationToken()`, persisten solo `hashInvitationToken(token)`, rotan token en resend, mantienen rate limit local por `last_sent_at` y usan el token crudo solo para construir/enviar el accept URL.
- P2 source guard de auditoria: los `changedFields` de `team_invitations` siguen sin guardar token, `token_hash`, raw token, accept URL, provider message, `last_error`, payloads o secretos.
- P2 source guard de email transaccional: `buildTeamInvitationEmail(...)` escapa HTML para organizacion, destinatario, invitador y URL; `sendTransactionalEmail(...)` lee env server-side dentro de `getEmailConfig()`, llama a Resend solo desde helper servidor y no loggea provider payloads.
- P2 guardrail de alcance: las superficies revisadas no abren Supabase Auth Admin, `service_role`, signed URLs, Storage, grants UI, documentos sensibles, ubicacion web, IA, push, service worker ni CacheStorage.
- Verificacion acotada: `npx playwright test --config=playwright.smoke.config.ts tests/smoke/tenant-rls-negative-local.spec.ts -g "team invitation issuance local source guardrails"` pasa con 2 tests. No se reejecuta la suite completa por alcance del corte.

S.40 anade un vigesimo noveno corte local P2 source/static guard sobre hardening de errores de email transaccional en invitaciones, con parche minimo de `src` porque habia fragilidad real. No usa credenciales, servidor, Supabase real/local, SMTP/Resend real, SQL rollback, Storage real ni Server Actions runtime.

Cubierto localmente por S.40:

- P2 hardening de helper transaccional: `src/lib/email/resend.ts` mantiene `RESEND_API_KEY`, remitente y reply-to solo server-side dentro de `getEmailConfig()`, conserva la llamada directa a Resend en ese helper, no inicializa SDK/cliente global y ya no modela ni propaga `payload.message`/`payload.name` del proveedor.
- P2 hardening de errores persistidos: `sendInvitationEmailAndMarkSent(...)` guarda `last_error` mediante `getSafeInvitationEmailErrorMessage(sendResult.code)`, no con `sendResult.message`, raw provider payloads ni respuesta completa del proveedor.
- P2 hardening de copy visible: `/app/coaches` deja de mencionar env vars, SMTP o API en errores visibles de email; si muestra `last_error`, el contenido procede del mensaje generico persistido.
- P2 source guard de minimizacion: el smoke confirma que las variables de email y `https://api.resend.com/emails` aparecen solo en `src/lib/email/resend.ts`, que no hay `console.*` de provider payloads, y que auditoria de `team_invitations` no guarda `last_error`, provider message, `sendResult`, payloads, tokens ni accept URL.
- P2 guardrail de alcance: las superficies revisadas no abren Supabase Auth Admin, `service_role`, SMTP directo en UI, signed URLs, Storage, grants UI, documentos sensibles, ubicacion web, IA, push, service worker ni CacheStorage.
- Verificacion acotada: `npx playwright test --config=playwright.smoke.config.ts tests/smoke/tenant-rls-negative-local.spec.ts -g "team invitation issuance local source guardrails|transactional email hardening local source guardrails"` pasa con 3 tests. No se reejecuta la suite completa por alcance del corte.

S.41 anade un trigesimo corte local P2 source/static guard sobre clientes Supabase/Auth/Storage y llamadas privilegiadas, sin credenciales, sin servidor, sin Supabase real/local, sin SMTP, sin SQL rollback, sin Storage real, sin Server Actions runtime y sin cambios en `src`.

Cubierto localmente por S.41:

- P2 source guard de clientes Supabase: `getSupabasePublicEnv()` sigue leyendo solo `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`; `createServerClient`/`createBrowserClient` siguen limitados a `src/lib/supabase/server.ts`, `src/lib/supabase/proxy.ts` y `src/lib/supabase/client.ts`; no hay imports runtime de `@supabase/supabase-js` ni inicializacion de cliente Supabase en scope global sensible.
- P2 source guard de secretos/env privilegiados: `process.env` queda allowlisted en `src/lib/supabase/env.ts`, `src/lib/auth/site-url.ts` y `src/lib/email/resend.ts`; `src` sigue sin `auth.admin`, `service_role`, `SUPABASE_SERVICE_ROLE`, DB URLs, Postgres direct env vars ni SMTP directo.
- P2 source guard de Storage privado: `supabase.storage` queda limitado a `src/lib/document-file-access.ts` y Mi cuenta; `createSignedUrl` queda limitado a `src/lib/document-file-access.ts` y previews propias de avatar/firma en Mi cuenta; `document-files` queda limitado al helper backend documental.
- P2 source guard de superficies visibles: navegacion, shell, `/app/documents` y el panel documental de Horario siguen usando rutas backend condicionadas por `can_preview`/`can_download`, sin raw Storage paths, bucket names, signed URLs, grants UI ni RPCs de upload documental.
- P2 source guard de componentes cliente: los archivos `"use client"` bajo `src/app` y `src/components` no importan clientes Supabase, no leen env/secrets, no llaman APIs privilegiadas de Supabase/Storage y no exponen raw Storage/document internals.
- Verificacion acotada: `npx playwright test --config=playwright.smoke.config.ts tests/smoke/tenant-rls-negative-local.spec.ts -g "privileged Supabase and Storage client local source guardrails"` pasa con 3 tests. No se reejecuta la suite completa por alcance del corte.

S.42 anade un trigesimo primer corte local P2 source/static guard sobre higiene de secretos y evidencia en archivos trackeables, sin credenciales, sin leer `.env.local`, sin servidor, sin Supabase real/local, sin SMTP, sin proveedor real, sin secret scanning externo, sin SQL rollback, sin Storage real, sin Server Actions runtime y sin cambios en `src`.

Cubierto localmente por S.42:

- P2 source guard de archivos trackeables: `tests/smoke/tenant-rls-negative-local.spec.ts` usa `git ls-files --cached --others --exclude-standard` para escanear docs raiz, `docs/**/*.md`, `tests/**/*.ts`, `supabase/snippets/**/*.sql` y `.env.example`, excluyendo archivos ignorados como `.env.local`.
- P2 source guard de secretos activos: el smoke bloquea formatos de API keys reales (`sk-...`, `re_...`, `sb_...`), JWTs, private keys completas, DB/SMTP URLs con credenciales, asignaciones env sensibles con valor, headers de cookie, signed URLs activas y URLs activas de Supabase Storage en docs/tests/snippets trackeables.
- P2 source guard de plantilla env: `.env.example` conserva placeholders/local defaults y no declara service role, access token, DB URLs, Postgres direct vars ni SMTP creds; `.env.local` se comprueba con `git check-ignore -v` y `git ls-files .env.local`, sin leer ni imprimir valores.
- P2 source guard de evidencia/runbooks: los runbooks y matrices mantienen instrucciones `fuera del repo`/`redacted`, mencionan secretos, cookies, signed URLs, rutas Storage y contenido documental como materiales que no deben guardarse en repo, y no instruyen guardar/commitear/pegar/subir esos materiales sensibles al repo.
- P2 guardrail de alcance: S.42 no abre scanners externos como gitleaks/trufflehog/GitHub secret scanning, no llama a proveedores reales, no usa staging, no imprime secretos ni crea evidencia externa.
- Verificacion acotada: `npx playwright test --config=playwright.smoke.config.ts tests/smoke/tenant-rls-negative-local.spec.ts -g "trackable secret and evidence hygiene local guardrails"` pasa con 3 tests. No se reejecuta la suite completa por alcance del corte.

S.43 anade un trigesimo segundo corte local P2 source/static guard sobre higiene de supply-chain/package, sin cambiar dependencias, sin ejecutar `npm install`, sin auditoria externa, sin red, sin credenciales, sin servidor, sin Supabase real/local, sin SMTP, sin SQL rollback, sin Storage real, sin Server Actions runtime y sin cambios en `src`.

Cubierto localmente por S.43:

- P2 source guard de lockfile: `package-lock.json` existe, usa `lockfileVersion = 3`, mantiene el paquete raiz alineado con `package.json` y coincide en `dependencies`/`devDependencies`.
- P2 source guard de dependencias directas: el smoke bloquea familias directas de IA/LLM/embeddings/vector, geolocalizacion/PWA offline/push, SMTP directo/nodemailer, clientes DB directos privilegiados, secret scanners externos, app nativa, payroll y legal signing tooling, mientras permite explicitamente Next, React, Supabase SSR/JS, Playwright, Tailwind y shadcn.
- P2 source guard de scripts npm: los scripts no leen `.env.local`, no imprimen secretos, no llaman proveedores reales/staging, no usan `service_role`/DB URLs y no ejecutan comandos destructivos salvo el reset local ya documentado `supabase:reset = "supabase db reset"` sin `--db-url`, `--linked` ni entorno real. `supabase:types` sigue usando `--local`.
- P2 guardrail de alcance: S.43 no ejecuta `npm audit`, SCA externo, `npm install`, red, staging, secret scanning externo ni modifica dependencias/lockfile.
- Verificacion acotada: `npx --no-install playwright test --config=playwright.smoke.config.ts tests/smoke/tenant-rls-negative-local.spec.ts -g "package supply-chain local source guardrails"` pasa con 3 tests. No se reejecuta la suite completa por alcance del corte.

S.44 anade un trigesimo tercer corte local P2 source/static guard sobre higiene de artefactos generados y evidencia local no trackeable, sin leer secretos ni contenido sensible, sin borrar ni mover evidencia, sin credenciales, sin servidor, sin Supabase real/local, sin SMTP, sin SQL rollback, sin Storage real, sin Server Actions runtime y sin cambios en `src`.

Cubierto localmente por S.44:

- P2 source guard de `.gitignore`: se mantienen ignorados outputs de build/test (`.next`, `out`, `dist`, `build`, `.turbo`, `.vercel`, `coverage`, `test-results`, `playwright-report`), logs/tsbuildinfo y artefactos locales de QA/evidencia como screenshots, videos, traces, HAR, dumps, exports reales, documentos controlados locales, bases temporales, backups y tmp.
- P2 guardrail de artefactos trackeados: el smoke usa `git ls-files` y confirma por nombre que no hay artefactos generados/evidencia local trackeados bajo los patrones cubiertos.
- P2 guardrail de artefactos no ignorados: el smoke usa `git ls-files --others --exclude-standard` y confirma por nombre que no hay artefactos generados/evidencia local no ignorados que se anadirian accidentalmente al repo.
- P2 guardrail de ignore por rutas sinteticas: el smoke usa `git check-ignore -q` sobre paths sinteticos de artefactos, sin crear archivos ni leer contenido real.
- P2 guardrail de alcance: S.44 no lee `.env.local`, cookies, signed URLs, rutas Storage activas, contenido documental, screenshots, videos, traces, dumps, logs ni exports reales; tampoco ejecuta escaneo externo, staging, red ni proveedores.
- Verificacion acotada: `npx --no-install playwright test --config=playwright.smoke.config.ts tests/smoke/tenant-rls-negative-local.spec.ts -g "generated artifact and local evidence hygiene guardrails"` pasa con 2 tests. No se reejecuta la suite completa por alcance del corte.

S.45 anade un trigesimo cuarto corte local P2 source/static guard sobre higiene de logging y errores visibles en `src`, sin credenciales, sin servidor, sin Supabase real/local, sin SMTP, sin SQL rollback, sin Storage real, sin Server Actions runtime y sin cambios en producto.

Cubierto localmente por S.45:

- P2 source guard de logging: `tests/smoke/tenant-rls-negative-local.spec.ts` confirma que no hay `console.log`, `console.debug`, `console.info`, `console.warn`, `console.error`, `console.trace`, `console.table`, `console.dir`, `console.group` ni `console.groupCollapsed` en `src`.
- P2 source guard de errores visibles: en `src/app` y `src/components` se bloquean patrones de serializacion cruda de errores como `JSON.stringify(error)`, `String(error)`, `error.stack`, JSX `{error.message}`, objetos devueltos con `error/message: error.message` y redirects con `error.message`.
- P2 source guard de error boundary: `src/app/(app)/app/error.tsx` mantiene copy generico y solo muestra `error.digest`, sin exponer `error.message`, `error.stack` ni el objeto `error`.
- P2 guardrail de alcance: S.45 no convierte en regla global los `throw new Error(... error.message ...)` server-side existentes porque seria un refactor amplio y fragil; sanitizar logs internos de carga queda para task propia si se decide.
- Verificacion acotada: `npx --no-install playwright test --config=playwright.smoke.config.ts tests/smoke/tenant-rls-negative-local.spec.ts -g "visible logging and error hygiene local source guardrails"` pasa con 1 test. No se reejecuta la suite completa por alcance del corte.

S.46 anade un trigesimo quinto corte local P2 source/static guard sobre higiene de claims/copy visible en `src/app`, `src/components` y `src/lib/navigation`, sin credenciales, sin servidor, sin Supabase real/local, sin SMTP, sin SQL rollback, sin Storage real, sin Server Actions runtime y sin cambios en producto.

Cubierto localmente por S.46:

- P2 source guard de claims visibles: `tests/smoke/tenant-rls-negative-local.spec.ts` confirma que superficies visibles no prometen beta lista, produccion lista, ASVS conforme, pentest, cumplimiento legal definitivo, firma electronica avanzada/cualificada, payroll/nomina legal, geolocalizacion activa, IA funcional, documentos firmables ni subida documental visible.
- P2 source guard de alcance: el escaneo queda limitado a `src/app`, `src/components` y `src/lib/navigation`, y no aplica reglas genericas sobre docs porque contienen negaciones, bloqueos y runbooks legitimos.
- P2 source guard antifragil: el guard permite contextos defensivos/negados como `No es payroll...`, `sin geolocalizacion`, `pendiente`, `futuro`, `bloqueado`, `antes de beta`, `interno` o `revision`, para no romper copy prudente que comunica limites.
- P2 guardrail de alcance: S.46 no reescribe copy de producto ni abre UI, features, migraciones, seeds, permisos por centro, documentos firmables, subida documental visible, payroll, IA, geolocalizacion, app nativa, push, service worker ni CacheStorage.
- Verificacion acotada: `npx --no-install playwright test --config=playwright.smoke.config.ts tests/smoke/tenant-rls-negative-local.spec.ts -g "visible product claim hygiene local source guardrails"` pasa con 1 test. No se reejecuta la suite completa por alcance del corte.

S.47 anade un trigesimo sexto corte local P2 source/static guard sobre higiene de almacenamiento cliente/browser en superficies visibles, sin credenciales, sin servidor, sin navegador real, sin Supabase real/local, sin SMTP, sin SQL rollback, sin Storage real, sin Server Actions runtime y sin cambios en producto.

Cubierto localmente por S.47:

- P2 source guard de almacenamiento visible: `tests/smoke/tenant-rls-negative-local.spec.ts` confirma que `src/app` y `src/components` no usan `localStorage`, `sessionStorage`, `indexedDB`, `document.cookie`, `cookieStore`, `navigator.storage`, `StorageManager` ni `openDatabase` fuera del onboarding permitido.
- P2 allowlist acotada de onboarding: el unico uso permitido queda en `src/components/layout/onboarding-tour.tsx`, con `STORAGE_KEY` no sensible tipo `boxops_onboarding_seen_v*` (actualmente `boxops_onboarding_seen_v3`) y solo operaciones `setItem(STORAGE_KEY, "true")`, `getItem(STORAGE_KEY)` y `removeItem(STORAGE_KEY)`.
- P2 source guard de datos no persistidos en cliente: el guard evita que superficies visibles usen almacenamiento browser para tenant, documentos, fichaje, firma, auditoria, permisos, tokens, emails, Storage paths o evidencia.
- P2 guardrail de alcance: S.47 no escanea docs con reglas genericas, no prueba navegador real, no lee ni borra storage local del usuario, no cambia onboarding y no abre offline, service worker, CacheStorage, IA, geolocalizacion, app nativa, payroll, documentos firmables, subida documental visible ni grants UI.
- Verificacion acotada: `npx --no-install playwright test --config=playwright.smoke.config.ts tests/smoke/tenant-rls-negative-local.spec.ts -g "visible browser storage hygiene local source guardrails"` pasa con 1 test. No se reejecuta la suite completa por alcance del corte.

S.48 anade un trigesimo septimo corte local P2 source/static guard sobre higiene de egress/browser en superficies visibles, sin credenciales, sin servidor, sin navegador real, sin Supabase real/local, sin SMTP, sin SQL rollback, sin Storage real, sin Server Actions runtime y sin cambios en producto.

Cubierto localmente por S.48:

- P2 source guard de egress visible: `tests/smoke/tenant-rls-negative-local.spec.ts` confirma que `src/app` y `src/components` no usan `navigator.clipboard`, `window.open`, `postMessage`, `BroadcastChannel`, `URL.createObjectURL`, `Blob`, `FileReader`, file pickers, Web Share/Beacon, `XMLHttpRequest`, `WebSocket` ni `EventSource`.
- P2 source guard de descargas cliente: el smoke bloquea anchors/Links con atributo `download` en superficies visibles, sin prohibir las rutas backend internas E.5 de preview/download.
- P2 source guard de red cliente visible: los componentes `"use client"` bajo `src/app` y `src/components` no llaman `fetch(...)`, evitando accesos browser-side a rutas privadas o endpoints externos con datos tenant-scoped.
- P2 source guard de enlaces visibles: el smoke bloquea `href` literales externos `http(s)`, protocol-relative, `data:`, `blob:` o `file:`, y bloquea `href={...}` construidos desde signed URLs, Storage paths, public/file/object URLs o equivalentes.
- P2 allowlist prudente de navegacion interna: `/app/documents` y el panel documental de Horario siguen generando solo rutas internas `/app/documents/{documentId}/versions/{documentVersionId}/{preview|download}?organizationId=...`, condicionadas por `can_preview`/`can_download`, sin `createSignedUrl`, `signedUrl`, paths Storage, bucket `document-files`, `Blob`, `FileReader`, object URLs ni `window.open`.
- P2 guardrail de alcance: S.48 no escanea docs con reglas genericas, no prueba navegador real, no bloquea `Link`/anchors internos existentes, no valida red real, no lee contenido documental y no abre offline, service worker, CacheStorage, IA, geolocalizacion, app nativa, payroll, documentos firmables, subida documental visible ni grants UI.
- Verificacion acotada: `npx --no-install playwright test --config=playwright.smoke.config.ts tests/smoke/tenant-rls-negative-local.spec.ts -g "visible browser egress hygiene local source guardrails"` pasa con 2 tests. No se reejecuta la suite completa por alcance del corte.

S.49 anade un trigesimo octavo corte local P2 source/static guard sobre higiene de formularios visibles, sin credenciales, sin servidor, sin navegador real, sin Supabase real/local, sin SMTP, sin SQL rollback, sin Storage real, sin Server Actions runtime y sin cambios en producto.

Cubierto localmente por S.49:

- P2 source guard de destinos de formulario: `tests/smoke/tenant-rls-negative-local.spec.ts` extrae `action` de tags `<form>` y `formAction` de controles visibles en `src/app` y `src/components`, bloqueando URLs externas, protocol-relative, `data:`, `blob:`, `file:`, backslashes, rutas directas sensibles, signed URLs, Storage internals, grants, service role y query params de token/cookie/signed/storage/evidencia/auditoria.
- P2 source guard de mutaciones visibles: los `action={...}` y `formAction={...}` deben seguir siendo identificadores simples de Server Action/prop, no expresiones que construyan URLs, usen `fetch`, `new URL`, signed URLs, Storage internals, grants, payroll, cookies, auditoria o evidencia.
- P2 source guard de rutas literales: los `action` literales bajo `/app` siguen siendo GET para filtros/exporte interno revisable, y `/auth/sign-out` sigue siendo POST; las mutaciones operativas visibles quedan en Server Actions/imports locales.
- P2 source guard de markup de formularios: los bloques `<form>...</form>` no exponen `signedUrl`, `storage_path`, buckets privados, `document_access_events`, `operational_audit_events`, `changed_fields`, payloads de proveedor/auditoria ni evidencia.
- P2 allowlist prudente: se permiten formularios normales con Server Actions, `action` prop local, `formAction` prop local, `/auth/sign-out`, filtros GET internos de `/app/schedule`, exporte interno revisable `/app/time/export` y campos operativos necesarios como `organizationId`, IDs, semana, filtros o campos existentes.
- P2 guardrail antifragil: S.49 no convierte en regla global los tokens/campos de invitacion publica ni la data URL de firma propia porque son ruido legitimo ya cubierto por S.38/S.39 y D.5/S.23; se limita a destinos/acciones e internals sensibles de alto riesgo en markup de formularios.
- Verificacion acotada: `npx --no-install playwright test --config=playwright.smoke.config.ts tests/smoke/tenant-rls-negative-local.spec.ts -g "visible form action hygiene local source guardrails"` pasa con 2 tests. No se reejecuta la suite completa por alcance del corte.

S.50 anade un trigesimo noveno corte local P2 source/static guard sobre higiene de inputs de archivo/subida visible, sin credenciales, sin servidor, sin navegador real, sin Supabase real/local, sin SMTP, sin SQL rollback, sin Storage real, sin Server Actions runtime y sin cambios en producto.

Cubierto localmente por S.50:

- P2 source guard de inputs de archivo visibles: `tests/smoke/tenant-rls-negative-local.spec.ts` escanea `src/app` y `src/components` y exige que el unico `input/Input type="file"` sea el avatar propio de `/app/account`, con `name="avatar"` y `accept="image/jpeg,image/png,image/webp"`.
- P2 source guard de controles de subida documental: bloquea `multiple`, `capture`, accepts documentales (`PDF`, `DOC`, `DOCX`, `XLSX`, `CSV`, `TXT`), dropzones, drag/drop file handlers, `DataTransfer`, `FileReader`, file pickers de navegador y object URLs en superficies visibles.
- P2 source guard de formulario de avatar propio: confirma `action={updateOwnAvatar}` y `organizationId`, sin aceptar `person_profile_id`, `personProfileId`, `assetId`, `signatureId`, `documentId`, `documentVersionId`, rutas Storage crudas, `signedUrl`, `createSignedUrl` ni bucket names en el formulario visible.
- P2 source guard de firma propia: confirma que la firma sigue como canvas con `signatureDataUrl` oculto, sin input de archivo, drag/drop, document upload ni IDs ajenos.
- P2 source guard documental visible: bloquea en `src/app`/`src/components` las RPCs de upload documental, `document_access_grants`, `manage_grants`, `document-files`, `requires_signature` y `signature_evidence`, manteniendo `Documentos/subida` como `no-aplica-beta`.
- Verificacion acotada: `npx --no-install playwright test --config=playwright.smoke.config.ts tests/smoke/tenant-rls-negative-local.spec.ts -g "visible file input and upload hygiene local source guardrails"` pasa con 2 tests. No se reejecuta la suite completa por alcance del corte.

S.51 anade un cuadragesimo corte local P2 source/static guard sobre higiene de respuestas descargables/exportes visibles, sin credenciales, sin servidor, sin navegador real, sin Supabase real/local, sin SMTP, sin SQL rollback, sin Storage real, sin Server Actions runtime y sin cambios en producto.

Cubierto localmente por S.51:

- P2 source guard de inventario visible: `tests/smoke/tenant-rls-negative-local.spec.ts` enumera los entry points visibles de descarga/exporte y permite solo `action="/app/time/export"` y `previewHref`/`downloadHref` documentales internos.
- P2 source guard de exporte CSV de fichaje visible: el formulario de `/app/time` sigue como `GET` interno a `/app/time/export`, con `organizationId`, `from`, `to` y `person_profile_id`, sin signed URLs, rutas Storage crudas, bucket names, grants, firma documental, sensibilidad documental ni `service_role`.
- P2 source guard de respuesta `/app/time/export`: la route sigue `force-dynamic`, delega en `generateTimeRecordsCsvExport(...)`, devuelve `Cache-Control: no-store`, `Content-Disposition: attachment`, `Content-Type: text/csv; charset=utf-8` y `X-BoxOps-Export-Scope: internal-review`.
- P2 source guard de semantica interna/revisable: el helper mantiene `requireReviewAccess: true`, metadata `internalReviewOnly: true`, `legalFinal: false`, `payroll: false`, `snapshotsIncluded: false` y linea CSV `exporte interno revisable; no payroll; no cumplimiento legal definitivo`.
- P2 source guard documental visible/E.5: `/app/documents` y el panel documental de Horario siguen construyendo solo rutas internas E.5 condicionadas por `can_preview`/`can_download`; las rutas `preview`/`download` delegan en `handleDocumentVersionFileAccess(...)`, y el helper backend mantiene signed URL server-side, `no-store`, `X-Robots-Tag: noindex` y auditoria requerida.
- P2 guardrail de alcance: S.51 no prueba descarga efectiva, apertura real de preview/download, cabeceras runtime, cookies, Auth, RLS, SQL rollback, Storage real, objeto `document-files`, expiracion efectiva de signed URLs, auditoria persistida, red, navegador, CSP ni evidencia externa.
- Verificacion acotada: `npx --no-install playwright test --config=playwright.smoke.config.ts tests/smoke/tenant-rls-negative-local.spec.ts -g "visible downloadable response hygiene local source guardrails"` pasa con 1 test. No se reejecuta la suite completa por alcance del corte.

S.52 anade un cuadragesimo primer corte local P2 source/static guard sobre higiene de query params y rutas protegidas visibles, sin credenciales, sin servidor, sin navegador real, sin Supabase real/local, sin SMTP, sin SQL rollback, sin Storage real, sin Server Actions runtime y sin cambios en producto.

Cubierto localmente por S.52:

- P2 source guard de `src/lib/navigation/app-paths.ts`: el helper central de rutas `/app` mantiene un inventario acotado de query params operativos no sensibles (`organizationId`, semana, estado/error operativo, filtros de horario/cobertura/ausencias/documentos, `mine`, `block_id`, `assignment_id`, `edit_block_id`, `record_id`, contadores de overtime y `work_windows`), sin token/cookie/signed/storage/bucket/audit/evidence/provider/secret/payroll/legal/geolocalizacion/document ids/grants/upload.
- P2 source guard de constructores protegidos visibles: el smoke revisa `URLSearchParams`, `searchParams.set(...)` y `useRouteQueryParam(...)` en `src/app/(app)/app`, `src/components` y `src/lib/navigation/app-paths.ts`, permitiendo solo nombres operativos conocidos y bloqueando dynamic setters salvo el patron tipado `error`/`status` de redirects internos.
- P2 source guard de formularios GET internos protegidos: los formularios GET bajo `/app` que no son exportes siguen limitados a estado operativo de filtros/ruta (`organizationId`, `week`, `view`, `day`, centro, coach, tipo, cobertura, `mine`, `risks_only`), sin parametros sensibles ni rutas documentales/upload/grants.
- P2 guardrail antifragil: S.52 no convierte todo el repo en allowlist global ni reabre S.48/S.49/S.51; excluye exportes/descargas ya cubiertos y se limita a query state visible/protegido local.
- Verificacion acotada: `npx --no-install playwright test --config=playwright.smoke.config.ts tests/smoke/tenant-rls-negative-local.spec.ts -g "visible protected route query hygiene local source guardrails"` pasa con 3 tests. No se reejecuta la suite completa por alcance del corte.

S.53 anade un cuadragesimo segundo corte local P2 source/static guard sobre higiene de acciones destructivas o terminales visibles, sin credenciales, sin servidor, sin navegador real, sin Supabase real/local, sin SMTP, sin SQL rollback, sin Storage real, sin Server Actions runtime y sin cambios en producto.

Cubierto localmente por S.53:

- P2 source guard de inventario terminal visible: `tests/smoke/tenant-rls-negative-local.spec.ts` mantiene un inventario acotado de acciones visibles que cancelan, archivan, restauran, rechazan, expiran, desactivan, eliminan, retiran, anulan o cierran entidades operativas existentes: centros, tipos, invitaciones, ausencias, solicitudes/cambios, bloques/asignaciones, jornada prevista, eventos, plantillas, fichaje/correcciones y candidatos de posible exceso.
- P2 source guard de mutaciones terminales: esas operaciones siguen usando identificadores de Server Actions internas (`action={...}` / `formAction={...}`) y el smoke bloquea rutas literales externas o rutas `/app` como destino de mutaciones terminales visibles.
- P2 source guard de payload minimizado: los formularios terminales no exponen signed URLs, rutas/buckets Storage, auditoria/evidence IDs, provider payloads, secretos, payroll/legal, geolocalizacion, grants UI ni subida documental.
- P2 source guard de texto operativo acotado: los `Textarea` dentro de formularios terminales siguen teniendo `maxLength` local.
- P2 source guard de patrones explicitos existentes: el smoke confirma que se conservan el dialog de archivado de plantilla, el campo `confirmTemplateBlockDelete`, los `window.confirm(...)` existentes en ausencias/cierre vencido de solicitudes y las notas obligatorias para rechazos de aprobacion semanal/correccion de fichaje. No fuerza una confirmacion global nueva para todos los botones destructivos.
- Verificacion acotada: `npx --no-install playwright test --config=playwright.smoke.config.ts tests/smoke/tenant-rls-negative-local.spec.ts -g "visible terminal action hygiene local source guardrails"` pasa con 2 tests. No se reejecuta la suite completa por alcance del corte.

S.54 anade un cuadragesimo tercer corte local P2 source/static guard sobre higiene de estados visibles no accionables, sin credenciales, sin servidor, sin navegador real, sin Supabase real/local, sin SMTP, sin SQL rollback, sin Storage real, sin Server Actions runtime y sin cambios en producto.

Cubierto localmente por S.54:

- P2 source guard de ausencias y solicitudes/cambios: `tests/smoke/tenant-rls-negative-local.spec.ts` confirma que los estados cerrados/reviewables ya existentes gobiernan cancelar, aprobar, rechazar, aplicar, cerrar vencida y responder ofertas; cuando no hay accion compatible, las superficies visibles caen a `ActionGuidance` o solo lectura.
- P2 source guard de bloques de horario: las asignaciones nuevas siguen condicionadas por `isCoverageActiveBlock(block.status)` y los controles de seleccionar/asignar quedan `disabled` para bloques cancelados/completados, con mensaje visible de no accionable.
- P2 source guard de plantillas: `archived` oculta edicion, archivado, editor de bloques y creacion de bloques; aplicar queda bloqueado si la plantilla no esta `active`; recuperar archivadas existe solo como accion explicita y con ventana `recoverable`.
- P2 source guard de candidatos de posible exceso: `closed` y `superseded` renderizan `Sin acciones` y no muestran formulario de cambio de estado.
- P2 source guard de eventos operativos: eventos `archived` quedan fuera del listado visible por defecto; `cancelled` solo expone `Reactivar` de forma explicita; `active` expone cancelar y archivar mantiene la accion terminal existente.
- P2 guardrail antifragil: S.54 no crea una allowlist global de todos los estados, botones o copy; se limita a contratos fuente ya existentes en superficies protegidas visibles y no reabre S.49/S.53.
- Verificacion acotada: `npx --no-install playwright test --config=playwright.smoke.config.ts tests/smoke/tenant-rls-negative-local.spec.ts -g "visible non-actionable state hygiene local source guardrails"` pasa con 2 tests. No se reejecuta la suite completa por alcance del corte.

S.55 anade un cuadragesimo cuarto corte local P2 source/static guard sobre higiene de exposicion visible de identificadores tecnicos en superficies protegidas existentes, sin credenciales, sin servidor, sin navegador real, sin Supabase real/local, sin SMTP, sin SQL rollback, sin Storage real, sin Server Actions runtime y sin cambios de producto.

Cubierto localmente por S.55:

- P2 source guard de menciones visibles de UUID: `tests/smoke/tenant-rls-negative-local.spec.ts` confirma que `UUID` solo aparece en `src/app/(app)/app/coaches/page.tsx` como flujo avanzado/debug de acceso o vinculacion por cuenta Auth existente.
- P2 source guard de fallbacks cortos: los fallbacks visibles de Equipo, Cobertura, Estadisticas, Inicio y Fichaje siguen usando `shortId(...)` o `formatShortId(...)` para referencias tecnicas como `user_id`, `person_profile_id`, `coach_profile_id`, `time_record_id` y `time_punch_id`, en lugar de renderizar identificadores completos.
- P2 source guard de template literals visibles: las superficies protegidas no interpolan directamente `user_id`, `person_profile_id`, `coach_profile_id`, `organization_id`, `time_record_id` ni `time_punch_id` en texto visible sin formateo corto.
- P2 source guard de texto renderizable: el texto y atributos visibles basicos no muestran nombres internos de campos sensibles, rutas/buckets Storage, `document-files`, `profile-assets`, `profile-signatures`, auditorias, payloads de proveedor, hashes de token, signed URLs ni `service_role`.
- P2 guardrail antifragil: S.55 no crea una allowlist global de todo el copy ni de todos los campos renderizados; se limita a patrones visibles protegidos actuales y no reabre S.45/S.48/S.49/S.51/S.52/S.54.
- Verificacion acotada: `npx --no-install playwright test --config=playwright.smoke.config.ts tests/smoke/tenant-rls-negative-local.spec.ts -g "visible protected identifier exposure hygiene local source guardrails"` pasa con 3 tests. No se reejecuta la suite completa por alcance del corte.

S.56 anade un cuadragesimo quinto corte local P2 source/static guard sobre higiene de datos personales de contacto visibles en superficies protegidas existentes, sin credenciales, sin servidor, sin navegador real, sin Supabase real/local, sin SMTP, sin SQL rollback, sin Storage real, sin Server Actions runtime y sin cambios de producto.

Cubierto localmente por S.56:

- P2 source guard de `user.email`/`context.user.email`: los usos bajo `src/app/(app)/app` y `src/components` quedan acotados a Mi cuenta, shell de sesion propia y envio/reenvio de invitaciones de Equipo.
- P2 source guard de identidades de Equipo: `getMembershipIdentity(...)`, `getCoachProfileIdentity(...)`, cards/listados de memberships y cards de fichas de coach no usan emails privados, `email_normalized`, `public_email` ni `user.email` como label/detalle de identidad publica por defecto.
- P2 source guard de invitaciones: `TeamInvitationsSection` conserva `invitation.email_normalized` solo dentro del flujo de gestion de accesos autorizado, sin convertirlo en identidad publica general del equipo.
- P2 source guard de `public_email`: queda limitado a Mi cuenta (`src/app/(app)/app/account/page.tsx` y `src/app/(app)/app/account/actions.ts`) como campo publico explicito editable por la propia persona y update derivado por `context.user.id`.
- P2 guardrail antifragil: S.56 no crea una allowlist global de todo el copy ni de todos los campos renderizados; se limita a las superficies protegidas actuales y no reabre S.45/S.48/S.49/S.51/S.52/S.54/S.55.
- Verificacion acotada: `npx --no-install playwright test --config=playwright.smoke.config.ts tests/smoke/tenant-rls-negative-local.spec.ts -g "visible protected personal contact hygiene local source guardrails"` pasa con 3 tests. No se reejecuta la suite completa por alcance del corte.

S.57 anade un cuadragesimo sexto corte local P2 source/static guard sobre higiene visible de campos de texto libre protegidos (`notes` y `reasonSummary`), sin credenciales, sin servidor, sin navegador real, sin Supabase real/local, sin SMTP, sin SQL rollback, sin Storage real, sin Server Actions runtime y sin cambios de producto.

Cubierto localmente por S.57:

- P2 source guard de inventario visible: los controles TSX protegidos actuales con `name="notes"` o `name="reasonSummary"` quedan localizados bajo `src/app/(app)/app` y `src/components`, sin convertir todo el copy visible en allowlist global.
- P2 source guard de minimizacion: `reasonSummary` mantiene `maxLength` de 160 caracteres y los controles `notes` quedan acotados a 1000 caracteres o menos.
- P2 source guard de framing operativo: labels/placeholders/ayuda cercana siguen presentando esos campos como resumen, mensaje, contexto, notas internas/operativas, texto breve/corto o notas aplicadas/copied al bloque operativo.
- P2 source guard de no invitacion sensible: salario, nomina/payroll, documentos, salud, ubicacion, tokens, URLs, secretos, justificantes, contratos, identificadores personales y datos bancarios no aparecen como invitacion positiva; solo se permiten en avisos negativos existentes como "no incluyas", "sin datos" o "no registra".
- P2 guardrail antifragil: S.57 no sustituye validadores runtime, no reabre S.15/S.45/S.46/S.49/S.50/S.52/S.55/S.56, no cambia UI y no define reglas globales nuevas de copy.
- Verificacion acotada: `npx --no-install playwright test --config=playwright.smoke.config.ts tests/smoke/tenant-rls-negative-local.spec.ts -g "visible protected free-text field hygiene local source guardrails"` pasa con 1 test. No se reejecuta la suite completa por alcance del corte.

S.58 se evalua el 2026-05-19 y queda bloqueado prudentemente, sin anadir tests, sin tocar `src`, sin migraciones, sin seeds, sin UI y sin cambiar estados de la matriz. La revision de S.42-S.57 y de `tests/smoke/tenant-rls-negative-local.spec.ts` confirma que el carril local/helper-only/source-static visible queda agotado por ahora: cualquier guard adicional util exigiria runtime autenticado, SQL rollback, navegador real, Storage/SMTP real, staging o datos controlados, y los candidatos puramente estaticos repetirian S.15/S.42-S.57 o impondrian reglas globales fragiles de copy/markup.

S.59 anade el primer corte tecnico fuera del carril helper-only/source-static visible: `supabase/snippets/tenant-boundary-centers-rls-rollback.sql`, un SQL rollback local minimo sobre `centers`. Usa tenants A/B sinteticos, `owner`/`coach` locales y `BEGIN`/`ROLLBACK` para validar que un owner de tenant A puede operar su centro, pero no lee ni muta el centro B, no puede insertar centros en tenant B y no puede mover su propio centro a tenant B cambiando `organization_id`; tambien valida que un coach lee pero no actualiza su centro, y que el owner B no lee ni actualiza el centro A.

Cubierto localmente por S.59:

- P2/P3 SQL rollback local acotado: tenant A/B sinteticos en `auth.users`, `organizations`, `organization_memberships` y `centers`, sin seeds persistentes ni datos reales.
- P2 tenant boundary en `centers`: lectura cross-tenant devuelve vacio por RLS para owners A/B.
- P2 cambio de `organization_id`: `owner` de tenant A no puede mover un centro A a tenant B; Postgres devuelve `new row violates row-level security policy`.
- P2 mutacion cross-tenant directa en `centers`: `owner` de tenant A no actualiza centro B, no inserta centro B y `owner` B no actualiza centro A.
- P2 rol base `coach` sobre `centers`: puede leer el centro del tenant, pero no actualizarlo.
- Verificacion acotada: `Get-Content -Raw supabase\snippets\tenant-boundary-centers-rls-rollback.sql | docker exec -i supabase_db_boxops psql -U postgres -d postgres -v ON_ERROR_STOP=1` pasa y termina en `ROLLBACK`.

S.60 anade el segundo corte SQL rollback local A/B: `supabase/snippets/tenant-boundary-schedule-blocks-rls-rollback.sql`, acotado a `schedule_blocks` y referencias tenant-safe a `centers` / `class_types`. Usa tenants A/B sinteticos, managers locales y `BEGIN`/`ROLLBACK` para validar que un manager de tenant A puede crear un bloque valido de su tenant, pero no puede usar `center_id` ni `class_type_id` de tenant B, no puede mutar un bloque de tenant B, no puede insertar directamente en tenant B y no puede mover un bloque cambiando `organization_id`.

Cubierto localmente por S.60:

- P2/P3 SQL rollback local acotado: tenant A/B sinteticos en `auth.users`, `organizations`, `organization_memberships`, `centers`, `class_types` y `schedule_blocks`, sin seeds persistentes ni datos reales.
- P3 tenant-safe references en `schedule_blocks`: insertar o actualizar un bloque tenant A con `center_id` de tenant B falla por FK compuesta `schedule_blocks_center_id_organization_id_fkey`.
- P3 tenant-safe references en `schedule_blocks`: insertar o actualizar un bloque tenant A con `class_type_id` de tenant B falla por FK compuesta `schedule_blocks_class_type_id_organization_id_fkey`.
- P2 cambio de `organization_id`: `manager` de tenant A no puede mover un bloque A a tenant B; Postgres devuelve `new row violates row-level security policy`.
- P2 mutacion cross-tenant directa: `manager` de tenant A no lee ni actualiza bloque B y no inserta directamente un bloque en tenant B; `manager` de tenant B no lee ni actualiza bloque A.
- Verificacion acotada: `Get-Content -Raw supabase\snippets\tenant-boundary-schedule-blocks-rls-rollback.sql | docker exec -i supabase_db_boxops psql -U postgres -d postgres -v ON_ERROR_STOP=1` pasa y termina en `ROLLBACK`.

S.61 anade el tercer corte SQL rollback local A/B: `supabase/snippets/tenant-boundary-schedule-block-assignments-rls-rollback.sql`, acotado a `schedule_block_assignments` y referencias tenant-safe a `schedule_blocks` / `coach_profiles`. Usa tenants A/B sinteticos, managers/coaches locales y `BEGIN`/`ROLLBACK` para validar que un manager de tenant A puede crear y actualizar una asignacion valida de su tenant, pero no puede usar `schedule_block_id` ni `coach_profile_id` de tenant B, no puede leer ni mutar asignaciones de tenant B, no puede insertar directamente en tenant B y no puede mover una asignacion cambiando `organization_id`.

Cubierto localmente por S.61:

- P2/P3 SQL rollback local acotado: tenant A/B sinteticos en `auth.users`, `organizations`, `organization_memberships`, `centers`, `class_types`, `coach_profiles`, `schedule_blocks` y `schedule_block_assignments`, sin seeds persistentes ni datos reales.
- P3 tenant-safe references en `schedule_block_assignments`: insertar o actualizar una asignacion tenant A con `schedule_block_id` de tenant B falla por FK compuesta `schedule_block_assignments_schedule_block_id_organization__fkey`.
- P3 tenant-safe references en `schedule_block_assignments`: insertar o actualizar una asignacion tenant A con `coach_profile_id` de tenant B falla por FK compuesta `schedule_block_assignments_coach_profile_id_organization_i_fkey`.
- P2 cambio de `organization_id`: `manager` de tenant A no puede mover una asignacion A a tenant B; Postgres devuelve `new row violates row-level security policy`.
- P2 mutacion cross-tenant directa: `manager` de tenant A no lee ni actualiza asignacion B y no inserta directamente una asignacion en tenant B; `manager` de tenant B no lee ni actualiza asignacion A.
- P3 coach inactivo queda fuera de S.61: DB/RLS/FKs garantizan frontera de tenant, pero el estado/asignabilidad del coach no esta garantizado por este snippet y debe probarse con Server Actions/RPC/runtime o task propia.
- Verificacion acotada: `Get-Content -Raw supabase\snippets\tenant-boundary-schedule-block-assignments-rls-rollback.sql | docker exec -i supabase_db_boxops psql -U postgres -d postgres -v ON_ERROR_STOP=1` pasa y termina en `ROLLBACK`.

S.62 anade el cuarto corte SQL rollback local A/B: `supabase/snippets/tenant-boundary-schedule-template-blocks-rls-rollback.sql`, acotado a `schedule_template_blocks` y referencias tenant-safe a `schedule_templates` / `centers` / `class_types` / `coach_profiles`. Usa tenants A/B sinteticos, managers/coaches locales y `BEGIN`/`ROLLBACK` para validar que un manager de tenant A puede crear y actualizar un bloque de plantilla valido de su tenant, pero no puede usar `template_id`, `center_id`, `class_type_id` ni `default_coach_profile_id` de tenant B, no puede leer ni mutar bloques de plantilla de tenant B, no puede insertar directamente en tenant B y no puede mover un bloque de plantilla cambiando `organization_id`.

Cubierto localmente por S.62:

- P2/P3 SQL rollback local acotado: tenant A/B sinteticos en `auth.users`, `organizations`, `organization_memberships`, `centers`, `class_types`, `coach_profiles`, `schedule_templates` y `schedule_template_blocks`, sin seeds persistentes ni datos reales.
- P3 tenant-safe references en `schedule_template_blocks`: insertar o actualizar un bloque de plantilla tenant A con `template_id` de tenant B falla por FK compuesta `schedule_template_blocks_template_id_organization_id_fkey`.
- P3 tenant-safe references en `schedule_template_blocks`: insertar o actualizar un bloque de plantilla tenant A con `center_id` de tenant B falla por FK compuesta `schedule_template_blocks_center_id_organization_id_fkey`.
- P3 tenant-safe references en `schedule_template_blocks`: insertar o actualizar un bloque de plantilla tenant A con `class_type_id` de tenant B falla por FK compuesta `schedule_template_blocks_class_type_id_organization_id_fkey`.
- P3 tenant-safe references en `schedule_template_blocks`: insertar o actualizar un bloque de plantilla tenant A con `default_coach_profile_id` de tenant B falla por FK compuesta `schedule_template_blocks_default_coach_profile_id_organiza_fkey`.
- P2 cambio de `organization_id`: `manager` de tenant A no puede mover un bloque de plantilla A a tenant B; Postgres devuelve `new row violates row-level security policy`.
- P2 mutacion cross-tenant directa: `manager` de tenant A no lee ni actualiza bloque de plantilla B y no inserta directamente un bloque de plantilla en tenant B; `manager` de tenant B no lee ni actualiza bloque de plantilla A.
- P3 aplicacion de plantilla queda fuera de S.62: aplicar una plantilla a una semana, generar `schedule_blocks` o crear asignaciones `source = 'template'` usa helpers/runtime de producto y necesita harness propio o entorno real/controlado.
- P3 coach inactivo como `default_coach_profile_id` queda fuera de S.62: DB/RLS/FKs garantizan frontera de tenant, pero el estado/asignabilidad del coach no esta garantizado por este snippet y debe probarse con Server Actions/RPC/runtime o task propia.
- Verificacion acotada: `Get-Content -Raw supabase\snippets\tenant-boundary-schedule-template-blocks-rls-rollback.sql | docker exec -i supabase_db_boxops psql -U postgres -d postgres -v ON_ERROR_STOP=1` pasa y termina en `ROLLBACK`.

S.63 anade el quinto corte SQL rollback local A/B: `supabase/snippets/tenant-boundary-schedule-templates-rls-rollback.sql`, acotado a `schedule_templates` y su referencia tenant-safe opcional a `centers`. Usa tenants A/B sinteticos, managers locales y `BEGIN`/`ROLLBACK` para validar que un manager de tenant A puede crear y actualizar una plantilla valida de su tenant, incluido dejar `center_id` en `NULL`, pero no puede usar `center_id` de tenant B, no puede leer ni mutar plantillas de tenant B, no puede insertar directamente en tenant B y no puede mover una plantilla cambiando `organization_id`.

Cubierto localmente por S.63:

- P2/P3 SQL rollback local acotado: tenant A/B sinteticos en `auth.users`, `organizations`, `organization_memberships`, `centers` y `schedule_templates`, sin seeds persistentes ni datos reales.
- P3 tenant-safe references en `schedule_templates`: insertar o actualizar una plantilla tenant A con `center_id` de tenant B falla por FK compuesta `schedule_templates_center_id_organization_id_fkey`.
- P3 referencia opcional en `schedule_templates`: una plantilla valida de tenant A puede mantener `center_id = NULL` sin abrir frontera cross-tenant.
- P2 cambio de `organization_id`: `manager` de tenant A no puede mover una plantilla A a tenant B; Postgres devuelve `new row violates row-level security policy`.
- P2 mutacion cross-tenant directa: `manager` de tenant A no lee ni actualiza plantilla B y no inserta directamente una plantilla en tenant B; `manager` de tenant B no lee ni actualiza plantilla A.
- P3 aplicacion de plantilla queda fuera de S.63: aplicar una plantilla a una semana, generar `schedule_blocks` o crear asignaciones `source = 'template'` usa helpers/runtime de producto y necesita harness propio o entorno real/controlado.
- Verificacion acotada: `Get-Content -Raw supabase\snippets\tenant-boundary-schedule-templates-rls-rollback.sql | docker exec -i supabase_db_boxops psql -U postgres -d postgres -v ON_ERROR_STOP=1` pasa y termina en `ROLLBACK`.

S.64 anade el sexto corte SQL rollback local A/B: `supabase/snippets/tenant-boundary-class-types-rls-rollback.sql`, acotado a `class_types` como catalogo operativo tenant-scoped. Usa tenants A/B sinteticos, `owner`/`admin`/`manager`/`coach` de tenant A, `manager` de tenant B y `BEGIN`/`ROLLBACK` para validar que roles altos de tenant A pueden crear/actualizar tipos validos de su tenant, pero no pueden leer ni mutar tipos de tenant B, no pueden insertar directamente en tenant B y no pueden mover un tipo cambiando `organization_id`.

Cubierto localmente por S.64:

- P2/P3 SQL rollback local acotado: tenant A/B sinteticos en `auth.users`, `organizations`, `organization_memberships` y `class_types`, sin seeds persistentes ni datos reales.
- P3 catalogo operativo tenant-scoped: `owner`, `admin` y `manager` de tenant A pueden crear y actualizar `class_types` validos de tenant A.
- P2 tenant boundary en `class_types`: lectura cross-tenant devuelve vacio por RLS para `manager` A/B y `coach` A frente a tenant B.
- P2 mutacion cross-tenant directa en `class_types`: `manager` de tenant A no actualiza tipo B, no inserta tipo B y `manager` B no actualiza tipo A.
- P2 cambio de `organization_id`: `manager` de tenant A no puede mover un tipo A a tenant B; Postgres devuelve `new row violates row-level security policy`.
- P2 rol base `coach` sobre `class_types`: puede leer el catalogo del tenant, pero no actualizar ni crear tipos.
- P2 constraints DB existentes: `required_coaches < 0` y `category` invalida fallan cerrado por `CHECK` de `class_types`.
- P3 RPC/runtime fuera de S.64: no se valida `update_class_type_and_sync_defaults(...)`, sincronizacion de defaults a `schedule_template_blocks`/`schedule_blocks`, Server Actions ni el limite superior app/RPC `required_coaches <= 20`.
- Verificacion acotada: `Get-Content -Raw supabase\snippets\tenant-boundary-class-types-rls-rollback.sql | docker exec -i supabase_db_boxops psql -U postgres -d postgres -v ON_ERROR_STOP=1` pasa y termina en `ROLLBACK`.

S.65 anade el septimo corte SQL rollback local A/B: `supabase/snippets/tenant-boundary-coach-profiles-rls-rollback.sql`, acotado a `coach_profiles` como ficha operativa tenant-scoped de equipo/coaches y referencias tenant-safe a `centers`, `person_profiles` y `organization_memberships` por `user_id`. Usa tenants A/B sinteticos, `owner`/`admin`/`manager`/`coach` de tenant A, `manager`/`coach` de tenant B y `BEGIN`/`ROLLBACK` para validar que roles altos de tenant A pueden crear/actualizar fichas validas de su tenant bajo las policies actuales, que `coach` puede leer pero no gestionar, que tenant A/B no leen ni mutan fichas del otro tenant, que no se puede insertar directamente en tenant B, mover `organization_id`, ni usar referencias `primary_center_id`, `person_profile_id` o `user_id` de tenant B.

Cubierto localmente por S.65:

- P2/P3 SQL rollback local acotado: tenant A/B sinteticos en `auth.users`, `organizations`, `organization_memberships`, `centers`, `person_profiles` y `coach_profiles`, sin seeds persistentes ni datos reales.
- P3 ficha operativa tenant-scoped: `owner`, `admin` y `manager` de tenant A pueden crear y actualizar `coach_profiles` validos de tenant A, incluido perfil vinculado a `user_id` y perfil pendiente vinculado a `person_profile_id`.
- P2 tenant boundary en `coach_profiles`: lectura cross-tenant devuelve vacio por RLS para `manager` A/B y `coach` A frente al otro tenant.
- P2 mutacion cross-tenant directa en `coach_profiles`: `manager` de tenant A no actualiza ficha B, no inserta ficha B, no mueve una ficha A a tenant B y `manager` B no actualiza ficha A.
- P2 referencias tenant-safe de `coach_profiles`: `primary_center_id` de tenant B falla por FK compuesta, `person_profile_id` de tenant B falla cerrado por trigger/FK tenant-safe, y `user_id`/membership de tenant B falla por FK compuesta `(organization_id, user_id)`.
- P2 rol base `coach` sobre `coach_profiles`: puede leer fichas del tenant, pero no actualizar ni crear fichas.
- P3 runtime fuera de S.65: no se validan invitaciones, aceptacion por email, Server Actions de `/app/coaches`, creacion/actualizacion real de membership/persona/ficha, cambios de rol ni regla runtime de coach activo/asignable.
- Verificacion acotada: `Get-Content -Raw supabase\snippets\tenant-boundary-coach-profiles-rls-rollback.sql | docker exec -i supabase_db_boxops psql -U postgres -d postgres -v ON_ERROR_STOP=1` pasa y termina en `ROLLBACK`.

S.66 anade el octavo corte SQL rollback local A/B: `supabase/snippets/tenant-boundary-person-profiles-rls-rollback.sql`, acotado a `person_profiles` como perfil visible/persona operativa tenant-scoped. Usa tenants A/B sinteticos, `owner`/`admin`/`manager`/`coach` de tenant A, `manager`/`coach` de tenant B y `BEGIN`/`ROLLBACK` para validar lo que garantizan las policies actuales: `owner`/`admin` gestionan perfiles de tenant A; `manager` no gestiona `person_profiles`; miembros leen perfiles `visible`; usuarios vinculados leen y actualizan campos propios basicos; perfiles `internal` ajenos quedan ocultos para roles no admin; tenant A/B no leen ni mutan perfiles del otro tenant; no se puede insertar directamente en tenant B, mover `organization_id` ni enlazar `user_id` de tenant B.

Cubierto localmente por S.66:

- P2/P3 SQL rollback local acotado: tenant A/B sinteticos en `auth.users`, `organizations`, `organization_memberships` y `person_profiles`, sin seeds persistentes ni datos reales.
- P3 perfil visible/persona operativa tenant-scoped: `owner` y `admin` de tenant A pueden crear y actualizar `person_profiles` validos de tenant A bajo las policies actuales.
- P2 rol `manager` sobre `person_profiles`: puede leer perfiles `visible` de su tenant como miembro, pero no crear ni actualizar perfiles porque las policies DB actuales no lo conceden.
- P2 lectura por miembro y perfil propio: `coach` de tenant A puede leer perfiles `visible` del tenant y su propio perfil `internal` vinculado por `user_id`, pero no perfiles `internal` de otra persona.
- P2 actualizacion propia acotada: usuario vinculado puede actualizar `display_name`, `preferred_alias` y `public_email` en su propio perfil bajo RLS/trigger actuales, pero no `status`, `visibility_status` ni `metadata`.
- P2 tenant boundary en `person_profiles`: lectura cross-tenant devuelve vacio por RLS para `manager` A/B y `coach` A frente al otro tenant.
- P2 mutacion cross-tenant directa en `person_profiles`: tenant A no actualiza perfiles B, no inserta perfiles B y no mueve un perfil A a tenant B; tenant B no actualiza perfil A.
- P2 referencia tenant-safe de `person_profiles.user_id`: insertar o actualizar un perfil tenant A con `user_id` de tenant B falla por FK compuesta `(organization_id, user_id)` hacia `organization_memberships`.
- P3 runtime fuera de S.66: no se validan invitaciones, aceptacion por email, Server Actions de `/app/account` o `/app/coaches`, Storage-backed avatar/firma, profile assets, SMTP, navegador real ni limites de producto que viven en actions/helpers.
- Verificacion acotada: `Get-Content -Raw supabase\snippets\tenant-boundary-person-profiles-rls-rollback.sql | docker exec -i supabase_db_boxops psql -U postgres -d postgres -v ON_ERROR_STOP=1` pasa y termina en `ROLLBACK`.

S.67 anade el noveno corte SQL rollback local A/B: `supabase/snippets/tenant-boundary-organization-memberships-rls-rollback.sql`, acotado a `organization_memberships` como fuente critica de tenant/rol. Usa tenants A/B sinteticos, `owner`/`admin`/`manager`/`coach` de tenant A, `owner`/`coach` de tenant B y `BEGIN`/`ROLLBACK` para validar lo que garantizan las policies actuales: `owner`/`admin` pueden crear/actualizar memberships validas de tenant A; `manager` lee memberships del tenant bajo la policy actual, pero no gestiona accesos; `coach` solo lee su propia membership; tenant A/B no leen ni mutan memberships del otro tenant; tenant A no inserta directamente en tenant B ni mueve una membership cambiando `organization_id`.

Cubierto localmente por S.67:

- P2/P3 SQL rollback local acotado: tenant A/B sinteticos en `auth.users`, `organizations` y `organization_memberships`, sin seeds persistentes ni datos reales.
- P2 fuente de tenant/rol: `admin` de tenant A puede crear y actualizar una membership valida de tenant A bajo las policies actuales, y `owner` puede actualizar rol/estado dentro de tenant A.
- P2 lectura por rol: `manager` de tenant A puede leer memberships relevantes del tenant porque la policy SELECT actual lo permite, mientras `coach` de tenant A solo lee su propia membership.
- P2 gestion de accesos denegada: `manager` no puede crear memberships ni elevar rol/cambiar estado de otra membership; `coach` no puede crear ni actualizar su propia role/status.
- P2 tenant boundary en `organization_memberships`: lectura cross-tenant devuelve vacio por RLS para tenant A/B y las mutaciones cross-tenant no afectan filas.
- P2 cambio de `organization_id`: `owner` de tenant A no puede mover una membership A a tenant B; Postgres devuelve `new row violates row-level security policy`.
- P2 insercion directa en tenant B: `owner` de tenant A no puede insertar una membership directamente en tenant B.
- P3 runtime/invitaciones fuera de S.67: la DB actual permite a `owner`/`admin` anadir un `auth.users.id` existente a su propio tenant; no se fuerza como fallo DB y el flujo de invitacion/aceptacion/Auth/email/Server Actions queda fuera de este corte.
- Verificacion acotada: `Get-Content -Raw supabase\snippets\tenant-boundary-organization-memberships-rls-rollback.sql | docker exec -i supabase_db_boxops psql -U postgres -d postgres -v ON_ERROR_STOP=1` pasa y termina en `ROLLBACK`.

S.68 anade el decimo corte SQL rollback local A/B: `supabase/snippets/tenant-boundary-staff-work-windows-rls-rollback.sql`, acotado a `staff_work_windows` como superficie operativa tenant-scoped de jornada prevista. Usa tenants A/B sinteticos, `owner`/`admin`/`manager`/`coach`/`staff` de tenant A, `manager`/`coach` de tenant B y `BEGIN`/`ROLLBACK` para validar lo que garantizan las policies actuales: `owner`/`admin`/`manager` crean, actualizan y desactivan franjas validas de tenant A; miembros activos sin gestion leen solo franjas activas de su tenant; tenant A/B no leen ni mutan franjas del otro tenant; tenant A no inserta directamente en tenant B, no mueve una franja cambiando `organization_id` y no usa `person_profile_id` ni `center_id` de tenant B.

Cubierto localmente por S.68:

- P2/P3 SQL rollback local acotado: tenant A/B sinteticos en `auth.users`, `organizations`, `organization_memberships`, `centers`, `person_profiles` y `staff_work_windows`, sin seeds persistentes ni datos reales.
- P3 jornada prevista tenant-scoped: `owner`, `admin` y `manager` de tenant A pueden crear, actualizar y desactivar `staff_work_windows` validas de tenant A bajo las policies actuales.
- P2 lectura por miembro: `coach` y `staff` de tenant A pueden leer franjas activas del tenant como contexto compartido, pero no leen franjas inactivas ni franjas de tenant B.
- P2 gestion denegada a roles sin gestion: `coach` y `staff` de tenant A no pueden crear ni actualizar `staff_work_windows`.
- P2 tenant boundary en `staff_work_windows`: lectura cross-tenant devuelve vacio por RLS para tenant A/B y las mutaciones cross-tenant no afectan filas.
- P2 cambio de `organization_id`: `owner` de tenant A no puede mover una franja A a tenant B; Postgres devuelve `new row violates row-level security policy`.
- P2 referencias tenant-safe de `staff_work_windows`: insertar o actualizar una franja tenant A con `person_profile_id` de tenant B falla por FK compuesta, e insertar o actualizar con `center_id` de tenant B falla por FK compuesta.
- P3 runtime/producto fuera de S.68: no se validan Server Actions de `/app/schedule`, navegador, auditoria persistida, reglas producto de persona visible/activa o centro activo/inactivo, credenciales reales, staging ni datos reales.
- Verificacion acotada: `Get-Content -Raw supabase\snippets\tenant-boundary-staff-work-windows-rls-rollback.sql | docker exec -i supabase_db_boxops psql -U postgres -d postgres -v ON_ERROR_STOP=1` pasa y termina en `ROLLBACK`.

S.69 anade el undecimo corte SQL rollback local A/B: `supabase/snippets/tenant-boundary-operational-events-rls-rollback.sql`, acotado a `operational_events` como superficie operativa tenant-scoped de eventos/festivos/competiciones. Usa tenants A/B sinteticos, `owner`/`admin`/`manager`/`coach`/`staff` de tenant A, `manager`/`coach` de tenant B y `BEGIN`/`ROLLBACK` para validar lo que garantizan las policies/RPC actuales: `owner`/`admin`/`manager` crean, actualizan, cancelan y archivan eventos validos de tenant A por RPC; `coach` lee solo eventos `active` con visibilidad `staff`/`all_staff`; `staff` no lee eventos bajo la policy DB actual; roles sin gestion no gestionan; tenant A/B no leen ni mutan eventos del otro tenant; tenant A no inserta directamente en tenant B, no mueve un evento cambiando `organization_id` y no usa `center_id` de tenant B.

Cubierto localmente por S.69:

- P2/P3 SQL rollback local acotado: tenant A/B sinteticos en `auth.users`, `organizations`, `organization_memberships`, `centers` y `operational_events`, sin seeds persistentes ni datos reales.
- P3 eventos operativos tenant-scoped: `owner`, `admin` y `manager` de tenant A pueden crear, actualizar, cancelar y archivar `operational_events` validos de tenant A por la via RPC actual.
- P2 lectura no gestora: `coach` de tenant A puede leer eventos activos visibles (`staff`/`all_staff`) de su tenant, pero no eventos `management`, cancelados ni de tenant B; `staff` no lee eventos porque la policy DB actual no lo concede.
- P2 gestion denegada a roles sin gestion: `coach` y `staff` de tenant A no pueden crear, actualizar ni cancelar `operational_events` por RPC.
- P2 tenant boundary en `operational_events`: lectura cross-tenant devuelve vacio por RLS para tenant A/B y las mutaciones cross-tenant por RPC fallan cerrado.
- P2 escritura directa cerrada: `authenticated` no tiene grant directo de `INSERT`/`UPDATE` sobre `operational_events`; tenant A no puede insertar en B ni mover `organization_id` por escritura directa.
- P2 referencia tenant-safe de `operational_events.center_id`: crear o actualizar un evento tenant A con `center_id` de tenant B falla por FK/validacion tenant-safe.
- P3 runtime/producto fuera de S.69: no se validan Server Actions de `/app/schedule`, navegador, POST directo, auditoria persistida detallada, reglas visuales, credenciales reales, staging ni datos reales.
- Verificacion acotada: `Get-Content -Raw supabase\snippets\tenant-boundary-operational-events-rls-rollback.sql | docker exec -i supabase_db_boxops psql -U postgres -d postgres -v ON_ERROR_STOP=1` pasa y termina en `ROLLBACK`.

S.70 anade el duodecimo corte SQL rollback local A/B: `supabase/snippets/tenant-boundary-document-metadata-rls-rollback.sql`, acotado a metadata documental local sin Storage real. Usa tenants A/B sinteticos, usuario con `read_metadata`, usuario con `preview`, usuario con `download`, sujeto `person`, usuario sin grant, `manager` sin grant/capacidad, owner A y owner B, con `BEGIN`/`ROLLBACK`, para validar lo que garantizan las policies/RPC actuales: grants activos conceden solo el nivel esperado, grants revocados/expirados no cuentan, sujeto `person` activo concede acceso hasta `download` pero no `manage`, manager no hereda acceso documental por rol operativo, tenant A/B no leen ni mutan metadata documental del otro tenant, tenant A no inserta en B, no mueve `organization_id` y no usa `person_profile_id`, `organization_membership_id`, `document_id` ni `document_version_id` de tenant B. Tambien valida `begin_document_version_upload(...)` y `cancel_document_version_upload(...)` solo como metadata; `activate_document_version_upload(...)` y Storage real quedan fuera.

Cubierto localmente por S.70:

- P4 SQL rollback local acotado: tenant A/B sinteticos en `auth.users`, `organizations`, `organization_memberships`, `person_profiles`, `documents`, `document_versions`, `document_subjects` y `document_access_grants`, sin seeds persistentes ni datos reales.
- P4 repository metadata: usuario con `read_metadata` ve solo metadata autorizada por `list_accessible_document_versions(...)`, sin `can_preview`, sin `can_download`, sin lectura directa de version y sin lectura de grants.
- P4 preview/download metadata: usuarios con grants `preview` y `download` obtienen `can_preview`/`can_download` y `can_access_document(...)` coherentes a nivel metadata/RPC, sin validar archivo real.
- P4 subjects: sujeto `person` activo obtiene acceso hasta `download`, no obtiene `manage`, no lee grants y no convierte `document_subjects` en gestion documental amplia.
- P4 grants: grants revocados o expirados no conceden metadata, grants ambiguos fallan por constraint, targets de grant son inmutables, y `manager` sin grant/capacidad no hereda lectura documental ni `document_grant_manage`.
- P4 tenant boundary documental: tenant A/B no leen ni mutan documentos del otro tenant; tenant A no inserta metadata en tenant B, no mueve `organization_id`, no usa persona/membership/documento/version de tenant B y no crea version metadata de tenant B por RPC.
- P4 version metadata RPC: `begin_document_version_upload(...)` crea solo metadata `pending` tenant-scoped con path derivado y `cancel_document_version_upload(...)` la marca `deleted`; no se toca Storage real.
- P4 Storage/runtime fuera de S.70: no se validan `activate_document_version_upload(...)`, objeto `document-files`, policies Storage reales, signed URLs efectivas, rutas E.5, auditoria backend real, navegador, Server Actions, credenciales reales, staging ni datos reales.
- Verificacion acotada: `Get-Content -Raw supabase\snippets\tenant-boundary-document-metadata-rls-rollback.sql | docker exec -i supabase_db_boxops psql -U postgres -d postgres -v ON_ERROR_STOP=1` pasa y termina en `ROLLBACK`.

S.71 anade el decimotercer corte SQL rollback local A/B: `supabase/snippets/tenant-boundary-document-access-audit-rls-rollback.sql`, acotado a auditoria documental local sin Storage real. Usa tenants A/B sinteticos, roles `owner`/`admin`/`manager`/`document_admin`/`payroll_manager`, usuario con `read_metadata`, usuario con `download`, usuario sin grant y `document_admin` de tenant B, con `BEGIN`/`ROLLBACK`, para validar lo que garantizan las policies/RPC actuales: eventos `allowed` solo se registran con acceso suficiente o capacidad documental, eventos `denied` quedan acotados a `metadata_read`/`file_preview`/`file_download` y no conceden acceso posterior, metadata insegura se rechaza, `owner`/`admin`/`manager` no leen auditoria documental por herencia operativa, `document_admin` lee auditoria no payroll, `payroll_manager` lee auditoria payroll bajo la DB actual, tenant A/B no leen ni registran auditoria del otro tenant y `authenticated` no inserta/actualiza/borra directamente `document_access_events`.

Cubierto localmente por S.71:

- P4 SQL rollback local acotado: tenant A/B sinteticos en `auth.users`, `organizations`, `organization_memberships`, `person_profiles`, `documents`, `document_versions`, `document_access_grants` y `document_access_events`, sin seeds persistentes ni datos reales.
- P4 registro de auditoria documental permitido: grant `read_metadata` registra `metadata_read`, grant `download` registra `file_download`, y `document_admin` registra `file_preview` sobre documento no payroll gestionable, todo por `record_document_access_event(...)` y con actor/membership/persona derivados.
- P4 registro de auditoria documental denegado: usuario sin grant no registra eventos `allowed`, pero puede registrar `denied` acotados para `metadata_read`, `file_preview` y `file_download` sin ganar lectura documental ni visibilidad de auditoria.
- P4 metadata safe: `record_document_access_event(...)` rechaza URLs, signed URLs, Storage paths, tokens, secretos, payload/contenido documental, firma, `document_hash`, arrays y texto largo antes de persistir.
- P4 lectura de auditoria documental: `owner`, `admin` y `manager` no leen ni listan auditoria por herencia operativa; `document_admin` lee/lista eventos no payroll; `payroll_manager` lee/lista eventos payroll y no no-payroll bajo la DB actual.
- P4 tenant boundary de auditoria documental: tenant B no lee/lista/registra auditoria para documentos de tenant A; tenant B solo registra/lista auditoria de su propio documento.
- P4 escritura directa cerrada: `authenticated` no tiene grant directo de `INSERT`/`UPDATE`/`DELETE` sobre `document_access_events`; la escritura normal pasa por RPC.
- P4 Storage/runtime fuera de S.71: no se validan rutas E.5, `handleDocumentVersionFileAccess(...)`, objeto `document-files`, signed URLs efectivas, expiracion, policies Storage reales, navegador, Server Actions, credenciales reales, staging ni datos reales.
- Verificacion acotada: `Get-Content -Raw supabase\snippets\tenant-boundary-document-access-audit-rls-rollback.sql | docker exec -i supabase_db_boxops psql -U postgres -d postgres -v ON_ERROR_STOP=1` pasa y termina en `ROLLBACK`.

S.72 anade el decimocuarto corte SQL rollback local A/B: `supabase/snippets/tenant-boundary-time-audit-events-rls-rollback.sql`, acotado a auditoria de fichaje local por RLS/triggers y lectura minima de cierres semanales. Usa tenants A/B sinteticos, roles `owner`/`admin`/`manager`/`coach`/`payroll_manager`, `manager` y `coach` de tenant B, con `BEGIN`/`ROLLBACK`, para validar lo que garantiza la DB actual: `create_own_time_punch(...)` crea auditoria con actor/membership/persona derivados, `owner`/`admin`/`manager` leen auditoria del tenant por `can_manage_time_tracking(...)`, `coach` lee solo sus propios eventos y su propio cierre semanal, `payroll_manager` no hereda lectura, tenant A/B no leen ni crean auditoria/cierres del otro tenant, `authenticated` no inserta directamente `time_audit_events`, `UPDATE`/`DELETE` directos quedan sin efecto por RLS bajo la DB actual, y la metadata insegura se rechaza por helper/constraint.

Cubierto localmente por S.72:

- P3 SQL rollback local acotado: tenants A/B sinteticos en `auth.users`, `organizations`, `organization_memberships`, `person_profiles`, `time_records`, `time_punches`, `time_weekly_approvals`, `time_exports` y `time_audit_events`, sin seeds persistentes ni datos reales.
- P3 auditoria de fichaje por triggers: punches propios generan `time_record_created` y `time_punch_created`; cierres semanales pendientes generan auditoria de cierre; exporte solicitado genera auditoria tenant-wide sin `target_person_profile_id`.
- P3 lectura de auditoria/cierres: `owner`, `admin` y `manager` leen auditoria del tenant; `coach` solo lee eventos/cierre propios; `payroll_manager` no hereda lectura; tenant B no lee tenant A.
- P3 escritura directa cerrada o sin efecto: `authenticated` no puede insertar `time_audit_events`; `UPDATE`/`DELETE` directos no afectan filas bajo la RLS actual.
- P3 metadata safe: `time_audit_event_metadata_is_safe(...)` y el constraint rechazan claves de URL, token, firma, ubicacion y payload demasiado grande.
- P3 runtime/F.15 fuera de S.72: no se validan `/app/time`, Server Actions, POST directo, firma propia real, aprobacion/reapertura real, CSV generado/descargado, scheduler, retencion legal, navegador, credenciales reales, staging ni datos reales.
- Verificacion acotada: `Get-Content -Raw supabase\snippets\tenant-boundary-time-audit-events-rls-rollback.sql | docker exec -i supabase_db_boxops psql -U postgres -d postgres -v ON_ERROR_STOP=1` pasa y termina en `ROLLBACK`.

S.73 anade el decimoquinto corte SQL rollback local A/B: `supabase/snippets/tenant-boundary-time-records-punches-rls-rollback.sql`, acotado a `time_records` y `time_punches` como filas canonicas de fichaje. Antes de escribirlo se inspeccionaron policies, triggers y RPCs reales de fichaje; la DB actual permite `SELECT`/`INSERT` propios bajo RLS, permite lectura de gestion por `can_manage_time_tracking(...)`, no concede esa gestion a `payroll_manager`, y no tiene policies normales de `UPDATE`/`DELETE` sobre registros/punches. El rollback usa tenants A/B sinteticos, roles `owner`/`admin`/`manager`/`coach`/`payroll_manager`, `manager` y `coach` de tenant B, y confirma INSERT propia permitida por la DB actual, INSERT ajena/cross-tenant rechazada o sin efecto, referencias de centro cross-tenant rechazadas, lectura propia frente a lectura de gestion, aislamiento A/B y UPDATE/DELETE directos sin efecto.

Cubierto localmente por S.73:

- P3 time records/punches RLS: `coach` crea y lee sus propios registros/punches bajo las policies actuales; `owner`, `admin` y `manager` leen filas del tenant; `payroll_manager` no hereda revision; tenant B no lee tenant A.
- P3 direct DML normal: INSERT de otra persona o tenant B se rechaza o queda sin efecto por RLS/validacion/FK; UPDATE/DELETE directos sobre `time_records` y `time_punches` no afectan filas.
- P3 limites honestos: S.73 no valida `/app/time`, Server Actions, POST directo, aprobacion/reapertura con firma real, automatico por planificacion, CSV descargable, scheduler, F.15, staging, cumplimiento laboral definitivo ni direct SQL TRUNCATE/grant hardening.
- Verificacion acotada: `Get-Content -Raw supabase\snippets\tenant-boundary-time-records-punches-rls-rollback.sql | docker exec -i supabase_db_boxops psql -U postgres -d postgres -v ON_ERROR_STOP=1` pasa y termina en `ROLLBACK`.

S.74 anade un decimosexto corte SQL rollback local: `supabase/snippets/tenant-direct-grants-inventory-rollback.sql`, acotado a inventario de grants directos y default ACL, sin hardening. Antes de decidirlo se inspeccionaron `pg_class.relacl`, `pg_default_acl`, `information_schema.role_table_grants`, `has_table_privilege(...)`, `pg_policies`, migraciones con `GRANT`/`REVOKE` y usos runtime de DML directo/RPC. El resultado separa RLS de postura de privilegios: todas las 40 tablas publicas de app tienen RLS y policies para `authenticated`, pero los grants directos actuales siguen siendo amplios en muchas tablas por default ACL o falta de `REVOKE` explicito a `anon`/`authenticated`.

Cubierto localmente por S.74:

- P3/P4 inventario de grants: `anon` tiene privilegios directos amplios (`INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `REFERENCES`, `TRIGGER`) en 32 tablas publicas; `authenticated` tiene al menos un privilegio directo de riesgo en 30 tablas y `TRUNCATE` en 29 tablas.
- P3/P4 default ACL: en `public`, los default privileges de tablas para `postgres` y `supabase_admin` incluyen `anon=arwdDxt` y `authenticated=arwdDxt`; futuros objetos pueden heredar esa postura si una migracion no revoca de forma explicita.
- P3/P4 contraste RLS: `anon` no aparece como rol de policy RLS en las tablas de app, por lo que normal DML por filas no equivale a permiso efectivo de negocio; `TRUNCATE` se confirma aparte porque no es control row-level.
- P3 fichaje/TRUNCATE: `SET LOCAL ROLE authenticated; TRUNCATE public.time_records CASCADE;` y el mismo probe para `anon` pasan dentro de la transaccion rollback y arrastran `time_punches`, `time_record_corrections`, `time_audit_events` y `time_location_events` hasta el `ROLLBACK`.
- P3/P4 no-hardening: S.74 no aplica migracion porque `src` aun usa DML directo con RLS en varias superficies (`centers`, `organizations`, `class_types`, `schedule_*`, `staff_work_windows`, `person_profiles`, `coach_profiles`, `organization_memberships`, `team_invitations`, `time_record_corrections`, `time_exports`) y otras superficies RPC necesitan revision tabla por tabla.
- Verificacion acotada: `Get-Content -Raw supabase\snippets\tenant-direct-grants-inventory-rollback.sql | docker exec -i supabase_db_boxops psql -U postgres -d postgres -v ON_ERROR_STOP=1` pasa y termina en `ROLLBACK`.

S.75 anade un decimoseptimo corte SQL rollback local: `supabase/snippets/tenant-direct-grants-hardening-impact-analysis-rollback.sql`, acotado a analisis de impacto y simulacion de hardening de grants directos, sin aplicar migracion. Antes de escribir se reinspecciono catalogo local, default ACL, `information_schema.role_table_grants`, `pg_policies`, DML directo en `src`, RPCs y migraciones `GRANT`/`REVOKE`. El resultado no repite S.74: clasifica tabla por tabla el blast radius y simula una candidata minima dentro de `ROLLBACK`.

Cubierto localmente por S.75:

- P3/P4 clasificacion de impacto: las 40 tablas publicas de app quedan clasificadas como 14 dependencias actuales de DML directo en `src`, 21 RPC-only/SELECT-only, 4 tablas de metadata documental que requieren decision futura de gestion/grants y 1 tabla legacy/no usada por `src` actual (`coach_center_assignments`).
- P3/P4 candidata minima simulada: dentro de `BEGIN`/`ROLLBACK`, `anon` queda con 0 privilegios directos sobre tablas publicas de app; `authenticated` queda con 0 `TRUNCATE`, `REFERENCES` y `TRIGGER`; y las operaciones DML directas observadas en `src` para `authenticated` siguen concedidas.
- P3/P4 RPC behavior separado: la simulacion confirma que `get_team_invitation_public(uuid,text)` conserva `EXECUTE` para `anon` y `accept_team_invitation(uuid,text)` conserva `EXECUTE` para `authenticated`; esto no equivale a prueba runtime de invitaciones.
- P3/P4 default ACL futuro: el snippet simula el revoke de default table ACL owned by `postgres`, pero confirma que `supabase_admin` requiere paso separado de owner/operador/migracion; no se marca como cerrado.
- P3/P4 decision prudente: S.75 deja como plausible una migracion futura minima para `anon` + `TRUNCATE/REFERENCES/TRIGGER`, y otra migracion separada para default privileges, pero no aplica ninguna sin smoke/runtime/harness.
- Verificacion acotada: `Get-Content -Raw supabase\snippets\tenant-direct-grants-hardening-impact-analysis-rollback.sql | docker exec -i supabase_db_boxops psql -U postgres -d postgres -v ON_ERROR_STOP=1 -P pager=off` pasa y termina en `ROLLBACK`.

S.76 anade un decimoctavo corte SQL rollback local: `supabase/snippets/tenant-direct-grants-migration-readiness-post-revoke-probes-rollback.sql`, acotado a readiness review para una migracion minima futura de grants directos. Antes de escribir se reinspecciono catalogo local (`pg_class.relacl`, `pg_default_acl`, `information_schema.role_table_grants`, `pg_policies`), se rebusco DML directo/RPC en `src` y se comparo con migraciones `GRANT`/`REVOKE`. El resultado no aplica hardening: convierte la candidata de S.75 en checklist tabla por tabla y probes post-revoke que pueden acompanar un borrador futuro.

Cubierto localmente por S.76:

- P3/P4 checklist de migracion: las 40 tablas quedan separadas entre revokes minimos probablemente seguros (`anon` table grants y `authenticated TRUNCATE/REFERENCES/TRIGGER`), revokes no seguros sobre `authenticated INSERT/UPDATE/DELETE` en las 14 tablas con DML directo actual, RPC-only/SELECT-only que exigen runtime harness futuro, 4 tablas documentales pendientes de decision de gestion/grants y 1 legacy por confirmar.
- P3/P4 probes post-revoke: dentro de `BEGIN`/`ROLLBACK`, los revokes minimos se ejecutan; `anon` queda con 0 privilegios directos de tabla; `authenticated` queda con 0 `TRUNCATE`, `REFERENCES` y `TRIGGER`; y el DML directo observado en `src` conserva privilegio de tabla.
- P3/P4 RPC behavior separado: los probes confirman que `get_team_invitation_public(uuid,text)` conserva `EXECUTE` para `anon` y `accept_team_invitation(uuid,text)` conserva `EXECUTE` para `authenticated`, sin declarar runtime de invitaciones validado.
- P3/P4 default privileges separado: el snippet no modifica default privileges; reporta que `postgres` y especialmente `supabase_admin` requieren migracion owner/operador separada.
- Verificacion acotada: `Get-Content -Raw supabase\snippets\tenant-direct-grants-migration-readiness-post-revoke-probes-rollback.sql | docker exec -i supabase_db_boxops psql -U postgres -d postgres -v ON_ERROR_STOP=1 -P pager=off` pasa y termina en `ROLLBACK`.

S.77 anade un decimonoveno corte SQL/documental local: `supabase/snippets/tenant-direct-grants-minimal-hardening-draft.sql` como borrador no aplicado de migracion minima futura y `supabase/snippets/tenant-direct-grants-minimal-hardening-draft-verification-rollback.sql` como verificador rollback del borrador. Antes de escribir se reinspecciono el catalogo local (`pg_class.relacl`, `pg_default_acl`, `information_schema.role_table_grants`, `pg_policies`), se rebusco DML directo/RPC en `src` y se comparo con migraciones `GRANT`/`REVOKE`. El resultado no aplica hardening: transforma la readiness de S.76 en un draft de dos sentencias, guardado como snippet para no aparentar migracion aplicada.

Cubierto localmente por S.77:

- P3/P4 draft minimo futuro: el borrador queda limitado a `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon` y `REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM authenticated`.
- P3/P4 no-DML revoke: el draft documenta explicitamente que no toca `authenticated INSERT/UPDATE/DELETE`, porque current `src` sigue usando DML directo por RLS en 14 tablas y reducirlas a SELECT/RPC exige runtime/PostgREST/Server Action evidence.
- P3/P4 default privileges separado: el draft no incluye `ALTER DEFAULT PRIVILEGES`; deja `postgres` y `supabase_admin` como paso separado de owner/operador/migracion.
- P3/P4 checklist post-aplicacion: el draft lista probes basados en S.76 para catalogo, RLS/policies, grants de `anon`, `TRUNCATE/REFERENCES/TRIGGER` de `authenticated`, DML directo observado, EXECUTE de RPCs clave, runtime smoke y default privileges.
- P3/P4 verificador rollback: dentro de `BEGIN`/`ROLLBACK`, el companion ejecuta el cuerpo exacto del draft y confirma que `anon` queda con 0 grants de tabla, `authenticated` queda con 0 `TRUNCATE/REFERENCES/TRIGGER`, el DML directo observado conserva privilegios, los RPCs de invitacion conservan `EXECUTE` y default ACL queda separado.
- Verificacion acotada: `Get-Content -Raw supabase\snippets\tenant-direct-grants-minimal-hardening-draft-verification-rollback.sql | docker exec -i supabase_db_boxops psql -U postgres -d postgres -v ON_ERROR_STOP=1 -P pager=off` pasa y termina en `ROLLBACK`.

S.78 anade un vigesimo corte documental local: `docs/operations/tenant-direct-grants-runtime-validation-runbook.md`, acotado a preparar la validacion runtime previa a aplicar el draft S.77 en cualquier entorno objetivo. Antes de escribir se reinspecciono el catalogo local (`pg_class.relacl`, `pg_default_acl`, `information_schema.role_table_grants`, `has_table_privilege(...)`, `pg_policies`), se rebusco DML directo/RPC en `src` y se comparo con migraciones `GRANT`/`REVOKE`. El resultado no aplica hardening: distingue catalogo/probes SQL ya cubiertos por rollback, PostgREST/direct table DML pendiente, Server Actions/rutas pendientes, RPC `SECURITY DEFINER` pendiente como comportamiento, default privileges separado y QA/staging bloqueado por acceso real.

Cubierto localmente por S.78:

- P3/P4 runbook runtime previo: define la secuencia de preflight, baseline runtime, entorno candidato desechable, PostgREST/Server Actions, RPCs, default privileges y decision antes de convertir S.77 en migracion real.
- P3/P4 matriz de DML directo: lista las 14 tablas con DML directo actual (`centers`, `class_types`, `coach_profiles`, `organization_memberships`, `organizations`, `person_profiles`, `schedule_block_assignments`, `schedule_blocks`, `schedule_template_blocks`, `schedule_templates`, `staff_work_windows`, `team_invitations`, `time_exports`, `time_record_corrections`) y las superficies minimas que deben validarse.
- P3/P4 separacion de RPCs: exige probar comportamiento de RPCs por flujo, no solo `has_function_privilege(...)`, manteniendo las invitaciones publicas/autenticadas como probes minimos ya conocidos.
- P3/P4 no-hardening: S.78 no crea SQL nuevo, no aplica el draft, no cambia grants reales, no toca default privileges y no convierte `Direct SQL grants` en algo distinto de `parcial`.
- Verificacion acotada: no hay snippet SQL que ejecutar; el cierre se limita a documentacion, catalogo local, busqueda de DML/RPC/migraciones y guardrails de diff/source.

S.79 anade un vigesimoprimer corte documental local: `docs/operations/tenant-direct-grants-runtime-scenario-manifest.md`, acotado a mapear escenarios runtime para validar el draft S.77 antes de aplicarlo. Antes de escribir se reinspecciono el catalogo local (`pg_class.relacl`, `pg_default_acl`, `information_schema.role_table_grants`, `pg_policies`), se rebusco DML directo/RPC en `src` y se comparo con migraciones `GRANT`/`REVOKE`. El resultado no aplica hardening: convierte la tabla general de S.78 en escenarios por tabla/action/ruta/rol/evidencia/bloqueo.

Cubierto localmente por S.79:

- P3/P4 manifiesto de escenarios runtime: cubre las 14 tablas con DML directo actual y, para cada una, el archivo/action/helper/ruta, rol minimo, caso feliz, negativo por rol, negativo cross-tenant/ID ajeno, evidencia esperada y bloqueo por entorno.
- P3/P4 separacion local vs entorno: distingue lo que puede prepararse localmente sin cambiar grants de lo que exige Auth/SMTP/Storage/staging/F.15 real o un harness runtime dedicado.
- P3/P4 apoyo en S.78: no duplica la secuencia general ni los probes SQL; se limita a convertirlos en checklist ejecutable futura por superficie.
- P3/P4 no-hardening: S.79 no crea SQL nuevo, no aplica el draft, no cambia grants reales, no toca default privileges, no toca `src` y no convierte `Direct SQL grants` en algo distinto de `parcial`.
- Verificacion acotada: no hay snippet SQL que ejecutar; el cierre se limita a documentacion, catalogo local, busqueda de DML/RPC/migraciones y guardrails de diff/source.

S.80 anade un vigesimosegundo corte documental local: `docs/operations/tenant-direct-grants-runtime-evidence-capture-template.md`, acotado a preparar una hoja de captura pass/fail/bloqueado para ejecutar S.79 en un entorno autorizado. Antes de escribir se reinspecciono el catalogo local (`pg_class.relacl`, `pg_default_acl`, `information_schema.role_table_grants`, `pg_policies`), se rebusco DML directo/RPC en `src` y se comparo con migraciones `GRANT`/`REVOKE`. El resultado no aplica hardening: separa evidencia local, entorno desechable autorizado y staging/QA real, y recuerda que la evidencia sensible vive fuera del repo.

Cubierto localmente por S.80:

- P3/P4 plantilla de evidencia runtime: define datos de ejecucion, entorno, commit/branch, rol, tabla/action/ruta, caso feliz, negativo por rol, negativo cross-tenant/ID ajeno, resultado esperado, resultado observado redacted, bloqueo de Auth/SMTP/Storage/staging/F.15 y decision `pass`/`fail`/`bloqueado`.
- P3/P4 apoyo en S.78/S.79: no repite la secuencia general ni el manifiesto; se limita a convertirlos en una hoja de captura para operador autorizado.
- P3/P4 separacion de evidencia: distingue local, desechable autorizado y staging/QA real; prohibe guardar en repo secretos, cookies, signed URLs, rutas Storage activas, contenido documental, emails reales, logs completos o screenshots con datos reales.
- P3/P4 no-hardening: S.80 no crea SQL nuevo, no aplica el draft, no cambia grants reales, no toca default privileges, no toca `src` y no convierte `Direct SQL grants` en algo distinto de `parcial`.
- Verificacion acotada: se reejecuta el inventario S.74 con rollback, se revisa catalogo local, DML/RPC/migraciones y guardrails de diff/source.

S.81 anade un vigesimotercer corte documental local: cierre explicito del carril local de direct grants sin crear documento nuevo. Antes de escribir se reinspecciono el catalogo local (`pg_class.relacl`, `pg_default_acl`, `information_schema.role_table_grants`, `pg_policies`), se rebusco DML directo/RPC en `src` y se comparo con migraciones `GRANT`/`REVOKE`. El resultado confirma que S.78/S.79/S.80 ya cubren el runbook, los escenarios y la plantilla de captura; no queda otro corte local documental util sin harness runtime o acceso real autorizado.

Cubierto localmente por S.81:

- P3/P4 stop del carril documental local: `Direct SQL grants` sigue en `parcial` y el siguiente paso valido es runtime autorizado o no hacer nada. Otro documento local sin nuevas capacidades reempaquetaria S.78/S.79/S.80.
- P3/P4 evidencia faltante para salir de `parcial`: PostgREST autenticado por rol antes/despues del draft, Server Actions con sesion/cookies reales, navegador/POST directo y denegaciones por rol, negativos cross-tenant por ID ajeno, comportamiento real de RPCs `SECURITY DEFINER`, entorno desechable/autorizado para aplicar/revertir S.77, default privileges separados por owner/operador y QA/staging real con project/ref o DB URL, URL, tenant/datos controlados, credenciales por rol y evidencia redacted.
- P3/P4 frontera de entornos: un harness local autenticado necesita usuarios/roles sinteticos, sesiones/cookies Supabase locales y datos A/B controlados; un entorno desechable autorizado puede aplicar S.77 solo con rollback/backup y comparacion antes/despues; staging/QA real exige acceso nuevo real y operador autorizado.
- P3/P4 no-matrix-update: S.81 no cambia evidencia ni estado de `docs/architecture/tenant-rls-negative-test-matrix.md`; la matriz sigue apuntando a S.78/S.79/S.80 y a runtime autorizado como siguiente paso.
- P3/P4 no-hardening: S.81 no crea SQL/snippet, no aplica S.77, no cambia grants reales, no toca default privileges, no crea `00044`, no toca `src` y no reduce `authenticated` a `SELECT`.

S.82 anade un vigesimocuarto corte local runtime minimo: `tests/smoke/tenant-direct-grants-centers-runtime.spec.ts`, acotado a PostgREST autenticado sobre `centers` con `owner` y `coach` locales. Antes de escribir se relee `.env.local` de forma redacted y se confirma capacidad local: 4 usuarios Auth confirmados, 4 memberships activas con roles esperados para `E2E_ORGANIZATION_ID`, centros del tenant activo y centros de otro tenant. El resultado no aplica hardening: crea solo harness de smoke, mantiene S.77 sin aplicar, no crea `00044`, no cambia grants/default privileges, no toca `src` y no declara `Direct SQL grants` cubierto.

Cubierto localmente por S.82:

- P3/P4 primer baseline runtime autenticado: `owner` puede seleccionar/insertar si falta y actualizar un centro de smoke tenant-scoped sin `permission denied for table centers`.
- P3/P4 negativo por rol: `coach` no puede insertar `centers` por DML directo autenticado y la denegacion no es una perdida de grant de tabla.
- P3/P4 negativo de ID ajeno app-like: un `centerId` de otro tenant combinado con `organization_id` del tenant activo devuelve 0 filas y no cambia la fila ajena, reflejando el patron de `src/app/(app)/app/centers/actions.ts`.
- P3/P4 frontera honesta: no se declara aislamiento RLS puro entre tenants si el mismo usuario tiene membership valida en ambos; no cubre las otras 13 tablas DML, Server Actions/cookies, navegador/POST directo, RPCs, runtime despues de S.77, entorno desechable ni staging.
- P3/P4 no-hardening: S.82 no crea SQL/snippet, no aplica S.77, no cambia grants reales, no toca default privileges, no crea `00044`, no toca `src` y no reduce `authenticated` a `SELECT`.

Bloqueado/no tocado tras S.13/S.14/S.15/S.16/S.17/S.18/S.19/S.20/S.21/S.22/S.23/S.24/S.25/S.26/S.27/S.28/S.29/S.30/S.31/S.32/S.33/S.34/S.35/S.36/S.37/S.38/S.39/S.40/S.41/S.42/S.43/S.44/S.45/S.46/S.47/S.48/S.49/S.50/S.51/S.52/S.53/S.54/S.55/S.56/S.57, la evaluacion bloqueada de S.58, los rollbacks acotados de S.59/S.60/S.61/S.62/S.63/S.64/S.65/S.66/S.67/S.68/S.69/S.70/S.71/S.72/S.73, el inventario de grants S.74, el analisis de impacto S.75, el readiness/post-revoke probe S.76, el draft no aplicado S.77, el runbook runtime S.78, el manifiesto de escenarios S.79, la plantilla de captura S.80, el cierre documental S.81 y el primer smoke runtime local S.82:

- No se prueba el callback completo con `code` valido porque exige intercambio real de Supabase Auth.
- No se prueba login, reset, forgot password, sign-out ni aceptacion de invitacion en runtime real con sesion/cookies Supabase, usuario real, email real, SMTP real, error real de Supabase Auth ni navegador.
- No se introduce allowlist cerrada para todas las rutas internas. El contrato actual de `getSafeRedirectPath(...)` permite paths internos y bloquea destinos externos/protocol-relative; cambiarlo a allowlist de rutas permitidas seria hardening de producto/Auth separado.
- Salvo el smoke runtime local acotado de S.82 para `centers`, no se anaden tests autenticados, Server Actions, Storage, SMTP, staging ni evidencia real; S.59/S.60/S.61/S.62/S.63/S.64/S.65/S.66/S.67/S.68/S.69/S.70/S.71/S.72/S.73 solo anaden SQL rollback local acotado a `centers`, `schedule_blocks` con referencias `centers`/`class_types`, `schedule_block_assignments` con referencias `schedule_blocks`/`coach_profiles`, `schedule_template_blocks` con referencias `schedule_templates`/`centers`/`class_types`/`coach_profiles`, `schedule_templates` con referencia opcional a `centers`, `class_types` como catalogo directo, `coach_profiles` con referencias `centers`/`person_profiles`/membership por `user_id`, `person_profiles` como perfil visible/persona operativa, `organization_memberships` como fuente directa de tenant/rol, `staff_work_windows` con referencias `person_profiles`/`centers`, `operational_events` con RPCs y referencia opcional a `centers`, metadata documental con `documents`, `document_versions`, `document_subjects`, `document_access_grants` y begin/cancel de version metadata, auditoria documental local con `document_access_events`/RPCs, auditoria de fichaje local con `time_audit_events`/triggers y lectura minima de `time_weekly_approvals`, y registros/punches canonicos de fichaje con lectura propia/gestion, aislamiento A/B y UPDATE/DELETE normal sin efecto. S.74 solo inventaria grants/default ACL y confirma TRUNCATE en rollback; S.75 solo clasifica impacto y simula revokes en rollback; S.76 solo prepara checklist/probes post-revoke en rollback; S.77 solo crea draft/verificador rollback; S.78 solo prepara runbook runtime; S.79 solo prepara manifiesto de escenarios runtime; S.80 solo prepara plantilla de captura redacted; S.82 solo prueba baseline PostgREST directo de `centers` antes del draft; no endurece grants reales.
- No se cubren POST directos ni rutas reales por rol futuro/especializado; si exigen credenciales, sesion Supabase o runtime autenticado quedan bloqueados para otro corte.
- No se exportan helpers internos de validacion solo para testear; los casos de S.15 son guardrails estaticos, no pruebas runtime de actions/RPC.
- No se valida F.15 real de fichaje, aprobacion con firma, CSV legal, Storage documental real, expiracion efectiva de signed URLs, rutas E.5 con sesion/archivo real, grants runtime, programacion documental con sesion real, auditoria backend real de archivo ni cumplimiento laboral/documental definitivo. S.71 cubre solo DB/RLS/RPC local de auditoria documental, S.72 cubre solo DB/RLS/trigger local de auditoria de fichaje y cierres semanales minimos, S.73 cubre solo DB/RLS local de `time_records`/`time_punches`, S.74 cubre solo postura de grants/direct TRUNCATE local, S.75 cubre solo analisis/simulacion rollback de impacto, S.76 cubre solo readiness/probes post-revoke rollback, S.77 cubre solo draft/verificador rollback, S.78 cubre solo runbook runtime futuro, S.79 cubre solo manifiesto de escenarios runtime futuro y S.80 cubre solo plantilla de captura redacted futura.
- No se prueba runtime real de `document_subjects` por Server Actions/UI ni sujetos de centro/coach/bloque/tipo; S.70 cubre solo sujeto `person` activo, `manage` denegado, grants no visibles y referencias cross-tenant por SQL rollback local.
- No se prueba runtime real de `activate_document_version_upload`, subida a Storage, path real en bucket, objeto controlado, expiracion efectiva de signed URLs, auditoria backend real por rutas E.5 ni denegaciones con sesion Supabase; S.70 cubre solo begin/cancel de metadata de version con rollback local y S.71 cubre solo auditoria documental local por RPC.
- No se prueba runtime real de avatar/firma propios: `begin_own_profile_avatar_upload`, `activate_own_profile_avatar_asset`, `cancel_own_profile_avatar_upload`, `begin_own_profile_signature_upload`, `activate_own_profile_signature`, `cancel_own_profile_signature_upload`, upload a Storage, path real, expiracion efectiva de signed URLs, objeto controlado, policies reales ni denegaciones con sesion Supabase.
- No se anade validacion de dimensiones de avatar ni se cambia metadata/schema: S.23 solo prueba dimensiones de firma porque `validateSignatureDataUrl(...)` ya las devuelve como contrato exportado.
- No se prueba runtime real de jornada prevista con sesion Supabase: Server Actions, POST directo, navegador, roles autenticados, auditoria persistida, persona interna/inactiva y centro inactivo quedan pendientes de harness autenticado o QA/staging. S.68 cubre solo DB/RLS directo de `staff_work_windows` frente a tenant A/B y referencias `person_profiles`/`centers`.
- No se prueba runtime real de perfil personal propio con sesion Supabase: persona ajena, persona de otro tenant, perfil inexistente, RLS, POST directo, roles autenticados y persistencia real quedan pendientes de harness autenticado o SQL rollback propio.
- No se prueba runtime real de eventos operativos con sesion Supabase: Server Actions, POST directo, navegador, formularios reales, auditoria persistida detallada y evidencia QA/staging quedan pendientes de harness autenticado o entorno real. S.69 cubre solo DB/RLS/RPC local de `operational_events` frente a tenant A/B, roles base y referencia `center_id`.
- No se prueba runtime real de solicitudes/cambios con sesion Supabase: asignacion ajena, target de otro coach, solicitud de otro tenant, apply no aprobado, coach ocupado, POST directo, RLS, roles autenticados, auditoria persistida y denegaciones reales quedan pendientes de harness autenticado, SQL rollback propio o QA/staging.
- No se prueba runtime real de fichaje con sesion Supabase: punch/correccion de persona ajena, persona de otro tenant, aprobacion semanal con firma propia real, firma ausente, firma ajena, POST directo, roles autenticados, auditoria persistida, automatico por planificacion ni exporte real quedan pendientes de harness autenticado o QA/staging. S.73 cubre solo RLS SQL local de `time_records`/`time_punches`, no Server Actions ni navegador.
- No se prueba runtime real de auditoria de fichaje por `/app/time`, Server Actions o navegador; S.72 cubre solo lectura propia/gestion sobre `time_audit_events`, denegacion cross-tenant y lectura minima de `time_weekly_approvals` por SQL rollback local. S.74 confirma la deuda de direct SQL TRUNCATE/grants en local, S.75 clasifica una candidata de hardening sin aplicarla, S.76 anade readiness/probes post-revoke rollback y S.77 prepara un draft no aplicado, pero siguen fuera POST directo, aprobacion/reapertura con firma propia real, automatico por planificacion, CSV descargable, hardening efectivo de grants y bloqueo efectivo de semana aprobada con datos persistidos de producto.
- No se prueba runtime real de auditoria operativa general: registro/listado por rol sobre `operational_audit_events`, denegacion cross-tenant, entidad ajena, RLS real, trazabilidad de cobertura con datos persistidos ni purga efectiva con scheduler/DB quedan pendientes de SQL rollback, harness autenticado o QA/staging.
- No se prueba runtime real de candidatos de posible exceso: lectura propia/revision sobre `overtime_candidates`, fuentes/eventos, persona ajena/cross-tenant, POST directo, RLS real, SQL rollback A/B, deteccion con datos persistidos ni estados terminales con sesion Supabase quedan pendientes de harness autenticado, SQL rollback propio o QA/staging.
- No se prueba runtime real de las superficies operativas base de administracion: equipo, tipos, horario, plantillas, cobertura, stats y settings con sesion Supabase, roles autenticados, POST directo, IDs cross-tenant, RLS real, SQL rollback A/B amplio ni evidencia staging. S.32 confirma contratos fuente prudentes de actions y S.33 confirma contratos fuente prudentes de paginas/listados. S.59/S.60/S.61/S.62/S.63/S.64/S.65/S.66/S.67/S.68/S.69 cubren solo SQL rollback local directo de `centers`, de `schedule_blocks` con referencias `centers`/`class_types`, de `schedule_block_assignments` con referencias `schedule_blocks`/`coach_profiles`, de `schedule_template_blocks` con referencias `schedule_templates`/`centers`/`class_types`/`coach_profiles`, de `schedule_templates` con referencia opcional a `centers`, de `class_types` como tabla de catalogo directa, de `coach_profiles` como ficha operativa directa, de `person_profiles` como perfil visible/persona operativa directa, de `organization_memberships` como fuente directa de rol/tenant, de `staff_work_windows` como jornada prevista directa y de `operational_events` por RPC/lectura directa, sin RPC de sincronizacion de defaults ni runtime de `/app/coaches`, `/app/account` o `/app/schedule`. S.70/S.71 quedan separados como rollbacks locales documentales, S.72 queda separado como rollback local de auditoria de fichaje y S.73 como rollback local de registros/punches de fichaje, no como runtime de `/app/time`.
- No se prueba runtime real de shell/navegacion con sesion Supabase, rol autenticado, direct URL a ruta oculta, redireccion efectiva, cambio real de organizacion activa ni evidencia staging. S.34 solo confirma contratos fuente prudentes de entry points.
- No se prueba runtime real de headers/cache con servidor local o despliegue, cookies Supabase, HTTPS, direct URLs autenticadas, expiracion efectiva de signed URLs, Storage real ni service worker en navegador. S.35 solo confirma contratos fuente prudentes de rutas protegidas y paths.
- No se prueba runtime real de clientes Supabase/Auth/Storage, Auth Admin, cookies, bundle de cliente, policies Storage, objetos reales, expiracion efectiva de signed URLs, DB URLs/SMTP reales ni secretos de entorno desplegado. S.41 solo confirma contratos fuente prudentes y allowlists locales.
- No se prueba runtime real de `OrganizationResolutionState` con sesion Supabase, usuario sin membership, usuario multi-membership, `organizationId` ajeno, redireccion efectiva, render de navegador, direct URL ni cambio real de tenant. S.36 solo confirma contratos fuente prudentes del componente y `basePath`.
- No se prueba runtime real de transiciones Auth, redireccion efectiva en navegador, cookies HTTPS, callback con `code`, reset con enlace valido, login con credenciales, forgot con SMTP ni sign-out con sesion. S.37 solo confirma contratos fuente prudentes de rutas/actions publicas Auth.
- No se prueba runtime real de `/invite/accept`, token valido, signup/login real, confirmacion Auth, acceptance con sesion Supabase, email coincidente/no coincidente, auditoria persistida ni redireccion efectiva. S.38 solo confirma contratos fuente prudentes de pagina/actions/RPCs de invitacion.
- No se prueba runtime real de creacion, reenvio o cancelacion de invitaciones, envio Resend/SMTP, rate limit efectivo, token valido, provider response real, Server Actions runtime, RLS real ni auditoria persistida. S.39 confirma contratos fuente prudentes de issuance/email/auditoria y S.40 endurece por fuente la minimizacion de errores de proveedor.
- No se prueba secreto real ni rotacion de secretos, ni configuracion real de entorno, ni escaneo externo, ni evidencia real. S.42 confirma solo higiene local de archivos trackeables y que `.env.local` sigue ignorado/no trackeado sin leer valores.
- No se prueba vulnerabilidad real de dependencias, licencias, provenance, firmas de paquetes, registry policy, npm audit externo, SCA externo ni aceptacion formal de riesgo de supply chain. S.43 confirma solo manifest/lockfile/scripts locales y no modifica dependencias.
- No se prueba contenido real de artefactos/evidencia, retencion definitiva, redaccion efectiva de evidencia externa ni limpieza de historicos fuera de los patrones cubiertos. S.44 confirma solo reglas de ignore y estado de nombres Git para artefactos generados/evidencia local esperable.
- No se prueba observabilidad/logging real, logs gestionados, alertas, redaccion efectiva de logs de entorno, error overlay de Next.js, navegador ni runtime real de errores. S.45 confirma solo ausencia de `console.*` en `src` y ausencia de serializacion cruda de errores en superficies visibles de app/componentes.
- No se prueba contenido renderizado en navegador, traducciones, CMS futuro, datos de tenant, copy generado en runtime ni claims fuera de `src/app`, `src/components` y `src/lib/navigation`. S.46 confirma solo higiene source/static de claims visibles locales y no sustituye revision legal/producto real.
- No se prueba almacenamiento real del navegador, datos persistidos previos, cookies HTTPS, bundle cliente, ausencia runtime de IndexedDB/CacheStorage/service worker ni limpieza local. S.47 confirma solo higiene source/static de almacenamiento browser en `src/app` y `src/components`.
- No se prueba egress real de navegador, apertura efectiva de pestanas, descarga efectiva por backend, red real, CSP/Permissions-Policy, bundle compilado ni contenido renderizado. S.48 confirma solo higiene source/static de APIs de egress y enlaces visibles en `src/app` y `src/components`.
- No se prueba submit real de formularios, runtime de Server Actions, route handlers reales, POST directo, CSRF/cookies reales, bundle cliente, RLS de mutaciones, hidden inputs generados en runtime ni evidencia de navegador. S.49 confirma solo higiene source/static de destinos `action`/`formAction` y markup de formularios en `src/app` y `src/components`.
- No se prueba selector real de archivo, multipart/FormData runtime, MIME real de navegador, upload real de avatar/firma, policies Storage, objeto Storage, signed URL real, ni ausencia runtime de controles generados por datos externos. S.50 confirma solo higiene source/static de inputs de archivo/subida visible en `src/app` y `src/components`.
- No se prueba descarga efectiva, apertura real de preview/download, cabeceras runtime, `Content-Disposition` efectivo, Auth/RLS por rol, auditoria persistida, CSV descargado, objeto Storage real, expiracion efectiva de signed URLs, CSP ni evidencia de navegador. S.51 confirma solo higiene source/static de entry points visibles y rutas backend asociadas.
- No se prueba navegacion real, render en navegador, query params generados por datos runtime, hidden inputs generados por componentes cliente, direct URLs con sesion, redirects efectivos, bundle cliente ni comportamiento real de `history.pushState`. S.52 confirma solo higiene source/static de nombres de query en rutas protegidas visibles y formularios GET internos no exportables.
- No se prueba submit real de acciones terminales, Server Actions runtime, POST directo, CSRF/cookies reales, roles autenticados, RLS de mutaciones, IDs cross-tenant reales, auditoria persistida, bundle cliente, navegador ni evidencia externa. S.53 confirma solo higiene source/static de acciones terminales visibles y conserva patrones existentes de confirmacion/nota sin imponer una regla global nueva.
- No se prueba runtime real de estados no accionables, clicks/controles en navegador, datos generados por tenant, bypass por POST directo, Server Actions runtime, RLS, roles autenticados, IDs cross-tenant, auditoria persistida ni evidencia externa. S.54 confirma solo contratos fuente locales en ausencias, solicitudes/cambios, plantillas, eventos, candidatos de posible exceso y asignacion nueva en bloques cancelados/completados.
- No se prueba runtime real de exposicion visible de identificadores, DOM real, valores de `select`/`option`, hidden inputs, emails privados generados por datos reales, contenido renderizado con datos de tenant, bundle cliente, navegador ni evidencia externa. S.55 confirma solo higiene source/static de fallbacks cortos y ausencia de internals tecnicos en texto renderizable protegido.
- No se prueba runtime real de exposicion visible de emails privados, DOM real, valores generados por datos reales, contenido renderizado con datos de tenant, invitaciones reales, SMTP, bundle cliente, navegador ni evidencia externa. S.56 confirma solo higiene source/static de contacto personal visible en superficies protegidas actuales.
- No se prueba runtime real de higiene de notas/campos libres visibles, DOM real, valores generados por datos de tenant, contenido renderizado, bypass por POST directo, validadores runtime, Server Actions, RLS, roles autenticados, SQL rollback, navegador ni evidencia externa. S.57 confirma solo higiene source/static de labels/placeholders/ayuda cercana en campos `notes` y `reasonSummary` protegidos actuales.
- No se anade otro guard local visible en S.58: el bloqueo confirma que no queda un P2 helper-only/source-static visible util, local, no fragil y no repetitivo. S.59/S.60/S.61/S.62/S.63/S.64/S.65/S.66/S.67/S.68/S.69/S.70/S.71/S.72/S.73 salen de ese carril con SQL rollback local, S.74 sale como inventario SQL rollback de grants, S.75 como analisis/simulacion rollback de impacto, S.76 como readiness/probes post-revoke rollback y S.77 como draft/verificador rollback no aplicado; no cambian los bloqueos de navegador, Storage/SMTP real, staging o reglas globales nuevas.

No cubierto por S.12/S.13/S.14/S.15/S.16/S.17/S.18/S.19/S.20/S.21/S.22/S.23/S.24/S.25/S.26/S.27/S.28/S.29/S.30/S.31/S.32/S.33/S.34/S.35/S.36/S.37/S.38/S.39/S.40/S.41/S.42/S.43/S.44/S.45/S.46/S.47/S.48/S.49/S.50/S.51/S.52/S.53/S.54/S.55/S.56/S.57, ni desbloqueado por S.58/S.59/S.60/S.61/S.62/S.63/S.64/S.65/S.66/S.67/S.68/S.69/S.70/S.71/S.72/S.73/S.74/S.75/S.76/S.77:

- Integration local con sesion Supabase, Server Actions, SQL rollback A/B amplio, smokes autenticados por rol, Storage real, signed URLs, SMTP/Auth real ni QA/staging.
- IDs cross-tenant en superficies operativas fuera de `centers`, fuera del corte acotado de `organization_memberships` directo, fuera del corte acotado de `class_types`, fuera del corte acotado de `coach_profiles` directo, fuera del corte acotado de `person_profiles` directo, fuera del corte acotado de `staff_work_windows` directo con referencias `person_profiles`/`centers`, fuera del corte acotado de `operational_events` con RPCs y referencia a `centers`, fuera del corte acotado de `schedule_blocks` -> `centers`/`class_types`, fuera del corte acotado de `schedule_block_assignments` -> `schedule_blocks`/`coach_profiles`, fuera del corte acotado de `schedule_template_blocks` -> `schedule_templates`/`centers`/`class_types`/`coach_profiles`, fuera del corte acotado de `schedule_templates` -> `centers` y fuera del corte acotado de `time_records`/`time_punches` de S.73; Server Actions/runtime de equipo/coaches, `/app/account`, `/app/schedule`, `/app/time` e invitaciones; RPC/runtime de `class_types` con sincronizacion de defaults; aplicacion runtime de plantillas a semanas reales; coach inactivo en asignaciones o como coach por defecto; solicitudes/cambios con POST directo/RLS/roles reales, fichaje con POST directo/roles reales fuera de auditoria/cierre minimo S.72 y registros/punches SQL S.73, eventos operativos con POST directo/Server Actions/navegador/auditoria real, perfil personal propio runtime con persona ajena/cross-tenant, jornada prevista con persona interna/inactiva, centro inactivo y auditoria persistida, documentos/grants/versiones por Server Actions/navegador/Storage real fuera del rollback metadata S.70, avatar/firma runtime con Storage real, rutas preview/download permitidas/denegadas con sesion y objeto real, auditoria documental por rutas E.5/Server Actions/navegador/Storage real fuera del rollback audit S.71, callback Auth con `code` real y expiracion efectiva de signed URLs. Siguen en P2/P3/P4 o staging-only segun la tabla.
- Validacion runtime de metadata/snapshots, auditoria operativa general, trazabilidad de cobertura con filas reales, purga real de eventos expirados, candidatos de posible exceso con filas reales, `reason_summary`, limites de CSV, aprobaciones semanales con firma real, bloqueo real de semana aprobada o firma propia real mediante helpers privados/Server Actions/RPC. Si exige exportar helpers, credenciales, SQL rollback o datos A/B, queda para task propia.
- Validacion real de headers/cache en servidor, ausencia de service worker/CacheStorage desde navegador, cookies HTTPS y comportamiento efectivo de rutas directas autenticadas o anonimas sigue fuera de S.35.
- Validacion real de clientes Supabase/Auth/Storage en entorno desplegado, bundle de cliente, cookies HTTPS, Auth Admin/servicios privilegiados externos, DB URLs/SMTP reales, policies Storage, objeto `document-files` controlado y expiracion efectiva de signed URLs sigue fuera de S.41.
- Validacion real o externa de secretos, rotacion, entorno desplegado, proveedores, dashboards, credenciales E2E, cookies, signed URLs reales y evidencia redacted sigue fuera de S.42.
- Validacion real de estados de resolucion de organizacion en UI/navegador con sesion autenticada, dos memberships, usuario sin membership, tenant ajeno, redirect efectivo y datos persistidos sigue fuera de S.36.
- Validacion real de login, callback, forgot/reset password, sign-out, Auth cookies, SMTP real, Redirect URLs reales y errores de Supabase Auth sigue fuera de S.37.
- Validacion real de invitacion, creacion/reenvio/cancelacion, signup/login, token valido, callback de confirmacion, aceptacion con sesion Supabase, email coincidente/no coincidente, SMTP/Resend real, respuesta real de proveedor, auditoria persistida y redireccion efectiva sigue fuera de S.38/S.39/S.40.
- Validacion real de vulnerabilidades conocidas, licencias, provenance, integridad de registry, firmas de paquetes, politicas de update/renovate/dependabot, lockfile en CI, SCA externo y aceptaciones formales de riesgo sigue fuera de S.43.
- Validacion real de evidencia externa, redaccion manual, retencion legal/operativa, artefactos historicos fuera de los patrones cubiertos y limpieza de archivos locales sensibles sigue fuera de S.44.
- Validacion real de observabilidad, logs gestionados, redaccion de errores en runtime, error overlay/browser, alertas, retencion de logs y sanitizacion de `throw new Error(... error.message ...)` server-side sigue fuera de S.45.
- Validacion real de copy/render en navegador, contenidos externos o futuros, revision legal/producto y aceptacion de claims comerciales sigue fuera de S.46.
- Validacion real de almacenamiento browser, cookies HTTPS, IndexedDB/StorageManager efectivos, bundle cliente, navegacion real, ausencia runtime de datos tenant-scoped en storage y limpieza de datos locales queda fuera de S.47.
- Validacion real de egress/browser, downloads efectivos, apertura de nuevas pestanas, fetch/runtime network, CSP/Permissions-Policy, bundle cliente y ausencia runtime de exfiltracion de datos tenant-scoped queda fuera de S.48.
- Validacion real de formularios, Server Actions, route handlers, POST directo, RLS de mutaciones, CSRF/cookies, hidden inputs de runtime, tokens legitimos de invitacion, data URL de firma propia y evidencia de navegador queda fuera de S.49.
- Validacion real de inputs de archivo, accept/MIME efectivo en navegador, subida de avatar/firma contra Storage, objeto `document-files`, ausencia de subida documental generada en runtime, RLS/policies y evidencia de navegador queda fuera de S.50.
- Validacion real de respuestas descargables/exportes visibles, cabeceras efectivas, descarga de CSV, apertura E.5 permitida/denegada con objeto real, auditoria backend persistida, signed URL TTL, cookies HTTPS, RLS por rol y evidencia redacted queda fuera de S.51.
- Validacion real de query params/rutas visibles en navegador, navegacion `RouteStateLink`/`RouteStateButton`, redirects de Server Actions, estado generado por datos runtime, direct URLs autenticadas, bundle cliente, CSP/Referrer-Policy y ausencia runtime de parametros sensibles queda fuera de S.52.
- Validacion real de acciones terminales visibles, clicks/confirmaciones en navegador, Server Actions runtime, roles autenticados, POST directo, RLS de mutaciones, IDs cross-tenant, auditoria persistida y evidencia redacted queda fuera de S.53.
- Validacion real de estados visibles no accionables, controles ausentes/bloqueados en navegador, reaperturas explicitas, bypass por POST directo, Server Actions runtime, RLS de mutaciones, roles autenticados, IDs cross-tenant, datos persistidos y evidencia redacted queda fuera de S.54.
- Validacion real de exposicion visible de identificadores/datos tecnicos en navegador, valores runtime generados por datos reales, DOM, bundle cliente, emails privados reales, signed URLs efectivas y evidencia redacted queda fuera de S.55.
- Validacion real de exposicion visible de emails privados/contacto personal en navegador, valores runtime generados por datos reales, invitaciones reales, SMTP/Resend real, DOM, bundle cliente y evidencia redacted queda fuera de S.56.
- Validacion real de higiene de notas/campos libres visibles en navegador, valores runtime generados por datos reales, DOM, bundle cliente, Server Actions/validadores runtime, POST directo, RLS, roles autenticados y evidencia redacted queda fuera de S.57.
- S.58 no se ejecuta como smoke nuevo porque no aporta cobertura local honesta adicional sin repetir S.42-S.57 o sin exigir los gates reales bloqueados.
- S.8/A.1, B.4, OD.1/I.32 y F.15 siguen bloqueados por falta de acceso real/staging, URL QA/staging, project/ref o DB URL, credenciales E2E por rol, tenant/datos controlados, SMTP real y evidencia redacted.

## Tipos De Test

| Tipo | Uso recomendado | Nota prudente |
|---|---|---|
| `unit/helper` | Helpers puros como `resolveActiveOrganization(...)`, permisos por rol, validadores de formularios y filtros de metadata sensible. | El repo no tiene script unitario separado; si introducir runner es demasiado amplio, empezar con smoke estatico Playwright o crear task tecnica acotada de harness. |
| `smoke Playwright` | Rutas anonimas/autenticadas, visibilidad por rol, direct URLs y guardrails de source cuando no conviene mutar datos. | Debe seguir el patron `tests/smoke/*`, con credenciales opcionales y skips cuando falten env vars. |
| `SQL rollback` | RLS/RPC/FKs con fixtures sinteticas A/B dentro de `BEGIN`/`ROLLBACK`. | No persistir seeds, no usar datos reales, no imprimir secretos ni signed URLs. |
| `integration local` | Server Actions/helpers contra Supabase local cuando el arnes ya permita sesion y datos sinteticos controlados. | Evitar si fuerza cambios de producto o requiere `service_role` en `src`. |
| `staging-only` | Auth/SMTP reales, cookies HTTPS, Storage real, objetos `document-files`, signed URL TTL, evidencia redacted. | No reintentar sin acceso nuevo concreto y casos QA/staging preparados fuera del repo. |

## Fixtures Base Recomendadas

Crear, en una task posterior, una fixture sintetica reutilizable dentro de SQL rollback o setup local controlado:

- Tenant A y tenant B genericos, sin datos reales ni nombres del primer tenant.
- Usuarios sinteticos: `owner-a`, `admin-a`, `manager-a`, `coach-a`, `coach-b`, `no-membership`, `multi-membership`.
- Memberships activas por rol base en tenant A y, como minimo, `owner-b`/`coach-b` en tenant B.
- `person_profiles` y `coach_profiles` activos para coaches A/B, mas una persona/coach inactivo.
- `centers` A/B, `class_types` A/B y un centro/tipo inactivo si el caso lo necesita.
- `schedule_blocks` A/B: activo, cancelado, completado y uno solapado para disponibilidad de coach.
- `schedule_block_assignments` A/B con estados `assigned`, `pending` y `removed`.
- `staff_work_windows` A/B con franjas activas e inactivas, persona y centro opcional.
- `operational_events` A/B con eventos activos visibles, `management`, cancelados/archivados y centro opcional.
- Plantilla A/B con bloque de plantilla y coach por defecto opcional.
- Documentos sinteticos solo metadata/grants/auditoria para casos locales; archivo Storage real solo en staging-only.

## Primer Paquete Minimo

| Prioridad | Superficie | Caso negativo | Tipo de test recomendado | Fixtures/datos necesarios | Entorno requerido | Bloqueo si aplica | Riesgos de tocar producto | Orden |
|---|---|---|---|---|---|---|---|---|
| P0 | Guardrail de suite | Confirmar que los tests nuevos no usan datos reales, no hardcodean tenant, no usan `service_role` y no abren exclusiones prohibidas. | smoke Playwright | Lectura de `src`, `tests`, `supabase/snippets` y docs relevantes. | local | Ninguno. | Bajo si es source guard; medio si se convierte en regla fragil sobre strings. | 0 |
| P1 | Auth/session/tenant resolution | Usuario autenticado sin memberships activas obtiene `no_active_memberships`, sin fallback a otro tenant. | unit/helper; despues integration local | Array de memberships vacio para helper; usuario sintetico `no-membership` si se prueba contra Supabase local. | local; Supabase local para integration | Sin arnes local de sesion, dejar en unit/helper. | Bajo si solo testea helper; medio si obliga a crear login local. | 1 |
| P1 | Auth/session/tenant resolution | Usuario con varias memberships activas sin `organizationId` obtiene `organization_required`, sin elegir tenant implicitamente. | unit/helper; smoke Playwright si hay credenciales | `multi-membership` con tenant A/B activos. | local; Supabase local | Smoke autenticado bloqueado si no hay credenciales locales por usuario. | Bajo en helper; medio si se altera UX de selector de organizacion. | 2 |
| P1 | Auth/session/tenant resolution | Usuario tenant A pasa `organizationId` de tenant B. | unit/helper; integration local | `owner-a` o `coach-a` y `organization_id` de tenant B. | local; Supabase local | Requiere sesion local para probar ruta real. | Bajo si helper; medio si se toca resolucion compartida. | 3 |
| P1 | Auth/session/reset | `next` externo o ruta no permitida en callback/reset intenta open redirect. | smoke Playwright | Request anonima a callback/reset con `next=https://example.test` y ruta interna no permitida. | local | Puede requerir adaptar el caso si Supabase callback necesita `code` valido. | Bajo; no tocar flujo Auth salvo bug real. | 4 |
| P2 | Roles base | `coach` intenta crear/editar centros, equipo, tipos, horario, plantillas o cobertura bulk. | smoke Playwright; integration local donde exista arnes | `coach-a`, entidades tenant A y forms/rutas de accion controladas. | Supabase local; QA/staging para repeticion real | Credenciales E2E por rol siguen bloqueadas en real/staging. | Medio: los tests de POST directo pueden acoplarse a Server Actions. Preferir ruta/UI primero. | 5 |
| P2 | Roles base | `manager` intenta gestionar settings globales, roles/memberships o accesos. | smoke Playwright; integration local; SQL rollback acotado para memberships | `manager-a`, `owner-a/admin-a`, membership objetivo tenant A. | Supabase local | S.67 cubre DB/RLS directo de `organization_memberships`: manager lee memberships del tenant pero no crea ni eleva rol/cambia estado; settings globales, Server Actions runtime y smokes autenticados siguen pendientes. | Medio si se automatizan mutaciones; bajo si verifica estado `forbidden`/ausencia de accion. | 6 |
| P2 | Roles base | `owner`/`admin` intentan saltar tenant boundary por rol alto. | SQL rollback; integration local | `owner-a/admin-a`, entidades tenant B. | Supabase local | Ninguno local si se usa rollback. | Bajo en SQL; medio si se toca helper para exponer errores. | 7 |
| P2 | Roles base | `owner/admin/manager/coach` mantienen capacidades esperadas sin activar roles futuros. | unit/helper; smoke Playwright | Casos directos sobre `permissions.ts`; rutas principales con cada rol si hay credenciales. | local; Supabase local para smoke autenticado | Roles futuros no deben activarse para beta. | Bajo en helper; medio si se testea navegacion por copy visible fragil. | 8 |
| P3 | Centros/equipo/tipos | Tenant A usa `user_id`, `person_profile_id`, `coach_profile_id`, `center_id` o `class_type_id` de tenant B. | SQL rollback; integration local | Fixture A/B completa de equipo, centro y tipo. | Supabase local | S.67 cubre DB/RLS directo de `organization_memberships` como fuente de rol/tenant; S.64 cubre DB/RLS directo de `class_types`; S.65 cubre DB/RLS directo de `coach_profiles` frente a `user_id`, `person_profile_id` y `primary_center_id`; S.66 cubre DB/RLS directo de `person_profiles` frente a `user_id`, lectura interna/visible y cambio de `organization_id`; equipo/invitaciones, Server Actions, `/app/account` runtime y RPC de sincronizacion siguen pendientes. | Medio si se intenta cubrir por UI; preferir SQL/RPC primero. | 9 |
| P3 | Horario/bloques | Crear/editar bloque tenant A con `center_id` o `class_type_id` de tenant B. | SQL rollback; integration local | `center-b`, `class-type-b`, `manager-a/admin-a`, semana sintetica. | Supabase local | Ninguno local. | Bajo en SQL; medio si se acopla al shape de Server Actions. | 10 |
| P3 | Horario/asignaciones | Probar coach inactivo y repetir, si hay harness, los casos cross-tenant/solape por Server Actions o runtime autenticado. | SQL rollback solo si aplica a DB; smoke Playwright para caso visible; integration local si existe arnes | `coach-a-inactive`, bloques solapados A, asignaciones A/B ya cubiertas por S.61 para DB/FK/RLS. | Supabase local | Coach inactivo requiere validacion de producto/runtime; repeticion staging bloqueada por OD.1/S.8. | Bajo en SQL existente; medio si se acopla a Server Actions. No relajar el guardrail DB de solape. | 11 |
| P3 | Jornada prevista | Crear/editar/desactivar `staff_work_windows` tenant A, leer activas como miembro, y rechazar tenant B, cambio de `organization_id`, `person_profile_id` B o `center_id` B. | SQL rollback; integration/runtime solo si se validan Server Actions | Personas/centros A/B, `owner/admin/manager/coach/staff`, franja activa e inactiva. | Supabase local para SQL; harness/QA si se valida runtime | S.68 cubre DB/RLS local directo de `staff_work_windows`; persona interna/inactiva, centro inactivo, auditoria y Server Actions runtime siguen fuera. | Bajo en SQL; medio si se acopla a `/app/schedule` o reglas producto de persona/centro activo. | 12 |
| P3 | Eventos operativos | Crear/actualizar/cancelar/archivar `operational_events` tenant A por RPC, leer solo eventos activos visibles como `coach`, rechazar tenant B, cambio de `organization_id`, escritura directa y `center_id` B. | SQL rollback; integration/runtime solo si se validan Server Actions | Centros A/B, eventos A/B activos visibles, `management`, cancelados y roles `owner/admin/manager/coach/staff`. | Supabase local para SQL; harness/QA si se valida runtime | S.69 cubre DB/RLS/RPC local de `operational_events`; POST directo, navegador, auditoria persistida detallada y Server Actions runtime siguen fuera. | Bajo en SQL/RPC; medio si se acopla a `/app/schedule` o copy visual de eventos. | 12b |
| P3 | Plantillas | Crear/editar cabecera de plantilla tenant A con `center_id` de tenant B y crear/editar bloque de plantilla tenant A con `template_id`, centro, tipo o coach por defecto de tenant B; aplicar plantilla a una semana queda como runtime aparte. | SQL rollback para plantilla/bloque de plantilla; integration/runtime solo si se valida aplicacion | Plantilla A/B, bloque plantilla A/B, centros/tipos/coaches B. | Supabase local para SQL; harness/QA si se valida aplicacion | S.63 cubre DB/FK/RLS local de `schedule_templates` con `center_id`; S.62 cubre DB/FK/RLS local de `schedule_template_blocks`; aplicacion runtime sigue fuera sin harness. | Bajo en SQL; medio si se acopla a helpers de aplicacion de plantillas. | 13 |
| P3 | Cobertura | Resolver bulk con bloques de tenant B, cancelados o completados. | smoke Playwright; integration local | Bloques A/B, bloque cancelado/completado, `manager-a`. | Supabase local | Credenciales por rol bloqueadas en real/staging. | Medio: accion bulk puede mutar datos; usar fixture rollback o local desechable. | 14 |
| P4 | Documentos/grants metadata | Usuario sin grant, solo metadata, preview grant, download grant, sujeto `person` y rol alto operativo sin grant ven solo lo autorizado. | SQL rollback | S.70 cubre metadata documental A/B con `documents`, `document_versions`, `document_subjects`, `document_access_grants` y begin/cancel de version metadata. | Supabase local | S.70 no valida Storage real, `activate_document_version_upload(...)`, rutas E.5, signed URLs efectivas ni auditoria backend real de archivo. | Bajo si mantiene rollback; no abrir grants UI ni subida. | 15 |
| P4 | Documentos/programacion | Coach asignado a bloque sin grant documental no recibe programacion por asignacion. | SQL rollback | Documento/version/link/bloque/asignacion A y usuario sin grant. | Supabase local | Ninguno local. | Bajo; no convertir horario en permiso documental. | 16 |
| P4 | Auditoria documental | Registrar eventos `allowed` solo con acceso/capacidad suficiente, registrar `denied` acotados sin conceder acceso, rechazar metadata insegura, negar lectura a `owner/admin/manager`, permitir lectura a `document_admin` no payroll y `payroll_manager` payroll, bloquear cross-tenant y escritura directa. | SQL rollback | S.71 cubre `document_access_events`, `record_document_access_event(...)`, `list_document_access_events_for_document(...)`, `can_read_document_access_events(...)`, metadata safe, roles A/B y escritura directa bloqueada. | Supabase local | S.71 no valida Storage real, rutas E.5, signed URLs efectivas, auditoria backend real de archivo, navegador, Server Actions ni staging. | Bajo si mantiene rollback; no abrir audit UI, grants UI ni subida. | 17 |
| P4 | Rutas preview/download | Usuario sin preview/download fuerza URL E.5 con IDs validos del mismo tenant. | integration local; staging-only para allowed redirect real | Documento/version/grants y, para allowed, archivo controlado en `document-files`. | Supabase local para denial; QA/staging para archivo real | Allowed preview/download y auditoria real bloqueados por falta de Storage/acceso. S.71 solo cubre RPC de auditoria local. | Medio: evitar guardar signed URLs o paths reales en evidencia. | 18 |
| P4 | Storage privado | Path adivinado, bucket publico, signed URL vencida o objeto `document-files` real. | staging-only | Proyecto real/staging, bucket privado, objeto sintetico no sensible, usuarios por grant. | QA/staging | Bloqueado hasta E.16/S.8 con project/ref, DB URL, credenciales y objeto controlado. | Alto si se hace sin operador autorizado; no persistir evidencia sensible. | 19 |

## Orden Recomendado De Implementacion

1. Abrir una task tecnica solo de tests negativos, sin producto, migraciones ni seeds persistentes.
2. Empezar por `unit/helper` o smoke estatico de bajo riesgo: `resolveActiveOrganization(...)`, `permissions.ts`, validadores de IDs/inputs y exclusiones de source.
3. Crear un snippet SQL rollback unico para la fixture A/B base y los casos cross-tenant de RLS/RPC operativos.
4. Anadir smokes Playwright autenticados por rol solo con env vars opcionales y skip claro cuando falten credenciales.
5. Cubrir Server Actions mediante integration local solo si el arnes ya existe o se puede crear sin tocar producto. Si no, dejarlo en SQL rollback + smoke de ruta.
6. Separar documentos en dos fases: metadata/grants local con rollback primero; Storage real, signed URLs, TTL y auditoria backend real despues, como staging-only.
7. No conectar estos tests a CI hasta que Supabase local tenga ciclo estable y no requiera datos reales ni secretos.
8. Repetir en QA/staging solo cuando S.8/A.1 y B.4 aporten URL, project/ref o DB URL, tenant QA/staging, credenciales por rol, datos controlados, SMTP y evidencia redacted.

## Criterio De Salida Del Primer Paquete

- Tests de helper o source guard no modifican `src` salvo que descubran un bug real que se abra como task separada.
- SQL rollback crea y limpia todos los datos sinteticos en una transaccion.
- No hay seeds nuevos con datos reales ni fixture persistente.
- Los smokes autenticados saltan con mensaje claro si faltan credenciales.
- `owner`, `admin`, `manager` y `coach` quedan representados como roles base; roles futuros solo aparecen como denegaciones o no-aplica.
- Los casos cross-tenant fallan cerrado: vacio, `forbidden`, `organization_not_found`, `not-actionable` o error RLS/RPC equivalente.
- Documentos/Storage no prometen validacion real hasta tener entorno y objeto controlado.
- El cierre no declara beta lista, produccion lista, ASVS conforme, pentest ni cumplimiento legal definitivo.

## Bloqueos Que No Deben Reintentarse Sin Acceso Nuevo

- Auth/SMTP real, Site URL, Redirect URLs, cookies HTTPS y reset/invitacion reales.
- Credenciales E2E por `owner`, `admin`, `manager` y `coach` en QA/staging.
- Tenant QA/staging con datos operativos controlados y evidencia redacted.
- Bucket `document-files` real, archivo sintetico controlado, policies Storage verificadas y signed URL TTL.
- Validacion real de F.15 si fichaje entra en beta.
- Cualquier uso de datos reales, secretos, cookies, signed URLs, rutas Storage activas o contenido documental dentro del repo.
