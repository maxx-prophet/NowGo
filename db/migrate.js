import { readFileSync, readdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import pool from "./index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function migrate() {
  const migrationsDir = join(__dirname, "migrations");
  const files = readdirSync(migrationsDir)
    .filter(f => f.endsWith(".sql"))
    .sort();

  console.log("Connecting to database...");
  const client = await pool.connect();

  try {
    for (const file of files) {
      console.log(`Running ${file}...`);
      const sql = readFileSync(join(migrationsDir, file), "utf8");
      await client.query(sql);
      console.log(`✓ ${file} complete`);
    }
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
