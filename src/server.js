import express from "express";
import dotenv from "dotenv";
import pool from "../db/index.js";
import { startScheduler, runPipeline } from "./scheduler.js";
import { getTravelTime, computeLeaveBy } from "./services/travel.js";
import { rankEvents, RANKING_POOL } from "./services/ranking.js";
dotenv.config({ path: ".env.nowgo" });

const app = express();
const PORT = process.env.PORT ?? 3000;

app.use(express.json());

// ─── HEALTH ──────────────────────────────────────────────────────────────────

app.get("/health", (req, res) => {
  res.json({ status: "ok", ts: new Date().toISOString() });
});

// ─── POST /pipeline/run ───────────────────────────────────────────────────────

app.post("/pipeline/run", async (req, res) => {
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

  try {
    let query, params;

    if (hasGeo) {
      query = `
        SELECT
          e.event_id, e.source, e.name, e.start_time, e.url,
          e.segment, e.genre, e.price_min, e.price_max, e.is_free,
          e.availability_tier, e.last_checked_at, e.surprise_score,
          e.walk_in, e.hook,
          v.name        AS venue_name,
          v.address     AS venue_address,
          v.neighborhood,
          v.geo_lat AS venue_lat,
          v.geo_lng AS venue_lng,
          0 AS distance_m
        FROM events e
        LEFT JOIN venues v ON e.venue_id = v.venue_id
        WHERE e.start_time > NOW() - interval '30 minutes'
          AND e.start_time < (date_trunc('day', NOW() AT TIME ZONE 'America/New_York') + interval '1 day 4 hours') AT TIME ZONE 'America/New_York'
          AND e.availability_tier != 'cancelled'
           ${includeSoldOut ? "" : "AND e.availability_tier != 'sold_out'"} 
          AND ($5::text IS NULL OR e.segment = $5)
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
          e.event_id, e.source, e.name, e.start_time, e.url,
          e.segment, e.genre, e.price_min, e.price_max, e.is_free,
          e.availability_tier, e.last_checked_at, e.surprise_score,
          e.walk_in, e.hook,
          v.name        AS venue_name,
          v.address     AS venue_address,
          v.neighborhood,
          v.geo_lat     AS venue_lat,
          v.geo_lng     AS venue_lng
        FROM events e
        LEFT JOIN venues v ON e.venue_id = v.venue_id
        WHERE e.start_time > NOW() - interval '30 minutes'
          AND e.start_time < (date_trunc('day', NOW() AT TIME ZONE 'America/New_York') + interval '1 day 4 hours') AT TIME ZONE 'America/New_York'
          AND e.availability_tier != 'cancelled'
           ${includeSoldOut ? "" : "AND e.availability_tier != 'sold_out'"} 
          AND ($2::text IS NULL OR e.segment = $2)
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

    const ranked = rankEvents(filterable, { sort, surpriseMe, budget }).slice(0, surpriseMe ? 5 : limit);
    res.json({ count: ranked.length, geo: hasGeo, mode: hasGeo ? mode : undefined, sort: surpriseMe ? "surprise_me" : sort, events: ranked });
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
         v.name        AS venue_name,
         v.address     AS venue_address,
         v.neighborhood,
         CASE WHEN v.geo_lat IS NOT NULL THEN json_build_object('lat', v.geo_lat, 'lng', v.geo_lng) ELSE NULL END AS venue_geo
       FROM events e
       LEFT JOIN venues v ON e.venue_id = v.venue_id
       WHERE e.event_id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "Event not found" });
    res.json(rows[0]);
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
});

export default app;
