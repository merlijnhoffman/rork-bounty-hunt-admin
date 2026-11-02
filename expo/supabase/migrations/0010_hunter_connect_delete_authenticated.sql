-- 0010: Fix Reset Hunt not actually clearing Hunter Connect data.
--
-- The admin app's Reset Hunt deletes from player_connections and
-- connection_codes, but RLS blocked it silently (RLS DELETE filters rows
-- without erroring — PostgREST returns 204 as if it worked):
--   * connection_codes: the "Users manage own connection codes" FOR ALL
--     policy is USING (auth.uid()::text = user_id), so the admin — who is
--     not the row owner — matched 0 rows on delete.
--   * player_connections: had no DELETE policy at all, so 0 rows matched.
--
-- Fix: plain "authenticated can delete" policies, same pattern as the other
-- gameplay tables (clues, event_winners, bounty_locations, hunter_locations,
-- tickets via 0009). Players keep their accounts; only the per-event
-- connection rows are wiped.
-- Safe to re-run: DROP POLICY IF EXISTS before CREATE.

ALTER TABLE player_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can delete player_connections" ON player_connections;
CREATE POLICY "Authenticated users can delete player_connections" ON player_connections
  FOR DELETE TO authenticated
  USING (true);

ALTER TABLE connection_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can delete connection_codes" ON connection_codes;
CREATE POLICY "Authenticated users can delete connection_codes" ON connection_codes
  FOR DELETE TO authenticated
  USING (true);
