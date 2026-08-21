import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyReason } from "./coverage.ts";

test("located user outside the coverage area is told so, not that the city is empty", () => {
  assert.equal(
    emptyReason({ isFiltered: false, usedLocation: true, nationwideCount: 50 }),
    "outside-coverage",
  );
});

test("a genuinely quiet night in NYC is not misreported as being out of area", () => {
  // The late-night window legitimately empties out. Without positive proof that
  // events exist elsewhere, we must not claim the user is in the wrong city.
  assert.equal(
    emptyReason({ isFiltered: false, usedLocation: true, nationwideCount: 0 }),
    "none-tonight",
  );
});

test("an unrun probe cannot produce an out-of-area claim", () => {
  assert.equal(
    emptyReason({ isFiltered: false, usedLocation: true, nationwideCount: null }),
    "none-tonight",
  );
});

test("a user with no location is never out of area — that search had no radius", () => {
  assert.equal(
    emptyReason({ isFiltered: false, usedLocation: false, nationwideCount: 50 }),
    "none-tonight",
  );
});

test("filters take precedence, because clearing them is the actionable fix", () => {
  assert.equal(
    emptyReason({ isFiltered: true, usedLocation: true, nationwideCount: 50 }),
    "filtered",
  );
});

test("filters win even with no location, so the message stays actionable", () => {
  assert.equal(
    emptyReason({ isFiltered: true, usedLocation: false, nationwideCount: 0 }),
    "filtered",
  );
});
