import { test } from "node:test";
import assert from "node:assert";
import {
  SOURCE_ATTRIBUTION,
  attributionFor,
  withAttribution,
  withAttributionAll,
} from "./attribution.js";

test("jazz-nyc is credited, because nothing else on screen names it", () => {
  const credit = attributionFor("jazz_nyc");
  assert.equal(credit.name, "Jazz NYC");
  assert.equal(credit.url, "https://jazz-nyc.com");
});

test("ticketmaster and seatgeek are not credited — their own link already is", () => {
  assert.equal(attributionFor("ticketmaster"), null);
  assert.equal(attributionFor("seatgeek"), null);
});

test("an unknown source is not credited rather than guessed at", () => {
  assert.equal(attributionFor("eventbrite"), null);
  assert.equal(attributionFor(undefined), null);
  assert.equal(attributionFor(null), null);
});

test("a credited event carries the name and url the app renders", () => {
  const out = withAttribution({ event_id: "j1", source: "jazz_nyc", name: "Smalls" });
  assert.equal(out.source_name, "Jazz NYC");
  assert.equal(out.source_url, "https://jazz-nyc.com");
  assert.equal(out.name, "Smalls", "the rest of the event survives");
});

test("an uncredited event is returned unchanged, with no empty fields to render", () => {
  const event = { event_id: "tm1", source: "ticketmaster", name: "Concert" };
  const out = withAttribution(event);
  assert.deepEqual(out, event);
  assert.ok(!("source_name" in out), "absent, not null — the app tests presence");
});

test("withAttribution does not mutate the row it was handed", () => {
  const event = { event_id: "j1", source: "jazz_nyc" };
  withAttribution(event);
  assert.ok(!("source_name" in event));
});

test("null and undefined pass through, so callers can map over rows unguarded", () => {
  assert.equal(withAttribution(null), null);
  assert.equal(withAttribution(undefined), undefined);
});

test("mapping a mixed feed credits only the jazz rows", () => {
  const out = withAttributionAll([
    { source: "jazz_nyc" },
    { source: "ticketmaster" },
    { source: "seatgeek" },
  ]);
  assert.equal(out[0].source_name, "Jazz NYC");
  assert.ok(!("source_name" in out[1]));
  assert.ok(!("source_name" in out[2]));
});

test("a non-array is handed back as-is rather than throwing", () => {
  assert.equal(withAttributionAll(null), null);
});

test("every attribution entry has both a name and an https url", () => {
  for (const [source, credit] of Object.entries(SOURCE_ATTRIBUTION)) {
    assert.ok(credit.name, `${source} has a display name`);
    assert.match(credit.url, /^https:\/\//, `${source} url is https`);
  }
});
