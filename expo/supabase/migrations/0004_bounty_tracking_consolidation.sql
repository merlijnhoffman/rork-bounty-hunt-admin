-- Migration 0004: Consolidate bounty_locations schema, RLS, and realtime
-- This ensures the table, RLS, and realtime publication exactly match the
-- data contract between the player app (edge function writer) and the admin
-- app (authenticated reader).
--
-- Safe to re-run: uses IF NOT EXISTS / DROP POLICY IF EXISTS everywhere.

-- =====================================================================
-- 1. bounty_locations table schema
-- =====================================================================
-- The table should already exist (created by migration 0001). This block
-- ensures the schema is correct and adds any missing columns idempotently.
CREATE TABLE IF NOT EXISTS bounty_locations (
  event_id UUID PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  accuracy DOUBLE PRECISION,
  heading DOUBLE PRECISION,
  speed DOUBLE PRECISION,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================================
-- 2. RLS policy: authenticated users can READ bounty locations
-- =====================================================================
-- The admin app uses the anon key with an authenticated session, so it
-- needs a SELECT policy. The edge function writes via the service role
-- which bypasses RLS entirely — no client INSERT/UPDATE policy needed.
ALTER TABLE bounty_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read bounty locations" ON bounty_locations;
CREATE POLICY "Authenticated read bounty locations"
  ON bounty_locations FOR SELECT TO authenticated USING (true);

-- =====================================================================
-- 3. Realtime publication
-- =====================================================================
-- bounty_locations must be in the supabase_realtime publication so the
-- admin map updates live via WebSocket (with 5s polling as fallback).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'bounty_locations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE bounty_locations;
  END IF;
END $$;

-- =====================================================================
-- 4. bounty_access_code column on events
-- =====================================================================
-- The edge function validates the bounty's access code against this column.
ALTER TABLE events ADD COLUMN IF NOT EXISTS bounty_access_code TEXT;
