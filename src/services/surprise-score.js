import pool from "../../db/index.js";

export async function runSurpriseScore() {
  const { rows } = await pool.query(`
    SELECT event_id, segment, genre, availability_tier
    FROM events
    WHERE start_time > NOW() - interval '30 minutes'
      AND start_time < (date_trunc('day', NOW() AT TIME ZONE 'America/New_York')
                        + interval '1 day 4 hours') AT TIME ZONE 'America/New_York'
      AND availability_tier != 'cancelled'
  `);

  if (rows.length === 0) {
    console.log("  ✅ Surprise scores: no events to score");
    return;
  }

  // Count events per category (genre preferred over segment)
  const counts = new Map();
  for (const r of rows) {
    const cat = r.genre || r.segment || null;
    if (cat) counts.set(cat, (counts.get(cat) ?? 0) + 1);
  }

  const updates = rows.map(r => {
    const cat = r.genre || r.segment || null;
    const cnt = cat ? (counts.get(cat) ?? 0) : 0;

    const rarity   = cnt === 0 ? 20 : cnt === 1 ? 60 : cnt === 2 ? 40 : 10;
    const scarcity = r.availability_tier === "scarce"  ? 40
                   : r.availability_tier === "unknown" ? 20 : 0;

    return [r.event_id, Math.min(100, rarity + scarcity)];
  });

  const placeholders = updates.map((_, i) => `($${i * 2 + 1}::text, $${i * 2 + 2}::numeric)`).join(", ");
  await pool.query(
    `UPDATE events AS e SET surprise_score = v.score
     FROM (VALUES ${placeholders}) AS v(event_id, score)
     WHERE e.event_id = v.event_id`,
    updates.flat()
  );

  console.log(`  ✅ Surprise scores: computed ${updates.length} events`);
}
