import { test } from "node:test";
import assert from "node:assert/strict";
import { rankEvents } from "./ranking.js";

const NOW = new Date("2026-08-27T01:00:00.000Z"); // 9pm ET

// Minutes from NOW, expressed the way the API hands times back.
function at(minutes) {
  return new Date(NOW.getTime() + minutes * 60000).toISOString();
}

function event(overrides = {}) {
  return {
    event_id: "evt",
    availability_tier: "unknown",
    start_time: at(45),
    is_free: false,
    price_min: null,
    ...overrides,
  };
}

function surprise(events) {
  return rankEvents(events, { surpriseMe: true, now: NOW });
}

// Every jazz-nyc and SeatGeek event carries `unknown` — only Ticketmaster ever
// sets a tier. Requiring a verified one emptied Surprise Me on nights where the
// feed itself had plenty to offer.
test("an unknown tier is still worth suggesting — it is the only tier most sources supply", () => {
  const picks = surprise([event({ event_id: "jazz-1", availability_tier: "unknown" })]);
  assert.deepEqual(picks.map(e => e.event_id), ["jazz-1"]);
});

test("a sold-out event is never suggested, whatever else is in the pool", () => {
  const picks = surprise([
    event({ event_id: "gone", availability_tier: "sold_out" }),
    event({ event_id: "open", availability_tier: "unknown" }),
  ]);
  assert.deepEqual(picks.map(e => e.event_id), ["open"]);
});

test("a cancelled event is never suggested", () => {
  const picks = surprise([event({ event_id: "off", availability_tier: "cancelled" })]);
  assert.deepEqual(picks, []);
});

// Relaxing the filter must not cost us the ranking: a show we know has tickets
// should still be offered ahead of one we know nothing about.
test("a verified-available event outranks an unknown one starting at the same time", () => {
  const picks = surprise([
    event({ event_id: "unknown-tier", availability_tier: "unknown" }),
    event({ event_id: "verified", availability_tier: "available" }),
  ]);
  assert.equal(picks[0].event_id, "verified");
});

test("an event that already started an hour ago is not a suggestion", () => {
  const picks = surprise([event({ event_id: "past", start_time: at(-60) })]);
  assert.deepEqual(picks, []);
});

test("an event four hours out is beyond the window", () => {
  const picks = surprise([event({ event_id: "late", start_time: at(300) })]);
  assert.deepEqual(picks, []);
});

test("at most five suggestions come back, however full the night is", () => {
  const many = Array.from({ length: 12 }, (_, i) => event({ event_id: `evt-${i}` }));
  assert.equal(surprise(many).length, 5);
});
