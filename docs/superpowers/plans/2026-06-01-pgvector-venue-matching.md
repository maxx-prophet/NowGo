# pgvector Semantic Venue Matching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace fragile string-based SeatGeek venue matching with pgvector cosine similarity so "MSG", "The Garden", and "Madison Square Garden" all resolve correctly, enabling SeatGeek price data to fill into Ticketmaster events.

**Architecture:** OpenAI `text-embedding-3-small` generates 1536-dim vectors for venue names stored in Postgres via pgvector. The SeatGeek merge pre-resolves all unique SG venue names against stored embeddings before the match loop. A deferred `runVenueEmbeddings()` pipeline step (after ingest) keeps embeddings current without blocking the critical ingest path.

**Tech Stack:** pgvector (Postgres extension), OpenAI `text-embedding-3-small`, `openai` npm package, Node.js `node:test` (built-in, no install needed)

**Spec:** `docs/superpowers/specs/2026-06-01-pgvector-venue-matching-design.md`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `db/migrations/005_pgvector.sql` | Create | Enable vector extension, add embedding column |
| `src/services/venue-embeddings.js` | Create | Batch embed venues; on-demand lookup for merge |
| `src/fetchers/seatgeek.js` | Modify | mergeEvents: alias → pgvector → stringsOverlap |
| `src/scheduler.js` | Modify | Pass pool to fetchSeatGeek; add runVenueEmbeddings step |
| `package.json` | Modify | Add openai dependency, add test script |
| `src/fetchers/seatgeek.test.js` | Create | Unit tests for mergeEvents fallback logic |

---

## Task 1: Railway Prerequisite — Enable pgvector

pgvector is not installed on the Railway Postgres instance. This is a manual one-time step.

- [ ] **Step 1: Enable pgvector in Railway dashboard**

  Go to your Railway project → PostgreSQL service → Query tab (or connect via psql) and run:

  ```sql
  CREATE EXTENSION IF NOT EXISTS vector;
  ```

  Expected output: `CREATE EXTENSION`

- [ ] **Step 2: Verify it worked**

  ```sql
  SELECT * FROM pg_extension WHERE extname = 'vector';
  ```

  Expected: one row returned with `extname = 'vector'`

- [ ] **Step 3: Add OPENAI_API_KEY to Railway**

  In Railway → your app service → Variables, add:
  ```
  OPENAI_API_KEY=sk-...
  ```

  Also add it to your local `.env.nowgo`:
  ```
  OPENAI_API_KEY=sk-...
  ```

---

## Task 2: Install openai Package & Add Test Script

- [ ] **Step 1: Install openai**

  ```bash
  cd /Users/donniebolen/Desktop/NowGo && npm install openai
  ```

  Expected: `added 1 package` (or similar), no errors.

- [ ] **Step 2: Add test script to package.json**

  In `package.json`, add to the `"scripts"` block:

  ```json
  "test": "node --test src/fetchers/seatgeek.test.js"
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add package.json package-lock.json
  git commit -m "feat: add openai package for pgvector embeddings"
  ```

---

## Task 3: Migration — Add embedding Column

- [ ] **Step 1: Create the migration file**

  Create `db/migrations/005_pgvector.sql`:

  ```sql
  -- pgvector semantic venue matching
  -- Requires: CREATE EXTENSION vector (run manually in Railway dashboard first)

  CREATE EXTENSION IF NOT EXISTS vector;

  ALTER TABLE venues ADD COLUMN IF NOT EXISTS embedding vector(1536);
  ```

  No index needed — at ~223 venues a sequential scan is faster than IVFFLAT.

- [ ] **Step 2: Run the migration**

  ```bash
  npm run migrate
  ```

  Expected output includes:
  ```
  Running 005_pgvector.sql...
  ✓ 005_pgvector.sql complete
  ```

  If you see `could not open extension control file ... vector.control: No such file or directory`, the Railway prerequisite in Task 1 wasn't done. Complete Task 1 first.

- [ ] **Step 3: Verify column exists**

  Run in Railway console or via psql:
  ```sql
  SELECT column_name, data_type
  FROM information_schema.columns
  WHERE table_name = 'venues' AND column_name = 'embedding';
  ```

  Expected: one row with `column_name = embedding`.

- [ ] **Step 4: Commit**

  ```bash
  git add db/migrations/005_pgvector.sql
  git commit -m "feat: add embedding vector(1536) column to venues (86b9zgjpx)"
  ```

---

## Task 4: venue-embeddings.js Service

- [ ] **Step 1: Create `src/services/venue-embeddings.js`**

  ```js
  import OpenAI from "openai";
  import pool from "../../db/index.js";
  import dotenv from "dotenv";
  dotenv.config({ path: ".env.nowgo" });

  const SIMILARITY_THRESHOLD = 0.15;
  const BATCH_SIZE = 100;

  export async function runVenueEmbeddings() {
    if (!process.env.OPENAI_API_KEY) {
      console.warn("  ⚠️  OPENAI_API_KEY missing — skipping venue embeddings");
      return;
    }

    const { rows } = await pool.query(
      `SELECT venue_id, name, city FROM venues WHERE embedding IS NULL`
    );

    if (rows.length === 0) {
      console.log("  ✅ Venue embeddings: all venues already embedded");
      return;
    }

    console.log(`  🔢 Venue embeddings: generating for ${rows.length} venues...`);
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const inputs = batch.map(v => `${v.name}, ${v.city}`);

      const response = await client.embeddings.create({
        model: "text-embedding-3-small",
        input: inputs,
      });

      for (let j = 0; j < batch.length; j++) {
        const vector = response.data[j].embedding;
        await pool.query(
          `UPDATE venues SET embedding = $1::vector WHERE venue_id = $2`,
          [`[${vector.join(",")}]`, batch[j].venue_id]
        );
      }

      console.log(`    Embedded ${Math.min(i + BATCH_SIZE, rows.length)}/${rows.length}`);
    }

    console.log(`  ✅ Venue embeddings: done`);
  }

  export async function findVenueByEmbedding(dbPool, venueName) {
    if (!process.env.OPENAI_API_KEY) return null;

    try {
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const response = await client.embeddings.create({
        model: "text-embedding-3-small",
        input: `${venueName}, New York`,
      });
      const vector = response.data[0].embedding;

      const { rows } = await dbPool.query(
        `SELECT name, embedding <=> $1::vector AS distance
         FROM venues
         WHERE embedding IS NOT NULL
         ORDER BY distance
         LIMIT 1`,
        [`[${vector.join(",")}]`]
      );

      if (rows.length === 0 || rows[0].distance > SIMILARITY_THRESHOLD) return null;
      return rows[0].name;
    } catch {
      return null;
    }
  }
  ```

- [ ] **Step 2: Smoke test runVenueEmbeddings manually**

  ```bash
  node -e "import('./src/services/venue-embeddings.js').then(m => m.runVenueEmbeddings()).then(() => process.exit(0))"
  ```

  Expected:
  ```
    🔢 Venue embeddings: generating for 223 venues...
      Embedded 100/223
      Embedded 200/223
      Embedded 223/223
    ✅ Venue embeddings: done
  ```

  Run it a second time — expected: `✅ Venue embeddings: all venues already embedded`

- [ ] **Step 3: Verify embeddings stored in DB**

  ```bash
  node -e "
  import('./db/index.js').then(async ({default: pool}) => {
    const { rows } = await pool.query('SELECT COUNT(*) FROM venues WHERE embedding IS NOT NULL');
    console.log('Venues with embeddings:', rows[0].count);
    process.exit(0);
  });
  "
  ```

  Expected: count equals total venues.

- [ ] **Step 4: Commit**

  ```bash
  git add src/services/venue-embeddings.js
  git commit -m "feat: add venue-embeddings service with OpenAI batch embed + pgvector lookup (86b9zgjpx)"
  ```

---

## Task 5: Write Tests for mergeEvents

Tests use Node's built-in `node:test` — no install needed. These test the fallback cascade logic without hitting real APIs.

- [ ] **Step 1: Create `src/fetchers/seatgeek.test.js`**

  ```js
  import { test } from "node:test";
  import assert from "node:assert/strict";
  import { mergeEvents } from "./seatgeek.js";

  const makeTmEvent = (overrides = {}) => ({
    id: "tm_1", source: "ticketmaster", name: "Concert",
    date: "2026-06-01", venue: "Madison Square Garden",
    priceMin: null, priceMax: null, isFree: false,
    availabilityTier: "unknown",
    ...overrides,
  });

  const makeSgEvent = (overrides = {}) => ({
    id: "sg_1", source: "seatgeek", name: "Concert",
    date: "2026-06-01", venue: "Madison Square Garden",
    priceMin: 50, priceMax: 200, isFree: false,
    availabilityTier: "available",
    ...overrides,
  });

  test("mergeEvents fills price when venue names overlap directly", async () => {
    const result = await mergeEvents([makeTmEvent()], [makeSgEvent()], new Map(), null);
    assert.equal(result.length, 1);
    assert.equal(result[0].priceMin, 50);
    assert.equal(result[0]._pricedBy, "seatgeek");
  });

  test("mergeEvents resolves venue via alias map", async () => {
    const aliasMap = new Map([["msg", "madisonsquaregarden"]]);
    const result = await mergeEvents(
      [makeTmEvent()],
      [makeSgEvent({ venue: "MSG" })],
      aliasMap,
      null
    );
    assert.equal(result.length, 1);
    assert.equal(result[0].priceMin, 50);
  });

  test("mergeEvents keeps events separate when venues differ", async () => {
    const result = await mergeEvents(
      [makeTmEvent({ venue: "Madison Square Garden" })],
      [makeSgEvent({ venue: "Blue Note Jazz Club", name: "Jazz Show" })],
      new Map(),
      null
    );
    assert.equal(result.length, 2);
    assert.equal(result[0].priceMin, null);
  });

  test("mergeEvents propagates isFree from SeatGeek match", async () => {
    const result = await mergeEvents(
      [makeTmEvent()],
      [makeSgEvent({ priceMin: 0, priceMax: 0, isFree: true })],
      new Map(),
      null
    );
    assert.equal(result.length, 1);
    assert.equal(result[0].isFree, true);
    assert.equal(result[0].priceMin, 0);
  });

  test("mergeEvents skips price fill if SG event has null priceMin", async () => {
    const result = await mergeEvents(
      [makeTmEvent()],
      [makeSgEvent({ priceMin: null, priceMax: null })],
      new Map(),
      null
    );
    assert.equal(result.length, 1);
    assert.equal(result[0].priceMin, null);
    assert.equal(result[0]._pricedBy, undefined);
  });

  test("mergeEvents does not duplicate events on date mismatch", async () => {
    const result = await mergeEvents(
      [makeTmEvent({ date: "2026-06-01" })],
      [makeSgEvent({ date: "2026-06-02" })],
      new Map(),
      null
    );
    assert.equal(result.length, 2);
  });
  ```

- [ ] **Step 2: Run tests — expect all pass**

  ```bash
  npm test
  ```

  Expected:
  ```
  ✔ mergeEvents fills price when venue names overlap directly
  ✔ mergeEvents resolves venue via alias map
  ✔ mergeEvents keeps events separate when venues differ
  ✔ mergeEvents propagates isFree from SeatGeek match
  ✔ mergeEvents skips price fill if SG event has null priceMin
  ✔ mergeEvents does not duplicate events on date mismatch
  ℹ tests 6
  ℹ pass 6
  ℹ fail 0
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add src/fetchers/seatgeek.test.js package.json
  git commit -m "test: add mergeEvents unit tests (86b9zgjpx)"
  ```

---

## Task 6: Update mergeEvents to Use pgvector

- [ ] **Step 1: Update `src/fetchers/seatgeek.js`**

  Add the import at the top of the file (after existing imports):

  ```js
  import { findVenueByEmbedding } from "../services/venue-embeddings.js";
  ```

  Replace the existing `mergeEvents` export:

  ```js
  export async function mergeEvents(tmEvents, sgEvents, aliasMap = new Map(), dbPool = null) {
    function resolveVenueName(name, pgCache) {
      const n = norm(name);
      return pgCache.get(n) ?? aliasMap.get(n) ?? n;
    }

    // Pre-resolve all unique SG venue names via pgvector (one OpenAI call per unique venue)
    const pgVenueCache = new Map();
    if (dbPool) {
      const uniqueVenues = [...new Set(sgEvents.map(sg => sg.venue).filter(Boolean))];
      for (const venueName of uniqueVenues) {
        const n = norm(venueName);
        if (aliasMap.has(n)) continue; // alias already covers it
        const canonical = await findVenueByEmbedding(dbPool, venueName);
        if (canonical) pgVenueCache.set(n, norm(canonical));
      }
      if (pgVenueCache.size > 0) {
        console.log(`   🧠 pgvector resolved ${pgVenueCache.size} venue(s) semantically`);
      }
    }

    const merged = [...tmEvents];
    const usedSgIds = new Set();
    let pricesFilled = 0;

    merged.forEach((tmEvent) => {
      if (tmEvent.priceMin !== null) return;

      const match = sgEvents.find((sg) => {
        if (usedSgIds.has(sg.id)) return false;
        if (sg.date !== tmEvent.date) return false;
        const sgVenue = resolveVenueName(sg.venue, pgVenueCache);
        const tmVenue = resolveVenueName(tmEvent.venue, pgVenueCache);
        return stringsOverlap(sgVenue, tmVenue) || stringsOverlap(sg.name, tmEvent.name);
      });

      if (match) {
        if (match.priceMin !== null) {
          tmEvent.priceMin = match.priceMin;
          tmEvent.priceMax = match.priceMax;
          tmEvent.isFree = match.isFree;
          tmEvent._pricedBy = "seatgeek";
          pricesFilled++;
        }
        tmEvent.availabilityTier = match.availabilityTier;
        usedSgIds.add(match.id);
      }
    });

    const sgOnlyEvents = sgEvents.filter((sg) => !usedSgIds.has(sg.id));
    console.log(`   🔀 Matched ${usedSgIds.size} SeatGeek events (${pricesFilled} price fills)`);
    console.log(`   ➕ Adding ${sgOnlyEvents.length} SeatGeek-only events`);
    return [...merged, ...sgOnlyEvents];
  }
  ```

  Also update `fetchSeatGeek` signature and its call to `mergeEvents`:

  ```js
  export async function fetchSeatGeek(tmEvents = [], aliasMap = new Map(), dbPool = null) {
  ```

  And update the return line inside `fetchSeatGeek`:

  ```js
  return mergeEvents(tmEvents, sgEvents, aliasMap, dbPool);
  ```

- [ ] **Step 2: Run tests — all should still pass**

  ```bash
  npm test
  ```

  Expected: all 6 tests pass (the `dbPool = null` path is unchanged).

- [ ] **Step 3: Commit**

  ```bash
  git add src/fetchers/seatgeek.js
  git commit -m "feat: update mergeEvents to use pgvector with alias+stringsOverlap fallback (86b9zgjpx)"
  ```

---

## Task 7: Update Scheduler Pipeline

- [ ] **Step 1: Update `src/scheduler.js`**

  Add the import (after existing imports):

  ```js
  import { runVenueEmbeddings } from "./services/venue-embeddings.js";
  ```

  Update the `fetchSeatGeek` call inside `runPipeline` to pass `pool`:

  ```js
  const mergedEvents = await fetchSeatGeek(tmEvents, aliasMap, pool);
  ```

  Add `runVenueEmbeddings` after `geocodeVenues`:

  ```js
  await geocodeVenues();
  console.log(`  📍 Venue geocoding complete`);

  await runVenueEmbeddings();
  console.log(`  🔢 Venue embeddings complete`);
  ```

- [ ] **Step 2: Run tests**

  ```bash
  npm test
  ```

  Expected: all 6 tests still pass.

- [ ] **Step 3: Commit**

  ```bash
  git add src/scheduler.js
  git commit -m "feat: wire runVenueEmbeddings and pgvector pool into pipeline (86b9zgjpx)"
  ```

---

## Task 8: End-to-End Verification

- [ ] **Step 1: Run the full pipeline**

  ```bash
  npm run pipeline
  ```

  Watch the output. Look for:
  - `🧠 pgvector resolved X venue(s) semantically` — confirms pgvector is matching
  - `🔀 Matched X SeatGeek events (Y price fills)` — Y should be > 0
  - `🔢 Venue embeddings: all venues already embedded` — backfill already ran in Task 4

- [ ] **Step 2: Verify MSG resolves correctly in DB**

  ```bash
  node -e "
  import('./db/index.js').then(async ({default: pool}) => {
    const { rows } = await pool.query(\`
      SELECT v.name, 1 - (v.embedding <=> ref.embedding) AS similarity
      FROM venues v
      CROSS JOIN (SELECT embedding FROM venues WHERE lower(name) = 'madison square garden') ref
      WHERE v.embedding IS NOT NULL
      ORDER BY v.embedding <=> ref.embedding
      LIMIT 5
    \`);
    rows.forEach(r => console.log(r.name, '→ similarity:', (+r.similarity).toFixed(4)));
    process.exit(0);
  });
  "
  ```

  Expected: Madison Square Garden at top with similarity ~1.0000, other MSG variants close by.

- [ ] **Step 3: Verify graceful degradation**

  Temporarily comment out `OPENAI_API_KEY` in `.env.nowgo`, then run:

  ```bash
  npm run pipeline
  ```

  Expected: `⚠️  OPENAI_API_KEY missing — skipping venue embeddings`, pipeline completes without error.

  Restore the key when done.

- [ ] **Step 4: Check events in DB show real prices**

  ```bash
  node -e "
  import('./db/index.js').then(async ({default: pool}) => {
    const { rows } = await pool.query(\`
      SELECT name, price_min, price_max, is_free, source
      FROM events
      WHERE name ILIKE '%Mary%' OR name ILIKE '%Celebrity%'
      ORDER BY source, name
      LIMIT 10
    \`);
    rows.forEach(r => console.log(r.name, '| min:', r.price_min, '| free:', r.is_free));
    process.exit(0);
  });
  "
  ```

  Expected: `price_min` is not null for Broadway shows, `is_free` is false.

- [ ] **Step 5: Final commit**

  ```bash
  git add -A
  git commit -m "feat: pgvector semantic venue matching complete (86b9zgjpx)"
  ```
