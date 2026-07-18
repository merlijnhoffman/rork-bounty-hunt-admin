// Edge function: update-bounty-location
// Deploy with: supabase functions deploy update-bounty-location --no-verify-jwt
//
// Called by the player app's Bounty Mode screen to broadcast the bounty
// person's live GPS position. Validates the access code against
// events.bounty_access_code and upserts a row in bounty_locations
// (one row per event_id).
//
// Request body:
//   {
//     accessCode: string,      // must match events.bounty_access_code
//     eventId: string,         // the event being broadcast for
//     latitude: number,
//     longitude: number,
//     accuracy?: number,
//     heading?: number,
//     speed?: number,
//     deactivate?: boolean     // set is_active = false when true
//   }
//
// The function uses the service role key (never sent to clients) so it can
// write to bounty_locations, which has no client-write RLS policy.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface UpdateBountyPayload {
  accessCode?: string;
  eventId?: string;
  latitude?: number;
  longitude?: number;
  accuracy?: number | null;
  heading?: number | null;
  speed?: number | null;
  deactivate?: boolean;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('[update-bounty-location] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return json({ error: 'Server misconfigured' }, 500);
  }

  let payload: UpdateBountyPayload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const {
    accessCode, eventId, latitude, longitude,
    accuracy = null, heading = null, speed = null,
    deactivate = false,
  } = payload;

  // Basic validation
  if (!accessCode || !eventId) {
    return json({ error: 'accessCode and eventId are required' }, 400);
  }
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return json({ error: 'latitude and longitude must be numbers' }, 400);
  }

  // Service-role client — bypasses RLS to read events and write bounty_locations.
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1. Look up the event and verify the access code + status.
  const { data: event, error: eventErr } = await supabase
    .from('events')
    .select('id, status, bounty_access_code')
    .eq('id', eventId)
    .maybeSingle();

  if (eventErr) {
    console.error('[update-bounty-location] Event lookup failed:', eventErr.message);
    return json({ error: 'Database error' }, 500);
  }
  if (!event) {
    return json({ error: 'Event not found' }, 404);
  }
  if (!event.bounty_access_code || event.bounty_access_code !== accessCode) {
    return json({ error: 'Invalid access code' }, 401);
  }
  if (event.status === 'completed') {
    return json({ error: 'Event is completed — broadcasting disabled' }, 403);
  }

  // 2. Upsert the bounty location row.
  const row = {
    event_id: eventId,
    latitude,
    longitude,
    accuracy: accuracy ?? null,
    heading: heading ?? null,
    speed: speed ?? null,
    is_active: !deactivate,
    updated_at: new Date().toISOString(),
  };

  const { error: upsertErr } = await supabase
    .from('bounty_locations')
    .upsert(row, { onConflict: 'event_id' });

  if (upsertErr) {
    console.error('[update-bounty-location] Upsert failed:', upsertErr.message);
    return json({ error: 'Failed to update location' }, 500);
  }

  return json({ ok: true, is_active: !deactivate });
});
