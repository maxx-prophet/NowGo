import fetch from "node-fetch";
import fs from "fs";
import { fileURLToPath } from "url";
import { eveningDates, fetchWindow } from "../services/tonight-window.js";

// ─── DoNYC ───────────────────────────────────────────────────────────────────
//
// donyc.com is an editorial calendar: ~180 NYC listings a day, and on the day
// it was added (2026-11-17) 119 of the 169 still ahead that evening were not in
// the feed at all — comedy rooms, small music venues, DJ nights, talks, the
// Public's Joe's Pub. Ticketmaster and SeatGeek never see most of these.
//
// The site is a SvelteKit app, so there is no HTML table to scrape. Every page
// has a `__data.json` twin holding the exact data the page renders:
//
//   /events/YYYY/MM/DD/__data.json?page_size=50&page=N   one day's listings
//   <permalink>/__data.json                               one event, in full
//
// page_size is capped at 50 server-side. The listing gives title, start time,
// venue name and category; the detail adds what the feed actually needs —
// ticket link, a price line, the sold-out flag, and the venue's address and
// coordinates — so every listing that survives filtering costs one request.

const BASE = "https://donyc.com";
const PAGE_SIZE = 50;
const MAX_PAGES = 10;          // 500 a day; a normal day is ~4 pages
const DETAIL_CONCURRENCY = 4;
const USER_AGENT = "NowGo/1.0 (+https://nowgoapp.com)";

// Same radius the ticketing fetchers use. DoNYC lists Starland Ballroom (NJ)
// and UBS Arena (Elmont) next to Manhattan rooms.
const NYC_LAT = 40.758;
const NYC_LNG = -73.9855;
const RADIUS_MILES = 10;

// ─── DEVALUE ─────────────────────────────────────────────────────────────────
//
// SvelteKit serialises page data with `devalue`: one flat array in which every
// object and array holds *indices* into that array rather than values. Index 0
// is the root. Negative indices are sentinels (undefined, null, NaN, ±Infinity,
// -0); a list whose first element is a type name ("Date", "Set", ...) is a
// boxed special value. Only Date has ever appeared here, but the others are
// unwrapped rather than misread as data.
const SENTINELS = { [-1]: undefined, [-2]: null, [-3]: NaN, [-4]: Infinity, [-5]: -Infinity, [-6]: -0 };
const BOXED = new Set(["Date", "Set", "Map", "BigInt", "RegExp", "Object", "null"]);

export function unflatten(values) {
  if (typeof values === "number") return SENTINELS[values];
  if (!Array.isArray(values) || values.length === 0) return undefined;
  const hydrated = new Map();

  function hydrate(index) {
    if (index in SENTINELS) return SENTINELS[index];
    if (hydrated.has(index)) return hydrated.get(index);
    const value = values[index];

    if (Array.isArray(value)) {
      if (typeof value[0] === "string" && BOXED.has(value[0])) {
        const out = value[0] === "Date" ? value[1] : value.slice(1);
        hydrated.set(index, out);
        return out;
      }
      const out = [];
      hydrated.set(index, out);
      for (const i of value) out.push(hydrate(i));
      return out;
    }
    if (value && typeof value === "object") {
      const out = {};
      hydrated.set(index, out);
      for (const [k, i] of Object.entries(value)) out[k] = hydrate(i);
      return out;
    }
    hydrated.set(index, value);
    return value;
  }

  return hydrate(0);
}

// The page's own data is the last data node; earlier nodes are the layout's.
export function pageData(json) {
  const nodes = (json?.nodes ?? []).filter((n) => n?.type === "data");
  const last = nodes.at(-1);
  return last ? unflatten(last.data) : null;
}

// ─── PARSE ───────────────────────────────────────────────────────────────────

// DoNYC's categories, mapped onto the segments the app filters on. Film, Art,
// Talks and Nightlife are chips in the app that no other source has ever
// populated (the server matches `segment` exactly), so these listings are the
// first thing those chips can show. Anything unmapped stays null, which is
// what genre-enrichment picks up and classifies.
const SEGMENTS = {
  "Music": "Music",
  "Comedy": "Comedy",
  "Sports": "Sports",
  "Theatre & Performing Arts": "Arts & Theatre",
  "Performing Arts": "Arts & Theatre",
  "Film": "Film",
  "Art": "Art",
  "Readings & Talks": "Talks",
  "DJ / Parties": "Nightlife",
  "Karaoke": "Nightlife",
  "Drag": "Nightlife",
  "Burlesque": "Nightlife",
  "LGBTQ+": "Nightlife",
};

// Online-only listings have nowhere to walk into.
const SKIP_CATEGORIES = new Set(["Digital Events"]);

export function segmentFor(category) {
  return SEGMENTS[category] ?? null;
}

// `ticket_info` is free text an editor or promoter typed. Seen in the wild:
//   "$35"  "$13.60, 21+"  "$12.51-$23.18"  "$63.20+"  "$15 + fees"
//   "Free, 21+"  "free"  "FREE with a suggested donation"  "16+"
//   "$35.15 - $50.60 cover + $25 food/beverage minimum"
//   "Tickets are $85 - $135 (inclusive of admin fees)"
// Only the first price or range is read, so a drink minimum that follows the
// cover is not taken for the cover. "16+" and "21+" are ages, not prices,
// which is why a number must carry a "$" to count.
export function parsePriceInfo(info) {
  if (typeof info !== "string" || !info.trim()) return { priceMin: null, priceMax: null, isFree: false };
  const text = info.replace(/,(?=\d{3}\b)/g, ""); // "$1,200" → "$1200"

  const range = text.match(/\$\s*(\d+(?:\.\d{1,2})?)\s*(?:-|–|to)\s*\$?\s*(\d+(?:\.\d{1,2})?)/i);
  if (range) {
    const [a, b] = [Number(range[1]), Number(range[2])];
    return { priceMin: Math.min(a, b), priceMax: Math.max(a, b), isFree: false };
  }
  const single = text.match(/\$\s*(\d+(?:\.\d{1,2})?)/);
  if (single) {
    const price = Number(single[1]);
    // "$63.20+" is a floor, not a fixed price. "$15 + fees" is $15: only a
    // "+" right against the number means "and up".
    const open = text[single.index + single[0].length] === "+";
    return { priceMin: price, priceMax: open ? null : price, isFree: price === 0 };
  }
  if (/\bfree\b/i.test(text)) return { priceMin: 0, priceMax: 0, isFree: true };
  return { priceMin: null, priceMax: null, isFree: false };
}

// The ticket link, minus DoNYC's affiliate tag. `ticket.url` carries the tag
// (?cid=usaffdostuff); `buy_tickets` is the same link without it.
function ticketUrl(event) {
  return event.buy_tickets || event.ticket?.url || null;
}

function haversineMiles(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(a));
}

// Why a listing is not an event the feed can use, or null if it is.
export function skipReason(listing, detail) {
  if (listing.type && listing.type !== "event") return "not-an-event";
  // A run (a play's season, an exhibition) carries the run's first day as its
  // start, not tonight's curtain. A mistimed event is worse than a missing one.
  if (listing.event_type && listing.event_type !== "single_day") return "multi-day";
  if (!listing.tz_adjusted_begin_time) return "untimed";
  if (SKIP_CATEGORIES.has(listing.category)) return "online";
  // Not every online listing is filed under Digital Events; some only say so
  // in the venue: "VIRTUAL", "Online Event", "Zoom".
  if (/^\s*(virtual|online|zoom|livestream)\b/i.test(listing.venue?.title ?? "")) return "online";
  if (/\bprivate\b/i.test(listing.title ?? "")) return "private";
  // "TBA (not the Venue)" is a real venue label on DoNYC.
  if (!listing.venue?.title || /^\s*(tba|tbd)\b/i.test(listing.venue.title)) return "no-venue";
  if (detail?.is_past) return "past";

  const v = detail?.seo_source?.venue;
  if (v?.state && v.state !== "NY") return "out-of-area";
  if (v?.latitude != null && v?.longitude != null &&
      haversineMiles(NYC_LAT, NYC_LNG, Number(v.latitude), Number(v.longitude)) > RADIUS_MILES) {
    return "out-of-area";
  }
  return null;
}

// One listing (+ its detail page, when it was fetched) → the fetcher contract
// db/ingest.js expects. `time` is bare NYC wall-clock HH:MM:SS: DoNYC hands us
// "2026-11-17T20:00:00-05:00", and passing the offset through is exactly the
// jazz-fetcher bug in CLAUDE.md — ingest would build "…-05:00Z" and drop it.
export function normalizeDoNYCEvent(listing, detail = null) {
  const begin = listing.tz_adjusted_begin_time;
  const date = begin.slice(0, 10);
  const time = begin.slice(11, 19);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}:\d{2}$/.test(time)) return null;

  const venue = detail?.seo_source?.venue ?? {};
  const price = parsePriceInfo(detail?.ticket_info);
  const isFree = Boolean(detail?.free_event) || price.isFree;
  const soldOut = Boolean(detail?.tickets_sold_out) || detail?.ticket?.availability?.state === "sold-out";

  return {
    id: `dn_${listing.id}`,
    source: "donyc",
    name: decodeEntities(listing.title),
    // A real ticket page when there is one; DoNYC's own page otherwise, which
    // at least has the time, venue and description.
    url: ticketUrl(detail ?? {}) ?? `${BASE}${listing.permalink}`,
    donycUrl: `${BASE}${listing.permalink}`,

    date,
    time,
    // The same instant with its offset, for matching against stored rows.
    // Ingest never reads it; it builds start_time from date + time.
    startTime: begin,
    doorsOpen: null,

    venue: decodeEntities(listing.venue.title),
    address: venue.address ?? detail?.venue?.address ?? null,
    lat: venue.latitude ?? null,
    lng: venue.longitude ?? null,
    venueUrl: venue.website_url ?? detail?.venue?.website_url ?? null,

    segment: segmentFor(listing.category),
    genre: listing.genres?.[0] ?? (listing.category === "Comedy" ? "Comedy" : null),
    subGenre: listing.genres?.[1] ?? null,

    priceMin: isFree ? 0 : price.priceMin,
    priceMax: isFree ? 0 : price.priceMax,
    currency: "USD",
    isFree,

    // Only an explicit sold-out flag is believed. DoNYC marks nearly everything
    // else "On sale" — that says tickets were offered, not that any are left,
    // so it is not promoted to "available". "unknown" is the honest default.
    availabilityTier: soldOut ? "sold_out" : "unknown",

    category: listing.category ?? null,
    venueDistrict: listing.venue.district_name ?? null,
  };
}

const ENTITIES = { "&amp;": "&", "&quot;": '"', "&#39;": "'", "&apos;": "'", "&lt;": "<", "&gt;": ">" };
function decodeEntities(s) {
  return typeof s === "string" ? s.replace(/&(?:amp|quot|#39|apos|lt|gt);/g, (m) => ENTITIES[m]).trim() : s;
}

// DoNYC sometimes lists one event twice under two labels for the same room —
// "Eiffel Tower Mic" at both "Eris" and "Eris Mainstage", same minute. Keep
// one: the listing with coordinates and a real ticket link wins.
export function dedupeWithinSource(events) {
  const key = (e) => `${e.date}T${e.time}|${e.name.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
  const score = (e) => (e.lat != null ? 2 : 0) + (e.url !== e.donycUrl ? 1 : 0);
  const byKey = new Map();
  for (const e of events) {
    const k = key(e);
    const current = byKey.get(k);
    if (!current || score(e) > score(current)) byKey.set(k, e);
  }
  return [...byKey.values()];
}

// ─── FETCH ───────────────────────────────────────────────────────────────────

async function getJson(url, fetchImpl) {
  const res = await fetchImpl(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
  if (!res.ok) throw new Error(`DoNYC ${res.status} for ${url}`);
  return res.json();
}

const datePath = ({ year, month, day }) =>
  `${year}/${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}`;

function addDay({ year, month, day }) {
  const d = new Date(Date.UTC(year, month - 1, day + 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

async function fetchDayListings(date, fetchImpl) {
  const listings = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `${BASE}/events/${datePath(date)}/__data.json?page_size=${PAGE_SIZE}&page=${page}`;
    let browse;
    try {
      browse = pageData(await getJson(url, fetchImpl))?.browse;
    } catch (err) {
      if (page === 1) throw err;
      console.warn(`   ⚠️  DoNYC ${datePath(date)} page ${page} failed (${err.message}) — keeping ${listings.length}`);
      break;
    }
    if (!browse) throw new Error(`DoNYC page shape changed: no 'browse' in ${url}`);
    for (const group of browse.data ?? []) listings.push(...(group.events ?? []));
    if (!browse._meta?.has_next) break;
  }
  return listings;
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

let lastFetchStats = null;
export function getLastFetchStats() {
  return lastFetchStats;
}

// Both evenings the feed serves, plus the calendar day after tomorrow's
// evening for its after-midnight tail. Listings outside the fetch window are
// dropped before any detail page is requested.
export async function fetchDoNYC({ now = new Date(), fetchImpl = fetch } = {}) {
  const { tonight, tomorrow } = eveningDates(now);
  const dates = [tonight, tomorrow, addDay(tomorrow)];
  const { utcEnd } = fetchWindow(now);
  const windowEnd = new Date(utcEnd).getTime();
  const notBefore = now.getTime() - 30 * 60 * 1000;

  console.log("\n📡 Fetching DoNYC...");
  const seen = new Set();
  const listings = [];
  for (const date of dates) {
    for (const l of await fetchDayListings(date, fetchImpl)) {
      // A listing appears under every day of a run; one copy is enough.
      const k = `${l.id}|${l.tz_adjusted_begin_time}`;
      if (seen.has(k)) continue;
      seen.add(k);
      listings.push(l);
    }
  }

  const skipped = {};
  const skip = (reason) => { skipped[reason] = (skipped[reason] ?? 0) + 1; };

  const inWindow = listings.filter((l) => {
    const reason = skipReason(l, null);
    if (reason) { skip(reason); return false; }
    const t = new Date(l.tz_adjusted_begin_time).getTime();
    if (!(t >= notBefore && t < windowEnd)) { skip("outside-window"); return false; }
    return true;
  });
  console.log(`   ✅ ${listings.length} listings over ${dates.length} days, ${inWindow.length} in the window`);

  let detailFailures = 0;
  const events = (await mapLimit(inWindow, DETAIL_CONCURRENCY, async (l) => {
    let detail = null;
    try {
      detail = pageData(await getJson(`${BASE}${l.permalink}/__data.json`, fetchImpl))?.event ?? null;
    } catch {
      // The listing alone still makes a usable event — time, venue, title —
      // just without price, coordinates or a ticket link.
      detailFailures++;
    }
    const reason = skipReason(l, detail);
    if (reason) { skip(reason); return null; }
    return normalizeDoNYCEvent(l, detail);
  })).filter(Boolean);

  const unique = dedupeWithinSource(events);
  if (unique.length < events.length) skipped["same-event-two-labels"] = events.length - unique.length;

  lastFetchStats = { listings: listings.length, events: unique.length, detailFailures, skipped };
  const skippedStr = Object.entries(skipped).map(([k, v]) => `${k} ${v}`).join(", ") || "none";
  console.log(`   🧹 ${unique.length} events kept; skipped: ${skippedStr}`);
  if (detailFailures) console.warn(`   ⚠️  ${detailFailures} detail page(s) failed — kept from listing data alone`);
  return unique;
}

// ─── MAIN (CLI only) ──────────────────────────────────────────────────────────

async function main() {
  console.log("🚀 NowGo — DoNYC Fetcher");
  const events = await fetchDoNYC();
  fs.mkdirSync("data", { recursive: true });
  const output = { fetchedAt: new Date().toISOString(), sources: ["donyc"], count: events.length, events };
  fs.writeFileSync("data/events-donyc.json", JSON.stringify(output, null, 2));
  console.log(`💾 Saved ${events.length} events to data/events-donyc.json`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error("❌ Error:", err.message);
    process.exit(1);
  });
}
