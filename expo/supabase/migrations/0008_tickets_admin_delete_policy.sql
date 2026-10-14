-- 0008: Fix the admin delete policy on tickets.
-- The admin app grants admin when the user's profile has is_admin = true OR
-- the email is on the allowlist. The earlier policy only matched one specific
-- email, so if the admin signs in with a different admin email, the delete
-- silently removed zero rows (RLS USING filters rows without raising an
-- error) and the prize pool kept counting old hunters.
-- This policy mirrors the app's admin check exactly.
-- Safe to re-run: DROP POLICY IF EXISTS before CREATE.

ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin can delete tickets" ON tickets;
CREATE POLICY "Admin can delete tickets" ON tickets
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM profiles AS p
      WHERE p.id = auth.uid()
        AND p.is_admin IS TRUE
    )
    OR auth.email() IN ('merlijnhoffman@gmail.com')
  );
