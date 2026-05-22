# Pre-QA Controlled Pilot Runbook - BoxOps

Estado 2026-05-12. Este runbook es el gate minimo antes de probar BoxOps con STL o con emails reales. No abre modulos nuevos y no activa geolocalizacion real, geofencing, documentos firmables, payroll ni ausencias.

## Alcance

- Revisar que el repo no lleva secretos ni scratch SQL local accidental.
- Configurar email transaccional de invitaciones con Resend.
- Configurar Supabase Auth para redirects, reset y SMTP si se envian emails Auth reales.
- Ejecutar verificacion tecnica antes de una prueba controlada.
- Dejar la purga de `operational_audit_events` como gate pre-produccion.
- En S.8/A.1, usar `docs/operations/beta-operational-readiness-runbook.md` para convertir estos bloqueos en checklist de beta interna controlada con evidencia.

## 1. Preflight de repo y secretos

Ejecutar antes de preparar un commit o una prueba con emails reales:

```bash
git status --short
git check-ignore -v .env.local
git ls-files .env.local
rg -n "STL" src
rg -n "service_role" src
rg -n "navigator\.geolocation" src
```

Criterios:

- `.env.local` debe seguir ignorado y `git ls-files .env.local` no debe devolver nada.
- `src` no debe contener `STL`, `service_role` ni `navigator.geolocation`.
- No commitear `supabase/snippets/Untitled query *.sql`. Si una query local es necesaria, renombrarla a un snippet con nombre explicito, revisar que no contenga emails/ids reales innecesarios ni contrasenas, y documentar su uso.
- Revisar cualquier diff de `.env.example`, docs, snippets y migrations buscando valores reales de `RESEND_API_KEY`, tokens JWT, `SUPABASE_SERVICE_ROLE_KEY`, signed URLs o credenciales.

## 2. Variables de entorno

`.env.example` debe quedarse como plantilla sin valores reales:

```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3000
RESEND_API_KEY=
BOXOPS_EMAIL_FROM="BoxOps <onboarding@resend.dev>"
BOXOPS_EMAIL_REPLY_TO=
```

En QA/staging/produccion:

- `NEXT_PUBLIC_SITE_URL` debe ser la URL publica real del entorno, sin slash final.
- `RESEND_API_KEY` es secreto server-side. No usar prefijo `NEXT_PUBLIC_`, no pegarla en docs, snippets, logs ni tickets.
- `BOXOPS_EMAIL_FROM` debe usar un remitente verificado en Resend antes de enviar a correos externos reales.
- `BOXOPS_EMAIL_REPLY_TO` es opcional, pero si se define debe ser un buzón controlado por el operador del piloto.
- No anadir `SUPABASE_SERVICE_ROLE_KEY` a la app Next.js. Cualquier tarea privilegiada debe vivir fuera de `src` y con procedimiento operativo separado.

## 3. Resend para invitaciones BoxOps

Checklist minimo:

1. Crear o rotar una API key de Resend para el entorno.
2. Guardarla solo en el gestor de variables del entorno (`RESEND_API_KEY`).
3. Verificar dominio o remitente en Resend. Mientras no exista dominio verificado, usar `onboarding@resend.dev` solo para pruebas permitidas por Resend.
4. Definir `BOXOPS_EMAIL_FROM` con nombre claro y remitente verificado.
5. Definir `BOXOPS_EMAIL_REPLY_TO` si alguien debe recibir respuestas del piloto.
6. Enviar una unica invitacion controlada a un email interno permitido.
7. Confirmar que el enlace abre `/invite/accept`, que la cuenta Auth usa el mismo email invitado y que la invitacion queda aceptada sin exponer el token.

No hacer envio masivo ni invitar a STL hasta completar el primer test controlado.

## 4. Supabase Auth, redirects y SMTP

Configurar por entorno:

- Site URL: mismo origen que `NEXT_PUBLIC_SITE_URL`.
- Redirect URLs permitidas:
  - local si se usa: `http://127.0.0.1:3000/auth/callback` o el puerto real de QA local;
  - preview/staging: `https://<entorno>/auth/callback`;
  - produccion: `https://<dominio>/auth/callback`.
- El reset de contrasena vuelve por `/auth/callback?next=/reset-password`; la allowlist debe permitir el callback y la app redirige internamente a `/reset-password`.
- En produccion, usar Redirect URLs exactas por origen y path. `/reset-password` no necesita ser el `redirectTo` directo del email si se mantiene el callback actual; queda como destino interno despues de `exchangeCodeForSession`.
- Para QA local en puertos alternativos, anadir el callback del puerto real, por ejemplo `http://127.0.0.1:3003/auth/callback`, antes de probar reset o confirmacion de cuenta desde emails reales.
- Configurar en Supabase Auth la politica minima de contrasena alineada con la app: 8 caracteres, al menos una letra y un numero.
- Si Supabase Auth debe enviar confirmaciones, resets, magic links o invites a usuarios fuera del equipo del proyecto, activar Custom SMTP antes de QA real.

Para Resend SMTP, usar la configuracion oficial vigente:

- host: `smtp.resend.com`
- username: `resend`
- password: API key de Resend
- puerto: preferir `587` o el puerto recomendado por el entorno

Hacer una prueba de reset password con un email controlado despues de activar SMTP.

## 5. Purga S.1 de auditoria operativa

`operational_audit_events` tiene retencion corta y `retain_until`. La funcion segura ya existe:

```sql
select public.purge_expired_operational_audit_events(1000);
```

Gate pre-produccion:

- Activar un job de base de datos o scheduler gestionado que ejecute la purga de forma periodica, preferiblemente diaria.
- Ejecutarlo con usuario propietario/operativo de base de datos, no desde una Server Action ni desde un boton UI.
- Mantener `batch_size` acotado. Valor inicial recomendado: `1000`.
- Registrar alerta operativa si el job falla.
- Revisar metricas basicas: filas purgadas, errores del job y crecimiento de `operational_audit_events`.

Plantilla recomendada con `pg_cron`/scheduler DB, a revisar y ejecutar solo en el entorno real por un operador con permisos de base de datos:

```sql
select cron.schedule(
  'boxops-purge-operational-audit-events',
  '17 3 * * *',
  $$select public.purge_expired_operational_audit_events(1000);$$
);
```

SQL idempotente preparado para operador DB:

```powershell
Get-Content -Raw supabase\snippets\activate-operational-audit-purge-job.sql
```

Notas de operacion:

- No incluir esta activacion en una Server Action ni en UI.
- Confirmar zona horaria del scheduler del entorno antes de elegir la hora.
- Si el scheduler del proveedor no usa `pg_cron`, crear un job equivalente que ejecute exactamente la misma SQL con usuario operativo de base de datos.
- Registrar el primer resultado y configurar alerta de fallo antes de considerar cerrado el gate de produccion.

Fallback temporal si no hay scheduler en el primer despliegue:

- Ejecutar la SQL manualmente desde Supabase SQL Editor con usuario autorizado.
- Dejar fecha, entorno, operador y resultado en una nota operativa.
- No considerar produccion cerrada hasta sustituirlo por job real.

## 6. Verificacion tecnica

Ejecutar antes del piloto controlado:

```bash
npm run typecheck
npm run lint
npm run build
npm run test:smoke
npx supabase db lint --local
npx supabase migration list --local
```

Si hay servidor abierto en otro puerto:

```bash
E2E_BASE_URL=http://127.0.0.1:3003 npm run test:smoke
```

En PowerShell:

```powershell
$env:E2E_BASE_URL = "http://127.0.0.1:3003"; npm run test:smoke
```

Para S.1/RLS local, ejecutar el snippet con rollback contra la base local:

```powershell
Get-Content -Raw supabase\snippets\operational-audit-rls-verification.sql | docker exec -i supabase_db_boxops psql -U postgres -d postgres -v ON_ERROR_STOP=1
```

Si se toca Horario, Cobertura o Plantillas, ejecutar:

```bash
npx playwright test --config=playwright.smoke.config.ts tests/smoke/operational-detail-panels.spec.ts
```

Si se toca asignacion de coaches o disponibilidad, ejecutar:

```bash
npx playwright test --config=playwright.smoke.config.ts tests/smoke/schedule-coach-availability.spec.ts
```

## 7. Bloqueos antes de QA real

No probar con STL ni emails reales hasta cerrar esta lista:

- Resend API key real creada/rotada y guardada solo en entorno.
- Dominio/remitente verificado o prueba limitada a `onboarding@resend.dev` con destinatario permitido.
- Supabase Auth Site URL y Redirect URLs configuradas para el entorno.
- Custom SMTP de Supabase Auth activado si el entorno debe enviar emails Auth reales.
- Email interno permitido y credenciales E2E/admin definidas fuera del repo para la prueba controlada.
- Primer reset password y primera invitacion real probados con email controlado.
- Job real de purga S.1 programado o fallback manual aceptado solo como medida temporal.
- Scratch SQL `Untitled query` fuera del commit o convertido a snippet nombrado y revisado.
- Resultado claro de typecheck, lint, build, smoke, Supabase lint/migration list y verificacion RLS.

Para cierre S.8/A.1, esta lista se ejecuta dentro de `docs/operations/beta-operational-readiness-runbook.md`, que anade validacion oficial de datos reales del primer tenant, credenciales E2E por rol (`owner`, `admin`, `manager`, `coach`), smoke autenticado/no autenticado, criterios de `bloqueado`/`listo para beta interna`/`no apto para produccion` y evidencia minima.

## 8. Resultado S.3 2026-05-12

- `.env.local` sigue ignorado y no trackeado.
- `.env.example` conserva solo placeholders.
- Escaneo enmascarado de archivos trackeables sin hallazgos de secretos.
- `NEXT_PUBLIC_SITE_URL`, `BOXOPS_EMAIL_FROM`, `BOXOPS_EMAIL_REPLY_TO` y `RESEND_API_KEY` existen localmente con formato plausible; valores no impresos.
- Resend API autentica con la key local; no se imprimen dominios ni valores. El remitente local usa `resend.dev`, asi que cualquier envio real debe limitarse a destinatarios permitidos por Resend hasta verificar dominio propio.
- `SUPABASE_SERVICE_ROLE_KEY` no esta definido en `.env.local` y `src` no contiene `service_role`.
- Los `Untitled query` trackeados salen del indice; los scratch locales quedan ignorados.
- `npm run typecheck`, `npm run lint`, `npm run build`, `E2E_BASE_URL=http://127.0.0.1:3003 npm run test:smoke`, `npx supabase db lint --local`, `npx supabase migration list --local` y la verificacion SQL/RLS de auditoria pasan.
- La prueba real de invitacion/reset queda bloqueada hasta definir email interno permitido, credenciales E2E/admin y confirmar Supabase Auth/SMTP real.

## 9. Resultado S.4 2026-05-12

- `git status --short --branch` revisado antes de cambios; worktree amplio preexistente, sin revertir cambios ajenos.
- `.env.local` sigue ignorado/no trackeado y `.env.example` no contiene secretos reales.
- Escaneo estricto de archivos trackeables sin hallazgos de API key Resend real, JWT, private key ni `SUPABASE_SERVICE_ROLE_KEY`.
- STL local conserva 1 plantilla activa `Semana prueba STL L-V`, 165 bloques de plantilla y 165 bloques generados para 2026-05-04 a 2026-05-08.
- Resend autentica localmente, pero no hay email interno permitido, credenciales E2E/admin ni acceso al proyecto Supabase real para verificar Auth/SMTP/Redirect URLs reales.
- No se envia invitacion ni reset real; queda bloqueado hasta tener destinatario controlado y credenciales.
- `pg_cron` esta disponible localmente pero no instalado ni programado; se anade `supabase/snippets/activate-operational-audit-purge-job.sql` para activacion real por operador DB. Falta ejecutarlo en entorno real o scheduler equivalente y registrar primer resultado/alerta.
- `npm run typecheck`, `npm run lint`, `npm run build`, `E2E_BASE_URL=http://127.0.0.1:3003 npm run test:smoke`, `npx supabase db lint --local`, `npx supabase migration list --local` y la verificacion SQL/RLS de auditoria pasan.
- `rg -n "STL" src`, `rg -n "service_role" src` y `rg -n "navigator\.geolocation" src` sin coincidencias.

## 10. Resultado S.5 2026-05-12

- `git status --short --branch` revisado; worktree amplio preexistente, sin revertir cambios ajenos.
- `.env.local` sigue ignorado/no trackeado; `.env.example` conserva solo placeholders/local defaults y no contiene secretos reales.
- Escaneo redacted de archivos trackeables y untracked no ignorados sin hallazgos de valores tipo API key Resend real, JWT, private key, URL firmada ni `SUPABASE_SERVICE_ROLE_KEY`.
- `.env.local` tiene `NEXT_PUBLIC_SITE_URL`, Supabase public env, `RESEND_API_KEY`, `BOXOPS_EMAIL_FROM` y `BOXOPS_EMAIL_REPLY_TO` presentes con forma plausible; valores no impresos.
- `.env.local` no contiene `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ACCESS_TOKEN`, project ref, credenciales E2E/admin ni email controlado.
- Resend API autentica con la key local sin imprimir valores. No hay dominios verificados visibles en la cuenta consultada; el remitente local queda limitado a `onboarding@resend.dev`.
- STL local conserva 1 organizacion STL, 1 plantilla activa `Semana prueba STL L-V`, 165 bloques de plantilla y 165 bloques generados para 2026-05-04 a 2026-05-08. No se reaplica ningun snippet.
- Auth en codigo conserva las rutas esperadas: `/auth/callback`, `/auth/callback?next=/reset-password` y `/invite/accept`. La politica minima de password en app es 8 caracteres, al menos una letra y un numero.
- Supabase Auth real no se puede verificar desde este entorno: faltan acceso administrativo, `SUPABASE_ACCESS_TOKEN` y project ref.
- Invitacion/aceptacion/reset reales no se ejecutan: faltan email interno permitido, credenciales E2E/admin y verificacion Auth/SMTP real.
- Purga S.1 verificada localmente como funcion: `authenticated` y `anon` no pueden ejecutarla; `postgres` y `service_role` si. El job real no queda activado porque falta acceso al scheduler/DB real.
- `npm run typecheck`, `npm run lint`, `npm run build`, `E2E_BASE_URL=http://127.0.0.1:3003 npm run test:smoke`, `npx supabase db lint --local`, `npx supabase migration list --local` y la verificacion SQL/RLS de auditoria pasan.
- `rg -n "STL" src`, `rg -n "service_role" src` y `rg -n "navigator\.geolocation" src` sin coincidencias.

Resultado: bloqueos restantes. El piloto STL no queda desbloqueado hasta completar Supabase Auth/SMTP real, remitente Resend permitido, email interno controlado, credenciales E2E/admin, prueba real de invitacion/reset y job real de purga S.1.

## 11. Resultado S.6 2026-05-12

- Reintento post-S.5 ejecutado sin tocar `src`, Horario, Cobertura, Plantillas, asignaciones ni datos de agenda.
- `.env.local` sigue ignorado/no trackeado y apunta a Supabase/Site URL local; no hay variables de proceso ni `.env.local` con `SUPABASE_ACCESS_TOKEN`, project ref, DB URL real, credenciales E2E/admin, email controlado ni `SUPABASE_SERVICE_ROLE_KEY`.
- `npx supabase projects list --output json` no tiene acceso a proyectos desde este entorno; Supabase Auth real, Site URL, Redirect URLs, password policy y Custom SMTP siguen sin poder verificarse.
- Resend API autentica con la key local sin imprimir valores; la cuenta consultada devuelve 0 dominios y 0 dominios verificados visibles. El remitente local queda en `resend.dev` y no coincide con dominio verificado.
- Servidor disponible detectado en `http://127.0.0.1:3003`; smoke se ejecuta contra ese origen.
- STL local conserva 1 organizacion STL, 1 plantilla activa `Semana prueba STL L-V`, 165 bloques de plantilla y 165 bloques generados desde esa plantilla para 2026-05-04 a 2026-05-08.
- Purga S.1 verificada localmente como funcion: `authenticated` y `anon` no pueden ejecutarla, `postgres` si. `pg_cron`/`cron.job` no estan instalados localmente y el job real no queda activado porque falta acceso al scheduler/DB real.
- `npm run typecheck`, `npm run lint`, `npm run build`, `E2E_BASE_URL=http://127.0.0.1:3003 npm run test:smoke`, `npx supabase db lint --local`, `npx supabase migration list --local` pasan.
- `rg -n "STL" src`, `rg -n "service_role" src` y `rg -n "navigator\.geolocation" src` quedan sin coincidencias.

Resultado: bloqueos restantes. El piloto STL no queda desbloqueado.

Minimo necesario para el siguiente intento:

- project ref y acceso administrativo al Supabase real/staging, o acceso equivalente al dashboard, para verificar Auth Site URL, Redirect URLs, politica de password y Custom SMTP;
- acceso DB/scheduler real u operador DB para ejecutar el job de `purge_expired_operational_audit_events(1000)` y registrar primer resultado/alerta;
- remitente Resend verificado o confirmacion explicita de prueba limitada con `onboarding@resend.dev` y destinatario permitido;
- email interno controlado y credenciales E2E/admin/owner fuera del repo para ejecutar invitacion, aceptacion en `/invite/accept`, validacion de vinculaciones y reset hacia `/reset-password`.

## 13. S.8/A.1 - Cierre de realidad operativa para beta interna

S.8/A.1 no sustituye este runbook: lo toma como preflight y lo eleva a checklist de beta interna controlada en `docs/operations/beta-operational-readiness-runbook.md`.

Estado esperado:

- si faltan acceso Supabase real/staging, email interno permitido, remitente permitido, credenciales E2E por rol o job/fallback de purga: `bloqueado`;
- si invitacion, aceptacion, reset, smokes por rol, datos reales validados y evidencia minima pasan: `listo para beta interna`;
- aunque beta interna pase, produccion sigue `no apta` hasta hardening/ASVS/backups/observabilidad y revision legal/privacidad de datos sensibles.

S.8/A.1 sigue sin abrir IA, app nativa, geofencing, payroll, documentos firmables, subida documental visible, service worker, push, caches privadas, migraciones ni UI funcional nueva.

## 12. Resultado S.7 2026-05-13

- Continuacion pre-piloto ejecutada sin abrir modulos nuevos, sin UI nueva, sin lectura real de ubicacion, sin geofencing, sin documentos firmables, sin payroll, sin ausencias, sin IA y sin app movil.
- `PROJECT_BRIEF.md` y `docs/product/roadmap.md` quedan reconciliados con `TASKS.md`/`docs/architecture/domain-model.md`: G.3/G.4 existen como base tecnica interna de schema/RPC/RLS y helpers server-side, pero no activan ubicacion real ni superficie visible.
- `git status --short --branch`, `git diff --stat` y `git diff --name-status` revisados; `main` sigue 2 commits por delante de `origin/main`, el worktree sigue amplio/sucio y no se revierte nada ajeno.
- `.env.local` sigue ignorado/no trackeado; `git ls-files .env.local` no devuelve nada.
- `rg -n "STL" src`, `rg -n "service_role" src` y `rg -n "navigator\.geolocation" src` quedan sin coincidencias.
- Revision enmascarada de secretos en archivos trackeables/untracked no ignorados sin hallazgos reales de API key Resend, token Supabase, JWT, private key, URL DB con password ni asignacion de `SUPABASE_SERVICE_ROLE_KEY`.
- `.env.local` contiene variables locales necesarias para desarrollo y Resend, sin imprimir valores; `NEXT_PUBLIC_SITE_URL` y `NEXT_PUBLIC_SUPABASE_URL` clasifican como locales, y el remitente clasifica como `resend.dev`.
- No hay variables de proceso ni `.env.local` con `SUPABASE_ACCESS_TOKEN`, project ref, DB URL real, credenciales E2E/admin/owner/coach/manager, email controlado ni `SUPABASE_SERVICE_ROLE_KEY`.
- `npx supabase projects list --output json` no tiene acceso a proyectos desde este entorno; Supabase Auth real, Site URL, Redirect URLs, password policy y Custom SMTP siguen sin poder verificarse.
- Resend API autentica con la key local sin imprimir valores; la cuenta consultada devuelve 0 dominios visibles y 0 dominios verificados. El remitente local queda en `resend.dev`.
- No se ejecutan invitacion real, aceptacion en `/invite/accept` ni reset hacia `/reset-password` por falta de acceso Supabase real/staging, remitente permitido, email interno controlado y credenciales E2E/admin/owner.
- No se activa job real de `purge_expired_operational_audit_events(1000)` por falta de acceso DB/scheduler real u operador DB. La activacion sigue pendiente mediante `supabase/snippets/activate-operational-audit-purge-job.sql` o job equivalente fuera de UI/Server Action.
- `npm run typecheck`, `npm run lint` y `npm run build` pasan.
- `E2E_BASE_URL=http://127.0.0.1:3003 npm run test:smoke` falla primero por `ECONNREFUSED` al no haber servidor local en ese puerto; se arranca `npm run dev -- --hostname 127.0.0.1 --port 3003`, se repite y pasa con 23 passed y 9 skipped por credenciales E2E no exportadas. El servidor temporal se detiene al final.
- `npx supabase db lint --local` pasa sin errores de schema.
- `npx supabase migration list --local` muestra 00001-00024 aplicadas localmente.
- `supabase/snippets/operational-audit-rls-verification.sql` pasa con rollback.

Resultado: documentacion consolidada y verificacion local verde. El piloto STL no queda desbloqueado.

Minimo necesario para el siguiente intento:

- project ref y acceso administrativo al Supabase real/staging, o acceso equivalente al dashboard, para verificar Auth Site URL, Redirect URLs, politica de password y Custom SMTP;
- acceso DB/scheduler real u operador DB para ejecutar el job de `purge_expired_operational_audit_events(1000)` y registrar primer resultado/alerta;
- remitente Resend verificado o confirmacion explicita de prueba limitada con `onboarding@resend.dev` y destinatario permitido;
- email interno controlado y credenciales E2E/admin/owner fuera del repo para ejecutar invitacion, aceptacion en `/invite/accept`, validacion de vinculaciones y reset hacia `/reset-password`.
