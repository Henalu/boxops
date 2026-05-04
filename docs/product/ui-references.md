# Referencias UI Y Producto - BoxOps

Este documento recoge referencias de producto y UX para futuras fases de diseño. No autoriza copiar interfaces literalmente, assets, layouts propietarios ni identidad visual. Las referencias se usan como inspiracion de criterio.

## Regla De Uso

Aprender patrones, no copiar pantallas.

Antes de aplicar una referencia, hacer estas preguntas:

- ¿Que problema resuelve esa referencia?
- ¿Ese problema existe en BoxOps?
- ¿Como se adapta al dominio de horarios, cobertura y centros?
- ¿Sigue siendo generico multi-tenant?
- ¿Evita convertir BoxOps en RRHH pesado o app fitness agresiva?

## Referencia Estetica Principal

### Revolut

Usar como referencia de:

- claridad visual;
- sensacion premium sin exceso decorativo;
- tarjetas limpias;
- acciones rapidas;
- jerarquia fuerte;
- navegacion simple;
- resumenes que ayudan a decidir.

Aplicacion a BoxOps:

- cards de "siguiente accion" para coach;
- resumenes de cobertura para admin;
- listas limpias de solicitudes;
- acento visual controlado;
- microcopy corto y directo;
- sensacion de producto moderno y confiable.

No copiar:

- branding;
- patrones financieros literales;
- gamificacion de dinero;
- layouts exactos;
- iconografia o assets propios.

## Referencias Funcionales

### When I Work

Usar como referencia funcional de:

- horarios;
- turnos abiertos;
- cambios de turno;
- shift swaps;
- time off;
- fichaje;
- claridad para equipos con turnos.

Aplicacion a BoxOps:

- solicitudes de cobertura y cambios;
- open shifts o bloques sin cubrir;
- flujo de aceptar/rechazar;
- fichaje vinculado al turno;
- vista rapida de quien trabaja.

Adaptacion necesaria:

- BoxOps no gestiona solo turnos, gestiona bloques operativos con clase, centro, coach y cobertura.
- Un coach puede estar asociado a tipos de clase y certificaciones.
- El fichaje no debe activarse por presencia fisica sin contexto de bloque.

### Deputy

Usar como referencia funcional de:

- gestion de equipo;
- filtros por ubicacion;
- scheduling manager;
- cobertura operativa;
- experiencia admin.

Aplicacion a BoxOps:

- filtros por centro;
- vista de equipo por sede;
- gestion de disponibilidad y ausencias futuras;
- panel admin de cobertura;
- control de horas planificadas y horas reales.

Adaptacion necesaria:

- Evitar sensacion de software laboral pesado.
- Priorizar clases/bloques y cobertura de box, no solo turnos de personal.

### Google Calendar / Notion Calendar

Usar como referencia mental de:

- navegacion temporal;
- semana actual;
- mes;
- hoy;
- cambio rapido de periodo;
- lectura de eventos por calendario.

Aplicacion a BoxOps:

- vista semanal como centro de MVP 1;
- vista mensual para eventos, festivos, ausencias y conflictos;
- navegacion rapida entre semanas;
- agenda diaria en movil;
- detalle al abrir un bloque.

Adaptacion necesaria:

- La semana de BoxOps no es solo eventos: necesita cobertura, coaches requeridos, estados y acciones.
- La vista mensual debe orientar, no reemplazar la gestion semanal.

## Referencia Secundaria

### Linear

Usar como referencia de:

- limpieza visual;
- densidad controlada;
- estados claros;
- paneles de trabajo;
- listas accionables;
- foco en flujo operativo.

Aplicacion a BoxOps:

- requests inbox;
- estados de solicitudes;
- filtros rapidos;
- detalle en panel lateral en desktop;
- empty states y mensajes compactos.

No copiar:

- estetica excesivamente developer;
- terminologia de issues;
- densidad que dificulte uso movil.

## Anti-Referencias

Evitar que BoxOps parezca:

- una suite de RRHH corporativa clasica;
- una herramienta de gestoría;
- un dashboard de BI con metricas que nadie usa;
- una app fitness agresiva con neones, fotos oscuras o energia de marketing;
- una landing page dentro del producto;
- un clon literal de cualquiera de las referencias.

## Traduccion A Decisiones

| Necesidad BoxOps | Inspiracion | Decision de UX |
|---|---|---|
| Coach abre la app antes de clase | Revolut + agenda movil | Pantalla "Hoy" con siguiente bloque, centro, fichaje y programacion. |
| Admin revisa cobertura | Deputy + Linear | Dashboard operativo con alertas, no panel de metricas decorativas. |
| Cambios de clase/turno | When I Work | Solicitudes claras con estados y acciones rapidas. |
| Bloques sin cubrir | When I Work + BoxOps domain | Tratarlos como open coverage, priorizados visualmente. |
| Navegar semanas y meses | Google/Notion Calendar | Semana para operativa, mes para orientacion y conflictos. |
| Equipo por centro | Deputy | Filtros y vistas por sede, con contexto multi-centro. |
| Estados y cola de trabajo | Linear | Inbox densa, escaneable y accionable. |

## Regla Final

Si una referencia mejora claridad, velocidad y control operativo, puede inspirar BoxOps. Si solo aporta estilo o ruido visual, se descarta.
