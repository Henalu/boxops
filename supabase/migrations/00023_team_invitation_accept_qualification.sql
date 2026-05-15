-- BoxOps - Team invitation accept qualification
-- Avoid PL/pgSQL ambiguity with the organization_id return column.

CREATE OR REPLACE FUNCTION public.accept_team_invitation(
  target_invitation_id uuid,
  raw_invitation_token text
)
RETURNS TABLE (organization_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := (select auth.uid());
  current_email text;
  expected_hash text;
  target_invitation public.team_invitations;
  existing_membership public.organization_memberships;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT lower(btrim(auth_user.email))
  INTO current_email
  FROM auth.users auth_user
  WHERE auth_user.id = current_user_id;

  IF current_email IS NULL THEN
    RAISE EXCEPTION 'authenticated user email is required';
  END IF;

  IF raw_invitation_token IS NULL OR length(raw_invitation_token) < 32 THEN
    RAISE EXCEPTION 'invalid invitation token';
  END IF;

  expected_hash := encode(extensions.digest(raw_invitation_token, 'sha256'), 'hex');

  SELECT *
  INTO target_invitation
  FROM public.team_invitations invitation
  WHERE invitation.id = target_invitation_id
    AND invitation.token_hash = expected_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invitation not found';
  END IF;

  IF target_invitation.status NOT IN ('pending', 'sent') THEN
    RAISE EXCEPTION 'invitation is not pending';
  END IF;

  IF target_invitation.expires_at < now() THEN
    UPDATE public.team_invitations AS invitation
    SET status = 'expired'
    WHERE invitation.id = target_invitation.id;

    RAISE EXCEPTION 'invitation has expired';
  END IF;

  IF target_invitation.email_normalized <> current_email THEN
    RAISE EXCEPTION 'invitation email does not match authenticated user';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.person_profiles person_profile
    WHERE person_profile.organization_id = target_invitation.organization_id
      AND person_profile.user_id = current_user_id
      AND person_profile.id <> target_invitation.person_profile_id
  ) THEN
    RAISE EXCEPTION 'account already linked to another person in this organization';
  END IF;

  IF target_invitation.coach_profile_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.coach_profiles coach_profile
    WHERE coach_profile.organization_id = target_invitation.organization_id
      AND coach_profile.user_id = current_user_id
      AND coach_profile.id <> target_invitation.coach_profile_id
  ) THEN
    RAISE EXCEPTION 'account already linked to another coach in this organization';
  END IF;

  SELECT *
  INTO existing_membership
  FROM public.organization_memberships membership
  WHERE membership.organization_id = target_invitation.organization_id
    AND membership.user_id = current_user_id
  FOR UPDATE;

  IF FOUND THEN
    UPDATE public.organization_memberships AS membership
    SET
      role = target_invitation.role,
      status = target_invitation.initial_access_status,
      invited_at = COALESCE(existing_membership.invited_at, target_invitation.sent_at, target_invitation.created_at),
      joined_at = CASE
        WHEN target_invitation.initial_access_status = 'active'
          THEN COALESCE(existing_membership.joined_at, now())
        ELSE existing_membership.joined_at
      END
    WHERE membership.id = existing_membership.id
      AND membership.organization_id = target_invitation.organization_id;
  ELSE
    INSERT INTO public.organization_memberships (
      organization_id,
      user_id,
      role,
      status,
      invited_at,
      joined_at
    )
    VALUES (
      target_invitation.organization_id,
      current_user_id,
      target_invitation.role,
      target_invitation.initial_access_status,
      COALESCE(target_invitation.sent_at, target_invitation.created_at),
      CASE
        WHEN target_invitation.initial_access_status = 'active' THEN now()
        ELSE NULL
      END
    );
  END IF;

  PERFORM set_config('boxops.accepting_team_invitation', 'on', true);

  UPDATE public.person_profiles AS person_profile
  SET user_id = current_user_id
  WHERE person_profile.id = target_invitation.person_profile_id
    AND person_profile.organization_id = target_invitation.organization_id
    AND (person_profile.user_id IS NULL OR person_profile.user_id = current_user_id);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'person profile could not be linked';
  END IF;

  IF target_invitation.coach_profile_id IS NOT NULL THEN
    UPDATE public.coach_profiles AS coach_profile
    SET user_id = current_user_id
    WHERE coach_profile.id = target_invitation.coach_profile_id
      AND coach_profile.organization_id = target_invitation.organization_id
      AND (coach_profile.user_id IS NULL OR coach_profile.user_id = current_user_id);

    IF NOT FOUND THEN
      RAISE EXCEPTION 'coach profile could not be linked';
    END IF;
  END IF;

  UPDATE public.team_invitations AS invitation
  SET
    status = 'accepted',
    accepted_by_user_id = current_user_id,
    accepted_at = now()
  WHERE invitation.id = target_invitation.id;

  RETURN QUERY SELECT target_invitation.organization_id;
END;
$$;
