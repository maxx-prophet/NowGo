import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import pool from "./index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function migrate() {
  const sql = readFileSync(
    join(__dirname, "migrations/001_initial_schema.sql"),
    "utf8"
  );

  console.log("Connecting to database...");
  const client = await pool.connect();

  try {
    console.log("Running 001_initial_schema.sql...");
    await client.query(sql);
    console.log("Migration complete.");

    const { rows } = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    console.log("Tables:", rows.map((r) => r.table_name).join(", "));
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((err) => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});
