# Principios UX - BoxOps

Este documento define como debe comportarse BoxOps cuando se diseñen las futuras pantallas. Complementa `design-direction.md` con decisiones de experiencia, navegacion, estados y flujos diarios.

## Principio Central

BoxOps debe reducir incertidumbre operativa. Cada pantalla debe ayudar a responder una pregunta real del box con el menor numero de pasos posible.

Si una pantalla no ayuda a decidir, cubrir, revisar, aprobar, fichar o encontrar informacion operativa, probablemente esta adelantando complejidad.

## Para Coaches

La app debe responder rapido:

- ¿Que tengo hoy?
- ¿Donde trabajo?
- ¿Que clase o bloque doy?
- ¿Tengo que fichar?
- ¿Que programacion toca?
- ¿Tengo alguna solicitud pendiente?
- ¿Cuantas horas llevo?

### Reglas UX Para Coaches

- La pantalla inicial debe priorizar "siguiente accion", no resumenes generales.
- El contexto de centro, hora y tipo de actividad debe aparecer junto.
- El fichaje debe estar vinculado a turno/bloque cuando exista.
- La programacion debe estar a un toque desde una clase o bloque.
- Las solicitudes deben mostrar estado y accion esperada sin obligar a abrir detalles.
- El lenguaje debe ser operativo y corto.

## Para Admins

La app debe responder rapido:

- ¿Esta todo cubierto hoy?
- ¿Que clases o bloques estan sin coach?
- ¿Quien ha pedido cambios?
- ¿Que vacaciones generan conflicto?
- ¿Quien supera sus horas?
- ¿Que eventos o festivos quedan por asignar?

### Reglas UX Para Admins

- Priorizar riesgo operativo sobre metricas decorativas.
- Mostrar cobertura diaria y semanal de forma escaneable.
- Permitir filtros rapidos por centro, coach, estado y semana.
- Hacer visibles conflictos antes de que el admin tenga que buscarlos.
- Agrupar solicitudes por urgencia, fecha afectada y estado.
- Mantener acciones masivas o avanzadas fuera del primer nivel hasta que hagan falta.

## Mobile-First Real

Mobile-first no significa esconder funciones importantes. Significa adaptar la tarea al contexto.

En movil:

- usar bottom navigation con maximo 5 secciones;
- evitar menus profundos;
- usar filtros como chips, segmented controls o sheets cortas;
- mostrar acciones primarias en el contexto del bloque o solicitud;
- evitar tablas anchas;
- preferir lista por dia, agenda o timeline compacta.

En desktop/tablet:

- usar vistas de semana, centro y equipo con mas columnas;
- permitir filtros persistentes;
- mostrar paneles laterales para detalle cuando aporten velocidad;
- no convertir la vista admin en un muro de cards.

## Navegacion Recomendada

Navegacion movil:

1. Hoy
2. Semana
3. Solicitudes
4. Calendario
5. Más

La navegacion debe adaptarse por rol sin romper el mapa mental:

- Coach: "Hoy" y "Semana" son personales por defecto.
- Admin: "Hoy" y "Semana" pueden abrir contexto de cobertura y equipo.
- "Solicitudes" agrupa cambios, cobertura, ausencias y correcciones cuando existan.
- "Calendario" agrupa vista mensual, eventos, festivos y ausencias.
- "Más" agrupa documentos, certificaciones, equipo, centros y ajustes segun permisos.

## Jerarquia De Informacion

Orden recomendado en bloques, listas y dashboards:

1. Estado operativo.
2. Fecha/hora.
3. Centro.
4. Tipo de actividad o clase.
5. Coach o vacante.
6. Accion posible.
7. Metadata secundaria.

Ejemplo: en una clase sin cubrir, el usuario debe ver primero que esta sin cubrir, despues cuando/donde ocurre y finalmente que puede hacer.

## Filtros

Filtros prioritarios:

- centro;
- coach;
- estado;
- semana;
- tipo de actividad;
- "solo sin cubrir";
- "mi horario".

Reglas:

- Los filtros frecuentes deben estar visibles o a un toque.
- El filtro activo debe ser obvio.
- Al cambiar semana, no perder centro/estado si siguen siendo validos.
- En multi-tenant, conservar `organizationId` o el futuro tenant activo al navegar.

## Estados Y Feedback

Cada accion debe dejar claro que paso:

- loading local, no pantallas bloqueadas si solo cambia una card;
- errores inline cuando el error pertenece a un campo;
- empty states que expliquen el siguiente paso;
- confirmaciones breves para acciones correctas;
- estados visibles en solicitudes y bloques.

No usar estados solo por color. Siempre combinar color con texto, icono o posicion.

## Acciones Frecuentes

Las acciones frecuentes deben necesitar pocos pasos:

- fichar entrada/salida;
- ver programacion;
- pedir cobertura;
- aceptar/rechazar solicitud;
- filtrar por centro;
- ir a semana actual;
- ver solo sin cubrir;
- asignar o sustituir coach en admin;
- aprobar/rechazar ausencias o correcciones.

Si una accion frecuente exige buscar en "Más", abrir tres pantallas o leer instrucciones, el flujo esta mal priorizado.

## Calendarios Y Tiempo

La navegacion temporal debe inspirarse en Google Calendar y Notion Calendar:

- hoy siempre accesible;
- semana actual clara;
- cambios de semana/mes rapidos;
- vista mensual para ausencias, eventos, festivos y conflictos;
- vista semanal para operativa de cobertura;
- agenda diaria para movil.

La vista mensual no debe intentar resolver todo. Su trabajo principal es orientar, detectar patrones y abrir detalles.

## Permisos Y Tenant

La UX debe hacer visible el contexto sin convertirlo en ruido:

- organizacion activa clara si el usuario puede pertenecer a varias;
- centro activo claro en vistas filtradas;
- acciones deshabilitadas o ausentes segun rol, con explicacion si hace falta;
- ningun copy generico debe asumir STL;
- datos y branding de tenant deben presentarse como contexto, no como producto.

## Criterio De Calidad

Una pantalla futura de BoxOps se considera bien diseñada si:

- responde una pregunta operativa clara;
- funciona primero en movil;
- permite la accion frecuente en pocos pasos;
- distingue estados criticos de un vistazo;
- mantiene el tenant y el centro visibles cuando importan;
- no usa metricas o decoracion que no cambian decisiones;
- mantiene contraste, foco visible y textos sin cortar;
- podria servir a un segundo box sin reescribir nombres ni componentes.
