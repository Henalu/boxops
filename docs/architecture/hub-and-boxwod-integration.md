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

## Acceso A Programacion Desde BoxOps

BoxOps ofrece una unica accion contextual `Gestionar WOD` desde el detalle de
un bloque de Horario. La accion no crea ni edita programacion deportiva dentro
de BoxOps: abre BoxWod y deja que BoxWod vuelva a validar sesion, tenant y
capacidad.

Configuracion por entorno:

```env
BOXWOD_APP_URL=https://wod.example.com
```

La configuracion se lee en servidor y se normaliza a un origen HTTP/HTTPS. El
destino siempre es `/programacion`; no se conserva un path, query o credencial
incluida accidentalmente en la URL base.

Contrato de navegacion:

```text
{BOXWOD_APP_URL}/programacion?org=<organization_id>&date=<YYYY-MM-DD>&center=<center_id>&classType=<class_type_id>
```

- `org` y `date` se incluyen siempre desde el tenant activo y el bloque.
- `center` y `classType` se incluyen solo cuando estan disponibles.
- Los valores de centro y tipo son IDs compartidos del hub, no nombres visibles.
- No se incluyen tokens, cookies, emails, nombres de personas, notas ni otros
  datos sensibles.
- La accion solo se renderiza tras confirmar en servidor
  `boxwod_can_program(organization_id)` con la sesion actual.
- Si `BOXWOD_APP_URL` falta, la accion se oculta en produccion y queda
  deshabilitada en entornos internos para hacer visible la configuracion
  pendiente sin generar un enlace roto.

## Sesion Compartida Entre Subdominios

Compartir Supabase no comparte automaticamente las cookies del navegador. Por
defecto son host-only. Si BoxOps y BoxWod se publican como subdominios del mismo
dominio controlado, ambas aplicaciones deben configurar el mismo valor:

```env
NEXT_PUBLIC_HUB_AUTH_COOKIE_DOMAIN=example.com
```

Con `ops.example.com` y `wod.example.com`, esta opcion aplica a los clientes
Supabase SSR y browser una cookie con `Domain=example.com`, `Path=/`,
`SameSite=Lax` y `Secure` en produccion. Como ambas aplicaciones usan el mismo
proyecto Supabase, tambien comparten el nombre y formato de la sesion. BoxWod
debe seguir llamando a Supabase para validar el usuario y a
`boxwod_can_program` para autorizar la superficie.

Guardrails:

- Configurar el dominio padre solo si todos sus subdominios con acceso son de
  confianza; ampliar el dominio de cookie amplia tambien la frontera de
  confianza de la sesion.
- No usar `localhost`, una IP, un esquema, puerto o path como dominio de cookie.
- Si las aplicaciones estan en dominios registrables distintos, una cookie no
  puede transferir la sesion. En ese caso hace falta login independiente o un
  flujo SSO futuro; nunca se debe enviar el access token o refresh token en la
  URL.
- Tras activar el dominio compartido en un entorno que ya tenia cookies
  host-only, cerrar sesion y volver a entrar evita que convivan cookies antiguas
  y nuevas durante la prueba de despliegue.
- La prueba automatizada usa una cookie sintetica sin credenciales reales para
  confirmar que el navegador la entrega a ambos subdominios y no a un dominio
  ajeno. La comprobacion final HTTPS sigue siendo obligatoria por entorno.

## Migracion De Hub

`20260629100000_boxwod_hub_role_alignment.sql`:

- anade `athlete` a `organization_memberships.role`;
- crea `is_hub_member`;
- crea `is_boxops_operator`;
- mantiene `is_org_member` como compatibilidad operativa BoxOps, excluyendo `athlete`.

## Pendiente

- Definir fuente canonica de capacidad reservable.
- Definir como Console/billing activa BoxOps, BoxWod o ambos por tenant.
