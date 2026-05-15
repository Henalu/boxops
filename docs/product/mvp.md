# MVP - BoxOps

## Enfoque

El MVP no intenta cubrir toda la operativa de un box. El primer corte debe validar que BoxOps resuelve mejor que hojas de calculo, WhatsApp y Factorial la parte mas especifica del negocio: horario semanal, clases y cobertura multi-centro.

Estado actualizado 2026-05-10: MVP 1 visual/operativo ya esta avanzado y Fase A queda cerrada para QA interno, sin considerarse validacion oficial ni produccion. B.1/B.2, C y D.1-D.5 ya tienen primeros cortes implementados; E.1 queda documentada/modelada, E.2 abre metadata documental, E.3 crea Storage privado minimo, E.4 crea auditoria documental minima y E.5 abre preview/descarga backend controlada. La prioridad sigue siendo no abrir UI documental, documentos firmables, fichaje, RRHH sensible o app movil sin permisos, privacidad y criterio de salida.

Nota Fase A 2026-05-08: STL tiene una semana de prueba L-V cargable en local mediante `supabase/snippets/stl-test-week-2026-05-04.sql`: 165 bloques, una plantilla activa y bloques vacantes sin coaches inventados. Tambien existe una muestra interna opcional en `supabase/snippets/stl-internal-assignment-sample-2026-05-04.sql` para QA interno y smoke tests, con coaches por defecto/asignaciones representativas, vacantes y una insuficiencia. Ya no siembra un conflicto deliberado porque los solapes imposibles de coach se bloquean en Postgres. La validacion oficial STL sigue pendiente antes de mover datos a seed/produccion.

Regla de prioridad actual:

1. Cierre MVP 1 real con datos validados.
2. Configuracion de tenant, branding controlado y roles avanzados.
3. Auth/security polish.
4. Area personal y modelo RRHH.
5. Documentos, permisos, nominas y certificaciones.
6. Fichaje manual legal/auditable.
7. Fichaje geolocalizado asistido.
8. PWA/app movil y geofencing nativo si negocio lo exige.
9. Cambios, ausencias, eventos, horas extra e IA.

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
- `/app/templates` permite crear plantillas semanales, alternar vista Semana/Agenda, crear bloques de plantilla, guardar coaches por defecto o huecos vacantes, aplicar una plantilla activa a una semana y marcar excepciones cuando se edita un bloque aplicado.
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
- Documentos laborales o firmables.
- Branding avanzado por tenant o logo real.
- RRHH sensible.
- Firma documental.
- IA.

### Criterio De Exito

- STL puede cargar una semana real de STL Tremañes y STL City.
- Admin puede detectar clases sin cubrir sin revisar manualmente todo.
- Un coach puede ver su horario y sus clases asignadas.
- Se puede crear un segundo tenant demo sin tocar codigo.

## Siguientes Fases Tras MVP 1

La vista resumida por fases vive en `docs/product/roadmap.md`; `TASKS.md` mantiene el backlog ejecutable.

- Fase A: cerrada para QA interno con semana local, muestra interna y validacion oficial STL pendiente.
- Fase B: B.1/B.2 implementan configuracion minima, acento de tenant y roles compatibles; quedan logo real, colores por centro y validacion con mas tenants.
- Fase C: implementa reset de contrasena, politica minima en app y decision de usar rate limits nativos de Supabase por ahora.
- Fase D: D.1-D.5 implementan "Mi cuenta", perfil visible propio, avatar privado propio y "Mi firma" propia privada; RRHH sensible sigue fuera.
- Fase E: E.1 documenta documentos, permisos, certificaciones y firma documental futura; E.2 implementa metadata/grants documentales minimos; E.3 implementa Storage privado minimo; E.4 implementa auditoria documental minima; E.5 implementa rutas backend de preview/descarga con signed URL corta, sin UI, boton "Firmar", documentos firmables ni snapshots reales.
- Fase F: fichaje manual, correcciones con motivo, aprobacion semanal, exporte y revision legal.
- Fase G: fichaje geolocalizado asistido, opcional, con consentimiento, radio por centro y sin tracking continuo.
- Fase H: PWA primero, app movil/wrapper/nativo despues si geofencing con app cerrada es requisito comercial.
- Fase I: cambios, ausencias, eventos, horas extra e IA reordenados despues de la base operativa y legal.

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
- Aprobacion semanal por gestor/admin de personal.
- Exportable y auditable.
- Acceso del trabajador a sus registros.
- Fichaje asistido por geolocalizacion solo como sugerencia o automatismo controlado.

Condiciones para geolocalizacion:

- Turno asignado.
- Centro correcto.
- Ventana cercana a inicio/fin.
- Sin fichaje activo duplicado.
- Consentimiento y permiso claro de ubicacion.
- Radio por centro configurable, con 100m como punto inicial sugerido.
- No fichar si el usuario esta en el box fuera de horario.
- No tracking continuo ni historial de movimientos.

No incluye:

- Seguimiento continuo.
- Historial de movimientos.
- Geofencing permanente.
- Garantia de fichaje automatico con app cerrada en navegador/PWA.
- Promesa de cumplimiento legal definitivo sin revision.

Nota legal/tecnica:

- En Espana debe contemplarse registrar inicio/fin de jornada, conservar registros 4 anos y permitir acceso a trabajador, representantes e Inspeccion. Revisar legal y privacidad antes de prometer cumplimiento.
- En navegador/PWA no se debe asumir geolocalizacion fiable con app cerrada; para fichaje automatico en segundo plano hara falta fase nativa o wrapper movil.

## MVP 5 - Documentos, Firmas Y Certificaciones

Objetivo: centralizar documentos utiles, firmas basicas y certificaciones sin construir un gestor documental pesado.

Estado E.5 2026-05-10: este MVP tiene schema minimo de metadata documental, grants, Storage privado tecnico, auditoria documental minima y rutas backend controladas de preview/descarga, no modulo de producto. E.1 define entidades candidatas, permisos y evidencia/snapshot de firma futura; E.2 crea `documents`, `document_versions`, `document_subjects` y `document_access_grants`; E.3 crea `document-files` privado y policies/RPCs de archivo; E.4 crea `document_access_events` y RPCs de auditoria; E.5 crea rutas que emiten signed URLs cortas tras validar acceso y registrar auditoria. No hay UI, boton "Firmar", documentos firmables, snapshots reales, pagina documental ni subida desde app.

Incluye:

- Documentos laborales por empleado.
- Documentos de empresa.
- Seccion "Mis documentos".
- Documentos publicos de equipo, visibles para miembros activos segun permisos.
- Documentos de gestion/admin, visibles solo para `admin` en el primer corte.
- Documentos particulares de cada miembro, visibles para la persona afectada y roles autorizados.
- Subida de documentos con opcion de marcar que requieren firma.
- Seleccion de los miembros/personas que deben firmar cada documento.
- Permisos por rol y por persona concreta, estilo compartir en Drive.
- Empleados pueden subir titulaciones/certificaciones.
- Roles autorizados pueden subir nominas u otros documentos privados al espacio de cada empleado.
- Buckets privados, RLS, URLs firmadas y auditoria de acceso si procede.
- Firma dibujada guardada desde "Mi perfil"/"Mi cuenta", reutilizable para firmar documentos, nominas, politicas internas, confirmaciones u otras entidades futuras.
- "Mi firma" se crea dibujandola en pantalla, se puede borrar/redibujar antes de guardar y se puede actualizar mas adelante.
- Actualizar "Mi firma" no cambia documentos ya firmados.
- El usuario no debe dibujar la firma cada vez que pulsa "Firmar".
- Si no hay firma guardada, el flujo de firma debe pedir crearla antes de continuar o permitir crearla inline segun decision de UX.
- Accion simple de firmar que inserta una copia/snapshot de la firma en el documento/entidad o genera una version firmada.
- Estado de firma por firmante y auditoria minima de organizacion, documento/version o entidad firmada, usuario autenticado, persona firmante, fecha/hora, snapshot usado y estado.
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
- Firmar en nombre de otra persona usando su firma guardada.
- Usar la firma actual del perfil como unica evidencia de documentos ya firmados.

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
| Fichaje manual va antes que geolocalizacion | Es importante, pero tiene riesgos legales/privacidad y depende del modelo de horarios. |
| Branding de tenant es controlado | BoxOps mantiene identidad propia; el tenant puede aportar logo y colores sin cambiar estados criticos. |
| Roles avanzados separan responsabilidades | Configuracion global, gestion diaria y funciones personales no deben vivir en un unico rol permanente. |
| IA queda para MVP 6 | Sin datos y documentos bien modelados, la IA seria decoracion cara. |
| Documentos laborales no generan nominas | BoxOps trackea y centraliza; no sustituye payroll al inicio. |
| "Mi firma" es prerrequisito de documentos firmables | La firma reusable se gestiona en el perfil; los documentos solo consumen esa firma y guardan snapshot/auditoria al firmar. |
| Plantillas entran pronto | Sin plantillas, cargar horarios semanales reales sera demasiado manual. |

## Estado Tecnico Actual Y Siguiente Corte

La base tecnica ya esta implementada hasta los cortes B.1-E.5:

- schema multi-tenant con RLS;
- seeds demo y STL separados;
- auth Supabase SSR;
- reset de contrasena y politica minima de password en app;
- resolucion de tenant por membership;
- configuracion minima de tenant con `organizations.theme_config.accentColor`;
- roles compatibles `owner`, `admin`, `manager`, `coach` y roles futuros reconocidos sin permisos especializados;
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
- area personal en `/app/account` con perfil visible propio;
- avatar privado propio con `profile_assets` y bucket privado;
- "Mi firma" propia privada con `profile_signatures` y bucket privado, sin documentos firmables;
- schema minimo E.2 para metadata documental privada, versiones, sujetos y grants;
- Storage documental privado E.3 con bucket `document-files`, RPCs y policies por `document_versions`, sin UI documental;
- auditoria documental E.4 con `document_access_events`, RLS estricta y RPCs de registro/consulta;
- rutas documentales E.5 para preview/descarga privada con signed URL corta, control servidor y auditoria, sin UI documental;
- smoke tests basicos de rutas protegidas y flujos MVP 1;
- audit real de accesibilidad, responsive y theming sobre UI implementada con viewports reales.

El siguiente corte debe mantener la frontera marcada en `PROJECT_BRIEF.md`:

1. Mantener Fase A como base de QA interno y validar oficialmente con STL centro por bloque, asignaciones reales o huecos intencionados antes de seed/produccion.
2. Validar D.4/D.5 en Supabase local/QA: buckets privados, metadata tenant-scoped, signed URL corta y fallback visual.
3. Validar E.5 en Supabase local/QA: preview/descarga solo con sujeto/grant/capacidad, signed URLs cortas, auditoria `file_preview`/`file_download`, denegaciones aplicables y auditoria `document_access_events` no legible por roles sin permiso. UI documental, subida desde app y boton "Firmar" siguen despues.
4. Modelar Fase F antes de geolocalizacion: fichaje manual, correcciones, aprobacion semanal, exportes y revision legal.
5. Resolver como tarea dedicada los targets tactiles moviles de controles compactos si se decide endurecer aun mas la UX movil.

Despues de ese cierre, el orden recomendado es el de `docs/product/roadmap.md`: configuracion/branding/roles, auth/security, area personal/RRHH, documentos, fichaje manual, geolocalizacion asistida, PWA/app movil y despues cambios/ausencias/eventos/horas/IA.

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
