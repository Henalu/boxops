# Guias personales - BoxOps

Estas guias son la memoria corta del proyecto. No sustituyen a `PROJECT_BRIEF.md`, que sigue siendo la fuente de verdad, pero sirven para volver al repo sin tener que reconstruir todo con cafe, intuicion y una ceja levantada.

Leer en este orden si vienes frio:

1. `project-cheatsheet.md`: que es BoxOps hoy, que existe y que no.
2. `stack-guide.md`: como esta montado el stack y por que.
3. `code-editing-guide.md`: donde tocar cada cosa sin abrir medio repo.
4. `stack-pitch.md`: como defender el stack sin sonar a catalogo de conferencias.
5. `chatgpt-connector-cg4a.md`: como probar el packaging MCP interno sin confundirlo con la conexion ChatGPT final.
6. `chatgpt-connector-cg4c.md`: como validar refresh tokens rotados tras conectar BoxOps en ChatGPT.

Guias de uso por rol:

- `../user-guides/admin.md`
- `../user-guides/coach.md`

## Regla de oro

BoxOps no es "el software de STL". BoxOps es el producto. STL es el primer tenant/piloto y vive como datos o documentacion de tenant, no como logica generica.

La jerarquia mental sigue siendo:

```text
Organization/Tenant -> Centers -> Users/Coaches -> Schedules -> Classes/Blocks -> Events
```

Decision 2026-06-29: BoxOps comparte hub/Supabase con BoxWod para Auth, organizaciones, centros, perfiles base y acceso tenant. BoxWod es app separada; no meter reservas/WOD en la operativa BoxOps ni asumir que roles BoxOps equivalen a permisos BoxWod.

Ahora mismo el producto llega de verdad hasta auth, organizacion activa, shell protegido, centros, equipo/coaches, tipos de actividad, horario semanal, asignaciones, cobertura, filtros, "Mi horario", plantillas semanales, proxima clase propia, solicitudes/ofertas minimas de cobertura/cambio, area personal, avatar/firma privada, fichaje propio con correcciones, cierre semanal y exporte interno revisable. Ausencias, vacaciones, swap entre dos bloques, payroll, documentos visibles/firmables, geolocalizacion web, push real, service worker/offline privado, app nativa e IA siguen fuera de la base actual.
