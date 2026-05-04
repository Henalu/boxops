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

Estado actual tras Task 015:

- Next.js 16 App Router con React 19.
- TypeScript estricto.
- Tailwind CSS 4.
- shadcn/ui inicializado.
- Supabase local con migracion MVP 1 y seeds.
- Supabase Auth SSR.
- `src/proxy.ts` protegiendo `/app`.
- Login minimo en `/login`.
- Callback auth en `/auth/callback`.
- Sign out en `POST /auth/sign-out`.
- Shell protegido bajo `/app`.
- Navegacion minima:
  - `/app`
  - `/app/centers`
  - `/app/coaches`
  - `/app/class-types`
  - `/app/schedule`
  - `/app/templates`
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
- `/app` muestra dashboard admin basico de cobertura con cola de riesgos y enlaces al bloque real.
- `npm run test:smoke` valida login publico, redireccion de rutas protegidas y flujos MVP 1 autenticados opcionales.
- `admin` gestiona centros.
- `admin` gestiona usuarios/coaches basicos.
- `admin` gestiona tipos de clase/actividad.
- `admin` gestiona bloques operativos, asignaciones y plantillas semanales basicas.
- `coach` consulta centros, coaches y tipos en modo lectura.
- `coach` consulta bloques operativos, cobertura, "Mi horario" y plantillas en modo lectura.

Esto ya no es solo scaffold. Es el primer corte real protegido. Pequeno, pero con las tuberias importantes en su sitio.

## Que no existe todavia

Todavia no hay:

- dashboard visual final validado con semana real
- cambios entre coaches
- ausencias
- eventos
- horas extra
- fichaje
- documentos
- IA

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
10. dashboard admin minimo

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
16. `supabase/migrations/00001_mvp1_multi_tenant_schema.sql`

Con eso vuelves a poner el mapa sobre la mesa.
