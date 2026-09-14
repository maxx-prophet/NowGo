import { test } from "node:test";
import assert from "node:assert";
import { dedupeListings } from "./dedupe.js";

const tm = {
  event_id: "tm1", source: "ticketmaster", name: "Joey Bada$$",
  venue_id: "bluenote", start_time: "2026-09-06T00:00:00.000Z",
  url: "https://ticketmaster.com/e/1", availability_tier: "available", price_min: 45,
};
const jn = {
  event_id: "jn1", source: "jazz_nyc", name: "Joey Bada$$",
  venue_id: "bluenote", start_time: "2026-09-06T00:00:00.000Z",
  url: "https://www.bluenotejazz.com/nyc/", availability_tier: "unknown", price_min: null,
  source_name: "Jazz NYC", source_url: "https://jazz-nyc.com",
};

test("the same set from ticketmaster and jazz-nyc becomes one card", () => {
  const out = dedupeListings([jn, tm]);
  assert.equal(out.length, 1);
});

test("the ticketed listing wins — its link and tier are the useful ones", () => {
  const [kept] = dedupeListings([jn, tm]);
  assert.equal(kept.event_id, "tm1");
  assert.equal(kept.url, "https://ticketmaster.com/e/1");
  assert.equal(kept.availability_tier, "available");
});

test("jazz-nyc still gets its credit when its listing was folded in", () => {
  const [kept] = dedupeListings([tm, jn]);
  assert.equal(kept.source_name, "Jazz NYC");
  assert.equal(kept.source_url, "https://jazz-nyc.com");
});

test("a ticketmaster/seatgeek pair keeps the one with a known tier", () => {
  const sg = { ...tm, event_id: "sg1", source: "seatgeek", availability_tier: "unknown", url: "https://seatgeek.com/e/1" };
  const [kept] = dedupeListings([sg, tm]);
  assert.equal(kept.event_id, "tm1");
  assert.ok(!("source_name" in kept), "no credit owed when nothing credited was folded in");
});

test("different venues or different set times are different events", () => {
  const laterSet = { ...jn, event_id: "jn2", start_time: "2026-09-06T02:30:00.000Z" };
  const otherRoom = { ...jn, event_id: "jn3", venue_id: "smalls" };
  assert.equal(dedupeListings([tm, laterSet, otherRoom]).length, 3);
});

test("a row with no venue is never merged with anything", () => {
  const a = { ...tm, venue_id: null };
  const b = { ...jn, venue_id: null };
  assert.equal(dedupeListings([a, b]).length, 2);
});

test("order of survivors follows first appearance, so ranking input is stable", () => {
  const other = { ...jn, event_id: "jn9", venue_id: "smalls", name: "Smalls Jam" };
  const out = dedupeListings([other, jn, tm]);
  assert.deepEqual(out.map((e) => e.event_id), ["jn9", "tm1"]);
});
