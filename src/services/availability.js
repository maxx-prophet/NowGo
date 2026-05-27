import { Redis } from "@upstash/redis";
import fetch from "node-fetch";
import pool from "../../db/index.js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.nowgo" });

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const TD_USERNAME = process.env.TICKETSDATA_USERNAME;
const TD_PASSWORD = process.env.TICKETSDATA_PASSWORD;
const CACHE_TTL = 900; // 15 minutes
const DELAY_MS = 600;  // stay under TicketsData rate limits

// ─── TIER MAPPING ─────────────────────────────────────────────────────────────

function mapTier(body) {
  const offers = body?._embedded?.offer ?? body?.offers ?? [];
  const listings = body?.listings ?? body?.data ?? [];
  const count = (Array.isArray(offers) ? offers.length : 0)
              + (Array.isArray(listings) ? listings.length : 0);
  if (count > 3) return "available";
  if (count > 0) return "limited";
  return "sold_out";
}

// ─── TICKETSDATA API ──────────────────────────────────────────────────────────

async function fetchTier(eventUrl) {
  const url = new URL("https://ticketsdata.com/fetch");
  url.searchParams.set("username", TD_USERNAME);
  url.searchParams.set("password", TD_PASSWORD);
  url.searchParams.set("platform", "ticketmaster");
  url.searchParams.set("event_url", eventUrl);

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`TicketsData ${res.status}`);

  const data = await res.json();
  if (data.status && data.status !== 200) throw new Error(`TicketsData error: ${data.message ?? data.status}`);

  return mapTier(data.body ?? data);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── MAIN EXPORT ──────────────────────────────────────────────────────────────

export async function runAvailabilityCheck() {
  console.log("🎟  Availability check starting...");

  if (!TD_USERNAME || !TD_PASSWORD) {
    console.warn("  ⚠️  TICKETSDATA credentials missing — skipping");
    return;
  }

  const { rows: events } = await pool.query(`
    SELECT event_id, name, url
    FROM events
    WHERE is_free = false
      AND (url LIKE '%ticketmaster.com%' OR url LIKE '%ticketweb.com%')
      AND start_time >= now()
    ORDER BY start_time
  `);

  console.log(`  📋 ${events.length} ticketed events to check`);

  let hits = 0, checked = 0, errors = 0;

  for (const event of events) {
    const cacheKey = `avail:${event.event_id}`;

    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        hits++;
        continue;
      }

      const tier = await fetchTier(event.url);

      await redis.set(cacheKey, tier, { ex: CACHE_TTL });

      await pool.query(
        `UPDATE events SET availability_tier = $1, last_checked_at = now() WHERE event_id = $2`,
        [tier, event.event_id]
      );

      await pool.query(
        `INSERT INTO availability_snapshots (event_id, availability_tier) VALUES ($1, $2)`,
        [event.event_id, tier]
      );

      checked++;
      await sleep(DELAY_MS);
    } catch (err) {
      errors++;
      // Only overwrite if still in the default unknown state
      await pool.query(
        `UPDATE events SET availability_tier = 'unverified', last_checked_at = now()
         WHERE event_id = $1 AND availability_tier = 'unknown'`,
        [event.event_id]
      ).catch(() => {});
      console.warn(`  ⚠️  ${event.name}: ${err.message}`);
    }
  }

  console.log(`  🏁 Availability done — ${hits} cached, ${checked} checked, ${errors} errors`);
}
