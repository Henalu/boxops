INSERT INTO public.organization_memberships (
  organization_id,
  user_id,
  role,
  status,
  joined_at
)
VALUES (
  '00000000-0000-0000-0000-000000100001',
  '84616eb2-f25f-4729-a09e-974d85fd611e',
  'admin',
  'active',
  now()
)
ON CONFLICT (organization_id, user_id)
DO UPDATE
SET role = EXCLUDED.role,
    status = EXCLUDED.status,
    joined_at = COALESCE(public.organization_memberships.joined_at, EXCLUDED.joined_at);
