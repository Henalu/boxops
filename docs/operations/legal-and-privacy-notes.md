# Legal And Privacy Notes - BoxOps

Notas iniciales para evitar decisiones tecnicas peligrosas. No son asesoramiento legal. Antes de usar datos reales sensibles, revisar con asesor legal/laboral y actualizar estas notas.

## Principios

- BoxOps no debe prometer cumplimiento legal definitivo sin validacion externa.
- Datos laborales, fichajes, nominas, ubicacion, firmas y documentos privados requieren permisos estrictos y minimizacion.
- Toda tabla o documento de tenant debe mantener frontera de organizacion.
- No hardcodear STL ni reglas de un tenant como comportamiento del producto.
- Fichaje y documentos deben ser exportables/revisables, no cajas negras.

## Fichaje Manual

El fichaje puede tener implicaciones laborales. El primer corte debe ser manual, auditable y corregible antes de automatizar ubicacion.

Principios:

- Registrar inicio y fin de jornada.
- Permitir correcciones posteriores.
- Motivo obligatorio en correcciones.
- Guardar autor, fecha, valor anterior, valor nuevo y estado de correccion.
- Aprobacion semanal por gestor/admin de personal cuando se active el cierre.
- Historial auditable.
- Exportable/revisable por rango, trabajador y organizacion.
- Acceso del trabajador a sus propios registros.

Notas Espana a validar:

- La normativa espanola exige registro diario de jornada con inicio y fin.
- Los registros deben conservarse durante 4 anos.
- Los registros deben estar disponibles para trabajador, representantes legales e Inspeccion de Trabajo.
- Validar formato, detalle, accesos y retencion con asesor legal antes de prometer cumplimiento.

No presentar BoxOps como:

- solucion legal cerrada de control horario sin revision;
- sistema de payroll;
- calculadora laboral/fiscal definitiva;
- prueba unica sin posibilidad de correccion o auditoria.

## Geolocalizacion

La geolocalizacion solo debe usarse como comprobacion puntual vinculada a un turno o bloque asignado.

No permitido:

- seguimiento continuo;
- historial de movimientos;
- fichar solo por entrar al box;
- geofence permanente en segundo plano sin necesidad clara y base legal revisada;
- guardar trayectos o posiciones fuera del contexto de fichaje.

Condiciones minimas para sugerir o iniciar fichaje asistido:

- usuario con turno/bloque asignado;
- centro correcto;
- ventana cercana al inicio o fin;
- sin fichaje activo duplicado;
- consentimiento y explicacion clara al usuario;
- opcion de correccion manual si falla ubicacion.

Reglas operativas candidatas:

- Geolocalizacion opcional activable por admin.
- Ubicacion del centro configurable en mapa solo por roles con maximos permisos.
- Radio inicial sugerido: 100m configurable.
- Si el usuario entra en radio y coincide con horario, se puede fichar entrada segun el modo decidido.
- Si llega antes, no fichar todavia; al llegar la hora, revisar si sigue dentro.
- Si hay entrada activa, se puede proponer o aplicar salida automatica a la hora prevista segun decision legal/producto.
- No fichar si esta en el box fuera de horario, porque puede estar entrenando.

Limitacion tecnica:

- En navegador/PWA no se debe asumir geolocalizacion fiable con app cerrada.
- Para fichaje automatico en segundo plano hara falta evaluar fase nativa o wrapper movil, permisos iOS/Android, politicas de stores y privacidad.

Preguntas legales/privacidad antes de datos reales:

- Que base legal se invoca para ubicacion puntual?
- Como se informa finalidad, minimizacion y retencion?
- Que dato exacto se guarda: coordenada, precision, centro detectado, dentro/fuera o solo evento de fichaje?
- Cuanto tiempo se conserva evidencia de ubicacion?
- Como se gestiona denegacion de permiso sin discriminar al trabajador?

## Horas Extra

BoxOps debe tratar las horas extra como tracking interno pendiente de validacion.

No debe presentarse como:

- generador de nominas;
- calculadora fiscal;
- sistema legal definitivo de payroll.

Estados recomendados:

- `detected`
- `pending_validation`
- `validated`
- `compensated`
- `paid`
- `rejected`
- `closed`

Reglas:

- Separar horas planificadas, fichadas, corregidas y validadas.
- Guardar auditoria de validaciones y rechazos.
- Permitir exporte y revision humana.
- Validar con asesor laboral como se comunican o usan horas extra reales.

## Nominas Y Documentos Laborales

Para MVP, documentos laborales son repositorio/subida/consulta con permisos estrictos. BoxOps no genera nominas.

Reglas:

- Control de permisos estricto por organizacion.
- Separar documentos de empresa, documentos privados de empleado, documentos de gestion y certificaciones.
- Permitir permisos por rol y por persona concreta cuando el caso lo requiera.
- No asumir que `owner`, `admin` o `manager` pueden ver todos los documentos por defecto.
- Separar cabecera documental, version/archivo, sujetos afectados, grants y auditoria candidata.
- Tratar titulo, tipo, sensibilidad y metadata como potencialmente sensibles si describen nominas, contratos, bajas o justificantes.
- Registrar quien sube, quien puede ver y, si procede, quien accede.
- Valorar confirmacion de lectura para documentos importantes.
- Definir retencion y borrado antes de datos reales sensibles.
- No asumir que `admin` puede ver toda nomina o contrato si se decide separar permisos.

Documentos sensibles candidatos:

- nominas;
- contratos;
- anexos;
- justificantes;
- bajas/permisos;
- certificados;
- titulaciones;
- documentos firmados;
- resumenes de horas/fichaje.

Implicaciones tecnicas:

- Buckets privados de Supabase Storage o mecanismo equivalente.
- RLS desde la primera migracion.
- URLs firmadas para acceso temporal.
- Metadata en Postgres con `organization_id`, propietario/persona afectada, uploader y visibilidad.
- Auditoria de acceso para documentos sensibles si procede.
- Versionado si un documento puede reemplazarse.
- E.1 propone `document-files` como bucket privado candidato para archivos y `document-signature-evidence` para snapshots/evidencias futuras; no estan implementados.
- Rutas internas candidatas: `documents/{organization_id}/{document_id}/versions/{document_version_id}/{asset_id}.{ext}`, `signature-snapshots/{organization_id}/{document_id}/{request_id}/{evidence_id}.png` y `signed-documents/{organization_id}/{document_id}/{document_version_id}/{evidence_id}.{ext}`.
- Accesos a preview, descarga, cambios de grants, cambios de sensibilidad, reemplazos de version y exportaciones masivas son candidatos fuertes a auditoria.
- Certificaciones pueden tener estado operativo visible, pero el adjunto/titulo/certificado puede requerir permiso privado.

## Firmas De Documentos

La firma dibujada en perfil puede servir como firma/confirmacion interna de producto, pero no debe presentarse como firma electronica avanzada o cualificada sin validacion legal previa.

BoxOps debe separar dos capacidades:

- "Mi firma": el usuario crea, guarda y actualiza su firma personal dibujada desde "Mi perfil"/"Mi cuenta".
- "Firmar": una accion posterior en documentos, nominas, politicas internas, confirmaciones u otras secciones que reutiliza la firma guardada del usuario autenticado y genera evidencia propia.

Reglas minimas para "Mi firma" ya aplicadas en D.5:

- Copy claro al crear la firma: es firma/confirmacion interna, no firma electronica avanzada/cualificada.
- La firma se guarda en Storage privado (`profile-signatures`), nunca como imagen publica.
- La metadata vive en Postgres (`profile_signatures`) con frontera de tenant.
- El primer corte usa firma tenant-scoped con `organization_id` + `person_profile_id`.
- La opcion global por usuario requiere decision explicita porque puede complicar permisos, revocacion y separacion entre organizaciones.
- Solo el usuario propietario puede crear/actualizar su firma desde `/app/account`.
- Roles explicitamente autorizados podran ver evidencias o metadata en una fase futura si se decide, pero no usar la firma para firmar en nombre de otra persona.
- No permitir que un admin firme en nombre de otra persona usando su firma guardada.

Reglas minimas antes de documentos firmables:

- Firmar un documento o entidad debe crear evidencia auditada: organizacion, documento/version o entidad firmada, usuario autenticado, persona firmante, fecha/hora, snapshot usado, IP/user agent si se decide y estado.
- Debe conservarse un snapshot de la firma usada en esa firma concreta, porque la firma del perfil puede cambiar despues.
- La evidencia no debe depender solo del artefacto editable de "Mi firma".
- Si el usuario actualiza "Mi firma", los documentos ya firmados deben conservar la firma original usada.
- Si se modifica el documento, las firmas anteriores no deben parecer aplicadas automaticamente a la nueva version.
- Los documentos firmados deben tener retencion, acceso y borrado definidos antes de usar datos laborales reales.
- Revisar si se necesita proveedor especializado para contratos, anexos u otros documentos con exigencia legal fuerte.
- E.1 separa la solicitud de firma futura (`document_signature_requests`) de la evidencia inmutable futura (`document_signature_evidences`).
- La solicitud debe apuntar a una version concreta de documento; la evidencia debe guardar snapshot/version de firma, hash de documento/version, persona firmante y usuario autenticado.
- La lectura o descarga de evidencias/snapshots debe requerir grant/capacidad explicita y puede requerir auditoria de acceso.
- Ningun rol autorizado debe poder firmar por otra persona usando la firma guardada de esa persona; solo podria gestionar solicitudes o permisos segun capacidad futura.

Flujo de producto recomendado:

- Si un usuario pulsa "Firmar" y ya tiene firma guardada valida, la app reutiliza esa firma sin pedir que dibuje otra vez.
- Si no tiene firma guardada, la app debe pedir crearla antes de continuar o permitir crearla inline, segun decision de UX.
- Crear/actualizar "Mi firma" no debe equivaler automaticamente a firmar ningun documento.

No usar copy tipo:

- "firma electronica avanzada";
- "firma cualificada";
- "validez legal garantizada";
- "contrato legalmente firmado";

salvo que exista validacion legal y, si procede, proveedor especializado.

## Datos Sensibles

Datos potencialmente sensibles:

- documentos laborales;
- nominas;
- contratos;
- salario/retribucion;
- jornada/contrato;
- bajas/permisos;
- fichajes;
- correcciones de fichaje;
- ubicacion puntual;
- certificaciones con archivos personales;
- firmas dibujadas y documentos firmados;
- datos bancarios o fiscales si se incorporan.

Implicaciones tecnicas:

- RLS desde la primera migracion.
- Buckets de Storage privados.
- URLs firmadas para documentos privados.
- Auditoria de accesos cuando sea necesario.
- Separar documentos laborales de programacion/clases.
- Permisos de lectura/escritura por campo o modulo, no solo por rol general.
- Minimizar datos guardados y evitar campos sensibles en pantallas de equipo.

## App Movil Y Stores

La fase inicial debe ser navegador/PWA responsive. Antes de app nativa:

- validar que web/PWA cubre horario, cobertura, documentos y fichaje manual;
- documentar costes y licencias Apple Developer y Google Play;
- revisar politicas de privacidad de iOS/Android si se pide ubicacion;
- decidir si la app sera marca BoxOps o marca por tenant;
- evaluar Capacitor/Ionic, React Native/Expo u otra estrategia solo cuando haya requisito claro.

Si fichaje automatico con app cerrada es requisito comercial innegociable, elevar la prioridad de app nativa/wrapper y revisar legal/privacidad antes de venderlo.

## Riesgos A Revisar Antes De Implementar

- Retencion de datos de fichaje y documentos.
- Acceso de trabajadores, representantes e Inspeccion a registros de jornada.
- Consentimiento/base legal para geolocalizacion.
- Exactitud de geolocalizacion en centros cercanos o interiores.
- Responsabilidad si el sistema calcula mal horas extra.
- Permisos de managers por centro.
- Acceso a salario/retribucion, nominas y contratos.
- Validez legal y retencion de firmas documentales.
- Auditoria de acceso a documentos sensibles.
- Acceso de coaches a horarios de otros companeros.
