// ─── DoNYC × WHAT WE ALREADY HAVE ────────────────────────────────────────────
//
// DoNYC is a second opinion on the same city. Roughly a third of its listings
// are events Ticketmaster, SeatGeek or jazz-nyc.com already gave us; the rest
// are events nothing else carries. So every DoNYC event is one of:
//
//   matched — the same show as an existing row. It is NOT ingested (that would
//             be a second card for one show); instead it fills gaps on the
//             existing row: price, a real ticket link for a jazz-nyc listing,
//             a sold-out flag, a segment, the venue's address/coordinates.
//   unique  — ingested as its own `dn_` event.
//
// Matching is deliberately stricter than "same venue, same evening". A comedy
// club runs two rooms at 7pm and a jazz room runs two sets 90 minutes apart,
// and each of those is its own card. The rules below need either the same room
// at the same time with nothing else on there, or a recognisably similar title.
//
// Pure functions: the DB side is in donyc-ingest.js.

export const GENERIC_JAZZ_URL = "https://www.jazz-nyc.com";

const SAME_TIME_MIN = 15;     // two listings of one show rarely differ at all
const DOORS_SLACK_MIN = 120;  // doors vs show time, when the title also agrees
const NEAR_MILES = 0.15;      // ~250m: the same building, give or take geocoding

// ─── NAMES ───────────────────────────────────────────────────────────────────

function fold(s) {
  return String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function tokens(s, stop) {
  return fold(s).split(/[^a-z0-9]+/).filter((t) => t && !stop.has(t));
}

// Words that say nothing about which room it is. Deliberately short: "theater",
// "hall", "mainstage", "room", "upstairs" are NOT here, because Birdland and
// Birdland Theater are two rooms at one address (CLAUDE.md), and a word list
// that folded them together would merge their walk-in curation.
const VENUE_FILLER = new Set([
  "the", "and", "nyc", "new", "york", "ny", "jazz", "club", "bar", "lounge",
  "restaurant", "cafe", "brooklyn", "manhattan", "queens", "bk",
]);

// Same room under two labels: "Smalls" / "Smalls Jazz Club",
// "Jazz Gallery (The)" / "The Jazz Gallery", "Mercury Lounge - New York".
// Not: "Birdland" / "Birdland Theater", "Eris" / "Eris Mainstage".
export function sameVenueName(a, b) {
  const ta = new Set(tokens(a, VENUE_FILLER));
  const tb = new Set(tokens(b, VENUE_FILLER));
  if (ta.size === 0 || tb.size === 0) return fold(a).replace(/[^a-z0-9]/g, "") === fold(b).replace(/[^a-z0-9]/g, "");
  if (ta.size !== tb.size) return false;
  for (const t of ta) if (!tb.has(t)) return false;
  return true;
}

const TITLE_STOP = new Set([
  "the", "a", "an", "and", "of", "in", "at", "on", "with", "w", "feat", "featuring",
  "ft", "presents", "present", "live", "tour", "tickets", "ticket", "show", "nyc",
  "new", "york", "night", "evening", "special", "guest", "guests", "plus", "more",
  "s", "vs", "x",
]);

function titleOverlap(a, b) {
  const ta = new Set(tokens(a, TITLE_STOP).filter((t) => t.length > 1));
  const tb = new Set(tokens(b, TITLE_STOP).filter((t) => t.length > 1));
  if (ta.size === 0 || tb.size === 0) return { sim: 0, shared: 0 };
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return { sim: shared / Math.min(ta.size, tb.size), shared };
}

// Overlap coefficient on meaningful words: "LCD Soundsystem" vs
// "LCD Soundsystem w/ special guest Jarvis" is 1.0. One shared word out of a
// one-word title counts, so this is only ever used together with time and
// venue agreement, never alone.
export function titleSimilarity(a, b) {
  return titleOverlap(a, b).sim;
}

const SIMILAR = 0.5;
// When the two venues cannot be compared at all (no coordinates on one side
// and different labels), a single shared word is not enough: "Fiction Book
// Group" at a Brooklyn bar shares "book" with The Book of Mormon at 7pm.
const SIMILAR_BLIND = 0.8;
const SHARED_BLIND = 2;

function milesBetween(a, b) {
  if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) return null;
  const toRad = (d) => (Number(d) * Math.PI) / 180;
  const dLat = toRad(b.lat) - toRad(a.lat);
  const dLng = toRad(b.lng) - toRad(a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(h));
}

// ─── VENUES ──────────────────────────────────────────────────────────────────

// The existing venue a DoNYC label refers to, or null for a new venue.
// Requires the names to agree (sameVenueName), and the coordinates too when
// both sides have them — sharing an address alone is never enough.
export function resolveVenue(dnEvent, venues) {
  let best = null;
  for (const v of venues) {
    if (!sameVenueName(dnEvent.venue, v.name)) continue;
    const d = milesBetween(dnEvent, { lat: v.geo_lat, lng: v.geo_lng });
    if (d != null && d > NEAR_MILES) continue;
    // An exact (case-insensitive) name beats a filler-word match.
    const exact = fold(v.name) === fold(dnEvent.venue);
    if (!best || (exact && !best.exact)) best = { venue: v, exact };
  }
  return best?.venue ?? null;
}

// ─── EVENTS ──────────────────────────────────────────────────────────────────

const minutesApart = (a, b) => Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 60000;

// `dn.startTime` is an ISO instant; `existing` rows are DB rows: start_time,
// name, venue_id, venue_name, geo_lat, geo_lng.
export function findMatch(dn, existing, venueId = null) {
  const sameRoom = (x) => (venueId && x.venue_id === venueId) || sameVenueName(dn.venue, x.venue_name);

  let best = null;
  const consider = (x, score) => { if (!best || score > best.score) best = { row: x, score }; };

  const roomAtTime = existing.filter((x) => sameRoom(x) && minutesApart(dn.startTime, x.start_time) <= SAME_TIME_MIN);

  for (const x of existing) {
    const dt = minutesApart(dn.startTime, x.start_time);
    if (dt > DOORS_SLACK_MIN) continue;
    const room = sameRoom(x);
    const { sim, shared } = titleOverlap(dn.name, x.name);
    const near = milesBetween(dn, { lat: x.geo_lat, lng: x.geo_lng });

    // Same room, same time, and it is the only thing on there.
    if (room && dt <= SAME_TIME_MIN && (sim >= SIMILAR || roomAtTime.length === 1)) {
      consider(x, 3 + sim - dt / 60);
    // Same show, the venue just labelled differently (DoNYC files Mezzrow's
    // sets under "Smalls Jazz Club", Dizzy's under "Jazz at Lincoln Center").
    // Needs the buildings to agree; if they cannot be compared, a much closer
    // title.
    } else if (sim >= SIMILAR && dt <= SAME_TIME_MIN && (room || (near != null && near <= NEAR_MILES))) {
      consider(x, 2 + sim - dt / 60);
    } else if (near == null && sim >= SIMILAR_BLIND && shared >= SHARED_BLIND && dt <= SAME_TIME_MIN) {
      consider(x, 2 + sim - dt / 60);
    // A distinctive title is evidence on its own, whatever the venue label
    // says. DoNYC files Jazzcultural's sets under "Smalls Jazz Club", half an
    // hour off; "Il Volo" sits at "Theater at Madison Square Garden" against
    // Ticketmaster's "Infosys Theater". Several shared words are required, so
    // "Solo" or "Happy Hour Jazz" can never qualify.
    } else if ((sim >= SIMILAR_BLIND && shared >= 3) || (sim === 1 && shared >= 2 && dt <= SAME_TIME_MIN)) {
      consider(x, 1.5 + sim - dt / 600);
    // Same room and title, but one source gives doors and the other the show.
    } else if (room && sim >= SIMILAR) {
      consider(x, 1 + sim - dt / 600);
    }
  }
  return best?.row ?? null;
}

// What a matched DoNYC event can add to the row it matched. Only ever fills a
// blank — a source that already said something is not overruled — with one
// exception: an explicit sold-out flag beats "unknown".
export function fillsFor(dn, x) {
  const fills = {};
  if (x.price_min == null && dn.priceMin != null) {
    fills.price_min = dn.priceMin;
    fills.price_max = dn.priceMax;
    if (dn.isFree && !x.is_free) fills.is_free = true;
  }
  const realDnUrl = dn.url && dn.url !== dn.donycUrl ? dn.url : null;
  if (realDnUrl && (!x.url || x.url === GENERIC_JAZZ_URL)) fills.url = realDnUrl;
  if ((x.availability_tier ?? "unknown") === "unknown" && dn.availabilityTier === "sold_out") {
    fills.availability_tier = "sold_out";
  }
  if ((!x.segment || x.segment === "Undefined" || x.segment === "Other") && dn.segment) fills.segment = dn.segment;
  if (!x.genre && dn.genre) fills.genre = dn.genre;
  return fills;
}

export function venueFillsFor(dn, x) {
  const fills = {};
  if (!x.address && dn.address) fills.address = dn.address;
  if ((x.geo_lat == null || x.geo_lng == null) && dn.lat != null && dn.lng != null) {
    fills.geo_lat = dn.lat;
    fills.geo_lng = dn.lng;
  }
  if (!x.website && dn.venueUrl) fills.website = dn.venueUrl;
  return fills;
}

// Splits DoNYC events into the ones to ingest and the ones that matched.
// `existing`: non-DoNYC events in the window, joined to their venue.
// `venues`:   every venue row (name, geo, address, website).
export function matchDoNYC(dnEvents, existing, venues) {
  const unique = [];
  const matched = [];
  let venuesResolved = 0;

  for (const raw of dnEvents) {
    const venue = resolveVenue(raw, venues);
    // Land on the existing venue row, so its walk-in curation applies.
    const dn = venue && venue.name !== raw.venue ? { ...raw, venue: venue.name } : raw;
    if (venue && venue.name !== raw.venue) venuesResolved++;

    const x = findMatch(dn, existing, venue?.venue_id ?? null);
    if (x) {
      matched.push({ dn, row: x, fills: fillsFor(dn, x), venueFills: venueFillsFor(dn, x) });
    } else {
      unique.push(dn);
    }
  }
  return { unique, matched, venuesResolved };
}
