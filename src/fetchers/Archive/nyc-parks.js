import fetch from "node-fetch";
import fs from "fs";
import dotenv from "dotenv";
dotenv.config({ path: ".env.nowgo" });

// NYC Open Data SODA — Parks Events Listing (fudw-fgrp)
// NOTE: this dataset lags ~months behind current date. The original
// nycgovparks.org/api endpoint now returns 403. Ticket 86b9wfcgw used
// 6v4b-5gp4 (attendance data) which is also retrospective. Using fudw-fgrp
// which has richer fields; swap for a live source when one is identified.
const PARKS_ENDPOINT = "https://data.cityofnewyork.us/resource/fudw-fgrp.json";

function getTonightDate() {
  return new Date().toISOString().split("T")[0]; // "YYYY-MM-DD"
}

// ─── NORMALIZE ───────────────────────────────────────────────────────────────

function normalizeParksEvent(e) {
  // fudw-fgrp field names
  const titleRaw = (e.title ?? "").toLowerCase();
  let segment = "Other";
  if (titleRaw.includes("concert") || titleRaw.includes("music") || titleRaw.includes("jazz") || titleRaw.includes("band")) segment = "Music";
  else if (titleRaw.includes("theatre") || titleRaw.includes("theater") || titleRaw.includes("perform") || titleRaw.includes("dance")) segment = "Arts & Theatre";
  else if (titleRaw.includes("film") || titleRaw.includes("movie") || titleRaw.includes("cinema")) segment = "Arts & Theatre";
  else if (titleRaw.includes("festival") || titleRaw.includes("fair")) segment = "Festival";
  else if (titleRaw.includes("sport") || titleRaw.includes("athletic") || titleRaw.includes("run") || titleRaw.includes("race")) segment = "Sports";
  else if (titleRaw.includes("family") || titleRaw.includes("kids") || titleRaw.includes("children")) segment = "Family";

  const isFree = e.cost_free === "1" || e.cost_free === true;
  const eventUrl = e.url
    ? `https://www.nycgovparks.org/events/${e.url}`
    : "https://www.nycgovparks.org/events";

  return {
    id: `parks_${e.event_id ?? Math.random().toString(36).slice(2)}`,
    source: "nyc_parks",
    name: e.title ?? "NYC Parks Event",
    url: eventUrl,

    date: (e.date ?? getTonightDate()).slice(0, 10),
    time: e.start_time ?? null,
    doorsOpen: null,

    venue: e.location_description ?? null,
    address: null,
    neighborhood: null,
    lat: null,
    lng: null,

    segment,
    genre: null,
    subGenre: null,

    priceMin: isFree ? 0 : null,
    priceMax: isFree ? 0 : null,
    currency: "USD",
    isFree,

    status: "onsale",
    availabilityTier: "available",

    travelMinutes: null,
    leaveByTime: null,
    surpriseScore: null,
  };
}

// ─── FETCH ───────────────────────────────────────────────────────────────────

async function fetchParksEvents() {
  const tonight = getTonightDate();
  console.log("\n📡 Fetching NYC Parks events (SODA: fudw-fgrp)...");
  console.log(`   Date: ${tonight}\n`);

  const url = new URL(PARKS_ENDPOINT);
  url.searchParams.set("$where", `date = '${tonight}T00:00:00.000'`);
  url.searchParams.set("$limit", "200");
  url.searchParams.set("$order", "start_time ASC");

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`NYC Parks API error: ${res.status} ${res.statusText}`);

  const raw = await res.json();
  console.log(`   ✅ Got ${raw.length} raw Parks events`);

  if (raw.length === 0) {
    console.log("   ⚠️  No events for today — SODA dataset may be lagging behind current date.");
    console.log("   ℹ️  Most recent data in this dataset: ~2–3 months behind real time.");
    console.log("   TODO: find a live NYC Parks events feed to replace this source.\n");
  }

  console.log(`   🌳 ${raw.length} events tonight\n`);
  return raw.map(normalizeParksEvent);
}

// ─── MERGE ───────────────────────────────────────────────────────────────────

function mergeWithExisting(existingEvents, parksEvents) {
  const existingKeys = new Set(
    existingEvents.map((e) => `${(e.venue ?? "").toLowerCase().slice(0, 12)}_${e.date}`)
  );

  const newOnly = parksEvents.filter((p) => {
    const key = `${(p.venue ?? "").toLowerCase().slice(0, 12)}_${p.date}`;
    return !existingKeys.has(key);
  });

  console.log(`   ➕ Adding ${newOnly.length} Parks-only events (${parksEvents.length - newOnly.length} duplicates skipped)\n`);
  return [...existingEvents, ...newOnly];
}

// ─── REPORT ──────────────────────────────────────────────────────────────────

function printSummary(parksEvents, totalEvents) {
  console.log("─────────────────────────────────────────");
  console.log(`🌳 NYC PARKS — ${parksEvents.length} free events tonight\n`);

  parksEvents.slice(0, 10).forEach((e, i) => {
    const time = e.time ? e.time.slice(0, 5) : "TBD";
    console.log(`  ${i + 1}. ${e.name}`);
    console.log(`     📍 ${e.venue} | ⏰ ${time} | 💵 FREE | ${e.segment}\n`);
  });

  if (parksEvents.length > 10) console.log(`  ... and ${parksEvents.length - 10} more\n`);

  console.log(`🗽 TOTAL TONIGHT: ${totalEvents} events across all sources`);
  console.log("─────────────────────────────────────────\n");
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🚀 NowGo — NYC Parks Fetcher");

  try {
    let existingEvents = [];
    const mergedPath = fs.existsSync("data/events-tonight-merged.json")
      ? "data/events-tonight-merged.json"
      : fs.existsSync("data/events-tonight.json")
      ? "data/events-tonight.json"
      : null;

    if (mergedPath) {
      const data = JSON.parse(fs.readFileSync(mergedPath, "utf8"));
      existingEvents = data.events ?? [];
      console.log(`📂 Loaded ${existingEvents.length} existing events from ${mergedPath}`);
    } else {
      console.log("⚠️  No existing event file found — run npm run fetch:tm first");
    }

    const parksEvents = await fetchParksEvents();
    const finalEvents = mergeWithExisting(existingEvents, parksEvents);
    printSummary(parksEvents, finalEvents.length);

    const output = {
      fetchedAt: new Date().toISOString(),
      sources: ["ticketmaster", "seatgeek", "nyc_parks"],
      count: finalEvents.length,
      freeCount: finalEvents.filter((e) => e.isFree).length,
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
