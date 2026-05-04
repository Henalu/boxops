# Pitch defendible del stack

Esta es la explicacion para cuando alguien pregunta "por que este stack" y no queremos responder con "porque esta de moda" mientras miramos al suelo.

## La version corta

BoxOps usa Next.js, React, TypeScript, Tailwind, shadcn/ui, Supabase y Vercel porque el producto necesita avanzar rapido sin renunciar a auth, tenant safety, Postgres, RLS y una UI operativa decente.

No es un stack elegido para impresionar. Es un stack elegido para no construir desde cero cosas que ya existen y que suelen romper productos pequenos cuando crecen.

## Por que tiene sentido para BoxOps

BoxOps necesita:

- login
- roles
- multi-tenant
- datos relacionales
- RLS
- paneles protegidos
- lecturas de datos en servidor
- mutaciones controladas
- UI admin clara
- deploy sencillo

El stack actual cubre eso sin montar una arquitectura de empresa grande antes de tener producto validado.

## Que nos da ahora

Next.js 16:

- App Router
- layouts protegidos
- Server Components
- Server Actions
- buen encaje con Vercel

React 19:

- componentes reutilizables
- interaccion donde haga falta
- base moderna sin inventar framework propio

TypeScript:

- menos errores tontos
- tipos desde Supabase
- roles, estados y entidades mas claros

Tailwind CSS 4:

- velocidad para construir UI
- responsive controlable
- menos CSS suelto sin dueno

shadcn/ui + Radix + lucide:

- componentes base
- accesibilidad razonable
- iconografia consistente
- menos tiempo fabricando botones como si fuera 2012

Supabase:

- Auth
- Postgres
- RLS
- SSR helpers
- seeds y migraciones locales
- Storage y Realtime cuando entren documentos o live-ish updates

Vercel:

- deploy natural para Next.js
- previews
- env vars
- camino simple hacia produccion

## Que nos evita

Nos evita:

- montar auth propia
- escribir un sistema de sesiones casero
- poner permisos solo en el frontend
- pelear con una API separada prematura
- tener una base de datos sin RLS
- construir componentes UI desde cero
- desplegar Next en modo artesanal antes de tiempo

Tambien nos evita una tentacion clasica: crear una plataforma enorme antes de saber si el horario semanal y la cobertura resuelven el problema real.

## Tradeoffs aceptados

No hay stack gratis.

Aceptamos:

- dependencia de Supabase para auth, Postgres y RLS gestionado
- dependencia natural de Vercel para el despliegue mas comodo
- App Router exige disciplina con server/client boundaries
- Server Actions requieren ser cuidadoso con validaciones y redirects
- RLS hay que entenderla, no copiarla con fe
- Tailwind puede volverse ruido si no se extraen patrones cuando toca
- shadcn/ui acelera, pero no reemplaza criterio de producto

Son tradeoffs razonables para MVP y primeros clientes. Si algun dia hay requisitos enterprise fuertes, se revisa. Hoy no hace falta vestir al producto con armadura medieval para ir a comprar pan.

## Como explicarlo a alguien tecnico

BoxOps usa un stack full-stack TypeScript sobre Next.js 16 App Router. Las pantallas protegidas leen datos en Server Components, las mutaciones pasan por Server Actions y Supabase gestiona Auth, Postgres y RLS. La frontera multi-tenant esta en `organization_id` y `organization_memberships`, no en convenciones blandas del frontend.

El objetivo es minimizar infraestructura propia, mantener type safety con tipos generados de Supabase y desplegar facil en Vercel. El producto puede crecer hacia horarios, cobertura, cambios y documentos sin reescribir la base.

## Como explicarlo a alguien no tecnico

BoxOps esta construido con herramientas modernas que ya resuelven piezas delicadas: acceso de usuarios, base de datos, permisos y despliegue.

Eso permite dedicar mas energia al problema real del box:

- horarios
- centros
- coaches
- clases
- cobertura
- cambios

Y menos a reinventar contrasenas, servidores y paneles desde cero. Es decir: pagamos menos impuesto de infraestructura y podemos validar antes si el producto funciona.

## Frase util

> Esto no va de usar tecnologia brillante porque si. Va de ahorrar dolores concretos: auth, permisos, datos por tenant, UI admin y deploy. Bastante tenemos ya con que un coach no pueda estar en dos centros a la misma hora.
