import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mergeEvents,
  resolveAvailability,
  segmentFromTaxonomies,
  normalizeSeatGeekEvent,
} from "./seatgeek.js";

const makeTmEvent = (overrides = {}) => ({
  id: "tm_1", source: "ticketmaster", name: "Concert",
  date: "2026-06-01", venue: "Madison Square Garden",
  priceMin: null, priceMax: null, isFree: false,
  availabilityTier: "unknown",
  ...overrides,
});

const makeSgEvent = (overrides = {}) => ({
  id: "sg_1", source: "seatgeek", name: "Concert",
  date: "2026-06-01", venue: "Madison Square Garden",
  priceMin: 50, priceMax: 200, isFree: false,
  availabilityTier: "available",
  ...overrides,
});

test("mergeEvents fills price when venue names overlap directly", async () => {
  const result = await mergeEvents([makeTmEvent()], [makeSgEvent()], new Map(), null);
  assert.equal(result.length, 1);
  assert.equal(result[0].priceMin, 50);
  assert.equal(result[0]._pricedBy, "seatgeek");
});

test("mergeEvents resolves venue via alias map", async () => {
  const aliasMap = new Map([["msg", "madisonsquaregarden"]]);
  const result = await mergeEvents(
    [makeTmEvent()],
    [makeSgEvent({ venue: "MSG" })],
    aliasMap,
    null
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].priceMin, 50);
});

test("mergeEvents keeps events separate when venues differ", async () => {
  const result = await mergeEvents(
    [makeTmEvent({ venue: "Madison Square Garden" })],
    [makeSgEvent({ venue: "Blue Note Jazz Club", name: "Jazz Show" })],
    new Map(),
    null
  );
  assert.equal(result.length, 2);
  assert.equal(result[0].priceMin, null);
});

test("mergeEvents propagates isFree from SeatGeek match", async () => {
  const result = await mergeEvents(
    [makeTmEvent()],
    [makeSgEvent({ priceMin: 0, priceMax: 0, isFree: true })],
    new Map(),
    null
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].isFree, true);
  assert.equal(result[0].priceMin, 0);
});

test("mergeEvents skips price fill if SG event has null priceMin", async () => {
  const result = await mergeEvents(
    [makeTmEvent()],
    [makeSgEvent({ priceMin: null, priceMax: null })],
    new Map(),
    null
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].priceMin, null);
  assert.equal(result[0]._pricedBy, undefined);
});

test("mergeEvents does not duplicate events on date mismatch", async () => {
  const result = await mergeEvents(
    [makeTmEvent({ date: "2026-06-01" })],
    [makeSgEvent({ date: "2026-06-02" })],
    new Map(),
    null
  );
  assert.equal(result.length, 2);
});

// ─── availability resolution ─────────────────────────────────────────────────
// SeatGeek reflects the resale market; Ticketmaster reflects its own inventory,
// and the ticket link points at Ticketmaster. SeatGeek may add information but
// must never contradict a definitive Ticketmaster status.

test("SeatGeek 'unknown' never downgrades a known Ticketmaster tier", async () => {
  // This was mislabelling half the on-sale catalog as unknown.
  assert.equal(resolveAvailability("available", "unknown"), "available");
  assert.equal(resolveAvailability("scarce", "unknown"), "scarce");
  assert.equal(resolveAvailability("sold_out", "unknown"), "sold_out");
});

test("SeatGeek cannot mark a sold-out Ticketmaster event as available", async () => {
  // The 404 case: TM offsale -> sold_out, then SeatGeek relabelled it available
  // and users were sent to a dead Ticketmaster page.
  assert.equal(resolveAvailability("sold_out", "available"), "sold_out");
  assert.equal(resolveAvailability("sold_out", "scarce"), "sold_out");
});

test("a cancelled event stays cancelled from either source", async () => {
  assert.equal(resolveAvailability("cancelled", "available"), "cancelled");
  assert.equal(resolveAvailability("available", "cancelled"), "cancelled");
});

test("SeatGeek fills in when Ticketmaster does not know", async () => {
  assert.equal(resolveAvailability("unknown", "available"), "available");
  assert.equal(resolveAvailability("unknown", "scarce"), "scarce");
  assert.equal(resolveAvailability("unknown", "sold_out"), "sold_out");
});

test("the more restrictive known tier wins", async () => {
  assert.equal(resolveAvailability("available", "scarce"), "scarce");
  assert.equal(resolveAvailability("scarce", "available"), "scarce");
});

test("two unknowns stay unknown", async () => {
  assert.equal(resolveAvailability("unknown", "unknown"), "unknown");
  assert.equal(resolveAvailability(undefined, undefined), "unknown");
});

test("mergeEvents no longer clobbers the Ticketmaster tier with SeatGeek's", async () => {
  const tm = makeTmEvent({ availabilityTier: "sold_out" });
  const sg = makeSgEvent({ availabilityTier: "available" });
  const result = await mergeEvents([tm], [sg], new Map(), null);
  assert.equal(result[0].availabilityTier, "sold_out");
});

test("mergeEvents still fills price while preserving the safer tier", async () => {
  const tm = makeTmEvent({ availabilityTier: "sold_out", priceMin: null });
  const sg = makeSgEvent({ availabilityTier: "available", priceMin: 50 });
  const result = await mergeEvents([tm], [sg], new Map(), null);
  assert.equal(result[0].priceMin, 50, "price should still be filled from SeatGeek");
  assert.equal(result[0].availabilityTier, "sold_out");
});

// ─── SEGMENT DERIVATION ───────────────────────────────────────────────────────
//
// SeatGeek's `type` is league-level ("mlb", "wnba", "tennis"), never
// category-level, so a hand-kept type→segment map always trails their catalog
// and the unmapped remainder used to be stored verbatim as the segment.

const tax = (...nodes) => nodes;
const ROOT_SPORTS = { id: 1000000, name: "sports", parent_id: null };
const ROOT_CONCERTS = { id: 2000000, name: "concerts", parent_id: null };
const ROOT_THEATER = { id: 3000000, name: "theater", parent_id: null };
const ROOT_ADDON = { id: 4000000, name: "addon", parent_id: null };

test("every sports league resolves to the Sports segment", () => {
  const leagues = [
    { id: 1010000, name: "baseball" },
    { id: 1020000, name: "football" },
    { id: 1030000, name: "basketball" },
    { id: 1090000, name: "tennis" },
    { id: 1040000, name: "hockey" },
    { id: 1100000, name: "soccer" },
    { id: 1060000, name: "fighting" },
  ];
  for (const league of leagues) {
    assert.equal(
      segmentFromTaxonomies(tax(ROOT_SPORTS, { ...league, parent_id: 1000000 })),
      "Sports",
      `${league.name} should be Sports`
    );
  }
});

test("a league SeatGeek adds tomorrow still lands in Sports", () => {
  // The point of reading the root: an id this code has never seen still works.
  assert.equal(
    segmentFromTaxonomies(tax(ROOT_SPORTS, { id: 1999999, name: "pickleball", parent_id: 1000000 })),
    "Sports"
  );
});

test("comedy is lifted out of Theater into its own segment", () => {
  assert.equal(
    segmentFromTaxonomies(tax(ROOT_THEATER, { id: 3040000, name: "comedy", parent_id: 3000000 })),
    "Comedy"
  );
});

test("a sub-genre of comedy is still Comedy", () => {
  assert.equal(
    segmentFromTaxonomies(
      tax(ROOT_THEATER, { id: 3040000, name: "comedy", parent_id: 3000000 },
          { id: 3040100, name: "stand-up", parent_id: 3040000 })
    ),
    "Comedy"
  );
});

test("family entertainment is lifted out of Theater into Family", () => {
  assert.equal(
    segmentFromTaxonomies(tax(ROOT_THEATER, { id: 3050000, name: "family entertainment", parent_id: 3000000 })),
    "Family"
  );
});

test("dance, opera and classical stay under Arts & Theatre", () => {
  for (const node of [
    { id: 3060000, name: "dance" },
    { id: 3010000, name: "classical music" },
    { id: 3030000, name: "broadway shows" },
  ]) {
    assert.equal(
      segmentFromTaxonomies(tax(ROOT_THEATER, { ...node, parent_id: 3000000 })),
      "Arts & Theatre",
      `${node.name} should be Arts & Theatre`
    );
  }
});

test("concerts resolve to Music", () => {
  assert.equal(
    segmentFromTaxonomies(tax(ROOT_CONCERTS, { id: 2010000, name: "concert", parent_id: 2000000 })),
    "Music"
  );
});

test("addon rows are not events and get no segment", () => {
  assert.equal(segmentFromTaxonomies(tax(ROOT_ADDON)), null);
});

test("a missing taxonomy yields null rather than a raw passthrough", () => {
  // null hands the row to the LLM enrichment pass, which only picks up
  // NULL/'Undefined'/'Other'. A raw "tennis" would sit there forever.
  assert.equal(segmentFromTaxonomies(undefined), null);
  assert.equal(segmentFromTaxonomies([]), null);
  assert.equal(segmentFromTaxonomies([{ id: 1010000, name: "baseball", parent_id: 1000000 }]), null);
});

test("normalize never emits a lowercase league as a segment", () => {
  const event = {
    id: 42, title: "Atlanta Braves at New York Mets", type: "mlb",
    datetime_local: "2026-09-01T19:10:00",
    taxonomies: tax(ROOT_SPORTS, { id: 1010000, name: "baseball", parent_id: 1000000 }),
    venue: { name: "Citi Field" }, stats: {},
  };
  assert.equal(normalizeSeatGeekEvent(event).segment, "Sports");
});
