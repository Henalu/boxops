# Validacion local por perfiles — 2026-09-07

## Entorno y alcance

Rama `codex/ajustes-validacion-ui`, propuesta <https://github.com/Henalu/boxops/pull/2>.
Las pruebas usan Chromium, la compilacion de produccion de Next.js en el puerto 3107 y exclusivamente Supabase local en `127.0.0.1:55321` (`supabase_db_boxops`).
Se crean siete cuentas sinteticas y dos organizaciones nuevas. No se resetea la base ni se sobrescriben usuarios existentes. No se aplica ninguna migracion remota.

La migracion `20260907081226_atomic_schedule_template_week.sql` queda activa en la base local para estos recorridos; no se registra una migracion remota ni se despliega a `main`.
Las credenciales, capturas y trazas permanecen en `.local-evidence/ui-validation/`, excluido de Git y de ESLint. Los datos de prueba permanecen identificados con `ui-validation-*` para poder repetir los recorridos.

## Matriz de comprobacion

Resultado: 20/20 recorridos de perfiles y operativa, 11/11 casos documentales y 3/3 paneles operativos, sin casos omitidos. Tras ajustar el aviso de plantillas, se repiten los tres casos de aplicacion/reemplazo con resultado 3/3. Son 34 casos distintos; las repeticiones no se suman al total.

Repeticion posterior del mismo dia: los 20 recorridos pasan en una ejecucion completa en serie y los 14 casos documentales/paneles pasan por separado. Se corrige una carrera de la prueba al cerrar soporte, esperando la respuesta antes de volver al horario; ese caso pasa tambien tres repeticiones adicionales. Las ejecuciones autenticadas comparten cuentas y deben ejecutarse en serie: el logout documental puede invalidar las otras sesiones. Detalle en `2026-09-07-guardrail-recheck.md`.

Compilacion de produccion del corte inicial y tipos correctos. Este segundo corte cambia pruebas/documentacion y elimina un helper sin uso; no cambia el codigo de la aplicacion compilada. ESLint queda sin errores ni warnings tras eliminar ese helper. Auditoria npm de produccion: cero vulnerabilidades. Las 35 aserciones de la migracion atomica vuelven a pasar en Postgres con rollback.

Se conservan 37 capturas y su manifiesto SHA-256 en `.local-evidence/ui-validation/`; el informe HTML documental se conserva en `documents-report/`. Al cerrar, el fixture no tiene sesiones de soporte activas ni bloques generados de las plantillas de prueba.

| Perfil | Recorrido |
| --- | --- |
| Propietario | Login, ocho pantallas en escritorio/movil, detalle, asignar/retirar entrenador, aplicar/repetir/reemplazar plantilla, error de solape, filtro por centro y logout |
| Administrador | Ocho pantallas en escritorio/movil, asignacion y plantillas desde movil, subida documental y acceso a archivos |
| Responsable | Ocho pantallas en escritorio/movil, asignacion y plantillas, documentos segun permisos explicitos |
| Entrenador | Ocho pantallas en escritorio/movil, Mi horario, ausencia de controles de gestion, estadisticas denegadas y archivos segun permisos |
| Atleta | Acceso pendiente en las rutas operativas BoxOps, sin datos ni acciones de gestion |
| Propietario de otra organizacion | Rechazo de datos ajenos por URL y de preview/descarga documental directa |
| Soporte | Apertura real desde Console, acceso operativo temporal, documentos restringidos, cierre y perdida de acceso |

Las pantallas recorridas son Inicio, Horario, Cobertura, Plantillas, Equipo, Centros, Documentos y Mi cuenta. Se comprueban contenido cargado, errores de JavaScript/respuestas 500 y desbordamiento horizontal en 1280 y 390 px.

Los casos de plantillas comprueban en Postgres los IDs de bloques y asignaciones antes/despues: un reemplazo con solape conserva el horario anterior; el reintento tras retirar el conflicto sintetico sustituye la plantilla; repetir una aplicacion mantiene los IDs. La retirada del conflicto se prepara en el fixture; aplicar, confirmar y reintentar se hace mediante los formularios reales.

Los casos documentales suben archivos TXT sinteticos por UI, comprueban metadata/version/Storage privado y auditoria, prueban grants de metadata/preview/download y rechazos por rol y tenant. Un caso pulsa Preview, comprueba el texto en la nueva ventana, pulsa Descargar y verifica nombre y contenido del archivo recibido.

## Fallos corregidos

1. El repositorio usaba navegacion Next.js para los enlaces de archivo. Se observaron peticiones `next-router-prefetch: 1` que generaban eventos de acceso sin clic. Preview y Descargar usan ahora enlaces nativos; se conserva el control del backend y los contadores de auditoria deben corresponder a las acciones ejecutadas.
2. Soporte podia abrir la estructura vacia de Documentos y recibia errores de carga por permisos. Ahora la pagina muestra una restriccion explicita y un enlace al horario antes de consultar carpetas o documentos.
3. Los smokes documentales buscaban un desplegable eliminado y etiquetas antiguas sin acentos. Se adaptan al formulario visible actual. La comprobacion de campos documentales distingue `signedUrl` del campo `avatarSignedUrl: null` del shell, manteniendo las comprobaciones de rutas y datos de Storage.
4. ESLint recorria los recursos JavaScript generados por el informe de Playwright dentro de `.local-evidence`. Ese directorio generado queda excluido; los archivos de pruebas siguen comprobados.
5. El aviso de sincronizacion de plantillas afirmaba que no se habian guardado cambios, mientras su descripcion confirmaba que la plantilla si estaba guardada. El titulo distingue ahora plantilla guardada de horario sin actualizar; las pruebas de solape lo verifican.

## Repetir

Con el Supabase local existente en marcha y `.env.local` apuntando al puerto 55321:

```powershell
# Solo para crear un fixture nuevo; no es necesario antes de cada repeticion.
node scripts/prepare-local-ui-validation.mjs --create
npm run build
node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3107
```

En otra terminal, ejecutar en serie:

```powershell
npm run test:ui:local
node scripts/run-local-ui-validation.mjs --smoke tests/smoke/documents-repository-surface.spec.ts --grep "documents minimal upload runtime smoke"
npm run test:db:template-atomic
node scripts/run-local-ui-validation.mjs --smoke tests/smoke/operational-detail-panels.spec.ts
```

El runner documental utiliza `http://localhost:3107`: Playwright permite las cookies Secure locales con ese nombre, mientras que su cliente HTTP auxiliar las omite sobre `http://127.0.0.1`. No se modifican las cookies ni la politica de autenticacion del producto para superar la prueba.

## Limites de entrega

- Esta evidencia valida los recorridos descritos en local; no certifica toda la aplicacion, otros navegadores, concurrencia masiva, email real ni produccion.
- BoxWod no esta configurado como destino en este entorno. El contrato del enlace y las cookies compartidas tienen pruebas separadas; el recorrido HTTPS entre ambas aplicaciones con sesion compartida sigue pendiente en su entorno destino.
- Los 22 fallos anteriores de comprobaciones de codigo fuente quedan corregidos. La ampliacion pasa 208 casos sin omisiones; alcance y ajustes en `2026-09-07-guardrail-recheck.md`. No equivale a ejecutar todas las suites runtime historicas del repositorio.
- Antes de integrar en `main`, aplicar y comprobar la migracion en Supabase destino. `main` activa automaticamente el despliegue de Vercel. Las previews no se han utilizado para modificar datos.
