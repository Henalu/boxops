# Frontend Wireframes - BoxOps

Este documento cierra la preparacion frontend a nivel documental. Define wireframes y prototipos de baja fidelidad para las primeras superficies operativas, sin crear componentes, rutas, estilos ni tokens CSS reales.

BoxOps sigue siendo producto generico multi-tenant. Los ejemplos de contenido son genericos y deben validarse con una semana real del primer tenant antes de implementar frontend definitivo.

## Alcance

Pantallas prototipadas:

- Coach Today Dashboard, mobile-first.
- Weekly Schedule, mobile-first con adaptacion posterior a tablet/desktop.
- Team Schedule by Center, tablet/desktop.
- Admin Coverage Dashboard, tablet/desktop.

Fuera de alcance de este documento:

- Implementacion en `src/`.
- Nombres finales de componentes.
- Persistencia de theme config.
- Datos reales de ningun tenant.
- Flujos completos de solicitudes, fichaje o payroll.

## Principios Compartidos

### Pregunta Operativa Primero

Cada pantalla responde una pregunta concreta:

| Pantalla | Pregunta principal |
|---|---|
| Coach Today Dashboard | Que tengo hoy y que accion toca ahora? |
| Weekly Schedule | Como queda la semana y que bloques requieren atencion? |
| Team Schedule by Center | Quien trabaja en este centro y donde hay huecos o conflictos? |
| Admin Coverage Dashboard | Que riesgo operativo tengo hoy y esta semana? |

### Jerarquia De Informacion

Orden visual recomendado dentro de bloques, filas y alertas:

1. Estado operativo.
2. Fecha/hora.
3. Centro.
4. Tipo de actividad.
5. Coach asignado o vacante.
6. Accion posible.
7. Metadata secundaria.

### Navegacion

Movil:

- Bottom navigation con maximo cinco secciones: Hoy, Semana, Solicitudes, Calendario, Mas.
- Una sola capa principal de navegacion. El menu secundario agrupa cuenta, documentos, configuracion y superficies admin segun rol.
- La seccion activa debe ser evidente por icono, label y estado seleccionado.

Desktop/tablet:

- Sidebar o top nav compacto con Inicio/Hoy, Horario, Cobertura, Solicitudes, Calendario, Equipo, Documentos y Configuracion.
- El contexto de organizacion activa, centro y semana debe estar visible cuando afecte a la decision.
- Cambiar de pantalla conserva `organizationId` o futuro tenant activo, semana y filtros compatibles.

### Densidad Responsive

| Contexto | Densidad | Regla |
|---|---|---|
| Coach en movil | `coach-mobile` | Agenda vertical, tap targets de 44px, una accion principal cerca del bloque activo. |
| Admin en tablet | `admin-tablet` | Filtros visibles, paneles divididos y controles de 36-40px. |
| Admin en desktop | `admin-desktop-compact` | Listas y tablas densas, filtros persistentes y acciones junto al riesgo. |

### Theming Y Color

- El tema base usa neutrales, superficies claras, bordes sutiles y foco visible.
- El acento del tenant puede aparecer en nav activo, logo/switcher, filtros seleccionados o pequeños detalles.
- Los colores de centro y tipo de actividad son contexto secundario: dot, rail fino, chip o borde suave.
- Los estados `sin cubrir`, `conflicto` y `pendiente` ganan siempre sobre color de centro, tipo o tenant.

### Estados Compartidos

Todas las pantallas deben definir:

- loading inicial;
- loading local al cambiar semana, centro o filtro;
- empty state accionable;
- error state con recuperacion;
- readonly por rol o permiso;
- datos parciales sin bloquear toda la pantalla.

## 1. Coach Today Dashboard

Usuario principal: coach.

Formato principal: movil 375-430px.

Pregunta: "Que tengo hoy y que tengo que hacer ahora?"

### Contenido

- Header compacto con organizacion activa, fecha y acceso a cuenta.
- Card principal de siguiente bloque asignado.
- Estado de cobertura/fichaje si aplica.
- Acciones cercanas: abrir detalle, ver programacion, pedir cobertura cuando exista el flujo.
- Solicitudes urgentes del dia, si existen.
- Resumen secundario de horas planificadas de la semana.
- Cambios del dia como lista breve.

### Wireframe Movil

```text
+-------------------------------------+
| Hoy                         Perfil  |
| Jue 30 abr - Organizacion activa    |
+-------------------------------------+
| [estado] Siguiente bloque           |
| 17:00 - 18:00                       |
| Tipo de actividad                   |
| Centro - Sala / nota breve          |
| Coach: Tu                           |
|                                     |
| [Accion principal]  [Detalle]       |
| [Ver programacion]                  |
+-------------------------------------+
| Solicitudes                         |
| [pendiente] Cobertura solicitada    |
| Hoy - 19:00 - Centro                |
+-------------------------------------+
| Semana                              |
| 8h planificadas - 1 cambio          |
| Lun Mar Mie Jue Vie Sab Dom         |
|  .   .   .   *   .   .   .          |
+-------------------------------------+
| Cambios de hoy                      |
| [cambiado] Bloque movido a 18:00    |
+-------------------------------------+
 Bottom nav: Hoy - Semana - Solicitudes - Calendario - Mas
```

### Layout Y Ritmo

- El bloque principal ocupa el primer foco despues del header, no compite con KPIs.
- Hora en numeros tabulares y peso alto.
- Centro, tipo y notas en metadata agrupada; no separar en cards independientes.
- Solicitudes urgentes debajo del bloque principal, con menos peso salvo que sean accion requerida inmediata.
- Resumen semanal como contexto, nunca como hero metric.

### Tokens Base

- Fondo: `color.background`.
- Card principal: `color.surface`, `radius.md`, `color.border`.
- Hora: `text.xl` o `text.2xl`, `font.weight.semibold`, numeros tabulares.
- Metadata: `text.sm`, `color.foreground.muted`.
- Accion principal: `color.primary` o alias de accion, no color de estado.

### Theming De Tenant

- Mostrar nombre/logotipo de organizacion solo como contexto en header o switcher.
- Acento de tenant permitido en nav activo o detalle de seleccion.
- No usar color de tenant para comunicar cobertura, conflicto o pendiente.

### Prioridad Visual De Estados

Si el siguiente bloque esta cancelado, sin cubrir, cambiado o pendiente de accion:

1. Estado operativo en badge/rail superior.
2. Hora y centro.
3. Accion recomendada.
4. Color de centro/tipo como contexto menor.

### Estados De Pantalla

| Estado | Tratamiento documental |
|---|---|
| Empty | "No tienes bloques hoy" + acceso a Semana. Si hay solicitudes, se siguen mostrando. |
| Loading | Skeleton de header, card principal y 2 filas. La bottom nav no desaparece. |
| Error | Mensaje inline: no se pudo cargar el dia. Boton reintentar y enlace a Semana si hay cache futura. |
| Readonly | Vista normal de coach. Acciones admin ausentes; acciones futuras no disponibles se omiten o quedan explicadas si existe el flujo. |
| Datos parciales | Si fallan solicitudes pero carga el bloque, mostrar bloque y error local en seccion Solicitudes. |

### Validaciones Pendientes

- Si el coach debe ver solo sus bloques o tambien contexto completo del equipo.
- Si el fichaje entra en la primera version visual o queda como espacio reservado.
- Nombres reales de tipos de actividad y longitud maxima habitual.

## 2. Weekly Schedule

Usuarios principales: coach y admin.

Formato principal: movil como agenda por dia. Desktop puede evolucionar a grid semanal cuando existan asignaciones y cobertura.

Pregunta: "Como queda la semana y donde estoy/cubrimos?"

### Contenido

- Header con semana activa, boton Hoy y navegacion temporal.
- Filtros rapidos: Mi horario, centro, estado, tipo, solo sin cubrir.
- Agrupacion por dia.
- Bloques compactos con hora, estado, centro, tipo y coach/vacante.
- Acceso a detalle de bloque mediante row/card.
- Admin futuro: crear, editar, asignar o cancelar desde detalle, no desde todos los items a la vez.

### Wireframe Movil

```text
+-------------------------------------+
| Semana                      Hoy     |
| 27 abr - 3 may                      |
| < Semana anterior    Siguiente >    |
+-------------------------------------+
| [Mi horario] [Centro] [Estado] [+]  |
| [Solo sin cubrir]                   |
+-------------------------------------+
| Jueves 30 abr               Hoy     |
| +---------------------------------+ |
| | [cubierto] 09:00-10:00          | |
| | Tipo de actividad - Centro      | |
| | Coach asignado                  | |
| +---------------------------------+ |
| +---------------------------------+ |
| | [sin cubrir] 16:30-17:30        | |
| | Tipo de actividad - Centro      | |
| | Vacante - requiere 1 coach      | |
| +---------------------------------+ |
+-------------------------------------+
| Viernes 1 may                       |
| [festivo] Sin bloques programados   |
+-------------------------------------+
 Bottom nav: Hoy - Semana - Solicitudes - Calendario - Mas
```

### Wireframe Tablet/Desktop Futuro

```text
+--------------------------------------------------------------+
| Horario semanal - 27 abr - 3 may              Centro/Filtros |
+-------------+-------------+-------------+-------------+------+
| Lun         | Mar         | Mie         | Jue Hoy     | Vie  |
| 09:00 item  | 09:00 item  |             | 09:00 item  |      |
| 16:30 alerta|             | 18:00 item  | 16:30 alerta|      |
+-------------+-------------+-------------+-------------+------+
```

### Layout Y Ritmo

- En movil, cada dia es una seccion; los dias sin bloques no ocupan demasiado.
- Los filtros usan chips/segmented controls y pueden abrir sheet corto para opciones largas.
- En desktop, la semana debe permitir comparacion, pero no convertir cada bloque en una card pesada.
- El dia actual se marca con peso moderado y no debe competir con alertas.

### Tokens Base

- Secciones por dia: separacion `layout.stack.section`.
- Bloques: `radius.md`, borde sutil y rail de estado.
- Filtros: `layout.filter.gap`, altura tactil minima en movil.
- Hora: `text.sm` o `text.base` con numeros tabulares segun densidad.

### Theming De Tenant

- Centro seleccionado puede usar acento o color de centro como dot/chip.
- Colores de tipo se reducen a rail/dot cuando no hay riesgo.
- `state.uncovered`, `state.insufficient` y `state.conflict` sustituyen visualmente al color de tipo/centro.

### Prioridad Visual De Estados

Orden dentro de agenda:

1. `conflict` y `uncovered`.
2. `insufficient`.
3. `pending` o solicitudes vinculadas.
4. `changed`.
5. Bloques normales cubiertos.
6. `completed` y `cancelled` con bajo contraste.

### Estados De Pantalla

| Estado | Tratamiento documental |
|---|---|
| Empty semana | "No hay bloques esta semana" + si admin, CTA futura para crear/aplicar plantilla; si coach, enlace a otra semana. |
| Empty filtro | "No hay bloques con estos filtros" + limpiar filtros. |
| Loading | Mantener header/filtros, skeleton por dias visibles. |
| Error | Error local bajo header con reintento; conservar filtros y semana en URL/contexto. |
| Readonly | Coach puede abrir detalle y solicitar flujos disponibles; no ve controles admin de crear/editar/asignar. |
| Semana con festivo | El dia puede mostrar banda `festivo` y sus bloques especiales debajo. |

### Validaciones Pendientes

- Regla final de "mi horario" frente a "equipo completo" para coaches.
- Filtros iniciales por rol.
- Representacion de bloques que cruzan medianoche si algun tenant lo requiere.

## 3. Team Schedule By Center

Usuarios principales: admin y manager futuro.

Formato principal: tablet/desktop.

Pregunta: "Quien trabaja en este centro y hay conflictos de cobertura?"

### Contenido

- Contexto persistente: organizacion activa, centro activo, semana/dia.
- Selector de centro sin asumir numero fijo de centros.
- Filtros de estado, coach, tipo y solo incidencias.
- Vista principal por coach o por bloque segun modo.
- Horas planificadas por coach como dato secundario.
- Bloques vacantes y solapamientos visibles.
- Panel lateral de detalle para abrir bloque/coach sin perder la vista.

### Wireframe Tablet

```text
+------------------------------------------------------+
| Equipo por centro - Centro activo       Semana       |
| [Centro A] [Centro B] [Todos]  [Solo incidencias]    |
+----------------------+-------------------------------+
| Coaches              | Dia seleccionado / semana      |
| +------------------+ | 09:00  Tipo - cubierto         |
| | Coach A   12h    | | 10:00  Tipo - cubierto         |
| | Coach B   8h     | | 16:30  Tipo - sin cubrir       |
| | Coach C conflicto| | 18:00  Tipo - solapamiento     |
| +------------------+ |                               |
+----------------------+-------------------------------+
```

### Wireframe Desktop

```text
+----------------------------------------------------------------------+
| Sidebar | Equipo por centro - Centro activo - 27 abr - 3 may         |
|         | [Centro] [Coach] [Tipo] [Estado] [Solo incidencias]        |
+---------+-------------+-------------+-------------+----------------+
| nav     | Coach       | Lun         | Mar         | Mie ...        |
|         | Coach A     | 09:00 item  |             | 16:30 item     |
|         | Coach B     |             | conflict    |                |
|         | Vacantes    | uncovered   |             | insufficient   |
+---------+-------------+-------------+-------------+----------------+
```

### Layout Y Ritmo

- Evitar muro de cards: usar filas, divisores y rails de estado.
- La columna "Vacantes" o grupo de riesgos debe existir aunque no haya coach asignado.
- El centro activo permanece visible al hacer scroll.
- En tablet, preferir split view: lista de coaches/riesgos + timeline del dia.
- En desktop, permitir matriz semanal por coach cuando el ancho lo soporte.

### Tokens Base

- Densidad `admin-tablet` y `admin-desktop-compact`.
- Filtros y controles: 32-40px segun breakpoint.
- Separadores: `color.border`; estados con rail o badge, no fondos saturados.
- Panel de detalle: `surface.raised`, `shadow.md`, `radius.lg` si se usa overlay/sheet.

### Theming De Tenant

- Color de centro visible en selector, rail fino o dot.
- Logo/acento del tenant queda en shell, no en cada fila.
- Si un centro no tiene color configurado, usar fallback neutral.

### Prioridad Visual De Estados

- Una fila de coach con solapamiento usa `state.conflict` aunque el centro tenga otro color.
- Un bloque vacante usa `state.uncovered`.
- Ausencias futuras o solicitudes no confirmadas usan `state.pending`.
- Horas planificadas por coach no deben destacar mas que huecos sin cubrir.

### Estados De Pantalla

| Estado | Tratamiento documental |
|---|---|
| Empty centro | "No hay bloques en este centro para la semana" + cambiar centro o semana. |
| Empty filtro | Limpiar filtros y mantener centro/semana. |
| Loading | Skeleton de filtros y filas; sidebar/nav permanecen. |
| Error | Banner compacto con reintento; no borrar filtros de la vista. |
| Readonly | Roles no admin pueden consultar si tienen permiso; no ven reasignar, editar ni cancelar. |
| Muchas sedes | Selector como combobox/sheet, no tabs infinitas. |
| Muchos coaches | Lista con busqueda y agrupacion; no cargar visualmente todos como cards grandes. |

### Validaciones Pendientes

- Si el modo principal debe ser por coach, por bloque o con toggle.
- Regla de permisos para managers futuros por centro.
- Como mostrar ausencias cuando aun no exista el modulo formal.

## 4. Admin Coverage Dashboard

Usuario principal: admin.

Formato principal: tablet/desktop.

Pregunta: "Que riesgo operativo tengo hoy y esta semana?"

### Contenido

- Header con semana, centro/filtro y ultimo refresco si aplica.
- Resumen compacto de riesgos accionables, no KPIs decorativos.
- Lista priorizada: sin cubrir, insuficientes, conflictos, solicitudes urgentes.
- Agrupacion por urgencia y fecha.
- Acciones cercanas: abrir bloque, asignar coach, abrir solicitud.
- Empty state positivo cuando no hay incidencias.

### Wireframe Desktop

```text
+----------------------------------------------------------------------+
| Sidebar | Cobertura - 27 abr - 3 may        [Centro] [Estado] [Hoy] |
+---------+------------------------------------------------------------+
| nav     | Riesgo ahora                                              |
|         | +--------------+--------------+--------------+            |
|         | | Sin cubrir 3 | Insuf. 2     | Conflictos 1 |            |
|         | +--------------+--------------+--------------+            |
|         |                                                            |
|         | Cola de cobertura                                          |
|         | [sin cubrir] Jue 16:30 - Tipo - Centro  [Asignar] [Abrir] |
|         | [conflicto] Vie 18:00 - Coach - 2 centros [Resolver]      |
|         | [pendiente] Solicitud - Sab 10:00          [Revisar]       |
+---------+------------------------------------------------------------+
```

### Wireframe Tablet

```text
+----------------------------------------------+
| Cobertura - Semana                           |
| [Centro] [Solo riesgos] [Hoy]                |
+----------------------------------------------+
| Sin cubrir 3 - Insuficiente 2 - Conflictos 1 |
+----------------------------------------------+
| Prioridad alta                               |
| [sin cubrir] 16:30 - Tipo - Centro           |
| [Asignar] [Abrir bloque]                     |
|                                              |
| Atencion                                     |
| [pendiente] Solicitud de cambio              |
+----------------------------------------------+
```

### Layout Y Ritmo

- El dashboard empieza por trabajo pendiente, no por graficas.
- Los contadores son puerta de entrada a listas filtradas; no sustituyen la cola.
- Las listas usan agrupacion por prioridad y fecha.
- Acciones a la derecha en desktop; debajo o en menu compacto en tablet.
- El estado positivo sin incidencias debe tener presencia clara, pero sin hero visual enorme.

### Tokens Base

- Fondo neutral y superficies limpias.
- Riesgos: tokens semanticos con badge, icono y rail.
- Contadores: `text.lg` o `text.xl`, no hero scale.
- Separacion entre grupos: `layout.stack.section`.
- Listas: filas compactas con altura estable.

### Theming De Tenant

- El tenant accent puede marcar filtros activos o foco de shell.
- No usar acento de tenant para tarjetas de riesgo.
- Centro y tipo se muestran como metadata secundaria con dot/chip.

### Prioridad Visual De Estados

1. Sin cubrir y conflicto.
2. Cobertura insuficiente.
3. Solicitudes pendientes que impactan esta semana.
4. Cambios ya aprobados o cambiados.
5. Eventos/festivos informativos.
6. Completado/cancelado como contexto bajo.

### Estados De Pantalla

| Estado | Tratamiento documental |
|---|---|
| Sin incidencias | Estado positivo: "Todo cubierto para esta vista" + mostrar proximo bloque o resumen de semana. |
| Loading | Skeleton de contadores y 4 filas; filtros visibles. |
| Error | Error compacto con reintentar. Si hay cache futura, indicar que los datos pueden estar desactualizados. |
| Readonly | Usuario sin permiso de mutacion ve riesgos y enlaces, pero no botones de asignar/resolver. |
| Datos parciales | Si no cargan solicitudes, mantener riesgos de bloques y mostrar error local. |
| Sin centros activos | Empty de configuracion: crear/activar centro si rol admin; si readonly, contactar admin. |

### Validaciones Pendientes

- Prioridad final entre solicitud urgente y bloque sin cubrir.
- Si el dashboard debe abrir por "hoy" o por semana completa en admin.
- Que estados dependen de asignaciones reales frente a calculos derivados.

## Modelo De Detalle

Las cuatro pantallas deben abrir detalle sin perder contexto:

- Movil: sheet o pantalla detalle corta.
- Tablet: sheet lateral o pantalla segun complejidad.
- Desktop: panel lateral cuando permita comparar y actuar rapido.

El detalle conserva:

- organizacion activa;
- semana;
- centro/filtros compatibles;
- bloque o solicitud seleccionada;
- readonly si el rol no puede mutar.

## Handoff Antes De Implementar

Antes de convertir estos wireframes en UI:

- Validar una semana real del primer tenant.
- Usar la validacion conceptual multi-tenant de `frontend-validation-scenarios.md`.
- Confirmar permisos por rol para cada accion visible.
- Aplicar la decision de persistencia de theme config de `theme-config-decision.md`.
- Usar las reglas de calculo de estados de `coverage-state-rules.md`.
- Confirmar datos publicos de persona para no mostrar UUIDs en pantallas finales.
- Ejecutar futura auditoria visual/responsive/theming antes de cerrar frontend.
