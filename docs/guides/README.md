# Guias personales - BoxOps

Estas guias son la memoria corta del proyecto. No sustituyen a `PROJECT_BRIEF.md`, que sigue siendo la fuente de verdad, pero sirven para volver al repo sin tener que reconstruir todo con cafe, intuicion y una ceja levantada.

Leer en este orden si vienes frio:

1. `project-cheatsheet.md`: que es BoxOps hoy, que existe y que no.
2. `stack-guide.md`: como esta montado el stack y por que.
3. `code-editing-guide.md`: donde tocar cada cosa sin abrir medio repo.
4. `stack-pitch.md`: como defender el stack sin sonar a catalogo de conferencias.

Guias de uso por rol:

- `../user-guides/admin.md`
- `../user-guides/coach.md`

## Regla de oro

BoxOps no es "el software de STL". BoxOps es el producto. STL es el primer tenant/piloto y vive como datos o documentacion de tenant, no como logica generica.

La jerarquia mental sigue siendo:

```text
Organization/Tenant -> Centers -> Users/Coaches -> Schedules -> Classes/Blocks -> Events
```

Ahora mismo el producto llega de verdad hasta auth, tenant activo, shell protegido, centros, gestion basica de usuarios/coaches, catalogo de tipos de clase/actividad, gestion semanal de bloques operativos, asignaciones, cobertura basica, filtros, "Mi horario" y plantillas semanales basicas. Dashboard, cambios, ausencias, fichaje y documentos siguen modelados o previstos, pero todavia no existen. No pasa nada, respiramos.
