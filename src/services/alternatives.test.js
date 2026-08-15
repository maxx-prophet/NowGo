import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_ALTERNATIVES,
  ALTERNATIVES_RADIUS_KM,
  offersAlternatives,
  ALTERNATIVES_SQL,
  fetchAlternatives,
} from "./alternatives.js";
import { TONIGHT_WINDOW_SQL } from "./tonight-window.js";

// A pool stand-in that records the query it was handed and returns fixed rows.
function fakePool(rows = []) {
  const calls = [];
  return {
    calls,
    async query(text, params) {
      calls.push({ text, params });
      return { rows };
    },
  };
}

// Smalls, in the West Village.
const soldOut = {
  event_id: "evt-1",
  availability_tier: "sold_out",
  neighborhood: "West Village",
  venue_lat: 40.734387,
  venue_lng: -74.002765,
  start_time: "2026-08-13T23:30:00.000Z",
};

test("offersAlternatives is true only for sold-out events", () => {
  assert.equal(offersAlternatives({ ...soldOut, availability_tier: "sold_out" }), true);
});

test("offersAlternatives is false for events a user can still get into", () => {
  // Offering alternatives to an available event tells the user something is
  // wrong with a show that is fine.
  for (const tier of ["available", "scarce", "unknown", "limited"]) {
    assert.equal(
      offersAlternatives({ ...soldOut, availability_tier: tier }),
      false,
      `${tier} should not offer alternatives`
    );
  }
});

test("offersAlternatives is false for cancelled events", () => {
  // Cancelled is not sold out. The feed drops these entirely, so an
  // alternatives block would be attached to something never shown.
  assert.equal(offersAlternatives({ ...soldOut, availability_tier: "cancelled" }), false);
});

test("offersAlternatives is false when the venue has no coordinates", () => {
  // Coordinates ARE the matching rule. venues.neighborhood is derived from
  // them, so without coordinates there is nothing to match on at all.
  assert.equal(offersAlternatives({ ...soldOut, venue_lat: null }), false);
  assert.equal(offersAlternatives({ ...soldOut, venue_lng: null }), false);
  assert.equal(offersAlternatives({ ...soldOut, venue_lat: null, venue_lng: null }), false);
});

test("offersAlternatives does not require a neighborhood", () => {
  // Neighborhood only boosts ordering. A venue too far from every centroid to
  // place still deserves nearby suggestions.
  assert.equal(offersAlternatives({ ...soldOut, neighborhood: null }), true);
});

test("offersAlternatives tolerates a missing event", () => {
  assert.equal(offersAlternatives(null), false);
  assert.equal(offersAlternatives(undefined), false);
  assert.equal(offersAlternatives({}), false);
});

test("ALTERNATIVES_SQL reuses the shared tonight window verbatim", () => {
  // If alternatives used a wider window it would offer events the feed itself
  // refuses to show — the user taps through to something that isn't there.
  assert.ok(
    ALTERNATIVES_SQL.includes(TONIGHT_WINDOW_SQL.trim()),
    "alternatives must use TONIGHT_WINDOW_SQL, not its own copy of the window"
  );
});

test("ALTERNATIVES_SQL never offers a sold-out or cancelled event", () => {
  // The entire point is a show you can actually get into.
  assert.match(ALTERNATIVES_SQL, /availability_tier\s+NOT IN\s*\('sold_out',\s*'cancelled'\)/);
});

test("ALTERNATIVES_SQL excludes the sold-out event itself", () => {
  assert.match(ALTERNATIVES_SQL, /e\.event_id\s*!=\s*\$1/);
});

test("ALTERNATIVES_SQL bounds the search by a radius around the venue", () => {
  assert.match(ALTERNATIVES_SQL, /abs\(v\.geo_lat - \$2\) < \(\$5 \/ 111\.0\)/);
  assert.match(ALTERNATIVES_SQL, /abs\(v\.geo_lng - \$3\)/);
});

test("ALTERNATIVES_SQL ranks the same neighborhood first", () => {
  const order = ALTERNATIVES_SQL.slice(ALTERNATIVES_SQL.indexOf("ORDER BY"));
  const hood = order.indexOf("v.neighborhood = $7");
  const tier = order.indexOf("'available', 'scarce'");
  assert.ok(hood > -1, "neighborhood missing from ORDER BY");
  assert.ok(hood < tier, "same neighborhood must outrank tier confidence");
});

test("ALTERNATIVES_SQL excludes venues with no coordinates", () => {
  // They cannot be placed on the map, so \"nearby\" is unanswerable for them.
  assert.match(ALTERNATIVES_SQL, /v\.geo_lat IS NOT NULL/);
  assert.match(ALTERNATIVES_SQL, /v\.geo_lng IS NOT NULL/);
});

test("ALTERNATIVES_SQL ranks verified availability above walk-ins above the rest", () => {
  // 123 of tonight's 172 events carry tier 'unknown', so filtering to
  // available/scarce would usually return nothing. Rank instead of filter, and
  // a curated walk-in venue outranks an uncurated unknown.
  const order = ALTERNATIVES_SQL.indexOf("ORDER BY");
  assert.ok(order > -1, "expected an ORDER BY");
  const tail = ALTERNATIVES_SQL.slice(order);
  const verified = tail.indexOf("'available', 'scarce'");
  const walkIn = tail.indexOf("walk_in_policy");
  assert.ok(verified > -1, "verified tiers missing from ORDER BY");
  assert.ok(walkIn > -1, "walk-in policy missing from ORDER BY");
  assert.ok(verified < walkIn, "verified availability must rank above walk-in");
});

test("ALTERNATIVES_SQL breaks ties by closeness to the original start time", () => {
  // An 8pm show selling out should not be answered with an 11:30pm one when
  // something at 8:15 exists.
  assert.match(ALTERNATIVES_SQL, /abs\(extract\(epoch from \(e\.start_time - \$4\)\)\)/);
});

test("fetchAlternatives returns nothing without querying for a non-sold-out event", async () => {
  const pool = fakePool([{ event_id: "other" }]);
  const result = await fetchAlternatives({ ...soldOut, availability_tier: "available" }, pool);
  assert.deepEqual(result, []);
  assert.equal(pool.calls.length, 0, "should not hit the database at all");
});

test("fetchAlternatives returns nothing without querying when coordinates are missing", async () => {
  const pool = fakePool([{ event_id: "other" }]);
  const result = await fetchAlternatives({ ...soldOut, venue_lat: null, venue_lng: null }, pool);
  assert.deepEqual(result, []);
  assert.equal(pool.calls.length, 0);
});

test("fetchAlternatives passes id, coordinates, start time, radius, cap and neighborhood", async () => {
  const pool = fakePool();
  await fetchAlternatives(soldOut, pool);
  assert.equal(pool.calls.length, 1);
  assert.deepEqual(pool.calls[0].params, [
    "evt-1",
    40.734387,
    -74.002765,
    "2026-08-13T23:30:00.000Z",
    ALTERNATIVES_RADIUS_KM,
    MAX_ALTERNATIVES,
    "West Village",
  ]);
});

test("fetchAlternatives passes a null neighborhood rather than undefined", async () => {
  // undefined becomes SQL NULL through node-postgres either way, but passing
  // it explicitly keeps the $7::text IS NOT NULL guard readable.
  const pool = fakePool();
  await fetchAlternatives({ ...soldOut, neighborhood: undefined }, pool);
  assert.equal(pool.calls[0].params[6], null);
});

test("fetchAlternatives returns the rows the query produced", async () => {
  const rows = [{ event_id: "a" }, { event_id: "b" }];
  const pool = fakePool(rows);
  assert.deepEqual(await fetchAlternatives(soldOut, pool), rows);
});

test("fetchAlternatives never throws the detail request — it degrades to []", async () => {
  // /events/:id must still render the event itself if this side query fails.
  const pool = {
    async query() {
      throw new Error("connection reset");
    },
  };
  assert.deepEqual(await fetchAlternatives(soldOut, pool), []);
});

test("MAX_ALTERNATIVES stays small enough to read without scrolling", () => {
  assert.ok(MAX_ALTERNATIVES >= 2 && MAX_ALTERNATIVES <= 5, `got ${MAX_ALTERNATIVES}`);
});

test("ALTERNATIVES_RADIUS_KM stays within a plausible detour", () => {
  // Someone whose plan just fell through will walk or take a couple of stops.
  // Sending them 10km away is not an alternative, it is a different evening.
  assert.ok(ALTERNATIVES_RADIUS_KM > 0.5 && ALTERNATIVES_RADIUS_KM <= 5, `got ${ALTERNATIVES_RADIUS_KM}`);
});
