# Guia de uso - Coach

Esta guia describe lo que un `coach` puede hacer hoy en BoxOps tras Fase D.5. Sigue siendo una guia de MVP tecnico, no el panel final de coach.

Nota B.2: `coach` mantiene lectura y uso operativo actual. `owner`/`admin` gestionan configuracion global y accesos; `manager` puede gestionar operativa MVP 1, pero eso no cambia permisos del coach.

Nota D.1/D.2/D.3/D.4/D.5: `/app/account` permite revisar cuenta propia, editar solo el perfil visible vinculado, subir/reemplazar solo el avatar propio y dibujar/guardar solo la firma propia. D.2 documenta permisos futuros, D.3 modela avatar privado, D.4 lo implementa como Storage privado y D.5 implementa "Mi firma" como confirmacion interna privada sin documentos firmables.

## Que puede hacer hoy

Un coach puede:

- iniciar sesion
- solicitar recuperacion de contrasena desde `/login` sin exponer si el email existe
- entrar en `/app`
- seleccionar organizacion si tiene varias memberships activas
- entrar en `/app/account`
- editar su propio nombre visible, alias y email publico opcional si tiene `person_profiles` vinculado
- subir o reemplazar solo su avatar propio en bucket privado
- dibujar, limpiar y guardar/reemplazar solo su firma propia en bucket privado
- ver su cuenta/Auth y su ficha de coach propia en lectura
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

Si olvidas la contrasena, usa "He olvidado mi contrasena" en `/login`. BoxOps mostrara siempre el mismo mensaje generico para no revelar si un email existe; si la cuenta puede recibir acceso, llegara un email de Supabase para crear una nueva contrasena.

Si el usuario no tiene membership activa, la app no muestra el area protegida. No es un castigo; es que BoxOps no sabe todavia a que organizacion pertenece.

## Seleccion de organizacion

Si el coach pertenece a una sola organizacion activa, BoxOps puede resolverla automaticamente.

Si pertenece a varias organizaciones, tiene que elegir una de forma explicita. La URL conserva:

```text
organizationId=<uuid>
```

Esto es deliberado. En multi-tenant, adivinar es una mala costumbre con zapatos elegantes.

## Entrar a Mi cuenta

Ruta:

```text
/app/account
```

Mi cuenta separa:

- cuenta/Auth en lectura;
- perfil visible operativo;
- ficha de coach propia;
- RRHH sensible futuro.

El coach puede editar solo su perfil visible vinculado: nombre visible, alias y email publico opcional. No puede editar perfiles ajenos, cambiar su email Auth desde BoxOps ni acceder a salario, contrato, nominas, documentos, fichaje, geolocalizacion, cambios o ausencias.

"Mi firma" permite dibujar y guardar una firma/confirmacion interna reutilizable dentro de la organizacion activa. No es firma electronica avanzada/cualificada y no hay documentos firmables ni boton "Firmar" en este corte.

D.2 deja preparada la frontera de permisos. D.4 permite guardar tu avatar propio como asset privado tenant-scoped: no usa URL publica libre, se lee con signed URL corta y no permite editar fotos de otras personas desde Mi cuenta. D.5 hace lo mismo para tu firma propia con `profile_signatures`: no puedes crear, cambiar ni usar firmas de otras personas.

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

Eso lo hace un rol operativo (`owner`, `admin` o `manager`). Y esta bien: no queremos que alguien cambie la sede principal porque estaba probando botones.

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

Eso lo hace `owner`/`admin` para accesos y `manager` solo para fichas operativas.

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

El coach no puede crear, editar, activar ni desactivar tipos. Esta informacion sirve para entender horarios y bloques.

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

El coach no puede crear, editar ni aplicar plantillas. Esa gestion queda para roles operativos en este corte.

## Que no puede hacer todavia

El coach todavia no puede:

- pedir cobertura
- aceptar cambios
- declarar ausencias
- fichar
- consultar documentos
- cambiar el avatar de otra persona
- firmar documentos o usar "Mi firma" como firma documental aplicada
- crear, cambiar o usar la firma de otra persona
- ver salario, contrato, nominas o datos laborales sensibles en BoxOps
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
- recibir solicitudes de roles operativos o compañeros

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
