import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mapTier } from "./availability.js";

// The values events.availability_tier is allowed to hold, per
// db/migrations/001_initial_schema.sql.
const ALLOWED_TIERS = ["available", "scarce", "sold_out", "cancelled", "unknown"];

test("mapTier only ever returns a tier the CHECK constraint permits", () => {
  // The bug this guards: mapTier returned 'limited', which the constraint
  // rejects. It never surfaced because this service short-circuits when
  // TICKETSDATA credentials are missing, so it has not run in production.
  const bodies = [
    { _embedded: { offer: [1, 2, 3, 4, 5] } },
    { _embedded: { offer: [1, 2] } },
    { _embedded: { offer: [] } },
    { offers: [1, 2, 3, 4] },
    { offers: [1] },
    { listings: [1, 2, 3, 4, 5] },
    { listings: [1] },
    { data: [1, 2] },
    { data: [] },
    {},
    null,
    undefined,
  ];
  for (const body of bodies) {
    const tier = mapTier(body);
    assert.ok(
      ALLOWED_TIERS.includes(tier),
      `mapTier(${JSON.stringify(body)}) returned '${tier}', which the CHECK constraint rejects`
    );
  }
});

test("mapTier grades on how much inventory it found", () => {
  assert.equal(mapTier({ offers: [1, 2, 3, 4] }), "available");
  assert.equal(mapTier({ offers: [1, 2, 3] }), "scarce");
  assert.equal(mapTier({ offers: [1] }), "scarce");
  assert.equal(mapTier({ offers: [] }), "sold_out");
});

test("mapTier counts offers and listings together", () => {
  assert.equal(mapTier({ offers: [1, 2], listings: [1, 2, 3] }), "available");
  assert.equal(mapTier({ offers: [1], listings: [1] }), "scarce");
});

test("mapTier tolerates a malformed payload without throwing", () => {
  assert.equal(mapTier({ offers: "not an array" }), "sold_out");
  assert.equal(mapTier({ _embedded: null }), "sold_out");
});

test("no code path writes a tier the schema rejects", () => {
  // A blunt guard on the whole file: any literal assigned to availability_tier
  // must be one the constraint allows. Catches a future edit reintroducing
  // 'unverified' or similar in a path a unit test does not reach.
  const src = readFileSync(join(import.meta.dirname, "availability.js"), "utf8");
  for (const [, value] of src.matchAll(/availability_tier\s*=\s*'([^']+)'/g)) {
    assert.ok(
      ALLOWED_TIERS.includes(value),
      `availability.js writes availability_tier = '${value}', which the CHECK constraint rejects`
    );
  }
});
