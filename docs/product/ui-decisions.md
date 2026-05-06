# UI Decisions - BoxOps

## Task 017 - Refactor UX/UI Operativo MVP 1

Fecha: 2026-05-04.

## Problema

La UI MVP 1 funcionaba, pero se leia como panel tecnico: navegacion plana, Inicio demasiado explicativo, Equipo mezclado con conceptos internos y Cobertura sin una ruta propia de resolucion.

## Decisiones

- Navegacion principal: Inicio, Horario, Cobertura, Equipo y Mas.
- Mobile: bottom navigation de 5 items.
- Desktop/tablet: sidebar con seccion Principal y Gestion.
- Gestion agrupa Centros, Tipos de actividad y Plantillas.
- `/app/coaches` se mantiene como ruta por compatibilidad, pero el producto la presenta como Equipo.
- `/app/coverage` separa la cola de riesgos del dashboard de Inicio.
- `/app/more` agrupa gestion, ayuda y reinicio de guia.
- Onboarding inicial con `localStorage` y key `boxops_onboarding_seen_v1`.
- Configuracion queda visible como placeholder no disponible; no se implementa modulo nuevo.
- El acento base del producto pasa a teal/petroleo mediante tokens CSS, no como regla de tenant.

## Copy

Se evita usar en UI principal:

- mutaciones;
- tenant activo;
- membership;
- CRUD;
- Supabase Auth;
- superficie semanal;
- query string.

Se prioriza:

- box;
- centro;
- coach;
- clase;
- actividad;
- horario;
- cobertura;
- plantilla;
- semana;
- pendiente;
- sin cubrir;
- asignar;
- resolver.

## Verificacion

- Playwright contra `http://127.0.0.1:3000`.
- Viewports 390x844 y 1280x800.
- Evidencia en `test-results/ux-refactor-2026-05-04/`.
- Sin overflow horizontal de pagina en rutas auditadas.
- Sin errores de consola ni overlays de framework.

## Limites

- No cambia schema, permisos ni RLS.
- No crea tabla de configuracion visual.
- No implementa cambios, ausencias, fichaje, payroll, miembros, pagos, reservas, eventos avanzados, IA ni geolocalizacion.
- La validacion con semana real del primer tenant sigue pendiente.

## Task 018 - Horario Visual Semanal

Fecha: 2026-05-04.

## Problema

`/app/schedule` conservaba bien los datos de bloques, filtros y asignaciones, pero la lectura principal era una lista tecnica con formularios visibles. Permitía editar, pero no entender la planificacion semanal de un vistazo.

## Decisiones

- La vista principal de Horario pasa a ser `Semana`.
- Se añade `view=week|agenda|month` en la URL para alternar entre Semana, Agenda y Mes sin perder `organizationId`, semana ni filtros.
- `Semana` usa grid semanal con columnas por dia y filas por hora en desktop.
- En movil, `Semana` se adapta a agenda por dia para evitar una tabla horizontal compleja.
- `Agenda` conserva la lectura por dia/hora, pero muestra bloques compactos y abre detalle en panel.
- `Mes` funciona como overview/navegacion: dias con riesgos, eventos, festivos o cambios, sin intentar resolver asignaciones finas.
- La creacion de bloque queda en un panel plegable separado de filtros y lectura de calendario.
- La edicion, asignacion y cancelacion se mueven al detalle del bloque mediante panel lateral activado por query param `block_id`.

## Limites

- No cambia schema, permisos, RLS ni calculo de cobertura.
- La vista Mes se alimenta de `schedule_blocks` y categorias actuales; festivos/eventos dedicados quedan para schema futuro.
- El panel lateral usa `block_id` en query params para mantener server components sin introducir estado cliente ni depender de anchors/hash.
- Sigue pendiente validar densidad y colores con una semana real completa del primer tenant.

## Task 019 - Resolucion Desde Cobertura

Fecha: 2026-05-05.

## Problema

La cola de `/app/coverage` mostraba riesgos accionables, pero el boton principal redirigia a `/app/schedule`. Eso obligaba al admin a cambiar de pantalla para asignar o retirar coaches, perdiendo la lectura de cola.

## Decisiones

- Los botones de riesgo y "Abrir" en Cobertura abren un panel lateral dentro de `/app/coverage`.
- El panel permite asignar y retirar coaches con las mismas server actions canonicas de horario.
- Las acciones aceptan `returnPath` validado para volver a `/app/coverage` o `/app/schedule` sin abrir redirecciones externas.
- Tras asignar o retirar, Cobertura conserva semana, organizacion y panel del bloque abierto.
- El enlace "Ver en horario" queda como salida secundaria cuando el admin necesita contexto de calendario completo.

## Limites

- No cambia schema, RLS ni calculo de cobertura.
- No implementa bulk assignment ni workflow de solicitudes; sigue siendo asignacion manual de bloque.
- No extrae todavia un componente compartido de panel de bloque entre Horario y Cobertura; queda como candidato si aparece una tercera superficie.

## Guardrails Operativos De Paneles

- No usar anchors/hash `#...` como mecanismo principal para abrir sidepanels en App Router si el panel depende de render server o estado de ruta.
- Para paneles de detalle abiertos desde listados o calendarios, usar query params controlados como `?block_id=...`.
- Usar `Link scroll={false}` cuando abrir o cerrar un panel no debe mover al usuario de su posición actual.
- Verificar por separado cada flujo que comparta patrón: Horario y Cobertura no deben asumirse equivalentes aunque abran un panel similar.
- No tocar estética cuando el bug reportado es funcional.
- Antes de cambiar un patrón que ya funcionaba, comprobar links generados, estado de ruta, cierre, `returnPath` de server actions y persistencia tras guardar.
- En interfaces en castellano, respetar `ñ`, acentos y caracteres propios del idioma.
- Si se introduce una solución temporal o incompleta, documentar motivo y camino recomendado para estabilizarla.

## Task 020 - Nota Futura: Categorias De Tipos De Actividad

Fecha: 2026-05-05.

## Contexto

La pantalla de Tipos de actividad permite editar cada tipo, pero la lista de categorias mostradas en el selector sigue siendo una lista base fija del producto.

## Decision Futura

- La gestion de categorias debe vivir en el futuro modulo de Configuracion, no como una accion aislada dentro de la pantalla de Tipos de actividad.
- El admin debe poder añadir, editar, desactivar y eliminar categorias visibles para su organizacion.
- Eliminar debe tratarse con cautela: si la categoria ya esta en uso por tipos, bloques o plantillas, la opcion segura es desactivar/archivar para conservar historial operativo.
- La pantalla de Tipos de actividad debera consumir ese catalogo configurable cuando exista, manteniendo la frontera por organizacion.

## Limites

- No se modifica UI ni comportamiento en esta iteracion.
- No se cambian schema, migraciones, RLS ni acciones.
- La fase futura debe revisar la lista fija actual y la restriccion de `class_types.category` antes de hacer configurable el selector.

## Fase A - Edicion De Plantillas Grandes

Fecha: 2026-05-06.

## Problema

Una plantilla semanal real con 165 bloques era editable, pero la unica lectura disponible era una agenda vertical larga. Incluso con un solo formulario abierto cada vez, revisar o corregir por dia seguia exigiendo demasiado scroll.

## Decisiones

- `/app/templates` usa `view=week|agenda` para alternar todas las plantillas de la pantalla a la vez.
- `Semana` es la vista por defecto y agrupa bloques de plantilla por dia con una sola cabecera de dias en escritorio.
- En movil, `Semana` usa selector compacto de dia y muestra solo el dia seleccionado, igual que Horario.
- Las tarjetas de bloque en Semana son compactas para evitar solapes en columnas densas.
- `Agenda` conserva la lista vertical existente para revision lineal por dia y hora.
- La edicion de bloque se abre con estado cliente: panel lateral en escritorio, formulario inline bajo la tarjeta en movil.
- Abrir o cerrar edicion no cambia la URL, no dispara navegacion y no debe mover el scroll.
- Formularios y server actions conservan `view` al guardar o volver con error.
- Formularios y server actions conservan tambien `day` para no perder el dia activo en movil.

## Limites

- No cambia schema, permisos, RLS ni aplicacion de plantillas.
- No introduce reglas especiales del tenant piloto ni copy con nombres del tenant en `src`.
- El scroll horizontal vive dentro del tablero semanal de escritorio; no debe convertirse en overflow de pagina.
- La accion de guardar sigue siendo server action; el objetivo de estado cliente es evitar recargas al abrir/cerrar edicion.
