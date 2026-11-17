import poolDefault from "../../db/index.js";
import { ingestEvents as ingestEventsDefault } from "../../db/ingest.js";
import { matchDoNYC, GENERIC_JAZZ_URL } from "./donyc-match.js";

// ─── DoNYC INGEST ────────────────────────────────────────────────────────────
//
// Runs after the other sources are ingested, and matches against the
// *database*, not just this run's fetch. That matters on the day Ticketmaster
// 401s: its events from the last good run are still in the table, and DoNYC
// must not re-add them as duplicates just because this run's TM list is empty.
//
// The `events.source` FK means migration 018 has to be applied first. Without
// it every insert fails, so check up front and fail the stage with the reason
// instead of logging 250 identical "skipped" lines.

const SLACK_MS = 3 * 60 * 60 * 1000; // matching looks up to 2h either side

export async function ingestDoNYC(dnEvents, { pool = poolDefault, ingestEvents = ingestEventsDefault } = {}) {
  if (!dnEvents?.length) return { unique: 0, matched: 0, filled: 0, removed: 0 };

  const { rows: src } = await pool.query(`SELECT 1 FROM sources WHERE source_id = 'donyc'`);
  if (src.length === 0) {
    throw new Error("sources row 'donyc' missing — apply migration 018 (npm run migrate) before enabling DoNYC");
  }

  const times = dnEvents.map((e) => new Date(e.startTime).getTime()).filter(Number.isFinite);
  const from = new Date(Math.min(...times) - SLACK_MS);
  const to = new Date(Math.max(...times) + SLACK_MS);

  const { rows: existing } = await pool.query(
    `SELECT e.event_id, e.source, e.name, e.start_time, e.url, e.venue_id,
            e.price_min, e.price_max, e.is_free, e.availability_tier, e.segment, e.genre,
            v.name AS venue_name, v.address, v.website,
            v.geo_lat::float AS geo_lat, v.geo_lng::float AS geo_lng
       FROM events e
       LEFT JOIN venues v ON v.venue_id = e.venue_id
      WHERE e.source <> 'donyc'
        AND e.start_time >= $1 AND e.start_time < $2`,
    [from.toISOString(), to.toISOString()]
  );
  const { rows: venues } = await pool.query(
    `SELECT venue_id, name, address, website, geo_lat::float AS geo_lat, geo_lng::float AS geo_lng FROM venues`
  );

  const { unique, matched, venuesResolved } = matchDoNYC(dnEvents, existing, venues);

  // ── matched: fill blanks on the row we already have ──
  let filled = 0;
  const fillCounts = {};
  const venueFills = new Map();
  for (const { row, fills, venueFills: vf } of matched) {
    if (Object.keys(fills).length > 0) {
      // Every column is re-guarded in SQL, so a fill can never overwrite a
      // value another source wrote between our SELECT and this UPDATE.
      await pool.query(
        `UPDATE events SET
           price_min = COALESCE(price_min, $2),
           price_max = CASE WHEN price_min IS NULL THEN $3 ELSE price_max END,
           is_free   = is_free OR COALESCE($4, false),
           url       = CASE WHEN $5::text IS NOT NULL AND (url IS NULL OR url = $9) THEN $5 ELSE url END,
           availability_tier = CASE WHEN $6::text IS NOT NULL AND availability_tier = 'unknown' THEN $6 ELSE availability_tier END,
           segment   = CASE WHEN $7::text IS NOT NULL AND (segment IS NULL OR segment IN ('Undefined', 'Other')) THEN $7 ELSE segment END,
           genre     = COALESCE(genre, $8),
           updated_at = now()
         WHERE event_id = $1`,
        [
          row.event_id,
          fills.price_min ?? null,
          fills.price_max ?? null,
          fills.is_free ?? null,
          fills.url ?? null,
          fills.availability_tier ?? null,
          fills.segment ?? null,
          fills.genre ?? null,
          GENERIC_JAZZ_URL,
        ]
      );
      filled++;
      for (const k of Object.keys(fills)) fillCounts[k] = (fillCounts[k] ?? 0) + 1;
    }
    if (row.venue_id && Object.keys(vf).length > 0 && !venueFills.has(row.venue_id)) {
      venueFills.set(row.venue_id, vf);
    }
  }

  for (const [venueId, vf] of venueFills) {
    await pool.query(
      `UPDATE venues SET
         address = COALESCE(address, $2),
         geo_lat = COALESCE(geo_lat, $3),
         geo_lng = COALESCE(geo_lng, $4),
         website = COALESCE(website, $5),
         updated_at = now()
       WHERE venue_id = $1`,
      [venueId, vf.address ?? null, vf.geo_lat ?? null, vf.geo_lng ?? null, vf.website ?? null]
    );
  }

  // A DoNYC event ingested on an earlier run, before another source listed the
  // same show, is now a duplicate card. Remove it; the matched row carries on.
  let removed = 0;
  const matchedIds = matched.map((m) => m.dn.id);
  if (matchedIds.length > 0) {
    const res = await pool.query(
      `DELETE FROM events WHERE source = 'donyc' AND event_id = ANY($1::text[])`,
      [matchedIds]
    );
    removed = res.rowCount ?? 0;
  }

  // ── unique: ingest as DoNYC's own events ──
  const { ok, skipped } = await ingestEvents(unique);

  const fillStr = Object.entries(fillCounts).map(([k, v]) => `${k} ${v}`).join(", ") || "nothing to fill";
  console.log(
    `   🔀 DoNYC: ${dnEvents.length} events → ${matched.length} already listed, ${unique.length} new` +
      ` (${ok} ingested, ${skipped} skipped)`
  );
  console.log(`   🧩 Filled ${filled} existing event(s): ${fillStr}; ${venueFills.size} venue(s) completed`);
  if (venuesResolved) console.log(`   🏷  ${venuesResolved} DoNYC venue label(s) resolved to an existing venue`);
  if (removed) console.log(`   🧹 Removed ${removed} earlier DoNYC duplicate(s) now covered by another source`);

  return { unique: unique.length, ingested: ok, skipped, matched: matched.length, filled, fillCounts, removed, venuesResolved };
}
