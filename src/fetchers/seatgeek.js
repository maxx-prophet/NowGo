import fetch from "node-fetch";
import fs from "fs";
import dotenv from "dotenv";
dotenv.config({ path: ".env.nowgo" });

const SG_CLIENT_ID = process.env.SEATGEEK_CLIENT_ID;
const SG_CLIENT_SECRET = process.env.SEATGEEK_CLIENT_SECRET;
const NYC_LAT = 40.758;
const NYC_LNG = -73.9855;
const RADIUS_MILES = 10;

if (!SG_CLIENT_ID || !SG_CLIENT_SECRET) {
  console.error("❌ Missing SEATGEEK_CLIENT_ID or SEATGEEK_CLIENT_SECRET in .env.nowgo");
  process.exit(1);
}

function getTonightWindow() {
  const now = new Date();
  const start = new Date(now);
  start.setHours(17, 0, 0, 0);
  const end = new Date(now);
  end.setDate(end.getDate() + (now.getHours() < 2 ? 0 : 1));
  end.setHours(26, 0, 0, 0);
  return {
    start: start.toISOString().split(".")[0],
    end: end.toISOString().split(".")[0],
  };
}

// ─── NORMALIZE ───────────────────────────────────────────────────────────────

function normalizeSeatGeekEvent(e) {
  const venue = e.venue;
  const performer = e.performers?.[0];

  const segmentMap = {
    concert: "Music",
    sports: "Sports",
    theater: "Arts & Theatre",
    comedy: "Arts & Theatre",
    classical: "Arts & Theatre",
    dance_performance_tour: "Arts & Theatre",
    family: "Family",
    film: "Arts & Theatre",
  };
  const segment = segmentMap[e.type ?? ""] ?? e.type ?? "Other";

  return {
    id: `sg_${e.id}`,
    source: "seatgeek",
    name: e.title,
    url: e.url,

    date: e.datetime_local?.split("T")[0] ?? null,
    time: e.datetime_local?.split("T")[1]?.slice(0, 8) ?? null,
    doorsOpen: null,

    venue: venue?.name ?? null,
    address: venue?.address ?? null,
    neighborhood: venue?.extended_address ?? null,
    lat: venue?.location?.lat ?? null,
    lng: venue?.location?.lon ?? null,

    segment,
    genre: performer?.genres?.[0]?.name ?? null,
    subGenre: performer?.genres?.[1]?.name ?? null,

    priceMin: e.stats?.lowest_price ?? null,
    priceMax: e.stats?.highest_price ?? null,
    currency: "USD",
    isFree: e.stats?.lowest_price === 0,

    status: e.status ?? null,
    availabilityTier: mapSGAvailability(e),

    travelMinutes: null,
    leaveByTime: null,
    surpriseScore: null,
  };
}

function mapSGAvailability(e) {
  if (e.status === "canceled") return "cancelled";
  if (e.status === "postponed") return "unknown";
  const lowest = e.stats?.lowest_price;
  if (lowest == null) return "unknown";
  if (lowest === 0) return "available";
  const listings = e.stats?.listing_count ?? 0;
  if (listings === 0) return "sold_out";
  if (listings < 10) return "scarce";
  return "available";
}

// ─── MERGE ───────────────────────────────────────────────────────────────────

function mergeEvents(tmEvents, sgEvents) {
  const merged = [...tmEvents];
  const usedSgIds = new Set();

  merged.forEach((tmEvent) => {
    if (tmEvent.priceMin !== null) return;

    const match = sgEvents.find((sg) => {
      if (usedSgIds.has(sg.id)) return false;
      const venueMatch = (() => {
        if (!sg.venue || !tmEvent.venue) return false;
        const a = sg.venue.toLowerCase().replace(/[^a-z0-9]/g, "");
        const b = tmEvent.venue.toLowerCase().replace(/[^a-z0-9]/g, "");
        return a.includes(b.slice(0, 12)) || b.includes(a.slice(0, 12));
      })();
      return venueMatch && sg.date === tmEvent.date;
    });

    if (match) {
      tmEvent.priceMin = match.priceMin;
      tmEvent.priceMax = match.priceMax;
      tmEvent.availabilityTier = match.availabilityTier;
      tmEvent._pricedBy = "seatgeek";
      usedSgIds.add(match.id);
    }
  });

  const sgOnlyEvents = sgEvents.filter((sg) => !usedSgIds.has(sg.id));
  console.log(`   🔀 Merged prices into ${usedSgIds.size} TM events`);
  console.log(`   ➕ Adding ${sgOnlyEvents.length} SeatGeek-only events\n`);
  return [...merged, ...sgOnlyEvents];
}

// ─── FETCH ───────────────────────────────────────────────────────────────────

async function fetchSeatGeek() {
  const { start, end } = getTonightWindow();

  const url = new URL("https://api.seatgeek.com/2/events");
  url.searchParams.set("client_id", SG_CLIENT_ID);
  url.searchParams.set("client_secret", SG_CLIENT_SECRET);
  url.searchParams.set("lat", NYC_LAT);
  url.searchParams.set("lon", NYC_LNG);
  url.searchParams.set("range", `${RADIUS_MILES}mi`);
  url.searchParams.set("datetime_local.gte", start);
  url.searchParams.set("datetime_local.lte", end);
  url.searchParams.set("per_page", "50");
  url.searchParams.set("sort", "datetime_local.asc");

  console.log("\n📡 Fetching SeatGeek...");
  console.log(`   Window: ${start} → ${end}\n`);

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`SeatGeek API error: ${res.status} ${res.statusText}`);

  const data = await res.json();
  const raw = data.events ?? [];
  console.log(`   ✅ Got ${raw.length} raw events`);

  const filtered = raw.filter((e) => e.status !== "canceled");
  console.log(`   🧹 ${filtered.length} after filtering cancelled\n`);

  return filtered.map(normalizeSeatGeekEvent);
}

// ─── REPORT ──────────────────────────────────────────────────────────────────

function printSummary(events) {
  console.log("─────────────────────────────────────────");
  console.log(`🗽 TONIGHT IN NYC — ${events.length} total events (TM + SeatGeek)\n`);

  const priceGaps = events.filter((e) => e.priceMin === null);
  const pricedBySG = events.filter((e) => e._pricedBy === "seatgeek");
  const bySegment = {};

  events.forEach((e) => {
    const seg = e.genre ?? e.segment ?? "Other";
    bySegment[seg] = (bySegment[seg] || 0) + 1;
  });

  events.slice(0, 10).forEach((e, i) => {
    const price = e.isFree ? "FREE" : e.priceMin ? `$${e.priceMin}–$${e.priceMax}` : "price unknown";
    const time = e.time ? e.time.slice(0, 5) : "TBD";
    const src = e.source === "seatgeek" ? "SG" : "TM";
    console.log(`  ${i + 1}. [${src}] ${e.name}`);
    console.log(`     📍 ${e.venue} | ⏰ ${time} | 💵 ${price} | ${e.availabilityTier}\n`);
  });

  console.log("📊 Breakdown by genre:");
  Object.entries(bySegment)
    .sort((a, b) => b[1] - a[1])
    .forEach(([g, n]) => console.log(`   ${g}: ${n}`));

  console.log(`\n✅ Price filled by SeatGeek: ${pricedBySG.length} events`);
  console.log(`⚠️  Still missing price: ${priceGaps.length} events`);
  console.log("─────────────────────────────────────────\n");
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🚀 NowGo — SeatGeek Fetcher + TM Merge");

  try {
    let tmEvents = [];
    if (fs.existsSync("data/events-tonight.json")) {
      const tmData = JSON.parse(fs.readFileSync("data/events-tonight.json", "utf8"));
      tmEvents = tmData.events ?? [];
      console.log(`📂 Loaded ${tmEvents.length} TM events from data/events-tonight.json`);
    } else {
      console.log("⚠️  No data/events-tonight.json found — run npm run fetch:tm first");
    }

    const sgEvents = await fetchSeatGeek();
    const merged = mergeEvents(tmEvents, sgEvents);
    printSummary(merged);

    const output = {
      fetchedAt: new Date().toISOString(),
      sources: ["ticketmaster", "seatgeek"],
      count: merged.length,
      tmCount: tmEvents.length,
      sgCount: sgEvents.length,
      events: merged,
    };

    fs.mkdirSync("data", { recursive: true });
    fs.writeFileSync("data/events-tonight-merged.json", JSON.stringify(output, null, 2));
    console.log("💾 Saved to data/events-tonight-merged.json");
  } catch (err) {
    console.error("❌ Error:", err.message);
    process.exit(1);
  }
}

main();
