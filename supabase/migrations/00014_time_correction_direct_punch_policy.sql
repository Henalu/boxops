-- BoxOps - Fase F.8 direct own correction punch policy
-- Allows non-manager users to mutate their own punch history only through the
-- direct correction RPC and only when the tenant does not require approval.

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

  IF target_record.status NOT IN ('open', 'reopened') AND NOT application_context THEN
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
