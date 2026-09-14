// One card per set, however many sources list it.
//
// Blue Note, Birdland and Dizzy's are on Ticketmaster *and* on jazz-nyc.com,
// so on most nights the same 8pm set arrives twice: a ticketed row with a real
// buy link and a verified tier, and a jazz-nyc row with the venue homepage and
// tier "unknown". Nothing merged them, so the feed showed both — and because
// ranking rewards a known tier, the uncredited copy always sat above the
// credited one. That is how the jazz-nyc credit "disappeared" the week
// Ticketmaster's evening events came back (e4f2e3b).
//
// Keep the listing that is most useful to tap, and carry the credit over from
// any jazz-nyc row that was folded into it — the promise to jazz-nyc.com was
// visible credit on every listing that came from them, and this set did.

const CREDIT_FIELDS = ["source_name", "source_url"];

// Higher is better. A real per-event link beats the venue homepage jazz-nyc
// events carry; a verified tier beats "unknown"; a price is a tiebreak.
function usefulness(event) {
  let score = 0;
  if (event.source !== "jazz_nyc") score += 4;
  if (event.availability_tier && event.availability_tier !== "unknown") score += 2;
  if (event.price_min != null) score += 1;
  return score;
}

function setKey(event) {
  if (!event.venue_id || !event.start_time) return null;
  const t = event.start_time instanceof Date ? event.start_time.toISOString() : String(event.start_time);
  return `${event.venue_id}|${t}`;
}

export function dedupeListings(events) {
  if (!Array.isArray(events)) return events;

  const survivors = [];          // in first-appearance order
  const slotByKey = new Map();   // key -> index into survivors

  for (const event of events) {
    const key = setKey(event);
    if (key === null) { survivors.push(event); continue; }

    const slot = slotByKey.get(key);
    if (slot === undefined) {
      slotByKey.set(key, survivors.length);
      survivors.push(event);
      continue;
    }

    const current = survivors[slot];
    const [kept, folded] = usefulness(event) > usefulness(current) ? [event, current] : [current, event];
    survivors[slot] = withFoldedCredit(kept, folded);
  }

  return survivors;
}

function withFoldedCredit(kept, folded) {
  if (!folded.source_name || kept.source_name) return kept;
  const out = { ...kept };
  for (const f of CREDIT_FIELDS) if (folded[f] != null) out[f] = folded[f];
  return out;
}
