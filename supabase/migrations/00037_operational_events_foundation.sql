-- BoxOps - I.18 operational events foundation
-- Tenant-scoped technical base for holidays, competitions and operational
-- events. This is context only: no UI, seeds, automatic schedule mutations,
-- coverage resolution, payroll, approved overtime, legal balances or location.

-- ============================================================
-- Helpers
-- ============================================================

CREATE OR REPLACE FUNCTION public.operational_event_notes_are_safe(
  target_notes text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    target_notes IS NULL
    OR (
      length(btrim(target_notes)) BETWEEN 1 AND 500
      AND target_notes !~* '(https?://|www[.]|data:|base64|token|secret|password|credential|signed-url|signed_url|storage/v1|document|documento|archivo|justificante|payroll|salary|salario|nomina|iban|bank|dni|nif|ssn|national_id|geolocation|gps|latitude|longitude|coordinate|ubicacion|location|ip|fingerprint|baja|salud|health|medical|medic|diagnostic|diagnostico|sick|illness|familia|familiar|sancion|disciplin)'
    );
$$;

CREATE OR REPLACE FUNCTION public.operational_event_title_is_safe(
  target_title text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    target_title IS NOT NULL
    AND length(btrim(target_title)) BETWEEN 1 AND 120
    AND target_title !~* '(https?://|www[.]|data:|base64|token|secret|password|credential|signed-url|signed_url|storage/v1)'
$$;

CREATE OR REPLACE FUNCTION public.operational_event_retain_until(
  target_starts_at timestamptz,
  target_ends_at timestamptz,
  target_status text,
  target_closed_at timestamptz DEFAULT NULL
)
RETURNS timestamptz
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE lower(btrim(COALESCE(target_status, 'active')))
    WHEN 'active' THEN
      GREATEST(
        COALESCE(target_ends_at, target_starts_at, now()),
        now()
      ) + interval '24 months'
    ELSE
      GREATEST(COALESCE(target_closed_at, now()), now()) + interval '24 months'
  END;
$$;

CREATE OR REPLACE FUNCTION public.can_manage_operational_events(
  target_organization_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_org_role(target_organization_id, ARRAY['owner', 'admin', 'manager']);
$$;

-- ============================================================
-- Table
-- ============================================================

CREATE TABLE public.operational_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  center_id uuid,
  title text NOT NULL,
  event_type text NOT NULL
    CHECK (event_type IN (
      'holiday',
      'closure',
      'competition',
      'seminar',
      'open_day',
      'internal_event',
      'external_event',
      'maintenance',
      'community_event'
    )),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  all_day boolean NOT NULL DEFAULT false,
  timezone text NOT NULL,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'cancelled', 'archived')),
  visibility text NOT NULL DEFAULT 'management'
    CHECK (visibility IN ('management', 'staff', 'all_staff')),
  impact_level text NOT NULL DEFAULT 'context_only'
    CHECK (impact_level IN (
      'context_only',
      'schedule_review_needed',
      'coverage_review_needed',
      'staffing_needed'
    )),
  notes text,
  created_by_membership_id uuid,
  updated_by_membership_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz,
  archived_at timestamptz,
  retain_until timestamptz NOT NULL DEFAULT now() + interval '24 months',
  UNIQUE (id, organization_id),
  FOREIGN KEY (center_id, organization_id)
    REFERENCES public.centers(id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (created_by_membership_id, organization_id)
    REFERENCES public.organization_memberships(id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (updated_by_membership_id, organization_id)
    REFERENCES public.organization_memberships(id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT operational_events_title_safe
    CHECK (public.operational_event_title_is_safe(title)),
  CONSTRAINT operational_events_notes_safe
    CHECK (public.operational_event_notes_are_safe(notes)),
  CONSTRAINT operational_events_time_range
    CHECK (
      ends_at IS NULL
      OR (
        starts_at < ends_at
        AND ends_at <= starts_at + interval '366 days'
      )
    ),
  CONSTRAINT operational_events_timezone_not_blank
    CHECK (length(btrim(timezone)) > 0 AND length(timezone) <= 80),
  CONSTRAINT operational_events_cancelled_fields
    CHECK (status <> 'cancelled' OR cancelled_at IS NOT NULL),
  CONSTRAINT operational_events_archived_fields
    CHECK (status <> 'archived' OR archived_at IS NOT NULL),
  CONSTRAINT operational_events_retain_window
    CHECK (
      retain_until > created_at
      AND retain_until <= GREATEST(
        created_at,
        starts_at,
        COALESCE(ends_at, starts_at),
        COALESCE(cancelled_at, created_at),
        COALESCE(archived_at, created_at)
      ) + interval '24 months' + interval '1 day'
    )
);

CREATE INDEX operational_events_org_time_idx
  ON public.operational_events (organization_id, starts_at, COALESCE(ends_at, starts_at));

CREATE INDEX operational_events_org_status_idx
  ON public.operational_events (organization_id, status, starts_at DESC);

CREATE INDEX operational_events_center_idx
  ON public.operational_events (organization_id, center_id, starts_at DESC)
  WHERE center_id IS NOT NULL;

CREATE INDEX operational_events_visibility_idx
  ON public.operational_events (organization_id, visibility, status, starts_at DESC);

CREATE INDEX operational_events_retain_until_idx
  ON public.operational_events (retain_until);

CREATE TRIGGER operational_events_set_updated_at
  BEFORE UPDATE ON public.operational_events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- Validation
-- ============================================================

CREATE OR REPLACE FUNCTION public.validate_operational_event_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  center_record public.centers;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.organizations organization
    WHERE organization.id = NEW.organization_id
      AND organization.status IN ('trialing', 'active')
  ) THEN
    RAISE EXCEPTION 'active organization is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_timezone_names timezone_name
    WHERE timezone_name.name = NEW.timezone
  ) THEN
    RAISE EXCEPTION 'operational event timezone is not valid';
  END IF;

  IF NEW.center_id IS NOT NULL THEN
    SELECT center.*
    INTO center_record
    FROM public.centers center
    WHERE center.id = NEW.center_id
      AND center.organization_id = NEW.organization_id;

    IF center_record.id IS NULL THEN
      RAISE EXCEPTION 'operational event center was not found in tenant';
    END IF;

    IF NEW.status = 'active' AND center_record.status <> 'active' THEN
      RAISE EXCEPTION 'active operational events require an active center';
    END IF;
  END IF;

  IF NEW.status = 'active' THEN
    NEW.cancelled_at := NULL;
    NEW.archived_at := NULL;
  END IF;

  IF NEW.status = 'cancelled' AND NEW.cancelled_at IS NULL THEN
    NEW.cancelled_at := now();
  END IF;

  IF NEW.status = 'archived' AND NEW.archived_at IS NULL THEN
    NEW.archived_at := now();
  END IF;

  NEW.title := btrim(NEW.title);
  NEW.notes := NULLIF(btrim(COALESCE(NEW.notes, '')), '');
  NEW.timezone := btrim(NEW.timezone);

  RETURN NEW;
END;
$$;

CREATE TRIGGER operational_events_validate_row
  BEFORE INSERT OR UPDATE ON public.operational_events
  FOR EACH ROW EXECUTE FUNCTION public.validate_operational_event_row();

-- ============================================================
-- Read permission helper
-- ============================================================

CREATE OR REPLACE FUNCTION public.can_read_operational_event(
  target_organization_id uuid,
  target_operational_event_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := (select auth.uid());
BEGIN
  IF current_user_id IS NULL THEN
    RETURN false;
  END IF;

  IF public.can_manage_operational_events(target_organization_id) THEN
    RETURN true;
  END IF;

  IF NOT public.has_org_role(target_organization_id, ARRAY['coach']) THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.operational_events event_record
    WHERE event_record.id = target_operational_event_id
      AND event_record.organization_id = target_organization_id
      AND event_record.status = 'active'
      AND event_record.visibility IN ('staff', 'all_staff')
  );
END;
$$;

-- ============================================================
-- Operational audit extension
-- ============================================================

ALTER TABLE public.operational_audit_events
  DROP CONSTRAINT IF EXISTS operational_audit_events_entity_type_check;

ALTER TABLE public.operational_audit_events
  ADD CONSTRAINT operational_audit_events_entity_type_check
  CHECK (entity_type IN (
    'team_invitations',
    'organization_memberships',
    'person_profiles',
    'coach_profiles',
    'schedule_blocks',
    'schedule_block_assignments',
    'schedule_templates',
    'schedule_template_blocks',
    'staff_work_windows',
    'operational_events'
  ));

CREATE OR REPLACE FUNCTION public.operational_audit_entity_action_is_allowed(
  target_entity_type text,
  target_action text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE lower(btrim(COALESCE(target_entity_type, '')))
    WHEN 'team_invitations' THEN
      lower(btrim(COALESCE(target_action, ''))) IN ('created', 'resent', 'cancelled', 'accepted')
    WHEN 'organization_memberships' THEN
      lower(btrim(COALESCE(target_action, ''))) IN ('created', 'updated')
    WHEN 'person_profiles' THEN
      lower(btrim(COALESCE(target_action, ''))) IN ('created', 'updated', 'linked_account')
    WHEN 'coach_profiles' THEN
      lower(btrim(COALESCE(target_action, ''))) IN ('created', 'updated', 'linked_account')
    WHEN 'schedule_blocks' THEN
      lower(btrim(COALESCE(target_action, ''))) IN ('created', 'updated', 'cancelled')
    WHEN 'schedule_block_assignments' THEN
      lower(btrim(COALESCE(target_action, ''))) IN ('assigned', 'removed', 'updated')
    WHEN 'schedule_templates' THEN
      lower(btrim(COALESCE(target_action, ''))) IN ('created', 'updated', 'archived', 'restored', 'applied_to_week')
    WHEN 'schedule_template_blocks' THEN
      lower(btrim(COALESCE(target_action, ''))) IN ('created', 'updated', 'removed')
    WHEN 'staff_work_windows' THEN
      lower(btrim(COALESCE(target_action, ''))) IN ('created', 'updated', 'deactivated')
    WHEN 'operational_events' THEN
      lower(btrim(COALESCE(target_action, ''))) IN ('created', 'updated', 'cancelled', 'archived', 'reactivated')
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.operational_audit_retention_days(
  target_entity_type text
)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE lower(btrim(COALESCE(target_entity_type, '')))
    WHEN 'team_invitations' THEN 30
    WHEN 'organization_memberships' THEN 30
    WHEN 'person_profiles' THEN 30
    WHEN 'coach_profiles' THEN 30
    WHEN 'operational_events' THEN 180
    ELSE 15
  END;
$$;

CREATE OR REPLACE FUNCTION public.operational_audit_entity_exists(
  target_organization_id uuid,
  target_entity_type text,
  target_entity_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  CASE lower(btrim(COALESCE(target_entity_type, '')))
    WHEN 'team_invitations' THEN
      RETURN EXISTS (
        SELECT 1
        FROM public.team_invitations entity
        WHERE entity.id = target_entity_id
          AND entity.organization_id = target_organization_id
      );
    WHEN 'organization_memberships' THEN
      RETURN EXISTS (
        SELECT 1
        FROM public.organization_memberships entity
        WHERE entity.id = target_entity_id
          AND entity.organization_id = target_organization_id
      );
    WHEN 'person_profiles' THEN
      RETURN EXISTS (
        SELECT 1
        FROM public.person_profiles entity
        WHERE entity.id = target_entity_id
          AND entity.organization_id = target_organization_id
      );
    WHEN 'coach_profiles' THEN
      RETURN EXISTS (
        SELECT 1
        FROM public.coach_profiles entity
        WHERE entity.id = target_entity_id
          AND entity.organization_id = target_organization_id
      );
    WHEN 'schedule_blocks' THEN
      RETURN EXISTS (
        SELECT 1
        FROM public.schedule_blocks entity
        WHERE entity.id = target_entity_id
          AND entity.organization_id = target_organization_id
      );
    WHEN 'schedule_block_assignments' THEN
      RETURN EXISTS (
        SELECT 1
        FROM public.schedule_block_assignments entity
        WHERE entity.id = target_entity_id
          AND entity.organization_id = target_organization_id
      );
    WHEN 'schedule_templates' THEN
      RETURN EXISTS (
        SELECT 1
        FROM public.schedule_templates entity
        WHERE entity.id = target_entity_id
          AND entity.organization_id = target_organization_id
      );
    WHEN 'schedule_template_blocks' THEN
      RETURN EXISTS (
        SELECT 1
        FROM public.schedule_template_blocks entity
        WHERE entity.id = target_entity_id
          AND entity.organization_id = target_organization_id
      );
    WHEN 'staff_work_windows' THEN
      RETURN EXISTS (
        SELECT 1
        FROM public.staff_work_windows entity
        WHERE entity.id = target_entity_id
          AND entity.organization_id = target_organization_id
      );
    WHEN 'operational_events' THEN
      RETURN EXISTS (
        SELECT 1
        FROM public.operational_events entity
        WHERE entity.id = target_entity_id
          AND entity.organization_id = target_organization_id
      );
    ELSE
      RETURN false;
  END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_operational_audit_events(
  target_organization_id uuid,
  target_entity_type text DEFAULT NULL,
  target_limit integer DEFAULT 100
)
RETURNS SETOF public.operational_audit_events
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized_entity_type text := NULLIF(lower(btrim(COALESCE(target_entity_type, ''))), '');
  bounded_limit integer := LEAST(GREATEST(COALESCE(target_limit, 100), 1), 500);
BEGIN
  IF NOT public.can_read_operational_audit_events(target_organization_id) THEN
    RAISE EXCEPTION 'operational audit read permission required';
  END IF;

  IF normalized_entity_type IS NOT NULL
    AND normalized_entity_type NOT IN (
      'team_invitations',
      'organization_memberships',
      'person_profiles',
      'coach_profiles',
      'schedule_blocks',
      'schedule_block_assignments',
      'schedule_templates',
      'schedule_template_blocks',
      'staff_work_windows',
      'operational_events'
    ) THEN
    RAISE EXCEPTION 'operational audit entity type is not allowed';
  END IF;

  RETURN QUERY
  SELECT event_record.*
  FROM public.operational_audit_events event_record
  WHERE event_record.organization_id = target_organization_id
    AND event_record.retain_until > now()
    AND (
      normalized_entity_type IS NULL
      OR event_record.entity_type = normalized_entity_type
    )
  ORDER BY event_record.created_at DESC, event_record.id DESC
  LIMIT bounded_limit;
END;
$$;

-- ============================================================
-- RPCs
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_operational_event(
  target_organization_id uuid,
  target_title text,
  target_event_type text,
  target_starts_at timestamptz,
  target_ends_at timestamptz DEFAULT NULL,
  target_timezone text DEFAULT NULL,
  target_center_id uuid DEFAULT NULL,
  target_visibility text DEFAULT 'management',
  target_impact_level text DEFAULT 'context_only',
  target_notes text DEFAULT NULL,
  target_all_day boolean DEFAULT false
)
RETURNS public.operational_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized_event_type text := lower(btrim(COALESCE(target_event_type, '')));
  normalized_visibility text := lower(btrim(COALESCE(target_visibility, 'management')));
  normalized_impact_level text := lower(btrim(COALESCE(target_impact_level, 'context_only')));
  normalized_title text := btrim(COALESCE(target_title, ''));
  normalized_notes text := NULLIF(btrim(COALESCE(target_notes, '')), '');
  normalized_timezone text;
  current_membership_id uuid;
  created_event public.operational_events;
BEGIN
  IF (select auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF NOT public.can_manage_operational_events(target_organization_id) THEN
    RAISE EXCEPTION 'operational event management permission required';
  END IF;

  current_membership_id := public.get_active_membership_id(target_organization_id);

  IF current_membership_id IS NULL THEN
    RAISE EXCEPTION 'active membership required';
  END IF;

  SELECT COALESCE(NULLIF(btrim(target_timezone), ''), organization.timezone)
  INTO normalized_timezone
  FROM public.organizations organization
  WHERE organization.id = target_organization_id
    AND organization.status IN ('trialing', 'active');

  IF normalized_timezone IS NULL THEN
    RAISE EXCEPTION 'active organization timezone is required';
  END IF;

  IF normalized_event_type NOT IN (
    'holiday',
    'closure',
    'competition',
    'seminar',
    'open_day',
    'internal_event',
    'external_event',
    'maintenance',
    'community_event'
  ) THEN
    RAISE EXCEPTION 'operational event type is not allowed';
  END IF;

  IF normalized_visibility NOT IN ('management', 'staff', 'all_staff') THEN
    RAISE EXCEPTION 'operational event visibility is not allowed';
  END IF;

  IF normalized_impact_level NOT IN (
    'context_only',
    'schedule_review_needed',
    'coverage_review_needed',
    'staffing_needed'
  ) THEN
    RAISE EXCEPTION 'operational event impact is not allowed';
  END IF;

  IF NOT public.operational_event_title_is_safe(normalized_title) THEN
    RAISE EXCEPTION 'operational event title is not allowed';
  END IF;

  IF NOT public.operational_event_notes_are_safe(normalized_notes) THEN
    RAISE EXCEPTION 'operational event notes are not allowed';
  END IF;

  IF target_starts_at IS NULL
    OR (
      target_ends_at IS NOT NULL
      AND (
        target_starts_at >= target_ends_at
        OR target_ends_at > target_starts_at + interval '366 days'
      )
    ) THEN
    RAISE EXCEPTION 'operational event time range is invalid';
  END IF;

  INSERT INTO public.operational_events (
    organization_id,
    center_id,
    title,
    event_type,
    starts_at,
    ends_at,
    all_day,
    timezone,
    status,
    visibility,
    impact_level,
    notes,
    created_by_membership_id,
    updated_by_membership_id,
    retain_until
  )
  VALUES (
    target_organization_id,
    target_center_id,
    normalized_title,
    normalized_event_type,
    target_starts_at,
    target_ends_at,
    COALESCE(target_all_day, false),
    normalized_timezone,
    'active',
    normalized_visibility,
    normalized_impact_level,
    normalized_notes,
    current_membership_id,
    current_membership_id,
    public.operational_event_retain_until(
      target_starts_at,
      target_ends_at,
      'active'
    )
  )
  RETURNING *
  INTO created_event;

  PERFORM public.record_operational_audit_event(
    target_organization_id,
    'operational_events',
    created_event.id,
    'created',
    'success',
    jsonb_build_object(
      'event_type', normalized_event_type,
      'visibility', normalized_visibility,
      'impact_level', normalized_impact_level,
      'center_id', target_center_id IS NOT NULL
    )
  );

  RETURN created_event;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_operational_event(
  target_organization_id uuid,
  target_operational_event_id uuid,
  target_title text,
  target_event_type text,
  target_starts_at timestamptz,
  target_ends_at timestamptz DEFAULT NULL,
  target_timezone text DEFAULT NULL,
  target_center_id uuid DEFAULT NULL,
  target_visibility text DEFAULT 'management',
  target_impact_level text DEFAULT 'context_only',
  target_notes text DEFAULT NULL,
  target_all_day boolean DEFAULT false
)
RETURNS public.operational_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  event_record public.operational_events;
  updated_event public.operational_events;
  current_membership_id uuid;
  normalized_event_type text := lower(btrim(COALESCE(target_event_type, '')));
  normalized_visibility text := lower(btrim(COALESCE(target_visibility, 'management')));
  normalized_impact_level text := lower(btrim(COALESCE(target_impact_level, 'context_only')));
  normalized_title text := btrim(COALESCE(target_title, ''));
  normalized_notes text := NULLIF(btrim(COALESCE(target_notes, '')), '');
  normalized_timezone text := btrim(COALESCE(target_timezone, ''));
  changed_fields jsonb := '{}'::jsonb;
BEGIN
  IF (select auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF NOT public.can_manage_operational_events(target_organization_id) THEN
    RAISE EXCEPTION 'operational event management permission required';
  END IF;

  current_membership_id := public.get_active_membership_id(target_organization_id);

  IF current_membership_id IS NULL THEN
    RAISE EXCEPTION 'active membership required';
  END IF;

  SELECT event_item.*
  INTO event_record
  FROM public.operational_events event_item
  WHERE event_item.id = target_operational_event_id
    AND event_item.organization_id = target_organization_id
  FOR UPDATE;

  IF event_record.id IS NULL THEN
    RAISE EXCEPTION 'operational event was not found in tenant';
  END IF;

  IF event_record.status = 'archived' THEN
    RAISE EXCEPTION 'archived operational events cannot be edited';
  END IF;

  IF normalized_event_type NOT IN (
    'holiday',
    'closure',
    'competition',
    'seminar',
    'open_day',
    'internal_event',
    'external_event',
    'maintenance',
    'community_event'
  ) THEN
    RAISE EXCEPTION 'operational event type is not allowed';
  END IF;

  IF normalized_visibility NOT IN ('management', 'staff', 'all_staff') THEN
    RAISE EXCEPTION 'operational event visibility is not allowed';
  END IF;

  IF normalized_impact_level NOT IN (
    'context_only',
    'schedule_review_needed',
    'coverage_review_needed',
    'staffing_needed'
  ) THEN
    RAISE EXCEPTION 'operational event impact is not allowed';
  END IF;

  IF NOT public.operational_event_title_is_safe(normalized_title) THEN
    RAISE EXCEPTION 'operational event title is not allowed';
  END IF;

  IF NOT public.operational_event_notes_are_safe(normalized_notes) THEN
    RAISE EXCEPTION 'operational event notes are not allowed';
  END IF;

  IF target_starts_at IS NULL
    OR normalized_timezone = ''
    OR (
      target_ends_at IS NOT NULL
      AND (
        target_starts_at >= target_ends_at
        OR target_ends_at > target_starts_at + interval '366 days'
      )
    ) THEN
    RAISE EXCEPTION 'operational event time range is invalid';
  END IF;

  IF event_record.title IS DISTINCT FROM normalized_title THEN
    changed_fields := changed_fields || jsonb_build_object('title', jsonb_build_object('changed', true));
  END IF;

  IF event_record.event_type IS DISTINCT FROM normalized_event_type THEN
    changed_fields := changed_fields || jsonb_build_object('event_type', normalized_event_type);
  END IF;

  IF event_record.center_id IS DISTINCT FROM target_center_id THEN
    changed_fields := changed_fields || jsonb_build_object('center_id', jsonb_build_object('changed', true));
  END IF;

  IF event_record.starts_at IS DISTINCT FROM target_starts_at
    OR event_record.ends_at IS DISTINCT FROM target_ends_at
    OR event_record.timezone IS DISTINCT FROM normalized_timezone
    OR event_record.all_day IS DISTINCT FROM COALESCE(target_all_day, false) THEN
    changed_fields := changed_fields || jsonb_build_object('time_window', jsonb_build_object('changed', true));
  END IF;

  IF event_record.visibility IS DISTINCT FROM normalized_visibility THEN
    changed_fields := changed_fields || jsonb_build_object('visibility', normalized_visibility);
  END IF;

  IF event_record.impact_level IS DISTINCT FROM normalized_impact_level THEN
    changed_fields := changed_fields || jsonb_build_object('impact_level', normalized_impact_level);
  END IF;

  IF event_record.notes IS DISTINCT FROM normalized_notes THEN
    changed_fields := changed_fields || jsonb_build_object('notes', jsonb_build_object('changed', true));
  END IF;

  UPDATE public.operational_events
  SET
    center_id = target_center_id,
    title = normalized_title,
    event_type = normalized_event_type,
    starts_at = target_starts_at,
    ends_at = target_ends_at,
    all_day = COALESCE(target_all_day, false),
    timezone = normalized_timezone,
    visibility = normalized_visibility,
    impact_level = normalized_impact_level,
    notes = normalized_notes,
    updated_by_membership_id = current_membership_id,
    retain_until = public.operational_event_retain_until(
      target_starts_at,
      target_ends_at,
      event_record.status,
      COALESCE(event_record.cancelled_at, event_record.archived_at)
    )
  WHERE id = event_record.id
    AND organization_id = event_record.organization_id
  RETURNING *
  INTO updated_event;

  IF changed_fields <> '{}'::jsonb THEN
    PERFORM public.record_operational_audit_event(
      target_organization_id,
      'operational_events',
      updated_event.id,
      'updated',
      'success',
      changed_fields
    );
  END IF;

  RETURN updated_event;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_operational_event_status(
  target_organization_id uuid,
  target_operational_event_id uuid,
  target_status text
)
RETURNS public.operational_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  event_record public.operational_events;
  updated_event public.operational_events;
  current_membership_id uuid;
  normalized_status text := lower(btrim(COALESCE(target_status, '')));
  status_changed boolean := false;
  action_name text;
  closed_at timestamptz;
BEGIN
  IF (select auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF NOT public.can_manage_operational_events(target_organization_id) THEN
    RAISE EXCEPTION 'operational event management permission required';
  END IF;

  IF normalized_status NOT IN ('active', 'cancelled', 'archived') THEN
    RAISE EXCEPTION 'operational event status is not allowed';
  END IF;

  current_membership_id := public.get_active_membership_id(target_organization_id);

  IF current_membership_id IS NULL THEN
    RAISE EXCEPTION 'active membership required';
  END IF;

  SELECT event_item.*
  INTO event_record
  FROM public.operational_events event_item
  WHERE event_item.id = target_operational_event_id
    AND event_item.organization_id = target_organization_id
  FOR UPDATE;

  IF event_record.id IS NULL THEN
    RAISE EXCEPTION 'operational event was not found in tenant';
  END IF;

  IF event_record.status = 'archived' AND normalized_status <> 'archived' THEN
    RAISE EXCEPTION 'archived operational events cannot be reopened';
  END IF;

  status_changed := event_record.status IS DISTINCT FROM normalized_status;
  closed_at := CASE
    WHEN normalized_status IN ('cancelled', 'archived') THEN now()
    ELSE NULL
  END;

  UPDATE public.operational_events
  SET
    status = normalized_status,
    cancelled_at = CASE
      WHEN normalized_status = 'cancelled' THEN COALESCE(event_record.cancelled_at, closed_at)
      WHEN normalized_status = 'active' THEN NULL
      ELSE event_record.cancelled_at
    END,
    archived_at = CASE
      WHEN normalized_status = 'archived' THEN COALESCE(event_record.archived_at, closed_at)
      WHEN normalized_status = 'active' THEN NULL
      ELSE event_record.archived_at
    END,
    updated_by_membership_id = current_membership_id,
    retain_until = public.operational_event_retain_until(
      event_record.starts_at,
      event_record.ends_at,
      normalized_status,
      closed_at
    )
  WHERE id = event_record.id
    AND organization_id = event_record.organization_id
  RETURNING *
  INTO updated_event;

  IF status_changed THEN
    action_name := CASE normalized_status
      WHEN 'cancelled' THEN 'cancelled'
      WHEN 'archived' THEN 'archived'
      ELSE 'reactivated'
    END;

    PERFORM public.record_operational_audit_event(
      target_organization_id,
      'operational_events',
      updated_event.id,
      action_name,
      'success',
      jsonb_build_object('status', normalized_status)
    );
  END IF;

  RETURN updated_event;
END;
$$;

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE public.operational_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers and permitted coaches can read operational events"
  ON public.operational_events FOR SELECT TO authenticated
  USING (public.can_read_operational_event(organization_id, id));

-- ============================================================
-- Grants
-- ============================================================

REVOKE ALL ON public.operational_events FROM PUBLIC;
REVOKE ALL ON public.operational_events FROM anon, authenticated;

GRANT SELECT ON public.operational_events TO authenticated;

REVOKE EXECUTE ON FUNCTION public.operational_event_notes_are_safe(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.operational_event_title_is_safe(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.operational_event_retain_until(timestamptz, timestamptz, text, timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_manage_operational_events(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_operational_event_row() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_read_operational_event(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_operational_event(uuid, text, text, timestamptz, timestamptz, text, uuid, text, text, text, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_operational_event(uuid, uuid, text, text, timestamptz, timestamptz, text, uuid, text, text, text, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_operational_event_status(uuid, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.operational_audit_entity_action_is_allowed(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.operational_audit_retention_days(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.operational_audit_entity_exists(uuid, text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.list_operational_audit_events(uuid, text, integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.can_manage_operational_events(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_operational_event(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_operational_event(uuid, text, text, timestamptz, timestamptz, text, uuid, text, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_operational_event(uuid, uuid, text, text, timestamptz, timestamptz, text, uuid, text, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_operational_event_status(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_operational_audit_events(uuid, text, integer) TO authenticated;
