import fetch from "node-fetch";
import fs from "fs";
import dotenv from "dotenv";
dotenv.config({ path: ".env.nowgo" });

const APP_ID = process.env.BANDSINTOWN_APP_ID;
const NYC_LAT = 40.758;
const NYC_LNG = -73.9855;
const RADIUS_MILES = 10;

if (!APP_ID) {
  console.error("❌ Missing BANDSINTOWN_APP_ID in .env.nowgo");
  process.exit(1);
}

// ─── NORMALIZE ───────────────────────────────────────────────────────────────

const SEGMENT_MAP = {
  rock: "Music",
  pop: "Music",
  "hip-hop": "Music",
  "r&b": "Music",
  jazz: "Music",
  electronic: "Music",
  country: "Music",
  folk: "Music",
  classical: "Music",
  metal: "Music",
  punk: "Music",
  indie: "Music",
  alternative: "Music",
  latin: "Music",
  reggae: "Music",
  soul: "Music",
  blues: "Music",
  comedy: "Arts & Theatre",
  theater: "Arts & Theatre",
  dance: "Arts & Theatre",
  sports: "Sports",
  family: "Family",
};

function normalizeSegment(genres = []) {
  for (const g of genres) {
    const mapped = SEGMENT_MAP[g.toLowerCase()];
    if (mapped) return { segment: mapped, genre: g };
  }
  return { segment: "Music", genre: genres[0] ?? null };
}

function normalizeBandsintownEvent(e) {
  const { segment, genre } = normalizeSegment(e.artist?.genre ? [e.artist.genre] : []);

  const lat = parseFloat(e.venue?.latitude) || null;
  const lng = parseFloat(e.venue?.longitude) || null;

  return {
    id: `bt_${e.id}`,
    source: "bandsintown",
    name: e.title || e.artist?.name || "Unknown Event",
    url: e.url ?? e.artist?.url ?? null,

    date: e.datetime?.split("T")[0] ?? null,
    time: e.datetime?.split("T")[1]?.slice(0, 8) ?? null,
    doorsOpen: null,

    venue: e.venue?.name ?? null,
    address: e.venue?.street_address ?? null,
    neighborhood: `${e.venue?.city ?? ""}, ${e.venue?.region ?? ""}`.trim().replace(/^,\s*/, "") || null,
    lat,
    lng,

    segment,
    genre,
    subGenre: null,

    priceMin: 0,
    priceMax: null,
    currency: "USD",
    isFree: true,

    status: e.on_sale_datetime ? "onsale" : null,
    availabilityTier: "available",

    travelMinutes: null,
    leaveByTime: null,
    surpriseScore: null,
  };
}

// ─── FETCH ───────────────────────────────────────────────────────────────────

async function fetchBandsintown() {
  const today = new Date().toISOString().split("T")[0];

  const url = new URL("https://rest.bandsintown.com/events/search");
  url.searchParams.set("app_id", APP_ID);
  url.searchParams.set("location", `${NYC_LAT},${NYC_LNG}`);
  url.searchParams.set("radius", RADIUS_MILES);
  url.searchParams.set("date", today);

  console.log("\n📡 Fetching Bandsintown...");
  console.log(`   URL: ${url.toString()}\n`);

  const res = await fetch(url.toString());

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Bandsintown API error: ${res.status} ${res.statusText}\n   Body: ${body}`);
  }

  const data = await res.json();
  const raw = Array.isArray(data) ? data : data.events ?? data.data ?? [];

  console.log(`   ✅ Got ${raw.length} raw events`);
  return raw.map(normalizeBandsintownEvent);
}

// ─── REPORT ──────────────────────────────────────────────────────────────────

function printSummary(events) {
  console.log("─────────────────────────────────────────");
  console.log(`🗽 BANDSINTOWN — ${events.length} events tonight\n`);

  events.slice(0, 10).forEach((e, i) => {
    const time = e.time ? e.time.slice(0, 5) : "TBD";
    console.log(`  ${i + 1}. ${e.name}`);
    console.log(`     📍 ${e.venue} | ⏰ ${time} | 🎟 FREE\n`);
  });

  if (events.length > 10) console.log(`  ... and ${events.length - 10} more\n`);
  console.log("─────────────────────────────────────────\n");
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🚀 NowGo — Bandsintown Fetcher");

  try {
    const events = await fetchBandsintown();
    printSummary(events);

    const output = {
      fetchedAt: new Date().toISOString(),
      source: "bandsintown",
      count: events.length,
      events,
    };

    fs.mkdirSync("data", { recursive: true });
    fs.writeFileSync("data/events-tonight-bandsintown.json", JSON.stringify(output, null, 2));
    console.log("💾 Saved to data/events-tonight-bandsintown.json");
  } catch (err) {
    console.error("❌ Error:", err.message);
    process.exit(1);
  }
}

main();
