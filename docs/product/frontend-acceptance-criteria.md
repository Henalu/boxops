# Criterios De Aceptacion Frontend - BoxOps

Este documento define criterios visuales y UX para la futura fase frontend. No implementa UI ni sustituye tests tecnicos.

## Criterios Globales

Una pantalla futura de BoxOps se acepta si:

- responde una pregunta operativa concreta;
- funciona primero en movil sin esconder funciones criticas;
- usa tokens o variables, no colores hardcodeados en componentes;
- mantiene BoxOps como producto generico multi-tenant;
- no contiene referencias hardcodeadas a un tenant concreto en `src/`;
- muestra organizacion, centro o semana cuando son contexto necesario;
- diferencia estados criticos sin depender solo del color;
- evita dashboards decorativos y metricas que no cambian decisiones;
- mantiene texto legible, sin solapes ni cortes en 375px, 390px, 768px y 1280px;
- tiene focus visible, contraste AA y targets tactiles adecuados;
- incluye loading, empty, error y permisos/readonly cuando aplique.

## Criterios Visuales

La UI debe sentirse:

- moderna, minimalista, premium y operativa;
- clara antes que ornamental;
- ligera, no corporativa ni de gestor laboral pesado;
- alejada de estetica fitness agresiva;
- densa solo donde la comparacion operativa lo requiera.

No se acepta:

- cards anidadas sin necesidad;
- grids monotonos de metricas;
- gradientes llamativos como identidad principal;
- fondos oscuros con neones como base;
- uso de color de tenant para estados criticos;
- texto hero dentro de paneles densos;
- botones o chips con texto que se desborda.

## Criterios UX

La experiencia se acepta si:

- el coach entiende su siguiente accion sin leer instrucciones;
- el admin detecta riesgo operativo en segundos;
- los filtros frecuentes estan visibles o a un toque;
- cambiar semana no pierde centro/estado si siguen siendo validos;
- las acciones admin son explicitas y revalidan permisos;
- coaches no ven acciones de mutacion si el flujo aun no existe;
- las solicitudes muestran estado, fecha afectada y accion esperada;
- los empty states explican el siguiente paso real;
- los errores de validacion aparecen cerca del campo o item afectado.

## Criterios De Theming

La UI se acepta si:

- funciona con tema base sin configuracion de tenant;
- funciona con al menos un segundo tema conceptual;
- el acento de tenant no rompe contraste ni foco;
- los estados `uncovered`, `conflict`, `pending`, `approved` y `rejected` conservan significado;
- los colores de centro/tipo son secundarios frente a cobertura y conflictos;
- el cambio de organizacion cambia tema y datos juntos;
- no hay condiciones por nombre de tenant en componentes.

## Criterios Por Pantalla

### Coach Today Dashboard

Aceptado si:

- muestra el siguiente bloque o un empty state util cuando no hay bloques;
- prioriza hora, centro, tipo de actividad y estado;
- ofrece la accion principal cerca del contexto del bloque;
- muestra solicitudes urgentes sin competir con el siguiente bloque;
- usa una sola jerarquia clara, no varios KPIs con el mismo peso;
- funciona como pantalla inicial movil.

### Weekly Schedule

Aceptado si:

- en movil se lee como agenda por dia;
- en desktop/tablet permite comparar la semana completa;
- el dia actual y la semana activa son claros;
- los bloques sin cubrir o insuficientes destacan antes que clases normales;
- los filtros de centro, coach, tipo, estado y "solo sin cubrir" son rapidos;
- abrir un bloque conserva contexto de semana y tenant.

### Team Schedule By Center

Aceptado si:

- el centro activo es visible y facil de cambiar;
- permite ver quien trabaja y donde sin leer filas largas;
- muestra solapamientos, ausencias y vacantes con prioridad alta;
- usa densidad admin sin convertirse en muro de cards;
- separa contexto de centro, coach, bloque y horas planificadas;
- no asume que todos los tenants tienen exactamente dos centros.

### Admin Coverage Dashboard

Aceptado si:

- empieza por riesgos: sin cubrir, insuficiente, solapamientos, solicitudes urgentes;
- cada riesgo tiene enlace o accion hacia el bloque/solicitud afectada;
- si no hay incidencias, lo comunica con claridad y muestra contexto util;
- evita graficas o metricas decorativas;
- permite filtrar por centro y semana;
- no oculta incidencias tras tarjetas resumen.

### Requests Inbox

Aceptado si:

- se comporta como bandeja de trabajo accionable;
- agrupa o prioriza por urgencia, fecha afectada y estado;
- muestra personas involucradas sin saturar la fila;
- ofrece aceptar, rechazar, aprobar o pedir informacion cuando el rol lo permita;
- diferencia pendiente, aprobado, rechazado, aplicado y cancelado;
- conserva historial sin convertirlo en la vista principal.

### Monthly Calendar

Aceptado si:

- orienta sobre eventos, festivos, ausencias y conflictos;
- el dia con conflicto destaca mas que un evento informativo;
- en movil combina mes compacto con detalle del dia seleccionado;
- en desktop permite abrir dia o evento sin perder mes activo;
- no intenta resolver asignacion fina que pertenece a semana/dia;
- permite filtrar por centro y tipo de evento cuando existan datos.

## Verificacion Antes De Cerrar Una Superficie

Antes de dar por terminada una pantalla frontend:

- ejecutar `npm run lint`;
- ejecutar `npm run typecheck`;
- ejecutar `npm run build`;
- revisar `rg -n "STL" src`;
- revisar 375px, 390px, 768px y 1280px;
- comprobar que no hay texto solapado ni truncado de forma incoherente;
- comprobar foco visible y navegacion por teclado;
- comprobar loading, empty, error y readonly;
- validar contraste de estados y tenant accent;
- documentar cualquier decision que afecte a varias pantallas.

## Criterio De Salida De La Fase Preparacion Frontend

Antes de implementar la UI grande, deberian existir:

- tokens base documentados;
- modelo de theming documentado;
- criterios de aceptacion frontend;
- prototipos o wireframes mobile-first de Coach Today Dashboard y Weekly Schedule;
- prototipos o wireframes desktop/tablet de Team Schedule by Center y Admin Coverage Dashboard;
- validacion con una semana real del primer tenant;
- validacion conceptual con un segundo tenant demo.
