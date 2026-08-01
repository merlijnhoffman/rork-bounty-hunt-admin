-- Migration 0003: Add missing RLS policies on event_zones
-- The admin app writes to event_zones as an authenticated user (anon key + session).
-- RLS was enabled on the table but no INSERT/UPDATE/SELECT policies existed for
-- authenticated users, causing: "new row violates row-level security policy".
-- Safe to re-run: uses DROP POLICY IF EXISTS before each CREATE.

-- Ensure RLS is enabled (idempotent)
ALTER TABLE event_zones ENABLE ROW LEVEL SECURITY;

-- SELECT: authenticated admin users can read zone data
DROP POLICY IF EXISTS "Authenticated users can read event_zones" ON event_zones;
CREATE POLICY "Authenticated users can read event_zones" ON event_zones
  FOR SELECT TO authenticated USING (true);

-- INSERT: authenticated admin users can create zone rows
DROP POLICY IF EXISTS "Authenticated users can insert event_zones" ON event_zones;
CREATE POLICY "Authenticated users can insert event_zones" ON event_zones
  FOR INSERT TO authenticated WITH CHECK (true);

-- UPDATE: authenticated admin users can update zone rows
DROP POLICY IF EXISTS "Authenticated users can update event_zones" ON event_zones;
CREATE POLICY "Authenticated users can update event_zones" ON event_zones
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- DELETE: authenticated admin users can delete zone rows (e.g. when event is deleted)
DROP POLICY IF EXISTS "Authenticated users can delete event_zones" ON event_zones;
CREATE POLICY "Authenticated users can delete event_zones" ON event_zones
  FOR DELETE TO authenticated USING (true);
