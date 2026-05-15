-- BoxOps - Fase F.2 manual time tracking foundation
-- Creates the first tenant-scoped, auditable schema for manual clock-in/out.
-- It does not create UI, geolocation, payroll, automatic overtime, Storage
-- files or legal-compliance guarantees.

ALTER TABLE public.schedule_block_assignments
  ADD CONSTRAINT schedule_block_assignments_id_organization_id_unique
  UNIQUE (id, organization_id);

-- ============================================================
-- Shared time tracking helpers
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_active_membership_id(
  target_organization_id uuid
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT membership.id
  FROM public.organization_memberships membership
  WHERE membership.organization_id = target_organization_id
    AND membership.user_id = (select auth.uid())
    AND membership.status = 'active'
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.can_manage_time_tracking(
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

CREATE OR REPLACE FUNCTION public.time_audit_event_metadata_is_safe(
  target_metadata jsonb
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    target_metadata IS NOT NULL
    AND jsonb_typeof(target_metadata) = 'object'
    AND length(target_metadata::text) <= 4000
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_object_keys(target_metadata) AS key_name
      WHERE lower(key_name) ~
        '(content|body|html|raw|base64|url|uri|path|token|secret|signature|storage|document_hash|latitude|longitude|coordinate|geolocation|gps)'
    );
$$;

CREATE OR REPLACE FUNCTION public.time_schedule_context_is_valid(
  target_organization_id uuid,
  target_person_profile_id uuid,
  target_center_id uuid DEFAULT NULL,
  target_schedule_block_id uuid DEFAULT NULL,
  target_schedule_block_assignment_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  linked_person_user_id uuid;
  linked_block_id uuid;
  linked_block_center_id uuid;
  linked_coach_person_profile_id uuid;
  linked_coach_user_id uuid;
BEGIN
  IF target_organization_id IS NULL OR target_person_profile_id IS NULL THEN
    RETURN false;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.person_profiles person_profile
    WHERE person_profile.id = target_person_profile_id
      AND person_profile.organization_id = target_organization_id
  ) THEN
    RETURN false;
  END IF;

  IF target_center_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.centers center_record
    WHERE center_record.id = target_center_id
      AND center_record.organization_id = target_organization_id
  ) THEN
    RETURN false;
  END IF;

  IF target_schedule_block_id IS NOT NULL THEN
    SELECT schedule_block.center_id
    INTO linked_block_center_id
    FROM public.schedule_blocks schedule_block
    WHERE schedule_block.id = target_schedule_block_id
      AND schedule_block.organization_id = target_organization_id;

    IF linked_block_center_id IS NULL THEN
      RETURN false;
    END IF;

    IF target_center_id IS NOT NULL AND linked_block_center_id <> target_center_id THEN
      RETURN false;
    END IF;
  END IF;

  IF target_schedule_block_assignment_id IS NOT NULL THEN
    SELECT
      assignment.schedule_block_id,
      schedule_block.center_id,
      coach_profile.person_profile_id,
      coach_profile.user_id,
      person_profile.user_id
    INTO
      linked_block_id,
      linked_block_center_id,
      linked_coach_person_profile_id,
      linked_coach_user_id,
      linked_person_user_id
    FROM public.schedule_block_assignments assignment
    INNER JOIN public.schedule_blocks schedule_block
      ON schedule_block.id = assignment.schedule_block_id
      AND schedule_block.organization_id = assignment.organization_id
    INNER JOIN public.coach_profiles coach_profile
      ON coach_profile.id = assignment.coach_profile_id
      AND coach_profile.organization_id = assignment.organization_id
    INNER JOIN public.person_profiles person_profile
      ON person_profile.id = target_person_profile_id
      AND person_profile.organization_id = assignment.organization_id
    WHERE assignment.id = target_schedule_block_assignment_id
      AND assignment.organization_id = target_organization_id;

    IF linked_block_id IS NULL THEN
      RETURN false;
    END IF;

    IF target_schedule_block_id IS NOT NULL AND linked_block_id <> target_schedule_block_id THEN
      RETURN false;
    END IF;

    IF target_center_id IS NOT NULL AND linked_block_center_id <> target_center_id THEN
      RETURN false;
    END IF;

    IF linked_coach_person_profile_id IS DISTINCT FROM target_person_profile_id
      AND (
        linked_person_user_id IS NULL
        OR linked_coach_user_id IS NULL
        OR linked_person_user_id <> linked_coach_user_id
      ) THEN
      RETURN false;
    END IF;
  END IF;

  RETURN true;
END;
$$;

-- ============================================================
-- Time records
-- ============================================================

CREATE TABLE public.time_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  person_profile_id uuid NOT NULL,
  local_work_date date NOT NULL,
  timezone text NOT NULL DEFAULT 'Europe/Madrid',
  center_id uuid,
  schedule_block_id uuid,
  schedule_block_assignment_id uuid,
  planned_start_at timestamptz,
  planned_end_at timestamptz,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'submitted', 'approved', 'reopened', 'voided')),
  created_by_user_id uuid NOT NULL,
  created_by_membership_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id),
  UNIQUE (organization_id, person_profile_id, local_work_date),
  FOREIGN KEY (person_profile_id, organization_id)
    REFERENCES public.person_profiles(id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (center_id, organization_id)
    REFERENCES public.centers(id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (schedule_block_id, organization_id)
    REFERENCES public.schedule_blocks(id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (schedule_block_assignment_id, organization_id)
    REFERENCES public.schedule_block_assignments(id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, created_by_user_id)
    REFERENCES public.organization_memberships(organization_id, user_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (created_by_membership_id, organization_id)
    REFERENCES public.organization_memberships(id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT time_records_timezone_not_blank
    CHECK (length(btrim(timezone)) > 0),
  CONSTRAINT time_records_planned_range
    CHECK (
      planned_start_at IS NULL
      OR planned_end_at IS NULL
      OR planned_start_at < planned_end_at
    ),
  CONSTRAINT time_records_metadata_object
    CHECK (jsonb_typeof(metadata) = 'object')
);

-- ============================================================
-- Time punches
-- ============================================================

CREATE TABLE public.time_punches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  time_record_id uuid NOT NULL,
  person_profile_id uuid NOT NULL,
  punch_type text NOT NULL
    CHECK (punch_type IN ('clock_in', 'clock_out')),
  occurred_at timestamptz NOT NULL,
  timezone text NOT NULL DEFAULT 'Europe/Madrid',
  center_id uuid,
  schedule_block_id uuid,
  schedule_block_assignment_id uuid,
  source text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'correction')),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'superseded', 'voided')),
  created_by_user_id uuid NOT NULL,
  created_by_membership_id uuid,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id),
  UNIQUE (id, time_record_id, organization_id),
  FOREIGN KEY (time_record_id, organization_id)
    REFERENCES public.time_records(id, organization_id)
    ON DELETE CASCADE,
  FOREIGN KEY (person_profile_id, organization_id)
    REFERENCES public.person_profiles(id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (center_id, organization_id)
    REFERENCES public.centers(id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (schedule_block_id, organization_id)
    REFERENCES public.schedule_blocks(id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (schedule_block_assignment_id, organization_id)
    REFERENCES public.schedule_block_assignments(id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, created_by_user_id)
    REFERENCES public.organization_memberships(organization_id, user_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (created_by_membership_id, organization_id)
    REFERENCES public.organization_memberships(id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT time_punches_timezone_not_blank
    CHECK (length(btrim(timezone)) > 0),
  CONSTRAINT time_punches_notes_not_blank
    CHECK (notes IS NULL OR length(btrim(notes)) > 0),
  CONSTRAINT time_punches_metadata_object
    CHECK (jsonb_typeof(metadata) = 'object')
);

-- ============================================================
-- Time record corrections
-- ============================================================

CREATE TABLE public.time_record_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  time_record_id uuid NOT NULL,
  time_punch_id uuid,
  person_profile_id uuid NOT NULL,
  correction_type text NOT NULL DEFAULT 'record_update'
    CHECK (correction_type IN (
      'record_update',
      'punch_add',
      'punch_update',
      'punch_void'
    )),
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'applied')),
  before_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  after_snapshot jsonb NOT NULL,
  requested_by_user_id uuid NOT NULL,
  requested_by_membership_id uuid,
  requested_by_person_profile_id uuid,
  reviewed_by_user_id uuid,
  reviewed_by_membership_id uuid,
  reviewed_by_person_profile_id uuid,
  reviewed_at timestamptz,
  review_note text,
  applied_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id),
  FOREIGN KEY (time_record_id, organization_id)
    REFERENCES public.time_records(id, organization_id)
    ON DELETE CASCADE,
  FOREIGN KEY (time_punch_id, time_record_id, organization_id)
    REFERENCES public.time_punches(id, time_record_id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (person_profile_id, organization_id)
    REFERENCES public.person_profiles(id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, requested_by_user_id)
    REFERENCES public.organization_memberships(organization_id, user_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (requested_by_membership_id, organization_id)
    REFERENCES public.organization_memberships(id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (requested_by_person_profile_id, organization_id)
    REFERENCES public.person_profiles(id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, reviewed_by_user_id)
    REFERENCES public.organization_memberships(organization_id, user_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (reviewed_by_membership_id, organization_id)
    REFERENCES public.organization_memberships(id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (reviewed_by_person_profile_id, organization_id)
    REFERENCES public.person_profiles(id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT time_record_corrections_reason_not_blank
    CHECK (length(btrim(reason)) > 0 AND length(reason) <= 2000),
  CONSTRAINT time_record_corrections_review_note_not_blank
    CHECK (review_note IS NULL OR length(btrim(review_note)) > 0),
  CONSTRAINT time_record_corrections_snapshots_are_objects
    CHECK (
      jsonb_typeof(before_snapshot) = 'object'
      AND jsonb_typeof(after_snapshot) = 'object'
    ),
  CONSTRAINT time_record_corrections_metadata_object
    CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT time_record_corrections_review_state
    CHECK (
      (
        status IN ('pending', 'cancelled')
        AND reviewed_by_user_id IS NULL
        AND reviewed_at IS NULL
      )
      OR (
        status IN ('approved', 'rejected', 'applied')
        AND reviewed_by_user_id IS NOT NULL
        AND reviewed_at IS NOT NULL
      )
    ),
  CONSTRAINT time_record_corrections_applied_state
    CHECK (
      (status = 'applied' AND applied_at IS NOT NULL)
      OR (status <> 'applied' AND applied_at IS NULL)
    )
);

-- ============================================================
-- Weekly approvals
-- ============================================================

CREATE TABLE public.time_weekly_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  person_profile_id uuid NOT NULL,
  week_start_date date NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'reopened', 'voided')),
  approved_by_user_id uuid,
  approved_by_membership_id uuid,
  approved_at timestamptz,
  reopened_by_user_id uuid,
  reopened_by_membership_id uuid,
  reopened_at timestamptz,
  reopen_reason text,
  created_by_user_id uuid NOT NULL,
  created_by_membership_id uuid,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id),
  UNIQUE (organization_id, person_profile_id, week_start_date),
  FOREIGN KEY (person_profile_id, organization_id)
    REFERENCES public.person_profiles(id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, approved_by_user_id)
    REFERENCES public.organization_memberships(organization_id, user_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (approved_by_membership_id, organization_id)
    REFERENCES public.organization_memberships(id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, reopened_by_user_id)
    REFERENCES public.organization_memberships(organization_id, user_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (reopened_by_membership_id, organization_id)
    REFERENCES public.organization_memberships(id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, created_by_user_id)
    REFERENCES public.organization_memberships(organization_id, user_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (created_by_membership_id, organization_id)
    REFERENCES public.organization_memberships(id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT time_weekly_approvals_week_starts_monday
    CHECK (extract(isodow from week_start_date) = 1),
  CONSTRAINT time_weekly_approvals_reopen_reason_not_blank
    CHECK (reopen_reason IS NULL OR length(btrim(reopen_reason)) > 0),
  CONSTRAINT time_weekly_approvals_notes_not_blank
    CHECK (notes IS NULL OR length(btrim(notes)) > 0),
  CONSTRAINT time_weekly_approvals_snapshot_object
    CHECK (jsonb_typeof(snapshot) = 'object'),
  CONSTRAINT time_weekly_approvals_metadata_object
    CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT time_weekly_approvals_approval_state
    CHECK (
      status <> 'approved'
      OR (
        approved_by_user_id IS NOT NULL
        AND approved_at IS NOT NULL
      )
    ),
  CONSTRAINT time_weekly_approvals_reopened_state
    CHECK (
      status <> 'reopened'
      OR (
        reopened_by_user_id IS NOT NULL
        AND reopened_at IS NOT NULL
        AND reopen_reason IS NOT NULL
      )
    )
);

-- ============================================================
-- Export batches (metadata only in F.2)
-- ============================================================

CREATE TABLE public.time_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  requested_by_user_id uuid NOT NULL,
  requested_by_membership_id uuid,
  date_from date NOT NULL,
  date_to date NOT NULL,
  person_profile_id uuid,
  center_id uuid,
  export_format text NOT NULL DEFAULT 'csv'
    CHECK (export_format IN ('csv', 'json')),
  export_scope text NOT NULL DEFAULT 'time_records'
    CHECK (export_scope IN ('time_records', 'weekly_approvals')),
  status text NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'generated', 'failed', 'cancelled')),
  row_count integer CHECK (row_count IS NULL OR row_count >= 0),
  generated_at timestamptz,
  failure_reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id),
  FOREIGN KEY (organization_id, requested_by_user_id)
    REFERENCES public.organization_memberships(organization_id, user_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (requested_by_membership_id, organization_id)
    REFERENCES public.organization_memberships(id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (person_profile_id, organization_id)
    REFERENCES public.person_profiles(id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (center_id, organization_id)
    REFERENCES public.centers(id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT time_exports_date_range
    CHECK (date_to >= date_from),
  CONSTRAINT time_exports_failure_reason_not_blank
    CHECK (failure_reason IS NULL OR length(btrim(failure_reason)) > 0),
  CONSTRAINT time_exports_generated_state
    CHECK (
      (status = 'generated' AND generated_at IS NOT NULL)
      OR (status <> 'generated')
    ),
  CONSTRAINT time_exports_metadata_object
    CHECK (jsonb_typeof(metadata) = 'object')
);

-- ============================================================
-- Time audit events
-- ============================================================

CREATE TABLE public.time_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_type text NOT NULL
    CHECK (event_type IN (
      'time_record_created',
      'time_punch_created',
      'time_correction_requested',
      'time_correction_updated',
      'time_weekly_approval_created',
      'time_weekly_approval_updated',
      'time_export_requested',
      'time_export_updated',
      'time_access_denied'
    )),
  result text NOT NULL DEFAULT 'allowed'
    CHECK (result IN ('allowed', 'denied')),
  actor_user_id uuid,
  actor_membership_id uuid,
  actor_person_profile_id uuid,
  target_person_profile_id uuid,
  time_record_id uuid,
  time_punch_id uuid,
  time_record_correction_id uuid,
  time_weekly_approval_id uuid,
  time_export_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id, actor_user_id)
    REFERENCES public.organization_memberships(organization_id, user_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (actor_membership_id, organization_id)
    REFERENCES public.organization_memberships(id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (actor_person_profile_id, organization_id)
    REFERENCES public.person_profiles(id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (target_person_profile_id, organization_id)
    REFERENCES public.person_profiles(id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (time_record_id, organization_id)
    REFERENCES public.time_records(id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (time_punch_id, organization_id)
    REFERENCES public.time_punches(id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (time_record_correction_id, organization_id)
    REFERENCES public.time_record_corrections(id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (time_weekly_approval_id, organization_id)
    REFERENCES public.time_weekly_approvals(id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (time_export_id, organization_id)
    REFERENCES public.time_exports(id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT time_audit_events_metadata_safe
    CHECK (public.time_audit_event_metadata_is_safe(metadata))
);

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX time_records_person_date_idx
  ON public.time_records (organization_id, person_profile_id, local_work_date DESC);

CREATE INDEX time_records_status_date_idx
  ON public.time_records (organization_id, status, local_work_date DESC);

CREATE INDEX time_records_schedule_block_idx
  ON public.time_records (organization_id, schedule_block_id)
  WHERE schedule_block_id IS NOT NULL;

CREATE INDEX time_punches_record_time_idx
  ON public.time_punches (organization_id, time_record_id, occurred_at);

CREATE INDEX time_punches_person_time_idx
  ON public.time_punches (organization_id, person_profile_id, occurred_at DESC);

CREATE INDEX time_record_corrections_record_status_idx
  ON public.time_record_corrections (organization_id, time_record_id, status, created_at DESC);

CREATE INDEX time_record_corrections_person_status_idx
  ON public.time_record_corrections (organization_id, person_profile_id, status, created_at DESC);

CREATE INDEX time_weekly_approvals_person_week_idx
  ON public.time_weekly_approvals (organization_id, person_profile_id, week_start_date DESC);

CREATE INDEX time_exports_range_idx
  ON public.time_exports (organization_id, date_from, date_to, status);

CREATE INDEX time_audit_events_person_idx
  ON public.time_audit_events (organization_id, target_person_profile_id, created_at DESC)
  WHERE target_person_profile_id IS NOT NULL;

CREATE INDEX time_audit_events_type_idx
  ON public.time_audit_events (organization_id, event_type, result, created_at DESC);

-- ============================================================
-- Validation triggers
-- ============================================================

CREATE OR REPLACE FUNCTION public.validate_time_record_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := (select auth.uid());
  current_membership_id uuid;
  linked_block_date date;
  linked_assignment_block_id uuid;
BEGIN
  IF current_user_id IS NOT NULL THEN
    current_membership_id := public.get_active_membership_id(NEW.organization_id);

    IF current_membership_id IS NULL THEN
      RAISE EXCEPTION 'active membership is required for time records';
    END IF;

    IF TG_OP = 'INSERT' THEN
      NEW.created_by_user_id := COALESCE(NEW.created_by_user_id, current_user_id);
      NEW.created_by_membership_id := COALESCE(NEW.created_by_membership_id, current_membership_id);

      IF NEW.created_by_user_id <> current_user_id THEN
        RAISE EXCEPTION 'time record creator must be the authenticated user';
      END IF;

      IF NEW.status <> 'open' THEN
        RAISE EXCEPTION 'manual time records must start open';
      END IF;
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.id <> OLD.id
      OR NEW.organization_id <> OLD.organization_id
      OR NEW.person_profile_id <> OLD.person_profile_id
      OR NEW.local_work_date <> OLD.local_work_date
      OR NEW.timezone <> OLD.timezone
      OR NEW.center_id IS DISTINCT FROM OLD.center_id
      OR NEW.schedule_block_id IS DISTINCT FROM OLD.schedule_block_id
      OR NEW.schedule_block_assignment_id IS DISTINCT FROM OLD.schedule_block_assignment_id
      OR NEW.planned_start_at IS DISTINCT FROM OLD.planned_start_at
      OR NEW.planned_end_at IS DISTINCT FROM OLD.planned_end_at
      OR NEW.created_by_user_id <> OLD.created_by_user_id
      OR NEW.created_by_membership_id IS DISTINCT FROM OLD.created_by_membership_id
      OR NEW.created_at <> OLD.created_at THEN
      RAISE EXCEPTION 'time record immutable fields cannot be changed';
    END IF;
  END IF;

  IF NOT public.time_schedule_context_is_valid(
    NEW.organization_id,
    NEW.person_profile_id,
    NEW.center_id,
    NEW.schedule_block_id,
    NEW.schedule_block_assignment_id
  ) THEN
    RAISE EXCEPTION 'time record schedule context is not valid for this tenant/person';
  END IF;

  IF NEW.schedule_block_assignment_id IS NOT NULL THEN
    SELECT assignment.schedule_block_id
    INTO linked_assignment_block_id
    FROM public.schedule_block_assignments assignment
    WHERE assignment.id = NEW.schedule_block_assignment_id
      AND assignment.organization_id = NEW.organization_id;
  END IF;

  SELECT schedule_block.service_date
  INTO linked_block_date
  FROM public.schedule_blocks schedule_block
  WHERE schedule_block.id = COALESCE(NEW.schedule_block_id, linked_assignment_block_id)
    AND schedule_block.organization_id = NEW.organization_id;

  IF linked_block_date IS NOT NULL AND linked_block_date <> NEW.local_work_date THEN
    RAISE EXCEPTION 'time record work date must match linked schedule block date';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_time_punch_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := (select auth.uid());
  current_membership_id uuid;
  target_record public.time_records;
BEGIN
  IF current_user_id IS NOT NULL THEN
    current_membership_id := public.get_active_membership_id(NEW.organization_id);

    IF current_membership_id IS NULL THEN
      RAISE EXCEPTION 'active membership is required for time punches';
    END IF;

    IF TG_OP = 'INSERT' THEN
      NEW.created_by_user_id := COALESCE(NEW.created_by_user_id, current_user_id);
      NEW.created_by_membership_id := COALESCE(NEW.created_by_membership_id, current_membership_id);

      IF NEW.created_by_user_id <> current_user_id THEN
        RAISE EXCEPTION 'time punch creator must be the authenticated user';
      END IF;

      IF NEW.source <> 'manual' OR NEW.status <> 'active' THEN
        RAISE EXCEPTION 'manual time punches must be active and manual';
      END IF;
    END IF;
  END IF;

  SELECT time_record.*
  INTO target_record
  FROM public.time_records time_record
  WHERE time_record.id = NEW.time_record_id
    AND time_record.organization_id = NEW.organization_id;

  IF target_record.id IS NULL THEN
    RAISE EXCEPTION 'time punch record was not found';
  END IF;

  IF target_record.person_profile_id <> NEW.person_profile_id THEN
    RAISE EXCEPTION 'time punch person must match its record';
  END IF;

  IF target_record.status NOT IN ('open', 'reopened') THEN
    RAISE EXCEPTION 'time punch record is not open for manual punches';
  END IF;

  IF target_record.center_id IS NOT NULL
    AND NEW.center_id IS NOT NULL
    AND target_record.center_id <> NEW.center_id THEN
    RAISE EXCEPTION 'time punch center must match its record when both are set';
  END IF;

  IF target_record.schedule_block_id IS NOT NULL
    AND NEW.schedule_block_id IS NOT NULL
    AND target_record.schedule_block_id <> NEW.schedule_block_id THEN
    RAISE EXCEPTION 'time punch schedule block must match its record when both are set';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.id <> OLD.id
      OR NEW.organization_id <> OLD.organization_id
      OR NEW.time_record_id <> OLD.time_record_id
      OR NEW.person_profile_id <> OLD.person_profile_id
      OR NEW.punch_type <> OLD.punch_type
      OR NEW.occurred_at <> OLD.occurred_at
      OR NEW.timezone <> OLD.timezone
      OR NEW.center_id IS DISTINCT FROM OLD.center_id
      OR NEW.schedule_block_id IS DISTINCT FROM OLD.schedule_block_id
      OR NEW.schedule_block_assignment_id IS DISTINCT FROM OLD.schedule_block_assignment_id
      OR NEW.source <> OLD.source
      OR NEW.created_by_user_id <> OLD.created_by_user_id
      OR NEW.created_by_membership_id IS DISTINCT FROM OLD.created_by_membership_id
      OR NEW.created_at <> OLD.created_at THEN
      RAISE EXCEPTION 'time punch immutable fields cannot be changed';
    END IF;
  END IF;

  IF NOT public.time_schedule_context_is_valid(
    NEW.organization_id,
    NEW.person_profile_id,
    NEW.center_id,
    NEW.schedule_block_id,
    NEW.schedule_block_assignment_id
  ) THEN
    RAISE EXCEPTION 'time punch schedule context is not valid for this tenant/person';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_time_record_correction_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := (select auth.uid());
  current_membership_id uuid;
  current_person_profile_id uuid;
  target_record public.time_records;
BEGIN
  IF current_user_id IS NOT NULL THEN
    current_membership_id := public.get_active_membership_id(NEW.organization_id);
    current_person_profile_id := public.get_own_person_profile_id(NEW.organization_id);

    IF current_membership_id IS NULL THEN
      RAISE EXCEPTION 'active membership is required for time corrections';
    END IF;
  END IF;

  SELECT time_record.*
  INTO target_record
  FROM public.time_records time_record
  WHERE time_record.id = NEW.time_record_id
    AND time_record.organization_id = NEW.organization_id;

  IF target_record.id IS NULL THEN
    RAISE EXCEPTION 'time correction record was not found';
  END IF;

  IF target_record.person_profile_id <> NEW.person_profile_id THEN
    RAISE EXCEPTION 'time correction person must match its record';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF current_user_id IS NOT NULL THEN
      NEW.requested_by_user_id := COALESCE(NEW.requested_by_user_id, current_user_id);
      NEW.requested_by_membership_id := COALESCE(NEW.requested_by_membership_id, current_membership_id);
      NEW.requested_by_person_profile_id := COALESCE(
        NEW.requested_by_person_profile_id,
        current_person_profile_id
      );

      IF NEW.requested_by_user_id <> current_user_id THEN
        RAISE EXCEPTION 'time correction requester must be the authenticated user';
      END IF;

      IF NEW.status <> 'pending' THEN
        RAISE EXCEPTION 'time corrections must start pending';
      END IF;
    END IF;
  ELSE
    IF NEW.id <> OLD.id
      OR NEW.organization_id <> OLD.organization_id
      OR NEW.time_record_id <> OLD.time_record_id
      OR NEW.time_punch_id IS DISTINCT FROM OLD.time_punch_id
      OR NEW.person_profile_id <> OLD.person_profile_id
      OR NEW.correction_type <> OLD.correction_type
      OR NEW.reason <> OLD.reason
      OR NEW.before_snapshot <> OLD.before_snapshot
      OR NEW.after_snapshot <> OLD.after_snapshot
      OR NEW.requested_by_user_id <> OLD.requested_by_user_id
      OR NEW.requested_by_membership_id IS DISTINCT FROM OLD.requested_by_membership_id
      OR NEW.requested_by_person_profile_id IS DISTINCT FROM OLD.requested_by_person_profile_id
      OR NEW.created_at <> OLD.created_at THEN
      RAISE EXCEPTION 'time correction immutable fields cannot be changed';
    END IF;

    IF NEW.status IN ('approved', 'rejected', 'applied') THEN
      IF current_user_id IS NOT NULL THEN
        IF NOT public.can_manage_time_tracking(NEW.organization_id) THEN
          RAISE EXCEPTION 'time correction review permission required';
        END IF;

        NEW.reviewed_by_user_id := COALESCE(NEW.reviewed_by_user_id, current_user_id);
        NEW.reviewed_by_membership_id := COALESCE(NEW.reviewed_by_membership_id, current_membership_id);
        NEW.reviewed_by_person_profile_id := COALESCE(
          NEW.reviewed_by_person_profile_id,
          current_person_profile_id
        );
        NEW.reviewed_at := COALESCE(NEW.reviewed_at, now());

        IF NEW.reviewed_by_user_id <> current_user_id THEN
          RAISE EXCEPTION 'time correction reviewer must be the authenticated user';
        END IF;
      END IF;

      IF NEW.reviewed_by_user_id IS NULL OR NEW.reviewed_at IS NULL THEN
        RAISE EXCEPTION 'reviewed corrections require reviewer and timestamp';
      END IF;
    END IF;
  END IF;

  IF NEW.status = 'applied' AND NEW.applied_at IS NULL THEN
    NEW.applied_at := now();
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_time_weekly_approval_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := (select auth.uid());
  current_membership_id uuid;
BEGIN
  IF current_user_id IS NOT NULL THEN
    IF NOT public.can_manage_time_tracking(NEW.organization_id) THEN
      RAISE EXCEPTION 'time weekly approval permission required';
    END IF;

    current_membership_id := public.get_active_membership_id(NEW.organization_id);

    IF current_membership_id IS NULL THEN
      RAISE EXCEPTION 'active membership is required for time weekly approvals';
    END IF;

    IF TG_OP = 'INSERT' THEN
      NEW.created_by_user_id := COALESCE(NEW.created_by_user_id, current_user_id);
      NEW.created_by_membership_id := COALESCE(NEW.created_by_membership_id, current_membership_id);

      IF NEW.created_by_user_id <> current_user_id THEN
        RAISE EXCEPTION 'time weekly approval creator must be the authenticated user';
      END IF;
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.id <> OLD.id
      OR NEW.organization_id <> OLD.organization_id
      OR NEW.person_profile_id <> OLD.person_profile_id
      OR NEW.week_start_date <> OLD.week_start_date
      OR NEW.created_by_user_id <> OLD.created_by_user_id
      OR NEW.created_by_membership_id IS DISTINCT FROM OLD.created_by_membership_id
      OR NEW.created_at <> OLD.created_at THEN
      RAISE EXCEPTION 'time weekly approval immutable fields cannot be changed';
    END IF;
  END IF;

  IF current_user_id IS NOT NULL AND NEW.status = 'approved' THEN
    NEW.approved_by_user_id := COALESCE(NEW.approved_by_user_id, current_user_id);
    NEW.approved_by_membership_id := COALESCE(NEW.approved_by_membership_id, current_membership_id);
    NEW.approved_at := COALESCE(NEW.approved_at, now());

    IF NEW.approved_by_user_id <> current_user_id THEN
      RAISE EXCEPTION 'time weekly approval approver must be the authenticated user';
    END IF;
  END IF;

  IF current_user_id IS NOT NULL AND NEW.status = 'reopened' THEN
    NEW.reopened_by_user_id := COALESCE(NEW.reopened_by_user_id, current_user_id);
    NEW.reopened_by_membership_id := COALESCE(NEW.reopened_by_membership_id, current_membership_id);
    NEW.reopened_at := COALESCE(NEW.reopened_at, now());

    IF NEW.reopened_by_user_id <> current_user_id THEN
      RAISE EXCEPTION 'time weekly approval reopener must be the authenticated user';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_time_export_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := (select auth.uid());
  current_membership_id uuid;
BEGIN
  IF current_user_id IS NOT NULL THEN
    IF NOT public.can_manage_time_tracking(NEW.organization_id) THEN
      RAISE EXCEPTION 'time export permission required';
    END IF;

    current_membership_id := public.get_active_membership_id(NEW.organization_id);

    IF current_membership_id IS NULL THEN
      RAISE EXCEPTION 'active membership is required for time exports';
    END IF;

    IF TG_OP = 'INSERT' THEN
      NEW.requested_by_user_id := COALESCE(NEW.requested_by_user_id, current_user_id);
      NEW.requested_by_membership_id := COALESCE(NEW.requested_by_membership_id, current_membership_id);

      IF NEW.requested_by_user_id <> current_user_id THEN
        RAISE EXCEPTION 'time export requester must be the authenticated user';
      END IF;
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.id <> OLD.id
      OR NEW.organization_id <> OLD.organization_id
      OR NEW.requested_by_user_id <> OLD.requested_by_user_id
      OR NEW.requested_by_membership_id IS DISTINCT FROM OLD.requested_by_membership_id
      OR NEW.date_from <> OLD.date_from
      OR NEW.date_to <> OLD.date_to
      OR NEW.person_profile_id IS DISTINCT FROM OLD.person_profile_id
      OR NEW.center_id IS DISTINCT FROM OLD.center_id
      OR NEW.export_format <> OLD.export_format
      OR NEW.export_scope <> OLD.export_scope
      OR NEW.created_at <> OLD.created_at THEN
      RAISE EXCEPTION 'time export immutable fields cannot be changed';
    END IF;
  END IF;

  IF NEW.status = 'generated' AND NEW.generated_at IS NULL THEN
    NEW.generated_at := now();
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_time_audit_event_from_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_organization_id uuid;
  actor_user_id uuid;
  actor_membership_id uuid;
  actor_person_profile_id uuid;
  target_person_profile_id uuid;
  target_record_id uuid;
  target_punch_id uuid;
  target_correction_id uuid;
  target_weekly_approval_id uuid;
  target_export_id uuid;
  audit_event_type text;
BEGIN
  target_organization_id := COALESCE(NEW.organization_id, OLD.organization_id);
  actor_user_id := (select auth.uid());
  actor_membership_id := public.get_active_membership_id(target_organization_id);
  actor_person_profile_id := public.get_own_person_profile_id(target_organization_id);

  IF TG_TABLE_NAME = 'time_records' THEN
    audit_event_type := 'time_record_created';
    target_person_profile_id := NEW.person_profile_id;
    target_record_id := NEW.id;
  ELSIF TG_TABLE_NAME = 'time_punches' THEN
    audit_event_type := 'time_punch_created';
    target_person_profile_id := NEW.person_profile_id;
    target_record_id := NEW.time_record_id;
    target_punch_id := NEW.id;
  ELSIF TG_TABLE_NAME = 'time_record_corrections' THEN
    IF TG_OP = 'INSERT' THEN
      audit_event_type := 'time_correction_requested';
    ELSE
      audit_event_type := 'time_correction_updated';
    END IF;

    target_person_profile_id := NEW.person_profile_id;
    target_record_id := NEW.time_record_id;
    target_punch_id := NEW.time_punch_id;
    target_correction_id := NEW.id;
  ELSIF TG_TABLE_NAME = 'time_weekly_approvals' THEN
    IF TG_OP = 'INSERT' THEN
      audit_event_type := 'time_weekly_approval_created';
    ELSE
      audit_event_type := 'time_weekly_approval_updated';
    END IF;

    target_person_profile_id := NEW.person_profile_id;
    target_weekly_approval_id := NEW.id;
  ELSIF TG_TABLE_NAME = 'time_exports' THEN
    IF TG_OP = 'INSERT' THEN
      audit_event_type := 'time_export_requested';
    ELSE
      audit_event_type := 'time_export_updated';
    END IF;

    target_person_profile_id := NEW.person_profile_id;
    target_export_id := NEW.id;
  ELSE
    RAISE EXCEPTION 'unsupported time audit trigger table';
  END IF;

  INSERT INTO public.time_audit_events (
    organization_id,
    event_type,
    result,
    actor_user_id,
    actor_membership_id,
    actor_person_profile_id,
    target_person_profile_id,
    time_record_id,
    time_punch_id,
    time_record_correction_id,
    time_weekly_approval_id,
    time_export_id,
    metadata
  )
  VALUES (
    target_organization_id,
    audit_event_type,
    'allowed',
    actor_user_id,
    actor_membership_id,
    actor_person_profile_id,
    target_person_profile_id,
    target_record_id,
    target_punch_id,
    target_correction_id,
    target_weekly_approval_id,
    target_export_id,
    '{}'::jsonb
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_own_time_punch(
  target_organization_id uuid,
  target_punch_type text,
  target_occurred_at timestamptz DEFAULT now(),
  target_local_work_date date DEFAULT NULL,
  target_center_id uuid DEFAULT NULL,
  target_schedule_block_id uuid DEFAULT NULL,
  target_schedule_block_assignment_id uuid DEFAULT NULL,
  punch_notes text DEFAULT NULL,
  punch_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS public.time_punches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := (select auth.uid());
  current_membership_id uuid;
  own_person_profile_id uuid;
  organization_timezone text;
  normalized_work_date date;
  normalized_center_id uuid := target_center_id;
  normalized_schedule_block_id uuid := target_schedule_block_id;
  normalized_schedule_block_assignment_id uuid := target_schedule_block_assignment_id;
  planned_start_at timestamptz;
  planned_end_at timestamptz;
  existing_record public.time_records;
  created_punch public.time_punches;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication is required for time punches';
  END IF;

  current_membership_id := public.get_active_membership_id(target_organization_id);
  own_person_profile_id := public.get_own_person_profile_id(target_organization_id);

  IF current_membership_id IS NULL OR own_person_profile_id IS NULL THEN
    RAISE EXCEPTION 'active membership and linked person are required for time punches';
  END IF;

  IF target_punch_type NOT IN ('clock_in', 'clock_out') THEN
    RAISE EXCEPTION 'time punch type is not allowed';
  END IF;

  IF punch_metadata IS NULL OR jsonb_typeof(punch_metadata) <> 'object' THEN
    RAISE EXCEPTION 'time punch metadata must be an object';
  END IF;

  SELECT organization.timezone
  INTO organization_timezone
  FROM public.organizations organization
  WHERE organization.id = target_organization_id
    AND organization.status IN ('trialing', 'active');

  IF organization_timezone IS NULL THEN
    RAISE EXCEPTION 'organization is not available for time punches';
  END IF;

  IF normalized_schedule_block_assignment_id IS NOT NULL THEN
    SELECT assignment.schedule_block_id
    INTO normalized_schedule_block_id
    FROM public.schedule_block_assignments assignment
    WHERE assignment.id = normalized_schedule_block_assignment_id
      AND assignment.organization_id = target_organization_id;
  END IF;

  IF normalized_schedule_block_id IS NOT NULL THEN
    SELECT
      schedule_block.service_date,
      schedule_block.center_id,
      (schedule_block.service_date + schedule_block.start_time) AT TIME ZONE organization_timezone,
      (schedule_block.service_date + schedule_block.end_time) AT TIME ZONE organization_timezone
    INTO
      normalized_work_date,
      normalized_center_id,
      planned_start_at,
      planned_end_at
    FROM public.schedule_blocks schedule_block
    WHERE schedule_block.id = normalized_schedule_block_id
      AND schedule_block.organization_id = target_organization_id;

    IF normalized_work_date IS NULL THEN
      RAISE EXCEPTION 'linked schedule block was not found';
    END IF;

    IF target_local_work_date IS NOT NULL AND target_local_work_date <> normalized_work_date THEN
      RAISE EXCEPTION 'provided work date does not match linked schedule block';
    END IF;
  ELSE
    normalized_work_date := COALESCE(
      target_local_work_date,
      (target_occurred_at AT TIME ZONE organization_timezone)::date
    );
  END IF;

  IF NOT public.time_schedule_context_is_valid(
    target_organization_id,
    own_person_profile_id,
    normalized_center_id,
    normalized_schedule_block_id,
    normalized_schedule_block_assignment_id
  ) THEN
    RAISE EXCEPTION 'time punch schedule context is not valid for the authenticated person';
  END IF;

  SELECT time_record.*
  INTO existing_record
  FROM public.time_records time_record
  WHERE time_record.organization_id = target_organization_id
    AND time_record.person_profile_id = own_person_profile_id
    AND time_record.local_work_date = normalized_work_date
  FOR UPDATE;

  IF existing_record.id IS NOT NULL AND existing_record.status NOT IN ('open', 'reopened') THEN
    RAISE EXCEPTION 'existing time record is not open for manual punches';
  END IF;

  IF existing_record.id IS NULL THEN
    INSERT INTO public.time_records (
      organization_id,
      person_profile_id,
      local_work_date,
      timezone,
      center_id,
      schedule_block_id,
      schedule_block_assignment_id,
      planned_start_at,
      planned_end_at,
      status,
      created_by_user_id,
      created_by_membership_id
    )
    VALUES (
      target_organization_id,
      own_person_profile_id,
      normalized_work_date,
      organization_timezone,
      normalized_center_id,
      normalized_schedule_block_id,
      normalized_schedule_block_assignment_id,
      planned_start_at,
      planned_end_at,
      'open',
      current_user_id,
      current_membership_id
    )
    RETURNING * INTO existing_record;
  END IF;

  INSERT INTO public.time_punches (
    organization_id,
    time_record_id,
    person_profile_id,
    punch_type,
    occurred_at,
    timezone,
    center_id,
    schedule_block_id,
    schedule_block_assignment_id,
    source,
    status,
    created_by_user_id,
    created_by_membership_id,
    notes,
    metadata
  )
  VALUES (
    target_organization_id,
    existing_record.id,
    own_person_profile_id,
    target_punch_type,
    target_occurred_at,
    organization_timezone,
    COALESCE(normalized_center_id, existing_record.center_id),
    normalized_schedule_block_id,
    normalized_schedule_block_assignment_id,
    'manual',
    'active',
    current_user_id,
    current_membership_id,
    punch_notes,
    punch_metadata
  )
  RETURNING * INTO created_punch;

  RETURN created_punch;
END;
$$;

-- ============================================================
-- Updated_at and audit triggers
-- ============================================================

CREATE TRIGGER time_records_set_updated_at
  BEFORE UPDATE ON public.time_records
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER time_records_validate_row
  BEFORE INSERT OR UPDATE ON public.time_records
  FOR EACH ROW EXECUTE FUNCTION public.validate_time_record_row();

CREATE TRIGGER time_punches_set_updated_at
  BEFORE UPDATE ON public.time_punches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER time_punches_validate_row
  BEFORE INSERT OR UPDATE ON public.time_punches
  FOR EACH ROW EXECUTE FUNCTION public.validate_time_punch_row();

CREATE TRIGGER time_record_corrections_set_updated_at
  BEFORE UPDATE ON public.time_record_corrections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER time_record_corrections_validate_row
  BEFORE INSERT OR UPDATE ON public.time_record_corrections
  FOR EACH ROW EXECUTE FUNCTION public.validate_time_record_correction_row();

CREATE TRIGGER time_weekly_approvals_set_updated_at
  BEFORE UPDATE ON public.time_weekly_approvals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER time_weekly_approvals_validate_row
  BEFORE INSERT OR UPDATE ON public.time_weekly_approvals
  FOR EACH ROW EXECUTE FUNCTION public.validate_time_weekly_approval_row();

CREATE TRIGGER time_exports_set_updated_at
  BEFORE UPDATE ON public.time_exports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER time_exports_validate_row
  BEFORE INSERT OR UPDATE ON public.time_exports
  FOR EACH ROW EXECUTE FUNCTION public.validate_time_export_row();

CREATE TRIGGER time_records_audit_insert
  AFTER INSERT ON public.time_records
  FOR EACH ROW EXECUTE FUNCTION public.record_time_audit_event_from_trigger();

CREATE TRIGGER time_punches_audit_insert
  AFTER INSERT ON public.time_punches
  FOR EACH ROW EXECUTE FUNCTION public.record_time_audit_event_from_trigger();

CREATE TRIGGER time_record_corrections_audit_insert
  AFTER INSERT ON public.time_record_corrections
  FOR EACH ROW EXECUTE FUNCTION public.record_time_audit_event_from_trigger();

CREATE TRIGGER time_record_corrections_audit_update
  AFTER UPDATE OF status ON public.time_record_corrections
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.record_time_audit_event_from_trigger();

CREATE TRIGGER time_weekly_approvals_audit_insert
  AFTER INSERT ON public.time_weekly_approvals
  FOR EACH ROW EXECUTE FUNCTION public.record_time_audit_event_from_trigger();

CREATE TRIGGER time_weekly_approvals_audit_update
  AFTER UPDATE OF status ON public.time_weekly_approvals
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.record_time_audit_event_from_trigger();

CREATE TRIGGER time_exports_audit_insert
  AFTER INSERT ON public.time_exports
  FOR EACH ROW EXECUTE FUNCTION public.record_time_audit_event_from_trigger();

CREATE TRIGGER time_exports_audit_update
  AFTER UPDATE OF status ON public.time_exports
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.record_time_audit_event_from_trigger();

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE public.time_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_punches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_record_corrections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_weekly_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workers and managers can view time records"
  ON public.time_records FOR SELECT TO authenticated
  USING (
    person_profile_id = public.get_own_person_profile_id(organization_id)
    OR public.can_manage_time_tracking(organization_id)
  );

CREATE POLICY "Workers can create own time records"
  ON public.time_records FOR INSERT TO authenticated
  WITH CHECK (
    person_profile_id = public.get_own_person_profile_id(organization_id)
    AND created_by_user_id = (select auth.uid())
    AND status = 'open'
  );

CREATE POLICY "Workers and managers can view time punches"
  ON public.time_punches FOR SELECT TO authenticated
  USING (
    person_profile_id = public.get_own_person_profile_id(organization_id)
    OR public.can_manage_time_tracking(organization_id)
  );

CREATE POLICY "Workers can create own time punches"
  ON public.time_punches FOR INSERT TO authenticated
  WITH CHECK (
    person_profile_id = public.get_own_person_profile_id(organization_id)
    AND created_by_user_id = (select auth.uid())
    AND source = 'manual'
    AND status = 'active'
    AND EXISTS (
      SELECT 1
      FROM public.time_records time_record
      WHERE time_record.id = time_punches.time_record_id
        AND time_record.organization_id = time_punches.organization_id
        AND time_record.person_profile_id = time_punches.person_profile_id
        AND time_record.status IN ('open', 'reopened')
    )
  );

CREATE POLICY "Workers and managers can view time corrections"
  ON public.time_record_corrections FOR SELECT TO authenticated
  USING (
    person_profile_id = public.get_own_person_profile_id(organization_id)
    OR requested_by_person_profile_id = public.get_own_person_profile_id(organization_id)
    OR public.can_manage_time_tracking(organization_id)
  );

CREATE POLICY "Workers and managers can request time corrections"
  ON public.time_record_corrections FOR INSERT TO authenticated
  WITH CHECK (
    status = 'pending'
    AND requested_by_user_id = (select auth.uid())
    AND (
      person_profile_id = public.get_own_person_profile_id(organization_id)
      OR public.can_manage_time_tracking(organization_id)
    )
  );

CREATE POLICY "Managers can review time corrections"
  ON public.time_record_corrections FOR UPDATE TO authenticated
  USING (public.can_manage_time_tracking(organization_id))
  WITH CHECK (public.can_manage_time_tracking(organization_id));

CREATE POLICY "Workers and managers can view weekly approvals"
  ON public.time_weekly_approvals FOR SELECT TO authenticated
  USING (
    person_profile_id = public.get_own_person_profile_id(organization_id)
    OR public.can_manage_time_tracking(organization_id)
  );

CREATE POLICY "Managers can create weekly approvals"
  ON public.time_weekly_approvals FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_time_tracking(organization_id));

CREATE POLICY "Managers can update weekly approvals"
  ON public.time_weekly_approvals FOR UPDATE TO authenticated
  USING (public.can_manage_time_tracking(organization_id))
  WITH CHECK (public.can_manage_time_tracking(organization_id));

CREATE POLICY "Managers can view time exports"
  ON public.time_exports FOR SELECT TO authenticated
  USING (public.can_manage_time_tracking(organization_id));

CREATE POLICY "Managers can create time exports"
  ON public.time_exports FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_time_tracking(organization_id));

CREATE POLICY "Managers can update time exports"
  ON public.time_exports FOR UPDATE TO authenticated
  USING (public.can_manage_time_tracking(organization_id))
  WITH CHECK (public.can_manage_time_tracking(organization_id));

CREATE POLICY "Workers and managers can view time audit events"
  ON public.time_audit_events FOR SELECT TO authenticated
  USING (
    target_person_profile_id = public.get_own_person_profile_id(organization_id)
    OR public.can_manage_time_tracking(organization_id)
  );

-- ============================================================
-- Grants
-- ============================================================

GRANT SELECT, INSERT ON public.time_records TO authenticated;
GRANT SELECT, INSERT ON public.time_punches TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.time_record_corrections TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.time_weekly_approvals TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.time_exports TO authenticated;
GRANT SELECT ON public.time_audit_events TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_active_membership_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_time_tracking(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.time_audit_event_metadata_is_safe(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.time_schedule_context_is_valid(uuid, uuid, uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_own_time_punch(uuid, text, timestamptz, date, uuid, uuid, uuid, text, jsonb) TO authenticated;
