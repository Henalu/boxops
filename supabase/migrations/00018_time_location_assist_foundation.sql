-- BoxOps - Fase G.3 assisted time location foundation
-- Adds tenant-scoped configuration and minimized location-assist events for
-- time tracking. It does not add UI, navigator.geolocation usage, maps,
-- raw worker coordinates, geofencing, automatic punches, payroll or native app
-- behavior.

-- ============================================================
-- Capability helpers
-- ============================================================

CREATE OR REPLACE FUNCTION public.can_manage_time_location_settings(
  target_organization_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_org_role(target_organization_id, ARRAY['owner', 'admin']);
$$;

CREATE OR REPLACE FUNCTION public.can_activate_time_location_settings(
  target_organization_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_org_role(target_organization_id, ARRAY['owner']);
$$;

-- ============================================================
-- Center location-assist settings
-- ============================================================

CREATE TABLE public.center_time_location_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  center_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'inactive', 'archived')),
  center_latitude numeric(9,6) NOT NULL
    CHECK (center_latitude BETWEEN -90 AND 90),
  center_longitude numeric(9,6) NOT NULL
    CHECK (center_longitude BETWEEN -180 AND 180),
  radius_meters integer NOT NULL DEFAULT 100
    CHECK (radius_meters BETWEEN 10 AND 5000),
  max_accuracy_meters integer NOT NULL DEFAULT 100
    CHECK (max_accuracy_meters BETWEEN 5 AND 5000),
  timezone text NOT NULL DEFAULT 'Europe/Madrid',
  policy_version integer NOT NULL DEFAULT 1
    CHECK (policy_version > 0),
  notice_text text NOT NULL,
  retention_days integer NOT NULL DEFAULT 90
    CHECK (retention_days BETWEEN 1 AND 730),
  fallback_retention_days integer NOT NULL DEFAULT 30
    CHECK (fallback_retention_days BETWEEN 1 AND 730),
  created_by_user_id uuid NOT NULL,
  created_by_membership_id uuid NOT NULL,
  updated_by_user_id uuid NOT NULL,
  updated_by_membership_id uuid NOT NULL,
  activated_at timestamptz,
  deactivated_at timestamptz,
  change_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id),
  UNIQUE (organization_id, center_id),
  FOREIGN KEY (center_id, organization_id)
    REFERENCES public.centers(id, organization_id)
    ON DELETE CASCADE,
  FOREIGN KEY (organization_id, created_by_user_id)
    REFERENCES public.organization_memberships(organization_id, user_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (created_by_membership_id, organization_id)
    REFERENCES public.organization_memberships(id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, updated_by_user_id)
    REFERENCES public.organization_memberships(organization_id, user_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (updated_by_membership_id, organization_id)
    REFERENCES public.organization_memberships(id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT center_time_location_settings_timezone_not_blank
    CHECK (length(btrim(timezone)) > 0 AND length(timezone) <= 100),
  CONSTRAINT center_time_location_settings_notice_not_blank
    CHECK (length(btrim(notice_text)) > 0 AND length(notice_text) <= 4000),
  CONSTRAINT center_time_location_settings_retention_order
    CHECK (fallback_retention_days <= retention_days),
  CONSTRAINT center_time_location_settings_change_reason_not_blank
    CHECK (
      change_reason IS NULL
      OR (length(btrim(change_reason)) > 0 AND length(change_reason) <= 1000)
    ),
  CONSTRAINT center_time_location_settings_active_state
    CHECK (status <> 'active' OR activated_at IS NOT NULL)
);

CREATE INDEX center_time_location_settings_status_idx
  ON public.center_time_location_settings (organization_id, status, center_id);

-- ============================================================
-- Minimized location-assist events
-- ============================================================

CREATE TABLE public.time_location_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  time_record_id uuid,
  time_punch_id uuid,
  person_profile_id uuid,
  actor_user_id uuid,
  actor_membership_id uuid,
  actor_person_profile_id uuid,
  center_id uuid,
  center_time_location_setting_id uuid,
  policy_version integer
    CHECK (policy_version IS NULL OR policy_version > 0),
  purpose text NOT NULL DEFAULT 'context_check'
    CHECK (purpose IN ('clock_in', 'clock_out', 'context_check')),
  availability_status text NOT NULL
    CHECK (availability_status IN (
      'available',
      'permission_denied',
      'unavailable',
      'timeout',
      'unsupported',
      'inaccurate'
    )),
  assist_result text NOT NULL
    CHECK (assist_result IN (
      'inside_radius',
      'outside_radius',
      'unknown',
      'manual_fallback'
    )),
  accuracy_bucket text NOT NULL DEFAULT 'unknown'
    CHECK (accuracy_bucket IN (
      'lte_25m',
      'lte_50m',
      'lte_100m',
      'lte_250m',
      'gt_250m',
      'unknown'
    )),
  distance_bucket text NOT NULL DEFAULT 'unknown'
    CHECK (distance_bucket IN (
      'inside_radius',
      'outside_lte_25m',
      'outside_lte_100m',
      'outside_gt_100m',
      'unknown'
    )),
  fallback_reason text
    CHECK (
      fallback_reason IS NULL
      OR fallback_reason IN (
        'permission_denied',
        'location_unavailable',
        'timeout',
        'unsupported',
        'precision_insufficient',
        'outside_radius',
        'manual_override',
        'not_configured',
        'other'
      )
    ),
  captured_at timestamptz NOT NULL DEFAULT now(),
  retain_until timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id),
  FOREIGN KEY (time_record_id, organization_id)
    REFERENCES public.time_records(id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (time_punch_id, organization_id)
    REFERENCES public.time_punches(id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (person_profile_id, organization_id)
    REFERENCES public.person_profiles(id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, actor_user_id)
    REFERENCES public.organization_memberships(organization_id, user_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (actor_membership_id, organization_id)
    REFERENCES public.organization_memberships(id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (actor_person_profile_id, organization_id)
    REFERENCES public.person_profiles(id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (center_id, organization_id)
    REFERENCES public.centers(id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (center_time_location_setting_id, organization_id)
    REFERENCES public.center_time_location_settings(id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT time_location_events_retention_after_capture
    CHECK (retain_until > captured_at),
  CONSTRAINT time_location_events_fallback_reason_required
    CHECK (
      (
        availability_status = 'available'
        AND assist_result <> 'manual_fallback'
      )
      OR fallback_reason IS NOT NULL
    ),
  CONSTRAINT time_location_events_unavailable_result
    CHECK (
      availability_status = 'available'
      OR assist_result IN ('unknown', 'manual_fallback')
    )
);

CREATE INDEX time_location_events_person_idx
  ON public.time_location_events (organization_id, person_profile_id, captured_at DESC)
  WHERE person_profile_id IS NOT NULL;

CREATE INDEX time_location_events_record_idx
  ON public.time_location_events (organization_id, time_record_id, captured_at DESC)
  WHERE time_record_id IS NOT NULL;

CREATE INDEX time_location_events_punch_idx
  ON public.time_location_events (organization_id, time_punch_id, captured_at DESC)
  WHERE time_punch_id IS NOT NULL;

CREATE INDEX time_location_events_center_idx
  ON public.time_location_events (organization_id, center_id, captured_at DESC)
  WHERE center_id IS NOT NULL;

CREATE INDEX time_location_events_retain_until_idx
  ON public.time_location_events (retain_until);

-- ============================================================
-- Validation triggers
-- ============================================================

CREATE OR REPLACE FUNCTION public.validate_center_time_location_setting_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := (select auth.uid());
  current_membership_id uuid;
  policy_fields_changed boolean := false;
BEGIN
  IF current_user_id IS NOT NULL THEN
    current_membership_id := public.get_active_membership_id(NEW.organization_id);

    IF current_membership_id IS NULL THEN
      RAISE EXCEPTION 'active membership is required for location settings';
    END IF;

    IF NOT public.can_manage_time_location_settings(NEW.organization_id) THEN
      RAISE EXCEPTION 'location settings manager role is required';
    END IF;

    IF NEW.status = 'active'
      AND (
        TG_OP = 'INSERT'
        OR OLD.status <> 'active'
      )
      AND NOT public.can_activate_time_location_settings(NEW.organization_id) THEN
      RAISE EXCEPTION 'owner role is required to activate location settings';
    END IF;

    IF TG_OP = 'INSERT' THEN
      NEW.created_by_user_id := COALESCE(NEW.created_by_user_id, current_user_id);
      NEW.created_by_membership_id := COALESCE(
        NEW.created_by_membership_id,
        current_membership_id
      );
    END IF;

    NEW.updated_by_user_id := current_user_id;
    NEW.updated_by_membership_id := current_membership_id;

    IF NEW.created_by_user_id <> current_user_id
      AND TG_OP = 'INSERT' THEN
      RAISE EXCEPTION 'location setting creator must be the authenticated user';
    END IF;

    IF NEW.updated_by_user_id <> current_user_id THEN
      RAISE EXCEPTION 'location setting updater must be the authenticated user';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.id <> OLD.id
      OR NEW.organization_id <> OLD.organization_id
      OR NEW.center_id <> OLD.center_id
      OR NEW.created_by_user_id <> OLD.created_by_user_id
      OR NEW.created_by_membership_id <> OLD.created_by_membership_id
      OR NEW.created_at <> OLD.created_at THEN
      RAISE EXCEPTION 'location setting immutable fields cannot be changed';
    END IF;

    policy_fields_changed :=
      NEW.center_latitude <> OLD.center_latitude
      OR NEW.center_longitude <> OLD.center_longitude
      OR NEW.radius_meters <> OLD.radius_meters
      OR NEW.max_accuracy_meters <> OLD.max_accuracy_meters
      OR NEW.timezone <> OLD.timezone
      OR NEW.notice_text <> OLD.notice_text
      OR NEW.retention_days <> OLD.retention_days
      OR NEW.fallback_retention_days <> OLD.fallback_retention_days;

    IF policy_fields_changed AND NEW.policy_version <= OLD.policy_version THEN
      RAISE EXCEPTION 'location setting policy_version must increase for policy changes';
    END IF;

    IF NOT policy_fields_changed AND NEW.policy_version < OLD.policy_version THEN
      RAISE EXCEPTION 'location setting policy_version cannot decrease';
    END IF;
  END IF;

  IF NEW.status = 'active' AND NEW.activated_at IS NULL THEN
    NEW.activated_at := now();
  END IF;

  IF TG_OP = 'UPDATE'
    AND OLD.status = 'active'
    AND NEW.status <> 'active'
    AND NEW.deactivated_at IS NULL THEN
    NEW.deactivated_at := now();
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_time_location_event_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := (select auth.uid());
  current_membership_id uuid;
  own_person_profile_id uuid;
  linked_record_person_profile_id uuid;
  linked_record_center_id uuid;
  linked_punch_record_id uuid;
  linked_punch_person_profile_id uuid;
  linked_punch_center_id uuid;
  linked_punch_type text;
  linked_setting_center_id uuid;
  linked_setting_policy_version integer;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'time location events are immutable';
  END IF;

  IF current_user_id IS NOT NULL THEN
    current_membership_id := public.get_active_membership_id(NEW.organization_id);
    own_person_profile_id := public.get_own_person_profile_id(NEW.organization_id);

    IF current_membership_id IS NULL THEN
      RAISE EXCEPTION 'active membership is required for time location events';
    END IF;

    NEW.actor_user_id := COALESCE(NEW.actor_user_id, current_user_id);
    NEW.actor_membership_id := COALESCE(
      NEW.actor_membership_id,
      current_membership_id
    );
    NEW.actor_person_profile_id := COALESCE(
      NEW.actor_person_profile_id,
      own_person_profile_id
    );

    IF NEW.actor_user_id <> current_user_id THEN
      RAISE EXCEPTION 'time location event actor must be the authenticated user';
    END IF;

    IF NEW.actor_membership_id <> current_membership_id THEN
      RAISE EXCEPTION 'time location event actor membership must be active';
    END IF;

    IF NEW.actor_person_profile_id IS DISTINCT FROM own_person_profile_id THEN
      RAISE EXCEPTION 'time location event actor person must be own linked person';
    END IF;
  END IF;

  IF NEW.time_record_id IS NOT NULL THEN
    SELECT
      time_record.person_profile_id,
      time_record.center_id
    INTO
      linked_record_person_profile_id,
      linked_record_center_id
    FROM public.time_records time_record
    WHERE time_record.id = NEW.time_record_id
      AND time_record.organization_id = NEW.organization_id;

    IF linked_record_person_profile_id IS NULL THEN
      RAISE EXCEPTION 'linked time record was not found';
    END IF;

    IF NEW.person_profile_id IS NOT NULL
      AND NEW.person_profile_id <> linked_record_person_profile_id THEN
      RAISE EXCEPTION 'time location event person must match linked time record';
    END IF;

    NEW.person_profile_id := COALESCE(
      NEW.person_profile_id,
      linked_record_person_profile_id
    );

    IF NEW.center_id IS NOT NULL
      AND linked_record_center_id IS NOT NULL
      AND NEW.center_id <> linked_record_center_id THEN
      RAISE EXCEPTION 'time location event center must match linked time record';
    END IF;

    NEW.center_id := COALESCE(NEW.center_id, linked_record_center_id);
  END IF;

  IF NEW.time_punch_id IS NOT NULL THEN
    SELECT
      time_punch.time_record_id,
      time_punch.person_profile_id,
      time_punch.center_id,
      time_punch.punch_type
    INTO
      linked_punch_record_id,
      linked_punch_person_profile_id,
      linked_punch_center_id,
      linked_punch_type
    FROM public.time_punches time_punch
    WHERE time_punch.id = NEW.time_punch_id
      AND time_punch.organization_id = NEW.organization_id;

    IF linked_punch_record_id IS NULL THEN
      RAISE EXCEPTION 'linked time punch was not found';
    END IF;

    IF NEW.time_record_id IS NOT NULL
      AND NEW.time_record_id <> linked_punch_record_id THEN
      RAISE EXCEPTION 'time location event punch must match linked time record';
    END IF;

    IF NEW.person_profile_id IS NOT NULL
      AND NEW.person_profile_id <> linked_punch_person_profile_id THEN
      RAISE EXCEPTION 'time location event person must match linked time punch';
    END IF;

    IF NEW.center_id IS NOT NULL
      AND linked_punch_center_id IS NOT NULL
      AND NEW.center_id <> linked_punch_center_id THEN
      RAISE EXCEPTION 'time location event center must match linked time punch';
    END IF;

    NEW.time_record_id := COALESCE(NEW.time_record_id, linked_punch_record_id);
    NEW.person_profile_id := COALESCE(
      NEW.person_profile_id,
      linked_punch_person_profile_id
    );
    NEW.center_id := COALESCE(NEW.center_id, linked_punch_center_id);

    IF NEW.purpose NOT IN ('clock_in', 'clock_out')
      OR NEW.purpose <> linked_punch_type THEN
      RAISE EXCEPTION 'time location event purpose must match linked time punch';
    END IF;
  END IF;

  IF NEW.center_time_location_setting_id IS NOT NULL THEN
    SELECT
      setting.center_id,
      setting.policy_version
    INTO
      linked_setting_center_id,
      linked_setting_policy_version
    FROM public.center_time_location_settings setting
    WHERE setting.id = NEW.center_time_location_setting_id
      AND setting.organization_id = NEW.organization_id;

    IF linked_setting_center_id IS NULL THEN
      RAISE EXCEPTION 'linked location setting was not found';
    END IF;

    IF NEW.center_id IS NOT NULL
      AND NEW.center_id <> linked_setting_center_id THEN
      RAISE EXCEPTION 'time location event setting must match center';
    END IF;

    NEW.center_id := COALESCE(NEW.center_id, linked_setting_center_id);
    NEW.policy_version := COALESCE(
      NEW.policy_version,
      linked_setting_policy_version
    );

    IF NEW.policy_version <> linked_setting_policy_version THEN
      RAISE EXCEPTION 'time location event policy_version must match setting';
    END IF;
  END IF;

  IF NEW.captured_at > now() + interval '5 minutes' THEN
    RAISE EXCEPTION 'time location event captured_at cannot be in the future';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER center_time_location_settings_set_updated_at
  BEFORE UPDATE ON public.center_time_location_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER center_time_location_settings_validate_row
  BEFORE INSERT OR UPDATE ON public.center_time_location_settings
  FOR EACH ROW EXECUTE FUNCTION public.validate_center_time_location_setting_row();

CREATE TRIGGER time_location_events_validate_row
  BEFORE INSERT OR UPDATE ON public.time_location_events
  FOR EACH ROW EXECUTE FUNCTION public.validate_time_location_event_row();

-- ============================================================
-- RPCs
-- ============================================================

CREATE OR REPLACE FUNCTION public.upsert_center_time_location_setting(
  target_organization_id uuid,
  target_center_id uuid,
  target_status text,
  target_center_latitude numeric,
  target_center_longitude numeric,
  target_radius_meters integer,
  target_max_accuracy_meters integer,
  target_timezone text,
  target_policy_version integer,
  target_notice_text text,
  target_retention_days integer DEFAULT 90,
  target_fallback_retention_days integer DEFAULT 30,
  target_change_reason text DEFAULT NULL
)
RETURNS public.center_time_location_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := (select auth.uid());
  current_membership_id uuid;
  existing_status text;
  changed_setting public.center_time_location_settings;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication is required for location settings';
  END IF;

  current_membership_id := public.get_active_membership_id(target_organization_id);

  IF current_membership_id IS NULL THEN
    RAISE EXCEPTION 'active membership is required for location settings';
  END IF;

  IF NOT public.can_manage_time_location_settings(target_organization_id) THEN
    RAISE EXCEPTION 'location settings manager role is required';
  END IF;

  IF target_status NOT IN ('draft', 'active', 'inactive', 'archived') THEN
    RAISE EXCEPTION 'location setting status is not allowed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.centers center_record
    WHERE center_record.id = target_center_id
      AND center_record.organization_id = target_organization_id
  ) THEN
    RAISE EXCEPTION 'center was not found in the organization';
  END IF;

  SELECT setting.status
  INTO existing_status
  FROM public.center_time_location_settings setting
  WHERE setting.organization_id = target_organization_id
    AND setting.center_id = target_center_id;

  IF target_status = 'active'
    AND COALESCE(existing_status, '') <> 'active'
    AND NOT public.can_activate_time_location_settings(target_organization_id) THEN
    RAISE EXCEPTION 'owner role is required to activate location settings';
  END IF;

  INSERT INTO public.center_time_location_settings (
    organization_id,
    center_id,
    status,
    center_latitude,
    center_longitude,
    radius_meters,
    max_accuracy_meters,
    timezone,
    policy_version,
    notice_text,
    retention_days,
    fallback_retention_days,
    created_by_user_id,
    created_by_membership_id,
    updated_by_user_id,
    updated_by_membership_id,
    activated_at,
    change_reason
  )
  VALUES (
    target_organization_id,
    target_center_id,
    target_status,
    target_center_latitude,
    target_center_longitude,
    target_radius_meters,
    target_max_accuracy_meters,
    target_timezone,
    target_policy_version,
    target_notice_text,
    target_retention_days,
    target_fallback_retention_days,
    current_user_id,
    current_membership_id,
    current_user_id,
    current_membership_id,
    CASE WHEN target_status = 'active' THEN now() ELSE NULL END,
    target_change_reason
  )
  ON CONFLICT (organization_id, center_id) DO UPDATE
  SET
    status = EXCLUDED.status,
    center_latitude = EXCLUDED.center_latitude,
    center_longitude = EXCLUDED.center_longitude,
    radius_meters = EXCLUDED.radius_meters,
    max_accuracy_meters = EXCLUDED.max_accuracy_meters,
    timezone = EXCLUDED.timezone,
    policy_version = EXCLUDED.policy_version,
    notice_text = EXCLUDED.notice_text,
    retention_days = EXCLUDED.retention_days,
    fallback_retention_days = EXCLUDED.fallback_retention_days,
    updated_by_user_id = current_user_id,
    updated_by_membership_id = current_membership_id,
    activated_at = CASE
      WHEN EXCLUDED.status = 'active'
        AND center_time_location_settings.status <> 'active'
        THEN now()
      ELSE center_time_location_settings.activated_at
    END,
    deactivated_at = CASE
      WHEN center_time_location_settings.status = 'active'
        AND EXCLUDED.status <> 'active'
        THEN now()
      ELSE center_time_location_settings.deactivated_at
    END,
    change_reason = EXCLUDED.change_reason
  RETURNING *
  INTO changed_setting;

  RETURN changed_setting;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_center_time_location_setting_status(
  target_organization_id uuid,
  target_center_id uuid,
  target_status text,
  target_change_reason text DEFAULT NULL
)
RETURNS public.center_time_location_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := (select auth.uid());
  current_membership_id uuid;
  existing_status text;
  changed_setting public.center_time_location_settings;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication is required for location settings';
  END IF;

  current_membership_id := public.get_active_membership_id(target_organization_id);

  IF current_membership_id IS NULL THEN
    RAISE EXCEPTION 'active membership is required for location settings';
  END IF;

  IF NOT public.can_manage_time_location_settings(target_organization_id) THEN
    RAISE EXCEPTION 'location settings manager role is required';
  END IF;

  IF target_status NOT IN ('draft', 'active', 'inactive', 'archived') THEN
    RAISE EXCEPTION 'location setting status is not allowed';
  END IF;

  SELECT setting.status
  INTO existing_status
  FROM public.center_time_location_settings setting
  WHERE setting.organization_id = target_organization_id
    AND setting.center_id = target_center_id;

  IF existing_status IS NULL THEN
    RAISE EXCEPTION 'location setting was not found';
  END IF;

  IF target_status = 'active'
    AND existing_status <> 'active'
    AND NOT public.can_activate_time_location_settings(target_organization_id) THEN
    RAISE EXCEPTION 'owner role is required to activate location settings';
  END IF;

  UPDATE public.center_time_location_settings setting
  SET
    status = target_status,
    updated_by_user_id = current_user_id,
    updated_by_membership_id = current_membership_id,
    activated_at = CASE
      WHEN target_status = 'active' AND setting.status <> 'active'
        THEN now()
      ELSE setting.activated_at
    END,
    deactivated_at = CASE
      WHEN setting.status = 'active' AND target_status <> 'active'
        THEN now()
      ELSE setting.deactivated_at
    END,
    change_reason = target_change_reason
  WHERE setting.organization_id = target_organization_id
    AND setting.center_id = target_center_id
  RETURNING *
  INTO changed_setting;

  RETURN changed_setting;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_own_time_location_event(
  target_organization_id uuid,
  target_availability_status text,
  target_assist_result text,
  target_purpose text DEFAULT NULL,
  target_center_id uuid DEFAULT NULL,
  target_time_record_id uuid DEFAULT NULL,
  target_time_punch_id uuid DEFAULT NULL,
  target_accuracy_bucket text DEFAULT 'unknown',
  target_distance_bucket text DEFAULT 'unknown',
  target_fallback_reason text DEFAULT NULL,
  target_captured_at timestamptz DEFAULT now()
)
RETURNS public.time_location_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := (select auth.uid());
  current_membership_id uuid;
  own_person_profile_id uuid;
  normalized_center_id uuid := target_center_id;
  normalized_record_id uuid := target_time_record_id;
  normalized_purpose text := target_purpose;
  normalized_captured_at timestamptz := COALESCE(target_captured_at, now());
  linked_record_person_profile_id uuid;
  linked_record_center_id uuid;
  linked_punch_record_id uuid;
  linked_punch_person_profile_id uuid;
  linked_punch_center_id uuid;
  linked_punch_type text;
  active_setting public.center_time_location_settings;
  selected_retention_days integer;
  created_event public.time_location_events;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication is required for time location events';
  END IF;

  current_membership_id := public.get_active_membership_id(target_organization_id);
  own_person_profile_id := public.get_own_person_profile_id(target_organization_id);

  IF current_membership_id IS NULL OR own_person_profile_id IS NULL THEN
    RAISE EXCEPTION 'active membership and linked person are required for time location events';
  END IF;

  IF target_availability_status NOT IN (
    'available',
    'permission_denied',
    'unavailable',
    'timeout',
    'unsupported',
    'inaccurate'
  ) THEN
    RAISE EXCEPTION 'time location availability status is not allowed';
  END IF;

  IF target_assist_result NOT IN (
    'inside_radius',
    'outside_radius',
    'unknown',
    'manual_fallback'
  ) THEN
    RAISE EXCEPTION 'time location assist result is not allowed';
  END IF;

  IF target_accuracy_bucket NOT IN (
    'lte_25m',
    'lte_50m',
    'lte_100m',
    'lte_250m',
    'gt_250m',
    'unknown'
  ) THEN
    RAISE EXCEPTION 'time location accuracy bucket is not allowed';
  END IF;

  IF target_distance_bucket NOT IN (
    'inside_radius',
    'outside_lte_25m',
    'outside_lte_100m',
    'outside_gt_100m',
    'unknown'
  ) THEN
    RAISE EXCEPTION 'time location distance bucket is not allowed';
  END IF;

  IF target_fallback_reason IS NOT NULL
    AND target_fallback_reason NOT IN (
      'permission_denied',
      'location_unavailable',
      'timeout',
      'unsupported',
      'precision_insufficient',
      'outside_radius',
      'manual_override',
      'not_configured',
      'other'
    ) THEN
    RAISE EXCEPTION 'time location fallback reason is not allowed';
  END IF;

  IF normalized_captured_at > now() + interval '5 minutes'
    OR normalized_captured_at < now() - interval '7 days' THEN
    RAISE EXCEPTION 'time location captured_at is outside the allowed window';
  END IF;

  IF normalized_record_id IS NOT NULL THEN
    SELECT
      time_record.person_profile_id,
      time_record.center_id
    INTO
      linked_record_person_profile_id,
      linked_record_center_id
    FROM public.time_records time_record
    WHERE time_record.id = normalized_record_id
      AND time_record.organization_id = target_organization_id;

    IF linked_record_person_profile_id IS NULL THEN
      RAISE EXCEPTION 'linked time record was not found';
    END IF;

    IF linked_record_person_profile_id <> own_person_profile_id THEN
      RAISE EXCEPTION 'linked time record does not belong to the authenticated person';
    END IF;

    IF normalized_center_id IS NOT NULL
      AND linked_record_center_id IS NOT NULL
      AND normalized_center_id <> linked_record_center_id THEN
      RAISE EXCEPTION 'time location center must match linked time record';
    END IF;

    normalized_center_id := COALESCE(normalized_center_id, linked_record_center_id);
  END IF;

  IF target_time_punch_id IS NOT NULL THEN
    SELECT
      time_punch.time_record_id,
      time_punch.person_profile_id,
      time_punch.center_id,
      time_punch.punch_type
    INTO
      linked_punch_record_id,
      linked_punch_person_profile_id,
      linked_punch_center_id,
      linked_punch_type
    FROM public.time_punches time_punch
    WHERE time_punch.id = target_time_punch_id
      AND time_punch.organization_id = target_organization_id;

    IF linked_punch_record_id IS NULL THEN
      RAISE EXCEPTION 'linked time punch was not found';
    END IF;

    IF linked_punch_person_profile_id <> own_person_profile_id THEN
      RAISE EXCEPTION 'linked time punch does not belong to the authenticated person';
    END IF;

    IF normalized_record_id IS NOT NULL
      AND normalized_record_id <> linked_punch_record_id THEN
      RAISE EXCEPTION 'time punch must match linked time record';
    END IF;

    IF normalized_center_id IS NOT NULL
      AND linked_punch_center_id IS NOT NULL
      AND normalized_center_id <> linked_punch_center_id THEN
      RAISE EXCEPTION 'time location center must match linked time punch';
    END IF;

    normalized_record_id := COALESCE(normalized_record_id, linked_punch_record_id);
    normalized_center_id := COALESCE(normalized_center_id, linked_punch_center_id);
    normalized_purpose := COALESCE(normalized_purpose, linked_punch_type);

    IF normalized_purpose <> linked_punch_type THEN
      RAISE EXCEPTION 'time location purpose must match linked time punch';
    END IF;
  END IF;

  normalized_purpose := COALESCE(normalized_purpose, 'context_check');

  IF normalized_purpose NOT IN ('clock_in', 'clock_out', 'context_check') THEN
    RAISE EXCEPTION 'time location purpose is not allowed';
  END IF;

  IF normalized_center_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.centers center_record
    WHERE center_record.id = normalized_center_id
      AND center_record.organization_id = target_organization_id
  ) THEN
    RAISE EXCEPTION 'center was not found in the organization';
  END IF;

  IF normalized_center_id IS NOT NULL THEN
    SELECT setting.*
    INTO active_setting
    FROM public.center_time_location_settings setting
    WHERE setting.organization_id = target_organization_id
      AND setting.center_id = normalized_center_id
      AND setting.status = 'active'
    LIMIT 1;
  END IF;

  IF target_assist_result IN ('inside_radius', 'outside_radius')
    AND (
      target_availability_status <> 'available'
      OR active_setting.id IS NULL
    ) THEN
    RAISE EXCEPTION 'inside/outside location results require an active center setting';
  END IF;

  IF target_availability_status <> 'available'
    AND target_assist_result NOT IN ('unknown', 'manual_fallback') THEN
    RAISE EXCEPTION 'unavailable location results must be unknown or manual fallback';
  END IF;

  IF (
    target_availability_status <> 'available'
    OR target_assist_result = 'manual_fallback'
  ) AND target_fallback_reason IS NULL THEN
    RAISE EXCEPTION 'fallback reason is required when location is unavailable or manual fallback';
  END IF;

  selected_retention_days := CASE
    WHEN target_availability_status = 'available'
      AND target_assist_result <> 'manual_fallback'
      THEN COALESCE(active_setting.retention_days, 90)
    ELSE COALESCE(active_setting.fallback_retention_days, 30)
  END;

  INSERT INTO public.time_location_events (
    organization_id,
    time_record_id,
    time_punch_id,
    person_profile_id,
    actor_user_id,
    actor_membership_id,
    actor_person_profile_id,
    center_id,
    center_time_location_setting_id,
    policy_version,
    purpose,
    availability_status,
    assist_result,
    accuracy_bucket,
    distance_bucket,
    fallback_reason,
    captured_at,
    retain_until
  )
  VALUES (
    target_organization_id,
    normalized_record_id,
    target_time_punch_id,
    own_person_profile_id,
    current_user_id,
    current_membership_id,
    own_person_profile_id,
    normalized_center_id,
    active_setting.id,
    active_setting.policy_version,
    normalized_purpose,
    target_availability_status,
    target_assist_result,
    target_accuracy_bucket,
    target_distance_bucket,
    target_fallback_reason,
    normalized_captured_at,
    normalized_captured_at + (selected_retention_days * interval '1 day')
  )
  RETURNING *
  INTO created_event;

  RETURN created_event;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_own_time_location_events(
  target_organization_id uuid,
  target_captured_from timestamptz DEFAULT (now() - interval '30 days'),
  target_captured_to timestamptz DEFAULT now(),
  target_limit integer DEFAULT 50
)
RETURNS SETOF public.time_location_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := (select auth.uid());
  own_person_profile_id uuid;
  normalized_limit integer := LEAST(GREATEST(COALESCE(target_limit, 50), 1), 200);
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication is required for time location events';
  END IF;

  IF public.get_active_membership_id(target_organization_id) IS NULL THEN
    RAISE EXCEPTION 'active membership is required for time location events';
  END IF;

  own_person_profile_id := public.get_own_person_profile_id(target_organization_id);

  IF own_person_profile_id IS NULL THEN
    RAISE EXCEPTION 'linked person is required for time location events';
  END IF;

  IF target_captured_to < target_captured_from THEN
    RAISE EXCEPTION 'time location event date range is invalid';
  END IF;

  RETURN QUERY
  SELECT time_location_event.*
  FROM public.time_location_events time_location_event
  WHERE time_location_event.organization_id = target_organization_id
    AND time_location_event.person_profile_id = own_person_profile_id
    AND time_location_event.captured_at >= target_captured_from
    AND time_location_event.captured_at <= target_captured_to
    AND time_location_event.retain_until > now()
  ORDER BY time_location_event.captured_at DESC
  LIMIT normalized_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_time_location_events_for_record(
  target_organization_id uuid,
  target_time_record_id uuid,
  target_limit integer DEFAULT 50
)
RETURNS SETOF public.time_location_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := (select auth.uid());
  own_person_profile_id uuid;
  target_record_person_profile_id uuid;
  normalized_limit integer := LEAST(GREATEST(COALESCE(target_limit, 50), 1), 200);
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication is required for time location events';
  END IF;

  IF public.get_active_membership_id(target_organization_id) IS NULL THEN
    RAISE EXCEPTION 'active membership is required for time location events';
  END IF;

  SELECT time_record.person_profile_id
  INTO target_record_person_profile_id
  FROM public.time_records time_record
  WHERE time_record.id = target_time_record_id
    AND time_record.organization_id = target_organization_id;

  IF target_record_person_profile_id IS NULL THEN
    RAISE EXCEPTION 'time record was not found';
  END IF;

  own_person_profile_id := public.get_own_person_profile_id(target_organization_id);

  IF target_record_person_profile_id IS DISTINCT FROM own_person_profile_id
    AND NOT public.can_manage_time_tracking(target_organization_id) THEN
    RAISE EXCEPTION 'time tracking manager role is required for this record';
  END IF;

  RETURN QUERY
  SELECT time_location_event.*
  FROM public.time_location_events time_location_event
  WHERE time_location_event.organization_id = target_organization_id
    AND time_location_event.retain_until > now()
    AND (
      time_location_event.time_record_id = target_time_record_id
      OR EXISTS (
        SELECT 1
        FROM public.time_punches time_punch
        WHERE time_punch.id = time_location_event.time_punch_id
          AND time_punch.organization_id = target_organization_id
          AND time_punch.time_record_id = target_time_record_id
      )
    )
  ORDER BY time_location_event.captured_at DESC
  LIMIT normalized_limit;
END;
$$;

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE public.center_time_location_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_location_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Location setting managers can view center time location settings"
  ON public.center_time_location_settings FOR SELECT TO authenticated
  USING (public.can_manage_time_location_settings(organization_id));

CREATE POLICY "Workers can view own time location events"
  ON public.time_location_events FOR SELECT TO authenticated
  USING (
    person_profile_id = public.get_own_person_profile_id(organization_id)
  );

CREATE POLICY "Time managers can view time location events"
  ON public.time_location_events FOR SELECT TO authenticated
  USING (public.can_manage_time_tracking(organization_id));

-- ============================================================
-- Grants
-- ============================================================

REVOKE ALL ON public.center_time_location_settings FROM PUBLIC;
REVOKE ALL ON public.time_location_events FROM PUBLIC;

GRANT SELECT ON public.center_time_location_settings TO authenticated;
GRANT SELECT ON public.time_location_events TO authenticated;

REVOKE ALL ON FUNCTION public.validate_center_time_location_setting_row()
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_time_location_event_row()
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_time_location_settings(uuid)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_activate_time_location_settings(uuid)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_center_time_location_setting(
  uuid,
  uuid,
  text,
  numeric,
  numeric,
  integer,
  integer,
  text,
  integer,
  text,
  integer,
  integer,
  text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_center_time_location_setting_status(uuid, uuid, text, text)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_own_time_location_event(
  uuid,
  text,
  text,
  text,
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  timestamptz
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_own_time_location_events(uuid, timestamptz, timestamptz, integer)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_time_location_events_for_record(uuid, uuid, integer)
  FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.can_manage_time_location_settings(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_activate_time_location_settings(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_center_time_location_setting(
  uuid,
  uuid,
  text,
  numeric,
  numeric,
  integer,
  integer,
  text,
  integer,
  text,
  integer,
  integer,
  text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_center_time_location_setting_status(uuid, uuid, text, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_own_time_location_event(
  uuid,
  text,
  text,
  text,
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  timestamptz
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_own_time_location_events(uuid, timestamptz, timestamptz, integer)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_time_location_events_for_record(uuid, uuid, integer)
  TO authenticated;
