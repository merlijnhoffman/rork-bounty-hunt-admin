export interface Event {
  id: string;
  title: string | null;
  city: string;
  date: string;
  start_time: string;
  price: number;
  prize_amount: number;
  accent_color: string | null;
  bounty_access_code: string | null;
  is_active: boolean;
  status: 'scheduled' | 'live' | 'completed';
  created_at: string;
  ticket_count?: number;
}

/** Preset accent colors available for events. */
export const EVENT_COLORS: readonly { label: string; hex: string }[] = [
  { label: 'Orange',  hex: '#FF6B00' },
  { label: 'Cyan',    hex: '#00D4FF' },
  { label: 'Green',   hex: '#22C55E' },
  { label: 'Pink',    hex: '#EC4899' },
  { label: 'Purple',  hex: '#A855F7' },
  { label: 'Red',     hex: '#FF3B30' },
  { label: 'Yellow',  hex: '#FFCC00' },
  { label: 'Blue',    hex: '#3B82F6' },
] as const;

/** Default accent color for new events. */
export const DEFAULT_ACCENT_COLOR = '#FF6B00';

export interface EventZone {
  event_id: string;
  center_latitude: number;
  center_longitude: number;
  initial_radius: number;
  narrowed_percent: number;
  /** Actual desired radius in meters. The player app uses this when present
   *  and only falls back to initial_radius * (1 - narrowed_percent/100) when null.
   *  Always set this on every zone update so the zone can expand above initial_radius. */
  current_radius: number | null;
  zone_name: string | null;
  created_at: string;
  updated_at: string;
}

/** A declared winner for an event. One row per event (unique constraint).
 *  Written by the declare-winner edge function (service role); admin reads only. */
export interface EventWinner {
  id: string;
  event_id: string;
  winner_user_id: string;
  winner_email: string | null;
  verification_code: string;
  declared_at: string;
  declare_distance_m: number | null;
}

/** Minimum/maximum radius the admin can set, in meters. */
export const ZONE_RADIUS_MIN = 100;
export const ZONE_RADIUS_MAX = 5000;
export const ZONE_RADIUS_STEP = 50;

/** Default initial radius for a new zone, in meters. */
export const ZONE_INITIAL_RADIUS_DEFAULT = 1000;

/**
 * Derive narrowed_percent from current_radius and initial_radius.
 * Returns 0 when expanding above initial (no narrowing). When shrinking,
 * returns (1 - current/initial) * 100, clamped to [0, 100].
 */
export function deriveNarrowedPercent(currentRadius: number, initialRadius: number): number {
  if (initialRadius <= 0) return 0;
  const pct = (1 - currentRadius / initialRadius) * 100;
  if (!Number.isFinite(pct)) return 0;
  if (pct < 0) return 0;
  if (pct > 100) return 100;
  return Math.round(pct);
}

export interface Clue {
  id: string;
  event_id: string;
  clue_text: string;
  hint?: string | null;
  order_number?: number | null;
  media_url?: string | null;
  media_type?: 'image' | 'video' | 'audio' | null;
  release_time: string;
  created_at: string;
}

export interface Ticket {
  id: string;
  user_id: string;
  event_id: string;
  verification_code: string;
  status: string;
  created_at: string;
}

export interface Profile {
  id: string;
  email: string;
  phone_number: string;
  is_admin: boolean;
  created_at: string;
  updated_at: string;
}

export interface ConnectionCode {
  id: string;
  code: string;
  user_id: string;
  event_id: string;
  latitude: number;
  longitude: number;
  expires_at: string;
  created_at: string;
}

export interface PlayerConnection {
  id: string;
  connection_key: string;
  generator_user_id: string;
  scanner_user_id: string;
  event_id: string;
  distance: number;
  created_at: string;
}

export interface PlayerWithProfile {
  ticket: Ticket;
  profile: Profile | null;
}

/** Live GPS position of the bounty person for an event. One row per event_id. */
export interface BountyLocation {
  event_id: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  heading: number | null;
  speed: number | null;
  is_active: boolean;
  updated_at: string;
  created_at: string;
}

/** Computed bounty broadcast status used by the admin UI. */
export type BountyStatus =
  | 'not_started'   // no row in bounty_locations yet
  | 'broadcasting'  // is_active && updated_at within 10 min
  | 'signal_lost'   // is_active && updated_at older than 10 min
  | 'stopped';      // is_active === false

/** Stale threshold for bounty signal-lost detection — 10 minutes per the data contract. */
export const BOUNTY_STALE_MS = 10 * 60 * 1000;

/** Ambiguous characters removed from generated access codes. */
const BOUNTY_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Generate a bounty access code in the format BOUNTY-{CITY}-{5 random alphanumeric chars}.
 * Uppercase, no ambiguous characters (O/0/I/1).
 */
export function generateBountyAccessCode(city: string): string {
  const cityPart = (city.trim() || 'ZONE')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 20) || 'ZONE';
  let suffix = '';
  for (let i = 0; i < 5; i++) {
    suffix += BOUNTY_CODE_ALPHABET[Math.floor(Math.random() * BOUNTY_CODE_ALPHABET.length)];
  }
  return `BOUNTY-${cityPart}-${suffix}`;
}

/**
 * Determine the bounty broadcast status from a BountyLocation row (or null).
 */
export function getBountyStatus(location: BountyLocation | null | undefined): BountyStatus {
  if (!location) return 'not_started';
  if (!location.is_active) return 'stopped';
  const ageMs = Date.now() - new Date(location.updated_at).getTime();
  return ageMs <= BOUNTY_STALE_MS ? 'broadcasting' : 'signal_lost';
}
