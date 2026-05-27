-- BoxOps Console bootstrap placeholder.
-- Run manually with a database operator account after creating the first Auth user.
-- Replace placeholders before executing; do not commit real user IDs or emails.

BEGIN;

WITH bootstrap_input AS (
  SELECT
    '<AUTH_USER_ID_UUID>'::uuid AS user_id,
    '<OPTIONAL_DISPLAY_NAME>'::text AS display_name
)
INSERT INTO public.platform_admins (
  user_id,
  role,
  status,
  display_name,
  notes
)
SELECT
  bootstrap_input.user_id,
  'platform_owner',
  'active',
  NULLIF(btrim(bootstrap_input.display_name), ''),
  'Bootstrap platform owner placeholder'
FROM bootstrap_input
WHERE bootstrap_input.user_id IS NOT NULL
ON CONFLICT (user_id) DO UPDATE
SET
  role = 'platform_owner',
  status = 'active',
  display_name = EXCLUDED.display_name,
  notes = 'Bootstrap platform owner placeholder',
  updated_at = now();

-- Verify before replacing ROLLBACK with COMMIT in a controlled environment.
SELECT
  id,
  user_id,
  role,
  status,
  display_name,
  created_at,
  updated_at
FROM public.platform_admins
WHERE user_id = '<AUTH_USER_ID_UUID>'::uuid;

ROLLBACK;
