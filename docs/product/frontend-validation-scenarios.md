# Validacion Conceptual Frontend Multi-Tenant - BoxOps

Este documento valida los wireframes de `frontend-wireframes.md` y el modelo de estados de `visual-state-model.md` contra dos escenarios conceptuales. No usa datos reales de STL y no implementa UI.

## Resultado Ejecutivo

Los wireframes son validos como punto de partida multi-tenant si se mantienen estas decisiones:

- La vista mobile de coach abre por contexto personal y siguiente accion.
- La vista semanal conserva filtros por semana, centro, coach, tipo y estado.
- Las pantallas admin priorizan riesgo operativo antes que metricas decorativas.
- El selector de centro no asume dos sedes; debe escalar de un centro a muchos.
- Los estados `uncovered`, `insufficient` y `conflict` dominan sobre color de tenant, centro o tipo.
- Los estados empty, loading, error y readonly deben existir desde la primera implementacion visible.
- Task 016 ya repitio el audit real sobre la UI implementada con Playwright, viewports reales y tenant demo.

Queda pendiente validar los mismos wireframes con una semana real del primer tenant.

## Escenario A - Tenant Multi-Centro

Concepto:

- Organizacion con varios centros.
- Varios coaches activos.
- Algunos coaches trabajan en mas de un centro.
- Hay bloques sin cubrir y otros con cobertura insuficiente.
- Puede haber solapamientos por coach.

No representa datos reales de STL.

### Coach Today Dashboard

Validacion:

- Funciona si la pantalla abre por "mis bloques" y no por todo el equipo.
- Debe mostrar centro, hora y tipo juntos para evitar desplazamientos erroneos.
- Si un coach tiene cambios de centro en el mismo dia, el centro debe tener peso suficiente en cada bloque.
- `changed` y `cancelled` deben verse antes que informacion secundaria.

Riesgos:

- Si se muestran incidencias de todo el tenant al coach, la pantalla deja de responder "que tengo hoy".
- Sin nombres publicos de personas, la UI final podria caer en UUIDs; eso debe resolverse antes de frontend real.

### Weekly Schedule

Validacion:

- La agenda movil por dia soporta varios centros si el centro aparece como metadata compacta en cada bloque.
- El filtro "Solo sin cubrir" debe incluir `uncovered` y puede incluir `insufficient` si el copy lo aclara.
- En desktop/tablet, la semana densa tiene sentido para comparar centros, horarios y riesgos.

Riesgos:

- Tabs fijas por centro no escalan si hay muchos centros. Mejor combobox/sheet o filtro persistente.
- El color de centro/tipo no puede competir con `uncovered`, `insufficient` o `conflict`.

### Team Schedule By Center

Validacion:

- La pantalla encaja especialmente bien para multi-centro.
- Debe existir fila/grupo de vacantes aunque no haya coach asignado.
- La matriz por coach ayuda a detectar solapamientos y carga semanal.
- El selector de centro debe admitir "Todos" sin convertir la vista en ruido.

Riesgos:

- Para coaches multi-centro hace falta regla de conflicto por tiempo y, mas adelante, margen de traslado.
- Los managers futuros pueden requerir permisos por centro; el wireframe no debe asumir que todo admin ve todo siempre.

### Admin Coverage Dashboard

Validacion:

- El dashboard de cola de riesgos responde bien al escenario.
- Los contadores son utiles solo como acceso a lista filtrada; la lista accionable es lo principal.
- La agrupacion por prioridad evita revisar manualmente toda la semana.

Riesgos:

- Sin asignaciones reales, el dashboard solo puede usar `schedule_blocks.status = 'uncovered'` como pista temporal.
- Las solicitudes urgentes todavia no existen en schema, asi que no deben bloquear MVP 1.

## Escenario B - Tenant Pequeno De Un Centro

Concepto:

- Organizacion con un unico centro activo.
- Pocos coaches.
- Menor volumen de bloques.
- Puede haber semanas sin incidencias.

No representa datos reales de STL ni de ningun cliente concreto.

### Coach Today Dashboard

Validacion:

- La pantalla sigue funcionando: siguiente bloque, estado y accion siguen siendo la pregunta principal.
- Si no hay bloques hoy, el empty state debe ser util y no sentirse como error.
- El centro puede quedar como contexto secundario, sin desaparecer si hay posibilidad futura de expansion.

Riesgos:

- Mostrar demasiada configuracion multi-centro en un tenant de un centro genera ruido.
- Las horas semanales no deben convertirse en metrica hero si el volumen es bajo.

### Weekly Schedule

Validacion:

- La agenda por dia funciona mejor que una matriz pesada cuando hay pocos bloques.
- El filtro de centro puede quedar colapsado o ausente si solo hay un centro activo.
- "Solo sin cubrir" sigue siendo valioso aunque haya pocas incidencias.

Riesgos:

- Empty weeks o filtros sin resultados deben ofrecer limpiar filtros, cambiar semana o crear/aplicar plantilla si el rol lo permite.
- La vista desktop no debe forzar grid semanal si una lista compacta decide mejor.

### Team Schedule By Center

Validacion:

- La pantalla puede adaptarse a "Equipo" sin depender visualmente de multiples centros.
- La vista por coach con horas planificadas sigue siendo util para carga de trabajo.
- Si hay pocos coaches, no debe parecer un dashboard vacio.

Riesgos:

- Un selector de centros prominente con una sola opcion pareceria innecesario.
- La columna de vacantes debe seguir existiendo, pero puede ocupar menos peso si no hay riesgos.

### Admin Coverage Dashboard

Validacion:

- El estado "Todo cubierto para esta vista" es clave en tenants pequenos.
- Debe mostrar siguiente contexto util: proximo bloque, semana activa o filtros aplicados.
- Si no hay incidencias, no se deben inventar graficas para llenar espacio.

Riesgos:

- Los contadores en cero no deben convertirse en una pantalla decorativa.
- Acciones admin deben seguir cerca del bloque cuando exista un riesgo, no solo en header global.

## Decisiones Transversales

- Centro visible cuando importa, discreto cuando solo hay uno.
- Filtros frecuentes visibles, opciones largas en sheet/combobox.
- Estados de cobertura como semantica de producto, no de tenant.
- Empty states distintos por rol: admin recibe siguiente paso operativo; coach recibe orientacion de consulta.
- El modo readonly debe quitar acciones de mutacion, no mostrar botones deshabilitados sin explicacion.
- El cambio de tenant debe cambiar datos, tema y filtros compatibles juntos.

## Audit Documental De Accesibilidad, Responsive Y Theming

Accesibilidad:

- Los estados deben combinar texto, icono/rail/posicion y no solo color.
- Los empty/error/readonly states deben existir por pantalla y por rol.
- Las acciones criticas deben permanecer cerca del bloque o solicitud afectada.
- La implementacion futura debe comprobar foco visible, contraste AA y navegacion por teclado.

Responsive:

- Mobile mantiene agenda/lista y no tablas anchas.
- Tablet/desktop pueden aumentar densidad solo cuando mejora comparacion.
- El selector de centros cambia de discreto a persistente segun volumen real.
- Task 016 probo 375px, 390px, 768px y 1280px con UI real implementada.

Theming:

- El acento de tenant queda subordinado a estados operativos.
- `uncovered`, `insufficient`, `conflict`, `pending`, `approved` y `rejected` conservan significado entre tenants.
- Tenant de un centro y tenant multi-centro deben funcionar con tema base sin configuracion.
- La persistencia futura se decide en `theme-config-decision.md`.

## Audit Real UI Implementada - 2026-05-04

Task 016 repite el audit pendiente sobre la UI implementada, usando el servidor local ya abierto en `http://127.0.0.1:3000`.

### Alcance

Viewports:

- 375x812.
- 390x844.
- 768x1024.
- 1280x800.

Rutas auditadas:

- `/login`.
- `/app?organizationId=00000000-0000-0000-0000-000000100001&week=2026-05-04`.
- `/app/schedule?organizationId=00000000-0000-0000-0000-000000100001&week=2026-05-04`.
- `/app/templates?organizationId=00000000-0000-0000-0000-000000100001&week=2026-05-04`.
- `/app/centers?organizationId=00000000-0000-0000-0000-000000100001`.
- `/app/coaches?organizationId=00000000-0000-0000-0000-000000100001`.
- `/app/class-types?organizationId=00000000-0000-0000-0000-000000100001`.

Evidencia generada:

- `test-results/frontend-audit-2026-05-04/audit-results.json`.
- Screenshots por viewport/ruta en `test-results/frontend-audit-2026-05-04/`.
- Screenshot de verificacion focal posterior al fix: `test-results/frontend-audit-2026-05-04/mobile-375-coaches-admin-after-fix.png`.

### Resultado

- Login, dashboard admin, horario, plantillas, centros, coaches y tipos cargaron con contenido real en los cuatro viewports.
- No se detectaron errores de consola ni overlays de error de Next.js.
- No se detecto overflow horizontal de pagina.
- Los inputs, selects y textareas auditados mantienen labels accesibles.
- Cada ruta auditada mantiene un `h1` principal.
- La navegacion por teclado basica avanzo por marca, cierre de sesion y nav principal; los screenshots muestran foco visible en los elementos navegados.
- Los estados de cobertura del dashboard se comunican con texto e icono, no solo color.
- El tema base usa tokens shadcn/Tailwind en la UI protegida; no se probo theme configurable por tenant porque todavia no existe persistencia de `theme_config`.

### Fix Aplicado

En `/app/coaches`, la tabla de memberships era mas ancha que 375px y quedaba recortada dentro de `Card`, que usa `overflow-hidden`.

Se aplico el fix minimo en `src/app/(app)/app/coaches/page.tsx`:

- `CardContent` de la tabla ahora usa `overflow-x-auto p-0`.
- La verificacion focal posterior confirmo `overflow-x: auto`, ancho de viewport 375px, ancho de tabla 491px, contenedor 343px y sin overflow horizontal de pagina.

### Hallazgos Pendientes

- La UI protegida usa muchos controles compactos (`Button size="sm"`, inputs/selects de 32-36px). En movil quedan por debajo del objetivo tactil recomendado de 44px.
- No se cambio globalmente la altura de botones/inputs/selects porque afectaria la densidad de todas las superficies y debe tratarse como tarea dedicada de responsive/touch targets.
- El audit automatico marco el boton negro de login como problema de contraste por normalizacion `lab(...)`; se considero falso positivo tras inspeccion visual, porque es texto blanco sobre fondo muy oscuro.

### Limitaciones

- El audit uso tenant demo, no datos reales del primer tenant.
- La cuenta admin usada fue temporal en Supabase local y se elimino al cerrar cada pasada.
- No se audito un usuario `coach` autenticado por falta de credenciales E2E reales.
- No se probo lector de pantalla real, zoom 200%, Windows high contrast ni dispositivo fisico.
- No se valido cambio de tema por tenant; la implementacion de theming sigue pendiente de schema/configuracion futura.

## Audit Real UX/UI Refactor - 2026-05-04

Task 017 valida el refactor UX/UI operativo sobre el servidor local ya abierto en `http://127.0.0.1:3000`.

### Alcance

Viewports:

- 390x844.
- 1280x800.

Rutas auditadas:

- `/app?organizationId=00000000-0000-0000-0000-000000100001&week=2026-05-04`.
- `/app/schedule?organizationId=00000000-0000-0000-0000-000000100001&week=2026-05-04`.
- `/app/coverage?organizationId=00000000-0000-0000-0000-000000100001&week=2026-05-04`.
- `/app/coaches?organizationId=00000000-0000-0000-0000-000000100001`.
- `/app/more?organizationId=00000000-0000-0000-0000-000000100001&week=2026-05-04`.
- `/app/centers?organizationId=00000000-0000-0000-0000-000000100001`.
- `/app/class-types?organizationId=00000000-0000-0000-0000-000000100001`.
- `/app/templates?organizationId=00000000-0000-0000-0000-000000100001&week=2026-05-04`.

Evidencia generada:

- `test-results/ux-refactor-2026-05-04/audit-results.json`.
- Screenshots por ruta en `test-results/ux-refactor-2026-05-04/`.
- Screenshot especifico de onboarding: `test-results/ux-refactor-2026-05-04/mobile-onboarding.png`.
- Fix posterior de centrado movil del onboarding: `test-results/onboarding-mobile-fix/mobile-onboarding-centered.png`.

### Resultado

- Las rutas cargaron con `h1` unico y sin overlay de framework.
- No se detectaron errores de consola ni `pageerror`.
- No se detecto overflow horizontal de pagina en 390px ni 1280px.
- La guia inicial aparece al primer acceso y se puede saltar.
- La guia inicial queda centrada y visible en viewport movil 390x844, con altura maxima y scroll interno si hiciera falta.
- `/app/more` permite reiniciar la guia mediante `boxops_onboarding_seen_v1`.
- Mobile muestra bottom navigation con Inicio, Horario, Cobertura, Equipo y Mas.
- Desktop/tablet muestra sidebar con Principal y Gestion.
- Inicio funciona como dashboard operativo con cobertura, resumen, pendientes y acciones rapidas.
- Cobertura separa los riesgos accionables de la semana y lista todas las clases.

### Limitaciones

- El audit uso tenant demo, no una semana real del primer tenant.
- La cuenta admin usada fue temporal en Supabase local y se elimino al final.
- No se audito usuario `coach` autenticado por falta de credenciales E2E reales.
- No se probo lector de pantalla real, zoom 200%, Windows high contrast ni dispositivo fisico.
- La configuracion visual por tenant sigue pendiente de schema/configuracion futura.
- El indicador circular negro que aparece en screenshots es el indicador del dev server de Next.js, no UI de BoxOps.

## Que Debe Validarse Con STL

Sin inventar datos, falta confirmar con STL:

- semana real de los centros iniciales;
- volumen de bloques por dia y por semana;
- numero real de coaches activos y multi-centro;
- nombres exactos y longitud habitual de tipos de actividad;
- clases o bloques con mas de un coach requerido;
- casos frecuentes de bloque sin cubrir;
- prioridad real entre semana completa, centro, coach y "solo sin cubrir";
- si coaches deben ver solo su horario o tambien contexto completo del equipo;
- eventos/festivos que hoy impactan cobertura;
- branding/acento de tenant cuando exista theming.

## Criterio Para Pasar A Frontend Real

Antes de crear componentes finales:

- implementar o preparar asignaciones de coaches a bloques;
- cerrar reglas de calculo en `coverage-state-rules.md`;
- decidir persistencia de tema segun `theme-config-decision.md`;
- definir perfil publico de persona para horarios;
- validar una semana real del primer tenant;
- repetir audit de accesibilidad/responsive/theming sobre UI implementada, no solo documental.
