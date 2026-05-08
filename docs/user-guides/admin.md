# Guia de uso - Admin

Esta guia describe lo que un `admin` compatible puede hacer hoy en BoxOps tras Fase D.5. No describe el producto sonado entero; describe la casa que existe ahora.

Nota B.2: `owner` puede hacer lo mismo que `admin` y ademas representa el rol alto recomendado para configuracion global futura. `manager` puede gestionar operativa MVP 1, pero no configuracion global ni accesos/roles. `coach` conserva lectura.

Nota D.1/D.2/D.3/D.4/D.5: todos los roles reconocidos tienen `/app/account` para funciones personales propias. D.2 documenta la matriz de permisos, D.3 modela avatar privado, D.4 permite subir/reemplazar solo el avatar propio con Storage privado y D.5 permite crear/reemplazar solo la firma propia como confirmacion interna privada.

## Que puede hacer hoy

Un admin puede:

- iniciar sesion
- solicitar recuperacion de contrasena desde `/login` sin exponer si el email existe
- entrar en `/app`
- seleccionar organizacion si tiene varias memberships activas
- entrar en `/app/account`
- editar su propio nombre visible, alias y email publico opcional si tiene `person_profiles` vinculado
- subir o reemplazar solo su avatar propio en bucket privado
- dibujar, limpiar y guardar/reemplazar solo su firma propia en bucket privado
- ver su cuenta/Auth y su ficha de coach propia en lectura
- ver dashboard operativo basico de cobertura de la semana
- abrir riesgos desde el dashboard hacia el bloque real del horario
- entrar en `/app/centers`
- listar centros de la organizacion activa
- crear un centro minimo
- editar nombre, slug, zona horaria y estado
- activar/desactivar un centro
- entrar en `/app/coaches`
- listar memberships del tenant
- crear un acceso minimo si conoce el `user_id` de Supabase Auth
- vincular una ficha operativa pendiente con una cuenta Auth real existente por `user_id`
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
- alternar todas las plantillas entre vista Semana y vista Agenda
- crear y editar bloques de plantilla
- definir bloques de plantilla con coach por defecto o vacantes
- aplicar una plantilla activa a una semana
- editar/cancelar bloques aplicados desde plantilla, que quedan marcados como excepcion
- entrar en `/app/settings`
- editar el nombre visible de la organizacion activa
- editar el color de acento guardado en `organizations.theme_config`
- ver que el logo real queda pendiente hasta definir Storage/asset privado
- cerrar sesion

## Login

Ruta:

```text
/login
```

Usa un usuario existente de Supabase Auth.

Si olvidas la contrasena, usa "He olvidado mi contrasena" en `/login`. BoxOps siempre muestra una respuesta generica: si el email corresponde a una cuenta con acceso, Supabase enviara instrucciones. La pantalla no confirma si el email existe.

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

## Entrar a Mi cuenta

Ruta:

```text
/app/account
```

Mi cuenta es personal para cualquier rol, tambien para `owner`, `admin` o `manager` que ademas trabajen como coaches.

Hoy permite:

- ver cuenta/Auth en lectura;
- editar solo tu perfil visible vinculado: nombre visible, alias y email publico opcional;
- revisar tu ficha de coach propia en lectura;
- gestionar su avatar propio privado;
- dibujar y guardar "Mi firma" propia como confirmacion interna reutilizable.

No permite editar perfiles de otras personas ni cambiar email Auth. Tampoco expone salario, contrato, nominas, documentos, fichaje, geolocalizacion, cambios ni ausencias.

D.2 deja documentado que ser `owner`, `admin` o `manager` no basta para ver datos laborales sensibles de otras personas. D.4 permite avatar propio como asset privado tenant-scoped: no usa `person_profiles.avatar_url`, no guarda URL publica libre y no permite reemplazar avatar ajeno desde Mi cuenta. D.5 permite "Mi firma" propia con `profile_signatures` y Storage privado: no es firma electronica avanzada/cualificada, no hay documentos firmables ni boton "Firmar", y no permite crear, actualizar ni usar firmas ajenas. Avatares ajenos, moderacion, documentos firmables y cualquier dato sensible necesitaran permisos especificos, tablas propias, RLS y auditoria antes de existir en la app.

## Entrar a `/app`

Ruta:

```text
/app
```

Hoy es el dashboard operativo basico de cobertura. Sirve para:

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
- rol compatible (`owner`/`admin`/`manager` segun la accion)

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
- Vinculacion de ficha pendiente: conecta una persona/ficha ya creada con una cuenta Auth real.

## Compatibilidad de roles B.2

Roles soportados desde la app:

- `owner`: configuracion global, accesos y operativa MVP 1.
- `admin`: rol compatible que conserva todo lo que hacia en MVP 1.
- `manager`: operativa tenant-wide de MVP 1, sin configuracion global ni accesos.
- `coach`: lectura operativa y "Mi horario".

Roles como `center_manager`, `document_admin`, `payroll_manager` y `staff` se conservan si existen, pero no tienen controles especializados en B.2.

## Crear acceso

En `/app/coaches`, el admin puede crear un acceso minimo con:

- `user_id` de Supabase Auth
- rol (`owner`, `admin`, `manager` o `coach`)
- estado

Importante: el usuario debe existir ya en Supabase Auth. BoxOps todavia no tiene invitaciones ni alta por email desde la UI. El formulario crea acceso por UUID; no envia ningun correo.

## Vincular ficha pendiente con cuenta real

Si una persona/ficha operativa de coach ya existe pero sigue sin cuenta vinculada, el admin puede usar "Vincular cuenta existente".

El flujo pide:

- ficha pendiente visible;
- `user_id` de una cuenta real de Supabase Auth;
- rol inicial o actualizado (`owner`, `admin`, `manager` o `coach`);
- estado del acceso.

Al guardar, BoxOps:

- crea o actualiza `organization_memberships` dentro de la organizacion activa;
- rellena `person_profiles.user_id`;
- rellena `coach_profiles.user_id`;
- conserva `coach_profiles.person_profile_id`;
- rechaza perfiles internos, personas inactivas o IDs de otro tenant;
- rechaza cuentas ya vinculadas a otra persona o ficha del mismo tenant;
- no permite degradar o suspender tu propia membership desde este flujo.

Esto desbloquea que una cuenta real con ficha de coach pueda usar "Mi horario" cuando tenga asignaciones reales. No es una invitacion por email completa ni crea usuarios Auth.

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

La pantalla tiene dos modos de lectura:

- Semana: agrupa los bloques por dia para editar plantillas grandes con menos scroll; en movil muestra solo el dia seleccionado.
- Agenda: conserva la lista vertical ordenada por dia y hora.

El modo elegido se conserva al guardar cambios. Abrir o cerrar la edicion de un bloque no recarga la pantalla: en escritorio aparece un panel lateral y en movil se despliega el formulario bajo el bloque seleccionado.

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

## Entrar a configuracion

Ruta:

```text
/app/settings
```

Tambien se puede abrir desde `/app/more`.

En Fase B.2, `owner` y `admin` pueden editar:

- nombre visible de la organizacion activa;
- color de acento de marca ligera, guardado como `organizations.theme_config.accentColor`.

El color debe ser hexadecimal, por ejemplo:

```text
#0f766e
```

BoxOps lo valida antes de aplicarlo. Si no hay color o no pasa validacion, la app conserva el fallback visual base. El acento no reemplaza estados criticos: sin cubrir, conflicto, error y foco mantienen sus tokens de producto.

## Logo del tenant

La configuracion muestra que el logo real queda pendiente.

No se sube ni se guarda logo en B.1 porque todavia no existe un modelo de asset, Storage privado, permisos ni reglas de uso en documentos/exportes. No metas una URL publica como atajo.

## QA interno con semana de prueba

Para pruebas locales, la semana base de STL se carga desde `supabase/snippets/stl-test-week-2026-05-04.sql` y queda inicialmente vacante.

La muestra interna opcional `supabase/snippets/stl-internal-assignment-sample-2026-05-04.sql` no forma parte del flujo de produccion: solo prepara datos editables para smoke tests. Deja 20 bloques con coach por defecto/asignado, 145 vacantes, un caso insuficiente y un conflicto deliberado. Si existe la cuenta Auth E2E coach local, la vincula a la ficha operativa de Lucas para validar "Mi horario".

## Que no puede hacer aun

Aunque seas admin, todavia no puedes:

- usar el dashboard como dashboard visual final validado con una semana real
- aprobar cambios
- gestionar ausencias
- registrar eventos
- validar horas extra
- usar fichaje
- subir documentos
- reemplazar el avatar de otra persona desde Mi cuenta
- firmar documentos o usar "Mi firma" como firma documental aplicada
- crear, actualizar o usar la firma de otra persona
- ver salario, contratos, nominas o datos laborales sensibles desde Mi cuenta
- ver salario, contratos, nominas o datos laborales sensibles de otras personas solo por ser admin
- subir logo real del tenant

Esto todavia no existe. No pasa nada, respiramos.

## Dashboard de cobertura

La ruta `/app` muestra el primer dashboard operativo basico para `owner`, `admin` y `manager`.

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
