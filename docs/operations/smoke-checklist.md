# Smoke checklist - BoxOps

## Alcance

Este documento cubre la base automatizada de smoke para MVP 1. No sustituye la validacion real con una semana completa del primer tenant ni el audit visual responsive pendiente.

## Smoke automatizado

Comando:

```bash
npm run test:smoke
```

Por defecto usa el servidor ya abierto en:

```text
http://127.0.0.1:3000
```

Tambien se puede apuntar a otro entorno con:

```bash
E2E_BASE_URL=https://example.test npm run test:smoke
```

El smoke solo arranca Next.js si se define explicitamente:

```bash
E2E_START_SERVER=1 npm run test:smoke
```

Cobertura base sin credenciales:

- `/login` renderiza la superficie publica de auth.
- Las rutas protegidas redirigen a `/login` conservando `redirectTo`:
  - `/app`
  - `/app/centers`
  - `/app/coaches`
  - `/app/class-types`
  - `/app/schedule`
  - `/app/templates`

## Flujo local autenticado recomendado

Antes de validar smokes autenticados locales, prepara primero el fixture Auth en
modo reversible:

```bash
npm run supabase:setup:e2e-auth
```

Ese comando es dry-run, termina en `ROLLBACK` y debe ejecutarse antes de
cualquier `npm run supabase:setup:e2e-auth:commit` local. Usa el commit solo si
la evidencia del dry-run cuadra y necesitas crear o reparar usuarios E2E
persistentes en la DB local.

`npm run supabase:reset` esta protegido y debe seguir bloqueando por defecto.
No uses `npm run supabase:reset:danger` salvo autorizacion explicita del turno.

Flujo expandido recomendado:

```bash
npm run supabase:setup:e2e-auth
npm run test:smoke:e2e-auth
npm run test:smoke:protected:roles
```

- `test:smoke:e2e-auth` es el preflight Auth minimo: login real por rol y pocas
  rutas protegidas para confirmar que el fixture local funciona.
- `test:smoke:protected:<rol>` ejecuta el recorrido amplio del mapa protegido
  para un rol aislado (`owner`, `admin`, `manager` o `coach`).
- `test:smoke:protected:roles` encadena owner, admin, manager y coach en orden,
  reutilizando los scripts por rol.
- `test:smoke:e2e-local` es el atajo completo local para los dos pasos de smoke:
  preflight Auth minimo y despues recorrido amplio por roles.

El motivo de separar el flujo es operativo: el problema detectado fue
timeout/lentitud al juntar todo, no un fallo funcional de permisos.

Cobertura autenticada local:

- `owner`, `admin` y `manager` recorren las superficies de gestion permitidas.
- `coach` recorre las superficies en lectura y las entradas propias esperadas.

Variables opcionales:

- `E2E_OWNER_EMAIL`
- `E2E_OWNER_PASSWORD`
- `E2E_ADMIN_EMAIL`
- `E2E_ADMIN_PASSWORD`
- `E2E_MANAGER_EMAIL`
- `E2E_MANAGER_PASSWORD`
- `E2E_COACH_EMAIL`
- `E2E_COACH_PASSWORD`
- `E2E_ORGANIZATION_ID` si el usuario tiene varias memberships activas.
- `E2E_WEEK` para fijar la semana en `/app/schedule` y `/app/templates`.
- `E2E_BASE_URL` para staging, preview o un puerto distinto.
- `E2E_START_SERVER=1` solo si se quiere que Playwright lance `npm run dev`.

Nota Fase A 2026-05-06: el smoke marca el onboarding local como visto para validar navegacion de rutas sin bloquearse en el tour. La semana de prueba local de STL se valida con `E2E_ORGANIZATION_ID=00000000-0000-0000-0000-000000200001` y `E2E_WEEK=2026-05-04`; para cerrar validacion real haran falta credenciales o flujo E2E reales del piloto y asignaciones/huecos confirmados.

## Smokes Anti-Regresion Operativa

Ejecutar estos smokes cuando se toque la zona indicada, aunque no se ejecute toda la suite:

```bash
npx playwright test --config=playwright.smoke.config.ts tests/smoke/operational-detail-panels.spec.ts
```

Usarlo despues de tocar `/app/schedule`, `/app/coverage`, `/app/templates`, `RouteStateLink`, `operations-ui` o helpers de rutas con `block_id`/`edit_block_id`. Protege que abrir/cerrar detalles o edicion de tarjetas no emita request RSC, no recargue la pagina y conserve `scrollY`.

```bash
npx playwright test --config=playwright.smoke.config.ts tests/smoke/schedule-coach-availability.spec.ts
```

Usarlo despues de tocar asignaciones, cobertura, plantillas aplicadas, estados de bloque o `src/lib/schedule-blocks.ts`. Protege que el frontend oculte coaches ocupados: 11:15-12:15 bloquea 11:00-12:00, pero no bloquea franjas adyacentes ni asignaciones retiradas/canceladas.

Si se toca una migracion, trigger o regla de Postgres relacionada con disponibilidad, ejecutar tambien:

```bash
npx supabase db lint --local
```

Y comprobar manualmente o con SQL local que `00011_schedule_assignment_overlap_guard.sql` sigue bloqueando tanto insertar una asignacion solapada como mover un bloque asignado hacia un solape.

## Smoke manual pendiente

- Login correcto e incorrecto.
- Usuario autenticado sin membership activa.
- Usuario con varias memberships activas y seleccion explicita de organizacion.
- Admin crea/edita/desactiva centros sin borrar.
- Admin crea/edita tipos de actividad sin borrar.
- Admin crea/edita/cancela bloques semanales sin borrar.
- Admin asigna, reactiva y retira coaches con `schedule_block_assignments`.
- Admin no puede asignar el mismo coach a dos bloques activos solapados; la UI filtra el coach ocupado y la action muestra `coach-unavailable` si Postgres lo rechaza.
- Filtros por centro, coach, tipo, estado, cobertura, solo riesgos y `mine=1`.
- Admin crea/aplica plantilla semanal con bloques vacantes y coach por defecto.
- Abrir/cerrar detalle en Horario y Cobertura, y editar bloque en Plantillas, conserva scroll/contexto en desktop y mobile.
- Campos densos en formularios operativos no solapan texto con flecha de select ni sacan campos largos del contenedor en 390px.
- Dashboard admin enlaza cada riesgo al bloque real.
- Coach revisa horario, catalogos y plantillas en modo lectura.
