-- BoxWod - initial product schema on the shared BoxOps hub
-- Requires BoxOps hub migrations through:
-- 20260629100000_boxwod_hub_role_alignment.sql

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF to_regclass('public.organizations') IS NULL THEN
    RAISE EXCEPTION 'BoxWod requires public.organizations from the shared BoxOps hub';
  END IF;

  IF to_regclass('public.centers') IS NULL THEN
    RAISE EXCEPTION 'BoxWod requires public.centers from the shared BoxOps hub';
  END IF;

  IF to_regclass('public.person_profiles') IS NULL THEN
    RAISE EXCEPTION 'BoxWod requires public.person_profiles from the shared BoxOps hub';
  END IF;

  IF to_regclass('public.organization_memberships') IS NULL THEN
    RAISE EXCEPTION 'BoxWod requires public.organization_memberships from the shared BoxOps hub';
  END IF;

  IF to_regclass('public.class_types') IS NULL THEN
    RAISE EXCEPTION 'BoxWod requires public.class_types from BoxOps';
  END IF;

  IF to_regclass('public.schedule_blocks') IS NULL THEN
    RAISE EXCEPTION 'BoxWod requires public.schedule_blocks from BoxOps';
  END IF;

  IF to_regprocedure('public.set_updated_at()') IS NULL THEN
    RAISE EXCEPTION 'BoxWod requires public.set_updated_at() from the shared BoxOps hub';
  END IF;

  IF to_regprocedure('public.is_hub_member(uuid)') IS NULL THEN
    RAISE EXCEPTION 'BoxWod requires public.is_hub_member(uuid) from the shared BoxOps hub';
  END IF;

  IF to_regprocedure('public.has_org_role(uuid,text[])') IS NULL THEN
    RAISE EXCEPTION 'BoxWod requires public.has_org_role(uuid,text[]) from the shared BoxOps hub';
  END IF;
END $$;

-- ============================================================
-- Shared hub helpers used by BoxWod RLS
-- ============================================================

CREATE OR REPLACE FUNCTION public.boxwod_is_active_member(target_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_hub_member(target_organization_id);
$$;

CREATE OR REPLACE FUNCTION public.boxwod_can_manage(target_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_org_role(
    target_organization_id,
    ARRAY['owner', 'admin', 'manager', 'center_manager']
  );
$$;

CREATE OR REPLACE FUNCTION public.boxwod_can_program(target_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_org_role(
    target_organization_id,
    ARRAY['owner', 'admin', 'manager', 'center_manager', 'coach']
  );
$$;

CREATE OR REPLACE FUNCTION public.boxwod_can_staff(target_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_org_role(
    target_organization_id,
    ARRAY['owner', 'admin', 'manager', 'center_manager', 'coach', 'staff']
  );
$$;

REVOKE ALL ON FUNCTION public.boxwod_is_active_member(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.boxwod_can_manage(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.boxwod_can_program(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.boxwod_can_staff(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.boxwod_is_active_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.boxwod_can_manage(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.boxwod_can_program(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.boxwod_can_staff(uuid) TO authenticated;

-- BoxWod needs read access to shared identity basics for athlete-facing UI.
CREATE POLICY "BoxWod hub members can view organizations"
  ON public.organizations FOR SELECT TO authenticated
  USING (public.is_hub_member(id));

CREATE POLICY "BoxWod hub members can view centers"
  ON public.centers FOR SELECT TO authenticated
  USING (public.is_hub_member(organization_id));

CREATE POLICY "BoxWod hub members can view visible person profiles"
  ON public.person_profiles FOR SELECT TO authenticated
  USING (
    visibility_status = 'visible'
    AND public.is_hub_member(organization_id)
  );

CREATE POLICY "BoxWod users can view own person profile"
  ON public.person_profiles FOR SELECT TO authenticated
  USING (
    user_id = (select auth.uid())
    AND public.is_hub_member(organization_id)
  );

-- ============================================================
-- Athlete profiles
-- ============================================================

CREATE TABLE public.boxwod_athlete_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  person_profile_id uuid NOT NULL,
  home_center_id uuid,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive')),
  membership_status text NOT NULL DEFAULT 'active'
    CHECK (membership_status IN ('active', 'trial', 'frozen', 'suspended', 'cancelled', 'expired')),
  public_display_name text,
  result_visibility_default text NOT NULL DEFAULT 'private'
    CHECK (result_visibility_default IN ('private', 'coaches', 'box')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, person_profile_id),
  UNIQUE (id, organization_id),
  FOREIGN KEY (person_profile_id, organization_id)
    REFERENCES public.person_profiles(id, organization_id)
    ON DELETE CASCADE,
  FOREIGN KEY (home_center_id, organization_id)
    REFERENCES public.centers(id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT boxwod_athlete_profiles_display_name_not_blank
    CHECK (public_display_name IS NULL OR length(btrim(public_display_name)) > 0)
);

-- ============================================================
-- Reservations
-- ============================================================

CREATE TABLE public.boxwod_class_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  source_schedule_block_id uuid NOT NULL,
  center_id uuid NOT NULL,
  center_name text NOT NULL,
  class_type_id uuid NOT NULL,
  class_name text NOT NULL,
  class_category text,
  class_color text,
  coach_person_profile_id uuid,
  coach_display_name text,
  service_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  capacity integer NOT NULL DEFAULT 0
    CHECK (capacity >= 0),
  status text NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'full', 'waitlist', 'cancelled', 'closed')),
  booking_opens_at timestamptz,
  booking_closes_at timestamptz,
  cancellation_deadline_at timestamptz,
  source_status text,
  source_updated_at timestamptz,
  sync_status text NOT NULL DEFAULT 'synced'
    CHECK (sync_status IN ('synced', 'stale', 'manual_review')),
  reservation_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, source_schedule_block_id),
  UNIQUE (id, organization_id),
  FOREIGN KEY (source_schedule_block_id, organization_id)
    REFERENCES public.schedule_blocks(id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (center_id, organization_id)
    REFERENCES public.centers(id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (class_type_id, organization_id)
    REFERENCES public.class_types(id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (coach_person_profile_id, organization_id)
    REFERENCES public.person_profiles(id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT boxwod_class_sessions_time_range
    CHECK (start_time < end_time),
  CONSTRAINT boxwod_class_sessions_center_name_not_blank
    CHECK (length(btrim(center_name)) > 0),
  CONSTRAINT boxwod_class_sessions_class_name_not_blank
    CHECK (length(btrim(class_name)) > 0)
);

CREATE TABLE public.boxwod_class_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  class_session_id uuid NOT NULL,
  athlete_profile_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'reserved'
    CHECK (status IN ('reserved', 'cancelled', 'checked_in', 'no_show')),
  reserved_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz,
  checked_in_at timestamptz,
  cancelled_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id),
  FOREIGN KEY (class_session_id, organization_id)
    REFERENCES public.boxwod_class_sessions(id, organization_id)
    ON DELETE CASCADE,
  FOREIGN KEY (athlete_profile_id, organization_id)
    REFERENCES public.boxwod_athlete_profiles(id, organization_id)
    ON DELETE CASCADE
);

CREATE TABLE public.boxwod_class_waitlist_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  class_session_id uuid NOT NULL,
  athlete_profile_id uuid NOT NULL,
  position integer NOT NULL
    CHECK (position > 0),
  status text NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'offered', 'accepted', 'expired', 'cancelled')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  offered_at timestamptz,
  offered_until timestamptz,
  resolved_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id),
  FOREIGN KEY (class_session_id, organization_id)
    REFERENCES public.boxwod_class_sessions(id, organization_id)
    ON DELETE CASCADE,
  FOREIGN KEY (athlete_profile_id, organization_id)
    REFERENCES public.boxwod_athlete_profiles(id, organization_id)
    ON DELETE CASCADE
);

-- ============================================================
-- WOD programming
-- ============================================================

CREATE TABLE public.boxwod_programming_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, slug),
  UNIQUE (id, organization_id),
  CONSTRAINT boxwod_programming_tracks_name_not_blank
    CHECK (length(btrim(name)) > 0),
  CONSTRAINT boxwod_programming_tracks_slug_format
    CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

CREATE TABLE public.boxwod_training_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  programming_track_id uuid NOT NULL,
  center_id uuid,
  service_date date NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'published', 'archived')),
  title text,
  summary text,
  published_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id),
  FOREIGN KEY (programming_track_id, organization_id)
    REFERENCES public.boxwod_programming_tracks(id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (center_id, organization_id)
    REFERENCES public.centers(id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT boxwod_training_days_title_not_blank
    CHECK (title IS NULL OR length(btrim(title)) > 0)
);

CREATE TABLE public.boxwod_workout_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  training_day_id uuid NOT NULL,
  position integer NOT NULL
    CHECK (position > 0),
  section_type text NOT NULL
    CHECK (section_type IN ('warmup', 'skill', 'strength', 'metcon', 'weightlifting', 'endurance', 'cooldown', 'notes')),
  title text,
  body text NOT NULL DEFAULT '',
  time_cap_minutes integer
    CHECK (time_cap_minutes IS NULL OR time_cap_minutes > 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (training_day_id, position),
  UNIQUE (id, organization_id),
  FOREIGN KEY (training_day_id, organization_id)
    REFERENCES public.boxwod_training_days(id, organization_id)
    ON DELETE CASCADE,
  CONSTRAINT boxwod_workout_sections_title_not_blank
    CHECK (title IS NULL OR length(btrim(title)) > 0)
);

CREATE TABLE public.boxwod_workout_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  training_day_id uuid NOT NULL,
  workout_section_id uuid,
  athlete_profile_id uuid NOT NULL,
  score_type text NOT NULL
    CHECK (score_type IN ('time', 'reps', 'weight', 'rounds_reps', 'distance', 'calories', 'text')),
  score_value text NOT NULL,
  score_unit text,
  rx_level text
    CHECK (rx_level IS NULL OR rx_level IN ('rx', 'scaled', 'foundations')),
  notes text,
  visibility text NOT NULL DEFAULT 'private'
    CHECK (visibility IN ('private', 'coaches', 'box')),
  performed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id),
  FOREIGN KEY (training_day_id, organization_id)
    REFERENCES public.boxwod_training_days(id, organization_id)
    ON DELETE CASCADE,
  FOREIGN KEY (workout_section_id, organization_id)
    REFERENCES public.boxwod_workout_sections(id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (athlete_profile_id, organization_id)
    REFERENCES public.boxwod_athlete_profiles(id, organization_id)
    ON DELETE CASCADE,
  CONSTRAINT boxwod_workout_results_score_value_not_blank
    CHECK (length(btrim(score_value)) > 0),
  CONSTRAINT boxwod_workout_results_score_unit_not_blank
    CHECK (score_unit IS NULL OR length(btrim(score_unit)) > 0)
);

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX boxwod_athlete_profiles_person_idx
  ON public.boxwod_athlete_profiles (organization_id, person_profile_id);

CREATE INDEX boxwod_athlete_profiles_home_center_idx
  ON public.boxwod_athlete_profiles (home_center_id)
  WHERE home_center_id IS NOT NULL;

CREATE INDEX boxwod_class_sessions_org_date_idx
  ON public.boxwod_class_sessions (organization_id, service_date, start_time);

CREATE INDEX boxwod_class_sessions_source_idx
  ON public.boxwod_class_sessions (source_schedule_block_id);

CREATE INDEX boxwod_class_sessions_center_date_idx
  ON public.boxwod_class_sessions (center_id, service_date, start_time);

CREATE INDEX boxwod_class_sessions_class_type_idx
  ON public.boxwod_class_sessions (class_type_id);

CREATE INDEX boxwod_class_sessions_coach_person_idx
  ON public.boxwod_class_sessions (coach_person_profile_id)
  WHERE coach_person_profile_id IS NOT NULL;

CREATE INDEX boxwod_class_reservations_session_status_idx
  ON public.boxwod_class_reservations (class_session_id, status);

CREATE INDEX boxwod_class_reservations_athlete_idx
  ON public.boxwod_class_reservations (athlete_profile_id, status);

CREATE INDEX boxwod_class_reservations_org_status_idx
  ON public.boxwod_class_reservations (organization_id, status);

CREATE UNIQUE INDEX boxwod_class_reservations_one_active_per_athlete_idx
  ON public.boxwod_class_reservations (class_session_id, athlete_profile_id)
  WHERE status IN ('reserved', 'checked_in');

CREATE INDEX boxwod_class_waitlist_session_status_idx
  ON public.boxwod_class_waitlist_entries (class_session_id, status, position);

CREATE INDEX boxwod_class_waitlist_athlete_idx
  ON public.boxwod_class_waitlist_entries (athlete_profile_id, status);

CREATE UNIQUE INDEX boxwod_class_waitlist_one_active_per_athlete_idx
  ON public.boxwod_class_waitlist_entries (class_session_id, athlete_profile_id)
  WHERE status IN ('waiting', 'offered');

CREATE UNIQUE INDEX boxwod_class_waitlist_one_active_position_idx
  ON public.boxwod_class_waitlist_entries (class_session_id, position)
  WHERE status IN ('waiting', 'offered');

CREATE INDEX boxwod_programming_tracks_org_status_idx
  ON public.boxwod_programming_tracks (organization_id, status);

CREATE INDEX boxwod_training_days_org_date_status_idx
  ON public.boxwod_training_days (organization_id, service_date, status);

CREATE INDEX boxwod_training_days_track_date_idx
  ON public.boxwod_training_days (programming_track_id, service_date);

CREATE INDEX boxwod_training_days_center_date_idx
  ON public.boxwod_training_days (center_id, service_date)
  WHERE center_id IS NOT NULL;

CREATE INDEX boxwod_workout_sections_day_position_idx
  ON public.boxwod_workout_sections (training_day_id, position);

CREATE INDEX boxwod_workout_results_athlete_idx
  ON public.boxwod_workout_results (athlete_profile_id, created_at DESC);

CREATE INDEX boxwod_workout_results_day_idx
  ON public.boxwod_workout_results (training_day_id, visibility);

CREATE INDEX boxwod_workout_results_section_idx
  ON public.boxwod_workout_results (workout_section_id)
  WHERE workout_section_id IS NOT NULL;

CREATE INDEX boxwod_workout_results_org_created_idx
  ON public.boxwod_workout_results (organization_id, created_at DESC);

-- ============================================================
-- Updated_at triggers
-- ============================================================

CREATE TRIGGER boxwod_athlete_profiles_set_updated_at
  BEFORE UPDATE ON public.boxwod_athlete_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER boxwod_class_sessions_set_updated_at
  BEFORE UPDATE ON public.boxwod_class_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER boxwod_class_reservations_set_updated_at
  BEFORE UPDATE ON public.boxwod_class_reservations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER boxwod_class_waitlist_entries_set_updated_at
  BEFORE UPDATE ON public.boxwod_class_waitlist_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER boxwod_programming_tracks_set_updated_at
  BEFORE UPDATE ON public.boxwod_programming_tracks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER boxwod_training_days_set_updated_at
  BEFORE UPDATE ON public.boxwod_training_days
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER boxwod_workout_sections_set_updated_at
  BEFORE UPDATE ON public.boxwod_workout_sections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER boxwod_workout_results_set_updated_at
  BEFORE UPDATE ON public.boxwod_workout_results
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- Ownership helpers for athlete data
-- ============================================================

CREATE OR REPLACE FUNCTION public.boxwod_owns_athlete_profile(
  target_organization_id uuid,
  target_athlete_profile_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.boxwod_athlete_profiles athlete_profile
    JOIN public.person_profiles person_profile
      ON person_profile.id = athlete_profile.person_profile_id
     AND person_profile.organization_id = athlete_profile.organization_id
    WHERE athlete_profile.organization_id = target_organization_id
      AND athlete_profile.id = target_athlete_profile_id
      AND athlete_profile.status = 'active'
      AND person_profile.user_id = (select auth.uid())
      AND public.boxwod_is_active_member(target_organization_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.boxwod_can_book_athlete_profile(
  target_organization_id uuid,
  target_athlete_profile_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.boxwod_athlete_profiles athlete_profile
    WHERE athlete_profile.organization_id = target_organization_id
      AND athlete_profile.id = target_athlete_profile_id
      AND athlete_profile.status = 'active'
      AND athlete_profile.membership_status IN ('active', 'trial')
      AND public.boxwod_owns_athlete_profile(target_organization_id, target_athlete_profile_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.boxwod_get_class_session_availability(
  target_class_session_id uuid
)
RETURNS TABLE (
  class_session_id uuid,
  capacity integer,
  reserved_count bigint,
  checked_in_count bigint,
  waitlist_count bigint,
  available_spots integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH reservation_counts AS (
    SELECT
      reservation.organization_id,
      reservation.class_session_id,
      count(reservation.id) FILTER (
        WHERE reservation.status IN ('reserved', 'checked_in')
      )::bigint AS reserved_count,
      count(reservation.id) FILTER (
        WHERE reservation.status = 'checked_in'
      )::bigint AS checked_in_count
    FROM public.boxwod_class_reservations reservation
    GROUP BY reservation.organization_id, reservation.class_session_id
  ),
  waitlist_counts AS (
    SELECT
      waitlist_entry.organization_id,
      waitlist_entry.class_session_id,
      count(waitlist_entry.id) FILTER (
        WHERE waitlist_entry.status IN ('waiting', 'offered')
      )::bigint AS waitlist_count
    FROM public.boxwod_class_waitlist_entries waitlist_entry
    GROUP BY waitlist_entry.organization_id, waitlist_entry.class_session_id
  )
  SELECT
    class_session.id AS class_session_id,
    class_session.capacity,
    coalesce(reservation_counts.reserved_count, 0) AS reserved_count,
    coalesce(reservation_counts.checked_in_count, 0) AS checked_in_count,
    coalesce(waitlist_counts.waitlist_count, 0) AS waitlist_count,
    greatest(
      class_session.capacity - coalesce(reservation_counts.reserved_count, 0)::integer,
      0
    ) AS available_spots
  FROM public.boxwod_class_sessions class_session
  LEFT JOIN reservation_counts
    ON reservation_counts.class_session_id = class_session.id
   AND reservation_counts.organization_id = class_session.organization_id
  LEFT JOIN waitlist_counts
    ON waitlist_counts.class_session_id = class_session.id
   AND waitlist_counts.organization_id = class_session.organization_id
  WHERE class_session.id = target_class_session_id
    AND public.boxwod_is_active_member(class_session.organization_id);
$$;

REVOKE ALL ON FUNCTION public.boxwod_owns_athlete_profile(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.boxwod_can_book_athlete_profile(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.boxwod_get_class_session_availability(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.boxwod_owns_athlete_profile(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.boxwod_can_book_athlete_profile(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.boxwod_get_class_session_availability(uuid) TO authenticated;

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE public.boxwod_athlete_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boxwod_class_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boxwod_class_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boxwod_class_waitlist_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boxwod_programming_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boxwod_training_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boxwod_workout_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boxwod_workout_results ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.boxwod_athlete_profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.boxwod_class_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.boxwod_class_reservations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.boxwod_class_waitlist_entries FORCE ROW LEVEL SECURITY;
ALTER TABLE public.boxwod_programming_tracks FORCE ROW LEVEL SECURITY;
ALTER TABLE public.boxwod_training_days FORCE ROW LEVEL SECURITY;
ALTER TABLE public.boxwod_workout_sections FORCE ROW LEVEL SECURITY;
ALTER TABLE public.boxwod_workout_results FORCE ROW LEVEL SECURITY;

CREATE POLICY "BoxWod users can view relevant athlete profiles"
  ON public.boxwod_athlete_profiles FOR SELECT TO authenticated
  USING (
    public.boxwod_can_staff(organization_id)
    OR public.boxwod_owns_athlete_profile(organization_id, id)
  );

CREATE POLICY "BoxWod managers can create athlete profiles"
  ON public.boxwod_athlete_profiles FOR INSERT TO authenticated
  WITH CHECK (public.boxwod_can_manage(organization_id));

CREATE POLICY "BoxWod managers can update athlete profiles"
  ON public.boxwod_athlete_profiles FOR UPDATE TO authenticated
  USING (public.boxwod_can_manage(organization_id))
  WITH CHECK (public.boxwod_can_manage(organization_id));

CREATE POLICY "BoxWod managers can delete athlete profiles"
  ON public.boxwod_athlete_profiles FOR DELETE TO authenticated
  USING (public.boxwod_can_manage(organization_id));

CREATE POLICY "BoxWod members can view class sessions"
  ON public.boxwod_class_sessions FOR SELECT TO authenticated
  USING (public.boxwod_is_active_member(organization_id));

CREATE POLICY "BoxWod managers can create class sessions"
  ON public.boxwod_class_sessions FOR INSERT TO authenticated
  WITH CHECK (public.boxwod_can_manage(organization_id));

CREATE POLICY "BoxWod managers can update class sessions"
  ON public.boxwod_class_sessions FOR UPDATE TO authenticated
  USING (public.boxwod_can_manage(organization_id))
  WITH CHECK (public.boxwod_can_manage(organization_id));

CREATE POLICY "BoxWod managers can delete class sessions"
  ON public.boxwod_class_sessions FOR DELETE TO authenticated
  USING (public.boxwod_can_manage(organization_id));

CREATE POLICY "BoxWod users can view relevant reservations"
  ON public.boxwod_class_reservations FOR SELECT TO authenticated
  USING (
    public.boxwod_can_staff(organization_id)
    OR public.boxwod_owns_athlete_profile(organization_id, athlete_profile_id)
  );

CREATE POLICY "BoxWod users can create reservations"
  ON public.boxwod_class_reservations FOR INSERT TO authenticated
  WITH CHECK (
    public.boxwod_can_manage(organization_id)
    OR (
      status = 'reserved'
      AND public.boxwod_can_book_athlete_profile(organization_id, athlete_profile_id)
    )
  );

CREATE POLICY "BoxWod users can update relevant reservations"
  ON public.boxwod_class_reservations FOR UPDATE TO authenticated
  USING (
    public.boxwod_can_staff(organization_id)
    OR public.boxwod_owns_athlete_profile(organization_id, athlete_profile_id)
  )
  WITH CHECK (
    public.boxwod_can_staff(organization_id)
    OR public.boxwod_owns_athlete_profile(organization_id, athlete_profile_id)
  );

CREATE POLICY "BoxWod managers can delete reservations"
  ON public.boxwod_class_reservations FOR DELETE TO authenticated
  USING (public.boxwod_can_manage(organization_id));

CREATE POLICY "BoxWod users can view relevant waitlist entries"
  ON public.boxwod_class_waitlist_entries FOR SELECT TO authenticated
  USING (
    public.boxwod_can_staff(organization_id)
    OR public.boxwod_owns_athlete_profile(organization_id, athlete_profile_id)
  );

CREATE POLICY "BoxWod users can join waitlists"
  ON public.boxwod_class_waitlist_entries FOR INSERT TO authenticated
  WITH CHECK (
    public.boxwod_can_manage(organization_id)
    OR (
      status = 'waiting'
      AND public.boxwod_can_book_athlete_profile(organization_id, athlete_profile_id)
    )
  );

CREATE POLICY "BoxWod users can update relevant waitlist entries"
  ON public.boxwod_class_waitlist_entries FOR UPDATE TO authenticated
  USING (
    public.boxwod_can_staff(organization_id)
    OR public.boxwod_owns_athlete_profile(organization_id, athlete_profile_id)
  )
  WITH CHECK (
    public.boxwod_can_staff(organization_id)
    OR public.boxwod_owns_athlete_profile(organization_id, athlete_profile_id)
  );

CREATE POLICY "BoxWod managers can delete waitlist entries"
  ON public.boxwod_class_waitlist_entries FOR DELETE TO authenticated
  USING (public.boxwod_can_manage(organization_id));

CREATE POLICY "BoxWod members can view programming tracks"
  ON public.boxwod_programming_tracks FOR SELECT TO authenticated
  USING (public.boxwod_is_active_member(organization_id));

CREATE POLICY "BoxWod programming staff can create tracks"
  ON public.boxwod_programming_tracks FOR INSERT TO authenticated
  WITH CHECK (public.boxwod_can_program(organization_id));

CREATE POLICY "BoxWod programming staff can update tracks"
  ON public.boxwod_programming_tracks FOR UPDATE TO authenticated
  USING (public.boxwod_can_program(organization_id))
  WITH CHECK (public.boxwod_can_program(organization_id));

CREATE POLICY "BoxWod programming staff can delete tracks"
  ON public.boxwod_programming_tracks FOR DELETE TO authenticated
  USING (public.boxwod_can_program(organization_id));

CREATE POLICY "BoxWod members can view published training days"
  ON public.boxwod_training_days FOR SELECT TO authenticated
  USING (
    public.boxwod_can_program(organization_id)
    OR (
      status = 'published'
      AND public.boxwod_is_active_member(organization_id)
    )
  );

CREATE POLICY "BoxWod programming staff can create training days"
  ON public.boxwod_training_days FOR INSERT TO authenticated
  WITH CHECK (public.boxwod_can_program(organization_id));

CREATE POLICY "BoxWod programming staff can update training days"
  ON public.boxwod_training_days FOR UPDATE TO authenticated
  USING (public.boxwod_can_program(organization_id))
  WITH CHECK (public.boxwod_can_program(organization_id));

CREATE POLICY "BoxWod programming staff can delete training days"
  ON public.boxwod_training_days FOR DELETE TO authenticated
  USING (public.boxwod_can_program(organization_id));

CREATE POLICY "BoxWod members can view published workout sections"
  ON public.boxwod_workout_sections FOR SELECT TO authenticated
  USING (
    public.boxwod_can_program(organization_id)
    OR EXISTS (
      SELECT 1
      FROM public.boxwod_training_days training_day
      WHERE training_day.id = boxwod_workout_sections.training_day_id
        AND training_day.organization_id = boxwod_workout_sections.organization_id
        AND training_day.status = 'published'
        AND public.boxwod_is_active_member(training_day.organization_id)
    )
  );

CREATE POLICY "BoxWod programming staff can create workout sections"
  ON public.boxwod_workout_sections FOR INSERT TO authenticated
  WITH CHECK (public.boxwod_can_program(organization_id));

CREATE POLICY "BoxWod programming staff can update workout sections"
  ON public.boxwod_workout_sections FOR UPDATE TO authenticated
  USING (public.boxwod_can_program(organization_id))
  WITH CHECK (public.boxwod_can_program(organization_id));

CREATE POLICY "BoxWod programming staff can delete workout sections"
  ON public.boxwod_workout_sections FOR DELETE TO authenticated
  USING (public.boxwod_can_program(organization_id));

CREATE POLICY "BoxWod users can view relevant workout results"
  ON public.boxwod_workout_results FOR SELECT TO authenticated
  USING (
    public.boxwod_can_manage(organization_id)
    OR public.boxwod_owns_athlete_profile(organization_id, athlete_profile_id)
    OR (
      visibility = 'coaches'
      AND public.boxwod_can_staff(organization_id)
    )
    OR (
      visibility = 'box'
      AND public.boxwod_is_active_member(organization_id)
      AND EXISTS (
        SELECT 1
        FROM public.boxwod_training_days training_day
        WHERE training_day.id = boxwod_workout_results.training_day_id
          AND training_day.organization_id = boxwod_workout_results.organization_id
          AND training_day.status = 'published'
      )
    )
  );

CREATE POLICY "BoxWod users can create workout results"
  ON public.boxwod_workout_results FOR INSERT TO authenticated
  WITH CHECK (
    public.boxwod_can_staff(organization_id)
    OR public.boxwod_owns_athlete_profile(organization_id, athlete_profile_id)
  );

CREATE POLICY "BoxWod users can update relevant workout results"
  ON public.boxwod_workout_results FOR UPDATE TO authenticated
  USING (
    public.boxwod_can_staff(organization_id)
    OR public.boxwod_owns_athlete_profile(organization_id, athlete_profile_id)
  )
  WITH CHECK (
    public.boxwod_can_staff(organization_id)
    OR public.boxwod_owns_athlete_profile(organization_id, athlete_profile_id)
  );

CREATE POLICY "BoxWod users can delete relevant workout results"
  ON public.boxwod_workout_results FOR DELETE TO authenticated
  USING (
    public.boxwod_can_manage(organization_id)
    OR public.boxwod_owns_athlete_profile(organization_id, athlete_profile_id)
  );

-- ============================================================
-- Operational summary for BoxOps/staff surfaces
-- ============================================================

CREATE OR REPLACE VIEW public.boxwod_class_session_reservation_summaries
WITH (security_invoker = true)
AS
WITH reservation_counts AS (
  SELECT
    reservation.organization_id,
    reservation.class_session_id,
    count(reservation.id) FILTER (
      WHERE reservation.status IN ('reserved', 'checked_in')
    )::bigint AS reserved_count,
    count(reservation.id) FILTER (
      WHERE reservation.status = 'checked_in'
    )::bigint AS checked_in_count,
    count(reservation.id) FILTER (
      WHERE reservation.status = 'no_show'
    )::bigint AS no_show_count
  FROM public.boxwod_class_reservations reservation
  GROUP BY reservation.organization_id, reservation.class_session_id
),
waitlist_counts AS (
  SELECT
    waitlist_entry.organization_id,
    waitlist_entry.class_session_id,
    count(waitlist_entry.id) FILTER (
      WHERE waitlist_entry.status IN ('waiting', 'offered')
    )::bigint AS waitlist_count
  FROM public.boxwod_class_waitlist_entries waitlist_entry
  GROUP BY waitlist_entry.organization_id, waitlist_entry.class_session_id
)
SELECT
  class_session.organization_id,
  class_session.id AS class_session_id,
  class_session.source_schedule_block_id,
  class_session.capacity,
  coalesce(reservation_counts.reserved_count, 0) AS reserved_count,
  coalesce(reservation_counts.checked_in_count, 0) AS checked_in_count,
  coalesce(reservation_counts.no_show_count, 0) AS no_show_count,
  coalesce(waitlist_counts.waitlist_count, 0) AS waitlist_count
FROM public.boxwod_class_sessions class_session
LEFT JOIN reservation_counts
  ON reservation_counts.class_session_id = class_session.id
 AND reservation_counts.organization_id = class_session.organization_id
LEFT JOIN waitlist_counts
  ON waitlist_counts.class_session_id = class_session.id
 AND waitlist_counts.organization_id = class_session.organization_id;

-- ============================================================
-- Grants
-- ============================================================

GRANT USAGE ON SCHEMA public TO authenticated;

GRANT SELECT ON public.organizations TO authenticated;
GRANT SELECT ON public.centers TO authenticated;
GRANT SELECT ON public.person_profiles TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.boxwod_athlete_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.boxwod_class_sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.boxwod_class_reservations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.boxwod_class_waitlist_entries TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.boxwod_programming_tracks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.boxwod_training_days TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.boxwod_workout_sections TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.boxwod_workout_results TO authenticated;
GRANT SELECT ON public.boxwod_class_session_reservation_summaries TO authenticated;

COMMENT ON TABLE public.boxwod_athlete_profiles IS
  'BoxWod athlete extension of the shared hub person profile. Does not duplicate identity.';

COMMENT ON TABLE public.boxwod_class_sessions IS
  'Athlete-facing reservable snapshot derived from BoxOps schedule_blocks. BoxWod reserves here and does not edit BoxOps schedule_blocks directly.';

COMMENT ON TABLE public.boxwod_class_reservations IS
  'BoxWod reservations for athlete-facing class sessions.';

COMMENT ON TABLE public.boxwod_class_waitlist_entries IS
  'BoxWod waitlist entries for athlete-facing class sessions.';

COMMENT ON TABLE public.boxwod_training_days IS
  'BoxWod WOD publication by service date and programming track.';

COMMENT ON TABLE public.boxwod_workout_results IS
  'Sensitive athlete performance data. RLS keeps private results owner/staff scoped.';
