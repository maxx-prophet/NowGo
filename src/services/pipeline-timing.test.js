import { test } from "node:test";
import assert from "node:assert/strict";
import { createStageTimer } from "./pipeline-timing.js";

// A fake clock so each assertion is about the arithmetic, not wall time.
function fakeClock(ticks) {
  let i = 0;
  return () => ticks[i++];
}

test("stage() returns the wrapped function's result", async () => {
  const timer = createStageTimer({ now: fakeClock([0, 10]), log: () => {} });
  const result = await timer.stage("fetch", async () => 42);
  assert.equal(result, 42);
});

test("stage() records elapsed ms per stage in call order", async () => {
  const timer = createStageTimer({ now: fakeClock([0, 1500, 1500, 1800]), log: () => {} });
  await timer.stage("fetch", async () => {});
  await timer.stage("ingest", async () => {});
  assert.deepEqual(timer.stages(), [
    { label: "fetch", ms: 1500 },
    { label: "ingest", ms: 300 },
  ]);
});

test("stage() still records the time when the function throws, then rethrows", async () => {
  const timer = createStageTimer({ now: fakeClock([0, 700]), log: () => {} });
  await assert.rejects(
    () => timer.stage("geocode", async () => { throw new Error("quota"); }),
    /quota/
  );
  assert.deepEqual(timer.stages(), [{ label: "geocode", ms: 700 }]);
});

test("report() logs the total and each stage slowest-first with its share", async () => {
  const lines = [];
  const timer = createStageTimer({ now: fakeClock([0, 1000, 1000, 5000]), log: l => lines.push(l) });
  await timer.stage("fetch", async () => {});
  await timer.stage("hooks", async () => {});
  timer.report();
  assert.deepEqual(lines, [
    "  ⏱  Pipeline stages (total 5.0s):",
    "       4.0s  80%  hooks",
    "       1.0s  20%  fetch",
  ]);
});

test("optional() returns the result when the function succeeds and records no failure", async () => {
  const timer = createStageTimer({ now: fakeClock([0, 10]), log: () => {}, logError: () => {} });
  const result = await timer.optional("fetch:ticketmaster", async () => [1, 2]);
  assert.deepEqual(result, [1, 2]);
  assert.deepEqual(timer.failures(), []);
});

// A dead Ticketmaster key (401) used to abort the whole run, so no source was
// ingested and no hooks were written. A failure must stop only its own stage.
test("optional() swallows a failure, logs it, records it, and returns the fallback", async () => {
  const errors = [];
  const timer = createStageTimer({ now: fakeClock([0, 5, 5, 9]), log: () => {}, logError: l => errors.push(l) });
  const result = await timer.optional("fetch:ticketmaster", async () => { throw new Error("TM API error: 401"); }, []);
  const next = await timer.optional("fetch:jazz-nyc", async () => ["set"]);
  assert.deepEqual(result, []);
  assert.deepEqual(next, ["set"]);
  assert.deepEqual(errors, ["  ❌ fetch:ticketmaster failed (continuing): TM API error: 401"]);
  assert.deepEqual(timer.failures(), [{ label: "fetch:ticketmaster", error: "TM API error: 401" }]);
  assert.deepEqual(timer.stages(), [
    { label: "fetch:ticketmaster", ms: 5 },
    { label: "fetch:jazz-nyc", ms: 4 },
  ]);
});

test("optional() returns null by default when the function throws", async () => {
  const timer = createStageTimer({ now: fakeClock([0, 1]), log: () => {}, logError: () => {} });
  assert.equal(await timer.optional("hook-generation", async () => { throw new Error("401"); }), null);
});
