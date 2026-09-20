import { test } from "node:test";
import assert from "node:assert/strict";
import { collapseTimedEntry } from "./timed-entry.js";

const at = (hhmm, extra = {}) => ({
  event_id: `balloon-${hhmm}`, name: "DAYDREAM | Air Becomes Art", venue_id: "balloon",
  url: "https://universe.com/daydream", start_time: `2026-09-19T${hhmm}:00.000Z`,
  availability_tier: "available", ...extra,
});

test("a run of 15-minute slots with one name and one link becomes one card", () => {
  const out = collapseTimedEntry([at("16:45"), at("17:00"), at("17:15"), at("17:30")]);
  assert.equal(out.length, 1);
  assert.equal(out[0].event_id, "balloon-16:45");
});

test("the card carries every slot and how many there were", () => {
  const [card] = collapseTimedEntry([at("16:45"), at("17:00"), at("17:15")]);
  assert.deepEqual(card.showtimes, [
    "2026-09-19T16:45:00.000Z", "2026-09-19T17:00:00.000Z", "2026-09-19T17:15:00.000Z",
  ]);
  assert.equal(card.showtime_count, 3);
});

test("two sets an evening are two events, not timed entry", () => {
  // Blue Note: 8pm and 10:30pm, same name, same link. Keep both.
  const sets = [at("20:00", { venue_id: "bluenote" }), at("22:30", { venue_id: "bluenote" })];
  assert.equal(collapseTimedEntry(sets).length, 2);
});

test("three sets spaced over an evening stay separate — the gap is what matters", () => {
  // Smoke: 6:30, 8:15, 10:00.
  const sets = [at("18:30"), at("20:15"), at("22:00")];
  assert.equal(collapseTimedEntry(sets).length, 3);
});

test("different links mean different events even at the same venue and name", () => {
  const rows = [at("19:00"), at("19:15", { url: "https://x/2" }), at("19:30", { url: "https://x/3" })];
  assert.equal(collapseTimedEntry(rows).length, 3);
});

test("the card is the first slot that can still be bought", () => {
  const rows = [at("16:45", { availability_tier: "sold_out" }), at("17:00"), at("17:15")];
  const [card] = collapseTimedEntry(rows);
  assert.equal(card.event_id, "balloon-17:00");
  assert.equal(card.availability_tier, "available");
  assert.equal(card.showtime_count, 3, "the sold-out slot is still listed");
});

test("slots arrive out of order and still collapse in time order", () => {
  const [card] = collapseTimedEntry([at("17:15"), at("16:45"), at("17:00")]);
  assert.equal(card.event_id, "balloon-16:45");
  assert.deepEqual(card.showtimes.map(s => s.slice(11, 16)), ["16:45", "17:00", "17:15"]);
});

test("unrelated events keep their place in the list", () => {
  const jazz = at("20:00", { venue_id: "bluenote", event_id: "bn" });
  const out = collapseTimedEntry([at("16:45"), jazz, at("17:00"), at("17:15")]);
  assert.deepEqual(out.map(e => e.event_id), ["balloon-16:45", "bn"]);
});
