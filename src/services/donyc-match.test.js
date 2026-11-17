import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sameVenueName, titleSimilarity, resolveVenue, findMatch, fillsFor, venueFillsFor, matchDoNYC,
} from "./donyc-match.js";
import { ingestDoNYC } from "./donyc-ingest.js";

// Every pairing below is from the 2026-11-17 dry run of DoNYC against the
// production feed, unless marked otherwise.

const SMALLS = { lat: 40.7346, lng: -74.0027 };
const JAZZCULTURAL = { lat: 40.7605, lng: -73.9892 };

const dn = (over = {}) => ({
  id: "dn_1",
  source: "donyc",
  name: "LCD Soundsystem",
  venue: "Music Hall of Williamsburg",
  startTime: "2026-11-17T20:00:00-05:00",
  lat: 40.7191, lng: -73.9617,
  url: "https://axs.com/events/1", donycUrl: "https://donyc.com/events/x",
  priceMin: null, priceMax: null, isFree: false,
  availabilityTier: "unknown", segment: "Music", genre: "Rock",
  ...over,
});

const row = (over = {}) => ({
  event_id: "sg_1",
  source: "seatgeek",
  name: "LCD Soundsystem (18+)",
  venue_id: "v-mhow",
  venue_name: "Music Hall of Williamsburg",
  start_time: "2026-11-18T01:00:00.000Z",
  geo_lat: 40.7191, geo_lng: -73.9617,
  url: "https://seatgeek.com/x", price_min: null, price_max: null, is_free: false,
  availability_tier: "unknown", segment: "Music", genre: null,
  ...over,
});

// ─── venue names ─────────────────────────────────────────────────────────────

test("sameVenueName folds filler words and punctuation", () => {
  assert.ok(sameVenueName("Smalls", "Smalls Jazz Club"));
  assert.ok(sameVenueName("Jazz Gallery (The)", "The Jazz Gallery"));
  assert.ok(sameVenueName("Mercury Lounge - New York", "Mercury Lounge"));
  assert.ok(sameVenueName("NEW YORK COMEDY CLUB EAST VILLAGE", "New York Comedy Club East Village"));
});

test("sameVenueName keeps genuinely separate rooms apart", () => {
  // CLAUDE.md: Birdland Theater is a different room at Birdland's address.
  assert.ok(!sameVenueName("Birdland", "Birdland Theater"));
  assert.ok(!sameVenueName("Eris", "Eris Mainstage"));
  assert.ok(!sameVenueName("Smalls Jazz Club", "Mezzrow"));
});

test("resolveVenue needs the name AND (when known) the location to agree", () => {
  const venues = [
    { venue_id: "a", name: "Smalls", geo_lat: SMALLS.lat, geo_lng: SMALLS.lng },
    { venue_id: "b", name: "Birdland", geo_lat: 40.759, geo_lng: -73.9897 },
  ];
  assert.equal(resolveVenue(dn({ venue: "Smalls Jazz Club", ...SMALLS }), venues)?.venue_id, "a");
  assert.equal(resolveVenue(dn({ venue: "Birdland Theater", lat: 40.759, lng: -73.9897 }), venues), null);
  // Same name, other side of town: not the same room.
  assert.equal(resolveVenue(dn({ venue: "Smalls", ...JAZZCULTURAL }), venues), null);
});

test("titleSimilarity ignores billing noise", () => {
  assert.equal(titleSimilarity("LCD Soundsystem", "LCD Soundsystem (18+)"), 1);
  assert.equal(titleSimilarity("Celine Dessberg Live in New York", "Celine Dessberg"), 1);
  assert.ok(titleSimilarity("Sadurn", "Factors Fest Week 3") === 0);
});

// ─── event matching ──────────────────────────────────────────────────────────

test("same room, same time, similar title → matched", () => {
  assert.equal(findMatch(dn(), [row()])?.event_id, "sg_1");
});

test("same room, same time, the only show on → matched even with a different headliner", () => {
  // Littlefield, 7pm: DoNYC bills the release show, SeatGeek the opener.
  const x = row({ name: "Sirintip", venue_name: "Littlefield - Brooklyn", start_time: "2026-11-19T00:00:00Z" });
  const d = dn({ name: "White Lilies Release Show", venue: "Littlefield - Brooklyn", startTime: "2026-11-18T19:00:00-05:00" });
  assert.equal(findMatch(d, [x])?.event_id, "sg_1");
});

test("two different shows in one room at one time stay separate", () => {
  // Comedy clubs run several rooms at once (hypothetical lineup).
  const a = row({ event_id: "tm_a", name: "Laughing Buddha Comedy", venue_name: "EastVille Comedy Club", start_time: "2026-11-18T01:00:00Z" });
  const b = row({ event_id: "tm_b", name: "Tipsy Tuesday Showcase", venue_name: "EastVille Comedy Club", start_time: "2026-11-18T01:00:00Z" });
  const d = dn({ name: "DANU Live in America", venue: "EastVille Comedy Club" });
  assert.equal(findMatch(d, [a, b]), null);
});

test("a jazz room's two sets are two events", () => {
  const early = row({ name: "Ivan Polyanskiy Quartet", venue_name: "Smalls Jazz Club", start_time: "2026-11-18T00:00:00Z", ...{ geo_lat: SMALLS.lat, geo_lng: SMALLS.lng } });
  const d = dn({ name: "Leo Larratt Quartet", venue: "Smalls Jazz Club", startTime: "2026-11-17T21:30:00-05:00", ...SMALLS });
  assert.equal(findMatch(d, [early]), null);
});

test("same show under a different venue label nearby → matched", () => {
  // DoNYC files Mezzrow's sets under "Smalls Jazz Club"; the rooms are a
  // block apart on W 10th.
  const x = row({ name: "Gabrielle Stravelli Trio", venue_name: "Mezzrow", start_time: "2026-11-17T23:00:00Z", geo_lat: 40.7347, geo_lng: -74.0011 });
  const d = dn({ name: "Gabrielle Stravelli Trio", venue: "Smalls Jazz Club", startTime: "2026-11-17T18:00:00-05:00", ...SMALLS });
  assert.equal(findMatch(d, [x])?.event_id, "sg_1");
});

test("a distinctive identical title matches even across the venue label", () => {
  // Jazzcultural's set, listed by DoNYC under Smalls and 30 minutes later.
  const x = row({ name: "Leo Larratt Quartet feat. Emmet Cohen", venue_name: "Jazzcultural", start_time: "2026-11-18T00:30:00Z", geo_lat: JAZZCULTURAL.lat, geo_lng: JAZZCULTURAL.lng });
  const d = dn({ name: "Leo Larratt Quartet feat. Emmet Cohen", venue: "Smalls Jazz Club", startTime: "2026-11-17T20:00:00-05:00", ...SMALLS });
  assert.equal(findMatch(d, [x])?.event_id, "sg_1");
});

test("one shared word is not a match when the venues cannot be compared", () => {
  // Regression from the dry run: a book club at 7pm "matched" The Book of Mormon.
  const x = row({ name: "The Book of Mormon", venue_name: "Eugene O'Neill Theatre", start_time: "2026-11-18T00:00:00Z", geo_lat: 40.7598, geo_lng: -73.9862 });
  const d = dn({ name: "Fiction Book Group", venue: "Hops Hill At Atlantic", startTime: "2026-11-17T19:00:00-05:00", lat: null, lng: null });
  assert.equal(findMatch(d, [x]), null);
});

test("a short generic title never matches across venues", () => {
  const x = row({ name: "Bill Charlap Solo Piano", venue_name: "Dizzy's Club", start_time: "2026-11-18T00:00:00Z", geo_lat: 40.7685, geo_lng: -73.9832 });
  const d = dn({ name: "Solo", venue: "The Stone", startTime: "2026-11-17T19:00:00-05:00", lat: 40.7246, lng: -73.9846 });
  assert.equal(findMatch(d, [x]), null);
});

test("doors vs show time: same room and title up to two hours apart", () => {
  const x = row({ start_time: "2026-11-18T02:00:00Z" }); // 9pm vs DoNYC's 8pm
  assert.equal(findMatch(dn(), [x])?.event_id, "sg_1");
  const far = row({ start_time: "2026-11-18T03:30:00Z" });
  assert.equal(findMatch(dn(), [far]), null);
});

// ─── fills ───────────────────────────────────────────────────────────────────

test("fills only blanks: price, real link for a jazz-nyc row, segment, genre", () => {
  const x = row({ source: "jazz_nyc", url: "https://www.jazz-nyc.com", segment: null });
  const fills = fillsFor(dn({ priceMin: 10, priceMax: 10, url: "https://barlunatico.com/e/1" }), x);
  assert.deepEqual(fills, { price_min: 10, price_max: 10, url: "https://barlunatico.com/e/1", segment: "Music", genre: "Rock" });
});

test("never overwrites what another source already said", () => {
  const x = row({ price_min: 30, url: "https://ticketmaster.com/e", genre: "Pop", availability_tier: "available" });
  assert.deepEqual(fillsFor(dn({ priceMin: 10, availabilityTier: "sold_out" }), x), {});
});

test("a DoNYC page link is not a ticket link and fills nothing", () => {
  const x = row({ url: null });
  const d = dn({ url: "https://donyc.com/events/x", donycUrl: "https://donyc.com/events/x" });
  assert.equal(fillsFor(d, x).url, undefined);
});

test("an explicit sold-out flag beats unknown", () => {
  assert.equal(fillsFor(dn({ availabilityTier: "sold_out" }), row()).availability_tier, "sold_out");
});

test("venue fills only complete missing address, coordinates and website", () => {
  const vf = venueFillsFor(dn({ address: "66 N 6th St", venueUrl: "http://mhow.com" }), row({ geo_lat: null, geo_lng: null, address: null, website: "http://keep.me" }));
  assert.deepEqual(vf, { address: "66 N 6th St", geo_lat: 40.7191, geo_lng: -73.9617 });
});

test("matchDoNYC splits unique from matched and lands labels on existing venues", () => {
  const venues = [{ venue_id: "v-smalls", name: "Smalls", geo_lat: SMALLS.lat, geo_lng: SMALLS.lng }];
  const existing = [row()];
  const { unique, matched, venuesResolved } = matchDoNYC(
    [dn(), dn({ id: "dn_2", name: "Happy Hour Jam", venue: "Smalls Jazz Club", ...SMALLS })],
    existing, venues
  );
  assert.deepEqual(matched.map((m) => m.dn.id), ["dn_1"]);
  assert.deepEqual(unique.map((e) => e.id), ["dn_2"]);
  assert.equal(unique[0].venue, "Smalls", "keeps the curated venue row's walk-in policy");
  assert.equal(venuesResolved, 1);
});

// ─── ingest (fake pool) ──────────────────────────────────────────────────────

function fakePool({ hasSource = true, existing = [], venues = [] } = {}) {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql, params });
      if (/FROM sources/.test(sql)) return { rows: hasSource ? [{ "?column?": 1 }] : [] };
      if (/FROM events e/.test(sql)) return { rows: existing };
      if (/FROM venues/.test(sql)) return { rows: venues };
      if (/^\s*DELETE/.test(sql)) return { rowCount: 1, rows: [] };
      return { rows: [], rowCount: 1 };
    },
  };
}

test("ingestDoNYC refuses to run before migration 018", async () => {
  await assert.rejects(ingestDoNYC([dn()], { pool: fakePool({ hasSource: false }), ingestEvents: async () => ({ ok: 0, skipped: 0 }) }), /migration 018/);
});

test("ingestDoNYC ingests only unique events, fills matched rows, removes stale copies", async () => {
  const pool = fakePool({ existing: [row()] });
  let ingested = null;
  const result = await ingestDoNYC(
    [dn({ priceMin: 45, priceMax: 45 }), dn({ id: "dn_2", name: "Open Decks", venue: "SILO Brooklyn", lat: 40.70, lng: -73.93 })],
    { pool, ingestEvents: async (events) => { ingested = events; return { ok: events.length, skipped: 0 }; } }
  );
  assert.deepEqual(ingested.map((e) => e.id), ["dn_2"]);
  assert.equal(result.matched, 1);
  assert.equal(result.filled, 1);

  const update = pool.calls.find((c) => /^\s*UPDATE events/.test(c.sql));
  assert.equal(update.params[0], "sg_1");
  assert.equal(update.params[1], 45);
  // The SQL re-guards every column, so a concurrent write is never clobbered.
  assert.match(update.sql, /price_min = COALESCE\(price_min, \$2\)/);

  const del = pool.calls.find((c) => /^\s*DELETE/.test(c.sql));
  assert.match(del.sql, /source = 'donyc'/, "only ever deletes DoNYC's own rows");
  assert.deepEqual(del.params[0], ["dn_1"]);
});
