# Beta Operational Readiness Runbook - BoxOps

Estado 2026-05-18. Este runbook documenta S.8 / A.1: cierre de realidad operativa para beta interna controlada. Es una fase operativa/pre-beta, no desarrollo funcional nuevo.

No abre IA, app nativa, geofencing, payroll, documentos firmables, subida documental visible, service worker, push, caches privadas, nuevas migraciones ni nuevas rutas/UI. Tampoco desbloquea por si solo el piloto con el primer tenant: deja claro que falta comprobar en entorno real/staging antes de invitar usuarios reales.

## Objetivo

Validar que la webapp ya construida puede usarse con un tenant real controlado sin depender de supuestos locales:

- datos reales del primer tenant revisados oficialmente;
- entorno real/staging accesible y configurado;
- Auth/email funcionando con remitente permitido;
- credenciales E2E por rol;
- invitacion, aceptacion y reset reales probados de forma controlada;
- purga de auditoria operativa ejecutable en entorno real o fallback temporal aprobado;
- smoke suite minima anonima y autenticada;
- evidencia guardada fuera del repo cuando contenga datos reales o secretos.

## Fuentes

- `PROJECT_BRIEF.md`
- `TASKS.md`, Carril S, S.2-S.7 y S.8
- `docs/product/webapp-completion-roadmap.md`, bloque 0
- `docs/product/roadmap.md`, Mapa de cierre
- `docs/operations/pre-qa-controlled-pilot-runbook.md`
- `docs/operations/daily-operations-beta-readiness-runbook.md`
- `docs/architecture/security-baseline.md`
- `docs/operations/legal-and-privacy-notes.md`

## Relacion Con OD.1/I.32

S.8/A.1 valida realidad operativa general antes de beta interna: datos reales, entorno, Auth/email, purga, credenciales E2E y evidencia. OD.1/I.32, en `docs/operations/daily-operations-beta-readiness-runbook.md`, baja ese gate a la operativa diaria: Horario, Plantillas, Asignaciones, Cobertura, Solicitudes, Ausencias, Eventos, Jornada prevista, Inicio por rol y smokes diarios.

Para considerar beta interna lista, S.8/A.1 y B.4 no bastan si los flujos diarios quedan sin validar. OD.1/I.32 debe quedar como evidencia complementaria de que cobertura, ausencias, eventos y jornada prevista son contexto operativo y no decisiones automaticas ni resolucion automatica de cobertura.

## Relacion Con F.15

F.15, en `docs/operations/time-tracking-beta-readiness-runbook.md`, baja este gate al fichaje web: entrada/salida manual, vista semanal, correcciones, automatico por planificacion, cierre semanal, aprobacion firmada interna, rechazo con nota, avisos en Inicio, CSV interno revisable y candidatos de posible exceso como revision operativa.

Si fichaje entra en la beta interna, S.8/A.1 y OD.1/I.32 tampoco bastan sin F.15. El cierre de fichaje debe mantener claro que la webapp no pide ubicacion, el automatico por planificacion no prueba presencia real, jornada prevista no es fichaje/payroll, aprobar una semana firmada es confirmacion interna, los candidatos de posible exceso no son horas extra aprobadas y el CSV no es exporte legal definitivo.

## Que Puede Validarse Localmente

Estas comprobaciones no desbloquean beta interna, pero evitan llegar al entorno real con deuda basica:

- `git status --short --branch` revisado sin revertir cambios ajenos.
- `.env.local` ignorado y no trackeado.
- `.env.example` sin secretos reales.
- `rg -n "STL" src` sin coincidencias.
- `rg -n "service_role" src` sin coincidencias.
- `rg -n "OpenAI|openai|anthropic|embeddings|vector|pgvector|ai_" src` sin nuevas coincidencias.
- `rg -n "navigator\.geolocation|serviceWorker|service worker|PushManager|Notification|background sync|caches\.|CacheStorage" src` sin nuevas coincidencias.
- smoke anonimo de rutas protegidas hacia `/login`.
- smoke autenticado solo si existen credenciales E2E locales/QA exportadas fuera del repo.
- verificacion local de `operational-audit-rls-verification.sql` con rollback.
- revision documental de que no se abren IA, nativo, geofencing, payroll, documentos firmables, subida visible ni UI funcional nueva.

No usar datos reales adicionales en local salvo fixture controlado ya aprobado. Si se copia una muestra real para revisar estructura, debe anonimizarse o mantenerse fuera del repo y con aprobacion explicita.

## Revision Operativa 2026-05-18

Resultado: `bloqueado por acceso/entorno`. Se releyo el entorno sin imprimir secretos ni valores y no se encontro acceso real suficiente para ejecutar validaciones staging ni smokes autenticados por rol.

Hallazgos redacted:

- `.env.local` existe, esta ignorado por git y no esta trackeado.
- `NEXT_PUBLIC_SITE_URL` y `NEXT_PUBLIC_SUPABASE_URL` clasifican como `local_loopback`; no hay URL de app QA/staging en `E2E_BASE_URL`, `QA_APP_URL`, `STAGING_APP_URL`, `APP_QA_URL`, `APP_STAGING_URL` ni `VERCEL_URL`.
- No hay `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_URL`, `DATABASE_URL` ni `POSTGRES_URL` en `.env.local` o proceso; `SUPABASE_SERVICE_ROLE_KEY` tampoco esta presente.
- No hay Supabase CLI global; `npx supabase` esta disponible como dependencia, pero `npx supabase projects list --output json` no devuelve acceso a proyectos desde este entorno.
- Supabase local esta disponible, pero no sustituye acceso QA/staging ni permite verificar Auth Site URL, Redirect URLs, password policy, Custom SMTP, scheduler real o datos reales controlados.
- No hay credenciales E2E completas para `owner`, `admin`, `manager` ni `coach`; tampoco hay `E2E_ORGANIZATION_ID` ni `E2E_WEEK`.
- No hay `QA_TENANT_ID`, `QA_ORGANIZATION_ID`, `STAGING_TENANT_ID`, `STAGING_ORGANIZATION_ID`, `QA_DATASET` ni `STAGING_DATASET`.
- `RESEND_API_KEY`, `BOXOPS_EMAIL_FROM` y `BOXOPS_EMAIL_REPLY_TO` estan presentes localmente; la API de Resend responde, pero no hay dominios verificados visibles y el remitente clasifica como `resend_dev_sender`.
- No hay variables SMTP reales (`SMTP_*` o `SUPABASE_SMTP_*`) disponibles desde este entorno.
- No hay email interno controlado, invitacion real, aceptacion `/invite/accept`, reset real, job/fallback real de purga ni evidencia staging.

No se repite otro corte documental ni validacion local del repositorio documental: E.18 ya confirmo que no hay acceso real completo a QA/staging para `/app/documents`, preview/download E.5 ni auditoria backend real.

## Que Requiere Acceso Real O Staging

Estas comprobaciones son obligatorias para beta interna real:

- Supabase real/staging accesible por dashboard o CLI con project ref y permisos adecuados.
- Auth Site URL igual al origen publico del entorno.
- Redirect URLs exactas para `/auth/callback` en cada origen usado.
- Password policy real alineada con la app: minimo 8 caracteres, al menos una letra y un numero.
- Custom SMTP de Supabase Auth activo si el entorno envia resets, confirmaciones o magic links reales.
- Resend/SMTP con API key real guardada solo en el entorno.
- `BOXOPS_EMAIL_FROM` con dominio o remitente verificado; si se usa `onboarding@resend.dev`, limitar la prueba a destinatarios permitidos.
- `BOXOPS_EMAIL_REPLY_TO` controlado por el operador si se esperan respuestas.
- Email interno controlado aprobado para la prueba.
- Credenciales E2E fuera del repo para `owner`, `admin`, `manager` y `coach`.
- Job real o scheduler equivalente para `select public.purge_expired_operational_audit_events(1000);`, o fallback manual temporal registrado.
- URL publica real/staging en `NEXT_PUBLIC_SITE_URL` sin slash final.

## Datos Reales Del Primer Tenant

Antes de beta interna, una persona responsable del tenant debe validar oficialmente una semana real:

- centros por bloque;
- fecha, hora inicio, hora fin y zona horaria;
- tipo de actividad/clase;
- si el bloque es clase, recepcion, open box, evento, competicion u otra operativa;
- coaches necesarios;
- coach asignado si existe;
- huecos intencionados;
- coaches que trabajan en varios centros;
- roles iniciales: `owner`, `admin`, `manager`, `coach`;
- casos conocidos de cobertura: sin cubrir, insuficiente, simultaneidad normal y solapes imposibles;
- plantillas que deben usarse como base, si aplica.

Criterio de salida: evidencia firmada o aprobada por el responsable operativo, guardada fuera del repo si contiene datos reales identificables. No convertir esta semana en seed de produccion sin revision separada.

## Auth, Email E Invitaciones

Secuencia controlada:

1. Confirmar Site URL, Redirect URLs, SMTP y password policy en Supabase real/staging.
2. Confirmar remitente Resend/SMTP verificado o destinatario permitido si se usa `resend.dev`.
3. Exportar credenciales E2E/admin/owner/manager/coach fuera del repo.
4. Crear una invitacion real hacia el email interno controlado desde el flujo existente de equipo.
5. Abrir el enlace recibido y verificar que apunta a `/invite/accept`.
6. Aceptar con cuenta Auth del mismo email.
7. Verificar vinculacion de `team_invitations`, `organization_memberships`, `person_profiles` y `coach_profiles`.
8. Ejecutar reset password real controlado hacia `/auth/callback?next=/reset-password`.
9. Confirmar que el reset no enumera emails y que la nueva contrasena respeta la policy real.
10. Revocar o resetear credenciales temporales usadas en la prueba si ya no hacen falta.

Queda bloqueado si falta email interno permitido, remitente permitido, acceso a Supabase Auth real/staging o credenciales por rol.

## Credenciales E2E Por Rol

Minimo recomendado para smoke autenticado:

| Rol | Uso en smoke | Requisitos |
|---|---|---|
| `owner` | configuracion global, accesos y lectura admin amplia | usuario Auth real/staging, membership activa, password fuera del repo |
| `admin` | equipo, centros, tipos, horario, plantillas, cobertura | usuario Auth real/staging, membership activa, password fuera del repo |
| `manager` | operativa diaria sin configuracion global sensible | usuario Auth real/staging, membership activa, password fuera del repo |
| `coach` | experiencia personal, horario propio, solicitudes y lectura permitida | usuario Auth real/staging, membership activa, coach/persona vinculada |

Las credenciales deben guardarse en gestor de secretos, variables de CI/staging o mecanismo equivalente. No se pegan en `.env.example`, docs, issues, screenshots, snippets ni logs.

## Purga De Auditoria Operativa

Opcion preferente: job DB/scheduler real que ejecute:

```sql
select public.purge_expired_operational_audit_events(1000);
```

Requisitos:

- ejecutado con usuario operativo/propietario de DB, no desde UI ni Server Action;
- batch acotado;
- alerta o registro de fallo;
- primer resultado guardado como evidencia;
- confirmar que `authenticated` y `anon` no pueden ejecutar la funcion.

Fallback temporal aceptable solo para beta interna:

- ejecucion manual por operador autorizado desde SQL Editor o consola DB;
- registro de fecha, entorno, operador, SQL exacta y resultado;
- fecha limite para sustituirlo por job real;
- no presentar beta como apta para produccion mientras siga el fallback.

## Smoke Suite Minima

Anonima:

- `/login` carga como superficie publica.
- `/app` redirige a `/login`.
- rutas criticas protegidas redirigen a `/login`: dashboard, horario, cobertura, equipo, centros, tipos, plantillas, fichaje, solicitudes y ausencias si existen.

Autenticada:

- `owner`: accede a Inicio, Configuracion, Equipo y rutas administrativas esperadas.
- `admin`: crea o revisa un dato operativo controlado solo si la prueba lo permite; si no, lectura smoke.
- `manager`: accede a operativa diaria y no accede a configuracion global sensible.
- `coach`: accede a su horario/cuenta/fichaje personal y no ve acciones administrativas.
- flujo de invitacion aceptada y reset controlado, si el entorno/email lo permite.

Si faltan credenciales E2E, los tests autenticados pueden quedar skipped, pero ese estado bloquea beta interna real.

## Evidencia Minima

Guardar evidencia en una ubicacion interna fuera del repo cuando incluya datos reales:

- fecha y entorno validado;
- URL real/staging usada;
- responsable operativo que valida datos reales;
- checklist de datos del primer tenant;
- captura o exporte redacted de Auth Site URL y Redirect URLs;
- captura o nota redacted de password policy;
- captura o nota redacted de SMTP/Resend/remitente permitido;
- resultado de invitacion real controlada;
- resultado de aceptacion en `/invite/accept`;
- resultado de reset password real;
- lista de roles E2E disponibles, sin passwords;
- resultado de smoke anonimo/autenticado;
- resultado de OD.1/I.32 para operativa diaria por rol, si ya se ejecuta como parte de la beta;
- resultado de F.15 para fichaje web por rol, si fichaje entra en la beta;
- resultado del job o fallback de purga;
- `git diff --check`;
- guardrails `rg` de STL, `service_role`, IA y APIs web prohibidas;
- decision final: bloqueado, listo para beta interna o no apto para produccion.

No guardar tokens, contrasenas, API keys, signed URLs, cookies, enlaces de invitacion/reset activos, documentos privados ni pantallazos con datos personales innecesarios.

## Criterios De Estado

### Bloqueado

S.8 queda bloqueado si ocurre cualquiera:

- no hay acceso Supabase real/staging o dashboard equivalente;
- Site URL, Redirect URLs, SMTP o password policy no se pueden verificar;
- no hay remitente Resend/SMTP verificado ni destinatario permitido;
- falta email interno controlado;
- faltan credenciales E2E para `owner`, `admin`, `manager` o `coach`;
- no se puede probar invitacion, aceptacion o reset reales;
- no hay job real ni fallback temporal registrado para purga de auditoria;
- smoke autenticado queda skipped por falta de credenciales;
- F.15 deja deuda bloqueante si fichaje entra en la beta;
- aparecen secretos, `service_role`, hardcode de tenant, IA funcional, geofencing web, service worker/push/cache privada, payroll, subida documental visible o documentos firmables en el diff.

### Listo Para Beta Interna

Puede considerarse listo para beta interna controlada cuando:

- datos reales del primer tenant estan revisados oficialmente;
- entorno real/staging tiene Auth, Redirect URLs, password policy, SMTP/Resend y `NEXT_PUBLIC_SITE_URL` correctos;
- email interno controlado funciona;
- invitacion, aceptacion y reset reales pasan;
- credenciales E2E por rol estan disponibles fuera del repo;
- smoke anonimo y autenticado pasan o sus skips estan justificados fuera del alcance de beta;
- purga de auditoria tiene job real o fallback temporal aprobado;
- evidencia minima queda guardada;
- no se abren modulos nuevos ni se amplian superficies fuera del cierre operativo.
- OD.1/I.32 no deja deuda bloqueante en operativa diaria o la deuda queda explicitamente fuera de beta.
- F.15 no deja deuda bloqueante en fichaje web si fichaje forma parte de la beta, o la deuda queda explicitamente fuera de beta.

### No Apto Para Produccion

Incluso si queda listo para beta interna, no es apto para produccion si:

- la purga de auditoria depende de fallback manual indefinido;
- no hay revision ASVS Level 1 ni desviaciones registradas;
- no hay estrategia de backups/PITR/recuperacion revisada;
- no hay observabilidad/alertas minimas para errores y jobs;
- faltan pruebas negativas criticas de tenant/RLS/permisos;
- se usan datos reales sensibles sin revision legal/privacidad;
- documentos, firmas, fichaje laboral definitivo, ubicacion, payroll o IA se presentan como cerrados sin sus gates propios.

## Que No Hacer Con Datos Reales Todavia

- No importar mas datos reales de los necesarios para la semana controlada.
- No subir documentos laborales reales desde UI.
- No crear documentos firmables ni pedir firmas documentales.
- No guardar nominas, importes, compensaciones, saldos o datos bancarios.
- No activar geolocalizacion web, `navigator.geolocation`, push, service worker, background sync ni caches privadas.
- No usar IA, embeddings, RAG, vector DB, prompts runtime ni proveedores externos para datos del tenant.
- No enviar invitaciones masivas.
- No usar enlaces activos de invitacion/reset como evidencia.
- No commitear datos reales, credenciales, tokens, screenshots sensibles ni snippets con identificadores personales innecesarios.

## Resultado Esperado De S.8

S.8/A.1 termina cuando este runbook queda referenciado desde `TASKS.md`, `PROJECT_BRIEF.md`, `docs/product/roadmap.md` y el mapa de cierre, y cuando el estado operativo se puede comunicar sin ambiguedad:

- si falta acceso real/staging, email o credenciales: `bloqueado`;
- si todo el checklist real pasa: `listo para beta interna`;
- si el checklist real pasa pero faltan hardening/ASVS/backups/observabilidad: `no apto para produccion`.
