# Principios UX - BoxOps

Este documento define como debe comportarse BoxOps cuando se diseñen las futuras pantallas. Complementa `design-direction.md` con decisiones de experiencia, navegacion, estados y flujos diarios.

## Principio Central

BoxOps debe reducir incertidumbre operativa. Cada pantalla debe ayudar a responder una pregunta real del box con el menor numero de pasos posible.

Si una pantalla no ayuda a decidir, cubrir, revisar, aprobar, fichar o encontrar informacion operativa, probablemente esta adelantando complejidad.

## Para Coaches

La app debe responder rapido:

- ¿Que tengo hoy?
- ¿Donde trabajo?
- ¿Que clase o bloque doy?
- ¿Tengo que fichar?
- ¿Que programacion toca?
- ¿Tengo alguna solicitud pendiente?
- ¿Cuantas horas llevo?

### Reglas UX Para Coaches

- La pantalla inicial debe priorizar "siguiente accion", no resumenes generales.
- El contexto de centro, hora y tipo de actividad debe aparecer junto.
- El fichaje debe estar vinculado a turno/bloque cuando exista.
- La programacion debe estar a un toque desde una clase o bloque.
- Las solicitudes deben mostrar estado y accion esperada sin obligar a abrir detalles.
- El lenguaje debe ser operativo y corto.

## Para Admins

La app debe responder rapido:

- ¿Esta todo cubierto hoy?
- ¿Que clases o bloques estan sin coach?
- ¿Quien ha pedido cambios?
- ¿Que vacaciones generan conflicto?
- ¿Quien supera sus horas?
- ¿Que eventos o festivos quedan por asignar?

### Reglas UX Para Admins

- Priorizar riesgo operativo sobre metricas decorativas.
- Mostrar cobertura diaria y semanal de forma escaneable.
- Permitir filtros rapidos por centro, coach, estado y semana.
- Hacer visibles conflictos antes de que el admin tenga que buscarlos.
- Agrupar solicitudes por urgencia, fecha afectada y estado.
- Mantener acciones masivas o avanzadas fuera del primer nivel hasta que hagan falta.

## Mobile-First Real

Mobile-first no significa esconder funciones importantes. Significa adaptar la tarea al contexto.

En movil:

- usar bottom navigation con maximo 5 secciones;
- evitar menus profundos;
- usar filtros como chips, segmented controls o sheets cortas;
- mostrar acciones primarias en el contexto del bloque o solicitud;
- evitar tablas anchas;
- preferir lista por dia, agenda o timeline compacta.

En desktop/tablet:

- usar vistas de semana, centro y equipo con mas columnas;
- permitir filtros persistentes;
- mostrar paneles laterales para detalle cuando aporten velocidad;
- no convertir la vista admin en un muro de cards.

## Navegacion Recomendada

Navegacion movil:

1. Hoy
2. Semana
3. Solicitudes
4. Calendario
5. Más

La navegacion debe adaptarse por rol sin romper el mapa mental:

- Coach: "Hoy" y "Semana" son personales por defecto.
- Admin: "Hoy" y "Semana" pueden abrir contexto de cobertura y equipo.
- "Solicitudes" agrupa cambios, cobertura, ausencias y correcciones cuando existan.
- "Calendario" agrupa vista mensual, eventos, festivos y ausencias.
- "Más" agrupa documentos, certificaciones, equipo, centros y ajustes segun permisos.

## Jerarquia De Informacion

Orden recomendado en bloques, listas y dashboards:

1. Estado operativo.
2. Fecha/hora.
3. Centro.
4. Tipo de actividad o clase.
5. Coach o vacante.
6. Accion posible.
7. Metadata secundaria.

Ejemplo: en una clase sin cubrir, el usuario debe ver primero que esta sin cubrir, despues cuando/donde ocurre y finalmente que puede hacer.

## Filtros

Filtros prioritarios:

- centro;
- coach;
- estado;
- semana;
- tipo de actividad;
- "solo sin cubrir";
- "mi horario".

Reglas:

- Los filtros frecuentes deben estar visibles o a un toque.
- El filtro activo debe ser obvio.
- Al cambiar semana, no perder centro/estado si siguen siendo validos.
- En multi-tenant, conservar `organizationId` o el futuro tenant activo al navegar.

## Estados Y Feedback

Cada accion debe dejar claro que paso:

- loading local, no pantallas bloqueadas si solo cambia una card;
- errores inline cuando el error pertenece a un campo;
- empty states que expliquen el siguiente paso;
- confirmaciones breves y temporales para acciones correctas;
- los avisos de crear, guardar, aplicar o fallar una accion deben comportarse como banners/toasts suaves que desaparecen solos en pocos segundos y no como contenido permanente de la pagina;
- estados visibles en solicitudes y bloques.

No usar estados solo por color. Siempre combinar color con texto, icono o posicion.

## Acciones Frecuentes

Las acciones frecuentes deben necesitar pocos pasos:

- fichar entrada/salida;
- ver programacion;
- pedir cobertura;
- aceptar/rechazar solicitud;
- filtrar por centro;
- ir a semana actual;
- ver solo sin cubrir;
- asignar o sustituir coach en admin;
- aprobar/rechazar ausencias o correcciones.

Si una accion frecuente exige buscar en "Más", abrir tres pantallas o leer instrucciones, el flujo esta mal priorizado.

## Operativa Diaria Para Beta

OD.1/I.32 convierte estos principios en checklist de beta interna. La UX diaria debe poder validarse por rol sin abrir producto nuevo:

- `owner` y `admin` deben poder revisar cobertura, equipo, centros, tipos, horario, plantillas, solicitudes, ausencias, eventos, jornada prevista y fichaje administrativo sin mezclar payroll ni documentos sensibles;
- `manager` debe poder resolver operativa diaria sin tocar configuracion global, roles, billing ni permisos por centro;
- `coach` debe poder entender que tiene hoy, responder solicitudes, pedir cobertura cuando aplique, pedir ausencia propia, ver eventos visibles, ver jornada prevista como contexto y fichar si entra en la beta;
- Inicio debe orientar la siguiente accion y los riesgos reales, no duplicar todos los modulos;
- cobertura, ausencias, eventos y jornada prevista deben explicar contexto, pero no prometer resolucion automatica;
- la deuda UX menor puede quedar para v1 si no impide completar el smoke por rol ni genera confusion legal/operativa.

## Fichaje Web Para Beta

F.15 convierte el fichaje web en checklist de beta interna sin abrir producto nuevo. La UX debe permitir que cada rol complete su smoke sin confundir operativa con promesas legales.

Reglas UX:

- `coach` debe poder fichar entrada/salida propia, ver su semana, corregir con motivo y entender avisos sin leer explicaciones largas.
- `owner`, `admin` y `manager` deben distinguir revision operativa de payroll: aprobar semana, rechazar con nota, revisar correcciones y descargar CSV interno no debe sonar a nomina ni cumplimiento legal definitivo.
- El automatico por planificacion debe nombrarse como ayuda basada en horario/asignaciones, no como presencia verificada.
- Jornada prevista debe mostrarse como contexto de planificacion, no como fichaje, contrato, saldo legal ni prueba definitiva.
- Candidatos de posible exceso deben vivir cerca de Fichaje como alertas revisables, con lenguaje de "posible exceso" y nunca "hora extra aprobada".
- La aprobacion firmada semanal debe decir confirmacion interna cuando haga falta; no usar copy de firma electronica avanzada/cualificada.
- El CSV debe presentarse como exporte interno revisable; no usar "exporte legal definitivo" ni "payroll".
- La webapp no debe pedir ubicacion ni mostrar copy que anticipe geofencing web.
- La deuda UX menor no bloquea beta si las acciones principales se completan y los limites legales quedan claros en el punto de friccion.

## Calendarios Y Tiempo

La navegacion temporal debe inspirarse en Google Calendar y Notion Calendar:

- hoy siempre accesible;
- semana actual clara;
- cambios de semana/mes rapidos;
- vista mensual para ausencias, eventos, festivos y conflictos;
- vista semanal para operativa de cobertura;
- agenda diaria para movil.

La vista mensual no debe intentar resolver todo. Su trabajo principal es orientar, detectar patrones y abrir detalles.

### Trazabilidad De Cobertura

I.25 anade una explicacion operativa reciente en los detalles de bloque de `/app/schedule` y `/app/coverage`. Debe ayudar a responder "por que cambio o por que esta en riesgo" sin convertir el panel en auditoria legal.

Reglas UX:

- Mantener la trazabilidad dentro del detalle de bloque, no como banner global ni seccion permanente en Inicio.
- Mostrar solo a `owner`, `admin` y `manager`; `coach` y `payroll_manager` no necesitan una cola tenant-wide de trazas.
- Explicar con etiquetas cortas: ausencia aprobada/en revision, solicitud de cobertura/cambio o campo operativo minimizado.
- No mostrar motivos sensibles, `reason_summary`, payroll, importes, saldos ni lenguaje de aprobacion legal.
- No prometer resolucion automatica: la accion sigue siendo editar horario/asignacion o usar solicitudes existentes.
- Inicio y `/app/stats` siguen siendo agregados para escanear riesgos; la causa detallada vive en Horario/Cobertura.

### Eventos, Festivos Y Competiciones

I.17 mantiene estos elementos como contexto operativo, no como calendario avanzado ni motor automatico de cambios. I.18 abre base tecnica interna e I.19 muestra una superficie compacta en `/app/schedule`; cualquier evolucion debe seguir siendo discreta, accionable y secundaria.

Reglas UX candidatas:

- En Horario o Cobertura, mostrar eventos/festivos solo si ayudan a decidir o revisar algo.
- El contexto debe ser compacto: fecha, centro si aplica, tipo y accion esperada.
- La gestion queda colapsada y solo aparece para `owner`, `admin` y `manager`; `coach` lee sin controles de gestion.
- No duplicar cobertura ni explicar limitaciones internas con copy defensivo.
- No convertir un festivo en cancelacion visible salvo que exista una accion explicita sobre el bloque.
- La vista mensual futura debe orientar y abrir detalle; la resolucion de cobertura sigue viviendo en horario, cobertura o solicitudes.

### Horas Extra

I.20 mantiene horas extra como candidatos operativos, I.21 abre foundation interna, I.22 endurece QA/RLS, I.23 crea la primera revision operativa visible minima en `/app/time` para `owner`, `admin` y `manager`, e I.24 anade deteccion operativa prudente y manual. La UI debe tratar el exceso como alerta revisable y evitar lenguaje definitivo.

Reglas UX candidatas:

- Hablar de "posible exceso", "candidato operativo" o "pendiente de revision", no de "hora extra aprobada".
- Mostrar juntas la referencia planificada, el fichaje trabajado y la diferencia, con estado operativo claro.
- Explicar solo en el punto de friccion que la revision es operativa y no nomina/cumplimiento legal definitivo.
- No mezclar importes, saldos, compensaciones, payroll o reglas legales en pantallas de horario/fichaje.
- Si falta cierre semanal, hay fichaje abierto o correcciones pendientes, el estado debe ser `needs_review`, no validado.
- La revision de candidatos vive cerca de Fichaje, en una seccion densa y administrativa de `/app/time`, no en un calendario grande ni en una pantalla de nominas.
- El control `Detectar posibles excesos` debe permanecer discreto dentro de la seccion administrativa y devolver solo creados, ya existentes e ignorados por datos insuficientes.
- `coach` no debe ver cola tenant-wide ni acciones de revision; `payroll_manager` no debe ganar acceso por ese rol.

### Programacion Documental Util

E.8/I.29 abre la primera superficie visible minima en el detalle de bloque de `/app/schedule`: lectura autorizada de una fuente documental versionada, cerca del bloque, sin IA ni decisiones automaticas. E.9/I.30 confirma por QA interno que la experiencia depende de grants reales: descarga/preview, solo metadata o estado vacio. E.10/I.31 no cambia UI: deja runbook manual local/QA para validar esos estados antes de abrir datos reales o nuevas superficies.

Reglas UX candidatas:

- Desde un bloque, "ver programacion" debe mostrar fuente, version/fecha y estado de permiso antes de abrir preview o descarga.
- Si no hay programacion autorizada, el estado vacio debe ser breve y operativo: no sugerir IA, no mostrar contenido parcial y no culpar al usuario.
- La consulta por fecha/tipo/centro debe devolver solo programacion vigente/autorizada y dejar claro si el centro o bloque acota el resultado.
- No presentar la asignacion del coach como permiso: si falta grant/capacidad, la UI debe explicar que no hay contenido disponible para su permiso.
- No copiar contenido documental largo dentro del horario; enlazar a la version canonica o preview controlada.
- La UI consume `document_programming_links` como contexto tecnico, pero la superficie visible habla de fuente/version/fecha, disponibilidad y acciones permitidas, no de IDs internos.
- Preview y descarga deben aparecer solo cuando `can_preview` o `can_download` lo permitan; si no, se muestra disponibilidad de metadata sin accion falsa.
- Si el usuario esta asignado al bloque pero no tiene grant documental, el estado vacio debe seguir siendo breve y no sugerir que la asignacion deberia bastar.
- Evitar copy de decision automatica: la programacion ayuda a preparar clase, no asigna coaches, aprueba coberturas, valida horas ni calcula payroll.
- No mostrar datos sensibles de salud, disciplina, rendimiento laboral, ubicacion, payroll, importes, compensaciones, saldos o motivos personales.
- La validacion manual E.10/I.31 debe comprobar la experiencia con grant, solo metadata, sin grant y cross-tenant sin anadir textos permanentes ni controles de asociacion documental en Horario.

### Repositorio Documental Minimo

E.13/E.14/E.15/E.16 cierran evidencia redacted, bloqueo de entorno y handoff operativo en documentacion, sin anadir copy permanente ni controles nuevos en `/app/documents`.

E.11 abre `/app/documents` como superficie secundaria desde "Más": un listado prudente de documentos/versiones accesibles, no un gestor documental completo. E.12 exige validar esta experiencia con QA/staging controlado antes de usar documentos reales.

Reglas UX candidatas:

- Mostrar primero disponibilidad, version, alcance y permiso efectivo; evitar lenguaje de biblioteca global o repositorio legal completo.
- Los filtros por alcance ayudan a reducir ruido, pero nunca deben sugerir que el usuario puede ver scopes sin grant/capacidad real.
- Preview y descarga aparecen solo cuando `can_preview` o `can_download` llegan del servidor; si falta permiso, la accion no se muestra.
- El estado vacio debe ser util y breve: puede indicar que no hay documentos accesibles para el permiso actual, entorno o datos de prueba, sin culpar al usuario.
- La validacion E.12 debe cubrir usuario con descarga, usuario solo metadata, usuario sin grant y usuario cross-tenant, sin anadir avisos permanentes ni explicar internals de grants en la UI.
- La evidencia E.13/E.14/E.15/E.16 debe vivir en runbook/registro redacted, no como mensajes visibles de QA dentro de `/app/documents`.
- Los documentos `sensitive_hr`, payroll, evidencias de firma y firmables no deben aparecer en el repositorio minimo ni como filtros prometidos.
- No abrir subida, gestion de permisos, audit UI, documentos laborales sensibles, documentos firmables, boton "Firmar", snapshots, payroll ni IA desde esta superficie.
- Las deudas UX no bloqueantes para beta son densidad, filtros adicionales, busqueda y agrupaciones; bloquean beta las acciones falsas, permisos ambiguos, signed URLs en cliente o copy que prometa cumplimiento legal documental.

### IA Subordinada A Programacion

I.26 no abre UI de IA. E.6/I.27 establece antes la base de programacion documental util. Si una fase futura anade ayuda asistida, debe sentirse como lectura/explicacion de documentos autorizados, no como motor de decisiones.

Reglas UX candidatas:

- La accion principal sigue siendo ver programacion, horario, cobertura o solicitudes; la ayuda asistida no debe ocupar el primer nivel antes de que haya contenido util.
- Mostrar siempre la fuente documental, fecha/version o enlace autorizado que sostiene un resumen o respuesta.
- Si el usuario no tiene permiso para un documento, la UI debe decir que no hay contenido disponible para su permiso, no sugerir pedir a IA que lo busque.
- No usar copy de decision automatica: evitar "asignar", "aprobar", "validar", "cerrar", "calcular nomina" o "confirmar hora extra" como acciones de IA.
- Los casos validos son resumen de programacion, consulta sobre contenido autorizado, busqueda y ayuda interna para preparar clases.
- La UI no debe pedir ni mostrar motivos sensibles, salud, disciplina, rendimiento laboral, ubicacion, payroll, importes, compensaciones o saldos.
- Cualquier respuesta debe ser revisable por una persona y poder volver a la fuente canonica.

## Permisos Y Tenant

La UX debe hacer visible el contexto sin convertirlo en ruido:

- organizacion activa clara si el usuario puede pertenecer a varias;
- centro activo claro en vistas filtradas;
- acciones deshabilitadas o ausentes segun rol, con explicacion si hace falta;
- no usar banners permanentes de "modo lectura" o textos de limitacion de rol como muletilla de cada nueva pantalla; si no ayudan a decidir o actuar, sobran;
- explicar una restriccion solo donde el usuario intenta una accion no disponible o cuando el estado vacio necesita orientar el siguiente paso;
- ningun copy generico debe asumir STL;
- datos y branding de tenant deben presentarse como contexto, no como producto.

## Criterio De Calidad

Una pantalla futura de BoxOps se considera bien diseñada si:

- responde una pregunta operativa clara;
- funciona primero en movil;
- permite la accion frecuente en pocos pasos;
- distingue estados criticos de un vistazo;
- mantiene el tenant y el centro visibles cuando importan;
- no usa metricas o decoracion que no cambian decisiones;
- mantiene contraste, foco visible y textos sin cortar;
- podria servir a un segundo box sin reescribir nombres ni componentes.
