# Roadmap - BoxOps

Este roadmap resume las fases logicas despues de Task 017. `TASKS.md` mantiene el backlog ejecutable y el historial de tareas; este documento es la vista corta para decidir que va antes y que queda fuera.

## Estado Base

MVP 1 visual/operativo ya esta avanzado:

- auth Supabase SSR, multi-tenant por membership y rutas protegidas bajo `/app`;
- centros, equipo/coaches, perfiles visibles/personas operativas y tipos de actividad;
- horario semanal, asignaciones coach-bloque, cobertura basica, filtros, "Mi horario" y riesgos;
- plantillas semanales basicas, dashboard, `/app/coverage`, `/app/more`;
- navegacion mobile-first, onboarding local, smoke tests y audit visual/responsive de Task 017.

No existen todavia cambios, ausencias, documentos firmables, fichaje, RRHH completo ni app movil nativa. Roles avanzados compatibles, area personal minima, matriz documental de permisos personales, modelo documental de avatar privado, primer avatar privado propio y "Mi firma" privada propia ya existen como cortes B.2, D.1, D.2, D.3, D.4 y D.5.

## Fase A - Cierre MVP 1 Real

Objetivo: cerrar MVP 1 con datos reales validados y deuda pequena, sin abrir modulos nuevos.

Estado 2026-05-07: Fase A queda cerrada para QA interno y desarrollo. La semana L-V se carga con `supabase/snippets/stl-test-week-2026-05-04.sql` y la muestra interna opcional con `supabase/snippets/stl-internal-assignment-sample-2026-05-04.sql`. Smoke E2E local admin/coach pasa e incluye `Mi horario`. La validacion oficial STL queda para una etapa posterior de producto casi completo y no bloquea Fase B.

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

Estado 2026-05-07: B.1 implementada como primer corte generico y B.2 implementada como corte minimo de roles avanzados compatibles. Existe `/app/settings`, enlazada desde `/app/more`, para editar nombre visible y acento del tenant en `organizations.theme_config`. `owner` y `admin` mutan configuracion global; `manager` muta operativa MVP 1 tenant-wide sin tocar accesos ni configuracion global; `coach` queda en lectura. Logo real, colores por centro, permisos por centro y modulos RRHH sensible/documentos siguen pendientes.

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

- B.1 permite configurar marca ligera minima sin cambiar semantica ni rutas;
- B.2 reconoce roles del schema en la app y centraliza permisos en helpers reutilizables;
- `owner` y `admin` controlan configuracion global, branding ligero y accesos compatibles;
- `manager` y `admin` gestionan operativa diaria sin controlar todo el tenant;
- `coach` mantiene lectura operativa y no gana mutaciones;
- todos los usuarios conservan acceso a funciones personales aunque tengan rol alto.

Decision recomendada:

- evolucionar hacia `owner`, `admin`/`manager` y `coach`, manteniendo compatibilidad con `admin` actual.
- usar `organizations.theme_config` primero; migrar a tabla dedicada solo si hacen falta permisos, versionado o auditoria granular de tema.
- mantener `center_manager`, `document_admin`, `payroll_manager` y `staff` como roles reconocidos/documentados, sin permisos especializados hasta que existan schema y UX propios.

## Fase C - Auth Y Security Polish

Objetivo: endurecer autenticacion sin filtrar informacion sensible.

Estado 2026-05-07: implementada como corte minimo de producto. Se anade recuperacion de contrasena desde `/login`, solicitud generica en `/forgot-password`, callback SSR existente reutilizado para recovery y pagina `/reset-password` para guardar nueva contrasena.

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

- configurar en Supabase Auth la misma regla minima de contrasena: 8 caracteres, al menos una letra y un numero;
- permitir en Supabase Auth Redirect URLs el callback de recuperacion hacia `/auth/callback?next=/reset-password`;
- copy que no exponga si un email existe.

Criterio de salida:

- un usuario puede resetear contrasena de forma segura;
- la app no revela existencia de emails;
- la politica de contrasena queda documentada y aplicada en Auth y UI;
- queda decidido si el bloqueo de 3 intentos se apoya en Supabase, hook, tabla propia o combinacion.

Decision tecnica:

- En Fase C se usan los rate limits nativos de Supabase Auth como defensa suficiente para el corte minimo. La app no muestra intentos restantes ni bloqueos por email para no introducir enumeracion.
- Si mas adelante negocio/legal exige bloqueo exacto de 3 intentos, cooldown visible o auditoria propia, se abrira una fase con Password Verification Hook + tabla propia restringida a `supabase_auth_admin`.

## Fase D - Area Personal Y Modelo RRHH

Objetivo: crear "Mi perfil" o "Mi cuenta" como base personal y RRHH, separando lo editable por el usuario de lo gestionado por roles autorizados.

Estado 2026-05-08: D.1 implementa `/app/account` como corte minimo seguro. Todos los roles reconocidos con membership activa pueden abrir su area personal. La pantalla separa cuenta/Auth, perfil visible operativo, ficha de coach propia y RRHH sensible futuro; solo permite editar el `person_profiles` propio vinculado por `organization_id` + `user_id`. D.2 cierra la matriz documental de permisos por campo en `docs/architecture/personal-data-permissions.md`. D.3 modela avatar privado tenant-scoped como asset futuro. D.4 implementa el primer avatar privado propio con `profile_assets`, bucket privado `profile-assets`, RLS/RPC y subida/reemplazo minimo desde `/app/account`. D.5 implementa "Mi firma" privada propia con `profile_signatures`, bucket privado `profile-signatures`, RLS/RPC y canvas minimo en `/app/account`, sin documentos firmables ni boton "Firmar".

Alcance:

- D.1: nombre visible, alias y email publico opcional;
- cuenta/Auth en lectura, sin cambiar email desde BoxOps;
- ficha de coach propia en lectura, sin editar datos de otra persona;
- `weekly_contracted_hours` se conserva como capacidad operativa MVP 1, no como salario/nomina/contrato;
- avatar propio privado en `/app/account`, con fallback visual si no hay avatar;
- D.2: matriz por campo para decidir que es visible, propio, operativo, RRHH sensible, payroll, documento privado, firma o auditoria;
- D.3/D.4: avatar como `profile_assets`, privado, tenant-scoped, con signed URL corta y sin URL publica libre persistente;
- "Mi firma" como capacidad personal propia para todos los usuarios con membership activa y rol reconocido;
- crear firma dibujandola en canvas/touch area;
- borrar/redibujar antes de guardar;
- guardar y actualizar la firma reutilizable en Storage privado;
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

- matriz de permisos por campo documentada en D.2 como entrada obligatoria para siguientes cortes tecnicos;
- revision de privacidad para salario/retribucion y datos laborales;
- decision sobre si ampliar `person_profiles` o crear tablas RRHH separadas.
- decision D.5 aplicada: firma tenant-scoped con `organization_id` + `person_profile_id`; global por usuario queda abierta solo si aparece necesidad multi-tenant real.
- Storage privado `profile-signatures` para el artefacto de firma.

Criterio de salida:

- cada usuario tiene area personal usable;
- cada usuario puede editar solo su perfil visible propio en D.1;
- avatar propio queda implementado como asset privado tenant-scoped, sin reemplazo ajeno;
- cada usuario puede crear/actualizar su propia firma si tiene `person_profiles` vinculado;
- la firma no es asset publico y respeta frontera de tenant;
- ningun admin/manager puede firmar en nombre de otra persona usando su firma guardada;
- datos sensibles no aparecen en equipo operativo general;
- admin/manager no hereda acceso a salario por defecto si no corresponde;
- la frontera entre cuenta, persona operativa y datos laborales queda documentada.
- documentos firmables y RRHH sensible no se implementan hasta tener schema, Storage privado/RLS, snapshots y permisos explicitos.

Decision recomendada:

- separar datos publicos/operativos de datos laborales sensibles. `person_profiles` no debe convertirse en cajon de salario, contrato y documentos.
- usar D.2/D.3/D.4/D.5 como puerta de entrada: avatar propio y firma propia ya existen con Storage privado; despues, si procede, modelar documentos firmables sin mezclar creacion de firma con firma aplicada.
- "Mi firma" ya existe antes de botones "Firmar" en documentos o nominas.
- no crear tablas RRHH nuevas sin capacidades, policies, auditoria y revision de privacidad/legal.

## Fase E - Documentos, Permisos, Nominas, Firmas Y Certificaciones

Estado 2026-05-08: E.1 queda documentada como fase de modelado seguro. Define entidades candidatas, frontera `organization_id`, buckets privados candidatos, permisos por rol/persona, separacion entre "Mi firma" y "Firmar documento", snapshot futuro y auditoria candidata. No implementa migraciones, buckets, UI, boton "Firmar", documentos firmables ni snapshots reales.

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
- Fase D con "Mi firma" real cerrada antes de botones de firma documental;
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
- E.1 debe cerrar el modelo antes de implementar: `documents`, `document_versions`, `document_subjects`, `document_access_grants`, auditoria candidata, certificaciones y solicitudes/evidencias de firma futuras.
- usar buckets privados candidatos (`document-files` y `document-signature-evidence`) con rutas internas tenant-scoped; no guardar URLs publicas ni rutas sin `organization_id`.
- separar documentos de empresa, documentos privados de persona y documentos de gestion/admin; cada categoria necesita permisos explicitos y puede requerir auditoria distinta.
- tratar certificaciones como dato operativo con adjunto potencialmente privado: el estado/caducidad puede alimentar cobertura futura, pero el archivo no debe hacerse visible por defecto.
- mantener "Mi firma" como asset personal privado ya existente; "Firmar documento" sera una accion futura que genera evidencia inmutable y no permite firma por delegacion.
- registrar auditoria de lectura/descarga/cambio de documentos sensibles y evidencias, no solo de subida.

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
