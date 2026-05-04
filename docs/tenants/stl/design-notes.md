# Notas De Diseño - Tenant STL

STL es el primer tenant real de BoxOps. Estas notas ayudan a validar la direccion visual con un caso concreto sin convertir BoxOps en un producto hardcodeado para STL.

## Regla Principal

La UI base siempre es BoxOps. STL puede aportar datos, configuracion, feedback y una capa de branding de tenant cuando exista theming.

STL no debe aparecer como:

- nombre de producto;
- ruta;
- condicion en componentes;
- permiso especial;
- color hardcodeado;
- copy generico;
- excepcion de layout.

## Necesidades STL Que Deben Guiar El Diseño

STL debe poder responder rapido:

- que pasa esta semana en STL Tremañes y STL City;
- que bloques estan sin cubrir;
- que coaches trabajan en ambos centros;
- que clases o actividades requieren cobertura;
- que cambios o ausencias afectan al horario;
- que eventos, festivos o competiciones cambian la planificacion;
- que programacion o documentos necesita un coach antes de dar clase.

Estas necesidades validan la experiencia multi-centro y de cobertura, no una marca STL dentro del producto.

## Theming STL Futuro

Cuando exista theming por tenant, STL puede configurar:

- logo del tenant;
- color de acento propio;
- nombres visibles de centros;
- pequenos detalles de marca permitidos;
- preferencia inicial de centro o vista si se define como configuracion.

Debe seguir siendo comun:

- semantica de estados;
- contraste y accesibilidad;
- patrones de navegacion;
- componentes;
- permisos;
- rutas genericas;
- copy de producto.

## Validacion Visual Con STL

La primera validacion visual deberia hacerse con una semana real y comprobar:

- si un admin detecta bloques sin cubrir en segundos;
- si los centros se distinguen sin saturar de color;
- si un coach entiende su dia desde movil sin instrucciones;
- si las solicitudes pendientes se ven antes de que sea tarde;
- si la vista semanal es mas util que una lista generica de turnos;
- si el producto se siente premium y ligero, no corporativo ni fitness agresivo.

## Riesgos A Evitar

- Usar colores o lenguaje STL como base de BoxOps.
- Diseñar solo para dos centros cuando otros tenants podrian tener uno o muchos.
- Resolver a mano reglas de STL que deberian ser configuracion.
- Hacer que el dashboard dependa de metricas que STL no use.
- Priorizar fichaje visualmente antes de que horarios y cobertura funcionen.

## Criterio De Exito

STL debe sentir que BoxOps entiende su operativa, pero un segundo box debe poder entrar en la misma app, cambiar datos/configuracion y no encontrar restos de STL en la experiencia generica.
