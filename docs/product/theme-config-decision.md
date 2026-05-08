# Decision De Persistencia De Theme Config - BoxOps

Este documento decide la persistencia recomendada para la configuracion visual de tenant.

Estado 2026-05-07: la decision se aplica en B.1 con `supabase/migrations/00003_organization_theme_config.sql`. El primer corte solo guarda `version` y `accentColor`; logo, colores por centro, permisos avanzados, borradores, versionado o auditoria propia siguen siendo motivos para reabrir la decision antes de migrar a una tabla dedicada.

## Decision Recomendada

Para la primera implementacion de theming, usar una columna explicita:

```text
organizations.theme_config jsonb not null default '{}'
```

No usar `organizations.metadata` como ubicacion principal del tema. `metadata` puede seguir existiendo para datos auxiliares, pero el tema debe tener un campo propio para hacerlo visible, validable y documentado.

No crear una tabla dedicada todavia. Una tabla tipo `organization_theme_settings` queda como evolucion futura si el theming crece en complejidad.

## Motivo

El theming inicial de BoxOps es ligero:

- logo o asset de marca;
- acento de tenant;
- color corporativo secundario si se valida;
- modo de logo;
- colores discretos por centro;
- densidad inicial controlada;
- fallbacks seguros de producto.

Es configuracion de la organizacion activa, se lee junto al shell protegido y no necesita por ahora permisos, historial o versionado independientes.

## Pros De `organizations.theme_config`

- Mantiene el tema junto a la frontera natural del tenant.
- Evita una join extra en el shell de la app.
- Es suficiente para un tema ligero y poco cambiante.
- Facilita fallback inmediato cuando el objeto esta vacio o incompleto.
- Reduce sobreingenieria antes de validar la UI real.
- Hace explicito que el tema pertenece a la organizacion, no al usuario global.

## Contras De `organizations.theme_config`

- JSONB exige validacion en app o constraints adicionales.
- No ofrece historial/auditoria granular por campo.
- Puede crecer demasiado si se mezclan assets, presets, centros, marcas y preferencias.
- Cambios frecuentes de tema actualizan la fila de `organizations`.
- Permisos diferenciados para "admin visual" serian mas dificiles.

## Pros De Tabla Dedicada Futura

Una tabla `organization_theme_settings` podria aportar:

- columnas tipadas y constraints mas claras;
- auditoria/versionado separado;
- permisos especificos para configurar marca;
- soporte para presets, preview o borradores;
- menor acoplamiento con la fila principal de organizacion;
- migracion mas limpia si hay muchos campos visuales.

## Contras De Tabla Dedicada Ahora

- Anade complejidad antes de tener UI de theming.
- Obliga a mas queries o joins en cada carga de shell.
- Puede cristalizar un modelo prematuro.
- No aporta mucho para un acento, logo y preferencias basicas.

## Forma Conceptual

La configuracion debe versionarse y validarse:

```json
{
  "version": 1,
  "logoAssetId": "uuid-or-storage-asset-id",
  "logoMode": "mark-and-name",
  "accentColor": "#334155",
  "secondaryAccentColor": "#0f766e",
  "densityDefault": "standard",
  "centerColors": {
    "center-uuid-1": "#2563eb",
    "center-uuid-2": "#0f766e"
  }
}
```

Reglas:

- Los IDs deben ser referencias internas o UUIDs, no nombres de centro.
- `logoAssetId` debe apuntar a un asset controlado por BoxOps/tenant, no a una URL arbitraria sin validar.
- Los colores configurables deben normalizarse y validar contraste.
- El sistema deriva variantes seguras (`subtle`, `foreground`, `border`) desde el acento.
- Si un valor falla, se usa fallback de BoxOps.
- No se guardan tokens computados como fuente de verdad.
- No se permite sobreescribir `uncovered`, `conflict`, `error`, foco ni estados criticos.
- Si un color falla contraste, la UI debe usar fallback seguro aunque se decida guardar el valor para correccion posterior.

## Criterios Para Migrar A Tabla Dedicada

Mover a `organization_theme_settings` si aparece al menos una de estas necesidades:

- editor de tema con borradores/publicacion;
- historial/auditoria legal o de cambios de marca;
- permisos separados para gestion visual;
- multiples temas por organizacion;
- configuracion por rol o por centro mas rica que un color;
- asset management complejo de logos;
- necesidad de constraints SQL fuertes por campo;
- cambios de tema frecuentes que hagan incomoda la fila de `organizations`.

## Impacto En Implementacion

Aplicado en B.1:

1. Crear migracion para `organizations.theme_config`.
2. Resolver organizacion activa con los helpers existentes.
3. Leer `theme_config` junto con la organizacion activa.
4. Validar y normalizar `accentColor` en server/app.
5. Combinar con fallback de BoxOps.
6. Aplicar variables solo dentro del shell de la organizacion activa.

Pendiente para siguientes cortes:

- probar con mas tenants reales o demo;
- modelar logo/asset privado;
- decidir si colores por centro siguen en `theme_config` o pasan a entidad propia;
- reabrir tabla dedicada si hay permisos, versionado o auditoria granular.

La configuracion visual no debe introducir condiciones tipo "si el tenant es STL". STL, como cualquier tenant, usara datos/configuracion.
