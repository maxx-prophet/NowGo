import { test } from "node:test";
import assert from "node:assert/strict";
import { findVenuesByEmbedding } from "./venue-embeddings.js";

// A pool whose nearest-neighbour answer is keyed on the vector it is given,
// so each name can get its own distance.
function fakePool(answers) {
  const queries = [];
  return {
    queries,
    query: async (sql, params) => {
      queries.push(params[0]);
      const row = answers[params[0]];
      return { rows: row ? [row] : [] };
    },
  };
}

test("embeds every name in one call and resolves each to its nearest venue", async () => {
  const calls = [];
  const embed = async inputs => { calls.push(inputs); return inputs.map((_, i) => [i]); };
  const pool = fakePool({
    "[0]": { name: "Madison Square Garden", distance: 0.05 },
    "[1]": { name: "Beacon Theatre", distance: 0.1 },
  });

  const resolved = await findVenuesByEmbedding(pool, ["MSG", "The Beacon"], { embed });

  assert.equal(calls.length, 1, "one embedding request for the whole batch");
  assert.deepEqual(calls[0], ["MSG, New York", "The Beacon, New York"]);
  assert.deepEqual([...resolved], [["MSG", "Madison Square Garden"], ["The Beacon", "Beacon Theatre"]]);
});

test("a match above the similarity threshold is left unresolved", async () => {
  const embed = async inputs => inputs.map((_, i) => [i]);
  const pool = fakePool({
    "[0]": { name: "Blue Note", distance: 0.02 },
    "[1]": { name: "Blue Note", distance: 0.4 },
  });
  const resolved = await findVenuesByEmbedding(pool, ["Blue Note Jazz Club", "Kismet"], { embed });
  assert.deepEqual([...resolved], [["Blue Note Jazz Club", "Blue Note"]]);
});

test("no names means no embedding call", async () => {
  let called = false;
  const resolved = await findVenuesByEmbedding(fakePool({}), [], { embed: async () => { called = true; return []; } });
  assert.equal(called, false);
  assert.equal(resolved.size, 0);
});

test("an embedding failure resolves nothing rather than throwing", async () => {
  const resolved = await findVenuesByEmbedding(fakePool({}), ["MSG"], {
    embed: async () => { throw new Error("rate limited"); },
  });
  assert.equal(resolved.size, 0);
});

test("without an OpenAI key it resolves nothing and never calls the API", async () => {
  const saved = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    const resolved = await findVenuesByEmbedding(fakePool({}), ["MSG"]);
    assert.equal(resolved.size, 0);
  } finally {
    if (saved !== undefined) process.env.OPENAI_API_KEY = saved;
  }
});
