import poolDefault from "../../db/index.js";
import { TONIGHT_WINDOW_SQL } from "./tonight-window.js";
import { WALK_IN_SQL } from "./walk-in.js";

// How many alternatives to offer a sold-out event. Small on purpose: this
// renders inline under the event, and a list long enough to scroll stops being
// an answer and becomes a second feed.
export const MAX_ALTERNATIVES = 3;

// How far we are willing to send someone whose plan just fell through.
// ~20 minutes on foot, or a couple of subway stops.
export const ALTERNATIVES_RADIUS_KM = 2.5;

// Matched on coordinates, NOT on venues.neighborhood.
//
// `neighborhood` reads like the right field and is not: it holds whatever the
// geocoder returned, which is a mix of boroughs and raw address fragments —
// 91 venues say "New York", 46 say "Manhattan", 37 say "New York, NY 10036".
// Matching on that string is too broad (half of Manhattan collapses into one
// bucket) and too narrow at once (10036 and 10019 are adjacent Midtown ZIPs
// that would never match each other). geo_lat/geo_lng are populated and clean.
export function offersAlternatives(event) {
  if (!event) return false;
  if (event.availability_tier !== "sold_out") return false;
  return event.venue_lat != null && event.venue_lng != null;
}

// Ranked, not filtered, on availability.
//
// 123 of tonight's 172 events carry tier 'unknown' — the jazz sources supply no
// availability at all — so filtering down to available/scarce would usually
// return an empty list. Instead every tier except sold_out and cancelled is
// eligible, ordered by how confident we are the user can get in:
//
//   0. available / scarce   — a ticket source says there are tickets
//   1. curated walk-in      — no tier, but the venue is known to take walk-ups
//   2. everything else      — unknown, offered last and honestly badged
//
// The bounding box mirrors the one in /events/tonight so the two agree on what
// "near" means.
//
// $1 event_id, $2 lat, $3 lng, $4 start_time, $5 radius_km, $6 limit
export const ALTERNATIVES_SQL = `
  SELECT
    e.event_id, e.source, e.name, e.start_time,
    e.segment, e.genre, e.price_min, e.price_max, e.is_free,
    e.availability_tier, e.hook,
    ${WALK_IN_SQL} AS walk_in,
    v.walk_in_policy,
    v.door_price,
    v.name         AS venue_name,
    v.address      AS venue_address,
    v.neighborhood,
    v.geo_lat      AS venue_lat,
    v.geo_lng      AS venue_lng,
    sqrt(
      power((v.geo_lat - $2) * 111.0, 2) +
      power((v.geo_lng - $3) * 111.0 * cos(radians($2)), 2)
    ) AS distance_km
  FROM events e
  JOIN venues v ON e.venue_id = v.venue_id
  WHERE ${TONIGHT_WINDOW_SQL.trim()}
    AND e.event_id != $1
    AND e.availability_tier NOT IN ('sold_out', 'cancelled')
    AND v.geo_lat IS NOT NULL
    AND v.geo_lng IS NOT NULL
    AND abs(v.geo_lat - $2) < ($5 / 111.0)
    AND abs(v.geo_lng - $3) < ($5 / (111.0 * cos(radians($2))))
  ORDER BY
    -- Same neighborhood first. Only meaningful because neighborhood is now
    -- derived from coordinates (services/neighborhoods.js) — when it held
    -- "New York" for 91 venues this clause would have been noise.
    CASE WHEN $7::text IS NOT NULL AND v.neighborhood = $7 THEN 0 ELSE 1 END,
    CASE
      WHEN e.availability_tier IN ('available', 'scarce') THEN 0
      WHEN ${WALK_IN_SQL} THEN 1
      ELSE 2
    END,
    abs(extract(epoch from (e.start_time - $4))),
    distance_km
  LIMIT $6
`;

// Never rejects. This is a side query on GET /events/:id — if it fails, the
// user should still get the event they asked for, minus the suggestions.
export async function fetchAlternatives(event, pool = poolDefault) {
  if (!offersAlternatives(event)) return [];
  try {
    const { rows } = await pool.query(ALTERNATIVES_SQL, [
      event.event_id,
      event.venue_lat,
      event.venue_lng,
      event.start_time,
      ALTERNATIVES_RADIUS_KM,
      MAX_ALTERNATIVES,
      event.neighborhood ?? null,
    ]);
    return rows;
  } catch (err) {
    console.warn(`  ⚠️  alternatives lookup failed for ${event.event_id}: ${err.message}`);
    return [];
  }
}
