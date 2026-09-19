import { test } from "node:test";
import assert from "node:assert/strict";
import { generateHooks } from "./hook-generation.js";

const events = n => Array.from({ length: n }, (_, i) => ({ event_id: `e${i}`, name: `Event ${i}` }));

// A generate() whose promises resolve only when the test says so, so the
// test controls how many are in flight at once.
function controllableGenerate() {
  const pending = [];
  let inFlight = 0;
  let peak = 0;
  const generate = event =>
    new Promise(resolve => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      pending.push(() => { inFlight--; resolve(`hook for ${event.event_id}`); });
    });
  return { generate, pending, peak: () => peak };
}

test("runs at most `concurrency` generate calls at once and still processes every event", async () => {
  const { generate, pending, peak } = controllableGenerate();
  const saved = [];
  const run = generateHooks(events(8), {
    generate,
    save: async (id, hook) => saved.push([id, hook]),
    concurrency: 3,
    warn: () => {},
  });

  // Let the queue drain, releasing one call at a time.
  await new Promise(r => setImmediate(r));
  assert.equal(pending.length, 3, "only the first three should have started");
  while (pending.length) {
    pending.shift()();
    await new Promise(r => setImmediate(r));
  }

  const result = await run;
  assert.equal(peak(), 3);
  assert.equal(saved.length, 8);
  assert.deepEqual(result, { generated: 8, failed: 0 });
});

test("pairs each hook with its own event when calls resolve out of order", async () => {
  const saved = new Map();
  await generateHooks(events(4), {
    // Earlier events take longer, so e3 resolves first and e0 last.
    generate: e => new Promise(r => setTimeout(() => r(`hook ${e.event_id}`), 40 - Number(e.event_id.slice(1)) * 10)),
    save: async (id, hook) => saved.set(id, hook),
    concurrency: 4,
    warn: () => {},
  });
  assert.deepEqual([...saved], [
    ["e3", "hook e3"], ["e2", "hook e2"], ["e1", "hook e1"], ["e0", "hook e0"],
  ]);
});

test("one failed call is counted and does not stop the others", async () => {
  const warnings = [];
  const saved = [];
  const result = await generateHooks(events(5), {
    generate: async e => { if (e.event_id === "e2") throw new Error("overloaded"); return `hook ${e.event_id}`; },
    save: async (id, hook) => saved.push(id),
    concurrency: 2,
    warn: m => warnings.push(m),
  });
  assert.deepEqual(result, { generated: 4, failed: 1 });
  assert.deepEqual(saved.sort(), ["e0", "e1", "e3", "e4"]);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /e2.*overloaded/);
});

test("an empty response is neither saved nor counted as generated", async () => {
  const saved = [];
  const result = await generateHooks(events(2), {
    generate: async e => (e.event_id === "e0" ? "   " : "real hook"),
    save: async id => saved.push(id),
    concurrency: 2,
    warn: () => {},
  });
  assert.deepEqual(saved, ["e1"]);
  assert.deepEqual(result, { generated: 1, failed: 0 });
});
