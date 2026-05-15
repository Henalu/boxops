-- BoxOps - S.1 short operational audit
-- Tenant-scoped application audit for relevant admin and operational changes.
-- This does not cover Supabase Studio/Auth changes, backups, PITR, legal time
-- tracking audit, document audit, signatures, raw location, payroll or HR data.

-- ============================================================
-- Minimization and classification helpers
-- ============================================================

CREATE OR REPLACE FUNCTION public.operational_audit_changed_fields_is_safe(
  target_changed_fields jsonb
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  WITH RECURSIVE walk(key_name, value) AS (
    SELECT entry.key, entry.value
    FROM jsonb_each(
      CASE
        WHEN jsonb_typeof(target_changed_fields) = 'object' THEN target_changed_fields
        ELSE '{}'::jsonb
      END
    ) AS entry(key, value)

    UNION ALL

    SELECT nested.key, nested.value
    FROM walk
    CROSS JOIN LATERAL jsonb_each(
      CASE
        WHEN jsonb_typeof(walk.value) = 'object' THEN walk.value
        ELSE '{}'::jsonb
      END
    ) AS nested(key, value)
  )
  SELECT
    target_changed_fields IS NOT NULL
    AND jsonb_typeof(target_changed_fields) = 'object'
    AND pg_column_size(target_changed_fields) <= 4096
    AND NOT EXISTS (
      SELECT 1
      FROM walk
      WHERE length(key_name) > 64
        OR lower(key_name) ~ '(content|body|html|raw|base64|url|uri|path|token|secret|signature|document_hash|storage|password|credential|cookie|session|ip|fingerprint|latitude|longitude|coordinate|geolocation|gps|location|payroll|salary|iban|bank|ssn|national_id|nif|dni)'
        OR jsonb_typeof(value) = 'array'
        OR (
          jsonb_typeof(value) = 'string'
          AND (
            length(value #>> '{}') > 128
            OR (value #>> '{}') ~* '(https?://|data:|storage/v1|base64|-----BEGIN|signed-url|signed_url|@[^[:space:]]+[.][^[:space:]]+)'
          )
        )
    );
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
      lower(btrim(COALESCE(target_action, ''))) IN ('created', 'updated')
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
    ELSE
      RETURN false;
  END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION public.can_read_operational_audit_events(
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

-- ============================================================
-- Short operational audit events
-- ============================================================

CREATE TABLE public.operational_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_user_id uuid NOT NULL,
  actor_membership_id uuid NOT NULL,
  actor_person_profile_id uuid,
  entity_type text NOT NULL
    CHECK (entity_type IN (
      'team_invitations',
      'organization_memberships',
      'person_profiles',
      'coach_profiles',
      'schedule_blocks',
      'schedule_block_assignments',
      'schedule_templates',
      'schedule_template_blocks'
    )),
  entity_id uuid NOT NULL,
  action text NOT NULL,
  result text NOT NULL DEFAULT 'success'
    CHECK (result IN ('success', 'failed', 'denied')),
  changed_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  retain_until timestamptz NOT NULL,
  UNIQUE (id, organization_id),
  FOREIGN KEY (organization_id, actor_user_id)
    REFERENCES public.organization_memberships(organization_id, user_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (actor_membership_id, organization_id)
    REFERENCES public.organization_memberships(id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (actor_person_profile_id, organization_id)
    REFERENCES public.person_profiles(id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT operational_audit_action_allowed
    CHECK (public.operational_audit_entity_action_is_allowed(entity_type, action)),
  CONSTRAINT operational_audit_changed_fields_safe
    CHECK (public.operational_audit_changed_fields_is_safe(changed_fields)),
  CONSTRAINT operational_audit_retain_window
    CHECK (
      retain_until > created_at
      AND retain_until <= created_at + make_interval(days => public.operational_audit_retention_days(entity_type))
    )
);

CREATE INDEX operational_audit_events_org_created_idx
  ON public.operational_audit_events (organization_id, created_at DESC);

CREATE INDEX operational_audit_events_entity_idx
  ON public.operational_audit_events (organization_id, entity_type, entity_id, created_at DESC);

CREATE INDEX operational_audit_events_actor_idx
  ON public.operational_audit_events (organization_id, actor_user_id, created_at DESC);

CREATE INDEX operational_audit_events_retain_until_idx
  ON public.operational_audit_events (retain_until);

-- ============================================================
-- Recording and listing RPCs
-- ============================================================

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

  SELECT membership.*
  INTO current_membership
  FROM public.organization_memberships membership
  WHERE membership.organization_id = target_organization_id
    AND membership.user_id = current_user_id
    AND membership.status = 'active'
  LIMIT 1;

  IF current_membership.id IS NOT NULL THEN
    IF normalized_entity_type IN (
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

  own_person_profile_id := public.get_own_person_profile_id(target_organization_id);

  INSERT INTO public.operational_audit_events (
    organization_id,
    actor_user_id,
    actor_membership_id,
    actor_person_profile_id,
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
    current_membership.id,
    own_person_profile_id,
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
      'team_invitations',
      'organization_memberships',
      'person_profiles',
      'coach_profiles',
      'schedule_blocks',
      'schedule_block_assignments',
      'schedule_templates',
      'schedule_template_blocks'
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
-- Row Level Security and grants
-- ============================================================

ALTER TABLE public.operational_audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners and admins can read retained operational audit events"
  ON public.operational_audit_events FOR SELECT TO authenticated
  USING (
    retain_until > now()
    AND public.can_read_operational_audit_events(organization_id)
  );

REVOKE ALL ON TABLE public.operational_audit_events FROM anon, authenticated;
GRANT SELECT ON public.operational_audit_events TO authenticated;

REVOKE EXECUTE ON FUNCTION public.operational_audit_changed_fields_is_safe(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.operational_audit_entity_action_is_allowed(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.operational_audit_retention_days(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.operational_audit_entity_exists(uuid, text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_read_operational_audit_events(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_operational_audit_event(uuid, text, uuid, text, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.list_operational_audit_events(uuid, text, integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.can_read_operational_audit_events(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_operational_audit_event(uuid, text, uuid, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_operational_audit_events(uuid, text, integer) TO authenticated;
