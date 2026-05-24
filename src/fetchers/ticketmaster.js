import fetch from "node-fetch";
import fs from "fs";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
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
  end.setDate(end.getDate() + 1);
  end.setHours(2, 0, 0, 0);
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

  const rawSegment = classification?.segment?.name;
  const rawGenre = classification?.genre?.name;

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

    segment: rawSegment && rawSegment !== "Undefined" ? rawSegment : null,
    genre: rawGenre && rawGenre !== "Undefined" ? rawGenre : null,
    subGenre: classification?.subGenre?.name !== "Undefined" ? (classification?.subGenre?.name ?? null) : null,

    priceMin: price?.min ?? null,
    priceMax: price?.max ?? null,
    currency: price?.currency ?? "USD",
    isFree: price != null && price.min === 0,

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

export async function fetchTicketmaster() {
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
  console.log(`   🧹 ${filtered.length} after filtering cancelled + multi-day`);

  return filtered.map(normalizeTicketmasterEvent);
}

// ─── MAIN (CLI only) ──────────────────────────────────────────────────────────

async function main() {
  console.log("🚀 NowGo — Ticketmaster Fetcher");
  try {
    const events = await fetchTicketmaster();
    const output = { fetchedAt: new Date().toISOString(), source: "ticketmaster", count: events.length, events };
    fs.mkdirSync("data", { recursive: true });
    fs.writeFileSync("data/events-tonight.json", JSON.stringify(output, null, 2));
    console.log(`💾 Saved ${events.length} events to data/events-tonight.json`);
  } catch (err) {
    console.error("❌ Error:", err.message);
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
