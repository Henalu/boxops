# Contrato Conector ChatGPT Operativo

Estado: `CG.4B` tecnico. `CG.0` contrato documental y `CG.1` lectura operativa ya estan implementados; `CG.2A` anade preview de plantillas sin persistencia, `CG.2B` crea borradores reales de plantilla desde una preview revalidada, `CG.3A` prepara la aplicacion confirmada con resumen verificable y confirmacion interna, `CG.3B` aplica plantillas al horario real solo con `confirmation_token` valido, plan revalidado, idempotencia y auditoria, `CG.4A` anade packaging MCP/JSON-RPC interno en `/api/chatgpt/mcp`, y `CG.4B` anade OAuth 2.1 con PKCE, metadata, bearer scoped, expiracion y revocacion. `CG.4` completo sigue abierto hasta prueba real controlada en ChatGPT/dev mode o bloqueo verificable.

Fecha: 2026-06-30.

## Objetivo

Permitir que un usuario autorizado conecte su cuenta de BoxOps desde ChatGPT y use lenguaje natural para:

- consultar informacion operativa rapida del tenant;
- preparar borradores de plantillas de horario;
- aplicar cambios solo en fases posteriores, con confirmacion humana, permisos, idempotencia y auditoria.

BoxOps sigue siendo la autoridad. ChatGPT interpreta intencion y llama herramientas; BoxOps valida sesion, tenant, rol, permisos, IDs, estado y reglas de negocio antes de devolver o cambiar nada.

## Superficie De Transporte

Decision 2026-06-30: el transporte primario para `CG.4` sera Apps SDK/MCP, porque es la via oficial mas alineada con herramientas estructuradas dentro de ChatGPT. GPT Action/OpenAPI queda como fallback comercial si hiciera falta una demo muy acotada, pero no se implementa en `CG.4A`.

- Apps SDK/MCP: opcion elegida para el packaging. Encaja con herramientas estructuradas, metadata, autenticacion y posible UI embebida futura.
- GPT Action/OpenAPI: fallback no implementado; no debe duplicar reglas de negocio ni abrir SQL/API directa.

Regla importante: el transporte es solo una puerta. Las herramientas reales deben vivir del lado servidor de BoxOps o en una capa controlada por BoxOps, nunca como acceso directo a Supabase.

Referencias oficiales usadas para orientar el contrato:

- Apps SDK quickstart: https://developers.openai.com/apps-sdk/quickstart
- Definicion de herramientas en Apps SDK: https://developers.openai.com/apps-sdk/plan/tools
- MCP server en Apps SDK: https://developers.openai.com/apps-sdk/concepts/mcp-server
- Autenticacion en Apps SDK/MCP: https://developers.openai.com/apps-sdk/build/auth
- Seguridad y privacidad Apps SDK: https://developers.openai.com/apps-sdk/guides/security-privacy

## Principios

- Una herramienta, una accion: lecturas y escrituras van separadas.
- Entradas explicitas: fechas, horas, centro, tipo y filtros deben tener schema claro.
- Salidas previsibles: devolver IDs reutilizables y campos estructurados, no texto suelto como unica respuesta.
- Tenant derivado de la sesion: no confiar en `organization_id` enviado por el modelo.
- Permisos reales: aplicar las mismas capacidades que la app, con frontera por organizacion y centro.
- Lectura antes que escritura: `CG.1` solo lee; `CG.2` crea borradores; `CG.3` aplica con confirmacion.
- Datos minimos: devolver solo lo necesario para responder la pregunta o preparar la accion.
- Confirmacion humana en mutaciones: nada irreversible o masivo se aplica por una unica frase ambigua.
- Auditoria proporcional: mutaciones siempre auditadas; lecturas sensibles o denegadas tambien.
- No prompts crudos por defecto: registrar IDs, herramienta, resultado y hash/resumen operativo cuando haga falta.

## Fuera De Alcance Inicial

- Acceso directo de ChatGPT a Supabase.
- SQL libre.
- `SUPABASE_SERVICE_ROLE_KEY` expuesta al conector, modelo, cliente o GPT Action.
- Storage privado, URLs firmadas documentales, documentos sensibles o archivos.
- Fichaje, payroll, nominas, contratos, firmas, ubicacion, RRHH sensible o inferencias personales.
- Decidir cobertura, asignar coaches automaticamente, aprobar cambios, ausencias, fichajes, cierres, horas extra o nominas.
- Fine-tuning, entrenamiento o evaluacion con datos privados del tenant.

## Autenticacion Y Contexto

Flujo objetivo:

1. El usuario abre ChatGPT y conecta BoxOps.
2. BoxOps autentica al usuario mediante OAuth o un token scoped especifico del conector.
3. BoxOps emite una sesion/token con alcance limitado: usuario, memberships, capacidades y expiracion.
4. Cada llamada de herramienta revalida la sesion y resuelve la organizacion activa.
5. Si el usuario pertenece a varias organizaciones, el conector debe pedir seleccion o usar una herramienta de resolucion segura.

El token del conector debe:

- estar scoped a usuario real y organizacion activa, o exigir seleccion explicita;
- expirar y poder revocarse;
- no contener secretos internos;
- no autorizar acciones fuera de las capacidades declaradas;
- no permitir que el modelo elija una organizacion ajena por texto.

Estado `CG.4B`:

- Se crea `/api/chatgpt/mcp` como endpoint MCP/JSON-RPC server-side con `initialize`, `ping`, `tools/list` y `tools/call`.
- `GET /api/chatgpt/mcp` devuelve discovery minimo no cacheable con estado, endpoint, tools, `protected_resource_metadata`, authorization server y revocation endpoint.
- `POST /api/chatgpt/mcp` no acepta acceso anonimo a `tools/list` ni `tools/call`; acepta `Authorization: Bearer` del conector o, para pruebas internas, sesion BoxOps existente por cookie server-side.
- La opcion elegida es OAuth 2.1 authorization code + PKCE con access token opaco scoped. No se implementa un token manual pegado por el usuario ni GPT Action.
- Metadata publicada:
  - `/.well-known/oauth-protected-resource`
  - `/.well-known/oauth-authorization-server`
- Endpoints OAuth:
  - `GET /api/chatgpt/oauth/authorize`
  - `POST /api/chatgpt/oauth/token`
  - `POST /api/chatgpt/oauth/revoke`
- El access token del conector se devuelve una sola vez a ChatGPT; BoxOps persiste solo `token_hash`, usuario, organizacion, membership, scopes, expiracion, estado y metadata minimizada.
- Para mantener RLS sin `service_role`, durante account linking BoxOps cifra una credencial Supabase de usuario real de vida corta. El token del conector expira como maximo a los 45 minutos y nunca mas tarde que esa credencial interna. No hay refresh token del conector en este corte.
- La revocacion marca el token como `revoked`; las validaciones posteriores devuelven `invalid_token`.
- Scopes:
  - `boxops.schedule.read`: lecturas operativas minimizadas.
  - `boxops.templates.write`: preview, borradores y preparacion de aplicacion.
  - `boxops.templates.apply`: aplicacion confirmada con `confirmation_token`.
- El transporte no lee ni escribe datos operativos de Supabase directamente; solo valida auth/scopes y ejecuta `chatGptConnectorTools`, que revalidan usuario, tenant, membership, permisos, IDs y estado en cada llamada.
- Prueba real ChatGPT/dev mode: pendiente desde este entorno hasta tener URL publica HTTPS, configuracion del conector en ChatGPT y tenant QA controlado. No se inventa evidencia de conexion real.

Herramienta auxiliar candidata para futuro:

```json
{
  "tool": "resolve_active_organization",
  "purpose": "Listar memberships accesibles y seleccionar organizacion activa cuando haya mas de una.",
  "phase": "CG.1/CG.4",
  "mutation": false
}
```

## Formatos Comunes

Fechas y horas:

- `date`: `YYYY-MM-DD`
- `time`: `HH:mm` en 24h
- `timezone`: derivada de organizacion/centro; no se acepta como autoridad si contradice el centro
- `weekday`: `monday`, `tuesday`, `wednesday`, `thursday`, `friday`, `saturday`, `sunday`

IDs:

- `center_id`, `class_type_id`, `schedule_block_id`, `coach_id`, `template_id`
- ChatGPT puede reutilizar IDs devueltos por herramientas previas.
- BoxOps debe validar que cada ID pertenece al tenant activo.

Respuesta base recomendada:

```json
{
  "ok": true,
  "data": {},
  "warnings": [],
  "request_id": "corr_..."
}
```

Error base recomendado:

```json
{
  "ok": false,
  "error": {
    "code": "permission_denied",
    "message": "No tienes permiso para consultar ese horario.",
    "details": {}
  },
  "request_id": "corr_..."
}
```

## Herramientas CG.1 - Lectura Operativa

Estado implementacion interna 2026-06-28: `CG.1` queda implementado como capa server-side reutilizable en `src/lib/chatgpt-connector-tools.ts`, apoyada por helpers puros en `src/lib/chatgpt-connector-core.ts`. No crea ruta publica, Apps SDK/MCP server, GPT Action, migraciones, seeds ni UI. La futura capa de transporte debe llamar estas herramientas o una adaptacion equivalente, no Supabase directamente.

Decisiones de implementacion CG.1:

- Todas las herramientas devuelven `{ ok, data|error, warnings, request_id }`.
- La organizacion se resuelve desde sesion/membership; si se recibe `organization_id`, se valida contra memberships activas y no se acepta como autoridad libre del modelo.
- Cada consulta aplica `organization_id` en las lecturas y valida IDs de centro/tipo dentro del tenant activo.
- `get_schedule_for_day`, `get_schedule_at_time` y `get_my_schedule` devuelven `coverage_status` calculado con las reglas actuales de `schedule_blocks`.
- `get_my_schedule` solo responde si el usuario autenticado tiene una `person_profile` activa/visible y exactamente un `coach_profile` activo vinculado a esa persona.
- Los rangos de `get_my_schedule` se limitan a 31 dias para evitar lecturas masivas accidentales.
- `class_types` no modela todavia duracion por defecto; `default_duration_minutes` se devuelve como `null` y se incluye warning.
- Fallos inesperados internos se normalizan como `internal_error` sin exponer mensajes SQL/Supabase.

### `list_centers`

Proposito: listar centros visibles de la organizacion activa.

Permiso candidato: miembro activo del tenant; la salida se limita a centros visibles segun rol/capacidad.

Input:

```json
{
  "include_inactive": false
}
```

Output:

```json
{
  "centers": [
    {
      "center_id": "uuid",
      "name": "Box City",
      "timezone": "Europe/Madrid",
      "status": "active"
    }
  ]
}
```

Reglas:

- No devuelve direccion completa si no es necesaria.
- No devuelve configuracion interna, limites comerciales ni datos de billing.

### `list_class_types`

Proposito: listar tipos de actividad activos para resolver frases como "open box", "cross", "haltero" o equivalentes configurados.

Permiso candidato: miembro activo del tenant con acceso al horario.

Input:

```json
{
  "center_id": "uuid|null",
  "include_inactive": false
}
```

Output:

```json
{
  "class_types": [
    {
      "class_type_id": "uuid",
      "name": "Cross Training",
      "default_duration_minutes": null,
      "status": "active"
    }
  ]
}
```

Reglas:

- Si `center_id` existe, validar visibilidad del centro.
- Si hay alias futuros, devolverlos como metadata no sensible.
- Mientras no exista duracion por defecto en `class_types`, no inventar 60 minutos: devolver `null`.

### `get_schedule_for_day`

Proposito: consultar bloques de un dia, opcionalmente filtrados por centro.

Permiso candidato:

- `owner`, `admin`, `manager` o capacidad equivalente: horario visible segun su alcance.
- `coach`: solo horario propio o centros/bloques visibles segun politica de app.

Input:

```json
{
  "date": "2026-07-07",
  "center_id": "uuid|null",
  "class_type_id": "uuid|null",
  "class_type_name": "Cross Training|null",
  "status": "active|draft|cancelled|all"
}
```

Output:

```json
{
  "date": "2026-07-07",
  "timezone": "Europe/Madrid",
  "blocks": [
    {
      "schedule_block_id": "uuid",
      "center_id": "uuid",
      "center_name": "Box City",
      "class_type_id": "uuid",
      "class_type_name": "Cross Training",
      "starts_at": "09:00",
      "ends_at": "10:00",
      "status": "scheduled",
      "coverage_status": "covered",
      "coaches": [
        {
          "coach_id": "uuid",
          "display_name": "Ana Garcia",
          "assignment_status": "assigned"
        }
      ]
    }
  ]
}
```

Reglas:

- No devuelve email, telefono, notas internas, salario, contrato ni informacion sensible del coach.
- Si el dia tiene muchos bloques, se puede paginar o resumir por rango.
- `status = active` filtra estados operativos activos actuales: `scheduled`, `uncovered` y `changed`.

### `get_schedule_at_time`

Proposito: responder preguntas directas como "quien da la clase del martes a las 11:15?" o "que hay en Box City de 9 a 21?".

Permiso candidato: mismo que `get_schedule_for_day`.

Input:

```json
{
  "date": "2026-07-07",
  "time": "11:15",
  "center_id": "uuid|null",
  "center_name": "Box City|null",
  "class_type_id": "uuid|null",
  "class_type_name": "Cross Training|null",
  "match_mode": "overlapping|starting_at"
}
```

Output:

```json
{
  "date": "2026-07-07",
  "time": "11:15",
  "matches": [
    {
      "schedule_block_id": "uuid",
      "center_id": "uuid",
      "center_name": "Box City",
      "class_type_id": "uuid",
      "class_type_name": "Cross Training",
      "starts_at": "11:00",
      "ends_at": "12:00",
      "status": "scheduled",
      "coaches": [
        {
          "coach_id": "uuid",
          "display_name": "Ana Garcia",
          "assignment_status": "assigned"
        }
      ],
      "coverage_status": "covered"
    }
  ]
}
```

Reglas:

- `overlapping` responde "que clase hay a esa hora".
- `starting_at` responde "que clase empieza a esa hora".
- Si `center_name` es ambiguo, devolver `center_ambiguous` con candidatos.
- Si no hay clase, responder con estado vacio, no inventar.
- `empty_result_mode = error` queda disponible internamente para devolver `schedule_not_found` cuando el transporte necesite error en vez de lista vacia.

### `get_my_schedule`

Proposito: consultar el horario propio del usuario conectado cuando tiene persona/coach asociado.

Permiso candidato: usuario autenticado con perfil personal o coach vinculado.

Input:

```json
{
  "date_from": "2026-07-07",
  "date_to": "2026-07-13",
  "center_id": "uuid|null"
}
```

Output:

```json
{
  "person_id": "uuid",
  "display_name": "Ana Garcia",
  "blocks": [
    {
      "schedule_block_id": "uuid",
      "date": "2026-07-07",
      "center_id": "uuid",
      "center_name": "Box City",
      "class_type_id": "uuid",
      "class_type_name": "Cross Training",
      "starts_at": "11:00",
      "ends_at": "12:00",
      "status": "scheduled",
      "coverage_status": "covered",
      "assignment_status": "assigned"
    }
  ]
}
```

Reglas:

- Nunca acepta `person_id` externo para leer el horario de otra persona.
- Para managers que quieran ver otro coach, eso debe ser otra herramienta futura con permiso explicito.
- Si la persona/ficha propia no existe, no esta visible/activa o es ambigua, devolver `permission_denied` con detalle tecnico minimizado.
- No devuelve la lista completa de coaches del bloque; solo el contexto del bloque y el estado de la asignacion propia.

## Herramientas CG.2 - Plantillas En Borrador

### `preview_schedule_template`

Proposito: previsualizar una plantilla por rango, centro, dias, horas, tipo y asignaciones opcionales, sin escribir en tablas definitivas.

Permiso candidato: capacidad de gestion de horario/plantillas.

Estado implementacion interna 2026-06-29: `CG.2A` queda implementado en `src/lib/chatgpt-connector-tools.ts` como herramienta server-side reutilizable `preview_schedule_template`, apoyada por helpers puros en `src/lib/chatgpt-connector-core.ts`. No crea ruta publica, Apps SDK/MCP server, GPT Action, migraciones, seeds, UI, tablas ni drafts reales. La preview se genera en memoria y el `preview_id` es deterministico sobre payload normalizado + tenant, no una referencia persistida.

Decisiones CG.2A:

- Rango maximo: 62 dias.
- Tamano maximo: 500 bloques generados por preview.
- `sample_blocks` se limita a 20 bloques.
- La zona horaria se deriva del centro/organizacion; el modelo no acepta `timezone` como autoridad del payload.
- Si el centro no tiene horario/apertura modelado como campo canonico, CG.2A no interpreta `metadata` libre para inventar esa validacion.
- Los warnings no bloqueantes incluyen solapes del mismo coach dentro de la preview, conflicto con horario real activo ya asignado, certificacion requerida ausente y slots parciales ignorados.
- `CG.2A` no sirve para crear borradores: `create_schedule_template_draft` debe revalidar permisos y payload en `CG.2B`, sin confiar en estado persistido de preview.

Input:

```json
{
  "center_id": "uuid",
  "name": "Plantilla Julio Box City",
  "date_from": "2026-07-01",
  "date_to": "2026-07-31",
  "rules": [
    {
      "weekdays": ["monday", "tuesday", "wednesday", "thursday", "friday"],
      "starts_at": "09:00",
      "ends_at": "21:00",
      "slot_duration_minutes": 60,
      "class_type_id": "uuid",
      "coach_ids": []
    }
  ]
}
```

Output:

```json
{
  "preview_id": "prev_...",
  "summary": {
    "center_id": "uuid",
    "center_name": "Box City",
    "date_from": "2026-07-01",
    "date_to": "2026-07-31",
    "range_days": 31,
    "sample_size": 20,
    "total_blocks": 253,
    "warnings_count": 0
  },
  "sample_blocks": [
    {
      "center_id": "uuid",
      "center_name": "Box City",
      "date": "2026-07-01",
      "starts_at": "09:00",
      "ends_at": "10:00",
      "class_type_id": "uuid",
      "class_type_name": "Cross Training",
      "coach_names": []
    }
  ],
  "warnings": []
}
```

Reglas:

- Validar rango maximo antes de generar una previsualizacion masiva.
- Validar horario de centro cuando exista.
- Validar solapes y disponibilidad si se incluyen coaches.
- La previsualizacion no aplica al horario real.
- El `preview_id` no se persiste en CG.2A; se podra tratar como efimero en el transporte futuro y debe revalidarse en CG.2B antes de crear cualquier borrador.

### `create_schedule_template_draft`

Proposito: crear una plantilla en borrador a partir de una previsualizacion confirmada.

Permiso candidato: capacidad de gestion de plantillas.

Estado implementacion interna 2026-06-29: `CG.2B` queda implementado en `src/lib/chatgpt-connector-tools.ts` como herramienta server-side reutilizable `create_schedule_template_draft`, apoyada por helpers puros en `src/lib/chatgpt-connector-core.ts`. La herramienta no acepta un `preview_id` como referencia persistida porque CG.2A no guarda previews; exige el payload completo, recalcula internamente la preview con la misma logica de `preview_schedule_template` y solo crea el borrador si el `preview_id` recibido coincide.

Decisiones CG.2B:

- Entradas revalidadas: sesion, tenant activo, membership, rol/capacidad de gestion, scope sensible, centro activo, tipos activos, coaches asignables, fechas, horas, rango maximo, tamano maximo, `preview_id`, `idempotency_key` y `rules[]`.
- Escrituras permitidas: solo `schedule_templates` y `schedule_template_blocks`.
- `schedule_templates` se crea con `status = "draft"`, `template_type = "weekly"`, `center_id`, `valid_from`, `valid_until` y metadata minimizada `source = "chatgpt_connector"`, `preview_id`, hash de payload e hash de idempotencia.
- `schedule_template_blocks` se deriva de las reglas semanales y no guarda notas privadas.
- Idempotencia sin tabla nueva: se busca un borrador previo del tenant con `source = "chatgpt_connector"` e `idempotency_key_hash`. Si el hash de payload/preview coincide, se devuelve el borrador existente; si no coincide, devuelve `idempotency_conflict`.
- Limitacion consciente: sin indice unico ni tabla/RPC transaccional nueva, dos llamadas concurrentes con la misma clave podrian duplicar antes de que una vea la otra. La garantia fuerte queda pendiente de una migracion explicita si CG.3/CG.4 lo exige.
- El modelo actual de `schedule_template_blocks` solo soporta un `default_coach_profile_id`; si una regla trae varios `coach_ids`, el borrador guarda el primero como coach por defecto y devuelve warning. La cobertura real no se decide aqui.
- CG.2B no escribe en `schedule_blocks` ni `schedule_block_assignments`, no aplica plantillas y no crea auditoria operacional separada para evitar mutaciones/tablas fuera del corte. La trazabilidad minima queda en metadata controlada; auditoria completa de acciones aplicadas queda en CG.3.

Input:

```json
{
  "preview_id": "prev_...",
  "center_id": "uuid",
  "name": "Plantilla Julio Box City",
  "date_from": "2026-07-01",
  "date_to": "2026-07-31",
  "idempotency_key": "chatgpt_template_...",
  "rules": [
    {
      "weekdays": ["monday", "tuesday", "wednesday", "thursday", "friday"],
      "starts_at": "09:00",
      "ends_at": "21:00",
      "slot_duration_minutes": 60,
      "class_type_id": "uuid",
      "coach_ids": []
    }
  ]
}
```

Output:

```json
{
  "template_id": "uuid",
  "status": "draft",
  "name": "Plantilla Julio Box City",
  "total_blocks": 253,
  "template_block_count": 60,
  "preview_id": "prev_...",
  "created_by_source": "chatgpt_connector"
}
```

Reglas:

- Revalidar permisos y datos de la previsualizacion recalculando la preview completa.
- Exigir coincidencia exacta del `preview_id` recibido con el recalculado.
- Usar `idempotency_key` para evitar duplicados razonables si ChatGPT reintenta.
- Rechazar la reutilizacion de una misma clave con otro payload mediante `idempotency_conflict`.
- No aplicar al horario semanal ni real todavia.

## Herramienta CG.3 - Aplicacion Confirmada

### `prepare_schedule_template_application`

Proposito: preparar la aplicacion de una plantilla al horario real, devolviendo un resumen verificable y un `confirmation_token`, sin aplicar nada todavia.

Permiso candidato: capacidad explicita de gestion/aplicacion de plantillas.

Estado implementacion interna 2026-06-30: `CG.3A` queda implementado en `src/lib/chatgpt-connector-tools.ts` como herramienta server-side reutilizable `prepare_schedule_template_application`, apoyada por helpers puros en `src/lib/chatgpt-connector-core.ts`. No crea ruta publica, Apps SDK/MCP server, GPT Action, seeds, UI, `schedule_blocks` ni `schedule_block_assignments`. Desde `CG.3B`, prepara tambien una fila interna en `chatgpt_connector_confirmations` para que el token sea verificable sin depender de un checksum interpretable.

Input:

```json
{
  "template_id": "uuid",
  "center_id": "uuid",
  "date_from": "2026-07-01",
  "date_to": "2026-07-31",
  "idempotency_key": "chatgpt_apply_..."
}
```

Output:

```json
{
  "confirmation_required": true,
  "confirmation_token": "confirm_...",
  "confirmation_expires_at": "2026-07-01T10:15:00.000Z",
  "template": {
    "template_id": "uuid",
    "name": "Plantilla Julio Box City",
    "status": "draft",
    "template_type": "weekly"
  },
  "center": {
    "center_id": "uuid",
    "name": "Box City",
    "timezone": "Europe/Madrid"
  },
  "plan": {
    "plan_hash": "hash",
    "summary": {
      "date_from": "2026-07-01",
      "date_to": "2026-07-31",
      "total_candidate_blocks": 253,
      "blocks_to_create": 253,
      "duplicate_count": 0,
      "conflict_count": 0,
      "estimated_assignments_to_create": 180
    },
    "candidate_blocks": [],
    "duplicate_blocks": [],
    "conflicts": [],
    "warnings": []
  }
}
```

Decisiones CG.3A:

- Revalida sesion, organizacion activa, membership activa y capacidad de gestion operativa antes de leer nada.
- Valida `template_id`, `center_id`, rango, plantilla del tenant, `template_type = "weekly"`, estado permitido y centro activo del tenant.
- Estados permitidos para preparar: `draft` y `active`. `archived`, otro tipo o centro incompatible devuelven `template_not_applicable`.
- Un `template_id` inexistente, de otro tenant o no visible devuelve `template_not_found`.
- La plantilla debe tener bloques; cada bloque debe pertenecer al centro solicitado y usar tipos de clase activos.
- Los coaches por defecto se revalidan como asignables dentro del tenant; si fallan, la plantilla no es aplicable.
- El plan se calcula en memoria: candidatos, duplicados previsibles, conflictos de solape de centro, conflictos de coach, certificacion requerida ausente, totales estimados y warnings.
- El `confirmation_token` tiene formato versionado `confirm_v1.<confirmation_id>.<secret>`. El secreto crudo solo se devuelve al llamador; BoxOps persiste `token_hash`, usuario, organizacion, plantilla, centro, rango, `plan_hash`, hash de `idempotency_key`, expiracion y un snapshot minimizado del plan.
- El token no es una autorizacion independiente ni sustituye permisos/RLS. `CG.3B` recalcula el plan, comprueba expiracion, valida el hash del token persistido y exige coincidencia exacta con la confirmacion antes de mutar.
- La confirmacion interna vive en `chatgpt_connector_confirmations` con RLS para el usuario/tenant y solo guarda datos operativos minimizados; no guarda prompt, token crudo, secretos, documentos ni datos sensibles.
- No escribe en `schedule_blocks`, `schedule_block_assignments`, Storage, documentos, fichaje, payroll, firmas, ubicacion ni RRHH sensible.

Copy minimo de confirmacion para `CG.3A`:

> Vas a aplicar la plantilla "Plantilla Julio Box City" en Box City del 2026-07-01 al 2026-07-31. Se crearan 253 bloques y 180 asignaciones desde coaches por defecto. Hay 0 duplicados previsibles y 0 conflictos. No se cambiaran documentos, fichajes, nominas ni datos sensibles. Confirma para aplicar.

### `apply_schedule_template`

Estado implementacion interna 2026-06-30: `CG.3B` queda implementado en `src/lib/chatgpt-connector-tools.ts` como herramienta server-side reutilizable `apply_schedule_template`. Usa la RPC transaccional `apply_chatgpt_schedule_template_application` creada en `supabase/migrations/20260630083015_chatgpt_connector_apply_schedule_template.sql`. No crea ruta publica, Apps SDK/MCP server, GPT Action, seeds ni UI.

Proposito: aplicar una plantilla al horario real solo despues de resumen y confirmacion humana.

Permiso candidato: capacidad explicita de aplicar plantillas.

Input:

```json
{
  "template_id": "uuid",
  "date_from": "2026-07-01",
  "date_to": "2026-07-31",
  "center_id": "uuid",
  "confirmation_token": "confirm_...",
  "idempotency_key": "chatgpt_apply_..."
}
```

Output:

```json
{
  "applied": true,
  "template_id": "uuid",
  "created_blocks": 253,
  "created_assignments": 180,
  "skipped_duplicates": 0,
  "idempotent_replay": false,
  "audit_event_id": "uuid"
}
```

Decisiones CG.3B:

- Revalida sesion autenticada, organizacion activa, membership activa y capacidad de gestion operativa antes de leer o mutar.
- Valida token ausente como `confirmation_required`; token mal formado, expirado, hash incorrecto, usuario/tenant/plantilla/centro/rango/idempotencia distintos o `plan_hash` distinto como `confirmation_mismatch`.
- Recalcula el plan con la misma logica de `prepare_schedule_template_application`. Si el plan actual no coincide con la confirmacion, no muta.
- Si el plan confirmado trae conflictos relevantes o aparece un conflicto en la RPC antes de insertar, devuelve `template_not_applicable` y no aplica parcialmente.
- La idempotencia fuerte de CG.3B vive en base: `chatgpt_connector_confirmations` guarda `idempotency_key_hash`, la RPC toma un advisory lock por tenant+hash y rechaza la reutilizacion de la clave con otro payload como `idempotency_conflict`.
- Un replay con la misma clave/token/plan ya aplicado devuelve `idempotent_replay = true` y no duplica bloques ni asignaciones.
- La RPC bloquea temporalmente `schedule_blocks` y `schedule_block_assignments` durante la comprobacion e insercion para evitar carreras entre duplicados/conflictos e inserciones.
- La RPC inserta `schedule_blocks` con metadata minimizada `source = "chatgpt_connector"`, `tool`, `plan_hash`, hash de idempotencia, `confirmation_id` y `request_id`.
- La RPC inserta `schedule_block_assignments` con `source = "template"` para coaches por defecto cuando `required_coaches > 0` y existe coach por defecto asignable.
- La RPC registra auditoria en `operational_audit_events` sobre la plantilla con `action = "applied_to_week"`, `source = "chatgpt_connector"`, usuario/tenant derivados por la RPC existente, `tool`, `plan_hash`, hash de idempotencia, conteos, rango y `request_id`. No registra token crudo, prompts ni arrays de entidades.
- No escribe Storage, documentos, fichaje, payroll, firmas, ubicacion ni RRHH sensible.

Copy minimo de confirmacion:

> Vas a aplicar la plantilla "Plantilla Julio Box City" en Box City del 2026-07-01 al 2026-07-31. Se crearan 253 bloques. No se cambiaran documentos, fichajes, nominas ni datos sensibles. Confirma para aplicar.

## Packaging CG.4A/CG.4B - MCP Y Account Linking

Estado implementacion interna 2026-06-30: `CG.4A` queda implementado como packaging MCP/JSON-RPC minimo en `src/lib/chatgpt-connector-mcp.ts` y `src/app/api/chatgpt/mcp/route.ts`. No instala SDK nuevo, no crea UI, no crea GPT Action, no crea migraciones y no implementa OAuth/account linking real.

Actualizacion `CG.4B` 2026-06-30: se anade account linking OAuth 2.1 + PKCE sobre el mismo MCP. Se crea migracion acotada para authorization codes y access tokens opacos, metadata `.well-known`, endpoints de authorize/token/revoke, validacion Bearer por RPC y scopes por herramienta. No se crea GPT Action, no se abre SQL libre, no se usa `service_role` en runtime del conector y no se accede a Storage.

Endpoint:

- `GET /api/chatgpt/mcp`: discovery no cacheable para pruebas internas, demo tecnica y metadatos OAuth.
- `POST /api/chatgpt/mcp`: JSON-RPC 2.0 con metodos `initialize`, `ping`, `tools/list` y `tools/call`.
- `OPTIONS /api/chatgpt/mcp`: metodos permitidos, no cacheable.

Herramientas expuestas:

- `list_centers`
- `list_class_types`
- `get_schedule_for_day`
- `get_schedule_at_time`
- `get_my_schedule`
- `preview_schedule_template`
- `create_schedule_template_draft`
- `prepare_schedule_template_application`
- `apply_schedule_template`

Decisiones CG.4A:

- El endpoint es una puerta de transporte: no usa `createClient`, no consulta tablas, no muta datos y no accede a Storage.
- `tools/list` y `tools/call` requieren sesion BoxOps existente o Bearer OAuth scoped. Sin auth devuelven `401` con error MCP `authentication_required` y `WWW-Authenticate` apuntando a protected resource metadata.
- La salida de herramientas se envuelve como resultado MCP con `structuredContent`, `content` textual JSON, `isError` cuando la herramienta falla y `_meta.request_id`.
- Los schemas MCP exponen fechas, horas, IDs, `idempotency_key` y `confirmation_token` donde toca; el tenant sigue derivandose de sesion, con `organization_id` solo como seleccion validada para usuarios multi-tenant.
- `requested_scope` queda como canal explicito para detectar intentos fuera de alcance; el transporte no expone flags especificos de datos sensibles.
- `apply_schedule_template` sigue dependiendo del token persistido de `CG.3A/CG.3B`; MCP no crea confirmaciones nuevas ni relaja idempotencia.

Decisiones CG.4B:

- OAuth completo es la opcion elegida porque Apps SDK/MCP espera account linking OAuth y protected resource metadata. El token scoped queda como access token opaco emitido por BoxOps dentro de ese flujo.
- Los tokens del conector se guardan solo como hash SHA-256 con prefijo de dominio. El valor crudo no se persiste.
- Los authorization codes son de un solo uso, expiran en 10 minutos y tambien se guardan por hash.
- Los access tokens expiran como maximo a los 45 minutos y nunca despues de la credencial interna cifrada que permite ejecutar con RLS de usuario.
- La credencial interna cifrada exige `CHATGPT_CONNECTOR_CREDENTIAL_SECRET` server-side de alta entropia. Si falta, authorize falla con error controlado.
- La revalidacion de Bearer comprueba token activo, no expirado, no revocado, recurso correcto, scopes suficientes, membership activa, organizacion activa y rol operativo no atleta.
- Si hay Bearer valido, `chatGptConnectorTools` crea un cliente Supabase autenticado como el usuario real y vuelve a validar membership/rol/organizacion antes de cada herramienta.
- Si hay cookie BoxOps pero no Bearer, se conserva el camino interno de CG.4A para pruebas locales.

Pendiente para cerrar `CG.4`:

- Probar en ChatGPT/dev mode o entorno equivalente con URL publica HTTPS y tenant QA controlado.
- Guardar evidencia redacted de `initialize`, `tools/list`, lecturas, borrador, preparacion y aplicacion confirmada.
- Preparar guia comercial final con prompts seguros, limites y criterios de demo.

## Taxonomia De Errores

Errores comunes:

- `authentication_required`: el usuario no esta conectado o la sesion expiro.
- `organization_required`: hay varias organizaciones y falta seleccionar una.
- `permission_denied`: el usuario no tiene capacidad para esa lectura/accion.
- `center_not_found`: el centro no existe o no es visible.
- `center_ambiguous`: el nombre del centro coincide con varios centros visibles.
- `class_type_not_found`: el tipo de actividad no existe o no es visible.
- `coach_not_found`: coach inexistente o fuera del tenant/centro permitido.
- `invalid_date_range`: rango vacio, invertido o demasiado grande.
- `invalid_time_range`: hora fuera de formato, rango invertido o duracion invalida.
- `schedule_not_found`: no hay bloque que coincida con la consulta.
- `template_preview_required`: falta previsualizacion valida para crear borrador.
- `template_not_found`: la plantilla no existe, es de otro tenant o no es visible con la sesion actual.
- `template_not_applicable`: la plantilla existe pero no se puede preparar/aplicar por estado, tipo, centro, bloques, tipos de clase o coaches por defecto.
- `confirmation_required`: la accion necesita confirmacion humana.
- `confirmation_mismatch`: la confirmacion no corresponde exactamente a la accion actual.
- `idempotency_conflict`: la clave ya se uso con otro payload.
- `coach_unavailable`: el coach tiene solape o no esta disponible.
- `sensitive_scope_not_allowed`: la pregunta o accion pide datos fuera del alcance permitido.
- `rate_limited`: exceso de llamadas o proteccion anti-abuso.
- `internal_error`: error inesperado interno sin exponer SQL, secretos ni detalles de proveedor.

Los mensajes deben ser claros para ChatGPT y para el usuario final. Ejemplo:

```json
{
  "ok": false,
  "error": {
    "code": "center_ambiguous",
    "message": "Hay varios centros llamados de forma parecida. Elige uno.",
    "details": {
      "candidates": [
        { "center_id": "uuid", "name": "Box City Norte" },
        { "center_id": "uuid", "name": "Box City Sur" }
      ]
    }
  }
}
```

## Auditoria

Lecturas:

- No registrar prompts completos por defecto.
- Registrar denegaciones, intentos de acceso sensible y errores de permiso.
- Para lecturas normales, usar logs tecnicos minimizados con `request_id` si hace falta depurar.

Mutaciones:

Registrar siempre:

- `source = chatgpt_connector`
- usuario real;
- organization/tenant;
- membership/rol/capacidad evaluada;
- herramienta;
- payload normalizado o hash del payload cuando sea grande;
- entidades afectadas o conteos/hash minimizados cuando la lista sea grande;
- resultado;
- hash de `idempotency_key`;
- hash/resumen de confirmacion, nunca `confirmation_token` crudo;
- timestamp y `request_id`.

No registrar:

- prompt completo salvo necesidad justificada;
- tokens, secretos, headers de autorizacion;
- datos sensibles fuera de alcance.

## Privacidad Y Minimizacion

Campos permitidos en CG.1:

- nombre visible del centro;
- tipo de actividad;
- fecha/hora;
- estado operativo del bloque;
- nombre visible del coach;
- estado de asignacion/cobertura cuando sea necesario.

Campos prohibidos en CG.1-CG.4B:

- email personal, telefono, direccion, DNI/NIE u otros identificadores legales;
- salario, contrato, nomina, jornada laboral sensible;
- motivos de ausencia, salud, disciplina o rendimiento;
- ubicacion precisa o historial de ubicaciones;
- firmas, documentos sensibles, evidencias legales;
- notas internas privadas.

## Ejemplos De Flujo

Pregunta:

> Quien da la clase del martes a las 11:15 en Box City?

Resolucion esperada:

1. ChatGPT interpreta el martes en una fecha concreta o pregunta si falta contexto.
2. Si conoce el centro, llama `get_schedule_at_time`.
3. BoxOps valida tenant, centro, permiso y horario.
4. Devuelve bloque, tipo y coach visible.
5. ChatGPT responde con los datos devueltos, sin inventar.

Accion:

> Crea una plantilla de fecha Z a fecha X de 9 a 21 para Box City.

Resolucion esperada:

1. ChatGPT pregunta lo que falte: fechas exactas, dias de la semana, duracion del slot y tipo de actividad.
2. Llama `preview_schedule_template`.
3. Muestra resumen y advertencias.
4. En `CG.2`, puede crear `create_schedule_template_draft` tras confirmacion.
5. En `CG.3`, `apply_schedule_template` exige confirmacion humana separada e idempotencia.

## Criterios De Aceptacion CG.0

- Existe este contrato documental.
- `TASKS.md` marca `CG.0` como completado.
- `PROJECT_BRIEF.md`, roadmap y modelo de dominio enlazan este contrato.
- No se toca codigo de app, migraciones, seeds, rutas, UI, permisos ni datos reales.
- Se verifica el diff documental con `git diff --check`.

## Siguiente Corte Recomendado CG.4C

Cerrar prueba real controlada de conexion ChatGPT:

- probar `initialize`, `tools/list`, lecturas, borrador, preparacion y aplicacion confirmada en ChatGPT/dev mode o equivalente;
- validar authorize/token/revoke contra URL publica HTTPS del entorno QA;
- confirmar que ChatGPT envia Bearer al MCP y que los scopes bloquean herramientas no autorizadas;
- mantener prohibidos Supabase directo, SQL libre, `service_role`, Storage y datos sensibles;
- no marcar `CG.4` como completo hasta tener prueba real controlada de conexion de cuenta.
