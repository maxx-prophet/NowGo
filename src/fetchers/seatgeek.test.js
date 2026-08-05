import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeEvents, resolveAvailability } from "./seatgeek.js";

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
