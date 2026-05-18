import express from "express";
import dotenv from "dotenv";
import pool from "../db/index.js";
import { startScheduler, runPipeline } from "./scheduler.js";
import { getTravelTime, computeLeaveBy } from "./services/travel.js";
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

// Query params:
//   lat, lng        — user location (decimal degrees)
//   radius_miles    — default 10
//   limit           — default 50, max 200
//   segment         — filter by segment (Music, Sports, etc.)
//   mode            — transit (default), walking, driving, cycling
//   buffer_minutes  — minutes of buffer before event start, default 10

app.get("/events/tonight", async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);
  const radiusMiles = parseFloat(req.query.radius_miles) || 10;
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const segment = req.query.segment ?? null;
  const mode = req.query.mode ?? "transit";
  const bufferMinutes = parseInt(req.query.buffer_minutes) || 10;
  const hasGeo = !isNaN(lat) && !isNaN(lng);

  try {
    let query, params;

    if (hasGeo) {
      query = `
        SELECT
          e.event_id, e.source, e.name, e.start_time, e.url,
          e.segment, e.genre, e.price_min, e.price_max, e.is_free,
          e.availability_tier, e.last_checked_at,
          v.name        AS venue_name,
          v.address     AS venue_address,
          v.neighborhood,
          ST_Y(v.geo::geometry) AS venue_lat,
          ST_X(v.geo::geometry) AS venue_lng,
          round(ST_Distance(v.geo, ST_MakePoint($2, $1)::geography)::numeric) AS distance_m
        FROM events e
        LEFT JOIN venues v ON e.venue_id = v.venue_id
        WHERE e.start_time::date = CURRENT_DATE
          AND e.start_time > NOW() - interval '30 minutes'
          AND e.availability_tier != 'cancelled'
          AND ($5::text IS NULL OR e.segment = $5)
          AND (v.geo IS NULL OR ST_DWithin(v.geo, ST_MakePoint($2, $1)::geography, $3 * 1609.34))
        ORDER BY distance_m ASC NULLS LAST, e.start_time ASC
        LIMIT $4`;
      params = [lat, lng, radiusMiles, limit, segment];
    } else {
      query = `
        SELECT
          e.event_id, e.source, e.name, e.start_time, e.url,
          e.segment, e.genre, e.price_min, e.price_max, e.is_free,
          e.availability_tier, e.last_checked_at,
          v.name        AS venue_name,
          v.address     AS venue_address,
          v.neighborhood
        FROM events e
        LEFT JOIN venues v ON e.venue_id = v.venue_id
        WHERE e.start_time::date = CURRENT_DATE
          AND e.start_time > NOW() - interval '30 minutes'
          AND e.availability_tier != 'cancelled'
          AND ($2::text IS NULL OR e.segment = $2)
        ORDER BY e.start_time ASC
        LIMIT $1`;
      params = [limit, segment];
    }

    const { rows } = await pool.query(query, params);

    // Enrich with travel time when user location is known
    const events = hasGeo
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

    res.json({ count: events.length, geo: hasGeo, mode: hasGeo ? mode : undefined, events });
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
         ST_AsGeoJSON(v.geo)::json AS venue_geo
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
