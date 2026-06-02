import fs from "fs";
import pool from "./index.js";

function parseNYCDateTime(dateStr, timeStr = '00:00:00') {
  // TM/SG give us local NYC time strings — we must convert to UTC correctly.
  // `new Date("2026-05-24T13:35:00")` treats the string as *server* local time
  // (UTC on Railway), so it stores 4h early during EDT. Fix: use Intl to find
  // the actual Eastern→UTC offset for that specific date (handles DST).
  const naive = new Date(`${dateStr}T${timeStr}Z`); // treat input as UTC first
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(naive).reduce((a, p) => ({ ...a, [p.type]: p.value }), {});
  const nyAsUTC = new Date(Date.UTC(
    +parts.year, +parts.month - 1, +parts.day,
    parts.hour === '24' ? 0 : +parts.hour,
    +parts.minute, +parts.second,
  ));
  return new Date(naive.getTime() + (naive - nyAsUTC));
}

function clean(val) {
  if (val == null) return null;
  if (typeof val === "string" && (val.toLowerCase() === "undefined" || val.trim() === "")) return null;
  return val;
}

// ─── UPSERT HELPERS ───────────────────────────────────────────────────────────

async function resolveVenueAlias(client, name) {
  if (!name) return name;
  const alias = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  try {
    const { rows } = await client.query(
      `SELECT v.name FROM venue_aliases va
       JOIN venues v ON va.venue_id = v.venue_id
       WHERE va.alias = $1`,
      [alias]
    );
    return rows[0]?.name ?? name;
  } catch {
    return name; // venue_aliases table may not exist before migration runs
  }
}

async function upsertVenue(client, event) {
  if (!event.venue) return null;

  const venueName = await resolveVenueAlias(client, event.venue);
  const hasGeo = event.lat != null && event.lng != null;

  const { rows } = await client.query(
    `INSERT INTO venues (name, address, neighborhood, geo_lat, geo_lng)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (name) DO UPDATE
       SET address      = COALESCE(EXCLUDED.address, venues.address),
           neighborhood = COALESCE(EXCLUDED.neighborhood, venues.neighborhood),
           geo_lat      = COALESCE(EXCLUDED.geo_lat, venues.geo_lat),
           geo_lng      = COALESCE(EXCLUDED.geo_lng, venues.geo_lng),
           updated_at   = now()
     RETURNING venue_id`,
    [
      venueName,
      event.address ?? null,
      event.neighborhood ?? null,
      hasGeo ? event.lat : null,
      hasGeo ? event.lng : null,
    ]
  );
  return rows[0].venue_id;
}

async function upsertEvent(client, event, venueId) {
  const startTime = event.date
    ? parseNYCDateTime(event.date, event.time ?? '00:00:00')
    : null;

  if (!startTime || isNaN(startTime)) return;

  await client.query(
    `INSERT INTO events (
       event_id, source, name, venue_id, start_time, url,
       segment, genre, sub_genre,
       price_min, price_max, currency, is_free,
       availability_tier, last_checked_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,now())
     ON CONFLICT (event_id) DO UPDATE SET
       name              = EXCLUDED.name,
       venue_id          = COALESCE(EXCLUDED.venue_id, events.venue_id),
       start_time        = EXCLUDED.start_time,
       url               = COALESCE(EXCLUDED.url, events.url),
       segment           = EXCLUDED.segment,
       genre             = COALESCE(EXCLUDED.genre, events.genre),
       price_min         = COALESCE(EXCLUDED.price_min, events.price_min),
       price_max         = COALESCE(EXCLUDED.price_max, events.price_max),
       is_free           = EXCLUDED.is_free,
       availability_tier = EXCLUDED.availability_tier,
       last_checked_at   = now(),
       updated_at        = now()`,
    [
      event.id,
      event.source,
      event.name,
      venueId,
      startTime.toISOString(),
      event.url ?? null,
      clean(event.segment),
      clean(event.genre),
      clean(event.subGenre),
      event.priceMin ?? null,
      event.priceMax ?? null,
      event.currency ?? "USD",
      event.isFree ?? false,
      event.availabilityTier ?? "unknown",
    ]
  );

  await client.query(
    `INSERT INTO availability_snapshots (event_id, availability_tier, price_min, price_max)
     VALUES ($1, $2, $3, $4)`,
    [event.id, event.availabilityTier ?? "unknown", event.priceMin ?? null, event.priceMax ?? null]
  );
}

// ─── EXPORTED FUNCTION (used by scheduler) ────────────────────────────────────

export async function ingestEvents(events) {
  const client = await pool.connect();
  let ok = 0, skipped = 0;

  try {
    for (const event of events) {
      try {
        await client.query("BEGIN");
        const venueId = await upsertVenue(client, event);
        await upsertEvent(client, event, venueId);
        await client.query("COMMIT");
        ok++;
      } catch (err) {
        await client.query("ROLLBACK");
        console.warn(`  ⚠️  Skipped ${event.id}: ${err.message}`);
        skipped++;
      }
    }
  } finally {
    client.release();
  }

  console.log(`✅ Ingested ${ok} events, skipped ${skipped}`);
  return { ok, skipped };
}

// ─── MAIN (CLI only) ──────────────────────────────────────────────────────────

const CANDIDATES = [
  "data/events-tonight-enriched.json",
  "data/events-tonight-final.json",
  "data/events-tonight-merged.json",
  "data/events-tonight.json",
];

async function main() {
  const input = CANDIDATES
    .filter(fs.existsSync)
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];

  if (!input) {
    console.error("❌ No events file found — run fetchers first");
    process.exit(1);
  }

  const { events } = JSON.parse(fs.readFileSync(input, "utf8"));
  console.log(`📂 Ingesting ${events.length} events from ${input}...`);

  await ingestEvents(events);
  await pool.end();
}

import { fileURLToPath } from "url";
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error("❌ Ingest failed:", err.message);
    process.exit(1);
  });
}
