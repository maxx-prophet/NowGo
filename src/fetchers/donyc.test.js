import { test } from "node:test";
import assert from "node:assert/strict";
import {
  unflatten, pageData, parsePriceInfo, segmentFor, skipReason,
  normalizeDoNYCEvent, dedupeWithinSource, fetchDoNYC,
} from "./donyc.js";

// Minimal devalue encoder, so fixtures can be written as plain objects. The
// decoder is checked against a hand-written payload in the real wire format
// first, so this encoder cannot hide a decoder bug.
function flatten(root) {
  const out = [];
  const visit = (v) => {
    if (v === undefined) return -1;
    if (v === null) return -2;
    const i = out.length;
    out.push(null);
    if (Array.isArray(v)) out[i] = v.map(visit);
    else if (typeof v === "object") out[i] = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, visit(x)]));
    else out[i] = v;
    return i;
  };
  visit(root);
  return out;
}
const payload = (data) => ({ type: "data", nodes: [{ type: "data", data: flatten({ layout: true }) }, { type: "data", data: flatten(data) }] });

// ─── devalue ─────────────────────────────────────────────────────────────────

test("unflatten decodes the wire format DoNYC actually serves", () => {
  // Shape copied from /events/today/__data.json: indices, a shared reference,
  // a -1 (undefined) sentinel, and a boxed Date.
  const wire = [
    { browse: 1 },
    { data: 2, _meta: 7 },
    [3],
    { title: 4, genres: 5, venue: 6, presented_by: -2 },
    "LCD Soundsystem",
    [],
    { title: 8 },
    { total: 9, has_next: 10, at: 11 },
    "Music Hall of Williamsburg",
    183,
    false,
    ["Date", "2026-11-17T20:00:00.000Z"],
  ];
  assert.deepEqual(unflatten(wire), {
    browse: {
      data: [{ title: "LCD Soundsystem", genres: [], venue: { title: "Music Hall of Williamsburg" }, presented_by: null }],
      _meta: { total: 183, has_next: false, at: "2026-11-17T20:00:00.000Z" },
    },
  });
});

test("unflatten keeps shared references shared", () => {
  const wire = [{ a: 1, b: 1 }, { x: 2 }, "y"];
  const out = unflatten(wire);
  assert.equal(out.a, out.b);
});

test("pageData reads the last data node, not the layout's", () => {
  assert.deepEqual(pageData(payload({ event: { id: 1 } })), { event: { id: 1 } });
  assert.equal(pageData({ nodes: [] }), null);
});

// ─── price text ──────────────────────────────────────────────────────────────

test("parsePriceInfo reads the shapes seen on DoNYC", () => {
  const p = (s) => parsePriceInfo(s);
  assert.deepEqual(p("$35"), { priceMin: 35, priceMax: 35, isFree: false });
  assert.deepEqual(p("$13.60, 21+"), { priceMin: 13.6, priceMax: 13.6, isFree: false });
  assert.deepEqual(p("$12.51-$23.18"), { priceMin: 12.51, priceMax: 23.18, isFree: false });
  assert.deepEqual(p("Tickets are $85 - $135 (inclusive of admin fees)"), { priceMin: 85, priceMax: 135, isFree: false });
  assert.deepEqual(p("$15 + fees"), { priceMin: 15, priceMax: 15, isFree: false });
  assert.deepEqual(p("Free, 21+"), { priceMin: 0, priceMax: 0, isFree: true });
  assert.deepEqual(p("FREE with a suggested donation"), { priceMin: 0, priceMax: 0, isFree: true });
});

test("an open-ended price is a floor, not a fixed price", () => {
  assert.deepEqual(parsePriceInfo("$63.20+"), { priceMin: 63.2, priceMax: null, isFree: false });
});

test("a drink minimum after the cover is not read as the cover", () => {
  assert.deepEqual(
    parsePriceInfo("$35.15 - $50.60 cover + $25 food/beverage minimum"),
    { priceMin: 35.15, priceMax: 50.6, isFree: false }
  );
});

test("an age limit is not a price", () => {
  assert.deepEqual(parsePriceInfo("16+"), { priceMin: null, priceMax: null, isFree: false });
  assert.deepEqual(parsePriceInfo(null), { priceMin: null, priceMax: null, isFree: false });
});

// ─── categories and skips ────────────────────────────────────────────────────

test("categories map onto the segments the app filters on", () => {
  assert.equal(segmentFor("Music"), "Music");
  assert.equal(segmentFor("Theatre & Performing Arts"), "Arts & Theatre");
  assert.equal(segmentFor("Readings & Talks"), "Talks");
  assert.equal(segmentFor("DJ / Parties"), "Nightlife");
  assert.equal(segmentFor("Film"), "Film");
  // Unmapped stays null so genre-enrichment classifies it.
  assert.equal(segmentFor("Other/Fun/Deals"), null);
});

const listing = (over = {}) => ({
  id: 18088638,
  type: "event",
  title: "LCD Soundsystem",
  permalink: "/events/2026/11/17/lcd-soundsystem-tickets",
  tz_adjusted_begin_time: "2026-11-17T20:00:00-05:00",
  event_type: "single_day",
  category: "Music",
  genres: ["Electronic / Dance", "Rock"],
  venue: { id: 14600, title: "Music Hall of Williamsburg", district_name: "Williamsburg / Greenpoint" },
  ...over,
});

const detail = (over = {}) => ({
  buy_tickets: "https://axs.com/events/1699223/lcd-soundsystem-tickets",
  ticket: { url: "https://www.axs.com/events/1699223/lcd-soundsystem-tickets?cid=usaffdostuff", availability: { state: "available" } },
  ticket_info: null,
  free_event: false,
  tickets_sold_out: false,
  is_past: false,
  seo_source: {
    venue: {
      address: "66 North 6th Street", city: "Brooklyn", state: "NY",
      latitude: 40.7191281, longitude: -73.9617399,
      website_url: "http://www.musichallofwilliamsburg.com",
    },
  },
  ...over,
});

test("skipReason drops what the feed cannot use", () => {
  assert.equal(skipReason(listing(), detail()), null);
  assert.equal(skipReason(listing({ event_type: "multi_day" })), "multi-day");
  assert.equal(skipReason(listing({ tz_adjusted_begin_time: null })), "untimed");
  assert.equal(skipReason(listing({ category: "Digital Events" })), "online");
  assert.equal(skipReason(listing({ category: "Other/Fun/Deals", venue: { title: "VIRTUAL" } })), "online");
  assert.equal(skipReason(listing({ category: "Readings & Talks", venue: { title: "Online Event" } })), "online");
  assert.equal(skipReason(listing({ title: "PRIVATE CHARTER on Yacht KINGSTON" })), "private");
  assert.equal(skipReason(listing({ venue: { title: "TBA (not the Venue)" } })), "no-venue");
});

test("venues outside the city are dropped, by state or by distance", () => {
  const nj = detail({ seo_source: { venue: { state: "NJ", latitude: 40.53, longitude: -74.35 } } });
  assert.equal(skipReason(listing(), nj), "out-of-area");
  // UBS Arena: New York State, but Elmont.
  const elmont = detail({ seo_source: { venue: { state: "NY", latitude: 40.711, longitude: -73.726 } } });
  assert.equal(skipReason(listing(), elmont), "out-of-area");
});

// ─── normalize ───────────────────────────────────────────────────────────────

test("time is bare NYC wall clock — never with the offset (see CLAUDE.md)", () => {
  const e = normalizeDoNYCEvent(listing(), detail());
  assert.equal(e.date, "2026-11-17");
  assert.equal(e.time, "20:00:00");
  assert.match(e.time, /^\d{2}:\d{2}:\d{2}$/);
  // The offset-carrying instant is kept separately, for matching only.
  assert.equal(e.startTime, "2026-11-17T20:00:00-05:00");
});

test("normalize mines the detail page for venue, link and price", () => {
  const e = normalizeDoNYCEvent(listing(), detail({ ticket_info: "$45, 18+" }));
  assert.equal(e.id, "dn_18088638");
  assert.equal(e.source, "donyc");
  // The un-tagged link, not the affiliate ?cid= one.
  assert.equal(e.url, "https://axs.com/events/1699223/lcd-soundsystem-tickets");
  assert.equal(e.address, "66 North 6th Street");
  assert.equal(e.lat, 40.7191281);
  assert.equal(e.venueUrl, "http://www.musichallofwilliamsburg.com");
  assert.equal(e.segment, "Music");
  assert.equal(e.genre, "Electronic / Dance");
  assert.equal(e.priceMin, 45);
  assert.equal(e.availabilityTier, "unknown");
});

test("'On sale' is not promoted to available; only sold-out is believed", () => {
  assert.equal(normalizeDoNYCEvent(listing(), detail()).availabilityTier, "unknown");
  assert.equal(normalizeDoNYCEvent(listing(), detail({ tickets_sold_out: true })).availabilityTier, "sold_out");
  assert.equal(
    normalizeDoNYCEvent(listing(), detail({ ticket: { availability: { state: "sold-out" } } })).availabilityTier,
    "sold_out"
  );
});

test("free_event makes the price zero", () => {
  const e = normalizeDoNYCEvent(listing(), detail({ free_event: true }));
  assert.equal(e.isFree, true);
  assert.equal(e.priceMin, 0);
});

test("with no detail page the listing alone still makes an event", () => {
  const e = normalizeDoNYCEvent(listing(), null);
  assert.equal(e.url, "https://donyc.com/events/2026/11/17/lcd-soundsystem-tickets");
  assert.equal(e.lat, null);
  assert.equal(e.priceMin, null);
});

test("HTML entities in titles are decoded", () => {
  assert.equal(normalizeDoNYCEvent(listing({ title: "Rock &amp; Roll" }), null).name, "Rock & Roll");
});

test("one event listed under two labels for the same room is kept once", () => {
  const a = normalizeDoNYCEvent(listing({ id: 1, title: "Eiffel Tower Mic", venue: { title: "Eris" } }), null);
  const b = normalizeDoNYCEvent(listing({ id: 2, title: "Eiffel Tower Mic", venue: { title: "Eris Mainstage" } }), detail());
  const out = dedupeWithinSource([a, b]);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, "dn_2", "the copy with coordinates and a ticket link wins");
  // A different time is a different show.
  const c = normalizeDoNYCEvent(listing({ id: 3, title: "Eiffel Tower Mic", tz_adjusted_begin_time: "2026-11-17T22:00:00-05:00" }), null);
  assert.equal(dedupeWithinSource([a, c]).length, 2);
});

// ─── fetch ───────────────────────────────────────────────────────────────────

test("fetchDoNYC pages through each day, then reads each event's detail", async () => {
  const now = new Date("2026-11-17T19:00:00Z"); // 2pm ET
  const requested = [];
  const responses = {
    "/events/2026/11/17/__data.json?page_size=50&page=1": payload({
      browse: { data: [{ events: [listing()] }], _meta: { has_next: true } },
    }),
    "/events/2026/11/17/__data.json?page_size=50&page=2": payload({
      browse: {
        data: [{ events: [
          listing({ id: 2, title: "Late Show", permalink: "/events/2026/11/17/late", tz_adjusted_begin_time: "2026-11-17T23:00:00-05:00" }),
          listing({ id: 3, title: "Morning Yoga", permalink: "/events/2026/11/17/yoga", tz_adjusted_begin_time: "2026-11-17T08:00:00-05:00" }),
        ] }],
        _meta: { has_next: false },
      },
    }),
    "/events/2026/11/18/__data.json?page_size=50&page=1": payload({ browse: { data: [], _meta: { has_next: false } } }),
    "/events/2026/11/19/__data.json?page_size=50&page=1": payload({ browse: { data: [], _meta: { has_next: false } } }),
    "/events/2026/11/17/lcd-soundsystem-tickets/__data.json": payload({ event: detail({ ticket_info: "$40" }) }),
  };
  const fetchImpl = async (url) => {
    const path = url.replace("https://donyc.com", "");
    requested.push(path);
    const body = responses[path];
    return body
      ? { ok: true, status: 200, json: async () => body }
      : { ok: false, status: 404, json: async () => ({}) };
  };

  const events = await fetchDoNYC({ now, fetchImpl });
  assert.deepEqual(events.map((e) => e.id).sort(), ["dn_18088638", "dn_2"]);
  assert.ok(!requested.some((p) => p.includes("yoga")), "a listing already over is not looked up");

  const lcd = events.find((e) => e.id === "dn_18088638");
  assert.equal(lcd.priceMin, 40);
  // The late show's detail 404'd; it survives on listing data alone.
  const late = events.find((e) => e.id === "dn_2");
  assert.equal(late.url, "https://donyc.com/events/2026/11/17/late");
});

test("fetchDoNYC throws when the first page of a day fails", async () => {
  const fetchImpl = async () => ({ ok: false, status: 503, json: async () => ({}) });
  await assert.rejects(fetchDoNYC({ now: new Date("2026-11-17T19:00:00Z"), fetchImpl }), /DoNYC 503/);
});
