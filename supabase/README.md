# Supabase - BoxOps

Schema inicial de MVP 1.

## Archivos

- `migrations/00001_mvp1_multi_tenant_schema.sql`: schema multi-tenant, constraints, indices, triggers y RLS.
- `migrations/00002_person_profiles.sql`: perfiles visibles/personas operativas pendientes de Auth y enlace opcional desde `coach_profiles`.
- `seeds/01_demo_data.sql`: tenant generico de demo.
- `seeds/02_stl_tenant.sql`: tenant STL con centros, tipos de clase conocidos, `person_profiles` y `coach_profiles` pendientes de Auth.
- `snippets/stl-test-week-2026-05-04.sql`: fixture local no automatico para cargar la semana de prueba L-V de STL en Fase A.
- `config.toml`: configuracion local base para Supabase CLI.

## Orden De Ejecucion

Cuando la CLI de Supabase este instalada:

```bash
npm run supabase:start
npm run supabase:reset
npm run supabase:types
```

O contra un proyecto remoto:

```bash
npx supabase link --project-ref <project_ref>
npx supabase db push
```

`supabase db reset` ejecuta automaticamente los seeds declarados en `config.toml`:

- `seeds/01_demo_data.sql`
- `seeds/02_stl_tenant.sql`

## Notas

- Los seeds no crean usuarios de Supabase Auth.
- Los snippets no se ejecutan en `supabase db reset`; se aplican manualmente cuando haga falta validar un escenario local concreto.
- Para dar acceso a un usuario real, primero debe existir en `auth.users`.
- STL vive solo en `02_stl_tenant.sql`; la migracion base no contiene reglas especiales para STL.
- Todas las tablas operativas incluyen `organization_id`.
- RLS permite lectura a miembros activos y escritura a roles operativos/admin.
- Task 009 crea `person_profiles` como tabla tenant-scoped para nombres visibles, email publico opcional, avatar, estado y visibilidad.
- `person_profiles.user_id` es opcional y se vincula a una membership del tenant cuando exista `auth.users`.
- `coach_profiles.person_profile_id` permite perfiles operativos de coach pendientes de Auth; `coach_profiles.user_id` se mantiene para compatibilidad con el flujo actual.
- Los perfiles `internal` no son lectura normal de miembros y sirven para usuarios tecnicos/no operativos.
- `npm run supabase:types` genera `src/types/supabase.ts` desde la base local.
- Task 006 expone `class_types` en la UI sin migracion nueva: la tabla ya tenia el corte necesario para catalogo basico por tenant.
- Task 007 expone `schedule_blocks` en `/app/schedule` sin migracion nueva: la tabla ya tenia el corte necesario para bloques operativos semanales.
- Task 009 ajusta `/app/coaches` solo para soportar `coach_profiles.user_id = null` sin crear una nueva superficie de UI.
- Task 010 expone asignaciones y cobertura basica en `/app/schedule` sin migracion nueva: `schedule_block_assignments` ya tenia `organization_id`, FK por tenant, estados, `source` y unicidad por bloque+coach.
- Retirar una asignacion no borra filas; cambia `assignment_status` a `removed`. Reasignar el mismo coach al mismo bloque reactiva esa fila como `assigned`.
- `coverage_issues` sigue sin tabla: durante MVP 1 se calcula al vuelo desde bloques, asignaciones, coaches, personas y memberships.

## Fixture Local Semana STL Fase A

Para cargar la semana de prueba L-V recibida el 2026-05-06:

```bash
Get-Content -Raw supabase/snippets/stl-test-week-2026-05-04.sql | docker exec -i supabase_db_boxops psql -U postgres -d postgres -v ON_ERROR_STOP=1
```

Resultado esperado:

- 1 plantilla semanal activa para STL.
- 165 bloques de plantilla.
- 165 bloques reales en la semana de 2026-05-04.
- 0 asignaciones de coaches, para no inventar cobertura.

El fixture carga los bloques temporalmente en el centro STL Tremanes porque no se ha confirmado centro por bloque. No moverlo a seed automatico hasta cerrar centro y asignaciones/huecos reales.

## Promocionar Un Usuario A Admin Demo

Tras registrar un usuario real:

```sql
INSERT INTO public.organization_memberships (
  organization_id,
  user_id,
  role,
  status,
  joined_at
)
VALUES (
  '00000000-0000-0000-0000-000000100001',
  '<auth_user_uuid>',
  'admin',
  'active',
  now()
)
ON CONFLICT (organization_id, user_id)
DO UPDATE
SET role = EXCLUDED.role,
    status = EXCLUDED.status,
    joined_at = COALESCE(public.organization_memberships.joined_at, EXCLUDED.joined_at);
```
