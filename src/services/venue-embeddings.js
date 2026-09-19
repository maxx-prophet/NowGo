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

async function embedWithOpenAI(inputs) {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await client.embeddings.create({
    model: "text-embedding-3-small",
    input: inputs,
  });
  return response.data.map(d => d.embedding);
}

// Resolve venue names from another source to canonical venues.name via
// pgvector. Returns a Map of name -> canonical name, with unresolvable
// names left out. Every name goes to OpenAI in one request: the SeatGeek
// merge asks about ~45 names a run, and doing that one call at a time was
// the second-slowest pipeline stage.
export async function findVenuesByEmbedding(dbPool, venueNames, { embed = embedWithOpenAI } = {}) {
  const resolved = new Map();
  if (venueNames.length === 0 || !process.env.OPENAI_API_KEY) return resolved;

  let vectors;
  try {
    vectors = await embed(venueNames.map(name => `${name}, New York`));
  } catch {
    return resolved;
  }

  await Promise.all(venueNames.map(async (name, i) => {
    try {
      const { rows } = await dbPool.query(
        `SELECT name, embedding <=> $1::vector AS distance
         FROM venues
         WHERE embedding IS NOT NULL
         ORDER BY distance
         LIMIT 1`,
        [`[${vectors[i].join(",")}]`]
      );
      if (rows.length > 0 && rows[0].distance <= SIMILARITY_THRESHOLD) resolved.set(name, rows[0].name);
    } catch {
      // Leave the name unresolved; the merge falls back to string overlap.
    }
  }));

  return resolved;
}
