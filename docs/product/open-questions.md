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

- Falta definir patron exacto para repartir actividades CrossFit/Wellness en STL City.
- Falta decidir si la asignacion aleatoria inicial cubre todos los bloques o deja huecos intencionados para probar dashboard.
- Falta email de Nuria y confirmar si los emails recibidos se usaran para invitacion Auth o podran cambiarse antes de activar cuenta.
- Los perfiles iniciales reales de STL quedan como seed/configuracion de tenant en el repo privado; sigue pendiente decidir si horarios/asignaciones reales iran como fixture anonimizado, seed local privado o configuracion privada de piloto.
- Falta confirmar politica de vacaciones, ausencias, fichaje, documentos y programacion.

## Producto

- ¿El primer dolor de STL es realmente horario/cobertura o fichaje?
- ¿Los coaches necesitan ver el horario completo del equipo desde el MVP 1 o solo su horario y clases sin cubrir?
- ¿Que visibilidad debe tener un coach sobre compañeros: todos, solo su centro, solo clases afectadas?
- ¿Se necesita calendario mensual en MVP 1 o basta vista semanal hasta MVP 2?
- ¿La plantilla principal debe ser semanal, mensual o ambas desde el inicio?
- ¿Como se tratan bloques no-clase como recepcion, mantenimiento, reuniones o formacion?

## STL

- ¿Cuales son los horarios reales de STL Tremañes y STL City?
- ¿Cuantos coaches activos hay y cuantos trabajan en ambos centros?
- ¿Hay responsables distintos por centro?
- ¿Que tipos de clase usa STL hoy y cuales son imprescindibles para MVP 1?
- ¿Existen certificaciones necesarias por tipo de clase o es una validacion futura?
- ¿Que eventos/competiciones recurrentes afectan mas a la cobertura?

## Cambios Y Ausencias

- ¿Todos los cambios necesitan aprobacion admin o algunos pueden aplicarse con aceptacion entre coaches?
- ¿Hay diferencia entre cambio de turno, cambio de clase y cobertura puntual?
- ¿Se permite ofrecer una clase a cualquier coach o solo a coaches habilitados/disponibles?
- ¿Como se gestionan bajas o permisos largos?
- ¿Hay reglas de minimo de coaches disponibles por centro?

## Horas Extra

- ¿Las horas extra se compensan, se pagan o ambas segun caso?
- ¿Quien valida horas extra: admin, manager, owner o responsable de centro?
- ¿Hay cierre mensual formal?
- ¿Se necesita export CSV/PDF en primeras fases?
- ¿Como se diferencian horas extra planificadas de horas extra detectadas por fichaje?

## Fichaje

- ¿El fichaje tiene obligacion legal desde el piloto o es control interno?
- ¿Debe existir tolerancia de minutos antes/despues del turno?
- ¿Que pasa si un coach trabaja en dos centros el mismo dia?
- ¿El fichaje asistido debe ser sugerencia o puede llegar a ser automatico?
- ¿Que evidencia se guarda en un fichaje corregido?
- ¿Que politica de retencion de fichajes aplica?

## Documentos

- Que documentos pueden requerir firma y quien decide los firmantes?
- Los firmantes se eligen por persona concreta, por rol, por centro o por todo el equipo?
- La firma dibujada sera solo confirmacion interna o debe tener validez legal especifica?
- Debe generarse una copia firmada inmutable del documento o basta una evidencia/auditoria separada?
- Que ocurre si un documento firmado se reemplaza por una version nueva?
- Los documentos de gestion/admin los ve solo `admin` o tambien `manager`/`document_admin` en una fase posterior?
- Puede una persona pendiente de Auth tener documentos asignados antes de poder firmarlos?

- ¿Que documentos laborales se subiran al inicio?
- ¿Quien puede subir/ver nominas, contratos y anexos?
- ¿Los documentos deben requerir confirmacion de lectura?
- ¿Drive se integra como enlace simple o hace falta API?
- ¿La programacion por clase viene de PDFs, Drive, ambos u otro sistema?

## Comercial

- ¿Pricing por organizacion, centro, coach activo o combinacion?
- ¿Setup fee para carga inicial de horarios/documentos?
- ¿El primer caso vendible sera "horarios y cobertura" o "fichaje para boxes"?
- ¿Que minimo necesita un segundo box para comprar sin personalizacion?
