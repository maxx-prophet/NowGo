# pgvector Semantic Venue Matching — Design Spec

**Date:** 2026-06-01
**ClickUp:** [86b9zgjpx](https://app.clickup.com/t/86b9zgjpx)
**Status:** Approved, pending implementation

---

## Problem

Ticketmaster and SeatGeek name the same venues differently ("MSG" vs "Madison Square Garden"). The current fuzzy string matcher (`stringsOverlap`) fails on abbreviations and partial names, causing SeatGeek price data to never merge into Ticketmaster events. This manifests in the app as events showing FREE or missing prices when real prices exist.

---

## Decision

**Option B — Deferred embedding generation.** Embeddings are generated in a dedicated pipeline step after ingest (same pattern as genre enrichment), keeping OpenAI off the critical ingest path. Alias table remains as a fast first-pass and fallback.

Embedding provider: **OpenAI `text-embedding-3-small`** (1536 dims, ~$0.000002/venue).

---

## Architecture

Pipeline before:
```
fetch TM → fetch SeatGeek (stringsOverlap merge) → ingest → geocode → availability → genre enrichment → surprise score
```

Pipeline after:
```
fetch TM → fetch SeatGeek (alias → pgvector → stringsOverlap merge) → ingest → geocode → venue embeddings → availability → genre enrichment → surprise score
```

### New components

| Component | Description |
|---|---|
| `db/migrations/005_pgvector.sql` | Enables `vector` extension, adds `embedding vector(1536)` to `venues`, creates IVFFLAT index |
| `src/services/venue-embeddings.js` | Pipeline service — finds venues with no embedding, batches OpenAI calls, stores vectors |
| Updated `mergeEvents()` in `seatgeek.js` | Tries alias → pgvector → stringsOverlap in order |

---

## Data Flow

### Embedding generation (after ingest)
1. Query `SELECT venue_id, name, city FROM venues WHERE embedding IS NULL`
2. Build input string: `"${name}, ${city}"` — e.g. `"Madison Square Garden, New York"`
3. Call `text-embedding-3-small` in batches of 100
4. Store returned vector: `UPDATE venues SET embedding = $1 WHERE venue_id = $2`

### Venue matching during SeatGeek merge
1. **Alias table** — exact normalized lookup, zero cost, handles known abbreviations
2. **pgvector** — cosine similarity: `ORDER BY embedding <=> $query_vec LIMIT 1`, reject if distance > 0.15
3. **stringsOverlap** — existing fuzzy fallback for venues with no embedding yet

### Backfill on first deploy
All 223 existing venues get embeddings on the first pipeline run after deploy. Total cost: ~$0.00046.

---

## Error Handling

| Failure | Behavior |
|---|---|
| `OPENAI_API_KEY` missing | `runVenueEmbeddings()` warns and returns — pipeline completes, matching falls back to alias + stringsOverlap |
| OpenAI API down | Same as above — graceful skip, self-heals next run |
| pgvector extension not on Railway | Migration fails with explicit message: enable in Railway dashboard first |
| New venue, no embedding yet | First run uses stringsOverlap; next run uses pgvector |
| Cosine distance > 0.15 | Rejected — falls through to stringsOverlap, no false match |

---

## Configuration

```
OPENAI_API_KEY=sk-...   # add to .env.nowgo and Railway environment variables
```

Similarity threshold: `0.15` (tunable constant in `venue-embeddings.js`).

---

## Testing Steps

### Prerequisites
- pgvector enabled on Railway (`CREATE EXTENSION vector` runs without error)
- `OPENAI_API_KEY` set in `.env.nowgo`

### 1. Migration
```bash
node db/migrate.js
# Expect: migration 005 runs, no errors
# Verify: SELECT column_name FROM information_schema.columns WHERE table_name='venues' AND column_name='embedding';
```

### 2. Embedding backfill
```bash
node -e "import('./src/services/venue-embeddings.js').then(m => m.runVenueEmbeddings())"
# Expect: logs "X venues embedded" for all 223 existing venues
# Verify: SELECT COUNT(*) FROM venues WHERE embedding IS NOT NULL;  -- should equal total venues
```

### 3. MSG → Madison Square Garden match
```sql
-- Run in Railway Postgres console
SELECT v.name, 1 - (v.embedding <=> query.vec) AS similarity
FROM venues v,
  (SELECT embedding AS vec FROM venues WHERE lower(name) = 'madison square garden') query
ORDER BY v.embedding <=> query.vec
LIMIT 5;
-- Expect: Madison Square Garden at top, distance < 0.05
-- Expect: "MSG" alias still resolves via alias table (fast path)
```

### 4. Pipeline end-to-end
```bash
node -e "import('./src/scheduler.js').then(m => m.runPipeline())"
# Expect: logs show SeatGeek price fills > 0 (was 0 before this feature)
# Expect: no pipeline errors
```

### 5. Graceful degradation
```bash
# Temporarily unset OPENAI_API_KEY, run pipeline
# Expect: warning logged, pipeline completes, no crash
# Expect: SeatGeek merge still works via alias table
```

### 6. App verification
- Run `npx expo start` in `mobile/`
- Open tonight's feed
- Broadway shows (Oh Mary!, Celebrity Autobiography) should show real prices, not FREE
