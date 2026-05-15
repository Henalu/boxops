-- BoxOps - S.1.1 operational audit hardening
-- Tightens changed_fields minimization and adds a bounded purge primitive.

CREATE OR REPLACE FUNCTION public.operational_audit_changed_fields_is_safe(
  target_changed_fields jsonb
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  WITH RECURSIVE walk(key_name, value) AS (
    SELECT entry.key, entry.value
    FROM jsonb_each(
      CASE
        WHEN jsonb_typeof(target_changed_fields) = 'object' THEN target_changed_fields
        ELSE '{}'::jsonb
      END
    ) AS entry(key, value)

    UNION ALL

    SELECT nested.key, nested.value
    FROM walk
    CROSS JOIN LATERAL jsonb_each(
      CASE
        WHEN jsonb_typeof(walk.value) = 'object' THEN walk.value
        ELSE '{}'::jsonb
      END
    ) AS nested(key, value)
  )
  SELECT
    target_changed_fields IS NOT NULL
    AND jsonb_typeof(target_changed_fields) = 'object'
    AND pg_column_size(target_changed_fields) <= 4096
    AND NOT EXISTS (
      SELECT 1
      FROM walk
      WHERE length(key_name) > 64
        OR lower(key_name) ~ '(content|body|html|raw|base64|url|uri|path|token|secret|signature|document|storage|password|credential|cookie|session|fingerprint|latitude|longitude|coordinate|geolocation|gps|location|payroll|salary|iban|bank|ssn|national_id|national-id|nif|dni)'
        OR lower(key_name) ~ '(^|[_-])(ip|ipaddress|clientip|remoteip)([_-]|$)'
        OR jsonb_typeof(value) = 'array'
        OR (
          jsonb_typeof(value) = 'string'
          AND (
            length(value #>> '{}') > 128
            OR (value #>> '{}') ~* '(https?://|data:|storage/v1|base64|-----BEGIN|signed-url|signed_url|@[^[:space:]]+[.][^[:space:]]+|(^|[^0-9])([0-9]{1,3}\.){3}[0-9]{1,3}([^0-9]|$)|\m(token|secret|password|credential|cookie|session|bearer|jwt|api[_-]?key|signed[_-]?url|document|payroll|salary|iban|bank|ssn|national[_-]?id|nif|dni|geolocation|latitude|longitude|coordinate|gps|ip|fingerprint)\M)'
          )
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.purge_expired_operational_audit_events(
  target_batch_size integer DEFAULT 1000
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  bounded_batch_size integer := LEAST(GREATEST(COALESCE(target_batch_size, 1000), 1), 5000);
  deleted_count integer := 0;
BEGIN
  WITH deleted AS (
    DELETE FROM public.operational_audit_events event_record
    WHERE event_record.id IN (
      SELECT pending_event.id
      FROM public.operational_audit_events pending_event
      WHERE pending_event.retain_until < now()
      ORDER BY pending_event.retain_until ASC, pending_event.id ASC
      LIMIT bounded_batch_size
    )
    RETURNING 1
  )
  SELECT count(*)
  INTO deleted_count
  FROM deleted;

  RETURN deleted_count;
END;
$$;

COMMENT ON FUNCTION public.purge_expired_operational_audit_events(integer)
  IS 'Deletes expired operational audit events in bounded batches. Intended for a scheduled database job before production; not granted to normal app roles.';

REVOKE EXECUTE ON FUNCTION public.operational_audit_changed_fields_is_safe(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.purge_expired_operational_audit_events(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.purge_expired_operational_audit_events(integer) FROM anon, authenticated;
