# Correccion de comprobaciones pendientes — 2026-09-07

Continuacion de la PR [#2](https://github.com/Henalu/boxops/pull/2), en `codex/ajustes-validacion-ui`.

## Cambios

Se reproducen los 22 fallos anteriores y se contrasta cada comprobacion con el codigo y las migraciones actuales. Se actualizan las expectativas obsoletas; no se cambian roles, RLS, cookies, consultas del producto ni datos remotos para superar las pruebas.

- Textos visibles: tildes, signos de apertura y saltos de linea.
- Plantillas: el antiguo boton de aplicacion fue sustituido por guardar/sincronizar. Se comprueban estado activo, envio pendiente, confirmacion de reemplazo y recuperacion de archivadas; SQL y UI comprueban la aplicacion real y su rollback.
- Navegacion: filtros de centros, tipos de actividad, carpetas y editor; rutas anidadas como `/app/settings/billing`; dashboard de soporte y proteccion de `/console`.
- Identidad: IDs del DOM y asociaciones de etiquetas no equivalen a nombres visibles. Email y notas mantienen una lista de superficies autorizadas, sin fijar cuantas veces aparece el mismo control. Cada campo de notas sigue comprobando limite y contexto operativo.
- Avatar: la firma de su URL en el shell se verifica por organizacion, usuario propio, perfil, tipo avatar y caducidad; soporte no accede a esos datos.
- Auth privilegiada: alta inicial por `platform_owner`, cambio obligatorio de contrasena y limpieza limitada al usuario recien creado. El conector usa la clave publica y la sesion vinculada, sin Auth Admin.
- Conector: su origen OAuth permitido no es una llamada a un proveedor de IA. La deteccion de claves y URLs firmadas permanece activa; el token ficticio de una prueba de BoxWod se construye con `URLSearchParams`.

La ampliacion identifica otras diez pruebas desactualizadas: facturacion, impacto y trazabilidad de ausencias, cuatro cortes de programacion documental, repositorio documental, horas extra y jornadas previstas. Se alinean con las superficies actuales. La eliminacion de jornadas ya existe desde la migracion `20260608190904`; ahora se comprueban confirmacion, limite, IDs y organizacion, junto con los roles de su politica DELETE.

Se elimina una funcion sin uso del preparador antiguo de Auth, que causaba el warning de ESLint. No se ejecuta ese preparador ni un reset.

## Verificacion

- Comprobaciones ampliadas de codigo, helpers y redireccion anonima de Console: **208/208**, sin omisiones.
- Auth publica y redirecciones anonimas de BoxOps: **23/23**, sin omisiones.
- Recorridos de siete perfiles, dos organizaciones y escritorio/movil: **20/20**, en una ejecucion completa en serie y sin omisiones.
- Cierre de soporte: **3/3 repeticiones adicionales**, sin omisiones; no se suman como casos distintos a los 20 anteriores.
- Documentos y paneles operativos: **14/14**, sin omisiones; incluyen subida, preview, descarga, permisos y navegacion de detalles.
- Migracion atomica en Postgres local: **35 aserciones correctas**, con rollback completo.
- TypeScript y ESLint: correctos, sin errores ni warnings.
- Auditoria npm de dependencias de produccion: cero vulnerabilidades.

La repeticion detecta una carrera en la prueba de soporte: `page.goto` se ejecutaba antes de recibir la respuesta del cierre. La traza muestra el POST sin respuesta recibida y Postgres confirma la sesion terminada. La prueba espera ahora la redireccion `support-session-ended` y comprueba que no queda soporte activo antes de intentar entrar de nuevo.

Una ejecucion simultanea de pruebas documentales y de perfiles con las mismas cuentas produjo dos redirecciones a login, coincidiendo con los cierres de sesion del recorrido documental. Las suites autenticadas deben ejecutarse **en serie**; no se relaja la autenticacion ni se amplian los tiempos para ocultar el problema.

Para repetir las comprobaciones ampliadas, con BoxOps local en el puerto 3107:

```powershell
$env:E2E_BASE_URL = "http://localhost:3107"
npm run test:smoke -- --workers=1 --grep "guardrails|BoxWod|connector|password policy|navigation role visibility|schedule coach availability|schedule zero-required coverage|schedule-template-application"
```

Los comandos de los recorridos autenticados estan en [el informe de UI](2026-09-07-ui-validation.md). Evidencia local ignorada: `.local-evidence/expanded-checks-final.json`, `public-auth-final.json`, `document-ui-recheck.json`, `ui-final.json` y capturas/trazas dentro de `ui-validation/`. No se suben cuentas, sesiones ni archivos privados a Git.

## Entrega y BoxWod

El build inicial terminaba correctamente, pero `/login` devolvia **500** por `Missing Supabase environment variables.`. Tras iniciar el usuario sesion en Vercel, se confirma en la UI que las dos variables publicas estaban limitadas a Produccion. Se habilitan `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` tambien en Preview, conservando sus valores y el Supabase del hub `ccniekhbzvmsyhktprpx`. Las claves privilegiadas y las conexiones Postgres siguen solo en Produccion. No se guardan valores de claves en Git.

Se redespliega exclusivamente el commit `2c7d923` de `codex/ajustes-validacion-ui`, sin cache de build: deployment `dpl_AoucztbJdyWcqcyipr6LWPXWRRpF`, estado READY. Preview comprobada: [BoxOps](https://boxops-5jodcoqvi-henalus-projects.vercel.app/login).

Comprobacion real en navegador, con sesion Vercel para superar su proteccion de previews y sin sesion BoxOps, el 2026-09-07 entre las 11:25 y las 11:28 UTC:

| Recorrido | Resultado |
| --- | --- |
| `/login` | Formulario visible; GET 200 en logs de Vercel |
| Credenciales ficticias | Redireccion con `error=invalid-credentials`; mensaje de rechazo visible |
| `/app` sin sesion | 307 a `/login?redirectTo=%2Fapp` |
| `/console` sin sesion | 307 a `/login?redirectTo=%2Fconsole` |
| Enlace de recuperacion | Formulario `/forgot-password` visible; GET 200, sin enviar correo |

Los logs del nuevo deployment no registran errores/fatales durante el recorrido. El login de produccion mantiene 200. La peticion del conector a la nueva preview devuelve un 302 de autenticacion de Vercel: no se cuenta como redireccion de BoxOps. La evidencia de la aplicacion procede del navegador y los logs de sus funciones.

El bloqueo de configuracion queda resuelto. La validacion remota cubre este acceso publico y sus rechazos; no sustituye los 34 casos por perfiles ejecutados en local ni verifica operaciones sobre datos reales.

El usuario confirma que BoxWod todavia no esta publicado ni tiene dominio. En el equipo Vercel conectado aparece BoxOps con preview READY; no aparece un proyecto BoxWod. La prueba HTTPS de sesion entre ambas apps queda pendiente de publicar BoxWod y concretar sus dominios.

La estrategia actual de cookie compartida necesita subdominios de un dominio propio controlado por el hub. Los dominios independientes `*.vercel.app` no permiten compartir una cookie con Domain=`vercel.app`, segun [Vercel](https://vercel.com/kb/guide/can-i-set-a-cookie-from-my-vercel-project-subdomain-to-vercel-app). Esto no impide publicar y verificar BoxOps por separado.

Antes de integrar en `main`, sigue siendo necesario aplicar y comprobar la migracion atomica en Supabase destino. El complemento confirma 72 migraciones remotas frente a 73 del repositorio; falta solamente `20260907081226_atomic_schedule_template_week`, y una consulta de `pg_proc` confirma que `apply_schedule_template_week` aun no existe. Solo hay rama Supabase `main`, sin base QA separada. Este corte no aplica migraciones remotas, no modifica datos operativos ni integra en `main`.
