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
