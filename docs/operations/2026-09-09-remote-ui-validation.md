# Validacion remota - 2026-09-09

La PR #2 se ha probado autenticada en Vercel Preview contra el Supabase compartido del hub. Este informe actualiza los pendientes remotos de los informes del 7 de septiembre. No se ha integrado en main ni certificado produccion.

## Entorno y migracion

- Commit probado: `7ba2acf6d0b7c21c0e0d7bb641ebc2ce01748b1c`.
- Deployment: `dpl_G9b8ZBoJ9ktUgv8kBiFXWyoMp1X5`.
- URL: https://boxops-git-codex-ajustes-validacion-ui-henalus-projects.vercel.app
- Supabase: `ccniekhbzvmsyhktprpx`, hub compartido; no existe una base QA remota separada.
- Aplicada `20260907081226_atomic_schedule_template_week.sql` mediante el complemento Supabase. Historial remoto: 73 migraciones, alineado con el repositorio.
- El complemento registro inicialmente la version `20260909095110`. Se normalizo a `20260907081226` mediante una actualizacion acotada del historial, comprobando ausencia de colision y coincidencia exacta del SQL (normalizando saltos de linea). No se ejecuto dos veces la migracion.
- Funcion comprobada con permisos de invocador, `search_path=public, pg_temp`, sin ejecucion anonima y con ejecucion para authenticated.
- Las 35 aserciones de `supabase/snippets/atomic-schedule-template-week-verification.sql` pasan contra la funcion instalada en remoto, dentro de una transaccion con rollback. Cubren roles, soporte activo/cerrado, tenant, certificaciones, solapes, reintentos, reemplazos y referencias BoxWod. Cero organizaciones residuales de esta regresion.

## Navegador autenticado

Se crearon seis cuentas temporales y dos organizaciones sinteticas. Los recorridos se ejecutaron en serie mediante la UI, comprobando las escrituras relevantes en la base de datos.

| Perfil | Comprobacion | Resultado |
| --- | --- | --- |
| Owner | Activar plantilla, repetir guardado y comparar identificadores | Un bloque y una asignacion; reintento sin duplicados |
| Owner | Sustituir una plantilla por otra con entrenador ocupado | Banner explicito de horario sin actualizar; horario anterior e identificadores conservados |
| Owner | Retirar la asignacion que causaba el solape y repetir sustitucion | Nueva plantilla aplicada con su asignacion; anterior sustituida |
| Owner | Cobertura, Equipo y Documentos | Carga correcta |
| Admin | Asignar entrenador desde Horario a 390 x 844 | Escritura confirmada en SQL |
| Admin | Plantillas y Documentos en movil | Carga correcta; comprobacion de ancho sin desbordamiento horizontal |
| Manager | Horario, Cobertura y Plantillas; confirmar sustitucion | Un bloque y una asignacion de la plantilla elegida |
| Manager | Documentos | Consulta disponible; control de subida ausente |
| Coach | Mi horario y detalle del bloque asignado | Bloque visible; controles de edicion y asignacion ausentes |
| Coach | Estadisticas de gestion y Documentos | Estadisticas denegadas; repositorio carga |
| Atleta | Inicio y acceso directo a Horario, Equipo y Documentos | Acceso pendiente; sin datos operativos de la organizacion |
| Owner de otro tenant | Solicitar organizacion A en URL de Horario y Documentos | Organizacion no disponible; sin datos ajenos; acceso correcto a su propia organizacion B |

Se verifico el cierre de sesion antes de cambiar de perfil. Las capturas y lecturas del navegador documentan la prueba interactiva; las credenciales y fixtures permanecen en `.local-evidence/remote-ui-20260909/`, ignorado por Git. El banner de error desaparece a los diez segundos por diseno; se reprodujo y capturo antes de su cierre.

La consulta de logs del deployment entre 09:12 y 10:12 UTC no devuelve respuestas 5xx. Esto complementa los recorridos observados, no certifica todas las rutas historicas.

## Limpieza y limites

- Se bloquearon las seis cuentas hasta 2099 y revocaron sus sesiones y refresh tokens: ambos contadores finales son cero.
- Las dos organizaciones sinteticas y sus memberships quedaron inactivas; coach inactivo, plantillas en borrador y bloques cancelados. Se conserva el registro sintetico para trazabilidad. No se modificaron organizaciones reales.
- Los avisos de seguridad Supabase permanecen iguales antes y despues: dos tablas RLS sin politicas, siete funciones security definer ejecutables por anon, 148 por authenticated y proteccion de contrasenas filtradas desactivada. Son avisos preexistentes; esta validacion no los resuelve ni declara el proyecto libre de advertencias.
- Soporte tuvo cobertura SQL remota y UI local previa. No se creo una cuenta de soporte global remota.
- En remoto se verificaron carga y permisos visibles de Documentos; no se repitieron subida, apertura y descarga de archivos. Esos recorridos pertenecen a la evidencia local previa.
- BoxWod sigue sin destino publicado: la sesion HTTPS compartida queda pendiente de su despliegue.
- Main sigue sin cambios. El siguiente paso de entrega es revisar e integrar la PR #2, que activa automaticamente Vercel, y comprobar el despliegue de produccion.
