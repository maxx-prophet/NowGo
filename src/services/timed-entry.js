// One card per admission product, not one per timed-entry slot.
//
// Ticketmaster issues a separate event for every entry slot of a museum
// exhibition — Balloon Museum every 15 minutes, Banksy Museum every 30 — so
// two museums arrived as ~20 identical rows a day and were a quarter of the
// feed when this was measured (2026-08-21). They are not distinct events.
//
// A jazz room's two sets a night are distinct events, and the previous fix
// (dedupe.js) deliberately keeps one card per set, so this cannot key on
// venue and name alone. What separates the two is the cadence: entry slots
// come 15–30 minutes apart; the closest real multi-set night in the data is
// 105 minutes apart (Smoke, three sets). A run of three or more same-name,
// same-link starts with no gap over an hour is treated as one product.

const MIN_SLOTS = 3;
const MAX_GAP_MS = 60 * 60 * 1000;

const UNBUYABLE = new Set(["sold_out", "cancelled"]);

function productKey(event) {
  if (!event.venue_id || !event.name || !event.url || !event.start_time) return null;
  return `${event.venue_id}|${event.name}|${event.url}`;
}

function startMs(event) {
  return new Date(event.start_time).getTime();
}

// Split a product's slots (sorted) into runs where consecutive starts are
// within MAX_GAP_MS of each other.
function runsOf(slots) {
  const runs = [];
  let run = [];
  for (const slot of slots) {
    if (run.length && startMs(slot) - startMs(run[run.length - 1]) > MAX_GAP_MS) {
      runs.push(run);
      run = [];
    }
    run.push(slot);
  }
  if (run.length) runs.push(run);
  return runs;
}

function cardFor(run) {
  const representative = run.find(e => !UNBUYABLE.has(e.availability_tier)) ?? run[0];
  return {
    ...representative,
    showtimes: run.map(e => new Date(e.start_time).toISOString()),
    showtime_count: run.length,
  };
}

export function collapseTimedEntry(events) {
  if (!Array.isArray(events)) return events;

  const byProduct = new Map();
  for (const event of events) {
    const key = productKey(event);
    if (key === null) continue;
    if (!byProduct.has(key)) byProduct.set(key, []);
    byProduct.get(key).push(event);
  }

  // event -> the card that replaces it (or null for slots folded away)
  const replacement = new Map();
  for (const slots of byProduct.values()) {
    if (slots.length < MIN_SLOTS) continue;
    slots.sort((a, b) => startMs(a) - startMs(b));
    for (const run of runsOf(slots)) {
      if (run.length < MIN_SLOTS) continue;
      const card = cardFor(run);
      let placed = false;
      for (const slot of run) {
        replacement.set(slot, placed ? null : card);
        placed = true;
      }
    }
  }

  // Keep the input order; a card takes the place of the first slot seen.
  const out = [];
  for (const event of events) {
    if (!replacement.has(event)) { out.push(event); continue; }
    const card = replacement.get(event);
    if (card) out.push(card);
  }
  return out;
}
