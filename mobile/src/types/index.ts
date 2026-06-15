export interface Event {
  event_id: string;
  name: string;
  start_time: string;
  end_time?: string | null;
  url?: string | null;
  segment?: string | null;
  genre?: string | null;
  price_min?: number | null;
  price_max?: number | null;
  is_free: boolean;
  availability_tier: string;
  venue_name?: string | null;
  venue_address?: string | null;
  neighborhood?: string | null;
  leave_by?: string | null;
  travel_minutes?: number | null;
  travel_distance_km?: number | null;
  travel_source?: string | null;
  surprise_score?: number | null;
}

export interface FetchEventsParams {
  lat?: number | null;
  lng?: number | null;
  mode?: "transit" | "walk" | "drive";
  segment?: string;
  radiusMiles?: number;
  budgetMax?: number | null;
  sortBy?: "best" | "soonest" | "nearest" | "cheapest";
  walkInsOnly?: boolean;
}

export type UserIdentity = "local" | "transplant" | "visitor";

export interface UserPreferences {
  identity: UserIdentity;
  vibes: string[];
  budgetMax: number | null; // null = no limit ($500+)
  onboardingComplete: boolean;
}
