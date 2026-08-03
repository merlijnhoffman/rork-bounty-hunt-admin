-- Migration 0005: clue-media storage bucket + Hunter Connect tables
-- Safe to re-run: uses IF NOT EXISTS / DROP POLICY IF EXISTS everywhere.

-- =====================================================================
-- 1. CLUE MEDIA — Storage bucket
-- =====================================================================
-- The player app constructs public URLs via:
--   supabase.storage.from('clue-media').getPublicUrl(mediaUrl)
-- The bucket must be PUBLIC so getPublicUrl returns a world-readable URL.

INSERT INTO storage.buckets (id, name, public)
SELECT 'clue-media', 'clue-media', true
WHERE NOT EXISTS (
  SELECT 1 FROM storage.buckets WHERE id = 'clue-media'
);

-- Public read policy on clue-media bucket objects
DROP POLICY IF EXISTS "Public read access on clue-media" ON storage.objects;
CREATE POLICY "Public read access on clue-media"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'clue-media');

-- Authenticated users can upload to clue-media
DROP POLICY IF EXISTS "Authenticated upload to clue-media" ON storage.objects;
CREATE POLICY "Authenticated upload to clue-media"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'clue-media');

-- Authenticated users can delete from clue-media
DROP POLICY IF EXISTS "Authenticated delete from clue-media" ON storage.objects;
CREATE POLICY "Authenticated delete from clue-media"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'clue-media');

-- =====================================================================
-- 2. HUNTER CONNECT — connection_codes table
-- =====================================================================
CREATE TABLE IF NOT EXISTS connection_codes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_connection_codes_event ON connection_codes(event_id);
CREATE INDEX IF NOT EXISTS idx_connection_codes_code ON connection_codes(code);
CREATE INDEX IF NOT EXISTS idx_connection_codes_user ON connection_codes(user_id);

ALTER TABLE connection_codes ENABLE ROW LEVEL SECURITY;

-- Users can manage their own connection codes
DROP POLICY IF EXISTS "Users manage own connection codes" ON connection_codes;
CREATE POLICY "Users manage own connection codes"
  ON connection_codes FOR ALL TO authenticated
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);

-- Authenticated users can read codes for proximity validation (needed by edge function
-- which uses service role, but also for any client-side lookups)
DROP POLICY IF EXISTS "Authenticated read connection codes" ON connection_codes;
CREATE POLICY "Authenticated read connection codes"
  ON connection_codes FOR SELECT TO authenticated USING (true);

-- =====================================================================
-- 3. HUNTER CONNECT — player_connections table
-- =====================================================================
CREATE TABLE IF NOT EXISTS player_connections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  connection_key TEXT NOT NULL,
  generator_user_id TEXT NOT NULL,
  scanner_user_id TEXT NOT NULL,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  distance DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_player_connections_event ON player_connections(event_id);
CREATE INDEX IF NOT EXISTS idx_player_connections_generator ON player_connections(generator_user_id);
CREATE INDEX IF NOT EXISTS idx_player_connections_scanner ON player_connections(scanner_user_id);

-- Prevent duplicate connections between the same pair for the same event
DROP INDEX IF EXISTS idx_player_connections_unique_pair;
CREATE UNIQUE INDEX idx_player_connections_unique_pair
  ON player_connections (
    LEAST(generator_user_id, scanner_user_id),
    GREATEST(generator_user_id, scanner_user_id),
    event_id
  );

ALTER TABLE player_connections ENABLE ROW LEVEL SECURITY;

-- Users can read connections where they are either the generator or scanner
DROP POLICY IF EXISTS "Users read own connections" ON player_connections;
CREATE POLICY "Users read own connections"
  ON player_connections FOR SELECT TO authenticated
  USING (
    auth.uid()::text = generator_user_id OR
    auth.uid()::text = scanner_user_id
  );

-- Service role can insert (edge function)
DROP POLICY IF EXISTS "Service role inserts player connections" ON player_connections;
CREATE POLICY "Service role inserts player connections"
  ON player_connections FOR INSERT WITH CHECK (true);

-- =====================================================================
-- 4. REALTIME on player_connections
-- =====================================================================
-- The player app subscribes to INSERTs on player_connections to detect
-- when a connection is made and award bonus hint tokens.
ALTER TABLE player_connections REPLICA IDENTITY FULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'player_connections'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE player_connections;
  END IF;
END $$;

-- Also enable realtime on connection_codes for the player app
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'connection_codes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE connection_codes;
  END IF;
END $$;
