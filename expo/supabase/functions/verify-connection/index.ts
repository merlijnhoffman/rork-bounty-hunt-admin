// Edge function: verify-connection
// Deploy with: supabase functions deploy verify-connection --no-verify-jwt
//
// Called by the player app's Hunter Connect feature when a scanner scans
// a generator's connection code. Validates the code, checks proximity,
// prevents duplicates/self-connects, and inserts a player_connections row.
//
// Request body:
//   {
//     code: string,           // the connection code the scanner scanned
//     scannerUserId: string,  // auth.uid() of the scanning player
//     scannerLatitude: number,
//     scannerLongitude: number,
//     eventId: string
//   }
//
// The function uses the service role key so it can read connection_codes
// and insert into player_connections regardless of RLS.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface VerifyConnectionPayload {
  code?: string;
  scannerUserId?: string;
  scannerLatitude?: number;
  scannerLongitude?: number;
  eventId?: string;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

/** Haversine distance in meters between two lat/lng points. */
function haversineMeters(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const MAX_PROXIMITY_M = 100;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('[verify-connection] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return json({ error: 'Server misconfigured' }, 500);
  }

  let payload: VerifyConnectionPayload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const {
    code,
    scannerUserId,
    scannerLatitude,
    scannerLongitude,
    eventId,
  } = payload;

  if (!code || !scannerUserId || !eventId) {
    return json({ error: 'code, scannerUserId, and eventId are required' }, 400);
  }
  if (typeof scannerLatitude !== 'number' || typeof scannerLongitude !== 'number') {
    return json({ error: 'scannerLatitude and scannerLongitude must be numbers' }, 400);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1. Look up the connection code.
  const { data: codeRow, error: codeErr } = await supabase
    .from('connection_codes')
    .select('*')
    .eq('code', code)
    .eq('event_id', eventId)
    .maybeSingle();

  if (codeErr) {
    console.error('[verify-connection] Code lookup failed:', codeErr.message);
    return json({ error: 'Database error' }, 500);
  }
  if (!codeRow) {
    return json({ error: 'Invalid or expired connection code' }, 404);
  }

  // 2. Check expiry.
  const expiresAt = new Date(codeRow.expires_at);
  if (expiresAt.getTime() < Date.now()) {
    return json({ error: 'This connection code has expired' }, 410);
  }

  // 3. Prevent self-connect.
  const generatorUserId = codeRow.user_id;
  if (generatorUserId === scannerUserId) {
    return json({ error: 'You cannot connect with your own code' }, 400);
  }

  // 4. Verify the scanner has a valid ticket for this event.
  const { data: ticket, error: ticketErr } = await supabase
    .from('tickets')
    .select('id, status')
    .eq('event_id', eventId)
    .eq('user_id', scannerUserId)
    .maybeSingle();

  if (ticketErr) {
    console.error('[verify-connection] Ticket lookup failed:', ticketErr.message);
    return json({ error: 'Database error' }, 500);
  }
  if (!ticket) {
    return json({ error: 'You do not have a ticket for this event' }, 403);
  }

  // 5. Proximity check — scanner must be within 100m of the generator.
  const distance = haversineMeters(
    scannerLatitude, scannerLongitude,
    codeRow.latitude, codeRow.longitude,
  );
  if (distance > MAX_PROXIMITY_M) {
    return json({
      error: `Too far away — you are ${Math.round(distance)}m from the connection. Maximum is ${MAX_PROXIMITY_M}m.`,
    }, 403);
  }

  // 6. Prevent duplicate connections between the same pair for this event.
  const { data: existing, error: dupErr } = await supabase
    .from('player_connections')
    .select('id')
    .eq('event_id', eventId)
    .or(
      `and(generator_user_id.eq.${generatorUserId},scanner_user_id.eq.${scannerUserId}),` +
      `and(generator_user_id.eq.${scannerUserId},scanner_user_id.eq.${generatorUserId})`
    )
    .maybeSingle();

  if (dupErr) {
    console.error('[verify-connection] Duplicate check failed:', dupErr.message);
    return json({ error: 'Database error' }, 500);
  }
  if (existing) {
    return json({ error: 'You are already connected with this player', ok: true, duplicate: true });
  }

  // 7. Insert the connection record.
  const connectionKey = `${generatorUserId.slice(0, 4)}-${scannerUserId.slice(0, 4)}-${Date.now().toString(36)}`;
  const { error: insertErr } = await supabase
    .from('player_connections')
    .insert({
      connection_key: connectionKey,
      generator_user_id: generatorUserId,
      scanner_user_id: scannerUserId,
      event_id: eventId,
      distance: Math.round(distance),
    });

  if (insertErr) {
    // Could be a race condition duplicate — check if it's a unique violation
    if (insertErr.message.includes('duplicate') || insertErr.message.includes('unique')) {
      return json({ error: 'You are already connected with this player', ok: true, duplicate: true });
    }
    console.error('[verify-connection] Insert failed:', insertErr.message);
    return json({ error: 'Failed to create connection' }, 500);
  }

  return json({
    ok: true,
    connection: {
      generator_user_id: generatorUserId,
      scanner_user_id: scannerUserId,
      distance: Math.round(distance),
    },
  });
});
