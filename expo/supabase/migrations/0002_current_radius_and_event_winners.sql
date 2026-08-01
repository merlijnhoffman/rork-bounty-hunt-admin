-- Migration 0002: current_radius on event_zones + event_winners table + realtime
-- Run this in the Supabase SQL editor (Dashboard → SQL → New query).
-- Safe to re-run: uses IF NOT EXISTS / idempotent DO $$ blocks everywhere.

-- =====================================================================
-- 1. event_zones.current_radius  (CRITICAL for expanding the zone)
-- =====================================================================
-- The player app computes the live radius as:
--   currentRadius = (event_zones.current_radius != null)
--     ? event_zones.current_radius
--     : event_zones.initial_radius * (1 - narrowed_percent/100)
-- Without this column the zone can NEVER expand above initial_radius,
-- because the fallback formula only shrinks. The admin app now ALWAYS
-- writes the actual desired radius into current_radius.
ALTER TABLE event_zones ADD COLUMN IF NOT EXISTS current_radius DOUBLE PRECISION;

-- Backfill current_radius from the narrowed formula for any existing rows
-- that don't have it set yet, so the player app sees the same radius as
-- before the migration until the admin explicitly changes it.
UPDATE event_zones
SET current_radius = initial_radius * (1 - narrowed_percent / 100.0)
WHERE current_radius IS NULL;

-- =====================================================================
-- 2. event_winners table  (winner-declaration flow)
-- =====================================================================
CREATE TABLE IF NOT EXISTS event_winners (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  winner_user_id TEXT NOT NULL,
  winner_email TEXT,
  verification_code TEXT NOT NULL,
  declared_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  declare_distance_m INTEGER
);

-- One winner per event.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'event_winners_event_id_unique'
  ) THEN
    ALTER TABLE event_winners ADD CONSTRAINT event_winners_event_id_unique UNIQUE (event_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_event_winners_event ON event_winners(event_id);

ALTER TABLE event_winners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users read event winners" ON event_winners;
CREATE POLICY "Authenticated users read event winners" ON event_winners
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Service role inserts event winners" ON event_winners;
CREATE POLICY "Service role inserts event winners" ON event_winners
  FOR INSERT WITH CHECK (true);

-- =====================================================================
-- 3. Realtime publication (idempotent — avoids "already member" errors)
-- =====================================================================
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'event_zones'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE event_zones;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'bounty_locations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE bounty_locations;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'event_winners'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE event_winners;
  END IF;
END $$;
