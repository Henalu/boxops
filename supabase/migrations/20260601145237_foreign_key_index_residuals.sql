-- BoxOps - residual foreign key covering indexes.
--
-- The catalog-driven FK index migration creates broad coverage. These four
-- constraints still need exact leading-column indexes for Supabase's advisor.

CREATE INDEX IF NOT EXISTS coach_profiles_user_id_fk_idx
  ON public.coach_profiles (user_id);

CREATE INDEX IF NOT EXISTS document_versions_document_id_organization_id_fk_idx
  ON public.document_versions (document_id, organization_id);

CREATE INDEX IF NOT EXISTS schedule_template_blocks_organization_id_fk_idx
  ON public.schedule_template_blocks (organization_id);

CREATE INDEX IF NOT EXISTS time_punches_time_record_id_organization_id_fk_idx
  ON public.time_punches (time_record_id, organization_id);
