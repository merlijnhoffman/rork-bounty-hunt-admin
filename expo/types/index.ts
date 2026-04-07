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
  zone_latitude?: number | null;
  zone_longitude?: number | null;
  zone_radius?: number | null;
  ticket_count?: number;
}

export interface Clue {
  id: string;
  event_id: string;
  clue_text: string;
  media_url?: string | null;
  media_type?: 'image' | 'video' | 'audio' | null;
  release_time: string;
  created_at: string;
  zone_latitude?: number | null;
  zone_longitude?: number | null;
  zone_radius?: number | null;
  zone_name?: string | null;
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
