import poolDefault from "../../db/index.js";

// sources.last_fetched_at was in the schema from day one and never written,
// so GET /sources could not say whether a fetcher had run. Stamped by the
// pipeline after each fetch stage returns — a fetch that throws leaves the
// old timestamp in place, which is the point: a stale stamp is the signal.
export async function markSourceFetched(sourceId, pool = poolDefault) {
  try {
    await pool.query(`UPDATE sources SET last_fetched_at = now() WHERE source_id = $1`, [sourceId]);
  } catch (err) {
    console.warn(`  ⚠️  Could not stamp last_fetched_at for ${sourceId}: ${err.message}`);
  }
}
