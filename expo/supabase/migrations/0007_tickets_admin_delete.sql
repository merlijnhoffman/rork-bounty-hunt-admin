-- 0007: Allow the admin (allowlisted email) to delete ticket rows.
-- The Reset Hunt action in the admin app clears tickets so the hunter count —
-- and the event_prize_pool summary — resets to the starting amount. The
-- tickets table was created outside migrations 0001-0006 and has no DELETE
-- policy for the admin, so the delete fails under RLS and the pool keeps
-- counting the old hunters.
-- Safe to re-run: DROP POLICY IF EXISTS before each CREATE.

ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;

-- Admin-only delete: restricted to the allowlisted admin email (matches the
-- AuthContext allowlist) so players can never delete each other's tickets.
DROP POLICY IF EXISTS "Admin can delete tickets" ON tickets;
CREATE POLICY "Admin can delete tickets" ON tickets
  FOR DELETE TO authenticated
  USING (auth.email() = 'merlijnhoffman@gmail.com');
