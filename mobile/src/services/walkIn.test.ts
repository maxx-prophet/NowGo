import { test } from "node:test";
import assert from "node:assert/strict";
import { walkInNotice } from "./walkIn.ts";

test("an uncurated venue says nothing at all", () => {
  // 'unknown' means nobody has checked. Rendering either a promise or a
  // refusal would invent a fact about the venue.
  assert.equal(walkInNotice("unknown", null), null);
  assert.equal(walkInNotice(null, null), null);
  assert.equal(walkInNotice(undefined, null), null);
});

test("a policy value this build has never heard of is treated as unknown", () => {
  assert.equal(walkInNotice("members_only", null), null);
});

test("'always' is the only policy allowed to say no ticket is needed", () => {
  const n = walkInNotice("always", null);
  assert.equal(n?.title, "Walk-ins welcome");
  assert.match(n!.detail!, /No ticket needed/);
});

test("'space_permitting' never promises that a ticket is unnecessary", () => {
  // The old copy said "Walk-in · No ticket needed" here, which is false:
  // advance tickets exist and walk-ins get in only if there is room.
  const n = walkInNotice("space_permitting", null);
  assert.equal(n?.title, "Walk-ins if there's room");
  assert.doesNotMatch(n!.detail!, /No ticket needed/i);
});

test("'standby' does not read as admission", () => {
  const n = walkInNotice("standby", null);
  assert.match(n!.title, /Standby/);
  assert.match(n!.detail!, /isn't guaranteed/);
});

test("'none' states the requirement rather than staying silent", () => {
  const n = walkInNotice("none", null);
  assert.equal(n?.title, "Ticket needed in advance");
  assert.equal(n?.tone, "plain");
});

test("a whole-dollar door price shows without decimals", () => {
  assert.match(walkInNotice("always", "25.00")!.detail!, /\$25 at the door/);
});

test("an odd door price keeps its cents", () => {
  assert.match(walkInNotice("always", 12.5)!.detail!, /\$12\.50 at the door/);
});

test("a zero cover reads as free, not as $0", () => {
  assert.equal(walkInNotice("always", "0.00")!.detail, "Free at the door");
});

// door_price is left NULL whenever the cover varies by night — Birds is $15
// midweek and $25 at weekends. Absence must never be filled in with a guess.
test("a missing door price falls back to words, never to a number", () => {
  const n = walkInNotice("space_permitting", null);
  assert.doesNotMatch(n!.detail!, /\$/);
});
