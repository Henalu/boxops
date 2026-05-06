# Design Tokens Base - BoxOps

Este documento define una propuesta documental de tokens base para la futura implementacion frontend de BoxOps. No crea CSS real, componentes, rutas ni estilos en `src/`.

La base visual debe ser generica, multi-tenant y sobria. STL puede validar la direccion con datos reales, pero no define la marca base de BoxOps.

## Objetivo

Los tokens deben permitir que la UI futura sea:

- rapida de escanear en movil para coaches;
- densa y clara en desktop/tablet para admins;
- premium sin decoracion innecesaria;
- tematizable por tenant sin romper accesibilidad ni semantica;
- consistente con Tailwind CSS 4, shadcn/ui y CSS custom properties.

## Capas De Tokens

Usar tres capas conceptuales:

| Capa | Funcion | Ejemplos |
|---|---|---|
| Foundation | Valores base del producto | neutrales, escala tipografica, spacing, radius, shadow |
| Alias UI | Mapeo a primitivas shadcn/Tailwind | background, foreground, card, primary, border, ring |
| Semantica operativa | Estados del dominio BoxOps | uncovered, covered, conflict, pending, approved, event |

Regla: los componentes futuros no deben depender de colores sueltos. Deben consumir tokens de alias o tokens semanticos.

## Color

### Base Neutral

La base debe ser clara, ligeramente tintada y sin blanco/negro puros. Los valores son propuesta inicial, no implementacion.

| Token propuesto | Uso | Valor sugerido |
|---|---|---|
| `color.background` | Fondo principal de app | `oklch(0.985 0.004 250)` |
| `color.background.subtle` | Bandas suaves, areas vacias | `oklch(0.968 0.006 250)` |
| `color.surface` | Cards, paneles, tablas | `oklch(0.995 0.003 250)` |
| `color.surface.raised` | Sheets, popovers, menus | `oklch(0.99 0.004 250)` |
| `color.foreground` | Texto principal | `oklch(0.19 0.018 250)` |
| `color.foreground.muted` | Texto secundario | `oklch(0.49 0.02 250)` |
| `color.foreground.subtle` | Metadata, placeholders | `oklch(0.63 0.018 250)` |
| `color.border` | Bordes normales | `oklch(0.89 0.012 250)` |
| `color.border.strong` | Separadores activos | `oklch(0.78 0.016 250)` |
| `color.primary` | Accion principal por defecto | `oklch(0.31 0.035 250)` |
| `color.primary.foreground` | Texto sobre primary | `oklch(0.985 0.004 250)` |
| `color.accent` | Acento configurable base | `oklch(0.58 0.11 245)` |
| `color.accent.subtle` | Fondo suave de acento | `oklch(0.94 0.028 245)` |
| `color.ring` | Foco visible | `oklch(0.58 0.11 245)` |

El acento base puede ser reemplazado por el tenant si pasa validacion de contraste. Los neutrales, texto, bordes y estados criticos siguen siendo producto.

### Estados Semanticos

Los estados nunca deben depender solo del color. Cada estado necesita texto, icono, posicion o patron visual.

| Estado | Token semantico | Prioridad visual | Direccion |
|---|---|---:|---|
| Cubierto | `state.covered` | Media | Verde sobrio, confirmacion estable |
| Sin cubrir | `state.uncovered` | Maxima | Rojo/rose visible, borde o rail fuerte, accion cercana |
| Cobertura insuficiente | `state.insufficient` | Alta | Amber, alerta operativa sin dramatizar |
| Solapamiento/conflicto | `state.conflict` | Alta | Amber intenso o red suave segun gravedad |
| Pendiente | `state.pending` | Media-alta | Amber suave, accion esperada clara |
| Aprobado | `state.approved` | Media | Verde, estable |
| Rechazado | `state.rejected` | Media | Rojo contenido, motivo visible si aplica |
| Extra | `state.extra` | Media | Violeta sobrio o azul-violeta, no dominante |
| Evento | `state.event` | Media | Azul informativo, distinto de clases normales |
| Festivo | `state.holiday` | Media | Teal/cyan contenido, orientativo |
| Cancelado | `state.cancelled` | Baja | Neutral bajo contraste, texto claro |
| Completado | `state.completed` | Baja | Neutral/verde bajo, no compite con riesgos |
| Cambiado | `state.changed` | Media | Azul/amber segun requiera accion |

Prioridad de render futuro:

1. `uncovered` y `conflict`.
2. Acciones pendientes.
3. Seleccion/foco.
4. Estado normal del bloque.
5. Color de centro, tipo de actividad o tenant.

### Colores De Centro Y Tipo

Los centros y tipos de actividad pueden tener color, pero solo como señal secundaria:

- punto, rail lateral fino, avatar, chip o borde sutil;
- nunca como sustituto del estado operativo;
- nunca debe tapar `uncovered`, `conflict` o `pending`;
- si un color de tipo viene de datos del tenant, debe validarse para contraste y tener fallback.

## Tipografia

La tipografia debe priorizar lectura rapida de horas, fechas, centros y estados.

| Token propuesto | Uso | Valor sugerido |
|---|---|---|
| `font.sans` | UI general | Geist, Inter o system sans |
| `font.mono` | UUIDs, referencias tecnicas puntuales | Geist Mono o ui-monospace |
| `font.weight.regular` | Texto normal | 400 |
| `font.weight.medium` | Labels, metadata importante | 500 |
| `font.weight.semibold` | Titulos compactos, nombres de bloque | 600 |
| `font.weight.bold` | Numeros o alertas muy puntuales | 700 |

Escala recomendada:

| Token | Size | Line height | Uso |
|---|---:|---:|---|
| `text.xs` | 12px | 16px | Badges, metadata secundaria |
| `text.sm` | 14px | 20px | Labels, filas compactas |
| `text.base` | 16px | 24px | Texto principal |
| `text.md` | 18px | 26px | Titulos de card importantes |
| `text.lg` | 20px | 28px | Titulos de seccion |
| `text.xl` | 24px | 32px | Titulos de pagina |
| `text.2xl` | 30px | 38px | Pantallas principales, uso limitado |

Reglas:

- usar `font-variant-numeric: tabular-nums` para horas, duraciones y contadores;
- mantener letter spacing en `0`;
- no usar escala hero dentro de paneles, cards, dashboards o tablas;
- evitar uppercase decorativo salvo labels extremadamente cortos y necesarios.

## Spacing

El spacing debe crear ritmo, no una cuadricula monotona.

| Token | Valor | Uso |
|---|---:|---|
| `space.0` | 0px | Sin separacion |
| `space.0_5` | 2px | Ajustes finos, bordes internos |
| `space.1` | 4px | Icono-texto, metadata pegada |
| `space.2` | 8px | Elementos muy relacionados |
| `space.3` | 12px | Filas, grupos compactos |
| `space.4` | 16px | Padding movil, cards pequeñas |
| `space.5` | 20px | Separacion media |
| `space.6` | 24px | Padding desktop compacto |
| `space.8` | 32px | Separacion entre grupos |
| `space.10` | 40px | Bloques de pantalla |
| `space.12` | 48px | Separacion fuerte entre secciones |
| `space.16` | 64px | Uso raro, pantallas amplias |

Tokens semanticos:

| Token | Movil | Desktop/tablet | Uso |
|---|---:|---:|---|
| `layout.page.inline` | 16px | 24-32px | Padding lateral de pagina |
| `layout.page.block` | 16-24px | 24-32px | Padding vertical de pagina |
| `layout.stack.tight` | 8px | 8px | Elementos del mismo bloque |
| `layout.stack.related` | 12px | 12-16px | Campos o metadata relacionada |
| `layout.stack.section` | 24px | 32-48px | Grupos distintos |
| `layout.grid.gap` | 12px | 16px | Cards/listas principales |
| `layout.filter.gap` | 8px | 8-12px | Chips y controles |

Usar `gap` como mecanismo principal de separacion. Evitar margenes arbitrarios por componente.

## Radius

BoxOps debe sentirse moderno sin parecer blando ni decorativo.

| Token | Valor | Uso |
|---|---:|---|
| `radius.none` | 0px | Divisores, tablas |
| `radius.xs` | 4px | Badges pequeños, rails |
| `radius.sm` | 6px | Inputs compactos, botones pequeños |
| `radius.md` | 8px | Cards, bloques de horario, controles |
| `radius.lg` | 10-12px | Sheets, popovers, dialogos |
| `radius.full` | 9999px | Pills, avatars, chips |

Cards y bloques repetidos deben quedarse en `8px` o menos. Overlays y sheets pueden usar un radio algo mayor si ayuda a distinguir capa.

## Sombras Y Elevacion

La UI debe apoyarse mas en borde, espacio y contraste que en sombras.

| Token | Valor sugerido | Uso |
|---|---|---|
| `shadow.none` | `none` | Listas, tablas, cards normales |
| `shadow.xs` | `0 1px 1px rgb(15 23 42 / 0.04)` | Cards elevadas puntuales |
| `shadow.sm` | `0 1px 2px rgb(15 23 42 / 0.06)` | Header sticky, superficies suaves |
| `shadow.md` | `0 10px 30px -24px rgb(15 23 42 / 0.35)` | Popovers, sheets |
| `shadow.overlay` | `0 24px 60px -36px rgb(15 23 42 / 0.45)` | Dialogos y overlays importantes |

No usar glow, sombras de color ni sombras grandes en cards de contenido normal.

## Densidad Responsive

BoxOps necesita tres densidades principales:

| Densidad | Contexto | Reglas |
|---|---|---|
| `coach-mobile` | Coach en movil | Tap target minimo 44px, agenda vertical, una accion principal visible |
| `admin-tablet` | Admin en tablet | Paneles divididos, filtros visibles, controles de 36-40px |
| `admin-desktop-compact` | Admin en desktop | Tablas/listas densas, controles de 32-36px, filtros persistentes |

Reglas:

- mobile-first real: adaptar la tarea, no esconder funciones criticas;
- usar agenda/lista en movil para horarios;
- usar grid semanal, tabla o split view en desktop cuando mejore comparacion;
- mantener texto legible y sin cortes en 375px, 390px, 768px y 1280px;
- conservar contexto de tenant, centro y semana cuando afecte a la decision.

## Aplicacion A Pantallas Clave

### Coach Today Dashboard

- Usar `coach-mobile` como densidad principal.
- El siguiente bloque usa `surface`, `radius.md`, borde sutil y estado visible.
- La hora usa `text.xl` o `text.2xl` con numeros tabulares.
- El centro y tipo de actividad usan metadata compacta, no tarjetas separadas.
- La accion primaria vive cerca del bloque activo.
- Las horas semanales son contexto secundario, no metrica hero.

### Weekly Schedule

- Movil: agenda por dia con filtros rapidos y bloques compactos.
- Desktop: semana densa por dias, con hoy visible y navegacion temporal clara.
- `uncovered`, `insufficient` y `conflict` dominan sobre colores de tipo o centro.
- Colores de tipo/centro deben ser rails, puntos o chips pequeños.
- Los filtros usan `layout.filter.gap` y estado activo obvio.

### Team Schedule By Center

- Densidad `admin-tablet` y `admin-desktop-compact`.
- El centro activo es contexto persistente, no un encabezado decorativo.
- Filas por coach o bloque usan separadores y espacio antes que cards anidadas.
- Solapamientos y ausencias usan tokens de conflicto/pendiente.
- Horas planificadas se muestran como dato operativo, no como KPI decorativo.

### Admin Coverage Dashboard

- La primera pantalla prioriza riesgo: sin cubrir, insuficiente, solapamientos y solicitudes urgentes.
- Usar lista de trabajo o paneles compactos, no un grid de metricas vacias.
- Si no hay incidencias, usar estado positivo claro con siguiente contexto util.
- `state.uncovered` y `state.conflict` son los colores de mayor peso.
- Acciones de asignar o abrir bloque deben estar cerca del item afectado.

### Requests Inbox

- Usar densidad de bandeja: filas escaneables, estado, fecha afectada y accion.
- Agrupar por urgencia o fecha cuando ayude a decidir.
- `pending`, `approved`, `rejected` y `applied` deben ser distinguibles por texto e icono.
- La vista debe parecer cola de trabajo, no historial pasivo.
- En desktop, el detalle puede vivir en panel lateral futuro.

### Monthly Calendar

- El mes orienta, no resuelve toda la operativa.
- Usar dots, chips o mini badges para evento, festivo, ausencia, conflicto y pendiente.
- El dia con conflicto debe destacar mas que el dia con evento informativo.
- En movil, preferir resumen mensual + lista del dia seleccionado.
- En desktop, permitir vista mensual con drill-down a detalle de dia.

## Handoff Para Implementacion Futura

Antes de convertir esto en CSS real:

- decidir si el tema base reemplaza los valores shadcn neutros actuales o los extiende;
- validar contraste de tokens `primary`, `accent` y estados;
- definir nombres finales en CSS custom properties;
- confirmar si `organizations` necesita `theme_config` o una tabla especifica de theme;
- probar los tokens con una semana real y un segundo tenant demo conceptual.
