# Chuleta general de BoxOps

La version de bolsillo para entrar al repo sin sentir que te han tirado una caja de piezas encima.

## Que es BoxOps

BoxOps es un SaaS operativo para boxes de CrossFit.

No intenta ser un RRHH generico con una pegatina de gimnasio. La idea es resolver la parte que suele vivir entre hojas de calculo, WhatsApp y memoria heroica:

- centros
- coaches
- horarios semanales
- bloques operativos
- clases sin cubrir
- cambios
- cobertura
- plantillas
- eventos
- ausencias
- fichaje y documentos, mas adelante

Resumen humano:

> BoxOps quiere que un box sepa quien trabaja, donde, cuando, que cubre y que se queda colgando antes de que el lunes empiece a mirar raro.

## Que problema resuelve

Herramientas tipo Factorial resuelven RRHH generico. Bien. Pero un box no vive solo de contratos y vacaciones.

Un box necesita saber cosas bastante concretas:

- que centro abre
- que clase hay
- que coach la cubre
- si un coach esta en dos sitios a la vez
- si una clase necesita mas de una persona
- que bloques no son clases, pero tambien ocupan tiempo real
- que pasa cuando alguien falta o cambia una clase

Ese es el hueco: operativa semanal real, multi-centro y con cobertura visible.

## Que existe hoy

Estado actual tras los cortes S/H/I y el cierre UX del 2026-05-14:

- Next.js 16 App Router con React 19.
- TypeScript estricto.
- Tailwind CSS 4.
- shadcn/ui inicializado.
- Supabase local con migraciones MVP 1, documentos privados, fichaje, cierre semanal, solicitudes/cobertura y hardening operativo.
- Supabase Auth SSR.
- `src/proxy.ts` protegiendo `/app`.
- Login minimo en `/login`.
- Callback auth en `/auth/callback`.
- Sign out en `POST /auth/sign-out`.
- Shell protegido bajo `/app`.
- Navegacion minima:
  - `/app`
  - `/app/coverage`
  - `/app/more`
  - `/app/centers`
  - `/app/coaches`
  - `/app/class-types`
  - `/app/schedule`
  - `/app/templates`
  - `/app/requests`
  - `/app/time`
  - `/app/account`
  - `/app/stats`
- Resolucion de usuario y tenant con:
  - `getAuthenticatedUser`
  - `getActiveMemberships`
  - `resolveActiveOrganization`
- `organization_memberships` como fuente de rol y tenant.
- Si hay varias memberships activas, se exige `organizationId` explicito.
- `/app/centers` permite listar, crear, editar y activar/desactivar centros.
- `/app/coaches` permite listar memberships y gestionar perfiles operativos minimos.
- `/app/class-types` permite listar, crear, editar y activar/desactivar tipos de clase/actividad.
- `/app/schedule` permite listar, crear, editar y cancelar bloques operativos semanales.
- `/app/schedule` permite asignar coaches, retirar asignaciones, calcular cobertura basica, filtrar por riesgos y usar "Mi horario".
- `/app/templates` permite crear plantillas semanales, crear bloques de plantilla y aplicar plantillas activas a semanas reales.
- `/app/templates` soporta plantillas grandes con vista Semana/Agenda, filtros colapsables, seleccion multiple, edicion multiple limitada y sincronizacion idempotente del rango activo.
- `/app` muestra Inicio operativo por rol. Para coaches muestra proxima clase, fichaje, avisos propios y accesos personales; para gestion conserva contexto operativo y colas relevantes.
- El shell muestra la proxima clase asignada propia tambien en Inicio, calculada server-side desde asignaciones `assigned`. No ocultarlo en `/app`: sidebar desktop y encabezado mobile son el recordatorio fijo.
- `/app/requests` permite solicitudes/ofertas minimas de cobertura/cambio sobre bloques asignados, con targets resueltos desde la organizacion activa y mutaciones por Server Actions + RPCs.
- `/app/time` permite fichaje propio manual, fecha/hora elegible, centro principal preseleccionado, correcciones trazadas, vista semanal, cierre/aprobacion semanal y CSV interno revisable.
- `/app/account` contiene cuenta, perfil visible, avatar privado y firma interna propia.
- `npm run test:smoke` valida login publico, redireccion de rutas protegidas y flujos MVP 1 autenticados opcionales.
- `owner`, `admin` y `manager` gestionan operativa MVP 1: centros, equipo operativo, tipos, horario, asignaciones, plantillas, cobertura y solicitudes segun el corte actual.
- `coach` consulta horario/equipo/tipos/centros, usa funciones propias, ve proxima clase y fichaje, pero no recibe Plantillas ni pantallas administrativas como opcion cotidiana.

Esto ya no es solo scaffold. Es el primer corte real protegido. Pequeño, pero con las tuberias importantes en su sitio.

Nota 2026-05-14: la frase anterior ya se queda corta. El producto tiene varias superficies reales; el guardrail importante es no mezclar esta base con payroll, geolocalizacion web o datos sensibles sin abrir fase propia.

## Que no existe todavia

Todavia no hay:

- piloto oficial con datos reales validados y entorno real desbloqueado
- ausencias, vacaciones, bajas o permisos laborales
- swap entre dos bloques/asignaciones
- eventos/festivos avanzados
- horas extra aprobadas o payroll
- documentos visibles/subida documental desde UI
- documentos firmables con snapshot/evidencia
- app nativa real
- push real, service worker, offline privado o background sync
- geolocalizacion web
- IA sobre programacion

No es una lista de verguenza. Es una lista de "no lo construyas de reojo un viernes".

## Como se organiza el dominio

La jerarquia que manda:

```text
Organization/Tenant
  Centers
    Users / Coaches
    Schedules
      Classes / Blocks
        Events
```

Traduccion rapida:

- `organizations`: cliente/tenant que paga y separa datos.
- `centers`: sedes fisicas dentro de una organizacion.
- `organization_memberships`: relacion usuario-organizacion con rol.
- `coach_profiles`: perfil operativo de coach dentro del tenant.
- `class_types`: catalogo de tipos de clase o actividad.
- `schedule_templates`: plantillas reutilizables.
- `schedule_blocks`: unidad minima futura del horario real.
- `schedule_block_assignments`: quien cubre cada bloque.
- `events`: hechos operativos auditables.

La palabra clave es "bloque". No todo bloque es una clase. Puede ser recepcion, evento, open box, competicion, tarea interna o cualquier cosa que ocupe tiempo y cobertura. El bloque operativo es el ladrillo. No tocar esto con guantes de boxeo.

## Que significa tenant/organization

En BoxOps, una `organization` es el cliente/box que contiene sus datos.

La frontera de seguridad y negocio es la organizacion:

- permisos
- memberships
- centros
- horarios
- coaches
- billing futuro
- configuracion
- RLS

STL es el primer tenant real, no la marca del producto. Puede aparecer en seeds o documentacion especifica de tenant. No debe aparecer hardcodeado en rutas, componentes, permisos, helpers o policies genericas.

## Como pensar MVP 1 sin liarse

MVP 1 no es "todo BoxOps".

MVP 1 es:

1. tenant seguro
2. centros
3. usuarios/coaches
4. tipos de actividad
5. horario semanal por bloques
6. asignaciones
7. filtros
8. cobertura basica
9. plantillas semanales
10. proxima clase propia visible
11. solicitudes/cobertura minima
12. fichaje propio/cierre semanal inicial

El peligro natural es empezar con IA, fichaje con geolocalizacion, payroll o una app nativa porque suenan mas grandes. No. Eso es construir una nave espacial para cruzar la calle.

Primero tiene que funcionar la semana real:

```text
centro -> bloque -> coach asignado -> cobertura visible
```

Si eso no esta claro, lo demas solo mete niebla.

## Si me pierdo, empiezo aqui

1. `PROJECT_BRIEF.md`
2. `TASKS.md`
3. `README.md`
4. `docs/product/mvp.md`
5. `docs/architecture/domain-model.md`
6. `docs/architecture/tenancy-and-billing.md`
7. `docs/guides/project-cheatsheet.md`
8. `docs/guides/code-editing-guide.md`
9. `src/lib/auth/tenant.ts`
10. `src/app/(app)/app/page.tsx`
11. `src/app/(app)/app/centers/page.tsx`
12. `src/app/(app)/app/coaches/page.tsx`
13. `src/app/(app)/app/class-types/page.tsx`
14. `src/app/(app)/app/schedule/page.tsx`
15. `src/app/(app)/app/templates/page.tsx`
16. `src/app/(app)/app/requests/page.tsx`
17. `src/app/(app)/app/time/page.tsx`
18. `src/lib/own-schedule.ts`
19. `src/lib/change-requests.ts`
20. `src/lib/time-tracking.ts`
21. `supabase/migrations/00001_mvp1_multi_tenant_schema.sql`
22. `supabase/migrations/00027_change_requests_foundation.sql`
23. `supabase/migrations/00032_class_type_update_sync_defaults.sql`
24. `supabase/migrations/00033_class_type_sync_all_related_blocks.sql`

Con eso vuelves a poner el mapa sobre la mesa.
