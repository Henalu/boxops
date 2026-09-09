-- Run with the migration loaded in the same transaction (see the Node runner).
-- All actors, schedule data and the candidate function are rolled back.
CREATE FUNCTION pg_temp.fixture_id(n integer) RETURNS uuid
LANGUAGE sql IMMUTABLE AS $$
  SELECT ('00000000-0000-4000-8000-' || lpad((970000 + n)::text, 12, '0'))::uuid;
$$;

CREATE FUNCTION pg_temp.assert_true(condition boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF condition IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL: %', label;
  END IF;
  RAISE NOTICE 'PASS: %', label;
END;
$$;

CREATE FUNCTION pg_temp.use_actor(n integer) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', pg_temp.fixture_id(n)::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
END;
$$;

CREATE FUNCTION pg_temp.expect_sqlstate(statement text, expected_code text, label text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE actual_code text;
BEGIN
  BEGIN
    EXECUTE statement;
  EXCEPTION WHEN others THEN
    actual_code := SQLSTATE;
  END;
  IF actual_code IS DISTINCT FROM expected_code THEN
    RAISE NOTICE 'Expected SQLSTATE %, received %', expected_code, coalesce(actual_code, 'no error');
  END IF;
  PERFORM pg_temp.assert_true(actual_code = expected_code, label);
END;
$$;

INSERT INTO auth.users (id, aud, role, email, created_at, updated_at)
SELECT pg_temp.fixture_id(n), 'authenticated', 'authenticated',
  'atomic-template-' || n || '@example.invalid', now(), now()
FROM generate_series(11, 17) n;

INSERT INTO public.organizations (id, name, slug, status)
VALUES (pg_temp.fixture_id(1), 'Atomic template A', 'atomic-template-fixture-a', 'active'),
       (pg_temp.fixture_id(2), 'Atomic template B', 'atomic-template-fixture-b', 'active');

INSERT INTO public.organization_memberships (organization_id, user_id, role, status)
VALUES (pg_temp.fixture_id(1), pg_temp.fixture_id(11), 'owner', 'active'),
       (pg_temp.fixture_id(1), pg_temp.fixture_id(12), 'coach', 'active'),
       (pg_temp.fixture_id(1), pg_temp.fixture_id(13), 'athlete', 'active'),
       (pg_temp.fixture_id(2), pg_temp.fixture_id(14), 'owner', 'active'),
       (pg_temp.fixture_id(1), pg_temp.fixture_id(15), 'manager', 'active'),
       (pg_temp.fixture_id(1), pg_temp.fixture_id(16), 'admin', 'active');

INSERT INTO public.centers (id, organization_id, name, slug)
VALUES (pg_temp.fixture_id(31), pg_temp.fixture_id(1), 'Center A', 'center-a'),
       (pg_temp.fixture_id(32), pg_temp.fixture_id(2), 'Center B', 'center-b'),
       (pg_temp.fixture_id(33), pg_temp.fixture_id(1), 'Center A2', 'center-a2');

INSERT INTO public.class_types (id, organization_id, name, slug)
VALUES (pg_temp.fixture_id(41), pg_temp.fixture_id(1), 'Activity A', 'activity-a'),
       (pg_temp.fixture_id(42), pg_temp.fixture_id(2), 'Activity B', 'activity-b');

INSERT INTO public.person_profiles (id, organization_id, user_id, display_name)
VALUES (pg_temp.fixture_id(51), pg_temp.fixture_id(1), pg_temp.fixture_id(12), 'Fixture coach');
INSERT INTO public.coach_profiles (id, organization_id, user_id, person_profile_id)
VALUES (pg_temp.fixture_id(61), pg_temp.fixture_id(1), pg_temp.fixture_id(12), pg_temp.fixture_id(51));

INSERT INTO public.schedule_templates (id, organization_id, center_id, name, status)
SELECT pg_temp.fixture_id(n), pg_temp.fixture_id(1), pg_temp.fixture_id(31),
  'Fixture template ' || n, CASE WHEN n = 77 THEN 'draft' ELSE 'active' END
FROM unnest(ARRAY[71,72,73,75,76,77]) n;
INSERT INTO public.schedule_templates (id, organization_id, center_id, name, status)
VALUES (pg_temp.fixture_id(74), pg_temp.fixture_id(2), pg_temp.fixture_id(32), 'Foreign template', 'active');
UPDATE public.schedule_templates SET valid_from = '2026-10-21', valid_until = '2026-10-21'
WHERE id = pg_temp.fixture_id(76);

INSERT INTO public.schedule_template_blocks (
  id, organization_id, template_id, center_id, class_type_id,
  day_of_week, start_time, end_time, default_coach_profile_id, required_coaches
)
VALUES
  (pg_temp.fixture_id(81), pg_temp.fixture_id(1), pg_temp.fixture_id(71), pg_temp.fixture_id(31), pg_temp.fixture_id(41), 1, '07:00', '08:00', pg_temp.fixture_id(61), 1),
  (pg_temp.fixture_id(82), pg_temp.fixture_id(1), pg_temp.fixture_id(72), pg_temp.fixture_id(31), pg_temp.fixture_id(41), 1, '09:00', '10:00', pg_temp.fixture_id(61), 1),
  (pg_temp.fixture_id(83), pg_temp.fixture_id(1), pg_temp.fixture_id(73), pg_temp.fixture_id(31), pg_temp.fixture_id(41), 1, '11:00', '12:00', pg_temp.fixture_id(61), 0),
  (pg_temp.fixture_id(84), pg_temp.fixture_id(1), pg_temp.fixture_id(73), pg_temp.fixture_id(31), pg_temp.fixture_id(41), 1, '12:00', '13:00', NULL, 1),
  (pg_temp.fixture_id(85), pg_temp.fixture_id(2), pg_temp.fixture_id(74), pg_temp.fixture_id(32), pg_temp.fixture_id(42), 1, '07:00', '08:00', NULL, 1),
  (pg_temp.fixture_id(86), pg_temp.fixture_id(1), pg_temp.fixture_id(76), pg_temp.fixture_id(31), pg_temp.fixture_id(41), 1, '07:00', '08:00', NULL, 1),
  (pg_temp.fixture_id(87), pg_temp.fixture_id(1), pg_temp.fixture_id(76), pg_temp.fixture_id(31), pg_temp.fixture_id(41), 3, '07:00', '08:00', NULL, 1);

SELECT pg_temp.assert_true(NOT has_function_privilege('anon',
  'public.apply_schedule_template_week(uuid,uuid,date,boolean)', 'EXECUTE'), 'anonymous execution revoked');
SELECT pg_temp.assert_true(NOT (SELECT prosecdef FROM pg_proc
  WHERE oid = 'public.apply_schedule_template_week(uuid,uuid,date,boolean)'::regprocedure), 'function keeps invoker RLS');

GRANT EXECUTE ON FUNCTION pg_temp.fixture_id(integer), pg_temp.assert_true(boolean, text),
  pg_temp.use_actor(integer), pg_temp.expect_sqlstate(text, text, text) TO authenticated;
SET LOCAL ROLE authenticated;
SELECT pg_temp.use_actor(11);
SELECT pg_temp.assert_true(public.apply_schedule_template_week(pg_temp.fixture_id(1), pg_temp.fixture_id(71), '2026-10-05') =
  '{"status":"applied","insertedBlockCount":1,"replacedBlockCount":0}'::jsonb, 'owner applies block and coach');
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM public.schedule_block_assignments
  WHERE organization_id = pg_temp.fixture_id(1) AND assignment_status = 'assigned'), 'coach assignment persisted');
SELECT pg_temp.assert_true(public.apply_schedule_template_week(pg_temp.fixture_id(1), pg_temp.fixture_id(71), '2026-10-05')->>'status' =
  'already-applied', 'repeat application is idempotent');
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM public.schedule_blocks
  WHERE organization_id = pg_temp.fixture_id(1)), 'repeat does not duplicate blocks');

INSERT INTO public.schedule_blocks (id, organization_id, center_id, class_type_id, service_date, start_time, end_time)
VALUES (pg_temp.fixture_id(92), pg_temp.fixture_id(1), pg_temp.fixture_id(31), pg_temp.fixture_id(41), '2026-10-12', '07:00', '08:00');
INSERT INTO public.schedule_block_assignments (organization_id, schedule_block_id, coach_profile_id)
VALUES (pg_temp.fixture_id(1), pg_temp.fixture_id(92), pg_temp.fixture_id(61));

SELECT pg_temp.expect_sqlstate(
  $$SELECT public.apply_schedule_template_week(pg_temp.fixture_id(1), pg_temp.fixture_id(71), '2026-10-12')$$,
  '23P01', 'assignment overlap rejects the complete application');
SELECT pg_temp.assert_true(NOT EXISTS (SELECT 1 FROM public.schedule_blocks
  WHERE organization_id = pg_temp.fixture_id(1) AND template_id = pg_temp.fixture_id(71) AND service_date = '2026-10-12'),
  'failed assignment leaves no new block');

SELECT pg_temp.assert_true(public.apply_schedule_template_week(pg_temp.fixture_id(1), pg_temp.fixture_id(72), '2026-10-12')->>'status' =
  'applied', 'prepare existing timetable for replacement');
CREATE TEMP TABLE previous_blocks AS SELECT id FROM public.schedule_blocks
  WHERE organization_id = pg_temp.fixture_id(1) AND template_id = pg_temp.fixture_id(72);
CREATE TEMP TABLE previous_assignments AS SELECT id FROM public.schedule_block_assignments
  WHERE schedule_block_id IN (SELECT id FROM previous_blocks);
SELECT pg_temp.assert_true(public.apply_schedule_template_week(pg_temp.fixture_id(1), pg_temp.fixture_id(71), '2026-10-12')->>'status' =
  'template-week-has-template', 'replacement requires explicit intent');
SELECT pg_temp.expect_sqlstate(
  $$SELECT public.apply_schedule_template_week(pg_temp.fixture_id(1), pg_temp.fixture_id(71), '2026-10-12', true)$$,
  '23P01', 'failed replacement rolls back');
SELECT pg_temp.assert_true((SELECT count(*) FROM public.schedule_blocks WHERE id IN (SELECT id FROM previous_blocks)) = 1,
  'old block keeps its identity after failed replacement');
SELECT pg_temp.assert_true((SELECT count(*) FROM public.schedule_block_assignments WHERE id IN (SELECT id FROM previous_assignments)) = 1,
  'old assignment survives failed replacement');

RESET ROLE;
SELECT * FROM public.boxwod_sync_class_sessions_from_schedule_blocks_internal(
  pg_temp.fixture_id(1), '2026-10-12', '2026-10-12');
SELECT pg_temp.assert_true((SELECT count(*) = 2 FROM public.boxwod_class_sessions
  WHERE organization_id = pg_temp.fixture_id(1) AND service_date = '2026-10-12'),
  'BoxWod sync contains only the two valid existing blocks');
SET LOCAL ROLE authenticated;
UPDATE public.schedule_block_assignments SET assignment_status = 'removed'
WHERE organization_id = pg_temp.fixture_id(1) AND schedule_block_id = pg_temp.fixture_id(92);
SELECT pg_temp.expect_sqlstate(
  $$SELECT public.apply_schedule_template_week(pg_temp.fixture_id(1), pg_temp.fixture_id(71), '2026-10-12', true)$$,
  '23503', 'replacement preserves blocks already referenced by BoxWod');
RESET ROLE;
DELETE FROM public.boxwod_class_sessions
WHERE organization_id = pg_temp.fixture_id(1) AND source_schedule_block_id IN (SELECT id FROM previous_blocks);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(public.apply_schedule_template_week(pg_temp.fixture_id(1), pg_temp.fixture_id(71), '2026-10-12', true) =
  '{"status":"applied","insertedBlockCount":1,"replacedBlockCount":1}'::jsonb, 'replacement succeeds once conflict is removed');

SELECT pg_temp.use_actor(15);
SELECT pg_temp.assert_true(public.apply_schedule_template_week(pg_temp.fixture_id(1), pg_temp.fixture_id(73), '2026-10-19')->>'insertedBlockCount' =
  '2', 'manager can apply vacant and zero-required blocks');
SELECT pg_temp.assert_true(NOT EXISTS (SELECT 1 FROM public.schedule_block_assignments assignment
  JOIN public.schedule_blocks block ON block.id = assignment.schedule_block_id
  WHERE block.template_id = pg_temp.fixture_id(73)), 'zero requirement never creates a default assignment');
SELECT pg_temp.use_actor(16);
SELECT pg_temp.assert_true(public.apply_schedule_template_week(pg_temp.fixture_id(1), pg_temp.fixture_id(76), '2026-10-19')->>'status' =
  'template-week-has-template', 'admin preserves existing template guard');
SELECT pg_temp.assert_true(public.apply_schedule_template_week(pg_temp.fixture_id(1), pg_temp.fixture_id(76), '2026-10-19', true)->>'insertedBlockCount' =
  '1', 'partial-week validity creates only the eligible day');
SELECT pg_temp.assert_true(public.apply_schedule_template_week(pg_temp.fixture_id(1), pg_temp.fixture_id(76), '2026-10-26')->>'status' =
  'template-out-of-range', 'out-of-range week is unchanged');
SELECT pg_temp.assert_true(public.apply_schedule_template_week(pg_temp.fixture_id(1), pg_temp.fixture_id(75), '2026-10-26')->>'status' =
  'template-empty', 'empty template is unchanged');
SELECT pg_temp.assert_true(public.apply_schedule_template_week(pg_temp.fixture_id(1), pg_temp.fixture_id(77), '2026-10-26')->>'status' =
  'template-not-active', 'draft template is rejected');
SELECT pg_temp.assert_true(public.apply_schedule_template_week(pg_temp.fixture_id(1), pg_temp.fixture_id(74), '2026-10-26')->>'status' =
  'invalid-template', 'foreign template cannot be applied inside this tenant');
SELECT pg_temp.expect_sqlstate(
  $$SELECT public.apply_schedule_template_week(pg_temp.fixture_id(2), pg_temp.fixture_id(74), '2026-10-26')$$,
  '42501', 'cross-tenant caller rejected');
SELECT pg_temp.expect_sqlstate(
  $$SELECT public.apply_schedule_template_week(pg_temp.fixture_id(1), pg_temp.fixture_id(71), '2026-10-27')$$,
  '22023', 'non-Monday RPC input rejected');
SELECT pg_temp.use_actor(12);
SELECT pg_temp.expect_sqlstate(
  $$SELECT public.apply_schedule_template_week(pg_temp.fixture_id(1), pg_temp.fixture_id(71), '2026-10-26')$$,
  '42501', 'coach cannot mutate schedule');
SELECT pg_temp.use_actor(13);
SELECT pg_temp.expect_sqlstate(
  $$SELECT public.apply_schedule_template_week(pg_temp.fixture_id(1), pg_temp.fixture_id(71), '2026-10-26')$$,
  '42501', 'athlete-only hub user cannot mutate BoxOps');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
INSERT INTO public.certifications (id, organization_id, title)
VALUES (pg_temp.fixture_id(101), pg_temp.fixture_id(1), 'Fixture certification');
INSERT INTO public.coach_certifications (id, organization_id, coach_profile_id, certification_id)
VALUES (pg_temp.fixture_id(102), pg_temp.fixture_id(1), pg_temp.fixture_id(61), pg_temp.fixture_id(101));
UPDATE public.class_types SET certification_id = pg_temp.fixture_id(101), requires_certification = true WHERE id = pg_temp.fixture_id(41);
SET LOCAL ROLE authenticated;
SELECT pg_temp.use_actor(11);
SELECT pg_temp.assert_true(public.apply_schedule_template_week(pg_temp.fixture_id(1), pg_temp.fixture_id(71), '2026-11-02')->>'status' =
  'applied', 'certified coach can be assigned');
UPDATE public.coach_certifications SET status = 'inactive' WHERE id = pg_temp.fixture_id(102);
SELECT pg_temp.assert_true(public.apply_schedule_template_week(pg_temp.fixture_id(1), pg_temp.fixture_id(71), '2026-11-09')->>'status' =
  'coach-missing-certification', 'inactive certification prevents application');
UPDATE public.coach_certifications SET status = 'active' WHERE id = pg_temp.fixture_id(102);
UPDATE public.coach_profiles SET status = 'inactive' WHERE id = pg_temp.fixture_id(61);
SELECT pg_temp.assert_true(public.apply_schedule_template_week(pg_temp.fixture_id(1), pg_temp.fixture_id(71), '2026-11-09')->>'status' =
  'invalid-coach', 'inactive coach prevents application');
SELECT pg_temp.assert_true(NOT EXISTS (SELECT 1 FROM public.schedule_blocks
  WHERE organization_id = pg_temp.fixture_id(1) AND service_date = '2026-11-09'), 'failed validations leave the week empty');
UPDATE public.coach_profiles SET status = 'active' WHERE id = pg_temp.fixture_id(61);
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
UPDATE public.class_types SET certification_id = NULL, requires_certification = false WHERE id = pg_temp.fixture_id(41);
INSERT INTO public.platform_admins (id, user_id, role)
VALUES (pg_temp.fixture_id(103), pg_temp.fixture_id(17), 'support');
INSERT INTO public.platform_support_sessions (id, platform_admin_id, actor_user_id, organization_id, support_scope, reason)
VALUES (pg_temp.fixture_id(104), pg_temp.fixture_id(103), pg_temp.fixture_id(17), pg_temp.fixture_id(1), 'app_support', 'Verify atomic timetable application');
SET LOCAL ROLE authenticated;
SELECT pg_temp.use_actor(17);
SELECT pg_temp.assert_true(public.apply_schedule_template_week(pg_temp.fixture_id(1), pg_temp.fixture_id(71), '2026-11-16')->>'status' =
  'applied', 'active platform support keeps operational access');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
UPDATE public.platform_support_sessions SET status = 'ended', ended_at = now() WHERE id = pg_temp.fixture_id(104);
SET LOCAL ROLE authenticated;
SELECT pg_temp.use_actor(17);
SELECT pg_temp.expect_sqlstate(
  $$SELECT public.apply_schedule_template_week(pg_temp.fixture_id(1), pg_temp.fixture_id(71), '2026-11-23')$$,
  '42501', 'ended support session has no operational access');
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT pg_temp.expect_sqlstate(
  $$SELECT public.apply_schedule_template_week(pg_temp.fixture_id(1), pg_temp.fixture_id(71), '2026-11-23')$$,
  '42501', 'missing authenticated actor is rejected');
RESET ROLE;
