import fs from "fs";
import pool from "./index.js";

// Pick the most recently modified events file
const CANDIDATES = ["data/events-tonight-final.json", "data/events-tonight-merged.json", "data/events-tonight.json"];
const INPUT = CANDIDATES
  .filter(fs.existsSync)
  .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];

async function upsertVenue(client, event) {
  if (!event.venue) return null;

  const hasGeo = event.lat != null && event.lng != null;

  const { rows } = await client.query(
    `INSERT INTO venues (name, address, neighborhood, geo)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (name) DO UPDATE
       SET address     = COALESCE(EXCLUDED.address, venues.address),
           neighborhood = COALESCE(EXCLUDED.neighborhood, venues.neighborhood),
           geo          = COALESCE(EXCLUDED.geo, venues.geo),
           updated_at   = now()
     RETURNING venue_id`,
    [
      event.venue,
      event.address ?? null,
      event.neighborhood ?? null,
      hasGeo ? `SRID=4326;POINT(${event.lng} ${event.lat})` : null,
    ]
  );
  return rows[0].venue_id;
}

async function upsertEvent(client, event, venueId) {
  const startTime = event.date && event.time
    ? new Date(`${event.date}T${event.time}`)
    : event.date
    ? new Date(`${event.date}T00:00:00`)
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
       segment           = COALESCE(EXCLUDED.segment, events.segment),
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
      event.segment ?? null,
      event.genre ?? null,
      event.subGenre ?? null,
      event.priceMin ?? null,
      event.priceMax ?? null,
      event.currency ?? "USD",
      event.isFree ?? false,
      event.availabilityTier ?? "unknown",
    ]
  );

  // Append availability snapshot
  await client.query(
    `INSERT INTO availability_snapshots (event_id, availability_tier, price_min, price_max)
     VALUES ($1, $2, $3, $4)`,
    [event.id, event.availabilityTier ?? "unknown", event.priceMin ?? null, event.priceMax ?? null]
  );
}

async function ingest() {
  if (!fs.existsSync(INPUT)) {
    console.error(`❌ ${INPUT} not found — run fetchers first`);
    process.exit(1);
  }

  const { events } = JSON.parse(fs.readFileSync(INPUT, "utf8"));
  console.log(`📂 Ingesting ${events.length} events from ${INPUT}...`);

  const client = await pool.connect();
  let ok = 0, skipped = 0;

  try {
    // Add unique constraint on venue name if not exists
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'venues_name_key'
        ) THEN
          ALTER TABLE venues ADD CONSTRAINT venues_name_key UNIQUE (name);
        END IF;
      END $$;
    `);

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
    await pool.end();
  }

  console.log(`✅ Ingested ${ok} events, skipped ${skipped}`);
}

ingest().catch((err) => {
  console.error("❌ Ingest failed:", err.message);
  process.exit(1);
});
