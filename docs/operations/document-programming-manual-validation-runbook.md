# Validacion Manual De Programacion Documental - E.10/I.31

Estado: preparacion operativa interna para local/QA. Este runbook valida manualmente que la programacion documental autorizada se ve desde Horario solo cuando existen documento, version, grant y asociacion tecnica correctos. No es IA, no abre subida visible, no crea pagina documental completa, no crea documentos firmables y no permite asociar documentos desde UI.

## Alcance

E.10/I.31 usa la base existente:

- `documents` y `document_versions` son la fuente canonica de titulo, alcance, version y archivo.
- `document_access_grants` es el permiso real para metadata, preview y descarga.
- `document_programming_links` es la asociacion tecnica entre una version de programacion y fecha/tipo/centro/bloque.
- `schedule_blocks` aporta contexto operativo de fecha, hora, centro y tipo.
- `schedule_block_assignments` queda fuera de permisos documentales: estar asignado a un bloque no concede acceso.
- Las rutas backend E.5 de preview/descarga son la unica via de archivo desde UI.

## Prerequisitos

- Entorno local o QA controlado, nunca produccion.
- Supabase local/QA con migraciones E.2-E.9 aplicadas.
- Usuarios de prueba con memberships activas en el tenant elegido.
- Al menos un bloque operativo realista en `schedule_blocks`, con `center_id`, `class_type_id`, `service_date`, `start_time` y `end_time`.
- Un documento de programacion existente o un fixture rollback del snippet `supabase/snippets/document-programming-schedule-qa-verification.sql`.
- Credenciales de prueba para comprobar: usuario con grant de preview/descarga, usuario con solo metadata, usuario asignado sin grant y usuario de otro tenant.

## Seleccionar El Caso

### 1. Documento

Selecciona una fila de `documents` dentro del tenant:

- `organization_id` debe coincidir con el tenant activo.
- `document_scope = 'programming'`.
- `status` debe permitir consulta (`active` o `archived`, segun la regla vigente).
- `requires_signature = false`.
- El titulo no debe contener datos sensibles de salud, disciplina, rendimiento laboral, ubicacion, payroll, nominas, sanciones, bajas ni motivos personales.

### 2. Version

Selecciona una fila de `document_versions` del mismo documento:

- `organization_id` y `document_id` deben coincidir.
- La version debe estar `active` o `archived`.
- Para probar preview/descarga real, `storage_bucket` debe ser `document-files` y `storage_path` debe apuntar a un objeto privado valido.
- Para prueba solo de metadata, basta con verificar que la RPC devuelve la version esperada; no copies contenido al horario.

### 3. Grants

Prepara grants explicitos en `document_access_grants`:

- Usuario A: grant `download` o `preview` sobre el documento/version para comprobar acciones de archivo.
- Usuario B: grant `read_metadata` para comprobar metadata sin botones de preview/descarga.
- Usuario C: sin grant documental aunque pueda estar asignado al bloque.
- Usuario D: membership activa en otro tenant para comprobar bloqueo cross-tenant.

No uses `schedule_block_assignments` como permiso, no concedas acceso global por rol alto salvo que exista grant/capacidad explicita y no uses grants de documentos sensibles para este runbook.

### 4. Asociacion Tecnica

Selecciona o crea con rollback una fila de `document_programming_links`:

- `organization_id`, `document_id` y `document_version_id` del mismo tenant.
- `starts_on` y `ends_on` cubren `schedule_blocks.service_date`.
- `class_type_id` y `center_id`, si existen, pertenecen al mismo tenant y coinciden con el bloque elegido.
- `schedule_block_id`, si existe, apunta al bloque elegido y su fecha queda dentro del rango.
- `status = 'active'`.

La creacion o retirada de enlaces debe pasar por RPC interna (`create_document_programming_link` / `set_document_programming_link_status`) o SQL local/QA transaccional. No debe aparecer una UI para asociar documentos.

### 5. Bloque Operativo

Selecciona un `schedule_blocks` como contexto:

- Mismo `organization_id`.
- `service_date` dentro del rango del link.
- `center_id` y `class_type_id` coherentes con la asociacion.
- Estado operativo no cancelado si se quiere validar desde Horario.
- Asignaciones opcionales solo para contexto; no afectan permisos documentales.

## Validacion En Horario

1. Abre Horario con el tenant y semana del bloque:

```text
/app/schedule?organizationId=<organization_id>&week=<lunes-de-la-semana>&block_id=<schedule_block_id>
```

2. Con el usuario con grant de preview/descarga:

- Debe ver la seccion compacta de programacion autorizada.
- Debe ver fuente/titulo, version/fecha y vigencia.
- Debe ver preview y/o descarga solo si `can_preview` o `can_download` llegan autorizados desde la consulta.
- Las acciones deben ir a `/app/documents/[documentId]/versions/[documentVersionId]/preview` o `/download`.

3. Con el usuario con grant `read_metadata`:

- Debe ver metadata limitada.
- No debe ver botones de preview ni descarga.

4. Con el usuario asignado al bloque pero sin grant:

- Debe ver estado vacio o ausencia de contenido disponible para su permiso.
- No debe ver titulo oculto, preview, descarga ni contenido parcial.

5. Con el usuario de otro tenant:

- No debe poder listar ni abrir la programacion del tenant original.
- No debe poder usar el `schedule_block_id`, `document_id`, `document_version_id` ni `programming_link_id` del otro tenant.

## SQL Local/QA Con Rollback

El snippet ejecutable de referencia sigue siendo:

```powershell
Get-Content -Raw supabase/snippets/document-programming-schedule-qa-verification.sql | docker exec -i supabase_db_boxops psql -U postgres -d postgres -v ON_ERROR_STOP=1
```

Para un caso QA existente, usa esta plantilla como envoltorio. Sustituye los placeholders antes de ejecutarla y manten `ROLLBACK` salvo que estes en una tarea explicita de seed/fixture revisada.

```sql
BEGIN;

-- E.10/I.31 local/QA manual validation wrapper.
-- Replace placeholders before running in a controlled local/QA database.

CREATE OR REPLACE FUNCTION pg_temp.assert_true(condition boolean, label text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF condition IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'document programming manual validation failed: %', label;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.use_auth_user(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', target_user_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
END;
$$;

CREATE TEMP TABLE target_case AS
SELECT
  '<organization_id>'::uuid AS organization_id,
  '<schedule_block_id>'::uuid AS schedule_block_id,
  '<document_id>'::uuid AS document_id,
  '<document_version_id>'::uuid AS document_version_id,
  '<preview_or_download_user_id>'::uuid AS preview_user_id,
  '<metadata_only_user_id>'::uuid AS metadata_user_id,
  '<assigned_without_grant_user_id>'::uuid AS no_grant_user_id,
  '<other_tenant_user_id>'::uuid AS other_tenant_user_id;

SET LOCAL ROLE authenticated;

SELECT pg_temp.use_auth_user((SELECT preview_user_id FROM target_case));
SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM public.list_document_programming_for_block(
      (SELECT organization_id FROM target_case),
      (SELECT schedule_block_id FROM target_case),
      'read_metadata',
      20
    )
    WHERE document_id = (SELECT document_id FROM target_case)
      AND document_version_id = (SELECT document_version_id FROM target_case)
      AND can_preview IS TRUE
  ),
  'preview/download user sees authorized programming from the block'
);

SELECT pg_temp.use_auth_user((SELECT metadata_user_id FROM target_case));
SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM public.list_document_programming_for_block(
      (SELECT organization_id FROM target_case),
      (SELECT schedule_block_id FROM target_case),
      'read_metadata',
      20
    )
    WHERE document_id = (SELECT document_id FROM target_case)
      AND document_version_id = (SELECT document_version_id FROM target_case)
      AND can_preview IS FALSE
      AND can_download IS FALSE
  ),
  'metadata-only user sees metadata without file actions'
);

SELECT pg_temp.use_auth_user((SELECT no_grant_user_id FROM target_case));
SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1
    FROM public.list_document_programming_for_block(
      (SELECT organization_id FROM target_case),
      (SELECT schedule_block_id FROM target_case),
      'read_metadata',
      20
    )
  ),
  'assigned user without document grant sees no programming'
);

SELECT pg_temp.use_auth_user((SELECT other_tenant_user_id FROM target_case));
SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1
    FROM public.document_programming_links
    WHERE organization_id = (SELECT organization_id FROM target_case)
  ),
  'other tenant cannot read programming links through RLS'
);

ROLLBACK;
```

## Limpieza

- Si usaste el snippet E.9/I.30, el `ROLLBACK` borra los fixtures.
- Si usaste la plantilla con `BEGIN`/`ROLLBACK`, no debe persistir ningun grant, documento, version, link ni bloque accidental.
- Si preparaste datos QA persistentes fuera de transaccion, documenta los IDs, quien los creo, que usuarios de prueba tienen grants y como se retiran con `set_document_programming_link_status(..., 'removed')` o limpieza DB controlada.
- No borres documentos/versiones reales para limpiar una asociacion de prueba; retira el link o revoca el grant segun el caso.

## Limites De Seguridad

- No implementar IA funcional, embeddings, RAG, vector search, prompts runtime, SDKs, jobs ni cron.
- No abrir subida visible de documentos ni pagina documental completa.
- No crear documentos firmables, solicitudes de firma, aprobaciones ni payroll.
- No crear asociaciones visibles desde UI.
- No generar signed URLs desde cliente.
- No introducir `service_role` en `src`.
- No usar datos sensibles de salud, disciplina, rendimiento laboral, ubicacion, payroll, nominas, sanciones, bajas, motivos personales ni documentos de otro tenant.
- No tratar `owner`, `admin` o `manager` como permiso documental global: el acceso real viene de `document_access_grants` o capacidad explicita.
