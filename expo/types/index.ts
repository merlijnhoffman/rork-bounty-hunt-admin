export interface Event {
  id: string;
  city: string;
  date: string;
  start_time: string;
  price: number;
  prize_amount: number;
  is_active: boolean;
  status: 'scheduled' | 'live' | 'completed';
  created_at: string;
  ticket_count?: number;
}

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
