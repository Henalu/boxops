# UI Decisions - BoxOps

## Slugs Internos En Gestion Basica

Fecha: 2026-06-08.

## Problema

En user testing, los admins no entendian el campo "slug interno" al crear centros y tipos de actividad. Es un identificador tecnico, no una decision operativa del usuario.

## Decisiones

- Centros y tipos de actividad no muestran ni piden slug en creacion o edicion.
- El servidor genera el slug al crear desde el nombre visible, normalizando minusculas, acentos, simbolos y espacios.
- El slug se mantiene estable si despues cambia el nombre visible.
- La unicidad del slug es por organizacion, no global de BoxOps.
- Si ya existe el slug base, se usa el siguiente disponible con sufijo numerico.

## Limites

- No cambia schema ni constraints existentes.
- No introduce una superficie avanzada para editar identificadores tecnicos.
- La UI normal solo gestiona nombres visibles y datos operativos.

## Foco Por Centro En Plantillas

Fecha: 2026-06-08.

## Problema

En user testing, Plantillas mezclaba patrones de varios centros en la misma lista. En boxes multi-centro, eso obligaba al admin a revisar cada tarjeta para saber a que sede afectaba antes de crear o ajustar bloques.

## Decisiones

- La seccion "Plantillas semanales" incorpora un selector de centro con el mismo patron visual que Horario.
- Por defecto se enfoca un centro disponible para reducir ruido operativo.
- La opcion global se llama "Todas" y usa `center_id=all` para que una vista global no se confunda con una URL sin parametro.
- Las plantillas con `schedule_templates.center_id` solo aparecen en su centro o en "Todas"; las plantillas sin centro fijo solo aparecen en "Todas".
- Los formularios, pestanas, edicion de bloques y server actions conservan el foco elegido al guardar, copiar, archivar, restaurar o volver con error.
- El filtro visual no sustituye el centro real de plantillas o bloques: `centerFilterId` es contexto de pantalla; `centerId` sigue siendo dato operativo.
- La creacion rapida de bloques desde el grid semanal permite elegir varios dias, mantiene el modal abierto tras guardar y usa banner temporal flotante para confirmar la accion sin incrustar avisos en el formulario.
- Al crear bloques de plantilla, la sincronizacion automatica queda acotada a la semana visible con `ensureScheduleTemplateCurrentWeekApplied(...)`; no barre todo el rango activo en una accion secuencial.
- El grid semanal de plantillas mantiene scroll horizontal nativo, columna de horas fija y flechas laterales sin bandas difuminadas cuando hay dias ocultos; las flechas se centran sobre la parte visible del cuerpo del calendario, con margen vertical respecto a la cabecera y al final del grid, sin perder la referencia horaria.
- Cuando un bloque comparte franja y la tarjeta queda estrecha, se elimina informacion redundante: la bolita de color no se muestra porque la tarjeta ya esta coloreada y la accion de editar pasa a icono de lapiz con etiqueta accesible. Si coinciden tres o mas bloques en paralelo, la tarjeta entra en modo minimo y oculta visualmente hora, centro y entrenador, conservando checkbox, icono de actividad y accion.

## Limites

- No cambia schema, RLS ni permisos.
- No modifica el panel superior de creacion de plantilla.
- No introduce preferencia persistida por cookie para Plantillas; la URL es la fuente de estado de esta vista.
- La seleccion multiple de dias esta disponible tanto en "Anadir bloque" como en el modal rapido de doble clic; el modo secuencial aplica al modal rapido de un slot concreto.
- La sincronizacion de rango se conserva para acciones que cambian una plantilla/bloque ya existente o aplican la plantilla, pero no para cada alta rapida de bloque.
- Las barras de scroll de superficies densas deben ser discretas: transparentes en reposo y visibles durante actividad de scroll o foco, sin carriles permanentes que ensucien la lectura.

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
- El panel lateral usa `block_id` en query params para conservar URL compartible sin depender de anchors/hash.
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
- Para paneles de detalle/edicion abiertos desde listados o calendarios, usar query params controlados como `?block_id=...` o `?edit_block_id=...`.
- En `/app/schedule`, `/app/coverage` y `/app/templates`, abrir/cerrar detalles o edicion de tarjetas operativas no debe hacerse con `Link`/`router.push` de App Router si el cambio solo altera `block_id` o `edit_block_id`: eso provoca request RSC, reejecuta la pagina server y puede destruir contexto/scroll.
- Para ese caso, usar estado cliente + History API nativa (`RouteStateLink`) y mantener el render server solo como carga inicial/shareable URL. `Link scroll={false}` por si solo no evita la navegacion RSC.
- No reemplazar `RouteStateButton`/`RouteStateLink` por `Button asChild` + `Link` en triggers de tarjetas operativas sin una especificacion que acepte recarga RSC y perdida de contexto.
- Mantener los atributos `data-operational-detail-trigger` y `data-operational-detail-panel`: el smoke depende de ellos para detectar regresiones de navegacion.
- Verificar por separado cada flujo que comparta patrón: Horario, Cobertura y Plantillas no deben asumirse equivalentes aunque abran un panel similar.
- No tocar estética cuando el bug reportado es funcional.
- Antes de cambiar un patrón que ya funcionaba, comprobar links generados, estado de ruta, cierre, `returnPath` de server actions y persistencia tras guardar.
- En interfaces en castellano, respetar `ñ`, acentos y caracteres propios del idioma.
- Antes de cerrar cambios con copy en español, buscar mojibake real en los archivos tocados con `rg -n "\x{00c3}|\x{00c2}|\x{00e2}|\x{fffd}"` y verificar los casos dudosos con lectura UTF-8, no con la salida de PowerShell.
- Los avisos de exito/error de pantalla deben usar `TransientFeedbackBanner` o una superficie temporal flotante equivalente; no insertar confirmaciones como bloques verdes dentro de formularios, modales o cards, salvo validaciones inline junto al campo afectado.
- Si se introduce una solución temporal o incompleta, documentar motivo y camino recomendado para estabilizarla.
- Ejecutar `npx playwright test --config=playwright.smoke.config.ts tests/smoke/operational-detail-panels.spec.ts` despues de tocar Horario, Cobertura, Plantillas, `RouteStateLink`, `operations-ui` o generadores de rutas con `block_id`/`edit_block_id`.

## Task 020 - Nota Futura: Categorias De Tipos De Actividad

Fecha: 2026-05-05.

## Contexto

La pantalla de Tipos de actividad permite editar cada tipo, pero la lista de categorias mostradas en el selector sigue siendo una lista base fija del producto.

## Decision Futura

- La gestion de categorias debe vivir en el futuro modulo de Configuracion, no como una accion aislada dentro de la pantalla de Tipos de actividad.
- El admin debe poder añadir, editar, desactivar y eliminar categorias visibles para su organizacion.
- Eliminar debe tratarse con cautela: si la categoria ya esta en uso por tipos, bloques o plantillas, la opcion segura es desactivar/archivar para conservar historial operativo.
- La pantalla de Tipos de actividad debera consumir ese catalogo configurable cuando exista, manteniendo la frontera por organizacion.

## Task 021 - Regresion De Apertura De Detalles

Fecha: 2026-05-11.

## Problema

En `/app/schedule` vista Semana y `/app/coverage`, las tarjetas volvieron a abrir el detalle mediante enlaces a la misma ruta con `?block_id=...`. Aunque esos enlaces usaban `scroll={false}`, App Router hacia una navegacion RSC y reejecutaba la pagina server, generando recarga perceptible y perdida de contexto al abrir o cerrar.

## Decision

- Los triggers de tarjetas operativas usan `RouteStateLink`, que intercepta clicks normales dentro de la misma ruta y actualiza la URL con `window.history.pushState`.
- Los paneles de detalle viven como componentes cliente hidratados con los datos ya cargados por la pagina server.
- Las URLs con `block_id` siguen siendo compartibles: una carga directa inicializa el panel desde `searchParams`.
- Cerrar el panel elimina `block_id` con History API, sin navegar ni pedir un nuevo RSC.
- En Horario y Cobertura, los triggers principales se renderizan como botones cliente de estado de ruta, no como anchors. Asi no existe fallback de navegacion completa para una accion que solo abre/cierra un panel.
- En desarrollo local, `127.0.0.1` debe estar permitido en `allowedDevOrigins` si el dev server se anuncia como `localhost`; si Next bloquea recursos/HMR de dev, los componentes cliente no hidratan y los paneles vuelven a depender de navegacion server-side.

## Verificacion

- Smoke dedicado: `tests/smoke/operational-detail-panels.spec.ts`.
- El smoke valida que abrir detalle en Horario/Cobertura o editar bloques en Plantillas no emite request RSC para la misma ruta, conserva `scrollY` y elimina `block_id`/`edit_block_id` al cerrar. Ejecutarlo contra `127.0.0.1` cubre tambien la configuracion `allowedDevOrigins`.

## Limites

- No rediseña el calendario, la cola de cobertura ni el shell protegido.
- No cambia schema, migraciones, RLS ni modelo de permisos.
- La fase futura debe revisar la lista fija actual y la restriccion de `class_types.category` antes de hacer configurable el selector.

## Task 022 - Disponibilidad De Coach En Detalles Operativos

Fecha: 2026-05-11.

## Problema

En los paneles de `/app/schedule` y `/app/coverage`, el selector de "Coach asignable" podia ofrecer coaches ya asignados a otro bloque activo solapado del mismo dia. Eso facilitaba crear una asignacion imposible y obligaba al admin a resolver despues un conflicto evitable.

## Decision

- El selector de coach se filtra en cliente con los bloques/asignaciones de la semana ya cargados, para no mostrar coaches ocupados en la misma franja.
- Si no quedan coaches libres por solape, el select indica "Sin coaches libres en esta franja" y el panel muestra un resumen de coaches no disponibles.
- El filtro frontend es solo ayuda UX. La garantia final vive en Postgres mediante `00011_schedule_assignment_overlap_guard.sql`, que bloquea nuevas asignaciones `assigned` solapadas por tenant, coach y dia.
- Las server actions de Horario, Cobertura y Plantillas traducen el `23P01` de Postgres a `coach-unavailable`.
- El estado visual `conflict` se conserva para datos legacy/importados o reglas futuras; la UI normal no debe crear solapes temporales nuevos.

## Verificacion

- Smoke unitario: `tests/smoke/schedule-coach-availability.spec.ts`.
- Caso cubierto: un coach asignado de 11:15 a 12:15 queda no disponible para 11:00 a 12:00; bloques adyacentes y asignaciones retiradas/canceladas no bloquean.
- Si se toca asignacion de coaches, plantillas aplicadas, estados de bloque o `schedule_block_assignments`, ejecutar tambien `npx supabase db lint --local` y verificar que el error `23P01` sigue mapeando a `coach-unavailable`.

## Task 023 - Campos Densos En Formularios Operativos

Fecha: 2026-05-11.

## Problema

En formularios operativos compactos, algunos inputs/selects con UUIDs, nombres largos o valores de rol/estado quedaban visualmente colapsados: el texto competia con la flecha del select y en movil se leia apretado.

## Decision

- En movil, campos largos como cuenta UUID, persona/ficha pendiente, cuenta real o notas deben poder ocupar ancho completo si el grid compacto compromete lectura.
- Pares cortos y frecuentes como Rol/Estado pueden mantenerse en dos columnas si conservan aire suficiente.
- Inputs/selects deben reservar padding derecho para el icono/flecha nativa y usar truncado/ellipsis cuando el valor pueda ser largo.
- No resolver este problema aumentando todo indiscriminadamente: la pantalla sigue siendo admin operativa densa, no una landing ni un formulario editorial.
- No hardcodear nombres del primer tenant ni longitudes concretas; el patron debe soportar UUIDs y nombres largos genericos.

## Verificacion

- Revisar 390px/desktop en los formularios afectados.
- Confirmar que texto, flecha y boton no se solapan y que los campos largos no empujan fuera del contenedor.
- Mantener `rg -n "STL" src` sin referencias.

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
- Abrir o cerrar edicion puede conservar `edit_block_id` en la URL para shareability, pero debe hacerlo con History API/`RouteStateLink`, sin navegacion App Router, sin request RSC y sin mover el scroll.
- Formularios y server actions conservan `view` al guardar o volver con error.
- Formularios y server actions conservan tambien `day` para no perder el dia activo en movil.

## Limites

- No cambia schema, permisos, RLS ni aplicacion de plantillas.
- No introduce reglas especiales del tenant piloto ni copy con nombres del tenant en `src`.
- El scroll horizontal vive dentro del tablero semanal de escritorio; no debe convertirse en overflow de pagina.
- La accion de guardar sigue siendo server action; el objetivo de estado cliente es evitar recargas al abrir/cerrar edicion.

## Cierre UX Operativo 2026-05-14

Fecha: 2026-05-14.

## Problema

Tras abrir fichaje, solicitudes, proxima clase y plantillas grandes, varias pantallas eran correctas tecnicamente pero demasiado ruidosas o poco enfocadas para el uso diario. Tambien habia riesgos de regresion: ocultar Inicio/Mas a entrenadores, volver a mostrar mensajes de "sin permiso", perder la proxima clase persistente o tratar textos legales/de alcance como contenido principal.

## Decisiones

- Proxima clase asignada:
  - Inicio muestra una tarjeta fuerte con la proxima clase/bloque propio.
  - El shell muestra siempre un resumen clicable hacia el horario de esa semana, tambien en Inicio. La tarjeta grande y el resumen persistente cumplen funciones distintas: detalle principal y recordatorio fijo.
  - En mobile el resumen vive en el encabezado; debe tener contraste propio y no depender de amarillo sobre amarillo.
  - El servidor calcula el bloque; el cliente solo refresca el contador visual.
- Navegacion por rol:
  - Entrenador mantiene Inicio y Mas.
  - Plantillas no aparece como opcion cotidiana para Entrenador.
  - Mas para Entrenador debe priorizar documentos futuros, estadisticas personales, ayuda, cuenta, fichaje y solicitudes propias.
  - No mostrar tarjetas de "Acceso no autorizado" cuando el usuario no deberia interactuar con esa cola.
- Copy y ruido:
  - Evitar "tenant" en UI; usar "organizacion" o texto de producto mas natural.
  - Textos de alcance, no-incluye, limites legales o roadmap quedan detras de "Mas" o "Mas informacion".
  - No duplicar bloques de accesos rapidos en Inicio.
  - El contenido principal debe hablar de la accion del usuario, no de la arquitectura interna.
- Fichaje:
  - Registrar entrada/salida es accion primaria y debe aparecer arriba.
  - Centro principal del coach se preselecciona si existe; sigue siendo editable cuando el usuario necesita corregir contexto.
  - Fecha y hora vienen con valor actual por defecto, pero son editables para evitar fichar mal y corregir despues.
  - La revision administrativa se oculta para Entrenador si no tiene permiso.
- Plantillas:
  - Los filtros de bloques son colapsables para no ocupar espacio permanente.
  - Filtros minimos: sin asignar/asignado y tipo de actividad.
  - La seleccion multiple usa el checkbox junto al titulo del bloque.
  - La edicion multiple no permite cambiar dia/hora; solo entrenador por defecto, notas, entrenadores necesarios y centro cuando la plantilla cubre todos los centros.
  - Si la plantilla tiene centro acotado, el centro del bloque es readonly.
  - El label compacto de bloque asignado es "Asignado"; evitar "Con entrenador" por largo.
- Formularios densos:
  - Selects de Horario, Plantillas, Centros y Equipo deben reservar espacio para flecha/ellipsis.
  - Si el valor puede ser largo, ampliar campo o truncar texto antes de permitir solape visual.
- Colores:
  - Las selecciones de color deben ofrecer paleta rapida y mantener entrada manual hexadecimal.
  - Estados criticos, error y foco no se tematizan con el color de organizacion.

## Guardrails

- No introducir Notification API, PushManager, service worker, background sync, CacheStorage ni `navigator.geolocation` para resolver recordatorios web.
- No convertir el contador de proxima clase en fuente de verdad.
- No volver a ocultar `NextAssignedShellLink` en `/app`: sidebar desktop y encabezado mobile deben conservar el resumen persistente si hay proxima clase.
- No reabrir copy tecnico como "tenant", "payload", "RPC" o "membership" en pantallas de usuario.
- Si se toca Inicio, mantener `data-tour` y los targets reales de guia para Resumen de la semana y Pendiente.
- Si se toca Plantillas, probar semana/agenda, filtros, seleccion multiple, edicion multiple y scroll horizontal controlado.

## Decision 2026-06-08 - Iconos De Tipos De Actividad

## Problema

En plantillas y horarios densos, las tarjetas pueden quedar demasiado estrechas para mostrar el nombre completo de la actividad. Solo el color ayuda, pero no siempre basta para reconocer la clase de un vistazo.

## Decision

- `class_types` guarda un `icon_key` controlado por biblioteca interna, no un SVG libre ni una URL subida por usuario.
- `/app/class-types` permite elegir el icono junto al color al crear o editar un tipo de actividad.
- En tarjetas compactas de Plantillas y Horario, el icono acompaña al color y puede sobrevivir aunque el texto quede truncado u oculto.
- La tarjeta ya aporta el color de actividad; en modo estrecho no se duplica con una bolita decorativa.

## Verificacion

- Crear/editar tipo de actividad conserva color e icono.
- Plantillas y Horario siguen siendo legibles cuando varios bloques coinciden en la misma franja.
- Si se toca esta superficie, revisar que los iconos no sustituyen etiquetas accesibles ni rompen el truncado.
