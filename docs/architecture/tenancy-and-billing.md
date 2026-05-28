# Tenancy And Billing - BoxOps

## Decision Inicial

BoxOps debe empezar como un SaaS multi-tenant en un unico backend gestionado por Henalu/Riptide.

Cada cliente/box sera una `organization` dentro de la misma aplicacion y base de datos. La separacion se hace por:

- `organization_id` en todas las tablas operativas.
- RLS por membership.
- Configuracion/branding por tenant cuando haga falta.
- Dominios o subdominios por cliente si el producto lo requiere.

STL es el primer tenant, no un proyecto Supabase separado por defecto.

## Resolucion Tenant En Auth

Task 003 implementa la base de auth sin cambiar el schema.

Reglas actuales:

- Supabase Auth gestiona identidad.
- `public.organization_memberships` es la fuente de rol y pertenencia a tenant.
- La app MVP solo reconoce roles `admin` y `coach`.
- Una membership debe tener `status = 'active'`.
- Una organizacion debe estar en `trialing` o `active` para ser resoluble como organizacion activa.
- Si el usuario tiene una sola membership activa, esa organizacion puede resolverse como contexto activo.
- Si el usuario tiene mas de una membership activa, la organizacion debe recibirse de forma explicita, por ahora como `organizationId`.
- El proxy de Next.js 16 refresca sesion y protege rutas bajo `/app`, pero las comprobaciones de tenant viven en Server Components/utilidades server.

Esta decision evita hardcodear el primer tenant y deja preparado el futuro selector de organizacion sin adelantar UI de producto.

## Aplicacion Protegida Y Centros

Task 004 implementa la primera superficie protegida de producto sin cambiar el schema.

Reglas aplicadas:

- `/app` tiene un layout protegido minimo, pero no es la unica barrera de seguridad.
- Las paginas bajo `/app` resuelven organizacion activa en Server Components usando los helpers de auth/tenant.
- Las Server Actions de centros vuelven a resolver usuario, memberships, organizacion activa y rol antes de cualquier mutacion.
- `organization_memberships` sigue siendo la fuente de rol y tenant.
- Si hay varias memberships activas, la app exige `organizationId` explicito y lo conserva en la navegacion como query string.
- `admin` puede crear, editar y activar/desactivar centros.
- `coach` puede listar centros en modo lectura.
- No hay borrado de centros desde la UI; se prefiere `status = inactive` para preservar historial operativo futuro.

No se introduce selector global persistente de tenant todavia. La resolucion explicita por URL es suficiente para este slice y evita esconder una decision de organizacion hasta que existan mas superficies multi-tenant.

## Usuarios/Coaches Protegidos

Task 005 implementa `/app/coaches` sin cambiar el schema.

Reglas aplicadas:

- La pagina resuelve usuario, memberships y organizacion activa igual que `/app/centers`.
- Las Server Actions de usuarios/coaches vuelven a resolver usuario, memberships, organizacion activa y rol antes de mutar.
- Solo `admin` puede crear o editar memberships y `coach_profiles`.
- `coach` consulta en modo lectura.
- `organization_memberships` sigue siendo la fuente de rol y tenant.
- Las memberships se activan/desactivan cambiando `status`; no se borran desde UI.
- La propia membership del admin activo no se puede mutar desde esta pantalla para evitar perdida accidental de acceso.
- La UI usa `user_id` de Supabase Auth porque aun no existe tabla publica de identidad ni flujo de invitaciones.

## Tipos De Actividad Protegidos

Task 006 implementa `/app/class-types` sin cambiar el schema.

Reglas aplicadas:

- La pagina resuelve usuario, memberships y organizacion activa igual que `/app/centers` y `/app/coaches`.
- Las Server Actions de tipos vuelven a resolver usuario, memberships, organizacion activa y rol antes de mutar.
- Solo `admin` puede crear, editar y activar/desactivar tipos.
- `coach` consulta en modo lectura.
- `class_types` queda como catalogo por organizacion; no hay tipos globales compartidos entre tenants.
- Los tipos se activan/desactivan cambiando `status`; no se borran desde UI.
- No se añade relacion con centros en este corte.

## Bloques Operativos Semanales Protegidos

Task 007 implementa `/app/schedule` sin cambiar el schema.

Reglas aplicadas:

- La pagina resuelve usuario, memberships y organizacion activa igual que las superficies anteriores.
- La semana se recibe por query string como `week=YYYY-MM-DD` y se normaliza al lunes de esa semana.
- Las queries filtran `schedule_blocks` por `organization_id` y por rango de `service_date`.
- Las Server Actions de bloques vuelven a resolver usuario, memberships, organizacion activa y rol antes de mutar.
- Solo `admin` puede crear, editar o cancelar bloques.
- `coach` consulta bloques operativos en modo lectura.
- Cancelar un bloque cambia `status` a `cancelled`; no hay borrado desde UI.
- `schedule_block_assignments` quedo fuera de Task 007 y se expone despues en Task 010 para asignacion/cobertura basica.

## Asignaciones Y Cobertura Basica Protegidas

Task 010 implementa asignaciones en `/app/schedule` sin cambiar el schema.

Reglas aplicadas:

- `schedule_block_assignments` es la fuente canonica de asignacion coach-bloque real.
- La pagina lee asignaciones, coaches, perfiles visibles y memberships filtrando por `organization_id`.
- Las Server Actions de asignacion vuelven a resolver usuario, memberships, organizacion activa y rol antes de mutar.
- Solo `admin` puede asignar, reactivar o retirar asignaciones en este corte.
- `manager` queda documentado como rol operativo futuro para horarios/cobertura, pero no recibe permisos completos todavia.
- Asignar exige que bloque, `coach_profile`, `person_profile` si existe y assignment pertenezcan al mismo tenant.
- No se asignan coaches a bloques `cancelled` o `completed`.
- No se asignan `coach_profiles` inactivos ni `person_profiles` internos/inactivos.
- Si el coach tiene `user_id`, su membership debe estar `active`.
- Retirar cambia `assignment_status` a `removed`; no hay borrado desde UI.
- Si ya existe una fila `removed`, reasignar el mismo coach al mismo bloque la reactiva a `assigned`.
- La cobertura se calcula al vuelo; no existe tabla `coverage_issues` persistida en MVP 1.

## Perfiles Visibles Y Personas Operativas

Task 009 añade `person_profiles` y ajusta `coach_profiles` con una migracion nueva.

Reglas aplicadas:

- `person_profiles` siempre pertenece a una organizacion mediante `organization_id`.
- `person_profiles.user_id` es opcional para permitir personas operativas pendientes de Auth.
- Cuando `user_id` existe, debe corresponder a una membership del mismo tenant.
- Miembros activos del tenant pueden leer perfiles `visible`; perfiles `internal` quedan fuera de la lectura normal de equipo.
- `owner`/`admin` pueden gestionar perfiles del tenant.
- Una persona con `user_id` vinculado puede actualizar su perfil basico, pero no cambiar tenant, usuario, visibilidad, estado ni metadata.
- `coach_profiles.person_profile_id` permite capacidad operativa de coach antes de `auth.users`.
- `coach_profiles.user_id` se mantiene para compatibilidad con el flujo actual de `/app/coaches`.
- `manager` queda preparado como rol operativo futuro, pero esta tarea no le otorga permisos completos de administracion de perfiles.

## Por Que No Un Supabase Por Cliente Desde El Dia 1

Un proyecto Supabase por cliente aumenta:

- Coste fijo por cliente.
- Migraciones repetidas.
- Soporte y observabilidad.
- Backups y restauraciones por separado.
- Complejidad para lanzar features.

Para los primeros pilotos, el valor esta en validar producto y operativa, no en operar infraestructura aislada.

## Cuando Usar Un Proyecto Dedicado

Tiene sentido crear un Supabase dedicado para un cliente si:

- El contrato exige aislamiento fuerte de datos.
- Hay requisitos legales/compliance especificos.
- El cliente quiere pagar infraestructura propia.
- El volumen de datos o uso empieza a afectar a otros tenants.
- Hay una personalizacion grande que ya no encaja en el producto comun.
- El cliente es enterprise y paga por entorno dedicado.

## Quien Paga Supabase

Modelo recomendado:

1. Henalu/Riptide posee y opera la infraestructura principal.
2. El cliente paga una suscripcion de BoxOps que incluye software, hosting, mantenimiento y soporte basico.
3. Si un cliente necesita entorno dedicado, se factura como plan superior o setup + mantenimiento mensual.
4. Para clientes grandes, alternativa: el cliente posee su organizacion/proyecto Supabase y concede acceso tecnico. En ese caso se cobra implementacion y soporte, no se oculta coste infra.

## Plataforma Interna De Operacion

Decision 2026-05-26: BoxOps necesita una capa superior de operacion SaaS separada de la app de cada tenant.

Esa capa se tratara como `BoxOps Console` y debe vivir fuera de la experiencia diaria de `/app`. Puede empezar como `/console` en la misma aplicacion y evolucionar a subdominio propio si el producto lo requiere.

Principios:

- Un operador de plataforma no debe convertirse automaticamente en `owner` de todos los tenants.
- Los roles de tenant siguen viviendo en `organization_memberships`.
- Los roles de plataforma viven en una tabla separada, candidata `platform_admins`.
- Las acciones cross-tenant deben estar auditadas y minimizadas.
- Entrar en la app de un tenant desde Console debe crear una sesion de soporte auditada, candidata `platform_support_sessions`, y mostrar un indicador visible de modo soporte.
- El modo soporte no debe saltarse permisos sensibles por defecto: documentos sensibles, payroll, firmas, RRHH futuro o datos legales requieren capacidades explicitas.
- `SUPABASE_SERVICE_ROLE_KEY` no debe usarse en cliente ni como via normal para saltarse RLS desde Console.

Roles candidatos:

- `platform_owner`: control de plataforma, tenants, planes y soporte.
- `support`: soporte tecnico limitado y auditado.
- `billing`: gestion comercial/facturacion, sin acceso operativo completo por defecto.
- `viewer`: lectura interna de salud SaaS.

Tablas candidatas:

- `platform_admins`: usuarios Auth con rol de plataforma, estado y auditoria minima.
- `organization_subscriptions`: estado comercial de cada organizacion.
- `platform_support_sessions`: entradas auditadas desde Console hacia un tenant.
- `platform_audit_events`: auditoria de cambios y accesos de plataforma.

Primeras superficies candidatas:

- `/console`: listado de organizaciones con estado, plan, centros, usuarios activos, coaches y fecha de alta.
- `/console/organizations/[organizationId]`: detalle de tenant, centros, usuarios, roles, plan, limites y salud.
- Accion controlada para crear organizacion y owner inicial.
- Accion controlada para abrir la app de ese tenant en modo soporte auditado.

### Control Manual De Acceso Tenant Desde Console

Decision 2026-05-27: BoxOps Console puede suspender o reactivar manualmente el acceso de una `organization` sin tocar memberships ni suplantar usuarios.

Reglas aplicadas:

- `trialing` y `active` son los unicos estados resolubles como tenant activo para `/app`.
- `suspended` e `inactive` bloquean la resolucion tenant aunque existan memberships activas.
- La accion vive en `/console/organizations/[organizationId]`, no en la tabla principal de organizaciones.
- Solo `platform_owner` puede ejecutar el cambio; la Server Action revalida sesion/rol y la RPC vuelve a revalidarlo en Postgres.
- La suspension exige confirmacion explicita y motivo breve. La reactivacion tambien exige motivo.
- El motivo se valida para evitar tokens, enlaces, datos de pago, payroll, salud o documentos.
- La mutacion actualiza solo `organizations.status`; no crea, borra ni modifica `organization_memberships`.
- Cada intento permitido registra `platform_audit_events` con actor de plataforma, organizacion objetivo, accion `suspended` o `activated`, resultado y metadata minimizada.
- No usa `service_role`, Stripe, Checkout, webhooks, Customer Portal ni `/app/settings/billing`.

Fuera del primer corte:

- suplantacion silenciosa de usuarios reales;
- lectura global de documentos sensibles;
- payroll, nominas o datos bancarios crudos;
- borrar tenants o datos operativos reales desde Console;
- hacer a un platform admin miembro permanente de cada organizacion.

### Sesiones De Soporte Auditadas Desde Console

Decision 2026-05-27: BoxOps Console puede abrir una entrada temporal y auditada a `/app` para revisar el contexto operativo de una organizacion sin suplantar usuarios ni crear memberships permanentes.

Reglas aplicadas:

- La accion vive en `/console/organizations/[organizationId]` como `Abrir en modo soporte`.
- Solo `platform_owner` y `support` activos pueden crear o cerrar una sesion de soporte; la Server Action revalida sesion/rol y la RPC vuelve a revalidarlo en Postgres.
- La organizacion objetivo debe estar en `trialing` o `active`; `suspended` e `inactive` no pueden abrir soporte hacia `/app`.
- La entrada exige motivo breve, confirmacion explicita y caducidad acotada de 30, 60 o 120 minutos.
- El motivo se valida con las mismas reglas prudentes de plataforma y bloquea tokens, URLs, datos bancarios, payroll, salud, documentos o adjuntos.
- La sesion se guarda en `platform_support_sessions` con scope `app_support`, actor, organizacion, motivo, inicio, expiracion y estado.
- La accion se audita en `platform_audit_events` como `support_started`; cerrar o expirar manualmente registra `support_ended`.
- `/app` resuelve un acceso pseudo-membership con rol interno `platform_support` solo mientras existe cookie HttpOnly y sesion activa valida.
- El indicador visible de modo soporte aparece antes de operar en `/app` y permite cerrar la sesion desde la propia app.
- El modo soporte concede lectura operativa minima por RLS a organizacion, centros, memberships, equipo, tipos, horario, plantillas, asignaciones y eventos.
- El modo soporte no concede politicas de lectura para documentos, payroll, fichaje, firmas ni datos sensibles futuros.
- No usa `service_role`, no crea ni borra memberships, no suplantan usuarios y no convierte platform admins en miembros permanentes.

Fuera de este corte:

- sesion de soporte con elevacion granular por modulo sensible;
- lectura de documentos, payroll, fichaje, firmas o RRHH sensible desde soporte;
- soporte sobre organizaciones suspendidas/inactivas;
- recording/replay de sesion, chat de soporte o aprobacion dual;
- automatizar bloqueo o reactivacion por plan/billing.

### Catalogo Versionado De Planes Comerciales

Decision 2026-05-27: BoxOps ya tiene foundation comercial sin cobro real. El catalogo vive en `billing_plans` y `billing_plan_versions`, y `organization_subscriptions` conserva un snapshot efectivo de precio, limites y prestaciones cuando se asigna o cambia plan.

Reglas aplicadas:

- Los planes iniciales son founder / early access pricing, sin IVA y versionables.
- El precio anual equivale a 10 meses pagados.
- Los precios se guardan en centimos y `currency = EUR`.
- Los IDs futuros de Stripe (`stripe_product_id`, `stripe_monthly_price_id`, `stripe_annual_price_id`) son nullable y se validan como referencias seguras, pero no cobran ni abren flujos de pago.
- `platform_owner` puede crear borradores, publicar nuevas versiones, archivar planes y asignar/cambiar planes manualmente desde Console.
- `billing` puede leer catalogo y suscripciones, pero no publicar ni archivar si el modelo de roles actual no lo concede.
- Owner del tenant puede ver su plan, uso y planes publicados en `/app/settings/billing`; `admin` tiene lectura prudente.
- El cambio autoservicio de plan desde `/app/settings/billing` queda manual mientras no exista Stripe real y se revalida en RPC.
- Una organizacion conserva `plan_code`, `plan_version`, precio mensual/anual/setup, limites, soporte, prestaciones y referencias futuras de Stripe como snapshot aunque el catalogo publique otra version despues.
- El limite efectivo de centros se calcula desde `organization_subscriptions.center_limit` solo cuando la suscripcion tiene `billing_plan_version_id` y no es legacy manual. Las suscripciones manuales antiguas sin version mantienen compatibilidad y no bloquean centros.
- `center_limit` se aplica al crear centros activos. No bloquea editar centros existentes.
- Si un downgrade permite menos centros que los activos actuales, la RPC exige elegir que centros quedan activos. Los no seleccionados pasan a `inactive`; no se borran y conservan historico operativo, horarios, asignaciones y documentos vinculados.
- `future_client_limit` queda como semilla contractual para clientes/reservas futuras; no tiene enforcement real todavia.
- El modelo futuro de clientes/reservas debe permitir que una persona tenga acceso a varios centros/boxes y cambie contexto para reservar, no quedar atada a una unica organizacion/centro.
- Higiene local de migraciones 2026-05-28: las policies creadas por cortes recientes de Console/soporte/billing deben ser idempotentes con `DROP POLICY IF EXISTS` antes de `CREATE POLICY`, conservando la misma tabla, rol, comando y predicado RLS. Si una DB local contiene objetos creados pero la migracion no figura aplicada, se corrige con una migracion forward minima o un ajuste idempotente; no se usa `supabase db reset` para desbloquear.

Planes founder v1 sembrados:

- `starter`: 39 EUR/mes, 390 EUR/ano, 1 centro, 15 staff, 600 clientes futuros, 5 GB, setup opcional 199 EUR.
- `box`: 69 EUR/mes, 690 EUR/ano, 2 centros, 30 staff, 1.200 clientes futuros, 10 GB, setup opcional 199 EUR.
- `growth`: 119 EUR/mes, 1.190 EUR/ano, 5 centros, 75 staff, 3.000 clientes futuros, 25 GB, setup opcional 399 EUR.
- `scale`: 199 EUR/mes, 1.990 EUR/ano, 10 centros, 150 staff, 6.000 clientes futuros, 75 GB, setup opcional 399 EUR.
- `network`: 349 EUR/mes, 3.490 EUR/ano, 20 centros, 300 staff, 12.000 clientes futuros, 150 GB, setup opcional 599 EUR.
- `franchise`: 699 EUR/mes, 6.990 EUR/ano, 50 centros, 750 staff, 30.000 clientes futuros, 300 GB, setup opcional 599 EUR.
- `enterprise`: plan a medida para mas de 50 centros, limites custom y contrato manual.

Fuera de este corte:

- Stripe Checkout;
- Customer Portal;
- webhooks;
- facturas reales;
- cobros reales;
- gestion de IVA;
- clientes finales y reservas;
- limites reales de storage medidos si no hay fuente fiable;
- borrado fisico de centros.

## Billing Y Proveedor De Pago

Decision 2026-05-26: Stripe es el proveedor recomendado por defecto para suscripciones SaaS de BoxOps.

Motivos:

- cubre suscripciones, Checkout, Customer Portal, facturas, metodos de pago, webhooks y cambios de plan en una integracion comun;
- permite empezar con tarjeta y SEPA Direct Debit sin guardar datos bancarios sensibles en BoxOps;
- reduce trabajo operativo frente a una integracion directa de bancos o Redsys al inicio.

GoCardless queda como alternativa futura si la mayoria de clientes exige domiciliacion SEPA y Stripe no encaja por coste, conciliacion o operativa. Redsys no es el camino inicial para BoxOps SaaS porque obligaria a construir mas piezas de suscripcion, portal y facturacion.

Reglas:

- BoxOps no guarda tarjetas, IBAN completos, mandates crudos ni datos bancarios sensibles.
- BoxOps guarda referencias seguras del proveedor cuando existan, estado, plan, version y limites; no guarda metodos de pago.
- En el corte actual `/app/settings/billing` solo muestra plan, uso, catalogo publicado y cambio manual sin cobro.
- En la fase Stripe real, el owner del tenant gestionara pago mediante Customer Portal o flujo equivalente fuera de BoxOps.
- La Console de plataforma ve estado comercial y puede crear/asignar plan manual, pero no manipula metodos de pago directamente.
- Los webhooks de Stripe quedan para una fase posterior y deberan procesarse server-side, con secreto solo en entorno, idempotencia y auditoria.
- La suscripcion no debe activar ni desactivar modulos sensibles sin una tabla/capacidad explicita y pruebas.

Campos candidatos para `organization_subscriptions`:

- `organization_id`
- `plan_code`
- `status`
- `trial_ends_at`
- `current_period_ends_at`
- `seat_limit`
- `center_limit`
- `billing_email`
- `provider`
- `provider_customer_id`
- `provider_subscription_id`
- `metadata`

Estados candidatos:

- `manual`
- `trialing`
- `active`
- `past_due`
- `paused`
- `cancelled`

## Fases SaaS Recomendadas

1. Foundation manual: crear schema/RLS/helpers para `platform_admins`, `organization_subscriptions`, auditoria y resumen de organizaciones, sin UI de pago real.
2. Console interna: listar tenants, ver detalle, crear organizacion y owner inicial, y abrir tenant en modo soporte auditado.
3. Catalogo founder versionado: `billing_plans`, `billing_plan_versions`, snapshots en `organization_subscriptions`, `/console/plans`, `/app/settings/billing` y enforcement inicial de `center_limit`, sin cobro real.
4. Stripe real: Checkout/Customer Portal, webhooks, sincronizacion de suscripcion y facturas, sin guardar secretos ni datos bancarios en DB.
5. Comercializacion v1: planes, limites, upgrades/downgrades, evidencias de soporte y runbook de incidencias.

## Etapas Recomendadas

### Piloto / MVP

- Un proyecto Supabase gestionado por Henalu.
- Varios tenants en la misma DB.
- RLS estricta.
- Backups y monitorizacion cuando se pase a produccion real.

### Primeros Clientes De Pago

- Seguir con multi-tenant compartido.
- Cobrar mensualidad por organizacion, centro o coach activo.
- Revisar costes reales mensualmente.
- Mantener posibilidad de exportar/migrar tenant.

### Cliente Enterprise / Dedicado

- Proyecto Supabase dedicado.
- Coste infra separado o incluido en un plan superior.
- Migraciones automatizadas desde el mismo repo.
- Contrato claro sobre propiedad de datos, backups y soporte.

## Decision Comercial

No vender "te monto tu Supabase" como producto base.

Vender BoxOps como servicio operativo:

- Software.
- Hosting.
- Mantenimiento.
- Actualizaciones.
- Soporte.
- Carga inicial / setup si aplica.

La infraestructura es parte del coste del servicio, salvo que el cliente pida aislamiento dedicado.
