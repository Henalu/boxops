-- BoxOps - BoxWod hub role alignment
-- BoxOps and BoxWod share organization_memberships, but BoxOps operational
-- access must keep excluding athlete-only users.

DO $$
DECLARE
  role_constraint_name text;
BEGIN
  SELECT constraint_record.conname
  INTO role_constraint_name
  FROM pg_constraint constraint_record
  WHERE constraint_record.conrelid = 'public.organization_memberships'::regclass
    AND constraint_record.contype = 'c'
    AND pg_get_constraintdef(constraint_record.oid) LIKE '%role%'
    AND pg_get_constraintdef(constraint_record.oid) LIKE '%owner%'
  LIMIT 1;

  IF role_constraint_name IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE public.organization_memberships DROP CONSTRAINT %I',
      role_constraint_name
    );
  END IF;

  ALTER TABLE public.organization_memberships
    ADD CONSTRAINT organization_memberships_role_check
    CHECK (role IN (
      'owner',
      'admin',
      'manager',
      'center_manager',
      'document_admin',
      'payroll_manager',
      'coach',
      'staff',
      'athlete'
    ));
END $$;

CREATE OR REPLACE FUNCTION public.is_hub_member(target_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_memberships membership
    WHERE membership.organization_id = target_organization_id
      AND membership.user_id = (select auth.uid())
      AND membership.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_boxops_operator(target_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_memberships membership
    WHERE membership.organization_id = target_organization_id
      AND membership.user_id = (select auth.uid())
      AND membership.status = 'active'
      AND membership.role IN (
        'owner',
        'admin',
        'manager',
        'center_manager',
        'document_admin',
        'payroll_manager',
        'coach',
        'staff'
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.is_org_member(target_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_boxops_operator(target_organization_id);
$$;

REVOKE ALL ON FUNCTION public.is_hub_member(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_boxops_operator(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_org_member(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.is_hub_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_boxops_operator(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_member(uuid) TO authenticated;

COMMENT ON FUNCTION public.is_hub_member(uuid) IS
  'Shared hub membership helper. Includes athlete so BoxWod can use the shared tenant identity.';

COMMENT ON FUNCTION public.is_boxops_operator(uuid) IS
  'BoxOps operational membership helper. Excludes athlete-only users.';

COMMENT ON FUNCTION public.is_org_member(uuid) IS
  'BoxOps compatibility helper. Excludes athlete-only users; use is_hub_member for shared hub access.';
