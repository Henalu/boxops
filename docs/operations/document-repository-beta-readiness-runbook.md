# Document Repository Beta Readiness Runbook - BoxOps

Estado 2026-05-21. Este runbook documenta E.11: primer repositorio documental visible minimo para beta interna, E.12: validacion QA/staging controlada de esa superficie, E.13: cierre de evidencia QA/staging sin inventar resultados cuando falta acceso real, E.14: reintento prudente de validacion QA/staging real con archivo Storage controlado, E.15: desbloqueo controlado de esa validacion real condicionado a acceso, casos QA y objeto `document-files` controlado, E.16: handoff operativo redacted para que un operador con acceso real pueda desbloquear QA/staging sin inventar evidencia, E.17: validacion real QA/staging asistida desde este entorno cerrada como bloqueada por falta de acceso real, E.18: reintento prudente minimo que confirma CLI via `npx` sin proyectos/acceso y mantiene QA/staging bloqueado, y E.19: primer adjunto minimo desde `/app/documents`.

E.11 abre una superficie de lectura prudente en `/app/documents`. E.19 anade un adjunto minimo para roles autorizados: crea metadata `company` o `programming`, sube una primera version por RPC/Storage privado y mantiene preview/descarga por backend. No convierte BoxOps en gestor documental completo, no crea documentos firmables, no gestiona grants desde UI, no muestra auditoria documental y no promete cumplimiento legal documental definitivo.

E.12 no abre producto nuevo. Prepara una validacion repetible con datos sinteticos/controlados para comprobar grants, solo metadata, usuario sin grant, cross-tenant, exclusiones de `sensitive_hr`, `payroll`, `signature_evidence` y `requires_signature`, preview/download por E.5 cuando exista archivo controlado, y evidencia minima para decidir si la superficie puede entrar en beta interna.

E.13 cierra la evidencia disponible: ejecuta o deja preparado E.12 segun el acceso real disponible, registra bloqueos concretos de QA/staging y deja una plantilla redacted para repetir el cierre sin guardar datos reales ni signed URLs en el repo.

E.14 no abre producto nuevo. Reintenta detectar acceso real desde el entorno actual, exige archivo controlado en bucket privado `document-files` para validar rutas E.5 y auditoria real, y si falta acceso deja el bloqueo exacto documentado sin inventar evidencia.

E.15 tampoco abre producto nuevo. Relee el entorno sin imprimir secretos, confirma si existe acceso real QA/staging y, si no existe, actualiza el bloqueo exacto. El objetivo es poder ejecutar la validacion real solo cuando haya project/ref redacted o DB URL gestionada fuera del repo, tenant QA/staging, casos redacted, documentos sinteticos no sensibles y un archivo controlado en `document-files`.

E.16 no abre producto nuevo. Convierte el bloqueo repetido en un handoff operativo controlado: lista capacidades necesarias sin valores, casos QA requeridos, checklist de operador, evidencia esperada y criterios de pass/bloqueado. Si el entorno sigue sin acceso real, el resultado correcto sigue siendo `bloqueado por acceso/entorno`.

E.17 no abre producto nuevo. Reintenta la validacion asistida solo si existe acceso real; al no existir token/ref/DB URL/CLI autenticada, URL QA/staging, tenant/casos documentales ni archivo controlado, reejecuta el SQL local con `ROLLBACK` y mantiene QA/staging como `bloqueado por acceso/entorno`.

E.18 no abre producto nuevo. Relee el entorno sin secretos, confirma que no hay acceso real completo a QA/staging, detecta solo CLI via `npx` sin proyectos/acceso autenticado, reejecuta el SQL local con `ROLLBACK` y mantiene QA/staging como `bloqueado por acceso/entorno`.

E.19 abre solo el primer adjunto seguro desde la app. La pantalla no permite elegir tenant alternativo ni persona/sujeto; el servidor resuelve organizacion y usuario desde sesion/membership, valida permiso con `can_manage_document_metadata(...)`, crea el documento como `draft`, prepara version `pending` con `begin_document_version_upload`, sube al bucket privado usando el path exacto devuelto por la RPC, publica metadata y activa con `activate_document_version_upload`.

E.23-E.29 cierran el flujo local cross-tenant del repositorio documental despues del primer adjunto: el smoke runtime opt-in valida rutas backend E.5 contra un actor de otro tenant, E.25 deja un procedimiento local-only reversible para crear ese actor temporal, E.27/E.28 fuerzan credenciales process-only explicitas, y E.29 deja esta instruccion operativa protegida por smoke estatico.

## Objetivo

Permitir que un usuario autenticado consulte las versiones documentales que ya puede ver por permisos reales:

- sujeto/persona propia cuando el modelo lo autoriza;
- grants explicitos de `document_access_grants`;
- capacidades documentales ya existentes;
- roles solo cuando `can_access_document` o `can_manage_document_metadata` lo permiten;
- preview y descarga solo mediante rutas backend E.5.

La beta interna puede validar el repositorio y el adjunto minimo con archivos sinteticos no sensibles. No puede usarlo para contratos reales, nominas, firma documental, payroll, IA, subida masiva ni cumplimiento legal definitivo.

## Fuentes Revisadas

- `PROJECT_BRIEF.md`
- `TASKS.md`
- `docs/product/roadmap.md`
- `docs/product/webapp-completion-roadmap.md`
- `docs/architecture/security-baseline.md`
- `docs/architecture/personal-data-permissions.md`
- `docs/operations/legal-and-privacy-notes.md`
- `docs/product/ux-principles.md`
- `docs/operations/document-programming-manual-validation-runbook.md`
- `supabase/snippets/document-repository-beta-qa-verification.sql`
- rutas backend E.5 de preview/descarga documental
- `document_programming_links` y QA E.9/E.10

## Estado De La Superficie

| Elemento | Estado E.11/E.19 |
|---|---|
| Ruta visible | `/app/documents`, protegida bajo `/app`. |
| Entrada secundaria | `/app/more` y navegacion secundaria personal. No entra como item principal mobile. |
| Lectura | `list_accessible_document_versions(...)` filtra por tenant y `can_access_document(..., 'read_metadata')`. |
| Acciones de archivo | Solo botones de preview/descarga si `can_preview` o `can_download` vienen autorizados. |
| Archivo privado | La UI llama a `/app/documents/[documentId]/versions/[documentVersionId]/preview` o `/download`. |
| Signed URLs | La UI no construye, guarda ni presenta signed URLs; solo invoca rutas backend E.5, que validan acceso antes de emitir URLs cortas. |
| Sensibles/payroll/evidencias | Excluye `sensitive_hr`, `payroll` y `signature_evidence` en este corte. |
| Firmables | Excluye documentos con `requires_signature = true`; E.2 ya mantiene ese campo bloqueado en false. |
| Subida | E.19 permite crear metadata minima y subir una primera version `company` o `programming` para roles autorizados. No hay reemplazo de versiones existentes, subida masiva ni gestor documental completo. |
| Grants UI | No hay gestion visible de grants. Los grants se preparan fuera de esta pantalla. |
| Auditoria visible | No hay pantalla de auditoria documental. Preview/descarga siguen auditadas por E.5/E.4. |
| IA | No hay IA, embeddings, RAG, vector DB, prompts, jobs ni resumen automatico. |

## Validacion E.12 QA/Staging

Objetivo: validar que `/app/documents` funciona con datos controlados antes de usar documentos reales o sensibles.

E.12 cubre:

- usuario con grant `download`: lista documentos visibles, ve acciones de preview/descarga y esas acciones pasan por E.5;
- usuario con grant solo `read_metadata`: lista metadata, no ve preview ni descarga;
- usuario sin grant: recibe estado vacio;
- usuario de otro tenant: no lista ni abre documentos/versiones del tenant A;
- documento `programming` visible por permiso real;
- documento `company` visible por permiso real;
- documento `sensitive_hr` bloqueado en el repositorio visible;
- documento `payroll` bloqueado en el repositorio visible;
- documento `signature_evidence` bloqueado en el repositorio visible;
- documento `requires_signature`: actualmente bloqueado por constraint/trigger y tambien filtrado por E.11 si una fase futura relaja el schema;
- auditoria `file_preview`/`file_download` cuando se pruebe una version con objeto Storage real controlado.

El snippet ejecutable es:

```bash
Get-Content -Raw supabase/snippets/document-repository-beta-qa-verification.sql | docker exec -i supabase_db_boxops psql -U postgres -d postgres -v ON_ERROR_STOP=1
```

El snippet usa `BEGIN`/`ROLLBACK`, crea tenants/usuarios/documentos sinteticos, verifica la RPC `list_accessible_document_versions(...)`, comprueba `can_access_document(...)` para los casos relevantes y registra eventos de auditoria con rollback. No crea objetos reales en Storage y por tanto no sustituye la prueba manual de abrir `/preview` o `/download` con un archivo controlado.

## Nota Local E.23-E.28: Actor Cross-Tenant Documental

Esta nota aplica solo al smoke local runtime opt-in de rutas backend E.5 del repositorio documental. No aplica a QA/staging, produccion ni credenciales reales.

- El actor cross-tenant local solo puede venir de `E2E_CROSS_TENANT_EMAIL` / `E2E_CROSS_TENANT_PASSWORD`.
- Esas variables se pasan solo como variables de proceso durante la ventana corta del smoke.
- No escribir `E2E_CROSS_TENANT_*` en `.env.local` ni en ningun archivo persistente.
- No sustituir el actor por credenciales normales de rol E2E como `E2E_OWNER_*`, `E2E_ADMIN_*`, `E2E_MANAGER_*`, `E2E_COACH_*` o `E2E_PAYROLL_MANAGER_*`.
- El actor E.25 es sintetico, temporal, local-only y process-only; al terminar hay que limpiar con `cleanup_synthetic_actor=1` y confirmar `remaining_auth_users=0`.

## Cierre QA/Staging E.13/E.14/E.15/E.16/E.17/E.18

Resultado local 2026-05-17:

- Supabase local estaba levantada y se ejecuto `supabase/snippets/document-repository-beta-qa-verification.sql` contra `supabase_db_boxops`.
- La ejecucion termino en `ROLLBACK` y paso los asserts de listado autorizado, solo metadata, sin grant, cross-tenant, exclusiones sensibles, bloqueo `requires_signature` y auditoria `file_preview`/`file_download` mediante RPC.
- La prueba local no creo objetos Storage reales, asi que no valida por si sola la apertura real de `/preview` o `/download` con archivo controlado.

Reintento E.14 2026-05-17:

- Se reviso el entorno actual sin imprimir valores: no hay `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_URL`, `SUPABASE_PROJECT_REF`, credenciales E2E por rol ni usuarios/casos documentales QA definidos.
- `.env.local` esta ignorado y solo declara las variables publicas locales de Supabase esperadas entre las claves revisadas; no contiene project/ref staging, DB URL real ni casos documentales QA.
- Supabase local esta levantada y el snippet E.12 se volvio a ejecutar contra `supabase_db_boxops` con `ROLLBACK`.
- No existe acceso QA/staging real desde este entorno para preparar tenant, usuarios/casos, documentos sinteticos persistentes ni archivo real controlado en `document-files`.
- No hay evidencia E.14 de `/app/documents` en QA/staging, preview/download por rutas E.5 con objeto Storage controlado ni auditoria generada por rutas backend reales.

Relectura E.15 2026-05-17:

- Se reviso de nuevo el entorno sin imprimir valores ni secretos.
- `.env.local` sigue ignorado por git; entre las claves revisadas solo contiene `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- El proceso actual no tiene `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_URL`, `DATABASE_URL`, `POSTGRES_URL`, credenciales E2E por rol, usuarios/casos documentales QA ni `DOCUMENT_QA_STORAGE_OBJECT_PATH`.
- Supabase local sigue levantado y el snippet E.12 se ejecuto contra `supabase_db_boxops` con `ROLLBACK`.
- La prueba local paso los asserts de permisos y auditoria por RPC, pero no crea objeto Storage real ni valida preview/download E.5 con archivo controlado.
- QA/staging real sigue sin evidencia desde este entorno.

Handoff E.16 2026-05-17:

- Se reviso de nuevo el entorno sin imprimir valores ni secretos.
- `.env.local` sigue ignorado por git; entre los nombres revisados contiene variables publicas/locales de Supabase y variables de email/Resend, pero no project/ref staging, DB URL real, credenciales E2E documentales ni path de objeto QA controlado.
- El proceso actual no tiene `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_URL`, `DATABASE_URL`, `POSTGRES_URL`, credenciales E2E por rol, usuarios/casos documentales QA ni `DOCUMENT_QA_STORAGE_OBJECT_PATH`.
- El snippet E.12 se ejecuto otra vez contra `supabase_db_boxops` con `ROLLBACK`.
- La prueba local paso los asserts de permisos y auditoria por RPC, pero no crea objeto Storage real ni valida preview/download E.5 con archivo controlado.
- QA/staging real sigue sin evidencia desde este entorno.

Validacion asistida E.17 2026-05-18:

- Se reviso de nuevo el entorno sin imprimir valores ni secretos.
- `.env.local` esta presente e ignorado por git; entre las claves revisadas contiene variables publicas/locales de Supabase y `NEXT_PUBLIC_SITE_URL`, pero no acceso documental QA/staging real.
- El proceso y el entorno de usuario/maquina no tienen `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_URL`, `DATABASE_URL`, `POSTGRES_URL`, credenciales E2E por rol, usuarios/casos documentales QA ni `DOCUMENT_QA_STORAGE_OBJECT_PATH`.
- La CLI de Supabase no devuelve acceso a proyectos desde este entorno; detalles redacted.
- Supabase local esta levantado y el snippet E.12 se ejecuto contra `supabase_db_boxops` con `ROLLBACK`.
- La prueba local paso los asserts de permisos y auditoria por RPC, pero no crea objeto Storage real ni valida preview/download E.5 con archivo controlado.
- QA/staging real sigue sin evidencia desde este entorno.

Validacion prudente E.18 2026-05-18:

- Se reviso de nuevo el entorno sin imprimir valores ni secretos.
- `.env.local` esta presente e ignorado por git; entre las claves revisadas contiene variables publicas/locales de Supabase y `NEXT_PUBLIC_SITE_URL`, pero no acceso documental QA/staging real.
- El proceso y el entorno de usuario/maquina no tienen `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_URL`, `DATABASE_URL`, `POSTGRES_URL`, credenciales E2E por rol, usuarios/casos documentales QA ni `DOCUMENT_QA_STORAGE_OBJECT_PATH`.
- No hay CLI global de Supabase; `npx supabase` esta disponible como dependencia (`2.95.6`), pero `npx supabase projects list --output json` no devuelve acceso a proyectos desde este entorno.
- Supabase local esta levantado y el snippet E.12 se ejecuto contra `supabase_db_boxops` con `ROLLBACK`.
- La prueba local paso los asserts de permisos y auditoria por RPC, pero no crea objeto Storage real ni valida preview/download E.5 con archivo controlado.
- QA/staging real sigue sin evidencia desde este entorno.

Bloqueo QA/staging actualizado E.18 2026-05-18:

- No hay `SUPABASE_ACCESS_TOKEN`, project ref, DB URL real/staging, acceso Supabase CLI autenticado, credenciales E2E por rol ni email/usuarios QA documentales disponibles en el entorno actual.
- No hay URL de app QA/staging ni tenant QA/staging controlado disponible desde este entorno.
- `.env.local` expone nombres de variables publicas/locales entre las claves revisadas; no se imprimieron valores y no se uso ningun secreto real.
- No hay `DOCUMENT_QA_STORAGE_OBJECT_PATH` ni confirmacion de objeto sintetico controlado en `document-files`.
- Por tanto, no hay evidencia QA/staging real de `/app/documents`, preview/download E.5 con objeto Storage controlado ni auditoria generada por rutas backend en staging.
- Estado correcto: `bloqueado por acceso/entorno`, no `validado en staging`.

## Handoff Operativo E.16

Este handoff esta pensado para un operador con acceso real a QA/staging. No debe copiar valores secretos al repo ni pegar en evidencias URLs firmadas, cookies, rutas Storage activas o contenido documental.

### Capacidades Necesarias

- Acceso DB o Supabase CLI autenticado al proyecto QA/staging.
- Project/ref redacted o DB URL gestionada fuera del repo.
- URL de app QA/staging gestionada fuera del repo.
- Permiso para preparar un tenant QA/staging controlado.
- Permiso para crear o usar cuatro usuarios/casos QA redacted.
- Permiso para crear documentos sinteticos no sensibles `programming` y `company`.
- Permiso para crear grants controlados de metadata, preview y download.
- Permiso para cargar un archivo sintetico no sensible en bucket privado `document-files`.
- Capacidad para consultar `document_access_events` en QA/staging con datos redacted.

Variables/canales esperados, sin valores en repo:

- `SUPABASE_ACCESS_TOKEN` o acceso equivalente por DB/CLI.
- `SUPABASE_PROJECT_REF` o project ref comunicado de forma redacted.
- `SUPABASE_DB_URL`, `DATABASE_URL` o `POSTGRES_URL` gestionado fuera del repo.
- URL base de QA/staging para abrir `/app/documents`.
- Credenciales o sesiones controladas para `download-user`, `metadata-only-user`, `no-grant-user` y `cross-tenant-user`.
- Alias/ID redacted de tenant QA/staging.
- Alias redacted del objeto controlado en `document-files`; no guardar path activo si permite acceso o revela estructura real.

### Casos QA Requeridos

- `download-user`: ve documentos `programming` y `company` autorizados, con preview/download solo si `can_preview`/`can_download` lo permiten.
- `metadata-only-user`: ve metadata autorizada, sin botones de preview/download.
- `no-grant-user`: ve estado vacio sin acciones falsas.
- `cross-tenant-user`: no lista ni abre documentos/versiones del tenant QA principal.
- Documentos excluidos: `sensitive_hr`, `payroll`, `signature_evidence` y cualquier `requires_signature` si el schema futuro lo permite.

### Checklist Para Operador

1. Tener acceso DB o Supabase CLI autenticado al proyecto QA/staging, con project ref o DB URL gestionado fuera del repo.
2. Preparar tenant QA, usuarios/casos redacted y cuatro sesiones: descarga, solo metadata, sin grant y otro tenant.
3. Preparar documentos sinteticos no sensibles `programming` y `company`, grants controlados y un archivo real de prueba en `document-files`.
4. Ejecutar el snippet E.12 manteniendo `BEGIN`/`ROLLBACK` o una transaccion equivalente.
5. Abrir `/app/documents` con `download-user`, `metadata-only-user`, `no-grant-user` y `cross-tenant-user`.
6. Confirmar que preview/download se abren por rutas backend E.5 y no por signed URL construida en cliente.
7. Confirmar auditoria `file_preview`/`file_download` en `document_access_events` para el archivo controlado cuando se ejecute preview/download real.
8. Confirmar denegacion cross-tenant por listado/RPC/ruta.
9. Confirmar que `metadata-only-user` no ve botones de archivo.
10. Confirmar estado vacio sin grant.
11. Confirmar que `sensitive_hr`, `payroll`, `signature_evidence` y `requires_signature` no aparecen aunque existan grants sinteticos.
12. Guardar evidencia redacted fuera del repo; en el repo solo dejar estado `pass` o `bloqueado` y bloqueo concreto.

### Evidencia Esperada

- Fecha, entorno y modo de conexion redacted.
- Project/ref redacted o alias de entorno, sin URLs secretas ni DB URL.
- Alias de organizacion/tenant QA.
- Alias de rol/caso probado.
- Conteo redacted del listado por caso.
- Confirmacion de que `programming` y `company` aparecen solo con permiso real.
- Confirmacion de que preview/download usan rutas E.5 y no URLs firmadas en cliente.
- Confirmacion de auditoria `file_preview`/`file_download` permitida cuando se use el archivo controlado.
- Confirmacion de evento `denied` solo si se prueba ruta directa sin permiso sobre documento controlado del mismo tenant.
- Confirmacion de cross-tenant bloqueado.
- Confirmacion de solo metadata sin botones.
- Confirmacion de vacio sin grant.
- Confirmacion de exclusiones `sensitive_hr`, `payroll`, `signature_evidence` y `requires_signature`.
- Resultado de `git diff --check` y guardrails `rg` si se toca repo.
- Bloqueos pendientes si algun punto no se pudo ejecutar.

### Criterios De Pass

- SQL E.12 o equivalente seguro pasa en QA/staging sin persistir datos accidentales.
- `/app/documents` lista solo documentos/versiones autorizados por grants/capacidades reales.
- `download-user` puede preview/download por E.5 con archivo controlado y auditoria real.
- `metadata-only-user` ve metadata sin botones de archivo.
- `no-grant-user` ve estado vacio.
- `cross-tenant-user` queda bloqueado.
- Documentos sensibles, payroll, evidencias de firma y firmables no aparecen.
- No se guarda en repo ningun secreto, cookie, signed URL, ruta Storage activa, documento privado ni contenido documental.

### Criterios De Bloqueado

- Falta acceso DB/CLI real o project/ref/DB URL gestionado fuera del repo.
- Faltan usuarios/casos QA o sesiones por rol.
- Falta tenant QA/staging controlado.
- Faltan documentos sinteticos no sensibles y grants controlados.
- Falta archivo real controlado en `document-files`.
- No se puede consultar auditoria de rutas E.5.
- Aparece cualquier indicio de acceso cross-tenant, botones sin permiso, signed URLs en cliente, documentos sensibles visibles o promesa legal documental definitiva.
- Cualquier evidencia necesaria contiene datos reales no redacted y no puede guardarse de forma segura fuera del repo.

## Plantilla De Evidencia Redacted E.13/E.14/E.15/E.16/E.17/E.18

Guardar esta plantilla fuera del repo si contiene datos reales, capturas, URLs de entorno, usuarios reales o identificadores no anonimizados.

| Campo | Registro redacted |
|---|---|
| Fecha | `YYYY-MM-DD HH:mm TZ` |
| Entorno | `local` / `qa` / `staging`; project/ref redacted si aplica |
| Modo de conexion | Local Docker / Supabase CLI / DB URL gestionada fuera del repo; redacted |
| URL usada | Redacted; no guardar cookies ni signed URLs |
| Organizacion | Nombre/ID redacted o tenant sintetico |
| Rol probado | `owner` / `admin` / `manager` / `coach` / otro rol documentado |
| Usuario/caso redacted | `download-user`, `metadata-only-user`, `no-grant-user`, `cross-tenant-user` u otro alias |
| Documento/version redacted | Tipo/scope y version anonimizados; no contenido ni filename real sensible |
| Resultado de listado | Visible / solo metadata / vacio / bloqueado; incluir conteos redacted |
| Resultado de preview | Permitido por ruta E.5 / no visible / denegado / no ejecutado |
| Resultado de download | Permitido por ruta E.5 / no visible / denegado / no ejecutado |
| Archivo Storage controlado | Bucket `document-files`, scope sintetico, sin path activo ni contenido |
| Auditoria `file_preview`/`file_download` | Evento permitido/denegado confirmado, o `no aplica` si no hubo archivo controlado |
| Auditoria por ruta E.5 | Confirmada en `document_access_events` por preview/download real, o bloqueada/no ejecutada |
| Denegacion cross-tenant | Bloqueada por listado/RPC/ruta; detalle redacted |
| Estado solo metadata | Metadata visible sin botones preview/download; confirmar `can_preview = false` y `can_download = false` |
| Estado vacio sin grant | Empty state sin documentos ni acciones falsas |
| Exclusion `sensitive_hr` | No aparece aunque exista grant sintetico |
| Exclusion `payroll` | No aparece aunque exista grant sintetico |
| Exclusion `signature_evidence` | No aparece aunque exista grant sintetico |
| Exclusion `requires_signature` | Bloqueado por schema o filtrado; no aparece |
| Bloqueos o deuda | Acceso staging, archivo Storage controlado, credenciales, auditoria ruta E.5, deuda UX o pruebas pendientes |
| Verificaciones tecnicas | SQL rollback, smoke, guardrails `rg`, `git diff --check`; indicar pass/bloqueado |
| Evidencia adjunta | Ruta externa/redacted o identificador de carpeta segura; nunca contenido documental |

No rellenar campos con contrasenas, tokens, API keys, cookies, signed URLs, rutas Storage activas, documentos privados, capturas con datos personales innecesarios, nominas, contratos, firmas reales ni contenido documental.

## Procedimiento Manual Controlado

Usar solo datos sinteticos, anonimizados o documentos de prueba sin informacion laboral real.

1. Preparar tenant QA/staging y cuatro sesiones o credenciales: usuario con descarga, usuario solo metadata, usuario sin grant y usuario de otro tenant.
2. Preparar al menos dos documentos permitidos: uno `programming` y uno `company`, con version `active` en bucket privado `document-files`.
3. Preparar o verificar documentos bloqueados de prueba: `sensitive_hr`, `payroll`, `signature_evidence` y, si el schema futuro lo permite, `requires_signature = true`. No usar nominas, contratos, bajas, justificantes ni firmas reales.
4. Abrir `/app/documents?organizationId=...` con cada usuario y guardar evidencia redacted del listado.
5. Con el usuario de descarga, abrir preview/download desde la UI y confirmar que la URL inicial es la ruta backend E.5, no una signed URL construida en cliente.
6. Confirmar en `document_access_events` que existen eventos `file_preview`/`file_download` permitidos para el documento/version controlado.
7. Con el usuario solo metadata, confirmar que la tarjeta aparece sin botones de archivo.
8. Con el usuario sin grant, confirmar estado vacio.
9. Con el usuario de otro tenant, confirmar bloqueo al listar tenant A y ausencia de documentos cruzados.
10. Confirmar que los documentos bloqueados no aparecen en el repositorio aunque tengan grants sinteticos.

Si una prueba directa de ruta E.5 se hace contra un documento existente del mismo tenant sin permiso suficiente, se espera respuesta no disponible y evento `denied`. No probar rutas directas con documentos sensibles reales en E.12.

## Que Puede Ver Cada Rol

| Rol | Puede ver en E.11 | No hereda |
|---|---|---|
| `owner` | Documentos/versiones que `can_access_document` autoriza por capacidad existente, grant o gestion documental permitida para ambitos no sensibles. | No ve por defecto documentos privados sensibles, payroll, evidencias de firma ni todo documento de persona. |
| `admin` | Igual que `owner` para ambitos no sensibles permitidos por el modelo actual. | No ve por defecto documentos personales sensibles, payroll ni evidencias. |
| `manager` | Solo documentos/versiones con sujeto, grant, rol o capacidad real. | No hereda lectura documental global por gestionar operativa diaria. |
| `coach` | Documentos propios por sujeto/grant y programacion o empresa si existe permiso real. | No gana acceso por estar asignado a un bloque ni por ver el horario. |
| `document_admin` | Puede tener acceso amplio segun capacidades documentales existentes, pero E.11 no muestra `sensitive_hr` ni crea UI de gestion/auditoria. | No gestiona payroll ni firma documental por herencia. |
| `payroll_manager` | Queda fuera de la superficie beta E.11 para documentos payroll. | No habilita nominas, importes, contratos reales ni exporte legal. |
| `staff` / `center_manager` | Solo si hay grants/capacidades reales compatibles. | No se activa frontera por centro ni lectura documental por defecto. |

Regla principal: la UI no decide permisos. La base y la RPC vuelven a evaluar sesion, membership activa, tenant, documento, version y access level.

Creacion/subida E.19: `owner`, `admin` y `document_admin` pueden crear adjuntos `company` o `programming` si la RPC de permisos lo confirma. `manager`, `coach`, `staff`, `center_manager` y `payroll_manager` no reciben formulario por este corte.

## Bloqueado Por Grants, Entorno O Datos

E.11 debe considerarse bloqueado o vacio cuando:

- no existen `documents` activos/archivados con versiones activas/archivadas;
- el usuario no tiene sujeto, grant o capacidad documental suficiente;
- el grant es solo `read_metadata`, en cuyo caso no aparecen botones de archivo;
- la version no esta activa/archivada o no pertenece a `document-files`;
- el documento es `sensitive_hr`, payroll, evidencia de firma o requiere firma;
- el bucket privado o las policies no estan aplicadas en el entorno;
- E.5 no puede registrar auditoria de preview/descarga;
- la organizacion activa no se resuelve o el usuario pertenece a otro tenant;
- los datos reales contienen contratos, nominas, justificantes sensibles o documentos laborales no revisados legalmente;
- se espera subida masiva, reemplazo de versiones, firma documental, gestion de grants, IA o payroll.

## Evidencia Que Guardar

Guardar fuera del repo si contiene datos reales:

- fecha, entorno y URL usada;
- rol probado y organizacion activa;
- documento/version redacted, sin contenido documental ni signed URL;
- resultado de listado para usuario con descarga, solo metadata, sin grant y otro tenant;
- caso con `download` o `preview` autorizado;
- caso con solo `read_metadata`, sin botones de archivo;
- caso sin grant, con estado vacio;
- caso cross-tenant bloqueado;
- confirmacion de que `programming` y `company` aparecen solo cuando hay permiso real;
- confirmacion de que `sensitive_hr`, `payroll`, `signature_evidence` y `requires_signature` no aparecen;
- confirmacion de que preview/descarga pasan por rutas backend E.5 y la UI no construye signed URLs;
- resultado de auditoria `file_preview`/`file_download` cuando se pruebe archivo real;
- resultado `denied` si se prueba ruta directa sin permiso sobre documento controlado del mismo tenant;
- `git diff --check`;
- `npm run typecheck` y `npm run lint` si se toca codigo;
- guardrails `rg` de STL, `service_role`, IA y APIs web prohibidas;
- deuda UX menor aceptada y deuda bloqueante abierta.
- plantilla E.13/E.14/E.15/E.16/E.17/E.18 completada o bloqueo concreto si no hubo acceso real a QA/staging.

No guardar contrasenas, tokens, API keys, cookies, signed URLs, enlaces activos, documentos privados, capturas con datos personales innecesarios ni contenido documental.

## Deuda UX Que No Bloquea Beta

Puede quedar para v1 si la lectura basica funciona:

- filtros mas ricos por centro, persona, tipo o fecha;
- buscador por titulo;
- agrupacion por documento con historico expandible;
- iconografia por MIME;
- auditoria visible para roles documentales;
- contador de grants o sujetos;
- enlaces contextuales desde mas pantallas ademas de Horario y Mas;
- copy de ayuda mas detallado para usuarios nuevos.

## Deuda Que Si Bloquea Beta

Bloquea E.11 si aparece:

- documentos visibles sin `can_access_document`;
- preview o descarga con URL firmada construida en cliente;
- boton de archivo aunque `can_preview`/`can_download` sea falso;
- `owner`, `admin` o `manager` viendo todo por herencia no documentada;
- documentos `sensitive_hr`, payroll, evidencias de firma o documentos firmables en la superficie;
- subida visible o gestion de grants sin pruebas negativas;
- archivo privado servido sin auditoria E.5/E.4;
- cross-tenant access;
- `service_role` en `src`;
- IA, embeddings, RAG, vector DB, prompts runtime o SDKs;
- geolocalizacion, app nativa, push, service worker, background sync o caches privadas;
- copy que prometa cumplimiento legal documental definitivo.

## Que Queda Para V1 Comercial

- subida documental controlada con UI y backend revisados;
- gestion visible de grants y revocacion;
- auditoria documental visible para roles/capacidades autorizados;
- documentos firmables con solicitudes, snapshot/version de firma y evidencia inmutable;
- certificaciones completas de coaches con caducidad y adjuntos;
- filtros y busqueda de repositorio;
- retencion, borrado, exportacion y acceso legal revisados;
- guias de usuario/admin y runbook de incidencias documentales;
- hardening de produccion y pruebas negativas ampliadas.

## Que No Prometer Todavia

- firma electronica avanzada o cualificada;
- validez legal documental definitiva;
- contratos reales gestionados end-to-end;
- nominas, importes, compensaciones, saldos o payroll;
- documentos firmables;
- subida documental completa;
- auditoria legal completa;
- IA funcional, RAG, embeddings, vector DB o resumen automatico;
- que una asignacion de horario concede permiso documental;
- que `owner`, `admin` o `manager` ven todo.

## Verificacion Local Esperada

Cuando E.11 toca codigo:

```bash
npm run typecheck
npm run lint
git diff --check
rg -n "STL" src
rg -n "service_role" src
rg -n "OpenAI|openai|anthropic|embeddings|vector|pgvector|ai_" src
rg -n "navigator\.geolocation|serviceWorker|service worker|PushManager|Notification|background sync|caches\.|CacheStorage" src
```

Resultado esperado: typecheck/lint pasan, los guardrails no muestran nuevas coincidencias y el diff no abre subida documental, documentos firmables, payroll, IA, app nativa, geofencing ni cumplimiento legal definitivo.
