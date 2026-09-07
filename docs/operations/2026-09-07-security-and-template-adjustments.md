# Ajustes de seguridad y aplicacion de plantillas — 2026-09-07

## Cambio

- Next.js y eslint-config-next: 16.3.4. PostCSS: override desde 8.5.28. Dependencias transitivas actualizadas con `npm audit fix`, sin `--force`.
- shadcn pasa a devDependencies porque es una herramienta para generar componentes, no una dependencia de las pantallas en ejecucion.
- `applyScheduleTemplateWeek` invoca una unica funcion Postgres que resuelve la plantilla y guarda reemplazo, bloques y asignaciones en una transaccion. Un fallo no deja bloques nuevos sin asignar ni elimina el horario reemplazado.
- La RPC usa SECURITY INVOKER, RLS y roles owner/admin/manager o soporte activo. No utiliza service role. Los bloqueos de solape/certificacion y las claves foraneas existentes siguen activos.
- La aplicacion se serializa por organizacion/semana y bloquea la fila de plantilla durante la transaccion. Repetir una aplicacion exitosa conserva sus bloques y asignaciones.

## Verificacion reproducible

`npm run test:db:template-atomic` exige el contenedor local existente `supabase_db_boxops`. Carga la migracion candidata y fixtures sinteticos en una unica transaccion y termina con ROLLBACK. No resetea la base, no crea usuarios persistentes ni accede a proyectos remotos. Si una asercion falla, psql cierra la conexion y Postgres revierte la transaccion.

Casos comprobados: aplicacion con entrenador, repeticion sin duplicados, solape sin bloques residuales, reemplazo fallido que conserva IDs/asignaciones previas, reemplazo correcto, proteccion de bloques referenciados por BoxWod, bloques sin requisito o vacantes, vigencia parcial, plantilla vacia/borrador, certificacion inactiva, coach inactivo, roles owner/admin/manager, rechazo de coach/athlete, referencias y acceso cross-tenant, soporte activo/finalizado y ausencia de actor autenticado.

`tests/smoke/schedule-template-application.spec.ts` comprueba la llamada al adaptador, normalizacion de semana, intencion de reemplazo, errores de la RPC y payloads inesperados. La garantia de rollback se comprueba en Postgres, no mediante mocks.

## Resultado local

- `npm audit` completo y `npm audit --omit=dev --audit-level=high`: cero vulnerabilidades.
- `npm run build`: correcto con Next.js 16.3.4; typecheck correcto y lint con el unico warning preexistente de `scripts/setup-local-e2e-auth.mjs`.
- `npm run test:db:template-atomic`: correcto. Consulta posterior confirma cero organizaciones fixture y que la funcion candidata no quedo persistida.
- 42 pruebas seleccionadas de aplicacion, disponibilidad/cobertura, BoxWod y conector ChatGPT: correctas.
- 23 smokes de Auth publica y redireccion anonima: correctos contra el servidor local de produccion en puerto 3107. Login verificado tambien en navegador, sin errores reportados.
- Ampliacion a `tenant-rls-negative-local.spec.ts` y `templates-day-selection.spec.ts`: 97 passed / 22 failed. Una copia aislada de HEAD `ae4691d`, con los cambios previos del usuario restaurados y sin este corte, reproduce los mismos 22 casos fallidos. Son deuda anterior de las comprobaciones de codigo fuente; no se han omitido ni relajado para declarar verde la suite global.

La suite global sigue pendiente de saneamiento; estos resultados solo cierran las comprobaciones indicadas.

## Orden de despliegue

1. Ejecutar las verificaciones locales, la compilacion y los smokes relevantes.
2. Aplicar `supabase/migrations/20260907081226_atomic_schedule_template_week.sql` mediante el procedimiento de migraciones del entorno destino. Es aditiva y compatible con el codigo anterior.
3. Confirmar que la RPC existe con SECURITY INVOKER y EXECUTE para authenticated, sin EXECUTE para anon/PUBLIC.
4. Desplegar el codigo y verificar con usuarios QA autorizados una aplicacion, un reintento y un conflicto controlado.

En este corte la migracion solo se prueba dentro de transacciones locales con rollback; no se activa ni se registra en ningun entorno persistente. El despliegue de la aplicacion requiere el paso 2. Si hay que revertir el codigo, la RPC aditiva puede permanecer; no requiere borrar datos.

## Limites

- La unidad atomica es una semana. Un rango de varias semanas conserva su recorrido actual; no se promete rollback global del rango.
- La sincronizacion de ediciones sobre bloques ya generados mantiene su implementacion actual y queda para un corte separado.
- No cambia la politica de reemplazo ni fuerza la eliminacion de bloques con referencias protegidas, incluidas sesiones BoxWod.
- La auditoria operativa de las acciones mantiene el mecanismo existente; no se convierte en parte de la nueva transaccion.
- Las pruebas locales no certifican Auth/email, datos reales ni el despliegue remoto.
