# Guia de uso - Admin

Esta guia describe lo que un admin puede hacer hoy en BoxOps tras Task 015. No describe el producto sonado entero; describe la casa que existe ahora.

## Que puede hacer hoy

Un admin puede:

- iniciar sesion
- entrar en `/app`
- seleccionar organizacion si tiene varias memberships activas
- ver dashboard admin basico de cobertura de la semana
- abrir riesgos desde el dashboard hacia el bloque real del horario
- entrar en `/app/centers`
- listar centros de la organizacion activa
- crear un centro minimo
- editar nombre, slug, zona horaria y estado
- activar/desactivar un centro
- entrar en `/app/coaches`
- listar memberships del tenant
- crear una membership minima si conoce el `user_id` de Supabase Auth
- editar rol y estado de una membership
- crear y editar un perfil operativo minimo de coach
- entrar en `/app/class-types`
- listar tipos de clase/actividad del tenant
- crear un tipo minimo
- editar nombre, slug, categoria, coaches necesarios, certificacion, color y estado
- activar/desactivar tipos
- entrar en `/app/schedule`
- elegir una semana con `week=YYYY-MM-DD`
- listar bloques operativos de la semana
- crear un bloque operativo minimo
- editar centro, tipo de actividad, fecha, horas, coaches necesarios, estado y notas
- cancelar un bloque cambiando su estado
- asignar coaches a bloques y retirar asignaciones sin borrar filas
- filtrar horario por centro, coach, actividad, estado, cobertura, solo riesgos y "Mi horario"
- ver cobertura basica calculada: cubierto, sin cubrir, insuficiente y conflicto
- entrar en `/app/templates`
- crear y editar plantillas semanales
- crear y editar bloques de plantilla
- definir bloques de plantilla con coach por defecto o vacantes
- aplicar una plantilla activa a una semana
- editar/cancelar bloques aplicados desde plantilla, que quedan marcados como excepcion
- cerrar sesion

## Login

Ruta:

```text
/login
```

Usa un usuario existente de Supabase Auth.

Si el usuario existe pero no tiene membership activa, BoxOps no lo deja entrar a la parte protegida. No es mala educacion; es tenant safety.

## Seleccion de organizacion

Si el admin tiene una sola membership activa, BoxOps puede resolver la organizacion automaticamente.

Si tiene varias memberships activas, debe elegir una organizacion de forma explicita. La app conserva ese contexto como:

```text
organizationId=<uuid>
```

Ejemplo:

```text
/app?organizationId=<uuid>
```

Esto evita que la app "adivine" el tenant y acabe tocando datos donde no toca.

## Entrar a `/app`

Ruta:

```text
/app
```

Hoy es el dashboard admin basico de cobertura. Sirve para:

- confirmar usuario autenticado, organizacion activa y rol MVP
- revisar la semana activa con `week=YYYY-MM-DD`
- ver resumen de riesgos activos, bloques sin cubrir, conflictos y bloques activos
- revisar una cola accionable ordenada por sin cubrir, conflictos e insuficiencias
- abrir cada riesgo en el bloque real de `/app/schedule`
- entrar a vistas de apoyo por centro

No es el dashboard visual final. Todavia no aprueba cambios, no crea solicitudes y no sustituye la vista semanal de `/app/schedule`.

## Entrar a centros

Ruta:

```text
/app/centers
```

Si hay varias organizaciones, usa la URL con `organizationId`.

Aqui el admin ve los centros del tenant activo.

## Crear centro

En `/app/centers`, el admin puede crear un centro con:

- nombre
- slug
- zona horaria

El centro se crea activo por defecto.

El slug debe ser unico dentro de la organizacion y usar minusculas, numeros y guiones. Nada de slug con energia de "lo arreglo luego".

## Editar centro

Cada centro permite editar:

- nombre
- slug
- zona horaria
- estado

Al guardar, la app vuelve a comprobar:

- sesion
- membership
- organizacion
- rol admin

Si algo falla, se redirige con error. Mira el mensaje antes de pelearte con Supabase.

## Activar/desactivar centro

Los centros no se borran desde la UI.

Se pueden:

- activar
- desactivar

Esto protege el historial futuro. Cuando existan horarios, borrar un centro seria una manera bastante eficaz de fabricar arqueologia digital.

## Entrar a usuarios y coaches

Ruta:

```text
/app/coaches
```

Si hay varias organizaciones, usa la URL con `organizationId`.

Aqui el admin ve dos piezas distintas:

- `organization_memberships`: quien pertenece al tenant, con rol y estado.
- `coach_profiles`: capacidad operativa de coach dentro del tenant.

## Crear membership

En `/app/coaches`, el admin puede crear una membership minima con:

- `user_id` de Supabase Auth
- rol (`admin` o `coach`)
- estado

Importante: el usuario debe existir ya en Supabase Auth. BoxOps todavia no tiene invitaciones ni alta por email desde la UI.

## Editar membership

El admin puede editar:

- rol
- estado

No puede editar su propia membership desde esta pantalla. Es una proteccion sencilla para no quedarse fuera del tenant por accidente.

No hay borrado de memberships desde UI.

## Crear o editar perfil de coach

El perfil operativo permite guardar:

- centro principal
- horas semanales contratadas
- estado
- notas internas

Esto no asigna horarios ni cobertura. Solo prepara la base de personas para el siguiente corte del MVP.

## Entrar a tipos de actividad

Ruta:

```text
/app/class-types
```

Si hay varias organizaciones, usa la URL con `organizationId`.

Aqui el admin gestiona el catalogo de tipos de clase o actividad del tenant.
Este catalogo alimenta los bloques operativos y alimentara plantillas mas adelante.

## Crear tipo de actividad

En `/app/class-types`, el admin puede crear un tipo con:

- nombre
- slug
- categoria
- coaches necesarios
- certificacion requerida
- color opcional

El tipo se crea activo por defecto. El color, si se usa, debe tener formato hexadecimal como `#2563eb`.

## Editar o desactivar tipo

Cada tipo permite editar:

- nombre
- slug
- categoria
- coaches necesarios
- certificacion requerida
- color
- estado

Los tipos no se borran desde la UI. Se activan o desactivan para conservar referencia futura cuando existan horarios y bloques.

## Entrar a horario semanal

Ruta:

```text
/app/schedule
```

Si hay varias organizaciones, usa la URL con `organizationId`.

La semana se puede abrir con:

```text
/app/schedule?organizationId=<uuid>&week=2026-04-27
```

La fecha de `week` puede ser cualquier dia de la semana. BoxOps la normaliza al lunes para cargar de lunes a domingo.

## Crear bloque operativo

En `/app/schedule`, el admin puede crear un bloque con:

- centro
- tipo de actividad
- fecha de servicio
- hora inicio
- hora fin
- coaches necesarios
- estado
- notas

Un bloque operativo no significa solo clase. Puede representar clase, recepcion, evento, competicion u otra actividad configurada en el catalogo.

## Editar o cancelar bloque

Cada bloque permite editar los mismos campos de creacion.

Cancelar no borra el bloque: cambia `status` a `cancelled`. Si hace falta reactivarlo, se puede editar el estado desde el formulario del bloque.

Si el bloque viene de una plantilla, editarlo o cancelarlo marca `is_template_exception = true`. La plantilla sigue existiendo como patron base; la semana aplicada conserva su cambio concreto.

## Asignar coaches y revisar cobertura

En `/app/schedule`, cada bloque muestra asignaciones y cobertura calculada.

El admin puede:

- asignar un coach activo y visible al bloque;
- retirar una asignacion, que pasa a `assignment_status = 'removed'`;
- reactivar una asignacion retirada seleccionando de nuevo el mismo coach;
- ver asignaciones creadas por plantilla con `source = 'template'`;
- ver si el bloque esta cubierto, sin cubrir, insuficiente o en conflicto.

La cobertura cuenta solo asignaciones `assigned` con coach valido dentro del tenant. Un coach inactivo, una membership inactiva o un perfil interno no cubren el bloque.

El conflicto basico aparece cuando el mismo coach esta asignado a bloques activos solapados el mismo dia. Varias clases a la misma hora no son conflicto si las cubren coaches distintos.

## Filtrar horario

La URL de `/app/schedule` puede conservar filtros:

```text
center_id=<uuid>
coach_profile_id=<uuid>
class_type_id=<uuid>
block_status=scheduled
coverage_state=uncovered
risks_only=1
mine=1
```

Los filtros se validan contra el tenant activo. Si una URL trae IDs de otro tenant o valores invalidos, la pantalla los ignora y avisa.

## Entrar a plantillas semanales

Ruta:

```text
/app/templates
```

Aqui el admin gestiona patrones semanales reutilizables.

## Crear o editar plantilla

Una plantilla tiene:

- nombre;
- alcance opcional de centro;
- fechas de validez opcionales;
- estado: borrador, activa o archivada.

Solo las plantillas activas se pueden aplicar a una semana. Las archivadas se conservan, pero no se modifican desde la UI.

## Crear bloques de plantilla

Cada bloque de plantilla define:

- dia de semana;
- hora inicio y fin;
- centro;
- tipo de actividad;
- coaches necesarios;
- coach por defecto opcional;
- notas.

Si no eliges coach por defecto, el bloque queda vacante. Al aplicar la plantilla, ese bloque aparecera como sin cubrir si requiere coach.

## Aplicar plantilla a una semana

En una plantilla activa, el admin elige la semana destino y pulsa "Aplicar a semana".

La aplicacion:

- crea `schedule_blocks` reales con `template_id` y `template_block_id`;
- crea asignaciones `source = 'template'` cuando hay coach por defecto;
- deja vacantes los bloques sin coach por defecto;
- evita duplicar los mismos bloques si aplicas la misma plantilla otra vez sobre la misma semana;
- redirige al horario semanal para revisar el resultado.

## Que no puede hacer aun

Aunque seas admin, todavia no puedes:

- usar el dashboard como dashboard visual final validado con una semana real
- aprobar cambios
- gestionar ausencias
- registrar eventos
- validar horas extra
- usar fichaje
- subir documentos

Esto todavia no existe. No pasa nada, respiramos.

## Dashboard de cobertura

La ruta `/app` muestra el primer dashboard admin basico.

La cola de riesgos prioriza:

- bloques sin cubrir
- conflictos de coach solapado
- cobertura insuficiente

Cada fila tiene un enlace para abrir el bloque en `/app/schedule`. Las vistas de apoyo por centro abren el horario filtrado, conservando `organizationId` y `week`.

Este panel no crea solicitudes ni aprobaciones. Si necesitas resolver un riesgo hoy, entra al bloque del horario y ajusta asignaciones o datos del bloque.

## Futuro: cambios

Pendiente.

Cuando exista, esta seccion debera explicar:

- solicitudes de cambio
- solicitudes de cobertura
- aprobacion admin
- impacto sobre el horario real
