import type { FetchEventsParams, Event } from "../types";

const API_BASE = "https://nowgo-production.up.railway.app";

export async function fetchTonightEvents(
  { lat, lng, mode = "transit", segment, radiusMiles = 10 }: FetchEventsParams = {}
): Promise<{ events: Event[] }> {
  const params = new URLSearchParams({ limit: "50", radius_miles: String(radiusMiles) });
  if (lat != null && lng != null) {
    params.set("lat", String(lat));
    params.set("lng", String(lng));
    params.set("mode", mode);
  }
  if (segment && segment !== "All") params.set("segment", segment);

  const res = await fetch(`${API_BASE}/events/tonight?${params}`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export async function fetchEvent(id: string): Promise<Event> {
  const res = await fetch(`${API_BASE}/events/${id}`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}
