import Constants from "expo-constants";
import type { FetchEventsParams, Event } from "../types";

const API_BASE: string =
  Constants.expoConfig?.extra?.apiUrl ?? "https://nowgo-production.up.railway.app";

const MODE_API_MAP = {
  transit: "transit",
  walk: "walking",
  drive: "driving",
} as const;

const SORT_API_MAP = {
  best: "best_match",
  soonest: "soonest",
  nearest: "nearest",
  cheapest: "cheapest",
} as const;

export async function fetchTonightEvents(
  {
    lat,
    lng,
    mode = "transit",
    segment,
    radiusMiles = 10,
    budgetMax,
    sortBy = "best",
    walkInsOnly = false,
  }: FetchEventsParams = {}
): Promise<{ events: Event[] }> {
  const params = new URLSearchParams({ limit: "50", radius_miles: String(radiusMiles) });
  if (lat != null && lng != null) {
    params.set("lat", String(lat));
    params.set("lng", String(lng));
    params.set("mode", MODE_API_MAP[mode ?? "transit"] ?? "transit");
  }
  if (segment && segment !== "All") params.set("segment", segment);
  if (budgetMax != null) params.set("budget_max", String(budgetMax));
  params.set("sort", SORT_API_MAP[sortBy ?? "best"] ?? "best_match");
  if (walkInsOnly) params.set("walk_ins_only", "true");

  const res = await fetch(`${API_BASE}/events/tonight?${params}`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export async function fetchTravel({
  fromLat, fromLng, toLat, toLng, mode = "transit", startTime,
}: {
  fromLat: number; fromLng: number; toLat: number; toLng: number;
  mode?: "transit" | "walk" | "drive"; startTime?: string;
}): Promise<{ travel_minutes: number | null; distance_km: number | null; leave_by: string | null; travel_source: string | null }> {
  const params = new URLSearchParams({
    from_lat: String(fromLat), from_lng: String(fromLng),
    to_lat: String(toLat),    to_lng: String(toLng),
    mode: MODE_API_MAP[mode],
  });
  if (startTime) params.set("start_time", startTime);
  const res = await fetch(`${API_BASE}/travel?${params}`);
  if (!res.ok) throw new Error(`Travel API error ${res.status}`);
  return res.json();
}

export async function fetchEvent(id: string): Promise<Event> {
  const res = await fetch(`${API_BASE}/events/${id}`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}
