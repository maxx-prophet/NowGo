import cron from "node-cron";
import { fetchTicketmaster } from "./fetchers/ticketmaster.js";
import { fetchSeatGeek } from "./fetchers/seatgeek.js";
import { fetchJazzNYC } from "./fetchers/jazz-nyc.js";
import { ingestEvents } from "../db/ingest.js";

// ─── PIPELINE ────────────────────────────────────────────────────────────────

export async function runPipeline() {
  const started = new Date().toISOString();
  console.log(`\n⏰ [${started}] Pipeline starting...`);

  try {
    const tmEvents = await fetchTicketmaster();
    console.log(`  ✅ Ticketmaster: ${tmEvents.length} events`);

    const mergedEvents = await fetchSeatGeek(tmEvents);
    console.log(`  ✅ SeatGeek merged: ${mergedEvents.length} total events`);

    const jazzEvents = await fetchJazzNYC();
    console.log(`  ✅ Jazz NYC: ${jazzEvents.length} events`);

    const allEvents = [...mergedEvents, ...jazzEvents];
    console.log(`  💾 Ingesting ${allEvents.length} events...`);

    const { ok, skipped } = await ingestEvents(allEvents);
    console.log(`  🏁 Pipeline complete — ${ok} ingested, ${skipped} skipped [${new Date().toISOString()}]\n`);
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
