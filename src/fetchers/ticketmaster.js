import fetch from "node-fetch";
import fs from "fs";
import dotenv from "dotenv";
dotenv.config({ path: ".env.nowgo" });

const TM_API_KEY = process.env.TM_API_KEY;
const NYC_LAT = 40.758;
const NYC_LNG = -73.9855;
const RADIUS_MILES = 10;

function getTonightWindow() {
  const now = new Date();
  const start = new Date(now);
  start.setHours(17, 0, 0, 0);
  const end = new Date(now);
  end.setDate(end.getDate() + (now.getHours() < 2 ? 0 : 1));
  end.setHours(26, 0, 0, 0); // 2am next day
  return {
    start: start.toISOString().split(".")[0] + "Z",
    end: end.toISOString().split(".")[0] + "Z",
  };
}

// ─── NORMALIZE ───────────────────────────────────────────────────────────────

function normalizeTicketmasterEvent(e) {
  const venue = e._embedded?.venues?.[0];
  const classification = e.classifications?.[0];
  const price = e.priceRanges?.[0];

  return {
    id: `tm_${e.id}`,
    source: "ticketmaster",
    name: e.name,
    url: e.url,

    date: e.dates?.start?.localDate,
    time: e.dates?.start?.localTime,
    doorsOpen: e.dates?.doorsTimes?.localTime ?? null,

    venue: venue?.name ?? null,
    address: venue?.address?.line1 ?? null,
    neighborhood: venue?.city?.name ?? null,
    lat: parseFloat(venue?.location?.latitude) || null,
    lng: parseFloat(venue?.location?.longitude) || null,

    segment: classification?.segment?.name ?? null,
    genre: classification?.genre?.name ?? null,
    subGenre: classification?.subGenre?.name ?? null,

    priceMin: price?.min ?? null,
    priceMax: price?.max ?? null,
    currency: price?.currency ?? "USD",
    isFree: price == null,

    status: e.dates?.status?.code ?? null,
    availabilityTier: mapAvailability(e.dates?.status?.code),

    travelMinutes: null,
    leaveByTime: null,
    surpriseScore: null,
  };
}

function mapAvailability(statusCode) {
  switch (statusCode) {
    case "onsale":      return "available";
    case "offsale":     return "sold_out";
    case "cancelled":   return "cancelled";
    case "rescheduled": return "available";
    default:            return "unknown";
  }
}

// ─── FETCH ───────────────────────────────────────────────────────────────────

async function fetchTicketmaster() {
  const { start, end } = getTonightWindow();

  const url = new URL("https://app.ticketmaster.com/discovery/v2/events.json");
  url.searchParams.set("apikey", TM_API_KEY);
  url.searchParams.set("latlong", `${NYC_LAT},${NYC_LNG}`);
  url.searchParams.set("radius", RADIUS_MILES);
  url.searchParams.set("unit", "miles");
  url.searchParams.set("startDateTime", start);
  url.searchParams.set("endDateTime", end);
  url.searchParams.set("size", "50");
  url.searchParams.set("sort", "date,asc");
  url.searchParams.set("includeSpellcheck", "yes");

  console.log("\n📡 Fetching Ticketmaster...");
  console.log(`   Window: ${start} → ${end}`);
  console.log(`   URL: ${url.toString()}\n`);

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`TM API error: ${res.status} ${res.statusText}`);

  const data = await res.json();
  const raw = data._embedded?.events ?? [];
  console.log(`   ✅ Got ${raw.length} raw events`);

  const filtered = raw.filter((e) => {
    if (e.dates?.status?.code === "cancelled") return false;
    if (e.dates?.spanMultipleDays === true) return false;
    return true;
  });
  console.log(`   🧹 ${filtered.length} after filtering cancelled + multi-day\n`);

  return filtered.map(normalizeTicketmasterEvent);
}

// ─── REPORT ──────────────────────────────────────────────────────────────────

function printSummary(events) {
  console.log("─────────────────────────────────────────");
  console.log(`🗽 TONIGHT IN NYC — ${events.length} events\n`);

  const byGenre = {};
  const priceGaps = [];

  events.forEach((e) => {
    const genre = e.genre ?? e.segment ?? "Other";
    byGenre[genre] = (byGenre[genre] || 0) + 1;
    if (!e.priceMin) priceGaps.push(e.name);
  });

  events.slice(0, 10).forEach((e, i) => {
    const price = e.isFree ? "FREE" : e.priceMin ? `$${e.priceMin}–$${e.priceMax}` : "price unknown";
    const time = e.time ? e.time.slice(0, 5) : "TBD";
    console.log(`  ${i + 1}. ${e.name}`);
    console.log(`     📍 ${e.venue} | ⏰ ${time} | 💵 ${price} | ${e.availabilityTier}`);
    console.log(`     🎭 ${e.genre ?? e.segment ?? "—"}\n`);
  });

  if (events.length > 10) console.log(`  ... and ${events.length - 10} more in data/events-tonight.json\n`);

  console.log("📊 Breakdown by genre:");
  Object.entries(byGenre)
    .sort((a, b) => b[1] - a[1])
    .forEach(([g, n]) => console.log(`   ${g}: ${n}`));

  console.log(`\n⚠️  Price data missing for ${priceGaps.length} events`);
  console.log("─────────────────────────────────────────\n");
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🚀 NowGo — Ticketmaster Fetcher");
  console.log("   Node version:", process.version);

  try {
    const events = await fetchTicketmaster();
    printSummary(events);

    const output = { fetchedAt: new Date().toISOString(), source: "ticketmaster", count: events.length, events };

    fs.mkdirSync("data", { recursive: true });
    fs.writeFileSync("data/events-tonight.json", JSON.stringify(output, null, 2));
    console.log("💾 Saved to data/events-tonight.json");
  } catch (err) {
    console.error("❌ Error:", err.message);
    process.exit(1);
  }
}

main();
