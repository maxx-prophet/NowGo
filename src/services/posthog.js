import { PostHog } from "posthog-node";
import dotenv from "dotenv";
dotenv.config({ path: ".env.nowgo" });

// Server-side PostHog, for events the pipeline emits about itself. The app
// has its own client (mobile/src/config/posthog.ts) and the same project key.
// Without POSTHOG_KEY this is a no-op that says so once, not a crash — the
// pipeline must run without analytics.
let client;
let warned = false;

function posthog() {
  if (client !== undefined) return client;
  const key = process.env.POSTHOG_KEY;
  if (!key) {
    if (!warned) {
      console.warn("  ⚠️  POSTHOG_KEY missing — pipeline health events are not being sent");
      warned = true;
    }
    client = null;
    return client;
  }
  client = new PostHog(key, {
    host: process.env.POSTHOG_HOST || "https://us.i.posthog.com",
    flushAt: 1,
    flushInterval: 0,
  });
  return client;
}

// Fire-and-flush: the pipeline runs a few times a day and exits nothing, so
// there is no long-lived queue worth batching into.
export async function captureServerEvent(event, properties = {}) {
  const ph = posthog();
  if (!ph) return false;
  try {
    ph.capture({ distinctId: "nowgo-pipeline", event, properties });
    await ph.flush();
    return true;
  } catch (err) {
    console.warn(`  ⚠️  PostHog capture failed for ${event}: ${err.message}`);
    return false;
  }
}
