import Anthropic from "@anthropic-ai/sdk";
import dotenv from "dotenv";
import pool from "../../db/index.js";
dotenv.config({ path: ".env.nowgo" });

// Haiku calls are independent, so run several at once. 100 events in
// series took ~110s (80% of the 10am pipeline run); 8 at a time is ~15s.
const HOOK_CONCURRENCY = 8;

let client;
function anthropic() {
  return (client ??= new Anthropic());
}

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

  const { generated, failed } = await generateHooks(rows, {
    generate: async event => {
      const message = await anthropic().messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 60,
        messages: [{ role: "user", content: buildPrompt(event) }],
      });
      return message.content[0]?.text;
    },
    save: (eventId, hook) => pool.query(`UPDATE events SET hook = $1 WHERE event_id = $2`, [hook, eventId]),
    concurrency: HOOK_CONCURRENCY,
  });

  console.log(`  ✅ Hook generation: ${generated} generated, ${failed} failed`);
}

// Generate and save a hook for every event, at most `concurrency` calls in
// flight at once. A failure on one event is warned about and counted; it
// never stops the rest.
export async function generateHooks(events, { generate, save, concurrency, warn = console.warn }) {
  let generated = 0;
  let failed = 0;
  let next = 0;

  async function worker() {
    while (next < events.length) {
      const event = events[next++];
      try {
        const hook = (await generate(event))?.trim();
        if (hook) {
          await save(event.event_id, hook);
          generated++;
        }
      } catch (err) {
        warn(`    ⚠ Hook failed for ${event.event_id}: ${err.message}`);
        failed++;
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, events.length) }, worker));
  return { generated, failed };
}
