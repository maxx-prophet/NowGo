import fetch from "node-fetch";
import fs from "fs";
import dotenv from "dotenv";
dotenv.config({ path: ".env.nowgo" });

const TD_USERNAME = process.env.TICKETSDATA_USERNAME;
const TD_PASSWORD = process.env.TICKETSDATA_PASSWORD;
const BASE_URL = "https://ticketsdata.com/fetch";
const DELAY_MS = 600; // stay well under rate limits

// ─── AVAILABILITY ─────────────────────────────────────────────────────────────

function mapAvailability(body) {
  const offers = body?._embedded?.offer ?? body?.offers ?? [];
  if (Array.isArray(offers) && offers.length > 0) return "available";
  // Some responses use a listings array
  const listings = body?.listings ?? body?.data ?? [];
  if (Array.isArray(listings) && listings.length > 0) return "available";
  return "sold_out";
}

// ─── FETCH ────────────────────────────────────────────────────────────────────

async function checkAvailability(eventUrl) {
  const url = new URL(BASE_URL);
  url.searchParams.set("username", TD_USERNAME);
  url.searchParams.set("password", TD_PASSWORD);
  url.searchParams.set("platform", "ticketmaster");
  url.searchParams.set("event_url", eventUrl);

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`TicketsData ${res.status}: ${res.statusText}`);

  const data = await res.json();
  if (data.status && data.status !== 200) throw new Error(`TicketsData API error: ${JSON.stringify(data)}`);

  return { tier: mapAvailability(data.body ?? data), quotaRemaining: data.quota_remaining ?? null };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🚀 NowGo — TicketsData Enricher");

  if (!TD_USERNAME || !TD_PASSWORD) {
    console.error("❌ TICKETSDATA_USERNAME / TICKETSDATA_PASSWORD not set in .env.nowgo");
    process.exit(1);
  }

  // Pick the most recently written events file
  const CANDIDATES = [
    "data/events-tonight-final.json",
    "data/events-tonight-merged.json",
    "data/events-tonight.json",
  ];
  const inputPath = CANDIDATES.filter(fs.existsSync).sort(
    (a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs
  )[0];

  if (!inputPath) {
    console.error("❌ No events file found — run fetchers first");
    process.exit(1);
  }

  const file = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const events = file.events ?? [];
  console.log(`📂 Loaded ${events.length} events from ${inputPath}`);

  // Only enrich TM events that have a ticketmaster.com URL
  const tmEvents = events.filter(
    (e) => e.source === "ticketmaster" && e.url?.includes("ticketmaster.com")
  );
  console.log(`🎟  ${tmEvents.length} Ticketmaster events to check\n`);

  let enriched = 0, soldOut = 0, errors = 0, lastQuota = null;

  for (const event of tmEvents) {
    try {
      const { tier, quotaRemaining } = await checkAvailability(event.url);
      event.availabilityTier = tier;
      if (tier === "available") enriched++;
      if (tier === "sold_out") { soldOut++; console.log(`  🔴 SOLD OUT: ${event.name}`); }
      if (quotaRemaining != null) lastQuota = quotaRemaining;
      await sleep(DELAY_MS);
    } catch (err) {
      errors++;
      console.warn(`  ⚠️  ${event.name}: ${err.message}`);
    }
  }

  console.log(`\n✅ Available: ${enriched} | Sold out: ${soldOut} | Errors: ${errors}`);
  if (lastQuota != null) console.log(`   Quota remaining: ${lastQuota}`);

  const output = {
    fetchedAt: new Date().toISOString(),
    sources: file.sources ?? ["ticketmaster", "seatgeek", "jazz_nyc"],
    count: events.length,
    enrichedCount: enriched + soldOut,
    events,
  };

  fs.mkdirSync("data", { recursive: true });
  fs.writeFileSync("data/events-tonight-enriched.json", JSON.stringify(output, null, 2));
  console.log(`💾 Saved ${events.length} events (with availability) to data/events-tonight-enriched.json`);
}

main().catch((err) => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
