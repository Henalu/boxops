# MVP - BoxOps

## Enfoque

El MVP no intenta cubrir toda la operativa de un box. El primer corte debe validar que BoxOps resuelve mejor que hojas de calculo, WhatsApp y Factorial la parte mas especifica del negocio: horario semanal, clases y cobertura multi-centro.

Regla de prioridad:

1. Horarios y cobertura.
2. Cambios y ausencias.
3. Eventos, festivos y horas extra.
4. Fichaje.
5. Documentos, firmas y certificaciones.
6. IA sobre programacion.

## MVP 1 - Horarios, Centros Y Cobertura

Objetivo: que un admin vea una semana completa y sepa quien trabaja, donde, que clase cubre y que queda sin cubrir.

Incluye:

- Multi-tenant basico.
- Organizaciones/tenants.
- Centros.
- Usuarios/coaches.
- Roles MVP: `admin` y `coach`.
- Tipos de clase/actividad.
- Horario semanal.
- Bloques operativos con centro, hora, coach, tipo, estado y notas.
- Filtros por centro, coach, tipo de clase y bloques sin cubrir.
- Deteccion basica de clases/bloques sin cubrir.
- Dashboard basico de cobertura.
- Plantillas semanales basicas.
- Excepciones manuales sobre una semana aplicada.

Estado implementado tras Task 017:

- Multi-tenant, auth, centros, usuarios/coaches y tipos de actividad ya existen.
- `/app/schedule` permite cargar manualmente bloques operativos de una semana real.
- `/app/schedule` permite asignar coaches, calcular cobertura basica, filtrar por centro/coach/tipo/estado/cobertura/riesgos y usar "Mi horario".
- `/app/templates` permite crear plantillas semanales, crear bloques de plantilla, guardar coaches por defecto o huecos vacantes, aplicar una plantilla activa a una semana y marcar excepciones cuando se edita un bloque aplicado.
- `/app` muestra un dashboard operativo con saludo, cobertura de la semana, resumen de centros/coaches/tipos/bloques, pendientes y acciones rapidas.
- `/app/coverage` muestra una cola accionable de riesgos semanales y una lista compacta de todas las clases.
- `/app/more` agrupa Gestion y Ayuda, incluyendo el reinicio de la guia inicial.
- La navegacion principal queda reorganizada como Inicio, Horario, Cobertura, Equipo y Mas, con bottom navigation en mobile y sidebar en desktop/tablet.
- La guia inicial se guarda en `localStorage` con `boxops_onboarding_seen_v1`.
- `npm run test:smoke` valida login publico, redireccion de rutas protegidas y navegacion MVP 1 autenticada opcional cuando hay variables E2E.
- Task 016 audito la UI implementada en 375px, 390px, 768px y 1280px contra `http://127.0.0.1:3000`, con evidencia local y un fix responsive acotado en la tabla de memberships de `/app/coaches`.
- Task 017 valida el refactor UX/UI operativo contra `http://127.0.0.1:3000` en 390x844 y 1280x800, con evidencia local en `test-results/ux-refactor-2026-05-04/`.
- Todavia no hay cambios de turno ni solicitudes.

No incluye:

- Flujo completo de solicitudes entre coaches.
- Vacaciones formales.
- Fichaje.
- Horas extra.
- Documentos laborales.
- IA.

### Criterio De Exito

- STL puede cargar una semana real de STL Tremañes y STL City.
- Admin puede detectar clases sin cubrir sin revisar manualmente todo.
- Un coach puede ver su horario y sus clases asignadas.
- Se puede crear un segundo tenant demo sin tocar codigo.

## MVP 2 - Cambios, Cobertura Y Ausencias

Objetivo: sustituir conversaciones dispersas por un flujo trazable.

Incluye:

- Solicitudes de cambio de horario.
- Solicitudes de cambio de clase/bloque.
- Pedir cobertura a un compañero concreto o a varios disponibles.
- Aceptar/rechazar por compañero.
- Aprobacion admin cuando aplique.
- Historial de solicitud.
- Vacaciones, dias libres y ausencias.
- Calendario mensual.
- Impacto de ausencias sobre clases afectadas y cobertura.

### Criterio De Exito

- Un cambio real queda solicitado, aceptado/aprobado y aplicado al horario.
- Una ausencia muestra que clases quedan afectadas.

## MVP 3 - Eventos, Festivos Y Horas Extra

Objetivo: gestionar dias especiales sin perder cobertura ni horas.

Incluye:

- Eventos internos/externos.
- Competiciones.
- Seminarios y open days.
- Festivos o turnos especiales voluntarios.
- Estados de interes/asistencia de coaches.
- Registro de horas extra por cobertura, eventos y festivos.
- Validacion admin de horas extra.
- Cierre mensual simple.

No incluye:

- Generacion de nominas.
- Calculo fiscal/laboral complejo.

### Criterio De Exito

- Admin puede ver impacto de un evento sobre cobertura.
- Las horas extra detectadas quedan pendientes de validar y no dependen de memoria manual.

## MVP 4 - Fichaje

Objetivo: registrar entradas/salidas sin confundir ir a entrenar con ir a trabajar.

Incluye:

- Fichaje manual.
- Fichaje vinculado a turno/bloque asignado.
- Correcciones de fichaje.
- Motivo de correccion.
- Aprobacion/rechazo admin.
- Fichaje asistido por geolocalizacion solo como sugerencia o automatismo controlado.

Condiciones para geolocalizacion:

- Turno asignado.
- Centro correcto.
- Ventana cercana a inicio/fin.
- Sin fichaje activo duplicado.

No incluye:

- Seguimiento continuo.
- Historial de movimientos.
- Geofencing permanente.

## MVP 5 - Documentos, Firmas Y Certificaciones

Objetivo: centralizar documentos utiles, firmas basicas y certificaciones sin construir un gestor documental pesado.

Incluye:

- Documentos laborales por empleado.
- Documentos de empresa.
- Documentos publicos de equipo, visibles para miembros activos segun permisos.
- Documentos de gestion/admin, visibles solo para `admin` en el primer corte.
- Documentos particulares de cada miembro, visibles para la persona afectada y roles autorizados.
- Subida de documentos con opcion de marcar que requieren firma.
- Seleccion de los miembros/personas que deben firmar cada documento.
- Firma dibujada guardada desde el perfil del usuario, reutilizable para firmar documentos.
- Accion simple de firmar que inserta una copia/snapshot de la firma en el documento o genera una version firmada.
- Estado de firma por firmante y auditoria minima de documento, version, firmante y fecha.
- Resumenes de horas.
- Cursos/certificaciones de coaches.
- Archivos adjuntos.
- Fecha de obtencion/caducidad.
- Relacion futura con habilitacion para clases.
- Documentos o enlaces de programacion asociados a clase, tipo de clase o fecha.
- Boton "ver programacion" desde el horario.

No incluye:

- Nominas generadas automaticamente.
- Validacion automatica de certificados contra clases.
- Firma electronica avanzada/cualificada sin validacion legal previa.
- Editor documental completo o negociacion contractual avanzada.

## MVP 6 - IA Sobre Programacion

Objetivo: mejorar la consulta de programacion, no sustituir la operativa base.

Incluye:

- Subida de PDF/documentos de programacion.
- Extraccion por dia/clase.
- Consulta tipo "que tengo hoy en CrossFit For Fun?".
- Resumen de material, escalados y notas para coach.

No empezar este MVP hasta que horarios, cobertura, cambios y documentos basicos funcionen.

## Decisiones De Producto

| Decision | Motivo |
|---|---|
| MVP 1 empieza por horarios/cobertura | Es el nucleo diferencial frente a RRHH generico. |
| Fichaje queda para MVP 4 | Es importante, pero tiene riesgos legales/privacidad y depende del modelo de horarios. |
| IA queda para MVP 6 | Sin datos y documentos bien modelados, la IA seria decoracion cara. |
| Documentos laborales no generan nominas | BoxOps trackea y centraliza; no sustituye payroll al inicio. |
| Plantillas entran pronto | Sin plantillas, cargar horarios semanales reales sera demasiado manual. |

## Estado Tecnico Actual Y Siguiente Corte

La base tecnica de MVP 1 ya esta implementada hasta Task 017:

- schema multi-tenant con RLS;
- seeds demo y STL separados;
- auth Supabase SSR;
- resolucion de tenant por membership;
- gestion basica de centros;
- gestion basica de usuarios/coaches;
- catalogo de tipos de clase/actividad;
- gestion semanal manual de bloques operativos;
- asignaciones coach-bloque y cobertura basica calculada;
- filtros operativos y "Mi horario";
- plantillas semanales basicas y aplicacion a semanas reales;
- dashboard operativo en `/app`;
- cola de cobertura en `/app/coverage`;
- navegacion mobile-first y guia inicial;
- smoke tests basicos de rutas protegidas y flujos MVP 1;
- audit real de accesibilidad, responsive y theming sobre UI implementada con viewports reales.

El siguiente corte debe priorizar validacion operativa real antes de abrir modulos nuevos:

1. Validar una semana real del primer tenant antes de cerrar prioridades finales de dashboard y fixtures reales.
2. Validar plantillas aplicadas contra datos reales: vacantes, coaches por defecto, excepciones y duplicados.
3. Validar Inicio y Cobertura contra una semana real y ajustar la cola accionable sin convertir datos STL en reglas de producto.
4. Decidir permisos operativos de `manager` antes de darle mutaciones de horario, plantillas o aprobaciones.
5. Resolver como tarea dedicada los targets tactiles moviles de controles compactos si se decide endurecer aun mas la UX movil.

La Task 008 queda cerrada con escenarios demo genericos en `docs/product/coverage-demo-scenarios.md`. La Task 013 cierra el primer corte de plantillas semanales basicas. La Task 014 cierra el primer dashboard admin basico de cobertura. La Task 015 cierra la primera base automatizada de smoke tests. La Task 016 cierra el audit real de UI implementada con viewports reales y documenta deuda responsive restante. La Task 017 cierra el refactor UX/UI operativo de MVP 1 con navegacion nueva, Cobertura separada, Mas/Gestion y onboarding local.

Validacion STL recibida el 2026-04-30:

- El dashboard admin debe priorizar una cola accionable: bloques sin cubrir, conflictos graves, cobertura insuficiente, riesgos de la semana y despues vistas de apoyo por centro, coach o semana.
- Los horarios reales deben ser editables por `admin` y por un rol operativo recomendado como `manager`.
- Los coaches deben poder ver el horario completo del equipo y datos basicos de otros coaches, como nombre y foto.
- Cada clase requiere 1 coach por defecto en el primer corte.
- Varias clases en la misma hora son normales; solo hay conflicto si el mismo coach queda asignado a bloques solapados.
- Las certificaciones no influyen de momento en asignaciones.
- Las plantillas deben permitir coaches por defecto y huecos vacantes.
- No hay reglas de traslado entre centros para el primer corte; los cambios de turno/centro requieren aprobacion de `admin` o `manager`.
