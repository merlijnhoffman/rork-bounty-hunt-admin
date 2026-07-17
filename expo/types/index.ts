export interface Event {
  id: string;
  title: string | null;
  city: string;
  date: string;
  start_time: string;
  price: number;
  prize_amount: number;
  accent_color: string | null;
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
  zone_name: string | null;
  created_at: string;
  updated_at: string;
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
