-- Jornada prevista is shared operational context for the day.
-- Active members can read active planned work windows; only operators manage
-- and can inspect inactive rows.

DROP POLICY IF EXISTS "Operators can view staff work windows"
  ON public.staff_work_windows;

DROP POLICY IF EXISTS "Coaches can view own staff work windows"
  ON public.staff_work_windows;

CREATE POLICY "Members can view active staff work windows"
  ON public.staff_work_windows FOR SELECT TO authenticated
  USING (
    status = 'active'
    AND public.is_org_member(organization_id)
  );

CREATE POLICY "Operators can view all staff work windows"
  ON public.staff_work_windows FOR SELECT TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner', 'admin', 'manager']));
