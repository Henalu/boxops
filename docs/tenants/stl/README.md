# Tenant STL

STL es el primer tenant real de BoxOps. Debe servir para validar el producto, no para convertir BoxOps en software a medida.

## Identidad

- Producto: BoxOps.
- Organizacion/tenant: STL.
- Centros iniciales:
  - STL Tremañes.
  - STL City.

## Regla Principal

STL vive como datos/configuracion:

- Seed o datos iniciales.
- Configuracion de tenant.
- Documentacion especifica.
- Branding opcional cuando exista theming.

Las notas visuales especificas del tenant viven en `design-notes.md`. Deben usarse para validar la direccion de BoxOps con STL sin convertir STL en marca base del producto.

STL no debe vivir como:

- Nombre de producto.
- Ruta hardcodeada.
- Condicion en componentes.
- Policy especial.
- Tabla propia.
- Copy generico.

## Casuistica Conocida

### Multi-Centro

STL tendra al menos dos centros. Un coach puede trabajar en varios centros en el mismo dia, por ejemplo mañana en un centro y tarde en otro.

Centros iniciales:

- STL Tremañes.
- STL City.

Necesidades:

- Filtrar horario por centro.
- Ver todos los centros.
- Definir centro principal de coach.
- Permitir coaches multi-centro.
- Preparar geofence por centro para fichaje futuro.

### Horario Semanal

STL necesita una vista semanal completa, no una vista de dia aislado. La vista debe responder rapido:

- Quien trabaja cada dia.
- Donde trabaja cada persona.
- Que clase o funcion realiza.
- Que clases estan cubiertas.
- Que clases estan sin cubrir.

Filtros concretos:

- Mi horario.
- Todos los centros.
- STL Tremañes.
- STL City.
- Solo clases sin cubrir.
- Por coach.
- Por tipo de clase.

### Tipos De Clase / Actividad

Tipos mencionados para arrancar:

- WOD.
- CrossFit For Fun.
- Wellness.
- Open Box.
- Fundamentals.
- Recepcion.
- Evento.
- Competicion.
- Otra actividad.

Pendiente: confirmar nombres exactos usados por STL y si alguno requiere certificacion concreta.

### Plantillas

STL probablemente necesita plantillas para no asignar cada dia manualmente.

Casos:

- Plantilla semanal estandar.
- Aplicar a varias semanas o un mes.
- Modificar dias concretos como excepciones.
- Ver excepciones respecto a la plantilla original.

### Cobertura

STL necesita detectar automaticamente:

- Clases sin entrenador.
- Clases con menos entrenadores de los necesarios.
- Coaches asignados en dos sitios a la vez.
- Solapamientos entre centros.
- Dias con cobertura insuficiente.

Ejemplo esperado:

```text
Miercoles 16:30 - Wellness - STL Tremañes esta sin cubrir.
```

### Cambios, Vacaciones Y Ausencias

STL necesitara flujos para:

- Cambios de horario.
- Cambios de clase.
- Cobertura puntual por compañeros.
- Intercambios.
- Vacaciones.
- Dias libres.
- Medios dias.
- Ausencias puntuales.
- Permisos/bajas.

Prioridad: despues de MVP 1, salvo que STL confirme que el dolor principal es este y no la carga inicial de horarios/cobertura.

### Eventos, Competiciones Y Festivos

STL tiene o puede tener:

- Competiciones.
- Eventos internos.
- Seminarios.
- Open days.
- Festivos con cobertura voluntaria.

La app debe permitir ver impacto de eventos en cobertura. Si muchos coaches quieren ir a una competicion, el admin debe ver si el box queda descubierto.

### Horas Extra

STL puede necesitar tracking de:

- Horas contratadas.
- Horas planificadas.
- Horas fichadas.
- Horas extra por cobertura.
- Horas extra por eventos.
- Horas extra por festivos.
- Validacion y cierre mensual.

No se generaran nominas en primeras fases.

### Fichaje

El fichaje es un dolor importante para STL, pero debe entrar por fases.

Regla critica:

No fichar solo porque un coach entra al box. Los coaches tambien entrenan alli fuera de horario laboral.

Condiciones para fichaje asistido futuro:

- Turno asignado.
- Centro correcto.
- Ventana cercana a inicio/fin.
- Sin fichaje activo.
- Sin seguimiento continuo.

### Documentos Y Programacion

STL usa o puede usar:

- PDFs de programacion CrossFit.
- Google Drive para wellness.
- Otros documentos de clase.

Deseado:

- Asociar documentos o enlaces a clase/tipo/fecha.
- Boton "ver programacion" desde horario.
- Fase futura con IA para extraer y consultar programacion.

## Validacion Operativa Recibida - 2026-04-30

Esta informacion procede de validacion directa del tenant piloto. Debe usarse para configurar y probar STL, no para hardcodear reglas de BoxOps.

### Prioridad Del Dashboard Admin

El dashboard admin de cobertura para STL debe ordenar la cola de riesgos asi:

1. Bloques sin cubrir, porque impiden operar.
2. Conflictos graves, por ejemplo un coach asignado a dos clases a la misma hora.
3. Cobertura insuficiente, por ejemplo una clase que necesita 2 coaches y solo tiene 1.
4. Riesgos de la semana, como bloques futuros aun sin confirmar.
5. Vistas de apoyo por centro, coach o semana.

Esta prioridad informa el producto generico: el dashboard debe ser una cola accionable de riesgos, no una pantalla de metricas decorativas.

### Roles De Gestion

STL necesita al menos:

- un admin con permisos completos;
- un segundo rol de gestion operativa con permisos para horarios, cobertura, asignaciones y aprobaciones, pero sin todos los permisos del admin completo.

Nombre recomendado para el segundo rol: `manager`.

En producto, `manager` debe entenderse como responsable operativo. Debe poder gestionar horarios/cobertura cuando se implemente, pero no deberia asumir automaticamente permisos de billing, configuracion global, seguridad avanzada o administracion completa de usuarios.

### Coaches Iniciales

Coaches activos recibidos:

- Nuria.
- Lucas.
- Pedro.
- Valentina.
- Valentina Oxley.
- Roberto.
- Juanma.
- Noah.
- Lucia.

Asignacion inicial de centro principal, editable por admin:

| Coach | Centro principal inicial | Horas semanales iniciales |
|---|---|---|
| Nuria | STL Tremañes | 20 |
| Pedro | STL Tremañes | 20 |
| Valentina Oxley | STL Tremañes | 20 |
| Noah | STL Tremañes | 20 |
| Roberto | STL Tremañes | 20 |
| Lucas | STL City | 20 |
| Valentina | STL City | 20 |
| Juanma | STL City | 20 |
| Lucia | STL City | 20 |

Estos valores son configuracion inicial. El admin debe poder cambiar centro principal, centros asociados y horas semanales. Los coaches deben poder editar sus datos publicos basicos, como nombre visible y foto de perfil, cuando exista el perfil publico/persona.

### Roles Y Alias Operativos Validados

Perfiles operativos iniciales a crear cuando el schema permita personas/coaches pendientes de Auth:

| Nombre inicial | Alias/nombre visible inicial | Rol operativo inicial | Centro principal inicial | Horas semanales iniciales | Cuenta Auth |
|---|---|---|---|---|---|
| Roberto | Rober | `admin` | STL Tremañes | 20 | Pendiente |
| Juanma | Juanma | `admin` | STL City | 20 | Pendiente |
| Nuria | Nuria | `manager` | STL Tremañes | 20 | Pendiente |
| Pedro | Pedrin | `manager` | STL Tremañes | 20 | Pendiente |
| Valentina Oxley | Valentina Oxley | `coach` | STL Tremañes | 20 | Pendiente |
| Noah | Noah | `coach` | STL Tremañes | 20 | Pendiente |
| Lucas | Lucas | `coach` | STL City | 20 | Pendiente |
| Valentina | Valentina | `coach` | STL City | 20 | Pendiente |
| Lucia | Lucia | `coach` | STL City | 20 | Pendiente |

Estos valores sustituyen la asignacion inicial simple de centro/horas como fuente de verdad para los perfiles operativos STL. El admin debe poder cambiar rol, centro principal, centros asociados y horas semanales.

Notas:

- Roberto y Juanma son admins completos.
- Nuria y Pedro/Pedrin son gestores operativos; el rol recomendado en producto es `manager`.
- El resto son coaches.
- Los nombres completos y correos reales quedan actualizados en la seccion "Perfiles Operativos Actualizados - 2026-04-30", salvo el email de Nuria. No se deben crear cuentas Auth reales para estos coaches hasta que se registren o acepten invitacion.
- El alias/nombre visible debe ser editable por cada persona. Ejemplos validados: Pedro puede mostrarse como Pedrin; Roberto puede mostrarse como Rober.

### Perfiles Operativos Actualizados - 2026-04-30

Estos datos actualizan los perfiles operativos iniciales. Siguen siendo datos de tenant/configuracion privada, no reglas genericas de BoxOps.

Tener email documentado no significa crear la cuenta Auth todavia. La recomendacion sigue siendo crear perfiles operativos primero y vincular la cuenta real cuando la persona se registre o acepte invitacion.

| Nombre completo | Alias/nombre visible inicial | Email | Rol operativo inicial | Rol producto | Centro principal inicial | Horas semanales iniciales | Cuenta Auth |
|---|---|---|---|---|---|---|---|
| Nuria Blanco Perez | Nuria | Pendiente | Admin Gestor | `manager` | STL Tremañes | 20 | Pendiente |
| Juanma Torrontegui | Juanma | juanmatorronteguiperez@gmail.com | Admin General | `admin` | STL City | 20 | Pendiente |
| Lucas Peralta | Lucas | lucasperaltagijon@gmail.com | Coach | `coach` | STL City | 20 | Pendiente |
| Lucia Fernandez | Lucia | luciape1994@gmail.com | Coach | `coach` | STL City | 20 | Pendiente |
| Noah Iglesias Mendez | Noah | iglesiasmendeznoah@gmail.com | Coach | `coach` | STL Tremañes | 20 | Pendiente |
| Pedro Gonzalez Lopez | Pedrin | pedro45399@gmail.com | Admin Gestor | `manager` | STL Tremañes | 20 | Pendiente |
| Roberto Vega | Rober | robervg1990@gmail.com | Admin General | `admin` | STL Tremañes | 20 | Pendiente |
| Valentina Oxley | Valentina Oxley | valentinaoxley302@hotmail.com | Coach | `coach` | STL Tremañes | 20 | Pendiente |
| Valentina Rodriguez | Valentina | valenntnrg@gmail.com | Coach | `coach` | STL City | 20 | Pendiente |

Pendiente solo en esta lista:

- Email de Nuria.
- Confirmar si los emails se usaran para invitacion Auth o si cada persona podra cambiarlos antes de activar su cuenta.

### Usuario Tecnico Interno

Para pruebas, mantenimiento y revision se puede crear un usuario tecnico interno:

- Nombre visible: Henalu Paes de Barros.
- Email: henalupaesdebarros@gmail.com.
- Rol: admin tecnico interno.
- Visibilidad: no debe aparecer en listados normales de coaches/equipo ni en asignaciones operativas.

Este usuario debe servir para mantenimiento y QA, no para operar clases. A nivel de producto, esto implica que el perfil visible/persona debe soportar perfiles internos u ocultos para usuarios tecnicos que tienen acceso pero no forman parte del equipo visible.

Implementacion Task 009:

- Queda como `person_profile` de STL con `visibility_status = internal`.
- Queda sin `coach_profile`, por tanto no es asignable como coach.
- No se crea cuenta Auth real desde el seed.
- Su rol admin tecnico queda documentado como metadata/configuracion inicial; el acceso real seguira dependiendo de una membership cuando exista `auth.users`.

### Registro De Coaches

Decision provisional:

- No crear cuentas reales de coaches con correos inventados.
- No decidir por ellos que email usaran.
- Cada coach deberia registrarse o aceptar una invitacion cuando la app este lista.
- Despues del registro, el admin vincula o completa membership, perfil visible y `coach_profile`.
- Si hace falta preparar horarios antes de que todos se registren, los datos iniciales pueden vivir como configuracion/fixture de tenant y luego vincularse a usuarios reales.

Opcion recomendada para producto:

1. Admin crea o importa personas/coaches visibles con nombre y centro inicial.
2. La app permite asignar esas personas a bloques.
3. Cuando el coach se registra o acepta invitacion, se vincula su cuenta Auth al perfil existente.

Esta opcion evita forzar contraseñas o emails provisionales. Si el schema exige `auth.users` desde el inicio, habra que decidir si el MVP crea invitaciones Auth primero o si el modelo de persona permite perfiles operativos pendientes de usuario.

Task 009 ya implementa la opcion recomendada:

- `person_profiles` permite personas pendientes de Auth.
- `coach_profiles.person_profile_id` permite capacidad operativa de coach sin `auth.users`.
- `coach_profiles.user_id` se mantiene para compatibilidad cuando exista membership/Auth.
- La vinculacion final con Auth queda pendiente de un flujo de invitacion/registro.

### Seed, Fixture O Configuracion Privada

Cuando se habla de si estos datos pueden ir en seed/fixture o configuracion privada, la decision es sobre donde viven los datos iniciales reales de STL:

- Seed del repo: archivo versionado que cualquier desarrollador del proyecto puede ejecutar. Solo conviene si los datos son publicables, anonimizados o no sensibles.
- Fixture anonimo: datos parecidos a los reales, pero sin nombres/personas reales. Sirve para tests, demo y desarrollo sin exponer informacion del cliente.
- Configuracion privada de tenant: datos reales de STL cargados en una base concreta o archivo no versionado. Es lo mas prudente para horarios, personas y correos reales.

Decision provisional:

- El horario real y coaches reales pueden documentarse en `docs/tenants/stl/` mientras el proyecto es privado.
- Para tests o demo generica, crear fixture anonimo.
- Para produccion o piloto real, cargar datos como configuracion privada de tenant, no como seed publico reutilizable.

Estado tras Task 009:

- `supabase/seeds/02_stl_tenant.sql` contiene `person_profiles` y `coach_profiles` iniciales de STL como configuracion de tenant del repo privado.
- Los perfiles de coaches quedan con `Cuenta Auth: Pendiente` y `user_id = null`.
- Nuria queda con `public_email = null`.
- Henalu queda como perfil tecnico interno, no asignable como coach.
- No se cargan cuentas Auth reales, templates, horarios reales ni asignaciones reales desde este seed.

Decision Fase A 2026-05-06:

- Mantener el horario real, plantillas reales y asignaciones reales fuera del seed automatico hasta confirmar la semana completa de ambos centros.
- Usar base privada de piloto o snippet local nombrado para validar una semana real, nunca `src` ni condiciones especiales en producto.
- Crear fixture anonimizado solo despues de cerrar la distribucion exacta de STL City, los huecos reales y los casos de cobertura que se quieran conservar para pruebas.
- Antes del fixture, la comprobacion local de Fase A encontro STL con 2 centros, 10 perfiles de persona, 9 coaches, 8 tipos, 0 plantillas y 0 bloques.
- Tras aplicar `supabase/snippets/stl-test-week-2026-05-04.sql`, STL queda en local con 1 plantilla activa, 165 bloques de plantilla, 165 bloques reales y 0 asignaciones.

### Visibilidad Entre Coaches

Para STL, los coaches deben poder ver:

- horarios completos del equipo;
- que clases va a dar cada coach;
- datos basicos de persona, al menos nombre y foto de perfil.

Esto confirma que el perfil publico/persona es necesario antes de una UI final de horarios, para evitar UUIDs y permitir datos visibles controlados por tenant.

### Reglas De Clases Y Cobertura

Validado para el primer corte:

- Cada clase requiere 1 coach por defecto.
- En la misma franja puede haber varias clases simultaneas.
- Que haya varias clases a la misma hora no es conflicto por si mismo.
- Hay conflicto si el mismo coach queda asignado a dos bloques solapados.
- Las certificaciones no influyen de momento en la asignacion de clases.
- Los conflictos mas frecuentes esperados son bloques sin cubrir y cambios de turnos.
- No hay reglas de traslado entre centros para el primer corte.
- Los cambios de centro/turno deben requerir aprobacion de `admin` o `manager`.

### Plantillas

Las plantillas deben permitir ambas opciones:

- guardar coach por defecto en algunos bloques;
- dejar huecos vacantes en otros bloques.

Si una plantilla aplicada deja un bloque sin coach, ese bloque debe aparecer como riesgo de cobertura para que el admin lo tenga en cuenta ese dia o esa semana.

### Horario Semanal Recibido

Horario real recibido con `dia`, `hora_inicio`, `hora_fin` y `actividad`.

Decision de datos iniciales recibida despues:

- Los bloques del horario recibido corresponden inicialmente a STL Tremañes.
- STL City debe tener los mismos dias y franjas horarias iniciales, pero solo con actividades CrossFit y Wellness.
- Las asignaciones iniciales de coaches a bloques pueden generarse aleatoriamente por centro como dato de arranque editable.
- La asignacion aleatoria debe evitar asignar el mismo coach a bloques solapados cuando sea posible.
- El admin debe poder corregir despues cualquier bloque, coach, centro, hora o actividad.

Pendiente para implementacion: definir si la distribucion de STL City entre CrossFit y Wellness sera alterna, aleatoria deterministica o configurada manualmente antes del seed.

Estado Fase A 2026-05-06:

- El horario recibido sirve como semana real base para STL Tremañes.
- STL City sigue parcial: estan validadas las mismas franjas y el limite a CrossFit/Wellness, pero falta la actividad exacta por franja.
- No hay coach asignado validado por bloque real.
- La UI y smoke E2E local admin/coach pasan contra la semana `2026-05-04`.
- No se debe presentar esta semana como cerrada para piloto hasta cargar o confirmar asignaciones reales, huecos vacantes y estado operativo por bloque.

### Semana De Prueba L-V Recibida - 2026-05-06

El usuario facilito una semana completa de prueba para validar MVP 1 en STL:

- aplica de lunes a viernes;
- cubre franjas desde las 07:00 hasta las 21:00;
- cada bloque requiere 1 coach;
- la duracion normal de clase es 1 hora;
- `CrossFit Teens` dura 1 hora y media;
- puede haber varias clases a la misma hora y eso es normal;
- no hay coach asignado por bloque todavia;
- no se dio centro por bloque, asi que el fixture local se cargo temporalmente en STL Tremañes para poder validar la UI.

Bloques diarios de la semana de prueba:

| Hora | Actividades |
|---|---|
| 07:00-08:00 | Wellness, Open Box |
| 08:00-09:00 | CrossFit 4Fun, Open Box, Wellness |
| 09:30-10:30 | Wellness, Open Box |
| 10:00-11:00 | Open Box, Halterofilia Mix |
| 11:00-12:00 | Wellness |
| 11:15-12:15 | CrossFit, Open Box |
| 12:30-13:30 | Open Box |
| 14:00-15:00 | Open Box, CrossFit 4Fun |
| 15:00-16:00 | Open Box |
| 15:15-16:15 | Wellness |
| 16:00-17:30 | CrossFit Teens |
| 16:30-17:30 | Wellness, CrossFit 4Fun, Open Box |
| 17:35-18:35 | Halterofilia Avanzados, Wellness, CrossFit 4Fun |
| 18:40-19:40 | CrossFit, Wellness, Halterofilia Mix |
| 19:50-20:50 | CrossFit, Halterofilia Mix, Wellness |
| 21:00-22:00 | CrossFit, Wellness, Open Box |

Fixture local:

- Archivo: `supabase/snippets/stl-test-week-2026-05-04.sql`.
- Semana cargada: 2026-05-04 a 2026-05-08.
- Resultado esperado: 1 plantilla activa, 165 bloques de plantilla, 165 bloques reales y 0 asignaciones.
- Todos los bloques quedan vacantes para que `/app/coverage` muestre riesgos sin inventar coaches.

La tabla anterior es la fuente vigente de la semana de prueba. El detalle historico anterior con sabado/domingo queda fuera de este fixture.

## Informacion Pendiente

- Confirmar si la semana de prueba L-V pertenece a STL Tremañes, a STL City o debe repartirse entre centros por bloque.
- Confirmar coach asignado por bloque, o si todos/parte de los bloques deben quedar vacantes como huecos reales.
- Confirmar si se quieren asignaciones de prueba para validar estados cubiertos/conflicto, o si la primera validacion debe centrarse en bloques sin cubrir.
- Email de Nuria y confirmacion de si los emails recibidos se usaran para invitacion Auth o podran cambiarse antes de activar cuenta.
- Reglas exactas de aprobacion para cambios de turno.
- Politica de vacaciones y ausencias.
- Necesidades reales de fichaje.
- Documentos laborales que deben centralizarse.
- Documentos de programacion actuales.
- Eventos que hoy se gestionan por WhatsApp, Excel u otra herramienta.

## Primer Corte Recomendado

Para validar rapido con STL:

1. Cargar centros.
2. Cargar coaches.
3. Cargar tipos de clase/actividad.
4. Cargar una semana real de clases/bloques.
5. Detectar clases sin cubrir y solapamientos.
6. Probar filtros por centro, coach y tipo.
7. Revisar si la vista semanal ya reduce conversaciones y errores.

## Criterio De Exito Del Piloto

STL puede mirar una semana y responder sin buscar en WhatsApp:

- Que clases hay por centro.
- Quien las imparte.
- Que clases estan sin cubrir.
- Que cambios se han hecho.
- Quien esta ausente.
- Que eventos afectan a la cobertura.
- Que documentos/programacion estan asociados a cada clase.
