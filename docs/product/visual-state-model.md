# Visual State Model - BoxOps

Este documento define el modelo visual de estados para BoxOps. Es una especificacion documental: no crea tokens CSS reales, componentes ni rutas.

Los estados son parte del producto base y no deben depender del tenant. El tenant puede aportar acento, logo y colores de centro/tipo, pero no puede cambiar el significado ni la prioridad visual de estados criticos.

## Objetivo

Permitir que coaches y admins reconozcan en segundos:

- que bloques estan cubiertos;
- que falta cubrir;
- donde hay cobertura insuficiente;
- donde un coach o bloque entra en conflicto;
- que solicitudes requieren accion;
- que eventos, festivos o cambios son contexto operativo.

Ningun estado debe comunicarse solo por color. Cada estado combina al menos dos señales: texto, icono, posicion, rail, borde, badge, patron o accion cercana.

## Familias De Estado

| Familia | Estados | Uso |
|---|---|---|
| Cobertura | cubierto, sin cubrir, cobertura insuficiente, conflicto/solapamiento | Horarios, cobertura, equipo por centro. |
| Workflow | pendiente, aprobado, rechazado, cambiado | Solicitudes, cambios, aprobaciones y validaciones. |
| Naturaleza del bloque | extra, evento, festivo | Contexto especial que modifica lectura del horario. |
| Ciclo de vida | cancelado, completado | Resultado o cierre de un bloque/evento. |

## Precedencia Visual

Cuando un item tenga varios estados, se renderiza visualmente el de mayor prioridad. Los otros quedan como metadata secundaria.

1. `conflict` y `uncovered`.
2. `insufficient`.
3. `pending` con accion requerida.
4. `changed`.
5. `rejected` o `approved` cuando definen resultado reciente.
6. `extra`, `event`, `holiday`.
7. `covered`.
8. `completed`.
9. `cancelled`.
10. Centro, tipo de actividad o acento de tenant.

Ejemplo: un bloque de un centro azul que esta sin cubrir se ve como `sin cubrir`; el azul de centro solo aparece como dot/chip secundario.

## Semantica Por Estado

| Estado visible | Token conceptual | Prioridad | Icono recomendado futuro | Tratamiento visual |
|---|---|---:|---|---|
| Cubierto | `state.covered` | Media | Check | Verde sobrio, badge claro, sin saturar la vista. |
| Sin cubrir | `state.uncovered` | Maxima | AlertTriangle / CircleAlert | Rose/red visible, rail fuerte, accion cercana. |
| Cobertura insuficiente | `state.insufficient` | Alta | AlertCircle | Amber, borde/rail medio, muestra requerido vs asignado. |
| Conflicto/solapamiento | `state.conflict` | Alta | GitCompare / AlertTriangle | Amber intenso o red suave, indicar causa del conflicto. |
| Pendiente | `state.pending` | Media-alta | Clock | Amber suave, accion esperada explicita. |
| Aprobado | `state.approved` | Media | CheckCircle | Verde estable, resultado ya confirmado. |
| Rechazado | `state.rejected` | Media | XCircle | Red contenido, motivo visible si aplica. |
| Extra | `state.extra` | Media | PlusCircle / Timer | Violeta o azul-violeta sobrio, no alarmista. |
| Evento | `state.event` | Media | CalendarDays | Azul informativo, distinto de clase recurrente. |
| Festivo | `state.holiday` | Media | CalendarHeart / Sparkles no decorativo | Teal/cyan contenido, orienta calendario y bloques especiales. |
| Cancelado | `state.cancelled` | Baja | Ban | Neutral bajo contraste, texto claro, no compite con riesgos. |
| Completado | `state.completed` | Baja | CheckCheck | Neutral/verde bajo, lectura de cierre. |
| Cambiado | `state.changed` | Media | RefreshCw | Azul o amber suave segun requiera accion; mostrar antes/despues si cabe. |

Los iconos son orientativos para futura implementacion con lucide-react. No forman parte de esta tarea.

## Detalle De Estados

### Cubierto

Significa que el bloque tiene la cobertura requerida y no presenta conflicto activo.

Uso:

- Horario semanal.
- Dashboard de coach.
- Team schedule.
- Coverage dashboard cuando un riesgo queda resuelto.

Visual:

- Badge "Cubierto".
- Verde sobrio como fondo suave o texto.
- Check pequeño.
- No usar fondos grandes verdes en vistas densas.

Copy recomendado:

- "Cubierto"
- "1/1 coach"
- "2/2 coaches"

### Sin Cubrir

Significa que el bloque no tiene ningun coach asignado o no tiene asignacion valida.

Uso:

- Prioridad maxima en Weekly Schedule, Team Schedule y Admin Coverage Dashboard.
- Puede aparecer en Coach Today solo si el coach visualiza contexto de equipo o una solicitud de cobertura.

Visual:

- Rail lateral fuerte.
- Badge "Sin cubrir".
- Icono de alerta.
- Accion cercana: "Asignar", "Pedir cobertura" o "Abrir bloque" segun rol/fase.

Copy recomendado:

- "Sin cubrir"
- "Requiere 1 coach"

En tarjetas compactas de Horario no se repite "Vacante" si ya aparece el badge "Sin cubrir"; solo aporta ruido y puede cambiar la altura visual del bloque.

### Cobertura Insuficiente

Significa que hay coaches asignados, pero menos de los requeridos.

Uso:

- Bloques con `required_coaches` mayor que asignaciones validas.
- Clases especiales, eventos o bloques con doble cobertura.

Visual:

- Amber.
- Mostrar ratio requerido/asignado.
- Prioridad alta, por debajo de sin cubrir y conflicto.

Copy recomendado:

- "Cobertura insuficiente"
- "1/2 coaches"
- "Falta 1 coach"

### Conflicto / Solapamiento

Significa que una asignacion entra en conflicto temporal, de centro, disponibilidad o regla futura.

Uso:

- Coach asignado a dos bloques solapados.
- Bloques en centros incompatibles por tiempo.
- Ausencias futuras que afecten a un bloque.

Visual:

- Badge "Conflicto" o "Solapamiento".
- Icono de alerta/comparacion.
- Mensaje breve de causa si cabe: "Mismo coach en 2 bloques".
- En desktop, enlace a ambos bloques afectados.

Copy recomendado:

- "Solapamiento"
- "Conflicto"
- "Coach asignado en otro bloque"

### Pendiente

Significa que una solicitud, cambio, cobertura, ausencia o validacion espera respuesta.

Uso:

- Requests Inbox.
- Dashboard admin.
- Coach Today cuando requiere accion del coach.
- Bloques con solicitud vinculada.

Visual:

- Amber suave.
- Icono de reloj.
- Diferenciar si espera al coach, admin o sistema.

Copy recomendado:

- "Pendiente"
- "Pendiente de admin"
- "Esperando respuesta"

### Aprobado

Significa que una solicitud o validacion fue aceptada.

Uso:

- Solicitudes.
- Ausencias futuras.
- Cambios aplicables.
- Horas extra en fases posteriores.

Visual:

- Verde estable.
- Menos peso que riesgos activos.
- Si ya se aplico al horario, puede convivir con `changed` como metadata.

Copy recomendado:

- "Aprobado"
- "Aprobado por admin"

### Rechazado

Significa que una solicitud fue denegada o una validacion no fue aceptada.

Uso:

- Solicitudes de cambio/cobertura.
- Correcciones futuras.
- Horas extra futuras.

Visual:

- Red contenido.
- Mostrar motivo si existe.
- No usar dramatismo visual si ya no requiere accion.

Copy recomendado:

- "Rechazado"
- "No aprobado"
- "Motivo pendiente" si falta explicacion obligatoria.

### Extra

Significa que el bloque, horas o asignacion se consideran extra respecto a planificacion normal o contrato.

Uso:

- Horas extra futuras.
- Coberturas adicionales.
- Eventos/festivos con horas especiales.

Visual:

- Violeta o azul-violeta sobrio.
- Indicador secundario si tambien hay riesgo critico.
- No debe parecer alerta por si mismo.

Copy recomendado:

- "Extra"
- "Hora extra"
- "Pendiente de validar" cuando aplique workflow.

### Evento

Significa que el bloque es evento, competicion, seminario, open day u otra actividad especial.

Uso:

- Weekly Schedule.
- Monthly Calendar futuro.
- Admin Coverage cuando impacta cobertura.

Visual:

- Azul informativo.
- Icono calendario.
- Si el evento esta sin cubrir, domina `uncovered`.

Copy recomendado:

- "Evento"
- "Actividad especial"

### Festivo

Significa que el dia o bloque esta afectado por festivo o planificacion especial.

Uso:

- Semana y calendario.
- Bloques especiales de festivo.
- Coverage dashboard si requiere voluntarios o cobertura.

Visual:

- Teal/cyan contenido.
- Banda ligera en el dia o badge en bloque.
- Si hay cobertura pendiente, domina `pending` o `uncovered`.

Copy recomendado:

- "Festivo"
- "Horario especial"

### Cancelado

Significa que el bloque ya no requiere ejecucion normal.

Uso:

- Schedule blocks cancelados.
- Eventos cancelados.
- Solicitudes canceladas en fases futuras.

Visual:

- Neutral bajo contraste.
- Texto o hora con tratamiento atenuado, sin eliminar legibilidad.
- No ocultar automaticamente si explica cambios de la semana.

Copy recomendado:

- "Cancelado"
- "Bloque cancelado"

### Completado

Significa que el bloque o flujo ya termino correctamente.

Uso:

- Bloques pasados.
- Validaciones cerradas.
- Solicitudes aplicadas/completadas futuras.

Visual:

- Neutral/verde bajo.
- Prioridad baja.
- Puede agruparse o plegarse en vistas densas.

Copy recomendado:

- "Completado"
- "Finalizado"

### Cambiado

Significa que el bloque o solicitud fue modificado respecto a su estado original.

Uso:

- Excepciones de plantilla.
- Cambios de hora, coach, centro o tipo.
- Solicitudes aprobadas aplicadas al horario.

Visual:

- Azul o amber suave segun si requiere revisar.
- Mostrar "antes -> despues" en detalle, no necesariamente en lista.
- Prioridad media, salvo que el cambio cause conflicto.

Copy recomendado:

- "Cambiado"
- "Modificado"
- "Antes: 17:00 - Ahora: 18:00"

## Aplicacion Por Pantalla

### Coach Today Dashboard

- Estado principal vive en la card de siguiente bloque.
- `pending` puede aparecer como solicitud urgente debajo del bloque.
- `cancelled` o `changed` deben verse antes de que el coach llegue al centro equivocado.
- `covered` es confirmacion normal, no elemento protagonista.

### Weekly Schedule

- Agenda movil ordena por dia y hora, pero los badges de riesgo deben saltar visualmente.
- Filtro "Solo sin cubrir" incluye `uncovered` e, idealmente, `insufficient` si el copy lo aclara.
- `completed` y `cancelled` bajan contraste en dias pasados o bloques cerrados.

### Team Schedule By Center

- `conflict` y `uncovered` son filas/grupos visibles.
- Las horas planificadas y colores de centro nunca superan visualmente a riesgos.
- Un coach con conflicto debe enlazar a ambos bloques afectados.

### Admin Coverage Dashboard

- La cola se agrupa por prioridad: sin cubrir/conflicto, insuficiente, pendiente, informativo.
- Contadores usan los mismos estados que la lista para no inventar otra semantica.
- Estado positivo sin incidencias debe ser claro y breve.

## Reglas De Accesibilidad

- No usar color como unica señal.
- Mantener contraste AA para texto.
- Badges deben incluir label textual.
- Iconos decorativos deben tener `aria-hidden` futuro; iconos que comunican estado necesitan texto cercano.
- Foco visible con `color.ring`, no con color de tenant si no pasa contraste.
- En vistas densas, no esconder el estado solo en tooltip.

## Reglas De Theming

El tenant puede configurar:

- acento;
- logo;
- color por centro;
- color por tipo de actividad.

El tenant no puede configurar:

- significado de estados;
- prioridad de riesgos;
- color/familia visual de `uncovered`, `conflict`, `error` y foco;
- contraste minimo;
- copy generico de estado.

## Datos Necesarios Para Calculo Futuro

Las reglas funcionales detalladas estan documentadas en `coverage-state-rules.md`. Resumen:

- `covered`: asignaciones validas >= `required_coaches` y sin conflicto.
- `uncovered`: asignaciones validas = 0 para bloque que requiere cobertura.
- `insufficient`: 0 < asignaciones validas < `required_coaches`.
- `conflict`: solapamiento temporal, centro incompatible, ausencia o regla futura.
- `changed`: diferencia respecto a plantilla o version anterior auditada.
- `completed`: bloque pasado cerrado o marcado como completado.
- `cancelled`: bloque con status cancelado, sin borrado.

La validacion conceptual con segundo tenant queda documentada en `frontend-validation-scenarios.md`. Sigue pendiente validar estas reglas con una semana real del primer tenant.
