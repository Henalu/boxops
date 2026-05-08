-- B.2 aligns database policies with application permission helpers.
-- `center_manager` remains modelled in the role check constraint, but is not
-- granted global writes until center-scoped permissions exist.

DROP POLICY IF EXISTS "Members can view relevant memberships" ON public.organization_memberships;

CREATE POLICY "Members can view relevant memberships"
  ON public.organization_memberships FOR SELECT TO authenticated
  USING (
    user_id = (select auth.uid())
    OR public.has_org_role(organization_id, ARRAY['owner', 'admin', 'manager'])
  );

DROP POLICY IF EXISTS "Operators can manage centers" ON public.centers;
DROP POLICY IF EXISTS "Operators can update centers" ON public.centers;
DROP POLICY IF EXISTS "Operators can delete centers" ON public.centers;

CREATE POLICY "Operators can manage centers"
  ON public.centers FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(organization_id, ARRAY['owner', 'admin', 'manager']));

CREATE POLICY "Operators can update centers"
  ON public.centers FOR UPDATE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner', 'admin', 'manager']))
  WITH CHECK (public.has_org_role(organization_id, ARRAY['owner', 'admin', 'manager']));

CREATE POLICY "Operators can delete centers"
  ON public.centers FOR DELETE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner', 'admin', 'manager']));

DROP POLICY IF EXISTS "Operators can manage coach profiles" ON public.coach_profiles;
DROP POLICY IF EXISTS "Operators can update coach profiles" ON public.coach_profiles;
DROP POLICY IF EXISTS "Operators can delete coach profiles" ON public.coach_profiles;

CREATE POLICY "Operators can manage coach profiles"
  ON public.coach_profiles FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(organization_id, ARRAY['owner', 'admin', 'manager']));

CREATE POLICY "Operators can update coach profiles"
  ON public.coach_profiles FOR UPDATE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner', 'admin', 'manager']))
  WITH CHECK (public.has_org_role(organization_id, ARRAY['owner', 'admin', 'manager']));

CREATE POLICY "Operators can delete coach profiles"
  ON public.coach_profiles FOR DELETE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner', 'admin', 'manager']));

DROP POLICY IF EXISTS "Operators can manage coach center assignments" ON public.coach_center_assignments;
DROP POLICY IF EXISTS "Operators can update coach center assignments" ON public.coach_center_assignments;
DROP POLICY IF EXISTS "Operators can delete coach center assignments" ON public.coach_center_assignments;

CREATE POLICY "Operators can manage coach center assignments"
  ON public.coach_center_assignments FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(organization_id, ARRAY['owner', 'admin', 'manager']));

CREATE POLICY "Operators can update coach center assignments"
  ON public.coach_center_assignments FOR UPDATE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner', 'admin', 'manager']))
  WITH CHECK (public.has_org_role(organization_id, ARRAY['owner', 'admin', 'manager']));

CREATE POLICY "Operators can delete coach center assignments"
  ON public.coach_center_assignments FOR DELETE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner', 'admin', 'manager']));

DROP POLICY IF EXISTS "Operators can manage class types" ON public.class_types;
DROP POLICY IF EXISTS "Operators can update class types" ON public.class_types;
DROP POLICY IF EXISTS "Operators can delete class types" ON public.class_types;

CREATE POLICY "Operators can manage class types"
  ON public.class_types FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(organization_id, ARRAY['owner', 'admin', 'manager']));

CREATE POLICY "Operators can update class types"
  ON public.class_types FOR UPDATE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner', 'admin', 'manager']))
  WITH CHECK (public.has_org_role(organization_id, ARRAY['owner', 'admin', 'manager']));

CREATE POLICY "Operators can delete class types"
  ON public.class_types FOR DELETE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner', 'admin', 'manager']));

DROP POLICY IF EXISTS "Operators can manage schedule templates" ON public.schedule_templates;
DROP POLICY IF EXISTS "Operators can update schedule templates" ON public.schedule_templates;
DROP POLICY IF EXISTS "Operators can delete schedule templates" ON public.schedule_templates;

CREATE POLICY "Operators can manage schedule templates"
  ON public.schedule_templates FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(organization_id, ARRAY['owner', 'admin', 'manager']));

CREATE POLICY "Operators can update schedule templates"
  ON public.schedule_templates FOR UPDATE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner', 'admin', 'manager']))
  WITH CHECK (public.has_org_role(organization_id, ARRAY['owner', 'admin', 'manager']));

CREATE POLICY "Operators can delete schedule templates"
  ON public.schedule_templates FOR DELETE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner', 'admin', 'manager']));

DROP POLICY IF EXISTS "Operators can manage schedule template blocks" ON public.schedule_template_blocks;
DROP POLICY IF EXISTS "Operators can update schedule template blocks" ON public.schedule_template_blocks;
DROP POLICY IF EXISTS "Operators can delete schedule template blocks" ON public.schedule_template_blocks;

CREATE POLICY "Operators can manage schedule template blocks"
  ON public.schedule_template_blocks FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(organization_id, ARRAY['owner', 'admin', 'manager']));

CREATE POLICY "Operators can update schedule template blocks"
  ON public.schedule_template_blocks FOR UPDATE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner', 'admin', 'manager']))
  WITH CHECK (public.has_org_role(organization_id, ARRAY['owner', 'admin', 'manager']));

CREATE POLICY "Operators can delete schedule template blocks"
  ON public.schedule_template_blocks FOR DELETE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner', 'admin', 'manager']));

DROP POLICY IF EXISTS "Operators can manage schedule blocks" ON public.schedule_blocks;
DROP POLICY IF EXISTS "Operators can update schedule blocks" ON public.schedule_blocks;
DROP POLICY IF EXISTS "Operators can delete schedule blocks" ON public.schedule_blocks;

CREATE POLICY "Operators can manage schedule blocks"
  ON public.schedule_blocks FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(organization_id, ARRAY['owner', 'admin', 'manager']));

CREATE POLICY "Operators can update schedule blocks"
  ON public.schedule_blocks FOR UPDATE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner', 'admin', 'manager']))
  WITH CHECK (public.has_org_role(organization_id, ARRAY['owner', 'admin', 'manager']));

CREATE POLICY "Operators can delete schedule blocks"
  ON public.schedule_blocks FOR DELETE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner', 'admin', 'manager']));

DROP POLICY IF EXISTS "Operators can manage schedule block assignments" ON public.schedule_block_assignments;
DROP POLICY IF EXISTS "Operators can update schedule block assignments" ON public.schedule_block_assignments;
DROP POLICY IF EXISTS "Operators can delete schedule block assignments" ON public.schedule_block_assignments;

CREATE POLICY "Operators can manage schedule block assignments"
  ON public.schedule_block_assignments FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(organization_id, ARRAY['owner', 'admin', 'manager']));

CREATE POLICY "Operators can update schedule block assignments"
  ON public.schedule_block_assignments FOR UPDATE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner', 'admin', 'manager']))
  WITH CHECK (public.has_org_role(organization_id, ARRAY['owner', 'admin', 'manager']));

CREATE POLICY "Operators can delete schedule block assignments"
  ON public.schedule_block_assignments FOR DELETE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner', 'admin', 'manager']));
