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

Cobertura opcional con credenciales:

- `admin` puede entrar en las superficies MVP 1:
  - dashboard admin basico en `/app`
  - centros
  - usuarios/coaches
  - tipos de actividad
  - horario semanal
  - plantillas semanales
- `coach` puede entrar en las mismas superficies en lectura.

Variables opcionales:

- `E2E_ADMIN_EMAIL`
- `E2E_ADMIN_PASSWORD`
- `E2E_COACH_EMAIL`
- `E2E_COACH_PASSWORD`
- `E2E_ORGANIZATION_ID` si el usuario tiene varias memberships activas.
- `E2E_WEEK` para fijar la semana en `/app/schedule` y `/app/templates`.
- `E2E_BASE_URL` para staging, preview o un puerto distinto.
- `E2E_START_SERVER=1` solo si se quiere que Playwright lance `npm run dev`.

## Smoke manual pendiente

- Login correcto e incorrecto.
- Usuario autenticado sin membership activa.
- Usuario con varias memberships activas y seleccion explicita de organizacion.
- Admin crea/edita/desactiva centros sin borrar.
- Admin crea/edita tipos de actividad sin borrar.
- Admin crea/edita/cancela bloques semanales sin borrar.
- Admin asigna, reactiva y retira coaches con `schedule_block_assignments`.
- Filtros por centro, coach, tipo, estado, cobertura, solo riesgos y `mine=1`.
- Admin crea/aplica plantilla semanal con bloques vacantes y coach por defecto.
- Dashboard admin enlaza cada riesgo al bloque real.
- Coach revisa horario, catalogos y plantillas en modo lectura.
