# PRD - BoxOps

## Resumen

BoxOps es un SaaS operativo para boxes de CrossFit. Su foco no es RRHH generico, sino la realidad diaria de un box: centros, coaches, horarios semanales, clases, cobertura, plantillas, cambios, vacaciones, festivos, eventos, horas extra, fichaje, documentos, firmas y certificaciones.

La primera implementacion sera para STL, pero el producto debe nacer vendible a otros boxes. STL es el primer tenant/piloto, no la arquitectura base.

## Problema

Herramientas tipo Factorial resuelven necesidades de RRHH generalistas, pero no modelan bien la operativa de un box:

- Un coach puede trabajar en varios centros el mismo dia.
- No basta con saber que alguien trabaja de 16:00 a 20:00; hay que saber que clases cubre.
- Hay clases sin cubrir, solapamientos y sustituciones de ultima hora.
- Festivos, eventos y competiciones afectan a cobertura y horas.
- El fichaje necesita contexto de turno y centro; no basta con detectar presencia fisica.
- Los documentos laborales, certificaciones y programacion de clases estan dispersos.

BoxOps debe convertir esa operativa en una fuente de verdad clara, filtrable y auditable.

## Principios De Producto

- BoxOps no es "STL SaaS": todo lo generico debe valer para cualquier box.
- Multi-tenant ligero desde el inicio.
- Horarios y cobertura antes que IA, nominas o geolocalizacion avanzada.
- Contexto amplio, tareas pequeñas.
- No implementar features sin task concreta.
- Evitar sobredimensionar, pero no cerrar puertas a vender a otros boxes.
- Documentar decisiones de dominio antes de convertirlas en schema.

## Arquitectura Multi-Tenant

Requisito no negociable:

```text
Organization/Tenant -> Centers -> Users/Coaches -> Schedules -> Classes/Blocks -> Events
```

Reglas:

- Toda tabla operativa debe tener frontera clara de `organization_id`.
- Los usuarios acceden mediante memberships, no por pertenencia implicita.
- Un usuario puede pertenecer a mas de una organizacion en el futuro.
- Los centros pertenecen siempre a una organizacion.
- Los coaches pueden trabajar en uno o varios centros.
- STL se representa como datos/configuracion de tenant, no como condicion en codigo.
- RLS debe aislar datos entre organizaciones desde la primera migracion real.

## Usuarios Y Roles

### Roles MVP

- `admin`: gestiona usuarios, centros, horarios, plantillas, clases, cobertura y aprobaciones.
- `coach`: ve horarios, solicita cambios, consulta documentos, registra fichaje/horas cuando la fase lo incluya.

### Roles futuros

- `owner`: configuracion global, billing y permisos maximos.
- `manager`: responsable operativo de uno o varios centros.
- `center_manager`: responsable de centro.
- `document_admin`: gestiona documentos laborales y de empresa.
- `payroll_manager`: revisa horas extra, cierres mensuales y exportes.

## Modulos Funcionales

### 1. Horarios Semanales

Vista semanal completa y clara, mejor que una vista movil de un solo dia. Debe permitir ver:

- Mi horario.
- Horario de todos los compañeros segun permisos.
- Quien trabaja cada dia.
- Centro asignado por persona y bloque.
- Clases o funciones asignadas.
- Clases cubiertas y sin cubrir.

Filtros genericos:

- Mi horario.
- Todos los centros.
- Centro especifico.
- Solo clases/bloques sin cubrir.
- Coach.
- Tipo de clase o actividad.

### 2. Multi-Centro

Un tenant puede tener uno o varios centros. Un coach puede trabajar por la mañana en un centro y por la tarde en otro.

Debe permitir:

- Asignar centros a horarios y bloques.
- Filtrar por centro.
- Definir centro principal del coach.
- Permitir coaches multi-centro.
- Ocultar centros irrelevantes segun permisos o preferencia.
- Preparar geofence por centro para fichaje futuro.

### 3. Clases Y Cobertura

La unidad minima del horario sera un bloque operativo. Puede representar una clase, recepcion, evento, competicion u otra actividad.

Cada bloque debe tener:

- Centro.
- Hora inicio y fin.
- Coach asignado o vacante.
- Tipo de clase/actividad.
- Estado.
- Notas.
- Documentacion/programacion asociada si aplica.

Tipos iniciales:

- WOD.
- CrossFit For Fun.
- Wellness.
- Open Box.
- Fundamentals.
- Recepcion.
- Evento.
- Competicion.
- Otra actividad.

Cobertura esperada:

- Detectar bloques sin coach.
- Detectar menos coaches de los necesarios.
- Detectar solapamientos.
- Detectar coaches asignados en dos sitios a la vez.
- Preparar validacion futura por certificaciones.
- Mostrar dias con cobertura insuficiente.

El admin debe tener un dashboard de cobertura.

### 4. Plantillas

Debe ser posible crear plantillas semanales o mensuales para no asignar cada dia a mano.

Debe permitir:

- Crear plantilla semanal estandar.
- Aplicarla a una semana, varias semanas o un mes.
- Modificar dias concretos sin romper la plantilla original.
- Ver excepciones respecto a la plantilla.

### 5. Cambios De Turno O Clase

Los coaches deben poder:

- Solicitar cambios de horario.
- Solicitar cambios de clase.
- Pedir cobertura a compañeros.
- Intercambiar turnos.
- Ofrecer una clase/bloque a otros coaches.
- Aceptar o rechazar solicitudes recibidas.

Flujo deseado:

1. Coach selecciona una clase o bloque.
2. Solicita cambio, cobertura o intercambio.
3. Puede enviarlo a un compañero concreto o a varios disponibles.
4. El compañero acepta o rechaza.
5. Admin aprueba si hace falta.
6. El horario se actualiza.
7. Queda historial.

Estados:

- `pending`.
- `accepted_by_peer`.
- `rejected_by_peer`.
- `pending_admin_approval`.
- `approved`.
- `rejected`.
- `applied`.
- `cancelled`.

### 6. Vacaciones Y Ausencias

Debe existir un flujo para solicitar:

- Vacaciones.
- Cambio de vacaciones.
- Dia libre.
- Medio dia.
- Ausencia puntual.
- Permiso.
- Baja.
- Cambio de disponibilidad.

La app debe mostrar impacto operativo:

- Clases afectadas por esa ausencia.
- Compañeros ya de vacaciones.
- Riesgo de dejar clases sin cubrir.
- Coincidencias con eventos o competiciones.

Debe existir un calendario mensual/anual para vacaciones, dias libres, eventos, competiciones, festivos, ausencias y conflictos de cobertura.

### 7. Festivos

Los festivos no siempre se asignan directamente a alguien. La app debe permitir crear turnos o bloques especiales de festivo para que coaches puedan ofrecerse voluntariamente.

Flujo:

1. Admin crea festivo o turno especial.
2. Coaches indican "quiero trabajarlo".
3. Admin elige quien lo cubre.
4. Se añade al horario.
5. Se registra como hora extra/festivo si aplica.

### 8. Eventos Y Competiciones

El calendario debe soportar:

- Eventos internos del box.
- Competiciones.
- Seminarios.
- Open days.
- Eventos externos.
- Eventos trabajados.
- Eventos meramente informativos.

Los coaches deben poder marcar:

- Me interesa.
- Asistire.
- Quiza.
- No puedo.
- Quiero trabajarlo.

La app debe ayudar a detectar impacto de cobertura si varios coaches quieren asistir a un evento o competicion.

### 9. Horas Extra

La app debe hacer tracking interno, no generar nominas ni resolver fiscalidad/laboral compleja.

Debe calcular o preparar:

- Horas contratadas semanales.
- Horas planificadas.
- Horas fichadas.
- Horas extra detectadas.
- Horas extra por cobertura.
- Horas extra por eventos.
- Horas extra por festivos.
- Horas pendientes de validar.
- Horas validadas.
- Horas cerradas del mes.

Estados:

- `detected`.
- `pending_validation`.
- `validated`.
- `compensated`.
- `paid`.
- `rejected`.
- `closed`.

### 10. Fichaje

El fichaje es un dolor principal, pero debe entrar por fases.

Deseado:

- Fichaje manual.
- Correcciones de fichaje.
- Fichaje asistido por geolocalizacion.
- Automatizacion futura si legal y operativamente tiene sentido.

Regla clave:

La geolocalizacion no debe fichar simplemente porque alguien entra al box. Los coaches tambien entrenan fuera de su horario laboral.

Solo deberia sugerir o iniciar fichaje si:

- El usuario tiene un turno asignado.
- Esta cerca del centro correcto.
- Esta dentro de una ventana proxima al inicio o fin del turno.
- No hay ya un fichaje activo.

Debe permitir correcciones por olvido, fallo de geolocalizacion, entrada/salida incorrecta y aprobacion/rechazo admin.

Privacidad: no seguimiento continuo ni historial de movimientos. Solo comprobaciones puntuales vinculadas a turnos.

### 11. Documentos Laborales Y Firmas

Zona de documentos por empleado:

- Nominas.
- Contrato.
- Anexos.
- Justificantes.
- Documentos laborales.
- Resumenes de horas.
- Documentos de empresa.

Debe separar al menos tres areas de visibilidad:

- Documentos publicos de equipo: informacion compartida con miembros activos segun permisos del tenant.
- Documentos de gestion/admin: documentos internos o sensibles visibles solo para `admin` en el primer corte.
- Documentos particulares de miembro: documentos asociados a una persona concreta, visibles para esa persona y roles autorizados.

Al subir un documento, el rol autorizado debe poder marcarlo como documento que requiere firma y seleccionar que miembros/personas deben firmarlo. La firma debe apoyarse en "Mi firma": una firma dibujada reutilizable creada por el usuario desde "Mi perfil" o "Mi cuenta", similar al flujo de ShiftSwap.

Crear o actualizar "Mi firma" es una accion personal separada de firmar un documento. Una vez creada, el usuario puede pulsar "Firmar" en documentos, nominas, politicas internas, confirmaciones u otras secciones futuras, y la app reutiliza la firma guardada del usuario autenticado. Si no existe firma guardada, el flujo debe pedir crearla antes de continuar o permitir crearla inline segun decision de UX.

Cada firma aplicada debe guardar estado por firmante y auditoria minima: organizacion, documento/version o entidad firmada, usuario autenticado, persona firmante, fecha/hora, snapshot de firma usado, IP/user agent si se decide y resultado. No basta con apuntar a la firma actual del perfil, porque el usuario puede actualizarla despues. La firma se modela como confirmacion trazable de producto; cualquier uso con validez laboral/legal fuerte requiere revision legal previa.

MVP futuro: repositorio, subida, consulta, solicitud de firma y firma basica. No generacion automatica de nominas.

### 12. Cursos Y Certificaciones

Cada coach debe poder guardar certificaciones:

- CrossFit Level 1.
- CrossFit Kids.
- Primeros auxilios.
- Movilidad.
- Wellness.
- Nutricion.

Cada certificado puede tener nombre, entidad, fecha de obtencion, fecha de caducidad, archivo adjunto, estado y relacion futura con clases que puede impartir.

### 13. Programacion De Clases, Documentos E IA

Fase sencilla:

- Subir PDFs/documentos.
- Guardar enlaces de Drive.
- Asociar documentos a clase, tipo de clase o fecha.
- Mostrar boton "ver programacion" desde el horario.

Fase futura con IA:

- Subir PDF de programacion.
- Extraer contenido por dia/clase.
- Preguntar "que tengo hoy en CrossFit For Fun?".
- Resumir material, escalados y notas para el coach.

### 14. Dashboard Admin

El panel admin debe priorizar alertas operativas:

- Clases sin cubrir hoy.
- Clases sin cubrir esta semana.
- Solicitudes pendientes.
- Correcciones de fichaje pendientes.
- Horas extra pendientes de validar.
- Eventos sin asignar.
- Vacaciones que generan conflicto.
- Coaches por encima de horas contratadas.

## Roadmap MVP

La definicion operativa vive en `docs/product/mvp.md`.

Nota 2026-05-06: tras Task 017, MVP 1 visual/operativo esta avanzado. El orden ejecutable actualizado vive en `docs/product/roadmap.md` y `TASKS.md`: Fase A cierre MVP 1 real, Fase B configuracion/branding/roles, Fase C auth/security, Fase D area personal/RRHH, Fase E documentos, Fase F fichaje manual, Fase G geolocalizacion asistida, Fase H PWA/app movil y Fase I cambios/ausencias/eventos/horas/IA.

Resumen:

- MVP 1: multi-tenant, centros, usuarios/coaches, roles, tipos de clase, horario semanal, bloques, filtros, clases sin cubrir, dashboard basico de cobertura y plantillas basicas.
- MVP 2: solicitudes de cambio/cobertura, vacaciones/dias libres, calendario mensual e impacto de ausencias.
- MVP 3: eventos, competiciones, festivos voluntarios y horas extra.
- MVP 4: fichaje manual, correcciones y fichaje asistido por geolocalizacion.
- MVP 5: documentos laborales, documentos de equipo/gestion/miembro, firma basica dibujada, cursos/certificaciones y documentos de programacion.
- MVP 6: IA sobre documentos de programacion.

## Primer Tenant: STL

STL se documenta en `docs/tenants/stl/README.md`.

Datos conocidos:

- Organizacion: STL.
- Centros iniciales: STL Tremañes y STL City.
- Necesidad clara de multi-centro.
- Necesidad de ver semana completa, no solo dia aislado.
- Dolor fuerte en fichaje, pero no debe desplazar MVP 1.

## Requisitos No Funcionales

- Mobile-first para coaches.
- Desktop/tablet eficiente para admin.
- UI operativa, moderna, minimalista y premium segun `docs/product/design-direction.md`, sin copiar referencias.
- Estados loading, error y empty desde el primer flujo con datos.
- Auditoria minima en cambios operativos.
- Datos aislados por tenant.
- Sin hardcodear nombres de cliente.
- UI clara y operativa, no estetica de landing en dashboard.
- Modelo preparado para exportar/revisar horas sin generar nominas.

## Metricas De Exito Iniciales

- STL puede consultar una semana completa por centro, coach y tipo de clase.
- Admin ve clases/bloques sin cubrir sin revisar manualmente el horario.
- Coaches pueden ver su horario y el contexto de sus clases.
- El modelo permite crear un segundo tenant demo sin tocar codigo.
- Las excepciones a plantillas son visibles y auditables.

## Riesgos

- Construir demasiado antes de validar horarios/cobertura.
- Confundir BoxOps con CRM de alumnos, payroll o reservas.
- Modelar STL demasiado profundo y perder reutilizacion.
- Dejar RLS para despues.
- Implementar fichaje geolocalizado sin revisar privacidad y obligaciones legales.
- Mezclar documentos, fichajes y horas extra sin una frontera clara de responsabilidad.

## Documentos Relacionados

- `docs/product/mvp.md`
- `docs/product/roadmap.md`
- `docs/product/design-direction.md`
- `docs/product/ux-principles.md`
- `docs/product/screen-map.md`
- `docs/product/ui-references.md`
- `docs/product/open-questions.md`
- `docs/architecture/domain-model.md`
- `docs/operations/legal-and-privacy-notes.md`
- `docs/tenants/stl/README.md`
