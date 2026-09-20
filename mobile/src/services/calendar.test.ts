import { test } from "node:test";
import assert from "node:assert/strict";
import { calendarEntryFor } from "./calendar.ts";

const NOW = new Date("2026-09-20T22:00:00Z");
const START = "2026-09-21T00:00:00Z"; // 8pm ET
const LEAVE_BY = "2026-09-20T23:12:00Z"; // 7:12pm ET, still ahead
const LEAVE_BY_PASSED = "2026-09-20T21:30:00Z";

const base = {
  name: "Makoto Ozone Trio",
  venue_name: "Birdland Jazz Club",
  venue_address: "315 W 44th St, New York, NY 10036",
  url: "https://www.birdlandjazz.com/",
  start_time: START,
  end_time: null,
  availability_tier: "unknown",
};

test("the entry carries the event name, venue and start", () => {
  const e = calendarEntryFor(base, LEAVE_BY, NOW);
  assert.equal(e.title, "Makoto Ozone Trio");
  assert.equal(e.location, "Birdland Jazz Club, 315 W 44th St, New York, NY 10036");
  assert.equal(e.startDate.toISOString(), "2026-09-21T00:00:00.000Z");
  assert.equal(e.url, "https://www.birdlandjazz.com/");
});

test("with no end time the entry lasts two hours — a calendar needs a block, not a point", () => {
  const e = calendarEntryFor(base, LEAVE_BY, NOW);
  assert.equal(e.endDate.getTime() - e.startDate.getTime(), 2 * 60 * 60 * 1000);
});

test("a real end time is used when the event has one", () => {
  const e = calendarEntryFor({ ...base, end_time: "2026-09-21T01:30:00Z" }, LEAVE_BY, NOW);
  assert.equal(e.endDate.toISOString(), "2026-09-21T01:30:00.000Z");
});

test("the alarm is the leave-by time when it is still ahead", () => {
  const e = calendarEntryFor(base, LEAVE_BY, NOW);
  assert.equal(e.alarmKind, "leave_by");
  assert.deepEqual(e.alarms, [{ absoluteDate: LEAVE_BY }]);
  assert.match(e.notes, /Leave by 7:12 PM/);
});

test("a leave-by that has passed falls back to 30 minutes before — never a reminder for the past", () => {
  const e = calendarEntryFor(base, LEAVE_BY_PASSED, NOW);
  assert.equal(e.alarmKind, "before_start");
  assert.deepEqual(e.alarms, [{ relativeOffset: -30 }]);
  assert.doesNotMatch(e.notes, /Leave by/);
});

test("no leave-by at all also means 30 minutes before", () => {
  const e = calendarEntryFor(base, null, NOW);
  assert.equal(e.alarmKind, "before_start");
  assert.deepEqual(e.alarms, [{ relativeOffset: -30 }]);
});

test("the notes say the leave-by was worked out from where the user was when they saved it", () => {
  const e = calendarEntryFor(base, LEAVE_BY, NOW);
  assert.match(e.notes, /from where you were when you saved this/);
});

test("a missing venue does not break the entry", () => {
  const e = calendarEntryFor({ ...base, venue_name: null, venue_address: null }, null, NOW);
  assert.equal(e.location, null);
  assert.equal(e.title, "Makoto Ozone Trio");
});
