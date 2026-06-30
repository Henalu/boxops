# Hub And BoxWod Integration - BoxOps

## Decision

Decision 2026-06-29: BoxOps y BoxWod son apps separadas dentro del mismo hub y comparten el Supabase del hub.

El objetivo es que un owner, admin o coach use la misma identidad, organizacion, centros y perfil base en ambas apps cuando el tenant tenga ambos productos activos.

Decision aplicada 2026-06-29: para MVP, todo tenant con BoxOps tiene BoxWod incluido. No se usa una tabla de app access como bloqueo inicial; esa capa queda para billing, planes o venta standalone futura.

## Compartido

- Supabase Auth (`auth.users`).
- `organizations`.
- `centers`.
- `person_profiles`.
- Pertenencia/acceso base al tenant.
- Roles compartidos en `organization_memberships.role`, anadiendo `athlete`.
- Helper `is_hub_member` para membership activa del hub.
- Console, billing y activacion de productos cuando se implemente packaging separado.

## Separado

BoxOps owns:

- horarios operativos;
- staff/coaches operativos;
- cobertura;
- fichaje;
- documentos laborales;
- plantillas;
- eventos/festivos;
- permisos y auditoria operativa.

BoxWod owns:

- experiencia atleta;
- reservas/cancelaciones;
- waitlist;
- WOD publicado;
- resultados;
- perfil deportivo;
- progreso;
- comunidad basica.

## Reglas

- No crear usuarios o perfiles duplicados para BoxWod si ya existen en el hub.
- No usar `is_org_member` como helper de hub: en BoxOps queda como acceso operativo y excluye `athlete`.
- Usar `is_hub_member` para superficies compartidas o BoxWod.
- Las capacidades BoxWod se resuelven en helpers `boxwod_*`.
- No meter reservas o WOD dentro de las pantallas operativas de BoxOps.
- No permitir que BoxWod edite `schedule_blocks` directamente desde la experiencia atleta.
- Las clases reservables de BoxWod derivan de `schedule_blocks` mediante `boxwod_class_sessions`.
- Cualquier cambio en Auth, `organizations`, `centers`, `person_profiles`, `organization_memberships`, Console o billing debe revisar impacto en BoxWod.

## Migracion De Hub

`20260629100000_boxwod_hub_role_alignment.sql`:

- anade `athlete` a `organization_memberships.role`;
- crea `is_hub_member`;
- crea `is_boxops_operator`;
- mantiene `is_org_member` como compatibilidad operativa BoxOps, excluyendo `athlete`.

## Pendiente

- Definir fuente canonica de capacidad reservable.
- Definir como Console/billing activa BoxOps, BoxWod o ambos por tenant.
