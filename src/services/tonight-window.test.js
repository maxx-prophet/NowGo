import { test } from "node:test";
import assert from "node:assert/strict";
import { tonightWindow, nycLocalToUtc } from "./tonight-window.js";

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
