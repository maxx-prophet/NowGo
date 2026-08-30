import { test } from "node:test";
import assert from "node:assert";
import { shareMessage } from "./share.ts";

const NOW = new Date("2026-08-29T22:00:00Z");
const IN_AN_HOUR = "2026-08-29T23:00:00Z";
const AN_HOUR_AGO = "2026-08-29T21:00:00Z";

const base = {
  name: "Makoto Ozone Trio",
  venue_name: "Birdland Jazz Club",
  url: "https://www.birdlandjazz.com/",
  availability_tier: "unknown",
};

test("the leave-by time is what the message leads with", () => {
  const msg = shareMessage(base, IN_AN_HOUR, NOW);
  assert.match(msg, /^Makoto Ozone Trio at Birdland Jazz Club — leave by /);
  assert.match(msg, / to make it\./);
  assert.ok(msg.includes("https://www.birdlandjazz.com/"));
});

test("a leave-by that has already passed is never shared as advice", () => {
  const msg = shareMessage(base, AN_HOUR_AGO, NOW);
  assert.ok(!msg.includes("leave by"), "no stale instruction");
  assert.ok(msg.includes("tonight"));
});

test("no leave-by at all still produces a usable message", () => {
  const msg = shareMessage(base, null, NOW);
  assert.equal(msg, "Makoto Ozone Trio at Birdland Jazz Club, tonight. https://www.birdlandjazz.com/");
});

test("a sold-out show shares no link — a ticket page with no tickets is the dead end", () => {
  const msg = shareMessage({ ...base, availability_tier: "sold_out" }, IN_AN_HOUR, NOW);
  assert.ok(!msg.includes("http"), "no link");
  assert.ok(!msg.includes("leave by"), "no travel advice for a show you cannot attend");
  assert.match(msg, /sold out/);
});

test("a missing venue does not render the word undefined", () => {
  const msg = shareMessage({ ...base, venue_name: null }, IN_AN_HOUR, NOW);
  assert.ok(!msg.includes("undefined"));
  assert.ok(msg.includes("a venue in NYC"));
});

test("a missing url leaves no trailing space or empty tail", () => {
  const msg = shareMessage({ ...base, url: null }, IN_AN_HOUR, NOW);
  assert.equal(msg, msg.trim());
  assert.ok(!msg.includes("http"));
});

test("the event name is never truncated or reworded", () => {
  const long = "A Very Long Event Name That Someone Actually Booked & Titled";
  const msg = shareMessage({ ...base, name: long }, IN_AN_HOUR, NOW);
  assert.ok(msg.includes(long));
});

test("a leave-by exactly now counts as passed, not as makeable", () => {
  const msg = shareMessage(base, NOW.toISOString(), NOW);
  assert.ok(!msg.includes("leave by"));
});

// share.ts duplicates formatTime rather than importing it, so that the service
// stays dependency-free and testable. This is the guard against the two drifting.
test("shareTimeFormatMatchesTheApp", () => {
  const expected = new Date(IN_AN_HOUR).toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit", hour12: true, timeZone: "America/New_York",
  });
  assert.ok(
    shareMessage(base, IN_AN_HOUR, NOW).includes(expected),
    `share time should read as ${expected}, the same as the event card`
  );
});
