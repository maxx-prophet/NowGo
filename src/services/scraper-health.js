import poolDefault from "../../db/index.js";
import { captureServerEvent } from "./posthog.js";

// Is the jazz-nyc scraper still bringing in the venues it usually does?
//
// "Zero results" is the wrong check. When jazz-nyc.com stopped filling the
// area column on 2026-09-17 the fetcher still returned 56 events; it had just
// lost Smalls, Mezzrow, Jazzcultural and Arthur's Tavern, and nobody noticed
// for three days. What went missing was venues, so that is what this looks
// for: a venue with jazz-nyc events on five or more of the last seven days
// that has nothing upcoming is a venue the scraper has lost, not a venue
// that is dark tonight. It also has to have played this weekday last week:
// Bar Bayeux is open Tuesday to Saturday, and on a Sunday "nothing upcoming"
// is its week, not a scraper fault. Replayed against 2026-09-19 this names
// Smalls, Mezzrow and Jazzcultural and nothing else that was open.
//
// The result goes to PostHog as `scraper_health` on every run, healthy or
// not, so the alert there can fire on a bad value and on silence alike.

const NEAR_DAILY_DAYS = 5;

const QUIET_VENUES_SQL = `
  WITH today AS (
    SELECT (now() AT TIME ZONE 'America/New_York')::date AS d
  ),
  recent AS (
    SELECT e.venue_id,
           count(DISTINCT (e.start_time AT TIME ZONE 'America/New_York')::date) AS active_days,
           bool_or((e.start_time AT TIME ZONE 'America/New_York')::date
                   IN (today.d - 7, today.d - 6)) AS played_this_weekday
      FROM events e, today
     WHERE e.source = 'jazz_nyc'
       AND e.start_time >= now() - interval '7 days'
       AND e.start_time <  now()
     GROUP BY e.venue_id
  )
  SELECT v.name, r.active_days::int
    FROM recent r
    JOIN venues v ON v.venue_id = r.venue_id
   WHERE r.active_days >= $1
     AND r.played_this_weekday
     AND NOT EXISTS (
       SELECT 1 FROM events u
        WHERE u.venue_id = r.venue_id
          AND u.source = 'jazz_nyc'
          AND u.start_time >= now()
     )
   ORDER BY r.active_days DESC, v.name`;

export async function checkScraperHealth({
  pool = poolDefault,
  fetchStats = {},
  capture = captureServerEvent,
  log = console.log,
} = {}) {
  const stats = fetchStats.jazz_nyc ?? {};
  const base = {
    source: "jazz_nyc",
    events: stats.events ?? null,
    rows: stats.rows ?? null,
    kept_no_area: stats.keptNoArea ?? null,
    skipped_no_time: stats.skippedNoTime ?? null,
  };

  let missing = [];
  let status;
  let error = null;
  try {
    const { rows } = await pool.query(QUIET_VENUES_SQL, [NEAR_DAILY_DAYS]);
    missing = rows.map((r) => r.name);
    status = stats.events === 0 ? "empty" : missing.length ? "degraded" : "ok";
  } catch (err) {
    status = "error";
    error = err.message;
  }

  if (status === "ok") {
    log(`  🩺 jazz-nyc scraper: ok (${stats.events} events)`);
  } else if (status === "degraded") {
    log(`  🩺 jazz-nyc scraper: DEGRADED — nothing upcoming for ${missing.join(", ")}`);
  } else if (status === "empty") {
    log("  🩺 jazz-nyc scraper: EMPTY — zero events");
  } else {
    log(`  🩺 jazz-nyc scraper: health check failed — ${error}`);
  }

  await capture("scraper_health", {
    ...base,
    status,
    missing_count: missing.length,
    missing_venues: missing,
    ...(error ? { error } : {}),
  });

  return { status, missing, error };
}
