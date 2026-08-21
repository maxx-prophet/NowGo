import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NOT_ATTRACTION_SQL, ATTRACTION_CANDIDATES_SQL } from "./venue-type.js";

const MIGRATION = join(import.meta.dirname, "../../db/migrations/014_venue_type.sql");
const sql = readFileSync(MIGRATION, "utf8");

const ALLOWED = ["programmed", "attraction", "unknown"];

test("the CHECK constraint allows exactly the three documented types", () => {
  const match = sql.match(/venue_type IN \(([^)]*)\)/);
  assert.ok(match, "migration must declare a CHECK constraint on venue_type");
  const declared = [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
  assert.deepEqual(declared, [...ALLOWED].sort());
});

test("the column defaults to unknown, so a new venue is never assumed to be an attraction", () => {
  assert.match(sql, /DEFAULT 'unknown'/);
});

// The whole feed would empty out if absence of curation counted as an
// attraction. Every venue starts uncurated, so this is the default path.
test("NOT_ATTRACTION_SQL keeps venues that are unknown or have no row at all", () => {
  assert.match(NOT_ATTRACTION_SQL, /COALESCE\(v\.venue_type, 'unknown'\)/);
  assert.match(NOT_ATTRACTION_SQL, /<>\s*'attraction'/);
});

test("every seeded value is one the CHECK constraint allows", () => {
  const seeded = [...sql.matchAll(/SET venue_type = '([^']+)'/g)].map((m) => m[1]);
  assert.ok(seeded.length > 0, "migration should seed the known attractions");
  for (const value of seeded) {
    assert.ok(ALLOWED.includes(value), `seeded value ${value} violates the CHECK constraint`);
  }
});

// db/migrate.js re-runs every migration on every run. Without the guard, a
// human's curation would be silently reverted on the next deploy.
test("every seed statement is guarded so re-running migrations cannot clobber curation", () => {
  const statements = sql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.startsWith("UPDATE venues"));
  assert.ok(statements.length > 0);
  for (const statement of statements) {
    assert.match(
      statement,
      /COALESCE\(venue_type,\s*'unknown'\)\s*=\s*'unknown'/,
      `unguarded seed statement would clobber curation:\n${statement}`
    );
  }
});

test("the worklist query only ever proposes uncurated venues", () => {
  assert.match(ATTRACTION_CANDIDATES_SQL, /COALESCE\(venue_type, 'unknown'\) = 'unknown'/);
});

// Name matching is a worklist generator, never a filter — a jazz concert at
// the Whitney is a real event at a museum. Guard against the pattern quietly
// migrating into the exclusion rule.
test("the name pattern is confined to the worklist and absent from the filter", () => {
  assert.match(ATTRACTION_CANDIDATES_SQL, /museum/i);
  assert.doesNotMatch(NOT_ATTRACTION_SQL, /museum/i);
});
