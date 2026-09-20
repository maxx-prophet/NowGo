import { test } from "node:test";
import assert from "node:assert/strict";
import { markSourceFetched } from "./sources.js";

function fakePool() {
  const calls = [];
  return { calls, query: async (sql, params) => { calls.push({ sql, params }); return { rowCount: 1 }; } };
}

test("markSourceFetched stamps last_fetched_at for that source only", async () => {
  const pool = fakePool();
  await markSourceFetched("jazz_nyc", pool);
  assert.equal(pool.calls.length, 1);
  assert.match(pool.calls[0].sql, /UPDATE sources/);
  assert.match(pool.calls[0].sql, /last_fetched_at\s*=\s*now\(\)/);
  assert.deepEqual(pool.calls[0].params, ["jazz_nyc"]);
});

test("a database error is swallowed — a bookkeeping stamp must never fail a fetch", async () => {
  const pool = { query: async () => { throw new Error("connection reset"); } };
  await assert.doesNotReject(() => markSourceFetched("seatgeek", pool));
});
