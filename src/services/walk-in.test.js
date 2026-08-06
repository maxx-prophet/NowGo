import { test } from "node:test";
import assert from "node:assert/strict";
import {
  WALK_IN_QUALIFYING,
  WALK_IN_POLICIES,
  qualifiesAsWalkIn,
  WALK_IN_SQL,
} from "./walk-in.js";

test("qualifiesAsWalkIn is true for policies a user can rely on", () => {
  assert.equal(qualifiesAsWalkIn("always"), true);
  assert.equal(qualifiesAsWalkIn("space_permitting"), true);
});

test("qualifiesAsWalkIn is false for standby", () => {
  // A queue with no guarantee is not something to promise someone who
  // explicitly filtered for walk-ins.
  assert.equal(qualifiesAsWalkIn("standby"), false);
});

test("qualifiesAsWalkIn is false for none and unknown", () => {
  assert.equal(qualifiesAsWalkIn("none"), false);
  assert.equal(qualifiesAsWalkIn("unknown"), false);
});

test("qualifiesAsWalkIn is false for missing or unexpected values", () => {
  assert.equal(qualifiesAsWalkIn(null), false);
  assert.equal(qualifiesAsWalkIn(undefined), false);
  assert.equal(qualifiesAsWalkIn(""), false);
  assert.equal(qualifiesAsWalkIn("ALWAYS"), false);
  assert.equal(qualifiesAsWalkIn("walk_in"), false);
});

test("every qualifying policy is a valid policy", () => {
  // Guards the drift that already exists between availability_tier's CHECK
  // constraint and the 'limited' value availability.js writes.
  for (const p of WALK_IN_QUALIFYING) {
    assert.ok(WALK_IN_POLICIES.includes(p), `${p} is not a valid policy`);
  }
});

test("WALK_IN_POLICIES matches the migration's CHECK constraint exactly", () => {
  assert.deepEqual(
    [...WALK_IN_POLICIES].sort(),
    ["always", "none", "space_permitting", "standby", "unknown"]
  );
});

test("WALK_IN_SQL references the venues alias and every qualifying policy", () => {
  assert.match(WALK_IN_SQL, /v\.walk_in_policy/);
  for (const p of WALK_IN_QUALIFYING) {
    assert.ok(WALK_IN_SQL.includes(`'${p}'`), `${p} missing from SQL`);
  }
  assert.ok(!WALK_IN_SQL.includes("'standby'"), "standby must not qualify");
});

test("WALK_IN_SQL is NULL-safe for events with no venue row", () => {
  // A LEFT JOIN on venues yields no `v` row when events.venue_id is null, so
  // v.walk_in_policy is SQL NULL and `NULL IN (...)` is NULL, not FALSE.
  // COALESCE to 'unknown' keeps the expression — and therefore the API's
  // walk_in field — a real boolean rather than sometimes null.
  assert.match(WALK_IN_SQL, /COALESCE\(v\.walk_in_policy,\s*'unknown'\)/);
  assert.match(WALK_IN_SQL, /v\.walk_in_policy/);
  for (const p of WALK_IN_QUALIFYING) {
    assert.ok(WALK_IN_SQL.includes(`'${p}'`), `${p} missing from SQL`);
  }
});
