# Tenant Direct Grants Runtime Validation Runbook - BoxOps

Estado 2026-05-20. Este runbook prepara la validacion runtime que debe existir antes de aplicar el draft S.77 de hardening minimo de grants directos en cualquier entorno objetivo. No aplica el draft, no crea migracion `00044`, no cambia grants reales, no cambia default privileges, no toca `src`, no valida staging y no desbloquea beta.

## Objetivo

Evitar que `supabase/snippets/tenant-direct-grants-minimal-hardening-draft.sql` se convierta en una migracion real solo porque los probes SQL rollback de S.74-S.77 pasan.

El draft S.77 cubre solo dos revokes:

- `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon`;
- `REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM authenticated`.

La validacion runtime debe demostrar, en un entorno controlado y con evidencia redacted, que esos revokes no rompen PostgREST, Server Actions, rutas visibles ni RPCs `SECURITY DEFINER` que dependen de `EXECUTE`, y que default privileges se tratan como paso separado.

S.79 complementa este runbook con el manifiesto `docs/operations/tenant-direct-grants-runtime-scenario-manifest.md`, que mapea cada tabla con DML directo a actions/rutas, roles, casos felices, negativos por rol, negativos cross-tenant, evidencia esperada y bloqueos de entorno. Este runbook conserva la secuencia general; el manifiesto conserva la checklist ejecutable futura.

## Estado Base Local Ya Cubierto Por Rollback

S.74-S.77 ya cubren catalogo/probes SQL locales con `BEGIN`/`ROLLBACK`; no deben repetirse como S.78 con otro nombre.

Evidencia local vigente el 2026-05-20:

- `pg_class.relacl`: 40 tablas publicas de app revisadas.
- RLS: 40/40 tablas publicas de app con RLS habilitado.
- `pg_policies`: 94 policies en `public`; 0 policies con rol directo `anon`.
- `information_schema.role_table_grants`: `anon` tiene grants directos amplios en 32 tablas; `authenticated` tiene `SELECT` en 40, algun privilegio directo de riesgo en 30 y `TRUNCATE` en 29.
- `pg_default_acl`: default table ACL de `postgres` y `supabase_admin` en `public` sigue concediendo `anon=arwdDxt` y `authenticated=arwdDxt`.
- S.77 verifier confirma en rollback que el draft deja `anon` con 0 grants de tabla y `authenticated` con 0 `TRUNCATE`/`REFERENCES`/`TRIGGER`, preservando el DML directo observado y `EXECUTE` de RPCs clave de invitacion.

Limite: esto es postura de catalogo y SQL directo. No es evidencia de PostgREST, Server Actions, navegador, Auth real, Storage real, SMTP, staging ni beta.

## Capas Que Deben Separarse

| Capa | Que prueba | Estado actual | Criterio antes de aplicar en entorno objetivo |
|---|---|---|---|
| Catalogo SQL / rollback | Grants actuales, RLS habilitado, policies, default ACL y efecto teorico del draft dentro de transaccion | Cubierto por S.74-S.77 | Reejecutar los snippets en el entorno candidato solo como preflight, sin llamarlo runtime. |
| PostgREST / DML directo | Que `.from(...).insert/update/upsert/delete` usado por `src` sigue funcionando con `authenticated` y que `anon` no gana acceso por tabla | Pendiente | Probar con usuarios controlados por rol sobre las 14 tablas con DML directo actual y registrar pass/fail redacted. |
| Server Actions / rutas | Que las rutas que envuelven ese DML directo siguen validando sesion, tenant y rol tras el draft | Pendiente | Ejecutar acciones/rutas MVP con `owner`/`admin`/`manager`/`coach` controlados y confirmar que no aparecen 401/403/500 inesperados. |
| RPC `SECURITY DEFINER` | Que `EXECUTE` y comportamiento de RPCs siguen intactos al cambiar grants de tabla | Parcial: solo probes SQL de dos RPCs de invitacion | Probar RPCs clave por flujo, no solo `has_function_privilege(...)`. |
| Default privileges | Que objetos futuros no vuelven a heredar grants amplios | Pendiente y separado | Crear plan owner/operador para `postgres` y `supabase_admin`; no mezclar con la migracion minima S.77. |
| QA/staging real | Que el comportamiento se mantiene con URL, Auth, cookies, roles, SMTP/Storage y datos controlados reales | Bloqueado | Ejecutar solo si hay acceso nuevo real: project/ref o DB URL, URL QA/staging, credenciales por rol, tenant/datos controlados y evidencia redacted. |

## Superficies De DML Directo Que Faltan Validar

Estas tablas no son seguras para revocar `authenticated INSERT`/`UPDATE`/`DELETE` todavia. El draft S.77 no las toca, pero sus rutas deben probarse porque son el blast radius runtime principal.

| Tabla | Operaciones observadas | Superficie minima a validar |
|---|---:|---|
| `centers` | `INSERT`, `UPDATE` | `/app/centers`: crear, editar y activar/desactivar centro con rol autorizado; coach sin mutacion. |
| `class_types` | `INSERT`, `UPDATE` | `/app/class-types`: crear, activar/desactivar; editar via RPC de sync como flujo separado. |
| `coach_profiles` | `INSERT`, `UPDATE` | `/app/coaches`: crear/editar ficha operativa y vinculos basicos sin cruzar tenant. |
| `organization_memberships` | `INSERT`, `UPDATE` | `/app/coaches`: crear/editar acceso controlado; manager/coach sin gestion. |
| `organizations` | `UPDATE` | `/app/settings`: editar configuracion minima permitida; manager/coach sin gestion global. |
| `person_profiles` | `INSERT`, `UPDATE` | `/app/account` perfil propio y `/app/coaches` ficha/persona operativa autorizada. |
| `schedule_block_assignments` | `INSERT`, `UPDATE` | `/app/schedule` asignar/retirar coach; `/app/coverage` bulk resolve; aplicacion de plantilla con coach por defecto. |
| `schedule_blocks` | `INSERT`, `UPDATE`, `DELETE`, `UPSERT` | `/app/schedule` crear/editar/cancelar; `/app/coverage` bulk; `/app/templates` aplicar/retirar bloques generados. |
| `schedule_template_blocks` | `INSERT`, `UPDATE`, `DELETE` | `/app/templates` crear/editar/retirar bloque de plantilla. |
| `schedule_templates` | `INSERT`, `UPDATE` | `/app/templates` crear/editar/archivar/recuperar/aplicar plantilla. |
| `staff_work_windows` | `INSERT`, `UPDATE` | `/app/schedule` crear/editar/desactivar jornada prevista. |
| `team_invitations` | `INSERT`, `UPDATE` | `/app/coaches` crear/re-enviar/cancelar invitacion; preview/accept RPC separados. |
| `time_exports` | `INSERT`, `UPDATE` | `/app/time` generar exporte CSV interno revisable con rango acotado. |
| `time_record_corrections` | `INSERT`, `UPDATE` | `/app/time` solicitar/revisar correccion, incluida politica de aprobacion configurada. |

Notas:

- Los matches de `URLSearchParams.delete(...)`, `Set.delete(...)` y `createHash(...).update(...)` no son DML de Supabase.
- `time_records` y `time_punches` no aparecen como UPDATE/DELETE directos normales en `src`; sus escrituras principales son RPC/trigger-driven, pero siguen necesitando runtime propio para `/app/time`.

## RPCs Que Deben Probarse Como Comportamiento, No Solo Como Grant

Los probes de S.76/S.77 confirman `EXECUTE` para:

- `get_team_invitation_public(uuid,text)` con `anon`;
- `accept_team_invitation(uuid,text)` con `authenticated`.

Antes de aplicar una migracion real, validar tambien comportamiento real de los grupos RPC que sostienen flujos existentes:

- Invitaciones: preview anonimo minimizado, aceptacion autenticada con token/email correctos y denegacion con token/email incorrectos.
- Tipos de actividad: `update_class_type_and_sync_defaults(...)` y sincronizacion de defaults sin romper `class_types`.
- Settings de fichaje: `update_organization_time_tracking_config(...)`.
- Mi cuenta: lifecycle RPC de avatar/firma propios, sin Storage real salvo entorno autorizado.
- Solicitudes/cambios, ausencias, eventos operativos, overtime, time-location inactivo, fichaje/cierre semanal y document programming: smoke por helper/ruta o RPC con datos sinteticos cuando exista harness.
- Auditorias: `record_*`/`list_*` solo con metadata minimizada y roles autorizados.

Si una RPC depende de Storage real, SMTP, Auth callback, signed URLs, cookies HTTPS o archivo `document-files`, marcarla como bloqueada hasta tener acceso real autorizado. No simular evidencia.

## Secuencia Recomendada

1. Preflight sin aplicar:
   - Releer `PROJECT_BRIEF.md`, `TASKS.md`, este runbook y los snippets S.74-S.77.
   - Confirmar `Test-Path supabase\migrations\00044*` devuelve `False`.
   - Reejecutar catalogo local si el esquema cambio: `pg_class.relacl`, `pg_default_acl`, `information_schema.role_table_grants`, `pg_policies`.
   - Rebuscar DML/RPC en `src` y comparar con migraciones `GRANT`/`REVOKE`.

2. Baseline runtime antes del draft:
   - Ejecutar smokes existentes sin cambiar grants.
   - Si hay credenciales E2E locales por rol, cubrir `owner`, `admin`, `manager` y `coach`.
   - Registrar fallos existentes antes de cualquier hardening para no atribuirlos al draft.

3. Entorno candidato desechable:
   - Aplicar el draft solo en un entorno local reseteable o QA/staging autorizado, nunca en esta tarea ni en un entorno real sin rollback/backup.
   - Si no existe entorno candidato, parar y documentar bloqueo.

4. PostgREST y Server Actions:
   - Ejecutar las superficies de DML directo de la tabla anterior.
   - Validar denegaciones por rol y tenant, no solo casos felices.
   - Confirmar que no aparecen errores nuevos de PostgREST por `permission denied for table ...`.

5. RPCs:
   - Ejecutar los RPCs clave por flujo y no solo `has_function_privilege(...)`.
   - Confirmar que `SECURITY DEFINER` conserva `SET search_path = public` y no depende de grants directos revocados de forma accidental.

6. Default privileges:
   - Preparar migracion/operacion separada para `ALTER DEFAULT PRIVILEGES` de `postgres` y `supabase_admin`.
   - Validar el owner efectivo antes de afirmar que futuros objetos no heredaran grants amplios.
   - No mezclar este cierre con la migracion minima S.77.

7. Decision:
   - Solo convertir el draft en migracion real si catalogo, runtime local/controlado, rutas, RPCs y bloqueos de entorno estan documentados.
   - Mantener `Direct SQL grants` como `parcial` hasta que exista migracion aplicada y validada en el entorno declarado.

## Evidencia Esperada

Registrar fuera del repo cualquier evidencia con usuarios reales, URLs, cookies, signed URLs, rutas Storage, contenido documental o secretos.

Para evidencia local/redacted en repo, bastan:

- fecha, entorno y commit/branch;
- comandos ejecutados sin secretos;
- roles/casos sinteticos usados;
- tabla de pass/fail por superficie;
- errores relevantes redacted;
- confirmacion de que no se creo `00044` hasta la decision explicita de migracion;
- confirmacion de que no se redujo `authenticated` a `SELECT` ni se tocaron default privileges en el mismo corte.

## Bloqueos Que No Deben Reintentarse Sin Acceso Nuevo

- QA/staging real, Supabase project/ref o DB URL, credenciales E2E por rol y tenant QA/staging con datos controlados.
- Auth/SMTP real, invitacion/reset reales, cookies HTTPS y Redirect URLs reales.
- Storage real, objeto controlado en `document-files`, expiracion efectiva de signed URLs y policies de bucket.
- F.15 real de fichaje, aprobacion con firma, CSV legal, scheduler y cumplimiento laboral/documental definitivo.

## No Objetivos

- No crear migracion `00044`.
- No ejecutar el draft S.77 en esta tarea.
- No cambiar grants reales.
- No reducir `authenticated` a `SELECT`.
- No cambiar default privileges.
- No tocar `src`.
- No abrir IA, payroll funcional, app nativa, geofencing, documentos firmables, subida documental visible, grants UI, permisos por centro funcionales ni cumplimiento legal definitivo.
- No marcar beta lista, staging lista, ASVS conforme ni cumplimiento legal definitivo.
