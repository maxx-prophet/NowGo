import fetch from "node-fetch";

// ─── HAVERSINE ────────────────────────────────────────────────────────────────

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── PROVIDER 1: DISTANCE-BASED ESTIMATE ─────────────────────────────────────
// NYC-tuned speed profiles (km/h) + fixed wait overhead (minutes)

const DISTANCE_PROFILES = {
  transit:  { speedKmh: 19.3, waitMin: 6  }, // ~12 mph avg including wait & transfers
  walking:  { speedKmh:  4.8, waitMin: 0  }, // ~3 mph
  driving:  { speedKmh: 24.1, waitMin: 5  }, // ~15 mph NYC traffic + parking
  cycling:  { speedKmh: 14.5, waitMin: 2  }, // ~9 mph with lights
};

async function estimateByDistance(userLat, userLng, venueLat, venueLng, mode) {
  const profile = DISTANCE_PROFILES[mode] ?? DISTANCE_PROFILES.transit;
  const distKm = haversineKm(userLat, userLng, venueLat, venueLng);
  const driveMin = (distKm / profile.speedKmh) * 60;
  return {
    minutes: Math.round(driveMin + profile.waitMin),
    distance_km: Math.round(distKm * 10) / 10,
    source: "distance_estimate",
  };
}

// ─── PROVIDER 2: MAPBOX DIRECTIONS ───────────────────────────────────────────
// Supports: driving-traffic, walking, cycling (NOT transit)
// Requires: MAPBOX_TOKEN env var

const MAPBOX_MODES = {
  driving: "driving-traffic",
  walking: "walking",
  cycling: "cycling",
  transit: "driving-traffic", // Mapbox has no transit; fall back to driving
};

async function estimateByMapbox(userLat, userLng, venueLat, venueLng, mode) {
  const token = process.env.MAPBOX_TOKEN;
  if (!token) throw new Error("MAPBOX_TOKEN not set");

  const profile = MAPBOX_MODES[mode] ?? "driving-traffic";
  const url =
    `https://api.mapbox.com/directions/v5/mapbox/${profile}` +
    `/${userLng},${userLat};${venueLng},${venueLat}` +
    `?access_token=${token}&overview=false`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Mapbox ${res.status}: ${await res.text()}`);
  const data = await res.json();

  if (!data.routes?.length) throw new Error("Mapbox returned no routes");
  const seconds = data.routes[0].duration;
  return {
    minutes: Math.round(seconds / 60),
    distance_km: Math.round((data.routes[0].distance / 1000) * 10) / 10,
    source: "mapbox",
  };
}

// ─── PROVIDER 3: GOOGLE DISTANCE MATRIX ──────────────────────────────────────
// Supports: driving, walking, bicycling, transit (best subway data for NYC)
// Requires: GOOGLE_MAPS_KEY env var

const GOOGLE_MODES = {
  transit: "transit",
  walking: "walking",
  driving: "driving",
  cycling: "bicycling",
};

async function estimateByGoogle(userLat, userLng, venueLat, venueLng, mode, departureTime) {
  const key = process.env.GOOGLE_MAPS_KEY;
  if (!key) throw new Error("GOOGLE_MAPS_KEY not set");

  const gmMode = GOOGLE_MODES[mode] ?? "transit";
  const departure = departureTime
    ? `&departure_time=${Math.floor(new Date(departureTime).getTime() / 1000)}`
    : "&departure_time=now";

  const url =
    `https://maps.googleapis.com/maps/api/distancematrix/json` +
    `?origins=${userLat},${userLng}` +
    `&destinations=${venueLat},${venueLng}` +
    `&mode=${gmMode}${departure}&key=${key}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Google Maps ${res.status}: ${await res.text()}`);
  const data = await res.json();

  const element = data.rows?.[0]?.elements?.[0];
  if (!element || element.status !== "OK") {
    throw new Error(`Google Maps element status: ${element?.status ?? "missing"}`);
  }

  return {
    minutes: Math.round(element.duration.value / 60),
    distance_km: Math.round((element.distance.value / 1000) * 10) / 10,
    source: "google",
  };
}

// ─── AUTO-SELECT PROVIDER ─────────────────────────────────────────────────────
// Picks the best available provider in priority order:
//   transit mode → Google (best) → distance estimate
//   other modes  → Mapbox → Google → distance estimate

async function getTravelTime(userLat, userLng, venueLat, venueLng, mode = "transit", departureTime = null) {
  if (venueLat == null || venueLng == null) return null;

  const preferGoogle = mode === "transit";
  const providers = preferGoogle
    ? [
        () => estimateByGoogle(userLat, userLng, venueLat, venueLng, mode, departureTime),
        () => estimateByMapbox(userLat, userLng, venueLat, venueLng, mode),
        () => estimateByDistance(userLat, userLng, venueLat, venueLng, mode),
      ]
    : [
        () => estimateByMapbox(userLat, userLng, venueLat, venueLng, mode),
        () => estimateByGoogle(userLat, userLng, venueLat, venueLng, mode, departureTime),
        () => estimateByDistance(userLat, userLng, venueLat, venueLng, mode),
      ];

  for (const provider of providers) {
    try {
      return await provider();
    } catch {
      // try next provider
    }
  }
  return null;
}

// ─── LEAVE-BY CALCULATOR ──────────────────────────────────────────────────────

function computeLeaveBy(startTime, travelMinutes, bufferMinutes = 10) {
  if (!startTime || travelMinutes == null) return null;
  const leaveMs = new Date(startTime).getTime() - (travelMinutes + bufferMinutes) * 60_000;
  return new Date(leaveMs).toISOString();
}

export { getTravelTime, computeLeaveBy, haversineKm };
