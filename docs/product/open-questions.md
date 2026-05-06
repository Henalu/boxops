# Dudas Abiertas - BoxOps

## Respuestas Validadas Con STL - 2026-04-30

Estas respuestas informan MVP 1, pero no deben convertirse en reglas hardcodeadas del producto.

- El dashboard admin debe priorizar: bloques sin cubrir, conflictos graves, cobertura insuficiente, riesgos de la semana y despues vistas de apoyo por centro/coach/semana.
- Los coaches de STL deben poder ver el horario completo del equipo, las clases de otros coaches y datos basicos como nombre y foto de perfil.
- Los horarios reales deben ser editables por `admin` y por un rol operativo recomendado como `manager`.
- STL necesita dos roles operativos altos: admin completo y gestor operativo. Nombre recomendado en producto: `manager`.
- Cada clase requiere 1 coach por defecto en el primer corte.
- Puede haber varias clases en la misma franja horaria; eso no es conflicto salvo que el mismo coach este asignado a bloques solapados.
- Las certificaciones no influyen de momento en la asignacion de clases.
- Las plantillas deben permitir guardar coaches por defecto y tambien dejar bloques vacantes.
- Si una plantilla deja huecos vacantes, esos bloques deben aparecer como riesgo de cobertura.
- Los conflictos frecuentes esperados son bloques sin cubrir y cambios de turnos.
- No hay reglas de traslado entre centros para el primer corte.
- Los cambios de turno/centro deben requerir aprobacion de `admin` o `manager`.
- Se recibio un horario semanal real con dia, hora inicio, hora fin y actividad. Queda documentado en `docs/tenants/stl/README.md`.
- Se recibio una lista inicial de coaches y centro principal inicial. Queda documentada en `docs/tenants/stl/README.md`.
- Los bloques del horario recibido corresponden inicialmente a STL TremaÃ±es.
- STL City debe usar las mismas franjas horarias iniciales, pero solo con actividades CrossFit y Wellness.
- Las asignaciones iniciales de coaches a bloques pueden ser aleatorias por centro y editables por admin.
- Los coaches no deben recibir cuentas creadas unilateralmente con correos inventados; deben registrarse o aceptar invitacion con el email que prefieran.
- Se puede crear un usuario tecnico interno para Henalu Paes de Barros con `henalupaesdebarros@gmail.com`, oculto del equipo operativo.
- Task 009 resuelve el nombre de la tabla de perfil visible/persona: `person_profiles`.
- `person_profiles` es tenant-scoped y permite `user_id = null` para personas pendientes de Auth.
- `display_name` queda como nombre visible obligatorio; `preferred_alias` queda separado y opcional.
- `public_email` es opcional y puede quedar `null`; Nuria queda pendiente.
- `coach_profiles.person_profile_id` permite coaches operativos pendientes de Auth sin romper el modelo actual por `user_id`.
- Los perfiles `internal` no se exponen como equipo operativo normal; Henalu queda como perfil tecnico interno sin `coach_profile`.
- `manager` queda como rol operativo futuro para horarios/asignaciones/aprobaciones, pero Task 009 no le da permisos completos de gestion de perfiles.
- Task 010 implementa asignaciones manuales y cobertura basica desde `schedule_block_assignments`, sin dashboard ni plantillas.
- En Task 010 los conflictos de solapamiento no bloquean guardar una asignacion; se muestran como riesgo `conflict` calculado.
- `manager` sigue pendiente para permisos operativos de horarios/cobertura: no recibe permisos completos hasta una tarea explicita.
- Task 014 implementa el primer dashboard admin basico en `/app`, con cola de riesgos calculada al vuelo y enlaces al bloque real.
- Perfiles operativos iniciales STL pendientes de Auth:
  - Roberto: `admin`, alias Rober, STL TremaÃ±es, 20 horas.
  - Juanma: `admin`, STL City, 20 horas.
  - Nuria: `manager`, STL TremaÃ±es, 20 horas.
  - Pedro: `manager`, alias Pedrin, STL TremaÃ±es, 20 horas.
  - Valentina Oxley: `coach`, STL TremaÃ±es, 20 horas.
  - Noah: `coach`, STL TremaÃ±es, 20 horas.
  - Lucas: `coach`, STL City, 20 horas.
  - Valentina: `coach`, STL City, 20 horas.
  - Lucia: `coach`, STL City, 20 horas.
- Perfiles operativos actualizados con nombres completos y emails disponibles en `docs/tenants/stl/README.md`; falta solo el email de Nuria.

## Dudas Parcialmente Abiertas Tras La Validacion

- Semana de prueba L-V recibida el 2026-05-06: 33 bloques diarios, 165 bloques semanales, 1 coach requerido por bloque, clases simultaneas normales y `CrossFit Teens` de 90 minutos.
- La semana de prueba se cargo en local con `supabase/snippets/stl-test-week-2026-05-04.sql` como fixture no automatico, con 1 plantilla, 165 bloques reales y 0 asignaciones.
- La validacion E2E local admin/coach pasa contra el tenant STL de prueba y la semana `2026-05-04`; no sustituye credenciales reales del piloto.
- Falta confirmar si la semana de prueba pertenece a STL Tremanes, STL City o debe repartirse entre centros por bloque.
- Falta decidir si la primera validacion mantiene todos los bloques vacantes o si habra asignaciones de prueba para validar estados cubiertos/conflicto.
- Falta email de Nuria y confirmar si los emails recibidos se usaran para invitacion Auth o podran cambiarse antes de activar cuenta.
- Fase A 2026-05-06 decide no mover horarios/asignaciones reales al seed automatico hasta confirmar centro por bloque, huecos/asignaciones reales y credenciales E2E; para validar piloto usar base privada o snippet local nombrado, y crear fixture anonimizado despues.
- Falta confirmar politica de vacaciones, ausencias, fichaje, documentos y programacion.

## Dudas Nuevas Para Roadmap 2026-05-06

Estas dudas ordenan Fase B-I. No bloquean cerrar MVP 1 real, pero si deben resolverse antes de implementar datos sensibles, permisos avanzados o automatismos.

### Configuracion De Tenant Y Branding

- Quien puede cambiar logo, acento corporativo y colores por centro: `owner`, `superadmin`, `admin`, `manager` o un permiso especifico?
- El logo del tenant debe guardarse como asset privado en Supabase Storage, como referencia a un asset interno o como URL controlada?
- Que formatos/tamanos de logo se aceptan y quien puede eliminarlos o reemplazarlos?
- Que contraste minimo se exige para acento y colores por centro antes de guardarlos?
- Cuando un color de tenant falla contraste, se bloquea el guardado o se guarda pero la UI usa fallback?
- Hay que permitir preview/borrador de tema o basta publicar cambios directos?
- Debe existir auditoria de cambios de marca desde el primer corte o basta `updated_at` en organizacion?
- `organizations.theme_config jsonb` sigue siendo suficiente para Fase B o algun permiso/versionado obliga a tabla dedicada?

### Roles Y Permisos

- Nombre final del rol de configuracion global: `owner` o `superadmin`?
- Nombre final del rol de gestion diaria: `manager` o se mantiene `admin` como gestion diaria?
- Que pasa con usuarios `admin` existentes cuando aparezca `owner`/`manager`: migracion automatica, mapeo temporal o selector manual?
- Que permisos exactos separan configuracion global de gestion diaria?
- Puede un `manager` crear/editar usuarios o solo gestionar horarios, plantillas, cobertura y aprobaciones?
- Deben existir permisos por centro para managers o el primer corte es por organizacion completa?
- Que funciones personales ve cualquier usuario, incluidos `owner` y `admin`, porque tambien pueden trabajar como coaches?
- Que acciones requieren permiso especifico y no solo rol alto: ver salario, subir nomina, ver documentos privados, aprobar fichajes, exportar registros?

### Auth Y Seguridad

- Que configuracion concreta de Supabase Auth se usara para contrasena minima: 8 caracteres, al menos una letra y un numero?
- La validacion visual de app debe mostrar checklist de requisitos o solo error resumido?
- Que mensaje de reset se muestra para no revelar si un email existe?
- El bloqueo de 3 intentos fallidos debe aplicarse por email, por IP, por usuario autenticado, por dispositivo o combinacion?
- Como se avisan intentos restantes sin confirmar que el email existe?
- Supabase Auth rate limits son suficientes o hace falta Password Verification Hook y tabla propia?
- Cuanto dura el cooldown inicial y quien puede desbloquearlo?
- Debe registrarse auditoria de resets, fallos de login y bloqueos desde Fase C?

### Area Personal Y RRHH

- El nombre visible, alias, foto y centro principal siguen en `person_profiles`, pero donde viven datos laborales sensibles?
- Que datos puede editar el usuario: telefono, direccion, foto, alias, contacto emergencia, datos bancarios, certificaciones?
- Que datos solo edita personal autorizado: puesto, antiguedad, jornada, contrato, salario/retribucion, centro laboral, horas contratadas?
- Debe existir historial de cambios de salario/retribucion o basta valor actual en el primer corte?
- Salario/retribucion se guarda como importe estructurado, rango, texto libre o queda fuera hasta validacion legal/operativa?
- Quien puede ver salario/retribucion: owner, payroll_manager, document_admin, admin, manager o solo permisos explicitos?
- Como se maneja un admin que tambien es coach para que pueda ver sus datos personales sin ver datos sensibles de todo el equipo?
- Se necesita consentimiento o aviso especifico para almacenar datos laborales personales?
- La firma dibujada reutilizable debe ser tenant-scoped por `organization_id` + `person_profile_id` o global por usuario?
- Si un usuario pertenece a varias organizaciones, debe tener una firma distinta por tenant o una firma compartida entre tenants?
- Que roles, si alguno, pueden ver metadata o evidencias de "Mi firma" sin poder usarla para firmar?
- Que retencion aplica a la firma guardada en perfil si el usuario deja la organizacion?
- Debe existir historial/versionado de cambios de "Mi firma" o solo conservar snapshots cuando se firma algo?

### Documentos Y Permisos

- Que tipos documentales entran primero: empresa, nominas, contratos, anexos, certificados, titulaciones, programacion, justificantes?
- Que documentos requeriran firma: nominas, contratos, anexos, politicas internas, confirmaciones de lectura, partes horarios u otros?
- Se necesita confirmacion de lectura ademas de firma en algunos documentos?
- Que validez legal se pretende: confirmacion interna, firma electronica simple o integracion futura con proveedor especializado?
- Los permisos se definen por documento, carpeta, categoria, persona, rol o combinacion?
- Como se modela compartir con personas concretas estilo Drive: tabla de grants por `person_profile_id`, `membership_id` o `user_id`?
- Un documento privado de empleado lo ve siempre el empleado aunque no tenga `user_id` activado todavia?
- Quien puede subir nominas u otros documentos privados al espacio de cada empleado?
- Quien puede ver auditoria de acceso a documentos sensibles?
- Quien puede ver evidencias de firma y snapshots: firmante, owner, document_admin, payroll_manager, auditor interno o solo permisos explicitos?
- Se deben registrar descargas, previsualizaciones y URLs firmadas emitidas?
- Cuanto duran las URLs firmadas por defecto?
- Que ocurre si se revoca un permiso despues de haber emitido una URL firmada?
- Se necesita versionado de documentos desde el primer corte?
- Que retencion aplica a documentos firmados, solicitudes de firma y snapshots de firma?
- Las certificaciones de coaches son documentos privados, semi-publicos para gestores o visibles al equipo?
- La firma dibujada sera solo confirmacion interna o se necesitara proveedor legal especializado para algun documento?

### Fichaje Manual

- El fichaje se vincula siempre a `schedule_blocks` asignados o puede registrar jornadas no planificadas?
- Quien aprueba la semana: owner, admin, manager, payroll_manager o responsable de centro?
- La aprobacion semanal bloquea ediciones posteriores o permite reaperturas con auditoria?
- Que motivos de correccion son cerrados y cuales permiten texto libre?
- Que pasa si falta entrada o salida al cerrar la semana?
- Que formato de exporte exige el primer cliente: CSV, PDF, Excel o informe imprimible?
- Que datos debe ver el trabajador en su propio registro?
- Como se habilita acceso a representantes/Inspeccion sin crear permisos peligrosos permanentes?
- Que politica de retencion exacta se aplica mas alla del minimo de 4 anos?

### Geolocalizacion Y Fichaje Asistido

- El fichaje geolocalizado sera sugerencia, accion con confirmacion del usuario o automatismo?
- Que centros tienen ubicacion exacta y quien puede configurarla en mapa?
- El radio inicial de 100m es valido para centros en interior, zonas densas o sedes cercanas?
- Que tolerancia temporal hay antes/despues del horario?
- Si el usuario llega antes y sigue dentro al inicio, cada cuanto se revalida ubicacion?
- Como se evita fichar si el usuario entra al box a entrenar fuera de horario?
- La salida automatica a la hora prevista debe avisar al usuario o aplicarse directamente si hay entrada activa?
- Que datos de ubicacion se guardan: coordenada puntual, precision, centro detectado, o solo resultado dentro/fuera?
- Que texto de consentimiento explica que no hay tracking continuo ni historial de movimientos?
- Que fallback existe si el usuario deniega permisos o el GPS falla?

### PWA Y App Movil

- La PWA cubre bien fichaje manual, horario y documentos en mobile antes de invertir en stores?
- Que requisito comercial haria innegociable fichaje automatico con app cerrada?
- Si hace falta app movil, se prefiere Capacitor/Ionic, React Native/Expo u otra estrategia?
- Que partes del codigo web actual se pueden reutilizar y que se tendria que duplicar?
- Quien asume licencias Apple Developer y Google Play y en que fase?
- La app se publicara con marca BoxOps o con marca de cada tenant?
- Que permisos de ubicacion en iOS/Android se pedirian y como afectarian privacidad/store review?
- Hace falta modo offline para fichaje o basta online en primeras fases?

## Producto

- El primer caso vendible despues de MVP 1 sera "horarios y cobertura" o "fichaje para boxes"?
- Que visibilidad futura debe tener un coach sobre companeros fuera del horario operativo: todos, solo su centro, solo clases afectadas o configuracion por tenant?
- Se necesita calendario mensual en la siguiente fase o basta vista semanal hasta cambios/ausencias?
- Las plantillas mensuales aportan valor real o las semanales con excepciones cubren el primer ano?
- Como se tratan bloques no-clase como recepcion, mantenimiento, reuniones o formacion en validacion real y exportes futuros?

## STL

- La semana de prueba L-V esta recibida y cargada localmente como fixture; falta confirmar centro por bloque.
- Falta confirmar coach asignado por bloque real, o hueco vacante real, antes de convertir el fixture en semilla privada/anonimizada.
- Â¿Cuantos coaches activos hay y cuantos trabajan en ambos centros?
- Â¿Hay responsables distintos por centro?
- Â¿Que tipos de clase usa STL hoy y cuales son imprescindibles para MVP 1?
- Â¿Existen certificaciones necesarias por tipo de clase o es una validacion futura?
- Â¿Que eventos/competiciones recurrentes afectan mas a la cobertura?

## Cambios Y Ausencias

- Â¿Todos los cambios necesitan aprobacion admin o algunos pueden aplicarse con aceptacion entre coaches?
- Â¿Hay diferencia entre cambio de turno, cambio de clase y cobertura puntual?
- Â¿Se permite ofrecer una clase a cualquier coach o solo a coaches habilitados/disponibles?
- Â¿Como se gestionan bajas o permisos largos?
- Â¿Hay reglas de minimo de coaches disponibles por centro?

## Horas Extra

- Â¿Las horas extra se compensan, se pagan o ambas segun caso?
- Â¿Quien valida horas extra: admin, manager, owner o responsable de centro?
- Â¿Hay cierre mensual formal?
- Â¿Se necesita export CSV/PDF en primeras fases?
- Â¿Como se diferencian horas extra planificadas de horas extra detectadas por fichaje?

## Fichaje

- Â¿El fichaje tiene obligacion legal desde el piloto o es control interno?
- Â¿Debe existir tolerancia de minutos antes/despues del turno?
- Â¿Que pasa si un coach trabaja en dos centros el mismo dia?
- Â¿El fichaje asistido debe ser sugerencia o puede llegar a ser automatico?
- Â¿Que evidencia se guarda en un fichaje corregido?
- Â¿Que politica de retencion de fichajes aplica?

## Documentos

- Que documentos pueden requerir firma y quien decide los firmantes?
- Los firmantes se eligen por persona concreta, por rol, por centro o por todo el equipo?
- La firma dibujada sera solo confirmacion interna o debe tener validez legal especifica?
- La firma debe ser tenant-scoped o global por usuario?
- Quien puede ver evidencias de firma y snapshots?
- Debe generarse una copia firmada inmutable del documento o basta una evidencia/auditoria separada?
- Que ocurre si un documento firmado se reemplaza por una version nueva?
- Los documentos de gestion/admin los ve solo `admin` o tambien `manager`/`document_admin` en una fase posterior?
- Puede una persona pendiente de Auth tener documentos asignados antes de poder firmarlos?

- Â¿Que documentos laborales se subiran al inicio?
- Â¿Quien puede subir/ver nominas, contratos y anexos?
- Â¿Los documentos deben requerir confirmacion de lectura?
- Â¿Drive se integra como enlace simple o hace falta API?
- Â¿La programacion por clase viene de PDFs, Drive, ambos u otro sistema?

## Comercial

- Â¿Pricing por organizacion, centro, coach activo o combinacion?
- Â¿Setup fee para carga inicial de horarios/documentos?
- Â¿El primer caso vendible sera "horarios y cobertura" o "fichaje para boxes"?
- Â¿Que minimo necesita un segundo box para comprar sin personalizacion?
