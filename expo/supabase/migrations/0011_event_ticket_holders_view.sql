-- 0011: Live Players page — real ticket holder list with emails.
--
-- The admin app's Live Players screen queried `tickets` and `profiles`
-- directly, but RLS silently filters rows the admin doesn't own (players can
-- only read their own rows), so the list always came back empty. Same fix
-- pattern as the `event_prize_pool` view: a view that runs with its owner's
-- rights (postgres) and therefore bypasses RLS on the underlying tables.
--
-- Safe to re-run: CREATE OR REPLACE VIEW.
--
-- Privacy note: any authenticated user can read this view. The player app
-- already exposes ticket counts publicly via `event_prize_pool`; emails are
-- more sensitive, so tighten this to a service-role edge function once real
-- players sign up.

CREATE OR REPLACE VIEW public.event_ticket_holders AS
SELECT
  t.id AS ticket_id,
  t.event_id,
  t.user_id,
  t.status,
  t.created_at AS claimed_at,
  COALESCE(p.email, au.email) AS email
FROM tickets t
LEFT JOIN profiles p ON p.id = t.user_id
LEFT JOIN auth.users au ON au.id = t.user_id;

GRANT SELECT ON public.event_ticket_holders TO authenticated;
REVOKE ALL ON public.event_ticket_holders FROM anon;
