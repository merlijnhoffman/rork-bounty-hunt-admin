-- 0009: Simplify the tickets delete policy to match the other gameplay tables.
-- The email/profile matching on tickets kept failing silently (RLS deletes 0
-- rows without erroring), so tickets now uses the same plain pattern as
-- clues, event_winners, bounty_locations and hunter_locations.
-- NOTE: player_connections and connection_codes did NOT have working delete
-- policies (fixed separately in 0010) — see that migration.
-- Safe to re-run: DROP POLICY IF EXISTS before CREATE.

ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin can delete tickets" ON tickets;
DROP POLICY IF EXISTS "Authenticated users can delete tickets" ON tickets;
CREATE POLICY "Authenticated users can delete tickets" ON tickets
  FOR DELETE TO authenticated
  USING (true);
