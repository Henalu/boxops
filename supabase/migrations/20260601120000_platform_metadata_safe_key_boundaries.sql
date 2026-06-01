-- BoxOps - Platform metadata key boundary fix
-- The original platform metadata guard rejected safe audit keys such as
-- subscription_status because the short key token "ip" matched any substring.
-- Keep sensitive keys blocked, but require separator/name boundaries for short
-- tokens such as ip, url, uri and path.

CREATE OR REPLACE FUNCTION public.platform_metadata_is_safe(
  target_metadata jsonb
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
        WHEN jsonb_typeof(COALESCE(target_metadata, '{}'::jsonb)) = 'object' THEN COALESCE(target_metadata, '{}'::jsonb)
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
    target_metadata IS NOT NULL
    AND jsonb_typeof(target_metadata) = 'object'
    AND pg_column_size(target_metadata) <= 4096
    AND NOT EXISTS (
      SELECT 1
      FROM walk
      WHERE length(key_name) > 64
        OR lower(key_name) ~ '(content|body|html|raw|base64|token|secret|signature|storage|password|credential|cookie|session|fingerprint|latitude|longitude|coordinate|geolocation|gps|location|salary|payroll|nomina|iban|bank|card|cvv|mandate|account|routing|swift|bic|payment_method|payment-method)'
        OR lower(key_name) ~ '(^|[_-])(ip|url|uri|path)([_-]|$)'
        OR jsonb_typeof(value) = 'array'
        OR (
          jsonb_typeof(value) = 'string'
          AND (
            length(value #>> '{}') > 160
            OR (value #>> '{}') ~* '(https?://|data:|storage/v1|base64|-----BEGIN|signed-url|signed_url|@[^[:space:]]+[.][^[:space:]]+|\m(token|secret|password|credential|cookie|session|bearer|jwt|api[_-]?key|signed[_-]?url|salary|payroll|nomina|iban|bank|card|cvv|mandate|account|routing|swift|bic|payment[_-]?method|geolocation|latitude|longitude|coordinate|gps|ip|fingerprint)\M)'
          )
        )
    );
$$;

REVOKE EXECUTE ON FUNCTION public.platform_metadata_is_safe(jsonb) FROM PUBLIC;

DO $$
BEGIN
  IF NOT public.platform_metadata_is_safe(
    jsonb_build_object('subscription_status', 'manual')
  ) THEN
    RAISE EXCEPTION 'platform metadata safety should allow subscription_status audit keys';
  END IF;

  IF public.platform_metadata_is_safe(
    jsonb_build_object('ip_address', '127.0.0.1')
  ) THEN
    RAISE EXCEPTION 'platform metadata safety should reject explicit ip audit keys';
  END IF;
END;
$$;
