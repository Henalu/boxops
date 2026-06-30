-- BoxOps - ChatGPT connector confirmed schedule template application.
--
-- CG.3B keeps the public transport out of scope, but the actual schedule
-- mutation needs one transactional database primitive: confirmation, schedule
-- blocks, assignments and audit must succeed or fail together.

CREATE TABLE public.chatgpt_connector_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_user_id uuid NOT NULL,
  tool text NOT NULL CHECK (tool IN ('apply_schedule_template')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'applied')),
  token_hash text NOT NULL UNIQUE
    CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  template_id uuid NOT NULL,
  center_id uuid NOT NULL,
  date_from date NOT NULL,
  date_to date NOT NULL,
  plan_hash text NOT NULL CHECK (char_length(plan_hash) BETWEEN 1 AND 128),
  idempotency_key_hash text NOT NULL
    CHECK (idempotency_key_hash ~ '^[0-9a-f]{64}$'),
  plan_snapshot jsonb NOT NULL
    CHECK (
      jsonb_typeof(plan_snapshot) = 'object'
      AND pg_column_size(plan_snapshot) <= 262144
    ),
  prepare_request_id text NOT NULL CHECK (char_length(prepare_request_id) <= 80),
  apply_request_id text CHECK (apply_request_id IS NULL OR char_length(apply_request_id) <= 80),
  expires_at timestamptz NOT NULL,
  applied_at timestamptz,
  audit_event_id uuid,
  created_block_count integer NOT NULL DEFAULT 0 CHECK (created_block_count >= 0),
  created_assignment_count integer NOT NULL DEFAULT 0 CHECK (created_assignment_count >= 0),
  skipped_duplicate_count integer NOT NULL DEFAULT 0 CHECK (skipped_duplicate_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id),
  FOREIGN KEY (template_id, organization_id)
    REFERENCES public.schedule_templates(id, organization_id)
    ON DELETE CASCADE,
  FOREIGN KEY (center_id, organization_id)
    REFERENCES public.centers(id, organization_id)
    ON DELETE CASCADE,
  FOREIGN KEY (organization_id, actor_user_id)
    REFERENCES public.organization_memberships(organization_id, user_id)
    ON DELETE CASCADE,
  CONSTRAINT chatgpt_connector_confirmations_date_range
    CHECK (date_from <= date_to)
);

CREATE INDEX chatgpt_connector_confirmations_idempotency_idx
  ON public.chatgpt_connector_confirmations (
    organization_id,
    tool,
    idempotency_key_hash,
    status
  );

CREATE INDEX chatgpt_connector_confirmations_expiry_idx
  ON public.chatgpt_connector_confirmations (expires_at)
  WHERE status = 'pending';

CREATE TRIGGER chatgpt_connector_confirmations_set_updated_at
  BEFORE UPDATE ON public.chatgpt_connector_confirmations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.chatgpt_connector_confirmations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Operators can create own connector confirmations"
  ON public.chatgpt_connector_confirmations FOR INSERT TO authenticated
  WITH CHECK (
    actor_user_id = (select auth.uid())
    AND public.has_org_role(organization_id, ARRAY['owner', 'admin', 'manager'])
  );

CREATE POLICY "Operators can read own connector confirmations"
  ON public.chatgpt_connector_confirmations FOR SELECT TO authenticated
  USING (
    actor_user_id = (select auth.uid())
    AND public.has_org_role(organization_id, ARRAY['owner', 'admin', 'manager'])
  );

CREATE POLICY "Operators can update own connector confirmations"
  ON public.chatgpt_connector_confirmations FOR UPDATE TO authenticated
  USING (
    actor_user_id = (select auth.uid())
    AND public.has_org_role(organization_id, ARRAY['owner', 'admin', 'manager'])
  )
  WITH CHECK (
    actor_user_id = (select auth.uid())
    AND public.has_org_role(organization_id, ARRAY['owner', 'admin', 'manager'])
  );

REVOKE ALL ON TABLE public.chatgpt_connector_confirmations FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.chatgpt_connector_confirmations TO authenticated;

CREATE OR REPLACE FUNCTION public.apply_chatgpt_schedule_template_application(
  target_confirmation_id uuid,
  target_token_hash text,
  target_organization_id uuid,
  target_template_id uuid,
  target_center_id uuid,
  target_date_from date,
  target_date_to date,
  target_plan_hash text,
  target_idempotency_key_hash text,
  target_request_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := (select auth.uid());
  target_confirmation public.chatgpt_connector_confirmations;
  applied_confirmation public.chatgpt_connector_confirmations;
  target_template public.schedule_templates;
  target_center public.centers;
  audit_event public.operational_audit_events;
  total_candidate_count integer := 0;
  original_conflict_count integer := 0;
  current_conflict_count integer := 0;
  to_insert_count integer := 0;
  inserted_block_count integer := 0;
  inserted_assignment_count integer := 0;
  v_skipped_duplicate_count integer := 0;
BEGIN
  IF current_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'authentication_required',
      'reason', 'authentication_required'
    );
  END IF;

  IF NOT public.has_org_role(target_organization_id, ARRAY['owner', 'admin', 'manager']) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'permission_denied',
      'reason', 'permission_denied'
    );
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext(target_organization_id::text),
    hashtext('chatgpt_apply:' || COALESCE(target_idempotency_key_hash, ''))
  );

  SELECT confirmation.*
  INTO target_confirmation
  FROM public.chatgpt_connector_confirmations confirmation
  WHERE confirmation.id = target_confirmation_id
    AND confirmation.organization_id = target_organization_id
  FOR UPDATE;

  IF target_confirmation.id IS NULL
    OR target_confirmation.actor_user_id <> current_user_id
    OR target_confirmation.tool <> 'apply_schedule_template'
    OR target_confirmation.token_hash <> target_token_hash
    OR target_confirmation.template_id <> target_template_id
    OR target_confirmation.center_id <> target_center_id
    OR target_confirmation.date_from <> target_date_from
    OR target_confirmation.date_to <> target_date_to
    OR target_confirmation.plan_hash <> target_plan_hash
    OR target_confirmation.idempotency_key_hash <> target_idempotency_key_hash
  THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'confirmation_mismatch',
      'reason', 'confirmation_mismatch'
    );
  END IF;

  IF target_confirmation.expires_at <= now() THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'confirmation_mismatch',
      'reason', 'confirmation_expired'
    );
  END IF;

  SELECT confirmation.*
  INTO applied_confirmation
  FROM public.chatgpt_connector_confirmations confirmation
  WHERE confirmation.organization_id = target_organization_id
    AND confirmation.tool = 'apply_schedule_template'
    AND confirmation.idempotency_key_hash = target_idempotency_key_hash
    AND confirmation.status = 'applied'
  ORDER BY confirmation.applied_at ASC NULLS LAST, confirmation.created_at ASC
  LIMIT 1
  FOR UPDATE;

  IF applied_confirmation.id IS NOT NULL THEN
    IF applied_confirmation.template_id <> target_template_id
      OR applied_confirmation.center_id <> target_center_id
      OR applied_confirmation.date_from <> target_date_from
      OR applied_confirmation.date_to <> target_date_to
      OR applied_confirmation.plan_hash <> target_plan_hash
    THEN
      RETURN jsonb_build_object(
        'ok', false,
        'code', 'idempotency_conflict',
        'reason', 'key_reused_with_different_payload'
      );
    END IF;

    RETURN jsonb_build_object(
      'ok', true,
      'applied', true,
      'idempotent_replay', true,
      'created_blocks', applied_confirmation.created_block_count,
      'created_assignments', applied_confirmation.created_assignment_count,
      'skipped_duplicates', applied_confirmation.skipped_duplicate_count,
      'audit_event_id', applied_confirmation.audit_event_id
    );
  END IF;

  IF target_confirmation.status <> 'pending' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'confirmation_mismatch',
      'reason', 'confirmation_already_consumed'
    );
  END IF;

  SELECT template.*
  INTO target_template
  FROM public.schedule_templates template
  WHERE template.id = target_template_id
    AND template.organization_id = target_organization_id;

  IF target_template.id IS NULL
    OR target_template.template_type <> 'weekly'
    OR target_template.status NOT IN ('draft', 'active')
    OR (target_template.center_id IS NOT NULL AND target_template.center_id <> target_center_id)
  THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'template_not_applicable',
      'reason', 'template_not_applicable'
    );
  END IF;

  SELECT center.*
  INTO target_center
  FROM public.centers center
  WHERE center.id = target_center_id
    AND center.organization_id = target_organization_id
    AND center.status = 'active';

  IF target_center.id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'center_not_found',
      'reason', 'center_not_found'
    );
  END IF;

  IF jsonb_typeof(target_confirmation.plan_snapshot -> 'candidate_blocks') <> 'array' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'confirmation_mismatch',
      'reason', 'invalid_plan_snapshot'
    );
  END IF;

  total_candidate_count :=
    jsonb_array_length(target_confirmation.plan_snapshot -> 'candidate_blocks');
  original_conflict_count :=
    COALESCE(
      NULLIF(target_confirmation.plan_snapshot #>> '{summary,conflict_count}', '')::integer,
      0
    );

  IF total_candidate_count = 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'template_not_applicable',
      'reason', 'template_empty'
    );
  END IF;

  IF original_conflict_count > 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'template_not_applicable',
      'reason', 'application_conflicts_found'
    );
  END IF;

  IF EXISTS (
    WITH candidates AS (
      SELECT *
      FROM jsonb_to_recordset(target_confirmation.plan_snapshot -> 'candidate_blocks')
        AS candidate(
          center_id uuid,
          class_type_id uuid,
          date date,
          default_coach_id uuid,
          ends_at time,
          required_coaches integer,
          starts_at time,
          template_block_id uuid,
          will_create boolean
        )
    )
    SELECT 1
    FROM candidates candidate
    LEFT JOIN public.schedule_template_blocks template_block
      ON template_block.id = candidate.template_block_id
     AND template_block.organization_id = target_organization_id
     AND template_block.template_id = target_template_id
    LEFT JOIN public.class_types class_type
      ON class_type.id = candidate.class_type_id
     AND class_type.organization_id = target_organization_id
    WHERE candidate.center_id <> target_center_id
      OR candidate.date < target_date_from
      OR candidate.date > target_date_to
      OR template_block.id IS NULL
      OR template_block.center_id <> candidate.center_id
      OR template_block.class_type_id <> candidate.class_type_id
      OR template_block.day_of_week <> EXTRACT(ISODOW FROM candidate.date)::integer
      OR template_block.start_time <> candidate.starts_at
      OR template_block.end_time <> candidate.ends_at
      OR template_block.required_coaches <> candidate.required_coaches
      OR COALESCE(template_block.default_coach_profile_id, '00000000-0000-0000-0000-000000000000'::uuid)
         <> COALESCE(candidate.default_coach_id, '00000000-0000-0000-0000-000000000000'::uuid)
      OR class_type.id IS NULL
      OR class_type.status <> 'active'
      OR (target_template.valid_from IS NOT NULL AND candidate.date < target_template.valid_from)
      OR (target_template.valid_until IS NOT NULL AND candidate.date > target_template.valid_until)
    LIMIT 1
  ) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'confirmation_mismatch',
      'reason', 'plan_snapshot_no_longer_matches_template'
    );
  END IF;

  IF EXISTS (
    WITH candidates AS (
      SELECT *
      FROM jsonb_to_recordset(target_confirmation.plan_snapshot -> 'candidate_blocks')
        AS candidate(
          default_coach_id uuid,
          required_coaches integer
        )
    )
    SELECT 1
    FROM candidates candidate
    LEFT JOIN public.coach_profiles coach_profile
      ON coach_profile.id = candidate.default_coach_id
     AND coach_profile.organization_id = target_organization_id
     AND coach_profile.status = 'active'
    LEFT JOIN public.person_profiles person_profile
      ON person_profile.id = coach_profile.person_profile_id
     AND person_profile.organization_id = target_organization_id
     AND person_profile.status = 'active'
     AND person_profile.visibility_status = 'visible'
    LEFT JOIN public.organization_memberships membership
      ON membership.organization_id = target_organization_id
     AND membership.user_id = coach_profile.user_id
     AND membership.status = 'active'
    WHERE candidate.required_coaches > 0
      AND candidate.default_coach_id IS NOT NULL
      AND (
        coach_profile.id IS NULL
        OR (coach_profile.person_profile_id IS NOT NULL AND person_profile.id IS NULL)
        OR (coach_profile.user_id IS NOT NULL AND membership.id IS NULL)
        OR (coach_profile.person_profile_id IS NULL AND coach_profile.user_id IS NULL)
      )
    LIMIT 1
  ) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'template_not_applicable',
      'reason', 'default_coach_not_assignable'
    );
  END IF;

  IF EXISTS (
    WITH candidates AS (
      SELECT *
      FROM jsonb_to_recordset(target_confirmation.plan_snapshot -> 'candidate_blocks')
        AS candidate(
          class_type_id uuid,
          default_coach_id uuid,
          required_coaches integer
        )
    )
    SELECT 1
    FROM candidates candidate
    INNER JOIN public.class_types class_type
      ON class_type.id = candidate.class_type_id
     AND class_type.organization_id = target_organization_id
    WHERE candidate.required_coaches > 0
      AND candidate.default_coach_id IS NOT NULL
      AND class_type.certification_id IS NOT NULL
      AND NOT public.has_active_coach_certification(
        target_organization_id,
        candidate.default_coach_id,
        class_type.certification_id
      )
    LIMIT 1
  ) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'template_not_applicable',
      'reason', 'coach_missing_certification'
    );
  END IF;

  LOCK TABLE public.schedule_blocks IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.schedule_block_assignments IN SHARE ROW EXCLUSIVE MODE;

  WITH candidates AS (
    SELECT *
    FROM jsonb_to_recordset(target_confirmation.plan_snapshot -> 'candidate_blocks')
      AS candidate(
        center_id uuid,
        class_type_id uuid,
        date date,
        default_coach_id uuid,
        ends_at time,
        required_coaches integer,
        starts_at time,
        template_block_id uuid,
        will_create boolean
      )
  ),
  duplicate_candidates AS (
    SELECT candidate.*
    FROM candidates candidate
    WHERE EXISTS (
      SELECT 1
      FROM public.schedule_blocks existing_block
      WHERE existing_block.organization_id = target_organization_id
        AND existing_block.status NOT IN ('cancelled', 'completed')
        AND (
          (
            existing_block.template_id = target_template_id
            AND existing_block.template_block_id = candidate.template_block_id
            AND existing_block.service_date = candidate.date
          )
          OR (
            existing_block.center_id = candidate.center_id
            AND existing_block.class_type_id = candidate.class_type_id
            AND existing_block.service_date = candidate.date
            AND existing_block.start_time = candidate.starts_at
            AND existing_block.end_time = candidate.ends_at
          )
        )
    )
  ),
  blocks_to_create AS (
    SELECT candidate.*
    FROM candidates candidate
    WHERE candidate.will_create = true
      AND NOT EXISTS (
        SELECT 1
        FROM duplicate_candidates duplicate
        WHERE duplicate.template_block_id = candidate.template_block_id
          AND duplicate.date = candidate.date
      )
  ),
  center_conflicts AS (
    SELECT candidate.template_block_id, candidate.date
    FROM blocks_to_create candidate
    WHERE EXISTS (
      SELECT 1
      FROM public.schedule_blocks existing_block
      WHERE existing_block.organization_id = target_organization_id
        AND existing_block.center_id = candidate.center_id
        AND existing_block.service_date = candidate.date
        AND existing_block.status NOT IN ('cancelled', 'completed')
        AND existing_block.start_time < candidate.ends_at
        AND candidate.starts_at < existing_block.end_time
    )
  ),
  coach_conflicts AS (
    SELECT candidate.template_block_id, candidate.date
    FROM blocks_to_create candidate
    WHERE candidate.required_coaches > 0
      AND candidate.default_coach_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.schedule_block_assignments assignment
        INNER JOIN public.schedule_blocks existing_block
          ON existing_block.id = assignment.schedule_block_id
         AND existing_block.organization_id = assignment.organization_id
        WHERE assignment.organization_id = target_organization_id
          AND assignment.coach_profile_id = candidate.default_coach_id
          AND assignment.assignment_status = 'assigned'
          AND existing_block.status NOT IN ('cancelled', 'completed')
          AND existing_block.service_date = candidate.date
          AND existing_block.start_time < candidate.ends_at
          AND candidate.starts_at < existing_block.end_time
      )
  )
  SELECT
    (SELECT count(*) FROM duplicate_candidates),
    (SELECT count(*) FROM blocks_to_create),
    (SELECT count(*) FROM center_conflicts) + (SELECT count(*) FROM coach_conflicts)
  INTO v_skipped_duplicate_count, to_insert_count, current_conflict_count;

  IF current_conflict_count > 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'template_not_applicable',
      'reason', 'application_conflicts_found',
      'conflict_count', current_conflict_count
    );
  END IF;

  WITH candidates AS (
    SELECT *
    FROM jsonb_to_recordset(target_confirmation.plan_snapshot -> 'candidate_blocks')
      AS candidate(
        center_id uuid,
        class_type_id uuid,
        date date,
        default_coach_id uuid,
        ends_at time,
        required_coaches integer,
        starts_at time,
        template_block_id uuid,
        will_create boolean
      )
  ),
  duplicate_candidates AS (
    SELECT candidate.*
    FROM candidates candidate
    WHERE EXISTS (
      SELECT 1
      FROM public.schedule_blocks existing_block
      WHERE existing_block.organization_id = target_organization_id
        AND existing_block.status NOT IN ('cancelled', 'completed')
        AND (
          (
            existing_block.template_id = target_template_id
            AND existing_block.template_block_id = candidate.template_block_id
            AND existing_block.service_date = candidate.date
          )
          OR (
            existing_block.center_id = candidate.center_id
            AND existing_block.class_type_id = candidate.class_type_id
            AND existing_block.service_date = candidate.date
            AND existing_block.start_time = candidate.starts_at
            AND existing_block.end_time = candidate.ends_at
          )
        )
    )
  ),
  blocks_to_create AS (
    SELECT candidate.*
    FROM candidates candidate
    WHERE candidate.will_create = true
      AND NOT EXISTS (
        SELECT 1
        FROM duplicate_candidates duplicate
        WHERE duplicate.template_block_id = candidate.template_block_id
          AND duplicate.date = candidate.date
      )
  ),
  inserted_blocks AS (
    INSERT INTO public.schedule_blocks (
      organization_id,
      center_id,
      template_id,
      template_block_id,
      service_date,
      start_time,
      end_time,
      class_type_id,
      required_coaches,
      status,
      notes,
      is_template_exception,
      metadata
    )
    SELECT
      target_organization_id,
      candidate.center_id,
      target_template_id,
      candidate.template_block_id,
      candidate.date,
      candidate.starts_at,
      candidate.ends_at,
      candidate.class_type_id,
      candidate.required_coaches,
      'scheduled',
      NULL,
      false,
      jsonb_build_object(
        'source', 'chatgpt_connector',
        'tool', 'apply_schedule_template',
        'plan_hash', target_plan_hash,
        'idem_hash', target_idempotency_key_hash,
        'confirmation_id', target_confirmation_id::text,
        'request_id', target_request_id
      )
    FROM blocks_to_create candidate
    RETURNING id, template_block_id, service_date
  ),
  inserted_assignments AS (
    INSERT INTO public.schedule_block_assignments (
      organization_id,
      schedule_block_id,
      coach_profile_id,
      assignment_status,
      source,
      notes
    )
    SELECT
      target_organization_id,
      inserted_block.id,
      candidate.default_coach_id,
      'assigned',
      'template',
      NULL
    FROM inserted_blocks inserted_block
    INNER JOIN blocks_to_create candidate
      ON candidate.template_block_id = inserted_block.template_block_id
     AND candidate.date = inserted_block.service_date
    WHERE candidate.required_coaches > 0
      AND candidate.default_coach_id IS NOT NULL
    RETURNING id
  )
  SELECT
    (SELECT count(*) FROM inserted_blocks),
    (SELECT count(*) FROM inserted_assignments)
  INTO inserted_block_count, inserted_assignment_count;

  IF inserted_block_count <> to_insert_count THEN
    RAISE EXCEPTION 'chatgpt connector application inserted unexpected block count';
  END IF;

  SELECT *
  INTO audit_event
  FROM public.record_operational_audit_event(
    target_organization_id,
    'schedule_templates',
    target_template_id,
    'applied_to_week',
    'success',
    jsonb_build_object(
      'source', 'chatgpt_connector',
      'tool', 'apply_schedule_template',
      'plan_hash', target_plan_hash,
      'idem_hash', target_idempotency_key_hash,
      'request_id', target_request_id,
      'center_id', target_center_id::text,
      'date_from', target_date_from::text,
      'date_to', target_date_to::text,
      'total_candidate_count', total_candidate_count,
      'created_block_count', inserted_block_count,
      'created_assignment_count', inserted_assignment_count,
      'skipped_duplicate_count', v_skipped_duplicate_count
    )
  );

  IF audit_event.id IS NULL THEN
    RAISE EXCEPTION 'chatgpt connector application audit failed';
  END IF;

  UPDATE public.chatgpt_connector_confirmations
  SET
    status = 'applied',
    apply_request_id = target_request_id,
    applied_at = now(),
    audit_event_id = audit_event.id,
    created_block_count = inserted_block_count,
    created_assignment_count = inserted_assignment_count,
    skipped_duplicate_count = v_skipped_duplicate_count
  WHERE id = target_confirmation.id
    AND organization_id = target_organization_id;

  RETURN jsonb_build_object(
    'ok', true,
    'applied', true,
    'idempotent_replay', false,
    'created_blocks', inserted_block_count,
    'created_assignments', inserted_assignment_count,
    'skipped_duplicates', v_skipped_duplicate_count,
    'audit_event_id', audit_event.id
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_chatgpt_schedule_template_application(
  uuid,
  text,
  uuid,
  uuid,
  uuid,
  date,
  date,
  text,
  text,
  text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.apply_chatgpt_schedule_template_application(
  uuid,
  text,
  uuid,
  uuid,
  uuid,
  date,
  date,
  text,
  text,
  text
) TO authenticated;
