-- BoxOps - I.21 overtime candidate retention guard
-- Allows the operational retention window to follow the latest review/closure.

ALTER TABLE public.overtime_candidates
  DROP CONSTRAINT IF EXISTS overtime_candidates_retain_window;

ALTER TABLE public.overtime_candidates
  ADD CONSTRAINT overtime_candidates_retain_window
  CHECK (
    retain_until > created_at
    AND retain_until <= GREATEST(
      created_at,
      COALESCE(reviewed_at, created_at),
      COALESCE(closed_at, created_at)
    ) + interval '24 months' + interval '1 day'
  );
