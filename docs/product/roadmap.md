# Roadmap - BoxOps

Este roadmap resume las fases logicas despues de Task 017. `TASKS.md` mantiene el backlog ejecutable y el historial de tareas; este documento es la vista corta para decidir que va antes y que queda fuera.

## Estado Base

MVP 1 visual/operativo ya esta avanzado:

- auth Supabase SSR, multi-tenant por membership y rutas protegidas bajo `/app`;
- centros, equipo/coaches, perfiles visibles/personas operativas y tipos de actividad;
- horario semanal, asignaciones coach-bloque, cobertura basica, filtros, "Mi horario" y riesgos;
- plantillas semanales basicas, dashboard, `/app/coverage`, `/app/more`;
- navegacion mobile-first, onboarding local, smoke tests y audit visual/responsive de Task 017.

No existen todavia cambios, ausencias, documentos, fichaje, RRHH completo, roles avanzados ni app movil nativa.

## Fase A - Cierre MVP 1 Real

Objetivo: cerrar MVP 1 con datos reales validados y deuda pequena, sin abrir modulos nuevos.

Estado 2026-05-06: semana de prueba L-V cargada localmente con `supabase/snippets/stl-test-week-2026-05-04.sql`. La UI ya fue validada con 165 bloques reales, una plantilla vacante y smoke E2E local admin/coach. `/app/templates` quedo ajustada para editar un bloque por URL sin renderizar todos los formularios cerrados y para alternar todas las plantillas entre vista Semana y vista Agenda. Fase A no se cierra por completo hasta confirmar centro por bloque, asignaciones/huecos reales y credenciales o flujo E2E real de admin/coach del tenant piloto.

Alcance:

- validar una semana real por centro, coach, tipo, bloque y asignacion;
- comprobar plantillas, excepciones, duplicados y riesgos reales;
- ajustar documentacion de datos del primer tenant sin convertirla en logica de producto;
- cerrar deuda pequena de UX movil, empty states y copy operativo si bloquea uso diario.

No incluye:

- nuevos roles;
- documentos, fichaje, RRHH, cambios o ausencias;
- personalizacion visual real por tenant.

Dependencias:

- datos validados del primer tenant;
- permisos de prueba para admin y coach;
- semana de ejemplo anonimiz-able o fixture privado si procede.

Criterio de salida:

- una semana real se puede cargar, revisar y corregir desde la UI existente;
- el dashboard y cobertura muestran riesgos utiles;
- `rg -n "STL" src` sigue sin referencias de producto;
- el backlog de MVP 1 queda separado de fases futuras.

## Fase B - Configuracion De Tenant, Branding Y Roles Avanzados

Objetivo: permitir configuracion global de organizacion y marca ligera sin romper la identidad BoxOps.

Alcance:

- pagina real de Configuracion para organizacion activa;
- logo del box, acento corporativo y colores por centro;
- configuracion visual controlada desde `organizations.theme_config jsonb` si sigue encajando;
- validacion de contraste y fallback a BoxOps cuando un valor no pase controles;
- evolucion de roles sin romper `admin` y `coach`.

No incluye:

- cambios visuales libres por tenant;
- sobrescribir estados criticos como sin cubrir, conflicto, error o foco;
- billing real;
- permisos por documento o RRHH completo.

Dependencias:

- decision `theme_config` vigente;
- modelo de asset/logo privado o referencia interna;
- matriz de permisos para separar configuracion global de gestion diaria.

Criterio de salida:

- un tenant puede configurar marca ligera sin cambiar semantica ni rutas;
- `owner` o `superadmin` queda reservado para configuracion global, branding y billing futuro;
- `manager` o `admin` queda reservado para gestion diaria;
- todos los usuarios conservan acceso a funciones personales aunque tengan rol alto.

Decision recomendada:

- evolucionar hacia `owner`, `admin`/`manager` y `coach`, manteniendo compatibilidad con `admin` actual.
- usar `organizations.theme_config` primero; migrar a tabla dedicada solo si hacen falta permisos, versionado o auditoria granular de tema.

## Fase C - Auth Y Security Polish

Objetivo: endurecer autenticacion sin filtrar informacion sensible.

Alcance:

- "He olvidado mi contrasena" en login;
- reset password con Supabase Auth;
- pagina de nueva contrasena;
- regla minima: 8 caracteres, al menos una letra y un numero;
- misma regla configurada en Supabase Auth y repetida en app para feedback visual;
- estudio de bloqueo/cooldown por intentos fallidos.

No incluye:

- SSO empresarial;
- MFA obligatorio;
- panel avanzado de seguridad por usuario.

Dependencias:

- configuracion real de Supabase Auth;
- decision tecnica sobre rate limits, Password Verification Hook y tabla propia de intentos;
- copy que no exponga si un email existe.

Criterio de salida:

- un usuario puede resetear contrasena de forma segura;
- la app no revela existencia de emails;
- la politica de contrasena queda documentada y aplicada en Auth y UI;
- queda decidido si el bloqueo de 3 intentos se apoya en Supabase, hook, tabla propia o combinacion.

Decision que requiere validacion tecnica:

- Supabase Auth rate limits pueden cubrir parte del riesgo, pero avisos de intentos restantes y cooldown por usuario/email probablemente requieren hook o tabla propia con cuidado anti-enumeracion.

## Fase D - Area Personal Y Modelo RRHH

Objetivo: crear "Mi perfil" o "Mi cuenta" como base personal y RRHH, separando lo editable por el usuario de lo gestionado por roles autorizados.

Alcance:

- datos personales visibles/editables segun permisos;
- "Mi firma" como capacidad personal para todos los usuarios;
- crear firma dibujandola en canvas/touch area;
- borrar/redibujar antes de guardar;
- guardar y actualizar la firma reutilizable;
- advertir que actualizar la firma no cambia documentos ya firmados;
- puesto, antiguedad, datos laborales, contrato/jornada cuando proceda;
- retribucion/salario solo para roles autorizados;
- datos personales disponibles para todos los usuarios, incluidos admins que tambien trabajan como coaches.

No incluye:

- nominas generadas;
- calculo laboral/fiscal;
- documentos completos;
- fichaje.

Dependencias:

- matriz de permisos por campo;
- revision de privacidad para salario/retribucion y datos laborales;
- decision sobre si ampliar `person_profiles` o crear tablas RRHH separadas.
- decision firma tenant-scoped vs global por usuario; recomendacion inicial: tenant-scoped con `organization_id` + `person_profile_id`.
- Storage privado o mecanismo equivalente para el artefacto de firma.

Criterio de salida:

- cada usuario tiene area personal usable;
- cada usuario puede crear/actualizar su propia firma;
- la firma no es asset publico y respeta frontera de tenant;
- ningun admin/manager puede firmar en nombre de otra persona usando su firma guardada;
- datos sensibles no aparecen en equipo operativo general;
- admin/manager no hereda acceso a salario por defecto si no corresponde;
- la frontera entre cuenta, persona operativa y datos laborales queda documentada.

Decision recomendada:

- separar datos publicos/operativos de datos laborales sensibles. `person_profiles` no debe convertirse en cajon de salario, contrato y documentos.
- implementar "Mi firma" antes de botones "Firmar" en documentos o nominas.

## Fase E - Documentos, Permisos, Nominas, Firmas Y Certificaciones

Objetivo: centralizar documentos de empresa, documentos personales, firmas y certificaciones con permisos estrictos.

Alcance:

- documentos de empresa;
- "Mis documentos";
- subida de titulaciones/certificaciones por empleados;
- subida de nominas u otros documentos privados por roles autorizados al espacio de cada empleado;
- permisos por rol y por persona concreta, estilo compartir en Drive;
- botones "Firmar" en documentos o entidades futuras que reutilizan la firma guardada del usuario autenticado;
- snapshot/version de firma guardado en cada firma aplicada;
- buckets privados, RLS, URLs firmadas y auditoria de acceso cuando proceda.

No incluye:

- gestor documental completo;
- generacion de nominas;
- firma electronica avanzada/cualificada;
- integracion Drive API salvo decision posterior.

Dependencias:

- modelo de documentos y permisos;
- Fase D cerrada para "Mi firma";
- Supabase Storage privado;
- politica de retencion, borrado y auditoria;
- revision legal para documentos sensibles y firmas.

Criterio de salida:

- una persona ve sus documentos propios;
- un rol autorizado puede subir documentos privados a una persona concreta;
- documentos de empresa respetan permisos;
- las certificaciones pueden adjuntar archivo y caducidad;
- los botones "Firmar" consumen la firma guardada y no obligan a dibujarla cada vez;
- si falta firma guardada, el flujo pide crearla antes de continuar o la crea inline segun decision documentada;
- cada firma aplicada registra organizacion, entidad/documento versionado, usuario autenticado, persona firmante, fecha/hora, snapshot usado y estado;
- ninguna firma se presenta como avanzada/cualificada sin validacion legal.

Decision recomendada:

- modelar permisos con una combinacion de scope, rol y grants por persona concreta. Evitar que `admin` sea sinonimo automatico de acceso a todo documento sensible.

## Fase F - Fichaje Manual Legal Y Auditable

Objetivo: registrar jornada de forma manual, exportable y auditable antes de automatizar geolocalizacion.

Alcance:

- entrada/salida manual;
- vinculacion a turno/bloque cuando exista;
- correcciones posteriores con motivo obligatorio;
- aprobacion semanal por gestor/admin de personal;
- exportes y auditoria;
- acceso del trabajador a sus registros.

No incluye:

- fichaje automatico por ubicacion;
- calculo legal definitivo de horas extra;
- payroll.

Dependencias:

- revision legal y privacidad;
- modelo de turnos/registros/correcciones/aprobaciones;
- permisos de trabajador, gestor, owner y representantes si aplica.

Criterio de salida:

- se registran inicio y fin de jornada;
- hay historial de correcciones y aprobaciones;
- existe exporte revisable;
- se documenta la obligacion en Espana de conservar registros 4 anos y permitir acceso a trabajador, representantes e Inspeccion;
- BoxOps no promete cumplimiento legal definitivo sin revision.

Decision que requiere validacion legal:

- textos, retencion, acceso de representantes, formato de exporte y alcance de aprobacion semanal deben revisarse antes de usar datos reales.

## Fase G - Fichaje Geolocalizado Asistido

Objetivo: usar ubicacion puntual para ayudar al fichaje, sin tracking continuo ni fichar por presencia fuera de horario.

Alcance:

- geolocalizacion opcional activable por admin;
- ubicacion del centro configurable en mapa por roles de maximo permiso;
- radio inicial sugerido de 100m configurable;
- entrada asistida si el usuario esta dentro del radio y coincide con horario;
- si llega antes, esperar a la hora y revisar si sigue dentro;
- salida automatica a la hora prevista si hay entrada activa;
- no fichar si esta en el box fuera de horario;
- consentimiento/permiso claro de ubicacion.

No incluye:

- historial de movimientos;
- tracking continuo;
- geofencing fiable con app cerrada en navegador/PWA;
- automatismo legalmente garantizado.

Dependencias:

- Fase F cerrada;
- ubicaciones de centro fiables;
- precision real probada en interior/exterior;
- revision legal y privacidad.

Criterio de salida:

- el usuario entiende cuando se consulta su ubicacion;
- solo se guardan eventos necesarios del fichaje, no trayectos;
- los fallos de ubicacion se corrigen manualmente;
- la documentacion advierte la limitacion tecnica de navegador/PWA.

Decision que requiere validacion tecnica:

- en navegador/PWA no se debe asumir geolocalizacion fiable con app cerrada. Si el fichaje automatico en segundo plano es requisito comercial, la fase nativa sube de prioridad.

## Fase H - PWA, App Movil Y Geofencing Nativo

Objetivo: preparar la experiencia movil sin saltar prematuramente a app nativa.

Alcance:

- navegador/PWA responsive como primera fase;
- arquitectura preparada para futura publicacion en App Store y Google Play;
- evaluacion posterior de Capacitor/Ionic, React Native/Expo u otra estrategia;
- licencias Apple Developer y Google Play como dependencia futura;
- geofencing nativo si el negocio lo exige.

No incluye:

- publicacion nativa antes de validar web/MVP operativo;
- promesa de automatismos con app cerrada desde web/PWA;
- reescritura movil completa sin decision de producto.

Dependencias:

- validacion comercial de fichaje automatico;
- decision tecnica de wrapper/nativo;
- cuentas developer y politica de privacidad compatible con ubicacion.

Criterio de salida:

- hay una estrategia movil decidida;
- la PWA cubre uso diario basico;
- se documentan costes, licencias y riesgos de stores;
- geofencing nativo solo entra si web/PWA no cumple el caso comercial.

## Fase I - Cambios, Ausencias, Eventos, Horas Extra E IA

Objetivo: ordenar los modulos ya previstos despues de cerrar la base operativa, seguridad, RRHH, documentos y fichaje inicial.

Alcance:

- cambios de turno/clase y cobertura entre coaches;
- ausencias, vacaciones y permisos;
- eventos, festivos y competiciones;
- horas extra detectadas, validadas y cerradas;
- IA sobre programacion solo cuando documentos y horarios esten modelados.

No incluye:

- IA antes de datos/documentos utiles;
- payroll completo;
- CRM de alumnos;
- marketplace de coaches.

Dependencias:

- permisos avanzados;
- registros de horario/fichaje si impactan horas;
- documentos/certificaciones si condicionan asignaciones;
- validacion comercial de prioridades.

Criterio de salida:

- cada submodulo tiene task propia, modelo de permisos y criterio de auditoria;
- cambios y ausencias actualizan cobertura de forma trazable;
- horas extra no se presentan como nomina ni calculo fiscal;
- IA queda subordinada a programacion/documentos ya existentes.
