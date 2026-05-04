# Guia de uso - Coach

Esta guia describe lo que un coach puede hacer hoy en BoxOps tras Task 015. Sigue siendo una guia de MVP tecnico, no el panel final de coach.

## Que puede hacer hoy

Un coach puede:

- iniciar sesion
- entrar en `/app`
- seleccionar organizacion si tiene varias memberships activas
- usar `/app` en modo lectura con accesos a Mi horario y plantillas
- entrar en `/app/centers`
- ver centros de la organizacion activa en modo lectura
- entrar en `/app/coaches`
- consultar la base operativa visible de usuarios/coaches en modo lectura
- entrar en `/app/class-types`
- consultar tipos de clase/actividad en modo lectura
- entrar en `/app/schedule`
- consultar bloques operativos semanales en modo lectura
- ver asignaciones, cobertura basica y filtros operativos
- usar el filtro `mine=1` si su usuario esta vinculado a un `coach_profile`
- entrar en `/app/templates`
- consultar plantillas semanales en modo lectura
- cerrar sesion

## Login

Ruta:

```text
/login
```

Usa un usuario existente de Supabase Auth.

Para entrar como coach, el usuario necesita una fila activa en `organization_memberships` con rol `coach`.

Si el usuario no tiene membership activa, la app no muestra el area protegida. No es un castigo; es que BoxOps no sabe todavia a que organizacion pertenece.

## Seleccion de organizacion

Si el coach pertenece a una sola organizacion activa, BoxOps puede resolverla automaticamente.

Si pertenece a varias organizaciones, tiene que elegir una de forma explicita. La URL conserva:

```text
organizationId=<uuid>
```

Esto es deliberado. En multi-tenant, adivinar es una mala costumbre con zapatos elegantes.

## Entrar a `/app`

Ruta:

```text
/app
```

Hoy muestra el contexto protegido:

- usuario
- organizacion activa
- rol
- zona horaria
- acceso hacia centros

No es todavia "mi panel". Mas adelante deberia llevar al horario del coach, cambios pendientes y avisos utiles.

## Ver centros

Ruta:

```text
/app/centers
```

El coach puede ver:

- nombre del centro
- slug
- zona horaria
- estado
- ultima actualizacion

El coach no puede crear, editar, activar ni desactivar centros.

Eso lo hace admin. Y esta bien: no queremos que alguien cambie la sede principal porque estaba probando botones.

## Ver usuarios y coaches

Ruta:

```text
/app/coaches
```

El coach puede consultar la superficie en modo lectura.

Hoy la pantalla sigue siendo tecnica para altas y roles, pero el horario y las asignaciones ya pueden mostrar nombres visibles desde `person_profiles`.

El coach no puede:

- crear memberships
- cambiar roles
- activar/desactivar usuarios
- crear o editar perfiles de coach

Eso lo hace admin.

## Ver tipos de actividad

Ruta:

```text
/app/class-types
```

El coach puede consultar el catalogo del tenant en modo lectura.

Hoy esta pantalla muestra:

- nombre y slug
- categoria
- coaches necesarios
- si requiere certificacion
- color de referencia, si existe
- estado

El coach no puede crear, editar, activar ni desactivar tipos. Esta informacion servira para entender horarios y bloques cuando esas pantallas existan.

## Ver horario semanal

Ruta:

```text
/app/schedule
```

Si hay varias organizaciones, usa la URL con `organizationId`.

La semana puede abrirse con:

```text
/app/schedule?organizationId=<uuid>&week=2026-04-27
```

La fecha de `week` se normaliza al lunes de esa semana.

El coach puede ver:

- fecha
- hora inicio y fin
- centro
- tipo de actividad
- coaches necesarios
- estado
- notas
- asignaciones activas, pendientes o retiradas como contexto
- cobertura calculada: cubierto, sin cubrir, insuficiente o conflicto

El coach no puede crear, editar, cancelar ni asignar bloques.

## Ver Mi horario

En `/app/schedule`, el filtro "Mi horario" usa:

```text
mine=1
```

BoxOps intenta resolver el `coach_profile` del usuario autenticado dentro del tenant activo. Si lo encuentra, muestra solo bloques donde ese perfil tenga una asignacion `assigned`.

Si no hay perfil de coach vinculado, o hay mas de uno de forma inesperada, la pantalla no elige por su cuenta y muestra un estado vacio seguro.

## Ver plantillas semanales

Ruta:

```text
/app/templates
```

El coach puede consultar plantillas semanales en modo lectura:

- nombre y estado de la plantilla;
- centro al que aplica, si tiene alcance concreto;
- bloques por dia y hora;
- actividad, centro y coaches necesarios;
- coach por defecto o vacante.

El coach no puede crear, editar ni aplicar plantillas. Esa gestion queda para admin en este corte.

## Que no puede hacer todavia

El coach todavia no puede:

- pedir cobertura
- aceptar cambios
- declarar ausencias
- fichar
- consultar documentos
- ver programacion de clase
- actualizar disponibilidad

No esta roto. Simplemente aun no esta construido.

## Futuro: cambios

Pendiente.

Cuando exista, esta seccion debera explicar:

- pedir cambio de clase/bloque
- ofrecer cobertura
- aceptar o rechazar solicitudes
- ver estado de aprobacion

## Futuro: cobertura

Pendiente.

Cuando exista, esta seccion debera explicar:

- ver bloques sin cubrir
- ofrecerse para cubrir
- recibir solicitudes de admin o companeros

## Futuro: ausencias

Pendiente.

Cuando exista, esta seccion debera explicar:

- pedir vacaciones
- marcar dia libre o ausencia puntual
- ver impacto sobre clases asignadas

## Futuro: fichaje

Pendiente.

Cuando exista, esta seccion debera explicar:

- fichar entrada/salida
- vincular fichaje a bloque asignado
- solicitar correccion
- entender reglas de ventana temporal

## Futuro: documentos

Pendiente.

Cuando exista, esta seccion debera explicar:

- consultar documentos disponibles
- subir certificaciones si aplica
- ver caducidades o requisitos por tipo de clase
