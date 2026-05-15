-- Safe recovery window for weekly schedule templates.
-- Archiving templates must not delete generated schedule history.

ALTER TABLE public.schedule_templates
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS recoverable_until timestamptz;

UPDATE public.schedule_templates
SET
  archived_at = COALESCE(archived_at, updated_at),
  recoverable_until = COALESCE(recoverable_until, updated_at + interval '30 days')
WHERE status = 'archived';

UPDATE public.schedule_templates
SET
  archived_at = NULL,
  recoverable_until = NULL
WHERE status <> 'archived';

CREATE OR REPLACE FUNCTION public.set_schedule_template_archive_retention()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'archived' THEN
    NEW.archived_at = COALESCE(NEW.archived_at, now());
    NEW.recoverable_until = COALESCE(
      NEW.recoverable_until,
      NEW.archived_at + interval '30 days'
    );
  ELSE
    NEW.archived_at = NULL;
    NEW.recoverable_until = NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS schedule_templates_archive_retention ON public.schedule_templates;

CREATE TRIGGER schedule_templates_archive_retention
  BEFORE INSERT OR UPDATE OF status, archived_at, recoverable_until
  ON public.schedule_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_schedule_template_archive_retention();

ALTER TABLE public.schedule_templates
  DROP CONSTRAINT IF EXISTS schedule_templates_archive_retention_consistency;

ALTER TABLE public.schedule_templates
  ADD CONSTRAINT schedule_templates_archive_retention_consistency
  CHECK (
    (
      status = 'archived'
      AND archived_at IS NOT NULL
      AND recoverable_until IS NOT NULL
      AND recoverable_until >= archived_at
    )
    OR (
      status <> 'archived'
      AND archived_at IS NULL
      AND recoverable_until IS NULL
    )
  );

CREATE INDEX IF NOT EXISTS schedule_templates_archive_retention_idx
  ON public.schedule_templates (organization_id, status, recoverable_until)
  WHERE status = 'archived';
