import Anthropic from "@anthropic-ai/sdk";
import dotenv from "dotenv";
import pool from "../../db/index.js";
dotenv.config({ path: ".env.nowgo" });

const client = new Anthropic();

function buildPrompt(event) {
  const price = event.is_free
    ? "Free"
    : event.price_min != null
    ? `$${Math.round(event.price_min)}${event.price_max && event.price_max !== event.price_min ? `–$${Math.round(event.price_max)}` : ""}`
    : "Unknown price";

  const venue = [event.venue_name, event.neighborhood].filter(Boolean).join(" in ");

  return `You are writing a single punchy sentence for a NYC event discovery app. The sentence appears on the event card in italics — it's the one line that makes someone decide to go tonight.

Event:
- Name: ${event.name}
- Venue: ${venue || "NYC venue"}
- Category: ${event.genre || event.segment || "Event"}
- Price: ${price}

Rules:
- Under 15 words
- Specific and evocative, not generic ("packed house" beats "great atmosphere")
- Present tense, tonight's context
- No em-dashes, no "come join us", no exclamation marks
- Don't mention the event name

Respond with only the sentence, no quotes, no punctuation at the end.`;
}

export async function runHookGeneration() {
  const { rows } = await pool.query(`
    SELECT e.event_id, e.name, e.segment, e.genre, e.price_min, e.price_max, e.is_free,
           v.name AS venue_name, v.neighborhood
    FROM events e
    LEFT JOIN venues v ON e.venue_id = v.venue_id
    WHERE e.hook IS NULL
      AND e.start_time > NOW() - interval '30 minutes'
      AND e.start_time < (date_trunc('day', NOW() AT TIME ZONE 'America/New_York') + interval '1 day 4 hours') AT TIME ZONE 'America/New_York'
      AND e.availability_tier != 'cancelled'
    LIMIT 100
  `);

  if (rows.length === 0) {
    console.log("  ✅ Hook generation: no new events to process");
    return;
  }

  console.log(`  🪝 Hook generation: generating for ${rows.length} events...`);
  let generated = 0;
  let failed = 0;

  for (const event of rows) {
    try {
      const message = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 60,
        messages: [{ role: "user", content: buildPrompt(event) }],
      });

      const hook = message.content[0]?.text?.trim();
      if (hook) {
        await pool.query(`UPDATE events SET hook = $1 WHERE event_id = $2`, [hook, event.event_id]);
        generated++;
      }
    } catch (err) {
      console.warn(`    ⚠ Hook failed for ${event.event_id}: ${err.message}`);
      failed++;
    }
  }

  console.log(`  ✅ Hook generation: ${generated} generated, ${failed} failed`);
}
