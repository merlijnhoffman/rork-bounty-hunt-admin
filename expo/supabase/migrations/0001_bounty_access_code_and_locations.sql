-- Migration: Add bounty_access_code column and bounty_locations table
-- Run this in the Supabase SQL editor (Dashboard → SQL → New query)
-- Safe to re-run: uses IF NOT EXISTS everywhere.

-- 1. Add bounty_access_code column to events table
ALTER TABLE events ADD COLUMN IF NOT EXISTS bounty_access_code TEXT;

-- 2. Create bounty_locations table (stores the bounty's live GPS position)
CREATE TABLE IF NOT EXISTS bounty_locations (
  event_id TEXT PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  accuracy DOUBLE PRECISION,
  heading DOUBLE PRECISION,
  speed DOUBLE PRECISION,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Enable realtime on bounty_locations
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'bounty_locations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE bounty_locations;
  END IF;
END $$;

-- 4. Enable RLS on bounty_locations
ALTER TABLE bounty_locations ENABLE ROW LEVEL SECURITY;

-- 5. RLS policy: authenticated users can read bounty locations
DROP POLICY IF EXISTS "Authenticated users read bounty locations" ON bounty_locations;
CREATE POLICY "Authenticated users read bounty locations" ON bounty_locations
  FOR SELECT TO authenticated USING (true);

-- 6. Restrict writes to events.bounty_access_code to the service role only.
--    (Admin app writes via the service role / edge function; authenticated
--    users such as the bounty person never write it directly.)
-- NOTE: If you already have permissive UPDATE policies on events, add the
-- following tighter policy and drop the broad one. Otherwise, leave as-is.
-- Example (uncomment if no existing UPDATE policy on events):
-- DROP POLICY IF EXISTS "Service role can update bounty_access_code" ON events;
-- CREATE POLICY "Service role can update bounty_access_code" ON events
--   FOR UPDATE TO service_role USING (true) WITH CHECK (true);
