import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RouteProp } from "@react-navigation/native";

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
  walk_in?: boolean | null;
  // The curated venue policy behind `walk_in`, which is only a boolean and so
  // cannot tell "just turn up" apart from "if there's room". door_price is the
  // walk-in price, not the advance one, and is deliberately null when the
  // cover varies by night. Arrives as a numeric string from Postgres.
  walk_in_policy?: string | null;
  door_price?: string | number | null;
  hook?: string | null;
  venue_lat?: number | null;
  venue_lng?: number | null;
  // Only sent by GET /events/:id, and only for a sold-out event: up to three
  // things nearby tonight you can still get into. Absent everywhere else.
  alternatives?: Event[] | null;
}

export interface TonightFeedResponse {
  count: number;
  events: Event[];
  // Sold-out events are returned separately rather than mixed into `events`,
  // so the feed stays a list of things you can actually go to. Absent when the
  // request asked for surprise_me or include_sold_out.
  sold_out_events?: Event[];
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
  surpriseMe?: boolean;
}

export type UserIdentity = "local" | "transplant" | "visitor";

export interface UserPreferences {
  identity: UserIdentity;
  vibes: string[];
  budgetMax: number | null; // null = no limit ($500+)
  onboardingComplete: boolean;
}

export type TravelMode = "transit" | "walk" | "drive";

export type RootStackParamList = {
  TonightFeed: undefined;
  EventDetail: {
    event: Event;
    userLat: number | null;
    userLng: number | null;
    initialMode: TravelMode;
  };
  Filters: {
    mode: TravelMode;
    onApply: (mode: TravelMode) => void;
  };
};

export type OnboardingStackParamList = {
  Welcome: undefined;
  Identity: undefined;
  Vibe: undefined;
  Budget: undefined;
  Ready: undefined;
};

// Convenience prop types for app screens
export type AppNavProp<S extends keyof RootStackParamList> =
  NativeStackNavigationProp<RootStackParamList, S>;
export type AppRouteProp<S extends keyof RootStackParamList> =
  RouteProp<RootStackParamList, S>;

// Convenience prop types for onboarding screens
export type OnboardingNavProp<S extends keyof OnboardingStackParamList> =
  NativeStackNavigationProp<OnboardingStackParamList, S>;
