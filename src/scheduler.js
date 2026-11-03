import cron from "node-cron";
import { fetchTicketmaster } from "./fetchers/ticketmaster.js";
import { fetchSeatGeek } from "./fetchers/seatgeek.js";
import { fetchJazzNYC, getLastFetchStats } from "./fetchers/jazz-nyc.js";
import { ingestEvents } from "../db/ingest.js";
import { geocodeVenues, backfillVenueWebsites } from "./services/geocode.js";
import { backfillNeighborhoods } from "./services/neighborhoods.js";
import { reportUncuratedVenues } from "./services/walk-in.js";
import { runAvailabilityCheck } from "./services/availability.js";
import { runGenreEnrichment } from "./services/genre-enrichment.js";
import { runSurpriseScore } from "./services/surprise-score.js";
import { runVenueEmbeddings } from "./services/venue-embeddings.js";
import { runHookGeneration } from "./services/hook-generation.js";
import { markSourceFetched } from "./services/sources.js";
import { checkScraperHealth } from "./services/scraper-health.js";
import { captureServerEvent } from "./services/posthog.js";
import { createStageTimer } from "./services/pipeline-timing.js";
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

  // Every stage is wrapped so the run ends with a slowest-first breakdown.
  // Railway's log viewer has no per-line timestamps, so this is the only way
  // a run can say where its time went.
  const timer = createStageTimer();

  try {
    // Each source is optional: a dead key at one provider (a Ticketmaster 401
    // after the Oct 2026 key rotation) used to abort the run before any source
    // was ingested. Ingest never deletes, so a failed source's existing events
    // stay in the feed, and its stale `last_fetched_at` is the signal.
    const tmEvents = await timer.optional("fetch:ticketmaster", fetchTicketmaster);
    if (tmEvents) {
      console.log(`  ✅ Ticketmaster: ${tmEvents.length} events`);
      await markSourceFetched("ticketmaster");
    }

    const aliasMap = await loadAliasMap();
    console.log(`  🗺  Loaded ${aliasMap.size} venue aliases`);

    // fetchSeatGeek returns the Ticketmaster events merged with its own, so if
    // it fails, fall back to the Ticketmaster list alone.
    const mergedEvents = await timer.optional("fetch:seatgeek+merge", () => fetchSeatGeek(tmEvents ?? [], aliasMap, pool));
    if (mergedEvents) {
      console.log(`  ✅ SeatGeek merged: ${mergedEvents.length} total events`);
      await markSourceFetched("seatgeek");
    }

    const jazzEvents = await timer.optional("fetch:jazz-nyc", fetchJazzNYC);
    if (jazzEvents) {
      console.log(`  ✅ Jazz NYC: ${jazzEvents.length} events`);
      await markSourceFetched("jazz_nyc");
    }

    const allEvents = [...(mergedEvents ?? tmEvents ?? []), ...(jazzEvents ?? [])];
    console.log(`  💾 Ingesting ${allEvents.length} events...`);

    const { ok, skipped } = await timer.stage("ingest", () => ingestEvents(allEvents));
    console.log(`  💾 Ingested ${ok} events, skipped ${skipped}`);

    // Did the scraper bring in the venues it usually does? Runs after ingest
    // so tonight's rows are in the comparison. Reports to PostHog every run;
    // the alert there fires on a bad value or on silence. Own try/catch: a
    // health check must never take the pipeline down with it.
    await timer.optional("scraper-health", () =>
      checkScraperHealth({ fetchStats: { jazz_nyc: getLastFetchStats() ?? {} } })
    );

    // Must run after ingest so new venue rows exist. Geocoding and website
    // backfill both depend on an external API and quota.
    await timer.optional("geocode", geocodeVenues);
    // Only touches venues that still have no website, so this is a no-op on
    // most runs and only pays for lookups when a new venue appears.
    await timer.optional("venue-websites", backfillVenueWebsites);

    // Derives venues.neighborhood from coordinates. Must run after geocoding,
    // since a venue with no coordinates cannot be placed, but still runs when
    // geocoding failed on quota: it is pure arithmetic over a DB read.
    await timer.optional("neighborhoods", backfillNeighborhoods);

    // Names venues that still need a walk-in decision. Curation is manual, so
    // without this a new venue silently never reaches the walk-ins filter.
    await timer.optional("walk-in-report", reportUncuratedVenues);

    // Each enrichment depends on its own external API (OpenAI, TicketsData,
    // Anthropic), so one dead key or empty credit balance skips only its step.
    await timer.optional("venue-embeddings", runVenueEmbeddings);
    await timer.optional("availability", runAvailabilityCheck);
    await timer.optional("genre-enrichment", runGenreEnrichment);
    await timer.optional("surprise-score", runSurpriseScore);
    await timer.optional("hook-generation", runHookGeneration);

    const failures = timer.failures();
    if (failures.length > 0) {
      console.log(`  🏁 Pipeline complete with ${failures.length} failed stage(s) [${new Date().toISOString()}]`);
      // Same event as a crash, so the existing PostHog alert also fires when a
      // source or API dies quietly. `partial` tells the two apart.
      await captureServerEvent("pipeline_failed", {
        partial: true,
        stage: failures[0].label,
        error: failures.map(f => `${f.label}: ${f.error}`).join("; "),
      });
    } else {
      console.log(`  🏁 Pipeline complete [${new Date().toISOString()}]`);
    }
  } catch (err) {
    console.error(`  ❌ Pipeline failed: ${err.message}`);
    // A run that died before the health check emits nothing else, so say so.
    await captureServerEvent("pipeline_failed", { error: err.message, stage: timer.stages().at(-1)?.label ?? null });
  } finally {
    // Printed on failure too: a run that died mid-way still tells you which
    // stage it got stuck in.
    timer.report();
    console.log("");
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
