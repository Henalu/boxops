# Legal And Privacy Notes - BoxOps

Notas iniciales para evitar decisiones tecnicas peligrosas. No son asesoramiento legal. Antes de usar datos reales sensibles, revisar con asesor legal/laboral y actualizar estas notas.

## Principios

- BoxOps no debe prometer cumplimiento legal definitivo sin validacion externa.
- Datos laborales, fichajes, nominas, ubicacion, firmas y documentos privados requieren permisos estrictos y minimizacion.
- Toda tabla o documento de tenant debe mantener frontera de organizacion.
- No hardcodear STL ni reglas de un tenant como comportamiento del producto.
- Fichaje y documentos deben ser exportables/revisables, no cajas negras.

## Planificacion Y Plantillas

Las plantillas semanales son patrones reutilizables para generar o aplicar horarios. No deben tratarse como el historico operativo final.

- Archivar o eliminar logicamente una plantilla no debe borrar horarios ya generados.
- Los bloques reales (`schedule_blocks`) y sus asignaciones viven como planificacion independiente una vez creados.
- La ventana inicial de recuperacion de plantillas archivadas es de 30 dias (`archived_at` y `recoverable_until`).
- La recuperacion devuelve la plantilla como borrador para evitar nuevas aplicaciones automaticas sin revision.
- La retencion de horarios planificados debe decidirse separada de la retencion de plantillas. Como criterio funcional inicial, conservar el historico de horarios entre 2 y 4 anos y evitar limpiezas agresivas.
- La obligacion clara de 4 anos aplica al fichaje/registro real de jornada; no asumir automaticamente ese mismo tratamiento legal para plantillas o planificacion previa.

## Cambios De Turno/Clase Y Cobertura

I.1 modela cambios de bloque/clase y cobertura entre coaches como workflow operativo sobre planificacion, no como modulo laboral completo.

Principios:

- Un cambio/cobertura aplicado debe dejar rastro de quien solicito, quien acepto/rechazo, quien aprobo/rechazo si aplica y cuando se aplico al horario real.
- La aprobacion de `owner`, `admin` o `manager` es una aprobacion operativa de cobertura; no es firma documental, no es aprobacion legal de horas extra, no genera payroll y no garantiza cumplimiento laboral definitivo.
- Aceptar cubrir un bloque puede afectar fichaje/horas planificadas, pero no debe convertirse automaticamente en hora extra validada ni nomina.
- Las notas o motivos de solicitud deben minimizarse; evitar guardar informacion sensible de salud, permisos, bajas, sanciones, salario, documentos o datos familiares en un flujo de cobertura.
- Si el motivo real es vacaciones, baja, permiso o ausencia laboral, debe pasar por el dominio propio de ausencias/permisos con permisos y revision legal propios, no forzarse dentro de `change_requests`.
- El historial critico de solicitud, respuesta, aprobacion y aplicacion no debe borrarse silenciosamente; cancelaciones, rechazos y expiraciones son estados trazables.
- Los cambios deben respetar `organization_id` y no mezclar datos entre tenants, centros o coaches de otros tenants.

No presentar BoxOps como:

- solucion definitiva de gestion laboral de ausencias por tener cambios/cobertura;
- aprobador automatico de horas extra;
- sistema de payroll o nominas;
- prueba unica irrefutable de presencia o trabajo realizado;
- documento firmado o firma electronica por aprobar una solicitud operativa.

## Ausencias, Vacaciones Y Permisos

Estado I.16 2026-05-15: existe una base tecnica interna DB/RLS/RPC para solicitudes de ausencia en `absence_requests`, periodos en `absence_request_periods` y auditoria minimizada en `absence_request_events`, una capa server-side interna en `src/lib/absence-requests.ts`, una primera bandeja visible protegida en `/app/absences`, un formulario minimo para crear solicitud propia, hardening visible de filtros/validacion/estados no accionables, QA tecnico de regresion e impacto derivado de ausencias aprobadas o en revision sobre la lectura de cobertura. No hay creacion para otra persona, calendario de ausencias, saldos legales, devengo de vacaciones, baja medica con documentos, payroll, resolucion automatica de cobertura ni cumplimiento legal definitivo.

Principios:

- Una ausencia/no disponibilidad no es una solicitud de cobertura a otro coach.
- Aprobar una ausencia no modifica automaticamente `schedule_blocks` ni `schedule_block_assignments`.
- El impacto sobre cobertura se calcula al vuelo contra asignaciones activas; resolverlo requiere ajuste manual futuro o `change_requests`.
- La capa app/server solo puede mutar mediante RPCs acotadas; no debe escribir tablas de ausencia directamente ni registrar eventos propios salvo que exista RPC publica documentada.
- La bandeja visible I.12-I.14 muestra solicitudes propias, cola operativa para `owner`/`admin`/`manager`, acciones seguras por Server Actions, creacion propia minima e impacto calculado al vuelo. No crea ausencias para otra persona ni resuelve cobertura.
- I.14 anade filtros por query string, mensajes de no accionable, confirmacion de minimizacion del resumen, rechazo server-side de senales sensibles basicas y copy de aprobacion operativa. Los filtros no cambian permisos ni visibilidad real.
- I.15 no cambia copy legal/privacidad visible ni permisos; anade smoke/guardrails para mantener esos limites tras I.14.
- I.16 permite que `/app/schedule`, `/app/coverage`, Inicio y `/app/stats` digan "impacto de ausencia", "ausencia en revision" o "requiere revision de cobertura"; no deben hablar de cumplimiento legal ni mostrar motivos sensibles.
- Crear una solicitud propia es una peticion operativa pendiente de revision, no una aprobacion legal, devengo de vacaciones, saldo legal ni baja medica documentada.
- Los motivos deben mantenerse minimizados. No guardar diagnosticos, salud, justificantes, datos familiares, sanciones, salario, payroll, ubicacion, IP/fingerprint, URLs ni tokens.
- Las bajas medicas con documentos, justificantes o anexos deben pasar por el modelo documental privado y una revision legal/privacidad especifica.
- La retencion candidata tecnica queda en 24 meses para solicitudes y 180 dias para eventos; antes de datos reales hay que validarla legalmente y decidir purga/job o runbook.

No presentar BoxOps como:

- sistema legal definitivo de gestion de vacaciones o permisos;
- calculadora de saldos legales o devengo de vacaciones;
- gestion de bajas medicas documentadas;
- aprobacion automatica de horas extra o payroll por aprobar una ausencia;
- sustituto de asesoria laboral o revision legal.

## Fichaje Manual

El fichaje puede tener implicaciones laborales. El primer corte debe ser manual, auditable y corregible antes de automatizar ubicacion.

Estado F.14/G.2 2026-05-13: ya existe schema/RPC/RLS, capa servidor y UI propia en `/app/time` para registrar entrada/salida manual, consultar registros por semana, corregir fichajes propios con motivo obligatorio, ver avisos operativos frente a bloques asignados, separar cambios de punches hacia un historial visible de 30 dias sin borrado fisico, generar fichajes automaticos web por planificacion, cerrar semanas mediante RPC/scheduler DB y descargar un CSV interno revisable para `owner`, `admin` y `manager`. Por defecto, la correccion propia se aplica directamente mediante RPC trazada; si `owner`, `admin` o `manager` activan aprobacion previa en `/app/settings`, vuelve el flujo de solicitud pendiente, revision por `owner`/`admin`/`manager` y aplicacion explicita. G.1/G.2 solo documentan el modelo y la decision tecnica/legal futura de ubicacion asistida. Sigue siendo un primer corte auditable sin geolocalizacion activa, payroll, aprobacion legal de horas extra, exporte legal definitivo ni promesa de cumplimiento legal definitivo.

Principios:

- Registrar inicio y fin de jornada.
- Permitir correcciones posteriores.
- Motivo obligatorio en correcciones.
- Guardar autor, fecha, valor anterior, valor nuevo y estado de correccion.
- Aprobacion semanal por gestor/admin de personal cuando se active el cierre.
- Historial auditable.
- Exportable/revisable por rango, trabajador y organizacion.
- Acceso del trabajador a sus propios registros.
- `organization_id` obligatorio en cualquier entidad futura de fichaje.
- Relacion opcional con `schedule_blocks` o `schedule_block_assignments` para contexto, sin impedir fichar si no hay bloque/asignacion.
- En `/app/time`, el corte visible permite centro opcional del tenant, fichaje sin bloque/asignacion, vista semanal navegable, avisos por falta/exceso/fichaje abierto frente a asignaciones propias, correcciones propias sobre registros/punches de la semana, revision administrativa minima cuando el tenant exige aprobacion y aplicacion explicita de solicitudes ya aprobadas; la vinculacion manual a bloque/asignacion queda para un selector seguro posterior.

Entidades candidatas:

- `time_records`: registro de jornada por trabajador/persona, fecha y organizacion.
- `time_punches`: entrada/salida manual dentro del registro.
- `time_record_corrections`: correcciones con motivo, autor, estado y valores anteriores/nuevos.
- `time_weekly_approvals`: aprobacion o reapertura semanal auditable.
- `time_exports`: exportes por rango, trabajador, centro u organizacion.
- `time_audit_events`: eventos de auditoria de fichaje, correccion, aprobacion, reapertura, exporte y accesos relevantes.

Actores y permisos a validar:

- trabajador/coach: crear fichajes propios, consultar registros propios y corregir sus propios fichajes; si el tenant exige aprobacion, esas correcciones quedan como solicitudes pendientes.
- `manager`: revisar, resolver correcciones y aprobar semanas dentro del alcance operativo decidido.
- `admin`/`owner`: supervisar tenant, configurar reglas, exportar y reabrir semanas sin ediciones silenciosas.
- roles futuros: `center_manager` para alcance por centro, `payroll_manager` para consumir exportes validados, `staff` como trabajador no coach y accesos controlados para representantes/Inspeccion si legalmente procede.

Correcciones:

- Toda correccion debe tener motivo obligatorio.
- Debe guardar autor autenticado, membership/persona cuando exista, fecha, estado y snapshot suficiente de valores anteriores/nuevos.
- Estados candidatos: `pending`, `approved`, `rejected`, `cancelled`, `applied`.
- Una entrada/salida historica no se sobrescribe sin rastro; se versiona, supersede o ajusta mediante correccion trazada.
- Una semana aprobada solo se cambia mediante reapertura o correccion posterior auditada.
- La UI propia no debe aceptar JSON libre para snapshots ni `person_profile_id`; los snapshots se construyen en servidor desde datos propios y campos controlados.
- La politica por defecto no es solicitud: cada persona puede aplicar su propia correccion mediante RPC trazada. `Owner`, `admin` o `manager` pueden activar aprobacion previa en la configuracion de fichaje del tenant; cada cambio de politica se registra como `time_settings_updated`.
- La revision administrativa debe validar tenant y permiso en servidor para cualquier `correctionId` recibido desde UI.
- Rechazar una correccion requiere nota de revision; aprobar puede dejar nota opcional.
- Aprobar una correccion pendiente no modifica automaticamente `time_records` ni `time_punches`; aplicar una correccion aprobada es una accion posterior explicita.
- Solo se pueden aplicar correcciones `approved`; `pending`, `rejected`, `cancelled` y `applied` no se aplican.
- Aplicar una correccion puede crear un `time_punches` con `source = correction`, marcar un punch original como `superseded` o marcarlo como `voided`.
- `record_update` queda aplicado sin tocar `time_records` mientras el modelo no tenga un campo seguro de nota aplicada o mutaciones de jornada controladas.
- Aplicar una correccion cambia el historico operativo de forma trazada, pero no equivale a payroll, nomina ni cumplimiento legal definitivo.
- Tras aplicar una correccion, los punches sustituidos o anulados deben salir de la vista principal del dia y aparecer solo en un historial de cambios visible durante 30 dias.
- La ventana de 30 dias reduce ruido operativo, pero no debe interpretarse como borrado fisico automatico de la evidencia canonica. Borrar `time_punches`, correcciones o auditoria requiere politica legal/tecnica de retencion separada.
- Los avisos semanales de exceso o falta son comparaciones operativas entre fichajes activos y bloques asignados. No aprueban horas extra, no sustituyen revision laboral y no generan nomina.
- Si un dia asignado no tiene `time_record`, BoxOps puede avisarlo, pero no crea todavia una correccion historica desde cero; esa capacidad requiere una RPC futura transaccional y auditada.

Cierre semanal F.12:

- `time_weekly_approvals` usa estados `open`, `submitted`, `approved`, `rejected`, `correction_required`, `resubmitted`, `reopened` y `voided`, con `pending` solo como compatibilidad historica.
- El envio semanal automatico debe ejecutarse desde una primitiva de base de datos/scheduler y evaluar la hora local de cada organizacion; no debe depender de que alguien abra la UI ni de una Server Action normal.
- La aprobacion firmada semanal es una confirmacion interna de cierre de fichajes. No es firma documental, no es firma electronica avanzada/cualificada y no debe presentarse como garantia legal definitiva.
- El aprobador firma con su propia firma activa de `profile_signatures`; ningun `owner`, `admin` o `manager` puede usar la firma guardada de la persona aprobada ni firmar "por" otra persona.
- La aprobacion guarda snapshot/version de la firma usada, porque "Mi firma" puede cambiar despues.
- Rechazar una semana exige nota obligatoria; la nota debe servir para que la persona corrija y reenvie, sin convertir el rechazo en sancion automatica.
- Aprobar bloquea modificaciones normales de la semana. Reaperturas o ajustes posteriores deben tener motivo, permiso y auditoria.
- El cierre semanal no crea payroll, no aprueba automaticamente horas extra, no reemplaza exportes revisables y no evita que el trabajador pueda ver o discutir sus registros.

Exporte interno F.14:

- El CSV inicial es un exporte interno revisable para revision humana, no payroll, no nomina, no aprobacion automatica de horas extra y no garantia legal definitiva.
- La descarga se sirve desde backend con sesion normal, validando organizacion, membership activa, rol `owner`/`admin`/`manager`, rango y persona opcional.
- El exporte registra metadata en `time_exports` y auditoria tecnica por triggers de `time_audit_events`.
- El contenido minimo incluye organizacion, persona, fecha local, estado de registro, entradas/salidas activas, minutos trabajados calculados por pares entrada/salida activos, estado de cierre semanal y resumenes/contadores de notas o correcciones.
- No incluye snapshots completos de correcciones, texto libre de correcciones, ubicacion, mapas, IP, Wi-Fi, Bluetooth, rutas Storage ni documentos firmables.
- El formato, detalle, retencion y acceso para trabajador, representantes legales o Inspeccion siguen pendientes de validacion legal antes de usar datos reales o prometer cumplimiento.

Notas Espana a validar:

- La normativa espanola exige registro diario de jornada con inicio y fin.
- Los registros deben conservarse durante 4 anos.
- Los registros deben estar disponibles para trabajador, representantes legales e Inspeccion de Trabajo.
- Validar formato, detalle, accesos y retencion con asesor legal antes de prometer cumplimiento.

No presentar BoxOps como:

- solucion legal cerrada de control horario sin revision;
- sistema de payroll;
- calculadora laboral/fiscal definitiva;
- prueba unica sin posibilidad de correccion o auditoria;
- sistema de geolocalizacion o geofencing en F.1;
- app nativa de control horario;
- calculo automatico de horas extra.

## Geolocalizacion

Estado G.2 2026-05-12: no existe geolocalizacion activa en BoxOps. G.1 define el modelo seguro para una ubicacion puntual asistida y G.2 prepara la decision tecnica/legal previa a implementacion, sin migraciones, UI de mapa, lectura de `navigator.geolocation`, tracking continuo, geofencing, app nativa ni fichaje automatico.

La geolocalizacion solo debe usarse como comprobacion puntual vinculada al acto de fichar o validar contexto operativo. No debe convertirse en vigilancia ni en fuente unica de verdad.

Referencias legales/principios revisados para G.2:

- La AEPD recuerda en su guia de relaciones laborales que los sistemas de geolocalizacion en el trabajo exigen informacion previa, proporcionalidad y respeto a la normativa de proteccion de datos: https://www.aepd.es/documento/la-proteccion-de-datos-en-las-relaciones-laborales.pdf
- La informacion y base juridica deben cerrarse con asesor legal antes de usar datos reales; estas notas no sustituyen esa revision.

No permitido:

- seguimiento continuo;
- historial de movimientos;
- fichar solo por entrar al box;
- geofence permanente en segundo plano sin necesidad clara y base legal revisada;
- guardar trayectos o posiciones fuera del contexto de fichaje;
- guardar coordenadas crudas persistidas del trabajador; G.2 decide no persistirlas;
- guardar URLs de mapas, tokens, trazas completas del navegador o datos GPS innecesarios.

Condiciones minimas para sugerir o iniciar fichaje asistido:

- usuario con turno/bloque asignado cuando exista o contexto operativo justificable;
- centro correcto dentro del tenant activo;
- ventana cercana al inicio o fin si se usa contra horario;
- sin fichaje activo duplicado;
- consentimiento y explicacion clara al usuario;
- opcion de fichaje manual y correccion si falla ubicacion, hay poca precision o se deniega permiso.

Configuracion futura minima por tenant/centro:

- activacion opcional por tenant, inicialmente solo por `owner`;
- latitud/longitud del centro en configuracion controlada, no en copy suelto;
- radio permitido configurable;
- precision maxima aceptable;
- timezone del centro;
- estado activo/inactivo;
- version de politica;
- texto de consentimiento o aviso operativo visible antes de solicitar permiso;
- retencion y acceso definidos antes de datos reales.

Eventos minimos que podrian guardarse, si legal/privacidad lo validan:

- intento de fichaje con ubicacion disponible, no disponible, denegada o imprecisa;
- resultado aproximado `inside_radius`, `outside_radius`, `unknown` o `manual_fallback`;
- precision reportada por navegador solo como bucket;
- distancia solo como bucket relativo al radio configurado;
- motivo de fallback manual.

Decision G.2 de minimizacion:

- Usar `center_time_location_settings` como schema candidato de configuracion por centro, con `organization_id`, `center_id`, coordenadas del centro, radio, precision maxima, version de politica, aviso, retencion y auditoria de cambios.
- Usar `time_location_events` como schema candidato para eventos/evidencias minimizadas, con `organization_id`, persona, actor, centro, setting/politica, punch/record opcionales, resultado, buckets, fallback y `retain_until`.
- Guardar resultado asistido y buckets; no guardar distancia exacta ni coordenadas crudas persistidas del trabajador.
- `time_punches.metadata` podria guardar solo un snapshot minimizado del resultado para explicar el fichaje: version de politica, centro y resultado; buckets solo si se justifican. No coordenadas crudas ni JSON libre enviado desde formularios.
- `time_audit_events.metadata` no debe usarse para coordenadas GPS; la capa actual bloquea claves de ubicacion y esa proteccion no debe relajarse sin diseno especifico.
- Si una implementacion futura necesita coordenadas del trabajador para calcular el resultado, solo deben tratarse de forma transitoria y descartarse sin persistencia, logs ni auditoria generica. Persistirlas exigiria una decision legal/tecnica nueva.

Permisos, acceso y retencion candidatos:

- `owner` activa o desactiva la politica tenant-level.
- `owner`/`admin` podrian mantener configuracion por centro solo mediante capacidad/RPC explicita.
- `manager`, `center_manager`, `payroll_manager`, `staff` y `coach` no reciben permisos de configuracion por herencia.
- La persona afectada puede leer sus propios eventos minimizados.
- La gestion de fichaje puede ver evidencia minimizada vinculada a registros/correcciones si tiene permiso de fichaje; no ve coordenadas porque no se guardan.
- Representantes/Inspeccion quedan como exporte/acceso futuro controlado tras validacion legal, no como rol generico de app.
- Retencion candidata: `time_location_events` 90 dias para eventos con resultado/buckets y 30 dias para permiso denegado/no disponible/unsupported, salvo disputa, exporte o decision legal explicita. El fichaje canonico conserva su propia politica de retencion.

Reglas operativas candidatas:

- Geolocalizacion opcional activable por tenant; la configuracion inicial debe quedar reservada a `owner` y roles explicitamente autorizados.
- Ubicacion del centro configurable solo por roles con maximos permisos y validacion servidor de tenant.
- Radio inicial sugerido: 100m configurable, revisable por precision real y privacidad.
- Si el usuario esta dentro del radio y coincide con horario, la app puede asistir el fichaje segun el modo decidido.
- Si llega antes, no fichar todavia; al llegar la hora, revisar si sigue dentro.
- Si hay entrada activa, se puede proponer salida a la hora prevista solo si una fase posterior lo valida; G.1/G.2 no aprueban salida automatica.
- No fichar si esta en el box fuera de horario, porque puede estar entrenando.

Limitacion tecnica:

- En navegador/PWA no se debe asumir geolocalizacion fiable con app cerrada.
- Los permisos del navegador pueden denegarse o caducar.
- La precision en interiores puede ser mala, inestable o insuficiente.
- Para fichaje automatico en segundo plano hara falta evaluar fase nativa o wrapper movil, permisos iOS/Android, politicas de stores y privacidad.

Preguntas legales/privacidad antes de datos reales:

- Que base legal se invoca para ubicacion puntual?
- Como se informa finalidad, minimizacion y retencion?
- Confirmar que guardar solo resultado + buckets es proporcional al caso real.
- Cuanto tiempo se conserva evidencia de ubicacion y cuando debe anonimizarse o purgarse?
- Como se gestiona denegacion de permiso sin discriminar al trabajador?
- Quien puede ver evidencias de ubicacion y en que formato: trabajador, `owner`/`admin`/`manager`, representantes o Inspeccion?
- Como se corrige o disputa una evidencia de ubicacion imprecisa?
- Que se considera exceso proporcional frente a una mera ayuda operativa?

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
- E.2 implementa metadata documental minima en Postgres (`documents`, `document_versions`, `document_subjects`, `document_access_grants`) con RLS.
- E.3 crea `document-files` como bucket privado minimo y exige rutas internas tipo `documents/{organization_id}/{document_id}/versions/{document_version_id}/{asset_id}.{ext}`; upload y lectura dependen de `document_versions` y grants/sujeto/capacidad. `document-signature-evidence` sigue futuro para snapshots/evidencias.
- E.4 crea `document_access_events` como auditoria documental minima: registra actor, membership, documento/version, evento, resultado y metadata minimizada, sin guardar contenido documental, URLs publicas, signed URLs ni rutas Storage persistentes.
- E.5 crea rutas backend controladas de preview/descarga para `document_versions` privadas: validan sesion, tenant, permisos y estado antes de generar signed URLs cortas, y registran auditoria de acceso o denegacion cuando aplica. No crea UI documental, subida desde app, documentos firmables ni snapshots.
- Rutas internas candidatas pendientes de bucket: `signature-snapshots/{organization_id}/{document_id}/{request_id}/{evidence_id}.png` y `signed-documents/{organization_id}/{document_id}/{document_version_id}/{evidence_id}.{ext}`.
- Accesos a preview, descarga, cambios de grants, cambios de sensibilidad, reemplazos de version y exportaciones masivas son candidatos fuertes a auditoria. E.5 ya registra preview/descarga desde rutas controladas; una UI futura debe reutilizar esas rutas o mantener el mismo nivel de validacion y auditoria.
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
- E.1 separa la solicitud de firma futura (`document_signature_requests`) de la evidencia inmutable futura (`document_signature_evidences`); E.2 no implementa ninguna de esas tablas.
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

Decision H.1 2026-05-13:

- La PWA de BoxOps es instalacion/acceso rapido a la web responsive, no app nativa.
- No se registra service worker ni modo offline mientras no exista una politica segura de cache. No se deben cachear respuestas autenticadas, datos tenant-scoped, documentos, fichajes, firmas, signed URLs, exportes ni datos personales privados en cliente.
- La webapp/PWA no pedira ubicacion para fichar y no debe presentarse como solucion de geofencing/background location.
- Push notifications reales, background sync y notificaciones del sistema quedan fuera hasta una fase movil/push propia con permisos, privacidad y criterio de producto.
- PWA no sustituye app nativa o wrapper si el negocio exige geofencing fiable con app cerrada, background location o push nativo.

Decision H.2 2026-05-13:

- La auditoria mobile/PWA valida uso online basico en `/app`, `/app/time`, `/app/schedule`, `/app/coverage`, `/app/more` y `/app/account`, pero no convierte BoxOps en app nativa ni en sistema de cumplimiento laboral definitivo.
- La revision confirma que el copy de fichaje sigue diciendo sin geolocalizacion, sin payroll, sin horas extra aprobadas automaticamente y sin garantia legal definitiva.
- La deuda futura de stores, wrapper/nativo, push y geofencing requiere decision comercial, permisos del sistema operativo, politica de privacidad y revision legal separadas.

Decision H.3 2026-05-13:

- La recomendacion movil queda en tres tiempos: corto plazo web responsive + PWA online segura; medio plazo evaluar wrapper/nativo solo si el negocio lo exige; largo plazo geofencing/background location/push nativo con privacy/legal/stores.
- Opciones futuras aceptables sin implementar todavia: seguir web-only, mantener PWA web, crear wrapper Capacitor/Ionic, crear app React Native/Expo o crear app nativa especifica. Ninguna debe abrirse sin business case, presupuesto de mantenimiento y revision legal/privacidad.
- Costes base consultados en fuentes oficiales el 2026-05-13: Apple Developer Program 99 USD/ano (https://developer.apple.com/programs/) y Google Play Console 25 USD registro unico (https://support.google.com/googleplay/android-developer/answer/6112435). Revalidar tarifa, moneda, fiscalidad y condiciones antes de contratar.
- Store review no es solo subir binarios: requiere metadata, iconos/screenshots, cuentas demo o modo demo, builds firmadas, politicas de datos, privacidad accesible y respuestas coherentes sobre permisos/datos recogidos.
- Apple exige privacy policy en metadata de App Store Connect para apps iOS/macOS y respuestas de privacidad actualizadas (https://developer.apple.com/help/app-store-connect/reference/app-privacy); si se usa ubicacion, iOS requiere pedir autorizacion con textos de uso adecuados y elegir el nivel minimo necesario (https://developer.apple.com/documentation/corelocation/requesting-authorization-to-use-location-services).
- Google Play revisa de forma estricta background location: debe ser core functionality, con declaracion de permisos, disclosure prominente, politica de privacidad y, cuando aplique, video de demostracion (https://support.google.com/googleplay/android-developer/answer/9799150). Si puede hacerse en foreground o sin background location, esa debe ser la preferencia.
- Push nativo requiere consentimiento/permiso, baja o gestion de preferencias, fallback in-app y cuidado de contenido: no enviar datos laborales sensibles, documentos, firmas, signed URLs, payroll ni ubicacion en el payload.
- Offline real requiere politica segura previa. No se debe cachear en cliente respuestas autenticadas, datos tenant-scoped, documentos, fichajes, firmas, signed URLs, exportes ni evidencias de ubicacion sin diseno especifico.
- Geofencing fiable con app cerrada, background location y push del sistema son razones candidatas para elevar nativo/wrapper, pero no son promesa comercial ni cumplimiento legal definitivo.
- La separacion de deuda queda asi: bloqueante antes de piloto, ninguna nueva mobile/PWA; mejora recomendable, automatizar audit mobile y preparar metadata/privacy; deuda futura, stores, permisos nativos, geofencing/background location, push, offline seguro y QA por plataforma.

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
