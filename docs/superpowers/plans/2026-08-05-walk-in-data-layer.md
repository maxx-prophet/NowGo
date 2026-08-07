# Walk-In Data Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the app's "walk-ins only" filter return real results by curating walk-in policy per venue, replacing the `events.walk_in` column that no code has ever written.

**Architecture:** Walk-in status is a curated property of a *venue*, not an inferred property of an event. A migration adds `venues.walk_in_policy` (five-value enum) and `venues.door_price`, seeded for nine venues with guards so re-running migrations never overwrites human curation. `src/services/walk-in.js` defines exactly once which policies count as "walk-in", and `src/server.js` derives the existing `walk_in` boolean from the venue join instead of the dead column. A pipeline log line names venues that still need a curation decision.

**Tech Stack:** Node.js (ESM), Express, PostgreSQL (`pg`), `node --test` for tests. No new dependencies.

## Global Constraints

- Backend runs from the repo root. `cd /Users/donniebolen/Desktop/NowGo` before any command.
- Load secrets with `set -a; . ./.env.nowgo; set +a` — never hardcode or echo them.
- `db/migrate.js` re-runs **every** migration file on **every** run. Every data-modifying statement in a migration must be idempotent AND must not overwrite values a human later changed.
- New test files must be added to the `test` script in `package.json` or they silently never run.
- Do not modify `availability_tier`, `src/services/ranking.js`, or anything under `mobile/`. Those are explicitly out of scope.
- The API response field stays named `walk_in` and stays a boolean, so the existing TestFlight build keeps working without a rebuild.
- Venue names are matched with `lower(name)` and must use the exact spellings in the database, including the misspelled `Village Vangard`.

---

## File Structure

| File | Responsibility |
|---|---|
| `db/migrations/009_venue_walk_in.sql` (create) | Adds the two columns and the guarded seed data |
| `src/services/walk-in.js` (create) | Single definition of which policies qualify; curation-signal query |
| `src/services/walk-in.test.js` (create) | Unit tests for the pure logic |
| `src/server.js` (modify) | Derive `walk_in` from the venue join; expose `walk_in_policy` and `door_price` |
| `src/scheduler.js` (modify) | Call the curation signal at the end of the pipeline |
| `package.json` (modify) | Register the new test file |

---

### Task 1: Migration — columns and guarded seeds

**Files:**
- Create: `db/migrations/009_venue_walk_in.sql`

**Interfaces:**
- Consumes: nothing
- Produces: `venues.walk_in_policy TEXT` (values `always`, `space_permitting`, `standby`, `none`, `unknown`; default `unknown`), `venues.door_price NUMERIC(6,2)`

- [ ] **Step 1: Write the migration**

Create `db/migrations/009_venue_walk_in.sql`:

```sql
-- ─── VENUE WALK-IN POLICY ────────────────────────────────────────────────────
-- Whether you can turn up at a venue without buying ahead, and what it costs at
-- the door. Curated per venue: no source exposes this as structured data.
--
-- Hybrid is the normal case for NYC jazz clubs — Smalls sells $35 advance
-- tickets AND admits $25 walk-ins if there is room — so this is a reliability
-- scale, not a boolean.
--
--   always            no advance option; you just show up
--   space_permitting  advance tickets exist, walk-ins admitted if there is room
--   standby           walk-ins queue with no guarantee
--   none              advance purchase genuinely required
--   unknown           not yet curated. Means "we don't know", NOT "no".
--
-- door_price is the WALK-IN price, which differs from the advance price
-- (Smalls: $25 door vs $35 advance). Deliberately not merged into price_min.

ALTER TABLE venues ADD COLUMN IF NOT EXISTS walk_in_policy TEXT
  CHECK (walk_in_policy IN ('always','space_permitting','standby','none','unknown'))
  DEFAULT 'unknown';

ALTER TABLE venues ADD COLUMN IF NOT EXISTS door_price NUMERIC(6,2);

-- ─── SEED ────────────────────────────────────────────────────────────────────
-- db/migrate.js re-runs every migration on every run, so each statement is
-- guarded with `AND walk_in_policy = 'unknown'`. The seed only ever fills a
-- gap; once a human curates a venue, re-running migrations leaves it alone.
--
-- To curate a venue by hand (survives future migration runs):
--   UPDATE venues SET walk_in_policy = 'always', door_price = 10.00
--    WHERE lower(name) = 'venue name here';
--
-- Sourced from venue research (2026-08-05):

UPDATE venues SET walk_in_policy = 'always', door_price = 10.00
 WHERE lower(name) = 'cellar dog' AND walk_in_policy = 'unknown';

UPDATE venues SET walk_in_policy = 'always', door_price = 0.00
 WHERE lower(name) = 'arthur''s tavern' AND walk_in_policy = 'unknown';

UPDATE venues SET walk_in_policy = 'space_permitting', door_price = 25.00
 WHERE lower(name) = 'smalls' AND walk_in_policy = 'unknown';

UPDATE venues SET walk_in_policy = 'space_permitting', door_price = 25.00
 WHERE lower(name) = 'mezzrow' AND walk_in_policy = 'unknown';

UPDATE venues SET walk_in_policy = 'space_permitting'
 WHERE lower(name) = 'blue note jazz club' AND walk_in_policy = 'unknown';

-- NOTE: 'Village Vangard' is misspelled in the venues table (missing the 'u').
-- Seeded on the actual stored spelling; correcting the name is out of scope.
UPDATE venues SET walk_in_policy = 'standby'
 WHERE lower(name) = 'village vangard' AND walk_in_policy = 'unknown';

-- Birdland's own FAQ is silent on walk-ins and secondary sources conflict, so
-- it stays 'unknown' rather than being guessed in either direction.

-- Sourced from ClickUp 86b9wfdnt ("Manual curation: top 20 NYC walk-in venues"),
-- which names these as reliable walk-in venues:

UPDATE venues SET walk_in_policy = 'space_permitting'
 WHERE lower(name) = 'the django' AND walk_in_policy = 'unknown';

UPDATE venues SET walk_in_policy = 'space_permitting'
 WHERE lower(name) = 'zinc bar' AND walk_in_policy = 'unknown';
```

- [ ] **Step 2: Run the migration**

```bash
cd /Users/donniebolen/Desktop/NowGo
set -a; . ./.env.nowgo; set +a
npm run migrate 2>&1 | tail -5
```

Expected: completes without error.

- [ ] **Step 3: Verify the columns and seeds landed**

```bash
psql "$DATABASE_URL" -c "
SELECT name, walk_in_policy, door_price
  FROM venues WHERE walk_in_policy <> 'unknown' ORDER BY walk_in_policy, name;"
```

Expected: exactly 8 rows — Arthur's Tavern and Cellar Dog as `always`; Blue Note Jazz Club, Mezzrow, Smalls, The Django, Zinc Bar as `space_permitting`; Village Vangard as `standby`. If a venue is missing, its stored name does not match the seed — check the exact spelling before editing the migration.

- [ ] **Step 4: Verify the guard protects curation**

```bash
psql "$DATABASE_URL" -c "UPDATE venues SET walk_in_policy='none' WHERE lower(name)='smalls';"
npm run migrate > /dev/null 2>&1
psql "$DATABASE_URL" -c "SELECT name, walk_in_policy FROM venues WHERE lower(name)='smalls';"
```

Expected: still `none` — the migration re-ran and did NOT revert it. This is the single most important property of this task.

Then restore it:

```bash
psql "$DATABASE_URL" -c "UPDATE venues SET walk_in_policy='space_permitting', door_price=25.00 WHERE lower(name)='smalls';"
```

- [ ] **Step 5: Commit**

```bash
git add db/migrations/009_venue_walk_in.sql
git commit -m "feat: add venues.walk_in_policy and door_price with guarded seeds

Curated per venue because no source exposes walk-in status as structured
data. Five-value policy rather than a boolean: hybrid is the normal case
for NYC jazz clubs, where Smalls sells \$35 advance tickets and also
admits \$25 walk-ins if there is room.

Seeds are guarded with AND walk_in_policy = 'unknown' because
db/migrate.js re-runs every migration on every run — without the guard,
each deploy would silently revert manual curation."
```

---

### Task 2: The walk-in service

**Files:**
- Create: `src/services/walk-in.js`
- Test: `src/services/walk-in.test.js`
- Modify: `package.json` (the `test` script)

**Interfaces:**
- Consumes: `venues.walk_in_policy` from Task 1
- Produces:
  - `WALK_IN_QUALIFYING: string[]` — `["always", "space_permitting"]`
  - `WALK_IN_POLICIES: string[]` — all five valid values
  - `qualifiesAsWalkIn(policy: string | null | undefined) => boolean`
  - `WALK_IN_SQL: string` — SQL boolean expression over alias `v`
  - `reportUncuratedVenues(pool) => Promise<{ total: number, names: string[] }>`

- [ ] **Step 1: Write the failing tests**

Create `src/services/walk-in.test.js`:

```javascript
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
```

- [ ] **Step 2: Register the test file**

In `package.json`, change the `test` script from:

```json
"test": "node --test src/fetchers/seatgeek.test.js src/fetchers/jazz-nyc.test.js src/services/geocode.test.js"
```

to:

```json
"test": "node --test src/fetchers/seatgeek.test.js src/fetchers/jazz-nyc.test.js src/services/geocode.test.js src/services/walk-in.test.js"
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
cd /Users/donniebolen/Desktop/NowGo
npm test 2>&1 | tail -15
```

Expected: FAIL — `Cannot find module './walk-in.js'`.

- [ ] **Step 4: Write the implementation**

Create `src/services/walk-in.js`:

```javascript
import poolDefault from "../../db/index.js";

// Whether you can turn up at a venue without buying ahead. Curated per venue
// in db/migrations/009_venue_walk_in.sql — no event source exposes this.
//
// Must stay in sync with that migration's CHECK constraint; walk-in.test.js
// asserts they agree.
export const WALK_IN_POLICIES = [
  "always",
  "space_permitting",
  "standby",
  "none",
  "unknown",
];

// Only these are promised to a user who filtered for walk-ins. 'standby' is a
// queue with no guarantee, so it does not qualify.
export const WALK_IN_QUALIFYING = ["always", "space_permitting"];

export function qualifiesAsWalkIn(policy) {
  return WALK_IN_QUALIFYING.includes(policy);
}

// Defined once and interpolated into SQL, the same way EVENT_URL_SQL works in
// src/server.js, so the rule cannot drift between the query and the app.
// Assumes the venues table is joined as `v`.
export const WALK_IN_SQL = `v.walk_in_policy IN (${WALK_IN_QUALIFYING.map((p) => `'${p}'`).join(", ")})`;

// Names venues that have events but no curation decision yet. Without this a
// new venue silently defaults to 'unknown' and never reaches the walk-ins
// filter, with nothing surfacing that a decision is owed.
export async function reportUncuratedVenues(pool = poolDefault) {
  const { rows } = await pool.query(
    `SELECT v.name, count(e.event_id) AS events
       FROM venues v
       JOIN events e ON e.venue_id = v.venue_id
      WHERE v.walk_in_policy = 'unknown'
        AND e.start_time > now()
      GROUP BY v.name
      ORDER BY count(e.event_id) DESC`
  );

  const names = rows.map((r) => r.name);
  if (names.length) {
    console.log(
      `  🚶 ${names.length} venue(s) need a walk-in decision: ${names.slice(0, 8).join(", ")}` +
        (names.length > 8 ? `, +${names.length - 8} more` : "")
    );
  } else {
    console.log("  🚶 All venues with events have a walk-in policy");
  }
  return { total: names.length, names };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npm test 2>&1 | grep -E "^. (tests|pass|fail)"
```

Expected: `fail 0`, with 7 more tests than before (was 56, now 63).

- [ ] **Step 6: Commit**

```bash
git add src/services/walk-in.js src/services/walk-in.test.js package.json
git commit -m "feat: add walk-in service defining the qualifying-policy rule once

WALK_IN_SQL is interpolated into queries the same way EVENT_URL_SQL is,
so which policies count as walk-in cannot drift between the SQL and the
application. A test asserts the constant matches the migration's CHECK
constraint — the availability_tier drift, where availability.js writes
'limited' but the constraint rejects it, is precedent for that risk."
```

---

### Task 3: Serve walk-in data from the venue

**Files:**
- Modify: `src/server.js:88`, `src/server.js:116`, `src/server.js:181-187`, and the import block at the top

**Interfaces:**
- Consumes: `WALK_IN_SQL` from Task 2
- Produces: API responses where `walk_in` is a boolean derived from the venue, plus new `walk_in_policy` and `door_price` fields

- [ ] **Step 1: Import the SQL fragment**

In `src/server.js`, add to the existing imports near the top (alongside the `ranking.js` import on line 6):

```javascript
import { WALK_IN_SQL } from "./services/walk-in.js";
```

Only `WALK_IN_SQL` — `reportUncuratedVenues` is wired into `src/scheduler.js` in Task 4, not here.

- [ ] **Step 2: Update the geo query**

At `src/server.js:88`, replace:

```javascript
          e.walk_in, e.hook,
```

with:

```javascript
          ${WALK_IN_SQL} AS walk_in,
          v.walk_in_policy,
          v.door_price,
          e.hook,
```

- [ ] **Step 3: Update the non-geo query**

At `src/server.js:116` (the second occurrence, in the `else` branch), make the identical replacement:

```javascript
          ${WALK_IN_SQL} AS walk_in,
          v.walk_in_policy,
          v.door_price,
          e.hook,
```

- [ ] **Step 4: Update the single-event query**

In the `/events/:id` handler, the `SELECT` begins with `e.*` and already overrides `url` after it. Add the walk-in fields directly below the existing `${EVENT_URL_SQL} AS url,` line (around `src/server.js:181`):

```javascript
         ${WALK_IN_SQL} AS walk_in,
         v.walk_in_policy,
         v.door_price,
```

These are listed after `e.*` so they override the dead `events.walk_in` column in the result row, exactly as `url` already does.

- [ ] **Step 5: Verify locally against the real database**

```bash
cd /Users/donniebolen/Desktop/NowGo
set -a; . ./.env.nowgo; set +a
PORT=3999 node src/server.js > /tmp/walkin.log 2>&1 &
SRV=$!
for i in 1 2 3 4 5 6; do sleep 3; curl -s --max-time 4 "http://localhost:3999/health" >/dev/null 2>&1 && break; done
echo "--- all events: walk-in count ---"
curl -s --max-time 20 "http://localhost:3999/events/tonight?limit=200" | python3 -c "
import sys,json,collections
d=json.load(sys.stdin)
evs=d['events']
print('total:', len(evs))
print('walk_in true:', sum(1 for e in evs if e.get('walk_in') is True))
print('policies:', dict(collections.Counter(e.get('walk_in_policy') for e in evs)))
for e in evs[:3]:
    if e.get('walk_in'): print('  ', str(e.get('venue_name'))[:20], '| door', e.get('door_price'))
"
echo "--- walk_ins_only=true ---"
curl -s --max-time 20 "http://localhost:3999/events/tonight?limit=200&walk_ins_only=true" | python3 -c "
import sys,json,collections
d=json.load(sys.stdin)
evs=d['events']
print('count:', len(evs))
print('venues:', sorted(set(str(e.get('venue_name')) for e in evs)))
bad=[e for e in evs if e.get('walk_in') is not True]
print('NON walk-in leaked through:', len(bad))
"
kill $SRV 2>/dev/null
```

Expected: `walk_ins_only=true` returns only events at Arthur's Tavern, Cellar Dog, Mezzrow, Smalls, The Django, Zinc Bar and Blue Note Jazz Club — around 36 events. `Village Vangard` must NOT appear (it is `standby`). `NON walk-in leaked through: 0`.

- [ ] **Step 6: Confirm nothing else regressed**

```bash
curl -s --max-time 20 "http://localhost:3999/events/tonight?lat=40.7679&lng=-73.9640&limit=50" | python3 -c "
import sys,json
d=json.load(sys.stdin); evs=d['events']
print('count:', d['count'])
for f in ('venue_lat','travel_minutes','leave_by','url'):
    print(f'  null {f}:', sum(1 for e in evs if e.get(f) in (None,'')), '/', len(evs))
"
```

Expected: the same healthy numbers as before this change — 0 nulls for `venue_lat`, `travel_minutes`, `leave_by` and `url`. Adding columns must not have disturbed the venue join.

- [ ] **Step 7: Commit**

```bash
git add src/server.js
git commit -m "feat: derive walk_in from venue policy instead of the dead column

events.walk_in has never been written by any code — the INSERT column
list in db/ingest.js does not include it — so the app's walk-ins filter
returned an empty list every time.

The response field keeps the name walk_in and stays a boolean, so the
filter starts working on the TestFlight build already installed, with no
rebuild. walk_in_policy and door_price ride along for a later app build."
```

---

### Task 4: Report uncurated venues from the pipeline

**Files:**
- Modify: `src/scheduler.js:60` area (after `backfillVenueWebsites`)

**Interfaces:**
- Consumes: `reportUncuratedVenues` from Task 2
- Produces: a log line each pipeline run naming venues that need curation

- [ ] **Step 1: Import the reporter**

In `src/scheduler.js`, extend the existing geocode import on line 6 area by adding a new import line below it:

```javascript
import { reportUncuratedVenues } from "./services/walk-in.js";
```

- [ ] **Step 2: Call it after the website backfill**

In `runPipeline`, inside the existing `try` block that wraps geocoding (immediately after `await backfillVenueWebsites();` at `src/scheduler.js:60`), add:

```javascript
      // Names venues that still need a walk-in decision. Curation is manual,
      // so without this a new venue silently never reaches the walk-ins filter.
      await reportUncuratedVenues();
```

It belongs inside that same `try/catch` so a failure here cannot skip the enrichment steps that follow, matching how geocoding is isolated.

- [ ] **Step 3: Run the pipeline locally and read the output**

```bash
cd /Users/donniebolen/Desktop/NowGo
set -a; . ./.env.nowgo; set +a
node -e "
import('./src/scheduler.js').then(async m => { await m.runPipeline(); process.exit(0); })
  .catch(e => { console.error('FAILED:', e.message); process.exit(1); });
" 2>&1 | grep -E "🚶|Pipeline complete|❌"
```

Expected: a line like `🚶 12 venue(s) need a walk-in decision: Jazzcultural, Bar Bayeux, LunAtico, ...` followed by `🏁 Pipeline complete`. The pipeline must still complete.

- [ ] **Step 4: Run the full test suite**

```bash
npm test 2>&1 | grep -E "^. (tests|pass|fail)"
```

Expected: `fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/scheduler.js
git commit -m "feat: log venues that still need a walk-in curation decision

Curation is manual, so a newly-scraped venue defaults to 'unknown' and
never reaches the walk-ins filter with nothing surfacing that a decision
is owed. Mirrors how geocodeVenues logs unmatched venues."
```

---

### Task 5: Deploy and verify in production

**Files:** none modified — this task is verification only.

**Interfaces:**
- Consumes: everything from Tasks 1–4

- [ ] **Step 1: Push**

```bash
cd /Users/donniebolen/Desktop/NowGo
git push origin main 2>&1 | tail -2
```

- [ ] **Step 2: Wait for the Railway deploy**

```bash
for i in $(seq 1 9); do sleep 25; printf "."; done; echo " done waiting"
```

Railway auto-deploys on push to `main`. Deploys have taken up to ~3 minutes.

- [ ] **Step 3: Verify the filter returns real results in production**

```bash
curl -s --max-time 40 "https://nowgo-production.up.railway.app/events/tonight?limit=200&walk_ins_only=true" | python3 -c "
import sys,json
d=json.load(sys.stdin); evs=d['events']
print('walk-in events:', len(evs))
print('venues:', sorted(set(str(e.get('venue_name')) for e in evs)))
print('leaked non walk-in:', sum(1 for e in evs if e.get('walk_in') is not True))
print('standby leaked:', sum(1 for e in evs if e.get('walk_in_policy')=='standby'))
"
```

Expected: a non-zero count, only the seeded qualifying venues, `leaked non walk-in: 0`, `standby leaked: 0`.

If the count is 0, the migration has not run on production — Railway does not run migrations automatically. Run it against the production database from your machine:

```bash
set -a; . ./.env.nowgo; set +a
npm run migrate 2>&1 | tail -3
```

- [ ] **Step 4: Confirm the unfiltered feed is unchanged**

```bash
curl -s --max-time 40 "https://nowgo-production.up.railway.app/events/tonight?lat=40.7679&lng=-73.9640&limit=50" | python3 -c "
import sys,json
d=json.load(sys.stdin); evs=d['events']
print('count:', d['count'])
for f in ('venue_lat','travel_minutes','leave_by','url'):
    print(f'  null {f}:', sum(1 for e in evs if e.get(f) in (None,'')), '/', len(evs))
"
```

Expected: unchanged from before — 0 nulls across all four.

- [ ] **Step 5: Test on the phone**

Open the TestFlight build already installed, toggle "Walk-ins only" in the filter sheet, and confirm events appear. No rebuild is required because the API field name and type did not change.

- [ ] **Step 6: Close the ClickUp task**

Task `86b9wfdnt` ("Manual curation: top 20 NYC walk-in venues") is partially delivered — the mechanism exists and 9 venues are seeded. Add a comment recording what shipped and what remains, rather than closing it:

> Mechanism shipped 2026-08-05: `venues.walk_in_policy` + `door_price`, curated per venue, guarded against migration re-runs. 9 venues seeded covering ~48% of upcoming jazz events. Remaining: the uncurated venues the pipeline now logs each run, plus comedy / parks / theater-rush / museum categories, which need event sources before curation is meaningful.

---

## Verification Checklist

- [ ] `npm test` passes with 63 tests
- [ ] Re-running `npm run migrate` does not revert a hand-curated venue
- [ ] `walk_ins_only=true` returns only `always` and `space_permitting` venues
- [ ] `Village Vangard` (standby) never appears in walk-in results
- [ ] Unfiltered feed still has 0 nulls for `venue_lat`, `travel_minutes`, `leave_by`, `url`
- [ ] Pipeline logs the uncurated-venue line and still completes
- [ ] `availability_tier`, `ranking.js` and `mobile/` are untouched
