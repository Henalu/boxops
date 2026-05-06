# Validacion Fase A - Cierre MVP 1 Real

Fecha: 2026-05-06.

## Resultado

Fase A queda ejecutada con una semana de prueba L-V de STL cargada en local, sin inventar asignaciones de coaches ni reglas genericas de producto. La UI se valido contra 165 bloques reales y una plantilla vacante. No se cierra del todo todavia porque faltan centro real por bloque si aplica a mas de una sede, coaches reales por bloque o huecos confirmados, y credenciales/flujo E2E reales del tenant piloto.

No se tocaron permisos, migraciones ni seeds automaticos de MVP 1. La deuda de codigo resuelta fue acotada a Fase A: `/app/templates` dejo de renderizar todos los formularios de edicion de bloque a la vez, suma una vista semanal por dias para plantillas grandes y el smoke E2E evita que el onboarding local bloquee la navegacion automatizada.

## Fase Confirmada

La siguiente fase marcada en el plan canonico de `TASKS.md` es:

- Fase A - Cierre MVP 1 Real Con Datos Validados Y Deuda Pequena.

Su salida exige:

- una semana real cargable, revisable y corregible con la UI actual;
- dashboard e `/app/coverage` utiles con datos reales;
- plantillas funcionando con coaches por defecto y huecos vacantes reales;
- deuda tactil movil priorizada o descartada;
- `src` sin referencias STL hardcodeadas;
- `docs/tenants/stl/README.md` actualizado solo con datos validados.

## Datos Validados Disponibles

Ya esta documentado y se mantiene como dato de tenant:

- centros iniciales: STL Tremanes y STL City;
- 9 coaches operativos y 1 perfil tecnico interno oculto;
- roles iniciales de producto: `admin`, `manager` futuro documentado y `coach`;
- semana de prueba L-V recibida para STL con dia, hora inicio, hora fin y actividad;
- todos los bloques de la semana de prueba requieren 1 coach;
- `CrossFit Teens` dura 1 hora y media;
- varias clases simultaneas en la misma hora son normales;
- cada clase requiere 1 coach por defecto en el primer corte;
- las certificaciones no condicionan asignaciones en MVP 1;
- los coaches deben poder ver horario completo del equipo, nombre y foto;
- plantillas deben soportar coaches por defecto y huecos vacantes;
- la cola de cobertura debe priorizar sin cubrir, conflicto e insuficiente.

## Estado Local Comprobado

Consulta local contra Supabase antes de cargar el fixture, el 2026-05-06:

| Tenant | Centros | Personas | Coaches | Tipos | Plantillas | Bloques |
|---|---:|---:|---:|---:|---:|---:|
| demo-box | 2 | 5 | 6 | 4 | 1 | 9 |
| stl | 2 | 10 | 9 | 8 | 0 | 0 |

Tras aplicar `supabase/snippets/stl-test-week-2026-05-04.sql` en local:

| Dato fixture STL | Valor |
|---|---:|
| Plantillas activas de prueba | 1 |
| Bloques de plantilla | 165 |
| Bloques reales semana 2026-05-04 | 165 |
| Bloques por dia L-V | 33 |
| Asignaciones creadas | 0 |

La semana se carga en `STL Tremanes` como centro tecnico de prueba porque el usuario no dio centro por bloque. Las asignaciones quedan vacantes por defecto para no inventar coaches.

La validacion E2E local creo memberships de prueba para `e2e.admin@boxops.local` y `e2e.coach@boxops.local` dentro del tenant STL. Esto no sustituye credenciales reales del piloto.

## Deuda Pequena Resuelta

La pantalla `/app/templates` era funcional, pero con 165 bloques renderizaba un formulario de edicion completo por cada bloque aunque estuviera cerrado. Para mantener la UI usable con una semana real:

- cada fila de bloque muestra resumen y boton de edicion;
- solo el bloque seleccionado renderiza el formulario de edicion;
- la vista global Semana agrupa bloques por dia y reduce el scroll en plantillas grandes;
- la vista Agenda conserva la lista vertical existente para revision lineal;
- abrir/cerrar edicion usa estado cliente para evitar recarga, cambio de URL y salto de scroll;
- escritorio edita en panel lateral y movil expande el formulario bajo la tarjeta seleccionada;
- los formularios preservan el modo `view` al guardar o volver con error;
- admin conserva la capacidad de editar bloques de plantilla;
- coach conserva modo lectura;
- no se introducen reglas especiales de STL ni datos hardcodeados en `src`.

## Bloqueos Para Cerrar Fase A

Faltan estos datos o decisiones antes de marcar la fase como completamente cerrada:

- coach asignado por bloque real, o decision explicita de dejar huecos reales vacantes;
- confirmacion de si todos los bloques de prueba pertenecen a un centro o deben repartirse entre STL Tremanes y STL City;
- confirmacion de si se quiere introducir asignaciones de prueba o mantener todos los bloques vacantes;
- credenciales o flujo E2E real para validar al menos un admin y un coach contra el tenant STL;
- decision final de almacenamiento del horario/asignaciones reales: base privada de piloto, snippet local privado o fixture anonimizado.

Hasta que esos puntos esten cerrados, no se debe mover el horario real ni asignaciones reales a un seed automatico generico.

## Decision De Fixture

Para Fase A, el camino recomendado es:

1. Mantener `supabase/snippets/stl-test-week-2026-05-04.sql` como fixture local nombrado, no automatico.
2. No mover el fixture a seed automatico hasta confirmar centro por bloque y politica de asignaciones.
3. Crear un fixture anonimizado solo despues de confirmar la semana completa y los casos de cobertura que se quieren preservar para pruebas.
4. Mantener el seed generico `demo-box` como base publica de smoke y desarrollo.

## Deuda Tactil Movil

La deuda de targets tactiles moviles queda descartada como bloqueo de Fase A. Task 016 y Task 017 ya detectaron controles compactos por debajo de 44px, pero no bloquearon navegacion, lectura, ausencia de overflow ni resolucion basica de MVP 1.

Se mantiene como deuda futura de hardening mobile si la validacion con una semana real muestra friccion diaria en telefono.

## Verificacion Ejecutada

Comandos ejecutados en esta pasada:

- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npm run test:smoke`
- `rg -n "STL" src`

Resultado:

- lint, typecheck, build y smoke pasan.
- `npm run test:smoke` con `E2E_ORGANIZATION_ID=00000000-0000-0000-0000-000000200001` y `E2E_WEEK=2026-05-04`: 13 passed.
- `rg -n "STL" src` no devuelve coincidencias.
- Validacion browser en 390x844 y 1280x800 sobre Inicio, Horario, Cobertura, Plantillas, Equipo y Mas: contenido renderizado, sin overlay de framework, sin errores de consola/pageerror y sin overflow horizontal.
- Validacion browser adicional sobre `/app/templates?view=week` y `/app/templates?view=agenda` en 390x844 y desktop: cambio de vista, apertura de edicion por `edit_block_id`, vista semanal sin cabecera duplicada, movil con un unico dia visible, sin errores de consola/pageerror y sin overflow horizontal de pagina.
- Se creo acceso E2E local de admin/coach al tenant STL para validar la UI con `organizationId=00000000-0000-0000-0000-000000200001`.

## Siguiente Paso Permitido

No abrir Fase B todavia. El siguiente paso dentro de Fase A es confirmar centro por bloque y asignaciones reales o huecos intencionados; despues se puede decidir si el fixture local pasa a seed privado/anonimizado o sigue solo como snippet de validacion.
