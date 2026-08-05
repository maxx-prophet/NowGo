import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSetTimes, nycDateStr } from "./jazz-nyc.js";

// Formats below are taken verbatim from the live jazz-nyc.com schedule table.

test("parses a plain time with no space before the meridiem", () => {
  assert.deepEqual(parseSetTimes("7:00PM"), ["19:00:00"]);
});

test("parses a time WITH a space before the meridiem", () => {
  // Regression: the original regex required no space, so every row in this
  // format fell through to a midnight default.
  assert.deepEqual(parseSetTimes("7:00 PM"), ["19:00:00"]);
});

test("takes the start of a start-end range", () => {
  assert.deepEqual(parseSetTimes("7:00PM - 11:00PM"), ["19:00:00"]);
});

test("returns every set when a row lists multiple sets", () => {
  // These second sets are the late-night inventory the feed was missing.
  assert.deepEqual(parseSetTimes("7:00 PM & 9:30 PM"), ["19:00:00", "21:30:00"]);
  assert.deepEqual(parseSetTimes("5:30PM & 8:30PM"), ["17:30:00", "20:30:00"]);
  assert.deepEqual(parseSetTimes("8:00 PM & 10:30 PM"), ["20:00:00", "22:30:00"]);
});

test("handles three or more sets", () => {
  assert.deepEqual(parseSetTimes("7:00PM & 9:00PM & 11:00PM"), [
    "19:00:00",
    "21:00:00",
    "23:00:00",
  ]);
});

test("handles 'and' as a separator", () => {
  assert.deepEqual(parseSetTimes("7:00 PM and 9:30 PM"), ["19:00:00", "21:30:00"]);
});

test("converts AM times correctly", () => {
  assert.deepEqual(parseSetTimes("11:00AM"), ["11:00:00"]);
});

test("handles midnight and noon boundaries", () => {
  assert.deepEqual(parseSetTimes("12:00AM"), ["00:00:00"]);
  assert.deepEqual(parseSetTimes("12:30AM"), ["00:30:00"]);
  assert.deepEqual(parseSetTimes("12:00PM"), ["12:00:00"]);
  assert.deepEqual(parseSetTimes("12:15PM"), ["12:15:00"]);
});

test("is case insensitive", () => {
  assert.deepEqual(parseSetTimes("9:00pm"), ["21:00:00"]);
  assert.deepEqual(parseSetTimes("9:00 p.m."), ["21:00:00"]);
});

test("returns an empty list rather than defaulting to midnight", () => {
  // A null time must not become 00:00 — that silently mistimes the event and
  // makes it look like late-night programming.
  assert.deepEqual(parseSetTimes(""), []);
  assert.deepEqual(parseSetTimes(null), []);
  assert.deepEqual(parseSetTimes(undefined), []);
  assert.deepEqual(parseSetTimes("Call venue"), []);
  assert.deepEqual(parseSetTimes("TBA"), []);
});

test("deduplicates repeated set times", () => {
  assert.deepEqual(parseSetTimes("9:00PM & 9:00PM"), ["21:00:00"]);
});

test("ignores an unparseable fragment but keeps the good ones", () => {
  assert.deepEqual(parseSetTimes("7:00 PM & TBA"), ["19:00:00"]);
});

// ─── NYC calendar date ───────────────────────────────────────────────────────

test("nycDateStr uses the NYC date, not the server's local date", () => {
  // 00:32 UTC on Aug 5 is still 20:32 on Aug 4 in New York. Railway runs UTC,
  // so this is exactly the case that made the 8pm run fetch tomorrow.
  assert.equal(nycDateStr(new Date("2026-08-05T00:32:00Z")), "08/04/26");
});

test("nycDateStr rolls over at NYC midnight, not UTC midnight", () => {
  assert.equal(nycDateStr(new Date("2026-08-05T03:59:00Z")), "08/04/26"); // 23:59 ET
  assert.equal(nycDateStr(new Date("2026-08-05T04:01:00Z")), "08/05/26"); // 00:01 ET
});

test("nycDateStr handles EST as well as EDT", () => {
  // January: NYC is UTC-5, so 04:30 UTC is still the previous evening.
  assert.equal(nycDateStr(new Date("2027-01-15T04:30:00Z")), "01/14/27");
});

test("nycDateStr zero-pads month and day", () => {
  assert.equal(nycDateStr(new Date("2026-03-07T18:00:00Z")), "03/07/26");
});
