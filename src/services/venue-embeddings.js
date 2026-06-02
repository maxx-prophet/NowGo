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
