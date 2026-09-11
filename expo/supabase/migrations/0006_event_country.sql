-- 0006: Add country column to events for the player app's next-hunt preview.
-- Country is an ISO 3166-1 alpha-2 code (e.g. "NL"); the player app derives
-- the flag emoji client-side from the code.

alter table events
add column if not exists country text;
