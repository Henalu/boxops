# UI Decisions - BoxOps

## Task 017 - Refactor UX/UI Operativo MVP 1

Fecha: 2026-05-04.

## Problema

La UI MVP 1 funcionaba, pero se leia como panel tecnico: navegacion plana, Inicio demasiado explicativo, Equipo mezclado con conceptos internos y Cobertura sin una ruta propia de resolucion.

## Decisiones

- Navegacion principal: Inicio, Horario, Cobertura, Equipo y Mas.
- Mobile: bottom navigation de 5 items.
- Desktop/tablet: sidebar con seccion Principal y Gestion.
- Gestion agrupa Centros, Tipos de actividad y Plantillas.
- `/app/coaches` se mantiene como ruta por compatibilidad, pero el producto la presenta como Equipo.
- `/app/coverage` separa la cola de riesgos del dashboard de Inicio.
- `/app/more` agrupa gestion, ayuda y reinicio de guia.
- Onboarding inicial con `localStorage` y key `boxops_onboarding_seen_v1`.
- Configuracion queda visible como placeholder no disponible; no se implementa modulo nuevo.
- El acento base del producto pasa a teal/petroleo mediante tokens CSS, no como regla de tenant.

## Copy

Se evita usar en UI principal:

- mutaciones;
- tenant activo;
- membership;
- CRUD;
- Supabase Auth;
- superficie semanal;
- query string.

Se prioriza:

- box;
- centro;
- coach;
- clase;
- actividad;
- horario;
- cobertura;
- plantilla;
- semana;
- pendiente;
- sin cubrir;
- asignar;
- resolver.

## Verificacion

- Playwright contra `http://127.0.0.1:3000`.
- Viewports 390x844 y 1280x800.
- Evidencia en `test-results/ux-refactor-2026-05-04/`.
- Sin overflow horizontal de pagina en rutas auditadas.
- Sin errores de consola ni overlays de framework.

## Limites

- No cambia schema, permisos ni RLS.
- No crea tabla de configuracion visual.
- No implementa cambios, ausencias, fichaje, payroll, miembros, pagos, reservas, eventos avanzados, IA ni geolocalizacion.
- La validacion con semana real del primer tenant sigue pendiente.
