import poolDefault from "../../db/index.js";

// Whether you can turn up at a venue without buying ahead. Curated per venue
// in db/migrations/009_venue_walk_in.sql — no event source exposes this.
//
// Must stay in sync with that migration's CHECK constraint; walk-in.test.js
// asserts they agree.
export const WALK_IN_POLICIES = [
  "always",
  "space_permitting",
  "standby",
  "none",
  "unknown",
];

// Only these are promised to a user who filtered for walk-ins. 'standby' is a
// queue with no guarantee, so it does not qualify.
export const WALK_IN_QUALIFYING = ["always", "space_permitting"];

export function qualifiesAsWalkIn(policy) {
  return WALK_IN_QUALIFYING.includes(policy);
}

// Defined once and interpolated into SQL, the same way EVENT_URL_SQL works in
// src/server.js, so the rule cannot drift between the query and the app.
// Assumes the venues table is joined as `v` via LEFT JOIN, so an event with
// no venue_id yields no `v` row and v.walk_in_policy is SQL NULL. COALESCE to
// 'unknown' (a valid policy value) so the expression evaluates to FALSE
// instead of NULL — the API's walk_in field must always be a boolean.
export const WALK_IN_SQL = `COALESCE(v.walk_in_policy, 'unknown') IN (${WALK_IN_QUALIFYING.map((p) => `'${p}'`).join(", ")})`;

// Names venues that have events but no curation decision yet. Without this a
// new venue silently defaults to 'unknown' and never reaches the walk-ins
// filter, with nothing surfacing that a decision is owed.
export async function reportUncuratedVenues(pool = poolDefault) {
  const { rows } = await pool.query(
    `SELECT v.name, count(e.event_id) AS events
       FROM venues v
       JOIN events e ON e.venue_id = v.venue_id
      WHERE v.walk_in_policy = 'unknown'
        AND e.start_time > now()
      GROUP BY v.name
      ORDER BY count(e.event_id) DESC`
  );

  const names = rows.map((r) => r.name);
  if (names.length) {
    console.log(
      `  🚶 ${names.length} venue(s) need a walk-in decision: ${names.slice(0, 8).join(", ")}` +
        (names.length > 8 ? `, +${names.length - 8} more` : "")
    );
  } else {
    console.log("  🚶 All venues with events have a walk-in policy");
  }
  return { total: names.length, names };
}
