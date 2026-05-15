# Guia de uso - Entrenador

Esta guia describe lo que un `coach` (visible como "Entrenador") puede hacer hoy en BoxOps tras Fase G.1. Sigue siendo una guia de MVP tecnico, no el panel final de entrenador.

Nota B.2: `coach` mantiene lectura y uso operativo actual. `owner` (Propietario) y `admin` (Administrador) gestionan configuracion global y accesos; `manager` (Responsable) puede gestionar operativa MVP 1, pero eso no cambia permisos del entrenador.

Nota D.1/D.2/D.3/D.4/D.5: `/app/account` permite revisar cuenta propia, editar solo el perfil visible vinculado, subir/reemplazar solo el avatar propio y dibujar/guardar solo la firma propia. D.2 documenta permisos futuros, D.3 modela avatar privado, D.4 lo implementa como Storage privado y D.5 implementa "Mi firma" como confirmacion interna privada sin documentos firmables.

Nota F.9/F.10: `/app/time` permite registrar entrada/salida manual propia, consultar la semana de fichaje con avisos operativos y corregir fichajes propios con motivo obligatorio, sin geolocalizacion, payroll, aprobacion legal de horas extra ni garantia legal definitiva. Por defecto, la correccion propia se aplica al enviar de forma trazada. Si el `owner` activa aprobacion previa, el coach envia solicitudes y ve su estado, incluido `applied`, pero no aprueba, rechaza ni aplica solicitudes administrativas. Los fichajes sustituidos o anulados salen de la vista principal del dia y quedan en historial de cambios visible durante 30 dias.

Nota G.1: la geolocalizacion no esta activa todavia. BoxOps no pide permiso de ubicacion, no guarda coordenadas, no hace tracking y no ficha automaticamente por estar en el centro. G.1 solo documenta un modelo futuro de ubicacion puntual, opcional y con fallback manual.

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
- entrar en `/app/time`
- fichar entrada o salida manual propia si tiene `person_profiles` vinculado
- ver la semana de fichaje y avisos frente a sus bloques asignados
- corregir fichajes propios con motivo obligatorio
- consultar sus registros recientes, punches asociados, correcciones y aprobaciones propias
- seguir fichando manualmente aunque en el futuro falle o se deniegue una ayuda de ubicacion
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

Esto es deliberado. En multi-organizacion, adivinar es una mala costumbre con zapatos elegantes.

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

D.2 deja preparada la frontera de permisos. D.4 permite guardar tu avatar propio como asset privado con frontera de organizacion: no usa URL publica libre, se lee con signed URL corta y no permite editar fotos de otras personas desde Mi cuenta. D.5 hace lo mismo para tu firma propia con `profile_signatures`: no puedes crear, cambiar ni usar firmas de otras personas.

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

El coach puede consultar el catalogo de la organizacion en modo lectura.

Hoy esta pantalla muestra:

- nombre y slug
- categoria
- entrenadores necesarios
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
- entrenadores necesarios
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

BoxOps intenta resolver el `coach_profile` del usuario autenticado dentro de la organizacion activa. Si lo encuentra, muestra solo bloques donde ese perfil tenga una asignacion `assigned`.

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
- actividad, centro y entrenadores necesarios;
- entrenador por defecto o vacante.

El coach no puede crear, editar ni aplicar plantillas. Si una plantilla activa tiene rango de validez, la planificacion visible en Horario puede venir de esa base o de una excepcion semanal confirmada por un rol operativo.

## Fichaje manual propio

Ruta:

```text
/app/time
```

El coach puede registrar entrada o salida propia. El formulario no acepta `person_profile_id`: BoxOps deriva la persona desde la sesion, la organizacion activa y la ficha vinculada.

El primer corte permite:

- fichar sin centro, bloque ni asignacion;
- vincular un centro opcional si pertenece a la organizacion activa;
- navegar semanas, ver horas asignadas, horas fichadas, balance y avisos operativos;
- ver registros de jornada de la semana y entradas/salidas asociadas;
- corregir fichajes propios para anadir un fichaje omitido, corregir hora, anular un fichaje erroneo o dejar una nota/correccion de registro;
- ver correcciones y aprobaciones propias cuando existan.
- ver un estado de acceso no autorizado si intenta acceder a la revision administrativa de correcciones.

Los avisos de falta, exceso o fichaje abierto comparan fichajes activos con bloques asignados visibles. Sirven para corregir o pedir revision si la organizacion exige aprobacion, pero no aprueban horas extra ni generan nomina. Si un dia asignado no tiene `time_record`, BoxOps lo muestra como aviso; crear una correccion historica desde cero queda pendiente de una RPC segura.

Las correcciones requieren motivo y no editan el historico en silencio: por defecto se aplican mediante RPC trazada; si la organizacion exige aprobacion, quedan como solicitud pendiente. Este fichaje es manual y auditable. No usa geolocalizacion, no calcula payroll ni horas extra, y no debe presentarse como garantia legal definitiva sin revision laboral.

Cuando una correccion sustituye o anula un fichaje, ese fichaje anterior deja de aparecer en el dia principal y pasa a "Historial de cambios" durante 30 dias. Esa caducidad es visual: el corte actual no borra fisicamente evidencia laboral ni auditoria.

G.1 no anade ninguna accion nueva para el coach: todavia no hay solicitud de permiso de ubicacion, mapa, radio de centro ni fichaje automatico. Si una fase futura usa ubicacion puntual, debera explicar finalidad, pedir permiso en el momento necesario y permitir fichaje manual/correccion cuando falle o se deniegue.

## Que no puede hacer todavia

El coach todavia no puede:

- pedir cobertura
- aceptar cambios
- declarar ausencias
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

## Futuro: fichaje avanzado

Pendiente.

Cuando exista, esta seccion debera explicar:

- vincular fichaje a bloque asignado
- aprobacion semanal completa de registros
- entender reglas de ventana temporal
- entender ubicacion puntual asistida si G.2 la implementa, sin tracking continuo ni app cerrada garantizada

## Futuro: documentos

Pendiente.

Cuando exista, esta seccion debera explicar:

- consultar documentos disponibles
- subir certificaciones si aplica
- ver caducidades o requisitos por tipo de clase
