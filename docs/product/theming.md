# Theming Multi-Tenant - BoxOps

Este documento define como deberia funcionar el theming por tenant en BoxOps. Es una especificacion de producto/arquitectura visual, no una implementacion.

Estado 2026-05-06: theming sigue sin implementacion real. La primera fase candidata es Fase B del roadmap, usando `organizations.theme_config jsonb` como opcion preferente si no aparecen necesidades de permisos, versionado o auditoria mas complejas.

## Principio

BoxOps tiene una identidad base propia. El tenant puede aportar contexto visual, pero no debe cambiar la semantica operativa del producto.

Regla corta:

```text
Producto define claridad, estructura, estados y accesibilidad.
Tenant define marca ligera y contexto.
Datos operativos definen centros, tipos y contenido.
```

## Capas De Tema

### 1. Producto Base

Siempre comun:

- neutrales, texto, bordes y superficies;
- tipografia base;
- spacing, radius y sombras;
- foco visible;
- estados criticos y semanticos;
- jerarquia de acciones;
- patrones de navegacion;
- permisos, rutas y copy generico.

### 2. Identidad Del Tenant

Configurable de forma controlada:

- logo o marca del tenant;
- nombre visible de organizacion;
- color de acento principal;
- color suave derivado del acento;
- colores por centro;
- colores corporativos secundarios solo si no compiten con estados;
- preferencia de densidad inicial si se valida;
- preferencia de vista inicial por rol si se valida.

### 3. Datos Operativos

Vienen de entidades del tenant:

- centros;
- tipos de actividad;
- bloques;
- solicitudes;
- eventos;
- ausencias;
- documentos futuros.

Estos datos pueden tener colores propios, pero siempre subordinados a la semantica de estado.

## Lo Que No Es Configurable Por Tenant

No permitir que un tenant cambie:

- colores de `uncovered`, `conflict`, `error` o foco;
- colores de warning/success/destructive cuando indiquen estado operativo;
- contraste minimo;
- significado visual de estados;
- orden de prioridad de riesgos;
- rutas;
- nombres de componentes;
- permisos;
- copy generico de producto;
- estructura principal de navegacion;
- tokens de spacing/radius que rompan consistencia;
- comportamiento mobile-first.

## Modelo De Configuracion Futuro

La decision documental recomendada esta en `theme-config-decision.md`: empezar con `organizations.theme_config` como `jsonb` explicito y reservar una tabla `organization_theme_settings` para una evolucion posterior si el theming gana permisos, versionado o complejidad propia.

Forma conceptual:

```json
{
  "version": 1,
  "logoAssetId": "asset-id",
  "accentColor": "#334155",
  "secondaryAccentColor": "#0f766e",
  "logoMode": "mark-and-name",
  "centerColors": {
    "center-uuid-1": "#2563eb",
    "center-uuid-2": "#0f766e"
  },
  "densityDefault": "standard"
}
```

Notas:

- los IDs reales deben ser UUIDs o referencias internas, no nombres de centro;
- `logoAssetId` debe apuntar a un asset controlado, idealmente privado o servido mediante ruta segura;
- `accentColor` debe validarse y derivar variantes seguras;
- `densityDefault` no puede ocultar informacion ni reducir targets moviles bajo minimos;
- el tema se resuelve para la organizacion activa, no por usuario global.

## Resolucion Del Tema

Flujo futuro recomendado:

1. Resolver usuario y organizacion activa con las utilidades de tenant existentes.
2. Leer configuracion visual de esa organizacion.
3. Validar colores, logo y preferencias.
4. Combinar con fallback de BoxOps.
5. Aplicar variables solo dentro del shell de la organizacion activa.
6. Al cambiar de organizacion, cambiar tema y contexto juntos.

El tema nunca debe resolverse por nombre de tenant hardcodeado. Tampoco debe haber condicionales del tipo "si tenant es X".

## Validacion De Color

Todo color configurable necesita:

- formato permitido, idealmente hex normalizado o OKLCH controlado;
- contraste AA para texto normal cuando se use como fondo;
- fallback si no pasa contraste;
- variante `foreground` calculada o elegida por el sistema;
- variante `subtle` para fondos suaves;
- variante `border` para rails/chips.

Si el acento del tenant no funciona para botones, se puede usar:

- acento solo como borde, rail o chip;
- `primary` de producto para accion principal;
- tenant accent en logo/nav activo de forma secundaria.

## Precedencia Visual

Cuando varias capas compiten, gana esta prioridad:

1. Estado critico: sin cubrir, conflicto, error.
2. Estado de workflow: pendiente, aprobado, rechazado, aplicado.
3. Foco/seleccion del usuario.
4. Tipo de actividad.
5. Centro.
6. Acento de tenant.
7. Neutral base.

Ejemplo: un bloque de un centro con color azul que esta sin cubrir debe verse como `sin cubrir`; el azul del centro solo puede quedar como contexto secundario.

## Logos Y Marca

El logo del tenant puede aparecer:

- en el switcher o cabecera de organizacion;
- en el area de cuenta/configuracion;
- en documentos o exports futuros;
- en pantallas donde refuerce contexto.

No debe convertir la app en una experiencia distinta por tenant. La estructura, patrones y lenguaje siguen siendo BoxOps.

Antes de subir logos reales hay que decidir:

- formatos permitidos;
- tamano maximo;
- si se guarda original, variantes o ambas;
- quien puede reemplazarlo;
- si el logo puede aparecer en exports/documentos con datos laborales.

## Centros Y Colores

Los colores de centro ayudan en vistas multi-centro, pero deben ser discretos:

- rail lateral;
- dot;
- chip pequeno;
- borde suave;
- selector de centro.

No usar grandes fondos por centro en dashboards o calendarios densos, porque compiten con estados de cobertura.

## Tipos De Actividad

Los tipos de actividad pueden tener color propio desde `class_types.color`, siempre como dato de tenant:

- validar formato;
- limitar saturacion visual en calendarios;
- asegurar contraste si hay texto encima;
- mostrar fallback neutral si falta color o falla contraste;
- no permitir que el color de tipo oculte `uncovered`.

## Modo Claro/Oscuro

El tema inicial recomendado es claro. Un modo oscuro puede considerarse mas adelante si:

- no empeora legibilidad en horarios densos;
- mantiene contraste de estados;
- funciona con colores de tenant;
- se valida en movil y desktop.

No priorizar dark mode antes de resolver horarios, cobertura, solicitudes y densidad responsive.

## Primer Tenant

El primer tenant real puede definir logo, acento y colores de centro con este mismo modelo. Esos valores deben vivir como datos/configuracion de tenant y no aparecer en:

- componentes genericos;
- rutas;
- permisos;
- CSS base;
- defaults globales;
- copy de producto.

## Criterios Para Implementacion Futura

La fase frontend puede empezar a implementar theming cuando:

- se aplique la decision de persistencia documentada en `theme-config-decision.md`;
- se definan fallbacks seguros de BoxOps;
- se haya validado contraste de tokens base;
- se pruebe con al menos dos configuraciones de tenant;
- exista matriz de permisos para quien cambia logo/colores;
- `rg -n "STL" src` no encuentre referencias hardcodeadas;
- la UI siga siendo usable sin logo ni color configurado.
