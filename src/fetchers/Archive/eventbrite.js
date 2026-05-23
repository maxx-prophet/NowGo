import fetch from "node-fetch";
import fs from "fs";
import dotenv from "dotenv";
dotenv.config({ path: ".env.nowgo" });

const EB_TOKEN = process.env.EVENTBRITE_API_KEY;
const NYC_LAT = 40.758;
const NYC_LNG = -73.9855;
const RADIUS_MILES = 10;

if (!EB_TOKEN) {
  console.error("❌ Missing EVENTBRITE_API_KEY in .env.nowgo");
  console.error("   Get one at: eventbrite.com → Account Settings → Developer Links → API Keys");
  process.exit(1);
}

function getTonightWindow() {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 0);
  return {
    start: start.toISOString().replace(".000", ""),
    end: end.toISOString().replace(".000", ""),
  };
}

// ─── NORMALIZE ───────────────────────────────────────────────────────────────

function normalizeEventbriteEvent(e) {
  const venue = e.venue ?? {};
  const address = venue.address ?? {};
  const lat = parseFloat(address.latitude) || null;
  const lng = parseFloat(address.longitude) || null;
  const isFree = e.is_free === true;

  // Map Eventbrite categories to NowGo segments
  const categoryMap = {
    "Music": "Music",
    "Film, Media & Entertainment": "Arts & Theatre",
    "Performing & Visual Arts": "Arts & Theatre",
    "Sports & Fitness": "Sports",
    "Food & Drink": "Other",
    "Community & Culture": "Other",
    "Family & Education": "Family",
    "Comedy": "Comedy",
    "Nightlife": "Music",
    "Festivals & Fairs": "Festival",
  };
  const categoryName = e.category?.name ?? null;
  const segment = categoryMap[categoryName] ?? "Other";

  const ticket = e.ticket_availability ?? {};
  let availabilityTier = "unknown";
  if (e.status === "completed" || e.status === "canceled") {
    availabilityTier = "cancelled";
  } else if (ticket.is_sold_out) {
    availabilityTier = "sold_out";
  } else if (ticket.has_available_tickets) {
    availabilityTier = ticket.minimum_ticket_price?.value < 10 ? "available" : "available";
  }

  const priceMin = isFree ? 0 : parseFloat(ticket.minimum_ticket_price?.major_value) || null;
  const priceMax = isFree ? 0 : parseFloat(ticket.maximum_ticket_price?.major_value) || null;

  return {
    id: `eb_${e.id}`,
    source: "eventbrite",
    name: e.name?.text ?? "Eventbrite Event",
    url: e.url,

    date: e.start?.local?.slice(0, 10) ?? null,
    time: e.start?.local?.slice(11, 19) ?? null,
    doorsOpen: null,

    venue: venue.name ?? null,
    address: address.address_1 ?? null,
    neighborhood: address.city ?? null,
    lat,
    lng,

    segment,
    genre: categoryName,
    subGenre: e.subcategory?.name ?? null,

    priceMin,
    priceMax,
    currency: ticket.minimum_ticket_price?.currency ?? "USD",
    isFree,

    status: e.status ?? null,
    availabilityTier,

    travelMinutes: null,
    leaveByTime: null,
    surpriseScore: null,
  };
}

// ─── FETCH ───────────────────────────────────────────────────────────────────

async function fetchEventbrite() {
  const { start, end } = getTonightWindow();

  const url = new URL("https://www.eventbriteapi.com/v3/events/search/");
  url.searchParams.set("location.latitude", NYC_LAT);
  url.searchParams.set("location.longitude", NYC_LNG);
  url.searchParams.set("location.within", `${RADIUS_MILES}mi`);
  url.searchParams.set("start_date.range_start", start);
  url.searchParams.set("start_date.range_end", end);
  url.searchParams.set("expand", "venue,ticket_availability,category,subcategory");
  url.searchParams.set("page_size", "50");

  console.log("\n📡 Fetching Eventbrite...");
  console.log(`   Window: ${start} → ${end}\n`);

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${EB_TOKEN}` },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Eventbrite API error: ${res.status} — ${err.error_description ?? res.statusText}`);
  }

  const data = await res.json();

  // Log raw shape on first run so we can verify field mapping
  if (data.events?.length > 0) {
    console.log("   📋 Sample raw event fields:", Object.keys(data.events[0]).join(", "));
  }

  const raw = data.events ?? [];
  console.log(`   ✅ Got ${raw.length} raw events (page 1 of ${data.pagination?.page_count ?? "?"})`);

  const filtered = raw.filter((e) => e.status !== "canceled" && e.status !== "completed");
  console.log(`   🧹 ${filtered.length} after filtering cancelled\n`);

  return filtered.map(normalizeEventbriteEvent);
}

// ─── MERGE ───────────────────────────────────────────────────────────────────

function mergeWithExisting(existingEvents, ebEvents) {
  const existingKeys = new Set(
    existingEvents.map((e) => `${(e.venue ?? "").toLowerCase().slice(0, 12)}_${e.date}_${(e.time ?? "").slice(0, 5)}`)
  );

  const newOnly = ebEvents.filter((e) => {
    const key = `${(e.venue ?? "").toLowerCase().slice(0, 12)}_${e.date}_${(e.time ?? "").slice(0, 5)}`;
    return !existingKeys.has(key);
  });

  console.log(`   ➕ Adding ${newOnly.length} Eventbrite-only events (${ebEvents.length - newOnly.length} duplicates skipped)\n`);
  return [...existingEvents, ...newOnly];
}

// ─── REPORT ──────────────────────────────────────────────────────────────────

function printSummary(ebEvents, totalEvents) {
  console.log("─────────────────────────────────────────");
  console.log(`🎟️  EVENTBRITE — ${ebEvents.length} events tonight\n`);

  ebEvents.slice(0, 10).forEach((e, i) => {
    const price = e.isFree ? "FREE" : e.priceMin ? `$${e.priceMin}–$${e.priceMax}` : "price unknown";
    const time = e.time ? e.time.slice(0, 5) : "TBD";
    console.log(`  ${i + 1}. ${e.name}`);
    console.log(`     📍 ${e.venue} | ⏰ ${time} | 💵 ${price} | ${e.availabilityTier}\n`);
  });

  if (ebEvents.length > 10) console.log(`  ... and ${ebEvents.length - 10} more\n`);

  console.log(`🗽 TOTAL TONIGHT: ${totalEvents} events across all sources`);
  console.log("─────────────────────────────────────────\n");
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🚀 NowGo — Eventbrite Fetcher");

  try {
    let existingEvents = [];
    const inputPath = fs.existsSync("data/events-tonight-final.json")
      ? "data/events-tonight-final.json"
      : fs.existsSync("data/events-tonight-merged.json")
      ? "data/events-tonight-merged.json"
      : null;

    if (inputPath) {
      const data = JSON.parse(fs.readFileSync(inputPath, "utf8"));
      existingEvents = data.events ?? [];
      console.log(`📂 Loaded ${existingEvents.length} existing events from ${inputPath}`);
    }

    const ebEvents = await fetchEventbrite();
    const finalEvents = mergeWithExisting(existingEvents, ebEvents);
    printSummary(ebEvents, finalEvents.length);

    const output = {
      fetchedAt: new Date().toISOString(),
      sources: ["ticketmaster", "seatgeek", "eventbrite"],
      count: finalEvents.length,
      ebCount: ebEvents.length,
      events: finalEvents,
    };

    fs.mkdirSync("data", { recursive: true });
    fs.writeFileSync("data/events-tonight-final.json", JSON.stringify(output, null, 2));
    console.log("💾 Saved to data/events-tonight-final.json");
  } catch (err) {
    console.error("❌ Error:", err.message);
    process.exit(1);
  }
}

main();
