# Tenant Readiness Checklist - BoxOps

Estado 2026-05-18. Este documento corresponde a B.4: cierre de base SaaS y permisos de tenant para beta interna. La revision asistida del 2026-05-18 deja el tenant readiness real bloqueado por falta de acceso/tenant controlado, sin inventar evidencia.

Es una checklist de producto/operacion. No implementa permisos por centro, logo real, onboarding automatico, billing, documentos visibles, payroll, IA, app nativa, geofencing ni UI nueva.

## Objetivo

Dejar claro que debe tener un tenant para poder activarse de forma controlada sin convertir el primer tenant en software a medida:

- configuracion minima de organizacion;
- roles y capacidades con limites claros;
- centros, personas, tipos, plantillas y datos iniciales suficientes;
- invitaciones y Auth/email ya validados por S.8;
- operativa diaria validada con OD.1/I.32 cuando el tenant vaya a beta interna;
- marca ligera segura, sin rebranding libre;
- decisiones pendientes para v1 comercial.

## Estado B Actual

B.1 ya implementa configuracion minima:

- `/app/settings` existe como superficie de configuracion;
- `owner` y `admin` pueden editar nombre visible de organizacion y `organizations.theme_config.accentColor`;
- el tema se resuelve por organizacion activa;
- estados criticos, error y foco no son tematizables;
- logo real queda pendiente.

B.2 ya implementa roles compatibles:

- `owner` y `admin` controlan configuracion global y accesos;
- `manager` gestiona operativa diaria tenant-wide de MVP 1;
- `coach` conserva lectura/uso operativo y funciones personales;
- `staff`, `center_manager`, `document_admin` y `payroll_manager` quedan reconocidos, pero sin permisos especializados por herencia.

B.3 ya implementa invitaciones de equipo por email:

- `team_invitations` tenant-scoped;
- tokens hasheados;
- aceptacion por sesion/email;
- Resend configurable por entorno;
- sin `service_role` en `src`;
- flujo UUID reservado a avanzado/debug.

## Revision B.4 2026-05-18

Resultado: `bloqueado por acceso/tenant real`. Se releyo el entorno sin imprimir secretos ni valores y se reviso el codigo disponible, pero no hay acceso real suficiente para confirmar que BoxOps puede activar ahora un tenant controlado o un segundo tenant QA/staging.

Hallazgos redacted:

- `.env.local` existe, esta ignorado por git y no esta trackeado.
- `NEXT_PUBLIC_SITE_URL` y `NEXT_PUBLIC_SUPABASE_URL` clasifican como URLs locales; no hay URL QA/staging en `E2E_BASE_URL`, `QA_APP_URL`, `STAGING_APP_URL`, `APP_QA_URL`, `APP_STAGING_URL` ni `VERCEL_URL`.
- No hay `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_URL`, `DATABASE_URL`, `POSTGRES_URL` ni `SUPABASE_SERVICE_ROLE_KEY` disponibles en `.env.local` o proceso.
- `npx supabase` esta disponible, pero `projects list` no devuelve acceso autenticado a proyectos desde este entorno.
- No hay `QA_TENANT_ID`, `QA_ORGANIZATION_ID`, `STAGING_TENANT_ID`, `STAGING_ORGANIZATION_ID`, dataset QA/staging ni credenciales E2E por rol para `owner`, `admin`, `manager` y `coach`.
- Hay configuracion local de Resend/Email de app, pero no hay SMTP/Auth real verificable desde este entorno ni evidencia de invitacion, aceptacion o reset reales.
- El codigo mantiene configuracion minima de tenant en `/app/settings`: nombre visible y `organizations.theme_config.accentColor`, con fallback si no hay acento.
- La resolucion de tenant sigue pasando por `organization_memberships`, `getActiveMemberships(...)` y `resolveActiveOrganization(...)`; si hay varias memberships activas exige `organizationId`.
- `owner` y `admin` gestionan configuracion global/accesos; `manager` queda como gestion operativa tenant-wide; `coach` conserva uso operativo/personal.
- `center_manager` aparece reconocido como rol futuro, pero no esta incluido en los arrays de gestion de `src/lib/auth/permissions.ts`; `supabase/migrations/00004_app_role_permission_alignment.sql` retira permisos globales de escritura heredados de la primera migracion para centros, equipo, tipos, plantillas, bloques y asignaciones. La RLS real de un proyecto QA/staging no se puede verificar sin acceso.
- No se puede confirmar presencia real de organizacion, centros controlados, usuarios por rol, tipos, semana/plantilla inicial, huecos ni dataset operativo controlado.
- No se detecta hardcode de STL, `service_role`, IA funcional ni APIs web prohibidas en `src` durante la revision local.

Deuda bloqueante para activar un tenant controlado:

- acceso Supabase QA/staging o real con project/ref o DB URL gestionado fuera del repo;
- URL publica QA/staging de la app;
- tenant/organizacion QA/staging controlada;
- owner/admin real operativo y credenciales E2E por rol;
- centros, usuarios/coaches, tipos, plantilla/semana y huecos revisados por responsable operativo;
- Auth Site URL, Redirect URLs, password policy y SMTP/Resend reales verificados;
- invitacion, aceptacion y reset reales con email interno controlado;
- evidencia redacted fuera del repo;
- OD.1/I.32 y F.15 ejecutados o bloqueados explicitamente segun el alcance de beta.

Estado correcto: `bloqueado`, no `listo para beta interna`. Esta revision no crea UI, migraciones, permisos por centro, onboarding guiado, billing, documentos firmables, subida visible, payroll, IA, geolocalizacion, push, service worker ni CacheStorage.

## Obligatorio Para Beta Interna

Un tenant puede entrar en beta interna controlada solo si cumple:

- organizacion creada con nombre visible generico, sin hardcode de marca en `src`;
- al menos un `owner` o `admin` real operativo;
- al menos un `manager` si la operativa diaria no la lleva owner/admin;
- al menos un `coach` vinculado a persona/ficha cuando vaya a probar horario propio;
- centros reales activos con nombre, slug, zona horaria y estado revisados;
- tipos de actividad reales con nombre, categoria, color valido si aplica y `required_coaches` revisado;
- configuracion minima de tema con fallback valido aunque no haya acento;
- invitaciones reales probadas segun S.8 antes de invitar usuarios del tenant;
- datos iniciales de horario/plantillas validados por responsable operativo;
- checklist OD.1/I.32 ejecutado o bloqueo registrado para Horario, Plantillas, Asignaciones, Cobertura, Solicitudes, Ausencias, Eventos, Jornada prevista e Inicio por rol;
- checklist F.15 ejecutado o bloqueo registrado si el tenant va a probar fichaje web en beta interna;
- smoke anonimo y autenticado por rol disponible o bloqueo registrado;
- `rg -n "STL" src` sin coincidencias;
- evidencia de readiness guardada fuera del repo si contiene datos reales.

No es obligatorio para beta interna:

- logo real;
- colores por centro;
- permisos por centro;
- `center_manager` activo;
- onboarding automatico de nuevos boxes;
- billing;
- documentos visibles o firmables;
- app nativa, push, geofencing o IA.

## Configuracion Minima Por Tenant

Antes de activar un tenant, revisar:

| Area | Minimo beta interna | V1 comercial |
|---|---|---|
| Organizacion | Nombre visible, estado operativo, `theme_config` valido o vacio | Flujo guiado para crear/editar datos base |
| Centros | Centros activos con timezone y slug revisados | Importacion/carga guiada y validacion de duplicados |
| Usuarios | `owner`/`admin`, `manager` si aplica y coaches iniciales | Alta guiada, invitaciones por lote si se justifica |
| Roles | Roles B.2 sin permisos por centro | Matriz final por capacidades y posible alcance por centro |
| Tipos | Catalogo inicial de actividades y `required_coaches` | Categorias configurables y defaults auditables |
| Horario | Semana/plantilla validada por responsable operativo | Importacion guiada y validacion asistida, sin IA obligatoria |
| Operativa diaria | OD.1/I.32 ejecutado o bloqueos diarios registrados | Runbook repetible, smokes por rol y soporte operativo |
| Fichaje web | F.15 ejecutado si entra en beta: manual, correcciones, cierre, aprobacion, avisos y CSV interno | Revision legal/retencion/accesos/exporte definitivo si se promete cumplimiento laboral |
| Tema | Acento opcional seguro, fallback BoxOps | Logo privado y colores por centro solo si aportan claridad |
| Email/Auth | S.8 pasado en real/staging | Dominios/remitentes por entorno y soporte operacional |
| Auditoria | Purga S.1 real o fallback temporal registrado | Job real, alertas y revision de crecimiento |

## Roles Y Limites

| Rol | Beta interna | No debe heredar |
|---|---|---|
| `owner` | Configuracion global, accesos y operativa amplia del tenant | Payroll, documentos sensibles, firma por otra persona o lectura global de todo documento privado sin grant/capacidad |
| `admin` | Configuracion global compatible, accesos, equipo y operativa MVP 1 | Payroll, documentos sensibles o permisos por centro implicitos |
| `manager` | Operativa diaria tenant-wide: centros, tipos, equipo operativo, horario, plantillas, cobertura y revisiones operativas | Configuracion global, altas/roles de membership, billing, documentos sensibles, payroll o permisos por centro implicitos |
| `coach` | Uso operativo propio, lectura permitida, horario, solicitudes, fichaje y funciones personales | Mutaciones administrativas, cola tenant-wide sensible o acceso documental sin grant |
| `staff` | Futuro trabajador no coach | Ningun permiso nuevo por herencia en B.4 |
| `document_admin` | Futuro rol documental explicito | Gestion operativa, payroll o lectura documental fuera de grants/capacidades |
| `payroll_manager` | Futuro rol payroll/legal separado | Operativa diaria, horas extra aprobadas por herencia o documentos no payroll |
| `center_manager` | Futuro alcance por centro | No se activa hasta tener frontera por centro en schema/RLS/UX |

Regla B.4: `center_manager` queda futuro. No basta con filtrar UI por centro; hace falta frontera por centro en DB/RLS, helpers, Server Actions, navegacion, empty states, pruebas negativas y evidencia de que no puede leer/mutar otro centro.

## Logo Y Marca

Para beta interna:

- el logo real no es obligatorio;
- no guardar URLs publicas de logo en `theme_config`;
- no subir logos desde UI hasta tener asset privado, formatos, limites, permisos y usos claros;
- el tenant puede usar nombre visible y color de acento valido;
- la app debe seguir usable sin logo ni color configurado.

Para v1 comercial:

- definir `logoAssetId` o modelo equivalente como asset privado/controlado;
- definir formatos y tamanos maximos;
- decidir si se guardan original y variantes;
- decidir si el logo aparece en documentos/exportes;
- auditar reemplazos si el logo se usa en documentos o comunicaciones formales.

## Colores Por Centro

Los colores por centro quedan opcionales.

Solo deben abrirse si aportan valor operativo real en vistas multi-centro:

- distinguir centros en horario/cobertura densa;
- mejorar filtros visuales;
- ayudar en agenda movil sin competir con estados.

No deben usarse como grandes fondos ni sobrescribir:

- sin cubrir;
- conflicto;
- error;
- foco;
- estados de aprobacion/rechazo;
- contraste minimo.

Para beta interna pueden quedar fuera. Para v1 comercial, si se abren, deben vivir como dato tenant-safe, con validacion de color, fallback y pruebas con al menos dos tenants.

## Onboarding De Nuevo Box

B.4 no implementa onboarding, pero define el paquete minimo que un operador debe poder preparar:

1. Crear organizacion.
2. Definir nombre visible y acento opcional.
3. Crear centros.
4. Crear tipos de actividad.
5. Crear personas/fichas operativas iniciales.
6. Asignar roles iniciales.
7. Configurar email/Auth del entorno.
8. Enviar invitaciones controladas.
9. Cargar o revisar primera semana/plantilla.
10. Ejecutar smoke anonimo y autenticado.
11. Guardar evidencia de activacion.

Para v1 comercial, este flujo debe convertirse en onboarding guiado o runbook repetible con importacion/carga asistida, validaciones y rollback operativo.

## Evidencia De Tenant Readiness

Guardar fuera del repo si contiene datos reales:

- nombre del tenant y entorno;
- fecha de revision;
- responsable de validacion;
- centros activos;
- roles iniciales asignados;
- tipos de actividad y defaults revisados;
- estado de `theme_config`;
- decision sobre logo y colores por centro;
- resultado de invitacion/aceptacion si aplica;
- resultado de smoke por rol;
- resultado o bloqueo de OD.1/I.32;
- resultado o bloqueo de F.15 si fichaje entra en beta;
- confirmacion de `rg -n "STL" src` sin coincidencias;
- bloqueos restantes y decision: `bloqueado`, `listo para beta interna` o `pendiente para v1 comercial`.

No guardar passwords, tokens, API keys, enlaces activos de invitacion/reset, datos personales innecesarios, documentos privados ni screenshots con informacion sensible.

## Criterios De Estado

### Bloqueado

El tenant queda bloqueado si:

- no hay owner/admin real;
- no hay centros o tipos suficientes para probar la operativa;
- las invitaciones/Auth reales no funcionan segun S.8;
- no hay credenciales E2E por rol necesarias para smoke;
- hay hardcode de tenant en `src`;
- se intenta activar `center_manager` sin frontera por centro en schema/RLS/UX;
- se pretende usar logo publico, documentos firmables, payroll, geofencing, app nativa o IA como requisito de beta.

### Listo Para Beta Interna

El tenant puede ir a beta interna cuando:

- S.8 esta listo o sus bloqueos estan cerrados;
- tenant, centros, roles, tipos y datos iniciales estan revisados;
- `owner`/`admin` y usuarios de prueba existen;
- tema minimo no rompe estados ni contraste;
- smokes por rol pasan o los skips estan justificados;
- OD.1/I.32 confirma que la operativa diaria no tiene deuda bloqueante para la beta;
- evidencia queda guardada;
- no se abren capacidades fuera del mapa de cierre.

### Pendiente Para V1 Comercial

Aunque beta interna pase, quedan para v1:

- onboarding guiado o runbook repetible para nuevo box;
- logo privado/controlado si se decide comercialmente;
- colores por centro si aportan claridad;
- permisos por centro solo si hay caso real y task propia;
- billing/soporte/exportes comerciales;
- documentacion de limites del producto;
- hardening de produccion.

## Prohibiciones B.4

- No hardcodear el primer tenant en `src`.
- No introducir `service_role` en `src`.
- No activar permisos por centro funcionales.
- No crear migraciones salvo task tecnica propia.
- No abrir UI de subida documental ni documentos firmables.
- No abrir payroll, importes, compensaciones o nominas.
- No abrir app nativa, push, service worker, background sync, geofencing o geolocalizacion web.
- No abrir IA funcional, embeddings, RAG, vector DB, prompts runtime, SDKs, jobs ni UI de IA.
