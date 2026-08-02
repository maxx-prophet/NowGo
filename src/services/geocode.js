import fetch from "node-fetch";
import poolDefault from "../../db/index.js";

const GOOGLE_MAPS_KEY = process.env.GOOGLE_MAPS_KEY;
const GOOGLE_PLACES_BASE = "https://maps.googleapis.com/maps/api/place/textsearch/json";

// Venue names from the jazz fetcher are short and ambiguous ("Birds", "Club Room",
// "Smalls"), so a text search can easily resolve to a same-named place in another
// city. A wrong coordinate is worse than a missing one: null just hides the
// "leave by" line, but a bad coord produces a confidently wrong travel time.
// Anything outside the NYC metro box is rejected and left null.
export const NYC_BOUNDS = {
  minLat: 40.45,
  maxLat: 41.0,
  minLng: -74.3,
  maxLng: -73.68,
};

export function isWithinNYC(lat, lng) {
  if (typeof lat !== "number" || typeof lng !== "number") return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return (
    lat >= NYC_BOUNDS.minLat &&
    lat <= NYC_BOUNDS.maxLat &&
    lng >= NYC_BOUNDS.minLng &&
    lng <= NYC_BOUNDS.maxLng
  );
}

// Pulls the first usable result out of a Places Text Search payload.
// Returns null (rather than throwing) for the expected "no match" cases so a
// single unmatched venue never aborts the batch.
export function extractPlace(data, venueName = "venue") {
  if (!data || data.status === "ZERO_RESULTS") return null;

  if (data.status !== "OK") {
    const message = data.error_message ? `${data.status}: ${data.error_message}` : data.status;
    throw new Error(`Google Places error for "${venueName}": ${message}`);
  }

  const location = data.results?.[0]?.geometry?.location;
  if (!location) return null;

  const lat = Number(location.lat);
  const lng = Number(location.lng);
  if (!isWithinNYC(lat, lng)) return null;

  return { lat, lng, address: data.results[0].formatted_address ?? null };
}

function buildPlacesUrl(venueName) {
  const query = `${venueName} New York NY`;
  return `${GOOGLE_PLACES_BASE}?query=${encodeURIComponent(query)}&key=${GOOGLE_MAPS_KEY}`;
}

async function fetchVenueCoordinates(venueName) {
  const res = await fetch(buildPlacesUrl(venueName));
  if (!res.ok) {
    throw new Error(`Google Maps ${res.status}: ${await res.text()}`);
  }
  return extractPlace(await res.json(), venueName);
}

export async function geocodeVenues(pool = poolDefault) {
  if (!GOOGLE_MAPS_KEY) {
    throw new Error("GOOGLE_MAPS_KEY not set");
  }

  const client = await pool.connect();
  let total = 0;
  let geocoded = 0;
  let skipped = 0;

  try {
    const result = await client.query(
      `SELECT venue_id, name FROM venues WHERE geo_lat IS NULL OR geo_lng IS NULL`
    );

    total = result.rows.length;
    if (!total) {
      console.log("  📍 No venues need geocoding");
      return { total, geocoded, skipped };
    }

    for (const venue of result.rows) {
      try {
        const coords = await fetchVenueCoordinates(venue.name);
        if (!coords) {
          skipped += 1;
          console.log(`  ⚠️  No NYC match for ${venue.name}`);
          continue;
        }

        const { lat, lng, address } = coords;
        await client.query(
          `UPDATE venues
              SET geo_lat = $1,
                  geo_lng = $2,
                  address = COALESCE(address, $3),
                  updated_at = now()
            WHERE venue_id = $4`,
          [lat, lng, address, venue.venue_id]
        );
        geocoded += 1;
        console.log(`  ✅ Geocoded ${venue.name} → ${lat}, ${lng}`);
      } catch (err) {
        skipped += 1;
        console.warn(`  ⚠️  Skipped ${venue.name}: ${err.message}`);
      } finally {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }

    console.log(`  📍 Geocoded ${geocoded}/${total} venues, skipped ${skipped}`);
    return { total, geocoded, skipped };
  } finally {
    client.release();
  }
}
