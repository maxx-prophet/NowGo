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
