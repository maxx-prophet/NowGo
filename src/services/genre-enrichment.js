import Anthropic from "@anthropic-ai/sdk";
import pool from "../../db/index.js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.nowgo" });

const CANONICAL_SEGMENTS = ["Music", "Arts & Theatre", "Sports", "Comedy", "Family", "Festival", "Other"];

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function runGenreEnrichment() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("  ⚠️  ANTHROPIC_API_KEY missing — skipping genre enrichment");
    return;
  }

  // Fetch events needing classification
  const { rows } = await pool.query(`
    SELECT event_id, name, venue_id,
           (SELECT v.name FROM venues v WHERE v.venue_id = e.venue_id) AS venue_name
    FROM events e
    WHERE (segment IS NULL OR segment IN ('Undefined', 'Other'))
      AND genre_source IS NULL
      AND start_time > NOW() - interval '1 hour'
    LIMIT 100
  `);

  if (rows.length === 0) {
    console.log("  ✅ Genre enrichment: no events need classification");
    return;
  }

  console.log(`  🤖 Genre enrichment: classifying ${rows.length} events via Claude Haiku...`);

  const eventList = rows
    .map(r => `${r.event_id}: "${r.name}"${r.venue_name ? ` at ${r.venue_name}` : ""}`)
    .join("\n");

  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 1024,
    messages: [{
      role: "user",
      content: `Classify each event into exactly one of these segments: ${CANONICAL_SEGMENTS.join(", ")}.

Events (format: event_id: "name" at venue):
${eventList}

Respond with a JSON array only, no explanation:
[{"event_id": "...", "segment": "..."}]`,
    }],
  });

  let classifications;
  try {
    const text = response.content[0].text.trim();
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("No JSON array found in response");
    classifications = JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error(`  ❌ Genre enrichment: failed to parse response — ${err.message}`);
    return;
  }

  // Validate and update
  let updated = 0;
  for (const { event_id, segment } of classifications) {
    if (!CANONICAL_SEGMENTS.includes(segment)) continue;
    await pool.query(
      `UPDATE events SET segment = $1, genre_source = 'llm' WHERE event_id = $2`,
      [segment, event_id]
    );
    updated++;
  }

  console.log(`  ✅ Genre enrichment: classified ${updated} events`);
}
