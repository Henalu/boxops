# Direccion De Diseño UI - BoxOps

Este documento define la direccion visual de BoxOps para futuras fases de frontend. No describe componentes implementados ni obliga a construir UI todavia. Sirve como criterio comun para que las pantallas futuras se sientan como una app operativa premium, no como una herramienta de RRHH generica ni como una app fitness ruidosa.

## Norte Visual

BoxOps debe sentirse:

- rapido, practico y fiable para el uso diario de un box;
- moderno, minimalista y premium;
- claro antes que decorativo;
- denso cuando el admin necesita comparar informacion, pero nunca pesado;
- calmado, sin estetica agresiva de fitness;
- generico y multi-tenant, con STL solo como primer tenant configurable.

La referencia estetica principal es Revolut por su claridad, jerarquia de tarjetas, acciones rapidas, navegacion simple y sensacion premium. La app debe inspirarse en esos principios, no copiar pantallas, layout, assets ni identidad visual.

## Personalidad De Producto

BoxOps es una herramienta de operacion diaria. Debe transmitir control, velocidad y criterio.

- Para coaches: "abro la app y se que tengo que hacer ahora".
- Para admins: "veo el riesgo operativo antes de que explote en WhatsApp".
- Para owners/managers futuros: "entiendo cobertura, horas y excepciones sin revisar cinco hojas".

No debe transmitir:

- software corporativo pesado;
- gestor laboral o de nominas;
- dashboard lleno de metricas irrelevantes;
- app fitness de marketing con neones, fotos heroicas o ruido visual;
- producto hecho a medida para STL.

## Base Visual

### Color

El tema base de BoxOps debe ser neutral:

- fondo claro: blanco y grises muy claros;
- texto principal: negro suave, no negro puro si los tokens permiten evitarlo;
- superficies: tarjetas limpias con borde sutil o sombra muy suave;
- acento principal controlado;
- estados semanticos consistentes;
- colores de tenant solo como capa configurable.

No hardcodear colores de STL en el tema base. STL puede tener tema propio cuando exista theming, pero BoxOps debe poder venderse a otro box sin cambiar componentes ni copy generico.

### Tipografia

Usar una sans limpia tipo Inter, Geist o similar. La tipografia debe priorizar lectura rapida:

- titulos cortos y utiles;
- labels compactos para filtros y estados;
- numeros claros para horas, fechas y contadores operativos;
- jerarquia fuerte entre tarea principal, contexto y metadata;
- evitar estilos decorativos o deportivos.

### Superficies Y Tarjetas

Las tarjetas son la unidad visual principal, pero no todo debe ser tarjeta.

Usarlas para:

- bloques del horario;
- solicitudes;
- resumenes de cobertura;
- documentos;
- fichajes activos;
- estados de una clase o evento.

Evitar:

- tarjetas dentro de tarjetas sin necesidad;
- grids monotonos de metricas;
- sombras exageradas;
- bordes gruesos;
- tarjetas decorativas que no ayuden a decidir.

### Iconografia

Usar iconos funcionales, preferiblemente lucide-react cuando se implemente UI:

- reloj para fichaje y horas;
- calendario para vistas temporales;
- centro/ubicacion para filtros de sede;
- usuario/coach para asignacion;
- alerta para sin cubrir o conflicto;
- check para cubierto/aprobado.

Los iconos deben acelerar reconocimiento, no adornar cada linea de texto.

## Estados Visuales

Los estados operativos deben verse antes que cualquier metrica secundaria.

| Estado | Direccion visual |
|---|---|
| Cubierta | Positivo sutil. Confirmacion clara sin invadir la vista. |
| Sin cubrir | Alerta prioritaria, visible y facil de filtrar. Debe destacar mas que cualquier otro estado normal. |
| Pendiente | Aviso suave. Usar para solicitudes, aprobaciones y validaciones en espera. |
| Aprobado | Confirmacion positiva y estable. |
| Rechazado | Estado claro, no dramatico. Debe explicar el siguiente paso si aplica. |
| Extra | Indicador claro, no alarmista. Diferenciar horas extra detectadas, pendientes y validadas. |
| Evento | Diferenciacion propia para no confundirse con clase recurrente. |
| Festivo | Diferenciacion propia y visible en calendario/semana. |
| Cancelada | Bajo contraste y lectura rapida de que ya no requiere accion normal. |

Regla: si una pantalla mezcla muchos estados, "sin cubrir", conflictos y acciones pendientes tienen prioridad visual sobre estados informativos.

## Layout Y Densidad

BoxOps debe ser mobile-first, pero no mobile-only.

### Movil

El coach usara el movil para decisiones rapidas:

- ver hoy;
- ver siguiente clase o bloque;
- fichar;
- consultar programacion;
- responder solicitudes;
- revisar horas.

Las pantallas moviles deben tener:

- bottom navigation con maximo 5 secciones;
- acciones primarias visibles cerca del contexto;
- filtros rapidos, no formularios largos;
- listas escaneables con estados claros;
- detalles en pantalla o sheet cuando el flujo sea corto.

### Desktop/Tablet

El admin necesitara mas densidad:

- semana completa;
- comparacion por centro;
- conflictos;
- solicitudes en cola;
- filtros combinados;
- cobertura del dia y de la semana.

La densidad debe ser controlada. Mejor una tabla/lista limpia con jerarquia fuerte que un dashboard lleno de widgets decorativos.

## Navegacion Recomendada

Navegacion movil base:

1. Hoy
2. Semana
3. Solicitudes
4. Calendario
5. Más

La seccion "Más" puede agrupar documentos, certificaciones, ajustes, perfil, centros y configuracion segun rol.

En desktop, la navegacion puede usar sidebar o top nav con agrupacion por flujo:

- Hoy / Inicio operativo
- Horario
- Cobertura
- Solicitudes
- Calendario
- Equipo
- Documentos
- Configuracion

No duplicar los mismos enlaces principales en varias capas de navegacion movil.

## Theming Multi-Tenant

El diseño base pertenece a BoxOps. Cada tenant puede configurar una capa visual sin romper el producto:

- color de acento;
- logo;
- nombre visible de organizacion;
- colores secundarios de centros si se validan;
- pequeños ajustes de marca en areas permitidas.

Estado B.1 2026-05-07: solo estan implementados nombre visible de organizacion y color de acento. Logo, colores de centro y ajustes de marca mas amplios siguen pendientes.

No deben ser configurables:

- semantica de estados criticos;
- contraste minimo;
- jerarquia de acciones principales;
- copy generico de producto;
- rutas, componentes o permisos.

STL puede ser el primer tenant con tema propio, pero esa configuracion debe vivir como datos/configuracion de tenant, no en componentes genericos.

## Aplicacion A Futuro Frontend

Cuando llegue la fase de frontend:

- empezar por mobile coach y desktop admin, no por landing;
- diseñar primero las pantallas de trabajo real;
- usar tokens para color, radius, spacing, typography y estados;
- documentar decisiones de componentes compartidos si afectan a varias pantallas;
- validar pantallas con una semana real de STL y al menos un segundo tenant demo conceptual;
- hacer audit de accesibilidad, responsive y theming antes de cerrar una superficie grande.

La primera prueba visual seria que un admin pueda abrir la semana y detectar en segundos que bloques estan sin cubrir, y que un coach pueda abrir "Hoy" y saber que tiene que hacer sin leer instrucciones.
