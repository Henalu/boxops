-- BoxOps - Platform support operational management
-- Active app_support sessions can perform audited, non-sensitive operational
-- assistance without tenant impersonation or permanent platform memberships.

-- ============================================================
-- Operational audit identity for platform support sessions
-- ============================================================

ALTER TABLE public.operational_audit_events
  ADD COLUMN IF NOT EXISTS platform_support_session_id uuid;

ALTER TABLE public.operational_audit_events
  ALTER COLUMN actor_membership_id DROP NOT NULL;

ALTER TABLE public.operational_audit_events
  DROP CONSTRAINT IF EXISTS operational_audit_events_organization_id_actor_user_id_fkey;

ALTER TABLE public.operational_audit_events
  DROP CONSTRAINT IF EXISTS operational_audit_events_platform_support_session_id_organization_id_fkey;

ALTER TABLE public.operational_audit_events
  ADD CONSTRAINT operational_audit_events_platform_support_session_id_organization_id_fkey
  FOREIGN KEY (platform_support_session_id, organization_id)
    REFERENCES public.platform_support_sessions(id, organization_id)
    ON DELETE RESTRICT;

ALTER TABLE public.operational_audit_events
  DROP CONSTRAINT IF EXISTS operational_audit_events_actor_scope;

ALTER TABLE public.operational_audit_events
  ADD CONSTRAINT operational_audit_events_actor_scope
  CHECK (
    (actor_membership_id IS NOT NULL AND platform_support_session_id IS NULL)
    OR (actor_membership_id IS NULL AND platform_support_session_id IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS operational_audit_events_support_session_idx
  ON public.operational_audit_events (organization_id, platform_support_session_id, created_at DESC)
  WHERE platform_support_session_id IS NOT NULL;

ALTER TABLE public.operational_audit_events
  DROP CONSTRAINT IF EXISTS operational_audit_events_entity_type_check;

ALTER TABLE public.operational_audit_events
  ADD CONSTRAINT operational_audit_events_entity_type_check
  CHECK (entity_type IN (
    'centers',
    'class_types',
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

CREATE OR REPLACE FUNCTION public.can_read_operational_audit_events(
  target_organization_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_org_role(target_organization_id, ARRAY['owner', 'admin'])
    OR public.has_active_platform_support_session(target_organization_id);
$$;

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
    WHEN 'centers' THEN
      lower(btrim(COALESCE(target_action, ''))) IN ('created', 'updated', 'reactivated', 'deactivated')
    WHEN 'class_types' THEN
      lower(btrim(COALESCE(target_action, ''))) IN ('created', 'updated', 'reactivated', 'deactivated')
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
    WHEN 'centers' THEN 30
    WHEN 'class_types' THEN 30
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
    WHEN 'centers' THEN
      RETURN EXISTS (
        SELECT 1
        FROM public.centers entity
        WHERE entity.id = target_entity_id
          AND entity.organization_id = target_organization_id
      );
    WHEN 'class_types' THEN
      RETURN EXISTS (
        SELECT 1
        FROM public.class_types entity
        WHERE entity.id = target_entity_id
          AND entity.organization_id = target_organization_id
      );
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

CREATE OR REPLACE FUNCTION public.record_operational_audit_event(
  target_organization_id uuid,
  target_entity_type text,
  target_entity_id uuid,
  target_action text,
  target_result text DEFAULT 'success',
  target_changed_fields jsonb DEFAULT '{}'::jsonb
)
RETURNS public.operational_audit_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := (select auth.uid());
  current_membership public.organization_memberships;
  current_support_session public.platform_support_sessions;
  normalized_entity_type text := lower(btrim(COALESCE(target_entity_type, '')));
  normalized_action text := lower(btrim(COALESCE(target_action, '')));
  normalized_result text := lower(btrim(COALESCE(target_result, 'success')));
  normalized_changed_fields jsonb := COALESCE(target_changed_fields, '{}'::jsonb);
  own_person_profile_id uuid;
  can_record_event boolean := false;
  created_event public.operational_audit_events;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF normalized_result NOT IN ('success', 'failed', 'denied') THEN
    RAISE EXCEPTION 'operational audit result is not allowed';
  END IF;

  IF NOT public.operational_audit_entity_action_is_allowed(
    normalized_entity_type,
    normalized_action
  ) THEN
    RAISE EXCEPTION 'operational audit action is not allowed';
  END IF;

  IF NOT public.operational_audit_changed_fields_is_safe(normalized_changed_fields) THEN
    RAISE EXCEPTION 'operational audit changed fields are not allowed';
  END IF;

  IF NOT public.operational_audit_entity_exists(
    target_organization_id,
    normalized_entity_type,
    target_entity_id
  ) THEN
    RAISE EXCEPTION 'operational audit entity was not found in tenant';
  END IF;

  SELECT support_session.*
  INTO current_support_session
  FROM public.platform_support_sessions support_session
  INNER JOIN public.platform_admins platform_admin
    ON platform_admin.id = support_session.platform_admin_id
    AND platform_admin.user_id = support_session.actor_user_id
  INNER JOIN public.organizations organization
    ON organization.id = support_session.organization_id
  WHERE support_session.organization_id = target_organization_id
    AND support_session.actor_user_id = current_user_id
    AND support_session.status = 'active'
    AND support_session.support_scope = 'app_support'
    AND support_session.expires_at > now()
    AND platform_admin.status = 'active'
    AND platform_admin.role IN ('platform_owner', 'support')
    AND organization.status IN ('trialing', 'active')
  ORDER BY support_session.started_at DESC
  LIMIT 1;

  IF current_support_session.id IS NOT NULL THEN
    can_record_event := normalized_entity_type IN (
      'centers',
      'class_types',
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
    );
  ELSE
    SELECT membership.*
    INTO current_membership
    FROM public.organization_memberships membership
    WHERE membership.organization_id = target_organization_id
      AND membership.user_id = current_user_id
      AND membership.status = 'active'
    LIMIT 1;

    IF current_membership.id IS NOT NULL THEN
      IF normalized_entity_type IN (
        'centers',
        'class_types',
        'team_invitations',
        'organization_memberships',
        'person_profiles',
        'coach_profiles'
      ) THEN
        can_record_event := current_membership.role IN ('owner', 'admin');
      ELSE
        can_record_event := current_membership.role IN ('owner', 'admin', 'manager');
      END IF;
    END IF;
  END IF;

  IF NOT can_record_event
    AND normalized_entity_type = 'team_invitations'
    AND normalized_action = 'accepted' THEN
    SELECT membership.*
    INTO current_membership
    FROM public.organization_memberships membership
    WHERE membership.organization_id = target_organization_id
      AND membership.user_id = current_user_id
    LIMIT 1;

    can_record_event :=
      current_membership.id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.team_invitations invitation
        WHERE invitation.id = target_entity_id
          AND invitation.organization_id = target_organization_id
          AND invitation.status = 'accepted'
          AND invitation.accepted_by_user_id = current_user_id
      );
  END IF;

  IF NOT can_record_event THEN
    RAISE EXCEPTION 'operational audit permission required';
  END IF;

  own_person_profile_id := CASE
    WHEN current_support_session.id IS NULL THEN public.get_own_person_profile_id(target_organization_id)
    ELSE NULL
  END;

  INSERT INTO public.operational_audit_events (
    organization_id,
    actor_user_id,
    actor_membership_id,
    actor_person_profile_id,
    platform_support_session_id,
    entity_type,
    entity_id,
    action,
    result,
    changed_fields,
    retain_until
  )
  VALUES (
    target_organization_id,
    current_user_id,
    CASE WHEN current_support_session.id IS NULL THEN current_membership.id ELSE NULL END,
    own_person_profile_id,
    current_support_session.id,
    normalized_entity_type,
    target_entity_id,
    normalized_action,
    normalized_result,
    normalized_changed_fields,
    now() + make_interval(days => public.operational_audit_retention_days(normalized_entity_type))
  )
  RETURNING *
  INTO created_event;

  RETURN created_event;
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
      'centers',
      'class_types',
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
-- Class type sync RPC support permission
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_class_type_and_sync_defaults(
  target_organization_id uuid,
  target_class_type_id uuid,
  target_name text,
  target_slug text,
  target_category text,
  target_required_coaches integer,
  target_requires_certification boolean,
  target_color text,
  target_status text,
  target_effective_from date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  previous_required_coaches integer;
  schedule_blocks_updated integer := 0;
  template_blocks_updated integer := 0;
  effective_from date := COALESCE(target_effective_from, CURRENT_DATE);
BEGIN
  IF NOT (
    public.has_org_role(target_organization_id, ARRAY['owner', 'admin', 'manager'])
    OR public.has_active_platform_support_session(target_organization_id)
  ) THEN
    RAISE EXCEPTION 'forbidden'
      USING ERRCODE = '42501';
  END IF;

  IF target_name IS NULL OR btrim(target_name) = '' THEN
    RAISE EXCEPTION 'invalid_name'
      USING ERRCODE = '22023';
  END IF;

  IF target_slug IS NULL OR target_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' THEN
    RAISE EXCEPTION 'invalid_slug'
      USING ERRCODE = '22023';
  END IF;

  IF target_category NOT IN ('class', 'staffing', 'event', 'competition', 'holiday', 'other') THEN
    RAISE EXCEPTION 'invalid_category'
      USING ERRCODE = '22023';
  END IF;

  IF target_required_coaches IS NULL OR target_required_coaches < 0 OR target_required_coaches > 20 THEN
    RAISE EXCEPTION 'invalid_required_coaches'
      USING ERRCODE = '22023';
  END IF;

  IF target_status NOT IN ('active', 'inactive') THEN
    RAISE EXCEPTION 'invalid_status'
      USING ERRCODE = '22023';
  END IF;

  IF target_color IS NOT NULL AND target_color !~ '^#[0-9a-fA-F]{6}$' THEN
    RAISE EXCEPTION 'invalid_color'
      USING ERRCODE = '22023';
  END IF;

  SELECT class_type.required_coaches
  INTO previous_required_coaches
  FROM public.class_types class_type
  WHERE class_type.id = target_class_type_id
    AND class_type.organization_id = target_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'class_type_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.class_types
  SET
    name = btrim(target_name),
    slug = target_slug,
    category = target_category,
    required_coaches = target_required_coaches,
    requires_certification = COALESCE(target_requires_certification, false),
    color = lower(target_color),
    status = target_status
  WHERE id = target_class_type_id
    AND organization_id = target_organization_id;

  UPDATE public.schedule_template_blocks template_block
  SET required_coaches = target_required_coaches
  WHERE template_block.organization_id = target_organization_id
    AND template_block.class_type_id = target_class_type_id
    AND template_block.required_coaches IS DISTINCT FROM target_required_coaches;

  GET DIAGNOSTICS template_blocks_updated = ROW_COUNT;

  UPDATE public.schedule_blocks schedule_block
  SET required_coaches = target_required_coaches
  WHERE schedule_block.organization_id = target_organization_id
    AND schedule_block.class_type_id = target_class_type_id
    AND schedule_block.service_date >= effective_from
    AND schedule_block.status NOT IN ('cancelled', 'completed')
    AND schedule_block.required_coaches IS DISTINCT FROM target_required_coaches;

  GET DIAGNOSTICS schedule_blocks_updated = ROW_COUNT;

  RETURN jsonb_build_object(
    'classTypeId', target_class_type_id,
    'effectiveFrom', effective_from,
    'previousRequiredCoaches', previous_required_coaches,
    'requiredCoaches', target_required_coaches,
    'scheduleBlocksUpdated', schedule_blocks_updated,
    'templateBlocksUpdated', template_blocks_updated
  );
END;
$$;

-- ============================================================
-- Operational events support permission
-- ============================================================

CREATE OR REPLACE FUNCTION public.can_manage_operational_events(
  target_organization_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_org_role(target_organization_id, ARRAY['owner', 'admin', 'manager'])
    OR public.has_active_platform_support_session(target_organization_id);
$$;

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
-- RLS: operational support writes for active support sessions
-- ============================================================

DROP POLICY IF EXISTS "Platform support sessions can create centers"
  ON public.centers;

CREATE POLICY "Platform support sessions can create centers"
  ON public.centers FOR INSERT TO authenticated
  WITH CHECK (public.has_active_platform_support_session(organization_id));

DROP POLICY IF EXISTS "Platform support sessions can update centers"
  ON public.centers;

CREATE POLICY "Platform support sessions can update centers"
  ON public.centers FOR UPDATE TO authenticated
  USING (public.has_active_platform_support_session(organization_id))
  WITH CHECK (public.has_active_platform_support_session(organization_id));

DROP POLICY IF EXISTS "Platform support sessions can create memberships"
  ON public.organization_memberships;

CREATE POLICY "Platform support sessions can create memberships"
  ON public.organization_memberships FOR INSERT TO authenticated
  WITH CHECK (public.has_active_platform_support_session(organization_id));

DROP POLICY IF EXISTS "Platform support sessions can update memberships"
  ON public.organization_memberships;

CREATE POLICY "Platform support sessions can update memberships"
  ON public.organization_memberships FOR UPDATE TO authenticated
  USING (public.has_active_platform_support_session(organization_id))
  WITH CHECK (public.has_active_platform_support_session(organization_id));

DROP POLICY IF EXISTS "Platform support sessions can delete memberships"
  ON public.organization_memberships;

CREATE POLICY "Platform support sessions can delete memberships"
  ON public.organization_memberships FOR DELETE TO authenticated
  USING (public.has_active_platform_support_session(organization_id));

DROP POLICY IF EXISTS "Platform support sessions can create person profiles"
  ON public.person_profiles;

CREATE POLICY "Platform support sessions can create person profiles"
  ON public.person_profiles FOR INSERT TO authenticated
  WITH CHECK (public.has_active_platform_support_session(organization_id));

DROP POLICY IF EXISTS "Platform support sessions can update person profiles"
  ON public.person_profiles;

CREATE POLICY "Platform support sessions can update person profiles"
  ON public.person_profiles FOR UPDATE TO authenticated
  USING (public.has_active_platform_support_session(organization_id))
  WITH CHECK (public.has_active_platform_support_session(organization_id));

DROP POLICY IF EXISTS "Platform support sessions can delete person profiles"
  ON public.person_profiles;

CREATE POLICY "Platform support sessions can delete person profiles"
  ON public.person_profiles FOR DELETE TO authenticated
  USING (public.has_active_platform_support_session(organization_id));

DROP POLICY IF EXISTS "Platform support sessions can create coach profiles"
  ON public.coach_profiles;

CREATE POLICY "Platform support sessions can create coach profiles"
  ON public.coach_profiles FOR INSERT TO authenticated
  WITH CHECK (public.has_active_platform_support_session(organization_id));

DROP POLICY IF EXISTS "Platform support sessions can update coach profiles"
  ON public.coach_profiles;

CREATE POLICY "Platform support sessions can update coach profiles"
  ON public.coach_profiles FOR UPDATE TO authenticated
  USING (public.has_active_platform_support_session(organization_id))
  WITH CHECK (public.has_active_platform_support_session(organization_id));

DROP POLICY IF EXISTS "Platform support sessions can delete coach profiles"
  ON public.coach_profiles;

CREATE POLICY "Platform support sessions can delete coach profiles"
  ON public.coach_profiles FOR DELETE TO authenticated
  USING (public.has_active_platform_support_session(organization_id));

DROP POLICY IF EXISTS "Platform support sessions can create coach center assignments"
  ON public.coach_center_assignments;

CREATE POLICY "Platform support sessions can create coach center assignments"
  ON public.coach_center_assignments FOR INSERT TO authenticated
  WITH CHECK (public.has_active_platform_support_session(organization_id));

DROP POLICY IF EXISTS "Platform support sessions can update coach center assignments"
  ON public.coach_center_assignments;

CREATE POLICY "Platform support sessions can update coach center assignments"
  ON public.coach_center_assignments FOR UPDATE TO authenticated
  USING (public.has_active_platform_support_session(organization_id))
  WITH CHECK (public.has_active_platform_support_session(organization_id));

DROP POLICY IF EXISTS "Platform support sessions can delete coach center assignments"
  ON public.coach_center_assignments;

CREATE POLICY "Platform support sessions can delete coach center assignments"
  ON public.coach_center_assignments FOR DELETE TO authenticated
  USING (public.has_active_platform_support_session(organization_id));

DROP POLICY IF EXISTS "Platform support sessions can read team invitations"
  ON public.team_invitations;

CREATE POLICY "Platform support sessions can read team invitations"
  ON public.team_invitations FOR SELECT TO authenticated
  USING (public.has_active_platform_support_session(organization_id));

DROP POLICY IF EXISTS "Platform support sessions can create team invitations"
  ON public.team_invitations;

CREATE POLICY "Platform support sessions can create team invitations"
  ON public.team_invitations FOR INSERT TO authenticated
  WITH CHECK (public.has_active_platform_support_session(organization_id));

DROP POLICY IF EXISTS "Platform support sessions can update team invitations"
  ON public.team_invitations;

CREATE POLICY "Platform support sessions can update team invitations"
  ON public.team_invitations FOR UPDATE TO authenticated
  USING (public.has_active_platform_support_session(organization_id))
  WITH CHECK (public.has_active_platform_support_session(organization_id));

DROP POLICY IF EXISTS "Platform support sessions can create class types"
  ON public.class_types;

CREATE POLICY "Platform support sessions can create class types"
  ON public.class_types FOR INSERT TO authenticated
  WITH CHECK (public.has_active_platform_support_session(organization_id));

DROP POLICY IF EXISTS "Platform support sessions can update class types"
  ON public.class_types;

CREATE POLICY "Platform support sessions can update class types"
  ON public.class_types FOR UPDATE TO authenticated
  USING (public.has_active_platform_support_session(organization_id))
  WITH CHECK (public.has_active_platform_support_session(organization_id));

DROP POLICY IF EXISTS "Platform support sessions can create schedule templates"
  ON public.schedule_templates;

CREATE POLICY "Platform support sessions can create schedule templates"
  ON public.schedule_templates FOR INSERT TO authenticated
  WITH CHECK (public.has_active_platform_support_session(organization_id));

DROP POLICY IF EXISTS "Platform support sessions can update schedule templates"
  ON public.schedule_templates;

CREATE POLICY "Platform support sessions can update schedule templates"
  ON public.schedule_templates FOR UPDATE TO authenticated
  USING (public.has_active_platform_support_session(organization_id))
  WITH CHECK (public.has_active_platform_support_session(organization_id));

DROP POLICY IF EXISTS "Platform support sessions can create template blocks"
  ON public.schedule_template_blocks;

CREATE POLICY "Platform support sessions can create template blocks"
  ON public.schedule_template_blocks FOR INSERT TO authenticated
  WITH CHECK (public.has_active_platform_support_session(organization_id));

DROP POLICY IF EXISTS "Platform support sessions can update template blocks"
  ON public.schedule_template_blocks;

CREATE POLICY "Platform support sessions can update template blocks"
  ON public.schedule_template_blocks FOR UPDATE TO authenticated
  USING (public.has_active_platform_support_session(organization_id))
  WITH CHECK (public.has_active_platform_support_session(organization_id));

DROP POLICY IF EXISTS "Platform support sessions can delete template blocks"
  ON public.schedule_template_blocks;

CREATE POLICY "Platform support sessions can delete template blocks"
  ON public.schedule_template_blocks FOR DELETE TO authenticated
  USING (public.has_active_platform_support_session(organization_id));

DROP POLICY IF EXISTS "Platform support sessions can create schedule blocks"
  ON public.schedule_blocks;

CREATE POLICY "Platform support sessions can create schedule blocks"
  ON public.schedule_blocks FOR INSERT TO authenticated
  WITH CHECK (public.has_active_platform_support_session(organization_id));

DROP POLICY IF EXISTS "Platform support sessions can update schedule blocks"
  ON public.schedule_blocks;

CREATE POLICY "Platform support sessions can update schedule blocks"
  ON public.schedule_blocks FOR UPDATE TO authenticated
  USING (public.has_active_platform_support_session(organization_id))
  WITH CHECK (public.has_active_platform_support_session(organization_id));

DROP POLICY IF EXISTS "Platform support sessions can delete schedule blocks"
  ON public.schedule_blocks;

CREATE POLICY "Platform support sessions can delete schedule blocks"
  ON public.schedule_blocks FOR DELETE TO authenticated
  USING (public.has_active_platform_support_session(organization_id));

DROP POLICY IF EXISTS "Platform support sessions can create schedule assignments"
  ON public.schedule_block_assignments;

CREATE POLICY "Platform support sessions can create schedule assignments"
  ON public.schedule_block_assignments FOR INSERT TO authenticated
  WITH CHECK (public.has_active_platform_support_session(organization_id));

DROP POLICY IF EXISTS "Platform support sessions can update schedule assignments"
  ON public.schedule_block_assignments;

CREATE POLICY "Platform support sessions can update schedule assignments"
  ON public.schedule_block_assignments FOR UPDATE TO authenticated
  USING (public.has_active_platform_support_session(organization_id))
  WITH CHECK (public.has_active_platform_support_session(organization_id));

DROP POLICY IF EXISTS "Platform support sessions can delete schedule assignments"
  ON public.schedule_block_assignments;

CREATE POLICY "Platform support sessions can delete schedule assignments"
  ON public.schedule_block_assignments FOR DELETE TO authenticated
  USING (public.has_active_platform_support_session(organization_id));

DROP POLICY IF EXISTS "Platform support sessions can read staff work windows"
  ON public.staff_work_windows;

CREATE POLICY "Platform support sessions can read staff work windows"
  ON public.staff_work_windows FOR SELECT TO authenticated
  USING (public.has_active_platform_support_session(organization_id));

DROP POLICY IF EXISTS "Platform support sessions can create staff work windows"
  ON public.staff_work_windows;

CREATE POLICY "Platform support sessions can create staff work windows"
  ON public.staff_work_windows FOR INSERT TO authenticated
  WITH CHECK (public.has_active_platform_support_session(organization_id));

DROP POLICY IF EXISTS "Platform support sessions can update staff work windows"
  ON public.staff_work_windows;

CREATE POLICY "Platform support sessions can update staff work windows"
  ON public.staff_work_windows FOR UPDATE TO authenticated
  USING (public.has_active_platform_support_session(organization_id))
  WITH CHECK (public.has_active_platform_support_session(organization_id));

REVOKE EXECUTE ON FUNCTION public.can_read_operational_audit_events(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.operational_audit_entity_action_is_allowed(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.operational_audit_retention_days(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.operational_audit_entity_exists(uuid, text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_operational_audit_event(uuid, text, uuid, text, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.list_operational_audit_events(uuid, text, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_class_type_and_sync_defaults(uuid, uuid, text, text, text, integer, boolean, text, text, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_manage_operational_events(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_operational_event(uuid, text, text, timestamptz, timestamptz, text, uuid, text, text, text, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_operational_event(uuid, uuid, text, text, timestamptz, timestamptz, text, uuid, text, text, text, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_operational_event_status(uuid, uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.can_read_operational_audit_events(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_operational_audit_event(uuid, text, uuid, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_operational_audit_events(uuid, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_class_type_and_sync_defaults(uuid, uuid, text, text, text, integer, boolean, text, text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_operational_events(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_operational_event(uuid, text, text, timestamptz, timestamptz, text, uuid, text, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_operational_event(uuid, uuid, text, text, timestamptz, timestamptz, text, uuid, text, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_operational_event_status(uuid, uuid, text) TO authenticated;
