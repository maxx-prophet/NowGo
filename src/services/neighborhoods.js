import poolDefault from "../../db/index.js";

// Real neighborhood names, derived from coordinates.
//
// No fetcher supplies one. Ticketmaster writes venue.city.name ("New York",
// "Manhattan"), SeatGeek writes venue.extended_address ("New York, NY 10036"),
// and jazz-nyc supplies only a borough code. That is why venues.neighborhood
// held 91 rows of "New York" and 37 of "New York, NY 10036" — it reads like a
// neighborhood field and never was one.
//
// geo_lat/geo_lng are populated and trustworthy (geocode.js rejects anything
// outside the NYC metro box), so the neighborhood is computed from them by
// nearest centroid. No shapefile, no API call, no pipeline cost — the tradeoff
// is that a venue within a block of a boundary can land on the wrong side. For
// a display label and a "what else is near here" grouping, that is acceptable;
// for anything that must be exactly right, use the coordinates directly.
//
// Centroids are dense enough that the nearest one is nearly always the right
// one. A venue further than MAX_MATCH_KM from every centroid gets null rather
// than a confidently wrong label.

export const MAX_MATCH_KM = 3;

// [name, lat, lng]
export const NEIGHBORHOOD_CENTROIDS = [
  // ─── Manhattan, south to north ──────────────────────────────────────────
  ["Financial District",   40.7075, -74.0113],
  ["Battery Park City",    40.7115, -74.0161],
  ["Tribeca",              40.7180, -74.0080],
  ["Chinatown",            40.7158, -73.9970],
  ["Lower East Side",      40.7176, -73.9857],
  ["Bowery",               40.7206, -73.9936],
  ["SoHo",                 40.7243, -74.0018],
  ["Nolita",               40.7228, -73.9948],
  ["East Village",         40.7275, -73.9838],
  ["NoHo",                 40.7280, -73.9930],
  ["Greenwich Village",    40.7308, -73.9973],
  ["West Village",         40.7358, -74.0043],
  ["Meatpacking District", 40.7409, -74.0080],
  ["Union Square",         40.7359, -73.9911],
  ["Gramercy",             40.7368, -73.9845],
  ["Flatiron",             40.7401, -73.9903],
  ["Chelsea",              40.7465, -74.0014],
  ["Murray Hill",          40.7479, -73.9756],
  ["Koreatown",            40.7478, -73.9866],
  ["Hell's Kitchen",       40.7638, -73.9918],
  ["Theater District",     40.7590, -73.9855],
  ["Midtown East",         40.7549, -73.9707],
  ["Lincoln Square",       40.7736, -73.9840],
  ["Upper West Side",      40.7870, -73.9754],
  ["Upper East Side",      40.7736, -73.9566],
  ["Morningside Heights",  40.8090, -73.9626],
  ["East Harlem",          40.7957, -73.9389],
  ["Harlem",               40.8116, -73.9465],
  ["Hamilton Heights",     40.8252, -73.9496],
  ["Washington Heights",   40.8417, -73.9393],
  ["Inwood",               40.8677, -73.9212],

  // ─── Brooklyn ───────────────────────────────────────────────────────────
  ["Greenpoint",           40.7304, -73.9540],
  ["Williamsburg",         40.7081, -73.9571],
  ["East Williamsburg",    40.7160, -73.9330],
  ["Bushwick",             40.6944, -73.9213],
  ["Bedford-Stuyvesant",   40.6872, -73.9418],
  ["DUMBO",                40.7033, -73.9881],
  ["Brooklyn Heights",     40.6960, -73.9933],
  ["Downtown Brooklyn",    40.6928, -73.9857],
  ["Fort Greene",          40.6892, -73.9740],
  ["Clinton Hill",         40.6884, -73.9657],
  ["Prospect Heights",     40.6774, -73.9668],
  ["Crown Heights",        40.6694, -73.9442],
  ["Park Slope",           40.6710, -73.9814],
  ["Gowanus",              40.6740, -73.9890],
  ["Carroll Gardens",      40.6795, -73.9990],
  ["Cobble Hill",          40.6866, -73.9959],
  ["Red Hook",             40.6751, -74.0089],
  ["Sunset Park",          40.6455, -74.0122],
  ["Flatbush",             40.6409, -73.9624],
  ["Bay Ridge",            40.6264, -74.0299],
  ["Coney Island",         40.5755, -73.9707],

  // ─── Queens ─────────────────────────────────────────────────────────────
  ["Long Island City",     40.7447, -73.9485],
  ["Astoria",              40.7644, -73.9235],
  ["Sunnyside",            40.7433, -73.9196],
  ["Woodside",             40.7454, -73.9057],
  ["Ridgewood",            40.7043, -73.9018],
  ["Jackson Heights",      40.7557, -73.8831],
  ["Corona",               40.7449, -73.8626],
  ["Forest Hills",         40.7196, -73.8448],
  ["Flushing",             40.7674, -73.8330],

  // ─── Bronx ──────────────────────────────────────────────────────────────
  ["Mott Haven",           40.8091, -73.9229],
  ["Concourse",            40.8300, -73.9230],
  ["Belmont",              40.8543, -73.8869],
  ["Fordham",              40.8621, -73.8918],
  ["Riverdale",            40.8899, -73.9124],

  // ─── Staten Island ──────────────────────────────────────────────────────
  ["St. George",           40.6437, -74.0765],
  ["Stapleton",            40.6270, -74.0776],

  // ─── Across the Hudson ──────────────────────────────────────────────────
  // Inside geocode.js's NYC_BOUNDS, and real venues sit here — Rutherford
  // alone has 5, and the Williams Center is one of the shared-address rooms
  // CLAUDE.md warns against merging.
  ["Hoboken",              40.7440, -74.0324],
  ["Jersey City",          40.7178, -74.0431],
  ["Newark",               40.7357, -74.1724],
  ["Rutherford",           40.8265, -74.1071],
  ["East Rutherford",      40.8135, -74.0745],  // MetLife, Meadowlands, American Dream
  ["Secaucus",             40.7895, -74.0565],  // Meadowlands Expo Center
  ["Englewood",            40.8929, -73.9726],  // Bergen PAC
];

// Equirectangular approximation. Over a few km at NYC's latitude the error is
// far below the width of a neighborhood, and it avoids a trig-heavy haversine
// in a function called once per venue.
export function distanceKm(lat1, lng1, lat2, lng2) {
  const latKm = (lat1 - lat2) * 111.0;
  const lngKm = (lng1 - lng2) * 111.0 * Math.cos((lat1 * Math.PI) / 180);
  return Math.sqrt(latKm * latKm + lngKm * lngKm);
}

// Recomputes venues.neighborhood from coordinates.
//
// The column is fully derived, so this overwrites rather than COALESCEs — that
// is the point. It is what replaces the "New York" / "New York, NY 10036"
// values the fetchers used to write, and it must run after geocoding, because
// a venue with no coordinates yet cannot be placed.
//
// Pure arithmetic, no external calls: safe to run on every pipeline pass.
export async function backfillNeighborhoods(pool = poolDefault) {
  const { rows } = await pool.query(
    `SELECT venue_id, name, neighborhood, geo_lat, geo_lng
       FROM venues
      WHERE geo_lat IS NOT NULL AND geo_lng IS NOT NULL`
  );

  const changed = [];
  for (const v of rows) {
    const derived = neighborhoodFor(Number(v.geo_lat), Number(v.geo_lng));
    if (derived !== v.neighborhood) {
      changed.push({ venue_id: v.venue_id, from: v.neighborhood, to: derived });
    }
  }

  if (!changed.length) {
    console.log(`  🗺️  Neighborhoods already current for ${rows.length} venues`);
    return { total: rows.length, updated: 0, unplaced: 0 };
  }

  // One round trip rather than one per venue — the pipeline is already slow
  // enough that a few hundred sequential UPDATEs would be noticeable.
  await pool.query(
    `UPDATE venues AS v
        SET neighborhood = d.neighborhood, updated_at = now()
       FROM unnest($1::uuid[], $2::text[]) AS d(venue_id, neighborhood)
      WHERE v.venue_id = d.venue_id`,
    [changed.map((c) => c.venue_id), changed.map((c) => c.to)]
  );

  const unplaced = changed.filter((c) => c.to === null).length;
  console.log(
    `  🗺️  Neighborhoods: updated ${changed.length}/${rows.length} venues` +
      (unplaced ? `, ${unplaced} too far from any centroid to place` : "")
  );
  return { total: rows.length, updated: changed.length, unplaced };
}

// Returns the neighborhood name, or null when the point is too far from every
// known centroid to label honestly.
export function neighborhoodFor(lat, lng) {
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  let best = null;
  let bestKm = Infinity;
  for (const [name, cLat, cLng] of NEIGHBORHOOD_CENTROIDS) {
    const km = distanceKm(lat, lng, cLat, cLng);
    if (km < bestKm) {
      bestKm = km;
      best = name;
    }
  }
  return bestKm <= MAX_MATCH_KM ? best : null;
}
