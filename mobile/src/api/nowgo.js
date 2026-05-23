// For iOS Simulator: localhost works fine.
// For physical iPhone: replace with your machine's local IP (run `ipconfig getifaddr en0`).
const API_BASE = "http://localhost:4000";

export async function fetchTonightEvents({ lat, lng, mode = "transit", segment, radiusMiles = 10 } = {}) {
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

export async function fetchEvent(id) {
  const res = await fetch(`${API_BASE}/events/${id}`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}
