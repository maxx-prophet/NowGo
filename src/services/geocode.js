import fetch from "node-fetch";
import poolDefault from "../../db/index.js";

const GOOGLE_MAPS_KEY = process.env.GOOGLE_MAPS_KEY;
const GOOGLE_PLACES_BASE = "https://maps.googleapis.com/maps/api/place/textsearch/json";
const GOOGLE_DETAILS_BASE = "https://maps.googleapis.com/maps/api/place/details/json";

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

  const result = data.results?.[0];
  const location = result?.geometry?.location;
  if (!location) return null;

  const lat = Number(location.lat);
  const lng = Number(location.lng);
  if (!isWithinNYC(lat, lng)) return null;

  return {
    lat,
    lng,
    address: result.formatted_address ?? null,
    placeId: result.place_id ?? null,
  };
}

// Google returns aggregator and social pages for some venues. Those are worse
// than the generic fallback for a "buy tickets" destination, so they are
// rejected and the venue keeps a null website.
const REJECTED_WEBSITE_HOSTS = [
  "facebook.com",
  "instagram.com",
  "twitter.com",
  "x.com",
  "yelp.com",
  "tripadvisor.com",
  "google.com",
  "linktr.ee",
];

export function isUsableVenueWebsite(url) {
  if (typeof url !== "string" || !url.trim()) return false;
  let host;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return false;
  }
  return !REJECTED_WEBSITE_HOSTS.some((bad) => host === bad || host.endsWith(`.${bad}`));
}

export function extractWebsite(data) {
  const website = data?.result?.website;
  return isUsableVenueWebsite(website) ? website : null;
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

async function fetchVenueWebsite(placeId) {
  const url =
    `${GOOGLE_DETAILS_BASE}?place_id=${encodeURIComponent(placeId)}` +
    `&fields=website&key=${GOOGLE_MAPS_KEY}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Google Place Details ${res.status}: ${await res.text()}`);
  }
  return extractWebsite(await res.json());
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

        const { lat, lng, address, placeId } = coords;
        await client.query(
          `UPDATE venues
              SET geo_lat = $1,
                  geo_lng = $2,
                  address = COALESCE(address, $3),
                  place_id = COALESCE($4, place_id),
                  updated_at = now()
            WHERE venue_id = $5`,
          [lat, lng, address, placeId, venue.venue_id]
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

// Resolves venue websites so events from sources that carry no per-event link
// (currently jazz_nyc, whose scraped schedule table has none) can point at the
// venue's own site instead of a generic homepage.
//
// Scoped to venues that actually host such events — geocoding covers every
// venue, but paying for a Place Details lookup on all of them buys nothing for
// Ticketmaster and SeatGeek events, which already carry real ticket URLs.
export async function backfillVenueWebsites(pool = poolDefault, { sources = ["jazz_nyc"] } = {}) {
  if (!GOOGLE_MAPS_KEY) {
    throw new Error("GOOGLE_MAPS_KEY not set");
  }

  const client = await pool.connect();
  let total = 0;
  let resolved = 0;
  let skipped = 0;

  try {
    const { rows } = await client.query(
      `SELECT DISTINCT v.venue_id, v.name, v.place_id
         FROM venues v
         JOIN events e ON e.venue_id = v.venue_id
        WHERE v.website IS NULL
          AND e.source = ANY($1)`,
      [sources]
    );

    total = rows.length;
    if (!total) {
      console.log("  🔗 No venue websites need resolving");
      return { total, resolved, skipped };
    }

    for (const venue of rows) {
      try {
        let placeId = venue.place_id;
        if (!placeId) {
          const coords = await fetchVenueCoordinates(venue.name);
          placeId = coords?.placeId ?? null;
          await new Promise((r) => setTimeout(r, 200));
        }

        if (!placeId) {
          skipped += 1;
          console.log(`  ⚠️  No place match for ${venue.name}`);
          continue;
        }

        const website = await fetchVenueWebsite(placeId);
        if (!website) {
          skipped += 1;
          console.log(`  ⚠️  No usable website for ${venue.name}`);
          continue;
        }

        await client.query(
          `UPDATE venues SET website = $1, place_id = COALESCE(place_id, $2), updated_at = now()
            WHERE venue_id = $3`,
          [website, placeId, venue.venue_id]
        );
        resolved += 1;
        console.log(`  🔗 ${venue.name} → ${website}`);
      } catch (err) {
        skipped += 1;
        console.warn(`  ⚠️  Skipped ${venue.name}: ${err.message}`);
      } finally {
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    console.log(`  🔗 Resolved ${resolved}/${total} venue websites, skipped ${skipped}`);
    return { total, resolved, skipped };
  } finally {
    client.release();
  }
}
