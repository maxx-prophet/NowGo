import { test } from "node:test";
import assert from "node:assert/strict";
import {
  tonightWindow, nycLocalToUtc,
  eveningDates, nightBounds, nightOf, fetchWindow, parseFeedNight, nightWindowSql,
} from "./tonight-window.js";

// The bug this guards: the window used to be built with setHours(), which
// resolves in the host's zone. Every assertion below must hold identically
// whether the process runs in UTC (Railway) or America/New_York (a laptop).

test("the window is 5pm ET to 4am ET regardless of host timezone", () => {
  // 2026-09-01 21:30 UTC == 17:30 EDT
  const w = tonightWindow(new Date("2026-09-01T21:30:00Z"));
  assert.equal(w.localStart, "2026-09-01T17:00:00");
  assert.equal(w.localEnd, "2026-09-02T04:00:00");
  assert.equal(w.utcStart, "2026-09-01T21:00:00Z"); // 5pm EDT
  assert.equal(w.utcEnd, "2026-09-02T08:00:00Z");   // 4am EDT
});

test("the same instant yields the same window seen from UTC or from NYC", () => {
  const instant = new Date("2026-09-02T01:00:00Z"); // 9pm EDT Sept 1
  const w = tonightWindow(instant);
  assert.equal(w.localStart, "2026-09-01T17:00:00");
  assert.equal(w.utcStart, "2026-09-01T21:00:00Z");
});

test("a 1am ET request still belongs to the evening that just happened", () => {
  // 2026-09-02 05:00 UTC == 01:00 EDT on Sept 2 — still "Tuesday night".
  const w = tonightWindow(new Date("2026-09-02T05:00:00Z"));
  assert.equal(w.localStart, "2026-09-01T17:00:00");
  assert.equal(w.localEnd, "2026-09-02T04:00:00");
});

test("a 5am ET request has rolled over to the new evening", () => {
  const w = tonightWindow(new Date("2026-09-02T09:00:00Z")); // 05:00 EDT
  assert.equal(w.localStart, "2026-09-02T17:00:00");
});

test("the window ends at 4am, matching the /events/tonight SQL window", () => {
  // Fetching only to 2am left the API serving a window the fetchers never filled.
  const w = tonightWindow(new Date("2026-09-01T21:30:00Z"));
  assert.match(w.localEnd, /T04:00:00$/);
});

test("winter dates use EST, not a hardcoded summer offset", () => {
  const w = tonightWindow(new Date("2026-01-15T22:30:00Z")); // 17:30 EST
  assert.equal(w.localStart, "2026-01-15T17:00:00");
  assert.equal(w.utcStart, "2026-01-15T22:00:00Z"); // 5pm EST = 22:00Z
  assert.equal(w.utcEnd, "2026-01-16T09:00:00Z");   // 4am EST = 09:00Z
});

test("the spring-forward night still produces a sane window", () => {
  // DST begins 2am ET on 2026-03-08; the window's 4am end sits after the jump.
  const w = tonightWindow(new Date("2026-03-07T23:00:00Z")); // 18:00 EST Mar 7
  assert.equal(w.localStart, "2026-03-07T17:00:00");
  assert.equal(w.localEnd, "2026-03-08T04:00:00");
  assert.equal(w.utcStart, "2026-03-07T22:00:00Z"); // EST
  assert.equal(w.utcEnd, "2026-03-08T08:00:00Z");   // EDT, offset already shifted
  assert.ok(new Date(w.utcEnd) > new Date(w.utcStart));
});

test("nycLocalToUtc resolves both sides of a DST boundary", () => {
  assert.equal(nycLocalToUtc(2026, 1, 15, 17).toISOString(), "2026-01-15T22:00:00.000Z");
  assert.equal(nycLocalToUtc(2026, 7, 15, 17).toISOString(), "2026-07-15T21:00:00.000Z");
});

// All instants below are 2026-09-01/02 (EDT, UTC-4) unless noted.
const iso = (d) => d.toISOString();

test("nightBounds at 2pm: tonight runs from 30 min ago to 4am, tomorrow is the next evening", () => {
  const now = new Date("2026-09-01T18:00:00Z"); // 2pm EDT
  const t = nightBounds("tonight", now);
  assert.equal(iso(t.start), "2026-09-01T17:30:00.000Z");
  assert.equal(iso(t.end), "2026-09-02T08:00:00.000Z");
  const m = nightBounds("tomorrow", now);
  assert.equal(iso(m.start), "2026-09-02T21:00:00.000Z"); // Sep 2 5pm EDT
  assert.equal(iso(m.end), "2026-09-03T08:00:00.000Z");   // Sep 3 4am EDT
});

test("nightBounds at 6pm and 11:30pm agree on which evening is tomorrow", () => {
  for (const now of [new Date("2026-09-01T22:00:00Z"), new Date("2026-09-02T03:30:00Z")]) {
    assert.equal(iso(nightBounds("tonight", now).end), "2026-09-02T08:00:00.000Z");
    assert.equal(iso(nightBounds("tomorrow", now).start), "2026-09-02T21:00:00.000Z");
  }
});

test("after midnight, tonight still ends at 4am today, not 4am tomorrow", () => {
  // The old TONIGHT_WINDOW_SQL extended to 4am the *following* day here.
  for (const now of [new Date("2026-09-02T05:00:00Z"), new Date("2026-09-02T07:59:00Z")]) { // 1am, 3:59am
    assert.equal(iso(nightBounds("tonight", now).end), "2026-09-02T08:00:00.000Z");
    const m = nightBounds("tomorrow", now);
    assert.equal(iso(m.start), "2026-09-02T21:00:00.000Z"); // today 5pm
    assert.equal(iso(m.end), "2026-09-03T08:00:00.000Z");
  }
});

test("at 4:00am the evening rolls over", () => {
  const now = new Date("2026-09-02T08:00:00Z"); // 4am EDT
  assert.equal(iso(nightBounds("tonight", now).end), "2026-09-03T08:00:00.000Z");
  assert.equal(iso(nightBounds("tomorrow", now).start), "2026-09-03T21:00:00.000Z");
});

test("nightBounds across fall-back: the 4am end is EST", () => {
  // DST ends 2am ET on 2026-11-01. 11pm EDT Oct 31 == 03:00Z Nov 1.
  const now = new Date("2026-11-01T03:00:00Z");
  assert.equal(iso(nightBounds("tonight", now).end), "2026-11-01T09:00:00.000Z"); // 4am EST
  const m = nightBounds("tomorrow", now);
  assert.equal(iso(m.start), "2026-11-01T22:00:00.000Z"); // 5pm EST
  assert.equal(iso(m.end), "2026-11-02T09:00:00.000Z");
});

test("nightBounds across spring-forward: tomorrow starts EST and ends EDT", () => {
  // DST begins 2am ET on 2026-03-08. 9pm EST Mar 6 == 02:00Z Mar 7.
  const m = nightBounds("tomorrow", new Date("2026-03-07T02:00:00Z"));
  assert.equal(iso(m.start), "2026-03-07T22:00:00.000Z"); // Mar 7 5pm EST
  assert.equal(iso(m.end), "2026-03-08T08:00:00.000Z");   // Mar 8 4am EDT
});

test("nightBounds rejects an unknown night", () => {
  assert.throws(() => nightBounds("weekend", new Date()), /Unknown night/);
});

test("eveningDates after midnight belongs to the evening that started yesterday", () => {
  const d = eveningDates(new Date("2026-09-02T05:00:00Z")); // 1am Sep 2
  assert.deepEqual(d.tonight, { year: 2026, month: 9, day: 1 });
  assert.deepEqual(d.tomorrow, { year: 2026, month: 9, day: 2 });
});

test("eveningDates crosses a year boundary", () => {
  const d = eveningDates(new Date("2026-12-31T23:00:00Z")); // 6pm EST Dec 31
  assert.deepEqual(d.tomorrow, { year: 2027, month: 1, day: 1 });
});

test("nightOf places an event in tomorrow only inside tomorrow's bounds", () => {
  const now = new Date("2026-09-01T22:00:00Z"); // 6pm EDT Sep 1
  assert.equal(nightOf("2026-09-02T00:00:00Z", now), "tonight");  // 8pm Sep 1
  assert.equal(nightOf("2026-09-02T21:00:00Z", now), "tomorrow"); // 5pm Sep 2
  assert.equal(nightOf("2026-09-03T07:59:00Z", now), "tomorrow"); // 3:59am Sep 3
});

test("fetchWindow runs from this evening's 5pm through tomorrow evening's 4am", () => {
  const w = fetchWindow(new Date("2026-09-01T22:00:00Z")); // 6pm EDT
  assert.equal(w.localStart, "2026-09-01T17:00:00");
  assert.equal(w.localEnd, "2026-09-03T04:00:00");
  assert.equal(w.utcStart, "2026-09-01T21:00:00Z");
  assert.equal(w.utcEnd, "2026-09-03T08:00:00Z");
});

test("fetchWindow after midnight still starts at the current evening", () => {
  const w = fetchWindow(new Date("2026-09-02T05:00:00Z")); // 1am Sep 2
  assert.equal(w.localStart, "2026-09-01T17:00:00");
  assert.equal(w.localEnd, "2026-09-03T04:00:00");
});

test("parseFeedNight defaults to tonight", () => {
  assert.deepEqual(parseFeedNight({ night: undefined, surpriseMe: false }), { night: "tonight" });
  assert.deepEqual(parseFeedNight({ night: "", surpriseMe: false }), { night: "tonight" });
  assert.deepEqual(parseFeedNight({ night: "tomorrow", surpriseMe: false }), { night: "tomorrow" });
});

test("parseFeedNight rejects an unknown night rather than silently defaulting", () => {
  const r = parseFeedNight({ night: "Tomorrow", surpriseMe: false });
  assert.equal(r.status, 400);
  assert.match(r.error, /tonight, tomorrow/);
});

test("parseFeedNight rejects surprise_me for tomorrow", () => {
  // Surprise Me means "the next 30–90 minutes".
  const r = parseFeedNight({ night: "tomorrow", surpriseMe: true });
  assert.equal(r.status, 400);
});

test("nightWindowSql is a half-open range on the given placeholders", () => {
  assert.equal(nightWindowSql("$6", "$7"), "e.start_time >= $6 AND e.start_time < $7");
});
