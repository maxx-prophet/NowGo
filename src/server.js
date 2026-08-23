import express from "express";
import dotenv from "dotenv";
import pool from "../db/index.js";
import { startScheduler, runPipeline } from "./scheduler.js";
import { getTravelTime, computeLeaveBy } from "./services/travel.js";
import { rankEvents, RANKING_POOL } from "./services/ranking.js";
import { fetchAlternatives } from "./services/alternatives.js";
import { TONIGHT_WINDOW_SQL } from "./services/tonight-window.js";
import { WALK_IN_SQL, fetchUncuratedVenues } from "./services/walk-in.js";
import { NOT_ATTRACTION_SQL } from "./services/venue-type.js";
import { checkPipelineToken } from "./services/pipeline-auth.js";
import { renderUncuratedVenuesPage } from "./views/uncurated-venues.js";
dotenv.config({ path: ".env.nowgo" });

// Sold-out events are a footnote to the feed, not a second feed. Capped
// independently of `limit` so a night with many of them cannot bloat the
// response.
const SOLD_OUT_LIMIT = 10;

const app = express();
const PORT = process.env.PORT ?? 3000;

// The jazz-nyc source is a scraped schedule table with no per-event links, so
// every event it produces carries this same homepage URL. Where we have
// resolved the venue's own site (see services/geocode.js) we serve that
// instead, which for the jazz clubs is usually where tickets are actually
// sold — Smalls and Mezzrow both resolve to smallslive.com.
const GENERIC_EVENT_URL = "https://www.jazz-nyc.com";
const EVENT_URL_SQL = `COALESCE(NULLIF(e.url, '${GENERIC_EVENT_URL}'), v.website, e.url)`;

app.use(express.json());

// ─── HEALTH ──────────────────────────────────────────────────────────────────

app.get("/health", (req, res) => {
  res.json({ status: "ok", ts: new Date().toISOString() });
});

// ─── POST /pipeline/run ───────────────────────────────────────────────────────

// Requires `Authorization: Bearer $PIPELINE_TOKEN`. Every call spends
// Ticketmaster, SeatGeek and Google Places quota, so an open route was a
// standing invitation to run up the bill.
//
// Refuses when PIPELINE_TOKEN is unset rather than falling back to open. The
// scheduler calls runPipeline() in process, so scheduled ingestion is
// unaffected either way — only the manual trigger needs the token.
app.post("/pipeline/run", async (req, res) => {
  const auth = checkPipelineToken(req.get("authorization"), process.env.PIPELINE_TOKEN);
  if (!auth.ok) {
    console.warn(`\u26a0\ufe0f  Rejected /pipeline/run (${auth.status}) from ${req.ip}`);
    return res.status(auth.status).json({ error: auth.error });
  }
  res.json({ status: "started", ts: new Date().toISOString() });
  runPipeline(); // runs async in background
});

// ─── GET /sources ─────────────────────────────────────────────────────────────

app.get("/sources", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT source_id, display_name, api_base_url, last_fetched_at, is_active
       FROM sources ORDER BY source_id`
    );
    res.json({ sources: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /venues/uncurated ───────────────────────────────────────────────────
// The curation worklist as a page you can bookmark. reportUncuratedVenues()
// logs the same set after every pipeline run, but a line in the Railway deploy
// log is not somewhere anyone checks daily, so the reminder went unread.
//
// Read-only on purpose. Writing a policy from here would need auth — the whole
// walk-ins filter is downstream of this data, and POST /pipeline/run is the
// only mutating route, now behind PIPELINE_TOKEN.
//
// ?format=json returns the rows instead of the page.

app.get("/venues/uncurated", async (req, res) => {
  try {
    const venues = await fetchUncuratedVenues();

    if (req.query.format === "json") {
      return res.json({ count: venues.length, venues });
    }

    res
      .type("html")
      // Curation changes land in the DB by hand and the pipeline runs four
      // times a day; a cached page would show a stale worklist.
      .set("Cache-Control", "no-store")
      .send(renderUncuratedVenuesPage(venues));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /events/tonight ──────────────────────────────────────────────────────
// Query params:
//   lat, lng        — user location (decimal degrees)
//   radius_miles    — default 10
//   limit           — default 50, max 200
//   segment         — filter by segment (Music, Sports, etc.)
//   mode            — transit (default), walking, driving, cycling
//   buffer_minutes  — minutes of buffer before event start, default 10
//   sort            — best_match (default) | soonest | nearest | cheapest | surprise
//   budget          — max price user wants to pay (used in best_match scoring)
//   surprise_me     — true: return top 5 available events starting in 30–90 min
//   include_sold_out — true: include sold-out events (default false)
//   include_attractions — true: include museums and other timed-entry venues,
//                     which are excluded by default (see services/venue-type.js)

app.get("/events/tonight", async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);
  const radiusMiles = parseFloat(req.query.radius_miles) || 10;
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const segment = req.query.segment ?? null;
  const mode = req.query.mode ?? "transit";
  const bufferMinutes = parseInt(req.query.buffer_minutes) || 10;
  const sort = req.query.sort ?? "best_match";
  const budget = req.query.budget != null ? parseFloat(req.query.budget) : null;
  const surpriseMe = req.query.surprise_me === "true";
  const includeSoldOut = req.query.include_sold_out === "true";
  const hasGeo = !isNaN(lat) && !isNaN(lng);
  const budgetMax = req.query.budget_max != null ? parseFloat(req.query.budget_max) : null;
  const walkInsOnly = req.query.walk_ins_only === "true";
  const includeAttractions = req.query.include_attractions === "true";

  try {
    let query, params;

    if (hasGeo) {
      query = `
        SELECT
          e.event_id, e.source, e.name, e.start_time,
          ${EVENT_URL_SQL} AS url,
          e.segment, e.genre, e.price_min, e.price_max, e.is_free,
          e.availability_tier, e.last_checked_at, e.surprise_score,
          ${WALK_IN_SQL} AS walk_in,
          v.walk_in_policy,
          v.door_price,
          e.hook,
          v.name        AS venue_name,
          v.address     AS venue_address,
          v.neighborhood,
          v.geo_lat AS venue_lat,
          v.geo_lng AS venue_lng,
          0 AS distance_m
        FROM events e
        LEFT JOIN venues v ON e.venue_id = v.venue_id
        WHERE ${TONIGHT_WINDOW_SQL.trim()}
          AND e.availability_tier != 'cancelled'
           ${walkInsOnly ? `AND ${WALK_IN_SQL}` : ""}
           ${includeAttractions ? "" : `AND ${NOT_ATTRACTION_SQL}`}
          AND ($5::text IS NULL OR e.segment = $5 OR ($5 = 'Jazz' AND e.genre = 'Jazz') OR ($5 = 'Comedy' AND e.genre = 'Comedy') OR ($5 = 'Theatre' AND e.segment = 'Arts & Theatre'))
          AND (v.geo_lat IS NULL OR (
            abs(v.geo_lat - $1) < ($3 / 111.0)
            AND abs(v.geo_lng - $2) < ($3 / (111.0 * cos(radians(v.geo_lat))))
          ))
        ORDER BY distance_m ASC NULLS LAST, e.start_time ASC
        LIMIT $4`;
      params = [lat, lng, radiusMiles, RANKING_POOL, segment];
    } else {
      query = `
        SELECT
          e.event_id, e.source, e.name, e.start_time,
          ${EVENT_URL_SQL} AS url,
          e.segment, e.genre, e.price_min, e.price_max, e.is_free,
          e.availability_tier, e.last_checked_at, e.surprise_score,
          ${WALK_IN_SQL} AS walk_in,
          v.walk_in_policy,
          v.door_price,
          e.hook,
          v.name        AS venue_name,
          v.address     AS venue_address,
          v.neighborhood,
          v.geo_lat     AS venue_lat,
          v.geo_lng     AS venue_lng
        FROM events e
        LEFT JOIN venues v ON e.venue_id = v.venue_id
        WHERE ${TONIGHT_WINDOW_SQL.trim()}
          AND e.availability_tier != 'cancelled'
           ${walkInsOnly ? `AND ${WALK_IN_SQL}` : ""}
           ${includeAttractions ? "" : `AND ${NOT_ATTRACTION_SQL}`}
          AND ($2::text IS NULL OR e.segment = $2 OR ($2 = 'Jazz' AND e.genre = 'Jazz') OR ($2 = 'Comedy' AND e.genre = 'Comedy') OR ($2 = 'Theatre' AND e.segment = 'Arts & Theatre'))
        ORDER BY e.start_time ASC
        LIMIT $1`;
      params = [RANKING_POOL, segment];
    }

    const { rows } = await pool.query(query, params);

    // Enrich with travel time when user location is known
    let filterable = hasGeo
      ? await Promise.all(
          rows.map(async (event) => {
            if (event.venue_lat == null || event.venue_lng == null) {
              return { ...event, travel_minutes: null, leave_by: null, travel_source: null };
            }
            const travel = await getTravelTime(lat, lng, event.venue_lat, event.venue_lng, mode);
            return {
              ...event,
              travel_minutes: travel?.minutes ?? null,
              travel_distance_km: travel?.distance_km ?? null,
              leave_by: travel ? computeLeaveBy(event.start_time, travel.minutes, bufferMinutes) : null,
              travel_source: travel?.source ?? null,
            };
          })
        )
      : rows;

    if (budgetMax !== null) {
      filterable = filterable.filter((e) =>
        budgetMax === 0
          ? e.is_free
          : e.is_free || e.price_min == null || e.price_min <= budgetMax
      );
    }
    if (walkInsOnly) {
      filterable = filterable.filter((e) => e.walk_in === true);
    }

    const ranked = rankEvents(filterable, { sort, surpriseMe, budget });

    // Sold-out events are ranked alongside everything else and then split out,
    // rather than being dropped in SQL as they used to be. The feed stays a
    // list of things you can actually go to; the app offers these behind a
    // "show sold-out nearby" affordance instead of silently pretending the
    // shows do not exist.
    //
    // Split BEFORE slicing to the limit, so sold-out events never consume feed
    // slots. Under best_match they sort last anyway (tier score 0), but
    // soonest/nearest/cheapest interleave them, which would otherwise hand back
    // fewer than `limit` events a user can actually attend.
    //
    // include_sold_out=true keeps its original meaning — everything in one
    // list — so existing callers of the public API are unaffected.
    if (surpriseMe || includeSoldOut) {
      const events = ranked.slice(0, surpriseMe ? 5 : limit);
      return res.json({
        count: events.length,
        geo: hasGeo,
        mode: hasGeo ? mode : undefined,
        sort: surpriseMe ? "surprise_me" : sort,
        events,
      });
    }

    const events = ranked
      .filter((e) => e.availability_tier !== "sold_out")
      .slice(0, limit);
    const soldOut = ranked
      .filter((e) => e.availability_tier === "sold_out")
      .slice(0, SOLD_OUT_LIMIT);

    res.json({
      count: events.length,
      geo: hasGeo,
      mode: hasGeo ? mode : undefined,
      sort,
      events,
      sold_out_events: soldOut,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /events/:id ──────────────────────────────────────────────────────────

app.get("/events/:id", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         e.*,
         -- listed after e.* so it overrides the raw e.url in the result row
         ${EVENT_URL_SQL} AS url,
         ${WALK_IN_SQL} AS walk_in,
         v.walk_in_policy,
         v.door_price,
         v.name        AS venue_name,
         v.address     AS venue_address,
         v.neighborhood,
         v.geo_lat     AS venue_lat,
         v.geo_lng     AS venue_lng,
         CASE WHEN v.geo_lat IS NOT NULL THEN json_build_object('lat', v.geo_lat, 'lng', v.geo_lng) ELSE NULL END AS venue_geo
       FROM events e
       LEFT JOIN venues v ON e.venue_id = v.venue_id
       WHERE e.event_id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "Event not found" });

    // Only populated for a sold-out event; fetchAlternatives is a no-op
    // otherwise and never rejects, so the detail response is never at risk.
    const alternatives = await fetchAlternatives(rows[0]);
    res.json({ ...rows[0], alternatives });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /travel ─────────────────────────────────────────────────────────────
// Query params: from_lat, from_lng, to_lat, to_lng, mode, start_time, buffer_minutes

app.get("/travel", async (req, res) => {
  const fromLat = parseFloat(req.query.from_lat);
  const fromLng = parseFloat(req.query.from_lng);
  const toLat   = parseFloat(req.query.to_lat);
  const toLng   = parseFloat(req.query.to_lng);
  const mode    = req.query.mode ?? "transit";
  const startTime     = req.query.start_time ?? null;
  const bufferMinutes = parseInt(req.query.buffer_minutes) || 10;

  if ([fromLat, fromLng, toLat, toLng].some(isNaN)) {
    return res.status(400).json({ error: "from_lat, from_lng, to_lat, to_lng are required" });
  }

  try {
    const travel = await getTravelTime(fromLat, fromLng, toLat, toLng, mode, startTime);
    if (!travel) return res.json({ travel_minutes: null, distance_km: null, leave_by: null, travel_source: null });

    const leaveBy = startTime ? computeLeaveBy(startTime, travel.minutes, bufferMinutes) : null;
    res.json({
      travel_minutes: travel.minutes,
      distance_km: travel.distance_km,
      leave_by: leaveBy,
      travel_source: travel.source,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── START ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`🚀 NowGo API running on http://localhost:${PORT}`);
  startScheduler();
  console.log(`   GET /health`);
  console.log(`   GET /events/tonight`);
  console.log(`   GET /events/tonight?lat=40.758&lng=-73.9855&radius_miles=5`);
  console.log(`   GET /events/:id`);
  console.log(`   GET /sources`);
  console.log(`   GET /venues/uncurated`);
});

export default app;
