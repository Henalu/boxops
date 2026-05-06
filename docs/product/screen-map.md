# Mapa De Pantallas Futuras - BoxOps

Este mapa documenta pantallas clave para fases futuras de frontend. No define rutas finales ni obliga a implementar ahora. Sirve para priorizar UX, estados y datos cuando llegue cada fase.

## Navegacion Base

Movil recomendada:

1. Hoy
2. Semana
3. Solicitudes
4. Calendario
5. Más

Desktop/tablet puede expandir la navegacion con sidebar o top nav:

- Inicio / Hoy
- Horario
- Cobertura
- Solicitudes
- Calendario
- Equipo
- Documentos
- Configuracion

La navegacion debe conservar tenant activo y filtros relevantes, especialmente `organizationId`, centro y semana.

## Navegacion Implementada En MVP 1

Task 017 implementa una variante admin de MVP 1, adaptada a las pantallas reales existentes:

Mobile:

1. Inicio
2. Horario
3. Cobertura
4. Equipo
5. Mas

Desktop/tablet:

- Principal: Inicio, Horario, Cobertura, Equipo, Mas.
- Gestion: Centros, Tipos de actividad, Plantillas.

Notas:

- `/app/coaches` se presenta como Equipo para reducir lenguaje tecnico.
- `/app/coverage` separa la cola de riesgos del resumen de Inicio.
- `/app/more` agrupa gestion, ayuda y configuracion futura sin implementar un modulo nuevo.
- Esta navegacion puede evolucionar cuando existan Solicitudes, Calendario, Documentos o Fichaje.

## 1. Coach Today Dashboard

Usuario principal: coach.

Pregunta que responde:

- ¿Que tengo hoy y que tengo que hacer ahora?

Contenido principal:

- siguiente bloque asignado;
- hora, centro y tipo de actividad;
- estado de fichaje si aplica;
- acceso a programacion;
- solicitudes pendientes;
- resumen de horas de la semana o mes;
- avisos de cambios del dia.

Acciones clave:

- fichar entrada/salida;
- ver programacion;
- pedir cobertura;
- abrir detalle de clase/bloque;
- responder solicitud pendiente.

Estados importantes:

- sin bloques hoy;
- proximo bloque empieza pronto;
- fichaje pendiente;
- solicitud pendiente;
- cambio aprobado/rechazado;
- bloque cancelado.

Notas de diseño:

- Debe ser la pantalla mas rapida de la app para coach.
- No llenar de metricas. Priorizar "siguiente accion".

## 2. Weekly Schedule

Usuarios principales: coach y admin.

Pregunta que responde:

- ¿Como queda la semana y donde estoy/cubrimos?

Contenido principal:

- dias de la semana;
- bloques por dia;
- centro;
- tipo de actividad;
- coaches asignados o vacantes;
- estado de cobertura;
- notas operativas.

Acciones clave:

- cambiar semana;
- ir a hoy;
- filtrar por centro, coach, tipo y estado;
- ver solo sin cubrir;
- abrir detalle de bloque;
- admin: crear, editar, asignar o cancelar cuando exista el flujo.

Estados importantes:

- cubierto;
- sin cubrir;
- cobertura insuficiente;
- cambiado;
- cancelado;
- completado.

Notas de diseño:

- En movil, usar agenda por dia y filtros rapidos.
- En desktop, permitir vista mas densa con comparacion semanal.

## 3. Team Schedule By Center

Usuarios principales: admin, manager futuro.

Pregunta que responde:

- ¿Quien trabaja en cada centro y hay conflictos de cobertura?

Contenido principal:

- selector de centro;
- semana/dia activo;
- filas por coach o por bloque;
- disponibilidad/asignacion;
- conflictos;
- horas planificadas;
- bloques vacantes.

Acciones clave:

- filtrar por centro;
- reasignar coach;
- detectar solapamiento;
- ver detalle de coach;
- abrir bloque sin cubrir.

Estados importantes:

- coach disponible;
- coach asignado;
- coach ausente;
- solapamiento;
- centro sin cobertura suficiente.

Notas de diseño:

- Inspiracion funcional en Deputy.
- La vista debe servir para tomar decisiones de manager, no solo listar datos.

## 4. Requests Inbox

Usuarios principales: coach, admin.

Pregunta que responde:

- ¿Que solicitudes requieren respuesta?

Contenido principal:

- cambios de horario/clase;
- solicitudes de cobertura;
- swaps;
- ausencias;
- correcciones de fichaje futuras;
- estado;
- fecha afectada;
- personas involucradas.

Acciones clave:

- aceptar;
- rechazar;
- aprobar;
- pedir informacion;
- aplicar cambio;
- filtrar por estado, tipo y urgencia.

Estados importantes:

- pendiente;
- aceptado por compañero;
- rechazado por compañero;
- pendiente de admin;
- aprobado;
- rechazado;
- aplicado;
- cancelado.

Notas de diseño:

- Inspiracion en When I Work y Linear.
- Debe funcionar como bandeja de trabajo, no como historial pasivo.

## 5. Monthly Calendar

Usuarios principales: admin, coach.

Pregunta que responde:

- ¿Que pasa este mes y que puede afectar a cobertura?

Contenido principal:

- eventos;
- festivos;
- vacaciones;
- ausencias;
- competiciones;
- bloques especiales;
- conflictos de cobertura;
- dias con solicitudes pendientes.

Acciones clave:

- cambiar mes;
- volver a hoy;
- abrir dia;
- crear evento/festivo si rol permite;
- filtrar por centro y tipo de evento.

Estados importantes:

- evento;
- festivo;
- ausencia;
- conflicto;
- pendiente;
- aprobado.

Notas de diseño:

- Inspiracion mental en Google Calendar y Notion Calendar.
- El mes orienta y abre detalles; la operativa fina sigue en semana/dia.

## 6. Admin Coverage Dashboard

Usuario principal: admin.

Pregunta que responde:

- ¿Que riesgo operativo tengo hoy y esta semana?

Contenido principal:

- bloques sin cubrir hoy;
- bloques sin cubrir esta semana;
- cobertura insuficiente;
- solapamientos;
- solicitudes pendientes;
- ausencias con impacto;
- eventos/festivos sin asignar;
- coaches sobre horas contratadas.

Acciones clave:

- ir a bloque sin cubrir;
- asignar coach;
- abrir solicitud;
- filtrar por centro;
- cambiar semana;
- ver conflicto.

Estados importantes:

- critico;
- atencion;
- pendiente;
- resuelto;
- sin incidencias.

Notas de diseño:

- Evitar dashboard de metricas decorativas.
- Si todo esta cubierto, el dashboard debe decirlo con claridad y ofrecer siguiente contexto util.

## 7. Clock-In / Clock-Out Flow

Usuarios principales: coach, admin para revisiones.

Pregunta que responde:

- ¿Estoy fichando el bloque correcto y queda registro claro?

Contenido principal:

- bloque vinculado;
- centro;
- hora esperada;
- hora real;
- estado del fichaje;
- motivo si hay correccion;
- notas de privacidad si hay geolocalizacion futura.

Acciones clave:

- fichar entrada;
- fichar salida;
- solicitar correccion;
- admin: aprobar/rechazar correccion.

Estados importantes:

- listo para fichar;
- fichaje activo;
- fuera de ventana;
- sin bloque asignado;
- correccion pendiente;
- correccion aprobada/rechazada.

Notas de diseño:

- Fichaje manual primero.
- La geolocalizacion futura solo puede ser comprobacion puntual vinculada a bloque, centro y ventana temporal.

## 8. Class Detail / Programming View

Usuarios principales: coach, admin.

Pregunta que responde:

- ¿Que clase/bloque es, quien lo cubre y que programacion toca?

Contenido principal:

- tipo de actividad;
- fecha, hora y centro;
- coaches asignados;
- cobertura requerida;
- notas;
- documentos o enlaces de programacion;
- historial de cambios relevante.

Acciones clave:

- ver programacion;
- pedir cobertura;
- cambiar asignacion si rol permite;
- abrir documento;
- marcar cambio o cancelacion si rol permite.

Estados importantes:

- cubierto;
- sin cubrir;
- requiere certificacion futura;
- programacion disponible;
- programacion ausente;
- bloque cancelado.

Notas de diseño:

- La programacion debe estar cerca del horario, no perdida en documentos.

## 9. Overtime Summary

Usuarios principales: coach, admin.

Pregunta que responde:

- ¿Cuantas horas llevo y que queda pendiente de validar?

Contenido principal:

- horas contratadas;
- horas planificadas;
- horas fichadas;
- horas extra detectadas;
- horas por eventos/festivos;
- estado de validacion;
- cierre mensual.

Acciones clave:

- filtrar por mes;
- abrir detalle;
- admin: validar/rechazar;
- exportar en fase futura.

Estados importantes:

- detectado;
- pendiente de validacion;
- validado;
- compensado;
- pagado;
- rechazado;
- cerrado.

Notas de diseño:

- No presentarlo como nominas ni calculo legal definitivo.
- Debe ser tracking interno revisable.

## 10. Documents / Signatures / Certifications

Usuarios principales: coach, admin, roles documentales futuros.

Pregunta que responde:

- Que documentos tengo pendientes de firmar?
- ¿Que documentos y certificaciones tengo disponibles o pendientes?

Contenido principal:

- documentos laborales;
- documentos de empresa;
- documentos publicos de equipo;
- documentos de gestion/admin;
- documentos particulares de cada miembro;
- certificaciones;
- fecha de obtencion/caducidad;
- estado;
- adjuntos;
- permisos de visibilidad;
- requisitos de firma por documento;
- firmantes y estado de firma;
- firma dibujada guardada en perfil.

Acciones clave:

- ver documento;
- firmar documento pendiente;
- crear o actualizar firma dibujada desde perfil;
- subir certificado si rol/flujo lo permite;
- renovar o marcar caducidad;
- admin: subir/asignar documentos;
- admin: marcar documento como requerido para firma;
- admin: elegir miembros/personas que deben firmar;
- filtrar por tipo y estado.

Estados importantes:

- vigente;
- caduca pronto;
- caducado;
- pendiente de revision;
- aprobado;
- rechazado;
- privado;
- pendiente de firma;
- firmado;
- firma anulada o version reemplazada.

Notas de diseño:

- Separar documentos sensibles de programacion de clases.
- Separar visualmente documentos de equipo, documentos de gestion/admin y documentos particulares del miembro.
- El gesto de firmar debe ser simple, pero debe mostrar claramente que se aplicara la firma dibujada del perfil al documento/version actual.
- Crear/actualizar "Mi firma" y firmar un documento son acciones distintas.
- Si el usuario ya tiene firma guardada, no debe dibujarla de nuevo en cada documento.
- Si no tiene firma guardada, el flujo debe llevarlo a crearla antes de firmar o abrir una creacion inline segun decision UX.
- Firmar debe guardar snapshot/version de la firma usada; actualizar "Mi firma" no cambia evidencias anteriores.
- Usar permisos estrictos y feedback claro.

## Dependencias De Implementacion

Antes de construir estas pantallas, validar:

- schema y RLS de la entidad afectada;
- roles y permisos;
- estados definitivos;
- datos reales de una semana STL;
- diseño mobile-first;
- tokens base y theming por tenant;
- empty, loading y error states.
