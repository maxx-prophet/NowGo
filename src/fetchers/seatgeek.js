import fetch from "node-fetch";
import fs from "fs";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { findVenueByEmbedding } from "../services/venue-embeddings.js";
dotenv.config({ path: ".env.nowgo" });

const NYC_LAT = 40.758;
const NYC_LNG = -73.9855;
const RADIUS_MILES = 10;

function getTonightWindow() {
  const now = new Date();
  const start = new Date(now);
  start.setHours(17, 0, 0, 0);
  const end = new Date(now);
  end.setDate(end.getDate() + 1);
  end.setHours(2, 0, 0, 0);
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
    music_festival: "Music",
    sports: "Sports",
    wrestling: "Sports",
    football: "Sports",
    baseball: "Sports",
    basketball: "Sports",
    hockey: "Sports",
    theater: "Arts & Theatre",
    broadway: "Arts & Theatre",
    comedy: "Arts & Theatre",
    classical: "Arts & Theatre",
    dance_performance_tour: "Arts & Theatre",
    entertainment: "Arts & Theatre",
    film: "Arts & Theatre",
    family: "Family",
  };
  const rawType = e.type ?? "";
  const segment = segmentMap[rawType] ?? (rawType && rawType !== "Undefined" ? rawType : null);

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
    genre: performer?.genres?.[0]?.name !== "Undefined" ? (performer?.genres?.[0]?.name ?? null) : null,
    subGenre: performer?.genres?.[1]?.name !== "Undefined" ? (performer?.genres?.[1]?.name ?? null) : null,

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

function norm(s) {
  return (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function stringsOverlap(a, b) {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return false;
  // Full containment in either direction handles abbreviations and suffixes
  if (na.includes(nb) || nb.includes(na)) return true;
  // Prefix match at the length of the shorter string
  const len = Math.min(na.length, nb.length);
  return na.slice(0, len) === nb.slice(0, len);
}

export async function mergeEvents(tmEvents, sgEvents, aliasMap = new Map(), dbPool = null) {
  function resolveVenueName(name, pgCache) {
    const n = norm(name);
    return pgCache.get(n) ?? aliasMap.get(n) ?? n;
  }

  // Pre-resolve all unique SG venue names via pgvector (one OpenAI call per unique venue)
  const pgVenueCache = new Map();
  if (dbPool) {
    const uniqueVenues = [...new Set(sgEvents.map(sg => sg.venue).filter(Boolean))];
    for (const venueName of uniqueVenues) {
      const n = norm(venueName);
      if (aliasMap.has(n)) continue; // alias already covers it
      const canonical = await findVenueByEmbedding(dbPool, venueName);
      if (canonical) pgVenueCache.set(n, norm(canonical));
    }
    if (pgVenueCache.size > 0) {
      console.log(`   🧠 pgvector resolved ${pgVenueCache.size} venue(s) semantically`);
    }
  }

  const merged = [...tmEvents];
  const usedSgIds = new Set();
  let pricesFilled = 0;

  merged.forEach((tmEvent) => {
    if (tmEvent.priceMin !== null) return;

    const match = sgEvents.find((sg) => {
      if (usedSgIds.has(sg.id)) return false;
      if (sg.date !== tmEvent.date) return false;
      const sgVenue = resolveVenueName(sg.venue, pgVenueCache);
      const tmVenue = resolveVenueName(tmEvent.venue, pgVenueCache);
      return stringsOverlap(sgVenue, tmVenue) || stringsOverlap(sg.name, tmEvent.name);
    });

    if (match) {
      if (match.priceMin !== null) {
        tmEvent.priceMin = match.priceMin;
        tmEvent.priceMax = match.priceMax;
        tmEvent.isFree = match.isFree;
        tmEvent._pricedBy = "seatgeek";
        pricesFilled++;
      }
      tmEvent.availabilityTier = match.availabilityTier;
      usedSgIds.add(match.id);
    }
  });

  const sgOnlyEvents = sgEvents.filter((sg) => !usedSgIds.has(sg.id));
  console.log(`   🔀 Matched ${usedSgIds.size} SeatGeek events (${pricesFilled} price fills)`);
  console.log(`   ➕ Adding ${sgOnlyEvents.length} SeatGeek-only events`);
  return [...merged, ...sgOnlyEvents];
}

// ─── FETCH ───────────────────────────────────────────────────────────────────

export async function fetchSeatGeek(tmEvents = [], aliasMap = new Map(), dbPool = null) {
  const clientId = process.env.SEATGEEK_CLIENT_ID;
  const clientSecret = process.env.SEATGEEK_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Missing SEATGEEK_CLIENT_ID or SEATGEEK_CLIENT_SECRET in .env.nowgo");
  }

  const { start, end } = getTonightWindow();

  const url = new URL("https://api.seatgeek.com/2/events");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("client_secret", clientSecret);
  url.searchParams.set("lat", NYC_LAT);
  url.searchParams.set("lon", NYC_LNG);
  url.searchParams.set("range", `${RADIUS_MILES}mi`);
  url.searchParams.set("datetime_local.gte", start);
  url.searchParams.set("datetime_local.lte", end);
  url.searchParams.set("per_page", "50");
  url.searchParams.set("sort", "datetime_local.asc");

  console.log("\n📡 Fetching SeatGeek...");
  console.log(`   Window: ${start} → ${end}`);

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`SeatGeek API error: ${res.status} ${res.statusText}`);

  const data = await res.json();
  const raw = data.events ?? [];
  console.log(`   ✅ Got ${raw.length} raw events`);

  const filtered = raw.filter((e) => e.status !== "canceled");
  console.log(`   🧹 ${filtered.length} after filtering cancelled`);

  const sgEvents = filtered.map(normalizeSeatGeekEvent);
  return mergeEvents(tmEvents, sgEvents, aliasMap, dbPool);
}

// ─── MAIN (CLI only) ──────────────────────────────────────────────────────────

async function main() {
  console.log("🚀 NowGo — SeatGeek Fetcher + TM Merge");
  try {
    let tmEvents = [];
    if (fs.existsSync("data/events-tonight.json")) {
      const tmData = JSON.parse(fs.readFileSync("data/events-tonight.json", "utf8"));
      tmEvents = tmData.events ?? [];
      console.log(`📂 Loaded ${tmEvents.length} TM events from data/events-tonight.json`);
    }

    const merged = await fetchSeatGeek(tmEvents);
    const output = {
      fetchedAt: new Date().toISOString(),
      sources: ["ticketmaster", "seatgeek"],
      count: merged.length,
      events: merged,
    };
    fs.mkdirSync("data", { recursive: true });
    fs.writeFileSync("data/events-tonight-merged.json", JSON.stringify(output, null, 2));
    console.log(`💾 Saved ${merged.length} events to data/events-tonight-merged.json`);
  } catch (err) {
    console.error("❌ Error:", err.message);
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
