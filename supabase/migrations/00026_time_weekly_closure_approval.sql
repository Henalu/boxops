-- BoxOps - Fase F.12 weekly time closure and signed internal approval
--
-- Models weekly submission, approval with the approver's own reusable
-- profile signature, rejection with mandatory note and a DB-scheduler
-- primitive for Sunday 23:59 closure by organization timezone.
--
-- This is an internal time-tracking close confirmation. It is not document
-- signing, not advanced/qualified electronic signature, not payroll and not
-- geolocation.

-- ============================================================
-- Weekly approval schema extension
-- ============================================================

ALTER TABLE public.time_weekly_approvals
  ALTER COLUMN status SET DEFAULT 'open';

ALTER TABLE public.time_weekly_approvals
  ALTER COLUMN created_by_user_id DROP NOT NULL;

ALTER TABLE public.time_weekly_approvals
  DROP CONSTRAINT IF EXISTS time_weekly_approvals_status_check;

ALTER TABLE public.time_weekly_approvals
  ADD CONSTRAINT time_weekly_approvals_status_check
  CHECK (status IN (
    'open',
    'pending',
    'submitted',
    'approved',
    'rejected',
    'correction_required',
    'resubmitted',
    'reopened',
    'voided'
  ));

ALTER TABLE public.time_weekly_approvals
  ADD COLUMN IF NOT EXISTS submitted_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS submitted_by_membership_id uuid,
  ADD COLUMN IF NOT EXISTS submitted_by_person_profile_id uuid,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS submission_source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS approved_by_person_profile_id uuid,
  ADD COLUMN IF NOT EXISTS approval_signature_profile_signature_id uuid,
  ADD COLUMN IF NOT EXISTS approval_signature_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS approval_note text,
  ADD COLUMN IF NOT EXISTS rejected_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS rejected_by_membership_id uuid,
  ADD COLUMN IF NOT EXISTS rejected_by_person_profile_id uuid,
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejection_note text,
  ADD COLUMN IF NOT EXISTS reopened_by_person_profile_id uuid;

ALTER TABLE public.time_weekly_approvals
  DROP CONSTRAINT IF EXISTS time_weekly_approvals_submission_source_check;

ALTER TABLE public.time_weekly_approvals
  ADD CONSTRAINT time_weekly_approvals_submission_source_check
  CHECK (submission_source IN ('manual', 'scheduler', 'system', 'resubmission'));

ALTER TABLE public.time_weekly_approvals
  DROP CONSTRAINT IF EXISTS time_weekly_approvals_submitted_by_user_fkey,
  DROP CONSTRAINT IF EXISTS time_weekly_approvals_submitted_by_membership_fkey,
  DROP CONSTRAINT IF EXISTS time_weekly_approvals_submitted_by_person_fkey,
  DROP CONSTRAINT IF EXISTS time_weekly_approvals_approved_by_person_fkey,
  DROP CONSTRAINT IF EXISTS time_weekly_approvals_signature_fkey,
  DROP CONSTRAINT IF EXISTS time_weekly_approvals_rejected_by_user_fkey,
  DROP CONSTRAINT IF EXISTS time_weekly_approvals_rejected_by_membership_fkey,
  DROP CONSTRAINT IF EXISTS time_weekly_approvals_rejected_by_person_fkey,
  DROP CONSTRAINT IF EXISTS time_weekly_approvals_reopened_by_person_fkey;

ALTER TABLE public.time_weekly_approvals
  ADD CONSTRAINT time_weekly_approvals_submitted_by_user_fkey
    FOREIGN KEY (organization_id, submitted_by_user_id)
    REFERENCES public.organization_memberships(organization_id, user_id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT time_weekly_approvals_submitted_by_membership_fkey
    FOREIGN KEY (submitted_by_membership_id, organization_id)
    REFERENCES public.organization_memberships(id, organization_id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT time_weekly_approvals_submitted_by_person_fkey
    FOREIGN KEY (submitted_by_person_profile_id, organization_id)
    REFERENCES public.person_profiles(id, organization_id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT time_weekly_approvals_approved_by_person_fkey
    FOREIGN KEY (approved_by_person_profile_id, organization_id)
    REFERENCES public.person_profiles(id, organization_id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT time_weekly_approvals_signature_fkey
    FOREIGN KEY (approval_signature_profile_signature_id, organization_id)
    REFERENCES public.profile_signatures(id, organization_id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT time_weekly_approvals_rejected_by_user_fkey
    FOREIGN KEY (organization_id, rejected_by_user_id)
    REFERENCES public.organization_memberships(organization_id, user_id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT time_weekly_approvals_rejected_by_membership_fkey
    FOREIGN KEY (rejected_by_membership_id, organization_id)
    REFERENCES public.organization_memberships(id, organization_id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT time_weekly_approvals_rejected_by_person_fkey
    FOREIGN KEY (rejected_by_person_profile_id, organization_id)
    REFERENCES public.person_profiles(id, organization_id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT time_weekly_approvals_reopened_by_person_fkey
    FOREIGN KEY (reopened_by_person_profile_id, organization_id)
    REFERENCES public.person_profiles(id, organization_id)
    ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS time_weekly_approvals_status_week_idx
  ON public.time_weekly_approvals (organization_id, status, week_start_date DESC);

CREATE INDEX IF NOT EXISTS time_weekly_approvals_pending_review_idx
  ON public.time_weekly_approvals (organization_id, week_start_date DESC, updated_at DESC)
  WHERE status IN ('pending', 'submitted', 'resubmitted');

CREATE INDEX IF NOT EXISTS time_weekly_approvals_signature_idx
  ON public.time_weekly_approvals (organization_id, approval_signature_profile_signature_id)
  WHERE approval_signature_profile_signature_id IS NOT NULL;

ALTER TABLE public.time_weekly_approvals
  DROP CONSTRAINT IF EXISTS time_weekly_approvals_submission_state,
  DROP CONSTRAINT IF EXISTS time_weekly_approvals_signature_snapshot_object,
  DROP CONSTRAINT IF EXISTS time_weekly_approvals_signed_approval_state,
  DROP CONSTRAINT IF EXISTS time_weekly_approvals_rejection_state,
  DROP CONSTRAINT IF EXISTS time_weekly_approvals_approval_note_not_blank,
  DROP CONSTRAINT IF EXISTS time_weekly_approvals_rejection_note_not_blank,
  DROP CONSTRAINT IF EXISTS time_weekly_approvals_reopened_person_state;

ALTER TABLE public.time_weekly_approvals
  ADD CONSTRAINT time_weekly_approvals_submission_state
  CHECK (
    status NOT IN ('submitted', 'resubmitted')
    OR submitted_at IS NOT NULL
  ) NOT VALID,
  ADD CONSTRAINT time_weekly_approvals_signature_snapshot_object
  CHECK (jsonb_typeof(approval_signature_snapshot) = 'object') NOT VALID,
  ADD CONSTRAINT time_weekly_approvals_signed_approval_state
  CHECK (
    status <> 'approved'
    OR (
      approved_by_user_id IS NOT NULL
      AND approved_by_membership_id IS NOT NULL
      AND approved_by_person_profile_id IS NOT NULL
      AND approved_at IS NOT NULL
      AND approval_signature_profile_signature_id IS NOT NULL
      AND approval_signature_snapshot <> '{}'::jsonb
    )
  ) NOT VALID,
  ADD CONSTRAINT time_weekly_approvals_rejection_state
  CHECK (
    status NOT IN ('rejected', 'correction_required')
    OR (
      rejected_by_user_id IS NOT NULL
      AND rejected_by_membership_id IS NOT NULL
      AND rejected_by_person_profile_id IS NOT NULL
      AND rejected_at IS NOT NULL
      AND rejection_note IS NOT NULL
    )
  ) NOT VALID,
  ADD CONSTRAINT time_weekly_approvals_approval_note_not_blank
  CHECK (
    approval_note IS NULL
    OR (length(btrim(approval_note)) > 0 AND length(approval_note) <= 1000)
  ) NOT VALID,
  ADD CONSTRAINT time_weekly_approvals_rejection_note_not_blank
  CHECK (
    rejection_note IS NULL
    OR (length(btrim(rejection_note)) > 0 AND length(rejection_note) <= 2000)
  ) NOT VALID,
  ADD CONSTRAINT time_weekly_approvals_reopened_person_state
  CHECK (
    status <> 'reopened'
    OR reopened_by_person_profile_id IS NOT NULL
  ) NOT VALID;

COMMENT ON COLUMN public.time_weekly_approvals.approval_signature_snapshot
  IS 'Minimal snapshot of the approver own profile signature used for internal weekly time close confirmation. Not document signing and not advanced/qualified electronic signature.';

COMMENT ON COLUMN public.time_weekly_approvals.submission_source
  IS 'Origin of weekly close submission: manual, scheduler, system or resubmission.';

-- ============================================================
-- Helpers and audit event types
-- ============================================================

ALTER TABLE public.time_audit_events
  DROP CONSTRAINT IF EXISTS time_audit_events_event_type_check;

ALTER TABLE public.time_audit_events
  ADD CONSTRAINT time_audit_events_event_type_check
  CHECK (event_type IN (
    'time_record_created',
    'time_punch_created',
    'time_punch_updated',
    'time_correction_requested',
    'time_correction_updated',
    'time_weekly_approval_created',
    'time_weekly_approval_updated',
    'time_weekly_approval_submitted',
    'time_weekly_approval_approved',
    'time_weekly_approval_rejected',
    'time_weekly_approval_reopened',
    'time_export_requested',
    'time_export_updated',
    'time_settings_updated',
    'time_access_denied'
  ));

CREATE OR REPLACE FUNCTION public.time_week_start(target_date date)
RETURNS date
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT (target_date - ((extract(isodow from target_date)::integer - 1) * interval '1 day'))::date;
$$;

CREATE OR REPLACE FUNCTION public.time_week_is_approved(
  target_organization_id uuid,
  target_person_profile_id uuid,
  target_work_date date
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.time_weekly_approvals approval
    WHERE approval.organization_id = target_organization_id
      AND approval.person_profile_id = target_person_profile_id
      AND approval.week_start_date = public.time_week_start(target_work_date)
      AND approval.status = 'approved'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_time_weekly_approval_management_context()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT current_setting('boxops.time_weekly_approval_management', true) = 'on';
$$;

CREATE OR REPLACE FUNCTION public.time_weekly_approval_snapshot(
  target_organization_id uuid,
  target_person_profile_id uuid,
  target_week_start_date date,
  target_submission_source text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_week_end_date date := target_week_start_date + 6;
  record_count integer;
  active_punch_count integer;
  manual_punch_count integer;
  correction_punch_count integer;
  schedule_auto_punch_count integer;
  pending_correction_count integer;
  applied_correction_count integer;
  approved_record_count integer;
BEGIN
  SELECT
    count(*)::integer,
    count(*) FILTER (WHERE time_record.status = 'approved')::integer
  INTO record_count, approved_record_count
  FROM public.time_records time_record
  WHERE time_record.organization_id = target_organization_id
    AND time_record.person_profile_id = target_person_profile_id
    AND time_record.local_work_date BETWEEN target_week_start_date AND target_week_end_date
    AND time_record.status <> 'voided';

  SELECT
    count(*) FILTER (WHERE time_punch.status = 'active')::integer,
    count(*) FILTER (WHERE time_punch.status = 'active' AND time_punch.source = 'manual')::integer,
    count(*) FILTER (WHERE time_punch.status = 'active' AND time_punch.source = 'correction')::integer,
    count(*) FILTER (WHERE time_punch.status = 'active' AND time_punch.source = 'schedule_auto')::integer
  INTO
    active_punch_count,
    manual_punch_count,
    correction_punch_count,
    schedule_auto_punch_count
  FROM public.time_punches time_punch
  INNER JOIN public.time_records time_record
    ON time_record.id = time_punch.time_record_id
    AND time_record.organization_id = time_punch.organization_id
  WHERE time_punch.organization_id = target_organization_id
    AND time_punch.person_profile_id = target_person_profile_id
    AND time_record.local_work_date BETWEEN target_week_start_date AND target_week_end_date;

  SELECT
    count(*) FILTER (WHERE correction.status = 'pending')::integer,
    count(*) FILTER (WHERE correction.status = 'applied')::integer
  INTO pending_correction_count, applied_correction_count
  FROM public.time_record_corrections correction
  INNER JOIN public.time_records time_record
    ON time_record.id = correction.time_record_id
    AND time_record.organization_id = correction.organization_id
  WHERE correction.organization_id = target_organization_id
    AND correction.person_profile_id = target_person_profile_id
    AND time_record.local_work_date BETWEEN target_week_start_date AND target_week_end_date;

  RETURN jsonb_build_object(
    'schemaVersion',
    1,
    'snapshotVersion',
    'boxops.time-weekly-close.v1',
    'meaning',
    'internal_time_tracking_close_confirmation',
    'weekStartDate',
    target_week_start_date::text,
    'weekEndDate',
    target_week_end_date::text,
    'submissionSource',
    target_submission_source,
    'recordCount',
    COALESCE(record_count, 0),
    'approvedRecordCount',
    COALESCE(approved_record_count, 0),
    'activePunchCount',
    COALESCE(active_punch_count, 0),
    'manualPunchCount',
    COALESCE(manual_punch_count, 0),
    'correctionPunchCount',
    COALESCE(correction_punch_count, 0),
    'scheduleAutoPunchCount',
    COALESCE(schedule_auto_punch_count, 0),
    'pendingCorrectionCount',
    COALESCE(pending_correction_count, 0),
    'appliedCorrectionCount',
    COALESCE(applied_correction_count, 0),
    'generatedAt',
    now()
  );
END;
$$;

-- ============================================================
-- Validation trigger updates
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
  IF NOT public.is_time_weekly_approval_management_context()
    AND public.time_week_is_approved(
      NEW.organization_id,
      NEW.person_profile_id,
      NEW.local_work_date
    ) THEN
    RAISE EXCEPTION 'approved time weeks cannot be changed without reopening';
  END IF;

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
      OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
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
  current_person_profile_id uuid;
  target_record public.time_records;
  application_context boolean := public.is_time_correction_application_context();
  direct_application_context boolean := public.is_time_correction_direct_application_context();
  schedule_auto_context boolean := public.is_schedule_auto_generation_context();
BEGIN
  IF current_user_id IS NOT NULL THEN
    current_membership_id := public.get_active_membership_id(NEW.organization_id);
    current_person_profile_id := public.get_own_person_profile_id(NEW.organization_id);

    IF current_membership_id IS NULL THEN
      RAISE EXCEPTION 'active membership is required for time punches';
    END IF;

    IF application_context AND NOT public.can_manage_time_tracking(NEW.organization_id) THEN
      IF NOT (
        direct_application_context
        AND current_person_profile_id IS NOT NULL
        AND NEW.person_profile_id = current_person_profile_id
        AND NOT public.time_correction_approval_is_required(NEW.organization_id)
      ) THEN
        RAISE EXCEPTION 'time correction application permission required';
      END IF;
    END IF;

    IF schedule_auto_context AND NOT public.can_manage_time_tracking(NEW.organization_id) THEN
      RAISE EXCEPTION 'time schedule auto generation permission required';
    END IF;

    IF TG_OP = 'INSERT' THEN
      NEW.created_by_user_id := COALESCE(NEW.created_by_user_id, current_user_id);
      NEW.created_by_membership_id := COALESCE(NEW.created_by_membership_id, current_membership_id);

      IF NEW.created_by_user_id <> current_user_id THEN
        RAISE EXCEPTION 'time punch creator must be the authenticated user';
      END IF;

      IF application_context THEN
        IF NEW.source <> 'correction' OR NEW.status <> 'active' THEN
          RAISE EXCEPTION 'correction time punches must be active and correction-sourced';
        END IF;
      ELSIF schedule_auto_context THEN
        IF NEW.source <> 'schedule_auto' OR NEW.status <> 'active' THEN
          RAISE EXCEPTION 'schedule auto time punches must be active and schedule-sourced';
        END IF;

        IF NEW.schedule_block_id IS NULL OR NEW.schedule_block_assignment_id IS NULL THEN
          RAISE EXCEPTION 'schedule auto time punches require schedule context';
        END IF;

        IF COALESCE(NEW.metadata ->> 'presenceVerified', 'true') <> 'false' THEN
          RAISE EXCEPTION 'schedule auto time punches must declare no real presence verification';
        END IF;
      ELSIF NEW.source <> 'manual' OR NEW.status <> 'active' THEN
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

  IF NOT public.is_time_weekly_approval_management_context()
    AND public.time_week_is_approved(
      NEW.organization_id,
      NEW.person_profile_id,
      target_record.local_work_date
    ) THEN
    RAISE EXCEPTION 'approved time weeks cannot be changed without reopening';
  END IF;

  IF target_record.status NOT IN ('open', 'reopened') AND NOT application_context THEN
    RAISE EXCEPTION 'time punch record is not open for manual or schedule auto punches';
  END IF;

  IF NOT schedule_auto_context
    AND NEW.source <> 'schedule_auto'
    AND target_record.center_id IS NOT NULL
    AND NEW.center_id IS NOT NULL
    AND target_record.center_id <> NEW.center_id THEN
    RAISE EXCEPTION 'time punch center must match its record when both are set';
  END IF;

  IF NOT schedule_auto_context
    AND NEW.source <> 'schedule_auto'
    AND target_record.schedule_block_id IS NOT NULL
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

    IF application_context
      AND (OLD.status <> 'active' OR NEW.status NOT IN ('superseded', 'voided')) THEN
      RAISE EXCEPTION 'correction application can only retire active punches';
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
  direct_application_context boolean := public.is_time_correction_direct_application_context();
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

  IF NOT public.is_time_weekly_approval_management_context()
    AND public.time_week_is_approved(
      NEW.organization_id,
      NEW.person_profile_id,
      target_record.local_work_date
    ) THEN
    RAISE EXCEPTION 'approved time weeks cannot be corrected without reopening';
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

    IF NEW.status IS DISTINCT FROM OLD.status
      AND NOT (
        (OLD.status = 'pending' AND NEW.status IN ('approved', 'rejected'))
        OR (OLD.status = 'approved' AND NEW.status = 'applied')
        OR (
          direct_application_context
          AND OLD.status = 'pending'
          AND NEW.status = 'applied'
        )
      ) THEN
      RAISE EXCEPTION 'time correction status transition is not allowed';
    END IF;

    IF NEW.status IN ('approved', 'rejected') AND OLD.status = 'pending' THEN
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
    ELSIF NEW.status = 'applied' AND OLD.status = 'approved' THEN
      IF current_user_id IS NOT NULL AND NOT public.can_manage_time_tracking(NEW.organization_id) THEN
        RAISE EXCEPTION 'time correction application permission required';
      END IF;

      IF NEW.reviewed_by_user_id IS NULL OR NEW.reviewed_at IS NULL THEN
        RAISE EXCEPTION 'applied corrections require reviewer and timestamp';
      END IF;
    ELSIF NEW.status = 'applied'
      AND OLD.status = 'pending'
      AND direct_application_context THEN
      IF current_user_id IS NOT NULL THEN
        IF public.time_correction_approval_is_required(NEW.organization_id) THEN
          RAISE EXCEPTION 'time correction approval is required';
        END IF;

        IF NEW.requested_by_user_id <> current_user_id THEN
          RAISE EXCEPTION 'direct time correction requester must be the authenticated user';
        END IF;

        IF current_person_profile_id IS NULL OR NEW.person_profile_id <> current_person_profile_id THEN
          RAISE EXCEPTION 'direct time correction person must be the authenticated user';
        END IF;

        NEW.reviewed_by_user_id := COALESCE(NEW.reviewed_by_user_id, current_user_id);
        NEW.reviewed_by_membership_id := COALESCE(NEW.reviewed_by_membership_id, current_membership_id);
        NEW.reviewed_by_person_profile_id := COALESCE(
          NEW.reviewed_by_person_profile_id,
          current_person_profile_id
        );
        NEW.reviewed_at := COALESCE(NEW.reviewed_at, now());
      END IF;
    END IF;
  END IF;

  IF NEW.status IN ('approved', 'rejected', 'applied') THEN
    IF NEW.reviewed_by_user_id IS NULL OR NEW.reviewed_at IS NULL THEN
      RAISE EXCEPTION 'reviewed corrections require reviewer and timestamp';
    END IF;
  END IF;

  IF NEW.status = 'rejected'
    AND (NEW.review_note IS NULL OR length(btrim(NEW.review_note)) = 0) THEN
    RAISE EXCEPTION 'rejected time corrections require a review note';
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
  current_person_profile_id uuid;
  current_can_manage boolean := false;
BEGIN
  IF current_user_id IS NOT NULL THEN
    current_membership_id := public.get_active_membership_id(NEW.organization_id);
    current_person_profile_id := public.get_own_person_profile_id(NEW.organization_id);
    current_can_manage := public.can_manage_time_tracking(NEW.organization_id);

    IF current_membership_id IS NULL THEN
      RAISE EXCEPTION 'active membership is required for time weekly approvals';
    END IF;

    IF TG_OP = 'INSERT' THEN
      IF NOT current_can_manage
        AND NOT (
          NEW.person_profile_id = current_person_profile_id
          AND NEW.status IN ('submitted', 'resubmitted')
        ) THEN
        RAISE EXCEPTION 'time weekly approval permission required';
      END IF;

      NEW.created_by_user_id := COALESCE(NEW.created_by_user_id, current_user_id);
      NEW.created_by_membership_id := COALESCE(NEW.created_by_membership_id, current_membership_id);

      IF NEW.created_by_user_id <> current_user_id THEN
        RAISE EXCEPTION 'time weekly approval creator must be the authenticated user';
      END IF;
    ELSE
      IF NOT current_can_manage
        AND NOT (
          NEW.person_profile_id = current_person_profile_id
          AND NEW.status IN ('submitted', 'resubmitted')
          AND OLD.status IN ('open', 'pending', 'rejected', 'correction_required', 'reopened')
        ) THEN
        RAISE EXCEPTION 'time weekly approval permission required';
      END IF;
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.id <> OLD.id
      OR NEW.organization_id <> OLD.organization_id
      OR NEW.person_profile_id <> OLD.person_profile_id
      OR NEW.week_start_date <> OLD.week_start_date
      OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
      OR NEW.created_by_membership_id IS DISTINCT FROM OLD.created_by_membership_id
      OR NEW.created_at <> OLD.created_at THEN
      RAISE EXCEPTION 'time weekly approval immutable fields cannot be changed';
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NOT (
        (OLD.status IN ('open', 'pending', 'rejected', 'correction_required', 'reopened') AND NEW.status IN ('submitted', 'resubmitted'))
        OR (OLD.status IN ('pending', 'submitted', 'resubmitted') AND NEW.status IN ('approved', 'rejected', 'correction_required'))
        OR (OLD.status = 'approved' AND NEW.status = 'reopened')
        OR (NEW.status = 'voided' AND current_can_manage)
      ) THEN
        RAISE EXCEPTION 'time weekly approval status transition is not allowed';
      END IF;
    END IF;
  END IF;

  IF NEW.status IN ('submitted', 'resubmitted') THEN
    IF current_user_id IS NOT NULL THEN
      NEW.submitted_by_user_id := COALESCE(NEW.submitted_by_user_id, current_user_id);
      NEW.submitted_by_membership_id := COALESCE(NEW.submitted_by_membership_id, current_membership_id);
      NEW.submitted_by_person_profile_id := COALESCE(
        NEW.submitted_by_person_profile_id,
        current_person_profile_id
      );

      IF NEW.submitted_by_user_id <> current_user_id THEN
        RAISE EXCEPTION 'time weekly approval submitter must be the authenticated user';
      END IF;
    END IF;

    NEW.submitted_at := COALESCE(NEW.submitted_at, now());
  END IF;

  IF current_user_id IS NOT NULL AND NEW.status = 'approved' THEN
    IF NOT current_can_manage THEN
      RAISE EXCEPTION 'time weekly approval permission required';
    END IF;

    NEW.approved_by_user_id := COALESCE(NEW.approved_by_user_id, current_user_id);
    NEW.approved_by_membership_id := COALESCE(NEW.approved_by_membership_id, current_membership_id);
    NEW.approved_by_person_profile_id := COALESCE(
      NEW.approved_by_person_profile_id,
      current_person_profile_id
    );
    NEW.approved_at := COALESCE(NEW.approved_at, now());

    IF NEW.approved_by_user_id <> current_user_id THEN
      RAISE EXCEPTION 'time weekly approval approver must be the authenticated user';
    END IF;
  END IF;

  IF current_user_id IS NOT NULL AND NEW.status IN ('rejected', 'correction_required') THEN
    IF NOT current_can_manage THEN
      RAISE EXCEPTION 'time weekly approval permission required';
    END IF;

    NEW.rejected_by_user_id := COALESCE(NEW.rejected_by_user_id, current_user_id);
    NEW.rejected_by_membership_id := COALESCE(NEW.rejected_by_membership_id, current_membership_id);
    NEW.rejected_by_person_profile_id := COALESCE(
      NEW.rejected_by_person_profile_id,
      current_person_profile_id
    );
    NEW.rejected_at := COALESCE(NEW.rejected_at, now());

    IF NEW.rejected_by_user_id <> current_user_id THEN
      RAISE EXCEPTION 'time weekly approval rejecter must be the authenticated user';
    END IF;
  END IF;

  IF current_user_id IS NOT NULL AND NEW.status = 'reopened' THEN
    IF NOT current_can_manage THEN
      RAISE EXCEPTION 'time weekly approval permission required';
    END IF;

    NEW.reopened_by_user_id := COALESCE(NEW.reopened_by_user_id, current_user_id);
    NEW.reopened_by_membership_id := COALESCE(NEW.reopened_by_membership_id, current_membership_id);
    NEW.reopened_by_person_profile_id := COALESCE(
      NEW.reopened_by_person_profile_id,
      current_person_profile_id
    );
    NEW.reopened_at := COALESCE(NEW.reopened_at, now());

    IF NEW.reopened_by_user_id <> current_user_id THEN
      RAISE EXCEPTION 'time weekly approval reopener must be the authenticated user';
    END IF;
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
  audit_metadata jsonb := '{}'::jsonb;
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
    IF TG_OP = 'INSERT' THEN
      audit_event_type := 'time_punch_created';
    ELSE
      audit_event_type := 'time_punch_updated';
    END IF;

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
      IF NEW.status IN ('pending', 'submitted', 'resubmitted') THEN
        audit_event_type := 'time_weekly_approval_submitted';
      ELSE
        audit_event_type := 'time_weekly_approval_created';
      END IF;
    ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NEW.status IN ('submitted', 'resubmitted') THEN
        audit_event_type := 'time_weekly_approval_submitted';
      ELSIF NEW.status = 'approved' THEN
        audit_event_type := 'time_weekly_approval_approved';
      ELSIF NEW.status IN ('rejected', 'correction_required') THEN
        audit_event_type := 'time_weekly_approval_rejected';
      ELSIF NEW.status = 'reopened' THEN
        audit_event_type := 'time_weekly_approval_reopened';
      ELSE
        audit_event_type := 'time_weekly_approval_updated';
      END IF;
    ELSE
      audit_event_type := 'time_weekly_approval_updated';
    END IF;

    audit_metadata := jsonb_build_object(
      'schemaVersion',
      1,
      'previousStatus',
      CASE WHEN TG_OP = 'UPDATE' THEN OLD.status ELSE NULL END,
      'nextStatus',
      NEW.status,
      'weekStartDate',
      NEW.week_start_date::text
    );
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
    audit_metadata
  );

  RETURN NEW;
END;
$$;

-- ============================================================
-- Weekly closure RPCs
-- ============================================================

CREATE OR REPLACE FUNCTION public.submit_time_weekly_approval(
  target_organization_id uuid,
  target_person_profile_id uuid,
  target_week_start_date date,
  target_submission_source text DEFAULT 'manual'
)
RETURNS public.time_weekly_approvals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := (select auth.uid());
  current_membership_id uuid;
  current_person_profile_id uuid;
  current_can_manage boolean := false;
  normalized_source text := COALESCE(NULLIF(target_submission_source, ''), 'manual');
  next_status text;
  target_week_end_date date;
  existing_approval public.time_weekly_approvals;
  submitted_approval public.time_weekly_approvals;
BEGIN
  IF target_organization_id IS NULL
    OR target_person_profile_id IS NULL
    OR target_week_start_date IS NULL THEN
    RAISE EXCEPTION 'organization, person and week are required for weekly approval submission';
  END IF;

  IF extract(isodow from target_week_start_date) <> 1 THEN
    RAISE EXCEPTION 'weekly approval week must start on Monday';
  END IF;

  IF normalized_source NOT IN ('manual', 'scheduler', 'system', 'resubmission') THEN
    RAISE EXCEPTION 'weekly approval submission source is not allowed';
  END IF;

  IF current_user_id IS NULL AND normalized_source NOT IN ('scheduler', 'system') THEN
    RAISE EXCEPTION 'authentication is required for manual weekly approval submission';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.organizations organization
    WHERE organization.id = target_organization_id
      AND organization.status IN ('trialing', 'active')
  ) THEN
    RAISE EXCEPTION 'organization is not available for weekly approval submission';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.person_profiles person_profile
    WHERE person_profile.id = target_person_profile_id
      AND person_profile.organization_id = target_organization_id
      AND person_profile.status = 'active'
  ) THEN
    RAISE EXCEPTION 'person profile is not valid for weekly approval submission';
  END IF;

  IF current_user_id IS NOT NULL THEN
    current_membership_id := public.get_active_membership_id(target_organization_id);
    current_person_profile_id := public.get_own_person_profile_id(target_organization_id);
    current_can_manage := public.can_manage_time_tracking(target_organization_id);

    IF current_membership_id IS NULL THEN
      RAISE EXCEPTION 'active membership is required for weekly approval submission';
    END IF;

    IF NOT current_can_manage
      AND current_person_profile_id IS DISTINCT FROM target_person_profile_id THEN
      RAISE EXCEPTION 'weekly approval submission must target the authenticated person';
    END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext(target_organization_id::text),
    hashtext(target_person_profile_id::text || ':' || target_week_start_date::text)
  );

  target_week_end_date := target_week_start_date + 6;

  SELECT approval.*
  INTO existing_approval
  FROM public.time_weekly_approvals approval
  WHERE approval.organization_id = target_organization_id
    AND approval.person_profile_id = target_person_profile_id
    AND approval.week_start_date = target_week_start_date
  FOR UPDATE;

  IF existing_approval.id IS NOT NULL
    AND existing_approval.status IN ('approved', 'submitted', 'resubmitted', 'pending') THEN
    IF existing_approval.status = 'pending' THEN
      UPDATE public.time_weekly_approvals
      SET
        status = 'submitted',
        submitted_by_user_id = COALESCE(submitted_by_user_id, current_user_id),
        submitted_by_membership_id = COALESCE(submitted_by_membership_id, current_membership_id),
        submitted_by_person_profile_id = COALESCE(submitted_by_person_profile_id, current_person_profile_id),
        submitted_at = COALESCE(submitted_at, now()),
        submission_source = normalized_source,
        snapshot = public.time_weekly_approval_snapshot(
          target_organization_id,
          target_person_profile_id,
          target_week_start_date,
          normalized_source
        )
      WHERE id = existing_approval.id
        AND organization_id = target_organization_id
      RETURNING * INTO submitted_approval;

      RETURN submitted_approval;
    END IF;

    RETURN existing_approval;
  END IF;

  IF existing_approval.id IS NOT NULL AND existing_approval.status = 'voided' THEN
    RAISE EXCEPTION 'voided weekly approvals cannot be submitted again';
  END IF;

  next_status := CASE
    WHEN existing_approval.id IS NULL THEN 'submitted'
    WHEN existing_approval.status IN ('rejected', 'correction_required', 'reopened') THEN 'resubmitted'
    ELSE 'submitted'
  END;

  IF existing_approval.id IS NULL THEN
    INSERT INTO public.time_weekly_approvals (
      organization_id,
      person_profile_id,
      week_start_date,
      status,
      submitted_by_user_id,
      submitted_by_membership_id,
      submitted_by_person_profile_id,
      submitted_at,
      submission_source,
      created_by_user_id,
      created_by_membership_id,
      snapshot,
      metadata
    )
    VALUES (
      target_organization_id,
      target_person_profile_id,
      target_week_start_date,
      next_status,
      current_user_id,
      current_membership_id,
      current_person_profile_id,
      now(),
      normalized_source,
      current_user_id,
      current_membership_id,
      public.time_weekly_approval_snapshot(
        target_organization_id,
        target_person_profile_id,
        target_week_start_date,
        normalized_source
      ),
      jsonb_build_object(
        'schemaVersion',
        1,
        'source',
        normalized_source
      )
    )
    RETURNING * INTO submitted_approval;
  ELSE
    UPDATE public.time_weekly_approvals
    SET
      status = next_status,
      submitted_by_user_id = current_user_id,
      submitted_by_membership_id = current_membership_id,
      submitted_by_person_profile_id = current_person_profile_id,
      submitted_at = now(),
      submission_source = CASE
        WHEN next_status = 'resubmitted' THEN 'resubmission'
        ELSE normalized_source
      END,
      approved_by_user_id = NULL,
      approved_by_membership_id = NULL,
      approved_by_person_profile_id = NULL,
      approved_at = NULL,
      approval_signature_profile_signature_id = NULL,
      approval_signature_snapshot = '{}'::jsonb,
      approval_note = NULL,
      snapshot = public.time_weekly_approval_snapshot(
        target_organization_id,
        target_person_profile_id,
        target_week_start_date,
        CASE WHEN next_status = 'resubmitted' THEN 'resubmission' ELSE normalized_source END
      )
    WHERE id = existing_approval.id
      AND organization_id = target_organization_id
    RETURNING * INTO submitted_approval;
  END IF;

  UPDATE public.time_records
  SET
    status = 'submitted',
    metadata = metadata || jsonb_build_object(
      'weeklyApprovalId',
      submitted_approval.id,
      'weeklyApprovalStatus',
      submitted_approval.status,
      'weeklySubmittedAt',
      submitted_approval.submitted_at
    )
  WHERE organization_id = target_organization_id
    AND person_profile_id = target_person_profile_id
    AND local_work_date BETWEEN target_week_start_date AND target_week_end_date
    AND status IN ('open', 'reopened');

  RETURN submitted_approval;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_time_weekly_approval(
  target_organization_id uuid,
  target_weekly_approval_id uuid,
  target_approval_note text DEFAULT NULL
)
RETURNS public.time_weekly_approvals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := (select auth.uid());
  current_membership_id uuid;
  current_person_profile_id uuid;
  target_approval public.time_weekly_approvals;
  active_signature public.profile_signatures;
  signature_snapshot jsonb;
  approved_approval public.time_weekly_approvals;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication is required for weekly approval';
  END IF;

  IF target_organization_id IS NULL OR target_weekly_approval_id IS NULL THEN
    RAISE EXCEPTION 'organization and weekly approval are required';
  END IF;

  IF target_approval_note IS NOT NULL
    AND (length(btrim(target_approval_note)) = 0 OR length(target_approval_note) > 1000) THEN
    RAISE EXCEPTION 'weekly approval note is not valid';
  END IF;

  current_membership_id := public.get_active_membership_id(target_organization_id);
  current_person_profile_id := public.get_own_person_profile_id(target_organization_id);

  IF current_membership_id IS NULL OR current_person_profile_id IS NULL THEN
    RAISE EXCEPTION 'active membership and linked person are required for weekly approval';
  END IF;

  IF NOT public.can_manage_time_tracking(target_organization_id) THEN
    RAISE EXCEPTION 'time tracking manager role is required for weekly approval';
  END IF;

  SELECT approval.*
  INTO target_approval
  FROM public.time_weekly_approvals approval
  WHERE approval.id = target_weekly_approval_id
    AND approval.organization_id = target_organization_id
  FOR UPDATE;

  IF target_approval.id IS NULL THEN
    RAISE EXCEPTION 'weekly approval was not found';
  END IF;

  IF target_approval.status NOT IN ('pending', 'submitted', 'resubmitted') THEN
    RAISE EXCEPTION 'only submitted weekly approvals can be approved';
  END IF;

  SELECT profile_signature.*
  INTO active_signature
  FROM public.profile_signatures profile_signature
  WHERE profile_signature.organization_id = target_organization_id
    AND profile_signature.person_profile_id = current_person_profile_id
    AND profile_signature.status = 'active'
  ORDER BY profile_signature.signature_version DESC
  LIMIT 1;

  IF active_signature.id IS NULL THEN
    RAISE EXCEPTION 'own active profile signature is required for weekly approval';
  END IF;

  signature_snapshot := jsonb_build_object(
    'schemaVersion',
    1,
    'snapshotVersion',
    'boxops.weekly-approval-signature.v1',
    'meaning',
    'internal_time_tracking_close_confirmation',
    'profileSignatureId',
    active_signature.id,
    'personProfileId',
    active_signature.person_profile_id,
    'signatureVersion',
    active_signature.signature_version,
    'signatureHash',
    active_signature.signature_hash,
    'storageBucket',
    active_signature.storage_bucket,
    'storagePath',
    active_signature.storage_path,
    'mimeType',
    active_signature.mime_type,
    'sizeBytes',
    active_signature.size_bytes,
    'width',
    active_signature.width,
    'height',
    active_signature.height,
    'capturedAt',
    now()
  );

  PERFORM set_config('boxops.time_weekly_approval_management', 'on', true);

  UPDATE public.time_weekly_approvals
  SET
    status = 'approved',
    approved_by_user_id = current_user_id,
    approved_by_membership_id = current_membership_id,
    approved_by_person_profile_id = current_person_profile_id,
    approved_at = now(),
    approval_signature_profile_signature_id = active_signature.id,
    approval_signature_snapshot = signature_snapshot,
    approval_note = NULLIF(btrim(target_approval_note), ''),
    snapshot = snapshot || jsonb_build_object(
      'approvedAt',
      now(),
      'approvedByPersonProfileId',
      current_person_profile_id,
      'approvalMeaning',
      'internal_time_tracking_close_confirmation'
    )
  WHERE id = target_approval.id
    AND organization_id = target_organization_id
  RETURNING * INTO approved_approval;

  UPDATE public.time_records
  SET
    status = 'approved',
    metadata = metadata || jsonb_build_object(
      'weeklyApprovalId',
      approved_approval.id,
      'weeklyApprovalStatus',
      approved_approval.status,
      'weeklyApprovedAt',
      approved_approval.approved_at
    )
  WHERE organization_id = target_organization_id
    AND person_profile_id = approved_approval.person_profile_id
    AND local_work_date BETWEEN approved_approval.week_start_date AND approved_approval.week_start_date + 6
    AND status <> 'voided';

  PERFORM set_config('boxops.time_weekly_approval_management', 'off', true);

  RETURN approved_approval;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_time_weekly_approval(
  target_organization_id uuid,
  target_weekly_approval_id uuid,
  target_rejection_note text,
  target_rejection_status text DEFAULT 'correction_required'
)
RETURNS public.time_weekly_approvals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := (select auth.uid());
  current_membership_id uuid;
  current_person_profile_id uuid;
  normalized_note text := NULLIF(btrim(target_rejection_note), '');
  normalized_status text := COALESCE(NULLIF(target_rejection_status, ''), 'correction_required');
  target_approval public.time_weekly_approvals;
  rejected_approval public.time_weekly_approvals;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication is required for weekly approval rejection';
  END IF;

  IF target_organization_id IS NULL OR target_weekly_approval_id IS NULL THEN
    RAISE EXCEPTION 'organization and weekly approval are required';
  END IF;

  IF normalized_status NOT IN ('rejected', 'correction_required') THEN
    RAISE EXCEPTION 'weekly approval rejection status is not allowed';
  END IF;

  IF normalized_note IS NULL OR length(normalized_note) > 2000 THEN
    RAISE EXCEPTION 'weekly approval rejection note is required';
  END IF;

  current_membership_id := public.get_active_membership_id(target_organization_id);
  current_person_profile_id := public.get_own_person_profile_id(target_organization_id);

  IF current_membership_id IS NULL OR current_person_profile_id IS NULL THEN
    RAISE EXCEPTION 'active membership and linked person are required for weekly approval rejection';
  END IF;

  IF NOT public.can_manage_time_tracking(target_organization_id) THEN
    RAISE EXCEPTION 'time tracking manager role is required for weekly approval rejection';
  END IF;

  SELECT approval.*
  INTO target_approval
  FROM public.time_weekly_approvals approval
  WHERE approval.id = target_weekly_approval_id
    AND approval.organization_id = target_organization_id
  FOR UPDATE;

  IF target_approval.id IS NULL THEN
    RAISE EXCEPTION 'weekly approval was not found';
  END IF;

  IF target_approval.status NOT IN ('pending', 'submitted', 'resubmitted') THEN
    RAISE EXCEPTION 'only submitted weekly approvals can be rejected';
  END IF;

  UPDATE public.time_weekly_approvals
  SET
    status = normalized_status,
    rejected_by_user_id = current_user_id,
    rejected_by_membership_id = current_membership_id,
    rejected_by_person_profile_id = current_person_profile_id,
    rejected_at = now(),
    rejection_note = normalized_note,
    snapshot = snapshot || jsonb_build_object(
      'rejectedAt',
      now(),
      'rejectedByPersonProfileId',
      current_person_profile_id,
      'rejectionStatus',
      normalized_status
    )
  WHERE id = target_approval.id
    AND organization_id = target_organization_id
  RETURNING * INTO rejected_approval;

  RETURN rejected_approval;
END;
$$;

CREATE OR REPLACE FUNCTION public.reopen_time_weekly_approval(
  target_organization_id uuid,
  target_weekly_approval_id uuid,
  target_reopen_reason text
)
RETURNS public.time_weekly_approvals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := (select auth.uid());
  current_membership_id uuid;
  current_person_profile_id uuid;
  normalized_reason text := NULLIF(btrim(target_reopen_reason), '');
  target_approval public.time_weekly_approvals;
  reopened_approval public.time_weekly_approvals;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication is required for weekly approval reopening';
  END IF;

  IF target_organization_id IS NULL OR target_weekly_approval_id IS NULL THEN
    RAISE EXCEPTION 'organization and weekly approval are required';
  END IF;

  IF normalized_reason IS NULL OR length(normalized_reason) > 2000 THEN
    RAISE EXCEPTION 'weekly approval reopen reason is required';
  END IF;

  current_membership_id := public.get_active_membership_id(target_organization_id);
  current_person_profile_id := public.get_own_person_profile_id(target_organization_id);

  IF current_membership_id IS NULL OR current_person_profile_id IS NULL THEN
    RAISE EXCEPTION 'active membership and linked person are required for weekly approval reopening';
  END IF;

  IF NOT public.can_manage_time_tracking(target_organization_id) THEN
    RAISE EXCEPTION 'time tracking manager role is required for weekly approval reopening';
  END IF;

  SELECT approval.*
  INTO target_approval
  FROM public.time_weekly_approvals approval
  WHERE approval.id = target_weekly_approval_id
    AND approval.organization_id = target_organization_id
  FOR UPDATE;

  IF target_approval.id IS NULL THEN
    RAISE EXCEPTION 'weekly approval was not found';
  END IF;

  IF target_approval.status <> 'approved' THEN
    RAISE EXCEPTION 'only approved weekly approvals can be reopened';
  END IF;

  PERFORM set_config('boxops.time_weekly_approval_management', 'on', true);

  UPDATE public.time_weekly_approvals
  SET
    status = 'reopened',
    reopened_by_user_id = current_user_id,
    reopened_by_membership_id = current_membership_id,
    reopened_by_person_profile_id = current_person_profile_id,
    reopened_at = now(),
    reopen_reason = normalized_reason,
    snapshot = snapshot || jsonb_build_object(
      'reopenedAt',
      now(),
      'reopenedByPersonProfileId',
      current_person_profile_id
    )
  WHERE id = target_approval.id
    AND organization_id = target_organization_id
  RETURNING * INTO reopened_approval;

  UPDATE public.time_records
  SET
    status = 'reopened',
    metadata = metadata || jsonb_build_object(
      'weeklyApprovalId',
      reopened_approval.id,
      'weeklyApprovalStatus',
      reopened_approval.status,
      'weeklyReopenedAt',
      reopened_approval.reopened_at
    )
  WHERE organization_id = target_organization_id
    AND person_profile_id = reopened_approval.person_profile_id
    AND local_work_date BETWEEN reopened_approval.week_start_date AND reopened_approval.week_start_date + 6
    AND status = 'approved';

  PERFORM set_config('boxops.time_weekly_approval_management', 'off', true);

  RETURN reopened_approval;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_due_time_weekly_approvals(
  target_now timestamptz DEFAULT now(),
  target_organization_id uuid DEFAULT NULL
)
RETURNS TABLE (
  organization_id uuid,
  person_profile_id uuid,
  week_start_date date,
  weekly_approval_id uuid,
  status text,
  submitted_at timestamptz,
  skipped_reason text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  organization_record record;
  person_record record;
  local_now timestamp;
  local_week_start date;
  submitted_approval public.time_weekly_approvals;
BEGIN
  IF target_now IS NULL THEN
    RAISE EXCEPTION 'target timestamp is required for weekly approval scheduler';
  END IF;

  FOR organization_record IN
    SELECT organization.id, organization.timezone
    FROM public.organizations organization
    WHERE organization.status IN ('trialing', 'active')
      AND (target_organization_id IS NULL OR organization.id = target_organization_id)
    ORDER BY organization.id
  LOOP
    local_now := target_now AT TIME ZONE COALESCE(NULLIF(organization_record.timezone, ''), 'Europe/Madrid');

    IF extract(isodow from local_now) <> 7
      OR extract(hour from local_now) <> 23
      OR extract(minute from local_now) <> 59 THEN
      CONTINUE;
    END IF;

    local_week_start := (local_now::date - interval '6 days')::date;

    FOR person_record IN
      SELECT DISTINCT candidate.person_profile_id
      FROM (
        SELECT time_record.person_profile_id
        FROM public.time_records time_record
        WHERE time_record.organization_id = organization_record.id
          AND time_record.local_work_date BETWEEN local_week_start AND local_week_start + 6
          AND time_record.status <> 'voided'

        UNION

        SELECT linked_person_profile.id AS person_profile_id
        FROM public.schedule_block_assignments assignment
        INNER JOIN public.schedule_blocks schedule_block
          ON schedule_block.id = assignment.schedule_block_id
          AND schedule_block.organization_id = assignment.organization_id
        INNER JOIN public.coach_profiles coach_profile
          ON coach_profile.id = assignment.coach_profile_id
          AND coach_profile.organization_id = assignment.organization_id
        INNER JOIN LATERAL (
          SELECT person_profile.id
          FROM public.person_profiles person_profile
          WHERE person_profile.organization_id = assignment.organization_id
            AND person_profile.status = 'active'
            AND person_profile.visibility_status = 'visible'
            AND (
              (
                coach_profile.person_profile_id IS NOT NULL
                AND person_profile.id = coach_profile.person_profile_id
              )
              OR (
                coach_profile.person_profile_id IS NULL
                AND coach_profile.user_id IS NOT NULL
                AND person_profile.user_id = coach_profile.user_id
              )
            )
          ORDER BY
            CASE
              WHEN person_profile.id = coach_profile.person_profile_id THEN 0
              ELSE 1
            END
          LIMIT 1
        ) linked_person_profile ON true
        WHERE assignment.organization_id = organization_record.id
          AND assignment.assignment_status = 'assigned'
          AND coach_profile.status = 'active'
          AND schedule_block.status <> 'cancelled'
          AND schedule_block.service_date BETWEEN local_week_start AND local_week_start + 6
      ) candidate
      ORDER BY candidate.person_profile_id
    LOOP
      BEGIN
        submitted_approval := public.submit_time_weekly_approval(
          organization_record.id,
          person_record.person_profile_id,
          local_week_start,
          'scheduler'
        );

        organization_id := organization_record.id;
        person_profile_id := person_record.person_profile_id;
        week_start_date := local_week_start;
        weekly_approval_id := submitted_approval.id;
        status := submitted_approval.status;
        submitted_at := submitted_approval.submitted_at;
        skipped_reason := NULL;
        RETURN NEXT;
      EXCEPTION WHEN others THEN
        organization_id := organization_record.id;
        person_profile_id := person_record.person_profile_id;
        week_start_date := local_week_start;
        weekly_approval_id := NULL;
        status := NULL;
        submitted_at := NULL;
        skipped_reason := SQLERRM;
        RETURN NEXT;
      END;
    END LOOP;
  END LOOP;

  RETURN;
END;
$$;

COMMENT ON FUNCTION public.submit_due_time_weekly_approvals(timestamptz, uuid)
  IS 'DB-scheduler primitive for F.12. Intended for a database job that runs every minute and submits organizations whose local time is Sunday 23:59. Not granted to normal app roles.';

-- ============================================================
-- Function grants
-- ============================================================

REVOKE ALL ON FUNCTION public.time_week_start(date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.time_week_is_approved(uuid, uuid, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_time_weekly_approval_management_context() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.time_weekly_approval_snapshot(uuid, uuid, date, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_time_weekly_approval(uuid, uuid, date, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.approve_time_weekly_approval(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_time_weekly_approval(uuid, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reopen_time_weekly_approval(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_due_time_weekly_approvals(timestamptz, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.time_week_is_approved(uuid, uuid, date) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.is_time_weekly_approval_management_context() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.time_weekly_approval_snapshot(uuid, uuid, date, text) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.submit_due_time_weekly_approvals(timestamptz, uuid) FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION public.time_week_start(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_time_weekly_approval(uuid, uuid, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_time_weekly_approval(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_time_weekly_approval(uuid, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reopen_time_weekly_approval(uuid, uuid, text) TO authenticated;

-- Intentionally not granted to authenticated/anon:
-- public.submit_due_time_weekly_approvals(timestamptz, uuid)
