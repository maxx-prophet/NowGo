import cron from "node-cron";
import { fetchTicketmaster } from "./fetchers/ticketmaster.js";
import { fetchSeatGeek } from "./fetchers/seatgeek.js";
import { fetchJazzNYC } from "./fetchers/jazz-nyc.js";
import { ingestEvents } from "../db/ingest.js";
import { geocodeVenues, backfillVenueWebsites } from "./services/geocode.js";
import { backfillNeighborhoods } from "./services/neighborhoods.js";
import { reportUncuratedVenues } from "./services/walk-in.js";
import { runAvailabilityCheck } from "./services/availability.js";
import { runGenreEnrichment } from "./services/genre-enrichment.js";
import { runSurpriseScore } from "./services/surprise-score.js";
import { runVenueEmbeddings } from "./services/venue-embeddings.js";
import { runHookGeneration } from "./services/hook-generation.js";
import pool from "../db/index.js";

// ─── ALIAS MAP ───────────────────────────────────────────────────────────────

async function loadAliasMap() {
  try {
    const { rows } = await pool.query(
      `SELECT va.alias, regexp_replace(lower(v.name), '[^a-z0-9]', '', 'g') AS canonical
       FROM venue_aliases va JOIN venues v ON va.venue_id = v.venue_id`
    );
    return new Map(rows.map(r => [r.alias, r.canonical]));
  } catch {
    return new Map(); // venue_aliases table may not exist before migration runs
  }
}

// ─── PIPELINE ────────────────────────────────────────────────────────────────

export async function runPipeline() {
  const started = new Date().toISOString();
  console.log(`\n⏰ [${started}] Pipeline starting...`);

  try {
    const tmEvents = await fetchTicketmaster();
    console.log(`  ✅ Ticketmaster: ${tmEvents.length} events`);

    const aliasMap = await loadAliasMap();
    console.log(`  🗺  Loaded ${aliasMap.size} venue aliases`);

    const mergedEvents = await fetchSeatGeek(tmEvents, aliasMap, pool);
    console.log(`  ✅ SeatGeek merged: ${mergedEvents.length} total events`);

    const jazzEvents = await fetchJazzNYC();
    console.log(`  ✅ Jazz NYC: ${jazzEvents.length} events`);

    const allEvents = [...mergedEvents, ...jazzEvents];
    console.log(`  💾 Ingesting ${allEvents.length} events...`);

    const { ok, skipped } = await ingestEvents(allEvents);
    console.log(`  💾 Ingested ${ok} events, skipped ${skipped}`);

    // Must run after ingest so new venue rows exist. Isolated in its own
    // try/catch: geocoding and website backfill both depend on an external
    // API and quota, and a failure in either must not skip the enrichment
    // steps below.
    try {
      await geocodeVenues();
      // Only touches venues that still have no website, so this is a no-op on
      // most runs and only pays for lookups when a new venue appears.
      await backfillVenueWebsites();
    } catch (err) {
      console.error(`  ❌ Venue enrichment failed (continuing): ${err.message}`);
    }

    // Derives venues.neighborhood from coordinates. Must run after geocoding,
    // since a venue with no coordinates cannot be placed. Its own try/catch
    // because it is pure arithmetic over a DB read — it cannot fail for the
    // external-API reasons the block above can, and should still run when
    // geocoding failed on quota.
    try {
      await backfillNeighborhoods();
    } catch (err) {
      console.error(`  ❌ Neighborhood backfill failed (continuing): ${err.message}`);
    }

    // Names venues that still need a walk-in decision. Curation is manual, so
    // without this a new venue silently never reaches the walk-ins filter.
    // Separate try/catch: this is a plain DB query with no external
    // dependency, so it cannot fail for the same reasons as the block above.
    try {
      await reportUncuratedVenues();
    } catch (err) {
      console.error(`  ❌ Walk-in curation report failed (continuing): ${err.message}`);
    }

    await runVenueEmbeddings();
    console.log(`  🔢 Venue embeddings complete`);
    await runAvailabilityCheck();
    await runGenreEnrichment();
    await runSurpriseScore();
    await runHookGeneration();
    console.log(`  🏁 Pipeline complete [${new Date().toISOString()}]\n`);
  } catch (err) {
    console.error(`  ❌ Pipeline failed: ${err.message}\n`);
  }
}

// ─── SCHEDULE ─────────────────────────────────────────────────────────────────
// Runs at 10am, 2pm, 5pm, 8pm NYC time (America/New_York)

const TIMES = [
  { label: "10:00am", cron: "0 10 * * *" },
  { label: "2:00pm",  cron: "0 14 * * *" },
  { label: "5:00pm",  cron: "0 17 * * *" },
  { label: "8:00pm",  cron: "0 20 * * *" },
];

export function startScheduler() {
  console.log("📅 Scheduler active — pipeline runs at:", TIMES.map((t) => t.label).join(", "));

  TIMES.forEach(({ cron: expression }) => {
    cron.schedule(expression, runPipeline, { timezone: "America/New_York" });
  });
}
