import cron from "node-cron";
import { fetchTicketmaster } from "./fetchers/ticketmaster.js";
import { fetchSeatGeek } from "./fetchers/seatgeek.js";
import { fetchJazzNYC } from "./fetchers/jazz-nyc.js";
import { ingestEvents } from "../db/ingest.js";
import { runAvailabilityCheck } from "./services/availability.js";
import { runGenreEnrichment } from "./services/genre-enrichment.js";
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

    const mergedEvents = await fetchSeatGeek(tmEvents, aliasMap);
    console.log(`  ✅ SeatGeek merged: ${mergedEvents.length} total events`);

    const jazzEvents = await fetchJazzNYC();
    console.log(`  ✅ Jazz NYC: ${jazzEvents.length} events`);

    const allEvents = [...mergedEvents, ...jazzEvents];
    console.log(`  💾 Ingesting ${allEvents.length} events...`);

    const { ok, skipped } = await ingestEvents(allEvents);
    console.log(`  💾 Ingested ${ok} events, skipped ${skipped}`);

    await runAvailabilityCheck();
    await runGenreEnrichment();
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
