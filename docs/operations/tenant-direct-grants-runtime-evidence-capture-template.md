# Tenant Direct Grants Runtime Evidence Capture Template - BoxOps

Estado 2026-05-20. Esta plantilla prepara la captura redacted de evidencia runtime para ejecutar el manifiesto `docs/operations/tenant-direct-grants-runtime-scenario-manifest.md` en un entorno autorizado. No ejecuta runtime, no aplica el draft S.77, no crea migracion `00044`, no cambia grants reales, no cambia default privileges, no toca `src` y no desbloquea beta.

## Objetivo

S.78 define la secuencia de validacion runtime y S.79 define los escenarios por tabla/action/ruta. Esta plantilla no repite esas decisiones: sirve como hoja de pass/fail para capturar resultados observados de cada escenario cuando exista un entorno controlado.

La evidencia sensible vive fuera del repo. No guardar aqui cookies, secretos, tokens, DB URLs, signed URLs, rutas Storage activas, contenido documental, emails reales, screenshots con datos reales ni logs completos. En el repo solo puede quedar un resumen redacted y, si hace falta, un identificador externo no sensible de evidencia.

## Tipo De Entorno

Marcar exactamente uno por ejecucion:

| Tipo | Uso permitido | Decision prudente |
|---|---|---|
| Local | Supabase local y datos sinteticos. Puede ejecutar preflight SQL y smokes locales sin datos reales. | Evidencia util, pero no valida staging/QA ni beta. |
| Desechable autorizado | Entorno local reseteable o QA temporal donde se pueda aplicar y revertir el draft S.77 con autorizacion. | Puede comparar antes/despues del draft si hay rollback/backup y usuarios sinteticos. |
| Staging/QA real | Entorno remoto con project/ref o DB URL, URL real, tenant QA, credenciales por rol, Auth/SMTP/Storage controlado y evidencia redacted. | No reintentar desde este workspace sin acceso nuevo real y operador autorizado. |

## Datos De Ejecucion

| Campo | Valor redacted |
|---|---|
| Fecha/hora |
| Responsable/operador autorizado |
| Tipo de entorno |
| URL o referencia de entorno redacted |
| Commit |
| Branch |
| S.77 aplicado en entorno desechable/autorizado | `no` / `si-con-rollback` |
| `Test-Path supabase\migrations\00044*` |
| Preflight S.74-S.77 ejecutado |
| Smokes baseline antes del draft |
| Auth disponible |
| SMTP/Resend disponible |
| Storage y objeto `document-files` controlado disponible |
| Credenciales por rol disponibles |
| F.15 incluido en alcance |
| Ubicacion externa de evidencia sensible |

## Hoja Pass/Fail Por Escenario

Copiar una fila por escenario desde S.79. Si falta una precondicion de entorno, no simular: marcar `bloqueado`.

| Escenario ID | Entorno | Commit/branch | Rol usado | Tabla/action/ruta | Caso feliz | Negativo por rol | Negativo cross-tenant/ID ajeno | Resultado esperado | Resultado observado redacted | Bloqueo si falta Auth/SMTP/Storage/staging/F.15 | Decision |
|---|---|---|---|---|---|---|---|---|---|---|---|
| TDG-RT-001 |  |  |  |  |  |  |  |  |  |  | `pass` / `fail` / `bloqueado` |
| TDG-RT-002 |  |  |  |  |  |  |  |  |  |  | `pass` / `fail` / `bloqueado` |
| TDG-RT-003 |  |  |  |  |  |  |  |  |  |  | `pass` / `fail` / `bloqueado` |
| TDG-RT-004 |  |  |  |  |  |  |  |  |  |  | `pass` / `fail` / `bloqueado` |
| TDG-RT-005 |  |  |  |  |  |  |  |  |  |  | `pass` / `fail` / `bloqueado` |
| TDG-RT-006 |  |  |  |  |  |  |  |  |  |  | `pass` / `fail` / `bloqueado` |
| TDG-RT-007 |  |  |  |  |  |  |  |  |  |  | `pass` / `fail` / `bloqueado` |
| TDG-RT-008 |  |  |  |  |  |  |  |  |  |  | `pass` / `fail` / `bloqueado` |
| TDG-RT-009 |  |  |  |  |  |  |  |  |  |  | `pass` / `fail` / `bloqueado` |
| TDG-RT-010 |  |  |  |  |  |  |  |  |  |  | `pass` / `fail` / `bloqueado` |
| TDG-RT-011 |  |  |  |  |  |  |  |  |  |  | `pass` / `fail` / `bloqueado` |
| TDG-RT-012 |  |  |  |  |  |  |  |  |  |  | `pass` / `fail` / `bloqueado` |
| TDG-RT-013 |  |  |  |  |  |  |  |  |  |  | `pass` / `fail` / `bloqueado` |
| TDG-RT-014 |  |  |  |  |  |  |  |  |  |  | `pass` / `fail` / `bloqueado` |

## Criterios De Decision

| Decision | Criterio |
|---|---|
| `pass` | Caso feliz funciona, negativos por rol y cross-tenant fallan cerrado, no aparecen errores nuevos de `permission denied for table ...`, y la evidencia redacted identifica entorno, commit/branch, rol, tabla/action/ruta y resultado observado. |
| `fail` | El caso feliz rompe sin bloqueo conocido, una denegacion no falla cerrado, hay mutacion cross-tenant, se expone evidencia sensible o aparece una regresion de permisos/grants. |
| `bloqueado` | Falta Auth, SMTP, Storage, staging/QA, F.15, credenciales por rol, tenant/datos controlados, entorno desechable autorizado o evidencia externa redacted. |

## Bloqueos Frecuentes

| Bloqueo | Como registrarlo |
|---|---|
| Auth/cookies/sesion real no disponible | `bloqueado`: no se puede probar Server Action, PostgREST autenticado ni navegador por rol. |
| SMTP/Resend no disponible | `bloqueado`: invitacion, aceptacion, reset o email real quedan fuera; no inventar evidencia. |
| Storage/objeto `document-files` no disponible | `bloqueado`: preview/download real, signed URL TTL y policies efectivas quedan fuera. |
| Staging/QA sin project/ref, DB URL o URL real | `bloqueado`: no reintentar staging desde este workspace. |
| F.15 no autorizado o sin datos de fichaje controlados | `bloqueado`: no validar cierre laboral, firma propia real, CSV descargable ni cumplimiento laboral. |

## Cierre Redacted

Usar este resumen al terminar una ejecucion autorizada:

| Campo | Valor |
|---|---|
| Total escenarios |
| `pass` |
| `fail` |
| `bloqueado` |
| Hallazgos criticos redacted |
| Regresiones atribuibles al draft S.77 |
| Bloqueos de entorno pendientes |
| Decision sobre migracion real |

Una migracion real solo puede considerarse si S.74-S.77 pasan como preflight, S.78/S.79 estan ejecutados con evidencia redacted, los casos bloqueados estan justificados, no hay `fail` critico abierto y default privileges queda tratado como operacion separada. Hasta entonces `Direct SQL grants` sigue en estado `parcial`.

## No Objetivos

- No crear migracion `00044`.
- No ejecutar el draft S.77 desde esta plantilla.
- No cambiar grants reales ni default privileges.
- No reducir `authenticated` a `SELECT`.
- No tocar `src`.
- No marcar beta lista, staging lista, ASVS conforme ni cumplimiento legal definitivo.
- No abrir IA, payroll funcional, app nativa, geofencing, documentos firmables, subida documental visible, grants UI ni permisos por centro funcionales.
