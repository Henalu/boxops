-- BoxOps - Phase B.1 organization theme configuration
-- Adds the first tenant-scoped visual configuration field.

ALTER TABLE public.organizations
  ADD COLUMN theme_config jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_theme_config_is_object
  CHECK (jsonb_typeof(theme_config) = 'object');
