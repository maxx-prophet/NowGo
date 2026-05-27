import pg from "pg";
import dotenv from "dotenv";
dotenv.config({ path: ".env.nowgo" });

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on("error", (err) => {
  console.error("pg pool error:", err.message);
});

export default pool;

