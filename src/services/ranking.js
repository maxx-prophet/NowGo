// Tier confidence scores — higher is better
const TIER_SCORE = { available: 3, scarce: 2, limited: 2, unknown: 1, sold_out: 0, cancelled: -99 };

// DB fetches this many events before JS ranking slices to the requested limit
export const RANKING_POOL = 200;

function scoreEvent(event, nowMs, budget) {
  let s = 0;

  // Availability confidence (0–9)
  s += (TIER_SCORE[event.availability_tier] ?? 1) * 3;

  // Sweet spot: event starts 30–90 min from now (peaks at 60 min)
  const minsUntil = (new Date(event.start_time).getTime() - nowMs) / 60000;
  if (minsUntil >= 30 && minsUntil <= 90) s += 4;
  else if (minsUntil > 0 && minsUntil < 30) s += 2;

  // Price match
  if (event.is_free) {
    s += 1;
  } else if (budget != null && event.price_min != null && parseFloat(event.price_min) <= budget) {
    s += 1;
  }

  return s;
}

export function rankEvents(events, { sort = "best_match", surpriseMe = false, budget = null, now = new Date() } = {}) {
  const nowMs = now.getTime();

  if (surpriseMe) {
    const VERIFIED = new Set(["available", "scarce"]);
    return events
      .filter(e => VERIFIED.has(e.availability_tier))
      .filter(e => {
        const mins = (new Date(e.start_time).getTime() - nowMs) / 60000;
        return mins >= 30 && mins <= 90;
      })
      .sort((a, b) => {
        const scoreDiff = scoreEvent(b, nowMs, budget) - scoreEvent(a, nowMs, budget);
        if (scoreDiff !== 0) return scoreDiff;
        return Math.random() - 0.5; // random tiebreak so same-score events vary each call
      })
      .slice(0, 5);
  }

  const sorted = [...events];

  switch (sort) {
    case "soonest":
      return sorted.sort((a, b) => new Date(a.start_time) - new Date(b.start_time));

    case "nearest":
      return sorted.sort((a, b) => (a.distance_m ?? Infinity) - (b.distance_m ?? Infinity));

    case "cheapest":
      return sorted.sort((a, b) => {
        if (a.is_free && !b.is_free) return -1;
        if (!a.is_free && b.is_free) return 1;
        const priceDiff = (a.price_min ?? Infinity) - (b.price_min ?? Infinity);
        if (priceDiff !== 0) return priceDiff;
        return new Date(a.start_time) - new Date(b.start_time);
      });

    case "surprise":
      return sorted.sort((a, b) => {
        const diff = (b.surprise_score ?? 0) - (a.surprise_score ?? 0);
        if (diff !== 0) return diff;
        return (a.distance_m ?? Infinity) - (b.distance_m ?? Infinity);
      });

    default: // best_match
      return sorted.sort((a, b) => scoreEvent(b, nowMs, budget) - scoreEvent(a, nowMs, budget));
  }
}
