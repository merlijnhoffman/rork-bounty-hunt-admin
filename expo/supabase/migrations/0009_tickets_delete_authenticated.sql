-- 0009: Simplify the tickets delete policy to match the other gameplay tables.
-- Every table the admin app resets (clues, event_winners, player_connections,
-- bounty_locations, hunter_locations, connection_codes) uses a plain
-- "authenticated can delete" policy and those deletes work. The email/profile
-- matching on tickets kept failing silently (RLS deletes 0 rows without
-- erroring), so tickets now uses the same pattern.
-- Safe to re-run: DROP POLICY IF EXISTS before CREATE.

ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin can delete tickets" ON tickets;
DROP POLICY IF EXISTS "Authenticated users can delete tickets" ON tickets;
CREATE POLICY "Authenticated users can delete tickets" ON tickets
  FOR DELETE TO authenticated
  USING (true);
