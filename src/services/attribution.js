// Credit for a listing source the user never otherwise sees.
//
// Ticketmaster and SeatGeek events link straight to ticketmaster.com and
// seatgeek.com, so the link is the attribution — a credit line would just be
// saying twice what the button already says.
//
// jazz-nyc.com is the exception, and the reason this file exists. It publishes
// no per-event links, so EVENT_URL_SQL in src/server.js substitutes the
// venue's own website (see the jazz-nyc notes in CLAUDE.md). The result is
// that its listings are the backbone of the jazz feed while nothing on screen
// says where they came from and no tap ever reaches the site. This puts the
// credit back and makes it tappable.
//
// Keyed by events.source — the same values the fetchers write and the sources
// table holds: 'ticketmaster', 'seatgeek', 'jazz_nyc'.
export const SOURCE_ATTRIBUTION = {
  jazz_nyc: { name: "Jazz NYC", url: "https://jazz-nyc.com" },
};

export function attributionFor(source) {
  return SOURCE_ATTRIBUTION[source] ?? null;
}

// Adds source_name / source_url to an event that needs crediting, and returns
// everything else untouched — including null and undefined, so callers can map
// over query rows without guarding first.
export function withAttribution(event) {
  if (!event) return event;
  const credit = attributionFor(event.source);
  if (!credit) return event;
  return { ...event, source_name: credit.name, source_url: credit.url };
}

export function withAttributionAll(events) {
  return Array.isArray(events) ? events.map(withAttribution) : events;
}
