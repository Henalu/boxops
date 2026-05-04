# Legal And Privacy Notes - BoxOps

Notas iniciales para evitar decisiones tecnicas peligrosas. No son asesoramiento legal.

## Fichaje

El fichaje puede tener implicaciones laborales. No debe diseñarse como "la app decide todo" sin validacion legal/operativa.

Principios:

- Fichaje manual primero.
- Correcciones posibles.
- Motivo obligatorio en correcciones.
- Aprobacion/rechazo admin.
- Historial auditable.
- Exportable/revisable, no opaco.

## Geolocalizacion

La geolocalizacion solo debe usarse como comprobacion puntual vinculada a un turno o bloque asignado.

No permitido:

- Seguimiento continuo.
- Historial de movimientos.
- Fichar solo por entrar al box.
- Geofence permanente en segundo plano sin necesidad clara.

Condiciones minimas para sugerir o iniciar fichaje asistido:

- Usuario con turno/bloque asignado.
- Centro correcto.
- Ventana cercana al inicio o fin.
- Sin fichaje activo duplicado.
- Consentimiento y explicacion clara al usuario.

## Horas Extra

BoxOps debe tratar las horas extra como tracking interno pendiente de validacion.

No debe presentarse como:

- Generador de nominas.
- Calculadora fiscal.
- Sistema legal definitivo de payroll.

Estados recomendados:

- `detected`
- `pending_validation`
- `validated`
- `compensated`
- `paid`
- `rejected`
- `closed`

## Nominas Y Documentos Laborales

Para MVP, documentos laborales son repositorio/subida/consulta.

Reglas:

- Control de permisos estricto.
- No mezclar visibilidad de documentos sensibles con documentos generales del box.
- Registrar quien sube y quien puede ver.
- Valorar confirmacion de lectura para documentos importantes.
- Definir retencion y borrado antes de datos reales sensibles.

## Firmas De Documentos

La firma dibujada en perfil puede servir como firma/confirmacion interna de producto, pero no debe presentarse como firma electronica avanzada o cualificada sin validacion legal previa.

Reglas minimas antes de implementarla:

- Consentimiento claro del usuario al crear su firma dibujada.
- La firma debe guardarse en Storage privado o mecanismo equivalente, nunca como imagen publica.
- Firmar un documento debe crear evidencia auditada: documento/version, firmante, usuario autenticado, fecha y estado.
- Debe conservarse un snapshot de la firma usada en esa firma concreta, porque la firma del perfil puede cambiar despues.
- Si se modifica el documento, las firmas anteriores no deben parecer aplicadas automaticamente a la nueva version.
- Los documentos firmados deben tener retencion, acceso y borrado definidos antes de usar datos laborales reales.
- Revisar si se necesita proveedor especializado para contratos, anexos u otros documentos con exigencia legal fuerte.

## Datos Sensibles

Datos potencialmente sensibles:

- Documentos laborales.
- Nominas.
- Contratos.
- Bajas/permisos.
- Fichajes.
- Correcciones de fichaje.
- Ubicacion puntual.
- Certificaciones con archivos personales.
- Firmas dibujadas y documentos firmados.

Implicaciones tecnicas:

- RLS desde la primera migracion.
- Buckets de Storage privados.
- URLs firmadas para documentos privados.
- Auditoria de accesos cuando sea necesario.
- Separar documentos laborales de programacion/clases.

## Riesgos A Revisar Antes De Implementar

- Retencion de datos de fichaje y documentos.
- Consentimiento para geolocalizacion.
- Exactitud de geolocalizacion en centros cercanos o interiores.
- Responsabilidad si el sistema calcula mal horas extra.
- Permisos de managers por centro.
- Validez legal y retencion de firmas documentales.
- Acceso de coaches a horarios de otros compañeros.
