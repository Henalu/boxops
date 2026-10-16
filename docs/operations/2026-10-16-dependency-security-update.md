# Actualizacion de dependencias de seguridad — 2026-10-16

Actualizacion local sobre `codex/ajustes-validacion-ui`. No incluye merge, push, despliegue ni cambios en Supabase remoto.

## Cambios

Se mantiene la rama 16.3 de Next.js y se aplican parches compatibles a las dependencias transitivas. No cambia el codigo de producto, los permisos, el schema ni los rangos de otras dependencias directas.

| Paquete | Antes | Despues |
| --- | --- | --- |
| `next` / `eslint-config-next` | 16.3.4 | 16.3.8 |
| `sharp` | 0.35.4 | 0.35.5 |
| `source-map-js` | 1.2.1 | 1.2.2 |
| `@modelcontextprotocol/sdk` (herramientas de desarrollo) | 1.29.0 | 1.32.1 |
| `brace-expansion` | 1.1.18 / 5.0.9 | 1.1.21 / 5.0.12 |
| `proxy-addr` | 2.0.7 | 2.0.8 |
| `fast-uri` | 3.1.7 | 3.1.8 |
| `ip-address` | 10.7.0 | 10.7.4 |

`package.json` solo cambia las dos versiones de Next.js. El lockfile conserva todas las variantes de plataforma y no incorpora overrides nuevos; se mantiene el override previo de PostCSS. `npm ci --no-audit --no-fund` confirma una instalacion reproducible y `npm ls --all --json` no detecta incompatibilidades.

Referencias: [Next.js 16.3.8](https://github.com/vercel/next.js/releases/tag/v16.3.8), [Sharp 0.35.5](https://github.com/lovell/sharp/releases/tag/v0.35.5).

## Auditoria

- Produccion: de **3 paquetes afectados (1 critico y 2 altos)** a **0 vulnerabilidades**, con `npm audit --omit=dev --json`.
- Arbol completo: de **16 paquetes afectados** a **8 avisos altos**, sin criticos ni moderados.
- Los ocho avisos restantes proceden de una unica causa: `braces@3.0.3`, sin version corregida publicada a la fecha de la revision. Se propaga a `micromatch`, `fast-glob`, `@next/eslint-plugin-next`, `eslint-config-next`, `@ts-morph/common`, `ts-morph` y `shadcn`.
- Es una cadena de herramientas de desarrollo. No se afirma que la auditoria completa este limpia. El aviso afecta a patrones profundamente anidados no confiables; esta revision no incorpora entradas externas nuevas a esas herramientas.
- No se aplica `npm audit fix --force`: las sugerencias de bajar `eslint-config-next` a 14 y `shadcn` a 1 no son compatibles con este corte. Tampoco se retira `shadcn`, cuyo CSS utiliza la aplicacion.

Pendiente de proveedor: [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm). Revisar de nuevo cuando exista un parche compatible.

## Verificacion local

- Instalacion desde lockfile: correcta.
- `npm run typecheck -- --pretty false`: correcto.
- `npm run lint`: correcto, sin errores ni warnings.
- `npm run build`: correcto con Next.js 16.3.8.
- **231/231** comprobaciones de codigo/helpers, conector, navegacion, Auth publica y redireccion anonima: sin omisiones ni reintentos.
- **20/20** recorridos autenticados de UI: propietario, administrador, responsable, entrenador, atleta, otro tenant y soporte; escritorio y movil. Incluyen asignar/retirar entrenadores, aplicar/reintentar/reemplazar plantillas, rollback ante solape, aislamiento entre organizaciones y restricciones de soporte.
- **14/14** casos de documentos y paneles: subida de archivos sinteticos, preview/descarga por backend y enlaces visibles, auditoria, denegaciones por rol/tenant y apertura/cierre de detalles sin perder contexto.
- Total de Playwright: **265 casos**, sin fallos, omisiones ni reintentos. Las suites autenticadas se ejecutaron en serie para no invalidarse sesiones entre si.
- **35 aserciones SQL** de plantillas atomicas: correctas contra Postgres local, con rollback completo. Incluyen permisos, tenant, solapes, idempotencia, reemplazo, certificaciones y referencias BoxWod.
- Sharp nativo: conversion PNG a WebP de 32x32 correcta.

Comando de las 231 comprobaciones, con el build servido en `http://localhost:3107`:

```powershell
$env:E2E_BASE_URL = "http://localhost:3107"
$env:E2E_START_SERVER = "0"
node node_modules/@playwright/test/cli.js test --config=playwright.smoke.config.ts --workers=1 --grep "guardrails|BoxWod|connector|password policy|navigation role visibility|schedule coach availability|schedule zero-required coverage|schedule-template-application|login page renders|forgot password page renders|reset password page is public|anonymous users are redirected"
npm run test:db:template-atomic
```

Recorridos autenticados con los fixtures locales existentes:

```powershell
npm run test:ui:local
node scripts/run-local-ui-validation.mjs --smoke tests/smoke/documents-repository-surface.spec.ts tests/smoke/operational-detail-panels.spec.ts --grep "documents minimal upload runtime smoke|operational detail panels route-state smoke"
```

Docker Desktop estaba apagado y se arranco para recuperar los contenedores existentes. No se ejecuto reset ni se recrearon cuentas Auth. Las fechas de cuatro bloques y dos plantillas de los tenants sinteticos `ui-validation-*`, junto con la semana del fixture, se trasladaron temporalmente del 5 al 19 de octubre para probar la sincronizacion de plantillas con una semana vigente. La actualizacion y su restauracion se acotaron por IDs, organizacion, slug sintetico, estado, fechas y ausencia de referencias operativas dependientes. Al terminar, las fechas volvieron al 5 de octubre, las plantillas quedaron en borrador y sin bloques generados. Esta preparacion temporal no modifica datos de tenants reales. Para repetir los recorridos de plantillas, el fixture debe volver a situarse en una semana vigente.

Auditorias e informes de pruebas se guardan en `.local-evidence/dependency-security-2026-10-16/`, ignorado por Git. No se incorporan credenciales, sesiones ni archivos de prueba privados al repositorio.

## Limites

La validacion corresponde al entorno local y al build actualizado. No acredita una nueva version en Vercel, envio real de correo, sesion HTTPS compartida con BoxWod ni la totalidad de las suites runtime historicas. Los pendientes operativos de produccion siguen separados de esta actualizacion.

## Revision posterior para integrar la PR #2

El usuario autoriza integrar y comprobar produccion. Los cambios anteriores se incorporan a la [PR #2](https://github.com/Henalu/boxops/pull/2), donde se registra el commit publicado, el deployment y la evidencia final de produccion.

La revision independiente reproduce un deadlock entre el bloqueo `FOR UPDATE` de la plantilla en la nueva RPC y el bloqueo de tabla seguido de la comprobacion de clave foranea en el conector. PostgreSQL cancela una operacion sin dejar datos parciales. La migracion aditiva `20261016065729_avoid_template_connector_deadlock.sql` utiliza `FOR NO KEY UPDATE`: conserva la exclusion de ediciones de plantilla y permite la comprobacion de clave foranea del conector. No cambia roles, RLS, validaciones ni el bloqueo por organizacion/semana. La migracion original ya instalada permanece intacta.

La reproduccion local compara ambas variantes en conexiones concurrentes y termina con rollback. El runner SQL y el preparador de fixtures locales cargan tambien la correccion, para que las futuras verificaciones no reinstalen accidentalmente el bloqueo anterior. Referencia: [bloqueos de filas en PostgreSQL](https://www.postgresql.org/docs/current/explicit-locking.html#LOCKING-ROWS).

La correccion se aplica al hub con `supabase db push --linked --skip-vault`, despues de comprobar que el dry-run contiene exclusivamente esa migracion. El historial queda en 74/74; se confirma el bloqueo nuevo, SECURITY INVOKER y ejecucion anonima denegada. Las 35 aserciones SQL pasan tanto localmente como contra la funcion remota instalada, con rollback completo y cero organizaciones de prueba residuales.
