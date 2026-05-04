# Reglas De Estados Operativos - BoxOps

Este documento define reglas funcionales para calcular estados operativos antes de implementar frontend real. Complementa `visual-state-model.md`: alli se define como deben verse los estados; aqui se define cuando aplican.

No crea schema, codigo, componentes, rutas ni estilos.

## Principios

- Las reglas son genericas de BoxOps, no del primer tenant.
- Toda consulta debe mantenerse dentro de `organization_id`.
- La unidad minima sigue siendo `schedule_blocks`.
- La cobertura se calcula con asignaciones reales, no con colores, nombres de centro ni datos de tenant.
- Los estados criticos no pueden depender solo de `schedule_blocks.status`; ese campo sirve como ciclo de vida/manual override, pero la cobertura futura debe derivarse de asignaciones.

## Decision Provisional Para MVP 1

Durante MVP 1, `coverage_issues` debe calcularse al vuelo desde `schedule_blocks`, `schedule_block_assignments`, `coach_profiles` y `organization_memberships`.

No se persiste una tabla de incidencias todavia. Persistir `coverage_issues` queda como decision futura si aparecen necesidades claras de auditoria, notificaciones, rendimiento, historico de resolucion o workflows que requieran identidad propia de la incidencia.

Esta decision evita crear una segunda fuente de verdad antes de validar asignaciones reales.

Los escenarios demo genericos para validar estas reglas sin datos reales del primer tenant viven en `docs/product/coverage-demo-scenarios.md`.

## Prioridad De Cola Para Dashboard Admin

La precedencia funcional de estado define que etiqueta domina en un bloque. La cola del dashboard admin puede ordenar riesgos de forma operativa.

Validacion STL 2026-04-30 para MVP 1:

1. Bloques sin cubrir.
2. Conflictos graves, como un coach asignado a dos clases a la misma hora.
3. Cobertura insuficiente.
4. Riesgos de la semana, como bloques futuros aun sin confirmar.
5. Vistas de apoyo por centro, coach o semana.

Que existan varias clases a la misma hora no es conflicto por si mismo. El conflicto aparece cuando una misma persona queda asignada a bloques activos que se solapan.

## Conceptos Base

### Bloque Accionable

Un bloque es accionable para cobertura si cumple:

- `schedule_blocks.organization_id` coincide con la organizacion activa.
- `schedule_blocks.status` no es `cancelled`.
- `schedule_blocks.status` no es `completed`.
- `schedule_blocks.required_coaches > 0`.

Los bloques cancelados o completados pueden mostrarse en agenda/historial, pero no deben entrar en contadores de riesgo operativo.

### Asignacion Valida

Una asignacion cuenta para cobertura cuando:

- `schedule_block_assignments.organization_id` coincide con el bloque.
- `assignment_status = 'assigned'`.
- El `coach_profile` existe en la misma organizacion.
- `coach_profiles.status = 'active'`.
- Si `coach_profiles.user_id` esta vinculado, la membership del usuario sigue activa en esa organizacion.
- Si `coach_profiles.user_id` aun es `null`, el `coach_profile` debe apuntar a un `person_profile` activo, visible y de la misma organizacion para contar como cobertura planificada pendiente de Auth.

Las asignaciones `pending`, `declined` y `removed` no cuentan como cobertura valida. Pueden aparecer como metadata o workflow.

### Uso Previsto De `schedule_block_assignments`

Desde Task 010, `schedule_block_assignments` es la fuente canonica para saber que coach cubre que bloque real. Para MVP 1:

- cada fila debe pertenecer al mismo `organization_id` que el bloque y el `coach_profile`;
- `schedule_block_id` apunta a un bloque real, no a una plantilla;
- `coach_profile_id` expresa capacidad operativa, no solo identidad autenticada;
- desde Task 009, esa capacidad puede estar vinculada a `person_profiles` antes de existir `auth.users`;
- `assignment_status = 'assigned'` es el unico estado que cuenta para cobertura;
- retirar una asignacion desde UI debe preferir `assignment_status = 'removed'` antes que borrar la fila;
- si una fila `removed` se vuelve a seleccionar para el mismo bloque y coach, se reactiva a `assigned`;
- `source` permite distinguir si la asignacion viene de admin manual, plantilla, cambio futuro o importacion;
- la unicidad por `schedule_block_id` + `coach_profile_id` evita duplicar al mismo coach en el mismo bloque.

Las reglas de disponibilidad avanzada, certificaciones, ausencias y margen de traslado entre centros quedan fuera del calculo basico hasta validacion real.

Decision Task 010: un conflicto de solapamiento no bloquea guardar la asignacion manual. La asignacion se conserva como dato real y el bloque aparece con estado calculado `conflict` para que el admin lo resuelva.

Decision Task 011: los estados calculados se pueden usar como filtro de `/app/schedule` sin crear una tabla persistida. El filtro `coverage_state` acepta `covered`, `uncovered`, `insufficient` y `conflict`; el filtro rapido `risks_only=1` incluye solo `uncovered`, `insufficient` y `conflict`. Los bloques `cancelled` y `completed` siguen calculandose como `inactive`, quedan fuera de riesgos activos y solo se consultan si el usuario filtra por estado operativo.

Decision Task 014: `/app` usa estas mismas reglas para el dashboard admin basico. La cola se calcula al vuelo, prioriza `uncovered`, `conflict` e `insufficient`, y enlaza cada riesgo al bloque real en `/app/schedule`. No se crea tabla `coverage_issues` ni workflow propio de incidencias en este corte.

### Precedencia Funcional

Para un bloque incluido en una vista:

1. Si esta `cancelled`, mostrar `cancelled` y excluirlo de riesgos.
2. Si esta `completed`, mostrar `completed` y excluirlo de riesgos activos.
3. Si tiene conflicto activo, mostrar `conflict`.
4. Si requiere cobertura y tiene 0 asignaciones validas, mostrar `uncovered`.
5. Si requiere cobertura y tiene menos asignaciones validas que `required_coaches`, mostrar `insufficient`.
6. Si tiene workflow pendiente sin riesgo mayor, mostrar `pending`.
7. Si fue modificado respecto a plantilla/version previa, mostrar `changed`.
8. Si su naturaleza es especial, mostrar `extra`, `event` o `holiday`.
9. Si requiere cobertura y cumple el minimo sin conflicto, mostrar `covered`.

Esta precedencia separa dos cosas: un bloque cancelado no debe parecer "sin cubrir" aunque no tenga coach; un bloque activo sin coach si debe aparecer como riesgo.

## Reglas Por Estado

| Estado | Regla funcional | Datos actuales que ayudan | Datos que faltan o son parciales |
|---|---|---|---|
| `covered` | Bloque accionable con `valid_assignments >= required_coaches` y sin conflicto activo. | `schedule_blocks.required_coaches`; `schedule_block_assignments`; `coach_profiles.status`; `person_profiles`; `organization_memberships.status` cuando haya Auth. | Reglas de certificacion/disponibilidad y tests dedicados de calculo. |
| `uncovered` | Bloque accionable con `required_coaches > 0` y `valid_assignments = 0`. | `schedule_blocks.required_coaches`; `schedule_blocks.status`; asignaciones existentes. `schedule_blocks.status = 'uncovered'` puede servir como pista temporal. | Decidir si el status persistido se recalcula o se mantiene solo como override historico. |
| `insufficient` | Bloque accionable con `0 < valid_assignments < required_coaches`. | `required_coaches`; asignaciones por bloque; perfiles activos. | Tests dedicados de ratio `assigned/required`. |
| `conflict` | Coach con asignacion valida en dos o mas bloques activos que se solapan en tiempo, o regla futura de ausencia/certificacion/centro incompatible. | `schedule_blocks.service_date`, `start_time`, `end_time`, `center_id`; `schedule_block_assignments.coach_profile_id`; `centers`. | Reglas de buffer entre centros; disponibilidad/ausencias; certificaciones; estrategia para centros en distintas zonas horarias; tabla materializada opcional `coverage_issues`. |
| `pending` | Solicitud, asignacion o validacion esperando respuesta. En cobertura, `assignment_status = 'pending'` no cubre el bloque. | `schedule_block_assignments.assignment_status = 'pending'`. | `change_requests`, `absence_requests`, aprobaciones admin, motivos, fechas limite y actor que debe responder. |
| `approved` | Solicitud o validacion aceptada y aun relevante para el usuario. | Parcial: una asignacion `assigned` con `source = 'change_request'` podria indicar resultado aplicado, pero no conserva decision. | Tabla de solicitudes con `status = 'approved'`, aprobador, fecha, motivo y si ya se aplico al horario. |
| `rejected` | Solicitud, cobertura, ausencia, correccion u hora extra denegada. | Parcial: `assignment_status = 'declined'` puede reflejar rechazo de una oferta de cobertura. | Solicitudes con estado `rejected`, motivo, actor, trazabilidad y reglas de visibilidad. |
| `extra` | Bloque, asignacion u horas que exceden planificacion normal/contrato o provienen de cobertura especial. | `coach_profiles.weekly_contracted_hours`; duracion de bloques asignados; `schedule_block_assignments.source`; `class_types.category`. | `overtime_entries`; reglas de computo por periodo; aprobacion/rechazo; festivos/eventos; excepciones contractuales. |
| `event` | Bloque cuya naturaleza es evento, competicion, seminario u open day. | `class_types.category IN ('event', 'competition')`; `schedule_blocks.class_type_id`. | Tabla futura de eventos con fechas, participantes, impacto en cobertura y respuestas de coaches. |
| `holiday` | Dia o bloque afectado por festivo u horario especial. | `class_types.category = 'holiday'` permite modelar un bloque especial. | Calendario de festivos por organizacion/centro; reglas de voluntarios; impacto dia completo; diferencias locales por centro. |
| `cancelled` | Bloque marcado como cancelado. No requiere cobertura normal y no se borra. | `schedule_blocks.status = 'cancelled'`. | Motivo, actor, fecha de cancelacion y notificacion/historial de cambio. |
| `completed` | Bloque cerrado como ejecutado/finalizado. | `schedule_blocks.status = 'completed'`. | Regla de cierre automatico o manual; relacion futura con fichaje; si un bloque pasado no cerrado debe quedar como `scheduled` o entrar en revision. |
| `changed` | Bloque modificado respecto a plantilla, version previa o solicitud aplicada. | `schedule_blocks.status = 'changed'`; `is_template_exception`; `template_id`; `template_block_id`; campos comparables con `schedule_template_blocks`. | Historial/audit trail para mostrar antes/despues, actor, motivo y origen de cambio. |

## Detalle De Calculo

### Cobertura

Para cada bloque accionable:

```text
valid_assignments = count(assignments where assignment_status = 'assigned' and coach profile active and person/member active)
pending_assignments = count(assignments where assignment_status = 'pending')

if block is cancelled or completed -> inactive/no active risk
if required_coaches = 0 and no conflict -> no coverage requirement
if valid_assignments = 0 -> uncovered
if 0 < valid_assignments < required_coaches -> insufficient
if valid_assignments >= required_coaches and no conflict -> covered
```

`pending_assignments` puede mostrarse como contexto, pero no convierte un bloque en cubierto.

### Solapamientos

Dos bloques tienen solapamiento temporal si:

```text
same organization
same valid coach assignment
same service_date after timezone normalization
block_a.start_time < block_b.end_time
block_b.start_time < block_a.end_time
both blocks are active for coverage
```

Si un bloque termina exactamente a la hora en que otro empieza, no hay solapamiento basico. La regla de margen de traslado entre centros queda pendiente.

### Cambios Respecto A Plantilla

Un bloque puede considerarse `changed` si:

- `schedule_blocks.status = 'changed'`;
- o `is_template_exception = true`;
- o existe `template_block_id` y difiere alguno de estos campos respecto a `schedule_template_blocks`: dia de semana, hora, centro, tipo de actividad, `required_coaches` o notas operativas relevantes.

Para mostrar "antes -> despues" con confianza hace falta historial o versionado; la comparacion con plantilla solo explica diferencias respecto al patron actual.

## Datos Que Faltan Antes De Frontend Completo

- `change_requests` para pendientes, aprobados, rechazados y aplicados.
- Ausencias/disponibilidad para conflictos reales mas alla de solapamiento temporal.
- Eventos/festivos dedicados si se quiere representar dias completos.
- `overtime_entries` para `extra` con validacion.
- Certificaciones de coaches si `class_types.requires_certification` entra en cobertura.
- Reglas de timezone cuando un tenant tenga centros en zonas horarias distintas.
- Persistencia futura de `coverage_issues` si el calculo al vuelo deja de ser suficiente.

## Validacion Pendiente Con El Primer Tenant

No hay que inventar datos reales. Con STL debe validarse:

- semana real de bloques por centro;
- tipos de actividad exactos y `required_coaches`;
- casos reales de bloque sin coach;
- coaches multi-centro y solapamientos habituales;
- si existen bloques que requieren 0 coaches;
- si eventos/festivos deben verse como bloques, dias completos o ambas cosas;
- reglas de cambios y motivos que STL necesita ver.
