# Escenarios Demo Genericos De Cobertura

Este documento cierra la parte pendiente de Task 008: escenarios genericos para verificar cobertura sin depender de datos reales del primer tenant.

No son datos de producto ni fixtures reales. Sirven como guia para seeds demo, pruebas manuales o tests futuros, siempre manteniendo `organization_id` como frontera.

## Principios

- Usar tenants ficticios y nombres genericos.
- No convertir estos casos en reglas especiales por tenant.
- Toda fila operativa debe incluir `organization_id`.
- `organization_memberships` sigue siendo la fuente de acceso y rol.
- `schedule_block_assignments.assignment_status = 'assigned'` es lo unico que cuenta para cobertura.
- `pending`, `declined` y `removed` pueden mostrarse como contexto, pero no cubren.
- Los bloques `cancelled` y `completed` no entran como riesgos activos.

## Escenario A - Tenant Multi-Centro Con Riesgos Mixtos

Objetivo: validar que un tenant con dos centros puede mezclar bloques cubiertos, sin cubrir, insuficientes y conflictos sin cruzar datos.

Datos minimos:

- Organizacion demo activa.
- Dos centros activos: Centro Norte y Centro Sur.
- Tres `person_profiles` visibles y activos.
- Tres `coach_profiles` activos, vinculados a esas personas.
- Una semana con bloques en ambos centros.

Casos:

- Bloque cubierto: `required_coaches = 1` y una asignacion `assigned`.
- Bloque sin cubrir: `required_coaches = 1` y sin asignaciones validas.
- Bloque insuficiente: `required_coaches = 2` y una sola asignacion `assigned`.
- Conflicto: el mismo `coach_profile_id` asignado a dos bloques activos con la misma `service_date` y horas solapadas.
- Bloques simultaneos sin conflicto: dos bloques a la misma hora con coaches distintos.

Resultado esperado:

- `covered` solo en el bloque con asignacion suficiente y sin solape.
- `uncovered` en el bloque accionable sin coach.
- `insufficient` en el bloque con ratio menor que `required_coaches`.
- `conflict` en ambos bloques solapados del mismo coach.
- La simultaneidad por si sola no crea conflicto.

## Escenario B - Tenant De Un Centro Sin Incidencias

Objetivo: validar el camino feliz para una semana pequena.

Datos minimos:

- Organizacion demo activa.
- Un centro activo.
- Dos coaches activos y visibles.
- Tres bloques de la semana, todos con `required_coaches = 1`.
- Cada bloque tiene una asignacion `assigned` distinta o no solapada.

Resultado esperado:

- Todos los bloques activos aparecen como `covered`.
- El filtro de riesgos no devuelve bloques.
- Un usuario coach con perfil vinculado puede usar `mine=1` y ver solo sus bloques asignados.

## Escenario C - Bloque Informativo Sin Cobertura

Objetivo: validar que `required_coaches = 0` no genera riesgo falso.

Datos minimos:

- Organizacion demo activa.
- Un bloque activo con `required_coaches = 0`.
- Sin asignaciones.

Resultado esperado:

- El bloque se calcula como `not_required`.
- No aparece en `risks_only=1`.
- Si se filtra por estado operativo, el bloque sigue siendo visible como agenda.

## Escenario D - Coach Inactivo O Membership Inactiva

Objetivo: confirmar que una asignacion existente no cubre si el coach ya no es valido.

Variantes:

- `coach_profiles.status = 'inactive'`.
- `coach_profiles.user_id` vinculado a una `organization_memberships.status != 'active'`.
- `coach_profiles.person_profile_id` apunta a un `person_profiles.status = 'inactive'`.
- `person_profiles.visibility_status = 'internal'`.

Resultado esperado:

- La asignacion `assigned` se conserva como dato, pero no cuenta como cobertura valida.
- Un bloque con solo esa asignacion queda `uncovered` o `insufficient` segun `required_coaches`.
- El coach no aparece como asignable normal en UI.

## Escenario E - Asignaciones No Activas

Objetivo: validar que estados no activos no cubren y se pueden mostrar como metadata.

Datos minimos:

- Un bloque accionable con `required_coaches = 1`.
- Asignaciones sobre el bloque con estados `pending`, `declined` y `removed`.

Resultado esperado:

- Ninguna de esas asignaciones cuenta como cobertura valida.
- `pending` puede incrementar contador contextual.
- `removed` queda como historial operativo, no como borrado.

## Escenario F - Plantilla Aplicada Con Huecos Vacantes

Objetivo: preparar la verificacion de plantillas semanales sin datos reales.

Datos minimos:

- Una `schedule_templates` semanal activa.
- Dos `schedule_template_blocks` con `default_coach_profile_id`.
- Dos `schedule_template_blocks` con `default_coach_profile_id = null`.
- Aplicacion a una semana vacia.

Resultado esperado:

- Se crean `schedule_blocks` con `template_id` y `template_block_id`.
- Los bloques con coach por defecto crean `schedule_block_assignments.source = 'template'`.
- Los bloques vacantes no crean asignacion y aparecen como `uncovered` si `required_coaches > 0`.
- Aplicar la misma plantilla otra vez sobre la misma semana no duplica bloques.

## Uso Recomendado

Orden de verificacion manual o automatizada:

1. Preparar tenants demo ficticios.
2. Crear personas, memberships y coaches dentro de cada `organization_id`.
3. Crear bloques o aplicar plantillas.
4. Calcular cobertura al vuelo.
5. Verificar que filtros por centro, coach, tipo, estado, cobertura, riesgos y `mine=1` no cruzan tenant.

Estos escenarios pueden convertirse en seeds demo o tests cuando el repo tenga una estrategia de test dedicada. Hasta entonces son referencia funcional para no depender de datos reales del primer tenant.
