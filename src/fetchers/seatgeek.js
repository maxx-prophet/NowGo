import fetch from "node-fetch";
import fs from "fs";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { findVenueByEmbedding } from "../services/venue-embeddings.js";
import { tonightWindow } from "../services/tonight-window.js";
dotenv.config({ path: ".env.nowgo" });

const NYC_LAT = 40.758;
const NYC_LNG = -73.9855;
const RADIUS_MILES = 10;

const SG_PAGE_SIZE = 100;
const SG_MAX_EVENTS = 1000;

// ─── NORMALIZE ───────────────────────────────────────────────────────────────

// SeatGeek's `type` is league-level ("mlb", "wnba", "tennis", "broadway"), not
// category-level, and they add new ones without notice. A hand-kept type→segment
// map therefore always trails their catalog, and the old fallback stored every
// unmapped type verbatim — leaving 89 sports events under segments like "tennis"
// and "mlb" that the Sports filter (segment = 'Sports') could never match.
//
// Every event instead carries a `taxonomies` chain whose root (parent_id null)
// is one of exactly four stable ids, so derive the segment from that. A league
// SeatGeek invents tomorrow still hangs off root 1000000 and lands in Sports.
const SG_ROOT_SEGMENTS = {
  1000000: "Sports",
  2000000: "Music",
  3000000: "Arts & Theatre",
  // 4000000 "addon" is parking passes and merch, not an event.
};

// Two children of Theater are top-level segments in NowGo's own vocabulary.
// Keyed by the id's second level, so sub-genres (3040100) resolve too.
const SG_THEATER_OVERRIDES = {
  304: "Comedy",
  305: "Family", // Family Entertainment
};

export function segmentFromTaxonomies(taxonomies) {
  if (!Array.isArray(taxonomies)) return null;

  const root = taxonomies.find((t) => t?.parent_id == null);
  const base = root ? SG_ROOT_SEGMENTS[root.id] : null;
  if (!base) return null;
  if (root.id !== 3000000) return base;

  for (const t of taxonomies) {
    const override = SG_THEATER_OVERRIDES[Math.floor((t?.id ?? 0) / 10000)];
    if (override) return override;
  }
  return base;
}

export function normalizeSeatGeekEvent(e) {
  const venue = e.venue;
  const performer = e.performers?.[0];

  // Falls back to null, never to the raw type: null is what the LLM enrichment
  // pass in services/genre-enrichment.js picks up, so an unclassified event
  // self-heals instead of sitting forever under a segment nothing filters on.
  const segment = segmentFromTaxonomies(e.taxonomies);

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
    isFree: e.stats?.lowest_price === 0 && (e.stats?.listing_count ?? 0) > 0,

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
  const listings = e.stats?.listing_count ?? 0;
  if (listings === 0) return "unknown";
  if (lowest === 0) return "available";
  if (listings < 10) return "scarce";
  return "available";
}

// SeatGeek describes the resale market; Ticketmaster describes its own
// inventory, and the event's ticket link points at Ticketmaster. So SeatGeek
// may only ADD information, never contradict a definitive Ticketmaster status.
//
// Overwriting unconditionally sent users to dead Ticketmaster pages for events
// TM had already marked offsale, and relabelled half of the on-sale catalog
// "unknown" simply because SeatGeek had no listing for it.
//
// Rule: the more restrictive known tier wins; "unknown" never beats a known one.
const AVAILABILITY_RANK = {
  cancelled: 4,
  sold_out: 3,
  scarce: 2,
  available: 1,
};

export function resolveAvailability(tmTier, sgTier) {
  const tmRank = AVAILABILITY_RANK[tmTier] ?? 0;
  const sgRank = AVAILABILITY_RANK[sgTier] ?? 0;

  // Neither side knows anything.
  if (!tmRank && !sgRank) return tmTier ?? sgTier ?? "unknown";
  return sgRank > tmRank ? sgTier : tmTier;
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
      tmEvent.availabilityTier = resolveAvailability(
        tmEvent.availabilityTier,
        match.availabilityTier
      );
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

  // SeatGeek's datetime_local filters are naive NYC wall-clock, not UTC.
  const { localStart: start, localEnd: end } = tonightWindow();

  console.log("\n📡 Fetching SeatGeek...");
  console.log(`   Window: ${start} → ${end}`);

  // Same truncation as Ticketmaster: one page of 50, sorted ascending, so the
  // late-evening events fall off the end on any busy night.
  const raw = [];
  let page = 1;
  let total = Infinity;

  while (raw.length < total && raw.length < SG_MAX_EVENTS) {
    const url = new URL("https://api.seatgeek.com/2/events");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("client_secret", clientSecret);
    url.searchParams.set("lat", NYC_LAT);
    url.searchParams.set("lon", NYC_LNG);
    url.searchParams.set("range", `${RADIUS_MILES}mi`);
    url.searchParams.set("datetime_local.gte", start);
    url.searchParams.set("datetime_local.lte", end);
    url.searchParams.set("per_page", String(SG_PAGE_SIZE));
    url.searchParams.set("page", String(page));
    url.searchParams.set("sort", "datetime_local.asc");

    const res = await fetch(url.toString());
    if (!res.ok) {
      if (page > 1) {
        console.warn(`   ⚠️  Page ${page} failed (${res.status}) — keeping ${raw.length} events so far`);
        break;
      }
      throw new Error(`SeatGeek API error: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    const events = data.events ?? [];
    raw.push(...events);

    total = data.meta?.total ?? raw.length;
    page += 1;

    if (events.length === 0) break;
  }

  console.log(`   ✅ Got ${raw.length} raw events across ${page - 1} page(s)`);

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
