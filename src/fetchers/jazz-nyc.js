import fetch from "node-fetch";
import fs from "fs";
import { fileURLToPath } from "url";

const NYC_AREAS = new Set(["MT", "BK", "BX", "QU", "SI"]);

const AREA_NAMES = {
  MT: "Manhattan",
  BK: "Brooklyn",
  BX: "Bronx",
  QU: "Queens",
  SI: "Staten Island",
};

// ─── PARSE ───────────────────────────────────────────────────────────────────

// The schedule table writes set times in several shapes:
//   "7:00PM"                  single set
//   "7:00PM - 11:00PM"        a range; we want the start
//   "7:00 PM & 9:30 PM"       two sets, with a space before the meridiem
//   "8:00 PM & 10:30 PM"      the second set is often the late-night one
//
// Each set is a separate thing a user can go to, so each becomes its own event.
// Anything unparseable yields an empty list rather than a null that downstream
// code turns into midnight — a mistimed event is worse than a missing one.
export function parseSetTimes(timeStr) {
  if (typeof timeStr !== "string" || !timeStr.trim()) return [];

  const times = [];
  // Split on set separators (& / "and" / ","), then take the start of any range.
  for (const chunk of timeStr.split(/\s*(?:&|,|\band\b)\s*/i)) {
    const start = chunk.split(/\s*-\s*/)[0];
    // Optional whitespace and dots around the meridiem: "7:00PM", "7:00 PM", "7:00 p.m."
    const match = start.match(/(\d{1,2}):(\d{2})\s*([AP])\.?\s*M\.?/i);
    if (!match) continue;

    const [, rawH, minutes, meridiem] = match;
    let hour = parseInt(rawH, 10);
    if (hour < 1 || hour > 12 || parseInt(minutes, 10) > 59) continue;

    const isPM = meridiem.toUpperCase() === "P";
    if (isPM && hour !== 12) hour += 12;
    if (!isPM && hour === 12) hour = 0;

    const formatted = `${String(hour).padStart(2, "0")}:${minutes}:00`;
    if (!times.includes(formatted)) times.push(formatted);
  }

  return times;
}

function parseDate(dateStr) {
  const match = dateStr.match(/(\d+)\/(\d+)\/(\d+)/);
  if (!match) return null;
  const [, m, d, y] = match;
  return `20${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function makeId(date, time, venue, performer) {
  const slug = `${date}_${time ?? ""}_${venue}_${performer}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .slice(0, 60);
  return `jnyc_${slug}`;
}

function normalizeRow(date, time, area, venue, performer) {
  const nycOffsetStr = new Date().toLocaleString("en-US", { timeZone: "America/New_York", timeZoneName: "shortOffset" }).match(/GMT([+-]\d+)/)?.[1];
  const nycOffset = nycOffsetStr ? `${parseInt(nycOffsetStr) >= 0 ? "+" : "-"}${String(Math.abs(parseInt(nycOffsetStr))).padStart(2, "0")}:00` : "-04:00";
  const timeWithTz = time ? `${time}${nycOffset}` : null;

  return {
    id: makeId(date, time, venue, performer),
    source: "jazz_nyc",
    name: performer || "Jazz Performance",
    url: "https://www.jazz-nyc.com",

    date,
    time: timeWithTz,
    doorsOpen: null,

    venue,
    address: null,
    neighborhood: AREA_NAMES[area] ?? area ?? null,
    lat: null,
    lng: null,

    segment: "Music",
    genre: "Jazz",
    subGenre: null,

    priceMin: null,
    priceMax: null,
    currency: "USD",
    isFree: false,

    status: null,
    availabilityTier: "unknown",

    travelMinutes: null,
    leaveByTime: null,
    surpriseScore: null,
  };
}

// ─── FETCH ───────────────────────────────────────────────────────────────────

export async function fetchJazzNYC() {
  const today = new Date();
  const todayStr = `${String(today.getMonth() + 1).padStart(2, "0")}/${String(today.getDate()).padStart(2, "0")}/${String(today.getFullYear()).slice(2)}`;

  console.log("\n📡 Fetching Jazz NYC...");
  console.log(`   Looking for date: ${todayStr}`);

  const res = await fetch("https://www.jazz-nyc.com/index.php", {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; NowGo/1.0)" },
  });

  if (!res.ok) throw new Error(`jazz-nyc.com error: ${res.status} ${res.statusText}`);

  const html = await res.text();

  const tbodyStart = html.indexOf("<tbody>");
  const tbodyEnd = html.indexOf("</tbody>", tbodyStart);
  if (tbodyStart === -1) throw new Error("Could not find table body in jazz-nyc.com response");

  const tbody = html.slice(tbodyStart + 7, tbodyEnd);
  const rows = tbody.split("<tr>").slice(1);
  console.log(`   Found ${rows.length} table rows`);

  const cellText = (s) => s
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();

  const events = [];
  let skippedNoTime = 0;

  for (const row of rows) {
    const cellMatches = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)];
    if (cellMatches.length < 5) continue;

    const date = cellText(cellMatches[0][1]);
    const timeStr = cellText(cellMatches[1][1]);
    const area = cellText(cellMatches[2][1]);
    const venue = cellText(cellMatches[3][1]);
    const performer = cellText(cellMatches[4][1]);

    if (date !== todayStr) continue;
    if (!NYC_AREAS.has(area)) continue;
    if (!venue || !performer) continue;

    // One row can list several sets ("8:00 PM & 10:30 PM"); each is a separate
    // thing a user can go to, so each becomes its own event.
    const setTimes = parseSetTimes(timeStr);
    if (!setTimes.length) {
      skippedNoTime += 1;
      continue;
    }
    for (const time of setTimes) {
      events.push(normalizeRow(parseDate(date), time, area, venue, performer));
    }
  }

  if (skippedNoTime) {
    console.log(`   ⚠️  Skipped ${skippedNoTime} rows with no parseable set time`);
  }
  console.log(`   ✅ Got ${events.length} NYC jazz events tonight`);
  return events;
}

// ─── MAIN (CLI only) ──────────────────────────────────────────────────────────

async function main() {
  console.log("🚀 NowGo — Jazz NYC Scraper");
  try {
    let existingEvents = [];
    const inputPath = fs.existsSync("data/events-tonight-merged.json")
      ? "data/events-tonight-merged.json"
      : fs.existsSync("data/events-tonight.json")
      ? "data/events-tonight.json"
      : null;

    if (inputPath) {
      const data = JSON.parse(fs.readFileSync(inputPath, "utf8"));
      existingEvents = data.events ?? [];
      console.log(`📂 Loaded ${existingEvents.length} existing events from ${inputPath}`);
    }

    const jazzEvents = await fetchJazzNYC();
    const existingKeys = new Set(
      existingEvents.map((e) => `${(e.venue ?? "").toLowerCase().slice(0, 12)}_${e.date}_${(e.time ?? "").slice(0, 5)}`)
    );
    const newOnly = jazzEvents.filter((e) => {
      const key = `${(e.venue ?? "").toLowerCase().slice(0, 12)}_${e.date}_${(e.time ?? "").slice(0, 5)}`;
      return !existingKeys.has(key);
    });
    const finalEvents = [...existingEvents, ...newOnly];

    const output = {
      fetchedAt: new Date().toISOString(),
      sources: ["ticketmaster", "seatgeek", "jazz_nyc"],
      count: finalEvents.length,
      jazzCount: jazzEvents.length,
      events: finalEvents,
    };
    fs.mkdirSync("data", { recursive: true });
    fs.writeFileSync("data/events-tonight-final.json", JSON.stringify(output, null, 2));
    console.log(`💾 Saved ${finalEvents.length} total events to data/events-tonight-final.json`);
  } catch (err) {
    console.error("❌ Error:", err.message);
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
