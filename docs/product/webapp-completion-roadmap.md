# Roadmap De Cierre - Webapp Completa

Este documento traduce el roadmap largo de BoxOps a un mapa de cierre: que falta para considerar la webapp lista para beta operativa, que falta para una v1 vendible y que queda como futuro opcional.

`docs/product/roadmap.md` sigue siendo la vista principal de fases A-I y `TASKS.md` sigue siendo el backlog ejecutable. Este archivo no abre codigo, migraciones ni UI; solo ordena prioridades y dependencias para no confundir "todo BoxOps" con "webapp lista".

## Decision Principal 2026-05-17

La IA va al final. Es un extra futuro que puede ayudar a vender BoxOps mas adelante, pero no es relevante para cerrar la webapp operativa.

Antes de cualquier IA funcional deben estar resueltos como minimo:

- documentos y versiones como fuentes canonicas;
- permisos reales por `document_access_grants`;
- auditoria documental minimizada;
- programacion documental util y validada;
- privacidad/legal de prompts, respuestas, retencion y proveedor;
- aislamiento estricto de tenant;
- una webapp ya vendible sin depender de IA.

IA no forma parte de beta ni de v1 inicial. Tampoco debe tomar decisiones automaticas sobre cobertura, cambios, ausencias, fichaje, horas extra, payroll ni datos sensibles.

## Definiciones De Cierre

Beta operativa interna: BoxOps puede usarse con un tenant real controlado para validar el trabajo diario, con datos revisados, entorno real configurado, permisos seguros, smokes suficientes y runbooks claros. Puede tener modulos incompletos si estan bloqueados visualmente o marcados como futuros.

Webapp v1 vendible: BoxOps puede venderse como SaaS web a un box con una o varias sedes, cubriendo operativa diaria, configuracion basica, usuarios, horario, cobertura, cambios, ausencias, eventos, fichaje web, documentos/firma inicial cuando aplique, exportes necesarios, onboarding y soporte operativo. No exige app nativa, geofencing avanzado, payroll completo, CRM de alumnos ni IA.

Futuro opcional: capacidades que pueden mejorar venta o diferenciacion despues de v1, como app nativa, push nativo, geofencing real, integraciones avanzadas, billing sofisticado, validacion automatica de certificaciones o IA sobre programacion.

## Estado Actual Resumido

| Area | Estado | Lo que falta para cierre |
|---|---|---|
| Horario, bloques, plantillas y cobertura | Muy avanzado | Validacion oficial con datos reales, deuda UX menor y criterio final de piloto. |
| Tenant, roles y configuracion | Parcialmente avanzado | B.4 deja checklist de tenant readiness; faltan logo/asset privado si se decide, colores por centro si aportan valor, permisos por centro con fase propia y onboarding guiado. |
| Auth, email e invitaciones | Implementado tecnicamente; Equipo tambien tiene creacion directa de cuenta con contrasena temporal y reset obligatorio en primer login | Configuracion real de Supabase/Auth/SMTP, remitente verificado, `SUPABASE_SERVICE_ROLE_KEY` server-only, prueba completa de invitacion/aceptacion/reset, prueba de creacion directa/reset obligatorio y credenciales E2E. |
| Area personal, avatar y firma propia | Avanzado | Validacion QA real y posterior conexion con documentos firmables. |
| Cambios y cobertura entre coaches | Workflow minimo avanzado | Completar experiencia si el piloto exige swap, candidatos mas ricos o automatismos de expiracion controlados. |
| Ausencias | Bandeja y creacion propia avanzadas | Calendario, saldos/reglas si aplican, creacion gestionada para otra persona y cierre legal/privacidad. |
| Eventos y festivos | Contexto minimo visible | Calendario avanzado, respuestas/asistencia y turnos especiales explicitos cuando el negocio lo pida. |
| Fichaje web | Muy avanzado; F.15 documenta readiness beta interna | Validacion real/staging, cierre legal/produccion, retencion 4 anos si aplica, acceso trabajador/inspeccion, exportes finales y runbook de incidencias. |
| Horas extra | Candidato operativo revisable | Cierre mensual/exporte interno y decision legal antes de llamarlo aprobacion real o payroll. |
| Operativa diaria beta | Documentada en OD.1/I.32 | Validacion real/staging por rol, evidencia y cierre de deuda bloqueante antes de beta interna real. |
| Documentos | Primer repositorio visible minimo abierto en E.11, QA/staging controlado preparado en E.12, evidencia local/bloqueo staging cerrado en E.13, reintento E.14 bloqueado por falta de acceso real/archivo Storage controlado, E.15 actualizado con relectura de entorno redacted y E.16 cerrado como handoff operativo controlado | Ejecutar validacion real/staging con operador autorizado, datos controlados y archivo Storage controlado; despues subida controlada, gestion de grants desde UI, auditoria visible, documentos firmables y certificaciones. |
| Produccion SaaS | Parcial | Console de plataforma, soporte auditado, catalogo founder versionado, billing owner manual y enforcement inicial de centros ya existen; faltan ASVS, headers/CSP, secretos, backups, observabilidad, purgas, onboarding y Stripe real. |
| App nativa/geofencing/push | Futuro | Decision comercial y legal especifica; no bloquea webapp v1. |
| IA | Ultimo extra futuro | Solo despues de documentos/programacion/permisos/auditoria/legal y webapp vendible. |

## Revision 2026-05-25 Para Publicacion Online

Estado actual: `bloqueado para user testing no tecnico`. La webapp ya tiene suficiente superficie funcional para preparar una prueba guiada, pero no conviene publicarla online hasta que el entorno y la evidencia automatizada queden cerrados.

Evidencia local:

- `npm run build` pasa.
- `npm run lint` pasa con el warning conocido de `scripts/setup-local-e2e-auth.mjs`.
- `npx supabase db lint --local` pasa.
- `git diff --check` no da errores, solo warnings LF/CRLF del worktree.
- Los guardrails `rg` no encuentran hardcode STL, `service_role`, IA, geolocalizacion, push, service worker ni caches privadas en `src`.
- `npm run typecheck -- --pretty false` falla en 3 specs de smoke.
- `npm run test:smoke` con servidor local ejecuta 247 tests y queda en 204 passed, 21 skipped, 5 not run y 17 failed.
- `npm audit --omit=dev --audit-level=high` reporta vulnerabilidades de produccion, incluidas 2 high.

Lectura de producto: el siguiente objetivo no es abrir mas features. Es cerrar un entorno online controlado, arreglar las regresiones/guardrails que rompen smoke/typecheck, resolver o aceptar explicitamente el audit de dependencias, cargar datos de prueba validados y preparar una guia simple para testers no tecnicos. Hasta entonces, el estado correcto sigue siendo `preparando beta`, no `listo para publicar`.

## Decision 2026-05-26 - Console SaaS Y Billing

BoxOps necesita una capa superior de operacion SaaS separada de la app diaria del tenant. Esa capa sera `BoxOps Console`: una superficie interna para que Henalu/Riptide pueda crear organizaciones, asignar owner/admin iniciales, ver centros/usuarios/estado comercial, revisar salud del tenant y abrir la app de un tenant en modo soporte auditado.

La Console no convierte automaticamente al operador de plataforma en `owner` de todos los tenants. Los roles de plataforma viven separados de `organization_memberships`, y cualquier acceso cross-tenant debe quedar auditado.

Billing se implementara por fases. Stripe queda como proveedor por defecto para suscripciones, Checkout/Customer Portal, facturas, tarjeta y SEPA Direct Debit. BoxOps no guardara tarjetas, IBAN completos ni datos bancarios sensibles: solo referencias del proveedor, plan, estado, limites y metadata comercial minimizada. GoCardless queda como alternativa futura si la domiciliacion SEPA domina el negocio y Stripe deja de encajar.

Actualizacion 2026-05-27: los primeros cortes tecnicos de Console ya cubren foundation, listado/detalle de organizaciones, creacion controlada de organizacion + owner inicial, suspension/reactivacion manual de acceso tenant y sesion de soporte auditada con motivo, expiracion, auditoria e indicador visible en `/app`. El modo soporte no crea memberships permanentes, no suplanta usuarios y no abre lectura de documentos, fichaje, payroll, firmas ni datos sensibles.

Actualizacion 2026-05-27: billing visible y catalogo comercial quedan abiertos sin cobro real. Existen `billing_plans`, `billing_plan_versions`, founder pricing versionable, snapshots en `organization_subscriptions`, `/console/plans`, cambio manual desde Console, `/app/settings/billing`, lectura para owner/admin, cambio manual por owner y enforcement inicial de `center_limit` al crear centros. Stripe real, Checkout, Customer Portal, webhooks, facturas, IVA y cobros siguen pendientes.

## Mapa De Cierre Recomendado

### 0. Cierre De Realidad Operativa

Objetivo: asegurar que lo ya construido funciona con datos y entorno reales antes de seguir abriendo producto.

Incluye:

- validacion oficial del primer tenant con una semana real revisada bloque a bloque;
- confirmacion de centros, coaches, roles, tipos, plantillas, huecos y casos de cobertura;
- entorno real/staging con Supabase Auth, Redirect URLs, SMTP/Resend y remitente verificado;
- `SUPABASE_SERVICE_ROLE_KEY` configurado solo en servidor para el flujo directo de creacion de cuenta, sin exposicion al cliente;
- credenciales E2E de `owner`, `admin`, `manager` y `coach`;
- job real o procedimiento aceptado de purga de auditoria operativa;
- smoke suite con rutas criticas autenticadas y anonimas;
- runbooks pre-QA, `docs/operations/beta-operational-readiness-runbook.md` y checklist de datos reales/evidencia.

Mapea a: Fase A, Carril S, Fase B.3 y validaciones operativas pendientes.

No incluye: nuevos modulos, IA, app nativa, payroll ni documentos firmables.

### 1. Base SaaS Y Permisos De Tenant

Objetivo: dejar BoxOps preparado para mas de un box sin convertir el primer tenant en caso especial.

Incluye:

- configuracion tenant usable y segura;
- logo/asset privado de organizacion;
- reglas de color por centro solo si aportan claridad operativa;
- permisos por centro si el piloto demuestra que `center_manager` es necesario;
- matriz final de roles/capacidades para `owner`, `admin`, `manager`, `coach` y roles especializados;
- onboarding de un nuevo box con datos minimos, centros, usuarios y tipos de actividad;
- revision de que no hay hardcode de tenant ni copy especifico del primer cliente en `src`.
- checklist B.4 en `docs/operations/tenant-readiness-checklist.md` para distinguir beta interna de v1 comercial.

Mapea a: Fase B, `docs/architecture/personal-data-permissions.md`, `docs/product/theming.md` y backlog de permisos por centro.

### 2. Operativa Diaria Completa

Objetivo: que owner/admin/manager y coach puedan resolver el dia a dia del box desde la webapp.

Incluye:

- horario semanal, plantillas, asignaciones y cobertura con deuda UX cerrada;
- solicitudes de cambio/cobertura con bandeja, creacion, respuesta, aprobacion/aplicacion y trazabilidad;
- ausencias con solicitud propia, revision, impacto sobre cobertura y calendario si se confirma necesario;
- eventos/festivos/competiciones con contexto suficiente y, si procede, bloques especiales creados explicitamente;
- jornada prevista como contexto operativo, sin confundirse con fichaje o payroll;
- dashboard/Inicio orientado por rol con acciones reales, no entradas administrativas irrelevantes;
- smokes por rol para las rutas diarias;
- runbook OD.1/I.32 en `docs/operations/daily-operations-beta-readiness-runbook.md` para separar flujos listos, validacion real/staging, bloqueos, deuda menor, deuda bloqueante y evidencia.

Mapea a: Fase A, Fase I, cierre transversal UX y Fase Diseno/UI.

No incluye: decisiones automaticas de cobertura, ranking inteligente, payroll, automatismos legales ni IA.

### 3. Fichaje Web Y Cierre Laboral Prudente

Objetivo: que el fichaje web sea util y defendible operativamente antes de prometer cumplimiento legal completo.

Incluye:

- fichaje manual propio y automatico por planificacion;
- correcciones propias y revision/aprobacion;
- cierre semanal firmado y reenvio tras rechazo/correccion;
- exporte interno revisable y acceso propio a registros;
- checklist F.15 en `docs/operations/time-tracking-beta-readiness-runbook.md`: flujos listos, validacion real/staging, bloqueos, roles, smokes, evidencia y deuda;
- politica de retencion, acceso trabajador/representantes/inspeccion si aplica y runbook de incidencias;
- revision legal antes de usar datos reales como cumplimiento laboral definitivo.

Mapea a: Fase F, `docs/operations/time-tracking-beta-readiness-runbook.md` y `docs/operations/legal-and-privacy-notes.md`.

No incluye: geolocalizacion web, `navigator.geolocation`, payroll, importes, compensaciones, aprobacion legal automatica de horas extra, nominas, app nativa, documentos firmables ni IA.

### 4. Documentos, Firma Documental Y Certificaciones

Objetivo: convertir la foundation documental segura en un modulo visible util sin romper permisos ni privacidad.

Incluye:

- E.11 como repositorio documental visible minimo en `/app/documents`: solo lectura, versiones accesibles por grants/sujetos/capacidades, excluyendo `sensitive_hr`, payroll y firmables, con preview/descarga por rutas E.5;
- E.12 como validacion QA/staging controlada del repositorio minimo: grant de descarga, solo metadata, sin grant, cross-tenant, documentos `programming`/`company` visibles, exclusiones sensibles y evidencia de auditoria cuando haya archivo controlado;
- E.13 como cierre de evidencia: ejecucion local con rollback, bloqueo QA/staging documentado si faltan accesos reales, y plantilla redacted antes de usar documentos reales;
- E.14 como reintento de validacion QA/staging real con archivo Storage controlado: ejecutar solo si hay acceso real; si faltan project/ref, DB URL, credenciales/casos QA u objeto `document-files`, dejar bloqueo exacto sin inventar evidencia;
- E.15 como desbloqueo controlado actualizado: releer entorno sin secretos, confirmar acceso real o bloqueo, reejecutar SQL local con rollback si es el unico acceso disponible y mantener fuera del repo cualquier evidencia real;
- E.16 como handoff operativo controlado: variables/capacidades necesarias sin valores, casos QA requeridos, checklist de operador, evidencia esperada y criterios de pass/bloqueado para desbloquear QA/staging real;
- repositorio documental completo por areas: empresa/equipo, gestion, persona propia y sujetos autorizados;
- subida controlada desde backend/UI solo cuando Storage, grants, auditoria y tests negativos esten cerrados;
- gestion visible de grants/capacidades por documento o grupo de documentos;
- auditoria visible solo para roles/capacidades autorizados;
- documentos firmables con snapshot/version de firma, evidencia inmutable y bloqueo de firma por delegacion;
- certificaciones de coaches con adjuntos, caducidad y relacion futura con tipos de actividad;
- programacion documental asociada a horario mantenida como consulta autorizada, no como IA.

Mapea a: Fase D.5, Fase E, E.6/I.27-E.10/I.31 y matriz de permisos personales.

No incluye: IA, resumen automatico, RAG, embeddings, documentos sensibles sin gates, payroll ni subida visible improvisada.

### 5. Hardening De Beta Y Produccion

Objetivo: que la webapp pueda exponerse a usuarios reales con riesgos conocidos y procedimientos claros.

Incluye:

- revision ASVS Level 1 y registro de desviaciones aceptadas;
- secretos, dependencias, lockfile, headers, CSP viable, cookies y HTTPS revisados;
- backups, PITR/recuperacion, control de acceso a Supabase, purgas y retenciones;
- observabilidad minima: errores, logs operativos, eventos criticos y alertas de jobs;
- smokes autenticados por rol y pruebas negativas de tenant/permisos para superficies criticas;
- accesibilidad/responsive/theming sobre rutas principales;
- guias de usuario/admin y runbooks de operacion.

Mapea a: Carril S, guias, operaciones y criterios transversales de UX.

### 6. Comercializacion SaaS Web

Objetivo: poder vender y operar BoxOps para mas de un box con friccion razonable.

Incluye:

- Console interna de plataforma para crear tenants, owner/admin iniciales, revisar organizaciones, centros, usuarios, plan, limites, estado y salud;
- roles de plataforma separados de roles del tenant, por ejemplo `platform_owner`, `support`, `billing` y `viewer`;
- sesiones de soporte auditadas para abrir la app de un tenant sin hacerse miembro permanente de esa organizacion;
- catalogo founder versionado con planes publicados, borradores, archivado, precios en centimos EUR y snapshots por organizacion;
- suscripcion por organizacion con plan, version, estado, limites de centros/staff, future clients, storage placeholder y referencias seguras de proveedor;
- pantalla de billing para `owner` en `/app/settings/billing`, con plan actual, uso, planes disponibles y cambio manual mientras no haya Stripe;
- Stripe como proveedor futuro para Checkout, Customer Portal, facturas, webhooks y SEPA/tarjeta;
- onboarding de nuevo box;
- importacion o carga guiada de centros, usuarios, tipos, plantillas y primera semana;
- exportes CSV/PDF necesarios para operacion;
- soporte/administracion interna y proceso de incidencias;
- documentacion comercial y de limites: que cubre la webapp y que queda fuera.

Mapea a: `docs/architecture/tenancy-and-billing.md` y Backlog Futuro.

Primeros cortes recomendados:

1. Ya abierto: foundation manual de plataforma con `platform_admins`, `organization_subscriptions`, `platform_support_sessions` y `platform_audit_events`, sin pago real.
2. Ya abierto: Console interna minima con listado/detalle de organizaciones, contadores, estado de plan, creacion controlada de organizacion + owner inicial, control manual de acceso y soporte auditado.
3. Ya abierto: planes founder versionados, `/console/plans`, snapshots en suscripcion, `/app/settings/billing`, cambio manual y enforcement inicial de `center_limit`; todavia sin almacenar datos bancarios ni cobrar.
4. Siguiente corte recomendado: Stripe real con Checkout/Customer Portal, webhooks idempotentes, sincronizacion de suscripcion y facturas, manteniendo datos bancarios fuera de BoxOps.

### 7. Nativo, Push Y Geofencing Si El Negocio Lo Exige

Objetivo: abrir capacidades moviles solo si aportan valor comercial claro y pueden hacerse con privacidad adecuada.

Incluye:

- decision de stack nativo/wrapper;
- APNs/FCM, opt-in y fallback in-app;
- geofencing/background location con disclosure, retencion y evidencias minimizadas;
- pruebas por dispositivo/plataforma y revision de politicas de stores.

Mapea a: Fase G y Fase H.

No bloquea: webapp v1.

### 8. IA Como Ultimo Extra Futuro

Objetivo: anadir valor sobre programacion/documentos cuando el producto base ya sea solido.

Prerequisitos:

- repositorio documental visible y seguro;
- documentos de programacion reales versionados y autorizados;
- grants/auditoria documentales probados;
- politica de proveedor, prompts, respuestas, retencion, coste y aislamiento de tenant;
- criterios legales/privacidad cerrados;
- guardrails contra datos sensibles, decisiones automaticas y uso cross-tenant.

Casos candidatos:

- busqueda o consulta asistida sobre programacion autorizada;
- resumen de material, escalados o notas de documentos que el usuario ya puede ver;
- ayuda administrativa para localizar version/documento correcto;
- explicaciones con fuentes, no respuestas sin trazabilidad.

Fuera de alcance incluso en IA futura:

- decidir cobertura, aprobar cambios, aprobar ausencias, cerrar fichajes, validar horas extra, generar nominas o inferir informacion sensible;
- entrenar o fine-tunear con datos privados sin decision explicita;
- saltarse `document_access_grants`, RLS o auditoria.

## Orden Recomendado De Siguientes Cortes

1. Completar este mapa en `docs/product/roadmap.md`, `TASKS.md` y `PROJECT_BRIEF.md`.
2. Ejecutar S.8/A.1 con `docs/operations/beta-operational-readiness-runbook.md`: entorno real/staging, Auth/email, purga, credenciales E2E, validacion oficial de datos y evidencia minima.
3. Ejecutar B.4 con `docs/operations/tenant-readiness-checklist.md`: configuracion multi-tenant, roles/capacidades, limites de `center_manager`, logo privado futuro, colores por centro opcionales y onboarding de nuevo box.
4. Rematar operativa diaria con OD.1/I.32: cambios/cobertura, ausencias, eventos, jornada prevista, Inicio y smokes por rol, sin automatismos sensibles.
5. Cerrar fichaje web con F.15: ejecutar `docs/operations/time-tracking-beta-readiness-runbook.md` en local/staging/real segun corresponda, sin geofencing, payroll, app nativa, documentos firmables ni IA.
6. Cerrar E.16 y ampliar modulo documental de forma gradual solo cuando haya evidencia local/staging redacted, datos/grants controlados y preview/descarga por E.5 con archivo seguro; despues subida controlada, grants UI, auditoria y firma documental.
7. Ejecutar hardening beta/produccion y onboarding SaaS.
8. Evaluar nativo/geofencing/push si hay razon comercial.
9. Evaluar IA al final, solo como extra sobre una base documental y operativa ya madura.
